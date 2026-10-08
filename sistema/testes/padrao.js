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
  ['selo da pessoa', ':is(.pill.pill-pessoa,.fa-pessoa)', ['fontSize', 'fontWeight', 'borderRadius']],
  ['vencimento', 'td.col-venc', ['fontSize', 'fontWeight']],
  ['valor', 'td.col-valor:not(#tblExecRanking td)',   // Backup 46: o Painel (Empresas do grupo) fica centralizado, a pedido
  ['fontSize', 'fontWeight', 'textAlign']],   // Backup 50: a cor do valor depende do tipo (receber verde, pagar vermelho)
  ['dias / atraso', 'td.col-dias', ['fontSize']],
  ['nome de cliente/empresa', 'td.col-nome', ['fontSize', 'fontWeight', 'textTransform']],
  ['cabeçalho de tabela', TAB + ' > thead > tr > th', ['fontSize', 'fontWeight', 'backgroundColor', 'color', 'textTransform']],
  ['célula de tabela', TAB + ' > tbody > tr:not(.gx-grp):not(.gx-det) > td:not(.col-doc):not(.col-grupo)', ['fontSize']],
  ['linha de baixo (sócio, descrição…)', TAB + ' > tbody > tr > td .sub', ['fontSize', 'color']],
  ['botão "✓ Baixa" da linha', 'td :is(.gx-la-bx,[data-pagar].btn-mini)', ['fontSize', 'fontWeight']],
  ['botão "✎" da linha', 'td :is(.gx-la-ed,.btn-ed)', ['fontSize']],
  // Backup 52 (P5): o que muda num lugar vale para todas as telas
  ['cabeçalho de grupo (faixa cinza, sem borda azul)', ':is(tr.gx-grp,tr.cli-grp,tr.rt-grp) > td', ['backgroundColor', 'color', 'fontSize', 'fontWeight', 'boxShadow']],
  ['filtro (pílula)', ':is(.gx-seg-cli > button,.filtros .segmento > button,.rt-seg > button,.fila-chips .fila-chip):not(.ativo):not(.on)', ['fontSize', 'borderRadius', 'backgroundColor', 'paddingTop']],
  ['filtro escolhido', ':is(.gx-seg-cli > button,.filtros .segmento > button,.rt-seg > button,.fila-chips .fila-chip).ativo', ['backgroundColor', 'color', 'borderRadius']],
  ['botão "↻ Atualizar"', '.bt-atualizar', ['fontSize', 'backgroundColor', 'borderRadius', 'paddingTop']],
  ['situação: em atraso', '[data-sit=atraso]', ['backgroundColor', 'color']],
  ['situação: vence hoje', '[data-sit=hoje]', ['backgroundColor', 'color'], true],
  ['situação: a vencer', '[data-sit=avencer]', ['backgroundColor', 'color'], true],
  ['situação: pago', '[data-sit=pago]', ['backgroundColor', 'color'], true],
  ['situação: cliente emite', '[data-sit=cliente]', ['backgroundColor', 'color'], true]];
const ROTINA = (aba) => "document.querySelector('#rt-abas [data-rt-aba=" + aba + "]').click()";

