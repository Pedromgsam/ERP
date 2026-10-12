/* Telas: Financeiro (Jurídico e Contabilidade) — Lançamentos no desenho de Acordos e Análise com os gráficos de sempre — e Contratos. */
(function(){
  var APP = window.APP, N = APP.N, ic = APP.ic, esc = APP.esc, brl = APP.brl, HOJE = DADOS.HOJE, DIA = DADOS.DIA;
  var D = function(){ return APP.D; };
  var CORES = ['var(--g1)', 'var(--g2)', 'var(--g3)', 'var(--g4)', 'var(--g5)', 'var(--g6)'];
  var quemL = function(l){ return l.cli ? APP.cli(l.cli) : null; };
  var nomeL = function(l){ var c = quemL(l); return l.fav && (l.tipo === 'despesa') ? l.fav : c ? APP.grupo(c.g).nome : (l.fav || '—'); };
  var vS = function(l){ return l.tipo === 'despesa' || l.redutor ? -l.v : l.v; };

  /* ═════════ FINANCEIRO (Jurídico | Contabilidade) ═════════ */
  function registrar(id, emp, tit){
    APP.registrar(id, { tit:tit, ic:'dinheiro', pai:'Financeiro',
      ajuda:['<b>Lançamentos</b>: a tabela no desenho de Acordos — Prazo colorido, Cobrar e Baixa na linha, linha vencida rosada.', 'Baixa de várias: botão "Marcar várias" (as caixinhas só aparecem quando você pede).', '<b>Análise</b>: os gráficos e o comparativo por pessoa continuam (Recebido mês a mês, por tipo de serviço, maiores grupos' + (emp === 'contab' ? ', resultado do mês e despesas por categoria' : '') + ').', 'A baixa de honorário manda o recibo sozinho (se ligado em Administração → E-mails).'],
      novo:function(){ formLanc(null, emp); },
      desenhar:function(el, arg){ desenhar(el, arg, emp, id, tit); } });
  }
  registrar('financeiro', 'jur', 'Jurídico');
  registrar('contabilidade', 'contab', 'Contabilidade');

  function desenhar(el, arg, emp, id, tit){
    if (arg && arg.aba) APP.pref('fin-vista-' + emp, 'lanc');
    APP.preparar('fin-' + emp, arg);
    var vista = APP.pref('fin-vista-' + emp) || 'lanc';
    el.innerHTML = APP.cabecalho({ ic:'dinheiro', tit:'Financeiro · ' + tit, frase:APP.T('fin.frase'),
      acoes:'<div class="seg"><button class="seg-bt" type="button" data-fv="lanc" aria-selected="' + (vista === 'lanc') + '">Lançamentos</button><button class="seg-bt" type="button" data-fv="analise" aria-selected="' + (vista === 'analise') + '">Análise</button></div>'
        + '<button class="bt bt-o" type="button" id="fin-recibo">' + ic('doc') + 'Recibo</button><button class="bt bt-p" type="button" id="fin-novo">' + ic('mais') + 'Lançar</button>' }) + '<div id="fin-corpo"></div>';
    el.querySelector('.cab-acoes .seg').onclick = function(e){ var b = e.target.closest('[data-fv]'); if (b){ APP.pref('fin-vista-' + emp, b.dataset.fv); APP.redesenhar(); } };
    APP.$('fin-novo').onclick = function(){ formLanc(null, emp); };
    APP.$('fin-recibo').onclick = function(){ janelaRecibo(emp); };
    if (vista === 'analise') return analise(APP.$('fin-corpo'), emp);
    var L = D().lanc.filter(function(l){ return l.empresa === emp; });
    var abas = [{ id:'areceber', rot:'A receber', f:function(l){ return l.tipo === 'receita' && !l.pago && !l.perda && !l.redutor; } }, { id:'recebidos', rot:'Recebidos', f:function(l){ return l.tipo === 'receita' && !!l.pago; } }];
    if (emp === 'jur') abas.push({ id:'prejuizo', rot:'Prejuízo', f:function(l){ return !!l.perda; } }, { id:'comissoes', rot:'Comissões', f:function(l){ return !!l.redutor; } });
    else abas.push({ id:'apagar', rot:'A pagar', f:function(l){ return l.tipo === 'despesa' && !l.pago; } }, { id:'pagos', rot:'Pagos', f:function(l){ return l.tipo === 'despesa' && !!l.pago; } });
    var aberto = ['areceber', 'apagar', 'comissoes'];
    APP.tabela(APP.$('fin-corpo'), { id:'fin-' + emp, linhas:L, unidade:['lançamento', 'lançamentos'], abas:abas, contagem:true, prazos:true, prazosAbas:aberto, dicaBusca:'Cliente, grupo ou descrição…', tabCls:'t-lanc',
      busca:function(l){ var c = quemL(l); return (c ? c.nome + ' ' + APP.grupo(c.g).nome : '') + ' ' + (l.fav || '') + ' ' + l.desc + ' ' + l.servico; },
      venc:function(l){ return l.pago || l.venc; }, valor:vS, ordAbas:{ recebidos:{ k:'venc', dir:-1 }, pagos:{ k:'venc', dir:-1 } }, ord:{ k:'venc', dir:1 },
      linhaCls:function(l){ return !l.pago && !l.perda ? APP.vencida(l.venc, null) : ''; },
      listas:[{ k:'quem', rot:'Quem', todos:'Todas as pessoas', opcoes:D().equipe.map(function(p){ return [p.id, p.curto]; }), get:function(l){ return l.quem; } },
        { k:'g', rot:'Grupo', todos:'Todos os grupos', opcoes:D().grupos.map(function(g){ return [g.id, g.nome]; }), get:function(l){ var c = quemL(l); return c ? c.g : ''; } },
        { k:'serv', rot:'Tipo de serviço', todos:'Todos os tipos', opcoes:Array.from(new Set(L.map(function(l){ return l.servico; }))).sort().map(function(s){ return [s, s]; }), get:function(l){ return l.servico; } }],
      colunas:[{ k:'quem', rot:'Quem', html:function(l){ return APP.pessoaTxt(l.quem); }, ord:function(l){ return l.quem; } },
        { k:'g', rot:'Grupo / favorecido', html:function(l){ var c = quemL(l); return (l.tipo === 'despesa' && l.fav ? esc(l.fav) : c ? APP.grupoTxt(c.g) : '—') + (c && l.tipo !== 'despesa' ? '<span class="b-sub">' + esc(APP.curto(c)) + '</span>' : ''); }, ord:nomeL },
        { k:'desc', rot:'Descrição', html:function(l){ return esc(l.desc) + '<span class="b-sub">' + esc(l.servico) + (l.redutor ? ' · comissão (redutor)' : '') + '</span>'; }, ord:function(l){ return l.desc; } },
        { k:'v', rot:'Valor', cls:'dir val', clsR:function(l){ return vS(l) < 0 ? ' vermelho' : ' verde'; }, soma:true, html:function(l){ return (vS(l) < 0 ? '− ' : '') + brl(l.v); }, ord:vS },
        { k:'venc', rot:'Vencimento', cls:'cen dt', html:function(l){ return l.pago ? APP.fd(l.pago) + '<small>venc. ' + APP.fc(l.venc) + '</small>' : APP.fd(l.venc); }, ord:function(l){ return +(l.pago || l.venc); } },
        { k:'pz', rot:'Prazo', cls:'cen', html:function(l){ return l.perda ? '<span class="pill p-n">Prejuízo</span>' : APP.celPrazo(l.venc, l.pago); }, ord:function(l){ return +(l.pago || l.venc); } },
        { k:'ac', rot:'', cls:'dir acoes', ord:false, html:function(l){ if (l.perda) return ''; if (l.pago) return '<button class="bt-emitir" type="button" data-desfazer="' + l.id + '" title="Voltar para em aberto">↺ Desfazer</button>';
          return '<span class="acs">' + (l.tipo === 'receita' && !l.redutor ? '<button class="bt-emitir" type="button" data-cobrar="' + l.id + '">Cobrar</button>' : '') + APP.btBaixa('data-pagar="' + l.id + '"') + '</span>'; } }],
      lote:[{ rot:'Dar baixa nas marcadas', ic:'check', quando:function(l){ return !l.pago && !l.perda; }, fn:function(lista){
        return APP.confirmar({ kick:'Baixa de várias', tit:'Lançar ' + APP.plural(lista.length, 'pagamento', 'pagamentos') + '?', data:'Data do pagamento', ok:'Confirmar', resumo:'<b>' + brl(APP.soma(lista, function(l){ return l.v; })) + '</b>' + lista.slice(0, 6).map(function(l){ return '<span>' + esc(l.desc) + '</span>'; }).join('') }).then(function(d){
          if (!d) return false; APP.acao(APP.plural(lista.length, 'baixa lançada', 'baixas lançadas') + '.', function(){ var v = lista.map(function(l){ var f = APP.foto(l, ['pago']); l.pago = d; return f; }); return function(){ v.forEach(function(f){ f(); }); }; }); }); } }],
      clique:function(l){ formLanc(l, emp); }, vazio:{ tit:'Nenhum lançamento aqui', frase:'Troque a aba ou limpe os filtros.' } });
  }
  document.addEventListener('click', function(e){
    var p = e.target.closest('[data-pagar]'); if (p){ e.stopPropagation(); N.baixaLanc(D().lanc.find(function(l){ return l.id === p.dataset.pagar; })); return; }
    var d = e.target.closest('[data-desfazer]'); if (d){ e.stopPropagation(); var l = D().lanc.find(function(x){ return x.id === d.dataset.desfazer; }); APP.acao('Lançamento voltou para "em aberto".', function(){ var v = APP.foto(l, ['pago']); l.pago = null; return v; }); return; }
    var c = e.target.closest('[data-cobrar]'); if (c){ e.stopPropagation(); cobrar(D().lanc.find(function(l){ return l.id === c.dataset.cobrar; })); }
  }, true);
  function cobrar(l){
    var c = APP.cli(l.cli), tx = 'Olá! Tudo bem? Passando para lembrar do honorário de ' + brl(l.v) + ' (' + l.desc + '), vencido em ' + APP.fd(l.venc) + '. Se já pagou, desconsidere. Obrigado!';
    var J = APP.janela({ kick:'Cobrar', tit:c.nome, sub:'Telefone: ' + esc(c.tel || '—') + ' · e-mail: ' + esc(c.email || '—'), corpo:APP.campo('Como', APP.opcoes('Canal', ['WhatsApp', 'E-mail'], 'WhatsApp')) + APP.campo('Mensagem pronta', '<textarea class="ctl" id="cb-tx">' + esc(tx) + '</textarea>'),
      rodape:'<button class="bt bt-o" type="button" data-fechar>Cancelar</button><button class="bt bt-p" type="button" id="cb-ok">' + ic('enviar') + 'Cobrar</button>' });
    J.q('#cb-ok').onclick = function(){ var canal = APP.opcaoDe(J, 'Canal'); J.fechar();
      if (canal === 'E-mail') APP.acao(c.email ? 'Cobrança enviada para ' + c.email + '.' : 'Cliente sem e-mail: a cobrança ficou com erro na Caixa de saída.', function(){ var e = { id:'e' + Date.now(), cli:c.id, tipo:'cobranca', assunto:'Honorário em aberto — ' + brl(l.v), para:c.email, status:c.email ? 'enviado' : 'erro', erro:c.email ? '' : 'cliente sem e-mail', quando:new Date(HOJE) }; D().emails.push(e); return function(){ D().emails.splice(D().emails.indexOf(e), 1); }; });
      else APP.aviso('No ERP abre o WhatsApp com a mensagem pronta para ' + (c.tel || 'o cliente') + '.'); };
  }
  function formLanc(l, emp){
    var novo = !l; l = l || { empresa:emp, tipo:'receita', cli:'', desc:'', servico:'', v:'', venc:HOJE, quem:'pedro' };
    var J = APP.janela({ kick:novo ? 'Novo lançamento' : (l.tipo === 'despesa' ? 'Despesa' : 'Receita'), tit:novo ? (emp === 'jur' ? 'Jurídico' : 'Contabilidade') : l.desc, sub:novo ? '' : (l.pago ? 'Pago em ' + APP.fd(l.pago) : 'Vence ' + APP.fd(l.venc)),
      corpo:APP.campo('Tipo', APP.opcoes('Tipo', ['Receita', 'Despesa'], l.tipo === 'despesa' ? 'Despesa' : 'Receita'))
        + '<div class="dois">' + APP.campo('Cliente', '<select class="ctl" id="fl-cli"><option value="">— (despesa sem cliente)</option>' + D().clientes.map(function(c){ return '<option value="' + c.id + '"' + (c.id === l.cli ? ' selected' : '') + '>' + esc(c.nome) + '</option>'; }).join('') + '</select>') + APP.campo('Favorecido (despesa)', '<input class="ctl" id="fl-fav" value="' + esc(l.fav || '') + '">') + '</div>'
        + APP.campo('Descrição', '<input class="ctl" id="fl-desc" value="' + esc(l.desc) + '">')
        + '<div class="tres">' + APP.campo('Valor', '<input class="ctl" id="fl-v" inputmode="decimal" value="' + (l.v ? String(l.v).replace('.', ',') : '') + '">') + APP.campo('Vencimento', '<input class="ctl" type="date" id="fl-venc" value="' + APP.iso(l.venc) + '">') + APP.campo('Quem', '<select class="ctl" id="fl-quem">' + D().equipe.map(function(p){ return '<option value="' + p.id + '"' + (p.id === l.quem ? ' selected' : '') + '>' + esc(p.curto) + '</option>'; }).join('') + '</select>') + '</div>'
        + APP.campo('Tipo de serviço', '<input class="ctl" id="fl-serv" value="' + esc(l.servico) + '" placeholder="Tributário, Trabalhista, Contabilidade…">'),
      rodape:(novo ? '' : '<button class="bt bt-g esq" type="button" id="fl-del">' + ic('lixo') + 'Excluir</button>') + (!novo && !l.pago && l.tipo === 'receita' ? '<button class="bt bt-o" type="button" id="fl-perda">Virou prejuízo</button>' : '') + '<button class="bt bt-o" type="button" data-fechar>Cancelar</button><button class="bt bt-p" type="button" id="fl-ok">' + ic('check') + 'Salvar</button>' });
    J.q('#fl-ok').onclick = function(){
      var v = APP.num(J.q('#fl-v').value), desc = J.q('#fl-desc').value.trim(); if (!desc) return J.q('#fl-desc').focus(); if (!v) return J.q('#fl-v').focus();
      var dados = { tipo:APP.opcaoDe(J, 'Tipo') === 'Despesa' ? 'despesa' : 'receita', cli:J.q('#fl-cli').value, fav:J.q('#fl-fav').value.trim(), desc:desc, v:v, venc:APP.deIso(J.q('#fl-venc').value) || HOJE, quem:J.q('#fl-quem').value, servico:J.q('#fl-serv').value.trim() || 'Outros' };
      J.fechar();
      if (novo) APP.acao('Lançamento criado.', function(){ var n = Object.assign({ id:'l' + Date.now(), empresa:emp, pago:null }, dados); D().lanc.push(n); return function(){ D().lanc.splice(D().lanc.indexOf(n), 1); }; });
      else APP.acao('Lançamento alterado.', function(){ var f = APP.foto(l, Object.keys(dados)); Object.assign(l, dados); return f; });
    };
    var pe = J.q('#fl-perda'); if (pe) pe.onclick = function(){ J.fechar(); APP.acao('Lançamento marcado como prejuízo.', function(){ var f = APP.foto(l, ['perda']); l.perda = true; return f; }); };
    var del = J.q('#fl-del'); if (del) del.onclick = function(){ J.fechar(); APP.confirmar({ tit:'Excluir este lançamento?', sub:esc(l.desc), ok:'Excluir', perigo:true }).then(function(s){ if (s) APP.acao('Lançamento excluído.', function(){ var i = D().lanc.indexOf(l); D().lanc.splice(i, 1); return function(){ D().lanc.splice(i, 0, l); }; }); }); };
  }
  function janelaRecibo(emp){
    var L = D().lanc.filter(function(l){ return l.empresa === emp && l.tipo === 'receita' && l.pago; }).sort(function(a, b){ return b.pago - a.pago; }).slice(0, 12);
    var J = APP.janela({ kick:'Recibo', tit:'Escolha o recebimento', corpo:'<div class="lista">' + L.map(function(l){ var c = APP.cli(l.cli); return '<button type="button" class="li li-bt" data-rc="' + l.id + '"><span class="li-tx"><b>' + esc(c.nome) + '</b><small>' + esc(l.desc) + ' · pago em ' + APP.fd(l.pago) + '</small></span><b class="val">' + brl(l.v) + '</b></button>'; }).join('') + '</div>' });
    J.el.addEventListener('click', function(e){ var b = e.target.closest('[data-rc]'); if (!b) return; var l = D().lanc.find(function(x){ return x.id === b.dataset.rc; }), c = APP.cli(l.cli); J.fechar();
      APP.janela({ kick:'Recibo', tit:'Recibo de honorários', corpo:'<div class="previa-email"><div class="pe-hd">Araújo &amp; Castro — Recibo</div><div class="pe-bd">Recebemos de ' + esc(c.nome) + ' (' + esc(c.doc) + ') a quantia de ' + brl(l.v) + ', referente a ' + esc(l.desc) + ', paga em ' + APP.fd(l.pago) + '.\n\nBelo Horizonte, ' + APP.fd(HOJE) + '.\n\nAraújo & Castro Advocacia</div></div>',
        rodape:'<button class="bt bt-o" type="button" data-fechar>Fechar</button><button class="bt bt-p" type="button" data-fechar>' + ic('enviar') + 'Mandar por e-mail</button>' }); });
  }

  /* ── Análise (gráficos e comparativos) ── */
  function analise(el, emp){
    var quem = APP.pref('fa-quem') || '', per = APP.pref('fa-per') || 'ano';
    var ini = per === 'mes' ? new Date(HOJE.getFullYear(), HOJE.getMonth(), 1) : per === 'passado' ? new Date(HOJE.getFullYear(), HOJE.getMonth() - 1, 1) : per === '12' ? new Date(HOJE.getFullYear(), HOJE.getMonth() - 11, 1) : per === 'tudo' ? new Date(2000, 0, 1) : new Date(HOJE.getFullYear(), 0, 1);
    var fim = per === 'passado' ? new Date(HOJE.getFullYear(), HOJE.getMonth(), 0) : new Date(HOJE.getFullYear(), 11, 31);
    var L = D().lanc.filter(function(l){ return l.empresa === emp && (!quem || l.quem === quem); });
    var rec = L.filter(function(l){ return l.tipo === 'receita' && !l.redutor && l.pago && l.pago >= ini && l.pago <= fim; });
    var aRec = L.filter(function(l){ return l.tipo === 'receita' && !l.redutor && !l.pago && !l.perda; }), atr = aRec.filter(function(l){ return l.venc <= HOJE; });
    var aPag = L.filter(function(l){ return l.tipo === 'despesa' && !l.pago; }), perda = L.filter(function(l){ return l.perda; }), sv = function(l){ return APP.soma(l, function(x){ return x.v; }); };
    el.innerHTML = '<div class="filtro-linha"><span class="rot">Quem</span><div class="chips" id="fa-q"><button class="chip" type="button" data-q="" aria-pressed="' + !quem + '">Todos</button>' + D().equipe.map(function(p){ return '<button class="chip" type="button" data-q="' + p.id + '" aria-pressed="' + (quem === p.id) + '">' + esc(p.curto) + '</button>'; }).join('') + '</div>'
      + '<span class="rot">Período</span><div class="chips" id="fa-p">' + [['mes','Este mês'],['passado','Mês passado'],['ano','Este ano'],['12','12 meses'],['tudo','Tudo']].map(function(x){ return '<button class="chip" type="button" data-p="' + x[0] + '" aria-pressed="' + (per === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div></div>'
      + APP.nums([['Recebido', brl(sv(rec)), 'verde', APP.plural(rec.length, 'recebimento', 'recebimentos')], ['A receber', brl(sv(aRec)), '', APP.plural(aRec.length, 'em aberto', 'em aberto')], ['Em atraso', brl(sv(atr)), 'vermelho', 'todos os meses'], emp === 'contab' ? ['A pagar', brl(sv(aPag)), '', APP.plural(aPag.length, 'conta', 'contas')] : ['Prejuízo', brl(sv(perda)), '', APP.plural(perda.length, 'baixa', 'baixas')], ['Ticket médio', brl(rec.length ? sv(rec) / rec.length : 0), '', 'por recebimento']])
      + '<section class="quadro pad"><div class="sec-cab"><div><h2>Recebido mês a mês</h2><p>Empilhado por pessoa. Passe o mouse na coluna para ver o valor.</p></div></div><div id="fa-mes"></div></section>'
      + '<section class="quadro pad"><div class="sec-cab"><div><h2>Comparativo por pessoa</h2></div></div><div id="fa-pess"></div></section>'
      + '<div class="duas"><section class="quadro pad"><div class="sec-cab"><div><h2>Por tipo de serviço</h2></div></div><div id="fa-serv"></div></section><section class="quadro pad"><div class="sec-cab"><div><h2>Maiores grupos</h2></div></div><div id="fa-grp"></div></section></div>'
      + (emp === 'contab' ? '<div class="duas"><section class="quadro pad"><div class="sec-cab"><div><h2>Resultado do mês</h2><p>Entradas − saídas</p></div></div><div id="fa-res"></div></section><section class="quadro pad"><div class="sec-cab"><div><h2>Despesas por categoria</h2></div></div><div id="fa-desp"></div></section></div>' : '');
    el.querySelector('#fa-q').onclick = function(e){ var b = e.target.closest('[data-q]'); if (b){ APP.pref('fa-quem', b.dataset.q); APP.redesenhar(); } };
    el.querySelector('#fa-p').onclick = function(e){ var b = e.target.closest('[data-p]'); if (b){ APP.pref('fa-per', b.dataset.p); APP.redesenhar(); } };
    var meses = []; for (var m = 6; m >= 0; m--) meses.push(new Date(HOJE.getFullYear(), HOJE.getMonth() - m, 1));
    var noMes = function(l, d){ return l.pago && l.pago.getMonth() === d.getMonth() && l.pago.getFullYear() === d.getFullYear(); };
    var todosRec = L.filter(function(l){ return l.tipo === 'receita' && !l.redutor && l.pago; });
    APP.$('fa-mes').innerHTML = APP.colunas(meses.map(APP.mesCurto), D().equipe.map(function(p, i){ return { rot:p.curto, cor:CORES[i], v:meses.map(function(d){ return APP.soma(todosRec.filter(function(l){ return l.quem === p.id && noMes(l, d); }), function(l){ return l.v; }); }) }; }).filter(function(s){ return s.v.some(Boolean); }));
    var tot = sv(rec) || 1;
    APP.$('fa-pess').innerHTML = '<div class="rola livre"><table class="tab" style="min-width:0"><thead><tr><th>Pessoa</th><th class="dir">Recebido</th><th class="dir">%</th><th class="cen">Lançamentos</th><th class="dir">Ticket médio</th><th class="dir">A receber</th><th class="dir">Prejuízo</th></tr></thead><tbody>'
      + D().equipe.map(function(p){ var r = rec.filter(function(l){ return l.quem === p.id; }), a = aRec.filter(function(l){ return l.quem === p.id; }), pe = perda.filter(function(l){ return l.quem === p.id; }); if (!r.length && !a.length) return '';
        return '<tr><td>' + APP.pessoaTxt(p.id) + '</td><td class="dir val verde">' + brl(sv(r)) + '</td><td class="dir">' + Math.round(sv(r) / tot * 100) + '%</td><td class="cen">' + r.length + '</td><td class="dir">' + brl(r.length ? sv(r) / r.length : 0) + '</td><td class="dir">' + brl(sv(a)) + '</td><td class="dir">' + (pe.length ? brl(sv(pe)) : '—') + '</td></tr>'; }).join('')
      + '</tbody><tfoot><tr><td>Total</td><td class="dir val">' + brl(sv(rec)) + '</td><td class="dir">100%</td><td class="cen">' + rec.length + '</td><td></td><td class="dir">' + brl(sv(aRec)) + '</td><td class="dir">' + brl(sv(perda)) + '</td></tr></tfoot></table></div>';
    var por = function(f){ var M = {}; rec.forEach(function(l){ var k = f(l); M[k] = (M[k] || 0) + l.v; }); return Object.keys(M).map(function(k){ return { rot:k, v:M[k] }; }).sort(function(a, b){ return b.v - a.v; }).slice(0, 10); };
    APP.$('fa-serv').innerHTML = APP.barrasH(por(function(l){ return l.servico; }));
    APP.$('fa-grp').innerHTML = APP.barrasH(por(function(l){ return l.cli ? APP.grupo(APP.cli(l.cli).g).nome : '—'; }));
    if (emp === 'contab'){
      var desp = L.filter(function(l){ return l.tipo === 'despesa' && l.pago; });
      APP.$('fa-res').innerHTML = '<table class="tab" style="min-width:0"><thead><tr><th>Mês</th><th class="dir">Entradas</th><th class="dir">Saídas</th><th class="dir">Resultado</th></tr></thead><tbody>' + meses.map(function(d){
        var e = APP.soma(todosRec.filter(function(l){ return noMes(l, d); }), function(l){ return l.v; }), s = APP.soma(desp.filter(function(l){ return noMes(l, d); }), function(l){ return l.v; });
        return '<tr><td>' + APP.mesCurto(d) + '</td><td class="dir verde">' + brl(e) + '</td><td class="dir vermelho">' + brl(s) + '</td><td class="dir val ' + (e - s < 0 ? 'vermelho' : '') + '">' + brl(e - s) + '</td></tr>'; }).join('') + '</tbody></table>';
      var M = {}; desp.forEach(function(l){ M[l.servico] = (M[l.servico] || 0) + l.v; });
      APP.$('fa-desp').innerHTML = APP.barrasH(Object.keys(M).map(function(k){ return { rot:k, v:M[k], cor:'var(--red)' }; }).sort(function(a, b){ return b.v - a.v; }));
    }
  }

  /* ═════════ CONTRATOS ═════════ */
  var valorCt = function(c){ return c.modo === 'salarios' ? c.valor * D().salarioMinimo : c.valor; };
  APP.registrar('contratos', { tit:'Contratos', ic:'contrato',
    ajuda:['Consultoria (mensal fixo ou em salários mínimos) ou serviço pontual com parcelas.', 'Ao assinar, as parcelas/mensalidades entram sozinhas no Financeiro.', 'Reajuste em menos de 60 dias aparece em âmbar.'],
    novo:function(){ APP.aviso('No ERP: + Lançar → Contrato.'); },
    desenhar:function(el){
      el.innerHTML = APP.cabecalho({ ic:'contrato', tit:'Contratos', frase:APP.T('contratos.frase'), acoes:'<button class="bt bt-o" type="button" id="ct-sm">Salário mínimo: ' + brl(D().salarioMinimo) + '</button><button class="bt bt-p" type="button" id="ct-novo">' + ic('mais') + 'Contrato</button>' }) + '<div id="ct-tab"></div>';
      APP.$('ct-novo').onclick = APP.telas.contratos.novo;
      APP.$('ct-sm').onclick = function(){ APP.aviso('O valor do salário mínimo de cada ano fica nesta tabela; os contratos em salários mínimos usam o do ano.'); };
      APP.tabela(APP.$('ct-tab'), { id:'contratos', linhas:D().contratos, unidade:['contrato', 'contratos'], contagem:true,
        abas:[{ id:'at', rot:'Ativos', f:function(c){ return c.status === 'Ativo'; } }, { id:'ag', rot:'Aguardando assinatura', f:function(c){ return c.status === 'Aguardando assinatura'; } }, { id:'enc', rot:'Encerrados', f:function(c){ return c.status === 'Encerrado'; } }, { id:'todos', rot:'Todos', f:function(){ return true; } }],
        busca:function(c){ return APP.cli(c.cli).nome + ' ' + c.desc; }, valor:valorCt,
        colunas:[{ k:'cli', rot:'Cliente', html:function(c){ return APP.empresa(APP.cli(c.cli)); }, ord:function(c){ return APP.cli(c.cli).nome; } },
          { k:'tipo', rot:'Tipo', html:function(c){ return esc(c.tipo) + '<span class="b-sub">' + esc(c.area) + '</span>'; }, ord:function(c){ return c.tipo; } },
          { k:'desc', rot:'Descrição', html:function(c){ return esc(c.desc) + (c.exito ? '<span class="b-sub">+ êxito: ' + esc(c.exito) + '</span>' : ''); }, ord:function(c){ return c.desc; } },
          { k:'v', rot:'Valor', cls:'dir', soma:true, html:function(c){ return '<span class="val">' + brl(valorCt(c)) + '</span><small class="mudo">' + (c.tipo === 'Consultoria' ? (c.modo === 'salarios' ? c.valor + ' salários mínimos / mês' : 'por mês') : c.parcelas + ' parcelas') + '</small>'; }, ord:valorCt },
          { k:'ini', rot:'Início', cls:'cen dt', html:function(c){ return APP.fd(c.inicio); }, ord:function(c){ return +c.inicio; } },
          { k:'reaj', rot:'Reajuste', cls:'cen', html:function(c){ if (!c.reajuste) return '<span class="traco">—</span>'; var d = -APP.dias(c.reajuste); return '<span class="' + (d < 60 ? 'pz-a' : 'mudo') + '">' + APP.fd(c.reajuste) + '</span>'; }, ord:function(c){ return c.reajuste ? +c.reajuste : 9e15; } },
          { k:'st', rot:'Situação', cls:'cen', html:function(c){ return '<span class="pill ' + ({ Ativo:'p-g', 'Aguardando assinatura':'p-a', Encerrado:'p-n' }[c.status]) + '">' + esc(c.status) + '</span>'; }, ord:function(c){ return c.status; } }],
        clique:janelaContrato });
    } });
  function janelaContrato(ct){
    var c = APP.cli(ct.cli), L = D().lanc.filter(function(l){ return l.cli === ct.cli && l.desc.indexOf(ct.desc) === 0; });
    var J = APP.janela({ larga:true, kick:ct.tipo + ' · ' + ct.area, tit:ct.desc, sub:esc(c.nome), dir:'<span class="pill ' + ({ Ativo:'p-g', 'Aguardando assinatura':'p-a', Encerrado:'p-n' }[ct.status]) + '">' + esc(ct.status) + '</span>',
      corpo:'<div class="ficha"><div><span>Valor</span><b>' + brl(valorCt(ct)) + (ct.tipo === 'Consultoria' ? ' / mês' : '') + '</b></div><div><span>Início</span><b>' + APP.fd(ct.inicio) + '</b></div><div><span>Reajuste</span><b>' + (ct.reajuste ? APP.fd(ct.reajuste) : '—') + '</b></div><div><span>Êxito</span><b>' + esc(ct.exito || '—') + '</b></div></div>'
        + '<div class="bloco"><h3>Lançamentos deste contrato no Financeiro</h3><div id="jc-tab"></div></div>',
      rodape:(ct.status === 'Aguardando assinatura' ? '<button class="bt bt-p" type="button" id="jc-ass">' + ic('check') + 'Marcar como assinado</button>' : '') + (ct.reajuste ? '<button class="bt bt-o" type="button" id="jc-reaj">Aplicar reajuste</button>' : '') + '<button class="bt bt-o" type="button" data-fechar>Fechar</button>' });
    APP.tabela(J.q('#jc-tab'), { id:'jc-' + ct.id, linhas:L, semBarra:true, altura:'300px', valor:function(l){ return l.v; }, ord:{ k:'venc', dir:-1 }, vazio:{ tit:'Nenhum lançamento ainda', frase:ct.status === 'Aguardando assinatura' ? 'Entram ao marcar como assinado.' : '' },
      colunas:[{ k:'desc', rot:'Descrição', html:function(l){ return esc(l.desc); }, ord:function(l){ return l.desc; } }, { k:'v', rot:'Valor', cls:'dir val', soma:true, html:function(l){ return brl(l.v); }, ord:function(l){ return l.v; } },
        { k:'venc', rot:'Vencimento', cls:'cen dt', html:function(l){ return APP.fd(l.venc); }, ord:function(l){ return +l.venc; } }, { k:'pz', rot:'Prazo', cls:'cen', html:function(l){ return APP.celPrazo(l.venc, l.pago); }, ord:false }] });
    var as = J.q('#jc-ass'); if (as) as.onclick = function(){ J.fechar(); APP.acao('Contrato assinado: as mensalidades entraram no Financeiro.', function(){ var f = APP.foto(ct, ['status']); ct.status = 'Ativo'; var novos = [];
      for (var i = 0; i < 3; i++){ var l = { id:'l' + Date.now() + i, empresa:ct.area === 'Contabilidade' ? 'contab' : 'jur', tipo:'receita', cli:ct.cli, desc:ct.desc + ' — mês ' + (i + 1), servico:ct.area, v:valorCt(ct), venc:DADOS.noMes(HOJE.getFullYear(), HOJE.getMonth() + i, 5), quem:'emanuelle', pago:null }; D().lanc.push(l); novos.push(l); }
      return function(){ f(); novos.forEach(function(l){ D().lanc.splice(D().lanc.indexOf(l), 1); }); }; }); };
    var rj = J.q('#jc-reaj'); if (rj) rj.onclick = function(){ J.fechar(); APP.confirmar({ tit:'Aplicar reajuste de 4,83% (IPCA)?', sub:esc(ct.desc), ok:'Aplicar', resumo:'<span>De ' + brl(valorCt(ct)) + ' para</span><span class="val">' + brl(valorCt(ct) * 1.0483) + '</span>' }).then(function(s){ if (s) APP.acao('Reajuste aplicado.', function(){ var f = APP.foto(ct, ['valor', 'reajuste']); if (ct.modo !== 'salarios') ct.valor = Math.round(ct.valor * 104.83) / 100; ct.reajuste = new Date(ct.reajuste.getFullYear() + 1, ct.reajuste.getMonth(), ct.reajuste.getDate()); return f; }); }); };
  }
})();
