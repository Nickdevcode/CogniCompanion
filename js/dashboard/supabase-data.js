/**
 * supabase-data.js — Implementação REAL da camada de dados do painel.
 *
 * Espelha 1:1 a API do mock-data.js (mesmas funções, mesmas assinaturas e o
 * MESMO shape de retorno, em snake_case), mas lê/escreve no Supabase via
 * `window.cognifyAuth.getClient()`. Trocar o mock por isto NÃO exige mudar
 * nenhuma seção do painel — é essa a razão de manter os contratos idênticos.
 *
 * Regras do contrato (docs/COMPANION-PLANO-TECNICO.md):
 *   - Single-child: o pai enxerga UMA criança (a pareada por código). A query
 *     filtra por `responsavel_id = auth.uid()` e a RLS garante o isolamento.
 *   - `conversas` é READ-ONLY pelo site (a RLS bloqueia escrita; quem grava é o
 *     servidor). Aqui só há SELECT.
 *   - `planos_estudo`: CRUD direto (anon key + RLS). `responsavel_id` é NOT NULL
 *     no banco → sempre enviar o `auth.uid()` ao criar.
 *   - `plano_tarefas` (Mesa de Estudos, ago/2026): CRUD direto, mesma policy de
 *     `planos_estudo`. É a segunda e última tabela em que o site escreve. O
 *     servidor também escreve nela, mas SÓ a coluna (`moverTarefa()`).
 *   - O pareamento (setar `responsavel_id`) NUNCA acontece aqui: é só pelo
 *     endpoint do servidor (service_role). Ver onboarding.js.
 *
 * Erros: as funções de leitura lançam em falha real de query (o router do painel
 * já trata exibindo a tela de erro). `getCrianca` devolve `null` quando não há
 * criança pareada — é um estado válido (dispara o onboarding), não um erro.
 *
 * Escrita em `planos_estudo` também avisa o servidor local (ver `avisarRobo`
 * abaixo). Fica AQUI, e não nas seções, porque é a escrita real que precisa ser
 * anunciada: no modo mock (`USAR_SUPABASE = false`) nada disto roda, e nenhum
 * ping é disparado por um plano que só existe na memória do navegador.
 */

import { pingPlanosAtualizados } from "./servidor.js";

/** Cliente Supabase compartilhado (criado em js/supabase-config.js). */
function client() {
  const c = window.cognifyAuth && window.cognifyAuth.getClient();
  if (!c) {
    throw new Error(
      "Supabase não está configurado (window.cognifyAuth.getClient() vazio)."
    );
  }
  return c;
}

/** Usuário logado (responsável). Lança se não houver sessão — o painel é privado. */
async function currentUser() {
  const user = window.cognifyAuth && (await window.cognifyAuth.getUser());
  if (!user) throw new Error("Sem sessão ativa.");
  return user;
}

/**
 * Linha do responsável logado (tabela `responsaveis`). A RLS garante que só
 * volta a própria linha. Cai num objeto mínimo (id/nome dos metadados) se a
 * linha ainda não existir — não deve acontecer (o trigger cria no signup), mas
 * evita quebrar a tela de Configurações.
 * @returns {Promise<object>}
 */
export async function getResponsavel() {
  const user = await currentUser();
  const { data, error } = await client()
    .from("responsaveis")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;
  // Fallback defensivo: monta a partir da sessão.
  return {
    id: user.id,
    nome:
      (window.cognifyAuth && window.cognifyAuth.getDisplayName(user)) ||
      (user.email ? user.email.split("@")[0] : "Responsável"),
    email: user.email || "",
    criado_em: user.created_at || null,
  };
}

/**
 * Cache curto da criança pareada.
 *
 * Toda leitura daqui precisa do id da criança, e cada seção dispara várias de
 * uma vez (o Início chama conversas + planos + dica + resumo). Sem cache, cada
 * uma refazia o mesmo SELECT em `criancas`: 8 requisições onde 5 bastam.
 *
 * O TTL é curto DE PROPÓSITO. O perfil muda por fora do site — o robô grava
 * memórias e a trilha de aprendizado (`progresso`) a cada conversa —, então uma
 * tela aberta depois tem que enxergar o dado novo. Aqui o cache só coalesce as
 * chamadas de um mesmo render.
 *
 * Quem edita o perfil (Configurações) não pode se contentar nem com 10s: desde
 * 15/ago/2026 o robô escreve nos MESMOS campos que o pai edita (perfil por voz,
 * `prompt_personalizado` incluído) e o conflito é resolvido por "última escrita
 * vence". Formulário montado em cima de uma linha velha apaga o que foi ditado
 * sem ninguém ver. Por isso existe o `{ fresco: true }` abaixo.
 */
