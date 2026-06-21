/**
 * theme.js — Alternância de tema claro/escuro.
 *
 * Regras:
 *  - Persiste a escolha do usuário em localStorage.
 *  - Se nunca escolheu, respeita a preferência do sistema (prefers-color-scheme).
 *  - O atributo data-theme no <html> dispara toda a troca de cores via CSS.
 *
 * Obs.: um script inline no <head> aplica o tema ANTES da renderização para
 * evitar o "flash" de tema errado (FOUC). Este arquivo cuida da interação.
 */

(function () {
  "use strict";

  const STORAGE_KEY = "cognify-theme";
  const root = document.documentElement;

  /** Aplica o tema e atualiza o estado acessível do botão. */
  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);

    const toggle = document.querySelector("[data-theme-toggle]");
    if (toggle) {
      const isDark = theme === "dark";
      toggle.setAttribute("aria-pressed", String(isDark));
      toggle.setAttribute(
        "aria-label",
        isDark ? "Ativar modo claro" : "Ativar modo escuro"
      );
    }
  }

  /** Descobre o tema inicial: salvo > preferência do sistema > claro. */
  function getInitialTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;

    const prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  }

  // Estado inicial
  let current = getInitialTheme();
  applyTheme(current);

  function init() {
    const toggle = document.querySelector("[data-theme-toggle]");
    if (!toggle) return;

    applyTheme(current); // garante aria correto após o DOM existir

    toggle.addEventListener("click", function () {
      current = current === "dark" ? "light" : "dark";
      localStorage.setItem(STORAGE_KEY, current);
      applyTheme(current);
    });

    // Se o usuário nunca escolheu manualmente, acompanha o sistema em tempo real
    if (window.matchMedia) {
      window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", function (e) {
          if (!localStorage.getItem(STORAGE_KEY)) {
            current = e.matches ? "dark" : "light";
            applyTheme(current);
          }
        });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
