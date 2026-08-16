# 🤖 Cogni — A tutora de IA que pensa, aprende e evolui com você

> Site institucional do **Cogni**, um projeto de TCC do **UNASP** que apresenta uma tutora robótica com inteligência artificial: ela ouve, enxerga e responde em tempo real, transformando dúvidas em descobertas e adaptando o ensino ao ritmo de cada pessoa.

Mais do que um robô, o Cogni é a união de **hardware + IA** numa experiência completa de aprendizado personalizado — combinando reconhecimento de fala, visão computacional e modelos de linguagem de última geração. 🧠✨

---

## 🌐 Sobre o projeto

Este repositório contém o **site de apresentação** do Cogni: um site estático, responsivo e com tema claro/escuro, feito para mostrar a proposta, os materiais, o jogo e o artigo científico que documentam o desenvolvimento do projeto.

O site foi construído **do zero em HTML, CSS e JavaScript puro** (sem frameworks), com foco em performance, acessibilidade e uma identidade visual própria, reproduzindo fielmente o design feito no Figma.

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

---

## ✨ Destaques técnicos

- 🎨 **Design system próprio** — tokens de cor, tipografia e espaçamento centralizados em `css/tokens.css`, com componentes reutilizáveis.
- 🌗 **Tema claro/escuro** — alternância de tema com persistência em `localStorage` e script anti-flash (aplica o tema antes da tela pintar).
- 📱 **Totalmente responsivo** — layouts adaptados para desktop e mobile, com textos e imagens otimizados por tamanho de tela.
- 🎬 **Animações ao rolar** — efeitos de *reveal* e micro-interações suaves, com fallback para quem desativa o `js`.
- ♿ **Acessibilidade** — uso de `aria-*`, textos alternativos nas imagens e HTML semântico.
- ⚡ **Zero dependências de build** — é só abrir e rodar; nada de instalar pacotes.

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
| 🖥️ **Servidor local da Cogni** | Resumo Semanal (IA), Dica do Cogni (IA), **Mapa da aula ao vivo + seu resumo** (IA), rosto do robô, pareamento/despareamento | `fetch` nos endpoints `/api/...` (precisa do robô/servidor ligado) |

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
de `js/dashboard/main.js`:

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

Quando o pai entra e **ainda não tem criança vinculada**, aparece um **onboarding em tela cheia**:

- **Primeira vez** (sem histórico no navegador): 3 telas — duas de apresentação com animação + a de
  pareamento (código de 6 caracteres).
- **Depois** (ou se despareou): vai **direto** pra tela de pareamento, sem repetir a apresentação.

O código é validado **pelo servidor** (que seta o vínculo com a `service_role`) — o site **nunca** escreve
o `responsavel_id` direto. Em **Configurações** dá pra ver o código do perfil e **desvincular** (com
confirmação). O vínculo é **permanente**: só some se você desvincular.

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
  ("precisou de mais ajuda", "estava embalada"). E se um rótulo vier **igual** ao sinal — o que acontece
  quando o robô ganha um sinal novo e esquece de nomeá-lo —, o site troca por um neutro em vez de vazar.
- 🚫 **Não é placar.** Os `contadores` chegam no payload e **de propósito não viram números**: "2 acertos ×
  1 tropeço" é boletim com outro nome. O cabeçalho mostra só duração e trocas de conversa. Pelo mesmo
  motivo, o `peso` do assunto mais difícil é descartado (é ranking interno) e as `ocorrencias` viram frase
  — *"esse ponto voltou algumas vezes"* —, nunca contagem.
- 😌 **Aula sem nenhum momento é boa notícia**, não tela vazia: aparece como *"a aula correu tranquila"*.
- ♿ **Não depende de cor nem de posição.** Cada marcador é um `<button>` com o momento inteiro no
  `aria-label`, a lista repete tudo em texto, e tocar um marcador destaca a linha correspondente (no
  celular não existe hover).

