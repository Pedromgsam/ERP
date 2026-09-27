// Teste visual (skill telas-com-dados-ac): com valores grandes, em 1440, 1024 e 390 px, falha se
//  (a) um valor em R$ ocupar duas linhas; (b) um campo passar da borda do card; (c) a página rolar
//  para o lado; (d) um item de menu levar a tela inexistente; (e) gráfico vazio desenhar eixo.
// Roda depois do erp.js (usa o mesmo banco de teste).
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const BASE = process.env.BASE || 'http://127.0.0.1:8090';
const sql = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-p', process.env.PGPORT || '54329', '-U', 'postgres', '-d', 'erp', '-v', 'ON_ERROR_STOP=1', '-tAc', q]).toString().trim();
const r = []; const ok = (n, c, extra) => { r.push([n, !!c]); if (!c && extra !== undefined) console.log('   ↳', n, '→', extra); };
sql("update lancamentos set valor=round(valor*137.53,2); update processos set valor=1845320.55; update acordos set valor=128450.9;" +
    "update clientes set rfb=1250340.12, pgfn=987654.32, age_mg=345678.9; update parcelamentos set valor_ultima_parcela=12345.67; update contratos set valor_total=148000;");
const PAINEIS = ['hoje', 'resumo', 'processos', 'acordos', 'parcelamentos', 'financeiro', 'financeiroContab', 'contratos', 'clientes', 'documentos', 'tarefas', 'notificacoes', 'admin'];
(async () => {
  const b = await chromium.launch(); const falhas = { rs: [], campo: [], rolagem: [] };
  try {
    for (const w of [1440, 1024, 390]) {
      const p = await (await b.newContext({ viewport: { width: w, height: 900 } })).newPage();
      p.on('dialog', (d) => d.dismiss());
      await p.goto(BASE + '/'); await p.waitForSelector('#ac-login-email', { state: 'visible' });
      await p.fill('#ac-login-email', 'pedro@teste'); await p.fill('#ac-login-senha', 'senha123'); await p.click('#ac-login-btn'); await p.waitForTimeout(4500);
      for (const id of PAINEIS) {
        await p.evaluate((x) => nav(null, x), id); await p.waitForTimeout(1500);
        const m = await p.evaluate((onde) => {
          const vis = (e) => e.offsetParent !== null && e.getClientRects().length;
          const out = { rs: [], campo: [], rolagem: document.documentElement.scrollWidth - window.innerWidth };
          const raiz = document.querySelector(onde) || document.body;
          raiz.querySelectorAll('*').forEach((e) => {
            if (!vis(e)) return;
            // só o texto do próprio elemento (o selo "redutor" abaixo do valor é outro elemento)
            [...e.childNodes].filter((n) => n.nodeType === 3 && /R\$/.test(n.textContent)).forEach((n) => {
              // mede só o trecho do valor ("R$ 1.234,56", "R$ 1,85 mi"), não a frase inteira
              const re = /[-−]?\s?R\$[\s\u00A0]?[\d.,]+(?:[\s\u00A0](?:mi|mil))?/g; let mm;
              while ((mm = re.exec(n.textContent))) {
                const rg = document.createRange(); rg.setStart(n, mm.index); rg.setEnd(n, mm.index + mm[0].length);
                const topos = new Set([...rg.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top / 4)));
                if (topos.size > 1) out.rs.push(mm[0]);
              }
            });
          });
          raiz.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea').forEach((c) => {
            if (!vis(c)) return;
            const pai = c.closest('.card,.kpi,.janela,.gx-janela,.cc,.kc,.panel,form'); if (!pai) return;
            const a = c.getBoundingClientRect(), bx = pai.getBoundingClientRect();
            if (a.right > bx.right + 1 || a.left < bx.left - 1) out.campo.push((c.name || c.id || c.tagName) + ' +' + Math.round(a.right - bx.right) + 'px');
          });
          return out;
        }, '#panel-' + id);
        m.rs.forEach((x) => falhas.rs.push(w + ' ' + id + ': ' + x));
        m.campo.forEach((x) => falhas.campo.push(w + ' ' + id + ': ' + x));
        if (m.rolagem > 1) falhas.rolagem.push(w + ' ' + id + ': ' + m.rolagem + 'px');
      }
      { const sobra = await p.evaluate(() => { const its = [...document.querySelectorAll('#tn > *')].filter((e) => e.offsetParent); if (!its.length) return 99;
          const fim = Math.max(...its.map((e) => e.getBoundingClientRect().right));
          const prox = ['#gs-contadores', '.tn-lancar', '.hd-usuario'].map((q) => document.querySelector(q)).filter((e) => e && e.offsetParent).map((e) => e.getBoundingClientRect().left);
          return Math.min(...prox) - fim; });
        if (sobra < 4) falhas.rolagem.push(w + ' barra superior: menu encosta nos contadores (' + Math.round(sobra) + 'px)'); }
      if (w === 1440) {
        ok('nenhum item de menu leva a tela inexistente', (await p.evaluate(() => [...document.querySelectorAll('[data-ir]')].map((e) => e.dataset.ir).filter((x) => !document.getElementById('panel-' + x)))).length === 0);
        await p.evaluate(() => nav(null, 'acordos')); await p.waitForTimeout(1200);
        ok('gráficos com números em pt-BR', await p.evaluate(() => Chart.defaults.locale === 'pt-BR'));
      }
      await p.context().close();
    }
  } catch (e) { console.error(e); ok('sem exceção no teste visual', false); }
  await b.close();
  ok('nenhum valor em R$ quebra em duas linhas (1440, 1024, 390)', !falhas.rs.length, [...new Set(falhas.rs)].slice(0, 8).join(' | '));
  ok('nenhum campo sai do card', !falhas.campo.length, falhas.campo.slice(0, 8).join(' | '));
  ok('nenhuma tela rola para o lado', !falhas.rolagem.length, falhas.rolagem.join(' | '));
  r.forEach(([n, c]) => console.log((c ? 'PASSA  ' : 'FALHOU ') + n));
  const f = r.filter((x) => !x[1]).length;
  console.log('\n' + (r.length - f) + ' passaram, ' + f + ' falharam');
  process.exit(f ? 1 : 0);
})();
