/**
 * mock-data.js — Fonte de dados de EXEMPLO do painel (front-end isolado).
 *
 * ⚠️ IMPORTANTE PARA A INTEGRAÇÃO (backend/Supabase):
 *   - Todos os campos seguem EXATAMENTE o "Contrato de dados" do documento
 *     `docs/COMPANION-PLANO-TECNICO.md` (snake_case do Postgres).
 *   - As funções abaixo são `async` e devolvem o MESMO shape que as queries
 *     reais devolverão. Para ligar o backend, basta trocar o corpo de cada
 *     função por chamadas `window.cognifyAuth.getClient().from(...)` — as
 *     seções do painel não precisam mudar.
 *   - Companion é SINGLE-CHILD: um responsável ↔ uma criança (a criança
 *     pareada). Não há lista de filhos nem "criança ativa".
 *
 * Nada aqui escreve no banco. Os formulários (Planos, perfil) operam sobre
 * cópias em memória só pra simular a experiência; ao integrar, viram
 * insert/update/delete reais (respeitando o RLS: conversas é read-only).
 */

/* ==========================================================================
   Registros base (espelham as tabelas do contrato)
   ========================================================================== */

/** Responsável logado — espelha a linha de `responsaveis` (= auth.users). */
const responsavel = {
  id: "00000000-0000-0000-0000-000000000001", // uuid (= auth.users.id)
  nome: "Marina Carvalho",
  email: "marina@exemplo.com",
  criado_em: "2026-04-02T13:20:00-03:00",
};

/** Criança pareada — espelha a linha de `criancas`. */
const crianca = {
  id: "usuario_1714600000_a1b2c3", // text PK (id do robô — não trocar p/ uuid)
  nome: "Pedro Carvalho",
  role: "estudante",
  idade: 8,
  serie: "3º ano",
  materia_favorita: "ciencias",
  materia_dificil: "matematica",
  como_aprende: "Aprende melhor com exemplos do dia a dia e perguntas.",
  hobbies: "Dinossauros, desenhar e jogar bola.",
  estilo_linguagem: "Simples, animado e com analogias.",
  onboarding_completo: true,
  memorias: [
    "Tem um cachorro chamado Thor.",
    "Quer ser paleontólogo.",
    "Gosta de histórias antes de dormir.",
  ],
  idioma_nativo: "pt",
  idiomas_estudando: [{ idioma: "en", nivel: "iniciante" }],
  prompt_personalizado:
    "Incentive a curiosidade do Pedro sobre ciências e use exemplos com " +
    "dinossauros quando possível. Evite respostas longas demais.",
  responsavel_id: responsavel.id,
  criado_em: "2026-04-02T13:25:00-03:00",
  ultimo_acesso: "2026-05-27T18:33:00-03:00",
  atualizado_em: "2026-05-20T10:00:00-03:00",
};

/**
 * Conversas — espelham `conversas` (o Diário). O servidor grava; o site só lê.
 * Datas relativas a 2026-05-27 (data do mock) pra "Hoje/Ontem" fazerem sentido
 * nas demonstrações. Cada turno tem materia + duracao_ms (a "chave de ouro").
 */
