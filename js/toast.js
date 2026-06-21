/**
 * toast.js — Notificações flutuantes (toasts) reutilizáveis e acessíveis.
 *
 * API global:
 *   window.cognifyToast.show(mensagem, opções)
 *     opções = {
 *       type: "success" | "error" | "info"   (padrão: "info")
 *       duration: number (ms)                 (padrão: 4500; 0 = não some sozinho)
 *       action: { label: string, onClick: fn }  (opcional: botão de ação)
 *     }
 *   window.cognifyToast.dismissAll()
 *
 * Acessibilidade: a região usa aria-live="polite" e role="status", então
 * leitores de tela anunciam a mensagem sem roubar o foco. Respeita
 * prefers-reduced-motion (entra sem deslizar). Toasts são empilháveis.
 */

(function () {
  "use strict";

  const REGION_ATTR = "data-toast-region";
  let region = null;

  const prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Ícones por tipo (SVG inline; herdam a cor via currentColor).
  const ICONS = {
    success:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    error:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/></svg>',
  };

  const CLOSE_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  // Cria (uma vez) o container que ancora os toasts no canto da tela.
  function ensureRegion() {
    if (region && document.body.contains(region)) return region;
    region = document.querySelector("[" + REGION_ATTR + "]");
    if (!region) {
      region = document.createElement("div");
      region.setAttribute(REGION_ATTR, "");
      region.className = "toast-region";
      region.setAttribute("role", "status");
      region.setAttribute("aria-live", "polite");
      region.setAttribute("aria-atomic", "false");
      document.body.appendChild(region);
    }
    return region;
  }

  // Remove o toast com uma pequena animação de saída (a menos que o usuário
  // tenha pedido menos movimento).
  function removeToast(toast) {
    if (!toast || toast.dataset.leaving === "true") return;
    toast.dataset.leaving = "true";
    if (prefersReducedMotion) {
      toast.remove();
      return;
    }
    toast.classList.remove("is-visible");
    toast.classList.add("is-leaving");
    let removed = false;
    const done = function () {
      if (removed) return;
      removed = true;
      toast.remove();
    };
    toast.addEventListener("transitionend", done, { once: true });
    // fallback caso o transitionend não dispare (ex.: aba em background)
    window.setTimeout(done, 400);
  }

  /**
   * Exibe um toast.
   * @param {string} message
   * @param {{type?: string, duration?: number, action?: {label: string, onClick: Function}}} [options]
   * @returns {HTMLElement|null} o elemento do toast (pra controle manual, se quiser)
   */
  function show(message, options) {
    if (!message) return null;
    const opts = options || {};
    const type = ICONS[opts.type] ? opts.type : "info";
    const duration = typeof opts.duration === "number" ? opts.duration : 4500;

    const host = ensureRegion();

    const toast = document.createElement("div");
    toast.className = "toast toast--" + type;
    if (type === "error") toast.setAttribute("role", "alert");

    const icon = document.createElement("span");
    icon.className = "toast__icon";
    icon.innerHTML = ICONS[type];

    const body = document.createElement("div");
    body.className = "toast__body";

    const text = document.createElement("p");
    text.className = "toast__msg";
    text.textContent = message; // textContent evita injeção de HTML
    body.appendChild(text);

    // Botão de ação opcional (ex.: "Fazer login").
    if (opts.action && opts.action.label) {
      const actionBtn = document.createElement("button");
      actionBtn.type = "button";
      actionBtn.className = "toast__action";
      actionBtn.textContent = opts.action.label;
      actionBtn.addEventListener("click", function () {
        try {
          if (typeof opts.action.onClick === "function") opts.action.onClick();
        } finally {
          removeToast(toast);
        }
      });
      body.appendChild(actionBtn);
    }

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "toast__close";
    closeBtn.setAttribute("aria-label", "Fechar notificação");
    closeBtn.innerHTML = CLOSE_ICON;
    closeBtn.addEventListener("click", function () {
      removeToast(toast);
    });

    toast.appendChild(icon);
    toast.appendChild(body);
    toast.appendChild(closeBtn);
    host.appendChild(toast);

    // força reflow pra animação de entrada pegar (quando há movimento)
    if (!prefersReducedMotion) {
      // eslint-disable-next-line no-unused-expressions
      toast.offsetHeight;
    }
    toast.classList.add("is-visible");

    // Auto-dismiss (pausa quando o mouse está em cima, pra dar tempo de ler).
    if (duration > 0) {
      let timer = window.setTimeout(function () {
        removeToast(toast);
      }, duration);
      toast.addEventListener("mouseenter", function () {
        window.clearTimeout(timer);
      });
      toast.addEventListener("mouseleave", function () {
        timer = window.setTimeout(function () {
          removeToast(toast);
        }, 1800);
      });
    }

    return toast;
  }

  function dismissAll() {
    if (!region) return;
    region.querySelectorAll(".toast").forEach(removeToast);
  }

  window.cognifyToast = { show: show, dismissAll: dismissAll };
})();
