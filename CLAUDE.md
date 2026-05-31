# CLAUDE.md

Este arquivo orienta o Claude Code (claude.ai/code) ao trabalhar neste repositório.

## Visão geral do projeto

TestBank é um banco de questões interativo para estudo pessoal de concursos públicos, multi-matéria. Conteúdo extraído de PDFs pelo Claude, armazenado como JSON estático. Firebase para autenticação, hospedagem e banco de dados do usuário.

## Usuários-alvo

Fase atual: uso pessoal por Natan — validação e aperfeiçoamento do produto.
Fase futura: SaaS com acesso compartilhado/pago para outros estudantes.

## Objetivos do produto

Facilitar o estudo a partir de PDFs nem sempre bem organizados. O usuário entrega um PDF e o TestBank transforma o conteúdo em questões estruturadas, comentadas e navegáveis — com histórico de desempenho (acertos, erros, progresso) e, futuramente, elementos de gamificação para engajamento.

Não é restrito a concursos públicos — qualquer material de estudo em PDF é válido.

## Fora do escopo (por ora)

- Editor de questões pelo usuário final
- Modo colaborativo ou contribuição de conteúdo por terceiros
- O conteúdo é curado e inserido centralmente por Natan — revisado antes de publicar

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Interface | HTML + CSS + JavaScript vanilla (sem framework) |
| Hospedagem | Firebase Hosting |
| Autenticação | Firebase Authentication (Google) |
| Banco de dados | Firebase Firestore |
| Conteúdo | JSON estático em `data/` (versionado no GitHub) |
| Repositório | GitHub (controle de versão apenas) |

Sem build, sem bundler, sem transpilação. Firebase SDK via CDN.

## Arquitetura de navegação

```
  Início   Fixadas   Simulado   Histórico       ← topbar (abas globais) — sticky
──────────────────────────────────────────────
  ContG   ContC   ContT   ...                   ← barra de matérias (nível 1) — sticky
──────────────────────────────────────────────
  Aula 00   Aula 01A   Aula 01B   Aula 02  ...  ← barra de aulas (nível 2) — sticky
──────────────────────────────────────────────
  Banca ▾   Órgão ▾   Cargo ▾   Ano ▾   Tipo ▾   Dificuldade ▾   ← filtros — sticky
──────────────────────────────────────────────
  [placar] [000] [000] [000]   Expandir tudo    ← barra de placar — sticky
```

- **Início:** aba padrão — ao clicar, sempre reseta para primeira matéria + primeira aula
- **Barra de matérias:** font-weight 700; underline no ativo (sem preenchimento preto)
- **Barra de aulas:** font-weight 600; underline no ativo; visível em Início e Fixadas
- **Fixadas / Simulado / Histórico:** abas globais — ao entrar em Fixadas, reseta para a primeira matéria e pré-seleciona sua primeira aula como filtro
- Todas as barras são `position: sticky` em cascata (topbar → matérias → aulas → placar)

Não há sub-abas de Questões/Teoria — a aula abre direto nas questões. Não há modo Foco nas aulas (removido — usar Simulado).

## Modo de questões (lista)

**Barra de placar sticky** acima das questões (cola ao rolar):
- Placar à esq. — chips coloridos com fonte mono, 3 dígitos zero-padded
  - Chip azul `#dbeafe / #1d4ed8` — total de questões
  - Chip verde `#dcfce7 / #15803d` — acertos
  - Chip vermelho `#fee2e2 / #b91c1c` — erros
  - Chip âmbar `#fef3c7 / #b45309` — fixadas (questões marcadas da sessão)
- `Expandir tudo` à dir.

Progresso é session-only — nunca gravado. Exibe `Q1`, `Q2`... no cabeçalho da questão. Na aba Fixadas, o número original da aula-fonte é preservado via `_qNum`.

## Botão Fixar/Fixada

Cada questão tem um botão de marcação no cabeçalho (mesmo padrão visual do "Ver gabarito"):
- **Fixar** — borda amarela `#f59e0b` + texto amarelo; hover fundo amarelo claro
- **Fixada** — fundo amarelo sólido `#f59e0b` + texto branco; hover amarelo escuro `#d97706`

