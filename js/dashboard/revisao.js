/**
 * revisao.js — A tela de revisão: o pai confere antes de qualquer coisa valer.
 *
 * Saiu do `captura.js` na rodada 2 por dois motivos. O prático: com quatro fontes de
 * material o arquivo passaria de 1.300 linhas. O estrutural: esta tela tem
 * **acoplamento zero** com o tipo de material — ela recebe uma proposta e devolve um
 * plano, e funcionaria igual se a proposta viesse de outro lugar.
 *
 * Ela é o coração da feature, e não um passo burocrático: **o pai revisa, não confia
 * cego**. Toda tarefa é editável, o que a IA entendeu fica visível pra conferência, e
 * nada chega ao robô sem ele aprovar (o plano nasce `rascunho`, que o servidor já
 * ignora).
 */

import { el } from "./sections/_shared.js";
import { ICON, materiaIcon, origemIcon } from "./icons.js";
import { materiasAgrupadas } from "./format.js";
import { origemDoPlano } from "./material/index.js";

/** Abaixo disto a tarefa ganha o chip "confira" — o mesmo corte da Mesa. */
const CONFIANCA_BAIXA = 0.6;

/**
 * Teto do `extraido_texto` no contrato da função.
 *
 * ⚠️ O robô corta em 900 caracteres (`MAX_EXTRAIDO_TEXTO`), então nem tudo que cabe
 * aqui chega no prompt dele. O que atravessa inteiro é o `detalhe` de cada tarefa —
 * por isso o prompt manda o enunciado pra lá, e não pra cá.
 */
const MAX_EXTRAIDO = 4000;

let seq = 0;
const proximoId = () => `rev-${++seq}`;

function campo(label, controle, { dica } = {}) {
  const wrap = el("div", { class: "pl-field" });
  const lbl = el("label", { class: "pl-field__label", text: label });
  if (controle.id) lbl.setAttribute("for", controle.id);
  wrap.append(lbl);
  if (dica) wrap.append(el("p", { class: "pl-field__hint", text: dica }));
  wrap.append(controle);
  return wrap;
}

function selectMateria(valor, id) {
  const sel = el("select", { class: "pl-input pl-select", attrs: { id } });
  materiasAgrupadas().forEach((grupo) => {
    const og = el("optgroup", { attrs: { label: grupo.label } });
    grupo.materias.forEach((m) => {
      const opt = el("option", { attrs: { value: m.valor }, text: m.label });
      if (m.valor === valor) opt.selected = true;
      og.appendChild(opt);
    });
    sel.appendChild(og);
  });
  return sel;
}

/**
 * A lista do que gerou o plano — o pedido escrito e uma linha por material.
 *
 * O pedido entra aqui, e primeiro, pela mesma razão que os materiais entram: o pai
 * está conferindo uma proposta de IA, e conferir sem ver a ENTRADA é chute. Quando o
 * plano nasceu só de uma frase, essa frase é a única coisa que explica as tarefas.
 */
function listaDeFontes(materiais, pedido) {
  if (!materiais.length && !pedido) return null;

  const itens = [];
  if (pedido) {
    itens.push(
      el("li", {
        class: "cap__lido",
        children: [
          el("span", { class: "cap__lido-ico", svg: origemIcon("pedido") }),
          el("span", { class: "cap__lido-texto", text: `“${pedido}”` }),
        ],
      })
    );
  }
  materiais.forEach((m) =>
    itens.push(
      el("li", {
        class: "cap__lido",
        children: [
          el("span", { class: "cap__lido-ico", svg: origemIcon(m.origem) || ICON.file }),
          el("span", { class: "cap__lido-texto", text: m.rotulo }),
        ],
      })
    )
  );

  return el("div", {
    class: "cap__lidos",
    children: [
      el("h3", {
        class: "cap__subtitulo",
        text: materiais.length ? "O que a Cogni leu" : "O que você pediu",
      }),
      el("ul", { class: "cap__lidos-lista", children: itens }),
    ],
  });
}

/**
 * Monta a etapa de revisão.
 *
 * @param {object} cfg
 * @param {object} cfg.proposta — a resposta saneada da função
 * @param {Array<object>} cfg.materiais — o que estava na bandeja (pra origem e rótulos)
 * @param {string} [cfg.pedido] — o que o responsável escreveu, se escreveu
 * @param {object} cfg.ctx — contexto do painel (usa `ctx.mock` pra gravar)
 * @param {() => void} cfg.close
 * @param {(plano:object, status:string) => void} cfg.aoSalvar
 * @returns {HTMLElement}
 */
