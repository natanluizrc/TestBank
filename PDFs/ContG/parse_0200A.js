// Parser para ContG_0200(A).pdf — Escrituração Contábil (Aula 02A)
// Uso: node parse_0200A.js > aula-02a.json

const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, 'ContG_0200A_extracted.txt');
const lines = fs.readFileSync(INPUT, 'utf-8').split('\n').map(l => l.trimEnd());

// ─── configuração ─────────────────────────────────────────────────────────

// Seções e quais incluir (true = usar; false = pular — duplicatas)
const SECTION_POLICY = {
  'QUESTÕES COMENTADAS ESCRITURAÇÃO MULTIBANCAS': 'all',
  'QUESTÕES COMENTADAS ESCRITURAÇÃO CEBRASPE': 'all',
  'QUESTÕES COMENTADAS ESCRITURAÇÃO - FCC': 'fcc_only',   // só Q com banca FCC
  'QUESTÕES COMENTADAS - ESCRITURAÇÃO FGV': 'all',
  'QUESTÕES COMENTADAS ESCRITURAÇÃO - VUNESP': 'all',
  'QUESTÕES COMENTADAS ESCRITURAÇÃO CESGRANRIO': 'all',
  'QUESTÕES COMENTADAS ESCRITURAÇÃO': 'skip',
  'QUESTÕES COMENTADAS': 'all',
};

const FCC_PROPER_UNTIL_Q = 6; // FCC section: só questões numeradas <= 6 são FCC de fato

// ─── helpers ─────────────────────────────────────────────────────────────

const JUNK = /^(Concursos Contábeis|Luciano Rosa|Júlio Cardozo|Aula 0|\.\s*Túlio)/i;
const SECTION_RE = /^QUESTÕES COMENTADAS/;
const QUESTION_START = /^([0-9]+)[.\s]*\(/;
const GABARITO_RE = /Gabarito\s*:\s*(Certo|Errado|[A-Ea-e])\s*\.?/i;
const COMMENT_START = /^Comentários?\s*:/i;

function clean(s) { return s.replace(/\s+/g, ' ').trim(); }

// Detecta opções inline (todas na mesma linha separadas por padrões)
function splitInlineOpts(txt) {
  // Tenta padrão: "A texto. B texto. C texto..."  ou  "A texto B texto C texto"
  // Divide em: letra no início de segmento precedido por . ou separador
  const segments = txt.split(/(?<=[.?!])\s+(?=[A-Ea-e][\)\s])|(?<=\s)(?=[A-E]\))|(?<=\s)(?=[a-e]\))/);
  if (segments.length < 2) {
    // Tenta divisão por ". letra " que é o padrão mais comum
    const parts = txt.split(/\.\s+(?=[A-E][^A-Z])/);
    if (parts.length >= 3) {
      return parts.map((p, i) => {
        const letter = String.fromCharCode(65 + i);
        return letter + ') ' + p.replace(/^[A-Ea-e][\)\s]+/, '').trim();
      }).filter(p => p.length > 3);
    }
  }
  return null;
}

// Analisa opções de um bloco de texto (pode ter múltiplas linhas já unidas)
function parseOptions(lines) {
  if (!lines.length) return null;
  const combined = lines.join(' ');

  // Padrão 1: letras minúsculas com parênteses "a) texto b) texto"
  if (/^[a-e]\)\s/.test(combined.trim())) {
    const parts = combined.split(/\s+(?=[a-e]\)\s)/);
    return parts.map(p => {
      const m = /^([a-e])\)\s*(.+)/.exec(p.trim());
      return m ? m[1].toUpperCase() + ') ' + clean(m[2]) : null;
    }).filter(Boolean);
  }

  // Padrão 2: letras maiúsculas com parênteses "(A) texto (B) texto"
  if (/^\([A-E]\)\s/.test(combined.trim())) {
    const parts = combined.split(/\s+(?=\([A-E]\)\s)/);
    return parts.map(p => {
      const m = /^\(([A-E])\)\s*(.+)/.exec(p.trim());
      return m ? m[1] + ') ' + clean(m[2]) : null;
    }).filter(Boolean);
  }

  // Padrão 3: letras maiúsculas com parênteses "A) texto B) texto"
  if (/^[A-E]\)\s/.test(combined.trim())) {
    const parts = combined.split(/\s+(?=[A-E]\)\s)/);
    return parts.map(p => {
      const m = /^([A-E])\)\s*(.+)/.exec(p.trim());
      return m ? m[1] + ') ' + clean(m[2]) : null;
    }).filter(Boolean);
  }

  // Padrão 4: linha começa com letra solta "A texto\nB texto" (multi-linha)
  if (lines.length >= 3 && /^[A-Ea-e]\s/.test(lines[0].trim())) {
    return lines.map(l => {
      const m = /^([A-Ea-e])\s+(.+)/.exec(l.trim());
      return m ? m[1].toUpperCase() + ') ' + clean(m[2]) : null;
    }).filter(Boolean);
  }

  // Padrão 5: inline com separação por ". LETRA " (com ponto)
  // Ex: "A deve fazer X. B deve fazer Y. C deve fazer Z."
  if (/^[A-E]\s/.test(combined.trim())) {
    const withPeriod = splitInlineWithPeriod(combined);
    if (withPeriod && withPeriod.length >= 3) return withPeriod;

    // Padrão 6: inline SEM ponto separador — "A text B text C text D text E text"
    // Divide só em [B-E] isolados (cercados por espaços)
    const withSpace = splitInlineByLetter(combined);
    if (withSpace && withSpace.length >= 3) return withSpace;
  }

  return null;
}