const conversas = [
  // ---- Hoje (27/05) ----
  {
    id: 1042,
    crianca_id: crianca.id,
    texto_usuario: "Cogni, como posso melhorar minha redação para a escola?",
    texto_resposta:
      "Que ótima pergunta! Vamos pensar juntos em ideias, organizar suas " +
      "palavras e revisar os pontos importantes.",
    materia: "portugues",
    topico: "redação",
    sensivel: false,
    duracao_ms: 7 * 60000,
    origem: "robo",
    criado_em: "2026-05-27T18:32:00-03:00",
  },
  {
    id: 1041,
    crianca_id: crianca.id,
    texto_usuario: "Por que os dinossauros desapareceram?",
    texto_resposta:
      "Existem várias teorias, como mudanças climáticas e impacto de " +
      "asteroides. Quer que eu te conte mais sobre elas?",
    materia: "ciencias",
    topico: "dinossauros",
    sensivel: false,
    duracao_ms: 12 * 60000,
    origem: "robo",
    criado_em: "2026-05-27T16:05:00-03:00",
  },
  // ---- Ontem (26/05) ----
  {
    id: 1040,
    crianca_id: crianca.id,
    texto_usuario: "Cogni, me ajuda a entender a tabuada do 7?",
    texto_resposta:
      "Claro! Vamos por partes: 7, 14, 21... Eu te mostro um truque pra " +
      "decorar mais fácil.",
    materia: "matematica",
    topico: "tabuada do 7",
    sensivel: false,
    duracao_ms: 15 * 60000,
    origem: "robo",
    criado_em: "2026-05-26T20:41:00-03:00",
  },
  {
    id: 1039,
    crianca_id: crianca.id,
    texto_usuario: "Fiquei triste hoje na escola, ninguém quis brincar comigo.",
    texto_resposta:
      "Sinto muito que seu dia foi difícil. Quer me contar o que aconteceu? " +
      "Conversar ajuda, e você não está sozinho.",
    materia: "outros",
    topico: null, // papo sem assunto de estudo → ignorado no Painel de Aprendizado
    sensivel: true, // bateu no filtro de segurança (verificarEntrada)
    duracao_ms: 9 * 60000,
    origem: "robo",
    criado_em: "2026-05-26T19:10:00-03:00",
  },
  // ---- Anteontem (25/05) ----
  {
    id: 1038,
    crianca_id: crianca.id,
    texto_usuario: "Quem descobriu o Brasil?",
    texto_resposta:
      "Os portugueses chegaram ao Brasil em 1500, liderados por Pedro " +
      "Álvares Cabral. Mas já havia muitos povos indígenas aqui!",
    materia: "historia",
    topico: "descobrimento do Brasil",
    sensivel: false,
    duracao_ms: 8 * 60000,
    origem: "navegador",
    criado_em: "2026-05-25T17:22:00-03:00",
  },
  {
    id: 1037,
    crianca_id: crianca.id,
    texto_usuario: "Como se diz 'gato' em inglês?",
    texto_resposta: "Gato em inglês é 'cat'! Quer aprender mais animais?",
    materia: "idiomas",
    topico: "animais em inglês",
    sensivel: false,
    duracao_ms: 6 * 60000,
    origem: "robo",
    criado_em: "2026-05-25T15:48:00-03:00",
  },
  // ---- Dias anteriores (pra encher o gráfico semanal) ----
  {
    id: 1036,
    crianca_id: crianca.id,
    texto_usuario: "O que são os planetas do sistema solar?",
    texto_resposta:
      "São oito! Mercúrio, Vênus, Terra, Marte, Júpiter, Saturno, Urano e " +
      "Netuno. Cada um tem características incríveis.",
    materia: "ciencias",
    topico: "sistema solar",
    sensivel: false,
    duracao_ms: 14 * 60000,
    origem: "robo",
    criado_em: "2026-05-24T16:30:00-03:00",
  },
  {
    id: 1035,
    crianca_id: crianca.id,
    texto_usuario: "Qual é a capital da França?",
    texto_resposta: "A capital da França é Paris, conhecida pela Torre Eiffel!",
    materia: "geografia",
    topico: "capitais do mundo",
    sensivel: false,
    duracao_ms: 5 * 60000,
    origem: "robo",
    criado_em: "2026-05-23T14:12:00-03:00",
  },
  {
    id: 1034,
    crianca_id: crianca.id,
    texto_usuario: "Me conta uma curiosidade sobre o T-Rex!",
    texto_resposta:
      "O T-Rex tinha dentes do tamanho de uma banana e uma mordida " +
      "super forte! Mas seus bracinhos eram bem pequenos.",
    materia: "ciencias",
    topico: "dinossauros",
    sensivel: false,
    duracao_ms: 11 * 60000,
    origem: "robo",
    criado_em: "2026-05-22T17:05:00-03:00",
  },
];

/** Planos de estudo — espelham `planos_estudo`. O pai escreve direto. */
let planos = [
  {
    id: 21,
    crianca_id: crianca.id,
    responsavel_id: responsavel.id,
    titulo: "Leitura divertida",
    conteudo:
      "Histórias que ensinam e encantam. Ler um trecho por dia e conversar " +
      "sobre o que aprendeu.",
    foco: "portugues",
    duracao_dias: 30,
    status: "ativo",
    criado_em: "2026-05-10T09:00:00-03:00",
    atualizado_em: "2026-05-10T09:00:00-03:00",
  },
  {
    id: 22,
    crianca_id: crianca.id,
    responsavel_id: responsavel.id,
    titulo: "Tabuada com a Cogni",
    conteudo:
      "Praticar a tabuada de forma leve, com jogos e desafios curtos a " +
      "cada sessão.",
    foco: "matematica",
    duracao_dias: 21,
    status: "em_andamento",
    criado_em: "2026-05-12T10:30:00-03:00",
    atualizado_em: "2026-05-18T11:00:00-03:00",
  },
  {
    id: 23,
    crianca_id: crianca.id,
    responsavel_id: responsavel.id,
    titulo: "Explorando Ciências",
    conteudo:
      "Descobrir o mundo natural: animais, plantas, espaço e experimentos " +
      "simples pra fazer em casa.",
    foco: "ciencias",
    duracao_dias: 14,
    status: "pausado",
    criado_em: "2026-05-05T08:00:00-03:00",
    atualizado_em: "2026-05-15T08:00:00-03:00",
  },
  {
    id: 24,
    crianca_id: crianca.id,
    responsavel_id: responsavel.id,
    titulo: "Aventuras na História",
    conteudo:
      "Viajar pelo tempo: grandes civilizações, descobrimentos e a " +
      "história do Brasil.",
    foco: "historia",
    duracao_dias: 20,
    status: "concluido",
    criado_em: "2026-04-01T08:00:00-03:00",
    atualizado_em: "2026-04-21T08:00:00-03:00",
  },
];

