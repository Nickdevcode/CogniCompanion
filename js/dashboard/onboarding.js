/**
 * onboarding.js — Boas-vindas + pareamento por código (Companion, single-child).
 *
 * Disparado pelo main.js quando o pai loga e ainda NÃO tem criança vinculada
 * (`getCrianca()` devolve null). Assume a tela inteira (overlay full-screen) e,
 * ao parear com sucesso, chama `onPareado()` (o main recarrega o painel).
 *
 * Dois modos, decididos pela flag `localStorage[FLAG_VISTO]`:
 *   - 1ª vez (flag ausente): jornada de 3 telas — duas de apresentação com
 *     motion + a terceira de pareamento. Ao concluir, grava a flag.
 *   - Já viu antes / despareou depois (flag presente): vai DIRETO pra tela de
 *     pareamento (sem repetir a apresentação). Combinado com o Nicolas.
 *
 * Pareamento: o código (6 chars, sem ambíguos) é validado e o vínculo é setado
 * SÓ pelo servidor (service_role) — o site nunca escreve `responsavel_id`:
 *   POST {servidorUrl}/api/pareamento/vincular  { codigo, responsavelId }
 *   → 200 {ok, jaPareado, criancaId, nome} · 404 inválido · 409 de outro pai
 *     · 400 faltando · 503 indisponível
 *
 * Acessível: foco gerenciado, Esc não fecha (é um gate), `aria-live` pros erros,
 * inputs do código com rótulos. Motion respeita `prefers-reduced-motion` (CSS).
 */

import { el } from "./sections/_shared.js";
import { ICON } from "./icons.js";

/** Chave que marca que a apresentação completa já foi vista neste navegador. */
const FLAG_VISTO = "cognify-onboarding-visto";

/** Alfabeto do código (igual ao servidor): sem 0/O/1/I pra não confundir. */
const ALFABETO_CODIGO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const TAMANHO_CODIGO = 6;

/** Normaliza um caractere digitado: caixa alta e só aceita do alfabeto válido. */
function normalizarChar(ch) {
  const c = String(ch || "").toUpperCase();
  return ALFABETO_CODIGO.includes(c) ? c : "";
}

/**
 * Inicia o fluxo de onboarding/pareamento.
 * @param {object} cfg
 * @param {object} cfg.user — usuário logado (responsável)
 * @param {string} cfg.nomeResponsavel — primeiro nome (saudação)
 * @param {string} cfg.servidorUrl — base do servidor local da Cogni
 * @param {Function} cfg.onPareado — callback chamado após parear com sucesso
 */
