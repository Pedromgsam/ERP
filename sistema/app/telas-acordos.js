'use strict';
// ═══════════════════════════════════════════════════════════════════
// Acordos — detalhe da parcela (clicar na linha): o que é o acordo, todas as
// parcelas do mesmo processo (pagas, a pagar, vencidas), o processo ligado e
// as ações (baixa, editar, lembrar o cliente). Acordo é dívida do CLIENTE com
// terceiros: nada aqui entra no financeiro do escritório.
// ═══════════════════════════════════════════════════════════════════
async function detalheAcordo(id) {
  const a = await q(sb.from('acordos').select('*').eq('id', id).single());
  const [irmas, proc, cli] = await Promise.all([
    q(sb.from('acordos').select('*').eq('processo', a.processo).order('vencimento')),
    q(sb.from('processos').select('id, numero, natureza, autor, reu, status, advogado, competencia').eq('numero', a.processo).maybeSingle()).catch(() => null),
    a.grupo_id ? q(sb.from('clientes').select('id, nome, telefone, email, responsavel').eq('grupo_id', a.grupo_id).order('nome')).catch(() => []) : []
  ]);
  const h = hojeISO();
  const sit = (x) => x.pago ? ['pago', 'Pago' + (x.data_pagamento ? ' em ' + dataBR(x.data_pagamento) : '')] : x.vencimento && x.vencimento < h ? ['vencido', 'Vencida'] : x.vencimento === h ? ['hoje', 'Vence hoje'] : ['aberto', 'A pagar'];
  const pagas = irmas.filter((x) => x.pago), abertas = irmas.filter((x) => !x.pago), vencidas = abertas.filter((x) => x.vencimento && x.vencimento < h);
  const devedor = cli.find((c) => normalizar(c.nome) === normalizar(a.devedor)) || null;
  const tel = soDigitos((devedor && devedor.telefone) || '');
  const lin = (r, v) => v ? '<div class="dado"><span>' + r + '</span><b>' + v + '</b></div>' : '';
  const s = sit(a);
  const j = abrirJanela({ titulo: 'Acordo — parcela ' + (a.parcela || '?') + (a.total_parcelas ? '/' + a.total_parcelas : ''), larga: true,
    corpo:
      '<div class="ficha-topo"><div><div class="ficha-sub">Processo <b class="mono">' + esc(a.processo) + '</b>' + (a.grupo_id ? ' · ' + esc(nomeGrupo(a.grupo_id)) : '') + '</div>' +
      '<div class="ficha-selos"><span class="pill ' + s[0] + '">' + esc(s[1]) + '</span> <span class="mono"><b>' + brl(a.valor) + '</b></span> <span class="sub">vence ' + dataBR(a.vencimento) + '</span></div></div>' +
      '<div class="ficha-atalhos">' + (a.pago ? '' : '<button class="btn btn-v btn-mini" id="ac-baixa">✓ Marcar paga hoje</button>') +
      '<button class="btn btn-o btn-mini" id="ac-lembrar">+ Tarefa: lembrar o cliente</button>' +
      (tel ? '<a class="btn btn-o btn-mini" target="_blank" rel="noopener" href="https://wa.me/' + (tel.length <= 11 ? '55' : '') + tel + '?text=' +
        encodeURIComponent('Olá! Lembrete: a parcela ' + (a.parcela || '') + ' do acordo com ' + (a.credor || 'o credor') + ', de ' + brl(a.valor) + ', vence em ' + dataBR(a.vencimento) + '.') + '">WhatsApp</a>' : '') +
      '<button class="btn btn-p btn-mini" id="ac-editar">Editar</button></div></div>' +
      '<div class="dica" style="margin-bottom:12px">Acordo é uma <b>dívida do cliente com terceiros</b> (não é honorário do escritório): não entra no Financeiro.</div>' +
      '<div class="duas-col"><div class="dados">' + lin('Devedor (cliente)', esc(a.devedor)) + lin('Credor', esc(a.credor)) + lin('Responsável', esc(a.responsavel)) +
        lin('Parcela', esc((a.parcela || '—') + (a.total_parcelas ? ' de ' + a.total_parcelas : ''))) + lin('Valor', brl(a.valor)) + lin('Vencimento', dataBR(a.vencimento)) +
        lin('Aviso', esc(a.situacao && !/^(ok|pago|vencido)$/i.test(a.situacao) ? a.situacao : '')) + lin('PIX', esc(a.pix)) + lin('Banco', esc(a.banco)) + lin('Observação', esc(a.obs)) + '</div>' +
      '<div class="dados">' + (proc ? lin('Processo cadastrado', esc(proc.natureza || 'processo')) + lin('Partes', esc([proc.autor, proc.reu].filter(Boolean).join(' × '))) +
        lin('Situação do processo', esc(proc.status)) + lin('Advogado', esc(proc.advogado)) + lin('Competência', esc(proc.competencia)) : '<div class="sub">Este processo não está cadastrado em Jurídico → Processos.</div>') +
        (devedor ? lin('Contato do cliente', esc([devedor.telefone, devedor.email].filter(Boolean).join(' · '))) : '') + '</div></div>' +
      '<div class="kpis" style="margin-top:12px">' + kpi('Pago', brl(soma(pagas, (x) => x.valor)), 'verde', pagas.length + ' de ' + irmas.length + ' parcela(s)') +
        kpi('A pagar', brl(soma(abertas, (x) => x.valor)), '', abertas.length + ' parcela(s)') +
        kpi('Vencidas', brl(soma(vencidas, (x) => x.valor)), vencidas.length ? 'vermelho' : 'verde', vencidas.length + ' parcela(s)') + '</div>' +
      '<div class="secao" style="margin:8px 0">Todas as parcelas deste acordo</div>' +
      '<div class="tabela-wrap"><table><thead><tr><th>Parcela</th><th>Vencimento</th><th class="num">Valor</th><th>Situação</th></tr></thead><tbody>' +
      irmas.map((x) => { const t = sit(x); return '<tr' + (x.id === a.id ? ' class="linha-atual"' : '') + '><td>' + esc((x.parcela || '—') + (x.total_parcelas ? '/' + x.total_parcelas : '')) + '</td><td class="mono">' + dataBR(x.vencimento) +
        '</td><td class="num mono">' + brl(x.valor) + '</td><td><span class="pill ' + t[0] + '">' + esc(t[1]) + '</span></td></tr>'; }).join('') + '</tbody></table></div>' });
  j.querySelector('.janela').classList.add('ficha');
  const b = j.querySelector('#ac-baixa');
  if (b) b.onclick = () => comBotao(b, async () => {
    await q(sb.from('acordos').update({ pago: true, data_pagamento: hojeISO() }).eq('id', id));
    aviso('✓ Parcela do acordo marcada como paga.'); fecharJanela(j); await recarregar(); detalheAcordo(id);
  });
  j.querySelector('#ac-editar').onclick = () => { fecharJanela(j); if (window.ERP_EDITAR) window.ERP_EDITAR('acordos:' + id); };
  j.querySelector('#ac-lembrar').onclick = () => formTarefa({ titulo: 'Lembrar ' + (a.devedor || 'o cliente') + ' da parcela ' + (a.parcela || '') + ' do acordo com ' + (a.credor || 'o credor'),
    prazo: a.vencimento && a.vencimento > h ? somarDias(a.vencimento, -2) : h, responsavel: a.responsavel, grupo_id: a.grupo_id, processos_vinculados: a.processo,
    descricao: 'Valor ' + brl(a.valor) + ' · vencimento ' + dataBR(a.vencimento) }, async () => {});
}
