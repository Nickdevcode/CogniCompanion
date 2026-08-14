# 🛠️ Cogni Companion — Plano Técnico & Contrato de Dados

> Documento-mãe da construção do **Companion** (o app dos pais). Reúne a arquitetura, o escopo do MVP, o schema do banco e o **contrato de dados** que tanto o backend (servidor da Cogni) quanto o front-end (site na Vercel) seguem. Sempre que algo mudar, atualize **aqui primeiro**.
>
> 📌 Companheiro de leitura: `docs/APP-COMPANION.md` (a visão/produto). Este aqui é o **como**.

---

## 🎯 A ideia em uma frase

O robô da Cogni roda **local** (no notebook, na mesma rede Wi-Fi — a voz e a IA não dependem da nuvem). O site do Companion roda na **Vercel**. A ponte entre os dois é o **Supabase** (Postgres + Auth + RLS), a **fonte única de dados**: o servidor sincroniza pra lá, o site lê de lá. Assim os pais acompanham tudo de qualquer lugar, e o robô continua funcionando mesmo se a internet cair na hora da apresentação.

```
   🏠 LOCAL (notebook na apresentação)          ☁️ NUVEM (grátis)
   🤖 Robô ESP32 ──Wi-Fi──┐
                          ▼                      ┌──────────────────┐
   💻 Servidor Cogni ─────────── internet ─────▶ │  SUPABASE        │
      (localhost:3000)                           │  Postgres + Auth │
      voz/IA/TTS = LOCAL ✅                       │  + RLS + Realtime│
      cache RAM (leitura síncrona)               │                  │
                                                 │  responsaveis    │
   🌍 Pais (qualquer lugar)                       │  criancas        │
   📱 Companion (Vercel) ──────── internet ─────▶ │  conversas       │
      anon key + RLS                             │  planos_estudo   │
                                                 │  pareamentos     │
                                                 └──────────────────┘
```

---

## 🤝 Workflow (quem faz o quê)

São **dois projetos/repositórios separados**:

| Projeto | Pasta | Papel |
| --- | --- | --- |
| 🧠 **Servidor + robô** | `Cogni/` | Backend: refactor pro Supabase, persistência de conversas, injeção dos planos no cérebro da Cogni, pareamento |
| 🎨 **Site / Companion** | `Cogni Software/` | Front-end: telas do dashboard (seguindo o **contrato de dados** abaixo), auth, leitura/escrita no Supabase |

A regra de ouro: **as duas pontas programam contra o contrato de dados deste documento**. Nomes de tabela/coluna e formatos saem daqui — ninguém inventa.

---

## 🧱 Princípios da arquitetura (inegociáveis)

1. **Robô nunca trava esperando a nuvem.** No servidor, a leitura de perfil é **síncrona do cache em RAM**. A nuvem é sincronizada **por baixo** (write-through assíncrono).
2. **Fallback local.** O `usuarios.json` continua existindo como rede de segurança. Sem as credenciais do Supabase no `.env`, o servidor roda **exatamente como hoje** (flag `SUPABASE_HABILITADO`).
3. **De graça.** Supabase free tier + Vercel free.
4. **Segurança real (LGPD — dados de menores).** RLS por padrão nega tudo; cada responsável só enxerga os filhos vinculados a ele. A `service_role key` fica **só** no `.env` do servidor; o site usa a `anon key` (pública por design, protegida por RLS).
5. **Mexer no mínimo.** Reaproveitar o que já existe no servidor (cache, fila por usuário, filtro de segurança, pipeline pós-resposta).

---

## 🗂️ Escopo do MVP (o que entra de verdade)

### Telas do dashboard
Sidebar: **Início · Conversas · Aprendizado · Mapa da aula · Planos · Rosto da Cogni · Configurações** (a "Família" foi fundida em Configurações: o item da sidebar chama "Configurações", o título da tela continua "Configurações da família"). Entrada: badge de logado → dropdown → **Dashboard**.

> Os dois últimos itens nasceram depois do Figma e ficaram **fora** de Configurações de propósito: **Rosto da Cogni** (jul/2026) e **Mapa da aula** (ago/2026) são as duas contribuições que a banca precisa ver, e enterrá-las num submenu as esconderia. A tab bar do mobile aguenta os 7 itens até em 320px (verificado).

> **Vínculo 1:1 (single-child).** No Companion, **um responsável acompanha UMA criança** — a que estiver com o **código de pareamento ativo**. Não há seletor de criança nem lista de filhos. (O robô continua multi-perfil para teste/dev, mas só o perfil pareado aparece no Companion. Despareou/pareou outro → o Companion reflete o outro.)

### Funções e seus dados

| Tela | Entra no MVP | Como o dado nasce |
| --- | --- | --- |
| 🏠 **Início** | Tempo de uso do dia, última conversa, próximo plano, resumo da semana (**sem conquistas**), Dica do Cogni (IA) | Tempo de uso = soma da duração das conversas. Dica = IA 1×/dia com base em memórias + tópicos recentes |
| 🗣️ **Conversas** | Timeline por dia; cada conversa com **matéria** + **horário**; balões criança/Cogni; filtro de **tópicos sensíveis**; busca + filtro por matéria | Gravado a cada turno (ver Diário). Sensível = a **IA** marca (bullying, tristeza, medo… mesmo sem palavra-chave) + `verificarEntrada()` do `safety.js` como rede de segurança |
| 📚 **Aprendizado** | Tempo por matéria, **Trilha de aprendizado** (praticando × já domina), tópicos explorados, gráfico de evolução (min/dia), **Dicas da Cogni** (era "Curiosidades da criança"), contadores (**sem conquistas**) | Tempo por matéria/gráfico = soma das durações por matéria. Trilha = `criancas.progresso` (ver seção própria; read-only pro site). Tópicos = extraídos das conversas. **Dicas da Cogni** = dica atual (`/api/dica`) + histórico (tabela `dicas`). As "curiosidades da criança" (frases tipo "perguntou 4× sobre X") foram **aposentadas** (jun/2026) — a seção virou Dicas da Cogni |
| ✏️ **Planos** | Lista (Ativos/Todos/Concluídos) + criar/editar. Campos: título, conteúdo, foco, duração (dias), status | O **pai digita**. O plano ativo é injetado no system prompt da Cogni |
| ⚙️ **Configurações** (inclui "Família") | Perfil da criança pareada → detalhe (ver/editar infos + prompt personalizado); conta; tema; status da conexão do robô | Edição bidirecional do perfil (pai edita no site, robô capta por voz — os dois mexem no mesmo registro). O pai pode preencher infos antes mesmo do robô captar. **Editar o perfil no site já conta como onboarding feito**: a Cogni não refaz as perguntas de apresentação (ver instrumentação) |
| 📬 **Resumo Semanal** | Bilhete carinhoso por IA | IA resume as conversas da semana (depende do Diário; feito por último) |

### ❌ Anulado (decisão explícita — NÃO construir)
- **Conquistas / badges** (apareciam em 3 telas).
- **Limites de tempo e horários do robô** (site→robô forçar limite) — desnecessário pro TCC.
- **Humor** e **Concentração** (chips do Início + filtro de humor em Conversas) e a frase-resumo do dia.
- **"Adicionar responsável"** e **multi-filho / seletor de criança** — o Companion é **1 responsável ↔ 1 criança** (a pareada).
- **Filtros de segurança na tela de Configurações** (o robô já tem o filtro infantil).
- **Notificações / sininho 🔔 / preferências de notificação** — removido do MVP (decisão de jun/2026). Não há sininho nem preferências de notificação; o backend nunca teve lógica de notificação pro pai (o acompanhamento é o pai abrindo o dashboard).

> ⚠️ Os designs do Figma foram gerados por IA como **base visual** — há inconsistências entre telas (header/menu). Seguimos as **features**, não os detalhes visuais exatos.

---

## 💡 A chave de dados que economiza trabalho

Gravar em **cada conversa** a `materia` + a `duração` (início/fim) resolve de uma vez **três** features:
- ⏱️ Tempo de uso do dia (Início)
- 📊 Tempo por matéria (Aprendizado)
- 📈 Gráfico de evolução min/dia (Aprendizado)

Um dado, três coelhos. 🎯

---

## 🧬 Schema do banco (Supabase / Postgres)

