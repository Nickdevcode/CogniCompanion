/**
 * config.js — Seção "Configurações" (título: "Configurações da família").
 *
 * Blocos (escopo MVP atualizado):
 *   - Perfil da criança pareada → card + modal de detalhe com edição FUNCIONAL
 *     (infos da criança + prompt_personalizado). Single-child: 1 perfil só.
 *   - Conta do responsável (nome/e-mail + sair).
 *   - Tema (claro/escuro).
 *   - Vínculo com o Cogni: status do pareamento, código do perfil e desvincular.
 *
 * Sem "Filtros de segurança", "Limites de tempo/horário", "Adicionar
 * responsável" nem "Preferências de notificação" (anulados no escopo). Edição do
 * perfil é update em `criancas` (RLS protege).
 *
 * ⚠️ O perfil tem DUAS pontas escrevendo nele: esta tela e o robô (que desde
 * 15/ago/2026 ajusta os 9 campos por voz, `prompt_personalizado` incluído). Como
 * o conflito é resolvido por "última escrita vence", tudo aqui parte de uma
 * leitura fresca — ao entrar na seção, ao abrir o modal e ao voltar pra aba.
 */

import { el, sectionRoot, pageHead } from "./_shared.js";
import { dicaInfo } from "../tooltip.js";
import { ICON, materiaIcon } from "../icons.js";
import { openModal } from "../modal.js";
import {
  materiasAgrupadas,
  idadeLabel,
  serieLabel,
  SERIES,
  primeiroNome,
  sujeito,
  deQuem,
  capitalizar,
} from "../format.js";

/**
 * Busca o código de pareamento do perfil no servidor local (não-Supabase).
 *   GET {servidorUrl}/api/pareamento/codigo?usuarioId=<id> → { codigo, nome }
 * @returns {Promise<string|null>} o código, ou null se indisponível/erro
 */
