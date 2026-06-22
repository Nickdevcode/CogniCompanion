/**
 * router.js — Roteamento por hash do painel (SPA leve, sem dependências).
 *
 * Cada seção é registrada com uma chave ("inicio", "conversas", …) e uma
 * função `render(outlet, ctx)` que recebe o elemento de conteúdo e um
 * contexto compartilhado. Trocar de hash troca a seção sem recarregar a
 * página, atualiza o link ativo (sidebar + tab bar), rola pro topo e move o
 * foco pro conteúdo (acessibilidade).
 *
 * O render pode ser assíncrono (as seções buscam dados do mock/Supabase).
 * Enquanto carrega, mostramos um spinner; erros viram uma mensagem amigável.
 */

const DEFAULT_ROUTE = "inicio";

export function createRouter({ outlet, context }) {
  const routes = new Map();
  let current = null;
  let renderToken = 0; // invalida renders concorrentes (troca rápida de hash)

  /** Registra uma seção. @param {string} key @param {Function} render */
  function register(key, render) {
    routes.set(key, render);
  }

  /** Extrai a chave da rota a partir do location.hash (ex.: "#/inicio"). */
  function parseHash() {
    const raw = (window.location.hash || "").replace(/^#\/?/, "").trim();
    const key = raw.split("/")[0].toLowerCase();
    return routes.has(key) ? key : DEFAULT_ROUTE;
  }

  /** Marca o link ativo na sidebar e na tab bar. */
  function updateActiveLinks(key) {
    document.querySelectorAll("[data-dash-link]").forEach((el) => {
      const on = el.getAttribute("data-dash-link") === key;
      el.classList.toggle("is-active", on);
      if (on) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    });
  }

  function showSpinner() {
    outlet.innerHTML =
      '<div class="dash-loading"><span class="dash-loading__spinner" ' +
      'aria-hidden="true"></span><p>Carregando…</p></div>';
  }

  function showError(message) {
    const wrap = document.createElement("div");
    wrap.className = "dash-error";
    const h = document.createElement("h2");
    h.textContent = "Algo deu errado";
    const p = document.createElement("p");
    p.textContent = message || "Não foi possível carregar esta seção.";
    wrap.append(h, p);
    outlet.replaceChildren(wrap);
  }

  /** Renderiza a rota atual (lê o hash). */
  async function handleRoute() {
    const key = parseHash();
    updateActiveLinks(key);

    const render = routes.get(key);
    if (!render) {
      showError("Seção não encontrada.");
      return;
    }

    current = key;
    const token = ++renderToken;
    showSpinner();

    try {
      // A seção recebe um container próprio pra montar seu conteúdo; só o
      // anexamos ao outlet se este render ainda for o mais recente.
      const node = await render(context);
      if (token !== renderToken) return; // foi substituído por outra navegação

      // As seções sempre devolvem um Node (montado com createElement/
      // textContent). Não aceitamos string de HTML aqui — evita qualquer
      // superfície de innerHTML com conteúdo dinâmico.
      if (node instanceof Node) {
        outlet.replaceChildren(node);
      }
      // Garante a classe de animação no primeiro filho-seção
      const section = outlet.querySelector(".dash-section");
      if (section) {
        // reinicia a animação
        section.style.animation = "none";
        // força reflow e religa
        void section.offsetHeight;
        section.style.animation = "";
      }

      // Acessibilidade + UX: rola pro topo e foca a área de conteúdo
      window.scrollTo({ top: 0, behavior: "auto" });
      if (typeof outlet.focus === "function") outlet.focus({ preventScroll: true });
    } catch (err) {
      if (token !== renderToken) return;
      console.error("[Companion] Erro ao renderizar a seção:", err);
      showError();
    }
  }

  /** Navega programaticamente pra uma rota. */
  function navigate(key) {
    if (routes.has(key)) window.location.hash = "#/" + key;
  }

  /** Liga os listeners e renderiza a rota inicial. */
  function start() {
    window.addEventListener("hashchange", handleRoute);
    // Se não há hash (ou é inválido), normaliza pra rota padrão sem empilhar
    // histórico extra.
    const key = parseHash();
    if ((window.location.hash || "").replace(/^#\/?/, "").split("/")[0] !== key) {
      window.history.replaceState(null, "", "#/" + key);
    }
    handleRoute();
  }

  return { register, start, navigate, get current() {
    return current;
  } };
}
