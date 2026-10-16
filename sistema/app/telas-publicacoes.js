'use strict';
// ═══════════════════════════════════════════════════════════════════
// Publicações — Diário de Justiça Eletrônico Nacional (API pública do CNJ).
// A função "erp-publicacoes" busca pelas OABs cadastradas (Backup 88: todo dia às 6h, na região de São Paulo,
// ou pelo botão "Buscar agora" — desde o Backup 52 pelo navegador); aqui a equipe lê, cria a tarefa com
// prazo sugerido em dias úteis e marca como tratada.
// ═══════════════════════════════════════════════════════════════════
const PALAVRAS_PUB = ['intimação', 'intimada', 'intimado', 'prazo', 'sentença', 'audiência', 'citação', 'citado', 'citada', 'decisão', 'penhora', 'bloqueio'];
// prazo sugerido (dias úteis) pelo tipo/texto; sempre editável na tarefa
function prazoSugerido(p) {
  const t = normalizar(p.tipo + ' ' + p.texto);
  const m = /prazo de (\d{1,3}) \(?[a-z]*\)? ?dias/.exec(t) || /prazo de (\d{1,3}) dias/.exec(t);
  if (m) return Math.min(90, +m[1]);
  if (/audiencia/.test(t)) return 5;
  if (/sentenca|acordao/.test(t)) return 15;
  if (/citacao|citad/.test(t)) return 15;
  if (/intima/.test(t)) return 15;
  if (/despacho/.test(t)) return 5;
  return 5;
}
function somarUteis(isoStr, n, fer) {
  let d = isoStr;
  for (let i = 0; i < n; i++) { d = somarDias(d, 1); while (!diaUtil(d, fer)) d = somarDias(d, 1); }
  return d;
}
function destacar(texto) {
  let h = esc(texto);
  PALAVRAS_PUB.forEach((w) => { h = h.replace(new RegExp('(' + w + ')', 'gi'), '<mark>$1</mark>'); });
  return h;
}

