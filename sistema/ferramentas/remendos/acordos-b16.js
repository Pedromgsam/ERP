// ═══ Backup 16 — Acordos: só os pendentes (caixa "Mostrar concluídos"), tabela única "Acordos em andamento" ═══
// Um acordo = mesmo processo + devedor + credor. Concluído = todas as parcelas pagas.
var _acAbertos={}, _acTodos=false;   // Backup 19: "Mostrar concluídos" fica junto da tabela
function _acChave(a){ return (a.processo||'')+'|'+(a.devedor||'')+'|'+(a.credor||''); }
function _acordosPendentes(ac){
  if(_acTodos) return ac;
  var pend={}; ac.forEach(function(a){ if(a.situacao!=='Pago') pend[_acChave(a)]=1; });
  return ac.filter(function(a){ return pend[_acChave(a)]; });
}
function _acCaixaTodos(){ return '<label class="ac-todos"><input type="checkbox" id="acMostrarTodos"'+(_acTodos?' checked':'')+' onchange="_acTodos=this.checked;renderAcordos()"> Mostrar concluídos</label>'; }
function _acToggle(k){ _acAbertos[k]=!_acAbertos[k]; renderAcordos(); }
function _acPagar(id,bt){ if(bt) bt.disabled=true; if(window.ERP_EDITOR&&window.ERP_EDITOR.baixaRapida) window.ERP_EDITOR.baixaRapida('acordos',id); }
function _acDetalhe(id){ if(window.GS&&window.GS.detalheAcordo) Promise.resolve(window.GS.carregarCadastros()).then(function(){ window.GS.detalheAcordo(id); }); }
function _acordosAnalise(ac){
  var el=$('acAnalise'); if(!el) return; if(!ac.length){ el.innerHTML='<div class="gx-tab-topo"><div class="pa-sub">Acordos em andamento</div>'+_acCaixaTodos()+'</div><div class="pa-ok">Nenhum acordo pendente. Marque "Mostrar concluídos" para ver todos.</div>'; return; }
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
  // Backup 17: lista em cartões-linha (sem tabela escura). Cada acordo mostra quem deve a quem, a barra do que já foi pago,
  // a próxima parcela e a situação; clicar abre as parcelas em "chips" com "Lançar pagamento".
  var pcPago=function(g){ return g.total>0?Math.round(g.pago/g.total*100):0; };
  var sel=function(g){ return g.atr?'<span class="acx-st acx-st-r">'+g.atr+' parcela'+(g.atr>1?'s':'')+' em atraso</span>'
    :(g.falta>0?'<span class="acx-st acx-st-g">Em dia</span>':'<span class="acx-st acx-st-x">Concluído</span>'); };
  var linhas=lista.map(function(g){ var aberto=!!_acAbertos[g.k], kk=g.k.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');
    var r='<div class="acx-item'+(g.atr?' acx-atr':'')+(aberto?' acx-aberto':'')+'">'
     +'<div class="acx-row" role="button" tabindex="0" aria-expanded="'+aberto+'" onclick="_acToggle(\''+kk+'\')" onkeydown="if(event.key===\'Enter\')_acToggle(\''+kk+'\')" title="Clique para ver as parcelas">'
     +'<div class="acx-quem"><div class="acx-dev">'+esc(g.a.devedor||'—')+'</div>'
     +'<div class="acx-sub">deve a <b>'+esc(g.a.credor||'—')+'</b></div>'
     +'<div class="acx-sub">'+esc(g.obs||'Acordo no processo')+(g.a.processo?' · <span class="acx-proc">'+esc(g.a.processo)+'</span>':'')+'</div></div>'
     +'<div class="acx-prog"><div class="acx-prog-hd"><span><b>'+_faFT(g.pago)+'</b> pago de '+_faFT(g.total)+'</span><span>'+pcPago(g)+'%</span></div>'
     +'<div class="acx-bar"><div style="width:'+pcPago(g)+'%"></div></div>'
     +'<div class="acx-sub">Falta <b>'+_faFT(g.falta)+'</b> · '+g.pagas+' de '+g.l.length+' parcela'+(g.l.length>1?'s':'')+' paga'+(g.pagas>1?'s':'')+'</div></div>'
     +'<div class="acx-prox">'+(g.prox?'<div class="acx-val">'+_faFT(v(g.prox))+'</div><div class="acx-sub">vence '+esc(g.prox.vencimento||'—')+'</div>':'<div class="acx-val">'+_faFT(g.parcela)+'</div><div class="acx-sub">todas pagas</div>')+'</div>'
     +'<div class="acx-sit">'+sel(g)+'</div><div class="acx-cv" aria-hidden="true">'+(aberto?'▴':'▾')+'</div></div>';
    if(aberto) r+='<div class="acx-det">'
      +(g.a.grupo||g.a.responsavel||g.l[0].pix||g.l[0].banco?'<div class="acx-info">'+[g.a.grupo?'Grupo: <b>'+esc(g.a.grupo)+'</b>':'',g.a.responsavel?'Responsável: <b>'+esc(g.a.responsavel)+'</b>':'',g.l[0].pix?'PIX: <b>'+esc(g.l[0].pix)+'</b>':'',g.l[0].banco?'Banco: <b>'+esc(g.l[0].banco)+'</b>':''].filter(Boolean).join(' · ')+'</div>':'')
      +'<div class="acx-parcs">'+g.l.map(function(a){ var st=pago(a)?'p':atrasada(a)?'r':'a';
        return '<div class="acx-parc acx-parc-'+st+'"><div class="acx-parc-n">Parcela '+esc(a.parcela||'?')+(a.totalParc?'/'+esc(a.totalParc):'')+'</div>'
          +'<div class="acx-parc-v">'+_faFT(v(a))+'</div>'
          +'<div class="acx-sub">'+(pago(a)?'✓ paga'+(a.dataPag?' em '+esc(a.dataPag):''):(st==='r'?'venceu ':'vence ')+esc(a.vencimento||'—'))+'</div>'
          +'<div class="acx-parc-bt">'+(pago(a)?'':'<button type="button" class="btn-m ac-bt-pagar" onclick="event.stopPropagation();_acPagar(\''+a._id+'\',this)">✓ Lançar pagamento</button>')
          +'<button type="button" class="btn-m acx-link" onclick="event.stopPropagation();_acDetalhe(\''+a._id+'\')">Detalhe</button></div></div>'; }).join('')
      +'</div></div>';
    return r+'</div>'; }).join('');
  el.innerHTML=exBloco('exAcSit','Situação dos acordos',
    '<div class="kpi-grid" style="margin-bottom:14px">'
   + kC('Já pago',_faFT(soma(ac.filter(pago))),ac.filter(pago).length+' parcela(s)','cg','dg')
   + kC('Falta pagar',_faFT(soma(ac.filter(function(a){return !pago(a);}))),lista.filter(function(g){return g.falta>0;}).length+' acordo(s) em aberto','ca','')
   + kC('Vence este mês',_faFT(soma(ac.filter(noMes))),ac.filter(noMes).length+' parcela(s) até '+fimMes.toLocaleDateString('pt-BR').slice(0,5),'cb','')
   + kC('Em atraso',_faFT(soma(ac.filter(atrasada))),ac.filter(atrasada).length+' parcela(s) vencida(s)','cr',ac.some(atrasada)?'dr':'')
   + '</div>'
   + '<div class="gx-tab-topo"><div class="pa-sub">Acordos em andamento <span class="pa-nota">clique no acordo para ver as parcelas e lançar pagamento</span></div>'+_acCaixaTodos()+'</div>'
   + '<div class="acx"><div class="acx-hd"><span>Acordo</span><span>Pagamento</span><span>Próxima parcela</span><span>Situação</span><span></span></div>'
   + linhas + '</div>');
}
