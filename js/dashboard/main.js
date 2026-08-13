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
import { iniciarOnboarding } from "./onboarding.js";

import { renderInicio } from "./sections/inicio.js";
import { renderConversas } from "./sections/conversas.js";
import { renderAprendizado } from "./sections/aprendizado.js";
import { renderMapa } from "./sections/mapa.js";
import { renderPlanos } from "./sections/planos.js";
import { renderRosto } from "./sections/rosto.js";
import { renderConfig } from "./sections/config.js";

const LOGIN_URL = "login.html";

/**
 * URL do servidor local da Cogni (não-Supabase). Duas features passam por ele,
 * pois dependem de IA/`service_role`: o Resumo Semanal e o Pareamento. É o
 * servidor que roda junto do robô (ex.: no notebook da apresentação).
 * Trocar aqui se o servidor subir noutra porta/host.
 *
 * Usamos `127.0.0.1` (não `localhost`) de propósito: o servidor escuta só em
 * IPv4, e navegadores costumam resolver `localhost` para IPv6 (`::1`) primeiro,
 * o que derruba o fetch com ERR_CONNECTION_RESET. Forçar IPv4 evita isso.
 */
export const SERVIDOR_URL = "http://127.0.0.1:3000";

/* ==========================================================================
   Guard de autenticação
   ========================================================================== */

/**
 * Garante que há sessão VÁLIDA antes de mostrar o painel. Usa `validateUser()`
 * (request de rede que valida o JWT no servidor), e não o cache local — assim
 * uma conta já excluída no Supabase não consegue mais abrir o painel (o cache
 * sozinho continuaria "logado"). Falha transitória de rede preserva a sessão do
 * cache (o `validateUser` cuida disso), então o painel ainda abre offline.
 * Sem Supabase configurado ou sem sessão válida, redireciona pro login.
 * @returns {Promise<object|null>} o usuário validado, ou null (já redirecionou)
 */
async function ensureAuth() {
  // Sem o helper de auth não há como validar — manda pro login por segurança.
  if (!window.cognifyAuth) {
    window.location.replace(LOGIN_URL);
    return null;
  }
  try {
    const user = await window.cognifyAuth.validateUser();
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

function popularCardCrianca(crianca) {
  const nameEl = document.querySelector("[data-dash-child-name]");
  const metaEl = document.querySelector("[data-dash-child-meta]");
  if (!nameEl) return;
  nameEl.textContent = (crianca && crianca.nome) || "Criança";
  if (metaEl) metaEl.textContent = idadeLabel(crianca && crianca.idade);
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
   Inicialização
   ========================================================================== */

async function init() {
  const user = await ensureAuth();
  if (!user) return; // já redirecionou

  // Nome amigável do responsável (pra saudações e boas-vindas), resolvido como
  // no site (tabela responsaveis → fallback metadados).
  let nomeResponsavel = "";
  try {
    nomeResponsavel = primeiroNome(
      await window.cognifyAuth.getProfileName(user)
    );
  } catch (e) {
    nomeResponsavel = primeiroNome(window.cognifyAuth.getDisplayName(user));
  }

  // Carrega a criança pareada (single-child). Sem criança → o pai ainda não
  // pareou: entra o onboarding de pareamento (toma a tela). Ao parear com
  // sucesso, recarregamos o painel já com a criança vinculada.
  let crianca = null;
  try {
    crianca = await mock.getCrianca();
  } catch (e) {
    console.error("[Companion] Erro ao carregar a criança:", e);
  }

  if (!crianca) {
    iniciarOnboarding({
      user,
      nomeResponsavel,
      servidorUrl: SERVIDOR_URL,
      onPareado: () => window.location.reload(),
    });
    return; // o onboarding assume a tela; o painel só monta após parear
  }

  // Há criança pareada → monta o painel normalmente.
  setupShell();
  popularCardCrianca(crianca);

  const context = {
    user,
    crianca,
    nomeResponsavel,
    mock, // todas as seções leem/escrevem pelo mesmo módulo de dados
    servidorUrl: SERVIDOR_URL, // endpoints não-Supabase (Resumo, desvincular)
    now: mock.getNow(), // "agora" (data real no modo Supabase; MOCK_NOW no mock)
  };

  const outlet = document.querySelector("[data-dash-outlet]");
  const router = createRouter({ outlet, context });

  router.register("inicio", renderInicio);
  router.register("conversas", renderConversas);
  router.register("aprendizado", renderAprendizado);
  router.register("mapa", renderMapa);
  router.register("planos", renderPlanos);
  router.register("rosto", renderRosto);
  router.register("config", renderConfig);

  router.start();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
