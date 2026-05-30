// Migra campo banca de string combinada para: banca, orgao, cargo, ano, adaptada
const fs = require('fs');
const path = require('path');

const CARGO_PREFIXOS = [
  'ace', 'administrador', 'agente', 'analista', 'assessor', 'assistente', 'auditor',
  'contador', 'consultor', 'controlador',
  'diretor',
  'economista', 'escrivão', 'escriturário', 'especialista',
  'fiscal',
  'inspetor', 'investigador',
  'oficial',
  'perito', 'profissional',
  'supervisor',
  'técnico', 'tesoureiro',
];

const ORGAO_PREFIXOS = [
  'pref.', 'prefeitura', 'cm ', 'câmara',
  'tce', 'trf', 'trt', 'tj ', 'tj-', 'tcm', 'tcu',
  'sefaz', 'seplag', 'seagri', 'ses ', 'sead',
  'mpe ', 'mpu', 'mre',
  'pc ', 'pc-',
  'iss ', 'iss-',
  'uf', 'if ', 'if-',
  'ebserh', 'bacen', 'antt', 'apex', 'bndes', 'petrobras', 'transpetro',
  'cemig', 'copel', 'chesf',
  'cage', 'imbel', 'compesa', 'badesc', 'bandes', 'banestes',
  'rbprev', 'macaeprev', 'funpresp',
  'cfc', 'crf', 'cra ', 'crt ', 'cfm', 'coren', 'cfo',
  'ale', 'alego', 'alema', 'alero', 'alapa', 'alesp', 'al-',
  'sudene', 'algas', 'cegas',
  'itep', 'itep-', 'caern',
];

function isCargo(text) {
  const t = text.toLowerCase().trim();
  return CARGO_PREFIXOS.some(p => t.startsWith(p));
}

function isOrgao(text) {
  const t = text.toLowerCase().trim();
  return ORGAO_PREFIXOS.some(p => t.startsWith(p));
}

function parseBanca(bancaStr) {
  const adaptada = /adaptada/i.test(bancaStr);
  const parts = bancaStr.split('/').map(p => p.trim()).filter(Boolean);
  const result = {};

  if (!parts.length) return result;

  result.banca = parts[0];
  if (parts.length === 1) {
    if (adaptada) result.adaptada = true;
    return result;
  }

  // Detecta ano no último token
  const last = parts[parts.length - 1];
  const yearMatch = last.match(/^(\d{4})/);
  let middle;
  if (yearMatch) {
    result.ano = parseInt(yearMatch[1], 10);
    middle = parts.slice(1, -1);
  } else {
    middle = parts.slice(1);
  }

  if (adaptada) result.adaptada = true;

  if (middle.length === 0) {
    // sem orgao/cargo
  } else if (middle.length === 1) {
    const part = middle[0];
    if (isCargo(part) && !isOrgao(part)) {
      result.cargo = part;
    } else {
      result.orgao = part;
    }
  } else if (middle.length === 2) {
    const [p1, p2] = middle;
    const p1Cargo = isCargo(p1) && !isOrgao(p1);
    const p2Cargo = isCargo(p2) && !isOrgao(p2);
    if (p1Cargo && !p2Cargo) {
      // padrão invertido: cargo/orgao → corrige
      result.orgao = p2;
      result.cargo = p1;
    } else {
      result.orgao = p1;
      result.cargo = p2;
    }
  } else {
    // 3+ partes: primeiro = órgão, resto = cargo (filtra token "adaptada")
    result.orgao = middle[0];
    const cargoPartes = middle.slice(1).filter(p => !/^adaptada$/i.test(p));
    if (cargoPartes.length) result.cargo = cargoPartes.join(' / ');
  }

  return result;
}

function migrarArquivo(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  let alteradas = 0;

  for (let i = 0; i < data.questoes.length; i++) {
    const q = data.questoes[i];
    const bancaStr = typeof q.banca === 'string' ? q.banca : '';
    const parsed = parseBanca(bancaStr);

    // Reconstrói questão com campos na ordem certa
    const nova = { id: q.id };
    if (parsed.banca)   nova.banca   = parsed.banca;
    if (parsed.orgao)   nova.orgao   = parsed.orgao;
    if (parsed.cargo)   nova.cargo   = parsed.cargo;
    if (parsed.ano)     nova.ano     = parsed.ano;
    if (parsed.adaptada) nova.adaptada = true;

    // Demais campos
    for (const [k, v] of Object.entries(q)) {
      if (!(k in nova) && k !== 'banca') nova[k] = v;
    }

    data.questoes[i] = nova;
    alteradas++;
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  return alteradas;
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...walk(full));
    else if (e.name.endsWith('.json')) files.push(full);
  }
  return files;
}

const base = path.join(__dirname, '..', 'data');
let total = 0;
for (const file of walk(base)) {
  const n = migrarArquivo(file);
  total += n;
  console.log(`  ${path.relative(base, file)}: ${n} questões`);
}
console.log(`\nTotal: ${total} questões migradas.`);
