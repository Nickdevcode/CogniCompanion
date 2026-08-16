/**
 * api/plano-de-material.mjs — O material da escola → proposta de plano de estudo.
 *
 * (Nasceu `plano-de-imagem.mjs`, quando o único material aceito era foto.)
 *
 * Esta é a ÚNICA parte do Companion que roda fora do navegador. Ela existe aqui, e
 * não no servidor local da Cogni, por uma razão que decide a feature inteira: o
 * servidor da Cogni é `127.0.0.1:3000` — do celular do pai, na fila da escola, ele
 * simplesmente não existe. Rodar lá mataria a feature exatamente no cenário pra que
 * ela foi feita.
 *
 * A Vercel transforma `api/*.mjs` em Serverless Function mesmo num site 100%
 * estático. `.mjs` de propósito (dispensa `package.json` na raiz) e ZERO dependência
 * npm: `fetch`, `FormData` e `Blob` nativos. O site continua estático + 1 função.
 * (`_lib/` começa com `_`, então a Vercel ignora e nada de lá vira rota.)
 *
 * ⚠️ ELA NÃO ESCREVE NO BANCO. Devolve a proposta; quem grava é o site, com a sessão
 * do pai. A RLS continua sendo a única guardiã da escrita.
 *
 * 🔒 O MATERIAL NÃO É GUARDADO em lugar nenhum — nem Storage, nem base64 no banco,
 * nem log. Ele é lido, vira `extraido_texto` + tarefas, e é descartado. Vale pra
 * foto, PDF, Word, slides, planilha, áudio e vídeo: é material de menor de idade, e
 * o dado que sobra é o mínimo necessário pro pai auditar o que a IA entendeu.
 *
 * ⭐ 16/ago/2026 — **o material virou opcional.** O responsável pode simplesmente
 * escrever o que quer que a criança estude (`pedido`), com ou sem material junto. A
 * escola não é a única a ter plano pra criança, e a mãe que sabe o que a filha
 * precisa treinar não tinha por onde dizer isso. Regras do prompt por modo em
 * `_lib/prompt.mjs`.
 *
 * Contrato (docs/COMPANION-PLANO-TECNICO.md → "📎 Rodada 2"):
 *   POST /api/plano-de-material
 *     headers: Authorization: Bearer <supabase access_token>
 *     body: { hoje: "2026-08-16", pedido: "revisar a tabuada do 7", itens: [
 *       { tipo:"imagem", nome, dados:"data:image/jpeg;base64,…" },
 *       { tipo:"pdf",    nome, dados:"data:application/pdf;base64,…" },
 *       { tipo:"texto",  nome, formato:"docx"|"pptx"|"xlsx"|"txt", texto:"…" },
 *       { tipo:"audio",  nome, mime, dados:"data:audio/webm;base64,…", duracao_s } ] }
 *       (`itens` pode vir vazio se houver `pedido`, e vice-versa — os dois vazios = 400)
 *     → 200 { legivel, titulo, conteudo, foco, duracao_dias, extraido_texto,
 *             truncado, aviso, tarefas: [{ titulo, detalhe, materia, prazo,
 *             estimativa_min, confianca }] }
 *     → 200 { legivel: false, motivo: "…" }  ← material ruim NÃO é erro HTTP
 *     → 400 forma · 401 sem sessão · 403 sem criança · 405 método · 413 tamanho
 *     → 415 content-type · 429 cota do dia · 502 IA fora · 503 função sem env vars
 *
 * A função conhece QUATRO tipos. **Vídeo não é um deles**, e isso é de propósito:
 * quem decompõe o vídeo em quadros + trilha é o navegador (`js/dashboard/material/
 * video.js`). O dia em que aceitarmos GIF ou gravação de tela não muda uma linha aqui.
 *
 * ⭐ 16/ago/2026 (rodada 3) — **link também não é um tipo daqui.** Uma videoaula do
 * YouTube ou uma página da web viram texto em `/api/ler-link` e chegam como
 * `{tipo:"texto", formato:"youtube"|"web"}`. O que muda nesta função é só o MODO do
 * prompt: link é EXPLICAÇÃO, não lição atribuída (ver `regrasDaFonte` em `_lib/prompt`).
 */

import { responder, ErroHttp } from "./_lib/http.mjs";
import { validarSessao, criancaPareada, dentroDaCota } from "./_lib/auth.mjs";
import { validarCorpo } from "./_lib/itens.mjs";
import { transcrever, lerMaterial, FalhaSuave } from "./_lib/openai.mjs";
import { ehItemDeLink } from "./_lib/prompt.mjs";
import { sanear } from "./_lib/sanear.mjs";

