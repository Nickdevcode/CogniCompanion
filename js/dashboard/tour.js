/**
 * tour.js — O tutorial guiado do painel (motor).
 *
 * Leva o responsável por dentro do app de verdade: troca de seção, rola até o
 * elemento, recorta um foco em volta dele e explica num balão. Não é um vídeo
 * nem um carrossel de prints — a tela que ele está vendo é a tela dele.
 *
 * O ROTEIRO (o que cada passo diz e onde ancora) mora em `tour-passos.js`. Aqui
 * fica só a máquina: navegar, esperar, medir, posicionar, prender o foco.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DECISÕES QUE NÃO SÃO ÓBVIAS
 *
 * • **Alvo que não aparece não trava o tour.** As seções renderizam async e um
 *   pai recém-pareado tem ZERO conversas e ZERO planos — metade dos alvos
 *   "interessantes" simplesmente não existe na primeira visita. Por isso todo
 *   passo tem `esperarElemento` com teto de tempo e cai pra um balão CENTRADO
 *   quando o alvo não vem. Ancorar em cabeçalho de seção (que existe sempre) em
 *   vez de em card de dado é a outra metade da defesa.
 *
 * • **A rolagem NÃO é travada.** O véu cobre a tela e bloqueia clique, mas
 *   deixar a página rolar é o que permite ao pai conferir o que está em volta do
 *   destaque. Em troca, foco e balão se reposicionam a cada rolagem/resize
 *   (rAF), senão o recorte descolaria do elemento.
 *
 * • **No celular o balão é FOLHA (bottom sheet).** Balão flutuante em 360px de
 *   largura ou cobre o alvo ou fica com 6 palavras por linha. A folha sobe de
 *   onde o polegar está, e a rolagem coloca o alvo na metade de cima da tela —
 *   e não no centro, que ficaria debaixo dela.
 *
 * • **A sidebar não existe no celular.** Ela mora fora da tela (translateX). Por
 *   isso todo passo pode declarar `alvoMobile` — o passo da navegação aponta pra
 *   tab bar de baixo, que é onde a mesma informação está.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { fecharDica } from "./tooltip.js";

/** Prefixo da flag de "já viu o tutorial". O sufixo é o id do responsável. */
const FLAG_TOUR = "cognify-tour-visto";
/** Marca deixada pelo pareamento pra o tour abrir no reload seguinte. */
const FLAG_PENDENTE = "cognify-tour-pendente";

/** Teto de espera por um alvo que ainda não renderizou (ms). */
const TIMEOUT_ALVO = 3200;
/** Respiro depois de mandar rolar, pra a medição não pegar a página em curso. */
const ESPERA_ROLAGEM = 420;
/** Folga entre o recorte e o elemento destacado (px). */
const PADDING_FOCO = 8;
/** Largura a partir da qual o balão flutua; abaixo dela ele vira folha. */
const LARGURA_FOLHA = 700;

/**
 * Os três layouts do balão, e por que são três e não dois:
 *
 *   flutuante  desktop. Ancora no alvo, com setinha.
 *   folha      celular em pé. Largura inteira, colada embaixo.
 *   lateral    celular DEITADO. Uma folha aqui come 240px dos 390px de altura e
 *              tapa exatamente o que ela está explicando; encostada na direita,
 *              sobra a tela inteira em cima do alvo.
 */
const MQ_FOLHA = `(max-width: ${LARGURA_FOLHA}px) and (min-height: 561px)`;
const MQ_LATERAL = "(max-width: 950px) and (max-height: 560px)";

/**
 * A largura em que a sidebar sai da tela e a navegacao passa pra tab bar.
 *
 * ⚠️ Tem que ser a MESMA de `dashboard.css` (`@media (max-width: 900px)`), e é
 * por isso que ela não é o breakpoint do balão: entre 701px e 900px o balão
 * ainda flutua, mas a sidebar já mora fora da tela. Usar o breakpoint do balão
 * aqui destacaria um `translateX(-105%)`, ou seja, nada.
 */
const MQ_SEM_SIDEBAR = "(max-width: 900px)";

