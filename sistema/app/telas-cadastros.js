'use strict';
// ═══════════════════════════════════════════════════════════════════
// Clientes (cadastro completo da Base de Dados) e Contratos.
// ═══════════════════════════════════════════════════════════════════

// ─────────────────────────── CLIENTES ──────────────────────────────
TELAS.clientes = async function () {
  E.cli = E.cli || { tipo: 'ativos', grupo: '', busca: '' };
  await carregarCadastros();
  const C = E.cli;
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Clientes</h1><p id="cli-conta"></p></div>' +
    '<div class="acoes"><button class="btn btn-p" data-novo="cliente">+ Novo cliente</button></div></div>' +
    '<div class="filtros">' +
    '<div class="segmento" id="cli-tipo">' + [['ativos', 'Ativos'], ['Consultoria', 'Consultoria'], ['Demanda', 'Demanda'], ['Inativo', 'Inativos'], ['todos', 'Todos']]
      .map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<select class="busca sel" id="cli-grupo" autocomplete="off"><option value="">Todos os grupos</option>' +
    E.grupos.map((g) => '<option value="' + g.id + '">' + esc(g.nome) + '</option>').join('') + '</select>' +
    '<input class="busca" id="cli-busca" placeholder="Buscar nome, grupo, responsável ou CPF/CNPJ" autocomplete="off">' +
    '</div><div id="cli-corpo"></div>';
  $('cli-tipo').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { C.tipo = b.dataset.v; pintarClientes(); } };
  $('cli-grupo').onchange = (ev) => { C.grupo = ev.target.value; pintarClientes(); };
  let t;
  $('cli-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { C.busca = ev.target.value; pintarClientes(); }, 250); };
  ligarBotoesNovo($('conteudo'));
  // ao ordenar pelo cabeçalho, fecha o detalhe aberto (senão ele fica solto no meio da tabela)
  $('cli-corpo').addEventListener('click', (ev) => { if (ev.target.closest('th')) { document.querySelectorAll('#cli-corpo .cli-det').forEach((x) => x.remove());
    document.querySelectorAll('#cli-corpo tr[data-cli]').forEach((x) => { x.setAttribute('aria-expanded', 'false'); x.classList.remove('cli-aberta'); x.querySelector('.cli-seta').textContent = '▸'; }); } });
  pintarClientes();
};

function pintarClientes() {
  const C = E.cli, b = normalizar(C.busca), bd = soDigitos(C.busca);
  document.querySelectorAll('#cli-tipo button').forEach((x) => x.classList.toggle('ativo', x.dataset.v === C.tipo));
  if (document.activeElement !== $('cli-grupo')) $('cli-grupo').value = C.grupo;
  if (document.activeElement !== $('cli-busca')) $('cli-busca').value = C.busca;
  const lista = E.clientes.filter((c) => {
    if (C.tipo === 'ativos' && c.tipo === 'Inativo') return false;
    if (C.tipo !== 'ativos' && C.tipo !== 'todos' && c.tipo !== C.tipo) return false;
    if (C.grupo && c.grupo_id !== C.grupo) return false;
    if (b && !(normalizar(c.nome + ' ' + (c.grupos ? c.grupos.nome : '') + ' ' + c.responsavel + ' ' + c.socio_admin).includes(b) ||
               (bd && soDigitos(c.cpf_cnpj).includes(bd)))) return false;
    return true;
  });
  $('cli-conta').textContent = lista.length + ' de ' + E.clientes.length + ' cadastro(s) · clique na linha para ver os detalhes';
  $('cli-corpo').innerHTML = '<div class="card">' + (lista.length ?
    '<div class="tabela-wrap"><table class="ordenavel cli-tabela"><thead><tr><th class="sem-ordem" style="width:28px"></th><th>Grupo</th><th>Nome</th><th>CPF/CNPJ</th><th>Responsável</th>' +
    '<th>Procuração</th><th>Certificado</th><th>Situação</th></tr></thead><tbody>' +
    lista.map((c) => '<tr class="clicavel cli-linha" tabindex="0" aria-expanded="false" data-cli="' + c.id + '"><td class="cli-seta">▸</td>' +
      '<td class="cli-grupo" title="' + esc(c.grupos ? c.grupos.nome : '') + '">' + esc(c.grupos ? c.grupos.nome : '—') + '</td>' +
      '<td><b>' + esc(c.nome) + '</b>' + (c.socio_admin ? '<div class="sub">' + esc(c.socio_admin) + '</div>' : '') + '</td>' +
      '<td class="mono">' + esc(mascaraDoc(c.cpf_cnpj) || '—') + '</td>' +
      '<td>' + pillPessoa(c.responsavel) + '</td><td>' + pillSimNao(c.procuracao) + '</td><td>' + pillSimNao(c.certificado) + '</td>' +
      '<td>' + pillSitCad(c.situacao_cadastral) + '</td></tr>').join('') +
    '</tbody></table></div>'
    : '<div class="vazio">' + (E.clientes.length ? 'Nenhum cliente neste recorte.' : 'Nenhum cliente ainda. Clique em "+ Novo cliente" ou importe a Base de Dados em Administração.') + '</div>') + '</div>';
  $('cli-corpo').querySelectorAll('tr[data-cli]').forEach((tr) => {
    tr.onclick = () => expandirCliente(tr);
    tr.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); expandirCliente(tr); } };
  });
}

