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
  ok('valor negativo vira redutor de receita (comissão)', com.tipo === 'receita' && com.redutor === true && com.descricao === 'Comissão Marcelo');
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
  ok('comissão negativa vira redutor na contabilidade', c.lancamentos.find((l) => l.valor === 2336.75).tipo === 'receita' && c.lancamentos.find((l) => l.valor === 2336.75).redutor);

  // processos, parcelamentos, acordos, tarefas
  await fic.processos(dir + '/p.xlsx'); await fic.parcelamentos(dir + '/pa.xlsx'); await fic.acordos(dir + '/a.xlsx'); await fic.tarefas(dir + '/t.xlsx');
  const pr = IMP.importar(await ler(dir + '/p.xlsx'));
  ok('reconhece Processos', pr.tipo === 'processos');
  ok('4 processos (1 sem número ignorado)', pr.processos.length === 4 && pr.avisos.some((a) => /sem número/.test(a)));
  const p1 = pr.processos.find((x) => x.valor === 57901.25);
  ok('processo: autor sem tabulação, procuração SIM', p1.autor === 'Fazenda Pública do Estado' && p1.procuracao === true && p1.atualizacao === '2026-01-22');
  const p2 = pr.processos.find((x) => x.valor === 2812642.54);
  ok('processo: atualização em número de série do Excel vira data', p2.atualizacao === '2023-11-29' && p2.data_arq_provisorio === '2025-03-01');
  const p3 = pr.processos.find((x) => x.obs === 'polo ativo');
  ok('processo: data d/m/aaaa e valor lixo em Atualização ignorado', p3.data_distribuicao === '2022-10-03' && p3.atualizacao === null);
  ok('processo repetido (polo ativo/passivo) ganha chave própria', p2.chave_importacao !== p3.chave_importacao);
  ok('prospecção marcada', pr.processos.find((x) => x.carteira === 'Prospecção').competencia === 'TRT-3');
  const pa = IMP.importar(await ler(dir + '/pa.xlsx'));
  ok('reconhece Parcelamentos (blocos de 5 colunas)', pa.tipo === 'parcelamentos' && pa.parcelamentos.length === 2);
  const pAlfa = pa.parcelamentos.find((x) => x.empresa === 'Alfa Comércio LTDA');
  ok('parcelamento: dados do bloco', pAlfa.cnpj === '11222333000181' && pAlfa.local === 'eCAC' && pAlfa.natureza === 'Simples Nacional' && pAlfa.total_parcelas === 60 && pAlfa.valor_residual === 25000);
  ok('parcelamento: parcelas com pago/vencimento', pAlfa._parcelas.length === 3 && pAlfa._parcelas.filter((x) => x.pago).length === 2 && pAlfa._parcelas[2].vencimento === '2026-10-10');
  ok('parcelamento: grupo = nome da aba', pAlfa._grupo === 'Grupo Alfa');
  const ac = IMP.importar(await ler(dir + '/a.xlsx'));
  ok('reconhece Acordos (aba Config ignorada)', ac.tipo === 'acordos' && ac.acordos.length === 2);
  ok('acordo da aba "Pago" = pago com data', ac.acordos.find((x) => x.parcela === '1').pago && ac.acordos.find((x) => x.parcela === '1').data_pagamento === '2026-08-09');
  ok('acordo em aberto guarda PIX/banco', ac.acordos.find((x) => x.parcela === '3').pix === 'chave@pix' && !ac.acordos.find((x) => x.parcela === '3').pago);
  const tf = IMP.importar(await ler(dir + '/t.xlsx'));
  ok('reconhece Tarefas', tf.tipo === 'tarefas' && tf.tarefas.length === 2 && tf.tarefas.find((x) => x.titulo === 'Emitir guia').status === 'concluida');

  // planilha desconhecida
  ok('planilha desconhecida é recusada com mensagem', IMP.importar({ abas: { Planilha1: [['x']] } }).tipo === null);

  r.forEach(([n, c]) => console.log((c ? 'PASSA ' : 'FALHA ') + n));
  console.log('\n' + r.filter((x) => x[1]).length + ' passaram, ' + r.filter((x) => !x[1]).length + ' falharam');
  process.exit(r.every((x) => x[1]) ? 0 : 1);
})();
