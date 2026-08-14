/**
 * mock-data.js — Fonte de dados do painel (roteador mock ↔ Supabase).
 *
 * Este módulo é o PONTO ÚNICO de dados que as seções importam. Ele decide, pela
 * flag `USAR_SUPABASE` abaixo, se serve os dados de EXEMPLO (mock, ancorados em
 * `MOCK_NOW`) ou os dados REAIS do Supabase (delegando a `supabase-data.js`).
 * A API pública (nomes/assinaturas/shape de retorno) é IDÊNTICA nos dois modos,
 * então as seções do painel funcionam sem mudar uma linha em qualquer um deles.
 *
 *   ┌─ USAR_SUPABASE = true  → dados reais (Supabase, RLS, snake_case)
 *   └─ USAR_SUPABASE = false → mock abaixo (demonstração/offline, com MOCK_NOW)
 *
 * Por que uma flag? Pra apresentação do TCC: o mock enche as telas com dados
 * bonitos e estáveis; o modo real prova a integração ponta a ponta. Alternar é
 * trocar um booleano.
 *
 * ⚠️ Contrato (docs/COMPANION-PLANO-TECNICO.md):
 *   - Todos os campos em snake_case (como o Postgres devolve).
 *   - Companion é SINGLE-CHILD: um responsável ↔ uma criança (a pareada).
 *   - `conversas` é read-only pelo site (a RLS bloqueia escrita; grava o servidor).
 *
 * No modo mock, nada escreve no banco: os formulários (Planos, perfil) operam
 * sobre cópias em memória só pra simular a experiência.
 */

import * as supa from "./supabase-data.js";

/**
 * Liga (true) os dados reais do Supabase; desliga (false) volta pro mock.
 * Padrão: true (integração ativa). Vire pra false pra demonstrar com o mock.
 */
export const USAR_SUPABASE = true;

/**
 * "Agora" de referência usado pelas seções (rótulos "Hoje/Ontem", janela da
 * semana, gráficos). No modo real é a data atual; no mock é a data fixa dos
 * dados de exemplo (`MOCK_NOW`), pra os rótulos relativos baterem.
 * @returns {Date}
 */
export function getNow() {
  return USAR_SUPABASE ? new Date() : MOCK_NOW;
}

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
  // Trilha de aprendizado (student model). READ-ONLY pro site: quem escreve é o
  // servidor, no pipeline pós-resposta. Datas relativas a MOCK_NOW (2026-05-27)
  // e coerentes com as conversas de exemplo abaixo — é o que o Painel de
  // Aprendizado lê pra montar "Praticando agora" e "Já domina".
  //
  // `nivel` (1 a 3) é a dificuldade do próximo exercício, calibrada pelo ciclo de
  // prática. Os itens abaixo cobrem de propósito os três casos que a tela precisa
  // distinguir: subiu e o último veredito foi bom (selo "subiu de nível"), subiu
  // mas depois travou (sem selo — ela caiu de nível, não subiu) e item legado,
  // gravado antes do campo existir (ausente = 1, também sem selo).
  progresso: [
    {
      conceito: "tabuada do 7",
      materia: "matematica",
      status: "travou", // rótulo INTERNO — a tela nunca mostra esta palavra
      acertos: 0,
      vezes: 3,
      nivel: 2, // caiu do 3 ao travar → NÃO ganha o selo de nível
      visto: "2026-05-26T20:41:00-03:00",
      proxima: "2026-05-27T20:41:00-03:00",
    },
    {
      conceito: "redação",
      materia: "portugues",
      status: "aprendeu",
      acertos: 1, // 1 acerto ainda não é domínio → aparece como "quase lá"
      vezes: 2,
      nivel: 2, // acertou de primeira e subiu → "quase lá" + "subiu de nível"
      visto: "2026-05-27T18:32:00-03:00",
      proxima: "2026-05-29T18:32:00-03:00",
    },
    {
      conceito: "animais em inglês",
      materia: "idiomas",
      status: "aprendeu",
      acertos: 1,
      vezes: 1,
      // Sem `nivel` de propósito: item anterior ao ciclo de prática (ausente = 1).
      visto: "2026-05-25T15:48:00-03:00",
      proxima: "2026-05-27T15:48:00-03:00",
    },
    {
      conceito: "dinossauros",
      materia: "ciencias",
      status: "aprendeu",
      acertos: 3,
      vezes: 5,
      nivel: 3,
      visto: "2026-05-27T16:05:00-03:00",
      proxima: "2026-06-08T16:05:00-03:00",
    },
    {
      conceito: "sistema solar",
      materia: "ciencias",
      status: "aprendeu",
      acertos: 2,
      vezes: 3,
      nivel: 2,
      visto: "2026-05-24T16:30:00-03:00",
      proxima: "2026-05-29T16:30:00-03:00",
    },
    {
      conceito: "descobrimento do Brasil",
      materia: "historia",
      status: "aprendeu",
      acertos: 2,
      vezes: 2,
      visto: "2026-05-25T17:22:00-03:00",
      proxima: "2026-05-30T17:22:00-03:00",
    },
    {
      conceito: "capitais do mundo",
      materia: "geografia",
      status: "aprendeu",
      acertos: 2,
      vezes: 2,
      visto: "2026-05-23T14:12:00-03:00",
      proxima: "2026-05-28T14:12:00-03:00",
    },
  ],
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
 * Dicas da Cogni — espelham a tabela `dicas` (histórico das dicas geradas por IA
 * no servidor). O servidor grava cada dica nova; o site só lê (read-only, como
 * `conversas`). A tela Aprendizado mostra a dica ATUAL em destaque (vem do
 * endpoint `/api/dica`) + este histórico em lista. Mais recentes primeiro.
 * Datas relativas a `MOCK_NOW` (2026-05-27) pros rótulos "Hoje/Ontem" baterem.
 */
