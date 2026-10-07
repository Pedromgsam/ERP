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
  E.cli = E.cli || { tipo: 'ativos', grupo: '', busca: '', area: '', visao: 'grupo' };
  await carregarCadastros();
  const C = E.cli;
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Clientes</h1><p id="cli-conta"></p></div>' +
    '<div class="acoes"><button class="btn btn-o" id="cli-email-lote" title="Marcar vários clientes de uma vez: recebem ou não os e-mails do escritório">✉ Recebe e-mails…</button><button class="btn btn-p" data-novo="cliente">+ Novo cliente</button></div></div>' +
    '<div class="filtros">' +
    '<div class="segmento" id="cli-visao" title="Como mostrar a lista">' + [['grupo', 'Por grupo'], ['lista', 'Lista']].map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<div class="segmento" id="cli-tipo">' + [['ativos', 'Ativos'], ['Consultoria', 'Consultoria'], ['Demanda', 'Serviço pontual'], ['Inativo', 'Inativos'], ['todos', 'Todos']]
      .map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    // Backup 40: área em botões, como Ativos/Consultoria
    (minhasAreas() === 'ambos' ? '<div class="segmento" id="cli-area" aria-label="Área">' + [['', 'Todas as áreas'], ['juridico', 'Jurídico'], ['contabil', 'Contabilidade']].map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' : '') +
    '<select class="busca sel" id="cli-grupo" autocomplete="off"><option value="">Todos os grupos</option>' +
    E.grupos.map((g) => '<option value="' + g.id + '">' + esc(g.nome) + '</option>').join('') + '</select>' +
    '<input class="busca" id="cli-busca" placeholder="Buscar nome, grupo, responsável ou CPF/CNPJ" autocomplete="off">' +
    '</div><div id="cli-corpo"></div>';
  $('cli-tipo').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { C.tipo = b.dataset.v; pintarClientes(); } };
  $('cli-visao').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { C.visao = b.dataset.v; pintarClientes(); } };
  $('cli-grupo').onchange = (ev) => { C.grupo = ev.target.value; pintarClientes(); };
  if ($('cli-area')) $('cli-area').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { C.area = b.dataset.v; pintarClientes(); } };
  let t;
  $('cli-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { C.busca = ev.target.value; pintarClientes(); }, 250); };
  ligarBotoesNovo($('conteudo'));
  $('cli-email-lote').onclick = () => janelaRecebeEmailLote(C.ultima || E.clientes);
  pintarClientes();
};
// Backup 49: a chave única "Recebe e-mails do escritório" (Sim/Não) — um clique na linha ou vários de uma vez
function pillRecebeEmail(c) {
  const on = c.recebe_email !== false;
  return '<button type="button" class="pill cli-email ' + (on ? 'pago' : 'neutro') + '" data-cli-email="' + c.id + '" title="' + (on ? 'Recebe os e-mails do escritório — clique para NÃO receber' : 'NÃO recebe e-mails — clique para voltar a receber') + '">' + (on ? '✉ Sim' : '✕ Não') + '</button>';
}
async function trocarRecebeEmail(ids, recebe) {
  await q(sb.rpc('clientes_recebe_email', { p_ids: ids, p_recebe: recebe }));
  E.clientes.forEach((c) => { if (ids.includes(c.id)) c.recebe_email = recebe; });
  aviso('✓ ' + plural(ids.length, 'cliente', 'clientes') + (recebe ? ' passa(m) a receber e-mails.' : ' não recebe(m) mais e-mails.'));
}
function janelaRecebeEmailLote(lista) {
  const j = abrirJanela({ titulo: '✉ Quem recebe os e-mails do escritório', larga: true,
    corpo: '<p class="sub" style="margin-bottom:10px">Marque os clientes e escolha <b>Recebem</b> ou <b>Não recebem</b>. Quem está em "Não" não recebe nada: lembretes, cobranças, guias, acordos, recibos e convites.</p>' +
      '<label class="check" style="margin-bottom:6px"><input type="checkbox" id="rel-todos"> <b>Marcar todos (' + lista.length + ')</b></label>' +
      '<div class="lista-grupos" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:4px 12px;max-height:380px;overflow-y:auto;border:1px solid var(--border-strong);border-radius:var(--r-sm);padding:10px">' +
      lista.map((c) => '<label class="check"><input type="checkbox" value="' + c.id + '"> ' + esc(c.nome) + ' <span class="sub">' + (c.recebe_email === false ? '✕ não recebe' : '✉ recebe') + '</span></label>').join('') + '</div>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-o" type="button" id="rel-nao">✕ Não recebem</button><button class="btn btn-p" type="button" id="rel-sim">✉ Recebem</button></div>' });
  j.querySelector('#rel-todos').onchange = (ev) => j.querySelectorAll('.lista-grupos input').forEach((i) => { i.checked = ev.target.checked; });
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  const ir = (recebe) => (ev) => comBotao(ev.currentTarget, async () => {
    const ids = [...j.querySelectorAll('.lista-grupos input:checked')].map((i) => i.value);
    if (!ids.length) { aviso('Marque ao menos um cliente.', true); return; }
    await trocarRecebeEmail(ids, recebe); fecharJanela(j); pintarClientes();
  });
  j.querySelector('#rel-sim').onclick = ir(true); j.querySelector('#rel-nao').onclick = ir(false);
}

