/**
 * session.js — Estado de sessão no site inteiro.
 *
 *  1) Header dinâmico: quando há sessão, troca os botões "Login/Cadastro" por
 *     uma badge do usuário (avatar + primeiro nome) com um dropdown
 *     (Dashboard — sem destino ainda — e "Sair da conta").
 *  2) Reage a login/logout em tempo real (onAuthStateChange) e entre abas.
 *  3) Gate de download: os botões de baixar o JOGO só funcionam logado; caso
 *     contrário mostram um toast pedindo login. O PDF do artigo continua livre.
 *
 * Depende de window.cognifyAuth (js/supabase-config.js) e window.cognifyToast.
 * Roda em todas as páginas; o HTML do header NÃO muda (evita divergência entre
 * os 6 arquivos e flash de estado errado) — a badge é injetada por JS.
 */

(function () {
  "use strict";

  const LOGIN_URL = "login.html";

  // Ícones (SVG estático — innerHTML aqui é seguro, sem dado do usuário).
  const ICON_USER =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
  const ICON_CHEVRON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const ICON_DASHBOARD =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>';
  const ICON_LOGOUT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>';

  let menuOpen = false;
  let outsideHandlersBound = false;

  /* ====================================================================
     Construção da badge + dropdown
     ==================================================================== */

  // Cria o nó da badge para um nome. `variant` = "desktop" | "mobile".
  function buildBadge(name, variant) {
    const wrap = document.createElement("div");
    wrap.className = "user-badge user-badge--" + variant;
    wrap.setAttribute("data-user-badge", variant);

    // Botão que abre o menu.
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "user-badge__trigger";
    trigger.setAttribute("aria-haspopup", "true");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", "Abrir menu da conta de " + name);

    const avatar = document.createElement("span");
    avatar.className = "user-badge__avatar";
    avatar.innerHTML = ICON_USER; // SVG fixo

    const label = document.createElement("span");
    label.className = "user-badge__name";
    label.textContent = name; // nome do usuário: textContent evita XSS

    const chevron = document.createElement("span");
    chevron.className = "user-badge__chevron";
    chevron.innerHTML = ICON_CHEVRON;

    trigger.appendChild(avatar);
    trigger.appendChild(label);
    trigger.appendChild(chevron);

    // Menu (dropdown).
    const menu = document.createElement("div");
    menu.className = "user-menu";
    menu.setAttribute("role", "menu");
    menu.hidden = true;

    const dashItem = document.createElement("button");
    dashItem.type = "button";
    dashItem.className = "user-menu__item";
    dashItem.setAttribute("role", "menuitem");
    dashItem.setAttribute("data-action", "dashboard");
    dashItem.innerHTML =
      '<span class="user-menu__icon">' +
      ICON_DASHBOARD +
      '</span><span>Dashboard</span>';

    const logoutItem = document.createElement("button");
    logoutItem.type = "button";
    logoutItem.className = "user-menu__item user-menu__item--danger";
    logoutItem.setAttribute("role", "menuitem");
    logoutItem.setAttribute("data-action", "logout");
    logoutItem.innerHTML =
      '<span class="user-menu__icon">' +
      ICON_LOGOUT +
      '</span><span>Sair da conta</span>';

    menu.appendChild(dashItem);
    menu.appendChild(logoutItem);

    wrap.appendChild(trigger);
    wrap.appendChild(menu);

    // Comportamento.
    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleMenu(wrap);
    });

    // Dashboard ainda não tem destino: apenas informa (combinado com o usuário).
    dashItem.addEventListener("click", function () {
      closeAllMenus();
      if (window.cognifyToast) {
        window.cognifyToast.show("Dashboard em breve! 🚧", { type: "info" });
      }
    });

    logoutItem.addEventListener("click", async function () {
      closeAllMenus();
      logoutItem.disabled = true;
      try {
        await window.cognifyAuth.signOut();
        // onAuthStateChange cuida de re-renderizar; o toast dá o feedback.
        if (window.cognifyToast) {
          window.cognifyToast.show("Você saiu da sua conta.", { type: "info" });
        }
      } catch (e) {
        if (window.cognifyToast) {
          window.cognifyToast.show("Não foi possível sair agora. Tente de novo.", {
            type: "error",
          });
        }
        logoutItem.disabled = false;
      }
    });

    return wrap;
  }

  /* ====================================================================
     Abrir / fechar dropdown (acessível: Esc, clique-fora)
     ==================================================================== */
  function openMenu(badge) {
    const trigger = badge.querySelector(".user-badge__trigger");
    const menu = badge.querySelector(".user-menu");
    if (!trigger || !menu) return;
    menu.hidden = false;
    // dois frames pra animação de entrada pegar
    window.requestAnimationFrame(function () {
      badge.classList.add("is-open");
    });
    trigger.setAttribute("aria-expanded", "true");
    menuOpen = true;
    bindOutsideHandlers();
  }

  function closeMenu(badge) {
    const trigger = badge.querySelector(".user-badge__trigger");
    const menu = badge.querySelector(".user-menu");
    if (!trigger || !menu) return;
    badge.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    // espera a transição antes de esconder (mantém acessível p/ leitores)
    window.setTimeout(function () {
      if (!badge.classList.contains("is-open")) menu.hidden = true;
    }, 180);
  }

  function toggleMenu(badge) {
    if (badge.classList.contains("is-open")) closeMenu(badge);
    else openMenu(badge);
  }

  function closeAllMenus() {
    menuOpen = false;
    document.querySelectorAll("[data-user-badge].is-open").forEach(closeMenu);
  }

  function onDocClick() {
    if (menuOpen) closeAllMenus();
  }
  function onDocKey(e) {
    if (e.key === "Escape" && menuOpen) {
      closeAllMenus();
      const t = document.querySelector("[data-user-badge] .user-badge__trigger");
      if (t) t.focus();
    }
  }
  function bindOutsideHandlers() {
    if (outsideHandlersBound) return;
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onDocKey);
    outsideHandlersBound = true;
  }

  /* ====================================================================
     Render do header conforme a sessão
     ==================================================================== */

  // Marca no <html> que o estado de auth já foi resolvido e qual é ele. O CSS
  // (auth-ui.css) mantém os controles de Login/Cadastro ocultos até esta marca
  // existir — evitando o flash de "Login/Cadastro" antes da badge aparecer para
  // quem está logado. Para quem está deslogado, revela os botões.
  function markAuthState(loggedIn) {
    const root = document.documentElement;
    root.classList.add("auth-resolved");
    root.classList.toggle("auth-logged-in", !!loggedIn);
    root.classList.toggle("auth-logged-out", !loggedIn);
  }

  function renderLoggedOut() {
    // Remove badges injetadas e restaura os controles originais.
    document.querySelectorAll("[data-user-badge]").forEach(function (b) {
      b.remove();
    });
    document.querySelectorAll(".auth").forEach(function (auth) {
      auth.classList.remove("is-auth-hidden");
    });
    // Reexibe os links Login/Cadastro do menu mobile.
    document.querySelectorAll(".nav__link--auth").forEach(function (link) {
      link.classList.remove("is-auth-hidden");
    });
    menuOpen = false;
    markAuthState(false);
  }

  function renderLoggedIn(name) {
    // ---- Desktop: troca o bloco .auth (Login/Cadastro) pela badge ----
    // Usa a classe .is-auth-hidden (não o atributo `hidden`) porque o
    // header.css define `.auth { display: flex }`, que venceria o `hidden`
    // (este equivale a display:none, de baixa especificidade).
    document.querySelectorAll(".header__right").forEach(function (right) {
      const auth = right.querySelector(".auth");
      if (auth) auth.classList.add("is-auth-hidden");
      // evita duplicar se já existe
      if (!right.querySelector('[data-user-badge="desktop"]')) {
        right.appendChild(buildBadge(name, "desktop"));
      }
    });

    // ---- Mobile: badge dentro do menu (.nav), no lugar dos links de auth ----
    document.querySelectorAll(".nav").forEach(function (nav) {
      nav.querySelectorAll(".nav__link--auth").forEach(function (link) {
        link.classList.add("is-auth-hidden");
      });
      if (!nav.querySelector('[data-user-badge="mobile"]')) {
        nav.appendChild(buildBadge(name, "mobile"));
      }
    });

    markAuthState(true);
  }

  async function refreshHeader() {
    if (!window.cognifyAuth) return;
    const user = await window.cognifyAuth.getUser();
    if (!user) {
      renderLoggedOut();
      return;
    }
    // Resolve o nome "oficial" (tabela profiles: estável, preserva o nome do
    // primeiro cadastro mesmo após linkar uma conta Google) ANTES de montar a
    // badge — assim renderizamos uma vez só, sem o flash de trocar o nome do
    // metadado (que o Google sobrescreve) pelo nome correto.
    let name;
    try {
      name = await window.cognifyAuth.getProfileName(user);
    } catch (e) {
      name = window.cognifyAuth.getDisplayName(user); // fallback se a busca falhar
    }
    renderLoggedIn(name);
  }

  /* ====================================================================
     Gate de download (só o JOGO; o PDF do artigo fica livre)
     ==================================================================== */
  function setupDownloadGate() {
    // Botões de baixar o jogo, presentes na home e na página do jogo.
    const selector = ".game__download, .game-hero__cta";

    document.addEventListener(
      "click",
      function (e) {
        const trigger =
          e.target && e.target.closest ? e.target.closest(selector) : null;
        if (!trigger) return;

        const user = lastKnownUser;
        if (user) return; // logado → deixa o clique seguir (download real, quando existir)

        // Deslogado → bloqueia e orienta.
        e.preventDefault();
        e.stopPropagation();
        if (window.cognifyToast) {
          window.cognifyToast.show(
            "Você precisa estar logado para baixar o jogo.",
            {
              type: "info",
              action: {
                label: "Fazer login",
                onClick: function () {
                  window.location.href = LOGIN_URL;
                },
              },
            }
          );
        } else {
          window.location.href = LOGIN_URL;
        }
      },
      true // captura: intercepta antes da navegação do link
    );
  }

  // Cache do usuário (atualizado pelo onAuthStateChange) pra decisão síncrona
  // do gate de download no momento do clique.
  let lastKnownUser = null;

  /* ==================================================================== */
  function init() {
    if (!window.cognifyAuth) {
      console.error("[Cognify] session.js: window.cognifyAuth ausente.");
      return;
    }

    setupDownloadGate();

    const client = window.cognifyAuth.getClient();

    // Estado inicial.
    window.cognifyAuth.getUser().then(function (user) {
      lastKnownUser = user;
      refreshHeader();
    });

    // Reage a login/logout (inclusive vindo de outra aba) em tempo real.
    if (client) {
      client.auth.onAuthStateChange(function (_event, session) {
        lastKnownUser = (session && session.user) || null;
        refreshHeader();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