const dicas = [
  {
    id: 9007,
    crianca_id: crianca.id,
    texto:
      "O Pedro anda curioso sobre dinossauros! Que tal visitarem juntos um " +
      "museu de ciências (ou um virtual) pra alimentar essa paixão?",
    criado_em: "2026-05-27T08:10:00-03:00",
  },
  {
    id: 9006,
    crianca_id: crianca.id,
    texto:
      "A tabuada apareceu algumas vezes essa semana. Um joguinho de cartas " +
      "com multiplicações pode deixar a prática mais leve e divertida.",
    criado_em: "2026-05-26T08:05:00-03:00",
  },
  {
    id: 9005,
    crianca_id: crianca.id,
    texto:
      "O Pedro pediu ajuda com redação. Ler junto uma história curta antes " +
      "de dormir ajuda a ampliar o vocabulário sem nem parecer estudo.",
    criado_em: "2026-05-25T08:00:00-03:00",
  },
  {
    id: 9004,
    crianca_id: crianca.id,
    texto:
      "Ele explorou o sistema solar com entusiasmo! Uma noite olhando as " +
      "estrelas e conversando sobre os planetas pode render boas perguntas.",
    criado_em: "2026-05-24T08:00:00-03:00",
  },
];

/**
 * Último Resumo Semanal salvo — espelha a tabela `resumos_semanais` (bilhete da
 * semana gerado por IA no servidor). O servidor grava; o site só lê (read-only).
 * É a fonte ESTÁVEL do card de Resumo da Semana: mostra o último bilhete mesmo
 * com o robô offline. No modo real, o destaque vem do endpoint /api/resumo-semanal
 * (mais fresco); este é o fallback persistido. `materias`/`topicos` são jsonb.
 */
const resumoSemanal = {
  id: 5001,
  crianca_id: crianca.id,
  texto:
    "Que semana rica a do Pedro! Ele mergulhou em ciências (puxando bastante " +
    "papo sobre dinossauros e o sistema solar), praticou a tabuada do 7 e ainda " +
    "pediu ajuda com a redação da escola. Dá pra ver a curiosidade dele crescendo " +
    "a cada conversa — continue incentivando essas perguntas!",
  materias: ["ciencias", "matematica", "portugues", "historia", "geografia"],
  topicos: [
    "dinossauros",
    "sistema solar",
    "tabuada do 7",
    "redação",
    "descobrimento do Brasil",
  ],
  total_conversas: 9,
  periodo_dias: 7,
  criado_em: "2026-05-27T08:15:00-03:00",
};