/* ==========================================================================
   Persistência
   ========================================================================== */

/**
 * A chave é por USUÁRIO, não por navegador: dois responsáveis no mesmo
 * computador (ou o mesmo pai testando outra conta) merecem cada um o seu
 * primeiro acesso. Sem o id, cai numa chave genérica — melhor que quebrar.
 */
function chave(userId) {
  return FLAG_TOUR + (userId ? ":" + userId : "");
}

/** @returns {boolean} se este responsável já passou pelo tutorial. */
export function tourJaVisto(userId) {
  try {
    return localStorage.getItem(chave(userId)) === "1";
  } catch (e) {
    // localStorage bloqueado (aba anônima com cookies de terceiros travados):
    // dizer "já viu" evita o tutorial abrir em TODA visita, que é o pior dos dois.
    return true;
  }
}

/** Marca o tutorial como visto (concluído ou pulado — pro pai dá no mesmo). */
export function marcarTourVisto(userId) {
  try {
    localStorage.setItem(chave(userId), "1");
    localStorage.removeItem(FLAG_PENDENTE);
  } catch (e) {
    /* sem localStorage o tutorial reaparece; não é motivo pra quebrar a tela */
  }
}

/** Esquece que viu — é o "Rever o tutorial" das Configurações. */
export function esquecerTour(userId) {
  try {
    localStorage.removeItem(chave(userId));
  } catch (e) {
    /* idem */
  }
}

/**
 * O pareamento termina com `location.reload()`, então o tour não pode começar
 * ali: ele morreria com a página. O onboarding deixa esta marca e o boot
 * seguinte a consome.
 */
export function marcarTourPendente() {
  try {
    localStorage.setItem(FLAG_PENDENTE, "1");
  } catch (e) {
    /* sem a marca o tour ainda abre pela regra do "nunca viu" */
  }
}

/** Lê e limpa a marca de pendente (consumo único). */
export function consumirTourPendente() {
  try {
    const tinha = localStorage.getItem(FLAG_PENDENTE) === "1";
    if (tinha) localStorage.removeItem(FLAG_PENDENTE);
    return tinha;
  } catch (e) {
    return false;
  }
}

/* ==========================================================================
   Esperas (o painel é assíncrono)
   ========================================================================== */

/** Promessa que resolve depois de `ms`. */
const esperar = (ms) => new Promise((r) => window.setTimeout(r, ms));

/** Dois frames — o suficiente pra layout e transição de entrada assentarem. */
const doisFrames = () =>
  new Promise((r) =>
    window.requestAnimationFrame(() => window.requestAnimationFrame(r))
  );

/**
 * Espera um elemento aparecer no documento.
 *
 * Combina `MutationObserver` (acorda no instante em que o nó entra) com um teto
 * de tempo (o alvo pode simplesmente não existir nesta conta). Nunca rejeita:
 * devolve `null` no estouro, e o passo vira balão centrado.
 *
 * @param {string} seletor
 * @param {number} [teto]
 * @returns {Promise<HTMLElement|null>}
 */