async function buscarCodigoPareamento(servidorUrl, criancaId) {
  try {
    const url = `${servidorUrl}/api/pareamento/codigo?usuarioId=${encodeURIComponent(
      criancaId
    )}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const dados = await resp.json();
    return dados && dados.codigo ? dados.codigo : null;
  } catch (e) {
    console.error("[Companion] Não consegui buscar o código de pareamento:", e);
    return null;
  }
}

/**
 * Desvincula a criança do responsável (o pai escolheu desfazer o vínculo).
 *   POST {servidorUrl}/api/pareamento/desvincular { criancaId, responsavelId }
 *   → 200 { ok, jaDesvinculado } · 404 · 400
 * @returns {Promise<{ok:boolean, erro?:string}>}
 */
async function desvincularCrianca(servidorUrl, criancaId, responsavelId) {
  try {
    const resp = await fetch(`${servidorUrl}/api/pareamento/desvincular`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ criancaId, responsavelId }),
    });
    let dados = {};
    try {
      dados = await resp.json();
    } catch (_) {
      /* sem corpo */
    }
    if (resp.ok && dados.ok) return { ok: true };
    return { ok: false, erro: dados.erro || "Não foi possível desvincular agora." };
  } catch (e) {
    console.error("[Companion] Desvincular falhou:", e);
    return {
      ok: false,
      erro:
        "Não consegui falar com a Cogni. Confirme que o robô/servidor está ligado.",
    };
  }
}


/* --------------------------------------------------------------------------
   Componentes de UI
   -------------------------------------------------------------------------- */

/**
 * Cabeçalho de um card de configuração (ícone + título + subtítulo).
 * @param {string} iconSvg
 * @param {string} titulo
 * @param {string} [subtitulo]
 * @param {string} [dica] — o que muda de verdade quando o pai mexe neste bloco.
 *   Vira o "?" no canto do cabeçalho. O subtítulo diz o QUE é; a dica diz a
 *   consequência, que é a dúvida que sobra numa tela de ajustes.
 */
function blocoHead(iconSvg, titulo, subtitulo, dica) {
  return el("div", {
    class: "cfg-block__head",
    children: [
      el("span", { class: "cfg-block__ico", svg: iconSvg }),
      el("div", {
        class: "cfg-block__heading",
        children: [
          el("h2", { class: "cfg-block__title", text: titulo }),
          subtitulo
            ? el("p", { class: "cfg-block__sub", text: subtitulo })
            : null,
        ],
      }),
      dica ? dicaInfo(dica, { rotulo: titulo, pos: "left" }) : null,
    ],
  });
}

/** Switch acessível (toggle) reutilizável. */
function toggle(checked, onChange, ariaLabel) {
  const btn = el("button", {
    class: "cfg-switch" + (checked ? " is-on" : ""),
    attrs: {
      type: "button",
      role: "switch",
      "aria-checked": String(checked),
      "aria-label": ariaLabel || "Alternar",
    },
    children: [el("span", { class: "cfg-switch__knob", attrs: { "aria-hidden": "true" } })],
  });
  btn.addEventListener("click", () => {
    const on = btn.classList.toggle("is-on");
    btn.setAttribute("aria-checked", String(on));
    if (onChange) onChange(on);
  });
  return btn;
}

/* --------------------------------------------------------------------------
   Bloco: Perfil da criança pareada
   -------------------------------------------------------------------------- */
function blocoPerfil(crianca, onAbrirDetalhe) {
  const bloco = el("section", { class: "dash-card cfg-block cfg-block--perfil" });
  bloco.appendChild(
    blocoHead(
      ICON.user,
      "Perfil da criança",
      "Quem conversa com a Cogni em casa.",
      "Idade e série já bastam pra Cogni parar de perguntar o básico e ajustar o nível das explicações. O resto ela aprende conversando."
    )
  );

  const body = el("div", { class: "cfg-block__body" });

  if (!crianca) {
    body.appendChild(
      el("div", {
        class: "cfg-nopair",
        children: [
          el("p", {
            class: "cfg-nopair__text",
            text: "Nenhuma criança pareada. Use o código do robô para vincular.",
          }),
        ],
      })
    );
    bloco.appendChild(body);
    return bloco;
  }

  const card = el("button", {
    class: "cfg-child",
    attrs: { type: "button" },
    children: [
      el("span", {
        class: "cfg-child__avatar",
        svg: ICON.user,
        attrs: { "aria-hidden": "true" },
      }),
      el("div", {
        class: "cfg-child__info",
        children: [
          el("div", {
            class: "cfg-child__namerow",
            children: [
              el("span", { class: "cfg-child__name", text: crianca.nome }),
              el("span", { class: "cfg-child__tag", text: "Perfil infantil" }),
            ],
          }),
          el("span", {
            class: "cfg-child__meta",
            text:
              [idadeLabel(crianca.idade), serieLabel(crianca.serie)]
                .filter(Boolean)
                .join(" • ") || "Toque para ver os detalhes",
          }),
        ],
      }),
      el("span", {
        class: "cfg-child__chev",
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
      }),
    ],
  });
  card.addEventListener("click", onAbrirDetalhe);
  body.appendChild(card);
  bloco.appendChild(body);
  return bloco;
}

/** Campo do formulário de detalhe do perfil. */
function campo(labelText, control, { full } = {}) {
  const wrap = el("div", {
    class: "cfg-field" + (full ? " cfg-field--full" : ""),
  });
  const lbl = el("label", { class: "cfg-field__label", text: labelText });
  if (control.id) lbl.setAttribute("for", control.id);
  wrap.append(lbl, control);
  return wrap;
}

/** Conteúdo do modal de detalhe/edição do perfil. */
function formularioPerfil(crianca, { onSubmit, close }) {
  const form = el("form", { class: "cfg-form", attrs: { novalidate: "true" } });

  const txt = (id, valor, attrs = {}) =>
    el("input", {
      class: "cfg-input",
      attrs: { id, type: "text", value: valor || "", ...attrs },
    });

  const inNome = txt("cf-nome", crianca.nome, { maxlength: "60" });
  const inIdade = el("input", {
    class: "cfg-input",
    attrs: {
      id: "cf-idade",
      type: "number",
      // 4–18 é a faixa que o robô valida e que a camada didática sabe calibrar.
      // Oferecer menos que isso seria propor um valor que o resto do sistema não usa.
      min: "4",
      max: "18",
      inputmode: "numeric",
      value: crianca.idade != null ? String(crianca.idade) : "",
    },
  });

  /**
   * Se o valor salvo não estiver entre as opções montadas, cria uma option com
   * ele (rótulo: o próprio texto) e a deixa selecionada.
   *
   * Sem isto o `<select>` cai na primeira opção ("— não definido —") e o submit
   * manda `null` — APAGANDO no banco um valor que o formulário só não sabia
   * exibir: a matéria que a Cogni aprendeu conversando, uma série legada, um
   * vocabulário que divergiu entre as pontas. Regra geral do painel: formulário
   * que não sabe representar um valor não tem o direito de apagá-lo.
   *
   * A option entra logo depois da vazia — é o valor atual, pertence ao topo.
   */
  const preservarValorSalvo = (sel, valor) => {
    const atual = (valor || "").trim();
    if (!atual) return;
    if (Array.from(sel.options).some((o) => o.value === atual)) return;
    const extra = el("option", { attrs: { value: atual }, text: atual });
    extra.selected = true;
    sel.insertBefore(extra, sel.firstChild.nextSibling);
  };

  /** `<select>` com a opção vazia no topo (o campo é nullable no contrato). */
  const mkSelect = (id) => {
    const sel = el("select", { class: "cfg-input cfg-select", attrs: { id } });
    sel.appendChild(el("option", { attrs: { value: "" }, text: "Não definido" }));
    return sel;
  };

  // Série: os 12 valores canônicos, com o rótulo que o pai reconhece. Era texto
  // livre, e aí o servidor normalizava por trás — o pai digitava "1º ano do
  // ensino médio" e o campo voltava "10o ano" na leitura seguinte.
  const selSerie = mkSelect("cf-serie");
  SERIES.forEach((valor) => {
    const o = el("option", { attrs: { value: valor }, text: serieLabel(valor) });
    if (crianca.serie === valor) o.selected = true;
    selSerie.appendChild(o);
  });
  preservarValorSalvo(selSerie, crianca.serie);

  // Matéria favorita / difícil (selects com as matérias, agrupadas por área)
  const mkSelectMateria = (id, valor) => {
    const sel = mkSelect(id);
    materiasAgrupadas().forEach((grupo) => {
      const og = el("optgroup", { attrs: { label: grupo.label } });
      grupo.materias.forEach((m) => {
        const o = el("option", { attrs: { value: m.valor }, text: m.label });
        if (valor === m.valor) o.selected = true;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
    preservarValorSalvo(sel, valor);
    return sel;
  };
  const selFav = mkSelectMateria("cf-fav", crianca.materia_favorita);
  const selDif = mkSelectMateria("cf-dif", crianca.materia_dificil);

  const inHobbies = txt("cf-hobbies", crianca.hobbies, { maxlength: "120" });
  const inComoAprende = el("textarea", {
    class: "cfg-input cfg-textarea",
    attrs: { id: "cf-como", rows: "2", maxlength: "200" },
  });
  inComoAprende.value = crianca.como_aprende || "";
  const inEstilo = el("textarea", {
    class: "cfg-input cfg-textarea",
    attrs: { id: "cf-estilo", rows: "2", maxlength: "200" },
  });
  inEstilo.value = crianca.estilo_linguagem || "";

  // Prompt personalizado (o destaque — instruções do pai pra Cogni).
  //
  // O campo é multi-linha DE VERDADE: desde 15/ago/2026 o pai também dita
  // instruções falando com o robô, e cada uma entra como uma linha nova. Por
  // isso o texto entra e sai por `.value` (que preserva os `\n`) e o submit só
  // apara as pontas — nada aqui pode colapsar as quebras, senão as instruções
  // acumuladas viram um parágrafo só, ilegível pra quem quiser revisar.
  const inPrompt = el("textarea", {
    class: "cfg-input cfg-textarea cfg-textarea--prompt",
    attrs: {
      id: "cf-prompt",
      rows: "4",
      maxlength: "600",
      // `soft` é o padrão, mas aqui é decisão: `hard` gravaria quebras de linha
      // que o pai não escreveu, inventando instrução onde só houve wrap visual.
      wrap: "soft",
      placeholder:
        "Ex.: Incentive a curiosidade sobre ciências e use exemplos com dinossauros.",
    },
  });
  inPrompt.value = crianca.prompt_personalizado || "";

  // Altura acompanha o conteúdo: com `rows` fixo, seis instruções ditadas viram
  // uma janelinha de quatro linhas com scroll — as quebras estão lá, mas o pai
  // não as vê. Cresce até o teto e devolve o scroll a partir dali.
  const ALTURA_MAX_PROMPT = 260;
  // `scrollHeight` mede conteúdo + padding, sem as bordas; com `box-sizing:
  // border-box` (o padrão do projeto), aplicá-lo cru deixa a última linha 2px
  // curta e o campo nasce com scroll. Medido uma vez, já no DOM.
  let bordaVertical = null;
  const ajustarAlturaPrompt = () => {
    if (bordaVertical === null) {
      const estilo = getComputedStyle(inPrompt);
      bordaVertical =
        parseFloat(estilo.borderTopWidth) + parseFloat(estilo.borderBottomWidth);
    }
    inPrompt.style.height = "auto";
    inPrompt.style.height =
      Math.min(inPrompt.scrollHeight + bordaVertical, ALTURA_MAX_PROMPT) + "px";
  };
  inPrompt.addEventListener("input", ajustarAlturaPrompt);
  // Largura nova = quebras de linha diferentes (girar o celular com o modal
  // aberto). O listener se aposenta quando o formulário sai do DOM — o modal é
  // descartado a cada abertura, e sem isso sobraria um listener por visita.
  const aoRedimensionar = () => {
    if (!inPrompt.isConnected) {
      window.removeEventListener("resize", aoRedimensionar);
      return;
    }
    ajustarAlturaPrompt();
  };
  window.addEventListener("resize", aoRedimensionar);
  // `scrollHeight` é 0 fora do DOM, e o formulário só entra nele quando o modal
  // monta — daí o ajuste inicial esperar um frame.
  requestAnimationFrame(ajustarAlturaPrompt);

  // Seção 1: dados básicos (grid)
  const grid = el("div", {
    class: "cfg-form__grid",
    children: [
      campo("Nome", inNome, { full: true }),
      campo("Idade", inIdade),
      campo("Série", selSerie),
      campo("Matéria favorita", selFav),
      campo("Matéria difícil", selDif),
      campo("Hobbies", inHobbies, { full: true }),
      campo("Como aprende melhor", inComoAprende, { full: true }),
      campo("Estilo de linguagem", inEstilo, { full: true }),
    ],
  });

  // Seção 2: prompt personalizado (destacada)
  const promptSection = el("div", {
    class: "cfg-prompt",
    children: [
      el("div", {
        class: "cfg-prompt__head",
        children: [
          el("span", { class: "cfg-prompt__ico", svg: ICON.robot }),
          el("div", {
            children: [
              el("h3", {
                class: "cfg-prompt__title",
                text: "Personalização da Cogni",
              }),
              el("p", {
                class: "cfg-prompt__hint",
                text: "Instruções suas que a Cogni segue ao conversar com esta criança.",
              }),
            ],
          }),
        ],
      }),
      campo("Prompt personalizado", inPrompt, { full: true }),
      // A porta de entrada que a tela não contava que existe: o campo também é
      // preenchido por voz, e o pai que não sabe disso estranha quando o texto
      // aparece diferente do que ele digitou.
      el("p", {
        class: "cfg-prompt__voz",
        children: [
          el("span", {
            class: "cfg-prompt__voz-ico",
            svg: ICON.mic,
            attrs: { "aria-hidden": "true" },
          }),
          el("span", {
            text:
              "Dá pra ditar isso também: fale com o robô (“não fale sobre morte com ele”) " +
              "e a Cogni acrescenta a instrução aqui, uma por linha. Ela não distingue " +
              "quem falou, então uma linha que você não digitou pode ter vindo daí: " +
              "vale conferir de vez em quando.",
          }),
        ],
      }),
    ],
  });

  form.append(grid, promptSection);

  // Ações
  const cancelBtn = el("button", {
    class: "dash-btn dash-btn--ghost",
    attrs: { type: "button" },
    text: "Cancelar",
  });
  cancelBtn.addEventListener("click", close);
  const saveBtn = el("button", {
    class: "dash-btn dash-btn--primary",
    attrs: { type: "submit" },
    text: "Salvar perfil",
  });
  form.appendChild(
    el("div", {
      class: "cfg-form__actions",
      children: [el("div", { class: "cfg-form__spacer" }), cancelBtn, saveBtn],
    })
  );

  // Aviso de falha (rede/RLS). Mesma classe do formulário de Planos — o painel
  // já compartilha essas peças de formulário entre as seções.
  const erroSalvar = el("p", {
    class: "pl-form__erro",
    attrs: { role: "status", "aria-live": "polite" },
  });
  form.appendChild(erroSalvar);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const idadeVal = parseInt(inIdade.value, 10);

    // Trava o botão durante o update e mostra a falha se ela vier: o perfil
    // alimenta o prompt da Cogni, então "achei que tinha salvado" é caro aqui.
    saveBtn.disabled = true;
    saveBtn.textContent = "Salvando…";
    erroSalvar.textContent = "";
    try {
      await onSubmit({
        nome: inNome.value.trim() || crianca.nome,
        idade: Number.isNaN(idadeVal) ? null : idadeVal,
        serie: selSerie.value,
        materia_favorita: selFav.value || null,
        materia_dificil: selDif.value || null,
        hobbies: inHobbies.value.trim(),
        como_aprende: inComoAprende.value.trim(),
        estilo_linguagem: inEstilo.value.trim(),
        prompt_personalizado: inPrompt.value.trim(),
      });
    } catch (err) {
      console.error("[Companion] Falha ao salvar o perfil:", err);
      erroSalvar.textContent =
        "Não consegui salvar agora. Verifique sua conexão e tente de novo.";
      if (window.cognifyToast) {
        window.cognifyToast.show("Não foi possível salvar o perfil.", {
          type: "error",
        });
      }
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Salvar perfil";
    }
  });

  return form;
}

