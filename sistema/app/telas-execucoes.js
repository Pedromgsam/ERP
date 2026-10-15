'use strict';
// ═══════════════════════════════════════════════════════════════════
// Backup 53 — EXECUÇÕES (cobrança ajuizada): o processo de execução, o que o CLIENTE já recebeu
// e o que fica para o ESCRITÓRIO (um % do que foi recebido). Cada recebimento lança sozinho, no
// Financeiro Jurídico, o honorário do escritório (gatilho execucao_recebimento_lanca no banco).
// ═══════════════════════════════════════════════════════════════════
const SITUACOES_EXEC = [['ativa', 'Em andamento', 'aberto'], ['acordo', 'Em acordo', 'hoje'], ['suspensa', 'Suspensa', 'neutro'], ['encerrada', 'Encerrada', 'pago']];
const FORMAS_RECEB = ['Alvará', 'Depósito judicial', 'Acordo', 'Penhora / Sisbajud', 'Pagamento direto', 'Outro'];
const pillSitExec = (s) => { const x = SITUACOES_EXEC.find((y) => y[0] === s) || SITUACOES_EXEC[0]; return '<span class="pill ' + x[2] + '">' + x[1] + '</span>'; };

TELAS.execucoes = async function () {
  // Backup 82: no desenho do ambiente — sem os cartões de número no alto; tabela única (abas Em andamento · Encerradas · Todas, busca, Filtros, total)
  await carregarCadastros();
  E.ex = E.ex || {};
  const podeEd = pode('juridico', 'editar');
  $('conteudo').innerHTML = cabecalhoTela({ icone: 'execucao', titulo: 'Execuções', frase: 'Cobranças na Justiça e o que já entrou', atualizar: 'ex-atu', botao: podeEd ? { id: 'ex-nova', rotulo: 'Execução' } : null }) +
    '<div id="ex-corpo"><div class="carregando">Carregando…</div></div>';
  $('ex-atu').onclick = () => TELAS.execucoes();
  if ($('ex-nova')) $('ex-nova').onclick = () => formExecucao({}, () => TELAS.execucoes());
  const [L, R] = await Promise.all([q(sb.from('execucoes').select('*').order('criado_em', { ascending: false })).catch(() => []),
    q(sb.from('execucao_recebimentos').select('id, execucao_id, data, valor, honorario, repassado_em, lancamento_id, lancamentos(pago)')).catch(() => [])]);
  if (!$('ex-corpo')) return;
  const porEx = {}; R.forEach((r) => { (porEx[r.execucao_id] = porEx[r.execucao_id] || []).push(r); });
  const somaR = (id, k) => (porEx[id] || []).reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const cliDe = (e) => E.clientes.find((c) => c.id === e.cliente_id) || {};
  const grupoDe = (e) => nomeGrupo(e.grupo_id || cliDe(e).grupo_id) || '';
  const sitTxt = (e) => (SITUACOES_EXEC.find((y) => y[0] === e.situacao) || SITUACOES_EXEC[0])[1];
  const pct = (a, b) => (b ? Math.round(a / b * 100) : 0) + '%';
  tabelaB($('ex-corpo'), { id: 'execucoes', contagem: true, linhas: L, chave: (e) => String(e.id), unidade: ['execução', 'execuções'], dicaBusca: 'Buscar',
    abas: [{ id: 'and', rot: 'Em andamento', f: (e) => e.situacao !== 'encerrada' }, { id: 'enc', rot: 'Encerradas', f: (e) => e.situacao === 'encerrada' }, { id: 'todas', rot: 'Todas', f: () => true }],
    busca: (e) => [cliDe(e).nome, cliDe(e).cpf_cnpj, e.numero, e.executado, grupoDe(e)].join(' '), valor: (e) => Number(e.valor_execucao) || 0, ord: { k: 'cli', dir: 1 },
    listas: [{ k: 'g', rot: 'Grupo', todos: 'Todos os grupos', opcoes: unicosTxt(L.map(grupoDe)).map((x) => [x, x]), get: grupoDe },
      { k: 'sit', rot: 'Situação', todos: 'Todas as situações', opcoes: SITUACOES_EXEC.map((x) => [x[0], x[1]]), get: (e) => e.situacao || 'ativa' }],
    colunas: [
      { k: 'cli', rot: 'Cliente', html: (e) => esc(cliDe(e).nome || '—') + (cliDe(e).cpf_cnpj ? '<span class="b-doc">' + esc(mascaraDoc(cliDe(e).cpf_cnpj)) + '</span>' : ''), ord: (e) => normalizar(cliDe(e).nome || '~') },
      { k: 'exe', rot: 'Executado', html: (e) => esc(e.executado || '—') + '<span class="b-doc">' + esc([e.numero, e.situacao && e.situacao !== 'ativa' && e.situacao !== 'encerrada' ? sitTxt(e) : ''].filter(Boolean).join(' · ') || '—') + '</span>', ord: (e) => normalizar(e.executado || '~') },
      { k: 'v', rot: 'Valor executado', cls: 'b-dir b-val', soma: true, html: (e) => brl(e.valor_execucao), ord: (e) => Number(e.valor_execucao) || 0 },
      { k: 'rec', rot: 'Já recebido', cls: 'b-dir', html: (e) => '<b class="b-verde-v">' + brl(somaR(e.id, 'valor')) + '</b><small class="b-sub">' + pct(somaR(e.id, 'valor'), Number(e.valor_execucao)) + ' do total</small>', ord: (e) => somaR(e.id, 'valor') },
      { k: 'hon', rot: 'Honorário (%)', cls: 'b-dir', html: (e) => '<b>' + brl(somaR(e.id, 'honorario')) + '</b><small class="b-sub">' + String(Number(e.percentual) || 0).replace('.', ',') + '% do recebido</small>', ord: (e) => somaR(e.id, 'honorario') }],
    clique: (e) => detalheExecucao(e, porEx[e.id] || [], () => TELAS.execucoes()),
    vazio: { titulo: 'Nenhuma execução aqui', frase: L.length ? 'Troque a aba ou limpe os filtros.' : 'Cadastre a primeira cobrança ajuizada.', botao: podeEd && !L.length ? ['+ Execução', '#ex-nova'] : null } });
};

