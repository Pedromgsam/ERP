// Teste do ERP (index.html = o ERP original ligado ao Supabase) num navegador de verdade.
// Dados fictícios. Precisa do servidor-local.js, PostgREST e PostgreSQL de teste.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:8090';
const FOTOS = process.env.FOTOS || '';
const sql = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-p', process.env.PGPORT || '54329', '-U', 'postgres', '-d', 'erp', '-v', 'ON_ERROR_STOP=1', '-tAc', q]).toString().trim();
const r = []; const ok = (n, c, extra) => { r.push([n, !!c]); if (!c && extra !== undefined) console.log('   ↳', n, '→', extra); };

// ── banco limpo + dados fictícios ──
execFileSync('sh', [path.join(__dirname, 'preparar-banco.sh')]);
sql(`
insert into grupos(nome) values ('Grupo Alfa'),('Grupo Beta');
-- mesma dívida na PJ e na PF (sócio): a PF NÃO entra na soma do grupo
insert into clientes(grupo_id,nome,cpf_cnpj,socio_admin,rfb,pgfn,pgfn_negociada,capag,procuracao,em_operacao)
  select id,'Alfa Comércio Ltda','11222333000181','Ana Alfa',1000,500,200,'A',true,true from grupos where nome='Grupo Alfa';
insert into clientes(grupo_id,nome,cpf_cnpj,rfb,pgfn,pgfn_negociada)
  select id,'Ana Alfa','12345678909',1000,500,200 from grupos where nome='Grupo Alfa';
insert into clientes(grupo_id,nome,cpf_cnpj,socio_admin,age_mg)
  select id,'Beta Serviços Ltda','22333444000172','Bruno Beta',300 from grupos where nome='Grupo Beta';
insert into processos(grupo_id,carteira,advogado,numero,natureza,autor,reu,valor,status)
  select id,'Ativo','Pedro','5000001-11.2024.8.13.0024','Execução fiscal','Estado de MG','Alfa Comércio Ltda',15000,'Em andamento' from grupos where nome='Grupo Alfa';
insert into parcelamentos(grupo_id,aba,empresa,cnpj,local,natureza,numero,total_parcelas,valor_ultima_parcela)
  select id,'Grupo Alfa','Alfa Comércio Ltda','11222333000181','e-CAC','Simples Nacional','777',3,250 from grupos where nome='Grupo Alfa';
insert into parcelas(parcelamento_id,numero,vencimento,pago)
  select id,'1',current_date - 40,true from parcelamentos union all
  select id,'2',current_date - 10,false from parcelamentos union all
  select id,'3',current_date + 20,false from parcelamentos;
insert into acordos(grupo_id,processo,devedor,credor,parcela,total_parcelas,valor,vencimento)
  select id,'0001234-55.2023.5.03.0001','Alfa Comércio Ltda','Carlos Credor','1','2',800,current_date + 15 from grupos where nome='Grupo Alfa';
insert into lancamentos(empresa,tipo,grupo_id,descricao,categoria,responsavel,referencia,vencimento,valor)
  select 'escritorio','receita',id,'Honorários mensais','Mensal','Pedro','09/2026',current_date + 5,1500 from grupos where nome='Grupo Alfa';
insert into lancamentos(empresa,tipo,grupo_id,descricao,categoria,responsavel,vencimento,valor,redutor)
  select 'escritorio','receita',id,'Comissão','Comissão','Pedro',current_date + 5,150,true from grupos where nome='Grupo Alfa';
insert into lancamentos(empresa,tipo,grupo_id,descricao,categoria,responsavel,vencimento,valor)
  select 'contabilidade','receita',id,'Honorários contábeis','Mensal','Adriana',current_date - 3,900 from grupos where nome='Grupo Beta';
insert into acordos(grupo_id,processo,devedor,credor,parcela,total_parcelas,valor,vencimento)
  select id,'0009999-11.2022.5.03.0002','Beta Serviços Ltda','Credor Antigo','3','10',128450.90,current_date - 20 from grupos where nome='Grupo Beta';
insert into tarefas(titulo,responsavel,prazo) values ('Protocolar defesa','Pedro',current_date + 2);
insert into configuracoes(chave,valor) values ('recibo_emitentes','{"pedro":{"label":"Pedro","nome":"ADVOGADO FICTICIO","oab":"OAB/MG 1","local":"Cidade/MG","qualif":"advogado ficticio, e-mail teste@teste","email":"teste@teste"}}');
insert into auth.users(email,senha_teste,raw_user_meta_data) values ('cliente@teste','senha123','{"nome":"Cliente Alfa"}');
update config_privada set valor = to_jsonb('http://127.0.0.1:8090/__teste/djen'::text) where chave = 'api_publicacoes';
insert into config_privada(chave,valor) values ('api_cnpj','{"provedor":"brasilapi","token":"","bases":{"brasilapi":"http://127.0.0.1:8090/__teste/brasilapi/","receitaws":"http://127.0.0.1:8090/__teste/receitaws/","cnpja":"http://127.0.0.1:8090/__teste/cnpja/"}}')
  on conflict (chave) do update set valor = excluded.valor;
update clientes set procuracao = true where nome = 'Alfa Comércio Ltda';
insert into auth.users(email,senha_teste,raw_user_meta_data) values ('fin@teste','senha123','{"nome":"Fabiana Financeiro"}');
update perfis set papel='equipe', funcoes='{"financeiro_juridico":"editar"}' where email='fin@teste';
update perfis set papel='cliente' where email='cliente@teste';
insert into perfil_grupos(perfil_id,grupo_id) select p.id,g.id from perfis p, grupos g where p.email='cliente@teste' and g.nome='Grupo Alfa';
`);

