'use strict';
// ═══════════════════════════════════════════════════════════════════
// Guias (Backup 27) — emissão das guias de PARCELAMENTOS e dos boletos/PIX de ACORDOS,
// pensada para o estagiário: 1) emitir  2) marcar "emitida" (data e quem, com o PDF guardado)
// 3) mandar ao cliente por e-mail (a guia vai anexa)  4) conferir o pagamento (✓ Pago).
// Quadro "Guias para emitir" no alto de Parcelamentos e de Acordos + janela de emissão,
// usada também nos cartões das parcelas do detalhamento.
// ═══════════════════════════════════════════════════════════════════
const GUIA_DIAS = 15;   // o quadro mostra o que vence até 15 dias à frente (e tudo o que já venceu sem pagamento)
const ABAS_GUIA = [['emitir', '🧾 A emitir'], ['emitidas', '✓ Emitidas — aguardando pagamento'], ['vencidas', '⏰ Vencidas sem pagamento']];
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
async function cardGuias(tabela, el) {
  if (!el) return;
  if (!E.clientes.length) await carregarCadastros();
  const h = hojeISO(), L = await dadosGuias(tabela);
  const grupos = { emitir: L.filter((x) => !emitida(x)), emitidas: L.filter((x) => emitida(x) && x.vencimento >= h), vencidas: L.filter((x) => x.vencimento < h) };
  const aba = _guiaAba[tabela], lista = grupos[aba], nome = tabela === 'parcelas' ? 'guia' : 'boleto/PIX';
  const dias = (v) => { const d = Math.round((new Date(v + 'T12:00:00') - new Date(h + 'T12:00:00')) / 864e5);
    return d < 0 ? '<span class="dias-r">' + (-d) + ' d atraso</span>' : d === 0 ? '<span class="dias-r">vence hoje</span>' : '<span class="' + (d < 3 ? 'dias-a' : d < 10 ? 'dias-b' : 'dias-g') + '">em ' + d + ' d</span>'; };
  const min = !!_guiaMin[tabela];
  el.innerHTML = '<div class="card gd-card' + (min ? ' gd-min' : '') + '"><div class="card-hd">🧾 ' + (tabela === 'parcelas' ? 'Guias para emitir' : 'Boletos / PIX para emitir') +
      (min && grupos.emitir.length ? ' <span class="pill hoje">' + grupos.emitir.length + ' a emitir</span>' : '') +
      '<span class="sub">vencem até ' + dataBR(somarDias(h, GUIA_DIAS)) + ' · emitir → marcar → enviar ao cliente → conferir o pagamento</span>' +
      '<span class="gd-hd-ac">' + (L.length ? '<button type="button" class="btn btn-o btn-mini" data-gd-empresa>✉ Enviar por empresa</button>' : '') +
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
      : '<div class="sub" style="padding:8px 2px">' + ({ emitir: 'Nada a emitir agora. 👏', emitidas: 'Nenhuma ' + nome + ' emitida aguardando pagamento.', vencidas: 'Nenhuma parcela vencida sem pagamento. 👏' })[aba] + '</div>') +
    '</div></div>';
  el.querySelector('[data-gd-min]').onclick = () => { _guiaMin[tabela] = !_guiaMin[tabela]; try { localStorage.setItem('erp_guias_min', JSON.stringify(_guiaMin)); } catch (e) { /* ok */ } cardGuias(tabela, el); };
  const be = el.querySelector('[data-gd-empresa]'); if (be) be.onclick = () => janelaGuiasEmpresa(tabela, L, null, () => cardGuias(tabela, el));
  el.querySelectorAll('[data-gd-aba]').forEach((b) => b.onclick = () => { _guiaAba[tabela] = b.dataset.gdAba; cardGuias(tabela, el); });
  el.querySelectorAll('[data-gd-emitir]').forEach((b) => b.onclick = () => janelaEmissao(tabela, L.find((x) => x.id === b.dataset.gdEmitir), () => cardGuias(tabela, el)));
  el.querySelectorAll('[data-gd-ver]').forEach((b) => b.onclick = () => comBotao(b, async () => { const d = (await q(sb.from('documentos').select('*').eq('id', b.dataset.gdVer)))[0]; if (d) await abrirDocumento(d); }));
  el.querySelectorAll('[data-gd-pago]').forEach((b) => b.onclick = () => { if (window.ERP_EDITOR && window.ERP_EDITOR.baixaRapida) window.ERP_EDITOR.baixaRapida(tabela, b.dataset.gdPago); });
}
function seloEmissao(x, nome) {
  return (emitida(x) ? '<span class="pill pago" title="' + esc(x.emitida_por ? 'por ' + x.emitida_por : '') + '">✓ ' + esc(nome) + ' emitida' + (x.emitida_em ? ' ' + dataBR(x.emitida_em).slice(0, 5) : '') + '</span>'
      : '<span class="pill hoje">' + esc(nome) + ' a emitir</span>') +
    (x.email_em ? ' <span class="pill aberto" title="E-mail ao cliente">✉ enviada ' + dataBR(String(x.email_em).slice(0, 10)).slice(0, 5) + '</span>' : '');
}