function formExecucao(e, depois) {
  e = e || {}; const novo = !e.id;
  const j = abrirJanela({ titulo: novo ? '+ Nova execução' : '✎ Editar execução', larga: true,
    corpo: '<form class="grade" id="f-exec">' +
      campo('Cliente (quem cobra) <span class="obrig">*</span>', '<select name="cliente_id">' + opcoesClientes(e.cliente_id || '').replace('— sem cliente —', 'Escolha o cliente') + '</select>', 'inteiro') +
      campo('Nº do processo', '<input name="numero" maxlength="40" placeholder="0000000-00.0000.0.00.0000" value="' + esc(e.numero || '') + '">') +
      campo('Executado (devedor)', '<input name="executado" maxlength="200" value="' + esc(e.executado || '') + '">') +
      campo('Valor da execução (R$)', '<input name="valor_execucao" data-mascara="brl" inputmode="decimal" value="' + (e.valor_execucao ? valorParaCampo(e.valor_execucao) : '') + '">') +
      campo('% do escritório sobre o que for recebido', '<input name="percentual" inputmode="decimal" placeholder="Ex.: 20" value="' + (e.percentual != null ? esc(String(e.percentual).replace('.', ',')) : '') + '">') +
      campo('Ajuizada em', '<input name="ajuizada_em" type="date" value="' + esc(e.ajuizada_em || '') + '">') +
      campo('Situação', '<select name="situacao">' + SITUACOES_EXEC.map(([v, r]) => '<option value="' + v + '"' + ((e.situacao || 'ativa') === v ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>') +
      campo('Responsável', selectPessoa('responsavel', e.responsavel || '', '— escolha —')) +
      campo('Observação', '<textarea name="obs" maxlength="2000">' + esc(e.obs || '') + '</textarea>', 'inteiro') +
      '<div class="dica inteiro">A cada recebimento registrado, o honorário do escritório (o % acima sobre o valor recebido) entra sozinho em Financeiro → Jurídico.</div></form>',
    rodape: (!novo && E.perfil && E.perfil.papel === 'admin' ? '<button class="btn btn-x" type="button" id="ex-apagar">Excluir</button>' : '<span></span>') +
      '<div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="ex-salvar">' + (novo ? 'Cadastrar' : 'Salvar') + '</button></div>' });
  const f = j.querySelector('#f-exec');
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  const ap = j.querySelector('#ex-apagar');
  if (ap) ap.onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!await confirmarB('Excluir esta execução e os recebimentos dela? Os honorários ainda não pagos também saem do Financeiro.')) return;
    await q(sb.from('execucoes').delete().eq('id', e.id)); aviso('Execução excluída.'); fecharJanela(j); fecharJanela(); if (depois) await depois(); });
  j.querySelector('#ex-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.cliente_id.value) throw new Error('Escolha o cliente.');
    const pct = f.percentual.value.trim() ? lerValor(f.percentual.value) : 0, v = f.valor_execucao.value.trim() ? lerValor(f.valor_execucao.value) : 0;
    if (isNaN(pct) || pct < 0 || pct > 100) throw new Error('O % do escritório deve ficar entre 0 e 100.');
    if (isNaN(v) || v < 0) throw new Error('Valor da execução inválido (ex.: 25.000,00).');
    const cli = E.clientes.find((c) => c.id === f.cliente_id.value) || {};
    const d = { cliente_id: f.cliente_id.value, grupo_id: cli.grupo_id || null, numero: f.numero.value.trim(), executado: f.executado.value.trim(), valor_execucao: v, percentual: pct,
      ajuizada_em: f.ajuizada_em.value || null, situacao: f.situacao.value, responsavel: f.responsavel.value || cli.responsavel || '', obs: f.obs.value.trim() };
    if (novo) await q(sb.from('execucoes').insert(d)); else await q(sb.from('execucoes').update(d).eq('id', e.id));
    aviso(novo ? '✓ Execução cadastrada.' : '✓ Execução atualizada.'); fecharJanela(j); if (!novo) fecharJanela(); if (depois) await depois();
  });
  return j;
}

