/**
 * rosto.js — "O rosto da Cogni": a criança desenha os olhos do próprio robô.
 *
 * Esta é a ÚNICA tela do Companion feita pra criança, e não pro pai. O tom muda
 * por isso: controles grandes, nada de jargão ("Quão redondo?", não "raio da
 * borda"), e nenhum número na cara dela. O que faz a tela valer é o robô físico
 * mudando de expressão enquanto ela arrasta o slider — o preview aqui é o espelho
 * fiel disso, e continua funcionando com tudo desligado.
 *
 * Base acadêmica (docs/COMPANION-PLANO-TECNICO.md): pesquisa de 2025 indica que um
 * rosto desenhado pela própria criança eleva a inteligência social percebida do
 * robô frente a um rosto genérico. Por isso a tela é uma brincadeira, não um
 * formulário — a diferença entre as duas coisas É o objeto de estudo.
 *
 * Só existem 4 parâmetros, e são os que o firmware entende. Qualquer chave a mais
 * (cor, pupila, brilho) seria ignorada: a tela do robô é monocromática.
 */

import { el, sectionRoot, pageHead } from "./_shared.js";
import { ICON } from "../icons.js";
import {
  criarPreviewRosto,
  normalizarRosto,
  rostosIguais,
  espacoMaximo,
  LIMITES,
} from "../rosto-preview.js";
import { carregarRosto, criarGravadorRosto } from "../rosto-api.js";

/**
 * Presets de um clique. São a porta de entrada da tela: criança pequena não tem
 * paciência de arrastar quatro sliders até achar uma cara boa, mas reconhece na
 * hora a que ela quer. Os sliders viram o ajuste fino de quem já gostou de uma.
 *
 * Todos os valores estão dentro das faixas do firmware (ver LIMITES).
 */
const PRESETS = [
  { id: "fofo", nome: "Fofo", largura: 40, altura: 40, raio: 16, espaco: 12 },
  { id: "serio", nome: "Sério", largura: 38, altura: 22, raio: 0, espaco: 14 },
  { id: "sonolento", nome: "Sonolento", largura: 40, altura: 13, raio: 6, espaco: 12 },
  { id: "surpreso", nome: "Surpreso", largura: 34, altura: 48, raio: 14, espaco: 16 },
  { id: "robozinho", nome: "Robozinho", largura: 48, altura: 30, raio: 2, espaco: 4 },
];

/**
 * Os quatro sliders, na linguagem da criança.
 *
 * `pontas` rotula os extremos ("fininho" ↔ "largo") porque é o que dá sentido ao
 * arrastar sem mostrar pixel nenhum. `descrever` alimenta o aria-valuetext: um
 * leitor de tela anunciando "36" não diria nada, "bem redondo" diz tudo.
 */
const CONTROLES = [
  {
    campo: "largura",
    rotulo: "Quão largo?",
    pontas: ["fininho", "largo"],
    descrever: (v) => (v <= 22 ? "fininho" : v >= 42 ? "bem largo" : "no meio"),
  },
  {
    campo: "altura",
    rotulo: "Quão aberto?",
    pontas: ["espremido", "arregalado"],
    descrever: (v) =>
      v <= 18 ? "bem espremido" : v >= 44 ? "bem arregalado" : "no meio",
  },
  {
    campo: "raio",
    rotulo: "Quão redondo?",
    pontas: ["quadrado", "redondo"],
    descrever: (v) =>
      v <= 3 ? "quadradão" : v >= 13 ? "bem redondo" : "meio redondo",
  },
  {
    campo: "espaco",
    rotulo: "Quão juntinhos?",
    pontas: ["colados", "afastados"],
    descrever: (v) =>
      v < 0 ? "cruzados, vesguinho" : v <= 8 ? "bem juntinhos" : v >= 26 ? "bem afastados" : "no meio",
  },
];

/** Mensagem de cada estado. Nenhuma delas é de erro — nem quando a rede falha. */
const MENSAGENS = {
  salvando: "Mandando pra Cogni…",
  aplicado: "A Cogni tá com essa carinha agora!",
  salvo: "Guardei! Ela vai fazer essa cara quando ligar.",
};

/**
 * Monta a seção do editor de rosto.
 * @param {object} ctx — contexto do painel (crianca, servidorUrl, mock, …)
 * @returns {Promise<HTMLElement>}
 */
