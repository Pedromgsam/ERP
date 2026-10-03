// ═══ Backup 35 — Acordos: UMA aba "A pagar" (tudo o que venceu ou vai vencer e ainda não foi pago), como na planilha ═══
// Colunas: ☐ · Grupo · Processo · Devedor · Credor · Parcela · Valor · Vencimento · Prazo · Situação · ação.
// Marcar parcelas → "✉ Enviar por empresa" (o mesmo e-mail das guias); "🧾 Gerar boleto" emite uma parcela; paga vai para a aba "Pago".
var _acSel={}, _acPrazo='', _acPrazoAte='';
// Backup 37: filtro de prazo da aba "A pagar" — vencidas · próximos 5/10/15/30 dias · até uma data (aberto)
function _acPrazoBarra(){
  var bus=$('busAcordVenc'); if(!bus) return;
  var bar=$('acPrazoBar');
  if(!bar){ bar=document.createElement('div'); bar.id='acPrazoBar'; bar.className='segmento gx-seg-cli ac-prazo'; bus.parentNode.insertBefore(bar,bus); }
  var ops=[['','Todas'],['venc','Vencidas'],['5','5 dias'],['10','10 dias'],['15','15 dias'],['30','30 dias']];
  bar.innerHTML=ops.map(function(o){ return '<button type="button" data-prazo="'+o[0]+'" class="'+(_acPrazo===o[0]?'ativo':'')+'">'+o[1]+'</button>'; }).join('')
    +'<label class="ac-prazo-ate'+(_acPrazo==='ate'?' ativo':'')+'" title="Vencimento até esta data (filtro aberto)">até <input type="date" id="acPrazoAte" value="'+esc(_acPrazoAte)+'"></label>';
  bar.onclick=function(ev){ var b=ev.target.closest('[data-prazo]'); if(!b) return; _acPrazo=b.dataset.prazo; renderAcordosVencTbl(); };
  var ate=$('acPrazoAte'); if(ate) ate.onchange=function(){ _acPrazoAte=ate.value; _acPrazo=ate.value?'ate':''; renderAcordosVencTbl(); };
}
function _acPassaPrazo(dias, dv){
  if(!_acPrazo) return true;
  if(_acPrazo==='venc') return dias!==null&&dias<=0;
  if(_acPrazo==='ate'){ if(!_acPrazoAte) return true; return !!dv&&dv<=new Date(_acPrazoAte+'T23:59:59'); }
  return dias!==null&&dias<=Number(_acPrazo);   // inclui as vencidas: "o que vence nos próximos N dias" + o que já venceu
}
function setAcordTab(tab, btn){
  if(tab==='pagar') tab='vencidos';
  document.querySelectorAll('#acordTabBar .tb-btn').forEach(function(b){ b.classList.toggle('active', b.dataset.atab===(tab==='vencidos'?'vencidos':tab)); });
  document.getElementById('acordTabVencidos').style.display = tab==='vencidos'?'':'none';
  document.getElementById('acordTabPagar').style.display    = 'none';
  document.getElementById('acordTabPago').style.display     = tab==='pago'?'':'none';
  if(tab==='vencidos') renderAcordosVencTbl(); else renderAcordosPgTbl();
}
function renderAcordosVencTbl(){
  // Backup 37: grupo/devedor vêm só do filtro suspenso do topo (os seletores daqui saíram)
  var bus=(($('busAcordVenc')||{}).value||'').toLowerCase();
  var hoje=new Date(); hoje.setHours(0,0,0,0);
  _acPrazoBarra();
  var rows=filtrarAcordos().filter(function(a){
    if(a.situacao==='Pago') return false;
    var dv0=pDate(a.vencimento); if(!_acPassaPrazo(dv0?Math.round((dv0-hoje)/864e5):null, dv0)) return false;
    if(bus&&![a.devedor,a.credor,a.processo,a.grupo,a.responsavel].some(function(x){ return String(x||'').toLowerCase().indexOf(bus)>=0; })) return false;
    return true; })
    .sort(function(a,b){ return (pDate(a.vencimento)||new Date(0))-(pDate(b.vencimento)||new Date(0)); });
  var tab=document.querySelector('#acordTabVencidos table'); if(!tab) return;
  tab.classList.add('ac-ap');
  tab.querySelector('thead').innerHTML='<tr><th class="ac-ck"><input type="checkbox" id="acSelTodos" aria-label="Marcar todas"></th><th class="ac-c-grp">Grupo</th><th>Processo</th><th>Devedor</th><th>Credor</th>'
    +'<th>Parcela</th><th>Valor</th><th>Vencimento</th><th>Prazo</th><th class="ac-c-acao"></th></tr>';
  var cnt=$('acordVencCount'); if(cnt) cnt.textContent='· '+fI(rows.length)+' parcela(s) a pagar';
  var pg=$('pagAcordosVenc'); if(pg) pg.innerHTML='';
  var el=$('tblAcordosVencBody'); if(!el) return;
  el.innerHTML=rows.length?rows.map(function(a){
    var dv=pDate(a.vencimento), dias=dv?Math.round((dv-hoje)/864e5):null, venc=dias!==null&&dias<=0;
    var emit=!!a.emitidaEm||/sim|emitid/i.test(a.emissao||'');
    return '<tr data-gx="'+_gx(a)+'"'+(venc?' class="ac-ap-venc"':'')+'><td class="ac-ck"><input type="checkbox" data-ac-sel="'+a._id+'"'+(_acSel[a._id]?' checked':'')+' aria-label="Marcar"></td>'
      +'<td class="ac-c-grp" title="'+esc(a.grupo||'')+'">'+esc(a.grupo||'—')+'</td>'
      +'<td class="mono" style="font-size:11.5px">'+esc(a.processo||'—')+'</td><td>'+esc(a.devedor||'—')+'</td><td>'+esc(a.credor||'—')+'</td>'
      +'<td class="mono">'+esc(a.parcela||'—')+' de '+esc(a.totalParc||'—')+'</td><td class="mono"><strong>'+fF(a.valor||0)+'</strong></td>'
      +'<td class="mono">'+esc(a.vencimento||'—')+'</td>'
      +'<td class="mono"><span class="'+(dias===null?'':_diasCls(dias))+'">'+(dias===null?'—':dias<0?Math.abs(dias)+' d atraso':dias===0?'vence hoje':dias+' dias')+'</span></td>'
      // Backup 40: dois botões simples — "Emitir" (vira "Emitido" depois de emitida; clicar de novo reemite) e "Baixa"; sem a caneta
      +'<td class="ac-ap-ac ac-c-acao"><span class="ac-acoes"><button type="button" class="ac-bt-emitir'+(emit?' ac-emitido':'')+'" data-ac-guia="'+a._id+'" title="'+(emit?esc('Emitido'+(a.emitidaEm?' em '+a.emitidaEm:'')+' — clique para emitir de novo'):'Emitir o boleto (ou a cobrança por PIX) e enviar ao cliente')+'">'+(emit?'✓ Emitido':'Emitir')+'</button>'
        +'<button type="button" class="gx-la-bx ac-bt-baixa" data-la="baixa" title="Dar baixa (pago) — pede confirmação">Baixa</button></span></td></tr>';
  }).join(''):'<tr><td colspan="10">'+emp('Nenhuma parcela a pagar — tudo em dia! ✅')+'</td></tr>';
  _acBarraSel();
  el.onchange=function(ev){ var c=ev.target.closest('[data-ac-sel]'); if(!c) return; if(c.checked) _acSel[c.dataset.acSel]=1; else delete _acSel[c.dataset.acSel]; _acBarraSel(); };
  el.onclick=function(ev){ var b=ev.target.closest('[data-ac-guia]'); if(!b) return; ev.stopPropagation();
    // Backup 36: emitir = a janela de envio (e-mail ou WhatsApp) já com esta parcela
    if(window.GS&&GS.enviarAcordosSelecionados) GS.enviarAcordosSelecionados([b.dataset.acGuia], function(){ if(window.ERP_RECARREGAR) window.ERP_RECARREGAR(); }); };
  var tt=$('acSelTodos'); if(tt) tt.onchange=function(){ rows.forEach(function(a){ if(tt.checked) _acSel[a._id]=1; else delete _acSel[a._id]; }); renderAcordosVencTbl(); };
}
function _acBarraSel(){
  var box=$('acSelBarra'), w=document.querySelector('#acordTabVencidos .tw');
  if(!box&&w){ box=document.createElement('div'); box.id='acSelBarra'; box.className='ac-selbar'; w.parentNode.insertBefore(box,w); }
  if(!box) return;
  var ids=Object.keys(_acSel);
  box.innerHTML=ids.length?'<span><b>'+ids.length+' parcela'+(ids.length>1?'s':'')+' marcada'+(ids.length>1?'s':'')+'</b></span><span class="acoes"><button type="button" class="ac-bt-boleto" id="acSelLimpar">Desmarcar</button><button type="button" class="ac-bt-boleto ac-bt-prim" id="acSelEnviar">✉ Enviar por empresa</button></span>'
    :'<span class="sub">Marque as parcelas para enviar os boletos por empresa (ou use Emitir na linha).</span>';
  var l=$('acSelLimpar'); if(l) l.onclick=function(){ _acSel={}; renderAcordosVencTbl(); };
  var e=$('acSelEnviar'); if(e) e.onclick=function(){ if(window.GS&&GS.enviarAcordosSelecionados) GS.enviarAcordosSelecionados(ids, function(){ _acSel={}; if(window.ERP_RECARREGAR) window.ERP_RECARREGAR(); }); };
}
