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
    L = (await buscarTodos(() => sb.from('parcelas').select('id, numero, vencimento, pago, emissao, emitida_em, emitida_por, guia_doc, reenvio_em, reenvio_venc, reenvio_valor, reenvios, parcelamentos(id, empresa, natureza, local, numero, total_parcelas, valor_ultima_parcela, grupo_id, emitimos_guia, cnpj)')
      .eq('pago', false).lte('vencimento', lim).order('vencimento').order('id')).catch(() => []))
      .filter((x) => x.parcelamentos && x.parcelamentos.emitimos_guia !== false)
      .map((x) => { const p = x.parcelamentos;
        return Object.assign(x, { quem: p.empresa, detalhe: [p.natureza, p.local, p.numero ? 'nº ' + p.numero : ''].filter(Boolean).join(' · '),
          parcela: (x.numero || '?') + (p.total_parcelas ? '/' + p.total_parcelas : ''), valor: Number(p.valor_ultima_parcela) || 0, grupo_id: p.grupo_id,
          cliente_id: (E.clientes.find((c) => (soDigitos(p.cnpj) && soDigitos(c.cpf_cnpj) === soDigitos(p.cnpj)) || c.nome === p.empresa) || {}).id || null }); });
  } else {
    L = (await buscarTodos(() => sb.from('acordos').select('id, parcela, total_parcelas, vencimento, valor, pago, emissao, emitida_em, emitida_por, guia_doc, reenvio_em, reenvio_venc, reenvio_valor, reenvios, devedor, credor, processo, grupo_id, pix, banco, forma_pagamento')
      .eq('pago', false).lte('vencimento', lim).order('vencimento').order('id')).catch(() => []))
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
  const h = hojeISO(), TODOS = await dadosGuias(tabela), L = TODOS.filter((x) => !guiaEnviada(x)), enviadas = TODOS.filter((x) => guiaEnviada(x) && x.vencimento >= h).length,
    retidas = TODOS.filter((x) => x.email_st === 'retido').length, naFila = TODOS.filter((x) => x.email_st === 'pendente').length;
  // Backup 33: cada parcela em UMA aba só — a emitir / emitida (falta enviar) / VENCIDA sem pagamento (mesmo já enviada: fica até o ✓ Pago, com o reenvio)
  const grupos = { emitir: L.filter((x) => !emitida(x) && x.vencimento >= h), emitidas: L.filter((x) => emitida(x) && x.vencimento >= h), vencidas: TODOS.filter((x) => x.vencimento < h) };
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
      '</div>' : '') +
    '<div class="segmento gd-abas">' + ABAS_GUIA.map(([k, r]) => '<button type="button" data-gd-aba="' + k + '" class="' + (aba === k ? 'ativo' : '') + '">' + r +
        ' <span class="pill ' + (k === 'vencidas' && grupos[k].length ? 'vencido' : k === 'emitir' && grupos[k].length ? 'hoje' : 'neutro') + '">' + grupos[k].length + '</span></button>').join('') + '</div>' +
    (lista.length ? htmlGuiasPorGrupo(tabela, lista, TODOS, nome, dias, h, aba)
      : '<div class="sub" style="padding:8px 2px">' + ({ emitir: 'Nada a emitir agora. 👏', emitidas: 'Nenhuma ' + nome + ' emitida aguardando envio.', vencidas: 'Nenhuma parcela vencida sem pagamento. 👏' })[aba] + '</div>') +
    '</div></div>';
  el.querySelector('[data-gd-min]').onclick = () => { _guiaMin[tabela] = !_guiaMin[tabela]; try { localStorage.setItem('erp_guias_min', JSON.stringify(_guiaMin)); } catch (e) { /* ok */ } cardGuias(tabela, el); };
  const be = el.querySelector('[data-gd-empresa]'); if (be) be.onclick = () => janelaGuiasEmpresa(tabela, L, null, () => cardGuias(tabela, el));
  el.querySelectorAll('[data-gd-grp]').forEach((b) => b.onclick = () => { const k = tabela + '|' + b.dataset.gdGrp; _guiaGrpAberto[k] = !_guiaGrpAberto[k]; cardGuias(tabela, el); });
  el.querySelectorAll('[data-gd-emp]').forEach((b) => b.onclick = () => janelaGuiasEmpresa(tabela, L, b.dataset.gdEmp, () => cardGuias(tabela, el)));
  el.querySelectorAll('[data-gd-aba]').forEach((b) => b.onclick = () => { _guiaAba[tabela] = b.dataset.gdAba; cardGuias(tabela, el); });
  el.querySelectorAll('[data-gd-emitir]').forEach((b) => b.onclick = () => janelaEmissao(tabela, TODOS.find((x) => x.id === b.dataset.gdEmitir), () => cardGuias(tabela, el)));
  el.querySelectorAll('[data-gd-ver]').forEach((b) => b.onclick = () => comBotao(b, async () => { const d = (await q(sb.from('documentos').select('*').eq('id', b.dataset.gdVer)))[0]; if (d) await abrirDocumento(d); }));
  el.querySelectorAll('[data-gd-pago]').forEach((b) => b.onclick = () => { if (window.ERP_EDITOR && window.ERP_EDITOR.baixaRapida) window.ERP_EDITOR.baixaRapida(tabela, b.dataset.gdPago); });
}
// Backup 31: o quadro em blocos — GRUPO (clique abre) › empresa (botão "Emitir" = e-mail com as guias dela) › parcelas
const _guiaGrpAberto = {};
const chaveParcGuia = (tabela, x) => tabela === 'parcelas' ? (x.parcelamentos && x.parcelamentos.id) || x.parcelamento_id || x.id : [x.devedor, x.credor, x.processo].join('|');
function htmlGuiasPorGrupo(tabela, lista, TODOS, nome, dias, h, aba) {
  // Backup 33: tudo em COLUNAS fixas (como tabela) — A data · B parcela · C atraso · D valor · E situação · F ações — nas três abas
  const atr = {}; TODOS.forEach((x) => { if (x.vencimento < h) { const k = chaveParcGuia(tabela, x); atr[k] = (atr[k] || 0) + 1; } });
  const grs = {};
  lista.forEach((x) => { const gid = x.grupo_id || ''; const g = (grs[gid] = grs[gid] || { gid, nome: nomeGrupo(gid) || 'Sem grupo', emps: {} });
    const k = chaveEmpresaGuia(x); (g.emps[k] = g.emps[k] || { k, nome: x.quem || '—', itens: [] }).itens.push(x); });
  const G = Object.values(grs).sort((a, b) => (a.nome === 'Sem grupo') - (b.nome === 'Sem grupo') || a.nome.localeCompare(b.nome, 'pt-BR'));
  const unico = G.length === 1, mostrado = {}, venc = aba === 'vencidas', plN = nome === 'guia' ? 'guias' : 'boletos';
  const pillAtr = (n) => n ? '<span class="pill ' + (n >= 2 ? 'vencido' : 'atr-leve') + '">' + n + ' em atraso' + (n >= 2 ? ' · risco de rescisão' : '') + '</span>' : '';
  return '<div class="gd-grupos gd-tab">' +
    '<div class="gd-row gd-cab" aria-hidden="true"><span>Vencimento</span><span>' + (tabela === 'parcelas' ? 'Grupo / empresa / parcela' : 'Grupo / devedor / parcela') + '</span><span>Atraso</span><span class="gd-dir">Valor</span><span>Situação</span><span></span></div>' +
    G.map((g) => {
      const its = Object.values(g.emps).flatMap((e) => e.itens), aberto = unico || !!_guiaGrpAberto[tabela + '|' + g.gid];
      const nv = its.filter((x) => x.vencimento < h).length, tot = its.reduce((s2, x) => s2 + (Number(x.valor) || 0), 0);
      return '<div class="gd-g' + (aberto ? ' gd-g-aberto' : '') + '"><button type="button" class="gd-row gd-g-hd" data-gd-grp="' + esc(g.gid) + '" aria-expanded="' + aberto + '">' +
          '<span class="gd-g-nome"><span class="gd-g-seta">' + (aberto ? '▾' : '▸') + '</span><b>' + esc(g.nome) + '</b><span class="sub">' + plural(Object.keys(g.emps).length, 'empresa', 'empresas') + ' · ' + plural(its.length, nome, plN) + '</span></span>' +
          '<span>' + (nv ? '<span class="pill atr-leve">' + nv + ' vencida' + (nv > 1 ? 's' : '') + '</span>' : '') + '</span>' +
          '<span class="gd-dir gd-g-tot">' + (tot ? brl(tot) : '') + '</span><span></span><span></span></button>' +
        (aberto ? '<div class="gd-g-corpo">' + Object.values(g.emps).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((e) =>
          '<div class="gd-row gd-emp-hd"><span class="gd-emp-nome"><b>' + esc(e.nome) + '</b></span><span></span><span class="gd-dir sub">' + (e.itens.length > 1 ? brl(e.itens.reduce((s2, x) => s2 + (Number(x.valor) || 0), 0)) : '') + '</span><span></span>' +
            '<span class="gd-ac">' + (venc ? '' : '<button type="button" class="btn btn-p btn-mini" data-gd-emp="' + esc(e.k) + '" title="Abre o e-mail com ' + (e.itens.length > 1 ? 'as ' + e.itens.length + ' guias' : 'a guia') + ' desta empresa: anexe os PDFs e envie">🧾 Emitir</button>') + '</span></div>' +
            e.itens.map((x) => { const kp = chaveParcGuia(tabela, x), n = atr[kp] && !mostrado[kp] ? atr[kp] : 0; mostrado[kp] = true;   // uma vez por parcelamento
              return '<div class="gd-row gd-it' + (x.vencimento < h ? ' gd-venc' : '') + '">' +
                '<span class="gd-venc-d"><b>' + dataBR(x.vencimento).slice(0, 5) + '</b>' + dias(x.vencimento) + '</span>' +
                '<span class="gd-quem">Parcela ' + esc(x.parcela) + (x.detalhe ? ' · ' + esc(x.detalhe) : '') + '</span>' +
                '<span class="gd-atr">' + pillAtr(n) + '</span>' +
                '<span class="gd-val gd-dir">' + (x.valor ? brl(x.valor) : '—') + (x.reenvio_valor ? '<small title="valor atualizado da guia reenviada">→ ' + brl(x.reenvio_valor) + '</small>' : '') + '</span>' +
                '<span class="gd-st">' + seloEmissao(x, nome) + '</span>' +
                '<span class="gd-ac">' + (venc ? '<button type="button" class="btn btn-o btn-mini" data-gd-emitir="' + x.id + '" title="Reemitir a guia no portal (valor com SELIC) e mandar de novo ao cliente">↻ Reenviar</button>'
                  : emitida(x) ? (x.guia_doc ? '<button type="button" class="btn btn-o btn-mini" data-gd-ver="' + x.guia_doc + '">📄</button>' : '') +
                    '<button type="button" class="btn btn-o btn-mini" data-gd-emitir="' + x.id + '" title="Emissão / enviar esta guia">✎</button>'
                  : '<button type="button" class="btn btn-o btn-mini" data-gd-emitir="' + x.id + '" title="Emitir só esta guia">Só esta</button>') +
                  '<button type="button" class="btn btn-v btn-mini" data-gd-pago="' + x.id + '" title="Conferiu que o cliente pagou">✓ Pago</button></span></div>'; }).join('')).join('') + '</div>' : '') + '</div>';
    }).join('') + '</div>';
}
function seloEmissao(x, nome) {
  return (emitida(x) ? '<span class="pill pago" title="' + esc(x.emitida_por ? 'por ' + x.emitida_por : '') + '">' + (nome === 'guia' ? 'Guia emitida' : 'Boleto emitido') + (x.emitida_em ? ' em ' + dataBR(x.emitida_em) : '') + '</span>'
      : '<span class="pill hoje">' + (nome === 'guia' ? 'Guia a emitir' : 'Boleto a emitir') + '</span>') +
    (x.email_em ? ' <span class="pill ' + (ST_EMAIL[x.email_st] || ST_EMAIL.enviado)[0] + '" title="' + esc((x.email_para ? 'para ' + x.email_para : '') + (x.email_erro ? ' — ' + x.email_erro : '')) + '">' +
      (ST_EMAIL[x.email_st] || ST_EMAIL.enviado)[1] + ' ' + dataLocal(x.email_em) + '</span>' : '') +
    (x.reenvio_em ? ' <span class="pill aberto" title="' + esc('reenviada ' + (x.reenvios > 1 ? x.reenvios + ' vezes' : '1 vez') + (x.reenvio_valor ? ' · valor atualizado ' + brl(x.reenvio_valor) : '')) + '">↻ reenviada ' + dataLocal(x.reenvio_em) +
      (x.reenvio_venc ? ' · vence ' + dataBR(x.reenvio_venc).slice(0, 5) : '') + '</span>' : '');
}
// data local (fuso do navegador) de um carimbo de hora do banco — "2026-10-01T02:10Z" em Brasília ainda é 30/09
function dataLocal(ts) { if (!ts) return ''; const d = new Date(ts); return isNaN(d) ? dataBR(String(ts).slice(0, 10)) : d.toLocaleDateString('pt-BR'); }
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
  const cx = campo.closest('.campo'); if (cx) cx.classList.toggle('ge-sem-email', !para);
}
let _emailTeste;
async function emailDeTeste() {
  if (_emailTeste === undefined) _emailTeste = ((await q(sb.from('configuracoes').select('valor').eq('chave', 'email_redirecionar')).catch(() => []))[0] || {}).valor || '';
  return typeof _emailTeste === 'string' ? _emailTeste : '';
}
async function copiarTexto(txt) {
  try { await navigator.clipboard.writeText(txt); }
  catch (e) { const a = document.createElement('textarea'); a.value = txt; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); }
}
// Backup 42: depois de pôr o e-mail na fila, manda na hora (enviarEmailAgora) e mostra o que aconteceu de verdade
async function avisoEnvio(prefixo, r) {
  const s = await enviarEmailAgora(r && r.ref, r && r.para);
  aviso(prefixo + (s.ok ? '✓ ' : '⚠ ') + s.msg, !s.ok);
  return s;
}

