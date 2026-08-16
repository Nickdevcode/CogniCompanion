/**
 * mesa-realtime.js — O quadro da Mesa de Estudos em tempo real.
 *
 * É a primeira vez que o site assina um canal do Supabase. O motivo é a parte que
 * impressiona: com a Mesa aberta, **o card anda sozinho** enquanto a criança
 * conversa com o robô — a Cogni move o card e o pai vê acontecer.
 *
 * Este módulo cuida do canal, da classificação dos eventos e da FILA; quem mexe no
 * DOM é a seção (`sections/mesa.js`). A divisão existe porque as duas partes falham
 * de jeitos diferentes: aqui o risco é de rede e de ordem de chegada, lá é de
 * animação e foco.
 *
 * Três problemas que este arquivo existe pra resolver:
 *
 * 1. **O eco da própria escrita.** Quando o pai arrasta um card, o UPDATE dele volta
 *    pelo canal como um evento igualzinho ao da Cogni. Aplicar esse eco por cima de
 *    um arraste em andamento faria o card piscar. Distinguimos pelo contrato:
 *    movimento da Cogni traz `movida_por: 'cogni'`; o do pai traz `null` — sempre,
 *    porque é `moverTarefa()` do site que limpa o campo.
 * 2. **Evento no meio de um arraste.** Mexer no DOM com o dedo no card rouba o
 *    movimento de quem está arrastando. Os eventos vão pra uma fila e entram quando
 *    o quadro fica parado.
 * 3. **Canal que não sobe.** `CHANNEL_ERROR`/`TIMED_OUT` não podem quebrar a tela: a
 *    Mesa continua funcionando e passa a reler de tempos em tempos. Degradação
 *    graciosa, como o resto do projeto.
 *
 * ⚠️ Requer `plano_tarefas` publicada no Realtime
 * (`alter publication supabase_realtime add table plano_tarefas`). E cuidado com uma
 * armadilha já documentada no plano técnico: `SUBSCRIBED` **não prova** que a tabela
 * está publicada — o canal sobe igual, e os `.on()` de tabelas não publicadas
 * simplesmente nunca disparam, em silêncio. É por isso que o polling de reserva
 * existe mesmo com o canal "no ar".
 */

/** De quanto em quanto tempo relemos quando o canal está fora. */
const POLL_DEGRADADO_MS = 20000;

/** Releitura ao voltar pra aba só se o canal ficou quieto por mais que isto. */
const SILENCIO_SUSPEITO_MS = 30000;

/**
 * Quanto tempo uma escrita nossa fica "em voo" esperando o eco.
 * Sem prazo, um eco perdido numa oscilação de rede travaria aquele card pra sempre.
 */
const TTL_PENDENTE_MS = 12000;

/** Acima disto a fila deixou de ser delta e vira releitura: correto > esperto. */
const FILA_MAX = 50;

/**
 * Assina o quadro de uma criança.
 *
 * @param {object} cfg
 * @param {object} cfg.client — o client do Supabase (`window.cognifyAuth.getClient()`)
 * @param {string} cfg.criancaId
 * @param {() => boolean} cfg.estaOcupado — true enquanto há arraste em andamento
 * @param {(cb:Function) => void} cfg.aoFicarLivre — registra callback de "quadro parado"
 * @param {(evt:{tipo:string, linha:object, antiga:object|null, origem:string}) => void}
 *   cfg.aoTarefa — um delta de `plano_tarefas`, já classificado
 * @param {(evt:{tipo:string, linha:object, antiga:object|null}) => void} cfg.aoPlano
 * @param {(estado:'ao-vivo'|'degradado') => void} cfg.aoStatus
 * @param {() => Promise<any>} cfg.aoReler — releitura completa (a seção faz o diff)
 * @returns {{ marcarPendente:Function, esquecerPendente:Function, encerrar:Function }}
 */
