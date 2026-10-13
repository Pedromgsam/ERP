// ═══ Backup 27 — Financeiro Contabilidade: Análise ÚNICA (sem os cartões "Recebimentos / Pagamentos") ═══
// • Números dos dois lados: Recebido, A receber, Pago, A pagar e Em atraso.
// • "Recebido × pago mês a mês": recebido em verde e pago em vermelho (as cores do Recebido mês a mês do Jurídico).
// • Backup 72: "Recebido por tipo de serviço" e "Maiores grupos" (iguais aos do Jurídico); os comparativos por cliente/fornecedor saíram.
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
  // Backup 74: estrutura do ambiente de teste (faixa de números, cartões, barras simples) — mesmos valores de antes
  var pj=window._semPeriodo(_FC,function(){ return _fcFiltrar(['Prejuízo']); });   // Backup 38: prejuízo de todos os meses (igual ao Início)
  el.innerHTML = _numsB([['Recebido',fF(_fcSoma(rec)),_pluralB(rec.length,'recebimento','recebimentos')+' no período','b-verde'],['A receber',fF(_fcSoma(aRec)),aRec.length+' em aberto'],
      ['A pagar',fF(_fcSoma(aPag)),_pluralB(aPag.length,'conta em aberto','contas em aberto')],['Em atraso',fF(_fcSoma(vR)+_fcSoma(vP)),(vR.length+vP.length)+' vencido(s) · todos os meses',(vR.length||vP.length)?'b-verm':''],
      ['Prejuízo',fF(_fcSoma(pj)),_pluralB(pj.length,'baixa','baixas')+' · todos os meses']])
    + _cartaoB('Recebido × pago mês a mês','Verde = recebido · vermelho = pago (despesas). Passe o mouse na coluna para ver o saldo do mês.','<div class="cb b-fin-graf"><canvas id="cFcMes"></canvas></div>')
    + '<div hidden aria-hidden="true"><canvas id="cFcQuem"></canvas></div>'
    // Backup 72/74: no lugar dos comparativos por cliente/fornecedor, os mesmos gráficos do Jurídico (barras simples)
    + '<div class="b-fin-dois">'
    +   _cartaoB('Recebido por tipo de serviço','', _barrasB(_somaPor(rec, function(f){ return f.servico; }, _fcVal)))
    +   _cartaoB('Maiores grupos','', _barrasB(_somaPor(rec, function(f){ return f.grupo; }, _fcVal)))
    + '</div>'
    + _cartaoB('Despesas por categoria','Pago no período, por categoria.', _barrasB(_somaPor(pag, function(f){ return _fcRecorteVal(f) === '—' ? '' : _fcRecorteVal(f); }, _fcVal)));
  void atraso;   // a tabela "Em atraso" saiu no Backup 38 (os vencidos estão nas abas A receber/A pagar)
  _fcGraficosB27(rec, pag);
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
  // Backup 72: tipo de serviço e maiores grupos (mesmo desenho do Jurídico)
  var barras=function(id, chave){ if(!$(id)) return;
    var ks=[...new Set(rec.map(chave))], vs=ks.map(function(k){ return rec.filter(function(f){ return chave(f)===k; }).reduce(function(s,f){ return s+_fcVal(f); },0); });
    var ix=vs.map(function(_,i){ return i; }).sort(function(a,b){ return vs[b]-vs[a]; }).slice(0,10);
    var cfg=bCfg(ix.map(function(i){ return ks[i]; }),ix.map(function(i){ return vs[i]; }),null,true);
    cfg.options.animation=false; _barrasComValor(cfg); mCh(id,cfg); };
  barras('cFcTipo', function(f){ return f.servico||'Não informado'; });   // (Backup 74: só desenha se ainda houver o canvas — hoje as barras são HTML)
  barras('cFcGrupo', function(f){ return f.grupo||'—'; });
}