> 🔌 O histórico é lido **direto do Supabase**, e não só do endpoint, por um motivo específico: quando há
> aula ao vivo, `/api/mapa-aula` devolve `historico: []` (ele prioriza a sessão que está em RAM). Sem a
> tabela, as aulas anteriores sumiriam da tela **exatamente durante a demonstração ao vivo** — e o
> histórico também continua valendo com o robô desligado.

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

#### ⚙️ O que o Nicolas precisa configurar

A leitura do material é a **única** parte do Companion que roda fora do navegador — duas Vercel
Functions (`api/plano-de-material.mjs` e `api/ler-link.mjs`, com os módulos em `api/_lib/`), porque
o servidor da Cogni é `127.0.0.1` e do celular do pai ele simplesmente não existe. Em *Settings →
Environment Variables* do projeto na Vercel:

| Variável | Pra quê |
| --- | --- |
| `OPENAI_API_KEY` | a leitura do material **e** a transcrição do áudio |
| `SUPABASE_URL` | validar o login do pai e ler a criança pareada |
| `SUPABASE_ANON_KEY` | idem (é a chave pública; quem protege é a RLS) |

> 🆓 A leitura de link **não pediu nada novo**: nem variável de ambiente, nem dependência npm.
> `fetch` e `node:dns` já vêm no runtime, e o YouTube é lido sem chave.

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

> 🧪 **Testar sem OpenAI, sem deploy e sem login:** vire `USAR_SUPABASE = false` e "Criar com a
> Cogni" devolve uma proposta de exemplo local. Só a **rede** é falsa — toda a extração roda de
> verdade: o unzip do `.docx`, a decomposição do vídeo em quadros, a gravação do microfone. Dá
> pra percorrer o fluxo inteiro offline, inclusive a revisão (editar tarefa, apagar, o chip
> "confira", corrigir o texto extraído, rascunho × aprovar). **Link também**: colar um endereço
> devolve um card de exemplo com miniatura e selo — e um link de `/shorts/` cai de propósito no
> degrau "sem legenda", que é o caminho mais curto pra ver como a degradação honesta aparece na tela.

### 🗃️ Arquivos do painel

