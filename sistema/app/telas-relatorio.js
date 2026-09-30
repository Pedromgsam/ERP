'use strict';
// ═══════════════════════════════════════════════════════════════════
// Relatório em PDF (Backup 29) — refeito do zero no desenho novo.
// Escolhe o grupo (ou todos) e as seções; abre a prévia numa aba com o botão "Salvar em PDF".
// Lê direto do banco: passivo das empresas, parcelamentos, acordos, processos, vencimentos e honorários.
// ═══════════════════════════════════════════════════════════════════
const SECOES_PDF = [['passivo', 'Passivo tributário por empresa', true], ['parcelamentos', 'Parcelamentos', true], ['acordos', 'Acordos', true],
  ['processos', 'Processos judiciais', true], ['vencimentos', 'Vencimentos dos próximos 30 dias', true], ['honorarios', 'Honorários (a receber e em atraso)', false]];

function janelaRelatorioPDF() {
  const j = abrirJanela({ titulo: '📄 Relatório em PDF',
    corpo: '<div class="grade">' + campo('Grupo', '<select id="rp-grupo"><option value="">Todos os grupos (carteira inteira)</option>' + E.grupos.map((g) => '<option value="' + g.id + '">' + esc(g.nome) + '</option>').join('') + '</select>', 'inteiro') +
      '<div class="inteiro"><div class="secao">O que entra no relatório</div><div class="rp-secoes">' + SECOES_PDF.map(([k, r, on]) =>
        '<label class="check"><input type="checkbox" data-rp="' + k + '"' + (on ? ' checked' : '') + '> ' + r + '</label>').join('') + '</div></div>' +
      '<div class="dica inteiro">Abre a prévia numa aba nova. Lá, clique em <b>Salvar em PDF</b> (ou Ctrl+P → "Salvar como PDF").</div></div>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="rp-gerar">📄 Gerar relatório</button></div>' });
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#rp-gerar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const w = window.open('', '_blank');
    if (!w) throw new Error('O navegador bloqueou a aba nova: permita pop-ups para este site e tente de novo.');
    w.document.write('<p style="font-family:sans-serif;padding:30px">Montando o relatório…</p>');
    const grupo = j.querySelector('#rp-grupo').value, sec = {};
    j.querySelectorAll('[data-rp]').forEach((c) => { sec[c.dataset.rp] = c.checked; });
    try { const html = await montarRelatorioPDF(grupo, sec); w.document.open(); w.document.write(html); w.document.close(); fecharJanela(j); }
    catch (e) { w.close(); throw e; }
  });
  return j;
}

