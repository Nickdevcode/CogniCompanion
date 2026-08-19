/**
 * material/index.js — O dispatcher: um arquivo entra, itens prontos saem.
 *
 * É o único módulo que a UI conhece. Ele decide **onde cada formato vira texto**, que
 * é a regra que sustenta a feature inteira:
 *
 * | Material              | Extrai onde | Por quê |
 * | --------------------- | ----------- | ------- |
 * | Foto                  | navegador   | 4-8 MB viram ~300 KB no canvas |
 * | PDF                   | a OpenAI    | PDF escaneado precisa de OCR; a API lê texto E imagem de página |
 * | DOCX / PPTX / XLSX    | navegador   | são ZIP de XML; 8 MB viram 30 KB de texto |
 * | TXT / MD / CSV        | navegador   | `file.text()` |
 * | Áudio                 | a OpenAI    | transcrição; sobe como está |
 * | Vídeo                 | navegador   | vira quadros + trilha (ver `video.js`) |
 *
 * 🔴 A detecção é por **magic bytes**, nunca por `file.type`. Windows e Android
 * reportam `application/octet-stream` (ou string vazia) pra `.docx` com frequência, o
 * pai renomeia arquivo, e `.odt`/`.pages`/`.epub` são ZIP igual a `.docx`. O conteúdo
 * é a única fonte confiável.
 */

import { primeirosBytes, comecaCom, blobParaDataURL, tamanhoSerializado, formatarBytes, formatarDuracao, custoEmBase64 } from "./bytes.js";
import { TETO, MAX_TEXTO_ITEM } from "./orcamento.js";
import * as imagem from "./imagem.js";
import * as ooxml from "./ooxml.js";
import * as texto from "./texto.js";
import * as audio from "./audio.js";
import * as video from "./video.js";
import { abrirZip } from "./zip.js";

/**
 * Formato que a gente não lê, com a mensagem que ENSINA o que fazer.
 * "Formato não suportado" deixa o pai parado; "salve como PDF" resolve.
 */
export class MaterialNaoSuportado extends Error {}

/* ==========================================================================
   Detecção
   ========================================================================== */

const ASSIN_PDF = [0x25, 0x50, 0x44, 0x46]; // %PDF
const ASSIN_ZIP = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04
const ASSIN_OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // .doc/.xls/.ppt antigos

const EXT_IMAGEM = /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i;
const EXT_AUDIO = /\.(mp3|m4a|wav|ogg|opus|aac|weba|amr|flac)$/i;
const EXT_VIDEO = /\.(mp4|mov|m4v|webm|avi|mkv|3gp|3gpp|mpe?g|wmv)$/i;
const EXT_TEXTO = /\.(txt|md|markdown|csv|tsv|json|log)$/i;

/**
 * Família do arquivo, com o **mime primeiro e a extensão como rede**.
 *
 * A ordem importa e não é estética: `.webm` e `.mp4` são containers que servem tanto
 * pra áudio quanto pra vídeo, e estão nas duas listas de extensão. Uma gravação do
 * nosso próprio microfone sai como `gravacao.webm` — decidir pela extensão a mandaria
 * pro caminho de vídeo, que tentaria extrair quadros de um arquivo sem imagem.
 * O `type` do Blob resolve isso (`audio/webm;codecs=opus`), e o navegador o preenche
 * de forma confiável pra mídia. A extensão só entra quando o mime vem vazio — que é
 * o caso de documento no Windows e no Android, e ali não há ambiguidade.
 *
 * @returns {"imagem"|"audio"|"video"|"texto"|null}
 */
function familia(file) {
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("image/")) return "imagem";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("text/")) return "texto";

  const nome = file.name || "";
  if (EXT_IMAGEM.test(nome)) return "imagem";
  if (EXT_AUDIO.test(nome)) return "audio";
  if (EXT_VIDEO.test(nome)) return "video";
  if (EXT_TEXTO.test(nome)) return "texto";
  return null;
}

