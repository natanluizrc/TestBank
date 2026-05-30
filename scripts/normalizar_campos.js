// Normaliza bancas, órgãos e cargos inconsistentes + corrige erros de dados pontuais
const fs = require('fs'), path = require('path');

// ─── Mapas de normalização ────────────────────────────────────────────────────

const BANCA_MAP = {
  'Cebraspe':               'CEBRASPE',
  'Consulplan':             'CONSULPLAN',
  'Instituto Consulplan':   'CONSULPLAN',
  'INSTITUTO CONSULPLAN':   'CONSULPLAN',
  'COPS UEL':               'COPS-UEL',
  'INSTITUTO ACCESS':       'Instituto ACCESS',
  'INSTITUTO VERBENA':      'Instituto Verbena',
  'Instituto AOCP':           'AOCP',
  'Instituto AOCP - Ana Leg': 'AOCP',
};

const ORGAO_MAP = {
  'ALE-TO':                     'AL-TO',
  'ALETO':                      'AL-TO',
  'AL MT':                      'AL-MT',
  'Assembleia Legislativa da Bahia': 'AL-BA',
  'CAGE RS':                    'CAGE-RS',
  'CM-Quitandinha':             'CM Quitandinha',
  'CM Dores RP':                'CM Dores do Rio Preto',
  'CRBIO 08':                   'CRBio 08',
  'DESENVOLVE SP':              'Desenvolvesp',
  'DPE SP':                     'DPE-SP',
  'EBSERH-UFJF':                'EBSERH',
  'Hemocentro':                 'HEMOCENTRO DF',
  'INNOVA':                     'Innova',
  'ISS CARIACICA ES':           'ISS Cariacica ES',
  'ITEP RN':                    'ITEP-RN',
  'Liquigas':                   'LIQUIGÁS',
  'MP SP':                      'MP-SP',
  'MPE AL':                     'MPE-AL',
  'MPE MS':                     'MPE-MS',
  'MPE RN':                     'MPE-RN',
  'MPE RO':                     'MPE-RO',
  'MPE TO':                     'MPE-TO',
  'MPE-MA':                     'MPE-MA',   // já correto, aqui por clareza
  'NOSSA CAIXA':                'Nossa Caixa',
  'Pauliprev':                  'PAULIPREV',
  'Petrobras':                  'PETROBRAS',
  'Petrobrás':                  'PETROBRAS',
  'PF':                         'Polícia Federal',
  'Policia Federal':            'Polícia Federal',
  'SEFAZ CE':                   'SEFAZ-CE',
  'SEFAZ MA':                   'SEFAZ-MA',
  'Transpetro':                 'TRANSPETRO',
  'TRF 2ª Região':              'TRF-2',
  'TRF-2':                      'TRF-2',
  'TRF 3ª Região':              'TRF-3',
  'TRF 4':                      'TRF-4',
  'TRF 4ª':                     'TRF-4',
  'TRF 4ª Região':              'TRF-4',
  'TRF 6':                      'TRF-6',
  'TRF-6ª Região':              'TRF-6',
  'TRT 3':                      'TRT-3',
  'TRT-3':                      'TRT-3',
  'TRT-3ª Região':              'TRT-3',
  'TRT 20ª Região':             'TRT-20',
  'TRT 21ª Região':             'TRT-21',
  'TRT-21':                     'TRT-21',
  'TRT 22ª Região':             'TRT-22',
  'TRT 24ª Região':             'TRT-24',
  // Padronização de notação (detectadas 2026-05-30)
  'CAU BR':                     'CAU-BR',
  'PC DF':                      'PC-DF',
  'SEFAZ AC':                   'SEFAZ-AC',
  'SEPLAG CE':                  'SEPLAG-CE',
  'DPE RO':                     'DPE-RO',
  'TCE RJ':                     'TCE-RJ',
  'Prefeitura de Caraguatatuba':'Pref. Caraguatatuba',
  'Câmara Municipal de Aracaju':'CM Aracaju',
  'CM COTIA':                   'CM Cotia',
  'Câmara de Cotia':            'CM Cotia',
};

const CARGO_MAP = {
  'CONTADOR':                       'Contador',
  'TÉCNICO CONTÁBIL':               'Técnico Contábil',
  'TÉCNICO CONTABILIDADE':          'Técnico Contabilidade',
  'FISCAL DE TRIBUTOS MUNICIPAIS':  'Fiscal de Tributos Municipais',
  'Contabilidade / adaptada':       'Contabilidade',  // adaptada já é campo separado
  // Padronização de notação (detectadas 2026-05-30)
  'Analista Judiciário Contabilidade':  'Analista Judiciário - Contabilidade',
  'Analista / Processos Contábeis':     'Analista de Processos - Contabilidade',
  'Analista de Processos Contábeis':    'Analista de Processos - Contabilidade',
  'Técnico-Financeiro':                 'Técnico Financeiro',
  'Analista Legislativo Contabilidade': 'Analista Legislativo - Contabilidade',
  'Analista Legislativo / Contabilidade':'Analista Legislativo - Contabilidade',
};