// Divide opções inline por ". LETRA " como separador
function splitInlineWithPeriod(str) {
  const re = /\.\s+([A-E])\s+/g;
  const points = [];
  let m;
  while ((m = re.exec(str)) !== null) points.push(m.index);
  if (points.length < 2) return null;

  const segs = [];
  let prev = 0;
  for (const p of points) {
    segs.push(str.slice(prev, p).trim());
    prev = p + str.slice(p).match(/^\.\s+[A-E]\s+/)[0].length;
  }
  segs.push(str.slice(prev).replace(/\.\s*$/, '').trim());

  return segs.map((s, i) => String.fromCharCode(65+i) + ') ' + s.replace(/^[A-E]\s+/, '').replace(/\.\s*$/, '').trim())
             .filter(s => s.length > 3);
}

// Divide opções inline apenas por letra isolada entre espaços: " B ", " C " etc.
function splitInlineByLetter(str) {
  // Só funciona se o primeiro token for "A " + conteúdo
  if (!/^A\s/.test(str.trim())) return null;
  // Divide nos pontos onde " B " " C " " D " " E " aparecem como token isolado
  const parts = str.split(/\s+(?=[B-E]\s)/);
  if (parts.length < 3) return null;
  return parts.map((p, i) => String.fromCharCode(65+i) + ') ' + p.replace(/^[A-E]\s+/, '').replace(/\.\s*$/, '').trim())
              .filter(s => s.length > 3);
}

// ─── extração principal ───────────────────────────────────────────────────

let section = 'QUESTÕES COMENTADAS ESCRITURAÇÃO MULTIBANCAS';
let policy = 'all';

// blocos: cada questão com suas linhas brutas
const blocks = [];
let cur = null;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) { if (cur) cur.lines.push(''); continue; }
  if (JUNK.test(line)) continue;

  if (SECTION_RE.test(line) && !line.startsWith('(')) {
    if (cur) { blocks.push(cur); cur = null; }
    section = line;
    policy = SECTION_POLICY[line] || 'skip';
    continue;
  }

  if (QUESTION_START.test(line)) {
    if (cur) blocks.push(cur);
    cur = { section, policy, lineN: i+1, lines: [line] };
  } else if (cur) {
    cur.lines.push(line);
  }
}
if (cur) blocks.push(cur);

// ─── parse de cada bloco ─────────────────────────────────────────────────