/**
 * Sessões de atenção — espelham a tabela `sessoes_atencao` (o Mapa de Compreensão
 * da Aula). Uma linha por AULA, não por turno: o servidor cruza, no eixo do tempo,
 * o assunto de cada turno com os sinais lidos pela câmera e os vereditos de
 * exercício, e grava tudo quando a sessão acaba. O site só lê (read-only).
 *
 * Três detalhes que o mock reproduz de propósito, porque a tela tem que aguentar:
 *   - `momentos[].emMs` é offset DESDE O INÍCIO da sessão (não timestamp);
 *   - os `rotulo` de `afeto`/`pratica` vêm SEM acento, como o robô os escrevia —
 *     quem acentua pra tela é o `mapa-api.js` (ver ROTULOS_ACENTUADOS lá). Os de
 *     `compreensao` já nascem acentuados no servidor (ago/2026), e estão aqui
 *     assim de propósito: a tabela de acentos não pode CORROMPER o que já veio
 *     certo. As duas convivem porque as aulas antigas continuam no jsonb como
 *     foram gravadas;
 *   - `tipo: "compreensao"` (ago/2026) é hoje a fonte mais frequente da linha do
 *     tempo — é o que a Cogni leu da própria conversa, e não da câmera nem do
 *     ciclo de exercícios.
 *
 * A terceira sessão não tem nenhum momento marcado: é o caso "correu tranquila",
 * que precisa parecer uma aula boa e não uma tela quebrada.
 *
 * Não há `assuntoMaisDificil` aqui, e isso está certo: a coluna guarda os
 * `momentos`, e o campo é derivado pelo servidor na leitura do endpoint.
 */
const sessoesAtencao = [
  {
    id: 3103,
    crianca_id: crianca.id,
    iniciada_em: "2026-05-27T16:00:00-03:00",
    duracao_ms: 17 * 60000,
    turnos: 9,
    materias: ["ciencias", "portugues"],
    topicos: ["dinossauros", "redação"],
    contadores: {
      travada: 1,
      confusa: 1,
      engajada: 2,
      acertos: 2,
      tropecos: 1,
      // Contados à parte de acertos/tropecos de propósito: um é veredito
      // conferido, o outro é leitura da conversa (ver o plano técnico).
      entendeu: 1,
      precisouAjuda: 1,
    },
    momentos: [
      {
        emMs: 2 * 60000 + 40000,
        tipo: "afeto",
        sinal: "engajada",
        rotulo: "estava embalada",
        materia: "ciencias",
        topico: "dinossauros",
      },
      {
        emMs: 4 * 60000 + 30000,
        tipo: "compreensao",
        resultado: "aprendeu",
        rotulo: "explicou com as próprias palavras",
        materia: "ciencias",
        topico: "dinossauros",
      },
      {
        emMs: 6 * 60000 + 15000,
        tipo: "pratica",
        resultado: "aprendeu",
        rotulo: "resolveu sozinha",
        materia: "ciencias",
        topico: "dinossauros",
      },
      {
        emMs: 9 * 60000 + 30000,
        tipo: "afeto",
        sinal: "confusa",
        rotulo: "ficou em duvida",
        materia: "portugues",
        topico: "redação",
      },
      {
        emMs: 10 * 60000 + 5000,
        tipo: "compreensao",
        resultado: "travou",
        rotulo: "pediu uma mão",
        materia: "portugues",
        topico: "redação",
      },
      {
        emMs: 11 * 60000 + 12000,
        tipo: "afeto",
        sinal: "travada",
        rotulo: "precisou de mais ajuda",
        materia: "portugues",
        topico: "redação",
      },
      {
        emMs: 12 * 60000 + 50000,
        tipo: "pratica",
        resultado: "travou",
        rotulo: "tropecou no exercicio",
        materia: "portugues",
        topico: "redação",
      },
      {
        emMs: 15 * 60000 + 5000,
        tipo: "pratica",
        resultado: "aprendeu",
        rotulo: "resolveu sozinha",
        materia: "portugues",
        topico: "redação",
      },
      {
        emMs: 16 * 60000 + 20000,
        tipo: "afeto",
        sinal: "engajada",
        rotulo: "estava embalada",
        materia: "portugues",
        topico: "redação",
      },
    ],
    criado_em: "2026-05-27T16:17:00-03:00",
  },
  {
    id: 3102,
    crianca_id: crianca.id,
    iniciada_em: "2026-05-26T20:30:00-03:00",
    duracao_ms: 15 * 60000,
    turnos: 7,
    materias: ["matematica"],
    topicos: ["tabuada do 7"],
    contadores: {
      travada: 2,
      confusa: 0,
      engajada: 0,
      acertos: 0,
      tropecos: 2,
      entendeu: 0,
      precisouAjuda: 2,
    },
    momentos: [
      {
        emMs: 2 * 60000 + 20000,
        tipo: "compreensao",
        resultado: "travou",
        rotulo: "pediu uma mão",
        materia: "matematica",
        topico: "tabuada do 7",
      },
      {
        emMs: 4 * 60000 + 12000,
        tipo: "afeto",
        sinal: "travada",
        rotulo: "precisou de mais ajuda",
        materia: "matematica",
        topico: "tabuada do 7",
      },
      {
        emMs: 8 * 60000 + 55000,
        tipo: "compreensao",
        resultado: "travou",
        rotulo: "pediu uma mão",
        materia: "matematica",
        topico: "tabuada do 7",
      },
      {
        emMs: 5 * 60000 + 48000,
        tipo: "pratica",
        resultado: "travou",
        rotulo: "tropecou no exercicio",
        materia: "matematica",
        topico: "tabuada do 7",
      },
      {
        emMs: 10 * 60000 + 3000,
        tipo: "afeto",
        sinal: "travada",
        rotulo: "precisou de mais ajuda",
        materia: "matematica",
        topico: "tabuada do 7",
      },
      {
        emMs: 13 * 60000 + 40000,
        tipo: "pratica",
        resultado: "travou",
        rotulo: "tropecou no exercicio",
        materia: "matematica",
        topico: "tabuada do 7",
      },
    ],
    criado_em: "2026-05-26T20:45:00-03:00",
  },
  {
    id: 3101,
    crianca_id: crianca.id,
    iniciada_em: "2026-05-24T16:20:00-03:00",
    duracao_ms: 14 * 60000,
    turnos: 6,
    materias: ["ciencias"],
    topicos: ["sistema solar"],
    contadores: { travada: 0, confusa: 0, engajada: 0, acertos: 0, tropecos: 0 },
    momentos: [], // aula sem atrito → a tela mostra "correu tranquila"
    criado_em: "2026-05-24T16:34:00-03:00",
  },
];

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

