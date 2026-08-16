/**
 * api/melhorar-texto.mjs — O ✨ que mora DENTRO do campo de texto.
 *
 * A IA da Mesa era tudo ou nada: ou o pai usava "Criar com a Cogni" e recebia um
 * plano inteiro, ou clicava em "Escrever eu mesmo" e ficava **sozinho com um
 * `<textarea>` em branco**. Quem quer escrever o próprio plano perdia a IA
 * exatamente onde ela mais ajudaria — transformar *"revisar aquilo de fração que ela
 * errou na prova"* num texto que a Cogni consegue seguir. Mesma coisa no formulário
 * de card do quadro, que é digitação pura.
 *
 * Esta função existe pela mesma razão das outras duas de `api/`: a chave da OpenAI
 * não pode viver no navegador. É a **terceira e menor** delas — uma frase entra, uma
 * frase sai.
 *
 * ⚠️ ELA NÃO ESCREVE NO BANCO, e não muda a `origem` de nada. Plano digitado à mão
 * com o título polido aqui continua `manual`: `origem` diz de onde o plano NASCEU,
 * não quem passou o corretor. Marcar `pedido` faria a tela exibir "criado a partir do
 * que você pediu" sobre um plano que o pai escreveu inteiro.
 *
 * 🔒 O texto não é guardado em lugar nenhum — nem log. Ele vai, volta e some; o que
 * sobra é o que o pai salvar no formulário, com a sessão dele.
 *
 * Contrato (docs/COMPANION-PLANO-TECNICO.md → "🧮 Rodada 4"):
 *   POST /api/melhorar-texto
 *     headers: Authorization: Bearer <supabase access_token>
 *     body: { campo: "plano.titulo"|"plano.conteudo"|"tarefa.titulo"|"tarefa.detalhe",
 *             acao:  "gerar"|"melhorar"|"encurtar"|"detalhar",
 *             texto: "…",
 *             contexto: { tituloDoPlano, conteudoDoPlano, foco, tituloDaTarefa,
 *                         materia, cards: [], idade, serie } }
 *     → 200 { ok: true,  texto: "Frações pra prova de sexta" }
 *     → 200 { ok: false, motivo: "sem_contexto" }  ← não dá pra gerar do nada
 *     → 400 forma · 401 sem sessão · 403 sem criança pareada · 405 método
 *     → 415 content-type · 429 limite · 502 IA fora · 503 função sem env vars
 */

import { responder, ErroHttp } from "./_lib/http.mjs";
import { validarSessao, criancaPareada, dentroDoLimiteDeTexto } from "./_lib/auth.mjs";
import { criarChat, MODELO } from "./_lib/openai.mjs";
import { cortarSemPartirPalavra, descascarTexto } from "./_lib/sanear.mjs";
import {
  CAMPOS,
  ACOES_VALIDAS,
  MAX_ENTRADA,
  normalizarContexto,
  temFonte,
  promptDeTexto,
} from "./_lib/melhorar.mjs";

/**
 * Teto de saída.
 *
 * O maior campo tem 600 caracteres (~200 tokens), mas num modelo de raciocínio o
 * pensamento sai do MESMO orçamento — e um teto apertado devolve string vazia em vez
 * de texto curto. 1 200 dá folga confortável e continua sendo uma chamada barata.
 */
const MAX_TOKENS_SAIDA = 1_200;

/**
 * Teto de espera.
 *
 * Bem menor que os 45 s da leitura de material, e o motivo é a diferença entre as
 * duas telas: lá o pai mandou um PDF e está esperando um plano; aqui ele está com o
 * cursor no campo. Passou disso, uma mensagem é melhor que um spinner.
 */
const TIMEOUT_MS = 20_000;