/* --------------------------------------------------------------------------
   Bloco: o que a Cogni já sabe (`criancas.memorias`) ⭐ 19/ago/2026

   O gatilho foi um teste real: o pai contou coisas pra Cogni (o hobby, o jeito
   de aprender, um assunto proibido) e não achou NADA disso no painel. Parte
   tinha sido guardada mesmo — em `criancas.memorias`, o campo mais rico do
   perfil e o único que nenhuma tela lia. O `select("*")` do `getCrianca()` já
   trazia a coluna: faltava mostrar.

   Três decisões definem o bloco:

   1. Só REMOVER. Não existe "adicionar" nem "editar" aqui, e a ausência é a
      feature: quem escreve memória é a Cogni, na conversa. Um campo de texto
      neste lugar convidaria o pai a programar a filha por trás, que não é o que
      este campo é. Remover existe por dois motivos legítimos — controle do
      responsável, e corrigir o que ela entendeu errado (sem id por memória,
      corrigir é apagar e deixar ela reaprender).
   2. Um por vez, com confirmação. Pelo site a remoção não tem volta: a Cogni só
      reaprende aquilo se o assunto reaparecer numa conversa.
   3. A remoção parte de uma leitura FRESCA do banco (ver `removerMemoria`).
   -------------------------------------------------------------------------- */

