/**
 * api/plano-de-imagem.mjs — Foto da agenda/atividade → proposta de plano de estudo.
 *
 * Esta é a ÚNICA parte do Companion que roda fora do navegador. Ela existe aqui, e
 * não no servidor local da Cogni, por uma razão que decide a feature inteira: o
 * servidor da Cogni é `127.0.0.1:3000` — do celular do pai, na fila da escola, ele
 * simplesmente não existe. Rodar lá mataria a feature exatamente no cenário pra que
 * ela foi feita.
 *
 * A Vercel transforma `api/*.mjs` em Serverless Function mesmo num site 100%
 * estático. `.mjs` de propósito (dispensa `package.json` na raiz) e ZERO dependência
 * npm: `fetch` nativo pra OpenAI e pra API REST do Supabase. O site continua estático
 * + 1 função.
 *
 * ⚠️ ELA NÃO ESCREVE NO BANCO. Devolve a proposta; quem grava é o site, com a sessão
 * do pai. A RLS continua sendo a única guardiã da escrita.
 *
 * 🔒 A foto NÃO é guardada em lugar nenhum — nem Storage, nem base64 no banco. Ela é
 * lida, vira `extraido_texto` + tarefas, e é descartada. É foto de caderno de menor:
 * o dado que sobra é o mínimo necessário pro pai auditar o que a IA entendeu.
 *
 * Contrato (docs/COMPANION-PLANO-TECNICO.md → "🧩 Mesa de Estudos"):
 *   POST /api/plano-de-imagem
 *     headers: Authorization: Bearer <supabase access_token>
 *     body: { imagens: ["data:image/jpeg;base64,…"], hoje: "2026-08-15" }
 *     → 200 { titulo, conteudo, foco, duracao_dias, extraido_texto, legivel,
 *             tarefas: [{ titulo, detalhe, materia, prazo, estimativa_min, confianca }] }
 *     → 200 { legivel: false, motivo: "…" }   ← foto ruim NÃO é erro HTTP
 *     → 401 sem sessão · 403 sem criança · 405 método · 413 imagem grande
 *     → 429 cota do dia · 502 IA fora · 503 função sem env vars
 */

/* ==========================================================================
   Configuração
   ========================================================================== */

/**
 * O mesmo modelo que o robô usa (`CHAT_MODEL` em `Cogni/server/config.js`).
 * É um modelo de RACIOCÍNIO: usa `max_completion_tokens` (não `max_tokens`) e não
 * aceita `temperature`. Ver `Cogni/server/modules/brain/openai.js`, que centraliza
 * essa diferença do lado do robô.
 */
const MODELO = "gpt-5.4-mini";

/** Teto de imagens por geração. Mais que isso não é uma atividade, é um livro. */
const MAX_IMAGENS = 3;

/**
 * Teto por imagem, já em base64 (~1,5 MB). O `captura.js` redimensiona pra 1600px
 * / JPEG 0.82 antes de subir, o que dá ~200-400 KB — a folga aqui é pra foto de
 * documento muito detalhada, não pra foto crua de celular.
 *
 * ⚠️ A Vercel corta o corpo em 4,5 MB ANTES do nosso código rodar
 * (FUNCTION_PAYLOAD_TOO_LARGE). Por isso o redimensionamento no cliente é
 * obrigatório, não otimização: sem ele a função nem é chamada.
 */
const MAX_BYTES_IMAGEM = 1_500_000;

/** Mimes aceitos. Nada de HEIC: o canvas do navegador já entrega JPEG. */
const MIMES = ["image/jpeg", "image/png", "image/webp"];

/** Cota diária de geração por criança. Rate limit sem KV e sem tabela nova. */
const MAX_POR_DIA = 20;

/** Teto de espera da OpenAI. Visão com `detail: high` em 3 páginas é lenta. */
const TIMEOUT_IA_MS = 45_000;

/** Teto de espera do Supabase (auth + REST). Rápido ou nada. */
const TIMEOUT_SUPABASE_MS = 8_000;

/** As 14 matérias canônicas. Mesma lista de `js/dashboard/format.js`. */
const MATERIAS = [
  "portugues",
  "matematica",
  "ciencias",
  "fisica",
  "quimica",
  "biologia",
  "historia",
  "geografia",
  "filosofia",
  "sociologia",
  "idiomas",
  "artes",
  "educacao_fisica",
  "outros",
];

