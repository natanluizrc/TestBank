#!/usr/bin/env node
// Valida questões de um arquivo JSON contra o TEC Concursos (API pública).
// Uso: node scripts/validar_web.js data/contabilidade/aula-00.json [--delay <ms>]

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────

const TEC_URL   = 'https://www.tecconcursos.com.br/api/questoes/busca';
const TEC_HDRS  = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'application/json',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'Referer':         'https://www.tecconcursos.com.br/',
};
const SEARCH_WORDS   = 12;   // palavras iniciais do enunciado para a busca
const SEARCH_LIMIT   = 15;   // max resultados por requisição
const DEFAULT_DELAY  = 600;  // ms entre requisições

// Thresholds de classificação (score 0–1)
const SCORE_MATCH = 0.75;    // ✅ match
const SCORE_DIFF  = 0.50;    // ⚠️ diff pequena

// ─── Normalização de bancas (TEC → nosso padrão) ──────────────────────────────

const TEC_BANCA = {
  'Instituto AOCP':        'AOCP',
  'CEBRASPE (CESPE)':      'CEBRASPE',
  'CESPE/UNB':             'CEBRASPE',
  'Cespe/UnB':             'CEBRASPE',
  'CESPE':                 'CEBRASPE',
  'FCC':                   'FCC',
  'FGV':                   'FGV',
  'IBFC':                  'IBFC',
  'IADES':                 'IADES',
  'Consulplan':            'CONSULPLAN',
  'Instituto Consulplan':  'CONSULPLAN',
  'COPS UEL':              'COPS-UEL',
  'VUNESP':                'VUNESP',
  'Quadrix':               'QUADRIX',
  'FEPESE':                'FEPESE',
  'FUNDATEC':              'FUNDATEC',
  'NC-UFPR':               'NC-UFPR',
  'PUC-PR':                'PUC-PR',
  'COPEVE (UFAL)':         'COPEVE',
  'COPEVE UFAL':           'COPEVE',
  'CPCON UEPB':            'UEPB',
  'NC UFPR (FUNPAR)':      'NC-UFPR',
  'NC-UFPR (FUNPAR)':      'NC-UFPR',
  'UFPR (FUNPAR)':         'NC-UFPR',
  'Marinha':               'Marinha do Brasil',
  'CESGRANRIO':            'CESGRANRIO',
  'ESAF':                  'ESAF',
  'COVEST-COPSET':         'COVEST',
  'AMEOSC':                'AMEOSC',
  'Tec Concursos':          null,  // inéditas TEC — ignorar no matching
};

function normBancaTEC(sigla) {
  return Object.prototype.hasOwnProperty.call(TEC_BANCA, sigla) ? TEC_BANCA[sigla] : sigla;
}

// ─── Similaridade de texto (Jaccard por palavras) ─────────────────────────────

const STOP = new Set(['a','o','e','de','do','da','em','no','na','os','as','dos','das',
  'para','que','se','ao','com','um','uma','por','ou','eh','sao','aos','das','nos','nas',
  'seu','sua','seus','suas','este','esta','estes','estas','esse','essa',
  'i','ii','iii','iv','v','vi','vii','viii','ix','x',
]);

function tokens(str) {
  if (!str) return new Set();
  const norm = str.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return new Set(norm.split(' ').filter(w => w.length > 2 && !STOP.has(w)));
}

