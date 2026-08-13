/**
 * mapa-api.js — Camada de dados do Mapa de Compreensão da Aula.
 *
 * Concentra TUDO que envolve buscar e sanear as sessões de atenção, pra a seção
 * (`sections/mapa.js`) cuidar só de desenhar. São duas fontes que se completam,
 * exatamente como no Resumo Semanal e na Dica:
 *
 *   1) Endpoint do servidor local — `GET {servidor}/api/mapa-aula?criancaId=…`
 *      → `{ emAndamento, sessao, historico[] }`. É a ÚNICA fonte da sessão que
 *      está acontecendo agora (ela vive em RAM no servidor e só vira linha no
 *      banco quando termina). É o que faz o modo ao vivo existir.
 *   2) Tabela `sessoes_atencao` (Supabase, RLS) — o histórico persistido. Pinta
 *      instantâneo e continua valendo com o robô desligado.
 *
 * Por que as duas, se o endpoint já devolve histórico? Porque ele devolve
 * `historico: []` justamente quando há sessão ao vivo (ver a rota no repo do
 * robô). Sem a tabela, as aulas anteriores sumiriam da tela exatamente durante a
 * demonstração ao vivo — o pior momento possível.
 *
 * ⚠️ Vocabulário (regra inegociável, a mesma da trilha de aprendizado): `sinal`
 * (`travada`/`confusa`) e `resultado` (`travou`) são dados INTERNOS e NUNCA vão
 * pra tela. O que se mostra é o `rotulo`, que o servidor já manda pronto em
 * linguagem de apoio. Aqui eles são preservados só pra escolher a cor do
 * marcador e achar o ponto de atrito — nunca pra renderizar.
 */

/** Quantas sessões anteriores buscar (o endpoint aceita até 50; 10 é o default). */
const LIMITE_HISTORICO = 10;

/**
 * Rótulos que o servidor produz hoje (`ROTULO_SINAL` e os literais de prática em
 * `modules/atencao.js` do repo do robô), mapeados pra a mesma frase com os
 * acentos que o português exige.
 *
 * Isto NÃO é traduzir sinal nem inventar rótulo: a frase é idêntica, palavra por
 * palavra. O repo do robô é escrito sem acentuação (convenção de lá), e o pai não
 * pode ler "ficou em duvida" no painel. Rótulo que não estiver aqui passa como
 * veio — não adivinhamos texto que não conhecemos.
 */
const ROTULOS_ACENTUADOS = {
  "precisou de mais ajuda": "precisou de mais ajuda",
  "ficou em duvida": "ficou em dúvida",
  "estava embalada": "estava embalada",
  "resolveu sozinha": "resolveu sozinha",
  "tropecou no exercicio": "tropeçou no exercício",
};

/**
 * Vocabulário interno que jamais pode aparecer na tela. É a rede de segurança
 * para dado antigo no jsonb — a defesa principal é comparar o `rotulo` com o
 * `sinal`/`resultado` do próprio momento (ver `rotuloParaTela`).
 */
const VOCABULARIO_INTERNO = new Set([
  "travada",
  "confusa",
  "engajada",
  "travou",
  "aprendeu",
]);

/** Rótulo neutro por tipo, usado só quando o do servidor não serve (raro). */
const ROTULO_NEUTRO = {
  afeto: "um momento da aula",
  pratica: "um exercício",
};

/**
 * Tom do momento — o que define a COR do marcador. Não é nota nem valência moral:
 * "apoio" é onde o pai pode ajudar, "bom" é onde ela deslanchou.
 */
const TOM_POR_SINAL = { travada: "apoio", confusa: "duvida", engajada: "bom" };
const TOM_POR_RESULTADO = { travou: "apoio", aprendeu: "bom" };

/**
 * @typedef {object} Momento
 * @property {number} emMs — offset desde o início da sessão (não é timestamp)
 * @property {'afeto'|'pratica'} tipo
 * @property {string} rotulo — texto PRONTO pra tela (linguagem de apoio)
 * @property {'apoio'|'duvida'|'bom'|'neutro'} tom — só pra cor do marcador
 * @property {string|null} materia
 * @property {string|null} topico — o assunto que estava valendo naquele segundo
 * @property {string|null} sinal — INTERNO: nunca renderizar
 * @property {string|null} resultado — INTERNO: nunca renderizar
 */