/** Limites de texto do contrato (`plano_tarefas` / `planos_estudo`). */
const LIM = { titulo: 80, conteudo: 600, tarefaTitulo: 120, detalhe: 240, extraido: 4000 };

/** Teto de tarefas numa proposta. Uma folha de lição real tem 5-15 questões. */
const MAX_TAREFAS = 20;

/* ==========================================================================
   Utilidades
   ========================================================================== */

/** Resposta JSON curta. Toda saída da função passa por aqui. */
function responder(res, status, corpo) {
  res.status(status).json(corpo);
}

/**
 * `fetch` com teto de tempo. Sem isto, um Supabase lento seguraria a função até o
 * limite da plataforma e o pai ficaria olhando um spinner sem fim.
 */
async function buscar(url, opcoes = {}, ms = TIMEOUT_SUPABASE_MS) {
  return fetch(url, { ...opcoes, signal: AbortSignal.timeout(ms) });
}

/** Corta uma string no limite, sem quebrar no meio de um espaço à toa. */
function cortar(valor, max) {
  if (typeof valor !== "string") return "";
  const t = valor.trim();
  return t.length <= max ? t : t.slice(0, max).trimEnd();
}

/** Número dentro da faixa, ou `null` se não for número. */
function grampear(valor, min, max) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

/* ==========================================================================
   Validação do corpo
   ========================================================================== */

/**
 * Confere as imagens recebidas. Devolve `{ erro, status }` ou `{ imagens }`.
 *
 * O prefixo `data:` é validado por regex ANCORADA: aceitar qualquer coisa antes do
 * `;base64,` deixaria passar um `data:text/html` que a OpenAI recusaria com um erro
 * que não diz nada pro pai.
 */
function validarImagens(bruto) {
  if (!Array.isArray(bruto) || bruto.length === 0) {
    return { status: 400, erro: "Mande pelo menos uma imagem." };
  }
  if (bruto.length > MAX_IMAGENS) {
    return { status: 413, erro: `No máximo ${MAX_IMAGENS} imagens por vez.` };
  }

  const imagens = [];
  for (const item of bruto) {
    if (typeof item !== "string") {
      return { status: 400, erro: "Formato de imagem inválido." };
    }
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(item);
    if (!m || !MIMES.includes(m[1])) {
      return { status: 413, erro: "Use uma foto JPEG, PNG ou WEBP." };
    }
    // Comprimento do base64 ≈ o que trafega. Comparar aqui (e não os bytes
    // decodificados) é o número que de fato pesa no limite da plataforma.
    if (m[2].length > MAX_BYTES_IMAGEM) {
      return { status: 413, erro: "A foto ficou grande demais. Tente de novo." };
    }
    imagens.push(item);
  }
  return { imagens };
}

/** Data ISO "YYYY-MM-DD" vinda do cliente, ou a de hoje no servidor. */
function normalizarHoje(valor) {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : new Date().toISOString().slice(0, 10);
}

/* ==========================================================================
   O prompt
   ========================================================================== */