> Tipos pensados pra simplicidade de TCC com segurança real. `idiomas_estudando` e `memorias` ficam como **jsonb** (são detalhe interno do perfil, ninguém faz query neles e têm limite embutido).

### `responsaveis` — os pais (espelha `auth.users`)
| Coluna | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid PK | = `auth.users.id` (FK, on delete cascade) |
| `nome` | text | |
| `email` | text | |
| `criado_em` | timestamptz | default now() |

### `criancas` — o perfil da criança (= o usuário de hoje)
| Coluna | Tipo | Notas |
| --- | --- | --- |
| `id` | **text** PK | mantém o id do robô `usuario_<ts>_<hex>` — **não trocar pra uuid** (usado em sessão/ESP/rate-limit) |
| `nome` | text | |
| `role` | text | `estudante` \| `desenvolvedor` |
| `idade` | int | nullable |
| `serie` | text | nullable |
| `materia_favorita` | text | nullable |
| `materia_dificil` | text | nullable |
| `como_aprende` | text | nullable |
| `hobbies` | text | nullable |
| `estilo_linguagem` | text | nullable |
| `onboarding_completo` | boolean | default false |
| `memorias` | jsonb | array de strings, default `[]` |
| `idioma_nativo` | text | default `pt` |
| `idiomas_estudando` | jsonb | array de objetos, default `[]` |
| `prompt_personalizado` | text | **novo** — instruções do pai pra Cogni sobre esse filho |
| `responsavel_id` | uuid | FK → responsaveis(id), nullable até parear |
| `codigo_pareamento` | text unique | **novo** — código FIXO do perfil (6 chars, sem ambíguos), gerado no nascimento do perfil, permanente. O pai usa pra vincular no Companion |
| `rosto_robo` | jsonb | **novo** — a geometria dos olhos que a **criança** desenhou (ver "🎨 O editor de rosto"). Nullable: sem valor = rosto de fábrica. Cada criança tem o seu, e trocar de perfil troca a cara do robô na hora |
| `progresso` | jsonb | **novo (ago/2026)** — a trilha de aprendizado (o *student model*): array de `{conceito, materia, status, acertos, vezes, visto, proxima}`, default `[]`. Quem escreve é **só o servidor**; o site trata como **read-only**. É o que permite a retomada espaçada da Cogni e, no Companion, alimenta o Painel (ver "📈 Trilha de aprendizado" abaixo) |
| `criado_em` | timestamptz | |
| `ultimo_acesso` | timestamptz | |
| `atualizado_em` | timestamptz | |

### `conversas` — o Diário
| Coluna | Tipo | Notas |
| --- | --- | --- |
| `id` | bigint identity PK | |
| `crianca_id` | text | FK → criancas(id), on delete cascade |
| `texto_usuario` | text | fala da criança |
| `texto_resposta` | text | resposta da Cogni |
| `materia` | text | uma de: portugues, matematica, ciencias, historia, geografia, idiomas, outros. Classificada pela **IA** que já roda no servidor (mais precisa); o regex local é só fallback se a IA não classificar |
| `topico` | text | **novo** — assunto fino da troca (ex: "sistema solar", "tabuada do 7"); nullable (papo/turno sem assunto = NULL). Extraído pela IA que já roda no servidor (custo zero) |
| `sensivel` | boolean | true se a conversa tocou algo emocionalmente delicado pros pais (bullying, tristeza, medo, etc.) — detectado pela **IA** (entende nuance, não precisa de palavra-chave literal) **OU** pelo filtro de segurança como rede de proteção. default false. Marca pro pai ver; **não** bloqueia a conversa (bullying a Cogni acolhe) |
| `duracao_ms` | int | duração do turno (pra somar tempo de uso/matéria). **Voz (robô):** tempo real de fala medido pelo VAD do mic. **Texto/voz-navegador:** tempo de geração da resposta da IA. Preenchido pelo servidor nos dois fluxos (antes vinha `null` em conversa por texto) |
| `origem` | text | `robo` \| `navegador` |
| `criado_em` | timestamptz | default now() |

Índice: `(crianca_id, criado_em desc)`.

### `planos_estudo` — os Planos
| Coluna | Tipo | Notas |
| --- | --- | --- |
| `id` | bigint identity PK | |
| `crianca_id` | text | FK → criancas(id), on delete cascade |
| `responsavel_id` | uuid | FK → responsaveis(id) — **NOT NULL** no banco (o site deve sempre enviar o `auth.uid()` ao criar um plano) |
| `titulo` | text | |
| `conteudo` | text | texto livre injetado no system prompt |
| `foco` | text | matéria (mesma lista de `conversas.materia`) |
| `duracao_dias` | int | |
| `status` | text | `ativo` \| `em_andamento` \| `pausado` \| `concluido`. A Cogni **segue** (injeta no prompt) só os planos `ativo` **ou** `em_andamento`; `pausado`/`concluido` ela ignora |
| `criado_em` / `atualizado_em` | timestamptz | `criado_em` define a expiração: um plano vence quando `criado_em + duracao_dias` já passou (1 dia dura 1 dia). Plano vencido a Cogni para de cobrar, mesmo que o status ainda esteja `ativo`. `duracao_dias` null/0 = sem prazo |

Índice parcial: `(crianca_id) where status = 'ativo'`.

### `dicas` — histórico das Dicas da Cogni
> A "Dica do Cogni" da tela Início é gerada por IA (cache curto de 1h no servidor). Cada dica gerada é **guardada** aqui (só se diferente da última) pra o Companion listar o histórico na tela **"Dicas da Cogni"** (a antiga "Curiosidades da criança", em Aprendizado).

| Coluna | Tipo | Notas |
| --- | --- | --- |
| `id` | bigint identity PK | |
| `crianca_id` | text | FK → criancas(id), on delete cascade |
| `texto` | text | o texto da dica |
| `criado_em` | timestamptz | default now() |

Índice: `(crianca_id, criado_em desc)`. RLS: pai só **lê** (SELECT) as dicas dos próprios filhos; **só o servidor grava** (service_role), igual `conversas`.

### `sessoes_atencao` — o Mapa de Compreensão da Aula ⭐ NOVO (ago/2026)
> Uma linha por **aula** (sessão de estudo), não por turno. O `conversas` conta **o que** foi conversado; esta conta **como foi** — em que minuto o assunto virou dificuldade, e sobre o quê. É a resposta à pergunta que nenhum sistema escolar responde.

| Coluna | Tipo | Notas |
| --- | --- | --- |
| `id` | bigint identity PK | |
| `crianca_id` | text | FK → criancas(id), on delete cascade |
| `iniciada_em` | timestamptz | quando a sessão começou |
| `duracao_ms` | int | duração total da sessão |
| `turnos` | int | quantas trocas de conversa aconteceram |
| `materias` | text[] | matérias tocadas na sessão |
| `topicos` | text[] | tópicos finos tocados na sessão |
| `contadores` | jsonb | `{ travada, confusa, engajada, acertos, tropecos }` |
| `momentos` | jsonb | **o coração**: a linha do tempo já cruzada (ver formato abaixo) |
| `criado_em` | timestamptz | default now() |

Índice: `(crianca_id, iniciada_em desc)`. RLS: pai só **lê**; só o servidor grava (igual `conversas`).

**Formato de `momentos`** (array, cada item é um instante que importa):
```json
[
  { "emMs": 252000, "tipo": "afeto", "sinal": "travada",
    "rotulo": "precisou de mais ajuda",
    "materia": "matematica", "topico": "fracoes equivalentes" },
  { "emMs": 300000, "tipo": "pratica", "resultado": "aprendeu",
    "rotulo": "resolveu sozinha",
    "materia": "matematica", "topico": "fracoes equivalentes" }
]
```

`emMs` é o **offset desde o início da sessão** (não timestamp absoluto) — é o que permite desenhar a linha do tempo direto, sem conta nenhuma no front. O `topico` de cada momento é o assunto que estava valendo **naquele segundo** (o servidor já cruzou); o site não precisa correlacionar nada.

> [!warning] Vocabulário: `travada` NUNCA aparece cru na tela
> Vale a mesma regra da trilha de aprendizado. O `sinal` é dado interno; o que se mostra ao pai é o `rotulo`, que já vem pronto e escrito em linguagem de apoio ("precisou de mais ajuda", "estava embalada"). Não invente rótulo no front, e não traduza `sinal` por conta própria.

