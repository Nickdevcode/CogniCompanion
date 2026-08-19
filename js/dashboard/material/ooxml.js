/**
 * ooxml.js — Word, PowerPoint e Excel → texto.
 *
 * Os três são ZIP de XML (ver `zip.js`), e cada um tem um jeito próprio de esconder
 * o texto. As armadilhas comentadas aqui não são teóricas: cada uma produz um
 * resultado que PARECE certo, que é o que as torna caras.
 */

import { abrirZip, lerTexto, parsearXml, ErroDeZip } from "./zip.js";
import { cortarTexto, normalizar } from "./texto.js";
import { MAX_TEXTO_ITEM } from "./orcamento.js";

/* ==========================================================================
   Word (.docx)
   ========================================================================== */

/**
 * Percorre a árvore do WordprocessingML acumulando texto na ORDEM do documento.
 *
 * Tem que ser caminhada, e não `getElementsByTagName("w:t")`: a lista plana perde
 * onde terminam parágrafos, linhas e células, e uma lista de exercícios vira um
 * parágrafo corrido em que ninguém acha a questão 3.
 *
 * @param {Element} no
 * @param {string[]} saida
 * @param {boolean} emCelula — dentro de tabela, quebra de parágrafo vira espaço
 */
function andarWord(no, saida, emCelula = false) {
  for (const filho of no.children) {
    const tag = filho.localName;

    /**
     * 🔴 `instrText` são códigos de campo: ignorar faz `HYPERLINK "http://…" \o` e
     * `PAGE \* MERGEFORMAT` aparecerem no meio do enunciado. `del`/`delText` são
     * exclusões com controle de alterações — sem pular, uma lista de exercícios que
     * a professora revisou chega com as questões velhas E as novas, e o modelo monta
     * o dobro de tarefas.
     */
    if (tag === "instrText" || tag === "delText" || tag === "del") continue;
    // Marca de revisão de formatação e propriedades: nunca têm texto de conteúdo.
    if (tag === "rPr" || tag === "sectPr" || tag === "tblPr") continue;

    if (tag === "t") {
      /**
       * 🔴 `textContent` verbatim, sem `trim()`. Word marca com `xml:space="preserve"`
       * os runs cujos espaços das pontas importam; aparar por conta própria cola
       * palavras vizinhas — "faça aexercício" — e o modelo lê como uma palavra só.
       */
      saida.push(filho.textContent);
      continue;
    }
    if (tag === "tab") {
      saida.push("\t");
      continue;
    }
    if (tag === "br" || tag === "cr") {
      saida.push("\n");
      continue;
    }

    if (tag === "p") {
      /**
       * A numeração de lista NÃO está aqui — ela é gerada a partir de `numbering.xml`
       * em tempo de renderização, então "1. 2. 3." simplesmente some do texto. E aqui
       * isso importa: "faça a questão 3" precisa do número. Reconstruir a numeração
       * real exigiria resolver `numId` + `ilvl` + o formato de cada nível; um marcador
       * custa uma linha e preserva a informação que interessa (são itens de uma lista).
       */
      const temNumeracao = filho.getElementsByTagName("w:numPr").length > 0;
      if (temNumeracao) saida.push("- ");
      andarWord(filho, saida, emCelula);
      saida.push(emCelula ? " " : "\n");
      continue;
    }
    if (tag === "tc") {
      andarWord(filho, saida, true);
      saida.push("\t");
      continue;
    }
    if (tag === "tr") {
      andarWord(filho, saida, emCelula);
      saida.push("\n");
      continue;
    }

    andarWord(filho, saida, emCelula);
  }
}

/** Extrai o texto de uma parte do Word (documento, nota, cabeçalho). */
function textoDeParteWord(xml) {
  const doc = parsearXml(xml);
  const saida = [];
  andarWord(doc.documentElement, saida);
  return normalizar(saida.join(""));
}

/**
 * @param {File} file
 * @param {Map<string, import("./zip.js").EntradaZip>} entradas
 * @returns {Promise<string>}
 */
