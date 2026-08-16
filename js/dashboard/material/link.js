/**
 * material/link.js — O link colado vira material da bandeja.
 *
 * É o único módulo de `material/` que não abre um arquivo: ele **chama a função**
 * (`/api/ler-link`) e transforma a resposta num item igual aos outros. O motivo de a
 * leitura acontecer no servidor é curto e definitivo: **CORS**. O site da escola não
 * autoriza o navegador do pai a ler a resposta dele; a função lê.
 *
 * O que fica deste lado, e por quê:
 *
 * - **Achar a URL dentro do texto**, porque o pai cola do WhatsApp com frase e tudo — e
 *   porque colar no campo do PEDIDO também tem que funcionar (`extrairUrl`);
 * - **A chave de duplicata local**, pra recusar o mesmo vídeo colado duas vezes ANTES de
 *   gastar rede e cota. `youtu.be/X` e `watch?v=X` são o mesmo material, e o pai que
 *   colou os dois não quer duas cópias da mesma aula;
 * - **O rótulo e o SELO do card** — a parte que faz a degradação ser honesta. Sem legenda
 *   o plano sai mais genérico, e isso tem que estar escrito no card, não descoberto
 *   depois em tarefas ruins.
 *
 * 🔒 Nada do que vem do link é guardado: ele vira texto, entra no plano e some. A URL
 * sobrevive só dentro do `extraido_texto`, como referência de auditoria pro pai.
 */

import { USAR_SUPABASE } from "../mock-data.js";
import { TETO, MAX_TEXTO_ITEM } from "./orcamento.js";
import { tamanhoSerializado, formatarBytes, formatarDuracao } from "./bytes.js";
import { cortarTexto } from "./texto.js";

/** Endpoint da Vercel Function. Mesma origem — não precisa de CORS. */
const ENDPOINT = "/api/ler-link";

/**
 * Teto de espera do cliente.
 *
 * A função tem 12 s por requisição e pode fazer três (player + legenda + fallback), mas
 * o pai não pode ficar olhando spinner por um minuto — 30 s cobre o caso bom com folga e
 * transforma o caso ruim numa mensagem em vez de numa tela travada.
 */
const TIMEOUT_MS = 30_000;

/** Links por plano. Acima disso a bandeja vira lista e o corpo começa a apertar. */
export const MAX_LINKS = 2;

/** Erro com mensagem já escrita pro pai — estado previsto, não bug. */
export class ErroDeLink extends Error {}

/* ==========================================================================
   A URL
   ========================================================================== */

/** Tira a pontuação que gruda no fim de link copiado de mensagem. */
function limparPontuacaoFinal(url) {
  let limpo = url.replace(/[.,;:!?'"«»…]+$/, "");
  // Fecha-parêntese só sai quando SOBRA um: a Wikipédia em português vive de
  // `/wiki/Fração_(matemática)`, e ali o par é do endereço, não da frase em volta.
  while (/[)\]]$/.test(limpo)) {
    const fecha = limpo.slice(-1);
    const abre = fecha === ")" ? "(" : "[";
    if (limpo.split(fecha).length <= limpo.split(abre).length) break;
    limpo = limpo.slice(0, -1);
  }
  return limpo;
}

/**
 * Texto → a primeira URL que houver dentro dele.
 *
 * Usada nos dois lugares que importam: o campo de link (onde o pai pode colar
 * "olha isso ó https://…") e o campo do PEDIDO — porque quem cola sem ler a tela cola
 * no primeiro campo que vê, e recusar isso seria punir o comportamento mais natural.
 *
 * @param {string} texto
 * @returns {string} a URL, ou "" se não houver
 */
