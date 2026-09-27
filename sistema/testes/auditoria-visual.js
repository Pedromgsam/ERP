// Auditoria visual (skill telas-com-dados-ac): R$ quebrado, campo fora do card, rolagem lateral, menu morto.
// Uso: node auditoria-visual.js  (servidor-local.js no ar; use valores grandes no banco de teste)
const { chromium } = require('playwright');
const PAINEIS = ['hoje','resumo','processos','acordos','parcelamentos','financeiro','financeiroContab','contratos','clientes','documentos','tarefas','notificacoes','admin'];
(async () => {
  const b = await chromium.launch(); const out = {};
  for (const w of [1440, 1024, 390]) {
    const p = await (await b.newContext({ viewport: { width: w, height: 900 } })).newPage();
    p.on('dialog', (d) => d.dismiss());
    await p.goto('http://127.0.0.1:8090/'); await p.waitForSelector('#ac-login-email', { state: 'visible' });
    await p.fill('#ac-login-email', 'pedro@teste'); await p.fill('#ac-login-senha', 'senha123'); await p.click('#ac-login-btn'); await p.waitForTimeout(4500);
    const medir = (onde) => p.evaluate((onde) => {
      const vis = (e) => e.offsetParent !== null && e.getClientRects().length;
      const r = { rsQuebrado: [], campoFora: [], rolagem: 0, textoCortado: [] };
      const raiz = document.querySelector(onde) || document.body;
      // R$ em duas linhas: elemento-folha com "R$" cuja altura > 1,6 linha
      raiz.querySelectorAll('*').forEach((e) => {
        if (!vis(e) || e.children.length > 1) return;
        const t = (e.textContent || '').trim();
        if (!/^[-−]?\s*R\$\s?[\d.,]+/.test(t) || t.length > 30) return;
        const rg = document.createRange(); rg.selectNodeContents(e);
        const tops = new Set([...rg.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top / 4)));
        if (tops.size > 1) r.rsQuebrado.push((e.className || e.tagName) + ' "' + t + '"');
      });
      // campo que ultrapassa o card/janela
      raiz.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea').forEach((c) => {
        if (!vis(c)) return;
        const pai = c.closest('.card,.kpi,.janela,.gx-janela,.cc,.kc,.modal,.panel,form');
        if (!pai) return;
        const a = c.getBoundingClientRect(), bx = pai.getBoundingClientRect();
        if (a.right > bx.right + 1 || a.left < bx.left - 1) r.campoFora.push((c.name || c.id || c.tagName) + ' em .' + String(pai.className).split(' ')[0] + ' (+' + Math.round(a.right - bx.right) + 'px)');
      });
      // texto que vaza da caixa (KPI com valor maior que o card)
      raiz.querySelectorAll('.kv,.kpi-v,.kc .kv,.gs-cont,.tag').forEach((e) => { if (vis(e) && e.scrollWidth > e.clientWidth + 2) r.textoCortado.push(String(e.className).split(' ')[0] + ' "' + e.textContent.trim().slice(0, 25) + '"'); });
      r.rolagem = document.documentElement.scrollWidth - window.innerWidth;
      return r;
    }, onde);
    for (const id of PAINEIS) {
      await p.evaluate((x) => nav(null, x), id); await p.waitForTimeout(1600);
      out[w + ' ' + id] = await medir('#panel-' + id);
    }
    // formulários
    const forms = [['Lançar receita', async () => { await p.click('.tn-lancar-bt').catch(()=>{}); await p.click('.tn-lancar [data-lancar="0"]').catch(()=>{}); }],
                   ['Lançar processo', async () => { await p.click('.tn-lancar-bt').catch(()=>{}); await p.click('.tn-lancar [data-lancar="5"]').catch(()=>{}); }],
                   ['Lançar parcelamento', async () => { await p.click('.tn-lancar-bt').catch(()=>{}); await p.click('.tn-lancar [data-lancar="7"]').catch(()=>{}); }]];
    if (w >= 1024) for (const [n, abrir] of forms) {
      await abrir(); await p.waitForTimeout(900);
      out[w + ' form ' + n] = await medir('#gs-raiz .janela, .gx-janela');
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      await p.evaluate(() => document.querySelectorAll('.gx-fundo,#gs-raiz .fundo').forEach((e) => e.remove()));
    }
    await p.context().close();
  }
  // menu → painel existente; date nativo
  const p = await (await b.newContext()).newPage();
  await p.goto('http://127.0.0.1:8090/'); await p.waitForSelector('#ac-login-email', { state: 'visible' });
  await p.fill('#ac-login-email', 'pedro@teste'); await p.fill('#ac-login-senha', 'senha123'); await p.click('#ac-login-btn'); await p.waitForTimeout(4000);
  out.menuMorto = await p.evaluate(() => [...document.querySelectorAll('[data-ir],[data-panel],[data-baixo]')].map((e) => e.dataset.ir || e.dataset.panel || e.dataset.baixo)
    .filter((x) => x && !['mais', 'lancar'].includes(x) && !document.getElementById('panel-' + x)).filter((v, i, a) => a.indexOf(v) === i));
  out.inputsDate = await p.evaluate(() => document.querySelectorAll('input[type=date]').length);
  await b.close();
  const res = {};
  for (const [k, v] of Object.entries(out)) {
    if (Array.isArray(v) || typeof v !== 'object') { res[k] = v; continue; }
    const o = {}; if (v.rsQuebrado.length) o.rs = [...new Set(v.rsQuebrado)].slice(0, 6); if (v.campoFora.length) o.campo = [...new Set(v.campoFora)].slice(0, 6);
    if (v.textoCortado.length) o.cortado = [...new Set(v.textoCortado)].slice(0, 6); if (v.rolagem > 1) o.rolagemLateral = v.rolagem;
    if (Object.keys(o).length) res[k] = o;
  }
  console.log(JSON.stringify(res, null, 1));
})();
