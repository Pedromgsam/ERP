// Gera sistema/app/index.html a partir do ERP original (#Sistemas/2 - ERP/ERP.html).
// O visual, as telas e os cálculos ficam exatamente iguais; só muda:
//  - de onde vêm os dados (erp-dados.js lê do Supabase no lugar do Apps Script);
//  - Chart.js servido do próprio site (sem CDN);
//  - login por e-mail;
//  - cada linha das tabelas ganha data-gx (tabela:id) para o botão ✎ Editar.
// Uso: node sistema/ferramentas/montar-erp.js
'use strict';
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..', '..');
const origem = path.join(raiz, '#Sistemas', '2 - ERP', 'ERP.html');
const destino = path.join(raiz, 'sistema', 'app', 'index.html');
let s = fs.readFileSync(origem, 'utf8');
let trocas = 0;

function trocar(de, para, vezes) {
  const n = s.split(de).length - 1;
  if (vezes !== undefined ? n !== vezes : n < 1) throw new Error('Trecho esperado ' + (vezes ?? '≥1') + 'x, achei ' + n + 'x: ' + de.slice(0, 80));
  s = s.split(de).join(para); trocas += n;
}
// troca tudo de `ini` até o fim de `fim` (inclusive) por `novo` — os dois precisam existir uma vez só
function removerTrechoHtml(ini, fim, novo) {
  const i = s.indexOf(ini);
  if (i < 0 || s.indexOf(ini, i + 1) >= 0) throw new Error('Início ausente ou repetido: ' + ini.slice(0, 80));
  const j = s.indexOf(fim, i);
  if (j < 0) throw new Error('Fim ausente: ' + fim.slice(0, 80));
  s = s.slice(0, i) + (novo || '') + s.slice(j + fim.length); trocas++;
}
// troca a próxima ocorrência de `alvo` depois de `ancora`
function depoisDe(ancora, alvo, novo) {
  const i = s.indexOf(ancora);
  if (i < 0 || s.indexOf(ancora, i + 1) >= 0) throw new Error('Âncora ausente ou repetida: ' + ancora);
  const j = s.indexOf(alvo, i);
  if (j < 0 || j - i > 1500) throw new Error('Alvo longe/ausente após: ' + ancora);
  s = s.slice(0, j) + novo + s.slice(j + alvo.length); trocas++;
}

// 1. Scripts: Chart.js local + ponte Supabase antes de tudo; editor no fim.
trocar('<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js" defer></script>',
  '<script src="vendor/chart.umd.js" defer></script>\n' +
  '<script src="vendor/supabase.js"></script>\n<script src="config.js"></script>\n<script src="erp-dados.js"></script>\n' +
  '<link rel="stylesheet" href="editor.css">\n<link rel="stylesheet" href="erp-telas.css">\n' +
  '<script src="editor.js" defer></script>\n<script src="erp-telas.js" defer></script>\n' +
  '<link rel="stylesheet" href="gs.css">\n<script src="importador.js" defer></script>\n<script src="gestao-embutida.js" defer></script>', 1);

// 2. URL "do script": fica só como marcador; nenhuma chamada sai para o Google.
s = s.replace(/const DEFAULT_URL = 'https:\/\/script\.google\.com\/macros\/s\/[^']+\/exec';/,
  () => { trocas++; return "const DEFAULT_URL = 'https://script.google.com/macros/s/supabase/exec'; // interceptado por erp-dados.js"; });
trocar("const url = localStorage.getItem(LS_KEY) || DEFAULT_URL;", "const url = DEFAULT_URL;");
trocar("const url=localStorage.getItem(LS_KEY)||DEFAULT_URL;", "const url=DEFAULT_URL;");
trocar("const _u = localStorage.getItem(LS_KEY) || DEFAULT_URL;", "const _u = DEFAULT_URL;");

// 3. Login por e-mail.
trocar('<label class="ac-login-label" id="ac-login-email-label">Login</label>', '<label class="ac-login-label" id="ac-login-email-label">E-mail</label>', 1);
trocar('autocomplete="username" placeholder="seu login de acesso"', 'autocomplete="username" inputmode="email" placeholder="seu e-mail"', 1);
trocar("_acMostrarMsg('Entre em contato com o escritório para redefinir sua senha.', 'warn');",
  "if (window.ERP_ESQUECI_SENHA) window.ERP_ESQUECI_SENHA(); else _acMostrarMsg('Entre em contato com o escritório para redefinir sua senha.', 'warn');", 1);

