// Gera planilhas .xlsx FICTÍCIAS no mesmo formato das planilhas do escritório
// (nenhum dado real). Usadas pelos testes do importador e das telas.
const ExcelJS = require('exceljs');
const D = (d, m, a) => new Date(Date.UTC(a, m - 1, d));

async function baseDeDados(arquivo) {
  const wb = new ExcelJS.Workbook();
  const cab1 = ['Grupo','Nome','CPF/CNPJ','Sócio-Administrador','Responsável','RFB','RFB Negociada','PGFN','PGFN Negociada','AGE/MG','AGE/MG Negociada','CEAT (TRT-3)','Em operação','Procuração','Certificado','Senha','Capag','Situação Cadastral','Tipo Societário','Email','Telefone','Endereço','Cidade','Estado','Observação'];
  const c = wb.addWorksheet('Consultoria'); c.addRow(cab1);
  c.addRow(['Grupo Alfa','Alfa Comércio LTDA','11.222.333/0001-81','Ana Alfa','Pedro',1500.5,0,250000,0,0,0,0,'SIM','SIM','NÃO','SenhaSecreta#1','D','ATIVA','LTDA','alfa@teste.com','(37) 9 9999-0000','Rua A, 10','Divinópolis','MG','']);
  c.addRow(['Grupo Alfa','Ana Alfa','123.456.789-09','-','Pedro','-','-','R$ 3.222,56','-',0,0,0,'SIM','NÃO','NÃO','-','','','PF','','','','','','']);
  c.addRow(['Grupo Beta','Beta Fogos LTDA','22.333.444/0001-55','Bruno Beta','Emanuelle',0,0,1078344.59,0,20000000,0,1,'NÃO','SIM','SIM','-','Omisso','INAPTA','LTDA','','','','Goiânia','GO','cliente antigo']);
  c.addRow(['Grupo Beta','Beta Fogos LTDA','22.333.444/0001-55','Bruno Beta','Emanuelle',0,0,0,0,0,0,0,'','','','','','','','','','','','','']); // repetido
  c.addRow([]);
  const cab2 = ['Grupo','Nome','CPF/CNPJ','Sócio-Administrador','Responsável','RFB','RFB Negociada','PGFN','PGFN Negociada','SEFAZ/MG','AGE/MG','AGE/MG Negociada','CEAT (TRT-3)','Em operação','Procuração','Certificado','Senha','Cadastro Regular','Capag','Regime Tributário','Situação Cadastral','Tipo Societário','Email','Telefone','Endereço','Cidade','Estado','Observação'];
  const d = wb.addWorksheet('Demanda'); d.addRow(cab2);
  d.addRow(['Gama','Gama Têxtil LTDA','33.444.555/0001-09','Gil Gama','Escritório','','','','',5000,'','','','SIM','SIM','SIM','','NÃO','','SN','ATIVA','LTDA','','','','Santana','MG','Certificado com contador']);
  d.addRow(['Delta','','','','Emanuelle']); // sem nome
  const i = wb.addWorksheet('Inativo');
  i.addRow([...cab2, 'Histórico de Consulta', 'Tipo de Cliente', 'Data de Migração', 'Origem']);
  i.addRow(['Épsilon','Épsilon Pirotecnia LTDA','44.555.666/0001-00','Eva','Pedro','','',497572.11,'','','','','','','NÃO','NÃO','','','','','ATIVA','LTDA','','','','Santo Antônio','Inativo','','Situação em: 01/06/2026','Inativo',D(4,6,2026),'Consultoria']);
  wb.addWorksheet('Auxiliar').addRow(['Grupo','Empresas']);
  await wb.xlsx.writeFile(arquivo);
}

