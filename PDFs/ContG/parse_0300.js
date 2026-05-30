#!/usr/bin/env node
/**
 * Parser for ContG_0300.pdf — Apuração do Resultado
 * Outputs: aula-03a.json (FCC), aula-03b.json (FGV), aula-03c.json (MULTIBANCAS)
 */

const fs   = require('fs');
const path = require('path');

const raw   = fs.readFileSync(path.join(__dirname, 'ContG_0300_extracted.txt'), 'utf8');
const lines = raw.split('\n');

// ─── 1. Remove noise lines ─────────────────────────────────────────────────
const NOISE = [
  /^Luciano Rosa,\s*Júlio Cardozo\s*Aula 03\s*$/,
  /^08155932443\s*-\s*Natan Luiz Rodrigues Chaves\s*$/,
  /^Concursos Contábeis\s*-\s*Contabilidade Geral\s*-\s*Curso Regular\s*$/,
  /^\d{1,3}\s*$/, // standalone page numbers
];
const cleaned = lines.filter(l => !NOISE.some(re => re.test(l.trim()))).join('\n');

// ─── 2. Split sections ─────────────────────────────────────────────────────
const HDR_FCC   = 'QUESTÕES COMENTADAS APURAÇÃO DO RESULTADO FCC';
const HDR_FGV   = 'QUESTÕES COMENTADAS APURAÇÃO DO RESULTADO FGV';
const HDR_MULTI = 'QUESTÕES COMENTADAS APURAÇÃO DO RESULTADO MULTIBANCAS';

const iFCC   = cleaned.indexOf(HDR_FCC);
const iFGV   = cleaned.indexOf(HDR_FGV);
const iMULTI = cleaned.indexOf(HDR_MULTI);

const textFCC   = cleaned.slice(iFCC   + HDR_FCC.length,   iFGV);
const textFGV   = cleaned.slice(iFGV   + HDR_FGV.length,   iMULTI);
const textMULTI = cleaned.slice(iMULTI + HDR_MULTI.length);

