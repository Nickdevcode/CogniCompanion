/**
 * video.js — Vídeo → quadros + trilha. A função NUNCA sabe o que é vídeo.
 *
 * Um MP4 de 1 minuto tem 60-100 MB e jamais caberia no corpo da requisição. Então o
 * navegador decompõe: o vídeo vira `{tipo:"imagem"} × N` mais `{tipo:"audio"}`, e a
 * função continua conhecendo quatro tipos. O dia em que aceitarmos GIF ou uma
 * gravação de tela não muda uma linha dela.
 *
 * ## A fala tem prioridade sobre a imagem
 *
 * Num vídeo de aula, o que carrega a tarefa é o que a professora **diz**. Os quadros
 * mostram a lousa em instantes arbitrários: no melhor caso confirmam o assunto, no
 * pior pegam o quadro pela metade. Por isso:
 *
 * - o áudio é **reservado primeiro**, até 90 s, e os quadros preenchem o que sobrar
 *   (4 → 1);
 * - vídeo mais longo **não perde o áudio** — ele é cortado, e a tela avisa com uma
 *   saída que o pai consegue executar ("corte esse trecho no celular e mande de
 *   novo"). Cortar vídeo todo mundo sabe fazer; extrair a trilha de um MP4, não —
 *   pedir isso seria empurrar o nosso problema pra ele.
 *
 * ## A ORDEM de execução é o que faz a degradação funcionar
 *
 * Os quadros saem **antes** do áudio. O caminho dos quadros é streaming (`<video>` +
 * object URL + seek) e nunca materializa o arquivo; o risco de estourar a memória
 * mora inteiro no ramo do áudio, que precisa do arquivo completo em RAM. Fazendo os
 * quadros primeiro, qualquer falha de áudio ainda entrega um plano utilizável.
 */

import { desenharEmCanvas, deCanvas, liberarCanvas } from "./imagem.js";
import { deAudioBuffer } from "./audio.js";
import { tamanhoSerializado } from "./bytes.js";
import {
  VIDEO,
  AUDIO_TAXA,
  CUSTO_WAV_POR_SEGUNDO,
  segundosDeAudioQueCabem,
  quadrosQueCabem,
} from "./orcamento.js";

/** Erro com mensagem já escrita pro pai. */
export class ErroDeVideo extends Error {}

/**
 * Espaço que o áudio nunca toma, pra sempre sobrar um quadro.
 *
 * Um quadro de 1280px a JPEG 0.75 de lousa filmada dá ~120-180 KB depois do base64;
 * o laço de re-encode aperta a qualidade se precisar caber em menos.
 */
const PISO_DE_UM_QUADRO = 180_000;

/** Quantos segundos de fala podem ficar de fora antes de valer a pena avisar. */
const TOLERANCIA_DE_CORTE_S = 2;

/** Carrega os metadados (duração e dimensão) sem ler o corpo do arquivo. */
function carregarMetadados(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    // Sem isto o Safari recusa desenhar o vídeo no canvas por política de origem,
    // mesmo sendo um blob local.
    video.crossOrigin = "anonymous";

    video.addEventListener("loadedmetadata", () => resolve(video), { once: true });
    video.addEventListener(
      "error",
      () => reject(new ErroDeVideo("Não consegui abrir esse vídeo. Tente outro formato.")),
      { once: true }
    );
    window.setTimeout(
      () => reject(new ErroDeVideo("Esse vídeo demorou demais pra abrir.")),
      15000
    );
    video.src = url;
  });
}

/**
 * O vídeo tem trilha de áudio?
 *
 * Não existe API padrão, e a resposta muda duas coisas: quanto orçamento reservar, e
 * se uma falha de decodificação merece aviso (vídeo **mudo** vira só quadros **sem
 * aviso nenhum** — é o esperado, não uma falha). Devolve `null` quando não dá pra
 * saber.
 *
 * 🔴 `webkitAudioDecodedByteCount` **vale zero no `loadedmetadata`** e só ganha valor
 * depois que algo foi tocado. Usá-lo cedo faz o Chrome — o navegador da maioria dos
 * pais — classificar TODO vídeo como mudo e descartar o áudio em silêncio, que é
 * justamente a parte que carrega a tarefa. Por isso ele só conta com `depoisDeTocar`,
 * e a resposta no início vem do `captureStream()`, que já sabe nos metadados.
 *
 * @param {HTMLVideoElement} video
 * @param {{depoisDeTocar?: boolean}} [opcoes]
 * @returns {boolean|null}
 */
