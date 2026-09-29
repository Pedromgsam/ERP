'use strict';
// ═══════════════════════════════════════════════════════════════════
// Aprovações — alterações feitas em modo "Rascunho" (estagiários).
// Quem edita a área vê o que mudou (antes → depois) e aprova ou recusa;
// quem propôs acompanha as próprias. Nada vale antes da aprovação.
// ═══════════════════════════════════════════════════════════════════
const ROT_CAMPO = { nome: 'Nome', cpf_cnpj: 'CPF/CNPJ', area: 'Área', tipo: 'Tipo', responsavel: 'Responsável', email: 'E-mail', telefone: 'Telefone', obs: 'Observação',
  descricao: 'Descrição', valor: 'Valor', vencimento: 'Vencimento', pago: 'Pago', data_pagamento: 'Data do pagamento', processo: 'Processo', numero: 'Número',
  status: 'Situação', grupo_id: 'Grupo', cliente_id: 'Cliente', comprovante_processo: 'Comprovante no processo', comprovante_id: 'ID do comprovante', servico: 'Área do serviço', perfil_email: 'E-mails de cobrança' };
function valorCampo(k, v) {
  if (v == null || v === '') return '<span class="sub">—</span>';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (k === 'grupo_id') return esc(nomeGrupo(v) || v);
  if (k === 'cliente_id') { const c = E.clientes.find((x) => x.id === v); return esc(c ? c.nome : v); }
  if (k === 'area') return esc(rotArea(v));
  if (/^(valor|rfb|pgfn|sefaz_mg|age_mg)/.test(k) && !isNaN(Number(v))) return brl(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return dataBR(v);
  return esc(typeof v === 'object' ? JSON.stringify(v) : v);
}
// antes → depois, só do que muda
function diferencas(r) {
  const d = Array.isArray(r.dados) ? r.dados[0] || {} : r.dados || {}, a = r.antes || {};
  if (r.operacao === 'excluir') return '<div class="ap-dif"><span class="pill vencido">Excluir</span> ' + esc(a.nome || a.descricao || a.processo || a.numero || 'registro') + '</div>';
  const ks = Object.keys(d).filter((k) => !/^(id|atualizado_em|criado_em|criado_por)$/.test(k) && (r.operacao === 'incluir' ? d[k] != null && d[k] !== '' : JSON.stringify(d[k]) !== JSON.stringify(a[k])));
  if (!ks.length) return '<div class="sub">Sem mudança de conteúdo.</div>';
  return '<table class="ap-tab"><tbody>' + ks.slice(0, 14).map((k) => '<tr><th>' + esc(ROT_CAMPO[k] || k.replace(/_/g, ' ')) + '</th>' +
    (r.operacao === 'alterar' ? '<td class="ap-antes">' + valorCampo(k, a[k]) + '</td><td class="ap-seta">→</td>' : '') + '<td class="ap-depois">' + valorCampo(k, d[k]) + '</td></tr>').join('') +
    (ks.length > 14 ? '<tr><td colspan="4" class="sub">+ ' + (ks.length - 14) + ' campo(s)</td></tr>' : '') + '</tbody></table>';
}

TELAS.aprovacoes = async function () {
  await carregarCadastros();
  const lista = await q(sb.from('rascunhos').select('*').order('criado_em', { ascending: false }).limit(200)).catch(() => []);
  const eu = E.perfil.id, pend = lista.filter((r) => r.status === 'pendente');
  const paraMim = pend.filter((r) => r.autor !== eu && pode(r.funcao, 'aprovar'));
  const minhas = lista.filter((r) => r.autor === eu);
  const outras = lista.filter((r) => r.status !== 'pendente' && r.autor !== eu).slice(0, 30);
  const SIT = { pendente: ['hoje', 'Aguardando'], aprovado: ['pago', 'Aprovado'], recusado: ['vencido', 'Recusado'], cancelado: ['neutro', 'Cancelado'] };
  const cartao = (r, acoes) => '<div class="ap-item" data-rasc="' + r.id + '"><div class="ap-hd"><div><b>' + esc(r.resumo || r.tabela) + '</b>' +
      '<div class="sub">' + esc(r.autor_nome || 'alguém') + ' · ' + dataHoraBR(r.criado_em) + (r.revisor_nome ? ' · ' + (r.status === 'aprovado' ? 'aprovado' : 'decidido') + ' por ' + esc(r.revisor_nome) : '') + '</div></div>' +
      '<span class="pill ' + SIT[r.status][0] + '">' + SIT[r.status][1] + '</span></div>' + diferencas(r) +
      (r.motivo ? '<div class="dica" style="margin-top:8px">Motivo: ' + esc(r.motivo) + '</div>' : '') +
      (acoes ? '<div class="ap-acoes">' + acoes + '</div>' : '') + '</div>';
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Aprovações</h1><p>Alterações feitas em modo rascunho: só valem depois que alguém que edita a área aprovar</p></div></div>' +
    '<div class="kpis">' + kpi('Para você aprovar', String(paraMim.length), paraMim.length ? 'ambar' : 'verde', paraMim.length ? 'aguardando decisão' : 'nada pendente') +
      kpi('Suas propostas pendentes', String(minhas.filter((r) => r.status === 'pendente').length), '', 'enviadas por você') +
      kpi('Aprovadas em 30 dias', String(lista.filter((r) => r.status === 'aprovado' && Date.now() - new Date(r.decidido_em) < 30 * 864e5).length), 'verde', 'já valendo no sistema') + '</div>' +
    (paraMim.length || !minhas.length ? '<div class="card"><div class="card-hd">📝 Aguardando sua aprovação<span class="pill neutro">' + paraMim.length + '</span></div><div class="ap-lista">' +
      (paraMim.length ? paraMim.map((r) => cartao(r, '<button class="btn btn-o btn-mini" data-recusar="' + r.id + '">Recusar</button><button class="btn btn-v btn-mini" data-aprovar="' + r.id + '">✓ Aprovar</button>')).join('')
        : vazio('Nada aguardando aprovação. Quem tem o nível "Rascunho" nas Funções envia as alterações para cá.')) + '</div></div>' : '') +
    (minhas.length ? '<div class="card"><div class="card-hd">🗂 Minhas propostas</div><div class="ap-lista">' +
      minhas.slice(0, 40).map((r) => cartao(r, r.status === 'pendente' ? '<button class="btn btn-o btn-mini" data-cancelar-rasc="' + r.id + '">Desistir</button>' : '')).join('') + '</div></div>' : '') +
    (outras.length ? blocoRecolhivel('ap-hist', '🧾 Decididas recentemente (' + outras.length + ')', '<div class="ap-lista">' + outras.map((r) => cartao(r)).join('') + '</div>') : '');
  const depois = async (msg) => { aviso(msg); await carregarCadastros(true); if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); else await TELAS.aprovacoes(); };
  $('conteudo').querySelectorAll('[data-aprovar]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    await q(sb.rpc('aprovar_rascunho', { p_id: b.dataset.aprovar })); await depois('✓ Aprovado: a alteração já vale no sistema.');
  }));
  $('conteudo').querySelectorAll('[data-recusar]').forEach((b) => b.onclick = () => {
    const j = abrirJanela({ titulo: 'Recusar alteração', corpo: campo('Motivo (a pessoa recebe o aviso)', '<textarea name="motivo" maxlength="500" placeholder="Ex.: o CNPJ está errado; confira na procuração"></textarea>', 'inteiro'),
      rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Voltar</button><button class="btn btn-x" type="button" id="ap-recusar">Recusar</button></div>' });
    j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
    j.querySelector('#ap-recusar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
      await q(sb.rpc('recusar_rascunho', { p_id: b.dataset.recusar, p_motivo: j.querySelector('[name=motivo]').value.trim() }));
      fecharJanela(j); aviso('Alteração recusada. A pessoa foi avisada.'); await TELAS.aprovacoes();
    });
  });
  $('conteudo').querySelectorAll('[data-cancelar-rasc]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    await q(sb.rpc('recusar_rascunho', { p_id: b.dataset.cancelarRasc, p_motivo: '' })); aviso('Proposta cancelada.'); await TELAS.aprovacoes();
  }));
};

