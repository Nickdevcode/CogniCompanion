/**
 * orcamento.js — Os tetos, e a aritmética de "quanto ainda cabe".
 *
 * ⚠️ ESTE É O ARQUIVO QUE DECIDE A ARQUITETURA DA FEATURE.
 *
 * A Vercel corta o corpo da requisição em **4,5 MB antes de a nossa função rodar** —
 * o erro nem chega no nosso código (`FUNCTION_PAYLOAD_TOO_LARGE`), então a mensagem
 * que o pai veria não seria nossa. Por isso o teto vive AQUI, no cliente, e é checado
 * antes de subir. A função repete o número como segunda linha de defesa.
 *
 * Duas decisões que valem explicar:
 *
 * 1. **Um teto global, medido no corpo já serializado.** Somar comprimentos de base64
 *    parece equivalente e não é: deixa de fora o envelope do JSON, os nomes de arquivo
 *    acentuados e os escapes de `\n`/`\t` (que a extração de docx e xlsx produz aos
 *    montes). Os tetos POR TIPO abaixo continuam existindo, mas como orientação de UX
 *    ("esse PDF tem 4 MB, o limite é 3") — a rede de segurança é o teto global.
 *
 * 2. **Os tetos por tipo somam MUITO mais que o global, e isso é de propósito.** Eles
 *    são maxima individuais, não uma soma alcançável: 4 imagens grandes + 1 PDF + 1
 *    áudio dariam ~13 MB. Quem barra a combinação é o `CORPO_MAX`.
 *
 * 🔗 Espelhado em `api/_lib/itens.mjs`. Os dois lados NÃO podem importar o mesmo
 * arquivo (a Vercel não serve `api/*` como estático), então os números estão
 * duplicados de propósito, com um comentário em cada apontando pro outro. A função
 * valida com tetos >= aos daqui: divergência vira 413 honesto, nunca corpo cortado.
 */

import { custoEmBase64, binarioQueCabeEm } from "./bytes.js";

/* ==========================================================================
   Os números
   ========================================================================== */

/**
 * Teto do corpo INTEIRO, já serializado, em bytes. 4,0 MB deixa 11% de folga contra
 * os 4,5 MB da plataforma — espaço pro envelope e pra qualquer diferença de
 * contabilidade entre o que medimos e o que o proxy deles mede.
 */
export const CORPO_MAX = 4_000_000;

/** Materiais por geração. Seis é o que cabe na tela de revisão sem virar lista. */
export const MAX_ITENS = 6;

/** Tetos por tipo (orientação de UX — ver o cabeçalho). */
export const TETO = {
  imagem: 1_500_000,
  pdf: 3_000_000,
  /**
   * Maior que os outros porque a trilha de um vídeo é WAV cru: 90 s custam 3,84 MB
   * depois do base64. Áudio de arquivo (Opus do WhatsApp) nunca chega perto disso.
   */
  audio: 3_900_000,
};

/** Imagens por geração — 4 páginas fotografadas de uma folha. */
export const MAX_IMAGENS = 4;

/** Teto de texto extraído: por item e somando todos. */
export const MAX_TEXTO_ITEM = 30_000;
export const MAX_TEXTO_TOTAL = 60_000;

/** Foto de agenda/folha: precisa de letra pequena legível. */
export const FOTO = { ladoMax: 1600, qualidade: 0.82 };

/**
 * Vídeo. Os números saem da regra "a fala tem prioridade sobre a imagem" (plano
 * técnico, "🎬 Vídeo longo"): num vídeo de aula quem carrega a tarefa é o que a
 * professora DIZ; os quadros mostram a lousa em instantes arbitrários e, no melhor
 * caso, confirmam o assunto.
 */
