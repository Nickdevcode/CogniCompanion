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
  // `rascunho` é estado de SISTEMA, não escolha do pai: é como nasce o plano que a
  // IA montou de uma foto e ele ainda não aprovou. Não entra no <select> do
  // formulário — só aparece como badge e como a aba "Para revisar".
  rascunho: "Rascunho",
  ativo: "Ativo",
  em_andamento: "Em andamento",
  pausado: "Pausado",
  concluido: "Concluído",
};

/**
 * Status que fazem a Cogni SEGUIR o plano (= injetar no system prompt dela).
 * Espelha `STATUS_VIGENTES` de `server/modules/planos.js`. Ver `planosVigentes()`.
 */
export const STATUS_VIGENTES = ["ativo", "em_andamento"];

/** Colunas do quadro da Mesa de Estudos (`plano_tarefas.coluna`), na ordem visual. */
export const COLUNAS = [
  { id: "a_fazer", titulo: "A fazer" },
  { id: "fazendo", titulo: "Fazendo" },
  { id: "feito", titulo: "Feito" },
];

/** @returns {string} rótulo legível da coluna (fallback: "A fazer", como o servidor). */
export function colunaLabel(coluna) {
  const c = COLUNAS.find((x) => x.id === coluna);
  return (c || COLUNAS[0]).titulo;
}

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

/**
 * Primeira letra maiúscula, o resto intacto.
 *
 * Texto que nasce fora do site chega minúsculo: o conceito que a IA gravou
 * ("tabuada do 7"), o rótulo do momento que o robô mandou ("estava no embalo"),
 * o tópico da conversa. Na tela cada um desses abre uma linha, um chip ou um
 * selo — e começar em minúscula ali é erro de escrita, não estilo. Quem escreve
 * a frase inteira NÃO passa por aqui: "visto ontem" no meio de uma linha de
 * metadados continua minúsculo, como manda o português.
 *
 * @param {string} texto
 * @returns {string}
 */
