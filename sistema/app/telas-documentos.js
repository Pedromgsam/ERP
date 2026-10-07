'use strict';
// ═══════════════════════════════════════════════════════════════════
// Documentos — arquivos guardados no Storage privado do Supabase
// (bucket "documentos"). Abrir gera um link temporário (5 minutos).
// Usado na tela Documentos, na ficha do cliente, no contrato e no lançamento.
// ═══════════════════════════════════════════════════════════════════
const TIPOS_DOC = [['contrato', 'Contrato'], ['procuracao', 'Procuração'], ['proposta', 'Proposta'], ['pessoal', 'Documento pessoal'],
  ['societario', 'Societário'], ['certidao', 'Certidão'], ['guia', 'Guia / boleto'], ['comprovante', 'Comprovante de pagamento'],
  ['peticao', 'Petição / peça'], ['certificado', 'Certificado digital'], ['outro', 'Outro']];
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

// Janela de envio (arrastar ou escolher), já com o vínculo preenchido.
// Backup 40: o tipo é escolhido em botões; "Certificado digital" pede a senha, o sistema lê o arquivo e mostra a validade
// (e guarda senha + validade na ficha do certificado da empresa). Não existe mais o botão "Certificado" separado.
function janelaEnviarDocumento(vinculo, depois, titulo) {
  const tipo0 = vinculo.tipo || 'outro';
  const empresas = vinculo.grupo_id ? E.clientes.filter((c) => c.grupo_id === vinculo.grupo_id) : E.clientes;
  const j = abrirJanela({
    titulo: titulo || 'Enviar documento', larga: true,
    corpo: '<form id="f-doc" class="grade doc-envio" data-tipo="' + tipo0 + '" autocomplete="off">' +
      // Backup 41: o tipo voltou a ser uma lista suspensa
      campo('Tipo de documento', '<select name="tipo" id="doc-tipo-sel">' + TIPOS_DOC.map(([v, r]) => '<option value="' + v + '"' + (v === tipo0 ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>', 'inteiro') +
      '<div class="inteiro solta-arq" id="doc-solta"><b>Arraste os arquivos aqui</b> ou <label class="btn btn-o btn-mini" style="cursor:pointer">escolha<input type="file" id="doc-arq" multiple hidden></label>' +
      '<div class="sub" id="doc-lista">PDF, imagens, Word ou Excel · até ' + LIMITE_MB + ' MB cada</div></div>' +
      (vinculo.cliente_id || vinculo.contrato_id || vinculo.lancamento_id ? '' : campo(vinculo.grupo_id ? 'Empresa do grupo' : 'Cliente', '<select name="cliente_id">' +
        (vinculo.grupo_id ? '<option value="">— o grupo todo —</option>' + empresas.map((c) => '<option value="' + c.id + '"' + (c.id === vinculo.empresa_id ? ' selected' : '') + '>' + esc(c.nome) + '</option>').join('') : opcoesClientes(vinculo.empresa_id || '')) + '</select>', 'inteiro')) +
      '<label class="campo doc-so-cert"><span>Senha do certificado</span><span class="cert-senha"><input name="senha" type="password" autocomplete="new-password" placeholder="a senha do arquivo .pfx/.p12"><button type="button" class="btn btn-o btn-mini" id="cert-ver" aria-label="Mostrar a senha">👁</button></span></label>' +
      campo('Validade (se houver)', '<input name="validade" type="date">') +
      '<div class="inteiro cert-lido doc-so-cert" id="cert-lido"></div>' +
      campo('Etiquetas', '<input name="etiquetas" placeholder="ex.: 2026, original assinado">') +
      campo('Observação', '<textarea name="obs" maxlength="1000"></textarea>', 'inteiro') + '</form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-enviar-doc">Enviar</button></div>'
  });
  let arquivos = [], info = null, tipo = tipo0;
  const f = j.querySelector('#f-doc'), lista = j.querySelector('#doc-lista'), solta = j.querySelector('#doc-solta'), lido = j.querySelector('#cert-lido');
  const ehCert = () => tipo === 'certificado';
  const tentarLer = async () => { info = null; lido.innerHTML = ''; lido.className = 'inteiro cert-lido doc-so-cert';
    if (!ehCert() || !arquivos.length) return;
    if (!f.senha.value) { lido.innerHTML = '<span class="sub">Digite a senha: o sistema lê o arquivo e mostra a validade.</span>'; return; }
    try { info = await lerCertificado(arquivos[0], f.senha.value); f.validade.value = info.validade;
      lido.innerHTML = '✓ Certificado lido: <b>' + esc(info.titular || '—') + '</b> · válido de ' + dataBR(info.inicio) + ' até <b>' + dataBR(info.validade) + '</b>' + selo_validade(info.validade) + (info.emissor ? '<div class="sub">emitido por ' + esc(info.emissor) + '</div>' : '');
      lido.className = 'inteiro cert-lido doc-so-cert cert-ok'; }
    catch (e) { lido.innerHTML = '⚠ ' + esc(e.message); lido.className = 'inteiro cert-lido doc-so-cert cert-erro'; } };
  const mostrar = () => { lista.textContent = arquivos.length ? arquivos.map((a) => a.name + ' (' + tamanhoLegivel(a.size) + ')').join(' · ') : 'Nenhum arquivo escolhido'; tentarLer(); };
  const porTipo = (v) => { tipo = v; f.dataset.tipo = v; if (f.tipo.value !== v) f.tipo.value = v; tentarLer(); };
  f.tipo.onchange = () => porTipo(f.tipo.value);
  let tl; f.senha.addEventListener('input', () => { clearTimeout(tl); tl = setTimeout(tentarLer, 400); });
  j.querySelector('#cert-ver').onclick = () => { f.senha.type = f.senha.type === 'password' ? 'text' : 'password'; };
  j.querySelector('#doc-arq').onchange = (ev) => { arquivos = Array.from(ev.target.files); if (arquivos.some((a) => /\.(pfx|p12)$/i.test(a.name)) && !ehCert()) porTipo('certificado'); mostrar(); };
  ['dragenter', 'dragover'].forEach((e) => solta.addEventListener(e, (ev) => { ev.preventDefault(); solta.classList.add('sobre'); }));
  ['dragleave', 'drop'].forEach((e) => solta.addEventListener(e, (ev) => { ev.preventDefault(); solta.classList.remove('sobre'); }));
  solta.addEventListener('drop', (ev) => { arquivos = Array.from(ev.dataTransfer.files || []); if (arquivos.some((a) => /\.(pfx|p12)$/i.test(a.name)) && !ehCert()) porTipo('certificado'); mostrar(); });
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-enviar-doc').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!arquivos.length) throw new Error('Escolha pelo menos um arquivo.');
    const vinc = Object.assign({}, vinculo); delete vinc.empresa_id; delete vinc.tipo;
    if (f.cliente_id && f.cliente_id.value) vinc.cliente_id = f.cliente_id.value;
    if (vinc.cliente_id && !vinc.grupo_id) { const c = E.clientes.find((x) => x.id === vinc.cliente_id); if (c) vinc.grupo_id = c.grupo_id; }
    if (ehCert()) {
      const cli = E.clientes.find((c) => c.id === vinc.cliente_id); if (!cli) throw new Error('Certificado digital: escolha a empresa.');
      if (!info) throw new Error('Não consegui ler o certificado: confira a senha.');
      const a = arquivos[0];
      const doc = await enviarDocumento(a, Object.assign(vinc, { tipo: 'certificado' }),
        { nome: 'Certificado digital — ' + cli.nome + (a.name.match(/\.(pfx|p12)$/i) || ['.pfx'])[0].toLowerCase(), validade: f.validade.value || null, obs: info.titular ? 'Titular: ' + info.titular : '', etiquetas: f.etiquetas.value.trim() });
      await q(sb.from('cliente_certificado').upsert({ cliente_id: cli.id, validade: f.validade.value || null, senha: f.senha.value || '', documento_id: doc.id, titular: info.titular || '', emissor: info.emissor || '' }).select('cliente_id'));
      aviso('✓ Certificado de ' + cli.nome + ' salvo — vence em ' + dataBR(f.validade.value) + '.'); fecharJanela(j); if (depois) await depois();
      return;
    }
    const extra = { tipo, validade: f.validade.value || null, etiquetas: f.etiquetas.value.trim(), obs: f.obs.value.trim() };
    for (const a of arquivos) await enviarDocumento(a, vinc, extra);
    aviso('✓ ' + arquivos.length + ' documento(s) enviado(s).'); fecharJanela(j); if (depois) await depois();
  });
  return j;
}
// apaga o documento (o arquivo e o registro) — sempre com confirmação
async function excluirDocumento(doc) {
  if (!doc) return false;
  if (!confirm('Excluir "' + doc.nome + '"?\n\nO arquivo é apagado de vez e não pode ser recuperado.')) return false;
  await q(sb.from('documentos').delete().eq('id', doc.id).select('id')).then((r) => { if (!r.length) throw new Error('Sem permissão para excluir este documento.'); });
  if (doc.caminho) await sb.storage.from(BUCKET).remove([doc.caminho]).catch(() => {});
  return true;
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
        '<button class="btn btn-o btn-mini" data-versao-doc="' + d.id + '" title="Substituir por um arquivo novo — o anterior fica no histórico (Versões anteriores)">↑ Nova versão</button> ' +
        '<button class="btn btn-x btn-mini" data-excluir-doc="' + d.id + '" title="Apagar o documento (pede confirmação)">Excluir</button></td></tr>';
    }).join('') + '</tbody></table></div>';
}
function ligarDocumentos(raiz, docs, depois) {
  raiz.querySelectorAll('[data-abrir-doc]').forEach((b) => b.onclick = () => comBotao(b, () => abrirDocumento(docs.find((d) => d.id === b.dataset.abrirDoc))));
  raiz.querySelectorAll('[data-versao-doc]').forEach((b) => b.onclick = () => janelaNovaVersao(docs.find((d) => d.id === b.dataset.versaoDoc), depois));
  raiz.querySelectorAll('[data-excluir-doc]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    if (!(await excluirDocumento(docs.find((d) => d.id === b.dataset.excluirDoc)))) return;
    aviso('✓ Documento excluído.'); if (depois) await depois();
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
    '<div class="acoes"><a class="btn btn-o" id="doc-ger" href="documentos/index.html" target="_blank" rel="noopener" title="Abre o sistema de geração de documentos numa aba nova">Gerar documentos ↗</a><button class="btn btn-p" id="doc-novo">+ Enviar documento</button></div></div>' +
    '<div class="filtros">' +
    '<div class="segmento" id="doc-sit">' + [['ativos', 'Ativos'], ['vencendo', 'Vencendo em 30 dias'], ['arquivados', 'Versões anteriores']].map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<select class="busca sel" id="doc-tipo"><option value="">Todos os tipos</option>' + TIPOS_DOC.map(([v, r]) => '<option value="' + v + '">' + r + '</option>').join('') + '</select>' +
    '<select class="busca sel" id="doc-grupo"><option value="">Todos os grupos</option>' + (E.grupos || []).map((g) => '<option value="' + g.id + '">' + esc(g.nome) + '</option>').join('') + '</select>' +
    '<select class="busca sel" id="doc-cli"><option value="">Todos os clientes</option>' + E.clientes.map((c) => '<option value="' + c.id + '">' + esc(c.nome) + '</option>').join('') + '</select>' +
    '<input class="busca" id="doc-busca" placeholder="Buscar nome, etiqueta ou observação" autocomplete="off"></div>' +
    '<div class="doc-chips" id="doc-chips"></div><div id="doc-corpo"><div class="carregando">Carregando…</div></div>';
  $('doc-tipo').value = F.tipo; $('doc-cli').value = F.cliente; $('doc-grupo').value = F.grupo || ''; $('doc-busca').value = F.busca;
  $('doc-novo').onclick = () => janelaEnviarDocumento({}, () => TELAS.documentos());
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
  const b = normalizar(F.busca), lim = somarDias(hojeISO(), 30);
  // Backup 49 (28): selo do vencimento mais próximo (certidão, certificado…) direto na pasta e na subpasta
  const seloPasta = (docs) => {
    const v = docs.filter((d) => d.validade && d.validade <= lim).map((d) => d.validade).sort()[0]; if (!v) return '';
    const dias = Math.round((new Date(v + 'T00:00:00') - new Date(hojeISO() + 'T00:00:00')) / 864e5), n = docs.filter((d) => d.validade && d.validade <= lim).length;
    return ' <span class="pill ' + (dias < 0 ? 'vencido' : 'hoje') + ' doc-selo-venc" title="' + plural(n, 'documento vencendo', 'documentos vencendo') + ' em até 30 dias">' +
      (dias < 0 ? 'vencido há ' + plural(-dias, 'dia', 'dias') : dias === 0 ? 'vence hoje' : 'vence em ' + plural(dias, 'dia', 'dias')) + '</span>';
  };
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
  // Backup 40: dentro de cada grupo, uma subpasta por empresa (e "Documentos do grupo" para o que não é de uma empresa só)
  F.subAbertas = F.subAbertas || {};
  const subpastas = (k, docs) => {
    const S = {}; docs.forEach((d) => { const c = d.cliente_id || ''; (S[c] = S[c] || []).push(d); });
    const cs = Object.keys(S).sort((x, y) => (x ? 1 : 0) - (y ? 1 : 0) || nomeCliente(x).localeCompare(nomeCliente(y), 'pt-BR'));
    if (cs.length === 1 && !k) return tabelaDocumentos(docs, { vazio: '' });
    return '<div class="doc-subpastas">' + cs.map((c) => { const sk = k + '|' + c, ab = !!b || cs.length === 1 || !!F.subAbertas[sk];
      return '<details class="doc-sub" data-sub="' + esc(sk) + '"' + (ab ? ' open' : '') + '><summary><span class="doc-pasta-ic" aria-hidden="true">📂</span><b>' + esc(c ? nomeCliente(c) : 'Documentos do grupo') + '</b>' +
        '<span class="sub">' + plural(S[c].length, 'documento', 'documentos') + seloPasta(S[c]) + '</span>' + (c ? linkDrive('cliente', c, (E.clientes.find((x) => x.id === c) || {}).drive_url) : '') +
        '<span class="doc-pasta-ac"><button type="button" class="btn btn-o btn-mini" data-sub-enviar="' + esc(k) + '|' + esc(c) + '" title="Enviar já para esta empresa">+ Enviar</button></span></summary>' +
        (ab ? tabelaDocumentos(S[c], { vazio: '', semCliente: !!c }) : '') + '</details>'; }).join('') + '</div>';
  };
  $('doc-corpo').innerHTML = lista.length ? '<div class="doc-pastas">' + ks.map((k) => '<details class="card doc-pasta" data-pasta="' + esc(k) + '"' + (aberto(k) ? ' open' : '') + '><summary><span class="doc-pasta-ic" aria-hidden="true">📁</span><b>' + esc(nomeG(k)) + '</b>' +
      '<span class="sub">' + plural(G[k].length, 'documento', 'documentos') + seloPasta(G[k]) + '</span>' +
      (k ? linkDrive('grupo', k, (E.grupos.find((g) => g.id === k) || {}).drive_url) : '') +
      '<span class="doc-pasta-ac"><button type="button" class="btn btn-p btn-mini" data-pasta-enviar="' + esc(k) + '" title="Enviar documento já para este grupo">+ Enviar</button></span></summary>' +
      (aberto(k) ? subpastas(k, G[k]) : '') + '</details>').join('') + '</div>'
    : '<div class="card">' + tabelaDocumentos([], { vazio: 'Nenhum documento neste recorte.' }) + '</div>';
  // a tabela só é montada quando a pasta abre (pasta fechada não carrega nada)
  $('doc-corpo').querySelectorAll('details[data-pasta]').forEach((d) => d.addEventListener('toggle', (ev) => { if (ev.target !== d) return; const k = d.dataset.pasta; if (d.open === aberto(k)) return; F.abertos[k] = d.open; pintarDocumentos(false); }));
  $('doc-corpo').querySelectorAll('details[data-sub]').forEach((d) => d.addEventListener('toggle', (ev) => { ev.stopPropagation(); const k = d.dataset.sub; if (!!F.subAbertas[k] === d.open) return; F.subAbertas[k] = d.open; pintarDocumentos(false); }));
  $('doc-corpo').querySelectorAll('[data-pasta-enviar]').forEach((b) => b.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation();
    janelaEnviarDocumento({ grupo_id: b.dataset.pastaEnviar || undefined }, () => pintarDocumentos(), '+ Enviar documento — ' + nomeG(b.dataset.pastaEnviar)); });
  $('doc-corpo').querySelectorAll('[data-sub-enviar]').forEach((b) => b.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation();
    const [g, c] = b.dataset.subEnviar.split('|');
    janelaEnviarDocumento(c ? { cliente_id: c, grupo_id: g || undefined } : { grupo_id: g || undefined }, () => pintarDocumentos(), '+ Enviar documento — ' + (c ? nomeCliente(c) : nomeG(g))); });
  // Backup 46: link da pasta no Google Drive — abre numa aba nova; ✎ grava/troca o link
  $('doc-corpo').querySelectorAll('[data-drive-ed]').forEach((b) => b.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation();
    const [tipo, id] = b.dataset.driveEd.split('|'), atual = tipo === 'grupo' ? (E.grupos.find((g) => g.id === id) || {}).drive_url : (E.clientes.find((c) => c.id === id) || {}).drive_url;
    const url = prompt('Cole o link da pasta no Google Drive (deixe vazio para tirar):', atual || ''); if (url === null) return;
    q(sb.rpc('salvar_link_drive', { p_tipo: tipo, p_id: id, p_url: url })).then(async () => { await carregarCadastros(true); aviso(url.trim() ? '✓ Link do Drive gravado.' : '✓ Link do Drive tirado.'); pintarDocumentos(false); }, (e) => aviso(erroAmigavel(e), true)); });
  $('doc-corpo').querySelectorAll('a.doc-drive').forEach((a) => a.addEventListener('click', (ev) => ev.stopPropagation()));
  ligarDocumentos($('doc-corpo'), lista, () => pintarDocumentos());
}
function linkDrive(tipo, id, url) {
  return '<span class="doc-drive-box">' + (url ? '<a class="doc-drive" href="' + esc(url) + '" target="_blank" rel="noopener" title="Abrir a pasta no Google Drive (aba nova)">🔗 Drive</a>' : '') +
    '<button type="button" class="doc-drive-ed" data-drive-ed="' + tipo + '|' + esc(id) + '" title="' + (url ? 'Trocar o link do Google Drive' : 'Colocar o link da pasta no Google Drive') + '">' + (url ? '✎' : '+ link do Drive') + '</button></span>';
}