// janela de emissão: PDF (opcional) + "enviar ao cliente por e-mail" + marcar como emitida
async function janelaEmissao(tabela, x, depois) {
  if (!x) return;
  if (!E.clientes.length) await carregarCadastros();
  const nome = tabela === 'parcelas' ? 'guia' : 'boleto / PIX', ja = emitida(x);
  const j = abrirJanela({ titulo: '🧾 ' + (ja ? 'Emissão' : 'Emitir ' + nome) + ' — ' + (x.quem || ''), larga: true,
    corpo: '<div class="gd-jan-hd"><div><b>' + esc(x.quem || '—') + '</b><div class="sub">Parcela ' + esc(x.parcela || '') + (x.detalhe ? ' · ' + esc(x.detalhe) : '') + '</div></div>' +
        '<div class="gd-jan-v"><span>Vencimento</span><b>' + dataBR(x.vencimento) + '</b></div><div class="gd-jan-v"><span>Valor</span><b>' + (x.valor ? brl(x.valor) : '—') + '</b></div></div>' +
      (ja ? '<div class="dica" style="margin:10px 0">✓ Marcada como emitida' + (x.emitida_em ? ' em <b>' + dataBR(x.emitida_em) + '</b>' : '') + (x.emitida_por ? ' por <b>' + esc(x.emitida_por) + '</b>' : '') +
          (x.email_em ? ' · e-mail ao cliente em <b>' + dataBR(String(x.email_em).slice(0, 10)) + '</b>' : ' · e-mail ao cliente ainda não enviado') + '.</div>' : '') +
      (tabela === 'acordos' && (x.pix || x.banco) ? '<div class="dica" style="margin:10px 0">Dados do credor: ' + [x.pix ? 'PIX <b>' + esc(x.pix) + '</b>' : '', x.banco ? esc(x.banco) : ''].filter(Boolean).join(' · ') + '</div>' : '') +
      '<ol class="passos gd-passos"><li>Emita a ' + nome + ' no site do órgão/credor.</li>' +
        '<li>Anexe o PDF aqui (fica guardado em Documentos do cliente).</li><li>Marque "enviar ao cliente" para ele receber o e-mail com a ' + nome + ' anexa.</li></ol>' +
      '<div class="grade"><div class="campo inteiro"><span>PDF da ' + nome + (x.guia_doc ? ' (já tem um guardado — escolha outro só para trocar)' : ' (opcional)') + '</span><input type="file" id="gd-arq" accept=".pdf,image/*"></div>' +
      '<label class="check inteiro"><input type="checkbox" id="gd-enviar"' + (x.email_em ? '' : ' checked') + '> ✉ Enviar ao cliente por e-mail agora' + (x.email_em ? ' (já foi enviado um e-mail desta parcela)' : '') + '</label></div>',
    rodape: (ja ? '<button class="btn btn-x" type="button" id="gd-desfazer">Desmarcar emissão</button>' : '<span></span>') +
      '<div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="gd-ok">' + (ja ? 'Salvar' : '✓ Marcar como emitida') + '</button></div>' });
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  const fim = async (msg) => { aviso(msg); fecharJanela(j); if (depois) await depois(); if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); };
  j.querySelector('#gd-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const arq = j.querySelector('#gd-arq').files[0], enviar = j.querySelector('#gd-enviar').checked;
    let doc = null;
    if (arq) doc = (await enviarDocumento(arq, { cliente_id: x.cliente_id || undefined, grupo_id: x.grupo_id || undefined, tipo: 'guia' },
      { nome: (tabela === 'parcelas' ? 'Guia' : 'Boleto') + ' ' + (x.quem || '') + ' — parcela ' + (x.parcela || '') + ' — venc ' + dataBR(x.vencimento) + (arq.name.match(/\.[a-z0-9]+$/i) || ['.pdf'])[0] })).id;
    const r = await q(sb.rpc('registrar_emissao', { p_tabela: tabela, p_id: x.id, p_emitida: true, p_doc: doc, p_enviar: enviar }));
    await fim('✓ ' + (tabela === 'parcelas' ? 'Guia' : 'Boleto') + ' marcada como emitida' + (r && r.email === 'enviado' ? ' e e-mail na fila (sai em até 5 minutos).' : r && r.email === 'sem e-mail' ? '. Atenção: o cliente não tem e-mail cadastrado para receber (Clientes → ficha → Contatos).' : r && r.email === 'já enviado' ? '. O e-mail desta parcela já tinha sido enviado.' : '.'));
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
      if (r) { const p = r.parcelamentos || {}; x = Object.assign(r, { quem: p.empresa, detalhe: [p.natureza, p.local].filter(Boolean).join(' · '), parcela: (r.numero || '?') + (p.total_parcelas ? '/' + p.total_parcelas : ''), valor: Number(p.valor_ultima_parcela) || 0, grupo_id: p.grupo_id }); }
    } else {
      const r = (await q(sb.from('acordos').select('*').eq('id', id)))[0];
      if (r) x = Object.assign(r, { quem: r.devedor, detalhe: 'deve a ' + (r.credor || '—'), parcela: (r.parcela || '?') + (r.total_parcelas ? '/' + r.total_parcelas : ''), valor: Number(r.valor) || 0 });
    }
  }
  return janelaEmissao(tabela, x, depois);
}

