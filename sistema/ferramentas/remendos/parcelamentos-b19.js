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
      emitimos:p.emitimosGuia!==false, atrV:x.atr*v,
      guias:p.emitimosGuia===false?0:_lgFaltaEmitir(p.parcelas, function(pa){ return !!pa.emitidaEm||/sim|emitid/i.test(pa.emissao||''); }, function(pa){ return String(pa.pagamento||'').toUpperCase()==='SIM'; }),
      sub:[p.local||p.orgao||'',p.natureza||'',p.numero?'nº '+p.numero:''].filter(Boolean).map(esc).join(' · ')+(_parcVisao==='lista'?' · '+esc(x.g):'')
,
      abertas:(p.parcelas||[]).filter(function(pa){ return String(pa.pagamento||'').toUpperCase()!=='SIM'; }).map(function(pa){ return {d:pDate(pa.vencimento), v:Number(pa.valor)||v}; })}; });
  var corpo=_lgRender({itens:itens, porGrupo:!_parcF.grupo, abertos:_parcGrpAbertos, fnGrupo:'_parcAbrirGrupo', fnItem:'_parcAbrir', rotulo:'parcelamento', cab:'Grupo / parcelamento'});
  var grupos=[...new Set(TODOS.map(function(x){return x.g;}))].sort(function(a,b){return a.localeCompare(b,'pt-BR');});
  var sel=function(id,k,ops){ return '<select class="fsel" id="'+id+'" aria-label="'+ops[0][1]+'" onchange="_parcFiltro(\''+k+'\',this.value)">'+ops.map(function(o){ return '<option value="'+esc(o[0])+'"'+(_parcF[k]===o[0]?' selected':'')+'>'+esc(o[1])+'</option>'; }).join('')+'</select>'; };
  var filtros='<div class="pcx-filtros">'
    +sel('parcFGrupo','grupo',[['','Todos os grupos']].concat(grupos.map(function(g){return [g,g];})))
    +sel('parcFPag','pag',[['','Pagamento: todos'],['ate25','Até 25% pago'],['meio','De 25% a 75% pago'],['mais75','Mais de 75% pago']])
    +sel('parcFProx','prox',[['','Próxima parcela: todas'],['7','Vence em até 7 dias'],['30','Vence em até 30 dias'],['sem','Sem próxima parcela']])
    +sel('parcFGuia','guia',[['','Guias: todas'],['nos','Guias: nós emitimos'],['cliente','Guias: o cliente emite']])
    +'<div class="segmento gx-seg-cli" id="parcFSit">'+[['','Todas'],['atraso','Em atraso'],['risco','Risco de rescisão'],['dia','Em dia']].map(function(o){ return '<button type="button" class="'+(_parcF.sit===o[0]?'ativo':'')+'" onclick="_parcFiltro(\'sit\',\''+o[0]+'\')">'+o[1]+'</button>'; }).join('')+'</div>'
    +'<span class="sub">'+L.length+' de '+TODOS.length+'</span></div>';
  el.innerHTML=exBloco('exParcSit','Situação dos parcelamentos',
    '<div class="kpi-grid" style="margin-bottom:14px">'
   +  kC('Já quitado',_faFT(totPago),'parcelas pagas','cg','dg')
   +  kC('Falta pagar',_faFT(totFalta),'saldo residual','ca','')
   +  kC('Sai por mês',_faFT(totMes),lista.length+' parcelamento'+(lista.length>1?'s':'')+(_parcTodos?'':' em andamento'),'cb','')
   +  kC('Em atraso',_faFT(vAtr),comAtr.length+' parcelamento'+(comAtr.length===1?'':'s')+' com parcela vencida','cr',comAtr.length?'dr':'')
   +'</div>'
   +'<div class="gx-tab-topo"><div class="pa-sub">Parcelamentos em andamento</div><div class="pcx-ctl">'+_lgBotaoDuas()+vis+cx+'</div></div>'
   +filtros
   +corpo);
}
var _parcTODOS=[];
// Backup 27: quadro "Guias para emitir" (telas-guias.js) acima da situação — emitir, marcar, enviar e conferir o pagamento
var _gdT={};
function _guiasNoTopo(tabela, el){
  var id=tabela==='parcelas'?'parcGuias':'acGuias', box=document.getElementById(id);
  if(!box){ box=document.createElement('div'); box.id=id; box.className='gd-topo gs'; el.parentNode.insertBefore(box, el); }
  clearTimeout(_gdT[tabela]); _gdT[tabela]=setTimeout(function(){ if(window.GS&&GS.cardGuias) GS.cardGuias(tabela, box).catch(function(e){ console.warn('[guias]', e); }); }, 250);
}
// Detalhamento do parcelamento numa janela própria ("subpágina"): resumo, dados e as parcelas com "Lançar pagamento"
function _parcAbrir(k){
  var x=_parcTODOS.find(function(y){ return y.k===k; }); if(!x||!window.GS||!GS.abrirJanela) return;
  var p=x.p;
  var kp=function(r,v,c){ return '<div class="pcd-kpi'+(c?' '+c:'')+'"><span>'+r+'</span><b>'+v+'</b></div>'; };
  var j=GS.abrirJanela({ titulo:'Parcelamento'+(p.numero?' nº '+p.numero:'')+' — '+(p.empresa||''), larga:true,
    corpo:'<div class="pcd">'
      +'<div class="pcd-hd"><div><div class="pcd-emp">'+esc(p.empresa||'—')+'</div><div class="sub">'+[x.g,p.local||p.orgao||'',p.natureza||'',p.cnpj||''].filter(Boolean).map(esc).join(' · ')+'</div></div>'
      +'<div>'+_lgSit(x.atr,x.atr>=2,false)+'</div></div>'
      // Backup 25: quem emite as guias deste parcelamento (só os "nós emitimos" entram no aviso de guias do Início)
      +'<div class="pcd-guia"><span>Guias deste parcelamento:</span><div class="segmento gx-seg-cli"><button type="button" class="'+(p.emitimosGuia!==false?'ativo':'')+'" data-guia-v="1">Nós emitimos</button>'
      +'<button type="button" class="'+(p.emitimosGuia===false?'ativo':'')+'" data-guia-v="0">O cliente emite</button></div>'
      +'<span class="sub">'+(p.emitimosGuia===false?'não aparece no aviso "guias a emitir" do Início':'aparece no aviso "guias a emitir" do Início')+'</span></div>'
      +'<div class="pcd-kpis">'+kp('Parcelas pagas',x.pg+' de '+(x.tot||'?')+' ('+x.pc+'%)')+kp('Já quitado',_faFT(x.n.pago),'verde')+kp('Falta pagar',_faFT(x.n.falta))
        +kp('Próxima parcela',x.prox?esc(x.prox.vencimento||'—'):'—')+(x.atr?kp('Em atraso',x.atr+' parcela'+(x.atr>1?'s':''),'vermelho'):'')+'</div>'
      +'<div class="pcd-tit">Parcelas</div>'+_parcDetalhe(p)+'</div>' });
  j.querySelectorAll('.ac-bt-pagar').forEach(function(b){ var f=b.onclick; b.onclick=function(ev){ GS.fecharJanela(j); if(f) f.call(b,ev); }; });
  j.querySelectorAll('[data-emitir]').forEach(function(b){ b.onclick=function(){ GS.fecharJanela(j); GS.emitirParcela('parcelas', b.dataset.emitir, function(){ setTimeout(function(){ _parcAbrir(k); }, 900); }); }; });
  j.querySelectorAll('[data-guia-v]').forEach(function(b){ b.onclick=function(){ var v=b.dataset.guiaV==='1'; b.disabled=true;
    window.SB.from('parcelamentos').update({emitimos_guia:v}).eq('id',p._id).then(function(r){
      if(r.error){ alert('Não foi possível salvar: '+(r.error.message||'')); b.disabled=false; return; }
      p.emitimosGuia=v; GS.fecharJanela(j); renderParcAnalise(); _parcAbrir(k); }); }; });
}
// detalhe do parcelamento (clicar no item de "Progresso por parcelamento"): parcelas em cartões, como em Acordos
function _parcDetalhe(p){
  var h=new Date(); h.setHours(0,0,0,0);
  return '<div class="acx-det parc-det"><div class="acx-info">'+[p.natureza?'Natureza: <b>'+esc(p.natureza)+'</b>':'',p.local?'Plataforma: <b>'+esc(p.local)+'</b>':'',p.numero?'Nº: <b>'+esc(p.numero)+'</b>':'',
      p.proximoVencimento?'Próximo vencimento: <b>'+esc(p.proximoVencimento)+'</b>':''].filter(Boolean).join(' · ')+'</div>'
    +'<div class="acx-parcs">'+(p.parcelas||[]).map(function(pa){ var st=statusParc(pa,new Date()), c=st==='Pago'?'p':st==='Inadimplente'?'r':'a';
      var emit=!!pa.emitidaEm||/sim|emitid/i.test(pa.emissao||'');
      return '<div class="acx-parc acx-parc-'+c+'"><div class="acx-parc-n">Parcela '+esc(pa.numero||'?')+(p.totalParcelas?'/'+esc(p.totalParcelas):'')+'</div>'
        +'<div class="acx-parc-v">'+_faFT(Number(pa.valor||p.valorUltimaParcela)||0)+'</div>'
        +'<div class="acx-sub">'+(st==='Pago'?'✓ paga':(c==='r'?'venceu ':'vence ')+esc(pa.vencimento||'—'))+(st==='Pago'?'':' · '+_parcDias(pa.vencimento))+'</div>'
        // Backup 27: emissão da guia (quando e quem) e o botão para emitir / ver
        +'<div class="acx-parc-lin"><span>Guia</span>'+(emit?'<b title="'+esc(pa.emitidaPor?'por '+pa.emitidaPor:'')+'">Guia emitida'+(pa.emitidaEm?' em '+esc(pa.emitidaEm):'')+'</b>':(st==='Pago'?'<span>—</span>':'<b style="color:var(--amber-d)">a emitir</b>'))+'</div>'
        +(st==='Pago'?'':'<div class="acx-parc-bt"><button type="button" class="btn btn-o btn-mini" data-emitir="'+pa._id+'">'+(emit?'✎ Emissão':'🧾 Emitir guia')+'</button>'
          +'<button type="button" class="btn-m ac-bt-pagar" onclick="event.stopPropagation();_parcBaixa(\''+pa._id+'\',this)">✓ Lançar pagamento</button></div>')+'</div>'; }).join('')
    +'</div></div>';
}
