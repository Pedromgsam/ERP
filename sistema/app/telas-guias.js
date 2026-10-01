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
  L.forEach((x) => { const v = (envios || {})[x.id];
    // Backup 30: {em, status, para, erro} — status vem da fila (pendente · retido · enviado · erro · cancelado)
    const o = !v ? null : typeof v === 'string' ? { em: v, status: 'enviado' } : v;
    x.email_em = o ? o.em : null; x.email_st = o ? o.status : ''; x.email_para = o ? o.para || '' : ''; x.email_erro = o ? o.erro || '' : ''; });
  return L;
}
// já saiu (ou está saindo) para o cliente: na fila, retido pela pausa ou enviado. Erro/descartado volta para "falta enviar".
const guiaEnviada = (x) => !!x.email_em && !/erro|cancelado/.test(x.email_st || '');
const ST_EMAIL = { pendente: ['aberto', '✉ na fila'], retido: ['hoje', '⏸ retido (pausa)'], enviado: ['pago', '✉ enviado'], erro: ['vencido', '⚠ e-mail falhou'], cancelado: ['neutro', 'e-mail descartado'] };

// quadro no alto de Parcelamentos / Acordos
// Backup 29: "Parcelamentos para emitir" / "Acordos para emitir"; o que já foi ENVIADO ao cliente sai do quadro (evita confusão)
async function cardGuias(tabela, el) {
  if (!el) return;
  if (!E.clientes.length) await carregarCadastros();
  const h = hojeISO(), TODOS = await dadosGuias(tabela), L = TODOS.filter((x) => !guiaEnviada(x)), enviadas = TODOS.length - L.length,
    retidas = TODOS.filter((x) => x.email_st === 'retido').length, naFila = TODOS.filter((x) => x.email_st === 'pendente').length;
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
    '<div class="card-bd"' + (min ? ' hidden' : '') + '>' +
    (retidas || naFila ? '<div class="gd-fila">' + (retidas ? '⏸ <b>' + plural(retidas, 'e-mail de guia retido', 'e-mails de guias retidos') + '</b> pela pausa de envio — só sai quando alguém liberar. ' : '') +
      (naFila ? '✉ ' + plural(naFila, 'e-mail na fila', 'e-mails na fila') + ' (sai em até 5 minutos). ' : '') +
      '<button type="button" class="btn btn-o btn-mini" data-gd-fila>Abrir E-mails → Fila</button></div>' : '') +
    '<div class="segmento gd-abas">' + ABAS_GUIA.map(([k, r]) => '<button type="button" data-gd-aba="' + k + '" class="' + (aba === k ? 'ativo' : '') + '">' + r +
        ' <span class="pill ' + (k === 'vencidas' && grupos[k].length ? 'vencido' : k === 'emitir' && grupos[k].length ? 'hoje' : 'neutro') + '">' + grupos[k].length + '</span></button>').join('') + '</div>' +
    (lista.length ? htmlGuiasPorGrupo(tabela, lista, TODOS, nome, dias, h)
      : '<div class="sub" style="padding:8px 2px">' + ({ emitir: 'Nada a emitir agora. 👏', emitidas: 'Nenhuma ' + nome + ' emitida aguardando envio.', vencidas: 'Nenhuma parcela vencida sem pagamento. 👏' })[aba] + '</div>') +
    '</div></div>';
  const bf = el.querySelector('[data-gd-fila]'); if (bf) bf.onclick = () => { if (typeof window.nav === 'function') window.nav(null, 'emails'); };
  el.querySelector('[data-gd-min]').onclick = () => { _guiaMin[tabela] = !_guiaMin[tabela]; try { localStorage.setItem('erp_guias_min', JSON.stringify(_guiaMin)); } catch (e) { /* ok */ } cardGuias(tabela, el); };
  const be = el.querySelector('[data-gd-empresa]'); if (be) be.onclick = () => janelaGuiasEmpresa(tabela, L, null, () => cardGuias(tabela, el));
  el.querySelectorAll('[data-gd-grp]').forEach((b) => b.onclick = () => { const k = tabela + '|' + b.dataset.gdGrp; _guiaGrpAberto[k] = !_guiaGrpAberto[k]; cardGuias(tabela, el); });
  el.querySelectorAll('[data-gd-emp]').forEach((b) => b.onclick = () => janelaGuiasEmpresa(tabela, L, b.dataset.gdEmp, () => cardGuias(tabela, el)));
  el.querySelectorAll('[data-gd-aba]').forEach((b) => b.onclick = () => { _guiaAba[tabela] = b.dataset.gdAba; cardGuias(tabela, el); });
  el.querySelectorAll('[data-gd-emitir]').forEach((b) => b.onclick = () => janelaEmissao(tabela, L.find((x) => x.id === b.dataset.gdEmitir), () => cardGuias(tabela, el)));
  el.querySelectorAll('[data-gd-ver]').forEach((b) => b.onclick = () => comBotao(b, async () => { const d = (await q(sb.from('documentos').select('*').eq('id', b.dataset.gdVer)))[0]; if (d) await abrirDocumento(d); }));
  el.querySelectorAll('[data-gd-pago]').forEach((b) => b.onclick = () => { if (window.ERP_EDITOR && window.ERP_EDITOR.baixaRapida) window.ERP_EDITOR.baixaRapida(tabela, b.dataset.gdPago); });
}
// Backup 31: o quadro em blocos — GRUPO (clique abre) › empresa (botão "Emitir" = e-mail com as guias dela) › parcelas
const _guiaGrpAberto = {};
const chaveParcGuia = (tabela, x) => tabela === 'parcelas' ? (x.parcelamentos && x.parcelamentos.id) || x.parcelamento_id || x.id : [x.devedor, x.credor, x.processo].join('|');
function htmlGuiasPorGrupo(tabela, lista, TODOS, nome, dias, h) {
  // parcelas vencidas sem pagamento por parcelamento/acordo (todas, não só as da aba): 1 = rosa, 2 ou mais = risco de rescisão
  const atr = {}; TODOS.forEach((x) => { if (x.vencimento < h) { const k = chaveParcGuia(tabela, x); atr[k] = (atr[k] || 0) + 1; } });
  const grs = {};
  lista.forEach((x) => { const gid = x.grupo_id || ''; const g = (grs[gid] = grs[gid] || { gid, nome: nomeGrupo(gid) || 'Sem grupo', emps: {} });
    const k = chaveEmpresaGuia(x); (g.emps[k] = g.emps[k] || { k, nome: x.quem || '—', itens: [] }).itens.push(x); });
  const G = Object.values(grs).sort((a, b) => (a.nome === 'Sem grupo') - (b.nome === 'Sem grupo') || a.nome.localeCompare(b.nome, 'pt-BR'));
  const unico = G.length === 1, mostrado = {};
  return '<div class="gd-grupos">' + G.map((g) => {
    const its = Object.values(g.emps).flatMap((e) => e.itens), aberto = unico || !!_guiaGrpAberto[tabela + '|' + g.gid];
    const venc = its.filter((x) => x.vencimento < h).length, tot = its.reduce((s2, x) => s2 + (Number(x.valor) || 0), 0);
    return '<div class="gd-g' + (aberto ? ' gd-g-aberto' : '') + '"><button type="button" class="gd-g-hd" data-gd-grp="' + esc(g.gid) + '" aria-expanded="' + aberto + '">' +
        '<span class="gd-g-seta">' + (aberto ? '▾' : '▸') + '</span><b>' + esc(g.nome) + '</b><span class="sub">' + plural(Object.keys(g.emps).length, 'empresa', 'empresas') + ' · ' + plural(its.length, nome, nome === 'guia' ? 'guias' : 'boletos') + '</span>' +
        (venc ? '<span class="pill atr-leve">' + venc + ' vencida' + (venc > 1 ? 's' : '') + '</span>' : '') + '<span class="gd-g-tot">' + (tot ? brl(tot) : '') + '</span></button>' +
      (aberto ? '<div class="gd-g-corpo">' + Object.values(g.emps).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((e) =>
        '<div class="gd-emp"><div class="gd-emp-hd"><b>' + esc(e.nome) + '</b><button type="button" class="btn btn-p btn-mini" data-gd-emp="' + esc(e.k) + '" title="Abre o e-mail com ' + (e.itens.length > 1 ? 'as ' + e.itens.length + ' guias' : 'a guia') + ' desta empresa: anexe os PDFs e envie">🧾 Emitir</button></div>' +
          e.itens.map((x) => { const kp = chaveParcGuia(tabela, x), n = atr[kp] && !mostrado[kp] ? atr[kp] : 0; mostrado[kp] = true;   // uma vez por parcelamento
            return '<div class="gd-it' + (x.vencimento < h ? ' gd-venc' : '') + '">' +
              '<div class="gd-venc-d"><b>' + dataBR(x.vencimento).slice(0, 5) + '</b>' + dias(x.vencimento) + '</div>' +
              '<div class="gd-quem"><span>Parcela ' + esc(x.parcela) + (x.detalhe ? ' · ' + esc(x.detalhe) : '') + '</span>' +
                (n ? ' <span class="pill ' + (n >= 2 ? 'vencido' : 'atr-leve') + '">' + n + ' em atraso' + (n >= 2 ? ' · risco de rescisão' : '') + '</span>' : '') + '</div>' +
              '<div class="gd-val">' + (x.valor ? brl(x.valor) : '—') + '</div>' +
              '<div class="gd-st">' + seloEmissao(x, nome) + '</div>' +
              '<div class="gd-ac">' + (emitida(x) ? (x.guia_doc ? '<button type="button" class="btn btn-o btn-mini" data-gd-ver="' + x.guia_doc + '">📄</button>' : '') +
                  '<button type="button" class="btn btn-o btn-mini" data-gd-emitir="' + x.id + '" title="Emissão / enviar esta guia">✎</button>'
                : '<button type="button" class="btn btn-o btn-mini" data-gd-emitir="' + x.id + '" title="Emitir só esta guia">Só esta</button>') +
                '<button type="button" class="btn btn-v btn-mini" data-gd-pago="' + x.id + '" title="Conferiu que o cliente pagou">✓ Pago</button></div></div>'; }).join('') + '</div>').join('') + '</div>' : '') + '</div>';
  }).join('') + '</div>';
}
function seloEmissao(x, nome) {
  return (emitida(x) ? '<span class="pill pago" title="' + esc(x.emitida_por ? 'por ' + x.emitida_por : '') + '">' + (nome === 'guia' ? 'Guia emitida' : 'Boleto emitido') + (x.emitida_em ? ' em ' + dataBR(x.emitida_em) : '') + '</span>'
      : '<span class="pill hoje">' + (nome === 'guia' ? 'Guia a emitir' : 'Boleto a emitir') + '</span>') +
    (x.email_em ? ' <span class="pill ' + (ST_EMAIL[x.email_st] || ST_EMAIL.enviado)[0] + '" title="' + esc((x.email_para ? 'para ' + x.email_para : '') + (x.email_erro ? ' — ' + x.email_erro : '')) + '">' +
      (ST_EMAIL[x.email_st] || ST_EMAIL.enviado)[1] + ' ' + dataBR(String(x.email_em).slice(0, 10)) + '</span>' : '');
}
// arquivo escolhido na tela → {arquivo, mime, b64} (vai só dentro do e-mail; não é guardado no sistema)
function lerArquivoB64(f) {
  return new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok({ arquivo: f.name, mime: f.type || 'application/pdf', b64: String(r.result).split(',')[1] || '' }); r.onerror = () => erro(new Error('Não consegui ler ' + f.name)); r.readAsDataURL(f); });
}
const LIMITE_ANEXOS = 15 * 1024 * 1024;