// 4. Linhas editáveis: data-gx em cada <tr> das tabelas principais.
const TPL = (v) => '<tr data-gx="${_gx(' + v + ')}">';
depoisDe("const el=$('tblExecRanking');", 'return`<tr>', 'return`' + TPL('r'));
depoisDe("$('tblProcBody').innerHTML=", 'return`<tr>', 'return`' + TPL('p'));
depoisDe("$('tblParcBody').innerHTML=", 'map(p=>`<tr>', 'map(p=>`' + TPL('p'));
depoisDe("const el=$('tblParcPagoBody');", 'map(p=>`<tr>', 'map(p=>`' + TPL('p'));
depoisDe("const el=$('tblParcVencBody');", 'map(p=>`<tr>', 'map(p=>`' + TPL('p'));
depoisDe("$('tblAcordosBody').innerHTML=", 'return`<tr>', 'return`' + TPL('a'));
depoisDe("const el=$('tblAcordosVencBody');", 'return`<tr>', 'return`' + TPL('a'));
depoisDe("$('tblAcordosPgBody').innerHTML=", 'map(a=>`<tr>', 'map(a=>`' + TPL('a'));
// financeiro (linhas montadas por concatenação, variável f)
s = s.replace(/map\(f=>'<tr>/g, () => { trocas++; return "map(f=>'<tr data-gx=\"'+_gx(f)+'\">"; });
s = s.replace(/map\(function\(f\)\{return '<tr>/g, () => { trocas++; return "map(function(f){return '<tr data-gx=\"'+_gx(f)+'\">"; });
s = s.replace(/return '<tr><td>'\+_faSelo\(f\.grupo/g, () => { trocas++; return "return '<tr data-gx=\"'+_gx(f)+'\"><td>'+_faSelo(f.grupo"; });
s = s.replace(/return '<tr><td><span class="tag tn">'\+\(f\.grupo/g, () => { trocas++; return "return '<tr data-gx=\"'+_gx(f)+'\"><td><span class=\"tag tn\">'+(f.grupo"; });

// análise de honorários (jurídico e contabilidade) e sócios da contabilidade
s = s.replace(/return '<tr><td class="mono" title="'\+\(pg\?/g, () => { trocas++; return "return '<tr data-gx=\"'+_gx(f)+'\"><td class=\"mono\" title=\"'+(pg?"; });
s = s.replace(/var pago=f\.pagamento==='SIM';\n(\s*)return '<tr><td class="mono">'/g, (m, e) => { trocas++; return "var pago=f.pagamento==='SIM';\n" + e + "return '<tr data-gx=\"'+_gx(f)+'\"><td class=\"mono\">'"; });

// 4b. E-mail: o rascunho no Gmail (Apps Script) virou "abrir e-mail já preenchido".
s = s.split("Rascunho criado no Gmail").join('E-mail aberto no seu programa de e-mail');
s = s.split('✉ Salvar rascunho (Gmail)').join('✉ Abrir e-mail');
s = s.split("'⏳ Salvando rascunho…'").join("'⏳ Abrindo e-mail…'");
s = s.split("'\\u23f3 Salvando rascunho\\u2026'").join("'\\u23f3 Abrindo e-mail\\u2026'");

// 5. Dados pessoais dos advogados (CPF, endereço) saem do HTML público e vão para o banco
//    (tabela configuracoes, só a equipe lê). O SQL para colar no Supabase é gerado em
//    sistema/banco/dados-recibos.sql; o erp-dados.js carrega depois do login.
const mEmit = s.match(/var RECIBO_EMITENTES = (\{[\s\S]*?\n\});/);
if (!mEmit) throw new Error('Bloco RECIBO_EMITENTES não encontrado');
const emitentes = require('vm').runInNewContext('(' + mEmit[1] + ')');
s = s.replace(mEmit[0], 'var RECIBO_EMITENTES = {}; // preenchido após o login por erp-dados.js (tabela configuracoes)'); trocas++;
const json = JSON.stringify(emitentes).replace(/'/g, "''");
fs.writeFileSync(path.join(raiz, 'sistema', 'banco', 'dados-recibos.sql'),
  '-- Dados dos advogados usados nos recibos (gerado por ferramentas/montar-erp.js).\n' +
  '-- Cole no SQL Editor do Supabase e clique em Run. Pode rodar de novo sem problema.\n' +
  '-- Cria a tabela (se ainda não existir) com as regras de acesso: só a equipe lê, só o admin altera.\n' +
  'create table if not exists public.configuracoes (\n  chave text primary key,\n  valor jsonb not null,\n  atualizado_em timestamptz not null default now()\n);\n' +
  'alter table public.configuracoes enable row level security;\n' +
  'revoke all on public.configuracoes from anon;\n' +
  'grant select, insert, update, delete on public.configuracoes to authenticated;\n' +
  'drop policy if exists configuracoes_ver on public.configuracoes;\n' +
  'create policy configuracoes_ver on public.configuracoes for select to authenticated using (public.eh_equipe());\n' +
  'drop policy if exists configuracoes_admin on public.configuracoes;\n' +
  'create policy configuracoes_admin on public.configuracoes for all to authenticated\n  using (public.eh_admin()) with check (public.eh_admin());\n\n' +
  "insert into public.configuracoes (chave, valor) values ('recibo_emitentes', '" + json + "'::jsonb)\n" +
  'on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();\n');

// 6. Em atraso com a regra do Gestão: todos os meses (não só o período escolhido),
//    mantendo os recortes de pessoa, tipo e grupo; e a lista "⚠ Em atraso" logo abaixo.
function semPeriodo(estado, filtrar, abas) {
  return 'window._semPeriodo(' + estado + ',function(){return ' + filtrar + '(' + abas + ');})';
}
trocar("var vencidos=aReceber.filter(function(f){ var d=_faData(f); return d&&d<hoje; });",
  "var vencidos=" + semPeriodo('_FA', '_faFiltrar', "['A Receber']") + ".filter(function(f){ var d=pDate(f.vencimento); return d&&d<hoje; });", 1);
trocar("var vencidos=aberto.filter(function(f){ var d=_fcData(f); return d&&d<hoje; });",
  "var vencidos=" + semPeriodo('_FC', '_fcFiltrar', '[L.abaAberto]') + ".filter(function(f){ var d=pDate(f.vencimento); return d&&d<hoje; });", 1);
trocar("  +   kC('Vencido',_faFT(vVenc),vencidos.length+' lançamento(s)','cr',vVenc>0?'dr':'')",
  "  +   kC('Em atraso',_faFT(vVenc),vencidos.length+' vencido(s) · todos os meses','cr',vVenc>0?'dr':'')", 2);
// Backup 31: Processos → com UM grupo no filtro, a tabela "Grupo" vira "Entidade / sócio": cada empresa ou sócio do grupo com seus processos e valor
trocar("   +'<div class=\"crow c3\">'+agrupa('grupo','Grupo')",
  "   +'<div class=\"crow c3\">'+(g?_procEntidades(lista,g,val):agrupa('grupo','Grupo'))", 1);
trocar("function renderProcAnalise(){",
  "function renderProcAnalise(){\n  // Backup 31: entidade do processo = a parte (réu ou autor) que é cliente do grupo; sem cadastro, o réu\n" +
  "  window._procEntidades=window._procEntidades||function(lista,g,val){\n" +
  "    var norm=function(x){ return String(x||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,''); };\n" +
  "    var cad=(DB.baseDados||[]).filter(function(r){ return r.grupo===g; }), m={};\n" +
  "    var achar=function(nome){ var n=norm(nome); if(!n) return null; return cad.find(function(r){ var c=norm(r.nome); return c && (c===n || n.indexOf(c)>=0 || c.indexOf(n)>=0); })||null; };\n" +
  "    cad.forEach(function(r){ m[r.nome]={n:0,v:0,tipo:r.socioAdmin?'Empresa':''}; });\n" +
  "    lista.forEach(function(p){ var r=achar(p.reu)||achar(p.autor), k=r?r.nome:(String(p.reu||p.autor||'').trim()||'Parte não informada');\n" +
  "      if(!m[k]) m[k]={n:0,v:0}; m[k].n++; m[k].v+=val(p); });\n" +
  "    var ks=Object.keys(m).filter(function(k){ return m[k].n>0; }).sort(function(a,b){ return m[b].v-m[a].v || m[b].n-m[a].n; });\n" +
  "    return '<div><div class=\"tw\"><table data-proc-ent><thead><tr><th title=\"Empresas e sócios de '+esc(g)+'\">Entidade / sócio</th>'\n" +
  "      +'<th style=\"text-align:right\">Processos</th><th style=\"text-align:right\">Valor</th></tr></thead><tbody>'\n" +
  "      + ks.map(function(k){ return '<tr><td><strong>'+esc(k)+'</strong></td><td class=\"mono\" style=\"text-align:right\">'+m[k].n+'</td>'\n" +
  "          +'<td class=\"mono\" style=\"text-align:right\">'+(m[k].v?_faFT(m[k].v):'—')+'</td></tr>'; }).join('')\n" +
  "      + '</tbody></table></div></div>';\n" +
  "  };", 1);
// Backup 29: tabelas mostram TODOS os registros (sem "Pág. 1 de 5"); o rodapé fica só com o total
trocar("const PG = 25;", "const PG = 1e9;   // Backup 29: sem páginas — todas as linhas", 1);
trocar("  el.innerHTML=`<button class=\"pg-b\" onclick=\"(${onChange.toString()})(${pg-1})\" ${pg<=1?'disabled':''}>‹</button>\n    <span class=\"pg-i\">Pág. ${pg} de ${tPg} · ${fI(total)} registros</span>\n    <button class=\"pg-b\" onclick=\"(${onChange.toString()})(${pg+1})\" ${pg>=tPg?'disabled':''}>›</button>`;",
  "  el.innerHTML=total?`<span class=\"pg-i\">${fI(total)} registro${total===1?'':'s'}</span>`:'';", 1);
// Backup 29: Financeiro → Jurídico com os MESMOS cartões do Início (Recebido · A receber · A pagar · Em atraso · Prejuízo) + Ticket médio.
// "Recebido" segue o filtro de período (no Início é sempre o mês corrente); "A receber" é o que ainda não venceu.
trocar("  +   kC('A receber',_faFT(vAR),aReceber.length+' em aberto','cb','db')\n  +   kC('Em atraso',_faFT(vVenc),vencidos.length+' vencido(s) · todos os meses','cr',vVenc>0?'dr':'')\n  +   (cliente?'':kC('Prejuízo',_faFT(vPrej),prejuizo.length+' baixa(s)','cx',vPrej>0?'dr':''))",
  "  +   (function(){ var aVenc=aReceber.filter(function(f){ return vencidos.indexOf(f)<0; }), aPag=_faFiltrar(['A Pagar']);\n" +
  "        return kC('A receber',fF(_faSoma(aVenc)),aVenc.length+' em aberto · a vencer','cb','db')\n" +
  "          + (cliente?'':kC('A pagar',fF(_faSoma(aPag)),aPag.length+' conta(s) em aberto','ca',''));\n      })()\n" +
  "  +   kC('Em atraso',fF(vVenc),vencidos.length+' vencido(s)','cr',vVenc>0?'dr':'')\n" +
  "  +   (cliente?'':kC('Prejuízo',fF(vPrej),prejuizo.length+' baixa(s)','cx',vPrej>0?'dr':''))", 1);
// valores inteiros nos cartões (iguais aos do Início)
trocar("  +   kC('Recebido',_faFT(vRec),receita.length+' lançamento(s)','cg','dg')", "  +   kC('Recebido',fF(vRec),receita.length+' recebimento(s) no período','cg','dg')", 1);
trocar("  +   kC('Ticket médio',_faFT(ticket),'por lançamento recebido','cv','dv')", "  +   kC('Ticket médio',fF(ticket),'por lançamento recebido','cv','dv')", 1);
// Análise (Jurídico): ordem Recebido mês a mês → tipo de serviço e maiores grupos → comparativo por pessoa → Em atraso
trocar("  +   _faTabelaPessoas(_faPessoas()) + '</div>';",
  "  +   _faTabelaPessoas(_faPessoas()) + '</div>'\n" +
  "  + (vencidos.length?'<div class=\"cc\" style=\"margin-bottom:14px\"><div class=\"cc-hd\"><div><div class=\"cc-t\">⚠ Em atraso</div><div class=\"cc-d\">todos os meses · mesmos recortes de pessoa, tipo e grupo</div></div></div>'+_faTabelaDetalhe(vencidos.slice().sort(function(a,b){return (pDate(a.vencimento)||0)-(pDate(b.vencimento)||0);}))+'</div>':'');", 1);
// ═══════ Backup 13 — Painel Executivo ═══════
// Parcelamentos e Negociações: números em preto (sem vermelho de alerta)
trocar("    kC('Acordos c/ Terceiros a Pagar',fS(_acAPagar),fF(_acAPagar),'cr','dr');",
  "    kC('Acordos c/ Terceiros a Pagar',fF(_acAPagar),'parcelas em aberto','cr','');", 1);
// Distribuição por órgão: gráfico maior na coluna A e legenda em tabela na coluna B
trocar('<div class="cb" style="height:280px"><canvas id="cResDonut"></canvas></div>',
  '<div class="gx-donut"><div class="cb gx-donut-g"><canvas id="cResDonut"></canvas></div><div class="gx-donut-leg" id="cResDonutLeg"></div></div>', 1);
trocar("mCh('cResDonut',dCfg(", "_donutComLegenda('cResDonut',dCfg(", 2);
depoisDe('function dCfg(labels,data,colors){', '\n', '\n' +
  "  return _dCfgBase(labels,data,colors);\n}\n" +
  "// rosca + legenda em tabela ao lado (cor · nome · valor · %) — usada no Painel e em Parcelamentos/Acordos\n" +
  "function _donutComLegenda(id,cfgOuArgs,extra){\n" +
  "  var a=Array.isArray(cfgOuArgs)?cfgOuArgs:null;\n" +
  "  var cfg=a?_dCfgBase(a[0],a[1],a[2]):cfgOuArgs; var labels=cfg.data.labels, data=cfg.data.datasets[0].data, cores=cfg.data.datasets[0].backgroundColor;\n" +
  "  cfg.options.plugins.legend.display=false; cfg.options.cutout='62%';\n" +
  "  mCh(id,cfg);\n" +
  "  var el=document.getElementById(id+'Leg'); if(!el) return;\n" +
  "  var tot=data.reduce(function(s,v){return s+(Number(v)||0);},0)||1;\n" +
  "  el.innerHTML='<table class=\"gx-leg\"><tbody>'+labels.map(function(l,i){var v=Number(data[i])||0;\n" +
  "    return '<tr><td><span class=\"gx-leg-c\" style=\"background:'+(window.ERP_COR_LEGENDA?ERP_COR_LEGENDA(cores[i]):String(cores[i]).slice(0,7))+'\"></span>'+l+'</td><td class=\"num\">'+fF(v)+'</td><td class=\"num gx-leg-p\">'+(v/tot*100).toFixed(1).replace('.',',')+'%</td></tr>';}).join('')+\n" +
  "    '</tbody><tfoot><tr><td>Total</td><td class=\"num\">'+fF(tot===1&&!data.some(Number)?0:tot)+'</td><td class=\"num\">100%</td></tr></tfoot></table>';\n" +
  "}\n" +
  "function _dCfgBase(labels,data,colors){\n");
// ═══════ Backup 13 — Processos ═══════
// sai "Processos — Visão Geral" e os 4 gráficos (os números foram para a Análise da carteira)
removerTrechoHtml('  <div class="ex-bn" style="margin-bottom:16px;position:relative;background:none;border:1.5px solid var(--border);box-shadow:var(--shadow-md);padding:22px 26px">\n    <div style="font-family:var(--font-d);font-size:14px;font-weight:700;color:var(--ac-gold);margin-bottom:12px;letter-spacing:.01em">⚖ Processos — Visão Geral</div>',
  '      <div class="cb" style="height:210px"><canvas id="cProcNatureza"></canvas></div>\n    </div>\n  </div>\n',
  '  <div hidden aria-hidden="true"><div id="kpiProc"></div><canvas id="cProcGrupos"></canvas><canvas id="cProcComp"></canvas><canvas id="cProcValor"></canvas><canvas id="cProcNatureza"></canvas></div>\n');
// Análise da carteira ganha Arquivados/extintos, Passivo e Ativo em disputas
// Backup 16: o mesmo processo (mesmo número) que aparece para o sócio e para a PJ conta uma vez só — no total,
// no valor em disputa e no passivo/ativo; arquivados/extintos viram legenda do card Processos (sem card próprio).
trocar("  var comValor=lista.filter(function(p){ return val(p)>0; });\n  var totalV=comValor.reduce(function(s,p){ return s+val(p); },0);\n  var ativos=lista.filter(function(p){ return !String(p.arquivamento||'').trim(); }).length;",
  "  var _vistos={}; lista=lista.filter(function(p){ var k=String(p.numero||'').replace(/\\D/g,'')||String(p.numero||'')||('#'+Math.random()); if(_vistos[k]) return false; _vistos[k]=1; return true; });\n" +
  "  var comValor=lista.filter(function(p){ return val(p)>0; });\n  var totalV=comValor.reduce(function(s,p){ return s+val(p); },0);\n  var ativos=lista.filter(function(p){ return !String(p.arquivamento||'').trim(); }).length;", 1);
trocar("   +  kC('Processos',lista.length,ativos+' em andamento','cb','db')",
  "   +  kC('Processos',lista.length,ativos+' em andamento<br>'+(lista.length-ativos)+' arquivados/extintos','cb','db')", 1);
trocar("   +  kC('Valor em disputa',_faFT(totalV),comValor.length+' com valor informado','cv','dv')",
  "   +  kC('Valor em disputa',_faFT(totalV),'soma dos valores da causa','cv','dv')\n" +
  "   +  (function(){ var nomes=(FIL.length?FIL:DB.baseDados).map(function(r){return String(r.nome||'').toLowerCase();}).filter(function(n){return n.length>2;});\n" +
  "        var tem=function(t){ t=String(t||'').toLowerCase(); return nomes.some(function(n){return t.indexOf(n)>=0;}); };\n" +
  "        var vP=lista.filter(function(p){return tem(p.reu);}).reduce(function(s,p){return s+val(p);},0), vA=lista.filter(function(p){return tem(p.autor);}).reduce(function(s,p){return s+val(p);},0);\n" +
  "        return kC('Passivo em disputas',_faFT(vP),'cliente como réu','cr','')+kC('Ativo em disputas',_faFT(vA),'cliente como autor','cg',''); })()", 1);
// Backup 27: Processos sem "Ticket médio" e "Sem valor"; tabelas Grupo/Tribunal/Natureza sem o título em cima (a 1ª coluna já diz);
// a lista já abre ordenada por Competência
trocar("   +  kC('Ticket médio',_faFT(comValor.length?totalV/comValor.length:0),'por processo com valor','cx','')\n   +  kC('Sem valor',lista.length-comValor.length,'processos sem valor da causa',\n        (lista.length-comValor.length)?'ca':'cg',(lista.length-comValor.length)?'da':'')\n", "", 1);
trocar("    return '<div><div class=\"pa-sub\">'+rotulo+'</div><div class=\"tw\"><table><thead><tr><th>'+rotulo+'</th>'", "    return '<div><div class=\"tw\"><table><thead><tr><th>'+rotulo+'</th>'", 1);
trocar("let _procPg=1,_procSort={col:9,asc:false};", "let _procPg=1,_procSort={col:3,asc:true};", 1);
// Backup 27: Financeiro Contabilidade — Análise única (sem os cartões Recebimentos/Pagamentos), ver remendos/contab-b27.js
trocar("function _fcPintarCorpo(){", "function _fcPintarCorpoAntigo(){", 1);
trocar("function _fcTabelaPessoas(pessoas){", fs.readFileSync(path.join(__dirname, 'remendos', 'contab-b27.js'), 'utf8') + "function _fcTabelaPessoas(pessoas){", 1);
trocar("  + '<div style=\"display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;align-items:center\" id=\"fcLadoBar\">'\n  +   '<button class=\"fin-tab '+(_FC.lado==='receber'?'active':'')+'\" onclick=\"fcSetLado(\\'receber\\',this)\">📥 Recebimentos</button>'\n  +   '<button class=\"fin-tab '+(_FC.lado==='pagar'?'active':'')+'\" onclick=\"fcSetLado(\\'pagar\\',this)\">📤 Pagamentos</button>'\n  + '</div>'\n", "", 1);
// Painel Executivo (Backup 14): valor inteiro no lugar de "R$ 1,2 mi" + legenda; Processos e Indicadores em preto
trocar("    kC('Passivo Tributário Total',fS(total),fF(total),'cb','db',total)+\n    kC('RFB',fS(rfb),fF(rfb),'cb','db',rfb)+\n    kC('PGFN',fS(pgfn),fF(pgfn),'cb','db',pgfn)+\n    kC('AGE/MG',fS(age),fF(age),'cb','db',age);",
  "    kC('Passivo Tributário Total',fF(total),'RFB + PGFN + AGE/MG','cb','db',total)+\n    kC('RFB',fF(rfb),'Receita Federal','cb','db',rfb)+\n    kC('PGFN',fF(pgfn),'Procuradoria da Fazenda','cb','db',pgfn)+\n    kC('AGE/MG',fF(age),'Advocacia-Geral do Estado','cb','db',age);", 1);
trocar("    kC('Saldo Parc. Tributário',fS(_parcelResidual),fF(_parcelResidual)+' · '+fI(parcRel.length)+' ativos','ca','')+",
  "    kC('Saldo Parc. Tributário',fF(_parcelResidual),fI(parcRel.length)+' parcelamento(s) ativo(s)','ca','')+", 1);
trocar("    kC('Processos',fI(_procCnt),'ações judiciais','cb','db')+\n    kC('Passivo em Disputas',fS(procPassivo),fF(procPassivo),'cr','dr')+\n    kC('Ativo em Disputas',fS(procAtivo),fF(procAtivo),'cg','dg');",
  "    kC('Processos',fI(_procCnt),'ações judiciais','cb','')+\n    kC('Passivo em Disputas',fF(procPassivo),'cliente como réu','cr','')+\n    kC('Ativo em Disputas',fF(procAtivo),'cliente como autor','cg','');", 1);
// filtros de situação: vários ao mesmo tempo; começa só com "Ativos"; nenhum marcado = todos
trocar("let _procChipStatus='';\nfunction procToggleChip(val){\n  _procChipStatus=_procChipStatus===val?'':val;\n  _applyChip('chipProcAtivo','Ativo',_procChipStatus==='Ativo');\n  _applyChip('chipProcArquivado','Arquivado',_procChipStatus==='Arquivado');\n  _applyChip('chipProcExtinto','Extinto',_procChipStatus==='Extinto');\n  const sel=$('fProcStatus');if(sel)sel.value=_procChipStatus;\n  const btn=$('btnProcClear');if(btn)btn.style.display=_procChipStatus?'':'none';\n  renderProcTbl();\n}",
  "let _procChipStatus='';\nvar _procChips=new Set(['Ativo']);\nfunction _procPintarChips(){\n  _applyChip('chipProcAtivo','Ativo',_procChips.has('Ativo'));\n  _applyChip('chipProcArquivado','Arquivado',_procChips.has('Arquivado'));\n  _applyChip('chipProcExtinto','Extinto',_procChips.has('Extinto'));\n}\nfunction procToggleChip(val){\n  if(_procChips.has(val)) _procChips.delete(val); else _procChips.add(val);\n  _procPintarChips();\n  const btn=$('btnProcClear');if(btn)btn.style.display='';\n  renderProcTbl();\n}", 1);
trocar("function procClearFilters(){\n  _procChipStatus='';", "function procClearFilters(){\n  _procChipStatus=''; _procChips=new Set(['Ativo']); setTimeout(_procPintarChips,0);", 1);
trocar("    if(fS2){const _a=String(p.arquivamento||'').trim();const st=(_a.toLowerCase().startsWith('arq')||_a==='Arquivado')?'Arquivado':(_a==='Extinto'||_a.toLowerCase()==='extinto')?'Extinto':p.prescricao==='Prescrito'?'Prescrito':'Ativo';if(st!==fS2)return false;}",
  "    if(_procChips.size){const _a=String(p.arquivamento||'').trim();const st=(_a.toLowerCase().startsWith('arq')||_a==='Arquivado')?'Arquivado':(_a==='Extinto'||_a.toLowerCase()==='extinto'||p.prescricao==='Prescrito')?'Extinto':'Ativo';if(!_procChips.has(st))return false;}", 1);
trocar("  $('procCount').textContent='· '+fI(rows.length)+' processo(s)';", "  _procPintarChips();\n  $('procCount').textContent='· '+fI(rows.length)+' processo(s)';", 1);
trocar('        <select class="fsel" id="fProcStatus" onchange="renderProcTbl()">\n          <option value="">Todos status</option><option value="Ativo">Ativo</option>\n          <option value="Arquivado">Arq. Provisoriamente</option><option value="Extinto">Extinto</option><option value="Prescrito">Prescrito</option>\n        </select>\n', '', 1);
trocar('placeholder="Nº ou réu..." oninput="renderProcTbl()" style="max-width:150px"', 'placeholder="Buscar nº do processo, autor ou réu…" oninput="renderProcTbl()" style="min-width:260px;flex:1 1 260px"', 1);
// ═══════ Backup 13 — Parcelamentos ═══════
// sai "Parcelamentos — Visão Geral" (repetia a Situação) e "Por natureza tributária";
// "Saldo residual por empresa" fica com o gráfico E uma tabela ao lado (o escritório escolhe qual manter)
removerTrechoHtml('  <div class="ex-bn" style="margin-bottom:16px;position:relative;background:none;border:1.5px solid var(--border);box-shadow:var(--shadow-md);padding:22px 26px">\n    <div style="font-family:var(--font-d);font-size:14px;font-weight:700;color:var(--ac-gold);margin-bottom:12px;letter-spacing:.01em">◷ Parcelamentos — Visão Geral</div>',
  '      <div class="cb" style="height:250px"><canvas id="cParcNatureza"></canvas></div>\n    </div>\n  </div>\n',
  '  <div hidden aria-hidden="true"><div id="kpiParc"></div><canvas id="cParcNatureza"></canvas></div>\n' +
  '  <div class="cc">\n    <div class="cc-hd"><div><div class="cc-t">Saldo residual por empresa</div><div class="cc-d">gráfico e tabela lado a lado · 10 maiores</div></div></div>\n' +
  '    <div class="gx-graf-tab"><div class="cb" style="height:260px"><canvas id="cParcResidual"></canvas></div><div id="cParcResidualTab"></div></div>\n  </div>\n');
trocar("  mCh('cParcResidual',bCfg(iR.map(i=>emps[i].length>18?emps[i].slice(0,18)+'…':emps[i]),iR.map(i=>eR[i]),null,true));",
  "  mCh('cParcResidual',bCfg(iR.map(i=>emps[i].length>18?emps[i].slice(0,18)+'…':emps[i]),iR.map(i=>eR[i]),null,true));\n" +
  "  { const _tR=eR.reduce((s,v)=>s+v,0)||1, _t=$('cParcResidualTab');\n" +
  "    if(_t) _t.innerHTML='<table class=\"gx-leg\"><thead><tr><td>Empresa</td><td class=\"num\">Saldo residual</td><td class=\"num\">%</td></tr></thead><tbody>'+iR.map(i=>'<tr><td>'+emps[i]+'</td><td class=\"num\">'+fF(eR[i])+'</td><td class=\"num gx-leg-p\">'+(eR[i]/_tR*100).toFixed(1).replace('.',',')+'%</td></tr>').join('')+\n" +
  "      '</tbody><tfoot><tr><td>Total</td><td class=\"num\">'+fF(eR.reduce((s,v)=>s+v,0))+'</td><td class=\"num\">100%</td></tr></tfoot></table>'; }", 1);
// Situação dos parcelamentos: mesmo filtro do resto da tela (grupo + empresa juntos sumiam com o bloco)
trocar("  var lista=(DB.parcelamentos||[]).filter(function(p){\n    if(e && p.empresa!==e) return false;\n    if(g && grupoDe(p)!==g) return false;\n    return true;\n  });\n  if(!lista.length){ el.innerHTML=''; return; }",
  "  var lista=filtrarParc();\n  if(!lista.length){ el.innerHTML=exBloco('exParcSit','Situação dos parcelamentos','<div class=\"pa-ok\">Nenhum parcelamento neste recorte (grupo / empresa escolhidos).</div>'); return; }", 1);
// Progresso por parcelamento: ordenar clicando nos títulos (e só inadimplentes)
trocar('    <div class="cc-hd"><div><div class="cc-t">Progresso por parcelamento</div><div class="cc-d">Parcelas pagas / total</div></div></div>',
  '    <div class="cc-hd" style="flex-wrap:wrap;gap:8px"><div><div class="cc-t">Progresso por parcelamento</div><div class="cc-d">Parcelas pagas / total · clique num título para ordenar</div></div>' +
  '<div class="gx-ord" id="parcOrd"><button type="button" data-o="inad" onclick="parcOrdenar(\'inad\')">Inadimplência</button><button type="button" data-o="parcela" onclick="parcOrdenar(\'parcela\')">Valor da parcela</button>' +
  '<button type="button" data-o="residual" onclick="parcOrdenar(\'residual\')">Saldo residual</button><button type="button" data-o="pct" onclick="parcOrdenar(\'pct\')">% pago</button><button type="button" data-o="empresa" onclick="parcOrdenar(\'empresa\')">Empresa</button>' +
  '<label class="gx-ord-so"><input type="checkbox" id="parcSoInad" onchange="renderParcelamentos()"> só inadimplentes</label></div></div>', 1);
trocar("  const prog=$('parcProgressList');\n  prog.innerHTML=parc.map(p=>{",
  "  const prog=$('parcProgressList');\n  prog.innerHTML=_parcOrdenados(parc,allP).map(p=>{", 1);
depoisDe('function renderParcelamentos(){', '\n', '\n' +
  "  document.querySelectorAll('#parcOrd [data-o]').forEach(function(b){ b.classList.toggle('ativo',b.dataset.o===_parcOrd.col); b.dataset.dir=b.dataset.o===_parcOrd.col?(_parcOrd.asc?'▲':'▼'):''; });\n");
trocar('function renderParcelamentos(){', "var _parcOrd={col:'inad',asc:false};\n" +
  "function parcOrdenar(c){ if(_parcOrd.col===c) _parcOrd.asc=!_parcOrd.asc; else _parcOrd={col:c,asc:c==='empresa'}; renderParcelamentos(); }\n" +
  "function _parcOrdenados(parc,allP){\n" +
  "  var inad=function(p){ return allP.filter(function(a){return a.empresa===p.empresa&&a.numParc===p.numero&&a.status==='Inadimplente';}).length; };\n" +
  "  var pct=function(p){ return p.totalParcelas>0?p.parcelasPagas/p.totalParcelas:0; };\n" +
  "  var so=document.getElementById('parcSoInad'); var l=parc.filter(function(p){ return !(so&&so.checked)||inad(p)>0; });\n" +
  "  var f={inad:inad,parcela:function(p){return Number(p.valorUltimaParcela)||0;},residual:function(p){return Number(p.residual)||0;},pct:pct};\n" +
  "  return l.slice().sort(function(a,b){ var r=_parcOrd.col==='empresa'?String(a.empresa||'').localeCompare(String(b.empresa||''),'pt-BR'):(f[_parcOrd.col](a)-f[_parcOrd.col](b)); return _parcOrd.asc?r:-r; });\n" +
  "}\nfunction renderParcelamentos(){", 1);
// ═══════ Backup 13 — Acordos: "Situação dos acordos" no lugar da Visão Geral (gráficos continuam) ═══════
removerTrechoHtml('  <div class="ex-bn" style="margin-bottom:16px;position:relative;background:none;border:1.5px solid var(--border);box-shadow:var(--shadow-md);padding:22px 26px">\n    <div style="font-family:var(--font-d);font-size:14px;font-weight:700;color:var(--ac-gold);margin-bottom:12px;letter-spacing:.01em">✦ Acordos — Visão Geral</div>',
  '    <div class="kpi-grid" id="kpiAcordos"></div>\n  </div>\n',
  '  <div id="acAnalise"></div><div hidden aria-hidden="true"><div class="kpi-grid" id="kpiAcordos"></div></div>\n');
trocar("  $('kpiAcordos').innerHTML=\n", "  _acordosAnalise(ac);\n  $('kpiAcordos').innerHTML=\n", 1);
trocar('function renderAcordos(){', fs.readFileSync(path.join(__dirname, 'remendos', 'lista-grupos-b25.js'), 'utf8') + fs.readFileSync(path.join(__dirname, 'remendos', 'acordos-b16.js'), 'utf8') + 'function renderAcordos(){', 1);
trocar('function renderAcordos(){\n  const ac=filtrarAcordos();', 'function renderAcordos(){\n  const ac=_acordosPendentes(filtrarAcordos());', 1);
// sai o gráfico "Valor em atraso por devedor"; "Valor por devedor" ocupa a linha inteira
removerTrechoHtml('    <div class="cc">\n      <div class="cc-hd"><div><div class="cc-t">Valor em atraso por devedor</div>', '      <div class="cb" id="acordAtrasoBox" style="height:280px"><canvas id="cAcordAtraso"></canvas></div>\n    </div>\n', '');
trocar('  <div class="crow c2">\n    <div class="cc">\n      <div class="cc-hd"><div><div class="cc-t">Valor por devedor</div>', '  <div class="crow">\n    <div class="cc">\n      <div class="cc-hd"><div><div class="cc-t">Valor por devedor</div>', 1);
// (Backup 19: a caixa "Mostrar concluídos" de Acordos fica junto da tabela — ver remendos/acordos-b16.js)
// ═══════ Backup 13 — Financeiro Jurídico: tipo de serviço na horizontal; valor no fim das barras ═══════
trocar("    var cfgT=bCfg(it.map(function(i){return tp[i];}),it.map(function(i){return tv[i];}),null);\n    cfgT.options.animation=SEM_ANIM;",
  "    var cfgT=bCfg(it.map(function(i){return tp[i];}),it.map(function(i){return tv[i];}),null,true);\n    cfgT.options.animation=SEM_ANIM; _barrasComValor(cfgT);", 1);
trocar("    cfgG.options.animation=SEM_ANIM;\n    mCh('cFaGrupo',cfgG);", "    cfgG.options.animation=SEM_ANIM; _barrasComValor(cfgG);\n    mCh('cFaGrupo',cfgG);", 1);
trocar('function bCfg(labels,data,colors,horiz=false){', "// barras horizontais com o valor escrito no fim de cada barra (sem eixo de números)\n" +
  "function _barrasComValor(cfg){ cfg.options.gxValores=true; cfg.options.layout={padding:{right:118}}; cfg.options.scales.x.display=false; cfg.options.scales.y.grid={display:false};\n" +
  "  cfg.options.scales.y.ticks=Object.assign({},cfg.options.scales.y.ticks,{autoSkip:false,callback:function(v){var t=String(this.getLabelForValue(v)||'');return t.length>28?t.slice(0,27)+'…':t;}}); return cfg; }\n" +
  "function bCfg(labels,data,colors,horiz=false){", 1);
// Backup 14: todo gráfico de barras deitadas (uma série) ganha o valor à direita da barra (Parcelamentos e Acordos ficam como no Backup 13)
trocar("function mCh(id,cfg){dCh(id);", "function mCh(id,cfg){if(/^c(Fin|Rec|Prej|FcFech)|^cFcCaixaCat$/.test(id)){dCh(id);return;}if(id!=='cParcResidual'&&id!=='cAcordAtraso'&&cfg&&cfg.type==='bar'&&cfg.options&&cfg.options.indexAxis==='y'&&!cfg.options.gxValores&&(cfg.data.datasets||[]).length===1&&typeof _barrasComValor==='function')_barrasComValor(cfg);dCh(id);", 1);
// Resumo mensal (Contabilidade → Caixa): valores inteiros (o total aparecia como "R$ 1,2 mi")
{ const i = s.indexOf('function _fcTabelaCaixa(meses){'), j = s.indexOf('// v53: análise detalhada mês a mês', i);
  if (i < 0 || j < 0) throw new Error('_fcTabelaCaixa não encontrada');
  s = s.slice(0, i) + s.slice(i, j).split('_faFT(').join('fF(') + s.slice(j); trocas++; }
// ═══════ Backup 13 — Notificações: vira "Cobranças, avisos e recibos", aberta de dentro de cada tela ═══════
trocar('      <div class="mod-banner-t">🔔 Central de Notificações</div>\n      <div class="mod-banner-d">Gerencie quem recebe cada alerta, por qual canal e quando — regras individuais por cliente</div>',
  '      <div class="mod-banner-t">✉ Cobranças, avisos e recibos</div>\n      <div class="mod-banner-d">Monte a mensagem ao cliente (e-mail ou WhatsApp) com os itens escolhidos, ou gere o recibo · também abre pelo botão ✉ em Financeiro, Parcelamentos e Acordos</div>', 1);
trocar('    <button class="fin-tab active" onclick="notifAba(\'resumo\',this)">📖 Resumo</button>\n', '    <button class="fin-tab" hidden onclick="notifAba(\'resumo\',this)">📖 Resumo</button>\n', 1);
trocar('    <button class="fin-tab" onclick="notifAba(\'parc\',this)">📋 Parcelamento</button>\n    <button class="fin-tab" onclick="notifAba(\'hon\',this)">💰 Honorários</button>',
  '    <button class="fin-tab" data-tab="receber" data-nt="hon" onclick="notifAba(\'hon\',this)">💰 Honorários</button>\n    <button class="fin-tab" data-nt="parc" onclick="notifAba(\'parc\',this)">📋 Parcelamento</button>', 1);
trocar('    <button class="fin-tab" onclick="notifAba(\'acord\',this)">🤝 Acordos</button>\n    <button class="fin-tab" onclick="notifAba(\'rec\',this)">🧾 Recibos</button>',
  '    <button class="fin-tab" data-nt="acord" onclick="notifAba(\'acord\',this)">🤝 Acordos</button>\n    <button class="fin-tab" data-tab="recebidos" data-nt="rec" onclick="notifAba(\'rec\',this)">🧾 Recibos</button>', 1);
// ═══════ Backup 13 — envio de e-mail das Cobranças: mensagem certa depois de escolher o jeito de enviar ═══════
trocar("    toast('\\u2713 E-mail aberto no seu programa de e-mail'+(destino?' para '+destino:' (sem destinat\\u00e1rio cadastrado)')+'.');\n    return;",
  "    toast('\\u2713 '+(json.msg||'E-mail pronto'));\n    return;", 1);
trocar("  toast('\\u2717 N\\u00e3o foi poss\\u00edvel salvar o rascunho agora. Tente novamente em alguns segundos.');",
  "  if(!(json&&json.cancelado)) toast('\\u2717 N\\u00e3o foi poss\\u00edvel enviar agora. Tente novamente em alguns segundos.');", 1);
trocar("    toast('✓ E-mail aberto no seu programa de e-mail'+(dest?' para '+dest:'')+'.');", "    toast('✓ '+(json.msg||'E-mail pronto'));", 1);
// ═══════ Backup 13 — Recibo em PDF: filete dourado de verdade (a janela do PDF não tem as variáveis de cor) e valor por extenso ═══════
trocar("border-top:1.5pt solid var(--gold);padding-top:4pt", "border-top:1.5pt solid #C9A84C;padding-top:4pt", 1);
trocar("border:none;border-radius:var(--radius-xs);font-size:13px;cursor:pointer;letter-spacing:.02em;font-family:sans-serif}", "border:none;border-radius:8px;font-size:13px;cursor:pointer;letter-spacing:.02em;font-family:sans-serif}", 1);
trocar("  var valorHtml = '<strong><u>R$ '+_he(valor)+'</u></strong>';",
  "  var _ext = _valorPorExtenso(valor);\n  var valorHtml = '<strong><u>R$ '+_he(valor)+'</u></strong>'+(_ext?' ('+_he(_ext)+')':'');", 1);
trocar('function reciboPDF() {', "// R$ 4.500,00 → \"quatro mil e quinhentos reais\" (até bilhões; centavos incluídos)\n" +
  "function _valorPorExtenso(txt){\n" +
  "  var s=String(txt||'').replace(/[^\\d,.]/g,''); if(!s) return '';\n" +
  "  var n=s.indexOf(',')>=0?Number(s.replace(/\\./g,'').replace(',','.')):/^\\d{1,3}(\\.\\d{3})+$/.test(s)?Number(s.replace(/\\./g,'')):Number(s); if(!isFinite(n)||n<=0) return '';\n" +
  "  var U=['','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];\n" +
  "  var D=['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];\n" +
  "  var C=['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];\n" +
  "  var ate999=function(x){ if(x===100) return 'cem'; var p=[]; if(x>=100){p.push(C[Math.floor(x/100)]);x%=100;} if(x>=20){p.push(D[Math.floor(x/10)]);x%=10;} if(x>0)p.push(U[x]); return p.join(' e '); };\n" +
  "  var inteiro=Math.floor(n), cent=Math.round((n-inteiro)*100), partes=[], esc=[['',''],['mil','mil'],['milhão','milhões'],['bilhão','bilhões']], k=0, i=inteiro;\n" +
  "  while(i>0){ var g=i%1000; if(g){ var t=k===1&&g===1?'mil':ate999(g)+(k?' '+(g===1?esc[k][0]:esc[k][1]):''); partes.unshift({t:t,g:g,k:k}); } i=Math.floor(i/1000); k++; }\n" +
  "  var r=''; partes.forEach(function(p,ix){ if(ix===0) r=p.t; else r+=(p.g<100||p.g%100===0?' e ':', ')+p.t; });\n" +
  "  if(inteiro) r+=(inteiro>=1e6&&inteiro%1e6===0?' de':'')+(inteiro===1?' real':' reais');\n" +
  "  if(cent) r+=(inteiro?' e ':'')+ate999(cent)+(cent===1?' centavo':' centavos');\n" +
  "  return r;\n}\nfunction reciboPDF() {", 1);
// Visual moderno (Backup 12): fonte Inter (Google Fonts, gratuita) para o sistema todo
trocar("family=Playfair+Display:wght@500;600;700;800&family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap",
  "family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap", 1);
// Análise (Jurídico): "Comparativo por pessoa" vem ANTES de "Recebido por tipo de serviço" e "Maiores grupos"
(function () {
  const graf = "  + '<div class=\"crow c2\" style=\"margin-bottom:14px\">'\n" +
    "  +   '<div class=\"cc\"><div class=\"cc-hd\"><div><div class=\"cc-t\">Recebido por tipo de serviço</div>'\n" +
    "  +     '<div class=\"cc-d\">consultoria, fixo, êxito…</div></div></div>'\n" +
    "  +     '<div class=\"cb\" style=\"height:240px\"><canvas id=\"cFaTipo\"></canvas></div></div>'\n" +
    "  +   '<div class=\"cc\"><div class=\"cc-hd\"><div><div class=\"cc-t\">Maiores grupos</div>'\n" +
    "  +     '<div class=\"cc-d\">10 primeiros por valor recebido</div></div></div>'\n" +
    "  +     '<div class=\"cb\" style=\"height:240px\"><canvas id=\"cFaGrupo\"></canvas></div></div>'\n" +
    "  + '</div>'\n";
  const pessoas = "  + '<div class=\"cc\" style=\"margin-bottom:14px\"><div class=\"cc-hd\"><div><div class=\"cc-t\">Comparativo por pessoa</div>'\n" +
    "  +   '<div class=\"cc-d\">mesmo período e mesmos recortes acima</div></div></div>'\n" +
    "  +   _faTabelaPessoas(_faPessoas()) + '</div>'\n";
  trocar(graf + pessoas, pessoas + graf, 1);
})();
// Backup 15 — "Recebido por tipo de serviço" = ÁREA do serviço (tributário, imobiliário, empresarial, sucessões, família,
// criminal, trabalhista, contratual, cobrança, consultoria). A consultoria mensal segue como regra de recorrência, fora do gráfico.
trocar("    var tp=[...new Set(receita.map(function(f){return f.tipo||'—';}))];\n    var tv=tp.map(function(t){return receita.filter(function(f){return (f.tipo||'—')===t;}).reduce(function(s,f){return s+_faVal(f);},0);});",
  "    var tp=[...new Set(receita.map(function(f){return f.servico||'Não informado';}))];\n    var tv=tp.map(function(t){return receita.filter(function(f){return (f.servico||'Não informado')===t;}).reduce(function(s,f){return s+_faVal(f);},0);});", 1);
trocar("  +     '<div class=\"cc-d\">consultoria, fixo, êxito…</div></div></div>'", "  +     '<div class=\"cc-d\">área: tributário, imobiliário, empresarial, família…</div></div></div>'", 1);
// "Em atraso" (Análise do Jurídico): sem a coluna Referência (o texto longo, ex.: "0,7 salário - consultoria"); fica o tipo
{ const i = s.indexOf('function _faTabelaDetalhe(rows){'), j = s.indexOf('\n}\n', i);
  if (i < 0 || j < 0) throw new Error('_faTabelaDetalhe não encontrada');
  let f = s.slice(i, j);
  const f0 = f;
  f = f.replace("+'<th>Tipo</th><th>Referência</th>'", "+'<th>Tipo</th>'")
       .replace("        +'<td style=\"max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\" title=\"'+esc(f.referencia||'')+'\">'+esc(f.referencia||'—')+'</td>'\n", '')
       .replace("colspan=\"8\"", "colspan=\"7\"")
       .replace("+'<td>'+esc(f.tipo||'—')+'</td>'", "+'<td>'+esc(f.tipo||'—')+_legLanc(f)+'</td>'");
  if (f === f0 || /Referência/.test(f)) throw new Error('_faTabelaDetalhe: troca não aplicada');
  s = s.slice(0, i) + "// legenda (Backup 16): 2ª linha = área do serviço — contrato (sem contrato, só a área)\nfunction _legLanc(f){ var p=[f.servico,f.contrato].filter(Boolean); return p.length?'<div style=\"font-size:11.5px;color:var(--text3);margin-top:2px\">'+esc(p.join(' — '))+'</div>':''; }\n" + f + s.slice(j); trocas++; }
// Análise (Jurídico): sem a lista de lançamentos (os lançamentos já estão em A Receber / Recebidos)
trocar("  + '<div id=\"faCorpo\"></div>'\n  + '<div class=\"cc\"><div class=\"cc-hd\" style=\"align-items:center\"><div><div class=\"cc-t\">Lançamentos</div>'\n  +   '<div class=\"cc-d\">os filtros do topo já valem para esta lista · clique no cabeçalho para ordenar</div></div>'\n  +   '<span class=\"fa-dica\" id=\"faLqCount\"></span></div>'\n  +   '<div id=\"faLancTbl\"></div></div>';",
  "  + '<div id=\"faCorpo\"></div>';", 1);
// Análise (Contabilidade): igual ao Jurídico — sem "Maiores clientes", sem a lista de lançamentos, "Em atraso" no fim
trocar("  + '<div id=\"fcCorpo\"></div>'\n  + '<div class=\"cc\"><div class=\"cc-hd\" style=\"align-items:center\"><div><div class=\"cc-t\">Lançamentos</div>'\n  +   '<div class=\"cc-d\">os filtros do topo já valem para esta lista · clique no cabeçalho para ordenar</div></div>'\n  +   '<span class=\"fa-dica\" id=\"fcLqCount\"></span></div>'\n  +   '<div id=\"fcLancTbl\"></div></div>';",
  "  + '<div id=\"fcCorpo\"></div>';", 1);
trocar("  + '<div class=\"cc\" style=\"margin-bottom:14px\"><div class=\"cc-hd\"><div><div class=\"cc-t\">Maiores '+esc(L.tituloQuem.toLowerCase())+'s</div>'\n  +   '<div class=\"cc-d\">10 primeiros por valor</div></div></div>'\n  +   '<div class=\"cb\" style=\"height:240px\"><canvas id=\"cFcQuem\"></canvas></div></div>'",
  "  + '<div hidden aria-hidden=\"true\"><canvas id=\"cFcQuem\"></canvas></div>'", 1);
trocar("  +   _fcTabelaPessoas(_fcPessoas()) + '</div>';",
  "  +   _fcTabelaPessoas(_fcPessoas()) + '</div>'\n" +
  "  + (vencidos.length?'<div class=\"cc\" style=\"margin-bottom:14px\"><div class=\"cc-hd\"><div><div class=\"cc-t\">⚠ Em atraso</div><div class=\"cc-d\">todos os meses · mesmos recortes</div></div></div>'+_fcTabelaDetalhe(vencidos)+'</div>':'');", 1);

// 7. Acordos e parcelamentos são dívidas do CLIENTE com terceiros; honorários são o financeiro
//    do ESCRITÓRIO. Nunca na mesma lista: _getVencRows ganha o escopo ('financeiro' | 'cliente').
trocar('function _getVencRows(dias){',
  "function _getVencRows(dias,escopo){\n  var _r=_getVencRowsTodos(dias);\n  if(!escopo) return _r;\n" +
  "  return _r.filter(function(r){ return escopo==='financeiro' ? r.tipo==='Honorário' : r.tipo!=='Honorário'; });\n}\n" +
  'function _getVencRowsTodos(dias){', 1);
trocar('_getVencRows(7)', "_getVencRows(7,'cliente')", 2);
trocar('_getVencRows(30)', "_getVencRows(30,'cliente')", 2);
trocar("kC('Acordos c/ Terceiros a Pagar',", "kC('Acordos dos clientes c/ terceiros',", 1);
// 8. Design: um só jeito de escrever dinheiro (R$ colado ao número por espaço que não quebra),
//    formato curto único "R$ 1,85 mi" / "R$ 691 mil", títulos de seção padronizados.
trocar("const fS = v => { v=Number(v)||0; if(v>=1e6)return'R$'+(v/1e6).toFixed(1).replace('.',',')+'M'; if(v>=1e3)return'R$'+(v/1e3).toFixed(0)+'k'; return'R$'+v.toFixed(0); };",
  "const fS = v => _moedaCurta(v);\n" +
  "function _moedaCurta(v){ v=Number(v)||0; var neg=v<0, a=Math.abs(v), t;\n" +
  "  if(a>=1e6) t=(a/1e6).toLocaleString('pt-BR',{maximumFractionDigits:2})+'\\u00A0mi';\n" +
  "  else if(a>=1e4) t=Math.round(a/1e3).toLocaleString('pt-BR')+'\\u00A0mil';\n" +
  "  else t=a.toLocaleString('pt-BR',{maximumFractionDigits:0});\n" +
  "  return (neg?'−':'')+'R$\\u00A0'+t; }", 1);
trocar("const fF = v => 'R$ '+(Number(v)||0)", "const fF = v => 'R$\\u00A0'+(Number(v)||0)", 1);
trocar("  if(a>=1e6) t='R$ '+(a/1e6).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' mi';\n  else       t='R$ '+a.toLocaleString('pt-BR',{maximumFractionDigits:0});\n  return (neg?'−':'')+t;",
  "  return _moedaCurta(neg?-a:a);", 1);
trocar("callback:v=>{const n=Number(v)||0;if(n>=1e6)return'R$'+(n/1e6).toFixed(1)+'M';if(n>=1e3)return'R$'+(n/1e3).toFixed(0)+'k';return'R$'+n.toFixed(0);}", "callback:v=>_moedaCurta(v)", 1);
s = s.replace(/'R\$ ?'\+/g, () => { trocas++; return "'R$\\u00A0'+"; });
trocar('style="font-family:var(--font-d);font-size:14px;font-weight:700;color:var(--ac-gold);margin-bottom:12px;letter-spacing:.01em"', 'class="gx-sec-tit"');

// 9. CRM antigo (da planilha, sem tela desde a v41): saem os estilos e a janela de histórico do lead.
//    O CRM novo é outro módulo (telas-crm.js), com classes próprias "cr-".
function removerBloco(inicio, fim) {
  const i = s.indexOf(inicio); if (i < 0 || s.indexOf(inicio, i + 1) >= 0) throw new Error('Bloco ausente ou repetido: ' + inicio);
  const j = s.indexOf(fim, i); if (j < 0) throw new Error('Fim do bloco ausente: ' + fim);
  s = s.slice(0, i) + s.slice(j + fim.length); trocas++;
}
removerBloco('.crm-funnel{display:grid', '.crm-tl-nota-input:focus{border-color:var(--gold);outline:none;background:var(--white)}\n');
removerBloco('/* ── CRM v2', '.crm-base-item:last-child{border-bottom:none}\n');
{ const k = s.indexOf('MODAL — TIMELINE / HISTÓRICO DO LEAD'); const i = s.lastIndexOf('<!--', k);
  const j = s.indexOf('</div>\n</div>\n', s.indexOf('<div class="m-overlay" id="mo-crm-timeline">'));
  if (k < 0 || i < 0 || j < 0) throw new Error('Janela do CRM antigo não encontrada');
  s = s.slice(0, i) + s.slice(j + '</div>\n</div>\n'.length); trocas++; }

// ═══════ Backup 19 — Painel: "Empresas do grupo" ordenada por grupo (dentro do grupo, maior passivo primeiro) ═══════
trocar("let _execRankSort={col:'total',asc:false};", "let _execRankSort={col:'grupo',asc:true};", 1);
trocar("    if(_execRankSort.col==='grupo')return v*(a.grupo||'').localeCompare(b.grupo||'','pt-BR');",
  "    if(_execRankSort.col==='grupo')return (!a.grupo-!b.grupo)||v*(a.grupo||'').localeCompare(b.grupo||'','pt-BR')||(trib(b)-trib(a));", 1);
// 10. CAPAG "Omisso" com selo vermelho (antes caía em texto cinza)
trocar("    if(m[v])return`<span class=\"capag ${m[v]}\">${v}</span>`;\n    return`<span style=\"font-size:10px;color:var(--text3)\">${v}</span>`;",
  "    if(m[v])return`<span class=\"capag ${m[v]}\">${v}</span>`;\n    if(/omisso/i.test(v))return`<span class=\"capag capag-O\">Omisso</span>`;\n    return`<span style=\"font-size:10px;color:var(--text3)\">${v}</span>`;", 1);
trocar("    [/omisso|—|^$/,'#F3F4F6','var(--gray)','#E5E7EB']", "    [/omisso/i,'#DC2626','#FFFFFF','#B91C1C'],\n    [/—|^$/,'#F3F4F6','var(--gray)','#E5E7EB']", 1);

// 11. Painel Executivo: passivo por grupo em barras horizontais com o valor na frente (como no Gestão)
//     e a legenda da rosca à direita, com % e valor.
trocar("  mCh('cResGrupos',bCfg(labGr,valGr,null,isHoriz));",
  "  { const _n=Math.min(labGr.length,15), _cfg=bCfg(labGr.slice(0,_n),valGr.slice(0,_n),null,true);\n" +
  "    _cfg.options.gxValores=true; _cfg.options.layout={padding:{right:118}};\n" +
  "    _cfg.options.scales.x.display=false; _cfg.options.scales.y.grid={display:false}; _cfg.options.scales.y.ticks=Object.assign({},_cfg.options.scales.y.ticks,{autoSkip:false,callback:function(v){var t=String(this.getLabelForValue(v)||'');return t.length>30?t.slice(0,29)+'…':t;}});\n" +
  "    const _box=$('cResGrupos').parentElement; if(_box) _box.style.height=Math.max(150,_n*30+30)+'px';\n" +
  "    const _d=$('resGrupoTitle').nextElementSibling; if(_d) _d.textContent='Soma de todos os órgãos tributários'+(labGr.length>15?' · 15 maiores de '+labGr.length:'');\n" +
  "    mCh('cResGrupos',_cfg); }", 1);
trocar("      plugins:{legend:{display:true,position:'bottom',labels:{color:'#4B5563',font:{size:11},padding:14,boxWidth:10,usePointStyle:true,pointStyle:'circle'}},",
  "      plugins:{legend:{display:true,position:window.innerWidth>760?'right':'bottom',labels:{color:'#1F2937',font:{size:12},padding:12,boxWidth:10,usePointStyle:true,pointStyle:'circle',\n" +
  "        generateLabels:function(ch){var tot=data.reduce(function(a,b){return a+(Number(b)||0);},0)||1;\n" +
  "          return Chart.overrides.doughnut.plugins.legend.labels.generateLabels(ch).map(function(it){var v=Number(data[it.index])||0;\n" +
  "            it.text=it.text+'  '+(v/tot*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%  ·  '+fS(v);return it;});}}},", 1);

// 12. "Demanda" passa a se chamar "Serviço pontual" na tela (o valor gravado continua o mesmo)
trocar('<option value="Demanda">Demanda</option>', '<option value="Demanda">Serviço pontual</option>', 1);

s = s.replace(/<title>[^<]*<\/title>/, '<title>ERP — Araújo &amp; Castro</title>');
// 16. Contraste AA (caca-bugs.js): cores de pessoa/grupo sem cor própria ficam legíveis sobre o fundo claro
trocar("var _FA_NEUTRAS=['#1B2A4A','#7C3AED','#0D9488','#DC2626','#0EA5E9','#6B7280'];",
  "var _FA_NEUTRAS=['#1B2A4A','#6D28D9','#0F766E','#B91C1C','#0369A1','#4B5563'];", 1);

// 14. Imagens: saem do HTML (eram base64) e viram arquivos em img/, guardados pelo navegador.
{
  const IMG = path.join(raiz, 'sistema', 'app', 'img'); fs.mkdirSync(IMG, { recursive: true });
  const salvar = (nome, b64) => { const buf = Buffer.from(b64, 'base64'); fs.writeFileSync(path.join(IMG, nome), buf);
    return 'img/' + nome + '?v=' + require('crypto').createHash('sha1').update(buf).digest('hex').slice(0, 8); };
  const logo = s.match(/(<div class="ac-login-logo"[^>]*>\s*<img src=")data:image\/png;base64,([A-Za-z0-9+/=]+)"/);
  if (!logo) throw new Error('logo do login não encontrada');
  s = s.replace(logo[0], logo[1] + salvar('logo-login.png', logo[2]) + '"'); trocas++;
  const rec = s.match(/var RECIBO_HEADER_B64 = "([A-Za-z0-9+/=]+)";/);
  if (!rec) throw new Error('cabeçalho do recibo não encontrado');
  // o recibo abre em janela nova (about:blank): o endereço precisa ser completo
  s = s.replace(rec[0], "var RECIBO_HEADER_URL = new URL('" + salvar('recibo-cabecalho.png', rec[1]) + "', location.href).href;"); trocas++;
  trocar(`'<div class="rh"><img src="data:image/png;base64,'+RECIBO_HEADER_B64+'"></div>'`, `'<div class="rh"><img src="'+RECIBO_HEADER_URL+'"></div>'`, 1);
}

// ═══════ Backup 19 — Parcelamentos no modelo de Acordos ═══════
trocar('function filtrarParc(){\n  const seen=new Set();', 'function _filtrarParcBase(){\n  const seen=new Set();', 1);
trocar('function renderParcelamentos(){', fs.readFileSync(path.join(__dirname, 'remendos', 'parcelamentos-b19.js'), 'utf8') +
  "// concluídos ocultos (caixa \"Mostrar concluídos\" junto da tabela)\nfunction filtrarParc(){ var l=_filtrarParcBase(); return _parcTodos?l:l.filter(function(p){ return !_parcConcluido(p); }); }\n" +
  'function renderParcelamentos(){', 1);
// Progresso por parcelamento: clicar abre as parcelas (como em Acordos)
trocar("    const acento2=inadN>0?'var(--red)':pct2>=80?'var(--green-d)':pct2>=50?'var(--amber)':'var(--blue)';\n    return`<div class=\"pc-item\" style=\"border-left:4px solid ${acento2}\">",
  "    const acento2=inadN>0?'var(--red)':pct2>=80?'var(--green-d)':pct2>=50?'var(--amber)':'var(--blue)';\n    const _k=_parcChave(p), _ab=!!_parcAbertos[_k];\n" +
  "    return`<div class=\"pc-item${_ab?' pc-aberto':''}\" role=\"button\" tabindex=\"0\" aria-expanded=\"${_ab}\" title=\"Clique para ver as parcelas\" data-k=\"${esc(_k)}\" onclick=\"_parcToggle(this.dataset.k)\" onkeydown=\"if(event.key==='Enter')_parcToggle(this.dataset.k)\" style=\"border-left:4px solid ${acento2}\">", 1);
trocar("      </div>\n    </div>`;\n  }).join('');\n\n  renderParcVencTbl();",
  "      </div>\n      ${_ab?'<div onclick=\"event.stopPropagation()\">'+_parcDetalhe(p)+'</div>':''}\n    </div>`;\n  }).join('');\n\n  renderParcVencTbl();", 1);
// tabelas: "Status" vira dias (Atraso nos vencidos; Dias nos a vencer), como em Acordos
trocar('          <th class="s" onclick="sortParcVenc(4)">Vencimento</th>\n          <th>Status</th>', '          <th class="s" onclick="sortParcVenc(4)">Vencimento</th>\n          <th>Atraso</th>', 1);
trocar('          <th class="s" onclick="sortParc(4)">Vencimento</th>\n          <th>Status</th>', '          <th class="s" onclick="sortParc(4)">Vencimento</th>\n          <th>Dias</th>', 1);
trocar("    <td><span class=\"tag ${sC[p.status]||'tx'} ${p.status==='Inadimplente'?'tpls':''}\" style=\"${p.status==='Inadimplente'?'border-left:3px solid var(--red);':''}\">${p.status||'—'}</span></td>\n  </tr>`).join(''):`<tr><td colspan=\"8\">${emp()}</td></tr>`;",
  "    <td class=\"mono\">${_parcDias(p.vencimento)}</td>\n  </tr>`).join(''):`<tr><td colspan=\"8\">${emp()}</td></tr>`;", 1);
trocar("    <td><span class=\"tag tr tpls\" style=\"border-left:3px solid var(--red)\">Inadimplente</span></td>\n  </tr>`).join(''):`<tr><td colspan=\"8\">${emp('Nenhuma parcela vencida — tudo em dia! ✅')}</td></tr>`;",
  "    <td class=\"mono\">${_parcDias(p.vencimento)}</td>\n  </tr>`).join(''):`<tr><td colspan=\"8\">${emp('Nenhuma parcela vencida — tudo em dia! ✅')}</td></tr>`;", 1);
// ═══════ Backup 19 — Acordos: sai a coluna "Situação" (Vencido) dos vencidos — o "Atraso" em dias já diz ═══════
trocar('          <th>Atraso</th><th>Situação</th>\n        </tr></thead><tbody id="tblAcordosVencBody">', '          <th>Atraso</th>\n        </tr></thead><tbody id="tblAcordosVencBody">', 1);
trocar("      <td class=\"mono\" style=\"font-weight:700;color:var(--red)\">${dias===0?'Hoje':dias+' d atraso'}</td>\n      <td><span class=\"tag tr tpls\" style=\"border-left:3px solid var(--red)\">${a.situacao||'Vencido'}</span></td>\n",
  "      <td class=\"mono\" style=\"font-weight:700;color:var(--red-d)\">${dias===0?'Hoje':dias+' d atraso'}</td>\n", 1);
trocar("`<tr><td colspan=\"8\">${emp('Nenhum acordo vencido — tudo em dia! ✅')}</td></tr>`", "`<tr><td colspan=\"7\">${emp('Nenhum acordo vencido — tudo em dia! ✅')}</td></tr>`", 1);
// ═══════ Backup 19 — Financeiro ═══════
// "Comparativo por pessoa" com linha de Total
trocar("     }).join('') : '<tr><td colspan=\"'+nCols+'\" class=\"vazio\">Nada no período.</td></tr>')\n   + '</tbody></table></div>';",
  "     }).join('') : '<tr><td colspan=\"'+nCols+'\" class=\"vazio\">Nada no período.</td></tr>')\n   + '</tbody>'\n" +
  "   + (linhas.length? (function(){ var sR=0,sN=0,sA=0,sP=0; linhas.forEach(function(l){ sR+=l.rec; sN+=l.n; sA+=l.ar; sP+=l.pj; });\n" +
  "       return '<tfoot><tr><td>Total</td><td class=\"mono\" style=\"text-align:right\">'+_faFT(sR)+'</td><td class=\"mono\" style=\"text-align:right\">100%</td>'\n" +
  "        +'<td class=\"mono\" style=\"text-align:right\">'+sN+'</td><td class=\"mono\" style=\"text-align:right\">'+_faFT(sN?sR/sN:0)+'</td>'\n" +
  "        +'<td class=\"mono\" style=\"text-align:right\">'+(sA?_faFT(sA):'—')+'</td>'+(cliente?'':'<td class=\"mono\" style=\"text-align:right\">'+(sP?_faFT(sP):'—')+'</td>')+'</tr></tfoot>'; })() : '')\n" +
  "   + '</table></div>';", 1);
// "Em atraso" (Análise do Jurídico) como os vencidos de Acordos: … valor, vencimento e atraso em dias
trocar("+_faTabelaDetalhe(vencidos.slice().sort(function(a,b){return (pDate(a.vencimento)||0)-(pDate(b.vencimento)||0);}))+", "+_faTabelaAtraso(vencidos.slice().sort(function(a,b){return (pDate(a.vencimento)||0)-(pDate(b.vencimento)||0);}))+", 1);
trocar('function _faTabelaPessoas(pessoas){', "function _faTabelaAtraso(rows){\n" +
  "  var h=new Date(); h.setHours(0,0,0,0);\n" +
  "  return '<div class=\"tw scr\"><table><thead><tr><th>Quem</th><th>Grupo</th><th>Descrição</th><th style=\"text-align:right\">Valor</th><th>Vencimento</th><th>Atraso</th></tr></thead><tbody>'\n" +
  "   + rows.slice(0,400).map(function(f){ var d=pDate(f.vencimento), n=d?Math.floor((h-d)/864e5):0;\n" +
  "       var q=_faQuem(f); return '<tr data-gx=\"'+_gx(f)+'\"><td>'+(q&&q!=='—'?_faSelo(q):'<span style=\"color:var(--text3)\">—</span>')+'</td><td>'+esc(f.grupo||'—')+'</td><td>'+esc(f.descricao||f.tipo||'—')+_legLanc(f)+'</td>'\n" +
  "        +'<td class=\"mono\" style=\"text-align:right;font-weight:600\">'+_faFT(_faVal(f))+'</td>'\n" +
  "        +'<td class=\"mono\" style=\"color:var(--red-d);font-weight:600\">'+(d?d.toLocaleDateString('pt-BR'):'—')+'</td>'\n" +
  "        +'<td class=\"mono\" style=\"font-weight:700;color:var(--red-d)\">'+(n<=0?'Hoje':n+' d atraso')+'</td></tr>'; }).join('')\n" +
  "   + '</tbody></table></div>';\n}\nfunction _faTabelaPessoas(pessoas){", 1);
// ═══════ Backup 20 ═══════
// filtros de Processos (Ativos · Arquivados · Extintos) no desenho de Clientes: o escolhido ganha a classe "on"
trocar("function _applyChip(elId,val,active){\n  const el=$(elId);if(!el)return;", "function _applyChip(elId,val,active){\n  const el=$(elId);if(!el)return; el.classList.toggle('on',!!active);", 1);
// Acordos: "Saldo por devedor" vira uma lista enxuta (devedor · barra · valor · %) no lugar do gráfico gigante
trocar('      <div class="cc-hd"><div><div class="cc-t">Valor por devedor</div><div class="cc-d">parcelas em aberto</div></div></div>\n      <div class="cb" style="height:280px"><canvas id="cAcordDevedor"></canvas></div>',
  '      <div class="cc-hd"><div><div class="cc-t">Saldo por devedor</div><div class="cc-d">quanto cada devedor ainda deve · 10 maiores</div></div></div>\n      <div id="acDevedorLista"></div><div hidden aria-hidden="true"><canvas id="cAcordDevedor"></canvas></div>', 1);
trocar("  mCh('cAcordDevedor',bCfg(iD.map(i=>devs[i].length>20?devs[i].slice(0,20)+'…':devs[i]),iD.map(i=>dV[i]),null,false));",
  "  _acSaldoDevedor(acAP);", 1);
// Backup 21: sai o "Progresso por acordo" (a lista "Acordos em andamento" já mostra o progresso de cada um)
trocar('  <div class="cc">\n    <div class="cc-hd"><div><div class="cc-t">Progresso por Acordo</div><div class="cc-d">Parcelas pagas / total · Devedor → Credor</div></div></div>\n    <div id="acordProgressList" style="display:flex;flex-direction:column;gap:10px"></div>\n  </div>\n', '<div hidden aria-hidden="true"><div id="acordProgressList"></div></div>\n', 1);
// Backup 21: Acordos → A Pagar sem "Situação"; dias até o vencimento com cor (≥10 verde · <10 azul · <3 amarelo);
// o dia do vencimento já conta como vencido (vai para "Vencidos")
trocar("    if(dv&&dv<hojeAc)return false;\n    if(ap!=='todos'){", "    if(dv&&dv<=hojeAc)return false;\n    if(ap!=='todos'){", 1);
trocar('          <th>Dias</th><th>Situação</th>\n        </tr></thead><tbody id="tblAcordosBody">', '          <th>Dias</th>\n        </tr></thead><tbody id="tblAcordosBody">', 1);
trocar(`      <td class="mono" style="font-size:11px;font-weight:600;color:\${dias<0?'var(--red-d)':dias<=7?'var(--amber)':'var(--text3)'}">\${dias<0?Math.abs(dias)+' d atraso':dias+' d'}</td>
      <td><span class="tag \${(sC[a.situacao]||'tx')+puls}" style="\${a.situacao==='Vencido'?'border-left:3px solid var(--red);':''}">\${a.situacao||'—'}</span></td>`,
  `      <td class="mono"><span class="\${_diasCls(dias)}">\${dias<=0?'vencida':'em '+dias+' d'}</span></td>`, 1);
trocar('`<tr><td colspan="8">${emp()}</td></tr>`;\n}\nfunction sortAcordos(c){', '`<tr><td colspan="7">${emp()}</td></tr>`;\n}\nfunction sortAcordos(c){', 1);
trocar(`        <select class="fsel" id="fAcordSit"   onchange="renderAcordosTbl()">
          <option value="">Todas situações</option>
          <option value="Emitir Guia">Emitir Guia</option>
          <option value="OK">A Vencer (OK)</option>
        </select>\n`, '', 1);
// fontes da tabela de vencidos iguais às demais
trocar(`      <td style="font-size:11px">\${a.devedor||'—'}</td>
      <td style="font-size:11px">\${a.credor||'—'}</td>`, `      <td>\${a.devedor||'—'}</td>
      <td>\${a.credor||'—'}</td>`, 1);
// Backup 21: Processos — grupo em texto simples (como em Clientes) e sem o botão "✕ Limpar" dos filtros
trocar('      <td><span class="tag tn">${p.grupo||\'—\'}</span></td>', '      <td class="gx-grupo-txt">${p.grupo||\'—\'}</td>', 1);
trocar('<button class="btn-clear" id="btnProcClear" onclick="procClearFilters()" style="display:none">✕ Limpar</button>', '<button class="btn-clear" id="btnProcClear" onclick="procClearFilters()" style="display:none" hidden>✕ Limpar</button>', 1);
// Backup 21: filtros de período sem as bolinhas coloridas (🔴 7 dias, 🟠 15 dias…) — o escolhido fica azul, como em Clientes
[['>🔴 7 dias<', '>7 dias<'], ['>🟠 15 dias<', '>15 dias<'], ['>🟡 30 dias<', '>30 dias<'], ['>🔵 60 dias<', '>60 dias<'], ['>🟢 Todos<', '>Todos<'],
 ['>🟢 7 dias<', '>7 dias<'], ['>🟢 15 dias<', '>15 dias<'], ['>🟢 30 dias<', '>30 dias<'], ['>🟢 60 dias<', '>60 dias<'], ['>⚠ Vencidos<', '>Vencidos<'],
 ['— Mês/Ano —', 'Mês/ano']].forEach(([de, para]) => { const n = s.split(de).length - 1; if (!n) throw new Error('Filtro não encontrado: ' + de); s = s.split(de).join(para); });
// Backup 21: situação dos processos sem ícone (o escolhido fica azul, como os filtros de Clientes)
trocar(`onclick="procToggleChip('Ativo')">⚖ Ativos</span>`, `onclick="procToggleChip('Ativo')">Ativos</span>`, 1);
trocar(`onclick="procToggleChip('Arquivado')">📁 Arq. Provisoriamente</span>`, `onclick="procToggleChip('Arquivado')">Arquivados provisoriamente</span>`, 1);
trocar(`onclick="procToggleChip('Extinto')">⚫ Extintos</span>`, `onclick="procToggleChip('Extinto')">Extintos</span>`, 1);
// Backup 22: "Saldo por devedor" na metade esquerda; "Vencimentos dos próximos 30 dias" na direita
trocar('  <div class="crow">\n    <div class="cc">\n      <div class="cc-hd"><div><div class="cc-t">Saldo por devedor</div>', '  <div class="crow c2 ac-saldo-linha" hidden aria-hidden="true" style="display:none">\n    <div class="cc">\n      <div class="cc-hd"><div><div class="cc-t">Saldo por devedor</div>', 1);   // Backup 23: saíram (a pedido)
trocar('<div id="acDevedorLista"></div><div hidden aria-hidden="true"><canvas id="cAcordDevedor"></canvas></div>\n    </div>\n  </div>',
  '<div id="acDevedorLista"></div><div hidden aria-hidden="true"><canvas id="cAcordDevedor"></canvas></div>\n    </div>\n' +
  '    <div class="cc">\n      <div class="cc-hd"><div><div class="cc-t">Vencimentos dos próximos 30 dias</div><div class="cc-d">parcelas em aberto, por data</div></div></div>\n      <div id="acProx30"></div>\n    </div>\n  </div>', 1);
// Backup 22: Parcelamentos — sai o "Saldo residual por empresa" (gráfico + tabela) e o "Progresso por parcelamento"
// (a nova lista "Parcelamentos em andamento", na Situação, mostra o progresso e as parcelas de cada um)
trocar('  <div class="cc">\n    <div class="cc-hd"><div><div class="cc-t">Saldo residual por empresa</div><div class="cc-d">gráfico e tabela lado a lado · 10 maiores</div></div></div>\n    <div class="gx-graf-tab"><div class="cb" style="height:260px"><canvas id="cParcResidual"></canvas></div><div id="cParcResidualTab"></div></div>\n  </div>\n', '', 1);
trocar('  <div class="cc">\n    <div class="cc-hd" style="flex-wrap:wrap;gap:8px"><div><div class="cc-t">Progresso por parcelamento</div>', '  <div class="cc" hidden aria-hidden="true">\n    <div class="cc-hd" style="flex-wrap:wrap;gap:8px"><div><div class="cc-t">Progresso por parcelamento</div>', 1);
// Backup 22: Painel → Empresas do grupo com o valor completo ("R$ 12.000,00"), como em todas as tabelas (o "18k neg." continua curto)
trocar("const cellRfb =rfbTot >0?`${fT(r.rfb||0)}", "const cellRfb =rfbTot >0?`${fF(r.rfb||0)}", 1);
trocar("const cellPgfn=pgfnTot>0?`${fT(r.pgfn||0)}", "const cellPgfn=pgfnTot>0?`${fF(r.pgfn||0)}", 1);
trocar("const cellAge =ageTot >0?`${fT(r.ageMG||0)}", "const cellAge =ageTot >0?`${fF(r.ageMG||0)}", 1);
trocar("<td class=\"mono\">${totVal>0?`<strong>${fT(totVal)}</strong>`", "<td class=\"mono\">${totVal>0?`<strong>${fF(totVal)}</strong>`", 1);
// Backup 23: Painel — a rosca "Distribuição por órgão" e o gráfico por órgão de uma empresa passam a somar também o NEGOCIADO
// (como o KPI "Passivo tributário total" e o gráfico por grupo); antes somavam só o em aberto e os totais não batiam.
trocar("    valGr=ORGAOS_TRIB.map(k=>Number(row?row[k]:0)||0);", "    valGr=ORGAOS_TRIB.map(k=>_orgV(row,k));", 1);
trocar("    _donutComLegenda('cResDonut',dCfg(ORGAOS_TRIB.map(k=>ORGAO_NOME[k]),ORGAOS_TRIB.map(k=>Number(rowEmp?rowEmp[k]:0)||0),ORGAO_CORES));",
  "    _donutComLegenda('cResDonut',dCfg(ORGAOS_TRIB.map(k=>ORGAO_NOME[k]),ORGAOS_TRIB.map(k=>_orgV(rowEmp,k)),ORGAO_CORES));", 1);
trocar("    const sumPJk=k=>data.filter(r=>r.isPJ!==false).reduce((s,r)=>s+(Number(r[k])||0),0);", "    const sumPJk=k=>data.filter(r=>r.isPJ!==false).reduce((s,r)=>s+_orgV(r,k),0);", 1);
trocar("const tribAll = r =>", "const _orgV=(r,k)=>r?(Number(r[k])||0)+(Number(r[k+'Neg'])||0):0;   // órgão = em aberto + negociado (Backup 23)\nconst tribAll = r =>", 1);
trocar('<div class="cc-d">% do passivo total (excl. CEAT)</div>', '<div class="cc-d">% do passivo total · em aberto + negociado (sem CEAT)</div>', 1);
// Backup 23: nomes compridos no gráfico "Passivo total por grupo / por empresa" quebram em até 3 linhas (não são mais cortados)
trocar("    labGr=idx.map(i=>emps[i].length>22?emps[i].slice(0,22)+'…':emps[i]);", "    labGr=idx.map(i=>emps[i]);", 1);
trocar("callback:function(v){var t=String(this.getLabelForValue(v)||'');return t.length>30?t.slice(0,29)+'…':t;}});\n    const _box=$('cResGrupos').parentElement; if(_box) _box.style.height=Math.max(150,_n*30+30)+'px';",
  "callback:function(v){return _quebraRotulo(this.getLabelForValue(v),24,3);}});\n    const _linhas=labGr.slice(0,_n).reduce((s,t)=>s+Math.max(1,_quebraRotulo(t,24,3).length),0);\n    const _box=$('cResGrupos').parentElement; if(_box) _box.style.height=Math.max(150,_n*22+_linhas*14+30)+'px';", 1);
trocar("function pDate(v){", "// rótulo de gráfico em várias linhas (palavras inteiras), sem cortar o nome\nfunction _quebraRotulo(t,max,lin){ t=String(t||''); var w=t.split(/\\s+/), L=[], c=''; w.forEach(function(p){ if((c+' '+p).trim().length>max&&c){ L.push(c); c=p; } else c=(c+' '+p).trim(); }); if(c) L.push(c);\n  if(L.length>lin){ L=L.slice(0,lin); L[lin-1]=L[lin-1].replace(/.{0,1}$/,'…'); } return L.length>1?L:(L[0]||''); }\nfunction pDate(v){", 1);
// Backup 23: selo colorido só para as PESSOAS do escritório (Pedro, Emanuelle, Escritório…); nome de cliente, fornecedor ou grupo
// sai em texto normal e inteiro (no Comparativo por cliente/fornecedor da Contabilidade o nome ficava cortado dentro do selo)
trocar("<td>'+_faSelo(f.grupo||'—')+'</td>", "<td>'+esc(f.grupo||'—')+'</td>", 3);
trocar("        +'<td>'+_faSelo(_fcQuem(f))+'</td>'", "        +'<td>'+esc(_fcQuem(f))+'</td>'", 1);
trocar("  return '<span class=\"fa-pessoa\" style=\"background:'+t+'26;color:'+RAMPA_AZUL[0]+'\">'+esc(nome)+'</span>';\n}", "  return '<span class=\"gx-nome-txt\">'+esc(nome)+'</span>';\n}", 1);
// Backup 24: Painel sem "Passivo total por grupo" e "Distribuição por órgão" (a pedido); o bloco fica escondido para o código do ERP seguir achando os ids
trocar('  <div class="crow c2">\n    <div class="cc">\n      <div class="cc-hd">\n        <div><div class="cc-t" id="resGrupoTitle">', '  <div class="crow c2 res-graficos" hidden aria-hidden="true" style="display:none">\n    <div class="cc">\n      <div class="cc-hd">\n        <div><div class="cc-t" id="resGrupoTitle">', 1);
// Financeiro → Análise → Em atraso: linhas com ✓ Baixa e ✎ (viram a tabela padrão de pagamento) e triângulo vermelho no título
trocar('<div class="cc-t">⚠ Em atraso</div>', '<div class="cc-t">Em atraso</div>', 2);   // Backup 23: sem triângulo
// Backup 22: o mesmo triângulo vermelho nas abas "Vencidos" de Acordos e Parcelamentos (no lugar da bolinha 🔴)
trocar('>🔴 Vencidos — URGENTE</button>', '>Vencidos — URGENTE</button>', 2);
// Backup 35: Acordos com UMA aba "A pagar" (vencidas + a vencer) e "Pago"; a aba antiga "A Pagar" some
trocar('function sortAcordosVenc(c){', fs.readFileSync(path.join(__dirname, 'remendos', 'acordos-b35.js'), 'utf8') + 'function sortAcordosVenc(c){', 1);
trocar(`<button class="tb-btn active" data-atab="vencidos" onclick="setAcordTab('vencidos',this)">Vencidos — URGENTE</button>`, `<button class="tb-btn active" data-atab="vencidos" onclick="setAcordTab('vencidos',this)">A pagar</button>`, 1);
trocar(`<button class="tb-btn"        data-atab="pagar"    onclick="setAcordTab('pagar',this)">📅 A Pagar</button>`, `<button class="tb-btn"        data-atab="pagar"    onclick="setAcordTab('pagar',this)" hidden>📅 A Pagar</button>`, 1);
// Backup 28: Processos → tabelas por Tribunal e por Natureza sem negrito no nome
trocar("          return '<tr><td><strong>'+esc(k)+'</strong></td>'", "          return '<tr><td>'+esc(k)+'</td>'", 1);
// Backup 37: Painel Executivo — coluna "Em operação" antes da CAPAG e Situação escrita normal (Ativa, Baixada — nunca em caixa alta)
trocar(`          <th style="width:58px;cursor:pointer" onclick="sortExecRank('capag')"  class="s">CAPAG</th>`,
  `          <th style="width:96px">Em operação</th>\n          <th style="width:58px;cursor:pointer" onclick="sortExecRank('capag')"  class="s">CAPAG</th>`, 1);
trocar("      <td style=\"text-align:center\">${cBadge(r.capag)}</td>\n      <td><span class=\"tag ${sC(r)}\" style=\"font-size:10.5px\">${r.sitCadastral||'—'}</span></td>",
  "      <td style=\"text-align:center\" class=\"er-op\">${/^sim$/i.test(r.emOperacao||'')?'<span class=\"tag tg\">Sim</span>':/^n[aã]o$/i.test(r.emOperacao||'')?'<span class=\"tag tr\">Não</span>':'<span style=\"color:var(--text4)\">—</span>'}</td>\n      <td style=\"text-align:center\">${cBadge(r.capag)}</td>\n      <td class=\"er-sit\"><span class=\"tag ${sC(r)}\" style=\"font-size:10.5px\">${String(r.sitCadastral||'—').toLowerCase().replace(/^./,function(c){return c.toUpperCase();})}</span></td>", 1);
trocar("  }).join(''):`<tr><td colspan=\"10\">${emp()}</td></tr>`;\n}\nfunction sortExecRank(c){", "  }).join(''):`<tr><td colspan=\"11\">${emp()}</td></tr>`;\n}\nfunction sortExecRank(c){", 1);
// Backup 37: a sessão só cai por INATIVIDADE (60 min sem mexer). Antes o prazo contava do login e não renovava com o uso —
// por isso "depois de um tempo desconecta" mesmo usando. Agora cada clique/tecla empurra o prazo (salvo a cada 20 s) e a barra de cima mostra o contador.
trocar("const AC_SESSION_TTL  = 30 * 60 * 1000;", "const AC_SESSION_TTL  = 60 * 60 * 1000;", 1);
trocar(`function _acResetTimer() {
  clearTimeout(_acInactivityTimer);`, `function _acResetTimer() {
  clearTimeout(_acInactivityTimer);
  try { if (window.AC_SESSION && Date.now() - (window._acUltGrav || 0) > 20000) { window._acUltGrav = Date.now(); window.AC_SESSION.expira = Date.now() + AC_SESSION_TTL; sessionStorage.setItem(AC_SESSION_KEY, JSON.stringify(window.AC_SESSION)); } } catch (e) {}
  window._acUltAtiv = Date.now();`, 1);
// Backup 38: Prejuízo do Financeiro → Jurídico soma TODOS os meses (como o Em atraso e o cartão do Início), não só o período escolhido
trocar("  var prejuizo= _faFiltrar(['Prejuízo']);", "  var prejuizo= window._semPeriodo(_FA,function(){ return _faFiltrar(['Prejuízo']); });", 1);
trocar("kC('Prejuízo',fF(vPrej),prejuizo.length+' baixa(s)','cx',vPrej>0?'dr':'')", "kC('Prejuízo',fF(vPrej),prejuizo.length+' baixa(s) · todos os meses','cx',vPrej>0?'dr':'')", 1);
trocar("  +   kC('Em atraso',fF(vVenc),vencidos.length+' vencido(s)','cr',vVenc>0?'dr':'')", "  +   kC('Em atraso',fF(vVenc),vencidos.length+' vencido(s) · todos os meses','cr',vVenc>0?'dr':'')", 1);
// Backup 37: Financeiro → Análise sem a tabela "Em atraso" (a mesma informação já está na aba A Receber e no cartão Em atraso)
trocar("  + (vencidos.length?'<div class=\"cc\" style=\"margin-bottom:14px\"><div class=\"cc-hd\"><div><div class=\"cc-t\">Em atraso</div>", "  + (false&&vencidos.length?'<div class=\"cc\" style=\"margin-bottom:14px\"><div class=\"cc-hd\"><div><div class=\"cc-t\">Em atraso</div>", 2);
// Backup 39: Painel → Empresas do grupo sem CEAT e sem CAPAG; coluna Grupo mais estreita (o espaço vai para o nome)
trocar(`          <th style="width:52px;cursor:pointer" onclick="sortExecRank('ceat')"   class="s">CEAT</th>\n`, '', 1);
trocar(`\n          <th style="width:58px;cursor:pointer" onclick="sortExecRank('capag')"  class="s">CAPAG</th>`, '', 1);
trocar("      <td class=\"mono\" style=\"font-size:12.5px;text-align:center\">${r.ceat>0?r.ceat:'-'}</td>\n", '', 1);
trocar("      <td style=\"text-align:center\">${cBadge(r.capag)}</td>\n", '', 1);
trocar("`<tr><td colspan=\"11\">${emp()}</td></tr>`", "`<tr><td colspan=\"9\">${emp()}</td></tr>`", 1);
trocar(`<th id="thExecGrupo" class="s" onclick="sortExecRank('grupo')" style="cursor:pointer;min-width:150px">Grupo</th>`, `<th id="thExecGrupo" class="s" onclick="sortExecRank('grupo')" style="cursor:pointer;width:120px">Grupo</th>`, 1);
// Backup 39: Processos → filtro "Todos" junto de Ativos · Arquivados provisoriamente · Extintos (marca os três)
trocar(`onclick="procToggleChip('Extinto')">Extintos</span>`, `onclick="procToggleChip('Extinto')">Extintos</span>\n        <span class="chip" id="chipProcTodos" onclick="procTodosChips()">Todos</span>`, 1);
trocar("function procToggleChip(val){", "function procTodosChips(){\n  if(_procChips.size===3) _procChips=new Set(['Ativo']); else _procChips=new Set(['Ativo','Arquivado','Extinto']);\n  _procPintarChips(); renderProcTbl();\n}\nfunction procToggleChip(val){", 1);
trocar("  _applyChip('chipProcExtinto','Extinto',_procChips.has('Extinto'));\n}", "  _applyChip('chipProcExtinto','Extinto',_procChips.has('Extinto'));\n  _applyChip('chipProcTodos','Ativo',_procChips.size===3);\n}", 1);
trocar(`data-atab="pago"     onclick="setAcordTab('pago',this)">✓ Pago</button>`, `data-atab="pago"     onclick="setAcordTab('pago',this)">Pago</button>`, 1);
// Backup 39: Contabilidade → "QUEM FEZ" (como no Jurídico), por enquanto só "Contabilidade"; o recorte por cliente sai (o grupo vem do filtro do topo)
trocar(`  + '<div class="fa-lin"><span class="fa-lbl">'+esc(L.tituloQuem)+'</span>'
  +   '<button class="fa-chip" id="fcQuemTodos" onclick="fcQuemTodos()">Todos</button>'
  +   pessoas.map(function(p){
        return '<button class="fa-chip fa-chip-p" data-quem="'+esc(p)+'" onclick="fcQuem(\\''+esc(p).replace(/'/g,"\\\\'")+'\\')">'+esc(p)+'</button>';
      }).join('')
  +   '<span class="fa-dica">clique em mais de um para somar</span>'`,
  `  + '<div class="fa-lin"><span class="fa-lbl">Quem fez</span>'
  +   '<button class="fa-chip on fc-quem-contab" type="button" aria-pressed="true" title="Por enquanto só a Contabilidade lança aqui">Contabilidade</button>'`, 1);
trocar(`<option value="">Todos ('+esc(L.tituloRecorte.toLowerCase())+')</option>'`, `<option value="">Todos os tipos</option>'`, 1);
// Backup 40: Financeiro sem emojis — ícones de traço fino (como na barra lateral)
const IC40 = (d) => '<svg class="fa-ic" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
const IC40D = {
  analise: '<path d="M3 3v18h18"/><path d="M8 17V11M13 17V7M18 17v-4"/>',
  receber: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  recebidos: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  prejuizo: '<path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
  receita: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  apagar: '<path d="M12 21V9M7 14l5-5 5 5"/><path d="M4 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2"/>',
  despesa: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
  caixa: '<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20M16 15h2"/>',
  socios: '<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'
};
trocar(`onclick="setFinTab('analise',this)"  >📊 Análise`, `onclick="setFinTab('analise',this)"  >` + IC40(IC40D.analise) + 'Análise');
trocar(`onclick="setFinTab('receber',this)"  >📋 A Receber`, `onclick="setFinTab('receber',this)"  >` + IC40(IC40D.receber) + 'A Receber');
trocar(`onclick="setFinTab('recebidos',this)" >✅ Recebidos`, `onclick="setFinTab('recebidos',this)" >` + IC40(IC40D.recebidos) + 'Recebidos');
trocar(`onclick="setFinTab('prejuizo',this)"  >📉 Prejuízo / Créditos`, `onclick="setFinTab('prejuizo',this)"  >` + IC40(IC40D.prejuizo) + 'Prejuízo / Créditos');
trocar(`onclick="setFinCTab('analise',this)" >📊 Análise`, `onclick="setFinCTab('analise',this)" >` + IC40(IC40D.analise) + 'Análise');
trocar(`onclick="setFinCTab('receber',this)" >📥 A Receber`, `onclick="setFinCTab('receber',this)" >` + IC40(IC40D.receber) + 'A Receber');
trocar(`onclick="setFinCTab('receita',this)" >💰 Receita`, `onclick="setFinCTab('receita',this)" >` + IC40(IC40D.receita) + 'Receita');
trocar(`onclick="setFinCTab('apagar',this)"  >📤 A Pagar`, `onclick="setFinCTab('apagar',this)"  >` + IC40(IC40D.apagar) + 'A Pagar');
trocar(`onclick="setFinCTab('despesa',this)" >💸 Despesa`, `onclick="setFinCTab('despesa',this)" >` + IC40(IC40D.despesa) + 'Despesa');
trocar(`onclick="setFinCTab('caixa',this)"   >🏦 Composição de Caixa`, `onclick="setFinCTab('caixa',this)"   >` + IC40(IC40D.caixa) + 'Composição de Caixa');
trocar(`onclick="setFinCTab('socios',this)"  >🤝 Distribuição de Lucros`, `onclick="setFinCTab('socios',this)"  >` + IC40(IC40D.socios) + 'Distribuição de Lucros');
trocar(`title="Abrir calendário">📅</button>'`, `title="Abrir calendário">` + IC40(IC40D.cal).replace(/'/g, "\\'") + `</button>'`, 4);

// Backup 40: cor da pessoa (Financeiro) reconhecida pelo primeiro nome, sem diferença de maiúscula/acento — igual ao resto do sistema
trocar(`  var c=_FA_PESSOA[String(nome||'').trim()];
  if(c) return c;`, `  var c=_FA_PESSOA[String(nome||'').trim()];
  if(!c){ var _n=function(s){ return String(s||'').trim().split(/\s+/)[0].normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase(); };
    for(var _k in _FA_PESSOA) if(_n(_k)===_n(nome)){ c=_FA_PESSOA[_k]; break; } }
  if(c) return c;`);

// 13. Cores de tokens.css (fonte única) depois do CSS do ERP; modo escuro lembrado neste aparelho.
trocar('\n</head>\n', '\n<link rel="stylesheet" href="tokens.css">\n<link rel="stylesheet" href="tema-escuro.css">\n<link rel="stylesheet" href="design.css">\n' +
  '<script>try{if(localStorage.getItem("erp_tema")==="escuro")document.documentElement.setAttribute("data-tema","escuro")}catch(e){}</script>\n</head>\n', 1);
fs.writeFileSync(destino, s);

// ═══════ Gestão embutido: as telas do Gestão rodando dentro do ERP ═══════
// Junta o código do Gestão num bloco isolado (nada vaza para o ERP e vice-versa)
// e gera o CSS do Gestão restrito à classe .gs.
const APP = path.join(raiz, 'sistema', 'app');
const ler = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
function cortar(txt, de, ate, novo) {
  const i = txt.indexOf(de), j = ate ? txt.indexOf(ate, i) : txt.length;
  if (i < 0 || j < 0) throw new Error('Trecho do Gestão não encontrado: ' + de);
  return txt.slice(0, i) + (novo || '') + txt.slice(j);
}
let nuc = ler('nucleo.js');
nuc = nuc.replace(/const sb = CONFIGURADO \? [^\n]+/, 'const sb = window.SB;');
nuc = cortar(nuc, '// ─────────────────────────── login', 'async function carregarCadastros');
nuc = cortar(nuc, '// ─────────────────────────── navegação', null, `// ── navegação dentro do ERP: cada tela desenha no painel que o ERP mostrou ──
const TELAS = {};
async function irPara(tela, alvo) {
  E.perfil = window.ERP_EU || E.perfil;
  E.tela = tela;
  // cada painel tem a sua área; só a do painel aberto se chama "conteudo" (o painel mantém o próprio id)
  if (alvo) {
    let area = alvo.querySelector(':scope > .gs-area');
    if (!area) { area = document.createElement('div'); area.className = 'gs-area'; alvo.appendChild(area); }
    const ant = document.getElementById('conteudo'); if (ant && ant !== area) ant.removeAttribute('id');
    area.id = 'conteudo';
  }
  if (!$('conteudo')) return;
  $('conteudo').innerHTML = '<div class="carregando">Carregando…</div>';
  try { await carregarCadastros(); await TELAS[tela](); }
  catch (e) {
    console.error(e);
    $('conteudo').innerHTML = '<div class="card"><div class="card-bd msg-erro">' + esc(erroAmigavel(e)) + '</div></div>';
  }
}
function recarregar() { invalidarCadastros(); if (window.ERP_RECARREGAR) return window.ERP_RECARREGAR(); return irPara(E.tela); }
`);
let graf = ler('graficos.js').replace("document.addEventListener('DOMContentLoaded', () => document.body.appendChild(dica));",
  "(document.getElementById('gs-raiz') || document.body).appendChild(dica);");
const bundle = "'use strict';\n// GERADO por sistema/ferramentas/montar-erp.js — não edite; edite os arquivos do Gestão.\n(function () {\n" +
  "const _raiz = document.createElement('div'); _raiz.id = 'gs-raiz'; _raiz.className = 'gs';\n" +
  "_raiz.innerHTML = '<div id=\"janelas\"></div><div id=\"aviso\"></div>'; document.body.appendChild(_raiz);\n" +
  [nuc, graf, ler('telas-painel.js'), ler('telas-financeiro.js'), ler('telas-cadastros.js'), ler('telas-admin.js'), ler('telas-tarefas.js'), ler('telas-documentos.js'), ler('telas-cliente360.js'), ler('telas-crm.js'), ler('telas-publicacoes.js'), ler('telas-acordos.js'), ler('telas-alertas.js'), ler('telas-automacoes.js'), ler('telas-aprovacoes.js'), ler('telas-emails.js'), ler('telas-guias.js'), ler('telas-rotina.js'), ler('telas-relatorio.js')].join('\n') +
  "\n// toda gravação confirmada aparece também no rodapé do ERP\nconst _avisoOrig = aviso;\n" +
  "aviso = function (msg, erro) { _avisoOrig(msg, erro); if (!erro && window.ERP_EDITOR && /^✓/.test(msg)) window.ERP_EDITOR.gravou(String(msg).replace(/^✓\\s*/, '')); };\n" +
  "window.GS = { TELAS, E, irPara, carregarCadastros, formLancamento, formCliente, formContrato, formTarefa, tabelaLancamentos, ligarAcoesLancamentos, abrirJanela, fecharJanela, abrirFicha, invalidarCadastros, blocoDocumentos, abrirAlertas, contarAlertas, pode, janelaMeusAvisos, formOportunidade, detalheAcordo, perguntarBaixa, detalheContrato, ICONE_AVISO, abrirTarefa, detalheLancamento, edicaoLancamentos, janelaModelosEmail, janelaAutoEmails, janelaGeradores, formReuniao, janelaDelegar, abrirGeradorContrato, cardGuias, emitirParcela, enviarAcordosSelecionados, gerarGuias, janelaMovimentacao, janelaRelatorioPDF };\n})();\n";
fs.writeFileSync(path.join(APP, 'gestao-embutida.js'), bundle);

// CSS do Gestão só dentro de .gs (as telas do Gestão) e #gs-hd (barra superior)
function escopo(sel) {
  sel = sel.trim();
  if (sel === ':root' || sel === 'body') return '.gs';
  if (sel === '*') return '.gs *';
  if (/^#hd\b/.test(sel)) return sel.replace(/^#hd/, '#gs-hd');
  if (/^(nav|\.marca|\.hd-usuario)\b/.test(sel)) return '#gs-hd ' + sel;
  return '.gs ' + sel;
}
function escoparCss(css) {
  let out = '', i = 0;
  while (i < css.length) {
    const ab = css.indexOf('{', i);
    if (ab < 0) break;
    const cab = css.slice(i, ab).replace(/\/\*[\s\S]*?\*\//g, '').trim();
    // acha o fechamento correspondente
    let n = 1, j = ab + 1;
    while (n && j < css.length) { if (css[j] === '{') n++; else if (css[j] === '}') n--; j++; }
    const corpo = css.slice(ab + 1, j - 1);
    if (/^@media/.test(cab)) out += cab + '{' + escoparCss(corpo) + '}\n';
    else if (/^@/.test(cab)) out += cab + '{' + corpo + '}\n';
    else out += cab.split(',').map(escopo).join(',') + '{' + corpo + '}\n';
    i = j;
  }
  return out;
}
const gsCss = '/* GERADO por sistema/ferramentas/montar-erp.js a partir de estilo.css (Gestão) — não edite. */\n' +
  escoparCss(ler('estilo.css')) +
  '/* cores do ERP, tamanhos do Gestão */\n' +
  '.gs{background:none!important;min-height:0!important}\n' +
  '.gs .duas-col>*,.gs .card{min-width:0}\n';
fs.writeFileSync(path.join(APP, 'gs.css'), gsCss);
// modo escuro: gerado do CSS que existe (o claro não muda)
{
  const estilosErp = (s.match(/<style[^>]*>[\s\S]*?<\/style>/g) || []).filter((x) => !/_pdfCss|<\/head>/.test(x)).map((x) => x.replace(/<\/?style[^>]*>/g, ''));
  const escuro = require('./tema-escuro.js').gerar(estilosErp.concat([gsCss, ler('erp-telas.css'), ler('editor.css')]),
    [s, bundle, ler('editor.js'), ler('erp-telas.js')]);
  fs.writeFileSync(path.join(APP, 'tema-escuro.css'), escuro);
  console.log('tema-escuro.css gerado: ' + Math.round(escuro.length / 1024) + ' KB');
}
console.log('gestao-embutida.js e gs.css gerados');

// 15. Carimbo de versão (?v=) nos arquivos do sistema: o navegador guarda por 1 ano (vercel.json)
// e baixa de novo sozinho quando o conteúdo muda. config.js fica sem carimbo (sempre confere).
{
  const crypto = require('crypto');
  const versao = (f) => crypto.createHash('sha1').update(fs.readFileSync(path.join(APP, f))).digest('hex').slice(0, 8);
  let n = 0;
  s = s.replace(/(<(?:script|link)[^>]*?(?:src|href)=")((?:vendor\/)?[\w.-]+\.(?:js|css))(")/g, (m, a, f, z) => {
    if (f === 'config.js' || !fs.existsSync(path.join(APP, f))) return m;
    n++; return a + f + '?v=' + versao(f) + z;
  });
  fs.writeFileSync(destino, s);
  console.log('carimbo de versão em ' + n + ' arquivos');
}
console.log('index.html gerado: ' + trocas + ' ajustes, ' + Math.round(s.length / 1024) + ' KB');


// 15b. Central de Documentos (Backup 32): mesma regra do carimbo (?v=) na página documentos/index.html (troca o carimbo antigo)
{
  const crypto = require('crypto'), pg = path.join(APP, 'documentos', 'index.html');
  if (fs.existsSync(pg)) {
    let h = fs.readFileSync(pg, 'utf8'), n = 0;
    h = h.replace(/((?:src|href)=")((?:\.\.\/)?(?:vendor\/)?[\w.-]+\.(?:js|css))(?:\?v=\w+)?(")/g, (m, a2, f, z) => {
      const real = path.join(APP, 'documentos', f);
      if (/config\.js$/.test(f) || !fs.existsSync(real)) return a2 + f + z;
      n++; return a2 + f + '?v=' + crypto.createHash('sha1').update(fs.readFileSync(real)).digest('hex').slice(0, 8) + z;
    });
    fs.writeFileSync(pg, h); console.log('documentos/index.html: carimbo em ' + n + ' arquivos');
  }
}

// 16. Geradores de documentos (Backup 16): páginas separadas em app/geradores/, com a ponte do ERP
require('./montar-geradores').montar();