export function esperarElemento(seletor, teto = TIMEOUT_ALVO) {
  const achado = document.querySelector(seletor);
  if (achado) return Promise.resolve(achado);

  return new Promise((resolve) => {
    let pronto = false;
    const terminar = (node) => {
      if (pronto) return;
      pronto = true;
      obs.disconnect();
      window.clearTimeout(timer);
      resolve(node);
    };
    const obs = new MutationObserver(() => {
      const n = document.querySelector(seletor);
      if (n) terminar(n);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    const timer = window.setTimeout(() => terminar(null), teto);
  });
}

/**
 * Rola a janela pra deixar o alvo visível ACIMA do balão.
 *
 * Não usa `scrollIntoView({block:'center'})` porque "centro" é o lugar errado
 * nas duas pontas: no celular o centro fica debaixo da folha, e no desktop um
 * card alto centralizado tem o topo fora da tela. Aqui a conta é explícita.
 *
 * @param {HTMLElement} alvo
 * @param {string} layout — "flutuante" | "folha" | "lateral"
 */
function rolarAte(alvo, layout) {
  const r = alvo.getBoundingClientRect();
  const vh = window.innerHeight;
  const ehFolha = layout === "folha";

  // Alvo mais alto que a tela (o bento do Início, a Mesa inteira): centralizar
  // deixaria o topo dele fora da janela, e o pai começaria a ler pelo meio.
  // Nesses casos, encostamos o TOPO do alvo perto do topo da tela.
  const maiorQueATela = r.height > vh * 0.8;
  const alvoY = maiorQueATela ? vh * 0.12 : ehFolha ? vh * 0.3 : vh * 0.45;
  const centroDoAlvo = maiorQueATela ? 0 : r.height / 2;
  const destino = window.scrollY + r.top - alvoY + centroDoAlvo;

  // Elemento que já está confortavelmente na tela não precisa de rolagem —
  // sacudir a página a cada passo cansa e desorienta.
  const folga = ehFolha ? vh * 0.42 : vh * 0.85;
  if (!maiorQueATela && r.top >= 12 && r.bottom <= folga) return false;
  if (maiorQueATela && r.top >= 0 && r.top <= vh * 0.2) return false;

  const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({
    top: Math.max(0, destino),
    behavior: suave ? "smooth" : "auto",
  });
  return suave;
}

/* ==========================================================================
   Motor
   ========================================================================== */

/**
 * Abre o tutorial guiado.
 *
 * @param {object} cfg
 * @param {Array<object>} cfg.passos — o roteiro (ver `tour-passos.js`)
 * @param {Function} [cfg.aoTerminar] — chamado ao concluir OU pular (recebe
 *   `{ concluiu: boolean }`), pra quem chamou gravar a flag e voltar ao início
 * @returns {{ fechar: Function }}
 */
export function iniciarTour({ passos, aoTerminar }) {
  if (!Array.isArray(passos) || !passos.length) return { fechar: () => {} };

  // Uma dica aberta ficaria por cima do véu, órfã do elemento que a explicava.
  fecharDica();

  let indice = 0;
  let alvoAtual = null;
  let layout = layoutAtual();
  let vivo = true;
  let rafPendente = 0;
  const focoAnterior = document.activeElement;

  /* ---- Estrutura ------------------------------------------------------- */

  const veu = document.createElement("div");
  veu.className = "tour-veu";

  const foco = document.createElement("div");
  foco.className = "tour-foco";
  foco.setAttribute("aria-hidden", "true");

  const balao = document.createElement("div");
  balao.className = "tour-balao";
  balao.setAttribute("role", "dialog");
  balao.setAttribute("aria-modal", "true");
  balao.setAttribute("aria-labelledby", "tour-titulo");
  balao.setAttribute("aria-describedby", "tour-texto");
  balao.tabIndex = -1;

  const seta = document.createElement("span");
  seta.className = "tour-balao__seta";
  seta.setAttribute("aria-hidden", "true");

  const passoLabel = document.createElement("span");
  passoLabel.className = "tour-balao__passo";

  const btnFechar = document.createElement("button");
  btnFechar.type = "button";
  btnFechar.className = "tour-balao__fechar";
  btnFechar.setAttribute("aria-label", "Fechar o tutorial");
  btnFechar.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M6 6l12 12M18 6 6 18"/></svg>';

  const topo = document.createElement("div");
  topo.className = "tour-balao__topo";
  topo.append(passoLabel, btnFechar);

  const titulo = document.createElement("h2");
  titulo.className = "tour-balao__titulo";
  titulo.id = "tour-titulo";

  const corpo = document.createElement("div");
  corpo.className = "tour-balao__texto";
  corpo.id = "tour-texto";

  // Trilho de progresso: barra fina + rótulo "3 de 10". Saber quanto falta é o
  // que decide entre terminar e abandonar no meio.
  const trilho = document.createElement("div");
  trilho.className = "tour-progresso";
  const trilhoBarra = document.createElement("span");
  trilhoBarra.className = "tour-progresso__barra";
  trilho.appendChild(trilhoBarra);

  const btnPular = document.createElement("button");
  btnPular.type = "button";
  btnPular.className = "tour-btn tour-btn--pular";
  btnPular.textContent = "Pular tutorial";

  const btnVoltar = document.createElement("button");
  btnVoltar.type = "button";
  btnVoltar.className = "tour-btn tour-btn--ghost";
  btnVoltar.textContent = "Voltar";

  const btnProximo = document.createElement("button");
  btnProximo.type = "button";
  btnProximo.className = "tour-btn tour-btn--primary";

  const acoes = document.createElement("div");
  acoes.className = "tour-balao__acoes";
  const acoesDir = document.createElement("div");
  acoesDir.className = "tour-balao__acoes-dir";
  acoesDir.append(btnVoltar, btnProximo);
  acoes.append(btnPular, acoesDir);

  balao.append(seta, topo, titulo, corpo, trilho, acoes);

  // Anúncio pro leitor de tela: o balão é um diálogo que muda de conteúdo sem
  // fechar, e sem isto a troca de passo passaria em silêncio.
  const anuncio = document.createElement("p");
  anuncio.className = "sr-only";
  anuncio.setAttribute("role", "status");
  anuncio.setAttribute("aria-live", "polite");

  const raiz = document.createElement("div");
  raiz.className = "tour-raiz";
  raiz.append(veu, foco, balao, anuncio);
  document.body.appendChild(raiz);
  document.body.classList.add("tour-ativo");

  /* ---- Eventos --------------------------------------------------------- */

  btnProximo.addEventListener("click", () => {
    if (indice >= passos.length - 1) terminar(true);
    else ir(indice + 1);
  });
  btnVoltar.addEventListener("click", () => ir(indice - 1));
  btnPular.addEventListener("click", () => terminar(false));
  btnFechar.addEventListener("click", () => terminar(false));
  // Clicar no véu não fecha de propósito: o tutorial tem 10 passos e um toque
  // torto no celular jogaria fora tudo que já foi lido. Sair é decisão, não
  // acidente — e há dois botões explícitos pra isso.

  function onTecla(e) {
    if (!vivo) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      terminar(false);
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      if (indice < passos.length - 1) ir(indice + 1);
      else terminar(true);
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (indice > 0) ir(indice - 1);
      return;
    }
    if (e.key === "Tab") prenderFoco(e);
  }

  /** Mantém o Tab dentro do balão — atrás do véu não há nada clicável. */
  function prenderFoco(e) {
    const focaveis = Array.from(
      balao.querySelectorAll("button:not([disabled])")
    ).filter((n) => n.offsetParent !== null);
    if (!focaveis.length) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  }

  document.addEventListener("keydown", onTecla, true);

  function agendarReposicionar() {
    if (rafPendente) return;
    rafPendente = window.requestAnimationFrame(() => {
      rafPendente = 0;
      posicionar();
    });
  }
  window.addEventListener("scroll", agendarReposicionar, { passive: true, capture: true });
  window.addEventListener("resize", onResize, { passive: true });

  function onResize() {
    const antes = layout;
    layout = layoutAtual();
    // Girar o celular troca o layout do balão: reancorar de verdade (o alvo do
    // desktop e o do celular podem ser elementos diferentes).
    if (antes !== layout) ir(indice);
    else agendarReposicionar();
  }

  /* ---- Navegação entre passos ------------------------------------------ */

  /** Rota que o hash está mostrando agora. */
  function rotaAtual() {
    return (window.location.hash || "")
      .replace(/^#\/?/, "")
      .split("/")[0]
      .toLowerCase();
  }

  /**
   * Pinta o passo `i`: navega se preciso, espera o alvo, rola e posiciona.
   * @param {number} i
   */
  async function ir(i) {
    if (!vivo) return;
    indice = Math.max(0, Math.min(passos.length - 1, i));
    const passo = passos[indice];

    pintarTexto(passo);
    raiz.classList.add("is-carregando");

    // 1) Seção certa. O router é por hash: mudar o hash já dispara o render.
    if (passo.rota && rotaAtual() !== passo.rota) {
      window.location.hash = "#/" + passo.rota;
      // O outlet troca de filho quando a seção monta; o alvo abaixo é quem
      // confirma. Um respiro curto evita medir o spinner.
      await esperar(60);
    }

    // 2) Alvo (pode não existir — conta nova, seção vazia, servidor off).
    const compacto = window.matchMedia(MQ_SEM_SIDEBAR).matches;
    const seletor = (compacto && passo.alvoMobile) || passo.alvo;
    alvoAtual = seletor ? await esperarElemento(seletor) : null;
    if (!vivo) return;

    // 3) Rolagem até ele.
    if (alvoAtual) {
      const rolou = rolarAte(alvoAtual, layout);
      if (rolou) await esperar(ESPERA_ROLAGEM);
    } else if (!seletor) {
      // Passo de abertura/fecho: começa do topo, pra a tela por trás do véu ser
      // a mesma que o texto está descrevendo.
      window.scrollTo({ top: 0, behavior: "auto" });
    }
    if (!vivo) return;

    await doisFrames();
    if (!vivo) return;

    raiz.classList.remove("is-carregando");
    raiz.classList.add("is-open");
    posicionar();

    // Foco no balão (não no botão): o leitor de tela lê título + texto antes das
    // ações, que é a ordem em que a informação importa.
    balao.focus({ preventScroll: true });
    anuncio.textContent = `Passo ${indice + 1} de ${passos.length}. ${passo.titulo}`;
  }

  /** Escreve título, texto, progresso e rótulos dos botões. */
  function pintarTexto(passo) {
    titulo.textContent = passo.titulo;

    corpo.replaceChildren();
    // Alguns passos falam de coisas que só existem num dos layouts (a sidebar
    // não existe no celular, a tab bar não existe no desktop). Quando o roteiro
    // traz `textoMobile`, ele substitui o texto inteiro na folha.
    const bruto =
      (window.matchMedia(MQ_SEM_SIDEBAR).matches && passo.textoMobile) || passo.texto;
    const paragrafos = Array.isArray(bruto) ? bruto : [bruto];
    paragrafos.forEach((t) => {
      const p = document.createElement("p");
      p.textContent = t;
      corpo.appendChild(p);
    });

    const ultimo = indice === passos.length - 1;
    passoLabel.textContent = `${indice + 1} de ${passos.length}`;
    trilhoBarra.style.transform = `scaleX(${(indice + 1) / passos.length})`;
    btnProximo.textContent = ultimo ? "Concluir" : "Próximo";
    btnVoltar.hidden = indice === 0;
    // No último passo "pular" não faz sentido — já acabou.
    btnPular.hidden = ultimo;
  }

  /* ---- Geometria -------------------------------------------------------- */

  function posicionar() {
    if (!vivo) return;

    // Alvo que saiu do DOM (repintura da seção por trás) vira passo centrado, em
    // vez de um recorte apontando pro vazio.
    if (alvoAtual && !alvoAtual.isConnected) alvoAtual = null;

    if (!alvoAtual) {
      centrar();
      return;
    }

    raiz.classList.remove("is-centrado", "is-balao-centrado");
    const bruto = alvoAtual.getBoundingClientRect();

    // Alvo que rolou pra fora da tela: some com o recorte e centraliza o balão,
    // senão o buraco ficaria numa borda apontando pra nada.
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    // Fora da tela em qualquer direção vira balão centrado. O caso horizontal não
    // é hipotético: a sidebar do celular fica em `translateX(-105%)`, então um
    // passo que a mirasse desenharia o recorte a 300px à esquerda do zero.
    if (bruto.bottom < 0 || bruto.top > vh || bruto.right < 0 || bruto.left > vw) {
      centrar();
      return;
    }

    // No modo lateral o painel ocupa a faixa direita: o recorte precisa parar
    // onde ele começa, senão o anel de destaque some por baixo do texto.
    const vwUtil =
      layout === "lateral" ? Math.max(120, vw - balao.getBoundingClientRect().width) : vw;

    // O recorte segue a parte VISÍVEL do alvo. Sem isto, um card mais alto que a
    // janela (o bento do Início, o quadro da Mesa) produz um buraco que vaza pelas
    // duas bordas e não destaca nada: o véu some da tela inteira.
    const r = recorteVisivel(bruto, vwUtil, vh);

    const raio = passos[indice].raio != null ? passos[indice].raio : 16;
    foco.style.opacity = "1";
    foco.style.left = Math.round(r.left - PADDING_FOCO) + "px";
    foco.style.top = Math.round(r.top - PADDING_FOCO) + "px";
    foco.style.width = Math.round(r.width + PADDING_FOCO * 2) + "px";
    foco.style.height = Math.round(r.height + PADDING_FOCO * 2) + "px";
    foco.style.borderRadius = raio + PADDING_FOCO + "px";

    if (layout === "lateral") {
      // Painel fixo pelo CSS: nada a calcular, só limpar o que os outros modos
      // possam ter deixado em `style`.
      balao.removeAttribute("data-lado");
      balao.style.left = "";
      balao.style.top = "";
      balao.style.bottom = "";
      return;
    }
    if (layout === "folha") {
      posicionarFolha(r);
      return;
    }

    // Alvo que toma quase a janela inteira: não sobra lado nenhum pro balão sem
    // ele cobrir justamente o que está sendo destacado. Aí o balão vai pro
    // centro (o destaque continua aceso) em vez de encostar torto numa borda.
    const fracao = (r.width * r.height) / (vwUtil * vh);
    if (fracao > 0.62) {
      raiz.classList.add("is-balao-centrado");
      balao.removeAttribute("data-lado");
      balao.style.bottom = "";
      return;
    }

    posicionarBalaoFlutuante(r);
  }

  /** Balão no centro, sem recorte: passo de abertura/fecho ou alvo ausente. */
  function centrar() {
    raiz.classList.add("is-centrado");
    raiz.classList.remove("is-balao-centrado");
    foco.style.opacity = "0";
    balao.removeAttribute("data-lado");
    balao.style.left = "";
    balao.style.top = "";
    balao.style.bottom = "";
  }

  /**
   * Folha (celular): largura inteira, colada embaixo. A única conta é o caso do
   * alvo PRESO NO RODAPÉ.
   *
   * A tab bar é `position: fixed` no pé da tela: rolar não a tira de baixo da
   * folha, e o passo da navegação apontaria pra um recorte invisível. Quando há
   * sobreposição, a folha sobe até ficar logo acima do alvo.
   */
  function posicionarFolha(r) {
    balao.style.left = "";
    balao.style.top = "";
    balao.removeAttribute("data-lado");

    const alturaFolha = balao.getBoundingClientRect().height;
    const vh = window.innerHeight;
    const topoDaFolha = vh - alturaFolha;
    const sobrepoe = r.bottom > topoDaFolha && r.top < vh;

    // Sobe, mas nunca a ponto de a folha sair pelo topo: numa tela baixa é
    // melhor cobrir parte do alvo do que esconder os botões do tutorial.
    if (sobrepoe) {
      const desejado = Math.round(vh - r.top + 12);
      balao.style.bottom = Math.min(desejado, Math.max(0, vh - alturaFolha - 8)) + "px";
    } else {
      balao.style.bottom = "";
    }
  }

  /** Balão flutuante (desktop): abaixo do alvo, virando pra cima se não couber. */
  function posicionarBalaoFlutuante(r) {
    balao.style.bottom = "";
    const b = balao.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const gap = PADDING_FOCO + 14;
    const margem = 12;

    /**
     * Cabe de cada lado? A conta é sempre a mesma: espaço livre daquele lado
     * versus o tamanho do balão, com folga.
     */
    const cabe = {
      bottom: r.bottom + gap + b.height <= vh - margem,
      top: r.top - gap - b.height >= margem,
      right: r.right + gap + b.width <= vw - margem,
      left: r.left - gap - b.width >= margem,
    };
    const preferida = passos[indice].posicao || "bottom";
    // Lista ordenada, e não uma corrente de `if`: com a corrente, um alvo colado
    // no rodapé (a tab bar) que pedia "right" caía direto em "bottom" sem nunca
    // testar "top" — e o balão saía por baixo da barra que ele explicava.
    const ordem = [preferida, "bottom", "top", "right", "left"];
    const lado = ordem.find((l) => cabe[l]);

    // Nenhum lado cabe: alvo grande demais pra tela. Encostar o balão numa borda
    // aqui só produz sobreposição torta; centralizado ele fica legível e o anel
    // dourado continua dizendo do que se trata.
    if (!lado) {
      raiz.classList.add("is-balao-centrado");
      balao.removeAttribute("data-lado");
      return;
    }
    raiz.classList.remove("is-balao-centrado");

    let x;
    let y;
    if (lado === "bottom" || lado === "top") {
      x = r.left + r.width / 2 - b.width / 2;
      y = lado === "bottom" ? r.bottom + gap : r.top - gap - b.height;
    } else {
      x = lado === "right" ? r.right + gap : r.left - gap - b.width;
      y = r.top + r.height / 2 - b.height / 2;
    }

    const xc = Math.min(Math.max(x, margem), Math.max(margem, vw - b.width - margem));
    const yc = Math.min(Math.max(y, margem), Math.max(margem, vh - b.height - margem));

    balao.style.left = Math.round(xc) + "px";
    balao.style.top = Math.round(yc) + "px";
    balao.setAttribute("data-lado", lado);

    // Seta grudada no centro do ALVO (o balão pode ter batido na borda da tela).
    if (lado === "bottom" || lado === "top") {
      const cx = r.left + r.width / 2 - xc;
      seta.style.left = Math.round(Math.min(Math.max(cx, 20), Math.max(20, b.width - 20))) + "px";
      seta.style.top = "";
    } else {
      const cy = r.top + r.height / 2 - yc;
      seta.style.top = Math.round(Math.min(Math.max(cy, 20), Math.max(20, b.height - 20))) + "px";
      seta.style.left = "";
    }
  }

  /* ---- Saída ------------------------------------------------------------ */

  function terminar(concluiu) {
    if (!vivo) return;
    vivo = false;

    document.removeEventListener("keydown", onTecla, true);
    window.removeEventListener("scroll", agendarReposicionar, { capture: true });
    window.removeEventListener("resize", onResize);
    if (rafPendente) window.cancelAnimationFrame(rafPendente);

    raiz.classList.remove("is-open");
    document.body.classList.remove("tour-ativo");
    window.setTimeout(() => raiz.remove(), 260);

    // Devolve o foco pra onde ele estava antes do tutorial abrir.
    if (focoAnterior && typeof focoAnterior.focus === "function") {
      focoAnterior.focus({ preventScroll: true });
    }

    if (typeof aoTerminar === "function") aoTerminar({ concluiu });
  }

  /* ---- Arranque --------------------------------------------------------- */

  window.requestAnimationFrame(() => raiz.classList.add("is-open"));
  ir(0);

  return { fechar: () => terminar(false) };
}

/**
 * Recorta um retângulo ao que cabe na janela, com margem.
 *
 * @param {DOMRect} r
 * @param {number} vw
 * @param {number} vh
 * @returns {{left:number, top:number, right:number, bottom:number, width:number, height:number}}
 */
function recorteVisivel(r, vw, vh) {
  const m = PADDING_FOCO + 4;
  const left = Math.max(r.left, m);
  const top = Math.max(r.top, m);
  const right = Math.min(r.right, vw - m);
  const bottom = Math.min(r.bottom, vh - m);
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/**
 * Qual dos três layouts vale agora. Os media queries são os MESMOS do CSS: um
 * desencontro aqui produziria um balão com as regras de um layout e a geometria
 * calculada pela do outro.
 * @returns {"flutuante"|"folha"|"lateral"}
 */
function layoutAtual() {
  if (window.matchMedia(MQ_LATERAL).matches) return "lateral";
  if (window.matchMedia(MQ_FOLHA).matches) return "folha";
  return "flutuante";
}
