'use strict';
const fs = require('fs');
const path = require('path');

function centerPad(str, width) {
  const pad = width - str.length;
  const left = Math.floor(pad / 2);
  return ' '.repeat(left) + str + ' '.repeat(pad - left);
}

function valPad(str, width) {
  return ' ' + str + ' '.repeat(width - str.length - 1);
}

function buildTable(rows) {
  const c1 = Math.max(...rows.map(r => r[0].length)) + 2;
  const c2 = Math.max(...rows.map(r => r[1].length)) + 2;
  const top = '┌' + '─'.repeat(c1) + '┬' + '─'.repeat(c2) + '┐';
  const sep = '├' + '─'.repeat(c1) + '┼' + '─'.repeat(c2) + '┤';
  const bot = '└' + '─'.repeat(c1) + '┴' + '─'.repeat(c2) + '┘';
  const lines = [top];
  rows.forEach((row, i) => {
    lines.push('│' + centerPad(row[0], c1) + '│' + valPad(row[1], c2) + '│');
    if (i < rows.length - 1) lines.push(sep);
  });
  lines.push(bot);
  return lines.join('\n');
}

const dataDir = path.join(__dirname, '..', 'data', 'contabilidade');

// ============================================================
// aula-01a
// ============================================================
const d01a = JSON.parse(fs.readFileSync(path.join(dataDir, 'aula-01a.json'), 'utf8'));

const q67 = d01a.questoes.find(x => x.id === 'cg-01a-67');
q67.enunciado =
  'O Balanço Patrimonial da empresa Lucro Certo Ltda. apresenta os seguintes saldos:\n\n' +
  buildTable([
    ['Ativo Circulante',      'R$ 305.000'],
    ['Ativo Não Circulante', 'R$ 640.000'],
    ['Passivo Circulante',    'R$ 180.000'],
    ['Passivo Não Circulante','R$ 420.000'],
    ['Patrimônio Líquido',  'R$ 345.000'],
  ]) +
  '\n\nEssa empresa apresenta, em seu Balanço Patrimonial, o total da origem de seus recursos, em reais, no valor correspondente a';

const q86 = d01a.questoes.find(x => x.id === 'cg-01a-86');
q86.enunciado =
  'Analisando as contas abaixo, aponte o item que representa a CORRETA situação patrimonial.\n\n' +
  buildTable([
    ['Caixa',                  'R$ 3.000'],
    ['Aplicações Financeiras', 'R$ 7.000'],
    ['Empréstimos a Pagar',      'R$ 5.000'],
    ['Duplicatas a Pagar',     'R$ 15.000'],
    ['Terrenos',               'R$ 30.000'],
    ['Impostos a Pagar',       'R$ 20.000'],
  ]);

fs.writeFileSync(path.join(dataDir, 'aula-01a.json'), JSON.stringify(d01a, null, 2), 'utf8');
console.log('aula-01a OK (cg-01a-67, cg-01a-86)');

// ============================================================
// aula-02b
// ============================================================
const d02b = JSON.parse(fs.readFileSync(path.join(dataDir, 'aula-02b.json'), 'utf8'));
const patch = (id, fn) => { const q = d02b.questoes.find(x => x.id === id); if (!q) { console.error('NOT FOUND: '+id); return; } q.enunciado = fn(q.enunciado); };

const removeCPF = s => s.replace(/\s*\d{2,3}\s179\s08155932443\s*-\s*Natan\s+Luiz\s+Rodrigues\s+Chaves\s*/g, ' ').trim();

// Simple CPF-only fixes
patch('cg-02b-007', removeCPF);
patch('cg-02b-026', removeCPF);
patch('cg-02b-042', removeCPF);
patch('cg-02b-059', removeCPF);

// cg-02b-010: CPF + table + remove trailing "A R$ 11.000,00"
const q010 = d02b.questoes.find(x => x.id === 'cg-02b-010');
q010.enunciado =
  'Determinada sociedade empresarial apresentou a seguinte relação de contas contábeis e seus respectivos saldos:\n\n' +
  buildTable([
    ['Duplicata Descontada',       'R$ 10.000,00'],
    ['Aluguéis Passivos a Vencer', 'R$ 5.000,00'],
    ['Comissões Ativas',            'R$ 500,00'],
    ['Juros Ativos a Vencer',      'R$ 500,00'],
    ['Comissões Passivas',          'R$ 5.000,00'],
  ]) +
  '\n\nCom base nessas informações, os saldos credores representam um valor de';

// cg-02b-015: CPF + table
const q015 = d02b.questoes.find(x => x.id === 'cg-02b-015');
q015.enunciado =
  'Uma empresa apresenta como extrato de seu Livro Razão a seguinte relação de contas e seus respectivos saldos:\n\n' +
  buildTable([
    ['Depreciação Acumulada',                       'R$ 5.000,00'],
    ['Duplicata Descontada',                         'R$ 3.000,00'],
    ['Ações em tesouraria',                         'R$ 1.000,00'],
    ['Reserva legal',                                'R$ 1.500,00'],
    ['Ajuste de avaliação patrimonial positivo', 'R$ 500,00'],
    ['Caixa e equivalente de caixa',                 'R$ 12.000,00'],
  ]) +
  '\n\nCom base nessas informações, os saldos credores representam um valor de';