export const VIDEO = {
  /** Quadro de vídeo é menor que foto: lousa filmada não tem letra miúda legível. */
  ladoMax: 1280,
  qualidade: 0.75,
  quadrosMax: 4,
  quadrosMin: 1,
  /** O áudio é reservado PRIMEIRO, até aqui. Acima disso ele é cortado, não perdido. */
  audioMaxSeg: 90,
  /**
   * Acima disso nem tenta extrair o áudio: `decodeAudioData` precisa do arquivo
   * INTEIRO na RAM, mais o PCM decodificado. Derrubar a aba do celular é pior que
   * entregar o plano só com os quadros.
   */
  arquivoMaxParaAudio: 200 * 1024 * 1024,
};

/** Taxa de amostragem da trilha: o que os modelos de transcrição esperam. */
export const AUDIO_TAXA = 16_000;

/** Bytes por segundo de WAV 16 kHz mono 16-bit, já contando o custo do base64. */
export const CUSTO_WAV_POR_SEGUNDO = custoEmBase64(AUDIO_TAXA * 2);

/* ==========================================================================
   A aritmética
   ========================================================================== */

/**
 * Um orçamento vivo, compartilhado por todos os materiais da bandeja.
 *
 * `reservar` existe pro vídeo: ele precisa separar a fatia do áudio ANTES de decidir
 * quantos quadros extrai. Sem isso o `video.js` re-derivaria o rateio por conta
 * própria — e o dia em que o teto mudasse, mudaria em um lugar só dos dois.
 *
 * @param {number} [total] — bytes
 */
export function novoOrcamento(total = CORPO_MAX) {
  let usado = 0;
  let reservado = 0;

  return {
    total,
    /** Bytes já comprometidos por materiais na bandeja. */
    usado: () => usado,
    /** O que ainda dá pra gastar, descontando o que está reservado. */
    restante: () => Math.max(0, total - usado - reservado),
    /** Idem, mas em bytes binários (antes do base64). */
    restanteBinario() {
      return binarioQueCabeEm(this.restante());
    },
    cabe: (n) => usado + reservado + n <= total,
    gastar(n) {
      usado += n;
    },
    /** Devolve o que um material removido da bandeja ocupava. */
    devolver(n) {
      usado = Math.max(0, usado - n);
    },
    reservar(n) {
      reservado += n;
    },
    liberarReserva(n) {
      reservado = Math.max(0, reservado - n);
    },
  };
}

/**
 * Quantos segundos de trilha cabem num orçamento, respeitando o teto de 90 s.
 * @param {number} bytesDisponiveis
 * @returns {number} segundos
 */
export function segundosDeAudioQueCabem(bytesDisponiveis) {
  const cabe = Math.floor(bytesDisponiveis / CUSTO_WAV_POR_SEGUNDO);
  return Math.max(0, Math.min(VIDEO.audioMaxSeg, cabe));
}

/**
 * Quantos quadros cabem no que sobrou depois de reservar o áudio.
 *
 * ⚠️ `custoPorQuadro` **não é uma estimativa de tamanho — é um piso de qualidade.**
 * Quem garante que os quadros cabem é o laço de re-encode do `imagem.js`, que recebe
 * `restante / quantos` como alvo e aperta até caber. Então o número aqui responde
 * outra pergunta: *abaixo de quantos bytes um quadro deixa de valer a pena?* Espremer
 * 4 quadros em 160 KB daria 40 KB cada, e a lousa vira um borrão — melhor um quadro
 * legível que quatro ilegíveis. 140 KB de base64 ≈ 105 KB de JPEG a 1280px, que é
 * onde texto de lousa filmada ainda se lê.
 *
 * Nunca devolve zero: um vídeo sempre rende pelo menos um quadro, porque um plano só
 * de áudio perde a única confirmação visual do assunto.
 *
 * @param {number} bytesDisponiveis
 * @param {number} [custoPorQuadro]
 * @returns {number}
 */
export function quadrosQueCabem(bytesDisponiveis, custoPorQuadro = 140_000) {
  const cabe = Math.floor(bytesDisponiveis / custoPorQuadro);
  return Math.max(VIDEO.quadrosMin, Math.min(VIDEO.quadrosMax, cabe));
}
