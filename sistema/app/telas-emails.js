'use strict';
// ═══════════════════════════════════════════════════════════════════
// Central de e-mails ao cliente (Backup 16): honorários, parcelamentos,
// acordos e recibos numa tela só. "A enviar hoje" mostra o que a rotina
// vai mandar (com prévia); dá para enviar agora, pular ou enviar vários.
// Modelos editáveis (Administração → E-mails) e o automático por tipo.
// ═══════════════════════════════════════════════════════════════════
const TIPOS_CENTRAL_EM = [['', 'Todos'], ['honorarios', 'Honorários'], ['parcelamentos', 'Parcelamentos'], ['acordos', 'Acordos'], ['recibos', 'Recibos']];
const ROT_TIPO_EMAIL = { honorarios: 'Honorários', parcelamentos: 'Parcelamento', acordos: 'Acordo', recibos: 'Recibo', propostas: 'Proposta', contratos: 'Boas-vindas', convites: 'Convite' };
const SIT_EMAIL = [['hoje', 'A enviar hoje'], ['enviados', 'Enviados'], ['erro', 'Com erro'], ['retidos', 'Retidos (pausa)']];
// Backup 19: tudo de e-mail num lugar só — cada área é uma aba da Central
const AREAS_EMAIL = [['fila', '📬 Enviar e acompanhar'], ['clientes', '📨 Quem recebe o quê (por cliente)'], ['config', '⚙ Configuração do envio', true], ['avisos', '🔔 Meus avisos por e-mail']];

