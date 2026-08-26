/**
 * servidor.js — Se (e como) esta página alcança o servidor local da Cogni.
 *
 * Existe como módulo próprio (e não dentro do main.js) por uma razão de grafo de
 * imports: a camada de dados (`supabase-data.js`) precisa falar com o servidor, e
 * importar o main.js de lá criaria um ciclo com o módulo que roda o `init()` do
 * painel. Aqui não há dependência nenhuma — dá pra importar de qualquer camada.
 *
 * O que passa por este servidor são features AO VIVO: refrescar o Resumo Semanal
 * e a Dica com IA, e mandar o rosto pro robô enquanto a criança arrasta o slider.
 * Ele roda junto do robô — ex.: no notebook da apresentação — e **costuma estar
 * desligado** na hora em que o pai mexe no painel. Nada aqui trata isso como erro.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ⛔ 26/ago/2026 — A PAREDE QUE APARECEU SOZINHA (leia antes de mexer)
 *
 * Este arquivo apontava fixo pra `http://127.0.0.1:3000`, e isso deixou de
 * funcionar **sem ninguém mudar uma linha**: a partir do Chrome 141/142, uma
 * página servida de origem PÚBLICA (o painel na Vercel) não alcança mais
 * loopback nem rede privada sem uma permissão explícita do usuário — é o
 * *Local Network Access*. Medido em Chrome 149: o `fetch` da Vercel pra
 * `127.0.0.1:3000` **pendura e nunca chega ao servidor**, enquanto o MESMO
 * request feito de uma página em `http://127.0.0.1:3000` responde na hora.
 *
 * Como quase tudo aqui já tinha fallback silencioso (a Dica e o Resumo caem na
 * tabela do Supabase), a parede ficou invisível por meses — até o pareamento,
 * que era a única coisa SEM fallback, quebrar na apresentação do TCC.
 *
 * A resposta não é insistir: é **parar de tentar quando não pode dar certo**.
 * `SERVIDOR_URL` agora nasce vazio em origem pública, e quem depende dele já
 * trata string vazia como "servidor fora de alcance" (o guard estava lá desde
 * sempre em `buscarDica`/`buscarResumoSemanal`). Isso apaga 4s de espera
 * pendurada por card e o lixo de console que ninguém sabia de onde vinha.
 *
 * O que precisa funcionar de qualquer lugar **não passa mais por aqui**: o
 * pareamento virou RPC no Supabase (`parearPorCodigo` em `supabase-data.js`).
 * ────────────────────────────────────────────────────────────────────────────
 */

/** Porta do servidor da Cogni. Trocar aqui se ele subir noutra. */
const PORTA_SERVIDOR = 3000;

/**
 * Loopback em IPv4 explícito, **nunca `localhost`**: o servidor escuta só em
 * IPv4, e navegadores costumam resolver `localhost` para IPv6 (`::1`) primeiro,
 * o que derruba o fetch com ERR_CONNECTION_RESET.
 */
const LOOPBACK = `http://127.0.0.1:${PORTA_SERVIDOR}`;

/** Hosts que são a própria máquina. */
const EH_LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|::1)$/i;

/**
 * Faixas privadas (RFC1918) + `.local` do mDNS. Espelha a lista que o servidor
 * usa pra decidir CORS (`Cogni/server/index.js`) — as duas pontas precisam
 * concordar sobre o que é "dentro de casa".
 */
const EH_REDE_LOCAL =
  /^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|.+\.local)$/i;

/**
 * Decide o endereço do servidor local **a partir de onde esta página foi
 * servida**. Três casos, nesta ordem:
 *
 *   1. `file:` ou loopback → o painel está na mesma máquina do servidor.
 *   2. Host de rede privada → o painel foi servido pelo PRÓPRIO robô (ou por
 *      outro PC da casa): o servidor mora no mesmo host, na porta dele. É o que
 *      faz o painel funcionar quando o pai abre `http://192.168.0.10:3000` do
 *      celular, dentro de casa.
 *   3. Qualquer outra origem (a Vercel) → **vazio**. Não é "desligado": é
 *      inalcançável por construção, e tentar só gera espera e ruído.
 *
 * @returns {string} a base do servidor, ou `""` quando fora de alcance
 */
function resolverBaseServidor() {
  // SSR/teste sem DOM: sem `location` não há como decidir — assume fora de alcance.
  if (typeof location === "undefined") return "";

  const { protocol, hostname } = location;
  if (protocol === "file:") return LOOPBACK;
  if (EH_LOOPBACK.test(hostname)) return LOOPBACK;
  if (EH_REDE_LOCAL.test(hostname)) return `http://${hostname}:${PORTA_SERVIDOR}`;
  return "";
}

