/**
 * bytes.js — Medir e converter bytes. A camada mais baixa de `material/`.
 *
 * Existe por um motivo só: o gargalo da feature inteira é o corpo da requisição,
 * que a Vercel corta em 4,5 MB **antes de a nossa função rodar**. Quem decide o que
 * cabe (`orcamento.js`) precisa de um número confiável, e "confiável" aqui quer
 * dizer medido na MESMA unidade que a plataforma mede: bytes do JSON já serializado,
 * não comprimento de string base64.
 */

/**
 * Blob → data URL (`data:<mime>;base64,…`).
 *
 * Via `FileReader`, e não `btoa(String.fromCharCode(...bytes))`: o spread de um
 * `Uint8Array` de alguns MB estoura a pilha de argumentos ("Maximum call stack size
 * exceeded") em todos os navegadores. O `FileReader` faz o base64 nativo, sem cópia
 * intermediária em JS.
 *
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export function blobParaDataURL(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error || new Error("Falha ao ler o arquivo."));
    fr.readAsDataURL(blob);
  });
}

/**
 * Quantos bytes um valor ocupa depois de virar JSON.
 *
 * É o número que importa: `JSON.stringify(x).length` conta CARACTERES, e um nome de
 * arquivo com acento ("redação.pdf") ocupa mais bytes que caracteres em UTF-8. O
 * `Blob` resolve os dois de uma vez — a serialização e a codificação.
 *
 * @param {unknown} valor
 * @returns {number} bytes
 */
export function tamanhoSerializado(valor) {
  return new Blob([JSON.stringify(valor)]).size;
}

/**
 * Quantos bytes de base64 saem de N bytes binários (sem contar o prefixo `data:`).
 *
 * Serve pra ESTIMAR antes de codificar — o alvo do laço de re-encode de imagem, por
 * exemplo. Depois de codificar, use `tamanhoSerializado`, que é exato.
 *
 * @param {number} bytes
 * @returns {number}
 */
export function custoEmBase64(bytes) {
  return Math.ceil(bytes / 3) * 4;
}

/**
 * O caminho inverso de `custoEmBase64`: quantos bytes binários cabem num orçamento
 * de base64. Usado pra escolher a duração do áudio e o alvo de qualidade do JPEG.
 *
 * @param {number} orcamentoBase64
 * @returns {number}
 */
export function binarioQueCabeEm(orcamentoBase64) {
  return Math.max(0, Math.floor(orcamentoBase64 / 4) * 3);
}

/**
 * Lê os primeiros bytes de um arquivo sem carregar o resto.
 *
 * `file.slice()` devolve um Blob preguiçoso: nada é lido do disco até o
 * `arrayBuffer()`. É o que permite farejar um `.pptx` de 40 MB pagando 16 bytes.
 *
 * @param {Blob} file
 * @param {number} [n]
 * @returns {Promise<Uint8Array>}
 */
export async function primeirosBytes(file, n = 16) {
  const buf = await file.slice(0, n).arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Compara o começo de um buffer com uma assinatura (magic bytes).
 * @param {Uint8Array} bytes
 * @param {number[]} assinatura
 * @param {number} [offset]
 * @returns {boolean}
 */
export function comecaCom(bytes, assinatura, offset = 0) {
  if (bytes.length < offset + assinatura.length) return false;
  return assinatura.every((b, i) => bytes[offset + i] === b);
}

/**
 * Formata bytes pra tela do pai: "1,2 MB", "840 KB".
 *
 * Base **1000**, não 1024. Dois motivos: o teto é escrito em decimal
 * (`CORPO_MAX = 4_000_000`), e mostrá-lo como "3,8 MB" faria a tela contradizer a
 * mensagem de erro; e é assim que iPhone e Android informam tamanho de arquivo, então
 * o número aqui bate com o que o pai vê na galeria dele.
 */
export function formatarBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return "0 KB";
  if (n < 1_000_000) return `${Math.round(n / 1000)} KB`;
  return `${(n / 1_000_000).toFixed(1).replace(".", ",")} MB`;
}

/** Formata segundos pra tela: "1min12", "48s". */
export function formatarDuracao(segundos) {
  const s = Math.max(0, Math.round(segundos || 0));
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  const resto = s % 60;
  return resto ? `${min}min${String(resto).padStart(2, "0")}` : `${min}min`;
}
