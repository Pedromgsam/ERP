'use strict';
// ═══════════════════════════════════════════════════════════════════
// Backup 53 — EXECUÇÕES (cobrança ajuizada): o processo de execução, o que o CLIENTE já recebeu
// e o que fica para o ESCRITÓRIO (um % do que foi recebido). Cada recebimento lança sozinho, no
// Financeiro Jurídico, o honorário do escritório (gatilho execucao_recebimento_lanca no banco).
// ═══════════════════════════════════════════════════════════════════
// Backup 86 (M15): só "Em andamento" e "Encerrada", como no ambiente (registros antigos "Em acordo"/"Suspensa" aparecem como Em andamento)
const SITUACOES_EXEC = [['ativa', 'Em andamento', 'aberto'], ['encerrada', 'Encerrada', 'pago']];
const pillSitExec = (s) => { const x = SITUACOES_EXEC.find((y) => y[0] === s) || SITUACOES_EXEC[0]; return '<span class="pill ' + x[2] + '">' + x[1] + '</span>'; };

TELAS.execucoes = async function () {
  // Backup 82: no desenho do ambiente — sem os cartões de número no alto; tabela única (abas Em andamento · Encerradas · Todas, busca, Filtros, total)
  await carregarCadastros();
  E.ex = E.ex || {};
  const podeEd = pode('juridico', 'editar');
  $('conteudo').innerHTML = cabecalhoTela({ icone: 'execucao', titulo: 'Execuções', frase: 'Cobranças na Justiça e o que já entrou', botao: podeEd ? { id: 'ex-nova', rotulo: 'Execução' } : null }) +
    '<div id="ex-corpo"><div class="carregando">Carregando…</div></div>';
  if ($('ex-nova')) $('ex-nova').onclick = () => formExecucao({}, () => TELAS.execucoes());
  const [L, R] = await Promise.all([q(sb.from('execucoes').select('*').order('criado_em', { ascending: false })).catch(() => []),
    q(sb.from('execucao_recebimentos').select('id, execucao_id, data, valor, honorario, repassado_em, lancamento_id, lancamentos(pago)')).catch(() => [])]);
  if (!$('ex-corpo')) return;
  const porEx = {}; R.forEach((r) => { (porEx[r.execucao_id] = porEx[r.execucao_id] || []).push(r); });
  const somaR = (id, k) => (porEx[id] || []).reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const cliDe = (e) => E.clientes.find((c) => c.id === e.cliente_id) || {};
  const grupoDe = (e) => nomeGrupo(e.grupo_id || cliDe(e).grupo_id) || '';
  const pct = (a, b) => (b ? Math.round(a / b * 100) : 0) + '%';
  tabelaB($('ex-corpo'), { id: 'execucoes', contagem: true, linhas: L, chave: (e) => String(e.id), unidade: ['execução', 'execuções'], dicaBusca: 'Buscar',
    abas: [{ id: 'and', rot: 'Em andamento', f: (e) => e.situacao !== 'encerrada' }, { id: 'enc', rot: 'Encerradas', f: (e) => e.situacao === 'encerrada' }, { id: 'todas', rot: 'Todas', f: () => true }],
    busca: (e) => [cliDe(e).nome, cliDe(e).cpf_cnpj, e.numero, e.executado, grupoDe(e)].join(' '), valor: (e) => Number(e.valor_execucao) || 0, ord: { k: 'cli', dir: 1 },
    colunas: [
      { k: 'cli', rot: 'Cliente', html: (e) => esc(cliDe(e).nome || '—') + (cliDe(e).cpf_cnpj ? '<span class="b-doc">' + esc(mascaraDoc(cliDe(e).cpf_cnpj)) + '</span>' : ''), ord: (e) => normalizar(cliDe(e).nome || '~') },
      { k: 'exe', rot: 'Executado', html: (e) => esc(e.executado || '—') + '<span class="b-doc">' + esc(e.numero || '—') + '</span>', ord: (e) => normalizar(e.executado || '~') },
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
  // Backup 86 (M16): igual ao ambiente — 3 números, a lista de recebimentos e "+ Recebimento" (saíram contatos, editar, "Falta receber" e a tabela)
  const j = abrirJanela({ kick: 'Execução · ' + (e.numero || 'sem número'), titulo: e.executado || cli.nome || 'Execução', sub: 'Cliente: ' + esc(cli.nome || '—'), larga: true,
    corpo: numsFaixa([['Valor executado', esc(brl(e.valor_execucao))], ['Recebido', esc(brl(tot)), '', 'b-verde'], ['Honorários', esc(brl(hon))]]) +
      '<div class="b-bloco"><h3>Recebimentos</h3>' + (ord.length ? '<div class="b-lista">' + ord.map((r) => '<div class="b-li"><span class="b-li-tx"><b>' + esc(brl(r.valor)) + '</b><small>' +
        dataBR(r.data) + ' · honorário ' + esc(brl(r.honorario)) + '</small></span></div>').join('') + '</div>' : '<p class="sub">Nenhum recebimento ainda.</p>') + '</div>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-fechar>Fechar</button>' + (podeEd ? '<button class="btn btn-p" type="button" id="ex-receb">' + iconeB('mais') + ' Recebimento</button>' : '') + '</div>' });
  const re = async () => { fecharJanela(j); if (depois) await depois(); };
  const rb = j.querySelector('#ex-receb'); if (rb) rb.onclick = () => formRecebimentoExec(e, re);
  return j;
}

// Backup 85 (EX4): como no ambiente — valor e data à vista, o resto em "Mais dados"; "Lançar" com Desfazer
function formRecebimentoExec(e, depois) {
  const pct = Number(e.percentual) || 0, cli = (E.clientes || []).find((c) => c.id === e.cliente_id) || {};
  const j = abrirJanela({ kick: 'Novo recebimento', titulo: e.executado || ('Execução ' + (e.numero || '')), sub: esc([cli.nome, e.numero].filter(Boolean).join(' · ')),
    corpo: '<form class="grade" id="f-exr">' + campo('Valor recebido pelo cliente (R$) <span class="obrig">*</span>', '<input name="valor" data-mascara="brl" inputmode="decimal" placeholder="0,00">') +
      campo('Data', '<input name="data" type="date" value="' + hojeISO() + '">') +
      '<div class="dica inteiro" id="exr-previa">O honorário de ' + String(pct).replace('.', ',') + '% entra sozinho em Financeiro → Jurídico (A receber).</div>' +
      '</form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="exr-ok">' + iconeB('check') + ' Lançar</button></div>' });
  const f = j.querySelector('#f-exr');
  const previa = () => { const v = lerValor(f.valor.value), h = Math.round((v || 0) * pct) / 100;
    j.querySelector('#exr-previa').innerHTML = v > 0 ? 'Entra em Financeiro → Jurídico um honorário de <b class="mono">' + brl(h) + '</b> (' + String(pct).replace('.', ',') + '% de ' + brl(v) + '), com vencimento em ' + dataBR(f.data.value || hojeISO()) + '.'
      : 'O honorário de ' + String(pct).replace('.', ',') + '% entra sozinho em Financeiro → Jurídico (A receber).'; };
  ['input', 'change'].forEach((x) => f.addEventListener(x, previa));
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#exr-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const v = lerValor(f.valor.value); if (!(v > 0)) throw new Error('Informe o valor recebido (ex.: 5.000,00).');
    const h = null;
    const novo = await q(sb.from('execucao_recebimentos').insert({ execucao_id: e.id, data: f.data.value || hojeISO(), valor: v, honorario: h }).select('id').single());
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