| Arquivo | Função |
| --- | --- |
| `js/dashboard/main.js` | Bootstrap: guard de auth, decide onboarding × painel, monta o contexto e o router |
| `js/dashboard/mock-data.js` | **Fonte de dados** (roteia mock ↔ Supabase pela flag `USAR_SUPABASE`) |
| `js/dashboard/supabase-data.js` | Implementação real das queries/escritas no Supabase |
| `js/dashboard/onboarding.js` | Boas-vindas + pareamento por código (tela cheia, com motion) |
| `js/dashboard/resumo-semanal.js` | Card + modal do "Resumo da semana da Cogni" (bilhete por IA) |
| `js/dashboard/dica.js` | Card "Dica do Cogni" (Início + Aprendizado), gerada por IA no servidor local (`/api/dica`) |
| `js/dashboard/router.js` | Roteamento por hash (SPA leve) |
| `js/dashboard/rosto-preview.js` | Desenho do rosto do robô em SVG (módulo puro, sem rede) |
| `js/dashboard/rosto-api.js` | Leitura/gravação do rosto: PUT ao vivo no robô + persistência no Supabase |
| `js/dashboard/mapa-api.js` | Dados do Mapa da aula: endpoint (ao vivo) + tabela (histórico) e o saneamento dos momentos |
| `js/dashboard/mapa-timeline.js` | A linha do tempo da aula (marcadores em HTML/CSS, cada um um `<button>`) |
| `js/dashboard/dnd.js` | **Drag and drop do quadro** (Pointer Events à mão, com teclado e `aria-live`) |
| `js/dashboard/mesa-realtime.js` | **O quadro ao vivo**: canal do Supabase, fila durante o arraste, degradação |
| `js/dashboard/captura.js` | **Pedido/material → plano**: o campo do pedido, o campo de link, as quatro entradas de material, a bandeja e o orçamento |
| `js/dashboard/revisao.js` | A tela de revisão (o pai confere e edita antes de qualquer coisa valer) |
| `js/dashboard/material/` | Cada formato virando item: `index` (dispatcher), `orcamento`, `imagem`, `zip`, `ooxml`, `texto`, `audio`, `gravador`, `video`, `wav`, `bytes`, **`link`** |
| `api/plano-de-material.mjs` | **Vercel Function** que lê o material com IA (a única coisa fora do navegador) |
| `api/ler-link.mjs` | **Vercel Function** que lê a videoaula ou a página de um link colado |
| `api/_lib/` | As peças delas: `auth` (as travas), `itens` (tetos), `openai`, `prompt`, `sanear`, `http` |
| `api/_lib/link/` | A leitura de link: `rede` (SSRF, redirect, tetos), `youtube` (InnerTube + legenda), `pagina` (charset, HTML→texto, anti-bot, PDF) |
| `js/dashboard/sections/*.js` | As 7 seções: Início, Conversas, Aprendizado, **Mapa da aula**, **Mesa de Estudos**, **Rosto da Cogni**, Configurações |
| `css/dashboard-onboarding.css` | Estilos do onboarding |
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
├── api/                    # Vercel Functions (site estático + 2 funções)
│   ├── plano-de-material.mjs # Pedido do pai e/ou material da escola → plano, por IA
│   ├── ler-link.mjs        # Videoaula do YouTube ou página da web → material
│   └── _lib/               # Peças delas (o "_" impede virar rota): auth, itens,
│                           #   openai, prompt, sanear, http
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
│   │   ├── mock-data.js    # Fonte de dados (flag USAR_SUPABASE: mock ↔ real)
│   │   ├── supabase-data.js# Queries/escritas reais no Supabase
│   │   ├── onboarding.js   # Boas-vindas + pareamento por código
│   │   ├── resumo-semanal.js # Bilhete da semana (IA, servidor local)
│   │   ├── dica.js         # Dica do Cogni (IA, servidor local)
│   │   ├── mapa-api.js     # Mapa da aula: ao vivo (servidor) + histórico (Supabase)
│   │   ├── mapa-timeline.js# A linha do tempo da aula (marcadores acessíveis)
│   │   ├── dnd.js          # Drag and drop do quadro (Pointer Events + teclado)
│   │   ├── mesa-realtime.js# O quadro ao vivo (canal do Supabase + fila)
│   │   ├── captura.js      # Pedido/material/link → plano (entradas, bandeja, orçamento)
│   │   ├── revisao.js      # A revisão do plano (o pai confere e edita)
│   │   ├── material/       # Cada formato virando item, sem biblioteca:
│   │   │                   #   index, orcamento, imagem, zip, ooxml, texto,
│   │   │                   #   audio, gravador, video, wav, bytes, link
│   │   ├── router.js       # Roteamento por hash
│   │   └── sections/       # Início, Conversas, Aprendizado, Mapa, Mesa, Rosto, Config
│   └── ...
│
└── assets/                 # Mídia
    ├── icons/              # Ícones e favicon
    ├── images/             # Imagens (robô, equipe, produtos, jogo...)
    └── pdfs/               # Artigo científico em PDF
```

---

## 🚀 Como rodar localmente

Como é um site **100% estático**, você tem duas opções:

**Opção 1 — Abrir direto:** basta abrir o arquivo `index.html` no navegador. 👍

**Opção 2 — Servidor local (recomendado):** evita pequenos problemas com caminhos de arquivo. Escolha um:

```bash
# Com Python (já vem instalado em muitos sistemas)
python -m http.server 5500

# Ou com Node.js
npx serve
```

Depois é só acessar o endereço que aparecer no terminal (ex.: `http://localhost:5500`).

> 💡 No VS Code, a extensão **Live Server** também funciona super bem: clique com o botão direito no `index.html` → *Open with Live Server*.

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

HTML5 · CSS3 · JavaScript (vanilla) — sem frameworks, sem build.

---

<p align="center">
  Feito com 💛 para o TCC do UNASP
</p>
