/**
 * captura.js — "Da foto": o pai fotografa a agenda e a Cogni monta o plano.
 *
 * É o atalho que resolve o buraco número 1 da tela antiga: escrever plano dá
 * trabalho, e plano que dá trabalho não é criado. A informação já existe — está na
 * agenda escolar, na folha de exercícios, no bilhete da professora.
 *
 * O fluxo inteiro mora aqui:
 *   escolher → prévia → [Ler com a Cogni] → progresso → REVISÃO → salvar
 *
 * A tela de revisão é o coração da feature, e não um passo burocrático: **o pai
 * revisa, não confia cego**. Toda tarefa é editável, o que a IA leu fica visível pra
 * conferência, e nada chega ao robô sem ele aprovar (o plano nasce `rascunho`, que o
 * servidor já ignora).
 *
 * 🔒 A foto NUNCA é guardada — nem aqui, nem na função, nem no banco. Ela é lida,
 * vira `extraido_texto` + tarefas, e é descartada. É caderno de criança: decisão de
 * LGPD, e vale dizer na banca.
 */

import { el } from "./sections/_shared.js";
import { ICON, materiaIcon } from "./icons.js";
import { openModal } from "./modal.js";
import { materiasAgrupadas } from "./format.js";
import { USAR_SUPABASE } from "./mock-data.js";

/** Endpoint da Vercel Function. Mesma origem do site — não precisa de CORS. */
const ENDPOINT = "/api/plano-de-imagem";

/** Teto de imagens por geração. Bate com o da função (que recusa acima disso). */
const MAX_IMAGENS = 3;

/**
 * Maior lado da imagem depois do redimensionamento, e a qualidade do JPEG.
 *
 * Foto de celular tem 4-8 MB e estouraria o limite de 4,5 MB da Vercel — que é
 * cortado ANTES de a função rodar, então nem a mensagem de erro seria nossa. Além
 * disso, encolher aqui corta o custo de tokens de visão e sobe rápido no 4G, que é
 * onde o pai está quando tira a foto.
 */
const LADO_MAX = 1600;
const QUALIDADE = 0.82;

/** Abaixo disto o card ganha o chip "confira" — o mesmo corte da tela. */
const CONFIANCA_BAIXA = 0.6;

/* ==========================================================================
   Redimensionamento
   ========================================================================== */

/**
 * Decodifica o arquivo respeitando a orientação EXIF.
 *
 * Sem `imageOrientation: 'from-image'`, uma foto tirada com o celular deitado chega
 * girada 90° — e a IA lê um caderno de lado, com a confiança que isso merece.
 * @param {File} file
 * @returns {Promise<ImageBitmap|HTMLImageElement>}
 */
async function decodificar(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (err) {
      // Navegador sem a opção: cai no <img>, que já aplica o EXIF por padrão desde
      // que o CSS não force `image-orientation: none`.
      console.debug("[Companion] createImageBitmap indisponível:", err);
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Arquivo escolhido → data URL JPEG pronta pra subir.
 * @param {File} file
 * @returns {Promise<{url: string, largura: number, altura: number}>}
 */
async function prepararImagem(file) {
  const fonte = await decodificar(file);
  const lw = fonte.width;
  const lh = fonte.height;
  if (!lw || !lh) throw new Error("Não consegui ler essa imagem.");

  const escala = Math.min(1, LADO_MAX / Math.max(lw, lh));
  const largura = Math.max(1, Math.round(lw * escala));
  const altura = Math.max(1, Math.round(lh * escala));

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(fonte, 0, 0, largura, altura);
  if (fonte.close) fonte.close(); // libera o bitmap sem esperar o GC

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALIDADE)
  );
  if (!blob) throw new Error("Não consegui preparar essa imagem.");

  const url = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error || new Error("Falha ao ler a imagem."));
    fr.readAsDataURL(blob);
  });
  return { url, largura, altura };
}

/* ==========================================================================
   A chamada
   ========================================================================== */

/** Proposta de exemplo do modo mock — ver `lerImagens`. */
const PROPOSTA_EXEMPLO = {
  legivel: true,
  titulo: "Atividades da semana",
  conteudo:
    "Terminar a lista de frações e ler o capítulo do livro de português antes " +
    "da entrega de sexta.",
  foco: "matematica",
  duracao_dias: 7,
  extraido_texto:
    "AGENDA — 26/05\nMat: exercícios pág. 42 e 43 (frações equivalentes)\n" +
    "Port: ler cap. 3 do livro e responder as 5 perguntas\nEntregar sexta",
  tarefas: [
    {
      titulo: "Exercícios de frações",
      detalhe: "Páginas 42 e 43",
      materia: "matematica",
      prazo: null,
      estimativa_min: 30,
      confianca: 0.91,
    },
    {
      titulo: "Ler o capítulo 3 e responder",
      detalhe: "5 perguntas no fim do capítulo",
      materia: "portugues",
      prazo: null,
      estimativa_min: 40,
      // Baixa de propósito: é o card que exercita o chip "confira" na demonstração.
      confianca: 0.48,
    },
  ],
};