function pareceTerAudio(video, { depoisDeTocar = false } = {}) {
  if (typeof video.mozHasAudio === "boolean") return video.mozHasAudio; // Firefox
  if (video.audioTracks && typeof video.audioTracks.length === "number") {
    return video.audioTracks.length > 0; // Safari
  }

  const capturar = video.captureStream || video.mozCaptureStream;
  if (typeof capturar === "function") {
    try {
      const fluxo = capturar.call(video);
      const tem = fluxo.getAudioTracks().length > 0;
      // Solta na hora: um stream vivo segura o elemento em modo de captura, e o que
      // vem depois desta função é uma sequência de seeks.
      fluxo.getTracks().forEach((t) => t.stop());
      return tem;
    } catch (err) {
      console.debug("[Companion] captureStream indisponível:", err);
    }
  }

  if (depoisDeTocar && typeof video.webkitAudioDecodedByteCount === "number") {
    return video.webkitAudioDecodedByteCount > 0;
  }
  return null;
}

/**
 * Posiciona o vídeo num instante e espera o quadro estar de fato desenhável.
 *
 * 🔴 No iOS Safari, desenhar logo depois de setar `currentTime` captura o quadro
 * ANTERIOR. O `seeked` resolve — mas o evento não é confiável em todos os navegadores
 * (com `preload="metadata"` e rede local ele às vezes não dispara), então o timeout
 * entra como **rede**, com folga grande. Curto demais viraria corrida, e a corrida é
 * exatamente o bug que estamos evitando.
 */
function irPara(video, tempo) {
  return new Promise((resolve) => {
    let pronto = false;
    const fim = () => {
      if (pronto) return;
      pronto = true;
      resolve();
    };
    video.addEventListener("seeked", fim, { once: true });
    window.setTimeout(fim, 1500);
    video.currentTime = tempo;
  });
}

/** Espera um quadro ser efetivamente apresentado antes do `drawImage`. */
function esperarQuadro(video) {
  return new Promise((resolve) => {
    let pronto = false;
    const fim = () => {
      if (pronto) return;
      pronto = true;
      resolve();
    };
    if (typeof video.requestVideoFrameCallback === "function") {
      // A ferramenta certa: dispara quando um quadro novo foi apresentado.
      video.requestVideoFrameCallback(fim);
      window.setTimeout(fim, 600);
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(fim));
  });
}

/**
 * Extrai N quadros espalhados pelo vídeo.
 *
 * Os instantes são `duração × (i + 0.5) / n`: nunca o primeiro nem o último quadro,
 * que costumam ser preto, mão na frente da lente ou a lousa já apagada.
 */
async function extrairQuadros(video, quantos, alvoPorQuadro, { onProgresso, signal }) {
  /**
   * 🔴 O Safari só desenha vídeo no canvas depois de um `play()`/`pause()` mudo — sem
   * isso o canvas sai transparente e o modelo recebe quatro imagens em branco.
   */
  try {
    await video.play();
    video.pause();
  } catch (err) {
    console.debug("[Companion] play() mudo recusado (seguimos assim mesmo):", err);
  }

  const quadros = [];
  for (let i = 0; i < quantos; i += 1) {
    if (signal?.aborted) break;
    const tempo = (video.duration * (i + 0.5)) / quantos;
    await irPara(video, tempo);
    await esperarQuadro(video);

    let canvas;
    try {
      canvas = desenharEmCanvas(video, VIDEO.ladoMax);
      const pronto = await deCanvas(canvas, alvoPorQuadro, {
        ladoMax: VIDEO.ladoMax,
        qualidade: VIDEO.qualidade,
      });
      canvas = null; // `deCanvas` consome e libera
      const item = { tipo: "imagem", nome: `quadro-${i + 1}.jpg`, dados: pronto.url };
      // Mede o item já serializado, não o comprimento da data URL: é o número que a
      // plataforma vai medir, e o único que fecha com o teto do orçamento.
      quadros.push({ item, bytes: tamanhoSerializado(item) });
    } catch (err) {
      console.error("[Companion] Falha ao extrair o quadro", i + 1, err);
    } finally {
      liberarCanvas(canvas);
    }

    onProgresso?.(`pegando os quadros do vídeo (${i + 1} de ${quantos})…`);
  }
  return quadros;
}

