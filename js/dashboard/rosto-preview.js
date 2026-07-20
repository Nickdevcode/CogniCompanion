/**
 * rosto-preview.js — Desenho do rosto do robô numa tela OLED simulada.
 *
 * Módulo PURO: só geometria e SVG, sem rede e sem estado global. É o que permite
 * o editor funcionar com o robô (e o servidor) desligados — a criança desenha e
 * vê o resultado na hora, mesmo offline.
 *
 * ⚠️ A matemática daqui NÃO é uma aproximação artística: ela replica linha a linha
 * o que o robô faz de verdade, para o preview nunca mentir sobre a cara que vai
 * aparecer na tela física. A fonte é a lib FluxGarage RoboEyes
 * (`FluxGarage_RoboEyes.h`), que posiciona os olhos:
 *
 *        eyeLx = (screenWidth − (larguraE + espaco + larguraD)) / 2
 *        eyeLy = (screenHeight − altura) / 2
 *        eyeRx = eyeLx + larguraE + espaco
 *
 * Se algum desses valores mudar no firmware, mude aqui junto — o preview é uma
 * cópia deliberada, não uma abstração compartilhada (o firmware é C++ noutro repo).
 *
 * A divisão usa Math.trunc de propósito: em C++ a divisão de inteiros trunca em
 * direção a zero, e queremos o mesmo arredondamento do robô, pixel a pixel.
 */

/** Dimensões da tela OLED do robô (SSD1309 128×64, monocromática). */
export const TELA = { largura: 128, altura: 64 };

/**
 * Faixas aceitas por parâmetro. Espelham os `#define COGNI_ROSTO_*_MIN/MAX` do
 * firmware, que é quem realmente grampeia — aqui elas servem pra UI não deixar a
 * criança escolher algo que o robô ignoraria (slider que não faz nada frustra).
 */
export const LIMITES = {
  largura: { min: 14, max: 48 },
  altura: { min: 12, max: 48 },
  raio: { min: 0, max: 16 },
  espaco: { min: -4, max: 34 },
};

/** Rosto de fábrica. Igual ao ROSTO_PADRAO do servidor e do firmware. */
export const ROSTO_PADRAO = Object.freeze({
  largura: 36,
  altura: 36,
  raio: 8,
  espaco: 10,
});

/** Grampeia `v` na faixa e arredonda pra inteiro (a tela é de pixels). */
function grampear(v, { min, max }, padrao) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return padrao;
  return Math.min(max, Math.max(min, n));
}

/**
 * Espaço máximo que ainda cabe na tela, dada a largura do olho.
 *
 * As faixas de LIMITES valem por campo, mas os dois olhos e o vão entre eles
 * dividem os mesmos 128px: `largura*2 + espaco` não pode passar disso. Sem este
 * teto, largura 48 + espaço 33 ou 34 (as únicas 2 combinações de 1365 que
 * estouram) faziam os olhos serem cortados 1px de cada lado na tela real.
 *
 * Quem cede é o espaço, e não a largura — mesma escolha do firmware, pelo mesmo
 * motivo: o tamanho do olho é o que a criança vê primeiro no rosto que desenhou.
 *
 * @param {number} largura — já grampeada
 * @returns {number} teto do espaço, nunca abaixo do piso da faixa
 */
export function espacoMaximo(largura) {
  return Math.max(
    LIMITES.espaco.min,
    Math.min(LIMITES.espaco.max, TELA.largura - 2 * largura)
  );
}

/**
 * Normaliza um rosto vindo de qualquer fonte (banco, endpoint, input do usuário)
 * para valores inteiros dentro das faixas. Campo ausente ou inválido vira o padrão.
 * @param {object} [bruto]
 * @returns {{largura:number, altura:number, raio:number, espaco:number}}
 */
export function normalizarRosto(bruto) {
  const r = bruto && typeof bruto === "object" ? bruto : {};
  const largura = grampear(r.largura, LIMITES.largura, ROSTO_PADRAO.largura);
  return {
    largura,
    altura: grampear(r.altura, LIMITES.altura, ROSTO_PADRAO.altura),
    raio: grampear(r.raio, LIMITES.raio, ROSTO_PADRAO.raio),
    // O teto do espaço depende da largura (ver espacoMaximo): é o mesmo grampo
    // que o firmware aplica, então o que sai daqui é o que o robô vai desenhar.
    espaco: grampear(
      r.espaco,
      { min: LIMITES.espaco.min, max: espacoMaximo(largura) },
      ROSTO_PADRAO.espaco
    ),
    // Uma chave `sobrancelhas` órfã de um perfil antigo simplesmente não é copiada:
    // o rosto que sai daqui só tem a geometria dos olhos, que é tudo o que o robô
    // desenha desde que a sobrancelha foi desligada no firmware.
  };
}