TELAS.publicacoes = async function () {
  E.pub = E.pub || { status: 'nova', adv: '', tribunal: '', dias: '30', busca: '' };
  const F = E.pub; F.status = 'nova';   // Backup 49 (31): sempre abre em Novas
  $('conteudo').innerHTML =
    // Backup 77: a tela voltou a ser a de antes do Backup 72 (cartões com o texto, filtros em botões), a pedido; só o cabeçalho segue o padrão único (ícone + título)
    '<div class="titulo-pag b-cab"><div class="b-cab-ic">' + iconeB('publicacao') + '</div><div class="b-cab-tx"><h1>Publicações</h1><p id="pub-ult">Intimações do Diário de Justiça</p></div>' +
    '<div class="acoes">' + maisB([['pub-todas-lidas', 'Marcar todas as novas como lidas']]) +   // Backup 89 (D2): ação rara no ⋯
    '<button class="btn btn-o" id="pub-oabs">⚙ Monitoramento (OABs e clientes)</button><button class="btn btn-p" id="pub-buscar" title="Busca no Diário do CNJ pelo seu navegador (se ele falhar, tenta pelo servidor)">↻ Buscar agora</button></div></div>' +
    '<div class="filtros"><div class="segmento" id="pub-st">' + [['nova', 'Novas'], ['lida', 'Lidas'], ['tratada', 'Tratadas'], ['', 'Todas']].map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<select class="busca sel" id="pub-dias"><option value="7">Últimos 7 dias</option><option value="15">Últimos 15 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="">Todo o período</option></select>' +

    '<input class="busca" id="pub-busca" placeholder="Buscar no texto, processo ou parte" autocomplete="off"></div>' +
    // Backup 21: tribunais como filtro de botões — só os que têm publicação pendente (nova ou lida) no período
    // Backup 35: filtro por advogado (os nomes cadastrados em Monitoramento → OABs) em botões, como os tribunais
    '<div class="filtros pub-trib-linha"><div class="segmento" id="pub-advs" role="group" aria-label="Advogado"></div></div>' +
    '<div class="filtros pub-trib-linha"><div class="segmento" id="pub-trib" role="group" aria-label="Tribunal"></div></div><div id="pub-corpo"><div class="carregando">Carregando…</div></div>';
  $('pub-oabs').onclick = () => janelaOabs();
  $('pub-todas-lidas').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!await confirmarB('Marcar TODAS as publicações novas como lidas?')) return;
    const r = (await q(sb.from('publicacoes').update({ status: 'lida' }).eq('status', 'nova').select('id'))) || [];
    aviso('✓ ' + plural(r.length, 'publicação marcada como lida', 'publicações marcadas como lidas') + '.'); await carregarPublicacoes();
  });
  // Backup 52 (C5): "Buscar agora" busca PELO NAVEGADOR (o CNJ recusa o servidor do Supabase, que fica fora do Brasil);
  // se o navegador não alcançar o CNJ, tenta a função erp-publicacoes como reserva e explica. O antigo "🌐 Buscar pelo navegador" virou este botão.
  $('pub-buscar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const r = await buscarPubNoNavegador({ silencioso: true, detalhe: true });
    if (r.semMonitoramento) throw new Error('Cadastre pelo menos uma OAB ou um cliente em "Monitoramento".');
    if (r.erros.length && !r.lidas) {
      const data = await chamarFuncao('erp-publicacoes', {}).catch((e) => ({ erros: [e.message] }));
      const erro = data.erros && data.erros.length ? data.erros[0] : '';
      if (!erro) aviso('✓ Busca feita (pelo servidor, porque o navegador não alcançou o CNJ): ' + (data.novas ? plural(data.novas, 'intimação nova', 'intimações novas') : 'nenhuma intimação nova') + '.');
      else aviso('⚠ A busca não foi feita. Pelo navegador: ' + r.erros[0] + '. Pelo servidor: ' + erro + '. Tente de novo em alguns minutos.', true);
    } else aviso('✓ Busca feita: ' + (r.novas ? plural(r.novas, 'intimação nova', 'intimações novas') : 'nenhuma intimação nova') + '.' + (r.erros.length ? ' Atenção: ' + r.erros[0] : ''), !!r.erros.length);
    await TELAS.publicacoes();
  });
  $('pub-st').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.status = b.dataset.v; pintarPublicacoes(); } };
  $('pub-trib').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.tribunal = b.dataset.v; pintarPublicacoes(); } };
  $('pub-dias').onchange = (ev) => { F.dias = ev.target.value; carregarPublicacoes(); };
  $('pub-advs').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.adv = b.dataset.v; pintarPublicacoes(); } };
  $('pub-dias').value = F.dias; $('pub-busca').value = F.busca;
  let t; $('pub-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; pintarPublicacoes(); }, 250); };
  q(sb.from('configuracoes').select('valor').eq('chave', 'publicacoes_ultima').maybeSingle()).then((u) => {
    E._pubUlt = u && u.valor; textoUltimaBusca();
  }).catch(() => {});
  await carregarPublicacoes();
  textoUltimaBusca();
};
// Backup 88: "Última busca: 18/10/2026 06:00. 3 novas intimações — Pedro (2), Emanuelle (1)" — só as NOVAS daquele dia (sem as lidas)
function textoUltimaBusca() {
  const u = E._pubUlt, el = $('pub-ult'); if (!el || !u || !u.quando) return;
  const dia = iso(new Date(u.quando)), novas = (E._pubs || []).filter((p) => p.criado_em && iso(new Date(p.criado_em)) === dia);
  const porAdv = {}; novas.forEach((p) => { const n = String(p.advogado || '').trim().split(/\s+/)[0] || 'Sem advogado'; porAdv[n] = (porAdv[n] || 0) + 1; });
  const n = E._pubs ? novas.length : Number(u.novas) || 0;
  el.textContent = 'Última busca: ' + quandoRodou(u.quando) + '. ' + (n ? plural(n, 'nova intimação', 'novas intimações') : 'Nenhuma intimação nova') +
    (Object.keys(porAdv).length ? ' — ' + Object.keys(porAdv).sort((a, b) => porAdv[b] - porAdv[a] || a.localeCompare(b, 'pt-BR')).map((k) => k + ' (' + porAdv[k] + ')').join(', ') : '') +
    (u.erros && u.erros.length ? ' · ⚠ ' + u.erros[0] : '');
}
// Backup 88: de que lado o advogado do escritório está — antes ia sempre no Autor quando o cliente não era a "parte monitorada"
// (ex.: Emanuelle aparecia como advogada do IEF, mas ela é advogada do réu). Ordem: parte monitorada → texto da intimação
// ("Advogado do(a) RÉU/REQUERIDO: …" perto do nome/OAB) → qual parte é cliente do escritório → um polo só entre os intimados. Sem certeza: linha própria.
const PALAVRAS_PASSIVO = /\b(reu|re|requerid[oa]s?|reclamad[oa]s?|executad[oa]s?|impetrad[oa]s?|agravad[oa]s?|apelad[oa]s?|recorrid[oa]s?|embargad[oa]s?|denunciad[oa]s?|investigad[oa]s?|passivo|demandad[oa]s?)\b/g;
const PALAVRAS_ATIVO = /\b(autor(a|es)?|requerentes?|reclamantes?|exequentes?|impetrantes?|agravantes?|apelantes?|recorrentes?|embargantes?|ativo|demandantes?)\b/g;
function ladoDoAdvogado(p, G, adv, oab) {
  const nrm = (x) => normalizar(String(x || '')).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const casa = (a, b) => { a = nrm(a); b = nrm(b); return a.length > 3 && b.length > 3 && (a.includes(b) || b.includes(a)); };
  const tem = (lado, nomes) => G[lado].some((n) => n !== '—' && nomes.some((x) => casa(n, x)));
  const unico = (fn) => { const a = fn('Autor'), r = fn('Réu'); return a && !r ? 'Autor' : r && !a ? 'Réu' : ''; };
  if (p.parte_monitorada) { const l = unico((x) => tem(x, [p.parte_monitorada])); if (l) return l; }
  const t = nrm(p.texto);
  if (t) {
    const marcas = [nrm(adv), String(oab != null ? oab : p.oab_numero || '').replace(/\D/g, '')].filter((x) => x.length > 2);
    for (const m of marcas) {
      let i = t.indexOf(m);
      while (i >= 0) {
        const antes = t.slice(Math.max(0, i - 140), i), ult = (re) => { let k = -1, x; re.lastIndex = 0; while ((x = re.exec(antes))) k = x.index; return k; };
        const kp = ult(PALAVRAS_PASSIVO), ka = ult(PALAVRAS_ATIVO);
        if (kp > ka) return 'Réu'; if (ka > kp) return 'Autor';
        i = t.indexOf(m, i + m.length);
      }
    }
  }
  const nossos = (E.clientes || []).map((c) => c.nome).concat((E.grupos || []).map((g) => g.nome)).filter(Boolean);
  if (nossos.length) { const l = unico((x) => tem(x, nossos)); if (l) return l; }
  const pol = Array.isArray(p.polos) ? [...new Set(p.polos.map((d) => String((d && d.polo) || '').toUpperCase()).filter((x) => x === 'A' || x === 'P'))] : [];
  if (pol.length === 1) return pol[0] === 'P' ? 'Réu' : 'Autor';
  return '';
}
// Backup 89: TODOS os advogados do escritório citados na intimação (a busca grava uma vez só, pela 1ª OAB que achou):
// os nomes das OABs monitoradas que aparecem na lista de advogados do Diário (pelo nº da OAB ou pelo nome), mais o da OAB que achou
function advsDoEscritorio(p) {
  const lista = String(p.advogados || ''), dig = lista.replace(/[^\d;]/g, ' '), nl = normalizar(lista), out = [];
  const add = (nome, oab, uf) => { nome = String(nome || '').trim(); if (!nome) return; const k = primeiroNomePub(nome); if (out.some((x) => primeiroNomePub(x.nome) === k)) return; out.push({ nome, oab: oab || '', uf: uf || '' }); };
  if (p.advogado) add(p.advogado, p.oab_numero, p.oab_uf);
  (E._pubOabs || []).forEach((o) => { const n = String(o.numero || '').replace(/\D/g, '');
    if ((n.length > 3 && new RegExp('(^|\\D)' + n + '(\\D|$)').test(dig)) || (o.advogado && nl.includes(normalizar(o.advogado)))) add(o.advogado, o.numero, o.uf); });
  return out;
}
const primeiroNomePub = (n) => normalizar(String(n || '').trim().split(/\s+/)[0]);
// Partes em linhas: "Autor: …" e "Réu: …" (polo do Diário; as antigas sem polo continuam em "Partes:")
// Backup 28: identificação no topo de toda publicação (para copiar e encaixar rápido):
//   Processo: 5003925-39.2025.8.13.0604 / Autor: … / Réu: … — Advogado: Pedro
function partesPub(p) {
  const G = { 'Autor': [], 'Réu': [], 'Partes': [] };
  if (Array.isArray(p.polos) && p.polos.some((d) => d && d.polo)) p.polos.forEach((d) => { if (d && d.nome) G[{ A: 'Autor', P: 'Réu' }[String(d.polo || '').toUpperCase()] || 'Partes'].push(d.nome); });
  else String(p.destinatarios || '').split(/;\s*/).filter(Boolean).forEach((x) => { const m = /^(Autor|Réu):\s*(.*)$/.exec(x); if (m) G[m[1]].push(m[2]); else G.Partes.push(x); });
  const advs = advsDoEscritorio(p);
  if (!advs.length) { const a0 = String(p.advogados || '').split(';')[0].replace(/\s*OAB.*$/i, '').trim(); if (a0) advs.push({ nome: a0, oab: '' }); }
  // Backup 79: sempre Processo, Autor e Réu (— quando o Diário não informa); o advogado do escritório vai na linha da parte que é o cliente
  // (a parte monitorada), senão na do Autor
  if (!G.Partes.length || G['Autor'].length || G['Réu'].length) { if (!G['Autor'].length) G['Autor'].push('—'); if (!G['Réu'].length) G['Réu'].push('—'); }
  // cada advogado do escritório no lado que ele representa; sem certeza do lado, numa linha própria (nunca do lado errado)
  const porLado = {}, semLado = [];
  advs.forEach((a) => { const l = ladoDoAdvogado(p, G, a.nome, a.oab); if (l) (porLado[l] = porLado[l] || []).push(a.nome); else semLado.push(a.nome); });
  const rot = (ns) => (ns.length > 1 ? 'Advogados: ' : 'Advogado: ') + ns.join(', ');
  const linhas = [['Processo', p.processo || '—']].concat(Object.keys(G).filter((k) => G[k].length).map((k) => [k, G[k].join(' · ')]));
  if (semLado.length) linhas.push([semLado.length > 1 ? 'Advogados' : 'Advogado', semLado.join(', ')]);
  const txt = linhas.map((l) => l[0] + ': ' + l[1] + (porLado[l[0]] ? ' - ' + rot(porLado[l[0]]) : '')).join('\n');
  return '<div class="pub-id"><div class="pub-id-txt">' + linhas.map((l) => '<div><b>' + l[0] + ':</b> ' + (l[0] === 'Processo' ? '<span class="mono">' + esc(l[1]) + '</span>' : esc(l[1])) +
      (porLado[l[0]] ? ' <span class="pub-adv">— ' + (porLado[l[0]].length > 1 ? 'Advogados' : 'Advogado') + ': <b>' + esc(porLado[l[0]].join(', ')) + '</b></span>' : '') + '</div>').join('') + '</div>' +
    '<button type="button" class="btn btn-o btn-mini" data-copiar-id="' + esc(txt) + '" title="Copiar Processo, Autor, Réu e Advogado">📋 Copiar</button></div>';
}
async function carregarPublicacoes() {
  const F = E.pub;
  E._pubs = await buscarTodos(() => { let c = sb.from('publicacoes').select('id, data_disponibilizacao, tribunal, orgao, tipo, processo, processo_numero, classe, texto, link, destinatarios, polos:bruto->destinatarios, advogados, oab_numero, oab_uf, advogado, parte_monitorada, processo_id, status, tarefa_id, criado_em')
    .order('data_disponibilizacao', { ascending: false, nullsFirst: false }); if (F.dias) c = c.gte('data_disponibilizacao', somarDias(hojeISO(), -Number(F.dias))); return c; });
  const opts = (id, vals, rot) => { const s = $(id); if (!s) return; const v = s.value; s.innerHTML = '<option value="">' + rot + '</option>' + [...new Set(vals.filter(Boolean))].sort().map((x) => '<option>' + esc(x) + '</option>').join(''); s.value = v; };
  void opts;
  E._pubOabs = await q(sb.from('oabs_monitoradas').select('advogado, numero, uf')).catch(() => []);
  E._pubAdvs = (E._pubOabs || []).map((o) => o.advogado);
  pintarPublicacoes();
}
function pintarPublicacoes() {
  const F = E.pub, b = normalizar(F.busca);
  if (!$('pub-corpo')) return;
  const todas = E._pubs || [];
  // Backup 36: cada contador mostra exatamente o que aparece ao clicar nele — vale o recorte dos OUTROS filtros
  // (situação × advogado × tribunal × busca). Ex.: 61 no total, 5 tratadas → Novas 56 · Tratadas 5 · Todas 61.
  const pn = (n) => normalizar(String(n || '').trim().split(/\s+/)[0] || '');
  const doAdv = (p, n) => { const k = pn(n); return !!k && (pn(p.advogado) === k || normalizar(p.advogados || '').split(/[;,]/).some((x) => pn(x) === k)); };
  const okSt = (p) => !F.status || p.status === F.status, okAdv = (p) => !F.adv || doAdv(p, F.adv), okTrib = (p) => !F.tribunal || p.tribunal === F.tribunal;
  const okBusca = (p) => !b || normalizar(p.texto + ' ' + p.processo + ' ' + p.destinatarios + ' ' + p.orgao).includes(b);
  const semSt = todas.filter((p) => okAdv(p) && okTrib(p) && okBusca(p));
  document.querySelectorAll('#pub-st button').forEach((x) => { x.classList.toggle('ativo', x.dataset.v === F.status);
    const n = semSt.filter((p) => !x.dataset.v || p.status === x.dataset.v).length;
    x.innerHTML = esc(x.dataset.rot || (x.dataset.rot = x.textContent)) + ' <span class="seg-n">' + n + '</span>'; });
  const semTrib = todas.filter((p) => okSt(p) && okAdv(p) && okBusca(p));
  const pend = {}; semTrib.filter((p) => p.tribunal).forEach((p) => { pend[p.tribunal] = (pend[p.tribunal] || 0) + 1; });
  const tribs = Object.keys(pend).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (F.tribunal && !pend[F.tribunal]) F.tribunal = '';
  const st = $('pub-trib');
  if (st) { st.parentNode.hidden = !tribs.length;
    st.innerHTML = '<button type="button" data-v="" class="' + (F.tribunal ? '' : 'ativo') + '">Todos os tribunais <span class="seg-n">' + semTrib.length + '</span></button>' +
      tribs.map((t) => '<button type="button" data-v="' + esc(t) + '" class="' + (F.tribunal === t ? 'ativo' : '') + '">' + esc(t) + ' <span class="seg-n">' + pend[t] + '</span></button>').join(''); }
  const nomesAdv = [...new Set((E._pubAdvs || []).concat(todas.map((p) => p.advogado)).filter(Boolean).map((n) => String(n).trim().split(/\s+/)[0]))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (F.adv && !nomesAdv.includes(F.adv)) F.adv = '';
  const semAdv = todas.filter((p) => okSt(p) && okTrib(p) && okBusca(p));
  const sa = $('pub-advs');
  if (sa) { sa.parentNode.hidden = !nomesAdv.length;
    sa.innerHTML = '<button type="button" data-v="" class="' + (F.adv ? '' : 'ativo') + '">Todos os advogados <span class="seg-n">' + semAdv.length + '</span></button>' + nomesAdv.map((n) => { const c = semAdv.filter((p) => doAdv(p, n)).length;
      return '<button type="button" data-v="' + esc(n) + '" class="' + (F.adv === n ? 'ativo' : '') + '">' + esc(n) + ' <span class="seg-n">' + c + '</span></button>'; }).join(''); }
  const lista = todas.filter((p) => okSt(p) && okAdv(p) && okTrib(p) && okBusca(p));
  const conta = (s) => semSt.filter((p) => p.status === s).length;
  // Backup 80 (E2): sem cartões de número no topo — as contagens ficam nos botões Novas · Lidas · Tratadas
  $('pub-corpo').innerHTML = 
    (lista.length ? lista.map((p) => '<div class="card pub-card' + (p.status === 'nova' ? ' pub-nova' : '') + '" data-pub="' + p.id + '"><div class="card-bd">' +
      '<div class="pub-topo"><div><span class="pill ' + ({ nova: 'hoje', lida: 'aberto', tratada: 'pago', descartada: 'neutro' }[p.status]) + '">' + p.status + '</span> ' +
      '<b>' + esc(p.tipo || 'Comunicação') + '</b> · ' + esc(p.tribunal) + ' · <span class="mono">' + dataBR(p.data_disponibilizacao) + '</span>' +
      '<div class="sub">' + esc(p.orgao) + (p.classe ? ' · ' + esc(p.classe) : '') + '</div></div>' +
      '<div class="sub" style="text-align:right">' + (p.processo ? '<b class="mono">' + esc(p.processo) + '</b>' : '') + (p.processo_id ? ' <span class="pill pago" title="Processo cadastrado no ERP">no ERP</span>' : '') +
      '<div>' + (p.oab_numero ? advsDoEscritorio(p).map((a) => esc(a.nome) + (a.oab ? ' · OAB ' + esc(a.oab + '/' + (a.uf || '')) : '')).join('<br>') : '🏢 cliente monitorado: ' + esc(p.parte_monitorada || '—')) + '</div></div></div>' +   // Backup 89: todos os citados
      partesPub(p) +
      '<div class="pub-texto' + (p.texto.length > 500 ? ' curto' : '') + '">' + destacar(p.texto) + '</div>' + (p.texto.length > 500 ? '<button class="btn-link" data-ver>ver tudo</button>' : '') +
      '<div class="acoes" style="margin-top:10px">' + (p.tarefa_id || p.status === 'tratada' ? '' : '<button class="btn btn-p btn-mini" data-tarefa="' + p.id + '">+ Criar tarefa (' + prazoSugerido(p) + ' dias úteis)</button>') +
      (p.status === 'nova' ? '<button class="btn btn-o btn-mini" data-st="lida">Marcar lida</button>' : '') +
      (p.status !== 'tratada' ? '<button class="btn btn-o btn-mini" data-st="tratada">Tratada</button>' : '') +
      (p.status === 'descartada' ? '<button class="btn btn-o btn-mini" data-st="nova">Voltar para novas</button>' : '') +   // Backup 88: sem "Descartar" (a opção Descartadas saiu)
      (p.link && /^https?:/.test(p.link) ? '<a class="btn btn-o btn-mini" href="' + esc(p.link) + '" target="_blank" rel="noopener">Abrir no Diário</a>' : '') + '</div></div></div>').join('')
      : '<div class="card">' + (todas.length ? vazio('Nenhuma publicação neste recorte — mude o filtro.') : vazio('Nenhuma publicação ainda. Cadastre as OABs do escritório e o sistema busca no Diário todo dia.', 'OABs monitoradas', '#pub-oabs')) + '</div>');
  $('pub-corpo').querySelectorAll('[data-copiar-id]').forEach((b2) => b2.onclick = async () => {
    try { await navigator.clipboard.writeText(b2.dataset.copiarId); aviso('✓ Copiado: Processo, Autor, Réu e Advogado.'); } catch (e) { aviso('Não consegui copiar: selecione o texto e use Ctrl+C.', true); } });
  $('pub-corpo').querySelectorAll('[data-ver]').forEach((b2) => b2.onclick = () => { b2.previousElementSibling.classList.remove('curto'); b2.remove(); });
  $('pub-corpo').querySelectorAll('[data-st]').forEach((b2) => b2.onclick = () => comBotao(b2, async () => {
    const id = b2.closest('[data-pub]').dataset.pub;
    await q(sb.from('publicacoes').update({ status: b2.dataset.st }).eq('id', id));
    const p = E._pubs.find((x) => x.id === id); if (p) p.status = b2.dataset.st;
    pintarPublicacoes();
  }));
  $('pub-corpo').querySelectorAll('[data-tarefa]').forEach((b2) => b2.onclick = () => comBotao(b2, async () => {
    const p = E._pubs.find((x) => x.id === b2.dataset.tarefa), fer = await feriados();
    const proc = p.processo_id ? await q(sb.from('processos').select('grupo_id, advogado').eq('id', p.processo_id).maybeSingle()).catch(() => null) : null;
    const prazo = somarUteis(p.data_disponibilizacao || hojeISO(), prazoSugerido(p), fer);
    const titulo = 'Analisar ' + (p.tipo || 'publicação').toLowerCase() + ' — ' + (p.processo || p.tribunal);
    formTarefa({ titulo, prazo, prazo_fatal: prazo, responsavel: p.advogado || (proc && proc.advogado) || '', grupo_id: proc && proc.grupo_id, processos_vinculados: p.processo,
      prioridade: 'alta', descricao: p.tribunal + ' · ' + (p.orgao || '') + '\n' + p.texto.slice(0, 1500), inicio: hojeISO() }, async () => {
      const t = (await q(sb.from('tarefas').select('id').eq('titulo', titulo).order('criado_em', { ascending: false }).limit(1)))[0];
      await q(sb.from('publicacoes').update({ status: 'tratada', tarefa_id: t ? t.id : null }).eq('id', p.id));
      await carregarPublicacoes();
    });
  }));
}
async function janelaOabs() {
  const [os, ps] = await Promise.all([q(sb.from('oabs_monitoradas').select('*').order('numero')), q(sb.from('partes_monitoradas').select('*').order('nome')).catch(() => [])]);
  await carregarCadastros();
  const j = abrirJanela({ titulo: 'Monitoramento de publicações', larga: true,
    corpo: '<div class="dica" style="margin-bottom:10px">O sistema busca no <b>Diário de Justiça Eletrônico Nacional (CNJ)</b> as publicações das <b>OABs</b> e dos <b>clientes</b> abaixo, todo dia útil às 7h e 13h. ' +
        'O Diário não pesquisa por CNPJ: o cliente é buscado pelo <b>nome (razão social)</b> e o sistema confere o nome entre as partes. Para receber citações pelo CNPJ, cadastre o escritório como representante da empresa no <b>Domicílio Judicial Eletrônico</b>.</div>' +
      '<div class="secao">OABs</div><div class="lista-ficha">' + (os.map((o) => '<div class="item-ficha"><div><b>OAB ' + esc(o.numero) + '/' + esc(o.uf) + '</b> <span class="sub">' + esc(o.advogado || '') + '</span>' + (o.ativo ? '' : ' <span class="pill neutro">pausada</span>') + '</div>' +
        '<span><button class="btn btn-o btn-mini" data-oab-at="' + o.id + '">' + (o.ativo ? 'Pausar' : 'Ativar') + '</button> <button class="btn btn-x btn-mini" data-oab-x="' + o.id + '">Excluir</button></span></div>').join('') || '<div class="sub">Nenhuma OAB cadastrada.</div>') + '</div>' +
      '<form class="grade" id="f-oab" style="margin-top:8px">' + campo('Número da OAB', '<input name="numero" inputmode="numeric" placeholder="123456">') + campo('UF', '<input name="uf" maxlength="2" value="MG">') +
        campo('Advogado(a)', '<input name="advogado" list="oab-pessoas" placeholder="quem recebe o aviso">' + datalistPessoas('oab-pessoas')) +
        '<div class="campo"><span>&nbsp;</span><button class="btn btn-p" type="button" id="btn-add-oab">+ Incluir OAB</button></div></form>' +
      '<div class="secao" style="margin-top:14px">Clientes (pelo nome da empresa)</div><div class="lista-ficha">' + (ps.map((o) => '<div class="item-ficha"><div><b>' + esc(o.nome) + '</b> <span class="sub mono">' + esc(o.documento || '') + '</span>' + (o.ativo ? '' : ' <span class="pill neutro">pausado</span>') + '</div>' +
        '<span><button class="btn btn-o btn-mini" data-pt-at="' + o.id + '">' + (o.ativo ? 'Pausar' : 'Ativar') + '</button> <button class="btn btn-x btn-mini" data-pt-x="' + o.id + '">Excluir</button></span></div>').join('') || '<div class="sub">Nenhum cliente monitorado.</div>') + '</div>' +
      '<form class="grade" id="f-pt" style="margin-top:8px">' + campo('Cliente', '<select name="cliente_id"><option value="">— escolha —</option>' + E.clientes.filter((c) => !ps.some((x) => x.cliente_id === c.id)).map((c) => '<option value="' + c.id + '">' + esc(c.nome) + '</option>').join('') + '</select>') +
        campo('Ou digite o nome da parte', '<input name="nome" placeholder="EMPRESA EXEMPLO LTDA">') +
        '<div class="campo"><span>&nbsp;</span><button class="btn btn-p" type="button" id="btn-add-pt">+ Monitorar</button></div></form>',
    rodape: '<button class="btn btn-o" type="button" id="pub-diag">🩺 Testar conexão com o CNJ</button><span id="pub-diag-res" class="sub"></span>' });
  const f = j.querySelector('#f-oab'), fp = j.querySelector('#f-pt');
  const reabrir = () => { fecharJanela(j); janelaOabs(); };
  j.querySelector('#btn-add-oab').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const numero = soDigitos(f.numero.value), uf = f.uf.value.trim().toUpperCase();
    if (!numero || !/^[A-Z]{2}$/.test(uf)) throw new Error('Informe o número da OAB e a UF (2 letras).');
    await q(sb.from('oabs_monitoradas').insert({ numero, uf, advogado: f.advogado.value.trim() }));
    aviso('✓ OAB incluída.'); reabrir();
  });
  j.querySelector('#btn-add-pt').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const c = E.clientes.find((x) => x.id === fp.cliente_id.value), nome = (c ? c.nome : fp.nome.value).trim().toUpperCase();
    if (!nome) throw new Error('Escolha um cliente ou digite o nome da parte.');
    await q(sb.from('partes_monitoradas').insert({ nome, documento: c ? (c.cpf_cnpj || '') : '', cliente_id: c ? c.id : null }));
    aviso('✓ ' + nome + ' passa a ser monitorado.'); reabrir();
  });
  j.querySelectorAll('[data-oab-at]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const o = os.find((x) => x.id === b.dataset.oabAt); await q(sb.from('oabs_monitoradas').update({ ativo: !o.ativo }).eq('id', o.id)); reabrir();
  }));
  j.querySelectorAll('[data-oab-x]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    if (!await confirmarB('Excluir esta OAB da busca?')) return; await excluir('oabs_monitoradas', b.dataset.oabX); reabrir();
  }));
  j.querySelectorAll('[data-pt-at]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const o = ps.find((x) => x.id === b.dataset.ptAt); await q(sb.from('partes_monitoradas').update({ ativo: !o.ativo }).eq('id', o.id)); reabrir();
  }));
  j.querySelectorAll('[data-pt-x]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    if (!await confirmarB('Parar de monitorar este cliente?')) return; await q(sb.from('partes_monitoradas').delete().eq('id', b.dataset.ptX)); reabrir();
  }));
  j.querySelector('#pub-diag').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const res = j.querySelector('#pub-diag-res');
    let r;
    try { r = await chamarFuncao('erp-publicacoes', { acao: 'diagnostico' }); }
    catch (e) {
      // não respondeu: descobre se é a função (não publicada / versão antiga) ou o CNJ (demorou demais)
      const ping = await chamarFuncao('erp-publicacoes', { acao: 'ping' }).catch((e2) => ({ erro: e2.message }));
      res.innerHTML = '❌ ' + (ping.versao
        ? 'A função está no ar (versão ' + esc(ping.versao) + '), mas o CNJ não respondeu ao servidor do Supabase a tempo. ' + (ping.versao < '2026-10-02' ? '<b>Publique a versão nova da função erp-publicacoes</b> (ela avisa em vez de travar). ' : '')
        : esc(ping.erro || e.message) + ' ') +
        'Enquanto isso, use <b>🌐 Buscar pelo navegador</b> — o ERP também faz essa busca sozinho 1 vez por dia quando você abre o Início.';
      return;
    }
    res.textContent = (r.ok ? '✅ ' : '❌ ') + r.dica + (r.status ? ' (código ' + r.status + ')' : '');
  });
}