async function montarRelatorioPDF(grupoId, sec) {
  await carregarCadastros();
  const h = hojeISO(), lim30 = somarDias(h, 30), g = E.grupos.find((x) => x.id === grupoId);
  const doGrupo = (qq) => (grupoId ? qq.eq('grupo_id', grupoId) : qq);
  const [parcs, acs, procs, lancs] = await Promise.all([
    sec.parcelamentos || sec.vencimentos ? buscarTodos(() => doGrupo(sb.from('parcelamentos').select('id, empresa, natureza, local, numero, total_parcelas, valor_ultima_parcela, grupo_id, grupos(nome), parcelas(numero, vencimento, pago)'))).catch(() => []) : [],
    sec.acordos || sec.vencimentos ? buscarTodos(() => doGrupo(sb.from('acordos').select('id, devedor, credor, processo, parcela, total_parcelas, valor, vencimento, pago, grupo_id'))).catch(() => []) : [],
    sec.processos ? buscarTodos(() => doGrupo(sb.from('processos').select('numero, natureza, competencia, autor, reu, valor, status, ultima_movimentacao, ultima_movimentacao_em, grupos(nome)'))).catch(() => []) : [],
    sec.honorarios ? buscarTodos(() => doGrupo(sb.from('lancamentos').select('descricao, valor, vencimento, empresa, redutor, grupos(nome), clientes(nome)').eq('tipo', 'receita').eq('pago', false).eq('perda', false))).catch(() => []) : []
  ]);
  const cli = E.clientes.filter((c) => (!grupoId || c.grupo_id === grupoId) && c.tipo !== 'Inativo');
  const n = (v) => Number(v) || 0, R = (v) => (n(v) ? brl(v) : '—');
  const aberto = (c) => n(c.rfb) + n(c.pgfn) + n(c.age_mg) + n(c.sefaz_mg), neg = (c) => n(c.rfb_negociada) + n(c.pgfn_negociada) + n(c.age_mg_negociada);
  const totAb = cli.reduce((s, c) => s + aberto(c), 0), totNeg = cli.reduce((s, c) => s + neg(c), 0);
  // parcelamentos: pagas, atraso, próxima
  const P = parcs.map((p) => { const ps = p.parcelas || [], ab = ps.filter((x) => !x.pago).sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
    return Object.assign(p, { pagas: ps.filter((x) => x.pago).length, atr: ab.filter((x) => x.vencimento < h).length, prox: ab.find((x) => x.vencimento >= h) || null, abertas: ab }); })
    .filter((p) => p.abertas.length);
  // acordos: agrupados por devedor × credor × processo
  const AG = {}; acs.forEach((a) => { const k = [a.devedor, a.credor, a.processo].join('|'); (AG[k] = AG[k] || { a, l: [] }).l.push(a); });
  const A = Object.values(AG).map((x) => { const ab = x.l.filter((y) => !y.pago).sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
    return { a: x.a, pagas: x.l.length - ab.length, total: x.l.length, saldo: ab.reduce((s, y) => s + n(y.valor), 0), atr: ab.filter((y) => y.vencimento < h).length, prox: ab.find((y) => y.vencimento >= h) || null }; })
    .filter((x) => x.saldo > 0);
  const venc = [].concat(
    P.flatMap((p) => p.abertas.filter((x) => x.vencimento <= lim30).map((x) => ({ d: x.vencimento, tipo: 'Parcelamento', quem: p.empresa, det: [p.local, p.natureza].filter(Boolean).join(' — ') + ' · parcela ' + x.numero + (p.total_parcelas ? '/' + p.total_parcelas : ''), v: n(p.valor_ultima_parcela) }))),
    acs.filter((a) => !a.pago && a.vencimento <= lim30).map((a) => ({ d: a.vencimento, tipo: 'Acordo', quem: a.devedor, det: 'deve a ' + (a.credor || '—') + ' · parcela ' + (a.parcela || '') + (a.total_parcelas ? '/' + a.total_parcelas : ''), v: n(a.valor) })))
    .sort((a, b) => String(a.d).localeCompare(String(b.d)));
  const atrParc = P.reduce((s, p) => s + p.atr, 0), atrAc = A.reduce((s, x) => s + x.atr, 0);
  const tab = (cab, linhas, dir, total) => '<table><thead><tr>' + cab.map((c, i) => '<th' + (dir && dir.includes(i) ? ' class="r"' : '') + '>' + c + '</th>').join('') + '</tr></thead><tbody>' +
    (linhas.length ? linhas.map((l) => '<tr>' + l.map((v, i) => '<td' + (dir && dir.includes(i) ? ' class="r"' : '') + '>' + v + '</td>').join('') + '</tr>').join('') : '<tr><td colspan="' + cab.length + '" class="vazio">Nada a mostrar.</td></tr>') +
    (total ? '<tr class="tot">' + total.map((v, i) => '<td' + (dir && dir.includes(i) ? ' class="r"' : '') + '>' + v + '</td>').join('') + '</tr>' : '') + '</tbody></table>';
  const pill = (t, c) => '<span class="p ' + c + '">' + esc(t) + '</span>';
  const capag = (v) => v ? pill(v, { A: 'ok', B: 'ok', C: 'at', D: 'rv', OMISSO: 'rv' }[String(v).toUpperCase()] || 'nx') : '—';
  const S = [];
  if (sec.passivo) S.push(['Passivo tributário por empresa', cli.length + ' empresa(s) ativa(s)', tab(['Empresa', 'CNPJ', 'RFB', 'PGFN', 'AGE/MG', 'SEFAZ/MG', 'Negociado', 'CAPAG'],
    cli.sort((a, b) => aberto(b) - aberto(a)).map((c) => ['<b>' + esc(c.nome) + '</b>' + (!grupoId && c.grupos ? '<div class="s">' + esc(c.grupos.nome) + '</div>' : ''), esc(mascaraDoc(c.cpf_cnpj) || '—'), R(c.rfb), R(c.pgfn), R(c.age_mg), R(c.sefaz_mg), R(neg(c)), capag(c.capag)]),
    [2, 3, 4, 5, 6], ['<b>Total</b>', '', R(cli.reduce((s, c) => s + n(c.rfb), 0)), R(cli.reduce((s, c) => s + n(c.pgfn), 0)), R(cli.reduce((s, c) => s + n(c.age_mg), 0)), R(cli.reduce((s, c) => s + n(c.sefaz_mg), 0)), R(totNeg), ''])]);
  if (sec.parcelamentos) S.push(['Parcelamentos', P.length + ' em andamento' + (atrParc ? ' · ' + atrParc + ' parcela(s) em atraso' : ''), tab(['Empresa', 'Órgão / natureza', 'Nº', 'Pagas', 'Próxima parcela', 'Situação'],
    P.map((p) => ['<b>' + esc(p.empresa || '—') + '</b>', esc([p.local, p.natureza].filter(Boolean).join(' — ') || '—'), esc(p.numero || '—'), p.pagas + ' de ' + (p.total_parcelas || (p.parcelas || []).length),
      p.prox ? dataBR(p.prox.vencimento) + ' · ' + R(p.valor_ultima_parcela) : '—', p.atr ? pill(p.atr + ' em atraso' + (p.atr >= 2 ? ' — risco' : ''), 'rv') : pill('Em dia', 'ok')]), [])]);
  if (sec.acordos) S.push(['Acordos', A.length + ' em andamento' + (atrAc ? ' · ' + atrAc + ' parcela(s) em atraso' : ''), tab(['Devedor', 'Credor', 'Processo', 'Pagas', 'Saldo', 'Próxima', 'Situação'],
    A.map((x) => ['<b>' + esc(x.a.devedor || '—') + '</b>', esc(x.a.credor || '—'), esc(x.a.processo || '—'), x.pagas + ' de ' + x.total, R(x.saldo), x.prox ? dataBR(x.prox.vencimento) + ' · ' + R(x.prox.valor) : '—',
      x.atr ? pill(x.atr + ' em atraso', 'rv') : pill('Em dia', 'ok')]), [4], ['<b>Total</b>', '', '', '', R(A.reduce((s, x) => s + x.saldo, 0)), '', ''])]);
  if (sec.processos) S.push(['Processos judiciais', procs.length + ' processo(s)', tab(['Processo', 'Natureza', 'Competência', 'Partes', 'Valor da causa', 'Última movimentação'],
    procs.map((p) => ['<b class="m">' + esc(p.numero) + '</b>' + (!grupoId && p.grupos ? '<div class="s">' + esc(p.grupos.nome) + '</div>' : ''), esc(p.natureza || '—'), esc(p.competencia || '—'),
      esc([p.autor, p.reu].filter(Boolean).join(' × ') || '—'), R(p.valor), p.ultima_movimentacao ? esc(p.ultima_movimentacao) + (p.ultima_movimentacao_em ? '<div class="s">' + dataBR(p.ultima_movimentacao_em) + '</div>' : '') : '<span class="s">—</span>']),
    [4], ['<b>Total</b>', '', '', '', R(procs.reduce((s, p) => s + n(p.valor), 0)), ''])]);
  if (sec.vencimentos) S.push(['Vencimentos dos próximos 30 dias', 'inclui o que já venceu e não foi pago', tab(['Vencimento', 'Tipo', 'Empresa / devedor', 'Detalhe', 'Valor'],
    venc.map((x) => [(x.d < h ? '<b class="rv-t">' : '<b>') + dataBR(x.d) + '</b>', esc(x.tipo), esc(x.quem || '—'), esc(x.det), R(x.v)]), [4], ['<b>Total</b>', '', '', '', R(venc.reduce((s, x) => s + x.v, 0))])]);
  if (sec.honorarios) { const atr = lancs.filter((l) => l.vencimento < h), s2 = (l) => l.reduce((s, x) => s + (x.redutor ? -n(x.valor) : n(x.valor)), 0);
    S.push(['Honorários', 'a receber ' + brl(s2(lancs)) + ' · em atraso ' + brl(s2(atr)), tab(['Vencimento', 'Quem', 'Descrição', 'Empresa', 'Valor'],
      lancs.sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento))).map((l) => [(l.vencimento < h ? '<b class="rv-t">' : '<b>') + dataBR(l.vencimento) + '</b>', esc((l.grupos && l.grupos.nome) || (l.clientes && l.clientes.nome) || '—'),
        esc(l.descricao || ''), l.empresa === 'contabilidade' ? 'Contabilidade' : 'Jurídico', R(l.redutor ? -l.valor : l.valor)]), [4], ['<b>Total</b>', '', '', '', R(s2(lancs))])]); }
  const kpis = [['Passivo em aberto', brl(totAb), cli.length + ' empresa(s)', 'rv'], ['Negociado', brl(totNeg), 'parcelado ou em acordo', 'az'],
    ['Parcelamentos', String(P.length), atrParc ? atrParc + ' parcela(s) em atraso' : 'todos em dia', atrParc ? 'rv' : 'ok'], ['Acordos', String(A.length), 'saldo ' + brl(A.reduce((s, x) => s + x.saldo, 0)), atrAc ? 'at' : 'ok'],
    ['Processos', String(procs.length || '—'), sec.processos ? 'valor ' + brl(procs.reduce((s, p) => s + n(p.valor), 0)) : 'não incluído', 'az']];
  const titulo = 'Relatório — ' + (g ? g.nome : 'Carteira completa') + ' — ' + dataBR(h).replace(/\//g, '-');
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(titulo) + '</title>' +
    '<style>' + CSS_RELATORIO + '</style></head><body>' +
    '<div class="barra no-print"><span>Prévia do relatório</span><button onclick="window.print()">Salvar em PDF</button></div>' +
    '<main><header class="cab"><div><div class="marca">Araújo &amp; Castro</div><div class="sub-m">Advocacia · Contabilidade · Consultoria</div></div>' +
      '<div class="cab-d"><div class="t">' + esc(g ? g.nome : 'Carteira completa') + '</div><div>Relatório gerado em ' + dataHoraBR(new Date().toISOString()) + '</div></div></header>' +
    '<section class="kpis">' + kpis.map(([l, v, s, c]) => '<div class="kpi"><div class="kl"><i class="' + c + '"></i>' + l + '</div><div class="kv">' + v + '</div><div class="ks">' + esc(s) + '</div></div>').join('') + '</section>' +
    S.map(([t, d, corpo]) => '<section class="sec"><h2>' + esc(t) + '<small>' + esc(d) + '</small></h2>' + corpo + '</section>').join('') +
    '<footer>Relatório do sistema do escritório Araújo &amp; Castro · dados de ' + dataBR(h) + ' · uso interno e do cliente</footer></main>' +
    '</body></html>';
}

