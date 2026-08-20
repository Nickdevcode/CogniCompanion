# 🤖 Cogni — A tutora de IA que pensa, aprende e evolui com você

> Site institucional do **Cogni**, um projeto de TCC do **UNASP** que apresenta uma tutora robótica com inteligência artificial: ela ouve, enxerga e responde em tempo real, transformando dúvidas em descobertas e adaptando o ensino ao ritmo de cada pessoa.

Mais do que um robô, o Cogni é a união de **hardware + IA** numa experiência completa de aprendizado personalizado — combinando reconhecimento de fala, visão computacional e modelos de linguagem de última geração. 🧠✨

---

## 📑 Índice

|  | Seção | O que tem lá |
| --- | --- | --- |
| 🌐 | [Sobre o projeto](#-sobre-o-projeto) | o que é o Cogni e o que este repositório contém |
| 📄 | [Páginas](#-páginas) | as 7 telas do site, arquivo por arquivo |
| ✨ | [Destaques técnicos](#-destaques-técnicos) | design system, tema claro/escuro, acessibilidade, zero build |
| 🔐 | [Autenticação](#-autenticação-login-cadastro-e-sessão) | Supabase Auth, sessão persistente e o gate de download do jogo |
| 📊 | [**Painel Companion**](#-painel-companion-dashboard-dos-pais) | o app dos pais, e a maior parte deste README |
| 🎨 | [Rosto da Cogni](#-rosto-da-cogni--a-tela-da-criança) | a única tela feita pra criança, e a contribuição científica do TCC |
| 🗂️ | [Estrutura de pastas](#️-estrutura-de-pastas) | onde cada coisa mora |
| 🚀 | [Como rodar](#-como-rodar-localmente) | subir na sua máquina, e como o site vai ao ar |
| 👥 | [Equipe](#-equipe) · [Tecnologias](#️-tecnologias) | quem fez, e com o quê |

<details>
<summary><b>📊 Dentro do Painel Companion</b> — as features, uma a uma</summary>

- [De onde vêm os dados](#-de-onde-vêm-os-dados)
- [A chave que liga tudo: `USAR_SUPABASE`](#️-a-chave-que-liga-tudo-usar_supabase)
- [Servidor local (`SERVIDOR_URL`)](#-servidor-local-servidor_url)
- [Onboarding & pareamento](#-onboarding--pareamento)
- [Primeira visita: o tutorial guiado](#-primeira-visita-o-tutorial-guiado)
- [Dicas contextuais (os "?" espalhados pelo painel)](#-dicas-contextuais-os--espalhados-pelo-painel)
- [O perfil tem duas pontas escrevendo nele (site e voz)](#️-o-perfil-tem-duas-pontas-escrevendo-nele-site-e-voz)
- [As 14 matérias (e por que quem decide é o servidor)](#-as-14-matérias-e-por-que-quem-decide-é-o-servidor)
- [Trilha de aprendizado (no Painel de Aprendizado)](#-trilha-de-aprendizado-no-painel-de-aprendizado)
- [Mapa da aula — em que minuto ela parou de entender](#️-mapa-da-aula--em-que-minuto-ela-parou-de-entender)
- [Mesa de Estudos — o plano vira um quadro que anda sozinho](#️-mesa-de-estudos--o-plano-vira-um-quadro-que-anda-sozinho)
- [A revisão de design do painel (18/ago/2026)](#-a-revisão-de-design-do-painel-18ago2026)
- [Arquivos do painel](#️-arquivos-do-painel)

</details>

---

## 🌐 Sobre o projeto

Este repositório tem **duas metades**, e vale saber disso antes de ler o resto:

- 🌐 **O site de apresentação** — estático, responsivo e com tema claro/escuro. Mostra a proposta, os materiais, o jogo e o artigo científico que documentam o desenvolvimento do projeto.
- 📊 **O Cogni Companion** (`dashboard.html`) — o app onde o responsável acompanha a criança: o que ela estudou, em que minuto travou, e os planos de estudo que a Cogni segue na conversa. É a maior parte do código daqui, e a maior parte deste README.

Os dois foram construídos **do zero em HTML, CSS e JavaScript puro** (sem frameworks e sem etapa de build), com foco em performance, acessibilidade e uma identidade visual própria, reproduzindo fielmente o design feito no Figma.

---

## 📄 Páginas

| Página | Arquivo | O que tem |
| --- | --- | --- |
| 🏠 **Home** | `index.html` | Apresentação geral: projeto, materiais, jogo, artigo científico e equipe |
| 🛠️ **Produto** | `produto.html` | Detalhes dos materiais/componentes usados na construção do Cogni |
| 🎮 **Jogo** | `jogo.html` | Página do jogo do Cogni (história, fases e download) |
| 📘 **Instruções** | `instrucoes.html` | Como usar / saber mais sobre o Cogni |
| 🔐 **Login** | `login.html` | Tela de acesso |
| 📝 **Cadastro** | `cadastro.html` | Tela de cadastro |
| 📊 **Painel Companion** | `dashboard.html` | O app dos pais: uma SPA com 7 seções ([tem seção só dele](#-painel-companion-dashboard-dos-pais)) |

---

## ✨ Destaques técnicos

- 🎨 **Design system próprio** — tokens de cor, tipografia e espaçamento centralizados em `css/tokens.css`, com componentes reutilizáveis.
- 🌗 **Tema claro/escuro** — alternância de tema com persistência em `localStorage` e script anti-flash (aplica o tema antes da tela pintar).
- 📱 **Totalmente responsivo** — layouts adaptados para desktop e mobile, com textos e imagens otimizados por tamanho de tela.
- 🎬 **Animações ao rolar** — efeitos de *reveal* e micro-interações suaves, com fallback para quem desativa o `js`.
- ♿ **Acessibilidade** — uso de `aria-*`, textos alternativos nas imagens e HTML semântico.
- ⚡ **Zero dependências de build** — nada de instalar pacote nem compilar: é servir a pasta e pronto.

---

## 🔐 Autenticação (Login, Cadastro e Sessão)

O login e o cadastro são **reais e funcionais**, feitos com **[Supabase Auth](https://supabase.com/auth)**
(e-mail/senha + login com Google). Como o site é estático, a autenticação roda direto no navegador via
a CDN oficial do `@supabase/supabase-js` — sem back-end próprio e sem build.

### ✨ O que está implementado

| Recurso | Descrição |
| --- | --- |
| 📝 **Cadastro** | Cria a conta (e-mail/senha), guarda o nome e já entra (confirmação de e-mail desativada) |
| 🔑 **Login** | Entra com e-mail/senha, com mensagens de erro claras em português |
| 🟦 **Login com Google** | Autenticação social via OAuth (`signInWithOAuth`) |
| 👤 **Sessão persistente** | Continua logado entre reloads e abas; badge do usuário no header com menu (Dashboard / Sair) |
| 🎮 **Gate de download** | Os botões de baixar o **jogo** só funcionam logado; deslogado, mostram um aviso pedindo login |
| 🔔 **Notificações (toasts)** | Sistema de avisos acessível e reutilizável para sucesso/erro/informação |

> 📄 O download do **artigo científico (PDF)** continua **livre**, sem exigir login.

### 🔑 Sobre a chave do Supabase (importante)

Num site estático **não existe "esconder" credencial no front-end** — qualquer chave usada pelo JavaScript
fica visível. Por isso usamos a **chave pública (`anon`/`public`) do Supabase**, que é **feita para ficar
exposta** e **não é um segredo**. A segurança real vem do **RLS (Row Level Security)** no banco e do próprio
Supabase Auth (hash de senha, sessão/JWT). A chave secreta (`service_role`) **nunca** aparece no front.
👉 [Doc oficial sobre as chaves](https://supabase.com/docs/guides/api/api-keys)

### 🗃️ Arquivos de autenticação

| Arquivo | Função |
| --- | --- |
| `js/supabase-config.js` | Inicializa o cliente Supabase (URL + anon key) e expõe helpers em `window.cognifyAuth` |
| `js/auth.js` | Lógica das telas de login e cadastro (validação, `signUp`, `signInWithPassword`, Google) |
| `js/session.js` | Header dinâmico (badge + menu), `signOut`, sessão em tempo real e gate de download |
| `js/toast.js` | Notificações (toasts) reutilizáveis e acessíveis |
| `css/auth-ui.css` | Estilos da badge, menu, toasts e estados de formulário (erro/carregando) |

> ⚙️ As credenciais ficam em `js/supabase-config.js` (`SUPABASE_URL` e `SUPABASE_ANON_KEY`).
> A biblioteca do Supabase é carregada por CDN com **SRI** (`integrity` + `crossorigin`) e versão fixa,
> para proteger contra um eventual comprometimento da CDN.

---

## 📊 Painel Companion (Dashboard dos pais)

O `dashboard.html` é o **app dos pais**: uma SPA leve (sidebar + seções trocadas por hash, sem reload)
onde o responsável acompanha a criança. Ele é **single-child** — um responsável enxerga **uma** criança,
a que estiver pareada por código. Tudo segue o **contrato de dados** do `docs/COMPANION-PLANO-TECNICO.md`.

### 🔌 De onde vêm os dados

O painel lê de **duas fontes**, e ambas já estão integradas:

| Fonte | O quê | Como |
| --- | --- | --- |
| 🗄️ **Supabase** | Criança, conversas (Diário), planos de estudo, perfil, **trilha de aprendizado**, **aulas do Mapa** | `@supabase/supabase-js` (anon key + RLS). Conversas, trilha e aulas são **só leitura** pelo site; planos têm CRUD |
| 🖥️ **Servidor local da Cogni** | Resumo Semanal (IA), Dica da Cogni (IA), **Mapa da aula ao vivo + seu resumo** (IA), rosto do robô, pareamento/despareamento | `fetch` nos endpoints `/api/...` (precisa do robô/servidor ligado) |

### 🎛️ A chave que liga tudo: `USAR_SUPABASE`

No topo de `js/dashboard/mock-data.js` há uma flag:

```js
export const USAR_SUPABASE = true;  // true = dados reais · false = dados de exemplo (mock)
```

- **`true`** (padrão): o painel usa o **Supabase real** + a data atual (`new Date()`).
- **`false`**: volta pros **dados de exemplo** (mock), ancorados numa data fixa — útil pra **demonstrar**
  com telas cheias e bonitas mesmo sem o robô ligado, ou pra desenvolver offline.

As implementações reais ficam isoladas em `js/dashboard/supabase-data.js` (mesma "cara" do mock — por isso
trocar a flag não muda nenhuma tela).

### 🌐 Servidor local (`SERVIDOR_URL`)

Tudo que depende de IA ou de falar com o robô passa pelo servidor que roda junto dele. A URL fica no topo
de `js/dashboard/servidor.js` (o `main.js` só a reexporta, pra não quebrar quem já importava de lá):

```js
export const SERVIDOR_URL = "http://127.0.0.1:3000";
```

> ⚠️ **Por que `127.0.0.1` e não `localhost`?** O servidor escuta só em IPv4, e os navegadores costumam
> resolver `localhost` para IPv6 (`::1`) primeiro — o que derruba o `fetch` com `ERR_CONNECTION_RESET`.
> Forçar `127.0.0.1` (IPv4) evita o problema. Se você subir o servidor noutra máquina/porta, troque aqui.

**Plano criado no site chega na Cogni na hora.** Quem faz isso é o **Realtime do Supabase** (o servidor
escuta `planos_estudo`); o site ainda dá um `POST /api/planos/refrescar` depois de criar, editar ou excluir
um plano, como **plano B** caso a replicação esteja desligada ou o canal caia. Esse ping é **best-effort**:
com o robô desligado ele falha em silêncio — e tudo bem, o plano já está salvo no Supabase e ele o pega no
boot. Nada de erro na tela do pai por causa disso.

### 🧩 Onboarding & pareamento

Quando o pai entra e **ainda não tem criança vinculada**, aparece um **onboarding em tela cheia**. Ele é
um **portão**: sem vínculo o painel não monta, então esta tela precisa dar conta sozinha de acolher,
explicar e desbloquear.

- **Primeira vez** (sem histórico no navegador): 3 telas — duas de apresentação com animação + a de
  pareamento (código de 6 caracteres).
- **Depois** (ou se despareou): vai **direto** pra tela de pareamento, sem repetir a apresentação.

O código é validado **pelo servidor** (que seta o vínculo com a `service_role`) — o site **nunca** escreve
o `responsavel_id` direto. Em **Configurações** dá pra ver o código do perfil e **desvincular** (com
confirmação). O vínculo é **permanente**: só some se você desvincular.

#### O que a rodada de refinamento (ago/2026) trouxe

| O que | Por quê |
| --- | --- |
| **"Passo 2 de 3"** + barra de progresso | Saber quanto falta é o que separa "deixa eu ver" de "isso vai tomar minha tarde?" |
| **Sonda de rede** antes de digitar (`Procurando a Cogni…` → `Cogni encontrada` / `Não estou enxergando`) | Descobrir que o robô está desligado **depois** de digitar 6 caracteres vira "este site não funciona". A sonda **nunca bloqueia** o envio: navegadores tratam rede privada de formas diferentes, e um falso negativo não pode barrar um pareamento que funcionaria |
| **"Onde encontro o código?"** embutido (`<details>` nativo) | Mandar quem está no meio de um formulário de 6 caixinhas pra outra página é perder metade das pessoas |
| **Envio automático** ao completar o 6º caractere | Código completo na tela + botão ainda por apertar é um passo sem nenhuma decisão dentro |
| **Tela de sucesso** com o nome da criança | É a única virada real do produto, e o painel demora ~1,4s pra recarregar. Um `<p>` verde não marcaria o momento |
| **"Sair da conta"** no rodapé | Sem criança vinculada, a badge da conta (que tem o "Sair") **nem existe**. Sem esse rodapé, quem não consegue parear fica preso numa tela sem porta |
| **Foco preso no overlay + slides inertes** | Com as 3 telas no DOM, o Tab passeava pelos campos da tela seguinte, invisíveis |
| **A flag "já viu" grava ao CHEGAR no pareamento** | Quem fechava a aba no portão pra ir buscar o código no robô voltava e assistia a apresentação inteira de novo |

### 🧭 Primeira visita: o tutorial guiado

Na **primeira vez** que o painel abre com uma criança vinculada, entra um **tutorial guiado de 10
paradas** que anda **pelo app de verdade**: ele troca de seção, rola até o elemento, recorta um foco
dourado em volta dele e explica num balão. Não é vídeo nem carrossel de prints — a tela destacada é a
tela do pai.

- **Dá pra pular** a qualquer momento (botão "Pular tutorial", o ✕ do canto, ou `Esc`). Pular e concluir
  gravam a mesma coisa: o pai já decidiu.
- **Setas ← →** andam entre as paradas; o `Tab` fica preso no balão.
- **Rever depois:** *Configurações → Ajuda → "Rever o tutorial"*.
- A flag é **por usuário** (`cognify-tour-visto:<id>`): duas contas no mesmo computador têm cada uma o
  seu primeiro acesso.
- O pareamento termina em `location.reload()`, então o tour não pode começar ali (morreria com a página).
  O onboarding deixa a marca `cognify-tour-pendente` e o boot seguinte a consome.

**Três layouts, e a razão de serem três:**

| Layout | Quando | Por quê |
| --- | --- | --- |
| **Flutuante** | Desktop | Ancora no alvo, com setinha, escolhendo o lado que cabe |
| **Folha** (bottom sheet) | Celular em pé | Balão flutuante em 360px ou cobre o alvo ou fica com 6 palavras por linha |
| **Painel lateral** | Celular **deitado** | Medido em 844×390: uma folha come 242px dos 390 e tapa exatamente o que explica. Encostado na direita, sobra a tela toda pro destaque |

Detalhes que não são óbvios e estão no código: alvo que **não aparece** (conta nova sem conversa e sem
plano) não trava nada — o balão vira **centrado**; a rolagem **não é travada** (o pai pode conferir o
entorno) e por isso foco e balão se reposicionam a cada `scroll`/`resize`; e o passo da navegação aponta
pra **sidebar** no desktop e pra **tab bar** no celular, porque abaixo de 900px a sidebar mora em
`translateX(-105%)`.

### 💬 Dicas contextuais (os "?" espalhados pelo painel)

Um motor só (`tooltip.js`), delegado no documento, com **um balão reaproveitado** — o painel tem centenas
de alvos possíveis e um nó por alvo encheria o DOM de coisa que quase nunca aparece. São **dois padrões**,
e a escolha entre eles é de **acessibilidade**, não de gosto:

| Padrão | Onde usar | Comportamento |
| --- | --- | --- |
| `data-dica="…"` | Em algo que **já é interativo** (botão, link, campo) | Abre no hover e no foco de teclado; vira `aria-describedby` enquanto está aberto |
| `dicaInfo(texto, { rotulo })` | Pra explicar algo **não-interativo** (um número, um selo, um rótulo) | Devolve um `<button>` "?" de verdade: chega no `Tab`, abre no **toque**, e o leitor de tela anuncia "Ajuda: Tempo total" |

> ⚠️ `data-dica` num `<span>` solto só enriquece o **hover** — teclado e toque nunca chegariam nele. Nesses
> casos a mesma explicação precisa existir num `?` por perto. É exatamente o que foi feito com o selo
> "Subiu de nível" da Trilha, que antes usava `title` nativo (invisível no celular).

O balão é **escuro nos dois temas** de propósito: ele flutua sobre cards claros e escuros, e uma superfície
que mudasse de cor junto com o tema sumiria sobre metade deles. Rolagem, `Esc` e resize fecham. O `?` tem
**área de toque de 44px** sem inchar o layout (um `::after` invisível), o que resolve o alvo impossível de
acertar no celular sem empurrar o rótulo do lado.

### 🎙️ O perfil tem duas pontas escrevendo nele (site **e** voz)

Desde **15/ago/2026** a tela de Configurações deixou de ser o único caminho pro perfil do filho: o pai
consegue ajustar os **9 campos** falando com o robô — inclusive o `prompt_personalizado` ("não fale sobre
morte com ele"). Os planos da **Mesa de Estudos** continuam **exclusivos do site** (plano se monta olhando
a semana inteira numa tela, não de viva-voz — o que o robô faz lá é só **mover card de coluna**). Não há
coluna, endpoint nem contrato novo — o que muda é **quem escreve**.

Como `criancas` resolve conflito por **última escrita vence**, um formulário montado sobre uma linha velha
apaga o que foi ditado — sem erro, sem aviso. Por isso o perfil é relido em **três momentos**:

| Quando | Por quê |
| --- | --- |
| Ao entrar em **Configurações** | `getCrianca({ fresco: true })` fura o cache curto da camada de dados |
| Ao **abrir o modal** de edição | Entre chegar na tela e clicar no card pode ter passado uma conversa inteira — o formulário nasce do banco |
| Ao **voltar pra aba** | O caso real: deixar o Companion aberto, ir falar com o robô e voltar. Com o modal aberto essa releitura **não** roda (repintar por baixo do formulário só confundiria) |

Duas coisas menores fecham o ciclo: o textarea do prompt **preserva as quebras de linha** (as instruções
ditadas entram uma por linha, e ele cresce com o conteúdo até 260px em vez de virar uma janelinha com
scroll), e uma nota discreta abaixo do campo conta que **dá pra ditar isso falando com o robô** — antes
nada na tela revelava que essa porta existia.

> ⚠️ **Honestidade sobre o limite:** a releitura fecha a janela comum, não todas. Se o pai ficar com o modal
> aberto e a criança ditar algo nesse meio-tempo, o "Salvar perfil" ainda grava por cima. Fechar isso de vez
> pede um patch diferencial (mandar só os campos que o pai realmente mexeu) — decisão pendente.

### 📚 As 14 matérias (e por que quem decide é o servidor)

A lista de matérias era do **ensino fundamental**: um único `ciencias` cobria física, química e biologia, e
filosofia, sociologia, artes e educação física caíam em `outros` — junto do papo furado. Pro aluno do
**médio** isso apagava a informação inteira: ele tem três professores de ciências, e o Painel dizia
*"Ciências: 40min"* sem contar se foi Estequiometria ou Genética. Agora são 14:

| Área | Matérias |
| --- | --- |
| 🗣️ **Linguagens** | `portugues` · `idiomas` · `artes` |
| 🔢 **Matemática** | `matematica` |
| 🔬 **Ciências da Natureza** | `ciencias` · `fisica` · `quimica` · `biologia` |
| 🏛️ **Ciências Humanas** | `historia` · `geografia` · `filosofia` · `sociologia` |
| 🤸 **Corpo e movimento** | `educacao_fisica` |
| 💬 **Outros** | `outros` (papo que não é matéria escolar) |

> ⚠️ **A granularidade é decisão do servidor, e o site não a replica.** O classificador olha o termo, e a
> **etapa escolar** decide o nome: no fundamental, física/química/biologia são gravadas como `ciencias`; no
> médio, ficam separadas (chamar de "Biologia" a aula de fotossíntese de uma criança do 4º ano descolaria o
> Painel do boletim que ela leva pra casa). O valor que chega em `conversas.materia` **já vem ajustado** — o
> site só precisa *conhecer* os 14 valores. Uma segunda cópia dessa regra aqui divergiria em silêncio.

Do lado do site, três coisas que isso exigiu:

- 🎨 **Uma cor por matéria, organizada por área.** Com 14 itens a cor não identifica mais a matéria sozinha
  (o nome e o ícone estão sempre do lado) — ela comunica a **área**: as ciências da natureza na família do
  verde, as humanas na do roxo, as linguagens no quente. As 7 cores originais **não mudaram**. A paleta foi
  conferida por contraste (WCAG) e por distância perceptual (CIEDE2000) nos dois temas.
- 🧭 **Listas agrupadas.** O filtro do Diário e os `<select>` da Mesa de Estudos e de Ajustes separam por área
  (`materiasAgrupadas()` em `format.js`). O agrupamento é **só apresentação**: o dado e o filtro continuam
  usando a matéria fina. E os grupos derivam de `MATERIAS`, então uma matéria futura que ninguém agrupar
  cai no último grupo em vez de sumir da tela.
- 🎯 **Um lugar só pro CSS.** `[data-materia="…"]` → `--mat-color`/`--mat-soft` mora em `dashboard.css`, e
  os componentes só leem as variáveis. Antes a lista era repetida nos 4 CSS de seção; com 14 matérias
  seriam ~250 linhas iguais em 4 arquivos.

> 🎭 `artes` e `educacao_fisica` são **conservadoras** no classificador: só entram por conteúdo real da
> matéria (teoria das cores, regras do vôlei), nunca por hobby ("gosto de desenhar", "joguei bola"). Pouca
> coisa nelas é desenho, não bug.

### 📈 Trilha de aprendizado (no Painel de Aprendizado)

O cérebro da Cogni tem um *student model*: a cada conversa ele anota **o assunto estudado, como a criança
se saiu e quando aquilo deve voltar** (prática espaçada), tudo na coluna `criancas.progresso` (jsonb).
O painel lê isso e transforma em duas perguntas que o pai não conseguia responder antes:

| Bloco | O que mostra | Vem de |
| --- | --- | --- |
| 🌱 **Praticando agora** | O que ainda precisa de reforço + o que ela acertou só uma vez ("quase lá"), com a matéria, quando foi visto e **quando a Cogni retoma** | `status: "travou"`, ou `"aprendeu"` com menos de 2 acertos |
| ✅ **Já domina** | O que ela acertou sozinha mais de uma vez, com o nº de acertos seguidos | `status: "aprendeu"` e `acertos >= 2` |

Desde a reforma pedagógica de ago/2026 a Cogni também **propõe exercícios** e confere a resposta por conta
própria, calibrando um `nivel` (1 a 3) por assunto. Em "Praticando agora", quem passou do nível inicial
ganha um selo discreto **↑ subiu de nível**: ela está resolvendo exercícios mais difíceis do mesmo assunto.
Ele só aparece quando o último veredito foi bom — num item que travou o nível acabou de *cair*, então o
selo seria mentira. Item antigo sem o campo conta como nível 1.

Três regras que valem a pena não esquecer:

- 🔒 **`progresso` é read-only pro site.** Quem escreve é **só o servidor**. A allowlist `EDITAVEIS` em
  `supabase-data.js` garante isso — se ela um dia virar um "manda o objeto inteiro", a trilha da criança
  é apagada a cada edição de perfil pelo pai.
- 💬 **O tom é de apoio, nunca de boletim.** `travou` é linguagem interna e **não aparece na tela**: o pai
  lê "precisa de reforço", "quase lá", "já domina". Nada de nota, ranking ou vermelho de erro.
- 🛡️ **Dado torto não derruba a tela.** Como é jsonb livre, cada item passa por um saneamento (conceito
  vazio, status desconhecido, matéria inventada ou data inválida são descartados/normalizados).

### 🗺️ Mapa da aula — em que minuto ela parou de entender

A Trilha responde *"o que ela está aprendendo"*; o **Mapa da aula** responde a pergunta que nenhum sistema
escolar responde: **em que minuto** ela travou, e **sobre o quê**. É a resposta do TCC ao concorrente (um
CRM de professor cuja feature mais elogiada é a chamada automática — que mede quem estava na sala, o dado
mais fácil de coletar e o que menos diz sobre aprendizado). A frase que resume a tela inteira:

> *"aos 4min12, quando entrou 'frações equivalentes', ela travou por 40s."*

O servidor cruza, durante a conversa, **o assunto de cada turno** com **os sinais que a câmera leu** e **os
vereditos dos exercícios**, e grava a aula fechada em `sessoes_atencao`. O site só desenha:

| Parte | O que é |
| --- | --- |
| 💬 **O resumo em texto** | 2–3 frases por IA (`/api/mapa-aula/resumo`) — é o que o pai lê primeiro |
| 📍 **O que vale rever** | O destaque da tela, e ele responde **duas** perguntas: *o quê* (`assuntoMaisDificil` — o tópico que somou mais atrito na aula inteira) e *quando* (`pontoDeAtrito` — o minuto em que começou). Quando os dois apontam pro mesmo assunto, a segunda linha vira só a hora; quando não, aparece o *"o primeiro tropeço veio antes, aos 4min12, em frações"* |
| 📊 **A linha do tempo** | Faixa de 0 até a duração, um marcador por momento. **Forma** = origem (● câmera · ◆ exercício conferido · ○ lido na conversa), **cor** = tom. Abaixo, a mesma linha em lista de texto |
| 🔴 **Modo ao vivo** | Com o robô conversando, a aula **se desenha na tela**: poll de 10s e selo "acontecendo agora" pulsando. Dá pra abrir no celular e acompanhar |
| 🕘 **Aulas registradas** | O histórico; clicar troca a aula em destaque |

> 🧩 **As três origens não valem o mesmo, e a forma diz isso.** Exercício conferido é **fato** (◆), câmera é
> **impressão** (●), e o que a Cogni leu da própria conversa é **leitura** (○ — anel vazado, de propósito o
> mais discreto). Esse terceiro tipo é o mais frequente da linha: antes dele, uma aula inteira de explicação
> e dúvida produzia **zero momentos**, e o mapa dizia "correu tranquila" em quase toda sessão.

Quatro cuidados que sustentam a tela:

- 🗣️ **`travada`/`travou` nunca aparecem.** O que vai pra tela é o `rotulo` que o servidor manda pronto
  ("precisou de mais ajuda", "estava no embalo"). E se um rótulo vier **igual** ao sinal — o que acontece
  quando o robô ganha um sinal novo e esquece de nomeá-lo —, o site troca por um neutro em vez de vazar.
  Desde ago/2026 a tabela do `mapa-api.js` também **tira o gênero** de dois rótulos que o robô manda no
  feminino: `estava embalada` → *"estava no embalo"* e `resolveu sozinha` → *"resolveu sem ajuda"*
  (ver "A revisão de design do painel"). O `rotulo` cru no banco continua o do servidor.
- 🚫 **Não é placar.** Os `contadores` chegam no payload e **de propósito não viram números**: "2 acertos ×
  1 tropeço" é boletim com outro nome. O cabeçalho mostra só duração e trocas de conversa. Pelo mesmo
  motivo, o `peso` do assunto mais difícil é descartado (é ranking interno) e as `ocorrencias` viram frase
  — *"esse ponto voltou algumas vezes"* —, nunca contagem.
- 😌 **Aula sem nada a rever é boa notícia**, não tela vazia. Desde ago/2026 esse é o caso **comum**, e
  ele tem três textos conforme o que a linha do tempo mostra logo abaixo (ver "Quando o mapa aprendeu a
  não concluir").
- ♿ **Não depende de cor nem de posição.** Cada marcador é um `<button>` com o momento inteiro no
  `aria-label`, a lista repete tudo em texto, e tocar um marcador destaca a linha correspondente (no
  celular não existe hover).

> 🔌 O histórico é lido **direto do Supabase**, e não só do endpoint, por um motivo específico: quando há
> aula ao vivo, `/api/mapa-aula` devolve `historico: []` (ele prioriza a sessão que está em RAM). Sem a
> tabela, as aulas anteriores sumiriam da tela **exatamente durante a demonstração ao vivo** — e o
> histórico também continua valendo com o robô desligado.

#### 🩺 Quando o mapa aprendeu a não concluir (ago/2026)

> *"Sinto que o mapa da aula não é confiável. Às vezes ele dá uma mentida, às vezes ele inventa."*

O relato estava certo. Uma auditoria do motor no robô achou **seis** defeitos independentes, todos
silenciosos, todos com o mesmo padrão: **o mapa afirmava com confiança algo que os dados não sustentavam.**
Uma careta de 2s ganhava de um exercício conferido errado; um assunto grudava no momento sem prazo de
validade e virava *"travou em frações"* 44 min depois de frações sair da mesa; a webcam ligada segurava a
sessão viva e transformava uma aula de 6 min em *"aula de 47 minutos"*.

Tudo isso foi corrigido **no servidor**. Nenhum campo antigo sumiu nem mudou de tipo, então a tela não
quebrou — mas ela ficou desalinhada, e o realinhamento inteiro cabe numa frase: **a tela passou a concluir
menos, e cada estado a menos precisou parecer intencional.**

| O que mudou no site | Por quê |
| --- | --- |
| 🔴 **O recálculo local do `pontoDeAtrito` foi DELETADO** | O critério do servidor inverteu (era câmera → exercício → conversa, virou exercício → conversa → **câmera só se corroborada**) e passou a depender de agrupar tópico com a mesma chave de conceito da trilha do robô. Replicar isso no front seria recriar a normalização inteira; replicar pela metade seria divergir em silêncio — o defeito que a reforma acabou de remover |
| 🤝 **Marcador tracejado** | Leitura de câmera que nenhuma outra fonte confirmou (`confianca: 'baixa'`). Vazado e tracejado: a linha existe, mas não fecha. A palavra "confiança" **nunca** aparece pro pai — na tela isso vira *"só a câmera percebeu"* |
| 🌱 **Halo verde + selo "destravou depois"** | `superado: true` = ela emperrou e destravou **sozinha**, na mesma aula. É a melhor notícia que a tela tem pra dar, e sem tratamento próprio ficava visualmente igual a um atrito pendente |
| ⏱️ **"14 min de estudo"** | `tempoEfetivoMs` é a duração **sem** os silêncios longos. Vem nomeado de propósito: ele é menor que o fim da régua da linha do tempo, e sem a palavra "estudo" o cabeçalho pareceria contradizer o desenho |
| 🤔 **"Parece que…" em vez de "o ponto do dia foi…"** | Numa aula sustentada só pela câmera, ou num assunto que só ela apontou, a frase pondera exatamente onde o dado pondera |
| 🤐 **Histórico sem derivado não ganha cabeçalho** | O histórico lido direto de `sessoes_atencao` (o contorno de quando o endpoint devolve `historico: []`) não traz `pontoDeAtrito`. Aí a tela mostra a linha do tempo e **cala** — inclusive nos cartõezinhos, que antes diriam *"correu tranquila"* pra toda aula do histórico |

> ⚠️ **`topico: null` num momento é ESPERADO, não é bug.** O assunto de um momento agora vence em 4 min sem
> ser mencionado; passada a janela, o servidor se recusa a chutar. A tela deixa o complemento de fora — e
> **nunca** cai no primeiro item de `topicos[]` pra preencher, que é literalmente o defeito nº 1 da lista.

> 🚫 **Nada de derivado pode ser cacheado.** `pontoDeAtrito`, `assuntoMaisDificil` e `qualidade` são
> recalculados pelo servidor **a cada leitura** — é assim que uma aula gravada antes da reforma para de
> repetir a leitura errada de ontem. O mesmo `id` de sessão pode devolver derivados diferentes depois de uma
> mudança de critério no robô. Cachear `momentos` seria seguro; cachear derivado, não.

### 🗒️ Mesa de Estudos — o plano vira um quadro que anda sozinho

A tela de **Planos** fazia uma coisa só: o pai digitava um parágrafo e a Cogni seguia o assunto.
Dois problemas nisso. **Escrever plano dá trabalho** — a informação já está na agenda, na folha de
exercícios, no bilhete da professora — e na prática plano que dá trabalho não é criado. E **um
parágrafo não é um progresso**: ninguém sabia o que já tinha sido feito, o que estava rolando e o
que faltava.

Agora é a **Mesa de Estudos** (`#/mesa`), e ela faz três coisas:

| | O quê | Por que importa |
| --- | --- | --- |
| 💬 | **Pedido → plano** | O pai escreve o que quer (*"revisar a tabuada do 7, 20 min por dia"*) e a IA monta as tarefas. **Não depende de a escola ter mandado nada** |
| 📎 | **Material → plano** | E quando a escola mandou, ele junta — foto, PDF, Word, slides, planilha, áudio da professora ou vídeo da lousa — e a IA extrai as tarefas de lá, com matéria e prazo. Ele revisa e aprova |
| 🔗 | **Link → plano** | Cola a **videoaula do YouTube** ou o **link de uma página** e a Cogni monta as sessões de estudo do que aquele conteúdo ensina |
| 🗂️ | **Quadro Kanban** | `A fazer` · `Fazendo` · `Feito`, com arraste de mouse, de dedo **e de teclado** |
| ✨ | **O quadro é vivo** | A Cogni move os cards sozinha enquanto conversa com a criança — e com a tela aberta o pai **vê acontecer** |
| 🥇 | **A fila de planos** | Com vários planos valendo, o pai **arrasta a faixa** e diz por onde ela começa. A ordem dele é a prioridade que o robô segue |
| 🖊️ | **A IA dentro dos campos** | Quem prefere escrever o plano na mão não fica sozinho: um ✨ em cada campo melhora, encurta ou detalha o que ele digitou — com **desfazer** do lado |

> 💬 **Por que o pedido virou a entrada principal (16/ago/2026).** A primeira versão perguntava
> *"o que a escola mandou?"* e só isso — o que assume uma escola organizada mandando PDF e áudio no
> grupo. Mãe que simplesmente sabe que a filha precisa treinar tabuada não tinha o que anexar, e
> ficava de fora da feature inteira. Agora o campo de texto vem primeiro e o material é opcional; o
> **pedido manda no recorte, o material manda no conteúdo**, e o prompt tem três modos (só pedido,
> só material, os dois). Os planos que nascem só do pedido gravam `origem = 'pedido'` — e entram
> na mesma cota diária de IA, senão o caminho mais barato de todos seria o único sem teto.

> 🔗 O link velho `#/planos` continua funcionando: `main.js` tem um alias explícito que reescreve
> pra `#/mesa`. Cair no fallback do router seria pior que 404 — ele mandaria o pai pro Início sem
> avisar.

#### 🔗 Colar um link também é mandar material (16/ago/2026)

Boa parte do reforço escolar de 2026 **não é arquivo nenhum** — é um link. A professora manda a
videoaula no grupo, o pai acha um vídeo bom no domingo à noite, a escola publica a lista num site em
vez de mandar o PDF. Antes disso as saídas eram baixar o vídeo (ninguém faz), tirar print da página
(perde o texto) ou digitar o plano na mão. Agora ele **cola o link** — no campo próprio ou direto no
campo do pedido, que reconhece a URL, vira card e limpa o endereço do texto.

E aqui está a decisão que decide a feature: **link é FONTE, não lição.** A regra número 1 do prompt
de material é anti-invenção (*"se o material tem duas tarefas, devolva duas"*), e aplicá-la a uma
videoaula **mataria** a feature — um vídeo de 12 minutos sobre frações contém *zero* tarefas, contém
**conteúdo**. Então o link entra num modo próprio: *"monte de 3 a 8 sessões que ensinem o que esse
conteúdo ensina, na ordem, como um bom professor particular montaria depois de assistir a essa
aula"*. Se vier material da escola junto, **a escola ganha** — ela é a lição de verdade, e o link
vira apoio.

| Como chega | O que a Cogni lê | O card mostra |
| --- | --- | --- |
| 🎬 **YouTube** com legenda | a fala da aula (legenda do canal ou automática) | miniatura, título, canal, duração e o **selo de grau** |
| 🎬 **YouTube** sem legenda | só título, canal e descrição | o selo diz: *"sem legenda: li só o título e a descrição, o plano vai ficar mais genérico"* |
| 🌐 **Página** | o texto limpo (sem menu, sem rodapé) | título + domínio |
| 📄 **Link que aponta pra PDF** | o PDF, pelo caminho de PDF que já existia | nome do arquivo + tamanho |

> 🎬 **YouTube é best-effort grátis** — sem chave nova, sem API paga, sem dependência npm: o caminho
> é a **InnerTube**, o mesmo endpoint que o app do YouTube usa. Dois achados que custaram medição
> real: o cliente **`WEB` não devolve legenda** (responde `UNPLAYABLE` com a lista de legendas vazia,
> mas devolve os metadados normalmente — a falha é silenciosa; `ANDROID` e `IOS` devolvem os dois), e
> as legendas vêm **em ordem alfabética do nome traduzido**, então "a primeira manual" pode ser a
> *alemã* num vídeo em inglês (quem aponta a certa é `defaultTranslationSourceTrackIndices`). Quando
> a legenda não vem, a leitura **degrada e a tela diz que degradou** — é o selo do card.

> 🔒 **`/api/ler-link` é a função mais perigosa do projeto**, porque busca uma URL escolhida por quem
> chama. Sem trava seria um proxy SSRF público: a sessão do responsável vem primeiro (nada de rede
> sem login e criança pareada), só `http`/`https` nas portas 80/443, o DNS é resolvido e IP privado é
> barrado (`10.*`, `127.*`, `169.254.*` — onde mora o metadata das nuvens —, `::1`, `fc00::/7`…), o
> **redirect é seguido na mão e cada salto é revalidado** (um domínio público que responde `302` pra
> `169.254.169.254` passaria por qualquer checagem feita só na URL inicial), e o corpo é lido **com
> teto contando os bytes que chegam**, nunca pelo `content-length` que o outro lado declarou.

> 🇧🇷 **UTF-8 não é seguro como padrão no Brasil.** `planalto.gov.br` serve `text/html` sem charset,
> sem `<meta charset>`, e o conteúdo é latin1 — decodificar como UTF-8 devolve *"Presid�ncia da
> Rep�blica"* e o plano nasce em cima de texto corrompido, sem ninguém reclamar. A saída não é
> heurística: UTF-8 é autovalidante, então `TextDecoder("utf-8", { fatal: true })` **lança** em bytes
> latin1 e o `catch` cai pra `windows-1252`. E anti-bot devolve **200 com uma página de verdade** (a
> Khan Academy responde *"Client Challenge"* em 227 caracteres): sem uma checagem específica, a Cogni
> montaria um plano de estudo em cima do texto do Cloudflare.

**Nada que a IA propôs chega ao robô sem o pai ver.** O plano vindo de material (ou de pedido) nasce com
`status = 'rascunho'`, e o servidor já ignora tudo que não é `ativo`/`em_andamento` — a trava
inteira custou **zero linha** de comportamento novo no robô. Aprovar é mudar o status, que o site
já sabia fazer.

**O material não é guardado em lugar nenhum.** Nem bucket, nem Storage, nem base64 no banco. Ele
é lido, vira o `extraido_texto` (que o pai confere — e **corrige** — em "ver o que a Cogni
entendeu do material") e é descartado. Vale pra foto, PDF, Word, slides, planilha, áudio e vídeo.
É material de criança — decisão de LGPD, não detalhe de implementação.

#### 🖊️ A IA saiu do botão e entrou nos campos (16/ago/2026)

A IA da Mesa era **tudo ou nada**: ou o pai clicava em "Criar com a Cogni" e recebia um plano
inteiro pronto, ou clicava em "Escrever eu mesmo" e ficava **sozinho com um campo em branco**. Quem
quer escrever o próprio plano perdia a IA justamente onde ela mais ajudaria — virar *"revisar aquilo
de fração que ela errou na prova"* num texto que a Cogni consegue seguir.

Agora tem um ✨ embaixo de **quatro campos**, com as ações que fazem sentido em cada um:

| Campo | Teto | Vazio | Com texto |
| --- | --- | --- | --- |
| Plano · **título** | 80 | precisa de contexto | Melhorar |
| Plano · **conteúdo** | 600 | Gerar do título + foco | Melhorar · Encurtar · Detalhar |
| Tarefa · **título** | 120 | precisa de contexto | Melhorar |
| Tarefa · **detalhe** | 240 | Gerar do título da tarefa | Melhorar · Encurtar · Detalhar |

**A regra do título é a mais importante daqui:** gerar um título do nada não dá — não há de onde
tirar, e a IA inventaria. Com *alguma coisa* escrita (*"fração prova sexta"*) ela tem contexto e
devolve *"Frações pra prova de sexta"*. Então o botão de um título vazio, sem nada em volta, já
nasce **apagado com a dica do porquê** — nunca um erro depois do clique. (Ele fica apagado por
`aria-disabled`, e não pelo atributo `disabled`: botão `disabled` some do teclado e não mostra dica
nenhuma no celular, e o pai ficaria olhando um ✨ apagado sem descobrir o motivo.)

E três regras que fazem ou quebram a feature:

1. **Desfazer é obrigatório.** A IA **substitui** o texto do pai. Sem um desfazer ao lado do campo
   — que volta o original e some quando ele digita de novo — a feature é hostil: a pessoa perde o
   próprio texto num clique.
2. **O corte é da função, não do `maxlength`.** Se a IA devolver 300 caracteres num campo de 80, o
   atributo do `<input>` corta em silêncio e o pai vê uma frase mutilada que ele lê como defeito do
   site. A resposta chega **já cortada**, e o corte não parte palavra no meio.
3. **Nunca inventar fato.** É a regra anti-invenção da casa, no grau máximo: a IA não acrescenta
   página, data de entrega, capítulo nem nome de professor que não estejam no que ele escreveu. Ela
   melhora a **redação**; o **fato** é dele. Um *"entregar terça"* inventado vira card com prazo
   errado — e prazo errado vira a Cogni cobrando a criança no dia errado.

> 🔒 O texto não é guardado em lugar nenhum, nem em log: vai, volta e some. O que sobra é o que o
> pai salvar. E a **`origem` do plano não muda** — plano digitado à mão com o título polido pela IA
> continua `manual`, porque `origem` diz de onde o plano **nasceu**, não quem passou o corretor.

> ⏱️ O modelo é o mesmo `gpt-5.4-mini` do resto, mas com `reasoning_effort: 'low'`: isto é um
> **botão**, não um pipeline — o pai está olhando o campo esperando, e raciocínio alto aqui compra
> latência sem comprar qualidade de redação. A cota diária de 20 planos **não enxerga** este
> endpoint (melhorar texto não cria plano), então ele tem trava própria: 40 por hora por
> responsável, em memória da função.

#### 🧮 A Cogni segue vários planos ao mesmo tempo

O site **sempre** deixou criar quantos planos quisesse, e a vida pede isso mesmo (o reforço de
matemática da semana **e** o inglês do mês). Só que o servidor do robô seguia **um** — e a tela
tinha uma cópia dessa regra, dizendo *"A Cogni não está seguindo este plano agora"* no segundo plano
ativo. Do lado do robô isso acabou (até **5 planos** por criança); do lado do site, aquela frase
tinha virado **mentira**, e mentira pequena dita com segurança é a pior que existe num painel de
pai.

Agora o selo *"a Cogni está seguindo"* aparece em **todos** os vigentes — inclusive como um ✨ no
chip de cada plano da faixa, que é onde a pergunta *"quais ela está seguindo?"* realmente aparece. O
aviso de "não está seguindo" ficou valendo só pra quem merece: `rascunho`, `pausado`, `concluido`,
vencido e o **6º plano em diante** (aí o aviso diz que o limite é 5, em vez de deixar o pai achar
que a tela quebrou).

> 📐 A expiração é **por plano**: um plano de 1 dia criado anteontem perde o selo, e o de 30 dias do
> lado dele continua valendo.

#### 🥇 O pai arrasta a fila, e a Cogni segue (16/ago/2026)

Ela seguir vários planos criou a pergunta seguinte: **qual deles importa mais?** Havia uma resposta
implícita, e era a errada — o servidor ordenava por `atualizado_em`, então **quem foi editado por
último ganhava a vez**. Corrigir uma vírgula no plano de inglês promovia o inglês na cabeça da Cogni,
e o pai reordenava a prioridade da filha **sem saber que tinha feito isso**. Pior: não existia lugar
nenhum na tela onde ele pudesse dizer o que realmente queria primeiro.

Agora a **faixa de planos é a fila**, e ela se arrasta igual aos cards do quadro:

| | O quê |
| --- | --- |
| 🖱️ | **Arrastar** de mouse, de dedo e **de teclado** (`Espaço` pega · `←/→` move · `Espaço` solta · `Esc` cancela), com o leitor de tela anunciando *"Frações movido para a posição 1 de 3"* |
| 🥇 | Um selo **"1º"** no primeiro da fila, e a pílula do card dele muda pra ***"a Cogni começa por aqui"*** |
| 📌 | Só na aba **Ativos** — a `ordem` só muda o que ela faz entre os planos que estão valendo |
| 🚫 | Com o modo **Selecionar** ligado, o arraste **desliga** |

**A frase do selo foi escolhida com cuidado, e é a parte que mais importa.** Ele **não** é "o único
que vale": a Cogni segue todos os vigentes, e o primeiro é só por onde ela **começa** quando a
conversa não pede outro assunto. Prometer exclusividade ali faria o pai concluir que ela abandonou os
outros planos — e ele nos pegaria na primeira conversa em que ela não faz isso. Pelo mesmo motivo o
selo só aparece com **fila de verdade** (2+ planos valendo): com um plano só, "começa por aqui" é
verdade e é inútil, e vira decoração permanente — que é a primeira coisa que o olho aprende a ignorar.

E duas travas que parecem detalhe e não são:

1. **Selecionar e arrastar não podem coexistir.** O gesto que marca um plano pra excluir (toque
   longo) é *o mesmo* que inicia um arraste. Sem desligar um dos dois, o pai reordenaria a prioridade
   da filha achando que estava escolhendo o que apagar.
2. **Só a aba dos ativos arrasta.** Arrastar um rascunho ou um pausado não muda nada no robô, e um
   gesto sem consequência — repetido duas ou três vezes — ensina o pai a desconfiar do arraste
   inclusive onde ele funciona. Quando um plano da aba mesmo assim não está valendo (venceu, ou é o
   6º), o card dele diz que **a posição só passa a valer quando ele voltar a valer**.

> 🔢 `planos_estudo.ordem` é `double precision` com gap de 1000 — a **mesma** mecânica fracionária dos
> cards, com o mesmo código: soltar entre dois grava a média dos vizinhos, **1 UPDATE por movimento**.
> O teto de 5 também passou a cortar por ela: quem sobrevive são os primeiros da fila **dele**, não
> os planos mais recentes.

> 🤝 **A ordem de leitura do site tem que ser byte a byte a do servidor** — `ordem asc →
> atualizado_em desc → criado_em desc → id desc`, em `getPlanos`, na faixa e na cópia da regra do
> `format.js`. Se divergirem, a tela mostra uma fila e a Cogni segue outra: o pai vê o arraste
> "funcionar" e o robô ignorar, que é o pior resultado possível, porque a tela fica mentindo com cara
> de certeza.

> 🩹 **E se o SQL ainda não tiver rodado?** Um `update` em coluna inexistente falha com **42703**, e
> aí o site trata como *"a prioridade ainda não está disponível"* — não como erro de rede, que
> mandaria o pai tentar de novo pra sempre. O chip **volta pro lugar**: uma faixa reordenada por cima
> de um banco que recusou a escrita é a tela mentindo do jeito mais caro. A leitura tem a mesma
> válvula do robô — o `ORDER BY ordem` derrubaria a consulta **inteira**, e os planos sumiriam da
> Mesa por causa de um detalhe de ordenação.

#### 📎 Quem lê o quê, e por que isso decide a arquitetura

A Vercel corta o corpo da requisição em **4,5 MB antes do nosso código rodar**. A resposta não é
"aceitar arquivo menor" — é decidir **onde cada formato vira texto**:

| Material | Vira texto onde | Por quê |
| --- | --- | --- |
| 📷 Foto | **Navegador** — canvas 1600px, JPEG 0.82 | 4-8 MB viram ~300 KB |
| 📄 PDF | **A OpenAI** — vai inteiro, base64 | PDF escaneado precisa de OCR; a API lê texto **e** imagem de página |
| 📝 DOCX / PPTX / XLSX | **Navegador** — são ZIP de XML: `DecompressionStream` nativo + parse | Um `.docx` de 8 MB com fotos vira 30 KB de texto |
| 🔤 TXT / MD / CSV | **Navegador** — `file.text()` | trivial |
| 🎙️ Áudio | **A OpenAI** — transcrição, que entra no mesmo pipeline de texto | um caminho só, um schema só |
| 🎬 Vídeo | **Navegador** — vira quadros + a trilha de áudio | um MP4 de 1 min tem 60-100 MB e jamais caberia |
| 🔗 Link | **A função `/api/ler-link`** — e volta como item de texto (ou de PDF) | o navegador **não pode**: o site da escola não manda `Access-Control-Allow-Origin` pra gente (CORS) |

A sacada do vídeo: **o cliente decompõe e a função nunca sabe o que é vídeo.** Um vídeo vira
`imagem × N` + `audio`, então a função conhece quatro tipos e continua conhecendo quatro tipos.
(**O link segue a mesma sacada**: quem lê é uma função separada, e o que chega na
`plano-de-material` é `{tipo:"texto", formato:"youtube"|"web"}` — ela nunca soube que link existe.
A função ser separada também põe o erro de link **na bandeja**, junto com os outros erros de
material, e mostra o título do vídeo **antes** de montar o plano: colar o link errado é o erro mais
comum que existe, e é o único que o pai corrige sozinho.)
E num vídeo de aula **a fala tem prioridade sobre a imagem** — quem carrega a tarefa é o que a
professora *diz*; os quadros só confirmam o assunto. Por isso o áudio é reservado primeiro (até
1min30) e os quadros preenchem o que sobra, de 4 até 1. Vídeo longo não perde o áudio: ele é
cortado, e a tela avisa com uma saída que o pai consegue executar (*"corte esse trecho no celular
e mande de novo"* — cortar vídeo todo mundo sabe; extrair áudio de um MP4, não).

> 🧱 **Zero biblioteca.** Nada de pdf.js, JSZip, mammoth ou ffmpeg.wasm: o leitor de ZIP, o parser
> de OOXML, o encoder de WAV e a extração de quadros são API nativa do navegador. O site continua
> 100% estático.

#### 🎯 Por que o drag and drop é escrito à mão

Sem biblioteca, e o motivo é chato de contornar: o drag-and-drop **nativo do HTML5 não funciona em
toque**, e o SortableJS — a escolha óbvia — **não tem acessibilidade por teclado**. Como os botões
de mover teriam que ser escritos de qualquer jeito, a lib só somaria peso e uma animação que não dá
pra controlar. Então `js/dashboard/dnd.js` faz tudo com Pointer Events:

- **8px** de folga antes de virar arraste (senão o toque de abrir o card vira drag) e **150ms** de
  dedo parado no toque (senão rolar a página arranca um card junto).
- Teclado inteiro: `Espaço` pega · `←/→` troca de coluna · `↑/↓` reordena · `Home/End` · `Esc`
  cancela — com um `aria-live` anunciando *"Movido para Fazendo, posição 2 de 4"*.
- E **todo** movimento tem o caminho equivalente no menu `⋯` do card. Arrastar nunca é o único jeito.

`ordem` é fracionária com gap de 1000: soltar entre dois cards grava a **média dos vizinhos**, o
que dá **1 UPDATE por movimento** em vez de reescrever a coluna. Só na 10ª soltura no mesmo ponto o
gap acaba, e aí a coluna é reindexada de uma vez.

> ♻️ **Um módulo, dois usos (16/ago/2026).** Quando a faixa de planos virou fila arrastável, o
> caminho fácil era um segundo dnd — e seriam dois lugares pra consertar cada bug de toque, de foco e
> de leitor de tela. Em vez disso o `criarQuadro` ganhou duas dimensões: **`eixo`** (`vertical` no
> quadro, `horizontal` na faixa, que decide de onde sai o índice de soltura e quais setas movem) e
> **`item`** (a palavra dos anúncios — "tarefa" ou "plano"). Com **uma coluna só** ele é uma lista
> simples, e os anúncios param de citar um nome de coluna que o pai não vê. As frases de erro também
> deixaram de dizer *"a tarefa voltou pro lugar"* e passaram a citar o **nome do item**: *"o tarefa"*
> e *"a plano"* saem errados em metade das combinações, e o nome não tem gênero pra errar.

> 🖱️ Dois detalhes que só apareceram com o item arrastável sendo um `<button>` (o chip é um): o dnd
> ignorava o gesto quando ele nascia num botão — que era **o próprio chip** —, e o `click` que o
> navegador dispara depois de soltar abria o plano recém-arrastado. Agora o bloqueio só vale pra
> controles **dentro** do item, e o clique seguinte ao arraste é engolido.

#### ⚙️ O que o Nicolas precisa configurar

O que fala com a IA é a **única** parte do Companion que roda fora do navegador — três Vercel
Functions (`api/plano-de-material.mjs`, `api/ler-link.mjs` e `api/melhorar-texto.mjs`, com os
módulos em `api/_lib/`), porque o servidor da Cogni é `127.0.0.1` e do celular do pai ele
simplesmente não existe. Em *Settings → Environment Variables* do projeto na Vercel:

| Variável | Pra quê |
| --- | --- |
| `OPENAI_API_KEY` | a leitura do material, a transcrição do áudio **e** o ✨ dos campos |
| `SUPABASE_URL` | validar o login do pai e ler a criança pareada |
| `SUPABASE_ANON_KEY` | idem (é a chave pública; quem protege é a RLS) |

> 🆓 Nem a leitura de link nem o ✨ dos campos **pediram nada novo**: nenhuma variável de ambiente,
> nenhuma dependência npm. `fetch` e `node:dns` já vêm no runtime, o YouTube é lido sem chave, e o
> botão de melhorar texto usa a mesma `OPENAI_API_KEY` que já estava lá.

Faltando qualquer uma, a função responde **503** com mensagem clara em vez de quebrar. E ela
**nunca escreve no banco**: devolve a proposta, e quem grava é o site com a sessão do pai.

> 📌 `api/_lib/` começa com `_` de propósito: a Vercel **ignora** arquivos e pastas prefixados
> com `_` dentro de `api/`, então os módulos compartilhados não viram rotas públicas nem
> consomem funções do plano Hobby.

> 🗄️ **Uma coisa manual, e ela vem antes do deploy:** o SQL que abre os `CHECK` de `origem`
> (`planos_estudo.origem` aceitando `arquivo`/`audio`/`video`, depois `pedido` e agora **`link`**;
> e `plano_tarefas.origem` aceitando `ia`). Se o site subir antes do SQL, salvar um plano de PDF (ou
> de link) viola a constraint. A ordem é **SQL → função → site** — e existe uma rede: o
> `criarPlanoComTarefas` detecta o `23514` e regrava como `manual`, então o pai perde o **selo** da
> origem, não o trabalho.

> 🥇 **E mais um SQL, o da fila de planos (16/ago/2026):** a coluna `planos_estudo.ordem` +
> o índice `(crianca_id, ordem)`. É idempotente (`add column if not exists`) e **sem backfill** —
> todos os planos nascem em `1000` e nada muda de comportamento até o primeiro arraste. Se o site
> subir antes, ninguém quebra: a leitura cai no desempate antigo e o arraste diz *"a prioridade ainda
> não está disponível"* em vez de fingir que gravou.

> 🧪 **Testar sem OpenAI, sem deploy e sem login:** vire `USAR_SUPABASE = false` e "Criar com a
> Cogni" devolve uma proposta de exemplo local. Só a **rede** é falsa — toda a extração roda de
> verdade: o unzip do `.docx`, a decomposição do vídeo em quadros, a gravação do microfone. Dá
> pra percorrer o fluxo inteiro offline, inclusive a revisão (editar tarefa, apagar, o chip
> "confira", corrigir o texto extraído, rascunho × aprovar). **Link também**: colar um endereço
> devolve um card de exemplo com miniatura e selo — e um link de `/shorts/` cai de propósito no
> degrau "sem legenda", que é o caminho mais curto pra ver como a degradação honesta aparece na tela.
> **O ✨ dos campos também**: no modo de demonstração ele devolve um texto de exemplo local, o que
> já basta pra conferir o desfazer, o corte no teto, o botão apagado sem contexto e o "escrevendo…".

### 🔍 A revisão de design do painel (18/ago/2026)

Uma passada inteira no Companion — desktop, celular e os dois temas — atrás do que estava **errado**,
não do que dava pra enfeitar. Saíram quatro categorias de achado, e a mais cara delas não era de design.

#### 🖱️ O bug que fazia a Mesa não responder ao mouse

**A Mesa de Estudos inteira estava sem clique no desktop.** Clicar num plano da faixa não trocava o
quadro; a tela ficava presa no primeiro plano da fila. No celular funcionava — e é por isso que ninguém
tinha visto.

A causa é uma linha do `dnd.js`: ele chamava `raiz.setPointerCapture()` já no `pointerdown`, pra não
perder o ponteiro se o dedo saísse da área durante o arraste. Só que **com a captura ativa no
`pointerup`, o navegador entrega o `click` seguinte ao elemento que capturou** (a raiz do quadro), e não
ao que está debaixo do cursor. O `<button>` do chip nunca via o próprio clique. No toque continuava
funcionando porque ali o `click` nasce de outro caminho (compatibilidade de touch), que ignora a captura.

O conserto é *quando*, não *onde*: a captura passou pro `promover()` — o instante em que o gesto vira
arraste de verdade. Até lá o ponteiro andou no máximo 8px, e os listeners mudaram de `raiz` pra `window`,
que recebe o evento com captura ou sem. A decisão de sempre capturar **na raiz** (e nunca no card) segue
valendo, palavra por palavra.

> 🧪 Verificado nos quatro caminhos, um por um: chip abre o plano no mouse, arraste de card entre colunas
> no mouse, arraste por teclado com o anúncio do leitor de tela, e toque.

#### 🚻 O painel achava que toda criança era menino

`criancas` **não tem campo de gênero** — e sete frases da interface escreviam o artigo na mão:
*"Como tá indo **o** Ana?"*, *"Deixa **o** Ana desenhar o rosto da Cogni"*, *"veja como **ele** está
aprendendo"*. Para metade das famílias, a **primeira frase da primeira tela** estava errada sobre a
filha delas. E o Mapa da aula piorava: dois rótulos vinham do robô no feminino (*"estava embalada"*,
*"resolveu sozinha"*), então pra outra metade a aula era descrita na flexão errada, linha por linha.

A saída não é adivinhar nem pedir mais um campo no cadastro — é escrever frases que **não precisam de
flexão**. O português dá duas construções neutras de graça, e o `format.js` agora as encapsula:

| Helper | Devolve | Onde |
| --- | --- | --- |
| `sujeito(nome)` | `"Pedro"` · `"a criança"` | *"Conforme **Pedro** estuda…"* |
| `deQuem(nome)` | `"de Pedro"` · `"da criança"` | *"O dia **de Pedro**"* (o coloquial "do/da" é que tem gênero) |

E os rótulos do Mapa viraram fato em vez de adjetivo: **"estava no embalo"** e **"resolveu sem ajuda"**.
A troca mora no `ROTULOS_ACENTUADOS` do `mapa-api.js`, junto com a dos acentos — o `rotulo` cru continua
sendo o do servidor no banco; quem muda é a **tela**.

> 🤖 De quebra, a própria Cogni tinha dois gêneros no painel: 155 *"a Cogni"* contra 15 *"o Cogni"* —
> e o card do Início dizia *"Dica **do** Cogni"* no título com *"**A** Cogni está pensando…"* no corpo.
> Ficou tudo no feminino, menos **"o Cogni Companion"**, que é o nome do app.

#### 📱 Criar um plano no celular

O modal de criar plano tem **1136px de conteúdo** e a tela do celular tem ~740. Como quem rolava era o
overlay inteiro, o cabeçalho e o botão *"Montar o plano"* saíam de cena juntos: o pai chegava no fim do
formulário sem saber onde estava, e o botão que ele foi buscar ficava a uma rolagem de distância do campo
que acabou de preencher.

Agora, abaixo de 700px de largura (**e no celular deitado**, que é onde era pior), todo modal do painel
vira uma **folha**: largura inteira, 92dvh de altura, puxador no topo, o **corpo** é quem rola, e a barra
de ações gruda no rodapé com os botões dividindo a linha. Vale pros quatro modais — criar com a Cogni,
escrever à mão, revisar o que a IA leu e o perfil da criança.

> 🐛 Um detalhe custou medição pra achar: `overflow: hidden` no overlay **continua sendo um container de
> rolagem** — ele só esconde a barra. E o `openModal` foca o primeiro campo 60ms depois de abrir, enquanto
> a folha ainda sobe; o navegador rolava esse container pra trazer o campo pra dentro, e a folha terminava
> **145px acima** do lugar, com o cabeçalho fora da tela. `overflow: clip` recorta sem criar container.

E as três faixas que rolam de lado na Mesa (as abas, a fila de planos, o quadro) cortavam o conteúdo
**reto** na borda — *"Concluíd"*, *"Tabuada com a Cogn"*, metade da coluna "Fazendo". Corte reto não
convida a rolar: lê como layout quebrado. Agora a borda **desbota**, com `mask-image` movido por
`animation-timeline: scroll()` — sem um listener sequer. Sem suporte, vale o valor inicial: desbota só a
direita, que é o estado certo no começo da rolagem.

> Por que máscara e não sombra de fundo: os chips e as colunas são **opacos** e cobrem o fundo do
> container, então sombra pintada atrás deles fica invisível. A máscara age sobre o conteúdo.

#### 🎨 39 textos abaixo do contraste mínimo

Uma varredura automática mediu **todo** texto das 7 seções nos 2 temas, compondo o alpha de cada camada
de fundo. Deu **39 reprovações** no mínimo de 4,5:1 do WCAG AA. E não eram detalhes decorativos: era o
eixo do gráfico, o *"visto há 4 dias"* da trilha, a hora da mensagem, o nome da matéria no Diário e o
*"Desvincular este perfil"* — texto de ação destrutiva, que o pai precisa **ler** antes de tocar.

| O que era | O que virou |
| --- | --- |
| `--dash-text-faint: #8b92a6` (3,1:1) | `#676d80` — os três degraus de cinza continuam de pé |
| Dourado da marca como **texto** (2,1:1) | `--dash-accent-ink`, um dourado escuro só pra escrever (o `--dash-accent` segue sendo o dourado de ícone e traço, onde 3:1 basta) |
| 7 das 14 matérias, entre 2,9:1 e 4,2:1 | escurecidas em **OKLCH** — mesma matiz, mesmo croma, só a luminosidade desce. As famílias por área continuam legíveis de relance |
| `#5d78ff` do nome da criança, repetido em 2 arquivos | `--dash-crianca-ink`: um token, um valor por tema |
| `#d64545` do "Desvincular", igual nos dois temas | uma cor por tema (escura no claro, clara no escuro) |

O alvo usado foi **4,8:1**, e não 4,5 na unha: as mesmas cores aparecem sobre `--dash-surface-2` e sobre
o próprio `-soft`, que são um degrau mais escuros que o branco puro. Na remedição: **zero** reprovações.

> ✋ E os alvos de toque: o ✕ de limpar a busca tinha 28×28, o interruptor do tema 48×28, as abas
> Semanal/Mensal 27px de altura. A folga vem de um pseudo-elemento centrado (44×44) e só em
> `pointer: coarse` — padding mudaria o desenho de todos eles, e no desktop não há problema a resolver.

#### 🧹 O resto, em uma linha cada

| Onde | O quê |
| --- | --- |
| 📊 **Gráfico de evolução** | Num card de 280px os rótulos chegavam com **4,6px** de altura. Ganhou um viewBox compacto (360×260) que entra abaixo de 620px, e o `matchMedia` fica vivo pra girar o aparelho não deixar o gráfico ilegível |
| 🕳️ **Buracos no grid** | O Início parava cada card na própria altura e abria dois vazios no meio do bento; o card do gráfico esticava até a altura do vizinho e deixava ~200px de nada entre a curva e a faixa de resumo; em Configurações sobrava um retângulo vazio ao lado de "Aparência" |
| ⏱️ **Mapa da aula sem teto** | As duas únicas chamadas do painel sem `AbortSignal.timeout` — e o Mapa **bloqueia o render**, então o pai olhava "Carregando…" até o navegador desistir sozinho |
| 📏 **Telas largas** | Em 1920 as linhas do Diário passavam de 150 caracteres; teto de 1500px no conteúdo e de 68ch no balão |
| 🎚️ **Sliders do rosto** | Herdavam a largura da seção (~900px): a faixa inteira do olho tem 34px de variação espalhados nisso, e os rótulos das pontas ficavam longe demais pra explicar o controle |
| 📐 **Tab bar** | A altura era um `72px` solto no respiro do conteúdo, e a barra tinha a altura que desse; virou um token lido nos dois lugares |
| ✍️ **Dev-speak na tela** | *"Esse texto é injetado no que a Cogni sabe sobre o plano"* — "injetado" é palavra de quem escreveu o system prompt, não de quem tem uma filha com prova na sexta. Virou *"Ela lê isto antes de puxar o assunto com a criança"* |
| 🗣️ **Frases de fábrica** | *"continue incentivando essa jornada"*, *"Gerencie o perfil, a conta e as preferências"*, *"Bem-vindo(a)"* — trocadas por frases que dizem algo que a tela não diz sozinha |
| 🏷️ **Dois cards, um nome** | O Início tinha **dois** cards chamados "Resumo da semana" lado a lado. Viraram "A semana em números" e "O bilhete da semana". E "Próximo plano de estudo" mostrava o plano de **agora** — virou "O plano de agora" |
| ➖ **Travessão fora** | Nenhum texto de interface usa travessão (`—`): a pontuação da casa é vírgula, dois-pontos e ponto, e `·` quando é separador (`Fase 1 · Tutorial`, `Painel · Cogni Companion`). A regra vale também pro que a **IA escreve**: os dois prompts (`prompt.mjs` e `melhorar.mjs`) proíbem em texto e **pararam de usar travessão nas próprias instruções** — modelo imita a pontuação do que lê, então pedir uma coisa e demonstrar outra é o jeito mais barato da regra ser ignorada |
| 🔠 **Maiúscula no começo** (19/ago) | Um professor viu na apresentação: o painel escrevia *"carregando"*. Texto que nasce **fora** do site chega minúsculo (o conceito que a IA gravou, o rótulo que o robô mandou, o tópico da conversa) e não dá pra consertar na origem. Onde ele **abre** uma linha, um chip ou um selo, passa por `capitalizar()` (`format.js`) — no meio da frase nada muda: *"visto ontem"* continua minúsculo, como o português manda |

---

### 🗃️ Arquivos do painel

| Arquivo | Função |
| --- | --- |
| `js/dashboard/main.js` | Bootstrap: guard de auth, decide onboarding × painel, monta o contexto e o router |
| `js/dashboard/servidor.js` | `SERVIDOR_URL` e os pings no robô. Mora fora do `main.js` pra camada de dados poder importar sem fazer ciclo |
| `js/dashboard/mock-data.js` | **Fonte de dados** (roteia mock ↔ Supabase pela flag `USAR_SUPABASE`) |
| `js/dashboard/supabase-data.js` | Implementação real das queries/escritas no Supabase |
| `js/dashboard/onboarding.js` | Boas-vindas + pareamento por código (tela cheia, com motion, sonda de rede e saída do portão) |
| `js/dashboard/tour.js` | **Motor do tutorial guiado**: navega, espera o alvo, recorta o foco, posiciona o balão e prende o teclado |
| `js/dashboard/tour-passos.js` | **O roteiro** do tutorial (só conteúdo: título, texto e âncora de cada uma das 10 paradas) |
| `js/dashboard/tooltip.js` | **Motor das dicas**: o balão único, o `data-dica` e o helper `dicaInfo()` (o botão "?") |
| `js/dashboard/resumo-semanal.js` | Card + modal do **"O bilhete da semana"** (resumo por IA) |
| `js/dashboard/dica.js` | Card **"Dica da Cogni"** (Início + Aprendizado), gerada por IA no servidor local (`/api/dica`) |
| `js/dashboard/router.js` | Roteamento por hash (SPA leve) |
| `js/dashboard/format.js` | As 14 matérias (rótulos e grupos), datas, durações e os helpers de texto: `sujeito()`, `deQuem()`, `capitalizar()` |
| `js/dashboard/modal.js`, `icons.js`, `linechart.js` | As peças de UI: o diálogo acessível, os ícones SVG e o gráfico de linha (tudo à mão, sem lib) |
| `js/dashboard/rosto-preview.js` | Desenho do rosto do robô em SVG (módulo puro, sem rede) |
| `js/dashboard/rosto-api.js` | Leitura/gravação do rosto: PUT ao vivo no robô + persistência no Supabase |
| `js/dashboard/mapa-api.js` | Dados do Mapa da aula: endpoint (ao vivo) + tabela (histórico) e o saneamento dos momentos |
| `js/dashboard/mapa-timeline.js` | A linha do tempo da aula (marcadores em HTML/CSS, cada um um `<button>`) |
| `js/dashboard/dnd.js` | **Drag and drop do quadro** (Pointer Events à mão, com teclado e `aria-live`) |
| `js/dashboard/mesa-realtime.js` | **O quadro ao vivo**: canal do Supabase, fila durante o arraste, degradação |
| `js/dashboard/captura.js` | **Pedido/material → plano**: o campo do pedido, o campo de link, as quatro entradas de material, a bandeja e o orçamento |
| `js/dashboard/revisao.js` | A tela de revisão (o pai confere e edita antes de qualquer coisa valer) |
| `js/dashboard/campo-ia.js` | **O ✨ dentro do campo**: o botão, o desfazer, o corte no teto e a chamada da função |
| `js/dashboard/material/` | Cada formato virando item: `index` (dispatcher), `orcamento`, `imagem`, `zip`, `ooxml`, `texto`, `audio`, `gravador`, `video`, `wav`, `bytes`, **`link`** |
| `api/plano-de-material.mjs` | **Vercel Function** que lê o material com IA (a única coisa fora do navegador) |
| `api/ler-link.mjs` | **Vercel Function** que lê a videoaula ou a página de um link colado |
| `api/melhorar-texto.mjs` | **Vercel Function** do ✨: uma frase entra, uma frase sai (não escreve no banco) |
| `api/_lib/` | As peças delas: `auth` (as travas), `itens` (tetos), `openai`, `prompt`, `melhorar`, `sanear`, `http` |
| `api/_lib/link/` | A leitura de link: `rede` (SSRF, redirect, tetos), `youtube` (InnerTube + legenda), `pagina` (charset, HTML→texto, anti-bot, PDF) |
| `js/dashboard/sections/*.js` | As 7 seções: Início, Conversas, Aprendizado, **Mapa da aula**, **Mesa de Estudos**, **Rosto da Cogni**, Configurações |
| `css/dashboard-onboarding.css` | Estilos do onboarding |
| `css/dashboard-tour.css` | Estilos do tutorial guiado (véu, recorte e os três layouts do balão) |
| `css/dashboard-tooltip.css` | Estilos das dicas: o balão, o `?` e as adaptações dele a cada cabeçalho que o hospeda |
| `css/dashboard-rosto.css` | Estilos do editor de rosto (estética infantil, escopada em `.dash-rosto`) |
| `css/dashboard-mapa.css` | Estilos do Mapa da aula (tons dos momentos, faixa do tempo, selo ao vivo) |
| `css/dashboard-mesa.css` | Estilos da Mesa de Estudos (quadro, cards, arraste, captura) — o prefixo `.pl-` dos formulários fica, porque Configurações reusa |

> 🧪 Para testar **com o robô ligado**: suba o servidor da Cogni (`http://127.0.0.1:3000`), pegue o código
> de pareamento (na tela do servidor ou pedindo pra Cogni falar) e digite no onboarding. Para testar **sem
> o robô**, vire `USAR_SUPABASE = false` e o painel roda com os dados de exemplo.

---

## 🎨 Rosto da Cogni — a tela da criança

A única seção do Companion feita **pra criança**, e não pro pai. Ela escolhe os olhos do robô e a Cogni
muda de cara **ao vivo**, enquanto o dedo ainda está no slider. Isso não é enfeite: é a contribuição
científica do TCC — pesquisa de 2025 mostrou que um rosto **desenhado pela própria criança** tem
inteligência social percebida bem maior que um rosto genérico.

### 🎛️ Os 4 parâmetros (e só esses)

O robô desenha os olhos **proceduralmente** numa tela OLED 128×64 monocromática. Qualquer chave além
destas o firmware ignora — não adianta inventar cor, pupila ou brilho.

| Campo | Faixa | Padrão | O que muda |
| --- | --- | --- | --- |
| `largura` | 14 – 48 px | 36 | Olho fino ↔ largo |
| `altura` | 12 – 48 px | 36 | Espremido ↔ arregalado |
| `raio` | 0 – 16 px | 8 | 0 = quadradão (sério), 16 = redondo (fofo) |
| `espaco` | −4 – 34 px | 10 | Distância entre os olhos; negativo cruza (vesguinho) |

> 📏 **O teto do `espaco` depende da `largura`.** Os dois olhos e o vão entre eles dividem os mesmos 128 px,
> então vale `espaco ≤ 128 − 2×largura`. Na prática só morde com `largura = 48`, onde o máximo cai de 34
> pra 32 (eram as únicas 2 combinações que cortavam os olhos na tela). Quem cede é o espaço, não a largura —
> o tamanho do olho é o que a criança vê primeiro. A regra vale nos três lados: firmware, preview e slider.

### ⚡ Como o "ao vivo" funciona

Cada mexida dispara um `PUT {SERVIDOR}/api/esp/rosto` com **debounce de 150 ms** — é isso que faz o robô
acompanhar o dedo. A gravação no Supabase é separada, com debounce mais folgado (1,2 s), porque é só
persistência e não precisa de tempo real.

O preview em SVG **replica a matemática do firmware** (a lib RoboEyes que posiciona os olhos),
então o que aparece na tela é pixel a pixel o que vai aparecer no robô. Ele é síncrono e local: funciona
com o robô **e** o servidor desligados.

### 🔌 Três estados, nenhum deles de erro

| Situação | O que a criança vê |
| --- | --- |
| Robô ligado nesse perfil | 🟢 "A Cogni tá com essa carinha agora!" |
| `aplicadoNoRobo: false` | 🟡 "Guardei! Ela vai fazer essa cara quando ligar." |
| Servidor fora do ar | 🟡 A mesma coisa — e o desenho **salva do mesmo jeito** |

> ⚠️ `aplicadoNoRobo: false` **não é falha**: significa que o robô estava desligado ou usando outro perfil.
> O rosto foi salvo e vale na próxima conexão.

### 🗃️ Onde o dado mora

Na coluna `criancas.rosto_robo` (`jsonb`, nullable — sem valor = rosto de fábrica):

```sql
alter table criancas add column if not exists rosto_robo jsonb;
```

Não precisa de RLS nova: o policy de `update` de `criancas` já existe e filtra por linha, não por coluna.
O robô lê do perfil local, que já é hidratado do Supabase pelo caminho normal — **não há sincronismo novo**.

---

## 🗂️ Estrutura de pastas

```
Cogni Software/
├── index.html              # Home
├── produto.html            # Detalhes do produto
├── jogo.html               # Página do jogo
├── instrucoes.html         # Instruções
├── login.html              # Login
├── cadastro.html           # Cadastro
├── dashboard.html          # Painel Companion (app dos pais)
│
├── api/                    # Vercel Functions (site estático + 3 funções)
│   ├── plano-de-material.mjs # Pedido do pai e/ou material da escola → plano, por IA
│   ├── ler-link.mjs        # Videoaula do YouTube ou página da web → material
│   ├── melhorar-texto.mjs  # O ✨ dos campos: uma frase entra, uma frase sai
│   └── _lib/               # Peças delas (o "_" impede virar rota): auth, itens,
│                           #   openai, prompt, melhorar, sanear, http
│                           #   link/ → rede (SSRF), youtube, pagina
│
├── css/                    # Estilos (tokens → base → componentes)
│   ├── tokens.css          # Design tokens (cor, tipografia, espaçamento)
│   ├── base.css            # Reset e estilos globais
│   ├── dashboard*.css      # Estilos do painel (home, conversas, aprendizado…)
│   └── ...                 # Um arquivo por seção/componente
│
├── js/                     # Comportamento (JS puro, modular)
│   ├── theme.js            # Alternância de tema claro/escuro
│   ├── nav.js              # Navegação / menu
│   ├── scroll.js           # Animações ao rolar
│   ├── products-data.js    # Dados dos materiais/produtos
│   ├── supabase-config.js  # Cliente Supabase + helpers de auth
│   ├── auth.js             # Login e cadastro (telas)
│   ├── session.js          # Sessão, badge do usuário e gate de download
│   ├── toast.js            # Notificações (toasts)
│   ├── dashboard/          # Painel Companion (SPA)
│   │   ├── main.js         # Bootstrap (auth, onboarding × painel, router)
│   │   ├── servidor.js     # Endereço do servidor local + os pings no robô
│   │   ├── mock-data.js    # Fonte de dados (flag USAR_SUPABASE: mock ↔ real)
│   │   ├── supabase-data.js# Queries/escritas reais no Supabase
│   │   ├── format.js       # Matérias, datas, durações e os helpers de texto
│   │   ├── onboarding.js   # Boas-vindas + pareamento por código
│   │   ├── tour.js         # Motor do tutorial guiado (foco, balão, navegação)
│   │   ├── tour-passos.js  # O roteiro do tutorial (as 10 paradas)
│   │   ├── tooltip.js      # Motor das dicas contextuais (balão + botão "?")
│   │   ├── resumo-semanal.js # Bilhete da semana (IA, servidor local)
│   │   ├── dica.js         # Dica da Cogni (IA, servidor local)
│   │   ├── mapa-api.js     # Mapa da aula: ao vivo (servidor) + histórico (Supabase)
│   │   ├── mapa-timeline.js# A linha do tempo da aula (marcadores acessíveis)
│   │   ├── dnd.js          # Drag and drop do quadro (Pointer Events + teclado)
│   │   ├── mesa-realtime.js# O quadro ao vivo (canal do Supabase + fila)
│   │   ├── captura.js      # Pedido/material/link → plano (entradas, bandeja, orçamento)
│   │   ├── revisao.js      # A revisão do plano (o pai confere e edita)
│   │   ├── campo-ia.js     # O ✨ dentro do campo (com desfazer)
│   │   ├── rosto-preview.js# O rosto do robô em SVG (a matemática do firmware)
│   │   ├── rosto-api.js    # Rosto: PUT ao vivo no robô + gravação no Supabase
│   │   ├── material/       # Cada formato virando item, sem biblioteca:
│   │   │                   #   index, orcamento, imagem, zip, ooxml, texto,
│   │   │                   #   audio, gravador, video, wav, bytes, link
│   │   ├── router.js       # Roteamento por hash
│   │   ├── modal.js        # Diálogo acessível e reutilizável
│   │   ├── icons.js        # Os ícones SVG do painel
│   │   ├── linechart.js    # Gráfico de linha em SVG puro
│   │   └── sections/       # Início, Conversas, Aprendizado, Mapa, Mesa, Rosto, Config
│   │                       #   (+ _shared.js, as peças que todas usam)
│   └── ...                 # e o que é de página: ui.js, particles.js,
│                           #   product.js, game-page.js
│
└── assets/                 # Mídia
    ├── icons/              # Ícones e favicon
    ├── images/             # Imagens (robô, equipe, produtos, jogo...)
    └── pdfs/               # Artigo científico em PDF
```

---

## 🚀 Como rodar localmente

O site é **100% estático**: não tem build, não tem `npm install`, não tem o que instalar. Suba
qualquer servidor dentro da pasta do projeto:

```bash
# Com Python (já vem instalado em muitos sistemas)
python -m http.server 5500

# Ou com Node.js
npx serve
```

Depois é só acessar o endereço que aparecer no terminal (ex.: `http://localhost:5500`).

> 💡 No VS Code, a extensão **Live Server** também funciona super bem: clique com o botão direito no `index.html` → *Open with Live Server*.

> ⚠️ **Abrir o `index.html` com dois cliques quase funciona — e é justamente aí que engana.** As
> páginas do site aparecem, mas em `file://` o navegador recusa módulos ES (e o `dashboard.html`
> carrega `js/dashboard/main.js` com `type="module"`) e o login com Google não tem pra onde voltar.
> Ou seja: o **painel não abre** e a **autenticação não fecha o ciclo**, os dois em silêncio. Servidor
> local resolve os dois.

### ☁️ E como ele vai ao ar

O site vive na **Vercel**, ligada ao repositório: `git push` na `main` publica. De tudo que está
aqui, só as três funções de `api/` rodam em servidor — o resto é arquivo entregue como está. As
variáveis delas (`OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`) ficam em *Settings →
Environment Variables* do projeto, e faltando qualquer uma a função responde **503** com mensagem
clara, em vez de quebrar a tela do pai.

> 🗄️ Num deploy que mexa em plano de estudo, os SQLs manuais vêm **primeiro** (os `CHECK` de
> `origem` e a coluna `planos_estudo.ordem`): a ordem é **SQL → função → site**, e o porquê está em
> [O que o Nicolas precisa configurar](#️-o-que-o-nicolas-precisa-configurar).

---

## 👥 Equipe

Projeto desenvolvido como TCC no **UNASP** por:

- **Beatriz**
- **Gabrielly**
- **Marcos**
- **Nicolas**
- **Ronny**

---

## 🛠️ Tecnologias

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=flat&logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat&logo=vercel&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=flat&logo=openai&logoColor=white)

**No navegador:** HTML5 · CSS3 · JavaScript puro, com módulos ES no painel. Sem framework, sem etapa
de build e **sem uma dependência npm** — o leitor de ZIP, o parser de OOXML, o encoder de WAV, o drag
and drop e os gráficos são todos escritos à mão sobre API nativa.

**Fora dele:** Supabase (Auth, Postgres com RLS e Realtime) · três Vercel Functions em Node que falam
com a OpenAI · e o servidor local que roda junto do robô.

---

<p align="center">
  Feito com 💛 para o TCC do UNASP
</p>
