/**
 * tooltip.js — Dicas contextuais do painel (o "o que é isso?" de cada tela).
 *
 * Um motor só, delegado no documento, com UM balão reaproveitado — em vez de um
 * nó por elemento. O painel tem centenas de alvos possíveis (cada contador, cada
 * badge, cada botão de ícone); criar um balão por alvo encheria o DOM de coisa
 * que quase nunca aparece.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * COMO USAR — são dois padrões, e a escolha é de ACESSIBILIDADE, não de gosto:
 *
 *   1) `data-dica` em algo que JÁ é interativo (botão, link, campo):
 *        el("button", { attrs: { "data-dica": "Some com o filtro" } })
 *      O balão explica o controle. Aparece no hover e no foco de teclado, e vira
 *      `aria-describedby` enquanto está aberto.
 *
 *   2) `dicaInfo(texto, { rotulo })` pra explicar algo que NÃO é interativo
 *      (um número, um rótulo, um selo). Devolve um botãozinho "?" de verdade —
 *      focável, com `aria-label`, e que abre no toque também.
 *
 *   ⚠️ `data-dica` num elemento NÃO focável (um <span>, uma pílula) só funciona
 *   no hover: teclado e toque nunca chegam nele. Isso é aceitável como
 *   ENRIQUECIMENTO — dizer o nome do conceito na pílula "Subiu de nível", por
 *   exemplo —, mas a informação em si tem que existir também num "?" por perto.
 *   Se ela só existe lá, use o (2).
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Posicionamento: `position: fixed` calculado do `getBoundingClientRect()` do
 * alvo, com preferência declarada em `data-dica-pos` ("top" por padrão) e
 * inversão automática quando não cabe. Rolagem e resize fecham o balão (é o que
 * todo sistema operacional faz — reposicionar durante a rolagem produz um balão
 * que "persegue" o dedo).
 *
 * Toque: hover não existe no celular. Por isso o "?" do (2) abre no toque e
 * fecha no toque de fora; os `data-dica` de (1) ficam só no hover/foco, já que
 * no toque o dedo quer executar a ação, não ler sobre ela.
 */

/** Espaço entre o alvo e o balão (px). Cabe a setinha com folga. */
const OFFSET = 10;
/** Margem mínima até a borda da janela (px). */
const MARGEM = 8;
/** Atraso pra abrir no hover — evita balão piscando ao varrer a tela. */
const ATRASO_ABRIR = 260;

let balao = null;
let seta = null;
let alvoAtual = null;
/** Aberto por toque/clique (fica até tocar fora), e não por hover. */
let fixado = false;
let timerAbrir = 0;
let instalado = false;

/* ==========================================================================
   Balão
   ========================================================================== */

function garantirBalao() {
  if (balao) return balao;
  balao = document.createElement("div");
  balao.className = "dash-dica";
  balao.id = "dash-dica-balao";
  // `role="tooltip"`: o texto só é anunciado enquanto o `aria-describedby` do
  // alvo aponta pra cá — fechado, ele fica `hidden` e sai da árvore acessível.
  balao.setAttribute("role", "tooltip");
  balao.hidden = true;

  const texto = document.createElement("span");
  texto.className = "dash-dica__txt";

  seta = document.createElement("span");
  seta.className = "dash-dica__seta";
  seta.setAttribute("aria-hidden", "true");

  balao.append(texto, seta);
  document.body.appendChild(balao);
  return balao;
}

/**
 * Coloca o balão em relação ao alvo, invertendo o lado quando não couber e
 * grudando a setinha no centro do alvo.
 * @param {HTMLElement} alvo
 * @param {string} preferida — "top" | "bottom" | "left" | "right"
 */
