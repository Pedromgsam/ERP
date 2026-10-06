'use strict';
// ═══════════════════════════════════════════════════════════════════
// Central de automações — tudo o que o sistema faz sozinho, num lugar só:
// tarefas automáticas, e-mails ao cliente, integrações e rotinas agendadas.
// Liga/desliga salva na hora (só o administrador altera); cada automação mostra
// quantas vezes agiu nos últimos 30 dias (tabela automacoes_log) e as últimas ações.
// ═══════════════════════════════════════════════════════════════════
const GRUPOS_AUTOMACAO = [
  ['tarefas', '🗂 Tarefas automáticas', 'Um lançamento cria (e conclui) tarefas sozinho, sem duplicar.'],
  ['cliente_email', '✉ E-mails ao cliente', 'Vão pelo Gmail do escritório, para o contato financeiro. Começam desligados; nunca repetem a mesma cobrança.'],
  ['integracao', '🔗 Integrações', 'Consultas automáticas a serviços externos gratuitos.']
];
// prefixo gravado no registro → automação
const PREFIXO_AUTOMACAO = { 'rot-conf': 'rotina_conferir', 'rot-sup': 'rotina_supervisao', onb: 'contrato_onboarding', proc: 'processo_novo', cert: 'certidao_vencendo', doc: 'certidao_vencendo', parc: 'parcela_parcelamento',
  aco: 'parcela_acordo', cob: 'cobrar_honorario', anexo: 'contrato_anexo', procur: 'processo_procuracao', pagamento_conclui: 'pagamento_conclui', pub: 'publicacao_tarefa',
  cliente_novo_cnpj: 'cliente_novo_cnpj', email_lp: 'email_lembrete_parcelamento', email_lh: 'email_lembrete_honorario', email_ch: 'email_cobranca_honorario', email_la: 'email_lembrete_acordo', email_pr: 'email_pagamento_recebido', email_vh: 'email_lembrete_honorario', 'crm-parada': 'crm_parada', 'crm-follow': 'crm_followup', email_bv: 'email_boas_vindas' };
// automações que não usam "N dias"
const SEM_DIAS = ['pagamento_conclui', 'cliente_novo_cnpj', 'email_pagamento_recebido', 'email_boas_vindas'];
// automações de tarefa que não criam tarefa nova (não têm responsável)
const SEM_RESP = ['pagamento_conclui', 'escalar_atraso'];