Ao clicar em Fixar, a questão entra em `revisaoQuestoes[]` (cache em memória) e no Firestore. Ao clicar em Fixada, é removida de ambos. A atualização do Firestore é fire-and-forget (`.catch()`) — a UI sempre responde imediatamente.

## Aba Fixadas

Exibe as questões fixadas usando o cache local `revisaoQuestoes[]` — sem fetch do Firestore, resposta imediata. Ao desmarcar uma questão dentro da aba, o card é removido do DOM na hora. Mostra `_materia` e `_aula` de origem no cabeçalho de cada questão.

## Autenticação

- Usuário não autenticado vê tela de boas-vindas com botão "Entrar com Google"
- Após login, redirecionado para o app; `carregarRevisao()` popula `revisaoIds` e `revisaoQuestoes` do Firestore
- Todo acesso ao Firestore exige autenticação

## Fluxo do Simulado

1. Usuário configura fonte (matéria ou aula) e quantidade (10 / 20 / 30)
2. Questões sorteadas aleatoriamente
3. Uma por vez: responde → gabarito imediato (acerto/erro + comentário) → próxima
4. **Barra sticky** no topo: placar (azul/verde/vermelho/âmbar) à esq. + cronômetro crescente à dir.
5. Cabeçalho da questão não exibe matéria/aula (removido no simulado)
6. Ao finalizar: placar + gabarito completo + salvo no Firestore (`usuarios/{userId}/historico`)
7. No Histórico, clicar num simulado exibe o gabarito completo daquele simulado

## Estrutura do Firestore

```
usuarios/
  {userId}/
    perfil/              → nome, email, fotoUrl, criadoEm
    historico/
      {simuladoId}/      → data, fonte, placar, total, tempoSegundos, questoes[]
    revisao/
      {questaoId}/       → todos os campos da questão + _materia, _materiaId, _aula, _slug, _qNum, marcadoEm
```

Regras em `firestore.rules` — permite leitura/escrita em todas as subcoleções do próprio usuário. Deploy: `firebase deploy --only firestore:rules`.

## Arquivos de conteúdo

Organizados por matéria em `data/{materia}/aula-XX.json` — slug da matéria em minúsculas sem acentos (ex: `data/contabilidade/`).

- `slug` — identificador do arquivo (ex: `aula-01a`)
- `titulo` — nome na aba (ex: `"Aula 01A"`)
- `materia` — nome da matéria (ex: `"ContG"`)
- `questoes[]` — cada item tem: `id`, `banca`, `orgao`, `cargo`, `ano`, `tipo`, `enunciado`, `resposta`, `comentario`, `dificuldade`
  - `banca`: string — nome da banca examinadora (ex: `"CEBRASPE"`, `"FCC"`, `"VUNESP"`)
  - `orgao`: string opcional — órgão/instituição do concurso (ex: `"BACEN"`, `"Pref. Campinas"`)
  - `cargo`: string opcional — cargo disputado (ex: `"Contador"`, `"Auditor Fiscal"`)
  - `ano`: inteiro opcional — ano do concurso (ex: `2024`)
  - `adaptada`: booleano opcional (`true`) — presente apenas quando a questão foi adaptada do original
  - `opcoes`: presente **somente** em `multipla_escolha` (array de strings: `["A) ...", "B) ...", ...]`)
  - `tipo`: `"multipla_escolha"` ou `"certo_errado"`
  - `resposta` em `multipla_escolha`: letra maiúscula — `"A"`, `"B"`, `"C"`, `"D"` ou `"E"`
  - `resposta` em `certo_errado`: `"certo"` ou `"errado"` (string minúscula)
  - `dificuldade`: inteiro de 1 (muito fácil) a 5 (muito difícil) — exibido como estrelas (★★☆☆☆)

