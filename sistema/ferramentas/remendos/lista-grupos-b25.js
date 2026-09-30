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
function _lgTagGuia(n, grupo){
  if(!n) return '<span class="lg-guia-ok">—</span>';
  return '<span class="lg-guia" title="'+(grupo?'Há parcelas deste grupo sem a guia emitida (vencem em até 15 dias)':'Parcela vencendo em até 15 dias sem a guia emitida')+'">🧾 '+(grupo?'Há guias a emitir':(n>1?'Faltam '+n+' guias':'Falta emitir a guia'))+'</span>';
}
function _lgEsc(t){ return String(t).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;'); }
// o: {itens, porGrupo, abertos (obj), fnGrupo (nome da função global que abre/fecha o grupo), fnItem (nome da função que abre o item),
//     rotulo ('parcelamento'|'acordo'), cab (título da 1ª coluna)}
function _lgRender(o){
  var linhaItem=function(x,sub){
    var p=_lgProx(x.abertas);
    return '<div class="lg-i'+(sub?' lg-filho':'')+(x.atr?' lg-atr':'')+'" role="button" tabindex="0" onclick="'+o.fnItem+'(\''+_lgEsc(x.k)+'\')" onkeydown="if(event.key===\'Enter\')'+o.fnItem+'(\''+_lgEsc(x.k)+'\')" title="Abrir o detalhamento">'
      +'<div class="lg-c1"><div class="lg-nome">'+esc(x.titulo)+'</div><div class="lg-sub">'+x.sub+'</div></div>'
      +'<div class="lg-cg">'+_lgTagGuia(x.guias,false)+'</div>'
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
        +'<div class="lg-cg">'+_lgTagGuia(soma('guias'),true)+'</div>'
        +'<div class="lg-c2">'+_lgPag(soma('pagas'),soma('total'),soma('pago'),soma('falta'))+'</div>'
        +'<div class="lg-c3">'+(p?'<div class="lg-val">'+_lgFmtV(p.v)+'</div><div class="lg-sub">'+(p.n>1?p.n+' parcelas em '+p.mes:'vence '+p.d.toLocaleDateString('pt-BR'))+'</div>':'<div class="lg-val">—</div>')+'</div>'
        +'<div class="lg-c4">'+_lgSit(atr,risco,false)+'</div><div class="lg-c5" aria-hidden="true"></div></div>'
        +(ab?'<div class="lg-filhos"><div class="lg-filhos-tit">'+l.length+' '+o.rotulo+(l.length>1?'s':'')+' de '+esc(g)+' · clique para ver as parcelas</div>'+l.map(function(x){ return linhaItem(x,true); }).join('')+'</div>':'')+'</div>'; }).join('');
  } else corpo=o.itens.slice().sort(function(a,b){ return b.atr-a.atr || String(a.titulo).localeCompare(String(b.titulo),'pt-BR'); }).map(function(x){ return '<div class="lg-solto">'+linhaItem(x,false)+'</div>'; }).join('');
  return '<div class="lg"><div class="lg-hd"><span>'+o.cab+'</span><span>Guias</span><span>Parcelas pagas</span><span>Próxima parcela</span><span>Situação</span><span></span></div>'+corpo+'</div>';
}