/**
 * Base do servidor local da Cogni, **ou string vazia** quando esta página não
 * tem como alcançá-lo (é o caso do painel em produção, na Vercel).
 *
 * Todo consumidor já checa isso: `if (!servidorUrl) return null`. Passar uma
 * string vazia é, de propósito, o mesmo que dizer "não tente".
 */
export const SERVIDOR_URL = resolverBaseServidor();

/**
 * `true` quando o servidor local está ao alcance desta página.
 *
 * Serve pra INTERFACE, não pra lógica de fetch (essa já morre no `!servidorUrl`):
 * é o que permite uma tela dizer "o robô só recebe isto quando você estiver em
 * casa" em vez de mostrar um erro que não é erro de ninguém.
 */
export const SERVIDOR_AO_ALCANCE = SERVIDOR_URL !== "";

/** Teto por request: servidor fora do ar não pode deixar a UI pendurada. */
const TIMEOUT_MS = 4000;

/**
 * Avisa o servidor local que os planos desta criança mudaram, pra ele recarregar
 * os planos vigentes no cache e a Cogni já usar na conversa em andamento.
 *
 *   POST {SERVIDOR_URL}/api/planos/refrescar { criancaId }
 *   → 200 { ok: true, temPlanoAtivo: boolean, titulo: string|null,
 *           total: number,
 *           planos: [{ id, titulo, foco, ordem, tarefas }] }   ⭐ 16/ago/2026
 *   → 400 { erro: "criancaId obrigatorio" } · 503 { ok: false, erro: … }
 *
 * ⭐ `total`/`planos[]` nasceram quando a Cogni passou a seguir VÁRIOS planos (até
 * 5 por criança): com eles dá pra saber que AQUELE plano recém-salvo entrou, e não
 * só que algum entrou. Os campos antigos continuam — nada aqui quebra por causa de
 * um servidor mais velho respondendo sem eles.
 *
 * É o PLANO B do Realtime do Supabase (que o servidor escuta em `planos_estudo`):
 * se a replicação for desabilitada no painel ou o canal cair, este ping mantém a
 * propagação instantânea. Sem ele, o plano que o pai acabou de salvar só chegaria
 * ao robô no boot seguinte. Idempotente — chamar duas vezes não custa nada.
 *
 * BEST-EFFORT de propósito, e por isso não é aguardado nem vira mensagem de tela:
 * o robô costuma estar desligado quando o pai edita, e isso não é falha — o plano
 * já está salvo no Supabase. Assustar o pai com um erro aqui seria mentira.
 *
 * @param {string} criancaId
 * @returns {void} — não devolve promessa de propósito: ninguém deve esperar por isto.
 */
export function pingPlanosAtualizados(criancaId) {
  if (!criancaId) return;
  // Fora de alcance (o painel na Vercel): sem base, o template viraria uma URL
  // relativa e o ping bateria na própria Vercel, virando um 404 por plano salvo.
  // O Realtime do Supabase continua sendo o caminho A, e ele não passa por aqui.
  if (!SERVIDOR_URL) return;
  fetch(`${SERVIDOR_URL}/api/planos/refrescar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ criancaId }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
    .then((r) => (r.ok ? r.json() : null))
    .then(registrarFila)
    .catch(() => {
      // Servidor off, CORS, timeout: todos são o mesmo recado — "o robô não viu
      // ainda", que é um estado normal aqui.
    });
}

/**
 * Loga a fila que o ROBÔ passou a enxergar, em console.
 *
 * ⭐ 16/ago/2026 — a resposta do refresh ganhou `ordem` em cada item, e com ela dá
 * pra **provar** que o arraste do pai chegou ao robô, em vez de a ordem certa poder
 * ser coincidência. É console e não tela de propósito: o robô costuma estar
 * desligado quando o pai mexe no painel, e transformar isso em interface criaria uma
 * mensagem que some sozinha em metade das visitas.
 *
 * Silencioso quando a resposta não tem o formato esperado — um servidor mais antigo
 * responde sem `planos[]`, e isso não é erro de ninguém.
 */
function registrarFila(dados) {
  if (!dados || !Array.isArray(dados.planos) || !dados.planos.length) return;
  const fila = dados.planos
    .map((p, i) => `${i + 1}. ${p.titulo} (ordem ${p.ordem})`)
    .join(" · ");
  console.info("[Companion] A Cogni recarregou os planos. Fila dela agora:", fila);
}
