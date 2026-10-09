// Backup 51 — teste de TEMPO com dados fictícios grandes (300 parcelamentos, 15 mil parcelas, 2 mil lançamentos, 500 clientes).
// Mede: abrir "Guias do mês", abrir "Planilha", trocar de grupo na Planilha, clicar "Pago" e abrir Financeiro, Painel e Clientes.
// Uso: node velocidade.js  (precisa do servidor-local.js, PostgREST e PostgreSQL de teste)
// SO_MEDIR=1 só mostra os tempos (sem exigir as metas) — foi assim que os tempos de antes foram anotados no COMO-ATUALIZAR.md.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:8090';
const FOTOS = process.env.FOTOS || '';
const sql = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-p', process.env.PGPORT || '54329', '-U', 'postgres', '-d', 'erp', '-v', 'ON_ERROR_STOP=1', '-tAc', q]).toString().trim();
const r = []; const ok = (n, c, extra) => { r.push([n, !!c]); if (!c && extra !== undefined) console.log('   ↳', n, '→', extra); };

execFileSync('sh', [path.join(__dirname, 'preparar-banco.sh')]);
sql(`
insert into grupos(nome) select 'Grupo V' || lpad(g::text, 2, '0') from generate_series(1, 40) g;
insert into clientes(grupo_id, nome, cpf_cnpj, rfb, pgfn, capag, procuracao, em_operacao)
  select (select id from grupos where nome = 'Grupo V' || lpad((1 + (c % 40))::text, 2, '0')), 'Empresa Ficticia ' || lpad(c::text, 3, '0') || ' Ltda',
         lpad((10000000000000 + c * 7919)::text, 14, '0'), 1000 * c, 500 * c, 'B', true, true
  from generate_series(1, 500) c;
-- 300 parcelamentos com 50 parcelas cada (15 mil): as dos últimos 36 meses pagas, as outras em aberto
insert into parcelamentos(grupo_id, aba, empresa, cnpj, local, natureza, numero, total_parcelas, valor_ultima_parcela)
  select c.grupo_id, 'x', c.nome, c.cpf_cnpj, (array['e-CAC','PGFN','SEFAZ/MG'])[1 + p % 3], (array['Simples Nacional','Previdenciário','ICMS'])[1 + p % 3], 'V' || p, 60, 100 + p
  from generate_series(1, 300) p join lateral (select * from clientes order by nome offset (p - 1) limit 1) c on true;
insert into parcelas(parcelamento_id, numero, vencimento, pago, emissao)
  select pa.id, n::text, (date_trunc('month', current_date) + ((n - 37) || ' months')::interval)::date + 9, n <= 36, case when n <= 36 then 'SIM' else '' end
  from parcelamentos pa, generate_series(1, 50) n;
insert into lancamentos(empresa, tipo, grupo_id, descricao, categoria, responsavel, vencimento, valor, pago)
  select case when l % 4 = 0 then 'contabilidade' else 'escritorio' end, case when l % 5 = 0 then 'despesa' else 'receita' end,
         (select id from grupos where nome = 'Grupo V' || lpad((1 + (l % 40))::text, 2, '0')), 'Lançamento fictício ' || l, 'Mensal', 'Pedro',
         current_date + (l % 400) - 300, 100 + l, l % 3 = 0
  from generate_series(1, 2000) l;
-- Backup 52: 400 processos com 20 movimentações cada (8 mil), para medir Rotina → Processos
insert into processos(grupo_id, carteira, advogado, numero, natureza, autor, reu, valor, status)
  select (select id from grupos where nome = 'Grupo V' || lpad((1 + (k % 40))::text, 2, '0')), 'Ativo', 'Pedro',
         lpad(k::text, 7, '0') || '-11.2024.8.13.0024', 'Execução fiscal', 'Estado de MG', 'Empresa Ficticia ' || lpad((1 + k % 500)::text, 3, '0') || ' Ltda', 1000 * k, 'Em andamento'
  from generate_series(1, 400) k;
insert into processo_movimentacoes(processo_id, data, tipo, descricao, quem)
  select pr.id, current_date - (m * 7), case when m % 3 = 0 then 'sem_novidade' else 'movimentacao' end, 'Movimentação fictícia ' || m, 'Pedro'
  from processos pr, generate_series(1, 20) m;
analyze;
`);
const N = { pa: sql('select count(*) from parcelamentos'), pc: sql('select count(*) from parcelas'), la: sql('select count(*) from lancamentos'), cl: sql('select count(*) from clientes') };
console.log('Dados fictícios: ' + N.cl + ' clientes, ' + N.pa + ' parcelamentos, ' + N.pc + ' parcelas, ' + N.la + ' lançamentos');