/**
 * @typedef {object} Sessao
 * @property {string} chave — identidade estável da aula (ver `chaveDaSessao`)
 * @property {string|null} inicioEm — ISO de quando a aula começou
 * @property {number} duracaoMs
 * @property {number} turnos — trocas de conversa
 * @property {string[]} materias
 * @property {string[]} topicos
 * @property {Momento[]} momentos — ordenados por `emMs`
 * @property {Momento|null} pontoDeAtrito — o momento que mais importa (ou null)
 * @property {boolean} emAndamento — true só na sessão ao vivo
 */

/** Número finito e não-negativo, ou 0. O jsonb é livre: nada pode virar NaN. */
function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Array de strings não-vazias (materias/topicos vêm de jsonb/text[]). */
function listaDeTextos(valor) {
  if (!Array.isArray(valor)) return [];
  return valor.map((v) => String(v || "").trim()).filter(Boolean);
}

/** Texto limpo, ou null (nunca "undefined" na tela). */
function texto(valor) {
  const t = String(valor == null ? "" : valor).trim();
  return t || null;
}

/**
 * Rótulo pronto pra tela: acentua o que conhecemos e barra vocabulário interno.
 *
 * A checagem que importa não é a lista fixa, é a comparação com o próprio dado
 * interno do momento: o servidor monta o rótulo como `ROTULO_SINAL[sinal] || sinal`,
 * então um sinal que ele ainda não saiba nomear (um `dispersa` acrescentado
 * amanhã no robô) chegaria aqui como rótulo e iria direto pra tela do pai. Rótulo
 * igual ao sinal = tradução que não aconteceu → cai no neutro.
 *
 * @param {string} bruto — o `rotulo` como veio do servidor
 * @param {'afeto'|'pratica'} tipo
 * @param {Array<string|null>} internos — `sinal` e `resultado` do mesmo momento
 * @returns {string}
 */
function rotuloParaTela(bruto, tipo, internos = []) {
  const cru = String(bruto || "").trim();
  const chave = cru.toLowerCase();
  if (ROTULOS_ACENTUADOS[chave]) return ROTULOS_ACENTUADOS[chave];

  const repeteInterno = internos.some(
    (v) => v && String(v).trim().toLowerCase() === chave
  );
  if (!cru || repeteInterno || VOCABULARIO_INTERNO.has(chave)) {
    return ROTULO_NEUTRO[tipo] || ROTULO_NEUTRO.afeto;
  }
  return cru;
}

/**
 * Saneia um momento cru do jsonb. Um item malformado não pode derrubar a tela
 * inteira — mesma disciplina do `normalizarItemTrilha` no Aprendizado.
 * @returns {Momento|null} null quando não dá pra usar
 */
function normalizarMomento(item) {
  if (!item || typeof item !== "object") return null;
  const tipo = item.tipo === "pratica" ? "pratica" : "afeto";
  const sinal = texto(item.sinal);
  const resultado = texto(item.resultado);
  const tom =
    (sinal && TOM_POR_SINAL[sinal]) ||
    (resultado && TOM_POR_RESULTADO[resultado]) ||
    "neutro";

  return {
    emMs: numero(item.emMs),
    tipo,
    rotulo: rotuloParaTela(item.rotulo, tipo, [sinal, resultado]),
    tom,
    materia: texto(item.materia),
    topico: texto(item.topico),
    sinal,
    resultado,
  };
}