function jaccard(a, b) {
  const A = tokens(a), B = tokens(b);
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

// ─── Query de busca ───────────────────────────────────────────────────────────

function buildQuery(enunciado) {
  // Usa as primeiras N palavras significativas (com acentos preservados)
  const words = enunciado.replace(/\s+/g, ' ').trim().split(' ')
    .filter(w => w.length > 2)
    .slice(0, SEARCH_WORDS);
  return words.join(' ');
}

// ─── Fetch da API TEC ─────────────────────────────────────────────────────────

async function buscarTEC(query) {
  const url = `${TEC_URL}?busca=${encodeURIComponent(query)}&limit=${SEARCH_LIMIT}`;
  const r = await fetch(url, { headers: TEC_HDRS });
  if (!r.ok) throw new Error(`TEC HTTP ${r.status}`);
  const json = await r.json();
  return json.list ?? [];
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreResultado(qLocal, qTEC) {
  const bancaTEC = normBancaTEC(qTEC.bancaSigla);
  if (bancaTEC === null) return 0; // questão inédita do TEC — descarta

  // Texto do TEC: enunciado já traz as opções concatenadas (comportamento da API)
  // Comparação de texto inclui nossas opções para aumentar a cobertura
  const textoLocal = [qLocal.enunciado, ...(qLocal.opcoes ?? [])].join(' ');
  const simText = jaccard(textoLocal, qTEC.enunciado);

  const bancaOk = bancaTEC && qLocal.banca &&
    tokens(bancaTEC).size > 0 &&
    [...tokens(bancaTEC)].every(w => tokens(qLocal.banca).has(w)) ? 1 :
    (bancaTEC?.toLowerCase() === qLocal.banca?.toLowerCase() ? 1 : 0);

  const anoOk = qLocal.ano && qTEC.concursoAno && qLocal.ano === qTEC.concursoAno ? 1 : 0;

  return simText * 0.70 + bancaOk * 0.20 + anoOk * 0.10;
}

function classificar(score, semResultados) {
  if (semResultados) return 'NAO_ENCONTRADA';
  if (score >= SCORE_MATCH) return 'MATCH';
  if (score >= SCORE_DIFF)  return 'DIFF';
  return 'NAO_ENCONTRADA';
}

// ─── Diff de metadados ────────────────────────────────────────────────────────

// Equivalências orgao: pares conhecidos que são o mesmo órgão com nomes distintos
const ORGAO_EQUIV = new Map([
  ['pf',            'policiafederal'],
  ['policiafederal','policiafederal'],
  ['dpu',           'defensoriapublicadauniao'],
]);

function normId(s) {
  if (!s) return '';
  const base = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[-\s./]/g, '').replace(/[^a-z0-9]/g, '');
  return ORGAO_EQUIV.get(base) ?? base;
}

// Normaliza nome de órgão: remove prefixos como "Pref ", "Câmara de ", "CM " etc.
const RE_ORGAO_PREFIX = /^(prefeitura\s+(de\s+|municipal\s+de\s+|munic\.\s+)?|pref\.?\s+|c[âa]mara\s+(de\s+|municipal\s+de\s+|munic\.\s+)?|cm\s+)/i;

function normOrgao(s) {
  if (!s) return '';
  const sem = s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(RE_ORGAO_PREFIX, '').toLowerCase()
    .replace(/[-\s./]/g, '').replace(/[^a-z0-9]/g, '');
  return ORGAO_EQUIV.get(sem) ?? (ORGAO_EQUIV.get(normId(s)) ?? (sem || normId(s)));
}

function detectarDifs(qLocal, qTEC) {
  const diffs = [];
  const bancaTEC = normBancaTEC(qTEC.bancaSigla);
  if (bancaTEC && qLocal.banca && normId(bancaTEC) !== normId(qLocal.banca))
    diffs.push(`banca: local="${qLocal.banca}" tec="${bancaTEC}"`);
  if (qLocal.ano && qTEC.concursoAno && qLocal.ano !== qTEC.concursoAno)
    diffs.push(`ano: local=${qLocal.ano} tec=${qTEC.concursoAno}`);
  if (qLocal.orgao && qTEC.orgaoSigla) {
    const orgLocal = normOrgao(qLocal.orgao);
    const orgTEC   = normOrgao(qTEC.orgaoSigla);
    const similar  = orgLocal === orgTEC ||
      (orgLocal.length >= 3 && orgTEC.length >= 3 &&
       (orgTEC.startsWith(orgLocal) || orgLocal.startsWith(orgTEC)));
    if (!similar)
      diffs.push(`orgao: local="${qLocal.orgao}" tec="${qTEC.orgaoSigla}"`);
  }
  return diffs;
}

// ─── Cores ANSI ───────────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', gray: '\x1b[90m',
};

