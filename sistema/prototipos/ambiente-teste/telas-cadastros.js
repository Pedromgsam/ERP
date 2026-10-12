/* Telas: Clientes (lista + ficha completa com abas), CRM (funil enxuto) e Documentos (pastas por cliente + vencendo). */
(function(){
  var APP = window.APP, N = APP.N, ic = APP.ic, esc = APP.esc, brl = APP.brl, HOJE = DADOS.HOJE, DIA = DADOS.DIA;
  var D = function(){ return APP.D; };

  /* ═════════ CLIENTES ═════════ */
  APP.registrar('clientes', { tit:'Clientes', ic:'pessoas',
    ajuda:['Clique no cliente para abrir a ficha: resumo, parcelamentos, acordos, processos, financeiro, documentos, e-mails e linha do tempo.', '"Recebe e-mails" troca com um clique (vale para todos os e-mails ao cliente).'],
    novo:function(){ formCliente(null); },
    desenhar:function(el){
      el.innerHTML = APP.cabecalho({ ic:'pessoas', tit:'Clientes', frase:APP.T('clientes.frase'), acoes:'<button class="bt bt-p" type="button" id="cl-novo">' + ic('mais') + 'Cliente</button>' }) + '<div id="cl-tab"></div>';
      APP.$('cl-novo').onclick = function(){ formCliente(null); };
      APP.tabela(APP.$('cl-tab'), { id:'clientes', linhas:D().clientes, unidade:['cliente', 'clientes'], contagem:true, dicaBusca:'Nome, CNPJ ou sócio…', ord:{ k:'g', dir:1 },
        abas:[{ id:'ativos', rot:'Ativos', f:function(c){ return c.tipo !== 'Inativo'; } }, { id:'cons', rot:'Consultoria', f:function(c){ return c.tipo === 'Consultoria'; } }, { id:'pont', rot:'Serviço pontual', f:function(c){ return c.tipo === 'Serviço pontual'; } }, { id:'inat', rot:'Inativos', f:function(c){ return c.tipo === 'Inativo'; } }],
        busca:function(c){ return c.nome + ' ' + c.doc + ' ' + c.doc.replace(/\D/g, '') + ' ' + c.socio + ' ' + APP.grupo(c.g).nome; },
        listas:[{ k:'g', rot:'Grupo', todos:'Todos os grupos', opcoes:D().grupos.map(function(g){ return [g.id, g.nome]; }), get:function(c){ return c.g; } }, { k:'area', rot:'Área', todos:'Todas', opcoes:[['juridico','Jurídico'],['contabilidade','Contabilidade'],['ambos','As duas']], get:function(c){ return c.area; } }, { k:'resp', rot:'Responsável', todos:'Todos', opcoes:D().equipe.map(function(p){ return [p.id, p.curto]; }), get:function(c){ return c.resp; } }],
        colunas:[{ k:'g', rot:'Grupo', html:function(c){ return APP.grupoTxt(c.g); }, ord:function(c){ return APP.grupo(c.g).nome + c.nome; } },
          { k:'nome', rot:'Cliente', html:function(c){ return APP.empresa(c); }, ord:function(c){ return c.nome; } },
          { k:'area', rot:'Área', html:function(c){ return { juridico:'Jurídico', contabilidade:'Contabilidade', ambos:'Jurídico e Contabilidade' }[c.area]; }, ord:function(c){ return c.area; } },
          { k:'resp', rot:'Responsável', html:function(c){ return APP.pessoaTxt(c.resp); }, ord:function(c){ return c.resp; } },
          { k:'email', rot:'E-mail', html:function(c){ return c.email ? esc(c.email) : '<span class="pz-r">sem e-mail</span>'; }, ord:function(c){ return c.email; } },
          { k:'rec', rot:'Recebe e-mails', cls:'cen', html:function(c){ return '<button type="button" class="pill ' + (c.recebeEmail ? 'p-g' : 'p-r') + ' pill-bt" data-rec="' + c.id + '">' + (c.recebeEmail ? 'Sim' : 'Não') + '</button>'; }, ord:function(c){ return c.recebeEmail ? 1 : 0; } }],
        clique:function(c){ fichaCliente(c.id); } });
      el.onclick = function(e){ var b = e.target.closest('[data-rec]'); if (!b) return; var c = APP.cli(b.dataset.rec); APP.acao(c.recebeEmail ? APP.curto(c) + ' não recebe mais e-mails.' : APP.curto(c) + ' volta a receber e-mails.', function(){ var f = APP.foto(c, ['recebeEmail']); c.recebeEmail = !c.recebeEmail; return f; }); };
    } });
  var fichaCliente = APP.fichaCliente = function(id, aba){
    var c = APP.cli(id), g = APP.grupo(c.g), p = c.passivo;
    var ABAS = [['resumo','Resumo'],['parc','Parcelamentos'],['acordos','Acordos'],['proc','Processos'],['fin','Financeiro'],['docs','Documentos'],['emails','E-mails'],['tempo','Linha do tempo']];
    aba = aba || 'resumo';
    var J = APP.janela({ larga:true, kick:g.nome + ' · ' + c.tipo, tit:c.nome, sub:esc(c.doc) + (c.socio ? ' · sócio: ' + esc(c.socio) : ''), dir:'<span class="pill ' + (c.recebeEmail ? 'p-g' : 'p-r') + '">' + (c.recebeEmail ? 'Recebe e-mails' : 'Não recebe e-mails') + '</span>',
      abas:'<div class="seg">' + ABAS.map(function(a){ return '<button type="button" class="seg-bt" data-fa="' + a[0] + '" aria-selected="' + (a[0] === aba) + '">' + a[1] + '</button>'; }).join('') + '</div>', corpo:'<div id="fc-corpo"></div>',
      rodape:'<button class="bt bt-o esq" type="button" id="fc-portal">' + ic('portal') + 'Ver como o cliente vê</button><button class="bt bt-o" type="button" id="fc-ed">' + ic('lapis') + 'Editar cadastro</button><button class="bt bt-o" type="button" data-fechar>Fechar</button>' });
    J.q('.j-abas').onclick = function(e){ var b = e.target.closest('[data-fa]'); if (!b) return; J.q('.j-abas').querySelectorAll('[data-fa]').forEach(function(x){ x.setAttribute('aria-selected', x === b); }); pintar(b.dataset.fa); };
    J.q('#fc-portal').onclick = function(){ J.fechar(); APP.pref('portal-cli', c.id); APP.ir('portal'); };
    J.q('#fc-ed').onclick = function(){ J.fechar(); formCliente(c); };
    function pintar(a){
      var el = J.q('#fc-corpo');
      if (a === 'resumo'){
        var pas = D().parcelamentos.filter(function(x){ return x.cli === id; }), atr = D().parcelas.filter(function(x){ return !x.pago && x.venc <= HOJE && N.pa(x.pa).cli === id; });
        var hon = D().lanc.filter(function(l){ return l.cli === id && l.tipo === 'receita' && !l.pago && !l.perda && !l.redutor; });
        el.innerHTML = '<div class="ficha"><div><span>E-mail</span><b>' + esc(c.email || '—') + '</b></div><div><span>Telefone</span><b>' + esc(c.tel || '—') + '</b></div><div><span>Responsável</span><b>' + esc(APP.pessoa(c.resp).nome) + '</b></div><div><span>Área</span><b>' + esc(c.area) + '</b></div>'
          + '<div><span>CAPAG</span><b>' + esc(c.capag) + '</b></div><div><span>Procuração</span><b>' + (c.procuracao ? 'Sim' : 'Não') + '</b></div><div><span>Certificado digital</span><b class="' + (!c.certificado ? 'vermelho' : c.certificado <= new Date(+HOJE + 30 * DIA) ? 'ambar' : '') + '">' + (c.certificado ? 'vale até ' + APP.fd(c.certificado) : 'não tem') + '</b></div><div><span>Passivo conferido</span><b>' + (c.conferido ? APP.fd(c.conferido) : 'nunca') + '</b></div></div>'
          + APP.nums([['Passivo', APP.brlK(p.rfb + p.rfbNeg + p.pgfn + p.pgfnNeg + p.age + p.ageNeg)], ['Parcelamentos', String(pas.length)], ['Parcelas em atraso', String(atr.length), atr.length ? 'vermelho' : ''], ['Honorários em aberto', brl(APP.soma(hon, function(l){ return l.v; })), hon.some(function(l){ return l.venc <= HOJE; }) ? 'vermelho' : '']]);
      } else if (a === 'parc'){
        APP.tabela(el, { id:'fc-parc-' + id, linhas:D().parcelas.filter(function(x){ return N.pa(x.pa).cli === id; }), unidade:['parcela', 'parcelas'], abas:[{ id:'apagar', rot:'A pagar', f:function(x){ return !x.pago; } }, { id:'pago', rot:'Pago', f:function(x){ return !!x.pago; } }], prazos:true, prazosAbas:['apagar'], altura:'360px',
          colunas:APP.colsParcelas({ semGrupo:true, semEmpresa:true }), ord:{ k:'venc', dir:1 }, venc:function(x){ return x.venc; }, valor:function(x){ return x.v; }, linhaCls:function(x){ return APP.vencida(x.venc, x.pago); } });
      } else if (a === 'acordos'){
        var L = D().acordos.filter(function(x){ return x.cli === id; });
        el.innerHTML = L.length ? '' : '<p class="mudo">Nenhum acordo.</p>';
        if (L.length) APP.tabela(el, { id:'fc-ac-' + id, linhas:L, unidade:['parcela', 'parcelas'], semBarra:true, altura:'360px', valor:function(x){ return x.v; }, ord:{ k:'venc', dir:1 }, linhaCls:function(x){ return APP.vencida(x.venc, x.pago); },
          colunas:[{ k:'cred', rot:'Credor', html:function(x){ return esc(x.credor); } }, { k:'n', rot:'Parcela', cls:'cen', html:function(x){ return x.n + ' de ' + x.tot; } }, { k:'v', rot:'Valor', cls:'dir val', soma:true, html:function(x){ return brl(x.v); } }, { k:'venc', rot:'Vencimento', cls:'cen dt', html:function(x){ return APP.fd(x.venc); }, ord:function(x){ return +x.venc; } }, { k:'pz', rot:'Prazo', cls:'cen', html:function(x){ return APP.celPrazo(x.venc, x.pago); } }] });
      } else if (a === 'proc'){
        var P = D().processos.filter(function(x){ return x.cli === id; });
        el.innerHTML = P.length ? '<div class="lista">' + P.map(function(x){ return '<button type="button" class="li li-bt" data-proc="' + x.id + '"><span class="li-tx"><b>' + esc(x.natureza) + ' · ' + esc(x.tribunal) + '</b><small class="num">' + esc(x.numero) + '</small><small>Última movimentação: ' + APP.fd(x.ultMov.data) + ' — ' + esc(x.ultMov.txt) + '</small></span><span class="pill ' + (x.status === 'Ativo' ? 'p-g' : 'p-n') + '">' + esc(x.status) + '</span></button>'; }).join('') + '</div>' : '<p class="mudo">Nenhum processo.</p>';
        el.onclick = function(e){ var b = e.target.closest('[data-proc]'); if (b) APP.janelaProcesso(D().processos.find(function(x){ return x.id === b.dataset.proc; })); };
      } else if (a === 'fin'){
        APP.tabela(el, { id:'fc-fin-' + id, linhas:D().lanc.filter(function(l){ return l.cli === id && l.tipo === 'receita' && !l.redutor; }), unidade:['lançamento', 'lançamentos'], altura:'360px', abas:[{ id:'ab', rot:'Em aberto', f:function(l){ return !l.pago && !l.perda; } }, { id:'pg', rot:'Recebidos', f:function(l){ return !!l.pago; } }],
          valor:function(l){ return l.v; }, ord:{ k:'venc', dir:1 }, linhaCls:function(l){ return l.pago ? '' : APP.vencida(l.venc); },
          colunas:[{ k:'desc', rot:'Descrição', html:function(l){ return esc(l.desc) + '<span class="b-sub">' + (l.empresa === 'jur' ? 'Jurídico' : 'Contabilidade') + '</span>'; } }, { k:'v', rot:'Valor', cls:'dir val', soma:true, html:function(l){ return brl(l.v); }, ord:function(l){ return l.v; } }, { k:'venc', rot:'Vencimento', cls:'cen dt', html:function(l){ return APP.fd(l.venc); }, ord:function(l){ return +l.venc; } }, { k:'pz', rot:'Prazo', cls:'cen', html:function(l){ return APP.celPrazo(l.venc, l.pago); } },
            { k:'ac', rot:'', cls:'dir', ord:false, html:function(l){ return l.pago ? '' : '<span class="acs"><button class="bt-emitir" type="button" data-cobrar="' + l.id + '">Cobrar</button>' + APP.btBaixa('data-pagar="' + l.id + '"') + '</span>'; } }] });
      } else if (a === 'docs'){
        var Ds = D().docs.filter(function(d){ return d.cli === id; }), tipos = D().docsCliente[id] || [];
        var comp = new Date(HOJE.getFullYear(), HOJE.getMonth() - 1, 1), k = id + '|' + comp.getFullYear() + '-' + String(comp.getMonth() + 1).padStart(2, '0'), rec = D().docsRecebidos[k] || [];
        el.innerHTML = '<div class="lista">' + (Ds.length ? Ds.map(function(d){ return '<div class="li"><span class="li-tipo t-tarefa">' + esc(d.tipo) + '</span><span class="li-tx"><b>' + esc(d.nome) + '</b><small>enviado em ' + APP.fd(d.em) + (d.validade ? ' · vale até <span class="' + (d.validade <= new Date(+HOJE + 30 * DIA) ? 'pz-a' : '') + '">' + APP.fd(d.validade) + '</span>' : '') + '</small></span></div>'; }).join('') : '<p class="mudo">Nenhum arquivo.</p>') + '</div>'
          + (tipos.length ? '<div class="bloco"><h3>Documentos de ' + APP.MESES[comp.getMonth()] + ' (o cliente manda todo mês)</h3><div class="lista">' + tipos.map(function(t){ var ok = rec.indexOf(t) >= 0; return '<div class="li"><span class="li-tx"><b>' + esc(D().tiposDoc[t]) + '</b></span><span class="' + (ok ? 'ok-txt' : 'pz-a') + '">' + (ok ? '✓ recebido' : 'falta') + '</span></div>'; }).join('') + '</div></div>' : '');
      } else if (a === 'emails'){
        var E = D().emails.filter(function(e){ return e.cli === id; });
        el.innerHTML = E.length ? '<div class="lista">' + E.map(function(e){ return '<div class="li"><span class="li-tx"><b>' + esc(e.assunto) + '</b><small>' + APP.fd(e.quando) + ' · para ' + esc(e.para || '—') + (e.erro ? ' · <span class="pz-r">' + esc(e.erro) + '</span>' : '') + '</small></span><span class="pill ' + ({ enviado:'p-g', rascunho:'p-b', erro:'p-r' }[e.status]) + '">' + ({ enviado:'Enviado', rascunho:'No rascunho', erro:'Com erro' }[e.status]) + '</span></div>'; }).join('') + '</div>' : '<p class="mudo">Nenhum e-mail para este cliente ainda.</p>';
      } else {
        var T = N.linhaDoTempo(id), ICT = { pagamento:'dinheiro', guia:'doc', atraso:'alerta', email:'email', processo:'balanca' };
        el.innerHTML = T.length ? '<div class="tempo">' + T.slice(0, 40).map(function(t){ return '<div class="ev"><span class="q">' + APP.fd(t.quando) + '</span><span class="ic ev-' + t.tipo + '">' + ic(ICT[t.tipo] || 'ok') + '</span><div class="tx"><b>' + esc(t.tit) + '</b><span>' + esc(t.sub) + '</span></div></div>'; }).join('') + '</div>' : '<p class="mudo">Nada nos últimos 4 meses.</p>';
      }
    }
    pintar(aba);
  };
  function formCliente(c){
    var novo = !c; c = c || { nome:'', doc:'', email:'', tel:'', g:'', tipo:'Consultoria', area:'juridico', resp:'pedro' };
    var J = APP.janela({ kick:novo ? 'Novo cliente' : 'Editar cadastro', tit:novo ? 'Cliente' : c.nome,
      corpo:'<div class="dois">' + APP.campo('CNPJ ou CPF', '<input class="ctl" id="cc-doc" value="' + esc(c.doc) + '" placeholder="Digite e o sistema busca os dados na Receita">') + APP.campo('Grupo', '<select class="ctl" id="cc-g">' + D().grupos.map(function(g){ return '<option value="' + g.id + '"' + (g.id === c.g ? ' selected' : '') + '>' + esc(g.nome) + '</option>'; }).join('') + '</select>') + '</div>'
        + APP.campo('Nome / razão social', '<input class="ctl" id="cc-nome" value="' + esc(c.nome) + '">')
        + '<div class="dois">' + APP.campo('E-mail (para onde vão os e-mails do escritório)', '<input class="ctl" id="cc-email" value="' + esc(c.email) + '">') + APP.campo('Telefone / WhatsApp', '<input class="ctl" id="cc-tel" value="' + esc(c.tel) + '">') + '</div>'
        + '<div class="tres">' + APP.campo('Tipo', '<select class="ctl" id="cc-tipo">' + ['Consultoria', 'Serviço pontual', 'Inativo'].map(function(t){ return '<option' + (t === c.tipo ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select>') + APP.campo('Área', '<select class="ctl" id="cc-area"><option value="juridico">Jurídico</option><option value="contabilidade"' + (c.area === 'contabilidade' ? ' selected' : '') + '>Contabilidade</option><option value="ambos"' + (c.area === 'ambos' ? ' selected' : '') + '>As duas</option></select>') + APP.campo('Responsável', '<select class="ctl" id="cc-resp">' + D().equipe.map(function(p){ return '<option value="' + p.id + '"' + (p.id === c.resp ? ' selected' : '') + '>' + esc(p.curto) + '</option>'; }).join('') + '</select>') + '</div>',
      rodape:'<button class="bt bt-o" type="button" data-fechar>Cancelar</button><button class="bt bt-p" type="button" id="cc-ok">' + ic('check') + 'Salvar</button>' });
    J.q('#cc-ok').onclick = function(){ var nome = J.q('#cc-nome').value.trim(); if (!nome) return J.q('#cc-nome').focus();
      var dados = { nome:nome, doc:J.q('#cc-doc').value.trim(), g:J.q('#cc-g').value, email:J.q('#cc-email').value.trim(), tel:J.q('#cc-tel').value.trim(), tipo:J.q('#cc-tipo').value, area:J.q('#cc-area').value, resp:J.q('#cc-resp').value };
      J.fechar();
      if (novo) APP.acao('Cliente cadastrado.', function(){ var n = Object.assign({ id:'c' + Date.now(), socio:'', passivo:{ rfb:0, rfbNeg:0, pgfn:0, pgfnNeg:0, age:0, ageNeg:0 }, capag:'—', procuracao:false, certificado:null, conferido:null, recebeEmail:true }, dados); D().clientes.push(n); return function(){ D().clientes.splice(D().clientes.indexOf(n), 1); }; });
      else APP.acao('Cadastro alterado.', function(){ var f = APP.foto(c, Object.keys(dados)); Object.assign(c, dados); return f; }); };
  }

  /* ═════════ CRM ═════════ */
  var ETAPAS = [['contato','Novo contato'],['diagnostico','Diagnóstico'],['proposta','Proposta'],['fechamento','Fechamento']];
  APP.registrar('crm', { tit:'CRM', ic:'alvo',
    ajuda:['4 colunas (antes eram 8 etapas): Novo contato · Diagnóstico · Proposta · Fechamento. Ganhos e perdidos ficam na faixa de baixo.', 'Clique no cartão para mover de etapa, anotar o próximo passo ou marcar como ganho (gera o contrato aguardando assinatura).', 'Próximo passo vencido fica em vermelho.'],
    novo:function(){ formOp(null); },
    desenhar:function(el){
      var O = D().crm;
      el.innerHTML = APP.cabecalho({ ic:'alvo', tit:'CRM', frase:APP.T('crm.frase'), acoes:'<button class="bt bt-p" type="button" id="crm-novo">' + ic('mais') + 'Oportunidade</button>' })
        + '<div class="funil">' + ETAPAS.map(function(e){ var L = O.filter(function(o){ return o.etapa === e[0]; });
          return '<section class="col"><div class="col-hd"><b>' + e[1] + '</b><span>' + L.length + ' · ' + APP.brlK(APP.soma(L, function(o){ return o.valor; })) + '/mês</span></div>' + L.map(function(o){ var atr = o.proxEm && o.proxEm <= HOJE;
            return '<button type="button" class="op" data-op="' + o.id + '"><b>' + esc(o.nome) + '</b><small>' + esc(o.contato) + ' · ' + APP.brlK(o.valor) + '/mês</small><small class="' + (atr ? 'pz-r' : 'mudo') + '">' + esc(o.prox) + (o.proxEm ? ' · ' + APP.fc(o.proxEm) : '') + '</small>' + APP.pessoaTxt(o.resp) + '</button>'; }).join('') + '</section>'; }).join('') + '</div>'
        + '<div class="finais"><span class="rot">Ganhos</span>' + (O.some(function(o){ return o.etapa === 'ganho'; }) ? '' : '<span class="mudo">nenhum ainda</span>') + O.filter(function(o){ return o.etapa === 'ganho'; }).map(function(o){ return '<button type="button" class="chip" data-op="' + o.id + '">' + esc(o.nome) + '</button>'; }).join('') + '<span class="rot">Perdidos</span>' + O.filter(function(o){ return o.etapa === 'perdido'; }).map(function(o){ return '<button type="button" class="chip" data-op="' + o.id + '">' + esc(o.nome) + '</button>'; }).join('') + '</div>';
      APP.$('crm-novo').onclick = function(){ formOp(null); };
      el.onclick = function(e){ var b = e.target.closest('[data-op]'); if (b) formOp(O.find(function(o){ return o.id === b.dataset.op; })); };
    } });
  function formOp(o){
    var novo = !o; o = o || { nome:'', contato:'', etapa:'contato', valor:0, resp:'pedro', prox:'', proxEm:HOJE };
    var J = APP.janela({ kick:novo ? 'Nova oportunidade' : 'Oportunidade', tit:novo ? 'CRM' : o.nome,
      corpo:'<div class="dois">' + APP.campo('Empresa / pessoa', '<input class="ctl" id="op-nome" value="' + esc(o.nome) + '">') + APP.campo('Contato', '<input class="ctl" id="op-cont" value="' + esc(o.contato) + '">') + '</div>'
        + APP.campo('Etapa', APP.opcoes('Etapa', ETAPAS.map(function(e){ return e[1]; }), (ETAPAS.find(function(e){ return e[0] === o.etapa; }) || ETAPAS[0])[1]))
        + '<div class="tres">' + APP.campo('Valor por mês', '<input class="ctl" id="op-v" inputmode="decimal" value="' + (o.valor || '') + '">') + APP.campo('Próximo passo', '<input class="ctl" id="op-prox" value="' + esc(o.prox) + '">') + APP.campo('Quando', '<input class="ctl" type="date" id="op-em" value="' + (o.proxEm ? APP.iso(o.proxEm) : '') + '">') + '</div>',
      rodape:(novo ? '' : '<button class="bt bt-g esq" type="button" id="op-perdeu">Perdido</button><button class="bt bt-o" type="button" id="op-ganhou">' + ic('check') + 'Ganho → contrato</button>') + '<button class="bt bt-o" type="button" data-fechar>Cancelar</button><button class="bt bt-p" type="button" id="op-ok">Salvar</button>' });
    J.q('#op-ok').onclick = function(){ var nome = J.q('#op-nome').value.trim(); if (!nome) return J.q('#op-nome').focus();
      var et = APP.opcaoDe(J, 'Etapa'), dados = { nome:nome, contato:J.q('#op-cont').value, etapa:(ETAPAS.find(function(e){ return e[1] === et; }) || ETAPAS[0])[0], valor:APP.num(J.q('#op-v').value) || 0, prox:J.q('#op-prox').value, proxEm:APP.deIso(J.q('#op-em').value) };
      J.fechar();
      if (novo) APP.acao('Oportunidade criada.', function(){ var n = Object.assign({ id:'o' + Date.now(), resp:'pedro' }, dados); D().crm.push(n); return function(){ D().crm.splice(D().crm.indexOf(n), 1); }; });
      else APP.acao('Oportunidade alterada.', function(){ var f = APP.foto(o, Object.keys(dados)); Object.assign(o, dados); return f; }); };
    var g = J.q('#op-ganhou'); if (g) g.onclick = function(){ J.fechar(); APP.acao('Ganho! Contrato criado em "Aguardando assinatura".', function(){ var f = APP.foto(o, ['etapa']); o.etapa = 'ganho'; var ct = { id:'ct' + Date.now(), cli:'c1', tipo:'Consultoria', desc:'Consultoria — ' + o.nome, valor:o.valor, modo:'fixo', inicio:new Date(HOJE), status:'Aguardando assinatura', area:'Tributário' }; D().contratos.push(ct); return function(){ f(); D().contratos.splice(D().contratos.indexOf(ct), 1); }; }); };
    var p = J.q('#op-perdeu'); if (p) p.onclick = function(){ J.fechar(); APP.acao('Marcada como perdida.', function(){ var f = APP.foto(o, ['etapa']); o.etapa = 'perdido'; return f; }); };
  }

  /* ═════════ DOCUMENTOS ═════════ */
  APP.registrar('documentos', { tit:'Documentos', ic:'pasta',
    ajuda:['Uma pasta por cliente. "Vencendo em 30 dias" junta certidões, procurações e certificados que vencem logo.', '"Gerar documentos" abre a Central (procuração, contrato, recibo…).'],
    desenhar:function(el){
      var venc = D().docs.filter(function(d){ return d.validade && d.validade <= new Date(+HOJE + 30 * DIA); }), cert = D().clientes.filter(function(c){ return c.certificado && c.certificado <= new Date(+HOJE + 30 * DIA); });
      el.innerHTML = APP.cabecalho({ ic:'pasta', tit:'Documentos', frase:APP.T('docs.frase'), acoes:'<button class="bt bt-o" type="button" id="dc-ger">' + ic('doc') + 'Gerar documentos</button><button class="bt bt-p" type="button" id="dc-env">' + ic('importar') + 'Enviar arquivo</button>' })
        + (venc.length || cert.length ? APP.faixa(venc.map(function(d){ return { cor:'a', txt:esc(d.tipo) + ' de <b>' + esc(APP.curto(APP.cli(d.cli))) + '</b> vence ' + APP.fc(d.validade), fn:function(){ APP.fichaCliente(d.cli, 'docs'); } }; }), 'Vencendo em 30 dias') : '')
        + '<div id="dc-tab"></div>';
      APP.ligarFaixa(el, venc.map(function(d){ return { fn:function(){ APP.fichaCliente(d.cli, 'docs'); } }; }));
      APP.$('dc-ger').onclick = function(){ APP.aviso('No ERP: abre a Central de Documentos (procuração, contrato, recibo…).'); };
      APP.$('dc-env').onclick = function(){ APP.aviso('No ERP: escolhe o cliente, o tipo e o arquivo (PDF, Word, certificado).'); };
      APP.tabela(APP.$('dc-tab'), { id:'documentos', linhas:D().docs, unidade:['arquivo', 'arquivos'], dicaBusca:'Arquivo ou cliente…', ord:{ k:'em', dir:-1 },
        busca:function(d){ return d.nome + ' ' + APP.cli(d.cli).nome + ' ' + d.tipo; }, venc:function(d){ return d.validade; },
        listas:[{ k:'tipo', rot:'Tipo', todos:'Todos os tipos', opcoes:Array.from(new Set(D().docs.map(function(d){ return d.tipo; }))).map(function(t){ return [t, t]; }), get:function(d){ return d.tipo; } }, { k:'g', rot:'Grupo', todos:'Todos os grupos', opcoes:D().grupos.map(function(g){ return [g.id, g.nome]; }), get:function(d){ return APP.cli(d.cli).g; } }],
        colunas:[{ k:'cli', rot:'Cliente', html:function(d){ return APP.grupoTxt(APP.cli(d.cli).g) + '<span class="b-sub">' + esc(APP.curto(APP.cli(d.cli))) + '</span>'; }, ord:function(d){ return APP.cli(d.cli).nome; } },
          { k:'nome', rot:'Arquivo', html:function(d){ return esc(d.nome); }, ord:function(d){ return d.nome; } },
          { k:'tipo', rot:'Tipo', html:function(d){ return esc(d.tipo); }, ord:function(d){ return d.tipo; } },
          { k:'em', rot:'Enviado em', cls:'cen dt', html:function(d){ return APP.fd(d.em); }, ord:function(d){ return +d.em; } },
          { k:'val', rot:'Validade', cls:'cen', html:function(d){ return d.validade ? APP.celPrazo(d.validade, null) + '<small class="pz-sub">' + APP.fd(d.validade) + '</small>' : '<span class="traco">—</span>'; }, ord:function(d){ return d.validade ? +d.validade : 9e15; } }],
        clique:function(d){ APP.fichaCliente(d.cli, 'docs'); } });
    } });
})();