function detalheExecucao(e, recs, depois) {
  if (!e) return;
  const podeEd = pode('juridico', 'editar'), cli = E.clientes.find((c) => c.id === e.cliente_id) || {};
  const tot = recs.reduce((s, r) => s + (Number(r.valor) || 0), 0), hon = recs.reduce((s, r) => s + (Number(r.honorario) || 0), 0);
  const ord = recs.slice().sort((a, b) => String(b.data).localeCompare(String(a.data)));
  // Backup 85 (EX2): cabeçalho como no ambiente — "Execução · processo", o executado em destaque e o cliente embaixo
  const j = abrirJanela({ kick: 'Execução · ' + (e.numero || 'sem número'), titulo: e.executado || cli.nome || 'Execução', sub: 'Cliente: ' + esc(cli.nome || '—') + (e.ajuizada_em ? ' · ajuizada em ' + dataBR(e.ajuizada_em) : ''), larga: true,
    dir: pillSitExec(e.situacao),
    corpo:       // Backup 82: números numa faixa só (desenho do ambiente), sem cartões
      numsFaixa([['Valor da execução', esc(brl(e.valor_execucao))], ['Recebido pelo cliente', esc(brl(tot)), plural(recs.length, 'recebimento', 'recebimentos'), 'b-verde'],
        ['Falta receber', esc(brl(Math.max(0, (Number(e.valor_execucao) || 0) - tot)))], ['Honorários do escritório', esc(brl(hon)), String(Number(e.percentual) || 0).replace('.', ',') + '% do recebido']]) +
      (e.obs ? '<div class="dica" style="margin-bottom:10px">' + esc(e.obs) + '</div>' : '') +
      '<div class="card" style="margin:0"><div class="card-hd">Recebimentos</div>' +
      (ord.length ? '<div class="tabela-wrap"><table><thead><tr><th>Data</th><th>Recebido pelo cliente</th><th>Honorários do escritório</th><th>No Financeiro</th><th>Repassado ao cliente</th><th></th></tr></thead><tbody>' +
        ord.map((r) => '<tr><td>' + dataBR(r.data) + '</td><td class="col-valor">' + brl(r.valor) + '</td><td class="col-valor">' + brl(r.honorario) + '</td>' +
          '<td>' + (r.lancamento_id ? (r.lancamentos && r.lancamentos.pago ? '<span class="pill pago">recebido</span>' : '<span class="pill aberto">a receber</span>') : '<span class="sub">—</span>') + '</td>' +
          '<td>' + (r.repassado_em ? dataBR(r.repassado_em) : '<span class="sub">—</span>') + '</td>' +
          '<td class="acoes-l">' + (podeEd ? '<button class="btn btn-x btn-mini" type="button" data-exr-apagar="' + r.id + '" title="Apagar o recebimento (e o honorário ainda não pago)">✕</button>' : '') + '</td></tr>').join('') + '</tbody></table></div>'
        : '<div class="card-bd">' + vazio('Nenhum recebimento ainda.') + '</div>') + '</div>' +
      // Backup 54: contatos de quem não é cliente (executado, advogado da outra parte, cartório…)
      '<div class="card ex-contatos" style="margin:10px 0 0"><div class="card-hd">Contatos (não clientes)' + (podeEd ? '<span class="gd-hd-ac"><button class="btn btn-o btn-mini" type="button" id="ex-contato-novo">+ Contato</button></span>' : '') +
        '</div><div id="ex-contatos-l"><div class="card-bd"><span class="sub">Carregando…</span></div></div></div>',
    rodape: (podeEd ? '<button class="btn btn-g" type="button" id="ex-editar" style="margin-right:auto">' + iconeB('lapis') + ' Editar execução</button>' : '<span></span>') +
      '<div class="acoes"><button class="btn btn-o" type="button" data-fechar>Fechar</button>' + (podeEd ? '<button class="btn btn-p" type="button" id="ex-receb">' + iconeB('mais') + ' Recebimento</button>' : '') + '</div>' });
  const re = async () => { fecharJanela(j); if (depois) await depois(); };
  const ed = j.querySelector('#ex-editar'); if (ed) ed.onclick = () => formExecucao(e, depois);
  const rb = j.querySelector('#ex-receb'); if (rb) rb.onclick = () => formRecebimentoExec(e, re);
  pintarContatosExec(j, e, podeEd);
  const cn = j.querySelector('#ex-contato-novo'); if (cn) cn.onclick = () => formContatoExec(e, {}, () => pintarContatosExec(j, e, podeEd));
  j.querySelectorAll('[data-exr-apagar]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    if (!await confirmarB('Apagar este recebimento? O honorário dele sai do Financeiro se ainda não foi pago.')) return;
    await q(sb.from('execucao_recebimentos').delete().eq('id', b.dataset.exrApagar)); aviso('Recebimento apagado.'); await re(); }));
  return j;
}

