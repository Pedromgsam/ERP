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
  var el=$('acAnalise'); if(!el) return; if(typeof _guiasNoTopo==='function') _guiasNoTopo('acordos', el); if(!ac.length){ el.innerHTML=exBloco('exAcSit','Situação dos acordos','<div class="gx-tab-topo"><div class="pa-sub">Acordos em andamento</div><div class="pcx-ctl">'+_acVisSeg()+_acCaixaTodos()+'</div></div><div class="pa-ok">Nenhum acordo pendente. Marque "Mostrar concluídos" para ver todos.</div>'); return; }
  var hj=new Date(); hj.setHours(0,0,0,0); var fimMes=new Date(hj.getFullYear(),hj.getMonth()+1,0);
  var v=function(a){return Number(a.valor)||0;}, pago=function(a){return a.situacao==='Pago';};
  var atrasada=function(a){ if(pago(a)) return false; var d=pDate(a.vencimento); return a.situacao==='Vencido'||(d&&d<=hj); };   // Backup 25: o dia do vencimento já conta
  var noMes=function(a){ if(pago(a)) return false; var d=pDate(a.vencimento); return d&&d>=hj&&d<=fimMes; };
  var soma=function(l){return l.reduce(function(s,a){return s+v(a);},0);};
  var G={}; ac.forEach(function(a){ var k=_acChave(a); if(!G[k]) G[k]={k:k,a:a,l:[]}; G[k].l.push(a); });
  var lista=Object.keys(G).map(function(k){ var g=G[k];
    g.l.sort(function(x,y){ var dx=pDate(x.vencimento), dy=pDate(y.vencimento); return (dx?dx.getTime():0)-(dy?dy.getTime():0); });
    g.total=soma(g.l); g.pago=soma(g.l.filter(pago)); g.falta=g.total-g.pago; g.atr=g.l.filter(atrasada).length;
    g.pagas=g.l.filter(pago).length; g.prox=g.l.filter(function(a){return !pago(a);})[0]||null; g.parcela=g.prox?v(g.prox):v(g.l[g.l.length-1]);
    g.obs=(g.l.find(function(a){return a.obs;})||{}).obs||''; return g; })
    .sort(function(x,y){ return y.atr-x.atr || y.falta-x.falta; });
  // Backup 25: a mesma lista por grupo de Parcelamentos (_lgRender): grupo → acordos do grupo; clicar no acordo abre o detalhamento numa janela
  _acLISTA=lista; _acFns={v:v,pago:pago,atrasada:atrasada};
  var itens=lista.map(function(g){ return {k:g.k, grupo:g.a.grupo||'Sem grupo', titulo:g.a.devedor||'—', pagas:g.pagas, total:g.l.length, pago:g.pago, falta:g.falta, atr:g.atr, concluido:g.falta<=0,
    guias:_lgFaltaEmitir(g.l, function(a){ return !!a.emitidaEm||/sim|emitid/i.test(a.emissao||''); }, pago),
    sub:'deve a <b>'+esc(g.a.credor||'—')+'</b>'+(g.a.processo?' · '+esc(g.a.processo):'')+(_acVisao==='lista'&&g.a.grupo?' · '+esc(g.a.grupo):''),
    abertas:g.l.filter(function(a){ return !pago(a); }).map(function(a){ return {d:pDate(a.vencimento), v:v(a)}; })}; });
  var vis=_acVisSeg();
  var linhas=_lgRender({itens:itens, porGrupo:true, abertos:_acGrpAbertos, fnGrupo:'_acAbrirGrupo', fnItem:'_acAbrir', rotulo:'acordo', cab:'Grupo / acordo'});
  el.innerHTML=exBloco('exAcSit','Situação dos acordos',
    '<div class="kpi-grid" style="margin-bottom:14px">'
   + kC('Já pago',_faFT(soma(ac.filter(pago))),ac.filter(pago).length+' parcela(s)','cg','dg')
   + kC('Falta pagar',_faFT(soma(ac.filter(function(a){return !pago(a);}))),lista.filter(function(g){return g.falta>0;}).length+' acordo(s) em aberto','ca','')
   + kC('Vence este mês',_faFT(soma(ac.filter(noMes))),ac.filter(noMes).length+' parcela(s) até '+fimMes.toLocaleDateString('pt-BR').slice(0,5),'cb','')
   + kC('Em atraso',_faFT(soma(ac.filter(atrasada))),ac.filter(atrasada).length+' parcela(s) vencida(s)','cr',ac.some(atrasada)?'dr':'')
   + '</div>'
   + '<div class="gx-tab-topo"><div class="pa-sub">Acordos em andamento</div><div class="pcx-ctl">'+vis+_acCaixaTodos()+'</div></div>'
   + linhas);
}
var _acVisao='grupo', _acGrpAbertos={}, _acLISTA=[], _acFns=null;
function _acVisSeg(){ return ''; }   // Backup 27: sem "Por grupo / Lista" — sempre por grupo
function _acAbrirGrupo(g){ _acGrpAbertos[g]=!_acGrpAbertos[g]; renderAcordos(); }
// Detalhamento do acordo numa janela: resumo e as parcelas com "Lançar pagamento"
function _acAbrir(k){
  var g=_acLISTA.find(function(x){ return x.k===k; }); if(!g||!window.GS||!GS.abrirJanela) return;
  var F=_acFns, kp=function(r,val,c){ return '<div class="pcd-kpi'+(c?' '+c:'')+'"><span>'+r+'</span><b>'+val+'</b></div>'; };
  var j=GS.abrirJanela({ titulo:'Acordo — '+(g.a.devedor||''), larga:true,
    corpo:'<div class="pcd"><div class="pcd-hd"><div><div class="pcd-emp">'+esc(g.a.devedor||'—')+'</div><div class="sub">deve a <b>'+esc(g.a.credor||'—')+'</b>'+(g.a.processo?' · processo '+esc(g.a.processo):'')+(g.a.grupo?' · '+esc(g.a.grupo):'')+'</div></div>'
      +'<div>'+_lgSit(g.atr,g.atr>=2,g.falta<=0)+'</div></div>'
      +'<div class="pcd-kpis">'+kp('Parcelas pagas',g.pagas+' de '+g.l.length)+kp('Já pago',_faFT(g.pago),'verde')+kp('Falta pagar',_faFT(g.falta))
        +kp('Próxima parcela',g.prox?esc(g.prox.vencimento||'—'):'—')+(g.atr?kp('Em atraso',g.atr+' parcela'+(g.atr>1?'s':''),'vermelho'):'')+'</div>'
      +(g.a.responsavel||g.l[0].pix||g.l[0].banco?'<div class="acx-info">'+[g.a.responsavel?'Responsável: <b>'+esc(g.a.responsavel)+'</b>':'',g.l[0].pix?'PIX: <b>'+esc(g.l[0].pix)+'</b>':'',g.l[0].banco?'Banco: <b>'+esc(g.l[0].banco)+'</b>':''].filter(Boolean).join(' · ')+'</div>':'')
      +'<div class="pcd-tit">Parcelas</div><div class="acx-parcs">'+g.l.map(function(a){ var st=F.pago(a)?'p':F.atrasada(a)?'r':'a';
        return '<div class="acx-parc acx-parc-'+st+'"><div class="acx-parc-n">Parcela '+esc(a.parcela||'?')+(a.totalParc?'/'+esc(a.totalParc):'')+'</div>'
          +'<div class="acx-parc-v">'+_faFT(F.v(a))+'</div>'
          +'<div class="acx-sub">'+(F.pago(a)?'✓ paga'+(a.dataPag?' em '+esc(a.dataPag):''):(st==='r'?'venceu ':'vence ')+esc(a.vencimento||'—'))+'</div>'
          // Backup 27: emissão do boleto/PIX (quando e quem)
          +'<div class="acx-parc-lin"><span>Boleto / PIX</span>'+((a.emitidaEm||/sim|emitid/i.test(a.emissao||''))?'<b title="'+esc(a.emitidaPor?'por '+a.emitidaPor:'')+'">✓ emitido'+(a.emitidaEm?' '+esc(a.emitidaEm.slice(0,5)):'')+'</b>':(F.pago(a)?'<span>—</span>':'<b style="color:var(--amber-d)">a emitir</b>'))+'</div>'
          +'<div class="acx-parc-bt">'+(F.pago(a)?'':'<button type="button" class="btn btn-o btn-mini" data-emitir="'+a._id+'">'+((a.emitidaEm||/sim|emitid/i.test(a.emissao||''))?'✎ Emissão':'🧾 Emitir boleto')+'</button><button type="button" class="btn-m ac-bt-pagar" data-ac-pagar="'+a._id+'">✓ Lançar pagamento</button>')
          +'<button type="button" class="btn-m acx-link" data-ac-det="'+a._id+'">Detalhe</button></div></div>'; }).join('')+'</div></div>' });
  j.querySelectorAll('[data-ac-pagar]').forEach(function(b){ b.onclick=function(){ GS.fecharJanela(j); _acPagar(b.dataset.acPagar,b); }; });
  j.querySelectorAll('[data-ac-det]').forEach(function(b){ b.onclick=function(){ GS.fecharJanela(j); _acDetalhe(b.dataset.acDet); }; });
  j.querySelectorAll('[data-emitir]').forEach(function(b){ b.onclick=function(){ GS.fecharJanela(j); GS.emitirParcela('acordos', b.dataset.emitir, function(){ setTimeout(function(){ _acAbrir(k); }, 900); }); }; });
}
// ═══ Backup 21 ═══
// Dias até o vencimento, a mesma régua em todo o ERP: vencido (inclui o próprio dia) vermelho · <3 amarelo · <10 azul · ≥10 verde
function _diasCls(d){ return d<=0?'dias-r':d<3?'dias-a':d<10?'dias-b':'dias-g'; }
// Saldo por devedor: um cartão-linha por devedor (posição, nome, nº de acordos, parcelas em atraso, barra na rampa azul pelo posto, saldo e %)
var _AC_RAMPA=['var(--chart-rampa-1)','var(--chart-rampa-2)','var(--chart-rampa-3)','var(--chart-rampa-4)','var(--chart-rampa-5)'];
function _acSaldoDevedor(acAP){
  var el=$('acDevedorLista'); if(!el) return;
  var hj=new Date(), D={}; hj.setHours(0,0,0,0);
  acAP.forEach(function(a){ var k=a.devedor||'—', d=pDate(a.vencimento); var x=D[k]=D[k]||{n:k,v:0,atr:0,vAtr:0,ac:{}};
    x.v+=Number(a.valor)||0; x.ac[_acChave(a)]=1; if(a.situacao==='Vencido'||(d&&d<=hj)){ x.atr++; x.vAtr+=Number(a.valor)||0; } });
  var L=Object.keys(D).map(function(k){ return D[k]; }).sort(function(a,b){ return b.v-a.v; });
  if(!L.length){ el.innerHTML='<div class="pa-ok">Nenhum saldo em aberto.</div>'; _acProx30(acAP, hj); return; }
  var tot=L.reduce(function(s,x){return s+x.v;},0)||1, max=L[0].v||1, mais=L.length>10?L.length-10:0, n10=Math.min(L.length,10);
  el.innerHTML='<div class="acs-tot"><span>Total em aberto</span><b>'+fF(tot)+'</b><span class="acs-n">'+L.length+' devedor'+(L.length>1?'es':'')+'</span></div>'
    +'<div class="acs">'+L.slice(0,10).map(function(x,i){ var na=Object.keys(x.ac).length;
      return '<div class="acs-it"><div class="acs-pos">'+(i+1)+'</div>'
        +'<div class="acs-quem"><div class="acs-nome" title="'+esc(x.n)+'">'+esc(x.n)+'</div><div class="acs-sub">'+na+' acordo'+(na>1?'s':'')
        +(x.atr?' · <span class="acs-atr">'+x.atr+' parcela'+(x.atr>1?'s':'')+' em atraso ('+fF(x.vAtr)+')</span>':' · em dia')+'</div></div>'
        +'<div class="acs-bar"><span style="width:'+Math.max(2,x.v/max*100).toFixed(1)+'%;background:'+_AC_RAMPA[n10>1?Math.round(i*(_AC_RAMPA.length-1)/(n10-1)):0]+'"></span></div>'
        +'<div class="acs-v">'+fF(x.v)+'</div><div class="acs-p">'+(x.v/tot*100).toFixed(1).replace('.',',')+'%</div></div>'; }).join('')
    +'</div>'+(mais?'<div class="acs-mais">+ '+mais+' devedor'+(mais>1?'es':'')+' com saldo menor</div>':'');
  _acProx30(acAP, hj);
}
// Vencimentos dos próximos 30 dias (o próprio dia do vencimento já está em "Vencidos"): data · devedor → credor · parcela · valor · dias (régua de cores)
function _acProx30(acAP, hj){
  var el=$('acProx30'); if(!el) return;
  var lim=new Date(hj); lim.setDate(lim.getDate()+30);
  var L=acAP.map(function(a){ return {a:a,d:pDate(a.vencimento)}; }).filter(function(x){ return x.d&&x.d>hj&&x.d<=lim&&x.a.situacao!=='Vencido'; })
    .sort(function(x,y){ return x.d-y.d; });
  if(!L.length){ el.innerHTML='<div class="pa-ok">Nenhuma parcela vence nos próximos 30 dias.</div>'; return; }
  var tot=L.reduce(function(s,x){ return s+(Number(x.a.valor)||0); },0);
  el.innerHTML='<div class="acs-tot"><span>A vencer em 30 dias</span><b>'+fF(tot)+'</b><span class="acs-n">'+L.length+' parcela'+(L.length>1?'s':'')+'</span></div>'
    +'<div class="acs acp">'+L.slice(0,10).map(function(x){ var n=Math.round((x.d-hj)/864e5), a=x.a;
      return '<div class="acp-it"><div class="acp-data">'+esc(a.vencimento||'')+'</div>'
        +'<div class="acs-quem"><div class="acs-nome" title="'+esc(a.devedor||'')+'">'+esc(a.devedor||'—')+'</div><div class="acs-sub">→ '+esc(a.credor||'—')+' · parcela '+esc(a.parcela||'?')+(a.totalParc?'/'+esc(a.totalParc):'')+'</div></div>'
        +'<div class="acs-v">'+fF(Number(a.valor)||0)+'</div><div class="acp-dias"><span class="'+_diasCls(n)+'">'+(n<=0?'vence hoje':'em '+n+' d')+'</span></div></div>'; }).join('')
    +'</div>'+(L.length>10?'<div class="acs-mais">+ '+(L.length-10)+' parcela'+(L.length-10>1?'s':'')+'</div>':'');
}
