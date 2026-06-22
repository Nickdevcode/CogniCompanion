/**
 * modal.js — Modal/diálogo acessível e reutilizável (sem dependências).
 *
 * Cria um overlay + painel centralizado com:
 *   - foco preso dentro do diálogo (focus trap) e restauração do foco ao fechar
 *   - fechar por Esc, clique no backdrop e botão "X"
 *   - role="dialog" + aria-modal + aria-labelledby
 *   - trava o scroll do body enquanto aberto
 *
 * Uso:
 *   const modal = openModal({ title: "Novo plano", content: nodeOuFn, size: "md" });
 *   modal.close();
 *
 * `content` pode ser um Node ou uma função que recebe `{ close }` e devolve um
 * Node (útil pra botões internos que fecham o modal). Retorna { el, close }.
 */

let openCount = 0;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function openModal({ title, content, size = "md", onClose } = {}) {
  const previouslyFocused = document.activeElement;

  const overlay = document.createElement("div");
  overlay.className = "dash-modal__overlay";

  const dialog = document.createElement("div");
  dialog.className = "dash-modal dash-modal--" + size;
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");

  const titleId = "dash-modal-title-" + Math.round(performance.now());
  const header = document.createElement("div");
  header.className = "dash-modal__head";

  const h = document.createElement("h2");
  h.className = "dash-modal__title";
  h.id = titleId;
  h.textContent = title || "";
  dialog.setAttribute("aria-labelledby", titleId);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "dash-modal__close";
  closeBtn.setAttribute("aria-label", "Fechar");
  closeBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  header.append(h, closeBtn);

  const bodyWrap = document.createElement("div");
  bodyWrap.className = "dash-modal__body";

  dialog.append(header, bodyWrap);
  overlay.appendChild(dialog);

  function close() {
    if (!overlay.isConnected) return;
    document.removeEventListener("keydown", onKey, true);
    overlay.classList.remove("is-open");
    const done = () => {
      overlay.remove();
      openCount = Math.max(0, openCount - 1);
      if (openCount === 0) document.body.style.overflow = "";
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
      if (typeof onClose === "function") onClose();
    };
    // espera a transição de saída
    let ended = false;
    const fin = () => {
      if (ended) return;
      ended = true;
      done();
    };
    overlay.addEventListener("transitionend", fin, { once: true });
    window.setTimeout(fin, 260);
  }

  // Conteúdo (Node ou função)
  const node = typeof content === "function" ? content({ close }) : content;
  if (node) bodyWrap.appendChild(node);

  // Eventos de fechar
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) close();
  });

  function onKey(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === "Tab") trapTab(e);
  }
  function trapTab(e) {
    const items = Array.from(dialog.querySelectorAll(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  document.addEventListener("keydown", onKey, true);

  // Monta e anima
  document.body.appendChild(overlay);
  openCount += 1;
  document.body.style.overflow = "hidden";
  // dois frames pra animação de entrada pegar
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => overlay.classList.add("is-open"));
  });

  // Foco inicial: primeiro campo focável (ou o botão fechar)
  window.setTimeout(() => {
    const target =
      dialog.querySelector(
        'input, select, textarea, button:not(.dash-modal__close)'
      ) || closeBtn;
    if (target) target.focus();
  }, 60);

  return { el: dialog, close };
}
