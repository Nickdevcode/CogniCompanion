/**
 * imagem.js — Arquivo (ou canvas) → data URL JPEG que CABE no orçamento.
 *
 * O redimensionamento veio de `captura.js` (o antigo `prepararImagem`) e ganhou a
 * peça que faltava: **um laço de re-encode que mede o que produziu**.
 *
 * O código antigo escalava pra 1600px, chamava `toBlob(…, 0.82)` e entregava sem
 * olhar o tamanho. Foto de página densamente impressa passa de 1 MB nesse caminho —
 * quatro delas estouram os 4,5 MB da plataforma, e o 413 que o pai veria seria da
 * Vercel, não nosso. Sem o laço, o teto por imagem é ficção.
 *
 * O que NÃO mudou, porque estava certo: `imageOrientation: "from-image"` (sem ele a
 * foto tirada com o celular deitado chega girada 90° e a IA lê um caderno de lado) e
 * a liberação explícita do bitmap.
 */

import { blobParaDataURL, binarioQueCabeEm } from "./bytes.js";
import { FOTO } from "./orcamento.js";

/** Erro com mensagem já escrita pro pai — não é bug, é estado previsto. */
export class ErroDeImagem extends Error {}

/**
 * Degraus do laço de re-encode, do melhor pro pior.
 *
 * Qualidade cai primeiro, dimensão depois: 0.50 num quadro de 1600px lê melhor que
 * 0.82 num de 1024px, porque o que mata leitura de caderno é perder pixel, não ganhar
 * artefato de compressão.
 *
 * O degrau inicial é escolhido por quem chama (`qualidadeMax`): foto de folha começa
 * em 0.82, quadro de vídeo em 0.75 — lousa filmada não tem letra miúda legível de
 * qualquer jeito, e a diferença de tamanho vira segundos de fala no orçamento.
 */
const QUALIDADES = [0.82, 0.75, 0.68, 0.6, 0.5];
const LADOS_DE_EMERGENCIA = [1280, 1024];

/**
 * Decodifica o arquivo respeitando a orientação EXIF.
 *
 * @param {Blob} file
 * @param {number} ladoMax
 * @returns {Promise<ImageBitmap|HTMLImageElement>}
 */
