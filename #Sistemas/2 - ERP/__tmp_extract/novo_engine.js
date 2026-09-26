// ════════════════════════════════════════════════════════════════════
// HONORÁRIOS CONTABILIDADE  (v2, 22/09/2026)
//
// Espelha o módulo Financeiro do Jurídico (Análise/A Receber/Recebidos)
// quase à risca — mesmos controles, mesmos gráficos, mesma mecânica de
// filtro por período/pessoa/recorte, mesma tabela sortável/paginada.
// Reaproveita as peças genéricas do resto do ERP (kC/fF/fS/esc/pDate/
// mCh/bCfg/dCfg/tomAzul/paginate/mkOpts/_applyChip/_FA_MES) e NADA do
// estado do Jurídico (_FA, _finTab, _finSort…) — são duas contabilidades
// diferentes, e dois módulos independentes não podem compartilhar um
// filtro ligado.
//
// Particularidade #1 — sem Prejuízo: a planilha não tem essa aba. Em vez
// disso, a Contabilidade tem duas FRENTES simétricas: dinheiro entrando
// (A Receber/Receita) e dinheiro saindo (A Pagar/Despesa). O Jurídico só
// analisa a entrada a fundo (a saída dele é só o KPI de Prejuízo). Aqui
// as duas frentes merecem a mesma profundidade — por isso o mesmo motor
// de Análise roda duas vezes, uma por "lado" (_FC.lado), e as abas
// A Receber/A Pagar e Receita/Despesa reaproveitam, cada par, o mesmo
// par de telas (aberto/fechado) que o Jurídico usa para A Receber/
// Recebidos.
//
// Particularidade #2 — sem advogado: não existe um "quem fez" separado
// do cliente/fornecedor — cada lançamento JÁ é a empresa (Grupo, na
// Receita) ou o fornecedor (Fornecedor, mapeado para o mesmo campo
// `grupo` no backend) inteiro. Por isso _fcQuem() usa `grupo` direto, e
// o filtro "Tipo" do Jurídico vira "Recorte" aqui (Tipo nas abas de
// receita — sempre "Contabilidade", pouco útil — ou Categoria nas abas
// de despesa, que é o dado realmente interessante).
//
// Como só uma aba fica no DOM por vez (renderFinanceiroContab() sempre
// substitui #finCContent inteiro), os MESMOS ids de canvas/inputs
// servem para os dois lados e para as 4 abas — não precisa duplicar id
// por id como precisaria se as telas coexistissem.
// ════════════════════════════════════════════════════════════════════

var _FC_LADOS = {
  receber: { abaAberto:'A Receber', abaFechado:'Receita', tituloQuem:'Cliente',    tituloRecorte:'Tipo',      icone:'📥', bannerAberto:'💼', corAberta:'var(--blue-d)',  corFechada:'var(--green-d)' },
  pagar:   { abaAberto:'A Pagar',   abaFechado:'Despesa',  tituloQuem:'Fornecedor',tituloRecorte:'Categoria', icone:'📤', bannerAberto:'💸', corAberta:'var(--red-d)',   corFechada:'var(--amber-d)' }
};

