// ═══ Backup 74 — Financeiro › Análise na estrutura do ambiente de teste (pedido do usuário, print de 13/10/2026) ═══
// Mesmo conteúdo de antes (os filtros Quem/Período/Recorte continuam), com o desenho novo:
// faixa de números · "Recebido mês a mês" (empilhado por pessoa) · Comparativo por pessoa (tabela nova) ·
// "Por tipo de serviço" e "Maiores grupos" em barras simples (nome · barra · valor). Vale para Jurídico e Contabilidade.
function _barrasB(lista, max){
  lista = lista.filter(function(x){ return x[1] > 0; }).sort(function(a,b){ return b[1]-a[1]; }).slice(0, max || 10);
  if (!lista.length) return '<div class="b-barras-vazio">Nada no período.</div>';
  var topo = lista[0][1] || 1;
  return '<div class="b-barras">' + lista.map(function(x){
    return '<div class="b-barra-lin"><span class="b-barra-rot" title="'+esc(x[0])+'">'+esc(x[0])+'</span><span class="b-barra-trilho"><span style="width:'+Math.max(2, Math.round(x[1]/topo*100))+'%"></span></span><b class="b-barra-val">'+fF(x[1])+'</b></div>';
  }).join('') + '</div>';
}
function _somaPor(lista, chave, val){ var M={}; lista.forEach(function(f){ var k=chave(f)||'Não informado'; M[k]=(M[k]||0)+val(f); }); return Object.keys(M).map(function(k){ return [k, M[k]]; }); }
function _numsB(itens){
  return '<div class="b-nums b-nums-faixa b-nums-'+itens.length+'">' + itens.map(function(i){
    return '<div><span>'+esc(i[0])+'</span><b class="'+(i[3]||'')+'">'+i[1]+'</b><small>'+esc(i[2]||'')+'</small></div>'; }).join('') + '</div>';
}
function _cartaoB(tit, sub, corpo, extra){ return '<section class="b-fin-cartao'+(extra?' '+extra:'')+'"><div class="b-fin-hd"><h3>'+esc(tit)+'</h3>'+(sub?'<p>'+esc(sub)+'</p>':'')+'</div>'+corpo+'</section>'; }
function _faTabelaPessoasB(pessoas){
  var cliente=_acCliente();
  var linhas=pessoas.map(function(p){
    var salvo=_FA.quem; _FA.quem=[p];
    var rec=_faFiltrar(['Receita']), ar=_faFiltrar(['A Receber']), pj=_faFiltrar(['Prejuízo']);
    _FA.quem=salvo;
    return {p:p, rec:_faSoma(rec), n:rec.length, ar:_faSoma(ar), pj:_faSoma(pj), tk:rec.length?_faSoma(rec)/rec.length:0};
  }).sort(function(a,b){ return b.rec-a.rec; });
  if (!linhas.length) return '<div class="b-barras-vazio">Nada no período.</div>';
  var tot=linhas.reduce(function(s,l){ return s+l.rec; },0)||1, sN=0, sA=0, sP=0; linhas.forEach(function(l){ sN+=l.n; sA+=l.ar; sP+=l.pj; });
  var td=function(v, cls){ return '<td class="b-dir'+(cls?' '+cls:'')+'">'+v+'</td>'; };
  return '<div class="b-rola b-rola-solta" data-sem-pagina><table class="b-tab b-tab-comp"><thead><tr><th>Pessoa</th><th class="b-dir">Recebido</th><th class="b-dir">%</th><th class="b-cen">Lançamentos</th><th class="b-dir">Ticket médio</th><th class="b-dir">A receber</th>'+(cliente?'':'<th class="b-dir">Prejuízo</th>')+'</tr></thead><tbody>'
    + linhas.map(function(l){ return '<tr><td><span class="b-pes">'+esc(l.p)+'</span></td>'+td(fF(l.rec),'b-verde-v')+td(Math.round(l.rec/tot*100)+'%')+'<td class="b-cen">'+l.n+'</td>'+td(l.tk?fF(l.tk):'—')+td(l.ar?fF(l.ar):'—')+(cliente?'':td(l.pj?fF(l.pj):'—'))+'</tr>'; }).join('')
    + '</tbody><tfoot><tr><td>Total</td>'+td(fF(tot===1&&!linhas[0].rec?0:linhas.reduce(function(s,l){ return s+l.rec; },0)))+td('100%')+'<td class="b-cen">'+sN+'</td><td></td>'+td(sA?fF(sA):'—')+(cliente?'':td(sP?fF(sP):'—'))+'</tr></tfoot></table></div>';
}
function _faPintarCorpo(){
  var el=$('faCorpo'); if(!el) return;
  var hoje=new Date(); hoje.setHours(0,0,0,0);
  var receita=_faFiltrar(['Receita']), aReceber=_faFiltrar(['A Receber']);
  var prejuizo=window._semPeriodo(_FA,function(){ return _faFiltrar(['Prejuízo']); });
  var vencidos=window._semPeriodo(_FA,function(){ return _faFiltrar(['A Receber']); }).filter(function(f){ var d=pDate(f.vencimento); return d&&d<hoje; });
  var vRec=_faSoma(receita), vPrej=_faSoma(prejuizo), vVenc=_faSoma(vencidos), ticket=receita.length? vRec/receita.length : 0, cliente=_acCliente();
  var aVenc=aReceber.filter(function(f){ return vencidos.indexOf(f)<0; }), aPag=_faFiltrar(['A Pagar']);
  var nums=[['Recebido',fF(vRec),_pluralB(receita.length,'recebimento','recebimentos'),'b-verde'],['A receber',fF(_faSoma(aVenc)),aVenc.length+' em aberto']]
    .concat(cliente?[]:[['A pagar',fF(_faSoma(aPag)),_pluralB(aPag.length,'conta em aberto','contas em aberto')]])
    .concat([['Em atraso',fF(vVenc),'todos os meses',vVenc>0?'b-verm':'']])
    .concat(cliente?[]:[['Prejuízo',fF(vPrej),_pluralB(prejuizo.length,'baixa','baixas')]])
    .concat([['Ticket médio',fF(ticket),'por recebimento']]);
  el.innerHTML = _numsB(nums)
    + _cartaoB('Recebido mês a mês','Empilhado por pessoa. Passe o mouse na coluna para ver o valor.','<div class="cb b-fin-graf"><canvas id="cFaMes"></canvas></div>')
    + _cartaoB('Comparativo por pessoa','', _faTabelaPessoasB(_faPessoas()))
    + '<div class="b-fin-dois">'
    +   _cartaoB('Por tipo de serviço','', _barrasB(_somaPor(receita, function(f){ return f.servico; }, _faVal)))
    +   _cartaoB('Maiores grupos','', _barrasB(_somaPor(receita, function(f){ return f.grupo; }, _faVal)))
    + '</div>';
  _faGraficos(receita);
}
function _pluralB(n, um, varios){ return n + ' ' + (n === 1 ? um : varios); }
