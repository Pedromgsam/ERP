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
// Backup 23: grupos RECOLHIDOS de início (clique no grupo abre os parcelamentos, em ordem alfabética da empresa); filtros por grupo,
// pagamento, próxima parcela e situação; clicar no parcelamento abre o DETALHAMENTO numa janela própria (parcelas e "Lançar pagamento").
var _parcF={grupo:'',pag:'',prox:'',sit:''};
function _parcFiltro(k,v){ _parcF[k]=v; renderParcAnalise(); }
function _parcPassa(x){
  var F=_parcF, h=new Date(); h.setHours(0,0,0,0);
  if(F.grupo&&x.g!==F.grupo) return false;
  if(F.pag){ var pc=x.pc; if(F.pag==='ate25'&&pc>25) return false; if(F.pag==='meio'&&(pc<=25||pc>75)) return false; if(F.pag==='mais75'&&pc<=75) return false; }
  if(F.prox){ var d=x.prox?pDate(x.prox.vencimento):null, n=d?Math.round((d-h)/864e5):null;
    if(F.prox==='7'&&!(n!==null&&n<=7)) return false; if(F.prox==='30'&&!(n!==null&&n<=30)) return false; if(F.prox==='sem'&&x.prox) return false; }
  if(F.sit==='atraso'&&!x.atr) return false; if(F.sit==='risco'&&x.atr<3) return false; if(F.sit==='dia'&&x.atr) return false;
  return true;
}
function _parcAbrirGrupo(g){ _parcGrpAbertos[g]=!_parcGrpAbertos[g]; renderParcAnalise(); }
function renderParcAnalise(){
  var el=$('parcAnalise'); if(!el) return;
  var lista=filtrarParc();
  var cx='<label class="ac-todos"><input type="checkbox" id="parcMostrarTodos"'+(_parcTodos?' checked':'')+' onchange="_parcMostrarTodos(this.checked)"> Mostrar concluídos</label>';
  var vis='<div class="segmento gx-seg-cli" id="parcVisao">'+[['grupo','Por grupo'],['lista','Lista']].map(function(o){ return '<button type="button" data-v="'+o[0]+'" class="'+(_parcVisao===o[0]?'ativo':'')+'" onclick="_parcVisao=\''+o[0]+'\';renderParcAnalise()">'+o[1]+'</button>'; }).join('')+'</div>';
  if(!lista.length){ el.innerHTML=exBloco('exParcSit','Situação dos parcelamentos','<div class="gx-tab-topo"><div class="pa-sub">Parcelamentos em andamento</div>'+cx+'</div><div class="pa-ok">'+(_parcTodos?'Nenhum parcelamento neste recorte (grupo / empresa escolhidos).':'Nenhum parcelamento em andamento neste recorte. Marque "Mostrar concluídos" para ver todos.')+'</div>'); return; }
  var TODOS=lista.map(function(p){ var n=_parcNumeros(p), tot=Number(p.totalParcelas)||(p.parcelas||[]).length, pg=Number(p.parcelasPagas)||0;
    return {p:p, g:_parcGrupoDe(p), n:n, atr:_parcAtraso(p), prox:_parcProxima(p), k:_parcChave(p), tot:tot, pg:pg, pc:tot>0?Math.round(pg/tot*100):0}; });
  _parcTODOS=TODOS;
  var L=TODOS.filter(_parcPassa);
  var totPago=0, totFalta=0, totMes=0; TODOS.forEach(function(x){ totPago+=x.n.pago; totFalta+=x.n.falta; totMes+=x.n.mes; });
  var comAtr=TODOS.filter(function(x){ return x.atr>0; }), vAtr=comAtr.reduce(function(s,x){ return s+x.atr*(Number(x.p.valorUltimaParcela)||0); },0);
  var alfa=function(a,b){ return String(a.p.empresa).localeCompare(String(b.p.empresa),'pt-BR') || String(a.p.numero).localeCompare(String(b.p.numero)); };
  var ordem=function(a,b){ return b.atr-a.atr || b.n.falta-a.n.falta || alfa(a,b); };
  var esq=function(t){ return String(t).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;'); };
  var sitHtml=function(atr,conc){ return atr?'<span class="acx-st acx-st-r">'+atr+' em atraso</span>'+(atr>=3?'<div class="acx-sub pcx-risco">risco de rescisão</div>':'')
      :(conc?'<span class="acx-st acx-st-x">Concluído</span>':'<span class="acx-st acx-st-g">Em dia</span>'); };
  var linha=function(x,sub){ var p=x.p;
    return '<div class="acx-item pcx-item'+(sub?' pcx-sub':'')+(x.atr?' acx-atr':'')+'">'
      +'<div class="acx-row" role="button" tabindex="0" onclick="_parcAbrir(\''+esq(x.k)+'\')" onkeydown="if(event.key===\'Enter\')_parcAbrir(\''+esq(x.k)+'\')" title="Clique para abrir o detalhamento deste parcelamento">'
      +'<div class="acx-quem"><div class="acx-dev pcx-dev">'+esc(p.empresa||'—')+'</div>'
      +'<div class="acx-sub">'+[p.local||p.orgao||'',p.natureza||'',p.numero?'Nº '+p.numero:''].filter(Boolean).map(esc).join(' · ')+(x.g&&_parcVisao==='lista'?' · '+esc(x.g):'')+'</div></div>'
      +'<div class="acx-prog"><div class="acx-prog-hd"><span><b>'+x.pg+' de '+(x.tot||'?')+'</b> parcelas pagas</span><span>'+x.pc+'%</span></div>'
      +'<div class="acx-bar"><div style="width:'+x.pc+'%"></div></div>'
      +'<div class="acx-sub">Quitado <b>'+_faFT(x.n.pago)+'</b> · falta <b>'+_faFT(x.n.falta)+'</b></div></div>'
      +'<div class="acx-prox">'+(x.prox?'<div class="acx-val">'+_faFT(Number(p.valorUltimaParcela)||0)+'</div><div class="acx-sub">vence '+esc(x.prox.vencimento||'—')+'</div>':'<div class="acx-val">—</div><div class="acx-sub">'+(x.atr?'só vencidas':'sem próxima')+'</div>')+'</div>'
      +'<div class="acx-sit">'+sitHtml(x.atr,_parcConcluido(p))+'</div><div class="acx-cv pcx-abre" aria-hidden="true">›</div></div></div>'; };
  var corpo;
  if(!L.length) corpo='<div class="pa-ok">Nenhum parcelamento com esses filtros.</div>';
  else if(_parcVisao==='grupo'){
    var G={}; L.forEach(function(x){ (G[x.g]=G[x.g]||[]).push(x); });
    var gs=Object.keys(G).sort(function(a,b){ var aa=G[a].reduce(function(s,x){return s+x.atr;},0), bb=G[b].reduce(function(s,x){return s+x.atr;},0); return (bb>0)-(aa>0) || a.localeCompare(b,'pt-BR'); });
    corpo=gs.map(function(g){ var l=G[g].slice().sort(alfa), ab=!!_parcGrpAbertos[g] || !!_parcF.grupo;
      var atr=l.reduce(function(s,x){return s+x.atr;},0), tot=l.reduce(function(s,x){return s+x.tot;},0), pg=l.reduce(function(s,x){return s+x.pg;},0), pc=tot>0?Math.round(pg/tot*100):0;
      var pago=l.reduce(function(s,x){return s+x.n.pago;},0), falta=l.reduce(function(s,x){return s+x.n.falta;},0);
      var prox=l.filter(function(x){return x.prox;}).sort(function(a,b){return pDate(a.prox.vencimento)-pDate(b.prox.vencimento);})[0];
      return '<div class="acx-item pcx-grupo'+(atr?' acx-atr':'')+(ab?' pcx-grupo-aberto':'')+'">'
        +'<div class="acx-row" role="button" tabindex="0" aria-expanded="'+ab+'" onclick="_parcAbrirGrupo(\''+esq(g)+'\')" onkeydown="if(event.key===\'Enter\')_parcAbrirGrupo(\''+esq(g)+'\')" title="Clique para '+(ab?'recolher':'ver os parcelamentos do grupo')+'">'
        +'<div class="acx-quem"><div class="acx-dev pcx-dev"><span class="pcx-seta" aria-hidden="true">'+(ab?'▾':'▸')+'</span> '+esc(g)+'</div><div class="acx-sub">'+l.length+' parcelamento'+(l.length>1?'s':'')+'</div></div>'
        +'<div class="acx-prog"><div class="acx-prog-hd"><span><b>'+pg+' de '+(tot||'?')+'</b> parcelas pagas</span><span>'+pc+'%</span></div><div class="acx-bar"><div style="width:'+pc+'%"></div></div>'
        +'<div class="acx-sub">Quitado <b>'+_faFT(pago)+'</b> · falta <b>'+_faFT(falta)+'</b></div></div>'
        +'<div class="acx-prox">'+(prox?'<div class="acx-val">'+_faFT(Number(prox.p.valorUltimaParcela)||0)+'</div><div class="acx-sub">vence '+esc(prox.prox.vencimento||'—')+'</div>':'<div class="acx-val">—</div>')+'</div>'
        +'<div class="acx-sit">'+sitHtml(atr,false)+'</div><div class="acx-cv" aria-hidden="true"></div></div>'
        +(ab?'<div class="pcx-filhos">'+l.map(function(x){ return linha(x,true); }).join('')+'</div>':'')+'</div>'; }).join('');
  } else corpo=L.slice().sort(ordem).map(function(x){ return linha(x,false); }).join('');
  var grupos=[...new Set(TODOS.map(function(x){return x.g;}))].sort(function(a,b){return a.localeCompare(b,'pt-BR');});
  var sel=function(id,k,ops){ return '<select class="fsel" id="'+id+'" aria-label="'+ops[0][1]+'" onchange="_parcFiltro(\''+k+'\',this.value)">'+ops.map(function(o){ return '<option value="'+esc(o[0])+'"'+(_parcF[k]===o[0]?' selected':'')+'>'+esc(o[1])+'</option>'; }).join('')+'</select>'; };
  var filtros='<div class="pcx-filtros">'
    +sel('parcFGrupo','grupo',[['','Todos os grupos']].concat(grupos.map(function(g){return [g,g];})))
    +sel('parcFPag','pag',[['','Pagamento: todos'],['ate25','Até 25% pago'],['meio','De 25% a 75% pago'],['mais75','Mais de 75% pago']])
    +sel('parcFProx','prox',[['','Próxima parcela: todas'],['7','Vence em até 7 dias'],['30','Vence em até 30 dias'],['sem','Sem próxima parcela']])
    +'<div class="segmento gx-seg-cli" id="parcFSit">'+[['','Todas'],['atraso','Em atraso'],['risco','Risco de rescisão'],['dia','Em dia']].map(function(o){ return '<button type="button" class="'+(_parcF.sit===o[0]?'ativo':'')+'" onclick="_parcFiltro(\'sit\',\''+o[0]+'\')">'+o[1]+'</button>'; }).join('')+'</div>'
    +'<span class="sub">'+L.length+' de '+TODOS.length+'</span></div>';
  el.innerHTML=exBloco('exParcSit','Situação dos parcelamentos',
    '<div class="kpi-grid" style="margin-bottom:14px">'
   +  kC('Já quitado',_faFT(totPago),'parcelas pagas','cg','dg')
   +  kC('Falta pagar',_faFT(totFalta),'saldo residual','ca','')
   +  kC('Sai por mês',_faFT(totMes),lista.length+' parcelamento'+(lista.length>1?'s':'')+(_parcTodos?'':' em andamento'),'cb','')
   +  kC('Em atraso',_faFT(vAtr),comAtr.length+' parcelamento'+(comAtr.length===1?'':'s')+' com parcela vencida','cr',comAtr.length?'dr':'')
   +'</div>'
   +'<div class="gx-tab-topo"><div class="pa-sub">Parcelamentos em andamento <span class="pa-nota">'+(_parcVisao==='grupo'?'clique no grupo para ver os parcelamentos · ':'')+'clique no parcelamento para abrir o detalhamento</span></div><div class="pcx-ctl">'+vis+cx+'</div></div>'
   +filtros
   +'<div class="acx pcx"><div class="acx-hd"><span>'+(_parcVisao==='grupo'?'Grupo / parcelamento':'Parcelamento')+'</span><span>Pagamento</span><span>Próxima parcela</span><span>Situação</span><span></span></div>'+corpo+'</div>');
}
var _parcTODOS=[];
// Detalhamento do parcelamento numa janela própria ("subpágina"): resumo, dados e as parcelas com "Lançar pagamento"
function _parcAbrir(k){
  var x=_parcTODOS.find(function(y){ return y.k===k; }); if(!x||!window.GS||!GS.abrirJanela) return;
  var p=x.p;
  var kp=function(r,v,c){ return '<div class="pcd-kpi'+(c?' '+c:'')+'"><span>'+r+'</span><b>'+v+'</b></div>'; };
  var j=GS.abrirJanela({ titulo:'Parcelamento'+(p.numero?' nº '+p.numero:'')+' — '+(p.empresa||''), larga:true,
    corpo:'<div class="pcd">'
      +'<div class="pcd-hd"><div><div class="pcd-emp">'+esc(p.empresa||'—')+'</div><div class="sub">'+[x.g,p.local||p.orgao||'',p.natureza||'',p.cnpj||''].filter(Boolean).map(esc).join(' · ')+'</div></div>'
      +'<div>'+(x.atr?'<span class="acx-st acx-st-r">'+x.atr+' em atraso</span>'+(x.atr>=3?' <span class="acx-st acx-st-r">risco de rescisão</span>':''):'<span class="acx-st acx-st-g">Em dia</span>')+'</div></div>'
      +'<div class="pcd-kpis">'+kp('Parcelas pagas',x.pg+' de '+(x.tot||'?')+' ('+x.pc+'%)')+kp('Já quitado',_faFT(x.n.pago),'verde')+kp('Falta pagar',_faFT(x.n.falta))
        +kp('Próxima parcela',x.prox?esc(x.prox.vencimento||'—'):'—')+(x.atr?kp('Em atraso',x.atr+' parcela'+(x.atr>1?'s':''),'vermelho'):'')+'</div>'
      +'<div class="pcd-tit">Parcelas</div>'+_parcDetalhe(p)+'</div>' });
  j.querySelectorAll('.ac-bt-pagar').forEach(function(b){ var f=b.onclick; b.onclick=function(ev){ GS.fecharJanela(j); if(f) f.call(b,ev); }; });
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
