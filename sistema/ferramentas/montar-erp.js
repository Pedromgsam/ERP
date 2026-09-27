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
  '<link rel="stylesheet" href="editor.css">\n<script src="editor.js" defer></script>', 1);

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
  '-- Cole no SQL Editor do Supabase DEPOIS do estrutura.sql. Pode rodar de novo sem problema.\n' +
  "insert into public.configuracoes (chave, valor) values ('recibo_emitentes', '" + json + "'::jsonb)\n" +
  'on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();\n');

s = s.replace(/<title>[^<]*<\/title>/, '<title>ERP — Araújo &amp; Castro</title>');
fs.writeFileSync(destino, s);
console.log('index.html gerado: ' + trocas + ' ajustes, ' + Math.round(s.length / 1024) + ' KB');