function posicionar(alvo, preferida) {
  const r = alvo.getBoundingClientRect();
  const b = balao.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;

  let lado = preferida || "top";

  // Inversão: se não cabe do lado pedido, tenta o oposto.
  if (lado === "top" && r.top - b.height - OFFSET < MARGEM) lado = "bottom";
  else if (lado === "bottom" && r.bottom + b.height + OFFSET > vh - MARGEM) lado = "top";
  else if (lado === "left" && r.left - b.width - OFFSET < MARGEM) lado = "right";
  else if (lado === "right" && r.right + b.width + OFFSET > vw - MARGEM) lado = "left";

  let x;
  let y;
  if (lado === "top" || lado === "bottom") {
    x = r.left + r.width / 2 - b.width / 2;
    y = lado === "top" ? r.top - b.height - OFFSET : r.bottom + OFFSET;
  } else {
    x = lado === "left" ? r.left - b.width - OFFSET : r.right + OFFSET;
    y = r.top + r.height / 2 - b.height / 2;
  }

  // Prende dentro da janela — um balão cortado não informa nada.
  const xClamp = Math.min(Math.max(x, MARGEM), Math.max(MARGEM, vw - b.width - MARGEM));
  const yClamp = Math.min(Math.max(y, MARGEM), Math.max(MARGEM, vh - b.height - MARGEM));

  balao.style.left = Math.round(xClamp) + "px";
  balao.style.top = Math.round(yClamp) + "px";
  balao.setAttribute("data-lado", lado);

  // A seta aponta pro centro do ALVO, não do balão: com o balão preso na borda
  // da tela os dois centros deixam de coincidir, e é aí que ela mais importa.
  const centroAlvoX = r.left + r.width / 2;
  const centroAlvoY = r.top + r.height / 2;
  if (lado === "top" || lado === "bottom") {
    const sx = Math.min(Math.max(centroAlvoX - xClamp, 14), Math.max(14, b.width - 14));
    seta.style.left = Math.round(sx) + "px";
    seta.style.top = "";
  } else {
    const sy = Math.min(Math.max(centroAlvoY - yClamp, 14), Math.max(14, b.height - 14));
    seta.style.top = Math.round(sy) + "px";
    seta.style.left = "";
  }
}

/**
 * Abre o balão num alvo.
 * @param {HTMLElement} alvo — precisa ter `data-dica`
 * @param {boolean} [porToque] — true fixa o balão até tocar fora
 */
function abrir(alvo, porToque = false) {
  const texto = alvo.getAttribute("data-dica");
  if (!texto) return;

  garantirBalao();
  fechar({ manterFixado: true });

  balao.querySelector(".dash-dica__txt").textContent = texto;
  balao.hidden = false;
  balao.classList.remove("is-open");
  // Mede com o balão já no fluxo (hidden não tem caixa) antes de posicionar.
  posicionar(alvo, alvo.getAttribute("data-dica-pos"));
  // 1 frame pra a transição de entrada pegar.
  window.requestAnimationFrame(() => {
    if (balao && !balao.hidden) balao.classList.add("is-open");
  });

  alvoAtual = alvo;
  fixado = porToque;
  alvo.setAttribute("aria-describedby", balao.id);
  alvo.classList.add("has-dica-aberta");
}

/** Fecha o balão (e tira o `aria-describedby` que ele emprestou ao alvo). */
function fechar({ manterFixado = false } = {}) {
  window.clearTimeout(timerAbrir);
  if (!manterFixado) fixado = false;
  if (alvoAtual) {
    alvoAtual.removeAttribute("aria-describedby");
    alvoAtual.classList.remove("has-dica-aberta");
    alvoAtual = null;
  }
  if (balao) {
    balao.classList.remove("is-open");
    balao.hidden = true;
  }
}

/** Fecha qualquer dica aberta. Usado por quem toma a tela (tour, modal). */
export function fecharDica() {
  fechar();
}

/* ==========================================================================
   Instalação (uma vez por página)
   ========================================================================== */

/** O elemento com `data-dica` mais próximo (o alvo pode ser um <svg> interno). */
function alvoDe(node) {
  return node && node.closest ? node.closest("[data-dica]") : null;
}

/**
 * Liga o motor de dicas no documento. Idempotente — chamar duas vezes não
 * duplica listener nenhum.
 */
