// Parser para ContG_0200(B).pdf — Escrituração Contábil (Aula 02B)
// Uso: node parse_0200B.js > aula-02b.json

const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, 'ContG_0200B_extracted.txt');
const rawLines = fs.readFileSync(INPUT, 'utf-8').split('\n');

// Pré-processamento: separar questões coladas em uma mesma linha pelo pdftotext.
const MIDLINE_Q = /(?<=[.!?])\s+(\d{1,3})\.\s+\([A-ZÁÉÍÓÚÀÃÕÂÊÔ]/;
const GABARITO_MIDLINE = /(?<=Gabarito\s*:\s*(?:Certo|Errado|[A-E]))\s+(\d{1,3})\.\s+\([A-ZÁÉÍÓÚÀÃÕÂÊÔ]/;
const lines = [];
for (const raw of rawLines) {
  let m = GABARITO_MIDLINE.exec(raw);
  if (m && parseInt(m[1]) <= 60) {
    lines.push(raw.slice(0, m.index).trimEnd());
    lines.push(raw.slice(m.index + 1).trimEnd());
    continue;
  }
  m = MIDLINE_Q.exec(raw);
  if (m && parseInt(m[1]) <= 60) {
    lines.push(raw.slice(0, m.index).trimEnd());
    lines.push(raw.slice(m.index + 1).trimEnd());
  } else {
    lines.push(raw.trimEnd());
  }
}

// ─── configuração ─────────────────────────────────────────────────────────

const SECTION_POLICY = {
  'QUESTÕES COMENTADAS ESCRITURAÇÃO MULTIBANCAS': 'all',
  'QUESTÕES COMENTADAS ESCRITURAÇÃO VUNESP': 'all',
  'QUESTÕES COMENTADAS ESCRITURAÇÃO CEBRASPE': 'all',
  'QUESTÕES COMENTADAS ESCRITURAÇÃO CESGRANRIO': 'all',
  'QUESTÕES COMENTADAS ESCRITURAÇÃO': 'all',
  'QUESTÕES COMENTADAS': 'all',
};

// ─── helpers ─────────────────────────────────────────────────────────────

const JUNK = /^(Concursos Contábeis|Luciano Rosa|Júlio Cardozo|Aula 0|\.\s*Túlio)/i;
const SECTION_RE = /^QUESTÕES COMENTADAS/;
const QUESTION_START = /^([0-9]+)[.\s]*\(/;
const GABARITO_RE = /Gabarito\s*:\s*(Certo|Correto|Errado|[A-Ea-e])(?!\w)\s*\.?/i;
const COMMENT_START = /^Comentários?\s*:/i;

function clean(s) { return s.replace(/\s+/g, ' ').trim(); }

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

  // Padrão 4: multi-linha com letra solta "A texto\nB texto"
  if (lines.length >= 3 && /^[A-Ea-e]\s/.test(lines[0].trim())) {
    return lines.map(l => {
      const m = /^([A-Ea-e])\s+(.+)/.exec(l.trim());
      return m ? m[1].toUpperCase() + ') ' + clean(m[2]) : null;
    }).filter(Boolean);
  }

  // Padrão 5: inline "...text. A opt B opt C opt D opt E opt"
  if (/^[A-E]\s/.test(combined.trim())) {
    const withPeriod = splitInlineWithPeriod(combined);
    if (withPeriod && withPeriod.length >= 3) return withPeriod;

    const withSpace = splitInlineByLetter(combined);
    if (withSpace && withSpace.length >= 3) return withSpace;
  }

  return null;
}

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

function splitInlineByLetter(str) {
  if (!/^A\s/.test(str.trim())) return null;
  const parts = str.split(/\s+(?=[B-E]\s)/);
  if (parts.length < 3) return null;
  return parts.map((p, i) => String.fromCharCode(65+i) + ') ' + p.replace(/^[A-E]\s+/, '').replace(/\.\s*$/, '').trim())
              .filter(s => s.length > 3);
}

// ─── extração principal ───────────────────────────────────────────────────

let section = 'QUESTÕES COMENTADAS ESCRITURAÇÃO MULTIBANCAS';
let policy = 'all';

const blocks = [];
let cur = null;

const BARE_Q_START = /^([0-9]+)\.\s+[A-Za-záéíóúàãõâêô]/;
let afterGabarito = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) { if (cur) cur.lines.push(''); continue; }
  if (JUNK.test(line)) continue;

  if (SECTION_RE.test(line) && !line.startsWith('(')) {
    if (cur) { blocks.push(cur); cur = null; }
    section = line;
    policy = SECTION_POLICY[line] || 'skip';
    afterGabarito = false;
    continue;
  }

  const isNewQ = QUESTION_START.test(line) || (afterGabarito && BARE_Q_START.test(line));
  if (isNewQ) {
    if (cur) blocks.push(cur);
    cur = { section, policy, lineN: i+1, lines: [line] };
  } else if (cur) {
    cur.lines.push(line);
  }

  if (GABARITO_RE.test(line)) afterGabarito = true;
  else if (line) afterGabarito = false;
}
if (cur) blocks.push(cur);