function parseBlock(b) {
  if (b.policy === 'skip') return null;

  // Extrai número e banca da primeira linha
  const firstLine = b.lines[0];
  const headM = /^([0-9]+)[.\s]*\(((?:[^()]+|\([^)]*\))*)\)\s*(.*)/.exec(firstLine);
  if (!headM) return null;

  const qNum = parseInt(headM[1]);
  const banca = clean(headM[2]);

  // Filtro FCC: só questões 1-6 para evitar duplicatas de MULTIBANCAS
  if (b.policy === 'fcc_only' && qNum > FCC_PROPER_UNTIL_Q) return null;

  const restFirstLine = headM[3];
  const allLines = [restFirstLine, ...b.lines.slice(1)];

  // Encontra Comentários: e Gabarito:
  // COMMENT_START_INLINE: detecta "Comentários:" em qualquer posição da linha
  const COMMENT_INLINE = /Comentários?\s*:/i;
  let commentStart = -1;
  let gabaritoLine = -1;
  for (let i = 0; i < allLines.length; i++) {
    if (commentStart < 0 && COMMENT_INLINE.test(allLines[i])) commentStart = i;
    if (gabaritoLine < 0 && GABARITO_RE.test(allLines[i])) gabaritoLine = i;
  }

  if (gabaritoLine < 0) return null;

  // Divide em: enunciado+opções vs comentário
  const splitAt = commentStart >= 0 ? commentStart : gabaritoLine;
  let questionLines = allLines.slice(0, splitAt).filter(l => l.trim());
  const commentLines = allLines.slice(commentStart >= 0 ? commentStart + 1 : splitAt).filter(l => l.trim());

  // Se o "Comentários:" está no meio de uma linha (com opções antes), extrair o trecho anterior
  if (commentStart >= 0 && allLines[commentStart]) {
    const commentIdx = allLines[commentStart].search(/Comentários?\s*:/i);
    const beforeComment = (commentIdx > 0 ? allLines[commentStart].slice(0, commentIdx) : '').trim();
    if (beforeComment) questionLines.push(beforeComment);
  }

  // gabarito
  const gabM = GABARITO_RE.exec(allLines[gabaritoLine]);
  const gabRaw = gabM[1];
  const resposta = gabRaw.toLowerCase() === 'certo' ? 'certo' :
                   gabRaw.toLowerCase() === 'errado' ? 'errado' :
                   gabRaw.toUpperCase();
  const tipo = (resposta === 'certo' || resposta === 'errado') ? 'certo_errado' : 'multipla_escolha';

  // Enunciado e opções
  let enunciado = '';
  let opcoes = null;

  if (tipo === 'multipla_escolha') {
    // Tenta detectar onde começam as opções
    // Só detecta início de opções com parênteses "A)" ou "(A)" ou "a)" ou "(a)"
    // Linhas sem parênteses ("A texto") são muito ambíguas e tratadas inline depois
    let optStartIdx = -1;
    for (let i = 0; i < questionLines.length; i++) {
      const l = questionLines[i].trim();
      if (/^[A-Ea-e]\)\s*\S/.test(l) || /^\([A-Ea-e]\)\s*\S/.test(l)) {
        optStartIdx = i;
        break;
      }
    }

    if (optStartIdx > 0) {
      // Verificar se a linha antes de optStartIdx também tem opções embutidas (ex: A) B) C) D) numa linha, E) na próxima)
      const prevLine = questionLines[optStartIdx - 1] || '';
      const prevHasOpts = /\bA\)\s|\(A\)\s|\ba\)\s/.test(prevLine);
      if (prevHasOpts && optStartIdx >= 1) {
        // Enunciado: tudo antes do prevLine ou split prevLine em enunciado + opts
        const prevIdx = prevLine.search(/(?<![(\w])[Aa]\)\s|\(A\)\s/);
        const prevEnunciado = prevIdx > 0 ? prevLine.slice(0, prevIdx).trim() : '';
        const prevOpts = prevIdx >= 0 ? prevLine.slice(prevIdx) : prevLine;
        const allOptLines = (prevOpts ? [prevOpts] : []).concat(questionLines.slice(optStartIdx));
        enunciado = questionLines.slice(0, optStartIdx - 1).join(' ') + (prevEnunciado ? ' ' + prevEnunciado : '');
        opcoes = parseOptions(allOptLines.filter(Boolean));
      } else {
        enunciado = questionLines.slice(0, optStartIdx).join(' ');
        opcoes = parseOptions(questionLines.slice(optStartIdx));
      }
    } else if (optStartIdx === 0) {
      // Opções na primeira linha, enunciado vazio (incomum)
      enunciado = '';
      opcoes = parseOptions(questionLines);
    } else {
      // Tudo numa linha — tenta split inline
      const combined = questionLines.join(' ');

      // Tenta 1: "...text. A) texto B) texto" ou "...text? A texto B texto"
      const inlineM = /^(.*?[?:.])\s+([A-E][\s\)].+)$/s.exec(combined);
      if (inlineM) {
        enunciado = inlineM[1];
        opcoes = parseOptions([inlineM[2]]);
      }

      // Tenta 2: opções minúsculas "a) texto b) texto" em qualquer posição
      if (!opcoes) {
        const lowerM = /^(.*?[?:.:])\s+(a\).+)$/s.exec(combined);
        if (lowerM && /\bb\)/.test(lowerM[2])) {
          enunciado = lowerM[1];
          opcoes = parseOptions([lowerM[2]]);
        }
      }

      // Tenta 3: opções "(A) texto (B) texto" no formato com parênteses ao redor
      if (!opcoes) {
        const idx = combined.search(/\(A\)\s/);
        if (idx >= 0) {
          enunciado = combined.slice(0, idx).trim();
          const optStr = combined.slice(idx).replace(/\(([A-E])\)/g, '$1)');
          opcoes = parseOptions([optStr]);
        }
      }

      // Tenta 4: opções "A) texto B) texto" sem parênteses
      if (!opcoes) {
        const idx = combined.search(/(?<![(\w])A\)\s/);
        if (idx > 0) {
          enunciado = combined.slice(0, idx).trim();
          opcoes = parseOptions([combined.slice(idx)]);
        }
      }

      // Tenta 5: opções lowercase "a) texto" em qualquer posição (sem terminator)
      if (!opcoes) {
        const idx = combined.search(/\ba\)\s/);
        if (idx > 0 && /\bb\)/.test(combined)) {
          enunciado = combined.slice(0, idx).trim();
          opcoes = parseOptions([combined.slice(idx)]);
        }
      }

      // Fallback 6: bare uppercase letter options "...text A opt B opt C opt D opt [E opt]"
      // e.g. CESGRANRIO "A misto aumentativo B misto diminutivo C modificativo..."
      if (!opcoes) {
        const lastA = combined.lastIndexOf(' A ');
        if (lastA >= 0) {
          const rest = combined.slice(lastA + 1);
          if (/\bB\s/.test(rest) && /\bC\s/.test(rest) && /\bD\s/.test(rest)) {
            const parts = rest.split(/\s+(?=[B-E]\s)/);
            if (parts.length >= 4) {
              const cOpts = parts.map((p, i) => String.fromCharCode(65 + i) + ') ' + p.replace(/^[A-E]\s+/, '').trim())
                                 .filter(s => s.length > 3);
              if (cOpts.length >= 4) { enunciado = combined.slice(0, lastA).trim(); opcoes = cOpts; }
            }
          }
        }
      }

      if (!opcoes) enunciado = combined;
    }
  } else {
    enunciado = questionLines.join(' ');
  }

  // Comentário: remover linha Gabarito: e lixo
  const comentario = commentLines
    .filter(l => !GABARITO_RE.test(l) && !/^Concursos Contábeis/i.test(l))
    .join(' ');

  return {
    banca: clean(banca),
    tipo,
    enunciado: clean(enunciado),
    opcoes: opcoes && opcoes.length >= 2 ? opcoes : undefined,
    resposta,
    comentario: clean(comentario),
    _section: b.section,
    _lineN: b.lineN,
    _qNum: qNum,
  };
}

