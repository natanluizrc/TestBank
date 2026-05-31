#!/usr/bin/env node
// Valida um arquivo JSON de aula (ou todos os arquivos em data/).
// Uso: node scripts/validar_aula.js [caminho/para/aula.json | --all]

const fs   = require('fs');
const path = require('path');

// ─── Configuração ──────────────────────────────────────────────────────────────

const TIPOS_VALIDOS      = new Set(['multipla_escolha', 'certo_errado']);
const RESPOSTAS_CE       = new Set(['certo', 'errado']);
const RESPOSTAS_ME       = new Set(['A', 'B', 'C', 'D', 'E']);
const ANO_MIN            = 1990;
const ANO_MAX            = new Date().getFullYear() + 1;
const MIN_QUESTOES       = 30;
const MIN_ENUNCIADO_CHARS = 20;
const MIN_COMENTARIO_CHARS = 30;
const ID_RE              = /^[a-z]+-\d{2}[ab]?-\d+$/;
const OPCAO_LETRA_RE     = /^[A-F]\)\s/;
const MARKDOWN_BOLD_RE   = /\*\*/;
const MARKDOWN_ITALIC_RE = /(?<![_a-zA-Z0-9])_[^_\s]|[^_\s]_(?![_a-zA-Z0-9])/;

// ─── Cores ANSI ───────────────────────────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  gray:   '\x1b[90m',
};

function ok   (msg) { console.log(`  ${C.green}[OK]${C.reset}   ${msg}`); }
function warn (msg) { console.log(`  ${C.yellow}[WARN]${C.reset} ${msg}`); }
function err  (msg) { console.log(`  ${C.red}[ERRO]${C.reset} ${msg}`); }
function info (msg) { console.log(`  ${C.blue}[INFO]${C.reset} ${msg}`); }

// ─── Ordenação (mesmo critério do sort_questoes.js) ───────────────────────────

const TIPO_ORDER = { multipla_escolha: 0, certo_errado: 1 };

function cmpNull(a, b, desc = false) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;   // null vai ao final
  if (b == null) return -1;
  if (desc) return b - a;
  return String(a).localeCompare(String(b), 'pt-BR', { sensitivity: 'base' });
}

function compareQuestoes(a, b) {
  let r;
  r = (a.banca || '').localeCompare(b.banca || '', 'pt-BR', { sensitivity: 'base' });
  if (r !== 0) return r;
  r = cmpNull(a.orgao ?? null, b.orgao ?? null);
  if (r !== 0) return r;
  r = cmpNull(a.cargo ?? null, b.cargo ?? null);
  if (r !== 0) return r;
  r = cmpNull(a.ano ?? null, b.ano ?? null, true);  // decrescente
  if (r !== 0) return r;
  r = (TIPO_ORDER[a.tipo] ?? 99) - (TIPO_ORDER[b.tipo] ?? 99);
  if (r !== 0) return r;
  return (a.dificuldade ?? 99) - (b.dificuldade ?? 99);
}

// ─── Validador principal ───────────────────────────────────────────────────────

