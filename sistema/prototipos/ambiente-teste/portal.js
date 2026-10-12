/* Portal do cliente (novo, simples): o que o CLIENTE vê ao entrar — só o dele (o grupo dele):
   o que pagar este mês, parcelamentos, acordos, execuções, contratos, financeiro (honorários) e documentos. Só leitura;
   guias e recibos para baixar; botão de WhatsApp do escritório. Substitui as telas antigas do ERP que o cliente usava. */
(function(){
  var APP = window.APP, N = APP.N, ic = APP.ic, esc = APP.esc, brl = APP.brl, HOJE = DADOS.HOJE, DIA = DADOS.DIA;
  var D = function(){ return APP.D; };
  var ABAS = [['resumo','Início'],['parc','Parcelamentos'],['acordos','Acordos'],['exec','Execuções'],['contratos','Contratos'],['fin','Financeiro'],['docs','Documentos']];

  APP.registrar('portal', { tit:'Portal do cliente', ic:'portal', pai:'Ambiente de teste',
    ajuda:['É assim que o <b>cliente</b> vê o sistema quando entra com o login dele: só as empresas do grupo dele, sem nada do escritório.', 'Troque o cliente no alto para ver outro.', 'Ele baixa guias e recibos e fala com o escritório pelo WhatsApp. Não muda nada.'],
    desenhar:function(el){
      var cid = APP.pref('portal-cli') || 'c3', c = APP.cli(cid), g = APP.grupo(c.g), aba = APP.pref('portal-aba') || 'resumo';
      var emp = D().clientes.filter(function(x){ return x.g === c.g; }), ids = emp.map(function(x){ return x.id; });
      el.innerHTML = '<div class="dica dica-portal">' + ic('olho') + '<span>Prévia: assim o cliente vê o portal. Cliente: </span><select class="ctl" id="pt-cli">' + D().clientes.map(function(x){ return '<option value="' + x.id + '"' + (x.id === cid ? ' selected' : '') + '>' + esc(x.nome) + '</option>'; }).join('') + '</select></div>'
        + '<div class="portal"><div class="pt-topo"><div><b>Araújo &amp; Castro</b><small>Portal do cliente</small></div><div class="pt-eu"><b>' + esc(g.nome) + '</b><small>' + APP.plural(emp.length, 'empresa', 'empresas') + '</small></div><button class="bt bt-o bt-mini" type="button" id="pt-zap">' + ic('enviar') + 'Falar com o escritório</button></div>'
        + '<div class="seg seg-grande" id="pt-abas">' + ABAS.map(function(a){ return '<button type="button" class="seg-bt" data-pt="' + a[0] + '" aria-selected="' + (a[0] === aba) + '">' + a[1] + '</button>'; }).join('') + '</div><div id="pt-corpo" class="pt-corpo"></div></div>';
      APP.$('pt-cli').onchange = function(){ APP.pref('portal-cli', this.value); APP.redesenhar(); };
      APP.$('pt-abas').onclick = function(e){ var b = e.target.closest('[data-pt]'); if (b){ APP.pref('portal-aba', b.dataset.pt); APP.redesenhar(); } };
      APP.$('pt-zap').onclick = function(){ APP.aviso('Abre o WhatsApp do escritório com "Olá, sou do ' + g.nome + '…".'); };
      pintar(APP.$('pt-corpo'), aba, ids);
    } });

  function baixar(o){ return '<button class="bt-emitir" type="button" data-baixar="' + esc(o) + '">' + ic('importar') + 'Baixar</button>'; }
  function pintar(el, aba, ids){
    var meu = function(x){ return ids.indexOf(x.cli) >= 0; };
    var P = D().parcelas.filter(function(x){ return meu(N.pa(x.pa)); }), A = D().acordos.filter(meu), L = D().lanc.filter(function(l){ return meu(l) && l.tipo === 'receita' && !l.redutor && !l.perda; });
    if (aba === 'resumo'){
      var aPagar = P.filter(function(x){ return !x.pago && (x.venc <= HOJE || APP.doMes(x.venc)); }).map(function(x){ var pa = N.pa(x.pa); return { o:'Parcelamento ' + pa.nat + ' (' + pa.plat + ')', n:x.n + '/' + pa.tot, v:x.v, venc:x.venc, guia:!!x.emitida || pa.cliEmite, cli:pa.cli }; })
        .concat(A.filter(function(x){ return !x.pago && (x.venc <= HOJE || APP.doMes(x.venc)); }).map(function(x){ return { o:'Acordo com ' + x.credor, n:x.n + '/' + x.tot, v:x.v, venc:x.venc, guia:!!x.emitida, cli:x.cli }; }))
        .concat(L.filter(function(l){ return !l.pago && (l.venc <= HOJE || APP.doMes(l.venc)); }).map(function(l){ return { o:'Honorários — ' + l.desc, n:'', v:l.v, venc:l.venc, guia:true, cli:l.cli }; }))
        .sort(function(a, b){ return a.venc - b.venc; });
      el.innerHTML = '<div class="sec-cab"><div><h2>Para pagar este mês</h2><p>Inclui o que já venceu.</p></div></div>'
        + (aPagar.length ? '<div class="quadro"><table class="tab" style="min-width:0"><thead><tr><th>O quê</th><th>Empresa</th><th class="cen">Parcela</th><th class="dir">Valor</th><th class="cen">Vencimento</th><th class="cen">Prazo</th><th></th></tr></thead><tbody>'
          + aPagar.map(function(x){ return '<tr class="' + APP.vencida(x.venc, null) + '"><td>' + esc(x.o) + '</td><td>' + esc(APP.curto(APP.cli(x.cli))) + '</td><td class="cen">' + x.n + '</td><td class="dir val">' + brl(x.v) + '</td><td class="cen dt">' + APP.fd(x.venc) + '</td><td class="cen">' + APP.celPrazo(x.venc, null) + '</td><td class="dir">' + (x.guia ? baixar('guia') : '<span class="mudo">guia em preparo</span>') + '</td></tr>'; }).join('')
          + '</tbody><tfoot><tr><td colspan="3">Total</td><td class="dir val">' + brl(APP.soma(aPagar, function(x){ return x.v; })) + '</td><td colspan="3"></td></tr></tfoot></table></div>' : '<div class="quadro"><div class="vazio"><div class="vazio-ic">' + ic('ok') + '</div><b>Nada para pagar este mês</b><p>Tudo em dia.</p></div></div>');
    } else if (aba === 'parc'){
      el.innerHTML = '<div id="ptx"></div>';
      APP.tabela(el.firstChild, { id:'pt-parc', linhas:P, unidade:['parcela', 'parcelas'], abas:[{ id:'apagar', rot:'A pagar', f:function(x){ return !x.pago; } }, { id:'pago', rot:'Pagas', f:function(x){ return !!x.pago; } }], prazos:true, prazosAbas:['apagar'], venc:function(x){ return x.venc; }, valor:function(x){ return x.v; }, ord:{ k:'venc', dir:1 }, linhaCls:function(x){ return APP.vencida(x.venc, x.pago); },
        colunas:[{ k:'emp', rot:'Empresa', html:function(x){ return esc(APP.curto(N.cliDe(x))); } }, { k:'pa', rot:'Parcelamento', html:function(x){ var pa = N.pa(x.pa); return esc(pa.nat) + '<span class="b-sub">' + esc(pa.plat) + ' · nº ' + esc(pa.num) + '</span>'; } },
          { k:'n', rot:'Parcela', cls:'cen', html:function(x){ return x.n + ' de ' + N.pa(x.pa).tot; }, ord:function(x){ return x.n; } }, { k:'v', rot:'Valor', cls:'dir val', soma:true, html:function(x){ return brl(x.v); } },
          { k:'venc', rot:'Vencimento', cls:'cen dt', html:function(x){ return APP.fd(x.venc); }, ord:function(x){ return +x.venc; } }, { k:'pz', rot:'Prazo', cls:'cen', html:function(x){ return APP.celPrazo(x.venc, x.pago); }, ord:false },
          { k:'g', rot:'Guia', cls:'dir', ord:false, html:function(x){ return x.pago ? '' : x.emitida ? baixar('guia') : '<span class="mudo">em preparo</span>'; } }] });
    } else if (aba === 'acordos'){
      el.innerHTML = '<div></div>';
      APP.tabela(el.firstChild, { id:'pt-ac', linhas:A, unidade:['parcela', 'parcelas'], abas:[{ id:'apagar', rot:'A pagar', f:function(x){ return !x.pago; } }, { id:'pago', rot:'Pagas', f:function(x){ return !!x.pago; } }], venc:function(x){ return x.venc; }, valor:function(x){ return x.v; }, ord:{ k:'venc', dir:1 }, linhaCls:function(x){ return APP.vencida(x.venc, x.pago); },
        vazio:{ tit:'Nenhum acordo', frase:'' },
        colunas:[{ k:'c', rot:'Credor', html:function(x){ return esc(x.credor) + '<span class="b-sub num">' + esc(x.processo) + '</span>'; } }, { k:'n', rot:'Parcela', cls:'cen', html:function(x){ return x.n + ' de ' + x.tot; } }, { k:'v', rot:'Valor', cls:'dir val', soma:true, html:function(x){ return brl(x.v); } },
          { k:'venc', rot:'Vencimento', cls:'cen dt', html:function(x){ return APP.fd(x.venc); }, ord:function(x){ return +x.venc; } }, { k:'pz', rot:'Prazo', cls:'cen', html:function(x){ return APP.celPrazo(x.venc, x.pago); }, ord:false }, { k:'g', rot:'Boleto/PIX', cls:'dir', ord:false, html:function(x){ return x.pago ? '' : x.emitida ? baixar('boleto') : '<span class="mudo">em preparo</span>'; } }] });
    } else if (aba === 'exec'){
      var X = D().execucoes.filter(meu);
      el.innerHTML = X.length ? '<div class="lista">' + X.map(function(x){ var r = APP.soma(x.receb, function(y){ return y.v; }); return '<div class="li"><span class="li-tx"><b>' + esc(x.executado) + '</b><small class="num">' + esc(x.processo) + '</small><small>Cobrado: ' + brl(x.valor) + ' · já recebido: <b class="verde">' + brl(r) + '</b> (' + Math.round(r / x.valor * 100) + '%)</small></span><span class="pill ' + (x.status === 'Em andamento' ? 'p-b' : 'p-g') + '">' + esc(x.status) + '</span></div>'; }).join('') + '</div>' : '<div class="quadro"><div class="vazio"><b>Nenhuma execução</b></div></div>';
    } else if (aba === 'contratos'){
      var C = D().contratos.filter(meu);
      el.innerHTML = C.length ? '<div class="lista">' + C.map(function(ct){ return '<div class="li"><span class="li-tx"><b>' + esc(ct.desc) + '</b><small>' + esc(ct.tipo) + ' · desde ' + APP.fd(ct.inicio) + (ct.reajuste ? ' · reajuste em ' + APP.fd(ct.reajuste) : '') + '</small></span><span class="pill ' + (ct.status === 'Ativo' ? 'p-g' : 'p-a') + '">' + esc(ct.status) + '</span>' + baixar('contrato') + '</div>'; }).join('') + '</div>' : '<div class="quadro"><div class="vazio"><b>Nenhum contrato</b></div></div>';
    } else if (aba === 'fin'){
      el.innerHTML = '<div></div>';
      APP.tabela(el.firstChild, { id:'pt-fin', linhas:L, unidade:['honorário', 'honorários'], abas:[{ id:'ab', rot:'A pagar', f:function(l){ return !l.pago; } }, { id:'pg', rot:'Pagos', f:function(l){ return !!l.pago; } }], venc:function(l){ return l.venc; }, valor:function(l){ return l.v; }, ord:{ k:'venc', dir:1 }, linhaCls:function(l){ return l.pago ? '' : APP.vencida(l.venc); },
        colunas:[{ k:'d', rot:'Descrição', html:function(l){ return esc(l.desc) + '<span class="b-sub">' + (l.empresa === 'jur' ? 'Advocacia' : 'Contabilidade') + '</span>'; } }, { k:'v', rot:'Valor', cls:'dir val', soma:true, html:function(l){ return brl(l.v); } },
          { k:'venc', rot:'Vencimento', cls:'cen dt', html:function(l){ return APP.fd(l.venc); }, ord:function(l){ return +l.venc; } }, { k:'pz', rot:'Situação', cls:'cen', html:function(l){ return APP.celPrazo(l.venc, l.pago); }, ord:false }, { k:'r', rot:'', cls:'dir', ord:false, html:function(l){ return l.pago ? baixar('recibo') : ''; } }] });
    } else {
      var Ds = D().docs.filter(meu);
      el.innerHTML = Ds.length ? '<div class="lista">' + Ds.map(function(d){ return '<div class="li"><span class="li-tipo t-tarefa">' + esc(d.tipo) + '</span><span class="li-tx"><b>' + esc(d.nome) + '</b><small>' + APP.fd(d.em) + (d.validade ? ' · vale até ' + APP.fd(d.validade) : '') + '</small></span>' + baixar('doc') + '</div>'; }).join('') + '</div>' : '<div class="quadro"><div class="vazio"><b>Nenhum documento</b></div></div>';
    }
    el.onclick = function(e){ var b = e.target.closest('[data-baixar]'); if (b) APP.aviso('O cliente baixa o PDF (' + b.dataset.baixar + ').'); };
  }
})();
