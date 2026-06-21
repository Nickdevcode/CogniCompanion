/**
 * game-page.js — Scrollspy do menu lateral da tela do Jogo (jogo.html).
 *
 * Marca como ativo (.is-active) o item do menu do hero (Início/Vídeos/Sobre/
 * História/Fases) cuja seção está visível na tela enquanto o usuário rola.
 * O scroll suave em si é nativo (âncoras + scroll-behavior do base.css); aqui
 * só cuidamos do destaque.
 *
 * Robustez: usa IntersectionObserver; se algo faltar, simplesmente não age.
 */
(function () {
  "use strict";

  var menu = document.querySelector("[data-game-menu]");
  if (!menu) return;

  // mapeia cada seção (#id) -> link correspondente do menu
  var links = Array.prototype.slice.call(menu.querySelectorAll('a[href^="#"]'));
  var byId = {};
  var sections = [];
  links.forEach(function (link) {
    var id = link.getAttribute("href").slice(1);
    var sec = document.getElementById(id);
    if (sec) {
      byId[id] = link;
      sections.push(sec);
    }
  });
  if (!sections.length) return;

  function highlight(id) {
    links.forEach(function (link) {
      link.classList.toggle("is-active", link === byId[id]);
    });
  }

  // Conjunto de seções atualmente visíveis; destaca a mais próxima do topo.
  var visible = new Set();
  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      });
      if (!visible.size) return;

      var best = null;
      var bestTop = Infinity;
      visible.forEach(function (sec) {
        var top = Math.abs(sec.getBoundingClientRect().top);
        if (top < bestTop) {
          bestTop = top;
          best = sec;
        }
      });
      if (best) highlight(best.id);
    },
    {
      // "linha de leitura" no terço superior da tela
      rootMargin: "-25% 0px -65% 0px",
      threshold: 0,
    }
  );

  sections.forEach(function (sec) {
    observer.observe(sec);
  });

  // Feedback imediato ao clicar num item (sem esperar o scroll terminar).
  links.forEach(function (link) {
    link.addEventListener("click", function () {
      highlight(link.getAttribute("href").slice(1));
    });
  });
})();