// Linha que expande logo abaixo com o resumo do cliente (uma aberta por vez)
async function expandirCliente(tr) {
  const aberta = tr.getAttribute('aria-expanded') === 'true';
  document.querySelectorAll('#cli-corpo .cli-det').forEach((x) => x.remove());
  document.querySelectorAll('#cli-corpo tr[data-cli]').forEach((x) => { x.setAttribute('aria-expanded', 'false'); x.classList.remove('cli-aberta'); x.querySelector('.cli-seta').textContent = '▸'; });
  if (aberta) return;
  const c = E.clientes.find((x) => x.id === tr.dataset.cli);
  tr.setAttribute('aria-expanded', 'true'); tr.classList.add('cli-aberta'); tr.querySelector('.cli-seta').textContent = '▾';
  const det = document.createElement('tr');
  det.className = 'cli-det';
  det.innerHTML = '<td colspan="8"><div class="cli-det-corpo"><div class="carregando" style="padding:14px">Carregando…</div></div></td>';
  tr.after(det);
  const alvo = det.querySelector('.cli-det-corpo');
  const nada = () => [];
  const [contatos, ctrs, lanc, tfs, docs] = await Promise.all([
    q(sb.from('contatos').select('nome, finalidade, email, telefone').eq('cliente_id', c.id).order('criado_em')).catch(nada),
    q(sb.from('contratos').select('descricao, valor_total, status').eq('cliente_id', c.id).eq('status', 'Ativo')).catch(nada),
    q(sb.from('lancamentos').select('valor, redutor, vencimento').eq('cliente_id', c.id).eq('tipo', 'receita').eq('pago', false).eq('perda', false)).catch(nada),
    q(sb.from('tarefas').select('titulo, prazo').eq('cliente_id', c.id).not('status', 'in', '(concluida,cancelada)').order('prazo', { nullsFirst: false }).limit(3)).catch(nada),
    q(sb.from('documentos').select('nome, criado_em').eq('cliente_id', c.id).eq('arquivado', false).order('criado_em', { ascending: false }).limit(3)).catch(nada)
  ]);
  if (!det.isConnected) return;
  const h = hojeISO(), atraso = lanc.filter((l) => l.vencimento < h);
  const lin = (rot, v) => v ? '<div class="dado"><span>' + rot + '</span><b>' + v + '</b></div>' : '';
  const fin = contatos.find((x) => x.finalidade === 'financeiro'), jur = contatos.find((x) => x.finalidade === 'juridico');
  const deb = [['RFB', c.rfb], ['PGFN', c.pgfn], ['SEFAZ/MG', c.sefaz_mg], ['AGE/MG', c.age_mg]].filter((d) => Number(d[1]));
  const zap = soDigitos(c.telefone);
  alvo.innerHTML =
    '<div class="cli-det-grade">' +
    '<div class="dados"><div class="cli-det-tit">Contato</div>' +
      lin('Telefone', esc(c.telefone)) + lin('E-mail', c.email ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '') +
      lin('Financeiro', fin ? esc(fin.nome) + (fin.email ? ' · ' + esc(fin.email) : '') : '') + lin('Jurídico', jur ? esc(jur.nome) + (jur.email ? ' · ' + esc(jur.email) : '') : '') +
      lin('Endereço', esc([c.endereco, c.cidade && c.estado ? c.cidade + '/' + c.estado : c.cidade].filter(Boolean).join(' · '))) +
      lin('Tipo', esc(c.tipo)) + (!c.telefone && !c.email && !contatos.length ? '<div class="sub">Sem contato cadastrado.</div>' : '') + '</div>' +
    '<div class="dados"><div class="cli-det-tit">Fiscal</div>' +
      lin('Regime', esc(c.regime_tributario)) + lin('CAPAG', c.capag ? pillCapag(c.capag) : '') +
      deb.map((d) => lin(d[0], brl(d[1]))).join('') + (!c.regime_tributario && !c.capag && !deb.length ? '<div class="sub">Sem dados fiscais.</div>' : '') + '</div>' +
    '<div class="dados"><div class="cli-det-tit">Escritório</div>' +
      lin('Contratos ativos', String(ctrs.length)) + lin('A receber', brl(soma(lanc, vl)) + (atraso.length ? ' <span class="pill vencido">' + atraso.length + ' em atraso</span>' : '')) +
      lin('Tarefas abertas', tfs.length ? tfs.map((t) => esc(t.titulo) + (t.prazo ? ' <span class="sub">' + dataBR(t.prazo) + '</span>' : '')).join('<br>') : '—') +
      lin('Últimos documentos', docs.length ? docs.map((d) => esc(d.nome)).join('<br>') : '—') + '</div>' +
    '</div><div class="cli-det-acoes">' +
      '<button class="btn btn-p btn-mini" data-cli-ficha>Abrir ficha completa</button><button class="btn btn-o btn-mini" data-cli-editar>Editar</button>' +
      (zap ? '<a class="btn btn-o btn-mini" target="_blank" rel="noopener" href="https://wa.me/' + (zap.length <= 11 ? '55' : '') + zap + '">WhatsApp</a>' : '') +
      (c.email ? '<a class="btn btn-o btn-mini" href="mailto:' + esc(c.email) + '">E-mail</a>' : '') + '</div>';
  alvo.querySelector('[data-cli-ficha]').onclick = () => abrirFicha(c.id);
  alvo.querySelector('[data-cli-editar]').onclick = () => formCliente(c, pintarClientes);
}

