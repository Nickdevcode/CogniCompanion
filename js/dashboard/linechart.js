/**
 * linechart.js — Gráfico de linha em SVG puro (sem dependências).
 *
 * Gera um SVG responsivo (viewBox) com grade, eixos, área preenchida, linha
 * suave, pontos e um tooltip no ponto de maior valor. Tema-aware via
 * currentColor e tokens CSS (as cores vêm do CSS da seção). Acessível: tem
 * <title>/<desc> e uma tabela alternativa pode ser fornecida pela seção.
 *
 * Uso:
 *   const svg = buildLineChart({
 *     points: [{ label:"Seg", value: 15 }, ...],
 *     unit: "min",
 *     formatValue: (v) => `${v}min`,
 *   });
 *
 * Retorna um elemento SVG (Node) pronto pra inserir no DOM.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null) node.setAttribute(k, String(v));
  }
  return node;
}

/** Quantas divisões de grade mirar no eixo Y (legibilidade > precisão). */
const LINHAS_ALVO = 4;

/**
 * Passo "redondo" (1·10ⁿ, 2·10ⁿ ou 5·10ⁿ) que divide o eixo Y em ~4 faixas.
 * Piso de 5 minutos: abaixo disso a grade fica densa sem acrescentar nada.
 * @param {number} max — maior valor da série
 * @returns {number}
 */
function escolherPasso(max) {
  const bruto = Math.max(Number(max) || 0, 1) / LINHAS_ALVO;
  const magnitude = Math.pow(10, Math.floor(Math.log10(bruto)));
  const normalizado = bruto / magnitude;
  const multiplo =
    normalizado <= 1 ? 1 : normalizado <= 2 ? 2 : normalizado <= 5 ? 5 : 10;
  return Math.max(5, multiplo * magnitude);
}

/**
 * Dois sistemas de coordenadas, e o motivo é legibilidade no celular.
 *
 * 🔴 O gráfico tinha um viewBox só, de 720×240 (3:1). Num card de 280px de largura
 * — que é o que sobra num aparelho de 360 — a caixa vira 280×93, o SVG escala em
 * 0,39 e os rótulos de 12px do viewBox chegam na tela com **4,6px de altura**.
 * Não é "pequeno": é ilegível, e ocupava um terço da tela pra não informar nada.
 *
 * A saída não é esticar (o `preserveAspectRatio="none"` transformaria os pontos em
 * elipses e a fonte em texto achatado): é trocar o SISTEMA. Num viewBox de 360×260
 * a mesma caixa de 280px escala em 0,78 e o rótulo chega com ~9px — legível, e a
 * proporção mais alta ainda dá altura pra curva ter forma.
 *
 * A proporção vai no `style` do próprio SVG porque ela agora depende do modo; o
 * `aspect-ratio` do CSS fica como valor de partida.
 */
const MEDIDAS = {
  amplo: { W: 720, H: 240, padL: 44, padR: 16, padT: 24, padB: 28 },
  compacto: { W: 360, H: 260, padL: 40, padR: 12, padT: 22, padB: 26 },
};

/**
 * @param {object} cfg
 * @param {Array<{label:string, value:number}>} cfg.points
 * @param {(v:number)=>string} [cfg.formatValue]
 * @param {string} [cfg.ariaLabel]
 * @param {boolean} [cfg.compacto] — telas estreitas (ver MEDIDAS)
 * @returns {SVGElement}
 */