/**
 * As memórias em forma de lista limpa.
 *
 * `memorias` é jsonb livre escrito pelo robô: pode vir `null` (perfil que nunca
 * conversou), com item vazio, ou com algo que não é string. Item torto some da
 * lista em vez de derrubar a seção — mesma prática do saneamento da trilha.
 * @param {object|null} crianca
 * @returns {string[]}
 */
function memoriasDe(crianca) {
  const bruto = crianca && crianca.memorias;
  if (!Array.isArray(bruto)) return [];
  return bruto
    .map((m) => (typeof m === "string" ? m.trim() : ""))
    .filter(Boolean);
}

/**
 * Remove UMA memória, relendo o perfil antes de gravar.
 *
 * 🔴 Por que a releitura é obrigatória. Não há id por memória: apagar é regravar
 * o array inteiro sem aquele item. Se o array regravado for o que estava NA TELA,
 * tudo que a Cogni aprendeu enquanto o pai olhava a página é apagado junto — que
 * é exatamente o defeito que esta rodada acabou de matar do outro lado (o modelo
 * reescrevendo o campo inteiro e perdendo instrução). Então a lista que vai pro
 * banco nasce do banco, e o item sai dela pelo TEXTO.
 *
 * Some só a primeira ocorrência: duas memórias idênticas são duas linhas na tela,
 * e apagar as duas de um clique surpreenderia quem clicou em uma.
 *
 * @param {object} ctx — o contexto do painel (a camada de dados)
 * @param {string} texto — a memória a esquecer, como está no banco
 * @returns {Promise<object>} a criança atualizada (ou a atual, se nada mudou)
 */
async function removerMemoria(ctx, texto) {
  const fresca = await ctx.mock.getCrianca({ fresco: true });
  const atuais = memoriasDe(fresca);
  const i = atuais.indexOf(texto);
  // Já não está lá: o robô pode ter reescrito a lista no meio do caminho. Isso é
  // sucesso, não erro — o pai pediu que sumisse, e sumiu.
  if (i === -1) return fresca;
  const restantes = atuais.slice(0, i).concat(atuais.slice(i + 1));
  return ctx.mock.atualizarCrianca({ memorias: restantes });
}

/**
 * Confirmação antes de esquecer (a Cogni só reaprende se o assunto voltar).
 *
 * `aoRemover` roda depois que o modal fecha, e SÓ quando algo foi removido: o
 * `openModal` devolve o foco a quem o abriu, e quem o abriu foi um botão que
 * acabou de sair do DOM — sem este gancho, o teclado cai fora da lista no meio
 * da tarefa. No cancelar não roda, porque aí o botão original continua lá e a
 * devolução normal do modal é a certa.
 */
function confirmarEsquecer({ texto, onConfirmado, aoRemover }) {
  let removeu = false;
  openModal({
    title: "Esquecer isto",
    size: "sm",
    onClose: () => {
      if (removeu && typeof aoRemover === "function") aoRemover();
    },
    content: ({ close }) => {
      const wrap = el("div", { class: "pl-confirm" });
      // A memória vai CITADA, e não embutida numa frase ("a Cogni vai esquecer
      // que Tem um cachorro chamado Thor"): ela é uma frase inteira, com
      // maiúscula e ponto, escrita pelo robô. Encaixá-la no meio da nossa frase
      // produz uma capitalização torta em quase todo item.
      wrap.appendChild(
        el("p", { class: "pl-confirm__text", text: "A Cogni vai esquecer isto:" })
      );
      wrap.appendChild(
        el("p", { class: "cfg-mem__quote", text: capitalizar(texto) })
      );
      wrap.appendChild(
        el("p", {
          class: "pl-confirm__hint",
          text: "Ela pode aprender de novo se o assunto voltar numa conversa.",
        })
      );
      const feedback = el("p", {
        class: "ob-feedback",
        attrs: { role: "status", "aria-live": "polite" },
      });

      const cancel = el("button", {
        class: "dash-btn dash-btn--ghost",
        attrs: { type: "button" },
        text: "Cancelar",
      });
      cancel.addEventListener("click", close);

      const confirm = el("button", {
        class: "pl-btn pl-btn--danger",
        attrs: { type: "button" },
        children: [
          el("span", { class: "pl-btn__ico", svg: ICON.trash }),
          el("span", { text: "Esquecer" }),
        ],
      });
      confirm.addEventListener("click", async () => {
        confirm.disabled = true;
        cancel.disabled = true;
        feedback.textContent = "Esquecendo…";
        feedback.classList.remove("is-error");
        try {
          await onConfirmado();
          removeu = true;
          close();
          if (window.cognifyToast)
            window.cognifyToast.show("A Cogni esqueceu.", { type: "info" });
        } catch (e) {
          console.error("[Companion] Não consegui apagar a memória:", e);
          confirm.disabled = false;
          cancel.disabled = false;
          feedback.textContent =
            "Não consegui apagar agora. Verifique sua conexão e tente de novo.";
          feedback.classList.add("is-error");
        }
      });

      wrap.appendChild(
        el("div", { class: "pl-confirm__actions", children: [cancel, confirm] })
      );
      wrap.appendChild(feedback);
      return wrap;
    },
  });
}

