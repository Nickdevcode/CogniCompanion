/**
 * _lib/link/pagina.mjs — A página da web vira texto (e o PDF vira PDF).
 *
 * A busca acontece aqui e não no navegador por um motivo simples: **CORS**. O site da
 * escola não manda `Access-Control-Allow-Origin` pra gente, então o `fetch` do painel
 * nem chega a ver a resposta. Na função, chega.
 *
 * Três coisas aqui falham EM SILÊNCIO se forem feitas do jeito óbvio, e cada uma delas
 * produz um plano de estudo plausível em cima de conteúdo errado — que é o pior modo de
 * falha possível num produto que um pai usa pra decidir o que a filha vai estudar:
 *
 * 1. 🔴 **UTF-8 como padrão** corrompe material escolar público brasileiro (latin1).
 * 2. 🔴 **Anti-bot devolve 200** com uma página de verdade, curtinha.
 * 3. 🔴 **`<main>` que engloba o cabeçalho** entrega o menu do site como se fosse a lição.
 *
 * O que NÃO tem conserto aqui: página que monta o conteúdo por JavaScript. A função não
 * roda navegador, e fingir que roda seria pior — a saída é uma mensagem que ensina.
 */

import {
  LinkRuim,
  MAX_HTML_BYTES,
  MAX_PDF_BYTES,
  MAX_TEXTO,
  buscarComRedirect,
  lerLimitado,
} from "./rede.mjs";

/** Abaixo disto não há lição nenhuma — é página de JS, paywall ou erro maquiado. */
const MIN_TEXTO = 250;

/* ==========================================================================
   Bytes → texto
   ========================================================================== */

/**
 * 🔴 UTF-8 NÃO é seguro como padrão no Brasil.
 *
 * `planalto.gov.br` serve `Content-Type: text/html` **sem charset**, **sem
 * `<meta charset>`**, e o conteúdo é latin1. Decodificar como UTF-8 devolve
 * *"Presid�ncia da Rep�blica"* — a página INTEIRA vira texto corrompido, e o modelo
 * monta o plano em cima disso sem reclamar de nada. Material escolar público brasileiro
 * (secretarias, portais de escola, PDFs de lei) é cheio disso.
 *
 * A saída não é heurística de frequência de letra: **UTF-8 é autovalidante**. Byte de
 * acento latin1 é sequência inválida em UTF-8, então `fatal: true` decide sozinho.
 *
 * E o fallback é `windows-1252`, não `iso-8859-1`: é o que os navegadores realmente
 * usam quando o site declara latin1, e é o único que cobre aspas curvas e travessão
 * (faixa 0x80-0x9F) que o Word cospe em toda página colada de um documento.
 */