export function extrairUrl(texto) {
  const bruto = String(texto || "").trim();
  if (!bruto) return "";

  const comEsquema = /https?:\/\/[^\s<>"']+/i.exec(bruto);
  if (comEsquema) return limparPontuacaoFinal(comEsquema[0]);

  const comWww = /\bwww\.[^\s<>"']+/i.exec(bruto);
  if (comWww) return `https://${limparPontuacaoFinal(comWww[0])}`;

  /**
   * Endereço sem `https://` e sem `www.` — "todamateria.com.br/fracoes".
   *
   * Só vale quando o campo tem SÓ isso, sem espaço nenhum: aí não há dúvida de que é um
   * endereço. Aceitar o mesmo padrão no meio de uma frase faria "hoje é dia 5.md" virar
   * um site — e este `extrairUrl` também roda no campo do PEDIDO, onde frase é a regra.
   */
  if (/^[^\s<>"']+$/.test(bruto) && /^([a-z0-9][a-z0-9-]*\.)+[a-z]{2,}(?=[/:?#]|$)/i.test(bruto)) {
    return `https://${limparPontuacaoFinal(bruto)}`;
  }
  return "";
}

/** Id de 11 caracteres de uma URL do YouTube, ou null. (Espelha `api/_lib/link/youtube.mjs`.) */
export function idDoYoutube(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m)\./i, "").toLowerCase();
  const valido = (id) => (/^[A-Za-z0-9_-]{11}$/.test(id || "") ? id : null);

  if (host === "youtu.be") return valido(u.pathname.slice(1).split("/")[0]);
  if (!["youtube.com", "youtube-nocookie.com", "music.youtube.com"].includes(host)) return null;
  if (u.pathname === "/watch") return valido(u.searchParams.get("v"));

  const m = /^\/(?:embed|shorts|v|live)\/([^/?#]+)/.exec(u.pathname);
  return m ? valido(m[1]) : null;
}

/**
 * A chave de duplicata, calculada ANTES de chamar a função.
 *
 * A função devolve a dela (que enxerga o redirect do encurtador); esta aqui existe pra
 * recusar o caso óbvio — o mesmo vídeo colado duas vezes — **sem gastar uma ida à rede
 * e um ponto da cota diária**.
 *
 * @param {string} url
 * @returns {string}
 */
export function chaveDoLink(url) {
  const id = idDoYoutube(url);
  if (id) return `yt:${id}`;
  try {
    const u = new URL(url);
    return `web:${u.hostname.replace(/^www\./, "").toLowerCase()}${u.pathname.replace(/\/$/, "")}${u.search}`;
  } catch {
    return `web:${String(url).trim().toLowerCase()}`;
  }
}

/* ==========================================================================
   A chamada
   ========================================================================== */

/** Traduz o status HTTP numa frase que diz o que fazer. */
function mensagemDeStatus(status) {
  if (status === 401) return "Sua sessão expirou. Entre de novo.";
  if (status === 403) return "Pareie o robô com o perfil da criança antes de criar um plano.";
  if (status === 429) {
    return "Você já criou muitos planos com a Cogni hoje. Tente de novo amanhã.";
  }
  if (status === 404) {
    // Site servido localmente: a função só existe no deploy. Dizer isso é muito melhor
    // que um "erro inesperado" genérico.
    return "A leitura de link só funciona no site publicado. Rodando local, use o modo de demonstração.";
  }
  if (status >= 500) return "O servidor está fora do ar agora. Tente de novo em instantes.";
  return null;
}

/**
 * Resposta de exemplo do modo mock (`USAR_SUPABASE = false`).
 *
 * Não é preguiça: é o que permite exercitar a bandeja, os selos, a duplicata e a revisão
 * inteira sem deploy e sem login — do mesmo jeito que o resto do fluxo de material já
 * roda de verdade no modo mock. Só a REDE é falsa.
 *
 * `/shorts/` cai de propósito no degrau "sem legenda": é o caminho mais curto pra ver na
 * tela como fica a degradação honesta, que é justamente o que precisa ser revisado.
 */
function respostaDeExemplo(url) {
  const id = idDoYoutube(url);
  if (id) {
    const semLegenda = /\/shorts\//i.test(url);
    return {
      ok: true,
      fonte: "youtube",
      formato: "youtube",
      chave: `yt:${id}`,
      nome: "Comparação de frações — aula completa",
      titulo: "Comparação de frações — aula completa",
      canal: "Canal de exemplo",
      duracao_s: 772,
      miniatura: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      texto:
        "VIDEOAULA DO YOUTUBE: Comparação de frações — aula completa\n" +
        "Canal: Canal de exemplo · Duração: 12min52\n" +
        (semLegenda
          ? "SEM LEGENDA disponível: (conteúdo lido do vídeo apareceria aqui)"
          : "Legenda AUTOMÁTICA (gerada por máquina).\n\n(a fala da aula apareceria aqui)"),
      grau: semLegenda ? "metadados" : "transcricao",
      idiomaLegenda: semLegenda ? null : "pt",
      legendaAutomatica: !semLegenda,
      cortado: false,
      aviso: null,
    };
  }

  let dominio = "site-de-exemplo.com.br";
  try {
    dominio = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* URL estranha no modo demonstração não vale uma tela de erro */
  }
  return {
    ok: true,
    fonte: "pagina",
    formato: "web",
    chave: chaveDoLink(url),
    nome: `Página de exemplo — ${dominio}`,
    titulo: `Página de exemplo — ${dominio}`,
    dominio,
    texto: `PÁGINA DA WEB: Página de exemplo\nEndereço: ${dominio}\n\n(o texto lido da página apareceria aqui)`,
    cortado: false,
    aviso: null,
  };
}

/**
 * Chama a função e devolve a resposta crua.
 *
 * @param {string} url
 * @param {AbortSignal} signal
 * @returns {Promise<object>}
 * @throws {ErroDeLink}
 */
async function lerLink(url, signal) {
  if (!USAR_SUPABASE) {
    await new Promise((r) => window.setTimeout(r, 700));
    return respostaDeExemplo(url);
  }

  const cliente = window.cognifyAuth && window.cognifyAuth.getClient();
  if (!cliente) throw new ErroDeLink("Entre na sua conta pra usar a leitura de link.");
  const { data } = await cliente.auth.getSession();
  const token = data && data.session && data.session.access_token;
  if (!token) throw new ErroDeLink("Sua sessão expirou. Entre de novo.");

  let resp;
  try {
    resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ url }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
    });
  } catch (err) {
    if (signal.aborted) throw err;
    if (err?.name === "TimeoutError") {
      throw new ErroDeLink(
        "Esse link está demorando demais pra abrir. Tente de novo, ou copie o trecho que interessa no seu pedido."
      );
    }
    console.error("[Companion] Rede falhou na leitura do link:", err);
    throw new ErroDeLink("Sem conexão agora. Tente de novo em instantes.");
  }

  // O status vem ANTES do parse: o 413 da plataforma, um 504 de gateway e uma página de
  // erro não são JSON, e tratá-los como "resposta ilegível" diria que o site quebrou
  // quando o problema é o link.
  if (!resp.ok) {
    let doServidor = null;
    try {
      doServidor = (await resp.json())?.erro || null;
    } catch (err) {
      console.debug("[Companion] Resposta de erro sem JSON:", resp.status, err);
    }
    throw new ErroDeLink(
      doServidor || mensagemDeStatus(resp.status) || "Não consegui abrir esse link agora."
    );
  }

  try {
    return await resp.json();
  } catch (err) {
    console.error("[Companion] Resposta ilegível da função de link:", err);
    throw new ErroDeLink("Não consegui ler a resposta do servidor.");
  }
}

