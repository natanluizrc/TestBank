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
- `questoes[]` — cada item tem: `id`, `banca`, `tipo`, `enunciado`, `resposta`, `comentario`, `dificuldade`
  - `banca`: string com identificação da banca/concurso — exibida acima do enunciado em cinza
  - `opcoes`: presente **somente** em `multipla_escolha` (array de strings: `["A) ...", "B) ...", ...]`)
  - `tipo`: `"multipla_escolha"` ou `"certo_errado"`
  - `resposta` em `multipla_escolha`: letra maiúscula — `"A"`, `"B"`, `"C"`, `"D"` ou `"E"`
  - `resposta` em `certo_errado`: `"certo"` ou `"errado"` (string minúscula)
  - `dificuldade`: inteiro de 1 (muito fácil) a 5 (muito difícil) — exibido como estrelas (★★☆☆☆)

Diagramas no enunciado usam caracteres box-drawing Unicode (`┌┐└┘│─┬┴┼├┤`) — detectados por `DIAGRAMA_RE` e inseridos como `<pre class="diagrama">`, que são então convertidos para `<canvas>` pela função `diagramasParaCanvas()` usando Canvas API (suporta `devicePixelRatio` alto).

Campo `comentario`: texto puro, sem markdown — nenhum `**negrito**`, `_itálico_` ou lista com `-`. Prosa direta e didática.

## Adicionando novo conteúdo (fluxo padrão)

Quando o usuário enviar um PDF:
1. Extrair texto com `pdftotext -enc UTF-8` via Bash
2. Questões: extrair da seção "Lista de Questões" do PDF; comentários da seção "Questões Comentadas"
3. Atribuir `dificuldade` (1–5) a cada questão
4. Campo `banca` separado do `enunciado` — nunca embutir a banca dentro do texto da questão
5. IDs no formato `{mat}-XX-NN` (abreviação da matéria + número da aula + número da questão)
6. Salvar em `data/{materia}/aula-XX.json`
7. Registrar o material na lista `MATERIAS` em `app.js`
8. Cada material deve ter no mínimo 30 questões

Não modificar arquivos JSON existentes, salvo para corrigir erros reportados pelo usuário.

Antes de salvar o JSON, validar:
- Total de questões no PDF bate com o total no JSON
- Nenhum `comentario` contém `**` ou `_`
- Questões `multipla_escolha` têm campo `opcoes`; `certo_errado` não têm
- IDs sequenciais sem lacunas

Se o `pdftotext` truncar um enunciado (termina abruptamente, banca ausente, opções sem enunciado): pedir screenshot da página ao usuário e usar `Read` na imagem para recuperar o conteúdo.

## Autonomia nas ações

Executar ações locais diretamente, sem pedir confirmação ao usuário:
- Criar, editar ou deletar arquivos
- Commits, staging, rodar scripts
- Deploy no Firebase Hosting

Confirmar antes apenas para ações destrutivas e irreversíveis de alto impacto (ex: force push, deletar branch remota).

## Fluxo de publicação

Ao finalizar qualquer tarefa que altere arquivos do projeto:

1. **Commit + push** — commitar as alterações com mensagem descritiva e fazer push para o GitHub (`git push`)
2. **Deploy** — publicar o site com `firebase deploy --only hosting`

Esses dois passos são obrigatórios e automáticos — executar sem pedir confirmação ao usuário.

## Convenções de código

- ES6+ puro em `js/app.js` — sem frameworks ou npm
- CSS em `css/style.css` — design minimalista, fundo branco
- Paleta funcional: verde `#15803d` / vermelho `#b91c1c` (chips do placar), azul `#1d4ed8` (chip total), amarelo `#f59e0b` (Fixar/Fixada), laranja `#ea580c` (Ver gabarito/Ocultar), preto `#1a1a1a` (UI geral)
- Botões de ação (Fixar, Ver gabarito): contorno colorido → preenchimento sólido ao ativar; mesmo padrão visual
- Todo texto da interface em português (pt-BR)
- Layout responsivo — desktop e celular