Diagramas no enunciado usam caracteres box-drawing Unicode (`┌┐└┘│─┬┴┼├┤`) — detectados por `DIAGRAMA_RE` e inseridos como `<pre class="diagrama">`, que são então convertidos para `<canvas>` pela função `diagramasParaCanvas()` usando Canvas API (suporta `devicePixelRatio` alto).

Campo `comentario`: texto puro, sem markdown — nenhum `**negrito**`, `_itálico_` ou lista com `-`. Prosa direta e didática.

### Ordenação das questões

As questões em cada arquivo JSON devem estar ordenadas pelos critérios abaixo, nessa prioridade:

1. `banca` — A → Z
2. `orgao` — A → Z (ausente/undefined vai ao final)
3. `cargo` — A → Z (ausente/undefined vai ao final)
4. `ano` — decrescente (mais recente primeiro; ausente vai ao final)
5. `tipo` — `multipla_escolha` antes de `certo_errado`
6. `dificuldade` — crescente (1 → 5)

Ao adicionar questões novas, re-ordenar o arquivo inteiro com `node scripts/sort_questoes.js` antes de salvar.

## Adicionando novo conteúdo (fluxo padrão)

PDFs dos cursos ficam em `PDFs/{materia}/` (ex: `PDFs/ContG/`). Scripts de apoio em `scripts/`.

Quando o usuário indicar qual aula processar:
1. Extrair texto com `pdftotext -enc UTF-8 PDFs/ContG/ContG_XXXX.pdf PDFs/ContG/aula-XX-raw.txt`
2. Questões: extrair da seção "Lista de Questões" do PDF; comentários da seção "Questões Comentadas"
3. Usar `scripts/normalizar_campos.js` para limpar bancas, órgãos e cargos
4. Atribuir `dificuldade` (1–5) a cada questão com base no conteúdo real — nunca atribuir o mesmo valor para todas
5. Campo `banca` separado do `enunciado` — nunca embutir a banca dentro do texto da questão
6. IDs no formato `{mat}-XX-NNN` (abreviação + número da aula com zero-padding + sequencial 3 dígitos)
7. Salvar em `data/{materia}/aula-XX.json`
8. Ordenar com `node scripts/sort_questoes.js` (re-ordena todos os arquivos em `data/`)
9. Registrar a aula na lista `MATERIAS` em `app.js` (slug + titulo)
10. Cada arquivo deve ter no mínimo 30 questões
11. **Validar** com `node scripts/validar_aula.js data/{materia}/aula-XX.json` — corrigir todos os erros antes de prosseguir
12. **Validar online** (opcional) com `node scripts/validar_web.js data/{materia}/aula-XX.json` — cruza com TEC Concursos para detectar erros de metadados

### validar_web.js — validação online

Cruza as questões do JSON com a API pública do TEC Concursos para detectar erros de metadados (banca, ano, órgão) e divergências de texto.

**Fonte de dados:** `GET https://www.tecconcursos.com.br/api/questoes/busca?busca={query}&limit=15`
- Parâmetro correto é `busca` (não `texto`)
- Retorna `enunciado` completo + metadados, sem autenticação
- Não retorna alternativas nem gabarito (exige login)
- QConcursos e Gran Cursos bloqueiam scraping; apenas TEC funciona

**Classificação:** Jaccard de palavras (enunciado + opções) + match de banca/ano → ✅ match (≥0.75) / ⚠️ diff (≥0.50) / 🔍 não encontrada
**Relatório:** `scripts/validacao/{slug}-resultado.json` (pasta no `.gitignore`, não versionada)
**Não encontradas:** questões de bancas regionais/antigas (CETAP, CEPERJ, EEAR etc.) normalmente ausentes no TEC — não indica erro.

**Campo `validado` no JSON:** o script grava automaticamente no JSON fonte ao final de cada execução:
- `"validado": true` — questão com status MATCH (confirmada automaticamente)
- `"validado": false` — questão com status DIFF ou NAO_ENCONTRADA (pendente de revisão manual)
- campo ausente — questão ainda não passou pelo `validar_web.js`