async function lerDocx(file, entradas) {
  const corpo = entradas.get("word/document.xml");
  if (!corpo) throw new ErroDeZip("Não achei o conteúdo desse documento.");

  const partes = [];

  /**
   * Cabeçalho antes do corpo: é onde costuma estar o título ("Prova de Matemática —
   * 3º bimestre"), que é justamente o que dá nome ao plano. Deduplicado porque
   * header1/2/3 quase sempre repetem o mesmo conteúdo (primeira página, pares,
   * ímpares) e triplicar o cabeçalho só gasta token.
   */
  const jaVisto = new Set();
  for (const nome of [...entradas.keys()].sort()) {
    if (!/^word\/header\d*\.xml$/.test(nome)) continue;
    const texto = textoDeParteWord(await lerTexto(file, entradas.get(nome)));
    if (texto && !jaVisto.has(texto)) {
      jaVisto.add(texto);
      partes.push(texto);
    }
  }

  partes.push(textoDeParteWord(await lerTexto(file, corpo)));

  for (const nome of ["word/footnotes.xml", "word/endnotes.xml"]) {
    const entrada = entradas.get(nome);
    if (!entrada) continue;
    const texto = textoDeParteWord(await lerTexto(file, entrada));
    // As notas trazem duas entradas de boilerplate (separador e continuação) que só
    // têm marcação; se sobrou pouca coisa, não era conteúdo.
    if (texto.length > 3) partes.push(texto);
  }

  return partes.filter(Boolean).join("\n\n");
}

/* ==========================================================================
   PowerPoint (.pptx)
   ========================================================================== */

/** Ordena `slide2.xml` antes de `slide10.xml` — ver o comentário em `lerPptx`. */
function porNumero(a, b) {
  const na = parseInt(a.match(/(\d+)\.xml$/)?.[1] || "0", 10);
  const nb = parseInt(b.match(/(\d+)\.xml$/)?.[1] || "0", 10);
  return na - nb;
}

/**
 * Texto de um slide. Os nós do DrawingML são `<a:t>` — **não** `<w:t>` —, e o
 * parágrafo é `<a:p>`.
 */
function textoDeSlide(xml) {
  const doc = parsearXml(xml);
  const linhas = [];
  for (const p of doc.getElementsByTagName("a:p")) {
    const pedacos = [];
    for (const t of p.getElementsByTagName("a:t")) pedacos.push(t.textContent);
    const linha = pedacos.join("").trim();
    if (linha) linhas.push(linha);
  }
  return linhas.join("\n");
}

async function lerPptx(file, entradas) {
  const nomes = [...entradas.keys()];
  /**
   * 🔴 Ordem NUMÉRICA, não alfabética: `slide10.xml` vem antes de `slide2.xml` num
   * sort de string, e a apresentação chega embaralhada — com o agravante de que o
   * resultado parece plausível, então ninguém desconfia.
   *
   * A ordem canônica de verdade está em `ppt/presentation.xml` (`<p:sldIdLst>`) mais
   * os rels; o sort numérico acerta praticamente sempre por 3 linhas em vez de 60.
   */
  const slides = nomes.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort(porNumero);
  if (!slides.length) throw new ErroDeZip("Não achei slides nessa apresentação.");

  const partes = [];
  for (let i = 0; i < slides.length; i += 1) {
    const texto = textoDeSlide(await lerTexto(file, entradas.get(slides[i])));

    /**
     * As anotações do apresentador são frequentemente onde a professora escreve a
     * instrução real ("para casa: exercícios 1 a 8"), enquanto o slide só tem o
     * título. Deixar de fora seria perder o conteúdo e ficar com a decoração.
     */
    const numero = slides[i].match(/(\d+)\.xml$/)?.[1];
    const notas = entradas.get(`ppt/notesSlides/notesSlide${numero}.xml`);
    const textoNotas = notas ? textoDeSlide(await lerTexto(file, notas)) : "";

    const bloco = [`[Slide ${i + 1}]`, texto, textoNotas && `(anotações) ${textoNotas}`]
      .filter(Boolean)
      .join("\n");
    partes.push(bloco);

    if (partes.join("\n\n").length > MAX_TEXTO_ITEM) break;
  }
  return normalizar(partes.join("\n\n"));
}

/* ==========================================================================
   Excel (.xlsx)
   ========================================================================== */

/** Formatos de data embutidos do Excel (os números são fixos na spec). */
const FORMATOS_DE_DATA = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/**
 * Lê `xl/styles.xml` e devolve, por índice de estilo, se aquele estilo é data.
 *
 * Sem isso um cronograma vira uma coluna de `45231` — e o modelo, que não tem como
 * saber, chuta uma data. Como planilha de cronograma é justamente um dos casos de
 * uso da rodada, isso deixa de ser refinamento.
 */
