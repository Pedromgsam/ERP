// Testes do importador contra planilhas fictícias no formato real.
const ExcelJS = require('exceljs'), path = require('path'), os = require('os'), fs = require('fs');
const IMP = require('../app/importador.js');
const fic = require('./planilhas-ficticias.js');
const r = []; const ok = (n, c) => r.push([n, !!c]);
async function ler(arq) { const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(arq); return IMP.lerWorkbook(wb); }
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'imp-'));
  await fic.baseDeDados(dir + '/b.xlsx'); await fic.financeiro(dir + '/f.xlsx'); await fic.contabilidade(dir + '/c.xlsx');

  // conversões
  ok('número BR com R$', IMP.numero('R$ 2.656,50') === 2656.5);
  ok('número negativo', IMP.numero('-R$ 1.500,00') === -1500);
  ok('traço vira vazio', IMP.numero('-') === null && IMP.texto('-') === '');
  ok('milhar sem vírgula', IMP.numero('20.000.000') === 20000000);
  ok('data dd/mm/aaaa', IMP.dataISO('10/08/2026') === '2026-08-10');
  ok('dia além do mês corrige', IMP.dataISO('31/11/2025') === '2025-11-30');
  ok('SIM/NÃO', IMP.simNao('SIM') === true && IMP.simNao('NÃO') === false && IMP.simNao('') === null);

  // base de dados
  const b = IMP.importar(await ler(dir + '/b.xlsx'));
  ok('reconhece a Base de Dados', b.tipo === 'base');
  ok('importa 5 clientes (1 repetido e 1 sem nome ignorados)', b.clientes.length === 5);
  ok('avisa o repetido e o sem nome', b.avisos.some((a) => /repetido/.test(a)) && b.avisos.some((a) => /sem nome/.test(a)));
  const alfa = b.clientes.find((c) => c.nome === 'Alfa Comércio LTDA');
  ok('SENHA NÃO É IMPORTADA', !JSON.stringify(b.clientes).includes('SenhaSecreta'));
  ok('débitos numéricos', alfa.rfb === 1500.5 && alfa.pgfn === 250000);
  ok('CPF/CNPJ só dígitos', alfa.cpf_cnpj === '11222333000181');
  ok('procuração/certificado SIM/NÃO', alfa.procuracao === true && alfa.certificado === false);
  const ana = b.clientes.find((c) => c.nome === 'Ana Alfa');
  ok('"-" vira vazio e "R$ 3.222,56" em texto vira número', ana.rfb === null && ana.pgfn === 3222.56 && ana.socio_admin === '');
  ok('tipo vem da aba', b.clientes.find((c) => c.nome === 'Gama Têxtil LTDA').tipo === 'Demanda' && b.clientes.find((c) => /Épsilon/.test(c.nome)).tipo === 'Inativo');
  const eps = b.clientes.find((c) => /Épsilon/.test(c.nome));
  ok('Estado inválido ("Inativo") descartado; migração lida', eps.estado === '' && eps.data_migracao === '2026-06-04' && eps.historico_cadastral.startsWith('Situação'));
  ok('Cadastro Regular e SEFAZ na aba Demanda', b.clientes.find((c) => c.nome === 'Gama Têxtil LTDA').cadastro_regular === false && b.clientes.find((c) => c.nome === 'Gama Têxtil LTDA').sefaz_mg === 5000);
  ok('grupos coletados', ['Grupo Alfa', 'Grupo Beta', 'Gama', 'Épsilon'].every((g) => b.grupos.includes(g)));

  // financeiro do escritório
  const f = IMP.importar(await ler(dir + '/f.xlsx'));
  ok('reconhece o Financeiro do escritório', f.tipo === 'financeiro' && f.lancamentos.every((l) => l.empresa === 'escritorio'));
  ok('9 lançamentos (6 a receber + 2 recebidos + 1 prejuízo)', f.lancamentos.length === 9);
  const cob = f.lancamentos.find((l) => l.valor === 1061.46);
  ok('"COBRADO" vira situação de cobrança, não data', cob.cobranca === 'Cobrado' && !cob.pago && cob.data_pagamento === null);
  const prev = f.lancamentos.find((l) => l.valor === 3000);
  ok('data futura sem pagamento vira previsão; cheque vira forma', prev.cobranca === 'Previsão: 30/09/2026' && prev.forma_pagamento === 'Cheque' && !prev.pago);
  const com = f.lancamentos.find((l) => l.valor === 1500);
  ok('valor negativo vira despesa (comissão)', com.tipo === 'despesa' && com.descricao === 'Comissão Marcelo');
  ok('"Emitir Guia" preservado', f.lancamentos.find((l) => l.valor === 486.3).cobranca === 'Emitir guia');
  const dup = f.lancamentos.filter((l) => l.valor === 486.3);
  ok('linhas idênticas viram 2 lançamentos com chaves diferentes', dup.length === 2 && dup[0].chave_importacao !== dup[1].chave_importacao);
  const pago = f.lancamentos.find((l) => l.valor === 2656.5);
  ok('Receita = pago com data de pagamento', pago.pago && pago.data_pagamento === '2025-12-11');
  ok('Prejuízo = perda', f.lancamentos.find((l) => l.valor === 910.8).perda === true);
  ok('descrição com referência', f.lancamentos.find((l) => l.valor === 1134.7).descricao === 'Consultoria (0,7 salário)');
  ok('chave PIX guardada', f.lancamentos.find((l) => l.valor === 1134.7).chave_pix === '115.000.000-00');

  // reimportação: a mesma linha que sai de "A Receber" e vai para "Receita" mantém a chave
  const k1 = f.lancamentos.find((l) => l.valor === 1134.7).chave_importacao;
  ok('chave não depende da aba (A Receber → Receita atualiza o mesmo registro)', !/receber|receita/i.test(k1.split('#')[0].split(':').slice(3).join(':')) && k1.startsWith('fin:escritorio:receita:'));

  // contabilidade
  const c = IMP.importar(await ler(dir + '/c.xlsx'));
  ok('reconhece a Contabilidade', c.tipo === 'contabilidade' && c.lancamentos.every((l) => l.empresa === 'contabilidade'));
  ok('A Pagar e Despesa com fornecedor', c.lancamentos.filter((l) => l.tipo === 'despesa' && l.favorecido).length === 2);
  ok('despesa paga com forma de pagamento', c.lancamentos.find((l) => l.favorecido === 'Fernando').pago && c.lancamentos.find((l) => l.favorecido === 'Fernando').forma_pagamento === 'PIX');
  ok('comissão negativa vira despesa na contabilidade', c.lancamentos.find((l) => l.valor === 2336.75).tipo === 'despesa');

  // planilha desconhecida
  ok('planilha desconhecida é recusada com mensagem', IMP.importar({ abas: { Planilha1: [['x']] } }).tipo === null);

  r.forEach(([n, c]) => console.log((c ? 'PASSA ' : 'FALHA ') + n));
  console.log('\n' + r.filter((x) => x[1]).length + ' passaram, ' + r.filter((x) => !x[1]).length + ' falharam');
  process.exit(r.every((x) => x[1]) ? 0 : 1);
})();
