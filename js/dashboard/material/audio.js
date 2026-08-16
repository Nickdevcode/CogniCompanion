/**
 * audio.js — Áudio → item pronto pra subir. Sem device, sem UI.
 *
 * Separado do `gravador.js` de propósito: aqui é tudo puro (arquivo ou AudioBuffer
 * entra, item sai), enquanto lá tem permissão, stream que precisa ser morto e estado
 * de interface. O `video.js` precisa DESTA metade e não pode arrastar `getUserMedia`
 * junto.
 *
 * O áudio não é lido no navegador: ele sobe e a função manda pra transcrição. É o
 * único material que atravessa inteiro, e é o que justifica o teto mais alto.
 */

import { blobParaDataURL, tamanhoSerializado } from "./bytes.js";
import { audioBufferParaWav } from "./wav.js";
import { VIDEO } from "./orcamento.js";

/** Erro com mensagem já escrita pro pai. */
export class ErroDeAudio extends Error {}

/**
 * Formatos que a API de transcrição documenta: mp3, mp4, mpeg, mpga, m4a, wav, webm.
 *
 * ⚠️ `.ogg`/`.opus` **não estão na lista oficial**, e é justamente o que a nota de voz
 * do WhatsApp vira no Android — o caso de uso mais provável da feature inteira. A
 * decisão é aceitar e mandar assim mesmo (o backend deles é ffmpeg, que decodifica),
 * com a função devolvendo uma mensagem que ensina se recusar. Barrar aqui seria
 * recusar o caso comum por causa de uma linha de documentação.
 */
const EXTENSOES = /\.(mp3|mp4|mpeg|mpga|m4a|wav|webm|ogg|opus|aac|weba)$/i;

/**
 * Duração de um arquivo de áudio, sem decodificar.
 *
 * `loadedmetadata` custa alguns KB do começo do arquivo. Vale o round-trip porque a
 * duração é o que a tela mostra pro pai ("áudio · 1min12") e o que a função usa pra
 * estimar o custo da transcrição.
 *
 * @param {Blob} blob
 * @returns {Promise<number|null>}
 */
export function duracaoDe(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const el = document.createElement("audio");
    el.preload = "metadata";

    const terminar = (valor) => {
      URL.revokeObjectURL(url);
      el.removeAttribute("src");
      el.load();
      resolve(valor);
    };

    el.addEventListener(
      "loadedmetadata",
      () => {
        // WebM gravado por MediaRecorder costuma vir sem duração no cabeçalho e
        // reporta Infinity. Não é erro: só não dá pra saber sem decodificar.
        terminar(Number.isFinite(el.duration) ? el.duration : null);
      },
      { once: true }
    );
    el.addEventListener("error", () => terminar(null), { once: true });
    // Rede: em alguns navegadores o metadata de um formato exótico nunca resolve.
    window.setTimeout(() => terminar(null), 4000);

    el.src = url;
  });
}

/**
 * Arquivo de áudio → item, sem transcodificar.
 *
 * @param {File} file
 * @param {number} teto — bytes do item já serializado
 * @returns {Promise<{item:object, bytes:number, duracao_s:number|null}>}
 */
export async function deArquivo(file, teto) {
  if (!EXTENSOES.test(file.name || "") && !/^audio\//.test(file.type || "")) {
    throw new ErroDeAudio(
      "Não reconheci esse áudio. Mande em MP3, M4A, WAV ou grave aqui pelo botão."
    );
  }

  const duracao = await duracaoDe(file);
  const dados = await blobParaDataURL(file);
  const item = {
    tipo: "audio",
    nome: file.name || "audio",
    mime: file.type || "audio/mpeg",
    dados,
    duracao_s: duracao == null ? null : Math.round(duracao),
  };

  const bytes = tamanhoSerializado(item);
  if (bytes > teto) {
    throw new ErroDeAudio(
      "Esse áudio é comprido demais pra mandar de uma vez. Mande um trecho menor."
    );
  }
  return { item, bytes, duracao_s: duracao };
}

/**
 * Blob recém-gravado (já sabemos a duração pelo cronômetro) → item.
 *
 * @param {Blob} blob
 * @param {number} duracaoSegundos
 * @param {number} teto
 * @returns {Promise<{item:object, bytes:number, duracao_s:number}>}
 */
export async function deGravacao(blob, duracaoSegundos, teto) {
  const dados = await blobParaDataURL(blob);
  const item = {
    tipo: "audio",
    nome: "gravacao",
    mime: blob.type || "audio/webm",
    dados,
    duracao_s: Math.round(duracaoSegundos),
  };
  const bytes = tamanhoSerializado(item);
  if (bytes > teto) {
    throw new ErroDeAudio("A gravação ficou longa demais. Grave um trecho menor.");
  }
  return { item, bytes, duracao_s: duracaoSegundos };
}

/**
 * AudioBuffer (a trilha de um vídeo) → item WAV, cortado pra caber.
 *
 * @param {AudioBuffer} buffer
 * @param {object} opcoes
 * @param {number} opcoes.maxSegundos
 * @param {string} [opcoes.nome]
 * @returns {Promise<{item:object, bytes:number, duracao_s:number, cortado:boolean}>}
 */
export async function deAudioBuffer(buffer, { maxSegundos = VIDEO.audioMaxSeg, nome = "trilha" } = {}) {
  const { blob, duracao_s, cortado } = audioBufferParaWav(buffer, { maxSegundos });
  const dados = await blobParaDataURL(blob);
  const item = {
    tipo: "audio",
    nome,
    mime: "audio/wav",
    dados,
    duracao_s: Math.round(duracao_s),
  };
  return { item, bytes: tamanhoSerializado(item), duracao_s, cortado };
}