export function capitalizar(texto) {
  const t = String(texto || "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** @returns {string} rótulo legível da matéria (fallback: a própria chave). */
export function materiaLabel(materia) {
  return MATERIA_LABELS[materia] || materia || "Outros";
}

/** @returns {string} rótulo legível do status do plano. */
export function statusLabel(status) {
  return STATUS_LABELS[status] || status || "Não definido";
}

/**
 * De onde o plano nasceu, em português, pro selo do card.
 *
 * ⚠️ `planos_estudo.origem` guarda UM valor por plano e não guarda o FORMATO exato — um
 * plano feito de PDF e um feito de `.docx` são os dois `arquivo`. Dizer "criado a
 * partir de um PDF" exigiria uma coluna nova, e a rodada 2 decidiu não criar nenhuma.
 * O formato exato fica visível nos cabeçalhos do `extraido_texto` ("ver o que a Cogni
 * entendeu"), que é onde o pai vai olhar se a pergunta importar.
 *
 * @returns {string|null} null quando o plano foi digitado à mão
 */
export function origemLabel(origem) {
  const rotulos = {
    foto: "Criado a partir de uma foto",
    arquivo: "Criado a partir de um arquivo",
    audio: "Criado a partir de um áudio",
    video: "Criado a partir de um vídeo",
    // ⭐ 16/ago/2026 — o plano que a Cogni montou do que o responsável pediu por
    // escrito, sem material nenhum da escola.
    pedido: "Criado a partir do seu pedido",
    /**
     * ⭐ Rodada 3 — a videoaula ou a página que o responsável colou. O rótulo NÃO diz
     * "vídeo" nem "site": `origem` guarda um valor só, e os dois casos caem aqui. Qual
     * era fica no `extraido_texto` ("ver o que a Cogni entendeu"), que é onde o pai
     * olha quando a pergunta importa.
     */
    link: "Criado a partir de um link",
  };
  return rotulos[origem] || null;
}

/**
 * Formata uma lista de dias (ex.: ["seg","qua","sex"]) em "Seg, Qua, Sex".
 * @param {string[]} dias
 * @returns {string}
 */
export function diasLabel(dias) {
  if (!Array.isArray(dias) || !dias.length) return "Não definido";
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

/**
 * O DIA de um valor, como texto "YYYY-MM-DD".
 *
 * 🗓️ Existe por causa de um bug de fuso que custa a tarde de alguém em todo projeto
 * que mistura `date` com `timestamp`. `plano_tarefas.prazo` é um `date` **sem hora**,
 * e `new Date('2026-08-17')` é meia-noite em **UTC** — ou seja, 21h do dia 16 no
 * Brasil. Passar isso por um `getDate()` local devolve o dia ERRADO: o prazo de hoje
 * vira "atrasado ontem" e o de amanhã deixa de ser urgente. O servidor corrigiu o
 * mesmo defeito comparando dia com dia, como texto (`YYYY-MM-DD` é ordenável
 * lexicograficamente), e é o que fazemos aqui.
 *
 * Data pura (só "YYYY-MM-DD") é lida como o dia que está escrito, sem fuso nenhum.
 * Timestamp e `Date` continuam sendo convertidos pro dia LOCAL, que é o certo pra
 * eles — um instante pertence ao dia de quem está olhando.
 *
 * @param {string|Date} value
 * @returns {string} "" quando não dá pra ler um dia
 */
export function chaveDeDia(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const d = toDate(value);
  return Number.isNaN(d.getTime()) ? "" : dayKey(d);
}

/** "YYYY-MM-DD" → meia-noite LOCAL daquele dia (nunca UTC). */
function diaLocal(chave) {
  const [y, m, d] = chave.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Prazo de uma tarefa do quadro (`plano_tarefas.prazo`, um `date` "YYYY-MM-DD").
 *
 * Diferente de `formatQuandoRevisar`, aqui a comparação é de CALENDÁRIO, não de
 * relógio: `prazo` é um dia inteiro, não um instante. Uma tarefa com prazo hoje
 * não está atrasada às 8h da manhã — nem, por causa do fuso, na noite de ontem
 * (ver `chaveDeDia`).
 *
 * @param {string|Date} value
 * @param {Date} [now]
 * @returns {{ texto: string, atrasado: boolean, perto: boolean }|null}
 *   `null` se não há prazo ou a data é inválida — quem chama simplesmente não
 *   desenha a linha (tarefa sem prazo é o caso comum, não uma falha).
 */
export function formatPrazo(value, now = new Date()) {
  if (!value) return null;
  const chave = chaveDeDia(value);
  const hoje = chaveDeDia(now);
  if (!chave || !hoje) return null;
  const d = Math.round((diaLocal(chave) - diaLocal(hoje)) / DIA_MS);
  if (!Number.isFinite(d)) return null;
  if (d < 0) {
    const atraso = -d;
    return {
      texto: atraso === 1 ? "Atrasado 1 dia" : `Atrasado ${atraso} dias`,
      atrasado: true,
      perto: false,
    };
  }
  if (d === 0) return { texto: "Hoje", atrasado: false, perto: true };
  if (d === 1) return { texto: "Amanhã", atrasado: false, perto: true };
  if (d < 7) return { texto: `Em ${d} dias`, atrasado: false, perto: d <= 2 };
  // `diaLocal` de novo (e não `toDate(value)`): senão o rótulo longo mostraria o dia
  // anterior, com o prazo curto já corrigido logo acima — o pior tipo de bug, o que
  // se contradiz dentro da mesma tela.
  return { texto: `Até ${_dayFmt.format(diaLocal(chave))}`, atrasado: false, perto: false };
}

/* --------------------------------------------------------------------------
   Planos — quais deles a Cogni está seguindo
   -------------------------------------------------------------------------- */

/**
 * O plano venceu? `criado_em + duracao_dias` já passou.
 *
 * "1 dia dura 1 dia": um plano criado hoje com `duracao_dias: 1` vence amanhã.
 * `duracao_dias` null/0 = sem prazo, nunca vence.
 * @returns {boolean}
 */
export function planoVencido(plano, now = new Date()) {
  const dias = Number(plano && plano.duracao_dias) || 0;
  if (dias <= 0) return false;
  const inicio = toDate(plano.criado_em);
  if (Number.isNaN(inicio.getTime())) return false;
  return inicio.getTime() + dias * DIA_MS <= toDate(now).getTime();
}

/**
 * Teto de planos que a Cogni segue ao mesmo tempo, por criança.
 * Espelha `MAX_PLANOS_VIGENTES` de `server/modules/planos.js`.
 */
export const MAX_PLANOS_VIGENTES = 5;

/**
 * A `ordem` que um plano vale na fila. Ausente, nula ou suja vira `1000`.
 *
 * O default do banco é 1000 e **não houve backfill**: enquanto o pai não arrastar
 * nada, todos empatam e o desempate continua sendo `atualizado_em` — exatamente o
 * comportamento anterior. `1000` também é a resposta certa enquanto o SQL não roda
 * (a coluna simplesmente não vem no `select`), o que mantém site e robô contando a
 * mesma história nesse intervalo. Espelha `linhaParaPlano()` do servidor.
 */
export const ORDEM_PADRAO = 1000;

/** @returns {number} a `ordem` do plano, nunca `NaN`. */
export function ordemDoPlano(plano) {
  const n = Number(plano && plano.ordem);
  return Number.isFinite(n) ? n : ORDEM_PADRAO;
}

/**
 * A fila da Cogni: `ordem asc → atualizado_em desc → criado_em desc → id desc`.
 *
 * ⚠️ Esta ordem é um CONTRATO com o servidor (`porPrioridade`, em
 * `server/modules/planos.js`), não uma preferência da tela. Se as duas divergirem, o
 * pai vê o arraste funcionar e a Cogni seguir outra fila — o pior resultado possível,
 * porque a tela fica mentindo com cara de certeza. Mudou lá, muda aqui.
 *
 * ⭐ 16/ago/2026 — até esta rodada a chave principal era `atualizado_em desc`, o que
 * fazia *editar* um plano virar *promover* um plano sem o pai saber disso.
 */
export function porPrioridade(a, b) {
  const oa = ordemDoPlano(a);
  const ob = ordemDoPlano(b);
  if (oa !== ob) return oa - ob;
  const ta = toDate(a.atualizado_em || a.criado_em).getTime() || 0;
  const tb = toDate(b.atualizado_em || b.criado_em).getTime() || 0;
  if (tb !== ta) return tb - ta;
  const ca = toDate(a.criado_em).getTime() || 0;
  const cb = toDate(b.criado_em).getTime() || 0;
  if (cb !== ca) return cb - ca;
  return Number(b.id) - Number(a.id);
}

/**
 * Uma CÓPIA da lista na ordem da fila. Não mexe no array recebido — a tela guarda
 * a mesma referência em vários lugares.
 * @param {Array<object>} planos
 * @returns {Array<object>}
 */
export function ordenarPlanos(planos) {
  return (planos || []).slice().sort(porPrioridade);
}

/**
 * TODOS os planos que a Cogni está seguindo AGORA — a mesma regra de
 * `obterPlanosVigentes()` em `server/modules/planos.js`.
 *
 * ⚠️ Isto é uma SEGUNDA CÓPIA de uma regra do servidor, o que o projeto evita por
 * princípio (ver a nota das 14 matérias). Ela existe porque a tela precisa dizer
 * ao pai *"a Cogni não está seguindo este plano agora"* quando ele abre o quadro
 * de um plano pausado/concluído/rascunho/vencido — e o site não tem endpoint que
 * responda isso. Se a regra do servidor mudar, esta função muda junto.
 *
 * 🔴 16/ago/2026 — ela devolvia UM plano (o servidor tinha um `limit(1)`), e isso
 * virou mentira na tela: com dois planos `ativo`, o segundo exibia *"a Cogni não
 * está seguindo este plano agora"* enquanto a Cogni o seguia normalmente. Agora
 * **todos** os que passam no filtro estão valendo, até o teto.
 *
 * ⭐ E quem sobrevive ao teto passou a ser decidido pela `ordem` do pai, não pela
 * recência: o 6º em diante é o 6º da FILA DELE. Corte por recência num teto que ele
 * não controlava era a versão silenciosa do mesmo problema — o plano que importava
 * caía fora porque outro tinha sido editado depois.
 *
 * @param {Array<object>} planos — linhas de `planos_estudo`
 * @param {Date} [now]
 * @returns {Array<object>} os vigentes, na ordem da fila (pode ser vazio)
 */
export function planosVigentes(planos, now = new Date()) {
  return filaDePlanos(planos, now).slice(0, MAX_PLANOS_VIGENTES);
}

/**
 * A fila INTEIRA, sem o corte do teto: todo plano que está no ar e no prazo, na
 * ordem que o pai arrastou.
 *
 * Serve pra tela conseguir dizer *"este é o 6º"* — sem ela, o plano que ficou de fora
 * seria indistinguível de um pausado, e o aviso viraria o genérico "não está entre os
 * que ela segue", que não ensina nada nem sugere o que fazer.
 *
 * @param {Array<object>} planos
 * @param {Date} [now]
 * @returns {Array<object>}
 */
export function filaDePlanos(planos, now = new Date()) {
  return ordenarPlanos(planos).filter(
    (p) => STATUS_VIGENTES.includes(p.status) && !planoVencido(p, now)
  );
}

/**
 * A posição deste plano na fila (1 = por onde a Cogni começa).
 * @returns {number} 0 quando ele não está na fila (rascunho, pausado, vencido…)
 */
export function posicaoNaFila(plano, planos, now = new Date()) {
  if (!plano) return 0;
  const i = filaDePlanos(planos, now).findIndex((p) => String(p.id) === String(plano.id));
  return i + 1;
}

/**
 * Este plano está entre os que a Cogni segue?
 *
 * @param {object} plano
 * @param {Array<object>} planos — TODOS os planos da criança (o teto é por criança)
 * @returns {boolean}
 */
export function ehVigente(plano, planos, now = new Date()) {
  if (!plano) return false;
  return planosVigentes(planos, now).some((p) => String(p.id) === String(plano.id));
}

/**
 * Por que este plano NÃO está entre os que a Cogni segue — em linguagem de pai.
 *
 * Existe pra tela não se limitar a um aviso genérico: o pai que abre um plano
 * pausado e arrasta cards esperando o robô reagir merece saber o motivo, não só
 * o fato.
 * @returns {string|null} `null` quando o plano ESTÁ valendo (nada a avisar)
 */
export function motivoNaoVigente(plano, planos, now = new Date()) {
  if (!plano) return null;
  if (ehVigente(plano, planos, now)) return null;
  if (plano.status === "rascunho") return "Este plano ainda está esperando sua aprovação.";
  if (plano.status === "pausado") return "Este plano está pausado.";
  if (plano.status === "concluido") return "Este plano já foi concluído.";
  if (planoVencido(plano, now)) return "O prazo deste plano terminou.";
  /**
   * Sobrou o 6º plano em diante: ele está ativo e no prazo, e mesmo assim ficou de
   * fora — o teto é do servidor. Dizer a POSIÇÃO importa: sem ela o aviso parece
   * defeito da tela em vez de um limite conhecido, e o pai não descobre que existe
   * uma saída que depende só dele (arrastar). Desde 16/ago/2026 quem sobrevive ao
   * teto são os primeiros da fila DELE, não os planos mais recentes.
   */
  if (STATUS_VIGENTES.includes(plano.status)) {
    const pos = posicaoNaFila(plano, planos, now);
    return (
      `Ela segue no máximo ${MAX_PLANOS_VIGENTES} planos ao mesmo tempo, e este é o ` +
      `${pos}º da sua fila. Arraste ele pra cima da faixa, ou pause um dos outros.`
    );
  }
  return "Este plano não está entre os que ela segue.";
}

/**
 * O que o arraste significa PRA ESTE plano — o texto que evita o pai reordenar uma
 * fila que não existe.
 *
 * A faixa é arrastável inteira quando está na aba dos ativos, mas nem todo plano
 * dela está valendo (um pode ter vencido, outro pode ser o 6º). Arrastar esses não
 * muda nada no robô hoje, e um arraste sem efeito, repetido duas ou três vezes,
 * ensina o pai a desconfiar do gesto — inclusive onde ele funciona.
 *
 * @returns {string|null} `null` quando a ordem deste plano vale agora (nada a dizer)
 */
export function avisoDeOrdem(plano, planos, now = new Date()) {
  if (!plano || ehVigente(plano, planos, now)) return null;
  return "A posição dele na fila só passa a valer quando ele voltar a valer.";
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
 * Como chamar a criança numa frase, SEM chutar o gênero dela.
 *
 * 🔴 Por que isto existe. O contrato de `criancas` não tem campo de gênero — e o
 * painel escrevia "o {nome}" na mão em sete lugares ("Como tá indo o Ana?",
 * "Deixa o Ana desenhar o rosto da Cogni"). Metade das famílias abria o painel e
 * a primeira frase da tela estava errada sobre a filha delas. Não é detalhe de
 * redação: é o app dizendo, na abertura, que não sabe com quem está falando.
 *
 * A saída não é adivinhar nem pedir mais um campo no cadastro — é escrever frases
 * que não precisam do artigo. Português dá duas construções neutras de graça:
 *
 *   - **sujeito sem artigo** — "Pedro estudou 20min" / "Ana estudou 20min" ✅
 *   - **`de` + nome** — "o dia de Pedro" / "o dia de Ana" ✅
 *     (o coloquial "do Pedro"/"da Ana" é o que tem gênero; "de" não tem)
 *
 * A prática nasceu numa seção só (ago/2026) e estas funções a transformaram na
 * regra da casa, com o fallback de quando não há nome.
 *
 * @param {string} nome — primeiro nome já extraído (pode vir vazio)
 * @returns {string} o sujeito da frase ("Pedro" ou "a criança")
 */
export function sujeito(nome) {
  return nome || "a criança";
}

/**
 * A forma possessiva neutra: "de Pedro" / "da criança".
 * Use em "o dia {de Pedro}", "as conversas {de Pedro}".
 * @param {string} nome — primeiro nome já extraído (pode vir vazio)
 * @returns {string}
 */
export function deQuem(nome) {
  return nome ? `de ${nome}` : "da criança";
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