// ─── parse de cada bloco ─────────────────────────────────────────────────

function parseBlock(b) {
  if (b.policy === 'skip') return null;

  const firstLine = b.lines[0];
  const headM = /^([0-9]+)[.\s]*\(((?:[^()]+|\([^)]*\))*)\)\s*(.*)/.exec(firstLine);

  let qNum, banca, restFirstLine;
  if (headM) {
    qNum = parseInt(headM[1]);
    banca = clean(headM[2]);
    restFirstLine = headM[3];
  } else {
    const altHeadM = /^([0-9]+)\.\s+(.*)/.exec(firstLine);
    if (!altHeadM) return null;
    qNum = parseInt(altHeadM[1]);
    banca = b.section
      .replace(/^QUESTÕES COMENTADAS ESCRITURAÇÃO\s*/i, '')
      .replace(/^QUESTÕES COMENTADAS\s*/i, '')
      .replace(/^-\s*/, '')
      .trim() || 'Desconhecida';
    restFirstLine = altHeadM[2];
  }

  const allLines = [restFirstLine, ...b.lines.slice(1)];

  const COMMENT_INLINE = /Comentários?\s*:/i;
  let commentStart = -1;
  let gabaritoLine = -1;
  for (let i = 0; i < allLines.length; i++) {
    if (commentStart < 0 && COMMENT_INLINE.test(allLines[i])) commentStart = i;
    if (gabaritoLine < 0 && GABARITO_RE.test(allLines[i])) gabaritoLine = i;
  }

  if (gabaritoLine < 0) return null;

  const splitAt = commentStart >= 0 ? commentStart : gabaritoLine;
  let questionLines = allLines.slice(0, splitAt).filter(l => l.trim());
  const commentLines = allLines.slice(commentStart >= 0 ? commentStart + 1 : splitAt).filter(l => l.trim());

  if (commentStart >= 0 && allLines[commentStart]) {
    const commentIdx = allLines[commentStart].search(/Comentários?\s*:/i);
    const beforeComment = (commentIdx > 0 ? allLines[commentStart].slice(0, commentIdx) : '').trim();
    if (beforeComment) questionLines.push(beforeComment);
  }

  const gabM = GABARITO_RE.exec(allLines[gabaritoLine]);
  const gabRaw = gabM[1];
  const resposta = ['certo', 'correto'].includes(gabRaw.toLowerCase()) ? 'certo' :
                   gabRaw.toLowerCase() === 'errado' ? 'errado' :
                   gabRaw.toUpperCase();
  const tipo = (resposta === 'certo' || resposta === 'errado') ? 'certo_errado' : 'multipla_escolha';

  let enunciado = '';
  let opcoes = null;

  if (tipo === 'multipla_escolha') {
    let optStartIdx = -1;
    for (let i = 0; i < questionLines.length; i++) {
      const l = questionLines[i].trim();
      if (/^[A-Ea-e]\)\s*\S/.test(l) || /^\([A-Ea-e]\)\s*\S/.test(l)) {
        optStartIdx = i;
        break;
      }
    }

    if (optStartIdx > 0) {
      const prevLine = questionLines[optStartIdx - 1] || '';
      const prevHasOpts = /\bA\)\s|\(A\)\s|\ba\)\s/.test(prevLine);
      if (prevHasOpts && optStartIdx >= 1) {
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
      enunciado = '';
      opcoes = parseOptions(questionLines);
    } else {
      const combined = questionLines.join(' ');

      const inlineM = /^(.*?[?:.])\s+([A-E][\s\)].+)$/s.exec(combined);
      if (inlineM) {
        enunciado = inlineM[1];
        opcoes = parseOptions([inlineM[2]]);
      }

      if (!opcoes) {
        const lowerM = /^(.*?[?:.:])\s+(a\).+)$/s.exec(combined);
        if (lowerM && /\bb\)/.test(lowerM[2])) {
          enunciado = lowerM[1];
          opcoes = parseOptions([lowerM[2]]);
        }
      }

      if (!opcoes) {
        const idx = combined.search(/\(A\)\s/);
        if (idx >= 0) {
          enunciado = combined.slice(0, idx).trim();
          const optStr = combined.slice(idx).replace(/\(([A-E])\)/g, '$1)');
          opcoes = parseOptions([optStr]);
        }
      }

      if (!opcoes) {
        const idx = combined.search(/(?<![(\w])A\)\s/);
        if (idx > 0) {
          enunciado = combined.slice(0, idx).trim();
          opcoes = parseOptions([combined.slice(idx)]);
        }
      }

      if (!opcoes) {
        const idx = combined.search(/\ba\)\s/);
        if (idx > 0 && /\bb\)/.test(combined)) {
          enunciado = combined.slice(0, idx).trim();
          opcoes = parseOptions([combined.slice(idx)]);
        }
      }

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

      // Tenta VF: "...texto. AV-V-V-V BV-F-V-V CV-V-F-F DF-V-F-V EF-F-F-F" (sem espaço)
      if (!opcoes) {
        const vfM = /^(.*?\.)\s+([A-E][VF](?:-[VF])+(?:\s+[A-E][VF](?:-[VF])+)+)\s*$/si.exec(combined);
        if (vfM) {
          enunciado = vfM[1].trim();
          const vfParts = vfM[2].split(/\s+(?=[A-E][VF])/i);
          const vfOpts = vfParts.map(p => {
            const m = /^([A-E])(.+)/.exec(p.trim());
            return m ? m[1] + ') ' + m[2].trim() : null;
          }).filter(Boolean);
          if (vfOpts.length >= 3) opcoes = vfOpts;
        }
      }

      if (!opcoes) enunciado = combined;
    }
  } else {
    enunciado = questionLines.join(' ');
  }

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
// Fingerprint = primeiras 100 chars do enunciado normalizado (ignora variações de banca)