### ~~`pareamentos`~~ — DESCARTADA
> A tabela `pareamentos` do plano original **não é usada** (foi dropada). Em vez de um código temporário numa tabela à parte, o código vive **no próprio perfil** (`criancas.codigo_pareamento`): é fixo, nasce com o perfil e não expira. Mais simples e bate com o modelo single-child. Ver o fluxo de pareamento no contrato de dados abaixo.

### Matérias (lista fixa — categorização da conversa)
`portugues · matematica · ciencias · historia · geografia · idiomas · outros`
(o "outros" cobre papo/conversa que não é matéria escolar.)

---

## 🔐 RLS (Row Level Security)

Todas as tabelas com RLS **habilitado** e default-deny. O `service_role` (servidor) **bypassa** RLS — então as policies protegem só a superfície exposta na internet (site com anon key).

- **responsaveis**: pai só vê/edita a própria linha (`auth.uid() = id`).
- **criancas**: pai só vê/edita as crianças onde `responsavel_id = auth.uid()`.
- **conversas**: pai só **lê** (SELECT) as conversas dos próprios filhos; **não escreve** (só o servidor grava).
- **dicas**: pai só **lê** (SELECT) as dicas dos próprios filhos; **não escreve** (só o servidor grava). Mesma policy de `conversas`.
- **sessoes_atencao**: pai só **lê** (SELECT) as sessões dos próprios filhos; **não escreve** (só o servidor grava). Mesma policy de `conversas`.
- **planos_estudo**: pai vê/cria/edita planos dos próprios filhos.
- **pareamento**: não há tabela exposta. O código mora em `criancas.codigo_pareamento` e o vínculo (setar `responsavel_id`) é feito **só pelo servidor** (service_role, via `POST /api/pareamento/vincular`) — o site nunca escreve esse campo direto.

`on delete cascade` nas FKs = **direito ao esquecimento** (apagar a criança apaga conversas e planos).

---

## 📡 Contrato de dados (para o front-end)

O site lê/escreve via `@supabase/supabase-js` (anon key, já carregado nos HTMLs). Regras práticas pro front:

- **Ler perfil da criança:** `from('criancas').select('*').eq('id', criancaId)` — campos conforme a tabela acima (snake_case).
- **Carregar a criança do pai logado (single-child):** `from('criancas').select('*').eq('responsavel_id', user.id).maybeSingle()` — a RLS garante que só vem a criança vinculada a ele. Se vier vazio → o pai ainda não pareou (mostrar o onboarding de código).
- **Ler conversas (Diário):** `from('conversas').select('*').eq('crianca_id', id).order('criado_em', { ascending: false })`. Agrupar por dia no front. Filtro de matéria = `.eq('materia', x)`; tópicos sensíveis = `.eq('sensivel', true)`.
- **Aprendizado:** derivar do `select` de `conversas` (somar `duracao_ms` por `materia` e por dia) + ler `idiomas_estudando`/`memorias` do perfil. **Tópicos explorados:** usar a coluna `topico` (preenchida pelo servidor; `null` = papo sem assunto) → lista de `topico` distintos. As **"curiosidades da criança"** (agrupar `topico` e contar, ex: "perguntou 4× sobre dinossauros") foram **aposentadas** (jun/2026): aquela seção da tela Aprendizado virou **"Dicas da Cogni"** (ver Dica do Cogni / Histórico de dicas acima). O `topico` continua alimentando "Tópicos explorados" e o Resumo Semanal.
- **Planos:** CRUD em `planos_estudo` (o pai escreve direto; RLS protege).
- **Resumo Semanal:** **não** é Supabase — é um endpoint do servidor (a chave da OpenAI vive só lá). O site faz `GET {SERVIDOR}/api/resumo-semanal?criancaId=<id>` e recebe `{ resumo, periodoDias, totalConversas, materias, topicos, vazio }`. O servidor lê as conversas dos últimos 7 dias e gera o bilhete com IA, sob demanda (quando o pai abre a tela). `vazio: true` = sem conversas na semana (o `resumo` já vem com uma mensagem amigável). `{SERVIDOR}` = a URL do servidor local da Cogni (ex: `http://localhost:3000`).
- **Dica do Cogni (tela Início):** endpoint do servidor (IA + chave da OpenAI). O site faz `GET {SERVIDOR}/api/dica?criancaId=<id>` e recebe `{ dica, deCache, vazio }`. A IA gera **uma** dica curta e acionável pros pais, com base nas memórias + tópicos recentes da criança. **Cache curto de 1h** no servidor (reflete a conversa recente sem gerar a cada reload — antes era 1 dia, dava "delay"). `deCache: true` = veio do cache; `vazio: true` = perfil sem dados ainda (dica genérica amigável). `?forcar=1` ignora o cache. Cada dica gerada é **guardada na tabela `dicas`** (só se diferente da última).
- **Histórico de dicas (tela "Dicas da Cogni", em Aprendizado):** o site **lê direto do Supabase** (RLS), igual conversas: `from('dicas').select('*').eq('crianca_id', id).order('criado_em', { ascending: false })`. A dica **atual** (destaque) vem do `GET /api/dica`; o **histórico** (lista) vem desse select. Essa tela é a antiga "Curiosidades da criança", renomeada pra **"Dicas da Cogni"**.
- **Mapa de Compreensão (tela nova):** o site faz `GET {SERVIDOR}/api/mapa-aula?criancaId=<id>` e recebe `{ emAndamento, sessao, historico[] }`. **Se há uma sessão acontecendo agora** (a criança está conversando com o robô neste momento), `emAndamento: true` e `sessao` é a linha do tempo **ao vivo** — a tela pode dar poll a cada ~10s e ver os momentos aparecendo. Sem ninguém conversando, `emAndamento: false` e vem o histórico (do Supabase, mesma forma). Alternativa: ler direto do Supabase (`from('sessoes_atencao')...`) — mas aí você perde o ao vivo, que é justamente a parte que impressiona.
- **Resumo do mapa em texto:** `GET {SERVIDOR}/api/mapa-aula/resumo?criancaId=<id>` → `{ texto, emAndamento }`. Duas ou três frases geradas por IA sobre a última sessão (ou a atual), já no vocabulário de apoio. `texto: null` + `motivo: 'sem_sessao'` = ainda não houve aula registrada. Chamar quando o pai **abre** a tela, não a cada render (passa pelo mesmo rate limit dos outros endpoints de IA).
- **Escrita de conversa:** o site **nunca** insere em `conversas` nem em `sessoes_atencao` (RLS bloqueia) — quem grava é o servidor.
- **Pareamento (onboarding do site):** quando o pai loga e **não tem criança vinculada** (o `select` de `criancas` por `responsavel_id` vem vazio), o site mostra o onboarding pedindo o **código de pareamento** (6 caracteres, o pai pega no robô — na tela do painel ou pedindo pra Cogni falar). O site faz `POST {SERVIDOR}/api/pareamento/vincular` com `{ codigo, responsavelId }` (o `responsavelId` = `auth.uid()` do pai logado). Respostas: `200 { ok:true, jaPareado?, criancaId, nome }` (pareou ou já era dele) · `404` código inválido · `409` criança já vinculada a outro responsável · `400` dados faltando. Depois de pareado, o site lê a criança normalmente por `responsavel_id` (RLS) e tudo (conversas/planos/aprendizado) vem junto. O **vínculo é permanente** (não expira); só some se despareado. `{SERVIDOR}` = a URL do servidor local da Cogni.
- **Despareamento:** `POST {SERVIDOR}/api/pareamento/desvincular` com `{ criancaId, responsavelId }`. Zera o `responsavel_id` da criança (**só** se quem pede for o dono — um pai não desvincula filho de outro). Respostas: `200 { ok:true, jaDesvinculado? }` (`jaDesvinculado:true` quando já não estava vinculada a ele — idempotente) · `404` criança não encontrada · `400` dados faltando. O `codigo_pareamento` **não muda**, então dá pra reparear depois com o mesmo código. Uso no site (etapa "status de vínculo"): mostrar "Conectado ao perfil de [nome]" + botão "Desvincular" (recomenda-se confirmar antes — apagar o vínculo tira o acesso às conversas daquele filho).

