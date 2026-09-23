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
 * Faixas IPv4 que não são "a internet".
 *
 * A lista não é decorativa: `169.254.*` é onde vive o metadata endpoint da AWS, do GCP
 * e da Azure — o alvo número 1 de qualquer SSRF em nuvem. `100.64/10` é CGNAT (rede
 * interna de operadora e de boa parte das nuvens); `224/3` junta multicast, a faixa
 * reservada e o broadcast; o resto é faixa de documentação/benchmark, que nenhum site
 * de verdade usa.
 */
const FAIXAS_IPV4_INTERNAS = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
];

/** "10.0.0.1" → inteiro de 32 bits, ou `null` se não for um IPv4 em quatro partes. */
function ipv4ParaNumero(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const partes = m.slice(1).map(Number);
  if (partes.some((p) => p > 255)) return null;
  return ((partes[0] << 24) | (partes[1] << 16) | (partes[2] << 8) | partes[3]) >>> 0;
}

function ipv4Interno(n) {
  return FAIXAS_IPV4_INTERNAS.some(([base, bits]) => {
    const mascara = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return ((n & mascara) >>> 0) === ((ipv4ParaNumero(base) & mascara) >>> 0);
  });
}

/**
 * Os 32 bits finais de um IPv6, lidos como IPv4.
 *
 * 🔴 Aceita as DUAS grafias, e é a segunda que furava a trava: o `getaddrinfo` escreve o
 * mapeado como `::ffff:127.0.0.1`, mas o parser de URL do Node normaliza
 * `http://[::ffff:127.0.0.1]/` pra `[::ffff:7f00:1]` — e `7f00:1` não casava com regex
 * de IPv4 nenhuma. Medido: `[::ffff:169.254.169.254]` passava inteiro por `validarDestino`.
 *
 * @param {string} resto — o que vem depois do prefixo ("127.0.0.1" ou "7f00:1")
 * @returns {number|null}
 */
function ipv4DoFim(resto) {
  const pontos = ipv4ParaNumero(resto);
  if (pontos !== null) return pontos;
  const m = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(resto);
  if (!m) return null;
  return ((parseInt(m[1], 16) << 16) | parseInt(m[2], 16)) >>> 0;
}

function ipv6Interno(ip) {
  if (ip === "::" || ip === "::1") return true;

  /**
   * IPv4 embutido em IPv6: mapeado (`::ffff:`), NAT64 (`64:ff9b::`) e o
   * "compatível" obsoleto (`::a.b.c.d`), que o parser de URL ainda aceita. Os três
   * valem o que valer o IPv4 lá dentro.
   */
  for (const prefixo of ["::ffff:", "64:ff9b::", "::"]) {
    if (!ip.startsWith(prefixo)) continue;
    const v4 = ipv4DoFim(ip.slice(prefixo.length));
    if (v4 !== null) return ipv4Interno(v4);
  }

  if (/^64:ff9b:1:/.test(ip)) return true; // NAT64 de uso local (RFC 8215)
  if (/^f[cd][0-9a-f]{0,2}:/.test(ip)) return true; // fc00::/7 — endereço único local
  if (/^fe[89a-f][0-9a-f]?:/.test(ip)) return true; // fe80::/10 link-local + fec0::/10
  if (/^ff[0-9a-f]{0,2}:/.test(ip)) return true; // multicast
  return false;
}

/**
 * O IP é de rede interna?
 *
 * Recebe também NOME de host (é chamada com o `hostname` da URL antes do DNS), e nome
 * não é IP: devolve `false` e quem decide é a resolução. Antes, as regex de IPv6 rodavam
 * em qualquer string — e `fcc.gov` ou `fdc.nal.usda.gov` levavam "endereço interno"
 * por começarem com `fc`/`fd`.
 *
 * @param {string} ip
 * @returns {boolean}
 */
export function ehIpPrivado(ip) {
  const baixo = String(ip || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (baixo.includes(":")) return ipv6Interno(baixo);
  const v4 = ipv4ParaNumero(baixo);
  return v4 !== null && ipv4Interno(v4);
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
