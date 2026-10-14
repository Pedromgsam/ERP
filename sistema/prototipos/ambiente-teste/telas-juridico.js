/* Telas do Jurídico: Painel Executivo, Processos, Parcelamentos, Acordos, Execuções e Publicações — todas com as mesmas peças. */
(function(){
  var APP = window.APP, N = APP.N, ic = APP.ic, esc = APP.esc, brl = APP.brl, HOJE = DADOS.HOJE, DIA = DADOS.DIA;
  var D = function(){ return APP.D; };
  var preparar = function(id, arg){ APP.preparar(id, arg); };
  var tot = function(p){ return (p.rfb || 0) + (p.rfbNeg || 0) + (p.pgfn || 0) + (p.pgfnNeg || 0) + (p.age || 0) + (p.ageNeg || 0); };
  var CAPAG = { A:'p-g', B:'p-g', C:'p-a', D:'p-r', Omisso:'p-r' };
  APP.nums = function(itens){ return '<div class="nums">' + itens.map(function(x){ return '<div class="num-it"><span>' + esc(x[0]) + '</span><b class="' + (x[2] || '') + '">' + x[1] + '</b>' + (x[3] ? '<small>' + x[3] + '</small>' : '') + '</div>'; }).join('') + '</div>'; };

  /* ═════════ PAINEL EXECUTIVO ═════════ */
  APP.registrar('painel', { tit:'Painel Executivo', ic:'grafico',
    ajuda:['Os números do alto são o passivo dos clientes (em aberto + negociado).', '<b>Empresas do grupo</b>: o desenho novo da tabela. Clique na empresa para abrir a ficha.', 'A tabela antiga tinha a faixa do grupo repetida; aqui o grupo é só a 1ª coluna, com o ponto de cor.'],
    desenhar:function(el){
      var C = D().clientes, P = C.map(function(c){ return c.passivo; });
      var s = function(k){ return APP.soma(P, function(p){ return p[k] || 0; }); };
      var parcSaldo = APP.soma(D().parcelas.filter(function(x){ return !x.pago; }), function(x){ return x.v; }), acSaldo = APP.soma(D().acordos.filter(function(x){ return !x.pago; }), function(x){ return x.v; });
      var proc = D().processos.filter(function(p){ return p.status === 'Ativo'; });
      el.innerHTML = APP.cabecalho({ ic:'grafico', tit:'Painel Executivo', frase:APP.T('painel.frase') })
        + APP.nums([['Passivo total', APP.brlK(s('rfb') + s('rfbNeg') + s('pgfn') + s('pgfnNeg') + s('age') + s('ageNeg')), 'forte'], ['RFB', APP.brlK(s('rfb') + s('rfbNeg'))], ['PGFN', APP.brlK(s('pgfn') + s('pgfnNeg'))], ['AGE/MG', APP.brlK(s('age') + s('ageNeg'))],
          ['Parcelamentos (saldo)', APP.brlK(parcSaldo)], ['Acordos (em aberto)', APP.brlK(acSaldo)], ['Passivo em disputa', APP.brlK(APP.soma(proc.filter(function(p){ return p.polo === 'passivo'; }), function(p){ return p.valor; })), 'vermelho'], ['Ativo em disputa', APP.brlK(APP.soma(proc.filter(function(p){ return p.polo === 'ativo'; }), function(p){ return p.valor; })), 'verde']])
        + '<section class="quadro pad"><div class="sec-cab"><div><h2>' + APP.T('painel.evolucao') + '</h2></div><div class="chips"><button class="chip" type="button" data-ev="6" aria-pressed="' + (APP.pref('ev') !== 12) + '">6 meses</button><button class="chip" type="button" data-ev="12" aria-pressed="' + (APP.pref('ev') === 12) + '">12 meses</button></div></div><div id="pe-evo"></div></section>'
        + '<div class="sec-cab"><div><h2>Empresas do grupo</h2><p>' + APP.T('painel.empresas') + '</p></div></div><div id="pe-tab"></div>';
      var n = APP.pref('ev') === 12 ? 12 : 6, ev = D().evolucao.slice(-n);
      APP.$('pe-evo').innerHTML = APP.linha(ev.map(function(x){ return { rot:APP.mesCurto(x.mes), v:x.v }; }));
      el.querySelector('.quadro.pad .chips').onclick = function(e){ var b = e.target.closest('[data-ev]'); if (b){ APP.pref('ev', +b.dataset.ev); APP.redesenhar(); } };
      APP.tabela(APP.$('pe-tab'), { id:'painel-emp', linhas:C, unidade:['empresa', 'empresas'], dicaBusca:'Nome, sócio ou CNPJ…', tabCls:'t-painel',
        abas:[{ id:'ativos', rot:'Ativos', f:function(c){ return c.tipo !== 'Inativo'; } }, { id:'cons', rot:'Consultoria', f:function(c){ return c.tipo === 'Consultoria'; } }, { id:'pont', rot:'Serviço pontual', f:function(c){ return c.tipo === 'Serviço pontual'; } }, { id:'inat', rot:'Inativos', f:function(c){ return c.tipo === 'Inativo'; } }, { id:'todos', rot:'Todos', f:function(){ return true; } }],
        busca:function(c){ return c.nome + ' ' + c.socio + ' ' + c.doc.replace(/\D/g, '') + ' ' + APP.grupo(c.g).nome; }, valor:function(c){ return tot(c.passivo); }, ord:{ k:'g', dir:1 },
        listas:[{ k:'g', rot:'Grupo', todos:'Todos os grupos', opcoes:D().grupos.map(function(g){ return [g.id, g.nome]; }), get:function(c){ return c.g; } }, { k:'area', rot:'Área', todos:'Jurídico e Contabilidade', opcoes:[['juridico','Jurídico'],['contabilidade','Contabilidade'],['ambos','As duas']], get:function(c){ return c.area; } }],
        colunas:[{ k:'g', rot:'Grupo', html:function(c){ return APP.grupoTxt(c.g); }, ord:function(c){ return APP.grupo(c.g).nome + c.nome; } },
          { k:'nome', rot:'Entidade / sócio', html:function(c){ return '<span class="nome">' + esc(c.nome) + '</span>' + (c.socio ? '<span class="b-sub">Sócio: ' + esc(c.socio) + '</span>' : ''); }, ord:function(c){ return c.nome; } },
          { k:'doc', rot:'CPF/CNPJ', cls:'num', html:function(c){ return esc(c.doc); }, ord:function(c){ return c.doc; } },
          { k:'rfb', rot:'RFB', cls:'dir', html:function(c){ return valNeg(c.passivo.rfb, c.passivo.rfbNeg); }, ord:function(c){ return c.passivo.rfb + c.passivo.rfbNeg; } },
          { k:'pgfn', rot:'PGFN', cls:'dir', html:function(c){ return valNeg(c.passivo.pgfn, c.passivo.pgfnNeg); }, ord:function(c){ return c.passivo.pgfn + c.passivo.pgfnNeg; } },
          { k:'age', rot:'AGE/MG', cls:'dir', html:function(c){ return valNeg(c.passivo.age, c.passivo.ageNeg); }, ord:function(c){ return c.passivo.age + c.passivo.ageNeg; } },
          { k:'tot', rot:'Total', cls:'dir val', soma:true, html:function(c){ var t = tot(c.passivo); return t ? APP.brlK(t) : '—'; }, ord:function(c){ return tot(c.passivo); } },
          { k:'op', rot:'Negociado', cls:'cen', html:function(c){ var p = c.passivo; return p.rfbNeg + p.pgfnNeg + p.ageNeg ? '<span class="pill p-g">Sim</span>' : '<span class="traco">—</span>'; }, ord:function(c){ var p = c.passivo; return p.rfbNeg + p.pgfnNeg + p.ageNeg; } },
          { k:'capag', rot:'CAPAG', cls:'cen', html:function(c){ return '<span class="pill ' + (CAPAG[c.capag] || 'p-n') + '">' + esc(c.capag) + '</span>'; }, ord:function(c){ return c.capag; } }],
        clique:function(c){ APP.fichaCliente(c.id); } });
    } });
  function valNeg(a, n){ if (!a && !n) return '<span class="traco">—</span>'; return '<span class="val">' + APP.brlK(a + n) + '</span>' + (n ? '<small class="neg">' + APP.brlK(n) + ' neg.</small>' : ''); }

  /* ═════════ PROCESSOS ═════════ */
  APP.registrar('processos', { tit:'Processos', ic:'balanca', pai:'Jurídico',
    ajuda:['Abas Ativos · Arquivados · Extintos · Todos. Grupo, tribunal e natureza ficam em <b>Filtros</b>.', 'A data da última movimentação fica <span class="pz-r">vermelha</span> com mais de 30 dias sem novidade.', 'Clique no processo: ficha, últimas movimentações, "+ Registrar movimentação" e "Editar".', 'O resumo da carteira começa fechado (clique para abrir).'],
    novo:function(){ APP.aviso('No ERP: + Lançar → Processo (formulário do processo).'); },
    desenhar:function(el, arg){
      var P = D().processos, at = P.filter(function(p){ return p.status === 'Ativo'; });
      preparar('processos', arg);
      var porK = function(f){ var M = {}; at.forEach(function(p){ var k = f(p); M[k] = M[k] || { k:k, n:0, v:0 }; M[k].n++; M[k].v += p.valor; }); return Object.keys(M).map(function(k){ return M[k]; }).sort(function(a, b){ return b.v - a.v; }); };
      var mini = function(tit, L){ return '<div class="mini"><table class="tab" style="min-width:0"><thead><tr><th>' + tit + '</th><th class="cen">Processos</th><th class="dir">Valor</th></tr></thead><tbody>' + L.map(function(x){ return '<tr><td>' + esc(x.k) + '</td><td class="cen">' + x.n + '</td><td class="dir val">' + (x.v ? APP.brlK(x.v) : '—') + '</td></tr>'; }).join('') + '</tbody></table></div>'; };
      el.innerHTML = APP.cabecalho({ ic:'balanca', tit:'Processos', frase:APP.T('processos.frase'), acoes:'<button class="bt bt-p" type="button" id="pr-novo">' + ic('mais') + 'Processo</button>' })
        + '<details class="resumo-cart"' + (APP.pref('pr-res') ? ' open' : '') + '><summary>' + APP.T('processos.analise') + ' <small>' + APP.plural(at.length, 'processo ativo', 'processos ativos') + ' · ' + APP.brlK(APP.soma(at, function(p){ return p.valor; })) + ' em disputa</small></summary>'
        + APP.nums([['Processos ativos', String(at.length)], ['Valor em disputa', APP.brlK(APP.soma(at, function(p){ return p.valor; }))], ['Passivo (cliente réu)', APP.brlK(APP.soma(at.filter(function(p){ return p.polo === 'passivo'; }), function(p){ return p.valor; })), 'vermelho'], ['Ativo (cliente autor)', APP.brlK(APP.soma(at.filter(function(p){ return p.polo === 'ativo'; }), function(p){ return p.valor; })), 'verde']])
        + '<div class="tres">' + mini('Grupo', porK(function(p){ return APP.grupo(APP.cli(p.cli).g).nome; })) + mini('Tribunal', porK(function(p){ return p.tribunal; })) + mini('Natureza', porK(function(p){ return p.natureza; })) + '</div></details>'
        + '<div id="pr-tab"></div>';
      el.querySelector('.resumo-cart').ontoggle = function(){ APP.pref('pr-res', this.open); };
      APP.$('pr-novo').onclick = APP.telas.processos.novo;
      var uniq = function(f){ return Array.from(new Set(P.map(f))).sort().map(function(v){ return [v, v]; }); };
      APP.tabela(APP.$('pr-tab'), { id:'processos', linhas:P, unidade:['processo', 'processos'], contagem:true, dicaBusca:'Nº, cliente, autor ou réu…', tabCls:'t-proc',
        abas:[{ id:'at', rot:'Ativos', f:function(p){ return p.status === 'Ativo'; } }, { id:'arq', rot:'Arquivados', f:function(p){ return p.status === 'Arquivado'; } }, { id:'ext', rot:'Extintos', f:function(p){ return p.status === 'Extinto'; } }, { id:'todos', rot:'Todos', f:function(){ return true; } }],
        busca:function(p){ var c = APP.cli(p.cli); return p.numero + ' ' + p.numero.replace(/\D/g, '') + ' ' + c.nome + ' ' + p.autor + ' ' + p.reu + ' ' + p.natureza; }, valor:function(p){ return p.valor; }, ord:{ k:'g', dir:1 },
        listas:[{ k:'g', rot:'Grupo', todos:'Todos os grupos', opcoes:D().grupos.map(function(g){ return [g.id, g.nome]; }), get:function(p){ return APP.cli(p.cli).g; } },
          { k:'trib', rot:'Tribunal', todos:'Todos os tribunais', opcoes:uniq(function(p){ return p.tribunal; }), get:function(p){ return p.tribunal; } },
          { k:'nat', rot:'Natureza', todos:'Todas as naturezas', opcoes:uniq(function(p){ return p.natureza; }), get:function(p){ return p.natureza; } },
          { k:'conf', rot:'Conferência', todos:'Conferidos e não conferidos', opcoes:[['nao','Sem conferir há 15 dias ou mais'],['sim','Conferidos nos últimos 15 dias']], get:function(p){ return p.conferido && APP.dias(p.conferido) < 15 ? 'sim' : 'nao'; } }],
        colunas:[{ k:'g', rot:'Grupo', html:function(p){ return APP.grupoTxt(APP.cli(p.cli).g); }, ord:function(p){ return APP.grupo(APP.cli(p.cli).g).nome; } },
          { k:'n', rot:'Processo', cls:'num', html:function(p){ return esc(p.numero) + '<span class="b-sub">' + esc(p.tribunal) + '</span>'; }, ord:function(p){ return p.numero; } },
          { k:'nat', rot:'Natureza', html:function(p){ return esc(p.natureza); }, ord:function(p){ return p.natureza; } },
          { k:'pt', rot:'Partes', html:function(p){ return esc(p.autor) + '<span class="b-sub">× ' + esc(p.reu) + '</span>'; }, ord:function(p){ return p.autor; } },
          { k:'v', rot:'Valor', cls:'dir val', soma:true, html:function(p){ return p.valor ? brl(p.valor) : '—'; }, ord:function(p){ return p.valor; } },
          { k:'mov', rot:'Última movimentação', cls:'dt', html:function(p){ var d = APP.dias(p.ultMov.data); return '<span class="' + (d > 30 ? 'pz-r' : '') + '">' + APP.fd(p.ultMov.data) + '</span><small>' + esc(p.ultMov.txt) + '</small>'; }, ord:function(p){ return +p.ultMov.data; } },
          { k:'conf', rot:'Conferido', cls:'cen', html:function(p){ return p.conferido ? '<span class="' + (APP.dias(p.conferido) < 15 ? 'ok-txt' : 'pz-a') + '">' + APP.fc(p.conferido) + '</span>' : '<span class="pz-r">nunca</span>'; }, ord:function(p){ return p.conferido ? +p.conferido : 0; } }],
        clique:janelaProcesso, vazio:{ tit:'Nenhum processo aqui', frase:'Troque a aba ou limpe os filtros.' } });
    } });
  var janelaProcesso = APP.janelaProcesso = function(p){
    var c = APP.cli(p.cli);
    var J = APP.janela({ larga:true, kick:'Processo · ' + p.tribunal, tit:p.numero, sub:esc(c.nome) + ' · ' + APP.grupoTxt(c.g), dir:'<span class="pill ' + (p.status === 'Ativo' ? 'p-g' : 'p-n') + '">' + esc(p.status) + '</span>',
      corpo:'<div class="ficha"><div><span>Natureza</span><b>' + esc(p.natureza) + '</b></div><div><span>Autor</span><b>' + esc(p.autor) + '</b></div><div><span>Réu</span><b>' + esc(p.reu) + '</b></div><div><span>Advogado</span><b>' + esc(APP.pessoa(p.adv).nome) + '</b></div>'
        + '<div><span>Valor da causa</span><b>' + (p.valor ? brl(p.valor) : '—') + '</b></div><div><span>Valor atualizado em</span><b>' + APP.fd(p.valorEm) + '</b></div><div><span>Cliente é</span><b>' + (p.polo === 'passivo' ? 'Réu (passivo)' : 'Autor (ativo)') + '</b></div><div><span>Conferido em</span><b>' + (p.conferido ? APP.fd(p.conferido) : 'nunca') + '</b></div></div>'
        + '<div class="bloco"><h3>Últimas movimentações</h3><div class="tempo">' + [p.ultMov].concat(p.movs || []).sort(function(a, b){ return b.data - a.data; }).slice(0, 3).map(function(m){ return '<div class="ev"><span class="q">' + APP.fd(m.data) + '</span><span class="ic">' + ic('jornal') + '</span><div class="tx"><b>' + esc(m.txt) + '</b></div></div>'; }).join('') + '</div></div>',
      rodape:'<button class="bt bt-o esq" type="button" id="pj-ficha">' + ic('pessoas') + 'Ficha do cliente</button><button class="bt bt-o" type="button" id="pj-conf">' + ic('check') + 'Conferido, sem novidade</button><button class="bt bt-o" type="button" id="pj-mov">' + ic('mais') + 'Registrar movimentação</button><button class="bt bt-p" type="button" id="pj-ed">' + ic('lapis') + 'Editar</button>' });
    J.q('#pj-ficha').onclick = function(){ J.fechar(); APP.fichaCliente(c.id); };
    J.q('#pj-conf').onclick = function(){ J.fechar(); APP.acao('Processo conferido (sem novidade).', function(){ var v = APP.foto(p, ['conferido']); p.conferido = new Date(HOJE); return v; }); };
    J.q('#pj-mov').onclick = function(){ J.fechar(); APP.janelaMovimento(p); };
    J.q('#pj-ed').onclick = function(){ APP.aviso('No ERP: abre o formulário do processo.'); };
  };
  APP.janelaMovimento = function(p){
    var J = APP.janela({ kick:'Registrar movimentação', tit:p.numero, corpo:APP.campo('Tipo', APP.opcoes('Tipo', ['Movimentação', 'Decisão', 'Mudança de valor', 'Procuração'], 'Movimentação')) + APP.campo('O que aconteceu', '<input class="ctl" id="mv-tx" placeholder="Ex.: Juntada de petição da União">') + '<div class="dois">' + APP.campo('Data', '<input class="ctl" type="date" id="mv-d" value="' + APP.iso(HOJE) + '">') + APP.campo('Novo valor da causa (se mudou)', '<input class="ctl" id="mv-v" inputmode="decimal" placeholder="R$">') + '</div>',
      rodape:'<button class="bt bt-o" type="button" data-fechar>Cancelar</button><button class="bt bt-p" type="button" id="mv-ok">' + ic('check') + 'Salvar</button>' });
    J.q('#mv-ok').onclick = function(){ var tx = J.q('#mv-tx').value.trim() || APP.opcaoDe(J, 'Tipo'), d = APP.deIso(J.q('#mv-d').value) || HOJE, v = APP.num(J.q('#mv-v').value);
      J.fechar(); APP.acao('Movimentação registrada.', function(){ var volta = APP.foto(p, ['ultMov', 'conferido', 'valor', 'valorEm']); p.movs = p.movs || []; p.movs.push(p.ultMov); p.ultMov = { data:d, txt:tx }; p.conferido = new Date(HOJE); if (v){ p.valor = v; p.valorEm = d; } return volta; }); };
  };

  /* ═════════ PARCELAMENTOS ═════════ */
  function colsParcelas(o){
    o = o || {}; var C = [];
    if (!o.semGrupo) C.push({ k:'g', rot:'Grupo', html:function(x){ return APP.grupoTxt(N.grupoDe(x)); }, ord:function(x){ return APP.grupo(N.grupoDe(x)).nome; } });
    if (!o.semEmpresa) C.push({ k:'emp', rot:'Empresa', html:function(x){ return APP.empresa(N.cliDe(x)); }, ord:function(x){ return N.cliDe(x).nome; } });
    C.push({ k:'plat', rot:'Plataforma', html:function(x){ var pa = N.pa(x.pa); return '<span class="plat">' + esc(pa.plat) + '</span><span class="b-sub">' + esc(pa.nat) + '</span>'; }, ord:function(x){ return N.pa(x.pa).plat; } });
    if (!o.semNum) C.push({ k:'num', rot:'Nº', cls:'num', html:function(x){ return esc(N.pa(x.pa).num); }, ord:function(x){ return N.pa(x.pa).num; } });
    C.push({ k:'n', rot:'Parcela', cls:'cen dt', html:function(x){ return x.n + ' de ' + N.pa(x.pa).tot; }, ord:function(x){ return x.n; } });
    C.push({ k:'v', rot:'Valor', cls:'dir val', soma:true, html:function(x){ return brl(x.v); }, ord:function(x){ return x.v; } });
    C.push({ k:'venc', rot:'Vencimento', cls:'cen dt', html:function(x){ return APP.fd(x.venc); }, ord:function(x){ return +x.venc; } });
    C.push({ k:'pz', rot:'Prazo', cls:'cen', html:function(x){ var pa = N.pa(x.pa); return APP.celPrazo(x.venc, x.pago, x.pago ? '' : pa.cliEmite ? 'cliente emite' : x.emitida ? '✓ emitida' : ''); }, ord:function(x){ return x.pago ? +x.pago : +x.venc; } });
    C.push({ k:'ac', rot:'', cls:'dir acoes', ord:false, html:function(x){ if (x.pago) return ''; var pa = N.pa(x.pa); return '<span class="acs">' + (pa.cliEmite ? '' : APP.btEmitir('data-emitir="' + x.id + '"', !!x.emitida)) + APP.btBaixa('data-baixa="' + x.id + '"') + '</span>'; } });
    return C;
  }
  APP.colsParcelas = colsParcelas;
  document.addEventListener('click', function(e){
    var b = e.target.closest('[data-baixa]'); if (b){ e.stopPropagation(); N.baixaParcela(N.parcela(b.dataset.baixa)); return; }
    var em = e.target.closest('[data-emitir]'); if (em){ e.stopPropagation(); var x = N.parcela(em.dataset.emitir), pa = N.pa(x.pa);
      var irmas = D().parcelas.filter(function(y){ var p2 = N.pa(y.pa); return p2.cli === pa.cli && N.paraEmitir(y); }); if (irmas.indexOf(x) < 0) irmas.unshift(x);
      N.janelaEmitir(irmas, 'guia_parcelamento'); return; }
    var ba = e.target.closest('[data-baixa-ac]'); if (ba){ e.stopPropagation(); N.baixaAcordo(N.parcelaAc(ba.dataset.baixaAc)); return; }
    var ea = e.target.closest('[data-emitir-ac]'); if (ea){ e.stopPropagation(); N.janelaEmitir([N.parcelaAc(ea.dataset.emitirAc)], 'guia_acordo'); return; }
  }, true);
  var CHIPS = [['todos','Todos'],['atraso','Com atraso'],['risco','Risco de rescisão'],['dia','Em dia'],['concluidos','Concluídos']];
  function chips(id){ var v = APP.pref(id) || 'todos'; return '<div class="chips" data-chips="' + id + '">' + CHIPS.map(function(c){ return '<button class="chip" type="button" data-chip="' + c[0] + '" aria-pressed="' + (v === c[0]) + '">' + c[1] + '</button>'; }).join('') + '</div>'; }
  function ligarChips(el){ el.querySelectorAll('[data-chips]').forEach(function(box){ box.onclick = function(e){ var b = e.target.closest('[data-chip]'); if (b){ APP.pref(box.dataset.chips, b.dataset.chip); APP.redesenhar(); } }; }); }
  function passaChip(chip, atr, conc){ return chip === 'concluidos' ? conc : !conc && (chip === 'todos' || (chip === 'atraso' && atr) || (chip === 'risco' && atr >= 2) || (chip === 'dia' && !atr)); }

  APP.registrar('parcelamentos', { tit:'Parcelamentos', ic:'camadas', pai:'Jurídico',
    ajuda:['Sem os 4 cartões do topo (a pedido): a tela começa na situação por cliente.', 'Cartão do grupo: pagas, falta pagar, <b>parcela do mês</b> e o que vence no mês. Clique para ver os parcelamentos.', 'Tabela como a de Acordos: A pagar / Pago, atalhos de prazo, Emitir e Baixa (pede confirmação).', '"Emitir" abre o envio: anexe o PDF, o sistema lê valor e vencimento, e o e-mail vai para o rascunho (ou direto, se assim estiver em Administração → E-mails).'],
    desenhar:function(el, arg){
      preparar('parcelas', arg);
      el.innerHTML = APP.cabecalho({ ic:'camadas', tit:'Parcelamentos', frase:APP.T('parc.frase'), acoes:'<button class="bt bt-o" type="button" id="pc-guias">' + ic('doc') + 'Guias do mês</button><button class="bt bt-p" type="button" id="pc-novo">' + ic('mais') + 'Parcelamento</button>' })
        + '<div class="sec-cab"><div><h2>Situação por cliente</h2><p>' + APP.T('parc.situacao') + '</p></div>' + chips('pc-chip') + '</div><div class="cartoes" id="pc-grupos"></div>'
        + '<div class="sec-cab"><div><h2>Parcelas</h2></div></div><div id="pc-tab"></div>';
      ligarChips(el);
      APP.$('pc-guias').onclick = function(){ APP.ir('rotina', { aba:'guias' }); };
      APP.$('pc-novo').onclick = function(){ APP.aviso('No ERP: + Lançar → Parcelamento.'); };
      var chip = APP.pref('pc-chip') || 'todos', G = {};
      D().parcelamentos.forEach(function(pa){ var r = N.resumo(pa), gid = APP.cli(pa.cli).g; (G[gid] = G[gid] || []).push([pa, r]); });
      var grupos = Object.keys(G).map(function(gid){ var L = G[gid], vivos = L.filter(function(x){ return !x[1].concluido; }), g = APP.grupo(gid);
        var atr = APP.soma(vivos, function(x){ return x[1].atr; }), pg = APP.soma(vivos, function(x){ return x[1].pg; }), tt = APP.soma(vivos, function(x){ return x[0].tot; });
        var parcMes = APP.soma(vivos, function(x){ return x[1].parcMes ? x[1].parcMes.v : 0; }), mes = [].concat.apply([], vivos.map(function(x){ return x[1].mes; }));
        return { id:gid, nome:g.nome, cor:g.cor, atr:atr, conc:!vivos.length, itens:L, pill:atr ? ['p-r', APP.plural(atr, 'parcela', 'parcelas') + ' em atraso'] : ['p-g', vivos.length ? 'Em dia' : 'Concluídos'],
          sub:APP.plural(vivos.length, 'parcelamento', 'parcelamentos') + (atr >= 2 ? ' · <span class="n-atr">risco de rescisão</span>' : ''), barra:tt ? pg / tt * 100 : 100,
          linhas:[['Pagas', '<span class="verde">' + pg + '</span> de ' + tt], ['Falta pagar', brl(APP.soma(vivos, function(x){ return x[1].falta; }))], ['Parcela do mês', parcMes ? brl(parcMes) : '—'], ['A pagar este mês', mes.length ? brl(APP.soma(mes, function(x){ return x.v; })) + ' (' + mes.length + ')' : '—']] };
      }).filter(function(g){ return passaChip(chip, g.atr, g.conc); }).sort(function(a, b){ return b.atr - a.atr || a.nome.localeCompare(b.nome); });
      APP.cartoesGrupo(APP.$('pc-grupos'), { id:'pc', grupos:grupos, det:function(det, g){
        APP.tabela(det, { id:'pc-grupo-' + g.id, titulo:g.nome + ' — clique no parcelamento para ver todas as parcelas', linhas:g.itens, chave:function(x){ return x[0].id; }, unidade:['parcelamento', 'parcelamentos'], semBarra:true,
          colunas:[{ k:'emp', rot:'Empresa', html:function(x){ return APP.empresa(APP.cli(x[0].cli)); }, ord:function(x){ return APP.cli(x[0].cli).nome; } },
            { k:'plat', rot:'Plataforma', html:function(x){ return '<span class="plat">' + esc(x[0].plat) + '</span><span class="b-sub">' + esc(x[0].nat) + '</span>'; }, ord:function(x){ return x[0].plat; } },
            { k:'pg', rot:'Pagas', html:function(x){ return '<div class="prog"><div class="barra"><span style="width:' + (x[1].pg / x[0].tot * 100) + '%"></span></div>' + x[1].pg + ' de ' + x[0].tot + '</div>'; }, ord:function(x){ return x[1].pg / x[0].tot; } },
            { k:'falta', rot:'Falta pagar', cls:'dir val', html:function(x){ return brl(x[1].falta); }, ord:function(x){ return x[1].falta; } },
            { k:'mes', rot:'Parcela do mês', cls:'dir', html:function(x){ var p = x[1].parcMes; return p ? '<b class="val">' + brl(p.v) + '</b><small class="' + (p.pago ? 'ok-txt' : p.venc <= HOJE ? 'pz-r' : 'mudo') + '">' + (p.pago ? '✓ paga' : 'vence ' + APP.fc(p.venc)) + '</small>' : '—'; }, ord:function(x){ return x[1].parcMes ? x[1].parcMes.v : 0; } },
            { k:'sit', rot:'Situação', cls:'cen', html:function(x){ return x[1].concluido ? '<span class="pill p-g">Concluído</span>' : x[1].atr ? '<span class="n-atr">' + APP.plural(x[1].atr, 'parcela', 'parcelas') + ' em atraso</span>' : '<span class="pill p-g">Em dia</span>'; }, ord:function(x){ return x[1].atr; } }],
          clique:function(x){ janelaParcelamento(x[0]); } });
      } });
      var T = D().parcelas;
      APP.tabela(APP.$('pc-tab'), { id:'parcelas', linhas:T, unidade:['parcela', 'parcelas'], dicaBusca:'Empresa, CNPJ ou nº…', tabCls:'t-parc',
        abas:[{ id:'apagar', rot:'A pagar', f:function(x){ return !x.pago; } }, { id:'pago', rot:'Pago', f:function(x){ return !!x.pago; } }], prazos:true, prazosAbas:['apagar'],
        conta:function(n, aba){ return APP.plural(n, 'parcela', 'parcelas') + (aba === 'pago' ? (n === 1 ? ' paga' : ' pagas') : ' a pagar'); },
        ordAbas:{ apagar:{ k:'venc', dir:1 }, pago:{ k:'pz', dir:-1 } }, ord:{ k:'venc', dir:1 }, linhaCls:function(x){ return APP.vencida(x.venc, x.pago); },
        busca:function(x){ var c = N.cliDe(x), pa = N.pa(x.pa); return c.nome + ' ' + c.doc.replace(/\D/g, '') + ' ' + pa.num + ' ' + pa.nat; }, venc:function(x){ return x.venc; }, valor:function(x){ return x.v; },
        listas:[{ k:'g', rot:'Grupo', todos:'Todos os grupos', opcoes:D().grupos.map(function(g){ return [g.id, g.nome]; }), get:function(x){ return N.grupoDe(x); } },
          { k:'plat', rot:'Plataforma', todos:'Todas as plataformas', opcoes:[['e-CAC','e-CAC'],['Regularize','Regularize'],['SIARE','SIARE']], get:function(x){ return N.pa(x.pa).plat; } },
          { k:'nat', rot:'Natureza', todos:'Todas as naturezas', opcoes:['Simples Nacional','INSS','Previdenciário','Não previdenciário','ICMS'].map(function(n){ return [n, n]; }), get:function(x){ return N.pa(x.pa).nat; } }],
        colunas:colsParcelas(), clique:janelaParcela, vazio:{ tit:'Nenhuma parcela aqui', frase:'Troque a escolha (Todas, Vencidas, 5/10/15/30 dias) ou limpe os filtros.' } });
    } });
  var janelaParcelamento = APP.janelaParcelamento = function(pa){
    var c = APP.cli(pa.cli), r = N.resumo(pa), L = N.parcelasDe(pa), emitir = L.filter(N.paraEmitir);
    var J = APP.janela({ larga:true, kick:pa.plat + ' · ' + pa.nat, tit:c.nome, sub:'Nº ' + esc(pa.num) + ' · ' + APP.grupoTxt(c.g), dir:r.atr ? '<span class="pill p-r">' + APP.plural(r.atr, 'parcela', 'parcelas') + ' em atraso</span>' : '<span class="pill p-g">Em dia</span>',
      corpo:'<div class="ficha"><div><span>Empresa</span><b>' + esc(c.nome) + '</b></div><div><span>CNPJ/CPF</span><b class="m">' + esc(c.doc) + '</b></div><div><span>Plataforma</span><b>' + esc(pa.plat) + '</b></div><div><span>Quem emite a guia</span><b>' + (pa.cliEmite ? 'O cliente' : 'O escritório') + '</b></div></div>'
        + APP.nums([['Parcelas pagas', r.pg + ' de ' + pa.tot], ['Já pago', brl(r.quitado), 'verde'], ['Falta pagar', brl(r.falta)], ['Parcela do mês', r.parcMes ? brl(r.parcMes.v) + ' · ' + (r.parcMes.pago ? 'paga' : APP.fc(r.parcMes.venc)) : '—', r.parcMes && !r.parcMes.pago && r.parcMes.venc <= HOJE ? 'vermelho' : ''], ['Em atraso', r.atr ? APP.plural(r.atr, 'parcela', 'parcelas') : 'nenhuma', r.atr ? 'vermelho' : '']])
        + '<div id="jp-tab"></div>',
      rodape:'<button class="bt bt-o esq" type="button" id="jp-ficha">' + ic('pessoas') + 'Ficha do cliente</button>' + (emitir.length ? '<button class="bt bt-o" type="button" id="jp-emitir">' + ic('doc') + 'Emitir (' + emitir.length + ')</button>' : '') + '<button class="bt bt-o" type="button" data-fechar>Fechar</button>' });
    APP.tabela(J.q('#jp-tab'), { id:'jp-' + pa.id, linhas:L, unidade:['parcela', 'parcelas'], altura:'340px', abaPadrao:'ab', contagem:true,
      abas:[{ id:'ab', rot:'A pagar', f:function(x){ return !x.pago; } }, { id:'pg', rot:'Pagas', f:function(x){ return !!x.pago; } }, { id:'todas', rot:'Todas', f:function(){ return true; } }],
      colunas:colsParcelas({ semGrupo:true, semEmpresa:true, semNum:true }).filter(function(c){ return c.k !== 'plat'; }), ord:{ k:'n', dir:1 }, valor:function(x){ return x.v; }, linhaCls:function(x){ return APP.vencida(x.venc, x.pago); } });
    J.q('#jp-ficha').onclick = function(){ J.fechar(); APP.fichaCliente(c.id); };
    var em = J.q('#jp-emitir'); if (em) em.onclick = function(){ J.fechar(); N.janelaEmitir(emitir, 'guia_parcelamento'); };
  };
  function janelaParcela(x){ janelaParcelamento(N.pa(x.pa)); }

  /* ═════════ ACORDOS ═════════ */
  APP.registrar('acordos', { tit:'Acordos', ic:'contrato',
    ajuda:['Mesmo desenho de Parcelamentos, sem os cartões do topo.', 'A Baixa do acordo pergunta se o comprovante foi anexado ao processo.', '"Emitir" manda o boleto/PIX do acordo (rascunho ou direto, como estiver em Administração → E-mails).'],
    desenhar:function(el, arg){
      preparar('acordos', arg);
      el.innerHTML = APP.cabecalho({ ic:'contrato', tit:'Acordos', frase:APP.T('acordos.frase'), acoes:'<button class="bt bt-p" type="button" id="ac-novo">' + ic('mais') + 'Acordo</button>' })
        + '<div class="sec-cab"><div><h2>Situação por cliente</h2><p>' + APP.T('acordos.situacao') + '</p></div>' + chips('ac-chip') + '</div><div class="cartoes" id="ac-grupos"></div>'
        + '<div class="sec-cab"><div><h2>Parcelas</h2></div></div><div id="ac-tab"></div>';
      ligarChips(el);
      APP.$('ac-novo').onclick = function(){ APP.aviso('No ERP: + Lançar → Acordo inteiro.'); };
      var chip = APP.pref('ac-chip') || 'todos', A = N.acordos(), G = {};
      A.forEach(function(a){ var gid = APP.cli(a.cli).g; (G[gid] = G[gid] || []).push(a); });
      var grupos = Object.keys(G).map(function(gid){ var L = G[gid], vivos = L.filter(function(a){ return !a.concluido; }), g = APP.grupo(gid), atr = APP.soma(vivos, function(a){ return a.atr; });
        var mes = [].concat.apply([], vivos.map(function(a){ return a.mes; })), parcMes = APP.soma(vivos, function(a){ return a.parcMes ? a.parcMes.v : 0; });
        return { id:gid, nome:g.nome, cor:g.cor, atr:atr, conc:!vivos.length, itens:L, pill:atr ? ['p-r', APP.plural(atr, 'parcela', 'parcelas') + ' em atraso'] : ['p-g', vivos.length ? 'Em dia' : 'Concluídos'],
          sub:APP.plural(vivos.length, 'acordo', 'acordos'), barra:APP.soma(vivos, function(a){ return a.pg; }) / Math.max(1, APP.soma(vivos, function(a){ return a.tot; })) * 100,
          linhas:[['Falta pagar', brl(APP.soma(vivos, function(a){ return a.falta; }))], ['Parcela do mês', parcMes ? brl(parcMes) : '—'], ['A pagar este mês', mes.length ? brl(APP.soma(mes, function(x){ return x.v; })) + ' (' + mes.length + ')' : '—']] };
      }).filter(function(g){ return passaChip(chip, g.atr, g.conc); });
      APP.cartoesGrupo(APP.$('ac-grupos'), { id:'ac', grupos:grupos, det:function(det, g){
        APP.tabela(det, { id:'ac-grupo-' + g.id, titulo:g.nome, linhas:g.itens, unidade:['acordo', 'acordos'], semBarra:true,
          colunas:[{ k:'dev', rot:'Devedor', html:function(a){ return esc(APP.cli(a.cli).nome) + '<span class="b-sub">deve a ' + esc(a.credor) + '</span>'; }, ord:function(a){ return APP.cli(a.cli).nome; } },
            { k:'proc', rot:'Processo', cls:'num', html:function(a){ return esc(a.processo); }, ord:function(a){ return a.processo; } },
            { k:'pg', rot:'Pagas', html:function(a){ return '<div class="prog"><div class="barra"><span style="width:' + (a.pg / a.tot * 100) + '%"></span></div>' + a.pg + ' de ' + a.tot + '</div>'; }, ord:function(a){ return a.pg / a.tot; } },
            { k:'falta', rot:'Falta pagar', cls:'dir val', html:function(a){ return brl(a.falta); }, ord:function(a){ return a.falta; } },
            { k:'mes', rot:'Parcela do mês', cls:'dir', html:function(a){ var p = a.parcMes; return p ? '<b class="val">' + brl(p.v) + '</b><small class="' + (p.pago ? 'ok-txt' : p.venc <= HOJE ? 'pz-r' : 'mudo') + '">' + (p.pago ? '✓ paga' : 'vence ' + APP.fc(p.venc)) + '</small>' : '—'; }, ord:false },
            { k:'sit', rot:'Situação', cls:'cen', html:function(a){ return a.concluido ? '<span class="pill p-g">Concluído</span>' : a.atr ? '<span class="n-atr">' + APP.plural(a.atr, 'parcela', 'parcelas') + ' em atraso</span>' : '<span class="pill p-g">Em dia</span>'; }, ord:function(a){ return a.atr; } }],
          clique:janelaAcordo });
      } });
      APP.tabela(APP.$('ac-tab'), { id:'acordos', linhas:D().acordos, unidade:['parcela', 'parcelas'], dicaBusca:'Devedor, credor ou processo…', tabCls:'t-ac',
        abas:[{ id:'apagar', rot:'A pagar', f:function(x){ return !x.pago; } }, { id:'pago', rot:'Pago', f:function(x){ return !!x.pago; } }], prazos:true, prazosAbas:['apagar'],
        conta:function(n, aba){ return APP.plural(n, 'parcela', 'parcelas') + (aba === 'pago' ? (n === 1 ? ' paga' : ' pagas') : ' a pagar'); }, ordAbas:{ apagar:{ k:'venc', dir:1 }, pago:{ k:'pz', dir:-1 } },
        linhaCls:function(x){ return APP.vencida(x.venc, x.pago); }, busca:function(x){ return APP.cli(x.cli).nome + ' ' + x.credor + ' ' + x.processo; }, venc:function(x){ return x.venc; }, valor:function(x){ return x.v; },
        listas:[{ k:'g', rot:'Grupo', todos:'Todos os grupos', opcoes:D().grupos.map(function(g){ return [g.id, g.nome]; }), get:function(x){ return APP.cli(x.cli).g; } }, { k:'forma', rot:'Forma de pagamento', todos:'Boleto e PIX', opcoes:[['boleto','Boleto'],['pix','PIX']], get:function(x){ return x.forma; } }],
        colunas:[{ k:'g', rot:'Grupo', html:function(x){ return APP.grupoTxt(APP.cli(x.cli).g); }, ord:function(x){ return APP.grupo(APP.cli(x.cli).g).nome; } },
          { k:'proc', rot:'Processo', cls:'num', html:function(x){ return esc(x.processo); }, ord:function(x){ return x.processo; } },
          { k:'dev', rot:'Devedor', html:function(x){ return esc(APP.cli(x.cli).nome); }, ord:function(x){ return APP.cli(x.cli).nome; } },
          { k:'cred', rot:'Credor', html:function(x){ return esc(x.credor); }, ord:function(x){ return x.credor; } },
          { k:'n', rot:'Parcela', cls:'cen dt', html:function(x){ return x.n + ' de ' + x.tot; }, ord:function(x){ return x.n; } },
          { k:'v', rot:'Valor', cls:'dir val', soma:true, html:function(x){ return brl(x.v); }, ord:function(x){ return x.v; } },
          { k:'venc', rot:'Vencimento', cls:'cen dt', html:function(x){ return APP.fd(x.venc); }, ord:function(x){ return +x.venc; } },
          { k:'pz', rot:'Prazo', cls:'cen', html:function(x){ return APP.celPrazo(x.venc, x.pago, !x.pago && x.emitida ? '✓ emitido' : ''); }, ord:function(x){ return x.pago ? +x.pago : +x.venc; } },
          { k:'ac', rot:'', cls:'dir acoes', ord:false, html:function(x){ return x.pago ? '' : '<span class="acs">' + APP.btEmitir('data-emitir-ac="' + x.id + '"', !!x.emitida) + APP.btBaixa('data-baixa-ac="' + x.id + '"') + '</span>'; } }],
        clique:function(x){ janelaAcordo(N.acordos().find(function(a){ return a.id === x.ac; })); }, vazio:{ tit:'Nenhuma parcela aqui', frase:'Troque a escolha ou limpe os filtros.' } });
    } });
  function janelaAcordo(a){
    var c = APP.cli(a.cli);
    var J = APP.janela({ larga:true, kick:'Acordo · processo ' + a.processo, tit:c.nome, sub:'deve a ' + esc(a.credor) + ' · ' + APP.grupoTxt(c.g), dir:a.atr ? '<span class="pill p-r">' + APP.plural(a.atr, 'parcela', 'parcelas') + ' em atraso</span>' : '<span class="pill p-g">' + (a.concluido ? 'Concluído' : 'Em dia') + '</span>',
      corpo:'<div class="ficha"><div><span>Devedor (cliente)</span><b>' + esc(c.nome) + '</b></div><div><span>Credor</span><b>' + esc(a.credor) + '</b></div><div><span>Processo</span><b class="m">' + esc(a.processo) + '</b></div><div><span>Forma de pagamento</span><b>' + (a.forma === 'pix' ? 'PIX' : 'Boleto') + '</b></div></div>'
        + APP.nums([['Parcelas pagas', a.pg + ' de ' + a.tot], ['Já pago', brl(a.pago), 'verde'], ['Falta pagar', brl(a.falta)], ['Parcela do mês', a.parcMes ? brl(a.parcMes.v) : '—'], ['Em atraso', a.atr ? APP.plural(a.atr, 'parcela', 'parcelas') : 'nenhuma', a.atr ? 'vermelho' : '']]) + '<div id="ja-tab"></div>',
      rodape:'<button class="bt bt-o esq" type="button" id="ja-todo">' + ic('lapis') + 'Alterar o acordo inteiro</button><button class="bt bt-o" type="button" data-fechar>Fechar</button>' });
    APP.tabela(J.q('#ja-tab'), { id:'ja-' + a.id, linhas:a.parcelas, unidade:['parcela', 'parcelas'], altura:'320px', contagem:true,
      abas:[{ id:'ab', rot:'A pagar', f:function(x){ return !x.pago; } }, { id:'pg', rot:'Pagas', f:function(x){ return !!x.pago; } }, { id:'todas', rot:'Todas', f:function(){ return true; } }], ord:{ k:'n', dir:1 }, valor:function(x){ return x.v; }, linhaCls:function(x){ return APP.vencida(x.venc, x.pago); },
      colunas:[{ k:'n', rot:'Parcela', cls:'cen dt', html:function(x){ return x.n + ' de ' + x.tot; }, ord:function(x){ return x.n; } }, { k:'v', rot:'Valor', cls:'dir val', soma:true, html:function(x){ return brl(x.v); }, ord:function(x){ return x.v; } },
        { k:'venc', rot:'Vencimento', cls:'cen dt', html:function(x){ return APP.fd(x.venc); }, ord:function(x){ return +x.venc; } }, { k:'pz', rot:'Prazo', cls:'cen', html:function(x){ return APP.celPrazo(x.venc, x.pago, !x.pago && x.emitida ? '✓ emitido' : ''); }, ord:false },
        { k:'ac', rot:'', cls:'dir acoes', ord:false, html:function(x){ return x.pago ? '' : '<span class="acs">' + APP.btEmitir('data-emitir-ac="' + x.id + '"', !!x.emitida) + APP.btBaixa('data-baixa-ac="' + x.id + '"') + '</span>'; } }] });
    J.q('#ja-todo').onclick = function(){ APP.aviso('No ERP: abre "Alterar o acordo inteiro" (todas as parcelas de uma vez).'); };
  }

  /* ═════════ EXECUÇÕES ═════════ */
  APP.registrar('execucoes', { tit:'Execuções', ic:'martelo', pai:'Jurídico',
    ajuda:['Sem os cartões do topo: os totais ficam no rodapé da tabela.', 'Clique na execução para ver os recebimentos e lançar um novo — o honorário (% do recebido) entra sozinho no Financeiro.'],
    desenhar:function(el){
      el.innerHTML = APP.cabecalho({ ic:'martelo', tit:'Execuções', frase:APP.T('exec.frase'), acoes:'<button class="bt bt-p" type="button" id="ex-novo">' + ic('mais') + 'Execução</button>' }) + '<div id="ex-tab"></div>';
      APP.$('ex-novo').onclick = function(){ APP.aviso('No ERP: + Lançar → Execução.'); };
      var rec = function(x){ return APP.soma(x.receb, function(r){ return r.v; }); };
      APP.tabela(APP.$('ex-tab'), { id:'execucoes', linhas:D().execucoes, unidade:['execução', 'execuções'], contagem:true,
        abas:[{ id:'and', rot:'Em andamento', f:function(x){ return x.status === 'Em andamento'; } }, { id:'enc', rot:'Encerradas', f:function(x){ return x.status !== 'Em andamento'; } }, { id:'todas', rot:'Todas', f:function(){ return true; } }],
        busca:function(x){ return APP.cli(x.cli).nome + ' ' + x.executado + ' ' + x.processo; }, valor:function(x){ return x.valor; },
        colunas:[{ k:'cli', rot:'Cliente', html:function(x){ return APP.empresa(APP.cli(x.cli)); }, ord:function(x){ return APP.cli(x.cli).nome; } },
          { k:'exe', rot:'Executado', html:function(x){ return esc(x.executado) + '<span class="b-sub num">' + esc(x.processo) + '</span>'; }, ord:function(x){ return x.executado; } },
          { k:'v', rot:'Valor executado', cls:'dir val', soma:true, html:function(x){ return brl(x.valor); }, ord:function(x){ return x.valor; } },
          { k:'rec', rot:'Já recebido', cls:'dir', html:function(x){ var r = rec(x); return '<span class="val verde">' + brl(r) + '</span><small class="mudo">' + Math.round(r / x.valor * 100) + '% do total</small>'; }, ord:rec },
          { k:'hon', rot:'Honorário (' + '%' + ')', cls:'dir', html:function(x){ return '<span class="val">' + brl(rec(x) * x.pct / 100) + '</span><small class="mudo">' + x.pct + '% do recebido</small>'; }, ord:function(x){ return rec(x) * x.pct; } }],
        clique:janelaExecucao });
    } });
  function janelaExecucao(x){
    var c = APP.cli(x.cli);
    var J = APP.janela({ kick:'Execução · ' + x.processo, tit:x.executado, sub:'Cliente: ' + esc(c.nome),
      corpo:APP.nums([['Valor executado', brl(x.valor)], ['Recebido', brl(APP.soma(x.receb, function(r){ return r.v; })), 'verde'], ['Honorários', brl(APP.soma(x.receb, function(r){ return r.v; }) * x.pct / 100)]])
        + '<div class="bloco"><h3>Recebimentos</h3>' + (x.receb.length ? '<div class="lista">' + x.receb.map(function(r){ return '<div class="li"><span class="li-tx"><b>' + brl(r.v) + '</b><small>' + APP.fd(r.data) + ' · honorário ' + brl(r.v * x.pct / 100) + '</small></span></div>'; }).join('') + '</div>' : '<p class="mudo">Nenhum recebimento ainda.</p>') + '</div>',
      rodape:'<button class="bt bt-o" type="button" data-fechar>Fechar</button><button class="bt bt-p" type="button" id="jx-rec">' + ic('mais') + 'Recebimento</button>' });
    J.q('#jx-rec').onclick = function(){
      var K = APP.janela({ kick:'Novo recebimento', tit:x.executado, corpo:'<div class="dois">' + APP.campo('Valor recebido pelo cliente', '<input class="ctl" id="rc-v" inputmode="decimal" placeholder="R$">') + APP.campo('Data', '<input class="ctl" type="date" id="rc-d" value="' + APP.iso(HOJE) + '">') + '</div><div class="dica">O honorário de ' + x.pct + '% entra sozinho em Financeiro → Jurídico (A receber).</div>',
        rodape:'<button class="bt bt-o" type="button" data-fechar>Cancelar</button><button class="bt bt-p" type="button" id="rc-ok">' + ic('check') + 'Lançar</button>' });
      K.q('#rc-ok').onclick = function(){ var v = APP.num(K.q('#rc-v').value); if (!v) return K.q('#rc-v').focus(); var d = APP.deIso(K.q('#rc-d').value) || HOJE; K.fechar(); J.fechar();
        APP.acao('Recebimento lançado; honorário de ' + brl(v * x.pct / 100) + ' foi para o Financeiro.', function(){ var r = { data:d, v:v }, l = { id:'l' + Date.now(), empresa:'jur', tipo:'receita', cli:x.cli, desc:'Honorários de êxito — execução ' + x.executado, servico:'Execução', v:v * x.pct / 100, venc:new Date(+d + 10 * DIA), quem:'pedro', pago:null };
          x.receb.push(r); D().lanc.push(l); return function(){ x.receb.splice(x.receb.indexOf(r), 1); D().lanc.splice(D().lanc.indexOf(l), 1); }; }); };
    };
  }

  /* ═════════ PUBLICAÇÕES ═════════ */
  // Backup 77: voltou a ser como antes do Backup 72 (a pedido): uma publicação por cartão, com o texto à vista,
  // filtros em botões com contagem (situação, advogado, tribunal) e as ações no próprio cartão.
  APP.registrar('publicacoes', { tit:'Publicações', ic:'jornal', pai:'Jurídico',
    ajuda:['Novas primeiro. "Marcar lida" tira da lista de novas; "Criar tarefa" já sugere o prazo.', 'A busca no Diário roda sozinha 1 vez por dia.'],
    desenhar:function(el){
      var F = APP.pref('pubF') || { st:'nova', trib:'', adv:'', q:'' };
      function salvar(){ APP.pref('pubF', F); }
      el.innerHTML = APP.cabecalho({ ic:'jornal', tit:'Publicações', frase:APP.T('pub.frase'), acoes:'<button class="bt bt-o" type="button" id="pb-todas">' + ic('check') + 'Marcar todas como lidas</button>' })
        + '<div class="pub-filtros"><div class="seg" id="pb-st" role="group" aria-label="Situação"></div><span class="ctl-busca">' + ic('busca') + '<input id="pb-q" placeholder="Buscar no texto ou no processo" autocomplete="off"></span></div>'
        + '<div class="pub-filtros"><div class="seg" id="pb-adv" role="group" aria-label="Advogado"></div><div class="seg" id="pb-trib" role="group" aria-label="Tribunal"></div></div>'
        + '<div id="pb-lista" class="pub-lista"></div>';
      APP.$('pb-q').value = F.q || '';
      APP.$('pb-todas').onclick = function(){ var L = D().publicacoes.filter(function(p){ return !p.lida; }); APP.acao(APP.plural(L.length, 'publicação marcada', 'publicações marcadas') + ' como lida(s).', function(){ L.forEach(function(p){ p.lida = true; }); return function(){ L.forEach(function(p){ p.lida = false; }); }; }); };
      function pintar(){
        var todas = D().publicacoes, q = APP.norm ? APP.norm(F.q || '') : String(F.q || '').toLowerCase();
        var okSt = function(p){ return F.st === 'todas' || (F.st === 'nova' ? !p.lida : p.lida); }, okAdv = function(p){ return !F.adv || p.adv === F.adv; },
          okTrib = function(p){ return !F.trib || p.tribunal === F.trib; }, okQ = function(p){ var t = (p.processo + ' ' + p.txt).toLowerCase(); return !q || t.indexOf(q) >= 0; };
        function seg(id, ops, atual, conta){ APP.$(id).innerHTML = ops.map(function(o){ return '<button type="button" class="seg-bt" data-v="' + o[0] + '" aria-selected="' + (atual === o[0]) + '">' + esc(o[1]) + ' <span class="seg-n">' + conta(o[0]) + '</span></button>'; }).join(''); }
        seg('pb-st', [['nova', 'Novas'], ['lida', 'Lidas'], ['todas', 'Todas']], F.st, function(v){ return todas.filter(function(p){ return okAdv(p) && okTrib(p) && okQ(p) && (v === 'todas' || (v === 'nova' ? !p.lida : p.lida)); }).length; });
        var advs = [''].concat(D().equipe.map(function(x){ return x.id; }).filter(function(id){ return todas.some(function(p){ return p.adv === id; }); }));
        seg('pb-adv', advs.map(function(id){ return [id, id ? APP.pessoa(id).curto : 'Todos os advogados']; }), F.adv, function(v){ return todas.filter(function(p){ return okSt(p) && okTrib(p) && okQ(p) && (!v || p.adv === v); }).length; });
        var tribs = [''].concat(['TJMG', 'TRT3', 'TRF1'].filter(function(t){ return todas.some(function(p){ return p.tribunal === t; }); }));
        seg('pb-trib', tribs.map(function(t){ return [t, t || 'Todos os tribunais']; }), F.trib, function(v){ return todas.filter(function(p){ return okSt(p) && okAdv(p) && okQ(p) && (!v || p.tribunal === v); }).length; });
        var lista = todas.filter(function(p){ return okSt(p) && okAdv(p) && okTrib(p) && okQ(p); }).sort(function(a, b){ return b.data - a.data; });
        APP.$('pb-lista').innerHTML = lista.length ? lista.map(function(p){
          return '<article class="pub-card' + (p.lida ? '' : ' pub-nova') + '"><div class="pub-topo"><div><span class="pill ' + (p.lida ? 'p-n' : 'p-a') + '">' + (p.lida ? 'lida' : 'nova') + '</span> <b>' + esc(/^[^:]{2,30}:/.test(p.txt) ? p.txt.split(':')[0] : 'Comunicação') + '</b> · ' + esc(p.tribunal) + ' · <span class="num">' + APP.fd(p.data) + '</span></div>'
            + '<div class="pub-proc"><span class="num">' + esc(p.processo) + '</span><small>' + esc(APP.pessoa(p.adv).nome || APP.pessoa(p.adv).curto) + '</small></div></div>'
            + '<div class="pub-texto">' + esc(p.txt) + '</div>'
            + '<div class="pub-acoes"><button class="bt bt-p bt-mini" type="button" data-pub-tarefa="' + p.id + '">' + ic('mais') + 'Criar tarefa (5 dias úteis)</button>'
            + (p.lida ? '<button class="bt bt-o bt-mini" type="button" data-pub-nova="' + p.id + '">Voltar para novas</button>' : '<button class="bt bt-o bt-mini" type="button" data-pub-lida="' + p.id + '">Marcar lida</button>') + '</div></article>'; }).join('')
          : '<div class="quadro"><div class="vazio"><div class="vazio-ic">' + ic('ok') + '</div><b>Nenhuma publicação neste recorte</b><p>Troque o filtro ou a busca.</p></div></div>';
      }
      pintar();
      var t; APP.$('pb-q').oninput = function(e){ clearTimeout(t); t = setTimeout(function(){ F.q = e.target.value; salvar(); pintar(); }, 200); };
      el.onclick = function(e){
        var b = e.target.closest('#pb-st [data-v]'); if (b){ F.st = b.dataset.v; salvar(); pintar(); return; }
        b = e.target.closest('#pb-adv [data-v]'); if (b){ F.adv = b.dataset.v; salvar(); pintar(); return; }
        b = e.target.closest('#pb-trib [data-v]'); if (b){ F.trib = b.dataset.v; salvar(); pintar(); return; }
        var l = e.target.closest('[data-pub-lida]'); if (l){ var p = D().publicacoes.find(function(x){ return x.id === l.dataset.pubLida; }); APP.acao('Publicação lida.', function(){ p.lida = true; return function(){ p.lida = false; }; }); return; }
        var n = e.target.closest('[data-pub-nova]'); if (n){ var p2 = D().publicacoes.find(function(x){ return x.id === n.dataset.pubNova; }); APP.acao('Voltou para novas.', function(){ p2.lida = false; return function(){ p2.lida = true; }; }); return; }
        var tt = e.target.closest('[data-pub-tarefa]'); if (tt){ var q = D().publicacoes.find(function(x){ return x.id === tt.dataset.pubTarefa; }); APP.formTarefa(null); setTimeout(function(){ var i = document.getElementById('tf-tit'); if (i) i.value = 'Publicação ' + q.tribunal + ' — ' + q.txt.slice(0, 60); }, 40); }
      };
    } });
})();
