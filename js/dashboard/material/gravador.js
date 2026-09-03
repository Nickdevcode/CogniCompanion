/**
 * gravador.js — Gravar o áudio na hora, pelo microfone.
 *
 * Separado do `audio.js` porque o ciclo de vida é oposto: aqui há permissão do
 * usuário, um stream de hardware que **precisa ser desligado** e estado que muda com
 * o tempo. Lá é tudo puro.
 *
 * 🔴 A regra inegociável deste arquivo: **o microfone desliga**. Um app sobre criança
 * que deixa o indicador de gravação aceso depois de o pai fechar o diálogo não tem um
 * vazamento de recurso — tem um problema de confiança, e é o tipo de coisa que faz
 * desinstalar. Por isso `parar()` e `descartar()` são idempotentes e o chamador é
 * obrigado a chamar `descartar()` no `onClose` do modal.
 */

/** Erro com mensagem já escrita pro pai — recusa de permissão é estado previsto. */
export class ErroDeGravacao extends Error {}

/**
 * Ordem de preferência de formato.
 *
 * 🔴 Nunca cravar um mime: o Chrome grava `audio/webm;codecs=opus`, o Safari abaixo
 * da 18.4 só `audio/mp4`, e `isTypeSupported` é a única forma honesta de descobrir.
 * A string vazia no fim entrega a escolha pro navegador, que é melhor que falhar.
 */
const FORMATOS = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "",
];

/** Teto de tempo. Acima disso o áudio não caberia no corpo da requisição. */
export const MAX_SEGUNDOS = 600;

/** Abaixo deste pico de RMS, a gravação é silêncio na prática. */
const LIMIAR_DE_SILENCIO = 0.01;

/** O navegador consegue gravar áudio aqui? */
export function suportaGravacao() {
  return Boolean(
    navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function" &&
      typeof window.MediaRecorder === "function"
  );
}