TELAS.emails = async function () {
  E.em = Object.assign({ sit: 'hoje', tipo: '', busca: '', area: 'fila' }, E.em || {});
  const F = E.em;
  const admin = E.perfil && E.perfil.papel === 'admin';
  const pausado = await q(sb.rpc('emails_pausados')).catch(() => false);
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Central de e-mails</h1><p>Tudo de e-mail num lugar só: o que sai, o que já foi, quem recebe, modelos e configuração</p></div>' +
    '<div class="acoes">' + (admin ? '<button class="btn btn-o" id="em-auto">⚙ Automático e horário</button><button class="btn btn-o" id="em-modelos">✎ Modelos</button>' : '') + '</div></div>' +
    '<div class="faixa-aprov' + (pausado ? ' tem' : '') + '" id="em-pausa"><span class="faixa-ic" aria-hidden="true">' + (pausado ? '⏸' : '▶') + '</span><div><b>' +
      (pausado ? 'Envio de e-mails PAUSADO — nada sai do sistema.' : 'Envio de e-mails ligado.') + '</b><div class="sub">' +
      (pausado ? 'Os e-mails novos ficam em "Retidos (pausa)": dá para liberar um a um ou descartar. O e-mail de teste da Configuração sai sempre.' : 'Os e-mails da fila saem em até 5 minutos.') + '</div></div>' +
      (admin ? '<button class="btn ' + (pausado ? 'btn-p' : 'btn-o') + '" id="em-pausar" data-pausar="' + (pausado ? '0' : '1') + '">' + (pausado ? '▶ Liberar o envio' : '⏸ Pausar o envio') + '</button>' : '') + '</div>' +
    '<div class="segmento" id="em-area" style="margin-bottom:14px">' + AREAS_EMAIL.filter((a) => !a[2] || admin).map(([v, r]) => '<button data-area="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<div id="em-area-corpo"></div>';
  $('em-area').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.area = b.dataset.area; pintarAreaEmail(); } };
  if ($('em-auto')) $('em-auto').onclick = () => janelaAutoEmails();
  if ($('em-modelos')) $('em-modelos').onclick = () => janelaModelosEmail();
  if ($('em-pausar')) $('em-pausar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const pausar = ev.currentTarget.dataset.pausar === '1';
    if (!pausar && !confirm('Liberar o envio? Os e-mails automáticos voltam a sair (os que já estão retidos continuam retidos até você liberar cada um).')) return;
    await q(sb.rpc('pausar_emails', { p_pausar: pausar })); aviso(pausar ? '⏸ Envio de e-mails pausado.' : '▶ Envio de e-mails liberado.'); await TELAS.emails();
  });
  await pintarAreaEmail();
};
async function pintarAreaEmail() {
  const F = E.em, alvo = $('em-area-corpo'); if (!alvo) return;
  document.querySelectorAll('#em-area button').forEach((b) => b.classList.toggle('ativo', b.dataset.area === F.area));
  if (F.area === 'clientes') return controleEmails(alvo);
  if (F.area === 'config') { E.adm = E.adm || {}; return admEmail(alvo); }
  if (F.area === 'avisos') { alvo.innerHTML = '<div class="card"><div class="card-bd"><p class="sub" style="margin-bottom:10px">Avisos internos que <b>você</b> recebe por e-mail (resumo do dia, menções, tarefas…).</p>' +
      '<button class="btn btn-o" type="button" id="em-meus">🔔 Escolher meus avisos por e-mail</button></div></div>'; $('em-meus').onclick = () => janelaMeusAvisos(); return; }
  alvo.innerHTML = '<div class="abas" id="em-sit">' + SIT_EMAIL.map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<div class="filtros"><div class="segmento" id="em-tipo">' + TIPOS_CENTRAL_EM.map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<input class="busca" id="em-busca" placeholder="Buscar cliente, grupo ou assunto" autocomplete="off"></div>' +
    '<div id="em-corpo"><div class="carregando">Carregando…</div></div>';
  $('em-sit').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.sit = b.dataset.v; carregarEmails(); } };
  $('em-tipo').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.tipo = b.dataset.v; pintarEmails(); } };
  $('em-busca').value = F.busca;
  let t; $('em-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; pintarEmails(); }, 250); };
  await carregarEmails();
}
let _emLista = [], _emCfg = {};
async function carregarEmails() {
  const F = E.em;
  if ($('em-corpo')) $('em-corpo').innerHTML = '<div class="carregando">Carregando…</div>';
  [_emLista, _emCfg] = await Promise.all([F.sit === 'retidos'
    ? q(sb.from('email_fila').select('id, para, assunto, tipo, criado_em').eq('status', 'retido').order('criado_em', { ascending: false }).limit(500)).then((l) => l.map((x) => ({ id: x.id, para: x.para, assunto: x.assunto, quando: x.criado_em, tipo_fila: x.tipo, status: 'retido' })))
    : q(sb.rpc('emails_central', { p_situacao: F.sit })), q(sb.rpc('config_emails')).catch(() => ({}))]);
  pintarEmails();
}
function pintarEmails() {
  const F = E.em, alvo = $('em-corpo'); if (!alvo) return;
  document.querySelectorAll('#em-sit button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === F.sit));
  document.querySelectorAll('#em-tipo button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === F.tipo));
  const b = normalizar(F.busca);
  const lista = (_emLista || []).filter((x) => (!F.tipo || x.tipo === F.tipo) && (!b || normalizar([x.cliente, x.grupo, x.assunto, x.para].join(' ')).includes(b)));
  const autoTxt = ['honorarios', 'parcelamentos', 'acordos', 'recibos'].map((k) => '<span class="pill ' + (_emCfg[k] ? 'pago' : 'neutro') + '">' + ROT_TIPO_EMAIL[k] + ': ' + (_emCfg[k] ? 'automático' : 'manual') + '</span>').join(' ');
  let html = '<div class="dica" style="margin-bottom:12px">' + autoTxt + (_emCfg.hora ? ' · envio às <b>' + esc(_emCfg.hora) + '</b>' : ' · envio junto da rotina das 7h') +
    '<br><span class="sub">No automático, a lista "A enviar hoje" sai sozinha no horário. Em manual, nada sai até você clicar em "Enviar".</span></div>';
  if (F.sit === 'retidos') {
    const ret = (_emLista || []).filter((x) => !b || normalizar([x.assunto, x.para].join(' ')).includes(b));
    alvo.innerHTML = '<div class="card"><div class="card-hd">⏸ Retidos pela pausa <span class="pill neutro">' + ret.length + '</span>' +
      (ret.length ? '<span style="margin-left:auto;display:flex;gap:6px"><label class="check" style="font-size:12.5px"><input type="checkbox" id="em-todos"> marcar todos</label>' +
        '<button class="btn btn-o btn-mini" id="em-desc-sel">Descartar marcados</button><button class="btn btn-p btn-mini" id="em-lib-sel">Enviar marcados</button></span>' : '') + '</div>' +
      (ret.length ? '<div class="tabela-wrap"><table><thead><tr><th class="sem-ordem"></th><th>Quando</th><th>Tipo</th><th>Assunto</th><th>Para</th></tr></thead><tbody>' +
        ret.map((x) => '<tr class="clicavel" data-em-ref="' + x.id + '"><td><input type="checkbox" data-em-ret="' + x.id + '" aria-label="Marcar"></td><td class="mono">' + dataHoraBR(x.quando) + '</td>' +
          '<td>' + esc(x.tipo_fila || '—') + '</td><td>' + esc(x.assunto) + '</td><td>' + esc(x.para) + '</td></tr>').join('') + '</tbody></table></div>'
        : vazio('Nenhum e-mail retido.')) + '</div>';
    alvo.querySelectorAll('tr[data-em-ref]').forEach((tr) => tr.onclick = (ev) => { if (ev.target.closest('input, label')) return; previaEmail(tr.dataset.emRef); });
    const todosR = $('em-todos'); if (todosR) todosR.onchange = () => alvo.querySelectorAll('[data-em-ret]').forEach((c) => { c.checked = todosR.checked; });
    const acao = (tipo, bt) => comBotao(bt, async () => {
      const ids = [...alvo.querySelectorAll('[data-em-ret]:checked')].map((c) => c.dataset.emRet);
      if (!ids.length) throw new Error('Marque pelo menos um e-mail.');
      if (!confirm(tipo === 'liberar' ? 'Enviar de verdade os ' + ids.length + ' e-mail(s) marcados?' : 'Descartar os ' + ids.length + ' e-mail(s) marcados? Eles não serão enviados.')) return;
      const n = await q(sb.rpc('emails_retidos_acao', { p_ids: ids, p_acao: tipo }));
      aviso(tipo === 'liberar' ? '✓ ' + n + ' e-mail(s) liberado(s): saem em até 5 minutos.' : n + ' e-mail(s) descartado(s).'); await carregarEmails();
    });
    if ($('em-lib-sel')) $('em-lib-sel').onclick = (ev) => acao('liberar', ev.currentTarget);
    if ($('em-desc-sel')) $('em-desc-sel').onclick = (ev) => acao('descartar', ev.currentTarget);
    return;
  }
  if (F.sit === 'hoje') {
    const envia = lista.filter((x) => !x.bloqueio);
    html += '<div class="card"><div class="card-hd">📬 A enviar hoje <span class="pill neutro">' + lista.length + '</span>' +
      (envia.length ? '<span style="margin-left:auto;display:flex;gap:6px"><label class="check" style="font-size:12.5px"><input type="checkbox" id="em-todos"> marcar todos</label>' +
        '<button class="btn btn-p btn-mini" id="em-enviar-sel">Enviar selecionados</button></span>' : '') + '</div>' +
      (lista.length ? '<div class="tabela-wrap"><table><thead><tr><th class="sem-ordem"></th><th>Tipo</th><th>Cliente</th><th>Quem</th><th>Assunto</th><th>E-mail de destino</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead><tbody>' +
        lista.map((x) => '<tr class="clicavel" data-em-ref="' + esc(x.ref) + '" title="Clique para ver a prévia"><td>' + (x.bloqueio ? '' : '<input type="checkbox" data-em-sel="' + esc(x.ref) + '" aria-label="Selecionar">') + '</td>' +
          '<td><span class="pill aberto">' + esc(ROT_TIPO_EMAIL[x.tipo] || x.tipo) + '</span></td><td><b>' + esc(x.cliente || '—') + '</b>' + (x.grupo && x.grupo !== x.cliente ? '<div class="sub">' + esc(x.grupo) + '</div>' : '') + '</td>' +
          '<td>' + pillPessoa(x.responsavel) + '</td><td>' + esc(x.assunto) + '</td><td>' + destinoEmail(x) + '</td>' +
          '<td class="num mono">' + (Number(x.total) ? brl(x.total) : '—') + '</td>' +
          '<td>' + (x.bloqueio ? '<span class="pill neutro" title="Não vai sair">' + esc(x.bloqueio) + '</span>' : '<span class="pill pago">' + (x.auto ? 'sai no horário' : 'pronto') + '</span>') + '</td>' +
          '<td class="acoes-l">' + (x.bloqueio ? '' : '<button class="btn btn-v btn-mini" data-em-agora="' + esc(x.ref) + '">Enviar agora</button> ') + '<button class="btn btn-o btn-mini" data-em-pular="' + esc(x.ref) + '">Pular este</button></td></tr>').join('') +
        '</tbody></table></div>' : vazio('Nada para enviar hoje. 👏')) + '</div>';
  } else {
    html += '<div class="card">' + (lista.length ? '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th data-tipo="data">Quando</th><th>Tipo</th><th>Cliente</th><th>Quem</th><th>Assunto</th><th>E-mail de destino</th><th>Situação</th><th></th></tr></thead><tbody>' +
      lista.map((x) => '<tr class="clicavel" data-em-ref="' + esc(x.ref || x.id) + '"><td class="mono" data-ord="' + esc(x.quando) + '">' + dataHoraBR(x.quando) + '</td>' +
        '<td><span class="pill aberto">' + esc(ROT_TIPO_EMAIL[x.tipo] || x.tipo) + '</span>' + (x.anexo ? ' 📎' : '') + '</td><td>' + esc(x.cliente || '—') + '</td><td>' + pillPessoa(x.responsavel || '') + '</td><td>' + esc(x.assunto) + '</td><td>' + esc(x.para) + '</td>' +
        '<td>' + (x.status === 'erro' ? '<span class="pill vencido" title="' + esc(x.erro) + '">erro</span><div class="sub">' + esc(String(x.erro || '').slice(0, 80)) + '</div>' : x.status === 'enviado' ? '<span class="pill pago">enviado</span>' : '<span class="pill hoje">na fila</span>') + '</td>' +
        '<td class="acoes-l">' + (x.status === 'erro' ? '<button class="btn btn-o btn-mini" data-em-de-novo="' + x.id + '">Tentar de novo</button>' : '') + '</td></tr>').join('') +
      '</tbody></table></div>' : vazio(F.sit === 'erro' ? 'Nenhum e-mail com erro. 👏' : 'Nenhum e-mail enviado nos últimos 120 dias.')) + '</div>';
  }
  alvo.innerHTML = html;
  alvo.querySelectorAll('tr[data-em-ref]').forEach((tr) => tr.onclick = (ev) => { if (ev.target.closest('button, input, label')) return; previaEmail(tr.dataset.emRef); });
  const todos = $('em-todos'); if (todos) todos.onchange = () => alvo.querySelectorAll('[data-em-sel]').forEach((c) => { c.checked = todos.checked; });
  const env = async (refs, bt) => comBotao(bt, async () => {
    if (!refs.length) throw new Error('Marque pelo menos um e-mail.');
    const n = await q(sb.rpc('emails_central_enviar', { p_refs: refs }));
    aviso('✓ ' + n + ' e-mail(s) na fila de envio (saem em até 5 minutos).'); await carregarEmails();
  });
  alvo.querySelectorAll('[data-em-agora]').forEach((bt) => bt.onclick = () => env([bt.dataset.emAgora], bt));
  const sel = $('em-enviar-sel'); if (sel) sel.onclick = () => env([...alvo.querySelectorAll('[data-em-sel]:checked')].map((c) => c.dataset.emSel), sel);
  alvo.querySelectorAll('[data-em-pular]').forEach((bt) => bt.onclick = () => comBotao(bt, async () => {
    if (!confirm('Pular este e-mail? Ele não será enviado (nem pela rotina automática).')) return;
    await q(sb.rpc('emails_central_pular', { p_refs: [bt.dataset.emPular] })); aviso('E-mail pulado.'); await carregarEmails();
  }));
  alvo.querySelectorAll('[data-em-de-novo]').forEach((bt) => bt.onclick = () => comBotao(bt, async () => {
    await q(sb.rpc('email_reenviar', { p_id: bt.dataset.emDeNovo })); aviso('✓ Voltou para a fila: sai na próxima rodada (até 5 minutos).'); await carregarEmails();
  }));
}
// "E-mail de destino": o endereço e de qual contato ele veio (empresas podem ter vários e-mails)
// Backup 25: de onde veio o destinatário — marcado para este tipo, contato do setor, contato geral ou e-mail do cadastro
const ORIGEM_DESTINO = { marcado: 'marcado para receber', setor: 'contato do setor', geral: 'contato geral', cadastro: 'e-mail do cadastro' };
const rotSetor = (k) => (SETORES_CONTATO.find((x) => x[0] === k) || [k, k || ''])[1];
function destinoEmail(x) {
  if (!x.para) return '<span class="sub">— sem e-mail —</span><div class="sub">cadastre em Clientes → ficha → Contatos</div>';
  const de = x.origem === 'cadastro' || (!x.contato && !x.setor) ? 'e-mail do cadastro' : [x.contato ? esc(x.contato) : '', x.setor ? esc(rotSetor(x.setor)) : '', esc(ORIGEM_DESTINO[x.origem] || '')].filter(Boolean).join(' · ');
  return '<span class="em-para">' + esc(x.para) + '</span><div class="sub" title="Quem recebe: o contato marcado com a finalidade deste e-mail (Clientes → ficha → Contatos)">' + de + '</div>';
}
async function previaEmail(ref) {
  const p = await q(sb.rpc('emails_central_previa', { p_ref: ref }));
  if (!p) return aviso('Prévia indisponível.', true);
  const j = abrirJanela({ titulo: '✉ ' + p.assunto, larga: true,
    corpo: '<div class="sub" style="margin-bottom:8px">Para: <b>' + esc(p.para || '— sem e-mail —') + '</b></div><iframe class="em-previa" sandbox="" title="Prévia do e-mail"></iframe>' });
  j.querySelector('iframe').srcdoc = p.html;
}
// ⚙ automático por tipo, horário e os intervalos dos avisos
async function janelaAutoEmails() {
  const c = await q(sb.rpc('config_emails'));
  const lig = (k, r, d) => '<label class="check em-lig"><input type="checkbox" name="' + k + '"' + (c[k] ? ' checked' : '') + '> <b>' + r + '</b> <span class="sub">' + d + '</span></label>';
  const j = abrirJanela({ titulo: '⚙ E-mails automáticos', larga: true,
    corpo: '<form id="f-emauto" class="grade">' +
      '<div class="inteiro">' + lig('honorarios', 'Honorários', 'lembrete, vence hoje e 1º/2º/3º aviso de atraso') + lig('parcelamentos', 'Parcelamentos', 'guia do mês e aviso de parcelas em atraso') +
        lig('acordos', 'Acordos', 'lembrete da parcela e aviso de atraso') + lig('recibos', 'Recibos', 'ao marcar "Recebido", com o PDF do recibo') + '</div>' +
      campo('Horário do envio (Brasília)', '<input name="hora" type="time" value="' + esc(c.hora || '') + '">') +
      campo('Lembrete de honorários: dias antes', '<input name="lembrete_dias" type="number" min="1" max="30" value="' + c.lembrete_dias + '">') +
      campo('1º aviso de atraso (dias)', '<input name="a1" type="number" min="1" value="' + c.atraso[0] + '">') +
      campo('2º aviso (dias)', '<input name="a2" type="number" min="2" value="' + c.atraso[1] + '">') +
      campo('3º aviso (dias)', '<input name="a3" type="number" min="3" value="' + c.atraso[2] + '">') +
      campo('Guia do parcelamento: dias antes', '<input name="parc_dias" type="number" min="0" max="30" value="' + c.parc_dias + '">') +
      campo('Parcela do acordo: dias antes', '<input name="aco_dias" type="number" min="0" max="30" value="' + c.aco_dias + '">') +
      campo('Acordo em atraso: avisar após (dias)', '<input name="aco_atraso_dias" type="number" min="0" max="60" value="' + c.aco_atraso_dias + '">') + '</form>' +
      '<p class="sub">Horário vazio = os e-mails saem junto da rotina das 7h (dias úteis). O perfil de e-mail de cada cliente continua valendo.</p>',
    rodape: '<span></span><button class="btn btn-p" type="button" id="emauto-salvar">Salvar</button>' });
  const f = j.querySelector('#f-emauto');
  j.querySelector('#emauto-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const n = (k) => parseInt(f[k].value, 10) || 0;
    await q(sb.rpc('salvar_config_emails', { p: { honorarios: f.honorarios.checked, parcelamentos: f.parcelamentos.checked, acordos: f.acordos.checked, recibos: f.recibos.checked,
      hora: f.hora.value || '', lembrete_dias: n('lembrete_dias'), atraso: [n('a1'), n('a2'), n('a3')], parc_dias: n('parc_dias'), aco_dias: n('aco_dias'), aco_atraso_dias: n('aco_atraso_dias') } }));
    aviso('✓ Configuração dos e-mails salva.'); fecharJanela(j); if ($('em-corpo')) await carregarEmails();
  });
}
// ✎ modelos (texto e assunto de cada e-mail)
async function janelaModelosEmail() {
  const ms = await q(sb.from('emails_modelos').select('*').order('ordem'));
  const j = abrirJanela({ titulo: '✎ Modelos dos e-mails ao cliente', larga: true,
    corpo: '<div class="dica" style="margin-bottom:10px">Os campos entre chaves são trocados sozinhos: {vencimento}, {parcela}, {credor}, {processo}, {empresa}, {natureza}, {numero}, {atrasadas}, {pix}, {valor}, {extenso}, {data_pagamento}. ' +
      'A saudação ("Olá, Fulano"), a tabela de valores e a assinatura com a marca do escritório entram automaticamente.</div>' +
      '<div class="lista-ficha">' + ms.map((m) => '<div class="item-ficha"><div><b>' + esc(m.nome) + '</b><div class="sub">' + esc(m.assunto) + '</div></div><button class="btn btn-o btn-mini" data-emm="' + m.chave + '">Editar</button></div>').join('') + '</div>' });
  j.querySelectorAll('[data-emm]').forEach((b) => b.onclick = () => {
    const m = ms.find((x) => x.chave === b.dataset.emm);
    const k = abrirJanela({ titulo: 'Modelo — ' + m.nome, larga: true,
      corpo: '<form id="f-emm" class="grade">' + campo('Assunto', '<input name="assunto" maxlength="200" value="' + esc(m.assunto) + '">', 'inteiro') +
        '<div class="inteiro em-manual"><div><div class="secao">Texto</div><div class="pr-texto" id="emm-texto" contenteditable="true">' + m.texto + '</div></div>' +
        '<div><div class="secao">Como o cliente recebe <span class="sub">(com dados de exemplo)</span></div><iframe id="emm-previa" class="em-previa" sandbox="" title="Prévia"></iframe></div></div></form>',
      rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="emm-salvar">Salvar</button></div>' });
    k.querySelector('.janela').classList.add('janela-rel');
    const EXEMPLO = { vencimento: '10/10/2026', parcela: '4/6', credor: 'Fornecedor Exemplo S.A.', processo: '0000000-00.2025.8.13.0000', empresa: 'Empresa Exemplo Ltda',
      natureza: 'Transação tributária · PGFN', numero: '12345', atrasadas: '2', pix: 'pix@escritorio.com.br', valor: 'R$ 4.500,00', extenso: 'quatro mil e quinhentos reais', data_pagamento: '28/09/2026' };
    let tPv; const pv = () => { clearTimeout(tPv); tPv = setTimeout(async () => {
      const troca = (t) => String(t).replace(/\{(\w+)\}/g, (x, c) => EXEMPLO[c] || x);
      const r = await sb.rpc('previa_email_modelo', { p_assunto: troca(k.querySelector('[name=assunto]').value), p_html: troca(limparHtmlEmail(k.querySelector('#emm-texto').innerHTML)) });
      if (!r.error) k.querySelector('#emm-previa').srcdoc = r.data || ''; }, 350); };
    k.querySelector('#emm-texto').addEventListener('input', pv); k.querySelector('[name=assunto]').addEventListener('input', pv); pv();
    k.querySelector('[data-cancelar]').onclick = () => fecharJanela(k);
    k.querySelector('#emm-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
      const f = k.querySelector('#f-emm'), txt = limparHtmlEmail(k.querySelector('#emm-texto').innerHTML);
      if (!f.assunto.value.trim() || !txt.trim()) throw new Error('Assunto e texto não podem ficar vazios.');
      await q(sb.from('emails_modelos').update({ assunto: f.assunto.value.trim(), texto: txt }).eq('chave', m.chave));
      aviso('✓ Modelo salvo.'); fecharJanela(k); fecharJanela(j); janelaModelosEmail();
    });
  });
}
function limparHtmlEmail(h) {
  const d = document.createElement('div'); d.innerHTML = h;
  d.querySelectorAll('script,style,iframe,object,embed,link,meta,img').forEach((x) => x.remove());
  d.querySelectorAll('*').forEach((x) => [...x.attributes].forEach((a) => { if (a.name !== 'style' || /url\(|expression/i.test(a.value)) x.removeAttribute(a.name); }));
  return d.innerHTML;
}
// aba "E-mails" da ficha do cliente
async function abaEmailsCliente(alvo, cl) {
  const l = await q(sb.rpc('emails_do_cliente', { p_cliente: cl.id }));
  alvo.innerHTML = '<div class="titulo-pag" style="margin-bottom:8px"><div><b>E-mails enviados</b> <span class="sub">' + l.length + '</span></div></div>' +
    (l.length ? '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th data-tipo="data">Quando</th><th>Tipo</th><th>Assunto</th><th>Para</th><th>Situação</th></tr></thead><tbody>' +
      l.map((x) => '<tr class="clicavel" data-em-id="' + x.id + '"><td class="mono" data-ord="' + esc(x.quando) + '">' + dataHoraBR(x.quando) + '</td><td>' + esc(x.tipo) + (x.anexo ? ' 📎' : '') + '</td><td>' + esc(x.assunto) + '</td><td>' + esc(x.para) + '</td>' +
        '<td>' + (x.status === 'erro' ? '<span class="pill vencido" title="' + esc(x.erro) + '">erro</span>' : x.status === 'enviado' ? '<span class="pill pago">entregue ao servidor</span>' : '<span class="pill hoje">na fila</span>') + '</td></tr>').join('') +
      '</tbody></table></div>' : vazio('Nenhum e-mail enviado a este cliente.'));
  alvo.querySelectorAll('[data-em-id]').forEach((tr) => tr.onclick = () => previaEmail(tr.dataset.emId).catch((e) => aviso(erroAmigavel(e), true)));
}

// ═══ Backup 25: CONTROLE POR CLIENTE — o que cada cliente recebe, para qual e-mail, quem é o responsável, modelo e histórico ═══
const TIPOS_CONTROLE = [['cobranca', 'Cobranças', 'hon_lembrete', 'lembrete antes do vencimento, vence hoje e 1º/2º/3º aviso de atraso'],
  ['guia', 'Guias', 'parc_guia', 'guia do parcelamento e parcelas em atraso'], ['acordo', 'Acordos', 'aco_lembrete', 'lembrete e atraso da parcela do acordo'],
  ['recibo', 'Recibos', 'recibo', 'ao dar baixa, com o PDF do recibo'], ['contrato', 'Contratos', 'boas_vindas', 'boas-vindas na assinatura, propostas'],
  ['convite', 'Convites', 'convite', 'convite de reunião (quando marcado na reunião)']];
let _emCtrl = [];
async function controleEmails(alvo) {
  const admin = E.perfil && E.perfil.papel === 'admin';
  E.emc = Object.assign({ busca: '', perfil: '', resp: '', problema: false }, E.emc || {});
  const F = E.emc;
  alvo.innerHTML = '<div class="carregando">Carregando…</div>';
  const [lista, dest] = await Promise.all([q(sb.rpc('emails_controle')), q(sb.from('configuracoes').select('valor').eq('chave', 'emails_destino').maybeSingle()).catch(() => null)]);
  _emCtrl = lista || [];
  const mapa = (dest && dest.valor) || {};
  const resps = [...new Set(_emCtrl.map((c) => c.responsavel).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  alvo.innerHTML =
    '<div class="card"><div class="card-hd">📨 Quem recebe o quê</div><div class="card-bd">' +
      '<p class="sub" style="margin-bottom:10px">Cada linha é um cliente: se ele recebe cada tipo de e-mail, <b>para qual endereço vai</b> e quem é o responsável. ' +
      'Clique no cliente para escolher os contatos de cada tipo, ver o modelo (como o e-mail sai) e o histórico do que já foi enviado. Nada sai com a pausa ligada.</p>' +
      '<div class="emc-destinos"><b>Quando ninguém está marcado, cada tipo vai para o setor:</b>' +
      TIPOS_CONTROLE.map(([k, r]) => '<label>' + r + ' → <select class="busca sel" data-emc-dest="' + k + '"' + (admin ? '' : ' disabled') + '>' +
        SETORES_CONTATO.map(([v, rs]) => '<option value="' + v + '"' + ((mapa[k] || 'financeiro') === v ? ' selected' : '') + '>' + rs + '</option>').join('') + '</select></label>').join('') +
      '<span class="sub">depois: contato Geral e, por último, o e-mail do cadastro.</span></div></div></div>' +
    '<div class="filtros" id="emc-filtros"><input class="busca" id="emc-busca" placeholder="Buscar cliente ou grupo" autocomplete="off" value="' + esc(F.busca) + '">' +
      '<select class="busca sel" id="emc-perfil"><option value="">Todos os perfis</option>' + PERFIS_EMAIL.map(([v, r]) => '<option value="' + v + '"' + (F.perfil === v ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>' +
      '<select class="busca sel" id="emc-resp"><option value="">Todos os responsáveis</option>' + resps.map((r) => '<option' + (F.resp === r ? ' selected' : '') + '>' + esc(r) + '</option>').join('') + '</select>' +
      '<label class="check"><input type="checkbox" id="emc-prob"' + (F.problema ? ' checked' : '') + '> Só com e-mail faltando</label>' +
      '<span class="sub" id="emc-sel" style="align-self:center"></span>' +
      '<select class="busca sel" id="emc-lote"><option value="">Perfil aos marcados…</option>' + PERFIS_EMAIL.filter((x) => x[0] !== 'personalizado').map(([v, r]) => '<option value="' + v + '">' + r + '</option>').join('') + '</select></div>' +
    '<div class="card"><div id="emc-tab"></div></div>';
  const celula = (t) => {
    if (!t || !t.recebe) return '<span class="pill neutro" title="O perfil de e-mail do cliente não manda este tipo">não recebe</span>';
    if (!t.para) return '<span class="pill vencido" title="Cadastre um contato com e-mail na ficha do cliente">sem e-mail</span>';
    const mails = String(t.para).split(/,\s*/);
    return '<span class="em-para" title="' + esc(t.para) + '">' + esc(mails[0]) + (mails.length > 1 ? ' <b>+' + (mails.length - 1) + '</b>' : '') + '</span>' +
      '<div class="sub">' + esc([t.contato, t.origem === 'cadastro' ? 'cadastro' : rotSetor(t.setor)].filter(Boolean).join(' · ')) + '</div>';
  };
  const pintar = () => {
    const b = normalizar(F.busca);
    const vis = _emCtrl.filter((c) => (!F.perfil || (c.perfil || 'padrao') === F.perfil) && (!F.resp || c.responsavel === F.resp) &&
      (!b || normalizar(c.nome + ' ' + (c.grupo || '')).includes(b)) && (!F.problema || TIPOS_CONTROLE.some(([k]) => c.tipos[k] && c.tipos[k].recebe && !c.tipos[k].para)));
    $('emc-tab').innerHTML = vis.length ? '<div class="tabela-wrap"><table class="ordenavel emc-tab"><thead><tr><th class="sem-ordem"><input type="checkbox" id="emc-todos" aria-label="Marcar todos"></th>' +
      '<th>Cliente</th><th>Quem</th><th>Perfil</th>' + TIPOS_CONTROLE.map(([, r, , d]) => '<th title="' + esc(d) + '">' + r + '</th>').join('') + '<th data-tipo="data">Último envio</th></tr></thead><tbody>' +
      vis.map((c) => '<tr class="clicavel" data-emc="' + c.id + '"><td><input type="checkbox" data-emc-x="' + c.id + '" aria-label="Marcar ' + esc(c.nome) + '"></td>' +
        '<td><b>' + esc(c.nome) + '</b>' + (c.grupo && c.grupo !== c.nome ? '<div class="sub">' + esc(c.grupo) + '</div>' : '') + '</td><td>' + pillPessoa(c.responsavel) + '</td>' +
        '<td><select class="busca sel cem-perfil-sel" data-cem="' + c.id + '" aria-label="Perfil de ' + esc(c.nome) + '">' + PERFIS_EMAIL.map(([v, r]) => '<option value="' + v + '"' + ((c.perfil || 'padrao') === v ? ' selected' : '') + '>' + r + '</option>').join('') + '</select></td>' +
        TIPOS_CONTROLE.map(([k]) => '<td>' + celula(c.tipos[k]) + '</td>').join('') +
        '<td data-ord="' + esc(c.ultimo ? c.ultimo.quando : '') + '">' + (c.ultimo ? '<span class="sub">' + dataHoraBR(c.ultimo.quando) + '</span><div class="sub" title="' + esc(c.ultimo.descricao) + '">' + esc(String(c.ultimo.descricao).slice(0, 60)) + '</div>' : '<span class="sub">—</span>') +
        (c.enviados30 ? '<div class="sub">' + plural(c.enviados30, 'e-mail', 'e-mails') + ' em 30 dias</div>' : '') + '</td></tr>').join('') + '</tbody></table></div>'
      : vazio('Nenhum cliente neste filtro.');
    const marcados = () => [...alvo.querySelectorAll('[data-emc-x]:checked')].map((x) => x.dataset.emcX);
    const conta = () => { const n = marcados().length; $('emc-sel').textContent = n ? n + ' marcado(s)' : ''; };
    const todos = $('emc-todos'); if (todos) todos.onchange = () => { alvo.querySelectorAll('[data-emc-x]').forEach((x) => { x.checked = todos.checked; }); conta(); };
    alvo.querySelectorAll('[data-emc-x]').forEach((x) => x.onchange = conta);
    alvo.querySelectorAll('tr[data-emc]').forEach((tr) => tr.onclick = (ev) => { if (ev.target.closest('input, select, label, button')) return; janelaControleCliente(tr.dataset.emc, () => controleEmails(alvo)); });
    alvo.querySelectorAll('[data-cem]').forEach((sel) => sel.onchange = () => comBotao(sel, async () => {
      if (sel.value === 'personalizado') {
        await q(sb.rpc('salvar_perfil_email', { p_ids: [sel.dataset.cem], p_perfil: 'personalizado', p_tipos: null }));
        _emCtrl = (await q(sb.rpc('emails_controle'))) || [];
        await janelaControleCliente(sel.dataset.cem, () => controleEmails(alvo)); return;
      }
      await q(sb.rpc('salvar_perfil_email', { p_ids: [sel.dataset.cem], p_perfil: sel.value, p_tipos: null }));
      aviso('✓ Perfil de e-mail atualizado.'); await carregarCadastros(true); await controleEmails(alvo);
    }));
  };
  $('emc-lote').onchange = (ev) => comBotao(ev.target, async () => {
    const v = ev.target.value, ids = [...alvo.querySelectorAll('[data-emc-x]:checked')].map((x) => x.dataset.emcX); ev.target.value = '';
    if (!v) return; if (!ids.length) throw new Error('Marque os clientes na primeira coluna.');
    const n = await q(sb.rpc('salvar_perfil_email', { p_ids: ids, p_perfil: v, p_tipos: null }));
    aviso('✓ ' + n + ' cliente(s) com o perfil atualizado.'); await carregarCadastros(true); await controleEmails(alvo);
  });
  alvo.querySelectorAll('[data-emc-dest]').forEach((sel) => sel.onchange = () => comBotao(sel, async () => {
    await q(sb.rpc('salvar_destinos_email', { p: { [sel.dataset.emcDest]: sel.value } }));
    aviso('✓ Destino padrão salvo.'); await controleEmails(alvo);
  }));
  let tb; $('emc-busca').oninput = (ev) => { clearTimeout(tb); tb = setTimeout(() => { F.busca = ev.target.value; pintar(); }, 250); };
  $('emc-perfil').onchange = (ev) => { F.perfil = ev.target.value; pintar(); };
  $('emc-resp').onchange = (ev) => { F.resp = ev.target.value; pintar(); };
  $('emc-prob').onchange = (ev) => { F.problema = ev.target.checked; pintar(); };
  pintar();
}
// detalhe de um cliente: tipo a tipo (recebe? para quem? quais contatos?), modelo de cada e-mail e histórico
async function janelaControleCliente(id, depois) {
  const c = _emCtrl.find((x) => x.id === id) || ((await q(sb.rpc('emails_controle'))) || []).find((x) => x.id === id);
  if (!c) return aviso('Cliente não encontrado.', true);
  const [contatos, cli, modelos] = await Promise.all([q(sb.from('contatos').select('id, nome, finalidade, email, recebe').eq('cliente_id', id).order('criado_em')),
    q(sb.from('clientes').select('perfil_email, emails_tipos').eq('id', id).single()), q(sb.from('emails_modelos').select('chave, nome, assunto, texto')).catch(() => [])]);
  const pers = cli.perfil_email === 'personalizado', tip = cli.emails_tipos || {};
  const PERM = { cobranca: ['lembrete', 'vencimento', 'cobranca'], guia: ['parcelamento'], acordo: ['acordo'], recibo: ['recibo'], contrato: ['boas_vindas'], convite: ['convite'] };
  const comEmail = contatos.filter((x) => x.email);
  const j = abrirJanela({ titulo: '📨 E-mails de ' + c.nome, larga: true,
    corpo: '<div class="ficha-selos" style="margin-bottom:10px">' + pillPessoa(c.responsavel) + ' <span class="pill neutro">Perfil: ' + esc((PERFIS_EMAIL.find((p) => p[0] === (c.perfil || 'padrao')) || PERFIS_EMAIL[0])[1]) + '</span></div>' +
      (comEmail.length ? '' : '<div class="dica" style="margin-bottom:10px">Este cliente não tem contato com e-mail. Cadastre em <b>Clientes → ficha → Contatos</b> (com o setor e o que cada um recebe).</div>') +
      '<div class="tabela-wrap"><table class="emc-det"><thead><tr><th>Tipo de e-mail</th><th>Recebe?</th><th>Vai para</th><th>Contatos que recebem este tipo</th><th></th></tr></thead><tbody>' +
      TIPOS_CONTROLE.map(([k, r, mod, d]) => { const t = c.tipos[k] || {};
        return '<tr><td><b>' + r + '</b><div class="sub">' + esc(d) + '</div></td>' +
          '<td>' + (pers ? PERM[k].map((pk) => '<label class="check"><input type="checkbox" data-emc-tipo="' + pk + '"' + ((tip[pk] != null ? tip[pk] : pk !== 'vencimento') ? ' checked' : '') + '> ' + esc((TIPOS_EMAIL.find((x) => x[0] === pk) || [pk, pk])[1]) + '</label>').join('')
            : t.recebe ? '<span class="pill pago">sim</span>' : '<span class="pill neutro">não</span>') + '</td>' +
          '<td>' + (t.para ? '<span class="em-para">' + esc(t.para) + '</span><div class="sub">' + esc(ORIGEM_DESTINO[t.origem] || '') + '</div>' : '<span class="pill vencido">sem e-mail</span>') + '</td>' +
          '<td>' + (comEmail.length ? comEmail.map((ct) => '<label class="check"><input type="checkbox" data-emc-ct="' + ct.id + '" data-k="' + k + '"' + ((ct.recebe || []).includes(k) ? ' checked' : '') + '> ' +
              esc(ct.nome || ct.email) + ' <span class="sub">' + esc(rotSetor(ct.finalidade)) + '</span></label>').join('') : '<span class="sub">—</span>') + '</td>' +
          '<td>' + (modelos.some((m) => m.chave === mod) ? '<button class="btn btn-o btn-mini" type="button" data-emc-modelo="' + mod + '">Ver modelo</button>' : '') + '</td></tr>'; }).join('') +
      '</tbody></table></div>' +
      '<p class="sub" style="margin:8px 0 14px">Marcar um contato num tipo faz <b>só ele(s)</b> receber aquele tipo. Sem ninguém marcado, vale o setor padrão (lá em cima, na lista).' +
        (pers ? ' Perfil <b>Personalizado</b>: as caixinhas de "Recebe?" valem para este cliente.' : ' Para escolher tipo a tipo o que ele recebe, mude o perfil para <b>Personalizado</b>.') + '</p>' +
      '<div class="secao">Histórico de e-mails</div><div id="emc-hist"><div class="carregando">Carregando…</div></div>',
    rodape: '<button class="btn btn-o" type="button" id="emc-ficha">Abrir a ficha (Contatos)</button><div class="acoes">' + (pers ? '<button class="btn btn-p" type="button" id="emc-salvar-tipos">Salvar o que recebe</button>' : '') + '</div>' });
  let mudou = false;
  j._aoFechar = () => { if (mudou && depois) depois(); };
  j.querySelectorAll('[data-emc-ct]').forEach((x) => x.onchange = () => comBotao(x, async () => {
    await q(sb.rpc('contato_recebe', { p_contato: x.dataset.emcCt, p_tipo: x.dataset.k, p_recebe: x.checked })); mudou = true;
    aviso('✓ ' + (x.checked ? 'Passa a receber' : 'Deixa de receber') + ' ' + (RECEBE_CURTO[x.dataset.k] || '').toLowerCase() + '.');
  }));
  j.querySelectorAll('[data-emc-modelo]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const m = modelos.find((x) => x.chave === b.dataset.emcModelo);
    const html = await q(sb.rpc('previa_email_modelo', { p_assunto: m.assunto, p_html: m.texto }));
    const k = abrirJanela({ titulo: '✉ Modelo — ' + m.nome, larga: true, corpo: '<div class="sub" style="margin-bottom:8px">Assunto: <b>' + esc(m.assunto) + '</b> · os campos entre chaves são trocados pelos dados de verdade. Para mudar o texto: ✎ Modelos.</div><iframe class="em-previa" sandbox="" title="Prévia do modelo"></iframe>' });
    k.querySelector('iframe').srcdoc = html;
  }));
  const bs = j.querySelector('#emc-salvar-tipos');
  if (bs) bs.onclick = () => comBotao(bs, async () => {
    const tipos = Object.assign({}, tip); j.querySelectorAll('[data-emc-tipo]').forEach((x) => { tipos[x.dataset.emcTipo] = x.checked; });
    await q(sb.rpc('salvar_perfil_email', { p_ids: [id], p_perfil: 'personalizado', p_tipos: tipos })); mudou = true;
    aviso('✓ O que ' + c.nome + ' recebe foi salvo.'); fecharJanela(j);
  });
  j.querySelector('#emc-ficha').onclick = () => { fecharJanela(j); abrirFicha(id, 'contatos'); };
  abaEmailsCliente(j.querySelector('#emc-hist'), { id }).catch((e) => { j.querySelector('#emc-hist').innerHTML = '<div class="vazio">' + esc(erroAmigavel(e)) + '</div>'; });
}