export function montarRevisao({ proposta, materiais, pedido = "", ctx, close, aoSalvar }) {
  const raiz = el("div", { class: "cap__revisao" });

  const estado = {
    titulo: proposta.titulo || "",
    conteudo: proposta.conteudo || "",
    foco: proposta.foco || "outros",
    duracao_dias: proposta.duracao_dias || 7,
    extraido_texto: proposta.extraido_texto || "",
    tarefas: (proposta.tarefas || []).map((t) => ({ ...t })),
  };

  /* ---- Avisos do topo ---------------------------------------------------- */

  const baixas = estado.tarefas.filter((t) => Number(t.confianca) < CONFIANCA_BAIXA).length;
  raiz.append(
    el("p", {
      class: "cap__intro",
      text: baixas
        ? `Confira antes de aprovar — ${baixas} ${
            baixas === 1 ? "tarefa está marcada" : "tarefas estão marcadas"
          } com "confira", porque a Cogni não teve certeza do que leu.`
        : materiais.length
          ? "Confira o que a Cogni entendeu. Dá pra editar tudo antes de salvar."
          : "Esta é a proposta da Cogni pro seu pedido. Dá pra editar tudo antes de salvar.",
    })
  );

  // Recado do servidor (ex.: o PDF não abriu e o plano saiu com o resto).
  if (proposta.aviso) {
    raiz.append(
      el("p", {
        class: "cap__nota",
        attrs: { role: "status" },
        children: [
          el("span", { class: "cap__nota-ico", svg: ICON.alert }),
          el("span", { text: proposta.aviso }),
        ],
      })
    );
  }

  /**
   * O corte em 20 tarefas era silencioso. Com uma folha de lição nunca acontecia;
   * com um PDF de 40 questões acontece sempre — e o pai veria 20 achando que eram
   * todas, o que é pior que não ter lido o arquivo.
   */
  if (proposta.truncado) {
    raiz.append(
      el("p", {
        class: "cap__nota",
        attrs: { role: "status" },
        children: [
          el("span", { class: "cap__nota-ico", svg: ICON.alert }),
          el("span", {
            text:
              "Esse material tem mais tarefas do que cabe num plano só. Peguei as 20 primeiras — " +
              "mande o resto depois, num plano novo.",
          }),
        ],
      })
    );
  }

  const lidos = listaDeFontes(materiais, pedido);
  if (lidos) raiz.append(lidos);

  /* ---- Cabeçalho do plano ------------------------------------------------ */

  const inTitulo = el("input", {
    class: "pl-input",
    attrs: { id: proximoId(), type: "text", maxlength: "80", value: estado.titulo },
  });
  inTitulo.addEventListener("input", () => (estado.titulo = inTitulo.value));

  const selFoco = selectMateria(estado.foco, proximoId());
  selFoco.addEventListener("change", () => (estado.foco = selFoco.value));

  const inDuracao = el("input", {
    class: "pl-input",
    attrs: {
      id: proximoId(),
      type: "number",
      min: "1",
      max: "365",
      inputmode: "numeric",
      value: String(estado.duracao_dias),
    },
  });
  inDuracao.addEventListener("input", () => {
    estado.duracao_dias = parseInt(inDuracao.value, 10) || 7;
  });

  const txtConteudo = el("textarea", {
    class: "pl-input pl-textarea",
    attrs: { id: proximoId(), rows: "3", maxlength: "600" },
  });
  txtConteudo.value = estado.conteudo;
  txtConteudo.addEventListener("input", () => (estado.conteudo = txtConteudo.value));

  raiz.append(
    el("div", {
      class: "cap__bloco",
      children: [
        campo("Título do plano", inTitulo),
        el("div", {
          class: "pl-form__grid",
          children: [campo("Foco (matéria)", selFoco), campo("Duração (dias)", inDuracao)],
        }),
        campo("Conteúdo do plano", txtConteudo, {
          dica: "Esse texto é injetado no que a Cogni sabe sobre o plano.",
        }),
      ],
    })
  );

  /* ---- O que a Cogni entendeu: agora EDITÁVEL ---------------------------- */

  /**
   * O bloco só existe quando houve MATERIAL.
   *
   * `extraido_texto` é, dos dois lados, "o que a escola mandou": o robô o injeta no
   * prompt sob o título `O MATERIAL DA ESCOLA` (ver `brain/prompt.js`). Num plano que
   * nasceu de uma frase da mãe não há material nenhum pra transcrever — mostrar uma
   * caixa vazia chamada "o que a Cogni entendeu do material" convidaria o pai a
   * escrever ali uma lição que a escola nunca passou, e o robô a apresentaria à
   * criança como se tivesse passado. O que orienta a Cogni num plano de pedido é o
   * `conteudo`, logo acima, que já é editável.
   */
  if (materiais.length) {
    const idExtraido = proximoId();
    const txtExtraido = el("textarea", {
      class: "pl-input pl-textarea cap__leitura-campo",
      attrs: { id: idExtraido, rows: "8", maxlength: String(MAX_EXTRAIDO) },
    });
    txtExtraido.value = estado.extraido_texto;
    txtExtraido.addEventListener("input", () => (estado.extraido_texto = txtExtraido.value));

    /**
     * ⭐ Rodada 3: quando tudo que chegou veio de link, este campo tem outro conteúdo e
     * outra função. Ali dentro não está a transcrição de uma lição — está o RESUMO do
     * que a aula ensina (ver a regra 3 do modo link em `api/_lib/prompt.mjs`). Chamar
     * isso de "o material" e prometer "ajudar a fazer a lição" mandaria o pai procurar
     * uma lição que ninguém passou.
     */
    const soLink = materiais.every((m) => m.origem === "link");

    raiz.append(
      el("details", {
        class: "cap__leitura",
        children: [
          el("summary", {
            text: soLink
              ? "Ver o que a Cogni entendeu desse conteúdo"
              : "Ver o que a Cogni entendeu do material",
          }),
          el("p", {
            class: "pl-field__hint",
            text: soLink
              ? "Esse é o resumo do que o vídeo (ou a página) ensina, e ele vai junto pro robô: " +
                "é com ele que a Cogni ensina o mesmo caminho depois. Se ela entendeu algo errado, " +
                "corrija ou apague aqui."
              : "Esse texto vai junto pro robô: é com ele que a Cogni consegue ajudar a FAZER a lição, " +
                "e não só lembrar que ela existe. Se ela entendeu algo errado, corrija ou apague aqui.",
          }),
          txtExtraido,
        ],
      })
    );
  } else {
    // Sem material, nada de `extraido_texto` — nem o que a IA por acaso tenha
    // devolvido ali contrariando o prompt.
    estado.extraido_texto = "";
  }

  /* ---- Tarefas ----------------------------------------------------------- */

  const lista = el("div", { class: "cap__tarefas" });

  function pintarTarefas() {
    lista.replaceChildren();
    if (!estado.tarefas.length) {
      lista.append(
        el("p", { class: "cap__vazio", text: "Nenhuma tarefa. Adicione ao menos uma." })
      );
    }
    estado.tarefas.forEach((t, i) => lista.append(linhaTarefa(t, i)));
  }

  function linhaTarefa(tarefa, indice) {
    const baixa = Number(tarefa.confianca) < CONFIANCA_BAIXA;

    const inT = el("input", {
      class: "pl-input",
      attrs: { type: "text", maxlength: "120", value: tarefa.titulo || "" },
    });
    inT.addEventListener("input", () => (tarefa.titulo = inT.value));

    const inD = el("textarea", {
      class: "pl-input pl-textarea cap__detalhe",
      attrs: {
        rows: "2",
        maxlength: "240",
        placeholder: "O que precisa ser feito (ex.: somar frações; páginas 42 e 43, questões 1 a 8)",
      },
    });
    // `textarea` e não `input`: o detalhe agora carrega o enunciado resumido — é o
    // campo que chega inteiro no robô — e 240 caracteres não cabem numa linha só.
    inD.value = tarefa.detalhe || "";
    inD.addEventListener("input", () => (tarefa.detalhe = inD.value));

    const selM = selectMateria(tarefa.materia || "outros");
    selM.addEventListener("change", () => (tarefa.materia = selM.value));

    const inP = el("input", {
      class: "pl-input",
      attrs: { type: "date", value: tarefa.prazo || "" },
    });
    inP.addEventListener("input", () => (tarefa.prazo = inP.value || null));

    const excluir = el("button", {
      class: "cap__excluir",
      attrs: {
        type: "button",
        "aria-label": `Remover a tarefa ${tarefa.titulo || indice + 1}`,
      },
      svg: ICON.trash,
    });
    excluir.addEventListener("click", () => {
      estado.tarefas.splice(indice, 1);
      pintarTarefas();
    });

    const topo = el("div", {
      class: "cap__tarefa-topo",
      children: [
        el("span", { class: "cap__tarefa-ico", svg: materiaIcon(tarefa.materia) }),
        inT,
        excluir,
      ],
    });

    const filhos = [
      topo,
      inD,
      el("div", { class: "cap__tarefa-meta", children: [selM, inP] }),
    ];

    if (baixa) {
      // O chip só aparece onde ele muda o comportamento do pai: em cima do campo que
      // ele precisa reler. Um aviso genérico no topo não faria ninguém olhar.
      filhos.unshift(
        el("span", {
          class: "cap__confira",
          children: [
            el("span", { class: "cap__confira-ico", svg: ICON.alert }),
            el("span", { text: "confira — a Cogni não teve certeza do que leu aqui" }),
          ],
        })
      );
    }

    return el("div", {
      class: "cap__tarefa" + (baixa ? " is-confira" : ""),
      children: filhos,
    });
  }

  const adicionar = el("button", {
    class: "dash-btn dash-btn--ghost cap__adicionar",
    attrs: { type: "button" },
    children: [
      el("span", { class: "pl-btn__ico", svg: ICON.plus }),
      el("span", { text: "Adicionar tarefa" }),
    ],
  });
  adicionar.addEventListener("click", () => {
    estado.tarefas.push({
      titulo: "",
      detalhe: "",
      materia: estado.foco,
      prazo: null,
      estimativa_min: null,
      // Digitada pelo pai: `confianca` null é o que distingue "ele escreveu" de "a IA
      // leu e acertou" — e o chip "confira" não deve aparecer aqui.
      confianca: null,
    });
    pintarTarefas();
  });

  pintarTarefas();
  raiz.append(el("h3", { class: "cap__subtitulo", text: "Tarefas" }), lista, adicionar);

  /* ---- Ações ------------------------------------------------------------- */

  const erro = el("p", {
    class: "pl-form__erro",
    attrs: { role: "status", "aria-live": "polite" },
  });

  const descartar = el("button", {
    class: "dash-btn dash-btn--ghost",
    attrs: { type: "button" },
    text: "Descartar",
  });
  descartar.addEventListener("click", close);

  const rascunho = el("button", {
    class: "dash-btn dash-btn--ghost",
    attrs: { type: "button" },
    text: "Salvar como rascunho",
  });
  const aprovar = el("button", {
    class: "dash-btn dash-btn--primary",
    attrs: { type: "button" },
    children: [
      el("span", { class: "pl-btn__ico", svg: ICON.check }),
      el("span", { text: "Aprovar e ativar" }),
    ],
  });

  async function salvar(status, botao) {
    const tarefas = estado.tarefas.filter((t) => (t.titulo || "").trim());
    if (!estado.titulo.trim()) {
      erro.textContent = "Dê um nome ao plano.";
      inTitulo.focus();
      return;
    }
    if (!tarefas.length) {
      erro.textContent = "Deixe pelo menos uma tarefa com título.";
      return;
    }

    const rotulo = botao.textContent;
    [descartar, rascunho, aprovar].forEach((b) => (b.disabled = true));
    botao.textContent = "Salvando…";
    erro.textContent = "";

    try {
      const plano = await ctx.mock.criarPlanoComTarefas(
        {
          titulo: estado.titulo.trim(),
          conteudo: estado.conteudo.trim(),
          foco: estado.foco,
          duracao_dias: estado.duracao_dias,
          status,
          origem: origemDoPlano(materiais, { pedido: !!pedido }),
          // Vai junto pra o pai poder auditar depois o que a IA entendeu, sem o
          // material — que não existe mais em lugar nenhum. E desde ago/2026 ele
          // também é conteúdo pro robô.
          extraido_texto: estado.extraido_texto.trim(),
        },
        tarefas.map((t, i) => ({
          titulo: t.titulo.trim(),
          detalhe: (t.detalhe || "").trim() || null,
          materia: t.materia || estado.foco,
          prazo: t.prazo || null,
          estimativa_min: t.estimativa_min,
          coluna: "a_fazer",
          ordem: (i + 1) * 1000,
          // `ia` desde a rodada 2 — o valor não fala mais de foto. O `ia_foto` dos
          // cards antigos continua aceito no banco e é lido igual.
          origem: t.confianca == null ? "pai" : "ia",
          confianca: t.confianca,
        }))
      );
      close();
      if (typeof aoSalvar === "function") aoSalvar(plano, status);
    } catch (err) {
      console.error("[Companion] Falha ao salvar o plano do material:", err);
      erro.textContent =
        "Não consegui salvar agora. Verifique sua conexão e tente de novo.";
      [descartar, rascunho, aprovar].forEach((b) => (b.disabled = false));
      botao.textContent = rotulo;
    }
  }

  rascunho.addEventListener("click", () => salvar("rascunho", rascunho));
  aprovar.addEventListener("click", () => salvar("ativo", aprovar));

  raiz.append(
    el("div", {
      class: "cap__rodape",
      children: [descartar, el("div", { class: "pl-form__spacer" }), rascunho, aprovar],
    }),
    erro
  );

  return raiz;
}