export function iniciarOnboarding({ user, nomeResponsavel, servidorUrl, onPareado }) {
  const jaViu = lerFlagVisto();

  // Overlay raiz que cobre o painel inteiro.
  const overlay = el("div", {
    class: "ob-overlay",
    attrs: { role: "dialog", "aria-modal": "true", "aria-label": "Boas-vindas ao Cogni Companion" },
  });

  // Trilho de slides (uma faixa horizontal; navegação por translateX).
  const track = el("div", { class: "ob-track" });
  const viewport = el("div", { class: "ob-viewport", children: [track] });

  // As telas de apresentação só entram na 1ª vez.
  const telas = [];
  if (!jaViu) {
    telas.push(telaBoasVindas(nomeResponsavel));
    telas.push(telaComoFunciona());
  }
  const pareamento = telaPareamento({ user, servidorUrl, onPareado });
  telas.push(pareamento.node);

  telas.forEach((t) => track.appendChild(t));

  // Indicadores (bolinhas) — só fazem sentido com mais de uma tela.
  const dots = telas.map((_, i) =>
    el("span", { class: "ob-dot" + (i === 0 ? " is-active" : "") })
  );
  const dotsWrap =
    telas.length > 1 ? el("div", { class: "ob-dots", children: dots }) : null;

  // Estado de navegação.
  let idx = 0;
  const total = telas.length;

  function ir(novo) {
    idx = Math.max(0, Math.min(total - 1, novo));
    track.style.transform = `translateX(-${idx * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle("is-active", i === idx));
    // Foca a tela ativa (acessibilidade) sem rolar a página.
    const ativa = telas[idx];
    const alvo = ativa.querySelector(
      "input, button:not([disabled]), [tabindex]"
    );
    if (alvo) window.setTimeout(() => alvo.focus({ preventScroll: true }), 360);
    // Quando chega na tela de pareamento, ativa o foco no 1º campo do código.
    if (telas[idx] === pareamento.node) pareamento.focar();
  }

  // Liga os botões "avançar" das telas de apresentação.
  track.querySelectorAll("[data-ob-next]").forEach((btn) => {
    btn.addEventListener("click", () => ir(idx + 1));
  });
  track.querySelectorAll("[data-ob-back]").forEach((btn) => {
    btn.addEventListener("click", () => ir(idx - 1));
  });

  // Botão "pular apresentação" (vai direto ao pareamento) — só na 1ª vez.
  let skip = null;
  if (!jaViu) {
    skip = el("button", {
      class: "ob-skip",
      attrs: { type: "button" },
      text: "Pular apresentação",
    });
    skip.addEventListener("click", () => ir(total - 1));
  }

  // Quando o pareamento conclui, marca a flag (a apresentação não repete) e
  // delega ao main pra recarregar o painel com a criança vinculada.
  pareamento.aoConcluir(() => {
    gravarFlagVisto();
    if (typeof onPareado === "function") onPareado();
  });

  // Monta o overlay.
  const inner = el("div", { class: "ob-inner" });
  if (skip) inner.appendChild(skip);
  inner.appendChild(viewport);
  if (dotsWrap) inner.appendChild(dotsWrap);
  overlay.appendChild(inner);

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
  // Anima a entrada do overlay (2 frames pra a transição pegar).
  window.requestAnimationFrame(() =>
    window.requestAnimationFrame(() => overlay.classList.add("is-open"))
  );

  // Posiciona na primeira tela e foca.
  ir(0);
}

/* ==========================================================================
   Telas de apresentação
   ========================================================================== */

/** Tela 1 — boas-vindas com o robô e a saudação ao responsável. */
function telaBoasVindas(nome) {
  const saud = nome ? `Olá, ${nome}!` : "Olá!";
  const tela = el("article", { class: "ob-screen ob-screen--hero" });

  const robo = el("div", {
    class: "ob-hero__art",
    children: [
      el("span", { class: "ob-hero__glow", attrs: { "aria-hidden": "true" } }),
      el("img", {
        class: "ob-hero__robot ob-float",
        attrs: {
          src: "assets/images/cogni-fullbody.png",
          alt: "",
          "aria-hidden": "true",
        },
      }),
    ],
  });

  const texto = el("div", {
    class: "ob-screen__body",
    children: [
      el("span", { class: "ob-eyebrow", text: saud }),
      el("h1", {
        class: "ob-title",
        text: "Bem-vindo(a) ao Cogni Companion",
      }),
      el("p", {
        class: "ob-lead",
        text:
          "Aqui você acompanha de pertinho a jornada de aprendizado do seu filho com a Cogni — conversas, progresso e planos de estudo, tudo em um só lugar.",
      }),
      el("button", {
        class: "dash-btn dash-btn--primary ob-cta",
        attrs: { type: "button", "data-ob-next": "" },
        children: [
          el("span", { text: "Vamos começar" }),
          el("span", { class: "ob-cta__ico", svg: CHEVRON }),
        ],
      }),
    ],
  });

  tela.append(robo, texto);
  return tela;
}

/** Tela 2 — o que dá pra fazer (4 recursos com entrada escalonada). */
function telaComoFunciona() {
  const tela = el("article", { class: "ob-screen ob-screen--features" });

  const itens = [
    {
      ico: ICON.chat,
      titulo: "Acompanhe as conversas",
      desc: "Veja o que seu filho conversou com a Cogni, dia a dia.",
    },
    {
      ico: ICON.chart,
      titulo: "Veja o aprendizado",
      desc: "Tempo por matéria, tópicos explorados e a evolução da semana.",
    },
    {
      ico: ICON.calendar,
      titulo: "Crie planos de estudo",
      desc: "Oriente os estudos com planos que a Cogni segue nas conversas.",
    },
    {
      ico: ICON.robot,
      titulo: "Conecte ao robô",
      desc: "Um código vincula o painel ao perfil do seu filho na Cogni.",
    },
  ];

  const lista = el("div", {
    class: "ob-features",
    children: itens.map((it, i) =>
      el("div", {
        class: "ob-feature",
        attrs: { style: `--i:${i}` },
        children: [
          el("span", { class: "ob-feature__ico", svg: it.ico }),
          el("div", {
            class: "ob-feature__txt",
            children: [
              el("h3", { class: "ob-feature__title", text: it.titulo }),
              el("p", { class: "ob-feature__desc", text: it.desc }),
            ],
          }),
        ],
      })
    ),
  });

  const body = el("div", {
    class: "ob-screen__body",
    children: [
      el("h2", { class: "ob-title ob-title--sm", text: "O que você pode fazer aqui" }),
      lista,
      el("div", {
        class: "ob-nav",
        children: [
          el("button", {
            class: "dash-btn dash-btn--ghost",
            attrs: { type: "button", "data-ob-back": "" },
            text: "Voltar",
          }),
          el("button", {
            class: "dash-btn dash-btn--primary ob-cta",
            attrs: { type: "button", "data-ob-next": "" },
            children: [
              el("span", { text: "Conectar agora" }),
              el("span", { class: "ob-cta__ico", svg: CHEVRON }),
            ],
          }),
        ],
      }),
    ],
  });

  tela.appendChild(body);
  return tela;
}

/* ==========================================================================
   Tela de pareamento (a última — ou a única, se já viu a apresentação)
   ========================================================================== */

/**
 * Monta a tela de pareamento por código.
 * @returns {{ node:HTMLElement, focar:Function, aoConcluir:Function }}
 */
function telaPareamento({ user, servidorUrl, onPareado }) {
  const tela = el("article", { class: "ob-screen ob-screen--pair" });
  let concluirCb = null;

  // Cabeçalho com robô compacto.
  const header = el("div", {
    class: "ob-pair__head",
    children: [
      el("img", {
        class: "ob-pair__robot ob-float",
        attrs: {
          src: "assets/images/cogni-head-light.png",
          alt: "",
          "aria-hidden": "true",
        },
      }),
      el("h2", { class: "ob-title ob-title--sm", text: "Conecte ao perfil do seu filho" }),
      el("p", {
        class: "ob-lead",
        text:
          "Digite o código de 6 caracteres que aparece no painel da Cogni (ou peça pra ela falar: “Cogni, qual é o código de pareamento?”).",
      }),
    ],
  });

  // Campos do código (6 caixinhas estilo OTP).
  const inputs = [];
  const boxes = el("div", {
    class: "ob-code",
    attrs: { role: "group", "aria-label": "Código de pareamento de 6 caracteres" },
  });
  for (let i = 0; i < TAMANHO_CODIGO; i++) {
    const inp = el("input", {
      class: "ob-code__box",
      attrs: {
        type: "text",
        inputmode: "text",
        autocapitalize: "characters",
        autocomplete: "off",
        spellcheck: "false",
        maxlength: "1",
        "aria-label": `Caractere ${i + 1} de ${TAMANHO_CODIGO}`,
      },
    });
    inputs.push(inp);
    boxes.appendChild(inp);
  }

  // Mensagem de erro/status (aria-live pra leitor de tela anunciar).
  const feedback = el("p", {
    class: "ob-feedback",
    attrs: { role: "status", "aria-live": "polite" },
  });

  const submitBtn = el("button", {
    class: "dash-btn dash-btn--primary ob-cta ob-pair__submit",
    attrs: { type: "submit" },
    children: [el("span", { text: "Conectar" })],
  });

  const form = el("form", {
    class: "ob-pair__form",
    attrs: { novalidate: "true" },
    children: [boxes, feedback, submitBtn],
  });

  tela.append(header, form);

  /* ---- Comportamento dos inputs do código (digitar, colar, navegar) ---- */
  function valorCodigo() {
    return inputs.map((i) => i.value).join("");
  }
  function limparErro() {
    feedback.textContent = "";
    feedback.classList.remove("is-error", "is-ok");
    boxes.classList.remove("is-error");
  }

  inputs.forEach((inp, i) => {
    inp.addEventListener("input", () => {
      const c = normalizarChar(inp.value);
      inp.value = c;
      limparErro();
      if (c && i < TAMANHO_CODIGO - 1) inputs[i + 1].focus();
    });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !inp.value && i > 0) {
        inputs[i - 1].focus();
        inputs[i - 1].value = "";
        e.preventDefault();
      } else if (e.key === "ArrowLeft" && i > 0) {
        inputs[i - 1].focus();
        e.preventDefault();
      } else if (e.key === "ArrowRight" && i < TAMANHO_CODIGO - 1) {
        inputs[i + 1].focus();
        e.preventDefault();
      }
    });
    // Colar o código inteiro em qualquer caixa distribui pelos campos.
    inp.addEventListener("paste", (e) => {
      e.preventDefault();
      const txt = (e.clipboardData || window.clipboardData).getData("text");
      const chars = String(txt || "")
        .toUpperCase()
        .replace(/[\s-]/g, "")
        .split("")
        .filter((ch) => ALFABETO_CODIGO.includes(ch))
        .slice(0, TAMANHO_CODIGO);
      chars.forEach((ch, k) => {
        if (inputs[k]) inputs[k].value = ch;
      });
      limparErro();
      const next = Math.min(chars.length, TAMANHO_CODIGO - 1);
      inputs[next].focus();
    });
  });

  /* ---- Submit: chama o servidor ---- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const codigo = valorCodigo();
    if (codigo.length !== TAMANHO_CODIGO) {
      mostrarErro("Digite os 6 caracteres do código.");
      const vazio = inputs.find((i) => !i.value) || inputs[0];
      vazio.focus();
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch(`${servidorUrl}/api/pareamento/vincular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, responsavelId: user.id }),
      });

      let dados = {};
      try {
        dados = await resp.json();
      } catch (_) {
        /* resposta sem corpo JSON */
      }

      if (resp.ok && dados.ok) {
        const nomeCrianca = dados.nome ? ` ${dados.nome}` : "";
        mostrarOk(
          dados.jaPareado
            ? `Tudo certo! Você já estava conectado a${nomeCrianca}.`
            : `Conectado a${nomeCrianca}! Levando você ao painel…`
        );
        // Pequena pausa pra a mensagem aparecer antes de recarregar.
        window.setTimeout(() => {
          if (typeof concluirCb === "function") concluirCb();
        }, 700);
        return;
      }

      // Erros mapeados pelo servidor (mensagem já vem amigável em PT-BR).
      mostrarErro(dados.erro || erroPorStatus(resp.status));
      setLoading(false);
      boxes.classList.add("is-error");
      inputs[0].focus();
      inputs.forEach((i) => (i.value = ""));
    } catch (err) {
      // Falha de rede / servidor fora do ar / CORS.
      console.error("[Companion] Pareamento falhou:", err);
      mostrarErro(
        "Não consegui falar com a Cogni. Confirme que o robô/servidor está ligado e tente de novo."
      );
      setLoading(false);
    }
  });

  function mostrarErro(msg) {
    feedback.textContent = msg;
    feedback.classList.add("is-error");
    feedback.classList.remove("is-ok");
  }
  function mostrarOk(msg) {
    feedback.textContent = msg;
    feedback.classList.add("is-ok");
    feedback.classList.remove("is-error");
  }
  function setLoading(on) {
    submitBtn.disabled = on;
    submitBtn.classList.toggle("is-loading", on);
    submitBtn.setAttribute("aria-busy", String(on));
    inputs.forEach((i) => (i.disabled = on));
  }

  return {
    node: tela,
    focar: () => inputs[0] && inputs[0].focus({ preventScroll: true }),
    aoConcluir: (cb) => {
      concluirCb = cb;
    },
  };
}

/* ==========================================================================
   Helpers
   ========================================================================== */

/** Chevron de avanço (fallback se o ICON.arrowRight não existir). */
const CHEVRON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

/** Mensagem genérica por status HTTP, caso o servidor não mande o corpo. */
function erroPorStatus(status) {
  if (status === 404) return "Código inválido. Confira os 6 caracteres.";
  if (status === 409) return "Essa criança já está vinculada a outro responsável.";
  if (status === 400) return "Confira o código e tente de novo.";
  if (status === 503) return "Pareamento indisponível no momento. Tente mais tarde.";
  return "Não foi possível parear agora. Tente de novo.";
}

function lerFlagVisto() {
  try {
    return localStorage.getItem(FLAG_VISTO) === "1";
  } catch (e) {
    return false;
  }
}
function gravarFlagVisto() {
  try {
    localStorage.setItem(FLAG_VISTO, "1");
  } catch (e) {
    /* localStorage indisponível: o onboarding aparece de novo, sem quebrar */
  }
}