(async () => {
  const b = await chromium.launch();
  const erros = [];
  const T = {};
  try {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    // a internet de verdade demora: cada pedido ao banco espera LATENCIA ms (padrão 100 ms, como do escritório até o Supabase)
    const LAT = +(process.env.LATENCIA || 100);
    if (LAT) await ctx.route(/\/rest\/v1\//, async (rota) => { await new Promise((ok2) => setTimeout(ok2, LAT)); rota.continue(); });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => erros.push(e.message));
    p.on('dialog', (d) => d.accept());
    await p.goto(BASE + '/');
    await p.waitForSelector('#ac-login-email', { state: 'visible' });
    await p.fill('#ac-login-email', 'pedro@teste'); await p.fill('#ac-login-senha', 'senha123');
    await p.click('#ac-login-btn');
    await p.waitForFunction(() => /Completo/.test((document.getElementById('dotTxt') || {}).textContent || ''), null, { timeout: 120000 }).catch(() => {});
    await p.waitForTimeout(1500);
    // o tempo é medido DENTRO da página: do clique até a tela pintada com o resultado (o Playwright tem atrasos próprios que não são do sistema)
    await p.evaluate(() => {
      window.confirm = () => true;   // a versão antiga perguntava "Lançar o pagamento?" — aqui a resposta é imediata
      const sel = (s) => () => !!document.querySelector(s);
      const COND = {
        guias: sel('#rt-corpo .ep-tela:not(.rt-esq) .ep-emp'),
        planilha: sel('#rt-corpo .pl-card:not(.rt-esq) .pl-bloco .pl-tab'),
        grupo: () => { const a = document.querySelector('.pl-aba.ativo'); return a && a.dataset.plG === window.__alvo && !!document.querySelector('#rt-corpo .pl-card:not(.rt-esq) .pl-bloco .pl-tab'); },
        pago: () => !document.querySelector('[data-pl-p="' + window.__alvo + '"]'),
        financeiro: () => { const t = document.querySelector('#panel-financeiro tbody tr'); return !!t && t.offsetParent !== null && !(document.getElementById('loadOverlay') || document.body).classList.contains('on'); },
        painel: () => { const t = document.querySelector('#tblExecRanking tr:not(.gx-grp)'); return !!t && t.offsetParent !== null; },
        processos: () => { const t = document.querySelector('#rt-proc-corpo tr[data-pid]'); return !!t && t.offsetParent !== null; },
        parcelamentos: () => { const pn = document.getElementById('panel-parcelamentos'); if (!pn || !pn.offsetParent || !pn.querySelector('#pc-tabela table')) return false;   // Backup 68: a tela nova já desenhada
          return (DB.parcelamentos || []).some((pa) => (pa.parcelas || []).some((x) => x._id === window.__alvo && x.pagamento === 'SIM')); },
        clientes: () => /\d/.test((document.getElementById('cli-conta') || {}).textContent || '') && !!document.querySelector('#panel-clientes tbody tr') };
      window.__medir = (acao, cond) => new Promise((ok, falha) => {
        const t0 = performance.now(), lim = t0 + 60000; acao();
        const f = () => { if (COND[cond]()) return requestAnimationFrame(() => ok(Math.round(performance.now() - t0)));
          if (performance.now() > lim) return falha(new Error('tempo esgotado: ' + cond)); requestAnimationFrame(f); };
        f(); });
    });
    const clicar = (nome, seletor, cond) => p.evaluate(([s2, c]) => window.__medir(() => document.querySelector(s2).click(), c), [seletor, cond]).then((ms) => { (T[nome] = T[nome] || []).push(ms); });
    const abrir = (nome, tela, cond) => p.evaluate(([t, c]) => window.__medir(() => nav(null, t), c), [tela, cond]).then((ms) => { (T[nome] = T[nome] || []).push(ms); });
    const irPara = (x) => p.evaluate((y) => nav(null, y), x);
    const foto = async (nome) => { if (FOTOS) await p.screenshot({ path: FOTOS + '/vel-' + nome + '.png' }); };
    for (let i = 0; i < 3; i++) {
      // Guias do mês e Planilha: a Rotina abre direto na aba (é a última usada) — nada guardado de antes
      for (const [nome, aba, cond] of [['Guias do mês', 'guias', 'guias'], ['Planilha', 'planilha', 'planilha']]) {
        await irPara('rotina'); await p.waitForSelector('#rt-abas'); await p.click('#rt-abas [data-rt-aba=' + aba + ']');
        await p.waitForFunction((c) => window.__medir && document.querySelector(c === 'guias' ? '#rt-corpo .ep-tela:not(.rt-esq)' : '#rt-corpo .pl-card:not(.rt-esq)'), cond, { timeout: 60000 });
        await irPara('hoje'); await p.waitForTimeout(1200);
        await abrir(nome, 'rotina', cond);
        if (!i) await foto(aba);
        await p.waitForTimeout(500);
      }
      // trocar de grupo na Planilha
      const outro = await p.evaluate(() => { const a = [...document.querySelectorAll('[data-pl-g]')].find((x) => !x.classList.contains('ativo')); return (window.__alvo = a && a.dataset.plG); });
      await clicar('Trocar de grupo', '[data-pl-g="' + outro + '"]', 'grupo');
      // Pago: do clique até a tela mostrar a parcela paga
      const id = await p.evaluate(() => { const x = document.querySelector('[data-pl-p]'); return (window.__alvo = x && x.dataset.plP); });
      // Backup 63: o Pago pede confirmação (janela com a data) — o tempo conta do "Confirmar" até a tela mostrar a parcela paga
      await p.click('[data-pl-p="' + id + '"]'); await p.waitForSelector('.janela-baixa [data-bx-ok]');
      await clicar('Pago', '.janela-baixa [data-bx-ok]', 'pago');
      await p.waitForTimeout(1500);
      ok('Pago gravou no banco (' + (i + 1) + 'ª)', sql("select pago from parcelas where id='" + id + "'") === 't');
      if (!i) await foto('pago');
      // Backup 52: abrir Parcelamentos logo depois do Pago (até a parcela aparecer paga)
      await abrir('Parcelamentos pós-Pago', 'parcelamentos', 'parcelamentos'); await p.waitForTimeout(300);
      // Backup 52: Rotina → Processos (a Rotina abre direto na aba)
      await irPara('rotina'); await p.waitForSelector('#rt-abas'); await p.click('#rt-abas [data-rt-aba=processos]');
      await p.waitForSelector('#rt-proc-corpo tr[data-pid]', { timeout: 60000 }); await irPara('hoje'); await p.waitForTimeout(1200);
      await abrir('Rotina → Processos', 'rotina', 'processos'); if (!i) await foto('processos'); await p.waitForTimeout(500);
      // telas do ERP
      await abrir('Financeiro', 'financeiro', 'financeiro'); await p.waitForTimeout(300);
      await abrir('Painel', 'resumo', 'painel'); await p.waitForTimeout(300);
      await abrir('Clientes', 'clientes', 'clientes'); await p.waitForTimeout(300);
    }
    const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
    console.log('\nTempos (mediana de 3, em milissegundos; cada pedido ao banco com +' + LAT + ' ms de internet):');
    Object.keys(T).forEach((k) => console.log('  ' + k.padEnd(18) + String(med(T[k])).padStart(7) + ' ms   (' + T[k].join(' · ') + ')'));
    if (!process.env.SO_MEDIR) {
      ok('Velocidade: "Guias do mês" abre em menos de 1 s', med(T['Guias do mês']) < 1000, med(T['Guias do mês']));
      ok('Velocidade: "Planilha" abre em menos de 1 s', med(T['Planilha']) < 1000, med(T['Planilha']));
      ok('Velocidade: trocar de grupo na Planilha em menos de 1 s', med(T['Trocar de grupo']) < 1000, med(T['Trocar de grupo']));
      ok('Velocidade: "Pago" responde em menos de 0,2 s', med(T['Pago']) < 200, med(T['Pago']));
      ok('Velocidade (B52): Clientes abre em menos de 0,2 s', med(T['Clientes']) < 200, med(T['Clientes']));
      ok('Velocidade (B52): Rotina → Processos abre em menos de 1 s', med(T['Rotina → Processos']) < 1000, med(T['Rotina → Processos']));
      ok('Velocidade (B52): Parcelamentos depois de um Pago em menos de 1 s', med(T['Parcelamentos pós-Pago']) < 1000, med(T['Parcelamentos pós-Pago']));
    }
    ok('nenhum erro de JavaScript', !erros.length, erros.slice(0, 3));
  } catch (e) { console.error(e); r.push(['execução sem exceção', false]); }
  finally { await b.close(); }
  r.forEach(([n, c]) => console.log((c ? 'PASSA ' : 'FALHOU ') + n));
  const f = r.filter((x) => !x[1]).length;
  console.log('\n' + (r.length - f) + ' passaram, ' + f + ' falharam');
  process.exit(f ? 1 : 0);
})();
