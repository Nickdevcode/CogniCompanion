/**
 * _shared.js — Utilidades de UI compartilhadas pelas seções do painel.
 *
 * Funções pequenas pra criar elementos com segurança (sempre textContent pra
 * texto dinâmico) e montar peças recorrentes (cabeçalho de página, wrapper de
 * seção, placeholder "em construção"). Mantém as seções enxutas e consistentes.
 */

/**
 * Cria um elemento com atributos e filhos. Texto dinâmico vai SEMPRE por
 * `text` → textContent (nunca innerHTML) — seguro contra XSS.
 * @param {string} tag
 * @param {object} [opts] — { class, text, attrs:{}, svg (markup de ícone
 *   ESTÁTICO, sem dado de usuário), children:[] }
 * @returns {HTMLElement}
 */
export function el(tag, opts = {}) {
  const node = document.createElement(tag);
  if (opts.class) node.className = opts.class;
  if (opts.text != null) node.textContent = opts.text;
  if (opts.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) {
      if (v != null) node.setAttribute(k, v);
    }
  }
  // `svg`: SOMENTE markup de ícone estático escrito no código-fonte (mesma
  // prática de session.js/toast.js). NUNCA passar conteúdo vindo de dados/
  // usuário aqui — para texto, use `text` (textContent).
  if (opts.svg != null) node.innerHTML = opts.svg;
  if (opts.children) {
    for (const c of opts.children) {
      if (c) node.appendChild(c);
    }
  }
  return node;
}

/**
 * Nome de cada seção pro leitor de tela. A chave da rota ("mapa", "config") é
 * identificador, não texto: anunciada como está, a landmark saía "região config".
 * Aqui ela vira o mesmo rótulo que o pai lê na sidebar.
 */
const ROTULO_DA_SECAO = {
  inicio: "Início",
  conversas: "Conversas",
  aprendizado: "Aprendizado",
  mapa: "Mapa da aula",
  mesa: "Mesa de Estudos",
  rosto: "Rosto da Cogni",
  config: "Configurações",
};

/** Wrapper raiz de uma seção (ganha a animação de entrada via .dash-section). */
export function sectionRoot(name) {
  return el("section", {
    class: "dash-section dash-section--" + name,
    attrs: { "aria-label": ROTULO_DA_SECAO[name] || name },
  });
}

/**
 * Cabeçalho de página: título (display, com traço dourado) + subtítulo +
 * slot opcional de ação à direita (ex.: botão "Criar novo plano").
 * @param {{ title:string, subtitle?:string, action?:HTMLElement }} cfg
 * @returns {HTMLElement}
 */
export function pageHead({ title, subtitle, action }) {
  const left = el("div", { class: "dash-pagehead__main" });
  left.appendChild(
    el("h1", {
      class: "dash-pagehead__title dash-pagehead__title--underline",
      text: title,
    })
  );
  if (subtitle) {
    left.appendChild(el("p", { class: "dash-pagehead__subtitle", text: subtitle }));
  }

  const head = el("div", { class: "dash-pagehead" });
  head.appendChild(left);
  if (action) head.appendChild(action);
  return head;
}

/**
 * Placeholder "em construção" — usado enquanto a seção não tem conteúdo real.
 * Caprichado e tema-aware (usa as classes do dashboard).
 * @param {string} label
 * @returns {HTMLElement}
 */
export function buildingPlaceholder(label) {
  const wrap = el("div", { class: "dash-placeholder" });
  wrap.appendChild(
    el("span", {
      class: "dash-placeholder__icon",
      svg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M16.5 16.5 19 19' +
        'M19 5l-2.5 2.5M7.5 16.5 5 19"/><circle cx="12" cy="12" r="3.2"/></svg>',
    })
  );
  wrap.appendChild(el("p", { class: "dash-placeholder__title", text: label }));
  wrap.appendChild(
    el("p", {
      class: "dash-placeholder__text",
      text: "Esta seção está sendo construída e chega em breve. ✨",
    })
  );
  return wrap;
}

/** Inline SVG helper: devolve uma <span> com o markup (estático) do ícone. */
export function icon(svgMarkup, className = "dash-ico") {
  return el("span", { class: className, svg: svgMarkup, attrs: { "aria-hidden": "true" } });
}
