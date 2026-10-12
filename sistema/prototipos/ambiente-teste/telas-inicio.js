/* Telas: Início (enxuto — faixa de avisos no lugar dos cartões "Financeiro" e "Escritório") e Tarefas. */
(function(){
  var APP = window.APP, N = APP.N, ic = APP.ic, esc = APP.esc, brl = APP.brl, HOJE = DADOS.HOJE, DIA = DADOS.DIA;
  var D = function(){ return APP.D; };
  var TIPOS = { tarefa:'Tarefa', reuniao:'Reunião', audiencia:'Audiência', compromisso:'Compromisso', rotina:'Rotina' };
  var PRI = { alta:['p-r','Alta'], media:['p-a','Média'], baixa:['p-n','Baixa'] };
  var COR_LEMB = { vermelho:'var(--red)', azul:'var(--blue)', verde:'var(--green)', amarelo:'var(--amber)' };

  /* ═════════ INÍCIO ═════════ */
  APP.registrar('inicio', { tit:'Início', ic:'inicio',
    ajuda:['A <b>faixa</b> no alto junta o que antes ficava nos cartões "Financeiro" e "Escritório" e na tela Alertas: cada item leva direto à lista certa.', '<b>Meu dia</b>: o que vence hoje e o que atrasou (tarefas, reuniões, audiências e rotinas). Concluir tem "Desfazer".', '<b>Lembretes</b>: anotações rápidas, com ou sem data.'],
    novo:function(){ formLembrete(); },
    desenhar:function(el){
      var eu = APP.pessoa(APP.pref('eu') || 'pedro'), pend = N.pendencias();
      var fin = pend.filter(function(p){ return p.area === 'Financeiro'; }), esc2 = pend.filter(function(p){ return p.area !== 'Financeiro'; });
      el.innerHTML = APP.cabecalho({ ic:'inicio', tit:(HOJE.getHours ? 'Bom dia, ' : '') + eu.curto, frase:APP.T('inicio.frase') + ' · segunda-feira, 12 de outubro',
          acoes:'<label class="ver-como">Ver como <select class="ctl" id="ini-eu">' + D().equipe.map(function(p){ return '<option value="' + p.id + '"' + (p.id === eu.id ? ' selected' : '') + '>' + esc(p.curto) + '</option>'; }).join('') + '</select></label><button class="bt bt-p" type="button" id="ini-lemb">' + ic('mais') + 'Lembrete</button>' })
        + '<div id="ini-faixa" class="faixas">' + (fin.length ? APP.faixa(fin, 'Financeiro') : '') + APP.faixa(esc2, 'Escritório') + '</div>'
        + '<div class="duas"><section class="bloco-c"><div class="sec-cab"><div><h2>' + APP.T('inicio.fila') + '</h2><p>Hoje e o que atrasou</p></div><div class="chips" id="ini-quem"></div></div><div id="ini-dia"></div></section>'
        + '<section class="bloco-c"><div class="sec-cab"><div><h2>Lembretes</h2></div></div><div id="ini-lembretes"></div><div class="sec-cab" style="margin-top:14px"><div><h2>Próximos 7 dias</h2></div></div><div id="ini-semana"></div></section></div>';
      var fx = el.querySelector('#ini-faixa'); APP.ligarFaixa(fx.children[0], fin.length ? fin : esc2); if (fin.length) APP.ligarFaixa(fx.children[1], esc2);
      APP.$('ini-eu').onchange = function(){ APP.pref('eu', this.value); APP.redesenhar(); };
      APP.$('ini-lemb').onclick = function(){ formLembrete(); };
      var todos = APP.pref('ini-todos');
      APP.$('ini-quem').innerHTML = '<button class="chip" type="button" data-q="eu" aria-pressed="' + !todos + '">Só eu</button><button class="chip" type="button" data-q="todos" aria-pressed="' + !!todos + '">Equipe toda</button>';
      APP.$('ini-quem').onclick = function(e){ var b = e.target.closest('[data-q]'); if (!b) return; APP.pref('ini-todos', b.dataset.q === 'todos'); APP.redesenhar(); };
      var minhas = D().tarefas.filter(function(t){ return !t.feita && (todos || t.resp === eu.id); });
      var hojeL = minhas.filter(function(t){ return t.prazo <= HOJE; }).sort(function(a, b){ return a.prazo - b.prazo; });
      APP.$('ini-dia').innerHTML = hojeL.length ? '<div class="lista">' + hojeL.map(itemTarefa).join('') + '</div>' : '<div class="quadro"><div class="vazio"><div class="vazio-ic">' + ic('ok') + '</div><b>Nada para hoje</b><p>Nenhuma tarefa vence hoje nem está atrasada.</p></div></div>';
      var prox = minhas.filter(function(t){ return t.prazo > HOJE && t.prazo <= new Date(+HOJE + 7 * DIA); }).sort(function(a, b){ return a.prazo - b.prazo; });
      APP.$('ini-semana').innerHTML = prox.length ? '<div class="lista">' + prox.map(itemTarefa).join('') + '</div>' : '<p class="mudo">Nada nos próximos 7 dias.</p>';
      var L = D().lembretes.filter(function(l){ return !l.feito && (!l.dia || l.dia <= new Date(+HOJE + 7 * DIA)); });
      APP.$('ini-lembretes').innerHTML = L.length ? '<div class="lista">' + L.map(function(l){ return '<div class="li li-lemb" style="--c:' + (COR_LEMB[l.cor] || 'var(--text3)') + '"><span class="li-tx">' + esc(l.txt) + (l.dia ? '<small>' + APP.fd(l.dia) + '</small>' : '') + '</span><button class="bt bt-g bt-mini" type="button" data-lemb-ok="' + l.id + '">' + ic('check') + 'Feito</button></div>'; }).join('') + '</div>'
        : '<p class="mudo">' + APP.T('inicio.lemb.vazio') + '</p>';
      el.querySelectorAll('[data-lemb-ok]').forEach(function(b){ b.onclick = function(){ var l = D().lembretes.find(function(x){ return x.id === b.dataset.lembOk; }); APP.acao('Lembrete concluído.', function(){ var v = APP.foto(l, ['feito']); l.feito = true; return v; }); }; });
    } });
  function itemTarefa(t){
    var atr = t.prazo < HOJE, hoje = +t.prazo === +HOJE;
    return '<div class="li" data-tarefa="' + t.id + '"><span class="li-tipo t-' + t.tipo + '">' + esc(TIPOS[t.tipo]) + '</span><span class="li-tx"><b>' + esc(t.tit) + '</b><small>' + esc(APP.pessoa(t.resp).curto) + (t.hora ? ' · ' + t.hora : '') + (t.fatal ? ' · <span class="pz-r">prazo fatal</span>' : '') + '</small></span>'
      + '<span class="' + (atr || hoje ? 'pz-r' : 'pz-b') + ' li-q">' + (atr ? APP.dias(t.prazo) + ' d atraso' : hoje ? 'hoje' : APP.fc(t.prazo)) + '</span><button class="bt-baixa" type="button" data-concluir="' + t.id + '">Concluir</button></div>';
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest('[data-concluir]'); if (b){ e.stopPropagation(); var t = D().tarefas.find(function(x){ return x.id === b.dataset.concluir; });
      var paraValidar = t.revisor && t.status !== 'revisao';
      APP.acao(paraValidar ? 'Tarefa enviada para ' + APP.pessoa(t.revisor).curto + ' validar.' : t.status === 'revisao' ? 'Tarefa aprovada e concluída.' : 'Tarefa concluída.' + (t.repete ? ' Ela volta sozinha (' + t.repete + ').' : ''), function(){ var f = APP.foto(t, ['feita', 'status']); if (paraValidar) t.status = 'revisao'; else t.feita = new Date(HOJE); return f; }); return; }
    var li = e.target.closest('.li[data-tarefa]'); if (li && !e.target.closest('button')){ formTarefa(D().tarefas.find(function(x){ return x.id === li.dataset.tarefa; })); }
  }, true);
  function formLembrete(){
    var J = APP.janela({ kick:'Novo', tit:'Lembrete', corpo:APP.campo('O que lembrar', '<input class="ctl" id="lb-tx" placeholder="Ex.: ligar para o contador da Vale Verde">') + '<div class="dois">' + APP.campo('Dia (opcional)', '<input class="ctl" type="date" id="lb-dia">') + APP.campo('Cor', '<select class="ctl" id="lb-cor"><option value="">Nenhuma</option><option value="vermelho">Vermelho</option><option value="amarelo">Amarelo</option><option value="azul">Azul</option><option value="verde">Verde</option></select>') + '</div>',
      rodape:'<button class="bt bt-o" type="button" data-fechar>Cancelar</button><button class="bt bt-p" type="button" id="lb-ok">' + ic('check') + 'Salvar</button>' });
    J.q('#lb-ok').onclick = function(){ var tx = J.q('#lb-tx').value.trim(); if (!tx) return J.q('#lb-tx').focus();
      var l = { id:'lb' + Date.now(), txt:tx, dia:APP.deIso(J.q('#lb-dia').value), cor:J.q('#lb-cor').value };
      J.fechar(); APP.acao('Lembrete salvo.', function(){ D().lembretes.push(l); return function(){ D().lembretes.splice(D().lembretes.indexOf(l), 1); }; }); };
  }

  /* ═════════ TAREFAS ═════════ */
  APP.registrar('tarefas', { tit:'Tarefas', ic:'tarefa',
    ajuda:['Sem os 4 cartões do topo: os números estão nas abas (Em aberto, Atrasadas, Concluídas).', 'Os atalhos Vencidas · 5 · 10 · 15 · 30 dias filtram pelo prazo.', 'Pessoa, tipo e prioridade ficam em <b>Filtros</b>. "Marcar várias" conclui de uma vez.', 'Toda tarefa com revisor vai para validação ao concluir.'],
    novo:function(){ formTarefa(null); },
    desenhar:function(el){
      var vista = APP.pref('tf-vista') || 'lista';
      el.innerHTML = APP.cabecalho({ ic:'tarefa', tit:'Tarefas', frase:APP.T('tarefas.frase'), acoes:'<div class="seg"><button class="seg-bt" type="button" data-vista="lista" aria-selected="' + (vista === 'lista') + '">Lista</button><button class="seg-bt" type="button" data-vista="semana" aria-selected="' + (vista === 'semana') + '">Semana</button></div><button class="bt bt-p" type="button" id="tf-nova">' + ic('mais') + 'Nova tarefa</button>' }) + '<div id="tf-corpo"></div>';
      el.querySelector('.cab-acoes .seg').onclick = function(e){ var b = e.target.closest('[data-vista]'); if (b){ APP.pref('tf-vista', b.dataset.vista); APP.redesenhar(); } };
      APP.$('tf-nova').onclick = function(){ formTarefa(null); };
      var T = D().tarefas;
      if (vista === 'semana') return semana(APP.$('tf-corpo'), T);
      APP.tabela(APP.$('tf-corpo'), { id:'tarefas', linhas:T, unidade:['tarefa', 'tarefas'], contagem:true, dicaBusca:'Tarefa ou cliente…',
        abas:[{ id:'ab', rot:'Em aberto', f:function(t){ return !t.feita; } }, { id:'atr', rot:'Atrasadas', cor:'r', f:function(t){ return !t.feita && t.prazo < HOJE; } }, { id:'fe', rot:'Concluídas', f:function(t){ return !!t.feita; } }],
        prazos:true, prazosAbas:['ab'], busca:function(t){ return t.tit + ' ' + APP.pessoa(t.resp).nome; }, venc:function(t){ return t.prazo; }, ord:{ k:'prazo', dir:1 },
        listas:[{ k:'resp', rot:'Pessoa', todos:'Todas as pessoas', opcoes:D().equipe.map(function(p){ return [p.id, p.curto]; }), get:function(t){ return t.resp; } },
          { k:'tipo', rot:'Tipo', todos:'Todos os tipos', opcoes:Object.keys(TIPOS).map(function(k){ return [k, TIPOS[k]]; }), get:function(t){ return t.tipo; } },
          { k:'pri', rot:'Prioridade', todos:'Todas', opcoes:[['alta','Alta'],['media','Média'],['baixa','Baixa']], get:function(t){ return t.pri; } }],
        colunas:[{ k:'tit', rot:'Tarefa', html:function(t){ return '<span class="li-tipo t-' + t.tipo + '">' + esc(TIPOS[t.tipo]) + '</span> ' + esc(t.tit) + (t.repete ? '<span class="b-sub">repete ' + esc(t.repete) + '</span>' : '') + (t.status === 'revisao' ? '<span class="b-sub">aguardando validação de ' + esc(APP.pessoa(t.revisor).curto) + '</span>' : ''); }, ord:function(t){ return t.tit; } },
          { k:'resp', rot:'Pessoa', html:function(t){ return APP.pessoaTxt(t.resp); }, ord:function(t){ return t.resp; } },
          { k:'pri', rot:'Prioridade', cls:'cen', html:function(t){ return '<span class="pill ' + PRI[t.pri][0] + '">' + PRI[t.pri][1] + '</span>'; }, ord:function(t){ return { alta:0, media:1, baixa:2 }[t.pri]; } },
          { k:'prazo', rot:'Prazo', cls:'cen dt', html:function(t){ return APP.fd(t.prazo) + (t.hora ? '<small>' + t.hora + '</small>' : ''); }, ord:function(t){ return +t.prazo; } },
          { k:'pz', rot:'Situação', cls:'cen', html:function(t){ return t.feita ? '<span class="ok-txt">✓ ' + APP.fc(t.feita) + '</span>' : APP.celPrazo(t.prazo, null, t.fatal ? 'prazo fatal' : ''); }, ord:function(t){ return +t.prazo; } },
          { k:'ac', rot:'', cls:'dir', ord:false, html:function(t){ return t.feita ? '' : '<button class="bt-baixa" type="button" data-concluir="' + t.id + '">Concluir</button>'; } }],
        linhaCls:function(t){ return !t.feita && t.prazo < HOJE ? ' tr-venc' : ''; },
        lote:[{ rot:'Concluir as marcadas', ic:'check', quando:function(t){ return !t.feita; }, fn:function(l){ APP.acao(APP.plural(l.length, 'tarefa concluída', 'tarefas concluídas') + '.', function(){ var v = l.map(function(t){ var f = APP.foto(t, ['feita']); t.feita = new Date(HOJE); return f; }); return function(){ v.forEach(function(f){ f(); }); }; }); } }],
        clique:formTarefa, vazio:{ tit:'Nenhuma tarefa aqui', frase:'Use "Nova tarefa" ou troque a aba.' } });
    } });
  function semana(el, T){
    var ini = new Date(+HOJE - ((HOJE.getDay() + 6) % 7) * DIA), dias = [];
    for (var i = 0; i < 7; i++) dias.push(new Date(+ini + i * DIA));
    el.innerHTML = '<div class="semana">' + dias.map(function(d){ var L = T.filter(function(t){ return !t.feita && +t.prazo === +d; });
      return '<div class="sem-dia' + (+d === +HOJE ? ' hoje' : '') + '"><div class="sem-hd">' + ['seg','ter','qua','qui','sex','sáb','dom'][(d.getDay() + 6) % 7] + ' <b>' + d.getDate() + '</b></div>' + L.map(function(t){ return '<button type="button" class="sem-it t-' + t.tipo + '" data-tf="' + t.id + '">' + (t.hora ? '<small>' + t.hora + '</small>' : '') + esc(t.tit) + '</button>'; }).join('') + '</div>'; }).join('') + '</div>'
      + '<p class="mudo">Atrasadas não aparecem aqui: veja a aba "Atrasadas" na Lista.</p>';
    el.onclick = function(e){ var b = e.target.closest('[data-tf]'); if (b) formTarefa(T.find(function(t){ return t.id === b.dataset.tf; })); };
  }
  var formTarefa = APP.formTarefa = function(t){
    var novo = !t; t = t || { tit:'', resp:APP.pref('eu') || 'pedro', prazo:HOJE, tipo:'tarefa', pri:'media' };
    var J = APP.janela({ kick:novo ? 'Nova' : 'Tarefa', tit:novo ? 'Tarefa' : t.tit, sub:novo ? '' : esc(TIPOS[t.tipo]) + ' · ' + esc(APP.pessoa(t.resp).curto),
      corpo:APP.campo('O que fazer', '<input class="ctl" id="tf-tit" value="' + esc(t.tit) + '">')
        + '<div class="tres">' + APP.campo('Pessoa', '<select class="ctl" id="tf-resp">' + D().equipe.map(function(p){ return '<option value="' + p.id + '"' + (p.id === t.resp ? ' selected' : '') + '>' + esc(p.curto) + '</option>'; }).join('') + '</select>')
        + APP.campo('Prazo', '<input class="ctl" type="date" id="tf-prazo" value="' + APP.iso(t.prazo) + '">') + APP.campo('Tipo', '<select class="ctl" id="tf-tipo">' + Object.keys(TIPOS).map(function(k){ return '<option value="' + k + '"' + (k === t.tipo ? ' selected' : '') + '>' + TIPOS[k] + '</option>'; }).join('') + '</select>') + '</div>'
        + '<div class="dois">' + APP.campo('Prioridade', APP.opcoes('Prioridade', ['Alta', 'Média', 'Baixa'], PRI[t.pri][1])) + APP.campo('Repetir', '<select class="ctl" id="tf-rep"><option value="">Não repete</option>' + ['toda semana', 'todo dia 1', 'todo dia 5', 'todo dia 10', 'todo mês no mesmo dia'].map(function(r){ return '<option' + (t.repete === r ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select>') + '</div>'
        + APP.campo('Quem valida (opcional)', '<select class="ctl" id="tf-rev"><option value="">Ninguém — conclui direto</option>' + D().equipe.map(function(p){ return '<option value="' + p.id + '"' + (p.id === t.revisor ? ' selected' : '') + '>' + esc(p.curto) + '</option>'; }).join('') + '</select>', 'Com alguém aqui, ao concluir a tarefa vai para essa pessoa aprovar.'),
      rodape:(novo ? '' : '<button class="bt bt-g esq" type="button" id="tf-del">' + ic('lixo') + 'Excluir</button>') + '<button class="bt bt-o" type="button" data-fechar>Cancelar</button><button class="bt bt-p" type="button" id="tf-ok">' + ic('check') + 'Salvar</button>' });
    J.q('#tf-ok').onclick = function(){
      var tit = J.q('#tf-tit').value.trim(); if (!tit) return J.q('#tf-tit').focus();
      var dados = { tit:tit, resp:J.q('#tf-resp').value, prazo:APP.deIso(J.q('#tf-prazo').value) || HOJE, tipo:J.q('#tf-tipo').value, pri:{ Alta:'alta', 'Média':'media', Baixa:'baixa' }[APP.opcaoDe(J, 'Prioridade')] || 'media', repete:J.q('#tf-rep').value, revisor:J.q('#tf-rev').value || null };
      J.fechar();
      if (novo) APP.acao('Tarefa criada para ' + APP.pessoa(dados.resp).curto + '.', function(){ var n = Object.assign({ id:'t' + Date.now(), origem:'manual', feita:null }, dados); D().tarefas.push(n); return function(){ D().tarefas.splice(D().tarefas.indexOf(n), 1); }; });
      else APP.acao('Tarefa alterada.', function(){ var v = APP.foto(t, Object.keys(dados)); Object.assign(t, dados); return v; });
    };
    var del = J.q('#tf-del'); if (del) del.onclick = function(){ J.fechar(); APP.confirmar({ tit:'Excluir esta tarefa?', sub:esc(t.tit), ok:'Excluir', perigo:true }).then(function(s){ if (s) APP.acao('Tarefa excluída.', function(){ var i = D().tarefas.indexOf(t); D().tarefas.splice(i, 1); return function(){ D().tarefas.splice(i, 0, t); }; }); }); };
  };
})();
