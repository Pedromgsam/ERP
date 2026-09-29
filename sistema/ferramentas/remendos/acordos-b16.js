// ═══ Backup 16 — Acordos: só os pendentes (caixa "Mostrar concluídos"), tabela única "Acordos em andamento" ═══
// Um acordo = mesmo processo + devedor + credor. Concluído = todas as parcelas pagas.
var _acAbertos={};
function _acChave(a){ return (a.processo||'')+'|'+(a.devedor||'')+'|'+(a.credor||''); }
function _acordosPendentes(ac){
  var cx=document.getElementById('acMostrarTodos'); if(cx&&cx.checked) return ac;
  var pend={}; ac.forEach(function(a){ if(a.situacao!=='Pago') pend[_acChave(a)]=1; });
  return ac.filter(function(a){ return pend[_acChave(a)]; });
}
function _acToggle(k){ _acAbertos[k]=!_acAbertos[k]; renderAcordos(); }
function _acPagar(id,bt){ if(bt) bt.disabled=true; if(window.ERP_EDITOR&&window.ERP_EDITOR.baixaRapida) window.ERP_EDITOR.baixaRapida('acordos',id); }
function _acDetalhe(id){ if(window.GS&&window.GS.detalheAcordo) Promise.resolve(window.GS.carregarCadastros()).then(function(){ window.GS.detalheAcordo(id); }); }
function _acordosAnalise(ac){
  var el=$('acAnalise'); if(!el) return; if(!ac.length){ el.innerHTML='<div class="pa-ok">Nenhum acordo pendente. Marque "Mostrar concluídos" para ver todos.</div>'; return; }
  var hj=new Date(); hj.setHours(0,0,0,0); var fimMes=new Date(hj.getFullYear(),hj.getMonth()+1,0);
  var v=function(a){return Number(a.valor)||0;}, pago=function(a){return a.situacao==='Pago';};
  var atrasada=function(a){ if(pago(a)) return false; var d=pDate(a.vencimento); return a.situacao==='Vencido'||(d&&d<hj); };
  var noMes=function(a){ if(pago(a)) return false; var d=pDate(a.vencimento); return d&&d>=hj&&d<=fimMes; };
  var soma=function(l){return l.reduce(function(s,a){return s+v(a);},0);};
  var G={}; ac.forEach(function(a){ var k=_acChave(a); if(!G[k]) G[k]={k:k,a:a,l:[]}; G[k].l.push(a); });
  var lista=Object.keys(G).map(function(k){ var g=G[k];
    g.l.sort(function(x,y){ var dx=pDate(x.vencimento), dy=pDate(y.vencimento); return (dx?dx.getTime():0)-(dy?dy.getTime():0); });
    g.total=soma(g.l); g.pago=soma(g.l.filter(pago)); g.falta=g.total-g.pago; g.atr=g.l.filter(atrasada).length;
    g.pagas=g.l.filter(pago).length; g.prox=g.l.filter(function(a){return !pago(a);})[0]||null; g.parcela=g.prox?v(g.prox):v(g.l[g.l.length-1]);
    g.obs=(g.l.find(function(a){return a.obs;})||{}).obs||''; return g; })
    .sort(function(x,y){ return y.atr-x.atr || y.falta-x.falta; });
  var pc=function(g){ return g.total>0?Math.round(g.falta/g.total*100):0; };
  var linhas=lista.map(function(g){ var aberto=!!_acAbertos[g.k], kk=g.k.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');
    var tr='<tr class="ac-linha'+(g.atr?' ac-atr':'')+'" onclick="_acToggle(\''+kk+'\')" title="Clique para ver as parcelas">'
     +'<td><span class="ac-cv">'+(aberto?'▾':'▸')+'</span> <strong>'+esc(g.a.devedor||'—')+'</strong></td>'
     +'<td>'+esc(g.a.credor||'—')+'</td>'
     +'<td>'+esc(g.obs||'Acordo no processo')+'<div class="ac-proc">'+esc(g.a.processo||'')+'</div></td>'
     +'<td class="mono num">'+_faFT(g.total)+'</td>'
     +'<td class="mono num ac-pago">'+_faFT(g.pago)+'</td>'
     +'<td class="mono num">'+_faFT(g.falta)+'<div class="ac-falta"><div class="pa-bar"><div class="pa-bar-in" style="width:'+(100-pc(g))+'%"></div></div><span>'+pc(g)+'% falta</span></div></td>'
     +'<td class="mono num">'+_faFT(g.parcela)+'<div class="ac-proc">'+g.pagas+'/'+g.l.length+' pagas</div></td>'
     +'<td>'+(g.atr?'<span class="tag tr">'+g.atr+' em atraso</span>':(g.falta>0?'<span class="tag tg">em dia</span>':'<span class="tag tx">concluído</span>'))+'</td></tr>';
    if(aberto) tr+='<tr class="ac-det"><td colspan="8"><div class="ac-det-in">'
      +(g.a.grupo?'<div class="ac-det-info">Grupo: <b>'+esc(g.a.grupo)+'</b>'+(g.a.responsavel?' · Responsável: <b>'+esc(g.a.responsavel)+'</b>':'')+(g.l[0].pix?' · PIX: <b>'+esc(g.l[0].pix)+'</b>':'')+(g.l[0].banco?' · Banco: <b>'+esc(g.l[0].banco)+'</b>':'')+'</div>':'')
      +'<table><thead><tr><th>Parcela</th><th>Vencimento</th><th class="num">Valor</th><th>Situação</th><th>Pago em</th><th></th></tr></thead><tbody>'
      +g.l.map(function(a){ return '<tr><td>'+esc(a.parcela||'?')+(a.totalParc?'/'+esc(a.totalParc):'')+'</td><td class="mono">'+esc(a.vencimento||'—')+'</td><td class="mono num">'+_faFT(v(a))+'</td>'
        +'<td>'+(pago(a)?'<span class="tag tg">pago</span>':atrasada(a)?'<span class="tag tr">vencida</span>':'<span class="tag tn">a vencer</span>')+'</td><td class="mono">'+esc(a.dataPag||'—')+'</td>'
        +'<td style="text-align:right;white-space:nowrap">'+(pago(a)?'':'<button type="button" class="btn-m ac-bt-pagar" onclick="event.stopPropagation();_acPagar(\''+a._id+'\',this)">✓ Lançar pagamento</button> ')
        +'<button type="button" class="btn-m" onclick="event.stopPropagation();_acDetalhe(\''+a._id+'\')">Detalhe</button></td></tr>'; }).join('')
      +'</tbody></table></div></td></tr>';
    return tr; }).join('');
  el.innerHTML=exBloco('exAcSit','Situação dos acordos',
    '<div class="kpi-grid" style="margin-bottom:14px">'
   + kC('Já pago',_faFT(soma(ac.filter(pago))),ac.filter(pago).length+' parcela(s)','cg','dg')
   + kC('Falta pagar',_faFT(soma(ac.filter(function(a){return !pago(a);}))),lista.filter(function(g){return g.falta>0;}).length+' acordo(s) em aberto','ca','')
   + kC('Vence este mês',_faFT(soma(ac.filter(noMes))),ac.filter(noMes).length+' parcela(s) até '+fimMes.toLocaleDateString('pt-BR').slice(0,5),'cb','')
   + kC('Em atraso',_faFT(soma(ac.filter(atrasada))),ac.filter(atrasada).length+' parcela(s) vencida(s)','cr',ac.some(atrasada)?'dr':'')
   + '</div>'
   + '<div class="pa-sub">Acordos em andamento <span style="font-weight:400;text-transform:none;letter-spacing:0">— clique na linha para ver as parcelas e lançar pagamento</span></div>'
   + '<div class="tw"><table class="ac-tab"><thead><tr><th>Devedor</th><th>Credor</th><th>Descrição</th><th class="num">Total</th><th class="num">Pago</th><th class="num">Falta</th><th class="num">Parcela</th><th>Inadimplência</th></tr></thead><tbody>'
   + linhas + '</tbody></table></div>');
}