const TTL_CRIANCA_MS = 10000;

/** @type {{promessa: Promise<object|null>, gravadaEm: number}|null} */
let criancaCache = null;

/** Descarta o cache (após escrever no perfil, pra reler o estado real). */
function invalidarCacheCrianca() {
  criancaCache = null;
}

/** O SELECT de verdade — sem cache. */
async function buscarCrianca() {
  const user = await currentUser();
  const { data, error } = await client()
    .from("criancas")
    .select("*")
    .eq("responsavel_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Criança pareada ao responsável logado (single-child). A RLS só devolve a
 * criança vinculada a ele. Resultado compartilhado por até `TTL_CRIANCA_MS`.
 * @param {object} [opcoes]
 * @param {boolean} [opcoes.fresco=false] — ignora o cache e vai ao banco. Use
 *   antes de montar um formulário do perfil: o robô também escreve nesses
 *   campos, e o que está na tela vira o que vai ser gravado.
 * @returns {Promise<object|null>} a criança, ou `null` se ainda não pareou
 *   (estado que dispara o onboarding de pareamento).
 */
export async function getCrianca({ fresco = false } = {}) {
  const agora = Date.now();
  if (!fresco && criancaCache && agora - criancaCache.gravadaEm < TTL_CRIANCA_MS) {
    return criancaCache.promessa;
  }
  const promessa = buscarCrianca();
  criancaCache = { promessa, gravadaEm: agora };
  // Falha não pode ficar grudada no cache (o painel ficaria "quebrado" por 10s
  // depois de uma piscada de rede): a próxima chamada tenta de novo.
  promessa.catch(() => {
    if (criancaCache && criancaCache.promessa === promessa) invalidarCacheCrianca();
  });
  return promessa;
}

/**
 * Conversas da criança pareada (o Diário), mais recentes primeiro. READ-ONLY.
 * Equivale a:
 *   from('conversas').select('*').eq('crianca_id', id)
 *     .order('criado_em', { ascending: false })
 * @returns {Promise<Array<object>>} (vazio se não há criança pareada)
 */
export async function getConversas() {
  const crianca = await getCrianca();
  if (!crianca) return [];
  const { data, error } = await client()
    .from("conversas")
    .select("*")
    .eq("crianca_id", crianca.id)
    .order("criado_em", { ascending: false });
  if (error) throw error;
  return data || [];
}

/* --------------------------------------------------------------------------
   A prioridade dos planos (`planos_estudo.ordem`) ⭐ 16/ago/2026
   -------------------------------------------------------------------------- */

/**
 * `undefined_column` do Postgres — a coluna citada na consulta não existe.
 *
 * É o código exato que sai enquanto o SQL desta rodada não foi rodado à mão no
 * Supabase. E aqui ele é traiçoeiro: `select('*')` sobrevive tranquilo a uma coluna
 * ausente, mas o `ORDER BY ordem` faz o Postgres recusar a consulta **inteira** — os
 * planos sumiriam da tela por causa de um detalhe de ordenação.
 */
const COLUNA_AUSENTE = "42703";

/**
 * O erro é "a prioridade ainda não existe neste banco"?
 *
 * Exportado porque a MENSAGEM é decisão da tela, não da camada de dados: um arraste
 * que falha por isto não é um erro do pai nem da rede, e dizer "não consegui salvar"
 * mandaria ele tentar de novo pra sempre.
 */
export function ehPrioridadeIndisponivel(err) {
  return !!err && err.code === COLUNA_AUSENTE;
}

/**
 * Desliga a ordenação por `ordem` pelo resto da sessão, no primeiro 42703.
 *
 * Mesma válvula do servidor (`modules/planos.js`), e pelo mesmo motivo: o SQL é
 * rodado à mão, então a janela entre o deploy e a migração é real. Sem ela, a Mesa
 * abriria vazia — o pior jeito de comunicar "falta rodar um SQL".
 */
let prioridadeDisponivel = true;

/** Avisa UMA vez por sessão. Repetir a cada leitura viraria ruído no console. */
function desligarPrioridade(err) {
  if (!prioridadeDisponivel) return;
  prioridadeDisponivel = false;
  console.warn(
    "[Companion] Prioridade de planos indisponível (%s). " +
      "Rode o SQL da coluna `planos_estudo.ordem`; até lá a fila cai no desempate antigo.",
    (err && err.message) || COLUNA_AUSENTE
  );
}

/** A prioridade está funcionando neste banco? (a tela usa pra não prometer arraste) */
export function prioridadeDePlanosAtiva() {
  return prioridadeDisponivel;
}

/**
 * Planos de estudo da criança pareada, **na ordem da fila**.
 *
 * `ordem asc → atualizado_em desc → criado_em desc → id desc` — a mesma sequência de
 * `porPrioridade()` no servidor. Não é preferência de tela: se as duas divergirem, o
 * pai vê o arraste funcionar e a Cogni seguir outra fila.
 *
 * @returns {Promise<Array<object>>} (vazio se não há criança pareada)
 */
export async function getPlanos() {
  const crianca = await getCrianca();
  if (!crianca) return [];
  const consulta = () =>
    client().from("planos_estudo").select("*").eq("crianca_id", crianca.id);

  if (prioridadeDisponivel) {
    const { data, error } = await desempatar(consulta().order("ordem", { ascending: true }));
    if (!error) return data || [];
    if (!ehPrioridadeIndisponivel(error)) throw error;
    // A coluna ainda não existe: refazemos a consulta AGORA (sem o retry, a tela
    // ficaria sem planos até o próximo render) e seguimos sem prioridade.
    desligarPrioridade(error);
  }

  const { data, error } = await desempatar(consulta());
  if (error) throw error;
  return data || [];
}

/** O desempate que vale nos dois caminhos — um só, pra eles não divergirem. */
function desempatar(q) {
  return q
    .order("atualizado_em", { ascending: false })
    .order("criado_em", { ascending: false })
    .order("id", { ascending: false });
}

/** O UPDATE cru de `ordem`. Sem aviso ao robô: quem chama decide quando avisar. */
async function gravarOrdem(id, ordem) {
  const { data, error } = await client()
    .from("planos_estudo")
    .update({ ordem: Number(ordem) })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) {
    if (ehPrioridadeIndisponivel(error)) desligarPrioridade(error);
    throw error;
  }
  return data || null;
}

/**
 * Muda a posição de um plano na fila — 1 UPDATE, na `ordem` e em mais nada.
 *
 * ⚠️ Não toca em `atualizado_em`, e isso é o ponto: `atualizado_em` é o critério de
 * DESEMPATE da fila, então carimbá-lo aqui faria "arrastar" mexer também na regra
 * que decide os empates. Editar um plano e reordenar um plano são coisas diferentes,
 * e desde esta rodada a tela trata as duas assim.
 *
 * @param {number} id
 * @param {number} ordem — fracionária (a média dos vizinhos, vinda do `dnd.js`)
 * @returns {Promise<object|null>} o plano atualizado, ou null se nada bateu (RLS)
 */
export async function reordenarPlano(id, ordem) {
  const linha = await gravarOrdem(id, ordem);
  if (linha) avisarRobo(linha.crianca_id);
  return linha;
}

/**
 * Reescreve a fila inteira em 1000, 2000, 3000… — só quando o gap fracionário
 * acabou (ver `precisaReindexar` no `dnd.js`). Raro por construção.
 *
 * Um aviso ao robô no fim, e não um por linha: são N escritas de um mesmo ato.
 *
 * @param {Array<{id:number|string, ordem:number}>} novas
 * @returns {Promise<Array<object>>} as linhas atualizadas
 */
export async function reindexarPlanos(novas) {
  const lista = Array.isArray(novas) ? novas : [];
  if (!lista.length) return [];
  const linhas = await Promise.all(lista.map((n) => gravarOrdem(n.id, n.ordem)));
  const vivas = linhas.filter(Boolean);
  if (vivas.length) avisarRobo(vivas[0].crianca_id);
  return vivas;
}

/**
 * Histórico das "Dicas da Cogni" da criança pareada (tela Aprendizado), mais
 * recentes primeiro. READ-ONLY: o servidor grava cada dica gerada; o site só lê.
 * Equivale a:
 *   from('dicas').select('*').eq('crianca_id', id)
 *     .order('criado_em', { ascending: false })
 * @returns {Promise<Array<object>>} (vazio se não há criança pareada)
 */
export async function getDicas() {
  const crianca = await getCrianca();
  if (!crianca) return [];
  const { data, error } = await client()
    .from("dicas")
    .select("*")
    .eq("crianca_id", crianca.id)
    .order("criado_em", { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Último Resumo Semanal salvo da criança pareada (tabela `resumos_semanais`).
 * READ-ONLY: o servidor grava cada resumo gerado (service_role); o site só lê.
 * Serve de fonte ESTÁVEL pro card de Resumo da Semana — mostra o último bilhete
 * mesmo com o robô offline, enquanto o endpoint /api/resumo-semanal atualiza
 * quando há conversa nova. Equivale a:
 *   from('resumos_semanais').select('*').eq('crianca_id', id)
 *     .order('criado_em', { ascending: false }).limit(1)
 * @returns {Promise<object|null>} o resumo mais recente, ou `null` se ainda não
 *   há nenhum (criança nunca conversou / servidor nunca gerou).
 */
export async function getResumoSemanal() {
  const crianca = await getCrianca();
  if (!crianca) return null;
  const { data, error } = await client()
    .from("resumos_semanais")
    .select("*")
    .eq("crianca_id", crianca.id)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Dica ATUAL da criança pareada: a linha mais recente da tabela `dicas`. READ-ONLY
 * (o servidor grava cada dica gerada; o site só lê). Serve de fonte ESTÁVEL pro
 * destaque "Dica de agora" — aparece mesmo com o robô offline, enquanto o endpoint
 * /api/dica refresca quando há conversa nova. Equivale a:
 *   from('dicas').select('*').eq('crianca_id', id)
 *     .order('criado_em', { ascending: false }).limit(1)
 * @returns {Promise<object|null>} a dica mais recente, ou `null` se a tabela ainda
 *   está vazia pra essa criança (nenhuma dica jamais gerada → fallback amigável).
 */
export async function getDicaAtual() {
  const crianca = await getCrianca();
  if (!crianca) return null;
  const { data, error } = await client()
    .from("dicas")
    .select("*")
    .eq("crianca_id", crianca.id)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Sessões de atenção da criança pareada — o histórico do Mapa de Compreensão da
 * Aula, mais recentes primeiro. READ-ONLY: quem grava é o servidor (service_role),
 * ao encerrar cada aula. Equivale a:
 *   from('sessoes_atencao').select('*').eq('crianca_id', id)
 *     .order('iniciada_em', { ascending: false }).limit(n)
 *
 * Fonte ESTÁVEL do Mapa: as aulas anteriores aparecem mesmo com o robô desligado,
 * e continuam na tela durante uma aula ao vivo (nessa hora o endpoint do servidor
 * devolve `historico: []`, porque prioriza a sessão em RAM).
 *
 * @param {number} [limite=10]
 * @returns {Promise<Array<object>>} (vazio se não há criança pareada)
 */
export async function getSessoesAtencao(limite = 10) {
  const crianca = await getCrianca();
  if (!crianca) return [];
  const { data, error } = await client()
    .from("sessoes_atencao")
    .select("*")
    .eq("crianca_id", crianca.id)
    .order("iniciada_em", { ascending: false })
    .limit(Math.min(Math.max(1, Number(limite) || 10), 50));
  if (error) throw error;
  return data || [];
}

/* ==========================================================================
   Escrita — Planos (CRUD) e perfil da criança. Conversas NÃO entram (RLS).
   ========================================================================== */

/**
 * Avisa o robô que os planos mudaram, sem que a falha do aviso atrapalhe nada:
 * o plano já está no Supabase e o ping só antecipa a chegada dele à conversa em
 * andamento. Nunca aguardado, nunca propaga erro (ver `pingPlanosAtualizados`).
 *
 * @param {string} [criancaId] — quando já se sabe de quem é o plano. Sem ele,
 *   resolve pela criança pareada (single-child), que costuma vir do cache.
 */
function avisarRobo(criancaId) {
  if (criancaId) {
    pingPlanosAtualizados(criancaId);
    return;
  }
  getCrianca()
    .then((crianca) => crianca && pingPlanosAtualizados(crianca.id))
    .catch(() => {
      /* sem criança ou sem rede: o robô pega no boot */
    });
}

/**
 * Monta o payload de INSERT de um plano. Extraído de `criarPlano` porque
 * `criarPlanoComTarefas` precisa exatamente do mesmo objeto — duas cópias
 * divergiriam no dia em que o contrato ganhasse mais um campo.
 * @param {object} dados
 * @param {object} crianca
 * @param {object} user
 * @returns {object}
 */
function payloadDePlano(dados, crianca, user) {
  const payload = {
    crianca_id: crianca.id,
    responsavel_id: user.id, // NOT NULL — sempre o dono logado
    titulo: dados.titulo || "Novo plano",
    conteudo: dados.conteudo || "",
    foco: dados.foco || "outros",
    duracao_dias: Number(dados.duracao_dias) || 0,
    status: dados.status || "ativo",
  };
  // `origem`/`extraido_texto` (ago/2026) só viajam quando existem: o default de
  // `origem` é 'manual' no banco, e mandar `extraido_texto: null` num plano
  // digitado é ruído.
  if (dados.origem) payload.origem = dados.origem;
  if (dados.extraido_texto) payload.extraido_texto = dados.extraido_texto;
  return payload;
}

/**
 * Cria um plano. Campos do contrato + as FKs. `responsavel_id` é NOT NULL no
 * banco → sempre o `auth.uid()`. `crianca_id` vem da criança pareada.
 * @param {object} dados — { titulo, conteudo, foco, duracao_dias, status,
 *   origem?, extraido_texto? }
 * @returns {Promise<object>} o plano criado (linha completa)
 */
export async function criarPlano(dados) {
  const user = await currentUser();
  const crianca = await getCrianca();
  if (!crianca) throw new Error("Sem criança pareada para criar o plano.");

  const { data, error } = await client()
    .from("planos_estudo")
    .insert(payloadDePlano(dados, crianca, user))
    .select()
    .single();
  if (error) throw error;
  avisarRobo(crianca.id);
  return data;
}

/**
 * Atualiza um plano existente. A RLS garante que só dá pra editar planos dos
 * próprios filhos. `crianca_id`/`responsavel_id` não são alterados aqui.
 * @param {number} id
 * @param {object} patch — { titulo, conteudo, foco, duracao_dias, status }
 * @returns {Promise<object|null>} o plano atualizado, ou null se nada bateu
 */
export async function atualizarPlano(id, patch) {
  const campos = {};
  // Allowlist explícita: campo fora dela é descartado em SILÊNCIO, então toda
  // coluna nova do contrato precisa ser acrescentada aqui também.
  //
  // ⚠️ `ordem` fica de fora DE PROPÓSITO: ela tem caminho próprio
  // (`reordenarPlano`), que não carimba `atualizado_em`. Deixá-la entrar aqui faria
  // qualquer edição de formulário poder reordenar a fila sem ninguém pedir — que é a
  // versão nova do bug que esta rodada veio matar.
  for (const k of [
    "titulo",
    "conteudo",
    "foco",
    "duracao_dias",
    "status",
    "origem",
    "extraido_texto",
  ]) {
    if (k in patch) campos[k] = patch[k];
  }
  if ("duracao_dias" in campos) {
    campos.duracao_dias = Number(campos.duracao_dias) || 0;
  }
  // O servidor do robô desempata planos vigentes por `atualizado_em`. Sem trigger
  // `moddatetime` no banco a coluna ficaria parada, então o site a escreve aqui.
  campos.atualizado_em = new Date().toISOString();
  const { data, error } = await client()
    .from("planos_estudo")
    .update(campos)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw error;
  // Sem linha atualizada não houve mudança pra anunciar (id inexistente ou RLS).
  if (data) avisarRobo(data.crianca_id);
  return data || null;
}

/**
 * Remove um plano. A RLS impede apagar plano de outro responsável.
 * @param {number} id
 * @returns {Promise<boolean>} true se removeu
 */
export async function removerPlano(id) {
  const { error, count } = await client()
    .from("planos_estudo")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw error;
  const removeu = (count || 0) > 0;
  // O DELETE não devolve a linha, então o id da criança vem do perfil pareado —
  // apagar o plano vigente muda o que a Cogni segue tanto quanto criá-lo.
  if (removeu) avisarRobo();
  return removeu;
}

/**
 * Atualiza o perfil da criança pareada (infos editáveis + prompt_personalizado).
 * NUNCA escreve `responsavel_id` nem `codigo_pareamento` (protegidos: o vínculo
 * é só via servidor). A RLS garante que o pai só edita os próprios filhos.
 * @param {object} patch — campos editáveis de `criancas`
 * @returns {Promise<object>} a criança atualizada
 */
export async function atualizarCrianca(patch) {
  const crianca = await getCrianca();
  if (!crianca) throw new Error("Sem criança pareada para editar.");

  // Allowlist dos campos que o pai pode editar pelo site (contrato).
  const EDITAVEIS = [
    "nome",
    "idade",
    "serie",
    "materia_favorita",
    "materia_dificil",
    "hobbies",
    "como_aprende",
    "estilo_linguagem",
    "prompt_personalizado",
    // Rosto do robô (jsonb). Quem escreve aqui é o editor da CRIANÇA, não o pai —
    // é o mesmo caminho de escrita porque é a mesma linha e a mesma RLS.
    "rosto_robo",
  ];
  const campos = {};
  for (const k of EDITAVEIS) if (k in patch) campos[k] = patch[k];

  const { data, error } = await client()
    .from("criancas")
    .update(campos)
    .eq("id", crianca.id)
    .select()
    .single();
  if (error) throw error;
  // O cache guarda a linha ANTES desta escrita — descarta pra próxima leitura
  // trazer o perfil salvo (e não o de antes de o pai editar).
  invalidarCacheCrianca();
  return data;
}

/* ==========================================================================
   Mesa de Estudos — o quadro (`plano_tarefas`) ⭐ ago/2026

   A segunda (e última) tabela em que o site escreve. O servidor também escreve
   aqui (service_role), mas SÓ a coluna: `moverTarefa()` em `modules/planos.js`.
   Tudo o que o pai faz na tela passa por estas funções.
   ========================================================================== */

/** Colunas válidas do quadro. Valor desconhecido o servidor lê como `a_fazer`. */
const COLUNAS_TAREFA = ["a_fazer", "fazendo", "feito"];

/**
 * Campos que o pai pode escrever numa tarefa. `crianca_id`/`plano_id` ficam de
 * fora de propósito: mudar a criança ou o plano de um card não é edição, é outra
 * operação — e nenhuma tela oferece isso.
 */
const TAREFA_EDITAVEL = [
  "titulo",
  "detalhe",
  "materia",
  "prazo",
  "estimativa_min",
  "coluna",
  "ordem",
];

/**
 * Tarefas do quadro. Sem `planoId`, traz as da criança inteira (é o que o filtro
 * do Realtime enxerga); com `planoId`, só as daquele plano — que é o quadro que
 * a tela mostra.
 *
 * A ordenação tem TRÊS critérios de propósito. `ordem` é fracionária e pode
 * empatar (uma reindexação interrompida deixa dois cards no mesmo valor); sem o
 * `id` como desempate, os dois trocariam de lugar entre duas leituras sem nada
 * ter mudado. É o mesmo cuidado que o servidor tem em `comQuadroOrdenado()`.
 *
 * @param {number} [planoId]
 * @returns {Promise<Array<object>>} (vazio se não há criança pareada)
 */
export async function getTarefas(planoId) {
  const crianca = await getCrianca();
  if (!crianca) return [];
  let q = client().from("plano_tarefas").select("*").eq("crianca_id", crianca.id);
  if (planoId != null) q = q.eq("plano_id", planoId);
  const { data, error } = await q
    .order("coluna", { ascending: true })
    .order("ordem", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return data || [];
}

/**
 * Cria um card.
 *
 * ⚠️ `ordem` é NOT NULL **sem default** no banco: quem chama sempre manda. O
 * fallback de 1000 aqui é a primeira posição de uma coluna vazia, não um valor
 * mágico — deixar o banco recusar o insert por falta de `ordem` seria um erro
 * que só aparece em produção.
 *
 * @param {object} dados — { plano_id, titulo, detalhe?, materia?, coluna?,
 *   ordem?, prazo?, estimativa_min?, origem?, confianca? }
 * @returns {Promise<object>} o card criado (linha completa)
 */
export async function criarTarefa(dados) {
  const crianca = await getCrianca();
  if (!crianca) throw new Error("Sem criança pareada para criar a tarefa.");
  if (dados.plano_id == null) throw new Error("Tarefa sem plano_id.");

  const coluna = COLUNAS_TAREFA.includes(dados.coluna) ? dados.coluna : "a_fazer";
  const payload = {
    plano_id: dados.plano_id,
    // Desnormalizado de propósito (ver o schema): deixa a RLS barata e o servidor
    // lê o quadro sem join.
    crianca_id: crianca.id,
    titulo: dados.titulo || "Nova tarefa",
    detalhe: dados.detalhe || null,
    materia: dados.materia || null,
    coluna,
    ordem: Number.isFinite(Number(dados.ordem)) ? Number(dados.ordem) : 1000,
    prazo: dados.prazo || null,
    estimativa_min: dados.estimativa_min == null ? null : Number(dados.estimativa_min),
    origem: dados.origem || "pai",
    confianca: dados.confianca == null ? null : Number(dados.confianca),
  };
  const { data, error } = await client()
    .from("plano_tarefas")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  avisarRobo(crianca.id);
  return data;
}

/**
 * Edita o texto/metadados de um card. Para trocar de coluna, use `moverTarefa` —
 * ela cuida de `movida_por`/`concluida_em`, que esta aqui não toca.
 * @param {number} id
 * @param {object} patch
 * @returns {Promise<object|null>} o card atualizado, ou null se nada bateu
 */
export async function atualizarTarefa(id, patch) {
  const campos = {};
  for (const k of TAREFA_EDITAVEL) if (k in patch) campos[k] = patch[k];
  if (!Object.keys(campos).length) return null;
  campos.atualizado_em = new Date().toISOString();

  const { data, error } = await client()
    .from("plano_tarefas")
    .update(campos)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (data) avisarRobo(data.crianca_id);
  return data || null;
}

/**
 * Move um card de coluna/posição — a escrita mais frequente da tela.
 *
 * É o espelho invertido do `moverTarefa()` do servidor: lá `movida_por` vira
 * `'cogni'`, aqui vira **null**. Não é detalhe — `movida_por` é exatamente o que
 * acende o selo ✨ e o botão "Desfazer" no card. O pai arrastando um card que a
 * Cogni tinha movido está justamente dizendo "eu assumo este daqui", e o selo
 * tem que apagar.
 *
 * `concluida_em` acompanha a coluna nos dois sentidos: entrar em `feito` carimba,
 * sair limpa. Um card que volta pro quadro carregando data de conclusão antiga
 * mentiria pro pai e pro robô.
 *
 * @param {number} id
 * @param {{ coluna: string, ordem: number }} destino
 * @returns {Promise<object|null>}
 */
export async function moverTarefa(id, { coluna, ordem } = {}) {
  if (!COLUNAS_TAREFA.includes(coluna)) {
    throw new Error(`Coluna inválida: ${coluna}`);
  }
  const agora = new Date().toISOString();
  const campos = {
    coluna,
    ordem: Number(ordem),
    movida_por: null,
    movida_em: null,
    concluida_em: coluna === "feito" ? agora : null,
    atualizado_em: agora,
  };
  const { data, error } = await client()
    .from("plano_tarefas")
    .update(campos)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (data) avisarRobo(data.crianca_id);
  return data || null;
}

/**
 * Apaga um card.
 * @param {number} id
 * @returns {Promise<boolean>} true se removeu
 */
export async function removerTarefa(id) {
  const { error, count } = await client()
    .from("plano_tarefas")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw error;
  const removeu = (count || 0) > 0;
  // O DELETE não devolve a linha; o id da criança vem do perfil pareado, igual
  // ao `removerPlano`.
  if (removeu) avisarRobo();
  return removeu;
}

/**
 * Cria um plano JÁ com o quadro — o que a revisão da foto grava ao aprovar.
 *
 * Dois inserts, e o segundo é em LOTE (um `.insert([...])` só): N round-trips
 * numa conexão de celular seriam N chances de o pai ficar olhando um spinner.
 *
 * Se o insert das tarefas falhar, o plano recém-criado é **apagado** e o erro
 * sobe. Um plano vazio que a tela apresenta como "criado a partir de uma foto"
 * confunde mais do que um erro honesto — e o pai perderia a foto sem saber que
 * perdeu.
 *
 * @param {object} plano — { titulo, conteudo, foco, duracao_dias, status,
 *   origem, extraido_texto }
 * @param {Array<object>} tarefas — na ordem em que devem aparecer
 * @returns {Promise<object>} o plano criado, com `tarefas` anexadas
 */
export async function criarPlanoComTarefas(plano, tarefas) {
  const user = await currentUser();
  const crianca = await getCrianca();
  if (!crianca) throw new Error("Sem criança pareada para criar o plano.");

  let { data: criado, error: erroPlano } = await client()
    .from("planos_estudo")
    .insert(payloadDePlano(plano, crianca, user))
    .select()
    .single();

  /**
   * Ponte pro dia em que o site subir antes do SQL.
   *
   * `planos_estudo.origem` tem um `CHECK` com a lista de valores aceitos, e cada
   * valor novo (`arquivo`/`audio`/`video` em 15/ago, `pedido` em 16/ago) precisa que
   * o SQL rode ANTES do deploy. Se a ordem inverter, o insert morre com 23514
   * (check_violation) e o pai perde o plano inteiro — depois de ter revisado tarefa
   * por tarefa. Aqui a gente regrava com a origem antiga (`manual`), que todo banco
   * aceita: o pai perde o SELO da origem, não o trabalho. Some sozinho quando o SQL
   * roda, porque a primeira tentativa passa a funcionar.
   */
  if (erroPlano && erroPlano.code === "23514" && plano.origem) {
    console.warn(
      "[Companion] `origem` recusada pelo banco (rode o SQL do CHECK). Salvando como 'manual'."
    );
    ({ data: criado, error: erroPlano } = await client()
      .from("planos_estudo")
      .insert(payloadDePlano({ ...plano, origem: null }, crianca, user))
      .select()
      .single());
  }
  if (erroPlano) throw erroPlano;

  const lista = Array.isArray(tarefas) ? tarefas : [];
  if (!lista.length) {
    avisarRobo(crianca.id);
    return { ...criado, tarefas: [] };
  }

  const linhas = lista.map((t, i) => ({
    plano_id: criado.id,
    crianca_id: crianca.id,
    titulo: t.titulo || "Nova tarefa",
    detalhe: t.detalhe || null,
    materia: t.materia || null,
    coluna: COLUNAS_TAREFA.includes(t.coluna) ? t.coluna : "a_fazer",
    // Gap de 1000 desde o nascimento: é o que permite soltar um card entre dois
    // vizinhos gravando a média, com 1 UPDATE em vez da coluna inteira.
    ordem: Number.isFinite(Number(t.ordem)) ? Number(t.ordem) : (i + 1) * 1000,
    prazo: t.prazo || null,
    estimativa_min: t.estimativa_min == null ? null : Number(t.estimativa_min),
    origem: t.origem || "pai",
    confianca: t.confianca == null ? null : Number(t.confianca),
  }));

  const { data: cards, error: erroTarefas } = await client()
    .from("plano_tarefas")
    .insert(linhas)
    .select();

  if (erroTarefas) {
    // Rollback à mão (não há transação pelo PostgREST). Se o próprio rollback
    // falhar, ainda assim é o erro do insert que interessa ao pai.
    try {
      await client().from("planos_estudo").delete().eq("id", criado.id);
    } catch (e) {
      console.error("[Companion] Plano órfão em", criado.id, e);
    }
    throw erroTarefas;
  }

  avisarRobo(crianca.id);
  return { ...criado, tarefas: cards || [] };
}

/**
 * Aprova um plano que veio de foto: `rascunho` → `ativo`.
 *
 * Função própria (em vez de `atualizarPlano(id, {status:'ativo'})`) porque é o
 * ato da trava de aprovação — nada que a IA leu de uma foto chega ao robô sem o
 * pai ver, e o servidor já ignora tudo que não é `ativo`/`em_andamento`.
 * @param {number} id
 * @returns {Promise<object|null>}
 */
export async function aprovarPlano(id) {
  return atualizarPlano(id, { status: "ativo" });
}
