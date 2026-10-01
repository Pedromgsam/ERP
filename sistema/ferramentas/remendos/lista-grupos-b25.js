// ═══ Backup 25 — LISTA POR GRUPO (a mesma para Parcelamentos e Acordos) ═══
// Linha do GRUPO (clique abre) e, dentro dela, uma linha por parcelamento/acordo, bem recuada e em cartão próprio.
// Colunas: nome · "147 de 410 parcelas pagas" (embaixo "Quitado R$ · falta R$") · próxima parcela · situação.
// • Próxima parcela do GRUPO = soma de todas as parcelas que vencem no mês da próxima (ex.: 3 parcelas em out/2026).
// • Situação = nº de parcelas em atraso (o dia do vencimento já conta). "Risco de rescisão" só quando UM parcelamento/acordo
//   tem 2 ou mais parcelas em atraso (20 parcelas atrasadas, uma em cada parcelamento, não é risco).
// item: {k, grupo, titulo, sub, pagas, total, pago, falta, atr, abertas:[{d:Date, v:Number}], extra}
var _LG_MES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function _lgFmtV(v){ return typeof _faFT==='function'?_faFT(v):fF(v); }
function _lgProx(abertas){
  var h=new Date(); h.setHours(0,0,0,0);
  var fut=abertas.filter(function(x){ return x.d&&x.d>h; }).sort(function(a,b){ return a.d-b.d; });
  if(!fut.length) return null;
  var m=fut[0].d.getMonth(), y=fut[0].d.getFullYear();
  var doMes=fut.filter(function(x){ return x.d.getMonth()===m&&x.d.getFullYear()===y; });
  return { d:fut[0].d, v:doMes.reduce(function(s,x){ return s+(Number(x.v)||0); },0), n:doMes.length, mes:_LG_MES[m]+'/'+y };
}
// Backup 27: uma pílula só — "2 em atraso" (rosa) ou, com risco, "2 em atraso — risco de rescisão" (a pílula toda vermelha)
function _lgSit(atr,risco,concluido){
  if(atr) return '<span class="lg-st '+(risco?'lg-st-risco':'lg-st-r')+'"'+(risco?' title="Um parcelamento/acordo com 2 ou mais parcelas em atraso"':'')+'>'+atr+' em atraso'+(risco?' — risco de rescisão':'')+'</span>';
  return concluido?'<span class="lg-st lg-st-x">Concluído</span>':'<span class="lg-st lg-st-g">Em dia</span>';
}
function _lgPag(pagas,total,pago,falta){
  return '<div class="lg-pag"><b class="lg-verde">'+pagas+' de '+(total||'?')+'</b> parcelas pagas</div><div class="lg-sub">Quitado <b>'+_lgFmtV(pago)+'</b> · falta <b>'+_lgFmtV(falta)+'</b></div>';
}
// Backup 28: guias a emitir — parcela sem pagamento, sem emissão, vencida ou vencendo em até 15 dias (mesmo prazo do quadro "Guias para emitir")
function _lgFaltaEmitir(lista, emitida, paga){
  var h=new Date(); h.setHours(0,0,0,0); var lim=new Date(h.getTime()+15*864e5);
  return (lista||[]).filter(function(pa){ var d=pDate(pa.vencimento); return !paga(pa) && !emitida(pa) && d && d<=lim; }).length;
}
// Backup 33: quem emite fica à vista — "👤 Cliente emite" / "✓ Nós emitimos" (no grupo: quantos de cada)
function _lgTagGuia(n, grupo, emit){
  if(!grupo && emit===false) return '<span class="lg-guia-cli" title="As guias deste parcelamento são emitidas pelo próprio cliente">👤 Cliente emite</span>';
  if(!n){
    if(grupo && emit) return '<span class="lg-guia-nos">'+(emit.nos?'✓ Nós: '+emit.nos:'')+(emit.nos&&emit.cli?' · ':'')+(emit.cli?'👤 Cliente: '+emit.cli:'')+'</span>';
    return emit===true?'<span class="lg-guia-nos" title="O escritório emite as guias">✓ Nós emitimos</span>':'<span class="lg-guia-ok">—</span>';
  }
  return '<span class="lg-guia" title="'+(grupo?'Há parcelas deste grupo sem a guia emitida (vencem em até 15 dias)':'Parcela vencendo em até 15 dias sem a guia emitida')+'">🧾 '+(grupo?'Há guias a emitir':(n>1?'Faltam '+n+' guias':'Falta emitir a guia'))+'</span>';
}
function _lgEmit(l){ var nos=l.filter(function(x){ return x.emitimos===true; }).length, cli=l.filter(function(x){ return x.emitimos===false; }).length; return (nos||cli)?{nos:nos,cli:cli}:null; }
// Backup 33: visão em 2 colunas (teste) — à esquerda grupo › item com quem emite, parcelas pagas, quitado e o que falta; à direita só o que está em atraso
var _lgDuas=false; try{ _lgDuas=localStorage.getItem('erp_lg_duas')==='1'; }catch(e){}
function _lgAlternarDuas(){ _lgDuas=!_lgDuas; try{ localStorage.setItem('erp_lg_duas',_lgDuas?'1':'0'); }catch(e){}
  if(typeof renderParcAnalise==='function') renderParcAnalise(); if(typeof renderAcordos==='function') renderAcordos(); }
