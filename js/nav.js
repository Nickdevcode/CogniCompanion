/**
 * nav.js — Navegação ativa + botão "voltar ao topo".
 *
 *  - Scrollspy: marca o link (header e rodapé) da seção que está visível.
 *    Usa IntersectionObserver para detectar a seção em foco e aplica a classe
 *    ativa nos links cujo href aponta para ela.
 *  - Botão "voltar ao topo": aparece ao rolar a página pra baixo e volta ao
 *    topo suavemente quando clicado.
 */

(function () {
  "use strict";

  /* ======================================================================
     1) SCROLLSPY — destaca a seção ativa no header e no rodapé
     ====================================================================== */
  function setupScrollSpy() {
    // mapeia cada id de seção -> lista de links que apontam pra ela (#id)
    const linksById = new Map();

    document
      .querySelectorAll('.nav__link[href^="#"], .footer__links a[href^="#"]')
      .forEach(function (link) {
        const id = link.getAttribute("href").slice(1);
        if (!id) return; // ignora href="#" puro (Login/Cadastro)
        if (!linksById.has(id)) linksById.set(id, []);
        linksById.get(id).push(link);
      });

    // só observa seções que realmente têm link apontando pra elas
    const sections = [];
    linksById.forEach(function (_links, id) {
      const el = document.getElementById(id);
      if (el) sections.push(el);
    });
    if (!sections.length) return;

    // classe ativa difere entre header (nav__link--active) e rodapé (is-active)
    function setActive(link, on) {
      const isNav = link.classList.contains("nav__link");
      link.classList.toggle(isNav ? "nav__link--active" : "is-active", on);
    }

    // limpa o destaque de todos os links e marca os da seção informada
    function highlight(id) {
      linksById.forEach(function (links, key) {
        const on = key === id;
        links.forEach(function (link) {
          setActive(link, on);
        });
      });
    }

    // Mantém o controle de quais seções estão visíveis e escolhe a "principal"
    // (a mais próxima do topo da área útil) para destacar.
    const visible = new Set();

    // Após um clique, "trava" o destaque por um instante para que a rolagem
    // suave passando por outras seções não sobrescreva a escolhida.
    let lockUntil = 0;
    function now() {
      return (window.performance && performance.now()) || +new Date();
    }

    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        });

        if (now() < lockUntil) return; // respeita o destaque do clique
        if (!visible.size) return;

        // dentre as visíveis, pega a de menor distância ao topo do viewport
        let best = null;
        let bestTop = Infinity;
        visible.forEach(function (sec) {
          const top = Math.abs(sec.getBoundingClientRect().top);
          if (top < bestTop) {
            bestTop = top;
            best = sec;
          }
        });
        if (best) highlight(best.id);
      },
      {
        // a "linha de leitura" fica no terço superior da tela: a seção é
        // considerada ativa quando seu topo cruza essa faixa
        rootMargin: "-30% 0px -60% 0px",
        threshold: 0,
      }
    );

    sections.forEach(function (sec) {
      observer.observe(sec);
    });

    // Feedback imediato ao clicar num link de seção (sem esperar o scroll):
    // marca na hora e trava o observer por ~1s para não "piscar" enquanto a
    // rolagem suave passa por outras seções.
    linksById.forEach(function (links, id) {
      links.forEach(function (link) {
        link.addEventListener("click", function () {
          highlight(id);
          lockUntil = now() + 1000;
        });
      });
    });
  }

  /* ======================================================================
     2) BOTÃO "VOLTAR AO TOPO"
     ====================================================================== */
  function setupToTop() {
    const btn = document.querySelector("[data-to-top]");
    if (!btn) return;

    btn.hidden = false; // deixa o CSS controlar a visibilidade (fade/slide)

    // limiar a partir do qual o botão aparece (rolou ~meia tela pra baixo)
    function threshold() {
      return (window.innerHeight || 800) * 0.6;
    }

    // atualiza o estado visível conforme a posição do scroll (com rAF p/ perf)
    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        const scrolled = window.scrollY || document.documentElement.scrollTop;
        btn.classList.toggle("is-visible", scrolled > threshold());
        ticking = false;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll(); // estado inicial

    btn.addEventListener("click", function () {
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    });
  }

  function init() {
    setupScrollSpy();
    setupToTop();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
