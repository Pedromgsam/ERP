// Teste de PADRONIZAÇÃO (Backup 22): o mesmo tipo de informação tem que aparecer IGUAL em todas as telas.
// Abre cada tela (e as abas com tabela), mede o estilo calculado pelo navegador e falha se, por exemplo, o selo do Pedro
// tiver 12 px numa tela e 11 px noutra, ou o vencimento estiver em negrito numa tabela e sem negrito noutra.
// Roda depois do erp.js / visual.js (usa o mesmo banco de teste).
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8090';
const r = []; const ok = (n, c, extra) => { r.push([n, !!c]); if (!c && extra !== undefined) console.log('   ↳', n, '→', extra); };

// o que é medido: [nome, seletor, propriedades que têm de ser iguais em todas as telas]
const TAB = ':is(.tw,.tabela-wrap,.gx-tab-gs) table:not(.gx-leg):not(.massa)';
const REGRAS = [
  ['selo da pessoa', ':is(.pill.pill-pessoa,.fa-pessoa)', ['fontSize', 'fontWeight', 'width', 'borderRadius']],
  ['vencimento', 'td.col-venc', ['fontSize', 'fontWeight']],
  ['valor', 'td.col-valor', ['fontSize', 'fontWeight', 'color', 'textAlign']],
  ['dias / atraso', 'td.col-dias', ['fontSize']],
  ['nome de cliente/empresa', 'td.col-nome', ['fontSize', 'fontWeight', 'textTransform']],
  ['cabeçalho de tabela', TAB + ' > thead > tr > th', ['fontSize', 'fontWeight', 'backgroundColor', 'color', 'textTransform']],
  ['célula de tabela', TAB + ' > tbody > tr:not(.gx-grp):not(.gx-det) > td', ['fontSize']],
  ['linha de baixo (sócio, descrição…)', TAB + ' > tbody > tr > td .sub', ['fontSize', 'color']],
  ['botão "✓ Baixa" da linha', 'td :is(.gx-la-bx,[data-pagar].btn-mini)', ['fontSize', 'fontWeight']],
  ['botão "✎" da linha', 'td :is(.gx-la-ed,.btn-ed)', ['fontSize']]];

// telas e, entre colchetes, o que clicar antes de medir (abas)
const TELAS = [['hoje'], ['resumo'], ['processos'], ['parcelamentos'], ['parcelamentos', "setParcTab('avencer')"], ['acordos'], ['acordos', "setAcordTab('pagar')"],
  ['acordos', "setAcordTab('pago')"], ['financeiro', "setFinTab('receber')"], ['financeiro', "setFinTab('recebidos')"], ['financeiro', "setFinTab('analise')"],
  ['financeiroContab', "setFinCTab('receber')"], ['contratos'], ['clientes']];

(async () => {
  const b = await chromium.launch();
  const vistos = {}; REGRAS.forEach(([n]) => { vistos[n] = {}; });
  const erros = [];
  try {
    const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.dismiss());
    await p.goto(BASE + '/'); await p.waitForSelector('#ac-login-email', { state: 'visible' });
    await p.fill('#ac-login-email', 'pedro@teste'); await p.fill('#ac-login-senha', 'senha123'); await p.click('#ac-login-btn'); await p.waitForTimeout(4500);
    await p.evaluate(() => { const x = document.getElementById('gx-pop-avisos'); if (x) x.remove(); });
    for (const [tela, clique] of TELAS) {
      await p.evaluate((x) => nav(null, x), tela); await p.waitForTimeout(1500);
      if (clique) { await p.evaluate((c) => { try { eval(c); } catch (e) { /* aba inexistente: mede o que houver */ } }, clique); await p.waitForTimeout(1200); }
      const med = await p.evaluate((REGRAS) => {
        const vis = (el) => el.offsetParent !== null && el.getBoundingClientRect().width > 0;
        const o = {};
        REGRAS.forEach(([n, sel, props]) => {
          o[n] = [...document.querySelectorAll(sel)].filter(vis).map((el) => { const cs = getComputedStyle(el); return props.map((k) => k + '=' + cs[k]).join(' '); });
        });
        return o;
      }, REGRAS);
      const nome = tela + (clique ? ' › ' + clique.replace(/^\w+\('|'\)$/g, '') : '');
      Object.keys(med).forEach((n) => med[n].forEach((v) => { (vistos[n][v] = vistos[n][v] || new Set()).add(nome); }));
    }
    // cada tipo de informação: um único estilo em todas as telas
    REGRAS.forEach(([n]) => {
      const estilos = Object.keys(vistos[n]);
      ok('padrão único — ' + n + (estilos.length ? ' (' + [...new Set([].concat(...estilos.map((e) => [...vistos[n][e]])))].length + ' telas)' : ''), estilos.length === 1,
        estilos.map((e) => e + '  ⇐  ' + [...vistos[n][e]].join(', ')).join('\n     '));
    });
    // a régua esperada (respostas do Backup 22)
    const tem = (n, re) => Object.keys(vistos[n]).every((e) => re.test(e));
    ok('tabela com 13 px', tem('célula de tabela', /fontSize=13px/));
    ok('vencimento em negrito', tem('vencimento', /fontWeight=700/));
    ok('valor em negrito, preto e à direita', tem('valor', /fontWeight=700/) && tem('valor', /textAlign=right/));
    ok('nomes de cliente/empresa em CAIXA ALTA sem negrito', tem('nome de cliente/empresa', /fontWeight=400 textTransform=uppercase/));
    ok('selo da pessoa sutil (11 px) e com a mesma largura', tem('selo da pessoa', /fontSize=11px fontWeight=600 width=88px/));
    ok('linha de baixo com 12 px', tem('linha de baixo (sócio, descrição…)', /fontSize=12px/));
    ok('nenhum botão PIX nas tabelas', await p.evaluate(() => !document.querySelector('[data-pix]')));
    ok('sem triângulo vermelho nos títulos', await p.evaluate(() => !document.querySelector('.alerta-tri')));
    ok('sem erros de JavaScript', !erros.length, erros.join(' | '));
  } catch (e) { console.error(e); ok('sem exceção no teste', false); }
  await b.close();
  r.forEach(([n, c]) => console.log((c ? 'PASSA ' : 'FALHOU') + ' ' + n));
  const f = r.filter((x) => !x[1]).length;
  console.log('\n' + (r.length - f) + ' passaram, ' + f + ' falharam');
  process.exit(f ? 1 : 0);
})();
