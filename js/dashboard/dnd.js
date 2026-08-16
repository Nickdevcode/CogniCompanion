/**
 * dnd.js — Drag and drop de quadro (Kanban), escrito à mão com Pointer Events.
 *
 * Sem biblioteca e sem o drag-and-drop nativo do HTML5, e os dois motivos são
 * concretos: o nativo **não funciona em toque** (que é onde o pai usa o Companion),
 * e o SortableJS — a escolha óbvia — **não tem acessibilidade por teclado**. Como os
 * caminhos de teclado teriam que ser escritos de qualquer jeito, a biblioteca só
 * acrescentaria peso e uma animação que não dá pra controlar.
 *
 * O módulo não conhece Supabase, nem a Mesa, nem plano nenhum: ele calcula posição,
 * anima e chama `aoSoltar`. Quem grava é a seção.
 *
 * ┌─ Três decisões estruturais que explicam quase todo o resto ─────────────────┐
 * │ 1. O card em arraste vai pra uma CAMADA no <body>, não fica na coluna.      │
 * │    `.dash-section` tem `animation: … both`, então o `transform` do último   │
 * │    keyframe fica permanente — e um ancestral com `transform` vira bloco de  │
 * │    contenção pra `position: fixed` E contexto de empilhamento. Dentro da    │
 * │    seção, o fantasma se posicionaria relativo a ela (pulando junto com o    │
 * │    scroll) e pintaria POR BAIXO do header (z-index 110) e da tab bar (113). │
 * │ 2. A captura de ponteiro fica na RAIZ, nunca no card. Reparentar um nó que  │
 * │    tem `setPointerCapture` dispara `lostpointercapture` e o arraste morre   │
 * │    no primeiro frame. A raiz nunca é reparentada.                          │
 * │ 3. Corolário de CSS: o card é estilizado por classe própria, nunca por      │
 * │    descendência (`.mesa-col .mesa-card`), porque na camada os ancestrais    │
 * │    somem. A convenção BEM que o painel já usa resolve isso de graça.        │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Contrato de DOM esperado:
 *   raiz                                → o quadro
 *   [data-dnd-coluna="<id>"]            → a lista de cada coluna
 *   [data-dnd-card][data-id][data-ordem]→ filho direto da lista
 *   [data-dnd-ignorar]                  → subárvore que nunca inicia arraste
 */

/* --------------------------------------------------------------------------
   Constantes — cada número aqui tem um motivo, não é gosto
   -------------------------------------------------------------------------- */

/** Distância antes de um toque/clique virar arraste. Sem isso, tocar pra abrir o
 *  card vira drag e o pai não consegue mais clicar em nada. */
const LIMIAR_PX = 8;

/** Tempo de dedo parado antes de o arraste começar, em toque. Sem isso, rolar a
 *  página verticalmente arranca um card junto. */
const ESPERA_TOQUE_MS = 150;

/** Faixa de borda que liga o auto-scroll, e a velocidade máxima por frame. */
const BORDA_PX = 56;
const VEL_MAX = 18;

const MS_ATERRISSA = 180;
const MS_CANCELA = 200;
const CURVA = "cubic-bezier(.2,.7,.3,1)";

/** Movimento abaixo de meio pixel é ruído de subpixel — animar isso vira tremor. */
const EPSILON = 0.5;

const reduzido = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* --------------------------------------------------------------------------
   Ordenação fracionária
   -------------------------------------------------------------------------- */

/**
 * A `ordem` de um card solto entre dois vizinhos.
 *
 * `plano_tarefas.ordem` é `double precision` com gap de 1000 justamente pra isto:
 * gravar a MÉDIA dos vizinhos custa **1 UPDATE por movimento** em vez de reescrever
 * a coluna inteira a cada arraste.
 *
 * @param {number|null} anterior — ordem do card acima (null = soltou no topo)
 * @param {number|null} proximo — ordem do card abaixo (null = soltou no fim)
 * @returns {number}
 */
export function calcularOrdem(anterior, proximo) {
  if (anterior == null && proximo == null) return 1000;
  if (anterior == null) return proximo / 2;
  if (proximo == null) return anterior + 1000;
  return (anterior + proximo) / 2;
}

/**
 * O intervalo entre dois vizinhos ficou apertado demais pra continuar bissectando?
 *
 * Depois de ~10 solturas no mesmo ponto o gap de 1000 vira menos de 1, e a próxima
 * média começaria a esbarrar na precisão do double. Aí vale reindexar aquela coluna
 * (1000, 2000, 3000…) numa tacada — o que é raro por construção.
 */
export function precisaReindexar(anterior, proximo) {
  return anterior != null && proximo != null && proximo - anterior < 1;
}

/* --------------------------------------------------------------------------
   FLIP
   -------------------------------------------------------------------------- */

