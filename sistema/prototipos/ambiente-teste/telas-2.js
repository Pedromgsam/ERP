/* Telas: Clientes (ficha com linha do tempo e automações do cliente), Rotina, Administração
   (automações por cliente, caixa de saída com conferência, importações com reverter, novidades, ambiente de teste) e a busca geral. */
(function(){
  var APP = window.APP, N = APP.N, ic = APP.ic, esc = APP.esc, brl = APP.brl, HOJE = DADOS.HOJE, DIA = DADOS.DIA;
  var D = function(){ return APP.D; };
  var MODOS = [['padrao','Padrão'],['desligado','Desligado'],['personalizado','Personalizado']];
  var ORIGEM = { guia_emitida:'Guia emitida', lembrete_parcela:'Lembrete da parcela', recibo:'Recibo', docs_mes:'Documentos do mês', cobranca_honorario:'Cobrança', manual:'Manual', resumo_manha:'Resumo da manhã' };
  var ST_EMAIL = { revisar:['p-a','Para revisar'], agendado:['p-b','Agendado'], enviado:['p-g','Enviado'], descartado:['p-n','Descartado'] };
  function sel(id, itens, v, attr){ return '<select class="ctl" ' + (id ? 'id="' + id + '" ' : '') + (attr || '') + '>' + itens.map(function(t){ return '<option value="' + esc(t[0]) + '"' + (String(t[0]) === String(v) ? ' selected' : '') + '>' + esc(t[1]) + '</option>'; }).join('') + '</select>'; }
  function clone(o){ return JSON.parse(JSON.stringify(o || {})); }
  function primeiro(c){ return c.nome.split(' ').slice(0, 2).join(' '); }
  // sub-abas de uma tela (as mesmas abas das tabelas)
  function subAbas(id, itens, atual){ return '<div class="barra-abas" style="border-bottom:1px solid var(--line)"><div class="abas" role="tablist" id="' + id + '">' + itens.map(function(a){ return '<button class="aba" role="tab" type="button" data-sub="' + a[0] + '" aria-selected="' + (a[0] === atual) + '">' + esc(a[1]) + (a[2] != null ? '<span class="c' + (a[3] && a[2] ? ' r' : '') + '">' + a[2] + '</span>' : '') + '</button>'; }).join('') + '</div></div>'; }

  /* ── quando cada automação roda (texto curto) ── */
  APP.quandoAuto = function(a){
    return { resumo_manha:(a.uteis ? 'Dias úteis' : 'Todos os dias') + ' às ' + a.hora + ' · ' + APP.plural((a.quem || []).length, 'pessoa', 'pessoas'),
      lembrete_parcela:a.dias + ' dias antes do vencimento, às ' + a.hora, guia_emitida:'Ao marcar a guia como emitida · ' + (a.modo === 'enviar' ? 'envia sozinho' : 'fica para revisar'),
      risco_rescisao:'Quando um parcelamento chega a ' + a.limite + ' parcelas em atraso', leitura_pdf:'Ao anexar o PDF da guia',
      conferencia_mes:'Todo dia ' + a.diaMes + ' às ' + a.hora + ' · ' + (a.resp ? APP.pessoa(a.resp).curto : ''), docs_mes:'Todo dia ' + a.diaMes + ' às ' + a.hora,
      cobranca_honorario:a.dias + ' dias depois do vencimento, às ' + a.hora, recibo:'Ao lançar o recebimento do honorário' }[a.id] || '';
  };
  function excecoes(a){ return Object.keys(D().porCliente).filter(function(cid){ var o = D().porCliente[cid][a.id]; return o && o.modo !== 'padrao'; }); }

  /* ═════════ E-MAILS (caixa de saída) ═════════ */
  APP.cfgEmails = function(id, lista, titulo, comAbas){
    return { id:id, titulo:titulo, linhas:lista, unidade:['e-mail','e-mails'], ord:{ k:'quando', dir:-1 }, ordAbas:{ revisar:{ k:'quando', dir:1 }, agendado:{ k:'quando', dir:1 }, enviado:{ k:'quando', dir:-1 } },
      abas: comAbas ? [{ id:'revisar', rot:'Para revisar', cor:'r', f:function(e){ return e.status === 'revisar'; } }, { id:'agendado', rot:'Agendados', f:function(e){ return e.status === 'agendado'; } }, { id:'enviado', rot:'Enviados', f:function(e){ return e.status === 'enviado'; } }] : null,
      busca:function(e){ var c = APP.cli(e.cli); return c.nome + ' ' + e.assunto + ' ' + e.para; }, dicaBusca:'Cliente, assunto ou e-mail', venc:function(e){ return e.quando || e.criado; },
      listas:[{ k:'origem', rot:'Origem', todos:'Todas as origens', opcoes:Object.keys(ORIGEM).map(function(k){ return [k, ORIGEM[k]]; }), get:function(e){ return e.origem; } }],
      colunas:[{ k:'cli', rot:'Cliente', html:function(e){ return APP.celEmpresa(APP.cli(e.cli)); }, ord:function(e){ return APP.cli(e.cli).nome; } },
        { k:'assunto', rot:'Assunto', html:function(e){ return esc(e.assunto) + (e.anexo ? '<span class="doc">' + ic('clipe').replace('class="i"', 'class="i" style="width:12px;height:12px;vertical-align:-2px"') + ' ' + esc(e.anexo.nome) + '</span>' : ''); } },
        { k:'para', rot:'Para', html:function(e){ return '<span class="doc" style="margin:0">' + esc(e.para || '— sem e-mail —') + '</span>'; } },
        { k:'origem', rot:'Origem', html:function(e){ return e.origem !== 'manual' ? '<span class="tag-auto">' + esc(ORIGEM[e.origem] || e.origem) + '</span>' : 'Manual'; } },
        { k:'quando', rot:'Quando', cls:'dt', html:function(e){ var q = e.quando || e.criado; return APP.fd(q) + ' <small>' + APP.fh(q) + '</small>'; }, ord:function(e){ return +(e.quando || e.criado); } },
        { k:'st', rot:'Situação', cls:'cen', html:function(e){ var s = ST_EMAIL[e.status] || ['p-n', e.status]; return '<span class="pill ' + s[0] + '">' + s[1] + '</span>'; }, ord:function(e){ return e.status; } }],
      lote:[{ rot:'Enviar', ic:'email', quando:function(e){ return e.status === 'revisar' || e.status === 'agendado'; }, fn:function(l){
        var probl = l.filter(function(e){ return N.checagens(e).some(function(c){ return c.ok === false; }); });
        return APP.confirmar({ kick:'Enviar em lote', tit:'Enviar ' + APP.plural(l.length, 'e-mail', 'e-mails') + ' agora?', ok:'Enviar',
          resumo:l.slice(0, 8).map(function(e){ return '<span>' + esc(primeiro(APP.cli(e.cli))) + ' · ' + esc(e.assunto) + '</span>'; }).join('') + (probl.length ? '<span style="color:var(--red)"><b>' + APP.plural(probl.length, 'e-mail tem', 'e-mails têm') + ' problema na conferência</b> e ' + (probl.length === 1 ? 'fica' : 'ficam') + ' de fora. Abra um a um para revisar.</span>' : '') })
          .then(function(s){ if (!s) return false; var ok = l.filter(function(e){ return probl.indexOf(e) < 0; }); if (!ok.length) return false;
            APP.acao(APP.plural(ok.length, 'e-mail enviado', 'e-mails enviados') + '.', function(){ var v = ok.map(enviar); return function(){ v.forEach(function(f){ f(); }); }; }); }); } }],
      clique:APP.revisarEmail };
  };
  function enviar(e){
    var f = APP.foto(e, ['status', 'quando']), x = e.parcela && N.parcela(e.parcela), fx = x ? APP.foto(x, ['enviada']) : null;
    e.status = 'enviado'; e.quando = new Date(); if (x) x.enviada = new Date(HOJE);
    return function(){ f(); if (fx) fx(); };
  }
  function textoEmail(e){
    if (e.texto) return e.texto;
    var x = e.parcela && N.parcela(e.parcela), c = APP.cli(e.cli);
    if (x) return N.textoGuia(x);
    if (e.origem === 'docs_mes') return 'Olá,\n\nPara fecharmos a competência, ainda faltam os documentos abaixo:\n\n' + (e.faltam || ['Extratos bancários']).map(function(t){ return '• ' + t; }).join('\n') + '\n\nVocê pode responder este e-mail com os arquivos.\n\nAraújo & Castro Advocacia';
    if (e.origem === 'lembrete_parcela') return 'Olá,\n\nLembrete: a parcela do parcelamento vence em breve. Se já pagou, desconsidere.\n\nAraújo & Castro Advocacia';
    return 'Olá, ' + c.nome + '.\n\n…\n\nAraújo & Castro Advocacia';
  }
  // ROMPEX D/G: conferir antes de enviar (destinatário, anexo, valor e vencimento lidos do PDF)
  APP.revisarEmail = function(e){
    var c = APP.cli(e.cli), pode = e.status === 'revisar' || e.status === 'agendado';
    function checas(){ return N.checagens(e).map(function(k){ return '<div class="' + (k.ok ? 'ok' : k.av ? 'av' : 'er') + '">' + ic(k.ok ? 'ok' : 'alerta') + '<span>' + esc(k.txt) + '</span></div>'; }).join(''); }
    var temAnexo = !!(e.anexo || e.parcela);
    var J = APP.janela({ larga:true, kick:pode ? 'Revisar antes de enviar' : 'E-mail ' + (ST_EMAIL[e.status] || ['', e.status])[1].toLowerCase(), tit:e.assunto, sub:esc(c.nome) + ' · ' + esc(APP.grupo(c.g).nome),
      dir:'<span class="pill ' + (ST_EMAIL[e.status] || ['p-n'])[0] + '">' + (ST_EMAIL[e.status] || ['', e.status])[1] + '</span>',
      corpo:'<div class="bloco"><h3>Conferência automática</h3><div class="checa" id="re-checa">' + checas() + '</div></div>'
        + '<div class="dois"><div class="campo"><label for="re-para">Para</label><input class="ctl" id="re-para" value="' + esc(e.para || '') + '"' + (pode ? '' : ' disabled') + '><span class="ajuda">Cadastrados: ' + esc([c.email, c.fiscal].filter(Boolean).join(' · ') || 'nenhum') + '</span></div>'
        + '<div class="campo"><label for="re-ass">Assunto</label><input class="ctl" id="re-ass" value="' + esc(e.assunto) + '"' + (pode ? '' : ' disabled') + '></div></div>'
        + '<div class="campo"><label for="re-tx">Texto</label><textarea class="ctl" id="re-tx" rows="9"' + (pode ? '' : ' disabled') + '>' + esc(textoEmail(e)) + '</textarea></div>'
        + (temAnexo ? '<div class="bloco"><h3>Anexo</h3>' + (e.anexo ? '<div class="anexo">' + ic('clipe') + '<span><b>' + esc(e.anexo.nome) + '</b> · valor lido ' + (e.anexo.valor != null ? brl(e.anexo.valor) : '—') + ' · vencimento lido ' + (e.anexo.venc ? APP.fd(e.anexo.venc) : '—') + '</span></div>' : '<div class="anexo">' + ic('alerta') + '<span>Sem PDF anexado. Abra a parcela e use <b>Emitir</b> para anexar a guia.</span></div>')
          + (pode ? '<label class="par" style="gap:8px;cursor:pointer"><input type="checkbox" id="re-conferi"> <span>Abri o anexo e conferi: é a guia certa, deste cliente, com o valor e o vencimento certos.</span></label>' : '') + '</div>' : ''),
      rodape:(pode ? '<button class="bt bt-g esq" type="button" id="re-desc" style="color:var(--red)">Descartar</button><button class="bt bt-o" type="button" id="re-salvar">Salvar alterações</button><button class="bt bt-p" type="button" id="re-env">' + ic('email') + 'Enviar agora</button>'
        : '<button class="bt bt-o" type="button" data-fechar>Fechar</button>') });
    if (!pode) return;
    function ler(){ return { para:J.q('#re-para').value.trim(), assunto:J.q('#re-ass').value.trim(), texto:J.q('#re-tx').value }; }
    J.q('#re-para').oninput = function(){ var v = e.para; e.para = this.value.trim(); J.q('#re-checa').innerHTML = checas(); e.para = v; };
    J.q('#re-salvar').onclick = function(){ var d = ler(); J.fechar(); APP.acao('E-mail salvo.', function(){ var f = APP.foto(e, ['para', 'assunto', 'texto']); Object.assign(e, d); return f; }); };
    J.q('#re-desc').onclick = function(){ APP.confirmar({ kick:'Descartar', tit:'Descartar este e-mail?', perigo:true, ok:'Descartar', resumo:'<span>Ele não será enviado. Dá para desfazer por alguns segundos.</span>' }).then(function(s){ if (!s) return; J.fechar();
      APP.acao('E-mail descartado.', function(){ var f = APP.foto(e, ['status']); e.status = 'descartado'; return f; }); }); };
    J.q('#re-env').onclick = function(){
      var d = ler(), ant = APP.foto(e, ['para', 'assunto', 'texto']); Object.assign(e, d);
      var erros = N.checagens(e).filter(function(k){ return k.ok === false; }); ant();
      if (temAnexo && !J.q('#re-conferi').checked){ APP.aviso('Marque "Abri o anexo e conferi" antes de enviar.'); J.q('#re-conferi').focus(); return; }
      APP.confirmar({ kick:'Confirmar envio', tit:'Enviar para ' + (d.para || '(sem destinatário)') + '?', ok:erros.length ? 'Enviar mesmo assim' : 'Enviar', perigo:!!erros.length,
        resumo:'<b>' + esc(d.assunto) + '</b>' + (erros.length ? erros.map(function(k){ return '<span style="color:var(--red)">' + esc(k.txt) + '</span>'; }).join('') : '<span>Tudo conferido.</span>') })
        .then(function(s){ if (!s) return; if (!d.para) return APP.aviso('Sem destinatário: não dá para enviar.'); J.fechar();
          APP.acao('E-mail enviado para ' + d.para + '.', function(){ var f = APP.foto(e, ['para', 'assunto', 'texto']); Object.assign(e, d); var v = enviar(e); return function(){ v(); f(); }; }); });
    };
  };

  /* ═════════ CLIENTES ═════════ */
  APP.cfgClientes = function(id, lista, titulo){
    return { id:id, titulo:titulo, linhas:lista, unidade:['cliente','clientes'], ord:{ k:'g', dir:1 }, dicaBusca:'Nome, CPF/CNPJ ou e-mail',
      busca:function(c){ return c.nome + ' ' + c.doc + ' ' + c.doc.replace(/\D/g, '') + ' ' + c.email + ' ' + c.fiscal; },
      listas:[{ k:'g', rot:'Grupo', todos:'Todos os grupos', opcoes:D().grupos.map(function(g){ return [g.id, g.nome]; }), get:function(c){ return c.g; } },
        { k:'email', rot:'E-mails', todos:'Recebe e não recebe e-mails', opcoes:[['sim','Recebe e-mails'],['nao','Não recebe']], get:function(c){ return c.recebeEmail !== false ? 'sim' : 'nao'; } },
        { k:'sit', rot:'Situação', todos:'Com e sem atraso', opcoes:[['atr','Com parcela em atraso'],['dia','Em dia']], get:function(c){ return atrasoCli(c) ? 'atr' : 'dia'; } }],
      colunas:[{ k:'g', rot:'Grupo', html:function(c){ return APP.grupoTxt(c.g); }, ord:function(c){ return APP.grupo(c.g).nome + c.nome; } },
        { k:'nome', rot:'Cliente', html:function(c){ return APP.celEmpresa(c); }, ord:function(c){ return c.nome; } },
        { k:'email', rot:'E-mail', html:function(c){ return c.email ? esc(c.email) + (c.fiscal ? '<span class="doc">fiscal: ' + esc(c.fiscal) + '</span>' : '') : '<span class="traco">— sem e-mail —</span>'; } },
        { k:'pa', rot:'Parcelamentos', cls:'cen dt', html:function(c){ return D().parcelamentos.filter(function(p){ return p.cli === c.id; }).length || '—'; }, ord:function(c){ return D().parcelamentos.filter(function(p){ return p.cli === c.id; }).length; } },
        { k:'atr', rot:'Situação', cls:'cen', html:function(c){ var a = atrasoCli(c); return a ? '<span class="n-atr">' + APP.plural(a, 'parcela', 'parcelas') + ' em atraso</span>' : '<span class="pill p-g">Em dia</span>'; }, ord:atrasoCli },
        { k:'rec', rot:'Recebe e-mails', cls:'cen', html:function(c){ return '<button class="chave" type="button" role="switch" aria-checked="' + (c.recebeEmail !== false) + '" data-recebe="' + c.id + '" aria-label="Recebe e-mails"></button>'; }, ord:function(c){ return c.recebeEmail !== false ? 1 : 0; } }],
      clique:APP.fichaCliente };
  };
  function atrasoCli(c){ return D().parcelas.filter(function(x){ return !x.pago && x.venc <= HOJE && N.pa(x.pa).cli === c.id; }).length; }
  document.addEventListener('click', function(e){ var b = e.target.closest('[data-recebe]'); if (!b) return; e.stopPropagation(); var c = APP.cli(b.dataset.recebe), novo = c.recebeEmail === false;
    APP.acao(primeiro(c) + (novo ? ' volta a receber e-mails.' : ' não recebe mais e-mails (nenhuma automação ao cliente roda).'), function(){ var f = APP.foto(c, ['recebeEmail']); c.recebeEmail = novo; return f; }); }, true);

  APP.registrar('clientes', { tit:'Clientes', ic:'pessoas', sec:'Cadastros',
    ajuda:['Clique no cliente para abrir a <b>ficha</b>: resumo, <b>linha do tempo</b> (tudo o que aconteceu), <b>automações do cliente</b> e documentos do mês.', 'A chave "Recebe e-mails" desliga de uma vez tudo o que sai para o cliente.'],
    desenhar:function(el){
      var C = D().clientes, semEmail = C.filter(function(c){ return !c.email; }), naoRec = C.filter(function(c){ return c.recebeEmail === false; });
      var ref = HOJE, faltam = Object.keys(D().docsCliente).filter(function(cid){ return N.docsFaltando(cid, ref).length; });
      el.innerHTML = APP.cabecalho({ ic:'pessoas', tit:'Clientes', frase:'Empresas e pessoas atendidas, por grupo' })
        + '<div id="cl-cartoes"></div><div id="cl-tabela"></div>';
      APP.cartoes(APP.$('cl-cartoes'), 'cli', [
        { id:'tot', cor:'b', ic:'pessoas', rot:'Clientes', v:String(C.length), sub:APP.plural(D().grupos.length, 'grupo', 'grupos'), det:function(c){ var gs = D().grupos.map(function(g){ return { id:g.id, g:g, n:C.filter(function(x){ return x.g === g.id; }).length }; });
          APP.tabela(c, { id:'cl-d-g', titulo:'Clientes por grupo', linhas:gs, unidade:['grupo','grupos'], ord:{ k:'g', dir:1 }, colunas:[{ k:'g', rot:'Grupo', html:function(r){ return APP.grupoTxt(r.id); }, ord:function(r){ return r.g.nome; } }, { k:'n', rot:'Clientes', cls:'cen dt', html:function(r){ return r.n; } }, { k:'resp', rot:'Responsável', html:function(r){ return esc(APP.pessoa(r.g.resp).curto); } }],
            clique:function(r){ APP.estTab.clientes = APP.estTab.clientes || { aba:'', q:'', listas:{}, vde:'', vate:'', min:'', max:'', ord:{ k:'g', dir:1 }, ordAba:{}, sel:{}, painel:false }; APP.estTab.clientes.listas.g = r.id; APP.redesenhar(); } }); } },
        { id:'sem', cor:'a', ic:'email', rot:'Sem e-mail ou sem envio', v:String(semEmail.length + naoRec.filter(function(c){ return c.email; }).length), sub:semEmail.length + ' sem e-mail · ' + naoRec.length + ' não recebem', det:function(c){ APP.tabela(c, APP.cfgClientes('cl-d-sem', C.filter(function(x){ return !x.email || x.recebeEmail === false; }), 'Clientes que não recebem nada por e-mail')); } },
        { id:'docs', cor:'a', ic:'clipe', rot:'Documentos de ' + N.mesNome(new Date(2026, 8, 1)).split('/')[0], v:String(faltam.length), sub:'clientes com documento faltando', det:function(c){ APP.tabela(c, cfgDocs('cl-d-docs', new Date(2026, 8, 1), 'Documentos de setembro')); } }
      ]);
      APP.tabela(APP.$('cl-tabela'), APP.cfgClientes('clientes', C, 'Todos os clientes'));
    } });

  /* ── ficha do cliente (janela no centro, com abas) ── */
  APP.fichaCliente = function(c, aba){
    aba = aba || 'resumo';
    var abas = [['resumo','Resumo'],['tempo','Linha do tempo'],['auto','Automações do cliente'],['docs','Documentos do mês']];
    var J = APP.janela({ larga:true, kick:APP.grupo(c.g).nome, tit:c.nome, sub:'<span class="m" style="font-family:var(--mono)">' + esc(c.doc) + '</span> · ' + (c.tipo === 'PF' ? 'Pessoa física' : 'Pessoa jurídica'),
      dir:c.recebeEmail === false ? '<span class="pill p-n">Não recebe e-mails</span>' : '',
      abas:abas.map(function(a){ return '<button class="aba" type="button" data-fa="' + a[0] + '" aria-selected="' + (a[0] === aba) + '">' + a[1] + '</button>'; }).join(''),
      corpo:'<div id="fc-corpo"></div>', rodape:'<button class="bt bt-g esq" type="button" id="fc-editar">Editar cadastro</button><button class="bt bt-o" type="button" data-fechar>Fechar</button>' });
    function pintar(){ J.el.querySelectorAll('[data-fa]').forEach(function(b){ b.setAttribute('aria-selected', b.dataset.fa === aba); }); var el = J.q('#fc-corpo'); ({ resumo:fResumo, tempo:fTempo, auto:fAuto, docs:fDocs })[aba](el, c, J); }
    J.q('.j-abas').onclick = function(e){ var b = e.target.closest('[data-fa]'); if (b){ aba = b.dataset.fa; pintar(); } };
    J.q('#fc-editar').onclick = function(){ editarCliente(c); };
    pintar();
    APP._fc = { c:c, J:J, aba:function(){ return aba; } };
    J.aoFechar = function(){ APP._fc = null; };
  };
  var redesenharAntes = APP.redesenhar;
  APP.redesenhar = function(){ redesenharAntes(); if (APP._fc && document.body.contains(APP._fc.J.el)){ var f = APP._fc, a = f.aba(); f.J.fechar(); APP.fichaCliente(f.c, a); } };

  function fResumo(el, c){
    var pas = D().parcelamentos.filter(function(p){ return p.cli === c.id; }), hon = D().honorarios.filter(function(h){ return h.cli === c.id; });
    var atr = atrasoCli(c), falta = pas.reduce(function(s, p){ return s + N.resumo(p).falta; }, 0), honAtr = hon.filter(function(h){ return !h.rec && h.venc <= HOJE; });
    el.innerHTML = '<div class="ficha"><div><span>E-mail</span><b>' + esc(c.email || '—') + '</b></div><div><span>E-mail fiscal</span><b>' + esc(c.fiscal || '—') + '</b></div><div><span>Telefone</span><b>' + esc(c.tel || '—') + '</b></div><div><span>Responsável</span><b>' + esc(APP.pessoa(APP.grupo(c.g).resp).curto) + '</b></div></div>'
      + '<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">' + [['Parcelamentos', String(pas.length), ''], ['Parcelas em atraso', atr ? String(atr) : 'nenhuma', atr ? 'r' : 'g'], ['Falta pagar (parcelamentos)', brl(falta), ''], ['Honorários em atraso', honAtr.length ? brl(honAtr.reduce(function(s, h){ return s + h.v; }, 0)) : 'nenhum', honAtr.length ? 'r' : 'g']]
        .map(function(k){ return '<div class="kpi" style="cursor:default"><div class="kpi-tx"><div class="l" style="padding:0">' + k[0] + '</div><div class="v ' + k[2] + '" style="font-size:15px">' + k[1] + '</div></div></div>'; }).join('') + '</div>'
      + '<div id="fc-pas"></div><div id="fc-hon"></div>';
    if (pas.length) APP.tabela(el.querySelector('#fc-pas'), { id:'fc-pas-' + c.id, titulo:'Parcelamentos', linhas:pas, unidade:['parcelamento','parcelamentos'], ord:{ k:'nat', dir:1 }, semBarra:true, valor:function(pa){ return N.resumo(pa).falta; },
      colunas:[{ k:'plat', rot:'Plataforma', html:function(pa){ return '<span class="plat">' + pa.plat + '</span>'; } }, { k:'nat', rot:'Natureza', html:function(pa){ return esc(pa.nat); } }, { k:'num', rot:'Nº', cls:'num', html:function(pa){ return pa.num; } },
        { k:'pg', rot:'Pagas', html:function(pa){ var r = N.resumo(pa); return r.pg + ' de ' + pa.tot; }, ord:function(pa){ return N.resumo(pa).pg; } }, { k:'falta', rot:'Falta pagar', cls:'dir val', soma:true, html:function(pa){ return brl(N.resumo(pa).falta); }, ord:function(pa){ return N.resumo(pa).falta; } },
        { k:'atr', rot:'Situação', cls:'cen', html:function(pa){ var a = N.resumo(pa).atr; return a ? '<span class="n-atr">' + APP.plural(a, 'parcela', 'parcelas') + ' em atraso</span>' : '<span class="pill p-g">Em dia</span>'; }, ord:function(pa){ return N.resumo(pa).atr; } }],
      clique:function(pa){ APP.janelaParcelamento(pa); } });
    if (hon.length){ var cfg = APP.cfgHonorarios('fc-hon-' + c.id, hon.filter(function(h){ return !h.rec; }), 'Honorários em aberto'); cfg.semBarra = true; cfg.colunas = cfg.colunas.filter(function(k){ return k.k !== 'g' && k.k !== 'cli'; }); cfg.altura = '260px'; APP.tabela(el.querySelector('#fc-hon'), cfg); }
  }

  // E5: linha do tempo com filtro por tipo
  var TIPOS_TEMPO = { pagamento:['check','Pagamentos','g'], guia:['doc','Guias','b'], atraso:['alerta','Atrasos','r'], email:['email','E-mails','b'], tarefa:['tarefa','Tarefas','a'], documento:['clipe','Documentos','a'] };
  var tiposOn = null;
  function fTempo(el, c){
    var L = N.linhaDoTempo(c.id); tiposOn = tiposOn || Object.keys(TIPOS_TEMPO);
    function pintar(){
      var cont = {}; L.forEach(function(ev){ cont[ev.tipo] = (cont[ev.tipo] || 0) + 1; });
      var vis = L.filter(function(ev){ return tiposOn.indexOf(ev.tipo) >= 0; });
      el.innerHTML = '<div class="chips" id="tp-chips" style="flex-wrap:wrap">' + Object.keys(TIPOS_TEMPO).map(function(k){ return '<button class="chip" type="button" data-tp="' + k + '" aria-pressed="' + (tiposOn.indexOf(k) >= 0) + '">' + TIPOS_TEMPO[k][1] + ' <span style="opacity:.7">' + (cont[k] || 0) + '</span></button>'; }).join('') + '</div>'
        + (vis.length ? '<div class="tempo">' + vis.map(function(ev){ var t = TIPOS_TEMPO[ev.tipo]; return '<div class="ev"><span class="q">' + APP.fd(ev.quando) + '</span><span class="ic" style="color:var(--' + { g:'green', b:'blue', r:'red', a:'amber' }[t[2]] + ')">' + ic(t[0]) + '</span><div class="tx"><b>' + esc(ev.tit) + '</b><span>' + esc(ev.sub || '') + '</span></div><span></span></div>'; }).join('') + '</div>'
          : '<div class="vazio"><b>Nada neste filtro</b><p>Ligue outros tipos acima.</p></div>');
      el.querySelector('#tp-chips').onclick = function(e){ var b = e.target.closest('[data-tp]'); if (!b) return; var k = b.dataset.tp, i = tiposOn.indexOf(k); if (i >= 0) tiposOn.splice(i, 1); else tiposOn.push(k); pintar(); };
    }
    pintar();
  }

  // automações do cliente: Padrão / Desligado / Personalizado (dias e hora próprios)
  function fAuto(el, c, J){
    var autos = D().automacoes.filter(function(a){ return a.grupo === 'cliente'; }), rasc = clone(D().porCliente[c.id]);
    function pintar(){
      el.innerHTML = (c.recebeEmail === false ? '<div class="checa"><div class="er">' + ic('alerta') + '<span>Este cliente está marcado para <b>não receber e-mails</b>: nenhuma automação abaixo roda para ele, seja qual for o modo.</span></div></div>' : '')
        + '<p style="margin:0;color:var(--text3)">"Padrão" segue a regra geral (Administração → Automações). "Personalizado" usa dias e hora só deste cliente.</p>'
        + '<div class="quadro"><div class="rola livre"><table class="tab"><thead><tr><th>Automação</th><th>Regra geral</th><th>Para este cliente</th><th>Dias</th><th>Hora</th><th class="cen">Situação</th></tr></thead><tbody>'
        + autos.map(function(a){ var o = rasc[a.id] || { modo:'padrao' }, pers = o.modo === 'personalizado', temDias = a.dias != null, temHora = !!a.hora;
          var ef = (function(){ var g = D().porCliente[c.id]; D().porCliente[c.id] = rasc; var r = N.regra(a.id, c.id); D().porCliente[c.id] = g; return r; })();
          return '<tr><td><b style="font-weight:600;color:var(--ink)">' + esc(a.nome) + '</b><span class="doc">' + esc(a.ref) + '</span></td><td>' + esc(APP.quandoAuto(a)) + (a.ligada ? '' : ' <span class="pill p-n">desligada</span>') + '</td>'
            + '<td>' + sel('', MODOS, o.modo, 'data-am="' + a.id + '" aria-label="Modo"') + '</td>'
            + '<td>' + (temDias ? '<input class="ctl" style="width:70px" inputmode="numeric" data-ad="' + a.id + '" value="' + (pers && o.dias != null ? o.dias : a.dias) + '"' + (pers ? '' : ' disabled') + ' aria-label="Dias">' : '<span class="traco">—</span>') + '</td>'
            + '<td>' + (temHora ? '<input class="ctl" style="width:112px" type="time" data-ah="' + a.id + '" value="' + (pers && o.hora ? o.hora : a.hora) + '"' + (pers ? '' : ' disabled') + ' aria-label="Hora">' : '<span class="traco">—</span>') + '</td>'
            + '<td class="cen">' + (ef.ligada ? '<span class="pill p-g">Roda</span>' : '<span class="pill p-n" title="' + esc(ef.motivo) + '">Não roda</span>') + '</td></tr>'; }).join('')
        + '</tbody></table></div></div><div id="fc-prox"></div>'
        + '<div class="par" style="justify-content:flex-end"><button class="bt bt-p" type="button" id="fa-salvar">' + ic('check') + 'Salvar automações do cliente</button></div>';
      var prox = N.proximas(45).filter(function(p){ return p.cli === c.id; });
      APP.tabela(el.querySelector('#fc-prox'), Object.assign(APP.cfgProximas('fc-prox-' + c.id, prox, 'Próximas execuções para este cliente (45 dias)'), { altura:'260px' }));
      el.querySelector('#fa-salvar').onclick = function(){ var novo = clone(rasc);
        APP.acao('Automações de ' + primeiro(c) + ' salvas.', function(){ var ant = D().porCliente[c.id]; D().porCliente[c.id] = novo; return function(){ if (ant) D().porCliente[c.id] = ant; else delete D().porCliente[c.id]; }; }); };
    }
    el.onchange = function(e){ var t = e.target, id = t.dataset.am || t.dataset.ad || t.dataset.ah; if (!id) return; var o = rasc[id] = rasc[id] || { modo:'padrao' };
      if (t.dataset.am){ o.modo = t.value; if (o.modo === 'personalizado'){ var a = N.auto(id); if (o.dias == null && a.dias != null) o.dias = a.dias; if (!o.hora && a.hora) o.hora = a.hora; } pintar(); }
      else if (t.dataset.ad) o.dias = parseInt(t.value, 10) || 0; else o.hora = t.value; };
    pintar();
  }

  // documentos do mês do cliente
  function fDocs(el, c){
    var tipos = D().docsCliente[c.id];
    if (!tipos){ el.innerHTML = '<div class="vazio"><b>Este cliente não manda documentos todo mês</b><p>Escolha o que ele deve mandar para o sistema cobrar sozinho no dia ' + N.auto('docs_mes').diaMes + '.</p><button class="bt bt-o" type="button" id="fd-ativar">' + ic('mais') + 'Escolher documentos</button></div>';
      el.querySelector('#fd-ativar').onclick = function(){ janelaTiposDoc(c); }; return; }
    var meses = [new Date(2026, 7, 1), new Date(2026, 8, 1), new Date(2026, 9, 1)];
    el.innerHTML = '<div class="quadro"><div class="rola livre"><table class="tab"><thead><tr><th>Documento</th>' + meses.map(function(m){ return '<th class="cen">' + N.mesNome(m) + '</th>'; }).join('') + '</tr></thead><tbody>'
      + tipos.map(function(t){ return '<tr><td>' + esc(D().tiposDoc[t]) + '</td>' + meses.map(function(m){ var rec = D().docsRecebidos[c.id + '|' + N.comp(m)] || [];
        return '<td class="cen">' + (rec.indexOf(t) >= 0 ? '<span class="ok-txt">✓ Recebido</span>' : m.getMonth() === 9 ? '<span class="em nao">Em aberto</span>' : '<span class="n-atr">Faltando</span>') + '</td>'; }).join('') + '</tr>'; }).join('')
      + '</tbody></table></div></div><div class="par"><button class="bt bt-o" type="button" id="fd-rec">' + ic('check') + 'Marcar recebidos</button><button class="bt bt-o" type="button" id="fd-pedir">' + ic('email') + 'Pedir ao cliente agora</button><button class="bt bt-g" type="button" id="fd-tipos">Mudar a lista de documentos</button></div>';
    el.querySelector('#fd-rec').onclick = function(){ janelaRecebidos(c, new Date(2026, 8, 1)); };
    el.querySelector('#fd-pedir').onclick = function(){ pedirDocs([c.id], new Date(2026, 8, 1)); };
    el.querySelector('#fd-tipos').onclick = function(){ janelaTiposDoc(c); };
  }
  function janelaTiposDoc(c){
    var at = D().docsCliente[c.id] || [];
    var J = APP.janela({ kick:'Documentos do mês', tit:'O que ' + primeiro(c) + ' manda todo mês', corpo:D().tiposDoc.map(function(t, i){ return '<label class="par" style="gap:8px;cursor:pointer"><input type="checkbox" value="' + i + '"' + (at.indexOf(i) >= 0 ? ' checked' : '') + '> ' + esc(t) + '</label>'; }).join(''),
      rodape:'<button class="bt bt-o" type="button" data-fechar>Cancelar</button><button class="bt bt-p" type="button" id="td-ok">' + ic('check') + 'Salvar</button>' });
    J.q('#td-ok').onclick = function(){ var l = [].map.call(J.el.querySelectorAll('input:checked'), function(i){ return +i.value; }); J.fechar();
      APP.acao('Lista de documentos salva.', function(){ var ant = D().docsCliente[c.id]; if (l.length) D().docsCliente[c.id] = l; else delete D().docsCliente[c.id]; return function(){ if (ant) D().docsCliente[c.id] = ant; else delete D().docsCliente[c.id]; }; }); };
  }
  function janelaRecebidos(c, mes){
    var k = c.id + '|' + N.comp(mes), rec = D().docsRecebidos[k] || [];
    var J = APP.janela({ kick:'Documentos de ' + N.mesNome(mes), tit:'O que chegou de ' + primeiro(c), corpo:(D().docsCliente[c.id] || []).map(function(t){ return '<label class="par" style="gap:8px;cursor:pointer"><input type="checkbox" value="' + t + '"' + (rec.indexOf(t) >= 0 ? ' checked' : '') + '> ' + esc(D().tiposDoc[t]) + '</label>'; }).join(''),
      rodape:'<button class="bt bt-o" type="button" data-fechar>Cancelar</button><button class="bt bt-p" type="button" id="rd-ok">' + ic('check') + 'Salvar</button>' });
    J.q('#rd-ok').onclick = function(){ var l = [].map.call(J.el.querySelectorAll('input:checked'), function(i){ return +i.value; }); J.fechar();
      APP.acao('Documentos de ' + primeiro(c) + ' atualizados.', function(){ var ant = D().docsRecebidos[k]; D().docsRecebidos[k] = l; return function(){ if (ant) D().docsRecebidos[k] = ant; else delete D().docsRecebidos[k]; }; }); };
  }
  function pedirDocs(cids, mes){
    var l = cids.map(function(cid){ var c = APP.cli(cid), falta = (D().docsCliente[cid] || []).filter(function(t){ return (D().docsRecebidos[cid + '|' + N.comp(mes)] || []).indexOf(t) < 0; }); return { c:c, falta:falta }; }).filter(function(x){ return x.falta.length && N.regra('docs_mes', x.c.id).ligada; });
    if (!l.length) return APP.aviso('Nada a pedir: os documentos chegaram ou o cliente não recebe este e-mail.');
    return APP.confirmar({ kick:'Pedir documentos', tit:'Preparar ' + APP.plural(l.length, 'e-mail', 'e-mails') + ' pedindo os documentos de ' + N.mesNome(mes) + '?', ok:'Preparar e-mails',
      resumo:l.map(function(x){ return '<span>' + esc(primeiro(x.c)) + ': ' + esc(x.falta.map(function(t){ return D().tiposDoc[t]; }).join(', ')) + '</span>'; }).join('') + '<span>Ficam na Caixa de saída para revisar antes de sair.</span>' }).then(function(s){ if (!s) return false;
      APP.acao(APP.plural(l.length, 'e-mail pronto', 'e-mails prontos') + ' na Caixa de saída.', function(){ var novos = l.map(function(x, i){ var e = { id:'e' + Date.now() + i, cli:x.c.id, assunto:'Documentos de ' + N.mesNome(mes) + ' — o que ainda falta', para:x.c.fiscal || x.c.email, status:'revisar', origem:'docs_mes', faltam:x.falta.map(function(t){ return D().tiposDoc[t]; }), criado:new Date(), quando:new Date() }; D().emails.push(e); return e; });
        return function(){ novos.forEach(function(e){ D().emails.splice(D().emails.indexOf(e), 1); }); }; });
    });
  }
  function cfgDocs(id, mes, titulo){
    var linhas = Object.keys(D().docsCliente).map(function(cid){ var rec = D().docsRecebidos[cid + '|' + N.comp(mes)] || [], tipos = D().docsCliente[cid]; return { id:cid, c:APP.cli(cid), tipos:tipos, rec:tipos.filter(function(t){ return rec.indexOf(t) >= 0; }), falta:tipos.filter(function(t){ return rec.indexOf(t) < 0; }) }; });
    return { id:id, titulo:titulo, linhas:linhas, unidade:['cliente','clientes'], ord:{ k:'falta', dir:-1 }, busca:function(r){ return r.c.nome; },
      abas:[{ id:'falta', rot:'Faltando', cor:'r', f:function(r){ return r.falta.length; } }, { id:'ok', rot:'Completos', f:function(r){ return !r.falta.length; } }],
      colunas:[{ k:'g', rot:'Grupo', html:function(r){ return APP.grupoTxt(r.c.g); }, ord:function(r){ return APP.grupo(r.c.g).nome; } }, { k:'cli', rot:'Cliente', html:function(r){ return APP.celEmpresa(r.c); }, ord:function(r){ return r.c.nome; } },
        { k:'rec', rot:'Recebidos', cls:'cen dt', html:function(r){ return r.rec.length + ' de ' + r.tipos.length; }, ord:function(r){ return r.rec.length / r.tipos.length; } },
        { k:'falta', rot:'Faltando', html:function(r){ return r.falta.length ? '<span style="color:var(--red)">' + esc(r.falta.map(function(t){ return D().tiposDoc[t]; }).join(', ')) + '</span>' : '<span class="ok-txt">✓ Completo</span>'; }, ord:function(r){ return r.falta.length; } },
        { k:'auto', rot:'Pedido automático', html:function(r){ var g = N.regra('docs_mes', r.id); return g.ligada ? 'Dia ' + N.auto('docs_mes').diaMes + ' às ' + g.hora : '<span class="pill p-n">' + esc(g.motivo) + '</span>'; }, ord:false }],
      lote:[{ rot:'Pedir ao cliente', ic:'email', quando:function(r){ return r.falta.length; }, fn:function(l){ return pedirDocs(l.map(function(r){ return r.id; }), mes); } }],
      clique:function(r){ janelaRecebidos(r.c, mes); } };
  }

  function editarCliente(c){
    var J = APP.janela({ kick:'Editar cadastro', tit:c.nome, corpo:'<div class="campo"><label for="ec-nome">Nome</label><input class="ctl" id="ec-nome" value="' + esc(c.nome) + '"></div>'
      + '<div class="dois"><div class="campo"><label for="ec-email">E-mail</label><input class="ctl" id="ec-email" value="' + esc(c.email) + '"></div><div class="campo"><label for="ec-fiscal">E-mail fiscal (guias)</label><input class="ctl" id="ec-fiscal" value="' + esc(c.fiscal) + '"></div></div>'
      + '<div class="dois"><div class="campo"><label for="ec-tel">Telefone</label><input class="ctl" id="ec-tel" value="' + esc(c.tel) + '"></div><div class="campo"><label for="ec-g">Grupo</label>' + sel('ec-g', D().grupos.map(function(g){ return [g.id, g.nome]; }), c.g) + '</div></div>',
      rodape:'<button class="bt bt-o" type="button" data-fechar>Cancelar</button><button class="bt bt-p" type="button" id="ec-ok">' + ic('check') + 'Salvar</button>' });
    J.q('#ec-ok').onclick = function(){ var d = { nome:J.q('#ec-nome').value.trim() || c.nome, email:J.q('#ec-email').value.trim(), fiscal:J.q('#ec-fiscal').value.trim(), tel:J.q('#ec-tel').value.trim(), g:J.q('#ec-g').value }; J.fechar();
      APP.acao('Cadastro salvo.', function(){ var f = APP.foto(c, ['nome', 'email', 'fiscal', 'tel', 'g']); Object.assign(c, d); return f; }); };
  }

  /* ═════════ ROTINA ═════════ */
  var rotSub = 'hoje';
  APP.registrar('rotina', { tit:'Rotina', ic:'rotina', sec:'Principal',
    ajuda:['<b>Hoje</b>: tarefas do dia e o que as automações fazem hoje. "Rodar as automações agora" faz a varredura que normalmente roda sozinha.', '<b>Guias do mês</b>: emitir (com o PDF), conferir e mandar. O e-mail fica pronto na Caixa de saída.', '<b>Conferência do mês</b> (A6): parcela por parcela, pagou ou não pagou. Conferir tem "Desfazer".', '<b>Documentos do mês</b>: o que cada cliente já mandou da competência; dá para pedir o que falta.'],
    desenhar:function(el, arg){
      if (arg) rotSub = arg;
      var guias = D().parcelas.filter(N.paraEmitir), conf = paraConferir(), docs = Object.keys(D().docsCliente).filter(function(cid){ return N.docsFaltando(cid, HOJE).length; });
      var tar = D().tarefas.filter(function(t){ return !t.feita && t.prazo <= HOJE; });
      el.innerHTML = APP.cabecalho({ ic:'rotina', tit:'Rotina', frase:'O trabalho de todo dia e de todo mês, num lugar só', acoes:'<button class="bt bt-o" type="button" id="rt-rodar">' + ic('raio') + 'Rodar as automações agora</button>' })
        + subAbas('rt-sub', [['hoje','Hoje', tar.length, true], ['guias','Guias do mês', guias.length, true], ['conf','Conferência do mês', conf.filter(function(x){ return !x.conferida; }).length, false], ['docs','Documentos do mês', docs.length, false]], rotSub)
        + '<div id="rt-corpo" style="display:flex;flex-direction:column;gap:16px"></div>';
      APP.$('rt-sub').onclick = function(e){ var b = e.target.closest('[data-sub]'); if (!b) return; rotSub = b.dataset.sub; APP.arg = rotSub; APP.redesenhar(); };
      APP.$('rt-rodar').onclick = rodarAgora;
      var c = APP.$('rt-corpo');
      if (rotSub === 'hoje'){
        c.innerHTML = '<div id="rt-t"></div><div class="sec-cab"><div><h2>O que as automações fazem nos próximos 7 dias</h2><p>Clique numa linha para ver a regra (e mudar para um cliente).</p></div></div><div id="rt-p"></div>';
        APP.tabela(APP.$('rt-t'), APP.cfgTarefas('rt-tarefas', D().tarefas, 'Tarefas', true));
        APP.tabela(APP.$('rt-p'), APP.cfgProximas('rt-prox', N.proximas(7), 'Próximos 7 dias'));
      } else if (rotSub === 'guias'){
        var todas = D().parcelas.filter(function(x){ return !N.pa(x.pa).cliEmite && (x.venc <= HOJE && !x.pago || APP.doMes(x.venc)); });
        var cols = APP.colsParcelas({ semNum:true, emissao:true });
        cols.splice(cols.length - 1, 0, { k:'env', rot:'E-mail', cls:'cen', html:function(x){ var e = D().emails.filter(function(m){ return m.parcela === x.id && m.status !== 'descartado'; }).pop(); if (x.enviada || (e && e.status === 'enviado')) return '<span class="ok-txt">✓ Enviado</span>'; if (e) return '<span class="pill ' + ST_EMAIL[e.status][0] + '" data-abre-email="' + e.id + '" style="cursor:pointer">' + ST_EMAIL[e.status][1] + '</span>'; return x.emitida ? '<span class="em nao">Falta enviar</span>' : '<span class="traco">—</span>'; }, ord:function(x){ return x.enviada ? 2 : x.emitida ? 1 : 0; } });
        APP.tabela(c, { id:'rt-guias', linhas:todas, colunas:cols, unidade:['guia','guias'], ord:{ k:'venc', dir:1 }, busca:function(x){ var cl = N.cliDe(x); return cl.nome + ' ' + cl.doc + ' ' + N.pa(x.pa).num; }, listas:APP.listasParcelas(),
          titulo:function(a){ return { emitir:'Falta emitir (vencidas e de outubro) — prazo dia 12', enviar:'Emitidas, falta mandar ao cliente', prontas:'Emitidas e enviadas' }[a]; },
          abas:[{ id:'emitir', rot:'Falta emitir', cor:'r', f:function(x){ return !x.emitida && !x.pago; } }, { id:'enviar', rot:'Falta enviar', cor:'r', f:function(x){ return x.emitida && !x.enviada && !x.pago; } }, { id:'prontas', rot:'Prontas', f:function(x){ return x.emitida && (x.enviada || x.pago); } }],
          venc:function(x){ return x.venc; }, valor:function(x){ return x.v; }, lote:APP.lotesParcelas(), clique:APP.editarParcela });
      } else if (rotSub === 'conf'){
        var a6 = N.auto('conferencia_mes');
        c.innerHTML = '<div class="texto" style="padding:12px 16px">Todo dia ' + a6.diaMes + ' o sistema cria a tarefa <b>"Conferir os parcelamentos do mês"</b> para ' + esc(APP.pessoa(a6.resp).curto) + ' com esta lista pronta (A6). Confira no eCAC/Regularize/SIARE e marque: <b>pagou</b> (dá baixa, com confirmação) ou <b>conferido</b>.</div><div id="rt-conf"></div>';
        APP.tabela(APP.$('rt-conf'), { id:'rt-conferir', linhas:conf, unidade:['parcela','parcelas'], ord:{ k:'venc', dir:1 }, listas:APP.listasParcelas(), busca:function(x){ return N.cliDe(x).nome + ' ' + N.pa(x.pa).num; },
          titulo:function(a){ return { falta:'Parcelas de setembro e outubro (até hoje) para conferir', ok:'Já conferidas' }[a]; },
          abas:[{ id:'falta', rot:'Para conferir', cor:'r', f:function(x){ return !x.conferida; } }, { id:'ok', rot:'Conferidas', f:function(x){ return !!x.conferida; } }],
          colunas:APP.colsParcelas({ semNum:true }).concat([{ k:'conf', rot:'Conferência', cls:'cen', html:function(x){ return x.conferida ? '<span class="ok-txt">✓ ' + APP.fc(x.conferida) + '</span>' : '<button class="bt-emitir" type="button" data-conferir="' + x.id + '">' + ic('check') + 'Conferido</button>'; }, ord:function(x){ return x.conferida ? +x.conferida : 0; } }]),
          venc:function(x){ return x.venc; }, valor:function(x){ return x.v; },
          lote:[{ rot:'Marcar conferidas', ic:'check', quando:function(x){ return !x.conferida; }, fn:function(l){ APP.acao(APP.plural(l.length, 'parcela conferida', 'parcelas conferidas') + '.', function(){ var v = l.map(function(x){ var f = APP.foto(x, ['conferida']); x.conferida = new Date(HOJE); return f; }); return function(){ v.forEach(function(f){ f(); }); }; }); } }].concat(APP.lotesParcelas().slice(0, 1)),
          clique:APP.editarParcela });
      } else {
        c.innerHTML = '<div class="texto" style="padding:12px 16px">No dia ' + N.auto('docs_mes').diaMes + ' de cada mês, o cliente recebe o pedido dos documentos da competência anterior que ainda não chegaram. Marque o que chegou; peça de novo o que falta (vai para a Caixa de saída, para revisar).</div><div id="rt-docs"></div>';
        APP.tabela(APP.$('rt-docs'), cfgDocs('rt-docs-t', new Date(2026, 8, 1), 'Competência setembro/2026'));
      }
    } });
  function paraConferir(){ var ini = new Date(2026, 8, 1); return D().parcelas.filter(function(x){ return x.venc >= ini && x.venc <= HOJE; }); }
  document.addEventListener('click', function(e){
    var b = e.target.closest('[data-conferir]'); if (b){ e.stopPropagation(); var x = N.parcela(b.dataset.conferir); APP.acao('Parcela conferida.', function(){ var f = APP.foto(x, ['conferida']); x.conferida = new Date(HOJE); return f; }); return; }
    var m = e.target.closest('[data-abre-email]'); if (m){ e.stopPropagation(); APP.revisarEmail(D().emails.find(function(x){ return x.id === m.dataset.abreEmail; })); }
  }, true);
  function rodarAgora(){
    var novas = N.varrerRiscos(), a6 = N.auto('conferencia_mes');
    if (a6.ligada && !D().tarefas.some(function(t){ return t.origem === 'conferencia_mes' && APP.doMes(t.prazo); })){ var t6 = { id:'t' + Date.now() + 'c', tit:'Conferir os parcelamentos de ' + N.mesNome(HOJE).split('/')[0], resp:a6.resp, prazo:new Date(HOJE), origem:'conferencia_mes', feita:null }; D().tarefas.push(t6); novas.push(t6); }
    if (!novas.length) return APP.aviso('Automações rodadas: nada novo (as tarefas de risco e de conferência já existem).');
    APP.acao('Automações rodadas: ' + APP.plural(novas.length, 'tarefa nova', 'tarefas novas') + '.', function(){ return function(){ novas.forEach(function(t){ D().tarefas.splice(D().tarefas.indexOf(t), 1); }); }; });
  }

  /* ═════════ ADMINISTRAÇÃO ═════════ */
  var admSub = 'auto';
  APP.registrar('admin', { tit:'Administração', ic:'admin', sec:'Sistema',
    ajuda:['<b>Automações</b>: cada uma diz quando roda e para quem. Clique para mudar a hora, os dias ou desligar para um cliente específico.', '<b>Caixa de saída</b>: tudo o que vai sair por e-mail. O sistema confere destinatário, anexo, valor e vencimento antes de enviar.', '<b>Importações</b>: cada planilha importada fica registrada e pode ser revertida.', '<b>Ambiente de teste</b>: como passamos as mudanças daqui para o ERP de verdade.'],
    desenhar:function(el, arg){
      if (arg) admSub = arg;
      var rev = D().emails.filter(function(e){ return e.status === 'revisar'; }).length;
      el.innerHTML = APP.cabecalho({ ic:'admin', tit:'Administração', frase:'Automações, e-mails, importações e o próprio ambiente de teste' })
        + subAbas('adm-sub', [['auto','Automações'], ['saida','Caixa de saída', rev, true], ['imp','Importações'], ['nov','Novidades'], ['amb','Ambiente de teste']], admSub)
        + '<div id="adm-corpo" style="display:flex;flex-direction:column;gap:16px"></div>';
      APP.$('adm-sub').onclick = function(e){ var b = e.target.closest('[data-sub]'); if (!b) return; admSub = b.dataset.sub; APP.arg = admSub; APP.redesenhar(); };
      ({ auto:admAuto, saida:admSaida, imp:admImp, nov:admNov, amb:admAmb })[admSub](APP.$('adm-corpo'));
    } });

  function admAuto(el){
    el.innerHTML = '<div id="aa-t"></div><div class="sec-cab"><div><h2>Calendário das automações (14 dias)</h2><p>Tudo o que vai acontecer, com data, hora e destinatário. "Não vai" mostra o motivo.</p></div></div><div id="aa-p"></div>';
    APP.tabela(APP.$('aa-t'), { id:'adm-autos', titulo:'Automações', linhas:D().automacoes, unidade:['automação','automações'], ord:{ k:'grupo', dir:1 }, busca:function(a){ return a.nome + ' ' + a.o; },
      listas:[{ k:'grupo', rot:'Para quem', todos:'Equipe e clientes', opcoes:[['equipe','Para a equipe'],['cliente','Para o cliente']], get:function(a){ return a.grupo; } }],
      colunas:[{ k:'nome', rot:'Automação', html:function(a){ return '<b style="font-weight:600;color:var(--ink)">' + esc(a.nome) + '</b><span class="doc" style="font-family:var(--font);white-space:normal">' + esc(a.o) + '</span>'; }, ord:function(a){ return a.nome; } },
        { k:'grupo', rot:'Para quem', html:function(a){ return a.grupo === 'cliente' ? 'Cliente' : 'Equipe'; } },
        { k:'quando', rot:'Quando roda', html:function(a){ return esc(APP.quandoAuto(a)); }, ord:false },
        { k:'exc', rot:'Exceções', cls:'cen', html:function(a){ var n = excecoes(a).length; return a.grupo !== 'cliente' ? '<span class="traco">—</span>' : n ? APP.plural(n, 'cliente', 'clientes') : 'nenhuma'; }, ord:function(a){ return excecoes(a).length; } },
        { k:'ref', rot:'Código', cls:'cen', html:function(a){ return '<span class="plat">' + esc(a.ref) + '</span>'; } },
        { k:'lig', rot:'Ligada', cls:'cen', html:function(a){ return '<button class="chave" type="button" role="switch" aria-checked="' + a.ligada + '" data-liga="' + a.id + '" aria-label="Ligada"></button>'; }, ord:function(a){ return a.ligada ? 1 : 0; } }],
      clique:function(a){ APP.janelaAutomacao(a); } });
    APP.tabela(APP.$('aa-p'), APP.cfgProximas('adm-prox', N.proximas(14), 'Próximos 14 dias'));
  }
  document.addEventListener('click', function(e){ var b = e.target.closest('[data-liga]'); if (!b) return; e.stopPropagation(); var a = N.auto(b.dataset.liga), novo = !a.ligada;
    if (novo) return APP.acao('"' + a.nome + '" ligada.', function(){ var f = APP.foto(a, ['ligada']); a.ligada = true; return f; });
    APP.confirmar({ kick:'Desligar automação', tit:'Desligar "' + a.nome + '" para todos?', perigo:true, ok:'Desligar', resumo:'<span>' + esc(a.o) + '</span><span>Para desligar só para um cliente, abra a automação e mude o cliente para "Desligado".</span>' })
      .then(function(s){ if (s) APP.acao('"' + a.nome + '" desligada.', function(){ var f = APP.foto(a, ['ligada']); a.ligada = false; return f; }); }); }, true);

  // janela da automação: a regra geral + a exceção de cada cliente + as próximas execuções
  APP.janelaAutomacao = function(a, cliId){
    var r = clone(a), pc = {}; D().clientes.forEach(function(c){ pc[c.id] = clone(((D().porCliente[c.id] || {})[a.id]) || { modo:'padrao' }); });
    var campos = '';
    if (a.hora != null) campos += '<div class="campo"><label for="ja-hora">Hora</label><input class="ctl" id="ja-hora" type="time" value="' + a.hora + '"></div>';
    if (a.dias != null) campos += '<div class="campo"><label for="ja-dias">' + (a.id === 'cobranca_honorario' ? 'Dias depois do vencimento' : 'Dias antes do vencimento') + '</label><input class="ctl" id="ja-dias" inputmode="numeric" value="' + a.dias + '"></div>';
    if (a.diaMes != null) campos += '<div class="campo"><label for="ja-dm">Dia do mês</label><input class="ctl" id="ja-dm" inputmode="numeric" value="' + a.diaMes + '"></div>';
    if (a.limite != null) campos += '<div class="campo"><label for="ja-lim">Parcelas em atraso para avisar</label><input class="ctl" id="ja-lim" inputmode="numeric" value="' + a.limite + '"></div>';
    if (a.resp) campos += '<div class="campo"><label for="ja-resp">Quem recebe a tarefa</label>' + sel('ja-resp', D().equipe.map(function(p){ return [p.id, p.curto]; }), a.resp) + '</div>';
    var extra = '';
    if (a.modo) extra += '<div class="campo"><span class="rot">Depois de emitir</span>' + APP.opcoes('Modo', ['Fica para revisar', 'Envia sozinho'], a.modo === 'enviar' ? 'Envia sozinho' : 'Fica para revisar') + '<span class="ajuda">"Fica para revisar" é o mais seguro: ninguém recebe nada sem alguém conferir.</span></div>';
    if (a.quem) extra += '<div class="campo"><span class="rot">Quem recebe</span><div class="par" style="flex-wrap:wrap;gap:14px">' + D().equipe.map(function(p){ return '<label class="par" style="gap:6px;cursor:pointer"><input type="checkbox" data-quem="' + p.id + '"' + (a.quem.indexOf(p.id) >= 0 ? ' checked' : '') + '> ' + esc(p.curto) + '</label>'; }).join('') + '</div><label class="par" style="gap:6px;cursor:pointer"><input type="checkbox" id="ja-uteis"' + (a.uteis ? ' checked' : '') + '> Só em dias úteis</label></div>';
    var J = APP.janela({ larga:true, kick:'Automação ' + a.ref, tit:a.nome, sub:esc(a.o), dir:'<button class="chave" type="button" role="switch" id="ja-lig" aria-checked="' + a.ligada + '" aria-label="Ligada"></button>',
      corpo:'<div class="bloco"><h3>Regra geral</h3>' + (campos ? '<div class="tres">' + campos + '</div>' : '<p style="margin:0;color:var(--text3)">Esta automação roda no momento da ação (não tem hora marcada).</p>') + extra + '</div>'
        + (a.grupo === 'cliente' ? '<div class="bloco"><h3>Para cada cliente</h3><p style="margin:0;color:var(--text3)">Deixe "Padrão" para seguir a regra geral. "Personalizado" usa dias e hora só daquele cliente; "Desligado" não manda nada para ele.</p><div id="ja-cli"></div></div>' : '')
        + '<div class="bloco"><h3>Próximas execuções</h3><div id="ja-prox"></div></div>',
      rodape:'<button class="bt bt-o" type="button" data-fechar>Cancelar</button><button class="bt bt-p" type="button" id="ja-ok">' + ic('check') + 'Salvar</button>' });
    J.q('#ja-lig').onclick = function(){ var on = this.getAttribute('aria-checked') !== 'true'; this.setAttribute('aria-checked', on); r.ligada = on; };
    function linhasCli(){ return D().clientes.map(function(c){ return { id:c.id, c:c }; }); }
    function pintarCli(){
      var el = J.q('#ja-cli'); if (!el) return;
      APP.tabela(el, { id:'ja-cli-' + a.id, linhas:linhasCli(), unidade:['cliente','clientes'], ord:{ k:'g', dir:1 }, busca:function(x){ return x.c.nome + ' ' + x.c.doc; }, altura:'300px', livre:false,
        abas:[{ id:'todos', rot:'Todos', f:function(){ return true; } }, { id:'exc', rot:'Com exceção', f:function(x){ return pc[x.id].modo !== 'padrao'; } }], abaPadrao:cliId ? 'todos' : 'todos',
        colunas:[{ k:'g', rot:'Grupo', html:function(x){ return APP.grupoTxt(x.c.g); }, ord:function(x){ return APP.grupo(x.c.g).nome + x.c.nome; } },
          { k:'nome', rot:'Cliente', html:function(x){ return APP.celEmpresa(x.c) + (x.id === cliId ? ' <span class="tag-auto">este</span>' : ''); }, ord:function(x){ return x.c.nome; } },
          { k:'modo', rot:'Modo', html:function(x){ return sel('', MODOS, pc[x.id].modo, 'data-jm="' + x.id + '" aria-label="Modo"'); }, ord:function(x){ return pc[x.id].modo; } },
          { k:'dias', rot:'Dias', html:function(x){ var o = pc[x.id]; return a.dias != null ? '<input class="ctl" style="width:64px" inputmode="numeric" data-jd="' + x.id + '" value="' + (o.modo === 'personalizado' && o.dias != null ? o.dias : r.dias) + '"' + (o.modo === 'personalizado' ? '' : ' disabled') + ' aria-label="Dias">' : '<span class="traco">—</span>'; }, ord:false },
          { k:'hora', rot:'Hora', html:function(x){ var o = pc[x.id]; return a.hora != null ? '<input class="ctl" style="width:112px" type="time" data-jh="' + x.id + '" value="' + (o.modo === 'personalizado' && o.hora ? o.hora : r.hora) + '"' + (o.modo === 'personalizado' ? '' : ' disabled') + ' aria-label="Hora">' : '<span class="traco">—</span>'; }, ord:false },
          { k:'ef', rot:'Situação', cls:'cen', html:function(x){ var o = pc[x.id]; if (!r.ligada) return '<span class="pill p-n">Desligada para todos</span>'; if (o.modo === 'desligado') return '<span class="pill p-n">Não roda</span>'; if (x.c.recebeEmail === false) return '<span class="pill p-n">Não recebe e-mails</span>'; return '<span class="pill p-g">Roda</span>'; }, ord:false }] });
    }
    var cl = J.q('#ja-cli');
    if (cl){ cl.addEventListener('change', function(e){ var t = e.target, id = t.dataset.jm || t.dataset.jd || t.dataset.jh; if (!id) return; var o = pc[id];
      if (t.dataset.jm){ o.modo = t.value; if (o.modo === 'personalizado'){ if (o.dias == null && r.dias != null) o.dias = r.dias; if (!o.hora && r.hora) o.hora = r.hora; } pintarCli(); }
      else if (t.dataset.jd) o.dias = parseInt(t.value, 10) || 0; else o.hora = t.value; }); pintarCli(); }
    var prox = N.proximas(30).filter(function(p){ return p.auto === a.id && (!cliId || p.cli === cliId || !p.cli); });
    APP.tabela(J.q('#ja-prox'), Object.assign(APP.cfgProximas('ja-prox-' + a.id, prox, cliId ? 'Próximas 30 dias — ' + primeiro(APP.cli(cliId)) : 'Próximos 30 dias'), { altura:'260px', clique:null }));
    if (cliId) setTimeout(function(){ var s = J.el.querySelector('[data-jm="' + cliId + '"]'); if (s){ s.scrollIntoView({ block:'center' }); s.focus(); } }, 80);
    J.q('#ja-ok').onclick = function(){
      var n = function(id){ var i = J.q(id); return i ? parseInt(i.value, 10) : null; };
      if (J.q('#ja-hora')) r.hora = J.q('#ja-hora').value || a.hora; if (J.q('#ja-dias')) r.dias = n('#ja-dias') || 0; if (J.q('#ja-dm')) r.diaMes = Math.min(28, Math.max(1, n('#ja-dm') || 1));
      if (J.q('#ja-lim')) r.limite = Math.max(1, n('#ja-lim') || 1); if (J.q('#ja-resp')) r.resp = J.q('#ja-resp').value;
      if (a.modo) r.modo = APP.opcaoDe(J, 'Modo') === 'Envia sozinho' ? 'enviar' : 'revisar';
      if (a.quem){ r.quem = [].filter.call(J.el.querySelectorAll('[data-quem]'), function(i){ return i.checked; }).map(function(i){ return i.dataset.quem; }); r.uteis = J.q('#ja-uteis').checked; }
      J.fechar();
      APP.acao('Automação "' + a.nome + '" salva.', function(){
        var antA = clone(a), antPC = clone(D().porCliente);
        Object.keys(r).forEach(function(k){ a[k] = r[k]; });
        if (a.grupo === 'cliente') Object.keys(pc).forEach(function(cid){ var o = pc[cid], m = D().porCliente[cid] = D().porCliente[cid] || {}; if (o.modo === 'padrao') delete m[a.id]; else m[a.id] = o; if (!Object.keys(m).length) delete D().porCliente[cid]; });
        return function(){ Object.keys(antA).forEach(function(k){ a[k] = antA[k]; }); D().porCliente = antPC; };
      });
    };
  };

  function admSaida(el){
    el.innerHTML = '<div class="texto" style="padding:12px 16px"><b>Envio seguro:</b> antes de cada envio o sistema confere se o destinatário é do cadastro do cliente, se o PDF está anexado e se o valor e o vencimento lidos do PDF batem com a parcela. Com anexo, é preciso marcar "Abri o anexo e conferi".</div><div id="as-t"></div>';
    APP.tabela(APP.$('as-t'), APP.cfgEmails('caixa', D().emails.filter(function(e){ return e.status !== 'descartado'; }), function(a){ return { revisar:'Prontos para revisar e enviar', agendado:'Agendados (saem sozinhos no horário)', enviado:'Enviados' }[a]; }, true));
  }

  function admImp(el){
    el.innerHTML = '<div class="texto" style="padding:12px 16px">Cada planilha importada fica registrada com o que entrou. <b>Reverter</b> tira do sistema só o que aquela importação criou (com confirmação e "Desfazer").</div><div id="ai-t"></div>';
    APP.tabela(APP.$('ai-t'), { id:'importacoes', titulo:'Importações', linhas:D().importacoes, unidade:['importação','importações'], ord:{ k:'quando', dir:-1 },
      colunas:[{ k:'quando', rot:'Quando', cls:'dt', html:function(i){ return APP.fd(i.quando) + ' <small>' + APP.fh(i.quando) + '</small>'; }, ord:function(i){ return +i.quando; } },
        { k:'arq', rot:'Arquivo', html:function(i){ return esc(i.arquivo) + '<span class="doc" style="font-family:var(--font)">' + esc(i.o) + '</span>'; } },
        { k:'quem', rot:'Quem', html:function(i){ return esc(APP.pessoa(i.quem).curto); } },
        { k:'itens', rot:'O que entrou', html:function(i){ return Object.keys(i.itens).map(function(k){ return APP.plural(i.itens[k].length, k === 'clientes' ? 'cliente' : 'parcelamento', k); }).join(' · '); }, ord:false },
        { k:'sit', rot:'Situação', cls:'cen', html:function(i){ return i.revertida ? '<span class="pill p-n">Revertida em ' + APP.fc(i.revertida) + '</span>' : '<button class="bt-emitir" type="button" data-reverter="' + i.id + '">Reverter</button>'; }, ord:function(i){ return i.revertida ? 1 : 0; } }] });
  }
  document.addEventListener('click', function(e){ var b = e.target.closest('[data-reverter]'); if (!b) return; e.stopPropagation(); reverter(D().importacoes.find(function(i){ return i.id === b.dataset.reverter; })); }, true);
  function reverter(imp){
    var cli = imp.itens.clientes || [], pas = (imp.itens.parcelamentos || []).concat(D().parcelamentos.filter(function(p){ return cli.indexOf(p.cli) >= 0; }).map(function(p){ return p.id; }));
    var nParc = D().parcelas.filter(function(x){ return pas.indexOf(x.pa) >= 0; }).length;
    APP.confirmar({ kick:'Reverter importação', tit:'Tirar do sistema o que "' + imp.arquivo + '" criou?', perigo:true, ok:'Reverter',
      resumo:(cli.length ? '<span>' + APP.plural(cli.length, 'cliente', 'clientes') + ': ' + esc(cli.map(function(c){ return primeiro(APP.cli(c)); }).join(', ')) + '</span>' : '') + (pas.length ? '<span>' + APP.plural(pas.length, 'parcelamento', 'parcelamentos') + ' e ' + nParc + ' parcelas</span>' : '') + '<span>Dá para desfazer por alguns segundos.</span>' })
      .then(function(s){ if (!s) return;
        APP.acao('Importação revertida.', function(){ var ant = { clientes:D().clientes.slice(), parcelamentos:D().parcelamentos.slice(), parcelas:D().parcelas.slice() };
          D().clientes = D().clientes.filter(function(c){ return cli.indexOf(c.id) < 0; }); D().parcelamentos = D().parcelamentos.filter(function(p){ return pas.indexOf(p.id) < 0; }); D().parcelas = D().parcelas.filter(function(x){ return pas.indexOf(x.pa) < 0; }); imp.revertida = new Date(HOJE);
          return function(){ D().clientes = ant.clientes; D().parcelamentos = ant.parcelamentos; D().parcelas = ant.parcelas; imp.revertida = null; }; }); });
  }

  // ROMPEX I: novidades do sistema (o que mudou, em linguagem simples)
  var NOVIDADES = [
    ['09/10/2026', 'Ambiente de teste', ['Tabelas com filtros por vencimento e valor, modo compacto e total com média no rodapé.', 'Marque várias linhas para dar baixa, emitir guias ou enviar e-mails de uma vez — sempre com confirmação.', 'Tudo que grava tem "Desfazer" por alguns segundos.', 'Ctrl+K (ou /) busca cliente, CNPJ, nº do parcelamento, tela ou ação. "?" abre a ajuda da tela.', 'Automações com hora, dias e exceção por cliente; calendário do que vai acontecer.', 'Caixa de saída com conferência do anexo (valor e vencimento lidos do PDF).', 'Ficha do cliente com linha do tempo, automações do cliente e documentos do mês.', 'Importações com Reverter.']],
    ['08/10/2026', 'Backup 63 — base nova', ['Letra Inter, lateral mais estreita, margens menores e modo escuro preto.', 'Toda baixa pede confirmação.']],
    ['03/10/2026', 'Backup 59', ['Cartões com a mesma letra do resto do sistema.']]
  ];
  function admNov(el){
    el.innerHTML = NOVIDADES.map(function(n){ return '<div class="texto"><h3>' + esc(n[1]) + ' <span style="font-weight:500;color:var(--text3);font-size:12.5px">· ' + n[0] + '</span></h3><ul>' + n[2].map(function(t){ return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>'; }).join('');
  }

  // O1/O2/F7: como o ambiente de teste vira o ERP de verdade
  function admAmb(el){
    el.innerHTML = '<div class="sec-cab"><div><h2>Como uma mudança chega ao ERP (O1)</h2><p>O ambiente de teste fica sempre uma etapa à frente do ERP de verdade.</p></div></div>'
      + '<div class="passos">' + [['1. Testar aqui', 'A mudança nasce neste ambiente, com dados fictícios. Nada do que você faz aqui chega ao ERP.'], ['2. Você aprova', 'Você usa, aponta o que não gostou e só diz "pode passar" quando estiver bom.'], ['3. Passa para o ERP', 'A mesma peça vai para o ERP de verdade (uma tela por vez: Parcelamentos primeiro).'], ['4. Cópia de conferência (O2)', 'Antes de publicar, a mudança roda numa cópia do banco com nomes trocados, para ver com o volume real.']]
        .map(function(p){ return '<div class="passo"><b>' + p[0] + '</b><span>' + p[1] + '</span></div>'; }).join('') + '</div>'
      + '<div class="texto"><h3>Cópia anonimizada do banco (O2)</h3><p>Um segundo projeto no Supabase (o plano grátis permite 2 projetos, <b>sem custo</b>) recebe uma cópia do banco com os nomes, CPF/CNPJ, e-mails e telefones trocados por fictícios. As senhas e chaves secretas não vão para a cópia. O passo a passo está em <b>sistema/COMO-ATUALIZAR.md</b> (Backup 66) e o script em <b>sistema/banco/anonimizar-copia.sql</b> — ele só roda num banco marcado como "teste".</p></div>'
      + '<div class="texto"><h3>Instalar como aplicativo (F7)</h3><p>No ERP de verdade, o Chrome/Edge mostra "Instalar" na barra de endereço e o celular mostra "Adicionar à tela de início": o ERP abre em janela própria, com ícone. Aqui, dentro da página de teste, isso não funciona (o navegador bloqueia em páginas incorporadas) — por isso fica para a etapa de passar para o ERP. Os arquivos já estão prontos em <b>sistema/prototipos/ambiente-teste/</b> (manifest e service worker).</p></div>'
      + '<div class="texto"><h3>Dados deste ambiente</h3><p>Tudo é fictício e fica guardado só neste navegador. Para começar de novo:</p><button class="bt bt-o" type="button" id="amb-reset">Voltar aos dados de exemplo</button></div>';
    APP.$('amb-reset').onclick = function(){ APP.confirmar({ kick:'Recomeçar', tit:'Apagar o que você mudou e voltar aos dados de exemplo?', perigo:true, ok:'Voltar aos dados de exemplo' }).then(function(s){ if (!s) return; DADOS.limpar(); APP.D = DADOS.gerar(); Object.keys(APP.estTab).forEach(function(k){ delete APP.estTab[k]; }); APP.salvar(); APP.redesenhar(); APP.aviso('Dados de exemplo restaurados.'); }); };
  }

  /* ═════════ F1: o que a busca geral encontra ═════════ */
  APP.indice = function(){
    var L = [];
    APP.ordem.forEach(function(id){ var t = APP.telas[id]; L.push({ grupo:'Telas', rot:t.tit, sub:t.sec, ic:t.ic, fn:function(){ APP.ir(id); } }); });
    [['Novo parcelamento', 'mais', function(){ APP.ir('parcelamentos'); APP.novoParcelamento(); }], ['Caixa de saída (e-mails para revisar)', 'email', function(){ APP.ir('admin', 'saida'); }],
      ['Automações', 'raio', function(){ APP.ir('admin', 'auto'); }], ['Guias do mês', 'doc', function(){ APP.ir('rotina', 'guias'); }], ['Conferência do mês', 'check', function(){ APP.ir('rotina', 'conf'); }],
      ['Rodar as automações agora', 'raio', rodarAgora],
      ['Modo escuro / claro', 'lua', function(){ APP.$('bt-tema').click(); }], ['Tabelas compactas', 'compacto', function(){ var on = !document.documentElement.classList.contains('compacto'); document.documentElement.classList.toggle('compacto', on); APP.pref('compacto', on); APP.redesenhar(); }]]
      .forEach(function(a){ L.push({ grupo:'Ações', rot:a[0], ic:a[1], fn:a[2] }); });
    D().clientes.forEach(function(c){ L.push({ grupo:'Clientes', rot:c.nome, sub:c.doc, extra:c.doc.replace(/\D/g, '') + ' ' + APP.grupo(c.g).nome + ' ' + c.email, ic:'pessoas', fn:function(){ APP.fichaCliente(c); } }); });
    D().parcelamentos.forEach(function(pa){ var c = APP.cli(pa.cli); L.push({ grupo:'Parcelamentos', rot:primeiro(c) + ' — ' + pa.nat + ' (' + pa.plat + ')', sub:pa.num, extra:pa.num.replace(/\D/g, '') + ' ' + c.nome + ' ' + c.doc.replace(/\D/g, ''), ic:'camadas', fn:function(){ APP.janelaParcelamento(pa); } }); });
    D().automacoes.forEach(function(a){ L.push({ grupo:'Automações', rot:a.nome, sub:a.ref, extra:a.o, ic:'raio', fn:function(){ APP.janelaAutomacao(a); } }); });
    return L;
  };
})();
