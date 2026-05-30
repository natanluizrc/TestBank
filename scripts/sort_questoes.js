// Re-ordena as questões de todos os arquivos em data/ conforme critério padrão:
// 1. banca A→Z  2. orgao A→Z (ausente vai ao final)  3. cargo A→Z (ausente vai ao final)
// 4. ano decrescente (ausente vai ao final)  5. multipla_escolha antes certo_errado
// 6. dificuldade crescente
const fs   = require('fs');
const path = require('path');

const TIPO_ORDER = { multipla_escolha: 0, certo_errado: 1 };

function cmpNull(a, b, desc = false) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
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
  r = cmpNull(a.ano ?? null, b.ano ?? null, true);
  if (r !== 0) return r;
  r = (TIPO_ORDER[a.tipo] ?? 99) - (TIPO_ORDER[b.tipo] ?? 99);
  if (r !== 0) return r;
  return (a.dificuldade ?? 99) - (b.dificuldade ?? 99);
}

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(d, e.name))
    : e.name.endsWith('.json') ? [path.join(d, e.name)] : []
  );
}

const dataDir = path.join(__dirname, '..', 'data');
let total = 0;

for (const file of walk(dataDir)) {
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const antes = JSON.stringify(data.questoes.map(q => q.id));
  data.questoes.sort(compareQuestoes);
  const depois = JSON.stringify(data.questoes.map(q => q.id));
  if (antes !== depois) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    console.log('  re-ordenado: ' + path.relative(dataDir, file));
    total++;
  }
}

console.log('\nArquivos re-ordenados: ' + total);