function escolherFormato() {
  for (const mime of FORMATOS) {
    if (!mime) return "";
    if (window.MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

/**
 * Traduz o erro do `getUserMedia`.
 *
 * São três causas distintas com três soluções distintas, e uma mensagem só pras três
 * ("não consegui acessar o microfone") deixa o pai sem saber o que fazer.
 */
function traduzirErro(err) {
  const nome = err && err.name;
  if (nome === "NotAllowedError" || nome === "SecurityError") {
    return new ErroDeGravacao(
      "Você precisa permitir o microfone pra gravar. Libere nas configurações do navegador e tente de novo."
    );
  }
  if (nome === "NotFoundError" || nome === "DevicesNotFoundError") {
    return new ErroDeGravacao("Não encontrei nenhum microfone neste aparelho.");
  }
  if (nome === "NotReadableError" || nome === "TrackStartError") {
    return new ErroDeGravacao(
      "O microfone está sendo usado por outro aplicativo. Feche o outro app e tente de novo."
    );
  }
  console.error("[Companion] getUserMedia falhou:", err);
  return new ErroDeGravacao("Não consegui ligar o microfone agora.");
}

/**
 * Cria um gravador.
 *
 * @param {object} [cfg]
 * @param {(segundos:number) => void} [cfg.aoTempo] — a cada segundo
 * @param {(nivel:number) => void} [cfg.aoNivel] — 0..1, pro medidor visual
 * @param {(motivo:string) => void} [cfg.aoLimite] — parou sozinho no teto
 * @param {number} [cfg.maxBytes]
 * @returns {Promise<object>}
 */
export async function criarGravador({ aoTempo, aoNivel, aoLimite, maxBytes } = {}) {
  if (!suportaGravacao()) {
    throw new ErroDeGravacao(
      "Este navegador não grava áudio. Mande o arquivo do áudio pelo botão “Escolher arquivo”."
    );
  }
  if (!window.isSecureContext) {
    // `getUserMedia` exige HTTPS (localhost conta). Dizer isso é melhor que deixar o
    // navegador devolver um NotAllowedError que parece recusa do usuário.
    throw new ErroDeGravacao(
      "A gravação só funciona no site publicado (conexão segura). Use o botão de arquivo por aqui."
    );
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
  } catch (err) {
    throw traduzirErro(err);
  }

  const mime = escolherFormato();
  let recorder;
  try {
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    console.error("[Companion] MediaRecorder recusou o formato:", err);
    throw new ErroDeGravacao("Este navegador não conseguiu iniciar a gravação.");
  }

  const pedacos = [];
  let bytes = 0;
  let inicio = 0;
  let segundos = 0;
  let picoDeNivel = 0;
  let relogio = null;
  let medidor = null;
  let audioCtx = null;
  let encerrado = false;
  let resolverParada = null;

  /* --- Medidor de nível: é o que detecta gravação muda ------------------- */
  try {
    audioCtx = new AudioContext();
    const analisador = audioCtx.createAnalyser();
    analisador.fftSize = 1024;
    audioCtx.createMediaStreamSource(stream).connect(analisador);
    const amostras = new Float32Array(analisador.fftSize);

    medidor = window.setInterval(() => {
      analisador.getFloatTimeDomainData(amostras);
      let soma = 0;
      for (let i = 0; i < amostras.length; i += 1) soma += amostras[i] * amostras[i];
      const rms = Math.sqrt(soma / amostras.length);
      if (rms > picoDeNivel) picoDeNivel = rms;
      aoNivel?.(Math.min(1, rms * 8));
    }, 120);
  } catch (err) {
    // Sem medidor a gravação continua funcionando; só perdemos o aviso de "mudo".
    console.debug("[Companion] Medidor de nível indisponível:", err);
  }

  function limpar() {
    if (relogio) window.clearInterval(relogio);
    if (medidor) window.clearInterval(medidor);
    relogio = null;
    medidor = null;
    // A ordem importa: parar as tracks é o que apaga o indicador de gravação do
    // navegador e devolve o microfone pro sistema.
    stream.getTracks().forEach((t) => t.stop());
    if (audioCtx) audioCtx.close().catch(() => {});
    audioCtx = null;
  }

  recorder.addEventListener("dataavailable", (e) => {
    if (!e.data || !e.data.size) return;
    pedacos.push(e.data);
    bytes += e.data.size;
    /**
     * `Number.isFinite`, e NÃO `maxBytes &&`: quem chama passa
     * `Math.min(TETO.audio, orcamento.restante()) * 0.7`, que vira **0** com a bandeja
     * cheia. Zero é falsy, então a guarda inteira se desligava justamente quando não
     * havia byte nenhum sobrando, e a gravação seguia até os 600 s pra ser recusada
     * depois. Sem teto declarado (`undefined`) continua sem teto, que é o contrato.
     */
    if (Number.isFinite(maxBytes) && bytes >= maxBytes && recorder.state === "recording") {
      aoLimite?.("tamanho");
      recorder.stop();
    }
  });

  recorder.addEventListener("stop", () => {
    limpar();
    if (resolverParada) {
      const blob = new Blob(pedacos, { type: mime || pedacos[0]?.type || "audio/webm" });
      resolverParada({
        blob,
        duracao_s: segundos,
        mudo: picoDeNivel < LIMIAR_DE_SILENCIO,
      });
      resolverParada = null;
    }
  });

  return {
    mime,

    iniciar() {
      if (recorder.state !== "inactive") return;
      pedacos.length = 0;
      bytes = 0;
      segundos = 0;
      picoDeNivel = 0;
      inicio = Date.now();
      // Fatias de 1 s: é o que permite medir o tamanho enquanto grava e parar no
      // teto, em vez de descobrir que estourou só no fim.
      recorder.start(1000);
      relogio = window.setInterval(() => {
        segundos = Math.round((Date.now() - inicio) / 1000);
        aoTempo?.(segundos);
        if (segundos >= MAX_SEGUNDOS && recorder.state === "recording") {
          aoLimite?.("tempo");
          recorder.stop();
        }
      }, 250);
    },

    /** @returns {Promise<{blob:Blob, duracao_s:number, mudo:boolean}>} */
    parar() {
      return new Promise((resolve) => {
        if (encerrado || recorder.state === "inactive") {
          resolve({ blob: new Blob(pedacos), duracao_s: segundos, mudo: true });
          return;
        }
        resolverParada = resolve;
        segundos = Math.round((Date.now() - inicio) / 1000);
        recorder.stop();
      });
    },

    gravando: () => recorder.state === "recording",

    /**
     * Solta tudo sem devolver áudio. Idempotente de propósito: é chamado do
     * `onClose` do modal, que pode disparar junto com um `parar()` em andamento.
     */
    descartar() {
      if (encerrado) return;
      encerrado = true;
      resolverParada = null;
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch (err) {
        console.debug("[Companion] MediaRecorder já estava parado:", err);
      }
      limpar();
    },
  };
}