// Início: aviso de aprovações pendentes (quem aprova) e das próprias propostas (quem está em rascunho)
async function cardAprovacoes() {
  const temRascunho = FUNCOES_PROPOR.some((f) => emRascunho(f));
  const podeAprovar = E.perfil.papel === 'admin' || FUNCOES_PROPOR.some((f) => pode(f, 'aprovar'));
  if (!temRascunho && !podeAprovar) return '';
  const pend = await q(sb.from('rascunhos').select('id, autor, funcao').eq('status', 'pendente')).catch(() => []);
  const paraMim = pend.filter((r) => r.autor !== E.perfil.id && pode(r.funcao, 'aprovar')).length, minhas = pend.filter((r) => r.autor === E.perfil.id).length;
  if (!paraMim && !temRascunho) return '';
  return '<div class="faixa-aprov' + (paraMim ? ' tem' : '') + '"><span class="faixa-ic" aria-hidden="true">📝</span><div>' +
    (paraMim ? '<b>' + paraMim + ' alteração(ões) aguardando sua aprovação</b><div class="sub">Feitas em modo rascunho: só valem depois que você aprovar.</div>'
      : '<b>Você está em modo rascunho</b><div class="sub">O que você salvar vai para aprovação' + (minhas ? ' · ' + minhas + ' aguardando' : '') + '.</div>') +
    '</div><button class="btn btn-o btn-mini" data-ir-aprovacoes>Abrir Aprovações</button></div>';
}
document.addEventListener('click', (ev) => { if (ev.target.closest && ev.target.closest('[data-ir-aprovacoes]')) irParaTela('aprovacoes'); });
