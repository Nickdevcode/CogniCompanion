/**
 * wav.js — AudioBuffer → WAV mono 16-bit PCM.
 *
 * Só o `video.js` usa: a trilha de um vídeo precisa sair do navegador num formato que
 * a API de transcrição aceite, e o navegador não tem encoder nativo de nada
 * comprimido que sirva. `MediaRecorder` só grava em tempo real (90 s de trilha
 * custariam 90 s de espera) e escrever um container Ogg ou WebM à mão seria uma
 * biblioteca — que está fora de escopo.
 *
 * Então WAV, com duas escolhas deliberadas:
 *
 * - **16 kHz**, que é a taxa que os modelos de transcrição esperam. Baixar pra 8 kHz
 *   cortaria pela metade o custo em bytes, mas mataria a banda de 4-8 kHz, que é onde
 *   vivem as fricativas — é exatamente a diferença entre "entregar terça" e "entregar
 *   Teresa". Economizar ali desfaria o motivo de ter escolhido o modelo melhor.
 * - **PCM linear 16-bit**, não µ-law. µ-law daria a mesma economia que 8 kHz sem
 *   perder banda, mas é `format tag 7` e não está na lista oficial de formatos aceitos
 *   — seria apostar a feature numa coisa que não dá pra testar sem gastar chamada.
 *
 * O preço dessas duas: **32 KB/s** (43 KB/s depois do base64). É por isso que o teto
 * da trilha é 90 s, e por isso o orçamento do vídeo é apertado.
 */

import { AUDIO_TAXA } from "./orcamento.js";

const CABECALHO = 44;
const BITS = 16;

/**
 * Mistura os canais num só e converte float [-1,1] → int16.
 *
 * Downmix por média (e não "pega o canal esquerdo"): num vídeo gravado de celular a
 * voz costuma estar nos dois canais com fases levemente diferentes, e descartar um
 * deles joga fora metade da relação sinal/ruído de graça.
 *
 * @param {AudioBuffer} buffer
 * @param {number} quadros — quantas amostras aproveitar (a partir do início)
 * @returns {Int16Array}
 */
function paraMonoInt16(buffer, quadros) {
  const canais = buffer.numberOfChannels;
  const saida = new Int16Array(quadros);
  const trilhas = [];
  for (let c = 0; c < canais; c += 1) trilhas.push(buffer.getChannelData(c));

  for (let i = 0; i < quadros; i += 1) {
    let soma = 0;
    for (let c = 0; c < canais; c += 1) soma += trilhas[c][i];
    const amostra = soma / canais;
    // Clamp antes de escalar: o decode pode devolver valores fora de [-1,1] e o
    // wrap-around de int16 vira estalo audível — que o modelo lê como ruído.
    const limitada = amostra < -1 ? -1 : amostra > 1 ? 1 : amostra;
    saida[i] = limitada < 0 ? limitada * 0x8000 : limitada * 0x7fff;
  }
  return saida;
}

/** Escreve uma string ASCII no DataView (as tags do RIFF). */
function escreverTexto(view, offset, texto) {
  for (let i = 0; i < texto.length; i += 1) {
    view.setUint8(offset + i, texto.charCodeAt(i));
  }
}

/**
 * AudioBuffer → Blob WAV mono 16-bit.
 *
 * @param {AudioBuffer} buffer
 * @param {object} [opcoes]
 * @param {number} [opcoes.maxSegundos] — corta no começo, não no fim
 * @returns {{blob: Blob, duracao_s: number, cortado: boolean}}
 */
export function audioBufferParaWav(buffer, { maxSegundos } = {}) {
  const taxa = buffer.sampleRate || AUDIO_TAXA;
  const limite = maxSegundos ? Math.ceil(maxSegundos * taxa) : buffer.length;
  const quadros = Math.min(buffer.length, limite);
  const cortado = quadros < buffer.length;

  const amostras = paraMonoInt16(buffer, quadros);
  const bytesDeDados = amostras.length * 2;
  const arquivo = new ArrayBuffer(CABECALHO + bytesDeDados);
  const view = new DataView(arquivo);

  escreverTexto(view, 0, "RIFF");
  view.setUint32(4, 36 + bytesDeDados, true); // tamanho do resto do arquivo
  escreverTexto(view, 8, "WAVE");

  escreverTexto(view, 12, "fmt ");
  view.setUint32(16, 16, true); // tamanho do bloco fmt (PCM)
  view.setUint16(20, 1, true); // formato 1 = PCM linear
  view.setUint16(22, 1, true); // canais = mono
  view.setUint32(24, taxa, true);
  view.setUint32(28, taxa * 2, true); // bytes por segundo
  view.setUint16(32, 2, true); // alinhamento de bloco (mono × 16 bits)
  view.setUint16(34, BITS, true);

  escreverTexto(view, 36, "data");
  view.setUint32(40, bytesDeDados, true);

  new Int16Array(arquivo, CABECALHO).set(amostras);

  return {
    blob: new Blob([arquivo], { type: "audio/wav" }),
    duracao_s: quadros / taxa,
    cortado,
  };
}