function systemPrompt(hoje) {
  return `Você lê a foto de uma atividade escolar, agenda ou bilhete e transforma no que
está escrito ali num plano de estudo com tarefas. Quem vai ler é o pai ou a mãe
da criança, que revisa antes de aprovar.

REGRAS QUE VALEM MAIS QUE QUALQUER OUTRA COISA:
1. Extraia SOMENTE o que está escrito na imagem. Não invente tarefa, não
   complete o que faltou, não sugira exercício que não está ali. Se a foto tem
   duas tarefas, devolva duas — nunca cinco pra "ficar mais completo".
2. Se não der pra ler (foto tremida, escura, cortada, ou não é material
   escolar), devolva legivel=false e um motivo curto em português, e nada mais.
3. \`extraido_texto\` é a transcrição LITERAL do que você conseguiu ler, sem
   interpretar. É o que o pai usa pra conferir se você entendeu certo.
4. \`confianca\` (0 a 1) por tarefa é honesta: escrita à mão apagada, palavra
   ambígua ou número duvidoso = confiança baixa. Não infle.
5. \`materia\` é EXATAMENTE um destes 14 valores, nunca outro:
   ${MATERIAS.join(", ")}
   Na dúvida entre duas, use "outros". Para criança do fundamental, física,
   química e biologia são "ciencias".
6. Datas: hoje é ${hoje}. Converta relativo pra ISO (YYYY-MM-DD): "entregar
   terça" vira a próxima terça. Sem data na imagem, prazo = null. Nunca chute
   prazo.
7. \`titulo\` da tarefa: curto e reconhecível pra criança ("Exercícios de fração",
   "Ler o capítulo 3"), no máximo ${LIM.tarefaTitulo} caracteres. O detalhe fica em \`detalhe\`
   ("páginas 42 e 43"), no máximo ${LIM.detalhe}.
8. O \`titulo\` do plano tem no máximo ${LIM.titulo} caracteres e o \`conteudo\` ${LIM.conteudo}. O
   \`conteudo\` é um resumo em 1-2 frases do que a criança precisa fazer, escrito
   pro robô tutor seguir — não repita a lista de tarefas ali.
9. \`duracao_dias\`: estime pelo prazo mais distante; sem prazo nenhum, use 7.
10. Tudo em português do Brasil.

Se vierem várias imagens, trate como páginas do MESMO material: um plano só,
com as tarefas de todas.`;
}

/**
 * Schema ESTRITO (não `json_object` solto).
 *
 * No modo `strict` a OpenAI exige `additionalProperties: false` e TODAS as chaves em
 * `required` — campo opcional se expressa como união com `null`, não como chave
 * ausente. É por isso que `prazo`/`detalhe` são `["string","null"]`.
 */
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "legivel",
    "motivo",
    "titulo",
    "conteudo",
    "foco",
    "duracao_dias",
    "extraido_texto",
    "tarefas",
  ],
  properties: {
    legivel: { type: "boolean" },
    motivo: { type: ["string", "null"] },
    titulo: { type: ["string", "null"] },
    conteudo: { type: ["string", "null"] },
    foco: { type: ["string", "null"], enum: [...MATERIAS, null] },
    duracao_dias: { type: ["integer", "null"] },
    extraido_texto: { type: ["string", "null"] },
    tarefas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["titulo", "detalhe", "materia", "prazo", "estimativa_min", "confianca"],
        properties: {
          titulo: { type: "string" },
          detalhe: { type: ["string", "null"] },
          materia: { type: "string", enum: MATERIAS },
          prazo: { type: ["string", "null"] },
          estimativa_min: { type: ["integer", "null"] },
          confianca: { type: "number" },
        },
      },
    },
  },
};

/* ==========================================================================
   A chamada à OpenAI
   ========================================================================== */

/**
 * Pede a leitura à IA e devolve o JSON cru (ainda não saneado).
 *
 * Degradação graciosa no espírito do `cacheKeySuportado` de
 * `Cogni/server/modules/brain/openai.js`: se a API recusar o `json_schema` (modelo
 * ou endpoint que ainda não o suporta), refaz UMA vez com `json_object`. O schema já
 * está descrito no prompt, então a resposta continua utilizável — sem isso, uma
 * incompatibilidade de parâmetro derrubaria a feature inteira em vez de degradá-la.
 *
 * @throws {Error} qualquer falha — o chamador transforma em 502 genérico.
 */
