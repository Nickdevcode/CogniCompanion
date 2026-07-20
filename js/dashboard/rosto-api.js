/**
 * rosto-api.js — Leitura e gravação do rosto do robô.
 *
 * Duas fontes, de propósito (mesmo padrão do Resumo Semanal e da Dica):
 *
 *   • `criancas.rosto_robo` no Supabase → fonte ESTÁVEL. Sempre responde, mesmo
 *     com o servidor local desligado. É o que garante que a criança abre a tela e
 *     vê o rosto que ela desenhou ontem, sem depender de nada estar ligado.
 *   • `{SERVIDOR}/api/esp/rosto` → fonte AO VIVO. É quem fala com o robô físico.
 *
 * Na leitura os dois correm em paralelo e o endpoint vence se responder; na
 * escrita gravamos nos dois, com ritmos diferentes:
 *
 *   • PUT no servidor a cada ~150 ms → é o que faz o robô mudar de cara ENQUANTO
 *     a criança arrasta o slider. Sem isso a tela vira um formulário.
 *   • UPDATE no Supabase a cada ~1200 ms → é só persistência; martelar o banco a
 *     cada pixel arrastado não traria nada e gastaria cota à toa.
 *
 * Nada aqui trata falha de rede como erro de tela: servidor fora do ar significa
 * "o robô não viu ainda", não "deu errado". Quem desenha continua desenhando.
 */

import { normalizarRosto, ROSTO_PADRAO } from "./rosto-preview.js";

/** Intervalo do PUT ao vivo. O valor vem do plano técnico (~150 ms). */
const DEBOUNCE_ROBO_MS = 150;
/** Intervalo da gravação no banco — persistência não precisa de tempo real. */
const DEBOUNCE_BANCO_MS = 1200;
/** Teto por request: servidor fora do ar não pode deixar a UI pendurada. */
const TIMEOUT_MS = 4000;

/**
 * Status da última tentativa de aplicar no robô.
 * @typedef {"aplicado"|"salvo"|"salvando"} StatusRosto
 *   - "aplicado": o robô estava ligado nesse perfil e já mudou de cara.
 *   - "salvo": guardado, mas o robô não viu (desligado, outro perfil, ou servidor
 *     fora do ar). NÃO é erro.
 *   - "salvando": request em voo.
 */