function mapaDeEstilosDeData(xml) {
  const doc = parsearXml(xml);

  const customEhData = new Map();
  for (const fmt of doc.getElementsByTagName("numFmt")) {
    const id = parseInt(fmt.getAttribute("numFmtId"), 10);
    const codigo = fmt.getAttribute("formatCode") || "";
    // Tira texto literal entre aspas e blocos [ ] (cor, condição, locale) antes de
    // procurar y/m/d: `"total: "0.00` tem um "d"? não, mas `[$-409]` tem, e
    // `"dia "0` teria. Limpar primeiro evita classificar número como data.
    const limpo = codigo.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "");
    customEhData.set(id, /[yd]/i.test(limpo) || /m{3,}/i.test(limpo));
  }

  const estilos = [];
  const cellXfs = doc.getElementsByTagName("cellXfs")[0];
  if (cellXfs) {
    for (const xf of cellXfs.getElementsByTagName("xf")) {
      const id = parseInt(xf.getAttribute("numFmtId") || "0", 10);
      estilos.push(FORMATOS_DE_DATA.has(id) || customEhData.get(id) === true);
    }
  }
  return estilos;
}

/**
 * Serial do Excel → "YYYY-MM-DD".
 *
 * O `+ 1` de correção existe porque o Excel acredita que 1900 foi bissexto (herança
 * de compatibilidade com o Lotus 1-2-3): o serial 60 aponta pra um 29/02/1900 que
 * nunca existiu, e tudo a partir do 61 anda um dia.
 *
 * @param {number} serial
 * @param {boolean} base1904 — planilhas antigas de Mac contam a partir de 1904
 */
function serialParaData(serial, base1904) {
  const n = base1904 ? serial + 1462 : serial;
  const base = n >= 61 ? Date.UTC(1899, 11, 30) : Date.UTC(1899, 11, 31);
  const d = new Date(base + Math.floor(n) * 86400000);
  if (Number.isNaN(d.getTime())) return String(serial);
  return d.toISOString().slice(0, 10);
}

/**
 * Lê `xl/sharedStrings.xml`.
 *
 * 🔴 Um `<si>` pode ser feito de VÁRIOS runs (`<r><t>frações</t></r><r><t> equivalentes</t></r>`)
 * quando parte da célula está em negrito. Tratar cada `<t>` como uma entrada da
 * tabela desloca TODOS os índices seguintes — e o resultado é uma planilha inteira
 * com os textos trocados de lugar, plausível o bastante pra ninguém notar. É o erro
 * mais insidioso dos três formatos.
 */
function lerStringsCompartilhadas(xml) {
  const doc = parsearXml(xml);
  const strings = [];
  for (const si of doc.getElementsByTagName("si")) {
    const pedacos = [];
    for (const t of si.getElementsByTagName("t")) pedacos.push(t.textContent);
    strings.push(pedacos.join(""));
  }
  return strings;
}

/** Descobre os nomes e a ordem das abas a partir do workbook e dos seus rels. */
function abasDoWorkbook(xmlWorkbook, xmlRels) {
  const doc = parsearXml(xmlWorkbook);
  const base1904 = doc.getElementsByTagName("workbookPr")[0]?.getAttribute("date1904");

  const alvoPorId = new Map();
  if (xmlRels) {
    for (const rel of parsearXml(xmlRels).getElementsByTagName("Relationship")) {
      alvoPorId.set(rel.getAttribute("Id"), rel.getAttribute("Target"));
    }
  }

  const abas = [];
  for (const sheet of doc.getElementsByTagName("sheet")) {
    const nome = sheet.getAttribute("name") || `Planilha ${abas.length + 1}`;
    const rid = sheet.getAttribute("r:id") || sheet.getAttribute("id");
    let alvo = alvoPorId.get(rid) || "";
    if (alvo && !alvo.startsWith("xl/")) alvo = `xl/${alvo.replace(/^\/?/, "")}`;
    abas.push({ nome, caminho: alvo });
  }
  return { abas, base1904: base1904 === "1" || base1904 === "true" };
}

/** Uma planilha → linhas de texto separadas por tabulação. */
function textoDaAba(xml, strings, estilos, base1904) {
  const doc = parsearXml(xml);
  const linhas = [];
  let total = 0;

  for (const row of doc.getElementsByTagName("row")) {
    const celulas = [];
    for (const c of row.getElementsByTagName("c")) {
      const tipo = c.getAttribute("t");
      let valor = "";

      if (tipo === "s") {
        const i = parseInt(c.getElementsByTagName("v")[0]?.textContent || "-1", 10);
        valor = strings[i] ?? "";
      } else if (tipo === "inlineStr") {
        const pedacos = [];
        for (const t of c.getElementsByTagName("t")) pedacos.push(t.textContent);
        valor = pedacos.join("");
      } else if (tipo === "b") {
        valor = c.getElementsByTagName("v")[0]?.textContent === "1" ? "sim" : "não";
      } else {
        valor = c.getElementsByTagName("v")[0]?.textContent || "";
        const estilo = parseInt(c.getAttribute("s") || "-1", 10);
        if (valor && estilos[estilo] && Number.isFinite(Number(valor))) {
          valor = serialParaData(Number(valor), base1904);
        }
      }
      // Célula vazia é OMITIDA no XML, então isto não é um array denso — o
      // alinhamento entre colunas pode escorregar, e tudo bem: desalinhar é
      // legível, corromper índice não.
      celulas.push(valor);
    }

    const linha = celulas.join("\t").trimEnd();
    if (!linha) continue;
    linhas.push(linha);
    total += linha.length + 1;
    if (total > MAX_TEXTO_ITEM) break;
  }
  return linhas.join("\n");
}