// ─────────── Geradores de documentos (Backup 16) ───────────
// Backup 32: a Central de Documentos (documentos/) substitui o gerador antigo de contrato e procuração.
// Os outros geradores (petição, solicitação, proposta, e-mails) continuam como antes, mais abaixo na janela.
// Backup 40: a geração de documentos é um sistema à parte — sempre abre numa aba nova (não fica mais dentro do ERP)
function abrirCentral(url) { window.open(url || 'documentos/index.html', '_blank', 'noopener'); }
// Backup 26: gerador de contrato já com o cliente e os valores do contrato (o documento fica ligado ao contrato)
function abrirGeradorContrato(clienteId, contratoId) {
  abrirCentral('documentos/index.html?modelo=contrato' + (clienteId ? '&cliente=' + encodeURIComponent(clienteId) : '') + (contratoId ? '&contrato=' + encodeURIComponent(contratoId) : ''));
}

// ═══ Backup 37: Certificado digital — o arquivo (.pfx/.p12) fica em Documentos; a senha e a validade (lida do arquivo) na ficha do certificado.
// A leitura é feita aqui no navegador (biblioteca node-forge, gratuita, carregada só quando abre esta janela): o arquivo não sai do computador
// para ser lido — só é guardado no Storage privado, como qualquer documento.
function carregarForge() {
  if (window.forge) return Promise.resolve(window.forge);
  return new Promise((ok, falha) => { const s = document.createElement('script'); s.src = 'vendor/forge.min.js'; s.onload = () => ok(window.forge); s.onerror = () => falha(new Error('Não consegui carregar o leitor de certificado.')); document.head.appendChild(s); });
}
async function lerCertificado(arquivo, senha) {
  const forge = await carregarForge();
  const u = new Uint8Array(await arquivo.arrayBuffer()); let bin = '';
  for (let i = 0; i < u.length; i += 8192) bin += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
  let p12;
  try { p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(bin), senha || ''); }
  catch (e) { throw new Error(/password|mac|Invalid/i.test(e.message || '') ? 'Senha incorreta para este certificado.' : 'Arquivo não é um certificado .pfx/.p12 válido.'); }
  const bags = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []).map((b) => b.cert).filter(Boolean);
  if (!bags.length) throw new Error('Não achei o certificado dentro do arquivo.');
  // o certificado da empresa é o que NÃO é autoridade certificadora (e, entre os que sobram, o que vence primeiro)
  const ehCA = (c) => { const bc = c.getExtension && c.getExtension('basicConstraints'); return !!(bc && bc.cA); };
  const c = (bags.filter((x) => !ehCA(x)).length ? bags.filter((x) => !ehCA(x)) : bags).sort((a, b) => a.validity.notAfter - b.validity.notAfter)[0];
  const campo = (attrs, n) => ((attrs.find((a) => a.shortName === n || a.name === n) || {}).value || '');
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  return { validade: iso(c.validity.notAfter), inicio: iso(c.validity.notBefore), titular: campo(c.subject.attributes, 'CN'), emissor: campo(c.issuer.attributes, 'CN') || campo(c.issuer.attributes, 'O') };
}
// Backup 40: o certificado entra pelo "+ Enviar" (tipo Certificado digital); esta função fica para quem já chamava (alertas, ficha)
async function janelaCertificado(vinculo, depois) {
  if (!E.clientes.length) await carregarCadastros();
  return janelaEnviarDocumento({ grupo_id: vinculo.grupo_id || undefined, empresa_id: vinculo.cliente_id || undefined, tipo: 'certificado' }, depois, 'Enviar certificado digital');
}
