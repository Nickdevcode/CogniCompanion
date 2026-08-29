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
 *   - `planos_estudo` e `plano_tarefas` são as DUAS tabelas em que o site escreve.
 *
 * No modo mock, nada escreve no banco: os formulários (Planos, perfil) operam
 * sobre cópias em memória só pra simular a experiência.
 */

import * as supa from "./supabase-data.js";
// A fila dos planos (`ordem asc → atualizado_em desc → …`) mora no format.js, que é
// a cópia da regra do servidor. O mock a usa pra ordenar do mesmo jeito que o banco.
import { ordenarPlanos } from "./format.js";

/**
 * Liga (true) os dados reais do Supabase; desliga (false) volta pro mock.
 * Padrão: true (integração ativa). Vire pra false pra demonstrar com o mock.
 *
 * ⭐ 28/ago/2026 — o MODO DEMONSTRAÇÃO desliga isto sozinho. Quando a aba entrou
 * pelo login de demonstração (`js/demo/demo.js`), o painel inteiro precisa rodar
 * de dados em memória, e este já é o interruptor que faz exatamente isso: todo
 * o roteamento abaixo, mais os exemplos locais de `campo-ia.js`, `captura.js` e
 * `material/link.js`, obedecem a esta flag. Reaproveitá-la é o que evita um
 * segundo caminho paralelo — e um `if (demo)` dentro de cada tela.
 *
 * Constante de propósito: o modo é decidido no login, antes deste módulo
 * carregar, e não muda no meio da sessão.
 */
export const USAR_SUPABASE = !(
  typeof window !== "undefined" &&
  window.cognifyDemo &&
  window.cognifyDemo.ativo()
);

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
  // Código FIXO do perfil (6 chars, alfabeto sem 0/O/1/I). Quem gera é o robô,
  // no nascimento do perfil. Entrou no mock em 26/ago/2026, quando as
  // Configurações passaram a lê-lo da própria linha da criança em vez de buscar
  // no servidor local — sem ele, a tela de demonstração mostraria "Indisponível"
  // justamente no card que explica o vínculo.
  codigo_pareamento: "K7H2QM",
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
    ordem: 1000,
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
    ordem: 2000,
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
    ordem: 3000,
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
    ordem: 4000,
    criado_em: "2026-04-01T08:00:00-03:00",
    atualizado_em: "2026-04-21T08:00:00-03:00",
  },
  {
    // O plano que a IA montou de uma foto e o pai ainda NÃO aprovou. Nasce
    // `rascunho` de propósito: o servidor já ignora tudo que não é ativo/em
    // andamento, então a trava de aprovação custou zero linha no robô.
    id: 25,
    crianca_id: crianca.id,
    responsavel_id: responsavel.id,
    titulo: "Atividades da semana",
    conteudo:
      "Terminar a lista de frações e ler o capítulo do livro de português " +
      "antes da entrega de sexta.",
    foco: "matematica",
    duracao_dias: 7,
    status: "rascunho",
    ordem: 5000,
    origem: "foto",
    extraido_texto:
      "AGENDA 26/05\nMat: exercícios pág. 42 e 43 (frações equivalentes)\n" +
      "Port: ler cap. 3 do livro e responder as 5 perguntas\nEntregar sexta",
    criado_em: "2026-05-26T20:10:00-03:00",
    atualizado_em: "2026-05-26T20:10:00-03:00",
  },
];

/**
 * Os cards do quadro — espelham `plano_tarefas` (Mesa de Estudos).
 *
 * O conjunto é escolhido pra exercitar a tela inteira sem banco: um card movido
 * pela Cogni (selo ✨ + Desfazer + a evidência que explica o porquê), um com
 * confiança baixa (chip "confira"), um prazo atrasado, um prazo "hoje", e as três
 * colunas com conteúdo. `ordem` já nasce com o gap de 1000.
 */