/* --- Implementações MOCK (usadas quando USAR_SUPABASE = false) ------------ */

async function _mockResponsavel() {
  await delay();
  return { ...responsavel };
}

async function _mockCrianca() {
  await delay();
  return { ...crianca };
}

async function _mockConversas() {
  await delay();
  return conversas
    .slice()
    .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))
    .map((c) => ({ ...c }));
}

async function _mockPlanos() {
  await delay();
  return planos.map((p) => ({ ...p }));
}

async function _mockDicas() {
  await delay();
  return dicas
    .slice()
    .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))
    .map((d) => ({ ...d }));
}

async function _mockResumoSemanal() {
  await delay();
  return { ...resumoSemanal };
}

async function _mockDicaAtual() {
  await delay();
  // A mais recente por criado_em (mesma ordenação do select real .limit(1)).
  const ordenadas = dicas
    .slice()
    .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
  return ordenadas.length ? { ...ordenadas[0] } : null;
}

async function _mockSessoesAtencao(limite) {
  await delay();
  return sessoesAtencao
    .slice()
    .sort((a, b) => new Date(b.iniciada_em) - new Date(a.iniciada_em))
    .slice(0, Math.min(Math.max(1, Number(limite) || 10), 50))
    .map((s) => ({ ...s }));
}

/* --- API pública de leitura (roteia mock ↔ Supabase pela flag) ------------ */

/** @returns {Promise<object>} o responsável logado (linha de `responsaveis`). */
export async function getResponsavel() {
  return USAR_SUPABASE ? supa.getResponsavel() : _mockResponsavel();
}

/**
 * @returns {Promise<object|null>} a criança pareada (linha de `criancas`),
 * ou null se nenhuma estiver pareada. (Single-child: nunca uma lista.)
 */
export async function getCrianca() {
  return USAR_SUPABASE ? supa.getCrianca() : _mockCrianca();
}

/**
 * @returns {Promise<Array<object>>} conversas da criança, mais recentes
 * primeiro — equivalente a:
 *   from('conversas').select('*').eq('crianca_id', id)
 *     .order('criado_em', { ascending: false })
 */
export async function getConversas() {
  return USAR_SUPABASE ? supa.getConversas() : _mockConversas();
}

/** @returns {Promise<Array<object>>} planos de estudo da criança. */
export async function getPlanos() {
  return USAR_SUPABASE ? supa.getPlanos() : _mockPlanos();
}

/**
 * @returns {Promise<Array<object>>} histórico das Dicas da Cogni da criança,
 * mais recentes primeiro — equivalente a:
 *   from('dicas').select('*').eq('crianca_id', id)
 *     .order('criado_em', { ascending: false })
 * (A dica ATUAL em destaque não vem daqui: vem do endpoint /api/dica — ver
 * dica.js. Este é só o histórico persistido.)
 */
export async function getDicas() {
  return USAR_SUPABASE ? supa.getDicas() : _mockDicas();
}