async function financeiro(arquivo) {
  const wb = new ExcelJS.Workbook();
  const cab = ['Grupo','Advogado','Tipo','Referência','Vencimento','Valor','Fim do Prazo','Situação','Pagamento','Data de Pagamento','PIX','Banco','Observação'];
  const ar = wb.addWorksheet('A Receber'); ar.addRow(cab);
  ar.addRow(['Grupo Alfa','Pedro','Consultoria','0,7 salário',D(10,8,2026),1061.46,{formula:'E2-TODAY()',result:'-47 dias'},'Vencido','','COBRADO','','','']);
  ar.addRow(['Grupo Beta','Escritório','Consultoria','2 salários',D(10,8,2026),3000,'-47 dias','Vencido','',D(30,9,2026),'Cheque','SICOOB','']);
  ar.addRow(['Grupo Alfa','Pedro','Fixo','-',D(30,9,2026),-1500,'4 dias','Emitir Guia','','','','','Comissão Marcelo']);
  ar.addRow(['Imobiliário','Emanuelle','Fixo','-',D(30,9,2026),486.3,'4 dias','Emitir Guia','','','','','Dúvida CRI']);
  ar.addRow(['Imobiliário','Emanuelle','Fixo','-',D(30,9,2026),486.3,'4 dias','Emitir Guia','','','','','Dúvida CRI']); // igual de propósito
  ar.addRow(['Grupo Alfa','Pedro','Consultoria','0,7 salário',D(10,10,2026),1134.7,'14 dias','OK','','','115.000.000-00','SICOOB','']);
  const re = wb.addWorksheet('Receita'); re.addRow(cab);
  re.addRow(['Grupo Alfa','Pedro','Consultoria','0,8 salário',D(10,11,2025),1214.4,'PAGO','PAGO','SIM',D(10,11,2025),'115.000.000-00','SICOOB','']);
  re.addRow(['Grupo Beta','Escritório','Consultoria','1,75 salário',D(10,12,2025),'R$ 2.656,50','PAGO','PAGO','SIM',D(11,12,2025),'Cheque','SICOOB','']);
  const pj = wb.addWorksheet('Prejuízo'); pj.addRow(cab);
  pj.addRow(['Grupo Beta','Pedro','Consultoria','0,6 salário',D(10,12,2025),910.8,'-290 dias','Vencido','NÃO','','','','']);
  wb.addWorksheet('Auxiliar').addRow(['Grupo']);
  await wb.xlsx.writeFile(arquivo);
}

async function contabilidade(arquivo) {
  const wb = new ExcelJS.Workbook();
  const cab = ['Grupo','Tipo','Referência','Vencimento','Valor','Fim do Prazo','Situação','Pagamento','Data de Pagamento','PIX','Observação'];
  const ar = wb.addWorksheet('A Receber'); ar.addRow(cab);
  ar.addRow(['Grupo Gama','Contabilidade','-',D(8,10,2026),2500,'12 dias','OK','','','(37) 9 0000-0000','']);
  ar.addRow(['Grupo Gama','Contabilidade','-',D(10,11,2026),-2336.75,'45 dias','OK','','','','Comissão Yasmin']);
  const re = wb.addWorksheet('Receita'); re.addRow(cab);
  re.addRow(['Grupo Gama','Contabilidade','-',D(8,9,2026),2500,'PAGO','PAGO','SIM',D(9,9,2026),'','']);
  const cabD = ['Fornecedor','Categoria','Vencimento','Valor','Fim do Prazo','Situação','Pagamento','Data de Pagamento','Forma de pagamento','Observação'];
  const ap = wb.addWorksheet('A Pagar'); ap.addRow(cabD);
  ap.addRow(['Arquivei','Sistema/Software',D(10,10,2026),616,'14 dias','OK','','','','']);
  const de = wb.addWorksheet('Despesa'); de.addRow(cabD);
  de.addRow(['Fernando','Folha de Pagamento',D(10,9,2026),2000,'PAGO','PAGO','SIM',D(14,9,2026),'PIX','']);
  wb.addWorksheet('Prejuízo').addRow(cab);
  await wb.xlsx.writeFile(arquivo);
}

module.exports = { baseDeDados, financeiro, contabilidade };
if (require.main === module) {
  const dir = process.argv[2] || '.';
  Promise.all([
    baseDeDados(dir + '/1 - Base de Dados.xlsx'),
    financeiro(dir + '/7 - Financeiro.xlsx'),
    contabilidade(dir + '/12 - Financeiro - Contabilidade.xlsx')
  ]).then(() => console.log('planilhas fictícias geradas em', dir));
}