export function assinarMesa({
  client,
  criancaId,
  estaOcupado,
  aoFicarLivre,
  aoTarefa,
  aoPlano,
  aoStatus,
  aoReler,
}) {
  /** Escritas nossas esperando o eco: id → { coluna, ordem, ate }. */
  const pendentes = new Map();
  /** Eventos represados durante um arraste. */
  let fila = [];
  let timerPoll = 0;
  let timerTtl = 0;
  let ultimoEventoEm = Date.now();
  let vivo = true;

  /* ---- Escritas em voo --------------------------------------------------- */

  /**
   * Registra que NÓS acabamos de gravar este movimento, pra reconhecer o eco.
   * Chamada ANTES do `await` do update: o eco pode voltar antes da resposta.
   */
  function marcarPendente(id, { coluna, ordem }) {
    pendentes.set(String(id), {
      coluna,
      ordem: Number(ordem),
      ate: Date.now() + TTL_PENDENTE_MS,
    });
  }

  /** A escrita falhou (ou já foi reconhecida): não espere mais o eco dela. */
  function esquecerPendente(id) {
    pendentes.delete(String(id));
  }

  function varrerPendentes() {
    const agora = Date.now();
    for (const [id, p] of pendentes) if (p.ate < agora) pendentes.delete(id);
  }

  /**
   * De quem é este evento?
   *   'cogni'   → a Cogni moveu (acende o selo ✨, anima, anuncia)
   *   'eco'     → é o retorno da nossa própria escrita (a tela já está certa)
   *   'externo' → outra aba, outro dispositivo, ou o servidor com algo mais novo
   */
  function classificar(linha) {
    // A regra 1 é à prova de bala por causa do contrato de escrita: TODA gravação do
    // pai manda `movida_por: null`. Então 'cogni' nunca pode ser eco nosso.
    if (linha.movida_por === "cogni") return "cogni";

    const p = pendentes.get(String(linha.id));
    if (!p) return "externo";
    pendentes.delete(String(linha.id));
    const igual =
      p.coluna === linha.coluna && Math.abs(p.ordem - Number(linha.ordem)) < 1e-6;
    // Casou = é o nosso eco. Não casou = o servidor tem algo mais novo que a nossa
    // escrita (alguém mexeu depois), e aí vale como externo.
    return igual ? "eco" : "externo";
  }

  /* ---- Fila -------------------------------------------------------------- */

  function despachar(evt) {
    ultimoEventoEm = Date.now();
    varrerPendentes();

    if (estaOcupado()) {
      fila.push(evt);
      return;
    }
    entregar(evt);
  }

  function entregar(evt) {
    try {
      if (evt.tabela === "planos_estudo") aoPlano(evt);
      else aoTarefa(evt);
    } catch (err) {
      console.error("[Companion] Falha ao aplicar evento da Mesa:", err);
      relerAgora();
    }
  }

  function drenar() {
    if (!vivo || !fila.length) return;
    const pendente = fila;
    fila = [];
    if (pendente.length > FILA_MAX) {
      relerAgora();
      return;
    }
    // Colapsa por (tabela, id): durante um arraste de 4 segundos a Cogni pode ter
    // mexido duas vezes no mesmo card, e só o estado final importa — reproduzir as
    // duas animações mostraria um passado que já não existe.
    const ultimo = new Map();
    for (const e of pendente) ultimo.set(`${e.tabela}:${e.id}`, e);
    for (const e of ultimo.values()) entregar(e);
  }

  if (typeof aoFicarLivre === "function") aoFicarLivre(drenar);

  /* ---- Normalização dos payloads ----------------------------------------- */

  /**
   * O payload do Realtime vira um evento nosso.
   *
   * ⚠️ No DELETE, `payload.old` traz **só a chave primária** (sem
   * `REPLICA IDENTITY FULL`, que a tabela não tem). Ou seja: não dá pra filtrar
   * DELETE por `plano_id` aqui. Quem resolve é a seção, que ignora id desconhecido —
   * e o roteamento sai de graça.
   */
  function normalizar(tabela, payload) {
    const tipo = payload.eventType || payload.type;
    const linha = payload.new && Object.keys(payload.new).length ? payload.new : null;
    const antiga = payload.old && Object.keys(payload.old).length ? payload.old : null;
    const id = (linha && linha.id) ?? (antiga && antiga.id);
    return {
      tabela,
      tipo,
      id,
      linha,
      antiga,
      origem: tipo === "DELETE" || !linha ? "externo" : classificar(linha),
    };
  }

  /* ---- Releitura --------------------------------------------------------- */

  let relendo = false;
  async function relerAgora() {
    if (!vivo || relendo) return;
    relendo = true;
    try {
      await aoReler();
    } catch (err) {
      console.debug("[Companion] Releitura da Mesa falhou:", err);
    } finally {
      relendo = false;
    }
  }

  /* ---- Degradação -------------------------------------------------------- */

  function ligarPoll() {
    if (timerPoll) return;
    timerPoll = window.setInterval(() => {
      if (!vivo) return;
      if (document.visibilityState !== "visible") return;
      relerAgora();
    }, POLL_DEGRADADO_MS);
  }

  function desligarPoll() {
    if (!timerPoll) return;
    window.clearInterval(timerPoll);
    timerPoll = 0;
  }

  /* ---- Canal ------------------------------------------------------------- */

  const filtro = `crianca_id=eq.${criancaId}`;
  const canal = client
    .channel("mesa-" + criancaId)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "plano_tarefas", filter: filtro },
      (payload) => despachar(normalizar("plano_tarefas", payload))
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "planos_estudo", filter: filtro },
      (payload) => despachar(normalizar("planos_estudo", payload))
    )
    .subscribe((status) => {
      console.info("[Companion] Realtime da Mesa:", status);
      if (status === "SUBSCRIBED") {
        aoStatus("ao-vivo");
        desligarPoll();
        // Releitura SEMPRE ao assinar: fecha a janela entre o SELECT inicial e o
        // canal subir, e o buraco de qualquer reconexão. É barato e evita a classe
        // inteira de bug "o card mudou enquanto eu conectava".
        relerAgora();
        return;
      }
      if (status === "CLOSED") {
        // Fechamento nosso, na desmontagem: não há nada a reportar.
        if (!vivo) return;
      }
      // CHANNEL_ERROR / TIMED_OUT / CLOSED inesperado.
      // Sem toast de propósito: isso dispara a cada oscilação de Wi-Fi e assustaria
      // o pai por algo que a tela já contorna sozinha.
      aoStatus("degradado");
      ligarPoll();
    });

  /* ---- Voltar pra aba ---------------------------------------------------- */

  function aoVoltarAba() {
    if (!vivo) return;
    if (document.visibilityState !== "visible") return;
    // Só relê se o canal andou quieto demais. Voltar pra aba a cada 5 segundos não
    // pode virar uma rajada de SELECTs.
    if (Date.now() - ultimoEventoEm > SILENCIO_SUSPEITO_MS) relerAgora();
  }
  document.addEventListener("visibilitychange", aoVoltarAba);
  window.addEventListener("online", relerAgora);

  timerTtl = window.setInterval(varrerPendentes, 15000);

  /** Desliga tudo. Chamado pela seção quando ela sai do DOM. */
  function encerrar() {
    if (!vivo) return;
    vivo = false;
    fila = [];
    pendentes.clear();
    desligarPoll();
    window.clearInterval(timerTtl);
    document.removeEventListener("visibilitychange", aoVoltarAba);
    window.removeEventListener("online", relerAgora);
    client.removeChannel(canal);
  }

  return { marcarPendente, esquecerPendente, encerrar };
}
