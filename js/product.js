/**
 * product.js — Monta e navega a página de detalhe de produto (produto.html).
 *
 * Lê ?id= da URL, encontra o produto em window.COGNI_PRODUCTS e preenche o
 * card (nome, descrição, preço, imagem) + os dots do carrossel. As setas ‹ ›
 * (e os dots, e as teclas ← →) trocam de produto sem recarregar a página,
 * atualizando a URL via history.pushState pra o link continuar compartilhável
 * e o botão "voltar" do navegador funcionar.
 *
 * Robustez: se não houver id (ou o id for inválido), cai no primeiro produto.
 */
(function () {
  "use strict";

  var products = window.COGNI_PRODUCTS || [];
  if (!products.length) return; // sem catálogo, não há o que montar

  // Refs dos elementos preenchidos dinamicamente
  var els = {
    card: document.querySelector("[data-product-card]"),
    media: document.querySelector("[data-product-media]"),
    name: document.querySelector("[data-product-name]"),
    desc: document.querySelector("[data-product-desc]"),
    price: document.querySelector("[data-product-price]"),
    image: document.querySelector("[data-product-image]"),
    dots: document.querySelector("[data-product-dots]"),
  };

  /** Índice do produto a partir do ?id= da URL (0 se ausente/!encontrado). */
  function indexFromUrl() {
    var id = new URLSearchParams(window.location.search).get("id");
    var i = products.findIndex(function (p) {
      return p.id === id;
    });
    return i >= 0 ? i : 0;
  }

  var current = indexFromUrl();

  /** Cria os dots uma única vez (um por produto), com handler de clique. */
  function buildDots() {
    var frag = document.createDocumentFragment();
    products.forEach(function (p, i) {
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "product__dot";
      dot.setAttribute("role", "tab");
      dot.setAttribute("aria-label", p.name);
      dot.addEventListener("click", function () {
        go(i, true);
      });
      frag.appendChild(dot);
    });
    els.dots.appendChild(frag);
  }

  /** Marca o dot ativo. */
  function syncDots() {
    var dots = els.dots.querySelectorAll(".product__dot");
    dots.forEach(function (dot, i) {
      var active = i === current;
      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-selected", String(active));
    });
  }

  /** Renderiza o produto atual no card + imagem. */
  function render() {
    var p = products[current];

    els.name.textContent = p.name;
    els.desc.textContent = p.desc;
    els.price.textContent = p.price;
    els.image.src = p.image;
    els.image.alt = p.alt || p.name;
    document.title = p.name + " — Materiais — Cognify";

    syncDots();
  }

  /** Dispara a animação de troca (reinicia a classe pra re-rodar a keyframe). */
  function animateSwap() {
    [els.card, els.media].forEach(function (el) {
      el.classList.remove("is-swapping");
      // força reflow pra a animação reiniciar mesmo trocando rápido
      void el.offsetWidth;
      el.classList.add("is-swapping");
    });
  }

  /**
   * Vai para o produto de índice i (com wrap-around). updateUrl=true empurra
   * o novo estado no histórico (?id=…), pra ser compartilhável e "voltável".
   */
  function go(i, updateUrl) {
    var total = products.length;
    current = ((i % total) + total) % total; // normaliza p/ [0, total)
    render();
    animateSwap();

    if (updateUrl) {
      var url =
        window.location.pathname + "?id=" + encodeURIComponent(products[current].id);
      window.history.pushState({ index: current }, "", url);
    }
  }

  // --- Liga os controles (setas do palco + botões do card) ---
  document.querySelectorAll("[data-product-prev]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      go(current - 1, true);
    });
  });
  document.querySelectorAll("[data-product-next]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      go(current + 1, true);
    });
  });

  // Navegação por teclado (← →), respeitando quando o foco está num campo.
  document.addEventListener("keydown", function (e) {
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if (e.key === "ArrowLeft") go(current - 1, true);
    else if (e.key === "ArrowRight") go(current + 1, true);
  });

  // Botão voltar/avançar do navegador: re-sincroniza com a URL.
  window.addEventListener("popstate", function () {
    go(indexFromUrl(), false);
  });

  // --- Inicialização ---
  buildDots();
  render();

  // Se a URL veio sem id (ou inválida), normaliza pra ?id= do produto atual
  // (sem criar entrada extra no histórico).
  if (!new URLSearchParams(window.location.search).get("id")) {
    var url =
      window.location.pathname + "?id=" + encodeURIComponent(products[current].id);
    window.history.replaceState({ index: current }, "", url);
  }
})();