/**
 * Decodifica a trilha, já na taxa de destino.
 *
 * 🔴 `new AudioContext({ sampleRate: 16000 })` **antes** do `decodeAudioData` faz o
 * resample acontecer durante a decodificação: 128 KB/s de PCM em vez de 384 KB/s.
 * Num vídeo de 5 minutos são **38 MB em vez de 115 MB**, por um argumento de
 * construtor. É a diferença entre caber e matar a aba num Android de 4 GB.
 */
async function decodificarTrilha(file) {
  let ctx = null;
  try {
    try {
      ctx = new AudioContext({ sampleRate: AUDIO_TAXA });
    } catch (err) {
      // Safari antigo recusa sampleRate no construtor: decodifica na taxa nativa e
      // reamostra depois (mais caro em memória, mas funciona).
      console.debug("[Companion] AudioContext com sampleRate recusado:", err);
      ctx = new AudioContext();
    }

    const bruto = await ctx.decodeAudioData(await file.arrayBuffer());
    if (bruto.sampleRate === AUDIO_TAXA) return bruto;

    const quadros = Math.max(1, Math.ceil(bruto.duration * AUDIO_TAXA));
    const offline = new OfflineAudioContext(1, quadros, AUDIO_TAXA);
    const fonte = offline.createBufferSource();
    fonte.buffer = bruto;
    fonte.connect(offline.destination);
    fonte.start();
    return await offline.startRendering();
  } finally {
    // O Chrome LANÇA a partir do ~6º AudioContext vivo na aba. Fechar não é higiene,
    // é o que impede a feature de parar de funcionar no sexto vídeo da sessão.
    if (ctx) await ctx.close().catch(() => {});
  }
}

/**
 * Vídeo → itens prontos, dentro do orçamento.
 *
 * @param {File} file
 * @param {ReturnType<import("./orcamento.js").novoOrcamento>} orcamento
 * @param {{onProgresso?:Function, signal?:AbortSignal, maxImagens?:number}} [ctx]
 * @returns {Promise<{itens:object[], bytes:number, resumo:object, aviso:string|null}>}
 */