// ─── 3. Collapse whitespace + fix mid-line question starts ────────────────
function collapse(text) {
  let t = text.replace(/\r/g, '');
  // Move mid-line question starts "... 9. (FCC/..." to their own line
  t = t.replace(/([^\n])(\s+)(\d{1,3}\.\s+\()/g, (_, before, sp, qstart) => {
    // Only break if it looks like a question start (digit-dot-space-paren)
    return `${before}\n${qstart}`;
  });
  t = t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

// ─── 4. Split text into question blocks ───────────────────────────────────
// A question starts with "N. (" or "N. UPPERCASE-WORD" at start of line
function splitBlocks(text) {
  const norm = collapse(text);
  // Regex: beginning of line, 1-3 digits, dot, space, then ( or capital letter
  const re = /(?:^|\n)(\d{1,3})\.\s+(?=\(|[A-ZÁÉÍÓÚÀÂÊÔÃÕ])/g;
  const starts = [];
  let m;
  while ((m = re.exec(norm)) !== null) {
    const pos = m.index + (m[0].startsWith('\n') ? 1 : 0);
    starts.push({ num: parseInt(m[1]), pos });
  }

  // Deduplicate: keep only first occurrence of each question number
  const seen  = new Set();
  const unique = [];
  for (const s of starts) {
    if (!seen.has(s.num)) { seen.add(s.num); unique.push(s); }
  }

  const blocks = [];
  for (let i = 0; i < unique.length; i++) {
    const { num, pos } = unique[i];
    const end = i + 1 < unique.length ? unique[i + 1].pos : norm.length;
    blocks.push({ num, text: norm.slice(pos, end).trim() });
  }
  return blocks;
}

// ─── 5. Extract gabarito ──────────────────────────────────────────────────
function findGabarito(text) {
  if (!text) return null;
  // "Gabarito: X" or "Gabarito: X."
  let m = text.match(/Gabarito:\s*([A-Ea-e])\.?\s/i) ||
          text.match(/Gabarito:\s*([A-Ea-e])\.?$/im);
  if (m) return m[1].toUpperCase();
  // "nosso gabarito é a alternativa B" / "gabarito é a letra e" / "gabarito é letra d"
  m = text.match(/gabarito\s+(?:da[^é]*)?(?:é|e)\s+(?:a\s+)?(?:alternativa|letra|opção)?\s*(?:\()?([a-e])(?:\))?/i);
  if (m) return m[1].toUpperCase();
  // "gabarito é a letra D" or "gabarito é letra D"
  m = text.match(/gabarito[^.]*\s([a-e])[\s.]/i);
  if (m && /[a-e]/i.test(m[1])) return m[1].toUpperCase();
  // "O gabarito é a letra e." standalone
  m = text.match(/\bgabarito\b[^.]*[^\w]([a-e])[\s.]/i);
  if (m) return m[1].toUpperCase();
  return null;
}

// ─── 6. Extract options ───────────────────────────────────────────────────
// Handles multiple formats:
//  (A) text (B) text  |  A) text B) text  |  A text\nB text  |  a) text  |  A text. B text.
function extractOptions(text) {
  let t = text;

  // ── Normalise to (X) format ─────────────────────────────────────────────
  // Step 1: Lines starting with "A text" or "A) text" (multi-line, no/closing paren)
  t = t.replace(/\n([A-E])\) /g, '\n($1) ');
  t = t.replace(/\n([A-E]) ([^\n(]+)/g, '\n($1) $2');
  // Step 1b: Inline bare-letter "A text B text" — convert the first "A" when "B" follows
  // within 100 chars (short enough to avoid matching sentence-initial "A empresa B...")
  t = t.replace(/(?<=[\s:;.!?])A (?=.{1,100}?\s+B )/g, '(A) ');

  // Step 2: Inline "A) text B) text" or "a) text b) text"
  t = t.replace(/(?<=[.!?)\s])([A-Ea-e])\) /g, '($1) ');

  // Step 3: After an already-converted (X), convert bare "Y text" continuation
  // Uses greedy "stop before next option" to avoid matching B/C/E inside words
  for (let i = 0; i < 5; i++) {
    const before = t;
    // For each already-converted option, find the next letter that follows
    // the option text (stopping at next already-converted option or end)
    t = t.replace(
      /\(([A-E])\) ((?:(?!\([A-E]\)|\s+[B-E] )[^\n])+)(?:\s+)([B-E]) /g,
      (match, curLetter, curText, nextLetter, offset, str) => {
        if (nextLetter.charCodeAt(0) !== curLetter.charCodeAt(0) + 1) return match;
        // Skip if nextLetter is accounting Débito/Crédito notation (D= C= D- C-)
        const afterMatch = str.slice(offset + match.length);
        if (/^[=\-]/.test(afterMatch)) return match;
        return `(${curLetter}) ${curText} (${nextLetter}) `;
      }
    );
    if (t === before) break;
  }

  // ── Try to find options in (X) format ───────────────────────────────────
  const tryExtract = (src) => {
    const opts = {};
    const re = /\(([A-Ea-e])\)\s+(.+?)(?=\s*\([A-Ea-e]\)|$)/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const k = m[1].toUpperCase();
      if (!opts[k]) opts[k] = m[2].replace(/\s+/g, ' ').trim();
    }
    if (opts['A'] && opts['B'] && Object.keys(opts).length >= 2) return opts;

    // Multiline fallback
    const ml = {};
    const mlRe = /^\s*\(([A-Ea-e])\)\s+(.+)/gm;
    while ((m = mlRe.exec(src)) !== null) {
      const k = m[1].toUpperCase();
      if (!ml[k]) ml[k] = m[2].replace(/\s+/g, ' ').trim();
    }
    if (ml['A'] && ml['B'] && Object.keys(ml).length >= 2) return ml;
    return null;
  };

  // Try with the normalised text (flatten newlines for inline)
  const flat = t.replace(/\n/g, ' ');
  return tryExtract(t) || tryExtract(flat);
}

// ─── 7. Split question/commentary ─────────────────────────────────────────
function splitCommentary(text) {
  // Look for "Comentários" or "Comentários:" with a newline before it
  const idx = text.search(/\nComentários?:?\s*(\n|$)/i);
  if (idx !== -1) {
    return {
      qPart: text.slice(0, idx).trim(),
      rawComment: text.slice(idx).trim(),
    };
  }
  // Inline "Comentários:"
  const idx2 = text.search(/\s+Comentários?:?\s/i);
  if (idx2 !== -1) {
    return {
      qPart: text.slice(0, idx2).trim(),
      rawComment: text.slice(idx2).trim(),
    };
  }
  return { qPart: text, rawComment: '' };
}

// ─── 8. Parse banca from question header ──────────────────────────────────
function parseBanca(header) {
  // "N. (BANCA/INFO/ANO) rest"
  let m = header.match(/^\d+\.\s+\(([^)]+)\)\s*([\s\S]*)/);
  if (m) return { banca: m[1].trim(), body: m[2].trim() };
  // "N. BANCA/INFO)" — missing opening paren
  m = header.match(/^\d+\.\s+([^)]+\))\s*([\s\S]*)/);
  if (m) return { banca: m[1].replace(/\)$/, '').trim(), body: m[2].trim() };
  // "N. text" — no banca
  m = header.match(/^\d+\.\s+([\s\S]*)/);
  if (m) return { banca: '', body: m[1].trim() };
  return { banca: '', body: header };
}