let tarefas = [
  {
    id: 101,
    plano_id: 22,
    crianca_id: crianca.id,
    titulo: "Tabuada do 7",
    detalhe: "Do 7×1 ao 7×10, em voz alta com a Cogni",
    materia: "matematica",
    coluna: "a_fazer",
    ordem: 1000,
    prazo: "2026-05-29",
    estimativa_min: 15,
    origem: "pai",
    movida_por: null,
    movida_em: null,
    evidencia: null,
    confianca: null,
    concluida_em: null,
    criado_em: "2026-05-18T11:00:00-03:00",
    atualizado_em: "2026-05-18T11:00:00-03:00",
  },
  {
    id: 102,
    plano_id: 22,
    crianca_id: crianca.id,
    titulo: "Ler o capítulo 3",
    detalhe: "E contar pra Cogni a parte de que mais gostou",
    materia: "portugues",
    coluna: "a_fazer",
    ordem: 2000,
    prazo: "2026-05-25",
    estimativa_min: 20,
    origem: "ia_foto",
    movida_por: null,
    movida_em: null,
    evidencia: null,
    // Abaixo de 0.6 → a tela marca "confira". Letra de mão apagada na foto.
    confianca: 0.42,
    concluida_em: null,
    criado_em: "2026-05-20T19:40:00-03:00",
    atualizado_em: "2026-05-20T19:40:00-03:00",
  },
  {
    id: 103,
    plano_id: 22,
    crianca_id: crianca.id,
    titulo: "Desafio dos dobros",
    detalhe: null,
    materia: "matematica",
    coluna: "a_fazer",
    ordem: 3000,
    prazo: null,
    estimativa_min: 10,
    origem: "pai",
    movida_por: null,
    movida_em: null,
    evidencia: null,
    confianca: null,
    concluida_em: null,
    criado_em: "2026-05-21T09:00:00-03:00",
    atualizado_em: "2026-05-21T09:00:00-03:00",
  },
  {
    // O card que a Cogni moveu sozinha enquanto a criança conversava.
    id: 104,
    plano_id: 22,
    crianca_id: crianca.id,
    titulo: "Frações página 42",
    detalhe: "Páginas 42 e 43",
    materia: "matematica",
    coluna: "fazendo",
    ordem: 1000,
    prazo: "2026-05-27",
    estimativa_min: 25,
    origem: "ia_foto",
    movida_por: "cogni",
    movida_em: "2026-05-27T18:42:00-03:00",
    evidencia: {
      motivo: "conversa",
      conceito: "fracoes equivalentes",
      em: "2026-05-27T18:42:00-03:00",
    },
    confianca: 0.88,
    concluida_em: null,
    criado_em: "2026-05-20T19:40:00-03:00",
    atualizado_em: "2026-05-27T18:42:00-03:00",
  },
  {
    id: 105,
    plano_id: 22,
    crianca_id: crianca.id,
    titulo: "Porcentagem no dia a dia",
    detalhe: "Descontos da lista de compras",
    materia: "matematica",
    coluna: "feito",
    ordem: 1000,
    prazo: null,
    estimativa_min: 15,
    origem: "pai",
    movida_por: "cogni",
    movida_em: "2026-05-26T18:05:00-03:00",
    evidencia: {
      motivo: "pratica",
      conceito: "porcentagem",
      acertos: 2,
      em: "2026-05-26T18:05:00-03:00",
    },
    confianca: null,
    concluida_em: "2026-05-26T18:05:00-03:00",
    criado_em: "2026-05-19T09:00:00-03:00",
    atualizado_em: "2026-05-26T18:05:00-03:00",
  },
  {
    id: 106,
    plano_id: 22,
    crianca_id: crianca.id,
    titulo: "Lista de somas",
    detalhe: null,
    materia: "matematica",
    coluna: "feito",
    ordem: 2000,
    prazo: null,
    estimativa_min: null,
    origem: "pai",
    movida_por: null,
    movida_em: null,
    evidencia: null,
    confianca: null,
    concluida_em: "2026-05-24T17:20:00-03:00",
    criado_em: "2026-05-18T11:00:00-03:00",
    atualizado_em: "2026-05-24T17:20:00-03:00",
  },
  /* --- Cards do plano 21 ("Leitura divertida"), o primeiro da fila ---------
     Este é o plano que a Mesa abre por padrão. Sem cards aqui, a tela mais
     visual do painel abria com as TRÊS colunas vazias — e "Nada esperando
     aqui" é a primeira coisa que alguém vê da Mesa de Estudos. Os cards
     conversam com o resto do exemplo: é o mesmo capítulo que o Pedro anda
     lendo, e a redação que ele pediu ajuda no Diário. */
  {
    id: 109,
    plano_id: 21,
    crianca_id: crianca.id,
    titulo: "Ler 15 minutos por dia",
    detalhe: "Um trecho do livro dos dinossauros, em voz alta",
    materia: "portugues",
    coluna: "a_fazer",
    ordem: 1000,
    prazo: "2026-05-30",
    estimativa_min: 15,
    origem: "pai",
    movida_por: null,
    movida_em: null,
    evidencia: null,
    confianca: null,
    concluida_em: null,
    criado_em: "2026-05-19T08:30:00-03:00",
    atualizado_em: "2026-05-19T08:30:00-03:00",
  },
  {
    id: 110,
    plano_id: 21,
    crianca_id: crianca.id,
    titulo: "Caça-palavras dos animais",
    detalhe: null,
    materia: "portugues",
    coluna: "a_fazer",
    ordem: 2000,
    prazo: null,
    estimativa_min: 10,
    origem: "pai",
    movida_por: null,
    movida_em: null,
    evidencia: null,
    confianca: null,
    concluida_em: null,
    criado_em: "2026-05-21T18:15:00-03:00",
    atualizado_em: "2026-05-21T18:15:00-03:00",
  },
  {
    // A Cogni moveu sozinha: o Pedro pediu ajuda com a redação hoje (Diário).
    id: 111,
    plano_id: 21,
    crianca_id: crianca.id,
    titulo: "Escrever sobre o dia favorito",
    detalhe: "Cinco linhas, do jeito dele",
    materia: "portugues",
    coluna: "fazendo",
    ordem: 1000,
    prazo: "2026-05-28",
    estimativa_min: 20,
    origem: "pai",
    movida_por: "cogni",
    movida_em: "2026-05-27T18:35:00-03:00",
    evidencia: {
      motivo: "conversa",
      conceito: "redação",
      em: "2026-05-27T18:35:00-03:00",
    },
    confianca: null,
    concluida_em: null,
    criado_em: "2026-05-20T09:10:00-03:00",
    atualizado_em: "2026-05-27T18:35:00-03:00",
  },
  {
    id: 112,
    plano_id: 21,
    crianca_id: crianca.id,
    titulo: "Contar a história pra Cogni",
    detalhe: "O capítulo do T-Rex, com as próprias palavras",
    materia: "portugues",
    coluna: "feito",
    ordem: 1000,
    prazo: null,
    estimativa_min: 15,
    origem: "pai",
    movida_por: "cogni",
    movida_em: "2026-05-25T17:05:00-03:00",
    evidencia: {
      motivo: "conversa",
      conceito: "interpretação de texto",
      em: "2026-05-25T17:05:00-03:00",
    },
    confianca: null,
    concluida_em: "2026-05-25T17:05:00-03:00",
    criado_em: "2026-05-18T10:00:00-03:00",
    atualizado_em: "2026-05-25T17:05:00-03:00",
  },
  /* --- Cards do rascunho vindo de foto (plano 25) --- */
  {
    id: 107,
    plano_id: 25,
    crianca_id: crianca.id,
    titulo: "Exercícios de frações",
    detalhe: "Páginas 42 e 43",
    materia: "matematica",
    coluna: "a_fazer",
    ordem: 1000,
    prazo: "2026-05-29",
    estimativa_min: 30,
    origem: "ia_foto",
    movida_por: null,
    movida_em: null,
    evidencia: null,
    confianca: 0.91,
    concluida_em: null,
    criado_em: "2026-05-26T20:10:00-03:00",
    atualizado_em: "2026-05-26T20:10:00-03:00",
  },
  {
    id: 108,
    plano_id: 25,
    crianca_id: crianca.id,
    titulo: "Ler o capítulo 3 e responder",
    detalhe: "5 perguntas no fim do capítulo",
    materia: "portugues",
    coluna: "a_fazer",
    ordem: 2000,
    prazo: "2026-05-29",
    estimativa_min: 40,
    origem: "ia_foto",
    movida_por: null,
    movida_em: null,
    evidencia: null,
    confianca: 0.55,
    concluida_em: null,
    criado_em: "2026-05-26T20:10:00-03:00",
    atualizado_em: "2026-05-26T20:10:00-03:00",
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
    "a cada conversa. Continue incentivando essas perguntas!",
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

/* ==========================================================================
   "Agora" do mock — a data de referência pra os rótulos relativos
   ("Hoje"/"Ontem") baterem com os dados de exemplo acima.
   ========================================================================== */

/**
 * A data em que os exemplos acima foram escritos. É a âncora ORIGINAL: todas as
 * datas literais deste arquivo foram compostas em relação a ela.
 */
const MOCK_ANCORA = "2026-05-27T19:00:00-03:00";

/**
 * Quantos dias inteiros separam a âncora do dia de hoje.
 *
 * ⭐ 28/ago/2026 — POR QUE ISTO EXISTE. As datas de exemplo eram fixas, e um mock
 * com data fixa envelhece em silêncio: os rótulos relativos continuavam certos
 * (o painel lê `getNow()`, que devolvia a âncora), mas o Diário imprime a data
 * ABSOLUTA nos separadores de dia — então, meses depois, a tela mostrava "Hoje"
 * e "Ontem" e logo abaixo "25 de maio". Deslizar a âncora até hoje conserta os
 * dois de uma vez, sem tocar em nenhuma das 60+ datas escritas à mão.
 *
 * Em DIAS INTEIROS de propósito: preserva a hora e o fuso de cada registro
 * (18:32 continua 18:32), então a linha do tempo de um dia não se embaralha.
 */
const DESLIZE_DIAS = (() => {
  const hoje = new Date();
  const base = new Date(MOCK_ANCORA);
  const emDias = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((emDias(hoje) - emDias(base)) / 86400000);
})();

/** Zero-pad de 2 dígitos, pra remontar a data ISO. */
const pad2 = (n) => String(n).padStart(2, "0");

/**
 * Desliza a parte da DATA de um timestamp ISO, mantendo hora e offset intactos.
 *
 * Trabalha na string, e não em milissegundos, porque somar `dias * 86400000` a
 * um `Date` escorrega uma hora quando a janela atravessa uma virada de horário
 * de verão — e o resultado seria "18:32" virar "17:32" só em parte dos registros.
 *
 * Aceita as DUAS formas que as fixtures usam: o timestamp completo
 * (`criado_em`, `visto`, `movida_em`) e a data pura dos prazos (`prazo:
 * "2026-05-29"`). Deixar a data pura de fora era um buraco silencioso: os
 * timestamps chegavam em hoje e só os prazos ficavam três meses atrás, o que
 * pintaria o quadro inteiro de "atrasado".
 *
 * @param {string} iso — ex.: "2026-05-25T17:22:00-03:00" ou "2026-05-29"
 * @returns {string} a mesma data, deslizada; ou a entrada, se não for ISO.
 */
function deslizarISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + DESLIZE_DIAS);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(
    d.getUTCDate()
  )}${m[4]}`;
}

/** Reconhece uma data ISO (com ou sem hora) — é o que decide o que deslizar. */
const EH_ISO = /^\d{4}-\d{2}-\d{2}(T|$)/;

/**
 * Percorre a estrutura e desliza toda string de data que encontrar, no lugar.
 *
 * Genérico (varre por FORMATO, não por lista de campos) pra um campo de data
 * novo em qualquer fixture já nascer deslizado — uma allowlist de nomes seria
 * mais uma lista pra alguém esquecer de atualizar.
 */
function deslizarDatas(alvo) {
  if (Array.isArray(alvo)) {
    alvo.forEach(deslizarDatas);
    return;
  }
  if (!alvo || typeof alvo !== "object") return;
  for (const [chave, valor] of Object.entries(alvo)) {
    if (typeof valor === "string" && EH_ISO.test(valor)) {
      alvo[chave] = deslizarISO(valor);
    } else if (valor && typeof valor === "object") {
      deslizarDatas(valor);
    }
  }
}

// Só no modo mock: em produção nada disto é lido, e varrer as fixtures à toa a
// cada carregamento do painel seria trabalho para ninguém.
if (!USAR_SUPABASE && DESLIZE_DIAS !== 0) {
  deslizarDatas([responsavel, crianca, conversas, planos, tarefas, dicas, resumoSemanal]);
}

/**
 * "Agora" do mock, já deslizado pra hoje — é o que `getNow()` devolve e o que
 * todas as telas usam pra escrever "Hoje", "Ontem" e a janela da semana.
 */
export const MOCK_NOW = new Date(deslizarISO(MOCK_ANCORA));

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

/**
 * Os planos na ORDEM DA FILA, igual ao modo real.
 *
 * A ordenação vive no `format.js` (`ordenarPlanos`) e é usada aqui de propósito: o
 * modo mock existe pra a tela ser testada sem banco, e uma fila que só o Supabase
 * sabe montar deixaria justamente o arraste — o que esta rodada acrescentou —
 * impossível de conferir no demo.
 */
async function _mockPlanos() {
  await delay();
  return ordenarPlanos(planos).map((p) => ({ ...p }));
}

/** Muda a posição de um plano na fila (mock). Espelha `reordenarPlano` do real. */
async function _mockReordenarPlano(id, ordem) {
  await delay(60);
  const i = planos.findIndex((p) => String(p.id) === String(id));
  if (i === -1) return null;
  // Sem tocar em `atualizado_em`, como no modo real: reordenar não é editar.
  planos[i] = { ...planos[i], ordem: Number(ordem) };
  return { ...planos[i] };
}

async function _mockReindexarPlanos(novas) {
  const linhas = [];
  for (const n of novas || []) {
    const linha = await _mockReordenarPlano(n.id, n.ordem);
    if (linha) linhas.push(linha);
  }
  return linhas;
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

/* --- API pública de leitura (roteia mock ↔ Supabase pela flag) ------------ */

/** @returns {Promise<object>} o responsável logado (linha de `responsaveis`). */
export async function getResponsavel() {
  return USAR_SUPABASE ? supa.getResponsavel() : _mockResponsavel();
}

/**
 * @param {object} [opcoes]
 * @param {boolean} [opcoes.fresco=false] — pula o cache curto da implementação
 *   real (o mock não tem cache, então aqui o parâmetro não muda nada).
 * @returns {Promise<object|null>} a criança pareada (linha de `criancas`),
 * ou null se nenhuma estiver pareada. (Single-child: nunca uma lista.)
 */
export async function getCrianca(opcoes) {
  return USAR_SUPABASE ? supa.getCrianca(opcoes) : _mockCrianca();
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
    // O default da coluna no banco. Plano novo nasce empatado com quem nunca foi
    // arrastado, e o desempate por recência o coloca no topo — o site não manda
    // `ordem` no insert justamente pra não divergir desse default.
    ordem: 1000,
    // Mesma regra do modo real: `origem` tem default no banco e o texto extraído
    // só existe em plano vindo de foto.
    origem: dados.origem || "manual",
    extraido_texto: dados.extraido_texto || null,
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

/* --- Quadro da Mesa de Estudos (mock) ------------------------------------ */

const COLUNAS_TAREFA = ["a_fazer", "fazendo", "feito"];

function nextTarefaId() {
  return tarefas.reduce((max, t) => Math.max(max, t.id), 100) + 1;
}

/** Mesma ordenação de três critérios do modo real (coluna, ordem, id). */
function ordenarTarefas(lista) {
  const peso = (t) => COLUNAS_TAREFA.indexOf(t.coluna);
  return lista.slice().sort((a, b) => {
    if (peso(a) !== peso(b)) return peso(a) - peso(b);
    if (a.ordem !== b.ordem) return a.ordem - b.ordem;
    return a.id - b.id;
  });
}

async function _mockTarefas(planoId) {
  await delay();
  const lista = planoId == null ? tarefas : tarefas.filter((t) => t.plano_id === planoId);
  return ordenarTarefas(lista).map((t) => ({ ...t }));
}

async function _mockCriarTarefa(dados) {
  await delay(80);
  const agora = MOCK_NOW.toISOString();
  const tarefa = {
    id: nextTarefaId(),
    plano_id: dados.plano_id,
    crianca_id: crianca.id,
    titulo: dados.titulo || "Nova tarefa",
    detalhe: dados.detalhe || null,
    materia: dados.materia || null,
    coluna: COLUNAS_TAREFA.includes(dados.coluna) ? dados.coluna : "a_fazer",
    ordem: Number.isFinite(Number(dados.ordem)) ? Number(dados.ordem) : 1000,
    prazo: dados.prazo || null,
    estimativa_min: dados.estimativa_min == null ? null : Number(dados.estimativa_min),
    origem: dados.origem || "pai",
    movida_por: null,
    movida_em: null,
    evidencia: null,
    confianca: dados.confianca == null ? null : Number(dados.confianca),
    concluida_em: null,
    criado_em: agora,
    atualizado_em: agora,
  };
  tarefas.push(tarefa);
  return { ...tarefa };
}

async function _mockAtualizarTarefa(id, patch) {
  await delay(80);
  const i = tarefas.findIndex((t) => t.id === id);
  if (i === -1) return null;
  tarefas[i] = { ...tarefas[i], ...patch, atualizado_em: MOCK_NOW.toISOString() };
  return { ...tarefas[i] };
}

async function _mockMoverTarefa(id, { coluna, ordem } = {}) {
  await delay(60);
  const i = tarefas.findIndex((t) => t.id === id);
  if (i === -1) return null;
  const agora = MOCK_NOW.toISOString();
  // Espelha o modo real: quem move pelo site é o PAI, então o selo ✨ da Cogni
  // apaga, e `concluida_em` acompanha a coluna nos dois sentidos.
  tarefas[i] = {
    ...tarefas[i],
    coluna,
    ordem: Number(ordem),
    movida_por: null,
    movida_em: null,
    concluida_em: coluna === "feito" ? agora : null,
    atualizado_em: agora,
  };
  return { ...tarefas[i] };
}

async function _mockRemoverTarefa(id) {
  await delay(80);
  const antes = tarefas.length;
  tarefas = tarefas.filter((t) => t.id !== id);
  return tarefas.length < antes;
}

async function _mockCriarPlanoComTarefas(plano, lista) {
  const criado = await _mockCriarPlano(plano);
  // O mock não simula a falha do 2º insert (nem o rollback): a diferença é do
  // banco, não da tela, e simular erro no modo de demonstração só atrapalharia.
  const cards = [];
  for (const [i, t] of (lista || []).entries()) {
    cards.push(
      await _mockCriarTarefa({
        ...t,
        plano_id: criado.id,
        ordem: Number.isFinite(Number(t.ordem)) ? Number(t.ordem) : (i + 1) * 1000,
      })
    );
  }
  return { ...criado, tarefas: cards };
}

async function _mockAprovarPlano(id) {
  return _mockAtualizarPlano(id, { status: "ativo" });
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

/* --- A prioridade dos planos (`planos_estudo.ordem`) ⭐ 16/ago/2026 -------
   O pai arrasta a faixa da Mesa e diz por onde a Cogni COMEÇA. É a mesma mecânica
   fracionária dos cards do quadro: soltar entre dois grava a média dos vizinhos,
   1 UPDATE por movimento. */

/**
 * Muda a posição de um plano na fila. Grava só `ordem` — nunca `atualizado_em`,
 * que é o critério de desempate.
 * @param {number} id
 * @param {number} ordem — fracionária, vinda do `dnd.js`
 * @returns {Promise<object|null>}
 */
export async function reordenarPlano(id, ordem) {
  return USAR_SUPABASE ? supa.reordenarPlano(id, ordem) : _mockReordenarPlano(id, ordem);
}

/**
 * Reescreve a fila em 1000, 2000, 3000… — só quando o gap fracionário acabou.
 * @param {Array<{id:number|string, ordem:number}>} novas
 * @returns {Promise<Array<object>>}
 */
export async function reindexarPlanos(novas) {
  return USAR_SUPABASE ? supa.reindexarPlanos(novas) : _mockReindexarPlanos(novas);
}

/**
 * A falha veio de a coluna `ordem` ainda não existir no banco (o SQL desta rodada
 * não foi rodado)? A tela usa pra dizer *"a prioridade ainda não está disponível"*
 * em vez de "não consegui salvar", que mandaria o pai tentar de novo pra sempre.
 * No modo mock nunca é verdade — lá a coluna existe por construção.
 * @param {any} err
 * @returns {boolean}
 */
export function ehPrioridadeIndisponivel(err) {
  return USAR_SUPABASE ? supa.ehPrioridadeIndisponivel(err) : false;
}

/**
 * A prioridade está funcionando neste banco? `false` depois de a válvula desligar
 * a ordenação — a tela para de prometer um arraste que o banco recusa.
 * @returns {boolean}
 */
export function prioridadeDePlanosAtiva() {
  return USAR_SUPABASE ? supa.prioridadeDePlanosAtiva() : true;
}

/* --- Quadro da Mesa de Estudos (`plano_tarefas`) ⭐ ago/2026 --------------
   A segunda tabela em que o site escreve. Toda escrita daqui também avisa o
   robô (`pingPlanosAtualizados`), mas isso mora na camada de dados real — o
   modo mock não anuncia cards que só existem na memória do navegador. */

/**
 * Cards do quadro. Sem `planoId`, todos os da criança; com `planoId`, só os
 * daquele plano — que é o quadro que a tela mostra.
 * @param {number} [planoId]
 * @returns {Promise<Array<object>>}
 */
export async function getTarefas(planoId) {
  return USAR_SUPABASE ? supa.getTarefas(planoId) : _mockTarefas(planoId);
}

/**
 * Cria um card. `ordem` é obrigatória no banco — sempre mande.
 * @param {object} dados
 * @returns {Promise<object>}
 */
export async function criarTarefa(dados) {
  return USAR_SUPABASE ? supa.criarTarefa(dados) : _mockCriarTarefa(dados);
}

/**
 * Edita texto/metadados de um card. Pra trocar de coluna, use `moverTarefa`.
 * @param {number} id
 * @param {object} patch
 * @returns {Promise<object|null>}
 */
export async function atualizarTarefa(id, patch) {
  return USAR_SUPABASE
    ? supa.atualizarTarefa(id, patch)
    : _mockAtualizarTarefa(id, patch);
}

/**
 * Move um card de coluna/posição. Limpa `movida_por` (foi o pai, não a Cogni) e
 * acerta `concluida_em` conforme a coluna.
 * @param {number} id
 * @param {{coluna: string, ordem: number}} destino
 * @returns {Promise<object|null>}
 */
export async function moverTarefa(id, destino) {
  return USAR_SUPABASE ? supa.moverTarefa(id, destino) : _mockMoverTarefa(id, destino);
}

/**
 * Apaga um card.
 * @param {number} id
 * @returns {Promise<boolean>}
 */
export async function removerTarefa(id) {
  return USAR_SUPABASE ? supa.removerTarefa(id) : _mockRemoverTarefa(id);
}

/**
 * Cria um plano já com o quadro — o que a revisão da foto grava ao aprovar.
 * @param {object} plano
 * @param {Array<object>} tarefasNovas
 * @returns {Promise<object>} o plano criado, com `tarefas` anexadas
 */
export async function criarPlanoComTarefas(plano, tarefasNovas) {
  return USAR_SUPABASE
    ? supa.criarPlanoComTarefas(plano, tarefasNovas)
    : _mockCriarPlanoComTarefas(plano, tarefasNovas);
}

/**
 * Aprova um plano vindo de foto: `rascunho` → `ativo`. É a trava de aprovação —
 * nada que a IA leu chega ao robô sem o pai ver.
 * @param {number} id
 * @returns {Promise<object|null>}
 */
export async function aprovarPlano(id) {
  return USAR_SUPABASE ? supa.aprovarPlano(id) : _mockAprovarPlano(id);
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

/* ==========================================================================
   Vínculo pai ↔ criança (pareamento) ⭐ 26/ago/2026

   Passou a morar aqui quando o pareamento saiu do servidor local e virou RPC no
   Supabase (o porquê está em `servidor.js` e em `supabase-data.js`). Ficar na
   camada de dados, e não na tela do onboarding, é o que deixa o portão funcionar
   igual nos dois modos — inclusive na demonstração com `USAR_SUPABASE = false`,
   onde não há robô nenhum pra parear.
   ========================================================================== */

/**
 * Vincula ao responsável logado a criança dona do código.
 * @param {string} codigo — 6 caracteres (espaço/hífen/caixa tolerados)
 * @returns {Promise<{ok:boolean, jaPareado?:boolean, criancaId?:string, nome?:string, motivo?:string}>}
 */
export async function parearPorCodigo(codigo) {
  return USAR_SUPABASE ? supa.parearPorCodigo(codigo) : _mockParear(codigo);
}

/**
 * Desfaz o vínculo (o pai escolheu desconectar este perfil).
 * @param {string} criancaId
 * @returns {Promise<{ok:boolean, jaDesvinculado?:boolean, motivo?:string}>}
 */
export async function desvincularCrianca(criancaId) {
  return USAR_SUPABASE
    ? supa.desvincularCrianca(criancaId)
    : _mockDesvincular(criancaId);
}

/**
 * Robôs vivos e com a janela de pareamento aberta (a lista de candidatos do
 * portão). Nunca lança e nunca pareia nada — só lista.
 * @returns {Promise<Array<{apelido:string, visto_em:string}>>}
 */
export async function getRobosDisponiveis() {
  return USAR_SUPABASE ? supa.getRobosDisponiveis() : _mockRobos();
}

/**
 * Mensagem em PT-BR pro motivo de falha do pareamento. Vive na camada de dados
 * (e não na tela) porque os motivos são o contrato da RPC — quem muda um, muda
 * o outro no mesmo lugar.
 * @param {string} motivo
 * @returns {string}
 */
export function mensagemDeErroDePareamento(motivo) {
  return supa.mensagemDeErroDePareamento(motivo);
}

/** No mock, o único código que "existe" é o da criança de exemplo. */
async function _mockParear(codigo) {
  await delay();
  const digitado = String(codigo || "")
    .replace(/[\s-]/g, "")
    .toUpperCase();
  if (digitado !== crianca.codigo_pareamento) {
    return { ok: false, motivo: "codigo_invalido" };
  }
  return {
    ok: true,
    jaPareado: false,
    criancaId: crianca.id,
    nome: crianca.nome,
    idade: crianca.idade,
    serie: crianca.serie,
  };
}

async function _mockDesvincular() {
  await delay();
  // Não zera a criança de exemplo: o mock existe pra demonstrar telas cheias, e
  // um desvincular "de verdade" deixaria a demonstração num portão vazio.
  return { ok: true, jaDesvinculado: false };
}

/**
 * Um candidato de exemplo, pra a lista do portão ter o que mostrar na demo.
 *
 * ⚠️ Este é o único mock ancorado no relógio REAL, e não em `MOCK_NOW`. Um
 * heartbeat é "o robô está de pé AGORA", e a tela o compara com `Date.now()`
 * pra escrever "vista agora" — com a data fixa dos outros dados de exemplo, o
 * card anunciava "vista há 131094 min", que é o mock mentindo sobre si mesmo.
 * O resto do mock continua em `MOCK_NOW`: aquilo é histórico, isto é presença.
 */
async function _mockRobos() {
  await delay();
  return [
    {
      apelido: "cogni-da-sala",
      visto_em: new Date(Date.now() - 20 * 1000).toISOString(),
    },
  ];
}