export async function deArquivo(file, orcamento, { onProgresso, signal, maxImagens } = {}) {
  const url = URL.createObjectURL(file);
  let video = null;

  try {
    onProgresso?.("Abrindo o vídeo…");
    video = await carregarMetadados(url);
    const duracao = Number.isFinite(video.duration) ? video.duration : 0;
    if (!duracao) throw new ErroDeVideo("Não consegui ler a duração desse vídeo.");

    const temAudio = pareceTerAudio(video);
    /**
     * Guarda de memória: acima disto nem tenta o áudio. `decodeAudioData` precisa do
     * arquivo INTEIRO em RAM antes de decodificar, e derrubar a aba do celular é
     * muito pior que entregar o plano só com os quadros.
     */
    const grandeDemais = file.size > VIDEO.arquivoMaxParaAudio;
    const vaiTentarAudio = temAudio !== false && !grandeDemais;

    /**
     * 1. Reservar a fatia do áudio ANTES de decidir os quadros — a fala tem
     *    prioridade. Mas guardando um piso pra UM quadro: um plano de vídeo sem
     *    nenhuma imagem perde a única confirmação visual do assunto, e o custo disso
     *    (uns segundos de fala a menos) é muito menor que o benefício.
     */
    const segundosDesejados = Math.min(duracao, VIDEO.audioMaxSeg);
    const disponivelPraAudio = Math.max(0, orcamento.restante() - PISO_DE_UM_QUADRO);
    const segundosAudio = vaiTentarAudio
      ? segundosDeAudioQueCabem(
          Math.min(disponivelPraAudio, segundosDesejados * CUSTO_WAV_POR_SEGUNDO)
        )
      : 0;
    const reserva = Math.ceil(segundosAudio * CUSTO_WAV_POR_SEGUNDO);

    let quadros = [];
    orcamento.reservar(reserva);
    try {
      /* 2. Quadros primeiro (ver o cabeçalho: é a ordem que salva o plano). */
      /**
       * O teto de imagens do plano entra aqui junto com o de bytes.
       *
       * `quadrosQueCabem` só sabia de espaço; o teto de IMAGENS (4 por plano, o mesmo
       * do servidor) vive na bandeja. Sem cruzar os dois, um segundo vídeo extraía
       * mais 4 quadros que cabiam em bytes e estouravam a contagem, e quem avisava era
       * o 413 depois do envio. `undefined` (ninguém passou) mantém o comportamento
       * antigo, que é o dos testes e do modo mock.
       */
      const quantos = Number.isFinite(maxImagens)
        ? Math.min(quadrosQueCabem(orcamento.restante()), Math.max(0, maxImagens))
        : quadrosQueCabem(orcamento.restante());
      const alvoPorQuadro = Math.floor(orcamento.restante() / quantos);
      quadros = await extrairQuadros(video, quantos, alvoPorQuadro, {
        onProgresso,
        signal,
      });
      quadros.forEach((q) => orcamento.gastar(q.bytes));
    } finally {
      // `finally` porque a reserva é de um orçamento COMPARTILHADO com o resto da
      // bandeja: se a extração morresse no meio, o vídeo sairia mas os materiais
      // seguintes veriam menos espaço do que existe, para sempre.
      orcamento.liberarReserva(reserva);
    }

    /* 3. Agora o áudio. */
    const itens = quadros.map((q) => q.item);
    let bytes = quadros.reduce((s, q) => s + q.bytes, 0);
    let aviso = null;
    let duracaoAudio = 0;
    let cortado = false;

    if (segundosAudio > 0 && !signal?.aborted) {
      onProgresso?.("Separando o áudio do vídeo…");
      try {
        const buffer = await decodificarTrilha(file);
        const trilha = await deAudioBuffer(buffer, {
          maxSegundos: segundosAudio,
          nome: "trilha-do-video.wav",
        });
        itens.push(trilha.item);
        orcamento.gastar(trilha.bytes);
        bytes += trilha.bytes;
        duracaoAudio = trilha.duracao_s;
        /**
         * "Cortado" é o que o PAI precisa saber, não o que o encoder fez. Um WebM
         * costuma reportar a duração do vídeo alguns décimos diferente do tamanho
         * real da trilha, e um corte de 60 ms dispararia o aviso de "o vídeo é
         * longo, ouvi só o começo" num vídeo de 4 segundos — o tipo de mensagem que
         * ensina o pai a ignorar as nossas mensagens.
         */
        cortado = duracao - duracaoAudio > TOLERANCIA_DE_CORTE_S;
      } catch (err) {
        console.error("[Companion] Não consegui separar o áudio do vídeo:", err);
        /**
         * Degrada, não quebra: os quadros já estão prontos. Mas só avisa se o vídeo
         * REALMENTE tinha trilha — agora dá pra perguntar de novo, porque o
         * `play()`/`pause()` da extração já rodou e o contador do Chrome passou a
         * valer. Avisar num vídeo mudo seria explicar uma falha que não houve.
         */
        if (pareceTerAudio(video, { depoisDeTocar: true }) !== false) {
          aviso =
            "Não consegui separar o áudio desse vídeo; montei o plano só com o que dá pra ver na imagem.";
        }
      }
    } else if (grandeDemais) {
      aviso =
        "Esse vídeo é pesado demais pra eu escutar aqui. Peguei só as imagens; se a explicação falada importa, mande um trecho mais curto.";
    }
    // temAudio === false cai aqui sem aviso nenhum: vídeo mudo virar só quadros é o
    // comportamento esperado, não uma falha que mereça explicação.

    if (!itens.length) {
      throw new ErroDeVideo("Não consegui aproveitar nada desse vídeo. Tente outro.");
    }

    if (cortado) {
      const min = Math.floor(duracaoAudio / 60);
      const seg = Math.round(duracaoAudio % 60);
      const rotulo = min ? `${min}min${String(seg).padStart(2, "0")}` : `${seg}s`;
      const nQuadros = quadros.length;
      aviso =
        `O vídeo é longo: ouvi o começo (${rotulo}) e peguei ` +
        `${nQuadros} ${nQuadros === 1 ? "quadro" : "quadros"}. ` +
        "Se a explicação da tarefa está no fim, corte esse trecho no celular e mande de novo.";
    }

    return {
      itens,
      bytes,
      aviso,
      resumo: {
        quadros: quadros.length,
        duracaoAudio_s: Math.round(duracaoAudio),
        duracaoTotal_s: Math.round(duracao),
        cortado,
      },
    };
  } finally {
    if (video) {
      // O iOS tem um teto prático de decoders de vídeo simultâneos; soltar o src é o
      // que devolve o decoder, e `revokeObjectURL` sozinho não faz isso.
      video.removeAttribute("src");
      video.load();
    }
    URL.revokeObjectURL(url);
  }
}