/**
 * Anima uma mudança de layout pela técnica FLIP (First, Last, Invert, Play).
 *
 * Mede onde os nós estão, executa a mutação de DOM, mede de novo, e aplica a
 * diferença como `transform` que é então removido — o navegador anima só a
 * composição, sem reflow por frame. É o que faz o rearranjo deslizar em vez de
 * teleportar.
 *
 * Exportado porque o Realtime usa exatamente o mesmo caminho pra animar o card que
 * a Cogni moveu sozinha.
 *
 * @param {HTMLElement[]} nos — os nós que podem mudar de lugar
 * @param {Function} mutar — a mutação de DOM
 * @param {{ms?:number, curva?:string}} [opcoes]
 */
export function flip(nos, mutar, { ms = MS_ATERRISSA, curva = CURVA } = {}) {
  if (reduzido()) {
    mutar();
    return;
  }
  const antes = new Map();
  for (const n of nos) antes.set(n, n.getBoundingClientRect());

  mutar();

  const animando = [];
  for (const n of nos) {
    const a = antes.get(n);
    if (!a || !n.isConnected) continue;
    const b = n.getBoundingClientRect();
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) continue;
    n.style.transition = "none";
    n.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    n.style.willChange = "transform";
    animando.push(n);
  }
  if (!animando.length) return;

  // Um rAF pra todos (e não um por nó): agenda a volta ao lugar depois que o
  // navegador já aplicou a inversão.
  requestAnimationFrame(() => {
    for (const n of animando) {
      n.style.transition = `transform ${ms}ms ${curva}`;
      n.style.transform = "";
    }
  });

  const limpar = () => {
    for (const n of animando) {
      n.style.transition = "";
      n.style.transform = "";
      n.style.willChange = "";
    }
  };
  // `transitionend` não dispara com a aba escondida — o timeout é a rede de
  // segurança, senão os cards ficariam com `transform` inline pra sempre.
  window.setTimeout(limpar, ms + 80);
}

/* --------------------------------------------------------------------------
   O quadro
   -------------------------------------------------------------------------- */

/**
 * Liga o drag and drop (ponteiro + teclado) num quadro de colunas.
 *
 * @param {object} cfg
 * @param {HTMLElement} cfg.raiz — o elemento do quadro
 * @param {Array<{id:string, titulo:string}>} cfg.colunas — na ordem visual
 * @param {(mov:{id:string, de:string, para:string, indice:number, ordem:number,
 *   reindexar:boolean}) => Promise<any>} cfg.aoSoltar — grava o movimento. Se
 *   rejeitar, o card volta sozinho pro lugar de origem.
 * @param {(colunaId:string, novas:Array<{id:string, ordem:number}>) => Promise<any>}
 *   [cfg.aoReindexar] — chamado só quando o gap acabou
 * @param {(texto:string) => void} [cfg.aoAnunciar] — default: região aria-live interna
 * @returns {object} a API do quadro
 */