/**
 * O card "O que a Cogni sabe de <nome>".
 * @param {{crianca: object|null, onEsquecer: (texto:string)=>void}} cfg
 */
function blocoMemorias({ crianca, onEsquecer }) {
  const primeiro = primeiroNome(crianca && crianca.nome);
  const bloco = el("section", { class: "dash-card cfg-block cfg-block--memoria" });
  bloco.appendChild(
    blocoHead(
      ICON.heart,
      // `deQuem()` em vez de "sobre a <nome>": o contrato de `criancas` não tem
      // gênero, e o título do card não pode ser a frase que erra sobre a filha
      // de metade das famílias.
      `O que a Cogni sabe ${deQuem(primeiro)}`,
      "Coisas que ela guardou das conversas.",
      "Ela anota sozinha o que aparece na conversa e usa depois pra puxar assunto. Some daqui o que não fizer sentido, ou o que ela tiver entendido errado."
    )
  );

  const body = el("div", { class: "cfg-block__body" });
  const itens = memoriasDe(crianca);

  if (!itens.length) {
    body.appendChild(
      el("p", {
        class: "cfg-mem__vazio",
        text: `A Cogni ainda está conhecendo ${sujeito(
          primeiro
        )}. O que ela aprender nas conversas aparece aqui.`,
      })
    );
    bloco.appendChild(body);
    return bloco;
  }

  const lista = el("ul", { class: "cfg-mem" });
  itens.forEach((texto, indice) => {
    // O texto vem do robô e chega em minúscula com frequência; aqui ele ABRE a
    // linha, então passa por `capitalizar()`. O valor no banco continua o dele —
    // a remoção casa pelo texto cru, não pelo que está na tela.
    const rotulo = capitalizar(texto);
    const del = el("button", {
      class: "cfg-mem__del",
      attrs: {
        type: "button",
        "aria-label": `Esquecer: ${rotulo}`,
        "data-dica": "A Cogni esquece isto.",
      },
      svg: ICON.trash,
    });
    del.addEventListener("click", () => onEsquecer(texto, indice));

    lista.appendChild(
      el("li", {
        class: "cfg-mem__item",
        children: [el("span", { class: "cfg-mem__text", text: rotulo }), del],
      })
    );
  });
  body.appendChild(lista);

  // Sem esta linha, a primeira pergunta do card é "e como eu acrescento?". Ela
  // responde a ausência do botão em vez de deixar o pai procurando por ele.
  body.appendChild(
    el("p", {
      class: "cfg-mem__nota",
      text: "Quem escreve aqui é a Cogni, conversando. Dá pra remover o que não fizer sentido, mas não dá pra editar nem acrescentar.",
    })
  );

  bloco.appendChild(body);
  return bloco;
}

/* --------------------------------------------------------------------------
   Bloco: Conta do responsável
   -------------------------------------------------------------------------- */
function blocoConta(responsavel) {
  const bloco = el("section", { class: "dash-card cfg-block cfg-block--conta" });
  bloco.appendChild(
    blocoHead(
      ICON.user,
      "Conta",
      "Seus dados de responsável.",
      "Esta conta é sua. A criança não tem login: ela fala com a Cogni pelo robô."
    )
  );

  const linha = (rotulo, valor) =>
    el("div", {
      class: "cfg-data",
      children: [
        el("span", { class: "cfg-data__label", text: rotulo }),
        el("span", { class: "cfg-data__value", text: valor || "Não informado" }),
      ],
    });

  const sairBtn = el("button", {
    class: "cfg-logout",
    attrs: { type: "button" },
    children: [
      el("span", {
        class: "cfg-logout__ico",
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>',
      }),
      el("span", { text: "Sair da conta" }),
    ],
  });
  sairBtn.addEventListener("click", async () => {
    sairBtn.disabled = true;
    try {
      if (window.cognifyAuth) await window.cognifyAuth.signOut();
      window.location.href = "index.html";
    } catch (e) {
      sairBtn.disabled = false;
      if (window.cognifyToast)
        window.cognifyToast.show("Não foi possível sair agora.", { type: "error" });
    }
  });

  bloco.appendChild(
    el("div", {
      class: "cfg-block__body",
      children: [
        linha("Nome", responsavel.nome),
        linha("E-mail", responsavel.email),
        sairBtn,
      ],
    })
  );
  return bloco;
}

/* --------------------------------------------------------------------------
   Bloco: Ajuda (rever o tutorial guiado)

   Todo produto que ensina na primeira visita precisa de um lugar pra ensinar de
   novo: a primeira visita é justamente aquela em que o pai está com pressa pra
   ver a tela. Fica em Configurações, no fim, porque é onde as pessoas procuram
   ajuda quando ela não está na frente delas.
   -------------------------------------------------------------------------- */
function blocoAjuda(abrirTour) {
  const bloco = el("section", { class: "dash-card cfg-block cfg-block--ajuda" });
  bloco.appendChild(
    blocoHead(
      ICON.bulb,
      "Ajuda",
      "Uma volta guiada pelas telas do painel.",
      "O tutorial troca de seção sozinho e explica cada tela. Dá pra sair no meio a qualquer momento."
    )
  );

  const btn = el("button", {
    class: "dash-btn dash-btn--ghost cfg-tutorial__btn",
    attrs: {
      type: "button",
      "data-dica": "Abre o tutorial guiado desde a primeira parada.",
    },
    children: [
      el("span", { class: "cfg-tutorial__ico", svg: ICON.sparkle, attrs: { "aria-hidden": "true" } }),
      el("span", { text: "Rever o tutorial" }),
    ],
  });
  btn.addEventListener("click", () => {
    if (typeof abrirTour === "function") abrirTour({ rever: true });
  });

  bloco.appendChild(
    el("div", {
      class: "cfg-block__body",
      children: [
        el("div", {
          class: "cfg-tutorial",
          children: [
            el("div", {
              class: "cfg-notif__info",
              children: [
                el("span", { class: "cfg-notif__title", text: "Tutorial guiado" }),
                el("span", {
                  class: "cfg-notif__desc",
                  text: "Dez paradas rápidas, uma por tela. Leva cerca de um minuto.",
                }),
              ],
            }),
            btn,
          ],
        }),
      ],
    })
  );
  return bloco;
}