const parsed = blocks.map(parseBlock).filter(Boolean);

// ─── deduplicação ─────────────────────────────────────────────────────────
// Fingerprint = banca + primeiras 80 chars do enunciado normalizado

const seen = new Set();
const unique = [];
for (const q of parsed) {
  const fp = q.banca + '|' + q.enunciado.substring(0, 80).toLowerCase().replace(/\s+/g, ' ');
  if (!seen.has(fp)) {
    seen.add(fp);
    unique.push(q);
  }
}

// ─── geração de JSON ─────────────────────────────────────────────────────

const questoes = unique.map((q, idx) => {
  const id = 'cg-02a-' + String(idx + 1).padStart(3, '0');
  const obj = {
    id,
    banca: q.banca,
    tipo: q.tipo,
    enunciado: q.enunciado,
    resposta: q.resposta,
    comentario: q.comentario,
    dificuldade: 2,
  };
  if (q.tipo === 'multipla_escolha' && q.opcoes) obj.opcoes = q.opcoes;
  return obj;
});

const output = {
  slug: 'aula-02a',
  titulo: 'Aula 02A',
  materia: 'ContG',
  questoes,
};

process.stdout.write(JSON.stringify(output, null, 2));

// ─── diagnóstico para stderr ──────────────────────────────────────────────
const mc_no_opts = questoes.filter(q => q.tipo === 'multipla_escolha' && !q.opcoes);
process.stderr.write(`\nTotal questões únicas: ${unique.length}\n`);
process.stderr.write(`MC sem opcoes: ${mc_no_opts.length}\n`);
process.stderr.write(`IDs gerados: cg-02a-001 a cg-02a-${String(unique.length).padStart(3,'0')}\n`);
if (mc_no_opts.length > 0) {
  process.stderr.write('Amostras MC sem opcoes:\n');
  for (const q of mc_no_opts.slice(0, 5)) {
    process.stderr.write(`  L${q._lineN} [${q.banca}]: ${q.enunciado.substring(0,60)}\n`);
  }
}
