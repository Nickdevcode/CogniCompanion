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

/**
 * Lista fixa de matérias do contrato (conversas.materia / planos.foco).
 *
 * Eram 7 (lista do ensino fundamental) e viraram 14 em ago/2026: um único
 * `ciencias` escondia física, química e biologia, e filosofia/sociologia/artes/
 * educação física caíam em `outros` junto do papo furado — pro aluno do médio
 * isso apagava a informação inteira.
 *
 * ⚠️ Quem decide a granularidade é o SERVIDOR, não o site: no fundamental ele
 * grava `ciencias`, no médio grava `fisica`/`quimica`/`biologia`. O valor que
 * chega em `conversas.materia` já vem ajustado pela série. Aqui só precisamos
 * CONHECER os 14 valores — replicar a regra criaria uma segunda cópia que
 * divergiria em silêncio.
 */
export const MATERIAS = [
  "portugues",
  "matematica",
  "ciencias",
  "fisica",
  "quimica",
  "biologia",
  "historia",
  "geografia",
  "filosofia",
  "sociologia",
  "idiomas",
  "artes",
  "educacao_fisica",
  "outros",
];

/** Rótulos legíveis (com acento) para cada matéria. */
const MATERIA_LABELS = {
  portugues: "Português",
  matematica: "Matemática",
  ciencias: "Ciências",
  fisica: "Física",
  quimica: "Química",
  biologia: "Biologia",
  historia: "História",
  geografia: "Geografia",
  filosofia: "Filosofia",
  sociologia: "Sociologia",
  idiomas: "Idiomas",
  artes: "Artes",
  educacao_fisica: "Educação Física",
  outros: "Outros",
};

/**
 * Grupos por área do conhecimento — APRESENTAÇÃO, e só isso.
 *
 * Serve pra 14 opções numa lista não virarem uma parede de texto (filtro do
 * Diário, selects de Planos e Ajustes). O dado nunca é agrupado: `conversas.materia`
 * continua guardando a matéria fina, o filtro continua filtrando por ela, e
 * nenhuma soma do painel passa por aqui.
 */
const MATERIA_GRUPOS = [
  { label: "Linguagens", materias: ["portugues", "idiomas", "artes"] },
  { label: "Matemática", materias: ["matematica"] },
  { label: "Ciências da Natureza", materias: ["ciencias", "fisica", "quimica", "biologia"] },
  { label: "Ciências Humanas", materias: ["historia", "geografia", "filosofia", "sociologia"] },
  { label: "Corpo e movimento", materias: ["educacao_fisica"] },
  { label: "Outros assuntos", materias: ["outros"] },
];

/**
 * As matérias organizadas em grupos, prontas pra montar um menu ou `<optgroup>`.
 *
 * Deriva de `MATERIAS`, e não de uma segunda lista: uma matéria nova que ninguém
 * lembrou de agrupar cai no último grupo em vez de sumir do filtro em silêncio —
 * que é justamente o modo de falhar que essa rodada veio consertar.
 *
 * @returns {Array<{ label: string, materias: Array<{ valor: string, label: string }> }>}
 */
export function materiasAgrupadas() {
  const agrupadas = new Set(MATERIA_GRUPOS.flatMap((g) => g.materias));
  const orfas = MATERIAS.filter((m) => !agrupadas.has(m));

  return MATERIA_GRUPOS.map((grupo, i) => {
    const chaves = grupo.materias.filter((m) => MATERIAS.includes(m));
    // As órfãs entram no último grupo ("Outros assuntos"), que é onde elas
    // pertenceriam de qualquer jeito enquanto ninguém as classifica.
    const comOrfas = i === MATERIA_GRUPOS.length - 1 ? [...chaves, ...orfas] : chaves;
    return {
      label: grupo.label,
      materias: comOrfas.map((valor) => ({ valor, label: materiaLabel(valor) })),
    };
  }).filter((g) => g.materias.length);
}

/* --------------------------------------------------------------------------
   Série escolar
   -------------------------------------------------------------------------- */

/**
 * Os 12 valores canônicos de `criancas.serie`, no formato do contrato: `"No ano"`
 * com N de 1 a 12, onde 1–9 é o fundamental e **10, 11 e 12 são as três séries do
 * ensino médio**.
 *
 * A numeração contínua existe porque o servidor calibra a didática pela série, e
 * a numeração do médio recomeçar do 1 fazia "1º ano do ensino médio" virar a
 * série 1: aluno de 15 anos recebendo aula de alfabetização. O servidor interpreta
 * o que o pai escrever e regrava neste formato — o site só precisa CONHECER a
 * lista, nunca reimplementar a normalização.
 */
