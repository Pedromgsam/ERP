// ═══ Backup 27 — Financeiro Contabilidade: Análise ÚNICA (sem os cartões "Recebimentos / Pagamentos") ═══
// • Números dos dois lados: Recebido, A receber, Pago, A pagar e Em atraso.
// • "Recebido × pago mês a mês": recebido em verde e pago em vermelho (as cores do Recebido mês a mês do Jurídico).
// • Duas tabelas: Comparativo por cliente e Comparativo por fornecedor.
// • "Em atraso" com a coluna Receita / Despesa.
// Os chips de Cliente e o Recorte (tipo) valem para as receitas; período vale para tudo.
function _fcFiltrarPag(abas){
  var jan=_fcJanela();
  return _finCDados().filter(function(f){
    if(abas.indexOf(f.aba)<0) return false;
    if(_FC.grupo && f.grupo!==_FC.grupo) return false;
    if(jan){ var d=_fcData(f); if(!d||d<jan[0]||d>jan[1]) return false; }
    return true;
  });
}
function _fcComLado(lado, fn){ var s={lado:_FC.lado,quem:_FC.quem,recorte:_FC.recorte}; _FC.lado=lado; if(lado==='pagar'){ _FC.quem=[]; _FC.recorte=''; }
  try { return fn(); } finally { _FC.lado=s.lado; _FC.quem=s.quem; _FC.recorte=s.recorte; } }
function _fcPintarCorpo(){
  var el=$('fcCorpo'); if(!el) return;
  var R=_FC_LADOS.receber, P=_FC_LADOS.pagar, hoje=new Date(); hoje.setHours(0,0,0,0);
  var rec=_fcFiltrar([R.abaFechado]), aRec=_fcFiltrar([R.abaAberto]);
  var pag=_fcFiltrarPag([P.abaFechado]), aPag=_fcFiltrarPag([P.abaAberto]);
  var venc=function(f){ var d=pDate(f.vencimento); return d&&d<hoje; };
  var vR=window._semPeriodo(_FC,function(){ return _fcFiltrar([R.abaAberto]); }).filter(venc);
  var vP=window._semPeriodo(_FC,function(){ return _fcFiltrarPag([P.abaAberto]); }).filter(venc);
  var atraso=vR.map(function(f){ return {f:f,t:'r'}; }).concat(vP.map(function(f){ return {f:f,t:'d'}; }))
    .sort(function(a,b){ return (pDate(a.f.vencimento)||0)-(pDate(b.f.vencimento)||0); });
  el.innerHTML =
    '<div class="kpi-grid fc-kpis5" style="margin-bottom:14px">'
  +   kC('Recebido',fF(_fcSoma(rec)),rec.length+' lançamento(s)','cg','dg')
  +   kC('A receber',fF(_fcSoma(aRec)),aRec.length+' em aberto','cb','db')
  +   kC('Pago',fF(_fcSoma(pag)),pag.length+' despesa(s)','cr','')
  +   kC('A pagar',fF(_fcSoma(aPag)),aPag.length+' em aberto','ca','')
  +   kC('Em atraso',fF(_fcSoma(vR)+_fcSoma(vP)),fF(_fcSoma(vR))+' a receber<br>'+fF(_fcSoma(vP))+' a pagar','cr',(vR.length||vP.length)?'dr':'')
  + '</div>'
  + '<div class="cc" style="margin-bottom:14px"><div class="cc-hd"><div><div class="cc-t">Recebido × pago mês a mês</div>'
  +   '<div class="cc-d">verde = recebido · vermelho = pago (despesas) · passe o mouse na coluna para ver o saldo do mês</div></div></div>'
  +   '<div class="cb" style="height:280px"><canvas id="cFcMes"></canvas></div></div>'
  + '<div hidden aria-hidden="true"><canvas id="cFcQuem"></canvas></div>'
  + '<div class="cc" style="margin-bottom:14px"><div class="cc-hd"><div><div class="cc-t">Comparativo por cliente</div><div class="cc-d">receitas · mesmo período e mesmos recortes acima</div></div></div>'
  +   _fcComLado('receber', function(){ return _fcTabelaComp(_fcTabelaPessoas(_fcPessoas())); }) + '</div>'
  + '<div class="cc" style="margin-bottom:14px"><div class="cc-hd"><div><div class="cc-t">Comparativo por fornecedor</div><div class="cc-d">despesas · mesmo período</div></div></div>'
  +   _fcComLado('pagar', function(){ return _fcTabelaComp(_fcTabelaPessoas(_fcPessoas())).replace('<th style="text-align:right">Recebido</th>','<th style="text-align:right">Pago</th>').replace('<th style="text-align:right">A receber</th>','<th style="text-align:right">A pagar</th>').replace(/color:var\(--green-d\);font-weight:600/g,'color:var(--red-d);font-weight:600'); }) + '</div>'
  + (atraso.length?'<div class="cc" style="margin-bottom:14px"><div class="cc-hd"><div><div class="cc-t">Em atraso</div><div class="cc-d">receitas e despesas vencidas · todos os meses</div></div></div>'+_fcTabelaAtraso(atraso)+'</div>':'');
  _fcGraficosB27(rec, pag);
}
function _fcTabelaAtraso(L){
  var h=new Date(); h.setHours(0,0,0,0);
  return '<div class="tw scr" data-sem-gs><table><thead><tr><th>Vencimento</th><th>Tipo</th><th>Cliente / fornecedor</th><th>Tipo / categoria</th><th>Referência</th><th style="text-align:right">Valor</th><th style="text-align:right">Atraso</th></tr></thead><tbody>'
   + L.slice(0,400).map(function(x){ var f=x.f, d=pDate(f.vencimento), dias=d?Math.round((h-d)/864e5):0;
       return '<tr data-gx="'+_gx(f)+'"><td class="mono">'+(d?d.toLocaleDateString('pt-BR'):'—')+'</td>'
        +'<td><span class="tag '+(x.t==='r'?'tg':'tr')+'">'+(x.t==='r'?'RECEITA':'DESPESA')+'</span></td>'
        +'<td>'+esc(_fcQuem(f))+'</td><td>'+esc(_fcRecorteVal(f))+'</td>'
        +'<td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(f.referencia||'')+'">'+esc(f.referencia||'—')+'</td>'
        +'<td class="mono" style="text-align:right;font-weight:600;color:'+(x.t==='r'?'var(--green-d)':'var(--red-d)')+'">'+_faFT(_fcVal(f))+'</td>'
        +'<td class="mono" style="text-align:right"><span class="dias-r">'+dias+' d</span></td></tr>'; }).join('')
   + '</tbody></table></div>';
}
function _fcGraficosB27(rec, pag){
  if(typeof Chart==='undefined'||!$('cFcMes')) return;
  var chave=function(f){ var d=_fcData(f); return d?_fcMesKey(d):null; };
  var meses=[...new Set(rec.concat(pag).map(chave).filter(Boolean))].sort();
  var somaMes=function(l,m){ return l.filter(function(f){ return chave(f)===m; }).reduce(function(s,f){ return s+_fcVal(f); },0); };
  var dR=meses.map(function(m){ return somaMes(rec,m); }), dP=meses.map(function(m){ return somaMes(pag,m); });
  var verde=_faCorBarra('Pedro'), vermelho=_faCorBarra('Emanuelle');
  mCh('cFcMes',{type:'bar',data:{labels:meses.map(_fcMesLbl),datasets:[
      {label:'Recebido',data:dR,backgroundColor:verde,hoverBackgroundColor:_faCor('Pedro').marca,borderRadius:5,borderSkipped:false},
      {label:'Pago (despesas)',data:dP,backgroundColor:vermelho,hoverBackgroundColor:_faCor('Emanuelle').marca,borderRadius:5,borderSkipped:false}]},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:0},interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:true,position:'bottom',labels:{font:{size:10.5},boxWidth:11,usePointStyle:true,pointStyle:'circle',padding:10}},
        tooltip:{mode:'index',intersect:false,callbacks:{label:function(c){ return ' '+c.dataset.label+': '+fF(c.raw||0); },
          footer:function(it){ if(!it||!it.length) return ''; var i=it[0].dataIndex; return 'Saldo do mês: '+fF((dR[i]||0)-(dP[i]||0)); }}}},
      scales:{x:{ticks:{font:{size:10}},grid:{display:false}},y:{ticks:{font:{size:10},callback:function(v){ return fS(v); }},grid:{color:'rgba(0,0,0,.04)'}}}}});
}

