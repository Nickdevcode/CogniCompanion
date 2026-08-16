/**
 * _lib/link/rede.mjs — Buscar na internet uma URL que veio de fora, sem virar proxy.
 *
 * ⚠️ ESTE É O ARQUIVO MAIS PERIGOSO DO PROJETO.
 *
 * Todo o resto da função `ler-link` só existe porque este módulo garante uma coisa: o
 * destino é hostil até prova em contrário. Sem o que está aqui, `/api/ler-link` seria
 * um **proxy SSRF público** hospedado no projeto do Nicolas — qualquer um mandaria
 * `http://169.254.169.254/` (onde mora o metadata endpoint das nuvens) e leria de
 * dentro da infraestrutura usando a nossa saída de rede.
 *
 * As quatro travas, e por que cada uma existe:
 *
 * 1. **Só http/https, só portas 80/443** — `file:`, `gopher:` e amigos fora, e nada de
 *    varrer porta de serviço interno.
 * 2. **Resolve o DNS e barra IP privado** — o nome pode ser público e apontar pra
 *    dentro. Um domínio que resolve pra `127.0.0.1` é o truque mais velho do livro.
 * 3. 🔴 **Redirect seguido NA MÃO, revalidando cada salto** — esta é a que quase todo
 *    mundo esquece. Um domínio público que responde `302` pra `http://169.254.169.254/`
 *    passa por qualquer validação feita só na URL inicial. É assim que SSRF entra.
 * 4. **Teto de bytes lendo o STREAM** — `content-length` é declarado pelo outro lado,
 *    então confiar nele é confiar no atacante.
 *
 * ⚠️ Limite conhecido e aceito: entre a nossa resolução de DNS e a que o `fetch` faz
 * existe uma janela de **DNS rebinding**. Fechá-la exigiria conectar pelo IP com o
 * `Host` na mão (e quebrar o SNI do TLS no caminho). Pro tamanho do risco aqui — uma
 * função sem segredo interessante, atrás de sessão de responsável logado e com cota
 * diária — o custo não se paga. Fica registrado, não escondido.
 */

import { lookup } from "node:dns/promises";

/**
 * UA de navegador. Não é disfarce: metade dos sites de material escolar devolve 403 ou
 * uma página de "atualize seu navegador" pra User-Agent desconhecido, e a mensagem que
 * o pai receberia ("esse site não respondeu") seria uma meia-verdade.
 */
export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** Teto por requisição. A função inteira precisa fechar bem antes do limite da plataforma. */
export const TIMEOUT_LINK_MS = 12_000;

/** Saltos de redirect. Encurtador legítimo usa 1 ou 2; 3 já é folga. */
const MAX_REDIRECTS = 3;

/* --------------------------------------------------------------------------
   Quanto da internet a gente engole
   Os três tetos moram juntos porque respondem à mesma pergunta, e porque errar
   um deles pra mais é o caminho mais curto pra derrubar a função por memória.
   -------------------------------------------------------------------------- */

/**
 * Texto por link. É o mesmo teto de item de texto que o cliente já respeita
 * (`MAX_TEXTO_ITEM` em `js/dashboard/material/orcamento.js`) — uma videoaula de 49
 * minutos medida deu 18 k caracteres, então cabe folgado.
 */
export const MAX_TEXTO = 30_000;

/** HTML baixado. 3 MB é página pesada de portal; acima disso é anexo disfarçado. */
export const MAX_HTML_BYTES = 3_000_000;

/** PDF baixado: ~2,2 MB de arquivo ≈ 3 MB em base64, o teto de PDF que já existe. */
export const MAX_PDF_BYTES = 2_200_000;

/**
 * Link que não dá pra usar — e isso NÃO é erro de servidor.
 *
 * Vira `200 {ok:false, motivo}`, exatamente como material ruim já vira hoje. A
 * diferença importa: um 502 diz "o site quebrou" e o pai cola o mesmo link de novo; um
 * motivo diz o que fazer diferente. Por isso toda mensagem daqui **ensina uma saída**.
 */
export class LinkRuim extends Error {}