/* --------------------------------------------------------------------------
   Bloco: Tema
   -------------------------------------------------------------------------- */
function blocoTema() {
  const bloco = el("section", { class: "dash-card cfg-block cfg-block--tema" });
  bloco.appendChild(
    blocoHead(
      ICON.bulb,
      "Aparência",
      "Vale só neste aparelho.",
      "A escolha fica salva neste navegador. Abrir o painel no celular não muda o tema do computador."
    )
  );

  const isDark = () =>
    document.documentElement.getAttribute("data-theme") === "dark";

  const sw = toggle(isDark(), (on) => {
    const theme = on ? "dark" : "light";
    try {
      localStorage.setItem("cognify-theme", theme);
    } catch (e) {}
    document.documentElement.setAttribute("data-theme", theme);
  }, "Alternar tema escuro");

  const row = el("div", {
    class: "cfg-themerow",
    children: [
      el("div", {
        class: "cfg-notif__info",
        children: [
          el("span", { class: "cfg-notif__title", text: "Modo escuro" }),
          el("span", {
            class: "cfg-notif__desc",
            text: "Reduz o brilho e descansa a vista à noite.",
          }),
        ],
      }),
      sw,
    ],
  });

  // Mantém o switch em sincronia se o tema mudar pelo toggle do header.
  const obs = new MutationObserver(() => {
    // O router não avisa quando desmonta uma seção, então o observer se aposenta
    // sozinho ao perceber que o switch saiu do DOM. Sem isso, cada visita a
    // Configurações deixaria mais um observer vivo, segurando o nó antigo.
    if (!sw.isConnected) {
      obs.disconnect();
      return;
    }
    const on = isDark();
    sw.classList.toggle("is-on", on);
    sw.setAttribute("aria-checked", String(on));
  });
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  bloco.appendChild(el("div", { class: "cfg-block__body", children: [row] }));
  return bloco;
}

/* --------------------------------------------------------------------------
   Bloco: Vínculo com o robô (pareamento real — servidor local)
   Mostra "Conectado ao perfil de [nome]", o código de pareamento (pra reparear
   ou compartilhar) e o botão de desvincular (com confirmação). O código e o
   desvincular passam pelo servidor (service_role); o site nunca escreve o vínculo.
   -------------------------------------------------------------------------- */
function blocoVinculo({ crianca, servidorUrl, user, onDesvinculado }) {
  const bloco = el("section", { class: "dash-card cfg-block cfg-block--status" });
  bloco.appendChild(
    blocoHead(
      ICON.robot,
      "Vínculo com a Cogni",
      "Qual perfil do robô este painel está lendo.",
      "O vínculo não expira: fica de pé até você desvincular aqui. Desvincular tira o acesso às conversas desta criança."
    )
  );

  // Foto do robô + badge "Conectado ao perfil de [nome]".
  const foto = el("div", {
    class: "cfg-status__photo",
    children: [
      el("img", {
        attrs: {
          src: "assets/images/dash-robot-inicio.png",
          alt: "Robô Cogni",
          loading: "lazy",
        },
      }),
      el("span", { class: "cfg-status__live", attrs: { "aria-hidden": "true" } }),
    ],
  });

  const info = el("div", {
    class: "cfg-status__info",
    children: [
      el("div", {
        class: "cfg-status-badge is-online",
        children: [
          el("span", { class: "cfg-status-badge__dot", attrs: { "aria-hidden": "true" } }),
          el("span", { text: `Conectado ao perfil de ${crianca.nome}` }),
        ],
      }),
      el("p", {
        class: "cfg-vinculo__hint",
        text: "O vínculo é permanente: só desfaz se você desvincular aqui.",
      }),
    ],
  });

  // Linha do código de pareamento (buscado no servidor; com botão copiar).
  const codigoValor = el("span", {
    class: "cfg-codigo__value",
    text: "······",
  });
  // Ícone "copiar" (dois retângulos sobrepostos) — markup SVG estático.
  const ICON_COPY =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
  const copiarBtn = el("button", {
    class: "cfg-codigo__copy",
    attrs: {
      type: "button",
      "aria-label": "Copiar código de pareamento",
      "data-dica": "Copia o código pra área de transferência.",
      disabled: "true",
    },
    svg: ICON_COPY,
  });

  let codigoAtual = null;
  buscarCodigoPareamento(servidorUrl, crianca.id).then((cod) => {
    if (cod) {
      codigoAtual = cod;
      codigoValor.textContent = cod;
      copiarBtn.removeAttribute("disabled");
    } else {
      codigoValor.textContent = "Indisponível";
      codigoValor.classList.add("is-muted");
    }
  });

  copiarBtn.addEventListener("click", async () => {
    if (!codigoAtual) return;
    try {
      await navigator.clipboard.writeText(codigoAtual);
      if (window.cognifyToast)
        window.cognifyToast.show("Código copiado!", { type: "success" });
    } catch (e) {
      if (window.cognifyToast)
        window.cognifyToast.show("Não consegui copiar. Anote: " + codigoAtual, {
          type: "info",
        });
    }
  });

  const codigoRow = el("div", {
    class: "cfg-codigo",
    children: [
      el("div", {
        class: "cfg-codigo__text",
        children: [
          el("span", {
            class: "cfg-codigo__label",
            children: [
              el("span", { text: "Código de pareamento" }),
              dicaInfo(
                "O mesmo código que liga outro aparelho a este perfil. Ele não muda, e só aparece com o robô ligado.",
                { rotulo: "Código de pareamento" }
              ),
            ],
          }),
          codigoValor,
        ],
      }),
      copiarBtn,
    ],
  });

  // Botão "Desvincular" (com modal de confirmação).
  const desvBtn = el("button", {
    class: "cfg-logout cfg-unlink",
    attrs: { type: "button" },
    children: [
      el("span", {
        class: "cfg-logout__ico",
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 14.5 4 20M14.5 9.5 20 4"/><path d="M7 11 4.5 8.5a3.5 3.5 0 0 1 5-5L12 6M17 13l2.5 2.5a3.5 3.5 0 0 1-5 5L12 18"/></svg>',
      }),
      el("span", { text: "Desvincular este perfil" }),
    ],
  });
  desvBtn.addEventListener("click", () =>
    confirmarDesvincular({ crianca, servidorUrl, user, onDesvinculado })
  );

  bloco.appendChild(
    el("div", {
      class: "cfg-block__body",
      children: [
        el("div", { class: "cfg-status__top", children: [foto, info] }),
        codigoRow,
        desvBtn,
      ],
    })
  );
  return bloco;
}