function _lgBotaoDuas(){ return '<button type="button" class="btn btn-o btn-mini lg-bt-duas'+(_lgDuas?' ativo':'')+'" onclick="_lgAlternarDuas()" title="Visão de teste: situação à esquerda e só os atrasados à direita">'+(_lgDuas?'☰ Uma coluna':'⧉ 2 colunas (teste)')+'</button>'; }
function _lgRenderDuas(o){
  var G={}; o.itens.forEach(function(x){ (G[x.grupo]=G[x.grupo]||[]).push(x); });
  var gs=Object.keys(G).sort(function(a,b){ return a.localeCompare(b,'pt-BR'); });
  var lin=function(x,filho){ return '<div class="lg2-l'+(filho?' lg2-filho':'')+'" role="button" tabindex="0" onclick="'+o.fnItem+'(\''+_lgEsc(x.k)+'\')" title="Abrir o detalhamento">'
    +'<div class="lg2-c1"><div class="lg-nome">'+esc(x.titulo)+'</div><div class="lg-sub">'+x.sub+'</div></div>'
    +'<div>'+_lgTagGuia(x.guias,false,x.emitimos)+'</div><div class="lg2-num"><b class="lg-verde">'+x.pagas+'</b> de '+(x.total||'?')+'</div>'
    +'<div class="lg2-num lg-verde">'+_lgFmtV(x.pago)+'</div><div class="lg2-num"><b>'+_lgFmtV(x.falta)+'</b></div></div>'; };
  var esq=gs.map(function(g){ var l=G[g], ab=!!o.abertos[g], soma=function(f){ return l.reduce(function(s,x){ return s+(Number(x[f])||0); },0); };
    return '<div class="lg2-g'+(ab?' lg2-aberto':'')+'"><div class="lg2-l lg2-gl" role="button" tabindex="0" onclick="'+o.fnGrupo+'(\''+_lgEsc(g)+'\')">'
      +'<div class="lg2-c1"><div class="lg-gnome"><span class="lg-seta">'+(ab?'▾':'▸')+'</span>'+esc(g)+'</div><div class="lg-sub">'+l.length+' '+o.rotulo+(l.length>1?'s':'')+'</div></div>'
      +'<div>'+_lgTagGuia(soma('guias'),true,_lgEmit(l))+'</div><div class="lg2-num"><b class="lg-verde">'+soma('pagas')+'</b> de '+soma('total')+'</div>'
      +'<div class="lg2-num lg-verde">'+_lgFmtV(soma('pago'))+'</div><div class="lg2-num"><b>'+_lgFmtV(soma('falta'))+'</b></div></div>'
      +(ab?l.map(function(x){ return lin(x,true); }).join(''):'')+'</div>'; }).join('');
  var atr=o.itens.filter(function(x){ return x.atr>0; }).sort(function(a,b){ return b.atr-a.atr || (b.atrV||0)-(a.atrV||0); });
  var dir=atr.length?atr.map(function(x){ return '<div class="lg2-a" role="button" tabindex="0" onclick="'+o.fnItem+'(\''+_lgEsc(x.k)+'\')" title="Abrir o detalhamento">'
      +'<div><div class="lg-nome">'+esc(x.titulo)+'</div><div class="lg-sub">'+esc(x.grupo)+'</div></div>'
      +'<div>'+_lgSit(x.atr,x.atr>=2,false)+'</div><div class="lg2-num"><b>'+(x.atrV?_lgFmtV(x.atrV):'—')+'</b><div class="lg-sub">em atraso</div></div></div>'; }).join('')
    :'<div class="pa-ok">Nenhum '+o.rotulo+' em atraso. 👏</div>';
  return '<div class="lg-duas"><div class="lg2-esq"><div class="lg2-l lg2-hd"><span>'+o.cab+'</span><span>Guias</span><span class="lg2-num">Parcelas pagas</span><span class="lg2-num">Quitado</span><span class="lg2-num">Falta</span></div>'+esq+'</div>'
    +'<div class="lg2-dir"><div class="lg2-dir-hd">⏰ Em atraso <span class="lg-sub">'+atr.length+' '+o.rotulo+(atr.length===1?'':'s')+(atr.some(function(x){ return x.atr>=2; })?' · '+atr.filter(function(x){ return x.atr>=2; }).length+' com risco de rescisão':'')+'</span></div>'+dir+'</div></div>';
}
function _lgEsc(t){ return String(t).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;'); }
// o: {itens, porGrupo, abertos (obj), fnGrupo (nome da função global que abre/fecha o grupo), fnItem (nome da função que abre o item),
//     rotulo ('parcelamento'|'acordo'), cab (título da 1ª coluna)}
function _lgRender(o){
  if(_lgDuas) return _lgRenderDuas(o);
  var linhaItem=function(x,sub){
    var p=_lgProx(x.abertas);
    return '<div class="lg-i'+(sub?' lg-filho':'')+(x.atr?' lg-atr':'')+'" role="button" tabindex="0" onclick="'+o.fnItem+'(\''+_lgEsc(x.k)+'\')" onkeydown="if(event.key===\'Enter\')'+o.fnItem+'(\''+_lgEsc(x.k)+'\')" title="Abrir o detalhamento">'
      +'<div class="lg-c1"><div class="lg-nome">'+esc(x.titulo)+'</div><div class="lg-sub">'+x.sub+'</div></div>'
      +'<div class="lg-cg">'+_lgTagGuia(x.guias,false,x.emitimos)+'</div>'
      +'<div class="lg-c2">'+_lgPag(x.pagas,x.total,x.pago,x.falta)+'</div>'
      +'<div class="lg-c3">'+(p?'<div class="lg-val">'+_lgFmtV(p.v)+'</div><div class="lg-sub">vence '+p.d.toLocaleDateString('pt-BR')+'</div>':'<div class="lg-val">—</div><div class="lg-sub">'+(x.atr?'só vencidas':'sem próxima')+'</div>')+'</div>'
      +'<div class="lg-c4">'+_lgSit(x.atr,x.atr>=2,x.concluido)+'</div><div class="lg-c5" aria-hidden="true">›</div></div>'; };
  var corpo;
  if(!o.itens.length) corpo='<div class="pa-ok">Nada com esses filtros.</div>';
  else if(o.porGrupo){
    var G={}; o.itens.forEach(function(x){ (G[x.grupo]=G[x.grupo]||[]).push(x); });
    var atrG=function(g){ return G[g].reduce(function(s,x){ return s+x.atr; },0); };
    var gs=Object.keys(G).sort(function(a,b){ return (atrG(b)>0)-(atrG(a)>0) || a.localeCompare(b,'pt-BR'); });
    corpo=gs.map(function(g){
      var l=G[g].slice().sort(function(a,b){ return String(a.titulo).localeCompare(String(b.titulo),'pt-BR'); }), ab=!!o.abertos[g];
      var soma=function(f){ return l.reduce(function(s,x){ return s+(Number(x[f])||0); },0); };
      var atr=soma('atr'), risco=l.some(function(x){ return x.atr>=2; });
      var p=_lgProx([].concat.apply([],l.map(function(x){ return x.abertas; })));
      return '<div class="lg-g'+(ab?' lg-g-aberto':'')+(atr?' lg-atr':'')+'">'
        +'<div class="lg-gl" role="button" tabindex="0" aria-expanded="'+ab+'" onclick="'+o.fnGrupo+'(\''+_lgEsc(g)+'\')" onkeydown="if(event.key===\'Enter\')'+o.fnGrupo+'(\''+_lgEsc(g)+'\')" title="'+(ab?'Recolher':'Ver os '+o.rotulo+'s do grupo')+'">'
        +'<div class="lg-c1"><div class="lg-gnome"><span class="lg-seta" aria-hidden="true">'+(ab?'▾':'▸')+'</span>'+esc(g)+'</div><div class="lg-sub">'+l.length+' '+o.rotulo+(l.length>1?'s':'')+'</div></div>'
        +'<div class="lg-cg">'+_lgTagGuia(soma('guias'),true,_lgEmit(l))+'</div>'
        +'<div class="lg-c2">'+_lgPag(soma('pagas'),soma('total'),soma('pago'),soma('falta'))+'</div>'
        +'<div class="lg-c3">'+(p?'<div class="lg-val">'+_lgFmtV(p.v)+'</div><div class="lg-sub">'+(p.n>1?p.n+' parcelas em '+p.mes:'vence '+p.d.toLocaleDateString('pt-BR'))+'</div>':'<div class="lg-val">—</div>')+'</div>'
        +'<div class="lg-c4">'+_lgSit(atr,risco,false)+'</div><div class="lg-c5" aria-hidden="true"></div></div>'
        +(ab?'<div class="lg-filhos"><div class="lg-filhos-tit">'+l.length+' '+o.rotulo+(l.length>1?'s':'')+' de '+esc(g)+' · clique para ver as parcelas</div>'+l.map(function(x){ return linhaItem(x,true); }).join('')+'</div>':'')+'</div>'; }).join('');
  } else corpo=o.itens.slice().sort(function(a,b){ return b.atr-a.atr || String(a.titulo).localeCompare(String(b.titulo),'pt-BR'); }).map(function(x){ return '<div class="lg-solto">'+linhaItem(x,false)+'</div>'; }).join('');
  return '<div class="lg"><div class="lg-hd"><span>'+o.cab+'</span><span>Guias</span><span>Parcelas pagas</span><span>Próxima parcela</span><span>Situação</span><span></span></div>'+corpo+'</div>';
}
