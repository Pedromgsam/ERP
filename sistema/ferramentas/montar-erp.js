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
trocar("  + '<div class=\"cc\" style=\"margin-bottom:14px\"><div class=\"cc-hd\"><div><div class=\"cc-t\">Recebido mês a mês</div>'",
  "  + (vencidos.length?'<div class=\"cc\" style=\"margin-bottom:14px\"><div class=\"cc-hd\"><div><div class=\"cc-t\">⚠ Em atraso</div><div class=\"cc-d\">todos os meses · mesmos recortes de pessoa, tipo e grupo</div></div></div>'+_faTabelaDetalhe(vencidos.slice().sort(function(a,b){return (pDate(a.vencimento)||0)-(pDate(b.vencimento)||0);}))+'</div>':'')\n"
  + "  + '<div class=\"cc\" style=\"margin-bottom:14px\"><div class=\"cc-hd\"><div><div class=\"cc-t\">Recebido mês a mês</div>'", 1);
trocar("  + '<div class=\"cc\" style=\"margin-bottom:14px\"><div class=\"cc-hd\"><div><div class=\"cc-t\">'+(L.lado==='pagar'?'Pago':'Recebido')+' mês a mês</div>'",
  "  + (vencidos.length?'<div class=\"cc\" style=\"margin-bottom:14px\"><div class=\"cc-hd\"><div><div class=\"cc-t\">⚠ Em atraso</div><div class=\"cc-d\">todos os meses · mesmos recortes</div></div></div>'+_fcTabelaDetalhe(vencidos)+'</div>':'')\n"
  + "  + '<div class=\"cc\" style=\"margin-bottom:14px\"><div class=\"cc-hd\"><div><div class=\"cc-t\">'+(L.lado==='pagar'?'Pago':'Recebido')+' mês a mês</div>'", 1);

s = s.replace(/<title>[^<]*<\/title>/, '<title>ERP — Araújo &amp; Castro</title>');
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
function recarregar() { if (window.ERP_RECARREGAR) return window.ERP_RECARREGAR(); return irPara(E.tela); }
`);
let graf = ler('graficos.js').replace("document.addEventListener('DOMContentLoaded', () => document.body.appendChild(dica));",
  "(document.getElementById('gs-raiz') || document.body).appendChild(dica);");
const bundle = "'use strict';\n// GERADO por sistema/ferramentas/montar-erp.js — não edite; edite os arquivos do Gestão.\n(function () {\n" +
  "const _raiz = document.createElement('div'); _raiz.id = 'gs-raiz'; _raiz.className = 'gs';\n" +
  "_raiz.innerHTML = '<div id=\"janelas\"></div><div id=\"aviso\"></div>'; document.body.appendChild(_raiz);\n" +
  [nuc, graf, ler('telas-painel.js'), ler('telas-financeiro.js'), ler('telas-cadastros.js'), ler('telas-admin.js'), ler('telas-tarefas.js'), ler('telas-documentos.js'), ler('telas-cliente360.js')].join('\n') +
  "\n// toda gravação confirmada aparece também no rodapé do ERP\nconst _avisoOrig = aviso;\n" +
  "aviso = function (msg, erro) { _avisoOrig(msg, erro); if (!erro && window.ERP_EDITOR && /^✓/.test(msg)) window.ERP_EDITOR.gravou(String(msg).replace(/^✓\\s*/, '')); };\n" +
  "window.GS = { TELAS, E, irPara, carregarCadastros, formLancamento, formCliente, formContrato, formTarefa, tabelaLancamentos, ligarAcoesLancamentos, abrirJanela, fecharJanela, abrirFicha, blocoDocumentos, abrirAlertas, contarAlertas };\n})();\n";
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
  '.gs{--navy:#1B2A4A;--navy2:#243659;--navy3:#2E5EAA;--accent:#C9A84C;--bg:#F0F2F7;background:none!important;min-height:0!important}\n' +
  '.gs .duas-col>*,.gs .card{min-width:0}\n';
fs.writeFileSync(path.join(APP, 'gs.css'), gsCss);
console.log('gestao-embutida.js e gs.css gerados');
console.log('index.html gerado: ' + trocas + ' ajustes, ' + Math.round(s.length / 1024) + ' KB');
