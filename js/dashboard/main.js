/**
 * main.js — Bootstrap do painel do Cogni Companion.
 *
 * Responsabilidades:
 *   1) Guard de autenticação: sem sessão, manda pro login (o painel é privado).
 *   2) Popular o card da criança pareada (single-child) na sidebar.
 *   3) Ligar o comportamento do shell: drawer da sidebar (mobile), backdrop,
 *      tab bar, e fechar o menu ao navegar.
 *   4) Registrar as seções e iniciar o router.
 *
 * Depende de window.cognifyAuth (supabase-config.js) e, opcionalmente, de
 * window.cognifyToast. Os dados vêm de mock-data.js (trocável pelo Supabase).
 */

import { createRouter } from "./router.js";
import * as mock from "./mock-data.js";
import { idadeLabel, primeiroNome } from "./format.js";

import { renderInicio } from "./sections/inicio.js";
import { renderConversas } from "./sections/conversas.js";
import { renderAprendizado } from "./sections/aprendizado.js";
import { renderPlanos } from "./sections/planos.js";
import { renderConfig } from "./sections/config.js";

const LOGIN_URL = "login.html";

/* ==========================================================================
   Guard de autenticação
   ========================================================================== */

/**
 * Garante que há sessão antes de mostrar o painel. Sem Supabase configurado
 * ou sem usuário logado, redireciona pro login. Retorna o user (ou null).
 */
async function ensureAuth() {
  // Sem o helper de auth não há como validar — manda pro login por segurança.
  if (!window.cognifyAuth) {
    window.location.replace(LOGIN_URL);
    return null;
  }
  try {
    const user = await window.cognifyAuth.getUser();
    if (!user) {
      window.location.replace(LOGIN_URL);
      return null;
    }
    return user;
  } catch (e) {
    console.error("[Companion] Falha ao verificar a sessão:", e);
    window.location.replace(LOGIN_URL);
    return null;
  }
}

/* ==========================================================================
   Sidebar: card da criança pareada
   ========================================================================== */

async function popularCrianca() {
  const nameEl = document.querySelector("[data-dash-child-name]");
  const metaEl = document.querySelector("[data-dash-child-meta]");
  if (!nameEl) return null;

  try {
    const crianca = await mock.getCrianca();
    if (!crianca) {
      // Nenhuma criança pareada ainda (estado de "sem pareamento").
      nameEl.textContent = "Sem criança pareada";
      if (metaEl) metaEl.textContent = "";
      return null;
    }
    nameEl.textContent = crianca.nome || "Criança";
    if (metaEl) metaEl.textContent = idadeLabel(crianca.idade);
    return crianca;
  } catch (e) {
    console.error("[Companion] Erro ao carregar a criança:", e);
    nameEl.textContent = "Criança";
    return null;
  }
}

/* ==========================================================================
   Shell: drawer (mobile), backdrop, tab bar
   ========================================================================== */

function setupShell() {
  const shell = document.querySelector("[data-dash-shell]");
  const toggle = document.querySelector("[data-dash-menu-toggle]");
  const backdrop = document.querySelector("[data-dash-backdrop]");
  const sidebar = document.querySelector("[data-dash-sidebar]");
  if (!shell) return;

  // Dá id à sidebar pra o aria-controls do botão apontar pra ela.
  if (sidebar && !sidebar.id) sidebar.id = "dash-sidebar";

  function openSidebar() {
    shell.classList.add("is-sidebar-open");
    if (toggle) {
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "Fechar menu");
    }
    if (backdrop) backdrop.hidden = false;
  }
  function closeSidebar() {
    shell.classList.remove("is-sidebar-open");
    if (toggle) {
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Abrir menu");
    }
    if (backdrop) backdrop.hidden = true;
  }
  function toggleSidebar() {
    if (shell.classList.contains("is-sidebar-open")) closeSidebar();
    else openSidebar();
  }

  if (toggle) toggle.addEventListener("click", toggleSidebar);
  if (backdrop) backdrop.addEventListener("click", closeSidebar);

  // Fecha o drawer ao clicar em qualquer link de navegação (sidebar/tab bar).
  document.querySelectorAll("[data-dash-link]").forEach((link) => {
    link.addEventListener("click", closeSidebar);
  });

  // Esc fecha o drawer.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && shell.classList.contains("is-sidebar-open")) {
      closeSidebar();
    }
  });

  // Ao voltar pro desktop, garante que o drawer não fique "preso" aberto.
  const mq = window.matchMedia("(min-width: 901px)");
  const onChange = () => {
    if (mq.matches) closeSidebar();
  };
  if (mq.addEventListener) mq.addEventListener("change", onChange);
}

/* ==========================================================================
   Sino de notificações (placeholder — sem backend de notificações no MVP)
   ========================================================================== */

function setupBell() {
  const bell = document.querySelector("[data-dash-bell]");
  if (!bell) return;
  bell.addEventListener("click", () => {
    if (window.cognifyToast) {
      window.cognifyToast.show("Você está em dia! Nenhuma novidade por aqui.", {
        type: "info",
      });
    }
  });
}

/* ==========================================================================
   Inicialização
   ========================================================================== */

async function init() {
  const user = await ensureAuth();
  if (!user) return; // já redirecionou

  setupShell();
  setupBell();

  // Carrega a criança e monta o contexto compartilhado entre as seções.
  const crianca = await popularCrianca();

  // Nome amigável do responsável (pra saudações nas seções), resolvido como
  // no site (tabela profiles → fallback metadados).
  let nomeResponsavel = "";
  try {
    nomeResponsavel = primeiroNome(
      await window.cognifyAuth.getProfileName(user)
    );
  } catch (e) {
    nomeResponsavel = primeiroNome(window.cognifyAuth.getDisplayName(user));
  }

  const context = {
    user,
    crianca,
    nomeResponsavel,
    mock, // todas as seções leem/escrevem pelo mesmo módulo de dados
    now: mock.MOCK_NOW, // "agora" de referência (trocar por new Date() ao integrar)
  };

  const outlet = document.querySelector("[data-dash-outlet]");
  const router = createRouter({ outlet, context });

  router.register("inicio", renderInicio);
  router.register("conversas", renderConversas);
  router.register("aprendizado", renderAprendizado);
  router.register("planos", renderPlanos);
  router.register("config", renderConfig);

  router.start();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
