'use strict';
// ═══════════════════════════════════════════════════════════════════
// Clientes (cadastro completo da Base de Dados) e Contratos.
// ═══════════════════════════════════════════════════════════════════

// ─────────────────────────── CLIENTES ──────────────────────────────
async function consultarCnpjNovo(id, nome) {
  try {
    const r = await chamarFuncao('erp-cnpj', { acao: 'rodar', cliente_id: id, auto: true });
    if (r.desligada) return;
    aviso(/aguardando/.test(r.mensagem || '') ? '⏳ ' + nome + ': CNPJ novo, ainda não está na base pública da Receita — o sistema tenta de novo todo dia.'
      : '✓ Dados da Receita preenchidos para ' + nome + '.');
    await carregarCadastros(true);
  } catch (e) { console.warn('[ERP] consulta do CNPJ na hora não rodou (fica para a rotina das 6h):', e.message); }
}

TELAS.clientes = async function () {
  E.cli = E.cli || { tipo: 'ativos', grupo: '', busca: '', area: '' };
  await carregarCadastros();
  const C = E.cli;
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Clientes</h1><p id="cli-conta"></p></div>' +
    '<div class="acoes"><button class="btn btn-p" data-novo="cliente">+ Novo cliente</button></div></div>' +
    '<div class="filtros">' +
    '<div class="segmento" id="cli-tipo">' + [['ativos', 'Ativos'], ['Consultoria', 'Consultoria'], ['Demanda', 'Serviço pontual'], ['Inativo', 'Inativos'], ['todos', 'Todos']]
      .map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    (minhasAreas() === 'ambos' ? '<select class="busca sel" id="cli-area" aria-label="Área" style="max-width:190px"><option value="">Todas as áreas</option><option value="juridico">Jurídico</option><option value="contabil">Contabilidade</option></select>' : '') +
    '<select class="busca sel" id="cli-grupo" autocomplete="off"><option value="">Todos os grupos</option>' +
    E.grupos.map((g) => '<option value="' + g.id + '">' + esc(g.nome) + '</option>').join('') + '</select>' +
    '<input class="busca" id="cli-busca" placeholder="Buscar nome, grupo, responsável ou CPF/CNPJ" autocomplete="off">' +
    '<button class="btn btn-o" type="button" id="cli-relatorio" title="Lista filtrada com todos os campos, em tabela e CSV">⬇ Relatório</button>' +
    '</div><div id="cli-corpo"></div>';
  $('cli-tipo').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { C.tipo = b.dataset.v; pintarClientes(); } };
  $('cli-grupo').onchange = (ev) => { C.grupo = ev.target.value; pintarClientes(); };
  if ($('cli-area')) { $('cli-area').value = C.area || ''; $('cli-area').onchange = (ev) => { C.area = ev.target.value; pintarClientes(); }; }
  let t;
  $('cli-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { C.busca = ev.target.value; pintarClientes(); }, 250); };
  $('cli-relatorio').onclick = () => { const l = E.cli.ultima || [];
    relatorioTabela({ titulo: 'Clientes', ids: l.map((c) => c.id),
      colunas: ['Grupo', 'Nome', 'CPF/CNPJ', 'Área', 'Tipo', 'Responsável', 'E-mail', 'Telefone', 'Cidade/UF', 'Procuração', 'Certificado', 'CAPAG', 'Situação cadastral'],
      linhas: l.map((c) => [c.grupos ? c.grupos.nome : '', c.nome, mascaraDoc(c.cpf_cnpj), rotArea(c.area), c.tipo === 'Demanda' ? 'Serviço pontual' : c.tipo, c.responsavel, c.email, c.telefone,
        [c.cidade, c.estado].filter(Boolean).join('/'), c.procuracao === true ? 'Sim' : c.procuracao === false ? 'Não' : '', c.certificado === true ? 'Sim' : c.certificado === false ? 'Não' : '', c.capag, c.situacao_cadastral]) }); };
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
    if (C.area && (c.area || 'ambos') !== C.area && (c.area || 'ambos') !== 'ambos') return false;
    if (b && !(normalizar(c.nome + ' ' + (c.grupos ? c.grupos.nome : '') + ' ' + c.responsavel + ' ' + c.socio_admin).includes(b) ||
               (bd && soDigitos(c.cpf_cnpj).includes(bd)))) return false;
    return true;
  });
  C.ultima = lista;
  $('cli-conta').textContent = lista.length + ' de ' + E.clientes.length + ' cadastro(s) · clique na linha para ver os detalhes';
  $('cli-corpo').innerHTML = '<div class="card">' + (lista.length ?
    '<div class="tabela-wrap"><table class="ordenavel cli-tabela"><thead><tr><th class="sem-ordem" style="width:28px"></th><th>Grupo</th><th>Nome</th><th>CPF/CNPJ</th><th>Responsável</th>' +
    '<th>Procuração</th><th>Certificado</th><th>Situação</th></tr></thead><tbody>' +
    lista.map((c) => '<tr class="clicavel cli-linha" tabindex="0" aria-expanded="false" data-cli="' + c.id + '"><td class="cli-seta">▸</td>' +
      '<td class="cli-grupo" title="' + esc(c.grupos ? c.grupos.nome : '') + '">' + esc(c.grupos ? c.grupos.nome : '—') + '</td>' +
      '<td><b>' + esc(c.nome) + '</b> ' + pillArea(c.area) + (c.socio_admin ? '<div class="sub">' + esc(c.socio_admin) + '</div>' : '') + '</td>' +
      '<td class="mono">' + esc(mascaraDoc(c.cpf_cnpj) || '—') + '</td>' +
      '<td>' + pillPessoa(c.responsavel) + '</td><td>' + pillSimNao(c.procuracao) + '</td><td>' + pillSimNao(c.certificado) + '</td>' +
      '<td>' + pillSitCad(c.situacao_cadastral) + '</td></tr>').join('') +
    '</tbody></table></div>'
    : (E.clientes.length ? vazio('Nenhum cliente neste recorte — mude o filtro ou a busca.') : vazio('Nenhum cliente ainda. Cadastre o primeiro ou importe a Base de Dados em Administração.', '+ Novo cliente', '[data-novo=cliente]'))) + '</div>';
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
      lin('Tipo', esc(c.tipo === 'Demanda' ? 'Serviço pontual' : c.tipo)) + (!c.telefone && !c.email && !contatos.length ? '<div class="sub">Sem contato cadastrado.</div>' : '') + '</div>' +
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
      campo('Tipo', '<select name="tipo">' + [['Consultoria', 'Consultoria'], ['Demanda', 'Serviço pontual'], ['Inativo', 'Inativo']].map(([t, r]) => '<option value="' + t + '"' + (cl.tipo === t ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>') +
      campo('Área do cliente', '<select name="area">' + AREAS.filter(([v]) => minhasAreas() === 'ambos' || v === minhasAreas() || v === (cl.area || '')).map(([v, r]) =>
        '<option value="' + v + '"' + ((cl.area || (novo ? minhasAreas() : 'ambos')) === v ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>') +
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
  const apos = async () => { await carregarCadastros(true); if (depois) depois(); else await recarregar(); };
  const bc = j.querySelector('#btn-ctr-cli');
  if (bc) bc.onclick = () => { fecharJanela(j); formContrato({ cliente_id: cl.id }); };

  j.querySelector('#btn-salvar-cli').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.nome.value.trim()) throw new Error('Preencha o nome.');
    const num = (n) => { const t = f[n].value.trim(); if (!t) return null; const v = lerValor(t); if (isNaN(v)) throw new Error('Valor inválido em ' + n.toUpperCase().replace(/_/g, ' ') + '.'); return v; };
    const grupo_id = await grupoPorNome(f.grupo.value);
    const dados = {
      nome: f.nome.value.trim(), cpf_cnpj: soDigitos(f.cpf_cnpj.value), grupo_id, tipo: f.tipo.value, area: f.area.value,
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
    let id = cl.id;
    if (novo) id = (await q(sb.from('clientes').insert(dados).select('id').single())).id;
    else await q(sb.from('clientes').update(dados).eq('id', cl.id));
    aviso(novo ? '✓ Cliente cadastrado.' : '✓ Cadastro atualizado.');
    fecharJanela(j);
    await apos();
    // automação: empresa nova (ou CNPJ trocado) → consulta a Receita na hora e preenche razão social, endereço, situação…
    if (dados.cpf_cnpj.length === 14 && (novo || soDigitos(cl.cpf_cnpj) !== dados.cpf_cnpj)) consultarCnpjNovo(id, dados.nome);
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
    '<div class="titulo-pag"><div><h1>Contratos</h1><p>Consultoria mensal (fixo ou em salários mínimos) ou serviço pontual · os valores entram sozinhos em Honorários Jurídico</p></div>' +
    '<div class="acoes"><button class="btn btn-o" id="ctr-sm">Salário mínimo</button><button class="btn btn-p" data-novo="contrato">+ Novo contrato</button></div></div>' +
    '<div class="filtros"><div class="segmento" id="ctr-status">' + [['Ativo', 'Ativos'], ['Encerrado', 'Encerrados'], ['Cancelado', 'Cancelados'], ['todos', 'Todos']]
      .map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<input class="busca" id="ctr-busca" placeholder="Buscar cliente ou descrição" autocomplete="off"></div><div id="ctr-corpo"></div>';
  $('ctr-status').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.status = b.dataset.v; pintarContratos(true); } };
  let t;
  $('ctr-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; pintarContratos(false); }, 250); };
  ligarBotoesNovo($('conteudo'));
  $('ctr-sm').onclick = () => janelaSalarioMinimo();
  // garante a mensalidade do próximo mês mesmo sem o agendador do banco (uma vez por sessão)
  if (!E._mensalidadesOk) { E._mensalidadesOk = true; await sb.rpc('gerar_mensalidades').then(() => {}, () => {}); }
  await pintarContratos(true);
};

let _contratos = [];
async function pintarContratos(buscar) {
  const F = E.ctr;
  document.querySelectorAll('#ctr-status button').forEach((x) => x.classList.toggle('ativo', x.dataset.v === F.status));
  if (document.activeElement !== $('ctr-busca')) $('ctr-busca').value = F.busca;
  if (buscar) {
    let c = sb.from('contratos').select('*, clientes(nome, grupos(nome)), lancamentos(valor, pago, vencimento), documentos(id), exitos(id)').order('data_contrato', { ascending: false });
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
    '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Cliente</th><th>Contrato</th><th>Tipo</th><th data-tipo="data">Data</th><th class="num">Valor</th><th class="num">Recebido</th><th>Parcelas</th><th>Anexo</th><th>Situação</th></tr></thead><tbody>' +
    lista.map((c) => {
      const parc = c.lancamentos || [];
      const recebido = soma(parc.filter((p) => p.pago), (p) => p.valor);
      const atraso = parc.some((p) => !p.pago && p.vencimento < h);
      return '<tr class="clicavel" data-ctr="' + c.id + '"><td>' + esc(c.clientes ? c.clientes.nome : '—') +
        (c.clientes && c.clientes.grupos ? '<div class="sub">' + esc(c.clientes.grupos.nome) + '</div>' : '') + '</td>' +
        '<td>' + esc(c.descricao) + (c.percentual_exito ? '<div class="sub">+ ' + esc(String(c.percentual_exito).replace('.', ',')) + '% de êxito ' + ((c.exitos || []).length ? '<span class="pill pago">🏆 ' + c.exitos.length + ' registrado(s)</span>' : '<span class="pill neutro">aguardando o êxito</span>') + '</div>' : '') + '</td>' +
        '<td><span class="pill ' + (c.modalidade === 'consultoria' ? 'aberto' : 'neutro') + '">' + (c.modalidade === 'consultoria' ? 'Consultoria' : 'Pontual') + '</span></td>' +
        '<td class="mono" data-ord="' + c.data_contrato + '">' + dataBR(c.data_contrato) + (c.rescindido_em ? '<div class="sub">rescindido ' + dataBR(c.rescindido_em) + '</div>' : '') + '</td>' +
        '<td class="num mono" data-ord="' + (c.modalidade === 'consultoria' ? (c.valor_mensal || 0) : c.valor_total) + '">' + valorContratoTexto(c) + '</td>' +
        '<td class="num mono valor-rec" data-ord="' + recebido + '">' + brl(recebido) + '</td>' +
        '<td>' + parc.filter((p) => p.pago).length + '/' + parc.length + '</td>' +
        '<td>' + ((c.documentos || []).length ? '<span class="pill pago" title="Contrato anexado">📎 ' + c.documentos.length + '</span>' : '<span class="pill hoje" title="Anexe o contrato assinado no detalhe">sem anexo</span>') + '</td>' +
        '<td>' + (atraso ? '<span class="pill vencido">Parcela em atraso</span>' : '<span class="pill ' + (c.status === 'Ativo' ? 'aberto' : 'neutro') + '">' + esc(c.status) + '</span>') + '</td></tr>';
    }).join('') + '</tbody></table></div>'
    : vazio('Nenhum contrato' + (F.status !== 'todos' ? ' com essa situação' : '') + ' — cadastre um contrato e o sistema gera os lançamentos.', '+ Novo contrato', '[data-novo=contrato]')) + '</div>';
  $('ctr-corpo').querySelectorAll('[data-ctr]').forEach((tr) => tr.onclick = () => detalheContrato(tr.dataset.ctr));
}

// Êxito: base de cálculo (o "X" que a pessoa informa quando o êxito acontece)
const EXITO_BASES = [['economia', 'Economia obtida (redução da dívida)'], ['valor_recebido', 'Valor recebido pelo cliente'],
  ['valor_causa', 'Valor da causa / condenação'], ['outro', 'Outro valor (descrever)']];
const exitoBaseRot = (b) => (EXITO_BASES.find((x) => x[0] === b) || EXITO_BASES[3])[1];
const SM_ROT = (c) => String(c.qtd_salarios).replace('.', ',') + ' salário(s) mínimo(s)';
function valorContratoTexto(c) {
  if (c.modalidade !== 'consultoria') return brl(c.valor_total);
  return (c.forma_valor === 'salario_minimo' ? SM_ROT(c) : brl(c.valor_mensal)) + ' / mês';
}
function formContrato(ct) {
  ct = ct || {};
  const novo = !ct.id;
  if (novo && !E.clientes.length) {
    aviso('Cadastre um cliente antes de criar o contrato.', true);
    return formCliente();
  }
  const mod = ct.modalidade || 'consultoria', forma = ct.forma_valor || 'fixo';
  const j = abrirJanela({
    titulo: novo ? 'Novo contrato' : 'Editar contrato', larga: true,
    corpo:
      '<form id="f-ctr" class="grade">' +
      campo('Cliente <span class="obrig">*</span>', '<select name="cliente_id" required>' + opcoesClientes(ct.cliente_id).replace('— sem cliente —', 'Escolha o cliente') + '</select>', 'inteiro') +
      '<div class="inteiro"><div class="segmento seg-grande" id="ctr-mod">' + [['consultoria', 'Consultoria (mensal, recorrente)'], ['pontual', 'Serviço pontual (valor fechado)']]
        .map(([v, r]) => '<button type="button" data-v="' + v + '"' + (mod === v ? ' class="ativo"' : '') + (novo ? '' : ' disabled') + '>' + r + '</button>').join('') + '</div></div>' +
      campo('Descrição do serviço <span class="obrig">*</span>', '<input name="descricao" required maxlength="200" placeholder="Ex.: Consultoria tributária mensal" value="' + esc(ct.descricao || '') + '">', 'inteiro') +
      campo('Data do contrato', '<input name="data_contrato" type="date" value="' + esc(ct.data_contrato || hojeISO()) + '">') +
      campo('% de êxito (se houver)', '<input name="percentual_exito" inputmode="decimal" placeholder="Ex.: 20" value="' + (ct.percentual_exito != null ? esc(String(ct.percentual_exito).replace('.', ',')) : '') + '">') +
      // êxito: sobre o quê e como foi combinado; só vira dinheiro quando acontecer (botão "Registrar êxito" no detalhe)
      '<div class="grade inteiro" id="ctr-exito">' +
      campo('O êxito é calculado sobre', '<select name="exito_base">' + EXITO_BASES.map(([v, r]) => '<option value="' + v + '"' + ((ct.exito_base || 'economia') === v ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>') +
      campo('Como foi combinado', '<input name="exito_regra" maxlength="300" placeholder="Ex.: 20% da redução da dívida na PGFN, pago em até 10 dias" value="' + esc(ct.exito_regra || '') + '">') +
      '<div class="dica inteiro">O êxito <b>não entra no financeiro agora</b>. Quando acontecer, abra o contrato e clique em <b>🏆 Registrar êxito</b>: você informa o valor (ex.: quanto a dívida reduziu) e o sistema lança o % em Honorários Jurídico.</div></div>' +
      // consultoria
      '<div class="grade inteiro" id="ctr-rec">' +
      '<div class="inteiro"><div class="segmento" id="ctr-forma">' + [['fixo', 'Valor fixo'], ['salario_minimo', 'Em salários mínimos']]
        .map(([v, r]) => '<button type="button" data-v="' + v + '"' + (forma === v ? ' class="ativo"' : '') + '>' + r + '</button>').join('') + '</div></div>' +
      campo('<span id="rot-valor-mensal">Valor mensal (R$)</span>', '<input name="valor_mensal" inputmode="decimal" placeholder="4.000,00" value="' + (ct.valor_mensal ? valorParaCampo(ct.valor_mensal) : '') + '">') +
      campo('Quantos salários mínimos', '<input name="qtd_salarios" inputmode="decimal" placeholder="1" value="' + (ct.qtd_salarios != null ? esc(String(ct.qtd_salarios).replace('.', ',')) : '') + '">') +
      campo('1ª competência (mês de início)', '<input name="inicio_competencia" type="month" value="' + esc((ct.inicio_competencia || hojeISO()).slice(0, 7)) + '">') +
      campo('Dia do vencimento (mês seguinte)', '<input name="dia_vencimento" type="number" min="1" max="28" value="' + (ct.dia_vencimento || 10) + '">') +
      '<div class="dica inteiro" id="ctr-previa-rec"></div></div>' +
      // serviço pontual
      '<div class="grade inteiro" id="ctr-pont">' +
      (novo
        ? campo('Valor total (R$)', '<input name="valor_total" inputmode="decimal" placeholder="0,00">') +
          campo('Nº de parcelas', '<input name="num_parcelas" type="number" min="1" max="120" value="1">') +
          campo('1º vencimento', '<input name="primeiro_vencimento" type="date" value="' + somarDias(hojeISO(), 30) + '">') +
          '<div class="dica inteiro" id="ctr-previa">Informe o valor para ver as parcelas.</div>'
        : '<div class="dica inteiro">Valor e parcelas já foram lançados em Honorários Jurídico. Para ajustar uma parcela, use o botão Editar dela.</div>') + '</div>' +
      (novo ? '' : campo('Situação', '<select name="status">' + ['Ativo', 'Encerrado', 'Cancelado'].map((st) => '<option' + (ct.status === st ? ' selected' : '') + '>' + st + '</option>').join('') + '</select>')) +
      campo('Observação', '<textarea name="obs" maxlength="2000">' + esc(ct.obs || '') + '</textarea>', 'inteiro') +
      '<div class="dica inteiro">Depois de salvar, anexe o contrato assinado no detalhe do contrato (Documentos do contrato).</div>' +
      '</form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button>' +
      '<button class="btn btn-p" id="btn-salvar-ctr" type="button">' + (novo ? 'Criar contrato' : 'Salvar') + '</button></div>'
  });
  const f = j.querySelector('#f-ctr');
  let modalidade = mod, formaValor = forma, sm = [];
  q(sb.from('salarios_minimos').select('*').order('ano', { ascending: false })).then((x) => { sm = x; previaRec(); }).catch(() => {});
  const previaRec = () => {
    const el = j.querySelector('#ctr-previa-rec'); if (!el) return;
    const ano = Number((f.inicio_competencia.value || hojeISO()).slice(0, 4)), s0 = sm.find((x) => x.ano <= ano);
    const v = formaValor === 'salario_minimo' ? (lerValor(f.qtd_salarios.value) || 0) * (s0 ? Number(s0.valor) : 0) : lerValor(f.valor_mensal.value) || 0;
    el.innerHTML = 'Todo mês entra um lançamento em Honorários Jurídico (competência do mês, vencimento dia <b>' + (Number(f.dia_vencimento.value) || 10) + '</b> do mês seguinte) de <b class="mono">' + brl(v) + '</b>' +
      (formaValor === 'salario_minimo' ? ' (salário mínimo de ' + (s0 ? s0.ano + ': ' + brl(s0.valor) : '—') + '). Quando o salário mínimo do ano seguinte for cadastrado, as mensalidades daquele ano são reajustadas sozinhas' : '') +
      '. Continua até a rescisão.';
  };
  const mostrar = () => {
    j.querySelectorAll('#ctr-mod button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === modalidade));
    j.querySelectorAll('#ctr-forma button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === formaValor));
    j.querySelector('#ctr-rec').classList.toggle('escondido', modalidade !== 'consultoria');
    j.querySelector('#ctr-pont').classList.toggle('escondido', modalidade === 'consultoria');
    f.valor_mensal.closest('.campo').classList.toggle('escondido', formaValor !== 'fixo');
    f.qtd_salarios.closest('.campo').classList.toggle('escondido', formaValor !== 'salario_minimo');
    previaRec();
  };
  j.querySelector('#ctr-mod').onclick = (ev) => { const b = ev.target.closest('button'); if (b && !b.disabled) { modalidade = b.dataset.v; mostrar(); } };
  j.querySelector('#ctr-forma').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { formaValor = b.dataset.v; mostrar(); } };
  ['input', 'change'].forEach((ev) => f.addEventListener(ev, previaRec));
  const mostrarExito = () => j.querySelector('#ctr-exito').classList.toggle('escondido', !(lerValor(f.percentual_exito.value) > 0));
  f.percentual_exito.addEventListener('input', mostrarExito); mostrarExito();
  mostrar();
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
    const cli = E.clientes.find((c) => c.id === f.cliente_id.value);
    const dados = { cliente_id: f.cliente_id.value, descricao: f.descricao.value.trim(), modalidade,
      data_contrato: f.data_contrato.value || hojeISO(), percentual_exito: exito, obs: f.obs.value.trim(),
      exito_base: exito ? f.exito_base.value : null, exito_regra: exito ? f.exito_regra.value.trim() : '', responsavel: ct.responsavel || (cli && cli.responsavel) || '' };
    if (modalidade === 'consultoria') {
      const vm = formaValor === 'fixo' ? lerValor(f.valor_mensal.value) : null, qs = formaValor === 'salario_minimo' ? lerValor(f.qtd_salarios.value) : null;
      if (formaValor === 'fixo' && !(vm > 0)) throw new Error('Informe o valor mensal (ex.: 4.000,00).');
      if (formaValor === 'salario_minimo' && !(qs > 0)) throw new Error('Informe quantos salários mínimos (ex.: 1 ou 0,7).');
      const dia = Number(f.dia_vencimento.value) || 10;
      if (dia < 1 || dia > 28) throw new Error('Dia do vencimento entre 1 e 28.');
      if (!f.inicio_competencia.value) throw new Error('Informe o mês de início.');
      Object.assign(dados, { forma_valor: formaValor, valor_mensal: vm, qtd_salarios: qs, dia_vencimento: dia, inicio_competencia: f.inicio_competencia.value + '-01', valor_total: 0, num_parcelas: 1 });
    }
    if (novo) {
      if (modalidade === 'pontual') {
        const v = f.valor_total.value.trim() ? lerValor(f.valor_total.value) : 0;
        if (isNaN(v) || v < 0) throw new Error('Valor total inválido (ex.: 12.000,00).');
        const n = Number(f.num_parcelas.value) || 1;
        if (n < 1 || n > 120) throw new Error('Nº de parcelas deve ficar entre 1 e 120.');
        if (v > 0 && !f.primeiro_vencimento.value) throw new Error('Informe o 1º vencimento.');
        Object.assign(dados, { valor_total: v, num_parcelas: n, primeiro_vencimento: v > 0 ? f.primeiro_vencimento.value : null });
      }
      const criado = await q(sb.from('contratos').insert(dados).select().single());
      if (modalidade === 'pontual' && dados.valor_total > 0 && cli) await q(sb.from('lancamentos').update({ grupo_id: cli.grupo_id, responsavel: cli.responsavel || '' }).eq('contrato_id', criado.id));
      aviso(modalidade === 'consultoria' ? '✓ Contrato de consultoria criado: mensalidades lançadas em Honorários Jurídico.' :
        dados.valor_total > 0 ? '✓ Contrato criado e ' + dados.num_parcelas + ' parcela(s) lançada(s) em Honorários Jurídico.' : '✓ Contrato criado.');
    } else {
      dados.status = f.status.value;
      await q(sb.from('contratos').update(dados).eq('id', ct.id));
      aviso('✓ Contrato atualizado' + (modalidade === 'consultoria' ? ' (mensalidades em aberto reajustadas).' : '.'));
    }
    fecharJanela(j);
    if (!novo) fecharJanela();
    await recarregar();
  });
}

// rescisão: cobra até a competência do mês anterior ao da rescisão
function formRescisao(ct, depois) {
  const j = abrirJanela({ titulo: 'Rescindir contrato — ' + ct.descricao,
    corpo: '<form class="grade" id="f-resc">' + campo('Data da rescisão', '<input name="data" type="date" value="' + hojeISO() + '">', 'inteiro') +
      '<div class="dica inteiro" id="resc-previa"></div></form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-x" type="button" id="btn-rescindir">Rescindir</button></div>' });
  const f = j.querySelector('#f-resc');
  const previa = () => {
    const d = f.data.value; if (!d) return;
    const ult = new Date(d.slice(0, 7) + '-15T12:00:00'); ult.setMonth(ult.getMonth() - 1);
    j.querySelector('#resc-previa').innerHTML = 'Última mensalidade: competência <b>' + String(ult.getMonth() + 1).padStart(2, '0') + '/' + ult.getFullYear() + '</b> (paga em ' + d.slice(5, 7) + '/' + d.slice(0, 4) +
      '). As mensalidades em aberto de competências a partir de ' + d.slice(5, 7) + '/' + d.slice(0, 4) + ' são apagadas; as já pagas ficam.';
  };
  f.data.onchange = previa; previa();
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-rescindir').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.data.value) throw new Error('Informe a data da rescisão.');
    await q(sb.from('contratos').update({ rescindido_em: f.data.value, status: 'Encerrado' }).eq('id', ct.id));
    aviso('✓ Contrato rescindido.'); fecharJanela(j); if (depois) await depois();
  });
}

// Salário mínimo por ano (base dos contratos indexados)
async function janelaSalarioMinimo() {
  const sm = await q(sb.from('salarios_minimos').select('*').order('ano', { ascending: false }));
  const admin = E.perfil && E.perfil.papel === 'admin';
  const j = abrirJanela({ titulo: 'Salário mínimo por ano',
    corpo: '<p class="sub" style="margin-bottom:10px">Os contratos em salários mínimos usam o valor do ano da competência. Ao cadastrar o valor de um ano novo, as mensalidades em aberto daquele ano são reajustadas sozinhas.</p>' +
      '<div class="lista-ficha">' + sm.map((x) => '<div class="item-ficha"><b>' + x.ano + '</b><span class="mono">' + brl(x.valor) + '</span></div>').join('') + '</div>' +
      (admin ? '<form class="grade" id="f-sm" style="margin-top:12px">' + campo('Ano', '<input name="ano" type="number" value="' + (new Date().getFullYear() + 1) + '">') + campo('Valor (R$)', '<input name="valor" inputmode="decimal" placeholder="0,00">') + '</form>' : '<p class="sub" style="margin-top:10px">Só o administrador cadastra.</p>'),
    rodape: admin ? '<span></span><button class="btn btn-p" type="button" id="btn-sm">Salvar</button>' : '' });
  const b = j.querySelector('#btn-sm');
  if (b) b.onclick = () => comBotao(b, async () => {
    const f = j.querySelector('#f-sm'), ano = Number(f.ano.value), valor = lerValor(f.valor.value);
    if (!(ano > 2000) || !(valor > 0)) throw new Error('Informe o ano e o valor.');
    await q(sb.from('salarios_minimos').upsert({ ano, valor }, { onConflict: 'ano' }));
    aviso('✓ Salário mínimo de ' + ano + ' salvo: mensalidades reajustadas.'); fecharJanela(j); janelaSalarioMinimo();
  });
}

async function detalheContrato(id) {
  const ct = await q(sb.from('contratos').select('*, clientes(nome, grupo_id, responsavel)').eq('id', id).single());
  const [parc, exitos] = await Promise.all([q(sb.from('lancamentos').select('*').eq('contrato_id', id).order('vencimento')),
    ct.percentual_exito ? q(sb.from('exitos').select('*').eq('contrato_id', id).order('data')).catch(() => []) : []]);
  const recebido = soma(parc.filter((p) => p.pago), (p) => p.valor);
  const total = soma(parc, (p) => p.valor);
  const j = abrirJanela({
    titulo: ct.descricao, larga: true,
    corpo:
      '<div class="kpis" style="margin-bottom:12px">' +
      kpi('Cliente', '<span style="font-family:var(--font-d);font-size:16px">' + esc(ct.clientes ? ct.clientes.nome : '—') + '</span>', '', 'Contrato de ' + dataBR(ct.data_contrato)) +
      (ct.modalidade === 'consultoria' ? kpi('Consultoria mensal', valorContratoTexto(ct), '', ct.rescindido_em ? 'rescindido em ' + dataBR(ct.rescindido_em) : 'vence dia ' + ct.dia_vencimento + ' do mês seguinte · até a rescisão') : '') +
      kpi('Recebido', brl(recebido), 'verde', parc.filter((p) => p.pago).length + ' de ' + parc.length + ' parcela(s)') +
      kpi('Falta receber', brl(total - recebido), 'ambar', ct.percentual_exito ? '+ ' + String(ct.percentual_exito).replace('.', ',') + '% de êxito' : ct.status) +
      '</div>' +
      (ct.obs ? '<div class="dica" style="margin-bottom:12px">' + esc(ct.obs) + '</div>' : '') +
      '<div class="card" style="margin:0">' + tabelaLancamentos(parc, { compacta: true }) + '</div>' +
      '<div style="margin-top:10px"><button class="btn btn-o btn-mini" id="ctr-add-parc">+ Lançar valor avulso neste contrato</button></div>' +
      (ct.percentual_exito ? blocoExito(ct, exitos) : '') +
      '<div class="card" style="margin:14px 0 0"><div class="card-bd" id="ctr-docs"></div></div>',
    rodape:
      (E.perfil.papel === 'admin' ? '<button class="btn btn-x" id="btn-excluir-ctr" type="button">Excluir contrato</button>' : '<span></span>') +
      '<div class="acoes">' + (ct.modalidade === 'consultoria' && !ct.rescindido_em ? '<button class="btn btn-x" id="btn-rescindir-ctr" type="button">Rescindir</button>' : '') +
      '<button class="btn btn-o" id="btn-editar-ctr" type="button">Editar contrato</button></div>'
  });
  const reabrir = async () => { fecharJanela(j); await detalheContrato(id); };
  ligarAcoesLancamentos(j, reabrir);
  blocoDocumentos(j.querySelector('#ctr-docs'), { contrato_id: id, cliente_id: ct.cliente_id, grupo_id: ct.clientes && ct.clientes.grupo_id, tipo: 'contrato' },
    { titulo: 'Documentos do contrato', vazio: 'Nenhum documento. Envie aqui o contrato assinado, a proposta e os aditivos.' }).catch((e) => console.error(e));
  j.querySelector('#btn-editar-ctr').onclick = () => formContrato(ct);
  const br = j.querySelector('#btn-rescindir-ctr'); if (br) br.onclick = () => formRescisao(ct, reabrir);
  const be = j.querySelector('#ctr-exito-reg'); if (be) be.onclick = () => formExito(ct, reabrir);
  j.querySelector('#ctr-add-parc').onclick = () => {
    formLancamento({ tipo: 'receita', empresa: 'escritorio', cliente_id: ct.cliente_id, contrato_id: id,
                     grupo_id: ct.clientes && ct.clientes.grupo_id, responsavel: ct.clientes && ct.clientes.responsavel,
                     descricao: ct.descricao + ' — avulso' }, reabrir);
  };
  const bx = j.querySelector('#btn-excluir-ctr');
  if (bx) bx.onclick = () => comBotao(bx, async () => {
    if (!confirm('Excluir o contrato e TODAS as parcelas dele? Esta ação não pode ser desfeita.')) return;
    await excluir('contratos', id);
    aviso('Contrato excluído.'); fecharJanela(j); await recarregar();
  });
}

// ─────────── êxito: regra combinada + registros (só vira lançamento quando acontece) ───────────
function blocoExito(ct, exitos) {
  const pct = String(ct.percentual_exito).replace('.', ',');
  return '<div class="card exito-card" style="margin:14px 0 0"><div class="card-hd">🏆 Êxito<span class="pill ' + (exitos.length ? 'pago' : 'neutro') + '">' +
      (exitos.length ? exitos.length + ' registrado(s) · ' + brl(soma(exitos, (x) => x.valor)) : 'aguardando o êxito') + '</span>' +
      (pode('contratos', 'editar') ? '<button class="btn btn-p btn-mini" id="ctr-exito-reg" style="margin-left:auto">🏆 Registrar êxito</button>' : '') + '</div>' +
    '<div class="card-bd"><div class="dica"><b>' + pct + '%</b> sobre ' + esc(exitoBaseRot(ct.exito_base).toLowerCase()) + (ct.exito_regra ? ' — ' + esc(ct.exito_regra) : '') +
      '. Só entra no financeiro quando o êxito acontecer.</div>' +
    (exitos.length ? '<div class="tabela-wrap" style="margin-top:10px"><table><thead><tr><th>Data</th><th>O que aconteceu</th><th class="num">Base (X)</th><th class="num">Honorário</th></tr></thead><tbody>' +
      exitos.map((x) => '<tr><td class="mono">' + dataBR(x.data) + '</td><td>' + esc(x.descricao) + '</td><td class="num mono">' + brl(x.base_valor) + '</td><td class="num mono valor-rec">' +
        brl(x.valor) + '<div class="sub">' + String(x.percentual).replace('.', ',') + '% de X</div></td></tr>').join('') + '</tbody></table></div>' : '') + '</div></div>';
}
function formExito(ct, depois) {
  const pct = Number(ct.percentual_exito) || 0;
  const j = abrirJanela({ titulo: 'Registrar êxito — ' + ct.descricao,
    corpo: '<form class="grade" id="f-exito">' +
      '<div class="dica inteiro">Combinado: <b>' + String(pct).replace('.', ',') + '%</b> sobre ' + esc(exitoBaseRot(ct.exito_base).toLowerCase()) + (ct.exito_regra ? ' — ' + esc(ct.exito_regra) : '') + '</div>' +
      campo('X = ' + esc(exitoBaseRot(ct.exito_base)) + ' (R$)', '<input name="base" inputmode="decimal" placeholder="Ex.: 150.000,00" required>', 'inteiro') +
      campo('O que aconteceu', '<input name="descricao" maxlength="200" placeholder="Ex.: Transação na PGFN reduziu a dívida de 500 mil para 350 mil">', 'inteiro') +
      campo('Data do êxito', '<input name="data" type="date" value="' + hojeISO() + '">') +
      campo('Vencimento do honorário', '<input name="vencimento" type="date" value="' + somarDias(hojeISO(), 10) + '">') +
      '<div class="exito-previa inteiro" id="exito-previa"></div></form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-exito">Lançar no financeiro</button></div>' });
  const f = j.querySelector('#f-exito');
  const previa = () => {
    const x = lerValor(f.base.value) || 0, v = Math.round(x * pct) / 100;
    j.querySelector('#exito-previa').innerHTML = '<span>' + String(pct).replace('.', ',') + '% × ' + brl(x) + ' =</span><b class="mono">' + brl(v) + '</b><span class="sub">vai para Honorários Jurídico com vencimento em ' + dataBR(f.vencimento.value) + '</span>';
  };
  f.addEventListener('input', previa); previa();
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-exito').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const x = lerValor(f.base.value);
    if (!(x > 0)) throw new Error('Informe o valor X (ex.: quanto a dívida reduziu).');
    if (!f.data.value || !f.vencimento.value) throw new Error('Informe as datas.');
    await q(sb.rpc('registrar_exito', { p_contrato: ct.id, p_base: x, p_data: f.data.value, p_vencimento: f.vencimento.value, p_descricao: f.descricao.value.trim() }));
    aviso('✓ Êxito registrado: ' + brl(Math.round(x * pct) / 100) + ' lançado em Honorários Jurídico.');
    fecharJanela(j); if (depois) await depois();
  });
}
