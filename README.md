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

## 🗂️ Estrutura de pastas

```
Cogni Software/
├── index.html              # Home
├── produto.html            # Detalhes do produto
├── jogo.html               # Página do jogo
├── instrucoes.html         # Instruções
├── login.html              # Login
├── cadastro.html           # Cadastro
│
├── css/                    # Estilos (tokens → base → componentes)
│   ├── tokens.css          # Design tokens (cor, tipografia, espaçamento)
│   ├── base.css            # Reset e estilos globais
│   └── ...                 # Um arquivo por seção/componente
│
├── js/                     # Comportamento (JS puro, modular)
│   ├── theme.js            # Alternância de tema claro/escuro
│   ├── nav.js              # Navegação / menu
│   ├── scroll.js           # Animações ao rolar
│   ├── products-data.js    # Dados dos materiais/produtos
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
