/* Tela Rotina (o trabalho do mês) — o "miolo" que estava no visual antigo, agora com as peças novas:
   Passivo (planilha editável), Processos (conferir), Guias do mês (anexar e mandar), Planilha (emissão/pagamento por parcelamento) e Minhas tarefas. */
(function(){
  var APP = window.APP, N = APP.N, ic = APP.ic, esc = APP.esc, brl = APP.brl, HOJE = DADOS.HOJE, DIA = DADOS.DIA;
  var D = function(){ return APP.D; };
  var ABAS = [['passivo','Passivo'],['processos','Processos'],['guias','Guias do mês'],['planilha','Planilha'],['tarefas','Minhas tarefas']];
  var alterados = {};

  APP.registrar('rotina', { tit:'Rotina', ic:'rotina',
    ajuda:['O <b>placar</b> do mês virou uma linha só: clique em cada item para ir à aba.', '<b>Guias do mês</b>: uma linha por empresa; "Emitir e mandar" abre a janela de anexar o PDF (o sistema lê valor e vencimento) e salva no rascunho do Gmail.', '<b>Planilha</b>: clique em Emissão ou Pagamento para marcar (pagamento sempre pede confirmação).', '<b>Passivo</b>: edite direto e clique em Salvar; "Conferido" marca a data da conferência.'],
    desenhar:function(el, arg){
      if (arg && arg.aba) APP.pref('rt-aba', arg.aba);
      var aba = APP.pref('rt-aba') || 'guias';
      var guias = D().parcelas.filter(function(x){ return !N.pa(x.pa).cliEmite && !x.pago && (x.venc <= HOJE || APP.doMes(x.venc)); }), emit = guias.filter(function(x){ return x.emitida; });
      var pagMes = D().parcelas.filter(function(x){ return APP.doMes(x.venc) && x.venc <= HOJE; }), pagOk = pagMes.filter(function(x){ return x.pago; });
      var cl = D().clientes.filter(function(c){ return c.tipo !== 'Inativo'; }), clOk = cl.filter(function(c){ return c.conferido && APP.doMes(c.conferido); });
      var pr = D().processos.filter(function(p){ return p.status === 'Ativo'; }), prOk = pr.filter(function(p){ return p.conferido && APP.dias(p.conferido) < 15; });
      var placar = [
        { cor:emit.length >= guias.length ? 'g' : 'a', txt:'Guias enviadas <b>' + emit.length + ' de ' + guias.length + '</b>', fn:function(){ irAba('guias'); } },
        { cor:pagOk.length >= pagMes.length ? 'g' : 'a', txt:'Pagamentos conferidos <b>' + pagOk.length + ' de ' + pagMes.length + '</b>', fn:function(){ irAba('planilha'); } },
        { cor:clOk.length >= cl.length ? 'g' : 'a', txt:'Passivo conferido <b>' + clOk.length + ' de ' + cl.length + '</b>', fn:function(){ irAba('passivo'); } },
        { cor:prOk.length >= pr.length ? 'g' : 'a', txt:'Processos conferidos (15 dias) <b>' + prOk.length + ' de ' + pr.length + '</b>', fn:function(){ irAba('processos'); } }];
      el.innerHTML = APP.cabecalho({ ic:'rotina', tit:'Rotina', frase:APP.T('rotina.frase') }) + APP.faixa(placar, 'Placar do mês')
        + '<div class="seg seg-grande" id="rt-abas">' + ABAS.map(function(a){ return '<button type="button" class="seg-bt" data-rt="' + a[0] + '" aria-selected="' + (a[0] === aba) + '">' + a[1] + '</button>'; }).join('') + '</div><div id="rt-corpo"></div>';
      APP.ligarFaixa(el, placar);
      APP.$('rt-abas').onclick = function(e){ var b = e.target.closest('[data-rt]'); if (b) irAba(b.dataset.rt); };
      ({ passivo:passivo, processos:processos, guias:guiasMes, planilha:planilha, tarefas:tarefas })[aba](APP.$('rt-corpo'));
    } });
  function irAba(a){ APP.pref('rt-aba', a); APP.redesenhar(); }

  /* ── Passivo: planilha editável (salva tudo de uma vez) ── */
  function passivo(el){
    var g = APP.pref('rt-g') || '', q = APP.pref('rt-q') || '';
    var C = D().clientes.filter(function(c){ return c.tipo !== 'Inativo' && (!g || c.g === g) && (!q || APP.norm(c.nome + c.doc).indexOf(APP.norm(q)) >= 0); }).sort(function(a, b){ return APP.grupo(a.g).nome.localeCompare(APP.grupo(b.g).nome) || a.nome.localeCompare(b.nome); });
    var n = Object.keys(alterados).length, inp = function(c, k){ var v = (alterados[c.id] && alterados[c.id][k] != null) ? alterados[c.id][k] : c.passivo[k]; return '<input class="ctl in-v" data-c="' + c.id + '" data-k="' + k + '" inputmode="decimal" value="' + (v ? v.toLocaleString('pt-BR', { minimumFractionDigits:2 }) : '') + '" placeholder="' + (k.indexOf('Neg') > 0 ? 'negociada' : 'em aberto') + '">'; };
    var grp = '';
    el.innerHTML = '<div class="barra-tab"><label class="ctl-busca">' + ic('busca') + '<input id="ps-q" placeholder="Empresa ou CNPJ…" value="' + esc(q) + '"></label><select class="ctl" id="ps-g"><option value="">Todos os grupos</option>' + D().grupos.map(function(x){ return '<option value="' + x.id + '"' + (x.id === g ? ' selected' : '') + '>' + esc(x.nome) + '</option>'; }).join('') + '</select>'
      + '<span class="conta">' + APP.T('rotina.passivo') + '</span><span class="barra-dir"><button class="bt bt-o" type="button" id="ps-hist">' + ic('relogio') + 'Histórico</button><button class="bt bt-p" type="button" id="ps-salvar"' + (n ? '' : ' disabled') + '>' + ic('check') + 'Salvar' + (n ? ' (' + n + ')' : '') + '</button></span></div>'
      + '<div class="quadro"><div class="rola"><table class="tab t-passivo"><thead><tr><th>Empresa</th><th class="dir">RFB</th><th class="dir">PGFN</th><th class="dir">AGE/MG</th><th class="cen">Procuração</th><th class="cen">Certificado</th><th class="cen">CAPAG</th><th class="cen">Conferência</th></tr></thead><tbody>'
      + C.map(function(c){ var h = ''; if (c.g !== grp){ grp = c.g; h = '<tr class="grp"><td colspan="8">' + APP.grupoTxt(c.g) + '<button class="bt bt-g bt-mini" type="button" data-conf-g="' + c.g + '">' + ic('check') + 'Conferir o grupo todo (sem alteração)</button></td></tr>'; }
        var cf = c.conferido && APP.doMes(c.conferido);
        return h + '<tr class="' + (alterados[c.id] ? 'tr-alt' : '') + '"><td><span class="nome">' + esc(c.nome) + '</span><span class="doc">' + esc(c.doc) + '</span></td>'
          + '<td class="dir">' + inp(c, 'rfb') + inp(c, 'rfbNeg') + '</td><td class="dir">' + inp(c, 'pgfn') + inp(c, 'pgfnNeg') + '</td><td class="dir">' + inp(c, 'age') + inp(c, 'ageNeg') + '</td>'
          + '<td class="cen"><span class="pill ' + (c.procuracao ? 'p-g' : 'p-r') + '">' + (c.procuracao ? 'Sim' : 'Não') + '</span></td>'
          + '<td class="cen dt">' + (c.certificado ? '<span class="' + (c.certificado <= new Date(+HOJE + 30 * DIA) ? 'pz-a' : '') + '">' + APP.fd(c.certificado) + '</span>' : '<span class="pz-r">não tem</span>') + '</td>'
          + '<td class="cen"><span class="pill ' + ({ A:'p-g', B:'p-g', C:'p-a', D:'p-r', Omisso:'p-r' }[c.capag] || 'p-n') + '">' + esc(c.capag) + '</span></td>'
          + '<td class="cen">' + (cf ? '<span class="ok-txt">✓ ' + APP.fc(c.conferido) + '</span>' : '<button class="bt-baixa" type="button" data-conf-c="' + c.id + '">Conferido</button><small class="pz-sub ' + (c.conferido ? '' : 'pz-r') + '">' + (c.conferido ? 'último ' + APP.fc(c.conferido) : 'nunca') + '</small>') + '</td></tr>'; }).join('')
      + '</tbody></table></div></div>';
    var t; el.querySelector('#ps-q').oninput = function(e){ clearTimeout(t); t = setTimeout(function(){ APP.pref('rt-q', e.target.value); passivo(el); el.querySelector('#ps-q').focus(); }, 300); };
    el.querySelector('#ps-g').onchange = function(e){ APP.pref('rt-g', e.target.value); passivo(el); };
    el.onchange = function(e){ var i = e.target.closest('.in-v'); if (!i) return; var a = alterados[i.dataset.c] = alterados[i.dataset.c] || {}; a[i.dataset.k] = APP.num(i.value) || 0; i.closest('tr').classList.add('tr-alt'); var b = el.querySelector('#ps-salvar'); b.disabled = false; b.lastChild.textContent = 'Salvar (' + Object.keys(alterados).length + ')'; };
    el.querySelector('#ps-salvar').onclick = function(){ var ids = Object.keys(alterados), copia = alterados; alterados = {};
      APP.acao(APP.plural(ids.length, 'empresa salva', 'empresas salvas') + ' (e conferidas hoje).', function(){ var v = ids.map(function(id){ var c = APP.cli(id), f = APP.foto(c, ['conferido']), antes = JSON.parse(JSON.stringify(c.passivo)); Object.assign(c.passivo, copia[id]); c.conferido = new Date(HOJE); return function(){ f(); c.passivo = antes; }; }); return function(){ v.forEach(function(f){ f(); }); }; }); };
    el.querySelector('#ps-hist').onclick = function(){ APP.janela({ kick:'Histórico do passivo', tit:'O que mudou', corpo:'<div class="tempo">' + D().clientes.filter(function(c){ return c.conferido; }).map(function(c){ return '<div class="ev"><span class="q">' + APP.fd(c.conferido) + '</span><span class="ic">' + ic('check') + '</span><div class="tx"><b>' + esc(c.nome) + '</b><span>conferido · total ' + APP.brlK(c.passivo.rfb + c.passivo.rfbNeg + c.passivo.pgfn + c.passivo.pgfnNeg + c.passivo.age + c.passivo.ageNeg) + '</span></div></div>'; }).join('') + '</div>' }); };
    el.onclick = function(e){
      var c1 = e.target.closest('[data-conf-c]'); if (c1){ var c = APP.cli(c1.dataset.confC); APP.acao('Passivo conferido: ' + APP.curto(c) + '.', function(){ var f = APP.foto(c, ['conferido']); c.conferido = new Date(HOJE); return f; }); return; }
      var cg = e.target.closest('[data-conf-g]'); if (cg){ var L = D().clientes.filter(function(c){ return c.g === cg.dataset.confG && c.tipo !== 'Inativo'; });
        APP.confirmar({ tit:'Conferir o grupo todo?', sub:'Marca ' + APP.plural(L.length, 'empresa', 'empresas') + ' como conferidas hoje, sem alteração.', ok:'Conferir' }).then(function(s){ if (s) APP.acao(APP.plural(L.length, 'empresa conferida', 'empresas conferidas') + '.', function(){ var v = L.map(function(c){ var f = APP.foto(c, ['conferido']); c.conferido = new Date(HOJE); return f; }); return function(){ v.forEach(function(f){ f(); }); }; }); }); }
    };
  }

  /* ── Processos: conferir (sem novidade ou registrar movimentação) ── */
  function processos(el){
    var P = D().processos.filter(function(p){ return p.status === 'Ativo'; }), velho = function(p){ return !p.conferido || APP.dias(p.conferido) >= 15; };
    APP.tabela(el, { id:'rt-proc', linhas:P, unidade:['processo', 'processos'], contagem:true, dicaBusca:'Nº ou cliente…',
      abas:[{ id:'conf', rot:'Para conferir', cor:'r', f:velho }, { id:'ok', rot:'Conferidos (15 dias)', f:function(p){ return !velho(p); } }, { id:'todos', rot:'Todos', f:function(){ return true; } }],
      busca:function(p){ return p.numero + ' ' + APP.cli(p.cli).nome; }, ord:{ k:'conf', dir:1 },
      listas:[{ k:'g', rot:'Grupo', todos:'Todos os grupos', opcoes:D().grupos.map(function(g){ return [g.id, g.nome]; }), get:function(p){ return APP.cli(p.cli).g; } }, { k:'t', rot:'Tribunal', todos:'Todos', opcoes:[['TJMG','TJMG'],['TRT3','TRT3'],['TRF1','TRF1']], get:function(p){ return p.tribunal; } }],
      colunas:[{ k:'g', rot:'Grupo', html:function(p){ return APP.grupoTxt(APP.cli(p.cli).g); }, ord:function(p){ return APP.grupo(APP.cli(p.cli).g).nome; } },
        { k:'n', rot:'Processo', cls:'num', html:function(p){ return esc(p.numero) + '<span class="b-sub">' + esc(p.tribunal) + ' · ' + esc(p.natureza) + '</span>'; }, ord:function(p){ return p.numero; } },
        { k:'mov', rot:'Última movimentação', cls:'dt', html:function(p){ return '<span class="' + (APP.dias(p.ultMov.data) > 30 ? 'pz-r' : '') + '">' + APP.fd(p.ultMov.data) + '</span><small>' + esc(p.ultMov.txt) + '</small>'; }, ord:function(p){ return +p.ultMov.data; } },
        { k:'conf', rot:'Conferido', cls:'cen', html:function(p){ return p.conferido ? '<span class="' + (velho(p) ? 'pz-a' : 'ok-txt') + '">' + APP.fd(p.conferido) + '</span>' : '<span class="pz-r">nunca</span>'; }, ord:function(p){ return p.conferido ? +p.conferido : 0; } },
        { k:'ac', rot:'', cls:'dir acoes', ord:false, html:function(p){ return '<span class="acs"><button class="bt-emitir" type="button" data-pmov="' + p.id + '">Movimentação</button><button class="bt-baixa" type="button" data-psn="' + p.id + '">Sem novidade</button></span>'; } }],
      lote:[{ rot:'Conferidos, sem novidade', ic:'check', fn:function(l){ APP.acao(APP.plural(l.length, 'processo conferido', 'processos conferidos') + '.', function(){ var v = l.map(function(p){ var f = APP.foto(p, ['conferido']); p.conferido = new Date(HOJE); return f; }); return function(){ v.forEach(function(f){ f(); }); }; }); } }],
      clique:APP.janelaProcesso, vazio:{ tit:'Tudo conferido', frase:'Nenhum processo esperando conferência.' } });
    el.onclick = function(e){
      var s = e.target.closest('[data-psn]'); if (s){ var p = D().processos.find(function(x){ return x.id === s.dataset.psn; }); APP.acao('Conferido, sem novidade.', function(){ var f = APP.foto(p, ['conferido']); p.conferido = new Date(HOJE); return f; }); return; }
      var m = e.target.closest('[data-pmov]'); if (m) APP.janelaMovimento(D().processos.find(function(x){ return x.id === m.dataset.pmov; }));
    };
  }

  /* ── Guias do mês: uma linha por empresa → "Emitir e mandar" (anexa o PDF, lê o valor, rascunho no Gmail) ── */
  function guiasMes(el){
    var E = {};
    D().parcelas.forEach(function(x){ var pa = N.pa(x.pa); if (x.pago || !(x.venc <= HOJE || APP.doMes(x.venc))) return; (E[pa.cli] = E[pa.cli] || { cli:pa.cli, itens:[], cliEmite:false }).itens.push(x); if (pa.cliEmite) E[pa.cli].cliEmite = true; });
    var L = Object.keys(E).map(function(k){ var e = E[k]; e.id = k; e.falta = e.itens.filter(function(x){ return !x.emitida && !N.pa(x.pa).cliEmite; }); e.venc = new Date(Math.min.apply(null, e.itens.map(function(x){ return +x.venc; })));
      e.email = D().emails.filter(function(m){ return m.cli === k && m.tipo === 'guia_parcelamento' && APP.doMes(m.quando); }).pop(); return e; });
    el.innerHTML = '<div class="dica">' + APP.T('rotina.guias') + '. Hoje o e-mail vai para o <b>' + (D().emailCfg.guia_parcelamento.modo === 'rascunho' ? 'rascunho do Gmail' : 'cliente direto') + '</b> (troque em Administração → E-mails).</div><div id="rt-guias"></div>';
    APP.tabela(el.querySelector('#rt-guias'), { id:'rt-guias', linhas:L, unidade:['empresa', 'empresas'], contagem:true, dicaBusca:'Empresa…', ord:{ k:'venc', dir:1 },
      abas:[{ id:'falta', rot:'A emitir', cor:'r', f:function(e){ return e.falta.length; } }, { id:'feito', rot:'Já emitidas', f:function(e){ return !e.falta.length && !e.cliEmite; } }, { id:'cli', rot:'O cliente emite', f:function(e){ return e.cliEmite; } }],
      busca:function(e){ return APP.cli(e.cli).nome; }, valor:function(e){ return APP.soma(e.itens, function(x){ return x.v; }); }, linhaCls:function(e){ return e.falta.length && e.venc <= HOJE ? ' tr-venc' : ''; },
      colunas:[{ k:'g', rot:'Grupo', html:function(e){ return APP.grupoTxt(APP.cli(e.cli).g); }, ord:function(e){ return APP.grupo(APP.cli(e.cli).g).nome; } },
        { k:'emp', rot:'Empresa', html:function(e){ return APP.empresa(APP.cli(e.cli)); }, ord:function(e){ return APP.cli(e.cli).nome; } },
        { k:'guias', rot:'Guias', html:function(e){ return e.itens.map(function(x){ var pa = N.pa(x.pa); return '<span class="tag-g' + (x.emitida ? ' ok' : '') + '">' + esc(pa.nat) + ' ' + x.n + '/' + pa.tot + '</span>'; }).join(' '); }, ord:function(e){ return e.itens.length; } },
        { k:'v', rot:'Valor', cls:'dir val', soma:true, html:function(e){ return brl(APP.soma(e.itens, function(x){ return x.v; })); }, ord:function(e){ return APP.soma(e.itens, function(x){ return x.v; }); } },
        { k:'venc', rot:'Prazo', cls:'cen', html:function(e){ return APP.celPrazo(e.venc, null); }, ord:function(e){ return +e.venc; } },
        { k:'em', rot:'E-mail', cls:'cen', html:function(e){ return e.email ? '<span class="pill ' + ({ enviado:'p-g', rascunho:'p-b', erro:'p-r' }[e.email.status]) + '">' + ({ enviado:'Enviado', rascunho:'No rascunho', erro:'Erro' }[e.email.status]) + ' ' + APP.fc(e.email.quando) + '</span>' : '<span class="traco">—</span>'; }, ord:false },
        { k:'ac', rot:'', cls:'dir', ord:false, html:function(e){ return e.cliEmite ? '<span class="mudo">o cliente emite</span>' : e.falta.length ? '<button class="bt bt-p bt-mini" type="button" data-emp-emitir="' + e.cli + '">' + ic('doc') + 'Emitir e mandar</button>' : '<button class="bt bt-o bt-mini" type="button" data-emp-emitir="' + e.cli + '">Mandar de novo</button>'; } }],
      clique:function(e){ N.janelaEmitir(e.falta.length ? e.falta : e.itens, 'guia_parcelamento'); }, vazio:{ tit:'Nada a emitir', frase:'Todas as guias do mês já foram emitidas.' } });
    el.onclick = function(e){ var b = e.target.closest('[data-emp-emitir]'); if (!b) return; var x = L.find(function(y){ return y.cli === b.dataset.empEmitir; }); N.janelaEmitir(x.falta.length ? x.falta : x.itens, 'guia_parcelamento'); };
  }

  /* ── Planilha: um bloco por parcelamento (do grupo escolhido), com Emissão e Pagamento ── */
  function planilha(el){
    var gs = D().grupos, g = APP.pref('pl-g') || gs[0].id;
    var PA = D().parcelamentos.filter(function(pa){ return APP.cli(pa.cli).g === g; });
    el.innerHTML = '<div class="chips chips-esq">' + gs.map(function(x){ var n = D().parcelas.filter(function(y){ var pa = N.pa(y.pa); return APP.cli(pa.cli).g === x.id && N.paraEmitir(y); }).length;
        return '<button class="chip" type="button" data-plg="' + x.id + '" aria-pressed="' + (x.id === g) + '"><span class="ponto" style="background:var(--g' + x.cor + ')"></span>' + esc(x.nome) + (n ? ' <span class="seg-n r">' + n + '</span>' : '') + '</button>'; }).join('') + '</div>'
      + '<p class="mudo">' + APP.T('rotina.planilha') + '</p><div class="blocos">' + PA.map(function(pa){ var c = APP.cli(pa.cli), r = N.resumo(pa), L = N.parcelasDe(pa);
        var i0 = L.findIndex(function(x){ return !x.pago; }); if (i0 < 0) i0 = L.length; var ver = APP.pref('pl-tudo-' + pa.id), V = ver ? L : L.slice(Math.max(0, i0 - 3), i0 + 4);
        return '<section class="bloco-pl"><div class="pl-hd"><b>' + esc(c.nome) + '</b><span class="doc">' + esc(c.doc) + '</span><div class="tags"><span class="tag-g">' + esc(pa.plat) + '</span><span class="tag-g">' + esc(pa.nat) + '</span><span class="tag-g">nº ' + esc(pa.num) + '</span>' + (pa.cliEmite ? '<span class="tag-g">o cliente emite</span>' : '') + '</div>'
          + '<div class="barra"><span style="width:' + (r.pg / pa.tot * 100) + '%"></span></div><small>' + r.pg + ' de ' + pa.tot + ' pagas' + (r.atr ? ' · <span class="pz-r">' + r.atr + ' em atraso</span>' : '') + '</small></div>'
          + '<table class="tab t-pl"><thead><tr><th>Nº</th><th>Vencimento</th><th class="cen">Emissão</th><th class="cen">Pagamento</th></tr></thead><tbody>' + V.map(function(x){
            return '<tr class="' + APP.vencida(x.venc, x.pago) + '"><td>' + x.n + '</td><td class="dt">' + APP.fd(x.venc) + '</td>'
              + '<td class="cen">' + (pa.cliEmite ? '<span class="mudo">cliente</span>' : x.emitida ? '<button class="tg on" type="button" data-pl-em="' + x.id + '">✓ emitida</button>' : '<button class="tg" type="button" data-pl-em="' + x.id + '">marcar</button>') + '</td>'
              + '<td class="cen">' + (x.pago ? '<button class="tg on" type="button" data-pl-pg="' + x.id + '">✓ ' + APP.fc(x.pago) + '</button>' : x.venc <= HOJE ? '<button class="tg atr" type="button" data-pl-pg="' + x.id + '">em atraso</button>' : '<button class="tg av" type="button" data-pl-pg="' + x.id + '">a vencer</button>') + '</td></tr>'; }).join('')
          + '</tbody></table><button class="bt bt-g bt-mini" type="button" data-pl-tudo="' + pa.id + '">' + (ver ? 'Mostrar só as próximas' : 'Ver todas as ' + pa.tot + ' parcelas') + '</button></section>'; }).join('') + '</div>';
    el.onclick = function(e){
      var gb = e.target.closest('[data-plg]'); if (gb){ APP.pref('pl-g', gb.dataset.plg); planilha(el); return; }
      var t = e.target.closest('[data-pl-tudo]'); if (t){ APP.pref('pl-tudo-' + t.dataset.plTudo, !APP.pref('pl-tudo-' + t.dataset.plTudo)); planilha(el); return; }
      var em = e.target.closest('[data-pl-em]'); if (em){ var x = N.parcela(em.dataset.plEm); APP.acao(x.emitida ? 'Emissão desmarcada.' : 'Guia marcada como emitida.', function(){ var f = APP.foto(x, ['emitida']); x.emitida = x.emitida ? null : new Date(HOJE); return f; }); return; }
      var pg = e.target.closest('[data-pl-pg]'); if (pg){ var y = N.parcela(pg.dataset.plPg); if (y.pago) APP.confirmar({ tit:'Desmarcar o pagamento?', sub:'Parcela ' + y.n + ' volta a ficar em aberto.', ok:'Desmarcar' }).then(function(s){ if (s) APP.acao('Pagamento desmarcado.', function(){ var f = APP.foto(y, ['pago']); y.pago = null; return f; }); }); else N.baixaParcela(y); }
    };
  }

  /* ── Minhas tarefas: uma tabela com abas ── */
  function tarefas(el){
    var eu = APP.pref('eu') || 'pedro', T = D().tarefas.filter(function(t){ return t.resp === eu || t.revisor === eu; });
    el.innerHTML = '<p class="mudo">' + APP.T('rotina.tarefas') + '</p><div id="rt-tf"></div>';
    APP.tabela(el.querySelector('#rt-tf'), { id:'rt-tarefas', linhas:T, unidade:['tarefa', 'tarefas'], contagem:true, ord:{ k:'prazo', dir:1 },
      abas:[{ id:'rec', rot:'Recorrentes', f:function(t){ return t.repete && t.resp === eu; } }, { id:'val', rot:'Com validação', f:function(t){ return !t.feita && t.revisor && t.resp === eu; } }, { id:'uni', rot:'Únicas', f:function(t){ return !t.feita && !t.repete && !t.revisor && t.resp === eu; } }, { id:'eu', rot:'Para eu validar', cor:'r', f:function(t){ return t.revisor === eu && t.status === 'revisao'; } }],
      colunas:[{ k:'tit', rot:'Tarefa', html:function(t){ return esc(t.tit); }, ord:function(t){ return t.tit; } },
        { k:'rep', rot:'Repete', html:function(t){ return t.repete ? '<span class="tag-g">' + esc(t.repete) + '</span>' : '<span class="traco">—</span>'; }, ord:false },
        { k:'prazo', rot:'Prazo', cls:'cen', html:function(t){ return t.feita ? '<span class="ok-txt">✓ feita ' + APP.fc(t.feita) + '</span>' : APP.celPrazo(t.prazo, null); }, ord:function(t){ return +t.prazo; } },
        { k:'ac', rot:'', cls:'dir', ord:false, html:function(t){ return t.feita ? '' : '<button class="bt-baixa" type="button" data-concluir="' + t.id + '">' + (t.revisor && t.resp === eu ? 'Concluir e enviar' : t.status === 'revisao' ? 'Aprovar' : 'Concluir') + '</button>'; } }],
      clique:APP.formTarefa, vazio:{ tit:'Nada aqui', frase:'Nenhuma tarefa nesta aba.' } });
  }
})();