export default async function handler(req, res) {
  /* Trava 1 — só POST. */
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return responder(res, 405, { erro: "Use POST." });
  }

  const { OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return responder(res, 503, {
      erro: "A escrita com a Cogni está desligada no servidor. Avise o responsável pelo site.",
    });
  }
  const env = { SUPABASE_URL, SUPABASE_ANON_KEY };

  try {
    /* Trava 2 — quem é o pai (validado no servidor, nunca no corpo). */
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    const uid = await validarSessao(token, env);

    /* A forma do corpo. */
    if (!String(req.headers["content-type"] || "").includes("application/json")) {
      throw new ErroHttp(415, "Mande o texto como JSON.");
    }

    let corpo;
    try {
      // `req.body` é um getter que LANÇA com JSON malformado (documentado da Vercel).
      corpo = req.body;
    } catch {
      throw new ErroHttp(400, "Corpo da requisição inválido.");
    }

    const campo = String(corpo?.campo || "");
    const acao = String(corpo?.acao || "");
    const def = CAMPOS[campo];
    if (!def) throw new ErroHttp(400, "Campo desconhecido.");
    if (!ACOES_VALIDAS.includes(acao)) throw new ErroHttp(400, "Ação desconhecida.");
    // Encurtar um TÍTULO de 80 caracteres não é ação, é ruído: cada campo declara o
    // que aceita, e o que não está na lista é erro de quem chamou.
    if (!def.acoes.includes(acao)) {
      throw new ErroHttp(400, "Essa ação não vale pra este campo.");
    }

    if (corpo?.texto != null && typeof corpo.texto !== "string") {
      throw new ErroHttp(400, "O texto tem que ser uma string.");
    }
    const texto = String(corpo?.texto || "").slice(0, MAX_ENTRADA).trim();
    // Reescrever exige o que reescrever. Só `gerar` sobrevive ao campo vazio — e
    // ainda assim depende de contexto (`temFonte`, logo abaixo).
    if (!texto && acao !== "gerar") {
      throw new ErroHttp(400, "Escreva alguma coisa antes de pedir pra melhorar.");
    }

    const contexto = normalizarContexto(corpo?.contexto);

    /* Trava 3 — tem criança pareada? (quem responde é a RLS) */
    const crianca = await criancaPareada(token, uid, env);

    /**
     * A criança do banco manda no contexto: `idade` e `serie` decidem o TOM do texto,
     * e o cliente não precisa (nem deve) ser a fonte disso. O que ele mandou vale só
     * como reserva, pro caso de o perfil ainda não ter esses campos preenchidos.
     */
    contexto.idade = Number(crianca.idade) || contexto.idade;
    contexto.serie = crianca.serie || contexto.serie;

    /**
     * 🔴 "Não dá pra gerar do nada" é resposta 200, não erro.
     *
     * Um 400 aqui faria a tela mostrar erro depois do clique — que é exatamente o
     * que esta feature promete não fazer. O botão já nasce desabilitado pela mesma
     * regra; isto é a rede de baixo, pro caso de a tela e a função discordarem.
     *
     * Vem ANTES do teto por hora de propósito: o teto conta chamadas de IA, e esta
     * não chega a ser uma. Gastar um ponto do pai por uma resposta que a função
     * respondeu sozinha seria cobrar por trabalho que ninguém fez.
     */
    if (!temFonte(campo, texto, contexto)) {
      return responder(res, 200, { ok: false, motivo: "sem_contexto" });
    }

    /* Trava 4-B — o teto por hora deste endpoint. */
    dentroDoLimiteDeTexto(uid);

    const { sistema, usuario } = promptDeTexto({ campo, acao, texto, contexto });
    const { conteudo } = await criarChat(OPENAI_API_KEY, {
      modelo: MODELO,
      mensagens: [
        { role: "system", content: sistema },
        { role: "user", content: usuario },
      ],
      maxTokens: MAX_TOKENS_SAIDA,
      /**
       * Isto é um BOTÃO, não um pipeline: o pai está olhando o campo esperando.
       * Raciocínio alto aqui compra latência e não compra qualidade de redação.
       */
      esforco: "low",
      timeoutMs: TIMEOUT_MS,
    });

    /**
     * 🔴 O corte é DAQUI, não do `maxlength`.
     *
     * Se a IA devolver 300 caracteres num campo de 80, o atributo do `<input>` corta
     * em silêncio e o pai vê uma frase mutilada que ele lê como defeito do site. Aqui
     * o corte respeita a palavra — e o `descascarTexto` tira antes as aspas e o
     * "Aqui está:" que modelo pequeno adora pôr em volta.
     */
    const limpo = cortarSemPartirPalavra(descascarTexto(conteudo), def.teto);

    /**
     * Resposta vazia (ou que virou vazia depois de descascada) não é 200 mentiroso:
     * devolver `texto: ""` apagaria o que o pai escreveu — o pior resultado possível
     * numa feature cuja regra número 1 é não fazer ele perder o próprio texto.
     */
    if (!limpo) {
      console.warn("[melhorar-texto] A IA devolveu vazio para", campo, acao);
      throw new ErroHttp(502, "Não consegui escrever isso agora. Tente de novo em instantes.");
    }

    return responder(res, 200, { ok: true, texto: limpo });
  } catch (err) {
    if (err instanceof ErroHttp) {
      return responder(res, err.status, { erro: err.message });
    }

    /**
     * A mensagem da OpenAI NUNCA sai daqui: ela pode conter trecho do prompt, nome de
     * modelo, detalhe de cota e — num 400 de conteúdo — pedaço do que o pai escreveu
     * sobre a criança dele.
     */
    console.error("[melhorar-texto] Falhou:", err);
    return responder(res, 502, {
      erro: "Não consegui escrever isso agora. Tente de novo em instantes.",
    });
  }
}
