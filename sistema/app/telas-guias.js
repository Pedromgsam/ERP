'use strict';
// ═══════════════════════════════════════════════════════════════════
// Guias (Backup 27) — emissão das guias de PARCELAMENTOS e dos boletos/PIX de ACORDOS,
// pensada para o estagiário: 1) emitir  2) marcar "emitida" (data e quem, com o PDF guardado)
// 3) mandar ao cliente por e-mail (a guia vai anexa)  4) conferir o pagamento (✓ Pago).
// Quadro "Guias para emitir" no alto de Parcelamentos e de Acordos + janela de emissão,
// usada também nos cartões das parcelas do detalhamento.
// ═══════════════════════════════════════════════════════════════════
const GUIA_DIAS = 15;   // o quadro mostra o que vence até 15 dias à frente (e tudo o que já venceu sem pagamento)
const ABAS_GUIA = [['emitir', '🧾 A emitir'], ['emitidas', '✓ Emitidas — falta enviar'], ['vencidas', '⏰ Vencidas sem pagamento']];
const _guiaAba = { parcelas: 'emitir', acordos: 'emitir' };
// Backup 28: quadro minimizável (lembra por navegador) e envio de várias guias da mesma empresa num e-mail/WhatsApp
const _guiaMin = {};
try { Object.assign(_guiaMin, JSON.parse(localStorage.getItem('erp_guias_min') || '{}')); } catch (e) { /* sem armazenamento: começa aberto */ }
const emitida = (x) => !!x.emitida_em || /sim|emitid/i.test(x.emissao || '');

async function dadosGuias(tabela) {
  const lim = somarDias(hojeISO(), GUIA_DIAS);
  let L;
  if (tabela === 'parcelas') {
    L = (await q(sb.from('parcelas').select('id, numero, vencimento, pago, emissao, emitida_em, emitida_por, guia_doc, parcelamentos(id, empresa, natureza, local, numero, total_parcelas, valor_ultima_parcela, grupo_id, emitimos_guia, cnpj)')
      .eq('pago', false).lte('vencimento', lim).order('vencimento')).catch(() => []))
      .filter((x) => x.parcelamentos && x.parcelamentos.emitimos_guia !== false)
      .map((x) => { const p = x.parcelamentos;
        return Object.assign(x, { quem: p.empresa, detalhe: [p.natureza, p.local, p.numero ? 'nº ' + p.numero : ''].filter(Boolean).join(' · '),
          parcela: (x.numero || '?') + (p.total_parcelas ? '/' + p.total_parcelas : ''), valor: Number(p.valor_ultima_parcela) || 0, grupo_id: p.grupo_id,
          cliente_id: (E.clientes.find((c) => (soDigitos(p.cnpj) && soDigitos(c.cpf_cnpj) === soDigitos(p.cnpj)) || c.nome === p.empresa) || {}).id || null }); });
  } else {
    L = (await q(sb.from('acordos').select('id, parcela, total_parcelas, vencimento, valor, pago, emissao, emitida_em, emitida_por, guia_doc, devedor, credor, processo, grupo_id, pix, banco')
      .eq('pago', false).lte('vencimento', lim).order('vencimento')).catch(() => []))
      .map((x) => Object.assign(x, { quem: x.devedor, detalhe: 'deve a ' + (x.credor || '—') + (x.processo ? ' · ' + x.processo : ''),
        parcela: (x.parcela || '?') + (x.total_parcelas ? '/' + x.total_parcelas : ''), valor: Number(x.valor) || 0,
        cliente_id: (E.clientes.find((c) => c.grupo_id === x.grupo_id && primeiroNome(c.nome) === primeiroNome(x.devedor)) || {}).id || null }));
  }
  const envios = L.length ? await q(sb.rpc('emissao_emails', { p_tabela: tabela, p_ids: L.map((x) => x.id) })).catch(() => ({})) : {};
  L.forEach((x) => { x.email_em = (envios || {})[x.id] || null; });
  return L;
}