function pintarClientes() {
  const C = E.cli, b = normalizar(C.busca), bd = soDigitos(C.busca);
  document.querySelectorAll('#cli-tipo button').forEach((x) => x.classList.toggle('ativo', x.dataset.v === C.tipo));
  document.querySelectorAll('#cli-visao button').forEach((x) => x.classList.toggle('ativo', x.dataset.v === (C.visao || 'grupo')));
  document.querySelectorAll('#cli-area button').forEach((x) => x.classList.toggle('ativo', x.dataset.v === (C.area || '')));
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
  // "Por grupo" (padrão): ordem grupo → nome, com uma linha de título por grupo
  const porGrupo = (C.visao || 'grupo') === 'grupo';
  const gn = (c) => (c.grupos ? c.grupos.nome : '') || '';
  if (porGrupo) lista.sort((a, x) => (gn(a) || '\uffff').localeCompare(gn(x) || '\uffff', 'pt-BR') || String(a.nome).localeCompare(String(x.nome), 'pt-BR'));
  C.ultima = lista;
  $('cli-conta').textContent = lista.length + ' de ' + E.clientes.length + ' cadastro(s) · clique na linha para abrir a ficha completa';
  $('cli-corpo').innerHTML = '<div class="card">' + (lista.length ?
    '<div class="tabela-wrap"><table class="' + (porGrupo ? '' : 'ordenavel ') + 'cli-tabela"><thead><tr><th>Grupo</th><th>Nome</th><th>CPF/CNPJ</th><th>Área</th><th>Responsável</th>' +
    '<th>Procuração</th><th>Certificado</th><th>Situação</th><th title="Recebe os e-mails do escritório">E-mails</th></tr></thead><tbody>' +
    lista.map((c, i) => (porGrupo && (i === 0 || gn(lista[i - 1]) !== gn(c)) ? '<tr class="cli-grp"><td colspan="9">' + esc(gn(c) || 'Sem grupo') +
        ' <span class="sub">' + plural(lista.filter((x) => gn(x) === gn(c)).length, 'cadastro', 'cadastros') + '</span></td></tr>' : '') + '<tr class="clicavel cli-linha" tabindex="0" data-cli="' + c.id + '" title="Abrir a ficha completa">' +
      '<td class="cli-grupo" title="' + esc(c.grupos ? c.grupos.nome : '') + '">' + esc(c.grupos ? c.grupos.nome : '—') + '</td>' +
      '<td><span class="cli-nome">' + esc(c.nome) + '</span>' + (c.socio_admin ? '<div class="sub cli-socio">' + esc(c.socio_admin) + '</div>' : '') + '</td>' +
      '<td class="mono">' + esc(mascaraDoc(c.cpf_cnpj) || '—') + '</td>' +
      '<td>' + pillAreaCli(c.area) + '</td>' +
      '<td>' + pillPessoa(c.responsavel) + '</td><td>' + pillSimNao(c.procuracao) + '</td><td>' + pillSimNao(c.certificado) + '</td>' +
      '<td>' + pillSitCad(c.situacao_cadastral) + '</td><td>' + pillRecebeEmail(c) + '</td></tr>').join('') +
    '</tbody></table></div>'
    : (E.clientes.length ? vazio('Nenhum cliente neste recorte — mude o filtro ou a busca.') : vazio('Nenhum cliente ainda. Cadastre o primeiro ou importe a Base de Dados em Administração.', '+ Novo cliente', '[data-novo=cliente]'))) + '</div>';
  $('cli-corpo').querySelectorAll('[data-cli-email]').forEach((b) => b.onclick = (ev) => { ev.stopPropagation();
    const c = E.clientes.find((x) => x.id === b.dataset.cliEmail);
    comBotao(b, async () => { await trocarRecebeEmail([c.id], c.recebe_email === false); b.outerHTML = pillRecebeEmail(c); pintarClientes(); }); });
  $('cli-corpo').querySelectorAll('tr[data-cli]').forEach((tr) => {
    tr.onclick = () => abrirFicha(tr.dataset.cli);
    tr.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrirFicha(tr.dataset.cli); } };
  });
}