// cores fixas (o PDF sai igual no modo claro ou escuro da tela)
const CSS_RELATORIO = [
  '@page{size:A4;margin:12mm 11mm}',
  '*{box-sizing:border-box}body{margin:0;background:#EEF1F6;font-family:"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1F2937;font-size:11.5px;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
  '.barra{position:sticky;top:0;display:flex;justify-content:space-between;align-items:center;padding:10px 18px;background:#1B2A4A;color:#fff;z-index:5}',
  '.barra button{background:#C9A84C;color:#1B2A4A;border:0;border-radius:8px;padding:8px 16px;font-weight:700;cursor:pointer}',
  'main{max-width:1000px;margin:18px auto;background:#fff;padding:26px 30px;border-radius:12px;box-shadow:0 2px 14px rgba(0,0,0,.08)}',
  '.cab{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #C9A84C;padding-bottom:12px;margin-bottom:16px}',
  '.marca{font-family:Georgia,serif;font-size:22px;font-weight:700;color:#1B2A4A}.sub-m{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:#6B7280;margin-top:2px}',
  '.cab-d{text-align:right;color:#6B7280;font-size:10.5px}.cab-d .t{font-size:16px;font-weight:700;color:#1B2A4A;text-transform:uppercase;margin-bottom:2px}',
  '.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:18px}',
  '.kpi{border:1px solid #E5E7EB;border-radius:10px;padding:9px 11px;break-inside:avoid}.kl{font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6B7280;display:flex;align-items:center;gap:5px}',
  '.kl i{width:7px;height:7px;border-radius:50%;display:inline-block;background:#9CA3AF}.kl i.rv{background:#B42318}.kl i.ok{background:#1E7B45}.kl i.at{background:#B7791F}.kl i.az{background:#2E4C81}',
  '.kv{font-size:15px;font-weight:700;color:#1B2A4A;margin-top:3px}.ks{font-size:9.5px;color:#6B7280;margin-top:1px}',
  '.sec{margin-top:16px}h2{font-size:13px;color:#1B2A4A;margin:0 0 7px;display:flex;align-items:baseline;gap:8px;break-after:avoid}h2 small{font-size:10px;font-weight:400;color:#6B7280}',
  'table{width:100%;border-collapse:collapse;font-size:10.5px}thead{display:table-header-group}th{background:#F3F5F9;color:#374151;text-align:left;font-size:9px;letter-spacing:.05em;text-transform:uppercase;padding:6px 7px;border-bottom:1px solid #D9DEE7}',
  'td{padding:6px 7px;border-bottom:1px solid #EEF0F4;vertical-align:top}tr{break-inside:avoid}.r{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}',
  'tr.tot td{border-top:2px solid #1B2A4A;border-bottom:0;font-weight:700;background:#FAFBFD}.vazio{color:#9CA3AF;text-align:center;padding:12px}',
  '.s{font-size:9.5px;color:#6B7280;margin-top:1px}.m{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10px}.rv-t{color:#B42318}',
  '.p{display:inline-block;padding:1px 8px;border-radius:99px;font-size:9.5px;font-weight:700;border:1px solid}.p.ok{background:#E8F5EC;color:#1E7B45;border-color:#B7DFC3}.p.rv{background:#FDECEA;color:#B42318;border-color:#F4C2BC}.p.at{background:#FFF6E0;color:#8A5A00;border-color:#F0D9A0}.p.nx{background:#F3F4F6;color:#6B7280;border-color:#E5E7EB}',
  'footer{margin-top:22px;padding-top:8px;border-top:1px solid #E5E7EB;font-size:9px;color:#9CA3AF;text-align:center}',
  '@media print{body{background:#fff}.no-print{display:none!important}main{box-shadow:none;margin:0;max-width:none;padding:0;border-radius:0}}'
].join('\n');
