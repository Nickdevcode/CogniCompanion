/**
 * _lib/itens.mjs — Trava 5: a forma e o tamanho do que chegou.
 *
 * 🔗 Os números aqui espelham `js/dashboard/material/orcamento.js`. Os dois lados
 * NÃO podem importar o mesmo arquivo (a Vercel não serve `api/*` como estático), então
 * a duplicação é deliberada — e cada teto daqui é **um pouco maior** que o do cliente.
 *
 * O motivo dessa folga é o modo de falha: com tetos iguais, um arredondamento de
 * meio byte entre o que o cliente mediu e o que nós medimos viraria um 413 num corpo
 * que o cliente jurou que cabia. Com o servidor mais frouxo, quem barra é sempre o
 * cliente — que tem a mensagem boa, sabe QUAL material está sobrando e avisa antes de
 * gastar o 4G do pai. O 413 daqui só dispara pra quem não passou pelo nosso cliente.
 */

import { ErroHttp } from "./http.mjs";

/** Teto do corpo inteiro. O cliente para em 4,0 MB; a plataforma corta em 4,5 MB. */
const CORPO_MAX = 4_200_000;

const MAX_ITENS = 6;
const MAX_IMAGENS = 4;
const MAX_PDFS = 1;
const MAX_AUDIOS = 1;

const TETO = { imagem: 1_600_000, pdf: 3_200_000, audio: 4_100_000 };
const MAX_TEXTO_ITEM = 32_000;
const MAX_TEXTO_TOTAL = 64_000;

/**
 * Teto do pedido do responsável ("quero que ela revise a tabuada do 7").
 *
 * O cliente para em 600 (o `maxlength` do textarea); aqui sobra folga pela mesma
 * razão dos outros tetos — quem barra tem que ser sempre o cliente, que tem a
 * mensagem boa. Acima disto o texto é **cortado**, não recusado: um pedido comprido
 * demais é uma mãe empolgada, não um ataque.
 */
const MAX_PEDIDO = 800;

const TIPOS = ["imagem", "pdf", "texto", "audio"];

/**
 * Regexes ANCORADAS pro prefixo `data:`.
 *
 * Aceitar qualquer coisa antes do `;base64,` deixaria passar um `data:text/html` que
 * a OpenAI recusaria com um erro que não diz nada pro pai — e que a trava 6 esconde,
 * então ele veria um 502 sem explicação.
 */
const RE_IMAGEM = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const RE_PDF = /^data:application\/pdf;base64,[A-Za-z0-9+/=]+$/;
const RE_AUDIO = /^data:audio\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/;

/** Data ISO "YYYY-MM-DD" vinda do cliente, ou a de hoje no servidor. */
export function normalizarHoje(valor) {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor)
    ? valor
    : new Date().toISOString().slice(0, 10);
}

/**
 * Valida o corpo inteiro.
 *
 * ⭐ Desde 16/ago/2026 o material é **opcional**: o pedido escrito do responsável é
 * uma fonte legítima sozinho ("quero que ela treine tabuada essa semana"). O que não
 * pode é vir vazio dos dois lados — aí não há o que ler nem o que atender.
 *
 * @param {unknown} corpo
 * @returns {{itens: object[], hoje: string, pedido: string}}
 * @throws {ErroHttp} 400 (forma) ou 413 (tamanho)
 */
