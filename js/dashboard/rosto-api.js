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
 * ⭐ 12/out/2026 — QUANDO O SERVIDOR ESTÁ FORA DE ALCANCE (o painel na Vercel, que é
 * o caso de sempre desde o Local Network Access — ver `servidor.js`), o PUT nem sai,
 * e o robô só via o desenho pelo UPDATE de persistência: 1,2 s DEPOIS de a criança
 * parar de arrastar, porque aquilo é um debounce. Era o "antes mudava na hora, agora
 * demora". Nesse caso o BANCO vira o caminho ao vivo (`criarGravadorPelaNuvem`):
 * UPDATE no mesmo ritmo do PUT, e o servidor do robô — que já escuta `criancas` pelo
 * Realtime — muda a cara assim que a linha chega.
 *
 * Nada aqui trata falha de rede como erro de tela: servidor fora do ar significa
 * "o robô não viu ainda", não "deu errado". Quem desenha continua desenhando.
 */

import { normalizarRosto, ROSTO_PADRAO } from "./rosto-preview.js";

/**
 * Ritmo do PUT ao vivo: no máximo um a cada ~150 ms (o valor vem do plano técnico).
 *
 * 🔴 É um RITMO, não um debounce — e já foi debounce. O slider dispara `input` a cada
 * ~16 ms, e um debounce de 150 ms reiniciava o relógio em cada um deles: medido, 0 PUT
 * num arraste contínuo de 1 s. O robô ficava parado o arraste inteiro e só pulava pra
 * cara final quando a criança soltava — o contrário do que esta tela existe pra fazer.
 */
const INTERVALO_ROBO_MS = 150;
/** Intervalo da gravação no banco — persistência não precisa de tempo real. */
const DEBOUNCE_BANCO_MS = 1200;
/** Teto por request: servidor fora do ar não pode deixar a UI pendurada. */
const TIMEOUT_MS = 4000;
/**
 * Quantas vezes o caminho pela nuvem tenta de novo o ÚLTIMO desenho que falhou.
 * Só o último: se a criança já mexeu de novo, o desenho novo é que importa.
 */
const NOVAS_TENTATIVAS_NUVEM = 2;
/** Respiro entre uma falha e a próxima tentativa — rede piscando volta em ~1 s. */
const ESPERA_APOS_FALHA_MS = 1500;

/**
 * Status da última tentativa de aplicar no robô.
 * @typedef {"aplicado"|"salvo"|"salvando"|"enviado"|"falhou"} StatusRosto
 *   - "aplicado": o robô estava ligado nesse perfil e já mudou de cara.
 *   - "salvo": guardado, mas o robô não viu (desligado, outro perfil, ou servidor
 *     fora do ar). NÃO é erro.
 *   - "salvando": request em voo.
 *   - "enviado": gravado na nuvem, de onde o robô ligado pega na hora. Pelo banco
 *     não dá pra saber se ele está ligado — então é "foi", e não "ele já mudou".
 *   - "falhou": a nuvem recusou mesmo depois das novas tentativas. É o único
 *     estado em que a escolha da criança NÃO ficou guardada.
 */

/**
 * fetch com timeout — devolve null em qualquer falha (incluindo servidor off).
 *
 * `url` vazia (ou que começa sem base) significa que o servidor local não está
 * ao alcance desta página — ver `servidor.js`. Sair aqui evita disparar um
 * request relativo contra a Vercel, que responderia 404 pra `/api/esp/rosto` e
 * ainda gastaria os 4s do timeout antes de cair no mesmo `null`.
 */
async function fetchOuNull(url, opcoes = {}) {
  if (!url || url.startsWith("/api/")) return null;
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
  // Sem servidor ao alcance o PUT não tem pra onde ir: o banco é que leva ao robô.
  if (!servidorUrl) return criarGravadorPelaNuvem({ crianca, mock, aoMudarStatus });

  let timerRobo = null;
  let timerBanco = null;
  let pendente = null; // último rosto que o usuário escolheu
  let ultimoEnviado = null; // último que chegou a sair pro servidor
  let ultimoEnvioEm = 0; // quando saiu o último PUT ao vivo (Date.now)

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

    // Já tem PUT marcado: ele vai levar o `pendente` mais novo quando sair, então
    // não há o que reagendar. Sem PUT marcado, sai assim que a janela de 150 ms
    // desde o último fechar — na hora, se a criança estava parada.
    if (!timerRobo) {
      const espera = Math.max(0, INTERVALO_ROBO_MS - (Date.now() - ultimoEnvioEm));
      timerRobo = setTimeout(() => {
        timerRobo = null;
        ultimoEnvioEm = Date.now();
        ultimoEnviado = pendente;
        enviarProRobo(pendente);
      }, espera);
    }

    clearTimeout(timerBanco);
    timerBanco = setTimeout(() => {
      timerBanco = null;
      gravarNoBanco(rosto);
    }, DEBOUNCE_BANCO_MS);
  }

  // Sair da tela (trocar de seção ou fechar a aba) não pode perder o desenho: o
  // debounce do banco é de 1,2 s e é fácil sair antes dele disparar.
  const soltar = vigiarSaidaDaTela({ descarregar, destruir: () => destruir() });

  function destruir() {
    soltar();
    descarregar();
  }

  return { agendar, destruir };
}