/* ==========================================================================
   A URL que o pai colou
   ========================================================================== */

/**
 * Pontuação que gruda no fim de um link copiado de mensagem ("olha isso: https://x.com/y.").
 * Parênteses e colchetes só saem quando não há o par abrindo dentro da URL — a
 * Wikipédia em português vive de `/wiki/Fração_(matemática)`.
 */
function limparPontuacaoFinal(url) {
  let limpo = url.replace(/[.,;:!?'"«»…]+$/, "");
  // Fecha-parêntese só sai quando SOBRA um: o link da Wikipédia
  // (`/wiki/Fração_(matemática)`) tem um par legítimo dentro, e o parêntese da frase que
  // o pai escreveu em volta é o que está desbalanceado.
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
 * O pai cola direto do WhatsApp, e o que vem junto é uma frase inteira: *"olha isso ó
 * https://youtu.be/xxxx a professora mandou"*. Exigir a URL limpa transformaria o caso
 * mais comum num erro de formulário.
 *
 * @param {unknown} bruto
 * @returns {string} a URL, ou "" se não houver nenhuma
 */
export function extrairUrl(bruto) {
  const texto = typeof bruto === "string" ? bruto.trim() : "";
  if (!texto) return "";

  const comEsquema = /https?:\/\/[^\s<>"']+/i.exec(texto);
  if (comEsquema) return limparPontuacaoFinal(comEsquema[0]);

  // "www.brasilescola.uol.com.br/…" — endereço válido pra quem cola, e nenhum navegador
  // exige o `https://` há uma década.
  const comWww = /\bwww\.[^\s<>"']+/i.exec(texto);
  if (comWww) return `https://${limparPontuacaoFinal(comWww[0])}`;

  /**
   * Endereço sem `https://` e sem `www.` ("todamateria.com.br/fracoes"). Só quando o
   * corpo tem SÓ isso: no meio de uma frase, o mesmo padrão transformaria "dia 5.md" num
   * site. (O cliente aplica a mesma regra antes de chamar — esta é a rede.)
   */
  if (/^[^\s<>"']+$/.test(texto) && /^([a-z0-9][a-z0-9-]*\.)+[a-z]{2,}(?=[/:?#]|$)/i.test(texto)) {
    return `https://${limparPontuacaoFinal(texto)}`;
  }
  return "";
}

/* ==========================================================================
   SSRF
   ========================================================================== */

/**
 * O IP é de rede interna?
 *
 * A lista não é decorativa: `169.254.*` é onde vive o metadata endpoint da AWS, do GCP
 * e da Azure — o alvo número 1 de qualquer SSRF em nuvem.
 *
 * @param {string} ip
 * @returns {boolean}
 */
export function ehIpPrivado(ip) {
  const baixo = String(ip || "").toLowerCase();

  // IPv6 primeiro: o `::ffff:127.0.0.1` mapeado é IPv4 disfarçado, e passa batido em
  // qualquer checagem feita só com regex de IPv4.
  if (baixo.startsWith("::ffff:")) return ehIpPrivado(baixo.slice(7));
  if (baixo === "::1" || baixo === "::") return true;
  if (/^f[cd]/.test(baixo)) return true; // fc00::/7 — endereço único local
  if (baixo.startsWith("fe80")) return true; // link-local

  if (/^(10|127)\./.test(baixo)) return true;
  if (/^192\.168\./.test(baixo)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(baixo)) return true;
  if (/^169\.254\./.test(baixo)) return true;
  if (/^0\./.test(baixo)) return true;
  // CGNAT: é a faixa da rede interna de operadora e de boa parte das nuvens.
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(baixo)) return true;
  return false;
}

/**
 * Valida um destino ANTES de qualquer byte sair daqui.
 *
 * @param {string} url
 * @returns {Promise<URL>}
 * @throws {LinkRuim}
 */
export async function validarDestino(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new LinkRuim("Esse link não parece um endereço de site. Confira e cole de novo.");
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new LinkRuim("Só consigo abrir links que começam com http ou https.");
  }
  if (u.port && u.port !== "80" && u.port !== "443") {
    throw new LinkRuim("Esse link aponta pra uma porta que eu não abro.");
  }

  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  ) {
    throw new LinkRuim("Esse link aponta pra um endereço interno, não pra um site.");
  }
  // IP escrito direto na URL nem chega ao DNS — `lookup` devolveria ele mesmo, mas
  // barrar aqui deixa o motivo óbvio pra quem lê o código depois.
  if (ehIpPrivado(host)) {
    throw new LinkRuim("Esse link aponta pra um endereço interno, não pra um site.");
  }

  let ips;
  try {
    ips = await lookup(host, { all: true });
  } catch {
    throw new LinkRuim("Não achei esse site. Confira o endereço e tente de novo.");
  }
  if (!ips.length || ips.some((r) => ehIpPrivado(r.address))) {
    throw new LinkRuim("Esse link aponta pra um endereço interno, não pra um site.");
  }

  return u;
}

/**
 * `fetch` com UA de navegador e teto de tempo. Para host FIXO nosso (a InnerTube do
 * YouTube) — quando o host vem do pai, use `buscarComRedirect`, que valida o destino.
 *
 * @param {string|URL} url
 * @param {RequestInit} [opcoes]
 * @param {number} [ms]
 * @returns {Promise<Response>}
 */
export function buscarDireto(url, opcoes = {}, ms = TIMEOUT_LINK_MS) {
  return fetch(url, {
    ...opcoes,
    headers: { "User-Agent": UA, ...(opcoes.headers || {}) },
    signal: AbortSignal.timeout(ms),
  });
}

/**
 * Busca seguindo redirect NA MÃO, revalidando cada salto.
 *
 * @param {string} url
 * @param {{accept?:string}} [opcoes]
 * @returns {Promise<{resp: Response, url: string}>} a resposta e a URL FINAL
 * @throws {LinkRuim}
 */
export async function buscarComRedirect(url, { accept } = {}) {
  let atual = url;

  for (let salto = 0; salto <= MAX_REDIRECTS; salto++) {
    const u = await validarDestino(atual);

    let resp;
    try {
      resp = await fetch(u, {
        redirect: "manual",
        headers: {
          "User-Agent": UA,
          Accept:
            accept ||
            "text/html,application/xhtml+xml,application/pdf,text/plain;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
        signal: AbortSignal.timeout(TIMEOUT_LINK_MS),
      });
    } catch (err) {
      if (err?.name === "TimeoutError") {
        throw new LinkRuim("Esse site demorou demais pra responder. Tente de novo em instantes.");
      }
      throw new LinkRuim("Não consegui abrir esse site agora. Confira o endereço e tente de novo.");
    }

    if (resp.status >= 300 && resp.status < 400) {
      const destino = resp.headers.get("location");
      if (!destino) throw new LinkRuim("Esse site respondeu de um jeito que eu não entendi.");
      // Consome o corpo do 302 pra não deixar a conexão pendurada até o GC.
      await resp.body?.cancel().catch(() => {});
      atual = new URL(destino, u).href;
      continue;
    }

    return { resp, url: u.href };
  }

  throw new LinkRuim("Esse link fica redirecionando sem parar. Tente o endereço final.");
}

/**
 * Lê o corpo com teto, **contando os bytes que chegam**.
 *
 * Nunca pelo `content-length`: ele é declarado por quem responde, e um servidor hostil
 * (ou só mal configurado) declara 1 KB e manda 5 GB — que a gente aceitaria inteiro na
 * RAM da função.
 *
 * @param {Response} resp
 * @param {number} maxBytes
 * @param {string} recado — o que dizer ao pai quando estourar
 * @returns {Promise<Buffer>}
 */
export async function lerLimitado(resp, maxBytes, recado) {
  if (!resp.body) return Buffer.alloc(0);

  const pedacos = [];
  let total = 0;

  for await (const pedaco of resp.body) {
    total += pedaco.length;
    if (total > maxBytes) {
      await resp.body.cancel().catch(() => {});
      throw new LinkRuim(recado);
    }
    pedacos.push(pedaco);
  }

  return Buffer.concat(pedacos);
}