async function lerComIA(chave, imagens, hoje) {
  const conteudoUsuario = [
    {
      type: "text",
      text:
        imagens.length > 1
          ? `Estas são ${imagens.length} páginas do MESMO material. Monte um plano só.`
          : "Leia esta atividade e monte o plano.",
    },
    ...imagens.map((url) => ({
      type: "image_url",
      // `detail: 'high'`: o padrão 'auto' encolhe a imagem e come justamente a letra
      // pequena de caderno — que é o único conteúdo que importa aqui. Mesma escolha
      // que o `caderno.js` do robô já tinha feito por tentativa e erro.
      image_url: { url, detail: "high" },
    })),
  ];

  const base = {
    model: MODELO,
    messages: [
      { role: "system", content: systemPrompt(hoje) },
      { role: "user", content: conteudoUsuario },
    ],
    // Modelo de raciocínio: `max_completion_tokens`, e os tokens de raciocínio saem
    // do MESMO orçamento — daí a folga. `temperature` é deliberadamente omitido
    // (esses modelos não aceitam).
    max_completion_tokens: 3000,
  };

  async function disparar(formato) {
    const resp = await buscar(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${chave}`,
        },
        body: JSON.stringify({ ...base, response_format: formato }),
      },
      TIMEOUT_IA_MS
    );
    const texto = await resp.text();
    if (!resp.ok) {
      const err = new Error(`OpenAI ${resp.status}: ${texto.slice(0, 500)}`);
      err.status = resp.status;
      err.corpo = texto;
      throw err;
    }
    return JSON.parse(texto);
  }

  let json;
  try {
    json = await disparar({
      type: "json_schema",
      json_schema: { name: "plano_da_foto", strict: true, schema: SCHEMA },
    });
  } catch (err) {
    const recusouSchema =
      err.status === 400 && /response_format|json_schema/i.test(err.corpo || "");
    if (!recusouSchema) throw err;
    console.warn("[plano-de-imagem] json_schema recusado; caindo pra json_object.");
    json = await disparar({ type: "json_object" });
  }

  const bruto = json?.choices?.[0]?.message?.content;
  if (!bruto) throw new Error("OpenAI devolveu resposta vazia.");
  return JSON.parse(bruto);
}

/* ==========================================================================
   Saneamento da resposta
   ========================================================================== */

/**
 * Devolve um objeto que o front pode consumir sem checar nada.
 *
 * Schema estrito reduz o erro do modelo, não o elimina — e mesmo o caminho de
 * fallback (`json_object`) não valida nada. Matéria fora das 14 vira "outros",
 * confiança sai grampeada em 0..1, prazo que não é `YYYY-MM-DD` vira null, textos
 * são cortados nos limites do contrato. O front nunca deve receber lixo.
 */
function sanear(cru) {
  if (!cru || cru.legivel === false) {
    return {
      legivel: false,
      motivo:
        cortar(cru?.motivo, 240) ||
        "Não consegui ler essa foto. Tente de novo com a folha inteira no quadro e boa luz.",
    };
  }

  const tarefas = (Array.isArray(cru.tarefas) ? cru.tarefas : [])
    .slice(0, MAX_TAREFAS)
    .map((t) => ({
      titulo: cortar(t?.titulo, LIM.tarefaTitulo),
      detalhe: cortar(t?.detalhe, LIM.detalhe) || null,
      materia: MATERIAS.includes(t?.materia) ? t.materia : "outros",
      prazo: /^\d{4}-\d{2}-\d{2}$/.test(t?.prazo) ? t.prazo : null,
      estimativa_min: grampear(t?.estimativa_min, 1, 600),
      // Sem confiança declarada assumimos BAIXA (0.5), não alta: o chip "confira"
      // aparecendo à toa custa um olhar do pai; faltando, custa uma tarefa errada
      // entrando no plano sem ninguém conferir.
      confianca: grampear(t?.confianca, 0, 1) ?? 0.5,
    }))
    .filter((t) => t.titulo);

  // Sem título nenhum legível, o "legível" da IA não se sustenta.
  if (!tarefas.length) {
    return {
      legivel: false,
      motivo: "Consegui ver a foto, mas não achei nenhuma tarefa escrita nela.",
    };
  }

  return {
    legivel: true,
    titulo: cortar(cru.titulo, LIM.titulo) || "Atividades da foto",
    conteudo: cortar(cru.conteudo, LIM.conteudo),
    foco: MATERIAS.includes(cru.foco) ? cru.foco : tarefas[0].materia,
    duracao_dias: grampear(cru.duracao_dias, 1, 365) ?? 7,
    extraido_texto: cortar(cru.extraido_texto, LIM.extraido),
    tarefas,
  };
}

/* ==========================================================================
   Handler
   ========================================================================== */

export default async function handler(req, res) {
  /* Trava 1 — só POST. */
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return responder(res, 405, { erro: "Use POST." });
  }

  /* Env vars. Faltando alguma, 503 com mensagem clara — nunca stack trace. */
  const { OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("[plano-de-imagem] Faltam variáveis de ambiente na Vercel.");
    return responder(res, 503, {
      erro: "A leitura por foto está desligada no servidor. Avise o responsável pelo site.",
    });
  }

  /* Trava 2 — exige o JWT do pai logado, validado NO SERVIDOR.
     Nunca confiar num user id vindo no corpo: ele é escrito por quem chama. */
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) {
    return responder(res, 401, { erro: "Entre na sua conta pra usar a leitura por foto." });
  }

  let uid;
  try {
    const r = await buscar(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    });
    if (!r.ok) {
      return responder(res, 401, { erro: "Sua sessão expirou. Entre de novo." });
    }
    uid = (await r.json())?.id;
  } catch (err) {
    console.error("[plano-de-imagem] Auth do Supabase falhou:", err);
    return responder(res, 502, { erro: "Não consegui confirmar seu login agora." });
  }
  if (!uid) {
    return responder(res, 401, { erro: "Sua sessão expirou. Entre de novo." });
  }

  /* Trava 3 — confirma que ele tem criança pareada.
     A consulta usa o token DELE, então é a RLS que faz o trabalho: um responsável
     não consegue ler a criança de outra família nem que queira. */
  let crianca;
  try {
    const r = await buscar(
      `${SUPABASE_URL}/rest/v1/criancas?responsavel_id=eq.${encodeURIComponent(uid)}` +
        `&select=id,nome,idade,serie&limit=1`,
      { headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY } }
    );
    if (!r.ok) throw new Error(`REST ${r.status}`);
    crianca = (await r.json())?.[0];
  } catch (err) {
    console.error("[plano-de-imagem] Leitura de `criancas` falhou:", err);
    return responder(res, 502, { erro: "Não consegui carregar o perfil agora." });
  }
  if (!crianca) {
    return responder(res, 403, {
      erro: "Pareie o robô com o perfil da criança antes de criar um plano por foto.",
    });
  }

  /* Trava 4 — rate limit sem infra nova: conta os planos de foto das últimas 24h.
     Sem KV, sem tabela nova — a própria `planos_estudo` já sabe responder isso. */
  try {
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const r = await buscar(
      `${SUPABASE_URL}/rest/v1/planos_estudo?crianca_id=eq.${encodeURIComponent(crianca.id)}` +
        `&origem=eq.foto&criado_em=gte.${encodeURIComponent(desde)}&select=id`,
      { headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY } }
    );
    if (r.ok) {
      const linhas = await r.json();
      if (Array.isArray(linhas) && linhas.length >= MAX_POR_DIA) {
        return responder(res, 429, {
          erro: `Você já criou ${MAX_POR_DIA} planos por foto hoje; tente de novo amanhã.`,
        });
      }
    }
    // Falha na CONTAGEM não bloqueia a geração: o custo de um plano a mais é menor
    // que o de negar a feature ao pai por causa de uma piscada de rede. As travas
    // que protegem de verdade (2 e 3) já passaram.
  } catch (err) {
    console.warn("[plano-de-imagem] Contagem do rate limit falhou:", err);
  }

  /* Trava 5 — valida o corpo.
     `req.body` é um getter que LANÇA com JSON malformado (comportamento documentado
     da Vercel), daí o try/catch. */
  let corpo;
  try {
    corpo = req.body;
  } catch (err) {
    return responder(res, 400, { erro: "Corpo da requisição inválido." });
  }
  const validacao = validarImagens(corpo?.imagens);
  if (validacao.erro) {
    return responder(res, validacao.status, { erro: validacao.erro });
  }

  /* A leitura em si. */
  try {
    const cru = await lerComIA(
      OPENAI_API_KEY,
      validacao.imagens,
      normalizarHoje(corpo?.hoje)
    );
    // Foto ruim NÃO é erro HTTP: é uma resposta legítima que a tela sabe explicar
    // ("tente de novo com a folha inteira no quadro e boa luz").
    return responder(res, 200, sanear(cru));
  } catch (err) {
    /* Trava 6 — a mensagem da OpenAI NUNCA sai daqui. Ela pode conter trecho do
       prompt, nome de modelo, detalhe de cota e, num 400 de conteúdo, pedaço do que
       estava escrito no caderno da criança. Fica no log do servidor. */
    console.error("[plano-de-imagem] Leitura falhou:", err);
    return responder(res, 502, {
      erro: "Não consegui ler a foto agora. Tente de novo em instantes.",
    });
  }
}