// ─── Correções pontuais por ID ────────────────────────────────────────────────
// orgao/cargo trocados por sigla de estado ou dados mal estruturados

const ID_FIXES = {
  // FGV/ACI/Recife/2014 → ACI é orgao em Recife, sem cargo identificado
  'cg-00-07':  { orgao: 'ACI Recife',     cargo: null },
  // IADES/Hemocentro/DF/2017 → Hemocentro DF, sem cargo identificado
  'cg-00-42':  { orgao: 'HEMOCENTRO DF',  cargo: null },
  // FGV/Exame de Suficiência/RS/2024.1 → RS era sufixo regional
  'cg-01b-28': { orgao: 'Exame de Suficiência', cargo: null },
  // CEBRASPE/PC RO Escrivão de Polícia Civil/2022 → cargo embutido no orgao
  'cg-02a-089':{ orgao: 'PC RO',          cargo: 'Escrivão de Polícia Civil' },
  // FCC/DP/SP/2009 → DP/SP = DPE-SP
  'cg-03-028': { orgao: 'DPE-SP',         cargo: null },
  'cg-03-029': { orgao: 'DPE-SP',         cargo: null },
  // FGV/INEA/RJ Contador/2013 → "RJ" era prefixo de estado, cargo=Contador
  'cg-03-067': { orgao: 'INEA',           cargo: 'Contador' },
  // IBFC/Tec. Contador/MGS/2019 → orgao e cargo trocados
  'cg-03-095': { orgao: 'MGS',            cargo: 'Técnico Contábil' },
  // PUC-PR/Contador - DPE/PR/2012 → PR era sufixo de estado
  'cg-03-118': { orgao: 'DPE-PR',         cargo: 'Contador' },
  // PUC-PR/Contador Júnior - COHAPAR/PR/2011 → COHAPAR é o orgao
  'cg-03-122': { orgao: 'COHAPAR',        cargo: 'Contador Júnior' },
  'cg-03-123': { orgao: 'COHAPAR',        cargo: 'Contador Júnior' },
  'cg-03-124': { orgao: 'COHAPAR',        cargo: 'Contador Júnior' },
};

// ─── Correção especial: COPEVE ALGÁS → banca=COPEVE, orgao=ALGÁS ─────────────
const BANCA_SPLIT = {
  'COPEVE ALGÁS': { banca: 'COPEVE', orgao: 'ALGÁS' },
  // COPEVE UFAL e COPEVE IF AL são bancas consolidadas — mantidas como estão
};

// ─── Instituto AOCP - Ana Leg → cargo="Analista Legislativo" ─────────────────
// (cg-02a-052: orgao="Contabilidade" deve virar cargo, sem orgao)

// ─── Execução ─────────────────────────────────────────────────────────────────

const dir = path.join(__dirname, '..', 'data');
let total = 0;

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(d, e.name))
    : e.name.endsWith('.json') ? [path.join(d, e.name)] : []
  );
}

for (const file of walk(dir)) {
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  let changed = false;

  for (const q of data.questoes) {
    // 1. Correções pontuais por ID
    if (ID_FIXES[q.id]) {
      const fix = ID_FIXES[q.id];
      if ('orgao' in fix) { q.orgao = fix.orgao || undefined; changed = true; }
      if ('cargo' in fix) { q.cargo = fix.cargo || undefined; changed = true; }
    }

    // 2. Split de banca composta
    if (q.banca && BANCA_SPLIT[q.banca]) {
      const s = BANCA_SPLIT[q.banca];
      q.banca = s.banca;
      if (!q.orgao) q.orgao = s.orgao;
      changed = true;
    }

    // 3. Normalização de banca
    if (q.banca && BANCA_MAP[q.banca]) {
      q.banca = BANCA_MAP[q.banca];
      changed = true;
    }

    // 4. Normalização de orgao
    if (q.orgao && ORGAO_MAP[q.orgao]) {
      q.orgao = ORGAO_MAP[q.orgao];
      changed = true;
    }

    // 5. Normalização de cargo
    if (q.cargo && CARGO_MAP[q.cargo]) {
      q.cargo = CARGO_MAP[q.cargo];
      changed = true;
    }

    // 6. AOCP - Ana Leg: orgao="Contabilidade" deve ser cargo (antes: "Instituto AOCP")
    if (q.banca === 'AOCP' && q.orgao === 'Contabilidade' && !q.cargo) {
      q.cargo = 'Analista Legislativo / Contabilidade';
      q.orgao = undefined;
      changed = true;
    }

    // Remove campos undefined
    if (q.orgao === undefined) delete q.orgao;
    if (q.cargo === undefined) delete q.cargo;
  }

  if (changed) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    total++;
    console.log('  ' + path.relative(dir, file));
  }
}

console.log('\nArquivos alterados: ' + total);