export function iniciarDicas() {
  if (instalado) return;
  instalado = true;
  garantirBalao();

  /* --- Ponteiro fino (mouse): abre no hover, com atraso curto. ----------- */
  document.addEventListener("pointerover", (e) => {
    if (e.pointerType === "touch") return;
    const alvo = alvoDe(e.target);
    if (!alvo || alvo === alvoAtual) return;
    if (fixado) return; // um balão fixado por toque manda no hover
    window.clearTimeout(timerAbrir);
    timerAbrir = window.setTimeout(() => abrir(alvo), ATRASO_ABRIR);
  });

  document.addEventListener("pointerout", (e) => {
    if (e.pointerType === "touch") return;
    const alvo = alvoDe(e.target);
    if (!alvo) return;
    // Sair pra dentro de um filho do mesmo alvo não é sair.
    if (e.relatedTarget && alvo.contains(e.relatedTarget)) return;
    if (fixado) return;
    window.clearTimeout(timerAbrir);
    if (alvo === alvoAtual) fechar();
  });

  /* --- Teclado: foco abre na hora (sem atraso), blur fecha. -------------- */
  document.addEventListener("focusin", (e) => {
    const alvo = alvoDe(e.target);
    if (!alvo) {
      if (!fixado) fechar();
      return;
    }
    window.clearTimeout(timerAbrir);
    abrir(alvo);
  });
  document.addEventListener("focusout", (e) => {
    const alvo = alvoDe(e.target);
    if (alvo && alvo === alvoAtual && !fixado) fechar();
  });

  /* --- Toque: só o "?" abre no toque. ------------------------------------ */
  document.addEventListener(
    "pointerdown",
    (e) => {
      const alvo = alvoDe(e.target);
      const ehInfo = alvo && alvo.classList.contains("dash-dica-info");

      if (ehInfo) {
        // Alterna: tocar de novo no mesmo "?" fecha.
        if (alvo === alvoAtual && fixado) fechar();
        else abrir(alvo, true);
        return;
      }
      // Tocou/clicou em qualquer outro lugar: some com o balão fixado.
      if (fixado) fechar();
    },
    true
  );

  // O "?" é um <button>: sem isto, o clique dele submeteria o form em volta.
  document.addEventListener("click", (e) => {
    const alvo = alvoDe(e.target);
    if (alvo && alvo.classList.contains("dash-dica-info")) e.preventDefault();
  });

  /* --- Esc fecha; rolagem e resize fecham. ------------------------------- */
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && alvoAtual) fechar();
  });
  // `capture: true` pega a rolagem de QUALQUER container (o quadro da Mesa, a
  // faixa de planos), não só a da janela.
  window.addEventListener("scroll", () => fechar(), { capture: true, passive: true });
  window.addEventListener("resize", () => fechar(), { passive: true });
}

/* ==========================================================================
   Helper: o botãozinho "?"
   ========================================================================== */

/** Ponto de interrogação dentro de um círculo — desenhado, não fonte. */
const SVG_INFO =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M9.5 9.3a2.6 2.6 0 1 1 3.4 2.8c-.8.3-1.2.9-1.2 1.6v.4"/>' +
  '<path d="M11.9 17.4h.02"/></svg>';

/**
 * Botão "?" que explica algo não-interativo ao lado dele.
 *
 * É um <button> de verdade (e não um <span> com `title`) por três motivos: chega
 * no Tab, abre no toque, e o leitor de tela anuncia "Ajuda: <rótulo>" em vez de
 * ler um ponto de interrogação solto.
 *
 * @param {string} texto — a explicação (uma ou duas frases; sem jargão)
 * @param {object} [opts]
 * @param {string} [opts.rotulo] — do que estamos falando ("Tempo total"). Entra
 *   no `aria-label`; sem ele o botão vira "Ajuda" genérico numa tela cheia deles.
 * @param {string} [opts.pos] — lado preferido do balão ("top" por padrão)
 * @param {string} [opts.class] — classes extras
 * @returns {HTMLButtonElement}
 */
export function dicaInfo(texto, { rotulo, pos, class: extra } = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "dash-dica-info" + (extra ? " " + extra : "");
  btn.setAttribute("data-dica", texto);
  if (pos) btn.setAttribute("data-dica-pos", pos);
  btn.setAttribute("aria-label", rotulo ? "Ajuda: " + rotulo : "Ajuda");
  btn.innerHTML = SVG_INFO;
  return btn;
}

/**
 * Junta um rótulo e o "?" numa linha só, pra não quebrar o alinhamento de quem
 * já vive dentro de um flex.
 * @param {Node|string} conteudo
 * @param {string} texto — a dica
 * @param {object} [opts] — repassado pro `dicaInfo`
 * @returns {HTMLElement}
 */
export function comDica(conteudo, texto, opts = {}) {
  const wrap = document.createElement("span");
  wrap.className = "dash-com-dica";
  if (typeof conteudo === "string") {
    const s = document.createElement("span");
    s.textContent = conteudo;
    wrap.appendChild(s);
  } else if (conteudo) {
    wrap.appendChild(conteudo);
  }
  wrap.appendChild(dicaInfo(texto, opts));
  return wrap;
}