function icone(status) {
  if (status === 'MATCH')          return `${C.green}✅${C.reset}`;
  if (status === 'DIFF')           return `${C.yellow}⚠️ ${C.reset}`;
  if (status === 'ERRO')           return `${C.red}❌${C.reset}`;
  /* NAO_ENCONTRADA */             return `${C.gray}🔍${C.reset}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Principal ────────────────────────────────────────────────────────────────

async function validarArquivo(filePath, delayMs) {
  const rel  = path.relative(process.cwd(), filePath);
  const slug = path.basename(filePath, '.json');

  console.log(`\n${C.bold}=== VALIDAÇÃO WEB: ${rel} ===${C.reset}`);

  const data    = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const questoes = data.questoes;
  console.log(`${C.blue}[INFO]${C.reset} ${questoes.length} questões · delay ${delayMs}ms · fonte: TEC Concursos\n`);

  const resultados = [];
  let nMatch = 0, nDiff = 0, nNao = 0, nErro = 0;

  for (let i = 0; i < questoes.length; i++) {
    const q    = questoes[i];
    const qNum = String(i + 1).padStart(3, '0');
    const query = buildQuery(q.enunciado);

    try {
      const tec = await buscarTEC(query);

      let melhor = null, melhorScore = 0;
      for (const t of tec) {
        const s = scoreResultado(q, t);
        if (s > melhorScore) { melhorScore = s; melhor = t; }
      }

      const status = classificar(melhorScore, tec.length === 0);
      const diffs  = melhor ? detectarDifs(q, melhor) : [];

      const resultado = {
        id: q.id, qNum: i + 1, status,
        score: +melhorScore.toFixed(3),
        local: { banca: q.banca, orgao: q.orgao ?? null, cargo: q.cargo ?? null, ano: q.ano ?? null },
        tec: melhor ? {
          id:            melhor.idQuestao,
          banca:         normBancaTEC(melhor.bancaSigla),
          bancaOriginal: melhor.bancaSigla,
          orgao:         melhor.orgaoSigla,
          cargo:         melhor.cargoNome,
          ano:           melhor.concursoAno,
          simEnunciado:  +jaccard([q.enunciado, ...(q.opcoes ?? [])].join(' '), melhor.enunciado).toFixed(3),
          url:           `https://www.tecconcursos.com.br/questoes/cadernos/fazer/1?questoes=${melhor.idQuestao}`,
        } : null,
        diferencas: diffs,
      };

      resultados.push(resultado);

      if (status === 'MATCH')          nMatch++;
      else if (status === 'DIFF')      nDiff++;
      else                             nNao++;

      const difStr = diffs.length ? `  ${C.yellow}[${diffs.join(' | ')}]${C.reset}` : '';
      const simStr = melhor       ? ` ${C.gray}sim=${resultado.tec.simEnunciado}${C.reset}` : '';
      console.log(`  ${icone(status)} Q${qNum} ${q.id}${simStr}${difStr}`);

    } catch (e) {
      nErro++;
      resultados.push({ id: q.id, qNum: i + 1, status: 'ERRO', erro: e.message });
      console.log(`  ${icone('ERRO')} Q${qNum} ${q.id} — ${e.message}`);
    }

    if (i < questoes.length - 1) await sleep(delayMs);
  }

  // ─── Grava relatório JSON ────────────────────────────────────────────────────

  const outDir  = path.join(__dirname, 'validacao');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${slug}-resultado.json`);

  fs.writeFileSync(outFile, JSON.stringify({
    arquivo: rel, slug,
    data: new Date().toISOString(),
    total: questoes.length,
    match: nMatch, diff: nDiff, naoEncontrada: nNao, erros: nErro,
    questoes: resultados,
  }, null, 2) + '\n', 'utf-8');

  // ─── Marca questões validadas no JSON fonte ─────────────────────────────────

  const matchIds   = new Set(resultados.filter(r => r.status === 'MATCH').map(r => r.id));
  const pendIds    = new Set(resultados.filter(r => r.status === 'DIFF' || r.status === 'NAO_ENCONTRADA').map(r => r.id));
  let nTrue = 0, nFalse = 0;
  for (const q of data.questoes) {
    if (matchIds.has(q.id) && !q.validado) { q.validado = true;  nTrue++;  }
    if (pendIds.has(q.id)  && q.validado === undefined) { q.validado = false; nFalse++; }
  }
  if (nTrue + nFalse > 0) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    console.log(`\n${C.blue}[INFO]${C.reset} ${nTrue} confirmadas (true) · ${nFalse} pendentes (false) em ${rel}`);
  }

  // ─── Sumário ────────────────────────────────────────────────────────────────

  const taxa = questoes.length ? Math.round(nMatch * 100 / questoes.length) : 0;
  console.log(`\n${C.gray}── Sumário ──${C.reset}`);
  console.log(`  Total ${questoes.length}  ·  ✅ ${nMatch} (${taxa}%)  ·  ⚠️  ${nDiff}  ·  🔍 ${nNao}  ·  ❌ ${nErro}`);
  console.log(`  Relatório: ${path.relative(process.cwd(), outFile)}`);
}

// ─── Ponto de entrada ─────────────────────────────────────────────────────────

const args      = process.argv.slice(2);
const filePath  = args.find(a => !a.startsWith('--'));
const dIdx      = args.indexOf('--delay');
const delayMs   = dIdx >= 0 ? (parseInt(args[dIdx + 1]) || DEFAULT_DELAY) : DEFAULT_DELAY;

if (!filePath) {
  console.error('Uso: node scripts/validar_web.js <arquivo.json> [--delay <ms>]');
  process.exit(1);
}

const abs = path.resolve(filePath);
if (!fs.existsSync(abs)) {
  console.error(`Arquivo não encontrado: ${abs}`);
  process.exit(1);
}

validarArquivo(abs, delayMs).catch(e => {
  console.error('Erro fatal:', e.message);
  process.exit(1);
});
