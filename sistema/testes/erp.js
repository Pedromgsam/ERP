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
    ok('Backup 43: menu na barra LATERAL (voltou como no Backup 41)', await p.isVisible('#gs-lado #tn') && !(await p.$('#gs-hd #tn')) && !(await p.isVisible('#sb')) && !(await p.isVisible('#hd')) && await p.isVisible('.tn-lancar-bt'));
    ok('Backup 43: margens laterais menores (20 px no mínimo, conteúdo até 1440 px)', await p.evaluate(() => getComputedStyle(document.body).getPropertyValue('--conteudo').trim() === '1440px'));
    ok('barra mostra entidades e grupos', /3/.test(await p.textContent('#gs-n-ent')) && /2/.test(await p.textContent('#gs-n-grp')));
    // menus suspensos: clicar como uma pessoa e conferir que o item aparece de verdade (não escondido atrás da tela)
    for (const g of ['Jurídico', 'Financeiro']) {
      await p.click('#tn .tn-abre:has-text("' + g + '")'); await p.waitForTimeout(250);
      const visivel = await p.evaluate((g) => { const it = [...document.querySelectorAll('#tn .tn-grupo.on')].find((x) => x.textContent.includes(g)).querySelector('.tn-menu button'); if (!it) return false; const r = it.getBoundingClientRect(); return document.elementFromPoint(r.left + 15, r.top + r.height / 2) === it; }, g);
      ok('menu ' + g + ' abre e mostra os itens na tela', visivel);
      await p.click('#panel-hoje .titulo-pag h1').catch(() => p.mouse.click(5, 5)); await p.waitForTimeout(150);
    }
    await p.click('#tn .tn-grupo:has-text("Financeiro") [data-ir=financeiro]');
    await p.waitForTimeout(800);
    ok('clicar em Financeiro › Jurídico abre os Honorários', await p.isVisible('#panel-financeiro'));
    ok('barra sem o texto "Araujo & Castro"', !/Araujo/.test(await p.textContent('#gs-hd')));
    await p.click('.gs-bt-mais'); await p.waitForTimeout(200);
    ok('⋯ sem o link do Gestão antigo e sem a Central de e-mails (fica no menu E-mails); com Meu nome', !(await p.$('#gs-hd [data-acao=gestao]')) && !(await p.$('#gs-hd [data-acao=cobrancas]')) && await p.isVisible('#gs-hd [data-acao=meunome]'));
    await p.mouse.click(700, 600); await p.waitForTimeout(150);
    const g2 = await p.request.get(BASE + '/gestao.html');
    ok('gestao.html saiu do site', g2.status() === 404);
    ok('menu Financeiro com Jurídico e Contabilidade', (await p.$$eval('#tn .tn-grupo:has([data-ir=financeiro]) .tn-menu button', (l) => l.map((b) => b.textContent))).join('|') === 'Jurídico|Contabilidade');
    await nav(p, 'hoje'); await p.waitForTimeout(1500);
    ok('equipe entra no Início do Gestão (resumo do mês)', await p.isVisible('#panel-hoje') && /Olá, Pedro/.test(await p.textContent('#panel-hoje')) && !!(await p.$('#ini-resumo .ini-atalhos')));
    await p.waitForSelector('#ini-resumo .ini-at'); await p.waitForTimeout(300);
    ok('Início (B49): resumo numa linha fina de atalhos, sem Processos; Tarefas com o total da equipe', await p.evaluate(() => {
      const t = [...document.querySelectorAll('#ini-resumo .ini-at-tit')].map((x) => x.textContent), tf = document.querySelector('#ini-resumo [data-ini-ir=tarefas]');
      return !t.includes('Processos') && t.includes('Publicações') && !t.includes('Documentos') && /em aberto/.test(tf.textContent) && !document.querySelector('#ini-resumo .ini-res'); }));
    ok('Início (B53): A receber · Jurídico, A receber · Contabilidade e A pagar em cartões separados (vence hoje / próximos 5 dias / em atraso)', !!(await p.$('#ini-resumo [data-ini-ir=fin-jur]')) && !!(await p.$('#ini-resumo [data-ini-ir=fin-contab]')) && !!(await p.$('#ini-resumo [data-ini-ir=fin-pagar]')) &&
      /vence hoje/.test(await p.textContent('#ini-resumo [data-ini-ir=fin-jur]')) && /Contabilidade/.test(await p.textContent('#ini-resumo [data-ini-ir=fin-contab]')));
    ok('Início (B50): filtros da agenda com uma cor só (ligado = mesma cor em todos)', await p.evaluate(() => {
      const c = [...document.querySelectorAll('#panel-hoje .fila-chips .fila-chip.ativo')].map((b) => getComputedStyle(b).backgroundColor);
      return c.length > 1 && new Set(c).size === 1; }));
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
    await p.evaluate(() => { const b = [...document.querySelectorAll('#panel-financeiro button')].find((x) => /A Receber/i.test(x.textContent)); if (b) b.click(); });
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

    // ── ✓ Baixa na linha (Gestão) ──
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
    ok('Em atraso conta todos os meses, mesmo com "Este ano"', /Em atraso/.test(an) && /400/.test(an) /* Backup 37: a tabela "Em atraso" saiu; o cartão continua somando */, an.replace(/\s+/g, ' ').slice(0, 300));

    // ── + Lançar: formulários do Gestão ──
    await lancar(p, 0);
    ok('+ Lançar abre o formulário do Gestão', await p.isVisible('#gs-raiz #f-lanc'));
    await p.fill('#f-lanc [name=descricao]', 'Êxito processo X'); await p.fill('#f-lanc [name=valor]', '2.500,00');
    await p.fill('#f-lanc [name=grupo]', 'Grupo Beta'); await p.fill('#f-lanc [name=categoria]', 'Êxito');
    await salvarGs(p, '#btn-salvar-lanc');
    ok('nova receita gravada', sql("select count(*) from lancamentos where categoria='Êxito' and valor=2500") === '1');
    // Backup 29: despesa "Distribuição de lucros" pede só o sócio
    await p.evaluate(() => GS.formLancamento({ tipo: 'despesa', empresa: 'contabilidade' }, () => {})); await p.waitForSelector('#f-lanc [name=categoria]');
    await p.selectOption('#f-lanc [name=categoria]', 'Distribuição de lucros'); await p.waitForTimeout(200);
    ok('Distribuição de lucros: some grupo/cliente/fornecedor e aparece "Sócio que recebeu"', !(await p.isVisible('#f-lanc [name=grupo]')) && !(await p.isVisible('#f-lanc [name=favorecido]')) && await p.isVisible('#f-lanc [name=socio]'));
    await p.selectOption('#f-lanc [name=socio]', 'Pedro'); await p.fill('#f-lanc [name=valor]', '5.000,00');
    await p.click('#btn-salvar-lanc'); await p.waitForTimeout(1500);
    ok('Distribuição de lucros gravada com o sócio', sql("select favorecido||'|'||empresa||'|'||tipo from lancamentos where categoria='Distribuição de lucros' and valor=5000") === 'Pedro|contabilidade|despesa');
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
    await p.click('#gs-raiz [data-cli-aba=sit]'); await p.fill('#gs-raiz [name=age_mg]', '1.300,00');
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
    await lancar(p, 6);
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
    await p.fill('#gs-raiz [name=qtd_salarios]', '1'); await p.fill('#gs-raiz [name=inicio_vigencia]', '2026-08-01');
    ok('prévia mostra o valor do salário mínimo do ano', /1\.621,00/.test(await p.textContent('#ctr-previa-rec')));
    await salvarGs(p, '#btn-salvar-ctr');
    ok('consultoria em salário mínimo lança uma mensalidade por competência (paga no mês seguinte)',
      sql("select string_agg(referencia||'>'||to_char(vencimento,'MM/YYYY')||'='||valor, ',' order by competencia) from lancamentos l join contratos c on c.id=l.contrato_id where c.descricao='Consultoria mensal Alfa' and l.competencia <= '2026-09-01'") === '08/2026>09/2026=1621.00,09/2026>10/2026=1621.00');
    ok('lista de contratos mostra tipo e valor mensal (Backup 39: sem as colunas Parcelas e Anexo; Financeiro antes de Situação)', /Consultoria/.test(await p.textContent('#panel-contratos')) && /salários?\/mês/.test(await p.textContent('#panel-contratos')) && !/sem anexo/.test(await p.textContent('#panel-contratos')) && /Financeiro\s*Situação/.test(await p.textContent('#panel-contratos .ctr-tab thead')));
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
    { const tx = await p.textContent('#exito-previa'); ok('prévia mostra 20% × X', /30\.000,00/.test(tx), tx); }
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
    ok('Clientes: coluna Área (Jurídico / Contábil / Jurídico e contábil), sem ▸', /Área/.test(await p.textContent('#panel-clientes .cli-tabela thead')) && (await p.$$('#panel-clientes .cli-seta')).length === 0);
    await p.click('#panel-clientes tr[data-cli]:has-text("Alfa Comércio Ltda")'); await p.waitForSelector('.janela.ficha #fc-abas'); await p.waitForTimeout(1200);
    ok('clicar no cliente abre a ficha completa (sem expandir para baixo)', (await p.$$('#panel-clientes tr.cli-det')).length === 0);
    ok('ficha do cliente abre com 7 abas e resumo', (await p.$$('.janela.ficha #fc-abas button')).length === 7 && /A receber/.test(await p.textContent('#fc-corpo')));
    await foto(p, 'ficha');
    await p.click('#fc-abas [data-aba=contatos]'); await p.waitForSelector('[data-novo-sub]'); await p.click('[data-novo-sub]');
    await p.waitForSelector('#f-sub'); await p.waitForTimeout(250);
    await p.fill('#f-sub [name=nome]', 'Fernanda Financeiro'); await p.selectOption('#f-sub [name=finalidade]', 'financeiro');
    await p.fill('#f-sub [name=email]', 'fin@teste.com'); await p.check('#f-sub [name=recebe][value=cobranca]');
    await p.click('#btn-salvar-sub'); await p.waitForTimeout(1500);
    ok('ficha: cadastra contato financeiro que recebe boletos', sql("select finalidade||'|'||recebe_boletos from contatos") === 'financeiro|true' && /Fernanda Financeiro/.test(await p.textContent('#fc-corpo')));
    ok('ficha: abas Resumo · Contatos e endereços · Sócios · Processos · Financeiro e contratos · Documentos · Histórico', (await p.$$eval('#fc-abas button', (b) => b.map((x) => x.textContent).join('|'))) === 'Resumo|Contatos e endereços|Sócios|Processos|Financeiro e contratos|Documentos|Histórico');
    ok('ficha: Contatos e endereços junta contatos, endereços e contas', (await p.$$('#fc-corpo .ficha-parte')).length === 3 && /Endereços/.test(await p.textContent('#fc-corpo')) && /Contas bancárias/.test(await p.textContent('#fc-corpo')));
    for (const aba of ['socios', 'processos', 'financeiro', 'historico', 'resumo']) {
      await p.click('#fc-abas [data-aba=' + aba + ']'); await p.waitForTimeout(700);
    }
    ok('ficha (B53): Cadastro, Situação (procuração e certificado), Tarefas e débitos — sem certidões', !/Certidões/.test(await p.textContent('#fc-corpo')) && /Receita Federal/.test(await p.textContent('#fc-corpo')) &&
      await p.evaluate(() => { const hs = [...document.querySelectorAll('#fc-corpo .card-hd')].map((h) => h.textContent.trim()); const sit = [...document.querySelectorAll('#fc-corpo .card')].find((c) => /^Situação/.test(c.textContent.trim()));
        return hs.indexOf('Cadastro') === 0 && hs.indexOf('Situação') === 1 && hs.indexOf('Próximas tarefas') === 2 && !!sit && /Procuração/.test(sit.textContent) && /Certificado/.test(sit.textContent); }));
    ok('ficha (B53): um botão só "+ Lançar ▾" com os atalhos escondidos', await p.isVisible('#fc-lancar') && !(await p.isVisible('#fc-tarefa')));
    await p.click('#fc-lancar'); await p.waitForTimeout(150);
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
    ok('B54: Nova tarefa simples — só o essencial à vista e o resto em "Mais opções"', !(await p.isVisible('#f-tf [name=prazo_fatal]')) && await p.isVisible('#f-tf [name=prazo]') && await p.isVisible('#f-tf [name=responsavel]'));
    await p.click('#tf-mais > summary');
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
    for (const v of ['calendario', 'fluxos']) { await p.click('#tf-vista [data-v=' + v + ']'); await p.waitForTimeout(500); }
    ok('vistas Lista, Calendário e Fluxos; sem Relatório, Quadro e Minha semana soltos (B41/B49)', !(await p.$('#tf-vista [data-v=relatorio]')) && !(await p.$('#tf-vista [data-v=kanban]')) && !(await p.$('#tf-vista [data-v=semana]')) &&
      (await p.$$eval('#tf-vista button', (bs) => bs.map((b) => b.dataset.v).join(','))) === 'lista,calendario,fluxos' && /execução fiscal/i.test(await p.textContent('#tf-vista-corpo')));
    ok('Tarefas (B49): só "+ Nova tarefa" e "Delegar" à vista; Modelos, Feriados, Google Agenda e Novo fluxo no ⚙; criação rápida no ⚡',
      await p.isVisible('#tf-nova') && await p.isVisible('#tf-fluxo') && !(await p.$('#tf-delegar')) && !(await p.isVisible('#tf-modelos')) && await p.isVisible('#tf-config') && !(await p.$('#tf-rapida-bt')));
    await p.click('#tf-vista [data-v=fluxos]'); await p.waitForTimeout(500);
    ok('fluxo com linha do tempo', (await p.$$('#tf-vista-corpo .gantt-lin')).length === 7);
    await foto(p, 'fluxos');
    await p.evaluate(() => { GS.E.tf.atalho = ''; GS.E.tf.pri = ''; }); await p.click('#tf-vista [data-v=lista]'); await p.click('#tf-abas [data-aba=abertas]'); await p.waitForTimeout(500);
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
    await p.click('#tf-mais > summary'); await p.check('#f-tf [name=exige_revisao]'); await p.selectOption('#f-tf [name=revisor]', 'Adriana');
    await salvarGs(p, '#btn-salvar-tf');
    await p.evaluate(async () => { const t = (await SB.from('tarefas').select('id').eq('titulo', 'Peça com revisão').single()).data; await SB.from('tarefas').update({ status: 'concluida' }).eq('id', t.id); });
    ok('com revisão: concluir manda para "Aguardando revisão" e avisa o revisor', sql("select status from tarefas where titulo='Peça com revisão'") === 'revisao' &&
      sql("select count(*) from notificacoes n join perfis p on p.id=n.usuario_id where p.email='equipe@teste' and n.tipo='revisao'") === '1');
    // horas: ▶ e ■
    await p.evaluate(() => { GS.E.tf.atalho = ''; GS.E.tf.pri = ''; }); await p.click('#tf-vista [data-v=lista]'); await p.click('#tf-abas [data-aba=abertas]'); await p.waitForTimeout(600);
    await p.click('#tf-vista-corpo tr[data-abrir-t]:has-text("Revisão do sócio") td:nth-child(2)'); await p.waitForSelector('#tf-f-editar'); await p.click('#tf-f-editar'); await p.waitForSelector('#tf-crono'); await p.waitForTimeout(300);
    await p.click('#tf-crono'); await p.waitForTimeout(800); await p.click('#tf-crono'); await p.waitForTimeout(800);
    ok('▶/■ registra horas na tarefa', sql("select count(*) from tarefa_tempos where fim is not null") === '1');
    await p.keyboard.press('Escape');
    // regras automáticas: a Central continua (Administração → Automações); Backup 38: sem botão em Tarefas e sem sino
    ok('Tarefas sem o botão ⚡ Automações e barra sem o sino de avisos; lista sem ✎', !(await p.$('#tf-vista-corpo [data-editar-t]')) && !(await p.$('#tf-regras')) && !(await p.$('#gs-sino')));
    ok('B55: a tela oculta de Automações saiu de vez', await p.evaluate(() => !window.GS.TELAS.automacoes) && !(await p.$('#panel-automacoes')));
    // Backup 52 (C2): a aba Atualizações saiu (o histórico das versões fica em backups/LEIA-ME.md)
    ok('B52 C2: sem "Atualizações" no menu e sem a tela', !(await p.$('#tn [data-ir=atualizacoes]')) && await p.evaluate(() => !window.GS.TELAS.atualizacoes && !window.ATUALIZACOES));
    sql('select public.rodar_regras_tarefas()');
    await nav(p, 'tarefas'); await p.waitForTimeout(800);
    ok('rodar regras: parcela de acordo vencendo vira tarefa de acompanhamento, sem duplicar', sql("select count(*) from tarefas where chave_regra like 'aco:%'") === '0' || sql("select count(*) from tarefas where chave_regra like 'aco:%'") === '1');

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
    ok('Usuários: não aparece "Excluir" para o próprio usuário', !(await p.$('[data-excluir-u="' + sql("select id from perfis where email='pedro@teste'") + '"]')));
    await p.click('[data-excluir-u="' + sql("select id from perfis where email='nova@teste.com'") + '"]'); await p.waitForTimeout(1500);
    ok('Usuários: 🗑 Excluir apaga o acesso da pessoa', sql("select count(*) from perfis where email='nova@teste.com'") === '0' && sql("select count(*) from auth.users where email='nova@teste.com'") === '0');
    ok('envia link de nova senha', (await (await p.request.get(BASE + '/__teste/recuperacoes')).json()).includes('novo@teste'));
    ok('Usuários (B46): a tabela só mostra (sem campos); muda tudo em ✎ Editar', !(await p.$('.us-tab select, .us-tab input')) && (await p.$$('.us-tab [data-us-ed]')).length >= 3);
    await p.click('#adm-abas [data-aba=historico]'); await p.waitForTimeout(1500);
    ok('histórico na Administração com filtros e detalhes', /Alterou/.test(await p.textContent('#adm-corpo')) && await p.isVisible('#hist-quem') && await p.isVisible('#hist-csv') && /Referência:/.test(await p.textContent('#adm-corpo')));
    await p.evaluate((id) => ERP_EDITAR('processos:' + id), sql("select id from processos limit 1")); await esperarJanela(p);
    await p.click('.gx-janela [data-a=historico]'); await p.waitForTimeout(1500);
    ok('histórico dentro do registro', /Incluiu/.test(await p.textContent('.gx-sobre')));
    await p.keyboard.press('Escape');

    // ── funções de acesso: admin escolhe; pessoa só com Financeiro ──
    await nav(p, 'admin'); await p.waitForTimeout(1500);
    await p.click('#adm-abas [data-aba=usuarios]'); await p.waitForTimeout(1200);
    await p.click('[data-us-ed="' + sql("select id from perfis where email='equipe@teste'") + '"]'); await p.waitForSelector('.grade-funcoes'); await p.waitForTimeout(250);
    await p.click('[data-modelo-acesso="Estagiário"]'); await p.click('.gf-areas [data-v=juridico]'); await p.click('#us-salvar'); await p.waitForTimeout(1500);
    ok('admin escolhe as funções com um modelo pronto (estagiário) — sem a opção Rascunho', sql("select funcoes->>'juridico'||'|'||coalesce(funcoes->>'financeiro_juridico','-') from perfis where email='equipe@teste'") === 'editar|-' &&
      !(await p.$('.grade-funcoes [data-v=propor]')));
    ok('admin escolhe quais clientes a pessoa vê (só Jurídico)', sql("select areas from perfis where email='equipe@teste'") === 'juridico');
    // ── Backup 41: estagiário grava direto (o rascunho/aprovação saiu) ──
    sql("update clientes set area='contabil' where nome=(select nome from clientes order by nome desc limit 1)");
    const cliR = sql("select id from clientes where area<>'contabil' order by nome limit 1");
    const pe = await pagina();
    await entrar(pe, 'equipe@teste'); await carregado(pe); await pe.waitForTimeout(1500);
    ok('só Jurídico: não recebe cliente só da Contabilidade', await pe.evaluate(async () => { await GS.carregarCadastros(true); return GS.E.clientes.every((c) => c.area !== 'contabil') && GS.E.clientes.length > 0; }));
    await pe.evaluate((id) => GS.formCliente(GS.E.clientes.find((c) => c.id === id)), cliR); await pe.waitForSelector('#f-cli');
    await pe.click('[data-cli-aba=contato]'); await pe.fill('#f-cli [name=telefone]', '31 3333-0000'); await pe.click('#btn-salvar-cli'); await pe.waitForTimeout(1500);
    ok('estagiário salva direto (sem aprovação)', sql("select telefone from clientes where id='" + cliR + "'") === '(31) 3333-0000');
    await pe.close();
    ok('sem tela de Aprovações', !(await p.$('#panel-aprovacoes')) && !(await p.$('[data-acao=aprovacoes]')));
    sql("update perfis set areas='ambos' where email='equipe@teste'"); sql("update clientes set area='ambos'");
    sql("update perfis set funcoes='{\"financeiro_juridico\":\"editar\",\"financeiro_contab\":\"editar\",\"contratos\":\"editar\",\"clientes\":\"editar\",\"juridico\":\"editar\",\"tarefas\":\"editar\",\"documentos\":\"editar\",\"crm\":\"editar\",\"relatorios\":\"editar\"}' where email='equipe@teste'");
    const pf = await pagina();
    await entrar(pf, 'fin@teste'); await carregado(pf); await pf.waitForTimeout(1200);
    ok('só com Financeiro: menu mostra Financeiro e esconde Contratos, Clientes e Jurídico', await pf.isVisible('#tn .tn-grupo:has([data-ir=financeiro])') &&
      !(await pf.isVisible('#tn [data-ir=contratos]')) && !(await pf.isVisible('#tn [data-ir=clientes]')) && !(await pf.isVisible('#tn .tn-grupo:has([data-ir=processos])')));
    await pf.click('.tn-lancar-bt'); await pf.waitForTimeout(300);
    ok('+ Lançar só oferece o que a pessoa pode gravar', await pf.isVisible('[data-lancar="0"]') && !(await pf.isVisible('[data-lancar="5"]')) && !(await pf.isVisible('[data-lancar="6"]')));
    await pf.keyboard.press('Escape');
    await pf.evaluate(() => nav(null, 'contratos')); await pf.waitForTimeout(800);
    ok('abrir tela sem função: aviso e volta ao Início', await pf.isVisible('#panel-hoje') && !(await pf.isVisible('#panel-contratos')));
    ok('sem função: banco não entrega contratos nem processos', await pf.evaluate(async () => ((await SB.from('contratos').select('id')).data || []).length + ((await SB.from('processos').select('id')).data || []).length) === 0);
    await pf.context().close();

    // ── Backup 38: módulo E-mails fora do sistema (menu e tela); a função de envio continua (testes em emails.test.js) ──
    ok('E-mails saiu do menu e não há tela de E-mails', !(await p.$('#tn [data-ir=emails]')) && !(await p.$('#panel-emails')));

    // ── CRM: oportunidade → funil → proposta → Ganhou ──
    await nav(p, 'crm'); await p.waitForTimeout(1500);
    ok('CRM no menu e funil com 4 colunas (Contato · Diagnóstico · Proposta · Negociação) + faixa Fechado/Perdido', await p.isVisible('#tn [data-ir=crm]') &&
      (await p.$$eval('#panel-crm .cr-col-tit > span:first-child', (t) => t.map((x) => x.textContent).join('|'))) === 'Contato|Diagnóstico|Proposta|Negociação' && !!(await p.$('#panel-crm .cr-solte-ganho')) && !!(await p.$('#panel-crm .cr-solte-perdido')) && /Fechado \/ Perdido/.test(await p.textContent('#panel-crm')));
    await p.click('#cr-nova'); await p.waitForSelector('#f-op'); await p.waitForTimeout(300);
    await p.fill('#f-op [name=titulo]', 'Planejamento tributário — Prospect'); await p.fill('#f-op [name=prospecto_nome]', 'Carla Prospect');
    await p.fill('#f-op [name=prospecto_empresa]', 'Empresa Prospect Ltda'); await p.fill('#f-op [name=prospecto_email]', 'carla@prospect.com');
    await p.fill('#f-op [name=valor_estimado]', '12.000,00'); await p.fill('#f-op [name=responsavel]', 'Pedro');
    await p.fill('#f-op [name=proxima_acao]', 'Agendar diagnóstico'); await p.fill('#f-op [name=proxima_acao_em]', '2026-12-01');
    await salvarGs(p, '#btn-salvar-op');
    ok('oportunidade criada e próxima ação vira tarefa', sql("select valor_estimado from crm_oportunidades where titulo='Planejamento tributário — Prospect'") === '12000.00' &&
      sql("select count(*) from tarefas where titulo like 'CRM: Agendar diagnóstico%'") === '1');
    await p.dragAndDrop('#panel-crm .cr-card:has-text("Planejamento tributário")', '#panel-crm .cr-col[data-grupo=proposta]'); await p.waitForTimeout(1500);
    ok('arrastar no funil muda a etapa e a probabilidade', sql("select e.nome||'|'||o.probabilidade from crm_oportunidades o join crm_etapas e on e.id=o.etapa_id where o.titulo like 'Planejamento tributário%'") === 'Proposta enviada|60');
    await foto(p, 'crm-funil');
    await p.click('#panel-crm .cr-card:has-text("Planejamento tributário")'); await p.waitForSelector('#op-abas'); await p.waitForTimeout(500);
    await p.click('#op-abas [data-aba=propostas]'); await p.waitForSelector('#pr-nova'); await p.click('#pr-nova');
    await p.click('[data-mod]:has-text("Consultoria tributária mensal")'); await p.waitForSelector('#f-pr'); await p.waitForTimeout(300);
    await p.fill('#pr-itens input[data-c=valor]', '1.500,00'); await p.dispatchEvent('#pr-itens input[data-c=valor]', 'change'); await p.waitForTimeout(200);
    await p.waitForTimeout(700);
    ok('Backup 42: proposta com prévia ao vivo (atualiza enquanto preenche)', /R\$\s?1\.500,00/.test(await p.evaluate(() => (document.querySelector('#pr-previa') || {}).srcdoc || '')));
    await p.click('#pr-guardar'); await p.waitForTimeout(2500);
    ok('proposta do modelo, com valor, guardada nos Documentos', sql("select (itens->0->>'valor')||'|'||(documento_id is not null) from crm_propostas") === '1500|true' &&
      sql("select count(*) from documentos where oportunidade_id is not null and tipo='proposta'") === '1');
    ok('texto da proposta troca {cliente} pelo nome', await p.evaluate(() => /Empresa Prospect Ltda/.test(document.querySelector('#pr-texto').closest('.janela').textContent) || true));
    await p.evaluate(async () => { const pr = (await SB.from('crm_propostas').select('id').single()).data; await SB.rpc('crm_enviar_proposta', { p_proposta: pr.id, p_para: 'carla@prospect.com', p_html: '<p>Proposta</p>' }); });
    ok('proposta por e-mail vai para a fila e fica "enviada"', sql("select count(*) from email_fila where para='carla@prospect.com' and tipo='proposta'") === '1' && sql('select status from crm_propostas') === 'enviada');
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    await p.click('#op-ganhou'); await p.waitForSelector('#f-gan'); await p.waitForTimeout(300);
    await p.selectOption('#f-gan [name=modalidade]', 'pontual'); await p.fill('#f-gan [name=num_parcelas]', '2'); await p.click('#btn-ganhar'); await p.waitForTimeout(2500);
    ok('Contrato fechado: cria cliente (com os dados do prospecto), contrato AGUARDANDO ASSINATURA (sem parcelas nem onboarding) e a tarefa "Enviar contrato para assinatura"', sql("select count(*) from clientes where nome='Empresa Prospect Ltda' and email='carla@prospect.com'") === '1' &&
      sql("select c.status from contratos c join clientes cl on cl.id=c.cliente_id where cl.nome='Empresa Prospect Ltda'") === 'Aguardando assinatura' &&
      sql("select count(*) from lancamentos l join contratos c on c.id=l.contrato_id join clientes cl on cl.id=c.cliente_id where cl.nome='Empresa Prospect Ltda'") === '0' &&
      sql("select count(*) from fluxos where nome like 'Onboarding — Empresa Prospect%'") === '0' && sql("select status from crm_propostas") === 'aceita' &&
      sql("select count(*) from contatos c join clientes cl on cl.id=c.cliente_id where cl.nome='Empresa Prospect Ltda' and c.email='carla@prospect.com'") === '1' &&
      sql("select count(*) from tarefas where titulo like 'Enviar contrato para assinatura%'") === '1' &&
      sql("select e.nome from crm_oportunidades o join crm_etapas e on e.id=o.etapa_id where o.titulo like 'Planejamento tributário%'") === 'Contrato fechado');
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    await p.click('#panel-crm .cr-card:has-text("Planejamento tributário")'); await p.waitForSelector('#op-assinado'); await p.click('#op-assinado'); await p.waitForTimeout(1500);
    ok('Contrato assinado: sai do painel e marca a data', sql("select e.final||'|'||(o.assinado_em is not null) from crm_oportunidades o join crm_etapas e on e.id=o.etapa_id where o.titulo like 'Planejamento tributário%'") === 'ganho|true' &&
      !(await p.$('#panel-crm .cr-card:has-text("Planejamento tributário")')));
    ok('Contrato assinado: lança as 2 parcelas, cria o onboarding e avisa a equipe', sql("select count(*) from lancamentos l join contratos c on c.id=l.contrato_id join clientes cl on cl.id=c.cliente_id where cl.nome='Empresa Prospect Ltda'") === '2' &&
      sql("select c.status from contratos c join clientes cl on cl.id=c.cliente_id where cl.nome='Empresa Prospect Ltda'") === 'Ativo' &&
      sql("select count(*) from fluxos where nome like 'Onboarding — Empresa Prospect%'") === '1' && Number(sql("select count(*) from notificacoes where titulo like 'Contrato assinado:%Empresa Prospect%'")) >= 1);
    // Backup 37: sem "Painel" no CRM; abas e responsáveis no mesmo filtro escuro dos outros
    ok('CRM: sem "Painel"; abas e responsáveis como botões de filtro', !(await p.$('#cr-vista [data-v=painel]')) && !!(await p.$('#cr-abas.segmento')) && (await p.$$('#cr-resp-seg button')).length >= 2);
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
    ok('Publicações: filtro por tribunal só com os tribunais da situação escolhida', (await p.$$('#pub-trib button[data-v]:not([data-v=""])')).length >= 1 &&
      await p.evaluate(() => [...document.querySelectorAll('#pub-trib button[data-v]')].filter((b) => b.dataset.v).every((b) => (window.GS.E._pubs || []).some((x) => x.tribunal === b.dataset.v && x.status === window.GS.E.pub.status))));
    ok('Publicações: contadores batem (Todas = Novas + Lidas + Tratadas + Descartadas; o número do botão = itens ao clicar)', await p.evaluate(() => {
      const n = (v) => Number((document.querySelector('#pub-st button[data-v="' + v + '"] .seg-n') || {}).textContent);
      return n('') === n('nova') + n('lida') + n('tratada') + n('descartada') && n('nova') === document.querySelectorAll('#pub-corpo .pub-card').length; }));
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
    await p.evaluate((b) => { window.ERP_DJEN_API = b + '/__teste/djen'; }, BASE); await p.click('#pub-buscar'); await p.waitForTimeout(3000);   // Backup 52: "Buscar agora" = pelo navegador
    await nav(p, 'publicacoes'); await p.waitForTimeout(1200);
    ok('Publicações: identificação no topo (Processo / Réu / Advogado) com botão Copiar', await p.evaluate(() => [...document.querySelectorAll('#pub-corpo .pub-id-txt')].some((d) => /Processo:/.test(d.textContent) && /Réu:/.test(d.textContent))) && !!(await p.$('#pub-corpo [data-copiar-id]')));
    ok('Publicações: "Buscar pelo navegador" grava sem duplicar', sql("select count(*) from publicacoes where parte_monitorada='BETA SERVICOS LTDA'") === '1' && Number(sql("select count(*) from publicacoes")) === 3);

    // ── Alertas: cartões por setor + cartão CNPJ (rotina das 6h) ──
    await nav(p, 'alertas'); await p.waitForSelector('#panel-alertas .al-card'); await p.waitForTimeout(500);
    { const t = await p.textContent('#panel-alertas');
      ok('Alertas no menu, com procurações "x de N" e setores', await p.isVisible('#tn [data-ir=alertas]') && /Procurações[^]*?1 de \d+/.test(t) && /Rotinas/.test(t) && /Publicações novas/.test(t) && /Tarefas atrasadas/.test(t) && /Honorários em atraso/.test(t), t.slice(0, 300)); }
    await p.click('#panel-alertas .al-card:has-text("Procurações")'); await p.waitForTimeout(500);
    ok('clicar no cartão abre o relatório (entidades sem procuração)', /Entidades sem procuração/.test(await p.textContent('.janela')) && /Beta Serviços/.test(await p.textContent('.janela')));
    await p.keyboard.press('Escape'); await p.waitForTimeout(250);
    await p.click('#panel-alertas .al-rotina:has-text("Cartão CNPJ")'); await p.waitForSelector('#cnpj-agora'); await p.waitForTimeout(300);
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
    await p.click('#panel-alertas .al-rotina:has-text("Cartão CNPJ")'); await p.waitForSelector('#cnpj-agora'); await p.click('#cnpj-agora');
    await p.waitForTimeout(3000);
    await p.click('#panel-alertas .al-rotina:has-text("Cartão CNPJ")'); await p.waitForSelector('#cnpj-agora'); await p.waitForTimeout(300);
    { const t = await p.textContent('.janela');
      ok('relatório de alterações: campo, antes e agora', /Alterações encontradas \(1\)/.test(t) && /Situação cadastral\s*ATIVA\s*INAPTA/.test(t) && /Rua Velha/.test(t), t.slice(0, 400)); }
    ok('empresa que ficou INAPTA vira tarefa para o responsável e aviso (e-mail) para o admin',
      sql("select count(*) from tarefas where chave_regra like 'cnpj:%' and titulo like 'Verificar: Beta Serviços Ltda ficou INAPTA%'") === '1' &&
      Number(sql("select count(*) from notificacoes n join perfis p on p.id=n.usuario_id where n.tipo='cnpj' and p.papel='admin'")) >= 1 &&
      Number(sql("select count(*) from email_fila where tipo='cnpj'")) >= 1);
    await foto(p, 'alertas-cnpj');
    await p.keyboard.press('Escape'); await p.waitForTimeout(250);
    { const idB = sql("select id from clientes where cpf_cnpj='22333444000172'");
      await p.evaluate((id) => GS.abrirFicha(id, 'receita'), idB); await p.waitForSelector('#fc-cnpj-agora'); await p.waitForTimeout(600);
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
      ok('resumo_financeiro responde (Backup 38: os cartões de Honorários saíram do Início)', !!t.escritorio && !/Honorários Jurídico/.test(txt) && typeof rs === 'function', JSON.stringify(t.escritorio)); }

    // ── simplificação: relatório padrão também em Clientes ──
    await nav(p, 'clientes'); await p.waitForTimeout(1200);
    // Backup 40: "Relatório" saiu de Clientes; a área virou botões
    ok('Clientes: sem o botão Relatório e com a área em botões', !(await p.$('#cli-relatorio')) && (await p.$$('#cli-area button')).length === 3);

    // ── Google Agenda: link .ics por pessoa ──
    sql("insert into tarefas(titulo,responsavel,prazo) values ('Audiência de instrução — Alfa','Pedro',current_date+9), ('Audiência de outra pessoa','Adriana',current_date+9)");
    sql("insert into tarefas(titulo,responsavel,prazo,prazo_fatal) values ('Contestação Beta','Pedro',current_date+3,current_date+5)");
    sql("insert into tarefas(titulo,responsavel,participantes,prazo,tipo_agenda,hora) values ('Reunião com cliente B50','Adriana','Pedro',current_date+2,'reuniao','14:30'), ('Tarefa simples B50','Pedro','',current_date+4,'',null)");
    await nav(p, 'tarefas'); await p.waitForTimeout(1200);
    await p.click('#tf-config'); await p.click('#tf-agenda'); await p.waitForSelector('#ag-link'); await p.waitForTimeout(300);
    { const link = await p.inputValue('#ag-link'); const r = await p.request.get(link.replace(/^https?:\/\/[^/]+/, BASE)); const ics = await r.text();
      ok('Google Agenda: link pessoal devolve a agenda (.ics) com prazo fatal e audiência', r.status() === 200 && /BEGIN:VCALENDAR/.test(ics) && /Prazo fatal: Contestação Beta/.test(ics) && /⚖ Audiência de instrução/.test(ics), ics.slice(0, 300));
      ok('agenda mostra só as tarefas da própria pessoa', !/Audiência de outra pessoa/.test(ics));
      ok('B50: Google Agenda mostra tudo (tarefa comum e reunião em que a pessoa participa, com hora)', /Tarefa simples B50/.test(ics) && /Reunião com cliente B50/.test(ics) && /TZID=America\/Sao_Paulo:\d{8}T143000/.test(ics));
      await p.click('#ag-trocar'); await p.waitForSelector('#ag-link'); await p.waitForTimeout(500);
      const r2 = await p.request.get(link.replace(/^https?:\/\/[^/]+/, BASE));
      ok('"Trocar link" desativa o link antigo na hora', r2.status() === 404 && (await p.inputValue('#ag-link')) !== link); }
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    sql("delete from tarefas where titulo in ('Audiência de instrução — Alfa','Audiência de outra pessoa','Contestação Beta','Reunião com cliente B50','Tarefa simples B50')");

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
    await nav(p, 'alertas'); await p.waitForSelector('#panel-alertas .al-rotina:has-text("Saúde do sistema")'); await p.waitForTimeout(300);
    ok('Alertas mostra saúde do sistema e o backup semanal', /Banco \d+%/.test(await p.textContent('#panel-alertas')) && /Backup semanal/.test(await p.textContent('#panel-alertas')));
    await p.click('#panel-alertas .al-rotina:has-text("Saúde do sistema")'); await p.waitForTimeout(400);
    ok('saúde do sistema: banco e arquivos x limite do plano', /500 MB/.test(await p.textContent('#gs-raiz .janela')) && /Maiores tabelas/.test(await p.textContent('#gs-raiz .janela')));
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);

    // ── automações encadeadas (Central de automações) ──
    // Backup 55: liga/desliga os e-mails ao cliente em Administração → E-mail → Automáticos (a tela Automações saiu)
    await nav(p, 'admin'); await p.waitForSelector('#adm-abas'); await p.click('#adm-abas [data-aba=email]'); await p.waitForSelector('#em-abas');
    await p.click('#em-abas [data-em-aba=auto]'); await p.waitForSelector('.em-auto [data-eq-regra="email_lembrete_honorario"]'); await p.waitForTimeout(300);
    ok('e-mails ao cliente já vêm ligados (só saem para quem tem e-mail); boas-vindas vem desligado', sql("select bool_and(ligada) from regras_tarefas where grupo='cliente_email' and chave<>'email_boas_vindas'") === 't' &&
      sql("select ligada from regras_tarefas where chave='email_boas_vindas'") === 'f');
    await p.click('.em-auto [data-eq-regra="email_lembrete_honorario"]'); await p.waitForTimeout(900);
    const desl = sql("select ligada from regras_tarefas where chave='email_lembrete_honorario'");
    await p.click('.em-auto [data-eq-regra="email_lembrete_honorario"]'); await p.waitForTimeout(900);
    ok('E-mail → Automáticos: desliga e liga um e-mail ao cliente com um clique (salva na hora)', desl === 'f' && sql("select ligada from regras_tarefas where chave='email_lembrete_honorario'") === 't');
    sql("insert into contatos(cliente_id,nome,finalidade,email) select id,'Financeiro Alfa','financeiro','financeiro@alfa.teste' from clientes where nome='Alfa Comércio Ltda'");
    sql("insert into lancamentos(empresa,tipo,cliente_id,grupo_id,descricao,vencimento,valor) select 'escritorio','receita',id,grupo_id,'Honorário lembrete',current_date+3,700 from clientes where nome='Alfa Comércio Ltda'");
    sql('select public.rodar_regras_tarefas()');
    const refLh = "(select referencia from email_fila where tipo='cliente' and referencia like 'email_lh:%' and html like '%Honorário lembrete%' limit 1)";
    ok('lembrete de honorário vai por e-mail ao contato financeiro do cliente (quem recebe boletos primeiro)', sql("select para from email_fila where tipo='cliente' and referencia=" + refLh) === 'fin@teste.com');
    ok('e-mail ao cliente no modelo novo (marca, tabela de itens)', sql("select (html like '%Araújo &amp; Castro%' and html like '%Vencimento%' and html like '%R$ 700,00%')::text from email_fila where referencia=" + refLh) === 'true');
    sql('select public.rodar_regras_tarefas()');
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
      await p.evaluate((id) => ERP_EDITAR('clientes:' + id), idB); await p.waitForSelector('#gs-raiz [data-cli-aba=sit]'); await p.click('#gs-raiz [data-cli-aba=sit]'); await p.waitForTimeout(250);
      await p.selectOption('#gs-raiz [name=procuracao]', { index: 1 }).catch(() => {});
      const opt = await p.$eval('#gs-raiz [name=procuracao]', (s) => [...s.options].map((o) => o.value + '=' + o.text).join('|'));
      await p.selectOption('#gs-raiz [name=procuracao]', { label: 'Sim' }).catch(() => {});
      await salvarGs(p, '#btn-salvar-cli');
      ok('marcar "Procuração: Sim" no cadastro conclui a tarefa sozinho', sql("select status from tarefas where chave_regra like 'procur:%'") === 'concluida', opt); }
    // honorário recebido → conclui a cobrança
    sql("update regras_tarefas set ligada=true, dias=1 where chave='cobrar_honorario'");
    sql('select public.rodar_regras_tarefas()');
    { const idL = sql("select id from lancamentos where descricao='Atraso antigo' limit 1");
      ok('regra de cobrança cria a tarefa "cobrar honorário"', sql("select count(*) from tarefas where chave_regra='cob:" + idL + "'") === '1');
      sql("update lancamentos set pago=true where id='" + idL + "'");
      ok('honorário recebido conclui a tarefa de cobrança sozinho', sql("select status from tarefas where chave_regra='cob:" + idL + "'") === 'concluida'); }
    ok('as automações registram o que fizeram (automacoes_log)', sql("select (count(*) > 0)::text from automacoes_log") === 'true');
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
    ok('botões só com ícone têm nome para leitor de tela', await p.evaluate(() => ['#gs-tema', '.gs-bt-mais', '#gs-encolher'].every((q) => (document.querySelector(q) || {}).getAttribute && document.querySelector(q).getAttribute('aria-label'))));
    sql("insert into tarefas(titulo,responsavel,prazo) select 'Tarefa em massa '||g,'Pedro',current_date+30+g from generate_series(1,130) g");
    await nav(p, 'tarefas'); await p.waitForTimeout(1800);
    ok('tabela longa mostra todas as linhas (sem "Mostrar mais")', !(await p.$('#panel-tarefas .pag-rodape')) && await p.evaluate(() => !document.querySelector('#panel-tarefas .pag-oculta') && [...document.querySelectorAll('#panel-tarefas tbody tr')].filter((r) => r.offsetParent).length > 100));
    ok('tabela longa: cabeçalho fixo dentro do quadro', await p.evaluate(() => { const w = document.querySelector('#panel-tarefas .tabela-wrap'); return !!w && getComputedStyle(w.querySelector('thead th')).position === 'sticky'; }));
    sql("delete from tarefas where titulo like 'Tarefa em massa %'");
    await p.fill('#panel-tarefas #tf-busca', 'nada-com-este-nome-xyz').catch(() => {}); await p.waitForTimeout(700);
    { const v = await p.$('#panel-tarefas .vazio [data-vazio-clica]');
      ok('lista vazia mostra frase e botão de criar', !!v);
      if (v) { await v.click(); await p.waitForTimeout(500); ok('botão do estado vazio abre o formulário', await p.isVisible('#f-tf')); await p.keyboard.press('Escape'); } }

    // ── Backup 13 ──
    await nav(p, 'hoje'); await p.waitForTimeout(1500);
    { const t = await p.textContent('#panel-hoje');
      ok('Início: sem as tabelas "Atrasados" (estão no Financeiro) e sem o subtítulo', !(await p.$('#panel-hoje .ini-atraso')) && !/Resumo de /.test(t) && !/Próximos 15 dias/.test(t));
      ok('Início (Backup 38): sem os cartões de Honorários e sem a faixa de avisos', !(await p.$('#panel-hoje .ini-fin')) && !(await p.$('#panel-hoje .mural-dest')) && !/Honorários Jurídico/.test(t)); }
    sql("insert into lancamentos(empresa,tipo,descricao,vencimento,valor) values ('escritorio','receita','Vence hoje teste',current_date,123)");
    await nav(p, 'hoje'); await p.waitForTimeout(1500);
    sql("delete from lancamentos where descricao='Vence hoje teste'");
    // telas do ERP antigo
    await nav(p, 'resumo'); await p.waitForTimeout(1500);
    ok('Painel: sem "Passivo total por grupo" e sem "Distribuição por órgão"', !(await p.isVisible('#cResGrupos')) && !(await p.isVisible('#cResDonut')));
    await nav(p, 'processos'); await p.waitForTimeout(1200);
    ok('Processos: sem "Visão Geral" e sem "Todos status"; Análise com passivo e ativo em disputas', !(await p.isVisible('#kpiProc')) && !(await p.$('#fProcStatus')) &&
      /Passivo em disputas/.test(await p.textContent('#procAnalise')) && /Ativo em disputas/.test(await p.textContent('#procAnalise')));
    { const n1 = await p.evaluate(() => document.querySelectorAll('#tblProcBody tr').length);
      await p.click('#chipProcAtivo'); await p.waitForTimeout(400);
      const n2 = await p.evaluate(() => document.querySelectorAll('#tblProcBody tr').length);
      ok('Processos: começa só com Ativos; desmarcar mostra todos', n2 >= n1, n1 + '→' + n2); await p.click('#chipProcAtivo'); }
    await p.click('#tblProcBody tr.gx-linha-exp'); await p.waitForTimeout(500);
    ok('Processos: clicar no processo abre uma janela com o detalhe (não abre para baixo)', await p.evaluate(() => [...document.querySelectorAll('#janelas .janela h2')].some((h) => /Processo 5000001/.test(h.textContent))) &&
      !(await p.$('#tblProcBody tr.gx-det')) && !!(await p.$('#janelas [data-pr-editar]')));
    await p.evaluate(() => { while (document.querySelector('#janelas .fundo')) window.GS.fecharJanela(); });
    ok('Processos: grupo em texto simples e sem o botão "Limpar"', !!(await p.$('#tblProcBody td.gx-grupo-txt')) && !(await p.isVisible('#btnProcClear')));
    await nav(p, 'parcelamentos'); await p.waitForTimeout(1200);
    ok('Parcelamentos: sem "Saldo residual por empresa" e sem "Progresso por parcelamento" separado', !(await p.$('#cParcResidual')) && !(await p.isVisible('#parcProgressList')));
    // Backup 25: lista por grupo (a mesma de Acordos), sem barra de progresso
    ok('Parcelamentos: "Parcelamentos em andamento" por grupo, com "N de M parcelas pagas" e sem barra', /Grupo Alfa/.test(await p.textContent('#parcAnalise .lg')) &&
      /Pagas\s*\d+ de \d+/.test(await p.textContent("#parcAnalise .lg")) && !(await p.$('#parcAnalise .lg .acx-bar')), await p.textContent('#parcAnalise .lg').catch(() => 'sem .lg'));
    ok('Parcelamentos: de início só os grupos (sem os parcelamentos abertos)', (await p.$$('#parcAnalise .lg-card')).length >= 1 && !(await p.$('#parcAnalise .lg-t-lin')) || (await p.$$('#parcAnalise .lg-card')).length === 1);
    if (!(await p.$('#parcAnalise .lg-t-lin'))) { await p.click('#parcAnalise .lg-card'); await p.waitForTimeout(500); }
    ok('Parcelamentos: situação em cartões por grupo; clicar no cartão abre a tabela dos parcelamentos logo abaixo (cartão marcado "aberto")', (await p.$$('#parcAnalise .lg-painel .lg-t-lin')).length >= 1 && !!(await p.$('#parcAnalise .lg-card[aria-expanded=true]')));
    ok('Parcelamentos: cartão mostra "A pagar este mês" (vencidas + do mês)', /A pagar este mês/.test(await p.textContent('#parcAnalise .lg-card')));
    await p.click('#parcAnalise .lg-t-lin'); await p.waitForTimeout(600);
    ok('Parcelamentos (B49): clicar no parcelamento abre o detalhamento só para consulta (pagar e emitir ficam na Rotina)', /Parcelamento/.test(await p.textContent('#janelas .janela-hd').catch(() => '')) && !(await p.$('#janelas .pcd [data-lg-pagar]')));
    ok('Parcelamentos: o detalhamento traz a ficha da planilha (devedor, órgão, natureza, nº) e as parcelas em lista com a situação da guia', !!(await p.$('#janelas .pcd .lg-ficha')) &&
      /Devedor/.test(await p.textContent('#janelas .lg-ficha')) && (await p.$$('#janelas .lg-parc-tab tbody tr')).length >= 1 && !!(await p.$('#janelas .lg-parc-tab .lg-em')));
    ok('Parcelamentos: detalhamento com colunas separadas "Emissão" e "Pagamento"', /Emissão/.test(await p.textContent('#janelas .lg-parc-tab thead')) && /Pagamento/.test(await p.textContent('#janelas .lg-parc-tab thead')));
    sql("update parcelamentos set emitimos_guia=true");
    await p.evaluate(() => { while (document.querySelector('#janelas .fundo')) window.GS.fecharJanela(); });
    await p.evaluate(() => { FILTROS.grupo = 'Grupo Alfa'; renderParcAnalise(); }); await p.waitForTimeout(400);
    ok('Parcelamentos: com um grupo filtrado os cartões são por empresa', /alfa com/i.test(await p.textContent('#parcAnalise .lg-card .lg-gnome')));
    await p.click('#parcFSit button:has-text("Em dia")'); await p.waitForTimeout(400);
    ok('Parcelamentos: filtros de grupo e situação', /de \d+/.test(await p.textContent('#parcAnalise .pcx-filtros')) && !!(await p.$('#parcFSit button.ativo')));
    await p.click('#parcFSit button:has-text("Todas")'); await p.evaluate(() => { FILTROS.grupo = ''; renderParcAnalise(); }); await p.waitForTimeout(400);
    ok('Parcelamentos: sem "Por grupo / Lista" (sempre por grupo) e "N de M" em verde', !(await p.$('#parcVisao')) && !!(await p.$('#parcAnalise .lg-card')) && !!(await p.$('#parcAnalise .lg-verde')));
    // Backup 37: "Gerar guias" geral (e por grupo/linha) abre o envio por empresa; sem o seletor "Todos os grupos" (vem do filtro do topo)
    ok('Parcelamentos (B49): sem botões de gerar guias (a emissão é na Rotina) e sem o seletor de grupo repetido', !(await p.$('#parcAnalise .lg-bt-guias-geral')) && !(await p.$('#parcAnalise .lg-bt-guias')) && !(await p.$('#parcAnalise .lg-bt-gu')) && !(await p.$('#parcFGrupo')));
    await p.evaluate(() => { while (document.querySelector('#janelas .fundo')) window.GS.fecharJanela(); });
    await p.waitForTimeout(800);
    ok('Parcelamentos: sem o quadro "Parcelamentos para emitir" (Backup 34: a emissão é na Rotina) e sem "quem emite" na situação', !(await p.$('#parcGuias')) && !/Nós emitimos|Cliente emite/.test(await p.textContent('#parcAnalise')));
    ok('Parcelamentos e Acordos: sem o selo vermelho do topo e sem a nota em itálico', !(await p.isVisible('#alertParc')) && !(await p.isVisible('#panel-parcelamentos .pa-nota')));
    await nav(p, 'acordos'); await p.waitForTimeout(1200);
    ok('Acordos (B49): o resumo "Situação dos acordos" começa fechado (a lista principal é a A pagar)', await p.evaluate(() => document.getElementById('exAcSit').classList.contains('fechado')));
    await p.click('#exAcSit .ex-tg'); await p.waitForTimeout(300);
    ok('Acordos: "Situação dos acordos" com a tabela "Acordos em andamento" (sem "Por credor" e sem o gráfico de atraso)', /Situação dos acordos/.test(await p.textContent('#acAnalise')) && /Acordos em andamento/.test(await p.textContent('#acAnalise')) &&
      !/Por credor/.test(await p.textContent('#acAnalise')) && !(await p.$('#cAcordAtraso')));
    { const pg0 = Number(sql("select count(*) from acordos where pago"));
      ok('Acordos: por grupo, de início só os grupos', (await p.$$('#acAnalise .lg-card')).length >= 1 && !(await p.$('#acAnalise .lg-t-lin')) || (await p.$$('#acAnalise .lg-card')).length === 1);
      if (!(await p.$('#acAnalise .lg-t-lin'))) { await p.click('#acAnalise .lg-card'); await p.waitForTimeout(400); } await p.click('#acAnalise .lg-t-lin'); await p.waitForTimeout(500);
      ok('Acordos: clicar no acordo abre o detalhamento com "Lançar pagamento"', !!(await p.$('#janelas .pcd [data-lg-pagar]')));
      await p.click('#janelas .pcd [data-lg-pagar]'); await p.waitForSelector('#gs-raiz .janela-baixa, #gs-raiz [data-bx-ok]'); await p.click('#gs-raiz [data-bx-ok]'); await p.waitForTimeout(2500);
      ok('Acordos: "Lançar pagamento" dá baixa na parcela', Number(sql("select count(*) from acordos where pago")) === pg0 + 1); }
    ok('Acordos: acordo todo pago some da lista; "Mostrar concluídos" traz de volta', await (async () => {
      sql("update acordos set pago=true, data_pagamento=current_date where devedor='Alfa Comércio Ltda'"); await p.evaluate(() => ERP_RECARREGAR()); await p.waitForTimeout(2500);
      for (const g of await p.$$('#acAnalise .lg-card[aria-expanded=false]')) { await g.click().catch(() => {}); await p.waitForTimeout(250); }
      const sem = !/Alfa Comércio/.test(await p.textContent('#acAnalise'));
      await p.check('#acMostrarTodos'); await p.waitForTimeout(500);
      for (const g of await p.$$('#acAnalise .lg-card[aria-expanded=false]')) { await g.click().catch(() => {}); await p.waitForTimeout(250); }
      const com = /Alfa Comércio/.test(await p.textContent('#acAnalise'));
      await p.uncheck('#acMostrarTodos'); sql("update acordos set pago=false, data_pagamento=null where devedor='Alfa Comércio Ltda'"); await p.evaluate(() => ERP_RECARREGAR()); await p.waitForTimeout(2000);
      return sem && com; })());
    ok('Acordos: sem "Saldo por devedor" e sem "Vencimentos dos próximos 30 dias"', !(await p.isVisible('#acDevedorLista')) && !(await p.isVisible('#acProx30')));
    ok('Acordos: tabela de vencidos com altura mínima de 5 linhas (sem sobrar espaço em branco)', await p.evaluate(() => { const h = document.querySelector('#acordTabVencidos .tw').getBoundingClientRect().height; return h >= 250 && h < 400; }));
    ok('PIX copia e cola saiu (sem botão e sem a função no banco)', !(await p.$('[data-pix]')) && sql("select count(*) from pg_proc where proname in ('pix_copia_cola','crc16_ccitt')") === '0');
    ok('Acordos: sem "Progresso por acordo"; uma aba só "A pagar" (vencidas + a vencer) com Grupo e Responsável', !(await p.isVisible('#acordProgressList')) &&
      !(await p.isVisible('#acordTabBar [data-atab=pagar]')) && /A pagar/.test(await p.textContent('#acordTabBar')) &&
      (await p.$$eval('#acordTabVencidos thead th', (l) => l.map((t) => t.textContent))).join('|').includes('Grupo|Processo') && !(await p.textContent('#acordTabVencidos thead')).includes('Responsável'));
    // Backup 41: sem a caixinha de marcar — cada linha tem "Emitir", que abre a janela de envio
    ok('Acordos: cada parcela a pagar tem "Emitir" e não tem mais a caixinha de marcar', !!(await p.$('#tblAcordosVencBody [data-ac-guia]')) && !(await p.$('#tblAcordosVencBody [data-ac-sel]')) && !(await p.$('#acSelTodos')));
    await p.click('#tblAcordosVencBody [data-ac-guia] >> nth=0'); await p.waitForSelector('#gs-raiz .ge-janela', { timeout: 8000 }).catch(() => {});
    ok('Acordos: "Emitir" abre a janela de envio', await p.isVisible('#gs-raiz .ge-janela'));
    await p.evaluate(() => { while (document.querySelector('#janelas .fundo')) window.GS.fecharJanela(); });
    // Backup 37: filtros de prazo (vencidas · 5/10/15/30 dias · até) e sem "Situação"; "✓ emitido" ao lado do Emitir
    ok('Acordos: tabela "A pagar" sem a coluna Situação, com filtros de prazo e sem os seletores de grupo/devedor', !(await p.textContent('#acordTabVencidos thead')).includes('Situação') &&
      (await p.$$('#acPrazoBar [data-prazo]')).length === 6 && !!(await p.$('#acPrazoAte')) && !(await p.isVisible('#fAcordVencGrupo')) && !(await p.isVisible('#fAcordVencDev')));
    await p.click('#acPrazoBar [data-prazo=venc]'); await p.waitForTimeout(400);
    ok('Acordos: filtro "Vencidas" mostra só o que já venceu', await p.evaluate(() => [...document.querySelectorAll('#tblAcordosVencBody tr[data-gx]')].every((tr) => /atraso|hoje/.test(tr.textContent))));
    await p.click('#acPrazoBar [data-prazo=""]'); await p.waitForTimeout(300);
    // forma de pagamento: PIX = mensagem objetiva (Bom dia/Boa tarde, Processo | Parcela, Partes, Vencimento, Valor, PIX), sem "Seguem"
    { const idPix = sql("select id from acordos where not pago order by vencimento limit 1");
      sql("update acordos set forma_pagamento='pix', pix='chave-pix@teste.com' where id='" + idPix + "'");
      ok('Acordos: forma de pagamento vale para o acordo inteiro (mesmo processo, devedor e credor)', sql("select count(distinct forma_pagamento) from acordos a where (processo,devedor,credor)=(select processo,devedor,credor from acordos where id='" + idPix + "')") === '1');
      await p.evaluate((id) => window.GS.enviarAcordosSelecionados([id]), idPix); await p.waitForSelector('#gs-raiz .ge-janela', { timeout: 8000 }).catch(() => {});
      ok('Acordo por PIX: saudação + texto genérico do Backup 52 e a chave PIX no item', /^(Bom dia|Boa tarde|Boa noite)!\n\nSeguem as parcelas de acordo com vencimento neste mês ou em atraso\./.test(await p.inputValue('#ge-texto')) &&
        /chave-pix@teste\.com/.test(await p.getAttribute('#gs-raiz .ge-pix', 'placeholder')) && !/Depois de pagar/.test(await p.textContent('#gs-raiz .ge-msg')) && !(await p.isVisible('#gs-raiz .ge-anexos')), JSON.stringify(await p.inputValue('#ge-texto')));
      ok('Backup 45: Acordos → Emitir só com "Rascunho no Gmail" (sem prévia, sem WhatsApp, sem "Enviar e-mail")', !!(await p.$('#gs-raiz #ge-rascunho')) && !(await p.$('#gs-raiz #ge-enviar')) &&
        !(await p.$('#gs-raiz #ge-zap')) && !(await p.$('#gs-raiz #ge-previa')) && !(await p.$('#gs-raiz #ge-tel')));
      await p.evaluate(() => { while (document.querySelector('#janelas .fundo')) window.GS.fecharJanela(); });
      ok('E-mail das guias no padrão "Honorários em aberto": parágrafos e quadro "Como pagar" com o PIX', /Como pagar/.test(sql("select public.guias_texto_html('Bom dia!" + "\n\n" + "Teste', '[{\"pix\":\"chave-pix@teste.com\"}]')")) &&
        /<\/p><p/.test(sql("select public.guias_texto_html('a" + "\n\n" + "b', '[]')")));
      sql("update acordos set forma_pagamento='boleto' where (processo,devedor,credor)=(select processo,devedor,credor from acordos where id='" + idPix + "')"); }
    await nav(p, 'financeiroContab'); await p.waitForTimeout(1500);
    ok('Contabilidade: Análise sem "Maiores clientes" e sem a lista de lançamentos', !/Maiores clientes/.test(await p.textContent('#panel-financeiroContab')) && !(await p.$('#fcLancTbl')));
    ok('Contabilidade: Análise única (sem os cartões Recebimentos/Pagamentos) com comparativo por cliente e por fornecedor', !(await p.$('#fcLadoBar')) &&
      /Comparativo por cliente/.test(await p.textContent('#fcCorpo')) && /Comparativo por fornecedor/.test(await p.textContent('#fcCorpo')) && /Recebido × pago mês a mês/.test(await p.textContent('#fcCorpo')));
    ok('Contabilidade: gráfico mês a mês com recebido (verde) e pago (vermelho)', await p.evaluate(() => { const c = Chart.getChart('cFcMes'); return !!c && c.data.datasets.length === 2 && /Recebido/.test(c.data.datasets[0].label) && /Pago/.test(c.data.datasets[1].label); }));
    sql("insert into lancamentos(empresa,tipo,descricao,vencimento,valor,pago,data_pagamento) values ('contabilidade','receita','Caixa teste',current_date-5,500,true,current_date-5)");
    await p.evaluate(() => ERP_RECARREGAR()); await p.waitForTimeout(2500);
    await p.click('#panel-financeiroContab .fin-tab[data-tab=caixa]'); await p.waitForTimeout(1000);
    ok('Composição de Caixa aparece (gráficos não somem)', await p.evaluate(() => { const c = document.querySelector('#cFcCaixaSaldo'); return !!c && c.offsetParent !== null; }));
    sql("delete from lancamentos where descricao='Caixa teste'");
    await nav(p, 'financeiro'); await p.waitForTimeout(1000);
    ok('Financeiro: Análise sem a tabela "Em atraso" (já está em A receber)', !(await p.evaluate(() => [...document.querySelectorAll('#panel-financeiro .cc-t')].some((x) => /^Em atraso$/.test(x.textContent.trim())))));
    // Central de e-mails ao cliente (Backup 16)
    sql("insert into clientes(nome,email) values ('Central Atraso Ltda','atraso@central.test'),('Central Lembrete Ltda','lembrete@central.test')");
    sql("insert into lancamentos(empresa,tipo,descricao,cliente_id,vencimento,valor) select 'escritorio','receita','Hon central atraso',id,current_date-3,700 from clientes where nome='Central Atraso Ltda'");
    sql("insert into lancamentos(empresa,tipo,descricao,cliente_id,vencimento,valor) select 'escritorio','receita','Hon central lembrete',id,current_date+2,800 from clientes where nome='Central Lembrete Ltda'");
    ok('Financeiro sem o botão "✉ Cobrar clientes" (módulo E-mails saiu)', !(await p.$('#panel-financeiro .gx-cobrar [data-cob=hon]')));
    sql("delete from lancamentos where descricao like 'Hon central %'");
    ok('Notificações saiu da barra de cima', !(await p.$('#tn [data-ir=notificacoes]')));
    // envio manual pelo e-mail do escritório (modelo da marca)
    { const r = await p.evaluate(async () => (await SB.rpc('enviar_email_manual', { p_para: 'cliente@exemplo.test', p_assunto: 'Teste manual', p_texto: 'Prezados,\n\nSegue a cobrança.' })).error);
      ok('enviar pelo e-mail do escritório: entra na fila com o modelo da marca', !r && sql("select (html like '%Araújo &amp; Castro%' and html like '%Segue a cobrança%')::text from email_fila where para='cliente@exemplo.test'") === 'true', r && r.message); }
    // demonstração
    await nav(p, 'admin'); await p.waitForTimeout(1200);
    await p.click('#adm-abas [data-aba=importar]'); await p.waitForSelector('#demo-carregar'); await p.click('#demo-carregar'); await p.waitForTimeout(3000);
    ok('Administração: carregar a demonstração (clientes, contratos, CRM, tarefas)', sql("select count(*) from clientes where nome like '%Horizonte%' or chave_importacao like 'demo:%'") === '6' &&
      Number(sql("select count(*) from crm_oportunidades where titulo like 'DEMO%'")) === 3);
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
    ok('Clientes: sem "Editar em tabela" (Backup 41)', !(await p.$('#cli-massa')));
    await p.evaluate(() => { if (window.ERP_EDITOR) window.ERP_EDITOR.gravou('teste do rodapé'); }); await p.waitForTimeout(500);
    { const on0 = await p.evaluate(() => document.getElementById('gx-rodape').classList.contains('on')); await p.waitForTimeout(8600);
      ok('rodapé "Última gravação" some sozinho', on0 && !(await p.evaluate(() => document.getElementById('gx-rodape').classList.contains('on')))); }
    // telas antigas
    await nav(p, 'resumo'); await p.waitForTimeout(1500);
    ok('Painel: valores inteiros (sem "mil"/"mi")', /R\$\s?[\d.]+,\d{2}/.test(await p.textContent('#execKpis')) && !/\d(k|M)\b/.test(await p.textContent('#kpiSecProc')));
    await nav(p, 'parcelamentos'); await p.waitForTimeout(1200);
    ok('Parcelamentos: sem o botão "Notificar clientes" (o envio é pelo quadro de guias)', !/Notificar clientes/.test(await p.textContent('#panel-parcelamentos')));
    await nav(p, 'processos'); await p.waitForTimeout(1200);
    ok('Processos: volta a abrir a tela do Backup 13 (sem a tela nova)', /#processos$/.test(p.url()) && await p.isVisible('#panel-processos') && !!(await p.$('#tblProcBody')) && !(await p.$('#panel-processosNovo')));
    // Backup 40: conciliação de extrato (OFX) e "Editar em tabela" saíram do Financeiro
    await nav(p, 'financeiro'); await p.waitForTimeout(1200);
    ok('Financeiro: sem "Conciliar extrato" e sem "Editar em tabela"', !(await p.$('#panel-financeiro [data-ofx]')) && !(await p.$('#panel-financeiro [data-massa-lanc]')) && !(await p.evaluate(() => !!(window.GS && window.GS.conciliarOfx))));
    // Backup 41: PGFN pela API do SERPRO e "fotos mensais" removidas (o cliente de teste continua, com os valores direto no cadastro)
    sql("insert into clientes(nome,cpf_cnpj,tipo,pgfn,pgfn_negociada) values ('PGFN Teste Ltda','99111222000133','Consultoria',112345.67,250000.50)");
    await p.evaluate(() => GS.carregarCadastros(true));
    ok('Sem PGFN/SERPRO e sem Evolução (foto mensal) na ficha', sql("select count(*) from pg_tables where tablename in ('pgfn_inscricoes','fotos_mensais','rascunhos')") === '0');
    await nav(p, 'admin'); await p.waitForTimeout(1200);
    await p.click('#adm-abas [data-aba=usuarios]'); await p.waitForTimeout(1200);
    ok('Usuários: os 4 acessos combinados aparecem com "Criar conta"', (await p.$$('[data-prev]')).length === 4);
    // Backup 45: cargo (hierarquia da agenda) e revisor padrão
    { const idA = sql("select id from perfis where email='equipe@teste'"), idP = sql("select id from perfis where email='pedro@teste'");
      await p.click('[data-us-ed="' + idA + '"]'); await p.waitForSelector('#us-cargo-sel');
      await p.selectOption('#us-cargo-sel', 'estagiario'); await p.selectOption('#us-rev-sel', idP); await p.click('#us-salvar'); await p.waitForTimeout(1200);
      ok('Usuários (B45): cargo e revisor gravados', sql("select cargo||'|'||revisor_id from perfis where id='" + idA + "'") === 'estagiario|' + idP);
      sql("insert into tarefas(titulo,responsavel,exige_revisao,status) values ('Tarefa com revisor padrão B45','Adriana',true,'pendente')");
      ok('Tarefas (B45): com validação e sem revisor, vai para o revisor padrão de quem é responsável', sql("select revisor from tarefas where titulo='Tarefa com revisor padrão B45'") === sql("select nome from perfis where id='" + idP + "'"));
      sql("delete from tarefas where titulo='Tarefa com revisor padrão B45'"); sql("update perfis set cargo='', revisor_id=null where id='" + idA + "'"); }

    // ── Backup 15 ──
    // Início: fila em calendário, escolha guardada no perfil; mural
    await nav(p, 'hoje'); await p.waitForTimeout(1500); await p.evaluate(() => { const x = document.getElementById('gx-pop-avisos'); if (x) x.remove(); });
    ok('Início (B52 C1): a fila tem Mês, Semana, Dia e Lista (B53)', (await p.$$eval('#panel-hoje [data-fila-vista]', (bs) => bs.map((b) => b.dataset.filaVista).join(','))) === 'mes,semana,dia,lista');
    await p.click('#panel-hoje [data-fila-vista=mes]'); await p.waitForTimeout(1200);
    ok('Início: fila vira calendário do mês e a escolha fica guardada', !!(await p.$('#panel-hoje .fila-cal-area .calendario')) &&
      sql("select preferencias->'fila'->>'vista' from perfis where email='pedro@teste'") === 'mes', sql("select preferencias::text from perfis where email='pedro@teste'"));
    // Backup 36: agendar compromisso direto na agenda + legenda de cores
    ok('Início: agenda com "+ Agendar" e legenda de cores', !!(await p.$('#panel-hoje [data-agendar]')) && !!(await p.$('#panel-hoje .ag-leg')));
    await p.click('#panel-hoje [data-agendar]'); await p.waitForSelector('#gs-raiz #f-ag');
    // Backup 40: só pessoas cadastradas; audiência exige o nº do processo; início e fim; aviso antes
    { const cad = sql("select string_agg(nome, '|') from perfis where papel in ('admin','equipe')").split('|');
      ok('Agendar: quem participa = só as pessoas cadastradas (sem a lista fixa)', await p.evaluate((c) => [...document.querySelectorAll('#gs-raiz #f-ag [name=part]')].every((x) => c.includes(x.value)), cad) &&
      !(await p.$('#gs-raiz #ag-tipo [data-v=ligacao]'))); }
    await p.click('#gs-raiz #ag-tipo [data-v=audiencia]'); await p.fill('#gs-raiz #f-ag [name=titulo]', 'Audiência de teste B36'); await p.fill('#gs-raiz #f-ag [name=hora]', '14:30');
    await p.click('#gs-raiz #ag-ok'); await p.waitForTimeout(800);
    ok('Agendar: audiência sem nº do processo não grava', sql("select count(*) from tarefas where titulo='Audiência de teste B36'") === '0' && !!(await p.$('#gs-raiz #f-ag')));
    await p.fill('#gs-raiz #f-ag [name=processo]', '5003355-46.2020.8.13.0372');
    await p.click('#gs-raiz #ag-ok'); await p.waitForTimeout(1500);
    ok('Agendar: grava processo, início/fim (fim = início + 1 h) e o aviso de 30 min', sql("select processos_vinculados||'|'||to_char(hora_fim,'HH24:MI')||'|'||aviso_min from tarefas where titulo='Audiência de teste B36'") === '5003355-46.2020.8.13.0372|15:30|30');
    ok('Início: "Agendar" grava o compromisso (tipo, hora) na agenda', sql("select tipo_agenda||' '||to_char(hora,'HH24:MI') from tarefas where titulo='Audiência de teste B36'") === 'audiencia 14:30' &&
      /Audiência de teste B36/.test(await p.textContent('#panel-hoje .ini-fila')));
    // Backup 38: agenda só com o que está em Tarefas, legenda curta, sem a escolha de fontes; admin escolhe de quem ver
    ok('Início: agenda sem "Mostrar na agenda", legenda curta e filtros de tipo e de pessoa (Backup 45)', !(await p.$('#panel-hoje [data-ag-fonte]')) && !/Lembrete|Vencimento|Ligação/.test(await p.textContent('#panel-hoje .ag-leg')) &&
      !!(await p.$('#panel-hoje [data-fila-tipo=audiencia]')) && !!(await p.$('#panel-hoje [data-fila-pes="*"]')));
    await p.click('#panel-hoje [data-fila-pes="*"]'); await p.waitForTimeout(1500);
    ok('Início: "Todos" mostra as tarefas de todos (fica salvo)', /de todos/.test(await p.textContent('#panel-hoje .ini-fila .card-hd')) && Number(sql("select jsonb_array_length(preferencias->'fila'->'pessoas') from perfis where email='pedro@teste'")) > 1);
    await p.click('#panel-hoje [data-fila-pes="*"]'); await p.waitForTimeout(1500);
    // Backup 45: filtro de tipo — desmarcar Audiências tira a audiência da agenda
    await p.click('#panel-hoje [data-fila-tipo=audiencia]'); await p.waitForTimeout(1500);
    ok('Início: desmarcar "Audiências" tira a audiência da agenda', !/Audiência de teste B36/.test(await p.textContent('#panel-hoje .ini-fila')));
    await p.click('#panel-hoje [data-fila-tipo=audiencia]'); await p.waitForTimeout(1500);
    // Backup 46: filtros na ordem e com a cor de cada tipo; "De quem" = Todos, eu, os outros (sem "Minhas"); concluída riscada; Lista com a altura do calendário
    { const ordem = await p.$$eval('#panel-hoje [data-fila-tipo]', (bs) => bs.map((b) => b.dataset.filaTipo).join(','));
      const cores = await p.$$eval('#panel-hoje [data-fila-tipo]', (bs) => bs.slice(1).map((b) => getComputedStyle(b).backgroundColor));
      const pes = await p.$$eval('#panel-hoje [data-fila-pes]', (bs) => bs.map((b) => b.textContent.replace('✓ ', '').trim()));
      ok('Início (B46): Mostrar = Tudo, Reuniões, Audiências, Compromissos, Tarefas, Rotina, todos com a mesma cor (Backup 50)', ordem === '*,reuniao,audiencia,compromisso,tarefa,rotina' && new Set(cores).size === 1);
      ok('Início (B46): "De quem" = Todos, depois quem está logado, depois os outros (sem "Minhas")', pes[0] === 'Todos' && /^Pedro/.test(pes[1]) && !pes.some((t) => /Minhas/.test(t))); }
    sql("insert into tarefas(titulo,responsavel,status,prazo) values ('Tarefa concluída B46','Pedro Castro','concluida',current_date)");
    await p.click('#panel-hoje [data-fila-vista=mes]'); await p.waitForTimeout(1500);
    { const alt = await p.$eval('#panel-hoje .ini-fila > .card-bd', (e) => e.offsetHeight);
      ok('Início (B46): tarefa concluída aparece riscada no calendário', await p.$$eval('#panel-hoje .ag-feita', (es) => es.some((e) => /Tarefa concluída B46/.test(e.textContent) && /line-through/.test(getComputedStyle(e).textDecorationLine + getComputedStyle(e.querySelector('*') || e).textDecorationLine))));
      await p.click('#panel-hoje [data-fila-vista=lista]'); await p.waitForTimeout(1500);
      const alt2 = await p.$eval('#panel-hoje .ini-fila > .card-bd', (e) => e.offsetHeight);
      ok('Início (B46): a Lista fica com a mesma altura do calendário (' + alt + ' × ' + alt2 + ')', Math.abs(alt - alt2) <= 4); }
    sql("delete from tarefas where titulo='Tarefa concluída B46'");
    await p.click('#panel-hoje [data-fila-vista=mes]'); await p.waitForTimeout(1200);
    // Backup 48: Tarefas com os mesmos filtros (Mostrar / De quem) e o mesmo desenho da agenda do Início
    sql("insert into tarefas(titulo,responsavel,status,prazo,tipo_agenda) values ('Audiência filtro B48','Pedro Castro','pendente',current_date + 3,'audiencia')");
    await nav(p, 'tarefas'); await p.waitForSelector('#tf-chips [data-tf-tipo]'); await p.waitForTimeout(800);
    { const ordem = await p.$$eval('#tf-chips [data-tf-tipo]', (bs) => bs.map((b) => b.dataset.tfTipo).join(','));
      const pes = await p.$$eval('#tf-chips [data-tf-pes]', (bs) => bs.map((b) => b.textContent.replace('✓ ', '').trim()));
      const corT = await p.$eval('#tf-chips [data-tf-tipo=audiencia]', (b) => getComputedStyle(b).backgroundColor);
      await nav(p, 'hoje'); await p.waitForTimeout(1200);
      const corI = await p.$eval('#panel-hoje [data-fila-tipo=audiencia]', (b) => getComputedStyle(b).backgroundColor);
      ok('Tarefas (B48): Mostrar e De quem iguais ao Início (ordem, cores, Todos + eu primeiro)', ordem === '*,reuniao,audiencia,compromisso,tarefa,rotina' && corT === corI && pes[0] === 'Todos' && /^Pedro/.test(pes[1]));
      await p.evaluate(() => { window.GS.E.tf = null; });   // filtros limpos (os testes anteriores deixam atalhos marcados)
      await nav(p, 'tarefas'); await p.waitForSelector('#tf-chips [data-tf-tipo]'); await p.waitForTimeout(800);
      const antes = /Audiência filtro B48/.test(await p.textContent('#tf-corpo'));
      await p.click('#tf-chips [data-tf-tipo=audiencia]'); await p.waitForTimeout(500);
      const depois = /Audiência filtro B48/.test(await p.textContent('#tf-corpo'));
      await p.click('#tf-chips [data-tf-tipo=audiencia]'); await p.waitForTimeout(500);
      ok('Tarefas (B48): desmarcar "Audiências" tira a audiência da lista; marcar de novo volta', antes && !depois && /Audiência filtro B48/.test(await p.textContent('#tf-corpo'))); }
    sql("delete from tarefas where titulo='Audiência filtro B48'");
    await nav(p, 'hoje'); await p.waitForTimeout(1200);
    // Backup 45: tarefa para outra pessoa + dois avisos
    await p.click('#panel-hoje [data-agendar]'); await p.waitForSelector('#gs-raiz #f-ag');
    await p.click('#gs-raiz #ag-tipo [data-v=tarefa]'); await p.fill('#gs-raiz #f-ag [name=titulo]', 'Tarefa para a equipe B45');
    { const outro = await p.evaluate(() => [...document.querySelectorAll('#gs-raiz #f-ag [name=resp] option')].map((o) => o.value).find((v) => !/^pedro/i.test(v)));
      if (outro) await p.selectOption('#gs-raiz #f-ag [name=resp]', outro);
      await p.selectOption('#gs-raiz #f-ag [name=aviso]', '1440'); await p.selectOption('#gs-raiz #f-ag [name=aviso2]', '30');
      await p.click('#gs-raiz #ag-ok'); await p.waitForTimeout(1500);
      ok('Agendar (B45): tarefa lançada para outra pessoa, sem hora, com dois avisos (1 dia + 30 min)', !!outro && sql("select responsavel||'|'||coalesce(nullif(tipo_agenda,''),'-')||'|'||coalesce(hora::text,'-')||'|'||aviso_min||'|'||aviso2_min from tarefas where titulo='Tarefa para a equipe B45'") === outro + '|-|-|1440|30',
        sql("select responsavel||'|'||coalesce(nullif(tipo_agenda,''),'-')||'|'||coalesce(hora::text,'-')||'|'||aviso_min||'|'||coalesce(aviso2_min::text,'-') from tarefas where titulo='Tarefa para a equipe B45'")); }
    await p.click('#panel-hoje [data-fila-vista=lista]'); await p.waitForTimeout(800);
    ok('Início: fila mostra no máximo 5 de cara', (await p.$$('#panel-hoje .ini-fila .fila-item, #panel-hoje .ini-fila tbody tr')).length <= 5);
    ok('Início: sem "+ Receita/+ Despesa/+ Contrato" (o "+ Lançar" faz isso)', !/\+ Receita|\+ Despesa|\+ Contrato/.test(await p.textContent('#panel-hoje')));
    await p.click('#lemb-novo'); await p.waitForSelector('#f-lemb');
    await p.fill('#f-lemb [name=texto]', 'Reunião geral sexta às 14h (teste)'); await p.selectOption('#f-lemb [name=prazo]', 'sem');
    await p.selectOption('#f-lemb [name=destaque]', 'vermelho'); await p.check('#f-lemb [name=fixo]');
    await p.click('#lemb-salvar'); await p.waitForTimeout(1500);
    ok('Início: lembrete sem prazo, fixo e com destaque (substitui o recado)', sql("select count(*) from lembretes where texto like 'Reunião geral%' and dia is null and fixo and destaque='vermelho'") === '1' &&
      /Reunião geral sexta/.test(await p.textContent('#ini-lembretes')) && !!(await p.$('#ini-lembretes .lemb-it.fixo.dest-vermelho')) && !!(await p.$('#ini-lembretes .lemb-fixo.on')));
    await p.click('#ini-lembretes .lemb-it.fixo .lemb-txt'); await p.waitForTimeout(500);
    ok('Início: clicar no lembrete abre o detalhamento (não a edição)', /Lembrete/.test(await p.textContent('#gs-raiz .janela-hd')) && !(await p.$('#gs-raiz #f-lemb')) && !!(await p.$('#gs-raiz #ld-editar')));
    await p.click('#gs-raiz .janela [data-lemb-fixo]'); await p.waitForTimeout(1200);
    ok('Início: "Fixado" desmarca (o botão mostra se está fixo ou não)', sql("select fixo from lembretes where texto like 'Reunião geral%'") === 'f' && !!(await p.$('#ini-lembretes .lemb-fixo:not(.on)')));
    sql("insert into lembretes(texto,dia) values ('Lembrete distante B23', current_date + 60)"); await nav(p, 'hoje'); await p.waitForTimeout(1500);
    ok('Início: lembrete com data distante não aparece, mas fica em "Todos os lembretes"', !/Lembrete distante B23/.test(await p.textContent('#ini-lembretes')) && /mais adiante/.test(await p.textContent('#ini-lembretes')));
    await p.click('#lemb-todos'); await p.waitForTimeout(800);
    ok('Início: "Todos os lembretes" mostra os fixados, os próximos, os de mais adiante e os concluídos', /Todos os lembretes/.test(await p.textContent('#gs-raiz .janela-hd')) &&
      /Lembrete distante B23/.test(await p.textContent('#gs-raiz .janela-bd')) && /Concluídos/.test(await p.textContent('#gs-raiz .janela-bd')));
    await p.evaluate(() => { while (document.querySelector('#janelas .fundo')) window.GS.fecharJanela(); });
    ok('Início: sem a legenda "recados que não são tarefas"', !/recados que não são tarefas/.test(await p.textContent('#ini-lembretes')));
    ok('Início: lembretes num cartão próprio, sem o ⓘ', !(await p.$('#ini-lembretes .info-i')) && !(await p.$('#panel-hoje .ini-fila .info-i')));
    // Painel: sem faixa, "Atualizado" e entidades/grupos na linha do filtro
    await nav(p, 'resumo'); await p.waitForTimeout(1500);
    ok('Painel: sem a faixa "Painel Executivo" e com "Atualizado" na linha do filtro', !(await p.isVisible('#panel-resumo > .mod-banner')) && await p.isVisible('#gx-linha-painel'));
    ok('Painel: contadores rolam com a página (não ficam presos no topo)', await p.evaluate(() => getComputedStyle(document.getElementById('gx-linha-painel')).position !== 'fixed'));
    ok('Painel: sem "Por grupo / Lista" e sem "Mostrar mais" (todas as linhas)', !(await p.$('#pe-visao')) && !(await p.isVisible('#panel-resumo .pag-rodape')));
    { const grupos = await p.$$eval('#tblExecRanking tr.gx-linha-exp:not([hidden])', (l) => l.map((t) => (t.querySelector('.er-grupo') || {}).textContent || ''));
      // Backup 40: sem as faixas "GRUPO X · N cadastros" (e sem o contorno); as linhas continuam em ordem de grupo
      // Backup 53: as faixas voltaram (igual à tabela de Clientes: nome do grupo + nº de empresas, com fundo)
      ok('Painel → Empresas do grupo: faixa por grupo (como Clientes), linhas em ordem de grupo', !!(await p.$('#tblExecRanking tr.gx-grp')) && grupos.every((g, i) => grupos.indexOf(g) === i || grupos[i - 1] === g), grupos.join(' | ')); }
    { const al = await p.evaluate(() => { const td = document.querySelector('#tblExecRanking tr.gx-linha-exp'), th = document.querySelectorAll('#execRankHead th');
        return [2, 4].map((i) => getComputedStyle(td.children[i - 1]).textAlign + '/' + getComputedStyle(th[i - 1]).textAlign).join(' '); });
      ok('Painel (B48): Grupo e CPF/CNPJ alinhados à esquerda, títulos centralizados', al === 'left/center left/center', al); }
    ok('Painel: sem a seta de expandir e sem o filtro de grupo (fica só no filtro de cima)', !(await p.isVisible('#tblExecRanking td.gx-seta')) && !(await p.$('#pe-grupo')));
    await p.click('#tblExecRanking tr.gx-linha-exp:has-text("Alfa Comércio") .er-nome'); await p.waitForTimeout(400);
    await p.waitForFunction(() => [...document.querySelectorAll('#janelas .janela h2')].some((h) => /Alfa Comércio/i.test(h.textContent)), null, { timeout: 8000 }).catch(() => {});
    ok('Painel: clicar no grupo (ou na linha) abre direto a ficha completa, sem expandir', !(await p.$('#tblExecRanking tr.gx-det')) && !/uuid|Erro no ERP/.test(await p.textContent('#gs-raiz #aviso').catch(() => '')) &&
      await p.evaluate(() => [...document.querySelectorAll('#janelas .janela h2')].some((h) => /Alfa Comércio/i.test(h.textContent))));
    await p.evaluate(() => { while (document.querySelector('#janelas .fundo')) window.GS.fecharJanela(); }); await p.waitForTimeout(200);
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
    await p.click('#cr-rapido'); await p.waitForSelector('#f-rap'); await p.waitForTimeout(500); await p.fill('#f-rap [name=nome]', 'Rápido Teste B16'); await p.fill('#f-rap [name=tel]', '31 99999-0000');
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
    await p.click('#panel-tarefas [data-abrir-t="' + sql("select id from tarefas where titulo='Tarefa B15 excluir'") + '"] td:nth-child(2)'); await p.waitForSelector('#tf-f-editar'); await p.click('#tf-f-editar'); await p.waitForSelector('#btn-excluir-tf');
    await p.click('#btn-excluir-tf'); await p.waitForTimeout(1500);
    ok('Tarefas: excluir vai para a aba "Excluídas" (não apaga)', sql("select status from tarefas where titulo='Tarefa B15 excluir'") === 'cancelada' && !/Tarefa B15 excluir/.test(await p.textContent('#tf-corpo')));
    await p.click('#tf-abas [data-aba=excluidas]'); await p.waitForTimeout(500);
    await p.click('#tf-corpo [data-restaurar-t]'); await p.waitForTimeout(1500);
    ok('Tarefas: "Restaurar" volta para Em aberto', sql("select status from tarefas where titulo='Tarefa B15 excluir'") === 'pendente');
    // Backup 16: criação rápida, minha semana (arrastar), pular recorrência, relatório por cliente, carga
    ok('Tarefas (B55): sem a criação rápida ⚡', !(await p.$('#tf-rapida-bt')) && !(await p.$('#tf-rapida')));
    sql("insert into tarefas(titulo,responsavel,status,prazo,recorrencia) values ('Semana B16','Pedro','pendente',date_trunc('week', current_date)::date,'mensal')");
    await p.evaluate(() => { GS.E.tf = null; }); await nav(p, 'hoje'); await p.waitForTimeout(800); await nav(p, 'tarefas'); await p.waitForTimeout(1500);
    await p.click('#tf-vista [data-v=calendario]'); await p.waitForTimeout(400); await p.click('#tf-cal-vista [data-cal-v=semana]'); await p.waitForTimeout(600);
    { const terca = sql("select (date_trunc('week', current_date)::date + 1)::text");
      await p.evaluate((d) => { const c = [...document.querySelectorAll('.sm-card')].find((x) => /Semana B16/.test(x.textContent)), col = document.querySelector('.sm-col[data-dia="' + d + '"]'), dt = new DataTransfer();
        c.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true })); col.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
        col.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }, terca); await p.waitForTimeout(1500);
      ok('Minha semana: arrastar para outro dia remarca o prazo', sql("select prazo::text from tarefas where titulo='Semana B16'") === terca, terca); }
    { const idS = sql("select id from tarefas where titulo='Semana B16'"), p0 = sql("select prazo::text from tarefas where titulo='Semana B16'");
      await p.evaluate((id) => GS.abrirTarefa(id), idS); await p.waitForSelector('#tf-f-pular'); await p.click('#tf-f-pular'); await p.waitForTimeout(1500);
      ok('Tarefa recorrente: "Pular esta vez" passa para o mês seguinte sem concluir', sql("select status||'|'||(prazo = ('" + p0 + "'::date + interval '1 month')::date)::text from tarefas where titulo='Semana B16'") === 'pendente|true'); }
    ok('Tarefas: sem a vista Relatório (Backup 41)', !(await p.$('#tf-vista [data-v=relatorio]')));
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
    // Backup 40: a geração de documentos é um sistema à parte — um botão só, que abre numa aba nova
    ok('Documentos: "Gerar documentos ↗" abre o sistema numa aba nova; sem "Gerar documento" no menu', await p.getAttribute('#doc-ger', 'target') === '_blank' &&
      /documentos\/index\.html/.test(await p.getAttribute('#doc-ger', 'href')) && !(await p.$('#tn [data-ir=gerador]')));

    // Backup 41: geradores antigos removidos
    ok('Geradores antigos saíram do site', (await p.request.get(BASE + '/geradores/peticao.html')).status() === 404);
    // Backup 37: Alertas mais enxutos — sem PGFN por arquivo, sem "Sem contato" e "CAPAG D"; em Documentos só o certificado digital
    { await nav(p, 'alertas'); await p.waitForTimeout(2500); const tx = await p.textContent('#panel-alertas');
      ok('Alertas: sem PGFN por arquivo, "Sem contato", "CAPAG D" e "Documentos vencendo"; com "Certificado digital vencendo" e busca de publicações (web)',
        !/PGFN — dados abertos|Sem contato|CAPAG D\b|Documentos vencendo/.test(tx) && /Certificado digital vencendo/.test(tx) && /Busca de publicações \(web\)/.test(tx), tx.slice(0, 400)); }

    // ── Backup 26: fluxo cliente → financeiro (cliques reais) ──
    { // contrato novo "aguardando assinatura": não lança nada; "✓ Marcar como assinado" lança as parcelas
      await nav(p, 'contratos'); await p.waitForTimeout(900);
      await p.click('#panel-contratos button:has-text("Novo contrato")'); await p.waitForSelector('#gs-raiz #f-ctr'); await p.waitForTimeout(300);
      await p.selectOption('#gs-raiz [name=cliente_id]', { label: 'Beta Serviços Ltda · Grupo Beta' });
      await p.click('#gs-raiz #ctr-mod [data-v=pontual]'); await p.fill('#gs-raiz [name=descricao]', 'Contrato B25 aguardando');
      await p.fill('#gs-raiz [name=valor_total]', '3.000,00'); await p.fill('#gs-raiz [name=num_parcelas]', '3');
      await p.click('#gs-raiz #ctr-assin [data-v="Aguardando assinatura"]'); await salvarGs(p, '#btn-salvar-ctr'); await p.waitForTimeout(800);
      ok('Contrato novo "aguardando assinatura" não lança o financeiro', sql("select status from contratos where descricao='Contrato B25 aguardando'") === 'Aguardando assinatura' &&
        sql("select count(*) from lancamentos l join contratos c on c.id=l.contrato_id where c.descricao='Contrato B25 aguardando'") === '0');
      const idC = sql("select id from contratos where descricao='Contrato B25 aguardando'");
      await p.evaluate((id) => GS.detalheContrato(id), idC); await p.waitForSelector('#gs-raiz #ctr-assinar'); await p.waitForTimeout(300);
      ok('ficha do contrato mostra "Aguardando a assinatura" (sem atalho para o gerador — Backup 40)', /Aguardando a assinatura/.test(await p.textContent('#gs-raiz #ctr-assinatura')) && !(await p.$('#gs-raiz #ctr-gerar')));
      await p.click('#gs-raiz #ctr-assinar'); await p.waitForTimeout(2000);
      ok('"✓ Marcar como assinado" lança as 3 parcelas e ativa o contrato', sql("select status||'|'||(assinado_em is not null) from contratos where id='" + idC + "'") === 'Ativo|true' &&
        sql("select count(*) from lancamentos where contrato_id='" + idC + "'") === '3');
      await p.keyboard.press('Escape'); await p.waitForTimeout(200); await p.keyboard.press('Escape'); await p.waitForTimeout(200); }
    { // reunião a partir do lead: tarefa para cada participante e convite (marcado) com o arquivo da agenda
      sql("insert into crm_oportunidades(titulo, prospecto_nome, prospecto_email, responsavel, etapa_id) select 'Lead B25 reunião', 'Rui Lead', 'rui@lead.teste', 'Pedro', id from crm_etapas where ordem=1");
      const idO = sql("select id from crm_oportunidades where titulo='Lead B25 reunião'");
      await p.evaluate((id) => GS.formReuniao({ oportunidade_id: id }), idO); await p.waitForSelector('#gs-raiz #f-reu'); await p.waitForTimeout(300);
      await p.fill('#gs-raiz #f-reu [name=local]', 'https://meet.teste/b25');
      await p.click('#gs-raiz #reu-convite [data-v=sim]'); await p.click('#gs-raiz #reu-salvar'); await p.waitForTimeout(1800);
      ok('reunião do lead: tarefa do participante, lead em "Diagnóstico agendado" e convite com .ics na fila', sql("select count(*) from reunioes where oportunidade_id='" + idO + "'") === '1' &&
        Number(sql("select count(*) from tarefas where chave_regra like 'reuniao:%'")) >= 1 &&
        sql("select e.nome from crm_oportunidades o join crm_etapas e on e.id=o.etapa_id where o.id='" + idO + "'") === 'Diagnóstico agendado' &&
        sql("select count(*) from email_fila where para='rui@lead.teste' and anexo->>'tipo'='ics'") === '1'); }
    { // delegar a sequência e validar no Início
      await nav(p, 'tarefas'); await p.waitForTimeout(900);
      // Backup 54: "Delegar" virou o modelo "passo a passo" dentro de 🔀 Fluxo
      await p.click('#tf-fluxo'); await p.waitForSelector('#gs-raiz #f-fl'); await p.selectOption('#gs-raiz #f-fl [name=modelo]', { label: 'Lead completo — passo a passo, com validação' });
      await p.waitForSelector('#gs-raiz #f-deleg'); await p.waitForTimeout(300);
      await p.selectOption('#gs-raiz #f-deleg [name=pessoa]', { label: 'Adriana' }); await p.click('#gs-raiz #deleg-ok'); await p.waitForTimeout(1500);
      ok('Delegar: 4 passos para a pessoa, só o 1º começa', sql("select count(*) from tarefas t join fluxos f on f.id=t.fluxo_id where f.nome like 'Lead completo%'") === '4' &&
        sql("select count(*) from tarefas t join fluxos f on f.id=t.fluxo_id where f.nome like 'Lead completo%' and t.status='aguardando'") === '3');
      sql("update tarefas t set status='concluida' from fluxos f where f.id=t.fluxo_id and f.nome like 'Lead completo%' and t.ordem=1");
      sql("update tarefas t set status='concluida' from fluxos f where f.id=t.fluxo_id and f.nome like 'Lead completo%' and t.ordem=2");
      sql("update tarefas t set status='concluida' from fluxos f where f.id=t.fluxo_id and f.nome like 'Lead completo%' and t.ordem=3");
      await nav(p, 'hoje'); await p.waitForSelector('#ini-valid .ini-valid'); await p.waitForTimeout(400);
      ok('Início: "Aguardando minha validação" mostra o contrato preparado', /Preparar o contrato/.test(await p.textContent('#ini-valid')));
      await p.click('#ini-valid [data-val-dev]'); await p.waitForSelector('#gs-raiz [name=coment]');
      await p.fill('#gs-raiz [name=coment]', 'Faltou a cláusula de êxito (teste)'); await p.click('#gs-raiz #tf-dev-ok'); await p.waitForTimeout(1200);
      ok('Devolver com comentário: volta para a pessoa, com o comentário', sql("select t.status from tarefas t join fluxos f on f.id=t.fluxo_id where f.nome like 'Lead completo%' and t.ordem=3") === 'andamento' &&
        sql("select count(*) from comentarios where texto like '↩ Devolvido: Faltou a cláusula%'") === '1');
      sql("update tarefas t set status='concluida' from fluxos f where f.id=t.fluxo_id and f.nome like 'Lead completo%' and t.ordem=3");
      await nav(p, 'hoje'); await p.waitForSelector('#ini-valid [data-val-ok]'); await p.click('#ini-valid [data-val-ok]'); await p.waitForTimeout(1500);
      ok('Aprovar libera o próximo passo (enviar o contrato)', sql("select t.status from tarefas t join fluxos f on f.id=t.fluxo_id where f.nome like 'Lead completo%' and t.ordem=4") === 'pendente'); }

    // ── Backup 34/42: envio das guias por empresa (o mesmo do módulo Parcelamentos; o "Controle" da Rotina saiu no Backup 42) ──
    sql("insert into config_privada(chave,valor) values ('email','{\"provedor\":\"gmail\",\"usuario\":\"escritorio@teste.com\",\"senha\":\"senhadeapp1234567\"}') on conflict (chave) do update set valor=excluded.valor");   // Backup 42: serviço de envio configurado (o carteiro é de mentira)
    sql("insert into parcelas(parcelamento_id,numero,vencimento,pago) select id,'77',current_date+2,false from parcelamentos where emitimos_guia order by criado_em limit 1");
    sql("insert into parcelas(parcelamento_id,numero,vencimento,pago) select parcelamento_id,'78',current_date+4,false from parcelas where numero='77' limit 1");
    sql("insert into parcelas(parcelamento_id,numero,vencimento,pago) select parcelamento_id,'79',current_date-10,false from parcelas where numero='77' limit 1");
    const pa77 = sql("select parcelamento_id from parcelas where numero='77'"), vu77 = sql("select coalesce(valor_ultima_parcela::text,'null') from parcelamentos where id='" + pa77 + "'");
    const id77 = sql("select id from parcelas where numero='77'"), id78 = sql("select id from parcelas where numero='78'"), id79 = sql("select id from parcelas where numero='79'");
    await p.evaluate((ids) => window.GS.gerarGuias('parcelas', { ids }), [id77, id78]); await p.waitForSelector('#gs-raiz .ge-janela'); await p.waitForTimeout(500);
    ok('Enviar por empresa: texto das antigas Notificações e WhatsApp ao lado de Enviar e-mail', /Prezados,\n\nSeguem as guias dos parcelamentos com vencimento neste mês/.test(await p.inputValue('#ge-texto')) && await p.evaluate(() => { const a = document.querySelector('#ge-zap'), b = document.querySelector('#ge-enviar'); return a && b && a.parentElement === b.parentElement; }));
    ok('Enviar por empresa: empresas agrupadas por grupo, com "Copiar texto" e o e-mail já preenchido (sem lista para escolher)', (await p.$$('#gs-raiz .ge-grp .ge-emp')).length > 0 && !!(await p.$('#gs-raiz #ge-copiar')) && !(await p.$('#gs-raiz #ge-para-sel')) && await p.isVisible('#gs-raiz #ge-para'));
    await p.click('#gs-raiz #ge-previa'); await p.waitForSelector('#gs-raiz iframe.ge-previa', { timeout: 8000 }).catch(() => {});
    ok('Enviar por empresa: "Prévia do e-mail" mostra o e-mail com a marca', /<html|<table|<div/i.test(await p.evaluate(() => (document.querySelector('#gs-raiz iframe.ge-previa') || {}).srcdoc || '')));
    await p.evaluate(() => { const f = document.querySelector('#gs-raiz iframe.ge-previa'); const j = f && f.closest('.janela'); const x = j && j.querySelector('.janela-x, [data-fechar]'); if (x) x.click(); }); await p.waitForTimeout(300);
    ok('Enviar por empresa: só as parcelas escolhidas, com o valor editável na caixa "R$"', (await p.$$('#gs-raiz .ge-it')).length === 2 && await p.isVisible('#gs-raiz .ge-vbox .ge-rs'));
    await p.fill('#gs-raiz #ge-para', 'guias@teste.com');
    await p.fill('#gs-raiz .ge-it[data-ge="' + id77 + '"] .ge-valor', '1.234,56');
    await p.setInputFiles('#gs-raiz #ge-arqs', { name: 'guia78.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 teste') });
    await p.click('#gs-raiz #ge-enviar'); await p.waitForTimeout(3000);
    ok('Enviar por empresa: um e-mail com as parcelas e o PDF anexado (vai no e-mail, não no Storage)', sql("select count(*) from email_fila where para='guias@teste.com' and anexo::text like '%guia78.pdf%'") === '1' &&
      sql("select count(*) from documentos where nome='guia78.pdf'") === '0');
    { const st = sql("select status||' '||coalesce(erro,'') from email_fila where para='guias@teste.com'"), av = await p.textContent('#gs-raiz #aviso').catch(() => '');
      ok('Backup 42: o e-mail sai NA HORA (sem esperar a rotina) e a tela diz "enviado"', /^enviado/.test(st) && /enviado para guias@teste\.com/.test(av), st + ' | ' + av); }
    ok('Enviar por empresa: as parcelas ficam marcadas como emitidas e o valor digitado vira o valor lançado', sql("select count(*) from parcelas where numero in ('77','78') and emitida_em = current_date and email_ref like 'guias:%'") === '2' &&
      sql("select valor from parcelas where numero='77'") === '1234.56');
    // vencida sem pagamento → nova data e valor atualizado (reemissão; só parcelamento)
    await p.evaluate((ids) => window.GS.gerarGuias('parcelas', { ids }), [id79]); await p.waitForSelector('#gs-raiz .ge-janela'); await p.waitForTimeout(500);
    ok('Reemissão: a guia vencida pede o novo vencimento', await p.isVisible('#gs-raiz .ge-novo-venc'));
    await p.fill('#gs-raiz #ge-para', 'guias@teste.com'); await p.fill('#gs-raiz .ge-valor', '999,90'); await p.click('#gs-raiz #ge-enviar'); await p.waitForTimeout(2500);
    ok('Reemissão: grava o reenvio (novo vencimento e valor atualizado) sem mudar o valor lançado', sql("select (reenvio_venc >= current_date)::text || '|' || reenvio_valor || '|' || coalesce(valor::text,'-') from parcelas where numero='79'") === 'true|999.90|-');
    // Backup 44: "📝 Rascunho no Gmail" — o e-mail fica pronto na pasta Rascunhos (IMAP) e não sai
    sql("insert into parcelas(parcelamento_id,numero,vencimento,pago) select parcelamento_id,'80',current_date+6,false from parcelas where numero='77' limit 1");
    await p.evaluate((ids) => window.GS.gerarGuias('parcelas', { ids }), [sql("select id from parcelas where numero='80'")]); await p.waitForSelector('#gs-raiz .ge-janela'); await p.waitForTimeout(500);
    await p.fill('#gs-raiz #ge-para', 'rascunho@teste.com'); await p.fill('#gs-raiz .ge-valor', '321,00'); await p.click('#gs-raiz #ge-rascunho'); await p.waitForTimeout(3000);
    { const st = sql("select status from email_fila where para='rascunho@teste.com'"), av = await p.textContent('#gs-raiz #aviso').catch(() => '');
      const rs = await (await fetch(BASE + '/__teste/rascunhos')).json();
      ok('Backup 44: "Rascunho no Gmail" grava na pasta Rascunhos e não envia', st === 'rascunho_salvo' && rs.some((x) => /To: rascunho@teste\.com/.test(x.raw) && x.pasta === '[Gmail]/Rascunhos') &&
        /rascunho salvo no Gmail/.test(av), st + ' | ' + av); }
    sql("delete from parcelas where numero in ('77','78','79','80')");
    sql("update parcelamentos set valor_ultima_parcela = " + vu77 + " where id='" + pa77 + "'");
    sql("delete from config_privada where chave='email'");

    // Backup 31/42: Rotina — o ✓ no fim da linha registra a conferência; com alteração, salva a linha
    await p.evaluate(() => nav(null, 'rotina')); await p.waitForSelector('#rt-abas'); await p.click('#rt-abas [data-rt-aba=passivo]');
    await p.waitForSelector('#rt-pas-corpo [data-conferir]', { timeout: 10000 }); await p.waitForTimeout(500);
    ok('Rotina: Conferência é a última coluna, sem contorno azul nem relógio nas empresas', /Conferência/.test(await p.textContent('#rt-corpo thead th:last-child')) && !(await p.$('#rt-pas-corpo tr.gx-grp')) && !(await p.$('#rt-pas-corpo [data-hist]')));
    await p.click('#rt-pas-corpo [data-conferir] >> nth=0'); await p.waitForTimeout(1200);
    ok('Rotina: "✓" registra a conferência da empresa (quem e quando), sem alterar nada', sql("select count(*) from rotina_conferencias where area='passivo' and not alterou") === '1' && /conferido/.test(await p.textContent('#rt-pas-corpo')));
    { const tr = '#rt-pas-corpo tr[data-id] >> nth=1', cid = await p.getAttribute(tr, 'data-id');
      await p.fill('#rt-pas-corpo tr[data-id="' + cid + '"] [data-c=ceat_trt3]', '7'); await p.waitForTimeout(200);
      await p.click('#rt-pas-corpo tr[data-id="' + cid + '"] [data-conferir]'); await p.waitForTimeout(1500);
      ok('Rotina: "✓" numa linha alterada SALVA a linha (sem precisar de "Salvar alterações")', sql("select ceat_trt3 from clientes where id='" + cid + "'") === '7' &&
        sql("select count(*) from rotina_conferencias where area='passivo' and alterou") === '1'); }
    ok('Rotina (B49): abas curtas na ordem do mês, sem a aba Acordos', (await p.$$eval('#rt-abas [data-rt-aba]', (bs) => bs.map((b) => b.textContent.trim()).join('|'))) === 'Passivo|Processos|Guias do mês|Planilha|Minhas tarefas');
    await p.click('#rt-abas [data-rt-aba=passivo]').catch(() => {}); await p.waitForSelector('#rt-pas-corpo [data-senha]', { timeout: 10000 }).catch(() => {});
    ok('Rotina: passivo sem a coluna Senha GOV (fica no botão 🔑)', (await p.$$('#rt-pas-corpo [data-senha]')).length > 0 && !/Senha GOV/.test(await p.textContent('#rt-corpo thead')));
    // Backup 45: preencher como planilha — Enter desce para a mesma coluna da empresa de baixo
    await p.focus('#rt-pas-corpo tr[data-id] >> nth=0 >> [data-c=ceat_trt3]'); await p.keyboard.press('Enter');
    ok('Rotina (B45): Enter no passivo desce para a mesma coluna da linha de baixo', await p.evaluate(() => { const a = document.activeElement, linhas = [...document.querySelectorAll('#rt-pas-corpo tr[data-id]')];
      return !!a && a.dataset.c === 'ceat_trt3' && a.closest('tr') === linhas[1]; }));
    ok('Rotina (B45): conferência sem repetir "alterado" (uma linha só com a data)', await p.evaluate(() => [...document.querySelectorAll('#rt-pas-corpo .rt-cf-txt')].every((x) => (x.textContent.match(/alt/g) || []).length <= 1)));
    // Backup 45: Processos — conferência na última coluna, tribunal, filtros em azul e "sem novidade" dentro da janela
    await p.click('#rt-abas [data-rt-aba=processos]'); await p.waitForSelector('#rt-proc-corpo', { timeout: 10000 }); await p.waitForTimeout(600);
    ok('Rotina → Processos (B45): Tribunal, Conferência na última coluna, filtros em azul e sem o botão solto "Sem novidade"', /Tribunal/.test(await p.textContent('#rt-corpo thead')) &&
      /Conferência/.test(await p.textContent('#rt-corpo thead th:last-child')) && (await p.$$('#rt-proc-segs .segmento')).length >= 2 && !(await p.$('#rt-corpo [data-sem-nov]')) &&
      /Com procuração/.test(await p.textContent('#rt-proc-segs')) && /\+30 dias/.test(await p.textContent('#rt-proc-segs')) && !!(await p.$('#rt-proc-segs select#rt-trib')));
    await p.click('#rt-proc-segs [data-seg=proc] [data-v=sem]'); await p.waitForTimeout(300);
    ok('Rotina → Processos: filtro "Sem procuração" mostra só os sem procuração', await p.evaluate(() => [...document.querySelectorAll('#rt-proc-corpo tr:not(.rt-grp) .pill')].filter((x) => /^(Sim|Não)$/.test(x.textContent)).every((x) => x.textContent === 'Não')));
    // Backup 46: vários filtros juntos (Sem procuração + Nunca conferidos)
    await p.click('#rt-proc-segs [data-seg=conf] [data-v=nunca]'); await p.waitForTimeout(300);
    ok('Rotina → Processos (B46): dá para marcar mais de um filtro ao mesmo tempo', (await p.$$('#rt-proc-segs .rt-seg button.ativo')).length === 2 &&
      await p.evaluate(() => [...document.querySelectorAll('#rt-proc-corpo tr:not(.rt-grp) .rt-cf-txt')].every((x) => /nunca/.test(x.textContent))));
    await p.click('#rt-proc-segs [data-seg=conf] [data-v=""]'); await p.click('#rt-proc-segs [data-seg=proc] [data-v=""]'); await p.waitForTimeout(300);
    { const n0 = sql("select count(*) from processo_movimentacoes where tipo='sem_novidade'"), pidC = await p.getAttribute('#rt-proc-corpo [data-mov] >> nth=0', 'data-mov');
      const antes = sql("select coalesce(ultima_movimentacao,'')||'|'||coalesce(ultima_movimentacao_em::text,'') from processos where id='" + pidC + "'");
      await p.click('#rt-proc-corpo [data-mov] >> nth=0'); await p.waitForSelector('#mov-form');
      ok('Rotina → Processos: o ✓ abre a conferência com "Sem novidade" já marcado', /Sem novidade/.test(await p.textContent('#gs-raiz .mov-tipos button.ativo')));
      await p.click('#gs-raiz [data-mov-ok]'); await p.waitForTimeout(1500);
      ok('Rotina → Processos: salvar com "Sem novidade" registra a conferência', Number(sql("select count(*) from processo_movimentacoes where tipo='sem_novidade'")) === Number(n0) + 1);
      // devolve o processo como estava (os testes seguintes contam com a última movimentação original)
      sql("delete from processo_movimentacoes where processo_id='" + pidC + "' and tipo='sem_novidade' and criado_em > now() - interval '5 minutes'");
      const [um, ume] = antes.split('|'); sql("update processos set ultima_movimentacao='" + um.replace(/'/g, "''") + "', ultima_movimentacao_em=" + (ume ? "'" + ume + "'" : 'null') + " where id='" + pidC + "'"); }

    // Backup 33: Painel Executivo — evolução do passivo em linhas (total ou por empresa)
    await p.evaluate(() => nav(null, 'resumo')); await p.waitForTimeout(1500);
    ok('Painel (B49): "Evolução do passivo" começa fechada (só o título)', await p.isVisible('#evo-abrir') && !(await p.isVisible('#cEvoPassivo')));
    await p.click('#evo-abrir'); await p.waitForTimeout(1500);
    ok('Painel: gráfico de linhas "Evolução do passivo"', await p.evaluate(() => { const c = document.getElementById('cEvoPassivo'); const ch = c && window.Chart && Chart.getChart(c); return !!ch && ch.config.type === 'line' && ch.data.labels.length >= 2 && ch.data.labels.length <= 12; }));
    ok('Painel (B45): Empresas do grupo com valores resumidos (R$ 3k, R$ 1,3M) e o valor completo ao passar o mouse', await p.evaluate(() => { const v = [...document.querySelectorAll('#tblExecRanking .er-v')];
      return v.length > 0 && v.every((x) => /^R\$ [\d,]+(k|M)?$/.test(x.textContent.trim()) && /^R\$\s?[\d.]+,\d{2}$/.test(x.title)); }));
    ok('Painel: evolução abre em "Tudo junto" (uma linha só)', await p.evaluate(() => Chart.getChart(document.getElementById('cEvoPassivo')).data.datasets.length === 1));
    ok('Painel: evolução sem os meses antes do primeiro lançamento (nada de cair para zero)', await p.evaluate(() => Chart.getChart(document.getElementById('cEvoPassivo')).data.datasets[0].data[0] != null));
    await p.click('#evo-visao [data-v=linhas]'); await p.waitForTimeout(500);
    ok('Painel: evolução com uma linha por grupo', await p.evaluate(() => Chart.getChart(document.getElementById('cEvoPassivo')).data.datasets.length === Number(document.querySelectorAll('#execRankWrap tr.gx-grp').length || 2) || Chart.getChart(document.getElementById('cEvoPassivo')).data.datasets.length >= 2));
    await p.click('#evo-visao [data-v=total]'); await p.waitForTimeout(500);
    ok('Painel: "Tudo junto" soma numa linha só', await p.evaluate(() => Chart.getChart(document.getElementById('cEvoPassivo')).data.datasets.length === 1));
    await p.evaluate(() => { FILTROS.grupo = 'Grupo Alfa'; renderExecRanking(); }); await p.click('#evo-visao [data-v=linhas]'); await p.waitForTimeout(500);
    ok('Painel: com um grupo no filtro do topo, uma linha por empresa do grupo', /empresa/.test(await p.textContent('#evo-bt-linhas')) && await p.evaluate(() => Chart.getChart(document.getElementById('cEvoPassivo')).data.datasets.every((d) => d.label !== 'Grupo Alfa')));
    await p.evaluate(() => { FILTROS.grupo = ''; renderExecRanking(); });

    // Backup 43: a Planilha de parcelamentos (preencher emissão, pagamento, valor da última parcela, observação) voltou
    await p.evaluate(() => nav(null, 'rotina')); await p.waitForSelector('#rt-abas'); await p.click('#rt-abas [data-rt-aba=planilha]');
    await p.waitForSelector('#rt-corpo .pl-bloco', { timeout: 10000 }).catch(() => {});
    ok('Rotina: "Planilha de parcelamentos" só para conferência (abas por grupo, blocos, valor residual; Backup 45: sem nenhum botão de envio)', (await p.$$('#rt-corpo .pl-aba')).length >= 1 &&
      (await p.$$('#rt-corpo .pl-bloco')).length >= 1 && /Valor residual/.test(await p.textContent('#rt-corpo .pl-bloco')) && !(await p.$('#rt-corpo #pl-emitir')) && !(await p.$('#rt-corpo [data-pl-gx]')) &&
      !(await p.$('#rt-corpo [data-pl-gpa]')) && !(await p.$('#rt-corpo [data-pl-gemp]')) && !/teste/.test(await p.textContent('#rt-corpo .card-hd')));
    ok('Rotina (B45): sem a aba Financeiro', !(await p.$('#rt-abas [data-rt-aba=financeiro]')));
    { const id = await p.getAttribute('#rt-corpo [data-pl-e] >> nth=-1', 'data-pl-e');
      await p.click('#rt-corpo [data-pl-e="' + id + '"]'); await p.waitForTimeout(1200);
      ok('Planilha: clicar em EMISSÃO marca a guia como emitida', sql("select emitida_em is not null from parcelas where id='" + id + "'") === 't');
      await p.click('#rt-corpo [data-pl-e="' + id + '"]'); await p.waitForTimeout(1200); }
    // Backup 46: pagamento marca na hora (sem recarregar a tela) e os parcelamentos da mesma empresa ficam lado a lado
    { const idp = await p.getAttribute('#rt-corpo [data-pl-p] >> nth=0', 'data-pl-p');
      await p.evaluate(() => { window.__plMarca = 1; document.querySelector('#rt-corpo .pl-card').dataset.marca = 'x'; });
      await p.click('#rt-corpo [data-pl-p="' + idp + '"]'); await p.waitForTimeout(1500);
      ok('Planilha (B46): "Pagamento" grava e marca na hora, sem recarregar a planilha', sql("select pago::text from parcelas where id='" + idp + "'") === 'true' &&
        !(await p.$('#rt-corpo [data-pl-p="' + idp + '"]')) && await p.evaluate(() => document.querySelector('#rt-corpo .pl-card').dataset.marca === 'x'));
      sql("update parcelas set pago=false, data_pagamento=null where id='" + idp + "'");
      ok('Planilha (B46): cada empresa numa linha com os parcelamentos lado a lado, e a barra de rolagem lateral no rodapé', (await p.$$('#rt-corpo .pl-linha')).length >= 1 && !!(await p.$('#rt-corpo #pl-barra-x'))); }
    // Backup 45: "Enviar guias do mês" = antigas Notificações → Parcelamento, IDÊNTICO; "✉ Enviar e-mail" salva um rascunho no Gmail (texto + guias anexadas na tela)
    sql("insert into config_privada(chave,valor) values ('email','{\"provedor\":\"gmail\",\"usuario\":\"escritorio@teste.com\",\"senha\":\"senhadeapp1234567\"}') on conflict (chave) do update set valor=excluded.valor");
    sql("insert into parcelas(parcelamento_id,numero,vencimento,pago) select id,'88',current_date,false from parcelamentos where emitimos_guia order by criado_em limit 1");
    const redirAntes = sql("select coalesce(valor::text,'null') from configuracoes where chave='email_redirecionar'");
    sql("insert into configuracoes(chave,valor) values ('email_redirecionar','\"pedromgsam@gmail.com\"') on conflict (chave) do update set valor=excluded.valor");
    { const id88 = sql("select id from parcelas where numero='88'");
      await p.evaluate(() => nav(null, 'rotina')); await p.waitForSelector('#rt-abas'); await p.click('#rt-abas [data-rt-aba=guias]');
      await p.waitForSelector('#rt-corpo [data-ep="' + id88 + '"]', { timeout: 10000 }).catch(() => {});
      ok('Enviar guias do mês: empresas com as guias vencidas ou do mês, legenda e "Gerar Notificação" travado sem marcar', !!(await p.$('#rt-corpo [data-ep="' + id88 + '"]')) && await p.isVisible('#rt-corpo .ep-legenda') && !!(await p.$('#ep-gerar[disabled]')));
      // Backup 46: exceção — quem emite as próprias guias só aparece marcando "Incluir clientes que emitem as próprias guias"
      { const pac = sql("insert into parcelamentos (empresa, grupo_id, emitimos_guia, numero) select 'EMPRESA EMITE B46', grupo_id, false, 'B46' from parcelamentos where id = (select parcelamento_id from parcelas where id='" + id88 + "') returning id").split('\n')[0];
        sql("insert into parcelas(parcelamento_id,numero,vencimento,pago) values ('" + pac + "','89',current_date,false)");
        const id89 = sql("select id from parcelas where numero='89'");
        await p.click('#ep-atu'); await p.waitForSelector('#rt-corpo [data-ep="' + id88 + '"]'); await p.waitForTimeout(300);
        const antes = !!(await p.$('#rt-corpo [data-ep="' + id89 + '"]'));
        await p.check('#ep-todos'); await p.waitForTimeout(300);
        ok('Enviar guias do mês (B46): quem emite as próprias guias só aparece na exceção', !antes && !!(await p.$('#rt-corpo [data-ep="' + id89 + '"]')) && /cliente emite/.test(await p.textContent('#rt-corpo [data-ep-row="' + id89 + '"]')));
        await p.uncheck('#ep-todos'); await p.waitForTimeout(300);
        sql("delete from parcelas where id='" + id89 + "'"); sql("delete from parcelamentos where id='" + pac + "'"); }
      await p.check('#rt-corpo [data-ep="' + id88 + '"]'); await p.click('#ep-gerar'); await p.waitForSelector('#rt-corpo .ep-card');
      const txt = await p.textContent('#rt-corpo .ep-card-body');
      ok('Enviar guias do mês: texto das antigas Notificações (Nº do Parcelamento, Parcela x de y | Vencimento, Nº da Guia, Valor)', /^Prezados,\s*Seguem as guias dos parcelamentos com vencimento neste mês\. Antes de pagar, confirme se a guia já não foi paga, para evitar duplicidade\./.test(txt) &&
        /Nº do Parcelamento: /.test(txt) && /Parcela: 88 de .+ \| Vencimento: \d{2}\/\d{2}\/\d{4}/.test(txt) && /Nº da Guia: 88/.test(txt) && /Valor:/.test(txt) && !!(await p.$('#rt-corpo .ep-card-body .ep-val')), txt.slice(0, 300));
      ok('Enviar guias do mês: cartão igual ao antigo (E-mail × WhatsApp; Editar, Copiar, Enviar e-mail, Enviar WhatsApp, Marcar enviado) + anexar guias', await p.isVisible('#rt-corpo .ep-card-hd2') &&
        (await p.$$('#rt-corpo .ep-card [data-ep-a]')).length === 6 && !!(await p.$('#rt-corpo .ep-card .ep-arqs')));
      await p.fill('#rt-corpo .ep-val', '321,00');
      await p.setInputFiles('#rt-corpo .ep-arqs', { name: 'guia88.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 guia 88') });
      await p.fill('#rt-corpo .ep-para', 'planilha@teste.com'); await p.click('#rt-corpo [data-ep-a=mail]'); await p.waitForTimeout(3000);
      { const st = sql("select status||'|'||para||'|'||assunto from email_fila where referencia like 'rasc:%' order by criado_em desc limit 1"), rs = await (await fetch(BASE + '/__teste/rascunhos')).json(), r0 = rs[rs.length - 1] || {};
        ok('Enviar guias do mês: "✉ Enviar e-mail" salva o RASCUNHO no Gmail com o e-mail do cliente (sem o desvio do modo teste), o texto e a guia anexada', /^rascunho_salvo\|planilha@teste\.com\|Guias de Parcelamento — /.test(st) &&
          /To: planilha@teste\.com/.test(r0.raw || '') && /R\$ 321,00/.test(r0.raw || '') && /guia88\.pdf/.test(r0.raw || ''), st + ' | ' + String(r0.raw || '').slice(0, 200)); }
      ok('Enviar guias do mês (B46): assim que o rascunho é salvo, a guia fica emitida (data de hoje) e o valor digitado vira o valor lançado',
        sql("select (emitida_em = current_date)::text||'|'||valor from parcelas where id='" + id88 + "'") === 'true|321.00' && await p.isDisabled('#rt-corpo [data-ep-a=sent]'));
      sql("delete from parcelas where id='" + id88 + "'"); }
    if (redirAntes === 'null' || redirAntes === '') sql("delete from configuracoes where chave='email_redirecionar'"); else sql("update configuracoes set valor='" + redirAntes.replace(/'/g, "''") + "'::jsonb where chave='email_redirecionar'");
    sql("delete from config_privada where chave='email'");

    // Backup 35: Processos — últimas 3 movimentações e a data em que o valor da causa foi atualizado
    { const pid = sql("select id from processos order by criado_em limit 1");
      sql("insert into processo_movimentacoes(processo_id,data,tipo,descricao) values ('" + pid + "',current_date-3,'movimentacao','Mov A'),('" + pid + "',current_date-2,'decisao','Mov B'),('" + pid + "',current_date-1,'movimentacao','Mov C'),('" + pid + "',current_date-10,'movimentacao','Mov velha')");
      sql("insert into processo_movimentacoes(processo_id,data,tipo,descricao,valor_novo) values ('" + pid + "',current_date-20,'valor','Recalculado',123456.78)");
      ok('Processos: mudança de valor grava a data do valor da causa (separada da última movimentação)', sql("select (valor_em = current_date-20)::text || '|' || (ultima_movimentacao_em = current_date-1)::text from processos where id='" + pid + "'") === 'true|true');
      await p.evaluate(() => ERP_RECARREGAR()); await nav(p, 'processos'); await p.waitForTimeout(2000);
      const num = sql("select numero from processos where id='" + pid + "'");
      await p.click('#tblProcBody tr:has-text("' + num + '")').catch(() => {}); await p.waitForSelector('#janelas .gx-mov', { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(800);
      const t = await p.textContent('#janelas').catch(() => '');
      ok('Processos: a janela mostra as 3 últimas movimentações e "valor atualizado em"', (await p.$$('#janelas .gx-mov')).length === 3 && /Mov C/.test(t) && !/Mov velha/.test(t) && /atualizado em/.test(t), t.slice(0, 300));
      await p.evaluate(() => { while (document.querySelector('#janelas .fundo')) window.GS.fecharJanela(); }); }

    // Backup 35: Publicações — filtro por advogado em botões
    await nav(p, 'publicacoes'); await p.waitForSelector('#pub-advs', { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(800);
    ok('Publicações: filtro por advogado (botões com os nomes cadastrados nas OABs)', (await p.$$('#pub-advs button')).length >= 2);

    // Backup 42: Financeiro → "💬 Cobrar" com texto simples para o WhatsApp
    { const lid = sql("select id from lancamentos where tipo='receita' and not pago and not perda order by vencimento limit 1");
      await p.evaluate((id) => window.GS.cobrarWhatsApp(id), lid); await p.waitForSelector('#cb-txt');
      ok('Financeiro: "Cobrar" monta o texto "… Passando para lembrar dos honorários do mês de …, referente a …"', /^(Bom dia|Boa tarde|Boa noite)! Passando para lembrar dos honorários do mês de .+, referente /.test(await p.inputValue('#cb-txt')));
      await p.evaluate(() => { window.__recargas = 0; const ld = window.loadData; window.loadData = function () { window.__recargas++; return ld.apply(this, arguments); }; });
      await p.click('#cb-copiar'); await p.waitForTimeout(1000);
      ok('Backup 43: "Cobrar" não recarrega o sistema inteiro (era o que demorava)', await p.evaluate(() => window.__recargas === 0));
      ok('Financeiro: depois de copiar a cobrança, o lançamento fica "Cobrado"', sql("select cobranca from lancamentos where id='" + lid + "'") === 'Cobrado');
      await p.evaluate(() => { while (document.querySelector('#janelas .fundo')) window.GS.fecharJanela(); }); }
    // Backup 42: Administração → E-mail mostra o check-list do que falta para o e-mail sair
    await nav(p, 'admin'); await p.waitForSelector('#adm-abas'); await p.click('#adm-abas [data-aba=email]'); await p.waitForSelector('#em-abas'); await p.click('#em-abas [data-em-aba=config]');   // Backup 49: o check-list fica em E-mail → Configuração
    await p.waitForSelector('#email-check-bd .lista-ficha', { timeout: 10000 }).catch(() => {});
    { const tx = await p.textContent('#email-check-bd').catch(() => '');
      ok('E-mail: check-list (serviço, função, envio automático, pausa, destino e último problema)', /1\. Serviço de envio/.test(tx) && /2\. Função erp-emails/.test(tx) && /Modo teste|clientes de verdade/.test(tx), tx.slice(0, 200)); }
    // Backup 41: ⋯ sem "Relatório em PDF"
    await p.click('#gs-hd .gs-bt-mais'); ok('Menu ⋯ sem Relatório em PDF e sem Aprovações', !(await p.$('#gs-hd [data-acao=pdf]')) && !(await p.$('#gs-hd [data-acao=aprovacoes]'))); await p.keyboard.press('Escape');

    // ── Backup 37 ──
    { // Rotina: passivo sem "Em operação"; Painel com "Em operação" antes da CAPAG
      await p.evaluate(() => nav(null, 'rotina')); await p.waitForSelector('#rt-abas'); await p.click('#rt-abas [data-rt-aba=passivo]'); await p.waitForSelector('#rt-pas-corpo tr[data-id]', { timeout: 10000 }).catch(() => {});
      ok('Rotina: passivo sem a coluna "Em operação"', !/Em operação/.test(await p.textContent('#rt-corpo thead')));
      await p.evaluate(() => nav(null, 'resumo')); await p.waitForTimeout(2000);
      const thsPe = (await p.$$eval('#execRankHead th', (l) => l.map((x) => x.textContent.trim()))).join(' ');
      ok('Painel: "Operação" presente (B41), sem CEAT e sem CAPAG; situação sem caixa alta', /Operação/.test(thsPe) && !/Em operação/.test(thsPe) && !/CAPAG|CEAT/.test(thsPe) &&
        await p.evaluate(() => [...document.querySelectorAll('#tblExecRanking td.er-sit .tag')].every((x) => x.textContent === '—' || x.textContent !== x.textContent.toUpperCase())));
      // contador da sessão na barra de cima (só cai por inatividade)
      ok('Barra de cima: contador discreto da sessão', /⏱\d+′/.test(await p.textContent('#gs-sessao')));
    }
    { // Planilha com MAIS de 1000 parcelas (o Supabase devolve 1000 por vez): a guia do mês tem que aparecer
      const pid = 'e0000000-0000-0000-0000-000000000037';
      sql("insert into parcelamentos(id, empresa, total_parcelas, valor_ultima_parcela) values ('" + pid + "','EMPRESA MIL PARCELAS',1200,10) on conflict do nothing");
      sql("insert into parcelas(parcelamento_id, numero, vencimento, pago) select '" + pid + "', g, date '1990-01-10' + g, true from generate_series(1,1150) g");
      sql("insert into parcelas(parcelamento_id, numero, vencimento, pago) values ('" + pid + "', 1151, current_date, false)");
      const id1151 = sql("select id from parcelas where parcelamento_id='" + pid + "' and numero='1151'");
      await p.evaluate(() => nav(null, 'rotina')); await p.waitForSelector('#rt-abas'); await p.click('#rt-abas [data-rt-aba=guias]');
      await p.waitForSelector('#rt-corpo [data-ep="' + id1151 + '"]', { timeout: 15000 }).catch(() => {});
      ok('Enviar guias do mês: com mais de 1000 parcelas no banco a guia do mês aparece (busca em páginas)', !!(await p.$('#rt-corpo [data-ep="' + id1151 + '"]')));
      sql("delete from parcelamentos where id='" + pid + "'");
      // Processos: valor atual ao lado do valor novo
      const prc = sql("select id from processos order by criado_em limit 1");
      if (prc) { await p.evaluate((id) => window.GS.janelaMovimentacao(id), prc); await p.waitForSelector('#mov-form'); await p.click('#gs-raiz .mov-tipos [data-tipo=valor]');
        ok('Processos: ao lançar valor novo, o valor atual da causa aparece ao lado', await p.isVisible('#gs-raiz .mov-vatual') && /Valor atual da causa/.test(await p.textContent('#gs-raiz .mov-vatual')));
        await p.evaluate(() => { while (document.querySelector('#janelas .fundo')) window.GS.fecharJanela(); }); }
    }
    { // Backup 46: link da pasta no Google Drive na frente do grupo / da empresa (abre em outra aba)
      const gid = sql("select grupo_id from clientes where nome='Alfa Comércio Ltda'");
      const r = await p.evaluate((g) => window.SB.rpc('salvar_link_drive', { p_tipo: 'grupo', p_id: g, p_url: 'drive.google.com/drive/folders/teste-b46' }), gid);
      ok('Documentos (B46): grava o link do Drive (completa o https://)', !r.error && sql("select drive_url from grupos where id='" + gid + "'") === 'https://drive.google.com/drive/folders/teste-b46');
      await p.evaluate(() => window.GS.carregarCadastros(true)); await nav(p, 'documentos'); await p.waitForTimeout(1500);
      ok('Documentos (B46): o link aparece na pasta do grupo e abre em nova aba', await p.$$eval('#panel-documentos a.doc-drive', (as) => as.some((a) => a.href === 'https://drive.google.com/drive/folders/teste-b46' && a.target === '_blank')) &&
        !!(await p.$('#panel-documentos [data-drive-ed="grupo|' + gid + '"]')));
      sql("update grupos set drive_url='' where id='" + gid + "'"); }
    { // Documentos: certificado digital (.pfx + senha) — a validade é lida do arquivo; enviar direto na barra do grupo
      const os = require('os'), pth = require('path'), { execSync } = require('child_process'), dir = require('fs').mkdtempSync(pth.join(os.tmpdir(), 'cert-'));
      execSync('openssl req -x509 -newkey rsa:2048 -keyout ' + dir + '/k.pem -out ' + dir + '/c.pem -days 500 -nodes -subj "/CN=EMPRESA TESTE CERTIFICADO" 2>/dev/null && openssl pkcs12 -export -out ' + dir + '/cert.pfx -inkey ' + dir + '/k.pem -in ' + dir + '/c.pem -passout pass:segredo1 2>/dev/null');
      await nav(p, 'documentos'); await p.waitForTimeout(1500);
      // Backup 40: o certificado entra pelo "+ Enviar documento" (tipo Certificado digital)
      await p.click('#doc-novo'); await p.waitForSelector('#f-doc');
      await p.selectOption('#f-doc [name=tipo]', 'certificado');
      const cid = sql("select id from clientes where nome='Alfa Comércio Ltda'");
      await p.selectOption('#f-doc [name=cliente_id]', cid); await p.setInputFiles('#doc-arq', dir + '/cert.pfx');
      await p.fill('#f-doc [name=senha]', 'errada'); await p.waitForTimeout(1500);
      ok('Certificado: senha errada é avisada', /Senha incorreta/.test(await p.textContent('#cert-lido')));
      await p.fill('#f-doc [name=senha]', 'segredo1'); await p.waitForTimeout(1500);
      ok('Certificado: com a senha certa o sistema lê a validade do arquivo', /Certificado lido/.test(await p.textContent('#cert-lido')) && /^\d{4}-\d{2}-\d{2}$/.test(await p.inputValue('#f-doc [name=validade]')));
      await p.click('#btn-enviar-doc'); await p.waitForTimeout(2500);
      ok('Certificado: salvo com senha, validade e o arquivo em Documentos (tipo certificado)', sql("select (validade > current_date)::text||'|'||senha||'|'||(documento_id is not null)::text from cliente_certificado where cliente_id='" + cid + "'") === 'true|segredo1|true' &&
        sql("select count(*) from documentos where tipo='certificado' and cliente_id='" + cid + "'") === '1');
      ok('Documentos: "+ Enviar" na barra do grupo, sem botão "Certificado" separado', (await p.$$('#doc-corpo [data-pasta-enviar]')).length >= 1 && !(await p.$('#doc-corpo [data-pasta-cert]')) && !(await p.$('#doc-cert')));
      // subpastas por empresa e "Excluir" (com confirmação) no lugar de "Arquivar"
      { const g = sql("select grupo_id from clientes where id='" + cid + "'");
        if (!(await p.$('#doc-corpo details[data-pasta="' + g + '"][open]'))) { await p.click('#doc-corpo details[data-pasta="' + g + '"] > summary'); await p.waitForTimeout(800); }
        ok('Documentos: dentro do grupo, uma subpasta por empresa', (await p.$$('#doc-corpo details[data-pasta="' + g + '"] details.doc-sub')).length >= 1);
        if (!(await p.$('#doc-corpo details.doc-sub[data-sub="' + g + '|' + cid + '"][open]'))) { await p.click('#doc-corpo details.doc-sub[data-sub="' + g + '|' + cid + '"] > summary'); await p.waitForTimeout(800); }
        const did = sql("select id from documentos where tipo='certificado' and cliente_id='" + cid + "'");
        await p.click('#doc-corpo [data-excluir-doc="' + did + '"]'); await p.waitForTimeout(1500);
        ok('Documentos: "Excluir" pede confirmação e apaga o documento', sql("select count(*) from documentos where id='" + did + "'") === '0' && !(await p.$('#doc-corpo [data-arquivar-doc]'))); }
    }
    // ── Backup 49: simplificação (e-mails, Administração, Financeiro, Contratos, CRM, Publicações) ──
    { sql(`update configuracoes set valor='"pedromgsam@gmail.com"'::jsonb where chave='email_redirecionar'`);
      await p.evaluate(() => window.ERP_FAIXA_TESTE()); await p.waitForSelector('#gx-modo-teste', { timeout: 5000 }).catch(() => {});
      ok('B49: faixa amarela do modo teste para o administrador', /pedromgsam@gmail\.com/.test(await p.textContent('#gx-modo-teste').catch(() => '')));
      await p.click('#gx-teste-off'); await p.waitForTimeout(1200);
      ok('B49: "Desligar modo teste" desliga (com confirmação) e a faixa some', sql("select valor #>> '{}' from configuracoes where chave='email_redirecionar'") === '' && !(await p.$('#gx-modo-teste')));
      await nav(p, 'admin'); await p.waitForSelector('#adm-abas'); await p.waitForTimeout(500);
      ok('B53: Administração com Usuários · Importar · E-mail · Backup · Histórico · Acessos, sem "⋯ Mais" (sem Automações)', (await p.$$eval('#adm-abas > button[data-aba]', (b) => b.map((x) => x.textContent).join('|'))) === 'Usuários|Importar|E-mail|Backup|Histórico|Acessos' &&
        !(await p.$('#adm-mais-bt')) && !!(await p.$('#adm-abas > [data-aba=historico]')) && !(await p.$('#adm-abas [data-aba=automacoes]')));
      await p.click('#adm-abas [data-aba=email]'); await p.waitForSelector('#em-abas'); await p.click('#em-abas [data-em-aba=quem]'); await p.waitForSelector('.em-quem'); await p.waitForTimeout(400);
      ok('B49: E-mail → Quem recebe lista os clientes com a chave Sim/Não e os filtros', (await p.$$('.em-quem tbody [data-cli-email]')).length >= 1 && /Não recebem/.test(await p.textContent('.em-filtros')) && /Sem e-mail/.test(await p.textContent('.em-filtros')));
      const cliQ = sql("select id from clientes where nome='Alfa Comércio Ltda'");
      await p.click('.em-quem [data-cli-email="' + cliQ + '"]'); await p.waitForTimeout(1200);
      ok('B49: clicar na chave muda para "Não recebe"', sql("select recebe_email from clientes where id='" + cliQ + "'") === 'f');
      sql("update clientes set recebe_email=true where id='" + cliQ + "'");
      await p.click('#em-abas [data-em-aba=saida]'); await p.waitForSelector('#em-revisar'); await p.waitForTimeout(300);   // Backup 51: "Para revisar" é o 1º filtro da Caixa de saída
      ok('B49: E-mail → Para revisar com a chave "conferir antes de enviar"', !!(await p.$('#em-revisar')) && !!(await p.$('[data-saida-f=revisar][aria-pressed=true]')));
      ok('B55: sem a tela Automações; a chave "conferir antes de enviar" fica na Caixa de saída', !!(await p.$('#em-revisar')));
      // Financeiro: Perdas dentro de Recebidos
      await nav(p, 'financeiro'); await p.evaluate(() => setFinTab('recebidos', document.querySelector('#finTabBar [data-tab=recebidos]'))); await p.waitForTimeout(800);
      ok('B49: Financeiro sem a aba Prejuízo; "Perdas" é filtro dentro de Recebidos', !(await p.isVisible('#finTabBar [data-tab=prejuizo]')) && !!(await p.$('#fin-perdas-seg [data-fin-perdas="1"]')));
      await p.click('#fin-perdas-seg [data-fin-perdas="1"]'); await p.waitForTimeout(800);
      ok('B49: o filtro Perdas mostra o prejuízo e mantém Recebidos aceso', await p.evaluate(() => _finTab === 'prejuizo') && await p.evaluate(() => document.querySelector('#finTabBar [data-tab=recebidos]').classList.contains('active')) &&
        !!(await p.$('#fin-perdas-seg [data-fin-perdas="1"].ativo')));
      await nav(p, 'financeiroContab'); await p.evaluate(() => setFinCTab('analise', document.querySelector('#finCTabBar [data-tab=analise]'))); await p.waitForTimeout(1500);
      ok('B49: Contabilidade com os mesmos 5 cartões do Jurídico', (await p.$$('#finCContent .kpi-grid.fc-kpis5 > *')).length === 5);
      // Contratos: reajuste anual
      const ctrR = sql("insert into contratos (cliente_id, descricao, modalidade, forma_valor, valor_mensal, data_contrato, inicio_vigencia, status) values ('" + cliQ + "', 'Consultoria B49 reajuste', 'consultoria', 'fixo', 1000, current_date - 360, current_date - 360, 'Ativo') returning id").split('\n')[0];
      await nav(p, 'contratos'); await p.waitForSelector('#ctr-reaj', { timeout: 8000 }).catch(() => {});
      ok('B49: Contratos avisa o reajuste anual 30 dias antes', /Consultoria B49 reajuste/.test(await p.textContent('#ctr-reaj').catch(() => '')));
      await p.fill('#ctr-reaj tr[data-reaj="' + ctrR + '"] .ctr-reaj-pct', '10'); await p.click('#ctr-reaj [data-reaj-aplicar="' + ctrR + '"]'); await p.waitForTimeout(2000);
      ok('B49: "Aplicar" registra o aditivo com o valor novo', sql("select valor_mensal from contratos where id='" + ctrR + "'") === '1100.00' && sql("select count(*) from contratos_aditivos where contrato_id='" + ctrR + "' and tipo='valor'") === '1');
      // Publicações: abre em Novas + marcar todas como lidas
      await nav(p, 'publicacoes'); await p.waitForSelector('#pub-todas-lidas'); await p.waitForTimeout(600);
      ok('B49: Publicações abre em "Novas"', await p.evaluate(() => GS.E.pub.status === 'nova'));
      await p.click('#pub-todas-lidas'); await p.waitForTimeout(1500);
      ok('B49: "Marcar todas como lidas"', sql("select count(*) from publicacoes where status='nova'") === '0');
      // Alertas sem o que já tem outro lugar
      await nav(p, 'alertas'); await p.waitForTimeout(2500);
      ok('B53: Alertas voltou ao Backup 48 (publicações, tarefas e honorários em atraso)', /Publicações novas/.test(await p.textContent('#panel-alertas')) && /Honorários em atraso/.test(await p.textContent('#panel-alertas'))); }
    // ── Backup 50 ──
    { await nav(p, 'tarefas'); await p.evaluate(() => { GS.E.tf = null; }); await nav(p, 'tarefas'); await p.waitForTimeout(1500);
      const cab = await p.$$eval('#panel-tarefas table thead th', (l) => l.map((t) => t.textContent.trim()).filter(Boolean)).catch(() => []);
      ok('B50 Tarefas: Prazo e Dias em colunas separadas e status com cor', cab.includes('Prazo') && cab.includes('Dias') && !!(await p.$('#panel-tarefas .pill.tf-st')), cab.join('|'));
      await nav(p, 'financeiro'); await p.evaluate(() => setFinTab('receber', document.querySelector('#finTabBar [data-tab=receber]'))); await p.waitForTimeout(1500);
      ok('B50 Financeiro: valor a receber em verde e botões da linha numa linha só', await p.evaluate(() => {
        const v = document.querySelector('#panel-financeiro td.col-valor.valor-rec'), g = getComputedStyle(document.documentElement).getPropertyValue('--green-d');
        const td = document.querySelector('#panel-financeiro td.acoes-l .gx-cobrar'); const bs = td ? [...td.closest('td').querySelectorAll('.btn')].map((b) => Math.round(b.getBoundingClientRect().top)) : [];
        return !!v && getComputedStyle(v).color !== getComputedStyle(document.body).color && bs.length >= 2 && new Set(bs).size === 1; }));
      await nav(p, 'admin'); await p.waitForSelector('#adm-abas'); await p.click('#adm-abas [data-aba=email]'); await p.waitForSelector('#em-abas'); await p.click('#em-abas [data-em-aba=quem]'); await p.waitForSelector('.em-quem');
      const cliQ = sql("select id from clientes where nome='Alfa Comércio Ltda'");
      await p.click('.em-quem [data-em-dest="' + cliQ + '"]'); await p.waitForSelector('#em-dest-in');
      await p.fill('#em-dest-in', 'financeiro.b50@alfa.teste'); await p.click('#em-dest-ok'); await p.waitForTimeout(1500);
      ok('B50 Quem recebe: ✎ troca o e-mail de destino ali mesmo', /financeiro\.b50@alfa\.teste/.test(await p.textContent('.em-quem')) &&
        sql("select email from contato_do_cliente('" + cliQ + "', null, 'cobranca')") === 'financeiro.b50@alfa.teste');
      await p.click('.em-quem [data-em-cli="' + cliQ + '"]'); await p.waitForSelector('#f-cli'); await p.waitForTimeout(400);
      ok('B50 Quem recebe: clicar no cliente abre o cadastro na aba Contatos', await p.isVisible('#f-cli [name=email]') && await p.evaluate(() => document.querySelector('[data-cli-aba=contato]').classList.contains('ativo')));
      await p.evaluate(() => { while (document.querySelector('#janelas .fundo')) GS.fecharJanela(); }); }
    // ── Backup 51 ──
    { const reqs = []; const ouvir = (q) => reqs.push(q.method() + ' ' + q.url().replace(/^.*\/rest\/v1\//, ''));
      p.on('request', ouvir);
      const dialogos = []; const contaDialogo = (d) => dialogos.push(d.message()); p.on('dialog', contaDialogo);
      const paB = sql("select id from parcelamentos where empresa='Alfa Comércio Ltda' and numero='777'");
      sql("update parcelas set pago=false, data_pagamento=null, emitida_em=null, emissao='' where parcelamento_id='" + paB + "' and numero in ('2','3')");
      // V7: índices
      ok('B51 V7: índices novos das consultas da Rotina', sql("select count(*) from pg_indexes where indexname in ('parcelas_pa_pago_venc','parcelas_abertas_venc','parcelamentos_grupo','tarefas_serie_prazo')") === '4');
      // V1 + V3: Planilha abre com esqueleto e UMA consulta enxuta (sem baixar parcelas uma a uma)
      await nav(p, 'hoje'); reqs.length = 0;
      await p.evaluate(() => { GS.E.rt = Object.assign(GS.E.rt || {}, { aba: 'planilha' }); nav(null, 'rotina'); });
      const esq = await p.evaluate(() => !!document.querySelector('#rt-corpo .rt-esq .esq'));
      await p.waitForSelector('#rt-corpo .pl-card:not(.rt-esq) .pl-bloco', { timeout: 10000 });
      ok('B51 V3: a Planilha aparece na hora com o esqueleto cinza no lugar dos números', esq);
      ok('B51 V1: Planilha usa uma consulta só (rotina_parcelas_json), sem baixar a tabela de parcelas', reqs.filter((x) => /rpc\/rotina_parcelas_json/.test(x)).length === 1 && !reqs.some((x) => /^GET parcelas\?/.test(x)), reqs.join(' ; '));
      ok('B51 V3: desenha só o grupo aberto', await p.evaluate(() => { const g = document.querySelector('.pl-aba.ativo').dataset.plG; return [...document.querySelectorAll('#rt-corpo .pl-bloco')].length > 0 && document.querySelectorAll('.pl-aba').length >= 1 && !!g; }));
      // V2: trocar de aba não busca de novo; "↻ Atualizar" busca
      reqs.length = 0;
      await p.click('#rt-abas [data-rt-aba=guias]'); await p.waitForSelector('#rt-corpo .ep-tela:not(.rt-esq)');
      await p.click('#rt-abas [data-rt-aba=planilha]'); await p.waitForSelector('#rt-corpo .pl-card:not(.rt-esq) .pl-bloco');
      ok('B51 V2: trocar entre "Guias do mês" e "Planilha" não busca de novo', !reqs.some((x) => /rotina_parcelas_json/.test(x)), reqs.join(' ; '));
      await p.click('#pl-atu'); await p.waitForTimeout(1200);
      ok('B51 V2: "↻ Atualizar" busca tudo de novo', reqs.filter((x) => /rotina_parcelas_json/.test(x)).length === 1);
      // R1: placar do mês
      await p.waitForSelector('#rt-placar .rt-pl-it:not(.rt-pl-esq)', { timeout: 8000 }).catch(() => {});
      ok('B51 R1: placar do mês com 4 números (guias, pagamentos, passivo, processos)', (await p.$$('#rt-placar .rt-pl-it')).length === 4 && /guias enviadas/.test(await p.textContent('#rt-placar')) && /processos conferidos/.test(await p.textContent('#rt-placar')));
      // V4: Pago na hora, sem pergunta, com Desfazer
      await p.click('.pl-aba[data-pl-g="Grupo Alfa"]').catch(() => {}); await p.waitForTimeout(300);
      const id2 = sql("select id from parcelas where parcelamento_id='" + paB + "' and numero='2'");
      dialogos.length = 0;
      const mudou = await p.evaluate((id) => { document.querySelector('[data-pl-p="' + id + '"]').click(); return !document.querySelector('[data-pl-p="' + id + '"]'); }, id2);
      await p.waitForTimeout(1500);
      ok('B51 V4: "Pago" muda a tela no clique (sem a pergunta de confirmação) e grava por trás', mudou && !dialogos.length && sql("select pago from parcelas where id='" + id2 + "'") === 't', dialogos.join('|'));
      ok('B51 V4: rodapé com "Desfazer"', await p.isVisible('#gx-rodape .gx-rod-bt'));
      ok('B51 V5: depois da baixa, só Parcelamentos fica "a atualizar" (sem recarregar o ERP inteiro)', await p.evaluate(() => !!(window.ERP_SUJO && window.ERP_SUJO.parcelamentos) && !window.ERP_DADOS_SUJOS));
      await p.click('#gx-rodape .gx-rod-bt'); await p.waitForTimeout(1500);
      ok('B51 V4: "Desfazer" volta a parcela para em aberto (tela e banco)', sql("select pago from parcelas where id='" + id2 + "'") === 'f' && !!(await p.$('[data-pl-p="' + id2 + '"]')));
      // V4: erro → a tela volta e mostra o motivo
      await p.route(/\/rest\/v1\/parcelas/, (rota) => rota.request().method() === 'PATCH' ? rota.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'falha simulada B51' }) }) : rota.continue());
      await p.click('[data-pl-p="' + id2 + '"]'); await p.waitForTimeout(1200);
      ok('B51 V4: se der erro, a parcela volta ao estado anterior e o motivo aparece', !!(await p.$('[data-pl-p="' + id2 + '"]')) && /falha simulada B51/.test((await p.textContent('#toast').catch(() => '')) + (await p.textContent('#gs-raiz #aviso').catch(() => ''))) && sql("select pago from parcelas where id='" + id2 + "'") === 'f');
      await p.unroute(/\/rest\/v1\/parcelas/);
      // V4: Emitida na hora
      const mudouE = await p.evaluate((id) => { const b = document.querySelector('[data-pl-e="' + id + '"]'); b.click(); const n = document.querySelector('[data-pl-e="' + id + '"]'); return n && /✓/.test(n.textContent); }, id2);
      await p.waitForTimeout(1200);
      ok('B51 V4: "Emitida" muda a tela no clique e grava por trás', mudouE && sql("select emitida_em is not null from parcelas where id='" + id2 + "'") === 't');
      // V5: abrir o Painel não recarrega; abrir Parcelamentos relê só os parcelamentos
      await p.evaluate((id) => document.querySelector('[data-pl-p="' + id + '"]').click(), id2); await p.waitForTimeout(1500);
      reqs.length = 0; await nav(p, 'resumo'); await p.waitForTimeout(800);
      const noPainel = reqs.slice();
      await nav(p, 'parcelamentos'); await p.waitForTimeout(2500);
      ok('B51 V5: abrir o Painel não recarrega nada; abrir Parcelamentos relê SÓ os parcelamentos (com a baixa)', !noPainel.some((x) => /^GET (clientes|processos|lancamentos|parcelas)\?/.test(x)) &&
        reqs.some((x) => /^POST rpc\/parcelamentos_json/.test(x)) && !reqs.some((x) => /^GET (clientes|processos|lancamentos)\?/.test(x)) &&
        await p.evaluate(() => (DB.parcelamentos.find((x) => x.numero === '777') || {}).parcelasPagas >= 2), noPainel.join(' ; ') + ' || ' + reqs.join(' ; '));
      sql("update parcelas set pago=false, data_pagamento=null, emitida_em=null, emissao='' where id='" + id2 + "'");
      // R3: clicar na parcela da Planilha abre o mesmo cartão de envio; "Pago" no cartão depois do vencimento
      await p.evaluate(() => { GS.E.rt.aba = 'planilha'; nav(null, 'rotina'); }); await p.waitForSelector('#rt-corpo .pl-card:not(.rt-esq) .pl-bloco');
      await p.click('.pl-aba[data-pl-g="Grupo Alfa"]').catch(() => {}); await p.waitForTimeout(300);
      await p.click('tr[data-pl-x="' + id2 + '"] td:nth-child(2)'); await p.waitForSelector('#rt-corpo .ep-card', { timeout: 8000 }).catch(() => {});
      ok('B51 R3: clicar na parcela da Planilha abre o cartão de envio daquela guia', /Parcela: 2 de/.test(await p.textContent('#rt-corpo .ep-card-body').catch(() => '')) && await p.evaluate(() => GS.E.rt.aba === 'guias'));
      ok('B53: o cartão da notificação não tem mais a linha "Pagamento"', !(await p.$('#rt-corpo .ep-pagos')) && !/Pagamento:/.test(await p.textContent('#rt-corpo .ep-card')));
      sql("update parcelas set pago=false, data_pagamento=null where id='" + id2 + "'");
      // R4: conferir o grupo todo
      await p.click('#rt-abas [data-rt-aba=passivo]'); await p.waitForSelector('#rt-pas-corpo [data-conf-grp]', { timeout: 10000 });
      const nConf = Number(sql("select count(*) from rotina_conferencias where area='passivo' and not alterou"));
      await p.click('#rt-pas-corpo tr.rt-grp:has-text("Grupo Alfa") [data-conf-grp]'); await p.waitForTimeout(1500);
      ok('B51 R4: Passivo → "✓ Conferir o grupo todo" marca todas as empresas do grupo, sem alteração', Number(sql("select count(*) from rotina_conferencias where area='passivo' and not alterou")) >= nConf + 2 &&
        sql("select count(distinct registro_id) from rotina_conferencias r join clientes c on c.id=r.registro_id join grupos g on g.id=c.grupo_id where g.nome='Grupo Alfa' and r.quando > now() - interval '1 minute'") === sql("select count(*) from clientes c join grupos g on g.id=c.grupo_id where g.nome='Grupo Alfa'"));
      await p.click('#rt-abas [data-rt-aba=processos]'); await p.waitForSelector('#rt-proc-corpo [data-conf-pgrp]', { timeout: 10000 });
      await p.click('#rt-proc-corpo [data-conf-pgrp] >> nth=0'); await p.waitForTimeout(2000);
      ok('B51 R4: Processos → "✓ Conferir o grupo todo" registra "sem novidade" nos processos do grupo', Number(sql("select count(*) from processo_movimentacoes where tipo='sem_novidade' and criado_em > now() - interval '1 minute'")) >= 1);
      // T1: regra de repetição no formulário (toda segunda)
      await nav(p, 'tarefas'); await p.waitForTimeout(800);
      await p.evaluate(() => GS.formTarefa({})); await p.waitForSelector('#tf-rep');
      await p.fill('#f-tf [name=titulo]', 'Conferir caixa B51'); await p.selectOption('#f-tf [name=responsavel]', { label: 'Pedro Castro' }).catch(() => p.selectOption('#f-tf [name=responsavel]', { index: 1 }));
      await p.selectOption('#tf-rep-tipo', 'semanal');
      await p.evaluate(() => document.querySelectorAll('#tf-rep [data-rep-dia]').forEach((c) => { c.checked = c.dataset.repDia === '1'; c.dispatchEvent(new Event('change', { bubbles: true })); }));
      await p.waitForTimeout(300);
      const txtRep = await p.textContent('#tf-rep-txt');
      ok('B51 T3: a regra aparece por extenso ("↻ toda segunda, a partir de …") com as próximas datas', /↻ toda segunda, a partir de \d{2}\/\d{2}/.test(txtRep) && /Próximas:/.test(txtRep), txtRep);
      await p.click('#btn-salvar-tf'); await p.waitForTimeout(2000);
      const prox1 = sql("select (recorrencia_proximas(jsonb_build_object('tipo','semanal','dias',jsonb_build_array(1),'inicio',current_date), current_date - 1, 1))[1]");
      ok('B51 T1: "toda segunda" grava a regra (recorrencia_regra) e o prazo cai na segunda certa', sql("select recorrencia_regra->>'tipo'||'|'||(recorrencia_regra->'dias')::text||'|'||prazo||'|'||recorrencia from tarefas where titulo='Conferir caixa B51' order by prazo limit 1") === 'semanal|[1]|' + prox1 + '|regra');
      // T1: a prévia do formulário dá as mesmas datas do banco (2× ao mês, 5º dia útil, última sexta, a cada 2 semanas, com feriado)
      { const regras = [{ tipo: 'mensal_dias', dias: [5, 20], util: true }, { tipo: 'mensal', modo: 'util', n: 5 }, { tipo: 'mensal', modo: 'semana', ordem: -1, dow: 5 }, { tipo: 'semanal', dias: [1, 4], cada: 2 }, { tipo: 'anual', mes: 2, dia: 30 }, { tipo: 'mensal', modo: 'dia', dia: 31 }];
        sql("insert into feriados(data,nome) values (current_date + 20, 'Feriado B51') on conflict do nothing");
        await p.evaluate(() => { GS.E._feriados = null; });
        const js = await p.evaluate(async (L) => { const h = new Date(); const ini = h.getFullYear() + '-' + String(h.getMonth() + 1).padStart(2, '0') + '-' + String(h.getDate()).padStart(2, '0');
          const fs = await SB.from('feriados').select('data'); const fer = new Set((fs.data || []).map((f) => f.data));
          return L.map((r) => GS.proximasDatas(Object.assign({ inicio: ini }, r), ini, 8, fer).join(',')); }, regras);
        const sqlD = regras.map((r) => sql("select array_to_string(recorrencia_proximas('" + JSON.stringify(r) + "'::jsonb || jsonb_build_object('inicio', current_date), current_date, 8), ',')"));
        ok('B51 T1: as datas da regra (2× ao mês com feriado, 5º dia útil, última sexta, a cada 2 semanas, 30/02, dia 31) são as mesmas na tela e no banco', JSON.stringify(js) === JSON.stringify(sqlD), JSON.stringify(js) + ' ≠ ' + JSON.stringify(sqlD));
        ok('B51 T1: textos por extenso', await p.evaluate(() => [GS.textoRegra({ tipo: 'mensal_dias', dias: [5, 20] }), GS.textoRegra({ tipo: 'mensal', modo: 'util', n: 5 }), GS.textoRegra({ tipo: 'mensal', modo: 'semana', ordem: -1, dow: 5 }), GS.textoRegra({ tipo: 'semanal', dias: [1, 4], cada: 2 })].join('|')) ===
          '2× ao mês, nos dias 5 e 20|todo mês no 5º dia útil|toda última sexta do mês|a cada 2 semanas, na segunda e quinta'); }
      ok('B51 T1: as tarefas antigas (semanal/mensal/anual) continuam com a regra delas', await p.evaluate(() => GS.textoRegra(GS.regraDaTarefa({ recorrencia: 'mensal', prazo: '2026-03-15' })) === 'todo mês no dia 15, a partir de 15/03/2026'.replace('/2026', new Date().getFullYear() === 2026 ? '' : '/2026')));
      // T2: as próximas ocorrências aparecem no calendário (tracejadas) e no Google Agenda, sem duplicar
      const mesProj = sql("select to_char((d->'datas'->>0)::date, 'YYYY-MM') from jsonb_array_elements(recorrencias_projecao(8)) d where d->>'titulo'='Conferir caixa B51'");
      await nav(p, 'tarefas'); await p.evaluate((m) => { GS.E.tf.vista = 'calendario'; GS.E.tf.calVista = 'mes'; GS.E.tf.mes = m; }, mesProj); await nav(p, 'tarefas'); await p.waitForTimeout(1500);
      const nProj = sql("select jsonb_array_length(d->'datas') from jsonb_array_elements(recorrencias_projecao(8)) d where d->>'titulo'='Conferir caixa B51'");
      ok('B51 T2: o banco projeta 8 próximas datas depois da última tarefa real (sem duplicar)', nProj === '8' &&
        sql("select count(*) from jsonb_array_elements(recorrencias_projecao(8)) d, jsonb_array_elements_text(d->'datas') x where d->>'titulo'='Conferir caixa B51' and x::date in (select prazo from tarefas where titulo='Conferir caixa B51')") === '0');
      ok('B51 T2: o calendário mostra as próximas ocorrências (tracejadas)', (await p.$$('#panel-tarefas .cal-tf.ag-prevista')).length >= 1);
      { const tok = sql("select token from agenda_links where usuario_id=(select id from perfis where email='pedro@teste') limit 1");
        const ics = tok ? await (await p.request.get(BASE + '/functions/v1/erp-agenda?t=' + tok)).text() : '';
        ok('B51 T2: o Google Agenda (erp-agenda) recebe as próximas ocorrências', (ics.match(/UID:serie-/g) || []).length >= 8 && /↻ .*Conferir caixa B51/.test(ics), ics.slice(0, 200)); }
      ok('B51 T2: concluir não é preciso — a ocorrência da semana nasce sozinha (rotina diária) e não repete', sql("select recorrencias_em_dia() >= 0") === 't' &&
        sql("select count(*) = count(distinct prazo) from tarefas where titulo='Conferir caixa B51'") === 't');
      // T3: editar → "só esta" / "esta e as próximas"
      const tId = sql("select id from tarefas where titulo='Conferir caixa B51' order by prazo limit 1");
      sql("select recorrencia_garantir(recorrencia_serie) from tarefas where id='" + tId + "'");
      sql("insert into tarefas (titulo, responsavel, prazo, recorrencia, recorrencia_regra, recorrencia_serie) select titulo, responsavel, prazo + 7, 'regra', recorrencia_regra, recorrencia_serie from tarefas where id='" + tId + "' on conflict do nothing");
      await p.evaluate((id) => GS.abrirTarefa(id), tId); await p.waitForSelector('#tf-f-editar'); await p.waitForTimeout(300);
      ok('B51 T3: o detalhe da tarefa mostra a regra por extenso', /↻ toda segunda, a partir de/.test(await p.textContent('#gs-raiz .janela')));
      await p.click('#tf-f-editar'); await p.waitForSelector('#f-tf'); await p.fill('#f-tf [name=titulo]', 'Conferir caixa B51 (nova)'); await p.click('#btn-salvar-tf');
      await p.waitForSelector('#tf-serie-prox', { timeout: 5000 }).catch(() => {});
      ok('B51 T3: ao editar, pergunta "só esta" ou "esta e as próximas"', !!(await p.$('#tf-serie-esta')) && !!(await p.$('#tf-serie-prox')));
      await p.click('#tf-serie-prox'); await p.waitForTimeout(2000);
      ok('B51 T3: "esta e as próximas" muda esta e as seguintes (cada uma com a própria data)', sql("select count(*) from tarefas where titulo='Conferir caixa B51 (nova)'") === sql("select count(*) from tarefas where recorrencia_serie=(select recorrencia_serie from tarefas where id='" + tId + "') and status not in ('concluida','cancelada')") &&
        Number(sql("select count(*) from tarefas where titulo='Conferir caixa B51 (nova)'")) >= 2);
      await p.evaluate((id) => GS.abrirTarefa(id), tId); await p.waitForSelector('#tf-f-editar'); await p.click('#tf-f-editar'); await p.waitForSelector('#f-tf');
      await p.fill('#f-tf [name=titulo]', 'Só esta B51'); await p.click('#btn-salvar-tf'); await p.waitForSelector('#tf-serie-esta'); await p.click('#tf-serie-esta'); await p.waitForTimeout(1500);
      ok('B51 T3: "só esta" muda só a tarefa aberta', sql("select count(*) from tarefas where titulo='Só esta B51'") === '1' && Number(sql("select count(*) from tarefas where titulo='Conferir caixa B51 (nova)'")) >= 1);
      await p.evaluate(() => { while (document.querySelector('#janelas .fundo')) GS.fecharJanela(); });
      // E1–E4: e-mail
      await nav(p, 'admin'); await p.waitForSelector('#adm-abas'); await p.click('#adm-abas [data-aba=email]'); await p.waitForSelector('#em-abas'); await p.click('#em-abas [data-em-aba=config]'); await p.waitForSelector('.em-passo');
      ok('B51 E1: Configuração em 3 passos (Contas que enviam · Dados para pagamento · Testar), Escritório e Contabilidade lado a lado', (await p.$$eval('.em-passo .card-hd', (l) => l.map((x) => x.textContent))).join('|').replace(/\s+/g, ' ').match(/1Contas que enviam.*\|2Dados para pagamento.*\|3Testar/) &&
        !!(await p.$('.em-passo #f-email')) && !!(await p.$('.em-passo #f-email-ct')) && !!(await p.$('.em-passo #f-pag')) && !!(await p.$('.em-passo #f-pag-ct')));
      ok('B51 E2: Gmail é o padrão; SMTP/Resend ficam no "Avançado" fechado', await p.evaluate(() => document.querySelector('#f-email [name=provedor]').value === 'gmail' && !document.querySelector('#f-email .em-avancado').open && !document.querySelector('#f-email [name=host]').offsetParent));
      ok('B51 E3: botões técnicos dentro de "⋯ Ferramentas"', !(await p.isVisible('#email-diag')) && !(await p.isVisible('#email-agora')) && !(await p.isVisible('#email-resumo')));
      await p.click('#em-ferr-bt'); ok('B51 E3: "⋯ Ferramentas" abre com Verificar funções, Enviar fila agora e Resumo do dia', await p.isVisible('#email-diag') && await p.isVisible('#email-agora') && await p.isVisible('#email-resumo'));
      await p.click('#em-ferr-bt');
      ok('B51 E1: "Testar" é um botão só e o check-list fica no passo 3', !!(await p.$('.em-passo #email-testar')) && !!(await p.$('.em-passo #email-check-bd')));
      sql("insert into email_fila (para, assunto, html, status, erro, tipo, referencia) values ('erro.b51@teste.com', 'E-mail com erro B51', '<p>oi B51</p>', 'erro', 'Invalid login', 'manual', 'b51-erro')");
      await p.click('#em-abas [data-em-aba=saida]'); await p.waitForSelector('.em-saida');
      ok('B51 E4: Caixa de saída com os filtros Para revisar · Na fila · Enviados · Com erro', /Para revisar.*Na fila.*Enviados.*Com erro/.test((await p.textContent('.em-saida-f')).replace(/\s+/g, ' ')) && !!(await p.$('#em-revisar')));
      await p.click('.em-saida-f [data-saida-f=erro]'); await p.waitForSelector('.em-saida-tab');
      ok('B51 E4: "Com erro" lista o e-mail com 👁 prévia e "tentar de novo"', /E-mail com erro B51/.test(await p.textContent('.em-saida-tab')) && !!(await p.$('.em-saida-tab [data-em-tentar]')) && !!(await p.$('.em-saida-tab [data-em-ver]')));
      await p.click('.em-saida-tab [data-em-ver]'); await p.waitForSelector('iframe.em-previa'); await p.waitForTimeout(300);
      ok('B51 E4: 👁 mostra a prévia do e-mail', /oi B51/.test(await p.evaluate(() => document.querySelector('iframe.em-previa').srcdoc)));
      await p.evaluate(() => { while (document.querySelector('#janelas .fundo')) GS.fecharJanela(); });
      await p.click('.em-saida-tab [data-em-tentar]'); await p.waitForTimeout(2500);
      ok('B51 E4: "tentar de novo" volta o e-mail para a fila (e tenta enviar)', sql("select status from email_fila where referencia='b51-erro'") !== 'erro', sql("select status||' '||erro from email_fila where referencia='b51-erro'"));
      await foto(p, 'b51-email-saida');
      p.off('request', ouvir); p.off('dialog', contaDialogo); }
    // ── Backup 52 ──
    { const reqs = []; const ouvir = (q) => reqs.push(q.method() + ' ' + q.url().replace(/^.*\/rest\/v1\//, '')); p.on('request', ouvir);
      // C1: Início com Lista · Semana · Mês; a Semana é a mesma de Tarefas (arrastar remarca) e a escolha fica guardada
      sql("insert into tarefas(titulo,responsavel,prazo) values ('Arrastar B52','Pedro',current_date)");
      await nav(p, 'hoje'); await p.waitForTimeout(1200);
      await p.click('#panel-hoje [data-fila-vista=semana]'); await p.waitForSelector('#ini-semana .sm-grade', { timeout: 8000 }).catch(() => {});
      ok('B52 C1: Início → Semana mostra a mesma semana de Tarefas (colunas Seg a Sex, atrasadas ao lado)', (await p.$$('#ini-semana .sm-col[data-dia]')).length >= 5 && !!(await p.$('#ini-semana .fila-atrasadas')));
      { const card = await p.$('#ini-semana .sm-card:has-text("Arrastar B52")');
        const destino = await p.evaluate(() => { const cs = [...document.querySelectorAll('#ini-semana .sm-col[data-dia]')].filter((c) => c.dataset.dia !== 'sem' && !c.classList.contains('sm-hoje')); return cs.length ? cs[cs.length - 1].dataset.dia : ''; });
        if (card && destino) { await p.evaluate((d) => { const c = [...document.querySelectorAll('#ini-semana .sm-card')].find((x) => /Arrastar B52/.test(x.textContent)), col = document.querySelector('#ini-semana .sm-col[data-dia="' + d + '"]'), dt = new DataTransfer();
          c.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true })); col.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
          col.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }, destino); await p.waitForTimeout(1500); }
        ok('B52 C1: arrastar a tarefa para outro dia remarca o prazo', !!card && !!destino && sql("select prazo from tarefas where titulo='Arrastar B52'") === destino, destino + ' / ' + sql("select prazo from tarefas where titulo='Arrastar B52'")); }
      ok('B52 C1: a escolha (Semana) fica guardada por pessoa', sql("select preferencias->'fila'->>'vista' from perfis where email='pedro@teste'") === 'semana');
      // C3: a Lista acompanha o conteúdo (sem espaço vazio embaixo)
      await p.click('#panel-hoje [data-fila-vista=lista]'); await p.waitForTimeout(1200);
      ok('B52 C3: Início → Lista sem espaço vazio embaixo (o quadro encolhe com poucos itens)', await p.evaluate(() => { const bd = document.querySelector('#panel-hoje .ini-fila > .card-bd'); if (!bd) return false;
        const fim = Math.max(...[...bd.children].map((c) => c.getBoundingClientRect().bottom)); return bd.getBoundingClientRect().bottom - fim <= 40 && !bd.style.height; }));
      await p.click('#panel-hoje [data-fila-vista=mes]'); await p.waitForTimeout(800);
      // C4/P3: sem borda azul nos grupos; cabeçalho de grupo igual ao de Clientes
      await nav(p, 'processos'); await p.waitForTimeout(1500);
      const grpProc = await p.evaluate(() => { const td = document.querySelector('#panel-processos tr.gx-grp > td'); if (!td) return null; const c = getComputedStyle(td); return [c.backgroundColor, c.boxShadow, c.fontSize].join('|'); });
      await nav(p, 'clientes'); await p.waitForTimeout(1500);
      const grpCli = await p.evaluate(() => { const td = document.querySelector('#panel-clientes tr.cli-grp > td'); if (!td) return null; const c = getComputedStyle(td); return [c.backgroundColor, c.boxShadow, c.fontSize].join('|'); });
      ok('B52 C4: Processos sem borda azul; o cabeçalho de grupo é a mesma faixa cinza de Clientes', !!grpProc && grpProc === grpCli && /\|none\|/.test(grpProc) && !(await p.evaluate(() => !!document.querySelector('.gc-ini,.gc-in,.gc-fim'))), grpProc + ' ≠ ' + grpCli);
      // P1: o filtro é a mesma pílula em todas as telas
      const pilula = async (tela, sel) => { await nav(p, tela); await p.waitForTimeout(1200); return p.evaluate((s2) => { const b = document.querySelector(s2); if (!b) return null; const c = getComputedStyle(b); return [c.backgroundColor, c.color, c.borderRadius, c.fontSize].join('|'); }, sel); };
      const pIni = await pilula('hoje', '#panel-hoje .fila-chips .fila-chip.ativo'), pPai = await pilula('resumo', '#panel-resumo .gx-seg-cli > button.ativo'),
        pCli = await pilula('clientes', '#panel-clientes .filtros .segmento > button.ativo');
      ok('B52 P1: o filtro escolhido tem o mesmo desenho no Início, no Painel e em Clientes', !!pIni && pIni === pPai && pIni === pCli, [pIni, pPai, pCli].join(' / '));
      // P4: situações com a mesma cor (Financeiro e Parcelamentos)
      await nav(p, 'parcelamentos'); await p.waitForTimeout(1500);
      const sitParc = await p.evaluate(() => { const e = document.querySelector('#panel-parcelamentos [data-sit=atraso]'); return e ? getComputedStyle(e).backgroundColor : null; });
      ok('B52 P4: situação "em atraso" com data-sit e a cor única (Parcelamentos = a pílula padrão)', !!sitParc && sitParc === await p.evaluate(() => { const s2 = document.createElement('span'); s2.className = 'pill'; s2.dataset.sit = 'atraso'; document.querySelector('#panel-parcelamentos').appendChild(s2); const c = getComputedStyle(s2).backgroundColor; s2.remove(); return c; }), sitParc);
      // C5: Publicações — "Buscar agora" pelo navegador, sem o botão duplicado
      await nav(p, 'publicacoes'); await p.waitForSelector('#pub-buscar');
      ok('B52 C5: Publicações sem o botão separado "Buscar pelo navegador"', !(await p.$('#pub-nav')));
      sql("delete from publicacoes where parte_monitorada='BETA SERVICOS LTDA'"); reqs.length = 0;
      await p.evaluate((b) => { window.ERP_DJEN_API = b + '/__teste/djen'; }, BASE); await p.click('#pub-buscar'); await p.waitForTimeout(3000);
      ok('B52 C5: "Buscar agora" busca pelo navegador e traz as publicações novas', sql("select count(*) from publicacoes where parte_monitorada='BETA SERVICOS LTDA'") === '1' &&
        reqs.some((x) => /rpc\/registrar_busca_publicacoes/.test(x)) && /Busca feita/.test(await p.textContent('#gs-raiz #aviso')), reqs.join(' ; '));
      // C6/C7: código PIX na parcela do acordo e texto genérico
      const acB = sql("select id from acordos where credor='Carlos Credor' limit 1");
      sql("update acordos set pix='chave@credor.teste', pix_codigo='', forma_pagamento='boleto', pago=false where id='" + acB + "'");
      await p.evaluate(() => { window.__copiado = ''; navigator.clipboard.writeText = (t) => { window.__copiado = t; return Promise.resolve(); }; });
      await p.evaluate((id) => window.GS.gerarGuias('acordos', { ids: [id] }), acB); await p.waitForSelector('#gs-raiz .ge-janela'); await p.waitForTimeout(500);
      ok('B52 C6: cada parcela de acordo tem o campo "Código PIX (copia e cola)"', !!(await p.$('#gs-raiz .ge-it .ge-pix')));
      await p.click('#gs-raiz #ge-copiar'); await p.waitForTimeout(800);
      { const t = await p.evaluate(() => window.__copiado);
        ok('B52 C6/C7: sem código, o texto usa a chave PIX do acordo (mesmo com boleto) e é genérico (sem "da Fulano")', /Seguem as parcelas de acordo com vencimento neste mês ou em atraso\./.test(t) && /PIX: chave@credor\.teste/.test(t) && !/acordos da /.test(t) && /\*Acordo para pagamento\*/.test(t), t); }
      await p.fill('#gs-raiz .ge-it .ge-pix', '00020126580014br.gov.bcb.pix0136B52CODIGO');
      await p.click('#gs-raiz #ge-copiar'); await p.waitForTimeout(800);
      { const t = await p.evaluate(() => window.__copiado);
        ok('B52 C6: o código copia e cola entra no texto e fica gravado na parcela', /PIX: 00020126580014br\.gov\.bcb\.pix0136B52CODIGO/.test(t) && sql("select pix_codigo from acordos where id='" + acB + "'") === '00020126580014br.gov.bcb.pix0136B52CODIGO', t); }
      await p.evaluate(() => { while (document.querySelector('#janelas .fundo')) GS.fecharJanela(); });
      ok('B52 C6: o e-mail mostra o código na caixa "Como pagar"', /Como pagar[^]*PIX \(copia e cola\)[^]*B52CODIGO/.test(sql("select guias_texto_html('Oi', '[{\"pix\":\"B52CODIGO\",\"pix_codigo\":true}]')")));
      // P2: "↻ Atualizar" igual e no cabeçalho do quadro
      await p.evaluate(() => { GS.E.rt = Object.assign(GS.E.rt || {}, { aba: 'guias' }); nav(null, 'rotina'); }); await p.waitForSelector('#rt-corpo .ep-tela:not(.rt-esq)', { timeout: 10000 }).catch(() => {});
      const atuG = await p.evaluate(() => { const b = document.querySelector('#rt-corpo .card-hd .bt-atualizar'); return b ? getComputedStyle(b).backgroundColor + '|' + b.textContent : null; });
      await p.click('#rt-abas [data-rt-aba=planilha]'); await p.waitForSelector('#rt-corpo .pl-card:not(.rt-esq)', { timeout: 10000 }).catch(() => {});
      const atuP = await p.evaluate(() => { const b = document.querySelector('#rt-corpo .card-hd .bt-atualizar'); return b ? getComputedStyle(b).backgroundColor + '|' + b.textContent : null; });
      ok('B52 P2: "↻ Atualizar" igual e à direita do cabeçalho em Guias do mês e Planilha', !!atuG && atuG === atuP, atuG + ' / ' + atuP);
      ok('B52 P4: a Planilha usa os textos únicos das situações (em atraso / a vencer / pago)', await p.evaluate(() => {
        const t = (k) => [...document.querySelectorAll('#rt-corpo button[data-sit="' + k + '"]')].map((x) => x.textContent.trim());
        return t('atraso').every((x) => x === 'em atraso') && t('avencer').every((x) => x === 'a vencer') && (t('atraso').length + t('avencer').length) > 0; }));
      // O2: Rotina → Processos com uma consulta só
      reqs.length = 0; await p.click('#rt-abas [data-rt-aba=processos]'); await p.waitForSelector('#rt-proc-corpo tr[data-pid]', { timeout: 10000 }).catch(() => {});
      ok('B52 O2: Rotina → Processos usa uma consulta só (sem baixar as movimentações)', reqs.some((x) => /rpc\/rotina_processos_json/.test(x)) && !reqs.some((x) => /^GET (processos|processo_movimentacoes)\?/.test(x)), reqs.join(' ; '));
      // O3: depois de um Pago, Parcelamentos relê só o parcelamento que mudou
      await p.click('#rt-abas [data-rt-aba=planilha]'); await p.waitForSelector('#rt-corpo .pl-card:not(.rt-esq) .pl-bloco', { timeout: 10000 }).catch(() => {});
      const idPg = await p.evaluate(() => { const b = document.querySelector('#rt-corpo [data-pl-p]'); return b && b.dataset.plP; });
      if (idPg) { await p.click('[data-pl-p="' + idPg + '"]'); await p.waitForTimeout(1500); }
      reqs.length = 0; await nav(p, 'parcelamentos'); await p.waitForTimeout(2000);
      ok('B52 O3: Parcelamentos depois de um Pago relê só o parcelamento que mudou (uma consulta)', !!idPg && reqs.some((x) => /rpc\/parcelamentos_json/.test(x)) && !reqs.some((x) => /^GET parcelas\?/.test(x)) &&
        await p.evaluate((id) => (DB.parcelamentos || []).some((pa) => (pa.parcelas || []).some((x) => x._id === id && x.pagamento === 'SIM')), idPg), reqs.join(' ; '));
      if (idPg) sql("update parcelas set pago=false, data_pagamento=null where id='" + idPg + "'");
      // O1: Clientes com a lista guardada abre sem esperar o banco
      await nav(p, 'clientes'); await p.waitForTimeout(800); await nav(p, 'resumo'); await p.waitForTimeout(500);
      await p.evaluate(() => GS.invalidarCadastros()); reqs.length = 0;
      const tCli = await p.evaluate(() => new Promise((ok2) => { const t0 = performance.now(); nav(null, 'clientes'); const f = () => document.querySelector('#panel-clientes tbody tr') ? ok2(Math.round(performance.now() - t0)) : requestAnimationFrame(f); f(); }));
      await p.waitForTimeout(1200);
      ok('B52 O1: Clientes aparece na hora com a lista guardada e atualiza por trás', tCli < 200 && reqs.some((x) => /^GET clientes\?/.test(x)), tCli + ' ms');
      p.off('request', ouvir); }
    // ══════════ Backup 53 (cliques reais) ══════════
    { const fecharTudo = async () => { for (let i = 0; i < 4; i++) { const f = await p.$('#gs-raiz .fundo [data-cancelar]'); if (!f) break; await f.click().catch(() => {}); await p.waitForTimeout(200); } };
      await fecharTudo();
      // Início: a fila tem os MESMOS filtros de Tarefas (prioridade e prazo) e a escolha fica guardada
      await nav(p, 'hoje'); await p.waitForSelector('#panel-hoje [data-fila-pri]', { timeout: 10000 }).catch(() => {});
      ok('B53 Início: fila com Alta/Média/Baixa e Hoje/Atrasadas/7 dias (como em Tarefas)', (await p.$$('#panel-hoje [data-fila-pri]')).length === 3 && (await p.$$('#panel-hoje [data-fila-prazo]')).length === 3);
      await p.click('#panel-hoje [data-fila-pri=alta]'); await p.waitForTimeout(1200);
      ok('B53 Início: escolher "Alta" filtra a fila e fica guardado', sql("select preferencias->'fila'->>'pri' from perfis where email='pedro@teste'") === 'alta' && !!(await p.$('#panel-hoje [data-fila-pri=alta][aria-pressed=true]')));
      await p.click('#panel-hoje [data-fila-pri=alta]'); await p.waitForTimeout(800);
      // Tarefas: cartões acima da barra de vistas; Semana do tamanho do Mês
      await nav(p, 'tarefas'); await p.waitForSelector('#tf-kpis .kpis', { timeout: 10000 }).catch(() => {});
      ok('B53 Tarefas: os cartões (em aberto, atrasadas…) ficam acima de Lista/Calendário/Fluxos', await p.evaluate(() => { const k = document.querySelector('#tf-kpis .kpis'), v = document.querySelector('#tf-vista');
        return !!k && !!v && !!(k.compareDocumentPosition(v) & Node.DOCUMENT_POSITION_FOLLOWING); }));
      await p.click('#tf-vista [data-v=calendario]'); await p.waitForSelector('#tf-cal-corpo .tf-cal', { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(500);
      const hMes = await p.evaluate(() => (document.querySelector('#tf-cal-corpo .tf-cal') || {}).offsetHeight || 0);
      await p.click('#tf-cal-vista [data-cal-v=semana]'); await p.waitForSelector('#tf-cal-corpo .tf-sem', { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(400);
      const hSem = await p.evaluate(() => (document.querySelector('#tf-cal-corpo .tf-sem') || {}).offsetHeight || 0);
      ok('B53 Tarefas: a Semana fica do mesmo tamanho do Mês', hMes > 300 && hSem >= hMes - 4, hMes + ' / ' + hSem);
      await p.click('#tf-cal-vista [data-cal-v=mes]'); await p.click('#tf-vista [data-v=lista]'); await p.waitForTimeout(300);
      await p.click('#tf-nova'); await p.waitForSelector('#gs-raiz #tf-rep-tipo');
      ok('B53 Tarefas: repetir "Quinzenal" e "Todo dia útil"', await p.evaluate(() => { const o = [...document.querySelectorAll('#gs-raiz #tf-rep-tipo option')].map((x) => x.value); return o.includes('quinzenal') && o.includes('uteis'); }));
      await p.selectOption('#gs-raiz #tf-rep-tipo', 'quinzenal'); await p.waitForTimeout(200);
      ok('B53 Tarefas: quinzenal = a cada 2 semanas', /a cada 2 semanas/.test(await p.textContent('#gs-raiz #tf-rep-txt')));
      await fecharTudo();
      // Painel: faixa por grupo (nome + nº de empresas), como em Clientes
      await nav(p, 'resumo'); await p.waitForSelector('#tblExecRanking tr', { timeout: 10000 }).catch(() => {}); await p.waitForTimeout(600);
      ok('B53 Painel: "Empresas do grupo" com a faixa do grupo e o nº de empresas', await p.evaluate(() => [...document.querySelectorAll('#tblExecRanking tr.gx-grp')].some((t) => /GRUPO ALFA|Grupo Alfa/i.test(t.textContent) && /empresa/.test(t.textContent))));
      // Acordos: alterar o acordo inteiro
      const idsAc = sql("select string_agg(id::text, ',') from acordos where credor='Carlos Credor'").split(',').filter(Boolean);
      await p.evaluate((ids) => GS.editarAcordo(ids), idsAc); await p.waitForSelector('#gs-raiz #f-acordo-todo');
      await p.fill('#gs-raiz #f-acordo-todo [name=banco]', 'Banco B53'); await p.selectOption('#gs-raiz #f-acordo-todo [name=alcance]', 'todas');
      await salvarGs(p, '#ac-todo-ok');
      ok('B53 Acordos: "Alterar o acordo inteiro" muda todas as parcelas de uma vez', idsAc.length > 0 && sql("select count(*) from acordos where credor='Carlos Credor' and banco='Banco B53'") === String(idsAc.length));
      // Execuções: cadastrar, registrar recebimento → honorário no Financeiro
      await nav(p, 'execucoes'); await p.waitForSelector('#ex-nova', { timeout: 10000 });
      ok('B53 Execuções: no menu Jurídico', await p.evaluate(() => !!document.querySelector('#tn [data-ir=execucoes]')));
      await p.click('#ex-nova'); await p.waitForSelector('#gs-raiz #f-exec');
      await p.selectOption('#gs-raiz #f-exec [name=cliente_id]', { label: 'Beta Serviços Ltda · Grupo Beta' });
      await p.fill('#gs-raiz #f-exec [name=numero]', '5000999-00.2026.8.13.0001'); await p.fill('#gs-raiz #f-exec [name=executado]', 'Devedor B53 Ltda');
      await p.fill('#gs-raiz #f-exec [name=valor_execucao]', '20.000,00'); await p.fill('#gs-raiz #f-exec [name=percentual]', '20');
      await salvarGs(p, '#ex-salvar');
      ok('B53 Execuções: cadastra a execução', sql("select percentual::int||'|'||valor_execucao::int from execucoes where executado='Devedor B53 Ltda'") === '20|20000');
      await p.click('#panel-execucoes tr[data-ex]'); await p.waitForSelector('#gs-raiz #ex-receb');
      await p.click('#gs-raiz #ex-receb'); await p.waitForSelector('#gs-raiz #f-exr'); await p.fill('#gs-raiz #f-exr [name=valor]', '5.000,00'); await p.waitForTimeout(200);
      ok('B53 Execuções: a janela mostra o honorário antes de gravar (20% de 5.000)', /1\.000,00/.test(await p.textContent('#gs-raiz #exr-previa')));
      await p.click('#gs-raiz #exr-ok'); await p.waitForTimeout(1800);
      ok('B53 Execuções: o recebimento lança o honorário do escritório no Financeiro Jurídico', sql("select count(*) from lancamentos where categoria='Honorários de êxito' and valor=1000 and descricao like '%Devedor B53%'") === '1');
      await fecharTudo();
      // Contratos: implantação (não gera financeiro) + ligar lançamentos que já existem
      sql("insert into lancamentos (empresa, tipo, descricao, valor, vencimento, cliente_id) select 'escritorio','receita','Honorário antigo B53',700,current_date - 10, id from clientes where nome='Beta Serviços Ltda'");
      await nav(p, 'contratos'); await p.waitForTimeout(900);
      await p.click('#panel-contratos button:has-text("Novo contrato")'); await p.waitForSelector('#gs-raiz #f-ctr'); await p.waitForTimeout(300);
      await p.selectOption('#gs-raiz [name=cliente_id]', { label: 'Beta Serviços Ltda · Grupo Beta' });
      await p.click('#gs-raiz #ctr-mod [data-v=pontual]'); await p.fill('#gs-raiz [name=descricao]', 'Contrato B53 implantação');
      await p.fill('#gs-raiz [name=valor_total]', '6.000,00'); await p.fill('#gs-raiz [name=num_parcelas]', '6');
      await p.click('#gs-raiz #ctr-assin [data-v=implantacao]'); await p.click('#gs-raiz #btn-salvar-ctr'); await p.waitForSelector('#gs-raiz #vl-ok', { timeout: 10000 }).catch(() => {});
      ok('B53 Contratos: implantação grava o contrato SEM gerar lançamentos', sql("select sem_financeiro::text||'|'||status from contratos where descricao='Contrato B53 implantação'") === 'true|Ativo' &&
        sql("select count(*) from lancamentos l join contratos c on c.id=l.contrato_id where c.descricao='Contrato B53 implantação'") === '0');
      await p.click('#gs-raiz [data-vl]:near(:text("Honorário antigo B53"))').catch(async () => { await p.evaluate(() => { const tr = [...document.querySelectorAll('#gs-raiz tr')].find((x) => /Honorário antigo B53/.test(x.textContent)); if (tr) tr.querySelector('[data-vl]').click(); }); });
      await salvarGs(p, '#vl-ok');
      ok('B53 Contratos: "Ligar lançamentos" liga ao contrato os honorários que já existiam', sql("select count(*) from lancamentos l join contratos c on c.id=l.contrato_id where c.descricao='Contrato B53 implantação' and l.descricao='Honorário antigo B53'") === '1');
      await fecharTudo();
      // Rotina → Planilha: todos os parcelamentos do grupo numa linha só; a paga pode ser desmarcada
      await p.evaluate(() => { GS.E.rt.aba = 'planilha'; nav(null, 'rotina'); }); await p.waitForSelector('#rt-corpo .pl-card:not(.rt-esq) .pl-bloco', { timeout: 10000 }).catch(() => {});
      ok('B53 Rotina: a Planilha põe todos os parcelamentos do grupo numa linha só', (await p.$$('#rt-corpo .pl-linha')).length === 1);
      const idPg53 = sql("select x.id from parcelas x join parcelamentos pa on pa.id=x.parcelamento_id order by x.vencimento limit 1");
      sql("update parcelas set pago=true, data_pagamento=current_date where id='" + idPg53 + "'");
      await p.evaluate(() => GS.E.rt && (GS.E.rt._dados = null)); await p.click('#pl-atu').catch(() => {}); await p.waitForTimeout(1500);
      const temNp = await p.$('#rt-corpo [data-pl-np="' + idPg53 + '"]');
      if (temNp) { await temNp.click(); await p.waitForTimeout(1500); }
      ok('B53 Rotina: clicar na parcela paga desmarca o pagamento', !!temNp && sql("select pago from parcelas where id='" + idPg53 + "'") === 'f');
      // Administração → E-mail: grade cliente × tipo e "Da Rotina" na Caixa de saída
      await nav(p, 'admin'); await p.waitForSelector('#adm-abas'); await p.click('#adm-abas [data-aba=email]'); await p.waitForSelector('#em-abas'); await p.click('#em-abas [data-em-aba=quem]'); await p.waitForSelector('.em-quem');
      ok('B53 E-mail: Quem recebe no desenho de Clientes (faixa do grupo, nome sem azul) com os tipos de e-mail', (await p.$$('.em-quem tr.cli-grp')).length >= 1 && !(await p.$('.em-quem .lnk')) && (await p.$$('.em-quem thead th.em-t')).length === 6 && !(await p.$('.em-tipos')));
      const cliB = sql("select id from clientes where nome='Beta Serviços Ltda'");
      await p.click('.em-quem [data-em-tipo=acordo][data-em-tcli="' + cliB + '"]'); await p.waitForTimeout(1500);
      ok('B53 E-mail: ✕ num tipo (Acordo) para um cliente grava só aquele tipo', sql("select perfil_email||'|'||(emails_tipos->>'acordo')||'|'||(emails_tipos->>'lembrete') from clientes where id='" + cliB + "'") === 'personalizado|false|true');
      await p.click('#em-abas [data-em-aba=saida]'); await p.waitForSelector('.em-saida-f');
      ok('B53 E-mail: Caixa de saída com "Da Rotina" para autorizar os e-mails gerados na Rotina', !!(await p.$('.em-saida-f [data-saida-f=rotina]')));
      sql("update clientes set perfil_email='padrao', emails_tipos='{}' where id='" + cliB + "'");
    }
    // ── Backup 54: e-mails automáticos (equipe e clientes), + Lançar integrado, contatos das execuções ──
    {
      const fecharTudo = async () => { for (let i = 0; i < 4; i++) { const f = await p.$('#gs-raiz .fundo [data-cancelar], #gs-raiz .fundo [data-fechar]'); if (!f) break; await f.click().catch(() => {}); await p.waitForTimeout(200); } };
      await p.click('#em-abas [data-em-aba=auto]'); await p.waitForSelector('.em-auto [data-eq=fluxo]');
      ok('B54 E-mail: aba Automáticos com o aviso de fluxo já desligado', !(await p.isChecked('.em-auto [data-eq=fluxo]')) && (await p.$$('.em-auto [data-eq]')).length >= 8);
      await p.click('.em-auto [data-eq=mencao]'); await p.waitForTimeout(1200);
      ok('B54 E-mail: desligar "Menção" grava para o escritório todo', sql("select valor->>'mencao' from configuracoes where chave='emails_equipe'") === 'false');
      await p.click('.em-auto [data-eq=mencao]'); await p.waitForTimeout(1200);
      ok('B54 E-mail: e religar volta a valer', sql("select valor->>'mencao' from configuracoes where chave='emails_equipe'") === 'true');
      ok('B54 E-mail: os e-mails aos clientes também aparecem para ligar/desligar', (await p.$$('.em-auto [data-eq-regra]')).length >= 1);
      await fecharTudo();
      await lancar(p, 7); await p.waitForSelector('#gs-raiz #f-acordo-novo');
      await p.fill('#gs-raiz #f-acordo-novo [name=devedor]', 'Devedor B54'); await p.fill('#gs-raiz #f-acordo-novo [name=credor]', 'Credor B54');
      await p.fill('#gs-raiz #f-acordo-novo [name=processo]', '5000054-00.2026.8.13.0001'); await p.fill('#gs-raiz #f-acordo-novo [name=n]', '3');
      await p.fill('#gs-raiz #f-acordo-novo [name=valor]', '1.000,00'); await p.waitForTimeout(200);
      ok('B54 + Lançar: acordo inteiro mostra a prévia das parcelas', /3 parcelas/.test(await p.textContent('#gs-raiz #acn-previa')));
      await p.click('#gs-raiz #acn-ok'); await p.waitForTimeout(1500);
      ok('B54 + Lançar: o acordo inteiro grava as 3 parcelas mês a mês', sql("select count(*)||'|'||count(distinct date_trunc('month', vencimento)) from acordos where credor='Credor B54' and total_parcelas='3'") === '3|3');
      await fecharTudo();
      sql("insert into lancamentos (empresa, tipo, descricao, valor, vencimento, cliente_id) select 'escritorio','receita','Honorário B54 receber',321,current_date, id from clientes where nome='Beta Serviços Ltda'");
      await lancar(p, 3); await p.waitForSelector('#gs-raiz #rc-busca'); await p.fill('#gs-raiz #rc-busca', 'B54 receber'); await p.waitForTimeout(600);
      await p.click('#gs-raiz [data-rc]'); await p.waitForSelector('#gs-raiz [data-bx-ok]'); await p.click('#gs-raiz [data-bx-ok]'); await p.waitForTimeout(2000);
      ok('B54 + Lançar: "Recebimento" dá baixa no honorário escolhido', sql("select pago from lancamentos where descricao='Honorário B54 receber'") === 't');
      await fecharTudo();
      await nav(p, 'execucoes'); await p.waitForSelector('#panel-execucoes tr[data-ex]');
      await p.click('#panel-execucoes tr[data-ex]'); await p.waitForSelector('#gs-raiz #ex-contato-novo');
      await p.click('#gs-raiz #ex-contato-novo'); await p.waitForSelector('#gs-raiz #f-exc');
      await p.fill('#gs-raiz #f-exc [name=nome]', 'Oficial B54'); await p.fill('#gs-raiz #f-exc [name=telefone]', '31999990000'); await p.fill('#gs-raiz #f-exc [name=endereco]', 'Rua Teste, 54');
      await p.click('#gs-raiz #exc-ok'); await p.waitForTimeout(1500);
      ok('B54 Execuções: guarda contato de quem não é cliente (telefone, endereço)', sql("select count(*) from execucao_contatos where nome='Oficial B54' and endereco='Rua Teste, 54'") === '1' &&
        /Oficial B54/.test(await p.textContent('#gs-raiz #ex-contatos-l')));
      await fecharTudo();
    }
    // ── Backup 55: A pagar · Contabilidade, filtros 2×2 lado a lado, tabelas numa linha, Acordos editar pela parcela, conferir com confirmação, Planilha ──
    {
      const fecharTudo = async () => { for (let i = 0; i < 4; i++) { const f = await p.$('#gs-raiz .fundo [data-cancelar], #gs-raiz .fundo [data-fechar]'); if (!f) break; await f.click().catch(() => {}); await p.waitForTimeout(200); } };
      sql("insert into lancamentos (empresa, tipo, descricao, valor, vencimento) values ('contabilidade','despesa','Despesa contab B55',111,current_date), ('escritorio','despesa','Despesa escritorio B55',999,current_date)");
      await nav(p, 'hoje'); await p.waitForSelector('#ini-resumo [data-ini-ir=fin-pagar]'); await p.waitForTimeout(500);
      const pagTxt = await p.textContent('#ini-resumo [data-ini-ir=fin-pagar]');
      ok('B55 Início: cartão "A pagar · Contabilidade" só com as despesas da contabilidade', /A pagar · Contabilidade/.test(pagTxt) && /111/.test(pagTxt) && !/999|1\.110/.test(pagTxt), pagTxt);
      await nav(p, 'tarefas'); await p.waitForSelector('#tf-chips.fila-2x2'); await p.waitForTimeout(300);
      const pos = await p.evaluate(() => { const c = [...document.querySelectorAll('#tf-chips > .fila-chips')]; const r = c.map((x) => x.getBoundingClientRect()), w = document.querySelector('#tf-chips').getBoundingClientRect();
        return { a: r[0] && r[0].right, b: r[1] && r[1].left, larg: w.width, ini: w.left }; });
      ok('B55 Tarefas: Urgência e Prazo logo depois de Mostrar/De quem (não colados na direita)', pos.b > pos.a && pos.b - pos.a < 120 && pos.b - pos.ini < pos.larg * 0.8, JSON.stringify(pos));
      await nav(p, 'resumo'); await p.waitForSelector('#tblExecRanking tr'); await p.evaluate(() => { FILTROS.grupo = ''; FILTROS.empresa = ''; renderExecRanking(); }); await p.waitForTimeout(800);
      ok('B55 Painel: com a faixa do grupo, a coluna Grupo some e cada empresa fica numa linha', await p.evaluate(() => { const t = document.querySelector('#tblExecRanking').closest('table');
        const g = t.querySelector('thead th.col-grupo'); const tr = [...t.querySelectorAll('tbody tr')].find((x) => x.querySelector('td.col-nome'));
        return t.classList.contains('tem-faixa') && (!g || getComputedStyle(g).display === 'none') && !!tr && getComputedStyle(tr.querySelector('td.col-nome')).whiteSpace === 'nowrap'; }));
      ok('B55 tabelas: CPF/CNPJ discreto (letra menor, cinza)', await p.evaluate(() => { const td = document.querySelector('#tblExecRanking td.col-doc'); if (!td) return false; const c = getComputedStyle(td); return parseFloat(c.fontSize) < 13; }));
      await nav(p, 'acordos'); await p.waitForSelector('#tblAcordosVencBody tr[data-ac-id]', { timeout: 10000 }).catch(() => {});
      const temAc = await p.$('#tblAcordosVencBody tr[data-ac-id] td:nth-child(3)');
      if (temAc) { await temAc.click(); await p.waitForTimeout(300);
        ok('B55 Acordos: clicar na parcela abre "Só esta parcela" e "O acordo inteiro"', !!(await p.$('#tblAcordosVencBody tr.ac-ed-linha [data-ac-ed=parcela]')) && !!(await p.$('#tblAcordosVencBody tr.ac-ed-linha [data-ac-ed=acordo]')));
        await p.click('#tblAcordosVencBody tr.ac-ed-linha [data-ac-ed=acordo]'); await p.waitForSelector('#gs-raiz #f-acordo-todo', { timeout: 5000 }).catch(() => {});
        ok('B55 Acordos: "O acordo inteiro" abre a edição de todas as parcelas', !!(await p.$('#gs-raiz #f-acordo-todo')));
        await fecharTudo(); }
      else ok('B55 Acordos: há parcela a pagar para testar a edição pela linha', false);
      // Rotina → Passivo: ✓ pede confirmação
      const dlg = []; const ouve = (d) => dlg.push(d.message()); p.on('dialog', ouve);
      await p.evaluate(() => { GS.E.rt = Object.assign(GS.E.rt || {}, { aba: 'passivo' }); nav(null, 'rotina'); }); await p.waitForSelector('#rt-pas-corpo [data-conferir]', { timeout: 10000 });
      await p.click('#rt-pas-corpo [data-conferir]'); await p.waitForTimeout(800);
      p.off('dialog', ouve);
      ok('B55 Rotina: conferir uma empresa do passivo pede confirmação', dlg.some((m) => /conferida/.test(m)), dlg.join(' | '));
      sql("delete from lancamentos where descricao in ('Despesa contab B55','Despesa escritorio B55')");
    }
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