export function validarCorpo(corpo) {
  /**
   * Medir o corpo JÁ SERIALIZADO, e não a soma dos comprimentos de base64: é a
   * mesma unidade que a plataforma mede, e inclui o envelope, os nomes de arquivo
   * acentuados e os escapes de `\n`/`\t` que a extração de docx e xlsx produz.
   */
  const bytes = Buffer.byteLength(JSON.stringify(corpo ?? null));
  if (bytes > CORPO_MAX) {
    throw new ErroHttp(
      413,
      "O material ficou grande demais pra mandar de uma vez. Tire um item e tente de novo."
    );
  }

  const pedido =
    typeof corpo?.pedido === "string" ? corpo.pedido.trim().slice(0, MAX_PEDIDO) : "";

  const bruto = Array.isArray(corpo?.itens) ? corpo.itens : [];
  if (!bruto.length && !pedido) {
    throw new ErroHttp(
      400,
      "Escreva o que você quer que ela estude, ou mande o material da escola."
    );
  }
  if (bruto.length > MAX_ITENS) {
    throw new ErroHttp(413, `No máximo ${MAX_ITENS} materiais por vez.`);
  }

  const contagem = { imagem: 0, pdf: 0, texto: 0, audio: 0 };
  let textoTotal = 0;
  const itens = [];

  for (const item of bruto) {
    if (!item || typeof item !== "object" || !TIPOS.includes(item.tipo)) {
      throw new ErroHttp(400, "Formato de material inválido.");
    }
    contagem[item.tipo] += 1;
    const nome = typeof item.nome === "string" ? item.nome.slice(0, 120) : "material";

    if (item.tipo === "imagem") {
      if (typeof item.dados !== "string" || !RE_IMAGEM.test(item.dados)) {
        throw new ErroHttp(413, "Use uma foto JPEG, PNG ou WEBP.");
      }
      if (item.dados.length > TETO.imagem) {
        throw new ErroHttp(413, "Uma das fotos ficou grande demais. Tente de novo.");
      }
      itens.push({ tipo: "imagem", nome, dados: item.dados });
    } else if (item.tipo === "pdf") {
      if (typeof item.dados !== "string" || !RE_PDF.test(item.dados)) {
        throw new ErroHttp(413, "Esse arquivo não parece um PDF válido.");
      }
      if (item.dados.length > TETO.pdf) {
        throw new ErroHttp(413, "Esse PDF é grande demais. Mande só as páginas que interessam.");
      }
      itens.push({ tipo: "pdf", nome, dados: item.dados });
    } else if (item.tipo === "audio") {
      if (typeof item.dados !== "string" || !RE_AUDIO.test(item.dados)) {
        throw new ErroHttp(413, "Esse arquivo de áudio não veio num formato que eu leia.");
      }
      if (item.dados.length > TETO.audio) {
        throw new ErroHttp(413, "Esse áudio é comprido demais. Mande um trecho menor.");
      }
      itens.push({
        tipo: "audio",
        nome,
        mime: typeof item.mime === "string" ? item.mime.slice(0, 60) : "audio/webm",
        dados: item.dados,
        duracao_s: Number.isFinite(Number(item.duracao_s)) ? Number(item.duracao_s) : null,
      });
    } else {
      const texto = typeof item.texto === "string" ? item.texto : "";
      if (!texto.trim()) throw new ErroHttp(400, "Um dos arquivos veio sem texto.");
      if (texto.length > MAX_TEXTO_ITEM) {
        throw new ErroHttp(413, "Esse documento é longo demais. Mande só a parte que interessa.");
      }
      textoTotal += texto.length;
      if (textoTotal > MAX_TEXTO_TOTAL) {
        throw new ErroHttp(413, "Junto, esses documentos são longos demais. Mande um por vez.");
      }
      itens.push({
        tipo: "texto",
        nome,
        formato:
          typeof item.formato === "string" ? item.formato.slice(0, 12).toLowerCase() : "txt",
        texto,
      });
    }
  }

  if (contagem.imagem > MAX_IMAGENS) {
    throw new ErroHttp(413, `No máximo ${MAX_IMAGENS} fotos por vez.`);
  }
  if (contagem.pdf > MAX_PDFS) {
    throw new ErroHttp(413, "Mande um PDF por vez.");
  }
  if (contagem.audio > MAX_AUDIOS) {
    throw new ErroHttp(413, "Mande um áudio por vez.");
  }

  return { itens, hoje: normalizarHoje(corpo?.hoje), pedido };
}