/** Erro com mensagem já escrita pro pai (não é bug: é um estado previsto). */
class ErroDeLeitura extends Error {}

/**
 * Manda as imagens pra Vercel Function e devolve a proposta.
 *
 * **No modo mock devolve um exemplo local, sem rede nenhuma.** Não é preguiça: é o
 * que permite demonstrar e testar a revisão inteira — edição inline, chip "confira",
 * rascunho × aprovar — sem OpenAI, sem deploy e sem login. É também o único jeito de
 * a feature ser testável com o site rodando num servidor estático local, onde
 * `/api/*` simplesmente não existe.
 *
 * @param {string[]} imagens — data URLs já redimensionadas
 * @returns {Promise<object>} a proposta (ou `{legivel:false, motivo}`)
 */
async function lerImagens(imagens) {
  if (!USAR_SUPABASE) {
    await new Promise((r) => window.setTimeout(r, 900));
    return JSON.parse(JSON.stringify(PROPOSTA_EXEMPLO));
  }

  const cliente = window.cognifyAuth && window.cognifyAuth.getClient();
  if (!cliente) throw new ErroDeLeitura("Entre na sua conta pra usar a leitura por foto.");
  const { data } = await cliente.auth.getSession();
  const token = data && data.session && data.session.access_token;
  if (!token) throw new ErroDeLeitura("Sua sessão expirou. Entre de novo.");

  let resp;
  try {
    resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ imagens, hoje: new Date().toISOString().slice(0, 10) }),
    });
  } catch (err) {
    console.error("[Companion] Rede falhou na leitura por foto:", err);
    throw new ErroDeLeitura("Sem conexão agora. Tente de novo em instantes.");
  }

  if (resp.status === 404) {
    // Site servido localmente (`python -m http.server`): a função só existe no
    // deploy. Dizer isso é muito melhor que um "erro inesperado" genérico.
    throw new ErroDeLeitura(
      "A leitura por foto só funciona no site publicado. Rodando local, use o modo de demonstração."
    );
  }

  let corpo = null;
  try {
    corpo = await resp.json();
  } catch (err) {
    throw new ErroDeLeitura("Não consegui ler a resposta do servidor.");
  }
  if (!resp.ok) {
    throw new ErroDeLeitura(corpo?.erro || "Não consegui ler a foto agora.");
  }
  return corpo;
}

/* ==========================================================================
   Peças de UI
   ========================================================================== */

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

let seq = 0;
const proximoId = () => `cap-${++seq}`;

/* ==========================================================================
   O modal
   ========================================================================== */

/**
 * Abre o fluxo "Da foto".
 *
 * @param {object} cfg
 * @param {object} cfg.ctx — o contexto do painel (usa `ctx.mock` pra gravar)
 * @param {(plano:object) => void} cfg.aoSalvar — chamado com o plano criado
 */
export function abrirCapturaDeFoto({ ctx, aoSalvar }) {
  openModal({
    title: "Criar plano a partir de uma foto",
    size: "lg",
    content: ({ close }) => montarFluxo({ ctx, aoSalvar, close }),
  });
}