/** Modal de confirmação do desvincular (tira o acesso às conversas do filho). */
function confirmarDesvincular({ crianca, servidorUrl, user, onDesvinculado }) {
  openModal({
    title: "Desvincular perfil",
    size: "sm",
    content: ({ close }) => {
      const wrap = el("div", { class: "pl-confirm" });
      wrap.appendChild(
        el("p", {
          class: "pl-confirm__text",
          text: `Tem certeza que deseja desvincular o perfil de ${crianca.nome}? Você perderá o acesso às conversas, ao aprendizado e aos planos dele neste painel. Dá pra reconectar depois com o mesmo código.`,
        })
      );
      const feedback = el("p", {
        class: "ob-feedback",
        attrs: { role: "status", "aria-live": "polite" },
      });

      const cancel = el("button", {
        class: "dash-btn dash-btn--ghost",
        attrs: { type: "button" },
        text: "Cancelar",
      });
      cancel.addEventListener("click", close);

      const confirm = el("button", {
        class: "pl-btn pl-btn--danger",
        attrs: { type: "button" },
        children: [
          el("span", {
            class: "pl-btn__ico",
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 14.5 4 20M14.5 9.5 20 4"/><path d="M7 11 4.5 8.5a3.5 3.5 0 0 1 5-5L12 6M17 13l2.5 2.5a3.5 3.5 0 0 1-5 5L12 18"/></svg>',
          }),
          el("span", { text: "Desvincular" }),
        ],
      });
      confirm.addEventListener("click", async () => {
        confirm.disabled = true;
        cancel.disabled = true;
        feedback.textContent = "Desvinculando…";
        feedback.classList.remove("is-error");
        const r = await desvincularCrianca(servidorUrl, crianca.id, user.id);
        if (r.ok) {
          close();
          if (window.cognifyToast)
            window.cognifyToast.show("Perfil desvinculado.", { type: "info" });
          if (typeof onDesvinculado === "function") onDesvinculado();
        } else {
          confirm.disabled = false;
          cancel.disabled = false;
          feedback.textContent = r.erro;
          feedback.classList.add("is-error");
        }
      });

      wrap.appendChild(
        el("div", {
          class: "pl-confirm__actions",
          children: [cancel, confirm],
        })
      );
      wrap.appendChild(feedback);
      return wrap;
    },
  });
}

/* --------------------------------------------------------------------------
   Render principal
   -------------------------------------------------------------------------- */