/** Mensagens que ensinam, por família de formato que a gente não lê. */
function recusarPorExtensao(nome) {
  if (/\.(doc|xls|ppt)$/i.test(nome)) {
    return "Esse é um arquivo do Office antigo. Abra, use “Salvar como” e escolha PDF ou DOCX, aí eu leio.";
  }
  if (/\.(odt|ods|odp)$/i.test(nome)) {
    return "Esse arquivo é do LibreOffice. Use “Salvar como” e escolha PDF ou DOCX, e mande de novo.";
  }
  if (/\.(pages|key|numbers)$/i.test(nome)) {
    return "Esse arquivo é do Pages/Keynote/Numbers. No app, use Exportar → PDF e mande o PDF.";
  }
  if (/\.rtf$/i.test(nome)) {
    return "Não leio RTF. Abra o arquivo e salve como PDF ou DOCX.";
  }
  if (/\.(zip|rar|7z)$/i.test(nome)) {
    return "Isso é uma pasta compactada. Descompacte e mande o arquivo de dentro.";
  }
  if (/\.epub$/i.test(nome)) {
    return "Não leio EPUB. Se for um trecho, mande como PDF ou tire foto das páginas.";
  }
  return null;
}

/* ==========================================================================
   Preparo por tipo
   ========================================================================== */

async function prepararFoto(file, orcamento) {
  const alvo = Math.min(TETO.imagem, Math.max(200_000, orcamento.restante()));
  let pronto;
  try {
    pronto = await imagem.deArquivo(file, alvo);
  } catch (err) {
    if (/\.(heic|heif)$/i.test(file.name || "")) {
      // O iPhone salva em HEIC e só o Safari decodifica. Vale ensinar o atalho.
      throw new MaterialNaoSuportado(
        "Este navegador não abre foto em HEIC. No iPhone: Ajustes → Câmera → Formatos → “Mais Compatível”, ou mande a foto pelo WhatsApp pra você mesmo e use o arquivo que chegar."
      );
    }
    throw err;
  }

  const item = { tipo: "imagem", nome: file.name || "foto.jpg", dados: pronto.url };
  const bytes = tamanhoSerializado(item);

  /**
   * O laço de re-encode aperta até o último degrau, mas não faz milagre: uma página
   * muito densa pode sair maior que o alvo mesmo a 1024px. Barrar AQUI é o que faz o
   * pai descobrir na hora de adicionar — com o nome do arquivo na mão — em vez de
   * depois de montar quatro materiais e clicar em "Montar o plano".
   *
   * A pergunta é só uma: **cabe no que sobrou?** (O `alvo` acima tem um piso pra o
   * laço não perseguir um número absurdo quando a bandeja está quase cheia, então
   * ele não serve como critério de admissão.)
   */
  if (bytes > TETO.imagem || bytes > orcamento.restante()) {
    throw new MaterialNaoSuportado(
      `Essa foto ficou em ${formatarBytes(bytes)} e não cabe junto com o resto. ` +
        "Tire um material da lista, ou fotografe só a parte da lição."
    );
  }

  return {
    origem: "foto",
    itens: [item],
    bytes,
    miniatura: pronto.url,
    rotulo: `${file.name || "foto"} · ${pronto.largura}×${pronto.altura}`,
  };
}

async function prepararPdf(file, orcamento) {
  // Checa ANTES de ler: um PDF de 6 MB não precisa virar string de 8 MB pra gente
  // descobrir que não cabe. O aviso sai enquanto o pai ainda está escolhendo.
  const estimado = custoEmBase64(file.size);
  if (estimado > TETO.pdf || estimado > orcamento.restante()) {
    throw new MaterialNaoSuportado(
      `Esse PDF tem ${formatarBytes(file.size)} e não cabe de uma vez. Mande só as páginas que interessam, ou separe em partes.`
    );
  }

  const item = { tipo: "pdf", nome: file.name || "documento.pdf", dados: await blobParaDataURL(file) };
  return {
    origem: "arquivo",
    itens: [item],
    bytes: tamanhoSerializado(item),
    rotulo: `${file.name || "PDF"} · ${formatarBytes(file.size)}`,
  };
}