function selectSimNao(nome, v) {
  return '<select name="' + nome + '"><option value=""' + (v == null ? ' selected' : '') + '>—</option>' +
    '<option value="sim"' + (v === true ? ' selected' : '') + '>Sim</option><option value="nao"' + (v === false ? ' selected' : '') + '>Não</option></select>';
}
function lerSimNao(v) { return v === 'sim' ? true : v === 'nao' ? false : null; }
function selectOpcoes(nome, opcoes, v) {
  const lista = opcoes.includes(v) || !v ? opcoes : opcoes.concat([v]);
  return '<select name="' + nome + '"><option value="">—</option>' + lista.map((o) => '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select>';
}
function campoValor(rotulo, nome, v) {
  return campo(rotulo, '<input name="' + nome + '" inputmode="decimal" placeholder="—" value="' + esc(valorParaCampo(v)) + '">');
}

async function formCliente(cl, depois) {
  const novo = !cl;
  cl = cl || {};
  let resumo = '';
  if (!novo) {
    const [ctrs, abertos] = await Promise.all([
      q(sb.from('contratos').select('id').eq('cliente_id', cl.id)),
      q(sb.from('lancamentos').select('valor, vencimento').or('cliente_id.eq.' + cl.id + (cl.grupo_id ? ',grupo_id.eq.' + cl.grupo_id : ''))
        .eq('tipo', 'receita').eq('pago', false).eq('perda', false))
    ]);
    const emAberto = soma(abertos, vl);
    const atraso = soma(abertos.filter((l) => l.vencimento < hojeISO()), vl);
    resumo = '<div class="dica inteiro"><b>' + ctrs.length + '</b> contrato(s) · honorários em aberto ' + (cl.grupo_id ? 'do grupo ' : '') +
      '<b class="mono">' + brl(emAberto) + '</b>' + (atraso ? ' · <span style="color:var(--red)">em atraso <b class="mono">' + brl(atraso) + '</b></span>' : '') +
      ' · passivo tributário <b class="mono">' + brl(passivo(cl)) + '</b></div>';
  }
  const secao = (t) => '<div class="secao inteiro">' + t + '</div>';
  const j = abrirJanela({
    titulo: novo ? 'Novo cliente' : cl.nome, larga: true,
    corpo:
      '<form id="f-cli" class="grade g3">' + resumo +
      secao('📋 Cadastro') +
      campo('Nome / Razão social <span class="obrig">*</span>', '<input name="nome" required maxlength="200" value="' + esc(cl.nome || '') + '">', 'dois') +
      campo('CPF/CNPJ', '<input name="cpf_cnpj" inputmode="numeric" maxlength="18" value="' + esc(mascaraDoc(cl.cpf_cnpj)) + '">') +
      campo('Grupo', '<input name="grupo" list="cli-grupos" placeholder="Digite ou escolha" value="' + esc(cl.grupos ? cl.grupos.nome : nomeGrupo(cl.grupo_id)) + '">' + datalistGrupos('cli-grupos')) +
      campo('Tipo', '<select name="tipo">' + ['Consultoria', 'Demanda', 'Inativo'].map((t) => '<option' + (cl.tipo === t ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>') +
      campo('Responsável', '<input name="responsavel" list="cli-pessoas" value="' + esc(cl.responsavel || '') + '">' + datalistPessoas('cli-pessoas')) +
      campo('Sócio-administrador', '<input name="socio_admin" value="' + esc(cl.socio_admin || '') + '">', 'dois') +
      campo('Tipo societário', selectOpcoes('tipo_societario', ['LTDA', 'S.A', 'MEI', 'EI', 'PF'], cl.tipo_societario)) +
      secao('🏛 Situação') +
      campo('Em operação', selectSimNao('em_operacao', cl.em_operacao)) +
      campo('Procuração', selectSimNao('procuracao', cl.procuracao)) +
      campo('Certificado', selectSimNao('certificado', cl.certificado)) +
      campo('Cadastro regular', selectSimNao('cadastro_regular', cl.cadastro_regular)) +
      campo('CAPAG', selectOpcoes('capag', ['A', 'B', 'C', 'D', 'Omisso'], cl.capag)) +
      campo('Regime tributário', selectOpcoes('regime_tributario', ['PF', 'SN', 'LP', 'LR', 'BAIXADA'], cl.regime_tributario)) +
      campo('Situação cadastral', selectOpcoes('situacao_cadastral', ['ATIVA', 'SUSPENSA', 'INAPTA', 'BAIXADA', 'NULA'], cl.situacao_cadastral)) +
      secao('💰 Passivo tributário') +
      campoValor('RFB', 'rfb', cl.rfb) + campoValor('RFB negociada', 'rfb_negociada', cl.rfb_negociada) +
      campoValor('PGFN', 'pgfn', cl.pgfn) + campoValor('PGFN negociada', 'pgfn_negociada', cl.pgfn_negociada) +
      campoValor('AGE/MG', 'age_mg', cl.age_mg) + campoValor('AGE/MG negociada', 'age_mg_negociada', cl.age_mg_negociada) +
      campoValor('SEFAZ/MG', 'sefaz_mg', cl.sefaz_mg) +
      campo('CEAT (TRT-3) — processos', '<input name="ceat_trt3" type="number" min="0" value="' + esc(cl.ceat_trt3 == null ? '' : cl.ceat_trt3) + '">') +
      secao('📞 Contato') +
      campo('E-mail', '<input name="email" type="email" value="' + esc(cl.email || '') + '">') +
      campo('Telefone / WhatsApp', '<input name="telefone" inputmode="tel" value="' + esc(cl.telefone || '') + '">') +
      campo('Endereço', '<input name="endereco" value="' + esc(cl.endereco || '') + '">') +
      campo('Cidade', '<input name="cidade" value="' + esc(cl.cidade || '') + '">') +
      campo('UF', '<input name="estado" maxlength="2" style="text-transform:uppercase" value="' + esc(cl.estado || '') + '">') +
      campo('Origem', '<input name="origem" value="' + esc(cl.origem || '') + '">') +
      campo('Observação interna', '<textarea name="obs" maxlength="4000">' + esc(cl.obs || '') + '</textarea>', 'inteiro') +
      (cl.historico_cadastral ? campo('Histórico cadastral', '<textarea name="historico_cadastral" maxlength="4000">' + esc(cl.historico_cadastral) + '</textarea>', 'inteiro') : '') +
      '</form>',
    rodape:
      (!novo && E.perfil.papel === 'admin' ? '<button class="btn btn-x" id="btn-excluir-cli" type="button">Excluir</button>' : '<span></span>') +
      '<div class="acoes">' + (!novo ? '<button class="btn btn-o" type="button" id="btn-ctr-cli">+ Contrato</button>' : '') +
      '<button class="btn btn-o" type="button" data-cancelar>Cancelar</button>' +
      '<button class="btn btn-p" id="btn-salvar-cli" type="button">Salvar</button></div>'
  });
  const f = j.querySelector('#f-cli');
  f.cpf_cnpj.onblur = () => { f.cpf_cnpj.value = mascaraDoc(f.cpf_cnpj.value); };
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  const apos = async () => { await carregarCadastros(); if (depois) depois(); else await recarregar(); };
  const bc = j.querySelector('#btn-ctr-cli');
  if (bc) bc.onclick = () => { fecharJanela(j); formContrato({ cliente_id: cl.id }); };

  j.querySelector('#btn-salvar-cli').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.nome.value.trim()) throw new Error('Preencha o nome.');
    const num = (n) => { const t = f[n].value.trim(); if (!t) return null; const v = lerValor(t); if (isNaN(v)) throw new Error('Valor inválido em ' + n.toUpperCase().replace(/_/g, ' ') + '.'); return v; };
    const grupo_id = await grupoPorNome(f.grupo.value);
    const dados = {
      nome: f.nome.value.trim(), cpf_cnpj: soDigitos(f.cpf_cnpj.value), grupo_id, tipo: f.tipo.value,
      responsavel: f.responsavel.value.trim(), socio_admin: f.socio_admin.value.trim(), tipo_societario: f.tipo_societario.value,
      em_operacao: lerSimNao(f.em_operacao.value), procuracao: lerSimNao(f.procuracao.value),
      certificado: lerSimNao(f.certificado.value), cadastro_regular: lerSimNao(f.cadastro_regular.value),
      capag: f.capag.value, regime_tributario: f.regime_tributario.value, situacao_cadastral: f.situacao_cadastral.value,
      rfb: num('rfb'), rfb_negociada: num('rfb_negociada'), pgfn: num('pgfn'), pgfn_negociada: num('pgfn_negociada'),
      age_mg: num('age_mg'), age_mg_negociada: num('age_mg_negociada'), sefaz_mg: num('sefaz_mg'),
      ceat_trt3: f.ceat_trt3.value === '' ? null : Number(f.ceat_trt3.value),
      email: f.email.value.trim(), telefone: f.telefone.value.trim(), endereco: f.endereco.value.trim(),
      cidade: f.cidade.value.trim(), estado: f.estado.value.trim().toUpperCase(), origem: f.origem.value.trim(),
      obs: f.obs.value.trim()
    };
    if (f.historico_cadastral) dados.historico_cadastral = f.historico_cadastral.value.trim();
    if (novo) await q(sb.from('clientes').insert(dados));
    else await q(sb.from('clientes').update(dados).eq('id', cl.id));
    aviso(novo ? '✓ Cliente cadastrado.' : '✓ Cadastro atualizado.');
    fecharJanela(j);
    await apos();
  });
  const bx = j.querySelector('#btn-excluir-cli');
  if (bx) bx.onclick = () => comBotao(bx, async () => {
    if (!confirm('Excluir o cliente "' + cl.nome + '"? Esta ação não pode ser desfeita.')) return;
    await excluir('clientes', cl.id);
    aviso('Cliente excluído.'); fecharJanela(j);
    await apos();
  });
}

// ─────────────────────────── CONTRATOS ─────────────────────────────
TELAS.contratos = async function () {
  E.ctr = E.ctr || { busca: '', status: 'Ativo' };
  const F = E.ctr;
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Contratos</h1><p>Ao cadastrar um contrato, as parcelas entram sozinhas em Honorários Jurídico</p></div>' +
    '<div class="acoes"><button class="btn btn-p" data-novo="contrato">+ Novo contrato</button></div></div>' +
    '<div class="filtros"><div class="segmento" id="ctr-status">' + [['Ativo', 'Ativos'], ['Encerrado', 'Encerrados'], ['Cancelado', 'Cancelados'], ['todos', 'Todos']]
      .map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<input class="busca" id="ctr-busca" placeholder="Buscar cliente ou descrição" autocomplete="off"></div><div id="ctr-corpo"></div>';
  $('ctr-status').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.status = b.dataset.v; pintarContratos(true); } };
  let t;
  $('ctr-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; pintarContratos(false); }, 250); };
  ligarBotoesNovo($('conteudo'));
  await pintarContratos(true);
};