/**
 * Gravador do editor quando o servidor local está FORA DE ALCANCE: o banco é o
 * caminho ao vivo até o robô.
 *
 *   slider → UPDATE `criancas.rosto_robo` → Realtime → servidor do robô → olhos
 *
 * O servidor já escuta `criancas` pelo Realtime e reenvia o rosto quando o desenho
 * muda e é o perfil que o robô está usando (`registrarOuvintePerfilDoSite`, em
 * `Cogni/server/modules/esp.js`). O que faltava era o banco receber a mexida
 * ENQUANTO ela acontece, e não 1,2 s depois de a criança soltar o slider.
 *
 * DUAS REGRAS QUE O RITMO CARREGA:
 *
 *   1. UMA ESCRITA POR VEZ. Dois UPDATEs em voo podem chegar ao banco fora de
 *      ordem — e aí a linha termina com um desenho do MEIO do arraste, não com o
 *      que a criança escolheu. Com uma por vez, a ordem de chegada é a do dedo.
 *   2. A MAIS NOVA VENCE. O que se acumula enquanto uma escrita voa não vira
 *      fila: só o último desenho sai na próxima. O ritmo se ajusta sozinho à rede
 *      (no máximo um a cada ~150 ms, como o PUT; mais devagar se o banco demorar).
 *
 * Não existe um segundo UPDATE "de persistência" aqui: cada escrita ao vivo JÁ é a
 * gravação definitiva, e a última que sai é o desenho final.
 *
 * @param {object} cfg
 * @param {object} cfg.crianca
 * @param {object} cfg.mock — módulo de dados (pra `gravarRostoRobo`)
 * @param {(status: StatusRosto) => void} cfg.aoMudarStatus
 * @returns {{ agendar: (rosto: object) => void, destruir: () => void }}
 */
function criarGravadorPelaNuvem({ crianca, mock, aoMudarStatus }) {
  let pendente = null; // o desenho mais novo que ainda não saiu
  let emVoo = false; // há um UPDATE indo pro banco agora
  let timer = null;
  let ultimaSaidaEm = 0; // quando saiu o último UPDATE (Date.now)
  let ultimoGravado = null; // JSON do último desenho que o banco confirmou
  let falhasSeguidas = 0;
  let statusAtual = null;

  // Um anúncio por MUDANÇA de estado: o chip é `aria-live`, e reescrever o mesmo
  // texto a cada UPDATE de um arraste faria o leitor de tela repetir "Mandando pra
  // Cogni" cinco vezes por segundo.
  function mudarStatus(status) {
    if (status === statusAtual) return;
    statusAtual = status;
    aoMudarStatus(status);
  }

  function agendarEscrita(esperaMinima = 0) {
    // Com UPDATE em voo não se agenda nada: quem está voando reagenda ao pousar,
    // já levando o `pendente` mais novo.
    if (timer || emVoo) return;
    const ritmo = INTERVALO_ROBO_MS - (Date.now() - ultimaSaidaEm);
    timer = setTimeout(escrever, Math.max(0, esperaMinima, ritmo));
  }

  async function escrever() {
    timer = null;
    if (emVoo || !pendente) return;
    const rosto = pendente;
    pendente = null;

    // Arrastou e voltou exatamente pro que o banco já tem: nada a mandar.
    const json = JSON.stringify(rosto);
    if (json === ultimoGravado) {
      mudarStatus("enviado");
      return;
    }

    emVoo = true;
    ultimaSaidaEm = Date.now();
    mudarStatus("salvando");
    try {
      await mock.gravarRostoRobo(crianca.id, rosto);
      ultimoGravado = json;
      falhasSeguidas = 0;
      // Mantém o objeto em memória coerente com o banco: se a criança navegar pra
      // outra seção e voltar, a tela remonta com o que ela acabou de desenhar.
      crianca.rosto_robo = rosto;
    } catch (err) {
      falhasSeguidas++;
      console.error("[Companion] Não foi possível mandar o rosto pra nuvem:", err);
      // Nada mais novo chegou: este é o desenho em que a criança parou, e uma
      // piscada de rede não pode jogá-lo fora. Desenho novo na fila vence o velho.
      if (!pendente && falhasSeguidas <= NOVAS_TENTATIVAS_NUVEM) pendente = rosto;
    } finally {
      emVoo = false;
    }

    if (pendente) agendarEscrita(falhasSeguidas > 0 ? ESPERA_APOS_FALHA_MS : 0);
    else mudarStatus(falhasSeguidas > 0 ? "falhou" : "enviado");
  }

  function agendar(rosto) {
    pendente = rosto;
    agendarEscrita();
  }

  /** Manda agora o que estiver esperando o ritmo (saída da tela, fechar aba). */
  function descarregar() {
    if (!timer) return; // nada esperando — ou já em voo, e ele reagenda sozinho
    clearTimeout(timer);
    timer = null;
    escrever();
  }

  const soltar = vigiarSaidaDaTela({ descarregar, destruir: () => destruir() });

  function destruir() {
    soltar();
    descarregar();
  }

  return { agendar, destruir };
}

/**
 * Amarra o gravador ao ciclo de vida da tela e devolve quem desamarra.
 *
 * Trocar de seção também DESTRÓI o gravador: o router não avisa quando desmonta
 * uma seção, então sem isso cada visita à tela deixaria mais um par de listeners
 * pendurado no window, todos gravando o mesmo rosto.
 *
 * @param {object} cfg
 * @param {() => void} cfg.descarregar — fechar a aba: manda o que estiver pendente
 * @param {() => void} cfg.destruir — trocar de seção: desmonta o gravador
 * @returns {() => void} remove os dois listeners
 */
function vigiarSaidaDaTela({ descarregar, destruir }) {
  const aoFecharAba = () => descarregar();
  const aoTrocarSecao = () => destruir();
  window.addEventListener("pagehide", aoFecharAba);
  window.addEventListener("hashchange", aoTrocarSecao);
  return () => {
    window.removeEventListener("pagehide", aoFecharAba);
    window.removeEventListener("hashchange", aoTrocarSecao);
  };
}