/**
 * O momento que mais importa pro pai: onde ela precisou de mais ajuda.
 *
 * Espelha a regra do servidor (`montarMapa` em `modules/atencao.js`): primeiro
 * sinal `travada`, senão o primeiro exercício em que ela travou. Precisamos dela
 * aqui porque o `pontoDeAtrito` só viaja na sessão AO VIVO — o histórico (tanto
 * do endpoint quanto da tabela) traz os momentos sem esse campo derivado. Não é
 * inventar leitura: é aplicar a mesma regra sobre os mesmos momentos já cruzados.
 *
 * @param {Momento[]} momentos
 * @returns {Momento|null} null quando a aula correu sem atrito — e isso também é
 *   informação, não ausência de dado.
 */
function acharPontoDeAtrito(momentos) {
  return (
    momentos.find((m) => m.sinal === "travada") ||
    momentos.find((m) => m.tipo === "pratica" && m.resultado === "travou") ||
    null
  );
}

/**
 * Identidade da aula, usada pra saber se a sessão exibida continua sendo a mesma
 * entre dois ciclos do modo ao vivo. Normalizamos pelo INSTANTE (e não pela string
 * ISO) porque a mesma aula chega escrita de dois jeitos conforme a fonte: o
 * servidor manda `2026-08-13T15:00:00.000Z`, o Postgres devolve
 * `2026-08-13T12:00:00+00:00`. Comparar texto faria a aula "trocar de identidade"
 * na hora em que ela é gravada — bem no fim da demonstração ao vivo.
 */
function chaveDaSessao(inicioEm) {
  const instante = Date.parse(inicioEm);
  return Number.isFinite(instante) ? String(instante) : String(inicioEm || "");
}

/** Monta a sessão normalizada a partir dos campos já extraídos de cada fonte. */
function montarSessao({ inicioEm, duracaoMs, turnos, materias, topicos, momentos, pontoDeAtrito, emAndamento }) {
  const lista = (Array.isArray(momentos) ? momentos : [])
    .map(normalizarMomento)
    .filter(Boolean)
    .sort((a, b) => a.emMs - b.emMs);

  return {
    chave: chaveDaSessao(inicioEm),
    inicioEm: texto(inicioEm),
    duracaoMs: numero(duracaoMs),
    turnos: numero(turnos),
    materias: listaDeTextos(materias),
    topicos: listaDeTextos(topicos),
    momentos: lista,
    pontoDeAtrito: normalizarMomento(pontoDeAtrito) || acharPontoDeAtrito(lista),
    emAndamento: !!emAndamento,
  };
}

/** Sessão vinda do endpoint (camelCase). */
function normalizarDoEndpoint(sessao, emAndamento = false) {
  if (!sessao || typeof sessao !== "object") return null;
  return montarSessao({
    inicioEm: sessao.inicioEm,
    duracaoMs: sessao.duracaoMs,
    turnos: sessao.turnos,
    materias: sessao.materias,
    topicos: sessao.topicos,
    momentos: sessao.momentos,
    pontoDeAtrito: sessao.pontoDeAtrito,
    emAndamento: emAndamento || sessao.emAndamento,
  });
}

/** Linha de `sessoes_atencao` (snake_case, como o Postgres devolve). */
function normalizarDaTabela(linha) {
  if (!linha || typeof linha !== "object") return null;
  return montarSessao({
    inicioEm: linha.iniciada_em,
    duracaoMs: linha.duracao_ms,
    turnos: linha.turnos,
    materias: linha.materias,
    topicos: linha.topicos,
    momentos: linha.momentos,
    pontoDeAtrito: null, // a tabela não guarda o derivado — recalculamos
    emAndamento: false, // o que está no banco, por definição, já terminou
  });
}

/**
 * Busca o mapa no endpoint do servidor local. Robô/servidor desligado NÃO é erro:
 * devolve `null` e quem chama cai pro histórico da tabela. Nunca lança.
 * @param {string} servidorUrl
 * @param {string} criancaId
 * @returns {Promise<{emAndamento:boolean, sessao:object|null, historico:object[]}|null>}
 */