> O front usa **snake_case** (como vem do Postgres). O servidor converte snake↔camel internamente (o código do servidor usa camelCase: `materiaFavorita` etc.).

---

## 🎨 O editor de rosto (a criança desenha os olhos do robô)

Essa é a única tela do Companion feita **para a criança**, não para o pai — e é a que tem respaldo acadêmico mais direto: um estudo de 2025 mostrou que um rosto **desenhado pela própria criança** tem *inteligência social percebida* significativamente maior que um rosto genérico, e aponta que quase todo robô infantil é projetado da perspectiva de um adulto. No TCC isso vira hipótese testável com grupo de controle: mesmo robô, mesmo conteúdo, mudando só quem desenhou a cara dele.

### O que a criança controla

O robô desenha os olhos **proceduralmente** (não são imagens), então o que o editor expõe são cinco parâmetros — e só esses cinco. Qualquer coisa fora dessa lista o firmware ignora.

| Campo | Tipo | Faixa aceita | Padrão | O que muda na cara |
| --- | --- | --- | --- | --- |
| `largura` | int (px) | 14 – 48 | 36 | Olho fino ou largo |
| `altura` | int (px) | 12 – 48 | 36 | Olho espremido ou arregalado |
| `raio` | int (px) | 0 – 16 | 8 | **0 = quadradão (sério/robótico)**, 16 = bem redondo (fofo) |
| `espaco` | int (px) | −4 – 34 | 10 | Distância entre os olhos; negativo cruza (vesguinho permanente) |
| `sobrancelhas` | boolean | — | `true` | Liga/desliga as sobrancelhas |

> ⚠️ **A faixa é validada no firmware**, que é quem conhece a tela de 128×64. O site deve respeitar os limites acima na UI (sliders), mas não precisa se preocupar em blindar: um valor fora da faixa é **grampeado**, nunca desenha fora da tela.

### Os dois endpoints

Ambos no servidor local da Cogni (`{SERVIDOR}`), porque quem fala com o robô é ele:

```
GET  {SERVIDOR}/api/esp/rosto?usuarioId=<id>
  → { rostoRobo: { largura, altura, raio, espaco, sobrancelhas }, padrao: {...} }

PUT  {SERVIDOR}/api/esp/rosto
  body: { usuarioId, largura, altura, raio, espaco, sobrancelhas }
  → { rostoRobo, aplicadoNoRobo: true|false }
```

`aplicadoNoRobo` diz se o robô estava conectado **e** usando aquele perfil. `false` não é erro: o rosto foi salvo e vai valer na próxima conexão.

### O detalhe que faz a tela ser divertida

O `PUT` aplica **na hora** no robô físico. Então o editor deve mandar a cada mudança de slider (com um *debounce* de ~150 ms) e a criança vê **o robô de verdade mudando de cara ao vivo** enquanto arrasta. É isso que transforma um formulário numa brincadeira — sem o preview ao vivo, a feature perde a graça inteira.

Recomendado: um preview em SVG/Canvas no próprio site (dois retângulos arredondados + as barrinhas das sobrancelhas), para funcionar mesmo com o robô desligado.

### Onde o dado mora

`criancas.rosto_robo` (jsonb). O robô lê do perfil local, que já é hidratado do Supabase pelo caminho normal — **não há sincronismo novo a construir**. O servidor manda o rosto pro robô em dois momentos: quando ele conecta (o firmware não guarda geometria entre reinícios) e quando **troca o perfil ativo** — o que é o que faz a ideia valer numa casa com mais de um filho.

---

## 🪜 Fases de execução (ordem de menor risco)

| Fase | O que | Risco no robô |
| --- | --- | --- |
| **0 — Fundação** | Criar projeto Supabase, rodar o SQL (schema + RLS), ativar Realtime, `npm i @supabase/supabase-js` | Zero |
| **1 — Auth** | Colar credenciais no site; ligar cadastro → `responsaveis`; onboarding de pareamento na 1ª entrada | Zero |
| **2 — Migração do servidor** | Cliente Supabase + hidratação no boot + write-through + Realtime, atrás da flag. `carregarUsuario` continua síncrono | Baixo (com fallback JSON) |
| **3 — Funções (1 por vez)** | Aprendizado → Diário → Planos → Resumo. Cada uma: backend + tela + teste | Baixo |
| **4 — Pareamento (single-child)** | Código no robô + onboarding no site na 1ª entrada (vincula a criança ao responsável); a criança pareada é a que o Companion mostra | Zero |

Cada função: **eu (backend) → atualizo o contrato → Claude do site (tela) → testamos juntos.**

---

## 🧩 Pontos de instrumentação no servidor (já mapeados)