const seen = new Set();
const unique = [];
for (const q of parsed) {
  const fp = q.enunciado.substring(0, 100).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!seen.has(fp)) {
    seen.add(fp);
    unique.push(q);
  }
}

// ─── geração de JSON ─────────────────────────────────────────────────────

const questoes = unique.map((q, idx) => {
  const id = 'cg-02b-' + String(idx + 1).padStart(3, '0');
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
  slug: 'aula-02b',
  titulo: 'Aula 02B',
  materia: 'ContG',
  questoes,
};

process.stdout.write(JSON.stringify(output, null, 2));

// ─── diagnóstico para stderr ──────────────────────────────────────────────
const mc_no_opts = questoes.filter(q => q.tipo === 'multipla_escolha' && !q.opcoes);
process.stderr.write(`\nTotal blocos: ${blocks.length}\n`);
process.stderr.write(`Total parsed: ${parsed.length}\n`);
process.stderr.write(`Total questões únicas: ${unique.length}\n`);
process.stderr.write(`MC sem opcoes: ${mc_no_opts.length}\n`);
process.stderr.write(`IDs gerados: cg-02b-001 a cg-02b-${String(unique.length).padStart(3,'0')}\n`);
if (mc_no_opts.length > 0) {
  process.stderr.write('Amostras MC sem opcoes:\n');
  for (const q of mc_no_opts.slice(0, 8)) {
    process.stderr.write(`  L${q._lineN} [${q._section}] Q${q._qNum} [${q.banca}]: ${q.enunciado.substring(0,60)}\n`);
  }
}