function montarFluxo({ ctx, aoSalvar, close }) {
  const raiz = el("div", { class: "cap" });
  /** @type {Array<{url:string, nome:string}>} */
  let imagens = [];

  /* ---- Etapa 1: escolher ------------------------------------------------- */

  function etapaEscolher(erro) {
    raiz.replaceChildren();

    raiz.append(
      el("p", {
        class: "cap__intro",
        text:
          "Fotografe a agenda, a folha de exercícios ou o bilhete da professora. " +
          "A Cogni lê e monta as tarefas — você confere antes de valer.",
      })
    );

    // DOIS botões explícitos, não um só: "tirar foto" e "escolher da galeria" são
    // intenções diferentes, e um input com `capture` NÃO deixa o pai pegar a foto
    // que ele já tirou ontem.
    const inputCamera = el("input", {
      class: "cap__input",
      attrs: { type: "file", accept: "image/*", capture: "environment" },
    });
    const inputArquivo = el("input", {
      class: "cap__input",
      attrs: { type: "file", accept: "image/*", multiple: "multiple" },
    });
    inputCamera.addEventListener("change", () => receber(inputCamera.files));
    inputArquivo.addEventListener("change", () => receber(inputArquivo.files));

    const btnCamera = el("button", {
      class: "dash-btn dash-btn--primary cap__botao",
      attrs: { type: "button" },
      children: [
        el("span", { class: "pl-btn__ico", svg: ICON.camera }),
        el("span", { text: "Tirar foto" }),
      ],
    });
    btnCamera.addEventListener("click", () => inputCamera.click());

    const btnArquivo = el("button", {
      class: "dash-btn dash-btn--ghost cap__botao",
      attrs: { type: "button" },
      children: [
        el("span", { class: "pl-btn__ico", svg: ICON.image }),
        el("span", { text: "Escolher arquivo" }),
      ],
    });
    btnArquivo.addEventListener("click", () => inputArquivo.click());

    raiz.append(
      el("div", { class: "cap__botoes", children: [btnCamera, btnArquivo] }),
      inputCamera,
      inputArquivo
    );

    if (erro) {
      raiz.append(
        el("p", {
          class: "pl-form__erro",
          attrs: { role: "status", "aria-live": "polite" },
          text: erro,
        })
      );
    }

    if (imagens.length) raiz.append(previa(), acoesDaPrevia());

    raiz.append(
      el("p", {
        class: "cap__lgpd",
        text:
          "A foto não fica guardada em lugar nenhum: ela é lida, vira texto, e é " +
          "descartada.",
      })
    );
  }

  async function receber(lista) {
    const arquivos = Array.from(lista || []).slice(0, MAX_IMAGENS - imagens.length);
    if (!arquivos.length) return;
    etapaProgresso("preparando as fotos…");
    try {
      for (const f of arquivos) {
        const { url } = await prepararImagem(f);
        imagens.push({ url, nome: f.name || "foto" });
      }
      etapaEscolher();
    } catch (err) {
      console.error("[Companion] Falha ao preparar a imagem:", err);
      etapaEscolher("Não consegui abrir essa imagem. Tente outra foto.");
    }
  }

  function previa() {
    const grade = el("div", { class: "cap__previa" });
    imagens.forEach((img, i) => {
      const thumb = el("img", {
        class: "cap__thumb",
        attrs: { src: img.url, alt: `Prévia da foto ${i + 1}` },
      });
      const remover = el("button", {
        class: "cap__remover",
        attrs: { type: "button", "aria-label": `Remover a foto ${i + 1}` },
        svg: ICON.trash,
      });
      remover.addEventListener("click", () => {
        imagens.splice(i, 1);
        etapaEscolher();
      });
      grade.append(el("figure", { class: "cap__item", children: [thumb, remover] }));
    });
    return grade;
  }

  function acoesDaPrevia() {
    const ler = el("button", {
      class: "dash-btn dash-btn--primary",
      attrs: { type: "button" },
      children: [
        el("span", { class: "pl-btn__ico", svg: ICON.sparkle }),
        el("span", { text: "Ler com a Cogni" }),
      ],
    });
    ler.addEventListener("click", executarLeitura);
    const contagem = el("span", {
      class: "cap__contagem",
      text:
        imagens.length === MAX_IMAGENS
          ? "Máximo de 3 fotos"
          : `${imagens.length} de ${MAX_IMAGENS} fotos`,
    });
    return el("div", { class: "cap__acoes", children: [contagem, ler] });
  }

  /* ---- Etapa 2: progresso honesto ---------------------------------------- */

  function etapaProgresso(texto) {
    raiz.replaceChildren(
      el("div", {
        class: "cap__carregando",
        attrs: { role: "status", "aria-live": "polite" },
        children: [
          el("span", { class: "dash-loading__spinner", attrs: { "aria-hidden": "true" } }),
          el("p", { class: "cap__carregando-texto", text: texto }),
        ],
      })
    );
  }

  async function executarLeitura() {
    // Progresso HONESTO: as duas frases correspondem ao que está de fato
    // acontecendo (visão e depois estruturação), e não a uma barra decorativa.
    etapaProgresso("lendo a imagem…");
    const trocar = window.setTimeout(
      () => etapaProgresso("montando as tarefas…"),
      3500
    );
    try {
      const proposta = await lerImagens(imagens.map((i) => i.url));
      window.clearTimeout(trocar);
      if (!proposta || proposta.legivel === false) {
        etapaFotoRuim(proposta && proposta.motivo);
        return;
      }
      etapaRevisao(proposta);
    } catch (err) {
      window.clearTimeout(trocar);
      const msg =
        err instanceof ErroDeLeitura
          ? err.message
          : "Não consegui ler a foto agora. Tente de novo em instantes.";
      if (!(err instanceof ErroDeLeitura)) {
        console.error("[Companion] Leitura por foto falhou:", err);
      }
      etapaEscolher(msg);
    }
  }

  /* ---- Foto ruim: mensagem com dica, nunca erro genérico ----------------- */

  function etapaFotoRuim(motivo) {
    raiz.replaceChildren();
    raiz.append(
      el("div", {
        class: "cap__ruim",
        children: [
          el("span", { class: "cap__ruim-ico", svg: ICON.camera }),
          el("p", {
            class: "cap__ruim-titulo",
            text: motivo || "Não consegui ler essa foto.",
          }),
          el("p", {
            class: "cap__ruim-dica",
            text:
              "Tente de novo com a folha inteira no quadro, o celular parado e " +
              "boa luz — sem sombra por cima do papel.",
          }),
        ],
      })
    );
    const tentar = el("button", {
      class: "dash-btn dash-btn--primary",
      attrs: { type: "button" },
      text: "Tentar outra foto",
    });
    tentar.addEventListener("click", () => {
      imagens = [];
      etapaEscolher();
    });
    raiz.append(el("div", { class: "cap__acoes", children: [tentar] }));
  }

  /* ---- Etapa 3: REVISÃO — o coração da feature --------------------------- */

  function etapaRevisao(proposta) {
    raiz.replaceChildren();
    // A foto já cumpriu o papel: soltamos as data URLs aqui pra não segurar alguns
    // MB de base64 em memória enquanto o pai revisa com calma.
    imagens = [];

    const estado = {
      titulo: proposta.titulo || "",
      conteudo: proposta.conteudo || "",
      foco: proposta.foco || "outros",
      duracao_dias: proposta.duracao_dias || 7,
      extraido_texto: proposta.extraido_texto || "",
      tarefas: (proposta.tarefas || []).map((t) => ({ ...t })),
    };

    const baixas = estado.tarefas.filter(
      (t) => Number(t.confianca) < CONFIANCA_BAIXA
    ).length;

    raiz.append(
      el("p", {
        class: "cap__intro",
        text: baixas
          ? `Confira antes de aprovar — ${baixas} ${
              baixas === 1 ? "tarefa está marcada" : "tarefas estão marcadas"
            } com "confira", porque a Cogni não teve certeza do que leu.`
          : "Confira o que a Cogni entendeu. Dá pra editar tudo antes de salvar.",
      })
    );

    /* Cabeçalho do plano */
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

    /* O que a Cogni leu — a auditoria que substitui guardar a foto */
    if (estado.extraido_texto) {
      raiz.append(
        el("details", {
          class: "cap__leitura",
          children: [
            el("summary", { text: "Ver o que a Cogni leu" }),
            el("pre", { class: "cap__leitura-texto", text: estado.extraido_texto }),
          ],
        })
      );
    }

    /* Lista de tarefas */
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

      const inD = el("input", {
        class: "pl-input",
        attrs: {
          type: "text",
          maxlength: "240",
          placeholder: "Detalhe (ex.: páginas 42 e 43)",
          value: tarefa.detalhe || "",
        },
      });
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

      const filhos = [topo, inD, el("div", {
        class: "cap__tarefa-meta",
        children: [selM, inP],
      })];

      if (baixa) {
        // O chip só aparece onde ele muda o comportamento do pai: em cima do campo
        // que ele precisa reler. Um aviso genérico no topo não faria ninguém olhar.
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
        // Digitada pelo pai: `confianca` null é o que distingue "ele escreveu" de
        // "a IA leu e acertou" — e o chip "confira" não deve aparecer aqui.
        confianca: null,
      });
      pintarTarefas();
    });

    pintarTarefas();
    raiz.append(
      el("h3", { class: "cap__subtitulo", text: "Tarefas" }),
      lista,
      adicionar
    );

    /* Ações */
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
            origem: "foto",
            // Vai junto pra o pai poder auditar depois o que a IA entendeu, sem a
            // imagem — que não existe mais em lugar nenhum.
            extraido_texto: estado.extraido_texto,
          },
          tarefas.map((t, i) => ({
            titulo: t.titulo.trim(),
            detalhe: (t.detalhe || "").trim() || null,
            materia: t.materia || estado.foco,
            prazo: t.prazo || null,
            estimativa_min: t.estimativa_min,
            coluna: "a_fazer",
            ordem: (i + 1) * 1000,
            origem: t.confianca == null ? "pai" : "ia_foto",
            confianca: t.confianca,
          }))
        );
        close();
        if (typeof aoSalvar === "function") aoSalvar(plano, status);
      } catch (err) {
        console.error("[Companion] Falha ao salvar o plano da foto:", err);
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
  }

  etapaEscolher();
  return raiz;
}