/** @returns {boolean} true se os dois rostos têm exatamente os mesmos valores. */
export function rostosIguais(a, b) {
  if (!a || !b) return false;
  return (
    a.largura === b.largura &&
    a.altura === b.altura &&
    a.raio === b.raio &&
    a.espaco === b.espaco
  );
}

/**
 * Converte os 4 parâmetros nas coordenadas de desenho, do jeito que o robô faz.
 * @param {object} rosto — já normalizado
 * @returns {{olhos:Array}} retângulos em px da tela 128×64
 */
export function geometriaRosto(rosto) {
  const { largura, altura, raio, espaco } = rosto;

  // Bloco dos dois olhos centralizado na tela (fórmula da RoboEyes).
  const olhoEx = Math.trunc((TELA.largura - (largura * 2 + espaco)) / 2);
  const olhoY = Math.trunc((TELA.altura - altura) / 2);
  const olhoDx = olhoEx + largura + espaco;

  return {
    olhos: [
      { x: olhoEx, y: olhoY, largura, altura, raio },
      { x: olhoDx, y: olhoY, largura, altura, raio },
    ],
  };
}

/**
 * Descreve o rosto em português corrido, pra `aria-label` do preview. Um leitor de
 * tela precisa saber que cara o robô está fazendo — "imagem" não serve de nada.
 * @param {object} rosto — já normalizado
 * @returns {string}
 */
export function descreverRosto(rosto) {
  const { largura, altura, raio, espaco } = rosto;

  const forma =
    altura <= 18 ? "espremidos" : altura >= 44 ? "bem arregalados" : "abertos";
  const traco =
    raio <= 3 ? "quadrados" : raio >= 13 ? "bem redondos" : "arredondados";
  const corpo = largura <= 22 ? "fininhos" : largura >= 42 ? "largos" : "médios";
  const distancia =
    espaco < 0
      ? "quase encostados um no outro"
      : espaco <= 8
      ? "pertinho um do outro"
      : espaco >= 26
      ? "bem afastados"
      : "a uma distância normal";

  return `Rosto do robô: dois olhos ${corpo}, ${forma} e ${traco}, ${distancia}.`;
}

/* ==========================================================================
   Renderização em SVG
   ========================================================================== */

const NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    node.setAttribute(k, String(v));
  }
  return node;
}

/**
 * Cria um preview da tela do robô.
 *
 * Devolve um nó pronto e um `atualizar(rosto)` que só reescreve os atributos dos
 * retângulos já existentes — nada é recriado a cada frame. É isso que deixa o
 * arrastar do slider fluido: o preview redesenha de forma síncrona, sem esperar
 * rede nenhuma.
 *
 * @param {object} [opts]
 * @param {string} [opts.class] — classe CSS extra no <svg>
 * @param {boolean} [opts.decorativo] — true esconde de leitores de tela
 *   (usar nos mini-previews dos presets, que já têm rótulo em texto ao lado).
 * @returns {{node: SVGElement, atualizar: (rosto: object) => void}}
 */
export function criarPreviewRosto(opts = {}) {
  const svg = svgEl("svg", {
    viewBox: `0 0 ${TELA.largura} ${TELA.altura}`,
    // A tela do robô é de pixels: antialiasing borraria as bordas e daria uma
    // impressão de suavidade que a OLED monocromática não tem.
    "shape-rendering": "crispEdges",
    preserveAspectRatio: "xMidYMid meet",
  });
  if (opts.class) svg.setAttribute("class", opts.class);
  if (opts.decorativo) {
    svg.setAttribute("aria-hidden", "true");
  } else {
    svg.setAttribute("role", "img");
  }

  // Fundo: preto puro, como o pixel apagado da OLED.
  svg.appendChild(
    svgEl("rect", {
      x: 0,
      y: 0,
      width: TELA.largura,
      height: TELA.altura,
      fill: "#000",
    })
  );

  // Branco puro: a tela é monocromática, não existe cor intermediária nela.
  const olhos = [0, 1].map(() => {
    const r = svgEl("rect", { fill: "#fff" });
    svg.appendChild(r);
    return r;
  });

  function atualizar(rostoBruto) {
    const rosto = normalizarRosto(rostoBruto);
    const g = geometriaRosto(rosto);

    g.olhos.forEach((o, i) => {
      olhos[i].setAttribute("x", o.x);
      olhos[i].setAttribute("y", o.y);
      olhos[i].setAttribute("width", o.largura);
      olhos[i].setAttribute("height", o.altura);
      olhos[i].setAttribute("rx", o.raio);
      olhos[i].setAttribute("ry", o.raio);
    });

    if (!opts.decorativo) svg.setAttribute("aria-label", descreverRosto(rosto));
  }

  atualizar(ROSTO_PADRAO);
  return { node: svg, atualizar };
}
