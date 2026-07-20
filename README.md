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
| 🗄️ **Supabase** | Criança, conversas (Diário), planos de estudo, perfil | `@supabase/supabase-js` (anon key + RLS). Conversas são **só leitura** pelo site; planos têm CRUD |
| 🖥️ **Servidor local da Cogni** | Resumo Semanal (IA), pareamento/despareamento, código do perfil | `fetch` nos endpoints `/api/...` (precisa do robô/servidor ligado) |

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

Duas features dependem do servidor que roda junto do robô. A URL fica no topo de `js/dashboard/main.js`:

```js
export const SERVIDOR_URL = "http://127.0.0.1:3000";
```

> ⚠️ **Por que `127.0.0.1` e não `localhost`?** O servidor escuta só em IPv4, e os navegadores costumam
> resolver `localhost` para IPv6 (`::1`) primeiro — o que derruba o `fetch` com `ERR_CONNECTION_RESET`.
> Forçar `127.0.0.1` (IPv4) evita o problema. Se você subir o servidor noutra máquina/porta, troque aqui.

### 🧩 Onboarding & pareamento

Quando o pai entra e **ainda não tem criança vinculada**, aparece um **onboarding em tela cheia**:

- **Primeira vez** (sem histórico no navegador): 3 telas — duas de apresentação com animação + a de
  pareamento (código de 6 caracteres).
- **Depois** (ou se despareou): vai **direto** pra tela de pareamento, sem repetir a apresentação.

O código é validado **pelo servidor** (que seta o vínculo com a `service_role`) — o site **nunca** escreve
o `responsavel_id` direto. Em **Configurações** dá pra ver o código do perfil e **desvincular** (com
confirmação). O vínculo é **permanente**: só some se você desvincular.

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
| `js/dashboard/sections/*.js` | As 6 seções: Início, Conversas, Aprendizado, Planos, **Rosto da Cogni**, Configurações |
| `css/dashboard-onboarding.css` | Estilos do onboarding |
| `css/dashboard-rosto.css` | Estilos do editor de rosto (estética infantil, escopada em `.dash-rosto`) |

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
│   │   ├── router.js       # Roteamento por hash
│   │   └── sections/       # Início, Conversas, Aprendizado, Planos, Rosto, Config
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