// Backup 85 (EX4): como no ambiente — valor e data à vista, o resto em "Mais dados"; "Lançar" com Desfazer
function formRecebimentoExec(e, depois) {
  const pct = Number(e.percentual) || 0, cli = (E.clientes || []).find((c) => c.id === e.cliente_id) || {};
  const j = abrirJanela({ kick: 'Novo recebimento', titulo: e.executado || ('Execução ' + (e.numero || '')), sub: esc([cli.nome, e.numero].filter(Boolean).join(' · ')),
    corpo: '<form class="grade" id="f-exr">' + campo('Valor recebido pelo cliente (R$) <span class="obrig">*</span>', '<input name="valor" data-mascara="brl" inputmode="decimal" placeholder="0,00">') +
      campo('Data', '<input name="data" type="date" value="' + hojeISO() + '">') +
      '<div class="dica inteiro" id="exr-previa">O honorário de ' + String(pct).replace('.', ',') + '% entra sozinho em Financeiro → Jurídico (A receber).</div>' +
      '<details class="b-mais-dados inteiro"><summary>Mais dados</summary><div class="grade">' +
      campo('Como foi recebido', '<select name="forma">' + FORMAS_RECEB.map((x) => '<option>' + x + '</option>').join('') + '</select>') +
      campo('Repassado ao cliente em', '<input name="repassado_em" type="date">') +
      campo('Honorários do escritório (R$)', '<input name="honorario" data-mascara="brl" inputmode="decimal" placeholder="calculado: ' + String(pct).replace('.', ',') + '%">') +
      campo('Observação', '<input name="obs" maxlength="300">') + '</div></details></form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="exr-ok">' + iconeB('check') + ' Lançar</button></div>' });
  const f = j.querySelector('#f-exr');
  const previa = () => { const v = lerValor(f.valor.value), h = f.honorario.value.trim() ? lerValor(f.honorario.value) : Math.round((v || 0) * pct) / 100;
    j.querySelector('#exr-previa').innerHTML = v > 0 ? 'Entra em Financeiro → Jurídico um honorário de <b class="mono">' + brl(h) + '</b>' + (f.honorario.value.trim() ? '' : ' (' + String(pct).replace('.', ',') + '% de ' + brl(v) + ')') + ', com vencimento em ' + dataBR(f.data.value || hojeISO()) + '.'
      : 'O honorário de ' + String(pct).replace('.', ',') + '% entra sozinho em Financeiro → Jurídico (A receber).'; };
  ['input', 'change'].forEach((x) => f.addEventListener(x, previa));
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#exr-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const v = lerValor(f.valor.value); if (!(v > 0)) throw new Error('Informe o valor recebido (ex.: 5.000,00).');
    const h = f.honorario.value.trim() ? lerValor(f.honorario.value) : null; if (h != null && (isNaN(h) || h < 0)) throw new Error('Honorário inválido.');
    const novo = await q(sb.from('execucao_recebimentos').insert({ execucao_id: e.id, data: f.data.value || hojeISO(), valor: v, forma: f.forma.value, repassado_em: f.repassado_em.value || null, honorario: h, obs: f.obs.value.trim() }).select('id').single());
    fecharJanela(j);
    feitoDesfazer('Recebimento lançado; o honorário de ' + brl(h != null ? h : Math.round(v * pct) / 100) + ' foi para o Financeiro.',
      novo && novo.id ? () => q(sb.from('execucao_recebimentos').delete().eq('id', novo.id)) : null, depois);
    if (depois) await depois();
  });
  return j;
}

