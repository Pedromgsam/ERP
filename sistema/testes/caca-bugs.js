// Caça-bugs visual: percorre todas as telas em 1440/1024/390 px, modo claro e escuro, e MEDE na página:
//  cartoes     — cartões da mesma fileira com tamanhos diferentes (ex.: "Em atraso" menor que os vizinhos)
//  transborda  — conteúdo que passa da borda do cartão/janela, ou texto cortado sem reticências
//  sobrepostos — botões/campos/links que se sobrepõem
//  foraDaTela  — elemento visível além da largura da tela
//  contraste   — texto com contraste abaixo de 4,5:1 (3:1 para texto grande) — WCAG AA
//  semNome     — botão sem texto nem aria-label/title
//  rolagem     — página que rola para o lado
// Uso: node caca-bugs.js [saida.json]   (depois do erp.js, com o servidor-local.js no ar)
// Sai com código 1 se achar algo — entra na bateria rodar-tudo.sh.
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8090';
const PAINEIS = ['hoje', 'resumo', 'processos', 'parcelamentos', 'publicacoes', 'acordos', 'financeiro', 'financeiroContab', 'contratos',
  'clientes', 'crm', 'documentos', 'tarefas', 'alertas', 'automacoes', 'notificacoes', 'admin'];
const LARGURAS = (process.env.LARGURAS || '1440,1024,390').split(',').map(Number);
const TEMAS = (process.env.TEMAS || 'claro,escuro').split(',');

function medir(painel) {
  const out = { cartoes: [], transborda: [], sobrepostos: [], foraDaTela: [], contraste: [], semNome: [], rolagem: 0 };
  const raiz = document.getElementById('panel-' + painel); if (!raiz) return out;
  const vis = (e) => { if (!e.getClientRects().length) return false; const s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05; };
  const nome = (e) => {
    const partes = []; let x = e;
    for (let i = 0; x && x !== raiz && i < 4; i++, x = x.parentElement) {
      partes.unshift(x.id ? '#' + x.id : x.tagName.toLowerCase() + (x.classList.length ? '.' + [...x.classList].slice(0, 2).join('.') : ''));
      if (x.id) break;
    }
    const t = (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return partes.join(' > ') + (t ? ' "' + t + '"' : '');
  };
  const W = window.innerWidth;
  out.rolagem = Math.max(0, document.documentElement.scrollWidth - W);
  // dentro de quadro com rolagem própria (tabelas largas) não conta como "fora da tela"
  const rolaSozinho = (e) => { for (let x = e.parentElement; x && x !== document.body; x = x.parentElement) { const s = getComputedStyle(x); if (/(auto|scroll)/.test(s.overflowX) && x.scrollWidth > x.clientWidth + 1) return true; } return false; };

  // 1) cartões da mesma fileira com alturas/larguras diferentes
  raiz.querySelectorAll('.kpis, .kpi-grid, .al-grade, .ex-kpis, .kpis-4, .duas-col').forEach((g) => {
    if (!vis(g)) return;
    const filhos = [...g.children].filter(vis).map((c) => ({ c, r: c.getBoundingClientRect() }));
    const fileiras = {};
    filhos.forEach((f) => { const k = Math.round(f.r.top / 6); (fileiras[k] = fileiras[k] || []).push(f); });
    Object.values(fileiras).forEach((fl) => {
      if (fl.length < 2) return;
      const hs = fl.map((f) => f.r.height), ws = fl.map((f) => f.r.width);
      const dh = Math.max(...hs) - Math.min(...hs);
      const grade = getComputedStyle(g).display === 'grid';
      const dw = grade ? Math.max(...ws) - Math.min(...ws) : 0;
      if (dh > 4 || dw > 4) out.cartoes.push(nome(g) + ' → alturas ' + hs.map(Math.round).join('/') + (dw > 4 ? ' larguras ' + ws.map(Math.round).join('/') : ''));
    });
  });

  // 2) conteúdo passando da borda do cartão/janela; texto cortado sem reticências
  raiz.querySelectorAll('.card, .kpi, .kc, .al-card, .janela, .cc, .ex-bn, .mod-banner, .titulo-pag').forEach((card) => {
    if (!vis(card)) return;
    const cr = card.getBoundingClientRect();
    card.querySelectorAll('*').forEach((e) => {
      if (!vis(e) || rolaSozinho(e) || e.closest('canvas, svg')) return;
      const r = e.getBoundingClientRect(); if (!r.width || !r.height) return;
      if (r.right > cr.right + 2 || r.left < cr.left - 2) out.transborda.push(nome(e) + ' passa ' + Math.round(Math.max(r.right - cr.right, cr.left - r.left)) + 'px de ' + nome(card).split(' "')[0]);
    });
  });
  raiz.querySelectorAll('*').forEach((e) => {
    if (!vis(e) || e.children.length || rolaSozinho(e)) return;
    const s = getComputedStyle(e);
    if (e.scrollWidth > e.clientWidth + 2 && /(hidden|clip)/.test(s.overflowX) && s.textOverflow !== 'ellipsis' && (e.textContent || '').trim())
      out.transborda.push(nome(e) + ' texto cortado (' + e.scrollWidth + ' > ' + e.clientWidth + ')');
  });

  // 3) controles sobrepostos
  const ctl = [...raiz.querySelectorAll('button, a.btn, input:not([type=hidden]), select, textarea')].filter(vis).map((e) => ({ e, r: e.getBoundingClientRect() }));
  for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) {
    const a = ctl[i], b = ctl[j];
    if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
    // ícone dentro do campo (ex.: 📅 no campo de data) é de propósito
    const dentro = (p, q) => q.r.left >= p.r.left - 1 && q.r.right <= p.r.right + 1 && q.r.top >= p.r.top - 1 && q.r.bottom <= p.r.bottom + 1;
    if ((/INPUT|SELECT|TEXTAREA/.test(a.e.tagName) && dentro(a, b)) || (/INPUT|SELECT|TEXTAREA/.test(b.e.tagName) && dentro(b, a))) continue;
    const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (x > 3 && y > 3) out.sobrepostos.push(nome(a.e) + ' × ' + nome(b.e));
  }

  // 4) fora da tela
  raiz.querySelectorAll('*').forEach((e) => {
    if (!vis(e) || rolaSozinho(e)) return;
    const r = e.getBoundingClientRect();
    if (r.width && (r.right > W + 1 || r.left < -1)) out.foraDaTela.push(nome(e) + ' (' + Math.round(r.left) + '→' + Math.round(r.right) + ' de ' + W + ')');
  });

  // 5) contraste (texto direto no elemento contra o fundo efetivo)
  const rgb = (c) => { const m = String(c).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/); return m ? [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]] : null; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const fundo = (e) => {
    const pilha = [];
    for (let x = e; x; x = x.parentElement) {
      const s = getComputedStyle(x);
      if (s.backgroundImage && s.backgroundImage !== 'none' && !/gradient/.test(s.backgroundImage)) return null; // imagem: não dá para medir
      if (/gradient/.test(s.backgroundImage)) { const cs = s.backgroundImage.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}/gi); if (cs) { const c0 = rgb(cs[0]) || null; if (c0) { pilha.push(c0); if (c0[3] >= 1) break; } } }
      const c = rgb(s.backgroundColor); if (c && c[3] > 0) { pilha.push(c); if (c[3] >= 1) break; }
    }
    let base = [255, 255, 255];
    for (let i = pilha.length - 1; i >= 0; i--) { const [r, g, b, a] = pilha[i]; base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)]; }
    return base;
  };
  const vistos = new Set();
  raiz.querySelectorAll('*').forEach((e) => {
    if (!vis(e)) return;
    const txt = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
    if (!txt || e.closest('[disabled], .desativado, canvas, svg, option')) return;
    const s = getComputedStyle(e), c = rgb(s.color); if (!c) return;
    let op = 1; for (let x = e; x; x = x.parentElement) op *= +getComputedStyle(x).opacity;
    if (op < 0.95) return;                       // esmaecido de propósito (desativado/secundário)
    const bg = fundo(e); if (!bg) return;
    const fg = [c[0] * c[3] + bg[0] * (1 - c[3]), c[1] * c[3] + bg[1] * (1 - c[3]), c[2] * c[3] + bg[2] * (1 - c[3])];
    const L1 = lum(fg), L2 = lum(bg), razao = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const px = parseFloat(s.fontSize), grande = px >= 24 || (px >= 18.66 && +s.fontWeight >= 700);
    const minimo = grande ? 3 : 4.5;
    if (razao < minimo) {
      const chave = s.color + '|' + bg.map(Math.round).join(',') + '|' + (e.className || e.tagName);
      if (vistos.has(chave)) return; vistos.add(chave);
      out.contraste.push(nome(e) + ' ' + razao.toFixed(2) + ':1 (texto ' + s.color + ' sobre rgb(' + bg.map(Math.round).join(',') + '))');
    }
  });

  // 6) botão sem nome
  raiz.querySelectorAll('button, [role=button], a.btn').forEach((b) => {
    if (!vis(b)) return;
    if (!(b.textContent || '').trim() && !b.getAttribute('aria-label') && !b.getAttribute('title')) out.semNome.push(nome(b));
  });
  return out;
}

