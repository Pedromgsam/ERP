'use strict';
// ═══════════════════════════════════════════════════════════════════
// Gráficos em SVG escrito à mão (sem biblioteca externa), no padrão
// "telas com dados" do escritório:
//  · barra de ranking  → rampa azul pelo posto (maior = mais escuro)
//  · série mensal      → passado #8CAADE, mês atual #16294B, futuro #C6D1EF
//  · rosca por órgão   → cor fixa por categoria, saturação contida
// Todo gráfico tem dica ao passar o mouse (valor exato) e legenda/rótulo,
// para a cor nunca ser a única forma de identificar.
// ═══════════════════════════════════════════════════════════════════

const RAMPA_AZUL = ['#16294B', '#223A66', '#2E4C81', '#3B5E9C', '#4A71B5',
                    '#5D84C5', '#7397D3', '#8CAADE', '#A8BDE7', '#C6D1EF'];
function tomAzul(i, n) {
  if (!n || n <= 1) return RAMPA_AZUL[0];
  const passos = Math.min(n, RAMPA_AZUL.length);
  const k = Math.round(i * (RAMPA_AZUL.length - 1) / (passos - 1));
  return RAMPA_AZUL[Math.min(k, RAMPA_AZUL.length - 1)];
}
// Ordem e tons validados (daltonismo e visão normal) — ver sistema/README.md.
const CORES_ORGAO = { 'PGFN': '#5873C1', 'AGE/MG': '#AD6833', 'RFB': '#23906F', 'SEFAZ/MG': '#9A79D2' };
const COR_MES = { passado: '#8CAADE', atual: '#16294B', futuro: '#C6D1EF' };

// Dica flutuante única, alimentada por data-dica.
(function () {
  const dica = document.createElement('div');
  dica.id = 'dica-grafico'; dica.setAttribute('role', 'tooltip');
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(dica));
  document.addEventListener('mousemove', (ev) => {
    const alvo = ev.target.closest && ev.target.closest('[data-dica]');
    if (!alvo) { dica.style.opacity = 0; return; }
    dica.textContent = alvo.getAttribute('data-dica');
    const x = Math.min(ev.clientX + 14, window.innerWidth - dica.offsetWidth - 8);
    dica.style.left = x + 'px'; dica.style.top = (ev.clientY + 14) + 'px'; dica.style.opacity = 1;
  });
})();

// Ranking horizontal: [{rotulo, valor}] já em ordem decrescente.
function graficoRanking(itens, opc) {
  opc = opc || {};
  if (!itens.length) return '<div class="vazio">Sem dados para o gráfico.</div>';
  const max = Math.max(...itens.map((i) => i.valor), 1);
  const alt = 30, larg = 640, esq = 170, dir = 110, util = larg - esq - dir;
  const h = itens.length * alt + 6;
  const ordem = itens.map((_, i) => i).sort((a, b) => itens[b].valor - itens[a].valor);
  const cor = []; ordem.forEach((orig, posto) => { cor[orig] = tomAzul(posto, itens.length); });
  let s = '<svg class="grafico" viewBox="0 0 ' + larg + ' ' + h + '" role="img" aria-label="' + esc(opc.titulo || 'Ranking') + '">';
  itens.forEach((it, i) => {
    const y = i * alt + 4, w = Math.max(2, it.valor / max * util);
    const nome = it.rotulo.length > 24 ? it.rotulo.slice(0, 23) + '…' : it.rotulo;
    const dica = it.rotulo + ': ' + brl(it.valor) + (it.extra ? ' · ' + it.extra : '');
    s += '<g data-dica="' + esc(dica) + '"' + (it.acao ? ' class="clicavel" data-acao="' + esc(it.acao) + '"' : '') + '>' +
      '<rect x="0" y="' + (y - 2) + '" width="' + larg + '" height="' + alt + '" fill="transparent"/>' +
      '<text x="' + (esq - 10) + '" y="' + (y + 16) + '" text-anchor="end" class="g-rot">' + esc(nome) + '</text>' +
      '<path d="M' + esq + ',' + (y + 4) + ' h' + (w - 4) + ' a4,4 0 0 1 4,4 v10 a4,4 0 0 1 -4,4 h-' + (w - 4) + ' z" fill="' + cor[i] + '"/>' +
      '<text x="' + (esq + w + 8) + '" y="' + (y + 16) + '" class="g-val">' + esc(brlCurto(it.valor)) + '</text></g>';
  });
  return s + '</svg>';
}

