// ═══ Backup 19 — Parcelamentos no mesmo modelo de Acordos ═══
// • Concluídos ficam ocultos (caixa "Mostrar concluídos" junto da tabela).
// • "Situação dos parcelamentos": tabela POR GRUPO; clicar no grupo abre os parcelamentos por órgão daquele grupo.
// • "Risco de rescisão" com a natureza e a empresa sem negrito.
// • "Progresso por parcelamento": clicar no parcelamento abre as parcelas (com ✓ Baixa), como em Acordos.
// • Tabelas Vencidos / A vencer: "Atraso" / "Dias" em dias (como em Acordos) no lugar do "Status".
var _parcTodos=false, _parcGrpAbertos={}, _parcAbertos={};
function _parcConcluido(p){
  var tot=Number(p.totalParcelas)||0, pg=Number(p.parcelasPagas)||0, h=new Date();
  var pend=(p.parcelas||[]).some(function(pa){ return statusParc(pa,h)!=='Pago'; });
  if(pend) return false;
  return tot>0 ? pg>=tot : (p.parcelas||[]).length>0;
}
function _parcMostrarTodos(v){ _parcTodos=!!v; renderParcelamentos(); }
function _parcGrupoDe(p){ var bd=(DB.baseDados||[]).find(function(b){ return b.nome===p.empresa||b.cpfCnpj===p.cnpj; }); return (bd&&bd.grupo)||p.aba||'Sem grupo'; }
function _parcChave(p){ return (p._id||'')+'|'+p.empresa+'|'+p.numero; }
function _parcToggleGrp(k){ _parcGrpAbertos[k]=!_parcGrpAbertos[k]; renderParcAnalise(); }
function _parcToggle(k){ _parcAbertos[k]=!_parcAbertos[k]; renderParcAnalise(); }
function _parcBaixa(id,bt){ if(bt) bt.disabled=true; if(window.ERP_EDITOR&&window.ERP_EDITOR.baixaRapida) window.ERP_EDITOR.baixaRapida('parcelas',id); }
// "12 d atraso" (vermelho) · "Hoje" · "5 d" (âmbar até 7 dias) — o mesmo texto de Acordos
function _parcDias(venc){   // Backup 22: a régua única (vencido — inclui o dia — vermelho · <3 amarelo · <10 azul · ≥10 verde)
  var dv=pDate(venc); if(!dv) return '<span style="color:var(--text3)">—</span>';
  var h=new Date(); h.setHours(0,0,0,0); var d=Math.floor((dv-h)/864e5);
  if(d<0) return '<span class="dias-r">'+Math.abs(d)+' d atraso</span>';
  if(d===0) return '<span class="dias-r">vence hoje</span>';
  return '<span class="'+_diasCls(d)+'">em '+d+' d</span>';
}
function _parcNumeros(p){
  var v=Number(p.valorUltimaParcela)||0, pagas=Number(p.parcelasPagas)||0, tot=Number(p.totalParcelas)||0;
  var falta=(p.residual!==undefined&&p.residual!==null)?Number(p.residual)||0:v*Math.max(0,tot-pagas);
  return {pago:v*pagas, falta:falta, mes:pagas<tot?v:0};
}
// Backup 22: "Situação dos parcelamentos" no modelo de "Acordos em andamento" — uma linha por parcelamento, separada por grupo,
// atrasados primeiro (grupo com mais atraso sobe); clicar abre as parcelas com "Lançar pagamento". Sai a tabela por grupo/órgão e o
// "Risco de rescisão" vira o selo da linha (3 ou mais em atraso).
var _parcVisao='grupo';
function _parcAtraso(p){
  var h=new Date(); h.setHours(0,0,0,0);
  var n=(p.parcelas||[]).filter(function(pa){ if(String(pa.pagamento||'').toUpperCase()==='SIM') return false; var d=pDate(pa.vencimento); return d&&d<=h; }).length;
  return Math.max(n, Number(p.vencidas)||0);
}
function _parcProxima(p){
  var h=new Date(); h.setHours(0,0,0,0);
  return (p.parcelas||[]).filter(function(pa){ if(String(pa.pagamento||'').toUpperCase()==='SIM') return false; var d=pDate(pa.vencimento); return d&&d>h; })
    .sort(function(x,y){ return pDate(x.vencimento)-pDate(y.vencimento); })[0]||null;
}
function renderParcAnalise(){
  var el=$('parcAnalise'); if(!el) return;
  var lista=filtrarParc();
  var cx='<label class="ac-todos"><input type="checkbox" id="parcMostrarTodos"'+(_parcTodos?' checked':'')+' onchange="_parcMostrarTodos(this.checked)"> Mostrar concluídos</label>';
  var vis='<div class="segmento gx-seg-cli" id="parcVisao">'+[['grupo','Por grupo'],['lista','Lista']].map(function(o){ return '<button type="button" data-v="'+o[0]+'" class="'+(_parcVisao===o[0]?'ativo':'')+'" onclick="_parcVisao=\''+o[0]+'\';renderParcAnalise()">'+o[1]+'</button>'; }).join('')+'</div>';
  if(!lista.length){ el.innerHTML=exBloco('exParcSit','Situação dos parcelamentos','<div class="gx-tab-topo"><div class="pa-sub">Parcelamentos em andamento</div>'+cx+'</div><div class="pa-ok">'+(_parcTodos?'Nenhum parcelamento neste recorte (grupo / empresa escolhidos).':'Nenhum parcelamento em andamento neste recorte. Marque "Mostrar concluídos" para ver todos.')+'</div>'); return; }
  var L=lista.map(function(p){ var n=_parcNumeros(p); return {p:p, g:_parcGrupoDe(p), n:n, atr:_parcAtraso(p), prox:_parcProxima(p), k:_parcChave(p)}; });
  var totPago=0, totFalta=0, totMes=0; L.forEach(function(x){ totPago+=x.n.pago; totFalta+=x.n.falta; totMes+=x.n.mes; });
  var comAtr=L.filter(function(x){ return x.atr>0; }), vAtr=comAtr.reduce(function(s,x){ return s+x.atr*(Number(x.p.valorUltimaParcela)||0); },0);
  var ordem=function(a,b){ return b.atr-a.atr || b.n.falta-a.n.falta || String(a.p.empresa).localeCompare(String(b.p.empresa),'pt-BR'); };
  var linha=function(x){ var p=x.p, ab=!!_parcAbertos[x.k], kk=x.k.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');
    var tot=Number(p.totalParcelas)||(p.parcelas||[]).length, pg=Number(p.parcelasPagas)||0, pc=tot>0?Math.round(pg/tot*100):0;
    var sit=x.atr?'<span class="acx-st acx-st-r">'+x.atr+' em atraso</span>'+(x.atr>=3?'<div class="acx-sub pcx-risco">risco de rescisão</div>':'')
      :(_parcConcluido(p)?'<span class="acx-st acx-st-x">Concluído</span>':'<span class="acx-st acx-st-g">Em dia</span>');
    var r='<div class="acx-item pcx-item'+(x.atr?' acx-atr':'')+(ab?' acx-aberto':'')+'">'
      +'<div class="acx-row" role="button" tabindex="0" aria-expanded="'+ab+'" onclick="_parcToggle(\''+kk+'\')" onkeydown="if(event.key===\'Enter\')_parcToggle(\''+kk+'\')" title="Clique para ver as parcelas">'
      +'<div class="acx-quem"><div class="acx-dev pcx-dev">'+esc(p.empresa||'—')+'</div>'
      +'<div class="acx-sub">'+[p.local||p.orgao||'',p.natureza||''].filter(Boolean).map(esc).join(' · ')+'</div>'
      +'<div class="acx-sub">'+(p.numero?'Nº '+esc(p.numero):'')+(x.g&&_parcVisao==='lista'?(p.numero?' · ':'')+esc(x.g):'')+'</div></div>'
      +'<div class="acx-prog"><div class="acx-prog-hd"><span><b>'+pg+' de '+(tot||'?')+'</b> parcelas pagas</span><span>'+pc+'%</span></div>'
      +'<div class="acx-bar"><div style="width:'+pc+'%"></div></div>'
      +'<div class="acx-sub">Quitado <b>'+_faFT(x.n.pago)+'</b> · falta <b>'+_faFT(x.n.falta)+'</b></div></div>'
      +'<div class="acx-prox">'+(x.prox?'<div class="acx-val">'+_faFT(Number(p.valorUltimaParcela)||0)+'</div><div class="acx-sub">vence '+esc(x.prox.vencimento||'—')+'</div>':'<div class="acx-val">—</div><div class="acx-sub">'+(x.atr?'só vencidas':'sem próxima')+'</div>')+'</div>'
      +'<div class="acx-sit">'+sit+'</div><div class="acx-cv" aria-hidden="true">'+(ab?'▴':'▾')+'</div></div>';
    if(ab) r+=_parcDetalhe(p);
    return r+'</div>'; };
  var corpo;
  if(_parcVisao==='grupo'){
    var G={}; L.forEach(function(x){ (G[x.g]=G[x.g]||[]).push(x); });
    var gs=Object.keys(G).sort(function(a,b){ var aa=G[a].reduce(function(s,x){return s+x.atr;},0), bb=G[b].reduce(function(s,x){return s+x.atr;},0); return bb-aa || a.localeCompare(b,'pt-BR'); });
    corpo=gs.map(function(g){ var l=G[g].sort(ordem), na=l.filter(function(x){return x.atr>0;}).length;
      return '<div class="pcx-grp">'+esc(g)+' <span class="sub">'+l.length+' parcelamento'+(l.length>1?'s':'')+(na?' · <span class="pcx-grp-atr">'+na+' com atraso</span>':'')+'</span></div>'+l.map(linha).join(''); }).join('');
  } else corpo=L.sort(ordem).map(linha).join('');
  el.innerHTML=exBloco('exParcSit','Situação dos parcelamentos',
    '<div class="kpi-grid" style="margin-bottom:14px">'
   +  kC('Já quitado',_faFT(totPago),'parcelas pagas','cg','dg')
   +  kC('Falta pagar',_faFT(totFalta),'saldo residual','ca','')
   +  kC('Sai por mês',_faFT(totMes),lista.length+' parcelamento'+(lista.length>1?'s':'')+(_parcTodos?'':' em andamento'),'cb','')
   +  kC('Em atraso',_faFT(vAtr),comAtr.length+' parcelamento'+(comAtr.length===1?'':'s')+' com parcela vencida','cr',comAtr.length?'dr':'')
   +'</div>'
   +'<div class="gx-tab-topo"><div class="pa-sub">Parcelamentos em andamento <span class="pa-nota">clique no parcelamento para ver as parcelas e lançar pagamento · atrasados primeiro</span></div><div class="pcx-ctl">'+vis+cx+'</div></div>'
   +'<div class="acx pcx"><div class="acx-hd"><span>Parcelamento</span><span>Pagamento</span><span>Próxima parcela</span><span>Situação</span><span></span></div>'+corpo+'</div>');
}
// detalhe do parcelamento (clicar no item de "Progresso por parcelamento"): parcelas em cartões, como em Acordos
function _parcDetalhe(p){
  var h=new Date(); h.setHours(0,0,0,0);
  return '<div class="acx-det parc-det"><div class="acx-info">'+[p.natureza?'Natureza: <b>'+esc(p.natureza)+'</b>':'',p.local?'Plataforma: <b>'+esc(p.local)+'</b>':'',p.numero?'Nº: <b>'+esc(p.numero)+'</b>':'',
      p.proximoVencimento?'Próximo vencimento: <b>'+esc(p.proximoVencimento)+'</b>':''].filter(Boolean).join(' · ')+'</div>'
    +'<div class="acx-parcs">'+(p.parcelas||[]).map(function(pa){ var st=statusParc(pa,new Date()), c=st==='Pago'?'p':st==='Inadimplente'?'r':'a';
      return '<div class="acx-parc acx-parc-'+c+'"><div class="acx-parc-n">Parcela '+esc(pa.numero||'?')+(p.totalParcelas?'/'+esc(p.totalParcelas):'')+'</div>'
        +'<div class="acx-parc-v">'+_faFT(Number(pa.valor||p.valorUltimaParcela)||0)+'</div>'
        +'<div class="acx-sub">'+(st==='Pago'?'✓ paga':(c==='r'?'venceu ':'vence ')+esc(pa.vencimento||'—'))+(st==='Pago'?'':' · '+_parcDias(pa.vencimento))+'</div>'
        +(st==='Pago'?'':'<div class="acx-parc-bt"><button type="button" class="btn-m ac-bt-pagar" onclick="event.stopPropagation();_parcBaixa(\''+pa._id+'\',this)">✓ Lançar pagamento</button></div>')+'</div>'; }).join('')
    +'</div></div>';
}
