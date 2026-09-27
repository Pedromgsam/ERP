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

async function processos(arquivo) {
  const wb = new ExcelJS.Workbook();
  const cab = ['Grupo','Advogado','N° do Processo','Competência','Natureza','Autor','Réus','Data de Distribuição','Valor','Atualização','Procuração','Outro Advogado','Status','Data Arquivamento Provisório','ID','Prescrição','Observação'];
  const at = wb.addWorksheet('Ativos'); at.addRow(cab);
  at.addRow(['Grupo Alfa','Pedro','1502259-12.2024.8.26.0014','TJSP','Execução','\tFazenda Pública do Estado','Alfa Comércio LTDA','',57901.25,D(22,1,2026),'SIM','NÃO','','','','','Fazer procuração']);
  at.addRow(['Grupo Beta','Pedro','5000135-86.2021.8.13.0604','TJMG','Execução','Estado de Minas Gerais','Beta Fogos LTDA;\nBruno Beta',D(17,2,2021),2812642.54,45259,'SIM','NÃO','Arquivado provisoriamente',D(1,3,2025),'','','']);
  at.addRow(['Grupo Beta','Pedro','5000135-86.2021.8.13.0604','TJMG','Execução','Beta Fogos LTDA','Estado de Minas Gerais','3/10/2022','R$ 1.000,00','103487,21','NÃO','SIM','Em andamento','','','','polo ativo']);
  const pr = wb.addWorksheet('Prospecção'); pr.addRow(cab);
  pr.addRow(['Épsilon','Pedro','0011795-38.2023.5.03.0050','TRT-3','Execução','Josefina','Épsilon Pirotecnia LTDA','29/11/2023',7172.4,'','NÃO','SIM','Em andamento','','','','']);
  pr.addRow(['Épsilon','Pedro','','TJSP','Execução','X','Y','','','','','','','','','','sem número']);
  wb.addWorksheet('Auxiliar').addRow(['Grupo']);
  await wb.xlsx.writeFile(arquivo);
}

async function parcelamentos(arquivo) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Grupo Alfa');
  const rot = ['CPF/CNPJ','Local','Natureza','Nº','Total de Parcelas','Parcelas pagas','Valor última parcela','Valor residual','',''];
  const blocos = [
    { nome: 'Alfa Comércio LTDA', doc: '11.222.333/0001-81', local: 'eCAC', nat: 'Simples Nacional', num: '123', total: 60, ult: 850.5, res: 25000,
      parc: [['1', D(10,8,2026), 'SIM', 'SIM'], ['2', D(10,9,2026), 'SIM', 'SIM'], ['3', D(10,10,2026), '', '']] },
    { nome: 'Ana Alfa', doc: '123.456.789-09', local: 'Regularize', nat: 'INSS', num: '999', total: 12, ult: 300, res: 3600,
      parc: [['1', D(10,9,2026), 'SIM', ''], ['2', D(10,10,2026), '', '']] }
  ];
  const linhas = Array.from({ length: 16 }, () => []);
  blocos.forEach((b, k) => {
    const c = k * 5;
    linhas[0][c] = 'Nome'; linhas[0][c + 2] = b.nome;
    const vals = [b.doc, b.local, b.nat, b.num, b.total, 0, b.ult, b.res];
    rot.forEach((r, i) => { linhas[i + 1][c] = r; if (i < vals.length) linhas[i + 1][c + 2] = vals[i]; });
    linhas[11][c] = 'Parcela'; linhas[11][c + 1] = 'Vencimento'; linhas[11][c + 2] = 'Emissão'; linhas[11][c + 3] = 'Pagamento';
    b.parc.forEach((p, i) => { p.forEach((v, j) => { linhas[12 + i][c + j] = v; }); });
  });
  linhas.forEach((l) => ws.addRow(l));
  wb.addWorksheet('Auxiliar').addRow(['x']);
  await wb.xlsx.writeFile(arquivo);
}