export default async function handler(req, res) {
  /* Trava 1 — só POST. */
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return responder(res, 405, { erro: "Use POST." });
  }

  const { OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return responder(res, 503, {
      erro: "A leitura de material está desligada no servidor. Avise o responsável pelo site.",
    });
  }
  const env = { SUPABASE_URL, SUPABASE_ANON_KEY };

  try {
    /**
     * A ordem das travas segue uma regra: **400/413/415 são propriedades da
     * REQUISIÇÃO; 403/429 são propriedades da IDENTIDADE.** Antes elas estavam
     * misturadas, e um material grande demais pagava três idas ao Supabase antes de
     * tomar 413. O JWT continua primeiro — nada de trabalho pra quem não está logado.
     */

    /* Trava 2 — quem é o pai (validado no servidor, nunca no corpo). */
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    const uid = await validarSessao(token, env);

    /* A forma do corpo. */
    const tipo = String(req.headers["content-type"] || "");
    if (!tipo.includes("application/json")) {
      // Sem isto, `req.body` viraria Buffer e `corpo.itens` sairia `undefined` — o
      // pai receberia "mande pelo menos um material" pra um problema de cabeçalho.
      throw new ErroHttp(415, "Mande o material como JSON.");
    }

    let corpo;
    try {
      // `req.body` é um getter que LANÇA com JSON malformado (comportamento
      // documentado da Vercel), então o try precisa envolver só a leitura.
      corpo = req.body;
    } catch (err) {
      throw new ErroHttp(400, "Corpo da requisição inválido.");
    }

    /* Trava 5 — forma e tamanho de cada item, e do corpo inteiro. */
    const { itens, hoje, pedido } = validarCorpo(corpo);

    /* Trava 3 — tem criança pareada? (a RLS é quem responde) */
    const crianca = await criancaPareada(token, uid, env);

    /* Trava 4 — cota do dia. */
    await dentroDaCota(token, crianca.id, env);

    /**
     * Áudio é transcrito ANTES e entra no MESMO pipeline de texto — um caminho só,
     * um schema só. É por isso que a função de chat nunca vê áudio.
     */
    const prontos = [];
    for (const item of itens) {
      if (item.tipo !== "audio") {
        prontos.push(item);
        continue;
      }
      const texto = (await transcrever(OPENAI_API_KEY, item, crianca)).trim();
      if (!texto) continue; // áudio mudo: some do lote em vez de virar bloco vazio
      prontos.push({
        tipo: "texto",
        nome: item.nome,
        formato: "transcricao",
        texto,
      });
    }

    /**
     * O áudio emudeceu tudo que havia. Com pedido escrito ainda dá pra montar o
     * plano — e o pai precisa saber que o áudio dele não entrou, senão ele acha que
     * a Cogni ouviu e discordou.
     */
    if (!prontos.length && !pedido) {
      return responder(res, 200, {
        legivel: false,
        motivo:
          "Não ouvi nada nesse áudio. Grave mais perto de quem está falando, num lugar mais silencioso.",
      });
    }
    const audioMudo = itens.length > 0 && !prontos.length;

    const { cru, aviso } = await lerMaterial(OPENAI_API_KEY, {
      itens: prontos,
      hoje,
      crianca,
      pedido,
    });

    /**
     * Link não é material da escola — e a distinção decide os textos-padrão do
     * `sanear` exatamente como decide o modo do prompt. Um plano que nasceu de uma
     * videoaula e deu errado não pode responder "tente com a folha inteira no quadro".
     */
    const links = prontos.filter(ehItemDeLink).length;
    return responder(
      res,
      200,
      sanear(cru, {
        aviso:
          aviso ||
          (audioMudo
            ? "Não ouvi nada no áudio, então montei o plano só com o que você escreveu."
            : null),
        temMaterial: prontos.length - links > 0,
        temLink: links > 0,
      })
    );
  } catch (err) {
    if (err instanceof ErroHttp) {
      return responder(res, err.status, { erro: err.message });
    }
    /**
     * Material ruim não é erro de servidor: vira 200 com `legivel:false` e um motivo
     * que diz o que fazer diferente. Um 502 faria o pai tentar de novo igual.
     */
    if (err instanceof FalhaSuave) {
      return responder(res, 200, { legivel: false, motivo: err.message });
    }

    /**
     * Trava 6 — a mensagem da OpenAI NUNCA sai daqui. Ela pode conter trecho do
     * prompt, nome de modelo, detalhe de cota e, num 400 de conteúdo, pedaço do que
     * estava escrito no caderno da criança.
     */
    console.error("[plano-de-material] Leitura falhou:", err);
    return responder(res, 502, {
      erro: "Não consegui ler o material agora. Tente de novo em instantes.",
    });
  }
}