// janela de emissão: marcar como emitida e, se quiser, mandar ao cliente com o PDF (o PDF vai só no e-mail)
async function janelaEmissao(tabela, x, depois) {
  if (!x) return;
  if (!E.clientes.length) await carregarCadastros();
  if (x.vencimento < hojeISO() && !x.pago) return janelaReenvio(tabela, x, depois);   // Backup 33: parcela vencida = reenviar a guia atualizada
  const nome = tabela === 'parcelas' ? 'guia' : 'boleto / PIX', ja = emitida(x);
  const j = abrirJanela({ titulo: '🧾 ' + (ja ? 'Emissão' : 'Emitir ' + nome) + ' — ' + (x.quem || ''), larga: true,
    corpo: '<div class="gd-jan-hd"><div><b>' + esc(x.quem || '—') + '</b><div class="sub">Parcela ' + esc(x.parcela || '') + (x.detalhe ? ' · ' + esc(x.detalhe) : '') + '</div></div>' +
        '<div class="gd-jan-v"><span>Vencimento</span><b>' + dataBR(x.vencimento) + '</b></div>' +
        '<div class="gd-jan-v ge-it-v"><span>Valor da guia</span><span class="ge-vbox"><span class="ge-rs">R$</span><input id="gd-valor" data-mascara="nenhuma" inputmode="decimal" value="' + (x.valor ? valorParaCampo(x.valor) : '') + '" placeholder="0,00" aria-label="Valor da guia"></span></div></div>' +
      (ja ? '<div class="dica" style="margin:10px 0">' + (tabela === 'parcelas' ? 'Guia emitida' : 'Boleto emitido') + (x.emitida_em ? ' em <b>' + dataBR(x.emitida_em) + '</b>' : '') + (x.emitida_por ? ' por <b>' + esc(x.emitida_por) + '</b>' : '') +
          (x.email_em ? ' · e-mail ao cliente em <b>' + dataLocal(x.email_em) + '</b>' + (x.email_st && x.email_st !== 'enviado' ? ' (' + (ST_EMAIL[x.email_st] || ['', x.email_st])[1] + ')' : '') : ' · ainda não enviada ao cliente') + '.</div>' : '') +
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
      await avisoEnvio((tabela === 'parcelas' ? 'Guia emitida' : 'Boleto emitido') + '. ', r); fecharJanela(j); if (depois) await depois(); if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); return;
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
// Backup 33: parcela VENCIDA sem pagamento — reemitir no portal (o órgão já calcula os juros/SELIC) e mandar de novo ao cliente.
// A parcela continua a mesma (mesmo número); guardamos o novo vencimento, o valor atualizado e quantas vezes foi reenviada.
function fimDoMesGuia(iso) { const d = new Date(iso.slice(0, 7) + '-01T12:00:00'); d.setMonth(d.getMonth() + 1); d.setDate(0); return d.toISOString().slice(0, 10); }
async function janelaReenvio(tabela, x, depois) {
  const nome = tabela === 'parcelas' ? 'guia' : 'boleto / PIX', h = hojeISO();
  const j = abrirJanela({ titulo: '↻ Reenviar ' + nome + ' vencida — ' + (x.quem || ''), larga: true,
    corpo: '<div class="gd-jan-hd"><div><b>' + esc(x.quem || '—') + '</b><div class="sub">Parcela ' + esc(x.parcela || '') + (x.detalhe ? ' · ' + esc(x.detalhe) : '') + '</div></div>' +
        '<div class="gd-jan-v"><span>Venceu em</span><b class="dias-r">' + dataBR(x.vencimento) + '</b></div>' +
        '<div class="gd-jan-v"><span>Valor original</span><b>' + (x.valor ? brl(x.valor) : '—') + '</b></div></div>' +
      (x.reenvio_em ? '<div class="dica" style="margin:10px 0">Já reenviada ' + (x.reenvios > 1 ? x.reenvios + ' vezes' : '1 vez') + ' — a última em <b>' + dataLocal(x.reenvio_em) + '</b>' +
        (x.reenvio_venc ? ', com vencimento em <b>' + dataBR(x.reenvio_venc) + '</b>' : '') + (x.reenvio_valor ? ' e valor de <b>' + brl(x.reenvio_valor) + '</b>' : '') + '.</div>' : '') +
      '<ol class="passos gd-passos"><li>Emita a ' + nome + ' <b>de novo</b> no portal (e-CAC, Regularize, SIARE, banco do credor…): ' + (tabela === 'parcelas' ? 'a guia nova já vem com os <b>juros (SELIC)</b> do atraso.' : 'peça o valor atualizado ao credor.') + '</li>' +
        '<li>Copie aqui o <b>novo vencimento</b> e o <b>valor atualizado</b> da guia nova e anexe o PDF.</li><li>O cliente recebe o e-mail avisando que é a mesma parcela, agora atualizada.</li></ol>' +
      '<div class="grade"><div class="campo"><span>Novo vencimento</span><input type="date" id="rv-venc" value="' + (x.reenvio_venc && x.reenvio_venc >= h ? x.reenvio_venc: fimDoMesGuia(h)) + '"></div>' +
        '<div class="campo ge-it-v"><span>Valor atualizado (com juros)</span><span class="ge-vbox"><span class="ge-rs">R$</span><input id="rv-valor" data-mascara="nenhuma" inputmode="decimal" value="' + valorParaCampo(x.reenvio_valor || x.valor || '') + '" placeholder="0,00"></span></div>' +
        '<div class="inteiro"><label class="ge-drop"><input type="file" id="rv-arq" accept=".pdf,image/*" hidden><span id="rv-arq-n">📎 <b>Anexar o PDF</b> da ' + nome + ' nova</span><small>vai só no e-mail — não fica guardado no sistema</small></label></div>' +
        '<label class="campo inteiro"><span>✉ Para (e-mail do cliente)</span><input id="rv-para" type="text" autocomplete="off" placeholder="procurando o e-mail cadastrado…"></label></div>',
    rodape: '<span class="sub">A parcela continua em "Vencidas" até você marcar ✓ Pago.</span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="rv-ok">↻ Reenviar ao cliente</button></div>' });
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  const cPara = j.querySelector('#rv-para'), cVal = j.querySelector('#rv-valor');
  cVal.addEventListener('blur', () => { const v = lerValor(cVal.value); cVal.value = v ? valorParaCampo(v) : ''; });
  j.querySelector('#rv-arq').onchange = (ev) => { const f = ev.target.files[0]; j.querySelector('#rv-arq-n').innerHTML = f ? '📄 <b>' + esc(f.name) + '</b> · ' + Math.max(1, Math.round(f.size / 1024)) + ' KB (clique para trocar)' : '📎 <b>Anexar o PDF</b>'; };
  preencherDestino(cPara, x.cliente_id, x.grupo_id, tabela);
  j.querySelector('#rv-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const venc = j.querySelector('#rv-venc').value, v = lerValor(cVal.value), arq = j.querySelector('#rv-arq').files[0];
    if (!venc || venc < h) throw new Error('Informe o novo vencimento (hoje ou depois).');
    if (!(v > 0)) throw new Error('Informe o valor atualizado da guia nova.');
    if (!cPara.value.trim()) throw new Error('Digite o e-mail do cliente no campo "Para".');
    if (arq && arq.size > LIMITE_ANEXOS) throw new Error('O PDF passa de 15 MB.');
    const desc = 'Guia ATUALIZADA da parcela vencida em ' + dataBR(x.vencimento) + ' — ' + descricaoGuia(tabela, Object.assign({}, x, { vencimento: venc }));
    const texto = 'Prezados,\n\nA parcela ' + parcDe(x) + (tabela === 'parcelas' ? ' do parcelamento' : ' do acordo') + ' em nome de ' + (x.quem || '') + ', que venceu em ' + dataBR(x.vencimento) + ', ainda consta em aberto.\n' +
      'Segue ' + (tabela === 'parcelas' ? 'a guia atualizada (já com os juros do atraso)' : 'o boleto atualizado') + ', com vencimento em ' + dataBR(venc) + ', no valor de ' + brl(v) + '.\n' +
      'Se o pagamento já foi feito, por favor desconsidere e nos envie o comprovante.\n\nOs arquivos seguem anexos.';
    const r = await q(sb.rpc('enviar_guias_email', { p_cliente: x.cliente_id || null, p_grupo: x.grupo_id || null,
      p_itens: [{ tabela, id: x.id, descricao: desc, vencimento: venc, valor: v, reenvio: true }],
      p_assunto: (tabela === 'parcelas' ? 'Guia atualizada (parcela em atraso)' : 'Boleto atualizado (parcela em atraso)') + ' — ' + (x.quem || ''), p_texto: texto,
      p_docs: [], p_para: cPara.value.trim(), p_arquivos: arq ? [await lerArquivoB64(arq)] : [] }));
    await avisoEnvio('↻ ' + (tabela === 'parcelas' ? 'Guia' : 'Boleto') + ' reenviado. ', r); fecharJanela(j);
    if (depois) await depois(); if (window.ERP_RECARREGAR) window.ERP_RECARREGAR();
  });
  return j;
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
  return venc + 'Processo ' + (x.processo || '—') + ' · ' + parcOrd(x) + ' · ' + (x.devedor || '') + ' × ' + (x.credor || '');
}
// Backup 37: "8ª parcela de 40"; saudação pela hora; acordo pago por PIX ou por boleto (campo "Forma de pagamento" do acordo)
const parcOrd = (x) => { const [n, t] = String(x.parcela || '').split('/'); return (/^\d+$/.test(n || '') ? n + 'ª parcela' : 'Parcela ' + (n || '?')) + (t ? ' de ' + t : ''); };
const saudacaoGuia = () => { const hh = new Date().getHours(); return hh < 12 ? 'Bom dia!' : hh < 18 ? 'Boa tarde!' : 'Boa noite!'; };
const ehPixGuia = (tabela, x) => tabela === 'acordos' && x.forma_pagamento === 'pix';
const fechoGuias = (tabela, itens) => tabela === 'parcelas' ? 'Os arquivos seguem anexos. Depois de pagar, por favor nos envie o comprovante.'
  // Backup 42: acordo sem o pedido de comprovante; PIX sem fecho (não tem arquivo)
  : itens.every((x) => ehPixGuia(tabela, x)) ? ''
  : itens.some((x) => ehPixGuia(tabela, x)) ? 'Os boletos seguem anexos (as parcelas por PIX têm a chave acima).'
  : (itens.length > 1 ? 'Os boletos seguem anexos.' : 'O boleto segue anexo.');
// o texto (e-mail e WhatsApp). Parcelamentos: modelo das antigas Notificações. Acordos (Backup 37): objetivo, como o escritório escreve
function textoGuias(tabela, empresa, itens) {
  const vencida = itens.some((x) => x.vencimento < hojeISO());
  const valorDe = (x) => { const v = x._valor != null ? x._valor : x.valor; return v ? brl(v) : '[preencher]'; };
  const tot = itens.reduce((s2, x) => s2 + (Number(x._valor != null ? x._valor : x.valor) || 0), 0), fecho = fechoGuias(tabela, itens);
  if (tabela === 'parcelas') {
    // Backup 42: o texto das antigas Notificações → Parcelamento, palavra por palavra (o mesmo da Planilha da Rotina)
    const intro = 'Prezados,\n\nSeguem as guias dos parcelamentos da ' + empresa + ' com vencimento neste mês. Antes de pagar, confirme se a guia já não foi paga, para evitar duplicidade.';
    const blocos = itens.map((x) => { const p = x.parcelamentos || {}, [n, tt] = String(x.parcela || '').split('/'), v = x._venc || x.vencimento || '';
      return (x.vencimento < hojeISO() ? '⚠︎ GUIA VENCIDA\n' : '') + 'Parcelamento ' + (p.local || p.natureza || '') + ' — Natureza: ' + (p.natureza || '—') +
        '\nNº do Parcelamento: ' + (p.numero || '—') + '\nParcela: ' + (n || '?') + ' de ' + (tt || p.total_parcelas || '?') + ' | Vencimento: ' + (v ? v.slice(5, 7) + '/' + v.slice(0, 4) : '—') +
        '\nNº da Guia: ' + (n || '—') + '\nValor: ' + valorDe(x); });
    return { intro, fecho, email: intro + '\n\n' + fecho, zap: intro + '\n\n' + blocos.join('\n\n') + (itens.length > 1 ? '\n\n*Total: ' + brl(tot) + '*' : '') + '\n\n' + fecho };
  }
  const soPix = itens.every((x) => ehPixGuia(tabela, x));
  // Backup 41: PIX não tem guia nem boleto — o texto é só "Acordo para pagamento", com processo, partes, vencimento, valor e a chave
  const intro = saudacaoGuia() + (soPix ? '\n\nAcordo para pagamento' + (itens.length > 1 ? 's' : '') + ' — ' + empresa + ':'
    : '\n\nSeguem as parcelas de acordos da ' + empresa + ' com vencimento neste mês ou em atraso.');
  const blocos = itens.map((x) => (x.vencimento < hojeISO() ? '⚠ PARCELA EM ATRASO\n' : '') + '*Acordo para pagamento*\nProcesso: ' + (x.processo || '—') + ' | Parcela: ' + parcOrd(x) +
    '\nPartes: ' + (x.devedor || '—') + ' × ' + (x.credor || '—') + '\nVencimento: ' + dataBR(x._venc || x.vencimento) + '\nValor: ' + valorDe(x) +
    (ehPixGuia(tabela, x) ? '\nPIX: ' + (x.pix || '[chave PIX]') + (x.banco ? '\nBanco: ' + x.banco : '') : ''));
  return { intro, fecho, email: intro + (fecho ? '\n\n' + fecho : ''), zap: intro + '\n\n' + blocos.join('\n\n') + (itens.length > 1 ? '\n\nTotal: ' + brl(tot) : '') + (fecho ? '\n\n' + fecho : '') };
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
  const j = abrirJanela({ titulo: tabela === 'parcelas' ? '✉ Enviar guias por empresa' : '✉ Enviar parcelas de acordo por empresa', larga: true,
    corpo: '<div class="ge"><aside class="ge-emps" id="ge-emps"></aside><section class="ge-msg" id="ge-msg"></section></div>',
    rodape: '<span class="ge-tot" id="ge-tot"></span><div class="acoes ge-acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button>' +
      '<button type="button" class="btn btn-o" id="ge-previa" title="Ver o e-mail exatamente como o cliente vai receber">👁 Prévia do e-mail</button>' +
      '<button type="button" class="btn btn-o" id="ge-copiar" title="Copia o texto para você colar no WhatsApp">📋 Copiar texto</button>' +
      '<button type="button" class="btn btn-v" id="ge-zap">💬 WhatsApp</button><button class="btn btn-p" type="button" id="ge-enviar">✉ Enviar e-mail</button></div>' });
  j.querySelector('.janela').classList.add('ge-janela');
  const $j = (sel) => j.querySelector(sel);
  const pixItem = (i) => ehPixGuia(tabela, i) && i.pix ? { pix: i.pix, banco: i.banco || '' } : {};
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
      '<div class="ge-dest"><label class="campo"><span>✉ E-mail (para)</span><input id="ge-para" type="text" autocomplete="off" placeholder="procurando o e-mail cadastrado…"><small class="sub" id="ge-teste"></small></label>' +
        '<label class="campo"><span>💬 WhatsApp</span><input id="ge-tel" data-mascara="tel" inputmode="tel" value="' + esc(c.telefone || '') + '" placeholder="(37) 9 9999-9999"></label>' +
        '<label class="campo ge-ass"><span>Assunto</span><input id="ge-assunto" value="' + esc((tabela === 'parcelas' ? 'Guias de parcelamento' : e.itens.every((x) => ehPixGuia(tabela, x)) ? 'Parcela de acordo' : 'Boletos de acordo') + ' — ' + e.nome) + '"></label></div>' +
      '<div class="ge-papel"><textarea id="ge-texto" rows="5">' + esc(t.intro) + '</textarea>' +
        '<div class="ge-itens">' + e.itens.map((x) => { const p = x.parcelamentos || {};
          return '<label class="ge-it' + (x.vencimento < hojeISO() ? ' ge-venc' : '') + '" data-ge="' + x.id + '"><input type="checkbox" checked aria-label="Incluir">' +
            '<span class="ge-it-txt">' + (x.vencimento < hojeISO() ? '<span class="ge-alerta">⚠ ' + (tabela === 'parcelas' ? 'GUIA VENCIDA' : 'PARCELA VENCIDA') + '</span>' : '') +
              '<b>' + esc(tabela === 'parcelas' ? 'Parcelamento ' + [p.local, p.natureza].filter(Boolean).join(' — ') : 'Processo ' + (x.processo || '—') + ' · ' + parcOrd(x)) + '</b>' +
              (ehPixGuia(tabela, x) ? ' <span class="ge-forma">PIX</span>' : tabela === 'acordos' ? ' <span class="ge-forma ge-forma-b">boleto</span>' : '') +
              '<span>' + (tabela === 'parcelas' ? (p.numero ? 'Nº do parcelamento: <b>' + esc(p.numero) + '</b> · Parcela <b>' + esc(parcDe(x)) + '</b> · ' : 'Parcela <b>' + esc(parcDe(x)) + '</b> · ') : 'Partes: <b>' + esc(x.devedor || '—') + ' × ' + esc(x.credor || '—') + '</b> · ') +
              'Vencimento <b>' + dataBR(x.vencimento) + '</b>' + (ehPixGuia(tabela, x) ? ' · PIX <b>' + esc(x.pix || '—') + '</b>' : '') + '</span></span>' +
            (tabela === 'parcelas' && x.vencimento < hojeISO() ? '<span class="ge-it-v ge-it-d"><small>Novo vencimento</small><input type="date" class="ge-novo-venc" value="' + fimDoMesGuia(hojeISO()) + '" aria-label="Novo vencimento da guia atualizada"></span>' : '') +
            '<span class="ge-it-v"><small>' + (tabela === 'acordos' ? 'Valor da parcela' : x.vencimento < hojeISO() ? 'Valor atualizado' : 'Valor da guia') + '</small><span class="ge-vbox"><span class="ge-rs">R$</span><input class="ge-valor" data-mascara="nenhuma" inputmode="decimal" value="' + (x.valor ? valorParaCampo(x.valor) : '') + '" placeholder="0,00" aria-label="Valor"></span></span></label>'; }).join('') + '</div>' +
        '<div class="ge-fecho">' + esc(t.fecho) + '</div></div>' +
      '<div class="ge-anexos"' + (e.itens.every((x) => ehPixGuia(tabela, x)) ? ' hidden' : '') + '><label class="ge-drop"><input type="file" id="ge-arqs" accept=".pdf,image/*" multiple hidden><span>📎 <b>Anexar os PDFs</b> ' + (tabela === 'acordos' ? 'dos boletos' : 'das guias') + '</span><small>vão só no e-mail — não ficam guardados no sistema</small></label><div class="ge-chips" id="ge-chips"></div></div>';
    $j('#ge-arqs').onchange = () => { arquivos = arquivos.concat([...$j('#ge-arqs').files]); $j('#ge-arqs').value = ''; pintarChips(); };
    j.querySelectorAll('.ge-it input').forEach((i) => i.addEventListener('input', total));
    j.querySelectorAll('.ge-it input[type=checkbox]').forEach((i) => i.addEventListener('change', total));
    j.querySelectorAll('.ge-valor').forEach((i) => i.addEventListener('blur', () => { const v = lerValor(i.value); i.value = v ? valorParaCampo(v) : ''; total(); }));
    preencherDestino($j('#ge-para'), e.cli, e.grupo, tabela);
    emailDeTeste().then((m) => { const x = $j('#ge-teste'); if (x && m) x.textContent = 'Modo teste: por enquanto todo e-mail chega só em ' + m + '.'; });
    pintarChips(); total();
  };
  const pintarChips = () => { $j('#ge-chips').innerHTML = arquivos.map((f, k) => '<span class="ge-chip">📄 ' + esc(f.name) + ' <small>' + Math.max(1, Math.round(f.size / 1024)) + ' KB</small><button type="button" data-tira="' + k + '" aria-label="Tirar">×</button></span>').join('');
    j.querySelectorAll('[data-tira]').forEach((b) => b.onclick = () => { arquivos.splice(+b.dataset.tira, 1); pintarChips(); }); };
  const marcados = () => [...j.querySelectorAll('.ge-it')].filter((l) => l.querySelector('input[type=checkbox]').checked).map((l) => {
    const x = atual().itens.find((y) => y.id === l.dataset.ge), v = lerValor(l.querySelector('.ge-valor').value);
    const dv = l.querySelector(".ge-novo-venc");   // Backup 34: parcela vencida → reemissão com novo vencimento e valor atualizado
    return Object.assign({}, x, { _valor: isNaN(v) ? 0 : v, _venc: dv ? dv.value : null });
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
  $j('#ge-copiar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const its = marcados(); if (!its.length) throw new Error('Marque ao menos uma parcela.');
    const t = textoGuias(tabela, atual().nome, its), txt = $j('#ge-texto').value.trim() + t.zap.slice(t.intro.length);
    await copiarTexto(txt); aviso('✓ Texto copiado — é só colar no WhatsApp.');
  });
  $j('#ge-previa').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const its = marcados(), e = atual(); if (!its.length) throw new Error('Marque ao menos uma parcela.');
    const html = await q(sb.rpc('previa_guias_email', { p_cliente: e.cli || null,
      p_itens: its.map((i) => Object.assign({ tabela, id: i.id, descricao: descricaoGuia(tabela, i), vencimento: i._venc || i.vencimento, valor: i._valor }, pixItem(i))),
      p_assunto: $j('#ge-assunto').value.trim(), p_texto: $j('#ge-texto').value.trim() + '\n\n' + fechoGuias(tabela, its) }));
    const pj = abrirJanela({ titulo: '👁 ' + ($j('#ge-assunto').value.trim() || 'Prévia do e-mail'), larga: true, corpo: '<iframe class="ge-previa" title="Prévia do e-mail" sandbox></iframe>' });
    pj.querySelector('.ge-previa').srcdoc = html;
  });
  $j('#ge-enviar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const its = marcados(), e = atual(); if (!its.length) throw new Error('Marque ao menos uma parcela.');
    if (!$j('#ge-para').value.trim()) throw new Error('Digite o e-mail do cliente no campo "Para".');
    if (its.some((i) => !(i._valor > 0))) throw new Error('Confira o valor de todas as parcelas marcadas.');
    if (its.some((i) => i._venc !== null && i._venc !== undefined && (!i._venc || i._venc < hojeISO()))) throw new Error('Confira o novo vencimento da guia atualizada (hoje ou depois).');
    if (arquivos.reduce((s2, f) => s2 + f.size, 0) > LIMITE_ANEXOS) throw new Error('Os PDFs somam mais de 15 MB: envie em dois e-mails.');
    const arqs = []; for (const f of arquivos) arqs.push(await lerArquivoB64(f));
    const r = await q(sb.rpc('enviar_guias_email', { p_cliente: e.cli || null, p_grupo: e.grupo || null,
      p_itens: its.map((i) => Object.assign(i._venc
        ? { tabela, id: i.id, descricao: descricaoGuia(tabela, i).replace(/^⚠ VENCIDA — /, '↻ Guia atualizada — ') + ' (vencia em ' + dataBR(i.vencimento) + ')', vencimento: i._venc, valor: i._valor, reenvio: true }
        : { tabela, id: i.id, descricao: descricaoGuia(tabela, i), vencimento: i.vencimento, valor: i._valor }, pixItem(i))),
      p_assunto: $j('#ge-assunto').value.trim(), p_texto: $j('#ge-texto').value.trim() + '\n\n' + fechoGuias(tabela, its), p_docs: its.map((i) => i.guia_doc).filter(Boolean),
      p_para: $j('#ge-para').value.trim() || null, p_arquivos: arqs }));
    await avisoEnvio(plural(r.itens, 'parcela', 'parcelas') + (r.anexos ? ' e ' + plural(r.anexos, 'anexo', 'anexos') : '') + ': ', r);
    fecharJanela(j); if (depois) await depois(); if (window.ERP_RECARREGAR) window.ERP_RECARREGAR();
  });
  return j;
}
// Backup 35: Acordos → aba "A pagar": marcar as parcelas e "✉ Enviar por empresa" (mesma janela/e-mail das guias)
async function enviarAcordosSelecionados(ids, depois) {
  if (!ids || !ids.length) return aviso('Marque ao menos uma parcela.', true);
  if (!E.clientes.length) await carregarCadastros();
  const L = (await q(sb.from('acordos').select('id, parcela, total_parcelas, vencimento, valor, pago, emissao, emitida_em, emitida_por, guia_doc, devedor, credor, processo, grupo_id, pix, banco, forma_pagamento').in('id', ids)))
    .filter((x) => !x.pago)
    .map((x) => Object.assign(x, { quem: x.devedor, detalhe: 'deve a ' + (x.credor || '—') + (x.processo ? ' · ' + x.processo : ''), email_em: null,
      parcela: (x.parcela || '?') + (x.total_parcelas ? '/' + x.total_parcelas : ''), valor: Number(x.valor) || 0,
      cliente_id: (E.clientes.find((c) => c.grupo_id === x.grupo_id && primeiroNome(c.nome) === primeiroNome(x.devedor)) || {}).id || null }));
  return janelaGuiasEmpresa('acordos', L, null, depois);
}