// quadro no alto de Parcelamentos / Acordos
// Backup 29: "Parcelamentos para emitir" / "Acordos para emitir"; o que já foi ENVIADO ao cliente sai do quadro (evita confusão)
async function cardGuias(tabela, el) {
  if (!el) return;
  if (!E.clientes.length) await carregarCadastros();
  const h = hojeISO(), TODOS = await dadosGuias(tabela), L = TODOS.filter((x) => !x.email_em), enviadas = TODOS.length - L.length;
  const grupos = { emitir: L.filter((x) => !emitida(x)), emitidas: L.filter((x) => emitida(x) && x.vencimento >= h), vencidas: L.filter((x) => x.vencimento < h) };
  const aba = _guiaAba[tabela], lista = grupos[aba], nome = tabela === 'parcelas' ? 'guia' : 'boleto/PIX';
  const dias = (v) => { const d = Math.round((new Date(v + 'T12:00:00') - new Date(h + 'T12:00:00')) / 864e5);
    return d < 0 ? '<span class="dias-r">' + (-d) + ' d atraso</span>' : d === 0 ? '<span class="dias-r">vence hoje</span>' : '<span class="' + (d < 3 ? 'dias-a' : d < 10 ? 'dias-b' : 'dias-g') + '">em ' + d + ' d</span>'; };
  const min = !!_guiaMin[tabela];
  el.innerHTML = '<div class="card gd-card' + (min ? ' gd-min' : '') + '"><div class="card-hd">🧾 ' + (tabela === 'parcelas' ? 'Parcelamentos para emitir' : 'Acordos para emitir') +
      (min && grupos.emitir.length ? ' <span class="pill hoje">' + grupos.emitir.length + ' a emitir</span>' : '') +
      '<span class="sub">vencem até ' + dataBR(somarDias(h, GUIA_DIAS)) + ' · emitir → enviar ao cliente → conferir o pagamento' + (enviadas ? ' · ✉ ' + plural(enviadas, 'já enviada ao cliente saiu', 'já enviadas ao cliente saíram') + ' da lista' : '') + '</span>' +
      '<span class="gd-hd-ac">' + (L.length ? '<button type="button" class="btn btn-p btn-mini" data-gd-empresa>✉ Enviar por empresa</button>' : '') +
      '<button type="button" class="btn btn-o btn-mini" data-gd-min aria-expanded="' + (min ? 'false' : 'true') + '">' + (min ? '▸ Mostrar' : '▾ Minimizar') + '</button></span></div>' +
    '<div class="card-bd"' + (min ? ' hidden' : '') + '><div class="segmento gd-abas">' + ABAS_GUIA.map(([k, r]) => '<button type="button" data-gd-aba="' + k + '" class="' + (aba === k ? 'ativo' : '') + '">' + r +
        ' <span class="pill ' + (k === 'vencidas' && grupos[k].length ? 'vencido' : k === 'emitir' && grupos[k].length ? 'hoje' : 'neutro') + '">' + grupos[k].length + '</span></button>').join('') + '</div>' +
    (lista.length ? '<div class="gd-lista">' + lista.map((x) => '<div class="gd-it' + (x.vencimento < h ? ' gd-venc' : '') + '">' +
        '<div class="gd-venc-d"><b>' + dataBR(x.vencimento).slice(0, 5) + '</b>' + dias(x.vencimento) + '</div>' +
        '<div class="gd-quem"><b>' + esc(x.quem || '—') + '</b><div class="sub">Parcela ' + esc(x.parcela) + (x.detalhe ? ' · ' + esc(x.detalhe) : '') + '</div></div>' +
        '<div class="gd-val">' + (x.valor ? brl(x.valor) : '—') + '</div>' +
        '<div class="gd-st">' + seloEmissao(x, nome) + '</div>' +
        '<div class="gd-ac">' + (emitida(x) ? (x.guia_doc ? '<button type="button" class="btn btn-o btn-mini" data-gd-ver="' + x.guia_doc + '">📄 Ver</button>' : '') +
            '<button type="button" class="btn btn-o btn-mini" data-gd-emitir="' + x.id + '">✎</button>'
          : '<button type="button" class="btn btn-p btn-mini" data-gd-emitir="' + x.id + '">🧾 Emitir</button>') +
          '<button type="button" class="btn btn-v btn-mini" data-gd-pago="' + x.id + '" title="Conferiu que o cliente pagou">✓ Pago</button></div></div>').join('') + '</div>'
      : '<div class="sub" style="padding:8px 2px">' + ({ emitir: 'Nada a emitir agora. 👏', emitidas: 'Nenhuma ' + nome + ' emitida aguardando envio.', vencidas: 'Nenhuma parcela vencida sem pagamento. 👏' })[aba] + '</div>') +
    '</div></div>';
  el.querySelector('[data-gd-min]').onclick = () => { _guiaMin[tabela] = !_guiaMin[tabela]; try { localStorage.setItem('erp_guias_min', JSON.stringify(_guiaMin)); } catch (e) { /* ok */ } cardGuias(tabela, el); };
  const be = el.querySelector('[data-gd-empresa]'); if (be) be.onclick = () => janelaGuiasEmpresa(tabela, L, null, () => cardGuias(tabela, el));
  el.querySelectorAll('[data-gd-aba]').forEach((b) => b.onclick = () => { _guiaAba[tabela] = b.dataset.gdAba; cardGuias(tabela, el); });
  el.querySelectorAll('[data-gd-emitir]').forEach((b) => b.onclick = () => janelaEmissao(tabela, L.find((x) => x.id === b.dataset.gdEmitir), () => cardGuias(tabela, el)));
  el.querySelectorAll('[data-gd-ver]').forEach((b) => b.onclick = () => comBotao(b, async () => { const d = (await q(sb.from('documentos').select('*').eq('id', b.dataset.gdVer)))[0]; if (d) await abrirDocumento(d); }));
  el.querySelectorAll('[data-gd-pago]').forEach((b) => b.onclick = () => { if (window.ERP_EDITOR && window.ERP_EDITOR.baixaRapida) window.ERP_EDITOR.baixaRapida(tabela, b.dataset.gdPago); });
}
function seloEmissao(x, nome) {
  return (emitida(x) ? '<span class="pill pago" title="' + esc(x.emitida_por ? 'por ' + x.emitida_por : '') + '">' + (nome === 'guia' ? 'Guia emitida' : 'Boleto emitido') + (x.emitida_em ? ' em ' + dataBR(x.emitida_em) : '') + '</span>'
      : '<span class="pill hoje">' + (nome === 'guia' ? 'Guia a emitir' : 'Boleto a emitir') + '</span>') +
    (x.email_em ? ' <span class="pill aberto" title="E-mail ao cliente">✉ enviada em ' + dataBR(String(x.email_em).slice(0, 10)) + '</span>' : '');
}
// arquivo escolhido na tela → {arquivo, mime, b64} (vai só dentro do e-mail; não é guardado no sistema)
function lerArquivoB64(f) {
  return new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok({ arquivo: f.name, mime: f.type || 'application/pdf', b64: String(r.result).split(',')[1] || '' }); r.onerror = () => erro(new Error('Não consegui ler ' + f.name)); r.readAsDataURL(f); });
}
const LIMITE_ANEXOS = 15 * 1024 * 1024;