async function buscarDoServidor(servidorUrl, criancaId) {
  if (!servidorUrl || !criancaId) return null;
  try {
    const url =
      `${servidorUrl}/api/mapa-aula?criancaId=${encodeURIComponent(criancaId)}` +
      `&limite=${LIMITE_HISTORICO}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.json();
  } catch (err) {
    // Servidor off / CORS: silencioso de propósito, a tabela cobre o histórico.
    console.debug("[Companion] Mapa da aula: servidor indisponível.", err);
    return null;
  }
}

/**
 * @typedef {object} MapaCarregado
 * @property {boolean} emAndamento — há uma aula acontecendo agora
 * @property {Sessao[]} sessoes — mais recente primeiro (a ao vivo, quando existe,
 *   é sempre a primeira)
 * @property {boolean} aoVivoDisponivel — o servidor respondeu (dá pra ter ao vivo)
 */

/**
 * Carrega o mapa combinando servidor (ao vivo + histórico fresco) e tabela
 * (histórico estável). É a função que a seção chama — no primeiro render e a cada
 * tick do modo ao vivo.
 *
 * @param {object} cfg
 * @param {string} cfg.servidorUrl — base do servidor local da Cogni
 * @param {object|null} cfg.crianca — a criança pareada (precisa do `id`)
 * @param {object} cfg.mock — camada de dados (lê `sessoes_atencao`)
 * @returns {Promise<MapaCarregado>} nunca rejeita: sem nada em lugar nenhum,
 *   devolve `sessoes: []` (que a tela trata como "ainda não houve aula").
 */
export async function carregarMapa({ servidorUrl, crianca, mock }) {
  const criancaId = crianca && crianca.id;
  if (!criancaId) return { emAndamento: false, sessoes: [], aoVivoDisponivel: false };

  // A leitura da tabela tolera falha (RLS/rede) sem derrubar: o endpoint ainda
  // pode cobrir tudo sozinho.
  const daTabelaP = mock
    ? mock
        .getSessoesAtencao(LIMITE_HISTORICO)
        .then((linhas) => (Array.isArray(linhas) ? linhas.map(normalizarDaTabela).filter(Boolean) : []))
        .catch((err) => {
          console.debug("[Companion] Mapa da aula: leitura da tabela falhou.", err);
          return [];
        })
    : Promise.resolve([]);

  const [doServidor, daTabela] = await Promise.all([
    buscarDoServidor(servidorUrl, criancaId),
    daTabelaP,
  ]);

  const emAndamento = !!(doServidor && doServidor.emAndamento);
  const aoVivo = emAndamento ? normalizarDoEndpoint(doServidor.sessao, true) : null;

  // Histórico: o do servidor é o mais fresco, mas vem VAZIO durante o ao vivo —
  // aí a tabela é quem segura as aulas anteriores.
  const historicoServidor = (doServidor && Array.isArray(doServidor.historico) ? doServidor.historico : [])
    .map((s) => normalizarDoEndpoint(s, false))
    .filter(Boolean);
  const historico = historicoServidor.length ? historicoServidor : daTabela;

  const sessoes = aoVivo ? [aoVivo, ...historico] : historico;

  return { emAndamento, sessoes, aoVivoDisponivel: !!doServidor };
}

/**
 * Resumo em texto da aula (2–3 frases geradas por IA no servidor).
 *
 * Passa pelo mesmo rate limit dos outros endpoints de IA, então a seção chama
 * quando o pai ABRE a tela (e uma vez a mais quando a aula ao vivo termina),
 * nunca a cada render nem a cada tick do poll.
 *
 * @param {string} servidorUrl
 * @param {string} criancaId
 * @returns {Promise<string|null>} o texto, ou null quando não há o que resumir
 *   (sem sessão, IA indisponível ou servidor desligado). Nunca lança — a tela
 *   sem o texto ainda vale sozinha (a linha do tempo é o conteúdo principal).
 */
export async function carregarResumoDaAula(servidorUrl, criancaId) {
  if (!servidorUrl || !criancaId) return null;
  try {
    const url = `${servidorUrl}/api/mapa-aula/resumo?criancaId=${encodeURIComponent(criancaId)}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const dados = await resp.json();
    return texto(dados && dados.texto);
  } catch (err) {
    console.debug("[Companion] Resumo da aula: servidor indisponível.", err);
    return null;
  }
}
