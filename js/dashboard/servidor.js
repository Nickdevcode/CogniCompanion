/**
 * servidor.js — Endereço do servidor local da Cogni e os pings que o site dá nele.
 *
 * Existe como módulo próprio (e não dentro do main.js) por uma razão de grafo de
 * imports: a camada de dados (`supabase-data.js`) precisa falar com o servidor, e
 * importar o main.js de lá criaria um ciclo com o módulo que roda o `init()` do
 * painel. Aqui não há dependência nenhuma — dá pra importar de qualquer camada.
 *
 * O que passa por este servidor são as features que dependem de IA ou de
 * `service_role` (Resumo Semanal, Dica, Pareamento, Mapa da Aula, rosto do robô) e
 * os avisos ao robô. Ele roda junto do robô — ex.: no notebook da apresentação —
 * e **costuma estar desligado** na hora em que o pai mexe no painel. Nada aqui
 * trata isso como erro.
 */

/**
 * URL do servidor local da Cogni (não-Supabase).
 * Trocar aqui se o servidor subir noutra porta/host.
 *
 * Usamos `127.0.0.1` (não `localhost`) de propósito: o servidor escuta só em
 * IPv4, e navegadores costumam resolver `localhost` para IPv6 (`::1`) primeiro,
 * o que derruba o fetch com ERR_CONNECTION_RESET. Forçar IPv4 evita isso.
 */
export const SERVIDOR_URL = "http://127.0.0.1:3000";

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