TELAS.automacoes = async function () {
  const admin = E.perfil && E.perfil.papel === 'admin';
  const [regras, cont, log, ultReg, ultPub, cnpj, backup, emails] = await Promise.all([
    q(sb.from('regras_tarefas').select('*').eq('oculta', false).order('nome')),
    q(sb.rpc('resumo_automacoes')).catch(() => ({})),
    q(sb.from('automacoes_log').select('*').neq('chave', '_item').order('quando', { ascending: false }).limit(25)).catch(() => []),
    q(sb.from('configuracoes').select('valor').eq('chave', 'regras_tarefas_ultima').maybeSingle()).catch(() => null),
    q(sb.from('configuracoes').select('valor').eq('chave', 'publicacoes_ultima').maybeSingle()).catch(() => null),
    q(sb.from('cnpj_execucoes').select('inicio, status, mensagem').order('inicio', { ascending: false }).limit(1)).catch(() => []),
    admin ? q(sb.from('backups_auto').select('criado_em, tamanho').order('criado_em', { ascending: false }).limit(1)).catch(() => []) : [],
    admin ? q(sb.from('email_fila').select('status, criado_em').gte('criado_em', new Date(Date.now() - 7 * 864e5).toISOString())).catch(() => []) : []
  ]);
  const porRegra = {};
  Object.entries(cont || {}).forEach(([pref, n]) => { const k = PREFIXO_AUTOMACAO[pref] || pref; porRegra[k] = (porRegra[k] || 0) + n; });
  const ligadas = regras.filter((r) => r.ligada).length, acoes = Object.values(porRegra).reduce((a, n) => a + n, 0);
  const envCli = ['email_lh', 'email_ch', 'email_la', 'email_pr'].reduce((a, k) => a + ((cont || {})[k] || 0), 0);
  const linha = (r) => '<div class="au-item' + (r.ligada ? ' ligada' : '') + '" data-au="' + r.chave + '">' +
    '<label class="au-chave" title="' + (admin ? 'Ligar / desligar' : 'Só o administrador altera') + '"><input type="checkbox" role="switch" data-au-lig="' + r.chave + '"' + (r.ligada ? ' checked' : '') + (admin ? '' : ' disabled') +
      ' aria-label="' + esc(r.nome) + '"><span class="au-trilho" aria-hidden="true"></span></label>' +
    '<div class="au-txt"><b>' + esc(r.nome) + '</b><div class="sub">' + esc(r.descricao) + '</div></div>' +
    '<div class="au-cfg">' +
      (SEM_DIAS.includes(r.chave) ? '' : '<label class="au-dias">N = <input type="number" min="0" max="90" data-au-dias="' + r.chave + '" value="' + r.dias + '"' + (admin ? '' : ' disabled') + '> dia(s)</label>') +
      (r.grupo === 'tarefas' && !SEM_RESP.includes(r.chave) ? '<input class="au-resp" list="au-pessoas" data-au-resp="' + r.chave + '" value="' + esc(r.responsavel) + '" placeholder="responsável padrão"' + (admin ? '' : ' disabled') + '>' : '') +
      '<span class="pill ' + (porRegra[r.chave] ? 'aberto' : 'neutro') + '" title="Vezes que agiu nos últimos 30 dias">' + (porRegra[r.chave] || 0) + '× em 30 dias</span>' +
    '</div></div>';
  const rotina = (nome, quando, det, nivel, botao) => '<div class="au-item au-rotina"><span class="au-pt ' + nivel + '" aria-hidden="true"></span>' +
    '<div class="au-txt"><b>' + esc(nome) + '</b><div class="sub">' + det + '</div></div><div class="au-cfg"><span class="sub mono">' + (quando === false ? 'automática' : quando ? quandoRodou(quando) : 'nunca rodou') + '</span>' + (botao || '') + '</div></div>';
  const ult = (x) => x && x.valor ? x.valor : null;
  const erroEmail = emails.filter((m) => m.status === 'erro').length;
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Automações</h1><p>Tudo o que o sistema faz sozinho: com poucos lançamentos, várias ações encadeadas</p></div>' +
    '<div class="acoes"><button class="btn btn-o" id="au-rodar">↻ Rodar regras agora</button></div></div>' +
    '<div class="kpis">' + kpi('Ligadas', ligadas + ' de ' + regras.length, 'verde', 'automações ativas') + kpi('Ações em 30 dias', String(acoes), '', 'tarefas criadas/concluídas e e-mails') +
      kpi('E-mails ao cliente', String(envCli), envCli ? '' : 'ambar', 'enviados nos últimos 30 dias') +
      kpi('Última execução', ult(ultReg) ? quandoCurto(ult(ultReg).quando) : '—', '', ult(ultReg) ? ult(ultReg).criadas + ' novidade(s)' : 'as regras rodam todo dia útil de manhã') + '</div>' +
    GRUPOS_AUTOMACAO.map(([g, tit, desc]) => { const rs = regras.filter((r) => (r.grupo || 'tarefas') === g); return rs.length ?
      '<div class="card"><div class="card-hd">' + tit + '<span class="sub" style="margin-left:auto;font-weight:400">' + esc(desc) + '</span></div><div class="au-lista">' + rs.map(linha).join('') + '</div></div>' : ''; }).join('') +
    '<div class="card"><div class="card-hd">⏱ Rotinas agendadas<span class="sub" style="margin-left:auto;font-weight:400">rodam sozinhas no Supabase; aqui dá para conferir e rodar agora</span></div><div class="au-lista">' +
      rotina('Regras e e-mails ao cliente', ult(ultReg) && ult(ultReg).quando, 'Dias úteis, 7h', ult(ultReg) ? 'ok' : 'atencao') +
      rotina('Busca de publicações (DJEN)', ult(ultPub) && ult(ultPub).quando, 'Dias úteis, 7h e 13h' + (ult(ultPub) ? ' · ' + ult(ultPub).novas + ' nova(s) na última' : ''), ult(ultPub) ? ((ult(ultPub).erros || []).length ? 'critico' : 'ok') : 'atencao',
        admin ? '<button class="btn btn-o btn-mini" data-au-fn="erp-publicacoes">Rodar agora</button>' : '') +
      rotina('Cartão CNPJ', cnpj[0] && cnpj[0].inicio, 'Todo dia, 6h' + (cnpj[0] ? ' · ' + esc(cnpj[0].mensagem || cnpj[0].status) : ''), !cnpj[0] ? 'atencao' : cnpj[0].status === 'erro' ? 'critico' : cnpj[0].status === 'parcial' ? 'atencao' : 'ok',
        admin ? '<button class="btn btn-o btn-mini" data-au-fn="erp-cnpj">Rodar agora</button>' : '') +
      rotina('Mensalidades de consultoria', false, 'Todo dia, 6h30 · gera a competência do mês e reajusta pelo salário mínimo', 'ok') +
      (admin ? rotina('Envio de e-mails', emails.length ? emails.map((m) => m.criado_em).sort().pop() : null, 'A cada 10 minutos · últimos 7 dias: ' + emails.filter((m) => m.status === 'enviado').length + ' enviado(s)' + (erroEmail ? ', ' + erroEmail + ' com erro' : ''), erroEmail ? 'critico' : 'ok') +
        rotina('Backup semanal', backup[0] && backup[0].criado_em, 'Domingo, 3h · guarda as 8 últimas cópias', !backup[0] ? 'atencao' : Date.now() - new Date(backup[0].criado_em) > 8 * 864e5 ? 'critico' : 'ok',
          '<button class="btn btn-o btn-mini" data-au-fn="erp-backup">Rodar agora</button>') : '') +
    '</div></div>' +
    '<div class="card"><div class="card-hd">🧾 Últimas ações automáticas</div>' +
      (log.length ? '<div class="tabela-wrap"><table><thead><tr><th>Quando</th><th>O que aconteceu</th></tr></thead><tbody>' +
        log.map((l) => '<tr' + (l.cliente_id ? ' class="clicavel" data-cli="' + l.cliente_id + '"' : '') + '><td class="mono">' + quandoRodou(l.quando) + '</td><td>' + esc(l.descricao) + '</td></tr>').join('') + '</tbody></table></div>'
        : vazio('Nenhuma ação automática ainda. Elas aparecem aqui assim que acontecerem.')) + '</div>' +
    datalistPessoas('au-pessoas');
  const salvar = async (chave, campos, msg) => { await q(sb.from('regras_tarefas').update(campos).eq('chave', chave)); aviso('✓ ' + msg); };
  $('conteudo').querySelectorAll('[data-au-lig]').forEach((c) => c.onchange = async () => {
    try { await salvar(c.dataset.auLig, { ligada: c.checked }, (c.checked ? 'Ligada: ' : 'Desligada: ') + c.closest('.au-item').querySelector('b').textContent);
      c.closest('.au-item').classList.toggle('ligada', c.checked); } catch (e) { c.checked = !c.checked; aviso(erroAmigavel(e), true); }
  });
  $('conteudo').querySelectorAll('[data-au-dias]').forEach((c) => c.onchange = () => salvar(c.dataset.auDias, { dias: Math.max(0, parseInt(c.value, 10) || 0) }, 'Prazo atualizado.').catch((e) => aviso(erroAmigavel(e), true)));
  $('conteudo').querySelectorAll('[data-au-resp]').forEach((c) => c.onchange = () => salvar(c.dataset.auResp, { responsavel: c.value.trim() }, 'Responsável atualizado.').catch((e) => aviso(erroAmigavel(e), true)));
  $('conteudo').querySelectorAll('[data-cli]').forEach((tr) => tr.onclick = () => abrirFicha(tr.dataset.cli));
  $('au-rodar').onclick = (ev) => comBotao(ev.currentTarget, async () => { const n = await q(sb.rpc('rodar_regras_tarefas')); aviso('✓ Regras rodadas: ' + n + ' novidade(s).'); await TELAS.automacoes(); });
  $('conteudo').querySelectorAll('[data-au-fn]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const r = await chamarFuncao(b.dataset.auFn, { acao: 'rodar' }); aviso('✓ ' + (r.mensagem || 'Feito.')); await TELAS.automacoes();
  }));
};