async function lerXlsx(file, entradas) {
  const workbook = entradas.get("xl/workbook.xml");
  if (!workbook) throw new ErroDeZip("Não achei as abas dessa planilha.");

  const rels = entradas.get("xl/_rels/workbook.xml.rels");
  const { abas, base1904 } = abasDoWorkbook(
    await lerTexto(file, workbook),
    rels ? await lerTexto(file, rels) : null
  );

  const compartilhadas = entradas.get("xl/sharedStrings.xml");
  const strings = compartilhadas ? lerStringsCompartilhadas(await lerTexto(file, compartilhadas)) : [];

  const estilosEntrada = entradas.get("xl/styles.xml");
  const estilos = estilosEntrada ? mapaDeEstilosDeData(await lerTexto(file, estilosEntrada)) : [];

  // Se os rels não resolveram, cai na convenção de nomes em ordem numérica.
  const caminhos = abas.map((a) => a.caminho).filter((c) => entradas.has(c));
  if (!caminhos.length) {
    const achados = [...entradas.keys()]
      .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
      .sort(porNumero);
    achados.forEach((caminho, i) => {
      abas[i] = abas[i] || { nome: `Planilha ${i + 1}` };
      abas[i].caminho = caminho;
    });
  }

  const partes = [];
  for (const aba of abas) {
    const entrada = aba.caminho && entradas.get(aba.caminho);
    if (!entrada) continue;
    const texto = textoDaAba(await lerTexto(file, entrada), strings, estilos, base1904);
    if (!texto) continue;
    // O nome da aba ("Cronograma", "Provas") é contexto de graça pro modelo.
    partes.push(`[${aba.nome}]\n${texto}`);
    if (partes.join("\n\n").length > MAX_TEXTO_ITEM) break;
  }

  if (!partes.length) throw new ErroDeZip("Essa planilha está vazia.");
  return normalizar(partes.join("\n\n"));
}

/* ==========================================================================
   Entrada pública
   ========================================================================== */

/**
 * Descobre qual OOXML é, pelas entradas do ZIP.
 *
 * Pela lista de arquivos e não pela extensão: `.odt`, `.pages`, `.key`, `.numbers` e
 * `.epub` também são ZIP, e o pai renomeia arquivo. O que distingue é o conteúdo.
 *
 * @param {Map<string, import("./zip.js").EntradaZip>} entradas
 * @returns {"docx"|"pptx"|"xlsx"|null}
 */
export function formatoOOXML(entradas) {
  if (entradas.has("word/document.xml")) return "docx";
  if (entradas.has("ppt/presentation.xml")) return "pptx";
  if (entradas.has("xl/workbook.xml")) return "xlsx";
  return null;
}

/**
 * Arquivo OOXML → texto extraído.
 *
 * @param {File} file
 * @returns {Promise<{formato:string, texto:string, cortado:boolean}>}
 */
export async function deArquivo(file) {
  const entradas = await abrirZip(file);
  const formato = formatoOOXML(entradas);

  if (!formato) {
    // Chegou aqui como ZIP que não é OOXML. O `index.js` já filtra os conhecidos
    // (.odt, .pages), então isto é o resto — e a mensagem tem que ensinar mesmo assim.
    throw new ErroDeZip(
      "Não reconheci esse arquivo. Salve como PDF ou DOCX e mande de novo."
    );
  }

  let bruto;
  if (formato === "docx") bruto = await lerDocx(file, entradas);
  else if (formato === "pptx") bruto = await lerPptx(file, entradas);
  else bruto = await lerXlsx(file, entradas);

  const { texto, cortado } = cortarTexto(bruto);
  if (!texto) {
    throw new ErroDeZip(
      "Esse arquivo não tem texto que eu consiga ler; talvez seja só imagem. Tente mandar como foto."
    );
  }
  return { formato, texto, cortado };
}