export function decodificarBytes(buf, contentType) {
  const doCabecalho = /charset=["']?([\w-]+)/i.exec(contentType || "")?.[1];

  // A meta tag mora nos primeiros bytes, e latin1 decodifica qualquer byte sem lançar —
  // é o único decoder seguro pra farejar antes de saber o charset.
  const inicio = new TextDecoder("latin1").decode(buf.subarray(0, 2048));
  const daMeta =
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(inicio)?.[1] ||
    /<meta[^>]+content=["'][^"']*charset=([\w-]+)/i.exec(inicio)?.[1];

  const declarado = doCabecalho || daMeta;
  if (declarado) {
    try {
      return new TextDecoder(declarado.toLowerCase()).decode(buf);
    } catch {
      /* charset inventado ("utf8mb4", "iso-8859-1-pt"): cai pro sniffing abaixo */
    }
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

/** As entidades que aparecem de verdade em página brasileira. */
const ENTIDADES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–",
  mdash: "—", hellip: "…", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  laquo: "«", raquo: "»", deg: "°", middot: "·", bull: "•", times: "×", divide: "÷",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", agrave: "à",
  atilde: "ã", otilde: "õ", ccedil: "ç", acirc: "â", ecirc: "ê", ocirc: "ô",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Atilde: "Ã",
  Otilde: "Õ", Ccedil: "Ç", Acirc: "Â", Ecirc: "Ê", Ocirc: "Ô", Agrave: "À",
};

function decodificarEntidades(txt) {
  return txt.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,10});/g, (inteiro, corpo) => {
    if (corpo[0] === "#") {
      const n =
        corpo[1] === "x" || corpo[1] === "X"
          ? parseInt(corpo.slice(2), 16)
          : parseInt(corpo.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : inteiro;
    }
    return ENTIDADES[corpo] ?? inteiro;
  });
}

/** Conteúdo da primeira tag `<nome>…</nome>`. */
function tag(html, nome) {
  const re = new RegExp(`<${nome}\\b[^>]*>([\\s\\S]*?)</${nome}>`, "i");
  return re.exec(html)?.[1] || "";
}

/** `<meta name|property="chave" content="…">`, nas duas ordens de atributo. */
function meta(html, chave) {
  const direta = new RegExp(
    `<meta[^>]+(?:name|property)=["']${chave}["'][^>]*content=["']([^"']*)["']`,
    "i"
  );
  const invertida = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${chave}["']`,
    "i"
  );
  return decodificarEntidades(direta.exec(html)?.[1] || invertida.exec(html)?.[1] || "").trim();
}

/**
 * HTML → texto legível.
 *
 * 🔴 A ORDEM é o que importa aqui, e ela não é a intuitiva. Tirar a casca
 * (`nav/header/footer/aside`) vem ANTES de procurar `<article>`/`<main>`, porque vários
 * sites brasileiros (Toda Matéria é um) põem o cabeçalho DENTRO do `<main>` — e confiar
 * no seletor entrega o menu inteiro como se fosse a lição, com cara de conteúdo.
 */
export function htmlParaTexto(html) {
  let corpo = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|iframe|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");

  corpo = corpo.replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");

  const artigo = tag(corpo, "article") || tag(corpo, "main");
  // O piso de 400 caracteres evita trocar a página inteira por um `<article>` que só
  // tem a chamada da matéria (portal de notícia usa `<article>` pra cada card da home).
  if (artigo && artigo.replace(/<[^>]+>/g, "").trim().length > 400) corpo = artigo;

  return decodificarEntidades(
    corpo
      .replace(/<(br|hr)\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|li|tr|h[1-6]|blockquote|pre|table)>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 🔴 Anti-bot devolve **200 com uma página de verdade**.
 *
 * A Khan Academy responde *"Client Challenge"* em **227 caracteres** — passa liso em
 * qualquer teste de "tem texto?". Sem esta checagem, a Cogni monta um plano de estudo em
 * cima do texto do Cloudflare, e o pai só descobre olhando tarefas sem sentido.
 *
 * As DUAS condições (curto **e** com a marca) são obrigatórias: "just a moment" aparece
 * legitimamente no meio de um texto longo, e barrar por isso recusaria página boa.
 */
const MARCAS_DE_DESAFIO =
  /client challenge|just a moment|attention required|checking your browser|verify you are human|enable javascript|habilite o javascript|ative o javascript|acesso negado|access denied|cf-browser-verification/i;

export function ehDesafioDeBot(titulo, texto) {
  return texto.length < 1_200 && MARCAS_DE_DESAFIO.test(`${titulo}\n${texto}`);
}

/**
 * Google Docs/Slides/Sheets público → export direto em texto.
 *
 * A escola manda link do Drive o tempo todo, e o HTML dessas páginas é um shell de
 * JavaScript — sem este atalho, todo link do Drive cairia no "essa página quase não tem
 * texto". Não sendo público, o export responde 401/403 e a mensagem diz o que fazer.
 *
 * @returns {string|null}
 */
export function exportDoGoogle(url) {
  const m = /^https:\/\/docs\.google\.com\/(document|presentation|spreadsheets)\/d\/([A-Za-z0-9_-]+)/.exec(
    url
  );
  if (!m) return null;
  const [, tipo, id] = m;
  if (tipo === "document") return `https://docs.google.com/document/d/${id}/export?format=txt`;
  if (tipo === "presentation") return `https://docs.google.com/presentation/d/${id}/export/txt`;
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;
}

/* ==========================================================================
   A leitura
   ========================================================================== */

/** Nome de arquivo a partir da URL final ("lista-de-exercicios.pdf"). */
function nomeDoArquivo(url, padrao) {
  try {
    const bruto = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
    return bruto.trim() || padrao;
  } catch {
    return padrao;
  }
}

/**
 * O texto que a IA vai ler.
 *
 * O cabeçalho com o endereço não é enfeite: ele é a única procedência que sobra depois
 * que a página vira texto solto, e é o que o pai reconhece quando abre "o que a Cogni
 * entendeu" três dias depois.
 */
function montarTexto({ titulo, dominio, descricao, texto, cortado }) {
  const partes = [`PÁGINA DA WEB: ${titulo}`, `Endereço: ${dominio}`];
  if (descricao) partes.push(`Resumo do site: ${descricao}`);
  if (cortado) partes.push("A página é longa: o texto abaixo é o começo dela.");
  partes.push("", texto);
  return partes.join("\n").slice(0, MAX_TEXTO);
}

/**
 * Página da web → material pronto.
 *
 * @param {string} urlOriginal
 * @returns {Promise<
 *   {tipo:"texto", titulo:string, dominio:string, texto:string, cortado:boolean, url:string} |
 *   {tipo:"pdf", titulo:string, nome:string, dados:Buffer, bytes:number, url:string}
 * >}
 * @throws {LinkRuim}
 */
export async function lerPagina(urlOriginal) {
  const alvo = exportDoGoogle(urlOriginal) || urlOriginal;
  const { resp, url } = await buscarComRedirect(alvo);

  if (resp.status === 401 || resp.status === 403) {
    throw new LinkRuim(
      "Esse link pede login pra abrir. Copie o trecho que interessa e cole no seu pedido."
    );
  }
  if (resp.status === 404) {
    throw new LinkRuim("Essa página não existe mais. Confira o endereço.");
  }
  if (resp.status === 429) {
    throw new LinkRuim("Esse site está recusando leitura automática agora. Tente daqui a pouco.");
  }
  if (!resp.ok) {
    throw new LinkRuim("Esse site não respondeu agora. Tente de novo em instantes.");
  }

  const mime = (resp.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();

  /**
   * Link que aponta pra PDF é o caso mais comum de "a escola pôs a lista no site". Ele
   * NÃO vira texto aqui: segue o caminho de PDF que já existe, porque a OpenAI lê texto
   * **e** imagem de página — que é o que faz PDF escaneado funcionar.
   */
  if (mime === "application/pdf") {
    const dados = await lerLimitado(
      resp,
      MAX_PDF_BYTES,
      "Esse PDF é grande demais pra eu baixar de uma vez. Salve só as páginas da lição e mande pelo botão de arquivo."
    );
    if (!dados.length) throw new LinkRuim("Esse PDF veio vazio. Confira o link.");

    const nome = nomeDoArquivo(url, "documento.pdf");
    return {
      tipo: "pdf",
      titulo: nome,
      nome: /\.pdf$/i.test(nome) ? nome : `${nome}.pdf`,
      dados,
      bytes: dados.length,
      url,
    };
  }

  if (mime && !/^text\/|json|xml/.test(mime)) {
    throw new LinkRuim(
      "Esse link é um arquivo que eu não abro por aqui. Baixe no aparelho e mande pelo botão de arquivo."
    );
  }

  const buf = await lerLimitado(
    resp,
    MAX_HTML_BYTES,
    "Essa página é grande demais pra eu ler. Copie o trecho que interessa e cole no seu pedido."
  );
  const html = decodificarBytes(buf, resp.headers.get("content-type"));

  const ehHtml = mime === "text/html" || /<html|<!doctype html/i.test(html.slice(0, 2_000));
  const texto = ehHtml ? htmlParaTexto(html) : html.replace(/\r\n?/g, "\n").trim();

  const dominio = new URL(url).hostname.replace(/^www\./, "");
  const titulo =
    (ehHtml && (meta(html, "og:title") || decodificarEntidades(tag(html, "title")).trim())) ||
    nomeDoArquivo(url, dominio) ||
    dominio;

  if (ehDesafioDeBot(titulo, texto)) {
    throw new LinkRuim(
      "Esse site bloqueia leitura automática. Copie o trecho que interessa e cole no seu pedido."
    );
  }

  if (texto.length < MIN_TEXTO) {
    throw new LinkRuim(
      "Essa página quase não tem texto pra eu ler (o conteúdo dela deve carregar por script). " +
        "Copie o trecho que interessa e cole no seu pedido."
    );
  }

  const cortado = texto.length > MAX_TEXTO;
  return {
    tipo: "texto",
    titulo: titulo.slice(0, 200),
    dominio,
    texto: montarTexto({
      titulo,
      dominio,
      descricao: ehHtml ? meta(html, "og:description") || meta(html, "description") : "",
      texto: cortado ? texto.slice(0, MAX_TEXTO) : texto,
      cortado,
    }),
    cortado,
    url,
  };
}
