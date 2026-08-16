/**
 * api/ler-link.mjs — Um link colado vira material de plano.
 *
 * A rodada 2 assumia que **alguém entregou um arquivo**: foto da agenda, PDF da lista,
 * áudio no grupo do WhatsApp. Só que boa parte do reforço escolar de 2026 não é arquivo
 * nenhum — é um LINK. A professora manda a videoaula no grupo, o pai acha um vídeo bom
 * no domingo à noite, a escola publica a lista num site em vez de mandar o PDF. Antes
 * disto, as três saídas eram baixar o vídeo (ninguém faz), tirar print (perde o texto)
 * ou digitar o plano na mão — que é o buraco que a feature inteira existe pra tapar.
 *
 * 🔒 POR QUE ESTA FUNÇÃO É SEPARADA DA `plano-de-material`:
 *   1. Link ruim tem que falhar **na bandeja**, onde todos os erros de material já
 *      falham hoje — e não no meio da geração do plano.
 *   2. O pai precisa ver o **título do vídeo no card ANTES** de montar o plano: colar o
 *      link errado é o erro mais comum que existe, e é o único que ele corrige sozinho.
 *   3. `plano-de-material` continua conhecendo QUATRO tipos, sem uma linha de mudança —
 *      o link vira `{tipo:"texto"}` ou `{tipo:"pdf"}` no cliente. Mesma sacada do vídeo.
 *
 * ⚠️ E É A FUNÇÃO MAIS PERIGOSA DO PROJETO: ela busca uma URL escolhida por quem chama.
 * Sem trava, é um proxy SSRF público hospedado no projeto do Nicolas. Por isso a sessão
 * vem PRIMEIRO (nada de rede pra quem não está logado e pareado) e o destino passa por
 * `_lib/link/rede.mjs`, que valida DNS, porta, esquema e **cada salto de redirect**.
 *
 * 🔒 O material não é guardado em lugar nenhum — nem a URL. Ela sobrevive só dentro do
 * `extraido_texto`, como referência de auditoria pro pai. Vale pra link igual valia pra
 * foto: é material de menor de idade.
 *
 * Contrato (docs/COMPANION-PLANO-TECNICO.md → "🔗 Rodada 3"):
 *   POST /api/ler-link
 *     headers: Authorization: Bearer <supabase access_token>
 *     body:    { url: "https://…" }   ← aceita texto com link no meio (o pai cola do
 *                                       WhatsApp: "olha isso ó https://…")
 *     → 200 { ok:true, fonte:"youtube", formato:"youtube", chave, nome, titulo, canal,
 *             duracao_s, miniatura, texto, grau, idiomaLegenda, legendaAutomatica,
 *             cortado, aviso }
 *     → 200 { ok:true, fonte:"pagina", formato:"web", chave, nome, titulo, dominio,
 *             texto, cortado, aviso }
 *     → 200 { ok:true, fonte:"pdf", chave, nome, titulo, dados, bytes }
 *     → 200 { ok:false, motivo:"…" }  ← link ruim NÃO é erro HTTP
 *     → 400 forma · 401 sem sessão · 403 sem criança · 405 método · 415 content-type
 *     → 429 cota do dia · 502 falha nossa · 503 função sem env vars
 */

import { responder, ErroHttp } from "./_lib/http.mjs";
import { validarSessao, criancaPareada, dentroDaCota } from "./_lib/auth.mjs";
import { LinkRuim, extrairUrl } from "./_lib/link/rede.mjs";
import { ehDoYoutube, idDoYoutube, motivoDeUrlSemVideo, lerVideo } from "./_lib/link/youtube.mjs";
import { lerPagina } from "./_lib/link/pagina.mjs";

/** Teto do que aceitamos como "texto com um link dentro". Acima disso é outra coisa. */
const MAX_ENTRADA = 4_000;

/** Teto do `nome` do item — o mesmo que `_lib/itens.mjs` aplica no material. */
const MAX_NOME = 120;

/** Nome de item a partir do título, com um padrão que não mente. */
function nomeDoItem(titulo, padrao) {
  const limpo = String(titulo || "").replace(/\s+/g, " ").trim();
  return (limpo || padrao).slice(0, MAX_NOME);
}

/**
 * A chave de duplicata, decidida AQUI porque só aqui se conhece a URL final.
 *
 * O cliente também calcula a dele antes de gastar a rede (`material/link.js`), mas a
 * daqui é a que enxerga o redirect: um encurtador e o link direto pro mesmo vídeo são o
 * mesmo material, e o pai que colou os dois não quer duas cópias da mesma aula.
 */
function chaveDaPagina(url) {
  try {
    const u = new URL(url);
    return `web:${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}${u.search}`;
  } catch {
    return `web:${url}`;
  }
}