let _contratos = [];
async function pintarContratos(buscar) {
  const F = E.ctr;
  document.querySelectorAll('#ctr-status button').forEach((x) => x.classList.toggle('ativo', x.dataset.v === F.status));
  if (document.activeElement !== $('ctr-busca')) $('ctr-busca').value = F.busca;
  if (buscar) {
    let c = sb.from('contratos').select('*, clientes(nome, grupos(nome)), lancamentos(valor, pago, vencimento)').order('data_contrato', { ascending: false });
    if (F.status !== 'todos') c = c.eq('status', F.status);
    _contratos = await q(c);
  }
  let lista = _contratos;
  if (F.busca) {
    const b = normalizar(F.busca);
    lista = lista.filter((c) => normalizar(c.descricao + ' ' + (c.clientes ? c.clientes.nome : '')).includes(b));
  }
  const h = hojeISO();
  $('ctr-corpo').innerHTML = '<div class="card">' + (lista.length ?
    '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Cliente</th><th>Contrato</th><th data-tipo="data">Data</th><th class="num">Valor</th><th class="num">Recebido</th><th>Parcelas</th><th>Situação</th></tr></thead><tbody>' +
    lista.map((c) => {
      const parc = c.lancamentos || [];
      const recebido = soma(parc.filter((p) => p.pago), (p) => p.valor);
      const atraso = parc.some((p) => !p.pago && p.vencimento < h);
      return '<tr class="clicavel" data-ctr="' + c.id + '"><td>' + esc(c.clientes ? c.clientes.nome : '—') +
        (c.clientes && c.clientes.grupos ? '<div class="sub">' + esc(c.clientes.grupos.nome) + '</div>' : '') + '</td>' +
        '<td>' + esc(c.descricao) + (c.percentual_exito ? '<div class="sub">+ ' + esc(String(c.percentual_exito).replace('.', ',')) + '% de êxito</div>' : '') + '</td>' +
        '<td class="mono" data-ord="' + c.data_contrato + '">' + dataBR(c.data_contrato) + '</td>' +
        '<td class="num mono" data-ord="' + c.valor_total + '">' + brl(c.valor_total) + '</td>' +
        '<td class="num mono valor-rec" data-ord="' + recebido + '">' + brl(recebido) + '</td>' +
        '<td>' + parc.filter((p) => p.pago).length + '/' + parc.length + '</td>' +
        '<td>' + (atraso ? '<span class="pill vencido">Parcela em atraso</span>' : '<span class="pill ' + (c.status === 'Ativo' ? 'aberto' : 'neutro') + '">' + esc(c.status) + '</span>') + '</td></tr>';
    }).join('') + '</tbody></table></div>'
    : '<div class="vazio">Nenhum contrato' + (F.status !== 'todos' ? ' com essa situação' : '') + '.</div>') + '</div>';
  $('ctr-corpo').querySelectorAll('[data-ctr]').forEach((tr) => tr.onclick = () => detalheContrato(tr.dataset.ctr));
}