// ═══ Backup 28: várias guias da MESMA empresa num e-mail só (ou no WhatsApp) ═══
// Escolhe a empresa → marca as parcelas → confere/edita os valores (mudam todo mês) e o texto → anexa os PDFs → envia.
// Nada sai sozinho: o e-mail só vai quando clica em "Enviar e-mail".
const chaveEmpresaGuia = (x) => x.cliente_id || 'q:' + normalizar(x.quem || '');
async function janelaGuiasEmpresa(tabela, L, chaveIni, depois) {
  if (!E.clientes.length) await carregarCadastros();
  L = (L || []).filter((x) => !x.pago);
  const emp = {};
  L.forEach((x) => { const k = chaveEmpresaGuia(x); (emp[k] = emp[k] || { k, nome: x.quem || '—', cli: x.cliente_id, grupo: x.grupo_id, itens: [] }).itens.push(x); });
  const lista = Object.values(emp).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  if (!lista.length) return aviso('Nenhuma parcela em aberto para enviar.', true);
  const nome = tabela === 'parcelas' ? 'guias' : 'boletos';
  const j = abrirJanela({ titulo: '✉ Enviar ' + nome + ' por empresa', larga: true,
    corpo: '<div class="grade">' + campo('Empresa', '<select id="ge-emp">' + lista.map((e) => '<option value="' + esc(e.k) + '"' + (e.k === chaveIni ? ' selected' : '') + '>' + esc(e.nome) + ' (' + e.itens.length + ')</option>').join('') + '</select>') +
        campo('Para (e-mail)', '<input id="ge-para" type="email" placeholder="em branco = contato de Guias do cadastro">') + '</div>' +
      '<div class="ge-itens" id="ge-itens"></div>' +
      '<div class="grade">' + campo('Assunto', '<input id="ge-assunto">', 'inteiro') +
        campo('Mensagem (pode editar)', '<textarea id="ge-texto" rows="5"></textarea>', 'inteiro') +
        '<div class="campo inteiro"><span>PDFs das ' + nome + ' (pode escolher vários)</span><input type="file" id="ge-arqs" accept=".pdf,image/*" multiple><div class="sub" id="ge-arqs-info"></div></div></div>',
    rodape: '<button type="button" class="btn btn-o" id="ge-zap">📲 WhatsApp</button><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="ge-enviar">✉ Enviar e-mail</button></div>' });
  const $j = (sel) => j.querySelector(sel);
  const atual = () => lista.find((e) => e.k === $j('#ge-emp').value) || lista[0];
  const pintar = () => {
    const e = atual();
    $j('#ge-itens').innerHTML = '<table class="ge-tab"><thead><tr><th></th><th>Parcela</th><th>Vencimento</th><th>Valor (confira: muda todo mês)</th><th>Guia guardada</th></tr></thead><tbody>' +
      e.itens.map((x) => '<tr data-ge="' + x.id + '"><td><input type="checkbox" checked aria-label="Incluir"></td><td>' + esc(x.parcela || '') + (x.detalhe ? '<div class="sub">' + esc(x.detalhe) + '</div>' : '') + '</td>' +
        '<td>' + dataBR(x.vencimento) + '</td><td><input class="ge-valor" data-mascara="brl" inputmode="decimal" value="' + (x.valor ? 'R$ ' + valorParaCampo(x.valor) : '') + '" placeholder="R$ 0,00"></td>' +
        '<td>' + (x.guia_doc ? '<span class="pill pago">📎 vai anexa</span>' : emitida(x) ? '<span class="pill neutro">sem PDF</span>' : '<span class="pill hoje">falta emitir</span>') + '</td></tr>').join('') + '</tbody></table>';
    $j('#ge-assunto').value = (tabela === 'parcelas' ? 'Guias do parcelamento' : 'Boletos do acordo') + ' — ' + e.nome;
    $j('#ge-texto').value = 'Seguem as ' + nome + ' para pagamento, com os valores e vencimentos abaixo. Os arquivos estão anexos.\nDepois de pagar, por favor responda com o comprovante.';
  };
  const itensMarcados = () => [...j.querySelectorAll('#ge-itens tr[data-ge]')].filter((tr) => tr.querySelector('input[type=checkbox]').checked).map((tr) => {
    const x = atual().itens.find((y) => y.id === tr.dataset.ge), v = lerValor(tr.querySelector('.ge-valor').value);
    return { x, valor: isNaN(v) ? 0 : v };
  });
  $j('#ge-emp').onchange = pintar; pintar();
  $j('#ge-arqs').onchange = () => { const fs = [...$j('#ge-arqs').files]; $j('#ge-arqs-info').textContent = fs.length ? fs.map((f) => f.name).join(' · ') : ''; };
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  const textoZap = (its) => { const e = atual(), tot = its.reduce((s2, i) => s2 + i.valor, 0);
    return 'Olá! Seguem as ' + nome + ' de ' + e.nome + ':\n' + its.map((i) => '• Parcela ' + (i.x.parcela || '') + ' — vence ' + dataBR(i.x.vencimento) + ' — ' + brl(i.valor)).join('\n') +
      (its.length > 1 ? '\nTotal: ' + brl(tot) : '') + '\nOs PDFs vão anexos. Depois de pagar, me mande o comprovante, por favor.'; };
  $j('#ge-zap').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const its = itensMarcados(); if (!its.length) throw new Error('Marque ao menos uma parcela.');
    const txt = textoZap(its), arqs = [...$j('#ge-arqs').files];
    if (arqs.length && navigator.canShare && navigator.canShare({ files: arqs })) { await navigator.share({ text: txt, files: arqs }); return; }
    const c = E.clientes.find((y) => y.id === atual().cli), tel = soDigitos(c && c.telefone);
    window.open('https://wa.me/' + (tel ? (tel.length <= 11 ? '55' : '') + tel : '') + '?text=' + encodeURIComponent(txt), '_blank', 'noopener');
    if (arqs.length) aviso('No computador o WhatsApp não recebe anexo por link: arraste os PDFs para a conversa que abriu.');
  });
  $j('#ge-enviar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const its = itensMarcados(), e = atual(); if (!its.length) throw new Error('Marque ao menos uma parcela.');
    if (its.some((i) => !(i.valor > 0))) throw new Error('Confira o valor de todas as parcelas marcadas.');
    const docs = its.map((i) => i.x.guia_doc).filter(Boolean);
    for (const f of [...$j('#ge-arqs').files]) docs.push((await enviarDocumento(f, { cliente_id: e.cli || undefined, grupo_id: e.grupo || undefined, tipo: 'guia' }, { nome: f.name })).id);
    const r = await q(sb.rpc('enviar_guias_email', { p_cliente: e.cli || null, p_grupo: e.grupo || null,
      p_itens: its.map((i) => ({ tabela, id: i.x.id, descricao: 'Parcela ' + (i.x.parcela || '') + (i.x.detalhe ? ' · ' + i.x.detalhe : ''), vencimento: i.x.vencimento, valor: i.valor })),
      p_assunto: $j('#ge-assunto').value.trim(), p_texto: $j('#ge-texto').value, p_docs: docs, p_para: $j('#ge-para').value.trim() || null }));
    aviso('✓ E-mail com ' + plural(r.itens, 'parcela', 'parcelas') + (r.anexos ? ' e ' + plural(r.anexos, 'anexo', 'anexos') : '') + ' na fila para ' + r.para + ' (sai em até 5 minutos).');
    fecharJanela(j); if (depois) await depois(); if (window.ERP_RECARREGAR) window.ERP_RECARREGAR();
  });
  return j;
}