async function prepararDocumento(file) {
  const { formato, texto: conteudo, cortado } = await ooxml.deArquivo(file);
  const item = { tipo: "texto", nome: file.name || `documento.${formato}`, formato, texto: conteudo };
  return {
    origem: "arquivo",
    itens: [item],
    bytes: tamanhoSerializado(item),
    rotulo: `${file.name || formato} · ${conteudo.length.toLocaleString("pt-BR")} caracteres lidos`,
    aviso: cortado
      ? "Esse arquivo é grande: li o começo dele. Se a lição está no fim, mande essa parte separada."
      : null,
  };
}

async function prepararTextoPuro(file) {
  const { texto: conteudo, cortado } = await texto.deArquivo(file);
  if (!conteudo) throw new MaterialNaoSuportado("Esse arquivo está vazio.");

  const formato = (file.name || "").split(".").pop()?.toLowerCase() || "txt";
  const item = { tipo: "texto", nome: file.name || "texto.txt", formato, texto: conteudo };
  return {
    origem: "arquivo",
    itens: [item],
    bytes: tamanhoSerializado(item),
    rotulo: `${file.name || "texto"} · ${conteudo.length.toLocaleString("pt-BR")} caracteres`,
    aviso: cortado ? "Esse texto é longo: li os primeiros " + MAX_TEXTO_ITEM.toLocaleString("pt-BR") + " caracteres." : null,
  };
}

async function prepararAudio(file, orcamento) {
  const teto = Math.min(TETO.audio, orcamento.restante());
  const { item, bytes, duracao_s } = await audio.deArquivo(file, teto);
  return {
    origem: "audio",
    itens: [item],
    bytes,
    rotulo: duracao_s
      ? `${file.name || "áudio"} · ${formatarDuracao(duracao_s)}`
      : `${file.name || "áudio"} · ${formatarBytes(file.size)}`,
    reproduzivel: item.dados,
  };
}

async function prepararVideo(file, orcamento, ctx) {
  const { itens, bytes, resumo, aviso } = await video.deArquivo(file, orcamento, ctx);
  const partes = [`${resumo.quadros} ${resumo.quadros === 1 ? "quadro" : "quadros"}`];
  if (resumo.duracaoAudio_s) partes.push(`${formatarDuracao(resumo.duracaoAudio_s)} de áudio`);

  return {
    origem: "video",
    itens,
    bytes,
    aviso,
    rotulo: `${file.name || "vídeo"} · ${partes.join(" + ")}`,
    // O orçamento já foi debitado dentro do `video.js`, que precisa dele pra decidir
    // o rateio entre trilha e quadros. Sinaliza pra não debitar duas vezes.
    jaDebitado: true,
  };
}

/* ==========================================================================
   O dispatcher
   ========================================================================== */

let seq = 0;

/**
 * Arquivo → material pronto pra bandeja.
 *
 * @param {File} file
 * @param {ReturnType<import("./orcamento.js").novoOrcamento>} orcamento
 * @param {{onProgresso?:(texto:string)=>void, signal?:AbortSignal}} [ctx]
 * @returns {Promise<object>} `{id, nome, origem, itens, bytes, rotulo, miniatura?, aviso?}`
 */