// janela de emissão: marcar como emitida e, se quiser, mandar ao cliente com o PDF (o PDF vai só no e-mail)
async function janelaEmissao(tabela, x, depois) {
  if (!x) return;
  if (!E.clientes.length) await carregarCadastros();
  const nome = tabela === 'parcelas' ? 'guia' : 'boleto / PIX', ja = emitida(x);
  const j = abrirJanela({ titulo: '🧾 ' + (ja ? 'Emissão' : 'Emitir ' + nome) + ' — ' + (x.quem || ''), larga: true,
    corpo: '<div class="gd-jan-hd"><div><b>' + esc(x.quem || '—') + '</b><div class="sub">Parcela ' + esc(x.parcela || '') + (x.detalhe ? ' · ' + esc(x.detalhe) : '') + '</div></div>' +
        '<div class="gd-jan-v"><span>Vencimento</span><b>' + dataBR(x.vencimento) + '</b></div>' +
        '<div class="gd-jan-v"><span>Valor da guia</span><input id="gd-valor" data-mascara="brl" inputmode="decimal" value="' + (x.valor ? 'R$ ' + valorParaCampo(x.valor) : '') + '"></div></div>' +
      (ja ? '<div class="dica" style="margin:10px 0">' + (tabela === 'parcelas' ? 'Guia emitida' : 'Boleto emitido') + (x.emitida_em ? ' em <b>' + dataBR(x.emitida_em) + '</b>' : '') + (x.emitida_por ? ' por <b>' + esc(x.emitida_por) + '</b>' : '') +
          (x.email_em ? ' · e-mail ao cliente em <b>' + dataBR(String(x.email_em).slice(0, 10)) + '</b>' : ' · ainda não enviada ao cliente') + '.</div>' : '') +
      (tabela === 'acordos' && (x.pix || x.banco) ? '<div class="dica" style="margin:10px 0">Dados do credor: ' + [x.pix ? 'PIX <b>' + esc(x.pix) + '</b>' : '', x.banco ? esc(x.banco) : ''].filter(Boolean).join(' · ') + '</div>' : '') +
      '<ol class="passos gd-passos"><li>Emita a ' + nome + ' no site do órgão/credor.</li><li>Anexe o PDF aqui e marque "enviar ao cliente".</li>' +
        '<li>O PDF vai <b>só no e-mail</b> — não fica guardado no sistema.</li></ol>' +
      '<div class="grade"><div class="campo inteiro"><span>PDF da ' + nome + ' (opcional)</span><input type="file" id="gd-arq" accept=".pdf,image/*"></div>' +
      '<label class="check inteiro"><input type="checkbox" id="gd-enviar"' + (x.email_em ? '' : ' checked') + '> ✉ Enviar ao cliente por e-mail agora</label></div>',
    rodape: (ja ? '<button class="btn btn-x" type="button" id="gd-desfazer">Desmarcar emissão</button>' : '<span></span>') +
      '<div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="gd-ok">' + (ja ? 'Salvar' : '✓ Marcar como emitida') + '</button></div>' });
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  const fim = async (msg) => { aviso(msg); fecharJanela(j); if (depois) await depois(); if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); };
  j.querySelector('#gd-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const arq = j.querySelector('#gd-arq').files[0], enviar = j.querySelector('#gd-enviar').checked, v = lerValor(j.querySelector('#gd-valor').value) || x.valor || 0;
    if (enviar && arq) {
      if (arq.size > LIMITE_ANEXOS) throw new Error('O PDF passa de 15 MB.');
      const r = await q(sb.rpc('enviar_guias_email', { p_cliente: x.cliente_id || null, p_grupo: x.grupo_id || null,
        p_itens: [{ tabela, id: x.id, descricao: descricaoGuia(tabela, x), vencimento: x.vencimento, valor: v }],
        p_assunto: (tabela === 'parcelas' ? 'Guia de parcelamento' : 'Boleto de acordo') + ' — ' + (x.quem || ''), p_texto: textoGuias(tabela, x.quem || '', [x]).email,
        p_docs: [], p_para: null, p_arquivos: [await lerArquivoB64(arq)] }));
      return fim('✓ ' + (tabela === 'parcelas' ? 'Guia emitida' : 'Boleto emitido') + ' e e-mail na fila para ' + r.para + ' (sai em até 5 minutos).');
    }
    const r = await q(sb.rpc('registrar_emissao', { p_tabela: tabela, p_id: x.id, p_emitida: true, p_doc: null, p_enviar: enviar }));
    await fim('✓ ' + (tabela === 'parcelas' ? 'Guia emitida' : 'Boleto emitido') + ' em ' + dataBR(hojeISO()) + (r && r.email === 'enviado' ? ' e e-mail na fila (sai em até 5 minutos).' : r && r.email === 'sem e-mail' ? '. Atenção: o cliente não tem e-mail cadastrado para receber (Clientes → ficha → Contatos).' : r && r.email === 'já enviado' ? '. O e-mail desta parcela já tinha sido enviado.' : '.'));
  });
  const d = j.querySelector('#gd-desfazer');
  if (d) d.onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!confirm('Desmarcar a emissão desta parcela?')) return;
    await q(sb.rpc('registrar_emissao', { p_tabela: tabela, p_id: x.id, p_emitida: false, p_doc: null, p_enviar: false }));
    await fim('Emissão desmarcada.');
  });
}
// para os cartões do ERP (detalhamento do parcelamento/acordo): busca a parcela e abre a janela
async function emitirParcela(tabela, id, depois) {
  const L = await dadosGuias(tabela);
  let x = L.find((y) => y.id === id);
  if (!x) {   // vence depois de 15 dias: busca direto
    if (tabela === 'parcelas') {
      const r = (await q(sb.from('parcelas').select('id, numero, vencimento, pago, emissao, emitida_em, emitida_por, guia_doc, parcelamentos(empresa, natureza, local, numero, total_parcelas, valor_ultima_parcela, grupo_id)').eq('id', id)))[0];
      if (r) { const p = r.parcelamentos || {}; x = Object.assign(r, { quem: p.empresa, detalhe: [p.natureza, p.local].filter(Boolean).join(' · '), parcela: (r.numero || '?') + (p.total_parcelas ? '/' + p.total_parcelas : ''), valor: Number(p.valor_ultima_parcela) || 0, grupo_id: p.grupo_id, parcelamentos: p }); }
    } else {
      const r = (await q(sb.from('acordos').select('*').eq('id', id)))[0];
      if (r) x = Object.assign(r, { quem: r.devedor, detalhe: 'deve a ' + (r.credor || '—'), parcela: (r.parcela || '?') + (r.total_parcelas ? '/' + r.total_parcelas : ''), valor: Number(r.valor) || 0 });
    }
  }
  return janelaEmissao(tabela, x, depois);
}