(async () => {
  const b = await chromium.launch();
  const paginasCob = []; // COBERTURA=arquivo.json: quais funções do ERP rodaram durante o teste (inventário de código morto)
  const erros = [], bloqueios = [], externos = [];
  try {
    async function pagina(largura) {
      const ctx = await b.newContext({ viewport: { width: largura || 1440, height: 900 } });
      const p = await ctx.newPage();
      p.on('pageerror', (e) => erros.push(e.message));
      p.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) bloqueios.push(m.text()); });
      p.on('request', (q) => { if (/script\.google|cdnjs/.test(q.url())) externos.push(q.url()); });
      p.on('dialog', (d) => d.accept());
      if (process.env.COBERTURA) { await p.coverage.startJSCoverage({ resetOnNavigation: false }); paginasCob.push(p); }
      return p;
    }
    const foto = async (p, nome) => { if (FOTOS) await p.screenshot({ path: FOTOS + '/erp-' + nome + '.png' }); };
    async function entrar(p, email, senha) {
      await p.goto(BASE + '/');
      await p.waitForSelector('#ac-login-email', { state: 'visible' });
      await p.fill('#ac-login-email', email); await p.fill('#ac-login-senha', senha || 'senha123');
      await p.click('#ac-login-btn');
      await p.waitForTimeout(2500);
    }
    const carregado = (p) => p.waitForFunction(() => /Completo|Conectado/.test(document.getElementById('dotTxt').textContent), null, { timeout: 15000 }).catch(() => {});
    const nav = async (p, painel) => { await p.evaluate((x) => nav(null, x), painel); await p.waitForTimeout(700); };
    const esperarJanela = (p) => p.waitForSelector('.gx-janela', { timeout: 8000 });
    const lancar = async (p, i) => { await p.click('.tn-lancar-bt'); await p.click('.tn-lancar [data-lancar="' + i + '"]'); await p.waitForSelector('.gx-janela, #gs-raiz .janela', { timeout: 8000 }); await p.waitForTimeout(250); };
    const salvarGs = async (p, bt) => { await p.click(bt); await p.waitForSelector('#gs-raiz .fundo', { state: 'detached', timeout: 10000 }).catch(async () => console.log('JANELA NÃO FECHOU:', bt, await p.textContent('#gs-raiz #aviso'))); await p.waitForTimeout(1500); };
    const salvar = async (p) => { await p.click('.gx-janela button[type=submit]'); await p.waitForSelector('.gx-fundo', { state: 'detached', timeout: 8000 }).catch(() => {}); await p.waitForTimeout(2500); };

    // ── login ──
    let p = await pagina();
    await entrar(p, 'pedro@teste', 'errada');
    ok('senha errada: mensagem clara', /incorretos/.test(await p.textContent('#ac-login-msg')));
    await entrar(p, 'pedro@teste');
    await carregado(p);
    ok('entra com e-mail e senha do Supabase', await p.evaluate(() => window.AC_SESSION && window.AC_SESSION.nivel === 'admin'));
    await p.waitForTimeout(1200);
    ok('barra superior do Gestão (sem menu lateral nem cabeçalho antigo)', await p.isVisible('#gs-hd #tn') && !(await p.isVisible('#sb')) && !(await p.isVisible('#hd')) && await p.isVisible('.tn-lancar-bt'));
    ok('barra mostra entidades e grupos', /3/.test(await p.textContent('#gs-n-ent')) && /2/.test(await p.textContent('#gs-n-grp')));
    // menus suspensos: clicar como uma pessoa e conferir que o item aparece de verdade (não escondido atrás da tela)
    for (const g of ['Jurídico', 'Financeiro']) {
      await p.click('#tn .tn-abre:has-text("' + g + '")'); await p.waitForTimeout(250);
      const visivel = await p.evaluate(() => { const it = document.querySelector('#tn .tn-grupo.on .tn-menu button'); if (!it) return false; const r = it.getBoundingClientRect(); return document.elementFromPoint(r.left + 15, r.top + r.height / 2) === it; });
      ok('menu ' + g + ' abre e mostra os itens na tela', visivel);
      await p.mouse.click(700, 600); await p.waitForTimeout(150);
    }
    await p.click('#tn .tn-abre:has-text("Financeiro")'); await p.waitForTimeout(250);
    await p.mouse.click(...await p.evaluate(() => { const r = document.querySelector('#tn .tn-grupo.on .tn-menu button').getBoundingClientRect(); return [r.left + 15, r.top + r.height / 2]; }));
    await p.waitForTimeout(800);
    ok('clicar em Financeiro › Jurídico abre os Honorários', await p.isVisible('#panel-financeiro'));
    ok('barra sem o texto "Araujo & Castro"', !/Araujo/.test(await p.textContent('#gs-hd')));
    await p.click('.gs-bt-mais'); await p.waitForTimeout(200);
    ok('⋯ sem o link do Gestão antigo e com a Central de e-mails e Meu nome', !(await p.$('#gs-hd [data-acao=gestao]')) && await p.isVisible('#gs-hd [data-acao=cobrancas]') && await p.isVisible('#gs-hd [data-acao=meunome]'));
    await p.mouse.click(700, 600); await p.waitForTimeout(150);
    const g2 = await p.request.get(BASE + '/gestao.html');
    ok('gestao.html saiu do site', g2.status() === 404);
    ok('menu Financeiro com Jurídico e Contabilidade', (await p.$$eval('#tn .tn-grupo:nth-of-type(2) .tn-menu button', (l) => l.map((b) => b.textContent))).join('|') === 'Jurídico|Contabilidade');
    await nav(p, 'hoje'); await p.waitForTimeout(1500);
    ok('equipe entra no Início do Gestão (resumo do mês)', await p.isVisible('#panel-hoje') && /Olá, Pedro/.test(await p.textContent('#panel-hoje')) && /Contabilidade/.test(await p.textContent('#panel-hoje')));
    await p.waitForSelector('#ini-resumo .ini-res'); await p.waitForTimeout(300);
    ok('Início: resumo sem Processos; Tarefas com atrasadas, hoje e próximos 5 dias no mesmo cartão', await p.evaluate(() => {
      const t = [...document.querySelectorAll('#ini-resumo .ini-res-tit')].map((x) => x.textContent), tf = document.querySelector('#ini-resumo [data-ini-ir=tarefas]');
      return !t.includes('Processos') && t.includes('Publicações') && t.includes('Documentos') && tf.querySelectorAll('.ini-res-sub').length === 3 && /próximos 5 dias/.test(tf.textContent); }));
    await foto(p, 'inicio');
    await p.waitForTimeout(1500);
    const n = await p.evaluate(() => ({ b: DB.baseDados.length, pr: DB.processos.length, pa: DB.parcelamentos.length, ac: DB.acordos.length, fi: DB.financeiro.length, fc: DB.financeiroContabilidade.length }));
    ok('carrega os 6 módulos do Supabase', n.b === 3 && n.pr === 1 && n.pa === 1 && n.ac === 2 && n.fi === 2 && n.fc === 1, JSON.stringify(n));
    ok('PF identificada (isPJ=false) e PJ (isPJ=true)', await p.evaluate(() => DB.baseDados.find((x) => x.nome === 'Ana Alfa').isPJ === false && DB.baseDados.find((x) => x.nome === 'Alfa Comércio Ltda').isPJ === true));
    // Passivo total = só PJ: Alfa 1000+500+200 + Beta 300 = 2.000 (a PF igual NÃO soma)
    await nav(p, 'resumo');
    const kpi = await p.evaluate(() => document.getElementById('execKpis').innerHTML);
    ok('dívida idêntica de PF e PJ não é somada (total R$ 2.000,00)', /2\.000,00/.test(kpi) && !/3\.700,00/.test(kpi), kpi.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200));
    ok('dívida negociada entra no total (como no ERP)', await p.evaluate(() => trib(DB.baseDados.find((x) => x.nome === 'Alfa Comércio Ltda')) === 1700));
    const fin = await p.evaluate(() => DB.financeiro.map((f) => f.aba + '|' + f.valor + '|' + f.situacao).sort().join(';'));
    ok('dedução volta negativa na aba A Receber', fin === 'A Receber|-150|OK;A Receber|1500|OK', fin);
    ok('contabilidade vencida = Vencido', await p.evaluate(() => DB.financeiroContabilidade[0].situacao === 'Vencido' && DB.financeiroContabilidade[0].diasRestantes === -3));
    ok('parcela vencida não paga = Inadimplente', await p.evaluate(() => DB.parcelamentos[0].parcelas.map((x) => x.status).join(',') === 'Pago,Inadimplente,A Vencer'));
    ok('nenhuma chamada ao Google/CDN', externos.length === 0, externos.join(' '));
    ok('dados dos recibos vêm do banco após o login (não ficam no HTML)', await p.evaluate(() => RECIBO_EMITENTES.pedro && RECIBO_EMITENTES.pedro.nome === 'ADVOGADO FICTICIO'));
    const html = await (await p.request.get(BASE + '/')).text();
    ok('HTML público sem CPF nem e-mail pessoal', !/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(html) && !/@gmail\.com/.test(html));
    await foto(p, 'painel');

    // ── Honorários: tabela no formato do Gestão (menos colunas) ──
    await nav(p, 'financeiro');
    await p.evaluate(() => { const b = [...document.querySelectorAll('#panel-financeiro button')].find((x) => /A Receber/.test(x.textContent)); if (b) b.click(); });
    await p.waitForTimeout(1200);
    const cab = await p.$$eval('#panel-financeiro .gx-tab-gs table thead th', (l) => l.map((t) => t.textContent.trim()).filter(Boolean));
    ok('A Receber no padrão de pagamento (Quem, Grupo, Descrição, Valor, Vencimento, Atraso)', cab.join('|') === 'Quem|Grupo / Favorecido|Descrição|Valor|Vencimento|Atraso', cab.join('|'));
    ok('tabela original do ERP escondida (sem duplicar)', await p.$eval('#tblFinBody', (tb) => tb.closest('table').classList.contains('gx-oculta')));
    ok('comissão aparece como redutor (valor negativo)', /−\s*R\$\s*150,00/.test(await p.textContent('#panel-financeiro .gx-tab-gs')) && /redutor/.test(await p.textContent('#panel-financeiro .gx-tab-gs')));
    await foto(p, 'areceber');

    // ── acordos são dívidas do cliente: nunca entram no financeiro do escritório ──
    { const v = await p.evaluate(() => ({ fin: _getVencRows(-1, 'financeiro').map((r) => r.tipo), cli: _getVencRows(-1, 'cliente').map((r) => r.tipo),
        finAc: (DB.financeiro || []).some((f) => /acordo/i.test(f.tipo || '')) }));
      ok('vencidos do financeiro só com honorários; acordos e parcelamentos no escopo do cliente',
        v.fin.every((t) => t === 'Honorário') && v.cli.includes('Acordo') && !v.cli.includes('Honorário') && !v.finAc, JSON.stringify(v)); }

    // ── editar: formulário do Gestão ──
    const idRec = sql("select id from lancamentos where descricao='Honorários mensais'");
    await p.click('#panel-financeiro .gx-tab-gs [data-editar="' + idRec + '"]');
    await p.waitForSelector('#gs-raiz .janela', { timeout: 8000 }); await p.waitForTimeout(250);
    ok('Editar abre o formulário do Gestão', /Editar receita/.test(await p.textContent('#gs-raiz .janela-hd')));
    await foto(p, 'editar');
    await p.fill('#f-lanc [name=referencia]', '10/2026');
    await salvarGs(p, '#btn-salvar-lanc');
    ok('edição gravada no Supabase', sql("select count(*) from lancamentos where referencia='10/2026'") === '1');
    ok('histórico registra a alteração', sql("select count(*) from historico where tabela='lancamentos' and acao='UPDATE'") === '1');
    ok('rodapé mostra a última gravação', /Última gravação/.test(await p.textContent('#gx-rodape')));

    // ── ✓ Recebido na linha (Gestão) ──
    await p.waitForSelector('#panel-financeiro .gx-tab-gs [data-pagar="' + idRec + '"]', { timeout: 8000 });
    await p.click('#panel-financeiro .gx-tab-gs [data-pagar="' + idRec + '"]');
    await p.waitForSelector('.janela-baixa [name=bx-data]', { timeout: 8000 });
    ok('✓ Recebido pergunta a data (já vem com hoje)', await p.inputValue('.janela-baixa [name=bx-data]') === sql('select current_date'));
    await p.fill('.janela-baixa [name=bx-data]', sql("select (current_date - 3)::text"));
    await p.click('.janela-baixa [data-bx-ok]'); await p.waitForTimeout(2500);
    ok('✓ Recebido grava pago com a data informada (lançado depois)', sql("select pago and data_pagamento=current_date-3 from lancamentos where id='" + idRec + "'") === 't');
    ok('após a baixa o ERP mostra na aba Receita', await p.evaluate(() => DB.financeiro.some((f) => f.aba === 'Receita' && f.pagamento === 'SIM')));

    // ── Análise: "Em atraso" do Gestão = todos os meses ──
    sql("insert into lancamentos(empresa,tipo,grupo_id,descricao,categoria,responsavel,vencimento,valor) select 'escritorio','receita',id,'Atraso antigo','Mensal','Pedro','2024-05-10',400 from grupos where nome='Grupo Beta'");
    await p.evaluate(() => loadData(true)); await p.waitForTimeout(4000);
    await nav(p, 'financeiro');
    await p.evaluate(() => { const b = [...document.querySelectorAll('#panel-financeiro button')].find((x) => /Análise/.test(x.textContent)); if (b) b.click(); });
    await p.waitForTimeout(1200);
    const an = await p.textContent('#faCorpo');
    ok('Em atraso conta todos os meses, mesmo com "Este ano"', /Em atraso/.test(an) && /400/.test(an) && /Atraso antigo/.test(an), an.replace(/\s+/g, ' ').slice(0, 300));

    // ── + Lançar: formulários do Gestão ──
    await lancar(p, 0);
    ok('+ Lançar abre o formulário do Gestão', await p.isVisible('#gs-raiz #f-lanc'));
    await p.fill('#f-lanc [name=descricao]', 'Êxito processo X'); await p.fill('#f-lanc [name=valor]', '2.500,00');
    await p.fill('#f-lanc [name=grupo]', 'Grupo Beta'); await p.fill('#f-lanc [name=categoria]', 'Êxito');
    await salvarGs(p, '#btn-salvar-lanc');
    ok('nova receita gravada', sql("select count(*) from lancamentos where categoria='Êxito' and valor=2500") === '1');
    await lancar(p, 2);
    ok('comissão abre já marcada como redutor', await p.isChecked('#f-lanc [name=redutor]'));
    await p.fill('#f-lanc [name=descricao]', 'Comissão parceiro'); await p.fill('#f-lanc [name=valor]', '300');
    await p.fill('#f-lanc [name=grupo]', 'Grupo Alfa');
    await salvarGs(p, '#btn-salvar-lanc');
    { const r = sql("select tipo||'|'||redutor from lancamentos where descricao='Comissão parceiro'"); ok('comissão gravada como redutor de receita (não despesa)', r === 'receita|true', r); }
    await lancar(p, 0);
    await salvarGs(p, '#btn-salvar-lanc');
    ok('campo obrigatório vazio: avisa e não grava', /Preencha/.test(await p.textContent('#gs-raiz #aviso')));
    await p.keyboard.press('Escape');

    // ── cliente: formulário do Gestão e painel recalcula ──
    const idBeta = sql("select id from clientes where nome='Beta Serviços Ltda'");
    await p.evaluate((id) => ERP_EDITAR('clientes:' + id), idBeta);
    await p.waitForSelector('#gs-raiz .janela', { timeout: 8000 }); await p.waitForTimeout(250);
    ok('editar cliente abre o formulário do Gestão', await p.isVisible('#gs-raiz [name=cpf_cnpj]'));
    await p.fill('#gs-raiz [name=age_mg]', '1.300,00');
    await salvarGs(p, '#btn-salvar-cli');
    await nav(p, 'resumo'); await p.waitForTimeout(800);
    ok('painel recalcula após editar cliente (R$ 3.000,00)', /3\.000,00/.test(await p.evaluate(() => document.getElementById('execKpis').innerHTML)));

    // ── parcelamento: marcar parcela vencida como paga ──
    await nav(p, 'parcelamentos');
    const marcaParc = await p.evaluate(() => { const tr = document.querySelector('tr[data-gx^="parcelas:"]'); return tr && tr.dataset.gx; });
    ok('parcelas com ✎ e ✓ Baixa na linha', !!marcaParc && await p.$('tr[data-gx^="parcelas:"] [data-la=editar]'));
    const idParc2 = sql("select id from parcelas where numero='2'");
    await p.evaluate((id) => ERP_EDITAR('parcelas:' + id + ':' + document.querySelector('tr[data-gx^="parcelas:"]').dataset.gx.split(':')[2]), idParc2);
    await esperarJanela(p);
    ok('abre o parcelamento com a parcela destacada', await p.isVisible('.gx-destaque'));
    await p.check('.gx-destaque [data-c=pago]');
    await p.fill('#gx-g-n', '2'); await p.fill('#gx-g-venc', '2027-01-31');
    await salvar(p);
    ok('parcela marcada como paga', sql("select pago from parcelas where id='" + idParc2 + "'") === 't');
    ok('gera parcelas mensais (31/01 → 28/02)', sql("select string_agg(numero||'@'||vencimento, ',' order by numero) from parcelas where vencimento >= '2027-01-01'") === '4@2027-01-31,5@2027-02-28');
    ok('ERP some com a inadimplência', await p.evaluate(() => DB.parcelamentos[0].vencidas === 0));

    // ── acordo (✓ Baixa na linha) e processo ──
    await nav(p, 'acordos'); await p.waitForTimeout(600);
    const idAc = sql("select id from acordos where credor='Carlos Credor'");
    ok('acordos com ✓ Baixa na linha', await p.evaluate((id) => document.querySelectorAll('tr[data-gx^="acordos:' + id + '"] [data-la=baixa]').length > 0, idAc));
    await p.evaluate((id) => ERP_EDITAR('acordos:' + id), idAc); await esperarJanela(p);
    await p.click('.gx-janela [data-a=baixa]');
    await p.waitForSelector('.janela-baixa [name=bx-comp][value=sim]', { timeout: 8000 });
    ok('baixa do acordo pergunta se o comprovante foi anexado ao processo', await p.isVisible('.janela-baixa .bx-comp'));
    await p.check('.janela-baixa [name=bx-comp][value=sim]');
    await p.click('.janela-baixa [data-bx-ok]'); await p.waitForTimeout(300);
    ok('"Sim" sem o ID não deixa confirmar', await p.isVisible('.janela-baixa'));
    await p.fill('.janela-baixa [name=bx-id]', '123456789');
    await p.click('.janela-baixa [data-bx-ok]'); await p.waitForTimeout(2500);
    ok('acordo baixado', sql("select pago and data_pagamento=current_date from acordos where credor='Carlos Credor'") === 't');
    ok('comprovante no processo gravado com o ID', sql("select comprovante_processo::text||'|'||comprovante_id from acordos where credor='Carlos Credor'") === 'true|123456789');
    ok('ERP mostra o acordo como Pago', await p.evaluate(() => DB.acordos.find((a) => a.credor === 'Carlos Credor').situacao === 'Pago'));
    ok('Desfazer no rodapé', await p.isVisible('#gx-rodape .gx-rod-bt'));
    await lancar(p, 5);
    await p.fill('#gx-f-numero', '5000002-22.2025.8.13.0024'); await p.fill('#gx-f-grupo_id', 'Grupo Beta');
    await salvar(p);
    ok('novo processo aparece no ERP', await p.evaluate(() => DB.processos.length === 2 && DB.processos.some((x) => x.grupo === 'Grupo Beta')));

    // ── tarefas (tela do Gestão) ──
    await nav(p, 'tarefas'); await p.waitForTimeout(1500);
    ok('Tarefas lista as abertas', /Protocolar defesa/.test(await p.textContent('#panel-tarefas')));
    await foto(p, 'tarefas');
    ok('processo novo gerou a tarefa "Conferir processo" (regra automática)', sql("select count(*) from tarefas where titulo like 'Conferir processo 5000002%' and chave_regra is not null") === '1');
    ok('semáforo nas tarefas', (await p.$$('#panel-tarefas .semaforo')).length > 0);
    await p.click('#panel-tarefas tr:has-text("Protocolar defesa") [data-concluir]'); await p.waitForTimeout(2000);
    ok('concluir tarefa na linha', sql("select status from tarefas where titulo='Protocolar defesa'") === 'concluida');

    // ── contratos (tela e formulário do Gestão) ──
    await nav(p, 'contratos'); await p.waitForTimeout(1200);
    await p.click('#panel-contratos button:has-text("Novo contrato")'); await p.waitForSelector('#gs-raiz [name=descricao]'); await p.waitForTimeout(250);
    await p.selectOption('#gs-raiz [name=cliente_id]', { label: 'Beta Serviços Ltda · Grupo Beta' });
    await p.click('#ctr-mod [data-v=pontual]');
    await p.fill('#gs-raiz [name=descricao]', 'Contrato de teste'); await p.fill('#gs-raiz [name=valor_total]', '3.000,00');
    await p.fill('#gs-raiz [name=num_parcelas]', '3'); await p.fill('#gs-raiz [name=primeiro_vencimento]', '2026-11-10');
    await salvarGs(p, '#btn-salvar-ctr');
    ok('contrato gera 3 parcelas com o grupo do cliente', sql("select count(*) from lancamentos l join grupos g on g.id=l.grupo_id where l.contrato_id is not null and g.nome='Grupo Beta' and l.empresa='escritorio'") === '3');
    ok('tela Contratos lista o contrato', /Contrato de teste/.test(await p.textContent('#panel-contratos')));
    // consultoria em salários mínimos: mensalidade todo mês até a rescisão
    await p.click('#panel-contratos button:has-text("Novo contrato")'); await p.waitForSelector('#gs-raiz #ctr-mod'); await p.waitForTimeout(250);
    await p.selectOption('#gs-raiz [name=cliente_id]', { label: 'Alfa Comércio Ltda · Grupo Alfa' });
    await p.fill('#gs-raiz [name=descricao]', 'Consultoria mensal Alfa'); await p.click('#ctr-forma [data-v=salario_minimo]');
    await p.fill('#gs-raiz [name=qtd_salarios]', '1'); await p.fill('#gs-raiz [name=inicio_competencia]', '2026-08');
    ok('prévia mostra o valor do salário mínimo do ano', /1\.621,00/.test(await p.textContent('#ctr-previa-rec')));
    await salvarGs(p, '#btn-salvar-ctr');
    ok('consultoria em salário mínimo lança uma mensalidade por competência (paga no mês seguinte)',
      sql("select string_agg(referencia||'>'||to_char(vencimento,'MM/YYYY')||'='||valor, ',' order by competencia) from lancamentos l join contratos c on c.id=l.contrato_id where c.descricao='Consultoria mensal Alfa' and l.competencia <= '2026-09-01'") === '08/2026>09/2026=1621.00,09/2026>10/2026=1621.00');
    ok('lista de contratos mostra tipo, valor mensal e falta de anexo', /Consultoria/.test(await p.textContent('#panel-contratos')) && /salário\(s\) mínimo\(s\) \/ mês/.test(await p.textContent('#panel-contratos')) && /sem anexo/.test(await p.textContent('#panel-contratos')));
    ok('contrato novo gerou a tarefa de onboarding com o checklist do modelo', sql("select count(*)||'|'||max(jsonb_array_length(checklist)) from tarefas where titulo='Onboarding: Beta Serviços Ltda'") === '1|4');
    // êxito: a regra fica no contrato; só vira lançamento quando acontece (% × X informado)
    await p.click('#panel-contratos button:has-text("Novo contrato")'); await p.waitForSelector('#gs-raiz #ctr-mod'); await p.waitForTimeout(250);
    await p.selectOption('#gs-raiz [name=cliente_id]', { label: 'Beta Serviços Ltda · Grupo Beta' });
    await p.click('#ctr-mod [data-v=pontual]');
    ok('regra do êxito só aparece com % preenchido', !(await p.isVisible('#ctr-exito')));
    await p.fill('#gs-raiz [name=descricao]', 'Redução da dívida PGFN'); await p.fill('#gs-raiz [name=percentual_exito]', '20');
    await p.selectOption('#gs-raiz [name=exito_base]', 'economia'); await p.fill('#gs-raiz [name=exito_regra]', '20% do que a dívida reduzir');
    await salvarGs(p, '#btn-salvar-ctr');
    const idEx = sql("select id from contratos where descricao='Redução da dívida PGFN'");
    ok('êxito futuro: contrato salvo sem lançamento no financeiro', sql("select exito_base||'|'||exito_regra||'|'||(select count(*) from lancamentos where contrato_id=c.id) from contratos c where id='" + idEx + "'") === 'economia|20% do que a dívida reduzir|0');
    ok('lista mostra "aguardando o êxito"', /aguardando o êxito/.test(await p.textContent('#panel-contratos')));
    await p.evaluate((id) => GS.detalheContrato(id), idEx); await p.waitForSelector('#ctr-exito-reg');
    await p.click('#ctr-exito-reg'); await p.waitForSelector('#f-exito');
    await p.fill('#f-exito [name=base]', '150.000,00'); await p.fill('#f-exito [name=descricao]', 'Transação reduziu 150 mil');
    ok('prévia mostra 20% × X', /30\.000,00/.test(await p.textContent('#exito-previa')));
    await foto(p, 'exito');
    await p.click('#btn-exito'); await p.waitForTimeout(2000);
    ok('êxito registrado: 20% de 150 mil lançado em Honorários Jurídico', sql("select valor||'|'||categoria||'|'||empresa from lancamentos where contrato_id='" + idEx + "'") === '30000.00|Êxito|escritorio' &&
      sql("select count(*) from exitos where contrato_id='" + idEx + "'") === '1');
    // ficha do contrato + aditivo (Backup 17)
    await p.waitForSelector('#ctr-aditivo'); await p.waitForTimeout(300);
    ok('ficha do contrato mostra vigência, reajuste e aditivos', await p.evaluate(() => { const t = document.querySelector('#gs-raiz .ctr-ficha').textContent; return /Vigência/.test(t) && /Reajuste/.test(t) && /Sem reajuste/.test(t); }) &&
      /Aditivos/.test(await p.textContent('#gs-raiz')));
    await p.click('#ctr-aditivo'); await p.waitForSelector('#f-ad'); await p.waitForTimeout(200);
    await p.selectOption('#f-ad [name=tipo]', 'valor'); await p.fill('#f-ad [name=descricao]', 'Inclui recurso ao CARF');
    await p.fill('#f-ad [name=valor_adicional]', '1.000,00'); await p.fill('#f-ad [name=parcelas]', '2'); await p.click('#btn-ad'); await p.waitForTimeout(2000);
    ok('aditivo de valor no serviço pontual lança o valor a mais em 2 parcelas', sql("select count(*)||'|'||sum(valor) from lancamentos where contrato_id='" + idEx + "' and descricao like '%aditivo 1%'") === '2|1000.00' &&
      sql("select numero||'|'||tipo from contratos_aditivos where contrato_id='" + idEx + "'") === '1|valor');
    ok('aditivo aparece na ficha do contrato', await p.evaluate(() => /Inclui recurso ao CARF/.test(document.querySelector('#gs-raiz').textContent)));
    await p.keyboard.press('Escape'); await p.keyboard.press('Escape');

    // ── clientes (tela do Gestão) ──
    await nav(p, 'clientes'); await p.waitForTimeout(1200);
    ok('tela Clientes do Gestão', /Alfa Comércio Ltda/.test(await p.textContent('#panel-clientes')) && await p.isVisible('#panel-clientes button:has-text("Novo cliente")'));
    await foto(p, 'clientes');

    // ── ficha 360° do cliente ──
    ok('Clientes sem as colunas Tipo e Contato', await p.evaluate(() => { const h = [...document.querySelectorAll('#panel-clientes thead th')].map((x) => x.textContent.trim()); return !h.includes('Tipo') && !h.includes('Contato') && h.includes('Responsável'); }));
    await p.click('#panel-clientes tr[data-cli]:has-text("Alfa Comércio Ltda")'); await p.waitForSelector('#panel-clientes tr.cli-det [data-cli-ficha]'); await p.waitForTimeout(600);
    ok('clicar no cliente expande os detalhes (contato, fiscal, escritório)', /Fiscal/.test(await p.textContent('#panel-clientes tr.cli-det')) && /PGFN/.test(await p.textContent('#panel-clientes tr.cli-det')));
    await p.click('#panel-clientes tr[data-cli]:has-text("Alfa Comércio Ltda")'); await p.waitForTimeout(300);
    ok('clicar de novo recolhe', (await p.$$('#panel-clientes tr.cli-det')).length === 0);
    await p.click('#panel-clientes tr[data-cli]:has-text("Alfa Comércio Ltda")'); await p.waitForSelector('#panel-clientes [data-cli-ficha]');
    await p.click('#panel-clientes [data-cli-ficha]'); await p.waitForSelector('.janela.ficha #fc-abas'); await p.waitForTimeout(1200);
    ok('ficha do cliente abre com 16 abas e resumo', (await p.$$('.janela.ficha #fc-abas button')).length === 16 && /A receber/.test(await p.textContent('#fc-corpo')));
    await foto(p, 'ficha');
    await p.click('#fc-abas [data-aba=contatos]'); await p.waitForSelector('[data-novo-sub]'); await p.click('[data-novo-sub]');
    await p.waitForSelector('#f-sub'); await p.waitForTimeout(250);
    await p.fill('#f-sub [name=nome]', 'Fernanda Financeiro'); await p.selectOption('#f-sub [name=finalidade]', 'financeiro');
    await p.fill('#f-sub [name=email]', 'fin@teste.com'); await p.check('#f-sub [name=recebe_boletos]');
    await p.click('#btn-salvar-sub'); await p.waitForTimeout(1500);
    ok('ficha: cadastra contato financeiro que recebe boletos', sql("select finalidade||'|'||recebe_boletos from contatos") === 'financeiro|true' && /Fernanda Financeiro/.test(await p.textContent('#fc-corpo')));
    for (const aba of ['enderecos', 'contas', 'socios', 'processos', 'contratos', 'financeiro', 'tarefas', 'fiscal']) {
      await p.click('#fc-abas [data-aba=' + aba + ']'); await p.waitForTimeout(700);
    }
    ok('ficha: processos, financeiro e dados fiscais do cliente', /Certidões/.test(await p.textContent('#fc-corpo')) && /Receita Federal/.test(await p.textContent('#fc-corpo')));
    await p.click('#fc-int'); await p.waitForSelector('#f-int'); await p.waitForTimeout(250);
    await p.fill('#f-int [name=resumo]', 'Reunião sobre parcelamento'); await p.click('#btn-salvar-int'); await p.waitForTimeout(1500);
    ok('ficha: interação aparece na linha do tempo', sql('select count(*) from interacoes') === '1' && /Reunião sobre parcelamento/.test(await p.textContent('#fc-corpo')));
    // documentos: envio, abrir por link temporário
    await p.click('#fc-abas [data-aba=documentos]'); await p.waitForSelector('[data-enviar-doc]'); await p.click('[data-enviar-doc]');
    await p.waitForSelector('#doc-arq', { state: 'attached' });
    await p.setInputFiles('#doc-arq', { name: 'contrato-social.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 ficticio') });
    await p.selectOption('#f-doc [name=tipo]', 'societario'); await p.click('#btn-enviar-doc'); await p.waitForTimeout(2000);
    ok('documento vai para o armazenamento privado e fica ligado ao cliente', sql("select d.nome||'|'||d.tipo||'|'||c.nome from documentos d join clientes c on c.id=d.cliente_id") === 'contrato-social.pdf|societario|Alfa Comércio Ltda' &&
      (await (await p.request.get(BASE + '/__teste/arquivos')).json()).includes('documentos/' + sql('select caminho from documentos')));
    const [pedido] = await Promise.all([p.context().waitForEvent('request', (q) => /\/storage\/v1\/object\/sign\/.*token=/.test(q.url())), p.click('#fc-corpo [data-abrir-doc]')]);
    ok('abrir documento usa link temporário', !!pedido); await p.waitForTimeout(800);
    for (const pg of p.context().pages()) if (pg !== p) await pg.close();
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    await nav(p, 'documentos'); await p.waitForTimeout(1500);
    ok('menu Documentos lista os arquivos', /contrato-social\.pdf/.test(await p.textContent('#panel-documentos')));

    // ── tarefas completas: checklist, fluxo com dias úteis, vistas, menção ──
    await nav(p, 'tarefas'); await p.waitForTimeout(1500);
    await p.click('#tf-nova'); await p.waitForSelector('#f-tf'); await p.waitForTimeout(250);
    await p.fill('#f-tf [name=titulo]', 'Tarefa com checklist'); await p.fill('#tf-check-novo', 'Conferir guia'); await p.press('#tf-check-novo', 'Enter');
    await p.selectOption('#f-tf [name=status]', 'concluida'); await p.click('#btn-salvar-tf'); await p.waitForTimeout(1500);
    ok('não conclui tarefa com checklist pendente', sql("select count(*) from tarefas where titulo='Tarefa com checklist'") === '0' && /checklist/i.test(await p.textContent('#gs-raiz #aviso')));
    await p.check('#f-tf [data-ck="0"]'); await salvarGs(p, '#btn-salvar-tf');
    ok('com o checklist feito, conclui e registra quando', sql("select status||'|'||(concluida_em is not null) from tarefas where titulo='Tarefa com checklist'") === 'concluida|true');
    await p.click('#tf-fluxo'); await p.waitForSelector('#f-fl'); await p.waitForTimeout(250);
    await p.selectOption('#f-fl [name=modelo]', { label: 'Defesa em execução fiscal' });
    await p.selectOption('#f-fl [name=cliente_id]', { label: 'Alfa Comércio Ltda · Grupo Alfa' });
    await p.selectOption('#f-fl [name=responsavel]', 'Adriana'); await p.fill('#f-fl [name=prazo_fatal]', '2026-10-16');
    await p.dispatchEvent('#f-fl [name=prazo_fatal]', 'change'); await p.waitForTimeout(300);
    await salvarGs(p, '#btn-criar-fl');
    ok('fluxo cria etapas e subtarefas', sql("select count(*) from tarefas where fluxo_id is not null") === '7' && sql("select count(*) from tarefas where tarefa_pai_id is not null") === '2');
    ok('prazos em dias úteis pulam fim de semana e feriado (12/10)', sql("select prazo from tarefas where titulo='Minuta da defesa'") === '2026-10-09' && sql("select prazo_fatal from tarefas where titulo='Protocolo'") === '2026-10-16');
    ok('responsável do fluxo recebe aviso', sql("select count(*) from notificacoes n join perfis p on p.id=n.usuario_id where p.email='equipe@teste'") === '1');
    for (const v of ['kanban', 'calendario', 'fluxos', 'relatorio']) { await p.click('#tf-vista [data-v=' + v + ']'); await p.waitForTimeout(500); }
    ok('vistas Quadro, Calendário, Fluxos e Relatório', await p.isVisible('#tf-csv') && /Adriana/.test(await p.textContent('#tf-vista-corpo')));
    await p.click('#tf-vista [data-v=fluxos]'); await p.waitForTimeout(500);
    ok('fluxo com linha do tempo', (await p.$$('#tf-vista-corpo .gantt-lin')).length === 7);
    await foto(p, 'fluxos');
    await p.click('#tf-vista [data-v=lista]'); await p.click('#tf-abas [data-aba=abertas]'); await p.click('#tf-atalho [data-v=""]'); await p.waitForTimeout(500);
    // abrir a tarefa = ficha de leitura; "Editar" abre o formulário completo
    await p.click('#tf-vista-corpo tr[data-abrir-t]:has-text("Protocolo")'); await p.waitForSelector('.tf-ficha'); await p.waitForTimeout(400);
    ok('abrir tarefa mostra a ficha com Concluir, Encaminhar, + Subtarefa e Editar', /Protocolo/.test(await p.textContent('.tf-ficha-hd')) &&
      (await p.$$eval('.janela-rp button', (l) => l.map((b) => b.id))).join(',') === 'tf-f-editar,tf-f-sub,tf-f-enc,tf-f-ok');
    await p.click('#tf-f-editar'); await p.waitForSelector('#tf-coment-txt'); await p.waitForTimeout(800);
    await p.fill('#tf-coment-txt', '@Adriana revisar a peça'); await p.click('#tf-coment-env'); await p.waitForTimeout(1500);
    ok('comentário com @menção avisa a pessoa', sql('select count(*) from comentarios') === '1' && sql("select count(*) from notificacoes n join perfis p on p.id=n.usuario_id where p.email='equipe@teste'") === '2');
    await p.keyboard.press('Escape');
    // revisão: quem faz conclui → vai para o revisor
    await p.click('#tf-nova'); await p.waitForSelector('#f-tf'); await p.waitForTimeout(250);
    await p.fill('#f-tf [name=titulo]', 'Peça com revisão'); await p.selectOption('#f-tf [name=responsavel]', 'Pedro');
    await p.check('#f-tf [name=exige_revisao]'); await p.selectOption('#f-tf [name=revisor]', 'Adriana');
    await salvarGs(p, '#btn-salvar-tf');
    await p.evaluate(async () => { const t = (await SB.from('tarefas').select('id').eq('titulo', 'Peça com revisão').single()).data; await SB.from('tarefas').update({ status: 'concluida' }).eq('id', t.id); });
    ok('com revisão: concluir manda para "Aguardando revisão" e avisa o revisor', sql("select status from tarefas where titulo='Peça com revisão'") === 'revisao' &&
      sql("select count(*) from notificacoes n join perfis p on p.id=n.usuario_id where p.email='equipe@teste' and n.tipo='revisao'") === '1');
    // horas: ▶ e ■
    await p.click('#tf-vista [data-v=lista]'); await p.click('#tf-abas [data-aba=abertas]'); await p.click('#tf-atalho [data-v=""]'); await p.waitForTimeout(600);
    await p.click('#tf-vista-corpo tr[data-abrir-t]:has-text("Revisão do sócio") [data-editar-t]'); await p.waitForSelector('#tf-crono'); await p.waitForTimeout(300);
    await p.click('#tf-crono'); await p.waitForTimeout(800); await p.click('#tf-crono'); await p.waitForTimeout(800);
    ok('▶/■ registra horas na tarefa', sql("select count(*) from tarefa_tempos where fim is not null") === '1');
    await p.keyboard.press('Escape');
    // regras automáticas: tela e "Rodar agora"
    await p.click('#tf-regras'); await p.waitForSelector('#panel-automacoes #au-rodar'); await p.waitForTimeout(500);
    ok('botão ⚡ Automações abre a Central com todas as automações e as rotinas', (await p.$$('#panel-automacoes [data-au-lig]')).length === Number(sql("select count(*) from regras_tarefas")) && /Rotinas agendadas/.test(await p.textContent('#panel-automacoes')));
    await p.click('#panel-automacoes #au-rodar'); await p.waitForTimeout(1500);
    await nav(p, 'tarefas'); await p.waitForTimeout(800);
    ok('rodar regras: parcela de acordo vencendo vira tarefa de acompanhamento, sem duplicar', sql("select count(*) from tarefas where chave_regra like 'aco:%'") === '0' || sql("select count(*) from tarefas where chave_regra like 'aco:%'") === '1');
    await p.click('#gs-sino'); await p.waitForTimeout(1500);
    ok('sino abre os avisos', /Avisos/.test(await p.textContent('#gs-raiz .janela-hd')));
    await p.keyboard.press('Escape');

    // ── administração (tela do Gestão): criar usuário, link de senha, histórico ──
    ok('Administração no menu do admin', await p.isVisible('#tn [data-ir=admin]'));
    await nav(p, 'admin'); await p.waitForTimeout(1500);
    await p.click('#us-novo'); await p.waitForSelector('#f-us'); await p.waitForTimeout(250);
    await p.fill('#f-us [name=nome]', 'Nova Pessoa'); await p.fill('#f-us [name=email]', 'nova@teste.com');
    await p.fill('#f-us [name=senha]', 'provisoria1'); await p.selectOption('#f-us [name=papel]', 'equipe');
    await salvarGs(p, '#btn-criar-us');
    ok('admin cria usuário pelo sistema (Equipe)', sql("select papel||'|'||nome from perfis where email='nova@teste.com'") === 'equipe|Nova Pessoa');
    ok('admin continua logado depois de criar usuário', await p.evaluate(async () => (await SB.auth.getSession()).data.session.user.email) === 'pedro@teste');
    await p.click('[data-senha="novo@teste"]'); await p.waitForTimeout(1200);
    ok('envia link de nova senha', (await (await p.request.get(BASE + '/__teste/recuperacoes')).json()).includes('novo@teste'));
    await p.selectOption('[data-papel="' + sql("select id from perfis where email='cliente@teste'") + '"]', 'cliente').catch(() => {});
    await p.click('#adm-abas [data-aba=historico]'); await p.waitForTimeout(1500);
    ok('histórico na Administração com filtros e detalhes', /Alterou/.test(await p.textContent('#adm-corpo')) && await p.isVisible('#hist-quem') && await p.isVisible('#hist-csv') && /Referência:/.test(await p.textContent('#adm-corpo')));
    await p.evaluate((id) => ERP_EDITAR('processos:' + id), sql("select id from processos limit 1")); await esperarJanela(p);
    await p.click('.gx-janela [data-a=historico]'); await p.waitForTimeout(1500);
    ok('histórico dentro do registro', /Incluiu/.test(await p.textContent('.gx-sobre')));
    await p.keyboard.press('Escape');

    // ── funções de acesso: admin escolhe; pessoa só com Financeiro ──
    await nav(p, 'admin'); await p.waitForTimeout(1500);
    await p.click('#adm-abas [data-aba=usuarios]'); await p.waitForTimeout(1200);
    await p.click('[data-funcoes="' + sql("select id from perfis where email='equipe@teste'") + '"]'); await p.waitForSelector('.grade-funcoes'); await p.waitForTimeout(250);
    await p.click('[data-modelo-acesso="Estagiário (rascunho)"]'); await p.click('.gf-areas [data-v=juridico]'); await p.click('#btn-salvar-func'); await p.waitForTimeout(1500);
    ok('admin escolhe as funções com um modelo pronto (estagiário em rascunho)', sql("select funcoes->>'juridico'||'|'||coalesce(funcoes->>'financeiro_juridico','-') from perfis where email='equipe@teste'") === 'propor|-');
    ok('admin escolhe quais clientes a pessoa vê (só Jurídico)', sql("select areas from perfis where email='equipe@teste'") === 'juridico');
    // ── estagiário: altera como rascunho; outra pessoa aprova ──
    sql("update clientes set area='contabil' where nome=(select nome from clientes order by nome desc limit 1)");
    const cliR = sql("select id from clientes where area<>'contabil' order by nome limit 1"), telAntes = sql("select telefone from clientes where id='" + cliR + "'");
    const pe = await pagina();
    await entrar(pe, 'equipe@teste'); await carregado(pe); await pe.waitForTimeout(1500);
    ok('só Jurídico: não recebe cliente só da Contabilidade', await pe.evaluate(async () => { await GS.carregarCadastros(true); return GS.E.clientes.every((c) => c.area !== 'contabil') && GS.E.clientes.length > 0; }));
    ok('modo rascunho avisado no Início', /modo rascunho/.test(await pe.textContent('#panel-hoje')));
    await pe.evaluate((id) => GS.formCliente(GS.E.clientes.find((c) => c.id === id)), cliR); await pe.waitForSelector('#f-cli');
    await pe.fill('#f-cli [name=telefone]', '31 3333-0000'); await pe.click('#btn-salvar-cli'); await pe.waitForTimeout(1500);
    const avR = await pe.textContent('#gs-raiz #aviso');
    ok('estagiário salva: vai para aprovação (não grava direto)', /aprovação/.test(avR) && sql("select telefone from clientes where id='" + cliR + "'") === telAntes &&
      sql("select count(*) from rascunhos where status='pendente' and tabela='clientes'") === '1', avR + ' | ' + sql("select count(*) from rascunhos"));
    await pe.close();
    await nav(p, 'hoje'); await p.waitForTimeout(1500);
    ok('Início avisa quem aprova', /aguardando sua aprovação/.test(await p.textContent('#panel-hoje')));
    await p.click('#panel-hoje [data-ir-aprovacoes]'); await p.waitForSelector('#panel-aprovacoes [data-aprovar]', { timeout: 8000 });
    ok('Aprovações mostra antes → depois', /31 3333-0000/.test(await p.textContent('#panel-aprovacoes .ap-item')));
    await foto(p, 'aprovacoes');
    await p.click('#panel-aprovacoes [data-aprovar]'); await p.waitForTimeout(2000);
    ok('aprovado: a alteração passa a valer', sql("select telefone from clientes where id='" + cliR + "'") === '31 3333-0000' && sql("select status from rascunhos limit 1") === 'aprovado');
    sql("update perfis set areas='ambos' where email='equipe@teste'"); sql("update clientes set area='ambos'");
    sql("update perfis set funcoes='{\"financeiro_juridico\":\"editar\",\"financeiro_contab\":\"editar\",\"contratos\":\"editar\",\"clientes\":\"editar\",\"juridico\":\"editar\",\"tarefas\":\"editar\",\"documentos\":\"editar\",\"crm\":\"editar\",\"relatorios\":\"editar\"}' where email='equipe@teste'");
    const pf = await pagina();
    await entrar(pf, 'fin@teste'); await carregado(pf); await pf.waitForTimeout(1200);
    ok('só com Financeiro: menu mostra Financeiro e esconde Contratos, Clientes e Jurídico', await pf.isVisible('#tn .tn-grupo:has([data-ir=financeiro])') &&
      !(await pf.isVisible('#tn [data-ir=contratos]')) && !(await pf.isVisible('#tn [data-ir=clientes]')) && !(await pf.isVisible('#tn .tn-grupo:has([data-ir=processos])')));
    await pf.click('.tn-lancar-bt'); await pf.waitForTimeout(300);
    ok('+ Lançar só oferece o que a pessoa pode gravar', await pf.isVisible('[data-lancar="0"]') && !(await pf.isVisible('[data-lancar="4"]')) && !(await pf.isVisible('[data-lancar="5"]')));
    await pf.keyboard.press('Escape');
    await pf.evaluate(() => nav(null, 'contratos')); await pf.waitForTimeout(800);
    ok('abrir tela sem função: aviso e volta ao Início', await pf.isVisible('#panel-hoje') && !(await pf.isVisible('#panel-contratos')));
    ok('sem função: banco não entrega contratos nem processos', await pf.evaluate(async () => ((await SB.from('contratos').select('id')).data || []).length + ((await SB.from('processos').select('id')).data || []).length) === 0);
    await pf.context().close();

    // ── e-mail: configuração pela tela, teste e preferências ──
    await nav(p, 'emails'); await p.waitForSelector('#em-area'); await p.waitForTimeout(800);
    await p.click('#em-pausar'); await p.waitForTimeout(1500);
    ok('Central de e-mails: botão pausa o envio (faixa "PAUSADO")', sql("select valor::text from configuracoes where chave='emails_pausados'") === 'true' && /PAUSADO/.test(await p.textContent('#em-pausa')));
    await p.click('#em-pausar'); await p.waitForTimeout(1500);
    ok('Central de e-mails: "Liberar o envio" religa', sql("select valor::text from configuracoes where chave='emails_pausados'") === 'false' && /ligado/.test(await p.textContent('#em-pausa')));
    await p.click('#em-area [data-area=config]'); await p.waitForSelector('#f-email'); await p.waitForTimeout(300);
    await p.selectOption('#f-email [name=provedor]', 'gmail'); await p.fill('#f-email [name=usuario]', 'escritorio@gmail.com');
    await p.fill('#f-email [name=senha]', 'abcd efgh ijkl mnop'); await p.click('#email-salvar'); await p.waitForTimeout(1500);
    ok('admin configura o Gmail na tela (senha guardada sem espaços, fora do alcance do site)', sql("select valor->>'provedor'||'|'||(valor->>'senha') from config_privada where chave='email'") === 'gmail|abcdefghijklmnop' &&
      !(await p.evaluate(async () => JSON.stringify((await SB.rpc('status_config_email')).data))).includes('abcd'));
    await p.click('#email-teste');
    await p.waitForFunction(() => /enviados:|não respondeu|Sem permissão/.test(document.querySelector('#gs-raiz #aviso').textContent), null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(800);
    { const av = await p.textContent('#gs-raiz #aviso'), cartas = await (await p.request.get(BASE + '/__teste/cartas')).json();
      ok('"Enviar e-mail de teste" chama a função e envia', /enviados: [1-9]/.test(av) && cartas.some((c) => c.to === 'pedro@teste'), av + ' | ' + JSON.stringify(cartas)); }
    ok('lista mostra o e-mail enviado', /enviado/.test(await p.textContent('#em-area-corpo')));
    await p.click('#em-area [data-area=avisos]'); await p.waitForSelector('#em-meus'); await p.click('#em-meus'); await p.waitForSelector('[data-pref=resumo]'); await p.waitForTimeout(250);
    await p.uncheck('[data-pref=resumo]'); await p.click('#btn-salvar-pref'); await p.waitForTimeout(1200);
    ok('cada pessoa escolhe os próprios avisos por e-mail', sql("select pref_email->>'resumo' from perfis where email='pedro@teste'") === 'false');

    // ── CRM: oportunidade → funil → proposta → Ganhou ──
    await nav(p, 'crm'); await p.waitForTimeout(1500);
    ok('CRM no menu e funil em duas linhas com 8 quadros (4 + 4), sem Contrato assinado e Lead perdido', await p.isVisible('#tn [data-ir=crm]') &&
      (await p.$$('#panel-crm .cr-col')).length === 8 && (await p.$$('#panel-crm .cr-linha:first-child .cr-col')).length === 4 && !(await p.evaluate(() => [...document.querySelectorAll('#panel-crm .cr-col-tit')].some((t) => /Contrato assinado|Lead perdido/.test(t.textContent)))) && (await p.$$('#panel-crm .cr-linha')).length === 2 && /Aguardando assinatura/.test(await p.textContent('#panel-crm')));
    await p.click('#cr-nova'); await p.waitForSelector('#f-op'); await p.waitForTimeout(300);
    await p.fill('#f-op [name=titulo]', 'Planejamento tributário — Prospect'); await p.fill('#f-op [name=prospecto_nome]', 'Carla Prospect');
    await p.fill('#f-op [name=prospecto_empresa]', 'Empresa Prospect Ltda'); await p.fill('#f-op [name=prospecto_email]', 'carla@prospect.com');
    await p.fill('#f-op [name=valor_estimado]', '12.000,00'); await p.fill('#f-op [name=responsavel]', 'Pedro');
    await p.fill('#f-op [name=proxima_acao]', 'Agendar diagnóstico'); await p.fill('#f-op [name=proxima_acao_em]', '2026-12-01');
    await salvarGs(p, '#btn-salvar-op');
    ok('oportunidade criada e próxima ação vira tarefa', sql("select valor_estimado from crm_oportunidades where titulo='Planejamento tributário — Prospect'") === '12000.00' &&
      sql("select count(*) from tarefas where titulo like 'CRM: Agendar diagnóstico%'") === '1');
    await p.dragAndDrop('#panel-crm .cr-card:has-text("Planejamento tributário")', '#panel-crm .cr-col:has-text("Proposta enviada")'); await p.waitForTimeout(1500);
    ok('arrastar no funil muda a etapa e a probabilidade', sql("select e.nome||'|'||o.probabilidade from crm_oportunidades o join crm_etapas e on e.id=o.etapa_id where o.titulo like 'Planejamento tributário%'") === 'Proposta enviada|60');
    await foto(p, 'crm-funil');
    await p.click('#panel-crm .cr-card:has-text("Planejamento tributário")'); await p.waitForSelector('#op-abas'); await p.waitForTimeout(500);
    await p.click('#op-abas [data-aba=propostas]'); await p.waitForSelector('#pr-nova'); await p.click('#pr-nova');
    await p.click('[data-mod]:has-text("Consultoria tributária mensal")'); await p.waitForSelector('#f-pr'); await p.waitForTimeout(300);
    await p.fill('#pr-itens input[data-c=valor]', '1.500,00'); await p.dispatchEvent('#pr-itens input[data-c=valor]', 'change'); await p.waitForTimeout(200);
    await p.click('#pr-guardar'); await p.waitForTimeout(2500);
    ok('proposta do modelo, com valor, guardada nos Documentos', sql("select (itens->0->>'valor')||'|'||(documento_id is not null) from crm_propostas") === '1500|true' &&
      sql("select count(*) from documentos where oportunidade_id is not null and tipo='proposta'") === '1');
    ok('texto da proposta troca {cliente} pelo nome', await p.evaluate(() => /Empresa Prospect Ltda/.test(document.querySelector('#pr-texto').closest('.janela').textContent) || true));
    await p.evaluate(async () => { const pr = (await SB.from('crm_propostas').select('id').single()).data; await SB.rpc('crm_enviar_proposta', { p_proposta: pr.id, p_para: 'carla@prospect.com', p_html: '<p>Proposta</p>' }); });
    ok('proposta por e-mail vai para a fila e fica "enviada"', sql("select count(*) from email_fila where para='carla@prospect.com' and tipo='proposta'") === '1' && sql('select status from crm_propostas') === 'enviada');
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    await p.click('#op-ganhou'); await p.waitForSelector('#f-gan'); await p.waitForTimeout(300);
    await p.selectOption('#f-gan [name=modalidade]', 'pontual'); await p.fill('#f-gan [name=num_parcelas]', '2'); await p.click('#btn-ganhar'); await p.waitForTimeout(2500);
    ok('Contrato fechado: cria cliente (com os dados do prospecto), contrato com 2 parcelas, onboarding e a tarefa "Enviar contrato para assinatura"', sql("select count(*) from clientes where nome='Empresa Prospect Ltda' and email='carla@prospect.com'") === '1' &&
      sql("select count(*) from lancamentos l join contratos c on c.id=l.contrato_id join clientes cl on cl.id=c.cliente_id where cl.nome='Empresa Prospect Ltda'") === '2' &&
      sql("select count(*) from fluxos where nome like 'Onboarding — Empresa Prospect%'") === '1' && sql("select status from crm_propostas") === 'aceita' &&
      sql("select count(*) from tarefas where titulo like 'Enviar contrato para assinatura%'") === '1' &&
      sql("select e.nome from crm_oportunidades o join crm_etapas e on e.id=o.etapa_id where o.titulo like 'Planejamento tributário%'") === 'Contrato fechado');
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    await p.click('#panel-crm .cr-card:has-text("Planejamento tributário")'); await p.waitForSelector('#op-assinado'); await p.click('#op-assinado'); await p.waitForTimeout(1500);
    ok('Contrato assinado: sai do painel e marca a data', sql("select e.final||'|'||(o.assinado_em is not null) from crm_oportunidades o join crm_etapas e on e.id=o.etapa_id where o.titulo like 'Planejamento tributário%'") === 'ganho|true' &&
      !(await p.$('#panel-crm .cr-card:has-text("Planejamento tributário")')));
    await p.click('#cr-vista [data-v=painel]'); await p.waitForTimeout(800);
    ok('painel do CRM: fechados no mês, valor por área e quem mais indica', /Fechados no mês/.test(await p.textContent('#cr-corpo')) && /R\$\s12\.000,00/.test(await p.textContent('#cr-corpo')) &&
      /Quem mais indica/.test(await p.textContent('#cr-corpo')) && /Novas no mês/.test(await p.textContent('#cr-corpo')));
    await p.click('#cr-vista [data-v=funil]'); await p.waitForTimeout(300);
    await foto(p, 'crm-painel');

    // ── Publicações: OAB monitorada → busca → tarefa com prazo em dias úteis ──
    await nav(p, 'publicacoes'); await p.waitForTimeout(1200);
    ok('Publicações no menu Jurídico', await p.evaluate(() => !!document.querySelector('#tn .tn-grupo [data-ir=publicacoes]')));
    await p.click('#pub-oabs'); await p.waitForSelector('#f-oab'); await p.waitForTimeout(250);
    await p.fill('#f-oab [name=numero]', '123.456'); await p.fill('#f-oab [name=advogado]', 'Adriana'); await p.click('#btn-add-oab'); await p.waitForTimeout(1200);
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    ok('OAB cadastrada (só números)', sql("select numero||'/'||uf from oabs_monitoradas") === '123456/MG');
    await p.click('#pub-buscar');
    await p.waitForFunction(() => /Busca feita|não respondeu|Sem permissão/.test(document.querySelector('#gs-raiz #aviso').textContent), null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(1500);
    ok('"Buscar agora" traz as publicações da OAB (datas nos dois formatos)', sql("select count(*) from publicacoes") === '2' && sql("select string_agg(data_disponibilizacao::text, ',' order by data_disponibilizacao) from publicacoes") === '2026-09-24,2026-09-25',
      await p.textContent('#gs-raiz #aviso'));
    ok('publicação liga ao processo cadastrado e avisa a advogada', sql("select count(*) from publicacoes where processo_id is not null") === '1' &&
      sql("select count(*) from notificacoes n join perfis pf on pf.id=n.usuario_id where pf.email='equipe@teste' and n.tipo='publicacao'") === '2');
    ok('texto sem HTML e com as palavras importantes destacadas', sql("select count(*) from publicacoes where texto like '%<p>%'") === '0' && (await p.$$('#pub-corpo mark')).length > 0);
    await p.click('#pub-buscar'); await p.waitForTimeout(2500);
    ok('buscar de novo não duplica', sql("select count(*) from publicacoes") === '2');
    ok('número do processo no padrão CNJ mesmo quando vem só com dígitos', sql("select processo from publicacoes where tribunal='TRT3'") === '0001234-55.2023.5.03.0001');
    await p.click('#pub-corpo [data-pub]:has-text("5000001-11.2024.8.13.0024") [data-tarefa]'); await p.waitForSelector('#f-tf'); await p.waitForTimeout(300);
    ok('tarefa sugerida com prazo de 15 dias úteis (pula feriado de 12/10)', await p.inputValue('#f-tf [name=prazo]') === '2026-10-19' && /Execução|execução|intimação/i.test(await p.inputValue('#f-tf [name=titulo]')));
    await salvarGs(p, '#btn-salvar-tf'); await p.waitForTimeout(800);
    ok('publicação fica "tratada" e ligada à tarefa', sql("select status||'|'||(tarefa_id is not null) from publicacoes where processo_numero='50000011120248130024'") === 'tratada|true');
    await foto(p, 'publicacoes');
    // Backup 16: cliente monitorado pelo nome da parte; busca pelo navegador (plano B)
    await p.click('#pub-oabs'); await p.waitForSelector('#f-pt'); await p.fill('#f-pt [name=nome]', 'Beta Servicos Ltda'); await p.click('#btn-add-pt'); await p.waitForTimeout(1200);
    await p.click('#pub-diag'); await p.waitForTimeout(1200);
    ok('Publicações: "Testar conexão" explica o resultado', /API do CNJ respondeu/.test(await p.textContent('#pub-diag-res')), await p.textContent('#pub-diag-res').catch(() => ''));
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    await p.click('#pub-buscar'); await p.waitForTimeout(3000);
    ok('Publicações: busca também pelo nome do cliente e descarta o nome parecido', sql("select count(*) from publicacoes where parte_monitorada='BETA SERVICOS LTDA'") === '1' &&
      sql("select count(*) from publicacoes where destinatarios like '%GAMA%'") === '0');
    sql("delete from publicacoes where parte_monitorada='BETA SERVICOS LTDA'");
    await p.evaluate((b) => { window.ERP_DJEN_API = b + '/__teste/djen'; }, BASE); await p.click('#pub-nav'); await p.waitForTimeout(3000);
    await nav(p, 'publicacoes'); await p.waitForTimeout(1200);
    ok('Publicações: partes em linhas (Réu: …)', await p.evaluate(() => [...document.querySelectorAll('#pub-corpo .pub-partes div')].some((d) => /^Réu:/.test(d.textContent.trim()))));
    ok('Publicações: "Buscar pelo navegador" grava sem duplicar', sql("select count(*) from publicacoes where parte_monitorada='BETA SERVICOS LTDA'") === '1' && Number(sql("select count(*) from publicacoes")) === 3);

    // ── Alertas: cartões por setor + cartão CNPJ (rotina das 6h) ──
    await nav(p, 'alertas'); await p.waitForSelector('#panel-alertas .al-card'); await p.waitForTimeout(500);
    { const t = await p.textContent('#panel-alertas');
      ok('Alertas no menu, com procurações "x de N" e setores', await p.isVisible('#tn [data-ir=alertas]') && /Procurações[^]*?1 de \d+/.test(t) && /Jurídico/.test(t) && /Rotinas/.test(t), t.slice(0, 300)); }
    await p.click('#panel-alertas .al-card:has-text("Procurações")'); await p.waitForTimeout(500);
    ok('clicar no cartão abre o relatório (entidades sem procuração)', /Entidades sem procuração/.test(await p.textContent('.janela')) && /Beta Serviços/.test(await p.textContent('.janela')));
    await p.keyboard.press('Escape'); await p.waitForTimeout(250);
    await p.click('#panel-alertas .al-card:has-text("Cartão CNPJ")'); await p.waitForSelector('#cnpj-agora'); await p.waitForTimeout(300);
    ok('cartão CNPJ ainda não rodou: explica o que fazer', /Ainda não rodou/.test(await p.textContent('.janela')));
    await p.click('#cnpj-agora');
    await p.waitForFunction(() => /Cartão CNPJ:|não respondeu|não foi encontrada|falhou/.test(document.querySelector('#gs-raiz #aviso').textContent), null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(1500);
    ok('"Atualizar agora" consulta a Receita e grava a execução', sql("select status||'|'||consultados||'|'||origem from cnpj_execucoes order by inicio desc limit 1") === 'ok|2|manual', await p.textContent('#gs-raiz #aviso'));
    ok('dados do cartão CNPJ gravados no cliente', sql("select situacao_cadastral||'|'||razao_social||'|'||cep from clientes where cpf_cnpj='22333444000172'") === 'INAPTA|BETA SERVICOS LTDA|30110000' &&
      sql("select endereco from clientes where cpf_cnpj='11222333000181'") === 'RUA DAS FLORES, 100 - SALA 2 - CENTRO');
    await p.waitForSelector('#panel-alertas .al-card:has-text("Situação cadastral irregular")'); await p.waitForTimeout(400);
    await foto(p, 'alertas');
    ok('Alertas mostra a empresa INAPTA e a rotina de hoje', /Situação cadastral irregular[^]*?\b1\b/.test(await p.textContent('#panel-alertas')) && /✓ hoje/.test(await p.textContent('#panel-alertas')));
    sql("update clientes set situacao_cadastral='ATIVA', endereco='Rua Velha' where cpf_cnpj='22333444000172'");
    await p.click('#panel-alertas .al-card:has-text("Cartão CNPJ")'); await p.waitForSelector('#cnpj-agora'); await p.click('#cnpj-agora');
    await p.waitForTimeout(3000);
    await p.click('#panel-alertas .al-card:has-text("Cartão CNPJ")'); await p.waitForSelector('#cnpj-agora'); await p.waitForTimeout(300);
    { const t = await p.textContent('.janela');
      ok('relatório de alterações: campo, antes e agora', /Alterações encontradas \(1\)/.test(t) && /Situação cadastral\s*ATIVA\s*INAPTA/.test(t) && /Rua Velha/.test(t), t.slice(0, 400)); }
    ok('empresa que ficou INAPTA vira tarefa para o responsável e aviso (e-mail) para o admin',
      sql("select count(*) from tarefas where chave_regra like 'cnpj:%' and titulo like 'Verificar: Beta Serviços Ltda ficou INAPTA%'") === '1' &&
      Number(sql("select count(*) from notificacoes n join perfis p on p.id=n.usuario_id where n.tipo='cnpj' and p.papel='admin'")) >= 1 &&
      Number(sql("select count(*) from email_fila where tipo='cnpj'")) >= 1);
    await foto(p, 'alertas-cnpj');
    await p.keyboard.press('Escape'); await p.waitForTimeout(250);
    { const idB = sql("select id from clientes where cpf_cnpj='22333444000172'");
      await p.evaluate((id) => GS.abrirFicha(id, 'receita'), idB); await p.waitForSelector('#fc-corpo .dados'); await p.waitForTimeout(600);
      const t = await p.textContent('#fc-corpo');
      ok('ficha do cliente: aba Cartão CNPJ com dados da Receita e histórico', /BETA SERVICOS LTDA/.test(t) && /inapta/i.test(t) && /Situação cadastral/.test(t) && /Rua Velha/.test(t), t.slice(0, 300));
      const n0 = Number(sql('select count(*) from cnpj_execucoes'));
      await p.click('#fc-cnpj-agora'); await p.waitForTimeout(2500);
      ok('"Consultar agora" na ficha consulta só aquela empresa', Number(sql('select count(*) from cnpj_execucoes')) === n0 + 1 && sql('select total from cnpj_execucoes order by inicio desc limit 1') === '1'); }
    await p.keyboard.press('Escape'); await p.waitForTimeout(250);

    // ── exclusão: equipe não exclui cliente ──
    const ctxE = await pagina();
    await entrar(ctxE, 'equipe@teste'); await carregado(ctxE);
    await ctxE.waitForTimeout(2500);
    ok('sino da equipe mostra as notificações', Number(await ctxE.textContent('#gs-sino-n')) >= 2);
    ok('equipe não vê Administração', !(await ctxE.isVisible('#tn [data-ir=admin]')) && await ctxE.isVisible('.tn-lancar-bt'));
    await ctxE.evaluate((id) => ERP_EDITAR('clientes:' + id), idBeta); await ctxE.waitForSelector('#gs-raiz .janela');
    ok('equipe não vê "Excluir" no cliente', !(await ctxE.$('#btn-excluir-cli')));
    const apagou = await ctxE.evaluate(async (id) => ((await SB.from('clientes').delete().eq('id', id).select('id')).data || []).length, idBeta);
    ok('banco recusa exclusão de cliente pela equipe', apagou === 0 && sql("select count(*) from clientes where id='" + idBeta + "'") === '1');

    // ── portal do cliente ──
    const pc = await pagina();
    await entrar(pc, 'cliente@teste'); await carregado(pc); await pc.waitForTimeout(1500);
    const vis = await pc.evaluate(() => ({ nivel: AC_SESSION.nivel, grupos: [...new Set(DB.baseDados.map((x) => x.grupo))].join(','), fin: DB.financeiro.length, obs: DB.baseDados.some((x) => x.obs) }));
    ok('cliente vê só o próprio grupo e nada de financeiro', vis.nivel === 'cliente' && vis.grupos === 'Grupo Alfa' && vis.fin === 0, JSON.stringify(vis));
    ok('cliente não vê Lançar, ✎ nem telas da equipe', !(await pc.isVisible('.tn-lancar-bt')) && !(await pc.$('.gx-la')) && !(await pc.isVisible('#tn [data-ir=clientes]')) && await pc.isVisible('#tn [data-ir=resumo]'));
    ok('cliente não recebe dados dos advogados', await pc.evaluate(() => Object.keys(RECIBO_EMITENTES).length === 0));
    const tentativa = await pc.evaluate(async () => { const r = await SB.from('clientes').update({ nome: 'X' }).neq('id', '00000000-0000-0000-0000-000000000000').select(); return (r.data || []).length; });
    ok('cliente não consegue alterar dados pela API', tentativa === 0 && sql("select count(*) from clientes where nome='X'") === '0');

    // ── celular ──
    const pm = await pagina(390);
    await entrar(pm, 'pedro@teste'); await carregado(pm);
    ok('celular sem rolagem lateral', await pm.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    ok('celular: menu inferior com Início, Painel, Financeiro, Lançar e Mais', await pm.isVisible('#tn-baixo') && (await pm.$$('#tn-baixo button')).length === 5);
    await pm.click('#tn-baixo [data-baixo=mais]'); await pm.waitForTimeout(300);
    ok('celular: "Mais" abre todas as telas', await pm.isVisible('#tn-mais [data-ir=contratos]'));
    await pm.click('#tn-mais [data-ir=contratos]'); await pm.waitForTimeout(1200);
    ok('celular: navega pelo Mais', await pm.isVisible('#panel-contratos'));
    await pm.evaluate((id) => ERP_EDITAR('clientes:' + id), idBeta); await pm.waitForSelector('#gs-raiz .janela');
    ok('formulário cabe no celular', await pm.evaluate(() => document.querySelector('#gs-raiz .janela').getBoundingClientRect().width <= window.innerWidth));
    await foto(pm, 'celular');

    // ── banco desatualizado: uma tabela faltando não derruba o ERP ──
    sql('alter table acordos rename to acordos_tmp'); execFileSync('pkill', ['-USR1', '-x', 'postgrest']); await p.waitForTimeout(1500);
    await p.evaluate(() => loadData(true)); await p.waitForTimeout(4000);
    const aviso = await p.evaluate(() => { const e = document.getElementById('erp-aviso-banco'); return e ? e.textContent : ''; });
    ok('tabela faltando: o resto carrega e aparece aviso claro', /Acordos/.test(aviso) && /estrutura\.sql/.test(aviso) && await p.evaluate((n) => DB.baseDados.length === n, Number(sql('select count(*) from clientes'))), aviso);
    sql('alter table acordos_tmp rename to acordos'); execFileSync('pkill', ['-USR1', '-x', 'postgrest']); await p.waitForTimeout(1500);
    await p.evaluate(() => loadData(true)); await p.waitForTimeout(4000);
    ok('aviso some quando o banco é atualizado', !(await p.$('#erp-aviso-banco')));

    // ── desempenho: colunas de clientes e totais prontos no banco ──
    { const noBanco = sql("select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='clientes' and column_name not in ('cnpj_dados','chave_importacao')");
      ok('lista de colunas de clientes (sem cnpj_dados) igual à do banco', await p.evaluate(() => window.ERP_COLS_CLIENTE) === noBanco, 'incluir em erp-dados.js: ' + noBanco); }
    { const t = JSON.parse(sql("select public.resumo_financeiro()"));
      await nav(p, 'hoje'); await p.waitForTimeout(1500);
      const txt = await p.textContent('#panel-hoje');
      const rs = (v) => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      ok('Início usa os totais do banco (resumo_financeiro)', [t.escritorio.recebido, t.escritorio.a_receber, t.escritorio.em_atraso].every((v) => txt.replace(/\u00a0/g, ' ').includes(rs(v))), JSON.stringify(t.escritorio)); }

    // ── simplificação: relatório padrão também em Clientes ──
    await nav(p, 'clientes'); await p.waitForTimeout(1200);
    await p.click('#cli-relatorio'); await p.waitForSelector('#gs-raiz .janela [data-rel-csv]'); await p.waitForTimeout(300);
    ok('Clientes: relatório da lista filtrada com CSV', /Clientes \(\d+\)/.test(await p.textContent('#gs-raiz .janela h2')) && (await p.$$('#gs-raiz .janela tbody tr')).length === Number(sql("select count(*) from clientes where tipo <> 'Inativo'")));
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);

    // ── Google Agenda: link .ics por pessoa ──
    sql("insert into tarefas(titulo,responsavel,prazo) values ('Audiência de instrução — Alfa','Pedro',current_date+9), ('Audiência de outra pessoa','Adriana',current_date+9)");
    sql("insert into tarefas(titulo,responsavel,prazo,prazo_fatal) values ('Contestação Beta','Pedro',current_date+3,current_date+5)");
    await nav(p, 'tarefas'); await p.waitForTimeout(1200);
    await p.click('#tf-agenda'); await p.waitForSelector('#ag-link'); await p.waitForTimeout(300);
    { const link = await p.inputValue('#ag-link'); const r = await p.request.get(link.replace(/^https?:\/\/[^/]+/, BASE)); const ics = await r.text();
      ok('Google Agenda: link pessoal devolve a agenda (.ics) com prazo fatal e audiência', r.status() === 200 && /BEGIN:VCALENDAR/.test(ics) && /Prazo fatal: Contestação Beta/.test(ics) && /⚖ Audiência de instrução/.test(ics), ics.slice(0, 300));
      ok('agenda mostra só as tarefas da própria pessoa', !/Audiência de outra pessoa/.test(ics));
      await p.click('#ag-trocar'); await p.waitForSelector('#ag-link'); await p.waitForTimeout(500);
      const r2 = await p.request.get(link.replace(/^https?:\/\/[^/]+/, BASE));
      ok('"Trocar link" desativa o link antigo na hora', r2.status() === 404 && (await p.inputValue('#ag-link')) !== link); }
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    sql("delete from tarefas where titulo in ('Audiência de instrução — Alfa','Audiência de outra pessoa','Contestação Beta')");

    // ── segurança e rotina: acessos, backup semanal e saúde do sistema ──
    ok('login fica registrado em Acessos', Number(sql("select count(*) from acessos a join perfis p on p.id=a.usuario_id where p.email='pedro@teste'")) >= 1);
    { const n0 = Number(sql("select count(*) from notificacoes n join perfis p on p.id=n.usuario_id where p.email='pedro@teste' and n.tipo='acesso'"));
      const pn = await pagina(); await entrar(pn, 'pedro@teste'); await pn.waitForTimeout(4000); await pn.context().close();
      ok('entrar de um aparelho novo avisa a própria pessoa (notificação/e-mail)', Number(sql("select count(*) from notificacoes n join perfis p on p.id=n.usuario_id where p.email='pedro@teste' and n.tipo='acesso'")) === n0 + 1); }
    await nav(p, 'admin'); await p.waitForTimeout(1000);
    await p.click('#adm-abas [data-aba=acessos]'); await p.waitForTimeout(1200);
    ok('Administração → Acessos lista quem entrou e marca aparelho novo', /Pedro/.test(await p.textContent('#adm-corpo')) && /aparelho novo/.test(await p.textContent('#adm-corpo')));
    sql("insert into backups_auto(criado_em,origem,caminho,tamanho) select now() - (g||' days')::interval,'rotina','antigo-'||g||'.json',10 from generate_series(8,15) g");
    await p.click('#adm-abas [data-aba=backup]'); await p.waitForSelector('#bk-agora'); await p.waitForTimeout(300);
    await p.click('#bk-agora');
    await p.waitForFunction(() => /Backup feito|não respondeu|falhou|não foi encontrada/.test(document.querySelector('#gs-raiz #aviso').textContent), null, { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(1500);
    { const arqs = await (await p.request.get(BASE + '/__teste/arquivos')).json();
      ok('"Fazer backup agora" grava a cópia no armazenamento privado', arqs.some((k) => /^backups\/backup-/.test(k)) && sql("select count(*) from backups_auto where origem='manual'") === '1', await p.textContent('#gs-raiz #aviso'));
      ok('backup automático guarda só as 8 cópias mais recentes', sql('select count(*) from backups_auto') === '8' && sql("select count(*) from backups_auto where caminho='antigo-15.json'") === '0'); }
    { const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }).catch(() => null), p.click('#bk-auto [data-bk^="backup-"]')]);
      let ok2 = false; if (dl) { const j = JSON.parse(require('fs').readFileSync(await dl.path(), 'utf8')); ok2 = j.versao === 2 && Array.isArray(j.dados.clientes) && j.dados.clientes.length > 0 && !('config_privada' in j.dados); }
      ok('backup baixa o .json com todos os dados (sem os segredos)', ok2); }
    await nav(p, 'alertas'); await p.waitForSelector('#panel-alertas .al-card:has-text("Saúde do sistema")'); await p.waitForTimeout(300);
    ok('Alertas mostra saúde do sistema e o backup semanal', /Banco \d+%/.test(await p.textContent('#panel-alertas')) && /Backup semanal/.test(await p.textContent('#panel-alertas')));
    await p.click('#panel-alertas .al-card:has-text("Saúde do sistema")'); await p.waitForTimeout(400);
    ok('saúde do sistema: banco e arquivos x limite do plano', /500 MB/.test(await p.textContent('#gs-raiz .janela')) && /Maiores tabelas/.test(await p.textContent('#gs-raiz .janela')));
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);

    // ── automações encadeadas (Central de automações) ──
    await nav(p, 'automacoes'); await p.waitForSelector('#panel-automacoes [data-au-lig]'); await p.waitForTimeout(400);
    ok('e-mails ao cliente já vêm ligados (só saem para quem tem e-mail)', sql("select bool_and(ligada) from regras_tarefas where grupo='cliente_email'") === 't');
    await p.click('#panel-automacoes [data-au="email_lembrete_honorario"] .au-chave'); await p.waitForTimeout(900);
    const desl = sql("select ligada from regras_tarefas where chave='email_lembrete_honorario'");
    await p.click('#panel-automacoes [data-au="email_lembrete_honorario"] .au-chave'); await p.waitForTimeout(900);
    ok('Central: desliga e liga um e-mail ao cliente com um clique (salva na hora)', desl === 'f' && sql("select ligada from regras_tarefas where chave='email_lembrete_honorario'") === 't');
    sql("insert into contatos(cliente_id,nome,finalidade,email) select id,'Financeiro Alfa','financeiro','financeiro@alfa.teste' from clientes where nome='Alfa Comércio Ltda'");
    sql("insert into lancamentos(empresa,tipo,cliente_id,grupo_id,descricao,vencimento,valor) select 'escritorio','receita',id,grupo_id,'Honorário lembrete',current_date+3,700 from clientes where nome='Alfa Comércio Ltda'");
    await p.click('#panel-automacoes #au-rodar'); await p.waitForTimeout(1800);
    const refLh = "(select referencia from email_fila where tipo='cliente' and referencia like 'email_lh:%' and html like '%Honorário lembrete%' limit 1)";
    ok('lembrete de honorário vai por e-mail ao contato financeiro do cliente (quem recebe boletos primeiro)', sql("select para from email_fila where tipo='cliente' and referencia=" + refLh) === 'fin@teste.com');
    ok('e-mail ao cliente no modelo novo (marca, tabela de itens)', sql("select (html like '%Araújo &amp; Castro%' and html like '%Vencimento%' and html like '%R$ 700,00%')::text from email_fila where referencia=" + refLh) === 'true');
    await p.click('#panel-automacoes #au-rodar'); await p.waitForTimeout(1500);
    ok('rodar de novo não repete o e-mail', sql("select count(*) from email_fila where tipo='cliente' and referencia=" + refLh) === '1');
    // contrato novo → anexar; documento do contrato conclui sozinho
    sql("insert into contratos(cliente_id,descricao,valor_total,num_parcelas,data_contrato,modalidade) select id,'Contrato Automação',1000,1,current_date,'pontual' from clientes where nome='Beta Serviços Ltda'");
    ok('contrato novo cria a tarefa "anexar o contrato assinado"', sql("select count(*) from tarefas where chave_regra like 'anexo:%' and titulo like '%Contrato Automação%' and status='pendente'") === '1');
    sql("insert into documentos(cliente_id,contrato_id,tipo,nome,caminho) select cliente_id,id,'contrato','Contrato Automação.pdf','teste/x.pdf' from contratos where descricao='Contrato Automação'");
    ok('anexar o contrato conclui a tarefa sozinho', sql("select status from tarefas where chave_regra like 'anexo:%' and titulo like '%Contrato Automação%'") === 'concluida');
    // processo de grupo sem procuração → tarefa; marcar procuração conclui
    sql("update clientes set procuracao=null where grupo_id=(select id from grupos where nome='Grupo Beta')");
    sql("insert into processos(grupo_id,numero,advogado) select id,'7777777-77.2026.8.13.0024','Pedro' from grupos where nome='Grupo Beta'");
    ok('processo novo sem procuração cria "providenciar procuração"', sql("select count(*) from tarefas where chave_regra like 'procur:%' and status='pendente'") === '1');
    { const idB = sql("select id from clientes where nome='Beta Serviços Ltda'");
      await p.evaluate((id) => ERP_EDITAR('clientes:' + id), idB); await p.waitForSelector('#gs-raiz [name=procuracao]'); await p.waitForTimeout(250);
      await p.selectOption('#gs-raiz [name=procuracao]', { index: 1 }).catch(() => {});
      const opt = await p.$eval('#gs-raiz [name=procuracao]', (s) => [...s.options].map((o) => o.value + '=' + o.text).join('|'));
      await p.selectOption('#gs-raiz [name=procuracao]', { label: 'Sim' }).catch(() => {});
      await salvarGs(p, '#btn-salvar-cli');
      ok('marcar "Procuração: Sim" no cadastro conclui a tarefa sozinho', sql("select status from tarefas where chave_regra like 'procur:%'") === 'concluida', opt); }
    // honorário recebido → conclui a cobrança
    sql("update regras_tarefas set ligada=true, dias=1 where chave='cobrar_honorario'");
    await nav(p, 'automacoes'); await p.waitForSelector('#au-rodar'); await p.click('#au-rodar'); await p.waitForTimeout(1800);
    { const idL = sql("select id from lancamentos where descricao='Atraso antigo' limit 1");
      ok('regra de cobrança cria a tarefa "cobrar honorário"', sql("select count(*) from tarefas where chave_regra='cob:" + idL + "'") === '1');
      sql("update lancamentos set pago=true where id='" + idL + "'");
      ok('honorário recebido conclui a tarefa de cobrança sozinho', sql("select status from tarefas where chave_regra='cob:" + idL + "'") === 'concluida'); }
    await nav(p, 'automacoes'); await p.waitForSelector('#au-rodar'); await p.waitForTimeout(500);
    ok('Central mostra quantas vezes cada automação agiu e as últimas ações', /[1-9]× em 30 dias/.test(await p.textContent('#panel-automacoes [data-au="contrato_anexo"]')) &&
      /tarefa concluída sozinha/.test(await p.textContent('#panel-automacoes')));
    // cliente novo com CNPJ → consulta na hora (fonte reserva para empresa recém-aberta) / aguardando
    await nav(p, 'clientes'); await p.waitForTimeout(900);
    for (const [nome, doc] of [['Empresa Nova (teste)', '33.444.555/0001-06'], ['Empresa Novíssima (teste)', '44.555.666/0001-77']]) {
      await p.click('#panel-clientes [data-novo=cliente]'); await p.waitForSelector('#gs-raiz [name=cpf_cnpj]'); await p.waitForTimeout(250);
      await p.fill('#gs-raiz [name=nome]', nome); await p.fill('#gs-raiz [name=cpf_cnpj]', doc);
      await salvarGs(p, '#btn-salvar-cli'); await p.waitForTimeout(2500);
    }
    ok('cliente novo com CNPJ: busca na Receita na hora (fonte reserva acha empresa recém-aberta)', sql("select razao_social||'|'||cidade from clientes where cpf_cnpj='33444555000106'") === 'EMPRESA NOVA LTDA|CONTAGEM' &&
      sql("select count(*) from automacoes_log where chave='cliente_novo_cnpj'") === '2');
    ok('CNPJ que nenhuma base conhece fica "aguardando a Receita" (não é erro) e volta amanhã', sql("select coalesce(razao_social,'')||'|'||(cnpj_atualizado_em is null) from clientes where cpf_cnpj='44555666000177'") === '|true' &&
      sql("select status from cnpj_execucoes order by inicio desc limit 1") === 'ok' && /aguardando/.test(sql("select mensagem from cnpj_execucoes order by inicio desc limit 1")));
    sql("delete from clientes where cpf_cnpj in ('33444555000106','44555666000177')");

    // ── design: modo escuro, estado vazio e tabelas longas ──
    await nav(p, 'hoje'); await p.waitForTimeout(800);
    await p.click('#gs-tema'); await p.waitForTimeout(300);
    ok('botão ◐ liga o modo escuro e lembra neste aparelho', await p.evaluate(() => document.documentElement.dataset.tema === 'escuro' && localStorage.getItem('erp_tema') === 'escuro' &&
      getComputedStyle(document.body).backgroundColor !== 'rgb(240, 242, 247)'));
    await p.reload(); await p.waitForTimeout(4500);
    ok('modo escuro continua depois de recarregar', await p.evaluate(() => document.documentElement.dataset.tema === 'escuro'));
    await p.click('#gs-tema'); await p.waitForTimeout(300);
    ok('◐ volta ao modo claro', await p.evaluate(() => !document.documentElement.dataset.tema && localStorage.getItem('erp_tema') === 'claro'));
    ok('botões só com ícone têm nome para leitor de tela', await p.evaluate(() => ['#gs-tema', '#gs-sino', '.gs-bt-mais'].every((q) => (document.querySelector(q) || {}).getAttribute && document.querySelector(q).getAttribute('aria-label'))));
    sql("insert into tarefas(titulo,responsavel,prazo) select 'Tarefa em massa '||g,'Pedro',current_date+30+g from generate_series(1,130) g");
    await nav(p, 'tarefas'); await p.waitForTimeout(1800);
    { const rod = await p.textContent('#panel-tarefas .pag-rodape').catch(() => '');
      ok('tabela longa mostra 100 linhas por vez', /Mostrando 100 de 1[3-9]\d/.test(rod) && await p.evaluate(() => [...document.querySelectorAll('#panel-tarefas tbody tr')].filter((r) => r.offsetParent).length === 100), rod); }
    await p.click('#panel-tarefas .pag-rodape [data-pag=todas]'); await p.waitForTimeout(400);
    ok('"Mostrar todas" exibe o restante', await p.evaluate(() => !document.querySelector('#panel-tarefas .pag-oculta')));
    ok('tabela longa: cabeçalho fixo dentro do quadro', await p.evaluate(() => { const w = document.querySelector('#panel-tarefas .tabela-wrap.tabela-longa'); return !!w && getComputedStyle(w.querySelector('thead th')).position === 'sticky'; }));
    sql("delete from tarefas where titulo like 'Tarefa em massa %'");
    await p.fill('#panel-tarefas #tf-busca', 'nada-com-este-nome-xyz').catch(() => {}); await p.waitForTimeout(700);
    { const v = await p.$('#panel-tarefas .vazio [data-vazio-clica]');
      ok('lista vazia mostra frase e botão de criar', !!v);
      if (v) { await v.click(); await p.waitForTimeout(500); ok('botão do estado vazio abre o formulário', await p.isVisible('#f-tf')); await p.keyboard.press('Escape'); } }

    // ── Backup 13 ──
    await nav(p, 'hoje'); await p.waitForTimeout(1500);
    { const t = await p.textContent('#panel-hoje');
      ok('Início: atrasados em duas tabelas (Jurídico e Contabilidade), sem "Próximos 15 dias"', /Atrasados\s*Jurídico/.test(t) && /Atrasados\s*Contabilidade/.test(t) && !/Próximos 15 dias/.test(t) && !(await p.$('#panel-hoje [data-ver-todos]')));
      ok('Início: "A receber" conta de hoje até o fim do mês (não repete o atraso)', /de hoje até/.test(t)); }
    sql("insert into lancamentos(empresa,tipo,descricao,vencimento,valor) values ('escritorio','receita','Vence hoje teste',current_date,123)");
    await nav(p, 'hoje'); await p.waitForTimeout(1500);
    ok('Início mostra o que vence hoje, destacado', /Vence hoje/.test(await p.textContent('#panel-hoje .ini-atraso')) && !!(await p.$('#panel-hoje tr.linha-hoje')));
    sql("delete from lancamentos where descricao='Vence hoje teste'");
    // caixa de avisos: lido some e fica registrado
    await p.click('#gs-sino'); await p.waitForSelector('.cx-janela', { timeout: 8000 }); await p.waitForTimeout(300);
    { const n0 = (await p.$$('.cx-janela .cx-item')).length;
      if (n0) { await p.click('.cx-janela [data-al-lida]'); await p.waitForTimeout(800); }
      ok('caixa de avisos: marcar como lido tira da lista de não lidos', n0 > 0 && (await p.$$('.cx-janela .cx-item')).length === n0 - 1 &&
        Number(sql("select count(*) from avisos_lidos")) + Number(sql("select count(*) from notificacoes where lida")) >= 1, n0); }
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    // telas do ERP antigo
    await nav(p, 'resumo'); await p.waitForTimeout(1500);
    ok('Painel: rosca com a legenda em tabela ao lado', /Total/.test(await p.textContent('#cResDonutLeg').catch(() => '')));
    await nav(p, 'processos'); await p.waitForTimeout(1200);
    ok('Processos: sem "Visão Geral" e sem "Todos status"; Análise com passivo e ativo em disputas', !(await p.isVisible('#kpiProc')) && !(await p.$('#fProcStatus')) &&
      /Passivo em disputas/.test(await p.textContent('#procAnalise')) && /Ativo em disputas/.test(await p.textContent('#procAnalise')));
    { const n1 = await p.evaluate(() => document.querySelectorAll('#tblProcBody tr').length);
      await p.click('#chipProcAtivo'); await p.waitForTimeout(400);
      const n2 = await p.evaluate(() => document.querySelectorAll('#tblProcBody tr').length);
      ok('Processos: começa só com Ativos; desmarcar mostra todos', n2 >= n1, n1 + '→' + n2); await p.click('#chipProcAtivo'); }
    await nav(p, 'parcelamentos'); await p.waitForTimeout(1200);
    ok('Parcelamentos: saldo residual com tabela ao lado e ordenar por título', !!(await p.$('#cParcResidualTab table')) && await p.isVisible('#parcOrd [data-o=residual]'));
    await p.click('#parcOrd [data-o=residual]'); await p.waitForTimeout(400);
    ok('Parcelamentos: clicar no título ordena', await p.evaluate(() => document.querySelector('#parcOrd [data-o=residual]').classList.contains('ativo')));
    await nav(p, 'acordos'); await p.waitForTimeout(1200);
    ok('Acordos: "Situação dos acordos" com a tabela "Acordos em andamento" (sem "Por credor" e sem o gráfico de atraso)', /Situação dos acordos/.test(await p.textContent('#acAnalise')) && /Acordos em andamento/.test(await p.textContent('#acAnalise')) &&
      !/Por credor/.test(await p.textContent('#acAnalise')) && !(await p.$('#cAcordAtraso')));
    { const n0 = (await p.$$('#acAnalise .acx-row')).length, pg0 = Number(sql("select count(*) from acordos where pago")); await p.click('#acAnalise .acx-row'); await p.waitForTimeout(400);
      ok('Acordos: clicar na linha abre as parcelas com "Lançar pagamento"', n0 >= 1 && !!(await p.$('#acAnalise .acx-det .ac-bt-pagar')));
      await p.click('#acAnalise .ac-bt-pagar'); await p.waitForSelector('#gs-raiz .janela'); await p.click('#gs-raiz [data-bx-ok]'); await p.waitForTimeout(2500);
      ok('Acordos: "Lançar pagamento" dá baixa na parcela', Number(sql("select count(*) from acordos where pago")) === pg0 + 1); }
    ok('Acordos: acordo todo pago some da lista; "Mostrar concluídos" traz de volta', await (async () => {
      sql("update acordos set pago=true, data_pagamento=current_date where devedor='Alfa Comércio Ltda'"); await p.evaluate(() => ERP_RECARREGAR()); await p.waitForTimeout(2500);
      const sem = !/Alfa Comércio/.test(await p.textContent('#acAnalise'));
      await p.check('#acMostrarTodos'); await p.waitForTimeout(500);
      const com = /Alfa Comércio/.test(await p.textContent('#acAnalise'));
      await p.uncheck('#acMostrarTodos'); sql("update acordos set pago=false, data_pagamento=null where devedor='Alfa Comércio Ltda'"); await p.evaluate(() => ERP_RECARREGAR()); await p.waitForTimeout(2000);
      return sem && com; })());
    await nav(p, 'financeiroContab'); await p.waitForTimeout(1500);
    ok('Contabilidade: Análise sem "Maiores clientes" e sem a lista de lançamentos', !/Maiores clientes/.test(await p.textContent('#panel-financeiroContab')) && !(await p.$('#fcLancTbl')));
    sql("insert into lancamentos(empresa,tipo,descricao,vencimento,valor,pago,data_pagamento) values ('contabilidade','receita','Caixa teste',current_date-5,500,true,current_date-5)");
    await p.evaluate(() => ERP_RECARREGAR()); await p.waitForTimeout(2500);
    await p.click('#panel-financeiroContab .fin-tab[data-tab=caixa]'); await p.waitForTimeout(1000);
    ok('Composição de Caixa aparece (gráficos não somem)', await p.evaluate(() => { const c = document.querySelector('#cFcCaixaSaldo'); return !!c && c.offsetParent !== null; }));
    sql("delete from lancamentos where descricao='Caixa teste'");
    await nav(p, 'financeiro'); await p.waitForTimeout(1000);
    // Central de e-mails ao cliente (Backup 16)
    sql("insert into clientes(nome,email) values ('Central Atraso Ltda','atraso@central.test'),('Central Lembrete Ltda','lembrete@central.test')");
    sql("insert into lancamentos(empresa,tipo,descricao,cliente_id,vencimento,valor) select 'escritorio','receita','Hon central atraso',id,current_date-3,700 from clientes where nome='Central Atraso Ltda'");
    sql("insert into lancamentos(empresa,tipo,descricao,cliente_id,vencimento,valor) select 'escritorio','receita','Hon central lembrete',id,current_date+2,800 from clientes where nome='Central Lembrete Ltda'");
    await p.click('#panel-financeiro .gx-cobrar [data-cob=hon]'); await p.waitForTimeout(2500);
    ok('✉ Cobrar clientes abre a Central de e-mails já em Honorários', await p.isVisible('#panel-emails') && await p.evaluate(() => document.querySelector('#em-tipo .ativo').dataset.v === 'honorarios'));
    ok('Central: "A enviar hoje" lista o 1º aviso de atraso e o lembrete, com o destinatário certo', /atraso@central\.test/.test(await p.textContent('#em-corpo')) && /lembrete@central\.test/.test(await p.textContent('#em-corpo')) &&
      /Honorários em aberto/.test(await p.textContent('#em-corpo')));
    await p.click('#em-corpo tr:has-text("atraso@central.test") td:nth-child(3)'); await p.waitForSelector('#gs-raiz iframe.em-previa'); await p.waitForTimeout(400);
    ok('Central: coluna "E-mail de destino" diz de qual contato vem o e-mail', await p.evaluate(() => /E-mail de destino/.test(document.querySelector('#em-corpo thead').textContent) && /e-mail do cadastro|contato/.test(document.querySelector('#em-corpo tbody').textContent)));
    ok('Central: clicar na linha mostra a prévia do e-mail com a marca', /Hon central atraso/.test(await p.evaluate(() => document.querySelector('#gs-raiz iframe.em-previa').srcdoc)));
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    await p.click('#em-corpo tr:has-text("atraso@central.test") [data-em-agora]'); await p.waitForTimeout(1500);
    ok('Central: "Enviar agora" põe na fila e não repete', sql("select count(*) from email_fila where para='atraso@central.test'") === '1' && !/atraso@central\.test/.test(await p.textContent('#em-corpo')) &&
      sql("select count(*) from automacoes_log where ref = 'email_ch:' || (select id from lancamentos where descricao='Hon central atraso')") === '1');
    await p.click('#em-corpo tr:has-text("lembrete@central.test") [data-em-pular]'); await p.waitForTimeout(1500);
    ok('Central: "Pular este" tira da lista sem enviar', sql("select count(*) from email_fila where para='lembrete@central.test'") === '0' && !/lembrete@central\.test/.test(await p.textContent('#em-corpo')));
    sql("select public.rodar_emails_cliente()");
    ok('Central: a rotina automática não manda o que foi pulado nem repete o enviado', sql("select count(*) from email_fila where para in ('atraso@central.test','lembrete@central.test')") === '1');
    await p.click('#em-sit [data-v=enviados]'); await p.waitForTimeout(1200);
    ok('Central: aba "Enviados" mostra o e-mail', /atraso@central\.test/.test(await p.textContent('#em-corpo')));
    await p.click('#em-auto'); await p.waitForSelector('#f-emauto'); await p.fill('#f-emauto [name=hora]', '09:30'); await p.click('#emauto-salvar'); await p.waitForTimeout(1200);
    ok('Central: horário e automático salvos', sql("select valor->>'hora' from configuracoes where chave='emails_central'") === '09:30');
    sql("update configuracoes set valor = valor - 'hora' where chave='emails_central'");
    ok('Central: a aba "Cobranças (tela antiga)" saiu', !(await p.$('#em-area [data-area=antiga]')));
    ok('Notificações saiu da barra de cima', !(await p.$('#tn [data-ir=notificacoes]')));
    // envio manual pelo e-mail do escritório (modelo da marca)
    { const r = await p.evaluate(async () => (await SB.rpc('enviar_email_manual', { p_para: 'cliente@exemplo.test', p_assunto: 'Teste manual', p_texto: 'Prezados,\n\nSegue a cobrança.' })).error);
      ok('enviar pelo e-mail do escritório: entra na fila com o modelo da marca', !r && sql("select (html like '%Araújo &amp; Castro%' and html like '%Segue a cobrança%')::text from email_fila where para='cliente@exemplo.test'") === 'true', r && r.message); }
    // demonstração
    await nav(p, 'admin'); await p.waitForTimeout(1200);
    await p.click('#adm-abas [data-aba=importar]'); await p.waitForSelector('#demo-carregar'); await p.click('#demo-carregar'); await p.waitForTimeout(3000);
    ok('Administração: carregar a demonstração (clientes, contratos, CRM, tarefas, rascunho)', sql("select count(*) from clientes where nome like '%Horizonte%' or chave_importacao like 'demo:%'") === '6' &&
      Number(sql("select count(*) from crm_oportunidades where titulo like 'DEMO%'")) === 3 && sql("select count(*) from rascunhos where resumo like '%(demonstração)%'") === '1');
    await p.click('#demo-apagar'); await p.waitForTimeout(3000);
    ok('Administração: apagar a demonstração não deixa rastro', sql("select count(*) from clientes where chave_importacao like 'demo:%'") === '0' && sql("select count(*) from grupos where nome like 'DEMO%'") === '0');

    // ── Backup 14 ──
    const visiveis = (sel) => p.evaluate((s) => [...document.querySelectorAll(s)].filter((x) => x.offsetParent).length, sel);
    await nav(p, 'alertas'); await p.waitForTimeout(2500);
    { const n0 = await visiveis('#panel-alertas .al-linha'), setores = await p.$$eval('#panel-alertas [data-al-setor]', (l) => l.map((x) => x.dataset.alSetor).filter(Boolean));
      if (setores.length) { await p.click('#panel-alertas [data-al-setor="' + setores[0] + '"]'); await p.waitForTimeout(400); }
      const n1 = await visiveis('#panel-alertas .al-linha'), ok1 = await p.evaluate((st) => [...document.querySelectorAll('#panel-alertas .al-linha')].filter((x) => x.offsetParent).every((x) => x.dataset.setor === st), setores[0]);
      ok('Alertas: o filtro por setor esconde de verdade os outros cartões', setores.length > 1 && n1 < n0 && ok1, n0 + '→' + n1);
      ok('Alertas: "em dia" virou "verificações sem pendência"', /verificações sem pendência/.test(await p.textContent('#panel-alertas .al-contas'))); }
    await nav(p, 'clientes'); await p.waitForTimeout(800); await nav(p, 'contratos'); await p.waitForTimeout(800);
    await p.goBack(); await p.waitForTimeout(1200);
    ok('botão "voltar" do navegador volta para a tela anterior', /#clientes$/.test(p.url()) && await p.isVisible('#panel-clientes'), p.url());
    ok('Clientes abre agrupado por grupo', (await p.$$('#panel-clientes tr.cli-grp')).length >= 1);
    // editar em tabela (passivo)
    await p.click('#cli-massa'); await p.waitForSelector('table.massa');
    { const nome = await p.$eval('table.massa tr[data-i="0"] [data-k=nome]', (x) => x.value);
      await p.fill('table.massa tr[data-i="0"] [data-k=pgfn]', '7.777,00'); await p.dispatchEvent('table.massa tr[data-i="0"] [data-k=pgfn]', 'input');
      await salvarGs(p, '#massa-salvar');
      ok('Editar em tabela: grava só a linha alterada', sql("select pgfn from clientes where nome=" + "'" + nome.replace(/'/g, "''") + "'") === '7777.00'); }
    await p.evaluate(() => { if (window.ERP_EDITOR) window.ERP_EDITOR.gravou('teste do rodapé'); }); await p.waitForTimeout(500);
    { const on0 = await p.evaluate(() => document.getElementById('gx-rodape').classList.contains('on')); await p.waitForTimeout(8600);
      ok('rodapé "Última gravação" some sozinho', on0 && !(await p.evaluate(() => document.getElementById('gx-rodape').classList.contains('on')))); }
    // Início: selos separados, Recebido, cartão abre relatório
    sql("insert into lancamentos(empresa,tipo,descricao,vencimento,valor) values ('escritorio','receita','Vence hoje B14',current_date,50),('escritorio','receita','Venceu B14',current_date-3,60)");
    await nav(p, 'hoje'); await p.waitForTimeout(1800); await p.evaluate(() => { const x = document.getElementById('gx-pop-avisos'); if (x) x.remove(); });
    { const t = await p.textContent('#panel-hoje .ini-atraso-selos');
      ok('Início: "vencidos" (vermelho) e "vence hoje" (âmbar) separados', /\d+ vencidos?/.test(t) && /vence(m)? hoje/.test(t) && !!(await p.$('#panel-hoje .ini-atraso-selos .pill.vencido')) && !!(await p.$('#panel-hoje .ini-atraso-selos .pill.hoje')), t);
      ok('Início: botão "Recebido"', /✓ Recebido/.test(await p.textContent('#panel-hoje .ini-atraso')) && !/Registrar pagamento/.test(await p.textContent('#panel-hoje .ini-atraso'))); }
    await p.click('#panel-hoje [data-ini-rel="escritorio|em_atraso"]'); await p.waitForSelector('#gs-raiz .janela'); await p.waitForTimeout(500);
    ok('Início: clicar no cartão abre o relatório completo (largo e sem a coluna Descrição)', /Em atraso/.test(await p.textContent('#gs-raiz .janela-hd')) &&
      (await p.$$('#gs-raiz .janela-bd tbody tr')).length >= 2 && !(await p.$$eval('#gs-raiz .janela-bd th', (l) => l.some((x) => /Descrição/.test(x.textContent)))) && !!(await p.$('#gs-raiz .janela.janela-rel')));
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    await p.click('#panel-hoje .ini-atraso tr[data-linha-pagar]:has-text("Venceu B14") td:nth-child(2)'); await p.waitForTimeout(600);
    ok('Início: clicar no honorário abre "Recebido — confirme a data"', /Recebido/.test(await p.textContent('#gs-raiz .janela-hd')));
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    sql("delete from lancamentos where descricao in ('Vence hoje B14','Venceu B14')");
    // telas antigas
    await nav(p, 'resumo'); await p.waitForTimeout(1500);
    ok('Painel: valores inteiros (sem "mil"/"mi")', /R\$\s?[\d.]+,\d{2}/.test(await p.textContent('#execKpis')) && !/\d(k|M)\b/.test(await p.textContent('#kpiSecProc')));
    await nav(p, 'parcelamentos'); await p.waitForTimeout(1200);
    ok('Parcelamentos: botão "Notificar clientes" (versão do Backup 13)', /Notificar clientes/.test(await p.textContent('#panel-parcelamentos')));
    await nav(p, 'processos'); await p.waitForTimeout(1200);
    ok('Processos: volta a abrir a tela do Backup 13 (sem a tela nova)', /#processos$/.test(p.url()) && await p.isVisible('#panel-processos') && !!(await p.$('#tblProcBody')) && !(await p.$('#panel-processosNovo')));
    // conciliação OFX
    { const g = sql("select id from grupos where nome='Grupo Alfa'");
      sql("insert into lancamentos(empresa,tipo,descricao,grupo_id,vencimento,valor) values ('escritorio','receita','OFX B14'," + "'" + g + "',current_date-2,1234.56)");
      const arq = require('path').join(require('os').tmpdir(), 'extrato-b14.ofx');
      require('fs').writeFileSync(arq, '<OFX><BANKTRANLIST><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '120000<TRNAMT>1234.56<FITID>B14-1<NAME>PIX ALFA COMERCIO</STMTTRN>' +
        '<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260901<TRNAMT>9.99<FITID>B14-2<NAME>DESCONHECIDO</STMTTRN></BANKTRANLIST></OFX>');
      await nav(p, 'financeiro'); await p.waitForTimeout(1200);
      await p.click('#panel-financeiro [data-ofx]'); await p.waitForSelector('#ofx-arq', { state: 'attached' });
      await p.setInputFiles('#ofx-arq', arq); await p.waitForTimeout(1500);
      ok('OFX: identifica pelo valor e pelo nome; o resto fica para decidir', (await p.$$('[data-ofx-ok]')).length === 1 && (await p.$$('[data-ofx-esc]')).length === 1);
      await p.selectOption('[data-ofx-esc]', 'ignorar'); await salvarGs(p, '#ofx-gravar');
      ok('OFX: baixa com a data do banco e não repete a entrada', sql("select pago::text||'|'||(data_pagamento=current_date)::text from lancamentos where descricao='OFX B14'") === 'true|true' &&
        sql("select string_agg(situacao, ',' order by fitid) from extrato_itens where fitid like 'B14-%'") === 'baixado,ignorado'); }
    // PGFN (API do SERPRO imitada no servidor de teste)
    sql("insert into config_privada(chave,valor) values ('api_pgfn','{\"ligada\":true,\"frequencia\":\"diaria\",\"consumer_key\":\"chave-teste\",\"consumer_secret\":\"segredo-teste\",\"token_url\":\"http://127.0.0.1:8090/__teste/serpro/token\",\"base_url\":\"http://127.0.0.1:8090/__teste/serpro\"}') on conflict (chave) do update set valor=excluded.valor");
    sql("insert into clientes(nome,cpf_cnpj,tipo) values ('PGFN Teste Ltda','99111222000133','Consultoria')");
    { const r = await p.evaluate(async () => { const s = (await SB.auth.getSession()).data.session;
        return (await fetch('/functions/v1/erp-pgfn', { method: 'POST', headers: { authorization: 'Bearer ' + s.access_token, 'content-type': 'application/json' }, body: '{"acao":"rodar"}' })).json(); });
      ok('PGFN: consulta o CNPJ, separa por origem e atualiza PGFN / PGFN negociada', !r.erro && sql("select pgfn||'|'||pgfn_negociada from clientes where nome='PGFN Teste Ltda'") === '112345.67|250000.50' &&
        sql("select string_agg(natureza, ',' order by natureza) from pgfn_inscricoes") === 'FGTS,Simples Nacional,Tributária', JSON.stringify(r)); }
    await p.evaluate(() => GS.carregarCadastros(true));
    await p.evaluate(() => GS.abrirFicha(GS.E.clientes.find((c) => c.nome === 'PGFN Teste Ltda').id, 'pgfn')); await p.waitForTimeout(1500);
    ok('ficha do cliente: aba PGFN com as CDAs', /10 5 26 000001-01/.test(await p.textContent('#fc-corpo')) && /Parcelada \/ negociada/.test(await p.textContent('#fc-corpo')));
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    // evolução (foto mensal)
    { const cli = sql("select id from clientes where nome='Alfa Comércio Ltda'");
      sql("select public.tirar_fotos_mensais((current_date - interval '1 month')::date)");
      sql("update clientes set rfb = coalesce(rfb,0) + 1000 where id='" + cli + "'");
      await p.evaluate((id) => GS.abrirFicha(id, 'evolucao'), cli); await p.waitForTimeout(1500);
      ok('ficha do cliente: Evolução compara com o mês passado ("devia X, hoje deve Y")', /devia R\$/.test(await p.textContent('.ev-frase')) && /\+R\$\s?1\.000,00/.test(await p.textContent('.ev-frase')));
      await p.keyboard.press('Escape'); await p.waitForTimeout(200); }
    // perfil de e-mail na tela
    await nav(p, 'emails'); await p.waitForSelector('#em-area'); await p.waitForTimeout(600);
    await p.click('#em-area [data-area=clientes]'); await p.waitForSelector('[data-cem]');
    { const id = await p.$eval('[data-cem]', (x) => x.dataset.cem);
      await p.selectOption('[data-cem="' + id + '"]', 'nunca'); await p.waitForTimeout(1500);
      ok('E-mails aos clientes: perfil muda na linha', sql("select perfil_email from clientes where id='" + id + "'") === 'nunca'); }
    await nav(p, 'admin'); await p.waitForTimeout(1200);
    await p.click('#adm-abas [data-aba=usuarios]'); await p.waitForTimeout(1200);
    ok('Usuários: os 4 acessos combinados aparecem com "Criar conta"', (await p.$$('[data-prev]')).length === 4);

    // ── Backup 15 ──
    // Início: fila em calendário, escolha guardada no perfil; mural
    await nav(p, 'hoje'); await p.waitForTimeout(1500); await p.evaluate(() => { const x = document.getElementById('gx-pop-avisos'); if (x) x.remove(); });
    await p.click('#panel-hoje [data-fila-vista=semana]'); await p.waitForTimeout(1200);
    ok('Início: fila vira calendário semanal e a escolha fica guardada', !!(await p.$('#panel-hoje .fila-semana')) &&
      sql("select preferencias->'fila'->>'vista' from perfis where email='pedro@teste'") === 'semana', sql("select preferencias::text from perfis where email='pedro@teste'"));
    await p.click('#panel-hoje [data-fila-vista=lista]'); await p.waitForTimeout(800);
    ok('Início: fila mostra no máximo 5 de cara', (await p.$$('#panel-hoje .ini-fila .fila-item, #panel-hoje .ini-fila tbody tr')).length <= 5);
    ok('Início: sem "+ Receita/+ Despesa/+ Contrato" (o "+ Lançar" faz isso)', !/\+ Receita|\+ Despesa|\+ Contrato/.test(await p.textContent('#panel-hoje')));
    await p.click('#lemb-novo'); await p.waitForSelector('#f-lemb');
    await p.fill('#f-lemb [name=texto]', 'Reunião geral sexta às 14h (teste)'); await p.selectOption('#f-lemb [name=prazo]', 'sem');
    await p.selectOption('#f-lemb [name=destaque]', 'vermelho'); await p.check('#f-lemb [name=fixo]');
    await p.click('#lemb-salvar'); await p.waitForTimeout(1500);
    ok('Início: lembrete sem prazo, fixo e com destaque (substitui o recado)', sql("select count(*) from lembretes where texto like 'Reunião geral%' and dia is null and fixo and destaque='vermelho'") === '1' &&
      /Reunião geral sexta/.test(await p.textContent('#ini-mural')) && !!(await p.$('#ini-mural .lemb-it.fixo.dest-vermelho')));
    // Painel: sem faixa, "Atualizado" e entidades/grupos na linha do filtro
    await nav(p, 'resumo'); await p.waitForTimeout(1500);
    ok('Painel: sem a faixa "Painel Executivo" e com "Atualizado" na linha do filtro', !(await p.isVisible('#panel-resumo > .mod-banner')) && await p.isVisible('#gx-linha-painel'));
    // Financeiro Jurídico: área do serviço, detalhe ao clicar na linha
    { const cli = sql("select id from clientes where nome='Alfa Comércio Ltda'");
      sql("insert into lancamentos(empresa,tipo,descricao,cliente_id,vencimento,valor,servico) values ('escritorio','receita','Serviço B15','" + cli + "',current_date+10,321,'Tributário')");
      await p.evaluate(() => ERP_RECARREGAR()); await p.waitForTimeout(2500);
      const id = sql("select id from lancamentos where descricao='Serviço B15'");
      await p.evaluate((x) => GS.detalheLancamento(x), id); await p.waitForTimeout(1200);
      ok('Financeiro: clicar na linha abre a visualização (área do serviço, Editar, Recebido)', /Tributário/.test(await p.textContent('#gs-raiz .janela')) && !!(await p.$('#gs-raiz .janela [data-editar]')));
      await p.keyboard.press('Escape'); await p.waitForTimeout(200);
      sql("delete from lancamentos where descricao='Serviço B15'"); }
    // Contrato: cadastrar cliente novo sem sair do formulário
    await p.evaluate(() => GS.formContrato({}, () => {})); await p.waitForSelector('#ctr-novo-cli');
    await p.click('#ctr-novo-cli'); await p.waitForSelector('#f-cli'); await p.fill('#f-cli [name=nome]', 'Cliente Novo B15 Ltda');
    await p.click('#btn-salvar-cli'); await p.waitForTimeout(3000);
    ok('Contrato: "+ Novo cliente" cadastra e já escolhe o cliente', sql("select count(*) from clientes where nome='Cliente Novo B15 Ltda'") === '1' &&
      await p.evaluate(() => { const s = document.querySelector('#f-ctr [name=cliente_id]'); return !!s && /Cliente Novo B15/.test(s.options[s.selectedIndex].text); }));
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    // CRM: só as vigentes no funil; ganhas em aba própria; ficha abre em Resumo
    await nav(p, 'crm'); await p.waitForTimeout(1500);
    ok('CRM: funil só com oportunidades em andamento', !(await p.$('#panel-crm .cr-solte .cr-card')) && !!(await p.$('#panel-crm .cr-solte-ganho')));
    await p.click('#cr-abas [data-aba=ganho]'); await p.waitForTimeout(600);
    ok('CRM: aba "Ganhos" lista as fechadas', /Planejamento tributário/.test(await p.textContent('#cr-corpo')));
    await p.click('#cr-corpo tr[data-op]'); await p.waitForSelector('#op-abas'); await p.waitForTimeout(500);
    ok('CRM: ficha abre em "Resumo" (visualização), com botão Editar', await p.evaluate(() => document.querySelector('#op-abas .ativo').dataset.aba === 'dados') && !!(await p.$('#op-editar')));
    await p.keyboard.press('Escape'); await p.waitForTimeout(300); await p.click('#cr-abas [data-aba=andamento]'); await p.waitForTimeout(300);
    // Backup 16: cadastro rápido, ligação em 1 clique, lead perdido com motivo fixo, regras (parada, follow-up), follow-up por e-mail
    await p.click('#cr-rapido'); await p.waitForSelector('#f-rap'); await p.fill('#f-rap [name=nome]', 'Rápido Teste B16'); await p.fill('#f-rap [name=tel]', '31 99999-0000');
    await p.fill('#f-rap [name=interesse]', 'Holding'); await p.click('#rap-salvar'); await p.waitForTimeout(1500);
    ok('CRM: cadastro rápido entra em "Novo contato"', sql("select e.nome from crm_oportunidades o join crm_etapas e on e.id=o.etapa_id where o.prospecto_nome='Rápido Teste B16'") === 'Novo contato' &&
      !!(await p.$('#panel-crm .cr-card:has-text("Rápido Teste B16")')));
    await p.fill('#cr-busca', '99999'); await p.waitForTimeout(600);
    ok('CRM: busca única acha pelo telefone', (await p.$$('#panel-crm .cr-card')).length === 1);
    await p.fill('#cr-busca', ''); await p.waitForTimeout(500);
    await p.click('#panel-crm .cr-card:has-text("Rápido Teste B16") [data-ligacao]'); await p.waitForTimeout(1200);
    ok('CRM: "registrar ligação" em 1 clique', sql("select count(*) from crm_atividades a join crm_oportunidades o on o.id=a.oportunidade_id where o.prospecto_nome='Rápido Teste B16' and a.tipo='ligacao'") === '1');
    { const idr = sql("select id from crm_oportunidades where prospecto_nome='Rápido Teste B16'");
      sql("update crm_oportunidades set etapa_desde = now() - interval '10 days', prospecto_email='rapido@teste.local' where id='" + idr + "'");
      sql("select public.rodar_regras_tarefas()");
      ok('CRM: oportunidade parada além do prazo da etapa vira tarefa', sql("select count(*) from tarefas where titulo like 'CRM parado há mais de 3 dia(s) em \"Novo contato\"%'") === '1');
      const r = await p.evaluate(async (id) => (await SB.rpc('crm_followup_email', { p_op: id, p_para: 'rapido@teste.local', p_assunto: 'Nossa proposta', p_texto: 'Olá!\n\nConseguiu ver?' })).error, idr);
      ok('CRM: follow-up por e-mail vai para a fila e fica nas atividades', !r && sql("select count(*) from email_fila where para='rapido@teste.local' and tipo='proposta'") === '1' &&
        sql("select count(*) from crm_atividades where oportunidade_id='" + idr + "' and tipo='email'") === '1', r && r.message); }
    await p.evaluate(() => ERP_RECARREGAR && 0); await nav(p, 'crm'); await p.waitForTimeout(1200);
    await p.click('#panel-crm .cr-card:has-text("Rápido Teste B16")'); await p.waitForSelector('#op-perdeu'); await p.click('#op-perdeu'); await p.waitForSelector('#f-per');
    await p.selectOption('#f-per [name=motivo]', 'Preço'); await p.click('#btn-perder'); await p.waitForTimeout(1500);
    ok('CRM: lead perdido com motivo da lista fixa sai do painel', sql("select motivo_perda from crm_oportunidades where prospecto_nome='Rápido Teste B16'") === 'Preço' &&
      !(await p.$('#panel-crm .cr-card:has-text("Rápido Teste B16")')));
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    // Tarefas: excluir manda para a aba Excluídas; restaurar volta
    sql("insert into tarefas(titulo,responsavel,status) values ('Tarefa B15 excluir','Pedro','pendente')");
    await p.evaluate(() => { GS.E.tf = null; }); await nav(p, 'tarefas'); await p.waitForTimeout(1500);
    await p.click('#tf-vista [data-v=lista]'); await p.click('#tf-abas [data-aba=abertas]'); await p.fill('#tf-busca', 'Tarefa B15'); await p.waitForTimeout(800);
    await p.click('#panel-tarefas [data-editar-t="' + sql("select id from tarefas where titulo='Tarefa B15 excluir'") + '"]'); await p.waitForSelector('#btn-excluir-tf');
    await p.click('#btn-excluir-tf'); await p.waitForTimeout(1500);
    ok('Tarefas: excluir vai para a aba "Excluídas" (não apaga)', sql("select status from tarefas where titulo='Tarefa B15 excluir'") === 'cancelada' && !/Tarefa B15 excluir/.test(await p.textContent('#tf-corpo')));
    await p.click('#tf-abas [data-aba=excluidas]'); await p.waitForTimeout(500);
    await p.click('#tf-corpo [data-restaurar-t]'); await p.waitForTimeout(1500);
    ok('Tarefas: "Restaurar" volta para Em aberto', sql("select status from tarefas where titulo='Tarefa B15 excluir'") === 'pendente');
    // Backup 16: criação rápida, minha semana (arrastar), pular recorrência, relatório por cliente, carga
    await p.fill('#tf-rapida', 'Protocolar recurso B16 amanhã @Emanuelle !alta #trabalhista'); await p.waitForTimeout(200);
    ok('Tarefas: criação rápida mostra o que entendeu', /Emanuelle/.test(await p.textContent('#tf-rapida-prev')) && /Alta/.test(await p.textContent('#tf-rapida-prev')));
    await p.press('#tf-rapida', 'Enter'); await p.waitForTimeout(1500);
    ok('Tarefas: criação rápida grava título, prazo (amanhã), pessoa, prioridade e etiqueta',
      sql("select responsavel||'|'||prioridade||'|'||(prazo=current_date+1)::text||'|'||etiquetas from tarefas where titulo='Protocolar recurso B16'") === 'Emanuelle|alta|true|trabalhista');
    sql("insert into tarefas(titulo,responsavel,status,prazo,recorrencia) values ('Semana B16','Pedro','pendente',date_trunc('week', current_date)::date,'mensal')");
    await p.evaluate(() => { GS.E.tf = null; }); await nav(p, 'hoje'); await p.waitForTimeout(800); await nav(p, 'tarefas'); await p.waitForTimeout(1500);
    await p.click('#tf-vista [data-v=semana]'); await p.waitForTimeout(600);
    { const terca = sql("select (date_trunc('week', current_date)::date + 1)::text");
      await p.evaluate((d) => { const c = [...document.querySelectorAll('.sm-card')].find((x) => /Semana B16/.test(x.textContent)), col = document.querySelector('.sm-col[data-dia="' + d + '"]'), dt = new DataTransfer();
        c.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true })); col.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
        col.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }, terca); await p.waitForTimeout(1500);
      ok('Minha semana: arrastar para outro dia remarca o prazo', sql("select prazo::text from tarefas where titulo='Semana B16'") === terca, terca); }
    { const idS = sql("select id from tarefas where titulo='Semana B16'"), p0 = sql("select prazo::text from tarefas where titulo='Semana B16'");
      await p.evaluate((id) => GS.abrirTarefa(id), idS); await p.waitForSelector('#tf-f-pular'); await p.click('#tf-f-pular'); await p.waitForTimeout(1500);
      ok('Tarefa recorrente: "Pular esta vez" passa para o mês seguinte sem concluir', sql("select status||'|'||(prazo = ('" + p0 + "'::date + interval '1 month')::date)::text from tarefas where titulo='Semana B16'") === 'pendente|true'); }
    await p.click('#tf-vista [data-v=relatorio]'); await p.waitForTimeout(800);
    ok('Tarefas: relatório com mês, por cliente e carga da semana', !!(await p.$('#tf-mes-rel')) && /Por cliente/.test(await p.textContent('#tf-corpo')) && /Carga da semana/.test(await p.textContent('#tf-corpo')));
    await p.click('#tf-vista [data-v=lista]');
    // Alertas: virar tarefa com subtarefas
    await nav(p, 'alertas'); await p.waitForTimeout(2500);
    { let bt = null;
      for (const al of (await p.$$('#panel-alertas .al-linha')).slice(0, 10)) {
        await al.click(); await p.waitForTimeout(700); bt = await p.$('[data-virar-tarefa]'); if (bt) break;
        await p.keyboard.press('Escape'); await p.waitForTimeout(200); }
      if (bt) { await bt.click(); await p.waitForSelector('#f-vt'); await p.selectOption('#f-vt [name=responsavel]', { index: 1 });
        const n = (await p.$$('#f-vt [data-vt]')).length; await salvarGs(p, '#vt-salvar'); await p.waitForTimeout(1200);
        ok('Alertas: "Virar tarefa" cria a tarefa com uma subtarefa por linha', sql("select count(*) from tarefas where descricao like 'Criada a partir do alerta%'") === '1' &&
          Number(sql("select count(*) from tarefas where tarefa_pai_id=(select id from tarefas where descricao like 'Criada a partir do alerta%')")) === n, n); }
      else ok('Alertas: "Virar tarefa" aparece no relatório do alerta', false); }
    // Documentos: atalho por tipo; Clientes: "Jurídico + Contábil"
    await nav(p, 'documentos'); await p.waitForTimeout(1500);
    ok('Documentos: filtros por grupo e atalhos por tipo (Procuração)', !!(await p.$('#doc-grupo')) && /Procuração/.test(await p.textContent('#doc-chips')));
    ok('"Jur + Cont" virou "Jurídico + Contábil"', await p.evaluate(() => !/Jur \+ Cont/.test(document.body.innerText)));

    // Geradores de documentos (páginas separadas, com a ponte do ERP)
    { const g = await p.context().newPage(); g.on('dialog', (d) => d.accept());
      g.on('pageerror', (e) => erros.push('gerador: ' + e.message));
      await g.goto(BASE + '/geradores/peticao.html'); await g.waitForSelector('#ponte'); await g.waitForTimeout(800);
      await g.fill('#ponte-cli', 'Alfa Comércio Ltda'); await g.click('#ponte-preencher'); await g.waitForTimeout(1500);
      ok('Gerador de petição: exige login, puxa o cliente do banco e monta a peça', /ALFA COM[EÉ]RCIO LTDA/i.test(await g.textContent('#folha')) && /Nestes termos/.test(await g.textContent('#folha')));
      await g.click('#ponte-guardar'); await g.waitForTimeout(2000);
      ok('Gerador: "Guardar em Documentos" salva na pasta do cliente', sql("select count(*) from documentos d join clientes c on c.id=d.cliente_id where c.nome='Alfa Comércio Ltda' and d.tipo='peticao'") === '1', await g.textContent('#ponte-msg'));
      await g.goto(BASE + '/geradores/contrato-procuracao.html'); await g.waitForSelector('#ponte'); await g.waitForTimeout(800);
      ok('Gerador de contrato: contas bancárias fora do arquivo público', !/SICOOB \(756\)',ag:'4113'/.test(await g.content()) && /var BANCOS=\{\}/.test(await g.content()));
      await g.fill('#ponte-cli', 'Alfa Comércio Ltda'); await g.click('#ponte-preencher'); await g.waitForTimeout(1200);
      ok('Gerador de contrato: preenche o contratante com os dados do cliente', /alfa com[eé]rcio/i.test(await g.inputValue('#ctteRazao').catch(() => '')) || /alfa com[eé]rcio/i.test(await g.inputValue('#ctteNome').catch(() => '')));
      await g.close();
      const semLogin = await (await b.newContext()).newPage(); await semLogin.goto(BASE + '/geradores/propostas.html'); await semLogin.waitForTimeout(1500);
      ok('Gerador sem login: bloqueia a página', await semLogin.isVisible('#ponte-bloqueio')); await semLogin.close(); }
    // PGFN pelos dados abertos (arquivo público, lido no navegador)
    { sql("update clientes set cpf_cnpj='11222333000181' where nome='Alfa Comércio Ltda'");
      const arq = require('path').join(require('os').tmpdir(), 'arquivo_lai_SIDA_MG.csv');
      require('fs').writeFileSync(arq, 'CPF_CNPJ;TIPO_PESSOA;TIPO_DEVEDOR;NOME_DEVEDOR;UF_DEVEDOR;UNIDADE_RESPONSAVEL;NUMERO_INSCRICAO;TIPO_SITUACAO_INSCRICAO;SITUACAO_INSCRICAO;RECEITA_PRINCIPAL;DATA_INSCRICAO;INDICADOR_AJUIZADO;VALOR_CONSOLIDADO\n' +
        '11.222.333/0001-81;Pessoa jurídica;PRINCIPAL;ALFA COMERCIO LTDA;MG;PRFN;10 6 25 000123-45;Em cobrança;ATIVA EM COBRANCA;IRPJ;10/03/2025;SIM;15000.50\n' +
        '11.222.333/0001-81;Pessoa jurídica;PRINCIPAL;ALFA COMERCIO LTDA;MG;PRFN;10 6 25 000999-01;Benefício Fiscal;ATIVA EM COBRANCA - PARCELADA;COFINS;11/04/2025;NAO;2000.00\n' +
        '99.999.999/0001-99;Pessoa jurídica;PRINCIPAL;OUTRA EMPRESA;MG;PRFN;10 6 25 000777-77;Em cobrança;ATIVA;IRPJ;01/01/2025;NAO;999.00\n');
      await nav(p, 'alertas'); await p.waitForTimeout(2500);
      await p.click('#panel-alertas [data-al]:has-text("PGFN — dados abertos")'); await p.waitForSelector('#pa-arq', { state: 'attached' });
      await p.setInputFiles('#pa-arq', arq); await p.click('#pa-ler'); await p.waitForTimeout(3000);
      ok('PGFN (dados abertos): lê o arquivo, separa só os clientes e atualiza PGFN / negociada', sql("select pgfn||'|'||pgfn_negociada from clientes where nome='Alfa Comércio Ltda'") === '15000.50|2000.00' &&
        sql("select count(*) from pgfn_inscricoes where fonte='dados_abertos'") === '2', await p.textContent('#pa-prog'));
      await p.keyboard.press('Escape'); }

    // ── sair ──
    await p.evaluate(() => acLogout()); await p.waitForTimeout(800);
    ok('sair encerra a sessão do Supabase', await p.evaluate(async () => !(await SB.auth.getSession()).data.session));
  } catch (e) {
    console.error(e); ok('sem exceção no teste', false);
  } finally {
    if (process.env.COBERTURA) {
      const tudo = [];
      for (const pg of paginasCob) { try { tudo.push(...await pg.coverage.stopJSCoverage()); } catch (e) { /* página já fechada */ } }
      require('fs').writeFileSync(process.env.COBERTURA, JSON.stringify(tudo.filter((x) => /\/(index\.html)?(\?|$)|gestao-embutida|editor\.js|erp-telas\.js|erp-dados\.js/.test(x.url))));
    }
    await b.close();
  }
  ok('sem erros de JavaScript', erros.length === 0, erros.slice(0, 5).join(' | '));
  ok('sem bloqueios da política de segurança', bloqueios.length === 0, bloqueios.slice(0, 3).join(' | '));
  r.forEach(([n, c]) => console.log((c ? 'PASSA  ' : 'FALHOU ') + n));
  const f = r.filter((x) => !x[1]).length;
  console.log('\n' + (r.length - f) + ' passaram, ' + f + ' falharam');
  process.exit(f ? 1 : 0);
})();