export async function renderConfig(ctx) {
  const root = sectionRoot("config");

  root.appendChild(
    pageHead({
      title: "Configurações",
      // "Gerencie o perfil, a conta e as preferências" é a frase que vem de fábrica
      // em qualquer painel — não diz nada que os próprios cards não digam melhor.
      // Esta diz a única coisa que o pai precisa saber antes de descer a tela: o que
      // ele muda aqui muda o jeito da Cogni falar com a criança.
      subtitle: "O que você ajusta aqui a Cogni leva pra dentro da conversa.",
    })
  );

  const [crianca, responsavel] = await Promise.all([
    // Leitura FRESCA (fura o cache curto da camada de dados): o robô escreve nos
    // mesmos campos que esta tela edita — o perfil por voz, desde 15/ago/2026 —
    // e o conflito é resolvido por "última escrita vence". Montar o formulário
    // em cima de uma linha velha apaga o que foi ditado sem ninguém perceber.
    ctx.mock.getCrianca({ fresco: true }),
    ctx.mock.getResponsavel(),
  ]);

  // Estado local da criança (atualizado ao salvar o perfil e a cada releitura).
  let criancaAtual = crianca;

  // Host do bloco de perfil (re-renderizado ao salvar).
  // `data-tour`: âncora do tutorial guiado (ver js/dashboard/tour-passos.js). Vai
  // no HOST porque o card de dentro é recriado a cada releitura do perfil.
  const perfilHost = el("div", {
    class: "cfg-perfil-host",
    attrs: { "data-tour": "cfg-perfil" },
  });

  // Com o modal aberto, ninguém repinta o card por baixo dele (ver `revalidar`).
  let modalAberto = false;

  /** Espelha nome/idade no card da sidebar, que é montado no boot do painel. */
  function sincronizarCardSidebar() {
    const nameEl = document.querySelector("[data-dash-child-name]");
    const metaEl = document.querySelector("[data-dash-child-meta]");
    if (nameEl) nameEl.textContent = (criancaAtual && criancaAtual.nome) || "Criança";
    if (metaEl) metaEl.textContent = idadeLabel(criancaAtual && criancaAtual.idade);
  }

  /**
   * Relê o perfil no banco e repinta o que depende dele.
   *
   * Falha de rede mantém o que já estava na tela: perfil velho é melhor do que
   * tela quebrada, e a leitura será refeita no próximo gancho.
   * @returns {Promise<object>} a criança em vigor depois da tentativa
   */
  async function recarregarPerfil() {
    try {
      const nova = await ctx.mock.getCrianca({ fresco: true });
      // `null` aqui é desvínculo feito por fora (outro dispositivo, servidor).
      // Quem trata esse estado é o boot do painel; não é papel desta tela
      // esvaziar o card e deixar o pai sem nada.
      if (nova) {
        criancaAtual = nova;
        renderPerfil();
        renderMemorias();
        sincronizarCardSidebar();
      }
    } catch (e) {
      console.error("[Companion] Não consegui recarregar o perfil:", e);
    }
    return criancaAtual;
  }

  // Enquanto a releitura da abertura não termina, o card não pode disparar de
  // novo (o `is-busy` bloqueia o clique, mas não o Enter num botão já focado).
  let abrindoDetalhe = false;

  async function abrirDetalhe() {
    if (abrindoDetalhe || modalAberto) return;
    abrindoDetalhe = true;
    // Releitura na abertura, e não só no render da seção: entre chegar em
    // Configurações e clicar no card pode ter passado uma conversa inteira com
    // o robô. O que o formulário mostrar é exatamente o que "Salvar perfil"
    // grava — então ele nasce do banco, não de um estado guardado na tela.
    perfilHost.classList.add("is-busy");
    perfilHost.setAttribute("aria-busy", "true");
    try {
      await recarregarPerfil();
    } finally {
      perfilHost.classList.remove("is-busy");
      perfilHost.removeAttribute("aria-busy");
      abrindoDetalhe = false;
    }

    modalAberto = true;
    openModal({
      title: "Detalhes do perfil",
      size: "lg",
      onClose: () => {
        modalAberto = false;
      },
      content: ({ close }) =>
        formularioPerfil(criancaAtual, {
          close,
          onSubmit: async (patch) => {
            criancaAtual = await ctx.mock.atualizarCrianca(patch);
            renderPerfil();
            sincronizarCardSidebar();
            close();
            if (window.cognifyToast)
              window.cognifyToast.show("Perfil salvo!", { type: "success" });
          },
        }),
    });
  }

  function renderPerfil() {
    // O card é substituído inteiro a cada releitura. Se o foco estava nele, vai
    // junto pro novo: sem isso o teclado cai no body no meio da navegação — e o
    // modal, que devolve o foco a quem o abriu, não teria pra onde devolver.
    const tinhaFoco = perfilHost.contains(document.activeElement);
    perfilHost.replaceChildren(blocoPerfil(criancaAtual, abrirDetalhe));
    if (tinhaFoco) {
      const novoCard = perfilHost.querySelector(".cfg-child");
      if (novoCard) novoCard.focus({ preventScroll: true });
    }
  }
  renderPerfil();

  // Host do bloco "O que a Cogni sabe" (repintado a cada releitura do perfil e
  // a cada remoção). A lista é o campo que mais muda sozinho no painel: o robô
  // escreve nele a cada conversa.
  // `tabindex="-1"`: fora da ordem do Tab, mas focável por código — é pra onde o
  // foco vai quando o pai apaga a última memória e o botão que ele usou deixa de
  // existir. Focar o card faz o leitor de tela anunciar o estado vazio.
  const memoriasHost = el("div", {
    class: "cfg-memorias-host",
    attrs: { tabindex: "-1" },
  });

  /**
   * Devolve o teclado pra lista depois de uma remoção. Vai pro botão que assumiu
   * a posição do apagado (ou pro último, se o apagado era o último) — que é onde
   * a mão do usuário já estava. Lista vazia: o próprio card, pro leitor de tela
   * anunciar que não sobrou nada.
   * @param {number} indice — a posição do item removido
   */
  function focarDepoisDeRemover(indice) {
    const botoes = memoriasHost.querySelectorAll(".cfg-mem__del");
    const alvo = botoes.length
      ? botoes[Math.min(indice, botoes.length - 1)]
      : memoriasHost;
    alvo.focus({ preventScroll: true });
  }

  function renderMemorias() {
    // Repintado também pela releitura do perfil (voltar pra aba): se o foco
    // estava aqui dentro, ele volta pra cá em vez de cair no body.
    const tinhaFoco = memoriasHost.contains(document.activeElement);
    memoriasHost.replaceChildren(
      blocoMemorias({
        crianca: criancaAtual,
        onEsquecer: (texto, indice) =>
          confirmarEsquecer({
            texto,
            onConfirmado: async () => {
              criancaAtual = await removerMemoria(ctx, texto);
              renderPerfil();
              renderMemorias();
              sincronizarCardSidebar();
            },
            aoRemover: () => focarDepoisDeRemover(indice),
          }),
      })
    );
    if (tinhaFoco) {
      const alvo = memoriasHost.querySelector(".cfg-mem__del") || memoriasHost;
      alvo.focus({ preventScroll: true });
    }
  }
  renderMemorias();

  /**
   * Terceiro gancho de releitura: voltar pra aba. O caso real é o pai deixar o
   * Companion aberto, ir falar com o robô e voltar — sem isto, a tela seguiria
   * mostrando (e prestes a regravar) o perfil de antes da conversa.
   *
   * O router não avisa quando desmonta uma seção, então o listener se aposenta
   * sozinho ao ver que a raiz saiu do DOM — mesma prática do observer do tema.
   */
  function revalidar() {
    if (!document.contains(root)) {
      document.removeEventListener("visibilitychange", revalidar);
      return;
    }
    if (document.visibilityState !== "visible" || modalAberto) return;
    recarregarPerfil();
  }
  document.addEventListener("visibilitychange", revalidar);

  // Bloco de vínculo com o robô (pareamento real). Só faz sentido com uma
  // criança vinculada — o que sempre ocorre aqui (sem criança, o painel nem
  // monta: cai no onboarding). Ao desvincular, recarrega → volta ao pareamento.
  const blocoRobo = criancaAtual
    ? blocoVinculo({
        crianca: criancaAtual,
        servidorUrl: ctx.servidorUrl,
        user: ctx.user,
        onDesvinculado: () => window.location.reload(),
      })
    : null;

  // Monta o grid de blocos (2 colunas no desktop). Perfil e Vínculo ocupam a
  // largura toda; Conta e Tema dividem a linha do meio.
  const grid = el("div", {
    class: "cfg-grid",
    children: [
      perfilHost,
      // Logo abaixo do perfil, porque é a continuação dele: o formulário é o que
      // o pai contou, e este card é o que ela descobriu sozinha.
      memoriasHost,
      blocoConta(responsavel),
      blocoTema(),
      blocoRobo,
      blocoAjuda(ctx.abrirTour),
    ],
  });
  root.appendChild(grid);

  return root;
}