// ═══ Backup 37: "🧾 Gerar guias" — abre o envio por empresa (a tela que expande com vencimento e valor atualizado) já com as parcelas a emitir:
// em atraso + as que vencem neste mês. alcance: {} = tudo · {grupo_id} · {empresa} · {itens: ids de parcelamento ou chaves de acordo}.
// proximas: true → se o parcelamento/acordo não tem nada a emitir agora, entra a PRÓXIMA parcela (mesmo futura).
const chaveAcordoGuia = (a) => [a.grupo_id || '', a.devedor || '', a.credor || '', a.processo || ''].join('|');
async function gerarGuias(tabela, alcance, depois) {
  alcance = alcance || {};
  if (!E.clientes.length) await carregarCadastros();
  const h = hojeISO(), fim = fimDoMesGuia(h), parc = tabela === 'parcelas';
  const cliDe = (doc, nome, grp) => (E.clientes.find((c) => (soDigitos(doc) && soDigitos(c.cpf_cnpj) === soDigitos(doc)) || (grp ? c.grupo_id === grp && primeiroNome(c.nome) === primeiroNome(nome) : c.nome === nome)) || {}).id || null;
  let base;
  if (parc) {
    base = (await buscarTodos(() => { let c = sb.from('parcelas').select('id, parcelamento_id, numero, vencimento, pago, emissao, emitida_em, guia_doc, valor, parcelamentos!inner(id, empresa, natureza, local, numero, total_parcelas, valor_ultima_parcela, grupo_id, cnpj, emitimos_guia)').eq('pago', false);
      if (alcance.grupo_id) c = c.eq('parcelamentos.grupo_id', alcance.grupo_id);
      if (alcance.empresa) c = c.eq('parcelamentos.empresa', alcance.empresa);
      if (alcance.itens) c = c.in('parcelamento_id', alcance.itens);
      if (alcance.ids) c = c.in('id', alcance.ids);
      return c.order('vencimento').order('id'); })).filter((x) => x.parcelamentos && (alcance.ids || x.parcelamentos.emitimos_guia !== false));
    base.forEach((x) => { const p = x.parcelamentos;
      Object.assign(x, { _k: p.id, quem: p.empresa, grupo_id: p.grupo_id, email_em: null, parcela: (x.numero || '?') + (p.total_parcelas ? '/' + p.total_parcelas : ''),
        valor: Number(x.valor) > 0 ? Number(x.valor) : Number(p.valor_ultima_parcela) || 0, detalhe: [p.natureza, p.local].filter(Boolean).join(' · '), cliente_id: cliDe(p.cnpj, p.empresa) }); });
  } else {
    base = (await buscarTodos(() => { let c = sb.from('acordos').select('id, parcela, total_parcelas, vencimento, valor, pago, emissao, emitida_em, emitida_por, guia_doc, devedor, credor, processo, grupo_id, pix, banco, forma_pagamento').eq('pago', false);
      if (alcance.grupo_id) c = c.eq('grupo_id', alcance.grupo_id);
      if (alcance.empresa) c = c.eq('devedor', alcance.empresa);
      return c.order('vencimento').order('id'); }));
    if (alcance.itens) base = base.filter((a) => alcance.itens.includes(chaveAcordoGuia(a)) || alcance.itens.includes([a.processo || '', a.devedor || '', a.credor || ''].join('|')));
    base.forEach((x) => Object.assign(x, { _k: chaveAcordoGuia(x), quem: x.devedor, email_em: null, detalhe: 'deve a ' + (x.credor || '—') + (x.processo ? ' · ' + x.processo : ''),
      parcela: (x.parcela || '?') + (x.total_parcelas ? '/' + x.total_parcelas : ''), valor: Number(x.valor) || 0, cliente_id: cliDe('', x.devedor, x.grupo_id) }));
  }
  let L = alcance.ids ? base : base.filter((x) => x.vencimento && x.vencimento <= fim);   // parcelas escolhidas: vale até a futura
  if (alcance.proximas) { const tem = new Set(L.map((x) => x._k)), prox = {};
    base.forEach((x) => { if (!tem.has(x._k) && !prox[x._k]) prox[x._k] = x; });
    L = L.concat(Object.values(prox)); }
  if (!L.length) {
    if (base.length && !alcance.proximas && confirm('Nada em atraso nem vencendo neste mês.\n\nEmitir a PRÓXIMA parcela ' + (parc ? 'de cada parcelamento' : 'de cada acordo') + ' deste recorte?'))
      return gerarGuias(tabela, Object.assign({}, alcance, { proximas: true }), depois);
    return aviso(base.length ? 'Nenhuma guia escolhida.' : 'Nenhuma parcela em aberto neste recorte' + (parc ? ' (que o escritório emita).' : '.'), !base.length);
  }
  return janelaGuiasEmpresa(tabela, L, null, depois);
}