export const SERIES = Array.from({ length: 12 }, (_, i) => `${i + 1}o ano`);

/** Canônico → o jeito que o pai chama a série na vida real. */
const SERIE_LABELS = Object.fromEntries(
  SERIES.map((valor, i) => {
    const n = i + 1;
    return [
      valor,
      n <= 9 ? `${n}º ano (fundamental)` : `${n - 9}ª série (ensino médio)`,
    ];
  })
);

/**
 * Rótulo legível de uma série: `"10o ano"` → `"1ª série (ensino médio)"`.
 *
 * Valor fora da lista volta **como está**, e isso é de propósito: o servidor
 * preserva o texto que ele não reconhece em vez de apagá-lo, e a tela faz o mesmo.
 * @param {string|null|undefined} valor
 * @returns {string} (vazio quando não há série definida)
 */
export function serieLabel(valor) {
  if (!valor) return "";
  return SERIE_LABELS[valor] || valor;
}

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

/**
 * Instante DENTRO de uma aula (offset desde o início), como um humano diria:
 *   40000  -> "40s"
 *   252000 -> "4min12"
 *   300000 -> "5min"
 *
 * Diferente de `formatDuracao`, que arredonda pra minutos: aqui os segundos são o
 * ponto. A frase que o Mapa da Aula existe pra dizer é "aos 4min12, quando entrou
 * frações equivalentes, ela travou" — em "4 min" ela perderia a precisão que dá
 * credibilidade. Espelha `tempoLegivel` do servidor (modules/brain/mapa-aula.js),
 * pra o texto gerado pela IA e a linha do tempo falarem a mesma língua.
 * @param {number} ms
 * @returns {string}
 */
export function formatTempoNaAula(ms) {
  const seg = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  if (seg < 60) return `${seg}s`;
  const min = Math.floor(seg / 60);
  const resto = seg % 60;
  return resto === 0 ? `${min}min` : `${min}min${String(resto).padStart(2, "0")}`;
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

const DIA_MS = 86400000;

/**
 * Diferença em dias de CALENDÁRIO local entre dois instantes (`fim` − `ini`).
 * Comparamos meia-noite a meia-noite (e não 24h corridas) pelo mesmo motivo de
 * `formatDiaRelativo`: pro pai, algo visto às 23h de ontem é "ontem", não "há
 * 8 horas".
 * @returns {number} dias inteiros, ou NaN se alguma data for inválida.
 */
function diffDias(ini, fim) {
  const a = toDate(ini);
  const b = toDate(fim);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return NaN;
  const ma = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const mb = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((mb - ma) / DIA_MS);
}

/**
 * "Quando isso aconteceu", no passado: "hoje", "ontem", "há 3 dias"…
 * Usado na Trilha de aprendizado (`progresso.visto`). Linguagem de conversa,
 * não de relatório.
 * @param {string|Date} value
 * @param {Date} [now]
 * @returns {string} (vazio se a data for inválida)
 */
export function formatQuandoVisto(value, now = new Date()) {
  const d = diffDias(value, now);
  if (!Number.isFinite(d)) return "";
  if (d <= 0) return "hoje";
  if (d === 1) return "ontem";
  if (d < 7) return `há ${d} dias`;
  if (d < 14) return "há uma semana";
  if (d < 30) return `há ${Math.round(d / 7)} semanas`;
  if (d < 60) return "há um mês";
  return `há ${Math.round(d / 30)} meses`;
}

/**
 * "Quando isso volta", no futuro: "na próxima conversa" (já venceu), "amanhã",
 * "em 5 dias"… Usado na Trilha (`progresso.proxima`), onde uma data vencida
 * significa que a Cogni já vai puxar o assunto no próximo papo.
 * @param {string|Date} value
 * @param {Date} [now]
 * @returns {string} (vazio se a data for inválida)
 */
export function formatQuandoRevisar(value, now = new Date()) {
  const alvo = toDate(value).getTime();
  if (Number.isNaN(alvo)) return "";
  // Vencido é comparação de RELÓGIO, não de calendário: algo que venceu às 8h de
  // hoje já está na fila da Cogni, ainda que "hoje" pelo calendário.
  if (alvo <= toDate(now).getTime()) return "na próxima conversa";
  const d = diffDias(now, value);
  if (!Number.isFinite(d)) return "";
  if (d <= 0) return "ainda hoje";
  if (d === 1) return "amanhã";
  if (d < 7) return `em ${d} dias`;
  if (d < 14) return "na semana que vem";
  if (d < 60) return `em ${Math.round(d / 7)} semanas`;
  return `em ${Math.round(d / 30)} meses`;
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
