/**
 * auth.js — Interações das telas de Login e Cadastro.
 *  - Botão do olho: alterna mostrar/ocultar a senha.
 *  (Os botões "Próximo" e "Google" são apenas visuais por enquanto.)
 */

(function () {
  "use strict";

  function setupPasswordToggles() {
    document.querySelectorAll("[data-toggle-pass]").forEach(function (btn) {
      const inputId = btn.getAttribute("data-toggle-pass");
      const input = document.getElementById(inputId);
      if (!input) return;

      btn.addEventListener("click", function () {
        const willReveal = input.type === "password";
        input.type = willReveal ? "text" : "password";
        btn.classList.toggle("is-revealed", willReveal);
        btn.setAttribute("aria-pressed", String(willReveal));
        btn.setAttribute(
          "aria-label",
          willReveal ? "Ocultar senha" : "Mostrar senha"
        );
        // mantém o foco no campo para o usuário continuar digitando
        input.focus();
      });
    });
  }

  // Evita o "submit" real (ainda não há back-end); só previne o reload.
  function setupFormStub() {
    document.querySelectorAll(".auth__form").forEach(function (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
      });
    });
  }

  function init() {
    setupPasswordToggles();
    setupFormStub();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