export function criarQuadro({ raiz, colunas, aoSoltar, aoReindexar, aoAnunciar }) {
  if (!raiz) throw new Error("criarQuadro precisa de uma raiz.");

  const st = {
    modo: "ocioso", // ocioso | pendente | arrastando | teclado | soltando
    pid: null,
    toque: false,
    card: null,
    id: null,
    origem: null, // { lista, coluna, indice, ordem, referencia }
    placeholder: null,
    inicio: { x: 0, y: 0 },
    ponto: { x: 0, y: 0 },
    alvo: null, // { lista, coluna, indice }
    chaveAlvo: "",
    raf: 0,
    rafAuto: 0,
    ultimoT: 0,
    timerToque: 0,
    livres: [],
  };

  /* ---- Região de anúncio e instruções (acessibilidade) ------------------- */

  const anuncio = document.createElement("p");
  anuncio.className = "dnd-anuncio";
  anuncio.setAttribute("role", "status");
  anuncio.setAttribute("aria-live", "polite");
  anuncio.setAttribute("aria-atomic", "true");

  const instrucoes = document.createElement("p");
  instrucoes.className = "dnd-anuncio";
  instrucoes.id = "dnd-instrucoes-" + Math.round(performance.now());
  instrucoes.textContent =
    "Pressione Espaço para pegar a tarefa. Use as setas para escolher a coluna e a " +
    "posição, Espaço para soltar e Escape para cancelar.";
  raiz.append(anuncio, instrucoes);

  /**
   * Anuncia um movimento pro leitor de tela.
   * Texto idêntico duas vezes seguidas não é re-anunciado por parte dos leitores —
   * por isso limpamos a região e escrevemos no frame seguinte.
   */
  function anunciar(texto) {
    if (typeof aoAnunciar === "function") aoAnunciar(texto);
    anuncio.textContent = "";
    requestAnimationFrame(() => {
      anuncio.textContent = texto;
    });
  }

  /* ---- Consultas ao DOM -------------------------------------------------- */

  const listaDe = (colunaId) => raiz.querySelector(`[data-dnd-coluna="${colunaId}"]`);
  const colunaDe = (lista) => lista && lista.getAttribute("data-dnd-coluna");
  const tituloCol = (colunaId) =>
    (colunas.find((c) => c.id === colunaId) || {}).titulo || colunaId;

  /**
   * Os cards de uma lista, em ordem de DOM (o placeholder e o texto de "vazio"
   * ficam de fora).
   *
   * ⚠️ Não filtre o card em movimento aqui. No arraste por ponteiro ele já não é
   * filho da lista (está na camada), então some sozinho; no modo TECLADO ele
   * continua na lista, e excluí-lo fazia `indexOf` devolver −1 — o que virava
   * "posição 0 de 1" no leitor de tela e ↑/↓ que não mexiam em nada.
   */
  function cardsDe(lista) {
    if (!lista) return [];
    return Array.from(lista.children).filter((n) => n.matches("[data-dnd-card]"));
  }

  const rotuloDe = (card) =>
    (card.getAttribute("data-titulo") || card.textContent || "tarefa").trim();

  /* ---- Camada do fantasma ------------------------------------------------ */

  let camada = null;
  function garantirCamada() {
    if (camada && camada.isConnected) return camada;
    camada = document.createElement("div");
    camada.className = "dnd-camada";
    document.body.appendChild(camada);
    return camada;
  }

  /* ---- Armar os cards ---------------------------------------------------- */

  /**
   * Prepara os cards que ainda não foram preparados. Idempotente de propósito: quem
   * cria card é a seção (e o Realtime), então isto é chamado toda vez que o quadro
   * muda.
   */
  function sincronizar() {
    raiz.querySelectorAll("[data-dnd-card]:not([data-dnd-pronto])").forEach((card) => {
      card.setAttribute("data-dnd-pronto", "1");
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");
      card.setAttribute("aria-roledescription", "tarefa arrastável");
      card.setAttribute("aria-describedby", instrucoes.id);
      // Uma <img> ou <a> dentro do card ainda dispararia o arraste NATIVO do HTML5
      // por cima do nosso — e os dois juntos deixam o card preso no cursor.
      card.setAttribute("draggable", "false");
    });
  }

  /* ---- Movimento: o caminho único de commit ------------------------------ */

  /**
   * Aplica e grava um movimento. TUDO passa por aqui — arraste, teclado e menu "⋯".
   * Um caminho só é o que garante que os três não divergem.
   */
  async function comprometer({ card, listaDestino, indice, animar }) {
    const id = card.getAttribute("data-id");
    const de = st.origem ? st.origem.coluna : colunaDe(card.parentElement);
    const para = colunaDe(listaDestino);

    // `indice` é sempre a posição entre os OUTROS cards — vale igual pros dois
    // caminhos, porque quando o card já está na lista (teclado, e o ponteiro
    // depois do `restaurar`) o índice dele entre todos é o mesmo número.
    const vizinhos = cardsDe(listaDestino).filter((n) => n !== card);
    const anterior = vizinhos[indice - 1];
    const proximo = vizinhos[indice];
    const oa = anterior ? Number(anterior.getAttribute("data-ordem")) : null;
    const op = proximo ? Number(proximo.getAttribute("data-ordem")) : null;
    const ordem = calcularOrdem(oa, op);
    const reindexar = precisaReindexar(oa, op);

    // Otimista: o DOM já é a verdade da tela. Se a gravação falhar, revertemos.
    const ordemAntiga = card.getAttribute("data-ordem");
    const colunaAntiga = card.getAttribute("data-coluna");
    card.setAttribute("data-ordem", String(ordem));
    card.setAttribute("data-coluna", para);

    if (animar) {
      const nos = [...cardsDe(st.origem.lista), ...cardsDe(listaDestino), card];
      flip(nos, () => listaDestino.insertBefore(card, proximo || null));
    }

    anunciar(
      `Movido para ${tituloCol(para)}, posição ${indice + 1} de ${
        cardsDe(listaDestino).length
      }.`
    );

    try {
      await aoSoltar({ id, de, para, indice, ordem, reindexar });
    } catch (err) {
      card.setAttribute("data-ordem", ordemAntiga || "");
      card.setAttribute("data-coluna", colunaAntiga || de);
      const volta = [...cardsDe(st.origem.lista), ...cardsDe(listaDestino), card];
      flip(volta, () =>
        st.origem.lista.insertBefore(card, st.origem.referencia || null)
      );
      anunciar("Não consegui mover a tarefa. Ela voltou para o lugar.");
      throw err;
    }

    if (reindexar && typeof aoReindexar === "function") {
      const novas = cardsDe(listaDestino).map((n, i) => ({
        id: n.getAttribute("data-id"),
        ordem: (i + 1) * 1000,
      }));
      novas.forEach((n, i) => {
        const no = listaDestino.querySelector(`[data-id="${n.id}"]`);
        if (no) no.setAttribute("data-ordem", String((i + 1) * 1000));
      });
      try {
        await aoReindexar(para, novas);
      } catch (err) {
        // A posição na tela está certa; só a numeração do banco ficou apertada.
        // Reclamar disso com o pai seria ruído — o próximo movimento reindexa.
        console.warn("[Companion] Reindexação da coluna falhou:", err);
      }
    }
  }

  /** Avisa quem espera o quadro ficar parado (a fila do Realtime pendura aqui). */
  function liberar() {
    st.modo = "ocioso";
    const fila = st.livres.slice();
    for (const cb of fila) {
      try {
        cb();
      } catch (err) {
        console.error("[Companion] Callback de fim de arraste falhou:", err);
      }
    }
  }

  /* ---- Ponteiro ---------------------------------------------------------- */

  function aoDescer(e) {
    if (st.modo !== "ocioso" || e.button > 0) return;
    const card = e.target.closest("[data-dnd-card]");
    if (!card || !raiz.contains(card)) return;
    // Botões, links e o menu "⋯" têm vida própria — arrastar a partir deles seria
    // roubar o clique de quem só queria apertar.
    if (e.target.closest("[data-dnd-ignorar], button, a, input, select, textarea")) {
      return;
    }

    st.pid = e.pointerId;
    st.toque = e.pointerType !== "mouse";
    st.card = card;
    st.id = card.getAttribute("data-id");
    st.inicio = { x: e.clientX, y: e.clientY };
    st.ponto = { x: e.clientX, y: e.clientY };
    st.modo = "pendente";

    // Captura na RAIZ (ver a decisão 2 no topo do arquivo).
    try {
      raiz.setPointerCapture(e.pointerId);
    } catch (err) {
      /* ponteiro já foi embora: o gesto simplesmente não começa */
    }

    raiz.addEventListener("pointermove", aoMover, { passive: false });
    raiz.addEventListener("pointerup", aoSubir);
    raiz.addEventListener("pointercancel", aoAbortarGesto);
    raiz.addEventListener("lostpointercapture", aoAbortarGesto);
    document.addEventListener("touchmove", bloquearScroll, { passive: false });

    if (st.toque) {
      st.timerToque = window.setTimeout(promover, ESPERA_TOQUE_MS);
    }
  }

  /**
   * Segura o scroll do navegador durante o arraste em toque.
   * `touch-action` é lido no INÍCIO do gesto: trocar pra `none` no meio não desfaz
   * uma rolagem já iniciada. Daí bloquear o `touchmove` por JS.
   */
  function bloquearScroll(e) {
    if (st.modo === "arrastando" && e.cancelable) e.preventDefault();
  }

  function aoMover(e) {
    if (e.pointerId !== st.pid) return; // um segundo dedo não comanda nada
    st.ponto = { x: e.clientX, y: e.clientY };

    if (st.modo === "pendente") {
      const dist = Math.hypot(e.clientX - st.inicio.x, e.clientY - st.inicio.y);
      if (dist <= LIMIAR_PX) return;
      // No toque, sair do lugar ANTES dos 150ms significa que o dedo está rolando a
      // página, não pegando o card. Devolvemos o gesto ao navegador.
      if (st.toque) return desarmar();
      promover();
      return;
    }
    if (st.modo !== "arrastando") return;
    if (e.cancelable) e.preventDefault();
    agendar();
  }

  /** Promove o gesto a arraste: tira o card do fluxo e põe na camada. */
  function promover() {
    window.clearTimeout(st.timerToque);
    if (st.modo !== "pendente" || !st.card) return;
    const card = st.card;

    // LEITURA primeiro, escrita depois — misturar as duas custa um reflow por linha.
    const r = card.getBoundingClientRect();
    const lista = card.parentElement;
    const irmaos = cardsDe(lista);
    st.origem = {
      lista,
      coluna: colunaDe(lista),
      indice: irmaos.indexOf(card),
      ordem: Number(card.getAttribute("data-ordem")),
      referencia: card.nextElementSibling,
    };

    const ph = document.createElement("div");
    ph.className = "dnd-placeholder";
    ph.style.height = `${r.height}px`;
    lista.insertBefore(ph, card);
    st.placeholder = ph;

    card.classList.add("is-arrastando");
    card.style.position = "fixed";
    card.style.left = `${r.left}px`;
    card.style.top = `${r.top}px`;
    card.style.width = `${r.width}px`;
    card.style.height = `${r.height}px`;
    card.style.margin = "0";
    card.style.transform = "translate3d(0,0,0)";
    card.style.willChange = "transform";
    garantirCamada().appendChild(card);

    raiz.classList.add("is-arrastando");
    document.body.classList.add("dnd-arrastando");
    st.modo = "arrastando";
    st.alvo = { lista, coluna: st.origem.coluna, indice: st.origem.indice };
    st.chaveAlvo = `${st.origem.coluna}:${st.origem.indice}`;

    if (navigator.vibrate) navigator.vibrate(10);
    anunciar(`Pegou ${rotuloDe(card)}. Arraste para mover.`);
  }

  function agendar() {
    if (st.raf) return;
    st.raf = requestAnimationFrame(passo);
  }

  /** Um frame de arraste: lê o layout todo, depois escreve o que mudou. */
  function passo(ts) {
    st.raf = 0;
    if (st.modo !== "arrastando" || !st.card) return;

    /* --- leitura --- */
    const rRaiz = raiz.getBoundingClientRect();
    let alvoLista = null;
    for (const c of colunas) {
      const lista = listaDe(c.id);
      if (!lista) continue;
      const rc = lista.getBoundingClientRect();
      // Folga vertical: soltar um pouco acima/abaixo da lista ainda conta como a
      // coluna. Sem isso, coluna curta vira um alvo que só acerta quem mira bem.
      if (
        st.ponto.x >= rc.left &&
        st.ponto.x <= rc.right &&
        st.ponto.y >= rc.top - 40 &&
        st.ponto.y <= rc.bottom + 40
      ) {
        alvoLista = lista;
        break;
      }
    }

    let indice = 0;
    if (alvoLista) {
      const outros = cardsDe(alvoLista);
      for (const n of outros) {
        const rn = n.getBoundingClientRect();
        if (rn.top + rn.height / 2 < st.ponto.y) indice += 1;
      }
    }

    /* --- escrita --- */
    st.card.style.transform = `translate3d(${st.ponto.x - st.inicio.x}px, ${
      st.ponto.y - st.inicio.y
    }px, 0)`;
    st.card.classList.toggle("is-fora", !alvoLista);

    for (const c of colunas) {
      const l = listaDe(c.id);
      if (l) l.classList.toggle("is-alvo", l === alvoLista);
    }

    const chave = alvoLista ? `${colunaDe(alvoLista)}:${indice}` : "fora";
    if (chave !== st.chaveAlvo) {
      st.chaveAlvo = chave;
      if (alvoLista) {
        st.alvo = { lista: alvoLista, coluna: colunaDe(alvoLista), indice };
        const outros = cardsDe(alvoLista);
        const nos = [...cardsDe(st.origem.lista), ...outros];
        flip(nos, () => alvoLista.insertBefore(st.placeholder, outros[indice] || null));
      } else {
        st.alvo = null;
      }
    }

    avaliarAutoScroll(rRaiz, ts);
  }

  /* ---- Auto-scroll ------------------------------------------------------- */

  /**
   * Rola a janela (vertical) e o quadro (horizontal) quando o ponteiro chega perto
   * da borda. Obrigatório no mobile, onde a coluna não cabe na tela — sem isto não
   * há como levar um card de "A fazer" até "Feito".
   */
  function avaliarAutoScroll(rRaiz, ts) {
    const dt = st.ultimoT ? Math.min(48, ts - st.ultimoT) : 16.67;
    st.ultimoT = ts;

    const alturaVisivel = (window.visualViewport && window.visualViewport.height) ||
      window.innerHeight;
    const vy = rampa(st.ponto.y, topoUtil(), alturaVisivel - baseUtil());
    const rolaX = raiz.scrollWidth > raiz.clientWidth + 1;
    const vx = rolaX ? rampa(st.ponto.x, rRaiz.left, rRaiz.right) : 0;

    if (!vy && !vx) {
      st.ultimoT = 0;
      return;
    }
    const fator = dt / 16.67;
    if (vy) window.scrollBy(0, vy * fator);
    if (vx) raiz.scrollLeft += vx * fator;
    // Com o dedo PARADO na borda não chegam mais `pointermove`, então o próximo
    // frame precisa ser agendado daqui — senão a rolagem para junto com o dedo.
    agendar();
  }

  /** Velocidade em função da proximidade da borda (quadrática: começa suave). */
  function rampa(p, ini, fim) {
    let d = 0;
    if (p - ini < BORDA_PX) d = -(BORDA_PX - (p - ini));
    else if (fim - p < BORDA_PX) d = BORDA_PX - (fim - p);
    if (!d) return 0;
    const sinal = Math.sign(d);
    const forca = Math.min(1, Math.abs(d) / BORDA_PX);
    return sinal * VEL_MAX * forca * forca;
  }

  /** Onde o header sticky termina — não dispare auto-scroll embaixo dele. */
  function topoUtil() {
    const h = document.querySelector(".dash-header");
    return h ? h.getBoundingClientRect().bottom : 0;
  }

  /** Altura da tab bar (mobile), pelo mesmo motivo. */
  function baseUtil() {
    const t = document.querySelector(".dash-tabbar");
    if (!t) return 0;
    const r = t.getBoundingClientRect();
    return r.height && r.top < window.innerHeight ? r.height : 0;
  }

  /* ---- Soltar ------------------------------------------------------------ */

  async function aoSubir(e) {
    if (e && e.pointerId !== st.pid) return;
    if (st.modo === "pendente") return desarmar();
    if (st.modo !== "arrastando") return;

    st.modo = "soltando";
    if (st.raf) cancelAnimationFrame(st.raf);
    st.raf = 0;
    st.ultimoT = 0;

    const card = st.card;
    const destino = st.alvo;

    if (!destino) {
      // Soltou fora de qualquer coluna: cancela e volta pro lugar, com animação.
      const phCancelado = st.placeholder;
      await aterrissar(card, phCancelado, MS_CANCELA);
      restaurar(card, phCancelado);
      anunciar("Movimento cancelado. A tarefa voltou para o lugar.");
      desarmar();
      liberar();
      return;
    }

    const ph = st.placeholder;
    await aterrissar(card, ph, MS_ATERRISSA);
    const lista = destino.lista;
    const indice = destino.indice;
    restaurar(card, ph);

    try {
      // O card já está no lugar certo (o placeholder foi trocado por ele), então o
      // commit não precisa animar de novo.
      await comprometer({ card, listaDestino: lista, indice, animar: false });
    } catch (err) {
      console.error("[Companion] Falha ao mover a tarefa:", err);
    } finally {
      desarmar();
      liberar();
    }
  }

  /** Voa o fantasma até o buraco do placeholder e troca um pelo outro. */
  function aterrissar(card, ph, ms) {
    return new Promise((resolve) => {
      if (!card || !ph || !ph.isConnected || reduzido()) return resolve();
      const rc = card.getBoundingClientRect();
      const rp = ph.getBoundingClientRect();
      const dx = rp.left - rc.left;
      const dy = rp.top - rc.top;
      if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) return resolve();

      const atual = card.style.transform;
      card.style.transition = `transform ${ms}ms ${CURVA}`;
      card.style.transform = `${atual} translate3d(${dx}px, ${dy}px, 0)`;
      let fim = false;
      const acabar = () => {
        if (fim) return;
        fim = true;
        resolve();
      };
      card.addEventListener("transitionend", acabar, { once: true });
      window.setTimeout(acabar, ms + 60);
    });
  }

  /**
   * Devolve o card ao fluxo: sai da camada, perde os estilos inline.
   *
   * Recebe `card`/`ph` por PARÂMETRO (e não de `st`) de propósito: entre o
   * `pointerup` e o fim da animação de aterrissagem passam ~200ms, e nesse
   * intervalo o navegador ainda dispara `lostpointercapture`. Ler o estado
   * mutável aqui já custou um bug em que o card ficava preso na camada.
   */
  function restaurar(card, ph) {
    if (card) {
      card.classList.remove("is-arrastando", "is-fora");
      card.removeAttribute("style");
    }
    if (ph && ph.isConnected && card) ph.replaceWith(card);
    else if (ph) ph.remove();
    st.placeholder = null;
    raiz.classList.remove("is-arrastando");
    document.body.classList.remove("dnd-arrastando");
    for (const c of colunas) {
      const l = listaDe(c.id);
      if (l) l.classList.remove("is-alvo");
    }
    if (camada && !camada.childElementCount) {
      camada.remove();
      camada = null;
    }
  }

  /**
   * `pointercancel`, perda de captura, Esc, aba escondida: tudo cai aqui.
   *
   * ⚠️ Sai na hora se já estamos soltando. `lostpointercapture` dispara **junto
   * com** o `pointerup` (a captura é liberada implicitamente), então sem esta
   * guarda ele desmontaria o estado no meio da aterrissagem — e o card ficaria
   * preso na camada, sumindo da coluna. Bug real, pego no teste.
   */
  function aoAbortarGesto() {
    if (st.modo === "soltando") return;
    if (st.modo === "arrastando") {
      const card = st.card;
      const ph = st.placeholder;
      st.modo = "soltando";
      aterrissar(card, ph, MS_CANCELA).then(() => {
        restaurar(card, ph);
        anunciar("Movimento cancelado. A tarefa voltou para o lugar.");
        desarmar();
        liberar();
      });
      return;
    }
    desarmar();
  }

  /** Solta os listeners do gesto e volta ao repouso. */
  function desarmar() {
    window.clearTimeout(st.timerToque);
    if (st.raf) cancelAnimationFrame(st.raf);
    st.raf = 0;
    raiz.removeEventListener("pointermove", aoMover);
    raiz.removeEventListener("pointerup", aoSubir);
    raiz.removeEventListener("pointercancel", aoAbortarGesto);
    raiz.removeEventListener("lostpointercapture", aoAbortarGesto);
    document.removeEventListener("touchmove", bloquearScroll);
    // `releasePointerCapture` lança se o ponteiro já foi embora.
    try {
      if (st.pid != null && raiz.hasPointerCapture(st.pid)) {
        raiz.releasePointerCapture(st.pid);
      }
    } catch (err) {
      /* ponteiro já liberado */
    }
    st.pid = null;
    st.card = null;
    st.id = null;
    st.alvo = null;
    st.chaveAlvo = "";
    if (st.modo !== "soltando") st.modo = "ocioso";
  }

  /* ---- Teclado ----------------------------------------------------------- */

  /**
   * No modo teclado NÃO existe fantasma: o card real anda no DOM e o FLIP anima.
   * É mais simples e fica visualmente melhor — e é o caminho que torna o quadro
   * inteiro operável por quem não usa mouse nem toque.
   */
  function aoTeclar(e) {
    const card = e.target.closest && e.target.closest("[data-dnd-card]");
    if (!card) return;

    if (st.modo === "ocioso") {
      if (e.key !== " " && e.key !== "Enter") return;
      e.preventDefault(); // Espaço rolaria a página
      pegarComTeclado(card);
      return;
    }
    if (st.modo !== "teclado" || card !== st.card) return;

    const lista = card.parentElement;
    const iAtual = cardsDe(lista).indexOf(card);

    switch (e.key) {
      case " ":
      case "Enter": {
        e.preventDefault();
        soltarComTeclado();
        return;
      }
      case "Escape": {
        e.preventDefault();
        cancelarTeclado();
        return;
      }
      case "ArrowLeft":
      case "ArrowRight": {
        e.preventDefault();
        const atual = colunas.findIndex((c) => c.id === colunaDe(lista));
        const alvo = colunas[atual + (e.key === "ArrowRight" ? 1 : -1)];
        if (!alvo) return;
        const nova = listaDe(alvo.id);
        if (!nova) return;
        // Na coluna nova o card ainda não existe, então os "outros" são todos.
        const outros = cardsDe(nova);
        posicionar(card, nova, Math.min(iAtual, outros.length));
        return;
      }
      case "ArrowUp":
      case "ArrowDown": {
        e.preventDefault();
        posicionar(card, lista, iAtual + (e.key === "ArrowDown" ? 1 : -1));
        return;
      }
      case "Home":
      case "End": {
        e.preventDefault();
        const outros = cardsDe(lista).length - 1; // sem contar o próprio card
        posicionar(card, lista, e.key === "Home" ? 0 : outros);
        return;
      }
      default:
    }
  }

  /**
   * Põe o card na posição `pos` de `lista`, contando só os OUTROS cards.
   *
   * Dois detalhes que já custaram bug, e por isso o caminho é um só:
   *
   * 1. **A referência sai da lista SEM o card.** Pra descer uma posição não basta
   *    inserir antes do vizinho seguinte — o card já está antes dele, e o DOM não
   *    muda. Tirando o card da conta, "descer" vira "inserir antes do que ficou na
   *    posição seguinte", que é o que a pessoa espera.
   * 2. **`insertBefore` de um nó focado o desfoca** (é remove + insere). Sem o
   *    `focus()` de volta, o foco cai no `<body>` e a tecla seguinte nem chega no
   *    handler — o card ficava pego e o Espaço não soltava mais.
   */
  function posicionar(card, lista, pos) {
    const outros = cardsDe(lista).filter((n) => n !== card);
    const destino = Math.max(0, Math.min(pos, outros.length));
    const referencia = outros[destino] || null;
    if (card.parentElement === lista && card.nextElementSibling === referencia) {
      return; // já está exatamente aí: nem mexe no DOM, nem reanuncia
    }
    const origem = card.parentElement;
    flip([...cardsDe(origem), ...outros, card], () =>
      lista.insertBefore(card, referencia)
    );
    card.focus({ preventScroll: true });
    anunciarPosicao(card, lista);
  }

  function pegarComTeclado(card) {
    const lista = card.parentElement;
    st.modo = "teclado";
    st.card = card;
    st.id = card.getAttribute("data-id");
    st.origem = {
      lista,
      coluna: colunaDe(lista),
      indice: cardsDe(lista).indexOf(card),
      ordem: Number(card.getAttribute("data-ordem")),
      referencia: card.nextElementSibling,
    };
    card.classList.add("is-pego");
    card.setAttribute("aria-pressed", "true");
    raiz.classList.add("is-arrastando");
    anunciar(
      `${rotuloDe(card)} pega. Setas movem, Espaço solta, Escape cancela.`
    );
  }

  function anunciarPosicao(card, lista) {
    const irmaos = cardsDe(lista);
    const pos = irmaos.indexOf(card);
    anunciar(
      `Movido para ${tituloCol(colunaDe(lista))}, posição ${pos + 1} de ${irmaos.length}.`
    );
  }

  async function soltarComTeclado() {
    const card = st.card;
    const lista = card.parentElement;
    const indice = cardsDe(lista).indexOf(card);
    card.classList.remove("is-pego");
    card.removeAttribute("aria-pressed");
    raiz.classList.remove("is-arrastando");
    st.modo = "soltando";
    try {
      await comprometer({ card, listaDestino: lista, indice, animar: false });
    } catch (err) {
      console.error("[Companion] Falha ao mover a tarefa:", err);
    } finally {
      // O foco fica no card: quem navega por teclado não pode ser jogado pro topo.
      card.focus({ preventScroll: true });
      st.card = null;
      liberar();
    }
  }

  function cancelarTeclado() {
    const card = st.card;
    if (!card) return;
    card.classList.remove("is-pego");
    card.removeAttribute("aria-pressed");
    raiz.classList.remove("is-arrastando");
    flip(
      [...cardsDe(st.origem.lista), ...cardsDe(card.parentElement), card],
      () => st.origem.lista.insertBefore(card, st.origem.referencia || null)
    );
    card.focus({ preventScroll: true });
    anunciar("Movimento cancelado. A tarefa voltou para o lugar.");
    st.card = null;
    liberar();
  }

  /* ---- Movimento programático (o menu "⋯" e o Desfazer) ------------------ */

  /**
   * Move um card por comando, sem arraste — é o caminho equivalente que o menu "⋯"
   * de cada card usa. Passa pelo MESMO commit do arraste, então não há como os dois
   * comportamentos divergirem.
   *
   * @param {string} id
   * @param {string} colunaId
   * @param {{posicao?: 'inicio'|'fim'}} [opcoes]
   */
  async function mover(id, colunaId, { posicao = "fim" } = {}) {
    const card = raiz.querySelector(`[data-dnd-card][data-id="${id}"]`);
    const destino = listaDe(colunaId);
    if (!card || !destino) return;
    const lista = card.parentElement;
    st.origem = {
      lista,
      coluna: colunaDe(lista),
      indice: cardsDe(lista).indexOf(card),
      ordem: Number(card.getAttribute("data-ordem")),
      referencia: card.nextElementSibling,
    };
    const alvos = cardsDe(destino).filter((n) => n !== card);
    const indice = posicao === "inicio" ? 0 : alvos.length;
    st.modo = "soltando";
    try {
      await comprometer({ card, listaDestino: destino, indice, animar: true });
    } finally {
      st.card = null;
      liberar();
    }
  }

  /* ---- Listeners globais do gesto ---------------------------------------- */

  function aoEscapar(e) {
    if (e.key === "Escape" && st.modo === "arrastando") aoAbortarGesto();
  }
  function aoEsconder() {
    if (document.hidden && st.modo === "arrastando") aoAbortarGesto();
  }
  function aoArrastarNativo(e) {
    // Uma <img>/<a> dentro do card dispara o DnD nativo por cima do nosso.
    if (e.target.closest && e.target.closest("[data-dnd-card]")) e.preventDefault();
  }

  raiz.addEventListener("pointerdown", aoDescer);
  raiz.addEventListener("keydown", aoTeclar);
  raiz.addEventListener("dragstart", aoArrastarNativo);
  window.addEventListener("keydown", aoEscapar);
  window.addEventListener("blur", aoAbortarGesto);
  document.addEventListener("visibilitychange", aoEsconder);

  sincronizar();

  /** Solta tudo. O router não avisa quando desmonta — quem chama é a seção. */
  function destruir() {
    desarmar();
    raiz.removeEventListener("pointerdown", aoDescer);
    raiz.removeEventListener("keydown", aoTeclar);
    raiz.removeEventListener("dragstart", aoArrastarNativo);
    window.removeEventListener("keydown", aoEscapar);
    window.removeEventListener("blur", aoAbortarGesto);
    document.removeEventListener("visibilitychange", aoEsconder);
    document.body.classList.remove("dnd-arrastando");
    if (camada) {
      camada.remove();
      camada = null;
    }
    st.livres = [];
  }

  return {
    sincronizar,
    mover,
    anunciar,
    destruir,
    estaArrastando: () => st.modo === "arrastando" || st.modo === "teclado" || st.modo === "soltando",
    cardEmMovimento: () => st.id,
    /** Registra um callback pra quando o quadro voltar ao repouso. */
    aoFicarLivre(cb) {
      if (typeof cb === "function") st.livres.push(cb);
    },
  };
}