function _finCDados(){
  // Nunca é módulo de cliente -- nem chega a ser calculado pelo backend
  // para sessão nível 'cliente' (fora de MODULOS_CLIENTE), mas a trava
  // aqui também não custa nada.
  if(typeof _acCliente==='function' && _acCliente()) return [];
  return DB.financeiroContabilidade||[];
}
function _fcData(f){ var d=pDate(f.dataPagamento); return d||pDate(f.vencimento); }
function _fcPorPagamento(f){ return !!pDate(f.dataPagamento); }
function _fcQuem(f){ return (f.grupo||'—').trim()||'—'; }
function _fcRecorteVal(f){ return (f.tipo||f.categoria||'—').trim()||'—'; }
function _fcVal(f){ return Number(f.valor)||0; }
function _fcMesKey(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function _fcMesLbl(k){ var p=k.split('-'); return _FA_MES[+p[1]-1]+'/'+p[0].slice(2); }

// ── estado do Análise (independente do estado por-aba de cada tab) ──
var _FC = { lado:'receber', quem:[], preset:'ano', de:'', ate:'', recorte:'', grupo:'', ord:'data', asc:false };

function _fcJanela(){
  if(_FC.de || _FC.ate){
    var a=_FC.de?new Date(_FC.de+'T00:00:00'):new Date(1900,0,1);
    var b=_FC.ate?new Date(_FC.ate+'T00:00:00'):new Date(2999,11,31);
    return [a,b];
  }
  var h=new Date(); h.setHours(0,0,0,0);
  switch(_FC.preset){
    case 'mes':    return [new Date(h.getFullYear(),h.getMonth(),1), new Date(h.getFullYear(),h.getMonth()+1,0)];
    case 'mesant': return [new Date(h.getFullYear(),h.getMonth()-1,1), new Date(h.getFullYear(),h.getMonth(),0)];
    case 'ano':    return [new Date(h.getFullYear(),0,1), new Date(h.getFullYear(),11,31)];
    case 'anoant': return [new Date(h.getFullYear()-1,0,1), new Date(h.getFullYear()-1,11,31)];
    case '12m':    return [new Date(h.getFullYear(),h.getMonth()-11,1), new Date(h.getFullYear(),h.getMonth()+1,0)];
    default:       return null;
  }
}
function _fcFiltrar(abas){
  var jan=_fcJanela();
  return _finCDados().filter(function(f){
    if(abas.indexOf(f.aba)<0) return false;
    if(_FC.quem.length && _FC.quem.indexOf(_fcQuem(f))<0) return false;
    if(_FC.recorte && _fcRecorteVal(f)!==_FC.recorte) return false;
    if(_FC.grupo && f.grupo!==_FC.grupo) return false;
    if(jan){ var d=_fcData(f); if(!d||d<jan[0]||d>jan[1]) return false; }
    return true;
  });
}
var _fcSoma=function(a){ return a.reduce(function(s,f){ return s+_fcVal(f); },0); };

// ── controles do Análise ──
function fcSetLado(lado,btn){
  _FC.lado=lado; _FC.quem=[]; _FC.recorte=''; _FC.grupo='';
  document.querySelectorAll('#fcLadoBar .fin-tab').forEach(function(b){b.classList.remove('active');});
  if(btn) btn.classList.add('active');
  _fcAnalise();
}
function fcQuem(nome){
  var i=_FC.quem.indexOf(nome);
  if(i<0)_FC.quem.push(nome); else _FC.quem.splice(i,1);
  _fcAtualizar();
}
function fcQuemTodos(){ _FC.quem=[]; _fcAtualizar(); }
function fcPreset(p){
  _FC.preset=p; _FC.de=''; _FC.ate='';
  var m=$('fcMesIn'); if(m) m.value='';
  _fcAtualizar();
}
var _FC_ULTIMO_DIA=[31,28,31,30,31,30,31,31,30,31,30,31];
function _fcFimDoMes(ano,mes){
  if(mes===2 && ((ano%4===0 && ano%100!==0) || ano%400===0)) return 29;
  return _FC_ULTIMO_DIA[mes-1];
}
function _fcParse(txt){
  var m=String(txt||'').trim().match(/^(\d{1,2})\D(\d{1,2})\D(\d{4})$/);
  if(!m) return '';
  var d=+m[1], mes=+m[2], ano=+m[3];
  if(mes<1||mes>12||d<1||ano<1900||ano>2999) return '';
  var lim=_fcFimDoMes(ano,mes);
  if(d>lim) d=lim;
  return ano+'-'+String(mes).padStart(2,'0')+'-'+String(d).padStart(2,'0');
}
function _fcParaBR(iso){
  var m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m? m[3]+'/'+m[2]+'/'+m[1] : '';
}
function fcMascara(el){
  var v=el.value.replace(/\D/g,'').slice(0,8), out=v;
  if(v.length>4) out=v.slice(0,2)+'/'+v.slice(2,4)+'/'+v.slice(4);
  else if(v.length>2) out=v.slice(0,2)+'/'+v.slice(2);
  el.value=out;
  var msg=$('fcMsg'); if(msg) msg.textContent='';
}
function fcCalendario(qual){
  var oculto=$('fcCal'+qual);
  if(!oculto) return;
  oculto.value=_fcParse($('fc'+qual).value)||'';
  if(oculto.showPicker){ try{ oculto.showPicker(); return; }catch(e){} }
  oculto.click();
}
function fcCalendarioEscolheu(qual){
  var oculto=$('fcCal'+qual), campo=$('fc'+qual);
  if(!oculto||!campo) return;
  campo.value=_fcParaBR(oculto.value);
  var msg=$('fcMsg'); if(msg) msg.textContent='';
  campo.focus();
}
function fcMascaraMes(el){
  var v=el.value.replace(/\D/g,'').slice(0,6);
  el.value = v.length>2 ? v.slice(0,2)+'/'+v.slice(2) : v;
  var msg=$('fcMsg'); if(msg) msg.textContent='';
}
function _fcMesAtual(){
  if(!_FC.de||!_FC.ate) return '';
  var a=_FC.de.match(/^(\d{4})-(\d{2})-01$/); if(!a) return '';
  var fim=_fcFimDoMes(+a[1],+a[2]);
  if(_FC.ate!==a[1]+'-'+a[2]+'-'+String(fim).padStart(2,'0')) return '';
  return a[2]+'/'+a[1];
}
function _fcAplicarMes(){
  var el=$('fcMesIn'), msg=$('fcMsg');
  var t=el?el.value.trim():'';
  if(!t) return false;
  var m=t.match(/^(\d{1,2})\D(\d{4})$/);
  if(!m || +m[1]<1 || +m[1]>12){
    if(msg) msg.textContent='Informe o mês como mm/aaaa — ex.: 05/2026.';
    return 'erro';
  }
  var mes=+m[1], ano=+m[2];
  if(ano<1900||ano>2999){ if(msg) msg.textContent='Ano fora do intervalo.'; return 'erro'; }
  var mm=String(mes).padStart(2,'0');
  _FC.de = ano+'-'+mm+'-01';
  _FC.ate= ano+'-'+mm+'-'+String(_fcFimDoMes(ano,mes)).padStart(2,'0');
  _FC.preset='';
  if(msg) msg.textContent='';
  if($('fcDe'))$('fcDe').value=''; if($('fcAte'))$('fcAte').value='';
  return true;
}
function fcAplicarIntervalo(){
  var eDe=$('fcDe'), eAte=$('fcAte'), msg=$('fcMsg');
  var tDe=eDe?eDe.value.trim():'', tAte=eAte?eAte.value.trim():'';
  var aviso=function(t){ if(msg) msg.textContent=t||''; };
  var r=_fcAplicarMes();
  if(r==='erro') return;
  if(r===true){ _fcAtualizar(); return; }
  if(!tDe && !tAte){
    if(!_FC.de && !_FC.ate){ aviso(''); return; }
    _FC.de=''; _FC.ate=''; _FC.preset='ano'; aviso(''); _fcAtualizar(); return;
  }
  var de=_fcParse(tDe), ate=_fcParse(tAte);
  if(!de || !ate){ aviso('Preencha as duas datas, no formato dd/mm/aaaa.'); return; }
  if(de>ate){ var t=de; de=ate; ate=t; }
  eDe.value=_fcParaBR(de); eAte.value=_fcParaBR(ate);
  var corrigiu = (_fcParaBR(de)!==tDe) || (_fcParaBR(ate)!==tAte);
  aviso(corrigiu?'Data ajustada para o último dia do mês.':'');
  if(de===_FC.de && ate===_FC.ate) return;
  _FC.de=de; _FC.ate=ate; _FC.preset='';
  _fcAtualizar();
}
function fcLimparIntervalo(){
  if($('fcDe'))$('fcDe').value=''; if($('fcAte'))$('fcAte').value='';
  if($('fcMesIn'))$('fcMesIn').value='';
  var msg=$('fcMsg'); if(msg) msg.textContent='';
  if(_FC.de||_FC.ate){ _FC.de=''; _FC.ate=''; _FC.preset='ano'; }
  _fcAtualizar();
}
function fcCampo(k,v){ _FC[k]=v; _fcAtualizar(); }
function fcOrd(col){
  if(_FC.ord===col)_FC.asc=!_FC.asc; else {_FC.ord=col;_FC.asc=false;}
  _fcPintarLanc();
}
function fcCSV(){
  var rows=_fcDetalhe();
  var L=_FC_LADOS[_FC.lado];
  var head=['Data','Base da data','Situação','Origem',L.tituloQuem,'Grupo',L.tituloRecorte,'Referência','Valor'];
  var linhas=rows.map(function(f){
    var d=_fcData(f);
    return [d?d.toLocaleDateString('pt-BR'):'', _fcPorPagamento(f)?'pagamento':'vencimento',
      _fcSitTxt(f),f.aba,_fcQuem(f),f.grupo||'',_fcRecorteVal(f),(f.referencia||'').replace(/;/g,','),
      String(_fcVal(f)).replace('.',',')];
  });
  v16ExportCSV(linhas, head, 'financeiro-contabilidade-analise.csv');
}
function _fcDetalhe(){
  var L=_FC_LADOS[_FC.lado];
  var r=_fcFiltrar([L.abaFechado,L.abaAberto]);
  var k=_FC.ord, sinal=_FC.asc?1:-1;
  return r.slice().sort(function(a,b){
    if(k==='valor') return sinal*(_fcVal(a)-_fcVal(b));
    if(k==='quem')  return sinal*_fcQuem(a).localeCompare(_fcQuem(b));
    if(k==='grupo') return sinal*String(a.grupo||'').localeCompare(String(b.grupo||''));
    var da=_fcData(a),db=_fcData(b);
    return sinal*((da?da.getTime():0)-(db?db.getTime():0));
  });
}

function _fcAnalise(){
  var el=$('finCContent'); if(!el) return;
  var sig=_fcAssinatura();
  if(!document.getElementById('fcBar') || el.getAttribute('data-fc-sig')!==sig){
    el.innerHTML=_fcEsqueleto();
    el.setAttribute('data-fc-sig',sig);
  }
  _fcSyncBar();
  _fcPintarCorpo();
  _fcPintarLanc();
}
function _fcAssinatura(){
  var L=_FC_LADOS[_FC.lado];
  var d=_finCDados().filter(function(f){ return f.aba===L.abaAberto||f.aba===L.abaFechado; });
  var u=function(f){ return [...new Set(d.map(f).filter(Boolean))].sort().join('|'); };
  return _FC.lado+'§'+u(_fcQuem)+'§'+u(_fcRecorteVal);
}
function _fcPessoas(){
  var L=_FC_LADOS[_FC.lado];
  var d=_finCDados().filter(function(f){ return f.aba===L.abaAberto||f.aba===L.abaFechado; });
  return [...new Set(d.map(_fcQuem).filter(function(x){return x&&x!=='—';}))].sort();
}
var _FC_PRESETS=[['mes','Este mês'],['mesant','Mês passado'],['ano','Este ano'],
                 ['anoant','Ano passado'],['12m','12 meses'],['todos','Tudo']];

function _fcEsqueleto(){
  var L=_FC_LADOS[_FC.lado];
  var pessoas=_fcPessoas();
  var LadoAberto=_finCDados().filter(function(f){return f.aba===L.abaAberto||f.aba===L.abaFechado;});
  var recortes=[...new Set(LadoAberto.map(_fcRecorteVal).filter(function(x){return x&&x!=='—';}))].sort();
  return ''
  + '<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;align-items:center" id="fcLadoBar">'
  +   '<button class="fin-tab '+(_FC.lado==='receber'?'active':'')+'" onclick="fcSetLado(\'receber\',this)">📥 Recebimentos</button>'
  +   '<button class="fin-tab '+(_FC.lado==='pagar'?'active':'')+'" onclick="fcSetLado(\'pagar\',this)">📤 Pagamentos</button>'
  + '</div>'
  + '<div class="cc" id="fcBar" style="margin-bottom:14px">'
  + '<div class="fa-lin"><span class="fa-lbl">'+esc(L.tituloQuem)+'</span>'
  +   '<button class="fa-chip" id="fcQuemTodos" onclick="fcQuemTodos()">Todos</button>'
  +   pessoas.map(function(p){
        return '<button class="fa-chip fa-chip-p" data-quem="'+esc(p)+'" onclick="fcQuem(\''+esc(p).replace(/'/g,"\\'")+'\')">'+esc(p)+'</button>';
      }).join('')
  +   '<span class="fa-dica">clique em mais de um para somar</span>'
  + '</div>'
  + '<div class="fa-lin"><span class="fa-lbl">Período</span>'
  +   _FC_PRESETS.map(function(p){
        return '<button class="fa-chip" data-preset="'+p[0]+'" onclick="fcPreset(\''+p[0]+'\')">'+p[1]+'</button>';
      }).join('')
  +   '<span class="fa-sep"></span>'
  +   '<span class="fa-dtwrap"><input type="text" class="fsel fa-mes" id="fcMesIn" placeholder="mm/aaaa"'
  +     ' maxlength="7" inputmode="numeric" autocomplete="off"'
  +     ' oninput="fcMascaraMes(this)" onkeydown="if(event.key===\'Enter\')fcAplicarIntervalo()"'
  +     ' title="Mês inteiro — digite mm/aaaa e clique em Aplicar"></span>'
  +   '<span class="fa-sep"></span>'
  +   '<span class="fa-dtwrap"><input type="text" class="fsel fa-dt" id="fcDe" placeholder="dd/mm/aaaa"'
  +     ' maxlength="10" inputmode="numeric" autocomplete="off"'
  +     ' oninput="fcMascara(this)" onkeydown="if(event.key===\'Enter\')fcAplicarIntervalo()">'
  +     '<button class="fa-cal" onclick="fcCalendario(\'De\')" title="Abrir calendário">📅</button>'
  +     '<input type="date" id="fcCalDe" class="fa-oculto" onchange="fcCalendarioEscolheu(\'De\')"></span>'
  +   '<span class="fa-ate">até</span>'
  +   '<span class="fa-dtwrap"><input type="text" class="fsel fa-dt" id="fcAte" placeholder="dd/mm/aaaa"'
  +     ' maxlength="10" inputmode="numeric" autocomplete="off"'
  +     ' oninput="fcMascara(this)" onkeydown="if(event.key===\'Enter\')fcAplicarIntervalo()">'
  +     '<button class="fa-cal" onclick="fcCalendario(\'Ate\')" title="Abrir calendário">📅</button>'
  +     '<input type="date" id="fcCalAte" class="fa-oculto" onchange="fcCalendarioEscolheu(\'Ate\')"></span>'
  +   '<button class="fa-chip fa-aplicar" onclick="fcAplicarIntervalo()" title="Aplica o mês (mm/aaaa) ou o intervalo de datas">Aplicar</button>'
  +   '<span class="fa-ativo" id="fcSelInfo" style="display:none"></span>'
  +   '<button class="fa-chip" id="fcLimparInt" onclick="fcLimparIntervalo()" style="display:none" title="Tirar o período">✕</button>'
  +   '<span class="fa-msg" id="fcMsg"></span>'
  + '</div>'
  + '<div class="fa-lin"><span class="fa-lbl">Recorte</span>'
  +   '<select class="fsel" id="fcRecorteSel" onchange="fcCampo(\'recorte\',this.value)"><option value="">Todos ('+esc(L.tituloRecorte.toLowerCase())+')</option>'
  +     recortes.map(function(t){return '<option value="'+esc(t)+'">'+esc(t)+'</option>';}).join('')+'</select>'
  +   '<span class="fa-sep"></span>'
  +   '<button class="fa-chip" onclick="fcCSV()">⤓ CSV</button>'
  + '</div>'
  + '<div class="fa-resumo" id="fcResumo"></div>'
  + '</div>'
  + '<div id="fcCorpo"></div>'
  + '<div class="cc"><div class="cc-hd" style="align-items:center"><div><div class="cc-t">Lançamentos</div>'
  +   '<div class="cc-d">os filtros do topo já valem para esta lista · clique no cabeçalho para ordenar</div></div>'
  +   '<span class="fa-dica" id="fcLqCount"></span></div>'
  +   '<div id="fcLancTbl"></div></div>';
}
function _fcSyncBar(){
  var q=document.getElementById('fcQuemTodos');
  if(q) q.classList.toggle('on', _FC.quem.length===0);
  document.querySelectorAll('#fcBar [data-quem]').forEach(function(b){
    var p=b.getAttribute('data-quem'), on=_FC.quem.indexOf(p)>=0, c=_faCor(p);
    b.classList.toggle('on',on);
    b.style.cssText = on
      ? 'background:'+c.marca+';border-color:'+c.marca+';color:#fff'
      : 'background:'+c.fundo+';border-color:'+c.marca+'55;color:'+c.texto;
  });
  var semIntervalo = !_FC.de && !_FC.ate;
  document.querySelectorAll('#fcBar [data-preset]').forEach(function(b){
    b.classList.toggle('on', semIntervalo && _FC.preset===b.getAttribute('data-preset'));
  });
  var de=$('fcDe'), ate=$('fcAte'), mes=$('fcMesIn');
  if(de && document.activeElement!==de)  de.value=_fcParaBR(_FC.de);
  if(ate&& document.activeElement!==ate) ate.value=_fcParaBR(_FC.ate);
  if(mes&& document.activeElement!==mes) mes.value=_fcMesAtual();
  var lx=$('fcLimparInt'); if(lx) lx.style.display=(_FC.de||_FC.ate)?'':'none';
  var info=$('fcSelInfo');
  if(info){
    if(_FC.de||_FC.ate){
      var mm=_fcMesAtual();
      info.innerHTML = mm
        ? '🗓 Mês <strong>'+esc(mm)+'</strong>'
        : '🗓 <strong>'+esc(_fcParaBR(_FC.de)||'início')+'</strong> → <strong>'+esc(_fcParaBR(_FC.ate)||'hoje')+'</strong>';
      info.style.display='';
    } else info.style.display='none';
  }
  [['fcMesIn',!!_fcMesAtual()],['fcDe',!!_FC.de&&!_fcMesAtual()],['fcAte',!!_FC.ate&&!_fcMesAtual()]]
    .forEach(function(par){ var e=$(par[0]); if(e) e.classList.toggle('fa-preenchido',par[1]); });
  var rs=$('fcRecorteSel'); if(rs) rs.value=_FC.recorte||'';
  var jan=_fcJanela();
  var res=$('fcResumo');
  if(res) res.innerHTML='Mostrando <strong>'+esc(_FC.quem.length?_FC.quem.join(' + '):'todos')+'</strong> · <strong>'
    + esc(jan? jan[0].toLocaleDateString('pt-BR')+' a '+jan[1].toLocaleDateString('pt-BR') : 'todo o histórico')+'</strong>'
    + ' · data considerada: <strong>pagamento</strong>, ou vencimento quando não houver pagamento';
}
function _fcAtualizar(){ _fcSyncBar(); _fcPintarCorpo(); _fcPintarLanc(); }

function _fcPintarCorpo(){
  var el=$('fcCorpo'); if(!el) return;
  var L=_FC_LADOS[_FC.lado];
  var hoje=new Date(); hoje.setHours(0,0,0,0);
  var fechado = _fcFiltrar([L.abaFechado]);
  var aberto  = _fcFiltrar([L.abaAberto]);
  var vFech=_fcSoma(fechado), vAb=_fcSoma(aberto);
  var vencidos=aberto.filter(function(f){ var d=_fcData(f); return d&&d<hoje; });
  var vVenc=_fcSoma(vencidos);
  var ticket=fechado.length? vFech/fechado.length : 0;

  el.innerHTML =
    '<div class="kpi-grid" style="margin-bottom:14px">'
  +   kC(L.lado==='pagar'?'Pago':'Recebido',_faFT(vFech),fechado.length+' lançamento(s)','cg','dg')
  +   kC(L.tituloRecorte==='Categoria'?'A Pagar':'A receber',_faFT(vAb),aberto.length+' em aberto','cb','db')
  +   kC('Vencido',_faFT(vVenc),vencidos.length+' lançamento(s)','cr',vVenc>0?'dr':'')
  +   kC('Ticket médio',_faFT(ticket),'por lançamento','cv','dv')
  + '</div>'
  + '<div class="cc" style="margin-bottom:14px"><div class="cc-hd"><div><div class="cc-t">'+(L.lado==='pagar'?'Pago':'Recebido')+' mês a mês</div>'
  +   '<div class="cc-d">empilhado por '+esc(L.tituloQuem.toLowerCase())+' · passe o mouse na coluna para ver o total do mês</div></div></div>'
  +   '<div class="cb" style="height:280px"><canvas id="cFcMes"></canvas></div></div>'
  + '<div class="crow c2" style="margin-bottom:14px">'
  +   '<div class="cc"><div class="cc-hd"><div><div class="cc-t">Por '+esc(L.tituloRecorte.toLowerCase())+'</div>'
  +     '<div class="cc-d">recorte usado no filtro acima</div></div></div>'
  +     '<div class="cb" style="height:240px"><canvas id="cFcRecorte"></canvas></div></div>'
  +   '<div class="cc"><div class="cc-hd"><div><div class="cc-t">Maiores '+esc(L.tituloQuem.toLowerCase())+'s</div>'
  +     '<div class="cc-d">10 primeiros por valor</div></div></div>'
  +     '<div class="cb" style="height:240px"><canvas id="cFcQuem"></canvas></div></div>'
  + '</div>'
  + '<div class="cc" style="margin-bottom:14px"><div class="cc-hd"><div><div class="cc-t">Comparativo por '+esc(L.tituloQuem.toLowerCase())+'</div>'
  +   '<div class="cc-d">mesmo período e mesmos recortes acima</div></div></div>'
  +   _fcTabelaPessoas(_fcPessoas()) + '</div>';

  _fcGraficos(fechado);
}
function _fcPintarLanc(){
  var el=$('fcLancTbl'); if(!el) return;
  var rows=_fcDetalhe();
  var c=$('fcLqCount');
  if(c) c.textContent=rows.length+' lançamento(s)';
  el.innerHTML=_fcTabelaDetalhe(rows);
}
function _fcSitTxt(f){
  var t=String(f.situacao||'').trim();
  if(t) return t;
  var L=_FC_LADOS[_FC.lado];
  if(f.aba===L.abaFechado || String(f.pagamento||'').toUpperCase()==='SIM') return 'Pago';
  var d=pDate(f.vencimento), h=new Date(); h.setHours(0,0,0,0);
  if(d && d<h) return 'Vencida';
  return 'OK';
}
function _fcSitTag(f){
  var t=_fcSitTxt(f), l=t.toLowerCase(), cls='tn';
  if(l.indexOf('pag')===0||l==='quitado'||l==='recebido'||l==='quitada') cls='tg';
  else if(l.indexOf('venc')>=0||l.indexOf('atras')>=0) cls='tr';
  else if(l==='ok'||l.indexOf('em dia')>=0) cls='tb2';
  else if(l.indexOf('guia')>=0||l.indexOf('aberto')>=0||l.indexOf('parcial')>=0) cls='ta';
  return '<span class="tag '+cls+'">'+esc(t.toUpperCase())+'</span>';
}
function _fcTabelaPessoas(pessoas){
  var L=_FC_LADOS[_FC.lado];
  var linhas=pessoas.map(function(p){
    var salvo=_FC.quem; _FC.quem=[p];
    var fech=_fcFiltrar([L.abaFechado]), ab=_fcFiltrar([L.abaAberto]);
    _FC.quem=salvo;
    return {p:p, fech:_fcSoma(fech), n:fech.length, ab:_fcSoma(ab),
            tk:fech.length?_fcSoma(fech)/fech.length:0};
  });
  var tot=linhas.reduce(function(s,l){return s+l.fech;},0)||1;
  linhas.sort(function(a,b){return b.fech-a.fech;});
  return '<div class="tw"><table><thead><tr>'
   +'<th>'+esc(L.tituloQuem)+'</th><th style="text-align:right">'+(L.lado==='pagar'?'Pago':'Recebido')+'</th><th style="text-align:right">%</th>'
   +'<th style="text-align:right">Lanç.</th><th style="text-align:right">Ticket médio</th>'
   +'<th style="text-align:right">'+(L.lado==='pagar'?'A pagar':'A receber')+'</th>'
   +'</tr></thead><tbody>'
   + (linhas.length? linhas.map(function(l){
       var c=_faCor(l.p);
       return '<tr style="background:'+c.fundo+'55"><td>'+_faSelo(l.p)+'</td>'
        +'<td class="mono" style="text-align:right;color:var(--green-d);font-weight:600">'+_faFT(l.fech)+'</td>'
        +'<td class="mono" style="text-align:right">'+(l.fech/tot*100).toFixed(1)+'%</td>'
        +'<td class="mono" style="text-align:right">'+l.n+'</td>'
        +'<td class="mono" style="text-align:right">'+_faFT(l.tk)+'</td>'
        +'<td class="mono" style="text-align:right">'+(l.ab?_faFT(l.ab):'—')+'</td>'
        +'</tr>';
     }).join('') : '<tr><td colspan="6" class="vazio">Nada no período.</td></tr>')
   + '</tbody></table></div>';
}
function _fcTabelaDetalhe(rows){
  var L=_FC_LADOS[_FC.lado];
  var seta=function(c){ return _FC.ord===c?(_FC.asc?' ↑':' ↓'):''; };
  var corAba={};corAba[L.abaFechado]='var(--green-d)';corAba[L.abaAberto]='var(--blue-d)';
  return '<div class="tw scr"><table><thead><tr>'
   +'<th class="s" onclick="fcOrd(\'data\')">Data'+seta('data')+'</th>'
   +'<th>Situação</th><th>Origem</th>'
   +'<th class="s" onclick="fcOrd(\'quem\')">'+esc(L.tituloQuem)+seta('quem')+'</th>'
   +'<th>'+esc(L.tituloRecorte)+'</th><th>Referência</th>'
   +'<th class="s" style="text-align:right" onclick="fcOrd(\'valor\')">Valor'+seta('valor')+'</th>'
   +'</tr></thead><tbody>'
   + (rows.length? rows.slice(0,400).map(function(f){
       var d=_fcData(f), pg=_fcPorPagamento(f);
       return '<tr><td class="mono" title="'+(pg?'data de pagamento':'data de vencimento')+'">'
        +(d?d.toLocaleDateString('pt-BR'):'—')+(pg?'':' <span style="color:var(--text4)">·v</span>')+'</td>'
        +'<td>'+_fcSitTag(f)+'</td>'
        +'<td style="color:'+(corAba[f.aba]||'var(--text3)')+';font-weight:600;font-size:11.5px">'+esc(f.aba)+'</td>'
        +'<td>'+_faSelo(_fcQuem(f))+'</td>'
        +'<td>'+esc(_fcRecorteVal(f))+'</td>'
        +'<td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(f.referencia||'')+'">'+esc(f.referencia||'—')+'</td>'
        +'<td class="mono" style="text-align:right;font-weight:600">'+_faFT(_fcVal(f))+'</td></tr>';
     }).join('') : '<tr><td colspan="7" class="vazio">Nenhum lançamento com esses recortes.</td></tr>')
   + '</tbody></table></div>'
   + (rows.length>400?'<div style="font-size:11px;color:var(--text3);padding:8px 2px">mostrando 400 de '+rows.length+' — use o CSV para a lista inteira</div>':'');
}
function _fcGraficos(fechado){
  if(typeof Chart==='undefined')return;
  var L=_FC_LADOS[_FC.lado];
  var pessoas=[...new Set(fechado.map(_fcQuem))].sort();
  var SEM_ANIM={duration:0};

  var meses=[...new Set(fechado.map(function(f){var d=_fcData(f);return d?_fcMesKey(d):null;}).filter(Boolean))].sort();
  if($('cFcMes')){
    var ds=pessoas.map(function(p){
      return { label:p, backgroundColor:_faCorBarra(p), borderColor:'#ffffff',
        borderWidth:1.5, borderRadius:5, borderSkipped:false,
        hoverBackgroundColor:_faCor(p).marca,
        data:meses.map(function(m){
          return fechado.filter(function(f){var d=_fcData(f);return d&&_fcMesKey(d)===m&&_fcQuem(f)===p;})
                        .reduce(function(s,f){return s+_fcVal(f);},0);
        })};
    });
    var totMes=meses.map(function(m){
      return fechado.filter(function(f){var d=_fcData(f);return d&&_fcMesKey(d)===m;})
                    .reduce(function(s,f){return s+_fcVal(f);},0);
    });
    mCh('cFcMes',{type:'bar',data:{labels:meses.map(_fcMesLbl),datasets:ds},
      options:{responsive:true,maintainAspectRatio:false,animation:SEM_ANIM,
        interaction:{mode:'index',intersect:false},
        plugins:{legend:{display:pessoas.length>1,position:'bottom',
          labels:{color:'#4B5563',font:{size:10.5},boxWidth:11,usePointStyle:true,pointStyle:'circle',padding:10}},
          tooltip:{mode:'index',intersect:false,
            callbacks:{
              label:function(c){ return c.raw? ' '+c.dataset.label+': '+fF(c.raw) : null; },
              footer:function(items){
                if(!items||!items.length) return '';
                return 'Total do mês: '+fF(totMes[items[0].dataIndex]||0);
              }}}},
        scales:{x:{stacked:true,ticks:{color:'#9CA3AF',font:{size:10}},grid:{display:false}},
                y:{stacked:true,ticks:{color:'#9CA3AF',font:{size:10},callback:function(v){return fS(v);}},
                   grid:{color:'rgba(0,0,0,.04)'}}}}});
  }
  if($('cFcRecorte')){
    var tp=[...new Set(fechado.map(function(f){return _fcRecorteVal(f);}))];
    var tv=tp.map(function(t){return fechado.filter(function(f){return _fcRecorteVal(f)===t;}).reduce(function(s,f){return s+_fcVal(f);},0);});
    var it=tv.map(function(_,i){return i;}).sort(function(a,b){return tv[b]-tv[a];}).slice(0,10);
    var cfgT=bCfg(it.map(function(i){return tp[i];}),it.map(function(i){return tv[i];}),null);
    cfgT.options.animation=SEM_ANIM;
    mCh('cFcRecorte',cfgT);
  }
  if($('cFcQuem')){
    var gp=[...new Set(fechado.map(function(f){return f.grupo||'—';}))];
    var gv=gp.map(function(g){return fechado.filter(function(f){return (f.grupo||'—')===g;}).reduce(function(s,f){return s+_fcVal(f);},0);});
    var ig=gv.map(function(_,i){return i;}).sort(function(a,b){return gv[b]-gv[a];}).slice(0,10);
    var cfgG=bCfg(ig.map(function(i){return gp[i];}),ig.map(function(i){return gv[i];}),null,true);
    cfgG.options.animation=SEM_ANIM;
    mCh('cFcQuem',cfgG);
  }
}

// ════════════════════════════════════════════════════════════════════
// ABA "ABERTA" (A Receber / A Pagar) — espelha a aba "A Receber" do
// Jurídico: barra de atalho por prazo, KPIs, filtro completo, tabela
// paginada/sortável, mini-análise visual.
// ════════════════════════════════════════════════════════════════════
var _fcAbaSort={col:'venc',asc:true}, _fcAbaPg=1;

function _renderFinCAbaAberta(ladoKey){
  var L=_FC_LADOS[ladoKey];
  var fin=_finCDados(), el=$('finCContent');
  _fcAbaSort={col:'venc',asc:true}; _fcAbaPg=1;
  var fGlobal=FILTROS.grupo||'';
  var ab=fin.filter(function(f){return f.aba===L.abaAberto && (!fGlobal||f.grupo===fGlobal);});
  var fech=fin.filter(function(f){return f.aba===L.abaFechado && (!fGlobal||f.grupo===fGlobal);});
  var pago=fech.reduce(function(s,f){return s+(Number(f.valor)||0);},0);
  var vencNP=ab.filter(function(f){return f.pagamento!=='SIM'&&f.situacao==='Vencido';}).reduce(function(s,f){return s+(Number(f.valor)||0);},0);
  var okAP=ab.filter(function(f){return f.pagamento!=='SIM'&&f.situacao!=='Vencido';}).reduce(function(s,f){return s+(Number(f.valor)||0);},0);

  var grupos=[...new Set(ab.map(function(f){return f.grupo;}).filter(Boolean))].sort();
  var recortes=[...new Set(ab.map(function(f){return _fcRecorteVal(f);}).filter(function(x){return x&&x!=='—';}))].sort();

  var qtdVenc=ab.filter(function(f){return f.pagamento!=='SIM'&&f.situacao==='Vencido';}).length;
  var alFin=$('alertFinC');
  // (não há elemento fixo de alerta no banner desta tela — o aviso entra no próprio KPI "Vencido")

  var grpOpts=mkOpts(grupos,'Todos ('+L.tituloQuem.toLowerCase()+')');
  var recOpts=mkOpts(recortes,'Todos ('+L.tituloRecorte.toLowerCase()+')');
  var sitOpts='<option value="">Todas situações</option><option value="adimplente">Adimplente</option><option value="inadimplente">Inadimplente</option><option value="pago">Pago</option>';

  var h='';
  h+='<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px" id="fcAbaPeriodBar">';
  h+='<button class="fin-tab '+(window._fcAbaPeriod==='todos'?'active':'')+'" onclick="setFinCAbaPeriod(\'todos\',this)" style="font-size:12px;padding:6px 14px">Todos</button>';
  h+='<button class="fin-tab fin-tab-vencidos '+(window._fcAbaPeriod==='vencidos'?'active':'')+'" onclick="setFinCAbaPeriod(\'vencidos\',this)" style="font-size:12px;padding:6px 14px">⚠ Vencidos</button>';
  h+='<button class="fin-tab '+(window._fcAbaPeriod==='7'?'active':'')+'" onclick="setFinCAbaPeriod(\'7\',this)" style="font-size:12px;padding:6px 14px">🔴 7 dias</button>';
  h+='<button class="fin-tab '+(window._fcAbaPeriod==='15'?'active':'')+'" onclick="setFinCAbaPeriod(\'15\',this)" style="font-size:12px;padding:6px 14px">🟠 15 dias</button>';
  h+='<button class="fin-tab '+(window._fcAbaPeriod==='30'?'active':'')+'" onclick="setFinCAbaPeriod(\'30\',this)" style="font-size:12px;padding:6px 14px">🟡 30 dias</button>';
  h+='<button class="fin-tab '+(window._fcAbaPeriod==='60'?'active':'')+'" onclick="setFinCAbaPeriod(\'60\',this)" style="font-size:12px;padding:6px 14px">🔵 60 dias</button>';
  h+='<select class="fsel" id="fcAbaMesAno" onchange="renderFinCAbaTbl()" style="min-width:140px;font-size:12px" title="Filtrar por mês/ano exato"><option value="">— Mês/Ano —</option></select>';
  h+='</div>';
  h+='<div class="ex-bn" style="margin-bottom:16px;position:relative;background:none;border:1.5px solid var(--border);box-shadow:var(--shadow-md);padding:22px 26px">';
  h+='<div style="font-family:var(--font-d);font-size:14px;font-weight:700;color:var(--ac-gold);margin-bottom:12px;letter-spacing:.01em">'+L.bannerAberto+' '+esc(L.abaAberto)+' — Visão Geral</div>';
  h+='<div class="kpi-grid">';
  h+=kC('Total '+esc(L.abaAberto),fS(okAP+vencNP),fF(okAP+vencNP),'cr','dr');
  h+=kC('Vencido',fS(vencNP),fF(vencNP),'cr','dr');
  h+=kC('Em dia',fS(okAP),fF(okAP),'ca','');
  h+=kC('Já '+(ladoKey==='pagar'?'pago':'recebido'),fS(pago),fF(pago),'cg','dg');
  h+='</div></div>';

  h+='<div class="cc">';
  h+='<div class="cc-hd" style="flex-wrap:wrap;gap:8px">';
  h+='<div><div class="cc-t">Lançamentos — '+esc(L.abaAberto)+' <span style="font-size:10.5px;color:var(--text3);font-weight:400" id="fcAbaCnt"></span></div></div>';
  h+='<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">';
  h+='<select class="fsel" id="fFcAbaGrupo" onchange="renderFinCAbaTbl()">'+grpOpts+'</select>';
  h+='<select class="fsel" id="fFcAbaRecorte" onchange="renderFinCAbaTbl()">'+recOpts+'</select>';
  h+='<select class="fsel" id="fFcAbaSit"   onchange="renderFinCAbaTbl()">'+sitOpts+'</select>';
  h+='<input type="date" class="fsel" id="fFcAbaDe"  onchange="renderFinCAbaTbl()" style="max-width:130px" title="De (vencimento)">';
  h+='<input type="date" class="fsel" id="fFcAbaAte" onchange="renderFinCAbaTbl()" style="max-width:130px" title="Até (vencimento)">';
  h+='<input type="text" class="fsel" id="fFcAbaRef" oninput="renderFinCAbaTbl()" style="max-width:130px" placeholder="Referência...">';
  h+='</div></div>';
  h+='<div class="tw scr"><table style="width:100%;table-layout:fixed"><thead><tr>';
  h+='<th style="width:16%">'+esc(L.tituloQuem)+'</th><th style="width:12%">'+esc(L.tituloRecorte)+'</th><th style="width:21%">Referência</th>';
  h+='<th class="s" style="width:11%" onclick="sortFinCAba(\'venc\')">Vencimento</th>';
  h+='<th class="s" style="width:12%" onclick="sortFinCAba(\'val\')">Valor</th>';
  h+='<th style="width:9%">Dias</th><th style="width:12%">Situação</th>';
  h+='</tr></thead><tbody id="tblFcAbaBody"></tbody>';
  h+='<tfoot><tr id="tblFcAbaFoot"></tr></tfoot></table></div>';
  h+='<div class="pgn" id="pagFcAba"></div></div>';

  h+='<div class="cc">';
  h+='<div class="cc-hd" style="flex-wrap:wrap;gap:8px">';
  h+='<div><div class="cc-t">Análise visual</div>';
  h+='<div class="cc-d">Filtro único · impacta todos os gráficos abaixo</div></div>';
  h+='<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">';
  h+='<select class="fsel" id="fFcAbaChRecorte" onchange="_finCAbaCharts(\''+ladoKey+'\')" style="max-width:150px">'+recOpts+'</select>';
  h+='<select class="fsel" id="fFcAbaChMesAno" onchange="_finCAbaCharts(\''+ladoKey+'\')" style="min-width:140px;font-size:12px" title="Filtrar gráficos por mês/ano"><option value="">— Mês/Ano —</option></select>';
  h+='</div></div>';
  h+='<div class="crow c2" style="margin-top:10px">';
  h+='<div class="cb" style="height:210px"><canvas id="cFinCGrupo"></canvas>';
  h+='<div style="text-align:center;font-size:10.5px;color:var(--text3);margin-top:3px">'+esc(L.abaAberto)+' por '+esc(L.tituloQuem.toLowerCase())+'</div></div>';
  h+='<div class="cb" style="height:210px"><canvas id="cFinCSit"></canvas>';
  h+='<div style="text-align:center;font-size:10.5px;color:var(--text3);margin-top:3px">Em dia × Vencido</div></div>';
  h+='</div>';
  h+='<div class="crow c2" style="margin-top:14px">';
  h+='<div class="cb" style="height:210px"><canvas id="cFinCRecorte"></canvas>';
  h+='<div style="text-align:center;font-size:10.5px;color:var(--text3);margin-top:3px">Por '+esc(L.tituloRecorte.toLowerCase())+'</div></div>';
  h+='<div class="cb" style="height:210px"><canvas id="cFinCMes"></canvas>';
  h+='<div style="text-align:center;font-size:10.5px;color:var(--text3);margin-top:3px">Vencimentos mensais</div></div>';
  h+='</div>';
  h+='</div>';

  el.innerHTML=h;
  el.setAttribute('data-fc-sig','aba:'+ladoKey);
  window._fcAbaLado=ladoKey;
  renderFinCAbaTbl();
  _finCAbaCharts(ladoKey);
}
function setFinCAbaPeriod(p,btn){
  window._fcAbaPeriod=p;
  document.querySelectorAll('#fcAbaPeriodBar .fin-tab').forEach(function(b){b.classList.remove('active');});
  if(btn)btn.classList.add('active');
  renderFinCAbaTbl();
  _finCAbaCharts(window._fcAbaLado);
}
function sortFinCAba(col){
  if(_fcAbaSort.col===col)_fcAbaSort.asc=!_fcAbaSort.asc; else _fcAbaSort={col:col,asc:true};
  _fcAbaPg=1; renderFinCAbaTbl();
}
function renderFinCAbaTbl(){
  var L=_FC_LADOS[window._fcAbaLado||'receber'];
  if(!_finCDados()||!_finCDados().length)return;
  var fG=document.getElementById('fFcAbaGrupo')?.value||'';
  var fR=document.getElementById('fFcAbaRecorte')?.value||'';
  var fSt=document.getElementById('fFcAbaSit')?.value||'';
  var fDe=document.getElementById('fFcAbaDe')?.value||'';
  var fAte=document.getElementById('fFcAbaAte')?.value||'';
  var fRef=(document.getElementById('fFcAbaRef')?.value||'').toLowerCase();
  var fMesAno=document.getElementById('fcAbaMesAno')?.value||'';
  var fGlobal=FILTROS.grupo||'';
  var rows=_finCDados().filter(function(f){
    if(f.aba!==L.abaAberto)return false;
    if(fGlobal&&f.grupo!==fGlobal)return false;
    if(fMesAno){/* período pontual manda mais que o atalho de prazo */}
    else if(window._fcAbaPeriod&&window._fcAbaPeriod!=='todos'){
      var vd=pDate(f.vencimento);var hoje2=new Date();hoje2.setHours(0,0,0,0);
      if(window._fcAbaPeriod==='vencidos'){if(!vd||vd>=hoje2||f.pagamento==='SIM')return false;}
      else{var lim2=new Date(hoje2);lim2.setDate(lim2.getDate()+Number(window._fcAbaPeriod));
        if(!vd||vd<hoje2||vd>lim2)return false;}
    }
    if(fG&&f.grupo!==fG)return false;
    if(fR&&_fcRecorteVal(f)!==fR)return false;
    if(fRef&&!String(f.referencia||'').toLowerCase().includes(fRef)&&!String(f.obs||'').toLowerCase().includes(fRef))return false;
    if(fMesAno){var _d=pDate(f.vencimento);if(!_d)return false;var _my=_d.getFullYear()+'-'+String(_d.getMonth()+1).padStart(2,'0');if(_my!==fMesAno)return false;}
    if(fSt==='adimplente'&&!(f.pagamento!=='SIM'&&f.situacao!=='Vencido'))return false;
    if(fSt==='inadimplente'&&!(f.pagamento!=='SIM'&&f.situacao==='Vencido'))return false;
    if(fSt==='pago'&&f.pagamento!=='SIM')return false;
    if(fDe||fAte){var d=pDate(f.vencimento);
      if(fDe&&(!d||d<new Date(fDe)))return false;
      if(fAte&&(!d||d>new Date(fAte+'T23:59:59')))return false;}
    return true;
  });
  _updateFinCAbaKpis(rows,L);
  rows=rows.sort(function(a,b){var v=_fcAbaSort.asc?1:-1;
    if(_fcAbaSort.col==='venc'){var da=pDate(a.vencimento)||new Date(0),db=pDate(b.vencimento)||new Date(0);return v*(da-db);}
    if(_fcAbaSort.col==='val')return v*((Number(a.valor)||0)-(Number(b.valor)||0));
    return 0;
  });
  _finCPopMesAno(document.getElementById('fcAbaMesAno'), _finCDados().filter(function(f){return f.aba===L.abaAberto;}), 'vencimento', fMesAno);
  var cnt=document.getElementById('fcAbaCnt');
  if(cnt)cnt.textContent='· '+fI(rows.length)+' lançamento(s)';
  var tot=rows.reduce(function(s,f){return s+(Number(f.valor)||0);},0);
  var foot=document.getElementById('tblFcAbaFoot');
  if(foot)foot.innerHTML='<td colspan="4">Total</td><td class="mono"><strong>'+fF(tot)+'</strong></td><td colspan="2"></td>';
  paginate('pagFcAba',rows.length,_fcAbaPg,function(p){_fcAbaPg=p;renderFinCAbaTbl();});
  var pg=rows.slice((_fcAbaPg-1)*PG,_fcAbaPg*PG);
  var sitCls=function(f){return f.pagamento==='SIM'?'tt':f.situacao==='Vencido'?'tr':'ta';};
  var sitLbl=function(f){return f.pagamento==='SIM'?'Pago':f.situacao==='Vencido'?'Inadimplente':'Em dia';};
  var body=document.getElementById('tblFcAbaBody');
  if(!body)return;
  body.innerHTML=pg.length?pg.map(function(f){
    var d=Number(f.diasRestantes)||0,dCl=d<0?'dr':d<=7?'da':'dg';
    return '<tr><td>'+_faSelo(f.grupo||'—')+'</td>'
      +'<td>'+esc(_fcRecorteVal(f))+'</td>'
      +'<td style="font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:0">'+esc(f.referencia||'—')+(f.obs?'<br><span style="font-size:10px;color:var(--text3)">'+esc(f.obs)+'</span>':'')+'</td>'
      +'<td class="mono">'+(f.vencimento||'—')+'</td>'
      +'<td class="mono"><strong>'+fF(f.valor||0)+'</strong></td>'
      +'<td class="mono" style="font-size:11px;font-weight:500;color:'+(d<0?'var(--red-d)':d<=7?'var(--amber)':'var(--text3)')+'">'+(f.pagamento==='SIM'?'—':d<0?Math.abs(d)+'d atraso':d+'d')+'</td>'
      +'<td><span class="tag '+sitCls(f)+' '+(sitCls(f)==='tr'?'tpls':'')+'">'+sitLbl(f)+'</span></td></tr>';
  }).join(''):'<tr><td colspan="7">'+emp()+'</td></tr>';
}
function _updateFinCAbaKpis(rows,L){
  var vnc=rows.filter(function(f){return f.pagamento!=='SIM'&&f.situacao==='Vencido';}).reduce(function(s,f){return s+(Number(f.valor)||0);},0);
  var ok =rows.filter(function(f){return f.pagamento!=='SIM'&&f.situacao!=='Vencido';}).reduce(function(s,f){return s+(Number(f.valor)||0);},0);
  var grid=document.querySelector('#finCContent .kpi-grid');
  if(!grid)return;
  grid.innerHTML=
    kC('Total '+L.abaAberto,fS(ok+vnc),esc(L.abaAberto.toLowerCase())+' em aberto','cr','dr')
   +kC('Vencido',fS(vnc),'vencido sem pagamento','cr','dr')
   +kC('Em dia',fS(ok),'dentro do prazo','ca','');
}
function _finCPopMesAno(sel, rows, dateField, curVal){
  if(!sel) return;
  var lb={'01':'Jan','02':'Fev','03':'Mar','04':'Abr','05':'Mai','06':'Jun','07':'Jul','08':'Ago','09':'Set','10':'Out','11':'Nov','12':'Dez'};
  var meses=[],seen={};
  rows.forEach(function(f){
    var d=pDate(f[dateField]);
    if(!d)return;
    var key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    if(!seen[key]){seen[key]=true;meses.push(key);}
  });
  meses.sort().reverse();
  sel.innerHTML='<option value="">— Mês/Ano —</option>'+meses.map(function(m){
    var p=m.split('-');
    return '<option value="'+m+'"'+(m===curVal?' selected':'')+'>'+(lb[p[1]]||p[1])+'/'+p[0]+'</option>';
  }).join('');
  if(curVal) sel.value=curVal;
}
function _finCAbaCharts(ladoKey){
  var L=_FC_LADOS[ladoKey];
  if(!_finCDados()||!_finCDados().length)return;
  var fGlobal=FILTROS.grupo||'';
  var fRecorte=document.getElementById('fFcAbaChRecorte')?.value||'';
  var fChMesAno=document.getElementById('fFcAbaChMesAno')?.value||'';
  var fp=window._fcAbaPeriod||'todos';
  var hoje=new Date();hoje.setHours(0,0,0,0);

  (function(){
    var sel=document.getElementById('fFcAbaChMesAno');if(!sel)return;
    var cur=sel.value;
    var meses=[...new Set(_finCDados().filter(function(f){return f.aba===L.abaAberto;}).map(function(f){var d=pDate(f.vencimento);return d?d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'):null;}).filter(Boolean))].sort().reverse();
    var lbls={'01':'Jan','02':'Fev','03':'Mar','04':'Abr','05':'Mai','06':'Jun','07':'Jul','08':'Ago','09':'Set','10':'Out','11':'Nov','12':'Dez'};
    sel.innerHTML='<option value="">— Mês/Ano —</option>'+meses.map(function(m){var p=m.split('-');return '<option value="'+m+'"'+(m===cur?' selected':'')+'>'+(lbls[p[1]]||p[1])+'/'+p[0]+'</option>';}).join('');
    if(cur)sel.value=cur;
  })();

  var base=_finCDados().filter(function(f){
    if(f.aba!==L.abaAberto)return false;
    if(fGlobal&&f.grupo!==fGlobal)return false;
    if(f.pagamento==='SIM')return false;
    if(fRecorte&&_fcRecorteVal(f)!==fRecorte)return false;
    if(fChMesAno){var _d2=pDate(f.vencimento);if(!_d2)return false;var _my2=_d2.getFullYear()+'-'+String(_d2.getMonth()+1).padStart(2,'0');if(_my2!==fChMesAno)return false;}
    var d=pDate(f.vencimento);
    if(fp!=='todos'){
      if(fp==='vencidos'){if(!d||d>=hoje)return false;}
      else{var lim=new Date(hoje);lim.setDate(lim.getDate()+Number(fp));if(!d||d<hoje||d>lim)return false;}
    }
    return true;
  });

  if(document.getElementById('cFinCGrupo')){
    var gAll=[...new Set(base.map(function(f){return f.grupo;}).filter(Boolean))].sort();
    var gV=gAll.map(function(g){return base.filter(function(f){return f.grupo===g;}).reduce(function(s,f){return s+(Number(f.valor)||0);},0);});
    var iGv=gV.map(function(_,i){return i;}).sort(function(a,b){return gV[b]-gV[a];});
    mCh('cFinCGrupo',bCfg(iGv.map(function(i){return gAll[i];}),iGv.map(function(i){return gV[i];}),null));
  }
  if(document.getElementById('cFinCSit')){
    var venc=base.filter(function(f){return f.situacao==='Vencido';}).reduce(function(s,f){return s+(Number(f.valor)||0);},0);
    var ok  =base.filter(function(f){return f.situacao!=='Vencido';}).reduce(function(s,f){return s+(Number(f.valor)||0);},0);
    mCh('cFinCSit',dCfg(['Em dia','Vencido'],[ok,venc],['#15803D','#DC2626']));
  }
  if(document.getElementById('cFinCRecorte')){
    var rs=[...new Set(base.map(function(f){return _fcRecorteVal(f);}).filter(function(x){return x&&x!=='—';}))].sort();
    var rV=rs.map(function(r){return base.filter(function(f){return _fcRecorteVal(f)===r;}).reduce(function(s,f){return s+(Number(f.valor)||0);},0);});
    var iRv=rV.map(function(_,i){return i;}).sort(function(a,b){return rV[b]-rV[a];});
    mCh('cFinCRecorte',bCfg(iRv.map(function(i){return rs[i];}),iRv.map(function(i){return rV[i];}),null,true));
  }
  if(document.getElementById('cFinCMes')){
    var agora=new Date();var meses=[];
    for(var i=-3;i<=6;i++) meses.push(new Date(agora.getFullYear(),agora.getMonth()+i,1));
    var mLab=meses.map(function(m){return m.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'});});
    var baseAll=_finCDados().filter(function(f){
      if(f.aba!==L.abaAberto)return false;
      if(fGlobal&&f.grupo!==fGlobal)return false;
      if(fRecorte&&_fcRecorteVal(f)!==fRecorte)return false;
      return true;
    });
    var mV=meses.map(function(m){
      var y=m.getFullYear(),mo=m.getMonth();
      return baseAll.filter(function(f){
        var d=pDate(f.vencimento);if(!d)return false;
        return d.getFullYear()===y&&d.getMonth()===mo;
      }).reduce(function(s,f){return s+(Number(f.valor)||0);},0);
    });
    var nowI=meses.findIndex(function(m){return m.getFullYear()===agora.getFullYear()&&m.getMonth()===agora.getMonth();});
    mCh('cFinCMes',{type:'bar',data:{labels:mLab,datasets:[{data:mV,
      backgroundColor:mV.map(function(_,i){return i<nowI?'#8CAADEe6':i===nowI?'#16294Be6':'#C6D1EFe6';}),
      borderColor:mV.map(function(_,i){return i<nowI?'#8CAADE':i===nowI?'#16294B':'#C6D1EF';}),
      borderWidth:0,borderRadius:5}]},
      options:{responsive:true,maintainAspectRatio:false,animation:{duration:0},
        plugins:{legend:{display:false},tooltip:{callbacks:{label:function(ctx){return ' '+fF(ctx.raw);}}}},
        scales:{x:{ticks:{color:'#9CA3AF',font:{size:10}}},
                y:{ticks:{color:'#9CA3AF',font:{size:10},callback:function(v){return fS(v);}}}}}});
  }
}

// ════════════════════════════════════════════════════════════════════
// ABA "FECHADA" (Receita / Despesa) — espelha a aba "Recebidos" do
// Jurídico: lista do que já foi pago/recebido, com filtro por período
// relativo, grupo/fornecedor, busca e 2 gráficos + 2 mini-análises
// filtráveis.
// ════════════════════════════════════════════════════════════════════
function _renderFinCAbaFechada(ladoKey){
  var L=_FC_LADOS[ladoKey];
  var fin=_finCDados();
  var fG=FILTROS.grupo||'';
  var _pp=window._fcFechPeriod||'todos';
  var _hoje=new Date();_hoje.setHours(0,0,0,0);
  var rows=fin.filter(function(f){
    if(f.aba!==L.abaFechado)return false;
    if(fG&&f.grupo!==fG)return false;
    if(window._fcFechMesAno){var _d2=pDate(f.dataPagamento||f.vencimento);if(!_d2)return false;var _my2=_d2.getFullYear()+'-'+String(_d2.getMonth()+1).padStart(2,'0');if(_my2!==window._fcFechMesAno)return false;}
    else if(_pp!=='todos'){
      var _d=pDate(f.dataPagamento);if(!_d)return false;
      var _from=new Date(_hoje);_from.setDate(_from.getDate()-Number(_pp));
      if(_d<_from||_d>_hoje)return false;
    }
    return true;
  });
  rows.sort(function(a,b){var da=pDate(a.dataPagamento)||new Date(0),db=pDate(b.dataPagamento)||new Date(0);return db-da;});
  var tot=rows.reduce(function(s,f){return s+(Number(f.valor)||0);},0);
  var grupos=[...new Set(rows.map(function(f){return f.grupo;}).filter(Boolean))].sort();
  var recortes=[...new Set(rows.map(function(f){return _fcRecorteVal(f);}).filter(function(x){return x&&x!=='—';}))].sort();
  var grpOpts=mkOpts(grupos,'Todos ('+L.tituloQuem.toLowerCase()+')');
  var recCOpts=mkOpts(recortes,'Todos ('+L.tituloRecorte.toLowerCase()+')');

  var h='';
  h+='<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px" id="fcFechPeriodBar">';
  h+='<button class="fin-tab '+(_pp==='todos'?'active':'' )+'" onclick="setFinCFechPeriod(\'todos\',this)" style="font-size:12px;padding:6px 14px">Todos</button>';
  h+='<button class="fin-tab '+(_pp==='7'?'active':'')+'" onclick="setFinCFechPeriod(\'7\',this)" style="font-size:12px;padding:6px 14px">🔴 7 dias</button>';
  h+='<button class="fin-tab '+(_pp==='15'?'active':'')+'" onclick="setFinCFechPeriod(\'15\',this)" style="font-size:12px;padding:6px 14px">🟠 15 dias</button>';
  h+='<button class="fin-tab '+(_pp==='30'?'active':'')+'" onclick="setFinCFechPeriod(\'30\',this)" style="font-size:12px;padding:6px 14px">🟡 30 dias</button>';
  h+='<button class="fin-tab '+(_pp==='60'?'active':'')+'" onclick="setFinCFechPeriod(\'60\',this)" style="font-size:12px;padding:6px 14px">🔵 60 dias</button>';
  h+='<select class="fsel" id="fFcFechMesAno" onchange="setFinCFechMesAno(this.value)" style="min-width:130px;font-size:12px" title="Filtrar por mês"><option value="">— Mês/Ano —</option></select>';
  h+='</div>';
  h+='<div class="kpi-grid">';
  h+=kC('Total '+(ladoKey==='pagar'?'Pago':'Recebido'),fS(tot),fF(tot),'cg','dg');
  h+=kC('Lançamentos',fI(rows.length),'confirmados','cb','db');
  h+='</div>';

  h+='<div class="cc">';
  h+='<div class="cc-hd" style="flex-wrap:wrap;gap:8px">';
  h+='<div><div class="cc-t">'+esc(L.abaFechado)+' <span style="font-size:10.5px;color:var(--text3);font-weight:400" id="fcFechCnt">· '+rows.length+' registro(s)</span></div></div>';
  h+='<div style="display:flex;gap:5px;flex-wrap:wrap">';
  h+='<select class="fsel" id="fFcFechGrupo" onchange="filterFinCFechados()">'+grpOpts+'</select>';
  h+='<select class="fsel" id="fFcFechRecorte" onchange="filterFinCFechados()">'+recCOpts+'</select>';
  h+='<input type="text" class="fsel" id="fFcFechBusca" placeholder="Buscar referência..." oninput="filterFinCFechados()" style="max-width:160px">';
  h+='<input type="date" class="fsel" id="fFcFechDe"  onchange="filterFinCFechados()" style="max-width:130px">';
  h+='<input type="date" class="fsel" id="fFcFechAte" onchange="filterFinCFechados()" style="max-width:130px">';
  h+='</div></div>';
  h+='<div class="tw scr"><table><thead><tr>';
  h+='<th>'+esc(L.tituloQuem)+'</th><th>'+esc(L.tituloRecorte)+'</th><th>Referência</th>';
  h+='<th>Vencimento</th><th>Valor</th><th>Data Pgto</th><th>PIX/Forma</th>';
  h+='</tr></thead><tbody id="tblFcFechBody">';
  h+=rows.map(function(f){return '<tr><td>'+_faSelo(f.grupo||'—')+'</td>'
    +'<td>'+esc(_fcRecorteVal(f))+'</td>'
    +'<td style="font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:0">'+esc(f.referencia||'—')+(f.obs?'<br><span style="font-size:10px;color:var(--text3)">'+esc(f.obs)+'</span>':'')+'</td>'
    +'<td class="mono">'+(f.vencimento||'—')+'</td>'
    +'<td class="mono"><strong>'+fF(f.valor||0)+'</strong></td>'
    +'<td class="mono">'+(f.dataPagamento||'—')+'</td>'
    +'<td class="mono" style="font-size:10.5px">'+esc(f.pix||f.formaPagamento||f.banco||'—')+'</td></tr>';}).join('');
  h+='</tbody></table></div></div>';

  h+='<div class="crow c2">';
  h+='<div class="cc"><div class="cc-hd"><div><div class="cc-t">'+(ladoKey==='pagar'?'Pago':'Recebido')+' por '+esc(L.tituloQuem.toLowerCase())+'</div></div></div>';
  h+='<div class="cb" style="height:220px"><canvas id="cFcFechQuem"></canvas></div></div>';
  h+='<div class="cc"><div class="cc-hd"><div><div class="cc-t">'+(ladoKey==='pagar'?'Pago':'Recebido')+' por '+esc(L.tituloRecorte.toLowerCase())+'</div></div></div>';
  h+='<div class="cb" style="height:220px"><canvas id="cFcFechRecorte"></canvas></div></div>';
  h+='</div>';

  h+='<div class="crow c2">';
  h+='<div class="cc">';
  h+='<div class="cc-hd" style="flex-wrap:wrap;gap:8px">';
  h+='<div><div class="cc-t">Por '+esc(L.tituloRecorte.toLowerCase())+'</div><div class="cc-d">filtrado por período</div></div>';
  h+='<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">';
  h+='<select class="fsel" id="fFcFechRecGrf" onchange="_fcFechCharts(\''+ladoKey+'\')" style="max-width:150px">'+recCOpts+'</select>';
  h+='<input type="date" class="fsel" id="fFcFechRecDe"  onchange="_fcFechCharts(\''+ladoKey+'\')" style="max-width:130px">';
  h+='<input type="date" class="fsel" id="fFcFechRecAte" onchange="_fcFechCharts(\''+ladoKey+'\')" style="max-width:130px">';
  h+='</div></div>';
  h+='<div class="cb" style="height:210px"><canvas id="cFcFechRecFilt"></canvas></div></div>';

  h+='<div class="cc">';
  h+='<div class="cc-hd" style="flex-wrap:wrap;gap:8px">';
  h+='<div><div class="cc-t">'+(ladoKey==='pagar'?'Pagamentos':'Recebimentos')+' mensais</div><div class="cc-d">-3 a +6 meses · filtrado por '+esc(L.tituloRecorte.toLowerCase())+' e período</div></div>';
  h+='<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">';
  h+='<select class="fsel" id="fFcFechMesRec" onchange="_fcFechCharts(\''+ladoKey+'\')" style="max-width:150px">'+recCOpts+'</select>';
  h+='<input type="date" class="fsel" id="fFcFechMesDe"  onchange="_fcFechCharts(\''+ladoKey+'\')" style="max-width:130px">';
  h+='<input type="date" class="fsel" id="fFcFechMesAte" onchange="_fcFechCharts(\''+ladoKey+'\')" style="max-width:130px">';
  h+='</div></div>';
  h+='<div class="cb" style="height:210px"><canvas id="cFcFechMes"></canvas></div></div>';
  h+='</div>';

  $('finCContent').innerHTML=h;
  window._fcFechLado=ladoKey;
  _finCPopMesAno($('fFcFechMesAno'), fin.filter(function(f){return f.aba===L.abaFechado;}), 'dataPagamento', window._fcFechMesAno||'');
  window._fcFechRows=rows;
  setTimeout(function(){if(window._fcFechPeriod&&window._fcFechPeriod!=='todos')filterFinCFechados();},0);

  var gV=grupos.map(function(g){return rows.filter(function(f){return f.grupo===g;}).reduce(function(s,f){return s+(Number(f.valor)||0);},0);});
  var iGv=gV.map(function(_,i){return i;}).sort(function(a,b){return gV[b]-gV[a];});
  mCh('cFcFechQuem',bCfg(iGv.map(function(i){return grupos[i];}),iGv.map(function(i){return gV[i];}),null));
  var rV=recortes.map(function(r){return rows.filter(function(f){return _fcRecorteVal(f)===r;}).reduce(function(s,f){return s+(Number(f.valor)||0);},0);});
  var iRv=rV.map(function(_,i){return i;}).sort(function(a,b){return rV[b]-rV[a];});
  mCh('cFcFechRecorte',bCfg(iRv.map(function(i){return recortes[i];}),iRv.map(function(i){return rV[i];}),null,true));

  _fcFechCharts(ladoKey);
}
function setFinCFechPeriod(p,btn){
  window._fcFechPeriod=p; window._fcFechMesAno='';
  document.querySelectorAll('#fcFechPeriodBar .fin-tab').forEach(function(b){b.classList.remove('active');});
  if(btn)btn.classList.add('active');
  _renderFinCAbaFechada(window._fcFechLado);
}
function setFinCFechMesAno(v){
  window._fcFechMesAno=v; window._fcFechPeriod='todos';
  _renderFinCAbaFechada(window._fcFechLado);
}
function filterFinCFechados(){
  var L=_FC_LADOS[window._fcFechLado];
  var g=document.getElementById('fFcFechGrupo')?.value||'';
  var r=document.getElementById('fFcFechRecorte')?.value||'';
  var busca=(document.getElementById('fFcFechBusca')?.value||'').toLowerCase();
  var de=document.getElementById('fFcFechDe')?.value||'';
  var ate=document.getElementById('fFcFechAte')?.value||'';
  var rows=(window._fcFechRows||[]).filter(function(f){
    if(g&&f.grupo!==g)return false;
    if(r&&_fcRecorteVal(f)!==r)return false;
    if(busca&&!String(f.referencia||'').toLowerCase().includes(busca)&&!String(f.obs||'').toLowerCase().includes(busca))return false;
    if(de||ate){var d=pDate(f.dataPagamento||f.vencimento);
      if(de&&(!d||d<new Date(de)))return false;
      if(ate&&(!d||d>new Date(ate+'T23:59:59')))return false;}
    return true;
  });
  var cnt=document.getElementById('fcFechCnt'); if(cnt)cnt.textContent='· '+rows.length+' registro(s)';
  var body=document.getElementById('tblFcFechBody');
  if(body) body.innerHTML=rows.map(function(f){return '<tr><td>'+_faSelo(f.grupo||'—')+'</td>'
    +'<td>'+esc(_fcRecorteVal(f))+'</td>'
    +'<td style="font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:0">'+esc(f.referencia||'—')+'</td>'
    +'<td class="mono">'+(f.vencimento||'—')+'</td>'
    +'<td class="mono"><strong>'+fF(f.valor||0)+'</strong></td>'
    +'<td class="mono">'+(f.dataPagamento||'—')+'</td>'
    +'<td class="mono" style="font-size:10.5px">'+esc(f.pix||f.formaPagamento||f.banco||'—')+'</td></tr>';}).join('');
}
function _fcFechCharts(ladoKey){
  var L=_FC_LADOS[ladoKey];
  var rows=(window._fcFechRows||[]).filter(function(f){
    var pp=window._fcFechPeriod||'todos';
    if(pp==='todos')return true;
    var d=pDate(f.dataPagamento);
    if(!d)return false;
    var hoje=new Date();hoje.setHours(0,0,0,0);
    var from=new Date(hoje);from.setDate(from.getDate()-Number(pp));
    return d>=from&&d<=hoje;
  });
  var fRecGrf=document.getElementById('fFcFechRecGrf')?.value||'';
  var fRecDe =document.getElementById('fFcFechRecDe')?.value||'';
  var fRecAte=document.getElementById('fFcFechRecAte')?.value||'';
  var fMesRec=document.getElementById('fFcFechMesRec')?.value||'';
  var fMesDe =document.getElementById('fFcFechMesDe')?.value||'';
  var fMesAte=document.getElementById('fFcFechMesAte')?.value||'';

  if(document.getElementById('cFcFechRecFilt')){
    var baseR=rows.filter(function(f){
      if(fRecGrf&&_fcRecorteVal(f)!==fRecGrf)return false;
      var d=pDate(f.dataPagamento);if(!d)return true;
      if(fRecDe&&d<new Date(fRecDe))return false;
      if(fRecAte&&d>new Date(fRecAte+'T23:59:59'))return false;
      return true;
    });
    var rs2=[...new Set(baseR.map(function(f){return _fcRecorteVal(f);}).filter(function(x){return x&&x!=='—';}))].sort();
    var rV2=rs2.map(function(r){return baseR.filter(function(f){return _fcRecorteVal(f)===r;}).reduce(function(s,f){return s+(Number(f.valor)||0);},0);});
    var iRv2=rV2.map(function(_,i){return i;}).sort(function(a,b){return rV2[b]-rV2[a];});
    mCh('cFcFechRecFilt',bCfg(iRv2.map(function(i){return rs2[i];}),iRv2.map(function(i){return rV2[i];}),null,true));
  }
  if(document.getElementById('cFcFechMes')){
    var agora=new Date();var meses=[];
    for(var i=-3;i<=6;i++) meses.push(new Date(agora.getFullYear(),agora.getMonth()+i,1));
    var mLab=meses.map(function(m){return m.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'});});
    var mV=meses.map(function(m){
      var y=m.getFullYear(),mo=m.getMonth();
      return rows.filter(function(f){
        if(fMesRec&&_fcRecorteVal(f)!==fMesRec)return false;
        var d=pDate(f.dataPagamento);if(!d)return false;
        if(d.getFullYear()!==y||d.getMonth()!==mo)return false;
        if(fMesDe&&d<new Date(fMesDe))return false;
        if(fMesAte&&d>new Date(fMesAte+'T23:59:59'))return false;
        return true;
      }).reduce(function(s,f){return s+(Number(f.valor)||0);},0);
    });
    var nowI=meses.findIndex(function(m){return m.getFullYear()===agora.getFullYear()&&m.getMonth()===agora.getMonth();});
    mCh('cFcFechMes',{type:'bar',data:{labels:mLab,datasets:[{data:mV,
      backgroundColor:mV.map(function(_,i){return i<nowI?'#8CAADEe6':i===nowI?'#16294Be6':'#C6D1EFe6';}),
      borderColor:mV.map(function(_,i){return i<nowI?'#8CAADE':i===nowI?'#16294B':'#C6D1EF';}),
      borderWidth:0,borderRadius:5}]},
      options:{responsive:true,maintainAspectRatio:false,animation:{duration:0},
        plugins:{legend:{display:false},tooltip:{callbacks:{label:function(ctx){return ' '+fF(ctx.raw);}}}},
        scales:{x:{ticks:{color:'#9CA3AF',font:{size:10}}},
                y:{ticks:{color:'#9CA3AF',font:{size:10},callback:function(v){return fS(v);}}}}}});
  }
}

// ── dispatcher da tela (chamado pelo botão de aba e por _PINTORES) ──
function setFinCTab(tab,btn){
  _finC.tab=tab;
  document.querySelectorAll('#finCTabBar .fin-tab').forEach(function(b){b.classList.remove('active');});
  if(btn) btn.classList.add('active');
  renderFinanceiroContab();
}
var _finC = { tab:'analise' };
function renderFinanceiroContab(){
  var el=$('finCContent');
  if(!el) return;
  if(_finC.tab==='socios'){ _renderFinCSocios(); return; }
  var dados=_finCDados();
  if(!dados||!dados.length){
    el.innerHTML='<div class="cc"><div class="emp"><div class="emp-ic">◉</div><div class="emp-t">Módulo de Honorários Contabilidade não configurado</div><div class="emp-s">Verifique o Apps Script — abas: A Receber, Receita, A Pagar, Despesa.</div></div></div>';
    return;
  }
  if(_finC.tab==='analise'){ _fcAnalise(); return; }
  if(_finC.tab==='receber'){ _renderFinCAbaAberta('receber'); return; }
  if(_finC.tab==='receita'){ _renderFinCAbaFechada('receber'); return; }
  if(_finC.tab==='apagar'){ _renderFinCAbaAberta('pagar'); return; }
  if(_finC.tab==='despesa'){ _renderFinCAbaFechada('pagar'); return; }
}
// v1: aba de Distribuição de Lucros ainda não tem backend (aguardando
// definição da planilha de sócios) -- placeholder para o botão não
// quebrar a navegação enquanto isso não é construído.
function _renderFinCSocios(){
  var el=$('finCContent');
  el.innerHTML='<div class="cc"><div class="emp"><div class="emp-ic">🤝</div><div class="emp-t">Distribuição de Lucros aos Sócios</div><div class="emp-s">Em construção.</div></div></div>';
}