Após revisão manual de um lote de pendentes (`false`), marcar as confirmadas com `true` diretamente no JSON. As questões pendentes típicas são de bancas/concursos não indexados no TEC (CEPERJ, CETAP, EEAR, IDECAN, concursos antigos FCC/VUNESP/IBFC) — verificar o conteúdo da questão e marcar como `true` se correto.

**Padrão "⚠️ sem diffs de metadados":** quando o status é DIFF mas `diferencas: []`, significa que banca/ano/órgão foram confirmados pelo TEC — apenas o texto difere levemente (formatação, versão ligeiramente diferente). Marcar como `true`.

**Padrão "questão vinculada":** enunciados com "Considerando os mesmos elementos da questão anterior" não são encontrados pelo TEC (a busca por texto falha). Verificar o conteúdo diretamente — se correto, marcar como `true`.

**Divergência de ano (edital vs aplicação):** CEBRASPE frequentemente publica edital em um ano e aplica no seguinte. Exemplo: edital 2024, prova 2025. TEC pode usar o ano de aplicação enquanto nosso JSON usa o edital. Não é erro — marcar como `true`.

Não modificar arquivos JSON existentes, salvo para corrigir erros reportados pelo usuário.

Antes de salvar o JSON, validar com `scripts/validar_aula.js` (automatiza as checagens abaixo):
- Total de questões no PDF bate com o total no JSON
- Nenhum `comentario` contém `**` ou `_`
- Questões `multipla_escolha` têm campo `opcoes`; `certo_errado` não têm
- IDs sequenciais sem lacunas
- Arquivo ordenado conforme critério padrão

Se o `pdftotext` truncar um enunciado (termina abruptamente, banca ausente, opções sem enunciado): pedir screenshot da página ao usuário e usar `Read` na imagem para recuperar o conteúdo.

### Armadilhas conhecidas no parser ContG

- **Step 1a removido:** `\n([A-E])(?=[a-z])` é muito agressivo — converte "Assinale", "Capital Social" etc. como opções falsas.
- **Notação D=/C=:** ao detectar opções, checar se após a letra vem `=` ou `-` — é notação contábil, não opção.
- **"A empresa" no enunciado:** linha começando com "A " pode ser capturada como opção A — corrigir manualmente no raw JSON.
- **Ruído de página:** remover "Luciano Rosa, Júlio Cardozo Aula XX", CPF do aluno, numeração de página.
- Usar `PDFs/ContG/parse_0300.js` como template para novos parsers.

## Autonomia nas ações

Executar ações locais diretamente, sem pedir confirmação ao usuário:
- Criar, editar ou deletar arquivos
- Commits, staging, rodar scripts
- Deploy no Firebase Hosting

Confirmar antes apenas para ações destrutivas e irreversíveis de alto impacto (ex: force push, deletar branch remota).

## Fluxo de publicação

Ao finalizar qualquer tarefa que altere arquivos do projeto:

1. **Commit + push** — commitar as alterações com mensagem descritiva e fazer push para o GitHub (`git push`)
2. **Deploy Hosting** — publicar o site com `firebase deploy --only hosting`
3. **Deploy Firestore rules** — se `firestore.rules` foi alterado, rodar também `firebase deploy --only firestore:rules`

Esses dois passos são obrigatórios e automáticos — executar sem pedir confirmação ao usuário.

## Convenções de código

- ES6+ puro em `js/app.js` — sem frameworks ou npm
- CSS em `css/style.css` — design minimalista, fundo branco
- Paleta funcional: verde `#15803d` / vermelho `#b91c1c` (chips do placar), azul `#1d4ed8` (chip total), amarelo `#f59e0b` (Fixar/Fixada), laranja `#ea580c` (Ver gabarito/Ocultar), preto `#1a1a1a` (UI geral)
- Botões de ação (Fixar, Ver gabarito): contorno colorido → preenchimento sólido ao ativar; mesmo padrão visual
- Todo texto da interface em português (pt-BR)
- Layout responsivo — desktop e celular