- **Gravar conversa:** `server/modules/brain.js` → `pipelinePosResposta(usuario, usuarioId, sessionId, textoUsuario, textoResposta, ehOnboarding, historico, contextoIdioma)` (linha ~230). Roda nos **dois** caminhos (robô e navegador), fire-and-forget. Já tem tudo no escopo; adicionar só o parâmetro `origem`.
- **Marcar sensível:** ✅ **feito.** A **IA** pós-resposta (`brain/memoria-ai.js`, a mesma chamada que extrai memória/tópico) devolve `sensivel` (entende nuance: bullying, tristeza, medo, sem precisar de palavra-chave). O `pipelinePosResposta` grava `sensivel = IA || verificarEntrada()` (regex do `safety.js` como rede de segurança). Sensível **marca pro pai**, não bloqueia (o bloqueio é só pro conteúdo realmente impróprio).
- **Classificar matéria:** ✅ **feito.** A **IA** pós-resposta também classifica a `materia` (mais precisa que regex). O `brain/materia.js` (regex) é só fallback quando a IA não classifica. Grava no insert (regex) e a IA enriquece via UPDATE (`atualizarConversaPosIA` em `supabase.js`).
- **Onboarding inteligente:** ✅ **feito.** `brain/memoria-ai.js` → `camposEssenciaisFaltantes(usuario)`/`temEssenciais(usuario)` (idade, série, hobbies, comoAprende). Se o pai preencheu tudo no site, o `verificarOnboarding` fecha a flag na hora e o `blocoOnboarding` (prompt.js) vira no-op — a Cogni **não refaz** as perguntas nem sobrescreve. Se faltam campos, ela pergunta **só os que faltam**.
- **Injetar plano no prompt:** ✅ **feito.** `server/modules/planos.js` faz cache RAM do plano ativo por criança — `obterPlanoAtivo(id)` é leitura **síncrona** (robô não trava), `hidratarPlanos()` pré-carrega no boot. O `blocoPlanoEstudo(usuario, plano, gancho)` em `prompt.js` injeta título+foco+conteúdo (tom roteiro-não-prisão) via `extras.plano`, só pro estudante. Conta `status` `ativo` **ou** `em_andamento`; **expira** por `criado_em + duracao_dias` (1 dia dura 1 dia → para de cobrar). **1 plano vigente por criança** (single-child); se houver vários, vale o mais recente por `atualizado_em`. **Propagação e proatividade foram refeitas em ago/2026 — ver a seção própria abaixo.**
- **Dica do Cogni:** ✅ **feito.** `server/modules/brain/dica.js` (novo) → `gerarDicaDoCogni({openai, modelo}, criancaId)`, exposto em `GET /api/dica?criancaId=`. IA gera uma dica curta e acionável pros pais com base em memórias + tópicos recentes. **Cache RAM curto de 1h** por criança (antes era 1 dia, dava "delay" — agora reflete a conversa recente sem regerar a cada reload); `?forcar=1` ignora o cache. Cada dica gerada é guardada na tabela `dicas` (só se diferente da última).
- **Camada de dados:** `server/modules/memoria.js` (cache + fila por usuário `filasPorUsuario` + `atualizarUsuario` async já existem — reaproveitar pro merge robô↔pai).
- **Sync de volta (Supabase → robô):** ✅ **feito.** Antes a hidratação só rodava no **boot** — o que o pai editava no site nunca voltava pro cache do robô (ele refazia o onboarding por cima). Agora há 3 caminhos, com **degradação graciosa** (se um falha, o outro cobre): (a) `refrescarUsuario(id)` fire-and-forget no início de cada conversa (`brain.js`), traz a edição do pai pro turno seguinte; (b) `carregarUsuarioFresco(id)` **awaited** — só quando o perfil do cache parece incompleto (perfil novo / sem essenciais), garante que o **1º turno** já use o que o pai configurou, sem refazer onboarding; (c) **Realtime** do Supabase na tabela `criancas` (`iniciarRealtimeUsuarios` no boot) atualiza o cache **na hora** que o pai salva. Além disso, `GET /api/usuarios` chama `refrescarTodosUsuarios()` (puxa a lista fresca) pra um perfil **criado no site** aparecer na interface localhost sem reiniciar. **Regra de merge:** os campos que o pai edita (perfil, prompt, vínculo, `onboarding_completo`) vêm do Supabase; `memorias`/`idiomas_estudando`/`estilo` que o robô aprende são **preservados** (não sobrescritos). ⚠️ O Realtime exige habilitar a tabela `criancas` em *Database → Replication* no painel do Supabase — sem isso, só os caminhos (a)/(b) funcionam (suficientes, só não instantâneos).
- **Ciência do Companion no prompt:** ✅ **feito.** `secaoCompanion()` em `brain/prompt.js`: a Cogni **sabe** o que é o app dos pais (acompanham conversas/tempo/tópicos, criam planos, recebem resumo semanal + dicas, pareiam por código) e responde dúvidas da criança com **honestidade e leveza** (acompanham pra apoiar, não pra vigiar). Só pro estudante.
- **Boot/shutdown:** `server/index.js` (boot vira async com `await inicializar()` antes do `listen`; `flushSync` no shutdown).
- **Flag/config:** `server/config.js` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_HABILITADO`).

---

## 🔍 Auditoria técnica (ago/2026) — o que o site precisa saber

> [!info] Esta seção é **ciência, não tarefa**
> Nenhum dos itens abaixo pede alteração no site. Não há schema novo, endpoint novo, campo novo nem migração. O Companion continua funcionando exatamente como está — isto aqui existe só para o lado do site **saber** o que mudou por baixo. Se algum item parecer uma ação, ela é do lado do **servidor** (o `.env` do Nicolas), nunca do front.

Uma auditoria completa passou pelos três lados do projeto (firmware, servidor, interface). Três pontos tocam o Companion e ficam registrados aqui:

### 1. `TRUST_PROXY` — só importa **se um dia** houver túnel no caminho (hoje não há)

O servidor **deixou de confiar** no cabeçalho `X-Forwarded-For` por padrão. Era uma falha real: com `trust proxy` ligado sem proxy nenhum na frente, qualquer um na rede local podia forjar o próprio IP, furar o rate limit e — pior — passar pelo gate "só localhost" do `GET /api/esp/token`, que entrega o token do WebSocket do robô.

**Situação hoje: nada a fazer.** O site chama `SERVIDOR_URL = "http://127.0.0.1:3000"` (loopback direto, sem proxy no meio), então o padrão desligado já é o correto e o mais seguro.

**Só relevante num cenário futuro:** se um dia o site passar a falar com o servidor através de um túnel (ngrok, Cloudflare Tunnel, nginx), aí o Nicolas define `TRUST_PROXY=1` no `.env` **do servidor** — não há nada a mudar no front. Sem isso, todas as chamadas chegariam com o IP do túnel e dividiriam a mesma cota do rate limit global (120/min). Os endpoints do Companion (`/api/dica`, `/api/resumo-semanal`, `/api/pareamento/*`) já têm limite próprio por criança, então só o global pesaria, e só com muitos acessos simultâneos.

### 2. O Diário passa a receber respostas inteiras

A limpeza de citações do servidor tinha um falso-positivo grave: a regra que apagava rótulos de fonte casava a **palavra** "fonte" e engolia todo o resto da frase. Uma resposta de ciências como *"as **fontes** de energia são o sol e o vento"* era gravada em `conversas.texto_resposta` como **"as "**.

Ou seja: o Diário e o Resumo Semanal vinham lendo respostas mutiladas em qualquer conversa que usasse a palavra "fonte" ou "referência". Corrigido (agora só o rótulo `Fonte:` com dois-pontos é removido). **Nada a fazer no site** — os registros novos já nascem completos; os antigos permanecem como estão no banco.

### 3. Nenhuma migração pendente

O contrato de dados, as tabelas, a RLS e todos os endpoints seguem exatamente como documentados acima. As correções foram internas ao servidor, ao firmware e à interface local.

---

## 📈 Trilha de aprendizado (`criancas.progresso`) — reforma pedagógica de ago/2026

> [!warning] Tem **uma** coluna nova (já criada pelo Nicolas)
> Diferente da auditoria acima, aqui existe schema novo: `criancas.progresso` (jsonb, default `[]`). O site **não quebra** sem fazer nada — mas passa a ter um dado novo e valioso disponível.

O cérebro da Cogni ganhou um *student model*: ela agora registra **o que a criança estudou, no que travou e quando aquilo deve ser revisado**, e usa isso para retomar o assunto dias depois (prática espaçada). Antes, cada conversa recomeçava do zero pedagogicamente.

### O formato

`criancas.progresso` é um array de itens assim:

```json
[
  {
    "conceito": "soma de fracoes",
    "materia": "matematica",
    "status": "travou",
    "acertos": 0,
    "vezes": 2,
    "nivel": 1,
    "visto": "2026-08-10T21:03:00.000Z",
    "proxima": "2026-08-11T21:03:00.000Z"
  }
]
```

| Campo | O que é |
| --- | --- |
| `conceito` | o tema fino (1 a 4 palavras). Vem da IA (igual ao `conversas.topico`) **ou** do ciclo de prática, e aí é o nome da habilidade: `tabuada`, `porcentagem`, `silabas`… |
| `materia` | uma das matérias canônicas, ou `null` |
| `status` | `"travou"` ou `"aprendeu"` — como ela se saiu da última vez |
| `acertos` | acertos seguidos; é o que faz o intervalo de revisão crescer (travar zera) |
| `vezes` | quantas vezes o tema apareceu no total |
| `nivel` | **(novo, ago/2026)** dificuldade calibrada do próximo exercício daquele conceito: `1`, `2` ou `3`. Sobe quando ela acerta de primeira, desce quando trava. Itens antigos não têm o campo — trate ausente como `1` |
| `visto` | quando foi a última vez |
| `proxima` | quando deve voltar. Vencido (`proxima <= agora`) = a Cogni vai puxar o assunto |

Escada de revisão: **travou → 1 dia**; **acertou → 2, 5, 12, 30, 60 dias**. Travar de novo reseta. Máximo de 40 itens por criança (a poda descarta os já dominados mais antigos, nunca os que ela travou).

### Quem alimenta a trilha (ago/2026: agora são duas fontes)

1. **A análise da conversa** (como antes): a IA auxiliar infere `travou`/`aprendeu` do turno e grava o tópico. Palpite bom, mas palpite.
2. **O ciclo de prática** (novo): a Cogni **propõe exercícios** gerados pelo servidor, e a resposta da criança é conferida por **aritmética exata** — não pelo modelo. Quando existe veredito de prática no turno, ele **vence** o palpite da IA (e o da IA não é gravado, pra não contar o mesmo acerto duas vezes).

Isso muda a qualidade do dado que chega ao Companion: parte dos `travou`/`aprendeu` agora vem de **acerto/erro conferido**, não de inferência. Conceitos vindos da prática têm nome de habilidade (`tabuada`, `porcentagem`, `soma de fracoes`, `silabas`, `equacao do primeiro grau`, `teorema de pitagoras`…), então repetem entre crianças e são bons para agrupar.

> Nada disso exige mudança no site: é a mesma coluna, com um campo a mais e dado mais confiável. O bloco do painel (abaixo) continua funcionando exatamente como está.

### Regra de escrita: o site NÃO escreve aqui

Quem alimenta é só o servidor, no pipeline pós-resposta. **O Companion trata `progresso` como read-only.**

> ✅ **Isso já está seguro hoje, sem mudar nada.** O `atualizarCrianca()` em `js/dashboard/supabase-data.js` monta o update a partir de uma **allowlist** (`EDITAVEIS`) e só envia os campos dessa lista. Como `progresso` não está lá, o site nunca sobrescreve a coluna. Se um dia essa allowlist virar um "manda o objeto inteiro", a trilha da criança é apagada a cada edição de perfil — então **não** troque a allowlist por spread do objeto.

### ✅ No Companion: bloco "Trilha de aprendizado" (feito — ago/2026)

O Painel de Aprendizado (`js/dashboard/sections/aprendizado.js`) lê `progresso` e monta duas colunas, logo abaixo dos cards de tempo por matéria:

| Bloco | Regra de seleção | O que a linha mostra |
| --- | --- | --- |
| 🌱 **Praticando agora** | `status: "travou"` **ou** `"aprendeu"` com `acertos < 2` | conceito + selo (*precisa de reforço* / *quase lá*) + matéria · quando foi visto · **quando a Cogni retoma** (de `proxima`) |
| ✅ **Já domina** | `status: "aprendeu"` e `acertos >= 2` | conceito + matéria · nº de acertos seguidos · quando foi visto |

Decisões que valem registro:

- O item com **1 acerto** entra em "Praticando" (como *quase lá*) em vez de ficar de fora das duas listas — assim nenhum tema some da tela sem explicação.
- **`proxima` vencida** vira *"a Cogni retoma na próxima conversa"*; no futuro, *"amanhã"/"em 5 dias"*. É a resposta pra "o que ela vai revisar com ele?" sem precisar de um terceiro bloco.
- Máximo de **5 itens por coluna** (recorte acionável, não histórico), ordenados por urgência (quem precisa de reforço primeiro) e por consolidação (mais acertos primeiro).
- A seção **relê o perfil** (`getCrianca()`) ao abrir, em vez de usar o `ctx.crianca` do boot do painel: a trilha muda a cada conversa do robô. Se essa releitura falhar, o bloco cai no perfil do boot — o resto da tela não quebra.
- Cada item passa por um **saneamento** (o jsonb é livre): conceito vazio, status desconhecido, matéria fora da lista canônica ou data inválida são descartados/normalizados.
- **Opcional, com o campo `nivel` novo:** um item que sobe de nível (1 → 2 → 3) no mesmo conceito é a evidência mais direta de progresso real — a criança está resolvendo exercícios mais duros do mesmo assunto. Daria um selo discreto em "Praticando agora" (algo como *"subiu de nível"*), sem virar nota nem placar. Não é obrigatório: o bloco já funciona sem ler esse campo.

- **Selo "subiu de nível" (feito — ago/2026), lendo o campo `nivel`:** um selo discreto (contorno, sem cor de estado) ao lado do selo de status em "Praticando agora". É a evidência mais direta de progresso real — a criança está resolvendo exercícios mais duros do mesmo assunto, e o nível só sobe quando ela acerta **de primeira, sem pista**. A regra de exibição é mais estreita do que "nível > 1", e de propósito:

| Onde | Aparece? | Por quê |
| --- | --- | --- |
| "Praticando agora", último veredito **bom** (`aprendeu`) e `nivel >= 2` | ✅ sim | todo conceito começa no nível 1, então estar acima disso significa que ela acertou de primeira ali |
| "Praticando agora", em **reforço** (`travou`), mesmo com `nivel >= 2` | ❌ não | `nivel` é um **retrato do presente, não um evento** — não existe "nível anterior" no jsonb — e travar **derruba** o nível. Um item em reforço com nível 2 acabou de CAIR do 3: dizer "subiu de nível" ali descreveria justamente o que deixou de valer |
| "Já domina" | ❌ não | a linha já fala em acertos seguidos; empilhar mais um selo transformaria o card em placar |

  O saneamento cobre o campo: ausente (item anterior à prática), sujo ou fora da faixa vira `1` — o mesmo piso que o servidor aplica. O texto explicativo ("A Cogni já propõe exercícios mais difíceis de X") fica no `title`, como complemento: quem lê só a pílula continua entendendo a linha.

> ⚠️ **Cuidado de tom, e isso importa:** o rótulo `travou` é linguagem interna e **não aparece na tela** — o pai lê "precisa de reforço", "quase lá", "já domina", nunca nota ou ranking. O mesmo cuidado já aplicado no robô, que é proibido de dizer à criança "aquilo que você travou". O bloco ainda vem com uma linha explícita: *"Não é nota: é o que a Cogni guarda pra retomar os assuntos nos próximos dias."*

---

## 🗺️ Mapa de Compreensão da Aula (ago/2026) — a tela nova

> [!important] Tabela nova + 2 endpoints novos — **servidor e tela prontos** (ago/2026)
> O que o site construiu, e as 4 decisões que o backend precisa conhecer, está no fim desta seção ("Como o site construiu").

### Por que esta tela existe (o contexto competitivo)

O concorrente mais forte do TCC é um **CRM para professores**, e a feature mais elogiada é a **chamada automática**. Chamada responde *"quem estava na sala?"* — a métrica mais fácil de coletar e a que menos diz sobre aprendizado. Ela para exatamente onde a educação começa.

O Cogni responde o que acontece **depois** que o aluno já está presente. A frase que resume a tela inteira:

> *"aos 4min12, quando entrou 'frações equivalentes', ela travou por 40s."*

**Um CRM registra o que aconteceu. O Cogni intervém enquanto acontece** — e o mapa é a prova visual disso, porque o mesmo sinal que virou linha no gráfico já tinha mudado a explicação da Cogni naquele segundo.

### O que o servidor já faz (nada disso é do site)

Durante a conversa, o servidor grava marcos numa sessão em RAM (`server/modules/atencao.js`): cada turno com **matéria + tópico**, cada sinal afetivo **forte** lido pela câmera, e cada **veredito de exercício** do ciclo de prática. Ao encerrar (reset, troca de perfil, 15min de silêncio ou shutdown), cruza tudo no eixo do tempo e grava uma linha em `sessoes_atencao`. Custo de API: **zero** — todos esses dados já passavam pelo servidor; a novidade é guardar *quando*.

### O que o site precisa construir

1. **Linha do tempo da sessão** — eixo horizontal = `emMs` (0 até `duracao_ms`), marcadores nos `momentos`. Cor por `sinal`/`resultado`, texto = `rotulo` + `topico`.
2. **Resumo em texto** no topo (`GET /api/mapa-aula/resumo`), que é o que o pai lê primeiro.
3. **Modo ao vivo**: quando `emAndamento: true`, poll a cada ~10s e um selo "acontecendo agora". **É a parte que impressiona** — dá pra abrir o Companion no celular e ver a aula se desenhando.
4. **Histórico**: lista das sessões anteriores (o `historico[]` já vem no mesmo GET).

### Regras de produto (inegociáveis)

- **Nunca** mostrar `sinal` cru (`travada`/`confusa`). Use o `rotulo`, que já vem pronto.
- **Não é placar.** Nada de "% de acerto", nota, ranking ou comparação com outras crianças.
- Sessão sem nenhum momento = **"correu tranquila"**, não uma tela vazia com cara de erro.
- A tela é de **apoio**, não de vigilância: o texto sempre sugere o que fazer junto, nunca aponta defeito.

### ✅ Como o site construiu (ago/2026 — feito)

Seção **"Mapa da aula"** (`#/mapa`, 7º item da sidebar e da tab bar), em `js/dashboard/sections/mapa.js` + `mapa-api.js` (dados) + `mapa-timeline.js` (o desenho) + `css/dashboard-mapa.css`. Quatro decisões que o backend precisa conhecer:

1. **Duas fontes, como no Resumo Semanal e na Dica.** O endpoint é a única fonte da sessão ao vivo, mas quando ela existe o `historico[]` volta **vazio** (a rota prioriza a sessão em RAM). Então o site lê o histórico **direto de `sessoes_atencao`** (RLS, `getSessoesAtencao()`), e as aulas anteriores continuam na tela durante o ao vivo — e com o robô desligado. Endpoint = fresco; tabela = estável.
2. **`pontoDeAtrito` é recalculado no front quando não vem.** Ele só viaja na sessão **ao vivo**: o `historico[]` da rota (e a tabela) trazem os `momentos` sem esse campo derivado. O site aplica exatamente a mesma regra do servidor (primeiro `sinal: 'travada'`, senão o primeiro `resultado: 'travou'`) — nenhuma correlação nova, só o mesmo critério sobre os momentos já cruzados. **Se um dia o campo passar a ser persistido, o site usa o do servidor** (ele tem prioridade).
3. **Os `rotulo` chegam sem acento** (o repo do robô é escrito sem acentuação): `ficou em duvida`, `tropecou no exercicio`. O site tem uma tabela que restaura os diacríticos da **mesma frase**, palavra por palavra (não traduz, não inventa rótulo) — o pai não pode ler "duvida" no painel. Se o servidor passar a mandar acentuado, nada quebra. **Rótulo desconhecido passa como veio**; rótulo igual ao `sinal`/`resultado` do próprio momento vira um neutro ("um momento da aula"), porque `ROTULO_SINAL[sinal] || sinal` faria um sinal novo (um `dispersa` de amanhã) vazar cru pra tela.
4. **Os `contadores` não viram números na tela.** Ficam disponíveis no payload, mas exibir "2 acertos × 1 tropeço" é boletim com outro nome — e o que o pai precisa (onde ajudar) a linha do tempo já diz. O cabeçalho da aula mostra só duração e trocas de conversa.

Acessibilidade: cada marcador é um `<button>` com o momento inteiro no `aria-label`; o tipo do momento vira **forma** (círculo = câmera, losango = exercício) além da cor; e a linha do tempo tem sempre a lista **"Momento a momento"** em texto embaixo. No modo ao vivo, um `aria-live` discreto anuncia só o momento novo, e o poll pausa com a aba em segundo plano e morre quando o pai troca de seção.

---

## 📝 Correção Visual do Caderno (ago/2026) — **não é tarefa pro site**

> [!note] Registrado aqui só pra ninguém construir por engano
> A criança mostra a lição pra câmera e a Cogni devolve o veredito **por questão**, com a caixa daquela questão desenhada em cima do frame congelado. Feature **100% do robô + painel local**: não tem tabela nova, não tem endpoint pro Companion, não tem tela pra fazer. **Nenhuma ação do lado do site.**

O que muda de observável pro Companion — e é só isto:

- O turno de correção entra no **Diário** (`conversas`) e no **Mapa da Aula** como qualquer outro turno, porque corrigir lição *é* estudar. A matéria/tópico saem da mesma classificação por IA de sempre.
- Quando a correção é pedida pelo **botão** do painel (e não por voz), o `texto_usuario` gravado é a frase sintética **"Corrige minha lição, por favor."** (acentuada — é balão que o pai lê no Diário; ver a dívida nº 1 abaixo, que é o mesmo princípio). É o preço de fazer os dois gatilhos passarem pelo mesmo `conversar()` — o que garante que a correção entre no histórico e no Diário. Se um dia isso incomodar na timeline do pai, a solução é do **robô** (marcar a origem), não do site.
- A rota `POST /api/caderno/corrigir` tem **rate limit próprio** (6/min **por criança**), e não o `limiteResumo`. Dois motivos: o `keyGenerator` do `limiteResumo` lê `req.query.criancaId`, que não existe num POST com o id no *body* — toda correção cairia no balde do **IP**, misturando as crianças; e é a rota mais cara do projeto (visão com `detail: 'high'`), a única disparável em rajada por clique. **Ela não divide cota com o Resumo Semanal nem com a Dica.**

Se um dia virar tela no Companion (**não está planejado**), o que faria sentido é o pai ver *"a lição de terça: 3 de 5 questões conferidas"*. Exigiria tabela nova + persistência — nada disso existe hoje.

---

## 🧾 Dívidas do BACKEND reveladas pela tela do Mapa (ago/2026)

> Três coisas que o site contornou **corretamente** do lado dele, mas cuja origem é do robô. Estão listadas aqui pra não virarem workaround permanente. **O site não precisa fazer nada** — quando o backend resolver, os contornos podem sair (e nenhum deles quebra se sair).

| # | Dívida | Onde nasce | O que o site fez | Status |
| --- | --- | --- | --- | --- |
| 1 | **Rótulos vão sem acento** (`ficou em duvida`, `tropecou no exercicio`) | `ROTULO_SINAL` em `server/modules/atencao.js` — a convenção de escrever o repo sem acentuação vazou de comentário pra **string de UI** | Tabela que restaura os diacríticos da mesma frase, palavra por palavra | ✅ **CORRIGIDO no robô** (ago/2026) |
| 2 | **`pontoDeAtrito` não vinha no histórico** — só viajava na sessão ao vivo | `registrarSessaoAtencao` não grava o campo derivado, e o endpoint não o recalculava ao ler o histórico | Recalcula no front com a mesma regra; usa a do servidor se ela passar a vir | ✅ **RESOLVIDO no robô** (ago/2026) |
| 3 | **`historico[]` volta vazio durante o ao vivo** | `GET /api/mapa-aula` prioriza a sessão em RAM e devolve `historico: []` | Lê o histórico direto de `sessoes_atencao` via RLS | ⏳ aberta |

### ✅ Dívida nº 1 resolvida — o que muda pro site

O servidor agora manda os rótulos **acentuados**: `ficou em dúvida` e `tropeçou no exercício` (os outros três — `precisou de mais ajuda`, `estava embalada`, `resolveu sozinha` — nunca tiveram acento pra restaurar). Há um teste no robô que falha se um rótulo voltar a sair sem acento, então **isto não regride em silêncio**.

> [!note] O contorno do site pode sair — mas não precisa ter pressa
> A tabela de restauração de diacríticos **continua funcionando como está**: rótulo já acentuado não casa com as entradas dela e passa como veio. Removê-la é limpeza, não urgência. Se removerem, vale manter a regra de que **rótulo desconhecido passa como veio** — essa parte protege contra um `sinal` novo vazar cru pra tela e não tem nada a ver com acento.
>
> ⚠️ **Sessões antigas gravadas em `sessoes_atencao` antes desta correção ainda têm os `momentos` com o rótulo sem acento no jsonb** — o campo é histórico, não é recalculado na leitura. Enquanto houver aulas velhas no histórico do pai, a tabela de restauração ainda tem o que fazer.

### ✅ Dívida nº 2 resolvida — `pontoDeAtrito` agora vem no histórico

`GET /api/mapa-aula` passou a **recalcular** o campo ao servir cada linha do histórico (e o `/mapa-aula/resumo` faz o mesmo com a última sessão). Continua **derivado, não persistido** — a coluna guarda os `momentos`, e o ponto de atrito sai deles na leitura. Para o site, o efeito prático é que **`historico[i].pontoDeAtrito` agora existe**, com exatamente o mesmo formato do que já vinha na sessão ao vivo.

O critério virou a função `acharPontoDeAtrito` (`server/modules/atencao.js`), usada tanto pelo `montarMapa` quanto pelo endpoint — regra única, um lugar só. Há teste que reprova se as duas divergirem.

> [!tip] O recálculo do front pode sair — e agora sem o risco que você apontou
> Era essa a preocupação certa: o contorno não ia quebrar, ia **divergir calado**. Agora não há segunda cópia da regra pra divergir. Se preferirem manter o recálculo como fallback, mantenham a prioridade que vocês já documentaram (**o campo do servidor ganha**) — aí o dia em que o critério mudar aqui, a tela acompanha sozinha.

### 🤝 Acordos entre as duas pontas (contrato que não está em código)

Coisas que **um lado assume** sobre o outro e que não dá pra descobrir lendo o payload. Mudou aqui, avisa lá — nesta lista, o silêncio é que quebra.

| O que é assumido | Quem depende | Regra |
| --- | --- | --- |
| ~~**O critério do `pontoDeAtrito`**~~ | ~~O site, que replica a regra no front~~ | ✅ **Resolvido na origem** — o servidor agora manda o campo no histórico, então não há segunda cópia da regra pra divergir. Continua valendo o aviso se o critério mudar, mas agora o silêncio não custa nada: a tela acompanha sozinha |
| **O piso da sessão**: menos de **60s** (`MINIMO_PARA_GRAVAR_MS`) **ou** zero turnos não vira linha em `sessoes_atencao` | O **site**, que escreve o estado vazio como *"quando ela conversar alguns minutinhos com a Cogni, o mapa aparece aqui"* | Confirmado ✅. Se o piso mudar, o robô avisa — o texto do estado vazio muda junto, senão o site promete ao pai algo que não acontece |
| **`RATE_LIMIT_WINDOW_MS` = 10s** com limite 10 no `limiteResumo`, compartilhado por 5 rotas | O **site**, onde um 429 é silencioso (o card do resumo some de cena) | Se a janela crescer (10 min, p.ex.), Mapa e Resumo Semanal passam a brigar pela mesma cota. O robô avisa antes de mexer na janela; a rota do caderno já saiu desse balde |

---

## ⚡ Planos em tempo real + a Cogni puxando o gancho (ago/2026)

> [!important] Esta seção **tem uma tarefa pro site** — uma só, e pequena (ver "O que o site precisa fazer"). O resto é backend, já feito.

### O problema (relato do Nicolas, e ele estava certo)

> *"Quando a gente cria um plano de estudo no site, às vezes eu tenho que esperar um tempo pra ele reconhecer, ou sair do perfil e entrar de novo, ou reiniciar a conversa. E às vezes eu tinha que perguntar 'tem algum plano pra gente?' — eu quero que ele puxe o gancho."*

Eram **dois** problemas somados, e a auditoria achou **três** causas:

| # | Causa | Por que doía |
| --- | --- | --- |
| 1 | O turno lia o cache **antes** de mandar atualizá-lo, e o refresh era fire-and-forget | Piso garantido de **1 turno de atraso**, sempre. E se o cache nunca tinha sido populado pra aquela criança (perfil que entrou depois do boot), o 1º turno vinha vazio — daí a impressão de que era preciso "reiniciar a conversa" |
| 2 | **Não havia Realtime em `planos_estudo`** (só em `criancas`) | Nada empurrava a mudança do site pro robô. Sair do perfil e voltar "funcionava" por acidente de tempo: dava tempo do refresh anterior aterrissar |
| 3 | A proatividade era **só texto** no system prompt ("seja proativa") | Sem estado nenhum, o modelo não sabia se já tinha puxado, se era hora, nem se o plano era novo. Instrução genérica no meio de um prompt grande se dilui — na prática ela só falava do plano quando perguntavam |

### O que mudou no backend

**Propagação — agora são quatro caminhos, em degradação graciosa** (se um falha, o de baixo cobre):

1. **Realtime do Supabase** em `planos_estudo` (`iniciarRealtimePlanos()` em `planos.js`, espelhando o de `criancas`). O pai salva no site → o cache do robô muda **na hora**. Escuta `*` (INSERT/UPDATE/DELETE). ✅ **Já verificado no ar** — o canal sobe `SUBSCRIBED`, então a tabela já está habilitada em *Database → Replication*.
2. **`garantirPlanoFresco(id)`** — awaited **com teto de 900ms** no **1º turno** de cada conversa. É o que faz um plano criado agora valer *nesta* conversa, e não na próxima. Estourou o tempo, segue com o cache (o princípio "o robô nunca fica refém da nuvem" continua valendo).
3. **`refrescarPlanoAtivo(id)`** fire-and-forget nos demais turnos, e também na **troca de perfil** (`definirUsuarioAtivo`) e no **reset** (`limparConversa`).
4. **`hidratarPlanos()`** no boot, como antes.

> Em vez de aplicar a linha que chega pelo Realtime, o servidor **reconsulta** o plano vigente daquela criança. É o único jeito de respeitar a regra inteira: pausar o plano vigente tem que fazer o cache cair pro próximo vigente (ou pra `null`), e a linha do evento sozinha não sabe disso.

**Proatividade — o "gancho" (`server/modules/brain/plano-gancho.js`, novo):** um motor puro que decide, **a cada turno**, uma de três ações:

| Ação | Quando | O que o prompt manda |
| --- | --- | --- |
| `nenhum` | 1º turno da conversa; ou o assunto do plano já está rolando; ou acabou de puxar; ou já insistiu 3× | Não force nada, siga a conversa |
| `puxar` | A partir do 2º turno, se ninguém tocou no tema | *"Depois de responder o que ela disse, VOCÊ entra no tema — sem perguntar 'quer estudar?' — e devolve a bola com uma pergunta sobre ele"* |
| `retomar` | Já estiveram no assunto e a conversa se afastou por **6 turnos** | *"Traga de volta retomando de onde pararam, nunca do zero e nunca cobrando"* |

Três detalhes que fazem a diferença:
- A ordem é **repetida no recap final** do prompt (onde o modelo mais obedece), igual já se faz com segurança e afeto.
- O servidor **confere a resposta**: se o modelo ignorou o pedido, o gancho **continua armado** pro próximo turno em vez de dar por feito.
- **Plano novo ou editado no assunto rearma tudo** (título/foco/conteúdo). Mexer só em prazo/status **não** rearma — é a mesma aula.

Cobertura: `npm run teste:plano` (17 casos, `node:test`, sem rede).

### O que o site precisa fazer (a única tarefa)

**Chamar um endpoint depois de salvar um plano.** É o **plano B** do Realtime: se um dia a replicação for desabilitada no painel, ou o canal cair, este ping mantém tudo instantâneo. Custa uma linha e é idempotente.

```
POST {SERVIDOR}/api/planos/refrescar
  body: { criancaId: "<id da criança>" }
  → 200 { ok: true, temPlanoAtivo: true|false, titulo: "..." | null }
  → 400 { erro: "criancaId obrigatorio" }
  → 503 { ok: false, erro: "Supabase desligado no servidor." }
```

- Chamar **depois** de `criarPlano`, `atualizarPlano` **e** `removerPlano` (os três mexem no que a Cogni segue).
- É **awaited de propósito** no servidor: o `200` significa *"já está valendo"*, não *"vai valer"*. Dá pra mostrar a confirmação com segurança.
- **Best-effort no front:** se o servidor local estiver desligado (o robô nem sempre está ligado quando o pai edita), o `fetch` falha — **engula o erro e siga**. O plano já está salvo no Supabase e o robô o pega no boot/Realtime. Não mostre erro pro pai por causa disso.
- `{SERVIDOR}` = o mesmo `SERVIDOR_URL` que as telas de Rosto e Pareamento já usam.

**Recomendado (não obrigatório):** mandar `atualizado_em: new Date().toISOString()` no `atualizarPlano`. O servidor desempata planos vigentes por `atualizado_em`, e hoje o site não escreve essa coluna — se não houver trigger `moddatetime` no banco, ela fica parada e o desempate cai nos critérios de reserva (`criado_em`, depois `id`). Com o vínculo 1:1 e um plano ativo por criança isso quase nunca aparece, mas é barato de acertar.

---

## ✅ Como testar (ponta a ponta)

- **Servidor sem credenciais** → robô/voz idênticos a hoje (fallback JSON).
- **Servidor com credenciais** → perfis hidratam do Supabase; conversas aparecem na tabela.
- **Plano em tempo real** → com o robô conversando, criar/editar um plano no site → o log do servidor mostra `Realtime de planos ativo` no boot, e a Cogni já usa o plano **no turno seguinte**, sem trocar de perfil nem reiniciar a conversa. Sem esperar o Realtime: `curl -X POST http://127.0.0.1:3000/api/planos/refrescar -H "Content-Type: application/json" -d '{"criancaId":"<id>"}'` → `{ ok: true, temPlanoAtivo: true }`.
- **O gancho** → com plano ativo, dizer "oi" e depois algo neutro ("nada demais") → no 2º ou 3º turno **ela mesma** puxa o assunto do plano, sem que ninguém pergunte.
- **Internet cai com servidor no ar** → robô continua conversando (cache RAM).
- **Site** → logar → badge → Dashboard → dados da criança vinculada aparecem; criança de outra família **não** aparece (RLS).
- **Mapa de Compreensão** → conversar com o robô por >1min tocando 2 assuntos, com a câmera ligada → `GET /api/mapa-aula` retorna `emAndamento: true` com os momentos; após reset (ou 15min parado) a linha aparece em `sessoes_atencao`.
- **Pareamento** → código no robô → digita no site → criança vincula.
- Ferramentas: Playwright (já em uso no site) pras telas; scripts pra checar persistência.

---

## 🔑 O que o Nicolas fornece (manual)

1. **Conta Supabase + credenciais** (URL, anon key, service_role key) — passo a passo no chat na Fase 0.
2. Decisões de produto pontuais que surgirem.

(O Claude gerencia os `.env`. Credenciais rotacionadas depois pelo Nicolas.)

---

*Documento vivo — atualizar aqui antes de mudar qualquer ponta. Feito pro TCC do Nicolas · UNASP · 2026.*
