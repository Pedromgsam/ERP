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
insert into lancamentos(empresa,tipo,grupo_id,descricao,categoria,responsavel,vencimento,valor)
  select 'escritorio','despesa',id,'Comissão','Comissão','Pedro',current_date + 5,150 from grupos where nome='Grupo Alfa';
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
    const lancar = async (p, i) => { await p.click('.tn-lancar-bt'); await p.click('.tn-lancar [data-lancar="' + i + '"]'); await esperarJanela(p); };
    const salvar = async (p) => { await p.click('.gx-janela button[type=submit]'); await p.waitForSelector('.gx-fundo', { state: 'detached', timeout: 8000 }).catch(() => {}); await p.waitForTimeout(2500); };

    // ── login ──
    let p = await pagina();
    await entrar(p, 'pedro@teste', 'errada');
    ok('senha errada: mensagem clara', /incorretos/.test(await p.textContent('#ac-login-msg')));
    await entrar(p, 'pedro@teste');
    await carregado(p);
    ok('entra com e-mail e senha do Supabase', await p.evaluate(() => window.AC_SESSION && window.AC_SESSION.nivel === 'admin'));
    await p.waitForTimeout(1200);
    ok('menu na barra superior (sem menu lateral)', await p.isVisible('#tn') && !(await p.isVisible('#sb')) && await p.isVisible('.tn-lancar-bt'));
    ok('equipe entra no Início (resumo do mês)', await p.isVisible('#panel-hoje') && /Olá, Pedro/.test(await p.textContent('#panel-hoje')) && /Honorários Contabilidade/.test(await p.textContent('#panel-hoje')));
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

    // ── editar pelo botão ✎ numa linha de Honorários ──
    await nav(p, 'financeiro');
    const linha = await p.$('#panel-financeiro tr[data-gx^="lancamentos:"]');
    ok('linhas de honorários marcadas para edição', !!linha);
    if (linha) {
      ok('ações fixas na linha: ✎ e ✓ Baixa', await linha.$('[data-la=editar]') && await linha.$('[data-la=baixa]'));
      await (await linha.$('[data-la=editar]')).click(); await esperarJanela(p);
      const tit = await p.textContent('.gx-janela h3');
      ok('abre o formulário de edição', /Editar — Honorário/.test(tit), tit);
      await foto(p, 'editar');
      await p.fill('#gx-f-referencia', '10/2026');
      await salvar(p);
    }
    ok('edição gravada no Supabase', sql("select count(*) from lancamentos where referencia='10/2026'") === '1');
    ok('histórico registra quem alterou', sql("select count(*) from historico where tabela='lancamentos' and acao='UPDATE'") === '1');

    // ── dar baixa ──
    const idRec = sql("select id from lancamentos where descricao='Honorários mensais'");
    await p.evaluate((id) => ERP_EDITAR('lancamentos:' + id), idRec); await esperarJanela(p);
    await p.click('.gx-janela [data-a=baixa]');
    await p.waitForSelector('.gx-fundo', { state: 'detached', timeout: 8000 }).catch(() => {}); await p.waitForTimeout(2500);
    ok('dar baixa: pago com data de hoje', sql("select pago and data_pagamento=current_date from lancamentos where id='" + idRec + "'") === 't');
    ok('após a baixa o ERP mostra na aba Receita', await p.evaluate(() => DB.financeiro.some((f) => f.aba === 'Receita' && f.pagamento === 'SIM')));

    // ── ✓ Baixa direto na linha (Início), com Desfazer no rodapé ──
    const idCont = sql("select id from lancamentos where empresa='contabilidade'");
    await nav(p, 'hoje'); await p.waitForTimeout(600);
    await p.click('#panel-hoje tr[data-gx^="lancamentos:' + idCont + '"] [data-la=baixa]'); await p.waitForTimeout(2500);
    ok('✓ Baixa na linha grava sem abrir formulário', sql("select pago from lancamentos where id='" + idCont + "'") === 't');
    ok('rodapé mostra a última gravação', /Última gravação/.test(await p.textContent('#gx-rodape')) && await p.isVisible('#gx-rodape'));
    await p.click('#gx-rodape .gx-rod-bt'); await p.waitForTimeout(2000);
    ok('Desfazer volta a baixa', sql("select pago from lancamentos where id='" + idCont + "'") === 'f');

    // ── novo lançamento pelo botão + Lançar ──
    await lancar(p, 0);
    await p.fill('#gx-f-grupo_id', 'Grupo Beta');
    await p.fill('#gx-f-categoria', 'Êxito');
    await p.fill('#gx-f-valor', '2500');
    await salvar(p);
    ok('novo honorário gravado (descrição automática)', sql("select count(*) from lancamentos where categoria='Êxito' and valor=2500 and descricao like 'Êxito%'") === '1');
    await lancar(p, 0);
    await p.fill('#gx-f-valor', '');
    await p.click('.gx-janela button[type=submit]'); await p.waitForTimeout(600);
    ok('campo obrigatório vazio: avisa e não grava', /Preencha|valor/.test(await p.textContent('.gx-msg')));
    await p.click('.gx-janela [data-a=cancelar]');

    // ── cliente: editar dívida e ver o painel mudar ──
    const idBeta = sql("select id from clientes where nome='Beta Serviços Ltda'");
    await p.evaluate((id) => ERP_EDITAR('clientes:' + id), idBeta); await esperarJanela(p);
    await p.fill('#gx-f-age_mg', '1300');
    await salvar(p);
    await nav(p, 'resumo'); await p.waitForTimeout(800);
    ok('painel recalcula após editar cliente (R$ 3.000,00)', /3\.000,00/.test(await p.evaluate(() => document.getElementById('execKpis').innerHTML)));

    // ── parcelamento: marcar parcela vencida como paga ──
    await nav(p, 'parcelamentos');
    const marcaParc = await p.evaluate(() => { const tr = document.querySelector('tr[data-gx^="parcelas:"]'); return tr && tr.dataset.gx; });
    ok('parcelas marcadas para edição', !!marcaParc);
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

    // ── acordo, processo ──
    const idAc = sql('select id from acordos');
    await p.evaluate((id) => ERP_EDITAR('acordos:' + id), idAc); await esperarJanela(p);
    await p.click('.gx-janela [data-a=baixa]'); await p.waitForTimeout(2500);
    ok('acordo baixado', sql('select pago and data_pagamento=current_date from acordos') === 't');
    ok('ERP mostra o acordo como Pago', await p.evaluate(() => DB.acordos[0].situacao === 'Pago'));
    await lancar(p, 3);
    await p.fill('#gx-f-numero', '5000002-22.2025.8.13.0024'); await p.fill('#gx-f-grupo_id', 'Grupo Beta');
    await salvar(p);
    ok('novo processo aparece no ERP', await p.evaluate(() => DB.processos.length === 2 && DB.processos.some((x) => x.grupo === 'Grupo Beta')));

    // ── tarefas ──
    await nav(p, 'tarefas'); await p.waitForTimeout(1200);
    ok('tela de Tarefas lista as abertas', /Protocolar defesa/.test(await p.textContent('#panel-tarefas')));
    await foto(p, 'tarefas');
    await p.click('#panel-tarefas [data-concluir]'); await p.waitForTimeout(2000);
    ok('concluir tarefa na linha', sql("select status from tarefas") === 'concluida');

    // ── contratos: parcelas entram sozinhas em Honorários Jurídico ──
    await lancar(p, 6);
    await p.fill('#gx-f-cliente_id', 'Beta Serviços Ltda'); await p.fill('#gx-f-descricao', 'Contrato de teste');
    await p.fill('#gx-f-responsavel', 'Pedro'); await p.fill('#gx-f-valor_total', '3000'); await p.fill('#gx-f-num_parcelas', '3');
    await p.fill('#gx-f-primeiro_vencimento', '2026-11-10');
    await salvar(p);
    ok('contrato gera 3 parcelas com grupo e responsável', sql("select count(*) from lancamentos l join grupos g on g.id=l.grupo_id where l.contrato_id is not null and g.nome='Grupo Beta' and l.responsavel='Pedro' and l.empresa='escritorio'") === '3');
    await nav(p, 'contratos'); await p.waitForTimeout(1500);
    ok('tela Contratos lista o contrato', /Contrato de teste/.test(await p.textContent('#panel-contratos')) && /0 \/ 3/.test(await p.textContent('#panel-contratos')));
    ok('parcelas do contrato aparecem em Honorários', await p.evaluate(() => DB.financeiro.filter((f) => f.grupo === 'Grupo Beta' && f.referencia === '1/3' && f.advogado === 'Pedro').length === 1));

    // ── clientes ──
    await nav(p, 'clientes'); await p.waitForTimeout(800);
    await p.fill('#panel-clientes [data-filtro=busca]', '12345678909'); await p.waitForTimeout(300);
    ok('tela Clientes com busca e selo PF', await p.$$eval('#gx-cli-corpo tbody tr', (l) => l.length) === 1 && /PF/.test(await p.textContent('#gx-cli-corpo')));
    await foto(p, 'clientes');

    // ── administração: criar usuário, link de senha, histórico ──
    ok('Administração no menu do admin', await p.isVisible('#tn [data-ir=admin]'));
    await nav(p, 'admin'); await p.waitForTimeout(1500);
    await p.click('#gx-us-novo');
    await p.fill('.gx-janela [name=nome]', 'Nova Pessoa'); await p.fill('.gx-janela [name=email]', 'nova@teste.com');
    await p.fill('.gx-janela [name=senha]', 'provisoria1'); await p.selectOption('.gx-janela [name=papel]', 'equipe');
    await p.click('.gx-janela [type=submit]'); await p.waitForTimeout(3000);
    ok('admin cria usuário pelo sistema (papel Equipe)', sql("select papel||'|'||nome from perfis where email='nova@teste.com'") === 'equipe|Nova Pessoa');
    ok('admin continua logado depois de criar usuário', await p.evaluate(async () => (await SB.auth.getSession()).data.session.user.email) === 'pedro@teste');
    await p.click('[data-senha="novo@teste"]'); await p.waitForTimeout(1200);
    ok('envia link de nova senha', (await (await p.request.get(BASE + '/__teste/recuperacoes')).json()).includes('novo@teste'));
    await p.click('.gx-abas [data-aba=historico]'); await p.waitForTimeout(1500);
    ok('histórico geral na Administração', /Alterou/.test(await p.textContent('#gx-adm-corpo')));
    await p.evaluate((id) => ERP_EDITAR('clientes:' + id), idBeta); await esperarJanela(p);
    await p.click('.gx-janela [data-a=historico]'); await p.waitForTimeout(1500);
    ok('histórico dentro do registro (quem mudou o quê)', /age mg/.test(await p.textContent('.gx-sobre')) && /1\.300/.test(await p.textContent('.gx-sobre')));
    await p.keyboard.press('Escape');

    // ── exclusão: equipe não exclui cliente ──
    const ctxE = await pagina();
    await entrar(ctxE, 'equipe@teste'); await carregado(ctxE);
    ok('equipe não vê Administração', !(await ctxE.isVisible('#tn [data-ir=admin]')) && await ctxE.isVisible('.tn-lancar-bt'));
    await ctxE.evaluate((id) => ERP_EDITAR('clientes:' + id), idBeta); await esperarJanela(ctxE);
    await ctxE.click('.gx-janela [data-a=excluir]'); await ctxE.waitForTimeout(1200);
    ok('equipe não consegue excluir cliente (aviso claro)', /administrador/.test(await ctxE.textContent('.gx-msg')) && sql("select count(*) from clientes where id='" + idBeta + "'") === '1');

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
    ok('celular: menu inferior com Início, Painel, Honorários, Lançar e Mais', await pm.isVisible('#tn-baixo') && (await pm.$$('#tn-baixo button')).length === 5);
    await pm.click('#tn-baixo [data-baixo=mais]'); await pm.waitForTimeout(300);
    ok('celular: "Mais" abre todas as telas', await pm.isVisible('#tn-mais [data-ir=contratos]'));
    await pm.click('#tn-mais [data-ir=contratos]'); await pm.waitForTimeout(1200);
    ok('celular: navega pelo Mais', await pm.isVisible('#panel-contratos'));
    await pm.evaluate((id) => ERP_EDITAR('clientes:' + id), idBeta); await esperarJanela(pm);
    ok('formulário cabe no celular', await pm.evaluate(() => document.querySelector('.gx-janela').getBoundingClientRect().width <= window.innerWidth));
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