function formContrato(ct) {
  ct = ct || {};
  const novo = !ct.id;
  if (novo && !E.clientes.length) {
    aviso('Cadastre um cliente antes de criar o contrato.', true);
    return formCliente();
  }
  const j = abrirJanela({
    titulo: novo ? 'Novo contrato' : 'Editar contrato',
    corpo:
      '<form id="f-ctr" class="grade">' +
      campo('Cliente <span class="obrig">*</span>', '<select name="cliente_id" required>' + opcoesClientes(ct.cliente_id).replace('— sem cliente —', 'Escolha o cliente') + '</select>', 'inteiro') +
      campo('Descrição do serviço <span class="obrig">*</span>', '<input name="descricao" required maxlength="200" placeholder="Ex.: Consultoria tributária mensal" value="' + esc(ct.descricao || '') + '">', 'inteiro') +
      campo('Data do contrato', '<input name="data_contrato" type="date" value="' + esc(ct.data_contrato || hojeISO()) + '">') +
      campo('% de êxito (se houver)', '<input name="percentual_exito" inputmode="decimal" placeholder="Ex.: 20" value="' + (ct.percentual_exito != null ? esc(String(ct.percentual_exito).replace('.', ',')) : '') + '">') +
      (novo
        ? campo('Valor total (R$)', '<input name="valor_total" inputmode="decimal" placeholder="0,00">') +
          campo('Nº de parcelas', '<input name="num_parcelas" type="number" min="1" max="120" value="1">') +
          campo('1º vencimento', '<input name="primeiro_vencimento" type="date" value="' + somarDias(hojeISO(), 30) + '">') +
          '<div class="dica inteiro" id="ctr-previa">Informe o valor para ver as parcelas.</div>'
        : campo('Situação', '<select name="status">' + ['Ativo', 'Encerrado', 'Cancelado'].map((s) => '<option' + (ct.status === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select>') +
          '<div class="dica inteiro">Valor e parcelas já foram lançados em Honorários Jurídico. Para ajustar uma parcela, use o botão Editar dela.</div>') +
      campo('Observação', '<textarea name="obs" maxlength="2000">' + esc(ct.obs || '') + '</textarea>', 'inteiro') +
      '</form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button>' +
      '<button class="btn btn-p" id="btn-salvar-ctr" type="button">' + (novo ? 'Criar contrato' : 'Salvar') + '</button></div>'
  });
  const f = j.querySelector('#f-ctr');
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  if (novo) {
    const previa = () => {
      const v = lerValor(f.valor_total.value), n = Math.max(1, Math.min(120, Number(f.num_parcelas.value) || 1));
      const el = j.querySelector('#ctr-previa');
      if (!(v > 0)) { el.textContent = 'Sem valor: o contrato é salvo sem gerar parcelas (útil para contratos só de êxito).'; return; }
      const base = Math.floor(v / n * 100) / 100, ultima = Math.round((v - base * (n - 1)) * 100) / 100;
      el.innerHTML = 'Serão lançadas <b>' + n + ' parcela(s)</b> de <b class="mono">' + brl(base) + '</b>' +
        (ultima !== base ? ' (a última de <b class="mono">' + brl(ultima) + '</b>)' : '') +
        ', a partir de ' + dataBR(f.primeiro_vencimento.value) + ', todo mês.';
    };
    ['input', 'change'].forEach((ev) => f.addEventListener(ev, previa));
    previa();
  }
  j.querySelector('#btn-salvar-ctr').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.cliente_id.value) throw new Error('Escolha o cliente.');
    if (!f.descricao.value.trim()) throw new Error('Preencha a descrição do serviço.');
    const exito = f.percentual_exito.value.trim() ? lerValor(f.percentual_exito.value) : null;
    if (exito != null && !(exito >= 0 && exito <= 100)) throw new Error('% de êxito deve ficar entre 0 e 100.');
    const dados = { cliente_id: f.cliente_id.value, descricao: f.descricao.value.trim(),
      data_contrato: f.data_contrato.value || hojeISO(), percentual_exito: exito, obs: f.obs.value.trim() };
    if (novo) {
      const v = f.valor_total.value.trim() ? lerValor(f.valor_total.value) : 0;
      if (isNaN(v) || v < 0) throw new Error('Valor total inválido (ex.: 12.000,00).');
      const n = Number(f.num_parcelas.value) || 1;
      if (n < 1 || n > 120) throw new Error('Nº de parcelas deve ficar entre 1 e 120.');
      if (v > 0 && !f.primeiro_vencimento.value) throw new Error('Informe o 1º vencimento.');
      Object.assign(dados, { valor_total: v, num_parcelas: n, primeiro_vencimento: v > 0 ? f.primeiro_vencimento.value : null });
      const criado = await q(sb.from('contratos').insert(dados).select().single());
      // parcelas geradas pelo banco: completa grupo e responsável do cliente
      const cli = E.clientes.find((c) => c.id === dados.cliente_id);
      if (v > 0 && cli) await q(sb.from('lancamentos').update({ grupo_id: cli.grupo_id, responsavel: cli.responsavel || '' }).eq('contrato_id', criado.id));
      aviso(v > 0 ? '✓ Contrato criado e ' + n + ' parcela(s) lançada(s) em Honorários Jurídico.' : '✓ Contrato criado.');
    } else {
      dados.status = f.status.value;
      await q(sb.from('contratos').update(dados).eq('id', ct.id));
      aviso('✓ Contrato atualizado.');
    }
    fecharJanela(j);
    if (!novo) fecharJanela();
    await recarregar();
  });
}

