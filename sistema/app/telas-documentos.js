'use strict';
// ═══════════════════════════════════════════════════════════════════
// Documentos — arquivos guardados no Storage privado do Supabase
// (bucket "documentos"). Abrir gera um link temporário (5 minutos).
// Usado na tela Documentos, na ficha do cliente, no contrato e no lançamento.
// ═══════════════════════════════════════════════════════════════════
const TIPOS_DOC = [['contrato', 'Contrato'], ['procuracao', 'Procuração'], ['proposta', 'Proposta'], ['pessoal', 'Documento pessoal'],
  ['societario', 'Societário'], ['certidao', 'Certidão'], ['guia', 'Guia / boleto'], ['comprovante', 'Comprovante de pagamento'],
  ['peticao', 'Petição / peça'], ['outro', 'Outro']];
const nomeTipoDoc = (t) => (TIPOS_DOC.find((x) => x[0] === t) || [t, t])[1];
const LIMITE_MB = 20;
const BUCKET = 'documentos';

function tamanhoLegivel(n) {
  if (!n) return '—';
  if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + ' KB';
  return (n / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' MB';
}
function nomeSeguro(nome) {
  return String(nome || 'arquivo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
}
function selo_validade(v) {
  if (!v) return '';
  const d = Math.round((new Date(v + 'T12:00:00') - new Date(hojeISO() + 'T12:00:00')) / 86400000);
  if (d < 0) return ' <span class="pill vencido">vencido</span>';
  if (d <= 15) return ' <span class="pill hoje">vence em ' + d + ' dia(s)</span>';
  return ' <span class="pill neutro">até ' + dataBR(v) + '</span>';
}

// Envia um arquivo e cria o registro. vinculo: { cliente_id, grupo_id, contrato_id, lancamento_id, processo_id, tarefa_id, tipo }
async function enviarDocumento(arquivo, vinculo, extra) {
  if (arquivo.size > LIMITE_MB * 1024 * 1024) throw new Error('Arquivo maior que ' + LIMITE_MB + ' MB: ' + arquivo.name);
  const pasta = (vinculo.cliente_id || vinculo.grupo_id || 'geral') + '/' + hojeISO().slice(0, 7);
  const caminho = pasta + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + '-' + nomeSeguro(arquivo.name);
  const up = await sb.storage.from(BUCKET).upload(caminho, arquivo, { contentType: arquivo.type || 'application/octet-stream', upsert: false });
  if (up.error) throw new Error('Não consegui enviar o arquivo: ' + (up.error.message || up.error));
  const dados = Object.assign({ tipo: 'outro' }, vinculo, extra || {}, { nome: (extra && extra.nome) || arquivo.name, caminho, tamanho: arquivo.size, mime: arquivo.type || '' });
  Object.keys(dados).forEach((k) => { if (dados[k] === undefined || dados[k] === '') delete dados[k]; });
  dados.nome = dados.nome || arquivo.name;
  return q(sb.from('documentos').insert(dados).select().single());
}

async function abrirDocumento(doc) {
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(doc.caminho, 300);
  if (error || !data) throw new Error('Não consegui abrir o arquivo agora. Tente de novo em instantes.');
  const url = data.signedUrl || data.signedURL;
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  document.body.appendChild(a); a.click(); a.remove();
}

// Janela de envio (arrastar ou escolher), já com o vínculo preenchido
function janelaEnviarDocumento(vinculo, depois, titulo) {
  const j = abrirJanela({
    titulo: titulo || 'Enviar documento', larga: true,
    corpo: '<form id="f-doc" class="grade">' +
      '<div class="inteiro solta-arq" id="doc-solta"><b>Arraste os arquivos aqui</b> ou <label class="btn btn-o btn-mini" style="cursor:pointer">escolha<input type="file" id="doc-arq" multiple hidden></label>' +
      '<div class="sub" id="doc-lista">PDF, imagens, Word ou Excel · até ' + LIMITE_MB + ' MB cada</div></div>' +
      campo('Tipo', '<select name="tipo">' + TIPOS_DOC.map(([v, r]) => '<option value="' + v + '"' + ((vinculo.tipo || 'outro') === v ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>') +
      campo('Validade (se houver)', '<input name="validade" type="date">') +
      (vinculo.cliente_id || vinculo.contrato_id || vinculo.lancamento_id ? '' : campo('Cliente', '<select name="cliente_id">' + opcoesClientes('') + '</select>', 'inteiro')) +
      campo('Etiquetas', '<input name="etiquetas" placeholder="ex.: 2026, original assinado">') +
      campo('Observação', '<textarea name="obs" maxlength="1000"></textarea>', 'inteiro') + '</form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-enviar-doc">Enviar</button></div>'
  });
  let arquivos = [];
  const f = j.querySelector('#f-doc'), lista = j.querySelector('#doc-lista'), solta = j.querySelector('#doc-solta');
  const mostrar = () => { lista.textContent = arquivos.length ? arquivos.map((a) => a.name + ' (' + tamanhoLegivel(a.size) + ')').join(' · ') : 'Nenhum arquivo escolhido'; };
  j.querySelector('#doc-arq').onchange = (ev) => { arquivos = Array.from(ev.target.files); mostrar(); };
  ['dragenter', 'dragover'].forEach((e) => solta.addEventListener(e, (ev) => { ev.preventDefault(); solta.classList.add('sobre'); }));
  ['dragleave', 'drop'].forEach((e) => solta.addEventListener(e, (ev) => { ev.preventDefault(); solta.classList.remove('sobre'); }));
  solta.addEventListener('drop', (ev) => { arquivos = Array.from(ev.dataTransfer.files || []); mostrar(); });
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-enviar-doc').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!arquivos.length) throw new Error('Escolha pelo menos um arquivo.');
    const extra = { tipo: f.tipo.value, validade: f.validade.value || null, etiquetas: f.etiquetas.value.trim(), obs: f.obs.value.trim() };
    const vinc = Object.assign({}, vinculo);
    if (f.cliente_id && f.cliente_id.value) vinc.cliente_id = f.cliente_id.value;
    if (vinc.cliente_id && !vinc.grupo_id) { const c = E.clientes.find((x) => x.id === vinc.cliente_id); if (c) vinc.grupo_id = c.grupo_id; }
    for (const a of arquivos) await enviarDocumento(a, vinc, extra);
    aviso('✓ ' + arquivos.length + ' documento(s) enviado(s).'); fecharJanela(j); if (depois) await depois();
  });
  return j;
}

// Nova versão de um documento: guarda o novo arquivo e arquiva o anterior
function janelaNovaVersao(doc, depois) {
  const j = abrirJanela({ titulo: 'Nova versão — ' + doc.nome,
    corpo: '<p class="sub" style="margin-bottom:10px">A versão atual (v' + doc.versao + ') fica guardada no histórico do documento.</p><input type="file" id="nv-arq">',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-nv">Enviar nova versão</button></div>' });
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-nv').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const a = j.querySelector('#nv-arq').files[0];
    if (!a) throw new Error('Escolha o arquivo.');
    const campos = ['cliente_id', 'grupo_id', 'contrato_id', 'lancamento_id', 'processo_id', 'tarefa_id', 'tipo', 'validade', 'etiquetas', 'obs', 'liberado_cliente'];
    const vinc = {}; campos.forEach((k) => { if (doc[k] != null) vinc[k] = doc[k]; });
    await enviarDocumento(a, vinc, { nome: doc.nome, versao: (doc.versao || 1) + 1, documento_pai_id: doc.documento_pai_id || doc.id });
    await q(sb.from('documentos').update({ arquivado: true }).eq('id', doc.id));
    aviso('✓ Nova versão enviada.'); fecharJanela(j); if (depois) await depois();
  });
}

// Tabela de documentos (usada na tela, na ficha, no contrato e no lançamento)
function tabelaDocumentos(docs, opc) {
  opc = opc || {};
  if (!docs.length) return vazio(opc.vazio || 'Nenhum documento aqui — guarde contratos, procurações e certidões com acesso restrito.', '+ Enviar documento', '[data-enviar-doc], #doc-novo');
  return '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Documento</th><th>Tipo</th>' + (opc.semCliente ? '' : '<th>Cliente</th>') +
    '<th data-tipo="data">Enviado</th><th>Validade</th><th class="sem-ordem"></th></tr></thead><tbody>' +
    docs.map((d) => {
      const cli = d.cliente_id ? (E.clientes.find((c) => c.id === d.cliente_id) || {}).nome : '';
      return '<tr><td><b>' + esc(d.nome) + '</b>' + (d.versao > 1 ? ' <span class="pill neutro">v' + d.versao + '</span>' : '') +
        '<div class="sub">' + tamanhoLegivel(d.tamanho) + (d.etiquetas ? ' · ' + esc(d.etiquetas) : '') + (d.obs ? ' · ' + esc(d.obs) : '') + '</div></td>' +
        '<td>' + esc(nomeTipoDoc(d.tipo)) + '</td>' + (opc.semCliente ? '' : '<td>' + esc(cli || (d.grupo_id ? nomeGrupo(d.grupo_id) : '—')) + '</td>') +
        '<td class="mono" data-ord="' + d.criado_em + '">' + dataBR(d.criado_em) + '</td><td>' + (d.validade ? selo_validade(d.validade) : '<span class="sub">—</span>') + '</td>' +
        '<td class="acoes-l"><button class="btn btn-p btn-mini" data-abrir-doc="' + d.id + '">Abrir</button> ' +
        '<button class="btn btn-o btn-mini" data-versao-doc="' + d.id + '" title="Enviar nova versão">↑ Versão</button> ' +
        '<button class="btn btn-o btn-mini" data-arquivar-doc="' + d.id + '" title="Tirar da lista (continua guardado)">Arquivar</button></td></tr>';
    }).join('') + '</tbody></table></div>';
}
function ligarDocumentos(raiz, docs, depois) {
  raiz.querySelectorAll('[data-abrir-doc]').forEach((b) => b.onclick = () => comBotao(b, () => abrirDocumento(docs.find((d) => d.id === b.dataset.abrirDoc))));
  raiz.querySelectorAll('[data-versao-doc]').forEach((b) => b.onclick = () => janelaNovaVersao(docs.find((d) => d.id === b.dataset.versaoDoc), depois));
  raiz.querySelectorAll('[data-arquivar-doc]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    if (!confirm('Arquivar este documento? Ele sai da lista, mas continua guardado.')) return;
    await q(sb.from('documentos').update({ arquivado: true }).eq('id', b.dataset.arquivarDoc));
    aviso('✓ Documento arquivado.'); if (depois) await depois();
  }));
}
// Bloco pronto: título + botão Enviar + tabela, para um vínculo (cliente, contrato, lançamento…)
async function blocoDocumentos(alvo, vinculo, opc) {
  opc = opc || {};
  let c = sb.from('documentos').select('*').eq('arquivado', false).order('criado_em', { ascending: false });
  // filtra pelo vínculo mais específico (o contrato, o lançamento… ou o cliente)
  const chave = ['oportunidade_id', 'contrato_id', 'lancamento_id', 'tarefa_id', 'processo_id', 'cliente_id', 'grupo_id'].find((k) => vinculo[k]);
  if (!chave) throw new Error('Documento sem vínculo.');
  c = c.eq(chave, vinculo[chave]);
  const docs = await q(c);
  alvo.innerHTML = '<div class="titulo-pag" style="margin-bottom:8px"><div><b>' + (opc.titulo || 'Documentos') + '</b> <span class="sub">' + docs.length + '</span></div>' +
    '<div class="acoes"><button class="btn btn-o btn-mini" data-enviar-doc>+ Enviar documento</button></div></div>' + tabelaDocumentos(docs, { semCliente: !!vinculo.cliente_id, vazio: opc.vazio });
  const repinta = () => blocoDocumentos(alvo, vinculo, opc);
  alvo.querySelector('[data-enviar-doc]').onclick = () => janelaEnviarDocumento(vinculo, repinta);
  ligarDocumentos(alvo, docs, repinta);
  return docs;
}

// ─────────────────────────── tela Documentos ───────────────────────────
TELAS.documentos = async function () {
  E.docs = E.docs || { tipo: '', cliente: '', grupo: '', busca: '', situacao: 'ativos' };
  const F = E.docs;
  await carregarCadastros();
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Documentos</h1><p>Contratos, procurações, certidões, comprovantes e demais arquivos — guardados com acesso restrito</p></div>' +
    '<div class="acoes"><button class="btn btn-o" id="doc-ger">📄 Gerar documento</button><button class="btn btn-p" id="doc-novo">+ Enviar documento</button></div></div>' +
    '<div class="filtros">' +
    '<div class="segmento" id="doc-sit">' + [['ativos', 'Ativos'], ['vencendo', 'Vencendo / vencidos'], ['arquivados', 'Arquivados']].map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<select class="busca sel" id="doc-tipo"><option value="">Todos os tipos</option>' + TIPOS_DOC.map(([v, r]) => '<option value="' + v + '">' + r + '</option>').join('') + '</select>' +
    '<select class="busca sel" id="doc-grupo"><option value="">Todos os grupos</option>' + (E.grupos || []).map((g) => '<option value="' + g.id + '">' + esc(g.nome) + '</option>').join('') + '</select>' +
    '<select class="busca sel" id="doc-cli"><option value="">Todos os clientes</option>' + E.clientes.map((c) => '<option value="' + c.id + '">' + esc(c.nome) + '</option>').join('') + '</select>' +
    '<input class="busca" id="doc-busca" placeholder="Buscar nome, etiqueta ou observação" autocomplete="off"></div>' +
    '<div class="doc-chips" id="doc-chips"></div><div id="doc-corpo"><div class="carregando">Carregando…</div></div>';
  $('doc-tipo').value = F.tipo; $('doc-cli').value = F.cliente; $('doc-grupo').value = F.grupo || ''; $('doc-busca').value = F.busca;
  $('doc-novo').onclick = () => janelaEnviarDocumento({}, () => TELAS.documentos());
  $('doc-ger').onclick = () => janelaGeradores($('doc-cli').value || '');
  $('doc-sit').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.situacao = b.dataset.v; pintarDocumentos(); } };
  $('doc-tipo').onchange = (ev) => { F.tipo = ev.target.value; pintarDocumentos(); };
  $('doc-cli').onchange = (ev) => { F.cliente = ev.target.value; pintarDocumentos(false); };
  $('doc-grupo').onchange = (ev) => { F.grupo = ev.target.value; pintarDocumentos(false); };
  $('doc-chips').onclick = (ev) => { const b = ev.target.closest('[data-tipo]'); if (!b) return; F.tipo = F.tipo === b.dataset.tipo ? '' : b.dataset.tipo; $('doc-tipo').value = F.tipo; pintarDocumentos(false); };
  let t; $('doc-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; pintarDocumentos(false); }, 250); };
  await pintarDocumentos();
};
let _docsTela = [];
async function pintarDocumentos(buscar) {
  const F = E.docs;
  document.querySelectorAll('#doc-sit button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === F.situacao));
  if (buscar !== false) _docsTela = await buscarTodos(() => sb.from('documentos').select('*').order('criado_em', { ascending: false }));
  const b = normalizar(F.busca), lim = somarDias(hojeISO(), 15);
  // grupo: o do documento ou o do cliente vinculado
  const grupoDe = (d) => d.grupo_id || ((E.clientes.find((c) => c.id === d.cliente_id) || {}).grupo_id) || '';
  const base = _docsTela.filter((d) => (F.situacao === 'arquivados' ? d.arquivado : !d.arquivado)
    && (F.situacao !== 'vencendo' || (d.validade && d.validade <= lim))
    && (!F.cliente || d.cliente_id === F.cliente) && (!F.grupo || grupoDe(d) === F.grupo)
    && (!b || normalizar(d.nome + ' ' + d.etiquetas + ' ' + d.obs).includes(b)));
  const lista = base.filter((d) => !F.tipo || d.tipo === F.tipo);
  // atalhos por tipo (Procuração, Contrato…) com a quantidade no recorte atual
  const cont = {}; base.forEach((d) => { cont[d.tipo] = (cont[d.tipo] || 0) + 1; });
  $('doc-chips').innerHTML = TIPOS_DOC.filter(([v]) => cont[v] || v === F.tipo || v === 'procuracao' || v === 'contrato')
    .map(([v, r]) => '<button class="chip' + (F.tipo === v ? ' ativo' : '') + '" data-tipo="' + v + '">' + r + ' <span class="sub">' + (cont[v] || 0) + '</span></button>').join('');
  // Backup 28: separados por grupo, como pastas (clique no grupo para abrir/fechar); com um grupo escolhido, só ele e aberto
  const nomeG = (id) => (E.grupos.find((g) => g.id === id) || {}).nome || 'Sem grupo';
  const G = {}; lista.forEach((d) => { const k = grupoDe(d); (G[k] = G[k] || []).push(d); });
  const ks = Object.keys(G).sort((a, b2) => (a ? 0 : 1) - (b2 ? 0 : 1) || nomeG(a).localeCompare(nomeG(b2), 'pt-BR'));
  F.abertos = F.abertos || {};
  const aberto = (k) => ks.length === 1 || !!F.grupo || !!b || !!F.abertos[k];
  $('doc-corpo').innerHTML = lista.length ? '<div class="doc-pastas">' + ks.map((k) => '<details class="card doc-pasta" data-pasta="' + esc(k) + '"' + (aberto(k) ? ' open' : '') + '><summary><span class="doc-pasta-ic" aria-hidden="true">📁</span><b>' + esc(nomeG(k)) + '</b>' +
      '<span class="sub">' + plural(G[k].length, 'documento', 'documentos') + (G[k].some((d) => d.validade && d.validade <= lim) ? ' · <span class="pill vencido">vencendo</span>' : '') + '</span></summary>' +
      (aberto(k) ? tabelaDocumentos(G[k], { vazio: '' }) : '') + '</details>').join('') + '</div>'
    : '<div class="card">' + tabelaDocumentos([], { vazio: 'Nenhum documento neste recorte.' }) + '</div>';
  // a tabela só é montada quando a pasta abre (pasta fechada não carrega nada)
  $('doc-corpo').querySelectorAll('details[data-pasta]').forEach((d) => d.addEventListener('toggle', () => { const k = d.dataset.pasta; if (d.open === aberto(k)) return; F.abertos[k] = d.open; pintarDocumentos(false); }));
  ligarDocumentos($('doc-corpo'), lista, () => pintarDocumentos());
}

// ─────────── Geradores de documentos (Backup 16) ───────────
// Backup 32: a Central de Documentos (documentos/) substitui o gerador antigo de contrato e procuração.
// Os outros geradores (petição, solicitação, proposta, e-mails) continuam como antes, mais abaixo na janela.
const MODELOS_CENTRAL = [['procuracao', '📜 Procuração', 'ad judicia et extra, com a finalidade em destaque'], ['substabelecimento', '🔁 Substabelecimento', 'com ou sem reserva'],
  ['contrato', '🤝 Contrato de honorários', 'fixo, parcelado, salário mínimo, mensal e êxito'], ['recibo', '🧾 Recibo', 'numerado, com valor por extenso'],
  ['declaracao', '✍️ Declaração', 'hipossuficiência, residência ou texto livre'], ['acordo', '⚖️ Acordo entre partes', 'quitação de dívida, com ou sem processo']];
const GERADORES_DOC = [['peticao.html', '⚖ Petição', 'inicial, contestação, manifestação, embargos, exceção — com cliente e processo'],
  ['solicitacao-documentos.html', '📋 Solicitação de Documentos', 'lista do que o cliente precisa enviar'],
  ['propostas.html', '💼 Proposta (apresentação)', 'proposta comercial em páginas, com a marca'],
  ['modelos-email.html', '✉ Modelos de E-mail (implantação)', 'e-mails do processo de implantação, enviados pelo ERP']];
const urlCentral = (modelo, clienteId) => 'documentos/index.html' + (modelo ? '?modelo=' + modelo + (clienteId ? '&cliente=' + encodeURIComponent(clienteId) : '') : '');
// Backup 34: a Central abre DENTRO do ERP (Documentos → Gerar documento). Ctrl/⌘ + clique (ou botão do meio) abre numa aba nova.
const abaNova = (ev) => !!ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button === 1);
let _centralUrl = 'documentos/index.html';
function abrirCentral(url, ev) {
  url = url || 'documentos/index.html';
  if (abaNova(ev)) { window.open(url, '_blank', 'noopener'); return; }
  _centralUrl = url;
  const jn = $('janelas'); if (jn) [...jn.children].forEach((f) => fecharJanela(f));   // sai das janelas abertas (ficha, lançamento…) e vai para a Central
  if (typeof window.nav === 'function' && document.getElementById('panel-gerador')) window.nav(null, 'gerador');
  else if (typeof TELAS.gerador === 'function' && $('conteudo')) TELAS.gerador();
  else window.open(url, '_blank', 'noopener');
}
TELAS.gerador = async function () {
  const url = _centralUrl + (_centralUrl.includes('?') ? '&' : '?') + 'embutido=1';
  $('conteudo').innerHTML = '<div class="doc-central-topo"><span class="sub">Central de Documentos — procuração, substabelecimento, contrato, recibo, declaração e acordo</span>' +
    '<a class="btn btn-o btn-mini" href="' + esc(_centralUrl) + '" target="_blank" rel="noopener" title="Abrir numa aba nova (ou Ctrl + clique em qualquer link de documento)">Abrir em nova aba ↗</a></div>' +
    '<iframe class="doc-central" id="doc-central" title="Central de Documentos" src="' + esc(url) + '"></iframe>';
  _centralUrl = 'documentos/index.html';   // da próxima vez (pelo menu), abre a Central limpa
};
// links para a Central (recibo do Financeiro, janelas…): clique comum abre dentro do ERP; Ctrl/⌘/meio abre aba nova (padrão do navegador)
document.addEventListener('click', (ev) => {
  const a = ev.target.closest && ev.target.closest('a[href^="documentos/index.html"]');
  if (!a || abaNova(ev) || a.closest('.doc-central-topo')) return;
  ev.preventDefault(); abrirCentral(a.getAttribute('href'), ev);
});
function janelaGeradores(clienteId) {
  const j = abrirJanela({ titulo: '📄 Documentos', larga: true,
    corpo: '<p class="sub" style="margin-bottom:10px">Abre a <b>Central de Documentos</b> aqui no ERP' + (clienteId ? ', já com este cliente' : '') + ' (<b>Ctrl + clique</b> abre numa aba nova). Lá você preenche, vê a folha pronta, salva (fica no histórico) e baixa em <b>PDF</b> ou <b>Word</b>.</p>' +
      '<div class="lista-ficha">' + MODELOS_CENTRAL.map(([m, rot, d]) => '<a class="item-ficha clicavel ger-link" href="' + urlCentral(m, clienteId) + '">' +
        '<div><b>' + rot + '</b><div class="sub">' + d + '</div></div><span class="sub">abrir ›</span></a>').join('') +
        '<a class="item-ficha clicavel ger-link" href="documentos/index.html"><div><b>🗂 Histórico de documentos</b><div class="sub">tudo o que já foi gerado e salvo</div></div><span class="sub">abrir ›</span></a></div>' +
      '<div class="gx-det-tit" style="margin-top:14px">Outros geradores</div><div class="lista-ficha">' + GERADORES_DOC.map(([arq, rot, d]) => '<a class="item-ficha clicavel ger-link" target="_blank" rel="noopener" href="geradores/' + arq + (clienteId ? '?cliente=' + encodeURIComponent(clienteId) : '') + '">' +
        '<div><b>' + rot + '</b><div class="sub">' + d + '</div></div><span class="sub">abrir ↗</span></a>').join('') + '</div>' });
  return j;
}
// Backup 26: gerador de contrato já com o cliente e os valores do contrato (o documento fica ligado ao contrato)
function abrirGeradorContrato(clienteId, contratoId, ev) {
  abrirCentral('documentos/index.html?modelo=contrato' + (clienteId ? '&cliente=' + encodeURIComponent(clienteId) : '') + (contratoId ? '&contrato=' + encodeURIComponent(contratoId) : ''), ev);
}
