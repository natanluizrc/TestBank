# TestBank — Documentação Técnica

v1.0 · Atualizado: 2026-05-10

---

## Índice

1. [Visão Geral](#visão-geral)
2. [Stack Tecnológica](#stack-tecnológica)
3. [Arquitetura de Navegação](#arquitetura-de-navegação)
4. [Funcionalidades](#funcionalidades)
5. [Schema de Dados](#schema-de-dados)
6. [Como Adicionar Conteúdo](#como-adicionar-conteúdo)
7. [Deploy e Configuração](#deploy-e-configuração)
8. [Estrutura de Arquivos](#estrutura-de-arquivos)

---

## Visão Geral

O TestBank é uma aplicação web para estudo de concursos públicos, multi-matéria. Questões de bancas reais organizadas por matéria e aula, sistema de fixadas para revisão, simulados cronometrados e histórico de desempenho.

Todo o conteúdo roda no navegador — sem backend de aplicação. Lógica em JavaScript puro (ES6+), dados em JSON estático, persistência de usuário no Firestore.

| Ambiente | URL |
|----------|-----|
| Produção | https://nl-testbank.web.app |
| Alternativo | https://nl-testbank.firebaseapp.com |
| Repositório | github.com/natanluizrc/TestBank |

---

## Stack Tecnológica

| Camada | Tecnologia | Detalhe |
|--------|-----------|---------|
| Interface | HTML + CSS + JS ES6+ | Sem framework, sem bundler, sem transpilação |
| Hospedagem | Firebase Hosting | Arquivos estáticos, CDN global, HTTPS automático |
| Autenticação | Firebase Auth | Provedor Google (OAuth 2.0 via popup) |
| Banco de dados | Firebase Firestore | NoSQL — perfil, revisão e histórico do usuário |
| Conteúdo | JSON estático em data/ | Versionado no GitHub; carregado via fetch() |
| SDK Firebase | v10.12.0 compat | CDN gstatic.com |
| Versionamento | Git + GitHub | Apenas controle de versão — sem CI/CD automático |

---

## Arquitetura de Navegação

Quatro camadas de navegação em cascata, todas com `position: sticky` em sequência no topo da página.

```
  Início   Fixadas   Simulado   Histórico       ← topbar — z:100 / top:0 / 52px
  ──────────────────────────────────────────────
  ContG   ContC   ...                            ← matérias — z:99 / top:52px / 42px
  ──────────────────────────────────────────────
  Aula 00   Aula 01A   Aula 01B   ...            ← aulas — z:98 / top:94px / 42px
  ──────────────────────────────────────────────
  [000] [000] [000]         Expandir tudo        ← placar — z:10 / top:136px
```

| Aba | Comportamento |
|-----|--------------|
| Início | Reseta sempre para a primeira matéria e sua primeira aula |
| Fixadas | Exibe questões fixadas; reseta para a primeira matéria e pré-seleciona sua primeira aula como filtro |
| Simulado | Config → quiz (1 por vez) → resultado; exibe a fonte selecionada (matéria/aula) nas barras como indicador read-only |
| Histórico | Lista simulados passados; oculta barras de matéria/aula |

> **Nota:** Navegar para qualquer aba global durante um simulado ativo limpa o temporizador (`clearInterval`) e descarta o estado do simulado.

---

## Funcionalidades

### Modo de questões (lista)

Ao selecionar uma aula, o JSON é carregado via `fetch()` e todas as questões são renderizadas em cards. O JSON é cacheado em memória (`aulaCache`) para evitar requisições repetidas.

Cada card contém: `questao-info` (Q1, estrelas de dificuldade, tipo, botão Fixar) → banca em cinza → enunciado → opções → botão Ver gabarito → gabarito inline.

### Tipos de questão

| Tipo | Campo tipo | Campo resposta |
|------|-----------|----------------|
| Múltipla escolha | `"multipla_escolha"` | `"A"` \| `"B"` \| `"C"` \| `"D"` \| `"E"` |
| Certo / Errado | `"certo_errado"` | `"certo"` \| `"errado"` |

### Botão Fixar / Fixada

| Estado | Visual | Ação |
|--------|--------|------|
| Fixar | Borda amarela #f59e0b, texto amarelo | Salva em revisaoIds + Firestore (fire-and-forget) |
| Fixada | Fundo amarelo sólido #f59e0b, texto branco | Remove de revisaoIds + Firestore |

### Simulado

Fonte (matéria ou aula) + quantidade (10/20/30) → questões sorteadas aleatoriamente → uma por vez com gabarito imediato → resultado com placar, percentual e tempo → salvo no Firestore.

### Diagramas em canvas

Linhas com caracteres box-drawing Unicode (`┌┐└┘│─┬┴┼├┤`) no enunciado são detectadas pela constante `DIAGRAMA_RE` e convertidas para `<canvas>` com renderização precisa via Canvas API. Suporta DPI alto (`devicePixelRatio`).

> **Nota:** A conversão para canvas ocorre apenas nos enunciados de questões (lista e simulado).

---

## Schema de Dados

### Arquivo JSON de aula (`data/{materia}/{slug}.json`)

```json
{
  "slug":    "aula-01a",
  "titulo":  "Aula 01A — Título",
  "materia": "Nome da Matéria",
  "questoes": [ ... ]
}
```

### Questão — múltipla escolha

```json
{
  "id":         "cg-01a-07",
  "banca":      "FGV/PC-AM/2022",
  "tipo":       "multipla_escolha",
  "enunciado":  "Texto da questão...",
  "opcoes":     ["A) ...", "B) ...", "C) ..."],
  "resposta":   "B",
  "comentario": "Explicação...",
  "dificuldade": 3
}
```

### Questão — certo/errado

```json
{
  "id":         "cg-01a-12",
  "banca":      "CESPE/TCU/2023",
  "tipo":       "certo_errado",
  "enunciado":  "Afirmação a ser julgada...",
  "resposta":   "certo",
  "comentario": "Explicação...",
  "dificuldade": 2
}
```

### Campos de questão

| Campo | Tipo | Valores |
|-------|------|---------|
| id | string | `{mat}-XX-NN` — abreviação da matéria + número da aula + número da questão |
| banca | string | Livre — exibido em cinza acima do enunciado |
| tipo | string | `"multipla_escolha"` \| `"certo_errado"` |
| enunciado | string | Texto da questão; suporta quebras de linha e diagramas Unicode |
| opcoes | array | Somente em multipla_escolha. Strings `"A) ..."`, `"B) ..."` |
| resposta | string | `"A"`–`"E"` (múltipla) \| `"certo"` \| `"errado"` (C/E) |
| comentario | string | Explicação do gabarito |
| dificuldade | inteiro | 1 (muito fácil) a 5 (muito difícil) — exibido como ★★☆☆☆ |

### Estrutura do Firestore

```
usuarios/{userId}/
  perfil/dados          → { nome, email, fotoUrl, criadoEm }
  historico/{id}        → { data, fonte, placar, total, tempoSegundos, questoes[] }
  revisao/{questaoId}   → { ...questão, _materia, _materiaId, _aula, _slug, _qNum, marcadoEm }
```

---

## Como Adicionar Conteúdo

### Passo 1 — Extrair o PDF

```bash
pdftotext -enc UTF-8 Arquivo.pdf Arquivo.txt
```

### Passo 2 — Criar o JSON

Salvar em `data/{materia}/aula-XX.json` seguindo o schema acima. O slug da matéria é em minúsculas sem acentos (ex: `data/contabilidade/`). Mínimo 30 questões por aula. Campo `banca` separado do enunciado. Dificuldade de 1 a 5 em cada questão.

### Passo 3 — Registrar em app.js

```javascript
const MATERIAS = [
  {
    id: 'contabilidade',   // slug — corresponde ao nome da pasta em data/
    nome: 'ContG',         // nome exibido na barra de matérias
    aulas: [
      { slug: 'aula-00',  titulo: 'Aula 00' },
      { slug: 'aula-01a', titulo: 'Aula 01A' },
      { slug: 'aula-02a', titulo: 'Aula 02A' },  // ← nova aula
    ]
  },
  // { id: 'outra-materia', nome: 'OutraM', aulas: [...] }  // ← nova matéria
];
```

> **Nota:** O slug deve corresponder exatamente ao nome do arquivo JSON sem extensão. Ex.: `"aula-02a"` → `data/{materia}/aula-02a.json`

### Passo 4 — Commitar e publicar

```bash
git add data/{materia}/aula-XX.json js/app.js
git commit -m "content: adicionar Aula XX — Título"
git push origin master
firebase deploy --only hosting
```

---

## Deploy e Configuração

### Fluxo obrigatório após qualquer alteração

```bash
git add [arquivos]
git commit -m "tipo: descrição"
git push origin master          # → GitHub
firebase deploy --only hosting  # → site ao vivo
```

> **Nota:** Git e Firebase Hosting são independentes — push no GitHub não publica automaticamente. Ambos os passos são obrigatórios.

### Outros comandos úteis

| Comando | O que faz |
|---------|-----------|
| `firebase deploy --only firestore:rules` | Publica apenas as regras de segurança do Firestore |
| `firebase deploy` | Publica hosting + rules |
| `npx firebase-tools deploy --only hosting` | Alternativa quando firebase não está no PATH global |

### Projeto Firebase

| Propriedade | Valor |
|-------------|-------|
| Project ID | nl-testbank |
| Hosting URL | https://nl-testbank.web.app |
| Console | console.firebase.google.com/project/nl-testbank |

### Segurança — Firestore Rules

```
match /usuarios/{userId}/{document=**} {
  allow read, write: if request.auth != null
                     && request.auth.uid == userId;
}
```

Cada usuário lê e escreve apenas nos próprios documentos. A `apiKey` no `app.js` é uma chave pública — a segurança real vem das Firestore Rules acima.

---

## Estrutura de Arquivos

```
TestBank/
├── index.html          ← Página principal (único HTML)
├── firebase.json       ← Config do Firebase Hosting
├── firestore.rules     ← Regras de segurança
├── .firebaserc         ← Vínculo com o projeto nl-testbank
├── .gitignore
├── CLAUDE.md           ← Instruções para o Claude Code
├── README.md           ← Esta documentação
│
├── js/app.js           ← Toda a lógica
├── css/style.css       ← Toda a estilização
│
├── data/
│   ├── {materia-1}/        ← Pasta por matéria (slug sem acentos)
│   │   ├── aula-00.json
│   │   ├── aula-01a.json
│   │   └── aula-XX.json
│   └── {materia-2}/        ← Novas matérias seguem o mesmo padrão
│       └── aula-XX.json
│
└── PDFs/               ← PDFs fonte (não servidos pelo Hosting)
```

### app.js — blocos internos

| Bloco | Responsabilidade |
|-------|-----------------|
| Configuração Firebase | Inicialização do SDK; instâncias de auth e db |
| MATERIAS | Registro de todas as matérias e aulas disponíveis |
| Estado global | Variáveis de sessão: usuário, aba ativa, cache, respostas, revisão, simulado |
| Auth | `onAuthStateChanged` + `mostrarLogin` / `mostrarApp` |
| Navegação | `renderBarraMaterias`, `renderBarraAulas`, `renderConteudo` |
| Carregamento | `carregarAulaDados` com cache em memória (`aulaCache`) |
| Questões | Renderização em lista, eventos de resposta e placar |
| Diagramas | `diagramasParaCanvas` — box-drawing Unicode → canvas |
| Simulado | Config → quiz → resultado → salvar Firestore |
| Histórico | Listagem, detalhes e limpeza no Firestore |
| Revisão / Fixadas | `toggleRevisao`, cache local, renderização da aba |
| Utilitários | `formatarTempo`, constante `DIAGRAMA_RE` |
| Event listeners | Login, logout, abas globais — vinculados ao DOM estático |
