/**
 * format.js — Helpers de formatação e derivação de dados do painel.
 *
 * Concentra a lógica de transformar os dados crus (no formato do contrato,
 * snake_case) em texto/estruturas prontas pra UI: durações, datas, somas
 * por matéria/dia, agrupamento de conversas. Mantém as seções enxutas e
 * garante formatação consistente em todo o dashboard.
 *
 * Tudo aqui é puro (sem efeitos colaterais) e independente do mock — quando
 * o backend ligar, estas funções continuam valendo sobre os dados do Supabase.
 */

/** Lista fixa de matérias do contrato (conversas.materia / planos.foco). */
export const MATERIAS = [
  "portugues",
  "matematica",
  "ciencias",
  "historia",
  "geografia",
  "idiomas",
  "outros",
];

/** Rótulos legíveis (com acento) para cada matéria. */
const MATERIA_LABELS = {
  portugues: "Português",
  matematica: "Matemática",
  ciencias: "Ciências",
  historia: "História",
  geografia: "Geografia",
  idiomas: "Idiomas",
  outros: "Outros",
};

/** Status de plano (planos_estudo.status) → rótulo legível. */
const STATUS_LABELS = {
  ativo: "Ativo",
  em_andamento: "Em andamento",
  pausado: "Pausado",
  concluido: "Concluído",
};

/** Dias da semana (chave curta usada em horario.dias) → rótulo curto. */
const DIA_LABELS = {
  dom: "Dom",
  seg: "Seg",
  ter: "Ter",
  qua: "Qua",
  qui: "Qui",
  sex: "Sex",
  sab: "Sáb",
};

/** @returns {string} rótulo legível da matéria (fallback: a própria chave). */
export function materiaLabel(materia) {
  return MATERIA_LABELS[materia] || materia || "Outros";
}

/** @returns {string} rótulo legível do status do plano. */
export function statusLabel(status) {
  return STATUS_LABELS[status] || status || "—";
}

/**
 * Formata uma lista de dias (ex.: ["seg","qua","sex"]) em "Seg, Qua, Sex".
 * @param {string[]} dias
 * @returns {string}
 */
export function diasLabel(dias) {
  if (!Array.isArray(dias) || !dias.length) return "—";
  return dias.map((d) => DIA_LABELS[d] || d).join(", ");
}

/**
 * Converte uma duração em ms para um rótulo curto e humano.
 *   90000  -> "1 min"
 *   2520000 -> "42 min"
 *   5100000 -> "1h 25min"
 * @param {number} ms
 * @returns {string}
 */
export function formatDuracao(ms) {
  const totalMin = Math.max(0, Math.round((Number(ms) || 0) / 60000));
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

/**
 * Converte minutos (number) para "Xh Ymin" / "Y min".
 * Útil pros gráficos e somatórios já calculados em minutos.
 * @param {number} min
 * @returns {string}
 */
export function formatMinutos(min) {
  return formatDuracao((Number(min) || 0) * 60000);
}

/* --------------------------------------------------------------------------
   Datas — Intl pt-BR, com rótulos relativos "Hoje"/"Ontem"
   -------------------------------------------------------------------------- */

const _timeFmt = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});
const _dayFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
});

/** @returns {Date} parse seguro de um timestamp (string ISO ou Date). */
function toDate(value) {
  return value instanceof Date ? value : new Date(value);
}

/** @returns {string} hora local "HH:MM" de um timestamp. */
export function formatHora(value) {
  return _timeFmt.format(toDate(value));
}

/** Chave de dia "YYYY-MM-DD" em horário local (pra agrupar sem fuso bugado). */
export function dayKey(value) {
  const d = toDate(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Rótulo de um dia, relativo a "agora": "Hoje", "Ontem" ou "27 de maio".
 * @param {string|Date} value
 * @param {Date} [now] — injeta o "agora" (testabilidade)
 * @returns {string}
 */
export function formatDiaRelativo(value, now = new Date()) {
  const key = dayKey(value);
  if (key === dayKey(now)) return "Hoje";
  const ontem = new Date(now);
  ontem.setDate(ontem.getDate() - 1);
  if (key === dayKey(ontem)) return "Ontem";
  const label = _dayFmt.format(toDate(value));
  // capitaliza o mês ("27 de Maio" fica feio em pt-BR; mantemos minúsculo
  // exceto a inicial da frase quando usada como título — quem usa decide)
  return label;
}

/* --------------------------------------------------------------------------
   Derivações sobre conversas
   -------------------------------------------------------------------------- */

/**
 * Agrupa conversas por dia (mais recente primeiro), cada grupo já ordenado
 * por horário decrescente. Retorna um array pronto pra render da timeline.
 * @param {Array<object>} conversas — itens no formato da tabela `conversas`
 * @returns {Array<{ key: string, data: string, label: string, itens: object[] }>}
 */
export function agruparConversasPorDia(conversas, now = new Date()) {
  const grupos = new Map();
  for (const c of conversas || []) {
    const k = dayKey(c.criado_em);
    if (!grupos.has(k)) {
      grupos.set(k, {
        key: k,
        data: c.criado_em,
        label: formatDiaRelativo(c.criado_em, now),
        itens: [],
      });
    }
    grupos.get(k).itens.push(c);
  }
  const lista = Array.from(grupos.values());
  // dias do mais novo pro mais antigo; itens idem
  lista.sort((a, b) => new Date(b.data) - new Date(a.data));
  for (const g of lista) {
    g.itens.sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
  }
  return lista;
}

/**
 * Soma a duração (ms) das conversas por matéria.
 * @returns {Map<string, number>} matéria -> ms acumulado
 */
export function tempoPorMateria(conversas) {
  const acc = new Map();
  for (const c of conversas || []) {
    const m = c.materia || "outros";
    acc.set(m, (acc.get(m) || 0) + (Number(c.duracao_ms) || 0));
  }
  return acc;
}

/**
 * Soma a duração (ms) das conversas por dia (chave YYYY-MM-DD).
 * @returns {Map<string, number>} dia -> ms acumulado
 */
export function tempoPorDia(conversas) {
  const acc = new Map();
  for (const c of conversas || []) {
    const k = dayKey(c.criado_em);
    acc.set(k, (acc.get(k) || 0) + (Number(c.duracao_ms) || 0));
  }
  return acc;
}

/** Soma total da duração (ms) de uma lista de conversas. */
export function tempoTotal(conversas) {
  return (conversas || []).reduce((s, c) => s + (Number(c.duracao_ms) || 0), 0);
}

/* --------------------------------------------------------------------------
   Texto
   -------------------------------------------------------------------------- */

/** Primeiro nome (pra saudações). */
export function primeiroNome(nome) {
  if (!nome || typeof nome !== "string") return "";
  return nome.trim().split(/\s+/)[0];
}

/**
 * Idade em anos a partir do campo `idade` (já numérico no contrato).
 * Mantido como função pra centralizar o rótulo "X anos".
 */
export function idadeLabel(idade) {
  const n = Number(idade);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `${n} ${n === 1 ? "ano" : "anos"}`;
}
