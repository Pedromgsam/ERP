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
function _parcToggle(k){ _parcAbertos[k]=!_parcAbertos[k]; renderParcelamentos(); }
function _parcBaixa(id,bt){ if(bt) bt.disabled=true; if(window.ERP_EDITOR&&window.ERP_EDITOR.baixaRapida) window.ERP_EDITOR.baixaRapida('parcelas',id); }
// "12 d atraso" (vermelho) · "Hoje" · "5 d" (âmbar até 7 dias) — o mesmo texto de Acordos
function _parcDias(venc){
  var dv=pDate(venc); if(!dv) return '<span style="color:var(--text3)">—</span>';
  var h=new Date(); h.setHours(0,0,0,0); var d=Math.floor((dv-h)/864e5);
  if(d<0) return '<span style="font-weight:700;color:var(--red-d)">'+Math.abs(d)+' d atraso</span>';
  if(d===0) return '<span style="font-weight:700;color:var(--amber-d)">Hoje</span>';
  return '<span style="font-weight:600;color:'+(d<=7?'var(--amber-d)':'var(--text3)')+'">'+d+' d</span>';
}
function _parcNumeros(p){
  var v=Number(p.valorUltimaParcela)||0, pagas=Number(p.parcelasPagas)||0, tot=Number(p.totalParcelas)||0;
  var falta=(p.residual!==undefined&&p.residual!==null)?Number(p.residual)||0:v*Math.max(0,tot-pagas);
  return {pago:v*pagas, falta:falta, mes:pagas<tot?v:0};
}
function renderParcAnalise(){
  var el=$('parcAnalise'); if(!el) return;
  var lista=filtrarParc();
  var cx='<label class="ac-todos"><input type="checkbox" id="parcMostrarTodos"'+(_parcTodos?' checked':'')+' onchange="_parcMostrarTodos(this.checked)"> Mostrar concluídos</label>';
  if(!lista.length){ el.innerHTML=exBloco('exParcSit','Situação dos parcelamentos','<div class="gx-tab-topo"><div class="pa-sub">Por grupo</div>'+cx+'</div><div class="pa-ok">'+(_parcTodos?'Nenhum parcelamento neste recorte (grupo / empresa escolhidos).':'Nenhum parcelamento em andamento neste recorte. Marque "Mostrar concluídos" para ver todos.')+'</div>'); return; }
  var barra=function(pago,falta){ var t=pago+falta; if(t<=0) return ''; var pc=Math.round(pago/t*100);
    return '<div class="pa-bar"><div class="pa-bar-in" style="width:'+pc+'%"></div></div><div class="pa-pc">'+pc+'% quitado</div>'; };
  // por grupo → por órgão dentro do grupo
  var G={}, totPago=0, totFalta=0, totMes=0;
  lista.forEach(function(p){
    var g=_parcGrupoDe(p), o=p.orgao||p.natureza||'—', n=_parcNumeros(p);
    if(!G[g]) G[g]={pago:0,falta:0,mes:0,n:0,org:{}};
    if(!G[g].org[o]) G[g].org[o]={pago:0,falta:0,mes:0,n:0};
    [G[g],G[g].org[o]].forEach(function(x){ x.pago+=n.pago; x.falta+=n.falta; x.mes+=n.mes; x.n++; });
    totPago+=n.pago; totFalta+=n.falta; totMes+=n.mes;
  });
  var grupos=Object.keys(G).sort(function(a,b){ return G[b].falta-G[a].falta; });
  var celulas=function(d){ return '<td class="mono" style="text-align:right;color:var(--green-d)">'+_faFT(d.pago)+'</td><td class="mono" style="text-align:right">'+_faFT(d.falta)+'</td>'
    +'<td class="mono" style="text-align:right">'+_faFT(d.mes)+'</td><td>'+barra(d.pago,d.falta)+'</td>'; };
  var linhas=grupos.map(function(g){ var d=G[g], ab=!!_parcGrpAbertos[g], kk=g.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');
    var r='<tr class="parc-grp" role="button" tabindex="0" aria-expanded="'+ab+'" onclick="_parcToggleGrp(\''+kk+'\')" onkeydown="if(event.key===\'Enter\')_parcToggleGrp(\''+kk+'\')" title="Clique para ver por órgão">'
      +'<td><span class="parc-cv" aria-hidden="true">'+(ab?'▾':'▸')+'</span> '+esc(g)+'<div class="parc-sub">'+d.n+' parcelamento'+(d.n>1?'s':'')+'</div></td>'+celulas(d)+'</tr>';
    if(ab) r+=Object.keys(d.org).sort(function(a,b){ return d.org[b].falta-d.org[a].falta; }).map(function(o){ var x=d.org[o];
      return '<tr class="parc-org"><td>'+esc(o)+'<div class="parc-sub">'+x.n+' parcelamento'+(x.n>1?'s':'')+'</div></td>'+celulas(x)+'</tr>'; }).join('');
    return r; }).join('');
  // risco de rescisão: 3 parcelas em atraso costumam derrubar o parcelamento
  var risco=lista.map(function(p){
    var v=Number(p.vencidas);
    if(isNaN(v)) v=(p.parcelas||[]).filter(function(pa){ if(String(pa.pagamento||'').toUpperCase()==='SIM') return false; var d=pDate(pa.vencimento), h=new Date(); h.setHours(0,0,0,0); return d&&d<h; }).length;
    return {p:p, atraso:v};
  }).filter(function(r){ return r.atraso>0; }).sort(function(a,b){ return b.atraso-a.atraso; });
  el.innerHTML=exBloco('exParcSit','Situação dos parcelamentos',
    '<div class="kpi-grid" style="margin-bottom:14px">'
   +  kC('Já quitado',_faFT(totPago),'parcelas pagas','cg','dg')
   +  kC('Falta pagar',_faFT(totFalta),'saldo residual','ca','da')
   +  kC('Sai por mês',_faFT(totMes),lista.length+' parcelamento'+(lista.length>1?'s':'')+(_parcTodos?'':' em andamento'),'cb','db')
   +  kC('Em atraso',risco.length,'parcelamento'+(risco.length===1?'':'s')+' com parcela vencida','cr',risco.length?'dr':'')
   +'</div>'
   +'<div class="gx-tab-topo"><div class="pa-sub">Por grupo <span class="pa-nota">clique no grupo para ver os parcelamentos por órgão</span></div>'+cx+'</div>'
   +'<div class="tw" style="margin-bottom:16px"><table id="tblParcGrupo"><thead><tr><th>Grupo / órgão</th><th style="text-align:right">Quitado</th><th style="text-align:right">Falta</th>'
   +  '<th style="text-align:right">Por mês</th><th style="width:150px">Andamento</th></tr></thead><tbody>'+linhas+'</tbody>'
   +  '<tfoot><tr><td>Total</td><td class="mono" style="text-align:right">'+_faFT(totPago)+'</td><td class="mono" style="text-align:right">'+_faFT(totFalta)+'</td><td class="mono" style="text-align:right">'+_faFT(totMes)+'</td><td></td></tr></tfoot></table></div>'
   +'<div class="pa-sub">Risco de rescisão <span class="pa-nota">três parcelas em atraso costumam rescindir o parcelamento</span></div>'
   +(risco.length? '<div class="tw"><table id="tblParcRisco"><thead><tr><th>Empresa</th><th>Natureza</th><th>Parcelamento</th><th style="text-align:center">Em atraso</th></tr></thead><tbody>'
     + risco.slice(0,10).map(function(r){ var grave=r.atraso>=3;
         return '<tr><td>'+esc(r.p.empresa)+'</td><td>'+esc(r.p.natureza||'—')+'</td><td>'+esc(r.p.label||r.p.numero||'—')+'</td>'
           +'<td style="text-align:center"><span class="tag '+(grave?'tr':'ta')+'">'+r.atraso+(grave?' ⚠':'')+'</span></td></tr>'; }).join('')+'</tbody></table></div>'
     : '<div class="pa-ok">✓ Nenhum parcelamento com parcela em atraso.</div>'));
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
        +(st==='Pago'?'':'<div class="acx-parc-bt"><button type="button" class="btn-m ac-bt-pagar" onclick="event.stopPropagation();_parcBaixa(\''+pa._id+'\',this)">✓ Baixa</button></div>')+'</div>'; }).join('')
    +'</div></div>';
}
