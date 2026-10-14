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
      // Backup 79: escolhe o GRUPO (o cliente entra pelo grupo) e o que esse grupo vê no portal (fica guardado por grupo)
      var gid = APP.pref('portal-grupo') || (APP.pref('portal-cli') ? APP.cli(APP.pref('portal-cli')).g : D().grupos[0].id), g = APP.grupo(gid);
      var vis = (APP.pref('portal-vis') || {})[gid] || ABAS.map(function(a){ return a[0]; });
      var aba = APP.pref('portal-aba') || 'resumo'; if (aba !== 'resumo' && vis.indexOf(aba) < 0) aba = 'resumo';
      var emp = D().clientes.filter(function(x){ return x.g === gid; }), ids = emp.map(function(x){ return x.id; });
      el.innerHTML = '<div class="dica dica-portal">' + ic('olho') + '<span>Prévia do portal. Grupo: </span><select class="ctl" id="pt-grupo">' + D().grupos.map(function(x){ return '<option value="' + x.id + '"' + (x.id === gid ? ' selected' : '') + '>' + esc(x.nome) + '</option>'; }).join('') + '</select>'
        + '<span class="pt-vis-rot">O que este grupo vê:</span><span class="chips chips-esq" id="pt-vis">' + ABAS.slice(1).map(function(a){ return '<button type="button" class="chip" data-vis="' + a[0] + '" aria-pressed="' + (vis.indexOf(a[0]) >= 0) + '">' + a[1] + '</button>'; }).join('') + '</span></div>'
        + '<div class="portal"><div class="pt-topo"><div><b>Araújo &amp; Castro</b><small>Portal do cliente</small></div><div class="pt-eu"><b>' + esc(g.nome) + '</b><small>' + APP.plural(emp.length, 'empresa', 'empresas') + '</small></div><button class="bt bt-o bt-mini" type="button" id="pt-zap">' + ic('enviar') + 'Falar com o escritório</button></div>'
        + '<div class="seg seg-grande" id="pt-abas">' + ABAS.filter(function(a){ return a[0] === 'resumo' || vis.indexOf(a[0]) >= 0; }).map(function(a){ return '<button type="button" class="seg-bt" data-pt="' + a[0] + '" aria-selected="' + (a[0] === aba) + '">' + a[1] + '</button>'; }).join('') + '</div><div id="pt-corpo" class="pt-corpo"></div></div>';
      APP.$('pt-grupo').onchange = function(){ APP.pref('portal-grupo', this.value); APP.pref('portal-aba', 'resumo'); APP.redesenhar(); };
      APP.$('pt-vis').onclick = function(e){ var b = e.target.closest('[data-vis]'); if (!b) return; var V = APP.pref('portal-vis') || {}, L = (V[gid] || ABAS.map(function(a){ return a[0]; })).slice(), i = L.indexOf(b.dataset.vis);
        if (i >= 0) L.splice(i, 1); else L.push(b.dataset.vis); V[gid] = L; APP.pref('portal-vis', V); APP.redesenhar(); };
      APP.$('pt-abas').onclick = function(e){ var b = e.target.closest('[data-pt]'); if (b){ APP.pref('portal-aba', b.dataset.pt); APP.redesenhar(); } };
      APP.$('pt-zap').onclick = function(){ APP.aviso('Abre o WhatsApp do escritório com "Olá, sou do ' + g.nome + '…".'); };
      pintar(APP.$('pt-corpo'), aba, ids, vis);
    } });

  function baixar(o){ return '<button class="bt-emitir" type="button" data-baixar="' + esc(o) + '">' + ic('importar') + 'Baixar</button>'; }
  // Backup 78: um cartão por parcelamento / acordo / execução — clicou, abre logo abaixo (como na tela do escritório)
  function pillAtr(atr, conc){ return conc ? ['p-g', 'Concluído'] : atr ? ['p-r', APP.plural(atr, 'parcela', 'parcelas') + ' em atraso'] : ['p-g', 'Em dia']; }
  function tabParcelas(det, id, L, guia){
    APP.tabela(det, { id:id, linhas:L, unidade:['parcela', 'parcelas'], contagem:true, altura:'360px', abaPadrao:'ab', ord:{ k:'n', dir:1 },
      abas:[{ id:'ab', rot:'A pagar', f:function(x){ return !x.pago; } }, { id:'pg', rot:'Pagas', f:function(x){ return !!x.pago; } }, { id:'todas', rot:'Todas', f:function(){ return true; } }],
      valor:function(x){ return x.v; }, linhaCls:function(x){ return APP.vencida(x.venc, x.pago); },
      colunas:[{ k:'n', rot:'Parcela', cls:'cen', html:function(x){ return x.n + ' de ' + x.tot; }, ord:function(x){ return x.n; } }, { k:'v', rot:'Valor', cls:'dir val', soma:true, html:function(x){ return brl(x.v); }, ord:function(x){ return x.v; } },
        { k:'venc', rot:'Vencimento', cls:'cen dt', html:function(x){ return APP.fd(x.venc); }, ord:function(x){ return +x.venc; } }, { k:'pz', rot:'Prazo', cls:'cen', html:function(x){ return APP.celPrazo(x.venc, x.pago); }, ord:false },
        { k:'g', rot:guia, cls:'dir', ord:false, html:function(x){ return x.pago ? '' : x.cliEmite ? '<span class="mudo">você emite</span>' : x.emitida ? baixar('guia') : '<span class="mudo">em preparo</span>'; } }] });
  }
  function pintar(el, aba, ids, vis){
    var meu = function(x){ return ids.indexOf(x.cli) >= 0; };
    var PA = D().parcelamentos.filter(meu), A = N.acordos().filter(meu), L = D().lanc.filter(function(l){ return meu(l) && l.tipo === 'receita' && !l.redutor && !l.perda; });
    if (aba === 'resumo'){
      // Início = só uma introdução: boas-vindas, uma linha de situação e por onde começar
      var atr = D().parcelas.filter(function(x){ return meu(N.pa(x.pa)) && !x.pago && x.venc <= HOJE; }).length + D().acordos.filter(function(x){ return meu(x) && !x.pago && x.venc <= HOJE; }).length;
      var ir = function(a, rot, txt){ return '<button type="button" class="pt-tile" data-pt-ir="' + a + '"><b>' + esc(rot) + '</b><span>' + esc(txt) + '</span></button>'; };
      el.innerHTML = '<div class="pt-intro"><h2>Bem-vindo ao seu portal</h2><p>Aqui você acompanha, a qualquer hora, tudo o que o escritório cuida para as suas empresas. É só para consultar: nada do que você clicar muda os seus dados.</p></div>'
        + '<div class="pt-sit ' + (atr ? 'atr' : 'ok') + '">' + ic(atr ? 'alerta' : 'ok') + '<span>' + (atr ? APP.plural(atr, 'parcela em atraso', 'parcelas em atraso') + '. Fale com o escritório.' : 'Tudo em dia: nenhuma parcela em atraso.') + '</span></div>'
        + '<div class="pt-tiles">' + [['parc', 'Parcelamentos', 'Cada parcelamento, o que vence e as guias'], ['acordos', 'Acordos', 'Os acordos com terceiros e as parcelas'], ['exec', 'Execuções', 'Cobranças na Justiça e o que já entrou'],
          ['contratos', 'Contratos', 'Os contratos com o escritório'], ['fin', 'Financeiro', 'Honorários do jurídico e da contabilidade'], ['docs', 'Documentos', 'Guias, recibos e arquivos para baixar']].filter(function(t){ return !vis || vis.indexOf(t[0]) >= 0; }).map(function(t){ return ir(t[0], t[1], t[2]); }).join('') + '</div>';
    } else if (aba === 'parc'){
      el.innerHTML = '<div class="cartoes" id="pt-pa"></div>';
      APP.cartoesGrupo(el.firstChild, { id:'pt-pa', vazio:'Nenhum parcelamento', grupos:PA.map(function(pa){ var r = N.resumo(pa), c = APP.cli(pa.cli), mes = r.mes;
        return { id:pa.id, nome:pa.nat, pill:pillAtr(r.atr, r.concluido), sub:esc(pa.plat) + ' · nº ' + esc(pa.num) + ' · ' + esc(APP.curto(c)), barra:r.pg / pa.tot * 100, prog:r.pg + ' de ' + pa.tot + ' pagas', pa:pa,
          linhas:[['Falta pagar', brl(r.falta)], ['A pagar este mês', mes.length ? brl(APP.soma(mes, function(x){ return x.v; })) + ' (' + mes.length + ')' : '—']] }; }),
        det:function(det, g){ tabParcelas(det, 'pt-pa-' + g.id, N.parcelasDe(g.pa).map(function(x){ return Object.assign({ tot:g.pa.tot, cliEmite:g.pa.cliEmite }, x); }), 'Guia'); } });
    } else if (aba === 'acordos'){
      el.innerHTML = '<div class="cartoes" id="pt-ac"></div>';
      APP.cartoesGrupo(el.firstChild, { id:'pt-ac', vazio:'Nenhum acordo', grupos:A.map(function(a){
        return { id:a.id, nome:'Acordo com ' + a.credor, pill:pillAtr(a.atr, a.concluido), sub:'processo ' + esc(a.processo) + ' · ' + esc(APP.curto(APP.cli(a.cli))), barra:a.pg / a.tot * 100, prog:a.pg + ' de ' + a.tot + ' pagas', ac:a,
          linhas:[['Falta pagar', brl(a.falta)], ['Forma de pagamento', a.forma === 'pix' ? 'PIX' : 'Boleto']] }; }),
        det:function(det, g){ tabParcelas(det, 'pt-ac-' + g.id, g.ac.parcelas, g.ac.forma === 'pix' ? 'PIX' : 'Boleto'); } });
    } else if (aba === 'exec'){
      var X = D().execucoes.filter(meu);
      el.innerHTML = '<div class="cartoes" id="pt-ex"></div>';
      APP.cartoesGrupo(el.firstChild, { id:'pt-ex', vazio:'Nenhuma execução', grupos:X.map(function(x){ var r = APP.soma(x.receb, function(y){ return y.v; });
        return { id:x.id, nome:x.executado, pill:x.status === 'Em andamento' ? ['p-b', 'Em andamento'] : ['p-g', x.status], sub:'processo ' + esc(x.processo), barra:r / x.valor * 100, prog:Math.round(r / x.valor * 100) + '% já recebido', ex:x,
          linhas:[['Valor cobrado', brl(x.valor)], ['Já recebido', '<span class="verde">' + brl(r) + '</span>']] }; }),
        det:function(det, g){ var R = g.ex.receb.slice().sort(function(a, b){ return b.data - a.data; });
          det.innerHTML = '<div class="quadro"><div class="quadro-hd"><h2>Recebimentos</h2><span class="resumo">' + APP.plural(R.length, 'recebimento', 'recebimentos') + '</span></div>'
            + (R.length ? '<table class="tab" style="min-width:0"><thead><tr><th>Data</th><th class="dir">Valor recebido</th></tr></thead><tbody>' + R.map(function(r){ return '<tr><td class="dt" data-rot="Data">' + APP.fd(r.data) + '</td><td class="dir val" data-rot="Valor recebido">' + brl(r.v) + '</td></tr>'; }).join('') + '</tbody></table>'
              : '<div class="vazio"><b>Nada recebido ainda</b><p>Assim que entrar algum valor, ele aparece aqui.</p></div>') + '</div>'; } });
    } else if (aba === 'contratos'){
      var C = D().contratos.filter(meu);
      el.innerHTML = C.length ? '<div class="lista">' + C.map(function(ct){ return '<div class="li"><span class="li-tx"><b>' + esc(ct.desc) + '</b><small>' + esc(ct.tipo) + ' · desde ' + APP.fd(ct.inicio) + (ct.reajuste ? ' · reajuste em ' + APP.fd(ct.reajuste) : '') + '</small></span><span class="pill ' + (ct.status === 'Ativo' ? 'p-g' : 'p-a') + '">' + esc(ct.status) + '</span>' + baixar('contrato') + '</div>'; }).join('') + '</div>' : '<div class="quadro"><div class="vazio"><b>Nenhum contrato</b></div></div>';
    } else if (aba === 'fin'){
      // Backup 78: Jurídico (advocacia) e Contabilidade separados
      var emp = APP.pref('pt-fin-emp') || 'jur';
      el.innerHTML = '<div class="seg" id="pt-fin-emp"><button type="button" class="seg-bt" data-emp="jur" aria-selected="' + (emp === 'jur') + '">Jurídico (advocacia)</button><button type="button" class="seg-bt" data-emp="contab" aria-selected="' + (emp === 'contab') + '">Contabilidade</button></div><div></div>';
      el.querySelector('#pt-fin-emp').onclick = function(e){ var b = e.target.closest('[data-emp]'); if (b){ APP.pref('pt-fin-emp', b.dataset.emp); APP.redesenhar(); } };
      L = L.filter(function(l){ return l.empresa === emp; });
      APP.tabela(el.lastChild, { id:'pt-fin-' + emp, linhas:L, unidade:['honorário', 'honorários'], abas:[{ id:'ab', rot:'A pagar', f:function(l){ return !l.pago; } }, { id:'pg', rot:'Pagos', f:function(l){ return !!l.pago; } }], venc:function(l){ return l.venc; }, valor:function(l){ return l.v; }, ord:{ k:'venc', dir:1 }, linhaCls:function(l){ return l.pago ? '' : APP.vencida(l.venc); },
        colunas:[{ k:'d', rot:'Descrição', html:function(l){ return esc(l.desc); } }, { k:'v', rot:'Valor', cls:'dir val', soma:true, html:function(l){ return brl(l.v); } },
          { k:'venc', rot:'Vencimento', cls:'cen dt', html:function(l){ return APP.fd(l.venc); }, ord:function(l){ return +l.venc; } }, { k:'pz', rot:'Situação', cls:'cen', html:function(l){ return APP.celPrazo(l.venc, l.pago); }, ord:false }, { k:'r', rot:'', cls:'dir', ord:false, html:function(l){ return l.pago ? baixar('recibo') : ''; } }] });
    } else {
      var Ds = D().docs.filter(meu);
      el.innerHTML = Ds.length ? '<div class="lista">' + Ds.map(function(d){ return '<div class="li"><span class="li-tipo t-tarefa">' + esc(d.tipo) + '</span><span class="li-tx"><b>' + esc(d.nome) + '</b><small>' + APP.fd(d.em) + (d.validade ? ' · vale até ' + APP.fd(d.validade) : '') + '</small></span>' + baixar('doc') + '</div>'; }).join('') + '</div>' : '<div class="quadro"><div class="vazio"><b>Nenhum documento</b></div></div>';
    }
    el.onclick = function(e){ var b = e.target.closest('[data-baixar]'); if (b){ e.stopPropagation(); APP.aviso('O cliente baixa o PDF (' + b.dataset.baixar + ').'); return; }
      var t = e.target.closest('[data-pt-ir]'); if (t){ APP.pref('portal-aba', t.dataset.ptIr); APP.redesenhar(); } };
  }
})();
