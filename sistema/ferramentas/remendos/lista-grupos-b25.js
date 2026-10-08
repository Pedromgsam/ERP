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
  // Backup 52 (P4): data-sit = situação única do ERP (cores no design.css)
  if(atr) return '<span class="lg-st '+(risco?'lg-st-risco':'lg-st-r')+'" data-sit="atraso"'+(risco?' title="Um parcelamento/acordo com 2 ou mais parcelas em atraso"':'')+'>'+atr+' em atraso'+(risco?' — risco de rescisão':'')+'</span>';
  return concluido?'<span class="lg-st lg-st-x" data-sit="pago">Concluído</span>':'<span class="lg-st lg-st-g" data-sit="avencer">Em dia</span>';
}
function _lgPag(pagas,total,pago,falta){
  return '<div class="lg-pag"><b class="lg-verde">'+pagas+' de '+(total||'?')+'</b> parcelas pagas</div><div class="lg-sub">Quitado <b>'+_lgFmtV(pago)+'</b> · falta <b>'+_lgFmtV(falta)+'</b></div>';
}
// Backup 28: guias a emitir — parcela sem pagamento, sem emissão, vencida ou vencendo em até 15 dias (mesmo prazo do quadro "Guias para emitir")
function _lgFaltaEmitir(lista, emitida, paga){
  var h=new Date(); h.setHours(0,0,0,0); var lim=new Date(h.getTime()+15*864e5);
  return (lista||[]).filter(function(pa){ var d=pDate(pa.vencimento); return !paga(pa) && !emitida(pa) && d && d<=lim; }).length;
}
// Backup 34: "Situação" só para enxergar — sem quem emite; guias a emitir num aviso discreto embaixo do nome
function _lgGuiaDiscreta(n, grupo){
  if(!n) return '';
  return ' <span class="lg-guia-d" title="'+(grupo?'Há parcelas deste grupo sem a guia emitida (vencem em até 15 dias) — emitir pela Rotina → Controle':'Parcela vencendo em até 15 dias sem a guia emitida — emitir pela Rotina → Controle')+'">· 🧾 '+(n>1?n+' guias a emitir':'1 guia a emitir')+'</span>';
}
function _lgEsc(t){ return String(t).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;'); }
// o: {itens, porGrupo, abertos (obj), fnGrupo, fnItem, rotulo ('parcelamento'|'acordo'), cab}
// Backup 34: a subdivisão natural é Grupo › itens; com um grupo só na tela (filtro de grupo), vira Empresa › itens (item.empresa).
// Linhas de mesma largura (sem recuo), colunas: nome · parcelas pagas (quitado/falta) · próxima parcela · situação.
// Backup 36: "a pagar este mês" = parcelas VENCIDAS (sem pagamento) + as que vencem até o fim do mês corrente
function _lgEsteMes(abertas){
  var h=new Date(); h.setHours(0,0,0,0); var fim=new Date(h.getFullYear(),h.getMonth()+1,0);
  var venc=abertas.filter(function(x){ return x.d&&x.d<=h; }), mes=abertas.filter(function(x){ return x.d&&x.d>h&&x.d<=fim; });
  var s=function(l){ return l.reduce(function(a,x){ return a+(Number(x.v)||0); },0); };
  return { v:s(venc)+s(mes), nv:venc.length, nm:mes.length };
}
function _lgEsteMesTxt(m){
  if(!m.nv&&!m.nm) return '<span class="lg-sub">nada a pagar este mês</span>';
  return '<b>'+_lgFmtV(m.v)+'</b> <span class="lg-sub">'+[m.nv?m.nv+' vencida'+(m.nv>1?'s':''):'',m.nm?m.nm+' do mês':''].filter(Boolean).join(' + ')+'</span>';
}
// o: {itens, porEmpresa, abertos, fnGrupo, fnItem, rotulo, cab}
// Backup 36: cartões MAIORES e com menos informação; o cartão aberto fica destacado (faixa azul + "aberto ▲") e a lista abaixo é uma
// tabela limpa (uma linha por parcelamento/acordo). Com um cartão só na tela (filtro de grupo + empresa), ele já vem aberto.
function _lgRender(o){
  if(!o.itens.length) return '<div class="lg"><div class="pa-ok">Nada com esses filtros.</div></div>';
  var umGrupo=!!o.porEmpresa && o.itens.some(function(x){ return x.empresa; });
  var chave=umGrupo?function(x){ return x.empresa||x.titulo; }:function(x){ return x.grupo; };
  var G={}; o.itens.forEach(function(x){ (G[chave(x)]=G[chave(x)]||[]).push(x); });
  var atrG=function(g){ return G[g].reduce(function(s,x){ return s+x.atr; },0); };
  var gs=Object.keys(G).sort(function(a,b){ return (atrG(b)>0)-(atrG(a)>0) || a.localeCompare(b,'pt-BR'); });
  var sozinho=gs.length===1;
  var linhaItem=function(x){
    var m=_lgEsteMes(x.abertas), pc=x.total?Math.round(x.pagas/x.total*100):0;
    return '<tr class="lg-t-lin'+(x.atr?' lg-atr':'')+'" tabindex="0" onclick="'+o.fnItem+'(\''+_lgEsc(x.k)+'\')" onkeydown="if(event.key===\'Enter\')'+o.fnItem+'(\''+_lgEsc(x.k)+'\')" title="Abrir as parcelas">'
      +'<td><div class="lg-nome">'+esc(umGrupo&&x.tituloEmp?x.tituloEmp:x.titulo)+'</div><div class="lg-sub">'+(umGrupo&&x.subEmp!=null?x.subEmp:x.sub)+'</div></td>'
      +'<td><div class="lg-t-pag"><span><b class="lg-verde">'+x.pagas+'</b> de '+(x.total||'?')+'</span><span class="lg-card-bar"><span style="width:'+pc+'%"></span></span></div></td>'
      +'<td class="lg-t-num">'+_lgFmtV(x.falta)+'</td>'
      +'<td>'+_lgEsteMesTxt(m)+'</td>'
      +'<td>'+_lgSit(x.atr,x.atr>=2,x.concluido)+(x.guias?_lgGuiaDiscreta(x.guias,false):'')+'</td>'
      +(false?'<td class="lg-t-gu">':'')+(false&&o.tabela&&o.tabela!=='acordos'&&!x.concluido?'<button type="button" class="lg-bt-gu" onclick="_lgGuias(event,\''+o.tabela+'\',\'item\',\''+_lgEsc(x.k)+'\')" title="Gerar as guias deste '+o.rotulo+' (em atraso + do mês; se não houver, a próxima)">🧾</button>':'')+'<td class="lg-t-seta">›</td></tr>'; };
  var cards=gs.map(function(g){
    var l=G[g].slice().sort(function(a,b){ return b.atr-a.atr || String(a.titulo+a.sub).localeCompare(String(b.titulo+b.sub),'pt-BR'); }), ab=sozinho||!!o.abertos[g];
    var soma=function(f){ return l.reduce(function(s,x){ return s+(Number(x[f])||0); },0); };
    var atr=soma('atr'), risco=l.some(function(x){ return x.atr>=2; }), pg=soma('pagas'), tot=soma('total'), pc=tot?Math.round(pg/tot*100):0;
    var m=_lgEsteMes([].concat.apply([],l.map(function(x){ return x.abertas; })));
    var card='<div class="lg-card'+(ab?' lg-g-aberto':'')+(atr?(risco?' lg-card-risco':' lg-card-atr'):'')+'" role="button" tabindex="0" aria-expanded="'+ab+'" onclick="'+o.fnGrupo+'(\''+_lgEsc(g)+'\')" onkeydown="if(event.key===\'Enter\')'+o.fnGrupo+'(\''+_lgEsc(g)+'\')" title="'+(ab?'Recolher':'Ver os '+o.rotulo+'s')+'">'
      +'<div class="lg-card-hd"><span class="lg-gnome">'+esc(g)+'</span><span class="lg-card-ab">'+(ab?'aberto ▲':'▼')+'</span></div>'
      +'<div class="lg-card-sit">'+_lgSit(atr,risco,false)+'<span class="lg-card-sub">'+l.length+' '+o.rotulo+(l.length>1?'s':'')+'</span></div>'
      +'<div class="lg-card-bar" title="'+pg+' de '+tot+' parcelas pagas"><span style="width:'+pc+'%"></span></div>'
      +'<div class="lg-card-lin"><span>Pagas</span><b><span class="lg-verde">'+pg+'</span> de '+tot+'</b></div>'
      +'<div class="lg-card-lin"><span>Falta pagar</span><b>'+_lgFmtV(soma('falta'))+'</b></div>'
      +'<div class="lg-card-lin lg-card-mes" title="Parcelas vencidas sem pagamento + as que vencem até o fim deste mês"><span>A pagar este mês</span><span>'+_lgEsteMesTxt(m)+'</span></div></div>';
    var painel=ab?'<div class="lg-painel"><div class="lg-painel-tit"><b>'+esc(g)+'</b><span class="lg-sub">'+l.length+' '+o.rotulo+(l.length>1?'s':'')+' · clique na linha para ver as parcelas</span>'
      +(false&&o.tabela&&o.tabela!=='acordos'?'<button type="button" class="lg-bt-guias" onclick="_lgGuias(event,\''+o.tabela+'\',\''+(umGrupo?'empresa':'grupo')+'\',\''+_lgEsc(g)+'\')" title="Abre o envio já com as parcelas em atraso e as que vencem neste mês">🧾 Gerar guias '+(umGrupo?'desta empresa':'deste grupo')+'</button>':'')
      +(sozinho?'':'<button type="button" class="lg-fechar" onclick="'+o.fnGrupo+'(\''+_lgEsc(g)+'\')" aria-label="Fechar">✕</button>')+'</div>'
      +'<table class="lg-t"><colgroup><col><col style="width:150px"><col style="width:130px"><col style="width:210px"><col style="width:230px"><col style="width:44px"><col style="width:28px"></colgroup>'
      +'<thead><tr><th>'+(umGrupo?o.rotulo.charAt(0).toUpperCase()+o.rotulo.slice(1):'Empresa / '+o.rotulo)+'</th><th>Pagas</th><th class="lg-t-num">Falta</th><th>A pagar este mês</th><th>Situação</th><th></th></tr></thead>'
      +'<tbody>'+l.map(linhaItem).join('')+'</tbody></table></div>':'';
    return card+painel; }).join('');
  return (false&&o.tabela&&o.tabela!=='acordos'?'<div class="lg-topo-guias"><button type="button" class="lg-bt-guias lg-bt-guias-geral" onclick="_lgGuias(event,\''+o.tabela+'\',\'tudo\',\'\')" title="Abre o envio com todas as empresas: parcelas em atraso + as que vencem neste mês">🧾 Gerar guias — em atraso + vencem neste mês</button></div>':'')
    +'<div class="lg lg-min lg-cards">'+cards+'</div>';
}
// Backup 37: "Gerar guias" — geral (respeita o grupo/empresa do filtro do topo), do grupo, da empresa ou de um item (parcelamento/acordo)
// Backup 45: Acordos não emitem pela "Situação dos acordos" (só pela aba A pagar → 🧾 Emitir)
function _lgGuias(ev, tabela, escopo, chave){
  if(ev){ ev.stopPropagation(); ev.preventDefault(); }
  if(!window.GS||!GS.gerarGuias) return;
  var gid=function(nome){ var g=(GS.E.grupos||[]).find(function(x){ return x.nome===nome; }); return g?g.id:null; };
  var F=typeof FILTROS!=='undefined'?FILTROS:{}, a={};
  if(escopo==='tudo'){ if(F.grupo&&gid(F.grupo)) a.grupo_id=gid(F.grupo); if(F.empresa) a.empresa=F.empresa; }
  else if(escopo==='grupo'){ var id=gid(chave); if(id) a.grupo_id=id; else return alert('Grupo sem cadastro: use "Gerar guias" geral.'); }
  else if(escopo==='empresa') a.empresa=chave;
  else a.itens=[tabela==='parcelas'?String(chave).split('|')[0]:chave];
  if(escopo==='item') a.proximas=true;
  GS.gerarGuias(tabela, a, function(){ if(window.ERP_RECARREGAR) window.ERP_RECARREGAR(); });
}
// Backup 34: parcelas do detalhamento (Parcelamentos e Acordos) em LISTA — igual a "Vencidos — URGENTE":
// Parcela · Vencimento · Valor · Situação (pagamento + guia emitida / não emitida / o cliente emite)
// l: [{id, rot, venc (dd/mm/aaaa), valor, lancado, pago, dataPag, emitida, emitidaEm, cliente}]
function _lgParcTabela(l, tabela){
  var h=new Date(); h.setHours(0,0,0,0);
  var nome=tabela==='parcelas'?'Guia':'Boleto', fem=nome==='Guia';
  // Backup 36: colunas próprias — Emissão e Pagamento — sempre alinhadas
  return '<div class="tw lg-parc-tw" data-sem-pagina><table class="lg-parc-tab"><colgroup><col style="width:80px"><col style="width:110px"><col style="width:130px"><col style="width:150px"><col style="width:160px"><col></colgroup>'
    +'<thead><tr><th>Parcela</th><th>Vencimento</th><th class="lg-t-num">Valor</th><th>Emissão</th><th>Pagamento</th><th></th></tr></thead><tbody>'
    +l.map(function(x){ var d=pDate(x.venc), n=d?Math.round((d-h)/864e5):null;
      var pag=x.pago?'<span class="lg-em lg-em-ok" data-sit="pago">✓ Paga'+(x.dataPag?' '+esc(String(x.dataPag).slice(0,5)):'')+'</span>'
        :(n!==null&&n<=0?'<span class="lg-em lg-em-atr" data-sit="'+(n===0?'hoje':'atraso')+'">'+(n===0?'Vence hoje':'Vencida há '+Math.abs(n)+' d')+'</span>':'<span class="lg-em lg-em-cli" data-sit="avencer">A vencer</span>');
      var em=x.cliente?'<span class="lg-em lg-em-cli" data-sit="cliente" title="As guias deste parcelamento são emitidas pelo próprio cliente">Não emitimos</span>'
        :x.emitida?'<span class="lg-em lg-em-ok" title="'+esc(x.emitidaEm?nome+' emitid'+(fem?'a':'o')+' em '+x.emitidaEm:'')+'">✓ Emitid'+(fem?'a':'o')+(x.emitidaEm?' '+esc(String(x.emitidaEm).slice(0,5)):'')+'</span>'
        :(x.pago?'<span class="lg-sub">—</span>':'<span class="lg-em lg-em-nao">Não emitid'+(fem?'a':'o')+'</span>');
      return '<tr class="'+(x.pago?'lg-pt-pago':n!==null&&n<=0?'lg-pt-atr':'')+'"><td>'+esc(x.rot||'?')+'</td><td>'+esc(x.venc||'—')+'</td>'
        +'<td class="lg-t-num" title="'+(x.lancado===false?'Valor não lançado nesta parcela: vale o último lançado':'')+'">'+_lgFmtV(Number(x.valor)||0)+(x.lancado===false?'<span class="lg-pt-est">*</span>':'')+'</td>'
        +'<td>'+em+'</td><td>'+pag+'</td>'
        +'<td class="lg-pt-ac">'+(tabela==='acordos'?'<button type="button" class="btn-ed" data-lg-editar="'+x.id+'" title="Alterar só esta parcela" aria-label="Alterar só esta parcela">✎</button> ':'')+(x.pago||tabela==='parcelas'?'':'<button type="button" class="btn btn-o btn-mini lg-bt-pagar" data-lg-pagar="'+x.id+'" data-lg-rot="'+esc(x.rot||'')+'" data-lg-val="'+esc(_lgFmtV(Number(x.valor)||0))+'" title="Lançar o pagamento desta parcela">＋ Lançar pagamento</button>')+'</td></tr>'; }).join('')
    +'</tbody></table></div>'
    +(l.some(function(x){ return x.lancado===false; })?'<div class="lg-pt-nota">* valor ainda não lançado nesta parcela — vale o último valor lançado (o valor muda todo mês).</div>':'');
}
// Backup 36: confirmação antes de lançar o pagamento (evita clique sem querer)
function _lgConfirmaPag(b){ return confirm('Lançar o pagamento da parcela '+(b.dataset.lgRot||'')+(b.dataset.lgVal?' ('+b.dataset.lgVal+')':'')+'?\n\nConfirme só se o cliente já pagou.'); }
// cabeçalho do detalhamento com os dados da planilha (devedor, CPF/CNPJ, órgão, natureza, nº…)
function _lgFicha(campos){
  return '<div class="lg-ficha">'+campos.filter(function(c){ return c&&c[1]!==''&&c[1]!=null; }).map(function(c){ return '<div><span>'+c[0]+'</span><b>'+c[1]+'</b></div>'; }).join('')+'</div>';
}
