/**
 * particles.js — Campo de partículas interativo do hero.
 *
 * Comportamento:
 *  - Bolinhas distribuídas no fundo, com leve deriva contínua (vida própria).
 *  - Ao aproximar o cursor, as partículas dentro do raio são repelidas e
 *    ganham brilho/tamanho, voltando suavemente ao lugar depois.
 *  - As cores vêm dos design tokens (--particle-*), então acompanham o tema.
 *
 * Performance:
 *  - Densidade proporcional à área (cap para telas grandes).
 *  - Pausa a animação quando o hero sai da viewport (IntersectionObserver).
 *  - Desliga totalmente se o usuário pediu menos movimento.
 */

(function () {
  "use strict";

  const prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  const canvas = document.getElementById("hero-particles");
  if (!canvas || prefersReduced) return;

  const ctx = canvas.getContext("2d", { alpha: true });
  const host = canvas.parentElement; // a .hero

  let width = 0;
  let height = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  let particles = [];
  let running = true;
  let rafId = null;

  // Posição do mouse (em coordenadas do canvas). -9999 = "longe".
  const mouse = { x: -9999, y: -9999, active: false };
  const INTERACTION_RADIUS = 130;

  /** Lê as cores/alphas atuais do tema a partir das CSS custom properties. */
  function readThemeTokens() {
    const cs = getComputedStyle(document.documentElement);
    return {
      rgb: (cs.getPropertyValue("--particle-color") || "8,12,56").trim(),
      baseAlpha: parseFloat(
        cs.getPropertyValue("--particle-base-alpha") || "0.1"
      ),
      hoverAlpha: parseFloat(
        cs.getPropertyValue("--particle-hover-alpha") || "0.55"
      ),
    };
  }
  let theme = readThemeTokens();

  /** (Re)cria as partículas conforme o tamanho atual. */
  function buildParticles() {
    const area = width * height;
    // Densidade e teto adaptados ao tamanho da tela: telas pequenas (mobile)
    // recebem bem menos partículas, o que mantém o FPS alto.
    const isSmall = width < 700;
    const divisor = isSmall ? 9000 : 5200;
    const cap = isSmall ? 90 : 200;
    const count = Math.min(cap, Math.max(45, Math.round(area / divisor)));
    particles = new Array(count).fill(0).map(function () {
      const x = Math.random() * width;
      const y = Math.random() * height;
      return {
        x,
        y,
        ox: x, // posição "âncora" pra onde ela volta
        oy: y,
        vx: 0,
        vy: 0,
        drift: Math.random() * Math.PI * 2, // fase da deriva
        driftSpeed: 0.0006 + Math.random() * 0.0009,
        size: 1.3 + Math.random() * 2.2,
      };
    });
  }

  function resize() {
    const rect = host.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    buildParticles();
  }

  function update(time) {
    ctx.clearRect(0, 0, width, height);

    const r = theme.rgb;
    const baseA = theme.baseAlpha;
    const hoverA = theme.hoverAlpha;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // Deriva orgânica em torno da âncora
      p.drift += p.driftSpeed * 16;
      const driftX = Math.cos(p.drift) * 8;
      const driftY = Math.sin(p.drift * 0.9) * 8;
      const targetX = p.ox + driftX;
      const targetY = p.oy + driftY;

      // Repulsão pelo cursor
      let glow = 0;
      if (mouse.active) {
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.hypot(dx, dy);
        if (dist < INTERACTION_RADIUS && dist > 0.01) {
          const force = (1 - dist / INTERACTION_RADIUS) * 4.5;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
          glow = 1 - dist / INTERACTION_RADIUS;
        }
      }

      // Mola de volta para a posição-alvo + atrito
      p.vx += (targetX - p.x) * 0.02;
      p.vy += (targetY - p.y) * 0.02;
      p.vx *= 0.86;
      p.vy *= 0.86;
      p.x += p.vx;
      p.y += p.vy;

      // Desenho
      const alpha = baseA + (hoverA - baseA) * glow;
      const size = p.size * (1 + glow * 0.9);

      ctx.beginPath();
      ctx.fillStyle = "rgba(" + r + "," + alpha.toFixed(3) + ")";
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    if (running) rafId = requestAnimationFrame(update);
  }

  function start() {
    if (rafId == null) {
      running = true;
      rafId = requestAnimationFrame(update);
    }
  }
  function stop() {
    running = false;
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  // --- Eventos ---
  // Escutamos o mouse no window e convertemos pra coordenadas do canvas,
  // porque o canvas tem pointer-events:none (não rouba cliques do hero).
  function onPointerMove(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x >= 0 && y >= 0 && x <= width && y <= height) {
      mouse.x = x;
      mouse.y = y;
      mouse.active = true;
    } else {
      mouse.active = false;
    }
  }
  function onPointerLeave() {
    mouse.active = false;
  }

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("blur", onPointerLeave);
  document.addEventListener("mouseleave", onPointerLeave);

  let resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });

  // Reage à troca de tema (observa o atributo data-theme)
  new MutationObserver(function () {
    theme = readThemeTokens();
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  // Só anima quando o hero está visível
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) start();
          else stop();
        });
      },
      { threshold: 0.01 }
    ).observe(host);
  }

  // Inicialização
  resize();
  start();
})();
