// Teste das telas num navegador de verdade, contra o servidor-local.js
// (que imita o Supabase e aplica os mesmos cabeçalhos de segurança da Vercel).
const { chromium } = require('playwright');
const ExcelJS = require('exceljs');
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const fic = require('./planilhas-ficticias.js');
const BASE = (process.env.BASE || 'http://127.0.0.1:8090') + '/gestao-teste.html';
const FOTOS = process.env.FOTOS || '';
const sql = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-p', process.env.PGPORT || '54329', '-U', 'postgres', '-d', 'erp', '-tAc', q]).toString().trim();
const r = []; const ok = (n, c) => r.push([n, !!c]);

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'telas-'));
  const arqs = [dir + '/1 - Base de Dados.xlsx', dir + '/7 - Financeiro.xlsx', dir + '/12 - Financeiro - Contabilidade.xlsx'];
  await fic.baseDeDados(arqs[0]); await fic.financeiro(arqs[1]); await fic.contabilidade(arqs[2]);

  const b = await chromium.launch();
  const erros = [], bloqueios = [];
  try {
    async function pagina(largura) {
      const ctx = await b.newContext({ viewport: { width: largura || 1366, height: 860 }, acceptDownloads: true });
      const p = await ctx.newPage();
      p.on('pageerror', (e) => erros.push(e.message));
      p.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) bloqueios.push(m.text()); });
      p.on('dialog', (d) => d.accept());
      return p;
    }
    async function entrar(p, email, senha) {
      await p.goto(BASE); await p.waitForSelector('#login-email', { state: 'visible' });
      await p.fill('#login-email', email); await p.fill('#login-senha', senha || 'senha123');
      await p.click('#login-btn');
      await p.waitForFunction(() => !document.getElementById('tela-app').classList.contains('escondido')
        || document.getElementById('login-msg').textContent.trim(), null, { timeout: 10000 }).catch(() => {});
      await p.waitForTimeout(500);
    }
    const esperar = (p, t) => p.waitForTimeout(t || 700);
    const foto = async (p, nome) => { if (FOTOS) await p.screenshot({ path: FOTOS + '/' + nome + '.png', fullPage: true }); };
    const texto = (p, sel) => p.textContent(sel || '#conteudo');
    const menu = async (p, tela) => { await p.click('#menu [data-tela=' + tela + ']'); await esperar(p, 900); };

    // ── admin ──
    let p = await pagina();
    await entrar(p, 'pedro@teste', 'errada');
    ok('senha errada mostra mensagem clara', /E-mail ou senha incorretos/.test(await texto(p, '#login-msg')));
    await entrar(p, 'pedro@teste');
    const ini = await texto(p);
    ok('Início com as duas empresas', /Olá, Pedro/.test(ini) && /Honorários Jurídico/.test(ini) && /Contabilidade/.test(ini));
    ok('menu com Painel, Honorários e Administração', await p.isVisible('#menu [data-tela=painel]') && await p.isVisible('#menu [data-tela=admin]'));

    // cliente manual com passivo
    await menu(p, 'clientes');
    await p.waitForSelector('text=+ Novo cliente'); await p.click('text=+ Novo cliente');
    await p.waitForSelector('#f-cli [name=nome]'); await p.waitForTimeout(300);
    ok('cadastro do cliente em abas (Empresa, Classificação, Contatos, Endereço, Situação, Observações)', (await p.locator('#cli-abas [data-cli-aba]').count()) === 6);
    await p.fill('#f-cli [name=nome]', 'Zeta Manual LTDA');
    await p.fill('#f-cli [name=cpf_cnpj]', '55666777000199');
    await p.click('[data-cli-aba=class]');
    await p.check('#f-cli [name=grupo_novo]'); await p.fill('#f-cli [name=grupo]', 'Grupo Zeta');
    await p.selectOption('#f-cli [name=responsavel]', 'Pedro');
    await p.click('[data-cli-aba=contato]');
    await p.type('#f-cli [name=telefone]', '37998684323');
    ok('telefone com máscara ao digitar', await p.inputValue('#f-cli [name=telefone]') === '(37) 9 9868-4323', await p.inputValue('#f-cli [name=telefone]'));
    await p.click('#cli-mais-email'); await p.fill('#f-cli [data-extra=email]', 'financeiro@zeta.com');
    await p.click('[data-cli-aba=sit]');
    await p.type('#f-cli [name=pgfn]', '1000');
    ok('valor com "R$" ao digitar', await p.inputValue('#f-cli [name=pgfn]') === 'R$ 1.000', await p.inputValue('#f-cli [name=pgfn]'));
    await p.selectOption('#f-cli [name=procuracao]', 'sim');
    await p.selectOption('#f-cli [name=capag]', 'Omisso');
    await foto(p, '01-ficha-cliente');
    await p.click('#btn-salvar-cli'); await esperar(p, 1000);
    ok('cadastra cliente completo com grupo novo', /Zeta Manual LTDA[\s\S]*55\.666\.777\/0001-99/.test(await texto(p)) && sql("select pgfn||'|'||procuracao||'|'||capag from clientes where nome='Zeta Manual LTDA'") === '1000.00|true|Omisso');
    ok('e-mail a mais vira contato do setor financeiro', sql("select finalidade||'|'||email from contatos where cliente_id=(select id from clientes where nome='Zeta Manual LTDA')") === 'financeiro|financeiro@zeta.com');

    // contrato gera parcelas com grupo e pessoa
    await menu(p, 'contratos');
    await p.click('text=+ Novo contrato');
    await p.selectOption('#f-ctr [name=cliente_id]', { label: 'Zeta Manual LTDA · Grupo Zeta' });
    await p.fill('#f-ctr [name=descricao]', 'Consultoria tributária');
    await p.click('#ctr-mod [data-v=pontual]');
    await p.fill('#f-ctr [name=valor_total]', '9.000,00');
    await p.fill('#f-ctr [name=num_parcelas]', '3');
    await p.fill('#f-ctr [name=primeiro_vencimento]', new Date().toISOString().slice(0, 10));
    await p.click('#btn-salvar-ctr'); await esperar(p, 1200);
    ok('contrato cria 3 parcelas com grupo e pessoa do cliente', sql("select count(*) from lancamentos l join grupos g on g.id=l.grupo_id where g.nome='Grupo Zeta' and l.responsavel='Pedro' and l.contrato_id is not null") === '3');

    // Honorários Jurídico
    await menu(p, 'juridico');
    ok('Análise com gráfico mensal e KPIs', (await p.locator('#fin-corpo svg.grafico').count()) >= 1 && /Total em aberto/.test(await texto(p)));
    await p.click('#fin-abas [data-aba=areceber]'); await esperar(p);
    ok('A Receber lista as parcelas (todos os meses)', /Consultoria tributária — parcela 1\/3/.test(await texto(p)) && /Todos os meses/.test(await texto(p, '#fin-periodo')));
    await p.click('#fin-corpo tr:has-text("parcela 1/3") [data-pagar]');
    await p.waitForSelector('.janela-baixa [data-bx-ok]'); await p.click('.janela-baixa [data-bx-ok]'); await esperar(p, 900);
    await p.click('#fin-abas [data-aba=recebidos]'); await esperar(p);
    ok('baixa aparece em Recebidos do mês', /parcela 1\/3/.test(await texto(p)) && /Recebido/.test(await texto(p)));
    // busca não perde o foco nem recria a barra
    await p.click('#fin-abas [data-aba=areceber]'); await esperar(p);
    const barraAntes = await p.evaluate(() => { window.__barra = document.getElementById('fin-barra'); return true; });
    await p.fill('#fin-busca', 'parcela 3'); await esperar(p, 700);
    ok('busca filtra sem recriar a barra e sem tirar o foco', barraAntes && await p.evaluate(() => window.__barra === document.getElementById('fin-barra') && document.activeElement.id === 'fin-busca')
      && /parcela 3\/3/.test(await texto(p, '#fin-corpo')) && !/parcela 2\/3/.test(await texto(p, '#fin-corpo')));
    await p.fill('#fin-busca', ''); await esperar(p, 500);
    // ordenar por valor clicando no cabeçalho
    await p.click('#fin-corpo th:has-text("Valor")'); await esperar(p, 200);
    ok('cabeçalho ordena a tabela', await p.getAttribute('#fin-corpo th:has-text("Valor")', 'aria-sort') === 'descending');
    await foto(p, '02-honorarios-areceber');

    // Contabilidade: despesa recorrente
    await menu(p, 'contabilidade');
    await p.click('text=+ Despesa');
    await p.fill('#f-lanc [name=descricao]', 'Sistema contábil');
    await p.fill('#f-lanc [name=valor]', '616,00');
    await p.fill('#f-lanc [name=favorecido]', 'Arquivei');
    await p.selectOption('#f-lanc [name=repetir]', '3');
    ok('nova despesa já vem com empresa Contabilidade', await p.inputValue('#f-lanc [name=empresa]') === 'contabilidade');
    await p.click('#btn-salvar-lanc'); await esperar(p, 1000);
    ok('despesa recorrente gravada na Contabilidade', sql("select count(*) from lancamentos where empresa='contabilidade' and favorecido='Arquivei'") === '3');

    // ── importação ──
    await menu(p, 'admin');
    await p.click('#adm-abas [data-aba=importar]'); await esperar(p);
    await p.setInputFiles('#imp-arquivos', arqs); await esperar(p, 2500);
    const prev = await texto(p, '#imp-previa');
    ok('prévia reconhece as 3 planilhas', /Base de Dados → Clientes/.test(prev) && /Honorários Jurídico/.test(prev) && /Contabilidade/.test(prev));
    ok('prévia mostra avisos (repetido/sem nome) antes de gravar', /aviso/.test(prev) && sql("select count(*) from clientes where chave_importacao is not null") === '0');
    await foto(p, '03-importar-previa');
    await p.click('#imp-gravar');
    await p.waitForFunction(() => /Importado/.test(document.getElementById('imp-previa').textContent), null, { timeout: 20000 }).catch(() => {});
    ok('importação concluída', /Importado: 5 cliente/.test(await texto(p, '#imp-previa')));
    const nCli = sql('select count(*) from clientes where chave_importacao is not null');
    const nLanc = sql('select count(*) from lancamentos where chave_importacao is not null');
    ok('gravou 5 clientes e 14 lançamentos importados (9 jurídico + 5 contabilidade)', nCli === '5' && nLanc === '14');
    ok('senha da planilha não foi para o banco', !sql("select coalesce(string_agg(obs||historico_cadastral,''),'') from clientes").includes('SenhaSecreta'));
    // reimportar não duplica
    await p.click('#adm-abas [data-aba=importar]'); await esperar(p);
    await p.setInputFiles('#imp-arquivos', arqs); await esperar(p, 2500);
    await p.click('#imp-gravar');
    await p.waitForFunction(() => /Importado/.test(document.getElementById('imp-previa').textContent), null, { timeout: 20000 }).catch(() => {});
    ok('reimportar sem mudanças não polui o histórico', sql("select count(*) from historico where acao='UPDATE' and depois->>'chave_importacao' is not null") === '0');
    ok('reimportar a mesma planilha não duplica', sql('select count(*) from clientes where chave_importacao is not null') === '5' && sql('select count(*) from lancamentos where chave_importacao is not null') === '14');

    // módulos novos: processos, parcelamentos (com parcelas), acordos, tarefas
    const arqs2 = [dir + '/2 - Processos.xlsx', dir + '/3 - Parcelamentos.xlsx', dir + '/4 - Acordos.xlsx', dir + '/15 - Tarefas.xlsx'];
    await fic.processos(arqs2[0]); await fic.parcelamentos(arqs2[1]); await fic.acordos(arqs2[2]); await fic.tarefas(arqs2[3]);
    const contagem = () => ['processos', 'parcelamentos', 'parcelas', 'acordos', 'tarefas where chave_regra is null'].map((t) => sql('select count(*) from ' + t)).join(',');
    for (let vez = 0; vez < 2; vez++) {
      await p.click('#adm-abas [data-aba=importar]'); await esperar(p);
      await p.setInputFiles('#imp-arquivos', arqs2); await esperar(p, 2500);
      if (!vez) ok('prévia reconhece Processos, Parcelamentos, Acordos e Tarefas', /Processos/.test(await texto(p, '#imp-previa')) && /Parcelamentos/.test(await texto(p, '#imp-previa')) && /Acordos/.test(await texto(p, '#imp-previa')) && /Tarefas/.test(await texto(p, '#imp-previa')));
      await p.click('#imp-gravar');
      await p.waitForFunction(() => /Importado/.test(document.getElementById('imp-previa').textContent), null, { timeout: 20000 }).catch(() => {});
      ok(vez ? 'reimportar módulos não duplica' : 'grava 4 processos, 2 parcelamentos, 5 parcelas, 2 acordos, 2 tarefas', contagem() === '4,2,5,2,2');
    }
    ok('parcelas ligadas ao parcelamento e grupo resolvido', sql("select count(*) from parcelas x join parcelamentos p on p.id=x.parcelamento_id join grupos g on g.id=p.grupo_id where g.nome='Grupo Alfa'") === '5');

    // Painel Executivo
    await menu(p, 'painel');
    const esperado = 1500.5 + 250000 + 3222.56 + 1078344.59 + 20000000 + 5000 + 1000;   // ativos (sem o Inativo)
    const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(esperado).replace(/\s/g, ' ');
    const pn = (await texto(p)).replace(/\s/g, ' ');
    ok('Painel: passivo total dos ativos confere (' + fmt + ')', pn.includes(fmt));
    ok('Painel: gráfico por grupo e rosca por órgão', (await p.locator('#pn-corpo svg').count()) >= 2);
    ok('Painel: CAPAG "Omisso" em destaque', (await p.locator('#pn-corpo .pill.omisso').count()) >= 1);
    await p.click('#pn-tipo [data-v=Inativo]'); await esperar(p, 400);
    ok('Painel: filtro Inativos mostra só o inativo', /Épsilon Pirotecnia/.test(await texto(p, '#pn-corpo')) && !/Alfa Comércio/.test(await texto(p, '#pn-corpo')));
    await p.click('#pn-limpar'); await esperar(p, 400);
    await foto(p, '04-painel');

    // Honorários importados: COBRADO, previsão, prejuízo
    await menu(p, 'juridico');
    await p.click('#fin-abas [data-aba=areceber]'); await esperar(p);
    const ar = await texto(p, '#fin-corpo');
    ok('importados aparecem com "Cobrado" e "Previsão"', /Cobrado/.test(ar) && /Previsão: 30\/09\/2026/.test(ar));
    await p.click('#fin-abas [data-aba=prejuizo]'); await esperar(p);
    ok('aba Prejuízo com o crédito perdido', /910,80/.test(await texto(p, '#fin-corpo')));

    // Backup
    await menu(p, 'admin');
    await p.click('#adm-abas [data-aba=backup]'); await esperar(p);
    const [down] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#bk-excel')]);
    const arqBk = dir + '/backup.xlsx'; await down.saveAs(arqBk);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(arqBk);
    const nomes = wb.worksheets.map((w) => w.name);
    const linhasLanc = wb.getWorksheet('lancamentos').rowCount - 1;
    ok('backup em Excel com todas as tabelas', ['Leia-me', 'clientes', 'grupos', 'contratos', 'lancamentos', 'perfis', 'historico'].every((n) => nomes.includes(n)));
    ok('backup tem todos os lançamentos do banco (' + linhasLanc + ')', String(linhasLanc) === sql('select count(*) from lancamentos'));
    const [downJ] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#bk-json')]);
    const arqJ = dir + '/backup.json'; await downJ.saveAs(arqJ);
    const js = JSON.parse(fs.readFileSync(arqJ, 'utf8'));
    ok('backup .json completo para restaurar', js.dados && js.dados.clientes.length === Number(sql('select count(*) from clientes')));

    // Histórico
    await p.click('#adm-abas [data-aba=historico]'); await esperar(p, 900);
    const hist = await texto(p, '#adm-corpo');
    ok('Histórico mostra quem fez e o que mudou', /Pedro Castro/.test(hist) && /Alterou/.test(hist) && /Pago:/.test(hist));
    ok('Histórico mostra nome do grupo, não código interno', /Grupo Zeta/.test(hist) && !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(hist));
    await foto(p, '05-historico');

    // Usuários
    await p.click('#adm-abas [data-aba=usuarios]'); await esperar(p);
    await p.locator('tr:has-text("novo@teste") select').selectOption('equipe'); await esperar(p);
    ok('admin libera usuário novo', sql("select papel from perfis where email='novo@teste'") === 'equipe');
    await p.locator('tr:has-text("pedro@teste") select').selectOption('equipe'); await esperar(p, 900);
    ok('não deixa tirar o último admin', /pelo menos um administrador/.test(await texto(p, '#aviso')));
    await p.click('#btn-sair'); await esperar(p, 500);
    ok('sair volta ao login', await p.isVisible('#tela-login'));
    await p.context().close();

    // ── equipe ──
    p = await pagina();
    await entrar(p, 'equipe@teste');
    ok('equipe entra e não vê Administração', /Olá, Adriana/.test(await texto(p)) && !(await p.isVisible('#menu [data-tela=admin]')));
    await menu(p, 'clientes');
    ok('lista de clientes sem ▸ e com a coluna Área', (await p.locator('.cli-seta').count()) === 0 && /Área/.test(await p.textContent('.cli-tabela thead')));
    await p.click('[data-cli]'); await esperar(p, 1000);
    ok('clicar no cliente abre a ficha 360°', (await p.locator('.janela.ficha #fc-abas button').count()) === 16);
    await p.click('#fc-editar'); await esperar(p, 800);
    ok('equipe não tem botão excluir cliente', (await p.locator('#btn-excluir-cli').count()) === 0);
    await p.context().close();

    // ── celular ──
    p = await pagina(390);
    await entrar(p, 'pedro@teste');
    for (const t of ['painel', 'juridico']) {
      await p.click('#menu [data-tela=' + t + ']'); await esperar(p, 900);
      ok('no celular "' + t + '" não estoura a largura', await p.evaluate(() => document.documentElement.scrollWidth) <= 392);
    }
    await foto(p, '06-celular');
    await p.context().close();

    // ── usuário recém-criado (inativo) ──
    sql("insert into auth.users(email,senha_teste) values ('outro@teste','senha123')");
    p = await pagina();
    await entrar(p, 'outro@teste');
    await p.waitForFunction(() => /liberado/.test(document.getElementById('login-msg').textContent), null, { timeout: 8000 }).catch(() => {});
    ok('usuário não liberado não entra e vê o motivo', /ainda não foi liberado/.test(await texto(p, '#login-msg')));
    await p.context().close();
  } catch (e) {
    ok('teste interrompido: ' + e.message.split('\n')[0], false);
    if (FOTOS) for (const pg of b.contexts().flatMap((c) => c.pages())) await pg.screenshot({ path: FOTOS + '/falha.png', fullPage: true }).catch(() => {});
  }
  ok('nenhum erro de JavaScript', erros.length === 0);
  ok('nada bloqueado pela política de segurança (CSP)', bloqueios.length === 0);
  if (erros.length) console.log(erros);
  if (bloqueios.length) console.log(bloqueios.slice(0, 5));
  await b.close();
  r.forEach(([n, c]) => console.log((c ? 'PASSA ' : 'FALHA ') + n));
  console.log('\n' + r.filter((x) => x[1]).length + ' passaram, ' + r.filter((x) => !x[1]).length + ' falharam');
  process.exit(r.every((x) => x[1]) ? 0 : 1);
})();