// Backup 28: os dois comparativos com as MESMAS larguras de coluna (um embaixo do outro, 100% alinhados) e linha de Total
function _fcTotaisPessoas(){
  var L=_FC_LADOS[_FC.lado], f=0, n=0, ab=0;
  _fcPessoas().forEach(function(p){ var salvo=_FC.quem; _FC.quem=[p];
    var fe=_fcFiltrar([L.abaFechado]), a=_fcFiltrar([L.abaAberto]); _FC.quem=salvo;
    f+=_fcSoma(fe); n+=fe.length; ab+=_fcSoma(a); });
  return {f:f, n:n, ab:ab};
}
function _fcTabelaComp(html){
  var t=_fcTotaisPessoas(), pagar=_FC.lado==='pagar';
  var tot='<tr class="linha-total fc-comp-tot"><td><b>Total</b></td>'
    +'<td class="mono" style="text-align:right;font-weight:700;color:'+(pagar?'var(--red-d)':'var(--green-d)')+'">'+_faFT(t.f)+'</td>'
    +'<td class="mono" style="text-align:right">'+(t.f?'100%':'—')+'</td><td class="mono" style="text-align:right">'+t.n+'</td>'
    +'<td class="mono" style="text-align:right">'+(t.n?_faFT(t.f/t.n):'—')+'</td><td class="mono" style="text-align:right;font-weight:700">'+(t.ab?_faFT(t.ab):'—')+'</td>'
    +'<td class="mono" style="text-align:right">—</td></tr>';
  return html.replace('<div class="tw"><table>','<div class="tw fc-comp-wrap" data-sem-pagina><table class="fc-comp"><colgroup><col style="width:32%"><col style="width:15%"><col style="width:8%"><col style="width:8%"><col style="width:13%"><col style="width:14%"><col style="width:10%"></colgroup>')
    .replace(/<\/tbody><\/table><\/div>$/, tot+'</tbody></table></div>');
}