/**
 * @returns {Promise<object|null>} o último Resumo Semanal salvo da criança
 * (linha de `resumos_semanais`), ou null se ainda não há nenhum — equivalente a:
 *   from('resumos_semanais').select('*').eq('crianca_id', id)
 *     .order('criado_em', { ascending: false }).limit(1)
 * Fonte ESTÁVEL do card de Resumo (mostra o último bilhete mesmo com o robô
 * offline). A versão "fresca" do destaque vem do endpoint /api/resumo-semanal —
 * ver resumo-semanal.js.
 */
export async function getResumoSemanal() {
  return USAR_SUPABASE ? supa.getResumoSemanal() : _mockResumoSemanal();
}

/**
 * @returns {Promise<object|null>} a dica ATUAL da criança (linha mais recente de
 * `dicas`), ou null se a tabela está vazia pra ela — equivalente a:
 *   from('dicas').select('*').eq('crianca_id', id)
 *     .order('criado_em', { ascending: false }).limit(1)
 * Fonte ESTÁVEL do destaque "Dica de agora" (aparece com o robô offline). O
 * endpoint /api/dica só refresca quando o servidor está ligado — ver dica.js.
 */
export async function getDicaAtual() {
  return USAR_SUPABASE ? supa.getDicaAtual() : _mockDicaAtual();
}

/**
 * @param {number} [limite=10]
 * @returns {Promise<Array<object>>} sessões de atenção da criança (histórico do
 * Mapa da Aula), mais recentes primeiro — equivalente a:
 *   from('sessoes_atencao').select('*').eq('crianca_id', id)
 *     .order('iniciada_em', { ascending: false }).limit(n)
 * Fonte ESTÁVEL do Mapa (vale com o robô offline). A sessão AO VIVO não vem daqui:
 * ela só existe em RAM no servidor, no endpoint /api/mapa-aula — ver mapa-api.js.
 */
export async function getSessoesAtencao(limite = 10) {
  return USAR_SUPABASE
    ? supa.getSessoesAtencao(limite)
    : _mockSessoesAtencao(limite);
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

/* --- Implementações MOCK de escrita (operam em memória) ------------------- */

async function _mockCriarPlano(dados) {
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

async function _mockAtualizarPlano(id, patch) {
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

async function _mockRemoverPlano(id) {
  await delay(80);
  const antes = planos.length;
  planos = planos.filter((p) => p.id !== id);
  return planos.length < antes;
}

async function _mockAtualizarCrianca(patch) {
  await delay(80);
  // Espelha a regra do modo real (allowlist EDITAVEIS em supabase-data.js): a
  // trilha de aprendizado é escrita SÓ pelo servidor. O mock ignora `progresso`
  // pra que um bug de escrita apareça igual nos dois modos, e não só em produção.
  const { progresso, ...editaveis } = patch || {};
  Object.assign(crianca, editaveis, { atualizado_em: MOCK_NOW.toISOString() });
  return { ...crianca };
}

/* --- API pública de escrita (roteia mock ↔ Supabase pela flag) -----------
   No modo real: Planos viram insert/update/delete e o perfil vira update em
   `criancas` (RLS protege). Conversas permanecem read-only (não há escrita). */

/**
 * Cria um plano. Campos do contrato: { titulo, conteudo, foco, duracao_dias,
 * status }. No modo real, `responsavel_id` (NOT NULL) e `crianca_id` são
 * preenchidos pela camada de dados.
 * @param {object} dados
 * @returns {Promise<object>}
 */
export async function criarPlano(dados) {
  return USAR_SUPABASE ? supa.criarPlano(dados) : _mockCriarPlano(dados);
}

/**
 * Atualiza um plano existente.
 * @param {number} id
 * @param {object} patch — campos a sobrescrever
 * @returns {Promise<object|null>}
 */
export async function atualizarPlano(id, patch) {
  return USAR_SUPABASE
    ? supa.atualizarPlano(id, patch)
    : _mockAtualizarPlano(id, patch);
}

/**
 * Remove um plano.
 * @param {number} id
 * @returns {Promise<boolean>}
 */
export async function removerPlano(id) {
  return USAR_SUPABASE ? supa.removerPlano(id) : _mockRemoverPlano(id);
}

/**
 * Atualiza o perfil da criança — inclui o prompt_personalizado e os campos
 * editáveis pelo pai. No modo real, update em `criancas` (a RLS garante que o
 * pai só edita os próprios filhos; `responsavel_id`/`codigo_pareamento` nunca
 * são tocados aqui).
 * @param {object} patch
 * @returns {Promise<object>}
 */
export async function atualizarCrianca(patch) {
  return USAR_SUPABASE
    ? supa.atualizarCrianca(patch)
    : _mockAtualizarCrianca(patch);
}