export async function prepararMaterial(file, orcamento, ctx = {}) {
  const nome = file.name || "arquivo";
  const cabecalho = await primeirosBytes(file, 8);

  let resultado;

  if (comecaCom(cabecalho, ASSIN_PDF)) {
    ctx.onProgresso?.("Preparando o PDF…");
    resultado = await prepararPdf(file, orcamento);
  } else if (comecaCom(cabecalho, ASSIN_OLE2)) {
    throw new MaterialNaoSuportado(
      "Esse é um arquivo do Office antigo. Abra, use “Salvar como” e escolha PDF ou DOCX, aí eu leio."
    );
  } else if (comecaCom(cabecalho, ASSIN_ZIP)) {
    ctx.onProgresso?.("Abrindo o documento…");
    // É ZIP — mas `.odt`, `.pages` e `.epub` também são. Quem decide é o conteúdo.
    const entradas = await abrirZip(file);
    if (ooxml.formatoOOXML(entradas)) {
      resultado = await prepararDocumento(file);
    } else {
      const mensagem =
        recusarPorExtensao(nome) ||
        "Não reconheci esse arquivo. Salve como PDF ou DOCX e mande de novo.";
      throw new MaterialNaoSuportado(mensagem);
    }
  } else if (familia(file) === "imagem") {
    ctx.onProgresso?.("Preparando a foto…");
    resultado = await prepararFoto(file, orcamento);
  } else if (familia(file) === "video") {
    resultado = await prepararVideo(file, orcamento, ctx);
  } else if (familia(file) === "audio") {
    ctx.onProgresso?.("Preparando o áudio…");
    resultado = await prepararAudio(file, orcamento);
  } else if (familia(file) === "texto") {
    ctx.onProgresso?.("Lendo o arquivo…");
    resultado = await prepararTextoPuro(file);
  } else {
    const mensagem =
      recusarPorExtensao(nome) ||
      "Não sei ler esse tipo de arquivo. Mande uma foto, um PDF, um documento do Word, um áudio ou um vídeo.";
    throw new MaterialNaoSuportado(mensagem);
  }

  if (!resultado.jaDebitado) orcamento.gastar(resultado.bytes);

  return {
    id: `mat-${++seq}`,
    nome,
    origem: resultado.origem,
    itens: resultado.itens,
    bytes: resultado.bytes,
    rotulo: resultado.rotulo,
    miniatura: resultado.miniatura || null,
    reproduzivel: resultado.reproduzivel || null,
    aviso: resultado.aviso || null,
  };
}

/**
 * A `origem` que o plano vai gravar, a partir dos materiais da bandeja.
 *
 * `planos_estudo.origem` é um enum único e não estamos criando coluna, então quando o
 * pai mistura fontes a tela precisa escolher **uma**. A precedência vai do material
 * mais distintivo pro mais comum: um plano feito de vídeo + foto nasceu do vídeo.
 *
 * ⭐ `pedido` (16/ago/2026) fica por ÚLTIMO na escada de propósito: quando veio
 * material junto, foi o material que virou as tarefas — o pedido só orientou o
 * recorte, e um selo dizendo "criado a partir do seu pedido" esconderia do pai que
 * ali dentro tem o que a escola mandou. `manual` continua sendo só o plano digitado
 * à mão, sem IA nenhuma no meio.
 *
 * ⭐ `link` (rodada 3) fica no TOPO, e é a única origem que não segue a régua "material
 * mais distintivo primeiro": ela segue a INTENÇÃO. Foto, PDF e áudio são o que a escola
 * mandou; o link foi o responsável que escolheu aquele conteúdo de propósito, e é isso
 * que o robô precisa saber pra não chamar uma videoaula de domingo de "sua lição da
 * escola" (ver `procedenciaDoMaterial()` no `brain/prompt.js` do robô).
 *
 * @param {Array<{origem:string}>} materiais
 * @param {{pedido?:boolean}} [fonte] — houve pedido escrito?
 * @returns {"link"|"video"|"audio"|"arquivo"|"foto"|"pedido"|"manual"}
 */
export function origemDoPlano(materiais, fonte = {}) {
  const origens = new Set(materiais.map((m) => m.origem));
  for (const candidata of ["link", "video", "audio", "arquivo", "foto"]) {
    if (origens.has(candidata)) return candidata;
  }
  return fonte.pedido ? "pedido" : "manual";
}