export default async function handler(req, res) {
  /* Trava 1 — só POST. */
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return responder(res, 405, { erro: "Use POST." });
  }

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return responder(res, 503, {
      erro: "A leitura de link está desligada no servidor. Avise o responsável pelo site.",
    });
  }
  const env = { SUPABASE_URL, SUPABASE_ANON_KEY };

  try {
    /**
     * A ORDEM É A MESMA da `plano-de-material`, e aqui ela é ainda mais importante:
     * enquanto lá o pior caso de uma trava fora de ordem é gastar token à toa, aqui é
     * **a nossa saída de rede sendo usada por um estranho**. Sessão e criança primeiro;
     * nenhum byte sai daqui antes disso.
     */

    /* Trava 2 — quem é o pai (validado no servidor, nunca no corpo). */
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    const uid = await validarSessao(token, env);

    /* A forma do corpo. */
    if (!String(req.headers["content-type"] || "").includes("application/json")) {
      throw new ErroHttp(415, "Mande o link como JSON.");
    }

    let corpo;
    try {
      // `req.body` é um getter que LANÇA com JSON malformado (documentado da Vercel).
      corpo = req.body;
    } catch {
      throw new ErroHttp(400, "Corpo da requisição inválido.");
    }

    if (typeof corpo?.url !== "string" || !corpo.url.trim()) {
      throw new ErroHttp(400, "Cole o link que você quer que eu leia.");
    }

    /* Trava 3 — tem criança pareada? (quem responde é a RLS) */
    const crianca = await criancaPareada(token, uid, env);

    /**
     * Trava 4 — cota do dia.
     *
     * Não é um contador de links: é o teto diário de PLANOS daquela criança, que já
     * existe. Não impede um pai curioso de ler três links pra um plano só — e não
     * precisa: o que ele impede é uma conta válida virar scraper, e isso ele faz sem
     * infra nova nenhuma.
     */
    await dentroDaCota(token, crianca.id, env);

    /**
     * O link ruim vira `ok:false` a partir daqui — é a mesma regra que material ruim já
     * segue: um 502 faz o pai colar o mesmo link de novo; um motivo diz o que mudar.
     */
    const url = extrairUrl(corpo.url.slice(0, MAX_ENTRADA));
    if (!url) {
      return responder(res, 200, {
        ok: false,
        motivo: "Não achei um link aí. Copie o endereço do vídeo ou da página e cole de novo.",
      });
    }

    if (ehDoYoutube(url)) {
      const semVideo = motivoDeUrlSemVideo(url);
      if (semVideo) return responder(res, 200, { ok: false, motivo: semVideo });

      const id = idDoYoutube(url);
      const video = await lerVideo(id);
      return responder(res, 200, {
        ok: true,
        fonte: "youtube",
        formato: "youtube",
        chave: `yt:${id}`,
        nome: nomeDoItem(video.titulo, "videoaula do YouTube"),
        titulo: video.titulo,
        canal: video.canal,
        duracao_s: video.duracao_s,
        miniatura: video.miniatura,
        texto: video.texto,
        grau: video.grau,
        idiomaLegenda: video.idiomaLegenda,
        legendaAutomatica: video.legendaAutomatica,
        cortado: video.cortado,
        // O selo de grau é do cliente (ele conhece o card). O aviso é só o que o selo
        // não diz — repetir a mesma frase em dois lugares ensina o pai a não ler.
        aviso: video.cortado
          ? "Essa aula é longa: li o começo da legenda. Se o que interessa está no fim, diga isso no seu pedido."
          : null,
      });
    }

    const pagina = await lerPagina(url);

    if (pagina.tipo === "pdf") {
      return responder(res, 200, {
        ok: true,
        fonte: "pdf",
        chave: chaveDaPagina(pagina.url),
        nome: nomeDoItem(pagina.nome, "documento.pdf"),
        titulo: pagina.titulo,
        dados: `data:application/pdf;base64,${pagina.dados.toString("base64")}`,
        bytes: pagina.bytes,
      });
    }

    return responder(res, 200, {
      ok: true,
      fonte: "pagina",
      formato: "web",
      chave: chaveDaPagina(pagina.url),
      nome: nomeDoItem(pagina.titulo, pagina.dominio),
      titulo: pagina.titulo,
      dominio: pagina.dominio,
      texto: pagina.texto,
      cortado: pagina.cortado,
      aviso: pagina.cortado
        ? "Essa página é longa: li o começo dela. Se a lição está no fim, copie esse trecho no seu pedido."
        : null,
    });
  } catch (err) {
    if (err instanceof ErroHttp) {
      return responder(res, err.status, { erro: err.message });
    }
    if (err instanceof LinkRuim) {
      return responder(res, 200, { ok: false, motivo: err.message });
    }

    /**
     * A mensagem interna NUNCA sai daqui: ela pode conter o host que recusou, um trecho
     * do HTML do site ou o motivo da nossa própria trava de SSRF — que é informação de
     * infraestrutura, não recado pro pai.
     */
    console.error("[ler-link] Leitura falhou:", err);
    return responder(res, 502, {
      erro: "Não consegui abrir esse link agora. Tente de novo em instantes.",
    });
  }
}