async function decodificar(file, ladoMax) {
  if (typeof createImageBitmap === "function") {
    try {
      /**
       * Em arquivo grande pedimos pro próprio decodificador escalar. Uma foto de
       * 108 MP decodifica 432 MB de RGBA se vier inteira; com a dica, o Chrome e o
       * Firefox decodificam-e-escalam sem nunca materializar o bitmap cheio.
       *
       * O alvo é o DOBRO do lado final de propósito: não dá pra saber a orientação
       * antes de decodificar, e `resizeWidth` mira na largura. Com a folga, uma foto
       * em pé continua com pixel de sobra pro passo do canvas, e uma imagem pequena
       * demais não é ampliada além do inofensivo.
       */
      const dicas = { imageOrientation: "from-image" };
      if (file.size > 25 * 1024 * 1024) {
        dicas.resizeWidth = ladoMax * 2;
        dicas.resizeQuality = "high";
      }
      return await createImageBitmap(file, dicas);
    } catch (err) {
      // Navegador sem a opção (ou formato que ele não decodifica): cai no <img>, que
      // já aplica o EXIF por padrão desde que o CSS não force `image-orientation`.
      console.debug("[Companion] createImageBitmap indisponível:", err);
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Libera o backing store na hora (1600×900 RGBA são 5,76 MB por canvas). */
export function liberarCanvas(canvas) {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

/**
 * Desenha uma fonte (bitmap, img, canvas ou vídeo) num canvas novo, cabendo em
 * `ladoMax` no maior lado. Nunca amplia.
 *
 * @param {CanvasImageSource & {width:number, height:number}} fonte
 * @param {number} ladoMax
 * @returns {HTMLCanvasElement}
 */
export function desenharEmCanvas(fonte, ladoMax) {
  const lw = fonte.width || fonte.videoWidth;
  const lh = fonte.height || fonte.videoHeight;
  if (!lw || !lh) throw new ErroDeImagem("Não consegui ler essa imagem.");

  const escala = Math.min(1, ladoMax / Math.max(lw, lh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(lw * escala));
  canvas.height = Math.max(1, Math.round(lh * escala));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(fonte, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** `canvas.toBlob` em forma de promise. */
function paraBlob(canvas, qualidade) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", qualidade));
}

/**
 * O laço: encode → mede → aperta → repete, até caber no alvo.
 *
 * @param {HTMLCanvasElement} canvasInicial — consumido; é liberado aqui
 * @param {number} alvoBase64 — teto em bytes DEPOIS do base64
 * @param {number} ladoMax
 * @param {number} qualidadeMax — o degrau em que o laço começa
 * @returns {Promise<{url:string, largura:number, altura:number, bytes:number}>}
 */
async function codificarAteCaber(canvasInicial, alvoBase64, ladoMax, qualidadeMax) {
  const alvoBinario = binarioQueCabeEm(alvoBase64);
  let canvas = canvasInicial;
  let melhor = null;

  const qualidades = QUALIDADES.filter((q) => q <= qualidadeMax);
  const lados = [ladoMax, ...LADOS_DE_EMERGENCIA.filter((l) => l < ladoMax)];

  try {
    for (let i = 0; i < lados.length; i += 1) {
      if (i > 0) {
        // Encolher redesenhando canvas→canvas: mais barato que decodificar de novo.
        const menor = desenharEmCanvas(canvas, lados[i]);
        liberarCanvas(canvas);
        canvas = menor;
      }

      for (const q of qualidades) {
        const blob = await paraBlob(canvas, q);
        if (!blob) throw new ErroDeImagem("Não consegui preparar essa imagem.");
        /**
         * Quando o encoder JPEG falha, a spec manda cair pro PNG **em silêncio** — e
         * 1600×900 em PNG são 2-4 MB, ou seja, o oposto do que o laço está tentando
         * fazer. Uma linha aqui evita um estouro de orçamento inexplicável.
         */
        if (blob.type !== "image/jpeg") {
          throw new ErroDeImagem("Este navegador não conseguiu comprimir a imagem.");
        }

        melhor = { blob, largura: canvas.width, altura: canvas.height };
        if (blob.size <= alvoBinario) {
          const url = await blobParaDataURL(blob);
          return { url, largura: canvas.width, altura: canvas.height, bytes: blob.size };
        }
      }
    }

    // Nem no degrau mais apertado coube. Entrega o menor que conseguimos: quem chamou
    // tem o número real e decide (a bandeja avisa antes de subir, com o tamanho).
    const url = await blobParaDataURL(melhor.blob);
    return {
      url,
      largura: melhor.largura,
      altura: melhor.altura,
      bytes: melhor.blob.size,
    };
  } finally {
    liberarCanvas(canvas);
  }
}

/**
 * Arquivo de imagem → data URL JPEG dentro do alvo.
 *
 * @param {Blob} file
 * @param {number} alvoBase64 — teto em bytes depois do base64
 * @param {object} [opcoes]
 * @param {number} [opcoes.ladoMax]
 * @param {number} [opcoes.qualidade]
 * @returns {Promise<{url:string, largura:number, altura:number, bytes:number}>}
 */
export async function deArquivo(
  file,
  alvoBase64,
  { ladoMax = FOTO.ladoMax, qualidade = FOTO.qualidade } = {}
) {
  const fonte = await decodificar(file, ladoMax);
  let canvas;
  try {
    canvas = desenharEmCanvas(fonte, ladoMax);
  } finally {
    // `finally` e não depois do draw: se `desenharEmCanvas` lançar (imagem de
    // dimensão zero, contexto perdido), o ImageBitmap vazaria até o GC — e com 6
    // materiais na bandeja isso acumula.
    if (fonte && typeof fonte.close === "function") fonte.close();
  }
  return codificarAteCaber(canvas, alvoBase64, ladoMax, qualidade);
}

/**
 * Canvas já desenhado → data URL JPEG dentro do alvo.
 *
 * É o que o `video.js` usa pros quadros. Existe pra que o laço de re-encode — que é
 * a peça que faz o teto valer — tenha UMA implementação só.
 *
 * @param {HTMLCanvasElement} canvas — consumido
 * @param {number} alvoBase64
 * @param {object} [opcoes]
 * @param {number} [opcoes.ladoMax]
 * @param {number} [opcoes.qualidade]
 * @returns {Promise<{url:string, largura:number, altura:number, bytes:number}>}
 */
export function deCanvas(
  canvas,
  alvoBase64,
  { ladoMax = FOTO.ladoMax, qualidade = FOTO.qualidade } = {}
) {
  return codificarAteCaber(canvas, alvoBase64, ladoMax, qualidade);
}