/** fetch com timeout — devolve null em qualquer falha (incluindo servidor off). */
async function fetchOuNull(url, opcoes = {}) {
  try {
    const resp = await fetch(url, {
      ...opcoes,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    // Servidor desligado, CORS, timeout, JSON inválido: tudo cai aqui e vira
    // "não deu pra falar com o robô agora", que é um estado normal desta tela.
    return null;
  }
}

/**
 * Carrega o rosto atual da criança.
 *
 * @param {object} cfg
 * @param {string} cfg.servidorUrl
 * @param {object} cfg.crianca — linha de `criancas` (precisa de `id` e `rosto_robo`)
 * @returns {Promise<{rosto: object, padrao: object, doServidor: boolean}>}
 */
export async function carregarRosto({ servidorUrl, crianca }) {
  // A criança já veio do Supabase no boot do painel (main.js), então a fonte
  // estável é leitura de memória — instantânea e sem request nenhum.
  const doBanco = crianca && crianca.rosto_robo;

  const url =
    `${servidorUrl}/api/esp/rosto?usuarioId=` +
    encodeURIComponent(crianca && crianca.id);
  const doServidor = await fetchOuNull(url);

  if (doServidor && doServidor.rostoRobo) {
    return {
      rosto: normalizarRosto(doServidor.rostoRobo),
      padrao: normalizarRosto(doServidor.padrao || ROSTO_PADRAO),
      doServidor: true,
    };
  }

  return {
    rosto: normalizarRosto(doBanco || ROSTO_PADRAO),
    padrao: { ...ROSTO_PADRAO },
    doServidor: false,
  };
}

/**
 * Cria o gravador do editor. Ele recebe o rosto a cada mexida e cuida sozinho dos
 * dois ritmos de escrita, das corridas entre requests e do flush ao sair da tela.
 *
 * @param {object} cfg
 * @param {string} cfg.servidorUrl
 * @param {object} cfg.crianca
 * @param {object} cfg.mock — módulo de dados (pra `atualizarCrianca`)
 * @param {(status: StatusRosto) => void} cfg.aoMudarStatus
 * @returns {{ agendar: (rosto: object) => void, destruir: () => void }}
 */
export function criarGravadorRosto({ servidorUrl, crianca, mock, aoMudarStatus }) {
  let timerRobo = null;
  let timerBanco = null;
  let pendente = null; // último rosto que o usuário escolheu
  let ultimoEnviado = null; // último que chegou a sair pro servidor

  // Cada PUT leva um número de sequência. Uma resposta só conta se for do último
  // request disparado — senão, arrastar rápido faria uma resposta atrasada
  // sobrescrever o status de uma mais nova (o robô piscaria entre "aplicado" e
  // "salvo" sem motivo).
  let seq = 0;
  let seqAplicada = 0;

  async function enviarProRobo(rosto) {
    const meu = ++seq;
    aoMudarStatus("salvando");

    const resposta = await fetchOuNull(`${servidorUrl}/api/esp/rosto`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuarioId: crianca.id, ...rosto }),
      // Sobrevive ao fechamento da aba: sem isso o navegador aborta o PUT do
      // flush em `pagehide` e a última mexida da criança se perde. O payload tem
      // algumas dezenas de bytes, muito abaixo do limite de 64 KB do keepalive.
      keepalive: true,
    });

    if (meu < seqAplicada) return; // chegou fora de ordem: ignora
    seqAplicada = meu;

    // `aplicadoNoRobo: false` = salvou, mas o robô estava desligado ou noutro
    // perfil. Resposta nula = servidor fora do ar. Os dois são o mesmo recado
    // pra criança: "guardei, ele vê quando ligar".
    aoMudarStatus(resposta && resposta.aplicadoNoRobo ? "aplicado" : "salvo");
  }

  async function gravarNoBanco(rosto) {
    try {
      await mock.atualizarCrianca({ rosto_robo: rosto });
      // Mantém o objeto em memória coerente com o banco: se a criança navegar pra
      // outra seção e voltar, a tela remonta com o que ela acabou de desenhar.
      crianca.rosto_robo = rosto;
    } catch (err) {
      // Não vira erro de tela: o rosto já foi pro robô, que é o que ela vê.
      console.error("[Companion] Não foi possível salvar o rosto no banco:", err);
    }
  }

  /** Dispara agora o que estiver pendente (saída da tela, fechar aba). */
  function descarregar() {
    if (timerRobo) {
      clearTimeout(timerRobo);
      timerRobo = null;
    }
    if (timerBanco) {
      clearTimeout(timerBanco);
      timerBanco = null;
    }
    if (!pendente) return;
    const rosto = pendente;
    pendente = null;
    if (!ultimoEnviado || JSON.stringify(ultimoEnviado) !== JSON.stringify(rosto)) {
      enviarProRobo(rosto);
    }
    gravarNoBanco(rosto);
  }

  function agendar(rosto) {
    pendente = rosto;

    clearTimeout(timerRobo);
    timerRobo = setTimeout(() => {
      timerRobo = null;
      ultimoEnviado = rosto;
      enviarProRobo(rosto);
    }, DEBOUNCE_ROBO_MS);

    clearTimeout(timerBanco);
    timerBanco = setTimeout(() => {
      timerBanco = null;
      gravarNoBanco(rosto);
    }, DEBOUNCE_BANCO_MS);
  }

  // Sair da tela (trocar de seção ou fechar a aba) não pode perder o desenho: o
  // debounce do banco é de 1,2 s e é fácil sair antes dele disparar.
  //
  // Trocar de seção também DESTRÓI o gravador: o router não avisa quando desmonta
  // uma seção, então sem isso cada visita à tela deixaria mais um par de listeners
  // pendurado no window, todos gravando o mesmo rosto.
  const aoFecharAba = () => descarregar();
  const aoTrocarSecao = () => destruir();
  window.addEventListener("pagehide", aoFecharAba);
  window.addEventListener("hashchange", aoTrocarSecao);

  function destruir() {
    window.removeEventListener("pagehide", aoFecharAba);
    window.removeEventListener("hashchange", aoTrocarSecao);
    descarregar();
  }

  return { agendar, destruir };
}
