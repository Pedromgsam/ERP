'use strict';
// ═══════════════════════════════════════════════════════════════════
// Publicações — Diário de Justiça Eletrônico Nacional (API pública do CNJ).
// A função "erp-publicacoes" busca pelas OABs cadastradas (7h e 13h, dias
// úteis, ou pelo botão "Buscar agora"); aqui a equipe lê, cria a tarefa com
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
  const F = E.pub;
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Publicações</h1><p id="pub-ult">Diário de Justiça Eletrônico Nacional · busca automática às 7h e 13h (dias úteis)</p></div>' +
    '<div class="acoes"><button class="btn btn-o" id="pub-oabs">⚙ Monitoramento (OABs e clientes)</button><button class="btn btn-o" id="pub-nav" title="Busca direto do seu computador — use se o servidor não conseguir falar com o CNJ">🌐 Buscar pelo navegador</button><button class="btn btn-p" id="pub-buscar">↻ Buscar agora</button></div></div>' +
    '<div class="filtros"><div class="segmento" id="pub-st">' + [['nova', 'Novas'], ['lida', 'Lidas'], ['tratada', 'Tratadas'], ['descartada', 'Descartadas'], ['', 'Todas']].map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<select class="busca sel" id="pub-dias"><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="">Todo o período</option></select>' +
    '<select class="busca sel" id="pub-adv"><option value="">Todos os advogados</option></select><select class="busca sel" id="pub-trib"><option value="">Todos os tribunais</option></select>' +
    '<input class="busca" id="pub-busca" placeholder="Buscar no texto, processo ou parte" autocomplete="off"></div><div id="pub-corpo"><div class="carregando">Carregando…</div></div>';
  $('pub-oabs').onclick = () => janelaOabs();
  $('pub-buscar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const data = await chamarFuncao('erp-publicacoes', {});
    if (!data.oabs && !data.partes) throw new Error('Cadastre pelo menos uma OAB ou um cliente em "Monitoramento".');
    const erro = data.erros && data.erros.length ? data.erros[0] : '';
    aviso('✓ Busca feita: ' + data.lidas + ' publicação(ões) lida(s), ' + data.novas + ' nova(s).' + (erro ? ' Atenção: ' + erro : ''), !!erro);
    if (erro && /recusou|conexão|navegador/i.test(erro) && confirm('O servidor não conseguiu falar com o Diário do CNJ.\n\nBuscar agora pelo seu navegador?')) await buscarPubNoNavegador();
    await TELAS.publicacoes();
  });
  $('pub-nav').onclick = (ev) => comBotao(ev.currentTarget, async () => { await buscarPubNoNavegador(); await TELAS.publicacoes(); });
  $('pub-st').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.status = b.dataset.v; pintarPublicacoes(); } };
  [['pub-dias', 'dias'], ['pub-adv', 'adv'], ['pub-trib', 'tribunal']].forEach(([id, k]) => { $(id).onchange = (ev) => { F[k] = ev.target.value; if (k === 'dias') carregarPublicacoes(); else pintarPublicacoes(); }; });
  $('pub-dias').value = F.dias; $('pub-busca').value = F.busca;
  let t; $('pub-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; pintarPublicacoes(); }, 250); };
  q(sb.from('configuracoes').select('valor').eq('chave', 'publicacoes_ultima').maybeSingle()).then((u) => {
    if (u && u.valor && $('pub-ult')) $('pub-ult').textContent = 'Última busca: ' + quandoRodou(u.valor.quando) + ' · ' + u.valor.novas + ' nova(s) de ' + u.valor.lidas + ' lida(s)' +
      (u.valor.erros && u.valor.erros.length ? ' · ⚠ ' + u.valor.erros[0] : '') + ' · automática às 7h e 13h (dias úteis)';
  }).catch(() => {});
  await carregarPublicacoes();
};
async function carregarPublicacoes() {
  const F = E.pub;
  E._pubs = await buscarTodos(() => { let c = sb.from('publicacoes').select('id, data_disponibilizacao, tribunal, orgao, tipo, processo, processo_numero, classe, texto, link, destinatarios, advogados, oab_numero, oab_uf, advogado, parte_monitorada, processo_id, status, tarefa_id')
    .order('data_disponibilizacao', { ascending: false, nullsFirst: false }); if (F.dias) c = c.gte('data_disponibilizacao', somarDias(hojeISO(), -Number(F.dias))); return c; });
  const opts = (id, vals, rot) => { const s = $(id); if (!s) return; const v = s.value; s.innerHTML = '<option value="">' + rot + '</option>' + [...new Set(vals.filter(Boolean))].sort().map((x) => '<option>' + esc(x) + '</option>').join(''); s.value = v; };
  opts('pub-adv', E._pubs.map((p) => p.advogado), 'Todos os advogados'); opts('pub-trib', E._pubs.map((p) => p.tribunal), 'Todos os tribunais');
  pintarPublicacoes();
}
function pintarPublicacoes() {
  const F = E.pub, b = normalizar(F.busca);
  if (!$('pub-corpo')) return;
  document.querySelectorAll('#pub-st button').forEach((x) => x.classList.toggle('ativo', x.dataset.v === F.status));
  const todas = E._pubs || [];
  const lista = todas.filter((p) => (!F.status || p.status === F.status) && (!F.adv || p.advogado === F.adv) && (!F.tribunal || p.tribunal === F.tribunal) &&
    (!b || normalizar(p.texto + ' ' + p.processo + ' ' + p.destinatarios + ' ' + p.orgao).includes(b)));
  const conta = (s) => todas.filter((p) => p.status === s).length;
  $('pub-corpo').innerHTML = '<div class="kpis">' + kpi('Novas', String(conta('nova')), conta('nova') ? 'ambar' : 'verde', 'ainda não lidas') + kpi('Lidas', String(conta('lida')), '', 'sem tarefa ainda') +
    kpi('Tratadas', String(conta('tratada')), 'verde', 'com tarefa criada') + '</div>' +
    (lista.length ? lista.map((p) => '<div class="card pub-card' + (p.status === 'nova' ? ' pub-nova' : '') + '" data-pub="' + p.id + '"><div class="card-bd">' +
      '<div class="pub-topo"><div><span class="pill ' + ({ nova: 'hoje', lida: 'aberto', tratada: 'pago', descartada: 'neutro' }[p.status]) + '">' + p.status + '</span> ' +
      '<b>' + esc(p.tipo || 'Comunicação') + '</b> · ' + esc(p.tribunal) + ' · <span class="mono">' + dataBR(p.data_disponibilizacao) + '</span>' +
      '<div class="sub">' + esc(p.orgao) + (p.classe ? ' · ' + esc(p.classe) : '') + '</div></div>' +
      '<div class="sub" style="text-align:right">' + (p.processo ? '<b class="mono">' + esc(p.processo) + '</b>' : '') + (p.processo_id ? ' <span class="pill pago" title="Processo cadastrado no ERP">no ERP</span>' : '') +
      '<div>' + (p.oab_numero ? esc(p.advogado ? p.advogado + ' · ' : '') + 'OAB ' + esc(p.oab_numero + '/' + p.oab_uf) : '🏢 cliente monitorado: ' + esc(p.parte_monitorada || '—')) + '</div></div></div>' +
      (p.destinatarios ? '<div class="sub" style="margin:6px 0">Partes: ' + esc(p.destinatarios) + '</div>' : '') +
      '<div class="pub-texto' + (p.texto.length > 500 ? ' curto' : '') + '">' + destacar(p.texto) + '</div>' + (p.texto.length > 500 ? '<button class="btn-link" data-ver>ver tudo</button>' : '') +
      '<div class="acoes" style="margin-top:10px">' + (p.tarefa_id || p.status === 'tratada' ? '' : '<button class="btn btn-p btn-mini" data-tarefa="' + p.id + '">+ Criar tarefa (' + prazoSugerido(p) + ' dias úteis)</button>') +
      (p.status === 'nova' ? '<button class="btn btn-o btn-mini" data-st="lida">Marcar lida</button>' : '') +
      (p.status !== 'tratada' ? '<button class="btn btn-o btn-mini" data-st="tratada">Tratada</button>' : '') +
      (p.status !== 'descartada' ? '<button class="btn btn-o btn-mini" data-st="descartada">Descartar</button>' : '<button class="btn btn-o btn-mini" data-st="nova">Voltar para novas</button>') +
      (p.link && /^https?:/.test(p.link) ? '<a class="btn btn-o btn-mini" href="' + esc(p.link) + '" target="_blank" rel="noopener">Abrir no Diário</a>' : '') + '</div></div></div>').join('')
      : '<div class="card">' + (todas.length ? vazio('Nenhuma publicação neste recorte — mude o filtro.') : vazio('Nenhuma publicação ainda. Cadastre as OABs do escritório e o sistema busca no Diário todo dia.', 'OABs monitoradas', '#pub-oabs')) + '</div>');
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
    if (!confirm('Excluir esta OAB da busca?')) return; await excluir('oabs_monitoradas', b.dataset.oabX); reabrir();
  }));
  j.querySelectorAll('[data-pt-at]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const o = ps.find((x) => x.id === b.dataset.ptAt); await q(sb.from('partes_monitoradas').update({ ativo: !o.ativo }).eq('id', o.id)); reabrir();
  }));
  j.querySelectorAll('[data-pt-x]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    if (!confirm('Parar de monitorar este cliente?')) return; await q(sb.from('partes_monitoradas').delete().eq('id', b.dataset.ptX)); reabrir();
  }));
  j.querySelector('#pub-diag').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const r = await chamarFuncao('erp-publicacoes', { acao: 'diagnostico' });
    j.querySelector('#pub-diag-res').textContent = (r.ok ? '✅ ' : '❌ ') + r.dica + (r.status ? ' (código ' + r.status + ')' : '');
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
    destinatarios: Array.isArray(dest) ? dest.map((d) => (d && (d.nome || d.name)) || '').filter(Boolean).join('; ') : String(dest),
    advogados: Array.isArray(advs) ? advs.map((a) => { const x = (a && (a.advogado || a)) || {}; return [x.nome, x.numero_oab ? 'OAB ' + x.numero_oab + '/' + (x.uf_oab || '') : ''].filter(Boolean).join(' '); }).filter(Boolean).join('; ') : String(advs),
    oab_numero: (oab && oab.numero) || '', oab_uf: (oab && oab.uf) || '', advogado: (oab && oab.advogado) || '', parte_monitorada: parte || ''
  };
}
async function buscarPubNoNavegador() {
  const [os, ps] = await Promise.all([q(sb.from('oabs_monitoradas').select('*').eq('ativo', true)), q(sb.from('partes_monitoradas').select('*').eq('ativo', true)).catch(() => [])]);
  if (!os.length && !ps.length) throw new Error('Cadastre pelo menos uma OAB ou um cliente em "Monitoramento".');
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
  aviso('✓ Busca pelo navegador: ' + lidas + ' lida(s), ' + novas + ' nova(s).' + (erros.length ? ' Atenção: ' + erros[0] : ''), !!erros.length);
}