// e-mail cadastrado para receber as guias (contato marcado "Parcelamentos"/"Acordos", setor, geral ou cadastro)
async function preencherDestino(campo, cli, grp, tabela) {
  let para = '';
  if (cli || grp) para = await q(sb.rpc('guia_destino', { p_cliente: cli || null, p_grupo: grp || null, p_tabela: tabela })).catch(() => '') || '';
  if (!campo.isConnected) return;
  if (!campo.value) campo.value = para;
  campo.placeholder = para ? '' : 'sem e-mail cadastrado — digite aqui (ex.: financeiro@empresa.com.br)';
  campo.closest('.campo').classList.toggle('ge-sem-email', !para);
}
// a mensagem depois de pôr o e-mail na fila, conforme a situação real (pausa ligada = retido)
const msgEnvio = (r) => r && r.status === 'retido'
  ? 'e-mail para ' + r.para + ' RETIDO: o envio de e-mails está pausado. Para sair, vá em E-mails → Fila → Liberar (ou desligue a pausa).'
  : 'e-mail na fila para ' + (r && r.para) + ' (sai em até 5 minutos).';

// janela de emissão: marcar como emitida e, se quiser, mandar ao cliente com o PDF (o PDF vai só no e-mail)
async function janelaEmissao(tabela, x, depois) {
  if (!x) return;
  if (!E.clientes.length) await carregarCadastros();
  const nome = tabela === 'parcelas' ? 'guia' : 'boleto / PIX', ja = emitida(x);
  const j = abrirJanela({ titulo: '🧾 ' + (ja ? 'Emissão' : 'Emitir ' + nome) + ' — ' + (x.quem || ''), larga: true,
    corpo: '<div class="gd-jan-hd"><div><b>' + esc(x.quem || '—') + '</b><div class="sub">Parcela ' + esc(x.parcela || '') + (x.detalhe ? ' · ' + esc(x.detalhe) : '') + '</div></div>' +
        '<div class="gd-jan-v"><span>Vencimento</span><b>' + dataBR(x.vencimento) + '</b></div>' +
        '<div class="gd-jan-v ge-it-v"><span>Valor da guia</span><span class="ge-vbox"><span class="ge-rs">R$</span><input id="gd-valor" data-mascara="nenhuma" inputmode="decimal" value="' + (x.valor ? valorParaCampo(x.valor) : '') + '" placeholder="0,00" aria-label="Valor da guia"></span></div></div>' +
      (ja ? '<div class="dica" style="margin:10px 0">' + (tabela === 'parcelas' ? 'Guia emitida' : 'Boleto emitido') + (x.emitida_em ? ' em <b>' + dataBR(x.emitida_em) + '</b>' : '') + (x.emitida_por ? ' por <b>' + esc(x.emitida_por) + '</b>' : '') +
          (x.email_em ? ' · e-mail ao cliente em <b>' + dataBR(String(x.email_em).slice(0, 10)) + '</b>' + (x.email_st && x.email_st !== 'enviado' ? ' (' + (ST_EMAIL[x.email_st] || ['', x.email_st])[1] + ')' : '') : ' · ainda não enviada ao cliente') + '.</div>' : '') +
      (tabela === 'acordos' && (x.pix || x.banco) ? '<div class="dica" style="margin:10px 0">Dados do credor: ' + [x.pix ? 'PIX <b>' + esc(x.pix) + '</b>' : '', x.banco ? esc(x.banco) : ''].filter(Boolean).join(' · ') + '</div>' : '') +
      '<ol class="passos gd-passos"><li>Emita a ' + nome + ' no site do órgão/credor.</li><li>Anexe o PDF aqui e marque "enviar ao cliente".</li>' +
        '<li>O PDF vai <b>só no e-mail</b> — não fica guardado no sistema.</li></ol>' +
      '<div class="grade"><div class="inteiro"><label class="ge-drop"><input type="file" id="gd-arq" accept=".pdf,image/*" hidden><span id="gd-arq-n">📎 <b>Anexar o PDF</b> da ' + nome + ' (opcional)</span><small>vai só no e-mail — não fica guardado no sistema</small></label></div>' +
      '<label class="check inteiro"><input type="checkbox" id="gd-enviar"' + (guiaEnviada(x) ? '' : ' checked') + '> ✉ Enviar ao cliente por e-mail agora</label>' +
      '<label class="campo inteiro" id="gd-para-l"><span>✉ Para (e-mail do cliente)</span><input id="gd-para" type="text" autocomplete="off" placeholder="procurando o e-mail cadastrado…"></label></div>',
    rodape: (ja ? '<button class="btn btn-x" type="button" id="gd-desfazer">Desmarcar emissão</button>' : '<span></span>') +
      '<div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="gd-ok">' + (ja ? 'Salvar' : '✓ Marcar como emitida') + '</button></div>' });
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  // Backup 30: o mesmo destinatário do "Enviar por empresa" — já vem preenchido; se não houver, digite aqui
  const cPara = j.querySelector('#gd-para'), cEnv = j.querySelector('#gd-enviar');
  const verPara = () => { j.querySelector('#gd-para-l').hidden = !cEnv.checked;
    j.querySelector('#gd-ok').textContent = cEnv.checked ? '✉ ' + (ja ? 'Salvar e enviar e-mail' : 'Marcar emitida e enviar e-mail') : (ja ? 'Salvar' : '✓ Marcar como emitida'); };
  cEnv.addEventListener('change', verPara); verPara();
  j.querySelector('#gd-arq').onchange = (ev) => { const f = ev.target.files[0]; j.querySelector('#gd-arq-n').innerHTML = f ? '📄 <b>' + esc(f.name) + '</b> · ' + Math.max(1, Math.round(f.size / 1024)) + ' KB (clique para trocar)' : '📎 <b>Anexar o PDF</b>'; };
  const cVal = j.querySelector('#gd-valor'); cVal.addEventListener('blur', () => { const v = lerValor(cVal.value); cVal.value = v ? valorParaCampo(v) : ''; });
  preencherDestino(cPara, x.cliente_id, x.grupo_id, tabela);
  const fim = async (msg) => { aviso(msg); fecharJanela(j); if (depois) await depois(); if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); };
  j.querySelector('#gd-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const arq = j.querySelector('#gd-arq').files[0], enviar = j.querySelector('#gd-enviar').checked, v = lerValor(j.querySelector('#gd-valor').value) || x.valor || 0;
    if (enviar) {
      if (arq && arq.size > LIMITE_ANEXOS) throw new Error('O PDF passa de 15 MB.');
      if (!cPara.value.trim()) throw new Error('Digite o e-mail do cliente no campo "Para" (ou desmarque "Enviar ao cliente").');
      const r = await q(sb.rpc('enviar_guias_email', { p_cliente: x.cliente_id || null, p_grupo: x.grupo_id || null,
        p_itens: [{ tabela, id: x.id, descricao: descricaoGuia(tabela, x), vencimento: x.vencimento, valor: v }],
        p_assunto: (tabela === 'parcelas' ? 'Guia de parcelamento' : 'Boleto de acordo') + ' — ' + (x.quem || ''), p_texto: textoGuias(tabela, x.quem || '', [x]).email,
        p_docs: x.guia_doc ? [x.guia_doc] : [], p_para: cPara.value.trim(), p_arquivos: arq ? [await lerArquivoB64(arq)] : [] }));
      return fim('✓ ' + (tabela === 'parcelas' ? 'Guia emitida' : 'Boleto emitido') + ' e ' + msgEnvio(r));
    }
    await q(sb.rpc('registrar_emissao', { p_tabela: tabela, p_id: x.id, p_emitida: true, p_doc: null, p_enviar: false }));
    await fim('✓ ' + (tabela === 'parcelas' ? 'Guia emitida' : 'Boleto emitido') + ' em ' + dataBR(hojeISO()) + '. Ela fica em "Emitidas — falta enviar" até o e-mail sair.');
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
    ? 'Prezados,\n\nSeguem as guias ' + (itens.length > 1 ? 'dos parcelamentos' : 'do parcelamento') + ' em nome de ' + empresa + (vencida ? '.\nAtenção: há guia vencida — veja abaixo.' : ', com vencimento próximo.') + '\nAntes de pagar, confirme se a guia já não foi paga, para evitar pagamento em duplicidade.'
    : 'Prezados,\n\nSeguem ' + (itens.length > 1 ? 'as parcelas dos acordos' : 'a parcela do acordo') + ' em nome de ' + empresa + (vencida ? '.\nAtenção: há parcela em atraso — veja abaixo.' : ', com vencimento próximo.') + '\nAntes de efetuar o pagamento, confirme se a parcela já não foi quitada, para evitar duplicidade.';
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
  // Backup 30: empresas organizadas por GRUPO (igual ao Painel Executivo); sem grupo vai por último
  Object.values(emp).forEach((e) => { const c = E.clientes.find((y) => y.id === e.cli) || {}; e.gid = e.grupo || c.grupo_id || ''; e.gnome = nomeGrupo(e.gid) || ''; });
  const lista = Object.values(emp).sort((a, b) => (!a.gnome) - (!b.gnome) || a.gnome.localeCompare(b.gnome, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'));
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
    const grs = []; lista.forEach((e) => { const g = grs[grs.length - 1]; if (g && g.k === e.gid) g.emps.push(e); else grs.push({ k: e.gid, nome: e.gnome || 'Sem grupo', emps: [e] }); });
    $j('#ge-emps').innerHTML = '<div class="ge-emps-tit">Grupos <span class="sub">' + grs.length + ' · ' + plural(lista.length, 'empresa', 'empresas') + '</span></div>' +
      grs.map((g) => '<div class="ge-grp"><div class="ge-grp-hd"><b>' + esc(g.nome) + '</b><span class="sub">' + plural(g.emps.length, 'empresa', 'empresas') + '</span></div>' +
        g.emps.map((e) => '<button type="button" class="ge-emp' + (e.k === atualK ? ' ativo' : '') + '" data-ge-emp="' + esc(e.k) + '">' +
          '<b>' + esc(e.nome) + '</b><span class="sub">' + plural(e.itens.length, nome.slice(0, -1), nome) + ' · ' + brl(e.itens.reduce((s2, x) => s2 + (Number(x.valor) || 0), 0)) + '</span>' +
          (e.itens.some((x) => x.vencimento < hojeISO()) ? '<span class="pill vencido">vencida</span>' : '') + '</button>').join('') + '</div>').join('');
  };
  const pintarMsg = () => {
    const e = atual(), c = E.clientes.find((y) => y.id === e.cli) || {}, t = textoGuias(tabela, e.nome, e.itens);
    arquivos = [];
    $j('#ge-msg').innerHTML =
      '<div class="ge-cab"><div><div class="ge-emp-nome">' + esc(e.nome) + '</div><div class="sub">' + esc([mascaraDoc(c.cpf_cnpj), e.gnome].filter(Boolean).join(' · ')) + '</div></div></div>' +
      '<div class="ge-dest"><label class="campo"><span>✉ E-mail (para)</span><input id="ge-para" type="text" autocomplete="off" placeholder="procurando o e-mail cadastrado…"></label>' +
        '<label class="campo"><span>💬 WhatsApp</span><input id="ge-tel" data-mascara="tel" inputmode="tel" value="' + esc(c.telefone || '') + '" placeholder="(37) 9 9999-9999"></label>' +
        '<label class="campo ge-ass"><span>Assunto</span><input id="ge-assunto" value="' + esc((tabela === 'parcelas' ? 'Guias de parcelamento' : 'Boletos de acordo') + ' — ' + e.nome) + '"></label></div>' +
      '<div class="ge-papel"><textarea id="ge-texto" rows="5">' + esc(t.intro) + '</textarea>' +
        '<div class="ge-itens">' + e.itens.map((x) => { const p = x.parcelamentos || {};
          return '<label class="ge-it' + (x.vencimento < hojeISO() ? ' ge-venc' : '') + '" data-ge="' + x.id + '"><input type="checkbox" checked aria-label="Incluir">' +
            '<span class="ge-it-txt">' + (x.vencimento < hojeISO() ? '<span class="ge-alerta">⚠ ' + (tabela === 'parcelas' ? 'GUIA VENCIDA' : 'PARCELA VENCIDA') + '</span>' : '') +
              '<b>' + esc(tabela === 'parcelas' ? 'Parcelamento ' + [p.local, p.natureza].filter(Boolean).join(' — ') : 'Acordo' + (x.processo ? ' — processo ' + x.processo : '')) + '</b>' +
              '<span>' + (tabela === 'parcelas' ? (p.numero ? 'Nº do parcelamento: <b>' + esc(p.numero) + '</b> · ' : '') : 'Partes: <b>' + esc(x.devedor || '—') + ' × ' + esc(x.credor || '—') + '</b> · ') +
              'Parcela <b>' + esc(parcDe(x)) + '</b> · Vencimento <b>' + dataBR(x.vencimento) + '</b></span></span>' +
            '<span class="ge-it-v"><small>Valor da guia</small><span class="ge-vbox"><span class="ge-rs">R$</span><input class="ge-valor" data-mascara="nenhuma" inputmode="decimal" value="' + (x.valor ? valorParaCampo(x.valor) : '') + '" placeholder="0,00" aria-label="Valor"></span></span></label>'; }).join('') + '</div>' +
        '<div class="ge-fecho">Os arquivos seguem anexos. Depois de pagar, por favor nos envie o comprovante.</div></div>' +
      '<div class="ge-anexos"><label class="ge-drop"><input type="file" id="ge-arqs" accept=".pdf,image/*" multiple hidden><span>📎 <b>Anexar os PDFs</b> das ' + nome + '</span><small>vão só no e-mail — não ficam guardados no sistema</small></label><div class="ge-chips" id="ge-chips"></div></div>';
    $j('#ge-arqs').onchange = () => { arquivos = arquivos.concat([...$j('#ge-arqs').files]); $j('#ge-arqs').value = ''; pintarChips(); };
    j.querySelectorAll('.ge-it input').forEach((i) => i.addEventListener('input', total));
    j.querySelectorAll('.ge-it input[type=checkbox]').forEach((i) => i.addEventListener('change', total));
    j.querySelectorAll('.ge-valor').forEach((i) => i.addEventListener('blur', () => { const v = lerValor(i.value); i.value = v ? valorParaCampo(v) : ''; total(); }));
    preencherDestino($j('#ge-para'), e.cli, e.grupo, tabela);
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
    if (!$j('#ge-para').value.trim()) throw new Error('Digite o e-mail do cliente no campo "Para".');
    if (its.some((i) => !(i._valor > 0))) throw new Error('Confira o valor de todas as parcelas marcadas.');
    if (arquivos.reduce((s2, f) => s2 + f.size, 0) > LIMITE_ANEXOS) throw new Error('Os PDFs somam mais de 15 MB: envie em dois e-mails.');
    const arqs = []; for (const f of arquivos) arqs.push(await lerArquivoB64(f));
    const r = await q(sb.rpc('enviar_guias_email', { p_cliente: e.cli || null, p_grupo: e.grupo || null,
      p_itens: its.map((i) => ({ tabela, id: i.id, descricao: descricaoGuia(tabela, i), vencimento: i.vencimento, valor: i._valor })),
      p_assunto: $j('#ge-assunto').value.trim(), p_texto: $j('#ge-texto').value.trim() + '\n\nOs arquivos seguem anexos.', p_docs: its.map((i) => i.guia_doc).filter(Boolean),
      p_para: $j('#ge-para').value.trim() || null, p_arquivos: arqs }));
    aviso('✓ ' + plural(r.itens, 'parcela', 'parcelas') + (r.anexos ? ' e ' + plural(r.anexos, 'anexo', 'anexos') : '') + ': ' + msgEnvio(r) + ' As parcelas enviadas saíram do quadro.', r.status === 'retido');
    fecharJanela(j); if (depois) await depois(); if (window.ERP_RECARREGAR) window.ERP_RECARREGAR();
  });
  return j;
}