// ═══ Várias guias da MESMA empresa num e-mail só (ou no WhatsApp) — Backup 29: visual novo e o texto das antigas "Notificações" ═══
const chaveEmpresaGuia = (x) => x.cliente_id || 'q:' + normalizar(x.quem || '');
const parcDe = (x) => { const [n, t] = String(x.parcela || '').split('/'); return (n || '?') + (t ? ' de ' + t : ''); };
function descricaoGuia(tabela, x) {
  const venc = x.vencimento < hojeISO() ? '⚠ VENCIDA — ' : '';
  if (tabela === 'parcelas') { const p = x.parcelamentos || {};
    return venc + 'Parcelamento ' + [p.local, p.natureza].filter(Boolean).join(' — ') + (p.numero ? ' · nº ' + p.numero : '') + ' · Parcela ' + parcDe(x); }
  return venc + 'Acordo' + (x.processo ? ' — processo ' + x.processo : '') + ' · Parcela ' + parcDe(x) + ' · ' + (x.devedor || '') + ' × ' + (x.credor || '');
}
// o texto (e-mail e WhatsApp) no modelo das antigas Notificações do ERP, um pouco melhorado
function textoGuias(tabela, empresa, itens) {
  const vencida = itens.some((x) => x.vencimento < hojeISO());
  const intro = tabela === 'parcelas'
    ? 'Prezados,\n\nSeguem as guias ' + (itens.length > 1 ? 'dos parcelamentos' : 'do parcelamento') + ' da ' + empresa + (vencida ? ' (há guia vencida — veja abaixo)' : ' com vencimento próximo') + '.\nAntes de pagar, confirme se a guia já não foi paga, para evitar pagamento em duplicidade.'
    : 'Prezados,\n\nSeguem ' + (itens.length > 1 ? 'as parcelas dos acordos' : 'a parcela do acordo') + ' da ' + empresa + (vencida ? ' (há parcela em atraso — veja abaixo)' : ' com vencimento próximo') + '.\nAntes de efetuar o pagamento, confirme se a parcela já não foi quitada, para evitar duplicidade.';
  const blocos = itens.map((x) => {
    const v = x._valor != null ? x._valor : x.valor;
    if (tabela === 'parcelas') { const p = x.parcelamentos || {};
      return (x.vencimento < hojeISO() ? '⚠ GUIA VENCIDA\n' : '') + '*Parcelamento ' + [p.local, p.natureza].filter(Boolean).join(' — ') + '*' + (p.numero ? '\nNº do parcelamento: ' + p.numero : '') +
        '\nParcela: ' + parcDe(x) + ' | Vencimento: ' + dataBR(x.vencimento) + '\nValor: ' + (v ? brl(v) : '[preencher]'); }
    return (x.vencimento < hojeISO() ? '⚠ PARCELA VENCIDA\n' : '') + '*Acordo' + (x.processo ? ' — processo ' + x.processo : '') + '*\nPartes: ' + (x.devedor || '—') + ' × ' + (x.credor || '—') +
      '\nParcela: ' + parcDe(x) + ' | Vencimento: ' + dataBR(x.vencimento) + '\nValor: ' + (v ? brl(v) : '[preencher]') + (x.pix ? '\nPIX do credor: ' + x.pix : '');
  });
  const tot = itens.reduce((s2, x) => s2 + (Number(x._valor != null ? x._valor : x.valor) || 0), 0);
  return { intro, email: intro + '\n\nOs arquivos seguem anexos.',
    zap: intro + '\n\n' + blocos.join('\n\n') + (itens.length > 1 ? '\n\n*Total: ' + brl(tot) + '*' : '') + '\n\nOs arquivos seguem anexos. Depois de pagar, por favor nos envie o comprovante.' };
}
async function janelaGuiasEmpresa(tabela, L, chaveIni, depois) {
  if (!E.clientes.length) await carregarCadastros();
  L = (L || []).filter((x) => !x.pago && !x.email_em);
  const emp = {};
  L.forEach((x) => { const k = chaveEmpresaGuia(x); (emp[k] = emp[k] || { k, nome: x.quem || '—', cli: x.cliente_id, grupo: x.grupo_id, itens: [] }).itens.push(x); });
  const lista = Object.values(emp).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  if (!lista.length) return aviso('Nenhuma parcela em aberto para enviar.', true);
  const nome = tabela === 'parcelas' ? 'guias' : 'boletos';
  let atualK = chaveIni && emp[chaveIni] ? chaveIni : lista[0].k, arquivos = [];
  const j = abrirJanela({ titulo: '✉ Enviar ' + nome + ' por empresa', larga: true,
    corpo: '<div class="ge"><aside class="ge-emps" id="ge-emps"></aside><section class="ge-msg" id="ge-msg"></section></div>',
    rodape: '<span class="ge-tot" id="ge-tot"></span><div class="acoes ge-acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button>' +
      '<button type="button" class="btn btn-v" id="ge-zap">💬 WhatsApp</button><button class="btn btn-p" type="button" id="ge-enviar">✉ Enviar e-mail</button></div>' });
  j.querySelector('.janela').classList.add('ge-janela');
  const $j = (sel) => j.querySelector(sel);
  const atual = () => emp[atualK];
  const pintarEmps = () => {
    $j('#ge-emps').innerHTML = '<div class="ge-emps-tit">Empresas <span class="sub">' + lista.length + '</span></div>' + lista.map((e) => '<button type="button" class="ge-emp' + (e.k === atualK ? ' ativo' : '') + '" data-ge-emp="' + esc(e.k) + '">' +
      '<b>' + esc(e.nome) + '</b><span class="sub">' + plural(e.itens.length, nome.slice(0, -1), nome) + ' · ' + brl(e.itens.reduce((s2, x) => s2 + (Number(x.valor) || 0), 0)) + '</span>' +
      (e.itens.some((x) => x.vencimento < hojeISO()) ? '<span class="pill vencido">vencida</span>' : '') + '</button>').join('');
  };
  const pintarMsg = () => {
    const e = atual(), c = E.clientes.find((y) => y.id === e.cli) || {}, t = textoGuias(tabela, e.nome, e.itens);
    arquivos = [];
    $j('#ge-msg').innerHTML =
      '<div class="ge-cab"><div><div class="ge-emp-nome">' + esc(e.nome) + '</div><div class="sub">' + esc([mascaraDoc(c.cpf_cnpj), c.grupos && c.grupos.nome].filter(Boolean).join(' · ')) + '</div></div></div>' +
      '<div class="ge-dest"><label class="campo"><span>✉ E-mail (para)</span><input id="ge-para" type="email" placeholder="em branco = contato de Parcelamentos do cadastro"></label>' +
        '<label class="campo"><span>💬 WhatsApp</span><input id="ge-tel" data-mascara="tel" inputmode="tel" value="' + esc(c.telefone || '') + '" placeholder="(37) 9 9999-9999"></label>' +
        '<label class="campo ge-ass"><span>Assunto</span><input id="ge-assunto" value="' + esc((tabela === 'parcelas' ? 'Guias de parcelamento' : 'Boletos de acordo') + ' — ' + e.nome) + '"></label></div>' +
      '<div class="ge-papel"><textarea id="ge-texto" rows="5">' + esc(t.intro) + '</textarea>' +
        '<div class="ge-itens">' + e.itens.map((x) => { const p = x.parcelamentos || {};
          return '<label class="ge-it' + (x.vencimento < hojeISO() ? ' ge-venc' : '') + '" data-ge="' + x.id + '"><input type="checkbox" checked aria-label="Incluir">' +
            '<span class="ge-it-txt">' + (x.vencimento < hojeISO() ? '<span class="ge-alerta">⚠ ' + (tabela === 'parcelas' ? 'GUIA VENCIDA' : 'PARCELA VENCIDA') + '</span>' : '') +
              '<b>' + esc(tabela === 'parcelas' ? 'Parcelamento ' + [p.local, p.natureza].filter(Boolean).join(' — ') : 'Acordo' + (x.processo ? ' — processo ' + x.processo : '')) + '</b>' +
              '<span>' + (tabela === 'parcelas' ? (p.numero ? 'Nº do parcelamento: <b>' + esc(p.numero) + '</b> · ' : '') : 'Partes: <b>' + esc(x.devedor || '—') + ' × ' + esc(x.credor || '—') + '</b> · ') +
              'Parcela <b>' + esc(parcDe(x)) + '</b> · Vencimento <b>' + dataBR(x.vencimento) + '</b></span></span>' +
            '<span class="ge-it-v"><small>Valor</small><input class="ge-valor" data-mascara="brl" inputmode="decimal" value="' + (x.valor ? 'R$ ' + valorParaCampo(x.valor) : '') + '" placeholder="R$ 0,00"></span></label>'; }).join('') + '</div>' +
        '<div class="ge-fecho">Os arquivos seguem anexos. Depois de pagar, por favor nos envie o comprovante.</div></div>' +
      '<div class="ge-anexos"><label class="ge-drop"><input type="file" id="ge-arqs" accept=".pdf,image/*" multiple hidden><span>📎 <b>Anexar os PDFs</b> das ' + nome + '</span><small>vão só no e-mail — não ficam guardados no sistema</small></label><div class="ge-chips" id="ge-chips"></div></div>';
    $j('#ge-arqs').onchange = () => { arquivos = arquivos.concat([...$j('#ge-arqs').files]); $j('#ge-arqs').value = ''; pintarChips(); };
    j.querySelectorAll('.ge-it input').forEach((i) => i.addEventListener('input', total));
    j.querySelectorAll('.ge-it input[type=checkbox]').forEach((i) => i.addEventListener('change', total));
    pintarChips(); total();
  };
  const pintarChips = () => { $j('#ge-chips').innerHTML = arquivos.map((f, k) => '<span class="ge-chip">📄 ' + esc(f.name) + ' <small>' + Math.max(1, Math.round(f.size / 1024)) + ' KB</small><button type="button" data-tira="' + k + '" aria-label="Tirar">×</button></span>').join('');
    j.querySelectorAll('[data-tira]').forEach((b) => b.onclick = () => { arquivos.splice(+b.dataset.tira, 1); pintarChips(); }); };
  const marcados = () => [...j.querySelectorAll('.ge-it')].filter((l) => l.querySelector('input[type=checkbox]').checked).map((l) => {
    const x = atual().itens.find((y) => y.id === l.dataset.ge), v = lerValor(l.querySelector('.ge-valor').value);
    return Object.assign({}, x, { _valor: isNaN(v) ? 0 : v });
  });
  const total = () => { const m = marcados(); $j('#ge-tot').innerHTML = m.length ? plural(m.length, 'parcela', 'parcelas') + ' · total <b>' + brl(m.reduce((s2, x) => s2 + x._valor, 0)) + '</b>' : 'Nenhuma parcela marcada'; };
  $j('#ge-emps').onclick = (ev) => { const b = ev.target.closest('[data-ge-emp]'); if (!b) return; atualK = b.dataset.geEmp; pintarEmps(); pintarMsg(); };
  pintarEmps(); pintarMsg();
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  $j('#ge-zap').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const its = marcados(); if (!its.length) throw new Error('Marque ao menos uma parcela.');
    const t = textoGuias(tabela, atual().nome, its), txt = $j('#ge-texto').value.trim() + t.zap.slice(t.intro.length);
    if (arquivos.length && navigator.canShare && navigator.canShare({ files: arquivos })) { await navigator.share({ text: txt, files: arquivos }); return; }
    const tel = soDigitos($j('#ge-tel').value);
    window.open('https://wa.me/' + (tel ? (tel.length <= 11 ? '55' : '') + tel : '') + '?text=' + encodeURIComponent(txt), '_blank', 'noopener');
    if (arquivos.length) aviso('No computador o WhatsApp não recebe anexo por link: arraste os PDFs para a conversa que abriu.');
  });
  $j('#ge-enviar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const its = marcados(), e = atual(); if (!its.length) throw new Error('Marque ao menos uma parcela.');
    if (its.some((i) => !(i._valor > 0))) throw new Error('Confira o valor de todas as parcelas marcadas.');
    if (arquivos.reduce((s2, f) => s2 + f.size, 0) > LIMITE_ANEXOS) throw new Error('Os PDFs somam mais de 15 MB: envie em dois e-mails.');
    const arqs = []; for (const f of arquivos) arqs.push(await lerArquivoB64(f));
    const r = await q(sb.rpc('enviar_guias_email', { p_cliente: e.cli || null, p_grupo: e.grupo || null,
      p_itens: its.map((i) => ({ tabela, id: i.id, descricao: descricaoGuia(tabela, i), vencimento: i.vencimento, valor: i._valor })),
      p_assunto: $j('#ge-assunto').value.trim(), p_texto: $j('#ge-texto').value.trim() + '\n\nOs arquivos seguem anexos.', p_docs: its.map((i) => i.guia_doc).filter(Boolean),
      p_para: $j('#ge-para').value.trim() || null, p_arquivos: arqs }));
    aviso('✓ E-mail com ' + plural(r.itens, 'parcela', 'parcelas') + (r.anexos ? ' e ' + plural(r.anexos, 'anexo', 'anexos') : '') + ' na fila para ' + r.para + '. As parcelas enviadas saíram do quadro.');
    fecharJanela(j); if (depois) await depois(); if (window.ERP_RECARREGAR) window.ERP_RECARREGAR();
  });
  return j;
}
