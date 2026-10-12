/* Regras do ambiente de teste (versão 2): parcelas e acordos, baixa com confirmação, emitir guia (lê o PDF),
   e-mails (manuais com rascunho ou envio direto; automáticos), pendências do Início, linha do tempo do cliente e o índice da busca. */
(function(){
  var APP = window.APP, DIA = DADOS.DIA, HOJE = DADOS.HOJE, esc = APP.esc, brl = APP.brl;
  var N = APP.N = {};
  var D = function(){ return APP.D; };

  /* ── parcelamentos ── */
  N.pa = function(id){ return D().parcelamentos.find(function(p){ return p.id === id; }); };
  N.parcela = function(id){ return D().parcelas.find(function(x){ return x.id === id; }); };
  N.parcelasDe = function(pa){ return D().parcelas.filter(function(x){ return x.pa === pa.id; }).sort(function(a, b){ return a.n - b.n; }); };
  N.resumo = function(pa){
    var r = { pg:0, atr:0, falta:0, quitado:0, prox:null, tot:pa.tot, mes:[], parcMes:null };
    N.parcelasDe(pa).forEach(function(x){
      if (APP.doMes(x.venc)) r.parcMes = x;
      if (x.pago){ r.pg++; r.quitado += x.v; } else { r.falta += x.v; if (x.venc <= HOJE){ r.atr++; r.mes.push(x); } else { if (!r.prox) r.prox = x; if (APP.doMes(x.venc)) r.mes.push(x); } } });
    r.concluido = r.pg >= pa.tot; return r;
  };
  N.cliDe = function(x){ return APP.cli((x.pa ? N.pa(x.pa) : x).cli); };
  N.grupoDe = function(x){ return N.cliDe(x).g; };
  N.paraEmitir = function(x){ var pa = N.pa(x.pa); return !pa.cliEmite && !x.pago && !x.emitida && (x.venc <= HOJE || APP.doMes(x.venc)); };

  /* ── acordos (parcelas → acordo = mesmo ac) ── */
  N.acordos = function(){
    var M = {};
    D().acordos.forEach(function(x){ var a = M[x.ac] = M[x.ac] || { id:x.ac, cli:x.cli, processo:x.processo, credor:x.credor, forma:x.forma, parcelas:[] }; a.parcelas.push(x); });
    return Object.keys(M).map(function(k){ var a = M[k];
      a.parcelas.sort(function(x, y){ return x.n - y.n; });
      var ab = a.parcelas.filter(function(x){ return !x.pago; });
      a.tot = a.parcelas.length; a.pg = a.tot - ab.length; a.pago = APP.soma(a.parcelas.filter(function(x){ return x.pago; }), function(x){ return x.v; }); a.falta = APP.soma(ab, function(x){ return x.v; });
      a.atr = ab.filter(function(x){ return x.venc <= HOJE; }).length; a.concluido = !ab.length; a.parcMes = a.parcelas.find(function(x){ return APP.doMes(x.venc); }) || null;
      a.mes = ab.filter(function(x){ return x.venc <= HOJE || APP.doMes(x.venc); });
      return a; });
  };
  N.parcelaAc = function(id){ return D().acordos.find(function(x){ return x.id === id; }); };

  /* ── baixa (pagamento) — sempre com confirmação e "Desfazer" ── */
  N.baixa = function(x, o){
    // o: { tit, desc, valor, sub, comprovante (acordo), aposTexto }
    var extra = o.comprovante ? '<div class="campo"><label>O comprovante foi anexado ao processo?</label>' + APP.opcoes('Comprovante', ['Não', 'Sim'], 'Não') + '</div>' : '';
    return APP.confirmar({ kick:'Confirmar pagamento', tit:o.tit || 'Lançar o pagamento?', sub:o.sub, ok:'Confirmar pagamento', data:'Data do pagamento', extra:extra,
      resumo:'<b>' + esc(o.desc) + '</b>' + (o.linha ? '<span>' + o.linha + '</span>' : '') + '<span class="val">' + brl(o.valor) + '</span>' + (o.aviso ? '<span>' + o.aviso + '</span>' : ''),
      ler:o.comprovante ? function(J){ return APP.opcaoDe(J, 'Comprovante'); } : null }).then(function(r){
      if (!r) return false; var data = o.comprovante ? r.data : r;
      APP.acao(o.feito || 'Pagamento lançado.', function(){ var volta = APP.foto(x, o.campo === 'rec' ? ['rec'] : ['pago']); if (o.campo === 'rec') x.rec = data; else x.pago = data; if (o.depois) o.depois(data); return volta; });
      return true;
    });
  };
  N.baixaParcela = function(x){
    var pa = N.pa(x.pa), c = APP.cli(pa.cli);
    return N.baixa(x, { tit:'Lançar o pagamento desta parcela?', sub:esc(c.nome), desc:'Parcela ' + x.n + ' de ' + pa.tot + ' · ' + pa.plat + ' · ' + pa.nat, linha:'Nº ' + pa.num + ' · vencimento ' + APP.fd(x.venc), valor:x.v, feito:'Pagamento lançado: parcela ' + x.n + '/' + pa.tot + ' — ' + APP.curto(c) });
  };
  N.baixaAcordo = function(x){
    var c = APP.cli(x.cli);
    return N.baixa(x, { tit:'Lançar o pagamento desta parcela do acordo?', sub:esc(c.nome) + ' · deve a ' + esc(x.credor), desc:'Parcela ' + x.n + ' de ' + x.tot + ' · processo ' + x.processo, linha:'vencimento ' + APP.fd(x.venc), valor:x.v, comprovante:true, feito:'Pagamento do acordo lançado — ' + APP.curto(c) });
  };
  N.baixaLanc = function(l){
    var c = l.cli ? APP.cli(l.cli) : null, desp = l.tipo === 'despesa' && !l.redutor;
    return N.baixa(l, { tit:desp ? 'Lançar este pagamento?' : 'Lançar este recebimento?', sub:esc(c ? c.nome : l.fav || ''), desc:l.desc, linha:'vencimento ' + APP.fd(l.venc), valor:l.v,
      aviso: !desp && D().emailCfg.recibo.ligado && c && c.email ? 'O recibo em PDF vai sozinho para ' + esc(c.email) + '.' : '', feito:desp ? 'Pagamento lançado.' : 'Recebimento lançado — ' + (c ? APP.curto(c) : ''),
      depois:function(){ if (!desp && D().emailCfg.recibo.ligado && c && c.email) D().emails.push({ id:'e' + Date.now(), cli:l.cli, tipo:'recibo', assunto:'Recibo de pagamento — ' + brl(l.v), para:c.email, status:'enviado', quando:new Date(HOJE) }); } });
  };

  /* ── emitir a guia (parcelamento ou acordo): anexa o PDF, o sistema lê valor e vencimento, e o e-mail sai como RASCUNHO ou DIRETO ── */
  N.janelaEmitir = function(itens, tipo){
    // itens: parcelas do MESMO cliente; tipo: 'guia_parcelamento' | 'guia_acordo'
    var x0 = itens[0], c = tipo === 'guia_acordo' ? APP.cli(x0.cli) : N.cliDe(x0), modo = D().emailCfg[tipo].modo;
    var desc = function(x){ if (tipo === 'guia_acordo') return 'Acordo · processo ' + x.processo + ' · parcela ' + x.n + '/' + x.tot; var pa = N.pa(x.pa); return pa.plat + ' · ' + pa.nat + ' · parcela ' + x.n + '/' + pa.tot; };
    var lidos = {};
    var J = APP.janela({ larga:true, kick:tipo === 'guia_acordo' ? 'Emitir boleto/PIX do acordo' : 'Emitir guias do parcelamento', tit:c.nome, sub:esc(c.doc) + (c.email ? ' · e-mail: ' + esc(c.email) : ' · <b class="vermelho">sem e-mail cadastrado</b>'),
      corpo:'<div class="passos3"><span class="on">1. Anexar a guia (PDF)</span><span>2. Conferir</span><span>3. ' + (modo === 'rascunho' ? 'Salvar no rascunho do Gmail' : 'Enviar') + '</span></div>'
        + '<div class="rola livre"><table class="tab" style="min-width:0"><thead><tr><th>Parcela</th><th class="dir">Valor</th><th class="cen">Vencimento</th><th>Guia (PDF)</th><th>Conferência</th></tr></thead><tbody>'
        + itens.map(function(x){ return '<tr data-x="' + x.id + '"><td>' + esc(desc(x)) + '</td><td class="dir val">' + brl(x.v) + '</td><td class="cen dt">' + APP.fd(x.venc) + '</td>'
          + '<td><label class="bt bt-o bt-mini">' + APP.ic('clipe') + 'Anexar<input type="file" accept="application/pdf" hidden data-pdf="' + x.id + '"></label> <button class="bt bt-g bt-mini" type="button" data-exemplo="' + x.id + '" title="Gera um PDF de exemplo para testar a leitura">exemplo</button></td>'
          + '<td class="conf" data-conf="' + x.id + '"><span class="traco">aguardando o PDF</span></td></tr>'; }).join('') + '</tbody></table></div>'
        + '<div class="campo"><label>Texto do e-mail</label><textarea class="ctl" id="em-tx" style="height:150px!important">' + esc(N.textoGuia(itens, tipo, c)) + '</textarea></div>'
        + '<div class="dica">Como está configurado: <b>' + (modo === 'rascunho' ? 'o e-mail vai para o RASCUNHO do Gmail' : 'o e-mail é ENVIADO direto') + '</b> com as guias anexadas. Troque em Administração → E-mails.</div>',
      rodape:'<button class="bt bt-o" type="button" data-fechar>Cancelar</button><button class="bt bt-o" type="button" id="em-so">Só marcar como emitida</button><button class="bt bt-p" type="button" id="em-ok">' + APP.ic(modo === 'rascunho' ? 'doc' : 'enviar') + (modo === 'rascunho' ? 'Salvar no rascunho' : 'Enviar agora') + '</button>' });
    function conferir(x, pdf){
      lidos[x.id] = pdf;
      var dif = pdf.valor != null && Math.abs(pdf.valor - x.v) > .01, vdif = pdf.venc && +pdf.venc !== +x.venc;
      J.q('[data-conf="' + x.id + '"]').innerHTML = '<span class="' + (dif || vdif ? 'pz-a' : 'ok-txt') + '">' + (pdf.valor != null ? brl(pdf.valor) : 'valor não lido') + ' · ' + (pdf.venc ? APP.fd(pdf.venc) : 'vencimento não lido') + '</span>'
        + (dif ? '<small class="pz-sub">valor diferente da parcela (juros/atualização?) — o novo valor fica gravado</small>' : '') + '<small class="pz-sub">' + esc(pdf.nome) + '</small>';
    }
    J.el.addEventListener('change', function(e){ var inp = e.target.closest('[data-pdf]'); if (!inp || !inp.files[0]) return; var x = itens.find(function(y){ return y.id === inp.dataset.pdf; });
      N.lerPdf(inp.files[0]).then(function(pdf){ conferir(x, pdf); }).catch(function(){ conferir(x, { nome:inp.files[0].name, valor:null, venc:null }); }); });
    J.el.addEventListener('click', function(e){ var b = e.target.closest('[data-exemplo]'); if (!b) return; var x = itens.find(function(y){ return y.id === b.dataset.exemplo; });
      N.lerPdf(N.pdfExemplo(x, tipo, Math.random() < .4)).then(function(pdf){ conferir(x, pdf); }); });
    function gravar(comEmail){
      var falta = itens.filter(function(x){ return !lidos[x.id]; });
      APP.acao(comEmail ? (modo === 'rascunho' ? 'E-mail salvo no rascunho do Gmail com ' + APP.plural(itens.length - falta.length, 'guia', 'guias') + '.' : 'E-mail enviado para ' + (c.email || '—') + '.') : APP.plural(itens.length, 'guia marcada', 'guias marcadas') + ' como emitida(s).', function(){
        var voltas = itens.map(function(x){ var v = APP.foto(x, ['emitida', 'v']); x.emitida = new Date(HOJE); if (lidos[x.id] && lidos[x.id].valor) x.v = lidos[x.id].valor; return v; }), e = null;
        if (comEmail){ e = { id:'e' + Date.now(), cli:c.id, tipo:tipo, assunto:(tipo === 'guia_acordo' ? 'Acordo — ' : 'Guias do mês — ') + APP.curto(c), para:c.email, status:modo === 'rascunho' ? 'rascunho' : (c.email ? 'enviado' : 'erro'), erro:c.email ? '' : 'cliente sem e-mail', quando:new Date(HOJE), anexos:Object.keys(lidos).map(function(k){ return lidos[k].nome; }) }; D().emails.push(e); }
        return function(){ voltas.forEach(function(v){ v(); }); if (e) D().emails.splice(D().emails.indexOf(e), 1); }; });
      J.fechar();
    }
    J.q('#em-so').onclick = function(){ gravar(false); };
    J.q('#em-ok').onclick = function(){
      var falta = itens.filter(function(x){ return !lidos[x.id]; });
      if (!c.email && modo !== 'rascunho'){ APP.aviso('Este cliente não tem e-mail cadastrado. Cadastre em Clientes ou use "Salvar no rascunho".'); return; }
      if (falta.length) APP.confirmar({ tit:'Faltam ' + APP.plural(falta.length, 'guia', 'guias') + ' sem PDF', sub:'O e-mail sai só com as que têm PDF.', ok:'Continuar mesmo assim', resumo:falta.map(function(x){ return '<span>' + esc(desc(x)) + '</span>'; }).join('') }).then(function(s){ if (s) gravar(true); });
      else gravar(true);
    };
    return J;
  };
  N.textoGuia = function(itens, tipo, c){
    var h = new Date().getHours(), oi = h < 12 ? 'Bom dia!' : h < 18 ? 'Boa tarde!' : 'Boa noite!';
    return oi + '\n\n' + (tipo === 'guia_acordo' ? 'Segue a parcela do acordo para pagamento.' : 'Seguem as guias dos parcelamentos com vencimento neste mês ou em atraso.') + '\n\n'
      + itens.map(function(x){ if (tipo === 'guia_acordo') return '• Processo ' + x.processo + ' — parcela ' + x.n + '/' + x.tot + ' — ' + brl(x.v) + ' — vence ' + APP.fd(x.venc);
        var pa = N.pa(x.pa); return '• ' + pa.nat + ' (' + pa.plat + ', nº ' + pa.num + ') — parcela ' + x.n + '/' + pa.tot + ' — ' + brl(x.v) + ' — vence ' + APP.fd(x.venc); }).join('\n')
      + '\n\nQualquer dúvida, é só responder este e-mail.\n\nEquipe Araújo & Castro';
  };

  /* ── leitura do PDF (pdf.js; se não carregar, leitura própria) ── */
  var PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', PDFW = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  function carregarPdfJs(){
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise(function(ok, falha){ var s = document.createElement('script'); s.src = PDFJS; s.onload = function(){ try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFW; } catch (e) {} ok(window.pdfjsLib); }; s.onerror = falha; document.head.appendChild(s); setTimeout(function(){ falha(new Error('tempo')); }, 8000); });
  }
  function textoPdfJs(buf){
    return carregarPdfJs().then(function(lib){ return lib.getDocument({ data:new Uint8Array(buf), isEvalSupported:false }).promise; }).then(function(doc){
      var pags = []; for (var i = 1; i <= Math.min(doc.numPages, 3); i++) pags.push(doc.getPage(i).then(function(p){ return p.getTextContent(); }).then(function(t){ return t.items.map(function(it){ return it.str; }).join(' '); }));
      return Promise.all(pags).then(function(t){ return t.join('\n'); }); });
  }
  function textoProprio(buf){
    var bytes = new Uint8Array(buf), bruto = ''; for (var i = 0; i < bytes.length; i++) bruto += String.fromCharCode(bytes[i]);
    var partes = [bruto], re = /stream\r?\n/g, m, tarefas = [];
    while ((m = re.exec(bruto))){ var ini = m.index + m[0].length, fim = bruto.indexOf('endstream', ini); if (fim < 0) break;
      var dic = bruto.slice(Math.max(0, m.index - 300), m.index);
      if (/FlateDecode/.test(dic) && window.DecompressionStream){ var pedaco = bytes.slice(ini, fim);
        tarefas.push(new Response(new Blob([pedaco]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer().then(function(b){ var u = new Uint8Array(b), s = ''; for (var j = 0; j < u.length; j++) s += String.fromCharCode(u[j]); partes.push(s); }).catch(function(){})); } }
    return Promise.all(tarefas).then(function(){ var out = []; partes.forEach(function(p){ var r2 = /\(((?:\\.|[^\\)])*)\)\s*T[jJ]/g, mm; while ((mm = r2.exec(p))) out.push(mm[1].replace(/\\([()\\])/g, '$1')); }); return out.join('\n'); });
  }
  N.extrair = function(txt){
    var t = String(txt).replace(/\s+/g, ' ');
    var v = t.match(/valor(?:\s+total)?(?:\s+a\s+pagar)?\s*(?:\(r\$\))?\s*[:\-]?\s*(?:r\$\s*)?([\d.]{1,12},\d{2})/i) || t.match(/r\$\s*([\d.]{1,12},\d{2})/i);
    var d = t.match(/(?:data\s+de\s+)?vencimento\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i) || t.match(/(\d{2}\/\d{2}\/\d{4})/);
    return { valor: v ? APP.num(v[1]) : null, venc: d ? APP.deBR(d[1]) : null };
  };
  N.lerPdf = function(arquivo){
    return arquivo.arrayBuffer().then(function(buf){
      return textoPdfJs(buf.slice(0)).then(function(t){ return { t:t }; }, function(){ return textoProprio(buf).then(function(t){ return { t:t }; }); });
    }).then(function(r){ var x = N.extrair(r.t); x.nome = arquivo.name; return x; });
  };
  N.pdfExemplo = function(x, tipo, valorDiferente){
    var c = tipo === 'guia_acordo' ? APP.cli(x.cli) : N.cliDe(x), sem = function(s){ return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[()\\]/g, ''); };
    var linhas = ['DOCUMENTO DE ARRECADACAO - GUIA', 'Contribuinte: ' + sem(c.nome), 'CNPJ/CPF: ' + c.doc, 'Parcela ' + x.n, 'Data de vencimento: ' + APP.fd(x.venc), 'Valor total: R$ ' + (valorDiferente ? x.v * 1.0137 : x.v).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 }), 'Ambiente de teste - documento ficticio'];
    var cont = 'BT /F1 12 Tf 50 780 Td 16 TL ' + linhas.map(function(l){ return '(' + l + ') Tj T*'; }).join(' ') + ' ET';
    var objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      '<< /Length ' + cont.length + ' >>\nstream\n' + cont + '\nendstream', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    var s = '%PDF-1.4\n', offs = [];
    objs.forEach(function(o, i){ offs.push(s.length); s += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    var xref = s.length; s += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(function(o){ return String(o).padStart(10, '0') + ' 00000 n \n'; }).join('') + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    return new File([s], 'guia-' + c.nome.split(' ')[0].toLowerCase() + '-' + x.n + '.pdf', { type:'application/pdf' });
  };

  /* ── pendências (a faixa do Início no lugar dos cartões "Financeiro" e "Escritório") ── */
  N.pendencias = function(){
    var L = [], d = D();
    var recHoje = d.lanc.filter(function(l){ return l.tipo === 'receita' && !l.pago && !l.perda && !l.redutor && l.venc <= HOJE; });
    var pagar = d.lanc.filter(function(l){ return l.tipo === 'despesa' && !l.redutor && !l.pago && l.venc <= new Date(+HOJE + 5 * DIA); });
    var parcAtr = d.parcelas.filter(function(x){ return !x.pago && x.venc <= HOJE; }), guias = d.parcelas.filter(N.paraEmitir);
    var acAtr = d.acordos.filter(function(x){ return !x.pago && x.venc <= HOJE; });
    var pubs = d.publicacoes.filter(function(p){ return !p.lida; }), errosEmail = d.emails.filter(function(e){ return e.status === 'erro'; });
    var tAtr = d.tarefas.filter(function(t){ return !t.feita && t.prazo < HOJE; }), cert = d.clientes.filter(function(c){ return c.certificado && c.certificado <= new Date(+HOJE + 30 * DIA); });
    if (recHoje.length) L.push({ cor:'r', txt:'<b>' + APP.brlK(APP.soma(recHoje, function(l){ return l.v; })) + '</b> de honorários em atraso', ir:'financeiro', arg:{ aba:'areceber', prazo:'venc' }, area:'Financeiro' });
    if (pagar.length) L.push({ cor:'a', txt:'<b>' + APP.brlK(APP.soma(pagar, function(l){ return l.v; })) + '</b> a pagar em 5 dias', ir:'contabilidade', arg:{ aba:'apagar', prazo:'5' }, area:'Financeiro' });
    if (guias.length) L.push({ cor:'a', txt:'<b>' + guias.length + '</b> guias a emitir até dia 12', ir:'rotina', arg:{ aba:'guias' }, area:'Escritório' });
    if (parcAtr.length) L.push({ cor:'r', txt:'<b>' + parcAtr.length + '</b> parcelas de parcelamento em atraso', ir:'parcelamentos', arg:{ prazo:'venc', aba:'apagar' }, area:'Escritório' });
    if (acAtr.length) L.push({ cor:'r', txt:'<b>' + acAtr.length + '</b> parcelas de acordo em atraso', ir:'acordos', arg:{ prazo:'venc', aba:'apagar' }, area:'Escritório' });
    if (pubs.length) L.push({ cor:'b', txt:'<b>' + pubs.length + '</b> publicações novas', ir:'publicacoes', area:'Escritório' });
    if (tAtr.length) L.push({ cor:'r', txt:'<b>' + tAtr.length + '</b> tarefas atrasadas', ir:'tarefas', area:'Escritório' });
    if (errosEmail.length) L.push({ cor:'r', txt:'<b>' + errosEmail.length + '</b> e-mail com erro', ir:'admin', arg:{ aba:'emails', sub:'saida' }, area:'Escritório' });
    if (cert.length) L.push({ cor:'a', txt:'<b>' + cert.length + '</b> certificado vencendo', ir:'clientes', area:'Escritório' });
    return L;
  };

  /* ── linha do tempo do cliente ── */
  N.linhaDoTempo = function(cid){
    var L = [], d = D(), lim = new Date(+HOJE - 120 * DIA);
    d.parcelamentos.filter(function(p){ return p.cli === cid; }).forEach(function(pa){ N.parcelasDe(pa).forEach(function(x){
      if (x.pago && x.pago > lim) L.push({ tipo:'pagamento', quando:x.pago, tit:'Parcela ' + x.n + '/' + pa.tot + ' paga', sub:pa.plat + ' · ' + pa.nat + ' · ' + brl(x.v) });
      if (x.emitida && x.emitida > lim) L.push({ tipo:'guia', quando:x.emitida, tit:'Guia emitida — parcela ' + x.n + '/' + pa.tot, sub:pa.plat + ' · ' + pa.nat });
      if (!x.pago && x.venc <= HOJE) L.push({ tipo:'atraso', quando:x.venc, tit:'Parcela ' + x.n + '/' + pa.tot + ' venceu sem pagamento', sub:pa.plat + ' · ' + pa.nat + ' · ' + brl(x.v) }); }); });
    d.lanc.filter(function(l){ return l.cli === cid && l.pago && l.pago > lim && l.tipo === 'receita'; }).forEach(function(l){ L.push({ tipo:'pagamento', quando:l.pago, tit:'Honorário recebido', sub:l.desc + ' · ' + brl(l.v) }); });
    d.emails.filter(function(e){ return e.cli === cid; }).forEach(function(e){ L.push({ tipo:'email', quando:e.quando, tit:'E-mail ' + ({ enviado:'enviado', rascunho:'salvo no rascunho', erro:'com erro' }[e.status] || e.status), sub:e.assunto }); });
    d.processos.filter(function(p){ return p.cli === cid; }).forEach(function(p){ L.push({ tipo:'processo', quando:p.ultMov.data, tit:'Movimentação — ' + p.natureza, sub:p.numero + ' · ' + p.ultMov.txt }); });
    return L.sort(function(a, b){ return b.quando - a.quando; });
  };

  /* ── índice da busca geral (Ctrl+K): clientes, processos, parcelamentos, telas e ações ── */
  APP.indice = function(){
    var L = [], d = D();
    APP.ordem.forEach(function(id){ var t = APP.telas[id]; if (!t.oculta) L.push({ grupo:'Telas', rot:(t.pai ? t.pai + ' · ' : '') + t.tit, ic:t.ic, fn:function(){ APP.ir(id); } }); });
    [['Nova tarefa', 'tarefa', function(){ APP.ir('tarefas'); APP.telas.tarefas.novo(); }], ['Novo lembrete', 'mais', function(){ APP.ir('inicio'); APP.telas.inicio.novo(); }], ['Emitir as guias do mês', 'doc', function(){ APP.ir('rotina', { aba:'guias' }); }],
      ['Ver como o cliente vê (portal)', 'portal', function(){ APP.ir('portal'); }], ['Textos: antes → depois', 'texto', function(){ APP.ir('aprovar'); }]].forEach(function(a){ L.push({ grupo:'Ações', rot:a[0], ic:a[1], fn:a[2] }); });
    d.clientes.forEach(function(c){ L.push({ grupo:'Clientes', rot:c.nome, sub:c.doc, extra:c.doc.replace(/\D/g, '') + ' ' + APP.grupo(c.g).nome, ic:'pessoas', fn:function(){ APP.ir('clientes'); APP.fichaCliente(c.id); } }); });
    d.processos.forEach(function(p){ L.push({ grupo:'Processos', rot:p.numero, sub:p.natureza + ' · ' + APP.curto(APP.cli(p.cli)), extra:p.numero.replace(/\D/g, ''), ic:'balanca', fn:function(){ APP.ir('processos'); APP.janelaProcesso(p); } }); });
    d.parcelamentos.forEach(function(pa){ var c = APP.cli(pa.cli); L.push({ grupo:'Parcelamentos', rot:pa.nat + ' · ' + pa.plat, sub:APP.curto(c) + ' · nº ' + pa.num, extra:pa.num.replace(/\D/g, '') + ' ' + c.nome, ic:'camadas', fn:function(){ APP.ir('parcelamentos'); APP.janelaParcelamento(pa); } }); });
    return L;
  };
})();
