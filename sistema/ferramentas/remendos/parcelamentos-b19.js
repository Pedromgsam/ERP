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
function _parcGrupoDe(p){ if(p.grupoNome) return p.grupoNome; var bd=(DB.baseDados||[]).find(function(b){ return b.nome===p.empresa||b.cpfCnpj===p.cnpj; }); return (bd&&bd.grupo)||p.aba||'Sem grupo'; }
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
var _parcF={grupo:'',pag:'',prox:'',sit:'',guia:''};
function _parcFiltro(k,v){ _parcF[k]=v; renderParcAnalise(); }
function _parcPassa(x){
  var F=_parcF, h=new Date(); h.setHours(0,0,0,0);
  if(F.grupo&&x.g!==F.grupo) return false;
  if(F.pag){ var pc=x.pc; if(F.pag==='ate25'&&pc>25) return false; if(F.pag==='meio'&&(pc<=25||pc>75)) return false; if(F.pag==='mais75'&&pc<=75) return false; }
  if(F.prox){ var d=x.prox?pDate(x.prox.vencimento):null, n=d?Math.round((d-h)/864e5):null;
    if(F.prox==='7'&&!(n!==null&&n<=7)) return false; if(F.prox==='30'&&!(n!==null&&n<=30)) return false; if(F.prox==='sem'&&x.prox) return false; }
  if(F.sit==='atraso'&&!x.atr) return false; if(F.sit==='risco'&&x.atr<2) return false; if(F.sit==='dia'&&x.atr) return false;   // Backup 25: risco = 2+ em atraso no MESMO parcelamento
  if(F.guia==='nos'&&x.p.emitimosGuia===false) return false; if(F.guia==='cliente'&&x.p.emitimosGuia!==false) return false;
  return true;
}
function _parcAbrirGrupo(g){ _parcGrpAbertos[g]=!_parcGrpAbertos[g]; renderParcAnalise(); }
function renderParcAnalise(){
  var el=$('parcAnalise'); if(!el) return;
  _guiasNoTopo('parcelas', el);
  var lista=filtrarParc();
  var cx='<label class="ac-todos"><input type="checkbox" id="parcMostrarTodos"'+(_parcTodos?' checked':'')+' onchange="_parcMostrarTodos(this.checked)"> Mostrar concluídos</label>';
  var vis='';   // Backup 27: sem "Por grupo / Lista" — sempre por grupo
  if(!lista.length){ el.innerHTML=exBloco('exParcSit','Situação dos parcelamentos','<div class="gx-tab-topo"><div class="pa-sub">Parcelamentos em andamento</div><div class="pcx-ctl">'+vis+cx+'</div></div><div class="pa-ok">'+(_parcTodos?'Nenhum parcelamento neste recorte (grupo / empresa escolhidos).':'Nenhum parcelamento em andamento neste recorte. Marque "Mostrar concluídos" para ver todos.')+'</div>'); return; }
  var TODOS=lista.map(function(p){ var n=_parcNumeros(p), tot=Number(p.totalParcelas)||(p.parcelas||[]).length, pg=Number(p.parcelasPagas)||0;
    return {p:p, g:_parcGrupoDe(p), n:n, atr:_parcAtraso(p), prox:_parcProxima(p), k:_parcChave(p), tot:tot, pg:pg, pc:tot>0?Math.round(pg/tot*100):0}; });
  _parcTODOS=TODOS;
  var L=TODOS.filter(_parcPassa);
  var totPago=0, totFalta=0, totMes=0; TODOS.forEach(function(x){ totPago+=x.n.pago; totFalta+=x.n.falta; totMes+=x.n.mes; });
  var comAtr=TODOS.filter(function(x){ return x.atr>0; }), vAtr=comAtr.reduce(function(s,x){ return s+x.atr*(Number(x.p.valorUltimaParcela)||0); },0);
  // Backup 25: a lista por grupo é a mesma de Acordos (_lgRender, remendos/lista-grupos-b25.js)
  var itens=L.map(function(x){ var p=x.p, v=Number(p.valorUltimaParcela)||0;
    return {k:x.k, grupo:x.g, titulo:p.empresa||'—', pagas:x.pg, total:x.tot, pago:x.n.pago, falta:x.n.falta, atr:x.atr, concluido:_parcConcluido(p),
      empresa:p.empresa||'—', tituloEmp:[p.local||p.orgao||'',p.natureza||''].filter(Boolean).join(' — ')||'Parcelamento', subEmp:(p.numero?'nº '+esc(p.numero):'')+(x.tot?(p.numero?' · ':'')+x.tot+' parcelas':''),
      guias:p.emitimosGuia===false?0:_lgFaltaEmitir(p.parcelas, function(pa){ return !!pa.emitidaEm||/sim|emitid/i.test(pa.emissao||''); }, function(pa){ return String(pa.pagamento||'').toUpperCase()==='SIM'; }),
      sub:[p.local||p.orgao||'',p.natureza||'',p.numero?'nº '+p.numero:''].filter(Boolean).map(esc).join(' · '),
      abertas:(p.parcelas||[]).filter(function(pa){ return String(pa.pagamento||'').toUpperCase()!=='SIM'; }).map(function(pa){ return {d:pDate(pa.vencimento), v:Number(pa.valor)||v}; })}; });
  var corpo=_lgRender({itens:itens, porEmpresa:!!(_parcF.grupo||(typeof FILTROS!=='undefined'&&FILTROS.grupo)), porGrupo:!_parcF.grupo, abertos:_parcGrpAbertos, fnGrupo:'_parcAbrirGrupo', fnItem:'_parcAbrir', rotulo:'parcelamento', cab:'Grupo / parcelamento'});
  var grupos=[...new Set(TODOS.map(function(x){return x.g;}))].sort(function(a,b){return a.localeCompare(b,'pt-BR');});
  var sel=function(id,k,ops){ return '<select class="fsel" id="'+id+'" aria-label="'+ops[0][1]+'" onchange="_parcFiltro(\''+k+'\',this.value)">'+ops.map(function(o){ return '<option value="'+esc(o[0])+'"'+(_parcF[k]===o[0]?' selected':'')+'>'+esc(o[1])+'</option>'; }).join('')+'</select>'; };
  var filtros='<div class="pcx-filtros">'
    +sel('parcFGrupo','grupo',[['','Todos os grupos']].concat(grupos.map(function(g){return [g,g];})))
    +'<div class="segmento gx-seg-cli" id="parcFSit">'+[['','Todas'],['atraso','Em atraso'],['risco','Risco de rescisão'],['dia','Em dia']].map(function(o){ return '<button type="button" class="'+(_parcF.sit===o[0]?'ativo':'')+'" onclick="_parcFiltro(\'sit\',\''+o[0]+'\')">'+o[1]+'</button>'; }).join('')+'</div>'
    +'<span class="sub">'+L.length+' de '+TODOS.length+'</span></div>';
  el.innerHTML=exBloco('exParcSit','Situação dos parcelamentos',
    // Backup 35: os 4 números viram uma faixa só (menos poluído)
    '<div class="lg-resumo"><span>Quitado <b class="lg-verde">'+_faFT(totPago)+'</b></span><span>Falta <b>'+_faFT(totFalta)+'</b></span><span>Sai por mês <b>'+_faFT(totMes)+'</b></span>'
   +'<span>Em atraso <b'+(vAtr?' class="lg-vermelho"':'')+'>'+_faFT(vAtr)+'</b> <small>'+comAtr.length+' parcelamento'+(comAtr.length===1?'':'s')+'</small></span></div>'
   +'<div class="gx-tab-topo"><div class="pa-sub">Parcelamentos em andamento</div><div class="pcx-ctl">'+vis+cx+'</div></div>'
   +filtros
   +corpo);
}
var _parcTODOS=[];
// Backup 27: quadro "Guias para emitir" (telas-guias.js) acima da situação — emitir, marcar, enviar e conferir o pagamento
var _gdT={};
// Backup 34: Parcelamentos e Acordos não emitem mais guias — o quadro "para emitir" saiu (a emissão é feita na Rotina → Controle)
function _guiasNoTopo(tabela, el){
  var box=document.getElementById(tabela==='parcelas'?'parcGuias':'acGuias'); if(box) box.remove();
}
// Detalhamento do parcelamento numa janela própria: dados da planilha (devedor, órgão, natureza, nº…), resumo e as parcelas em LISTA
// (Parcela · Vencimento · Valor lançado · Situação com a guia emitida / não emitida / "não emitimos"). Backup 34.
function _parcAbrir(k){
  var x=_parcTODOS.find(function(y){ return y.k===k; }); if(!x||!window.GS||!GS.abrirJanela) return;
  var p=x.p, cli=p.emitimosGuia===false;
  var kp=function(r,v,c){ return '<div class="pcd-kpi'+(c?' '+c:'')+'"><span>'+r+'</span><b>'+v+'</b></div>'; };
  var ult=(p.parcelas||[]).filter(function(pa){ return pa.valorLancado; }).slice(-1)[0];
  var linhas=(p.parcelas||[]).map(function(pa){ return {id:pa._id, rot:(pa.numero||'?')+(p.totalParcelas?'/'+p.totalParcelas:''), venc:pa.vencimento, valor:pa.valor||p.valorUltimaParcela,
    lancado:!!pa.valorLancado, pago:String(pa.pagamento||'').toUpperCase()==='SIM', emitida:!!pa.emitidaEm||/sim|emitid/i.test(pa.emissao||''), emitidaEm:pa.emitidaEm, cliente:cli}; });
  var j=GS.abrirJanela({ titulo:'Parcelamento'+(p.numero?' nº '+p.numero:'')+' — '+(p.empresa||''), larga:true,
    corpo:'<div class="pcd">'
      +'<div class="pcd-hd"><div><div class="pcd-emp">'+esc(p.empresa||'—')+'</div><div class="sub">'+esc(x.g)+'</div></div><div>'+_lgSit(x.atr,x.atr>=2,_parcConcluido(p))+'</div></div>'
      +_lgFicha([['Devedor',esc(p.empresa||'—')],['CPF/CNPJ',esc(p.cnpj||'')],['Órgão / local',esc(p.local||p.orgao||'')],['Natureza',esc(p.natureza||'')],['Nº do parcelamento',esc(p.numero||'')],
         ['Total de parcelas',p.totalParcelas||''],['Valor da parcela',_faFT(Number(p.valorUltimaParcela)||0)+(ult?' <small>(lançado em '+esc(String(ult.vencimento||'').slice(3))+')</small>':'')],
         ['Valor residual',p.residual?_faFT(Number(p.residual)):''],['Guias',cli?'<span class="lg-em lg-em-cli">Não emitimos — o cliente emite</span>':'Nós emitimos']])
      +'<div class="pcd-kpis pcd-kpis5">'+kp('Parcelas pagas',x.pg+' de '+(x.tot||'?')+' ('+x.pc+'%)')+kp('Já quitado',_faFT(x.n.pago),'verde')+kp('Falta pagar',_faFT(x.n.falta))
        +kp('Próxima parcela',x.prox?esc(x.prox.vencimento||'—'):'—')+kp('Em atraso',x.atr?x.atr+' parcela'+(x.atr>1?'s':''):'nenhuma',x.atr?'vermelho':'')+'</div>'
      +'<div class="pcd-tit">Parcelas</div>'+_lgParcTabela(linhas,'parcelas')+'</div>' });
  j.querySelectorAll('[data-lg-pagar]').forEach(function(b){ b.onclick=function(){ if(!_lgConfirmaPag(b)) return; GS.fecharJanela(j); _parcBaixa(b.dataset.lgPagar,b); }; });
}
// (o "Progresso por parcelamento" antigo, escondido, ainda chama esta função)
function _parcDetalhe(p){
  return _lgParcTabela((p.parcelas||[]).map(function(pa){ return {id:pa._id, rot:(pa.numero||'?')+(p.totalParcelas?'/'+p.totalParcelas:''), venc:pa.vencimento, valor:pa.valor||p.valorUltimaParcela,
    lancado:!!pa.valorLancado, pago:String(pa.pagamento||'').toUpperCase()==='SIM', emitida:!!pa.emitidaEm||/sim|emitid/i.test(pa.emissao||''), emitidaEm:pa.emitidaEm, cliente:p.emitimosGuia===false}; }),'parcelas');
}