export async function renderRosto(ctx) {
  const { crianca, servidorUrl, mock } = ctx;

  const { rosto: rostoInicial, padrao } = await carregarRosto({
    servidorUrl,
    crianca,
  });

  let rosto = rostoInicial;

  const raiz = sectionRoot("rosto");
  raiz.classList.add("dash-rosto");
  raiz.appendChild(
    pageHead({
      title: "O rosto da Cogni",
      subtitle:
        "Esta parte é da criança: escolha os olhos da Cogni e veja ela mudar de cara na hora.",
    })
  );

  /* ---------------------------------------------------------------------
     Palco: o preview grande + o recado sobre o robô
     --------------------------------------------------------------------- */

  const preview = criarPreviewRosto({ class: "dash-rosto__tela" });

  const statusIcone = el("span", { class: "dash-rosto__status-ico" });
  const statusTexto = el("span", { class: "dash-rosto__status-txt" });
  const status = el("p", {
    class: "dash-rosto__status",
    // polite: anuncia a mudança sem cortar o que o leitor de tela já estava lendo.
    attrs: { "aria-live": "polite", "data-estado": "salvo" },
    children: [statusIcone, statusTexto],
  });

  function mostrarStatus(estado) {
    status.setAttribute("data-estado", estado);
    // O texto vai por textContent; só o ÍCONE usa innerHTML, e ele vem do ICON —
    // markup SVG constante escrito no código-fonte, nunca dado de usuário. É a
    // mesma regra documentada no helper `el()` (_shared.js).
    statusTexto.textContent = MENSAGENS[estado] || "";
    statusIcone.innerHTML =
      estado === "aplicado" ? ICON.check : estado === "salvando" ? ICON.refresh : ICON.robot;
  }
  mostrarStatus("salvo");

  raiz.appendChild(
    el("div", {
      class: "dash-rosto__palco",
      children: [
        el("div", {
          class: "dash-rosto__moldura",
          children: [preview.node],
        }),
        status,
      ],
    })
  );

  /* ---------------------------------------------------------------------
     Gravador: PUT ao vivo no robô + persistência no banco
     --------------------------------------------------------------------- */

  const gravador = criarGravadorRosto({
    servidorUrl,
    crianca,
    mock,
    aoMudarStatus: mostrarStatus,
  });

  /* ---------------------------------------------------------------------
     Presets
     --------------------------------------------------------------------- */

  const botoesPreset = new Map();

  const grade = el("div", { class: "dash-rosto__presets" });
  for (const preset of PRESETS) {
    const mini = criarPreviewRosto({
      class: "dash-rosto__mini",
      // O nome já está em texto no botão; o SVG repetiria a informação.
      decorativo: true,
    });
    mini.atualizar(preset);

    const botao = el("button", {
      class: "dash-rosto__preset",
      attrs: { type: "button", "aria-pressed": "false" },
      children: [
        mini.node,
        el("span", { class: "dash-rosto__preset-nome", text: preset.nome }),
      ],
    });
    botao.addEventListener("click", () => aplicar(preset, { sincronizar: true }));

    botoesPreset.set(preset.id, botao);
    grade.appendChild(botao);
  }

  raiz.appendChild(
    el("div", {
      class: "dash-rosto__bloco",
      children: [
        el("h2", { class: "dash-rosto__titulo", text: "Escolha uma carinha" }),
        grade,
      ],
    })
  );

  /* ---------------------------------------------------------------------
     Sliders (ajuste fino)
     --------------------------------------------------------------------- */

  const inputs = new Map();

  const listaControles = el("div", { class: "dash-rosto__controles" });
  for (const ctrl of CONTROLES) {
    const faixa = LIMITES[ctrl.campo];
    const id = `rosto-${ctrl.campo}`;

    const input = el("input", {
      class: "dash-rosto__slider",
      attrs: {
        type: "range",
        id,
        min: faixa.min,
        max: faixa.max,
        step: 1,
        value: rosto[ctrl.campo],
        "aria-valuetext": ctrl.descrever(rosto[ctrl.campo]),
      },
    });
    // `input` (e não `change`): queremos redesenhar durante o arrasto, que é o que
    // faz o robô acompanhar o dedo dela.
    input.addEventListener("input", () => {
      aplicar({ ...rosto, [ctrl.campo]: Number(input.value) }, { sincronizar: false });
    });

    inputs.set(ctrl.campo, { input, ctrl });

    listaControles.appendChild(
      el("div", {
        class: "dash-rosto__controle",
        children: [
          el("label", {
            class: "dash-rosto__rotulo",
            text: ctrl.rotulo,
            attrs: { for: id },
          }),
          el("div", {
            class: "dash-rosto__pista",
            children: [
              el("span", { class: "dash-rosto__ponta", text: ctrl.pontas[0] }),
              input,
              el("span", { class: "dash-rosto__ponta", text: ctrl.pontas[1] }),
            ],
          }),
        ],
      })
    );
  }

  raiz.appendChild(
    el("div", {
      class: "dash-rosto__bloco",
      children: [
        el("h2", { class: "dash-rosto__titulo", text: "Ou ajuste do seu jeito" }),
        listaControles,
      ],
    })
  );

  /* ---------------------------------------------------------------------
     Voltar ao original
     --------------------------------------------------------------------- */

  const botaoReset = el("button", {
    class: "dash-rosto__reset",
    attrs: { type: "button" },
    children: [
      el("span", { class: "dash-rosto__reset-ico", svg: ICON.refresh, attrs: { "aria-hidden": "true" } }),
      el("span", { text: "Voltar ao rosto original" }),
    ],
  });
  botaoReset.addEventListener("click", () => aplicar(padrao, { sincronizar: true }));
  raiz.appendChild(el("div", { class: "dash-rosto__rodape", children: [botaoReset] }));

  /* ---------------------------------------------------------------------
     Estado
     --------------------------------------------------------------------- */

  /**
   * Aplica um rosto novo: redesenha, manda pro robô e reflete nos controles.
   *
   * @param {object} novo
   * @param {{sincronizar: boolean}} opts — `sincronizar` reposiciona TODOS os
   *   sliders (preset e "voltar ao original"). Fica false quando a mudança veio de
   *   um slider: aí só reposicionamos os que ficaram fora de sincronia, porque
   *   reescrever o `value` do input que está sendo arrastado brigaria com o dedo da
   *   criança no meio do gesto.
   */
  function aplicar(novo, { sincronizar }) {
    const anterior = rosto;
    rosto = normalizarRosto(novo);
    preview.atualizar(rosto);

    // O teto do "juntinhos" depende da largura: dois olhos no máximo não deixam
    // espaço pros 34px. Mexer no slider de largura reaperta este aqui, então o
    // `max` é reescrito a cada mudança — assim a criança nunca arrasta até um
    // ponto onde nada mais acontece na cara do robô.
    const espacoInput = inputs.get("espaco");
    if (espacoInput) espacoInput.input.max = String(espacoMaximo(rosto.largura));

    for (const [campo, { input, ctrl }] of inputs) {
      // O slider de espaço é sincronizado mesmo durante o arrasto de OUTRO
      // slider: se a largura acabou de comer o espaço disponível, o polegar
      // dele precisa recuar junto, senão mostra um valor que já não vale.
      if (sincronizar || String(input.value) !== String(rosto[campo])) {
        input.value = String(rosto[campo]);
      }
      input.setAttribute("aria-valuetext", ctrl.descrever(rosto[campo]));
    }

    // Marca o preset correspondente (se a combinação for exatamente a de um).
    for (const preset of PRESETS) {
      const botao = botoesPreset.get(preset.id);
      const igual = rostosIguais(rosto, normalizarRosto(preset));
      botao.setAttribute("aria-pressed", String(igual));
      botao.classList.toggle("is-ativo", igual);
    }

    // Mexer no slider e parar no mesmo valor (arrastar e voltar) não precisa de
    // request nenhum — nada mudou pro robô.
    if (!rostosIguais(rosto, anterior)) gravador.agendar(rosto);
  }

  aplicar(rosto, { sincronizar: true });
  // O `aplicar` inicial não deve mandar nada pro robô (nada mudou ainda); ele já
  // não manda, porque compara com o estado anterior — mas o status precisa refletir
  // de onde veio o rosto que está na tela.
  mostrarStatus("salvo");

  return raiz;
}
