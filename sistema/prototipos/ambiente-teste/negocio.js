/* Regras do ambiente de teste: parcelas, automações (quando cada uma roda e para quem), e-mails com conferência,
   leitura do PDF da guia e linha do tempo do cliente. */
(function(){
  var APP = window.APP, DIA = DADOS.DIA, HOJE = DADOS.HOJE, esc = APP.esc, brl = APP.brl;
  var N = APP.N = {};

  /* ── parcelamentos ── */
  N.pa = function(id){ return APP.D.parcelamentos.find(function(p){ return p.id === id; }); };
  N.parcela = function(id){ return APP.D.parcelas.find(function(x){ return x.id === id; }); };
  N.parcelasDe = function(pa){ return APP.D.parcelas.filter(function(x){ return x.pa === pa.id; }).sort(function(a, b){ return a.n - b.n; }); };
  N.estado = function(x){ return x.pago ? 'pagas' : (x.venc <= HOJE ? 'atraso' : 'avencer'); };
  N.resumo = function(pa){
    var r = { pg:0, atr:0, falta:0, quitado:0, prox:null, tot:pa.tot };
    N.parcelasDe(pa).forEach(function(x){ if (x.pago){ r.pg++; r.quitado += x.v; } else { r.falta += x.v; if (x.venc <= HOJE) r.atr++; if (!r.prox) r.prox = x; } });
    return r;
  };
  N.cliDe = function(x){ return APP.cli((x.pa ? N.pa(x.pa) : x).cli); };
  N.grupoDe = function(x){ return N.cliDe(x).g; };
  N.paraEmitir = function(x){ var pa = N.pa(x.pa); return !pa.cliEmite && !x.pago && !x.emitida && (x.venc <= HOJE || APP.doMes(x.venc)); };

  /* ── automações: configuração efetiva para um cliente ── */
  N.auto = function(id){ return APP.D.automacoes.find(function(a){ return a.id === id; }); };
  N.regra = function(autoId, cliId){
    var a = N.auto(autoId), o = ((APP.D.porCliente[cliId] || {})[autoId]) || { modo:'padrao' };
    var cli = cliId ? APP.cli(cliId) : null;
    var ligada = a.ligada && o.modo !== 'desligado' && (!cli || a.grupo !== 'cliente' || cli.recebeEmail !== false);
    return { modo:o.modo, ligada:ligada, dias:o.modo === 'personalizado' && o.dias != null ? o.dias : a.dias, hora:o.modo === 'personalizado' && o.hora ? o.hora : a.hora,
      motivo:!a.ligada ? 'automação desligada para todos' : o.modo === 'desligado' ? 'desligada para este cliente' : cli && a.grupo === 'cliente' && cli.recebeEmail === false ? 'cliente não recebe e-mails' : '' };
  };
  function quando(dia, hora){ var h = String(hora || '08:00').split(':'); var d = new Date(dia); d.setHours(+h[0], +h[1], 0, 0); return d; }
  function proxDiaMes(diaMes){ var d = new Date(HOJE.getFullYear(), HOJE.getMonth(), diaMes); if (d < HOJE) d = new Date(HOJE.getFullYear(), HOJE.getMonth() + 1, diaMes); return d; }

  // o que cada automação vai fazer nos próximos dias — "quando acontece, para quem e por quê"
  N.proximas = function(dias){
    var fim = new Date(+HOJE + (dias || 14) * DIA), L = [], D = APP.D;
    function add(o){ if (o.quando >= HOJE && o.quando <= new Date(+fim + DIA)) L.push(o); }
    // A1 resumo da manhã
    var a1 = N.auto('resumo_manha');
    for (var i = 0; i <= (dias || 14); i++){ var d = new Date(+HOJE + i * DIA); if (a1.uteis && (d.getDay() === 0 || d.getDay() === 6)) continue;
      a1.quem.forEach(function(p){ add({ auto:'resumo_manha', quando:quando(d, a1.hora), para:APP.pessoa(p).nome, oque:'Resumo da manhã', ligada:a1.ligada, motivo:a1.ligada ? '' : 'automação desligada' }); }); }
    // A2 lembrete da parcela
    D.parcelas.forEach(function(x){ if (x.pago) return; var pa = N.pa(x.pa), r = N.regra('lembrete_parcela', pa.cli), dia = new Date(+x.venc - (r.dias || 0) * DIA);
      if (dia < HOJE && x.venc >= HOJE) dia = new Date(HOJE);
      add({ auto:'lembrete_parcela', quando:quando(dia, r.hora), cli:pa.cli, para:APP.cli(pa.cli).nome, oque:'Lembrete da parcela ' + x.n + '/' + pa.tot + ' (' + pa.plat + ' · ' + pa.nat + ') — vence ' + APP.fd(x.venc), ligada:r.ligada, motivo:r.motivo, ref:x.id }); });
    // A3 guia emitida → e-mail pronto (acontece quando a guia for emitida)
    D.parcelas.filter(N.paraEmitir).forEach(function(x){ var pa = N.pa(x.pa), r = N.regra('guia_emitida', pa.cli);
      add({ auto:'guia_emitida', quando:quando(HOJE, '23:59'), quandoTxt:'ao emitir a guia', cli:pa.cli, para:APP.cli(pa.cli).nome, oque:'E-mail com a guia da parcela ' + x.n + '/' + pa.tot + ' (' + pa.nat + ')', ligada:r.ligada, motivo:r.motivo, ref:x.id }); });
    // A4 risco de rescisão
    var a4 = N.auto('risco_rescisao');
    D.parcelamentos.forEach(function(pa){ var rs = N.resumo(pa), g = APP.grupo(APP.cli(pa.cli).g);
      if (rs.atr === a4.limite - 1 && rs.prox && rs.prox.venc > HOJE) add({ auto:'risco_rescisao', quando:quando(new Date(+rs.prox.venc + DIA), '08:00'), cli:pa.cli, para:APP.pessoa(g.resp).nome, oque:'Tarefa "parcelamento em risco" se a parcela de ' + APP.fd(rs.prox.venc) + ' não for paga — ' + APP.cli(pa.cli).nome + ' (' + pa.nat + ')', ligada:a4.ligada, motivo:a4.ligada ? '' : 'automação desligada' }); });
    // A6 conferência mensal
    var a6 = N.auto('conferencia_mes');
    add({ auto:'conferencia_mes', quando:quando(proxDiaMes(a6.diaMes), a6.hora), para:APP.pessoa(a6.resp).nome, oque:'Tarefa "Conferir os parcelamentos do mês" com a lista pronta', ligada:a6.ligada, motivo:a6.ligada ? '' : 'automação desligada' });
    // pedido de documentos do mês
    var a7 = N.auto('docs_mes');
    Object.keys(D.docsCliente).forEach(function(cid){ var r = N.regra('docs_mes', cid), dia = proxDiaMes(a7.diaMes), falta = N.docsFaltando(cid, dia);
      add({ auto:'docs_mes', quando:quando(dia, r.hora), cli:cid, para:APP.cli(cid).nome, oque:'Pedido dos documentos de ' + mesNome(new Date(dia.getFullYear(), dia.getMonth() - 1, 1)) + (falta.length ? ' (' + falta.length + ' itens)' : ''), ligada:r.ligada, motivo:r.motivo }); });
    // cobrança de honorário
    D.honorarios.forEach(function(h){ if (h.rec) return; var r = N.regra('cobranca_honorario', h.cli), dia = new Date(+h.venc + (r.dias || 0) * DIA); if (dia < HOJE) dia = new Date(HOJE);
      add({ auto:'cobranca_honorario', quando:quando(dia, r.hora), cli:h.cli, para:APP.cli(h.cli).nome, oque:'Cobrança educada — ' + h.desc + ' (' + brl(h.v) + ', venc. ' + APP.fd(h.venc) + ')', ligada:r.ligada, motivo:r.motivo }); });
    return L.sort(function(a, b){ return a.quando - b.quando; });
  };
  function mesNome(d){ return ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'][d.getMonth()] + '/' + d.getFullYear(); }
  N.mesNome = mesNome;

  /* ── documentos por competência ── */
  N.comp = function(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  N.docsFaltando = function(cid, ref){ var comp = N.comp(new Date(ref.getFullYear(), ref.getMonth() - 1, 1)), rec = APP.D.docsRecebidos[cid + '|' + comp] || [];
    return (APP.D.docsCliente[cid] || []).filter(function(t){ return rec.indexOf(t) < 0; }); };

  /* ── A4: varrer os parcelamentos em risco (roda sozinho; aqui também pelo botão "Rodar agora") ── */
  N.varrerRiscos = function(){
    var a4 = N.auto('risco_rescisao'), novas = [];
    if (!a4.ligada) return novas;
    APP.D.parcelamentos.forEach(function(pa){ var rs = N.resumo(pa); if (rs.atr < a4.limite) return;
      if (APP.D.tarefas.some(function(t){ return t.origem === 'risco_rescisao' && t.ref === pa.id && !t.feita; })) return;
      var c = APP.cli(pa.cli), t = { id:'t' + Date.now() + novas.length, tit:'Parcelamento em risco: ' + c.nome + ' — ' + pa.nat + ' (' + rs.atr + ' parcelas em atraso)', resp:APP.grupo(c.g).resp, prazo:new Date(+HOJE + DIA), origem:'risco_rescisao', feita:null, ref:pa.id };
      APP.D.tarefas.push(t); novas.push(t); });
    return novas;
  };

  /* ── baixa de parcela (sempre com confirmação) ── */
  N.baixaParcela = function(x){
    var pa = N.pa(x.pa), c = APP.cli(pa.cli);
    return APP.confirmar({ kick:'Confirmar pagamento', tit:'Lançar o pagamento desta parcela?', sub:esc(c.nome), ok:'Confirmar pagamento', data:'Data do pagamento',
      resumo:'<b>Parcela ' + x.n + ' de ' + pa.tot + ' · ' + pa.plat + ' · ' + esc(pa.nat) + '</b><span>Nº ' + pa.num + ' · vencimento ' + APP.fd(x.venc) + '</span><span class="val">' + brl(x.v) + '</span>' }).then(function(data){
      if (!data) return false;
      APP.acao('Pagamento lançado: parcela ' + x.n + '/' + pa.tot + ' — ' + c.nome.split(' ').slice(0, 2).join(' '), function(){ var volta = APP.foto(x, ['pago']); x.pago = data; return volta; });
      return true;
    });
  };
  N.baixaLote = function(lista){
    var soma = lista.reduce(function(s, x){ return s + x.v; }, 0);
    return APP.confirmar({ kick:'Confirmar pagamento em lote', tit:'Lançar o pagamento de ' + APP.plural(lista.length, 'parcela', 'parcelas') + '?', ok:'Confirmar pagamentos', data:'Data do pagamento',
      resumo:'<b>' + brl(soma) + '</b>' + lista.slice(0, 8).map(function(x){ var pa = N.pa(x.pa); return '<span>' + esc(APP.cli(pa.cli).nome) + ' · parcela ' + x.n + '/' + pa.tot + ' · ' + brl(x.v) + '</span>'; }).join('') + (lista.length > 8 ? '<span>… e mais ' + (lista.length - 8) + '</span>' : '') }).then(function(data){
      if (!data) return false;
      APP.acao(APP.plural(lista.length, 'pagamento lançado', 'pagamentos lançados') + ' (' + brl(soma) + ').', function(){ var voltas = lista.map(function(x){ var v = APP.foto(x, ['pago']); x.pago = data; return v; }); return function(){ voltas.forEach(function(v){ v(); }); }; });
      return true;
    });
  };
  N.receberHonorario = function(h){
    var c = APP.cli(h.cli);
    return APP.confirmar({ kick:'Confirmar recebimento', tit:'Lançar o recebimento deste honorário?', sub:esc(c.nome), ok:'Confirmar recebimento', data:'Data do recebimento',
      resumo:'<b>' + esc(h.desc) + (h.tot ? ' · parcela ' + h.n + ' de ' + h.tot : '') + '</b><span>' + h.tipo + ' · vencimento ' + APP.fd(h.venc) + '</span><span class="val">' + brl(h.v) + '</span>'
        + (N.regra('recibo', h.cli).ligada ? '<span>O recibo em PDF vai para ' + esc(c.email || 'o e-mail do cadastro') + ' (automação "Recibo de pagamento").</span>' : '') }).then(function(data){
      if (!data) return false;
      APP.acao('Recebimento lançado — ' + c.nome.split(' ').slice(0, 2).join(' '), function(){
        var volta = APP.foto(h, ['rec']); h.rec = data; var e = null;
        if (N.regra('recibo', h.cli).ligada && c.email){ e = { id:'e' + Date.now(), cli:h.cli, assunto:'Recibo de pagamento — ' + brl(h.v), para:c.email, status:'enviado', origem:'recibo', quando:new Date(), criado:new Date() }; APP.D.emails.push(e); }
        return function(){ volta(); if (e) APP.D.emails.splice(APP.D.emails.indexOf(e), 1); }; });
      return true;
    });
  };

  /* ── A3/A5: emitir a guia, ler o PDF e deixar o e-mail pronto ── */
  N.emitir = function(x, pdf){
    var pa = N.pa(x.pa), c = APP.cli(pa.cli), r3 = N.regra('guia_emitida', pa.cli);
    var volta = APP.foto(x, ['emitida', 'pdf']); x.emitida = new Date(HOJE); x.pdf = pdf || null; var e = null;
    if (r3.ligada && (c.fiscal || c.email)){
      e = { id:'e' + Date.now() + Math.round(Math.random() * 1e3), cli:pa.cli, assunto:'Guia do parcelamento — vence em ' + APP.fd(x.venc), para:c.fiscal || c.email, status:N.auto('guia_emitida').modo === 'enviar' ? 'agendado' : 'revisar', origem:'guia_emitida',
        anexo: pdf ? { nome:pdf.nome, valor:pdf.valor, venc:pdf.venc } : null, parcela:x.id, criado:new Date(), quando:new Date() };
      APP.D.emails.push(e);
    }
    return function(){ volta(); if (e) APP.D.emails.splice(APP.D.emails.indexOf(e), 1); };
  };
  N.textoGuia = function(x){
    var pa = N.pa(x.pa), c = APP.cli(pa.cli);
    return 'Olá,\n\nSegue a guia da parcela ' + x.n + ' de ' + pa.tot + ' do parcelamento ' + pa.nat + ' (' + pa.plat + ', nº ' + pa.num + ') de ' + c.nome + '.\n\nValor: ' + brl(x.v) + '\nVencimento: ' + APP.fd(x.venc)
      + '\n\nPague até o vencimento para manter o parcelamento em dia. Qualquer dúvida, é só responder este e-mail.\n\nAraújo & Castro Advocacia';
  };

  // ROMPEX "envio seguro" + "conferir anexo": a lista do que precisa estar certo antes de enviar
  N.checagens = function(e){
    var c = APP.cli(e.cli), L = [], x = e.parcela ? N.parcela(e.parcela) : null;
    var dom = function(m){ return String(m || '').split('@')[1] || ''; };
    var conhecidos = [c.email, c.fiscal].filter(Boolean);
    L.push(e.para ? { ok:true, txt:'Destinatário preenchido: ' + e.para } : { ok:false, txt:'Sem destinatário. Cadastre o e-mail do cliente.' });
    if (e.para) L.push(conhecidos.indexOf(e.para) >= 0 ? { ok:true, txt:'O endereço é um dos cadastrados para este cliente.' }
      : conhecidos.some(function(m){ return dom(m) === dom(e.para); }) ? { av:true, txt:'Endereço novo, mas do mesmo domínio do cliente (' + dom(e.para) + ').' } : { ok:false, txt:'Endereço fora do cadastro do cliente — confira antes de enviar.' });
    if (c.recebeEmail === false) L.push({ ok:false, txt:'Este cliente está marcado para NÃO receber e-mails.' });
    if (x){
      if (!e.anexo) L.push({ ok:false, txt:'Falta anexar o PDF da guia.' });
      else {
        L.push(Math.abs((e.anexo.valor || 0) - x.v) < 0.01 ? { ok:true, txt:'Valor do PDF (' + brl(e.anexo.valor) + ') igual ao da parcela.' } : { av:true, txt:'Valor do PDF (' + (e.anexo.valor != null ? brl(e.anexo.valor) : 'não lido') + ') diferente do da parcela (' + brl(x.v) + '). Se a guia veio com juros/atualização, está certo.' });
        L.push(e.anexo.venc && +e.anexo.venc === +x.venc ? { ok:true, txt:'Vencimento do PDF igual ao da parcela (' + APP.fd(x.venc) + ').' } : { av:true, txt:'Vencimento do PDF (' + (e.anexo.venc ? APP.fd(e.anexo.venc) : 'não lido') + ') diferente do da parcela (' + APP.fd(x.venc) + ').' });
        var nome = String(e.anexo.nome || '').toLowerCase(), chave = c.nome.split(' ')[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        L.push(nome.indexOf(chave) >= 0 || nome.indexOf(N.pa(x.pa).num.replace(/\D/g, '').slice(-5)) >= 0 ? { ok:true, txt:'O nome do arquivo bate com o cliente/parcelamento.' } : { av:true, txt:'O nome do arquivo (' + e.anexo.nome + ') não cita o cliente nem o nº do parcelamento — abra e confira.' });
      }
    }
    return L;
  };

  /* ── A5: ler valor e vencimento do PDF (pdf.js; se não carregar, leitura própria do PDF) ── */
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
  // leitura própria: textos entre parênteses dos blocos de texto (inclusive comprimidos com FlateDecode)
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
    return { valor: v ? APP.num(v[1]) : null, venc: d ? APP.deBR(d[1]) : null, trecho: t.slice(0, 240) };
  };
  N.lerPdf = function(arquivo){
    if (!N.auto('leitura_pdf').ligada) return Promise.resolve({ nome:arquivo.name, valor:null, venc:null, como:'leitura desligada' });
    return arquivo.arrayBuffer().then(function(buf){
      return textoPdfJs(buf.slice(0)).then(function(t){ return { t:t, como:'pdf.js' }; }, function(){ return textoProprio(buf).then(function(t){ return { t:t, como:'leitura própria' }; }); });
    }).then(function(r){ var x = N.extrair(r.t); x.nome = arquivo.name; x.como = r.como; return x; });
  };
  // guia de exemplo em PDF (para testar a leitura sem ter uma guia real à mão)
  N.pdfExemplo = function(x, valorDiferente){
    var pa = N.pa(x.pa), c = APP.cli(pa.cli), sem = function(s){ return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[()\\]/g, ''); };
    var linhas = ['DOCUMENTO DE ARRECADACAO - GUIA DE PARCELAMENTO', 'Contribuinte: ' + sem(c.nome), 'CNPJ/CPF: ' + c.doc, 'Parcelamento ' + sem(pa.plat) + ' - ' + sem(pa.nat) + ' n. ' + pa.num,
      'Parcela ' + x.n + ' de ' + pa.tot, 'Data de vencimento: ' + APP.fd(x.venc), 'Valor total: R$ ' + (valorDiferente ? x.v * 1.0137 : x.v).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 }), 'Ambiente de teste - documento ficticio'];
    var cont = 'BT /F1 12 Tf 50 780 Td 16 TL ' + linhas.map(function(l){ return '(' + l + ') Tj T*'; }).join(' ') + ' ET';
    var objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      '<< /Length ' + cont.length + ' >>\nstream\n' + cont + '\nendstream', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    var s = '%PDF-1.4\n', offs = [];
    objs.forEach(function(o, i){ offs.push(s.length); s += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    var xref = s.length; s += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(function(o){ return String(o).padStart(10, '0') + ' 00000 n \n'; }).join('') + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    return new File([s], 'guia-' + c.nome.split(' ')[0].toLowerCase() + '-' + pa.num.replace(/\D/g, '').slice(-5) + '-' + x.n + '.pdf', { type:'application/pdf' });
  };

  /* ── E5: linha do tempo do cliente ── */
  N.linhaDoTempo = function(cid){
    var L = [], D = APP.D;
    D.parcelamentos.filter(function(p){ return p.cli === cid; }).forEach(function(pa){
      N.parcelasDe(pa).forEach(function(x){
        if (x.pago && x.pago > new Date(+HOJE - 120 * DIA)) L.push({ tipo:'pagamento', quando:x.pago, tit:'Parcela ' + x.n + '/' + pa.tot + ' paga', sub:pa.plat + ' · ' + pa.nat + ' · ' + brl(x.v) });
        if (x.emitida && x.emitida > new Date(+HOJE - 120 * DIA)) L.push({ tipo:'guia', quando:x.emitida, tit:'Guia emitida — parcela ' + x.n + '/' + pa.tot, sub:pa.plat + ' · ' + pa.nat + ' · vence ' + APP.fd(x.venc) });
        if (!x.pago && x.venc <= HOJE) L.push({ tipo:'atraso', quando:x.venc, tit:'Parcela ' + x.n + '/' + pa.tot + ' venceu sem pagamento', sub:pa.plat + ' · ' + pa.nat + ' · ' + brl(x.v) });
      }); });
    D.honorarios.filter(function(h){ return h.cli === cid && h.rec; }).forEach(function(h){ L.push({ tipo:'pagamento', quando:h.rec, tit:'Honorário recebido', sub:h.desc + ' · ' + brl(h.v) }); });
    D.emails.filter(function(e){ return e.cli === cid; }).forEach(function(e){ L.push({ tipo:'email', quando:e.quando || e.criado, tit:'E-mail ' + ({ enviado:'enviado', revisar:'pronto para revisar', agendado:'agendado' }[e.status] || e.status), sub:e.assunto }); });
    D.tarefas.filter(function(t){ var pa = t.ref && N.pa(t.ref); return pa && pa.cli === cid; }).forEach(function(t){ L.push({ tipo:'tarefa', quando:t.feita || t.prazo, tit:(t.feita ? 'Tarefa concluída' : 'Tarefa aberta'), sub:t.tit }); });
    Object.keys(D.docsRecebidos).forEach(function(k){ var p = k.split('|'); if (p[0] !== cid) return; var a = p[1].split('-');
      L.push({ tipo:'documento', quando:new Date(+a[0], +a[1], 6), tit:'Documentos de ' + mesNome(new Date(+a[0], +a[1] - 1, 1)) + ' recebidos', sub:D.docsRecebidos[k].map(function(i){ return D.tiposDoc[i]; }).join(', ') }); });
    return L.sort(function(a, b){ return b.quando - a.quando; });
  };
})();
