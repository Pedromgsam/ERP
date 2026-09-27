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
insert into tarefas(titulo,responsavel,prazo) values ('Protocolar defesa','Pedro',current_date + 2);
insert into configuracoes(chave,valor) values ('recibo_emitentes','{"pedro":{"label":"Pedro","nome":"ADVOGADO FICTICIO","oab":"OAB/MG 1","local":"Cidade/MG","qualif":"advogado ficticio, e-mail teste@teste","email":"teste@teste"}}');
insert into auth.users(email,senha_teste,raw_user_meta_data) values ('cliente@teste','senha123','{"nome":"Cliente Alfa"}');
update perfis set papel='cliente' where email='cliente@teste';
insert into perfil_grupos(perfil_id,grupo_id) select p.id,g.id from perfis p, grupos g where p.email='cliente@teste' and g.nome='Grupo Alfa';
`);

(async () => {
  const b = await chromium.launch();
  const erros = [], bloqueios = [], externos = [];
  try {
    async function pagina(largura) {
      const ctx = await b.newContext({ viewport: { width: largura || 1440, height: 900 } });
      const p = await ctx.newPage();
      p.on('pageerror', (e) => erros.push(e.message));
      p.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) bloqueios.push(m.text()); });
      p.on('request', (q) => { if (/script\.google|cdnjs/.test(q.url())) externos.push(q.url()); });
      p.on('dialog', (d) => d.accept());
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
    ok('⋯ tem o link para o Gestão', await p.isVisible('#gs-hd [data-acao=gestao]'));
    await p.mouse.click(700, 600); await p.waitForTimeout(150);
    const g2 = await p.request.get(BASE + '/gestao.html');
    ok('Gestão (versão anterior) continua no ar', g2.ok() && /Gestão/.test(await g2.text()));
    ok('menu Financeiro com Jurídico e Contabilidade', (await p.$$eval('#tn .tn-grupo:nth-of-type(2) .tn-menu button', (l) => l.map((b) => b.textContent))).join('|') === 'Jurídico|Contabilidade');
    await nav(p, 'hoje'); await p.waitForTimeout(1500);
    ok('equipe entra no Início do Gestão (resumo do mês)', await p.isVisible('#panel-hoje') && /Olá, Pedro/.test(await p.textContent('#panel-hoje')) && /Contabilidade/.test(await p.textContent('#panel-hoje')));
    await foto(p, 'inicio');
    await p.waitForTimeout(1500);
    const n = await p.evaluate(() => ({ b: DB.baseDados.length, pr: DB.processos.length, pa: DB.parcelamentos.length, ac: DB.acordos.length, fi: DB.financeiro.length, fc: DB.financeiroContabilidade.length }));
    ok('carrega os 6 módulos do Supabase', n.b === 3 && n.pr === 1 && n.pa === 1 && n.ac === 1 && n.fi === 2 && n.fc === 1, JSON.stringify(n));
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
    ok('A Receber no formato do Gestão (Vencimento, Grupo, Descrição, Pessoa, Valor, Situação)', cab.join('|') === 'Vencimento|Grupo / Favorecido|Descrição|Pessoa|Valor|Situação', cab.join('|'));
    ok('tabela original do ERP escondida (sem duplicar)', await p.$eval('#tblFinBody', (tb) => tb.closest('table').classList.contains('gx-oculta')));
    ok('comissão aparece como redutor (valor negativo)', /−\s*R\$\s*150,00/.test(await p.textContent('#panel-financeiro .gx-tab-gs')) && /redutor/.test(await p.textContent('#panel-financeiro .gx-tab-gs')));
    await foto(p, 'areceber');

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
    await p.click('#panel-financeiro .gx-tab-gs [data-pagar="' + idRec + '"]'); await p.waitForTimeout(2500);
    ok('✓ Recebido grava pago com data de hoje', sql("select pago and data_pagamento=current_date from lancamentos where id='" + idRec + "'") === 't');
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
    const idAc = sql('select id from acordos');
    ok('acordos com ✓ Baixa na linha', await p.evaluate((id) => document.querySelectorAll('tr[data-gx^="acordos:' + id + '"] [data-la=baixa]').length > 0, idAc));
    await p.evaluate((id) => ERP_EDITAR('acordos:' + id), idAc); await esperarJanela(p);
    await p.click('.gx-janela [data-a=baixa]'); await p.waitForTimeout(2500);
    ok('acordo baixado', sql('select pago and data_pagamento=current_date from acordos') === 't');
    ok('ERP mostra o acordo como Pago', await p.evaluate(() => DB.acordos[0].situacao === 'Pago'));
    ok('Desfazer no rodapé', await p.isVisible('#gx-rodape .gx-rod-bt'));
    await lancar(p, 5);
    await p.fill('#gx-f-numero', '5000002-22.2025.8.13.0024'); await p.fill('#gx-f-grupo_id', 'Grupo Beta');
    await salvar(p);
    ok('novo processo aparece no ERP', await p.evaluate(() => DB.processos.length === 2 && DB.processos.some((x) => x.grupo === 'Grupo Beta')));

    // ── tarefas (tela do Gestão) ──
    await nav(p, 'tarefas'); await p.waitForTimeout(1500);
    ok('Tarefas lista as abertas', /Protocolar defesa/.test(await p.textContent('#panel-tarefas')));
    await foto(p, 'tarefas');
    await p.click('#panel-tarefas [data-concluir]'); await p.waitForTimeout(2000);
    ok('concluir tarefa na linha', sql('select status from tarefas') === 'concluida');

    // ── contratos (tela e formulário do Gestão) ──
    await nav(p, 'contratos'); await p.waitForTimeout(1200);
    await p.click('#panel-contratos button:has-text("Novo contrato")'); await p.waitForSelector('#gs-raiz [name=descricao]'); await p.waitForTimeout(250);
    await p.selectOption('#gs-raiz [name=cliente_id]', { label: 'Beta Serviços Ltda · Grupo Beta' });
    await p.fill('#gs-raiz [name=descricao]', 'Contrato de teste'); await p.fill('#gs-raiz [name=valor_total]', '3.000,00');
    await p.fill('#gs-raiz [name=num_parcelas]', '3'); await p.fill('#gs-raiz [name=primeiro_vencimento]', '2026-11-10');
    await salvarGs(p, '#btn-salvar-ctr');
    ok('contrato gera 3 parcelas com o grupo do cliente', sql("select count(*) from lancamentos l join grupos g on g.id=l.grupo_id where l.contrato_id is not null and g.nome='Grupo Beta' and l.empresa='escritorio'") === '3');
    ok('tela Contratos lista o contrato', /Contrato de teste/.test(await p.textContent('#panel-contratos')));

    // ── clientes (tela do Gestão) ──
    await nav(p, 'clientes'); await p.waitForTimeout(1200);
    ok('tela Clientes do Gestão', /Alfa Comércio Ltda/.test(await p.textContent('#panel-clientes')) && await p.isVisible('#panel-clientes button:has-text("Novo cliente")'));
    await foto(p, 'clientes');

    // ── ficha 360° do cliente ──
    await p.click('#panel-clientes tr[data-cli]:has-text("Alfa Comércio Ltda")'); await p.waitForSelector('.janela.ficha #fc-abas'); await p.waitForTimeout(1200);
    ok('ficha do cliente abre com 12 abas e resumo', (await p.$$('.janela.ficha #fc-abas button')).length === 12 && /A receber/.test(await p.textContent('#fc-corpo')));
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
    await p.fill('#f-fl [name=responsavel]', 'Adriana'); await p.fill('#f-fl [name=prazo_fatal]', '2026-10-16');
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
    await p.click('#tf-vista [data-v=lista]'); await p.click('#tf-atalho [data-v=abertas]'); await p.waitForTimeout(500);
    await p.click('#tf-vista-corpo [data-editar-t]:has-text("Protocolo")'); await p.waitForSelector('#tf-coment-txt'); await p.waitForTimeout(800);
    await p.fill('#tf-coment-txt', '@Adriana revisar a peça'); await p.click('#tf-coment-env'); await p.waitForTimeout(1500);
    ok('comentário com @menção avisa a pessoa', sql('select count(*) from comentarios') === '1' && sql("select count(*) from notificacoes n join perfis p on p.id=n.usuario_id where p.email='equipe@teste'") === '2');
    await p.keyboard.press('Escape');
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
    ok('tabela faltando: o resto carrega e aparece aviso claro', /Acordos/.test(aviso) && /estrutura\.sql/.test(aviso) && await p.evaluate(() => DB.baseDados.length === 3), aviso);
    sql('alter table acordos_tmp rename to acordos'); execFileSync('pkill', ['-USR1', '-x', 'postgrest']); await p.waitForTimeout(1500);
    await p.evaluate(() => loadData(true)); await p.waitForTimeout(4000);
    ok('aviso some quando o banco é atualizado', !(await p.$('#erp-aviso-banco')));

    // ── sair ──
    await p.evaluate(() => acLogout()); await p.waitForTimeout(800);
    ok('sair encerra a sessão do Supabase', await p.evaluate(async () => !(await SB.auth.getSession()).data.session));
  } catch (e) {
    console.error(e); ok('sem exceção no teste', false);
  } finally {
    await b.close();
  }
  ok('sem erros de JavaScript', erros.length === 0, erros.slice(0, 5).join(' | '));
  ok('sem bloqueios da política de segurança', bloqueios.length === 0, bloqueios.slice(0, 3).join(' | '));
  r.forEach(([n, c]) => console.log((c ? 'PASSA  ' : 'FALHOU ') + n));
  const f = r.filter((x) => !x[1]).length;
  console.log('\n' + (r.length - f) + ' passaram, ' + f + ' falharam');
  process.exit(f ? 1 : 0);
})();