function validarArquivo(filePath) {
  const rel = path.relative(process.cwd(), filePath);
  console.log(`\n${C.bold}=== VALIDAÇÃO: ${rel} ===${C.reset}`);

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    err(`Não foi possível ler o arquivo: ${e.message}`);
    return { erros: 1, avisos: 0 };
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    err(`JSON inválido: ${e.message}`);
    return { erros: 1, avisos: 0 };
  }

  let erros = 0, avisos = 0;

  // ── Campos de topo ──────────────────────────────────────────────────────────
  console.log(`\n${C.gray}── Estrutura do arquivo ──${C.reset}`);

  const slugEsperado = path.basename(filePath, '.json');
  if (!data.slug)          { err('Campo "slug" ausente');         erros++; }
  else if (data.slug !== slugEsperado) {
    warn(`slug "${data.slug}" não bate com o nome do arquivo "${slugEsperado}"`); avisos++;
  } else ok(`slug "${data.slug}" bate com o arquivo`);

  if (!data.titulo)   { err('Campo "titulo" ausente');   erros++; }
  else ok(`titulo: "${data.titulo}"`);

  if (!data.materia)  { err('Campo "materia" ausente');  erros++; }
  else ok(`materia: "${data.materia}"`);

  if (!Array.isArray(data.questoes)) {
    err('"questoes" não é um array'); erros++;
    return { erros, avisos };
  }

  info(`Total de questões: ${data.questoes.length}`);
  if (data.questoes.length < MIN_QUESTOES) {
    warn(`Menos de ${MIN_QUESTOES} questões (${data.questoes.length} encontradas)`); avisos++;
  } else ok(`Mínimo de ${MIN_QUESTOES} questões atingido`);

  // ── Por questão ─────────────────────────────────────────────────────────────
  console.log(`\n${C.gray}── Verificações por questão ──${C.reset}`);

  const idsVistos    = new Map();
  let   qErros = 0, qAvisos = 0;

  for (let i = 0; i < data.questoes.length; i++) {
    const q   = data.questoes[i];
    const pos = `Q${i + 1}`;
    const qid = q.id ? `${q.id}` : `(sem id, pos ${pos})`;

    // id
    if (!q.id) {
      err(`${pos} — campo "id" ausente`); qErros++;
    } else {
      if (!ID_RE.test(q.id)) {
        warn(`${qid} — formato de id inesperado (esperado: cg-XX-NNN)`); qAvisos++;
      }
      if (idsVistos.has(q.id)) {
        err(`${qid} — id duplicado (também em pos ${idsVistos.get(q.id) + 1})`); qErros++;
      } else {
        idsVistos.set(q.id, i);
      }
    }

    // banca
    if (!q.banca || q.banca.trim() === '') {
      err(`${qid} — campo "banca" ausente ou vazio`); qErros++;
    }

    // ano
    if (q.ano != null) {
      if (!Number.isInteger(q.ano) || q.ano < ANO_MIN || q.ano > ANO_MAX) {
        warn(`${qid} — ano inválido: ${q.ano}`); qAvisos++;
      }
    }

    // tipo
    if (!q.tipo) {
      err(`${qid} — campo "tipo" ausente`); qErros++;
    } else if (!TIPOS_VALIDOS.has(q.tipo)) {
      err(`${qid} — tipo desconhecido: "${q.tipo}"`); qErros++;
    } else {
      // resposta
      if (!q.resposta) {
        err(`${qid} — campo "resposta" ausente`); qErros++;
      } else if (q.tipo === 'multipla_escolha' && !RESPOSTAS_ME.has(q.resposta)) {
        err(`${qid} — resposta inválida para multipla_escolha: "${q.resposta}" (deve ser A-E)`); qErros++;
      } else if (q.tipo === 'certo_errado' && !RESPOSTAS_CE.has(q.resposta)) {
        err(`${qid} — resposta inválida para certo_errado: "${q.resposta}" (deve ser "certo" ou "errado")`); qErros++;
      }

      // opcoes
      if (q.tipo === 'multipla_escolha') {
        if (!Array.isArray(q.opcoes) || q.opcoes.length === 0) {
          err(`${qid} — multipla_escolha sem campo "opcoes"`); qErros++;
        } else {
          if (q.opcoes.length < 2 || q.opcoes.length > 6) {
            warn(`${qid} — opcoes com ${q.opcoes.length} itens (esperado 2-6)`); qAvisos++;
          }
          q.opcoes.forEach((op, idx) => {
            if (!OPCAO_LETRA_RE.test(op) && !/^\([A-F]\)\s/.test(op) && !/^[a-f]\)\s/.test(op)) {
              warn(`${qid} — opcoes[${idx}] formato inesperado: "${op.slice(0, 30)}"`); qAvisos++;
            }
          });
        }
      } else if (q.tipo === 'certo_errado') {
        if (Array.isArray(q.opcoes)) {
          err(`${qid} — certo_errado não deve ter campo "opcoes"`); qErros++;
        }
      }
    }

    // dificuldade
    if (q.dificuldade == null) {
      err(`${qid} — campo "dificuldade" ausente`); qErros++;
    } else if (!Number.isInteger(q.dificuldade) || q.dificuldade < 1 || q.dificuldade > 5) {
      err(`${qid} — dificuldade fora do range 1-5: ${q.dificuldade}`); qErros++;
    }

    // enunciado
    if (!q.enunciado || q.enunciado.trim() === '') {
      err(`${qid} — campo "enunciado" ausente ou vazio`); qErros++;
    } else {
      if (q.enunciado.length < MIN_ENUNCIADO_CHARS) {
        warn(`${qid} — enunciado muito curto (${q.enunciado.length} chars): "${q.enunciado.slice(0, 40)}"`); qAvisos++;
      }
      if (MARKDOWN_BOLD_RE.test(q.enunciado)) {
        warn(`${qid} — enunciado contém "**" (markdown)`); qAvisos++;
      }
      // Sinais de truncamento: apenas reticências explícitas (,/:  no final são padrões válidos de questões)
      const ultimos = q.enunciado.trimEnd();
      if (ultimos.endsWith('...') || ultimos.endsWith('…')) {
        warn(`${qid} — enunciado pode estar truncado (termina com reticências)`); qAvisos++;
      }
    }

    // comentario
    if (!q.comentario || q.comentario.trim() === '') {
      err(`${qid} — campo "comentario" ausente ou vazio`); qErros++;
    } else {
      if (q.comentario.length < MIN_COMENTARIO_CHARS) {
        warn(`${qid} — comentario muito curto (${q.comentario.length} chars)`); qAvisos++;
      }
      if (MARKDOWN_BOLD_RE.test(q.comentario)) {
        err(`${qid} — comentario contém "**" (markdown proibido)`); qErros++;
      }
      if (MARKDOWN_ITALIC_RE.test(q.comentario)) {
        warn(`${qid} — comentario pode conter "_itálico_" (markdown)`); qAvisos++;
      }
    }

    // adaptada
    if (q.adaptada != null && q.adaptada !== true) {
      warn(`${qid} — campo "adaptada" deve ser true ou ausente, mas é: ${JSON.stringify(q.adaptada)}`); qAvisos++;
    }

    // campos inesperados
    const CAMPOS_VALIDOS = new Set(['id','banca','orgao','cargo','ano','tipo','enunciado','opcoes','resposta','comentario','dificuldade','adaptada','validado']);
    for (const campo of Object.keys(q)) {
      if (!CAMPOS_VALIDOS.has(campo)) {
        warn(`${qid} — campo desconhecido: "${campo}"`); qAvisos++;
      }
    }
  }

  if (qErros === 0 && qAvisos === 0) ok('Todas as questões válidas');
  erros  += qErros;
  avisos += qAvisos;

  // ── Ordenação ───────────────────────────────────────────────────────────────
  console.log(`\n${C.gray}── Verificação de ordenação ──${C.reset}`);

  let ordOk = true;
  const questoes = data.questoes;
  for (let i = 0; i < questoes.length - 1; i++) {
    const a = questoes[i];
    const b = questoes[i + 1];
    if (compareQuestoes(a, b) > 0) {
      const idA = a.id || `pos ${i + 1}`;
      const idB = b.id || `pos ${i + 2}`;
      warn(`Ordenação: ${idA} deveria vir depois de ${idB} (pos ${i + 1}→${i + 2})`);
      warn(`  ${idA}: banca="${a.banca}" orgao="${a.orgao||'-'}" cargo="${a.cargo||'-'}" ano=${a.ano||'-'} tipo=${a.tipo} dif=${a.dificuldade}`);
      warn(`  ${idB}: banca="${b.banca}" orgao="${b.orgao||'-'}" cargo="${b.cargo||'-'}" ano=${b.ano||'-'} tipo=${b.tipo} dif=${b.dificuldade}`);
      avisos++;
      ordOk = false;
    }
  }
  if (ordOk) ok('Ordenação correta');

  // ── Distribuição ────────────────────────────────────────────────────────────
  console.log(`\n${C.gray}── Distribuição ──${C.reset}`);

  const porBanca = {};
  const porTipo  = { multipla_escolha: 0, certo_errado: 0 };
  const porDif   = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const semOrgao = [], semCargo = [], semAno = [];

  for (const q of questoes) {
    if (q.banca) porBanca[q.banca] = (porBanca[q.banca] || 0) + 1;
    if (q.tipo && porTipo[q.tipo] != null) porTipo[q.tipo]++;
    if (q.dificuldade >= 1 && q.dificuldade <= 5) porDif[q.dificuldade]++;
    if (!q.orgao)  semOrgao.push(q.id);
    if (!q.cargo)  semCargo.push(q.id);
    if (!q.ano)    semAno.push(q.id);
  }

  // bancas
  const bancasStr = Object.entries(porBanca)
    .sort((a, b) => b[1] - a[1])
    .map(([b, n]) => `${b}(${n})`)
    .join(' · ');
  info(`Bancas: ${bancasStr}`);

  // tipo
  info(`Tipos: ME=${porTipo.multipla_escolha} · CE=${porTipo.certo_errado}`);

  // dificuldade
  const difStr = [1,2,3,4,5].map(d => `★${d}=${porDif[d]}`).join(' · ');
  info(`Dificuldade: ${difStr}`);

  // campos opcionais ausentes
  if (semOrgao.length)  info(`Sem "orgao"  (${semOrgao.length}): ${semOrgao.join(', ')}`);
  if (semCargo.length)  info(`Sem "cargo"  (${semCargo.length}): ${semCargo.join(', ')}`);
  if (semAno.length)    info(`Sem "ano"    (${semAno.length}): ${semAno.join(', ')}`);

  // ── Sumário ─────────────────────────────────────────────────────────────────
  console.log(`\n${C.gray}── Sumário ──${C.reset}`);
  const status = erros > 0
    ? `${C.red}${C.bold}FALHOU${C.reset}`
    : avisos > 0
      ? `${C.yellow}${C.bold}COM AVISOS${C.reset}`
      : `${C.green}${C.bold}OK${C.reset}`;
  console.log(`  ${status}  —  erros: ${erros}  ·  avisos: ${avisos}  ·  questões: ${questoes.length}`);

  return { erros, avisos };
}