/* ==========================================================================
   Resposta → material da bandeja
   ========================================================================== */

/**
 * O selo do card. É **obrigatório** no link de vídeo, e é a peça que separa uma
 * degradação honesta de uma que o pai só descobre olhando tarefas ruins.
 *
 * @returns {{texto:string, tom:"ok"|"atencao"}|null}
 */
function seloDoVideo(r) {
  if (r.grau !== "transcricao") {
    return {
      texto: "sem legenda: li só o título e a descrição, o plano vai ficar mais genérico",
      tom: "atencao",
    };
  }
  if (r.legendaAutomatica) {
    return { texto: "legenda automática — confira os números", tom: "atencao" };
  }
  if (r.idiomaLegenda && !/^pt/i.test(r.idiomaLegenda)) {
    return { texto: `legenda em ${r.idiomaLegenda} — confira o que a Cogni entendeu`, tom: "atencao" };
  }
  return { texto: "legenda do próprio canal", tom: "ok" };
}

/** Junta as partes de um rótulo, ignorando o que não veio. */
const rotulo = (...partes) => partes.filter(Boolean).join(" · ");

/**
 * Link → material pronto pra bandeja.
 *
 * @param {string} bruto — o que o pai colou (pode ter texto em volta)
 * @param {ReturnType<import("./orcamento.js").novoOrcamento>} orcamento
 * @param {{signal?:AbortSignal, jaNaBandeja?:string[]}} [ctx]
 * @returns {Promise<object>} o material, no mesmo formato de `prepararMaterial`
 * @throws {ErroDeLink}
 */
