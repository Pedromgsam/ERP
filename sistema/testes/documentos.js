// Teste da Central de Documentos (Backup 32): cada modelo com cliques reais — puxar o cliente, preencher,
// conferir o texto, salvar (com número no recibo), baixar o Word (.docx com logo e rodapé), abrir o PDF,
// reabrir/duplicar pelo histórico e as entradas vindas do ERP (?modelo=…&cliente=…, &contrato=…, &lancamento=…).
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8090';
const sql = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-p', process.env.PGPORT || '54329', '-U', 'postgres', '-d', 'erp', '-v', 'ON_ERROR_STOP=1', '-tAc', q]).toString().trim().split('\n').filter((l) => !/^(INSERT|UPDATE|DELETE) /.test(l)).join('\n');
const r = []; const ok = (n, c, extra) => { r.push([n, !!c]); if (!c && extra !== undefined) console.log('   ↳', n, '→', String(extra).slice(0, 400)); };
const ALFA = sql("select id from clientes where nome ilike 'alfa com%' limit 1");

(async () => {
  const b = await chromium.launch(); const erros = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => erros.push(e.message));
    p.on('dialog', (d) => d.accept());
    await p.goto(BASE + '/'); await p.waitForSelector('#ac-login-email', { state: 'visible' });
    await p.fill('#ac-login-email', 'pedro@teste'); await p.fill('#ac-login-senha', 'senha123'); await p.click('#ac-login-btn'); await p.waitForTimeout(3500);
    const abrir = async (suf) => { await p.goto(BASE + '/documentos/index.html' + (suf || '')); await p.waitForSelector('body.dc-pronto', { timeout: 15000 }); await p.waitForTimeout(500); };
    const texto = () => p.textContent('#dc-corpo');
    sql("delete from documentos_gerados; delete from documentos_numeracao");

    // ── extenso ──
    await abrir();
    const ext = await p.evaluate(() => [DOCS.extenso(1234.56), DOCS.extenso(1000000), DOCS.extenso(2050), DOCS.extenso(101), DOCS.dataExtenso('2026-10-01')]);
    ok('valor por extenso e data por extenso', ext[0] === 'mil, duzentos e trinta e quatro reais e cinquenta e seis centavos' && ext[1] === 'um milhão de reais' && ext[2] === 'dois mil e cinquenta reais' && ext[3] === 'cento e um reais' && ext[4] === '1º de outubro de 2026', JSON.stringify(ext));

    // ── 1) procuração: busca o cliente, texto no padrão, avisos de campo vazio ──
    ok('abre na procuração, com avisos amarelos do que falta', /PROCURAÇÃO/.test(await texto()) && (await p.$$('#dc-corpo .falta')).length > 0);
    await p.fill('[data-busca-cli]', 'alfa'); await p.waitForSelector('.dc-sug [data-cli]'); await p.click('.dc-sug [data-cli]'); await p.waitForTimeout(1200);
    let t = await texto();
    ok('procuração: puxa o cliente (razão social, CNPJ, sede e sócio-administrador)', /ALFA COM/i.test(t) && /11\.222\.333\/0001-81/.test(t) && /sócio-administrador/.test(t), t.slice(0, 300));
    ok('procuração: poderes padrão e finalidade em negrito no fim', /ad judicia et extra/.test(t) && /reconhecer a procedência de pedidos e confessar/.test(t) && (await p.textContent('#dc-corpo p b:last-of-type')).length > 40);
    await p.click('.dc-chip:has-text("Emanuelle")'); await p.waitForTimeout(300);
    t = await texto();
    ok('procuração: dois advogados = "procuradores" e as duas OAB', /seus bastantes procuradores/.test(t) && /228\.471/.test(t) && /240\.369/.test(t));
    await p.check('[name="f-finalidade"][value=processo]', { force: true }); await p.waitForTimeout(300);
    ok('procuração: finalidade "processo" pede o número', (await p.$$('#dc-corpo .falta')).length === 1 && await p.isVisible('#f-processo'));
    await p.fill('#f-processo', '5000001-11.2024.8.13.0024'); await p.waitForTimeout(300);
    ok('procuração: completa (sem campo a preencher)', await p.evaluate(() => DOCS.faltas()) === 0 && /completo/.test(await p.textContent('#dc-status')));
    await p.click('#dc-salvar'); await p.waitForTimeout(1500);
    ok('salvar grava no histórico com o cliente vinculado', sql("select count(*) from documentos_gerados where modelo='procuracao' and cliente_id='" + ALFA + "' and html like '%PROCURAÇÃO%'") === '1');
    // Word
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#dc-word')]);
    const arq = await dl.path(); const buf = fs.readFileSync(arq);
    const zip = buf.toString('latin1');
    ok('Word: baixa um .docx de verdade, com logo no cabeçalho e banda no rodapé', /\.docx$/.test(dl.suggestedFilename()) && buf.slice(0, 2).toString() === 'PK' && /word\/media\//.test(zip) && /header/.test(zip) && /footer/.test(zip) && !/\.undefined/.test(zip), dl.suggestedFilename());
    // PDF
    const [pop] = await Promise.all([p.waitForEvent('popup'), p.click('#dc-pdf')]);
    await pop.waitForLoadState(); const tp = await pop.textContent('body');
    ok('PDF: abre a página de impressão com o documento e o botão "Salvar em PDF"', /PROCURAÇÃO/.test(tp) && /Salvar em PDF/.test(tp) && (await pop.$$('img.dc-cab-fixo, img.dc-rod-fixo')).length === 2);
    await pop.close();

    // ── 2) ajuste manual do texto ──
    await p.click('#dc-editar'); await p.waitForTimeout(300);
    await p.evaluate(() => { const el = document.querySelector('#dc-corpo p[contenteditable]'); el.innerHTML = el.innerHTML.replace('Pelo presente', 'TEXTO AJUSTADO À MÃO. Pelo presente'); });
    await p.click('#dc-editar'); await p.waitForTimeout(300); await p.click('#dc-salvar'); await p.waitForTimeout(1500);
    ok('"Ajustar texto": a mudança feita à mão fica no documento salvo', sql("select count(*) from documentos_gerados where modelo='procuracao' and editado and html like '%TEXTO AJUSTADO À MÃO%'") === '1');

    // ── 3) recibo: número sequencial, extenso, vindo de um lançamento ──
    const lanc = sql("insert into lancamentos (tipo, descricao, valor, vencimento, pago, data_pagamento, forma_pagamento, cliente_id) values ('receita','Honorários set/2026',1500,current_date,true,current_date,'PIX','" + ALFA + "') returning id");
    await abrir('?lancamento=' + lanc);
    t = await texto();
    ok('recibo vindo do lançamento: valor, extenso, cliente e forma', /RECIBO/.test(t) && /R\$\s?1\.500,00 \(mil e quinhentos reais\)/.test(t) && /ALFA COM/i.test(t) && /PIX/.test(t), t.slice(0, 400));
    await p.click('#dc-salvar'); await p.waitForTimeout(1500);
    const ano = new Date().getFullYear();
    ok('recibo: ganha número ao salvar (REC ' + ano + '/0001)', sql("select numero from documentos_gerados where modelo='recibo'") === 'REC ' + ano + '/0001' && /REC \d{4}\/0001/.test(await texto()));
    // duplicar → número novo
    await p.click('[data-vista=historico]'); await p.waitForSelector('[data-h-dup]');
    ok('histórico lista os documentos salvos', (await p.$$('.dc-htab tbody tr')).length === 2);
    await p.click('.dc-htab tr:has-text("Recibo") [data-h-dup]'); await p.waitForTimeout(1200);
    await p.click('#dc-salvar'); await p.waitForTimeout(1500);
    ok('duplicar o recibo e salvar = número seguinte (0002)', sql("select string_agg(numero, ',' order by numero) from documentos_gerados where modelo='recibo'") === 'REC ' + ano + '/0001,REC ' + ano + '/0002');

    // ── 4) contrato: do ERP com cliente e contrato; honorários combinados; anexo ──
    const ctr = sql("insert into contratos (cliente_id, descricao, valor_total, num_parcelas, primeiro_vencimento, percentual_exito, status) values ('" + ALFA + "', 'a defesa da CONTRATANTE na execução fiscal n. 5000001-11.2024.8.13.0024', 6000, 3, current_date + 10, 10, 'Ativo') returning id");
    await abrir('?modelo=contrato&cliente=' + ALFA + '&contrato=' + ctr);
    t = await texto();
    ok('contrato vindo do ERP: partes, objeto, valor parcelado e êxito', /CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS/.test(t) && /CONTRATANTE:/.test(t) && /execução fiscal n\. 5000001/.test(t) &&
      /R\$\s?6\.000,00 \(seis mil reais\)/.test(t) && /3 \(três\) parcelas mensais/.test(t) && /10% \(dez por cento\)/.test(t), t.slice(0, 600));
    ok('contrato: cláusulas fixas e êxito com base definida e parágrafo na rescisão', /CLÁUSULA TERCEIRA – DA RESCISÃO/.test(t) && /CLÁUSULA SEXTA – DISPOSIÇÕES GERAIS/.test(t) && /economia gerada/.test(t) && /na proporção do trabalho realizado/.test(t));
    await p.check('[data-k=anexo]'); await p.waitForTimeout(400);
    ok('contrato: Anexo I com a tabela por matéria (valores a preencher)', /ANEXO I – TABELA DE HONORÁRIOS POR MATÉRIA/.test(await texto()) && (await p.$$('#dc-corpo .dc-tab tbody tr')).length === 11);
    ok('contrato: assinaturas com contratante, contratado e 2 testemunhas', (await p.$$('#dc-corpo .dc-assin-c')).length === 4);

    // ── 5) substabelecimento, declaração e acordo ──
    await abrir('?modelo=substabelecimento');
    await p.fill('#f-outro_nome', 'Advogado Fictício de Teste'); await p.fill('#f-outro_oab', 'OAB/MG 999.999'); await p.fill('#f-outro_endereco', 'Rua Teste, n. 1, Centro, Belo Horizonte/MG');
    await p.fill('#f-outorgante_nome', 'Alfa Comércio Ltda'); await p.fill('#f-processo', '1234567-00.2026.8.13.0001'); await p.click('label:has-text("Sem reserva")'); await p.waitForTimeout(300);
    t = await texto();
    ok('substabelecimento: sem reserva, do escritório para o outro advogado, com os autos', /SUBSTABELECIMENTO/.test(t) && /sem reserva de poderes/.test(t) && /ADVOGADO FICTÍCIO DE TESTE/.test(t) && /Autos n\. 1234567/.test(t) && /OAB\/MG sob o n\. 999\.999/.test(t), t.slice(0, 400));
    await abrir('?modelo=declaracao');
    await p.click('[data-busca-cli] >> nth=0'); await p.click('label:has-text("Pessoa física")'); await p.waitForTimeout(200);
    await p.fill('#f-declarante-nome', 'Maria Fictícia de Teste'); await p.fill('#f-declarante-doc', '12345678909'); await p.check('[name="f-declarante-genero"][value=f]', { force: true }); await p.waitForTimeout(300);
    t = await texto();
    ok('declaração de hipossuficiência (pessoa física, feminino)', /DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA/.test(t) && /brasileira/.test(t) && /inscrita no CPF sob o n\. 123\.456\.789-09/.test(t) && /gratuidade da justiça/.test(t), t.slice(0, 400));
    await abrir('?modelo=acordo');
    await p.fill('#f-valor_original', '10.000,00'); await p.fill('#f-valor_acordo', '8.000,00'); await p.fill('#f-parcelas', '4'); await p.fill('#f-parcela_valor', '2.000,00'); await p.fill('#f-processo', '7777777-77.2026.8.13.0024'); await p.waitForTimeout(300);
    t = await texto();
    ok('acordo: partes CREDOR/DEVEDOR, desconto, 4 parcelas, inadimplemento e quitação com os autos', /ACORDO PARA QUITAÇÃO DE DÍVIDA/.test(t) && /CREDOR:/.test(t) && /DEVEDOR:/.test(t) && /com desconto de R\$\s?2\.000,00/.test(t) &&
      /4 \(quatro\) parcelas mensais/.test(t) && /CLÁUSULA QUARTA – INADIMPLEMENTO/.test(t) && /PARÁGRAFO PRIMEIRO:/.test(t) && /homologação deste acordo/.test(t), t.slice(0, 800));
    ok('acordo: assinaturas lado a lado (partes em cima, advogados embaixo)', (await p.$$('#dc-corpo .dc-assin-l')).length === 2 && (await p.$$('#dc-corpo .dc-assin-l:first-child .dc-assin-c')).length === 2);
    ok('sem fórmula de encerramento ("por estarem justas…") em nenhum modelo', !/justas e acordadas/i.test(t));

    // ── 6) escritório: dados dos advogados (admin) ──
    await p.click('[data-vista=escritorio]'); await p.waitForSelector('#dc-e-salvar');
    await p.fill('[data-e="cnpj"]', '12.345.678/0001-90'); await p.click('#dc-e-salvar'); await p.waitForTimeout(1200);
    ok('Configurações: o administrador salva o CNPJ que vai nos recibos', sql("select valor->>'cnpj' from configuracoes where chave='documentos_escritorio'") === '12.345.678/0001-90');

    // ── 7) celular ──
    const m = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage();
    await m.goto(BASE + '/'); await m.waitForSelector('#ac-login-email', { state: 'visible' });
    await m.fill('#ac-login-email', 'pedro@teste'); await m.fill('#ac-login-senha', 'senha123'); await m.click('#ac-login-btn'); await m.waitForTimeout(3000);
    await m.goto(BASE + '/documentos/index.html'); await m.waitForSelector('body.dc-pronto'); await m.waitForTimeout(600);
    ok('no celular (390 px) a página não rola para o lado', await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  } catch (e) {
    console.error(e); ok('sem exceção no teste', false);
  } finally { await b.close(); }
  ok('sem erros de JavaScript', erros.length === 0, erros.slice(0, 3).join(' | '));
  sql("delete from contratos where descricao like 'a defesa da CONTRATANTE na execução fiscal n. 5000001%'; delete from lancamentos where descricao='Honorários set/2026'");
  r.forEach(([n, c]) => console.log((c ? 'PASSA  ' : 'FALHOU ') + n));
  const f = r.filter((x) => !x[1]).length;
  console.log('\n' + (r.length - f) + ' passaram, ' + f + ' falharam');
  process.exit(f ? 1 : 0);
})();
