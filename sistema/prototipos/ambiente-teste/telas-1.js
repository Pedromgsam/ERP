/* Telas: Início, Parcelamentos e Financeiro (todas com as mesmas peças). */
(function(){
  var APP = window.APP, N = APP.N, ic = APP.ic, esc = APP.esc, brl = APP.brl, HOJE = DADOS.HOJE, DIA = DADOS.DIA;
  var D = function(){ return APP.D; };

  /* ── células comuns ── */
  APP.celEmpresa = function(c){ return '<span class="nome">' + esc(c.nome) + '</span><span class="doc">' + esc(c.doc) + '</span>'; };
  APP.celVenc = function(venc, pago){ var v = APP.vencTxt(venc, pago); return v.html; };
  APP.clsVenc = function(venc, pago){ return APP.vencTxt(venc, pago).cls; };
  APP.botaoBaixa = function(attr){ return '<button class="bt-baixa" type="button" ' + attr + '>' + ic('check') + 'Baixa</button>'; };
  APP.celEmissao = function(x, comBotao){
    var pa = N.pa(x.pa);
    if (pa.cliEmite) return '<span class="em cli">Cliente emite</span>';
    if (x.emitida) return '<span class="em ok">✓ Emitida ' + APP.fc(x.emitida) + '</span>';
    if (x.pago) return '<span class="traco">—</span>';
    return comBotao && (x.venc <= HOJE || APP.doMes(x.venc)) ? '<button class="bt-emitir" type="button" data-emitir="' + x.id + '">' + ic('doc') + 'Emitir</button>' : '<span class="em nao">Não emitida</span>';
  };
  // colunas padrão de uma lista de parcelas (vale para Parcelamentos, Rotina, Início e detalhe dos cartões)
  APP.colsParcelas = function(o){
    o = o || {};
    var C = [];
    if (!o.semGrupo) C.push({ k:'g', rot:'Grupo', html:function(x){ return APP.grupoTxt(N.grupoDe(x)); }, ord:function(x){ return APP.grupo(N.grupoDe(x)).nome; } });
    C.push({ k:'emp', rot:'Empresa', html:function(x){ return APP.celEmpresa(N.cliDe(x)); }, ord:function(x){ return N.cliDe(x).nome; } });
    C.push({ k:'plat', rot:'Plataforma', html:function(x){ return '<span class="plat">' + N.pa(x.pa).plat + '</span>'; }, ord:function(x){ return N.pa(x.pa).plat; } });
    C.push({ k:'nat', rot:'Natureza', html:function(x){ return esc(N.pa(x.pa).nat); }, ord:function(x){ return N.pa(x.pa).nat; } });
    if (!o.semNum) C.push({ k:'num', rot:'Nº parcelamento', cls:'num', html:function(x){ return N.pa(x.pa).num; }, ord:function(x){ return N.pa(x.pa).num; } });
    C.push({ k:'n', rot:'Parcela', cls:'dt', html:function(x){ return x.n + ' de ' + N.pa(x.pa).tot; }, ord:function(x){ return x.n; } });
    C.push({ k:'v', rot:'Valor', cls:'dir val', soma:true, html:function(x){ return brl(x.v); }, ord:function(x){ return x.v; } });
    C.push({ k:'venc', rot:'Vencimento', cls:'cen dt', clsR:function(x){ return APP.clsVenc(x.venc, x.pago); }, html:function(x){ return APP.celVenc(x.venc, x.pago); }, ord:function(x){ return +x.venc; } });
    if (o.emissao) C.push({ k:'em', rot:'Guia', cls:'cen', html:function(x){ return APP.celEmissao(x, true); }, ord:function(x){ return x.emitida ? +x.emitida : 0; } });
    if (!o.semBaixa) C.push({ k:'pago', rot:'Baixa', cls:'cen', html:function(x){ return x.pago ? '<span class="ok-txt">✓ Pago em ' + APP.fc(x.pago) + '</span>' : APP.botaoBaixa('data-baixa="' + x.id + '"'); }, ord:function(x){ return x.pago ? +x.pago : 0; } });
    return C;
  };
  // cliques de dentro das tabelas de parcelas (baixa, emitir) — um ouvinte para o sistema todo
  document.addEventListener('click', function(e){
    var b = e.target.closest('[data-baixa]'); if (b){ e.stopPropagation(); N.baixaParcela(N.parcela(b.dataset.baixa)); return; }
    var em = e.target.closest('[data-emitir]'); if (em){ e.stopPropagation(); APP.janelaEmitir(N.parcela(em.dataset.emitir)); return; }
  }, true);
  APP.listasParcelas = function(){
    return [{ k:'g', rot:'Grupo', todos:'Todos os grupos', opcoes:D().grupos.map(function(g){ return [g.id, g.nome]; }), get:function(x){ return N.grupoDe(x); } },
      { k:'plat', rot:'Plataforma', todos:'Todas as plataformas', opcoes:[['eCAC','eCAC'],['Regularize','Regularize'],['SIARE','SIARE']], get:function(x){ return N.pa(x.pa).plat; } },
      { k:'nat', rot:'Natureza', todos:'Todas as naturezas', opcoes:['Simples Nacional','INSS','Previdenciário','Não previdenciário','ICMS'].map(function(n){ return [n, n]; }), get:function(x){ return N.pa(x.pa).nat; } }];
  };
  APP.lotesParcelas = function(){
    return [{ rot:'Dar baixa', ic:'check', quando:function(x){ return !x.pago; }, fn:function(l){ return N.baixaLote(l); } },
      { rot:'Marcar guias como emitidas', ic:'doc', quando:N.paraEmitir, fn:function(l){ return APP.confirmar({ kick:'Emitir em lote', tit:'Marcar ' + APP.plural(l.length, 'guia', 'guias') + ' como emitidas?', ok:'Marcar emitidas',
        resumo:'<span>Use quando os PDFs já foram gerados no eCAC/Regularize/SIARE. Os e-mails ficam prontos na Caixa de saída para revisar (automação "Guia emitida → e-mail pronto").</span>' }).then(function(s){ if (!s) return false;
          APP.acao(APP.plural(l.length, 'guia marcada', 'guias marcadas') + ' como emitida(s).', function(){ var v = l.map(function(x){ return N.emitir(x, null); }); return function(){ v.forEach(function(f){ f(); }); }; }); }); } }];
  };

  /* ═════════ INÍCIO ═════════ */
  APP.registrar('inicio', { tit:'Início', ic:'inicio', sec:'Principal',
    ajuda:['Os cartões mostram o que pede ação hoje. <b>Clique em qualquer cartão</b> para abrir a lista logo abaixo.', 'O quadro "Resumo da manhã" é o e-mail que cada pessoa recebe às 07:30 (automação A1, em Administração → Automações).', '"Hoje as automações vão…" mostra tudo o que o sistema fará sozinho hoje — e para quem.'],
    desenhar:function(el){
      var eu = APP.pessoa(APP.pref('eu') || 'pedro');
      var atr = D().parcelas.filter(function(x){ return N.estado(x) === 'atraso'; }), hoje = atr.filter(function(x){ return +x.venc === +HOJE; });
      var honAtr = D().honorarios.filter(function(h){ return !h.rec && h.venc <= HOJE; });
      var guias = D().parcelas.filter(N.paraEmitir), revisar = D().emails.filter(function(e){ return e.status === 'revisar'; });
      var tarefas = D().tarefas.filter(function(t){ return !t.feita && t.prazo <= new Date(+HOJE + DIA); });
      el.innerHTML = APP.cabecalho({ ic:'inicio', tit:'Bom dia, ' + eu.curto, frase:'Sexta-feira, 9 de outubro de 2026 · o que pede ação hoje', acoes:'<label class="campo" style="flex-direction:row;align-items:center;gap:8px"><span class="rot">Ver como</span><select class="ctl" id="ini-eu">' + D().equipe.map(function(p){ return '<option value="' + p.id + '"' + (p.id === eu.id ? ' selected' : '') + '>' + esc(p.curto) + '</option>'; }).join('') + '</select></label>' })
        + '<div id="ini-cartoes"></div><div class="sec-cab"><div><h2>Hoje as automações vão…</h2><p>O que o sistema faz sozinho hoje. Para mudar horário ou desligar para um cliente: Administração → Automações.</p></div></div><div id="ini-auto"></div>'
        + '<div class="sec-cab"><div><h2>Tarefas</h2><p>As suas e as criadas pelas automações. Concluir tem "Desfazer".</p></div></div><div id="ini-tarefas"></div>'
        + '<div class="sec-cab"><div><h2>Resumo da manhã</h2><p>Prévia do e-mail que ' + esc(eu.curto) + ' recebe às ' + N.auto('resumo_manha').hora + ' (A1).</p></div></div><div id="ini-resumo"></div>';
      APP.$('ini-eu').onchange = function(){ APP.pref('eu', this.value); APP.redesenhar(); };
      APP.cartoes(APP.$('ini-cartoes'), 'inicio', [
        { id:'atr', cor:'r', ic:'alerta', rot:'Parcelas em atraso', v:String(atr.length), vcls:atr.length ? 'r' : '', sub:brl(atr.reduce(function(s, x){ return s + x.v; }, 0)) + ' · ' + APP.plural(hoje.length, 'vence', 'vencem') + ' hoje', det:function(c){ APP.tabela(c, { id:'ini-atr', titulo:'Parcelas em atraso (inclui as de hoje)', linhas:atr, colunas:APP.colsParcelas({ semNum:true }), busca:function(x){ return N.cliDe(x).nome; }, valor:function(x){ return x.v; }, venc:function(x){ return x.venc; }, ord:{ k:'venc', dir:1 }, unidade:['parcela','parcelas'], clique:APP.editarParcela, lote:APP.lotesParcelas(), altura:'420px' }); } },
        { id:'hon', cor:'r', ic:'dinheiro', rot:'Honorários em atraso', v:brl(honAtr.reduce(function(s, h){ return s + h.v; }, 0)), vcls:honAtr.length ? 'r' : '', sub:APP.plural(honAtr.length, 'lançamento', 'lançamentos'), det:function(c){ APP.tabela(c, APP.cfgHonorarios('ini-hon', honAtr, 'Honorários em atraso')); } },
        { id:'guias', cor:'a', ic:'doc', rot:'Guias a emitir', v:String(guias.length), sub:'prazo <b>dia 12</b>', det:function(c){ APP.tabela(c, { id:'ini-guias', titulo:'Guias a emitir (vencidas e do mês)', linhas:guias, colunas:APP.colsParcelas({ semNum:true, emissao:true, semBaixa:true }), valor:function(x){ return x.v; }, venc:function(x){ return x.venc; }, ord:{ k:'venc', dir:1 }, unidade:['guia','guias'], clique:APP.editarParcela, lote:APP.lotesParcelas(), altura:'420px' }); } },
        { id:'rev', cor:'b', ic:'email', rot:'E-mails para revisar', v:String(revisar.length), sub:'prontos na Caixa de saída', det:function(c){ APP.tabela(c, APP.cfgEmails('ini-rev', revisar, 'E-mails prontos para revisar')); } },
        { id:'tar', cor:'g', ic:'tarefa', rot:'Tarefas até amanhã', v:String(tarefas.length), sub:APP.plural(tarefas.filter(function(t){ return t.origem !== 'manual'; }).length, 'criada', 'criadas') + ' pelas automações', det:function(c){ APP.tabela(c, APP.cfgTarefas('ini-tar', tarefas, 'Tarefas até amanhã')); } }
      ]);
      var hojeAuto = N.proximas(0).filter(function(p){ return APP.doMes(p.quando) && p.quando.getDate() === HOJE.getDate(); });
      APP.tabela(APP.$('ini-auto'), APP.cfgProximas('ini-auto', hojeAuto, 'Hoje'));
      APP.tabela(APP.$('ini-tarefas'), APP.cfgTarefas('ini-tarefas-t', D().tarefas, null, true));
      var minhas = D().tarefas.filter(function(t){ return !t.feita && t.resp === eu.id; });
      APP.$('ini-resumo').innerHTML = '<div class="previa-email" style="max-width:720px"><div class="pe-hd">Araújo &amp; Castro · Resumo da manhã — ' + APP.fd(HOJE) + '</div><div class="pe-bd">Bom dia, ' + esc(eu.curto) + '.\n\n'
        + 'Vencem hoje: ' + APP.plural(hoje.length, 'parcela', 'parcelas') + ' de parcelamento.\nEm atraso: ' + APP.plural(atr.length, 'parcela', 'parcelas') + ' (' + brl(atr.reduce(function(s, x){ return s + x.v; }, 0)) + ') e ' + APP.plural(honAtr.length, 'honorário', 'honorários') + '.\n'
        + 'Guias a emitir até o dia 12: ' + guias.length + '.\nE-mails esperando a sua revisão: ' + revisar.length + '.\n\nSuas tarefas:\n' + (minhas.length ? minhas.map(function(t){ return '• ' + t.tit + ' (prazo ' + APP.fc(t.prazo) + ')'; }).join('\n') : '• nenhuma em aberto')
        + '\n\nAbrir o ERP: erp.araujocastro.adv.br</div></div>';
    } });

  /* ── tarefas e próximas automações (usadas em várias telas) ── */
  APP.cfgTarefas = function(id, lista, titulo, comAbas){
    return { id:id, titulo:titulo || 'Tarefas', linhas:lista, unidade:['tarefa','tarefas'], ord:{ k:'prazo', dir:1 },
      abas: comAbas ? [{ id:'ab', rot:'Abertas', f:function(t){ return !t.feita; }, cor:'r' }, { id:'fe', rot:'Concluídas', f:function(t){ return !!t.feita; } }] : null,
      busca:function(t){ return t.tit; }, venc:function(t){ return t.prazo; },
      listas:[{ k:'resp', rot:'Responsável', todos:'Todas as pessoas', opcoes:D().equipe.map(function(p){ return [p.id, p.curto]; }), get:function(t){ return t.resp; } },
        { k:'origem', rot:'Origem', todos:'Manuais e automáticas', opcoes:[['manual','Manuais'],['risco_rescisao','Parcelamento em risco'],['conferencia_mes','Conferência mensal']], get:function(t){ return t.origem; } }],
      colunas:[{ k:'tit', rot:'Tarefa', html:function(t){ return esc(t.tit) + (t.origem !== 'manual' ? ' <span class="tag-auto" title="Criada por uma automação">automática</span>' : ''); } },
        { k:'resp', rot:'Responsável', html:function(t){ return esc(APP.pessoa(t.resp).curto); } },
        { k:'prazo', rot:'Prazo', cls:'cen dt', clsR:function(t){ return t.feita ? '' : APP.clsVenc(t.prazo, false); }, html:function(t){ return t.feita ? APP.fd(t.prazo) : APP.celVenc(t.prazo, false); }, ord:function(t){ return +t.prazo; } },
        { k:'feita', rot:'Concluir', cls:'cen', html:function(t){ return t.feita ? '<span class="ok-txt">✓ ' + APP.fc(t.feita) + '</span>' : '<button class="bt-baixa" type="button" data-concluir="' + t.id + '">' + ic('check') + 'Concluir</button>'; }, ord:function(t){ return t.feita ? +t.feita : 0; } }],
      lote:[{ rot:'Concluir', ic:'check', quando:function(t){ return !t.feita; }, fn:function(l){ APP.acao(APP.plural(l.length, 'tarefa concluída', 'tarefas concluídas') + '.', function(){ var v = l.map(function(t){ var f = APP.foto(t, ['feita']); t.feita = new Date(HOJE); return f; }); return function(){ v.forEach(function(f){ f(); }); }; }); } }],
      clique:function(t){ var pa = t.ref && N.pa(t.ref); if (pa) APP.janelaParcelamento(pa); else APP.aviso('Tarefa: ' + t.tit); } };
  };
  document.addEventListener('click', function(e){ var b = e.target.closest('[data-concluir]'); if (!b) return; e.stopPropagation(); var t = D().tarefas.find(function(x){ return x.id === b.dataset.concluir; });
    APP.acao('Tarefa concluída.', function(){ var f = APP.foto(t, ['feita']); t.feita = new Date(HOJE); return f; }); }, true);
  APP.cfgProximas = function(id, lista, titulo){
    return { id:id, titulo:titulo, linhas:lista, unidade:['ação','ações'], ord:{ k:'quando', dir:1 }, chave:function(p){ return p.auto + '|' + (p.ref || p.cli || p.para) + '|' + +p.quando; },
      busca:function(p){ return p.para + ' ' + p.oque; }, venc:function(p){ return p.quando; },
      listas:[{ k:'auto', rot:'Automação', todos:'Todas as automações', opcoes:D().automacoes.map(function(a){ return [a.id, a.nome]; }), get:function(p){ return p.auto; } },
        { k:'lig', rot:'Situação', todos:'Vai acontecer e desligadas', opcoes:[['sim','Vai acontecer'],['nao','Não vai (desligada)']], get:function(p){ return p.ligada ? 'sim' : 'nao'; } }],
      colunas:[{ k:'quando', rot:'Quando', cls:'dt', html:function(p){ return p.quandoTxt ? esc(p.quandoTxt) : APP.fd(p.quando) + ' <small>' + APP.fh(p.quando) + '</small>'; }, ord:function(p){ return +p.quando; } },
        { k:'auto', rot:'Automação', html:function(p){ return esc(N.auto(p.auto).nome); } },
        { k:'para', rot:'Para quem', html:function(p){ return esc(p.para); } },
        { k:'oque', rot:'O que acontece', html:function(p){ return esc(p.oque); } },
        { k:'lig', rot:'Situação', cls:'cen', html:function(p){ return p.ligada ? '<span class="pill p-g">Vai acontecer</span>' : '<span class="pill p-n" title="' + esc(p.motivo) + '">Não vai · ' + esc(p.motivo) + '</span>'; }, ord:function(p){ return p.ligada ? 1 : 0; } }],
      clique:function(p){ APP.janelaAutomacao(N.auto(p.auto), p.cli); } };
  };

  /* ═════════ PARCELAMENTOS ═════════ */
  var grupoAberto = 'g2', chipSit = 'todos';
  APP.registrar('parcelamentos', { tit:'Parcelamentos', ic:'camadas', sec:'Jurídico',
    ajuda:['Primeiro a <b>situação por cliente</b> (um cartão por grupo; clique para ver os parcelamentos). Depois as <b>parcelas</b>.', '<b>Vencimento</b>: vermelho = em atraso (hoje conta como vencido); azul = a vencer. Pagas mostram "✓ Pago em" na coluna Baixa.', '<b>Filtros</b> abre vencimento e valor. O ícone de linhas deixa a tabela compacta.', 'Marque várias parcelas para <b>dar baixa</b> ou <b>marcar guias como emitidas</b> de uma vez — sempre com confirmação.', 'Toda baixa pede confirmação e tem "Desfazer" por alguns segundos.'],
    novo:function(){ APP.novoParcelamento(); },
    desenhar:function(el){
      var t = D().parcelas, atr = t.filter(function(x){ return N.estado(x) === 'atraso'; }), mes = t.filter(function(x){ return !x.pago && APP.doMes(x.venc); });
      var guias = t.filter(function(x){ return !N.pa(x.pa).cliEmite && !x.pago && (x.venc <= HOJE || APP.doMes(x.venc)); }), emit = guias.filter(function(x){ return x.emitida; });
      var pago = 0, falta = 0; t.forEach(function(x){ if (x.pago) pago += x.v; else falta += x.v; });
      el.innerHTML = APP.cabecalho({ ic:'camadas', tit:'Parcelamentos', frase:'Parcelas dos clientes no eCAC, Regularize e SIARE, por vencimento', acoes:'<button class="bt bt-p" type="button" id="pa-novo">' + ic('mais') + 'Novo parcelamento</button>' })
        + '<div id="pa-cartoes"></div>'
        + '<div class="sec-cab"><div><h2>Situação dos parcelamentos por cliente</h2><p>Quanto cada grupo já pagou, quanto falta e o que vence este mês. Clique no cartão para ver cada parcelamento.</p></div><div class="chips" id="pa-chips">'
        + [['todos','Todos'],['atraso','Com atraso'],['dia','Em dia']].map(function(c){ return '<button class="chip" type="button" data-c="' + c[0] + '" aria-pressed="' + (chipSit === c[0]) + '">' + c[1] + '</button>'; }).join('') + '</div></div>'
        + '<div class="cartoes" id="pa-grupos"></div><div class="sec-cab"><div><h2>Parcelas</h2></div></div><div id="pa-tabela"></div>';
      APP.$('pa-novo').onclick = APP.novoParcelamento;
      APP.cartoes(APP.$('pa-cartoes'), 'parc', [
        { id:'atr', cor:'r', ic:'alerta', rot:'Parcelas em atraso', v:String(atr.length), vcls:atr.length ? 'r' : '', sub:brl(atr.reduce(function(s, x){ return s + x.v; }, 0)) + ' somadas · contando as de hoje', det:function(c){ APP.tabela(c, { id:'pa-det-atr', titulo:'Parcelas em atraso', linhas:atr, colunas:APP.colsParcelas({ semNum:true }), valor:function(x){ return x.v; }, venc:function(x){ return x.venc; }, ord:{ k:'venc', dir:1 }, unidade:['parcela','parcelas'], clique:APP.editarParcela, lote:APP.lotesParcelas(), altura:'420px' }); } },
        { id:'mes', cor:'b', ic:'cal', rot:'Vencem este mês', v:mes.length + ' <small>· ' + brl(mes.reduce(function(s, x){ return s + x.v; }, 0)) + ' no mês</small>', sub:'Emitir as guias até <b>dia 12</b>', det:function(c){ APP.tabela(c, { id:'pa-det-mes', titulo:'Vencem em outubro', linhas:mes, colunas:APP.colsParcelas({ semNum:true, emissao:true }), valor:function(x){ return x.v; }, venc:function(x){ return x.venc; }, ord:{ k:'venc', dir:1 }, unidade:['parcela','parcelas'], clique:APP.editarParcela, lote:APP.lotesParcelas(), altura:'420px' }); } },
        { id:'guias', cor:'a', ic:'doc', rot:'Guias a emitir', v:(guias.length - emit.length) + ' <small>de ' + guias.length + '</small>', barra:guias.length ? emit.length / guias.length * 100 : 100, barraCor:'a', sub:emit.length + ' já emitidas · prazo <b>dia 12</b>', det:function(c){ APP.tabela(c, { id:'pa-det-guias', titulo:'Guias a emitir', linhas:guias.filter(function(x){ return !x.emitida; }), colunas:APP.colsParcelas({ semNum:true, emissao:true, semBaixa:true }), valor:function(x){ return x.v; }, venc:function(x){ return x.venc; }, ord:{ k:'venc', dir:1 }, unidade:['guia','guias'], clique:APP.editarParcela, lote:APP.lotesParcelas(), altura:'420px' }); } },
        { id:'quit', cor:'g', ic:'pizza', rot:'Quitado / falta', linhas:[[brl(pago), 'já pago', 'g'], [brl(falta), 'falta pagar']], barra:pago / (pago + falta) * 100, sub:Math.round(pago / (pago + falta) * 100) + '% do total em andamento', det:function(c){
          var gs = D().grupos.map(function(g){ var r = { g:g, pago:0, falta:0, n:0 }; D().parcelamentos.forEach(function(pa){ if (APP.cli(pa.cli).g !== g.id) return; var rs = N.resumo(pa); r.pago += rs.quitado; r.falta += rs.falta; r.n++; }); r.id = g.id; return r; }).filter(function(r){ return r.n; });
          APP.tabela(c, { id:'pa-det-quit', titulo:'Quitado e falta, por grupo', linhas:gs, unidade:['grupo','grupos'], valor:function(r){ return r.falta; }, ord:{ k:'falta', dir:-1 },
            colunas:[{ k:'g', rot:'Grupo', html:function(r){ return APP.grupoTxt(r.g.id); }, ord:function(r){ return r.g.nome; } }, { k:'n', rot:'Parcelamentos', cls:'cen dt', html:function(r){ return r.n; } },
              { k:'pago', rot:'Já pago', cls:'dir val', html:function(r){ return '<span style="color:var(--green)">' + brl(r.pago) + '</span>'; } }, { k:'falta', rot:'Falta pagar', cls:'dir val', soma:true, html:function(r){ return brl(r.falta); } },
              { k:'pc', rot:'Quitado', html:function(r){ var pc = Math.round(r.pago / (r.pago + r.falta) * 100); return '<div class="prog"><div class="barra"><span style="width:' + pc + '%"></span></div><span>' + pc + '%</span></div>'; }, ord:function(r){ return r.pago / (r.pago + r.falta); } }],
            clique:function(r){ grupoAberto = r.g.id; APP.redesenhar(); setTimeout(function(){ var x = APP.$('pa-grupos'); if (x) x.scrollIntoView({ behavior:'smooth' }); }, 50); } }); } }
      ]);
      desenharGrupos();
      APP.$('pa-chips').onclick = function(e){ var b = e.target.closest('[data-c]'); if (!b) return; chipSit = b.dataset.c; APP.$('pa-chips').querySelectorAll('.chip').forEach(function(x){ x.setAttribute('aria-pressed', x === b); }); desenharGrupos(); };
      APP.tabela(APP.$('pa-tabela'), { id:'parcelas', linhas:t, colunas:APP.colsParcelas(), unidade:['parcela','parcelas'], dicaBusca:'Empresa, CNPJ ou nº',
        titulo:function(a){ return { atraso:'Parcelas em atraso (inclui as que vencem hoje)', avencer:'Todas as parcelas a vencer', pagas:'Todas as parcelas pagas' }[a]; },
        abas:[{ id:'atraso', rot:'Em atraso', cor:'r', f:function(x){ return N.estado(x) === 'atraso'; } }, { id:'avencer', rot:'A vencer', f:function(x){ return N.estado(x) === 'avencer'; } }, { id:'pagas', rot:'Pagas', f:function(x){ return !!x.pago; } }],
        ordAbas:{ atraso:{ k:'venc', dir:1 }, avencer:{ k:'venc', dir:1 }, pagas:{ k:'pago', dir:-1 } }, ord:{ k:'venc', dir:1 },
        busca:function(x){ var pa = N.pa(x.pa), c = APP.cli(pa.cli); return c.nome + ' ' + c.doc + ' ' + c.doc.replace(/\D/g, '') + ' ' + pa.num; }, listas:APP.listasParcelas(),
        venc:function(x){ return x.venc; }, valor:function(x){ return x.v; }, lote:APP.lotesParcelas(), clique:APP.editarParcela });
    } });
  function desenharGrupos(){
    var el = APP.$('pa-grupos'); if (!el) return;
    var html = '';
    D().grupos.forEach(function(g){
      var l = D().parcelamentos.filter(function(pa){ return APP.cli(pa.cli).g === g.id; }); if (!l.length) return;
      var pg = 0, tot = 0, falta = 0, atr = 0, mes = 0, somaMes = 0;
      l.forEach(function(pa){ var r = N.resumo(pa); pg += r.pg; tot += pa.tot; falta += r.falta; atr += r.atr; N.parcelasDe(pa).forEach(function(x){ if (!x.pago && (x.venc <= HOJE || APP.doMes(x.venc))){ mes++; somaMes += x.v; } }); });
      if (chipSit === 'atraso' && !atr) return; if (chipSit === 'dia' && atr) return;
      var pc = Math.round(pg / tot * 100), ab = grupoAberto === g.id;
      html += '<button type="button" class="cg" aria-expanded="' + ab + '" data-g="' + g.id + '"><div class="cg-hd"><span class="ponto" style="background:var(--g' + g.cor + ')"></span><b>' + esc(g.nome) + '</b>' + (atr ? '<span class="pill p-r">' + atr + ' em atraso</span>' : '<span class="pill p-g">Em dia</span>') + '</div>'
        + '<div class="cg-sub">' + APP.plural(l.length, 'parcelamento', 'parcelamentos') + ' · responsável ' + esc(APP.pessoa(g.resp).curto) + '</div><div class="barra"><span style="width:' + pc + '%"></span></div>'
        + '<div class="cg-lin"><span>Pagas</span><b><span style="color:var(--green)">' + pg + '</span> de ' + tot + '</b></div><div class="cg-lin"><span>Falta pagar</span><b>' + brl(falta) + '</b></div>'
        + '<div class="cg-lin"><span>A pagar este mês</span><b>' + (mes ? brl(somaMes) + ' <span style="font-weight:500;color:var(--text3)">(' + mes + ')</span>' : '—') + '</b></div></button>';
      if (ab) html += '<div class="det" id="pa-det-grupo"></div>';
    });
    el.innerHTML = html || '<div class="quadro det"><div class="vazio"><b>Nenhum grupo neste recorte</b><p>Troque o filtro acima.</p></div></div>';
    el.onclick = function(e){ var c = e.target.closest('.cg'); if (!c) return; grupoAberto = grupoAberto === c.dataset.g ? '' : c.dataset.g; desenharGrupos(); };
    var det = APP.$('pa-det-grupo');
    if (det){ var g = APP.grupo(grupoAberto), l = D().parcelamentos.filter(function(pa){ return APP.cli(pa.cli).g === grupoAberto; });
      APP.tabela(det, { id:'pa-grupo', titulo:g.nome + ' — clique no parcelamento para ver a ficha e todas as parcelas', linhas:l, unidade:['parcelamento','parcelamentos'], ord:{ k:'emp', dir:1 }, busca:function(pa){ return APP.cli(pa.cli).nome + ' ' + pa.num + ' ' + pa.nat; },
        valor:function(pa){ return N.resumo(pa).falta; }, livre:true,
        colunas:[{ k:'emp', rot:'Empresa', html:function(pa){ return APP.celEmpresa(APP.cli(pa.cli)); }, ord:function(pa){ return APP.cli(pa.cli).nome; } }, { k:'plat', rot:'Plataforma', html:function(pa){ return '<span class="plat">' + pa.plat + '</span>'; } },
          { k:'nat', rot:'Natureza', html:function(pa){ return esc(pa.nat); } }, { k:'num', rot:'Nº parcelamento', cls:'num', html:function(pa){ return pa.num; } },
          { k:'pg', rot:'Pagas', html:function(pa){ var r = N.resumo(pa), pc = Math.round(r.pg / pa.tot * 100); return '<div class="prog"><div class="barra"><span style="width:' + pc + '%"></span></div><span><b style="color:var(--green)">' + r.pg + '</b> de ' + pa.tot + '</span></div>'; }, ord:function(pa){ return N.resumo(pa).pg / pa.tot; } },
          { k:'falta', rot:'Falta pagar', cls:'dir val', soma:true, html:function(pa){ return brl(N.resumo(pa).falta); }, ord:function(pa){ return N.resumo(pa).falta; } },
          { k:'prox', rot:'Próxima', cls:'cen dt', html:function(pa){ var r = N.resumo(pa); return r.prox ? APP.fd(r.prox.venc) : '—'; }, ord:function(pa){ var r = N.resumo(pa); return r.prox ? +r.prox.venc : 9e15; } },
          { k:'atr', rot:'Situação', cls:'cen', html:function(pa){ var a = N.resumo(pa).atr; return a ? '<span class="n-atr">' + APP.plural(a, 'parcela', 'parcelas') + ' em atraso</span>' : '<span class="pill p-g">Em dia</span>'; }, ord:function(pa){ return N.resumo(pa).atr; } }],
        clique:APP.janelaParcelamento }); }
  }

  /* ── janela do parcelamento: ficha, 5 números, todas as parcelas, emitir e baixa ── */
  APP.janelaParcelamento = function(pa){
    var c = APP.cli(pa.cli), r = N.resumo(pa), pc = Math.round(r.pg / pa.tot * 100), emitir = N.parcelasDe(pa).filter(N.paraEmitir);
    var J = APP.janela({ larga:true, kick:'Parcelamento nº ' + pa.num, tit:c.nome, sub:esc(APP.grupo(c.g).nome) + ' · ' + pa.plat + ' · ' + esc(pa.nat), dir:r.atr ? '<span class="pill p-r">' + r.atr + ' em atraso</span>' : '<span class="pill p-g">Em dia</span>',
      corpo:'<div class="ficha"><div><span>CPF / CNPJ</span><b class="m">' + c.doc + '</b></div><div><span>Plataforma</span><b>' + pa.plat + '</b></div><div><span>Natureza</span><b>' + esc(pa.nat) + '</b></div><div><span>Nº do parcelamento</span><b class="m">' + pa.num + '</b></div>'
        + '<div><span>Total de parcelas</span><b>' + pa.tot + '</b></div><div><span>Valor da parcela</span><b>' + brl(pa.v) + '</b></div><div><span>Valor residual</span><b>' + brl(r.falta) + '</b></div><div><span>Guias</span><b>' + (pa.cliEmite ? 'O cliente emite' : 'Nós emitimos') + '</b></div></div>'
        + '<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">' + [['Parcelas pagas', r.pg + ' de ' + pa.tot + ' (' + pc + '%)', ''], ['Já quitado', brl(r.quitado), 'g'], ['Falta pagar', brl(r.falta), ''], ['Próxima parcela', r.prox ? APP.fd(r.prox.venc) : '—', ''], ['Em atraso', r.atr ? APP.plural(r.atr, 'parcela', 'parcelas') : 'nenhuma', r.atr ? 'r' : '']]
          .map(function(k){ return '<div class="kpi" style="cursor:default"><div class="kpi-tx"><div class="l" style="padding:0">' + k[0] + '</div><div class="v ' + k[2] + '" style="font-size:15px">' + k[1] + '</div></div></div>'; }).join('') + '</div>'
        + '<div id="jp-parcelas"></div>',
      rodape:'<button class="bt bt-g esq" type="button" id="jp-editar">Editar dados do parcelamento</button>' + (emitir.length ? '<button class="bt bt-o" type="button" id="jp-emitir">' + ic('doc') + 'Emitir guias (' + emitir.length + ')</button>' : '') + '<button class="bt bt-o" type="button" data-fechar>Fechar</button>' });
    APP.tabela(J.q('#jp-parcelas'), { id:'jp-' + pa.id, titulo:'Parcelas', linhas:N.parcelasDe(pa), unidade:['parcela','parcelas'], ord:{ k:'n', dir:1 }, valor:function(x){ return x.v; }, venc:function(x){ return x.venc; }, altura:'360px',
      abas:[{ id:'todas', rot:'Todas', f:function(){ return true; } }, { id:'abertas', rot:'Em aberto', f:function(x){ return !x.pago; } }, { id:'pagas', rot:'Pagas', f:function(x){ return !!x.pago; } }], abaPadrao:'abertas',
      colunas:[{ k:'n', rot:'Parcela', cls:'dt', html:function(x){ return x.n + '/' + pa.tot; } }, { k:'venc', rot:'Vencimento', cls:'dt', clsR:function(x){ return APP.clsVenc(x.venc, x.pago); }, html:function(x){ return APP.celVenc(x.venc, x.pago); }, ord:function(x){ return +x.venc; } },
        { k:'v', rot:'Valor', cls:'dir val', soma:true, html:function(x){ return brl(x.v); } }, { k:'em', rot:'Guia', html:function(x){ return APP.celEmissao(x, true); }, ord:function(x){ return x.emitida ? +x.emitida : 0; } },
        { k:'pago', rot:'Baixa', cls:'cen', html:function(x){ return x.pago ? '<span class="ok-txt">✓ Pago em ' + APP.fc(x.pago) + '</span>' : APP.botaoBaixa('data-baixa="' + x.id + '"'); }, ord:function(x){ return x.pago ? +x.pago : 0; } }],
      lote:APP.lotesParcelas(), clique:APP.editarParcela });
    J.q('#jp-editar').onclick = function(){ APP.formParcelamento(pa); };
    var em = J.q('#jp-emitir'); if (em) em.onclick = function(){ APP.janelaEmitir(emitir[0]); };
    APP._jp = { pa:pa, J:J };
    J.aoFechar = function(){ APP._jp = null; };
  };
  // depois de gravar, a janela do parcelamento aberta se atualiza sozinha
  var redesenharAntes = APP.redesenhar;
  APP.redesenhar = function(){ redesenharAntes(); if (APP._jp && document.body.contains(APP._jp.J.el)){ var pa = APP._jp.pa; APP._jp.J.fechar(); APP.janelaParcelamento(pa); } };

  /* ── editar parcela (clique na linha) ── */
  APP.editarParcela = function(x){
    var pa = N.pa(x.pa), c = APP.cli(pa.cli);
    var J = APP.janela({ kick:'Editar parcela', tit:'Parcela ' + x.n + ' de ' + pa.tot, sub:esc(c.nome),
      corpo:'<div class="ficha f2"><div><span>Grupo</span><b>' + APP.grupoTxt(c.g) + '</b></div><div><span>CPF / CNPJ</span><b class="m">' + c.doc + '</b></div><div><span>Plataforma · Natureza</span><b>' + pa.plat + ' · ' + esc(pa.nat) + '</b></div><div><span>Nº do parcelamento</span><b class="m">' + pa.num + '</b></div></div>'
        + '<div class="bloco"><h3>Parcela</h3><div class="dois"><div class="campo"><label for="ep-venc">Vencimento</label><input class="ctl" id="ep-venc" type="date" value="' + APP.iso(x.venc) + '"></div><div class="campo"><label for="ep-v">Valor</label><input class="ctl" id="ep-v" inputmode="decimal" value="' + x.v.toLocaleString('pt-BR', { minimumFractionDigits:2 }) + '"></div></div>'
        + '<div class="campo"><span class="rot">Guia</span>' + APP.celEmissao(x, true) + '</div><div class="campo"><label for="ep-obs">Observação</label><textarea class="ctl" id="ep-obs" placeholder="Opcional">' + esc(x.obs || '') + '</textarea></div></div>'
        + '<div class="bloco"><h3>Pagamento</h3>' + (x.pago ? '<span class="ok-txt">✓ Pago em ' + APP.fd(x.pago) + '</span><button class="bt bt-g bt-mini" type="button" id="ep-desfazer-pg" style="align-self:flex-start">Desmarcar o pagamento</button>' : APP.botaoBaixa('data-baixa="' + x.id + '" style="align-self:flex-start"')) + '</div>',
      rodape:'<button class="bt bt-g esq" type="button" id="ep-pa">Ver o parcelamento inteiro</button><button class="bt bt-o" type="button" data-fechar>Cancelar</button><button class="bt bt-p" type="button" id="ep-salvar">' + ic('check') + 'Salvar</button>' });
    J.q('#ep-pa').onclick = function(){ J.fechar(); APP.janelaParcelamento(pa); };
    var dp = J.q('#ep-desfazer-pg'); if (dp) dp.onclick = function(){ APP.confirmar({ kick:'Desmarcar pagamento', tit:'Tirar a baixa desta parcela?', ok:'Desmarcar', perigo:true, resumo:'<span>A parcela volta a ficar em aberto.</span>' }).then(function(s){ if (!s) return; J.fechar(); APP.acao('Pagamento desmarcado.', function(){ var f = APP.foto(x, ['pago']); x.pago = null; return f; }); }); };
    J.q('#ep-salvar').onclick = function(){
      var venc = APP.deIso(J.q('#ep-venc').value) || x.venc, v = APP.num(J.q('#ep-v').value), obs = J.q('#ep-obs').value;
      J.fechar(); APP.acao('Parcela ' + x.n + '/' + pa.tot + ' salva.', function(){ var f = APP.foto(x, ['venc', 'v', 'obs']); x.venc = venc; if (v != null) x.v = v; x.obs = obs; return f; });
    };
  };

  /* ── A3/A5: emitir a guia — anexa o PDF, o sistema lê valor e vencimento e deixa o e-mail pronto ── */
  APP.janelaEmitir = function(x){
    var pa = N.pa(x.pa), c = APP.cli(pa.cli), lido = null;
    var J = APP.janela({ kick:'Emitir guia', tit:'Parcela ' + x.n + ' de ' + pa.tot + ' · ' + pa.nat, sub:esc(c.nome) + ' · ' + pa.plat + ' nº ' + pa.num,
      corpo:'<div class="conf-resumo"><b>Valor da parcela: ' + brl(x.v) + '</b><span>Vencimento ' + APP.fd(x.venc) + '</span></div>'
        + '<div class="campo"><label for="eg-pdf">PDF da guia (gerado no ' + pa.plat + ')</label><input class="ctl" id="eg-pdf" type="file" accept="application/pdf" style="padding:6px"><span class="ajuda">' + (N.auto('leitura_pdf').ligada ? 'O sistema lê o valor e o vencimento do PDF e confere com a parcela (A5).' : 'A leitura do PDF está desligada em Administração → Automações.') + '</span></div>'
        + '<div class="par" style="flex-wrap:wrap"><button class="bt bt-o bt-mini" type="button" id="eg-ex">' + ic('teste') + 'Testar com uma guia de exemplo</button><button class="bt bt-g bt-mini" type="button" id="eg-ex2">Exemplo com valor atualizado</button></div>'
        + '<div id="eg-lido"></div>',
      rodape:'<button class="bt bt-o" type="button" data-fechar>Cancelar</button><button class="bt bt-o" type="button" id="eg-sem">Marcar emitida sem PDF</button><button class="bt bt-p" type="button" id="eg-ok" disabled>' + ic('check') + 'Marcar emitida</button>' });
    function mostrar(arq){
      J.q('#eg-lido').innerHTML = '<div class="anexo">' + ic('clipe') + '<span>Lendo <b>' + esc(arq.name) + '</b>…</span></div>';
      N.lerPdf(arq).then(function(r){
        lido = r;
        var okV = r.valor != null && Math.abs(r.valor - x.v) < 0.01, okD = r.venc && +r.venc === +x.venc;
        J.q('#eg-lido').innerHTML = '<div class="anexo">' + ic('clipe') + '<span><b>' + esc(r.nome) + '</b> · lido por ' + esc(r.como) + '</span></div>'
          + '<div class="checa"><div class="' + (r.valor == null ? 'av' : okV ? 'ok' : 'av') + '">' + ic(okV ? 'ok' : 'alerta') + '<span>Valor no PDF: <b>' + (r.valor != null ? brl(r.valor) : 'não encontrado') + '</b>' + (okV ? ' — igual ao da parcela.' : r.valor != null ? ' — diferente da parcela (' + brl(x.v) + '). Guia com juros/atualização? O valor lançado passa a ser o do PDF.' : '') + '</span></div>'
          + '<div class="' + (okD ? 'ok' : 'av') + '">' + ic(okD ? 'ok' : 'alerta') + '<span>Vencimento no PDF: <b>' + (r.venc ? APP.fd(r.venc) : 'não encontrado') + '</b>' + (okD ? ' — igual ao da parcela.' : r.venc ? ' — diferente (' + APP.fd(x.venc) + ').' : '') + '</span></div></div>'
          + (N.regra('guia_emitida', pa.cli).ligada ? '<span class="ajuda" style="color:var(--text3);font-size:12px">Ao marcar emitida, o e-mail com este PDF fica pronto na Caixa de saída para revisar (A3).</span>' : '<span class="ajuda" style="color:var(--text3);font-size:12px">A automação "Guia emitida → e-mail pronto" está desligada para este cliente.</span>');
        J.q('#eg-ok').disabled = false;
      });
    }
    J.q('#eg-pdf').onchange = function(){ if (this.files[0]) mostrar(this.files[0]); };
    J.q('#eg-ex').onclick = function(){ mostrar(N.pdfExemplo(x, false)); };
    J.q('#eg-ex2').onclick = function(){ mostrar(N.pdfExemplo(x, true)); };
    function feito(pdf){ J.fechar(); APP.acao('Guia da parcela ' + x.n + '/' + pa.tot + ' marcada como emitida' + (N.regra('guia_emitida', pa.cli).ligada ? ' — e-mail pronto na Caixa de saída.' : '.'), function(){
      var volta = N.emitir(x, pdf), vAnt = x.v; if (pdf && pdf.valor != null && Math.abs(pdf.valor - x.v) >= 0.01) x.v = pdf.valor; return function(){ x.v = vAnt; volta(); }; }); }
    J.q('#eg-ok').onclick = function(){ feito(lido ? { nome:lido.nome, valor:lido.valor, venc:lido.venc } : null); };
    J.q('#eg-sem').onclick = function(){ feito(null); };
  };

  /* ── novo / editar parcelamento ── */
  APP.novoParcelamento = function(){ APP.formParcelamento(null); };
  APP.formParcelamento = function(pa){
    var sel = function(id, itens, v){ return '<select class="ctl" id="' + id + '">' + itens.map(function(t){ return '<option value="' + esc(t[0]) + '"' + (t[0] === v ? ' selected' : '') + '>' + esc(t[1]) + '</option>'; }).join('') + '</select>'; };
    var J = APP.janela({ kick:pa ? 'Editar' : 'Novo', tit:pa ? 'Dados do parcelamento' : 'Novo parcelamento', sub:pa ? esc(APP.cli(pa.cli).nome) : 'As parcelas são criadas a partir do 1º vencimento',
      corpo:'<div class="bloco"><h3>Cliente</h3><div class="campo"><label for="fp-cli">Empresa</label>' + sel('fp-cli', D().clientes.map(function(c){ return [c.id, c.nome + ' — ' + APP.grupo(c.g).nome]; }), pa ? pa.cli : '') + '</div></div>'
        + '<div class="bloco"><h3>Parcelamento</h3><div class="dois"><div class="campo"><label for="fp-plat">Plataforma</label>' + sel('fp-plat', [['eCAC','eCAC'],['Regularize','Regularize'],['SIARE','SIARE']], pa && pa.plat) + '</div>'
        + '<div class="campo"><label for="fp-nat">Natureza</label>' + sel('fp-nat', ['Simples Nacional','INSS','Previdenciário','Não previdenciário','ICMS'].map(function(n){ return [n, n]; }), pa && pa.nat) + '</div></div>'
        + '<div class="campo"><label for="fp-num">Nº do parcelamento</label><input class="ctl" id="fp-num" value="' + (pa ? esc(pa.num) : '') + '" placeholder="Ex.: 10120.004512/2024-11"></div></div>'
        + (pa ? '' : '<div class="bloco"><h3>Parcelas</h3><div class="tres"><div class="campo"><label for="fp-tot">Quantidade</label><input class="ctl" id="fp-tot" inputmode="numeric" value="60"></div><div class="campo"><label for="fp-v">Valor da parcela</label><input class="ctl" id="fp-v" inputmode="decimal" placeholder="0,00"></div><div class="campo"><label for="fp-1">1º vencimento</label><input class="ctl" id="fp-1" type="date" value="' + APP.iso(new Date(2026, 9, 30)) + '"></div></div></div>')
        + '<div class="campo"><span class="rot">Quem emite a guia</span>' + APP.opcoes('Quem emite', ['Nós', 'O cliente'], pa && pa.cliEmite ? 'O cliente' : 'Nós') + '</div>',
      rodape:(pa ? '<button class="bt bt-g esq" type="button" id="fp-excluir" style="color:var(--red)">Excluir parcelamento</button>' : '') + '<button class="bt bt-o" type="button" data-fechar>Cancelar</button><button class="bt bt-p" type="button" id="fp-ok">' + ic('check') + (pa ? 'Salvar' : 'Criar parcelamento') + '</button>' });
    J.q('#fp-ok').onclick = function(){
      var d = { cli:J.q('#fp-cli').value, plat:J.q('#fp-plat').value, nat:J.q('#fp-nat').value, num:J.q('#fp-num').value.trim(), cliEmite:APP.opcaoDe(J, 'Quem emite') === 'O cliente' };
      if (!d.num){ J.q('#fp-num').focus(); return APP.aviso('Informe o nº do parcelamento.'); }
      if (pa){ J.fechar(); return APP.acao('Parcelamento salvo.', function(){ var f = APP.foto(pa, ['cli', 'plat', 'nat', 'num', 'cliEmite']); Object.assign(pa, d); return f; }); }
      var tot = parseInt(J.q('#fp-tot').value, 10) || 0, v = APP.num(J.q('#fp-v').value), p1 = APP.deIso(J.q('#fp-1').value);
      if (!tot || !v || !p1) return APP.aviso('Preencha quantidade, valor e 1º vencimento.');
      J.fechar();
      APP.acao('Parcelamento criado com ' + tot + ' parcelas.', function(){ var novo = Object.assign({ id:'p' + Date.now(), tot:tot, v:v, dia:p1.getDate(), obs:'' }, d), ps = [];
        for (var n = 1; n <= tot; n++) ps.push({ id:novo.id + '-' + n, pa:novo.id, n:n, venc:DADOS.noMes(p1.getFullYear(), p1.getMonth() + n - 1, p1.getDate()), v:v, pago:null, emitida:null, enviada:null, conferida:null });
        D().parcelamentos.push(novo); [].push.apply(D().parcelas, ps);
        return function(){ D().parcelamentos.splice(D().parcelamentos.indexOf(novo), 1); ps.forEach(function(x){ D().parcelas.splice(D().parcelas.indexOf(x), 1); }); }; });
    };
    var ex = J.q('#fp-excluir'); if (ex) ex.onclick = function(){ APP.confirmar({ kick:'Excluir', tit:'Excluir este parcelamento e todas as parcelas?', perigo:true, ok:'Excluir', resumo:'<span>Dá para desfazer por alguns segundos depois de excluir.</span>' }).then(function(s){ if (!s) return; APP.fecharTodas();
      APP.acao('Parcelamento excluído.', function(){ var i = D().parcelamentos.indexOf(pa), ps = D().parcelas.filter(function(x){ return x.pa === pa.id; }); D().parcelamentos.splice(i, 1); D().parcelas = D().parcelas.filter(function(x){ return x.pa !== pa.id; });
        return function(){ D().parcelamentos.splice(i, 0, pa); [].push.apply(D().parcelas, ps); }; }); }); };
  };

  /* ═════════ FINANCEIRO ═════════ */
  APP.cfgHonorarios = function(id, lista, titulo, comAbas){
    return { id:id, titulo:titulo, linhas:lista, unidade:['lançamento','lançamentos'], ord:{ k:'venc', dir:1 },
      abas: comAbas ? [{ id:'atraso', rot:'Em atraso', cor:'r', f:function(h){ return !h.rec && h.venc <= HOJE; } }, { id:'areceber', rot:'A receber', f:function(h){ return !h.rec && h.venc > HOJE; } }, { id:'rec', rot:'Recebidos', f:function(h){ return !!h.rec; } }] : null,
      ordAbas:{ atraso:{ k:'venc', dir:1 }, areceber:{ k:'venc', dir:1 }, rec:{ k:'rec', dir:-1 } },
      busca:function(h){ var c = APP.cli(h.cli); return c.nome + ' ' + c.doc + ' ' + h.desc; }, dicaBusca:'Cliente, CPF/CNPJ ou contrato', valor:function(h){ return h.v; }, venc:function(h){ return h.venc; },
      listas:[{ k:'g', rot:'Grupo', todos:'Todos os grupos', opcoes:D().grupos.map(function(g){ return [g.id, g.nome]; }), get:function(h){ return APP.cli(h.cli).g; } },
        { k:'tipo', rot:'Tipo', todos:'Todos os tipos', opcoes:[['Mensalidade','Mensalidade'],['Parcela de contrato','Parcela de contrato'],['Êxito','Êxito']], get:function(h){ return h.tipo; } }],
      colunas:[{ k:'g', rot:'Grupo', html:function(h){ return APP.grupoTxt(APP.cli(h.cli).g); }, ord:function(h){ return APP.grupo(APP.cli(h.cli).g).nome; } },
        { k:'cli', rot:'Cliente', html:function(h){ return APP.celEmpresa(APP.cli(h.cli)); }, ord:function(h){ return APP.cli(h.cli).nome; } },
        { k:'tipo', rot:'Tipo', html:function(h){ return '<span class="plat">' + h.tipo + '</span>'; } }, { k:'desc', rot:'Descrição', html:function(h){ return esc(h.desc); } },
        { k:'n', rot:'Parcela', cls:'dt', html:function(h){ return h.tot ? h.n + ' de ' + h.tot : '—'; } },
        { k:'v', rot:'Valor', cls:'dir val', soma:true, html:function(h){ return brl(h.v); } },
        { k:'venc', rot:'Vencimento', cls:'cen dt', clsR:function(h){ return APP.clsVenc(h.venc, h.rec); }, html:function(h){ return APP.celVenc(h.venc, h.rec); }, ord:function(h){ return +h.venc; } },
        { k:'rec', rot:'Baixa', cls:'cen', html:function(h){ return h.rec ? '<span class="ok-txt">✓ Recebido em ' + APP.fc(h.rec) + '</span>' : APP.botaoBaixa('data-receber="' + h.id + '"'); }, ord:function(h){ return h.rec ? +h.rec : 0; } }],
      lote:[{ rot:'Receber', ic:'check', quando:function(h){ return !h.rec; }, fn:function(l){ var soma = l.reduce(function(s, h){ return s + h.v; }, 0);
        return APP.confirmar({ kick:'Recebimento em lote', tit:'Lançar o recebimento de ' + APP.plural(l.length, 'honorário', 'honorários') + '?', ok:'Confirmar recebimentos', data:'Data do recebimento', resumo:'<b>' + brl(soma) + '</b>' + l.slice(0, 8).map(function(h){ return '<span>' + esc(APP.cli(h.cli).nome) + ' · ' + esc(h.desc) + ' · ' + brl(h.v) + '</span>'; }).join('') })
          .then(function(dt){ if (!dt) return false; APP.acao(APP.plural(l.length, 'recebimento lançado', 'recebimentos lançados') + ' (' + brl(soma) + ').', function(){ var v = l.map(function(h){ var f = APP.foto(h, ['rec']); h.rec = dt; return f; }); return function(){ v.forEach(function(f){ f(); }); }; }); }); } }],
      clique:APP.editarHonorario };
  };
  document.addEventListener('click', function(e){ var b = e.target.closest('[data-receber]'); if (!b) return; e.stopPropagation(); N.receberHonorario(D().honorarios.find(function(h){ return h.id === b.dataset.receber; })); }, true);
  APP.editarHonorario = function(h){
    var c = APP.cli(h.cli);
    var J = APP.janela({ kick:'Editar honorário', tit:h.desc, sub:esc(c.nome) + ' · ' + esc(APP.grupo(c.g).nome),
      corpo:'<div class="ficha f2"><div><span>Cliente</span><b>' + esc(c.nome) + '</b></div><div><span>CPF / CNPJ</span><b class="m">' + c.doc + '</b></div><div><span>Tipo</span><b>' + h.tipo + '</b></div><div><span>Parcela</span><b>' + (h.tot ? h.n + ' de ' + h.tot : '—') + '</b></div></div>'
        + '<div class="dois"><div class="campo"><label for="eh-venc">Vencimento</label><input class="ctl" id="eh-venc" type="date" value="' + APP.iso(h.venc) + '"></div><div class="campo"><label for="eh-v">Valor</label><input class="ctl" id="eh-v" inputmode="decimal" value="' + h.v.toLocaleString('pt-BR', { minimumFractionDigits:2 }) + '"></div></div>'
        + '<div class="campo"><label for="eh-d">Descrição</label><input class="ctl" id="eh-d" value="' + esc(h.desc) + '"></div>' + (h.rec ? '<span class="ok-txt">✓ Recebido em ' + APP.fd(h.rec) + '</span>' : ''),
      rodape:'<button class="bt bt-g esq" type="button" id="eh-x" style="color:var(--red)">Excluir</button>' + (h.rec ? '' : '<button class="bt bt-o" type="button" id="eh-rec">' + ic('check') + 'Receber</button>') + '<button class="bt bt-o" type="button" data-fechar>Cancelar</button><button class="bt bt-p" type="button" id="eh-ok">' + ic('check') + 'Salvar</button>' });
    J.q('#eh-ok').onclick = function(){ var venc = APP.deIso(J.q('#eh-venc').value) || h.venc, v = APP.num(J.q('#eh-v').value), d = J.q('#eh-d').value; J.fechar();
      APP.acao('Honorário salvo.', function(){ var f = APP.foto(h, ['venc', 'v', 'desc']); h.venc = venc; if (v != null) h.v = v; h.desc = d; return f; }); };
    var r = J.q('#eh-rec'); if (r) r.onclick = function(){ J.fechar(); N.receberHonorario(h); };
    J.q('#eh-x').onclick = function(){ APP.confirmar({ kick:'Excluir', tit:'Excluir este honorário?', perigo:true, ok:'Excluir', resumo:'<b>' + esc(h.desc) + '</b><span>' + brl(h.v) + ' · ' + APP.fd(h.venc) + '</span>' }).then(function(s){ if (!s) return; J.fechar();
      APP.acao('Honorário excluído.', function(){ var i = D().honorarios.indexOf(h); D().honorarios.splice(i, 1); return function(){ D().honorarios.splice(i, 0, h); }; }); }); };
  };
  APP.registrar('financeiro', { tit:'Financeiro · Jurídico', ic:'dinheiro', sec:'Financeiro',
    ajuda:['Honorários que os clientes pagam ao escritório: contratos, mensalidades e êxito.', 'Cartões abrem o detalhe. A tabela tem filtros, ordenação e recebimento em lote (com confirmação).', 'Ao receber, o recibo em PDF segue sozinho para o cliente (automação "Recibo de pagamento").'],
    novo:function(){ APP.aviso('No ERP, abre "Lançar honorário" na janela do centro.'); },
    desenhar:function(el){
      var H = D().honorarios, mes = H.filter(function(h){ return APP.doMes(h.venc); }), rec = mes.filter(function(h){ return h.rec; }), arec = mes.filter(function(h){ return !h.rec && h.venc > HOJE; }), atr = H.filter(function(h){ return !h.rec && h.venc <= HOJE; });
      var soma = function(a){ return a.reduce(function(s, h){ return s + h.v; }, 0); }, prev = soma(mes), pc = prev ? Math.round(soma(rec) / prev * 100) : 0;
      el.innerHTML = APP.cabecalho({ ic:'dinheiro', tit:'Honorários · Jurídico', frase:'O que os clientes pagam ao escritório: contratos, mensalidades e êxito' }) + '<div id="fi-cartoes"></div><div id="fi-tabela"></div>';
      APP.cartoes(APP.$('fi-cartoes'), 'fin', [
        { id:'rec', cor:'g', ic:'ok', rot:'Recebido no mês', v:brl(soma(rec)), vcls:'g', sub:APP.plural(rec.length, 'honorário recebido', 'honorários recebidos'), det:function(c){ APP.tabela(c, APP.cfgHonorarios('fi-d-rec', rec, 'Recebidos em outubro')); } },
        { id:'arec', cor:'b', ic:'cal', rot:'A receber no mês', v:brl(soma(arec)), sub:APP.plural(arec.length, 'ainda vai vencer', 'ainda vão vencer') + ' em outubro', det:function(c){ APP.tabela(c, APP.cfgHonorarios('fi-d-arec', arec, 'A receber em outubro')); } },
        { id:'atr', cor:'r', ic:'alerta', rot:'Em atraso', v:brl(soma(atr)), vcls:atr.length ? 'r' : '', sub:APP.plural(atr.length, 'honorário', 'honorários') + ' · contando os de hoje', det:function(c){ APP.tabela(c, APP.cfgHonorarios('fi-d-atr', atr, 'Honorários em atraso')); } },
        { id:'prev', cor:'a', ic:'pizza', rot:'Recebido do previsto no mês', v:pc + '% <small>de ' + brl(prev) + '</small>', barra:pc, sub:'quanto de outubro já entrou', det:function(c){
          var cs = {}; mes.forEach(function(h){ var x = cs[h.cli] = cs[h.cli] || { id:h.cli, prev:0, rec:0 }; x.prev += h.v; if (h.rec) x.rec += h.v; });
          APP.tabela(c, { id:'fi-d-prev', titulo:'Previsto e recebido em outubro, por cliente', linhas:Object.keys(cs).map(function(k){ return cs[k]; }), unidade:['cliente','clientes'], ord:{ k:'falta', dir:-1 }, valor:function(x){ return x.prev - x.rec; },
            colunas:[{ k:'cli', rot:'Cliente', html:function(x){ return APP.celEmpresa(APP.cli(x.id)); }, ord:function(x){ return APP.cli(x.id).nome; } }, { k:'prev', rot:'Previsto', cls:'dir val', html:function(x){ return brl(x.prev); } },
              { k:'rec', rot:'Recebido', cls:'dir val', html:function(x){ return '<span style="color:var(--green)">' + brl(x.rec) + '</span>'; } }, { k:'falta', rot:'Falta', cls:'dir val', soma:true, html:function(x){ return brl(x.prev - x.rec); }, ord:function(x){ return x.prev - x.rec; } },
              { k:'pc', rot:'Recebido do previsto', html:function(x){ var p = Math.round(x.rec / x.prev * 100); return '<div class="prog"><div class="barra"><span style="width:' + p + '%"></span></div><span>' + p + '%</span></div>'; }, ord:function(x){ return x.rec / x.prev; } }],
            clique:function(x){ APP.fichaCliente(APP.cli(x.id)); } }); } }
      ]);
      APP.tabela(APP.$('fi-tabela'), APP.cfgHonorarios('honorarios', H, function(a){ return { atraso:'Honorários em atraso (inclui os que vencem hoje)', areceber:'Todos os honorários a receber', rec:'Todos os honorários recebidos' }[a]; }, true));
    } });
})();