// Backup 28: coluna Área (Jurídico · Contábil · Jurídico e contábil)
function pillAreaCli(a) {
  a = a || 'ambos';
  return '<span class="pill area-' + a + '">' + (a === 'juridico' ? 'Jurídico' : a === 'contabil' ? 'Contábil' : 'Jurídico e contábil') + '</span>';
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
  return campo(rotulo, '<input name="' + nome + '" inputmode="decimal" data-mascara="brl" placeholder="R$ 0,00" value="' + (v == null || v === '' ? '' : 'R$ ' + esc(valorParaCampo(v))) + '">');
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
  // Backup 28: cadastro em abas, vários e-mails e telefones, CNPJ consultado enquanto digita, grupo existente ou novo
  const ABAS_CLI = [['id', '🏢 Empresa'], ['class', '🗂 Classificação'], ['contato', '📞 Contatos'], ['end', '📍 Endereço'], ['sit', '🏛 Situação e passivo'], ['obs', '📝 Observações']];
  const aba = (k, html) => '<div class="cli-aba grade g3 inteiro" data-aba="' + k + '"' + (k === 'id' ? '' : ' hidden') + '>' + html + '</div>';
  const setorOpc = (v) => SETORES_CONTATO.map(([k, r]) => '<option value="' + k + '"' + (k === (v || 'geral') ? ' selected' : '') + '>' + r + '</option>').join('');
  const linhaEmail = (v, principal) => '<div class="cli-lin cli-lin-email"><span class="cli-lin-ic" aria-hidden="true">✉</span><input ' + (principal ? 'name="email"' : 'data-extra="email"') + ' type="email" placeholder="nome@empresa.com.br" value="' + esc(v || '') + '">' +
    '<select data-setor>' + setorOpc(principal ? 'geral' : 'financeiro') + '</select>' + (principal ? '<span class="pill neutro" title="E-mail principal do cadastro">principal</span>' : '<button type="button" class="btn btn-o btn-mini" data-tirar title="Tirar">✕</button>') + '</div>';
  const linhaTel = (v, principal) => '<div class="cli-lin cli-lin-tel"><span class="cli-lin-ic" aria-hidden="true">📱</span><input ' + (principal ? 'name="telefone"' : 'data-extra="telefone"') + ' type="tel" data-mascara="tel" inputmode="tel" placeholder="(37) 9 9999-9999" value="' + esc(v || '') + '">' +
    '<select data-setor>' + setorOpc(principal ? 'geral' : 'financeiro') + '</select>' + (principal ? '<span class="pill neutro">principal</span>' : '<button type="button" class="btn btn-o btn-mini" data-tirar title="Tirar">✕</button>') + '</div>';
  const grupoAtual = cl.grupo_id || '';
  const j = abrirJanela({
    titulo: novo ? 'Novo cliente' : cl.nome, larga: true,
    corpo:
      '<form id="f-cli" class="grade g3 cli-form">' + resumo +
      '<div class="inteiro"><div class="segmento cli-abas" id="cli-abas" role="tablist">' + ABAS_CLI.map(([k, r], i) => '<button type="button" role="tab" data-cli-aba="' + k + '"' + (i ? '' : ' class="ativo"') + '>' + r + '</button>').join('') + '</div></div>' +
      aba('id',
        campo('CPF/CNPJ', '<div class="cli-doc"><input name="cpf_cnpj" inputmode="numeric" maxlength="18" placeholder="00.000.000/0000-00" value="' + esc(mascaraDoc(cl.cpf_cnpj)) + '">' +
          '<button type="button" class="btn btn-p" id="cli-buscar" title="Busca na Receita e preenche nome, endereço, situação, sócio, e-mail, telefone, tipo societário e regime">🔎 Buscar dados</button></div><div class="sub" id="cli-doc-aviso"></div>', 'dois') +
        campo('Nome / Razão social <span class="obrig">*</span>', '<input name="nome" required maxlength="200" value="' + esc(cl.nome || '') + '">', 'inteiro') +
        '<div class="inteiro" id="cli-cnpj-card"></div>' +
        campo('Tipo societário', selectOpcoes('tipo_societario', ['LTDA', 'S.A', 'MEI', 'EI', 'SLU', 'PF'], cl.tipo_societario)) +
        campo('Sócio-administrador', '<input name="socio_admin" value="' + esc(cl.socio_admin || '') + '">') +
        campo('Regime tributário', selectOpcoes('regime_tributario', ['PF', 'SN', 'LP', 'LR', 'BAIXADA'], cl.regime_tributario))) +
      aba('class',
        campo('Grupo', '<select name="grupo_sel"><option value="">— sem grupo —</option>' + E.grupos.map((g) => '<option value="' + g.id + '"' + (g.id === grupoAtual ? ' selected' : '') + '>' + esc(g.nome) + '</option>').join('') + '</select>' +
          '<label class="cli-chk"><input type="checkbox" name="grupo_novo"> É um grupo novo</label><input name="grupo" placeholder="Nome do grupo novo" hidden>') +
        campo('Tipo', '<select name="tipo">' + [['Consultoria', 'Consultoria'], ['Demanda', 'Serviço pontual'], ['Inativo', 'Inativo']].map(([t, r]) => '<option value="' + t + '"' + (cl.tipo === t ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>') +
        campo('Área do cliente', '<select name="area">' + AREAS.filter(([v]) => minhasAreas() === 'ambos' || v === minhasAreas() || v === (cl.area || '')).map(([v, r]) =>
          '<option value="' + v + '"' + ((cl.area || (novo ? minhasAreas() : 'ambos')) === v ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>') +
        campo('Responsável (quem cuida)', selectPessoa('responsavel', cl.responsavel || '', '— escolha —')) +
        campo('Origem', '<select name="origem">' + ['', ...ORIGENS_CLIENTE, ...(cl.origem && !ORIGENS_CLIENTE.includes(cl.origem) ? [cl.origem] : [])].map((o) =>
          '<option value="' + esc(o) + '"' + ((cl.origem || '') === o ? ' selected' : '') + '>' + (o ? esc(o) : '—') + '</option>').join('') + '</select>') +
        campo('Indicado por', '<input name="indicado_por" maxlength="200" placeholder="Quem indicou (quando a origem é Indicação)" value="' + esc(cl.indicado_por || '') + '">')) +
      aba('contato',
        '<div class="inteiro cli-bloco"><div class="cli-lista-tit"><span>E-mails</span><span class="sub">o principal é o do cadastro; os outros viram contatos do setor escolhido</span><button type="button" class="btn btn-o btn-mini" id="cli-mais-email">+ Adicionar e-mail</button></div><div id="cli-emails">' + linhaEmail(cl.email, true) + '</div></div>' +
        '<div class="inteiro cli-bloco"><div class="cli-lista-tit"><span>Telefones / WhatsApp</span><span class="sub">celular com 9 dígitos vira link de WhatsApp</span><button type="button" class="btn btn-o btn-mini" id="cli-mais-tel">+ Adicionar telefone</button></div><div id="cli-tels">' + linhaTel(cl.telefone, true) + '</div></div>' +
        // Backup 49: a chave única; o perfil detalhado fica em "Avançado"
        campo('✉ Recebe e-mails do escritório', '<select name="recebe_email"><option value="sim"' + (cl.recebe_email !== false ? ' selected' : '') + '>Sim</option><option value="nao"' + (cl.recebe_email === false ? ' selected' : '') + '>Não — não manda nada para este cliente</option></select>') +
        '<details class="inteiro cli-avancado"><summary>Avançado: quais e-mails automáticos</summary>' +
        campo('E-mails automáticos', '<select name="perfil_email" title="Quais e-mails automáticos este cliente recebe">' + PERFIS_EMAIL.map(([v, r]) =>
          '<option value="' + v + '"' + ((cl.perfil_email || 'padrao') === v ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>') + '</details>' +
        '<div class="dica dois">Os e-mails e telefones a mais viram <b>contatos</b> do cliente, com o setor escolhido (financeiro, fiscal, RH…): é por eles que o sistema sabe para quem mandar cobranças, guias e recibos (ficha → Contatos).</div>') +
      aba('end',
        campo('CEP', '<input name="cep" inputmode="numeric" maxlength="9" value="' + esc(cl.cep || '') + '">') +
        campo('Endereço', '<input name="endereco" value="' + esc(cl.endereco || '') + '">', 'dois') +
        campo('Cidade', '<input name="cidade" value="' + esc(cl.cidade || '') + '">') +
        campo('UF', '<input name="estado" maxlength="2" style="text-transform:uppercase" value="' + esc(cl.estado || '') + '">')) +
      aba('sit',
        campo('Em operação', selectSimNao('em_operacao', cl.em_operacao)) +
        campo('Procuração', selectSimNao('procuracao', cl.procuracao)) +
        campo('Certificado', selectSimNao('certificado', cl.certificado)) +
        campo('Cadastro regular', selectSimNao('cadastro_regular', cl.cadastro_regular)) +
        campo('CAPAG', selectOpcoes('capag', ['A', 'B', 'C', 'D', 'Omisso'], cl.capag)) +
        campo('Situação cadastral', selectOpcoes('situacao_cadastral', ['ATIVA', 'SUSPENSA', 'INAPTA', 'BAIXADA', 'NULA'], cl.situacao_cadastral)) +
        campoValor('RFB', 'rfb', cl.rfb) + campoValor('RFB negociada', 'rfb_negociada', cl.rfb_negociada) + campoValor('SEFAZ/MG', 'sefaz_mg', cl.sefaz_mg) +
        campoValor('PGFN', 'pgfn', cl.pgfn) + campoValor('PGFN negociada', 'pgfn_negociada', cl.pgfn_negociada) +
        campo('CEAT (TRT-3) — processos', '<input name="ceat_trt3" type="number" min="0" value="' + esc(cl.ceat_trt3 == null ? '' : cl.ceat_trt3) + '">') +
        campoValor('AGE/MG', 'age_mg', cl.age_mg) + campoValor('AGE/MG negociada', 'age_mg_negociada', cl.age_mg_negociada)) +
      aba('obs',
        campo('Observação interna', '<textarea name="obs" maxlength="4000">' + esc(cl.obs || '') + '</textarea>', 'inteiro') +
        (cl.historico_cadastral ? campo('Histórico cadastral', '<textarea name="historico_cadastral" maxlength="4000">' + esc(cl.historico_cadastral) + '</textarea>', 'inteiro') : '')) +
      '</form>',
    rodape:
      (!novo && E.perfil.papel === 'admin' ? '<button class="btn btn-x" id="btn-excluir-cli" type="button">Excluir</button>' : (novo ? '<label class="cli-chk"><input type="checkbox" id="cli-depois-ctr"> Depois de salvar, criar o contrato</label>' : '<span></span>')) +
      '<div class="acoes">' + (!novo ? '<button class="btn btn-o" type="button" id="btn-ctr-cli">+ Contrato</button>' : '') +
      '<button class="btn btn-o" type="button" data-cancelar>Cancelar</button>' +
      '<button class="btn btn-p" id="btn-salvar-cli" type="button">Salvar</button></div>'
  });
  const f = j.querySelector('#f-cli');
  const irAba = (k) => { j.querySelectorAll('[data-cli-aba]').forEach((b) => b.classList.toggle('ativo', b.dataset.cliAba === k)); j.querySelectorAll('.cli-aba').forEach((d) => { d.hidden = d.dataset.aba !== k; }); };
  j.querySelector('#cli-abas').onclick = (ev) => { const b = ev.target.closest('[data-cli-aba]'); if (b) irAba(b.dataset.cliAba); };
  f.grupo_novo.onchange = () => { f.grupo.hidden = !f.grupo_novo.checked; f.grupo_sel.disabled = f.grupo_novo.checked; if (f.grupo_novo.checked) f.grupo.focus(); };
  j.querySelector('#cli-mais-email').onclick = () => { j.querySelector('#cli-emails').insertAdjacentHTML('beforeend', linhaEmail('', false)); j.querySelector('#cli-emails').lastElementChild.querySelector('input').focus(); };
  j.querySelector('#cli-mais-tel').onclick = () => { j.querySelector('#cli-tels').insertAdjacentHTML('beforeend', linhaTel('', false)); j.querySelector('#cli-tels').lastElementChild.querySelector('input').focus(); };
  f.addEventListener('click', (ev) => { const b = ev.target.closest('[data-tirar]'); if (b) b.closest('.cli-lin').remove(); });
  // Backup 26: avisa na hora se o CPF/CNPJ já está cadastrado
  let repetidos = [], ultimoCnpj = '';
  const conferirDoc = async () => {
    const d = soDigitos(f.cpf_cnpj.value), el = j.querySelector('#cli-doc-aviso'); repetidos = [];
    if (d.length < 11) { el.innerHTML = ''; return; }
    repetidos = await q(sb.rpc('clientes_mesmo_documento', { p_doc: d, p_ignorar: cl.id || null })).catch(() => []);
    el.innerHTML = repetidos.length ? '<span class="pill vencido">já cadastrado</span> ' + repetidos.map((x) => esc(x.nome) + (x.grupo ? ' (' + esc(x.grupo) + ')' : '')).join(', ') : '';
  };
  // Backup 29: a busca é pelo botão "🔎 Buscar dados" (não sai sozinha ao digitar) e SOBRESCREVE o que veio do CNPJ anterior
  const TIPO_SOC = (nat, mei) => mei ? 'MEI' : /limitada/i.test(nat) ? (/unipessoal/i.test(nat) ? 'SLU' : 'LTDA') : /an[oô]nima/i.test(nat) ? 'S.A' : /empres[aá]rio/i.test(nat) ? 'EI' : '';
  const consultarNaHora = async (d) => {
    const card = j.querySelector('#cli-cnpj-card'); ultimoCnpj = d;
    card.innerHTML = '<div class="cli-cnpj carregando">🔎 Consultando o CNPJ na Receita…</div>';
    try {
      const r = await chamarFuncao('erp-cnpj', { acao: 'previa', cnpj: d });
      if (ultimoCnpj !== d || !card.isConnected) return;
      if (!r || !r.ok || !r.dados) { card.innerHTML = '<div class="cli-cnpj">' + esc((r && r.erro) || 'Não foi possível consultar agora.') + '</div>'; return; }
      const x = r.dados, adm = (x.socios || []).find((s2) => /administrador/i.test(s2.qualificacao)) || (x.socios || [])[0];
      const poe = (n, v) => { if (f[n]) f[n].value = v || ''; };
      poe('nome', x.razao_social || f.nome.value); poe('endereco', x.endereco); poe('cidade', x.cidade); poe('estado', x.estado); poe('cep', x.cep);
      poe('socio_admin', adm ? adm.nome : '');
      if (x.situacao_cadastral) f.situacao_cadastral.value = x.situacao_cadastral;
      const ts = TIPO_SOC(x.natureza_juridica || '', x.mei); if (ts && [...f.tipo_societario.options].some((o) => o.value === ts)) f.tipo_societario.value = ts;
      if (x.simples === true) f.regime_tributario.value = 'SN';
      if (x.email && !f.email.value.trim()) f.email.value = x.email;
      if (x.telefone && !f.telefone.value.trim()) { f.telefone.value = x.telefone; aplicarMascara(f.telefone, true); }
      card.innerHTML = '<div class="cli-cnpj ok"><b>✓ ' + esc(x.razao_social || '') + '</b>' + (x.nome_fantasia ? ' <span class="sub">(' + esc(x.nome_fantasia) + ')</span>' : '') +
        ' <span class="pill ' + (x.situacao_cadastral === 'ATIVA' ? 'pago' : 'vencido') + '">' + esc(x.situacao_cadastral || '—') + '</span>' +
        '<div class="sub">' + esc([x.natureza_juridica, x.cnae_principal, x.porte, x.simples === true ? 'Simples Nacional' : '', x.cidade && x.estado ? x.cidade + '/' + x.estado : ''].filter(Boolean).join(' · ')) + '</div>' +
        ((x.socios || []).length ? '<div class="sub">Sócios: ' + esc(x.socios.map((s2) => s2.nome + (s2.qualificacao ? ' (' + s2.qualificacao + ')' : '')).join(', ')) + '</div>' : '') +
        '<div class="sub">Preenchido com a Receita: nome, endereço, situação, sócio-administrador, tipo societário' + (x.simples === true ? ', regime' : '') + (x.email ? ', e-mail' : '') + (x.telefone ? ', telefone' : '') + '. Confira nas abas.</div></div>';
    } catch (e) { if (card.isConnected) card.innerHTML = '<div class="cli-cnpj">Consulta do CNPJ indisponível agora (' + esc(e.message) + '). Confira se a função erp-cnpj está publicada; ao salvar, a rotina tenta de novo.</div>'; }
  };
  f.cpf_cnpj.oninput = () => {
    const d = soDigitos(f.cpf_cnpj.value).slice(0, 14);
    f.cpf_cnpj.value = d.length > 11 ? d.replace(/^(\d{2})(\d{3})?(\d{3})?(\d{4})?(\d{0,2})?$/, (m, a, b, c, e, g) => a + (b ? '.' + b : '') + (c ? '.' + c : '') + (e ? '/' + e : '') + (g ? '-' + g : ''))
      : d.replace(/^(\d{3})(\d{3})?(\d{3})?(\d{0,2})?$/, (m, a, b, c, e) => a + (b ? '.' + b : '') + (c ? '.' + c : '') + (e ? '-' + e : ''));
    if (d.length === 14 || d.length === 11) conferirDoc();
    // CNPJ trocado: some o resultado da busca anterior (o sócio e o resto só voltam ao buscar de novo)
    if (ultimoCnpj && d !== ultimoCnpj) { j.querySelector('#cli-cnpj-card').innerHTML = '<div class="cli-cnpj">CNPJ alterado — clique em <b>🔎 Buscar dados</b> para trocar as informações.</div>'; }
  };
  j.querySelector('#cli-buscar').onclick = () => { const d = soDigitos(f.cpf_cnpj.value); if (d.length !== 14) return aviso('Digite o CNPJ completo (14 números) para buscar.', true); ultimoCnpj = ''; consultarNaHora(d); };
  f.cpf_cnpj.onblur = () => { f.cpf_cnpj.value = mascaraDoc(f.cpf_cnpj.value); conferirDoc(); };
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  const apos = async () => { await carregarCadastros(true); if (depois) depois(); else await recarregar(); };
  const bc = j.querySelector('#btn-ctr-cli');
  if (bc) bc.onclick = () => { fecharJanela(j); formContrato({ cliente_id: cl.id }); };

  j.querySelector('#btn-salvar-cli').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.nome.value.trim()) { irAba('id'); throw new Error('Preencha o nome.'); }
    if (f.grupo_novo.checked && !f.grupo.value.trim()) { irAba('class'); throw new Error('Escreva o nome do grupo novo (ou desmarque "É um grupo novo").'); }
    if (soDigitos(f.cpf_cnpj.value) !== soDigitos(cl.cpf_cnpj || '')) await conferirDoc();
    if (repetidos.length && !confirm('Já existe cliente com este CPF/CNPJ: ' + repetidos.map((x) => x.nome).join(', ') + '.\n\nCadastrar mesmo assim?')) return;
    const num = (n) => { const t = f[n].value.trim(); if (!t) return null; const v = lerValor(t); if (isNaN(v)) throw new Error('Valor inválido em ' + n.toUpperCase().replace(/_/g, ' ') + '.'); return v; };
    const grupo_id = f.grupo_novo.checked ? await grupoPorNome(f.grupo.value) : (f.grupo_sel.value || null);
    const dados = {
      nome: f.nome.value.trim(), cpf_cnpj: soDigitos(f.cpf_cnpj.value), grupo_id, tipo: f.tipo.value, area: f.area.value,
      responsavel: f.responsavel.value.trim(), socio_admin: f.socio_admin.value.trim(), tipo_societario: f.tipo_societario.value,
      em_operacao: lerSimNao(f.em_operacao.value), procuracao: lerSimNao(f.procuracao.value),
      certificado: lerSimNao(f.certificado.value), cadastro_regular: lerSimNao(f.cadastro_regular.value),
      capag: f.capag.value, regime_tributario: f.regime_tributario.value, situacao_cadastral: f.situacao_cadastral.value,
      rfb: num('rfb'), rfb_negociada: num('rfb_negociada'), pgfn: num('pgfn'), pgfn_negociada: num('pgfn_negociada'),
      age_mg: num('age_mg'), age_mg_negociada: num('age_mg_negociada'), sefaz_mg: num('sefaz_mg'),
      ceat_trt3: f.ceat_trt3.value === '' ? null : Number(f.ceat_trt3.value),
      email: f.email.value.trim(), telefone: f.telefone.value.trim(), endereco: f.endereco.value.trim(), perfil_email: f.perfil_email.value, recebe_email: f.recebe_email.value !== 'nao', cep: soDigitos(f.cep.value),
      cidade: f.cidade.value.trim(), estado: f.estado.value.trim().toUpperCase(), origem: f.origem.value.trim(), indicado_por: f.indicado_por.value.trim(),
      obs: f.obs.value.trim()
    };
    if (f.historico_cadastral) dados.historico_cadastral = f.historico_cadastral.value.trim();
    let id = cl.id;
    if (novo) id = (await q(sb.from('clientes').insert(dados).select('id').single())).id;
    else await q(sb.from('clientes').update(dados).eq('id', cl.id));
    // e-mails e telefones a mais → contatos do cliente, no setor escolhido
    const extras = [...j.querySelectorAll('[data-extra]')].filter((i) => i.value.trim()).map((i) => {
      const setor = i.closest('.cli-lin').querySelector('[data-setor]').value, rot = (SETORES_CONTATO.find((x) => x[0] === setor) || ['', ''])[1];
      return i.dataset.extra === 'email' ? { cliente_id: id, nome: rot, finalidade: setor, email: i.value.trim() } : { cliente_id: id, nome: rot, finalidade: setor, telefone: i.value.trim(), whatsapp: soDigitos(i.value).length === 11 };
    });
    if (extras.length) await q(sb.from('contatos').insert(extras).select('id')).catch((e) => aviso('Cadastro salvo, mas os contatos a mais não: ' + erroAmigavel(e), true));
    aviso(novo ? '✓ Cliente cadastrado.' + (extras.length ? ' ' + plural(extras.length, 'contato a mais', 'contatos a mais') + ' na ficha.' : '') : '✓ Cadastro atualizado.');
    const depoisCtr = novo && j.querySelector('#cli-depois-ctr') && j.querySelector('#cli-depois-ctr').checked;
    fecharJanela(j);
    await apos();
    // automação: empresa nova (ou CNPJ trocado) → consulta a Receita na hora e preenche razão social, endereço, situação…
    if (dados.cpf_cnpj.length === 14 && (novo || soDigitos(cl.cpf_cnpj) !== dados.cpf_cnpj)) consultarCnpjNovo(id, dados.nome);
    if (depoisCtr) formContrato({ cliente_id: id });
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
    '<div class="filtros"><div class="segmento" id="ctr-status">' + [['Ativo', 'Ativos'], ['Aguardando assinatura', 'Aguardando assinatura'], ['Encerrado', 'Encerrados'], ['Cancelado', 'Cancelados'], ['todos', 'Todos']]
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
    '<div class="tabela-wrap"><table class="ordenavel ctr-tab"><thead><tr><th>Cliente</th><th>Contrato</th><th>Tipo</th><th data-tipo="data">Data</th><th class="num">Valor</th><th class="num">Recebido</th><th>Financeiro</th><th>Situação</th></tr></thead><tbody>' +
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
        // Backup 39: sem as colunas Parcelas e Anexo (ficam no detalhe); Financeiro antes de Situação
        '<td>' + (atraso ? '<span class="pill vencido">Parcela em atraso</span>' : parc.length ? '<span class="pill pago">Em dia</span>' : '<span class="pill neutro">—</span>') + '</td>' +
        '<td>' + pillSituacaoCtr(c) + '</td></tr>';
    }).join('') + '</tbody></table></div>'
    : vazio('Nenhum contrato' + (F.status !== 'todos' ? ' com essa situação' : '') + ' — cadastre um contrato e o sistema gera os lançamentos.', '+ Novo contrato', '[data-novo=contrato]')) + '</div>';
  $('ctr-corpo').querySelectorAll('[data-ctr]').forEach((tr) => tr.onclick = () => detalheContrato(tr.dataset.ctr));
}

// Backup 28: situação do contrato (sem misturar com o financeiro, que tem coluna própria)
const SITUACOES_CTR = ['Ativo', 'Aguardando assinatura', 'Encerrado', 'Cancelado'];
function situacaoCtr(c) { return c.rescindido_em && c.status === 'Ativo' ? 'Rescindido' : c.status; }
function pillSituacaoCtr(c) {
  const s = situacaoCtr(c);
  return '<span class="pill ' + ({ Ativo: 'aberto', 'Aguardando assinatura': 'hoje', Cancelado: 'vencido', Rescindido: 'neutro' }[s] || 'neutro') + '">' + esc(s) + '</span>';
}
// Êxito: base de cálculo (o "X" que a pessoa informa quando o êxito acontece)
const EXITO_BASES = [['economia', 'Economia obtida (redução da dívida)'], ['valor_recebido', 'Valor recebido pelo cliente'],
  ['valor_causa', 'Valor da causa / condenação'], ['outro', 'Outro valor (descrever)']];
const exitoBaseRot = (b) => (EXITO_BASES.find((x) => x[0] === b) || EXITO_BASES[3])[1];
// Backup 22: "1,5 salários/mês" (mais curto; a forma "em salários mínimos" já aparece no contrato)
const SM_ROT = (c) => String(c.qtd_salarios).replace('.', ',') + (Number(c.qtd_salarios) === 1 ? ' salário' : ' salários');
function valorContratoTexto(c) {
  if (c.modalidade !== 'consultoria') return brl(c.valor_total);
  return (c.forma_valor === 'salario_minimo' ? SM_ROT(c) : brl(c.valor_mensal)) + '/mês';
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
      campo('Cliente <span class="obrig">*</span>', '<div class="ctr-cli"><select name="cliente_id" required>' + opcoesClientes(ct.cliente_id).replace('— sem cliente —', 'Escolha o cliente') + '</select>' +
        '<button type="button" class="btn btn-o btn-mini" id="ctr-novo-cli" title="Cadastrar o cliente sem sair do contrato">+ Novo cliente</button></div>', 'inteiro') +
      '<div class="inteiro"><div class="segmento seg-grande" id="ctr-mod">' + [['consultoria', 'Consultoria (mensal, recorrente)'], ['pontual', 'Serviço pontual (valor fechado)']]
        .map(([v, r]) => '<button type="button" data-v="' + v + '"' + (mod === v ? ' class="ativo"' : '') + (novo ? '' : ' disabled') + '>' + r + '</button>').join('') + '</div></div>' +
      campo('Descrição do serviço <span class="obrig">*</span>', '<input name="descricao" required maxlength="200" placeholder="Ex.: Consultoria tributária mensal" value="' + esc(ct.descricao || '') + '">', 'inteiro') +
      campo('Área do serviço', selectServico(ct.servico || '')) +
      campo('Data em que fechou', '<input name="data_contrato" type="date" value="' + esc(ct.data_contrato || hojeISO()) + '">') +
      campo('Início da vigência', '<input name="inicio_vigencia" type="date" value="' + esc(ct.inicio_vigencia || ct.inicio_competencia || somarDias(iso(fimDoMes(new Date())), 1)) + '">') +
      campo('Quem fechou', selectPessoa('fechado_por', ct.fechado_por || (novo && E.perfil ? E.perfil.nome : ''), '— escolha —')) +
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
      (novo ? '<div class="inteiro"><div class="segmento" id="ctr-assin">' + [['Ativo', '✓ Já está assinado (lança o financeiro agora)'], ['Aguardando assinatura', '⏳ Aguardando assinatura (lança só quando assinar)']]
          .map(([v, r], i) => '<button type="button" data-v="' + v + '"' + (i === 0 ? ' class="ativo"' : '') + '>' + r + '</button>').join('') + '</div></div>'
        : campo('Situação', '<select name="status">' + SITUACOES_CTR
          .map((st) => '<option value="' + st + '"' + (ct.status === st ? ' selected' : '') + '>' + (st === 'Ativo' && ct.status === 'Aguardando assinatura' ? 'Ativo (assinado: lança o financeiro)' : st) + '</option>').join('') + '</select>')) +
      campo('Observação', '<textarea name="obs" maxlength="2000">' + esc(ct.obs || '') + '</textarea>', 'inteiro') +
      '<div class="dica inteiro">Depois de salvar, anexe o contrato assinado no detalhe do contrato (Documentos do contrato).</div>' +
      '</form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button>' +
      '<button class="btn btn-p" id="btn-salvar-ctr" type="button">' + (novo ? 'Criar contrato' : 'Salvar') + '</button></div>'
  });
  const f = j.querySelector('#f-ctr');
  // cliente ainda não cadastrado: cadastra aqui mesmo e já volta escolhido no contrato
  j.querySelector('#ctr-novo-cli').onclick = () => {
    const antes = new Set(E.clientes.map((c) => c.id));
    formCliente(undefined, async () => {
      await carregarCadastros(true);
      const novoCli = E.clientes.find((c) => !antes.has(c.id));
      const sel = j.querySelector('[name=cliente_id]');
      sel.innerHTML = opcoesClientes(novoCli ? novoCli.id : sel.value).replace('— sem cliente —', 'Escolha o cliente');
      if (novoCli) { sel.value = novoCli.id; sel.dispatchEvent(new Event('change')); aviso('✓ Cliente cadastrado e escolhido no contrato.'); }
    });
  };
  let modalidade = mod, formaValor = forma, sm = [], situacao = 'Ativo';
  const segAssin = j.querySelector('#ctr-assin');
  if (segAssin) segAssin.onclick = (ev) => { const b = ev.target.closest('button'); if (!b) return; situacao = b.dataset.v; segAssin.querySelectorAll('button').forEach((x) => x.classList.toggle('ativo', x === b)); };
  q(sb.from('salarios_minimos').select('*').order('ano', { ascending: false })).then((x) => { sm = x; previaRec(); }).catch(() => {});
  const previaRec = () => {
    const el = j.querySelector('#ctr-previa-rec'); if (!el) return;
    const ini = f.inicio_vigencia.value || hojeISO(), ano = Number(ini.slice(0, 4)), s0 = sm.find((x) => x.ano <= ano);
    const dia = Math.min(28, Math.max(1, Number(f.dia_vencimento.value) || 10)), mesSeg = somarMeses(ini.slice(0, 7) + '-01', 1).slice(0, 8) + String(dia).padStart(2, '0');
    const v = formaValor === 'salario_minimo' ? (lerValor(f.qtd_salarios.value) || 0) * (s0 ? Number(s0.valor) : 0) : lerValor(f.valor_mensal.value) || 0;
    el.innerHTML = 'Vigência a partir de <b>' + dataBR(ini) + '</b> · <b>1º pagamento em ' + dataBR(mesSeg) + '</b> (competência ' + ini.slice(5, 7) + '/' + ini.slice(0, 4) + '). ' +
      'Todo mês entra um lançamento em Honorários Jurídico (competência do mês, vencimento dia <b>' + dia + '</b> do mês seguinte) de <b class="mono">' + brl(v) + '</b>' +
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
    const dados = { cliente_id: f.cliente_id.value, descricao: f.descricao.value.trim(), servico: f.servico.value, modalidade,
      data_contrato: f.data_contrato.value || hojeISO(), percentual_exito: exito, obs: f.obs.value.trim(),
      exito_base: exito ? f.exito_base.value : null, exito_regra: exito ? f.exito_regra.value.trim() : '', responsavel: ct.responsavel || (cli && cli.responsavel) || '',
      inicio_vigencia: f.inicio_vigencia.value || f.data_contrato.value || hojeISO(), fechado_por: f.fechado_por.value };
    if (modalidade === 'consultoria') {
      const vm = formaValor === 'fixo' ? lerValor(f.valor_mensal.value) : null, qs = formaValor === 'salario_minimo' ? lerValor(f.qtd_salarios.value) : null;
      if (formaValor === 'fixo' && !(vm > 0)) throw new Error('Informe o valor mensal (ex.: 4.000,00).');
      if (formaValor === 'salario_minimo' && !(qs > 0)) throw new Error('Informe quantos salários mínimos (ex.: 1 ou 0,7).');
      const dia = Number(f.dia_vencimento.value) || 10;
      if (dia < 1 || dia > 28) throw new Error('Dia do vencimento entre 1 e 28.');
      if (!f.inicio_vigencia.value) throw new Error('Informe o início da vigência.');
      Object.assign(dados, { forma_valor: formaValor, valor_mensal: vm, qtd_salarios: qs, dia_vencimento: dia, inicio_competencia: f.inicio_vigencia.value.slice(0, 7) + '-01', valor_total: 0, num_parcelas: 1 });
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
      dados.status = situacao;
      const criado = await q(sb.from('contratos').insert(dados).select().single());
      if (modalidade === 'pontual' && dados.valor_total > 0 && cli) await q(sb.from('lancamentos').update({ grupo_id: cli.grupo_id, responsavel: cli.responsavel || '' }).eq('contrato_id', criado.id));
      if (situacao === 'Aguardando assinatura') aviso('✓ Contrato criado aguardando assinatura: o financeiro é lançado quando você marcar "✓ Assinado".');
      else aviso(modalidade === 'consultoria' ? '✓ Contrato de consultoria criado: mensalidades lançadas em Honorários Jurídico.' :
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

// abre o contrato; se algo falhar, diz o porquê (antes o clique não fazia nada)
async function detalheContrato(id) {
  try { await _detalheContrato(id); }
  catch (e) {
    console.error('[contrato]', e);
    aviso('Não foi possível abrir o contrato: ' + erroAmigavel(e) + '. Se continuar, confira se o SQL mais recente foi rodado no Supabase.', true);
  }
}
async function _detalheContrato(id) {
  const ct = (await q(sb.from('contratos').select('*, clientes(nome, grupo_id, responsavel)').eq('id', id)))[0];
  if (ct && !ct.fechado_por && ct.criado_por) ct.fechado_por = ((await q(sb.from('perfis').select('nome, email').eq('id', ct.criado_por)).catch(() => []))[0] || {}).nome || '';
  if (!ct) throw new Error('contrato não encontrado ou de um cliente que você não vê (área)');
  const [parc, exitos, aditivos] = await Promise.all([q(sb.from('lancamentos').select('*').eq('contrato_id', id).order('vencimento')),
    ct.percentual_exito ? q(sb.from('exitos').select('*').eq('contrato_id', id).order('data')).catch(() => []) : [],
    q(sb.from('contratos_aditivos').select('*').eq('contrato_id', id).order('numero')).catch(() => [])]);
  const recebido = soma(parc.filter((p) => p.pago), (p) => p.valor);
  const total = soma(parc, (p) => p.valor);
  const h = hojeISO(), atrasadas = parc.filter((p) => !p.pago && p.vencimento < h), prox = parc.find((p) => !p.pago && p.vencimento >= h);
  // Backup 17: ficha do contrato — resumo em linha (tipo, área, vigência, reajuste, próximo vencimento) + aditivos
  const reajuste = ct.modalidade !== 'consultoria' ? 'Sem reajuste (serviço pontual)'
    : ct.forma_valor === 'salario_minimo' ? 'Automático pelo salário mínimo (todo ano)' : 'Sem reajuste · mudança de valor só por aditivo';
  const ficha = [['Tipo', ct.modalidade === 'consultoria' ? 'Consultoria (mensal)' : 'Serviço pontual'], ['Área do serviço', ct.servico || '—'],
    ['Fechado em', dataBR(ct.data_contrato)], ['Quem fechou', ct.fechado_por || '—'], ['Quem cuida do cliente', (ct.clientes && ct.clientes.responsavel) || ct.responsavel || '—'],
    ['Vigência', dataBR(ct.inicio_vigencia || ct.inicio_competencia || ct.data_contrato) + ' → ' + (ct.rescindido_em ? 'rescindido em ' + dataBR(ct.rescindido_em) : ct.modalidade === 'consultoria' ? 'até a rescisão' : 'fim das parcelas')],
    ['Reajuste', reajuste], ['Próximo vencimento', prox ? dataBR(prox.vencimento) + ' · ' + brl(prox.valor) : '—'],
    ['Situação', pillSituacaoCtr(ct)],
    ['Financeiro', atrasadas.length ? '<span class="pill vencido">' + plural(atrasadas.length, 'parcela em atraso', 'parcelas em atraso') + ' · ' + brl(soma(atrasadas, (p) => p.valor)) + '</span>' : '<span class="pill pago">em dia</span>']];
  const pctRec = total > 0 ? Math.round(recebido / total * 100) : 0;
  const j = abrirJanela({
    titulo: '📄 Ficha do contrato — ' + ct.descricao, larga: true,
    corpo:
      (ct.status === 'Aguardando assinatura' ? '<div class="faixa-aprov tem" id="ctr-assinatura"><span class="faixa-ic" aria-hidden="true">⏳</span><div><b>Aguardando a assinatura do cliente</b>' +
        '<div class="sub">O financeiro, o onboarding e o aviso à equipe acontecem quando você marcar como assinado. Anexe o PDF assinado em "Documentos do contrato", abaixo.</div></div>' +
        '<div class="acoes"><button class="btn btn-p" type="button" id="ctr-assinar">✓ Marcar como assinado</button></div></div>' : '') +
      '<div class="ctr-ficha">' + ficha.map(([r, v]) => '<div><span>' + r + '</span><b>' + (/^</.test(v) ? v : esc(v)) + '</b></div>').join('') + '</div>' +
      (ct.modalidade === 'consultoria' ? '' : '<div class="ctr-barra" title="Recebido × previsto"><div style="width:' + pctRec + '%"></div></div><div class="sub" style="margin:-4px 0 12px">' + pctRec + '% do previsto já recebido</div>') +
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
      '<div class="card" style="margin:14px 0 0"><div class="card-bd" id="ctr-docs"></div></div>' + blocoAditivos(ct, aditivos),
    rodape:
      (E.perfil.papel === 'admin' ? '<button class="btn btn-x" id="btn-excluir-ctr" type="button">Excluir contrato</button>' : '<span></span>') +
      '<div class="acoes">' + (ct.modalidade === 'consultoria' && !ct.rescindido_em ? '<button class="btn btn-x" id="btn-rescindir-ctr" type="button">Rescindir</button>' : '') +
      '<button class="btn btn-o" id="btn-editar-ctr" type="button">Editar contrato</button></div>'
  });
  const reabrir = async () => { fecharJanela(j); await detalheContrato(id); };
  ligarAcoesLancamentos(j, reabrir);
  const btAssinar = j.querySelector('#ctr-assinar');
  if (btAssinar) btAssinar.onclick = () => comBotao(btAssinar, async () => {
    if (!confirm('Marcar o contrato como assinado? O sistema lança o financeiro, cria o onboarding e avisa a equipe.')) return;
    const r = await q(sb.rpc('contrato_assinar', { p_contrato: id, p_data: null }));
    aviso('✓ Contrato assinado: ' + plural((r && r.lancamentos) || 0, 'lançamento', 'lançamentos') + ' no financeiro.'); await reabrir();
  });
  blocoDocumentos(j.querySelector('#ctr-docs'), { contrato_id: id, cliente_id: ct.cliente_id, grupo_id: ct.clientes && ct.clientes.grupo_id, tipo: 'contrato' },
    { titulo: 'Documentos do contrato', vazio: 'Nenhum documento. Envie aqui o contrato assinado, a proposta e os aditivos.' }).catch((e) => console.error(e));
  j.querySelector('#btn-editar-ctr').onclick = () => formContrato(ct);
  const br = j.querySelector('#btn-rescindir-ctr'); if (br) br.onclick = () => formRescisao(ct, reabrir);
  const be = j.querySelector('#ctr-exito-reg'); if (be) be.onclick = () => formExito(ct, reabrir);
  const ba = j.querySelector('#ctr-aditivo'); if (ba) ba.onclick = () => formAditivo(ct, reabrir);
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

// ─────────── aditivos: o que mudou no contrato, com a data e o efeito no financeiro ───────────
const TIPOS_ADITIVO = [['valor', 'Valor'], ['escopo', 'Escopo (o que está incluído)'], ['prazo', 'Prazo / vigência'], ['outro', 'Outro']];
function blocoAditivos(ct, ads) {
  const efeito = (a) => a.tipo !== 'valor' ? '—' : a.valor_adicional ? '+ ' + brl(a.valor_adicional) + (a.parcelas > 1 ? ' em ' + a.parcelas + ' parcelas' : '')
    : (a.forma_nova === 'salario_minimo' ? String(a.qtd_salarios_novo).replace('.', ',') + ' SM' : brl(a.valor_mensal_novo)) + '/mês a partir de ' + dataBR(a.a_partir).slice(3) +
      '<div class="sub">antes: ' + (a.forma_anterior === 'salario_minimo' ? String(a.qtd_salarios_anterior || 0).replace('.', ',') + ' SM' : brl(a.valor_mensal_anterior)) + '</div>';
  return '<div class="card" style="margin:14px 0 0"><div class="card-hd">📝 Aditivos <span class="pill ' + (ads.length ? 'aberto' : 'neutro') + '">' + ads.length + '</span>' +
      (pode('contratos', 'editar') ? '<button class="btn btn-o btn-mini" id="ctr-aditivo" style="margin-left:auto">+ Novo aditivo</button>' : '') + '</div>' +
    '<div class="card-bd">' + (ads.length ? '<div class="tabela-wrap"><table><thead><tr><th>Nº</th><th>Data</th><th>Tipo</th><th>O que mudou</th><th>Efeito no financeiro</th></tr></thead><tbody>' +
      ads.map((a) => '<tr><td>' + a.numero + '</td><td class="mono">' + dataBR(a.data) + '</td><td><span class="pill neutro">' + esc((TIPOS_ADITIVO.find((t) => t[0] === a.tipo) || [0, a.tipo])[1]) + '</span></td>' +
        '<td>' + esc(a.descricao) + '</td><td class="mono">' + efeito(a) + '</td></tr>').join('') + '</tbody></table></div>'
      : '<div class="sub">Nenhum aditivo. Use <b>+ Novo aditivo</b> quando mudar valor, escopo ou prazo — o documento assinado vai em "Documentos do contrato".</div>') + '</div></div>';
}
function formAditivo(ct, depois) {
  const cons = ct.modalidade === 'consultoria';
  const j = abrirJanela({ titulo: '📝 Novo aditivo — ' + ct.descricao, larga: true,
    corpo: '<form class="grade" id="f-ad">' +
      campo('Tipo', '<select name="tipo">' + TIPOS_ADITIVO.map(([v, r]) => '<option value="' + v + '">' + r + '</option>').join('') + '</select>') +
      campo('Data do aditivo', '<input name="data" type="date" value="' + hojeISO() + '">') +
      campo('O que o aditivo muda <span class="obrig">*</span>', '<textarea name="descricao" maxlength="1000" placeholder="Ex.: inclui a consultoria trabalhista a partir de novembro"></textarea>', 'inteiro') +
      '<div class="grade inteiro" id="ad-valor">' + (cons
        ? '<div class="inteiro"><div class="segmento" id="ad-forma">' + [['fixo', 'Valor fixo'], ['salario_minimo', 'Em salários mínimos']].map(([v, r]) => '<button type="button" data-v="' + v + '"' + ((ct.forma_valor || 'fixo') === v ? ' class="ativo"' : '') + '>' + r + '</button>').join('') + '</div></div>' +
          campo('Novo valor mensal (R$)', '<input name="valor_mensal" inputmode="decimal" placeholder="' + (ct.valor_mensal ? valorParaCampo(ct.valor_mensal) : '0,00') + '">') +
          campo('Nº de salários mínimos', '<input name="qtd_salarios" inputmode="decimal" placeholder="' + (ct.qtd_salarios ? String(ct.qtd_salarios).replace('.', ',') : '1') + '">') +
          campo('Vale a partir da competência', '<input name="a_partir" type="month" value="' + somarMeses(hojeISO(), 1).slice(0, 7) + '">') +
          '<div class="dica inteiro">As mensalidades <b>antes</b> dessa competência continuam com o valor antigo; as em aberto a partir dela mudam sozinhas. Atual: <b>' + valorContratoTexto(ct) + '</b>.</div>'
        : campo('Valor a mais (R$)', '<input name="valor_adicional" inputmode="decimal" placeholder="0,00">') +
          campo('Nº de parcelas', '<input name="parcelas" type="number" min="1" max="120" value="1">') +
          campo('1º vencimento', '<input name="primeiro_vencimento" type="date" value="' + somarDias(hojeISO(), 30) + '">') +
          '<div class="dica inteiro">O valor a mais entra em Honorários Jurídico, nas parcelas escolhidas, marcado como "aditivo".</div>') + '</div></form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-ad">Registrar aditivo</button></div>' });
  const f = j.querySelector('#f-ad'); let forma = ct.forma_valor || 'fixo';
  const mostrar = () => {
    j.querySelector('#ad-valor').classList.toggle('escondido', f.tipo.value !== 'valor');
    if (cons) { j.querySelectorAll('#ad-forma button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === forma));
      f.valor_mensal.closest('.campo').classList.toggle('escondido', forma !== 'fixo'); f.qtd_salarios.closest('.campo').classList.toggle('escondido', forma !== 'salario_minimo'); }
  };
  f.tipo.onchange = mostrar; if (cons) j.querySelector('#ad-forma').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { forma = b.dataset.v; mostrar(); } };
  mostrar();
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-ad').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const p = { tipo: f.tipo.value, data: f.data.value, descricao: f.descricao.value.trim() };
    if (!p.descricao) throw new Error('Descreva o que o aditivo muda.');
    if (p.tipo === 'valor') {
      if (cons) Object.assign(p, { forma, valor_mensal: forma === 'fixo' ? lerValor(f.valor_mensal.value) : null, qtd_salarios: forma === 'salario_minimo' ? lerValor(f.qtd_salarios.value) : null, a_partir: (f.a_partir.value || hojeISO().slice(0, 7)) + '-01' });
      else Object.assign(p, { valor_adicional: lerValor(f.valor_adicional.value), parcelas: Number(f.parcelas.value) || 1, primeiro_vencimento: f.primeiro_vencimento.value });
    }
    await q(sb.rpc('registrar_aditivo', { p_contrato: ct.id, p }));
    aviso('✓ Aditivo registrado' + (p.tipo === 'valor' ? ' e financeiro ajustado.' : '.')); fecharJanela(j); await recarregar(); if (depois) await depois();
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