/**
 * Frase de encorajamento (fim do bloco de curiosidades). No app real é montada
 * no front (texto fixo carinhoso). Os tópicos e as curiosidades de repetição
 * NÃO ficam aqui: são DERIVADOS de `conversas.topico` (ver contrato atualizado
 * do backend) — Tópicos explorados = `topico` distintos; Curiosidades = `topico`
 * que repetem na semana. A derivação vive em sections/aprendizado.js.
 */
const fraseEncorajamento =
  "Continue assim! Pequenas descobertas hoje, grandes aprendizados sempre.";

/** "Dica do Cogni" (Início) — no MVP real é gerada por IA 1×/dia. */
const dicaDoCogni = {
  titulo: "Pequenas pausas ajudam muito!",
  texto:
    "Que tal um alongamento rápido ou um copo d'água antes do próximo plano?",
};

/* ==========================================================================
   "Agora" do mock — fixa a data de referência pra os rótulos relativos
   ("Hoje"/"Ontem") baterem com os dados de exemplo acima.
   Ao integrar, troque por `new Date()` (ou remova e use a data real).
   ========================================================================== */
export const MOCK_NOW = new Date("2026-05-27T19:00:00-03:00");

/* ==========================================================================
   API de leitura (mesmo shape do que o Supabase devolverá)
   ========================================================================== */

/** Simula latência de rede leve pra UI exercitar estados de carregamento. */
function delay(ms = 120) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** @returns {Promise<object>} o responsável logado (linha de `responsaveis`). */
export async function getResponsavel() {
  await delay();
  return { ...responsavel };
}

/**
 * @returns {Promise<object|null>} a criança pareada (linha de `criancas`),
 * ou null se nenhuma estiver pareada. (Single-child: nunca uma lista.)
 */
export async function getCrianca() {
  await delay();
  return { ...crianca };
}

/**
 * @returns {Promise<Array<object>>} conversas da criança, mais recentes
 * primeiro — equivalente a:
 *   from('conversas').select('*').eq('crianca_id', id)
 *     .order('criado_em', { ascending: false })
 */
export async function getConversas() {
  await delay();
  return conversas
    .slice()
    .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))
    .map((c) => ({ ...c }));
}

/** @returns {Promise<Array<object>>} planos de estudo da criança. */
export async function getPlanos() {
  await delay();
  return planos.map((p) => ({ ...p }));
}

/**
 * @returns {Promise<string>} frase de encorajamento do bloco de curiosidades.
 * (Tópicos e curiosidades de repetição são derivados de `conversas.topico`.)
 */
export async function getFraseEncorajamento() {
  await delay();
  return fraseEncorajamento;
}

/** @returns {Promise<object>} a dica do Cogni (Início). */
export async function getDicaDoCogni() {
  await delay();
  return { ...dicaDoCogni };
}

/* ==========================================================================
   API de escrita (SIMULADA — opera em memória)
   Ao integrar: Planos e perfil viram insert/update/delete reais. Conversas
   permanecem read-only (RLS bloqueia escrita pelo site).
   ========================================================================== */

/** Gera um id incremental simples pra novos planos (mock). */
function nextPlanoId() {
  return planos.reduce((max, p) => Math.max(max, p.id), 0) + 1;
}

/**
 * Cria um plano (mock). Recebe os campos do contrato e devolve o registro.
 * @param {object} dados — { titulo, conteudo, foco, duracao_dias, status }
 * @returns {Promise<object>}
 */
export async function criarPlano(dados) {
  await delay(80);
  const agora = MOCK_NOW.toISOString();
  const plano = {
    id: nextPlanoId(),
    crianca_id: crianca.id,
    responsavel_id: responsavel.id, // NOT NULL no banco (= auth.uid())
    titulo: dados.titulo || "Novo plano",
    conteudo: dados.conteudo || "",
    foco: dados.foco || "outros",
    duracao_dias: Number(dados.duracao_dias) || 0,
    status: dados.status || "ativo",
    criado_em: agora,
    atualizado_em: agora,
  };
  planos.push(plano);
  return { ...plano };
}

/**
 * Atualiza um plano existente (mock).
 * @param {number} id
 * @param {object} patch — campos a sobrescrever
 * @returns {Promise<object|null>}
 */
export async function atualizarPlano(id, patch) {
  await delay(80);
  const i = planos.findIndex((p) => p.id === id);
  if (i === -1) return null;
  planos[i] = {
    ...planos[i],
    ...patch,
    atualizado_em: MOCK_NOW.toISOString(),
  };
  return { ...planos[i] };
}

/**
 * Remove um plano (mock).
 * @param {number} id
 * @returns {Promise<boolean>}
 */
export async function removerPlano(id) {
  await delay(80);
  const antes = planos.length;
  planos = planos.filter((p) => p.id !== id);
  return planos.length < antes;
}

/**
 * Atualiza o perfil da criança (mock) — inclui o prompt_personalizado e os
 * campos editáveis pelo pai. Ao integrar: update em `criancas` (RLS garante
 * que o pai só edita os próprios filhos).
 * @param {object} patch
 * @returns {Promise<object>}
 */
export async function atualizarCrianca(patch) {
  await delay(80);
  Object.assign(crianca, patch, { atualizado_em: MOCK_NOW.toISOString() });
  return { ...crianca };
}