// Colunas por mês: [{rotulo, valor, estado:'passado'|'atual'|'futuro', dica}]
function graficoMensal(itens, opc) {
  opc = opc || {};
  if (!itens.length) return '<div class="vazio">Sem dados para o gráfico.</div>';
  const max = Math.max(...itens.map((i) => i.valor), 1);
  const larg = 640, h = 220, base = 180, topo = 22, col = larg / itens.length, bw = Math.min(34, col * 0.62);
  let s = '<svg class="grafico" viewBox="0 0 ' + larg + ' ' + h + '" role="img" aria-label="' + esc(opc.titulo || 'Por mês') + '">';
  // grade recessiva: metade e topo
  [0.5, 1].forEach((f) => {
    const y = base - (base - topo) * f;
    s += '<line x1="0" x2="' + larg + '" y1="' + y + '" y2="' + y + '" class="g-grade"/>' +
         '<text x="2" y="' + (y - 4) + '" class="g-eixo">' + esc(brlCurto(max * f)) + '</text>';
  });
  s += '<line x1="0" x2="' + larg + '" y1="' + base + '" y2="' + base + '" class="g-base"/>';
  itens.forEach((it, i) => {
    const x = i * col + (col - bw) / 2, hh = it.valor > 0 ? Math.max(3, it.valor / max * (base - topo)) : 0;
    const cor = COR_MES[it.estado] || COR_MES.passado;
    s += '<g data-dica="' + esc(it.dica || (it.rotulo + ': ' + brl(it.valor))) + '">' +
      '<rect x="' + (i * col) + '" y="' + topo + '" width="' + col + '" height="' + (base - topo + 30) + '" fill="transparent"/>' +
      (hh ? '<path d="M' + x + ',' + base + ' v-' + (hh - 4) + ' a4,4 0 0 1 4,-4 h' + (bw - 8) + ' a4,4 0 0 1 4,4 v' + (hh - 4) + ' z" fill="' + cor + '"/>' : '') +
      '<text x="' + (x + bw / 2) + '" y="' + (base + 16) + '" text-anchor="middle" class="g-eixo' + (it.estado === 'atual' ? ' g-forte' : '') + '">' + esc(it.rotulo) + '</text>' +
      (it.estado === 'atual' && hh ? '<text x="' + (x + bw / 2) + '" y="' + (base - hh - 6) + '" text-anchor="middle" class="g-val">' + esc(brlCurto(it.valor)) + '</text>' : '') +
      '</g>';
  });
  s += '</svg>';
  if (opc.legenda !== false) {
    s += '<div class="legenda"><span><i style="background:' + COR_MES.passado + '"></i>Meses anteriores</span>' +
      '<span><i style="background:' + COR_MES.atual + '"></i>Mês atual</span>' +
      (itens.some((i) => i.estado === 'futuro') ? '<span><i style="background:' + COR_MES.futuro + '"></i>Próximos meses (previsto)</span>' : '') + '</div>';
  }
  return s;
}

// Rosca: [{nome, valor}] com cores de CORES_ORGAO; legenda com % e valor.
function graficoRosca(itens, opc) {
  opc = opc || {};
  const total = soma(itens, (i) => i.valor);
  if (!(total > 0)) return '<div class="vazio">Sem valores para distribuir.</div>';
  const R = 70, r = 44, cx = 80, cy = 80;
  let ang = -Math.PI / 2, s = '<div class="rosca"><svg viewBox="0 0 160 160" role="img" aria-label="' + esc(opc.titulo || 'Distribuição') + '">';
  const ponto = (a, raio) => [cx + raio * Math.cos(a), cy + raio * Math.sin(a)];
  itens.filter((i) => i.valor > 0).forEach((it) => {
    const frac = it.valor / total, a2 = ang + frac * Math.PI * 2 - (frac < 1 ? 0.02 : 0);   // 0,02 rad = fresta de superfície
    const [x1, y1] = ponto(ang, R), [x2, y2] = ponto(a2, R), [x3, y3] = ponto(a2, r), [x4, y4] = ponto(ang, r);
    const grande = a2 - ang > Math.PI ? 1 : 0;
    const d = frac >= 0.999
      ? 'M' + (cx - R) + ',' + cy + ' a' + R + ',' + R + ' 0 1 0 ' + (2 * R) + ',0 a' + R + ',' + R + ' 0 1 0 -' + (2 * R) + ',0 M' + (cx - r) + ',' + cy + ' a' + r + ',' + r + ' 0 1 1 ' + (2 * r) + ',0 a' + r + ',' + r + ' 0 1 1 -' + (2 * r) + ',0'
      : 'M' + x1 + ',' + y1 + ' A' + R + ',' + R + ' 0 ' + grande + ' 1 ' + x2 + ',' + y2 + ' L' + x3 + ',' + y3 + ' A' + r + ',' + r + ' 0 ' + grande + ' 0 ' + x4 + ',' + y4 + ' Z';
    s += '<path d="' + d + '" fill="' + (CORES_ORGAO[it.nome] || '#8B93A3') + '" fill-rule="evenodd" data-dica="' +
      esc(it.nome + ': ' + brl(it.valor) + ' (' + (frac * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%)') + '"/>';
    ang += frac * Math.PI * 2;
  });
  s += '<text x="80" y="76" text-anchor="middle" class="g-eixo">Total</text><text x="80" y="94" text-anchor="middle" class="g-val g-forte">' +
    esc(brlCurto(total)) + '</text></svg><div class="rosca-leg">';
  itens.forEach((it) => {
    s += '<div data-dica="' + esc(it.nome + ': ' + brl(it.valor)) + '"><i style="background:' + (CORES_ORGAO[it.nome] || '#8B93A3') + '"></i>' +
      '<span class="nome">' + esc(it.nome) + '</span><span class="mono">' +
      (it.valor / total * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%</span><span class="mono sub">' + esc(brlCurto(it.valor)) + '</span></div>';
  });
  return s + '</div></div>';
}