(async () => {
  const b = await chromium.launch(); const rel = {}; let total = 0;
  for (const tema of TEMAS) for (const w of LARGURAS) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
    await ctx.addInitScript((t) => { try { localStorage.setItem('erp_tema', t); } catch (e) { /* sem armazenamento */ } }, tema === 'escuro' ? 'escuro' : 'claro');
    const p = await ctx.newPage(); p.on('dialog', (d) => d.dismiss());
    await p.goto(BASE + '/'); await p.waitForSelector('#ac-login-email', { state: 'visible' });
    await p.fill('#ac-login-email', 'pedro@teste'); await p.fill('#ac-login-senha', 'senha123'); await p.click('#ac-login-btn');
    await p.waitForFunction(() => typeof nav === 'function' && document.querySelector('#panel-hoje .card'), null, { timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(1200);
    // o cabeçalho (barra superior) também é medido, pela tela Início
    for (const id of PAINEIS) {
      await p.evaluate((x) => nav(null, x), id); await p.waitForTimeout(1600);
      const m = await p.evaluate(medir, id);
      Object.entries(m).forEach(([k, v]) => {
        const lista = Array.isArray(v) ? v : v > 1 ? ['página rola ' + v + 'px para o lado'] : [];
        lista.forEach((x) => { const chave = tema + ' ' + w + ' ' + id; ((rel[k] = rel[k] || {})[chave] = rel[k][chave] || []).push(x); total++; });
      });
    }
    await ctx.close();
  }
  await b.close();
  const resumo = Object.fromEntries(Object.entries(rel).map(([k, v]) => [k, Object.values(v).reduce((a, l) => a + l.length, 0)]));
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ resumo, rel }, null, 1));
  console.log(total ? 'caça-bugs: ' + total + ' ocorrência(s) ' + JSON.stringify(resumo) : 'caça-bugs: nenhuma ocorrência');
  if (!process.argv[2]) Object.entries(rel).forEach(([k, v]) => Object.entries(v).forEach(([onde, l]) => l.slice(0, 5).forEach((x) => console.log('  ' + k + ' [' + onde + '] ' + x))));
  process.exit(total ? 1 : 0);
})();
