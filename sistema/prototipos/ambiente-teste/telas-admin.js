/* Tela Administração: E-mails (como funciona no dia a dia + versão simplificada), Usuários, Importações (com Reverter),
   Saúde do sistema (as rotinas automáticas que estavam em Alertas), Backup e o próprio ambiente de teste. */
(function(){
  var APP = window.APP, N = APP.N, ic = APP.ic, esc = APP.esc, brl = APP.brl, HOJE = DADOS.HOJE, DIA = DADOS.DIA;
  var D = function(){ return APP.D; };
  var ABAS = [['emails','E-mails'],['usuarios','Usuários'],['importar','Importações'],['saude','Saúde do sistema'],['backup','Backup'],['ambiente','Ambiente de teste']];
  var SUB = [['como','Como funciona'],['tipos','O que sai e quando'],['quem','Quem recebe'],['saida','Caixa de saída'],['config','Configuração']];
  var EQUIPE = [['resumo','Resumo do dia (de manhã, dias úteis)'],['tarefa','Tarefa nova para mim'],['revisar','Tarefa para eu revisar'],['compromisso','Lembrete de compromisso (reunião, audiência)'],['mencao','Alguém me mencionou (@Nome)'],['aparelho','Acesso de um aparelho novo (segurança)'],
    ['atrasada','Tarefa atrasada (aviso ao administrador)'],['publicacao','Publicação nova no Diário'],['contrato','Contrato assinado'],['cnpj','Mudança no cartão CNPJ']];

  APP.registrar('admin', { tit:'Administração', ic:'admin',
    ajuda:['<b>E-mails → Como funciona</b> explica, em passos, o que sai sozinho e o que é você quem manda.', 'Os e-mails de parcelamento e de acordo são sempre manuais (precisam da guia anexada). Você só escolhe: rascunho no Gmail ou enviar direto.', '<b>Saúde do sistema</b> mostra as rotinas automáticas (antes ficavam em Alertas).'],
    desenhar:function(el, arg){
      if (arg && arg.aba) APP.pref('adm-aba', arg.aba); if (arg && arg.sub) APP.pref('adm-sub', arg.sub);
      var aba = APP.pref('adm-aba') || 'emails';
      el.innerHTML = APP.cabecalho({ ic:'admin', tit:'Administração', frase:APP.T('admin.frase') })
        + '<div class="seg seg-grande" id="adm-abas">' + ABAS.map(function(a){ return '<button type="button" class="seg-bt" data-adm="' + a[0] + '" aria-selected="' + (a[0] === aba) + '">' + a[1] + '</button>'; }).join('') + '</div><div id="adm-corpo"></div>';
      APP.$('adm-abas').onclick = function(e){ var b = e.target.closest('[data-adm]'); if (b){ APP.pref('adm-aba', b.dataset.adm); APP.redesenhar(); } };
      ({ emails:emails, usuarios:usuarios, importar:importar, saude:saude, backup:backup, ambiente:ambiente })[aba](APP.$('adm-corpo'));
    } });

  /* ═════ E-MAILS ═════ */
  function emails(el){
    var sub = APP.pref('adm-sub') || 'como';
    el.innerHTML = '<div class="seg" id="em-sub">' + SUB.map(function(a){ return '<button type="button" class="seg-bt" data-sub="' + a[0] + '" aria-selected="' + (a[0] === sub) + '">' + a[1] + '</button>'; }).join('') + '</div><div id="em-corpo"></div>';
    el.querySelector('#em-sub').onclick = function(e){ var b = e.target.closest('[data-sub]'); if (b){ APP.pref('adm-sub', b.dataset.sub); emails(el); } };
    ({ como:como, tipos:tipos, quem:quem, saida:saida, config:config })[sub](el.querySelector('#em-corpo'));
  }
  function modoBt(tipo){ var m = D().emailCfg[tipo].modo;
    return '<div class="seg" data-modo="' + tipo + '"><button type="button" class="seg-bt" data-m="rascunho" aria-selected="' + (m === 'rascunho') + '">Salvar no rascunho do Gmail</button><button type="button" class="seg-bt" data-m="enviar" aria-selected="' + (m === 'enviar') + '">Enviar direto</button></div>'; }
  function ligarModo(el){ el.querySelectorAll('[data-modo]').forEach(function(box){ box.onclick = function(e){ var b = e.target.closest('[data-m]'); if (!b) return; var cfg = D().emailCfg[box.dataset.modo];
    APP.acao(b.dataset.m === 'rascunho' ? 'Agora vai para o rascunho do Gmail (você confere e envia de lá).' : 'Agora o e-mail sai direto para o cliente.', function(){ var f = APP.foto(cfg, ['modo']); cfg.modo = b.dataset.m; return f; }); }; }); }
  function chave(on, attr){ return '<button type="button" class="chave" role="switch" aria-checked="' + !!on + '" ' + attr + '></button>'; }

  function como(el){
    var c = D().emailCfg;
    el.innerHTML = '<div class="texto"><h3>Como funcionam os e-mails no dia a dia</h3><p>São só <b>três tipos</b> de e-mail. Nada sai para o cliente sem você saber de onde veio.</p></div>'
      + '<div class="passos">'
      + '<div class="passo"><span class="passo-n">1</span><b>Os que VOCÊ manda (com anexo)</b><span>Guias de parcelamento e boleto/PIX de acordo. <b>Sempre manuais</b>, porque precisam da guia anexada.</span>'
        + '<ol class="mini-ol"><li>Rotina → <b>Guias do mês</b> (ou o botão Emitir na parcela).</li><li>Clique em <b>Emitir e mandar</b> e anexe o PDF da guia. O sistema lê o valor e o vencimento do PDF e avisa se mudou.</li><li>O e-mail, com o texto pronto e as guias anexadas, vai para o <b>rascunho do Gmail</b>. Você confere e aperta Enviar no Gmail.</li></ol>'
        + '<div class="campo"><label>Guias de parcelamento</label>' + modoBt('guia_parcelamento') + '</div><div class="campo"><label>Boleto/PIX de acordo</label>' + modoBt('guia_acordo') + '</div>'
        + '<span class="ajuda">Cobrança de honorário em atraso também é manual: botão <b>Cobrar</b> na linha → WhatsApp ou e-mail.</span></div>'
      + '<div class="passo"><span class="passo-n">2</span><b>Os que saem SOZINHOS para o cliente</b><span>Você só liga ou desliga. Saem de manhã e uma vez só.</span>'
        + '<div class="li-chave">' + chave(c.lembrete_honorario.ligado, 'data-auto="lembrete_honorario"') + '<span><b>Lembrete de honorário</b><small>' + c.lembrete_honorario.dias + ' dias antes do vencimento</small></span></div>'
        + '<div class="li-chave">' + chave(c.cobranca.ligado, 'data-auto="cobranca"') + '<span><b>Cobrança educada</b><small>' + c.cobranca.dias + ' dias depois do vencimento, se não pagou</small></span></div>'
        + '<div class="li-chave">' + chave(c.recibo.ligado, 'data-auto="recibo"') + '<span><b>Recibo</b><small>na hora em que você dá baixa no honorário</small></span></div></div>'
      + '<div class="passo"><span class="passo-n">3</span><b>Avisos para a EQUIPE</b><span>Tudo aparece no sistema (Início e Tarefas). Por e-mail, só o que estiver ligado em "O que sai e quando". Sugestão: <b>Resumo do dia</b>, <b>Tarefa nova</b>, <b>Tarefa para revisar</b> e <b>Compromissos</b>.</span></div>'
      + '<div class="passo"><span class="passo-n">!</span><b>Quando dá errado</b><span>Cliente sem e-mail, endereço errado ou Gmail fora do ar: o e-mail fica <b>Com erro</b> na Caixa de saída e aparece na faixa do Início. Corrija o e-mail do cliente e clique em "Tentar de novo".</span></div>'
      + '</div>'
      + '<section class="quadro pad"><div class="sec-cab"><div><h2>O que muda em relação a hoje</h2><p>Para aprovar.</p></div></div><table class="tab" style="min-width:0"><thead><tr><th>Hoje no ERP</th><th>Proposta</th></tr></thead><tbody>'
      + [['13 tipos de e-mail automático + uma grade por cliente (Lembrete, Vence hoje, Cobrança, Recibo, Parcelamento, Acordo…)', '3 automáticos ao cliente (lembrete de honorário, cobrança, recibo) e 3 manuais (guias, acordo, cobrar)'],
        ['Lembrete da parcela do parcelamento e "parcelamento com parcela em atraso" saíam sozinhos', 'Saem só quando você manda as guias (sempre manual, com o PDF)'],
        ['Lembrete e atraso da parcela do acordo saíam sozinhos', 'Manual, junto com o boleto/PIX do acordo'],
        ['"Revisar antes de sair", "Modo teste", "Da Rotina", "Na fila" na Caixa de saída', 'Caixa de saída com 3 abas: No rascunho · Enviados · Com erro'],
        ['"Quem recebe": uma grade com 8 colunas por cliente', 'Uma chave por cliente: recebe ou não recebe; e o e-mail de destino'],
        ['11 avisos da equipe por e-mail (todos ligados)', 'Ligados só os 4 do dia a dia; o resto fica só dentro do sistema']].map(function(r){ return '<tr><td class="mudo">' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</tbody></table></section>';
    ligarModo(el);
    el.onclick = function(e){ var b = e.target.closest('[data-auto]'); if (!b) return; var o = D().emailCfg[b.dataset.auto]; APP.acao(o.ligado ? 'Desligado.' : 'Ligado.', function(){ var f = APP.foto(o, ['ligado']); o.ligado = !o.ligado; return f; }); };
  }
  function tipos(el){
    var c = D().emailCfg;
    el.innerHTML = '<div class="duas"><section class="quadro pad"><div class="sec-cab"><div><h2>Para os clientes</h2><p>Manuais: você escolhe se vai para o rascunho ou direto.</p></div></div>'
      + '<div class="li-chave"><span class="pill p-b">manual</span><span><b>Guias de parcelamento</b><small>Rotina → Guias do mês</small></span>' + modoBt('guia_parcelamento') + '</div>'
      + '<div class="li-chave"><span class="pill p-b">manual</span><span><b>Boleto/PIX de acordo</b><small>Acordos → Emitir</small></span>' + modoBt('guia_acordo') + '</div>'
      + '<div class="li-chave">' + chave(c.lembrete_honorario.ligado, 'data-auto="lembrete_honorario"') + '<span><b>Lembrete de honorário</b><small>dias antes do vencimento</small></span><input class="ctl in-dias" data-dias="lembrete_honorario" value="' + c.lembrete_honorario.dias + '" inputmode="numeric" aria-label="dias"></div>'
      + '<div class="li-chave">' + chave(c.cobranca.ligado, 'data-auto="cobranca"') + '<span><b>Cobrança educada</b><small>dias depois do vencimento</small></span><input class="ctl in-dias" data-dias="cobranca" value="' + c.cobranca.dias + '" inputmode="numeric" aria-label="dias"></div>'
      + '<div class="li-chave">' + chave(c.recibo.ligado, 'data-auto="recibo"') + '<span><b>Recibo de pagamento</b><small>ao dar baixa no honorário</small></span></div></section>'
      + '<section class="quadro pad"><div class="sec-cab"><div><h2>Para a equipe</h2><p>' + APP.T('email.auto') + '</p></div></div>' + EQUIPE.map(function(x){ return '<div class="li-chave">' + chave(c.equipe[x[0]], 'data-eq="' + x[0] + '"') + '<span><b>' + esc(x[1]) + '</b></span></div>'; }).join('') + '</section></div>';
    ligarModo(el);
    el.onclick = function(e){
      var b = e.target.closest('[data-auto]'); if (b){ var o = c[b.dataset.auto]; APP.acao(o.ligado ? 'Desligado.' : 'Ligado.', function(){ var f = APP.foto(o, ['ligado']); o.ligado = !o.ligado; return f; }); return; }
      var q = e.target.closest('[data-eq]'); if (q){ var k = q.dataset.eq; APP.acao(c.equipe[k] ? 'Esse aviso fica só no sistema.' : 'Esse aviso também vai por e-mail.', function(){ var f = APP.foto(c.equipe, [k]); c.equipe[k] = !c.equipe[k]; return f; }); }
    };
    el.onchange = function(e){ var i = e.target.closest('[data-dias]'); if (!i) return; var o = c[i.dataset.dias], v = parseInt(i.value, 10) || 0; APP.acao('Prazo alterado para ' + v + ' dias.', function(){ var f = APP.foto(o, ['dias']); o.dias = v; return f; }); };
  }
  function quem(el){
    el.innerHTML = '<p class="mudo">' + APP.T('email.quem') + '</p><div id="em-quem"></div>';
    APP.tabela(el.querySelector('#em-quem'), { id:'em-quem', linhas:D().clientes, unidade:['cliente', 'clientes'], contagem:true,
      abas:[{ id:'todos', rot:'Todos', f:function(){ return true; } }, { id:'sim', rot:'Recebem', f:function(c){ return c.recebeEmail; } }, { id:'nao', rot:'Não recebem', f:function(c){ return !c.recebeEmail; } }, { id:'sem', rot:'Sem e-mail', cor:'r', f:function(c){ return !c.email; } }],
      busca:function(c){ return c.nome + ' ' + c.email; },
      colunas:[{ k:'g', rot:'Grupo', html:function(c){ return APP.grupoTxt(c.g); }, ord:function(c){ return APP.grupo(c.g).nome; } }, { k:'nome', rot:'Cliente', html:function(c){ return esc(c.nome); }, ord:function(c){ return c.nome; } },
        { k:'email', rot:'E-mail de destino', html:function(c){ return '<input class="ctl in-email" data-em="' + c.id + '" value="' + esc(c.email) + '" placeholder="sem e-mail — digite aqui">'; }, ord:function(c){ return c.email; } },
        { k:'rec', rot:'Recebe', cls:'cen', html:function(c){ return '<button type="button" class="pill ' + (c.recebeEmail ? 'p-g' : 'p-r') + ' pill-bt" data-rec="' + c.id + '">' + (c.recebeEmail ? 'Sim' : 'Não') + '</button>'; }, ord:function(c){ return c.recebeEmail ? 1 : 0; } }] });
    el.onclick = function(e){ var b = e.target.closest('[data-rec]'); if (!b) return; var c = APP.cli(b.dataset.rec); APP.acao(APP.curto(c) + (c.recebeEmail ? ' não recebe mais e-mails.' : ' volta a receber e-mails.'), function(){ var f = APP.foto(c, ['recebeEmail']); c.recebeEmail = !c.recebeEmail; return f; }); };
    el.onchange = function(e){ var i = e.target.closest('[data-em]'); if (!i) return; var c = APP.cli(i.dataset.em), v = i.value.trim(); APP.acao('E-mail de ' + APP.curto(c) + ' salvo.', function(){ var f = APP.foto(c, ['email']); c.email = v; return f; }); };
  }
  function saida(el){
    el.innerHTML = '<p class="mudo">' + APP.T('email.saida') + '</p><div id="em-saida"></div>';
    var TIPO = { guia_parcelamento:'Guias de parcelamento', guia_acordo:'Acordo', recibo:'Recibo', lembrete_honorario:'Lembrete de honorário', cobranca:'Cobrança' };
    APP.tabela(el.querySelector('#em-saida'), { id:'em-saida', linhas:D().emails, unidade:['e-mail', 'e-mails'], contagem:true, ord:{ k:'q', dir:-1 },
      abas:[{ id:'rascunho', rot:'No rascunho', f:function(e){ return e.status === 'rascunho'; } }, { id:'enviado', rot:'Enviados', f:function(e){ return e.status === 'enviado'; } }, { id:'erro', rot:'Com erro', cor:'r', f:function(e){ return e.status === 'erro'; } }],
      abaPadrao:D().emails.some(function(e){ return e.status === 'erro'; }) ? 'erro' : 'rascunho', busca:function(e){ return e.assunto + ' ' + APP.cli(e.cli).nome + ' ' + e.para; },
      colunas:[{ k:'q', rot:'Quando', cls:'dt', html:function(e){ return APP.fd(e.quando); }, ord:function(e){ return +e.quando; } },
        { k:'cli', rot:'Cliente', html:function(e){ return esc(APP.cli(e.cli).nome) + '<span class="b-sub">' + esc(e.para || 'sem e-mail') + '</span>'; }, ord:function(e){ return APP.cli(e.cli).nome; } },
        { k:'a', rot:'Assunto', html:function(e){ return esc(e.assunto) + '<span class="b-sub">' + esc(TIPO[e.tipo] || e.tipo) + (e.anexos ? ' · ' + APP.plural(e.anexos.length, 'anexo', 'anexos') : '') + (e.erro ? ' · <span class="pz-r">' + esc(e.erro) + '</span>' : '') + '</span>'; }, ord:function(e){ return e.assunto; } },
        { k:'ac', rot:'', cls:'dir', ord:false, html:function(e){ return e.status === 'erro' ? '<button class="bt-baixa" type="button" data-tentar="' + e.id + '">Tentar de novo</button>' : e.status === 'rascunho' ? '<span class="mudo">abra o Gmail → Rascunhos</span>' : ''; } }] });
    el.onclick = function(e){ var b = e.target.closest('[data-tentar]'); if (!b) return; var m = D().emails.find(function(x){ return x.id === b.dataset.tentar; }), c = APP.cli(m.cli);
      if (!c.email) return APP.aviso('Cadastre o e-mail do cliente antes (aba Quem recebe).'); APP.acao('E-mail reenviado para ' + c.email + '.', function(){ var f = APP.foto(m, ['status', 'para', 'erro']); m.status = 'enviado'; m.para = c.email; m.erro = ''; return f; }); };
  }
  function config(el){
    el.innerHTML = '<p class="mudo">' + APP.T('email.config') + '</p><div class="passos">'
      + '<div class="passo"><span class="passo-n">1</span><b>Contas que enviam</b><span>Escritório (Jurídico) e Contabilidade: Gmail + "senha de app" do Google. Feito uma vez.</span>' + APP.campo('E-mail do Escritório', '<input class="ctl" value="escritorio@araujocastro.teste">') + APP.campo('E-mail da Contabilidade', '<input class="ctl" value="contabilidade@araujocastro.teste">') + '</div>'
      + '<div class="passo"><span class="passo-n">2</span><b>Dados para pagamento</b><span>Aparecem no quadro "Como pagar" dos e-mails (PIX, banco, agência, conta, WhatsApp).</span>' + APP.campo('Chave PIX do escritório', '<input class="ctl" value="12.345.678/0001-00">') + APP.campo('Assinatura', '<input class="ctl" value="Equipe Araújo & Castro">') + '</div>'
      + '<div class="passo"><span class="passo-n">3</span><b>Testar</b><span>Confere tudo e manda um e-mail de teste para você.</span><button class="bt bt-p" type="button" id="em-teste">' + ic('teste') + 'Testar tudo</button></div></div>';
    el.querySelector('#em-teste').onclick = function(){ APP.aviso('Teste: conta OK · função OK · e-mail de teste enviado para pedro@escritorio.teste.'); };
  }

  /* ═════ USUÁRIOS ═════ */
  function usuarios(el){
    APP.tabela(el, { id:'usuarios', linhas:D().equipe, unidade:['pessoa', 'pessoas'], semBarra:true,
      colunas:[{ k:'n', rot:'Nome', html:function(p){ return '<span class="nome">' + esc(p.nome) + '</span><span class="b-sub">' + esc(p.email) + '</span>'; } }, { k:'c', rot:'Cargo', html:function(p){ return esc(p.cargo); } },
        { k:'a', rot:'Acesso', html:function(p){ return p.cargo === 'Administrador' ? 'Tudo' : p.cargo === 'Estagiário' ? 'Jurídico (ver) · Rotina · Tarefas' : 'Jurídico · Financeiro · Clientes · Tarefas'; } }],
      clique:function(p){ APP.aviso('No ERP: abre o cadastro de ' + p.curto + ' (cargo, funções, quem valida as tarefas).'); } });
  }
  /* ═════ IMPORTAÇÕES ═════ */
  function importar(el){
    el.innerHTML = '<div class="dica">Cada planilha importada fica registrada. <b>Reverter</b> desfaz a importação inteira (pede confirmação).</div><div id="imp-tab"></div>';
    APP.tabela(el.querySelector('#imp-tab'), { id:'importacoes', linhas:D().importacoes, unidade:['importação', 'importações'], semBarra:true, ord:{ k:'q', dir:-1 },
      colunas:[{ k:'q', rot:'Quando', cls:'dt', html:function(i){ return APP.fd(i.quando) + '<small>' + APP.fh(i.quando) + '</small>'; }, ord:function(i){ return +i.quando; } }, { k:'arq', rot:'Arquivo', html:function(i){ return esc(i.arquivo) + '<span class="b-sub">' + esc(i.o) + ' · por ' + esc(APP.pessoa(i.quem).curto) + '</span>'; } },
        { k:'ac', rot:'', cls:'dir', ord:false, html:function(i){ return i.revertida ? '<span class="mudo">revertida em ' + APP.fd(i.revertida) + '</span>' : '<button class="bt-emitir" type="button" data-rev="' + i.id + '">Reverter</button>'; } }] });
    el.onclick = function(e){ var b = e.target.closest('[data-rev]'); if (!b) return; var i = D().importacoes.find(function(x){ return x.id === b.dataset.rev; });
      APP.confirmar({ tit:'Reverter esta importação?', sub:esc(i.arquivo), ok:'Reverter', perigo:true, resumo:'<span>Tira do sistema o que entrou por esta planilha (' + esc(i.o) + ').</span>' }).then(function(s){ if (s) APP.acao('Importação revertida.', function(){ var f = APP.foto(i, ['revertida']); i.revertida = new Date(HOJE); return f; }); }); };
  }
  /* ═════ SAÚDE DO SISTEMA (antes em Alertas → Rotinas automáticas) ═════ */
  function saude(el){
    var R = [['Cartão CNPJ (6h)', 'ok', 'rodou hoje às 06:00 · 1 mudança (Serra Azul Serviços)'], ['E-mails', D().emails.some(function(e){ return e.status === 'erro'; }) ? 'erro' : 'ok', APP.plural(D().emails.filter(function(e){ return e.status === 'erro'; }).length, 'e-mail com erro', 'e-mails com erro')],
      ['Busca de publicações', 'ok', 'rodou hoje às 07:10 · 2 novas'], ['Tarefas recorrentes', 'ok', 'em dia'], ['Espaço do banco', 'ok', '50 MB de 500 MB (plano grátis)'], ['Backup semanal', 'aviso', 'último: domingo, 11/10']];
    el.innerHTML = '<p class="mudo">O que roda sozinho e se está em dia. Antes ficava em Alertas → Rotinas automáticas.</p><div class="quadro"><table class="tab" style="min-width:0"><thead><tr><th>Rotina</th><th class="cen">Situação</th><th>Detalhe</th></tr></thead><tbody>'
      + R.map(function(r){ return '<tr><td><b>' + esc(r[0]) + '</b></td><td class="cen"><span class="pill ' + ({ ok:'p-g', erro:'p-r', aviso:'p-a' }[r[1]]) + '">' + ({ ok:'em dia', erro:'com erro', aviso:'atenção' }[r[1]]) + '</span></td><td class="mudo">' + esc(r[2]) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  function backup(el){ el.innerHTML = '<div class="texto"><h3>Cópia de segurança</h3><p>O sistema guarda uma cópia toda semana (domingo de madrugada). Você também pode baixar uma cópia agora.</p><button class="bt bt-p" type="button" id="bk">' + ic('importar') + 'Baixar cópia agora</button></div>'; el.querySelector('#bk').onclick = function(){ APP.aviso('No ERP: baixa o arquivo da cópia (planilha com tudo).'); }; }
  function ambiente(el){
    el.innerHTML = '<div class="texto"><h3>Ambiente de teste</h3><p>Tudo aqui é fictício e fica só neste navegador. Mexa à vontade: nada chega ao ERP de verdade.</p><p>Hoje no ambiente é <b>segunda, 12/10/2026</b>.</p><button class="bt bt-o" type="button" id="amb-reset">' + ic('relogio') + 'Voltar aos dados de exemplo</button></div>';
    el.querySelector('#amb-reset').onclick = function(){ APP.confirmar({ tit:'Voltar aos dados de exemplo?', sub:'Desfaz tudo o que foi mudado neste navegador.', ok:'Voltar', perigo:true }).then(function(s){ if (!s) return; DADOS.limpar(); APP.D = DADOS.gerar(); APP.salvar(); APP.redesenhar(); APP.aviso('Dados de exemplo restaurados.'); }); };
  }
})();