// ─── Ponto de entrada ─────────────────────────────────────────────────────────

const arg = process.argv[2];

if (!arg || arg === '--all') {
  // Processar todos os arquivos em data/
  const dataDir = path.join(__dirname, '..', 'data');

  function walkJson(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? walkJson(path.join(dir, e.name))
      : e.name.endsWith('.json') ? [path.join(dir, e.name)] : []
    );
  }

  const arquivos = walkJson(dataDir).sort();
  if (arquivos.length === 0) {
    console.error('Nenhum arquivo JSON encontrado em data/');
    process.exit(1);
  }

  let totalErros = 0, totalAvisos = 0;
  for (const f of arquivos) {
    const r = validarArquivo(f);
    totalErros  += r.erros;
    totalAvisos += r.avisos;
  }

  console.log(`\n${C.bold}════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}TOTAL — erros: ${totalErros}  ·  avisos: ${totalAvisos}  ·  arquivos: ${arquivos.length}${C.reset}`);
  process.exit(totalErros > 0 ? 1 : 0);

} else {
  // Arquivo específico
  const filePath = path.resolve(arg);
  if (!fs.existsSync(filePath)) {
    console.error(`Arquivo não encontrado: ${filePath}`);
    process.exit(1);
  }
  const r = validarArquivo(filePath);
  process.exit(r.erros > 0 ? 1 : 0);
}
