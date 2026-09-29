'use strict';
// ═══════════════════════════════════════════════════════════════════
// Central de e-mails ao cliente (Backup 16): honorários, parcelamentos,
// acordos e recibos numa tela só. "A enviar hoje" mostra o que a rotina
// vai mandar (com prévia); dá para enviar agora, pular ou enviar vários.
// Modelos editáveis (Administração → E-mails) e o automático por tipo.
// ═══════════════════════════════════════════════════════════════════
const TIPOS_EMAIL = [['', 'Todos'], ['honorarios', 'Honorários'], ['parcelamentos', 'Parcelamentos'], ['acordos', 'Acordos'], ['recibos', 'Recibos']];
const ROT_TIPO_EMAIL = { honorarios: 'Honorários', parcelamentos: 'Parcelamento', acordos: 'Acordo', recibos: 'Recibo', propostas: 'Proposta' };
const SIT_EMAIL = [['hoje', 'A enviar hoje'], ['enviados', 'Enviados'], ['erro', 'Com erro']];

TELAS.emails = async function () {
  E.em = Object.assign({ sit: 'hoje', tipo: '', busca: '' }, E.em || {});
  const F = E.em;
  const admin = E.perfil && E.perfil.papel === 'admin';
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Central de e-mails ao cliente</h1><p>Honorários, parcelamentos, acordos e recibos — o que sai hoje, o que já foi e o que deu erro</p></div>' +
    '<div class="acoes">' + (admin ? '<button class="btn btn-o" id="em-auto">⚙ Automático e horário</button><button class="btn btn-o" id="em-modelos">✎ Modelos</button>' : '') + '</div></div>' +
    '<div class="abas" id="em-sit">' + SIT_EMAIL.map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<div class="filtros"><div class="segmento" id="em-tipo">' + TIPOS_EMAIL.map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<input class="busca" id="em-busca" placeholder="Buscar cliente, grupo ou assunto" autocomplete="off"></div>' +
    '<div id="em-corpo"><div class="carregando">Carregando…</div></div>';
  $('em-sit').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.sit = b.dataset.v; carregarEmails(); } };
  $('em-tipo').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.tipo = b.dataset.v; pintarEmails(); } };
  $('em-busca').value = F.busca;
  let t; $('em-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; pintarEmails(); }, 250); };
  if ($('em-auto')) $('em-auto').onclick = () => janelaAutoEmails();
  if ($('em-modelos')) $('em-modelos').onclick = () => janelaModelosEmail();
  await carregarEmails();
};
let _emLista = [], _emCfg = {};
async function carregarEmails() {
  const F = E.em;
  if ($('em-corpo')) $('em-corpo').innerHTML = '<div class="carregando">Carregando…</div>';
  [_emLista, _emCfg] = await Promise.all([q(sb.rpc('emails_central', { p_situacao: F.sit })), q(sb.rpc('config_emails')).catch(() => ({}))]);
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
  if (F.sit === 'hoje') {
    const envia = lista.filter((x) => !x.bloqueio);
    html += '<div class="card"><div class="card-hd">📬 A enviar hoje <span class="pill neutro">' + lista.length + '</span>' +
      (envia.length ? '<span style="margin-left:auto;display:flex;gap:6px"><label class="check" style="font-size:12.5px"><input type="checkbox" id="em-todos"> marcar todos</label>' +
        '<button class="btn btn-p btn-mini" id="em-enviar-sel">Enviar selecionados</button></span>' : '') + '</div>' +
      (lista.length ? '<div class="tabela-wrap"><table><thead><tr><th class="sem-ordem"></th><th>Tipo</th><th>Cliente</th><th>Assunto</th><th>Para</th><th class="num">Valor</th><th></th></tr></thead><tbody>' +
        lista.map((x) => '<tr class="clicavel" data-em-ref="' + esc(x.ref) + '" title="Clique para ver a prévia"><td>' + (x.bloqueio ? '' : '<input type="checkbox" data-em-sel="' + esc(x.ref) + '" aria-label="Selecionar">') + '</td>' +
          '<td><span class="pill aberto">' + esc(ROT_TIPO_EMAIL[x.tipo] || x.tipo) + '</span></td><td><b>' + esc(x.cliente || '—') + '</b>' + (x.grupo && x.grupo !== x.cliente ? '<div class="sub">' + esc(x.grupo) + '</div>' : '') + '</td>' +
          '<td>' + esc(x.assunto) + '</td><td>' + (x.bloqueio ? '<span class="pill neutro" title="Não vai sair">' + esc(x.bloqueio) + '</span>' : esc(x.para || '')) + '</td>' +
          '<td class="num mono">' + (Number(x.total) ? brl(x.total) : '—') + '</td>' +
          '<td class="acoes-l">' + (x.bloqueio ? '' : '<button class="btn btn-v btn-mini" data-em-agora="' + esc(x.ref) + '">Enviar agora</button> ') + '<button class="btn btn-o btn-mini" data-em-pular="' + esc(x.ref) + '">Pular este</button></td></tr>').join('') +
        '</tbody></table></div>' : vazio('Nada para enviar hoje. 👏')) + '</div>';
  } else {
    html += '<div class="card">' + (lista.length ? '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th data-tipo="data">Quando</th><th>Tipo</th><th>Cliente</th><th>Assunto</th><th>Para</th><th>Situação</th><th></th></tr></thead><tbody>' +
      lista.map((x) => '<tr class="clicavel" data-em-ref="' + esc(x.ref || x.id) + '"><td class="mono" data-ord="' + esc(x.quando) + '">' + dataHoraBR(x.quando) + '</td>' +
        '<td><span class="pill aberto">' + esc(ROT_TIPO_EMAIL[x.tipo] || x.tipo) + '</span>' + (x.anexo ? ' 📎' : '') + '</td><td>' + esc(x.cliente || '—') + '</td><td>' + esc(x.assunto) + '</td><td>' + esc(x.para) + '</td>' +
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
        '<div class="inteiro"><div class="secao">Texto</div><div class="pr-texto" id="emm-texto" contenteditable="true">' + m.texto + '</div></div></form>',
      rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="emm-salvar">Salvar</button></div>' });
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