// telas e, entre colchetes, o que clicar antes de medir (abas)
const TELAS = [['hoje'], ['resumo'], ['processos'], ['parcelamentos'], ['parcelamentos', "setParcTab('avencer')"], ['acordos'], ['acordos', "setAcordTab('pagar')"],
  ['acordos', "setAcordTab('pago')"], ['financeiro', "setFinTab('receber')"], ['financeiro', "setFinTab('recebidos')"], ['financeiro', "setFinTab('analise')"],
  ['financeiroContab', "setFinCTab('receber')"], ['contratos'], ['clientes'],
  ['rotina', ROTINA('passivo')], ['rotina', ROTINA('processos')], ['rotina', ROTINA('guias')], ['rotina', ROTINA('planilha')], ['tarefas'], ['alertas'], ['crm'], ['publicacoes']];

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
      const nome = tela + (clique ? ' › ' + clique.replace(/^\w+\('|'\)$/g, '').replace(/^.*data-rt-aba=(\w+).*$/, '$1') : '');
      // Backup 52 (C3): nenhum quadro com mais de 40 px vazios embaixo do último item
      if (['hoje', 'tarefas', 'rotina', 'acordos'].includes(tela)) {
        const sobra = await p.evaluate(() => [...document.querySelectorAll('.panel.active .card-bd')].filter((bd) => bd.offsetParent !== null && bd.scrollHeight <= bd.clientHeight + 1 && bd.children.length).map((bd) => {
          const r = bd.getBoundingClientRect(), pb = parseFloat(getComputedStyle(bd).paddingBottom) || 0;
          const fundo = Math.max(...[...bd.children].filter((c) => c.getClientRects().length).map((c) => c.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(c).marginBottom) || 0)));
          return { id: (bd.closest('[id]') || {}).id || bd.className, vazio: Math.round(r.bottom - pb - fundo) }; }).filter((x) => x.vazio > 40));
        if (sobra.length) (vistos._altura = vistos._altura || []).push(nome + ': ' + sobra.map((x) => x.id + ' ' + x.vazio + ' px').join(', '));
      }
      Object.keys(med).forEach((n) => med[n].forEach((v) => { (vistos[n][v] = vistos[n][v] || new Set()).add(nome); }));
    }
    const tem0 = (n, re) => Object.keys(vistos[n]).length > 0 && Object.keys(vistos[n]).every((e) => re.test(e));
    // cada tipo de informação: um único estilo em todas as telas
    REGRAS.forEach(([n]) => {
      const estilos = Object.keys(vistos[n]), opcional = (REGRAS.find((x) => x[0] === n) || [])[3];
      ok('padrão único — ' + n + (estilos.length ? ' (' + [...new Set([].concat(...estilos.map((e) => [...vistos[n][e]])))].length + ' telas)' : ''), estilos.length === 1 || (opcional && !estilos.length),
        estilos.map((e) => e + '  ⇐  ' + [...vistos[n][e]].join(', ')).join('\n     '));
    });
    ok('Backup 52 (C3): nenhum quadro com mais de 40 px vazios embaixo (Início, Tarefas, Rotina, Acordos)', !(vistos._altura || []).length, (vistos._altura || []).join('\n     '));
    ok('Backup 52 (P3): cabeçalho de grupo sem borda azul', tem0('cabeçalho de grupo (faixa cinza, sem borda azul)', /boxShadow=none/));
    // a régua esperada (respostas do Backup 22)
    const tem = (n, re) => Object.keys(vistos[n]).every((e) => re.test(e));
    ok('tabela com 13 px', tem('célula de tabela', /fontSize=13px/));
    ok('vencimento em negrito', tem('vencimento', /fontWeight=700/));
    ok('valor em negrito e à esquerda (como no ERP antigo — Backup 57)', tem('valor', /fontWeight=700/) && tem('valor', /textAlign=left/));
    ok('nomes de cliente/empresa como foram digitados, sem negrito (como no ERP antigo — Backup 57)', tem('nome de cliente/empresa', /fontWeight=400 textTransform=none/));
    ok('selo da pessoa como no ERP original (11 px, negrito, do tamanho do nome)', tem('selo da pessoa', /fontSize=11px fontWeight=700/));
    ok('linha de baixo com 12 px', tem('linha de baixo (sócio, descrição…)', /fontSize=12px/));
    ok('nenhum botão PIX nas tabelas', await p.evaluate(() => !document.querySelector('[data-pix]')));
    await p.evaluate(() => nav(null, 'hoje')); await p.waitForTimeout(1500);
    { const tam = await p.evaluate(() => [...new Set([...document.querySelectorAll('#panel-hoje *')].filter((e) => e.offsetParent !== null && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((e) => getComputedStyle(e).fontSize + (/^1[1-4]px$|^20px$/.test(getComputedStyle(e).fontSize) ? '' : ' (' + e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0] + ')')))]);
      ok('Início com no máximo 5 tamanhos de letra', new Set(tam.map((x) => x.split(' ')[0])).size <= 5, tam.join(' ')); }
    ok('sem triângulo vermelho nos títulos', await p.evaluate(() => !document.querySelector('.alerta-tri')));
    ok('sem erros de JavaScript', !erros.length, erros.join(' | '));
  } catch (e) { console.error(e); ok('sem exceção no teste', false); }
  await b.close();
  r.forEach(([n, c]) => console.log((c ? 'PASSA ' : 'FALHOU') + ' ' + n));
  const f = r.filter((x) => !x[1]).length;
  console.log('\n' + (r.length - f) + ' passaram, ' + f + ' falharam');
  process.exit(f ? 1 : 0);
})();