export function buildLineChart({ points, formatValue, ariaLabel, compacto } = {}) {
  const data = Array.isArray(points) ? points : [];
  const fmt = formatValue || ((v) => String(v));

  // Sistema de coordenadas interno (viewBox). O SVG escala via CSS.
  const { W, H, padL, padR, padT, padB } = MEDIDAS[compacto ? "compacto" : "amplo"];
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // Escala Y: de 0 ao "teto" arredondado acima do máximo. O passo é calculado a
  // partir do maior valor (e não fixo em 15) porque a mesma escala serve pro modo
  // Semanal (dezenas de minutos) e pro Mensal (centenas): com passo fixo, uma
  // semana de 5h renderia 20 linhas de grade e os rótulos se sobrepunham.
  const maxVal = data.reduce((m, p) => Math.max(m, p.value || 0), 0);
  const step = escolherPasso(maxVal);
  const top = Math.max(step, Math.ceil((maxVal || 1) / step) * step);

  const x = (i) =>
    data.length <= 1
      ? padL + plotW / 2
      : padL + (plotW * i) / (data.length - 1);
  const y = (v) => padT + plotH - (plotH * (v || 0)) / top;

  const svg = svgEl("svg", {
    viewBox: `0 0 ${W} ${H}`,
    class: "lc",
    preserveAspectRatio: "none",
    role: "img",
    "aria-label": ariaLabel || "Gráfico de evolução",
  });
  // viewBox cuida do escalonamento; a altura sai da proporção do modo escolhido.
  svg.setAttribute("width", "100%");
  svg.style.aspectRatio = `${W} / ${H}`;

  // --- Grade horizontal + rótulos do eixo Y ---
  const grid = svgEl("g", { class: "lc__grid" });
  const yLabels = svgEl("g", { class: "lc__ylabels" });
  const lines = top / step;
  for (let i = 0; i <= lines; i++) {
    const val = (top / lines) * i;
    const yy = y(val);
    grid.appendChild(
      svgEl("line", { x1: padL, y1: yy, x2: W - padR, y2: yy, class: "lc__gridline" })
    );
    const t = svgEl("text", {
      x: padL - 10,
      y: yy + 4,
      class: "lc__ytext",
      "text-anchor": "end",
    });
    t.textContent = `${val}min`;
    yLabels.appendChild(t);
  }
  svg.appendChild(grid);
  svg.appendChild(yLabels);

  if (!data.length) return svg;

  // --- Área preenchida sob a linha ---
  const linePts = data.map((p, i) => [x(i), y(p.value)]);
  const areaD =
    `M ${linePts[0][0]} ${padT + plotH} ` +
    linePts.map(([px, py]) => `L ${px} ${py}`).join(" ") +
    ` L ${linePts[linePts.length - 1][0]} ${padT + plotH} Z`;
  svg.appendChild(svgEl("path", { d: areaD, class: "lc__area" }));

  // --- Linha ---
  const lineD = linePts
    .map(([px, py], i) => `${i === 0 ? "M" : "L"} ${px} ${py}`)
    .join(" ");
  svg.appendChild(svgEl("path", { d: lineD, class: "lc__line" }));

  // --- Rótulos do eixo X ---
  const xLabels = svgEl("g", { class: "lc__xlabels" });
  data.forEach((p, i) => {
    const t = svgEl("text", {
      x: x(i),
      y: H - 8,
      class: "lc__xtext",
      "text-anchor": "middle",
    });
    t.textContent = p.label;
    xLabels.appendChild(t);
  });
  svg.appendChild(xLabels);

  // --- Pontos ---
  const dots = svgEl("g", { class: "lc__dots" });
  // índice do pico (maior valor) pra destacar com tooltip
  let peak = 0;
  data.forEach((p, i) => {
    if ((p.value || 0) > (data[peak].value || 0)) peak = i;
  });
  data.forEach((p, i) => {
    const isPeak = i === peak && maxVal > 0;
    dots.appendChild(
      svgEl("circle", {
        cx: x(i),
        cy: y(p.value),
        r: isPeak ? 6 : 4.5,
        class: "lc__dot" + (isPeak ? " lc__dot--peak" : ""),
      })
    );
  });
  svg.appendChild(dots);

  // --- Tooltip no pico ---
  if (maxVal > 0) {
    const tx = x(peak);
    const ty = y(data[peak].value);
    const label = fmt(data[peak].value);
    const boxW = Math.max(44, label.length * 8 + 16);
    const boxH = 22;
    const bx = Math.min(Math.max(tx - boxW / 2, padL), W - padR - boxW);
    const by = Math.max(ty - boxH - 10, 2);
    const g = svgEl("g", { class: "lc__tip" });
    g.appendChild(
      svgEl("rect", { x: bx, y: by, width: boxW, height: boxH, rx: 7, class: "lc__tipbox" })
    );
    const t = svgEl("text", {
      x: bx + boxW / 2,
      y: by + boxH / 2 + 4,
      class: "lc__tiptext",
      "text-anchor": "middle",
    });
    t.textContent = label;
    g.appendChild(t);
    svg.appendChild(g);
  }

  return svg;
}