async function detalheContrato(id) {
  const ct = await q(sb.from('contratos').select('*, clientes(nome, grupo_id, responsavel)').eq('id', id).single());
  const parc = await q(sb.from('lancamentos').select('*').eq('contrato_id', id).order('vencimento'));
  const recebido = soma(parc.filter((p) => p.pago), (p) => p.valor);
  const total = soma(parc, (p) => p.valor);
  const j = abrirJanela({
    titulo: ct.descricao, larga: true,
    corpo:
      '<div class="kpis" style="margin-bottom:12px">' +
      kpi('Cliente', '<span style="font-family:var(--font-d);font-size:16px">' + esc(ct.clientes ? ct.clientes.nome : '—') + '</span>', '', 'Contrato de ' + dataBR(ct.data_contrato)) +
      kpi('Recebido', brl(recebido), 'verde', parc.filter((p) => p.pago).length + ' de ' + parc.length + ' parcela(s)') +
      kpi('Falta receber', brl(total - recebido), 'ambar', ct.percentual_exito ? '+ ' + String(ct.percentual_exito).replace('.', ',') + '% de êxito' : ct.status) +
      '</div>' +
      (ct.obs ? '<div class="dica" style="margin-bottom:12px">' + esc(ct.obs) + '</div>' : '') +
      '<div class="card" style="margin:0">' + tabelaLancamentos(parc, { compacta: true }) + '</div>' +
      '<div style="margin-top:10px"><button class="btn btn-o btn-mini" id="ctr-add-parc">+ Lançar valor avulso neste contrato (ex.: êxito)</button></div>' +
      '<div class="card" style="margin:14px 0 0"><div class="card-bd" id="ctr-docs"></div></div>',
    rodape:
      (E.perfil.papel === 'admin' ? '<button class="btn btn-x" id="btn-excluir-ctr" type="button">Excluir contrato</button>' : '<span></span>') +
      '<button class="btn btn-o" id="btn-editar-ctr" type="button">Editar contrato</button>'
  });
  const reabrir = async () => { fecharJanela(j); await detalheContrato(id); };
  ligarAcoesLancamentos(j, reabrir);
  blocoDocumentos(j.querySelector('#ctr-docs'), { contrato_id: id, cliente_id: ct.cliente_id, grupo_id: ct.clientes && ct.clientes.grupo_id, tipo: 'contrato' },
    { titulo: 'Documentos do contrato', vazio: 'Nenhum documento. Envie aqui o contrato assinado, a proposta e os aditivos.' }).catch((e) => console.error(e));
  j.querySelector('#btn-editar-ctr').onclick = () => formContrato(ct);
  j.querySelector('#ctr-add-parc').onclick = () => {
    formLancamento({ tipo: 'receita', empresa: 'escritorio', cliente_id: ct.cliente_id, contrato_id: id,
                     grupo_id: ct.clientes && ct.clientes.grupo_id, responsavel: ct.clientes && ct.clientes.responsavel,
                     categoria: 'Êxito', descricao: ct.descricao + ' — êxito' }, reabrir);
  };
  const bx = j.querySelector('#btn-excluir-ctr');
  if (bx) bx.onclick = () => comBotao(bx, async () => {
    if (!confirm('Excluir o contrato e TODAS as parcelas dele? Esta ação não pode ser desfeita.')) return;
    await excluir('contratos', id);
    aviso('Contrato excluído.'); fecharJanela(j); await recarregar();
  });
}