async function acordos(arquivo) {
  const wb = new ExcelJS.Workbook();
  const cab = ['Grupo','Responsável','Processo','Devedor','Credor','Nº de Parcela','Total de Parcelas','Valor','Vencimento','Status','Emissão','Pagamento','Data de Pagamento','PIX','Banco'];
  const a = wb.addWorksheet('Grupo Beta'); a.addRow(cab);
  a.addRow(['Grupo Beta','Pedro','5000135-86.2021.8.13.0604','Beta Fogos LTDA','Fulano','3','10',1500,D(10,10,2026),'A vencer','','','','chave@pix','Banco X']);
  const pg = wb.addWorksheet('Pago'); pg.addRow(cab);
  pg.addRow(['Grupo Beta','Pedro','5000135-86.2021.8.13.0604','Beta Fogos LTDA','Fulano','1','10',1500,D(10,8,2026),'','','SIM',D(9,8,2026),'','']);
  wb.addWorksheet('Config').addRow(['x']);
  await wb.xlsx.writeFile(arquivo);
}

async function tarefas(arquivo) {
  const wb = new ExcelJS.Workbook();
  const cab = ['Grupo','Tarefa','Processos Vinculados','Prioridade','Responsável','Status','Data de Início','Fim do Prazo','Observação'];
  const t = wb.addWorksheet('Tarefas'); t.addRow(cab);
  t.addRow(['Grupo Alfa','Protocolar defesa','1502259-12.2024.8.26.0014','Alta','Pedro','Em andamento',D(20,9,2026),D(5,10,2026),'']);
  const c = wb.addWorksheet('Concluídas'); c.addRow(cab);
  c.addRow(['Grupo Beta','Emitir guia','', 'Baixa','Emanuelle','',D(1,9,2026),D(3,9,2026),'']);
  await wb.xlsx.writeFile(arquivo);
}

// Acordos como no Google Sheets real: linha de título antes do cabeçalho, "Devedor(a)" e uma aba "A Pagar"
// (antes era confundida com a planilha da Contabilidade)
async function acordosComTitulo(arquivo) {
  const wb = new ExcelJS.Workbook();
  const cab = ['Grupo','Responsável','Processo','Devedor(a)','Credor(a)','Nº de Parcela','Total de Parcelas','Valor','Vencimento','Status','Pagamento','Data de Pagamento'];
  const a = wb.addWorksheet('A Pagar'); a.addRow(['ACORDOS COM TERCEIROS — CONTROLE']); a.addRow(cab);
  a.addRow(['Grupo Beta','Pedro','5000135-86.2021.8.13.0604','Beta Fogos LTDA','Fulano','4','10',-1500,D(10,11,2026),'A vencer','','']);
  const pg = wb.addWorksheet('Pago'); pg.addRow(['ACORDOS PAGOS']); pg.addRow(cab);
  pg.addRow(['Grupo Beta','Pedro','5000135-86.2021.8.13.0604','Beta Fogos LTDA','Fulano','2','10',1500,D(10,9,2026),'','SIM','']);
  await wb.xlsx.writeFile(arquivo);
}
module.exports = { baseDeDados, financeiro, contabilidade, processos, parcelamentos, acordos, tarefas, acordosComTitulo };
if (require.main === module) {
  const dir = process.argv[2] || '.';
  Promise.all([
    baseDeDados(dir + '/1 - Base de Dados.xlsx'),
    financeiro(dir + '/7 - Financeiro.xlsx'),
    contabilidade(dir + '/12 - Financeiro - Contabilidade.xlsx'),
    processos(dir + '/2 - Processos.xlsx'), parcelamentos(dir + '/3 - Parcelamentos Tributários.xlsx'),
    acordos(dir + '/4 - Acordos.xlsx'), tarefas(dir + '/15 - Tarefas.xlsx')
  ]).then(() => console.log('planilhas fictícias geradas em', dir));
}