// Busca feita pelo navegador de quem está usando (plano B quando o servidor do Supabase não alcança o CNJ).
const API_DJEN = () => window.ERP_DJEN_API || 'https://comunicaapi.pje.jus.br/api/v1';
function normalizarPub(it, oab, parte) {
  const pr = (o, nomes) => { for (const n of nomes) { if (o && o[n] != null && o[n] !== '') return o[n]; } return ''; };
  const dataISO = (v) => { const x = String(v || ''); let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(x); if (m) return m[1] + '-' + m[2] + '-' + m[3]; m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(x); return m ? m[3] + '-' + m[2] + '-' + m[1] : null; };
  const numero = String(pr(it, ['numero_processo', 'numeroProcesso', 'numeroprocesso'])).replace(/\D/g, '');
  const cnj = numero.length === 20 ? numero.replace(/^(\d{7})(\d{2})(\d{4})(\d)(\d{2})(\d{4})$/, '$1-$2.$3.$4.$5.$6') : numero;
  const dest = pr(it, ['destinatarios']) || [], advs = pr(it, ['destinatarioadvogados', 'destinatarioAdvogados', 'advogados']) || [];
  const texto = String(pr(it, ['texto', 'conteudo', 'teor']));
  return {
    id_origem: 'djen:' + String(pr(it, ['id', 'hash', 'numeroComunicacao']) || (numero + '|' + pr(it, ['data_disponibilizacao', 'dataDisponibilizacao']) + '|' + texto.slice(0, 40))),
    data_disponibilizacao: dataISO(pr(it, ['data_disponibilizacao', 'dataDisponibilizacao', 'datadisponibilizacao'])),
    tribunal: String(pr(it, ['siglaTribunal', 'sigla_tribunal', 'tribunal'])), orgao: String(pr(it, ['nomeOrgao', 'nome_orgao', 'orgao'])),
    tipo: String(pr(it, ['tipoComunicacao', 'tipo_comunicacao', 'tipoDocumento', 'tipo'])),
    processo: String(pr(it, ['numeroprocessocommascara', 'numeroProcessoComMascara', 'numero_processo_com_mascara']) || cnj), processo_numero: numero,
    classe: String(pr(it, ['nomeClasse', 'nome_classe', 'classe'])),
    texto: texto.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20000), link: String(pr(it, ['link', 'url'])),
    destinatarios: Array.isArray(dest) ? dest.map((d) => (d && (d.nome || d.name)) ? ({ A: 'Autor: ', P: 'Réu: ' }[String(d.polo || '').toUpperCase()] || '') + (d.nome || d.name) : '').filter(Boolean).join('; ') : String(dest),
    advogados: Array.isArray(advs) ? advs.map((a) => { const x = (a && (a.advogado || a)) || {}; return [x.nome, x.numero_oab ? 'OAB ' + x.numero_oab + '/' + (x.uf_oab || '') : ''].filter(Boolean).join(' '); }).filter(Boolean).join('; ') : String(advs),
    oab_numero: (oab && oab.numero) || '', oab_uf: (oab && oab.uf) || '', advogado: (oab && oab.advogado) || '', parte_monitorada: parte || ''
  };
}
// Busca automática pelo navegador (Backup 17): o CNJ costuma recusar o servidor do Supabase, mas aceita o navegador do escritório.
// Ao abrir o Início, se a última busca deste navegador tem mais de 20 horas, busca em segundo plano (só avisa se achar novas).
async function buscaPubAutomatica() {
  if (!pode('juridico')) return;
  // Backup 88: a busca diária é a do servidor, às 6h. O navegador só busca se a de hoje não aconteceu ou deu erro (reserva).
  try { const u = await q(sb.from('configuracoes').select('valor').eq('chave', 'publicacoes_ultima').maybeSingle());
    const v = u && u.valor; if (v && v.quando && iso(new Date(v.quando)) === hojeISO() && !(v.erros && v.erros.length)) return; } catch (e) { /* busca mesmo assim */ }
  let ult = 0; try { ult = Number(localStorage.getItem('erp_pub_auto') || 0); } catch (e) { /* sem armazenamento: busca */ }
  if (Date.now() - ult < 20 * 3600000) return;
  try { localStorage.setItem('erp_pub_auto', String(Date.now())); } catch (e) { /* ok */ }
  const n = await buscarPubNoNavegador({ silencioso: true }).catch(() => 0);
  if (n) aviso('📰 ' + n + ' publicação(ões) nova(s) no Diário. Veja em Jurídico → Publicações.');
}
async function buscarPubNoNavegador(op) {
  op = op || {};
  const [os, ps] = await Promise.all([q(sb.from('oabs_monitoradas').select('*').eq('ativo', true)), q(sb.from('partes_monitoradas').select('*').eq('ativo', true)).catch(() => [])]);
  if (!os.length && !ps.length) { if (op.detalhe) return { lidas: 0, novas: 0, erros: [], semMonitoramento: true }; if (op.silencioso) return 0; throw new Error('Cadastre pelo menos uma OAB ou um cliente em "Monitoramento".'); }
  const de = somarDias(hojeISO(), -Number(E.pub && E.pub.dias ? Math.min(Number(E.pub.dias), 30) : 7)), ate = hojeISO();
  const alvos = os.map((o) => ['numeroOab=' + encodeURIComponent(soDigitos(o.numero)) + '&ufOab=' + encodeURIComponent(o.uf), o, '']).concat(ps.map((p) => ['nomeParte=' + encodeURIComponent(p.nome), null, p.nome]));
  let lidas = 0, novas = 0; const erros = [];
  for (const [filtro, oab, parte] of alvos) {
    try {
      const r = await fetch(API_DJEN() + '/comunicacao?' + filtro + '&dataDisponibilizacaoInicio=' + de + '&dataDisponibilizacaoFim=' + ate + '&pagina=1&itensPorPagina=100', { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('o CNJ respondeu ' + r.status);
      const json = await r.json(), itens = Array.isArray(json) ? json : (json.items || json.itens || json.content || json.data || []);
      const alvo = normalizar(parte).toUpperCase();
      const certos = parte ? itens.filter((it) => !Array.isArray(it.destinatarios) || !it.destinatarios.length || it.destinatarios.some((d) => normalizar((d && d.nome) || '').toUpperCase().includes(alvo))) : itens;
      lidas += certos.length;
      if (certos.length) { const ins = await q(sb.from('publicacoes').upsert(certos.map((it) => normalizarPub(it, oab, parte)), { onConflict: 'id_origem', ignoreDuplicates: true }).select('id')); novas += (ins || []).length; }
    } catch (e) { erros.push((oab ? 'OAB ' + oab.numero : parte) + ': ' + (/fetch|network|Failed/i.test(e.message) ? 'o navegador não conseguiu acessar o CNJ (bloqueio do site do CNJ)' : e.message)); }
  }
  // Backup 37: a busca pela web fica registrada (Alertas → Rotinas → "Busca de publicações (web)")
  await q(sb.rpc('registrar_busca_publicacoes', { p_lidas: lidas, p_novas: novas, p_erros: erros })).catch(() => null);
  if (novas) await q(sb.rpc('email_publicacoes_advogados')).catch(() => null);   // Backup 88: o e-mail do dia a cada advogado (se ligado)
  if (!op.silencioso) aviso('✓ Busca pelo navegador: ' + lidas + ' lida(s), ' + novas + ' nova(s).' + (erros.length ? ' Atenção: ' + erros[0] : ''), !!erros.length);
  return op.detalhe ? { lidas, novas, erros } : novas;
}