// Backup 54: "+ Lançar → Recebimento de execução" — escolher a execução e registrar o recebimento (o honorário entra sozinho no Financeiro)
async function escolherExecucaoReceb(depois) {
  if (!E.clientes.length) await carregarCadastros();
  const L = (await q(sb.from('execucoes').select('*').neq('situacao', 'encerrada').order('criado_em', { ascending: false })).catch(() => []));
  if (!L.length) return aviso('Nenhuma execução em andamento. Cadastre em Jurídico → Execuções.', true);
  const nome = (e) => ((E.clientes.find((c) => c.id === e.cliente_id) || {}).nome || '—') + ' × ' + (e.executado || '—') + (e.numero ? ' · ' + e.numero : '');
  const j = abrirJanela({ titulo: '+ Recebimento de execução', corpo: '<div class="grade">' + campo('Execução', '<select id="exs-sel">' + L.map((e) => '<option value="' + e.id + '">' + esc(nome(e)) + '</option>').join('') + '</select>', 'inteiro') + '</div>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="exs-ok">Continuar</button></div>' });
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#exs-ok').onclick = () => { const e = L.find((x) => x.id === j.querySelector('#exs-sel').value); fecharJanela(j); formRecebimentoExec(e, depois); };
  return j;
}

// Backup 54: contatos das execuções (pessoas que NÃO são clientes) — nome, papel, telefone (liga/WhatsApp), e-mail, endereço
const PAPEIS_CONTATO_EXEC = ['Executado', 'Sócio do executado', 'Advogado da outra parte', 'Cartório / secretaria', 'Oficial de justiça', 'Perito', 'Testemunha', 'Outro'];
async function pintarContatosExec(j, e, podeEd) {
  const alvo = j.querySelector('#ex-contatos-l'); if (!alvo) return;
  const lista = await q(sb.from('execucao_contatos').select('*').eq('execucao_id', e.id).order('nome')).catch(() => []);
  const zap = (t) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 10 ? 'https://wa.me/' + (d.length <= 11 ? '55' : '') + d : ''; };
  alvo.innerHTML = lista.length ? '<div class="tabela-wrap"><table class="ex-ct-tab"><thead><tr><th>Nome</th><th>Papel</th><th>Telefone</th><th>E-mail</th><th>Endereço</th><th></th></tr></thead><tbody>' +
    lista.map((c) => '<tr' + (podeEd ? ' class="clicavel" data-exc-linha="' + c.id + '" title="Clique para editar"' : '') + '><td><b>' + esc(c.nome) + '</b>' + (c.obs ? '<div class="sub">' + esc(c.obs) + '</div>' : '') + '</td><td>' + esc(c.papel || '—') + '</td>' +
      '<td>' + (c.telefone ? '<a href="tel:' + esc(c.telefone.replace(/[^\d+]/g, '')) + '">' + esc(c.telefone) + '</a>' + (zap(c.telefone) ? ' <a href="' + zap(c.telefone) + '" target="_blank" rel="noopener" title="WhatsApp">💬</a>' : '') : '<span class="sub">—</span>') + '</td>' +
      '<td>' + (c.email ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '<span class="sub">—</span>') + '</td><td>' + (esc(c.endereco) || '<span class="sub">—</span>') + '</td>' +
      '<td class="acoes-l">' + (podeEd ? '<button class="btn btn-x btn-mini" type="button" data-exc-apagar="' + c.id + '" title="Apagar">✕</button>' : '') + '</td></tr>').join('') +
    '</tbody></table></div>' : '<div class="card-bd">' + vazio('Nenhum contato. Guarde aqui telefone e endereço do executado, do advogado da outra parte, do cartório…') + '</div>';
  alvo.querySelectorAll('tr[data-exc-linha]').forEach((tr) => tr.onclick = (ev) => { if (ev.target.closest('button, a')) return;   // Backup 58: a linha edita (sem ✎)
    formContatoExec(e, lista.find((c) => c.id === tr.dataset.excLinha), () => pintarContatosExec(j, e, podeEd)); });
  alvo.querySelectorAll('[data-exc-apagar]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    if (!await confirmarB('Apagar este contato?')) return;
    await q(sb.from('execucao_contatos').delete().eq('id', b.dataset.excApagar)); aviso('Contato apagado.'); pintarContatosExec(j, e, podeEd); }));
}
function formContatoExec(e, c, depois) {
  c = c || {};
  const j = abrirJanela({ titulo: (c.id ? '✎ Contato' : '+ Contato') + ' — execução ' + (e.numero || ''),
    corpo: '<form class="grade" id="f-exc">' + campo('Nome <span class="obrig">*</span>', '<input name="nome" maxlength="160" value="' + esc(c.nome || '') + '">') +
      campo('Papel', '<select name="papel">' + PAPEIS_CONTATO_EXEC.map((x) => '<option' + (c.papel === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select>') +
      campo('Telefone', '<input name="telefone" value="' + esc(c.telefone || '') + '" placeholder="(31) 99999-9999">') +
      campo('E-mail', '<input name="email" type="email" value="' + esc(c.email || '') + '">') +
      campo('Endereço', '<input name="endereco" maxlength="300" value="' + esc(c.endereco || '') + '">', 'inteiro') +
      campo('Observação', '<input name="obs" maxlength="300" value="' + esc(c.obs || '') + '" placeholder="ex.: ligar depois das 14h">', 'inteiro') + '</form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="exc-ok">Salvar</button></div>' });
  const f = j.querySelector('#f-exc');
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#exc-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const d = { execucao_id: e.id }; ['nome', 'papel', 'telefone', 'email', 'endereco', 'obs'].forEach((k) => { d[k] = f[k].value.trim(); });
    if (!d.nome) throw new Error('Informe o nome do contato.');
    if (c.id) await q(sb.from('execucao_contatos').update(d).eq('id', c.id)); else await q(sb.from('execucao_contatos').insert(d));
    fecharJanela(j); aviso('✓ Contato salvo.'); if (depois) await depois();
  });
}