// cg-02b-006: CPF + table (10 rows)
const q006 = d02b.questoes.find(x => x.id === 'cg-02b-006');
q006.enunciado =
  'O balancete de verificação é uma peça contábil que permite fazer uma conferência dos saldos das contas patrimoniais e de resultado, antes do fechamento final do balanço patrimonial e da demonstração do resultado do exercício (DRE). Sendo assim, uma pequena loja comercial de alimentos preencheu a tabela a seguir para obter uma amostra das contas com saldo final em dezembro do ano anterior.\n\n' +
  buildTable([
    ['Caixa',                                              'R$ 5.500,00'],
    ['Receita com vendas',                                 'R$ 39.600,00'],
    ['Banco (conta-corrente)',                             'R$ 23.700,00'],
    ['Capital social integralizado',                       'R$ 3.600,00'],
    ['Despesas comerciais',                                'R$ 9.300,00'],
    ['Contas a receber após 365 dias',                     'R$ 33.400,00'],
    ['Fornecedores a pagar em até 90 dias',                'R$ 12.800,00'],
    ['Impostos gerais a recolher',                         'R$ 7.600,00'],
    ['Impostos diversos a recuperar (não circulante)',     'R$ 1.100,00'],
    ['Depreciação acumulada: móveis e utensílios',  'R$ 4.400,00'],
  ]) +
  '\n\nCom base nesse caso hipotético, assinale a alternativa correta quanto às contas com saldo final de natureza devedora.';

// cg-02b-029: CPF + combined big table (15 rows)
const q029 = d02b.questoes.find(x => x.id === 'cg-02b-029');
q029.enunciado =
  'Análise o Balancete de Verificação do exercício de 2015 de uma empresa:\n\n' +
  buildTable([
    ['Depreciação acumulada',                         'R$ 10.000,00'],
    ['Despesas com depreciação',                      'R$ 5.000,00'],
    ['Estoque de mercadorias',                          'R$ 15.000,00'],
    ['ICMS a recolher',                                 'R$ 7.000,00'],
    ['Adiantamento a empregados',                       'R$ 7.000,00'],
    ['Salários e encargos sociais a pagar',              'R$ 35.000,00'],
    ['Reserva de capital ágio na emissão de ações', 'R$ 5.000,00'],
    ['Caixa e equivalentes de caixa',                   'R$ 50.000,00'],
    ['Móveis e utensílios',                              'R$ 20.000,00'],
    ['Despesas de salários e encargos sociais',          'R$ 35.000,00'],
    ['Título a receber',                                  'R$ 5.000,00'],
    ['Máquinas e equipamentos',                           'R$ 7.000,00'],
    ['Custo das mercadorias vendidas',                   'R$ 25.000,00'],
    ['Adiantamento de Cliente',                         'R$ 200.000,00'],
    ['Receita de vendas',                               'R$ 75.000,00'],
  ]) +
  '\n\nCom base nas contas e saldos apresentados, é correto afirmar que o Balancete de Verificação do Exercício de 2015 apresenta saldos contábeis credores no valor de';

// cg-02b-035: CPF + table (14 rows) + fix opcoes
const q035 = d02b.questoes.find(x => x.id === 'cg-02b-035');
q035.enunciado =
  'As contas relacionadas no quadro abaixo, organizadas em ordem alfabética, serão utilizadas na elaboração do balancete do exercício da empresa Mundo dos Sonhos Ltda., em 31/12/2011. O balancete não deverá fechar por motivos didáticos, mas indique a opção que contém a soma dos saldos devedores das contas listadas a seguir.\n\n' +
  buildTable([
    ['Abatimentos sobre Vendas',                          'R$ 1.000,00'],
    ['Adiantamentos para Imobilização',                   'R$ 1.000,00'],
    ['Benfeitorias em Imóveis de Terceiros',                'R$ 1.000,00'],
    ['Capital a Realizar',                                'R$ 1.000,00'],
    ['Construções',                                          'R$ 1.000,00'],
    ['Duplicatas a Pagar de Coligada',                    'R$ 1.000,00'],
    ['Duplicatas Descontadas',                            'R$ 1.000,00'],
    ['Descontos Concedidos',                              'R$ 1.000,00'],
    ['Descontos Obtidos',                                 'R$ 1.000,00'],
    ['Dividendos e Rendimentos de Outros Investimentos',  'R$ 1.000,00'],
    ['Financiamentos de Instituições de Crédito',         'R$ 1.000,00'],
    ['Marcas e Patentes',                                 'R$ 1.000,00'],
    ['Reservas de Lucros',                                'R$ 1.000,00'],
    ['Obras em Andamento',                                'R$ 1.000,00'],
  ]);