export async function prepararLink(bruto, orcamento, ctx = {}) {
  const url = extrairUrl(bruto);
  if (!url) {
    throw new ErroDeLink(
      "Não achei um link aí. Copie o endereço do vídeo ou da página e cole de novo."
    );
  }

  const jaNaBandeja = ctx.jaNaBandeja || [];
  if (jaNaBandeja.includes(chaveDoLink(url))) {
    throw new ErroDeLink("Esse link já está na lista.");
  }

  const r = await lerLink(url, ctx.signal || new AbortController().signal);
  if (!r || r.ok === false) {
    throw new ErroDeLink(r?.motivo || "Não consegui usar esse link.");
  }
  // A chave da função enxerga o redirect (um encurtador e o link direto são o mesmo
  // material); a checagem local, não. Esta é a segunda peneira, e a definitiva.
  if (r.chave && jaNaBandeja.includes(r.chave)) {
    throw new ErroDeLink("Esse link já está na lista — é o mesmo material.");
  }

  const chave = r.chave || chaveDoLink(url);

  /* PDF: cai no caminho de PDF que já existe, e paga o mesmo teto. */
  if (r.fonte === "pdf") {
    const item = { tipo: "pdf", nome: r.nome || "documento.pdf", dados: r.dados };
    const bytes = tamanhoSerializado(item);
    if (bytes > TETO.pdf || bytes > orcamento.restante()) {
      throw new ErroDeLink(
        `Esse PDF tem ${formatarBytes(r.bytes || bytes)} e não cabe junto com o resto. ` +
          "Tire um material da lista, ou mande só as páginas da lição."
      );
    }
    orcamento.gastar(bytes);
    return {
      id: chave,
      chave,
      nome: item.nome,
      origem: "link",
      itens: [item],
      bytes,
      rotulo: rotulo(item.nome, formatarBytes(r.bytes || bytes)),
      miniatura: null,
      selo: { texto: "PDF aberto direto do link", tom: "ok" },
      aviso: null,
    };
  }

  /* Vídeo e página viram item de TEXTO — a função de plano nem sabe que houve link. */
  const { texto, cortado } = cortarTexto(r.texto || "", MAX_TEXTO_ITEM);
  if (!texto) {
    throw new ErroDeLink(
      "Não achei texto nenhum nesse link. Copie o trecho que interessa e cole no seu pedido."
    );
  }

  const item = {
    tipo: "texto",
    nome: r.nome || r.titulo || "link",
    formato: r.formato === "youtube" ? "youtube" : "web",
    texto,
  };
  const bytes = tamanhoSerializado(item);
  if (bytes > orcamento.restante()) {
    throw new ErroDeLink(
      "Esse conteúdo não cabe junto com o resto do material. Tire um item da lista e tente de novo."
    );
  }
  orcamento.gastar(bytes);

  const ehVideo = r.fonte === "youtube";
  return {
    id: chave,
    chave,
    nome: item.nome,
    origem: "link",
    itens: [item],
    bytes,
    rotulo: ehVideo
      ? rotulo(r.titulo || item.nome, formatarDuracao(r.duracao_s), r.canal)
      : rotulo(r.titulo || item.nome, r.dominio),
    miniatura: ehVideo ? r.miniatura || null : null,
    ehVideo,
    selo: ehVideo ? seloDoVideo(r) : { texto: r.dominio || "página lida", tom: "ok" },
    // O aviso do servidor (conteúdo cortado) e o nosso corte local dizem a mesma coisa;
    // o do servidor é mais específico, então ele ganha.
    aviso:
      r.aviso ||
      (cortado
        ? "Esse conteúdo é longo: li o começo dele. Se o que interessa está no fim, diga isso no seu pedido."
        : null),
  };
}