// ─── 9. Build enunciado (strip options from body) ─────────────────────────
function buildEnunciado(body, optsObj) {
  if (!optsObj) return body.replace(/\s+/g, ' ').trim();

  // Find where options start: look for explicit option marker (A)/(a)/A)/a)
  // Use case-insensitive match, require word boundary before the letter
  const firstA = body.search(/\(A\)|\(a\)|\bA\)\s|\ba\)\s/);
  if (firstA !== -1) return body.slice(0, firstA).replace(/\s+/g, ' ').trim();

  // Fallback: find option text directly
  const firstOptText = Object.values(optsObj)[0];
  if (firstOptText) {
    const idx = body.indexOf(firstOptText);
    if (idx > 0) {
      // Walk back past any option marker before the text
      const marker = body.slice(Math.max(0, idx - 6), idx);
      const startIdx = idx - (marker.match(/\s*[\[(]?[Aa][)\]]?\s*$/) || [''])[0].length;
      return body.slice(0, startIdx > 0 ? startIdx : idx).replace(/\s+/g, ' ').trim();
    }
  }

  return body.replace(/\s+/g, ' ').trim();
}

// ─── 10. Clean commentary ─────────────────────────────────────────────────
function cleanComentario(raw) {
  return raw
    .replace(/^Comentários?:?\s*/i, '')
    .replace(/\nGabarito:.*$/gim, '')
    .replace(/\nO gabarito[^\n]*/gim, '')
    .replace(/\ngabarito[^\n]*/gim, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── 11. Dificuldade ──────────────────────────────────────────────────────
function getDificuldade(comentario) {
  const words = (comentario || '').split(' ').length;
  if (words > 200) return 4;
  if (words > 100) return 3;
  return 2;
}

// ─── 12. Process one section ──────────────────────────────────────────────
function processSection(text, suffix, titulo) {
  const blocks  = splitBlocks(text);
  const questoes = [];
  let seq = 0;

  for (const { num, text: blockText } of blocks) {
    seq++;
    const { qPart, rawComment } = splitCommentary(blockText);
    const { banca, body }       = parseBanca(qPart);

    // Find gabarito (search both sides)
    const gabLetter = findGabarito(rawComment) || findGabarito(qPart);

    // Detect options
    const optsObj = extractOptions(qPart);
    const hasOpts = optsObj && Object.keys(optsObj).length >= 2;

    let tipo, opcoes, resposta;

    if (hasOpts) {
      tipo    = 'multipla_escolha';
      const keys = Object.keys(optsObj).sort();
      opcoes  = keys.map(k => `${k}) ${optsObj[k]}`);
      resposta = gabLetter || '?';
    } else if (gabLetter && !['C','E'].includes(gabLetter.toUpperCase())) {
      // Gabarito is A/B/D — definitely multiple choice, options just not parsed
      tipo    = 'multipla_escolha';
      opcoes  = null; // will flag for review
      resposta = gabLetter;
    } else {
      tipo = 'certo_errado';
      if (gabLetter) {
        const g = gabLetter.toUpperCase();
        if      (g === 'C') resposta = 'certo';
        else if (g === 'E') resposta = 'errado';
        else                resposta = '?';
      } else {
        resposta = '?';
      }
    }

    const enunciado  = buildEnunciado(body, optsObj);
    const comentario = cleanComentario(rawComment);
    const id         = `cg-03${suffix}-${String(seq).padStart(3, '0')}`;

    const q = {
      id,
      banca: banca || 'Desconhecida',
      tipo,
      enunciado,
      resposta,
      comentario,
      dificuldade: getDificuldade(comentario),
    };
    if (tipo === 'multipla_escolha' && opcoes) q.opcoes = opcoes;

    questoes.push(q);
  }

  return { slug: `aula-03${suffix}`, titulo, materia: 'ContG', questoes };
}

// ─── 13. Generate files ───────────────────────────────────────────────────
const secFCC   = processSection(textFCC,   'a', 'Aula 03A');
const secFGV   = processSection(textFGV,   'b', 'Aula 03B');
const secMULTI = processSection(textMULTI, 'c', 'Aula 03C');

const OUT = path.join(__dirname);
fs.writeFileSync(path.join(OUT, 'aula-03a-raw.json'), JSON.stringify(secFCC,   null, 2));
fs.writeFileSync(path.join(OUT, 'aula-03b-raw.json'), JSON.stringify(secFGV,   null, 2));
fs.writeFileSync(path.join(OUT, 'aula-03c-raw.json'), JSON.stringify(secMULTI, null, 2));

for (const sec of [secFCC, secFGV, secMULTI]) {
  console.log(`${sec.slug}: ${sec.questoes.length} questões`);
  const issues = sec.questoes.filter(q =>
    q.resposta === '?' ||
    !q.enunciado || q.enunciado.length < 10 ||
    (q.tipo === 'multipla_escolha' && !q.opcoes)
  );
  if (issues.length) {
    console.log(`  ⚠ ${issues.length} issue(s):`);
    issues.forEach(q => {
      const flag = [
        q.resposta === '?' && 'sem resposta',
        (!q.enunciado || q.enunciado.length < 10) && 'enunciado vazio',
        (q.tipo === 'multipla_escolha' && !q.opcoes) && 'sem opcoes',
      ].filter(Boolean).join(', ');
      console.log(`    ${q.id}  [${flag}]  banca:${q.banca}  enunciado:${q.enunciado?.slice(0,60)}`);
    });
  }
}