q035.opcoes = q035.opcoes.map(o => o.replace(/\s+SALDOS.*$/, '').trim());

fs.writeFileSync(path.join(dataDir, 'aula-02b.json'), JSON.stringify(d02b, null, 2), 'utf8');
console.log('aula-02b OK (CPF x9, tabelas x5, opcoes x1)');

// ============================================================
// aula-04
// ============================================================
const d04 = JSON.parse(fs.readFileSync(path.join(dataDir, 'aula-04.json'), 'utf8'));

const q14 = d04.questoes.find(x => x.id === 'cg-04-014');
q14.enunciado =
  'Um supermercado apresentava os seguintes saldos em 31/12/2023:\n\n' +
  buildTable([
    ['Caixa',                                          'R$40.000'],
    ['Estoque de produtos perecíveis',                 'R$80.000'],
    ['Estoque de produtos não perecíveis',           'R$100.000'],
    ['Contas a receber em até 60 dias',                 'R$120.000'],
    ['Conta corrente no banco',                        'R$150.000'],
    ['Investimentos no banco para resgate em um ano',  'R$170.000'],
  ]) +
  '\n\nAssinale a opção que indica o saldo de Caixa e equivalentes de Caixa, apresentado na Demonstração dos Fluxos de Caixa em 31/12/2023.';

const q19 = d04.questoes.find(x => x.id === 'cg-04-019');
q19.enunciado =
  'Em 31/12/2023, a Cia Lua apresentava os seguintes saldos em seu ativo:\n\n' +
  buildTable([
    ['Aplicações financeiras com vencimento em 720 dias',   'R$70.000'],
    ['Clientes com previsão de recebimento em 380 dias',         'R$60.000'],
    ['Disponibilidades',                                        'R$50.000'],
    ['Estoques com previsão de venda em até 180 dias',           'R$40.000'],
    ['Perdas estimadas com crédito de liquidação duvidosa',  'R$6.000'],
    ['Perdas estimadas com desvalorização de estoque',            'R$8.000'],
  ]) +
  '\n\nAssinale a opção que indica o saldo do ativo circulante em 31/12/2023.';

const q22 = d04.questoes.find(x => x.id === 'cg-04-022');
q22.enunciado =
  'Uma loja apresentava os seguintes dados em seu ativo, em 01/12/2023:\n\n' +
  buildTable([
    ['Disponibilidades',                                        'R$10.000'],
    ['Estoques com previsão de venda em até 6 meses',           'R$40.000'],
    ['Clientes com previsão de recebimento em 18 meses',             'R$50.000'],
    ['Terrenos destinados à valorização',                       'R$60.000'],
    ['Perdas estimadas com crédito de liquidação duvidosa',  'R$500'],
  ]) +
  '\n\nEm dezembro de 2023, a loja constatou que a inadimplência era estimada em 4% e que os estoques tinham perdas estimadas de 10%. Considerando apenas esses fatos, assinale a opção que indica o ativo circulante da loja, em 31/12/2023.';

const q24 = d04.questoes.find(x => x.id === 'cg-04-024');
q24.enunciado =
  'Em 31/12/2022, uma sociedade empresária apresentava as seguintes contas em seus ativos:\n\n' +
  buildTable([
    ['Contas a receber de clientes',                                                          'R$50.000'],
    ['Contas a receber de partes relacionadas, decorrentes de transações operacionais',      'R$45.000'],
    ['Contas a receber de partes relacionadas, não decorrentes de transações operacionais', 'R$30.000'],
  ]) +
  '\n\nOs três recebimentos estavam previstos para março de 2023. No Balanço Patrimonial da sociedade empresária, os saldos do ativo circulante e do ativo realizável a longo prazo, em 31/12/2022, eram, respectivamente, de';

const q27 = d04.questoes.find(x => x.id === 'cg-04-027');
q27.enunciado =
  'Os seguintes saldos são apresentados no balanço patrimonial de uma sociedade empresária, que presta serviços de arquitetura, em 31/12/2023:\n\n' +
  buildTable([
    ['adiantamentos concedidos a acionistas (90 dias)', 'R$30.000'],
    ['disponibilidades',                                'R$50.000'],
    ['empréstimos à sociedade coligada (120 dias)',      'R$70.000'],
    ['clientes (60 dias)',                              'R$80.000'],
    ['terreno utilizado na atividade fim',              'R$90.000'],
  ]) +
  '\n\nAssinale a opção que indica o saldo do ativo realizável a longo prazo da sociedade empresária, em 31/12/2023.';

fs.writeFileSync(path.join(dataDir, 'aula-04.json'), JSON.stringify(d04, null, 2), 'utf8');
console.log('aula-04 OK (cg-04-014, 019, 022, 024, 027)');
