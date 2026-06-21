/**
 * scroll.js — Animações de entrada acionadas pelo scroll.
 *
 * Elementos com [data-reveal] começam ocultos (via CSS, só quando .js está
 * presente) e ganham .is-visible ao entrar na viewport. [data-reveal-delay]
 * (ms) cria o efeito cascata entre irmãos.
 *
 * Robustez: usa IntersectionObserver; revela imediatamente o que já está
 * visível no carregamento; e tem uma rede de segurança que nunca deixa um
 * elemento preso invisível.
 */

(function () {
  "use strict";

  const items = Array.prototype.slice.call(
    document.querySelectorAll("[data-reveal]")
  );
  if (!items.length) return;

  const prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  /** Revela um elemento aplicando seu delay de cascata. */
  function reveal(el) {
    const delay = parseInt(el.getAttribute("data-reveal-delay") || "0", 10);
    if (delay) el.style.transitionDelay = delay + "ms";
    el.classList.add("is-visible");
  }

  // Sem animação ou sem suporte: revela tudo imediatamente.
  if (prefersReduced || !("IntersectionObserver" in window)) {
    items.forEach(function (el) {
      el.classList.add("is-visible");
    });
    return;
  }

  const observer = new IntersectionObserver(
    function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        reveal(entry.target);
        obs.unobserve(entry.target);
      });
    },
    {
      threshold: 0.12,
      // margem inferior pequena: revela um pouco antes de chegar ao centro,
      // mas sem exigir que o elemento suba demais (evita "não revelou").
      rootMargin: "0px 0px -5% 0px",
    }
  );

  items.forEach(function (el) {
    observer.observe(el);
  });

  // Rede de segurança: qualquer elemento que já esteja na viewport no load
  // (ou logo após o layout assentar) é revelado na hora.
  function revealInView() {
    const vh = window.innerHeight || document.documentElement.clientHeight;
    items.forEach(function (el) {
      if (el.classList.contains("is-visible")) return;
      const r = el.getBoundingClientRect();
      if (r.top < vh * 0.95 && r.bottom > 0) {
        reveal(el);
        observer.unobserve(el);
      }
    });
  }
  // roda após o primeiro paint e mais uma vez quando tudo (fontes/imagens) carrega
  requestAnimationFrame(revealInView);
  window.addEventListener("load", revealInView);
})();
