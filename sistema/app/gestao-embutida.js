'use strict';
// GERADO por sistema/ferramentas/montar-erp.js — não edite; edite os arquivos do Gestão.
(function () {
const _raiz = document.createElement('div'); _raiz.id = 'gs-raiz'; _raiz.className = 'gs';
_raiz.innerHTML = '<div id="janelas"></div><div id="aviso"></div>'; document.body.appendChild(_raiz);
'use strict';
// ═══════════════════════════════════════════════════════════════════
// ERP Araújo & Castro — núcleo: conexão, login, navegação e utilidades.
// Dados e regras de acesso ficam no Supabase (ver ../banco/estrutura.sql).
// As telas ficam em telas-*.js e se registram em TELAS.
// ═══════════════════════════════════════════════════════════════════

const CFG = window.ERP_CONFIG || {};
const CONFIGURADO = !!(CFG.url && CFG.chave && !/COLE_AQUI/.test(CFG.url + CFG.chave));
const sb = window.SB;

// Estado em memória. Nada de filtro guardado no navegador: ao abrir, tudo
// volta ao padrão (um recorte herdado parece a carteira inteira).
const E = {
  perfil: null, tela: 'inicio',
  clientes: [], grupos: [], perfis: {}
};

// ─────────────────────────── utilitários ───────────────────────────
const $ = (id) => document.getElementById(id);
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function brl(n) { return fmtBRL.format(Number(n) || 0); }
// Valor curto para gráfico, com o exato no title de quem chama.
function brlCurto(n) {
  const v = Math.abs(Number(n) || 0), s = n < 0 ? '−' : '';
  if (v >= 1e6) return s + 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
  if (v >= 1e4) return s + 'R$ ' + Math.round(v / 1e3).toLocaleString('pt-BR') + ' mil';
  return s + brl(v);
}
function iso(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function hojeISO() { return iso(new Date()); }
function primeiroDiaDoMes(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function fimDoMes(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function somarDias(isoStr, n) { const d = new Date(isoStr + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); }
function somarMeses(isoStr, n) {
  const [a, m, dia] = isoStr.split('-').map(Number);
  const alvo = new Date(a, m - 1 + n, 1);
  alvo.setDate(Math.min(dia, fimDoMes(alvo).getDate()));
  return iso(alvo);
}
function dataBR(isoStr) {
  if (!isoStr) return '—';
  const [a, m, d] = String(isoStr).slice(0, 10).split('-');
  return d + '/' + m + '/' + a;
}
function dataHoraBR(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function nomeMes(d) { const t = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); }
function mesCurto(d) { return d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') + '/' + String(d.getFullYear()).slice(2); }
// Aceita "1.234,56", "1234,56", "1234.56" e "R$ 1.234,56".
function lerValor(txt) {
  let s = String(txt || '').replace(/[R$\s]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
function valorParaCampo(n) { return n == null || n === '' ? '' : (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }
function mascaraDoc(s) {
  const d = soDigitos(s);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return s || '';
}
// ─────────────── funções de acesso (Administração → Usuários) ───────────────
const FUNCOES = [
  ['financeiro_juridico', 'Financeiro — Jurídico', 'Honorários do escritório, lançamentos e recibos'],
  ['financeiro_contab', 'Financeiro — Contabilidade', 'Honorários da contabilidade'],
  ['contratos', 'Contratos', 'Contratos e as parcelas geradas por eles'],
  ['clientes', 'Clientes', 'Cadastro, ficha do cliente, contatos e contas'],
  ['juridico', 'Jurídico', 'Processos, acordos, parcelamentos e publicações'],
  ['tarefas', 'Tarefas', 'Tarefas de todos, fluxos e modelos (as próprias tarefas todos vêem)'],
  ['documentos', 'Documentos', 'Enviar e abrir documentos'],
  ['crm', 'CRM', 'Oportunidades, propostas e funil'],
  ['relatorios', 'Relatórios', 'Painel Executivo e relatórios em PDF']
];
const MODELOS_ACESSO = {
  'Sócio (tudo)': Object.fromEntries(FUNCOES.map((f) => [f[0], 'editar'])),
  'Financeiro': { financeiro_juridico: 'editar', financeiro_contab: 'editar', contratos: 'editar', clientes: 'ver', documentos: 'editar', relatorios: 'ver' },
  'Jurídico': { juridico: 'editar', clientes: 'editar', tarefas: 'editar', documentos: 'editar', contratos: 'ver' },
  'Atendimento / Comercial': { crm: 'editar', clientes: 'editar', contratos: 'ver', documentos: 'editar', tarefas: 'ver' },
  'Estagiário': { juridico: 'ver', tarefas: 'ver', clientes: 'ver', documentos: 'ver' }
};
// pode('contratos') → pode ver; pode('contratos','editar') → pode gravar. Admin pode tudo.
function pode(f, nivel, perfil) {
  const p = perfil || E.perfil || window.ERP_EU || {};
  if (p.papel === 'admin') return true;
  if (p.papel !== 'equipe') return false;
  const v = (p.funcoes || {})[f];
  return v === 'editar' || (v === 'ver' && (nivel || 'ver') === 'ver');
}
function resumoFuncoes(p) {
  if (p.papel === 'admin') return 'tudo';
  const f = p.funcoes || {}, ks = FUNCOES.filter((x) => f[x[0]]);
  if (ks.length === FUNCOES.length && ks.every((x) => f[x[0]] === 'editar')) return 'tudo';
  return ks.map((x) => x[1].replace('Financeiro — ', 'Fin. ') + (f[x[0]] === 'ver' ? ' (ver)' : '')).join(' · ') || 'nenhuma';
}
// grade de funções (Nenhum / Ver / Editar) com os modelos prontos
function gradeFuncoes(funcoes) {
  funcoes = funcoes || {};
  return '<div class="modelos-acesso">' + Object.keys(MODELOS_ACESSO).map((m) => '<button type="button" class="btn btn-o btn-mini" data-modelo-acesso="' + esc(m) + '">' + esc(m) + '</button>').join('') + '</div>' +
    '<div class="grade-funcoes">' + FUNCOES.map(([k, rot, desc]) => '<div class="gf-lin"><div><b>' + rot + '</b><div class="sub">' + desc + '</div></div><div class="segmento gf-niveis" data-funcao="' + k + '">' +
      [['', 'Nenhum'], ['ver', 'Ver'], ['editar', 'Editar']].map(([v, r]) => '<button type="button" data-v="' + v + '" class="' + ((funcoes[k] || '') === v ? 'ativo' : '') + '">' + r + '</button>').join('') + '</div></div>').join('') + '</div>';
}
function ligarGradeFuncoes(raiz) {
  raiz.querySelectorAll('.gf-niveis').forEach((g) => g.onclick = (ev) => { const b = ev.target.closest('button'); if (!b) return; g.querySelectorAll('button').forEach((x) => x.classList.toggle('ativo', x === b)); });
  raiz.querySelectorAll('[data-modelo-acesso]').forEach((b) => b.onclick = () => {
    const m = MODELOS_ACESSO[b.dataset.modeloAcesso];
    raiz.querySelectorAll('.gf-niveis').forEach((g) => { const v = m[g.dataset.funcao] || ''; g.querySelectorAll('button').forEach((x) => x.classList.toggle('ativo', x.dataset.v === v)); });
  });
}
function lerGradeFuncoes(raiz) {
  const o = {};
  raiz.querySelectorAll('.gf-niveis').forEach((g) => { const b = g.querySelector('button.ativo'); if (b && b.dataset.v) o[g.dataset.funcao] = b.dataset.v; });
  return o;
}

// Chama uma função do Supabase (Edge Function) e explica claramente o que deu errado.
async function chamarFuncao(nome, corpo) {
  const sessao = (await sb.auth.getSession()).data.session;
  let r;
  try {
    r = await fetch(String(CFG.url).replace(/\/$/, '') + '/functions/v1/' + nome, { method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CFG.chave, Authorization: 'Bearer ' + (sessao ? sessao.access_token : CFG.chave) },
      body: JSON.stringify(corpo || {}) });
  } catch (e) { throw new Error('Não consegui falar com a função "' + nome + '" (sem internet ou bloqueio do navegador).'); }
  const txt = await r.text(); let js = null;
  try { js = JSON.parse(txt); } catch (e) { /* resposta sem JSON */ }
  if (r.ok) return js || {};
  const det = (js && (js.erro || js.message || js.msg || js.error)) || txt.slice(0, 200);
  if (r.status === 404) throw new Error('A função "' + nome + '" não foi encontrada no Supabase. Em Edge Functions, o nome tem que ser exatamente "' + nome + '" (tudo minúsculo). Se ela foi criada com outro nome, crie de novo com o nome certo.');
  if ((r.status === 401 || r.status === 403) && !(js && js.erro)) throw new Error('O Supabase recusou a chamada da função "' + nome + '": abra a função no Supabase → Details e desligue "Verify JWT" (Enforce JWT verification). Detalhe: ' + det);
  if (js && js.erro) throw new Error(js.erro);
  if (r.status >= 500) throw new Error('A função "' + nome + '" existe, mas deu erro ao rodar (' + r.status + '): ' + det + '. Confira se o arquivo foi colado inteiro e publique de novo.');
  throw new Error('A função "' + nome + '" respondeu ' + r.status + ': ' + det);
}
// Diagnóstico: as funções estão publicadas e respondendo?
async function verificarFuncoes() {
  const out = [];
  for (const nome of ['erp-emails', 'erp-publicacoes', 'erp-cnpj', 'erp-agenda']) {
    try { const r = await chamarFuncao(nome, { acao: 'ping' }); out.push([nome, true, r.versao ? 'publicada (versão ' + r.versao + ')' : 'publicada (versão antiga: publique de novo o arquivo do GitHub)']); }
    catch (e) { out.push([nome, false, e.message]); }
  }
  return out;
}

// Data digitada (filtros): máscara dd/mm/aaaa; nada roda enquanto se digita.
function mascaraData(inp) {
  if (!inp) return;
  inp.addEventListener('input', () => {
    const d = soDigitos(inp.value).slice(0, 8);
    inp.value = d.length > 4 ? d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4) : d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d;
  });
}
// "31/11/2025" → { iso: '2025-11-30', corrigida: true }; incompleta → null
function lerDataBR(txt) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(txt || '').trim());
  if (!m) return null;
  const dia = +m[1], mes = +m[2], ano = +m[3];
  if (mes < 1 || mes > 12 || dia < 1 || ano < 1900) return null;
  const ult = new Date(ano, mes, 0).getDate(), d = Math.min(dia, ult);
  return { iso: ano + '-' + String(mes).padStart(2, '0') + '-' + String(d).padStart(2, '0'), corrigida: d !== dia };
}
function normalizar(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
// Valor com sinal: comissão/desconto (redutor) diminui a receita.
function vl(l) { return l.redutor ? -(Number(l.valor) || 0) : (Number(l.valor) || 0); }
function soma(lista, f) { return lista.reduce((s, x) => s + (Number(f ? f(x) : x) || 0), 0); }

// ─────────────────────────── selos ─────────────────────────────────
function situacao(l) {
  if (l.pago) return 'pago';
  if (l.perda) return 'perda';
  const h = hojeISO();
  if (l.vencimento < h) return 'vencido';
  if (l.vencimento === h) return 'hoje';
  return 'aberto';
}
const ROTULO_SIT = { pago: 'Pago', vencido: 'Em atraso', hoje: 'Vence hoje', aberto: 'Em aberto', perda: 'Prejuízo' };
function pillSit(l) {
  const s = situacao(l);
  const rot = s === 'pago' && l.tipo === 'receita' ? 'Recebido' : ROTULO_SIT[s];
  return '<span class="pill ' + s + '">' + rot + '</span>' +
    (l.cobranca && !l.pago ? ' <span class="pill cobranca" title="Situação da cobrança">' + esc(l.cobranca) + '</span>' : '');
}
// CAPAG: todos os valores que a planilha traz — "Omisso" é o que mais importa ver.
const CAPAG_COR = { A: 'pago', B: 'aberto', C: 'hoje', D: 'vencido', OMISSO: 'omisso' };
function pillCapag(v) {
  const t = String(v || '').trim();
  if (!t) return '<span class="sub">—</span>';
  const cls = CAPAG_COR[t.toUpperCase()];
  if (!cls) console.warn('[ERP] CAPAG sem cor definida:', t);
  return '<span class="pill ' + (cls || 'neutro') + '">' + esc(t) + '</span>';
}
const SITCAD_COR = { ATIVA: 'pago', SUSPENSA: 'hoje', INAPTA: 'vencido', BAIXADA: 'neutro', NULA: 'neutro' };
function pillSitCad(v) {
  const t = String(v || '').trim().toUpperCase();
  if (!t) return '<span class="sub">—</span>';
  return '<span class="pill ' + (SITCAD_COR[t] || 'neutro') + '">' + esc(t.charAt(0) + t.slice(1).toLowerCase()) + '</span>';
}
function pillSimNao(v) {
  if (v === true) return '<span class="pill pago">Sim</span>';
  if (v === false) return '<span class="pill neutro">Não</span>';
  return '<span class="sub">—</span>';
}
// Cor de pessoa — a mesma do ERP antigo e das planilhas.
const PESSOA = {
  'Pedro':      { fundo: '#D4EDBC', marca: '#4E9A2F', texto: '#2F6B1A' },
  'Emanuelle':  { fundo: '#FFCFC9', marca: '#D2544A', texto: '#9B2C22' },
  'Escritório': { fundo: '#FBE9A8', marca: '#C9A84C', texto: '#8A6D14' },
  'Adriana':    { fundo: '#DBEAFE', marca: '#3B6FD4', texto: '#1D4ED8' }
};
function corPessoa(n) { return PESSOA[String(n || '').trim()] || { fundo: '#EEF1F7', marca: '#6B7280', texto: '#4B5563' }; }
function pillPessoa(n) {
  if (!n) return '<span class="sub">—</span>';
  const c = corPessoa(n);
  return '<span class="pill" style="background:' + c.fundo + ';color:' + c.texto + '">' + esc(n) + '</span>';
}

// ─────────────────────────── avisos e erros ────────────────────────
let _avisoT;
function aviso(msg, erro) {
  const a = $('aviso');
  a.textContent = msg;
  a.className = 'mostrar' + (erro ? ' erro' : '');
  clearTimeout(_avisoT);
  _avisoT = setTimeout(() => { a.className = ''; }, erro ? 6000 : 3000);
  if (!erro) { marcarGravacao(); invalidarCadastros(); }
}
// Rodapé "gravado no servidor às HH:MM": toda mensagem de sucesso só aparece
// depois que o banco confirmou a gravação.
function marcarGravacao() {
  const el = $('rodape-gravacao');
  if (el) el.textContent = 'Última gravação confirmada pelo servidor às ' +
    new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function erroAmigavel(e) {
  const m = String((e && (e.message || e.error_description)) || e || '');
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(m)) return 'E-mail ainda não confirmado. Peça ao administrador para confirmar o usuário.';
  if (/row-level security|permission denied/i.test(m)) return 'Você não tem permissão para fazer isso.';
  if (/foreign key|violates.*restrict/i.test(m)) return 'Não dá para excluir: existem registros ligados a este cadastro (ex.: contratos).';
  if (/grupos_nome_unico/i.test(m)) return 'Já existe um grupo com esse nome.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
  if (/JWT expired|session/i.test(m)) return 'Sua sessão expirou. Entre de novo.';
  if (/column .* does not exist|schema cache/i.test(m)) return 'O banco está desatualizado: rode de novo o arquivo estrutura.sql no Supabase (SQL Editor).';
  return m || 'Erro inesperado.';
}

// Excluir e conferir: sem permissão, o banco não dá erro — só não apaga nada.
async function excluir(tabela, id) {
  const apagados = await q(sb.from(tabela).delete().eq('id', id).select('id'));
  if (!apagados || !apagados.length) throw new Error('Só o administrador pode excluir este registro.');
}
async function q(consulta) {
  const { data, error } = await consulta;
  if (error) throw error;
  return data;
}
// O Supabase devolve no máximo 1.000 linhas por pedido: busca em páginas.
async function buscarTodos(montar, porPagina) {
  const n = porPagina || 1000, todos = [];
  for (let de = 0; ; de += n) {
    const pag = await q(montar().range(de, de + n - 1));
    todos.push(...pag);
    if (pag.length < n) return todos;
  }
}

async function comBotao(btn, fn) {
  if (btn) btn.disabled = true;
  try { await fn(); }
  catch (e) { console.error(e); aviso(erroAmigavel(e), true); }
  finally { if (btn) btn.disabled = false; }
}

// Carrega um script sob demanda (ex.: a biblioteca de Excel, só quando usada).
const _scripts = {};
function carregarScript(src) {
  if (!_scripts[src]) _scripts[src] = new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => { delete _scripts[src]; falha(new Error('Não consegui carregar ' + src)); };
    document.head.appendChild(s);
  });
  return _scripts[src];
}

function baixarArquivo(nome, conteudo, tipo) {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo || 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ─────────────────────────── janelas ───────────────────────────────
function abrirJanela({ titulo, corpo, rodape, larga }) {
  const fundo = document.createElement('div');
  fundo.className = 'fundo';
  fundo.innerHTML =
    '<div class="janela' + (larga ? ' larga' : '') + '" role="dialog" aria-modal="true">' +
    '<div class="janela-hd"><h2>' + esc(titulo) + '</h2><button type="button" data-fechar aria-label="Fechar">×</button></div>' +
    '<div class="janela-bd">' + corpo + '</div>' +
    (rodape ? '<div class="janela-rp">' + rodape + '</div>' : '') + '</div>';
  fundo.addEventListener('mousedown', (ev) => { if (ev.target === fundo) fecharJanela(fundo); });
  fundo.querySelector('[data-fechar]').onclick = () => fecharJanela(fundo);
  $('janelas').appendChild(fundo);
  const primeiro = fundo.querySelector('input:not([type=hidden]):not([type=checkbox]),select,textarea');
  if (primeiro) setTimeout(() => primeiro.focus(), 50);
  return fundo;
}
function fecharJanela(el) {
  const alvo = el || $('janelas').lastElementChild;
  if (alvo) alvo.remove();
}
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') fecharJanela(); });

// Relatório padrão (Alertas, Clientes…): tabela ordenável + CSV; linha com id abre a ficha do cliente.
// r = { titulo, colunas: [...], linhas: [[...]], ids?: [id do cliente por linha], acao?: { rotulo, fn } }
function relatorioTabela(r) {
  const j = abrirJanela({ titulo: r.titulo + ' (' + r.linhas.length + ')', larga: true,
    corpo: r.linhas.length ? '<div class="tabela-wrap" style="max-height:60vh;overflow:auto"><table class="ordenavel"><thead><tr>' + r.colunas.map((c) => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>' +
      r.linhas.map((l, i) => '<tr' + (r.ids && r.ids[i] ? ' class="clicavel" data-cli="' + r.ids[i] + '"' : '') + '>' + l.map((v) => '<td>' + esc(v == null ? '' : v) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>' : vazio('Nada aqui. 🎉'),
    rodape: '<button class="btn btn-o" type="button" data-rel-csv>⬇ CSV</button><div class="acoes">' + (r.acao ? '<button class="btn btn-p" type="button" data-rel-acao>' + esc(r.acao.rotulo) + '</button>' : '') + '</div>' });
  j.querySelectorAll('[data-cli]').forEach((tr) => tr.onclick = () => abrirFicha(tr.dataset.cli));
  j.querySelector('[data-rel-csv]').onclick = () => baixarArquivo(r.titulo.replace(/[\\/:*?"<>|]/g, '-') + ' ' + hojeISO() + '.csv',
    '\ufeff' + [r.colunas].concat(r.linhas).map((l) => l.map((v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  const ac = j.querySelector('[data-rel-acao]'); if (ac) ac.onclick = () => { fecharJanela(j); r.acao.fn(); };
  return j;
}

// Estado vazio padrão: uma frase + um botão que aciona o botão de criar da própria tela
// (seletor procurado primeiro na mesma janela/tela, depois na página toda).
function vazio(frase, rotulo, seletor) {
  return '<div class="vazio"><div class="vazio-frase">' + esc(frase) + '</div>' +
    (rotulo && seletor ? '<button type="button" class="btn btn-p btn-mini vazio-bt" data-vazio-clica="' + esc(seletor) + '">' + esc(rotulo) + '</button>' : '') + '</div>';
}
document.addEventListener('click', (ev) => {
  const b = ev.target.closest && ev.target.closest('[data-vazio-clica]'); if (!b) return;
  const sel = b.dataset.vazioClica, perto = b.closest('.janela, .gs-area, #conteudo');
  const alvo = (perto && perto.querySelector(sel)) || document.querySelector(sel);
  if (alvo && alvo !== b) alvo.click();
});

// Tabelas longas (todas as telas): mostra 100 linhas por vez com "Mostrar mais", e nas tabelas das
// telas novas com mais de 25 linhas a rolagem fica dentro do quadro, com o cabeçalho fixo.
// Reaplica sozinho quando a tabela é redesenhada (filtro) ou reordenada (clique no cabeçalho).
const PAGINA_TABELA = 100;
function paginarTabelas() {
  document.querySelectorAll('.tw table, .tabela-wrap table').forEach((t) => {
    const corpo = t.tBodies[0]; if (!corpo) return;
    const linhas = [...corpo.rows].filter((r) => !r.classList.contains('linha-total'));
    const wrap = t.closest('.tabela-wrap');
    if (wrap) wrap.classList.toggle('tabela-longa', linhas.length > 25 && !wrap.closest('.janela'));
    let rod = t.parentElement.nextElementSibling;
    if (!(rod && rod.classList.contains('pag-rodape'))) rod = null;
    if (linhas.length <= PAGINA_TABELA) { linhas.forEach((r) => r.classList.remove('pag-oculta')); if (rod) rod.remove(); return; }
    const lim = Math.max(PAGINA_TABELA, +(t.dataset.pagLim || 0));
    linhas.forEach((r, i) => r.classList.toggle('pag-oculta', i >= lim));
    const vis = Math.min(lim, linhas.length);
    if (!rod) { rod = document.createElement('div'); rod.className = 'pag-rodape no-print'; t.parentElement.after(rod); }
    const txt = 'Mostrando ' + vis + ' de ' + linhas.length;
    if (rod.dataset.txt === txt) return;
    rod.dataset.txt = txt;
    rod.innerHTML = '<span>' + txt + '</span>' + (vis < linhas.length ? '<button type="button" data-pag="mais">Mostrar mais ' + Math.min(PAGINA_TABELA, linhas.length - vis) +
      '</button><button type="button" data-pag="todas">Mostrar todas</button>' : '');
    rod.onclick = (ev) => { const b = ev.target.closest('[data-pag]'); if (!b) return;
      t.dataset.pagLim = b.dataset.pag === 'todas' ? 1e9 : lim + PAGINA_TABELA; paginarTabelas(); };
  });
}
// acessibilidade: botão que só tem ícone ganha nome para leitor de tela (do title ou do ícone)
const NOME_ICONE = { '✎': 'Editar', '⋯': 'Mais ações', '✕': 'Fechar', '×': 'Fechar', '🔔': 'Avisos', '⚙': 'Configurações', '◐': 'Alternar modo escuro',
  '✓': 'Concluir', '▸': 'Abrir detalhes', '▾': 'Fechar detalhes', '🗑': 'Excluir', '📎': 'Anexo', '↻': 'Atualizar', '⬇': 'Baixar', '👁': 'Mostrar senha' };
function nomearBotoesIcone() {
  document.querySelectorAll('button:not([aria-label]), a.btn:not([aria-label]), [role=button]:not([aria-label])').forEach((b) => {
    const t = (b.textContent || '').trim();
    if (!t || /[0-9A-Za-zÀ-ú]/.test(t)) return;
    const nome = b.getAttribute('title') || NOME_ICONE[t] || NOME_ICONE[[...t][0]];
    if (nome) b.setAttribute('aria-label', nome);
  });
}
(() => {
  let agendado = false;
  const agendar = () => { if (agendado) return; agendado = true; requestAnimationFrame(() => { agendado = false; paginarTabelas(); nomearBotoesIcone(); }); };
  const ligar = () => new MutationObserver((ms) => { if (ms.some((m) => m.target.closest && m.target.closest('table, .tw, .tabela-wrap, main, .gs-area, #conteudo'))) agendar(); })
    .observe(document.body, { childList: true, subtree: true });
  if (document.body) ligar(); else document.addEventListener('DOMContentLoaded', ligar);
})();

function campo(rotulo, html, classe) {
  return '<label class="campo' + (classe ? ' ' + classe : '') + '"><span>' + rotulo + '</span>' + html + '</label>';
}
function opcoesClientes(selecionado) {
  return '<option value="">— sem cliente —</option>' + E.clientes.map((c) =>
    '<option value="' + c.id + '"' + (c.id === selecionado ? ' selected' : '') + '>' + esc(c.nome) +
    (c.grupos && c.grupos.nome ? ' · ' + esc(c.grupos.nome) : '') + '</option>').join('');
}
function datalistGrupos(id) {
  return '<datalist id="' + id + '">' + E.grupos.map((g) => '<option value="' + esc(g.nome) + '">').join('') + '</datalist>';
}
function datalistPessoas(id) {
  return '<datalist id="' + id + '">' + Object.keys(PESSOA).map((p) => '<option value="' + p + '">').join('') + '</datalist>';
}
function nomeGrupo(id) { const g = E.grupos.find((x) => x.id === id); return g ? g.nome : ''; }

// Devolve o id do grupo com esse nome; cria se ainda não existir.
async function grupoPorNome(nome) {
  nome = String(nome || '').trim();
  if (!nome) return null;
  const achado = E.grupos.find((g) => normalizar(g.nome) === normalizar(nome));
  if (achado) return achado.id;
  const novo = await q(sb.from('grupos').insert({ nome }).select().single());
  E.grupos.push(novo);
  E.grupos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return novo.id;
}

// ──────────────── tabelas: ordenar clicando no cabeçalho ───────────────
// Um ouvinte só, por delegação. Cada <td> pode trazer data-ord com o valor
// exato (número ou data ISO); sem ele, ordena pelo texto.
document.addEventListener('click', (ev) => {
  const th = ev.target.closest && ev.target.closest('table.ordenavel thead th');
  if (!th || th.classList.contains('sem-ordem')) return;
  const tabela = th.closest('table'), corpo = tabela.tBodies[0];
  if (!corpo) return;
  const idx = Array.from(th.parentNode.children).indexOf(th);
  const numerica = th.classList.contains('num') || th.dataset.tipo === 'num' || th.dataset.tipo === 'data';
  const anterior = th.getAttribute('aria-sort');
  const desc = anterior ? anterior === 'ascending' : numerica;   // 1º clique: número/data maior→menor, texto A→Z
  tabela.querySelectorAll('thead th').forEach((t) => t.removeAttribute('aria-sort'));
  th.setAttribute('aria-sort', desc ? 'descending' : 'ascending');
  const chave = (tr) => {
    const td = tr.children[idx];
    if (!td) return null;
    const v = td.dataset.ord != null ? td.dataset.ord : td.textContent.trim();
    if (v === '' || v === '—') return null;
    if (numerica) { const n = Number(v); return isNaN(n) ? v : n; }
    return normalizar(v);
  };
  const linhas = Array.from(corpo.rows).filter((tr) => !tr.classList.contains('fixa'));
  linhas.sort((a, b) => {
    const x = chave(a), y = chave(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;                     // vazio sempre por último
    if (y == null) return -1;
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR');
    return desc ? -c : c;
  });
  linhas.forEach((tr) => corpo.appendChild(tr));
});

// Seção recolhível (estado em memória: volta aberta ao reabrir o sistema).
const _recolhido = {};
function blocoRecolhivel(id, titulo, corpo) {
  const f = _recolhido[id];
  return '<div class="card recolhivel' + (f ? ' fechado' : '') + '" id="' + id + '">' +
    '<button type="button" class="card-hd recolhe" data-recolhe="' + id + '" aria-expanded="' + (f ? 'false' : 'true') + '">' +
    '<span>' + titulo + '</span><span class="seta">▼</span></button><div class="recolhivel-bd">' + corpo + '</div></div>';
}
document.addEventListener('click', (ev) => {
  const b = ev.target.closest && ev.target.closest('[data-recolhe]');
  if (!b) return;
  const el = $(b.dataset.recolhe);
  _recolhido[b.dataset.recolhe] = el.classList.toggle('fechado');
  b.setAttribute('aria-expanded', _recolhido[b.dataset.recolhe] ? 'false' : 'true');
});

async function carregarCadastros(forcar) {
  if (!forcar && _cadQuando && Date.now() - _cadQuando < 60000) return;
  if (_cadBusca) return _cadBusca;
  _cadBusca = (async () => {
    const [clientes, grupos] = await Promise.all([
      buscarTodos(() => sb.from('clientes').select((window.ERP_COLS_CLIENTE || '*') + ', grupos(nome)').order('nome')),
      buscarTodos(() => sb.from('grupos').select('*').order('nome'))
    ]);
    E.clientes = clientes; E.grupos = grupos; _cadQuando = Date.now();
  })();
  try { await _cadBusca; } finally { _cadBusca = null; }
}
// (carregarCadastros) Clientes e grupos: uma busca serve por 60 s (trocar de tela não busca de novo);
// qualquer gravação (aviso "✓") ou recarga descarta a cópia e a próxima tela busca de novo.
let _cadQuando = 0, _cadBusca = null;
function invalidarCadastros() { _cadQuando = 0; }

// ── navegação dentro do ERP: cada tela desenha no painel que o ERP mostrou ──
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

'use strict';
// ═══════════════════════════════════════════════════════════════════
// Gráficos em SVG escrito à mão (sem biblioteca externa), no padrão
// "telas com dados" do escritório:
//  · barra de ranking  → rampa azul pelo posto (maior = mais escuro)
//  · série mensal      → passado #8CAADE, mês atual #16294B, futuro #C6D1EF
//  · rosca por órgão   → cor fixa por categoria, saturação contida
// Todo gráfico tem dica ao passar o mouse (valor exato) e legenda/rótulo,
// para a cor nunca ser a única forma de identificar.
// ═══════════════════════════════════════════════════════════════════

const RAMPA_AZUL = ['#16294B', '#223A66', '#2E4C81', '#3B5E9C', '#4A71B5',
                    '#5D84C5', '#7397D3', '#8CAADE', '#A8BDE7', '#C6D1EF'];
function tomAzul(i, n) {
  if (!n || n <= 1) return RAMPA_AZUL[0];
  const passos = Math.min(n, RAMPA_AZUL.length);
  const k = Math.round(i * (RAMPA_AZUL.length - 1) / (passos - 1));
  return RAMPA_AZUL[Math.min(k, RAMPA_AZUL.length - 1)];
}
// Ordem e tons validados (daltonismo e visão normal) — ver sistema/README.md.
const CORES_ORGAO = { 'PGFN': '#5873C1', 'AGE/MG': '#AD6833', 'RFB': '#23906F', 'SEFAZ/MG': '#9A79D2' };
const COR_MES = { passado: '#8CAADE', atual: '#16294B', futuro: '#C6D1EF' };

// Dica flutuante única, alimentada por data-dica.
(function () {
  const dica = document.createElement('div');
  dica.id = 'dica-grafico'; dica.setAttribute('role', 'tooltip');
  (document.getElementById('gs-raiz') || document.body).appendChild(dica);
  document.addEventListener('mousemove', (ev) => {
    const alvo = ev.target.closest && ev.target.closest('[data-dica]');
    if (!alvo) { dica.style.opacity = 0; return; }
    dica.textContent = alvo.getAttribute('data-dica');
    const x = Math.min(ev.clientX + 14, window.innerWidth - dica.offsetWidth - 8);
    dica.style.left = x + 'px'; dica.style.top = (ev.clientY + 14) + 'px'; dica.style.opacity = 1;
  });
})();

// Ranking horizontal: [{rotulo, valor}] já em ordem decrescente.
function graficoRanking(itens, opc) {
  opc = opc || {};
  if (!itens.length) return '<div class="vazio">Sem dados para o gráfico.</div>';
  const max = Math.max(...itens.map((i) => i.valor), 1);
  const alt = 30, larg = 640, esq = 170, dir = 110, util = larg - esq - dir;
  const h = itens.length * alt + 6;
  const ordem = itens.map((_, i) => i).sort((a, b) => itens[b].valor - itens[a].valor);
  const cor = []; ordem.forEach((orig, posto) => { cor[orig] = tomAzul(posto, itens.length); });
  let s = '<svg class="grafico" viewBox="0 0 ' + larg + ' ' + h + '" role="img" aria-label="' + esc(opc.titulo || 'Ranking') + '">';
  itens.forEach((it, i) => {
    const y = i * alt + 4, w = Math.max(2, it.valor / max * util);
    const nome = it.rotulo.length > 24 ? it.rotulo.slice(0, 23) + '…' : it.rotulo;
    const dica = it.rotulo + ': ' + (opc.fmt ? opc.fmt(it.valor) : brl(it.valor)) + (it.extra ? ' · ' + it.extra : '');
    s += '<g data-dica="' + esc(dica) + '"' + (it.acao ? ' class="clicavel" data-acao="' + esc(it.acao) + '"' : '') + '>' +
      '<rect x="0" y="' + (y - 2) + '" width="' + larg + '" height="' + alt + '" fill="transparent"/>' +
      '<text x="' + (esq - 10) + '" y="' + (y + 16) + '" text-anchor="end" class="g-rot">' + esc(nome) + '</text>' +
      '<path d="M' + esq + ',' + (y + 4) + ' h' + (w - 4) + ' a4,4 0 0 1 4,4 v10 a4,4 0 0 1 -4,4 h-' + (w - 4) + ' z" fill="' + cor[i] + '"/>' +
      '<text x="' + (esq + w + 8) + '" y="' + (y + 16) + '" class="g-val">' + esc((opc.fmt || brlCurto)(it.valor)) + '</text></g>';
  });
  return s + '</svg>';
}

// Colunas por mês: [{rotulo, valor, estado:'passado'|'atual'|'futuro', dica}]
function graficoMensal(itens, opc) {
  opc = opc || {};
  if (!itens.length) return '<div class="vazio">Sem dados para o gráfico.</div>';
  const max = Math.max(...itens.map((i) => i.valor), 1);
  const larg = 640, h = 220, base = 180, topo = 22, col = larg / itens.length, bw = Math.min(34, col * 0.62);
  let s = '<svg class="grafico" viewBox="0 0 ' + larg + ' ' + h + '" role="img" aria-label="' + esc(opc.titulo || 'Por mês') + '">';
  // grade recessiva: metade e topo
  [0.5, 1].forEach((f) => {
    const y = base - (base - topo) * f;
    s += '<line x1="0" x2="' + larg + '" y1="' + y + '" y2="' + y + '" class="g-grade"/>' +
         '<text x="2" y="' + (y - 4) + '" class="g-eixo">' + esc(brlCurto(max * f)) + '</text>';
  });
  s += '<line x1="0" x2="' + larg + '" y1="' + base + '" y2="' + base + '" class="g-base"/>';
  itens.forEach((it, i) => {
    const x = i * col + (col - bw) / 2, hh = it.valor > 0 ? Math.max(3, it.valor / max * (base - topo)) : 0;
    const cor = COR_MES[it.estado] || COR_MES.passado;
    s += '<g data-dica="' + esc(it.dica || (it.rotulo + ': ' + brl(it.valor))) + '">' +
      '<rect x="' + (i * col) + '" y="' + topo + '" width="' + col + '" height="' + (base - topo + 30) + '" fill="transparent"/>' +
      (hh ? '<path d="M' + x + ',' + base + ' v-' + (hh - 4) + ' a4,4 0 0 1 4,-4 h' + (bw - 8) + ' a4,4 0 0 1 4,4 v' + (hh - 4) + ' z" fill="' + cor + '"/>' : '') +
      '<text x="' + (x + bw / 2) + '" y="' + (base + 16) + '" text-anchor="middle" class="g-eixo' + (it.estado === 'atual' ? ' g-forte' : '') + '">' + esc(it.rotulo) + '</text>' +
      (it.estado === 'atual' && hh ? '<text x="' + (x + bw / 2) + '" y="' + (base - hh - 6) + '" text-anchor="middle" class="g-val">' + esc(brlCurto(it.valor)) + '</text>' : '') +
      '</g>';
  });
  s += '</svg>';
  if (opc.legenda !== false) {
    s += '<div class="legenda"><span><i style="background:' + COR_MES.passado + '"></i>Meses anteriores</span>' +
      '<span><i style="background:' + COR_MES.atual + '"></i>Mês atual</span>' +
      (itens.some((i) => i.estado === 'futuro') ? '<span><i style="background:' + COR_MES.futuro + '"></i>Próximos meses (previsto)</span>' : '') + '</div>';
  }
  return s;
}

// Rosca: [{nome, valor}] com cores de CORES_ORGAO; legenda com % e valor.
function graficoRosca(itens, opc) {
  opc = opc || {};
  const total = soma(itens, (i) => i.valor);
  if (!(total > 0)) return '<div class="vazio">Sem valores para distribuir.</div>';
  const R = 70, r = 44, cx = 80, cy = 80;
  let ang = -Math.PI / 2, s = '<div class="rosca"><svg viewBox="0 0 160 160" role="img" aria-label="' + esc(opc.titulo || 'Distribuição') + '">';
  const ponto = (a, raio) => [cx + raio * Math.cos(a), cy + raio * Math.sin(a)];
  itens.filter((i) => i.valor > 0).forEach((it) => {
    const frac = it.valor / total, a2 = ang + frac * Math.PI * 2 - (frac < 1 ? 0.02 : 0);   // 0,02 rad = fresta de superfície
    const [x1, y1] = ponto(ang, R), [x2, y2] = ponto(a2, R), [x3, y3] = ponto(a2, r), [x4, y4] = ponto(ang, r);
    const grande = a2 - ang > Math.PI ? 1 : 0;
    const d = frac >= 0.999
      ? 'M' + (cx - R) + ',' + cy + ' a' + R + ',' + R + ' 0 1 0 ' + (2 * R) + ',0 a' + R + ',' + R + ' 0 1 0 -' + (2 * R) + ',0 M' + (cx - r) + ',' + cy + ' a' + r + ',' + r + ' 0 1 1 ' + (2 * r) + ',0 a' + r + ',' + r + ' 0 1 1 -' + (2 * r) + ',0'
      : 'M' + x1 + ',' + y1 + ' A' + R + ',' + R + ' 0 ' + grande + ' 1 ' + x2 + ',' + y2 + ' L' + x3 + ',' + y3 + ' A' + r + ',' + r + ' 0 ' + grande + ' 0 ' + x4 + ',' + y4 + ' Z';
    s += '<path d="' + d + '" fill="' + (CORES_ORGAO[it.nome] || '#8B93A3') + '" fill-rule="evenodd" data-dica="' +
      esc(it.nome + ': ' + brl(it.valor) + ' (' + (frac * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%)') + '"/>';
    ang += frac * Math.PI * 2;
  });
  s += '<text x="80" y="76" text-anchor="middle" class="g-eixo">Total</text><text x="80" y="94" text-anchor="middle" class="g-val g-forte">' +
    esc(brlCurto(total)) + '</text></svg><div class="rosca-leg">';
  itens.forEach((it) => {
    s += '<div data-dica="' + esc(it.nome + ': ' + brl(it.valor)) + '"><i style="background:' + (CORES_ORGAO[it.nome] || '#8B93A3') + '"></i>' +
      '<span class="nome">' + esc(it.nome) + '</span><span class="mono">' +
      (it.valor / total * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%</span><span class="mono sub">' + esc(brlCurto(it.valor)) + '</span></div>';
  });
  return s + '</div></div>';
}

'use strict';
// ═══════════════════════════════════════════════════════════════════
// Início (resumo das duas empresas) e Painel Executivo (passivo
// tributário consolidado dos clientes, como no ERP antigo).
// ═══════════════════════════════════════════════════════════════════

function kpi(rotulo, valor, cor, sub) {
  return '<div class="kpi ' + (cor || '') + '"><div class="kpi-l">' + rotulo + '</div><div class="kpi-v">' + valor +
    '</div><div class="kpi-s">' + esc(sub || '') + '</div></div>';
}

// Mesmo cálculo do resumo_financeiro do banco — usado só enquanto o SQL novo não foi rodado.
async function resumoFinanceiroNoNavegador(ini, fim, h) {
  const [abertos, pagos, atr] = await Promise.all([
    buscarTodos(() => sb.from('lancamentos').select('empresa, tipo, valor, redutor').gte('vencimento', ini).lte('vencimento', fim).eq('pago', false).eq('perda', false)),
    buscarTodos(() => sb.from('lancamentos').select('empresa, tipo, valor, redutor').gte('data_pagamento', ini).lte('data_pagamento', fim).eq('pago', true)),
    buscarTodos(() => sb.from('lancamentos').select('empresa, tipo, valor, redutor').lt('vencimento', h).eq('pago', false).eq('perda', false))
  ]);
  const out = {};
  ['escritorio', 'contabilidade'].forEach((emp) => {
    const de = (lista, tipo) => lista.filter((l) => l.empresa === emp && l.tipo === tipo);
    out[emp] = { recebido: soma(de(pagos, 'receita'), vl), n_recebido: de(pagos, 'receita').length, a_receber: soma(de(abertos, 'receita'), vl), n_a_receber: de(abertos, 'receita').length,
      em_atraso: soma(de(atr, 'receita'), vl), n_em_atraso: de(atr, 'receita').length, a_pagar: soma(de(abertos, 'despesa'), vl), n_a_pagar: de(abertos, 'despesa').length };
  });
  return out;
}

// ─────────────────────────── INÍCIO ────────────────────────────────
TELAS.inicio = async function () {
  const h = hojeISO(), ini = iso(primeiroDiaDoMes(new Date())), fim = iso(fimDoMes(new Date()));
  const sel = '*, grupos(nome), clientes(nome)';
  // totais prontos no banco (resumo_financeiro); só as listas vêm linha a linha
  const [totais, atrasados, proximos] = await Promise.all([
    q(sb.rpc('resumo_financeiro', { p_de: ini, p_ate: fim })).catch(() => resumoFinanceiroNoNavegador(ini, fim, h)),
    buscarTodos(() => sb.from('lancamentos').select(sel).lt('vencimento', h).eq('pago', false).eq('perda', false).order('vencimento')),
    buscarTodos(() => sb.from('lancamentos').select(sel).gte('vencimento', h).lte('vencimento', somarDias(h, 15)).eq('pago', false).eq('perda', false).order('vencimento'))
  ]);
  const linha = (emp, titulo) => { const t = totais[emp] || {};
    return '<div class="kpis-titulo">' + titulo + '</div><div class="kpis">' +
    kpi('Recebido no mês', brl(t.recebido || 0), 'verde', (t.n_recebido || 0) + ' recebimento(s)') +
    kpi('A receber no mês', brl(t.a_receber || 0), '', (t.n_a_receber || 0) + ' em aberto') +
    kpi('Em atraso', brl(t.em_atraso || 0), 'vermelho', (t.n_em_atraso || 0) + ' vencido(s)') +
    kpi('A pagar no mês', brl(t.a_pagar || 0), 'ambar', (t.n_a_pagar || 0) + ' conta(s)') +
    '</div>'; };

  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Olá, ' + esc((E.perfil.nome || '').split(' ')[0]) + '</h1>' +
    '<p>Resumo de ' + esc(nomeMes(new Date())) + '</p></div>' +
    '<div class="acoes"><button class="btn btn-p" data-novo="receita">+ Receita</button>' +
    '<button class="btn btn-o" data-novo="despesa">+ Despesa</button>' +
    '<button class="btn btn-o" data-novo="contrato">+ Contrato</button></div></div>' +
    '<div id="ini-fila"></div>' +
    (pode('financeiro_juridico') ? linha('escritorio', '💼 Honorários Jurídico') : '') + (pode('financeiro_contab') ? linha('contabilidade', '🧮 Contabilidade') : '') +
    (pode('financeiro_juridico') || pode('financeiro_contab') ? '<div class="duas-col">' +
    cardLista('⚠ Em atraso', atrasados, 'Nada em atraso. 👏') +
    cardLista('🗓 Próximos 15 dias', proximos, 'Nenhum vencimento nos próximos 15 dias.') +
    '</div>' : '');
  if (typeof cardMinhaFila === 'function') cardMinhaFila().then((c) => { const el = $('ini-fila'); if (el) { el.innerHTML = c.html; c.ligar(el); } }).catch((e) => console.error(e));
  ligarAcoesLancamentos($('conteudo'));
  ligarBotoesNovo($('conteudo'));
};

function cardLista(titulo, lista, vazio) {
  const linhas = lista.map((l) => {
    const quem = (l.grupos && l.grupos.nome) || l.favorecido || (l.clientes && l.clientes.nome) || '';
    return '<tr><td class="mono" data-ord="' + l.vencimento + '">' + dataBR(l.vencimento) + '</td><td><b>' + esc(quem || l.descricao) + '</b>' +
      '<div class="sub">' + (l.empresa === 'contabilidade' ? 'Contabilidade · ' : 'Jurídico · ') + esc(l.descricao) + '</div></td>' +
      '<td class="num mono ' + (l.tipo === 'receita' && !l.redutor ? 'valor-rec' : 'valor-desp') + '" data-ord="' + (l.tipo === 'despesa' ? -l.valor : vl(l)) + '">' + (l.tipo === 'despesa' || l.redutor ? '−\u00A0' : '') + brl(l.valor) + (l.redutor ? '<div class="sub">redutor</div>' : '') + '</td>' +
      '<td class="acoes-l"><button class="btn btn-v btn-mini" data-pagar="' + l.id + '">✓ ' + (l.tipo === 'receita' ? 'Recebido' : 'Pago') + '</button></td></tr>';
  }).join('');
  return '<div class="card"><div class="card-hd">' + titulo + '<span class="pill neutro">' + lista.length + '</span></div>' +
    (lista.length ? '<div class="tabela-wrap lista-curta"><table class="ordenavel"><thead><tr><th data-tipo="data">Data</th><th>Quem</th><th class="num">Valor</th><th class="sem-ordem"></th></tr></thead><tbody>' +
      linhas + '</tbody></table></div>' : '<div class="vazio">' + vazio + '</div>') + '</div>';
}

function ligarBotoesNovo(raiz) {
  raiz.querySelectorAll('[data-novo]').forEach((b) => {
    b.onclick = () => {
      const t = b.dataset.novo;
      if (t === 'contrato') formContrato();
      else if (t === 'cliente') formCliente();
      else formLancamento({ tipo: t, empresa: 'escritorio' });
    };
  });
}

// ─────────────────────────── PAINEL EXECUTIVO ──────────────────────
// Fonte única dos órgãos: KPI, rosca, tabela e ficha leem daqui.
const ORGAOS = [
  { k: 'pgfn',     nome: 'PGFN',     neg: 'pgfn_negociada' },
  { k: 'age_mg',   nome: 'AGE/MG',   neg: 'age_mg_negociada' },
  { k: 'rfb',      nome: 'RFB',      neg: 'rfb_negociada' },
  { k: 'sefaz_mg', nome: 'SEFAZ/MG', neg: null }
];
function passivo(c) { return soma(ORGAOS, (o) => c[o.k]); }

TELAS.painel = async function () {
  E.painel = E.painel || { tipo: 'ativos', grupo: '', pessoa: '', busca: '' };
  await carregarCadastros();
  const P = E.painel;
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Painel Executivo</h1><p>Passivo tributário consolidado · todos os grupos e empresas</p></div></div>' +
    '<div class="filtros" id="pn-barra">' +
    '<div class="segmento" id="pn-tipo">' + [['ativos', 'Ativos'], ['Consultoria', 'Consultoria'], ['Demanda', 'Serviço pontual'], ['Inativo', 'Inativos'], ['todos', 'Todos']]
      .map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<select class="busca sel" id="pn-grupo" autocomplete="off"><option value="">Todos os grupos</option>' +
    E.grupos.map((g) => '<option value="' + g.id + '">' + esc(g.nome) + '</option>').join('') + '</select>' +
    '<div class="segmento" id="pn-pessoa">' + [['', 'Todas'], ['cnpj', 'CNPJs'], ['cpf', 'CPFs']].map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<input class="busca" id="pn-busca" placeholder="Buscar empresa, sócio ou CPF/CNPJ" autocomplete="off">' +
    '<button class="chip" id="pn-limpar">Limpar filtros</button>' +
    '</div><div id="pn-corpo"></div>';
  $('pn-tipo').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { P.tipo = b.dataset.v; pintarPainel(); } };
  $('pn-pessoa').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { P.pessoa = b.dataset.v; pintarPainel(); } };
  $('pn-grupo').onchange = (ev) => { P.grupo = ev.target.value; pintarPainel(); };
  let t;
  $('pn-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { P.busca = ev.target.value; pintarPainel(); }, 250); };
  $('pn-limpar').onclick = () => { Object.assign(P, { tipo: 'ativos', grupo: '', pessoa: '', busca: '' }); pintarPainel(); window.scrollTo(0, 0); };
  pintarPainel();
};

function filtrarPainel() {
  const P = E.painel, b = normalizar(P.busca), bd = soDigitos(P.busca);
  return E.clientes.filter((c) => {
    if (P.tipo === 'ativos' && c.tipo === 'Inativo') return false;
    if (P.tipo !== 'ativos' && P.tipo !== 'todos' && c.tipo !== P.tipo) return false;
    if (P.grupo && c.grupo_id !== P.grupo) return false;
    const doc = soDigitos(c.cpf_cnpj);
    if (P.pessoa === 'cnpj' && doc.length !== 14) return false;
    if (P.pessoa === 'cpf' && doc.length !== 11) return false;
    if (b && !(normalizar(c.nome + ' ' + c.socio_admin + ' ' + (c.grupos ? c.grupos.nome : '')).includes(b) || (bd && doc.includes(bd)))) return false;
    return true;
  });
}

function pintarPainel() {
  const P = E.painel;
  document.querySelectorAll('#pn-tipo button').forEach((x) => x.classList.toggle('ativo', x.dataset.v === P.tipo));
  document.querySelectorAll('#pn-pessoa button').forEach((x) => x.classList.toggle('ativo', x.dataset.v === P.pessoa));
  if (document.activeElement !== $('pn-grupo')) $('pn-grupo').value = P.grupo;
  if (document.activeElement !== $('pn-busca')) $('pn-busca').value = P.busca;
  const lista = filtrarPainel();
  const total = soma(lista, passivo);
  const negociado = soma(lista, (c) => soma(ORGAOS.filter((o) => o.neg), (o) => c[o.neg]));
  const porOrgao = ORGAOS.map((o) => ({ nome: o.nome, valor: soma(lista, (c) => c[o.k]) }));
  const porGrupo = {};
  lista.forEach((c) => { const n = c.grupos ? c.grupos.nome : 'Sem grupo'; porGrupo[n] = (porGrupo[n] || 0) + passivo(c); });
  const topGrupos = Object.entries(porGrupo).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([rotulo, valor]) => { const g = E.grupos.find((x) => x.nome === rotulo); return { rotulo, valor, acao: g ? g.id : '' }; });
  const comProc = lista.filter((c) => c.procuracao === true).length;
  const omissos = lista.filter((c) => String(c.capag).toUpperCase() === 'OMISSO').length;

  $('pn-corpo').innerHTML =
    '<div class="kpis">' +
    kpi('Passivo total', brl(total), 'vermelho', lista.length + ' entidade(s) no recorte') +
    ORGAOS.map((o) => kpi(o.nome, brl(soma(lista, (c) => c[o.k])), '', lista.filter((c) => Number(c[o.k]) > 0).length + ' com débito')).join('') +
    kpi('Já negociado', brl(negociado), 'verde', 'RFB + PGFN + AGE/MG negociadas') +
    kpi('Procuração', comProc + ' de ' + lista.length, '', omissos ? omissos + ' com CAPAG omisso' : 'nenhuma CAPAG omissa') +
    '</div>' +
    '<div class="duas-col">' +
    blocoRecolhivel('pn-g-grupo', '🏛 Passivo por grupo <span class="sub">— soma de todos os órgãos; clique para filtrar</span>',
      '<div class="card-bd">' + graficoRanking(topGrupos, { titulo: 'Passivo por grupo' }) + '</div>') +
    blocoRecolhivel('pn-g-orgao', '📊 Distribuição por órgão <span class="sub">— % do passivo total</span>',
      '<div class="card-bd">' + graficoRosca(porOrgao, { titulo: 'Passivo por órgão' }) + '</div>') +
    '</div>' +
    '<div class="card"><div class="card-hd">🏢 Empresas do grupo<span class="sub">clique no cabeçalho para ordenar · clique na linha para abrir a ficha</span></div>' +
    (lista.length ? '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Grupo</th><th>Entidade / Sócio</th><th>CPF/CNPJ</th>' +
      ORGAOS.map((o) => '<th class="num">' + o.nome + '</th>').join('') +
      '<th class="num">Total</th><th>CAPAG</th><th>Situação</th><th>Procuração</th></tr></thead><tbody>' +
      lista.map((c) => '<tr class="clicavel" data-cli="' + c.id + '"><td title="' + esc(c.grupos ? c.grupos.nome : '') + '">' + esc(c.grupos ? c.grupos.nome : '—') + '</td>' +
        '<td><b>' + esc(c.nome) + '</b>' + (c.socio_admin ? '<div class="sub">' + esc(c.socio_admin) + '</div>' : '') + '</td>' +
        '<td class="mono">' + esc(mascaraDoc(c.cpf_cnpj) || '—') + '</td>' +
        ORGAOS.map((o) => '<td class="num mono" data-ord="' + (c[o.k] == null ? '' : c[o.k]) + '">' + (Number(c[o.k]) ? esc(brl(c[o.k])) : '<span class="sub">—</span>') + '</td>').join('') +
        '<td class="num mono" data-ord="' + passivo(c) + '"><b>' + (passivo(c) ? brl(passivo(c)) : '<span class="sub">—</span>') + '</b></td>' +
        '<td data-ord="' + esc(c.capag || '') + '">' + pillCapag(c.capag) + '</td><td>' + pillSitCad(c.situacao_cadastral) + '</td><td>' + pillSimNao(c.procuracao) + '</td></tr>').join('') +
      '</tbody><tfoot><tr><td colspan="3">Total (' + lista.length + ')</td>' + ORGAOS.map((o) => '<td class="num mono">' + brl(soma(lista, (c) => c[o.k])) + '</td>').join('') +
      '<td class="num mono">' + brl(total) + '</td><td colspan="3"></td></tr></tfoot></table></div>'
      : '<div class="vazio">Nenhuma entidade neste recorte.</div>') + '</div>';

  $('pn-corpo').querySelectorAll('[data-cli]').forEach((tr) => tr.onclick = () => formCliente(E.clientes.find((x) => x.id === tr.dataset.cli), () => pintarPainel()));
  $('pn-corpo').querySelectorAll('g[data-acao]').forEach((g) => g.onclick = () => { if (g.dataset.acao) { P.grupo = g.dataset.acao; pintarPainel(); } });
}

'use strict';
// ═══════════════════════════════════════════════════════════════════
// Honorários Jurídico (empresa 'escritorio') e Honorários Contabilidade
// (empresa 'contabilidade'). Mesma tela, mesmas abas do ERP antigo.
// A barra de filtros é montada uma vez; filtro repinta só #fin-corpo.
// ═══════════════════════════════════════════════════════════════════

const EMPRESAS = {
  escritorio:    { tela: 'juridico',      titulo: 'Honorários Jurídico',      sub: 'Honorários do escritório · recebimentos · análise por pessoa e por período' },
  contabilidade: { tela: 'contabilidade', titulo: 'Honorários Contabilidade', sub: 'Financeiro da empresa de contabilidade · a receber, a pagar, receita e despesa' }
};
const ABAS_FIN = [
  { id: 'analise',   rot: '📊 Análise' },
  { id: 'areceber',  rot: '📋 A Receber' },
  { id: 'recebidos', rot: '✅ Recebidos' },
  { id: 'prejuizo',  rot: '📉 Prejuízo' },
  { id: 'apagar',    rot: '📤 A Pagar' },
  { id: 'despesas',  rot: '💸 Despesas pagas' }
];
// Abas que mostram "todos os meses" ao abrir; as demais abrem no mês atual.
const ABRE_EM_TODOS = { areceber: true, apagar: true, prejuizo: true };

function estadoFin(empresa) {
  E.fin = E.fin || {};
  if (!E.fin[empresa]) E.fin[empresa] = { aba: 'analise', mes: primeiroDiaDoMes(new Date()), todos: false, grupo: '', resp: '', busca: '' };
  return E.fin[empresa];
}

TELAS.juridico = () => telaHonorarios('escritorio');
TELAS.contabilidade = () => telaHonorarios('contabilidade');

async function telaHonorarios(empresa) {
  const F = estadoFin(empresa), info = EMPRESAS[empresa];
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>' + info.titulo + '</h1><p>' + info.sub + '</p></div>' +
    '<div class="acoes"><button class="btn btn-p" data-novo-l="receita">+ Receita</button>' +
    '<button class="btn btn-o" data-novo-l="despesa">+ Despesa</button></div></div>' +
    '<div class="abas" id="fin-abas">' + ABAS_FIN.map((a) => '<button data-aba="' + a.id + '">' + a.rot + '</button>').join('') + '</div>' +
    '<div class="filtros" id="fin-barra">' +
    '<div class="mes-sel" id="fin-mes"><button data-mes="-1" aria-label="Mês anterior">‹</button><span></span><button data-mes="1" aria-label="Próximo mês">›</button></div>' +
    '<button class="chip" id="fin-todos">Todos os meses</button>' +
    '<select class="busca sel" id="fin-grupo" autocomplete="off"><option value="">Todos os grupos</option>' +
    E.grupos.map((g) => '<option value="' + g.id + '">' + esc(g.nome) + '</option>').join('') + '</select>' +
    '<select class="busca sel" id="fin-resp" autocomplete="off"><option value="">Todas as pessoas</option>' +
    Object.keys(PESSOA).map((p) => '<option>' + p + '</option>').join('') + '</select>' +
    '<input class="busca" id="fin-busca" placeholder="Buscar descrição, grupo ou fornecedor" autocomplete="off">' +
    '<span class="pill neutro periodo" id="fin-periodo"></span>' +
    '</div><div id="fin-corpo"><div class="carregando">Carregando…</div></div>';

  const c = $('conteudo');
  c.querySelectorAll('[data-novo-l]').forEach((b) => b.onclick = () =>
    formLancamento({ tipo: b.dataset.novoL, empresa, grupo_id: F.grupo || null }, () => pintarFin(empresa)));
  c.querySelectorAll('#fin-abas [data-aba]').forEach((b) => b.onclick = () => {
    F.aba = b.dataset.aba; F.todos = !!ABRE_EM_TODOS[F.aba]; pintarFin(empresa);
  });
  c.querySelectorAll('#fin-mes [data-mes]').forEach((b) => b.onclick = () => {
    F.mes = new Date(F.mes.getFullYear(), F.mes.getMonth() + Number(b.dataset.mes), 1); F.todos = false; pintarFin(empresa);
  });
  $('fin-todos').onclick = () => { F.todos = !F.todos; pintarFin(empresa); };
  $('fin-grupo').onchange = (ev) => { F.grupo = ev.target.value; pintarFin(empresa); };
  $('fin-resp').onchange = (ev) => { F.resp = ev.target.value; pintarFin(empresa); };
  let t;
  $('fin-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; pintarLista(empresa); }, 250); };
  await pintarFin(empresa);
}

// Atualiza a barra no lugar (sem recriar) e repinta o corpo.
function sincronizarBarraFin(empresa) {
  const F = estadoFin(empresa);
  document.querySelectorAll('#fin-abas [data-aba]').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === F.aba));
  const semMes = F.aba === 'prejuizo';
  $('fin-mes').classList.toggle('escondido', semMes);
  $('fin-todos').classList.toggle('escondido', semMes || F.aba === 'analise');
  $('fin-todos').classList.toggle('ativo', F.todos);
  $('fin-mes').classList.toggle('apagado', F.todos && F.aba !== 'analise');
  $('fin-mes').querySelector('span').textContent = nomeMes(F.mes);
  const g = $('fin-grupo'), r = $('fin-resp'), b = $('fin-busca');
  if (document.activeElement !== g) g.value = F.grupo;
  if (document.activeElement !== r) r.value = F.resp;
  if (document.activeElement !== b) b.value = F.busca;
  const periodo = F.aba === 'prejuizo' ? 'Todos os meses'
    : F.aba === 'analise' ? 'Referência: ' + nomeMes(F.mes)
    : F.todos ? 'Todos os meses' : nomeMes(F.mes);
  const recorte = [periodo, F.grupo ? nomeGrupo(F.grupo) : '', F.resp].filter(Boolean).join(' · ');
  $('fin-periodo').textContent = '🗓 ' + recorte;
}

function consultaBase(empresa) {
  const F = estadoFin(empresa);
  let q1 = sb.from('lancamentos').select('*, grupos(nome), clientes(nome)').eq('empresa', empresa);
  if (F.grupo) q1 = q1.eq('grupo_id', F.grupo);
  if (F.resp) q1 = q1.eq('responsavel', F.resp);
  return q1;
}

async function pintarFin(empresa) {
  sincronizarBarraFin(empresa);
  const F = estadoFin(empresa), corpo = $('fin-corpo');
  corpo.innerHTML = '<div class="carregando">Carregando…</div>';
  try {
    if (F.aba === 'analise') await pintarAnalise(empresa);
    else await pintarLista(empresa, true);
  } catch (e) {
    console.error(e);
    corpo.innerHTML = '<div class="card"><div class="card-bd msg-erro">' + esc(erroAmigavel(e)) + '</div></div>';
  }
}

// ───────────────────────────── listas ──────────────────────────────
let _listaFin = [];
async function pintarLista(empresa, buscar) {
  const F = estadoFin(empresa);
  if (buscar) {
    const ini = iso(F.mes), fim = iso(fimDoMes(F.mes));
    _listaFin = await buscarTodos(() => {
      let c = consultaBase(empresa);
      switch (F.aba) {
        case 'areceber':  c = c.eq('tipo', 'receita').eq('pago', false).eq('perda', false); break;
        case 'recebidos': c = c.eq('tipo', 'receita').eq('pago', true); break;
        case 'prejuizo':  c = c.eq('tipo', 'receita').eq('perda', true); break;
        case 'apagar':    c = c.eq('tipo', 'despesa').eq('pago', false); break;
        case 'despesas':  c = c.eq('tipo', 'despesa').eq('pago', true); break;
      }
      const porPagamento = F.aba === 'recebidos' || F.aba === 'despesas';
      if (!F.todos && F.aba !== 'prejuizo') {
        const campo = porPagamento ? 'data_pagamento' : 'vencimento';
        c = c.gte(campo, ini).lte(campo, fim);
      }
      return c.order(porPagamento ? 'data_pagamento' : 'vencimento', { ascending: !porPagamento }).order('descricao');
    });
  }
  let lista = _listaFin;
  if (F.busca) {
    const b = normalizar(F.busca);
    lista = lista.filter((l) => normalizar([l.descricao, l.grupos && l.grupos.nome, l.clientes && l.clientes.nome, l.favorecido, l.categoria, l.obs].join(' ')).includes(b));
  }
  const total = soma(lista, vl);
  const atrasado = soma(lista.filter((l) => situacao(l) === 'vencido'), vl);
  const rotAba = ABAS_FIN.find((a) => a.id === F.aba).rot.replace(/^\S+\s/, '');
  $('fin-corpo').innerHTML =
    '<div class="kpis">' +
    kpi(rotAba, brl(total), F.aba === 'prejuizo' || F.aba === 'apagar' ? 'ambar' : F.aba === 'recebidos' ? 'verde' : '', lista.length + ' lançamento(s)') +
    (F.aba === 'areceber' || F.aba === 'apagar' ? kpi('Em atraso', brl(atrasado), 'vermelho', lista.filter((l) => situacao(l) === 'vencido').length + ' vencido(s)') : '') +
    '</div>' +
    '<div class="card">' + tabelaLancamentos(lista, { aba: F.aba }) + '</div>';
  ligarAcoesLancamentos($('fin-corpo'), () => pintarFin(empresa));
}

function tabelaLancamentos(lista, opc) {
  opc = opc || {};
  if (!lista.length) return '<div class="vazio">Nenhum lançamento aqui.</div>';
  const porPagamento = opc.aba === 'recebidos' || opc.aba === 'despesas';
  const compacta = !!opc.compacta;
  return '<div class="tabela-wrap"><table class="ordenavel"><thead><tr>' +
    '<th data-tipo="data">' + (porPagamento ? 'Pago em' : 'Vencimento') + '</th>' +
    (compacta ? '' : '<th>Grupo / Favorecido</th>') + '<th>Descrição</th>' +
    (compacta ? '' : '<th>Pessoa</th>') + '<th class="num">Valor</th><th>Situação</th><th class="sem-ordem"></th></tr></thead><tbody>' +
    lista.map((l) => {
      const data = porPagamento ? l.data_pagamento : l.vencimento;
      const quem = (l.grupos && l.grupos.nome) || l.favorecido || (l.clientes && l.clientes.nome) || '';
      return '<tr><td class="mono" data-ord="' + esc(data || '') + '">' + dataBR(data) +
        (porPagamento && l.vencimento !== data ? '<div class="sub">venc. ' + dataBR(l.vencimento) + '</div>' : '') + '</td>' +
        (compacta ? '' : '<td title="' + esc(quem) + '"><b>' + esc(quem || '—') + '</b>' + (l.clientes && l.grupos ? '<div class="sub">' + esc(l.clientes.nome) + '</div>' : '') + '</td>') +
        '<td>' + esc(l.descricao) + (l.categoria && !compacta ? '<div class="sub">' + esc(l.categoria) + (l.forma_pagamento ? ' · ' + esc(l.forma_pagamento) : '') + '</div>' : '') + '</td>' +
        (compacta ? '' : '<td>' + pillPessoa(l.responsavel) + '</td>') +
        '<td class="num mono ' + (l.tipo === 'receita' && !l.redutor ? 'valor-rec' : 'valor-desp') + '" data-ord="' + (l.tipo === 'despesa' ? -l.valor : vl(l)) + '">' + (l.tipo === 'despesa' || l.redutor ? '−\u00A0' : '') + brl(l.valor) + (l.redutor ? '<div class="sub">redutor</div>' : '') + '</td>' +
        '<td>' + pillSit(l) + '</td><td class="acoes-l">' +
        (l.pago ? '<button class="btn btn-o btn-mini" data-desfazer="' + l.id + '" title="Voltar para em aberto">↺</button> '
                : l.perda ? '' : '<button class="btn btn-v btn-mini" data-pagar="' + l.id + '">✓ ' + (l.tipo === 'receita' ? 'Recebido' : 'Pago') + '</button> ') +
        '<button class="btn btn-o btn-mini" data-editar="' + l.id + '">Editar</button></td></tr>';
    }).join('') +
    '</tbody><tfoot><tr><td colspan="' + (compacta ? 2 : 4) + '">Total (' + lista.length + ')</td><td class="num mono">' +
    brl(soma(lista, (l) => l.tipo === 'despesa' ? -l.valor : vl(l))) + '</td><td colspan="2"></td></tr></tfoot></table></div>';
}

function ligarAcoesLancamentos(raiz, depois) {
  const apos = depois || recarregar;
  raiz.querySelectorAll('[data-pagar]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    await q(sb.from('lancamentos').update({ pago: true, cobranca: '' }).eq('id', b.dataset.pagar));
    aviso('✓ Baixa registrada.'); await apos();
  }));
  raiz.querySelectorAll('[data-desfazer]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    await q(sb.from('lancamentos').update({ pago: false }).eq('id', b.dataset.desfazer));
    aviso('Lançamento voltou para "em aberto".'); await apos();
  }));
  raiz.querySelectorAll('[data-editar]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const l = await q(sb.from('lancamentos').select('*').eq('id', b.dataset.editar).single());
    formLancamento(l, apos);
  }));
}

// ───────────────────────────── análise ─────────────────────────────
async function pintarAnalise(empresa) {
  const F = estadoFin(empresa), h = hojeISO();
  const ini12 = iso(new Date(F.mes.getFullYear(), F.mes.getMonth() - 11, 1));
  const fimRef = iso(fimDoMes(F.mes)), iniRef = iso(F.mes);
  const fim3 = iso(fimDoMes(new Date(F.mes.getFullYear(), F.mes.getMonth() + 3, 1)));
  const [pagos, abertos, perdas] = await Promise.all([
    buscarTodos(() => consultaBase(empresa).eq('pago', true).gte('data_pagamento', ini12).lte('data_pagamento', fimRef)),
    buscarTodos(() => consultaBase(empresa).eq('pago', false).eq('perda', false)),
    buscarTodos(() => consultaBase(empresa).eq('tipo', 'receita').eq('perda', true))
  ]);
  const rec = (l) => l.tipo === 'receita', desp = (l) => l.tipo === 'despesa';
  const noMes = (l) => l.data_pagamento >= iniRef && l.data_pagamento <= fimRef;
  const recebidoMes = soma(pagos.filter((l) => rec(l) && noMes(l)), vl);
  const pagoMes = soma(pagos.filter((l) => desp(l) && noMes(l)), vl);
  const aReceber = abertos.filter(rec), aPagar = abertos.filter(desp);
  const atraso = aReceber.filter((l) => l.vencimento < h);
  const aReceberMes = aReceber.filter((l) => l.vencimento >= iniRef && l.vencimento <= fimRef);

  // série mensal: 12 meses recebidos + 3 meses previstos (a receber)
  const serie = [];
  const mesAtual = iso(primeiroDiaDoMes(new Date())).slice(0, 7);
  for (let i = -11; i <= 3; i++) {
    const d = new Date(F.mes.getFullYear(), F.mes.getMonth() + i, 1), chave = iso(d).slice(0, 7);
    const futuro = chave > mesAtual;
    const valor = futuro
      ? soma(aReceber.filter((l) => l.vencimento.slice(0, 7) === chave), vl)
      : soma(pagos.filter((l) => rec(l) && l.data_pagamento.slice(0, 7) === chave), vl);
    if (i > 0 && !futuro) continue;              // mês de referência no passado: não mostra "futuro" já ocorrido
    serie.push({ rotulo: mesCurto(d), valor, estado: futuro ? 'futuro' : chave === mesAtual ? 'atual' : 'passado',
                 dica: nomeMes(d) + ': ' + brl(valor) + (futuro ? ' a receber (previsto)' : ' recebido') });
  }
  // em aberto por grupo (top 10)
  const porGrupo = {};
  aReceber.forEach((l) => { const n = (l.grupos && l.grupos.nome) || l.favorecido || 'Sem grupo'; porGrupo[n] = (porGrupo[n] || 0) + vl(l); });
  const topGrupos = Object.entries(porGrupo).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([rotulo, valor]) => ({ rotulo, valor }));
  // recebido no mês por pessoa
  const porPessoa = {};
  pagos.filter((l) => rec(l) && noMes(l)).forEach((l) => { const p = l.responsavel || 'Sem pessoa'; porPessoa[p] = (porPessoa[p] || 0) + vl(l); });

  $('fin-corpo').innerHTML =
    '<div class="kpis">' +
    kpi('Recebido em ' + nomeMes(F.mes).split(' ')[0].toLowerCase(), brl(recebidoMes), 'verde', pagos.filter((l) => rec(l) && noMes(l)).length + ' recebimento(s)') +
    kpi('A receber no mês', brl(soma(aReceberMes, vl)), '', aReceberMes.length + ' em aberto') +
    kpi('Total em aberto', brl(soma(aReceber, vl)), '', aReceber.length + ' lançamento(s), todos os meses') +
    kpi('Em atraso', brl(soma(atraso, vl)), 'vermelho', atraso.length + ' vencido(s)') +
    (aPagar.length || pagoMes ? kpi('A pagar (aberto)', brl(soma(aPagar, vl)), 'ambar', 'pago no mês: ' + brl(pagoMes)) : '') +
    kpi('Prejuízo', brl(soma(perdas, vl)), 'ambar', perdas.length + ' crédito(s) perdido(s)') +
    '</div>' +
    blocoRecolhivel('fin-g-mensal-' + empresa, '📊 Recebido por mês e previsão', '<div class="card-bd">' + graficoMensal(serie, { titulo: 'Recebido por mês' }) + '</div>') +
    '<div class="duas-col">' +
    blocoRecolhivel('fin-g-grupo-' + empresa, '💰 Em aberto por grupo (10 maiores)', '<div class="card-bd">' + graficoRanking(topGrupos, { titulo: 'Em aberto por grupo' }) + '</div>') +
    blocoRecolhivel('fin-g-pessoa-' + empresa, '👤 Recebido no mês por pessoa', '<div class="card-bd">' + barrasPessoa(porPessoa) + '</div>') +
    '</div>' +
    '<div class="card"><div class="card-hd">⚠ Em atraso<span class="pill neutro">' + atraso.length + '</span></div>' + tabelaLancamentos(atraso.sort((a, b) => a.vencimento < b.vencimento ? -1 : 1), { aba: 'areceber' }) + '</div>';
  ligarAcoesLancamentos($('fin-corpo'), () => pintarFin(empresa));
}

// Barras por pessoa: a cor é a identidade da pessoa (única exceção à rampa azul).
function barrasPessoa(mapa) {
  const itens = Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  if (!itens.length) return '<div class="vazio">Nenhum recebimento no mês.</div>';
  const max = Math.max(...itens.map((i) => i[1]), 1);
  return '<div class="barras-pessoa">' + itens.map(([p, v]) => {
    const c = corPessoa(p);
    return '<div class="bp" data-dica="' + esc(p + ': ' + brl(v)) + '"><span class="bp-nome">' + esc(p) + '</span>' +
      '<span class="bp-trilho"><span class="bp-barra" style="width:' + (v / max * 100).toFixed(1) + '%;background:' + c.marca + '"></span></span>' +
      '<span class="mono bp-val">' + esc(brlCurto(v)) + '</span></div>';
  }).join('') + '</div>';
}

// ───────────────────────────── formulário ──────────────────────────
const CATEGORIAS = {
  receita: ['Consultoria', 'Fixo', 'Êxito', 'Execução', 'Comissão', 'Contabilidade', 'Honorários', 'Reembolso'],
  despesa: ['Sistema/Software', 'Folha de Pagamento', 'Comissão', 'Aluguel', 'Impostos', 'Custas processuais', 'Marketing', 'Outros']
};

function formLancamento(l, depois) {
  const novo = !l.id;
  const tipo = l.tipo || 'receita';
  const empresa = l.empresa || 'escritorio';
  const j = abrirJanela({
    titulo: (novo ? 'Nov' + (l.redutor ? 'o ' : 'a ') : 'Editar ') + (l.redutor ? 'redutor de receita (comissão/desconto)' : tipo === 'receita' ? 'receita' : 'despesa'), larga: true,
    corpo:
      '<form id="f-lanc" class="grade">' +
      campo('Descrição <span class="obrig">*</span>', '<input name="descricao" required maxlength="200" value="' + esc(l.descricao || '') + '">', 'inteiro') +
      campo('Valor (R$) <span class="obrig">*</span>', '<input name="valor" required inputmode="decimal" placeholder="0,00" value="' + (l.valor ? valorParaCampo(l.valor) : '') + '">') +
      campo('Vencimento <span class="obrig">*</span>', '<input name="vencimento" type="date" required value="' + esc(l.vencimento || hojeISO()) + '">') +
      campo('Empresa', '<select name="empresa"><option value="escritorio"' + (empresa === 'escritorio' ? ' selected' : '') + '>Escritório (Jurídico)</option>' +
        '<option value="contabilidade"' + (empresa === 'contabilidade' ? ' selected' : '') + '>Contabilidade</option></select>') +
      campo('Grupo', '<input name="grupo" list="lanc-grupos" placeholder="Digite ou escolha" value="' + esc(nomeGrupo(l.grupo_id)) + '">' + datalistGrupos('lanc-grupos')) +
      campo('Cliente (empresa do grupo)', '<select name="cliente_id">' + opcoesClientes(l.cliente_id) + '</select>') +
      (tipo === 'despesa' ? campo('Fornecedor / favorecido', '<input name="favorecido" value="' + esc(l.favorecido || '') + '">') : '') +
      campo('Pessoa responsável', '<input name="responsavel" list="lanc-pessoas" value="' + esc(l.responsavel || '') + '">' + datalistPessoas('lanc-pessoas')) +
      campo('Categoria / tipo', '<input name="categoria" list="lanc-cat" value="' + esc(l.categoria || '') + '"><datalist id="lanc-cat">' +
        CATEGORIAS[tipo].map((c) => '<option value="' + esc(c) + '">').join('') + '</datalist>') +
      campo('Referência', '<input name="referencia" placeholder="Ex.: 0,7 salário" value="' + esc(l.referencia || '') + '">') +
      campo('Situação da cobrança', '<input name="cobranca" list="lanc-cob" placeholder="Ex.: Cobrado, Emitir guia" value="' + esc(l.cobranca || '') + '"><datalist id="lanc-cob">' +
        ['Cobrado', 'Emitir guia', 'Guia enviada', 'Negociando'].map((c) => '<option value="' + c + '">').join('') + '</datalist>') +
      '<label class="check inteiro"><input type="checkbox" name="pago"' + (l.pago ? ' checked' : '') + '> Já foi ' + (tipo === 'receita' ? 'recebido' : 'pago') + '</label>' +
      '<div id="bloco-pag" class="grade inteiro' + (l.pago ? '' : ' escondido') + '">' +
      campo('Data do pagamento', '<input name="data_pagamento" type="date" value="' + esc(l.data_pagamento || hojeISO()) + '">') +
      campo('Forma de pagamento', '<input name="forma_pagamento" list="lanc-forma" value="' + esc(l.forma_pagamento || '') + '"><datalist id="lanc-forma">' +
        ['PIX', 'Boleto', 'Transferência', 'Cheque', 'Cartão', 'Dinheiro'].map((c) => '<option value="' + c + '">').join('') + '</datalist>') +
      campo('Conta / banco', '<input name="conta" value="' + esc(l.conta || '') + '">') +
      '</div>' +
      campo('Chave PIX', '<input name="chave_pix" value="' + esc(l.chave_pix || '') + '">') +
      (novo ? campo('Repetir todo mês por', '<select name="repetir">' + [1, 2, 3, 6, 12, 24].map((n) =>
        '<option value="' + n + '">' + (n === 1 ? 'Não repetir' : n + ' meses') + '</option>').join('') + '</select>') : '') +
      (tipo === 'receita' ? '<label class="check inteiro"><input type="checkbox" name="redutor"' + (l.redutor ? ' checked' : '') + '> É redutor da receita (comissão, desconto) — diminui o valor recebido, não é despesa</label>' : '') +
      (tipo === 'receita' ? '<label class="check inteiro"><input type="checkbox" name="perda"' + (l.perda ? ' checked' : '') + '> Dar como prejuízo (crédito perdido)</label>' : '') +
      (l.contrato_id && l.parcela ? '<div class="dica inteiro">Parcela ' + esc(l.parcela) + '/' + esc(l.total_parcelas) + ' de um contrato.</div>' : '') +
      campo('Observação', '<textarea name="obs" maxlength="2000">' + esc(l.obs || '') + '</textarea>', 'inteiro') +
      '</form>',
    rodape:
      (novo ? '<span></span>' : '<button class="btn btn-x" id="btn-excluir-lanc" type="button">Excluir</button>') +
      '<div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button>' +
      '<button class="btn btn-p" id="btn-salvar-lanc" type="button">Salvar</button></div>'
  });
  const f = j.querySelector('#f-lanc');
  if (!novo && typeof blocoDocumentos === 'function') {
    const d = document.createElement('div'); d.className = 'secao-docs';
    j.querySelector('.janela-bd').appendChild(d);
    blocoDocumentos(d, { lancamento_id: l.id, cliente_id: l.cliente_id, grupo_id: l.grupo_id, tipo: l.pago ? 'comprovante' : 'guia' },
      { titulo: 'Comprovantes e guias', vazio: 'Nenhum arquivo. Envie o comprovante de pagamento ou a guia.' }).catch((e) => console.error(e));
  }
  f.pago.onchange = () => j.querySelector('#bloco-pag').classList.toggle('escondido', !f.pago.checked);
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  f.onsubmit = (ev) => { ev.preventDefault(); j.querySelector('#btn-salvar-lanc').click(); };
  const apos = depois || recarregar;

  j.querySelector('#btn-salvar-lanc').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const valor = lerValor(f.valor.value);
    if (!f.descricao.value.trim()) throw new Error('Preencha a descrição.');
    if (!(valor > 0)) throw new Error('Informe um valor maior que zero (ex.: 1.500,00).');
    if (!f.vencimento.value) throw new Error('Informe o vencimento.');
    const grupo_id = await grupoPorNome(f.grupo.value);
    const dados = {
      tipo, empresa: f.empresa.value, descricao: f.descricao.value.trim(), valor, vencimento: f.vencimento.value,
      grupo_id, cliente_id: f.cliente_id.value || null, categoria: f.categoria.value.trim(),
      favorecido: f.favorecido ? f.favorecido.value.trim() : (l.favorecido || ''),
      responsavel: f.responsavel.value.trim(), referencia: f.referencia.value.trim(),
      cobranca: f.pago.checked ? '' : f.cobranca.value.trim(), chave_pix: f.chave_pix.value.trim(),
      pago: f.pago.checked,
      data_pagamento: f.pago.checked ? (f.data_pagamento.value || hojeISO()) : null,
      forma_pagamento: f.pago.checked ? f.forma_pagamento.value.trim() : '',
      conta: f.pago.checked ? f.conta.value.trim() : (l.conta || ''),
      perda: f.perda ? f.perda.checked && !f.pago.checked : false,
      redutor: f.redutor ? f.redutor.checked : false,
      obs: f.obs.value.trim()
    };
    if (novo) {
      if (l.contrato_id) dados.contrato_id = l.contrato_id;
      const n = Number(f.repetir.value) || 1;
      const linhas = [];
      for (let i = 0; i < n; i++) {
        linhas.push(Object.assign({}, dados, {
          vencimento: somarMeses(dados.vencimento, i),
          descricao: n > 1 ? dados.descricao + ' (' + (i + 1) + '/' + n + ')' : dados.descricao,
          pago: i === 0 ? dados.pago : false,
          data_pagamento: i === 0 ? dados.data_pagamento : null,
          forma_pagamento: i === 0 ? dados.forma_pagamento : ''
        }));
      }
      await q(sb.from('lancamentos').insert(linhas));
      aviso(n > 1 ? '✓ ' + n + ' lançamentos criados.' : '✓ Lançamento salvo.');
    } else {
      await q(sb.from('lancamentos').update(dados).eq('id', l.id));
      aviso('✓ Alterações salvas.');
    }
    fecharJanela(j); await apos();
  });
  const bx = j.querySelector('#btn-excluir-lanc');
  if (bx) bx.onclick = () => comBotao(bx, async () => {
    if (!confirm('Excluir este lançamento? Esta ação não pode ser desfeita.')) return;
    await excluir('lancamentos', l.id);
    aviso('Lançamento excluído.'); fecharJanela(j); await apos();
  });
}

'use strict';
// ═══════════════════════════════════════════════════════════════════
// Clientes (cadastro completo da Base de Dados) e Contratos.
// ═══════════════════════════════════════════════════════════════════

// ─────────────────────────── CLIENTES ──────────────────────────────
TELAS.clientes = async function () {
  E.cli = E.cli || { tipo: 'ativos', grupo: '', busca: '' };
  await carregarCadastros();
  const C = E.cli;
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Clientes</h1><p id="cli-conta"></p></div>' +
    '<div class="acoes"><button class="btn btn-p" data-novo="cliente">+ Novo cliente</button></div></div>' +
    '<div class="filtros">' +
    '<div class="segmento" id="cli-tipo">' + [['ativos', 'Ativos'], ['Consultoria', 'Consultoria'], ['Demanda', 'Serviço pontual'], ['Inativo', 'Inativos'], ['todos', 'Todos']]
      .map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<select class="busca sel" id="cli-grupo" autocomplete="off"><option value="">Todos os grupos</option>' +
    E.grupos.map((g) => '<option value="' + g.id + '">' + esc(g.nome) + '</option>').join('') + '</select>' +
    '<input class="busca" id="cli-busca" placeholder="Buscar nome, grupo, responsável ou CPF/CNPJ" autocomplete="off">' +
    '<button class="btn btn-o" type="button" id="cli-relatorio" title="Lista filtrada com todos os campos, em tabela e CSV">⬇ Relatório</button>' +
    '</div><div id="cli-corpo"></div>';
  $('cli-tipo').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { C.tipo = b.dataset.v; pintarClientes(); } };
  $('cli-grupo').onchange = (ev) => { C.grupo = ev.target.value; pintarClientes(); };
  let t;
  $('cli-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { C.busca = ev.target.value; pintarClientes(); }, 250); };
  $('cli-relatorio').onclick = () => { const l = E.cli.ultima || [];
    relatorioTabela({ titulo: 'Clientes', ids: l.map((c) => c.id),
      colunas: ['Grupo', 'Nome', 'CPF/CNPJ', 'Tipo', 'Responsável', 'E-mail', 'Telefone', 'Cidade/UF', 'Procuração', 'Certificado', 'CAPAG', 'Situação cadastral'],
      linhas: l.map((c) => [c.grupos ? c.grupos.nome : '', c.nome, mascaraDoc(c.cpf_cnpj), c.tipo === 'Demanda' ? 'Serviço pontual' : c.tipo, c.responsavel, c.email, c.telefone,
        [c.cidade, c.estado].filter(Boolean).join('/'), c.procuracao === true ? 'Sim' : c.procuracao === false ? 'Não' : '', c.certificado === true ? 'Sim' : c.certificado === false ? 'Não' : '', c.capag, c.situacao_cadastral]) }); };
  ligarBotoesNovo($('conteudo'));
  // ao ordenar pelo cabeçalho, fecha o detalhe aberto (senão ele fica solto no meio da tabela)
  $('cli-corpo').addEventListener('click', (ev) => { if (ev.target.closest('th')) { document.querySelectorAll('#cli-corpo .cli-det').forEach((x) => x.remove());
    document.querySelectorAll('#cli-corpo tr[data-cli]').forEach((x) => { x.setAttribute('aria-expanded', 'false'); x.classList.remove('cli-aberta'); x.querySelector('.cli-seta').textContent = '▸'; }); } });
  pintarClientes();
};

function pintarClientes() {
  const C = E.cli, b = normalizar(C.busca), bd = soDigitos(C.busca);
  document.querySelectorAll('#cli-tipo button').forEach((x) => x.classList.toggle('ativo', x.dataset.v === C.tipo));
  if (document.activeElement !== $('cli-grupo')) $('cli-grupo').value = C.grupo;
  if (document.activeElement !== $('cli-busca')) $('cli-busca').value = C.busca;
  const lista = E.clientes.filter((c) => {
    if (C.tipo === 'ativos' && c.tipo === 'Inativo') return false;
    if (C.tipo !== 'ativos' && C.tipo !== 'todos' && c.tipo !== C.tipo) return false;
    if (C.grupo && c.grupo_id !== C.grupo) return false;
    if (b && !(normalizar(c.nome + ' ' + (c.grupos ? c.grupos.nome : '') + ' ' + c.responsavel + ' ' + c.socio_admin).includes(b) ||
               (bd && soDigitos(c.cpf_cnpj).includes(bd)))) return false;
    return true;
  });
  C.ultima = lista;
  $('cli-conta').textContent = lista.length + ' de ' + E.clientes.length + ' cadastro(s) · clique na linha para ver os detalhes';
  $('cli-corpo').innerHTML = '<div class="card">' + (lista.length ?
    '<div class="tabela-wrap"><table class="ordenavel cli-tabela"><thead><tr><th class="sem-ordem" style="width:28px"></th><th>Grupo</th><th>Nome</th><th>CPF/CNPJ</th><th>Responsável</th>' +
    '<th>Procuração</th><th>Certificado</th><th>Situação</th></tr></thead><tbody>' +
    lista.map((c) => '<tr class="clicavel cli-linha" tabindex="0" aria-expanded="false" data-cli="' + c.id + '"><td class="cli-seta">▸</td>' +
      '<td class="cli-grupo" title="' + esc(c.grupos ? c.grupos.nome : '') + '">' + esc(c.grupos ? c.grupos.nome : '—') + '</td>' +
      '<td><b>' + esc(c.nome) + '</b>' + (c.socio_admin ? '<div class="sub">' + esc(c.socio_admin) + '</div>' : '') + '</td>' +
      '<td class="mono">' + esc(mascaraDoc(c.cpf_cnpj) || '—') + '</td>' +
      '<td>' + pillPessoa(c.responsavel) + '</td><td>' + pillSimNao(c.procuracao) + '</td><td>' + pillSimNao(c.certificado) + '</td>' +
      '<td>' + pillSitCad(c.situacao_cadastral) + '</td></tr>').join('') +
    '</tbody></table></div>'
    : (E.clientes.length ? vazio('Nenhum cliente neste recorte — mude o filtro ou a busca.') : vazio('Nenhum cliente ainda. Cadastre o primeiro ou importe a Base de Dados em Administração.', '+ Novo cliente', '[data-novo=cliente]'))) + '</div>';
  $('cli-corpo').querySelectorAll('tr[data-cli]').forEach((tr) => {
    tr.onclick = () => expandirCliente(tr);
    tr.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); expandirCliente(tr); } };
  });
}

// Linha que expande logo abaixo com o resumo do cliente (uma aberta por vez)
async function expandirCliente(tr) {
  const aberta = tr.getAttribute('aria-expanded') === 'true';
  document.querySelectorAll('#cli-corpo .cli-det').forEach((x) => x.remove());
  document.querySelectorAll('#cli-corpo tr[data-cli]').forEach((x) => { x.setAttribute('aria-expanded', 'false'); x.classList.remove('cli-aberta'); x.querySelector('.cli-seta').textContent = '▸'; });
  if (aberta) return;
  const c = E.clientes.find((x) => x.id === tr.dataset.cli);
  tr.setAttribute('aria-expanded', 'true'); tr.classList.add('cli-aberta'); tr.querySelector('.cli-seta').textContent = '▾';
  const det = document.createElement('tr');
  det.className = 'cli-det';
  det.innerHTML = '<td colspan="8"><div class="cli-det-corpo"><div class="carregando" style="padding:14px">Carregando…</div></div></td>';
  tr.after(det);
  const alvo = det.querySelector('.cli-det-corpo');
  const nada = () => [];
  const [contatos, ctrs, lanc, tfs, docs] = await Promise.all([
    q(sb.from('contatos').select('nome, finalidade, email, telefone').eq('cliente_id', c.id).order('criado_em')).catch(nada),
    q(sb.from('contratos').select('descricao, valor_total, status').eq('cliente_id', c.id).eq('status', 'Ativo')).catch(nada),
    q(sb.from('lancamentos').select('valor, redutor, vencimento').eq('cliente_id', c.id).eq('tipo', 'receita').eq('pago', false).eq('perda', false)).catch(nada),
    q(sb.from('tarefas').select('titulo, prazo').eq('cliente_id', c.id).not('status', 'in', '(concluida,cancelada)').order('prazo', { nullsFirst: false }).limit(3)).catch(nada),
    q(sb.from('documentos').select('nome, criado_em').eq('cliente_id', c.id).eq('arquivado', false).order('criado_em', { ascending: false }).limit(3)).catch(nada)
  ]);
  if (!det.isConnected) return;
  const h = hojeISO(), atraso = lanc.filter((l) => l.vencimento < h);
  const lin = (rot, v) => v ? '<div class="dado"><span>' + rot + '</span><b>' + v + '</b></div>' : '';
  const fin = contatos.find((x) => x.finalidade === 'financeiro'), jur = contatos.find((x) => x.finalidade === 'juridico');
  const deb = [['RFB', c.rfb], ['PGFN', c.pgfn], ['SEFAZ/MG', c.sefaz_mg], ['AGE/MG', c.age_mg]].filter((d) => Number(d[1]));
  const zap = soDigitos(c.telefone);
  alvo.innerHTML =
    '<div class="cli-det-grade">' +
    '<div class="dados"><div class="cli-det-tit">Contato</div>' +
      lin('Telefone', esc(c.telefone)) + lin('E-mail', c.email ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '') +
      lin('Financeiro', fin ? esc(fin.nome) + (fin.email ? ' · ' + esc(fin.email) : '') : '') + lin('Jurídico', jur ? esc(jur.nome) + (jur.email ? ' · ' + esc(jur.email) : '') : '') +
      lin('Endereço', esc([c.endereco, c.cidade && c.estado ? c.cidade + '/' + c.estado : c.cidade].filter(Boolean).join(' · '))) +
      lin('Tipo', esc(c.tipo === 'Demanda' ? 'Serviço pontual' : c.tipo)) + (!c.telefone && !c.email && !contatos.length ? '<div class="sub">Sem contato cadastrado.</div>' : '') + '</div>' +
    '<div class="dados"><div class="cli-det-tit">Fiscal</div>' +
      lin('Regime', esc(c.regime_tributario)) + lin('CAPAG', c.capag ? pillCapag(c.capag) : '') +
      deb.map((d) => lin(d[0], brl(d[1]))).join('') + (!c.regime_tributario && !c.capag && !deb.length ? '<div class="sub">Sem dados fiscais.</div>' : '') + '</div>' +
    '<div class="dados"><div class="cli-det-tit">Escritório</div>' +
      lin('Contratos ativos', String(ctrs.length)) + lin('A receber', brl(soma(lanc, vl)) + (atraso.length ? ' <span class="pill vencido">' + atraso.length + ' em atraso</span>' : '')) +
      lin('Tarefas abertas', tfs.length ? tfs.map((t) => esc(t.titulo) + (t.prazo ? ' <span class="sub">' + dataBR(t.prazo) + '</span>' : '')).join('<br>') : '—') +
      lin('Últimos documentos', docs.length ? docs.map((d) => esc(d.nome)).join('<br>') : '—') + '</div>' +
    '</div><div class="cli-det-acoes">' +
      '<button class="btn btn-p btn-mini" data-cli-ficha>Abrir ficha completa</button><button class="btn btn-o btn-mini" data-cli-editar>Editar</button>' +
      (zap ? '<a class="btn btn-o btn-mini" target="_blank" rel="noopener" href="https://wa.me/' + (zap.length <= 11 ? '55' : '') + zap + '">WhatsApp</a>' : '') +
      (c.email ? '<a class="btn btn-o btn-mini" href="mailto:' + esc(c.email) + '">E-mail</a>' : '') + '</div>';
  alvo.querySelector('[data-cli-ficha]').onclick = () => abrirFicha(c.id);
  alvo.querySelector('[data-cli-editar]').onclick = () => formCliente(c, pintarClientes);
}

function selectSimNao(nome, v) {
  return '<select name="' + nome + '"><option value=""' + (v == null ? ' selected' : '') + '>—</option>' +
    '<option value="sim"' + (v === true ? ' selected' : '') + '>Sim</option><option value="nao"' + (v === false ? ' selected' : '') + '>Não</option></select>';
}
function lerSimNao(v) { return v === 'sim' ? true : v === 'nao' ? false : null; }
function selectOpcoes(nome, opcoes, v) {
  const lista = opcoes.includes(v) || !v ? opcoes : opcoes.concat([v]);
  return '<select name="' + nome + '"><option value="">—</option>' + lista.map((o) => '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select>';
}
function campoValor(rotulo, nome, v) {
  return campo(rotulo, '<input name="' + nome + '" inputmode="decimal" placeholder="—" value="' + esc(valorParaCampo(v)) + '">');
}

async function formCliente(cl, depois) {
  const novo = !cl;
  cl = cl || {};
  let resumo = '';
  if (!novo) {
    const [ctrs, abertos] = await Promise.all([
      q(sb.from('contratos').select('id').eq('cliente_id', cl.id)),
      q(sb.from('lancamentos').select('valor, vencimento').or('cliente_id.eq.' + cl.id + (cl.grupo_id ? ',grupo_id.eq.' + cl.grupo_id : ''))
        .eq('tipo', 'receita').eq('pago', false).eq('perda', false))
    ]);
    const emAberto = soma(abertos, vl);
    const atraso = soma(abertos.filter((l) => l.vencimento < hojeISO()), vl);
    resumo = '<div class="dica inteiro"><b>' + ctrs.length + '</b> contrato(s) · honorários em aberto ' + (cl.grupo_id ? 'do grupo ' : '') +
      '<b class="mono">' + brl(emAberto) + '</b>' + (atraso ? ' · <span style="color:var(--red)">em atraso <b class="mono">' + brl(atraso) + '</b></span>' : '') +
      ' · passivo tributário <b class="mono">' + brl(passivo(cl)) + '</b></div>';
  }
  const secao = (t) => '<div class="secao inteiro">' + t + '</div>';
  const j = abrirJanela({
    titulo: novo ? 'Novo cliente' : cl.nome, larga: true,
    corpo:
      '<form id="f-cli" class="grade g3">' + resumo +
      secao('📋 Cadastro') +
      campo('Nome / Razão social <span class="obrig">*</span>', '<input name="nome" required maxlength="200" value="' + esc(cl.nome || '') + '">', 'dois') +
      campo('CPF/CNPJ', '<input name="cpf_cnpj" inputmode="numeric" maxlength="18" value="' + esc(mascaraDoc(cl.cpf_cnpj)) + '">') +
      campo('Grupo', '<input name="grupo" list="cli-grupos" placeholder="Digite ou escolha" value="' + esc(cl.grupos ? cl.grupos.nome : nomeGrupo(cl.grupo_id)) + '">' + datalistGrupos('cli-grupos')) +
      campo('Tipo', '<select name="tipo">' + [['Consultoria', 'Consultoria'], ['Demanda', 'Serviço pontual'], ['Inativo', 'Inativo']].map(([t, r]) => '<option value="' + t + '"' + (cl.tipo === t ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>') +
      campo('Responsável', '<input name="responsavel" list="cli-pessoas" value="' + esc(cl.responsavel || '') + '">' + datalistPessoas('cli-pessoas')) +
      campo('Sócio-administrador', '<input name="socio_admin" value="' + esc(cl.socio_admin || '') + '">', 'dois') +
      campo('Tipo societário', selectOpcoes('tipo_societario', ['LTDA', 'S.A', 'MEI', 'EI', 'PF'], cl.tipo_societario)) +
      secao('🏛 Situação') +
      campo('Em operação', selectSimNao('em_operacao', cl.em_operacao)) +
      campo('Procuração', selectSimNao('procuracao', cl.procuracao)) +
      campo('Certificado', selectSimNao('certificado', cl.certificado)) +
      campo('Cadastro regular', selectSimNao('cadastro_regular', cl.cadastro_regular)) +
      campo('CAPAG', selectOpcoes('capag', ['A', 'B', 'C', 'D', 'Omisso'], cl.capag)) +
      campo('Regime tributário', selectOpcoes('regime_tributario', ['PF', 'SN', 'LP', 'LR', 'BAIXADA'], cl.regime_tributario)) +
      campo('Situação cadastral', selectOpcoes('situacao_cadastral', ['ATIVA', 'SUSPENSA', 'INAPTA', 'BAIXADA', 'NULA'], cl.situacao_cadastral)) +
      secao('💰 Passivo tributário') +
      campoValor('RFB', 'rfb', cl.rfb) + campoValor('RFB negociada', 'rfb_negociada', cl.rfb_negociada) +
      campoValor('PGFN', 'pgfn', cl.pgfn) + campoValor('PGFN negociada', 'pgfn_negociada', cl.pgfn_negociada) +
      campoValor('AGE/MG', 'age_mg', cl.age_mg) + campoValor('AGE/MG negociada', 'age_mg_negociada', cl.age_mg_negociada) +
      campoValor('SEFAZ/MG', 'sefaz_mg', cl.sefaz_mg) +
      campo('CEAT (TRT-3) — processos', '<input name="ceat_trt3" type="number" min="0" value="' + esc(cl.ceat_trt3 == null ? '' : cl.ceat_trt3) + '">') +
      secao('📞 Contato') +
      campo('E-mail', '<input name="email" type="email" value="' + esc(cl.email || '') + '">') +
      campo('Telefone / WhatsApp', '<input name="telefone" inputmode="tel" value="' + esc(cl.telefone || '') + '">') +
      campo('Endereço', '<input name="endereco" value="' + esc(cl.endereco || '') + '">') +
      campo('Cidade', '<input name="cidade" value="' + esc(cl.cidade || '') + '">') +
      campo('UF', '<input name="estado" maxlength="2" style="text-transform:uppercase" value="' + esc(cl.estado || '') + '">') +
      campo('Origem', '<input name="origem" value="' + esc(cl.origem || '') + '">') +
      campo('Observação interna', '<textarea name="obs" maxlength="4000">' + esc(cl.obs || '') + '</textarea>', 'inteiro') +
      (cl.historico_cadastral ? campo('Histórico cadastral', '<textarea name="historico_cadastral" maxlength="4000">' + esc(cl.historico_cadastral) + '</textarea>', 'inteiro') : '') +
      '</form>',
    rodape:
      (!novo && E.perfil.papel === 'admin' ? '<button class="btn btn-x" id="btn-excluir-cli" type="button">Excluir</button>' : '<span></span>') +
      '<div class="acoes">' + (!novo ? '<button class="btn btn-o" type="button" id="btn-ctr-cli">+ Contrato</button>' : '') +
      '<button class="btn btn-o" type="button" data-cancelar>Cancelar</button>' +
      '<button class="btn btn-p" id="btn-salvar-cli" type="button">Salvar</button></div>'
  });
  const f = j.querySelector('#f-cli');
  f.cpf_cnpj.onblur = () => { f.cpf_cnpj.value = mascaraDoc(f.cpf_cnpj.value); };
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  const apos = async () => { await carregarCadastros(true); if (depois) depois(); else await recarregar(); };
  const bc = j.querySelector('#btn-ctr-cli');
  if (bc) bc.onclick = () => { fecharJanela(j); formContrato({ cliente_id: cl.id }); };

  j.querySelector('#btn-salvar-cli').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.nome.value.trim()) throw new Error('Preencha o nome.');
    const num = (n) => { const t = f[n].value.trim(); if (!t) return null; const v = lerValor(t); if (isNaN(v)) throw new Error('Valor inválido em ' + n.toUpperCase().replace(/_/g, ' ') + '.'); return v; };
    const grupo_id = await grupoPorNome(f.grupo.value);
    const dados = {
      nome: f.nome.value.trim(), cpf_cnpj: soDigitos(f.cpf_cnpj.value), grupo_id, tipo: f.tipo.value,
      responsavel: f.responsavel.value.trim(), socio_admin: f.socio_admin.value.trim(), tipo_societario: f.tipo_societario.value,
      em_operacao: lerSimNao(f.em_operacao.value), procuracao: lerSimNao(f.procuracao.value),
      certificado: lerSimNao(f.certificado.value), cadastro_regular: lerSimNao(f.cadastro_regular.value),
      capag: f.capag.value, regime_tributario: f.regime_tributario.value, situacao_cadastral: f.situacao_cadastral.value,
      rfb: num('rfb'), rfb_negociada: num('rfb_negociada'), pgfn: num('pgfn'), pgfn_negociada: num('pgfn_negociada'),
      age_mg: num('age_mg'), age_mg_negociada: num('age_mg_negociada'), sefaz_mg: num('sefaz_mg'),
      ceat_trt3: f.ceat_trt3.value === '' ? null : Number(f.ceat_trt3.value),
      email: f.email.value.trim(), telefone: f.telefone.value.trim(), endereco: f.endereco.value.trim(),
      cidade: f.cidade.value.trim(), estado: f.estado.value.trim().toUpperCase(), origem: f.origem.value.trim(),
      obs: f.obs.value.trim()
    };
    if (f.historico_cadastral) dados.historico_cadastral = f.historico_cadastral.value.trim();
    if (novo) await q(sb.from('clientes').insert(dados));
    else await q(sb.from('clientes').update(dados).eq('id', cl.id));
    aviso(novo ? '✓ Cliente cadastrado.' : '✓ Cadastro atualizado.');
    fecharJanela(j);
    await apos();
  });
  const bx = j.querySelector('#btn-excluir-cli');
  if (bx) bx.onclick = () => comBotao(bx, async () => {
    if (!confirm('Excluir o cliente "' + cl.nome + '"? Esta ação não pode ser desfeita.')) return;
    await excluir('clientes', cl.id);
    aviso('Cliente excluído.'); fecharJanela(j);
    await apos();
  });
}

// ─────────────────────────── CONTRATOS ─────────────────────────────
TELAS.contratos = async function () {
  E.ctr = E.ctr || { busca: '', status: 'Ativo' };
  const F = E.ctr;
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Contratos</h1><p>Consultoria mensal (fixo ou em salários mínimos) ou serviço pontual · os valores entram sozinhos em Honorários Jurídico</p></div>' +
    '<div class="acoes"><button class="btn btn-o" id="ctr-sm">Salário mínimo</button><button class="btn btn-p" data-novo="contrato">+ Novo contrato</button></div></div>' +
    '<div class="filtros"><div class="segmento" id="ctr-status">' + [['Ativo', 'Ativos'], ['Encerrado', 'Encerrados'], ['Cancelado', 'Cancelados'], ['todos', 'Todos']]
      .map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<input class="busca" id="ctr-busca" placeholder="Buscar cliente ou descrição" autocomplete="off"></div><div id="ctr-corpo"></div>';
  $('ctr-status').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.status = b.dataset.v; pintarContratos(true); } };
  let t;
  $('ctr-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; pintarContratos(false); }, 250); };
  ligarBotoesNovo($('conteudo'));
  $('ctr-sm').onclick = () => janelaSalarioMinimo();
  // garante a mensalidade do próximo mês mesmo sem o agendador do banco (uma vez por sessão)
  if (!E._mensalidadesOk) { E._mensalidadesOk = true; await sb.rpc('gerar_mensalidades').then(() => {}, () => {}); }
  await pintarContratos(true);
};

let _contratos = [];
async function pintarContratos(buscar) {
  const F = E.ctr;
  document.querySelectorAll('#ctr-status button').forEach((x) => x.classList.toggle('ativo', x.dataset.v === F.status));
  if (document.activeElement !== $('ctr-busca')) $('ctr-busca').value = F.busca;
  if (buscar) {
    let c = sb.from('contratos').select('*, clientes(nome, grupos(nome)), lancamentos(valor, pago, vencimento), documentos(id)').order('data_contrato', { ascending: false });
    if (F.status !== 'todos') c = c.eq('status', F.status);
    _contratos = await q(c);
  }
  let lista = _contratos;
  if (F.busca) {
    const b = normalizar(F.busca);
    lista = lista.filter((c) => normalizar(c.descricao + ' ' + (c.clientes ? c.clientes.nome : '')).includes(b));
  }
  const h = hojeISO();
  $('ctr-corpo').innerHTML = '<div class="card">' + (lista.length ?
    '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Cliente</th><th>Contrato</th><th>Tipo</th><th data-tipo="data">Data</th><th class="num">Valor</th><th class="num">Recebido</th><th>Parcelas</th><th>Anexo</th><th>Situação</th></tr></thead><tbody>' +
    lista.map((c) => {
      const parc = c.lancamentos || [];
      const recebido = soma(parc.filter((p) => p.pago), (p) => p.valor);
      const atraso = parc.some((p) => !p.pago && p.vencimento < h);
      return '<tr class="clicavel" data-ctr="' + c.id + '"><td>' + esc(c.clientes ? c.clientes.nome : '—') +
        (c.clientes && c.clientes.grupos ? '<div class="sub">' + esc(c.clientes.grupos.nome) + '</div>' : '') + '</td>' +
        '<td>' + esc(c.descricao) + (c.percentual_exito ? '<div class="sub">+ ' + esc(String(c.percentual_exito).replace('.', ',')) + '% de êxito</div>' : '') + '</td>' +
        '<td><span class="pill ' + (c.modalidade === 'consultoria' ? 'aberto' : 'neutro') + '">' + (c.modalidade === 'consultoria' ? 'Consultoria' : 'Pontual') + '</span></td>' +
        '<td class="mono" data-ord="' + c.data_contrato + '">' + dataBR(c.data_contrato) + (c.rescindido_em ? '<div class="sub">rescindido ' + dataBR(c.rescindido_em) + '</div>' : '') + '</td>' +
        '<td class="num mono" data-ord="' + (c.modalidade === 'consultoria' ? (c.valor_mensal || 0) : c.valor_total) + '">' + valorContratoTexto(c) + '</td>' +
        '<td class="num mono valor-rec" data-ord="' + recebido + '">' + brl(recebido) + '</td>' +
        '<td>' + parc.filter((p) => p.pago).length + '/' + parc.length + '</td>' +
        '<td>' + ((c.documentos || []).length ? '<span class="pill pago" title="Contrato anexado">📎 ' + c.documentos.length + '</span>' : '<span class="pill hoje" title="Anexe o contrato assinado no detalhe">sem anexo</span>') + '</td>' +
        '<td>' + (atraso ? '<span class="pill vencido">Parcela em atraso</span>' : '<span class="pill ' + (c.status === 'Ativo' ? 'aberto' : 'neutro') + '">' + esc(c.status) + '</span>') + '</td></tr>';
    }).join('') + '</tbody></table></div>'
    : vazio('Nenhum contrato' + (F.status !== 'todos' ? ' com essa situação' : '') + ' — cadastre um contrato e o sistema gera os lançamentos.', '+ Novo contrato', '[data-novo=contrato]')) + '</div>';
  $('ctr-corpo').querySelectorAll('[data-ctr]').forEach((tr) => tr.onclick = () => detalheContrato(tr.dataset.ctr));
}

const SM_ROT = (c) => String(c.qtd_salarios).replace('.', ',') + ' salário(s) mínimo(s)';
function valorContratoTexto(c) {
  if (c.modalidade !== 'consultoria') return brl(c.valor_total);
  return (c.forma_valor === 'salario_minimo' ? SM_ROT(c) : brl(c.valor_mensal)) + ' / mês';
}
function formContrato(ct) {
  ct = ct || {};
  const novo = !ct.id;
  if (novo && !E.clientes.length) {
    aviso('Cadastre um cliente antes de criar o contrato.', true);
    return formCliente();
  }
  const mod = ct.modalidade || 'consultoria', forma = ct.forma_valor || 'fixo';
  const j = abrirJanela({
    titulo: novo ? 'Novo contrato' : 'Editar contrato', larga: true,
    corpo:
      '<form id="f-ctr" class="grade">' +
      campo('Cliente <span class="obrig">*</span>', '<select name="cliente_id" required>' + opcoesClientes(ct.cliente_id).replace('— sem cliente —', 'Escolha o cliente') + '</select>', 'inteiro') +
      '<div class="inteiro"><div class="segmento seg-grande" id="ctr-mod">' + [['consultoria', 'Consultoria (mensal, recorrente)'], ['pontual', 'Serviço pontual (valor fechado)']]
        .map(([v, r]) => '<button type="button" data-v="' + v + '"' + (mod === v ? ' class="ativo"' : '') + (novo ? '' : ' disabled') + '>' + r + '</button>').join('') + '</div></div>' +
      campo('Descrição do serviço <span class="obrig">*</span>', '<input name="descricao" required maxlength="200" placeholder="Ex.: Consultoria tributária mensal" value="' + esc(ct.descricao || '') + '">', 'inteiro') +
      campo('Data do contrato', '<input name="data_contrato" type="date" value="' + esc(ct.data_contrato || hojeISO()) + '">') +
      campo('% de êxito (se houver)', '<input name="percentual_exito" inputmode="decimal" placeholder="Ex.: 20" value="' + (ct.percentual_exito != null ? esc(String(ct.percentual_exito).replace('.', ',')) : '') + '">') +
      // consultoria
      '<div class="grade inteiro" id="ctr-rec">' +
      '<div class="inteiro"><div class="segmento" id="ctr-forma">' + [['fixo', 'Valor fixo'], ['salario_minimo', 'Em salários mínimos']]
        .map(([v, r]) => '<button type="button" data-v="' + v + '"' + (forma === v ? ' class="ativo"' : '') + '>' + r + '</button>').join('') + '</div></div>' +
      campo('<span id="rot-valor-mensal">Valor mensal (R$)</span>', '<input name="valor_mensal" inputmode="decimal" placeholder="4.000,00" value="' + (ct.valor_mensal ? valorParaCampo(ct.valor_mensal) : '') + '">') +
      campo('Quantos salários mínimos', '<input name="qtd_salarios" inputmode="decimal" placeholder="1" value="' + (ct.qtd_salarios != null ? esc(String(ct.qtd_salarios).replace('.', ',')) : '') + '">') +
      campo('1ª competência (mês de início)', '<input name="inicio_competencia" type="month" value="' + esc((ct.inicio_competencia || hojeISO()).slice(0, 7)) + '">') +
      campo('Dia do vencimento (mês seguinte)', '<input name="dia_vencimento" type="number" min="1" max="28" value="' + (ct.dia_vencimento || 10) + '">') +
      '<div class="dica inteiro" id="ctr-previa-rec"></div></div>' +
      // serviço pontual
      '<div class="grade inteiro" id="ctr-pont">' +
      (novo
        ? campo('Valor total (R$)', '<input name="valor_total" inputmode="decimal" placeholder="0,00">') +
          campo('Nº de parcelas', '<input name="num_parcelas" type="number" min="1" max="120" value="1">') +
          campo('1º vencimento', '<input name="primeiro_vencimento" type="date" value="' + somarDias(hojeISO(), 30) + '">') +
          '<div class="dica inteiro" id="ctr-previa">Informe o valor para ver as parcelas.</div>'
        : '<div class="dica inteiro">Valor e parcelas já foram lançados em Honorários Jurídico. Para ajustar uma parcela, use o botão Editar dela.</div>') + '</div>' +
      (novo ? '' : campo('Situação', '<select name="status">' + ['Ativo', 'Encerrado', 'Cancelado'].map((st) => '<option' + (ct.status === st ? ' selected' : '') + '>' + st + '</option>').join('') + '</select>')) +
      campo('Observação', '<textarea name="obs" maxlength="2000">' + esc(ct.obs || '') + '</textarea>', 'inteiro') +
      '<div class="dica inteiro">Depois de salvar, anexe o contrato assinado no detalhe do contrato (Documentos do contrato).</div>' +
      '</form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button>' +
      '<button class="btn btn-p" id="btn-salvar-ctr" type="button">' + (novo ? 'Criar contrato' : 'Salvar') + '</button></div>'
  });
  const f = j.querySelector('#f-ctr');
  let modalidade = mod, formaValor = forma, sm = [];
  q(sb.from('salarios_minimos').select('*').order('ano', { ascending: false })).then((x) => { sm = x; previaRec(); }).catch(() => {});
  const previaRec = () => {
    const el = j.querySelector('#ctr-previa-rec'); if (!el) return;
    const ano = Number((f.inicio_competencia.value || hojeISO()).slice(0, 4)), s0 = sm.find((x) => x.ano <= ano);
    const v = formaValor === 'salario_minimo' ? (lerValor(f.qtd_salarios.value) || 0) * (s0 ? Number(s0.valor) : 0) : lerValor(f.valor_mensal.value) || 0;
    el.innerHTML = 'Todo mês entra um lançamento em Honorários Jurídico (competência do mês, vencimento dia <b>' + (Number(f.dia_vencimento.value) || 10) + '</b> do mês seguinte) de <b class="mono">' + brl(v) + '</b>' +
      (formaValor === 'salario_minimo' ? ' (salário mínimo de ' + (s0 ? s0.ano + ': ' + brl(s0.valor) : '—') + '). Quando o salário mínimo do ano seguinte for cadastrado, as mensalidades daquele ano são reajustadas sozinhas' : '') +
      '. Continua até a rescisão.';
  };
  const mostrar = () => {
    j.querySelectorAll('#ctr-mod button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === modalidade));
    j.querySelectorAll('#ctr-forma button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === formaValor));
    j.querySelector('#ctr-rec').classList.toggle('escondido', modalidade !== 'consultoria');
    j.querySelector('#ctr-pont').classList.toggle('escondido', modalidade === 'consultoria');
    f.valor_mensal.closest('.campo').classList.toggle('escondido', formaValor !== 'fixo');
    f.qtd_salarios.closest('.campo').classList.toggle('escondido', formaValor !== 'salario_minimo');
    previaRec();
  };
  j.querySelector('#ctr-mod').onclick = (ev) => { const b = ev.target.closest('button'); if (b && !b.disabled) { modalidade = b.dataset.v; mostrar(); } };
  j.querySelector('#ctr-forma').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { formaValor = b.dataset.v; mostrar(); } };
  ['input', 'change'].forEach((ev) => f.addEventListener(ev, previaRec));
  mostrar();
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  if (novo) {
    const previa = () => {
      const v = lerValor(f.valor_total.value), n = Math.max(1, Math.min(120, Number(f.num_parcelas.value) || 1));
      const el = j.querySelector('#ctr-previa');
      if (!(v > 0)) { el.textContent = 'Sem valor: o contrato é salvo sem gerar parcelas (útil para contratos só de êxito).'; return; }
      const base = Math.floor(v / n * 100) / 100, ultima = Math.round((v - base * (n - 1)) * 100) / 100;
      el.innerHTML = 'Serão lançadas <b>' + n + ' parcela(s)</b> de <b class="mono">' + brl(base) + '</b>' +
        (ultima !== base ? ' (a última de <b class="mono">' + brl(ultima) + '</b>)' : '') +
        ', a partir de ' + dataBR(f.primeiro_vencimento.value) + ', todo mês.';
    };
    ['input', 'change'].forEach((ev) => f.addEventListener(ev, previa));
    previa();
  }
  j.querySelector('#btn-salvar-ctr').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.cliente_id.value) throw new Error('Escolha o cliente.');
    if (!f.descricao.value.trim()) throw new Error('Preencha a descrição do serviço.');
    const exito = f.percentual_exito.value.trim() ? lerValor(f.percentual_exito.value) : null;
    if (exito != null && !(exito >= 0 && exito <= 100)) throw new Error('% de êxito deve ficar entre 0 e 100.');
    const cli = E.clientes.find((c) => c.id === f.cliente_id.value);
    const dados = { cliente_id: f.cliente_id.value, descricao: f.descricao.value.trim(), modalidade,
      data_contrato: f.data_contrato.value || hojeISO(), percentual_exito: exito, obs: f.obs.value.trim(), responsavel: ct.responsavel || (cli && cli.responsavel) || '' };
    if (modalidade === 'consultoria') {
      const vm = formaValor === 'fixo' ? lerValor(f.valor_mensal.value) : null, qs = formaValor === 'salario_minimo' ? lerValor(f.qtd_salarios.value) : null;
      if (formaValor === 'fixo' && !(vm > 0)) throw new Error('Informe o valor mensal (ex.: 4.000,00).');
      if (formaValor === 'salario_minimo' && !(qs > 0)) throw new Error('Informe quantos salários mínimos (ex.: 1 ou 0,7).');
      const dia = Number(f.dia_vencimento.value) || 10;
      if (dia < 1 || dia > 28) throw new Error('Dia do vencimento entre 1 e 28.');
      if (!f.inicio_competencia.value) throw new Error('Informe o mês de início.');
      Object.assign(dados, { forma_valor: formaValor, valor_mensal: vm, qtd_salarios: qs, dia_vencimento: dia, inicio_competencia: f.inicio_competencia.value + '-01', valor_total: 0, num_parcelas: 1 });
    }
    if (novo) {
      if (modalidade === 'pontual') {
        const v = f.valor_total.value.trim() ? lerValor(f.valor_total.value) : 0;
        if (isNaN(v) || v < 0) throw new Error('Valor total inválido (ex.: 12.000,00).');
        const n = Number(f.num_parcelas.value) || 1;
        if (n < 1 || n > 120) throw new Error('Nº de parcelas deve ficar entre 1 e 120.');
        if (v > 0 && !f.primeiro_vencimento.value) throw new Error('Informe o 1º vencimento.');
        Object.assign(dados, { valor_total: v, num_parcelas: n, primeiro_vencimento: v > 0 ? f.primeiro_vencimento.value : null });
      }
      const criado = await q(sb.from('contratos').insert(dados).select().single());
      if (modalidade === 'pontual' && dados.valor_total > 0 && cli) await q(sb.from('lancamentos').update({ grupo_id: cli.grupo_id, responsavel: cli.responsavel || '' }).eq('contrato_id', criado.id));
      aviso(modalidade === 'consultoria' ? '✓ Contrato de consultoria criado: mensalidades lançadas em Honorários Jurídico.' :
        dados.valor_total > 0 ? '✓ Contrato criado e ' + dados.num_parcelas + ' parcela(s) lançada(s) em Honorários Jurídico.' : '✓ Contrato criado.');
    } else {
      dados.status = f.status.value;
      await q(sb.from('contratos').update(dados).eq('id', ct.id));
      aviso('✓ Contrato atualizado' + (modalidade === 'consultoria' ? ' (mensalidades em aberto reajustadas).' : '.'));
    }
    fecharJanela(j);
    if (!novo) fecharJanela();
    await recarregar();
  });
}

// rescisão: cobra até a competência do mês anterior ao da rescisão
function formRescisao(ct, depois) {
  const j = abrirJanela({ titulo: 'Rescindir contrato — ' + ct.descricao,
    corpo: '<form class="grade" id="f-resc">' + campo('Data da rescisão', '<input name="data" type="date" value="' + hojeISO() + '">', 'inteiro') +
      '<div class="dica inteiro" id="resc-previa"></div></form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-x" type="button" id="btn-rescindir">Rescindir</button></div>' });
  const f = j.querySelector('#f-resc');
  const previa = () => {
    const d = f.data.value; if (!d) return;
    const ult = new Date(d.slice(0, 7) + '-15T12:00:00'); ult.setMonth(ult.getMonth() - 1);
    j.querySelector('#resc-previa').innerHTML = 'Última mensalidade: competência <b>' + String(ult.getMonth() + 1).padStart(2, '0') + '/' + ult.getFullYear() + '</b> (paga em ' + d.slice(5, 7) + '/' + d.slice(0, 4) +
      '). As mensalidades em aberto de competências a partir de ' + d.slice(5, 7) + '/' + d.slice(0, 4) + ' são apagadas; as já pagas ficam.';
  };
  f.data.onchange = previa; previa();
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-rescindir').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.data.value) throw new Error('Informe a data da rescisão.');
    await q(sb.from('contratos').update({ rescindido_em: f.data.value, status: 'Encerrado' }).eq('id', ct.id));
    aviso('✓ Contrato rescindido.'); fecharJanela(j); if (depois) await depois();
  });
}

// Salário mínimo por ano (base dos contratos indexados)
async function janelaSalarioMinimo() {
  const sm = await q(sb.from('salarios_minimos').select('*').order('ano', { ascending: false }));
  const admin = E.perfil && E.perfil.papel === 'admin';
  const j = abrirJanela({ titulo: 'Salário mínimo por ano',
    corpo: '<p class="sub" style="margin-bottom:10px">Os contratos em salários mínimos usam o valor do ano da competência. Ao cadastrar o valor de um ano novo, as mensalidades em aberto daquele ano são reajustadas sozinhas.</p>' +
      '<div class="lista-ficha">' + sm.map((x) => '<div class="item-ficha"><b>' + x.ano + '</b><span class="mono">' + brl(x.valor) + '</span></div>').join('') + '</div>' +
      (admin ? '<form class="grade" id="f-sm" style="margin-top:12px">' + campo('Ano', '<input name="ano" type="number" value="' + (new Date().getFullYear() + 1) + '">') + campo('Valor (R$)', '<input name="valor" inputmode="decimal" placeholder="0,00">') + '</form>' : '<p class="sub" style="margin-top:10px">Só o administrador cadastra.</p>'),
    rodape: admin ? '<span></span><button class="btn btn-p" type="button" id="btn-sm">Salvar</button>' : '' });
  const b = j.querySelector('#btn-sm');
  if (b) b.onclick = () => comBotao(b, async () => {
    const f = j.querySelector('#f-sm'), ano = Number(f.ano.value), valor = lerValor(f.valor.value);
    if (!(ano > 2000) || !(valor > 0)) throw new Error('Informe o ano e o valor.');
    await q(sb.from('salarios_minimos').upsert({ ano, valor }, { onConflict: 'ano' }));
    aviso('✓ Salário mínimo de ' + ano + ' salvo: mensalidades reajustadas.'); fecharJanela(j); janelaSalarioMinimo();
  });
}

async function detalheContrato(id) {
  const ct = await q(sb.from('contratos').select('*, clientes(nome, grupo_id, responsavel)').eq('id', id).single());
  const parc = await q(sb.from('lancamentos').select('*').eq('contrato_id', id).order('vencimento'));
  const recebido = soma(parc.filter((p) => p.pago), (p) => p.valor);
  const total = soma(parc, (p) => p.valor);
  const j = abrirJanela({
    titulo: ct.descricao, larga: true,
    corpo:
      '<div class="kpis" style="margin-bottom:12px">' +
      kpi('Cliente', '<span style="font-family:var(--font-d);font-size:16px">' + esc(ct.clientes ? ct.clientes.nome : '—') + '</span>', '', 'Contrato de ' + dataBR(ct.data_contrato)) +
      (ct.modalidade === 'consultoria' ? kpi('Consultoria mensal', valorContratoTexto(ct), '', ct.rescindido_em ? 'rescindido em ' + dataBR(ct.rescindido_em) : 'vence dia ' + ct.dia_vencimento + ' do mês seguinte · até a rescisão') : '') +
      kpi('Recebido', brl(recebido), 'verde', parc.filter((p) => p.pago).length + ' de ' + parc.length + ' parcela(s)') +
      kpi('Falta receber', brl(total - recebido), 'ambar', ct.percentual_exito ? '+ ' + String(ct.percentual_exito).replace('.', ',') + '% de êxito' : ct.status) +
      '</div>' +
      (ct.obs ? '<div class="dica" style="margin-bottom:12px">' + esc(ct.obs) + '</div>' : '') +
      '<div class="card" style="margin:0">' + tabelaLancamentos(parc, { compacta: true }) + '</div>' +
      '<div style="margin-top:10px"><button class="btn btn-o btn-mini" id="ctr-add-parc">+ Lançar valor avulso neste contrato (ex.: êxito)</button></div>' +
      '<div class="card" style="margin:14px 0 0"><div class="card-bd" id="ctr-docs"></div></div>',
    rodape:
      (E.perfil.papel === 'admin' ? '<button class="btn btn-x" id="btn-excluir-ctr" type="button">Excluir contrato</button>' : '<span></span>') +
      '<div class="acoes">' + (ct.modalidade === 'consultoria' && !ct.rescindido_em ? '<button class="btn btn-x" id="btn-rescindir-ctr" type="button">Rescindir</button>' : '') +
      '<button class="btn btn-o" id="btn-editar-ctr" type="button">Editar contrato</button></div>'
  });
  const reabrir = async () => { fecharJanela(j); await detalheContrato(id); };
  ligarAcoesLancamentos(j, reabrir);
  blocoDocumentos(j.querySelector('#ctr-docs'), { contrato_id: id, cliente_id: ct.cliente_id, grupo_id: ct.clientes && ct.clientes.grupo_id, tipo: 'contrato' },
    { titulo: 'Documentos do contrato', vazio: 'Nenhum documento. Envie aqui o contrato assinado, a proposta e os aditivos.' }).catch((e) => console.error(e));
  j.querySelector('#btn-editar-ctr').onclick = () => formContrato(ct);
  const br = j.querySelector('#btn-rescindir-ctr'); if (br) br.onclick = () => formRescisao(ct, reabrir);
  j.querySelector('#ctr-add-parc').onclick = () => {
    formLancamento({ tipo: 'receita', empresa: 'escritorio', cliente_id: ct.cliente_id, contrato_id: id,
                     grupo_id: ct.clientes && ct.clientes.grupo_id, responsavel: ct.clientes && ct.clientes.responsavel,
                     categoria: 'Êxito', descricao: ct.descricao + ' — êxito' }, reabrir);
  };
  const bx = j.querySelector('#btn-excluir-ctr');
  if (bx) bx.onclick = () => comBotao(bx, async () => {
    if (!confirm('Excluir o contrato e TODAS as parcelas dele? Esta ação não pode ser desfeita.')) return;
    await excluir('contratos', id);
    aviso('Contrato excluído.'); fecharJanela(j); await recarregar();
  });
}

'use strict';
// ═══════════════════════════════════════════════════════════════════
// Administração (só admin): Usuários · Importar planilhas · Backup ·
// Histórico. O Histórico lê a tabela "historico" do banco — é a prova
// de que cada gravação chegou ao servidor, com autor e horário.
// ═══════════════════════════════════════════════════════════════════

const ABAS_ADMIN = [
  { id: 'usuarios', rot: '👤 Usuários' },
  { id: 'importar', rot: '📥 Importar planilhas' },
  { id: 'backup',   rot: '💾 Backup' },
  { id: 'historico', rot: '🕘 Histórico' },
  { id: 'email', rot: '✉ E-mail' }
];

TELAS.admin = async function () {
  E.adm = E.adm || { aba: 'usuarios', tabela: '' };
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Administração</h1><p>Usuários, importação, backup e histórico de alterações</p></div></div>' +
    '<div class="abas" id="adm-abas">' + ABAS_ADMIN.map((a) => '<button data-aba="' + a.id + '">' + a.rot + '</button>').join('') + '</div>' +
    '<div id="adm-corpo"></div>';
  $('adm-abas').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { E.adm.aba = b.dataset.aba; pintarAdmin(); } };
  await pintarAdmin();
};

async function pintarAdmin() {
  document.querySelectorAll('#adm-abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === E.adm.aba));
  const corpo = $('adm-corpo');
  corpo.innerHTML = '<div class="carregando">Carregando…</div>';
  try { await ({ usuarios: admUsuarios, importar: admImportar, backup: admBackup, historico: admHistorico, email: admEmail })[E.adm.aba](corpo); }
  catch (e) { console.error(e); corpo.innerHTML = '<div class="card"><div class="card-bd msg-erro">' + esc(erroAmigavel(e)) + '</div></div>'; }
}

// ─────────────────────────── USUÁRIOS ──────────────────────────────
const PAPEIS = [['admin', 'Administrador'], ['equipe', 'Equipe'], ['cliente', 'Cliente (Portal)'], ['inativo', 'Inativo (sem acesso)']];
async function admUsuarios(corpo) {
  const [lista, vinculos] = await Promise.all([
    q(sb.from('perfis').select('*').order('criado_em')),
    q(sb.from('perfil_grupos').select('*')).catch(() => [])
  ]);
  const gruposDe = (id) => vinculos.filter((v) => v.perfil_id === id).map((v) => nomeGrupo(v.grupo_id)).filter(Boolean);
  corpo.innerHTML =
    '<div class="titulo-pag" style="margin-bottom:10px"><div></div><div class="acoes"><button class="btn btn-p" id="us-novo">+ Novo usuário</button></div></div>' +
    '<div class="card"><div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Nome</th><th>E-mail</th><th>Acesso</th><th>Funções / Grupos no Portal</th><th data-tipo="data">Desde</th><th class="sem-ordem"></th></tr></thead><tbody>' +
    lista.map((p) => '<tr><td><input class="busca" style="min-width:160px" data-nome="' + p.id + '" value="' + esc(p.nome) + '"></td>' +
      '<td>' + esc(p.email) + '</td><td><select class="busca" style="min-width:150px" data-papel="' + p.id + '">' +
      PAPEIS.map(([v, r]) => '<option value="' + v + '"' + (p.papel === v ? ' selected' : '') + '>' + r + '</option>').join('') +
      '</select></td><td>' + (p.papel === 'equipe'
        ? '<span class="sub">' + esc(resumoFuncoes(p)) + '</span> <button class="btn btn-o btn-mini" data-funcoes="' + p.id + '">Funções</button>'
        : p.papel === 'cliente'
        ? (gruposDe(p.id).map((g) => '<span class="pill neutro">' + esc(g) + '</span>').join(' ') || '<span class="pill vencido">nenhum</span>') +
          ' <button class="btn btn-o btn-mini" data-grupos="' + p.id + '">Escolher</button>'
        : '<span class="sub">—</span>') + '</td>' +
      '<td class="mono" data-ord="' + p.criado_em + '">' + dataBR(p.criado_em) + '</td>' +
      '<td class="acoes-l"><button class="btn btn-o btn-mini" data-senha="' + esc(p.email) + '" title="Envia por e-mail um link para a pessoa criar uma senha nova">🔑 Link de senha</button></td></tr>').join('') +
    '</tbody></table></div></div>' +
    '<div class="dica"><b>Administrador</b>: tudo, inclusive excluir, importar e liberar usuários. <b>Equipe</b>: só as <b>funções</b> marcadas (Financeiro, Contratos, Jurídico…), em Ver ou Editar; não exclui. ' +
    '<b>Cliente</b>: só consulta, no Portal, os grupos escolhidos. <b>Inativo</b>: não entra.</div>';
  corpo.querySelectorAll('[data-papel]').forEach((s) => s.onchange = () => comBotao(s, async () => {
    try {
      await q(sb.from('perfis').update({ papel: s.value }).eq('id', s.dataset.papel));
      aviso('✓ Acesso atualizado.');
      await pintarAdmin();
    } catch (e) { await pintarAdmin(); throw e; }
  }));
  corpo.querySelectorAll('[data-nome]').forEach((i) => i.onchange = () => comBotao(i, async () => {
    await q(sb.from('perfis').update({ nome: i.value.trim() }).eq('id', i.dataset.nome));
    if (E.perfil && i.dataset.nome === E.perfil.id) { E.perfil.nome = i.value.trim(); if ($('hd-nome')) $('hd-nome').textContent = E.perfil.nome; }
    aviso('✓ Nome atualizado.');
  }));
  corpo.querySelectorAll('[data-senha]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    if (!confirm('Enviar para ' + b.dataset.senha + ' um e-mail com link para criar uma senha nova?')) return;
    const { error } = await sb.auth.resetPasswordForEmail(b.dataset.senha, { redirectTo: location.origin + '/' });
    if (error) throw error;
    aviso('✓ Link enviado para ' + b.dataset.senha + '.');
  }));
  corpo.querySelectorAll('[data-grupos]').forEach((b) => b.onclick = () =>
    formGruposPortal(lista.find((p) => p.id === b.dataset.grupos), vinculos.filter((v) => v.perfil_id === b.dataset.grupos).map((v) => v.grupo_id)));
  corpo.querySelectorAll('[data-funcoes]').forEach((b) => b.onclick = () => formFuncoes(lista.find((p) => p.id === b.dataset.funcoes)));
  $('us-novo').onclick = () => formNovoUsuario();
}
function formFuncoes(p) {
  const j = abrirJanela({ titulo: 'Funções de ' + (p.nome || p.email), larga: true,
    corpo: '<p class="sub" style="margin-bottom:10px">Marque o que esta pessoa pode <b>ver</b> ou <b>editar</b>. Use um modelo pronto e ajuste. As próprias tarefas ela sempre vê.</p>' + gradeFuncoes(p.funcoes),
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-salvar-func">Salvar</button></div>' });
  ligarGradeFuncoes(j);
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-salvar-func').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    await q(sb.from('perfis').update({ funcoes: lerGradeFuncoes(j) }).eq('id', p.id));
    aviso('✓ Funções de ' + (p.nome || p.email).split(' ')[0] + ' atualizadas.'); fecharJanela(j); await pintarAdmin();
  });
}

function listaGruposMarcar(marcados) {
  return '<input class="busca" data-filtra-grupos placeholder="Filtrar grupos…" style="max-width:none;width:100%;margin-bottom:8px">' +
    '<div class="lista-grupos" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:4px 12px;max-height:280px;overflow-y:auto;border:1.5px solid var(--border-strong);border-radius:var(--r-sm);padding:10px">' +
    E.grupos.map((g) => '<label class="check" style="font-weight:500"><input type="checkbox" value="' + g.id + '"' + (marcados.includes(g.id) ? ' checked' : '') + '> ' + esc(g.nome) + '</label>').join('') + '</div>';
}
function ligarFiltroGrupos(j) {
  const f = j.querySelector('[data-filtra-grupos]');
  if (f) f.oninput = () => { const b = normalizar(f.value); j.querySelectorAll('.lista-grupos label').forEach((l) => { l.style.display = normalizar(l.textContent).includes(b) ? '' : 'none'; }); };
}
async function salvarGruposPortal(perfilId, ids) {
  await q(sb.from('perfil_grupos').delete().eq('perfil_id', perfilId));
  if (ids.length) await q(sb.from('perfil_grupos').insert(ids.map((g) => ({ perfil_id: perfilId, grupo_id: g }))));
}
function formGruposPortal(p, marcados) {
  const j = abrirJanela({ titulo: 'Grupos que ' + (p.nome || p.email) + ' vê no Portal',
    corpo: listaGruposMarcar(marcados),
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-salvar-gp">Salvar</button></div>' });
  ligarFiltroGrupos(j);
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-salvar-gp').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    await salvarGruposPortal(p.id, [...j.querySelectorAll('.lista-grupos input:checked')].map((i) => i.value));
    aviso('✓ Grupos do Portal atualizados.'); fecharJanela(j); await pintarAdmin();
  });
}
function formNovoUsuario() {
  const j = abrirJanela({ titulo: 'Novo usuário', larga: true,
    corpo: '<form id="f-us" class="grade">' +
      campo('Nome <span class="obrig">*</span>', '<input name="nome" autocomplete="off">') +
      campo('E-mail <span class="obrig">*</span>', '<input name="email" type="email" autocomplete="off">') +
      campo('Senha provisória <span class="obrig">*</span>', '<input name="senha" autocomplete="new-password" placeholder="mínimo 8 caracteres">') +
      campo('Acesso', '<select name="papel">' + PAPEIS.filter((x) => x[0] !== 'inativo').map(([v, r]) => '<option value="' + v + '"' + (v === 'equipe' ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>') +
      '<div class="inteiro" id="us-funcoes"><div class="secao" style="margin-bottom:6px">Funções (o que a pessoa pode usar)</div>' + gradeFuncoes(MODELOS_ACESSO['Sócio (tudo)']) + '</div>' +
      '<div class="inteiro escondido" id="us-grupos"><div class="sub" style="margin-bottom:6px">Grupos que o cliente vê no Portal</div>' + listaGruposMarcar([]) + '</div>' +
      '<div class="dica inteiro">Passe o e-mail e a senha provisória para a pessoa. Se o Supabase estiver com <b>confirmação de e-mail</b> ligada, ela recebe um e-mail e precisa clicar no link antes do primeiro acesso.</div>' +
      '</form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-criar-us">Criar usuário</button></div>' });
  const f = j.querySelector('#f-us');
  ligarFiltroGrupos(j);
  ligarGradeFuncoes(j);
  f.papel.onchange = () => { j.querySelector('#us-grupos').classList.toggle('escondido', f.papel.value !== 'cliente'); j.querySelector('#us-funcoes').classList.toggle('escondido', f.papel.value !== 'equipe'); };
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  f.onsubmit = (ev) => { ev.preventDefault(); j.querySelector('#btn-criar-us').click(); };
  j.querySelector('#btn-criar-us').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const nome = f.nome.value.trim(), email = f.email.value.trim().toLowerCase(), senha = f.senha.value, papel = f.papel.value;
    const ids = [...j.querySelectorAll('.lista-grupos input:checked')].map((i) => i.value);
    if (!nome || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Preencha o nome e um e-mail válido.');
    if (senha.length < 8) throw new Error('A senha provisória precisa ter pelo menos 8 caracteres.');
    if (papel === 'cliente' && !ids.length) throw new Error('Escolha pelo menos um grupo para o cliente.');
    // cliente temporário do Supabase: cria a conta sem trocar a sessão de quem está logado
    const tmp = window.supabase.createClient(CFG.url, CFG.chave, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'erp-novo-usuario' } });
    const { data, error } = await tmp.auth.signUp({ email, password: senha, options: { data: { nome }, emailRedirectTo: location.origin + '/' } });
    if (error) {
      if (/not allowed|disabled|signups/i.test(error.message)) throw new Error('O cadastro de usuários está desligado no Supabase: ligue em Authentication → Sign In / Providers → "Allow new users to sign up".');
      if (/registered|exists/i.test(error.message)) throw new Error('Já existe um usuário com esse e-mail.');
      if (/password/i.test(error.message)) throw new Error('Senha fraca: use pelo menos 8 caracteres, com letras e números.');
      throw error;
    }
    if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length) throw new Error('Já existe um usuário com esse e-mail.');
    let perfil = null;
    for (let i = 0; i < 6 && !perfil; i++) {
      perfil = (await q(sb.from('perfis').select('*').eq('email', email)))[0];
      if (!perfil) await new Promise((ok) => setTimeout(ok, 500));
    }
    if (!perfil) throw new Error('Usuário criado, mas o perfil ainda não apareceu. Abra Usuários de novo em alguns segundos e ajuste o acesso.');
    await q(sb.from('perfis').update({ papel, nome, funcoes: papel === 'equipe' ? lerGradeFuncoes(j) : {} }).eq('id', perfil.id));
    if (papel === 'cliente') await salvarGruposPortal(perfil.id, ids);
    aviso('✓ Usuário criado. Passe o e-mail e a senha provisória para ' + nome.split(' ')[0] + '.');
    fecharJanela(j); await pintarAdmin();
  });
}

// ─────────────────────────── IMPORTAR ──────────────────────────────
let _importacoes = [];
async function admImportar(corpo) {
  corpo.innerHTML =
    '<div class="card"><div class="card-hd">📥 Importar as planilhas do sistema atual</div><div class="card-bd">' +
    '<ol class="passos"><li>No Google Sheets, abra a planilha e clique em <b>Arquivo → Fazer download → Microsoft Excel (.xlsx)</b>.</li>' +
    '<li>Pode enviar: <b>1 - Base de Dados</b>, <b>2 - Processos</b>, <b>3 - Parcelamentos Tributários</b>, <b>4 - Acordos</b>, <b>7 - Financeiro</b>, <b>12 - Financeiro - Contabilidade</b> e <b>15 - Tarefas</b>.</li>' +
    '<li>Escolha os arquivos abaixo (pode escolher vários de uma vez). Nada é gravado antes de você conferir e clicar em <b>Importar</b>.</li></ol>' +
    '<div class="dica" style="margin:10px 0">A coluna <b>Senha</b> da Base de Dados <b>não é importada</b>. As planilhas não são alteradas. ' +
    'Importar de novo a mesma planilha <b>atualiza</b> os registros que vieram dela, sem duplicar.</div>' +
    '<div class="dica" style="margin:0 0 10px">Dados errados (ex.: acordos que apareceram na Contabilidade)? Faça um <b>Backup</b>, envie de novo <b>12 - Financeiro - Contabilidade</b> e <b>4 - Acordos</b> ' +
    'e escolha <b>Substituir</b> antes de importar.</div>' +
    '<label class="btn btn-p" style="cursor:pointer">Escolher arquivos .xlsx<input type="file" id="imp-arquivos" accept=".xlsx" multiple hidden></label>' +
    '</div></div><div id="imp-previa"></div>';
  $('imp-arquivos').onchange = (ev) => lerArquivosImportacao(Array.from(ev.target.files));
}

async function lerArquivosImportacao(arquivos) {
  const previa = $('imp-previa');
  if (!arquivos.length) return;
  previa.innerHTML = '<div class="carregando">Lendo planilhas…</div>';
  try {
    await carregarScript('vendor/exceljs.min.js');
    _importacoes = [];
    for (const arq of arquivos) {
      const wb = new window.ExcelJS.Workbook();
      await wb.xlsx.load(await arq.arrayBuffer());
      const res = window.IMPORTADOR.importar(window.IMPORTADOR.lerWorkbook(wb), arq.name);
      res.arquivo = arq.name;
      _importacoes.push(res);
    }
  } catch (e) {
    console.error(e);
    previa.innerHTML = '<div class="card"><div class="card-bd msg-erro">Não consegui ler o arquivo: ' + esc(e.message) +
      '. Confira se é o .xlsx baixado do Google Sheets.</div></div>';
    return;
  }
  const NOME = { base: '👥 Base de Dados → Clientes', financeiro: '💼 Financeiro → Honorários Jurídico', contabilidade: '🧮 Financeiro → Contabilidade',
    processos: '⚖ Processos', parcelamentos: '◷ Parcelamentos Tributários', acordos: '✦ Acordos', tarefas: '☑ Tarefas' };
  const validos = _importacoes.filter((r) => r.tipo);
  const totalReg = soma(validos, (r) => registrosImp(r).length);
  previa.innerHTML = _importacoes.map((r, i) => {
    const regs = registrosImp(r);
    return '<div class="card"><div class="card-hd">' + (r.tipo ? NOME[r.tipo] : '⚠ Não reconhecida') +
      '<span class="sub">' + esc(r.arquivo) + '</span></div><div class="card-bd">' +
      (r.tipo ? '<div class="tabela-wrap"><table><thead><tr><th>Aba</th><th class="num">Linhas lidas</th><th class="num">A importar</th><th class="num">Ignoradas</th>' +
        (r.clientes || r.processos || r.tarefas ? '' : '<th class="num">Soma dos valores</th>') + '</tr></thead><tbody>' +
        Object.entries(r.resumo).map(([aba, x]) => '<tr><td>' + esc(aba) + '</td><td class="num mono">' + x.lidas + '</td><td class="num mono"><b>' + x.importadas +
          '</b></td><td class="num mono">' + x.ignoradas + '</td>' + (r.clientes || r.processos || r.tarefas ? '' : '<td class="num mono">' + brl(x.total) + '</td>') + '</tr>').join('') +
        '</tbody></table></div>' +
        (r.grupos.length ? '<p class="sub" style="margin-top:8px">' + r.grupos.length + ' grupo(s) encontrados.</p>' : '') : '') +
      (r.avisos.length ? '<details style="margin-top:8px"' + (r.tipo ? '' : ' open') + '><summary>' + r.avisos.length + ' aviso(s)</summary><ul class="avisos">' +
        r.avisos.map((a) => '<li>' + esc(a) + '</li>').join('') + '</ul></details>' : '') +
      (regs.length ? '<details style="margin-top:8px"><summary>Ver os primeiros registros</summary>' + amostraImportacao(r) + '</details>' : '') +
      '</div></div>';
  }).join('') +
  (validos.length ? '<div class="card"><div class="card-bd">' +
    '<label class="check"><input type="radio" name="imp-modo" value="atualizar" checked> Incluir novos <b>e atualizar</b> os que já vieram destas planilhas</label>' +
    '<label class="check" style="margin-top:6px"><input type="radio" name="imp-modo" value="novos"> Só incluir novos (não mexe no que já foi importado)</label>' +
    '<label class="check" style="margin-top:6px"><input type="radio" name="imp-modo" value="substituir"> <b>Substituir</b>: apagar tudo o que veio antes <b>deste tipo de planilha</b> e gravar de novo (corrige importações erradas)</label>' +
    '<div class="dica" style="margin:10px 0">Atualizar sobrescreve, nesses registros, alterações que alguém tenha feito no sistema novo depois da última importação. ' +
    '<b>Substituir</b> apaga só o que veio de planilha (lançamentos criados à mão e parcelas de contratos ficam); faça um <b>Backup</b> antes.</div>' +
    '<button class="btn btn-p" id="imp-gravar">Importar ' + totalReg + ' registro(s)</button> <span id="imp-progresso" class="sub"></span>' +
    '</div></div>' : '');
  const b = $('imp-gravar');
  if (b) b.onclick = () => comBotao(b, gravarImportacao);
}

// Cada planilha vira uma tabela do banco.
const TABELA_IMP = { base: 'clientes', financeiro: 'lancamentos', contabilidade: 'lancamentos', processos: 'processos',
  parcelamentos: 'parcelamentos', acordos: 'acordos', tarefas: 'tarefas' };
function registrosImp(r) { return r.clientes || r.lancamentos || r.processos || r.parcelamentos || r.acordos || r.tarefas || []; }

function amostraImportacao(r) {
  const tabelaSimples = (cab, linha) => '<div class="tabela-wrap"><table><thead><tr>' + cab.map((c) => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>' +
    registrosImp(r).slice(0, 8).map((x) => '<tr>' + linha(x).map((v) => '<td>' + esc(v == null ? '' : v) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
  if (r.processos) return tabelaSimples(['Grupo', 'Nº', 'Natureza', 'Autor', 'Réu', 'Status'], (p) => [p._grupo, p.numero, p.natureza, p.autor, p.reu, p.status]);
  if (r.parcelamentos) return tabelaSimples(['Aba', 'Empresa', 'Natureza', 'Local', 'Parcelas', 'Pagas'], (p) => [p._grupo, p.empresa, p.natureza, p.local, p._parcelas.length, p._parcelas.filter((x) => x.pago).length]);
  if (r.acordos) return tabelaSimples(['Grupo', 'Processo', 'Parcela', 'Vencimento', 'Valor', 'Pago'], (a) => [a._grupo, a.processo, a.parcela + '/' + a.total_parcelas, dataBR(a.vencimento), brl(a.valor), a.pago ? 'SIM' : '']);
  if (r.tarefas) return tabelaSimples(['Tarefa', 'Grupo', 'Responsável', 'Prazo', 'Status'], (t) => [t.titulo, t._grupo, t.responsavel, dataBR(t.prazo), t.status]);
  if (r.clientes) {
    return '<div class="tabela-wrap"><table><thead><tr><th>Grupo</th><th>Nome</th><th>CPF/CNPJ</th><th>Tipo</th><th class="num">Passivo</th></tr></thead><tbody>' +
      r.clientes.slice(0, 8).map((c) => '<tr><td>' + esc(c._grupo) + '</td><td>' + esc(c.nome) + '</td><td class="mono">' + esc(mascaraDoc(c.cpf_cnpj)) +
        '</td><td>' + esc(c.tipo) + '</td><td class="num mono">' + brl(passivo(c)) + '</td></tr>').join('') + '</tbody></table></div>';
  }
  return '<div class="tabela-wrap"><table><thead><tr><th>Vencimento</th><th>Grupo / Fornecedor</th><th>Descrição</th><th class="num">Valor</th><th>Situação</th></tr></thead><tbody>' +
    r.lancamentos.slice(0, 8).map((l) => '<tr><td class="mono">' + dataBR(l.vencimento) + '</td><td>' + esc(l._grupo || l.favorecido) + '</td><td>' + esc(l.descricao) +
      '</td><td class="num mono ' + (l.tipo === 'receita' ? 'valor-rec' : 'valor-desp') + '">' + (l.tipo === 'despesa' ? '−\u00A0' : '') + brl(l.valor) + '</td><td>' + pillSit(l) + '</td></tr>').join('') +
    '</tbody></table></div>';
}

async function gravarImportacao() {
  const modo = (document.querySelector('input[name=imp-modo]:checked') || {}).value || 'atualizar';
  const prog = $('imp-progresso');
  const validos = _importacoes.filter((r) => r.tipo);
  if (modo === 'substituir') {
    const tipos = [...new Set(validos.map((r) => r.tipo))];
    if (!confirm('Substituir: vou apagar o que foi importado antes de ' + tipos.map((t) => ({ base: 'Base de Dados', financeiro: 'Honorários Jurídico', contabilidade: 'Contabilidade',
      processos: 'Processos', parcelamentos: 'Parcelamentos', acordos: 'Acordos', tarefas: 'Tarefas' }[t])).join(', ') + ' e gravar de novo a partir destas planilhas. Continuar?')) return;
    for (const t of tipos.filter((x) => x !== 'base')) {   // clientes não são apagados: a Base de Dados sempre atualiza
      prog.textContent = 'Apagando o que foi importado antes…';
      const n = await q(sb.rpc('limpar_importados', { p_tipo: t }));
      console.info('[importação] apagados de ' + t + ':', n);
    }
  }
  // 1. grupos que ainda não existem
  prog.textContent = 'Criando grupos…';
  await carregarCadastros(true);
  const faltam = [...new Set(validos.flatMap((r) => r.grupos))].filter((g) => !E.grupos.some((x) => normalizar(x.nome) === normalizar(g)));
  for (let i = 0; i < faltam.length; i += 200) await q(sb.from('grupos').insert(faltam.slice(i, i + 200).map((nome) => ({ nome }))));
  await carregarCadastros(true);
  const idGrupo = (n) => { const g = n && E.grupos.find((x) => normalizar(x.nome) === normalizar(n)); return g ? g.id : null; };
  // 2. registros, em lotes
  const resultado = [];
  // parcelamentos: o grupo vem do cliente (mesmo CNPJ ou nome), como no ERP antigo; senão, o nome da aba
  const grupoDoCliente = (x) => {
    const doc = soDigitos(x.cnpj);
    const c = E.clientes.find((k) => (doc && soDigitos(k.cpf_cnpj) === doc) || normalizar(k.nome) === normalizar(x.empresa));
    return c && c.grupo_id;
  };
  const upsert = async (tabela, linhas) => {
    for (let i = 0; i < linhas.length; i += 200) {
      prog.textContent = 'Gravando ' + tabela + ': ' + Math.min(i + 200, linhas.length) + ' de ' + linhas.length + '…';
      await q(sb.from(tabela).upsert(linhas.slice(i, i + 200), { onConflict: 'chave_importacao', ignoreDuplicates: modo === 'novos' }));
    }
  };
  const ROTULO = { clientes: 'cliente(s)', processos: 'processo(s)', parcelamentos: 'parcelamento(s)', acordos: 'parcela(s) de acordo', tarefas: 'tarefa(s)' };
  // clientes primeiro: os parcelamentos usam o grupo deles
  validos.sort((a, b) => (a.tipo === 'base' ? -1 : 0) - (b.tipo === 'base' ? -1 : 0));
  for (const r of validos) {
    const tabela = TABELA_IMP[r.tipo];
    if (r.tipo === 'parcelamentos') await carregarCadastros(true);
    const filhos = [];
    const linhas = registrosImp(r).map((x) => {
      const y = Object.assign({}, x);
      y.grupo_id = (r.tipo === 'parcelamentos' && grupoDoCliente(x)) || idGrupo(x._grupo);
      delete y._grupo;
      if (y._parcelas) { filhos.push(...y._parcelas.map((p) => Object.assign({ _pai: y.chave_importacao }, p))); delete y._parcelas; }
      return y;
    });
    await upsert(tabela, linhas);
    if (r.tipo === 'parcelamentos' && filhos.length) {
      const ids = {};
      (await buscarTodos(() => sb.from('parcelamentos').select('id,chave_importacao').not('chave_importacao', 'is', null)))
        .forEach((p) => { ids[p.chave_importacao] = p.id; });
      await upsert('parcelas', filhos.filter((p) => ids[p._pai]).map((p) => {
        const y = Object.assign({ parcelamento_id: ids[p._pai] }, p); delete y._pai; return y;
      }));
      resultado.push(filhos.length + ' parcela(s) de parcelamento');
    }
    resultado.push(linhas.length + ' ' + (ROTULO[tabela] || 'lançamento(s) de ' + (r.tipo === 'contabilidade' ? 'Contabilidade' : 'Honorários Jurídico')));
  }
  await carregarCadastros(true);
  prog.textContent = '';
  aviso('✓ Importação concluída.');
  $('imp-previa').innerHTML = '<div class="card"><div class="card-bd msg-ok">✓ Importado: ' + esc(resultado.join(' · ')) +
    '. Confira os totais no Painel Executivo e em Honorários, e compare com as planilhas.</div></div>';
}

// ─────────────────────────── BACKUP ────────────────────────────────
const TABELAS_BACKUP = ['clientes', 'grupos', 'contratos', 'lancamentos', 'processos', 'parcelamentos', 'parcelas', 'acordos', 'tarefas', 'perfis', 'perfil_grupos', 'configuracoes', 'historico'];
async function admBackup(corpo) {
  corpo.innerHTML =
    '<div class="card"><div class="card-hd">💾 Backup de todos os dados</div><div class="card-bd">' +
    '<p>Baixa uma cópia completa de tudo que está no sistema: clientes, grupos, lançamentos, processos, parcelamentos, acordos, tarefas, usuários e histórico.</p>' +
    '<div class="acoes" style="margin:14px 0">' +
    '<button class="btn btn-p" id="bk-excel">⬇ Baixar backup em Excel</button>' +
    '<button class="btn btn-o" id="bk-json">⬇ Baixar backup completo (.json, para restaurar)</button>' +
    '</div><span id="bk-prog" class="sub"></span>' +
    '<div class="dica" style="margin-top:12px"><b>Como guardar com segurança</b><br>' +
    '1. Faça o backup toda semana (e antes de qualquer importação grande).<br>' +
    '2. Guarde numa pasta do seu Google Drive que só você acessa — não mande por e-mail nem WhatsApp.<br>' +
    '3. Mantenha a verificação em duas etapas ligada na sua conta Google.<br>' +
    '4. O arquivo tem dados de clientes: trate como documento sigiloso (LGPD).</div></div></div>';
  $('bk-excel').onclick = (ev) => comBotao(ev.currentTarget, () => fazerBackup('xlsx'));
  $('bk-json').onclick = (ev) => comBotao(ev.currentTarget, () => fazerBackup('json'));
}

async function fazerBackup(formato) {
  const prog = $('bk-prog'), dados = {};
  for (const t of TABELAS_BACKUP) {
    prog.textContent = 'Lendo ' + t + '…';
    dados[t] = await buscarTodos(() => sb.from(t).select('*').order(t === 'historico' ? 'id' : t === 'perfil_grupos' ? 'perfil_id' : t === 'configuracoes' ? 'chave' : 'criado_em'));
  }
  const carimbo = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', 'h');
  const nome = 'Backup ERP Araujo e Castro ' + carimbo;
  if (formato === 'json') {
    baixarArquivo(nome + '.json', JSON.stringify({ gerado_em: new Date().toISOString(), versao: 2, dados }, null, 1), 'application/json');
  } else {
    prog.textContent = 'Montando o Excel…';
    await carregarScript('vendor/exceljs.min.js');
    const wb = new window.ExcelJS.Workbook();
    wb.creator = 'ERP Araújo & Castro';
    const leia = wb.addWorksheet('Leia-me');
    leia.addRows([['Backup do ERP Araújo & Castro'], ['Gerado em', new Date().toLocaleString('pt-BR')], ['Por', E.perfil.email], [],
      ...TABELAS_BACKUP.map((t) => [t, dados[t].length + ' registro(s)'])]);
    leia.getColumn(1).width = 26; leia.getColumn(2).width = 30; leia.getRow(1).font = { bold: true, size: 14 };
    TABELAS_BACKUP.forEach((t) => {
      const ws = wb.addWorksheet(t);
      const cols = dados[t].length ? Object.keys(dados[t][0]) : ['(vazio)'];
      ws.addRow(cols).font = { bold: true };
      dados[t].forEach((reg) => ws.addRow(cols.map((c) => {
        const v = reg[c];
        return v != null && typeof v === 'object' ? JSON.stringify(v) : v;
      })));
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      cols.forEach((c, i) => { ws.getColumn(i + 1).width = Math.min(40, Math.max(10, c.length + 2)); });
    });
    const buf = await wb.xlsx.writeBuffer();
    baixarArquivo(nome + '.xlsx', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }
  prog.textContent = '✓ Backup baixado: ' + TABELAS_BACKUP.map((t) => dados[t].length + ' ' + t).join(' · ');
}

// ─────────────────────────── HISTÓRICO ─────────────────────────────
// Toda gravação fica aqui: quem, quando, em qual tela, em qual registro e o que mudou
// (campo a campo). Inclusões e exclusões mostram os dados principais do registro.
const NOME_TABELA = { clientes: 'Cliente', contratos: 'Contrato', lancamentos: 'Lançamento', processos: 'Processo', parcelamentos: 'Parcelamento',
  parcelas: 'Parcela', acordos: 'Acordo', tarefas: 'Tarefa', perfis: 'Usuário' };
const NOME_ACAO = { INSERT: ['Incluiu', 'pago'], UPDATE: ['Alterou', 'aberto'], DELETE: ['Excluiu', 'vencido'] };
const CAMPOS_IGNORADOS = ['atualizado_em', 'criado_em', 'criado_por', 'id', 'chave_importacao'];
const ROTULO_CAMPO = {
  grupo_id: 'Grupo', cliente_id: 'Cliente', contrato_id: 'Contrato', parcelamento_id: 'Parcelamento', descricao: 'Descrição', categoria: 'Categoria',
  valor: 'Valor', vencimento: 'Vencimento', pago: 'Pago', data_pagamento: 'Data do pagamento', forma_pagamento: 'Forma de pagamento',
  responsavel: 'Responsável', referencia: 'Referência', cobranca: 'Cobrança', perda: 'Prejuízo', redutor: 'Redutor de receita', empresa: 'Empresa',
  favorecido: 'Fornecedor', conta: 'Banco/conta', chave_pix: 'Chave PIX', obs: 'Observação', nome: 'Nome', cpf_cnpj: 'CPF/CNPJ', papel: 'Acesso',
  numero: 'Número', status: 'Status', titulo: 'Tarefa', prazo: 'Prazo', prioridade: 'Prioridade', processo: 'Processo', parcela: 'Parcela',
  total_parcelas: 'Total de parcelas', valor_total: 'Valor total', num_parcelas: 'Nº de parcelas', primeiro_vencimento: '1º vencimento',
  socio_admin: 'Sócio-administrador', pgfn: 'PGFN', rfb: 'RFB', age_mg: 'AGE/MG', sefaz_mg: 'SEFAZ/MG', capag: 'CAPAG', tipo: 'Tipo'
};
// campos que resumem um registro quando ele é incluído ou excluído
const RESUMO = {
  lancamentos: ['empresa', 'tipo', 'redutor', 'grupo_id', 'descricao', 'valor', 'vencimento', 'pago', 'responsavel'],
  clientes: ['grupo_id', 'nome', 'cpf_cnpj', 'tipo', 'responsavel'], contratos: ['cliente_id', 'descricao', 'valor_total', 'num_parcelas', 'primeiro_vencimento'],
  processos: ['grupo_id', 'numero', 'natureza', 'status'], parcelamentos: ['grupo_id', 'empresa', 'natureza', 'numero'], parcelas: ['numero', 'vencimento', 'pago'],
  acordos: ['grupo_id', 'processo', 'parcela', 'valor', 'vencimento', 'pago'], tarefas: ['titulo', 'grupo_id', 'responsavel', 'prazo', 'status'], perfis: ['nome', 'email', 'papel']
};
const rotCampo = (k) => ROTULO_CAMPO[k] || k.replace(/_id$/, '').replace(/_/g, ' ');
async function admHistorico(corpo) {
  const F = E.adm.hist = E.adm.hist || { tabela: E.adm.tabela || '', acao: '', quem: '', de: '', ate: '', busca: '' };
  const perfis = await q(sb.from('perfis').select('id, nome, email'));
  let c = sb.from('historico').select('*').order('quando', { ascending: false }).limit(500);
  if (F.tabela) c = c.eq('tabela', F.tabela);
  if (F.acao) c = c.eq('acao', F.acao);
  if (F.quem === 'sistema') c = c.is('usuario', null); else if (F.quem) c = c.eq('usuario', F.quem);
  if (F.de) c = c.gte('quando', F.de + 'T00:00:00');
  if (F.ate) c = c.lte('quando', F.ate + 'T23:59:59');
  const reg = await q(c);
  const quem = {}; perfis.forEach((p) => { quem[p.id] = p.nome || p.email; });
  const autor = (h) => quem[h.usuario] || (h.usuario ? 'usuário removido' : 'sistema / importação');
  const rotulo = (d, t) => {
    if (!d) return '';
    const g = d.grupo_id ? ' · ' + nomeGrupo(d.grupo_id) : '';
    if (t === 'parcelamentos') return d.empresa + (d.natureza ? ' · ' + d.natureza : '');
    if (t === 'parcelas') return 'parcela ' + (d.numero || '') + ' · venc. ' + dataBR(d.vencimento);
    if (t === 'processos') return 'Nº ' + d.numero + g;
    if (t === 'acordos') return d.processo + (d.parcela ? ' · parc. ' + d.parcela : '') + g;
    if (t === 'tarefas') return d.titulo + g;
    return d.nome || ((d.descricao || '') + g) || d.email || '';
  };
  const detalhe = (h) => {
    if (h.acao === 'UPDATE' && h.antes && h.depois) {
      const campos = Object.keys(h.depois).filter((k) => !CAMPOS_IGNORADOS.includes(k) && JSON.stringify(h.antes[k]) !== JSON.stringify(h.depois[k]));
      return campos.map((k) => '<div><span class="sub">' + esc(rotCampo(k)) + ':</span> ' + esc(fmtHist(h.antes[k], k)) + ' → <b>' + esc(fmtHist(h.depois[k], k)) + '</b></div>').join('')
        || '<span class="sub">sem mudança de conteúdo</span>';
    }
    const d = h.depois || h.antes || {};
    const campos = (RESUMO[h.tabela] || Object.keys(d)).filter((k) => d[k] != null && d[k] !== '' && !CAMPOS_IGNORADOS.includes(k));
    return (h.acao === 'DELETE' ? '<div class="sub" style="color:var(--red);font-weight:700">registro apagado — dados que ele tinha:</div>' : '') +
      campos.map((k) => '<div><span class="sub">' + esc(rotCampo(k)) + ':</span> ' + esc(fmtHist(d[k], k)) + '</div>').join('');
  };
  const b = normalizar(F.busca);
  const lista = !b ? reg : reg.filter((h) => normalizar(autor(h) + ' ' + rotulo(h.depois || h.antes, h.tabela) + ' ' + JSON.stringify(h.depois || h.antes || {})).includes(b));
  const conta = (a) => lista.filter((h) => h.acao === a).length;
  corpo.innerHTML =
    '<div class="filtros">' +
    '<select class="busca sel" id="hist-tabela"><option value="">Todas as telas</option>' + Object.entries(NOME_TABELA).map(([k, v]) => '<option value="' + k + '"' + (F.tabela === k ? ' selected' : '') + '>' + v + 's</option>').join('') + '</select>' +
    '<select class="busca sel" id="hist-acao"><option value="">Todas as ações</option>' + Object.entries(NOME_ACAO).map(([k, v]) => '<option value="' + k + '"' + (F.acao === k ? ' selected' : '') + '>' + v[0] + '</option>').join('') + '</select>' +
    '<select class="busca sel" id="hist-quem"><option value="">Todas as pessoas</option>' + perfis.map((p) => '<option value="' + p.id + '"' + (F.quem === p.id ? ' selected' : '') + '>' + esc(p.nome || p.email) + '</option>').join('') +
    '<option value="sistema"' + (F.quem === 'sistema' ? ' selected' : '') + '>Sistema / importação</option></select>' +
    '<input class="busca data-texto" id="hist-de" inputmode="numeric" placeholder="de dd/mm/aaaa" value="' + esc(F.de ? dataBR(F.de) : '') + '" autocomplete="off">' +
    '<input class="busca data-texto" id="hist-ate" inputmode="numeric" placeholder="até dd/mm/aaaa" value="' + esc(F.ate ? dataBR(F.ate) : '') + '" autocomplete="off">' +
    '<button class="btn btn-o btn-mini" id="hist-aplicar">Aplicar</button>' +
    '<input class="busca" id="hist-busca" placeholder="Buscar registro, grupo, pessoa, valor…" value="' + esc(F.busca) + '">' +
    '<button class="btn btn-o btn-mini" id="hist-csv">⬇ CSV</button></div>' +
    '<div class="kpis">' + kpi('Alterações no recorte', String(lista.length), '', reg.length >= 500 ? 'mostrando as 500 mais recentes' : 'mais recente primeiro') +
    kpi('Inclusões', String(conta('INSERT')), 'verde', '') + kpi('Alterações', String(conta('UPDATE')), '', '') + kpi('Exclusões', String(conta('DELETE')), 'vermelho', '') + '</div>' +
    '<div class="card">' + (lista.length ? '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th data-tipo="data">Quando</th><th>Quem</th><th>O quê</th><th>Registro</th><th class="sem-ordem">Detalhes</th></tr></thead><tbody>' +
      lista.map((h) => '<tr><td class="mono" data-ord="' + h.quando + '">' + dataHoraBR(h.quando) + '</td><td>' + esc(autor(h)) + '</td>' +
        '<td><span class="pill ' + NOME_ACAO[h.acao][1] + '">' + NOME_ACAO[h.acao][0] + '</span> <span class="sub">' + esc(NOME_TABELA[h.tabela] || h.tabela) + '</span></td>' +
        '<td><b>' + esc(rotulo(h.depois || h.antes, h.tabela)) + '</b></td><td class="hist-mud">' + detalhe(h) + '</td></tr>').join('') +
      '</tbody></table></div>' : '<div class="vazio">Nenhuma alteração com esses filtros.</div>') + '</div>';
  const muda = (k) => (ev) => { F[k] = ev.target.value; if (k === 'tabela') E.adm.tabela = F.tabela; pintarAdmin(); };
  $('hist-tabela').onchange = muda('tabela'); $('hist-acao').onchange = muda('acao'); $('hist-quem').onchange = muda('quem');
  mascaraData($('hist-de')); mascaraData($('hist-ate'));
  const aplicarDatas = () => {
    const de = lerDataBR($('hist-de').value), ate = lerDataBR($('hist-ate').value);
    if (($('hist-de').value && !de) || ($('hist-ate').value && !ate)) return aviso('Data incompleta: use dd/mm/aaaa.', true);
    let a = de ? de.iso : '', b = ate ? ate.iso : '';
    if (a && b && a > b) [a, b] = [b, a];               // datas invertidas: troca em silêncio
    F.de = a; F.ate = b;
    if ((de && de.corrigida) || (ate && ate.corrigida)) aviso('Dia ajustado para o último dia do mês.');
    pintarAdmin();
  };
  $('hist-aplicar').onclick = aplicarDatas;
  ['hist-de', 'hist-ate'].forEach((id) => { $(id).onkeydown = (ev) => { if (ev.key === 'Enter') aplicarDatas(); }; });
  let t; $('hist-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; pintarAdmin().then(() => { const i = $('hist-busca'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); }, 400); };
  $('hist-csv').onclick = () => {
    const linhas = [['Quando', 'Quem', 'Ação', 'Tela', 'Registro', 'Detalhes']].concat(lista.map((h) => {
      const tmp = document.createElement('div'); tmp.innerHTML = detalhe(h).replace(/<\/div>/g, ' | ');
      return [dataHoraBR(h.quando), autor(h), NOME_ACAO[h.acao][0], NOME_TABELA[h.tabela] || h.tabela, rotulo(h.depois || h.antes, h.tabela), tmp.textContent.trim()];
    }));
    baixarArquivo('Historico ERP ' + hojeISO() + '.csv', '﻿' + linhas.map((l) => l.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\n'), 'text/csv');
  };
}
function fmtHist(v, campo) {
  if (v == null || v === '') return '(vazio)';
  // ids viram nomes legíveis
  if (campo === 'grupo_id') return nomeGrupo(v) || 'grupo excluído';
  if (campo === 'cliente_id') { const c = E.clientes.find((x) => x.id === v); return c ? c.nome : 'cliente excluído'; }
  if (campo === 'contrato_id') return 'contrato';
  if (campo === 'empresa') return v === 'contabilidade' ? 'Contabilidade' : v === 'escritorio' ? 'Jurídico' : v;
  if (campo === 'valor' || campo === 'valor_total') return brl(v);
  if (v === true) return 'sim'; if (v === false) return 'não';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return dataBR(v);
  if (typeof v === 'number') return v.toLocaleString('pt-BR');
  return String(v).length > 60 ? String(v).slice(0, 57) + '…' : String(v);
}

// ─────────────────────────── E-MAIL ──────────────────────────────
// Configuração dos avisos por e-mail: o serviço (Gmail do escritório, outro SMTP ou Resend),
// o teste e a fila. A senha vai direto para o banco (config_privada) e nunca volta para a tela.
async function admEmail(corpo) {
  const [st, fila] = await Promise.all([
    q(sb.rpc('status_config_email')).catch(() => ({})),
    q(sb.from('email_fila').select('para, assunto, status, erro, criado_em, enviado_em, tipo').order('criado_em', { ascending: false }).limit(30)).catch(() => [])
  ]);
  const prov = st.provedor || 'gmail';
  corpo.innerHTML =
    '<div class="duas-col"><div class="card"><div class="card-hd">Serviço de envio ' + (st.tem_senha ? '<span class="pill pago">configurado</span>' : '<span class="pill hoje">não configurado</span>') + '</div><div class="card-bd">' +
    '<form id="f-email" class="grade">' +
    campo('Serviço', '<select name="provedor"><option value="gmail">Gmail do escritório (sem custo)</option><option value="smtp">Outro e-mail (SMTP: Hostinger, Locaweb, Outlook…)</option><option value="resend">Resend (plano grátis com limite)</option></select>', 'inteiro') +
    campo('E-mail que envia', '<input name="usuario" type="email" value="' + esc(st.usuario || '') + '" placeholder="escritorio@gmail.com">') +
    campo('<span id="rot-senha">Senha de app do Google</span>', '<input name="senha" type="password" autocomplete="new-password" placeholder="' + (st.tem_senha ? '•••••••• (deixe vazio para manter)' : '16 letras, sem espaços') + '">') +
    '<div class="grade inteiro" id="email-smtp">' + campo('Servidor SMTP', '<input name="host" value="' + esc(st.host || '') + '" placeholder="smtp.hostinger.com">') +
    campo('Porta', '<input name="porta" inputmode="numeric" value="' + esc(String(st.porta || 465)) + '">') + '</div>' +
    campo('Nome do remetente', '<input name="remetente" value="' + esc(st.remetente || 'ERP Araújo & Castro') + '">') +
    campo('Responder para (opcional)', '<input name="responder" type="email" value="' + esc(st.responder || '') + '">') +
    campo('Endereço do sistema (botão "Abrir no ERP")', '<input name="url" value="' + esc(location.origin) + '">', 'inteiro') +
    '</form>' +
    '<div class="acoes" style="margin-top:12px"><button class="btn btn-p" id="email-salvar">Salvar</button><button class="btn btn-o" id="email-teste">Enviar e-mail de teste</button>' +
    '<button class="btn btn-o" id="email-diag">🩺 Verificar funções</button><button class="btn btn-o" id="email-agora">Enviar fila agora</button><button class="btn btn-o" id="email-resumo">Mandar resumo do dia agora</button></div>' +
    (st.configurado_em ? '<p class="sub" style="margin-top:8px">Configurado em ' + dataHoraBR(st.configurado_em) + '.</p>' : '') +
    '</div></div>' +
    '<div class="card"><div class="card-hd">Como configurar (uma vez)</div><div class="card-bd" id="email-ajuda"></div></div></div>' +
    '<div class="kpis">' + kpi('Na fila', String(st.pendentes || 0), '', 'saem a cada 5 minutos') + kpi('Enviados em 7 dias', String(st.enviados_7d || 0), 'verde', '') +
    kpi('Com erro', String(st.erros || 0), st.erros ? 'vermelho' : '', 'veja o motivo abaixo') + '</div>' +
    '<div class="card"><div class="card-hd">Últimos e-mails</div>' + (fila.length ? '<div class="tabela-wrap"><table><thead><tr><th>Quando</th><th>Para</th><th>Assunto</th><th>Situação</th></tr></thead><tbody>' +
      fila.map((m) => '<tr><td class="mono">' + dataHoraBR(m.criado_em) + '</td><td>' + esc(m.para) + '</td><td>' + esc(m.assunto) + '</td><td>' +
        '<span class="pill ' + ({ enviado: 'pago', pendente: 'aberto', erro: 'vencido', cancelado: 'neutro' }[m.status] || 'neutro') + '">' + esc(m.status) + '</span>' +
        (m.erro ? '<div class="sub">' + esc(m.erro) + '</div>' : '') + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="vazio">Nenhum e-mail ainda.</div>') + '</div>';
  const f = $('f-email');
  f.provedor.value = prov;
  const AJUDA = {
    gmail: '<ol class="passos"><li>No Gmail do escritório: <b>Conta Google → Segurança → Verificação em duas etapas</b> (ligar, se estiver desligada).</li>' +
      '<li>Ainda em Segurança, abra <b>Senhas de app</b>, crie uma com o nome "ERP" e copie as 16 letras.</li>' +
      '<li>Aqui: escolha <b>Gmail</b>, informe o e-mail e cole a senha de app. Clique em <b>Salvar</b> e depois em <b>Enviar e-mail de teste</b>.</li></ol>',
    smtp: '<ol class="passos"><li>No painel do seu provedor de e-mail, pegue o <b>servidor SMTP</b> e a <b>porta SSL (465)</b>.</li><li>Informe o e-mail, a senha da caixa, o servidor e a porta.</li><li>Salve e envie o teste.</li></ol>',
    resend: '<ol class="passos"><li>Crie a conta em resend.com e confirme o domínio do escritório (ex.: araujoecastro.adv.br).</li><li>Crie uma <b>API key</b> e cole no campo de senha; em "E-mail que envia", use um endereço do domínio confirmado.</li><li>Salve e envie o teste. O plano grátis tem limite diário de envios; acima disso é pago.</li></ol>'
  };
  const trocar = () => {
    $('email-smtp').classList.toggle('escondido', f.provedor.value !== 'smtp');
    $('rot-senha').textContent = { gmail: 'Senha de app do Google', smtp: 'Senha do e-mail', resend: 'Chave da API (Resend)' }[f.provedor.value];
    $('email-ajuda').innerHTML = AJUDA[f.provedor.value] + '<p class="sub"><b>Uma vez só, no Supabase:</b> Edge Functions → Deploy a new function → Via Editor → nome <b>erp-emails</b> → cole o arquivo ' +
      '<code>supabase/functions/erp-emails/index.ts</code> do GitHub → Deploy → desligue <b>Verify JWT</b>. O passo a passo completo está no COMO-ATUALIZAR.</p>';
  };
  f.provedor.onchange = trocar; trocar();
  $('email-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.usuario.value.trim())) throw new Error('Informe o e-mail que envia.');
    if (f.provedor.value === 'smtp' && !f.host.value.trim()) throw new Error('Informe o servidor SMTP.');
    await q(sb.rpc('salvar_config_email', { p: { provedor: f.provedor.value, usuario: f.usuario.value.trim(), senha: f.senha.value.replace(/\s+/g, f.provedor.value === 'gmail' ? '' : ' ').trim(),
      host: f.host.value.trim(), porta: Number(f.porta.value) || 465, remetente: f.remetente.value.trim(), responder: f.responder.value.trim() } }));
    await q(sb.rpc('salvar_url_sistema', { p: f.url.value.trim() }));
    aviso('✓ Configuração de e-mail salva.'); await pintarAdmin();
  });
  const chamar = async (acao, msgOk) => {
    const data = await chamarFuncao('erp-emails', { acao });
    if (data && data.aviso) throw new Error(data.aviso);
    aviso('✓ ' + msgOk + ' — enviados: ' + ((data && data.enviados) || 0) + (data && data.erros ? ', com erro: ' + data.erros + ' (' + data.ultimoErro + ')' : '') + '.');
    await pintarAdmin();
  };
  $('email-diag').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const r = await verificarFuncoes();
    const j = abrirJanela({ titulo: 'Funções do Supabase', corpo: '<div class="lista-ficha">' + r.map(([n, ok, m]) => '<div class="item-ficha"><div><b>' + (ok ? '✅ ' : '❌ ') + n + '</b><div class="sub">' + esc(m) + '</div></div></div>').join('') + '</div>' +
      '<p class="sub" style="margin-top:10px">Para publicar: Supabase → Edge Functions → Deploy a new function → Via Editor → nome exatamente como acima → cole o arquivo de <code>supabase/functions/NOME/index.ts</code> (botão Raw no GitHub) → Deploy → desligue "Verify JWT".</p>' });
    return j;
  });
  $('email-teste').onclick = (ev) => comBotao(ev.currentTarget, () => chamar('teste', 'Teste enviado para o seu e-mail'));
  $('email-agora').onclick = (ev) => comBotao(ev.currentTarget, () => chamar('enviar', 'Fila enviada'));
  $('email-resumo').onclick = (ev) => comBotao(ev.currentTarget, () => chamar('resumo', 'Resumo do dia montado'));
}

// Cada pessoa escolhe o que quer receber por e-mail (⋯ → Meus avisos por e-mail)
const PREFS_EMAIL = [['resumo', 'Resumo do dia (dias úteis, 7h45)'], ['tarefa', 'Tarefa atribuída a mim, revisão e aviso de atraso'], ['mencao', 'Quando alguém me menciona (@Nome)'],
  ['fatal', 'Prazos fatais nos próximos dias (no resumo)'], ['vencimentos', 'Documentos e certidões vencendo (no resumo)'], ['publicacao', 'Publicação nova no Diário de Justiça']];
async function janelaMeusAvisos() {
  const eu = await q(sb.from('perfis').select('pref_email, email').eq('id', (E.perfil || window.ERP_EU).id).single());
  const pf = eu.pref_email || {};
  const j = abrirJanela({ titulo: 'Meus avisos por e-mail',
    corpo: '<p class="sub" style="margin-bottom:10px">Os e-mails vão para <b>' + esc(eu.email) + '</b>.</p>' +
      PREFS_EMAIL.map(([k, r]) => '<label class="check" style="margin-bottom:8px"><input type="checkbox" data-pref="' + k + '"' + (pf[k] !== false ? ' checked' : '') + '> ' + r + '</label>').join(''),
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-salvar-pref">Salvar</button></div>' });
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-salvar-pref').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const p = {}; j.querySelectorAll('[data-pref]').forEach((c) => { p[c.dataset.pref] = c.checked; });
    await q(sb.rpc('salvar_minhas_preferencias', { p }));
    aviso('✓ Preferências salvas.'); fecharJanela(j);
  });
}

'use strict';
// ═══════════════════════════════════════════════════════════════════
// Tarefas — lista em árvore (subtarefas), quadro (kanban), calendário,
// fluxos com prazos em dias úteis, relatório, checklist, comentários,
// recorrência e alertas (sino da barra superior).
// ═══════════════════════════════════════════════════════════════════
const PRIORIDADE = { alta: ['Alta', 'vencido'], media: ['Média', 'hoje'], baixa: ['Baixa', 'pago'] };
const STATUS_TAREFA = { pendente: 'Pendente', andamento: 'Em andamento', aguardando: 'Aguardando', revisao: 'Aguardando revisão', concluida: 'Concluída', cancelada: 'Cancelada' };
const COLUNAS_KANBAN = ['pendente', 'andamento', 'aguardando', 'revisao', 'concluida'];
const tarefaFechada = (t) => t.status === 'concluida' || t.status === 'cancelada';

// ─────────────── pessoas, feriados e dias úteis ───────────────
function primeiroNome(s) { return normalizar(String(s || '').trim().split(/\s+/)[0]); }
function meuNome() { return (E.perfil && E.perfil.nome) || ''; }
function ehMinha(t) {
  const eu = primeiroNome(meuNome());
  if (!eu) return false;
  return primeiroNome(t.responsavel) === eu || String(t.participantes || '').split(',').some((p) => primeiroNome(p) === eu);
}
async function equipe() {
  if (!E._equipe) E._equipe = await q(sb.rpc('equipe_nomes')).catch(() => []);
  return E._equipe;
}
async function usuarioPorNome(nome) {
  const n = primeiroNome(nome);
  if (!n) return null;
  const u = (await equipe()).find((x) => primeiroNome(x.nome) === n || primeiroNome(String(x.email).split('@')[0]) === n);
  return u ? u.id : null;
}
async function notificar(nome, titulo, detalhe, link, tipo) {
  const id = await usuarioPorNome(nome);
  if (!id || (E.perfil && id === E.perfil.id)) return;
  await sb.from('notificacoes').insert({ usuario_id: id, tipo: tipo || 'tarefa', titulo, detalhe: detalhe || '', link: link || '' });
}
async function feriados() {
  if (!E._feriados) {
    const fs = await q(sb.from('feriados').select('data, abrangencia')).catch(() => []);
    E._feriados = new Set(fs.map((f) => f.data));
  }
  return E._feriados;
}
function diaUtil(isoStr, fer) {
  const d = new Date(isoStr + 'T12:00:00').getDay();
  return d !== 0 && d !== 6 && !fer.has(isoStr);
}
// n dias úteis antes da data (0 = a própria data, ou o dia útil anterior se ela não for útil)
function subtrairUteis(isoStr, n, fer) {
  let d = isoStr;
  while (!diaUtil(d, fer)) d = somarDias(d, -1);
  for (let i = 0; i < n; i++) { d = somarDias(d, -1); while (!diaUtil(d, fer)) d = somarDias(d, -1); }
  return d;
}
function uteisAte(isoStr, fer) {   // dias úteis de hoje até a data (negativo se já passou)
  const h = hojeISO(); let n = 0, d = h;
  if (isoStr === h) return 0;
  const passo = isoStr > h ? 1 : -1;
  for (let i = 0; i < 400 && d !== isoStr; i++) { d = somarDias(d, passo); if (diaUtil(d, fer)) n += passo; }
  return n;
}
// Semáforo (calculado, nunca digitado): ⚫ fatal em risco · 🔴 atrasada · 🟡 até 2 dias úteis · 🟢 no prazo
function semaforo(t, fer) {
  if (tarefaFechada(t)) return null;
  const h = hojeISO(); fer = fer || E._feriados || new Set();
  if (t.prazo && t.prazo < h && t.prazo_fatal && uteisAte(t.prazo_fatal, fer) <= 3) return ['preto', 'Prazo fatal em risco'];
  if (t.prazo && t.prazo < h) return ['vermelho', 'Atrasada'];
  const ref = [t.prazo, t.prazo_fatal].filter(Boolean).sort()[0];
  if (ref && uteisAte(ref, fer) <= 2) return ['amarelo', 'Vence em até 2 dias úteis'];
  return ['verde', 'No prazo'];
}
function bolinha(t) { const s = semaforo(t); return s ? '<span class="semaforo ' + s[0] + '" title="' + s[1] + '"></span>' : ''; }
// Fila de trabalho: fatal em risco → atrasadas → fatal mais próximo → prioridade → prazo interno
const PESO_PRI = { alta: 0, media: 1, baixa: 2 };
function ordenarFila(lista) {
  const peso = (t) => { const s = semaforo(t); return s ? { preto: 0, vermelho: 1, amarelo: 2, verde: 3 }[s[0]] : 4; };
  return lista.slice().sort((a, b) => peso(a) - peso(b) || String(a.prazo_fatal || '9999').localeCompare(String(b.prazo_fatal || '9999'))
    || (PESO_PRI[a.prioridade] ?? 1) - (PESO_PRI[b.prioridade] ?? 1) || String(a.prazo || '9999').localeCompare(String(b.prazo || '9999')));
}
async function cardMinhaFila() {
  await feriados();
  const ts = await q(sb.from('tarefas').select('*').not('status', 'in', '(concluida,cancelada)')).catch(() => []);
  const minhas = ordenarFila(ts.filter(ehMinha)).slice(0, 8);
  const html = '<div class="card"><div class="card-hd">📋 Minha fila de trabalho <span class="sub">' + ts.filter(ehMinha).length + ' aberta(s)</span></div><div class="card-bd">' +
    (minhas.length ? '<div class="lista-ficha">' + minhas.map((t) => '<div class="item-ficha clicavel" data-fila="' + t.id + '"><div>' + bolinha(t) + ' <b>' + esc(t.titulo) + '</b>' +
      '<div class="sub">' + (t.prazo ? 'prazo ' + dataBR(t.prazo) : 'sem prazo') + (t.prazo_fatal ? ' · ⚑ fatal ' + dataBR(t.prazo_fatal) : '') + (t.status === 'revisao' ? ' · aguardando revisão' : '') + '</div></div>' +
      '<span class="pill ' + (PRIORIDADE[t.prioridade] || ['', 'neutro'])[1] + '">' + esc((PRIORIDADE[t.prioridade] || [t.prioridade])[0]) + '</span></div>').join('') + '</div>'
      : '<div class="sub">Nenhuma tarefa com você. 🎉</div>') + '</div></div>';
  return { html, ligar: (raiz) => raiz.querySelectorAll('[data-fila]').forEach((d) => d.onclick = () => formTarefa(ts.find((t) => t.id === d.dataset.fila), () => irPara(E.tela))) };
}
function diasAte(isoStr) { return Math.round((new Date(isoStr + 'T12:00:00') - new Date(hojeISO() + 'T12:00:00')) / 86400000); }
function progresso(t, filhas) {
  const ck = Array.isArray(t.checklist) ? t.checklist : [];
  const tot = ck.length + filhas.length, feitos = ck.filter((c) => c.feito).length + filhas.filter(tarefaFechada).length;
  return tot ? { tot, feitos, pct: Math.round(feitos / tot * 100) } : null;
}
function barraProgresso(p) {
  return p ? '<span class="tf-prog" title="' + p.feitos + ' de ' + p.tot + ' concluído(s)"><i style="width:' + p.pct + '%"></i></span><span class="sub"> ' + p.feitos + '/' + p.tot + '</span>' : '';
}
function seloPrazo(t) {
  if (tarefaFechada(t) || !t.prazo) return '';
  const d = diasAte(t.prazo);
  if (d < 0) return ' <span class="pill vencido">atrasada ' + (-d) + 'd</span>';
  if (d === 0) return ' <span class="pill hoje">hoje</span>';
  if (d <= 2) return ' <span class="pill hoje">em ' + d + 'd</span>';
  return '';
}
function seloFatal(t) {
  if (!t.prazo_fatal) return '';
  const d = diasAte(t.prazo_fatal);
  return ' <span class="pill ' + (tarefaFechada(t) ? 'neutro' : d <= 2 ? 'vencido' : 'cobranca') + '" title="Prazo fatal">⚑ ' + dataBR(t.prazo_fatal) + '</span>';
}
function nomeCliente(id) { const c = E.clientes.find((x) => x.id === id); return c ? c.nome : ''; }

// ─────────────────────────── tela ───────────────────────────
TELAS.tarefas = async function () {
  E.tf = E.tf || { vista: 'lista', atalho: 'abertas', resp: '', pri: '', busca: '', mes: hojeISO().slice(0, 7) };
  const F = E.tf;
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Tarefas</h1><p>Prazos, fluxos e acompanhamento do escritório</p></div>' +
    '<div class="acoes"><button class="btn btn-o" id="tf-regras">⚙ Regras automáticas</button><button class="btn btn-o" id="tf-modelos">Modelos de fluxo</button><button class="btn btn-o" id="tf-feriados">Feriados</button><button class="btn btn-o" id="tf-agenda" title="Prazos fatais e audiências no seu Google Agenda">📅 Google Agenda</button>' +
    '<button class="btn btn-o" id="tf-fluxo">+ Novo fluxo</button><button class="btn btn-p" id="tf-nova">+ Nova tarefa</button></div></div>' +
    '<div class="filtros">' +
    '<div class="segmento" id="tf-vista">' + [['lista', 'Lista'], ['kanban', 'Quadro'], ['calendario', 'Calendário'], ['fluxos', 'Fluxos'], ['relatorio', 'Relatório']]
      .map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<div class="segmento" id="tf-atalho">' + [['minhas', 'Minhas'], ['hoje', 'Hoje'], ['atrasadas', 'Atrasadas'], ['7', '7 dias'], ['abertas', 'Abertas'], ['concluidas', 'Concluídas'], ['', 'Todas']]
      .map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<select class="busca sel" id="tf-resp"><option value="">Todas as pessoas</option>' + Object.keys(PESSOA).map((p) => '<option>' + p + '</option>').join('') + '</select>' +
    '<select class="busca sel" id="tf-pri"><option value="">Todas as prioridades</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select>' +
    '<input class="busca" id="tf-busca" placeholder="Buscar tarefa, cliente, processo ou etiqueta" autocomplete="off">' +
    '</div><div id="tf-corpo"><div class="carregando">Carregando…</div></div>';
  $('tf-nova').onclick = () => formTarefa({}, () => TELAS.tarefas());
  $('tf-fluxo').onclick = () => formNovoFluxo(() => TELAS.tarefas());
  $('tf-modelos').onclick = () => janelaModelos();
  $('tf-regras').onclick = () => janelaRegras();
  $('tf-feriados').onclick = () => janelaFeriados();
  $('tf-agenda').onclick = () => janelaAgenda();
  $('tf-vista').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.vista = b.dataset.v; pintarTarefas(); } };
  $('tf-atalho').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.atalho = b.dataset.v; pintarTarefas(); } };
  [['tf-resp', 'resp'], ['tf-pri', 'pri']].forEach(([id, k]) => { $(id).value = F[k]; $(id).onchange = (ev) => { F[k] = ev.target.value; pintarTarefas(); }; });
  $('tf-busca').value = F.busca;
  let t; $('tf-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; pintarTarefas(); }, 250); };
  const [ts, fl] = await Promise.all([
    buscarTodos(() => sb.from('tarefas').select('*').order('prazo', { nullsFirst: false })),
    q(sb.from('fluxos').select('*').order('prazo_fatal', { nullsFirst: false })).catch(() => [])
  ]);
  E._tarefas = ts; E._fluxos = fl;
  await feriados();
  pintarTarefas();
};

function filtrarTarefas() {
  const F = E.tf, h = hojeISO(), b = normalizar(F.busca);
  return (E._tarefas || []).filter((t) => {
    const a = F.atalho;
    if (a === 'abertas' && tarefaFechada(t)) return false;
    if (a === 'concluidas' && !tarefaFechada(t)) return false;
    if (a === 'minhas' && (tarefaFechada(t) || !ehMinha(t))) return false;
    if (a === 'hoje' && (tarefaFechada(t) || !t.prazo || t.prazo > h)) return false;
    if (a === 'atrasadas' && (tarefaFechada(t) || !t.prazo || t.prazo >= h)) return false;
    if (a === '7' && (tarefaFechada(t) || !t.prazo || t.prazo > somarDias(h, 7))) return false;
    if (F.resp && t.responsavel !== F.resp) return false;
    if (F.pri && t.prioridade !== F.pri) return false;
    if (b && !normalizar(t.titulo + ' ' + t.processos_vinculados + ' ' + nomeGrupo(t.grupo_id) + ' ' + nomeCliente(t.cliente_id) + ' ' + t.etiquetas + ' ' + t.descricao).includes(b)) return false;
    return true;
  });
}

function pintarTarefas() {
  const F = E.tf, h = hojeISO();
  document.querySelectorAll('#tf-vista button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === F.vista));
  document.querySelectorAll('#tf-atalho button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === F.atalho));
  $('tf-atalho').style.display = F.vista === 'fluxos' || F.vista === 'relatorio' ? 'none' : '';
  const todas = E._tarefas || [];
  const abertas = todas.filter((t) => !tarefaFechada(t));
  const atrasadas = abertas.filter((t) => t.prazo && t.prazo < h).length;
  const fatais = abertas.filter((t) => t.prazo_fatal && t.prazo_fatal >= h && t.prazo_fatal <= somarDias(h, 7)).length;
  const minhas = abertas.filter(ehMinha).length;
  const kpis = '<div class="kpis">' + kpi('Em aberto', String(abertas.length), '', minhas + ' comigo') +
    kpi('Atrasadas', String(atrasadas), atrasadas ? 'vermelho' : 'verde', 'todas as pessoas') +
    kpi('Prazos fatais em 7 dias', String(fatais), fatais ? 'ambar' : '', 'tarefas com prazo fatal marcado') +
    kpi('Concluídas no mês', String(todas.filter((t) => t.status === 'concluida' && String(t.concluida_em || '').slice(0, 7) === h.slice(0, 7)).length), 'verde', '') + '</div>';
  const V = { lista: vistaLista, kanban: vistaKanban, calendario: vistaCalendario, fluxos: vistaFluxos, relatorio: vistaRelatorio };
  $('tf-corpo').innerHTML = kpis + '<div id="tf-vista-corpo"></div>';
  V[F.vista]($('tf-vista-corpo'));
}
const recarregarTarefas = () => TELAS.tarefas();

async function concluirTarefa(id) {
  await q(sb.from('tarefas').update({ status: 'concluida' }).eq('id', id));
}
function ligarLinhasTarefa(raiz) {
  raiz.querySelectorAll('[data-concluir]').forEach((bt) => bt.onclick = (ev) => { ev.stopPropagation(); comBotao(bt, async () => {
    await concluirTarefa(bt.dataset.concluir); aviso('✓ Tarefa concluída.'); await recarregarTarefas();
  }); });
  raiz.querySelectorAll('[data-editar-t]').forEach((bt) => bt.onclick = (ev) => { ev.stopPropagation();
    formTarefa(E._tarefas.find((t) => t.id === bt.dataset.editarT), recarregarTarefas); });
}

// ── Lista em árvore ──
function vistaLista(alvo) {
  const lista = filtrarTarefas(), ids = new Set(lista.map((t) => t.id));
  const filhasDe = (id) => (E._tarefas || []).filter((x) => x.tarefa_pai_id === id);
  let raizes = lista.filter((t) => !t.tarefa_pai_id || !ids.has(t.tarefa_pai_id));
  if (E.tf.atalho === 'minhas') raizes = ordenarFila(raizes);
  const linha = (t, nivel) => {
    const pr = PRIORIDADE[t.prioridade] || [t.prioridade || '—', 'neutro'];
    const filhas = filhasDe(t.id), pai = t.tarefa_pai_id && !ids.has(t.tarefa_pai_id) ? (E._tarefas.find((x) => x.id === t.tarefa_pai_id) || {}).titulo : '';
    const onde = [nomeCliente(t.cliente_id) || nomeGrupo(t.grupo_id), t.processos_vinculados].filter(Boolean).join(' · ');
    return '<tr class="clicavel' + (tarefaFechada(t) ? ' tf-feita' : '') + '" data-editar-t="' + t.id + '"><td class="mono" data-ord="' + esc(t.prazo || '9999') + '">' + dataBR(t.prazo) + seloPrazo(t) + '</td>' +
      '<td style="padding-left:' + (12 + nivel * 22) + 'px">' + bolinha(t) + ' ' + (nivel ? '<span class="sub">↳ </span>' : '') + '<b>' + esc(t.titulo) + '</b>' + seloFatal(t) +
      (t.recorrencia ? ' <span class="pill neutro" title="Repete">↻ ' + esc(t.recorrencia) + '</span>' : '') + ' ' + barraProgresso(progresso(t, filhas)) +
      '<div class="sub">' + esc([pai ? 'parte de: ' + pai : '', onde, t.etiquetas].filter(Boolean).join(' · ')) + '</div></td>' +
      '<td>' + pillPessoa(t.responsavel) + '</td><td><span class="pill ' + pr[1] + '">' + esc(pr[0]) + '</span></td><td>' + esc(STATUS_TAREFA[t.status] || t.status) + '</td>' +
      '<td class="acoes-l">' + (tarefaFechada(t) ? '' : '<button class="btn btn-v btn-mini" data-concluir="' + t.id + '">✓ Concluir</button> ') +
      '<button class="btn btn-o btn-mini" data-editar-t="' + t.id + '">Editar</button></td></tr>' +
      filhas.filter((f) => ids.has(f.id)).map((f) => linha(f, nivel + 1)).join('');
  };
  alvo.innerHTML = '<div class="card">' + (raizes.length ? '<div class="tabela-wrap"><table><thead><tr><th>Prazo</th><th>Tarefa</th><th>Pessoa</th><th>Prioridade</th><th>Status</th><th></th></tr></thead><tbody>' +
    raizes.map((t) => linha(t, 0)).join('') + '</tbody></table></div>' : vazio('Nenhuma tarefa com esses filtros.', '+ Nova tarefa', '#tf-nova')) + '</div>';
  ligarLinhasTarefa(alvo);
}

// ── Quadro (kanban): arraste o cartão para mudar o status ──
function vistaKanban(alvo) {
  const lista = filtrarTarefas().filter((t) => t.status !== 'cancelada');
  alvo.innerHTML = '<div class="kanban">' + COLUNAS_KANBAN.map((s) => {
    const cs = lista.filter((t) => t.status === s);
    return '<div class="kb-col" data-status="' + s + '"><div class="kb-tit">' + STATUS_TAREFA[s] + ' <span class="sub">' + cs.length + '</span></div>' +
      cs.map((t) => '<div class="kb-card" draggable="true" data-id="' + t.id + '">' + bolinha(t) + ' <b>' + esc(t.titulo) + '</b>' +
        '<div class="sub">' + esc(nomeCliente(t.cliente_id) || nomeGrupo(t.grupo_id) || '') + '</div>' +
        '<div class="kb-rod">' + pillPessoa(t.responsavel) + (t.prazo ? ' <span class="sub mono">' + dataBR(t.prazo) + '</span>' : '') + seloPrazo(t) + seloFatal(t) + '</div>' +
        barraProgresso(progresso(t, (E._tarefas || []).filter((x) => x.tarefa_pai_id === t.id))) + '</div>').join('') +
      '</div>';
  }).join('') + '</div><p class="sub" style="margin-top:8px">Arraste um cartão para outra coluna para mudar o status. Clique para abrir.</p>';
  let arrastando = null;
  alvo.querySelectorAll('.kb-card').forEach((c) => {
    c.addEventListener('dragstart', (ev) => { arrastando = c.dataset.id; ev.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('arrastando'); });
    c.addEventListener('dragend', () => c.classList.remove('arrastando'));
    c.onclick = () => formTarefa(E._tarefas.find((t) => t.id === c.dataset.id), recarregarTarefas);
  });
  alvo.querySelectorAll('.kb-col').forEach((col) => {
    col.addEventListener('dragover', (ev) => { ev.preventDefault(); col.classList.add('sobre'); });
    col.addEventListener('dragleave', () => col.classList.remove('sobre'));
    col.addEventListener('drop', (ev) => {
      ev.preventDefault(); col.classList.remove('sobre');
      const id = ev.dataTransfer.getData('text/plain') || arrastando, t = E._tarefas.find((x) => x.id === id);
      if (!t || t.status === col.dataset.status) return;
      comBotao(null, async () => {
        await validarDependencia(t, col.dataset.status);
        await q(sb.from('tarefas').update({ status: col.dataset.status }).eq('id', id));
        aviso('✓ Tarefa movida para ' + STATUS_TAREFA[col.dataset.status] + '.'); await recarregarTarefas();
      });
    });
  });
}

// ── Calendário do mês (prazo interno e ⚑ prazo fatal) ──
async function vistaCalendario(alvo) {
  const F = E.tf, fer = await feriados();
  const [a, m] = F.mes.split('-').map(Number), ini = new Date(a, m - 1, 1), dias = new Date(a, m, 0).getDate();
  const lista = filtrarTarefas(), h = hojeISO();
  let html = '<div class="card"><div class="card-hd"><button class="btn btn-o btn-mini" id="cal-ant">‹</button><span>' +
    ini.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) + '</span><button class="btn btn-o btn-mini" id="cal-prox">›</button></div>' +
    '<div class="calendario">' + ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => '<div class="cal-sem">' + d + '</div>').join('') +
    '<div class="cal-dia vazio-dia"></div>'.repeat(ini.getDay());
  for (let d = 1; d <= dias; d++) {
    const iso_ = F.mes + '-' + String(d).padStart(2, '0');
    const doDia = lista.filter((t) => t.prazo === iso_ || t.prazo_fatal === iso_);
    html += '<div class="cal-dia' + (iso_ === h ? ' cal-hoje' : '') + (!diaUtil(iso_, fer) ? ' cal-folga' : '') + '"><div class="cal-num">' + d + '</div>' +
      doDia.slice(0, 4).map((t) => '<button class="cal-tf' + (t.prazo_fatal === iso_ ? ' fatal' : '') + (tarefaFechada(t) ? ' feita' : t.prazo && t.prazo < h ? ' atrasada' : '') +
        '" data-editar-t="' + t.id + '" title="' + esc(t.titulo) + '">' + (t.prazo_fatal === iso_ ? '⚑ ' : '') + esc(t.titulo) + '</button>').join('') +
      (doDia.length > 4 ? '<div class="sub">+ ' + (doDia.length - 4) + '</div>' : '') + '</div>';
  }
  alvo.innerHTML = html + '</div></div>';
  const mudar = (n) => { const d = new Date(a, m - 1 + n, 1); F.mes = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); pintarTarefas(); };
  $('cal-ant').onclick = () => mudar(-1); $('cal-prox').onclick = () => mudar(1);
  ligarLinhasTarefa(alvo);
}

// ── Fluxos: andamento e linha do tempo (Gantt simples) ──
function vistaFluxos(alvo) {
  const fl = E._fluxos || [], h = hojeISO();
  if (!fl.length) { alvo.innerHTML = '<div class="card">' + vazio('Nenhum fluxo ainda — um fluxo cria várias tarefas de uma vez a partir de um modelo (ex.: Defesa em execução fiscal).', '+ Novo fluxo', '#tf-fluxo') + '</div>'; return; }
  alvo.innerHTML = fl.map((f) => {
    const ts = (E._tarefas || []).filter((t) => t.fluxo_id === f.id).sort((x, y) => String(x.prazo).localeCompare(String(y.prazo)));
    const feitas = ts.filter(tarefaFechada).length;
    const datas = ts.flatMap((t) => [t.inicio, t.prazo]).concat([f.inicio, f.prazo_fatal, h]).filter(Boolean).sort();
    const d0 = datas[0], d1 = datas[datas.length - 1], span = Math.max(1, diasEntre(d0, d1));
    const pos = (d) => Math.max(0, Math.min(100, diasEntre(d0, d) / span * 100));
    return '<div class="card"><div class="card-hd"><span>' + esc(f.nome) + ' <span class="sub">' + esc(nomeCliente(f.cliente_id) || nomeGrupo(f.grupo_id) || '') + '</span></span>' +
      '<span>' + (f.prazo_fatal ? '<span class="pill ' + (f.status === 'ativo' && f.prazo_fatal < h ? 'vencido' : 'cobranca') + '">⚑ ' + dataBR(f.prazo_fatal) + '</span> ' : '') +
      '<span class="pill ' + (f.status === 'concluido' ? 'pago' : f.status === 'cancelado' ? 'neutro' : 'aberto') + '">' + esc(f.status) + '</span> ' +
      '<button class="btn btn-o btn-mini" data-fluxo-st="' + f.id + '">' + (f.status === 'ativo' ? 'Encerrar' : 'Reabrir') + '</button></span></div>' +
      '<div class="card-bd"><div class="sub" style="margin-bottom:8px">' + feitas + ' de ' + ts.length + ' tarefa(s) concluída(s) ' + barraProgresso(ts.length ? { tot: ts.length, feitos: feitas, pct: Math.round(feitas / ts.length * 100) } : null) + '</div>' +
      '<div class="gantt">' + ts.map((t) => {
        const i = t.inicio || t.prazo || h, fim = t.prazo || i;
        return '<div class="gantt-lin"><button class="gantt-rot" data-editar-t="' + t.id + '">' + (t.tarefa_pai_id ? '↳ ' : '') + esc(t.titulo) + '</button><div class="gantt-trilho">' +
          '<div class="gantt-barra' + (tarefaFechada(t) ? ' feita' : fim < h ? ' atrasada' : '') + '" style="left:' + pos(i) + '%;width:' + Math.max(1.5, pos(fim) - pos(i)) + '%" title="' + dataBR(i) + ' → ' + dataBR(fim) + '"></div></div>' +
          '<span class="sub mono">' + dataBR(fim) + '</span></div>';
      }).join('') + '</div></div></div>';
  }).join('');
  ligarLinhasTarefa(alvo);
  alvo.querySelectorAll('[data-fluxo-st]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const f = fl.find((x) => x.id === b.dataset.fluxoSt);
    await q(sb.from('fluxos').update({ status: f.status === 'ativo' ? 'concluido' : 'ativo' }).eq('id', f.id));
    aviso('✓ Fluxo atualizado.'); await recarregarTarefas();
  }));
}
async function horasGastasPorPessoa(alvo) {
  const ini = hojeISO().slice(0, 8) + '01';
  const [tempos, eq] = await Promise.all([q(sb.from('tarefa_tempos').select('usuario, inicio, fim').gte('inicio', ini)), equipe()]);
  const por = {};
  tempos.forEach((x) => { const u = eq.find((e) => e.id === x.usuario); const n = u ? primeiroNome(u.nome) : '?';
    por[n] = (por[n] || 0) + ((x.fim ? new Date(x.fim) : new Date()) - new Date(x.inicio)) / 3600000; });
  alvo.querySelectorAll('[data-gasto]').forEach((td) => { const v = por[primeiroNome(td.dataset.gasto)]; if (v) td.textContent = String(Math.round(v * 10) / 10).replace('.', ',') + ' h'; });
}
function diasEntre(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }

// ── Relatório: por pessoa, prazos fatais, exportação ──
function vistaRelatorio(alvo) {
  const ts = E._tarefas || [], h = hojeISO(), mes = h.slice(0, 7);
  const pessoas = [...new Set(Object.keys(PESSOA).concat(ts.map((t) => t.responsavel).filter(Boolean)))];
  const linhas = pessoas.map((p) => {
    const d = ts.filter((t) => t.responsavel === p), ab = d.filter((t) => !tarefaFechada(t));
    const concl = d.filter((t) => t.status === 'concluida' && String(t.concluida_em || '').slice(0, 7) === mes);
    const noPrazo = concl.filter((t) => !t.prazo || String(t.concluida_em).slice(0, 10) <= t.prazo).length;
    return { p, abertas: ab.length, atrasadas: ab.filter((t) => t.prazo && t.prazo < h).length, concl: concl.length,
      noPrazo: concl.length ? Math.round(noPrazo / concl.length * 100) : null, horas: soma(ab, (t) => t.estimativa_horas) };
  }).filter((l) => l.abertas || l.concl);
  const concl = ts.filter((t) => t.status === 'concluida' && t.concluida_em);
  const medio = concl.length ? soma(concl, (t) => (new Date(t.concluida_em) - new Date(t.criado_em)) / 86400000) / concl.length : null;
  const fatConcl = concl.filter((t) => t.prazo_fatal), fatOk = fatConcl.filter((t) => String(t.concluida_em).slice(0, 10) <= t.prazo_fatal).length;
  const fatais = ts.filter((t) => !tarefaFechada(t) && t.prazo_fatal && t.prazo_fatal <= somarDias(h, 30)).sort((a, b) => a.prazo_fatal.localeCompare(b.prazo_fatal));
  alvo.innerHTML = '<div class="kpis">' + kpi('Tempo médio de conclusão', medio == null ? '—' : String(Math.round(medio * 10) / 10).replace('.', ',') + ' dia(s)', '', concl.length + ' concluída(s)') +
    kpi('Prazos fatais cumpridos', fatConcl.length ? Math.round(fatOk / fatConcl.length * 100) + '%' : '—', fatConcl.length && fatOk < fatConcl.length ? 'vermelho' : 'verde', fatOk + ' de ' + fatConcl.length + ' · meta 100%') + '</div>' +
    '<div class="card"><div class="card-hd">Por pessoa <button class="btn btn-o btn-mini" id="tf-csv">Baixar planilha (CSV)</button></div>' +
    '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Pessoa</th><th data-tipo="num">Abertas</th><th data-tipo="num">Atrasadas</th><th data-tipo="num">Concluídas no mês</th><th data-tipo="num">% no prazo</th><th data-tipo="num">Horas estimadas (abertas)</th><th data-tipo="num">Horas gastas no mês</th></tr></thead><tbody>' +
    (linhas.map((l) => '<tr><td>' + pillPessoa(l.p) + '</td><td class="mono">' + l.abertas + '</td><td class="mono">' + (l.atrasadas ? '<b style="color:var(--red)">' + l.atrasadas + '</b>' : '0') + '</td>' +
      '<td class="mono">' + l.concl + '</td><td class="mono">' + (l.noPrazo == null ? '—' : l.noPrazo + '%') + '</td><td class="mono">' + (l.horas ? String(l.horas).replace('.', ',') : '—') + '</td><td class="mono" data-gasto="' + esc(l.p) + '">—</td></tr>').join('') ||
      '<tr><td colspan="7" class="sub">Nenhuma tarefa.</td></tr>') + '</tbody></table></div></div>' +
    '<div class="card"><div class="card-hd">Prazos fatais nos próximos 30 dias (e vencidos)</div>' +
    (fatais.length ? '<div class="tabela-wrap"><table><thead><tr><th>Prazo fatal</th><th>Tarefa</th><th>Cliente / grupo</th><th>Pessoa</th><th>Status</th></tr></thead><tbody>' +
      fatais.map((t) => '<tr class="clicavel" data-editar-t="' + t.id + '"><td class="mono">' + dataBR(t.prazo_fatal) + (t.prazo_fatal < h ? ' <span class="pill vencido">vencido</span>' : '') + '</td><td><b>' + esc(t.titulo) + '</b></td>' +
        '<td>' + esc(nomeCliente(t.cliente_id) || nomeGrupo(t.grupo_id) || '—') + '</td><td>' + pillPessoa(t.responsavel) + '</td><td>' + esc(STATUS_TAREFA[t.status] || t.status) + '</td></tr>').join('') +
      '</tbody></table></div>' : '<div class="vazio">Nenhum prazo fatal nos próximos 30 dias.</div>') + '</div>';
  ligarLinhasTarefa(alvo);
  horasGastasPorPessoa(alvo).catch(() => {});
  $('tf-csv').onclick = () => {
    const cab = ['Tarefa', 'Status', 'Pessoa', 'Prazo', 'Prazo fatal', 'Cliente', 'Grupo', 'Prioridade', 'Etiquetas', 'Concluída em'];
    const lin = filtrarTarefas().map((t) => [t.titulo, STATUS_TAREFA[t.status] || t.status, t.responsavel, dataBR(t.prazo), t.prazo_fatal ? dataBR(t.prazo_fatal) : '',
      nomeCliente(t.cliente_id), nomeGrupo(t.grupo_id), (PRIORIDADE[t.prioridade] || [t.prioridade])[0], t.etiquetas, t.concluida_em ? dataBR(t.concluida_em) : '']);
    const csv = [cab].concat(lin).map((l) => l.map((c) => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    baixarArquivo('tarefas-' + hojeISO() + '.csv', '﻿' + csv, 'text/csv;charset=utf-8');
  };
}

// ─────────────────────────── formulário ───────────────────────────
function selectPares(nome, pares, v) {
  return '<select name="' + nome + '">' + pares.map(([val, rot]) => '<option value="' + val + '"' + (val === v ? ' selected' : '') + '>' + esc(rot) + '</option>').join('') + '</select>';
}
async function validarDependencia(t, novoStatus) {
  if (!t.depende_de || !['andamento', 'concluida'].includes(novoStatus)) return;
  const dep = await q(sb.from('tarefas').select('titulo, status').eq('id', t.depende_de).maybeSingle());
  if (dep && !tarefaFechada(dep)) throw new Error('Esta tarefa depende de "' + dep.titulo + '", que ainda não foi concluída.');
}
function formTarefa(t, depois) {
  t = t || {};
  const novo = !t.id;
  let checklist = Array.isArray(t.checklist) ? t.checklist.map((c) => ({ texto: c.texto, feito: !!c.feito })) : [];
  const outras = (E._tarefas || []).filter((x) => x.id !== t.id && !tarefaFechada(x));
  const j = abrirJanela({ titulo: novo ? (t.tarefa_pai_id ? 'Nova subtarefa' : 'Nova tarefa') : 'Tarefa', larga: true,
    corpo: '<form id="f-tf" class="grade">' +
      campo('Tarefa <span class="obrig">*</span>', '<input name="titulo" maxlength="300" value="' + esc(t.titulo || '') + '">', 'inteiro') +
      campo('Cliente', '<select name="cliente_id">' + opcoesClientes(t.cliente_id || '') + '</select>') +
      campo('Grupo', '<input name="grupo" list="tf-grupos" value="' + esc(nomeGrupo(t.grupo_id)) + '">' + datalistGrupos('tf-grupos')) +
      campo('Pessoa responsável', '<input name="responsavel" list="tf-pessoas" value="' + esc(t.responsavel || '') + '">' + datalistPessoas('tf-pessoas')) +
      campo('Participantes (separe por vírgula)', '<input name="participantes" value="' + esc(t.participantes || '') + '" placeholder="Ex.: Emanuelle, Adriana">') +
      campo('Prazo interno', '<input name="prazo" type="date" value="' + esc(t.prazo || '') + '">') +
      campo('Prazo fatal (legal / judicial)', '<input name="prazo_fatal" type="date" value="' + esc(t.prazo_fatal || '') + '">') +
      campo('Início', '<input name="inicio" type="date" value="' + esc(t.inicio || (novo ? hojeISO() : '')) + '">') +
      campo('Prioridade', selectPares('prioridade', [['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']], t.prioridade || 'media')) +
      campo('Status', selectPares('status', Object.entries(STATUS_TAREFA), t.status || 'pendente')) +
      campo('Repetir', selectPares('recorrencia', [['', 'Não repete'], ['semanal', 'Toda semana'], ['mensal', 'Todo mês'], ['anual', 'Todo ano']], t.recorrencia || '')) +
      campo('Estimativa (horas)', '<input name="estimativa_horas" inputmode="decimal" value="' + (t.estimativa_horas != null ? esc(String(t.estimativa_horas).replace('.', ',')) : '') + '">') +
      campo('Etiquetas', '<input name="etiquetas" value="' + esc(t.etiquetas || '') + '" placeholder="Ex.: urgente, PGFN">') +
      '<label class="check"><input type="checkbox" name="exige_anexo"' + (t.exige_anexo ? ' checked' : '') + '> Exige documento anexado para concluir (ex.: protocolo)</label>' +
      '<label class="check"><input type="checkbox" name="exige_revisao"' + (t.exige_revisao ? ' checked' : '') + '> Exige revisão antes de concluir</label>' +
      campo('Revisor', '<input name="revisor" list="tf-pessoas-rev" value="' + esc(t.revisor || '') + '" placeholder="quem revisa">' + datalistPessoas('tf-pessoas-rev')) +
      '<div id="tf-carga" class="sub" style="align-self:end"></div>' +
      campo('Só começa depois de', '<select name="depende_de"><option value="">— nenhuma —</option>' + outras.map((x) => '<option value="' + x.id + '"' + (x.id === t.depende_de ? ' selected' : '') + '>' + esc(x.titulo) + '</option>').join('') + '</select>', 'inteiro') +
      campo('Processos vinculados', '<input name="processos_vinculados" value="' + esc(t.processos_vinculados || '') + '">', 'inteiro') +
      campo('Descrição', '<textarea name="descricao" maxlength="4000">' + esc(t.descricao || '') + '</textarea>', 'inteiro') +
      campo('Observação', '<textarea name="obs" maxlength="2000">' + esc(t.obs || '') + '</textarea>', 'inteiro') +
      '<div class="inteiro secao">Checklist</div><div class="inteiro" id="tf-check"></div>' +
      '<div class="inteiro filtros" style="margin:0"><input class="busca" id="tf-check-novo" placeholder="Novo item do checklist e Enter"><button class="btn btn-o btn-mini" type="button" id="tf-check-add">+ Item</button></div>' +
      (novo ? '' : '<div class="inteiro secao">Subtarefas</div><div class="inteiro" id="tf-subs"></div>' +
        '<div class="inteiro secao">Horas gastas</div><div class="inteiro" id="tf-tempo"></div>' +
        '<div class="inteiro secao">Documentos</div><div class="inteiro" id="tf-docs"></div>' +
        '<div class="inteiro secao">Comentários <span class="sub">— escreva @Nome para avisar alguém</span></div><div class="inteiro" id="tf-coment"></div>') +
      '</form>',
    rodape: (novo ? '<span></span>' : '<button class="btn btn-x" type="button" id="btn-excluir-tf">Excluir</button>') +
      '<div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-salvar-tf">Salvar</button></div>' });
  const f = j.querySelector('#f-tf');
  const pintarCheck = () => {
    j.querySelector('#tf-check').innerHTML = checklist.length ? checklist.map((c, i) => '<div class="ck-item"><label class="check"><input type="checkbox" data-ck="' + i + '"' + (c.feito ? ' checked' : '') + '> <span' + (c.feito ? ' class="riscado"' : '') + '>' + esc(c.texto) + '</span></label>' +
      '<button type="button" class="btn-etq" data-ck-x="' + i + '" title="Remover">×</button></div>').join('') : '<div class="sub">Sem itens. A tarefa só pode ser concluída com todos os itens marcados.</div>';
    j.querySelectorAll('[data-ck]').forEach((c) => c.onchange = () => { checklist[+c.dataset.ck].feito = c.checked; pintarCheck(); });
    j.querySelectorAll('[data-ck-x]').forEach((b) => b.onclick = () => { checklist.splice(+b.dataset.ckX, 1); pintarCheck(); });
  };
  const addCheck = () => { const i = j.querySelector('#tf-check-novo'); if (i.value.trim()) { checklist.push({ texto: i.value.trim(), feito: false }); i.value = ''; pintarCheck(); } };
  j.querySelector('#tf-check-add').onclick = addCheck;
  j.querySelector('#tf-check-novo').onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addCheck(); } };
  pintarCheck();
  // carga da semana da pessoa responsável (aviso acima de 40 h)
  const mostrarCarga = async () => {
    const quem = f.responsavel.value.trim(), el = j.querySelector('#tf-carga');
    if (!quem) { el.textContent = ''; return; }
    const fimSemana = somarDias(hojeISO(), 7 - new Date().getDay());
    const abertas = await q(sb.from('tarefas').select('id, estimativa_horas, prazo').eq('responsavel', quem).not('status', 'in', '(concluida,cancelada)').lte('prazo', fimSemana)).catch(() => []);
    const horas = soma(abertas.filter((x) => x.id !== t.id), (x) => x.estimativa_horas) + (lerValor(f.estimativa_horas.value) || 0);
    el.innerHTML = 'Carga de ' + esc(quem) + ' até domingo: <b>' + String(Math.round(horas * 10) / 10).replace('.', ',') + ' h</b>' + (horas > 40 ? ' <span class="pill vencido">acima de 40 h</span>' : '');
  };
  f.responsavel.onchange = mostrarCarga; f.estimativa_horas.onchange = mostrarCarga; mostrarCarga();
  if (f.cliente_id) f.cliente_id.onchange = () => { const c = E.clientes.find((x) => x.id === f.cliente_id.value); if (c && c.grupo_id && !f.grupo.value) f.grupo.value = nomeGrupo(c.grupo_id); };
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  f.onsubmit = (ev) => { ev.preventDefault(); j.querySelector('#btn-salvar-tf').click(); };
  const aposSalvar = async () => { await (depois || recarregar)(); };
  j.querySelector('#btn-salvar-tf').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.titulo.value.trim()) throw new Error('Escreva a tarefa.');
    const est = f.estimativa_horas.value.trim() ? lerValor(f.estimativa_horas.value) : null;
    if (Number.isNaN(est)) throw new Error('Estimativa de horas inválida.');
    if (f.prazo.value && f.prazo_fatal.value && f.prazo.value > f.prazo_fatal.value) throw new Error('O prazo interno está depois do prazo fatal.');
    const dados = { titulo: f.titulo.value.trim(), cliente_id: f.cliente_id.value || null, grupo_id: await grupoPorNome(f.grupo.value), responsavel: f.responsavel.value.trim(),
      participantes: f.participantes.value.trim(), prazo: f.prazo.value || null, prazo_fatal: f.prazo_fatal.value || null, inicio: f.inicio.value || null,
      prioridade: f.prioridade.value, status: f.status.value, recorrencia: f.recorrencia.value, estimativa_horas: est, etiquetas: f.etiquetas.value.trim(),
      depende_de: f.depende_de.value || null, exige_anexo: f.exige_anexo.checked, exige_revisao: f.exige_revisao.checked, revisor: f.revisor.value.trim(),
      processos_vinculados: f.processos_vinculados.value.trim(), descricao: f.descricao.value.trim(), obs: f.obs.value.trim(), checklist };
    if (!dados.grupo_id && dados.cliente_id) { const c = E.clientes.find((x) => x.id === dados.cliente_id); if (c) dados.grupo_id = c.grupo_id; }
    ['tarefa_pai_id', 'fluxo_id', 'contrato_id'].forEach((k) => { if (novo && t[k]) dados[k] = t[k]; });
    if (dados.exige_revisao && !dados.revisor) throw new Error('Informe quem revisa (ou desmarque "Exige revisão").');
    if (dados.status !== (t.status || 'pendente')) await validarDependencia(dados, dados.status);
    if (novo) await q(sb.from('tarefas').insert(dados)); else await q(sb.from('tarefas').update(dados).eq('id', t.id));
    if (dados.responsavel && (novo || dados.responsavel !== t.responsavel)) {
      await notificar(dados.responsavel, 'Nova tarefa para você: ' + dados.titulo, dados.prazo ? 'Prazo ' + dataBR(dados.prazo) : '', 'tarefas').catch(() => {});
    }
    let msg = novo ? '✓ Tarefa criada.' : dados.status === 'concluida' && t.status !== 'concluida' ? '✓ Tarefa concluída.' : '✓ Tarefa atualizada.';
    if (!novo && dados.status === 'concluida' && dados.exige_revisao && t.status !== 'revisao') msg = '✓ Tarefa enviada para revisão de ' + dados.revisor + '.';
    aviso(msg);
    fecharJanela(j); await aposSalvar();
  });
  const bx = j.querySelector('#btn-excluir-tf');
  if (bx) bx.onclick = () => comBotao(bx, async () => {
    if (!confirm('Excluir esta tarefa' + ((E._tarefas || []).some((x) => x.tarefa_pai_id === t.id) ? ' e as subtarefas dela' : '') + '?')) return;
    await excluir('tarefas', t.id);
    aviso('Tarefa excluída.'); fecharJanela(j); await aposSalvar();
  });
  if (!novo) {
    pintarSubtarefas(j, t, depois).catch((e) => console.error(e));
    blocoDocumentos(j.querySelector('#tf-docs'), { tarefa_id: t.id, cliente_id: t.cliente_id, grupo_id: t.grupo_id }, { titulo: 'Arquivos da tarefa', vazio: 'Nenhum arquivo.' }).catch((e) => console.error(e));
    pintarComentarios(j, t).catch((e) => console.error(e));
    pintarTempo(j, t).catch((e) => console.error(e));
  }
  return j;
}
async function pintarSubtarefas(j, t, depois) {
  const alvo = j.querySelector('#tf-subs');
  const subs = await q(sb.from('tarefas').select('*').eq('tarefa_pai_id', t.id).order('prazo', { nullsFirst: false }));
  alvo.innerHTML = (subs.length ? subs.map((s) => '<div class="item-ficha' + (tarefaFechada(s) ? ' feita' : '') + '"><div><b>' + esc(s.titulo) + '</b> ' + seloPrazo(s) +
    '<div class="sub">' + (s.prazo ? 'até ' + dataBR(s.prazo) : 'sem prazo') + ' · ' + esc(s.responsavel || '—') + ' · ' + esc(STATUS_TAREFA[s.status]) + '</div></div>' +
    '<span>' + (tarefaFechada(s) ? '' : '<button type="button" class="btn btn-v btn-mini" data-sub-ok="' + s.id + '">✓</button> ') +
    '<button type="button" class="btn btn-o btn-mini" data-sub-ed="' + s.id + '">Abrir</button></span></div>').join('') : '<div class="sub">Nenhuma subtarefa.</div>') +
    '<button type="button" class="btn btn-o btn-mini" id="tf-sub-nova" style="margin-top:6px">+ Subtarefa</button>';
  const repinta = async () => { await pintarSubtarefas(j, t, depois); if (E._tarefas) E._tarefas = await buscarTodos(() => sb.from('tarefas').select('*').order('prazo', { nullsFirst: false })); };
  alvo.querySelector('#tf-sub-nova').onclick = () => formTarefa({ tarefa_pai_id: t.id, fluxo_id: t.fluxo_id, cliente_id: t.cliente_id, grupo_id: t.grupo_id, responsavel: t.responsavel, prazo: t.prazo }, repinta);
  alvo.querySelectorAll('[data-sub-ed]').forEach((b) => b.onclick = () => formTarefa(subs.find((s) => s.id === b.dataset.subEd), repinta));
  alvo.querySelectorAll('[data-sub-ok]').forEach((b) => b.onclick = () => comBotao(b, async () => { await concluirTarefa(b.dataset.subOk); aviso('✓ Subtarefa concluída.'); await repinta(); }));
}
async function pintarComentarios(j, t) {
  const alvo = j.querySelector('#tf-coment');
  const [cs, eq] = await Promise.all([q(sb.from('comentarios').select('*').eq('tarefa_id', t.id).order('criado_em')), equipe()]);
  const quem = (id) => { const u = eq.find((x) => x.id === id); return u ? u.nome || u.email : 'Equipe'; };
  alvo.innerHTML = (cs.length ? cs.map((c) => '<div class="coment"><b>' + esc(quem(c.criado_por)) + '</b> <span class="sub">' + dataBR(c.criado_em) + ' ' + new Date(c.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '</span>' +
    '<div>' + esc(c.texto).replace(/@(\S+)/g, '<b class="mencao">@$1</b>') + '</div></div>').join('') : '<div class="sub">Nenhum comentário.</div>') +
    '<div class="filtros" style="margin:8px 0 0"><input class="busca" id="tf-coment-txt" placeholder="Escreva um comentário (ex.: @Emanuelle revisar a minuta)" style="max-width:none"><button type="button" class="btn btn-o btn-mini" id="tf-coment-env">Comentar</button></div>';
  const enviar = (ev) => comBotao(ev && ev.currentTarget, async () => {
    const txt = alvo.querySelector('#tf-coment-txt').value.trim();
    if (!txt) return;
    await q(sb.from('comentarios').insert({ tarefa_id: t.id, texto: txt }));
    const mencoes = [...new Set((txt.match(/@([^\s,.;:!?]+)/g) || []).map((m) => m.slice(1)))];
    for (const m of mencoes) await notificar(m, (meuNome() || 'Alguém') + ' mencionou você em: ' + t.titulo, txt.slice(0, 200), 'tarefas', 'mencao').catch(() => {});
    await pintarComentarios(j, t);
  });
  alvo.querySelector('#tf-coment-env').onclick = enviar;
  alvo.querySelector('#tf-coment-txt').onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); alvo.querySelector('#tf-coment-env').click(); } };
}

// ▶/■ horas gastas na tarefa
async function pintarTempo(j, t) {
  const alvo = j.querySelector('#tf-tempo'); if (!alvo) return;
  const ts = await q(sb.from('tarefa_tempos').select('*').eq('tarefa_id', t.id).order('inicio')).catch(() => []);
  const eu = E.perfil && E.perfil.id, aberto = ts.find((x) => !x.fim && x.usuario === eu);
  const min = soma(ts, (x) => ((x.fim ? new Date(x.fim) : new Date()) - new Date(x.inicio)) / 60000);
  const hh = (m) => Math.floor(m / 60) + 'h' + String(Math.round(m % 60)).padStart(2, '0');
  alvo.innerHTML = '<div class="filtros" style="margin:0"><button type="button" class="btn ' + (aberto ? 'btn-x' : 'btn-v') + ' btn-mini" id="tf-crono">' + (aberto ? '■ Parar' : '▶ Iniciar') + '</button>' +
    '<span>Total: <b>' + hh(min) + '</b>' + (t.estimativa_horas ? ' de ' + String(t.estimativa_horas).replace('.', ',') + ' h estimadas' : '') + '</span>' +
    (aberto ? ' <span class="pill hoje">contando desde ' + new Date(aberto.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '</span>' : '') + '</div>';
  alvo.querySelector('#tf-crono').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (aberto) await q(sb.from('tarefa_tempos').update({ fim: new Date().toISOString() }).eq('id', aberto.id));
    else await q(sb.from('tarefa_tempos').insert({ tarefa_id: t.id }));
    await pintarTempo(j, t);
  });
}
// Tarefas → Regras automáticas (o admin liga, desliga e ajusta)
async function janelaRegras() {
  const [rs, ult] = await Promise.all([q(sb.from('regras_tarefas').select('*').order('nome')),
    q(sb.from('configuracoes').select('valor').eq('chave', 'regras_tarefas_ultima').maybeSingle()).catch(() => null)]);
  const admin = E.perfil && E.perfil.papel === 'admin';
  const j = abrirJanela({ titulo: 'Regras automáticas de tarefas', larga: true,
    corpo: '<p class="sub" style="margin-bottom:10px">O sistema cria estas tarefas sozinho, sem duplicar. Roda todo dia útil de manhã e ao abrir o sistema.' +
      (ult && ult.valor ? ' Última execução: <b>' + quandoRodou(ult.valor.quando) + '</b> (' + ult.valor.criadas + ' criada[s]).' : '') + '</p>' +
      '<div class="lista-ficha">' + rs.map((r) => '<div class="item-ficha"><div style="flex:1"><label class="check"><input type="checkbox" data-rg-lig="' + r.chave + '"' + (r.ligada ? ' checked' : '') + (admin ? '' : ' disabled') + '> <b>' + esc(r.nome) + '</b></label>' +
        '<div class="sub">' + esc(r.descricao) + '</div></div>' +
        '<label class="rg-num">N = <input type="number" min="0" max="90" data-rg-dias="' + r.chave + '" value="' + r.dias + '"' + (admin ? '' : ' disabled') + '></label>' +
        '<input class="rg-resp" list="rg-pessoas" data-rg-resp="' + r.chave + '" value="' + esc(r.responsavel) + '" placeholder="responsável padrão"' + (admin ? '' : ' disabled') + '></div>').join('') + '</div>' + datalistPessoas('rg-pessoas') +
      (admin ? '' : '<p class="sub" style="margin-top:8px">Só o administrador altera as regras.</p>'),
    rodape: '<button class="btn btn-o" type="button" id="rg-rodar">↻ Rodar agora</button><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Fechar</button>' +
      (admin ? '<button class="btn btn-p" type="button" id="rg-salvar">Salvar</button>' : '') + '</div>' });
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#rg-rodar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const n = await q(sb.rpc('rodar_regras_tarefas'));
    aviso('✓ Regras rodadas: ' + n + ' tarefa(s) ou aviso(s) novo(s).'); fecharJanela(j); if (E.tela === 'tarefas') await TELAS.tarefas();
  });
  const sv = j.querySelector('#rg-salvar');
  if (sv) sv.onclick = (ev) => comBotao(ev.currentTarget, async () => {
    for (const r of rs) {
      await q(sb.from('regras_tarefas').update({ ligada: j.querySelector('[data-rg-lig="' + r.chave + '"]').checked,
        dias: Math.max(0, parseInt(j.querySelector('[data-rg-dias="' + r.chave + '"]').value, 10) || 0),
        responsavel: j.querySelector('[data-rg-resp="' + r.chave + '"]').value.trim() }).eq('chave', r.chave));
    }
    aviso('✓ Regras salvas.'); fecharJanela(j);
  });
}
function quandoRodou(v) { const d = new Date(v); return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }

// ─────────────────────────── fluxos e modelos ───────────────────────────
async function formNovoFluxo(depois) {
  const modelos = await q(sb.from('modelos_fluxo').select('*').order('nome'));
  if (!modelos.length) { aviso('Crie um modelo de fluxo primeiro (botão "Modelos de fluxo").', true); return; }
  const j = abrirJanela({ titulo: 'Novo fluxo de tarefas', larga: true,
    corpo: '<form class="grade" id="f-fl">' +
      campo('Modelo <span class="obrig">*</span>', '<select name="modelo">' + modelos.map((m) => '<option value="' + m.id + '">' + esc(m.nome) + '</option>').join('') + '</select>', 'inteiro') +
      campo('Nome do fluxo', '<input name="nome" placeholder="Ex.: Defesa — Execução 5001234-56">', 'inteiro') +
      campo('Cliente', '<select name="cliente_id">' + opcoesClientes('') + '</select>') +
      campo('Pessoa responsável', '<input name="responsavel" list="fl-pessoas">' + datalistPessoas('fl-pessoas')) +
      campo('Prazo fatal <span class="obrig">*</span>', '<input name="prazo_fatal" type="date">') +
      campo('Processo', '<input name="processo" placeholder="Número do processo (opcional)">') +
      '<div class="inteiro dica">Os prazos de cada etapa são contados em <b>dias úteis antes do prazo fatal</b>, pulando fins de semana e feriados cadastrados.</div>' +
      '<div class="inteiro" id="fl-previa"></div></form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-criar-fl">Criar tarefas</button></div>' });
  const f = j.querySelector('#f-fl'), fer = await feriados();
  const itensDoModelo = () => (modelos.find((m) => m.id === f.modelo.value) || {}).itens || [];
  const previa = () => {
    const fatal = f.prazo_fatal.value, its = itensDoModelo();
    if (!f.nome.value || f.nome.dataset.auto) { f.nome.value = (modelos.find((m) => m.id === f.modelo.value) || {}).nome || ''; f.nome.dataset.auto = '1'; }
    j.querySelector('#fl-previa').innerHTML = '<div class="secao">Etapas</div>' + its.map((it) => '<div class="item-ficha"><div><b>' + esc(it.titulo) + '</b>' +
      (it.subtarefas || []).map((s) => '<div class="sub">↳ ' + esc(s.titulo) + (fatal ? ' — ' + dataBR(subtrairUteis(fatal, Number(s.dias) || 0, fer)) : '') + '</div>').join('') +
      ((it.checklist || []).length ? '<div class="sub">☐ ' + it.checklist.map(esc).join(' · ') + '</div>' : '') + '</div>' +
      '<span class="mono">' + (fatal ? dataBR(subtrairUteis(fatal, Number(it.dias) || 0, fer)) : (it.dias || 0) + ' d.u. antes') + '</span></div>').join('');
  };
  f.nome.oninput = () => { delete f.nome.dataset.auto; };
  f.modelo.onchange = previa; f.prazo_fatal.onchange = previa; previa();
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-criar-fl').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const fatal = f.prazo_fatal.value;
    if (!fatal) throw new Error('Informe o prazo fatal.');
    const cli = E.clientes.find((x) => x.id === f.cliente_id.value), grupo = cli ? cli.grupo_id : null, resp = f.responsavel.value.trim();
    const fl = await q(sb.from('fluxos').insert({ nome: f.nome.value.trim() || 'Fluxo', modelo_id: f.modelo.value, cliente_id: cli ? cli.id : null, grupo_id: grupo,
      responsavel: resp, inicio: hojeISO(), prazo_fatal: fatal }).select().single());
    const base = { fluxo_id: fl.id, cliente_id: cli ? cli.id : null, grupo_id: grupo, responsavel: resp, status: 'pendente', prioridade: 'media', inicio: hojeISO(),
      processos_vinculados: f.processo.value.trim() };
    let n = 0;
    for (const it of itensDoModelo()) {
      const dias = Number(it.dias) || 0, prazo = subtrairUteis(fatal, dias, fer);
      const pai = await q(sb.from('tarefas').insert(Object.assign({}, base, { titulo: it.titulo, prazo, prazo_fatal: dias === 0 ? fatal : null,
        responsavel: it.responsavel || resp, checklist: (it.checklist || []).map((texto) => ({ texto, feito: false })) })).select().single());
      n++;
      for (const s of it.subtarefas || []) {
        await q(sb.from('tarefas').insert(Object.assign({}, base, { titulo: s.titulo, prazo: subtrairUteis(fatal, Number(s.dias) || 0, fer), tarefa_pai_id: pai.id,
          responsavel: s.responsavel || it.responsavel || resp, checklist: (s.checklist || []).map((texto) => ({ texto, feito: false })) })));
        n++;
      }
    }
    if (resp) await notificar(resp, 'Novo fluxo para você: ' + fl.nome, n + ' tarefa(s) · prazo fatal ' + dataBR(fatal), 'tarefas').catch(() => {});
    aviso('✓ Fluxo criado com ' + n + ' tarefa(s).'); fecharJanela(j); await depois();
  });
}
// Modelo em texto: "Título ; dias" (etapa), recuado = subtarefa, "- item" = checklist da linha acima
function modeloParaTexto(itens) {
  const l = [];
  (itens || []).forEach((it) => {
    l.push(it.titulo + ' ; ' + (it.dias || 0));
    (it.checklist || []).forEach((c) => l.push('- ' + c));
    (it.subtarefas || []).forEach((s) => { l.push('    ' + s.titulo + ' ; ' + (s.dias || 0)); (s.checklist || []).forEach((c) => l.push('    - ' + c)); });
  });
  return l.join('\n');
}
function textoParaModelo(txt) {
  const itens = [];
  let ultimo = null;
  String(txt || '').split('\n').forEach((bruta) => {
    if (!bruta.trim()) return;
    const recuo = /^\s{2,}|^\t/.test(bruta), s = bruta.trim();
    if (s.startsWith('-')) { if (ultimo) (ultimo.checklist = ultimo.checklist || []).push(s.replace(/^-\s*/, '')); return; }
    const [tit, d] = s.split(';');
    const it = { titulo: tit.trim(), dias: Math.max(0, parseInt(d, 10) || 0) };
    if (recuo && itens.length) { const p = itens[itens.length - 1]; (p.subtarefas = p.subtarefas || []).push(it); }
    else itens.push(it);
    ultimo = it;
  });
  return itens;
}
async function janelaModelos() {
  const ms = await q(sb.from('modelos_fluxo').select('*').order('nome'));
  const j = abrirJanela({ titulo: 'Modelos de fluxo', larga: true,
    corpo: '<div class="lista-ficha">' + (ms.map((m) => '<div class="item-ficha"><div><b>' + esc(m.nome) + '</b><div class="sub">' + esc(m.descricao || '') + ' · ' + (m.itens || []).length + ' etapa(s)</div></div>' +
      '<button class="btn btn-o btn-mini" data-mod="' + m.id + '">Editar</button></div>').join('') || '<div class="vazio">Nenhum modelo.</div>') + '</div>',
    rodape: '<span></span><button class="btn btn-p" type="button" id="btn-novo-mod">+ Novo modelo</button>' });
  const editar = (m) => {
    m = m || {};
    const k = abrirJanela({ titulo: m.id ? 'Editar modelo' : 'Novo modelo', larga: true,
      corpo: '<form class="grade" id="f-mod">' + campo('Nome <span class="obrig">*</span>', '<input name="nome" value="' + esc(m.nome || '') + '">', 'inteiro') +
        campo('Descrição', '<input name="descricao" value="' + esc(m.descricao || '') + '">', 'inteiro') +
        campo('Etapas', '<textarea name="itens" rows="12" style="font-family:var(--font-m);font-size:12.5px" placeholder="Analisar processo ; 10\n- Baixar autos\n    Pesquisa de jurisprudência ; 5\nProtocolo ; 0">' + esc(modeloParaTexto(m.itens)) + '</textarea>', 'inteiro') +
        '<div class="inteiro dica">Uma etapa por linha: <b>Título ; dias úteis antes do prazo fatal</b>. Linha com recuo (4 espaços) = subtarefa da etapa de cima. Linha começando com <b>-</b> = item de checklist.</div></form>',
      rodape: (m.id ? '<button class="btn btn-x" type="button" id="btn-exc-mod">Excluir</button>' : '<span></span>') +
        '<div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-salvar-mod">Salvar</button></div>' });
    const f = k.querySelector('#f-mod');
    k.querySelector('[data-cancelar]').onclick = () => fecharJanela(k);
    k.querySelector('#btn-salvar-mod').onclick = (ev) => comBotao(ev.currentTarget, async () => {
      if (!f.nome.value.trim()) throw new Error('Dê um nome ao modelo.');
      const itens = textoParaModelo(f.itens.value);
      if (!itens.length) throw new Error('Escreva pelo menos uma etapa.');
      const d = { nome: f.nome.value.trim(), descricao: f.descricao.value.trim(), itens };
      if (m.id) await q(sb.from('modelos_fluxo').update(d).eq('id', m.id)); else await q(sb.from('modelos_fluxo').insert(d));
      aviso('✓ Modelo salvo.'); fecharJanela(k); fecharJanela(j); janelaModelos();
    });
    const bx = k.querySelector('#btn-exc-mod');
    if (bx) bx.onclick = () => comBotao(bx, async () => {
      if (!confirm('Excluir este modelo? Os fluxos já criados continuam.')) return;
      await excluir('modelos_fluxo', m.id); aviso('Modelo excluído.'); fecharJanela(k); fecharJanela(j); janelaModelos();
    });
  };
  j.querySelector('#btn-novo-mod').onclick = () => editar();
  j.querySelectorAll('[data-mod]').forEach((b) => b.onclick = () => editar(ms.find((m) => m.id === b.dataset.mod)));
}
async function janelaFeriados() {
  const fs = await q(sb.from('feriados').select('*').gte('data', somarDias(hojeISO(), -30)).order('data'));
  const j = abrirJanela({ titulo: 'Feriados (contagem de dias úteis)', larga: true,
    corpo: '<div class="tabela-wrap" style="max-height:340px;overflow:auto"><table><thead><tr><th>Data</th><th>Feriado</th><th>Abrangência</th><th></th></tr></thead><tbody>' +
      fs.map((x) => '<tr><td class="mono">' + dataBR(x.data) + '</td><td>' + esc(x.nome) + '</td><td>' + esc(x.abrangencia) + (x.local ? ' · ' + esc(x.local) : '') + '</td>' +
        '<td><button class="btn btn-x btn-mini" data-fer="' + x.data + '|' + esc(x.abrangencia) + '|' + esc(x.local) + '">Excluir</button></td></tr>').join('') + '</tbody></table></div>' +
      '<form class="grade" id="f-fer" style="margin-top:12px">' + campo('Data', '<input type="date" name="data">') + campo('Nome', '<input name="nome" placeholder="Ex.: Recesso forense">') +
      campo('Abrangência', selectPares('abrangencia', [['nacional', 'Nacional'], ['estadual', 'Estadual'], ['municipal', 'Municipal'], ['tribunal', 'Tribunal / suspensão de prazos']], 'municipal')) +
      campo('Local', '<input name="local" placeholder="Ex.: MG, Belo Horizonte, TJMG">') + '</form>',
    rodape: '<span class="sub">Só o administrador exclui feriados.</span><button class="btn btn-p" type="button" id="btn-add-fer">+ Incluir feriado</button>' });
  const f = j.querySelector('#f-fer');
  j.querySelector('#btn-add-fer').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.data.value) throw new Error('Informe a data.');
    await q(sb.from('feriados').insert({ data: f.data.value, nome: f.nome.value.trim(), abrangencia: f.abrangencia.value, local: f.local.value.trim() }));
    E._feriados = null; aviso('✓ Feriado incluído.'); fecharJanela(j); janelaFeriados();
  });
  j.querySelectorAll('[data-fer]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const [data, abr, local] = b.dataset.fer.split('|');
    const r = await q(sb.from('feriados').delete().eq('data', data).eq('abrangencia', abr).eq('local', local).select());
    if (!r.length) throw new Error('Só o administrador pode excluir este registro.');
    E._feriados = null; aviso('Feriado excluído.'); fecharJanela(j); janelaFeriados();
  }));
}

// ─────────────────────────── alertas (sino) ───────────────────────────
// Junta as notificações gravadas (tarefa atribuída, menção) com os alertas
// calculados na hora: prazos D-5, D-2, D-1, hoje e atrasados; documentos e
// certidões vencendo; e, para o administrador, tarefas atrasadas há mais de 3 dias.
async function coletarAlertas() {
  const h = hojeISO(), lim = somarDias(h, 5), admin = E.perfil && E.perfil.papel === 'admin';
  const [nots, ts, docs, certs] = await Promise.all([
    q(sb.from('notificacoes').select('*').eq('lida', false).order('criado_em', { ascending: false }).limit(50)).catch(() => []),
    q(sb.from('tarefas').select('id, titulo, prazo, prazo_fatal, responsavel, participantes, status').not('status', 'in', '(concluida,cancelada)').or('prazo.lte.' + lim + ',prazo_fatal.lte.' + lim)).catch(() => []),
    q(sb.from('documentos').select('id, nome, validade, cliente_id').eq('arquivado', false).not('validade', 'is', null).lte('validade', somarDias(h, 15))).catch(() => []),
    q(sb.from('certidoes').select('id, orgao, validade, cliente_id').not('validade', 'is', null).lte('validade', somarDias(h, 15))).catch(() => [])
  ]);
  const al = nots.map((n) => ({ nivel: 'info', titulo: n.titulo, detalhe: n.detalhe, notif: n.id, link: n.link }));
  ts.forEach((t) => {
    const minha = ehMinha(t);
    const ref = t.prazo_fatal && (!t.prazo || t.prazo_fatal <= t.prazo) ? t.prazo_fatal : t.prazo, fatal = ref === t.prazo_fatal;
    if (!ref) return;
    const d = diasAte(ref);
    if (minha && [5, 2, 1, 0].includes(d)) al.push({ nivel: d <= 1 ? 'alto' : 'medio', titulo: (fatal ? '⚑ Prazo fatal ' : 'Prazo ') + (d === 0 ? 'HOJE' : 'em ' + d + ' dia(s)') + ': ' + t.titulo, detalhe: dataBR(ref), tarefa: t.id });
    else if (minha && d < 0) al.push({ nivel: 'alto', titulo: 'Atrasada há ' + (-d) + ' dia(s): ' + t.titulo, detalhe: (fatal ? 'prazo fatal ' : 'prazo ') + dataBR(ref), tarefa: t.id });
    else if (admin && !minha && d < -3) al.push({ nivel: 'medio', titulo: 'Equipe: ' + t.titulo + ' atrasada há ' + (-d) + ' dias', detalhe: t.responsavel || 'sem responsável', tarefa: t.id });
  });
  docs.forEach((x) => al.push({ nivel: x.validade < h ? 'alto' : 'medio', titulo: 'Documento ' + (x.validade < h ? 'vencido' : 'vencendo') + ': ' + x.nome, detalhe: dataBR(x.validade) + ' · ' + nomeCliente(x.cliente_id), cliente: x.cliente_id }));
  certs.forEach((x) => al.push({ nivel: x.validade < h ? 'alto' : 'medio', titulo: 'Certidão ' + x.orgao + ' ' + (x.validade < h ? 'vencida' : 'vencendo'), detalhe: dataBR(x.validade) + ' · ' + nomeCliente(x.cliente_id), cliente: x.cliente_id }));
  const ordem = { alto: 0, medio: 1, info: 2 };
  return al.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
}
async function abrirAlertas(ancora, aoMudar) {
  if (!E.clientes.length) await carregarCadastros();
  const al = await coletarAlertas();
  const j = abrirJanela({ titulo: 'Avisos', larga: false,
    corpo: al.length ? '<div class="lista-ficha">' + al.map((a, i) => '<div class="item-ficha alerta-' + a.nivel + '"><div><b>' + esc(a.titulo) + '</b><div class="sub">' + esc(a.detalhe || '') + '</div></div>' +
      '<span>' + (a.tarefa || a.cliente ? '<button class="btn btn-o btn-mini" data-al-abrir="' + i + '">Abrir</button> ' : '') +
      (a.notif ? '<button class="btn btn-o btn-mini" data-al-lida="' + i + '">Lida</button>' : '') + '</span></div>').join('') + '</div>' : '<div class="vazio">Nenhum aviso agora. 🎉</div>',
    rodape: al.some((a) => a.notif) ? '<span></span><button class="btn btn-o" type="button" id="al-todas">Marcar todas como lidas</button>' : '' });
  const lida = async (ids) => { if (ids.length) await q(sb.from('notificacoes').update({ lida: true }).in('id', ids)); if (aoMudar) aoMudar(); };
  j.querySelectorAll('[data-al-lida]').forEach((b) => b.onclick = () => comBotao(b, async () => { await lida([al[+b.dataset.alLida].notif]); b.closest('.item-ficha').remove(); }));
  j.querySelectorAll('[data-al-abrir]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const a = al[+b.dataset.alAbrir];
    if (a.tarefa) { const t = await q(sb.from('tarefas').select('*').eq('id', a.tarefa).single()); formTarefa(t, async () => { if (aoMudar) aoMudar(); }); }
    else if (a.cliente) abrirFicha(a.cliente, 'documentos');
  }));
  const todas = j.querySelector('#al-todas');
  if (todas) todas.onclick = () => comBotao(todas, async () => { await lida(al.filter((a) => a.notif).map((a) => a.notif)); fecharJanela(j); });
}
async function contarAlertas() {
  const al = await coletarAlertas();
  return { total: al.length, altos: al.filter((a) => a.nivel === 'alto').length };
}

// Google Agenda: link secreto da pessoa (função erp-agenda) — o Google assina e atualiza sozinho
async function janelaAgenda(novo) {
  const token = await q(sb.rpc('meu_link_agenda', { p_novo: !!novo }));
  const link = String(CFG.url || location.origin).replace(/\/$/, '') + '/functions/v1/erp-agenda?t=' + token;
  const j = abrirJanela({ titulo: '📅 Seus prazos no Google Agenda', larga: true,
    corpo: '<p style="margin-bottom:10px">Este link mostra no seu Google Agenda os <b>prazos fatais</b> e as <b>audiências</b> das tarefas em que você é responsável, com lembrete 1 dia antes. Não tem custo.</p>' +
      campo('Seu link (pessoal — não compartilhe)', '<input id="ag-link" readonly value="' + esc(link) + '" onclick="this.select()">', 'inteiro') +
      '<ol class="passos" style="margin:12px 0 0 18px;line-height:1.7">' +
      '<li>Clique em <b>Copiar link</b>.</li>' +
      '<li>Abra o <b>Google Agenda</b> no computador → à esquerda, em <b>Outras agendas</b>, clique no <b>+</b> → <b>Do URL</b>.</li>' +
      '<li>Cole o link e clique em <b>Adicionar agenda</b>. Pronto: aparece a agenda "ERP · prazos".</li></ol>' +
      '<div class="dica" style="margin-top:10px">O Google atualiza a agenda sozinho, algumas vezes por dia (pode levar até 24 h para uma mudança aparecer). ' +
      'Se o link vazar, clique em <b>Trocar link</b>: o antigo para de funcionar na hora.</div>',
    rodape: '<button class="btn btn-o" type="button" id="ag-trocar">Trocar link</button><div class="acoes"><button class="btn btn-p" type="button" id="ag-copiar">Copiar link</button></div>' });
  j.querySelector('#ag-copiar').onclick = async () => { try { await navigator.clipboard.writeText(link); aviso('Link copiado. Agora cole no Google Agenda → Do URL.'); } catch (e) { j.querySelector('#ag-link').select(); aviso('Selecionei o link: aperte Ctrl+C para copiar.'); } };
  j.querySelector('#ag-trocar').onclick = () => { if (confirm('Trocar o link? O link antigo para de funcionar e você precisará adicionar o novo no Google Agenda.')) { fecharJanela(j); janelaAgenda(true); } };
}

'use strict';
// ═══════════════════════════════════════════════════════════════════
// Documentos — arquivos guardados no Storage privado do Supabase
// (bucket "documentos"). Abrir gera um link temporário (5 minutos).
// Usado na tela Documentos, na ficha do cliente, no contrato e no lançamento.
// ═══════════════════════════════════════════════════════════════════
const TIPOS_DOC = [['contrato', 'Contrato'], ['procuracao', 'Procuração'], ['proposta', 'Proposta'], ['pessoal', 'Documento pessoal'],
  ['societario', 'Societário'], ['certidao', 'Certidão'], ['guia', 'Guia / boleto'], ['comprovante', 'Comprovante de pagamento'],
  ['peticao', 'Petição / peça'], ['outro', 'Outro']];
const nomeTipoDoc = (t) => (TIPOS_DOC.find((x) => x[0] === t) || [t, t])[1];
const LIMITE_MB = 20;
const BUCKET = 'documentos';

function tamanhoLegivel(n) {
  if (!n) return '—';
  if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + ' KB';
  return (n / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' MB';
}
function nomeSeguro(nome) {
  return String(nome || 'arquivo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
}
function selo_validade(v) {
  if (!v) return '';
  const d = Math.round((new Date(v + 'T12:00:00') - new Date(hojeISO() + 'T12:00:00')) / 86400000);
  if (d < 0) return ' <span class="pill vencido">vencido</span>';
  if (d <= 15) return ' <span class="pill hoje">vence em ' + d + ' dia(s)</span>';
  return ' <span class="pill neutro">até ' + dataBR(v) + '</span>';
}

// Envia um arquivo e cria o registro. vinculo: { cliente_id, grupo_id, contrato_id, lancamento_id, processo_id, tarefa_id, tipo }
async function enviarDocumento(arquivo, vinculo, extra) {
  if (arquivo.size > LIMITE_MB * 1024 * 1024) throw new Error('Arquivo maior que ' + LIMITE_MB + ' MB: ' + arquivo.name);
  const pasta = (vinculo.cliente_id || vinculo.grupo_id || 'geral') + '/' + hojeISO().slice(0, 7);
  const caminho = pasta + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + '-' + nomeSeguro(arquivo.name);
  const up = await sb.storage.from(BUCKET).upload(caminho, arquivo, { contentType: arquivo.type || 'application/octet-stream', upsert: false });
  if (up.error) throw new Error('Não consegui enviar o arquivo: ' + (up.error.message || up.error));
  const dados = Object.assign({ tipo: 'outro' }, vinculo, extra || {}, { nome: (extra && extra.nome) || arquivo.name, caminho, tamanho: arquivo.size, mime: arquivo.type || '' });
  Object.keys(dados).forEach((k) => { if (dados[k] === undefined || dados[k] === '') delete dados[k]; });
  dados.nome = dados.nome || arquivo.name;
  return q(sb.from('documentos').insert(dados).select().single());
}

async function abrirDocumento(doc) {
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(doc.caminho, 300);
  if (error || !data) throw new Error('Não consegui abrir o arquivo agora. Tente de novo em instantes.');
  const url = data.signedUrl || data.signedURL;
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  document.body.appendChild(a); a.click(); a.remove();
}

// Janela de envio (arrastar ou escolher), já com o vínculo preenchido
function janelaEnviarDocumento(vinculo, depois, titulo) {
  const j = abrirJanela({
    titulo: titulo || 'Enviar documento', larga: true,
    corpo: '<form id="f-doc" class="grade">' +
      '<div class="inteiro solta-arq" id="doc-solta"><b>Arraste os arquivos aqui</b> ou <label class="btn btn-o btn-mini" style="cursor:pointer">escolha<input type="file" id="doc-arq" multiple hidden></label>' +
      '<div class="sub" id="doc-lista">PDF, imagens, Word ou Excel · até ' + LIMITE_MB + ' MB cada</div></div>' +
      campo('Tipo', '<select name="tipo">' + TIPOS_DOC.map(([v, r]) => '<option value="' + v + '"' + ((vinculo.tipo || 'outro') === v ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>') +
      campo('Validade (se houver)', '<input name="validade" type="date">') +
      (vinculo.cliente_id || vinculo.contrato_id || vinculo.lancamento_id ? '' : campo('Cliente', '<select name="cliente_id">' + opcoesClientes('') + '</select>', 'inteiro')) +
      campo('Etiquetas', '<input name="etiquetas" placeholder="ex.: 2026, original assinado">') +
      campo('Observação', '<textarea name="obs" maxlength="1000"></textarea>', 'inteiro') + '</form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-enviar-doc">Enviar</button></div>'
  });
  let arquivos = [];
  const f = j.querySelector('#f-doc'), lista = j.querySelector('#doc-lista'), solta = j.querySelector('#doc-solta');
  const mostrar = () => { lista.textContent = arquivos.length ? arquivos.map((a) => a.name + ' (' + tamanhoLegivel(a.size) + ')').join(' · ') : 'Nenhum arquivo escolhido'; };
  j.querySelector('#doc-arq').onchange = (ev) => { arquivos = Array.from(ev.target.files); mostrar(); };
  ['dragenter', 'dragover'].forEach((e) => solta.addEventListener(e, (ev) => { ev.preventDefault(); solta.classList.add('sobre'); }));
  ['dragleave', 'drop'].forEach((e) => solta.addEventListener(e, (ev) => { ev.preventDefault(); solta.classList.remove('sobre'); }));
  solta.addEventListener('drop', (ev) => { arquivos = Array.from(ev.dataTransfer.files || []); mostrar(); });
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-enviar-doc').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!arquivos.length) throw new Error('Escolha pelo menos um arquivo.');
    const extra = { tipo: f.tipo.value, validade: f.validade.value || null, etiquetas: f.etiquetas.value.trim(), obs: f.obs.value.trim() };
    const vinc = Object.assign({}, vinculo);
    if (f.cliente_id && f.cliente_id.value) vinc.cliente_id = f.cliente_id.value;
    if (vinc.cliente_id && !vinc.grupo_id) { const c = E.clientes.find((x) => x.id === vinc.cliente_id); if (c) vinc.grupo_id = c.grupo_id; }
    for (const a of arquivos) await enviarDocumento(a, vinc, extra);
    aviso('✓ ' + arquivos.length + ' documento(s) enviado(s).'); fecharJanela(j); if (depois) await depois();
  });
  return j;
}

// Nova versão de um documento: guarda o novo arquivo e arquiva o anterior
function janelaNovaVersao(doc, depois) {
  const j = abrirJanela({ titulo: 'Nova versão — ' + doc.nome,
    corpo: '<p class="sub" style="margin-bottom:10px">A versão atual (v' + doc.versao + ') fica guardada no histórico do documento.</p><input type="file" id="nv-arq">',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-nv">Enviar nova versão</button></div>' });
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-nv').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const a = j.querySelector('#nv-arq').files[0];
    if (!a) throw new Error('Escolha o arquivo.');
    const campos = ['cliente_id', 'grupo_id', 'contrato_id', 'lancamento_id', 'processo_id', 'tarefa_id', 'tipo', 'validade', 'etiquetas', 'obs', 'liberado_cliente'];
    const vinc = {}; campos.forEach((k) => { if (doc[k] != null) vinc[k] = doc[k]; });
    await enviarDocumento(a, vinc, { nome: doc.nome, versao: (doc.versao || 1) + 1, documento_pai_id: doc.documento_pai_id || doc.id });
    await q(sb.from('documentos').update({ arquivado: true }).eq('id', doc.id));
    aviso('✓ Nova versão enviada.'); fecharJanela(j); if (depois) await depois();
  });
}

// Tabela de documentos (usada na tela, na ficha, no contrato e no lançamento)
function tabelaDocumentos(docs, opc) {
  opc = opc || {};
  if (!docs.length) return vazio(opc.vazio || 'Nenhum documento aqui — guarde contratos, procurações e certidões com acesso restrito.', '+ Enviar documento', '[data-enviar-doc], #doc-novo');
  return '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Documento</th><th>Tipo</th>' + (opc.semCliente ? '' : '<th>Cliente</th>') +
    '<th data-tipo="data">Enviado</th><th>Validade</th><th class="sem-ordem"></th></tr></thead><tbody>' +
    docs.map((d) => {
      const cli = d.cliente_id ? (E.clientes.find((c) => c.id === d.cliente_id) || {}).nome : '';
      return '<tr><td><b>' + esc(d.nome) + '</b>' + (d.versao > 1 ? ' <span class="pill neutro">v' + d.versao + '</span>' : '') +
        '<div class="sub">' + tamanhoLegivel(d.tamanho) + (d.etiquetas ? ' · ' + esc(d.etiquetas) : '') + (d.obs ? ' · ' + esc(d.obs) : '') + '</div></td>' +
        '<td>' + esc(nomeTipoDoc(d.tipo)) + '</td>' + (opc.semCliente ? '' : '<td>' + esc(cli || (d.grupo_id ? nomeGrupo(d.grupo_id) : '—')) + '</td>') +
        '<td class="mono" data-ord="' + d.criado_em + '">' + dataBR(d.criado_em) + '</td><td>' + (d.validade ? selo_validade(d.validade) : '<span class="sub">—</span>') + '</td>' +
        '<td class="acoes-l"><button class="btn btn-p btn-mini" data-abrir-doc="' + d.id + '">Abrir</button> ' +
        '<button class="btn btn-o btn-mini" data-versao-doc="' + d.id + '" title="Enviar nova versão">↑ Versão</button> ' +
        '<button class="btn btn-o btn-mini" data-arquivar-doc="' + d.id + '" title="Tirar da lista (continua guardado)">Arquivar</button></td></tr>';
    }).join('') + '</tbody></table></div>';
}
function ligarDocumentos(raiz, docs, depois) {
  raiz.querySelectorAll('[data-abrir-doc]').forEach((b) => b.onclick = () => comBotao(b, () => abrirDocumento(docs.find((d) => d.id === b.dataset.abrirDoc))));
  raiz.querySelectorAll('[data-versao-doc]').forEach((b) => b.onclick = () => janelaNovaVersao(docs.find((d) => d.id === b.dataset.versaoDoc), depois));
  raiz.querySelectorAll('[data-arquivar-doc]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    if (!confirm('Arquivar este documento? Ele sai da lista, mas continua guardado.')) return;
    await q(sb.from('documentos').update({ arquivado: true }).eq('id', b.dataset.arquivarDoc));
    aviso('✓ Documento arquivado.'); if (depois) await depois();
  }));
}
// Bloco pronto: título + botão Enviar + tabela, para um vínculo (cliente, contrato, lançamento…)
async function blocoDocumentos(alvo, vinculo, opc) {
  opc = opc || {};
  let c = sb.from('documentos').select('*').eq('arquivado', false).order('criado_em', { ascending: false });
  // filtra pelo vínculo mais específico (o contrato, o lançamento… ou o cliente)
  const chave = ['oportunidade_id', 'contrato_id', 'lancamento_id', 'tarefa_id', 'processo_id', 'cliente_id', 'grupo_id'].find((k) => vinculo[k]);
  if (!chave) throw new Error('Documento sem vínculo.');
  c = c.eq(chave, vinculo[chave]);
  const docs = await q(c);
  alvo.innerHTML = '<div class="titulo-pag" style="margin-bottom:8px"><div><b>' + (opc.titulo || 'Documentos') + '</b> <span class="sub">' + docs.length + '</span></div>' +
    '<div class="acoes"><button class="btn btn-o btn-mini" data-enviar-doc>+ Enviar documento</button></div></div>' + tabelaDocumentos(docs, { semCliente: !!vinculo.cliente_id, vazio: opc.vazio });
  const repinta = () => blocoDocumentos(alvo, vinculo, opc);
  alvo.querySelector('[data-enviar-doc]').onclick = () => janelaEnviarDocumento(vinculo, repinta);
  ligarDocumentos(alvo, docs, repinta);
  return docs;
}

// ─────────────────────────── tela Documentos ───────────────────────────
TELAS.documentos = async function () {
  E.docs = E.docs || { tipo: '', cliente: '', busca: '', situacao: 'ativos' };
  const F = E.docs;
  await carregarCadastros();
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Documentos</h1><p>Contratos, procurações, certidões, comprovantes e demais arquivos — guardados com acesso restrito</p></div>' +
    '<div class="acoes"><button class="btn btn-p" id="doc-novo">+ Enviar documento</button></div></div>' +
    '<div class="filtros">' +
    '<div class="segmento" id="doc-sit">' + [['ativos', 'Ativos'], ['vencendo', 'Vencendo / vencidos'], ['arquivados', 'Arquivados']].map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<select class="busca sel" id="doc-tipo"><option value="">Todos os tipos</option>' + TIPOS_DOC.map(([v, r]) => '<option value="' + v + '">' + r + '</option>').join('') + '</select>' +
    '<select class="busca sel" id="doc-cli"><option value="">Todos os clientes</option>' + E.clientes.map((c) => '<option value="' + c.id + '">' + esc(c.nome) + '</option>').join('') + '</select>' +
    '<input class="busca" id="doc-busca" placeholder="Buscar nome, etiqueta ou observação" autocomplete="off"></div>' +
    '<div id="doc-corpo"><div class="carregando">Carregando…</div></div>';
  $('doc-tipo').value = F.tipo; $('doc-cli').value = F.cliente; $('doc-busca').value = F.busca;
  $('doc-novo').onclick = () => janelaEnviarDocumento({}, () => TELAS.documentos());
  $('doc-sit').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.situacao = b.dataset.v; pintarDocumentos(); } };
  $('doc-tipo').onchange = (ev) => { F.tipo = ev.target.value; pintarDocumentos(); };
  $('doc-cli').onchange = (ev) => { F.cliente = ev.target.value; pintarDocumentos(); };
  let t; $('doc-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; pintarDocumentos(false); }, 250); };
  await pintarDocumentos();
};
let _docsTela = [];
async function pintarDocumentos(buscar) {
  const F = E.docs;
  document.querySelectorAll('#doc-sit button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === F.situacao));
  if (buscar !== false) _docsTela = await buscarTodos(() => sb.from('documentos').select('*').order('criado_em', { ascending: false }));
  const b = normalizar(F.busca), lim = somarDias(hojeISO(), 15);
  const lista = _docsTela.filter((d) => (F.situacao === 'arquivados' ? d.arquivado : !d.arquivado)
    && (F.situacao !== 'vencendo' || (d.validade && d.validade <= lim))
    && (!F.tipo || d.tipo === F.tipo) && (!F.cliente || d.cliente_id === F.cliente)
    && (!b || normalizar(d.nome + ' ' + d.etiquetas + ' ' + d.obs).includes(b)));
  $('doc-corpo').innerHTML = '<div class="card">' + tabelaDocumentos(lista, { vazio: 'Nenhum documento neste recorte.' }) + '</div>';
  ligarDocumentos($('doc-corpo'), lista, () => pintarDocumentos());
}

'use strict';
// ═══════════════════════════════════════════════════════════════════
// Ficha do cliente (visão 360°): tudo sobre o cliente numa janela só,
// em abas. Clicar no cliente (tela Clientes) abre esta ficha.
// ═══════════════════════════════════════════════════════════════════
const ABAS_FICHA = [['resumo', 'Resumo'], ['contatos', 'Contatos'], ['enderecos', 'Endereços'], ['contas', 'Contas bancárias'],
  ['socios', 'Sócios e vínculos'], ['processos', 'Processos'], ['contratos', 'Contratos'], ['financeiro', 'Financeiro'],
  ['tarefas', 'Tarefas'], ['documentos', 'Documentos'], ['linha', 'Linha do tempo'], ['fiscal', 'Dados fiscais'], ['receita', 'Cartão CNPJ']];

// Sub-cadastros editáveis da ficha (mesmo formulário para todos)
const FINALIDADES = [['geral', 'Geral'], ['financeiro', 'Financeiro'], ['juridico', 'Jurídico'], ['socio', 'Sócio / decisor'], ['contador', 'Contador'],
  ['cobranca', 'Cobrança'], ['marketing', 'Marketing']];
const SUBLISTAS = {
  contatos: { tabela: 'contatos', titulo: 'Contatos', um: 'contato', vazio: 'Nenhum contato. Cadastre aqui financeiro, jurídico, contador, sócios…',
    campos: [['nome', 'Nome', 'texto', 1], ['cargo', 'Cargo / função'], ['finalidade', 'Finalidade', FINALIDADES], ['email', 'E-mail', 'email'],
      ['telefone', 'Telefone'], ['whatsapp', 'Este telefone tem WhatsApp', 'check'], ['recebe_boletos', 'Recebe boletos e cobranças', 'check'],
      ['recebe_notificacoes', 'Recebe avisos do escritório', 'check'], ['preferencia', 'Preferência de contato (ex.: só WhatsApp, após 14h)'], ['obs', 'Observação', 'area']],
    linha: (x) => '<b>' + esc(x.nome || '—') + '</b>' + (x.cargo ? ' · ' + esc(x.cargo) : '') + ' <span class="pill neutro">' + esc(rotuloPar(FINALIDADES, x.finalidade)) + '</span>' +
      (x.recebe_boletos ? ' <span class="pill aberto">boletos</span>' : '') + (x.recebe_notificacoes ? ' <span class="pill aberto">avisos</span>' : '') +
      '<div class="sub">' + [x.email ? '<a href="mailto:' + esc(x.email) + '">' + esc(x.email) + '</a>' : '', x.telefone ? esc(x.telefone) + (x.whatsapp ? ' ' + linkWhats(x.telefone, 'WhatsApp') : '') : '', esc(x.preferencia || '')].filter(Boolean).join(' · ') + '</div>' },
  enderecos: { tabela: 'enderecos', titulo: 'Endereços', um: 'endereço', vazio: 'Nenhum endereço além do cadastro principal.',
    campos: [['tipo', 'Tipo', [['sede', 'Sede'], ['correspondencia', 'Correspondência'], ['cobranca', 'Cobrança'], ['filial', 'Filial'], ['residencial', 'Residencial']]],
      ['cep', 'CEP'], ['logradouro', 'Logradouro', 'texto', 1], ['numero', 'Número'], ['complemento', 'Complemento'], ['bairro', 'Bairro'],
      ['cidade', 'Cidade'], ['uf', 'UF'], ['principal', 'Endereço principal', 'check'], ['obs', 'Observação', 'area']],
    linha: (x) => '<b>' + esc([x.logradouro, x.numero].filter(Boolean).join(', ') || '—') + '</b>' + (x.complemento ? ' · ' + esc(x.complemento) : '') +
      ' <span class="pill neutro">' + esc(x.tipo) + '</span>' + (x.principal ? ' <span class="pill pago">principal</span>' : '') +
      '<div class="sub">' + esc([x.bairro, x.cidade && x.uf ? x.cidade + '/' + x.uf : x.cidade || x.uf, x.cep].filter(Boolean).join(' · ')) + '</div>' },
  contas: { tabela: 'contas_bancarias', titulo: 'Contas bancárias', um: 'conta', vazio: 'Nenhuma conta cadastrada.',
    campos: [['banco', 'Banco', 'texto', 1], ['agencia', 'Agência'], ['conta', 'Conta'], ['tipo_conta', 'Tipo', [['', '—'], ['corrente', 'Corrente'], ['poupanca', 'Poupança'], ['pagamento', 'Pagamento']]],
      ['pix', 'Chave PIX'], ['titular', 'Titular'], ['documento_titular', 'CPF/CNPJ do titular'],
      ['uso', 'Uso', [['', '—'], ['recebimento', 'Recebimento'], ['pagamento', 'Pagamento'], ['restituicao', 'Restituição']]], ['principal', 'Conta principal', 'check'], ['obs', 'Observação', 'area']],
    linha: (x) => '<b>' + esc(x.banco || '—') + '</b>' + (x.agencia || x.conta ? ' · ag. ' + esc(x.agencia) + ' c. ' + esc(x.conta) : '') +
      (x.uso ? ' <span class="pill neutro">' + esc(x.uso) + '</span>' : '') + (x.principal ? ' <span class="pill pago">principal</span>' : '') +
      '<div class="sub">' + esc([x.pix ? 'PIX ' + x.pix : '', x.titular, mascaraDoc(x.documento_titular)].filter(Boolean).join(' · ')) + '</div>' },
  socios: { tabela: 'vinculos_societarios', titulo: 'Sócios e vínculos', um: 'sócio / vínculo', vazio: 'Nenhum sócio ou vínculo cadastrado.',
    campos: [['nome', 'Nome', 'texto', 1], ['cpf_cnpj', 'CPF/CNPJ'], ['qualificacao', 'Qualificação (sócio-administrador, procurador, cônjuge…)'],
      ['participacao', 'Participação (%)', 'numero'], ['email', 'E-mail', 'email'], ['telefone', 'Telefone'], ['obs', 'Observação', 'area']],
    linha: (x) => '<b>' + esc(x.nome || '—') + '</b>' + (x.qualificacao ? ' · ' + esc(x.qualificacao) : '') +
      (x.participacao != null ? ' <span class="pill neutro">' + String(x.participacao).replace('.', ',') + '%</span>' : '') +
      '<div class="sub">' + esc([mascaraDoc(x.cpf_cnpj), x.email, x.telefone].filter(Boolean).join(' · ')) + '</div>' },
  certidoes: { tabela: 'certidoes', titulo: 'Certidões', um: 'certidão', vazio: 'Nenhuma certidão registrada.',
    campos: [['orgao', 'Órgão', [['RFB/PGFN', 'Federal (RFB/PGFN)'], ['Estadual', 'Estadual'], ['Municipal', 'Municipal'], ['Trabalhista', 'Trabalhista (CNDT)'], ['FGTS', 'FGTS (CRF)'], ['Outra', 'Outra']]],
      ['situacao', 'Situação', [['negativa', 'Negativa'], ['positiva com efeito de negativa', 'Positiva com efeito de negativa'], ['positiva', 'Positiva']]],
      ['emissao', 'Emissão', 'data'], ['validade', 'Validade', 'data'], ['obs', 'Observação', 'area']],
    linha: (x) => '<b>' + esc(x.orgao || '—') + '</b> <span class="pill ' + (x.situacao === 'positiva' ? 'vencido' : x.situacao ? 'pago' : 'neutro') + '">' + esc(x.situacao || '—') + '</span>' +
      selo_validade(x.validade) + '<div class="sub">' + (x.emissao ? 'Emitida em ' + dataBR(x.emissao) : '') + (x.obs ? ' · ' + esc(x.obs) : '') + '</div>' }
};
function rotuloPar(pares, v) { return (pares.find((p) => p[0] === v) || [v, v || '—'])[1]; }
function linkWhats(tel, texto) {
  let d = soDigitos(tel);
  if (!d) return '';
  if (d.length <= 11) d = '55' + d;
  return '<a href="https://wa.me/' + d + '" target="_blank" rel="noopener">' + esc(texto || 'WhatsApp') + '</a>';
}

function formSubitem(cfg, item, clienteId, depois) {
  const novo = !item.id;
  const html = cfg.campos.map(([k, rot, tipo, inteiro]) => {
    const v = item[k];
    if (Array.isArray(tipo)) return campo(rot, selectPares(k, tipo, v == null ? tipo[0][0] : v));
    if (tipo === 'check') return '<label class="check inteiro"><input type="checkbox" name="' + k + '"' + (v ? ' checked' : '') + '> ' + rot + '</label>';
    if (tipo === 'area') return campo(rot, '<textarea name="' + k + '" maxlength="2000">' + esc(v || '') + '</textarea>', 'inteiro');
    const t = tipo === 'data' ? 'date' : tipo === 'email' ? 'email' : 'text';
    return campo(rot, '<input name="' + k + '" type="' + t + '"' + (tipo === 'numero' ? ' inputmode="decimal"' : '') + ' value="' +
      esc(v == null ? '' : tipo === 'numero' ? String(v).replace('.', ',') : v) + '">', inteiro ? 'inteiro' : '');
  }).join('');
  const j = abrirJanela({ titulo: (novo ? 'Novo ' : 'Editar ') + cfg.um, corpo: '<form class="grade" id="f-sub">' + html + '</form>',
    rodape: (novo ? '<span></span>' : '<button class="btn btn-x" type="button" id="btn-exc-sub">Excluir</button>') +
      '<div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-salvar-sub">Salvar</button></div>' });
  const f = j.querySelector('#f-sub');
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  f.onsubmit = (ev) => { ev.preventDefault(); j.querySelector('#btn-salvar-sub').click(); };
  j.querySelector('#btn-salvar-sub').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const dados = { cliente_id: clienteId };
    cfg.campos.forEach(([k, , tipo]) => {
      const el = f.elements[k];
      if (tipo === 'check') dados[k] = el.checked;
      else if (tipo === 'data') dados[k] = el.value || null;
      else if (tipo === 'numero') { const n = el.value.trim() ? lerValor(el.value) : null; if (Number.isNaN(n)) throw new Error('Número inválido em "' + cfg.campos.find((c) => c[0] === k)[1] + '".'); dados[k] = n; }
      else dados[k] = el.value.trim();
    });
    const obrig = cfg.campos.find((c) => c[3]);
    if (obrig && !dados[obrig[0]]) throw new Error('Preencha "' + obrig[1] + '".');
    if (novo) await q(sb.from(cfg.tabela).insert(dados)); else await q(sb.from(cfg.tabela).update(dados).eq('id', item.id));
    aviso('✓ ' + cfg.um.charAt(0).toUpperCase() + cfg.um.slice(1) + (novo ? ' incluído(a).' : ' atualizado(a).')); fecharJanela(j); await depois();
  });
  const bx = j.querySelector('#btn-exc-sub');
  if (bx) bx.onclick = () => comBotao(bx, async () => {
    if (!confirm('Excluir este(a) ' + cfg.um + '?')) return;
    await excluir(cfg.tabela, item.id);
    aviso('Excluído.'); fecharJanela(j); await depois();
  });
}
async function pintarSublista(alvo, chave, cl) {
  const cfg = SUBLISTAS[chave];
  const itens = await q(sb.from(cfg.tabela).select('*').eq('cliente_id', cl.id).order('criado_em'));
  alvo.innerHTML = '<div class="titulo-pag" style="margin-bottom:8px"><div><b>' + cfg.titulo + '</b> <span class="sub">' + itens.length + '</span></div>' +
    '<div class="acoes"><button class="btn btn-o btn-mini" data-novo-sub>+ Incluir ' + cfg.um + '</button></div></div>' +
    (itens.length ? '<div class="lista-ficha">' + itens.map((x) => '<div class="item-ficha" data-sub="' + x.id + '"><div>' + cfg.linha(x) + '</div>' +
      '<button class="btn btn-o btn-mini" data-editar-sub="' + x.id + '">Editar</button></div>').join('') + '</div>'
      : '<div class="vazio">' + cfg.vazio + '</div>');
  const repinta = () => pintarSublista(alvo, chave, cl);
  alvo.querySelector('[data-novo-sub]').onclick = () => formSubitem(cfg, {}, cl.id, repinta);
  alvo.querySelectorAll('[data-editar-sub]').forEach((b) => b.onclick = () => formSubitem(cfg, itens.find((x) => x.id === b.dataset.editarSub), cl.id, repinta));
  return itens;
}

// ─────────────────────────── a ficha ───────────────────────────
async function abrirFicha(id, aba) {
  if (!E.clientes.length) await carregarCadastros();
  const cl = E.clientes.find((c) => c.id === id) || await q(sb.from('clientes').select('*, grupos(nome)').eq('id', id).single());
  const etq = await q(sb.from('cliente_etiquetas').select('etiqueta_id, etiquetas(nome, cor)').eq('cliente_id', id)).catch(() => []);
  const tel = cl.telefone, mail = cl.email;
  const j = abrirJanela({ titulo: cl.nome, larga: true,
    corpo:
      '<div class="ficha-topo"><div class="ficha-id">' +
      '<div class="ficha-sub">' + [cl.grupos && cl.grupos.nome ? esc(cl.grupos.nome) : '', esc(mascaraDoc(cl.cpf_cnpj) || ''), esc(cl.tipo_societario || ''), esc(cl.regime_tributario || '')].filter(Boolean).join(' · ') + '</div>' +
      '<div class="ficha-selos"><span class="pill ' + (cl.tipo === 'Inativo' ? 'neutro' : cl.tipo === 'Demanda' ? 'hoje' : 'aberto') + '">' + esc(cl.tipo === 'Demanda' ? 'Serviço pontual' : cl.tipo) + '</span> ' +
      pillPessoa(cl.responsavel) + ' ' + (cl.situacao_cadastral ? pillSitCad(cl.situacao_cadastral) + ' ' : '') + (cl.capag ? 'CAPAG ' + pillCapag(cl.capag) + ' ' : '') +
      etq.map((e) => e.etiquetas ? '<span class="pill" style="background:' + esc(e.etiquetas.cor) + '22;color:' + esc(e.etiquetas.cor) + '">' + esc(e.etiquetas.nome) + '</span>' : '').join(' ') +
      ' <button class="btn-etq" id="fc-etq" title="Etiquetas">+ etiqueta</button></div></div>' +
      '<div class="ficha-atalhos">' +
      '<button class="btn btn-o btn-mini" id="fc-tarefa">+ Tarefa</button><button class="btn btn-o btn-mini" id="fc-lanc">+ Lançamento</button>' +
      '<button class="btn btn-o btn-mini" id="fc-doc">+ Documento</button><button class="btn btn-o btn-mini" id="fc-int">+ Interação</button>' +
      (tel ? '<a class="btn btn-o btn-mini" target="_blank" rel="noopener" href="https://wa.me/' + (soDigitos(tel).length <= 11 ? '55' : '') + soDigitos(tel) + '">WhatsApp</a>' : '') +
      (mail ? '<a class="btn btn-o btn-mini" href="mailto:' + esc(mail) + '">E-mail</a>' : '') +
      '<button class="btn btn-p btn-mini" id="fc-editar">Editar cadastro</button></div></div>' +
      '<div class="abas ficha-abas" id="fc-abas">' + ABAS_FICHA.map(([k, r]) => '<button data-aba="' + k + '">' + r + '</button>').join('') + '</div>' +
      '<div id="fc-corpo" class="ficha-corpo"></div>' });
  j.querySelector('.janela').classList.add('ficha');
  const corpo = j.querySelector('#fc-corpo');
  let atual = aba || 'resumo';
  const mostrar = async (k) => {
    atual = k;
    j.querySelectorAll('#fc-abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === k));
    corpo.innerHTML = '<div class="carregando">Carregando…</div>';
    try { await ABA_FICHA[k](corpo, cl, () => mostrar(atual)); }
    catch (e) { console.error(e); corpo.innerHTML = '<div class="vazio">' + esc(erroAmigavel(e)) + '</div>'; }
  };
  j.querySelector('#fc-abas').onclick = (ev) => { const b = ev.target.closest('button'); if (b) mostrar(b.dataset.aba); };
  const reabrir = async () => { await carregarCadastros(true); fecharJanela(j); await abrirFicha(id, atual); };
  j.querySelector('#fc-editar').onclick = () => formCliente(cl, reabrir);
  j.querySelector('#fc-tarefa').onclick = () => formTarefa({ cliente_id: cl.id, grupo_id: cl.grupo_id, responsavel: cl.responsavel }, () => mostrar('tarefas'));
  j.querySelector('#fc-lanc').onclick = () => formLancamento({ tipo: 'receita', empresa: 'escritorio', cliente_id: cl.id, grupo_id: cl.grupo_id, responsavel: cl.responsavel }, () => mostrar('financeiro'));
  j.querySelector('#fc-doc').onclick = () => janelaEnviarDocumento({ cliente_id: cl.id, grupo_id: cl.grupo_id }, () => mostrar('documentos'));
  j.querySelector('#fc-int').onclick = () => formInteracao(cl, () => mostrar('linha'));
  j.querySelector('#fc-etq').onclick = () => janelaEtiquetas(cl, etq, reabrir);
  await mostrar(atual);
  return j;
}

function formInteracao(cl, depois) {
  const agora = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const j = abrirJanela({ titulo: 'Registrar interação — ' + cl.nome,
    corpo: '<form class="grade" id="f-int">' +
      campo('Tipo', selectPares('tipo', [['ligacao', 'Ligação'], ['reuniao', 'Reunião'], ['whatsapp', 'WhatsApp'], ['email', 'E-mail'], ['anotacao', 'Anotação']], 'ligacao')) +
      campo('Quando', '<input type="datetime-local" name="quando" value="' + agora + '">') +
      campo('O que foi tratado <span class="obrig">*</span>', '<textarea name="resumo" maxlength="4000" placeholder="Ex.: cliente pediu simulação do parcelamento; enviar até sexta"></textarea>', 'inteiro') + '</form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-salvar-int">Salvar</button></div>' });
  const f = j.querySelector('#f-int');
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-salvar-int').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.resumo.value.trim()) throw new Error('Escreva o que foi tratado.');
    await q(sb.from('interacoes').insert({ cliente_id: cl.id, tipo: f.tipo.value, quando: f.quando.value ? new Date(f.quando.value).toISOString() : new Date().toISOString(), resumo: f.resumo.value.trim() }));
    aviso('✓ Interação registrada.'); fecharJanela(j); await depois();
  });
}

async function janelaEtiquetas(cl, atuais, depois) {
  const todas = await q(sb.from('etiquetas').select('*').order('nome'));
  const tem = new Set(atuais.map((e) => e.etiqueta_id));
  const j = abrirJanela({ titulo: 'Etiquetas — ' + cl.nome,
    corpo: '<p class="sub" style="margin-bottom:10px">Marque as etiquetas do cliente (ex.: VIP, Inadimplente, Recuperação judicial).</p>' +
      '<div id="etq-lista">' + (todas.length ? todas.map((e) => '<label class="check"><input type="checkbox" value="' + e.id + '"' + (tem.has(e.id) ? ' checked' : '') + '> <span class="pill" style="background:' + esc(e.cor) + '22;color:' + esc(e.cor) + '">' + esc(e.nome) + '</span></label>').join('') : '<div class="sub">Nenhuma etiqueta criada ainda.</div>') + '</div>' +
      '<div class="filtros" style="margin-top:12px"><input class="busca" id="etq-nova" placeholder="Nova etiqueta"><input type="color" id="etq-cor" value="#2E5EAA"></div>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-salvar-etq">Salvar</button></div>' });
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-salvar-etq').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const marcadas = new Set(Array.from(j.querySelectorAll('#etq-lista input:checked')).map((i) => i.value));
    const nova = j.querySelector('#etq-nova').value.trim();
    if (nova) { const e = await q(sb.from('etiquetas').insert({ nome: nova, cor: j.querySelector('#etq-cor').value }).select().single()); marcadas.add(e.id); }
    const tirar = [...tem].filter((x) => !marcadas.has(x)), por = [...marcadas].filter((x) => !tem.has(x));
    if (tirar.length) await q(sb.from('cliente_etiquetas').delete().eq('cliente_id', cl.id).in('etiqueta_id', tirar));
    if (por.length) await q(sb.from('cliente_etiquetas').insert(por.map((etiqueta_id) => ({ cliente_id: cl.id, etiqueta_id }))));
    aviso('✓ Etiquetas atualizadas.'); fecharJanela(j); await depois();
  });
}

// lançamentos do cliente: os dele e os do grupo sem cliente definido
async function lancamentosDoCliente(cl) {
  const filtro = 'cliente_id.eq.' + cl.id + (cl.grupo_id ? ',and(grupo_id.eq.' + cl.grupo_id + ',cliente_id.is.null)' : '');
  return buscarTodos(() => sb.from('lancamentos').select('*').or(filtro).order('vencimento', { ascending: false }));
}
function linhaDado(rot, v) { return v === '' || v == null ? '' : '<div class="dado"><span>' + rot + '</span><b>' + v + '</b></div>'; }

const ABA_FICHA = {
  async resumo(alvo, cl) {
    const h = hojeISO();
    const [lanc, tarefas, ints, procs] = await Promise.all([
      lancamentosDoCliente(cl),
      q(sb.from('tarefas').select('*').or('cliente_id.eq.' + cl.id + (cl.grupo_id ? ',grupo_id.eq.' + cl.grupo_id : '')).not('status', 'in', '(concluida,cancelada)').order('prazo', { nullsFirst: false }).limit(200)),
      q(sb.from('interacoes').select('*').eq('cliente_id', cl.id).order('quando', { ascending: false }).limit(3)),
      cl.grupo_id ? q(sb.from('processos').select('id').eq('grupo_id', cl.grupo_id)) : []
    ]);
    const rec = lanc.filter((l) => l.tipo === 'receita' && !l.perda);
    const aberto = rec.filter((l) => !l.pago), atraso = aberto.filter((l) => l.vencimento < h);
    const ano = rec.filter((l) => l.pago && (l.data_pagamento || l.vencimento) >= somarDias(h, -365));
    const tAtr = tarefas.filter((t) => t.prazo && t.prazo < h);
    const debitos = soma([cl.rfb, cl.pgfn, cl.sefaz_mg, cl.age_mg].map((x) => Number(x) || 0));
    alvo.innerHTML = '<div class="kpis">' +
      kpi('A receber', brl(soma(aberto, vl)), atraso.length ? 'vermelho' : '', atraso.length ? brl(soma(atraso, vl)) + ' em atraso' : aberto.length + ' lançamento(s) em aberto') +
      kpi('Recebido em 12 meses', brl(soma(ano, vl)), 'verde', ano.length + ' pagamento(s)') +
      kpi('Tarefas abertas', String(tarefas.length), tAtr.length ? 'vermelho' : '', tAtr.length ? tAtr.length + ' atrasada(s)' : 'nenhuma atrasada') +
      kpi('Débitos fiscais', brl(debitos), debitos ? 'ambar' : '', procs.length + ' processo(s) do grupo') + '</div>' +
      '<div class="duas-col"><div class="card"><div class="card-hd">Cadastro</div><div class="card-bd dados">' +
      linhaDado('Nome', esc(cl.nome)) + linhaDado('CPF/CNPJ', esc(mascaraDoc(cl.cpf_cnpj))) + linhaDado('Sócio-administrador', esc(cl.socio_admin)) +
      linhaDado('E-mail', cl.email ? '<a href="mailto:' + esc(cl.email) + '">' + esc(cl.email) + '</a>' : '') + linhaDado('Telefone', esc(cl.telefone)) +
      linhaDado('Endereço', esc([cl.endereco, cl.cidade && cl.estado ? cl.cidade + '/' + cl.estado : cl.cidade].filter(Boolean).join(' · '))) +
      linhaDado('Procuração', pillSimNao(cl.procuracao)) + linhaDado('Certificado digital', pillSimNao(cl.certificado)) +
      linhaDado('Origem', esc(cl.origem)) + linhaDado('Observação', esc(cl.obs)) + '</div></div>' +
      '<div class="card"><div class="card-hd">Próximas tarefas</div><div class="card-bd">' +
      (tarefas.length ? tarefas.slice(0, 6).map((t) => '<div class="item-ficha"><div><b>' + esc(t.titulo) + '</b><div class="sub">' + (t.prazo ? 'até ' + dataBR(t.prazo) : 'sem prazo') + ' · ' + esc(t.responsavel || '—') + '</div></div>' +
        (t.prazo && t.prazo < h ? '<span class="pill vencido">atrasada</span>' : '') + '</div>').join('') : '<div class="sub">Nenhuma tarefa aberta.</div>') +
      '</div><div class="card-hd" style="border-top:1px solid var(--border)">Últimas interações</div><div class="card-bd">' +
      (ints.length ? ints.map((i) => '<div class="item-ficha"><div><b>' + esc(rotuloInteracao(i.tipo)) + '</b> <span class="sub">' + quandoBR(i.quando) + '</span><div>' + esc(i.resumo) + '</div></div></div>').join('') : '<div class="sub">Nenhuma interação registrada.</div>') +
      '</div></div></div>';
  },
  contatos: (alvo, cl) => pintarSublista(alvo, 'contatos', cl),
  enderecos: (alvo, cl) => pintarSublista(alvo, 'enderecos', cl),
  contas: (alvo, cl) => pintarSublista(alvo, 'contas', cl),
  socios: (alvo, cl) => pintarSublista(alvo, 'socios', cl),
  async processos(alvo, cl) {
    if (!cl.grupo_id) { alvo.innerHTML = '<div class="vazio">Este cliente não tem grupo; os processos são ligados por grupo.</div>'; return; }
    const ps = await q(sb.from('processos').select('*').eq('grupo_id', cl.grupo_id).order('data_distribuicao', { ascending: false, nullsFirst: false }));
    alvo.innerHTML = '<div class="sub" style="margin-bottom:8px">Processos do grupo ' + esc(nomeGrupo(cl.grupo_id)) + ' · para editar, use o menu Jurídico → Processos.</div>' +
      (ps.length ? '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Número</th><th>Natureza</th><th>Partes</th><th data-tipo="num">Valor</th><th>Status</th><th>Advogado</th></tr></thead><tbody>' +
        ps.map((p) => '<tr><td class="mono">' + esc(p.numero) + '<div class="sub">' + esc(p.competencia) + '</div></td><td>' + esc(p.natureza || '—') + '</td>' +
          '<td>' + esc(p.autor || '') + (p.reu ? ' × ' + esc(p.reu) : '') + '</td><td class="mono" data-ord="' + (Number(p.valor) || 0) + '">' + (p.valor != null ? brl(p.valor) : '—') + '</td>' +
          '<td>' + esc(p.status || '—') + '</td><td>' + pillPessoa(p.advogado) + '</td></tr>').join('') + '</tbody></table></div>'
        : '<div class="vazio">Nenhum processo deste grupo.</div>');
  },
  async contratos(alvo, cl) {
    const cs = await q(sb.from('contratos').select('*').eq('cliente_id', cl.id).order('data_contrato', { ascending: false }));
    alvo.innerHTML = '<div class="titulo-pag" style="margin-bottom:8px"><div><b>Contratos</b> <span class="sub">' + cs.length + '</span></div>' +
      '<div class="acoes"><button class="btn btn-o btn-mini" id="fc-novo-ctr">+ Novo contrato</button></div></div>' +
      (cs.length ? '<div class="tabela-wrap"><table><thead><tr><th>Serviço</th><th>Data</th><th>Valor</th><th>Parcelas</th><th>Status</th></tr></thead><tbody>' +
        cs.map((c) => '<tr class="clicavel" data-ctr-f="' + c.id + '"><td><b>' + esc(c.descricao) + '</b></td><td class="mono">' + dataBR(c.data_contrato) + '</td><td class="mono">' + brl(c.valor_total) +
          (c.percentual_exito ? '<div class="sub">+ ' + String(c.percentual_exito).replace('.', ',') + '% êxito</div>' : '') + '</td><td>' + c.num_parcelas + '</td>' +
          '<td><span class="pill ' + (c.status === 'Ativo' ? 'aberto' : 'neutro') + '">' + esc(c.status) + '</span></td></tr>').join('') + '</tbody></table></div>'
        : vazio('Nenhum contrato deste cliente.', '+ Novo contrato', '#fc-novo-ctr'));
    alvo.querySelector('#fc-novo-ctr').onclick = () => formContrato({ cliente_id: cl.id });
    alvo.querySelectorAll('[data-ctr-f]').forEach((tr) => tr.onclick = () => detalheContrato(tr.dataset.ctrF));
  },
  async financeiro(alvo, cl, repinta) {
    const lanc = await lancamentosDoCliente(cl);
    alvo.innerHTML = '<div class="sub" style="margin-bottom:8px">Lançamentos do cliente' + (cl.grupo_id ? ' e do grupo ' + esc(nomeGrupo(cl.grupo_id)) + ' sem cliente definido' : '') + '.</div>' +
      '<div class="card" style="margin:0">' + tabelaLancamentos(lanc, { compacta: true }) + '</div>';
    ligarAcoesLancamentos(alvo, repinta);
  },
  async tarefas(alvo, cl, repinta) {
    const ts = await q(sb.from('tarefas').select('*').or('cliente_id.eq.' + cl.id + (cl.grupo_id ? ',grupo_id.eq.' + cl.grupo_id : '')).order('prazo', { nullsFirst: false }));
    const h = hojeISO();
    alvo.innerHTML = '<div class="titulo-pag" style="margin-bottom:8px"><div><b>Tarefas</b> <span class="sub">' + ts.filter((t) => !tarefaFechada(t)).length + ' aberta(s)</span></div>' +
      '<div class="acoes"><button class="btn btn-o btn-mini" id="fc-nova-tf">+ Nova tarefa</button></div></div>' +
      (ts.length ? '<div class="lista-ficha">' + ts.map((t) => '<div class="item-ficha' + (tarefaFechada(t) ? ' feita' : '') + '"><div><b>' + esc(t.titulo) + '</b> ' +
        (t.prazo && t.prazo < h && !tarefaFechada(t) ? '<span class="pill vencido">atrasada</span>' : '') +
        '<div class="sub">' + (t.prazo ? 'até ' + dataBR(t.prazo) : 'sem prazo') + (t.prazo_fatal ? ' · fatal ' + dataBR(t.prazo_fatal) : '') + ' · ' + esc(t.responsavel || '—') + ' · ' + esc(STATUS_TAREFA[t.status] || t.status) + '</div></div>' +
        '<button class="btn btn-o btn-mini" data-editar-tf="' + t.id + '">Abrir</button></div>').join('') + '</div>'
        : vazio('Nenhuma tarefa deste cliente.', '+ Nova tarefa', '#fc-nova-tf'));
    alvo.querySelector('#fc-nova-tf').onclick = () => formTarefa({ cliente_id: cl.id, grupo_id: cl.grupo_id, responsavel: cl.responsavel }, repinta);
    alvo.querySelectorAll('[data-editar-tf]').forEach((b) => b.onclick = () => formTarefa(ts.find((t) => t.id === b.dataset.editarTf), repinta));
  },
  documentos: (alvo, cl) => blocoDocumentos(alvo, { cliente_id: cl.id, grupo_id: cl.grupo_id }, { vazio: 'Nenhum documento. Envie contrato social, procuração, documentos pessoais…' }),
  async linha(alvo, cl) {
    const [ints, ctrs, lanc, ts, docs, hist] = await Promise.all([
      q(sb.from('interacoes').select('*').eq('cliente_id', cl.id)),
      q(sb.from('contratos').select('id, descricao, data_contrato').eq('cliente_id', cl.id)),
      q(sb.from('lancamentos').select('descricao, valor, redutor, data_pagamento, vencimento').eq('cliente_id', cl.id).eq('pago', true).order('data_pagamento', { ascending: false }).limit(60)),
      q(sb.from('tarefas').select('titulo, concluida_em, status').or('cliente_id.eq.' + cl.id + (cl.grupo_id ? ',grupo_id.eq.' + cl.grupo_id : '')).eq('status', 'concluida').not('concluida_em', 'is', null)),
      q(sb.from('documentos').select('nome, tipo, criado_em').eq('cliente_id', cl.id)),
      q(sb.from('historico').select('acao, quando, antes, depois').eq('tabela', 'clientes').eq('registro_id', cl.id).order('quando', { ascending: false }).limit(30)).catch(() => [])
    ]);
    const ev = [];
    ints.forEach((i) => ev.push([i.quando, '💬', rotuloInteracao(i.tipo), i.resumo, i]));
    ctrs.forEach((c) => ev.push([c.data_contrato + 'T12:00:00', '📄', 'Contrato', c.descricao]));
    lanc.forEach((l) => ev.push([(l.data_pagamento || l.vencimento) + 'T12:00:00', '💰', 'Pagamento', l.descricao + ' — ' + brl(vl(l))]));
    ts.forEach((t) => ev.push([t.concluida_em, '✓', 'Tarefa concluída', t.titulo]));
    docs.forEach((d) => ev.push([d.criado_em, '📎', 'Documento', d.nome + ' (' + nomeTipoDoc(d.tipo) + ')']));
    hist.forEach((x) => {
      if (x.acao === 'INSERT') ev.push([x.quando, '＋', 'Cadastro criado', '']);
      else if (x.acao === 'UPDATE' && x.antes && x.depois) {
        const mud = Object.keys(x.depois).filter((k) => !/atualizado_em|criado/.test(k) && JSON.stringify(x.antes[k]) !== JSON.stringify(x.depois[k]));
        if (mud.length) ev.push([x.quando, '✎', 'Cadastro alterado', mud.join(', ')]);
      }
    });
    ev.sort((a, b) => String(b[0]).localeCompare(String(a[0])));
    alvo.innerHTML = '<div class="titulo-pag" style="margin-bottom:8px"><div><b>Linha do tempo</b> <span class="sub">' + ev.length + ' evento(s)</span></div>' +
      '<div class="acoes"><button class="btn btn-o btn-mini" id="fc-int2">+ Registrar interação</button></div></div>' +
      (ev.length ? '<div class="linha-tempo">' + ev.map(([q_, ic, tit, txt]) => '<div class="lt-item"><span class="lt-ic">' + ic + '</span><div><b>' + esc(tit) + '</b> <span class="sub">' + quandoBR(q_) + '</span>' +
        (txt ? '<div>' + esc(txt) + '</div>' : '') + '</div></div>').join('') + '</div>' : '<div class="vazio">Nada registrado ainda.</div>');
    alvo.querySelector('#fc-int2').onclick = () => formInteracao(cl, () => ABA_FICHA.linha(alvo, cl));
  },
  async fiscal(alvo, cl) {
    const deb = (rot, v, neg) => v == null && neg == null ? '' : '<tr><td>' + rot + '</td><td class="mono">' + (v != null ? brl(v) : '—') + '</td><td class="mono">' + (neg != null ? brl(neg) : '—') + '</td></tr>';
    alvo.innerHTML = '<div class="duas-col"><div class="card"><div class="card-hd">Débitos</div><div class="card-bd">' +
      '<div class="tabela-wrap"><table><thead><tr><th>Órgão</th><th>Débito</th><th>Negociado</th></tr></thead><tbody>' +
      (deb('Receita Federal', cl.rfb, cl.rfb_negociada) + deb('PGFN', cl.pgfn, cl.pgfn_negociada) + deb('SEFAZ/MG', cl.sefaz_mg, null) + deb('AGE/MG', cl.age_mg, cl.age_mg_negociada) ||
        '<tr><td colspan="3" class="sub">Sem débitos informados.</td></tr>') + '</tbody></table></div>' +
      '<p class="sub" style="margin-top:8px">Para alterar os valores, use "Editar cadastro".</p></div></div>' +
      '<div class="card"><div class="card-hd">Situação</div><div class="card-bd dados">' +
      linhaDado('CAPAG', pillCapag(cl.capag)) + linhaDado('Situação cadastral', pillSitCad(cl.situacao_cadastral)) + linhaDado('Cadastro regular', pillSimNao(cl.cadastro_regular)) +
      linhaDado('Em operação', pillSimNao(cl.em_operacao)) + linhaDado('Regime tributário', esc(cl.regime_tributario)) + linhaDado('Tipo societário', esc(cl.tipo_societario)) +
      linhaDado('CEAT/TRT3', cl.ceat_trt3 != null ? String(cl.ceat_trt3) : '') + '</div></div></div>' +
      '<div class="card"><div class="card-bd" id="fc-certidoes"></div></div>';
    await pintarSublista(alvo.querySelector('#fc-certidoes'), 'certidoes', cl);
  },
  // Cartão CNPJ: o que a Receita diz hoje (atualização diária às 6h) e o histórico do que mudou
  async receita(alvo, cl, repinta) {
    if (soDigitos(cl.cpf_cnpj).length !== 14) { alvo.innerHTML = vazio('O cartão CNPJ vale só para empresas (CNPJ com 14 dígitos).'); return; }
    const [c, execs] = await Promise.all([
      q(sb.from('clientes').select('razao_social, nome_fantasia, situacao_cadastral, data_situacao, cnae_principal, porte, data_abertura, endereco, cidade, estado, cep, cnpj_atualizado_em').eq('id', cl.id).single()),
      q(sb.from('cnpj_execucoes').select('inicio, relatorio').filter('relatorio', 'cs', JSON.stringify([{ cliente_id: cl.id }])).order('inicio', { ascending: false }).limit(30)).catch(() => [])
    ]);
    const hist = [];
    execs.forEach((x) => (x.relatorio || []).forEach((r) => { if (r.cliente_id === cl.id && (r.erro || (r.mudancas && !r.primeira))) hist.push(Object.assign({ quando: x.inicio }, r)); }));
    const admin = E.perfil && E.perfil.papel === 'admin';
    alvo.innerHTML = '<div class="titulo-pag" style="margin-bottom:8px"><div><b>Cartão CNPJ</b> <span class="sub">' +
      (c.cnpj_atualizado_em ? 'consultado na Receita em ' + quandoBR(c.cnpj_atualizado_em) : 'ainda não consultado — a atualização roda todo dia às 6h') + '</span></div>' +
      (admin ? '<div class="acoes"><button class="btn btn-o btn-mini" id="fc-cnpj-agora">↻ Consultar agora</button></div>' : '') + '</div>' +
      '<div class="duas-col"><div class="card"><div class="card-hd">Dados da Receita</div><div class="card-bd dados">' +
      linhaDado('Razão social', esc(c.razao_social)) + linhaDado('Nome fantasia', esc(c.nome_fantasia)) +
      linhaDado('Situação', (c.situacao_cadastral ? pillSitCad(c.situacao_cadastral) : '') + (c.data_situacao ? ' <span class="sub">desde ' + dataBR(c.data_situacao) + '</span>' : '')) +
      linhaDado('Atividade principal (CNAE)', esc(c.cnae_principal)) + linhaDado('Porte', esc(c.porte)) + linhaDado('Abertura', c.data_abertura ? dataBR(c.data_abertura) : '') +
      linhaDado('Endereço', esc(c.endereco)) + linhaDado('Cidade/UF', esc([c.cidade, c.estado].filter(Boolean).join('/'))) + linhaDado('CEP', esc(c.cep ? String(c.cep).replace(/^(\d{5})(\d{3})$/, '$1-$2') : '')) +
      '</div></div><div class="card"><div class="card-hd">Histórico de alterações</div><div class="card-bd">' +
      (hist.length ? '<div class="lista-ficha">' + hist.map((h) => '<div class="item-ficha"><div><b>' + quandoBR(h.quando) + '</b>' +
        (h.erro ? '<div class="sub" style="color:var(--red-d)">Erro na consulta: ' + esc(h.erro) + '</div>' :
          h.mudancas.map((m) => '<div class="sub">' + esc(m.campo) + ': <s>' + esc(m.antes || '—') + '</s> → <b>' + esc(m.depois) + '</b></div>').join('')) + '</div></div>').join('') + '</div>'
        : vazio('Nenhuma alteração desde a primeira consulta.')) + '</div></div></div>';
    const bt = alvo.querySelector('#fc-cnpj-agora');
    if (bt) bt.onclick = () => comBotao(bt, async () => {
      const r = await chamarFuncao('erp-cnpj', { acao: 'rodar', cliente_id: cl.id });
      aviso('✓ Cartão CNPJ: ' + (r.mensagem || 'consultado') + '.'); repinta();
    });
  }
};
function rotuloInteracao(t) { return { ligacao: 'Ligação', reuniao: 'Reunião', whatsapp: 'WhatsApp', email: 'E-mail', anotacao: 'Anotação' }[t] || t; }
function quandoBR(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return dataBR(v);
  return d.toLocaleDateString('pt-BR') + (/T12:00:00$/.test(v) ? '' : ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
}

'use strict';
// ═══════════════════════════════════════════════════════════════════
// CRM — do primeiro contato ao contrato assinado, sem serviço pago.
// Funil (arrastar muda a etapa) · Lista com total ponderado · Painel ·
// Ficha da oportunidade (atividades, propostas, documentos) ·
// "Ganhou" cria cliente, contrato, parcelas e o fluxo de onboarding.
// ═══════════════════════════════════════════════════════════════════
const ORIGENS_CRM = ['Indicação de cliente', 'Contador parceiro', 'Site / Google', 'Instagram / redes', 'Evento / palestra', 'Cliente atual (novo serviço)', 'Outro'];
const TIPOS_HON = [['', '—'], ['fixo', 'Fixo'], ['mensal', 'Mensal'], ['exito', 'Êxito'], ['misto', 'Fixo + êxito']];
const TIPOS_ATIV = [['ligacao', 'Ligação'], ['reuniao', 'Reunião'], ['whatsapp', 'WhatsApp'], ['email', 'E-mail'], ['anotacao', 'Anotação']];

function nomeOp(o) { return (o.cliente_id && nomeCliente(o.cliente_id)) || o.prospecto_empresa || o.prospecto_nome || '—'; }
function diasParado(o) { return Math.max(0, Math.floor((Date.now() - new Date(o.etapa_desde)) / 86400000)); }
function etapaDe(id) { return (E._crmEtapas || []).find((e) => e.id === id) || {}; }
function opAberta(o) { return !etapaDe(o.etapa_id).final; }

TELAS.crm = async function () {
  E.crm = E.crm || { vista: 'funil', resp: '', origem: '', busca: '' };
  const F = E.crm;
  await carregarCadastros();
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>CRM</h1><p>Oportunidades, propostas e o caminho até o contrato assinado</p></div>' +
    '<div class="acoes"><button class="btn btn-o" id="cr-modelos">Modelos de proposta</button><button class="btn btn-p" id="cr-nova">+ Nova oportunidade</button></div></div>' +
    '<div class="filtros"><div class="segmento" id="cr-vista">' + [['funil', 'Funil'], ['lista', 'Lista'], ['painel', 'Painel']].map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<select class="busca sel" id="cr-resp"><option value="">Todos os responsáveis</option>' + Object.keys(PESSOA).map((p) => '<option>' + p + '</option>').join('') + '</select>' +
    '<select class="busca sel" id="cr-origem"><option value="">Todas as origens</option>' + ORIGENS_CRM.map((o) => '<option>' + esc(o) + '</option>').join('') + '</select>' +
    '<input class="busca" id="cr-busca" placeholder="Buscar oportunidade, empresa ou pessoa" autocomplete="off"></div>' +
    '<div id="cr-corpo"><div class="carregando">Carregando…</div></div>';
  $('cr-nova').onclick = () => formOportunidade({}, recarregarCrm);
  $('cr-modelos').onclick = () => janelaModelosProposta();
  $('cr-vista').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.vista = b.dataset.v; pintarCrm(); } };
  [['cr-resp', 'resp'], ['cr-origem', 'origem']].forEach(([id, k]) => { $(id).value = F[k]; $(id).onchange = (ev) => { F[k] = ev.target.value; pintarCrm(); }; });
  $('cr-busca').value = F.busca;
  let t; $('cr-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; pintarCrm(); }, 250); };
  await recarregarCrm(true);
};
async function recarregarCrm(soDados) {
  const [et, ops] = await Promise.all([q(sb.from('crm_etapas').select('*').order('ordem')), buscarTodos(() => sb.from('crm_oportunidades').select('*').order('criado_em', { ascending: false }))]);
  E._crmEtapas = et; E._crmOps = ops;
  if (soDados !== false) pintarCrm();
}
function filtrarOps() {
  const F = E.crm, b = normalizar(F.busca);
  return (E._crmOps || []).filter((o) => (!F.resp || o.responsavel === F.resp) && (!F.origem || o.origem === F.origem) &&
    (!b || normalizar(o.titulo + ' ' + nomeOp(o) + ' ' + o.prospecto_nome + ' ' + o.prospecto_email).includes(b)));
}
function pintarCrm() {
  if (!$('cr-corpo')) return;
  document.querySelectorAll('#cr-vista button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === E.crm.vista));
  ({ funil: crmFunil, lista: crmLista, painel: crmPainel })[E.crm.vista]($('cr-corpo'));
}

// ── Funil (kanban) ──
function crmFunil(alvo) {
  const ops = filtrarOps(), h = hojeISO(), limite = Date.now() - 30 * 86400000;
  alvo.innerHTML = '<div class="cr-funil">' + (E._crmEtapas || []).map((e) => {
    const cs = ops.filter((o) => o.etapa_id === e.id && (!e.final || new Date(o.ganho_em || o.perdido_em || o.atualizado_em) > limite));
    return '<div class="cr-col' + (e.final ? ' cr-final-' + e.final : '') + '" data-etapa="' + e.id + '"><div class="cr-col-tit"><span>' + esc(e.nome) + '</span><span class="sub">' + cs.length +
      (cs.length && !e.final ? ' · ' + esc(brlCurto(soma(cs, (o) => o.valor_estimado))) : '') + '</span></div>' +
      cs.map((o) => { const atr = o.proxima_acao_em && o.proxima_acao_em < h && !e.final;
        return '<div class="cr-card' + (atr ? ' cr-atrasada' : '') + '" draggable="true" data-op="' + o.id + '"><b>' + esc(o.titulo) + '</b><div class="sub">' + esc(nomeOp(o)) + '</div>' +
          '<div class="cr-card-rod"><span class="mono">' + brl(o.valor_estimado) + '</span>' + (e.final ? '' : '<span class="sub" title="dias nesta etapa">' + diasParado(o) + 'd parado</span>') + '</div>' +
          (o.proxima_acao && !e.final ? '<div class="cr-prox' + (atr ? ' atrasada' : '') + '">→ ' + esc(o.proxima_acao) + (o.proxima_acao_em ? ' · ' + dataBR(o.proxima_acao_em) : '') + '</div>' : '') +
          (o.responsavel ? '<div style="margin-top:4px">' + pillPessoa(o.responsavel) + '</div>' : '') + '</div>'; }).join('') + '</div>';
  }).join('') + '</div><p class="sub" style="margin-top:8px">Arraste o cartão para mudar a etapa. Vermelho = próxima ação atrasada. Ganhas e perdidas: últimos 30 dias.</p>';
  let arrastando = null;
  alvo.querySelectorAll('.cr-card').forEach((c) => {
    c.addEventListener('dragstart', (ev) => { arrastando = c.dataset.op; ev.dataTransfer.setData('text/plain', c.dataset.op); c.classList.add('arrastando'); });
    c.addEventListener('dragend', () => c.classList.remove('arrastando'));
    c.onclick = () => fichaOportunidade(c.dataset.op);
  });
  alvo.querySelectorAll('.cr-col').forEach((col) => {
    col.addEventListener('dragover', (ev) => { ev.preventDefault(); col.classList.add('sobre'); });
    col.addEventListener('dragleave', () => col.classList.remove('sobre'));
    col.addEventListener('drop', (ev) => { ev.preventDefault(); col.classList.remove('sobre'); moverOp(ev.dataTransfer.getData('text/plain') || arrastando, col.dataset.etapa); });
  });
}
async function moverOp(opId, etapaId) {
  const o = E._crmOps.find((x) => x.id === opId), e = etapaDe(etapaId);
  if (!o || o.etapa_id === etapaId) return;
  if (e.final === 'ganho') return janelaGanhar(o);
  if (e.final === 'perdido') return janelaPerder(o);
  comBotao(null, async () => {
    await q(sb.from('crm_oportunidades').update({ etapa_id: etapaId, probabilidade: e.probabilidade, ganho_em: null, perdido_em: null }).eq('id', opId));
    aviso('✓ ' + o.titulo + ' → ' + e.nome + '.'); await recarregarCrm();
  });
}

// ── Lista ──
function crmLista(alvo) {
  const ops = filtrarOps(), abertas = ops.filter(opAberta), h = hojeISO();
  const pond = (o) => (Number(o.valor_estimado) || 0) * (o.probabilidade || 0) / 100;
  alvo.innerHTML = '<div class="kpis">' + kpi('Oportunidades abertas', String(abertas.length), '', ops.length + ' no total') +
    kpi('Valor em aberto', brl(soma(abertas, (o) => o.valor_estimado)), '', 'soma dos valores estimados') +
    kpi('Total ponderado', brl(soma(abertas, pond)), 'verde', 'valor × probabilidade') + '</div>' +
    '<div class="card">' + (ops.length ? '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Oportunidade</th><th>Etapa</th><th data-tipo="num">Valor</th><th data-tipo="num">Prob.</th>' +
      '<th data-tipo="num">Ponderado</th><th>Responsável</th><th data-tipo="data">Próxima ação</th><th data-tipo="data">Previsão</th><th>Origem</th></tr></thead><tbody>' +
      ops.map((o) => '<tr class="clicavel" data-op="' + o.id + '"><td><b>' + esc(o.titulo) + '</b><div class="sub">' + esc(nomeOp(o)) + '</div></td>' +
        '<td><span class="pill ' + (etapaDe(o.etapa_id).final === 'ganho' ? 'pago' : etapaDe(o.etapa_id).final === 'perdido' ? 'neutro' : 'aberto') + '">' + esc(etapaDe(o.etapa_id).nome || '—') + '</span></td>' +
        '<td class="num mono" data-ord="' + (o.valor_estimado || 0) + '">' + brl(o.valor_estimado) + '</td><td class="mono" data-ord="' + o.probabilidade + '">' + o.probabilidade + '%</td>' +
        '<td class="num mono" data-ord="' + pond(o) + '">' + brl(pond(o)) + '</td><td>' + pillPessoa(o.responsavel) + '</td>' +
        '<td data-ord="' + esc(o.proxima_acao_em || '') + '">' + esc(o.proxima_acao || '—') + (o.proxima_acao_em ? '<div class="sub' + (o.proxima_acao_em < h && opAberta(o) ? ' texto-vermelho' : '') + '">' + dataBR(o.proxima_acao_em) + '</div>' : '') + '</td>' +
        '<td class="mono" data-ord="' + esc(o.previsao_fechamento || '') + '">' + (o.previsao_fechamento ? dataBR(o.previsao_fechamento) : '—') + '</td><td>' + esc(o.origem || '—') + '</td></tr>').join('') +
      '</tbody></table></div>' : vazio('Nenhuma oportunidade ainda — registre o primeiro contato de um cliente em potencial.', '+ Nova oportunidade', '#cr-nova')) + '</div>';
  alvo.querySelectorAll('[data-op]').forEach((tr) => tr.onclick = () => fichaOportunidade(tr.dataset.op));
}

// ── Painel ──
function crmPainel(alvo) {
  const ops = filtrarOps(), abertas = ops.filter(opAberta), mes = hojeISO().slice(0, 7);
  const ganhos = ops.filter((o) => o.ganho_em), perdas = ops.filter((o) => o.perdido_em);
  const noMes = (l, k) => l.filter((o) => String(o[k]).slice(0, 7) === mes);
  const d90 = Date.now() - 90 * 86400000, g90 = ganhos.filter((o) => new Date(o.ganho_em) > d90).length, p90 = perdas.filter((o) => new Date(o.perdido_em) > d90).length;
  const tempo = ganhos.length ? soma(ganhos, (o) => (new Date(o.ganho_em) - new Date(o.criado_em)) / 86400000) / ganhos.length : null;
  const pond = (o) => (Number(o.valor_estimado) || 0) * (o.probabilidade || 0) / 100;
  const funil = (E._crmEtapas || []).filter((e) => !e.final).map((e) => ({ rotulo: e.nome, valor: abertas.filter((o) => o.etapa_id === e.id).length }));
  const motivos = {}; perdas.forEach((o) => { const m = o.motivo_perda || 'sem motivo'; motivos[m] = (motivos[m] || 0) + 1; });
  const origens = {}; ops.forEach((o) => { const k = o.origem || 'Não informada'; origens[k] = origens[k] || { total: 0, ganhos: 0, valor: 0 }; origens[k].total++; if (o.ganho_em) { origens[k].ganhos++; origens[k].valor += Number(o.valor_estimado) || 0; } });
  const meses = [0, 1, 2].map((i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + i); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); });
  const previsao = meses.map((m) => ({ rotulo: nomeMes(new Date(m + '-01T12:00:00')), valor: soma(abertas.filter((o) => String(o.previsao_fechamento || '').slice(0, 7) === m), pond) }));
  const fmtN = (n) => String(n);
  const ranking = (itens, opc, vazio) => itens.some((i) => i.valor) ? graficoRanking(itens, opc) : '<div class="vazio">' + vazio + '</div>';
  alvo.innerHTML = '<div class="kpis">' +
    kpi('Em aberto', brl(soma(abertas, (o) => o.valor_estimado)), '', abertas.length + ' oportunidade(s) · ponderado ' + brl(soma(abertas, pond))) +
    kpi('Ganhos no mês', brl(soma(noMes(ganhos, 'ganho_em'), (o) => o.valor_estimado)), 'verde', noMes(ganhos, 'ganho_em').length + ' contrato(s)') +
    kpi('Perdidas no mês', String(noMes(perdas, 'perdido_em').length), noMes(perdas, 'perdido_em').length ? 'vermelho' : '', '') +
    kpi('Conversão (90 dias)', g90 + p90 ? Math.round(g90 / (g90 + p90) * 100) + '%' : '—', '', g90 + ' ganha(s) de ' + (g90 + p90) + ' decidida(s)') +
    kpi('Tempo médio até fechar', tempo == null ? '—' : Math.round(tempo) + ' dia(s)', '', 'do primeiro contato ao "Ganhou"') + '</div>' +
    '<div class="duas-col"><div class="card"><div class="card-hd">Funil — oportunidades abertas por etapa</div><div class="card-bd">' + ranking(funil, { fmt: fmtN, titulo: 'Funil' }, 'Nenhuma oportunidade aberta.') + '</div></div>' +
    '<div class="card"><div class="card-hd">Previsão ponderada — próximos 3 meses</div><div class="card-bd">' + ranking(previsao, { titulo: 'Previsão' }, 'Sem previsão de fechamento nos próximos 3 meses.') +
      '<p class="sub">Pela data de previsão de fechamento de cada oportunidade × probabilidade.</p></div></div></div>' +
    '<div class="duas-col"><div class="card"><div class="card-hd">Motivos de perda</div><div class="card-bd">' +
      ranking(Object.entries(motivos).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ rotulo: k, valor: v })), { fmt: fmtN, titulo: 'Motivos' }, 'Nenhuma perda registrada.') + '</div></div>' +
    '<div class="card"><div class="card-hd">Origem que mais converte</div><div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Origem</th><th data-tipo="num">Oportunidades</th><th data-tipo="num">Ganhas</th><th data-tipo="num">Conversão</th><th data-tipo="num">Valor ganho</th></tr></thead><tbody>' +
      Object.entries(origens).sort((a, b) => b[1].ganhos - a[1].ganhos).map(([k, v]) => '<tr><td>' + esc(k) + '</td><td class="mono">' + v.total + '</td><td class="mono">' + v.ganhos + '</td><td class="mono" data-ord="' + (v.ganhos / v.total) + '">' + Math.round(v.ganhos / v.total * 100) + '%</td><td class="num mono" data-ord="' + v.valor + '">' + brl(v.valor) + '</td></tr>').join('') +
      '</tbody></table></div></div></div>';
}

// ── Formulário da oportunidade ──
function formOportunidade(o, depois) {
  const novo = !o.id, et = E._crmEtapas || [];
  const abertas = et.filter((e) => !e.final);
  const j = abrirJanela({ titulo: novo ? 'Nova oportunidade' : 'Editar oportunidade', larga: true,
    corpo: '<form id="f-op" class="grade">' +
      campo('Oportunidade <span class="obrig">*</span>', '<input name="titulo" maxlength="200" placeholder="Ex.: Defesa em execução fiscal — Empresa X" value="' + esc(o.titulo || '') + '">', 'inteiro') +
      campo('Já é cliente?', '<select name="cliente_id">' + opcoesClientes(o.cliente_id || '').replace('— sem cliente —', 'Não — é um contato novo') + '</select>', 'inteiro') +
      '<div class="grade inteiro" id="op-prospecto">' +
      campo('Nome do contato', '<input name="prospecto_nome" value="' + esc(o.prospecto_nome || '') + '">') + campo('Empresa', '<input name="prospecto_empresa" value="' + esc(o.prospecto_empresa || '') + '">') +
      campo('CPF/CNPJ', '<input name="prospecto_doc" value="' + esc(o.prospecto_doc || '') + '">') + campo('E-mail', '<input name="prospecto_email" type="email" value="' + esc(o.prospecto_email || '') + '">') +
      campo('Telefone / WhatsApp', '<input name="prospecto_telefone" value="' + esc(o.prospecto_telefone || '') + '">') + '</div>' +
      campo('Origem', '<input name="origem" list="op-origens" value="' + esc(o.origem || '') + '"><datalist id="op-origens">' + ORIGENS_CRM.map((x) => '<option value="' + esc(x) + '">').join('') + '</datalist>') +
      campo('Indicado por', '<input name="indicado_por" value="' + esc(o.indicado_por || '') + '">') +
      campo('Etapa', '<select name="etapa_id">' + abertas.map((e) => '<option value="' + e.id + '" data-prob="' + e.probabilidade + '"' + ((o.etapa_id || abertas[0].id) === e.id ? ' selected' : '') + '>' + esc(e.nome) + '</option>').join('') + '</select>') +
      campo('Probabilidade (%)', '<input name="probabilidade" type="number" min="0" max="100" value="' + (o.probabilidade != null ? o.probabilidade : (abertas[0] || {}).probabilidade || 10) + '">') +
      campo('Valor estimado (R$)', '<input name="valor_estimado" inputmode="decimal" value="' + (o.valor_estimado ? valorParaCampo(o.valor_estimado) : '') + '">') +
      campo('Tipo de honorário', selectPares('honorario_tipo', TIPOS_HON, o.honorario_tipo || '')) +
      campo('Previsão de fechamento', '<input name="previsao_fechamento" type="date" value="' + esc(o.previsao_fechamento || '') + '">') +
      campo('Responsável', '<input name="responsavel" list="op-pessoas" value="' + esc(o.responsavel || (E.perfil && (E.perfil.nome || '').split(' ')[0]) || '') + '">' + datalistPessoas('op-pessoas')) +
      campo('Próxima ação', '<input name="proxima_acao" placeholder="Ex.: ligar para agendar diagnóstico" value="' + esc(o.proxima_acao || '') + '">') +
      campo('Data da próxima ação', '<input name="proxima_acao_em" type="date" value="' + esc(o.proxima_acao_em || '') + '">') +
      '<label class="check inteiro"><input type="checkbox" name="agendar"' + (novo ? ' checked' : '') + '> Criar tarefa para a próxima ação (aparece na fila do responsável)</label>' +
      campo('Observação', '<textarea name="obs" maxlength="3000">' + esc(o.obs || '') + '</textarea>', 'inteiro') + '</form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-salvar-op">Salvar</button></div>' });
  const f = j.querySelector('#f-op');
  const mostrarProspecto = () => j.querySelector('#op-prospecto').classList.toggle('escondido', !!f.cliente_id.value);
  f.cliente_id.onchange = mostrarProspecto; mostrarProspecto();
  f.etapa_id.onchange = () => { f.probabilidade.value = f.etapa_id.selectedOptions[0].dataset.prob; };
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-salvar-op').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.titulo.value.trim()) throw new Error('Dê um nome à oportunidade.');
    if (!f.cliente_id.value && !f.prospecto_nome.value.trim() && !f.prospecto_empresa.value.trim()) throw new Error('Escolha o cliente ou informe o contato/empresa.');
    const valor = f.valor_estimado.value.trim() ? lerValor(f.valor_estimado.value) : 0;
    if (Number.isNaN(valor)) throw new Error('Valor estimado inválido.');
    const d = { titulo: f.titulo.value.trim(), cliente_id: f.cliente_id.value || null, origem: f.origem.value.trim(), indicado_por: f.indicado_por.value.trim(),
      etapa_id: f.etapa_id.value, probabilidade: Math.min(100, Math.max(0, parseInt(f.probabilidade.value, 10) || 0)), valor_estimado: valor,
      honorario_tipo: f.honorario_tipo.value, previsao_fechamento: f.previsao_fechamento.value || null, responsavel: f.responsavel.value.trim(),
      proxima_acao: f.proxima_acao.value.trim(), proxima_acao_em: f.proxima_acao_em.value || null, obs: f.obs.value.trim() };
    ['prospecto_nome', 'prospecto_empresa', 'prospecto_doc', 'prospecto_email', 'prospecto_telefone'].forEach((k) => { d[k] = f[k].value.trim(); });
    const salvo = novo ? await q(sb.from('crm_oportunidades').insert(d).select().single()) : (await q(sb.from('crm_oportunidades').update(d).eq('id', o.id).select()))[0];
    if (f.agendar.checked && d.proxima_acao && d.proxima_acao_em && (novo || d.proxima_acao_em !== o.proxima_acao_em || d.proxima_acao !== o.proxima_acao)) {
      await q(sb.from('tarefas').insert({ titulo: 'CRM: ' + d.proxima_acao + ' — ' + d.titulo, responsavel: d.responsavel, prazo: d.proxima_acao_em, inicio: hojeISO(),
        cliente_id: d.cliente_id, prioridade: 'media', status: 'pendente', descricao: 'Oportunidade do CRM' })).catch((e) => console.warn('[CRM] tarefa:', e));
    }
    aviso(novo ? '✓ Oportunidade criada.' : '✓ Oportunidade atualizada.'); fecharJanela(j);
    if (depois) await depois(salvo);
  });
}

// ── Ficha da oportunidade ──
async function fichaOportunidade(id, aba) {
  const o = await q(sb.from('crm_oportunidades').select('*').eq('id', id).single());
  if (!E._crmEtapas) E._crmEtapas = await q(sb.from('crm_etapas').select('*').order('ordem'));
  const e = etapaDe(o.etapa_id), aberta = !e.final;
  const tel = soDigitos(o.prospecto_telefone || (o.cliente_id && (E.clientes.find((c) => c.id === o.cliente_id) || {}).telefone) || '');
  const j = abrirJanela({ titulo: o.titulo, larga: true,
    corpo: '<div class="ficha-topo"><div><div class="ficha-sub">' + esc(nomeOp(o)) + (o.prospecto_email ? ' · ' + esc(o.prospecto_email) : '') + '</div>' +
      '<div class="ficha-selos"><span class="pill ' + (e.final === 'ganho' ? 'pago' : e.final === 'perdido' ? 'neutro' : 'aberto') + '">' + esc(e.nome || '—') + '</span> ' +
      '<span class="mono">' + brl(o.valor_estimado) + '</span> <span class="sub">' + o.probabilidade + '%</span> ' + pillPessoa(o.responsavel) + '</div></div>' +
      '<div class="ficha-atalhos">' + (aberta ? '<button class="btn btn-v btn-mini" id="op-ganhou">✓ Ganhou</button><button class="btn btn-x btn-mini" id="op-perdeu">Perdeu</button>' : '') +
      (tel ? '<a class="btn btn-o btn-mini" target="_blank" rel="noopener" href="https://wa.me/' + (tel.length <= 11 ? '55' : '') + tel + '">WhatsApp</a>' : '') +
      '<button class="btn btn-p btn-mini" id="op-editar">Editar</button></div></div>' +
      (e.final === 'perdido' && o.motivo_perda ? '<div class="dica" style="margin-bottom:10px">Perdida: ' + esc(o.motivo_perda) + '</div>' : '') +
      (o.contrato_id ? '<div class="dica" style="margin-bottom:10px">Contrato criado. <a href="#" id="op-ver-cli">Abrir a ficha do cliente</a></div>' : '') +
      '<div class="abas" id="op-abas">' + [['atividades', 'Atividades'], ['propostas', 'Propostas'], ['documentos', 'Documentos'], ['dados', 'Dados']].map(([k, r]) => '<button data-aba="' + k + '">' + r + '</button>').join('') + '</div>' +
      '<div id="op-corpo" class="ficha-corpo"></div>' });
  j.querySelector('.janela').classList.add('ficha');
  const corpo = j.querySelector('#op-corpo');
  const reabrir = async (k) => { fecharJanela(j); await recarregarCrm(); await fichaOportunidade(id, k); };
  const mostrar = async (k) => {
    j.querySelectorAll('#op-abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === k));
    corpo.innerHTML = '<div class="carregando">Carregando…</div>';
    try { await ({ atividades: opAtividades, propostas: opPropostas, documentos: opDocumentos, dados: opDados })[k](corpo, o, () => mostrar(k)); }
    catch (er) { console.error(er); corpo.innerHTML = '<div class="vazio">' + esc(erroAmigavel(er)) + '</div>'; }
  };
  j.querySelector('#op-abas').onclick = (ev) => { const b = ev.target.closest('button'); if (b) mostrar(b.dataset.aba); };
  j.querySelector('#op-editar').onclick = () => formOportunidade(o, () => reabrir('dados'));
  const g = j.querySelector('#op-ganhou'); if (g) g.onclick = () => janelaGanhar(o, () => { fecharJanela(j); });
  const p = j.querySelector('#op-perdeu'); if (p) p.onclick = () => janelaPerder(o, () => { fecharJanela(j); });
  const vc = j.querySelector('#op-ver-cli'); if (vc) vc.onclick = (ev) => { ev.preventDefault(); abrirFicha(o.cliente_id); };
  await mostrar(aba || 'atividades');
  return j;
}
async function opAtividades(alvo, o, repinta) {
  const at = await q(sb.from('crm_atividades').select('*').eq('oportunidade_id', o.id).order('quando', { ascending: false }));
  const agora = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  alvo.innerHTML = '<form id="f-at" class="grade" style="margin-bottom:12px">' + campo('Tipo', selectPares('tipo', TIPOS_ATIV, 'ligacao')) +
    campo('Quando', '<input type="datetime-local" name="quando" value="' + agora + '">') +
    campo('O que foi tratado / o que fazer', '<textarea name="resumo" maxlength="3000" placeholder="Ex.: enviou o relatório da PGFN; retornar na sexta"></textarea>', 'inteiro') +
    '<div class="inteiro acoes"><button type="button" class="btn btn-p btn-mini" id="at-salvar">Registrar</button><span class="sub">Data futura vira tarefa na fila do responsável.</span></div></form>' +
    (at.length ? '<div class="linha-tempo">' + at.map((a) => '<div class="lt-item"><span class="lt-ic">' + ({ ligacao: '📞', reuniao: '🤝', whatsapp: '💬', email: '✉', anotacao: '📝' }[a.tipo] || '•') + '</span><div><b>' +
      esc(rotuloPar(TIPOS_ATIV, a.tipo)) + '</b> <span class="sub">' + quandoBR(a.quando) + (a.feita ? '' : ' · agendada') + '</span><div>' + esc(a.resumo) + '</div></div></div>').join('') + '</div>'
      : '<div class="vazio">Nenhuma atividade ainda.</div>');
  const f = alvo.querySelector('#f-at');
  alvo.querySelector('#at-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.resumo.value.trim()) throw new Error('Escreva o que foi tratado.');
    const quando = f.quando.value ? new Date(f.quando.value) : new Date(), futura = quando > new Date(Date.now() + 60000);
    await q(sb.from('crm_atividades').insert({ oportunidade_id: o.id, tipo: f.tipo.value, quando: quando.toISOString(), resumo: f.resumo.value.trim(), feita: !futura }));
    if (futura) await q(sb.from('tarefas').insert({ titulo: 'CRM: ' + rotuloPar(TIPOS_ATIV, f.tipo.value) + ' — ' + o.titulo, descricao: f.resumo.value.trim(), responsavel: o.responsavel,
      prazo: iso(quando), inicio: hojeISO(), cliente_id: o.cliente_id, status: 'pendente', prioridade: 'media' }));
    if (o.cliente_id) await q(sb.from('interacoes').insert({ cliente_id: o.cliente_id, tipo: f.tipo.value, quando: quando.toISOString(), resumo: '[CRM] ' + f.resumo.value.trim() })).catch(() => {});
    aviso(futura ? '✓ Atividade agendada (tarefa criada).' : '✓ Atividade registrada.'); await repinta();
  });
}
function opDocumentos(alvo, o) {
  return blocoDocumentos(alvo, { oportunidade_id: o.id, cliente_id: o.cliente_id, tipo: 'proposta' }, { titulo: 'Documentos da oportunidade', vazio: 'Nenhum documento. Propostas guardadas e arquivos recebidos aparecem aqui.' });
}
function opDados(alvo, o) {
  const lin = (r, v) => v ? '<div class="dado"><span>' + r + '</span><b>' + v + '</b></div>' : '';
  alvo.innerHTML = '<div class="duas-col"><div class="dados">' + lin('Contato', esc(o.prospecto_nome)) + lin('Empresa', esc(o.prospecto_empresa)) + lin('CPF/CNPJ', esc(mascaraDoc(o.prospecto_doc))) +
    lin('E-mail', esc(o.prospecto_email)) + lin('Telefone', esc(o.prospecto_telefone)) + lin('Cliente', o.cliente_id ? esc(nomeCliente(o.cliente_id)) : '') + '</div>' +
    '<div class="dados">' + lin('Origem', esc(o.origem)) + lin('Indicado por', esc(o.indicado_por)) + lin('Tipo de honorário', esc(rotuloPar(TIPOS_HON, o.honorario_tipo))) +
    lin('Previsão de fechamento', o.previsao_fechamento ? dataBR(o.previsao_fechamento) : '') + lin('Próxima ação', esc(o.proxima_acao) + (o.proxima_acao_em ? ' · ' + dataBR(o.proxima_acao_em) : '')) +
    lin('Na etapa há', diasParado(o) + ' dia(s)') + lin('Criada em', dataBR(o.criado_em)) + lin('Observação', esc(o.obs)) + '</div></div>';
}

// ── Propostas ──
async function opPropostas(alvo, o, repinta) {
  const ps = await q(sb.from('crm_propostas').select('*').eq('oportunidade_id', o.id).order('versao', { ascending: false }));
  const total = (p) => soma(p.itens || [], (i) => i.valor);
  alvo.innerHTML = '<div class="titulo-pag" style="margin-bottom:8px"><div><b>Propostas</b> <span class="sub">' + ps.length + '</span></div>' +
    '<div class="acoes"><button class="btn btn-o btn-mini" id="pr-nova">+ Nova proposta</button></div></div>' +
    (ps.length ? '<div class="lista-ficha">' + ps.map((p) => '<div class="item-ficha"><div><b>v' + p.versao + ' — ' + esc(p.titulo || 'Proposta') + '</b> <span class="pill ' +
      ({ rascunho: 'neutro', enviada: 'aberto', aceita: 'pago', recusada: 'vencido' }[p.status]) + '">' + p.status + '</span><div class="sub">' + brl(total(p)) +
      (p.validade ? ' · válida até ' + dataBR(p.validade) : '') + (p.enviada_em ? ' · enviada em ' + dataBR(p.enviada_em) : '') + '</div></div>' +
      '<button class="btn btn-o btn-mini" data-pr="' + p.id + '">Abrir</button></div>').join('') + '</div>' : vazio('Nenhuma proposta ainda — comece por um modelo pronto.', '+ Nova proposta', '#pr-nova'));
  alvo.querySelector('#pr-nova').onclick = () => novaProposta(o, ps, repinta);
  alvo.querySelectorAll('[data-pr]').forEach((b) => b.onclick = () => editorProposta(o, ps.find((p) => p.id === b.dataset.pr), repinta));
}
async function novaProposta(o, ps, repinta) {
  const ms = await q(sb.from('crm_modelos_proposta').select('*').order('nome'));
  const j = abrirJanela({ titulo: 'Nova proposta — escolha o modelo',
    corpo: '<div class="lista-ficha">' + ms.map((m) => '<div class="item-ficha clicavel" data-mod="' + m.id + '"><b>' + esc(m.nome) + '</b><span class="sub">' + (m.itens || []).length + ' item(ns)</span></div>').join('') +
      (ps.length ? '<div class="item-ficha clicavel" data-mod="copia"><b>Copiar a última versão (v' + ps[0].versao + ')</b></div>' : '') +
      '<div class="item-ficha clicavel" data-mod=""><b>Em branco</b></div></div>' });
  j.querySelectorAll('[data-mod]').forEach((d) => d.onclick = () => {
    fecharJanela(j);
    const m = ms.find((x) => x.id === d.dataset.mod), ult = ps[0];
    const base = d.dataset.mod === 'copia' ? { titulo: ult.titulo, texto: ult.texto, itens: ult.itens } : m ? { titulo: m.nome, texto: m.texto, itens: m.itens } : { titulo: 'Proposta de honorários', texto: '<p>Prezado(a) {cliente},</p><p></p>', itens: [] };
    editorProposta(o, Object.assign({ versao: (ult ? ult.versao : 0) + 1, validade: somarDias(hojeISO(), 15), status: 'rascunho' }, base), repinta);
  });
}
function htmlProposta(o, p) {
  const cli = nomeOp(o), total = soma(p.itens || [], (i) => i.valor);
  const texto = String(p.texto || '').split('{cliente}').join(esc(cli)).split('{validade}').join(p.validade ? dataBR(p.validade) : '—')
    .split('{valor}').join(brl(total)).split('{parcelas}').join('');
  return '<div style="font-family:Arial,Helvetica,sans-serif;color:#1F2937;max-width:720px;margin:0 auto;font-size:14px;line-height:1.6">' +
    '<div style="border-bottom:3px solid #C9A84C;padding-bottom:10px;margin-bottom:18px"><div style="color:#1B2A4A;font-size:20px;font-weight:bold">Araújo &amp; Castro</div>' +
    '<div style="color:#6B7280;font-size:11px;letter-spacing:.12em;text-transform:uppercase">Advocacia e Consultoria</div></div>' +
    '<h2 style="color:#1B2A4A;font-size:18px;margin:0 0 4px">' + esc(p.titulo || 'Proposta de honorários') + '</h2>' +
    '<div style="color:#6B7280;font-size:12px;margin-bottom:16px">Para: ' + esc(cli) + ' · ' + dataBR(hojeISO()) + ' · versão ' + p.versao + '</div>' + texto +
    ((p.itens || []).length ? '<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px"><thead><tr style="background:#1B2A4A;color:#fff">' +
      '<th style="text-align:left;padding:8px">Serviço</th><th style="text-align:left;padding:8px">Forma de pagamento</th><th style="text-align:right;padding:8px">Valor</th></tr></thead><tbody>' +
      p.itens.map((i) => '<tr><td style="padding:8px;border-bottom:1px solid #E5E7EB">' + esc(i.servico) + '</td><td style="padding:8px;border-bottom:1px solid #E5E7EB">' + esc(i.forma || '') +
        '</td><td style="padding:8px;border-bottom:1px solid #E5E7EB;text-align:right;white-space:nowrap">' + brl(i.valor) + '</td></tr>').join('') +
      '<tr><td colspan="2" style="padding:8px;font-weight:bold">Total</td><td style="padding:8px;text-align:right;font-weight:bold;white-space:nowrap">' + brl(total) + '</td></tr></tbody></table>' : '') +
    (p.validade ? '<p style="color:#6B7280;font-size:12px">Proposta válida até ' + dataBR(p.validade) + '.</p>' : '') +
    '<div style="margin-top:40px;display:flex;gap:40px"><div style="flex:1;border-top:1px solid #9CA3AF;padding-top:6px;font-size:12px;color:#6B7280">Araújo &amp; Castro Advocacia</div>' +
    '<div style="flex:1;border-top:1px solid #9CA3AF;padding-top:6px;font-size:12px;color:#6B7280">De acordo — ' + esc(cli) + '</div></div></div>';
}
function limparHtml(h) {   // o texto da proposta vai por e-mail: nada de script nem atributos de evento
  const d = document.createElement('div'); d.innerHTML = h;
  d.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach((x) => x.remove());
  d.querySelectorAll('*').forEach((x) => [...x.attributes].forEach((a) => { if (/^on/i.test(a.name) || /javascript:/i.test(a.value)) x.removeAttribute(a.name); }));
  return d.innerHTML;
}
function editorProposta(o, p, repinta) {
  let itens = (p.itens || []).map((i) => Object.assign({}, i));
  const j = abrirJanela({ titulo: 'Proposta v' + p.versao + ' — ' + nomeOp(o), larga: true,
    corpo: '<form id="f-pr" class="grade">' + campo('Título', '<input name="titulo" value="' + esc(p.titulo || '') + '">') +
      campo('Válida até', '<input name="validade" type="date" value="' + esc(p.validade || '') + '">') +
      '<div class="inteiro"><div class="secao">Texto <span class="sub">— clique e edite; {cliente} e {validade} são trocados sozinhos</span></div>' +
      '<div class="pr-texto" id="pr-texto" contenteditable="true">' + (p.texto || '') + '</div></div>' +
      '<div class="inteiro"><div class="secao">Valores</div><div id="pr-itens"></div><button type="button" class="btn btn-o btn-mini" id="pr-add">+ Item</button></div></form>',
    rodape: '<div class="acoes"><button class="btn btn-o" type="button" id="pr-pdf">Ver / salvar PDF</button><button class="btn btn-o" type="button" id="pr-guardar">Guardar nos Documentos</button>' +
      '<button class="btn btn-o" type="button" id="pr-email">Enviar por e-mail</button>' + (o.prospecto_telefone ? '<button class="btn btn-o" type="button" id="pr-zap">WhatsApp</button>' : '') + '</div>' +
      '<div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Fechar</button><button class="btn btn-p" type="button" id="pr-salvar">Salvar</button></div>' });
  const f = j.querySelector('#f-pr');
  const pintarItens = () => {
    j.querySelector('#pr-itens').innerHTML = itens.map((i, k) => '<div class="pr-item"><input data-k="' + k + '" data-c="servico" placeholder="Serviço" value="' + esc(i.servico || '') + '">' +
      '<input data-k="' + k + '" data-c="forma" placeholder="Forma de pagamento" value="' + esc(i.forma || '') + '">' +
      '<input data-k="' + k + '" data-c="valor" inputmode="decimal" placeholder="0,00" value="' + (i.valor ? valorParaCampo(i.valor) : '') + '"><button type="button" class="btn-etq" data-x="' + k + '">×</button></div>').join('') +
      '<div class="sub" style="margin:6px 0">Total: <b>' + brl(soma(itens, (i) => i.valor)) + '</b></div>';
    j.querySelectorAll('#pr-itens input').forEach((inp) => inp.onchange = () => { const v = inp.dataset.c === 'valor' ? (lerValor(inp.value) || 0) : inp.value; itens[+inp.dataset.k][inp.dataset.c] = v; pintarItens(); });
    j.querySelectorAll('#pr-itens [data-x]').forEach((b) => b.onclick = () => { itens.splice(+b.dataset.x, 1); pintarItens(); });
  };
  pintarItens();
  j.querySelector('#pr-add').onclick = () => { itens.push({ servico: '', forma: '', valor: 0 }); pintarItens(); };
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  const atual = () => Object.assign({}, p, { titulo: f.titulo.value.trim(), validade: f.validade.value || null, texto: limparHtml(j.querySelector('#pr-texto').innerHTML), itens });
  const salvar = async () => {
    const d = atual(), dados = { oportunidade_id: o.id, versao: d.versao, titulo: d.titulo, validade: d.validade, texto: d.texto, itens: d.itens };
    if (p.id) await q(sb.from('crm_propostas').update(dados).eq('id', p.id)); else { const n = await q(sb.from('crm_propostas').insert(dados).select().single()); p.id = n.id; p.status = n.status; }
    return d;
  };
  j.querySelector('#pr-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => { await salvar(); aviso('✓ Proposta salva.'); fecharJanela(j); await repinta(); });
  j.querySelector('#pr-pdf').onclick = () => {
    const d = atual(), w = window.open('', '_blank');
    if (!w) return aviso('O navegador bloqueou a janela da proposta. Libere pop-ups para este site.', true);
    const nome = ('Proposta ' + nomeOp(o) + ' v' + d.versao).replace(/[\\/:*?"<>|]/g, '-');
    w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + esc(nome) + '</title><style>@page{size:A4;margin:16mm}@media print{.no-print{display:none}}</style></head><body>' +
      '<div class="no-print" style="position:sticky;top:0;background:#1B2A4A;padding:10px;text-align:center"><button id="imprimir" style="background:#C9A84C;border:0;border-radius:8px;padding:8px 16px;font-weight:bold;cursor:pointer">Salvar em PDF / Imprimir</button></div>' +
      htmlProposta(o, d) + '</body></html>');
    w.document.close();
    const b = w.document.getElementById('imprimir'); if (b) b.onclick = () => w.print();
  };
  j.querySelector('#pr-guardar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const d = await salvar();
    const html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Proposta</title></head><body>' + htmlProposta(o, d) + '</body></html>';
    const arq = new File([html], ('Proposta ' + nomeOp(o) + ' v' + d.versao).replace(/[\\/:*?"<>|]/g, '-') + '.html', { type: 'text/html' });
    const doc = await enviarDocumento(arq, { oportunidade_id: o.id, cliente_id: o.cliente_id || undefined, tipo: 'proposta' }, { validade: d.validade || null });
    await q(sb.from('crm_propostas').update({ documento_id: doc.id }).eq('id', p.id));
    aviso('✓ Proposta guardada nos Documentos da oportunidade.');
  });
  j.querySelector('#pr-email').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const d = await salvar();
    const para = prompt('Enviar a proposta para qual e-mail?', o.prospecto_email || (o.cliente_id && (E.clientes.find((c) => c.id === o.cliente_id) || {}).email) || '');
    if (!para) return;
    await q(sb.rpc('crm_enviar_proposta', { p_proposta: p.id, p_para: para.trim(), p_html: htmlProposta(o, d) }));
    aviso('✓ Proposta na fila de e-mails para ' + para.trim() + ' (sai em até 5 minutos).'); fecharJanela(j); await repinta();
  });
  const zap = j.querySelector('#pr-zap');
  if (zap) zap.onclick = () => {
    const d = atual(), tel = soDigitos(o.prospecto_telefone);
    const msg = 'Olá, ' + (o.prospecto_nome || nomeOp(o)).split(' ')[0] + '! Segue a proposta "' + (d.titulo || 'Proposta') + '": total de ' + brl(soma(d.itens, (i) => i.valor)) +
      (d.validade ? ', válida até ' + dataBR(d.validade) : '') + '. Envio o documento completo por e-mail. — Araújo & Castro';
    window.open('https://wa.me/' + (tel.length <= 11 ? '55' : '') + tel + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
  };
}

// ── Ganhou / Perdeu ──
function janelaGanhar(o, depois) {
  const cli = o.cliente_id ? E.clientes.find((c) => c.id === o.cliente_id) : null;
  const j = abrirJanela({ titulo: '✓ Ganhou — ' + o.titulo, larga: true,
    corpo: '<p class="sub" style="margin-bottom:10px">Confira os dados. Ao confirmar, o sistema cria ' + (cli ? '' : 'o <b>cliente</b>, ') + 'o <b>contrato</b> com as <b>parcelas</b>, o <b>fluxo de onboarding</b> e registra na linha do tempo.</p>' +
      '<form id="f-gan" class="grade">' +
      (cli ? '<div class="inteiro dica">Cliente: <b>' + esc(cli.nome) + '</b></div>' :
        campo('Nome do cliente <span class="obrig">*</span>', '<input name="cliente_nome" value="' + esc(o.prospecto_empresa || o.prospecto_nome || '') + '">') +
        campo('CPF/CNPJ', '<input name="cpf_cnpj" value="' + esc(o.prospecto_doc || '') + '">') + campo('E-mail', '<input name="email" value="' + esc(o.prospecto_email || '') + '">') +
        campo('Telefone', '<input name="telefone" value="' + esc(o.prospecto_telefone || '') + '">') +
        campo('Grupo', '<input name="grupo" list="gan-grupos" value="' + esc(o.prospecto_empresa || o.prospecto_nome || '') + '">' + datalistGrupos('gan-grupos'))) +
      '<div class="inteiro secao">Contrato</div>' +
      campo('Descrição do serviço', '<input name="descricao" value="' + esc(o.titulo) + '">', 'inteiro') +
      campo('Valor total (R$)', '<input name="valor_total" inputmode="decimal" value="' + (o.valor_estimado ? valorParaCampo(o.valor_estimado) : '') + '">') +
      campo('Número de parcelas', '<input name="num_parcelas" type="number" min="1" max="120" value="1">') +
      campo('1º vencimento', '<input name="primeiro_vencimento" type="date" value="' + somarDias(hojeISO(), 10) + '">') +
      campo('% de êxito (se houver)', '<input name="percentual_exito" inputmode="decimal">') +
      campo('Responsável', '<input name="responsavel" list="gan-pessoas" value="' + esc(o.responsavel || '') + '">' + datalistPessoas('gan-pessoas')) +
      '<label class="check inteiro"><input type="checkbox" name="criar_fluxo" checked> Criar o fluxo "Onboarding de cliente" (tarefas com prazos em dias úteis)</label></form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-v" type="button" id="btn-ganhar">Confirmar — Ganhou</button></div>' });
  const f = j.querySelector('#f-gan');
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-ganhar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const valor = f.valor_total.value.trim() ? lerValor(f.valor_total.value) : 0;
    if (Number.isNaN(valor)) throw new Error('Valor inválido.');
    const p = { cliente_id: o.cliente_id || '', descricao: f.descricao.value.trim(), valor_total: valor, num_parcelas: parseInt(f.num_parcelas.value, 10) || 1,
      primeiro_vencimento: f.primeiro_vencimento.value || '', percentual_exito: f.percentual_exito.value ? String(lerValor(f.percentual_exito.value)) : '',
      responsavel: f.responsavel.value.trim(), criar_fluxo: f.criar_fluxo.checked };
    if (!cli) Object.assign(p, { cliente_nome: f.cliente_nome.value.trim(), cpf_cnpj: soDigitos(f.cpf_cnpj.value), email: f.email.value.trim(), telefone: f.telefone.value.trim(), grupo: f.grupo.value.trim() });
    if (!cli && !p.cliente_nome) throw new Error('Informe o nome do cliente.');
    const r = await q(sb.rpc('crm_ganhar', { p_op: o.id, p }));
    aviso('✓ Contrato fechado! Cliente, contrato' + (valor ? ', parcelas' : '') + (p.criar_fluxo ? ' e onboarding' : '') + ' criados.');
    fecharJanela(j); if (depois) depois(r);
    await carregarCadastros(true); await recarregarCrm();
  });
}
function janelaPerder(o, depois) {
  const MOTIVOS = ['Preço', 'Fechou com outro escritório', 'Desistiu / resolveu sozinho', 'Sem retorno do contato', 'Fora do nosso escopo', 'Outro'];
  const j = abrirJanela({ titulo: 'Perdeu — ' + o.titulo,
    corpo: '<form id="f-per" class="grade">' + campo('Motivo <span class="obrig">*</span>', '<input name="motivo" list="per-motivos"><datalist id="per-motivos">' + MOTIVOS.map((m) => '<option value="' + m + '">').join('') + '</datalist>', 'inteiro') +
      '<label class="check inteiro"><input type="checkbox" name="reativar"> Criar tarefa para retomar o contato daqui a 6 meses</label></form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-x" type="button" id="btn-perder">Confirmar perda</button></div>' });
  const f = j.querySelector('#f-per');
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-perder').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    await q(sb.rpc('crm_perder', { p_op: o.id, p_motivo: f.motivo.value.trim(), p_reativar: f.reativar.checked }));
    aviso('✓ Oportunidade marcada como perdida.'); fecharJanela(j); if (depois) depois(); await recarregarCrm();
  });
}

// ── Modelos de proposta ──
async function janelaModelosProposta() {
  const ms = await q(sb.from('crm_modelos_proposta').select('*').order('nome'));
  const j = abrirJanela({ titulo: 'Modelos de proposta', larga: true,
    corpo: '<div class="lista-ficha">' + ms.map((m) => '<div class="item-ficha"><div><b>' + esc(m.nome) + '</b><div class="sub">' + (m.itens || []).map((i) => esc(i.servico)).join(' · ') + '</div></div>' +
      '<button class="btn btn-o btn-mini" data-mp="' + m.id + '">Editar</button></div>').join('') + '</div>',
    rodape: '<span></span><button class="btn btn-p" type="button" id="mp-novo">+ Novo modelo</button>' });
  const editar = (m) => {
    m = m || { nome: '', texto: '<p>Prezado(a) {cliente},</p><p></p><p>Esta proposta vale até {validade}.</p>', itens: [] };
    const k = abrirJanela({ titulo: m.id ? 'Editar modelo' : 'Novo modelo', larga: true,
      corpo: '<form class="grade" id="f-mp">' + campo('Nome', '<input name="nome" value="' + esc(m.nome) + '">', 'inteiro') +
        '<div class="inteiro"><div class="secao">Texto</div><div class="pr-texto" id="mp-texto" contenteditable="true">' + m.texto + '</div></div>' +
        campo('Itens (um por linha: serviço ; forma de pagamento ; valor)', '<textarea name="itens" rows="5">' + esc((m.itens || []).map((i) => [i.servico, i.forma || '', i.valor ? valorParaCampo(i.valor) : ''].join(' ; ')).join('\n')) + '</textarea>', 'inteiro') + '</form>',
      rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="mp-salvar">Salvar</button></div>' });
    const f = k.querySelector('#f-mp');
    k.querySelector('[data-cancelar]').onclick = () => fecharJanela(k);
    k.querySelector('#mp-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
      if (!f.nome.value.trim()) throw new Error('Dê um nome ao modelo.');
      const itens = f.itens.value.split('\n').map((l) => l.split(';').map((x) => x.trim())).filter((x) => x[0]).map(([servico, forma, valor]) => ({ servico, forma: forma || '', valor: lerValor(valor || '') || 0 }));
      const d = { nome: f.nome.value.trim(), texto: limparHtml(k.querySelector('#mp-texto').innerHTML), itens };
      if (m.id) await q(sb.from('crm_modelos_proposta').update(d).eq('id', m.id)); else await q(sb.from('crm_modelos_proposta').insert(d));
      aviso('✓ Modelo salvo.'); fecharJanela(k); fecharJanela(j); janelaModelosProposta();
    });
  };
  j.querySelector('#mp-novo').onclick = () => editar();
  j.querySelectorAll('[data-mp]').forEach((b) => b.onclick = () => editar(ms.find((m) => m.id === b.dataset.mp)));
}

'use strict';
// ═══════════════════════════════════════════════════════════════════
// Publicações — Diário de Justiça Eletrônico Nacional (API pública do CNJ).
// A função "erp-publicacoes" busca pelas OABs cadastradas (7h e 13h, dias
// úteis, ou pelo botão "Buscar agora"); aqui a equipe lê, cria a tarefa com
// prazo sugerido em dias úteis e marca como tratada.
// ═══════════════════════════════════════════════════════════════════
const PALAVRAS_PUB = ['intimação', 'intimada', 'intimado', 'prazo', 'sentença', 'audiência', 'citação', 'citado', 'citada', 'decisão', 'penhora', 'bloqueio'];
// prazo sugerido (dias úteis) pelo tipo/texto; sempre editável na tarefa
function prazoSugerido(p) {
  const t = normalizar(p.tipo + ' ' + p.texto);
  const m = /prazo de (\d{1,3}) \(?[a-z]*\)? ?dias/.exec(t) || /prazo de (\d{1,3}) dias/.exec(t);
  if (m) return Math.min(90, +m[1]);
  if (/audiencia/.test(t)) return 5;
  if (/sentenca|acordao/.test(t)) return 15;
  if (/citacao|citad/.test(t)) return 15;
  if (/intima/.test(t)) return 15;
  if (/despacho/.test(t)) return 5;
  return 5;
}
function somarUteis(isoStr, n, fer) {
  let d = isoStr;
  for (let i = 0; i < n; i++) { d = somarDias(d, 1); while (!diaUtil(d, fer)) d = somarDias(d, 1); }
  return d;
}
function destacar(texto) {
  let h = esc(texto);
  PALAVRAS_PUB.forEach((w) => { h = h.replace(new RegExp('(' + w + ')', 'gi'), '<mark>$1</mark>'); });
  return h;
}

TELAS.publicacoes = async function () {
  E.pub = E.pub || { status: 'nova', adv: '', tribunal: '', dias: '30', busca: '' };
  const F = E.pub;
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Publicações</h1><p id="pub-ult">Diário de Justiça Eletrônico Nacional · busca automática às 7h e 13h (dias úteis)</p></div>' +
    '<div class="acoes"><button class="btn btn-o" id="pub-oabs">OABs monitoradas</button><button class="btn btn-p" id="pub-buscar">↻ Buscar agora</button></div></div>' +
    '<div class="filtros"><div class="segmento" id="pub-st">' + [['nova', 'Novas'], ['lida', 'Lidas'], ['tratada', 'Tratadas'], ['descartada', 'Descartadas'], ['', 'Todas']].map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<select class="busca sel" id="pub-dias"><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="">Todo o período</option></select>' +
    '<select class="busca sel" id="pub-adv"><option value="">Todos os advogados</option></select><select class="busca sel" id="pub-trib"><option value="">Todos os tribunais</option></select>' +
    '<input class="busca" id="pub-busca" placeholder="Buscar no texto, processo ou parte" autocomplete="off"></div><div id="pub-corpo"><div class="carregando">Carregando…</div></div>';
  $('pub-oabs').onclick = () => janelaOabs();
  $('pub-buscar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const data = await chamarFuncao('erp-publicacoes', {});
    if (!data.oabs) throw new Error('Cadastre pelo menos uma OAB em "OABs monitoradas".');
    aviso('✓ Busca feita: ' + data.lidas + ' publicação(ões) lida(s), ' + data.novas + ' nova(s).' + (data.erros && data.erros.length ? ' Atenção: ' + data.erros[0] : ''));
    await TELAS.publicacoes();
  });
  $('pub-st').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.status = b.dataset.v; pintarPublicacoes(); } };
  [['pub-dias', 'dias'], ['pub-adv', 'adv'], ['pub-trib', 'tribunal']].forEach(([id, k]) => { $(id).onchange = (ev) => { F[k] = ev.target.value; if (k === 'dias') carregarPublicacoes(); else pintarPublicacoes(); }; });
  $('pub-dias').value = F.dias; $('pub-busca').value = F.busca;
  let t; $('pub-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; pintarPublicacoes(); }, 250); };
  q(sb.from('configuracoes').select('valor').eq('chave', 'publicacoes_ultima').maybeSingle()).then((u) => {
    if (u && u.valor && $('pub-ult')) $('pub-ult').textContent = 'Última busca: ' + quandoRodou(u.valor.quando) + ' · ' + u.valor.novas + ' nova(s) de ' + u.valor.lidas + ' lida(s)' +
      (u.valor.erros && u.valor.erros.length ? ' · ⚠ ' + u.valor.erros[0] : '') + ' · automática às 7h e 13h (dias úteis)';
  }).catch(() => {});
  await carregarPublicacoes();
};
async function carregarPublicacoes() {
  const F = E.pub;
  E._pubs = await buscarTodos(() => { let c = sb.from('publicacoes').select('id, data_disponibilizacao, tribunal, orgao, tipo, processo, processo_numero, classe, texto, link, destinatarios, advogados, oab_numero, oab_uf, advogado, processo_id, status, tarefa_id')
    .order('data_disponibilizacao', { ascending: false, nullsFirst: false }); if (F.dias) c = c.gte('data_disponibilizacao', somarDias(hojeISO(), -Number(F.dias))); return c; });
  const opts = (id, vals, rot) => { const s = $(id); if (!s) return; const v = s.value; s.innerHTML = '<option value="">' + rot + '</option>' + [...new Set(vals.filter(Boolean))].sort().map((x) => '<option>' + esc(x) + '</option>').join(''); s.value = v; };
  opts('pub-adv', E._pubs.map((p) => p.advogado), 'Todos os advogados'); opts('pub-trib', E._pubs.map((p) => p.tribunal), 'Todos os tribunais');
  pintarPublicacoes();
}
function pintarPublicacoes() {
  const F = E.pub, b = normalizar(F.busca);
  if (!$('pub-corpo')) return;
  document.querySelectorAll('#pub-st button').forEach((x) => x.classList.toggle('ativo', x.dataset.v === F.status));
  const todas = E._pubs || [];
  const lista = todas.filter((p) => (!F.status || p.status === F.status) && (!F.adv || p.advogado === F.adv) && (!F.tribunal || p.tribunal === F.tribunal) &&
    (!b || normalizar(p.texto + ' ' + p.processo + ' ' + p.destinatarios + ' ' + p.orgao).includes(b)));
  const conta = (s) => todas.filter((p) => p.status === s).length;
  $('pub-corpo').innerHTML = '<div class="kpis">' + kpi('Novas', String(conta('nova')), conta('nova') ? 'ambar' : 'verde', 'ainda não lidas') + kpi('Lidas', String(conta('lida')), '', 'sem tarefa ainda') +
    kpi('Tratadas', String(conta('tratada')), 'verde', 'com tarefa criada') + '</div>' +
    (lista.length ? lista.map((p) => '<div class="card pub-card' + (p.status === 'nova' ? ' pub-nova' : '') + '" data-pub="' + p.id + '"><div class="card-bd">' +
      '<div class="pub-topo"><div><span class="pill ' + ({ nova: 'hoje', lida: 'aberto', tratada: 'pago', descartada: 'neutro' }[p.status]) + '">' + p.status + '</span> ' +
      '<b>' + esc(p.tipo || 'Comunicação') + '</b> · ' + esc(p.tribunal) + ' · <span class="mono">' + dataBR(p.data_disponibilizacao) + '</span>' +
      '<div class="sub">' + esc(p.orgao) + (p.classe ? ' · ' + esc(p.classe) : '') + '</div></div>' +
      '<div class="sub" style="text-align:right">' + (p.processo ? '<b class="mono">' + esc(p.processo) + '</b>' : '') + (p.processo_id ? ' <span class="pill pago" title="Processo cadastrado no ERP">no ERP</span>' : '') +
      '<div>' + esc(p.advogado ? p.advogado + ' · ' : '') + 'OAB ' + esc(p.oab_numero + '/' + p.oab_uf) + '</div></div></div>' +
      (p.destinatarios ? '<div class="sub" style="margin:6px 0">Partes: ' + esc(p.destinatarios) + '</div>' : '') +
      '<div class="pub-texto' + (p.texto.length > 500 ? ' curto' : '') + '">' + destacar(p.texto) + '</div>' + (p.texto.length > 500 ? '<button class="btn-link" data-ver>ver tudo</button>' : '') +
      '<div class="acoes" style="margin-top:10px">' + (p.tarefa_id || p.status === 'tratada' ? '' : '<button class="btn btn-p btn-mini" data-tarefa="' + p.id + '">+ Criar tarefa (' + prazoSugerido(p) + ' dias úteis)</button>') +
      (p.status === 'nova' ? '<button class="btn btn-o btn-mini" data-st="lida">Marcar lida</button>' : '') +
      (p.status !== 'tratada' ? '<button class="btn btn-o btn-mini" data-st="tratada">Tratada</button>' : '') +
      (p.status !== 'descartada' ? '<button class="btn btn-o btn-mini" data-st="descartada">Descartar</button>' : '<button class="btn btn-o btn-mini" data-st="nova">Voltar para novas</button>') +
      (p.link && /^https?:/.test(p.link) ? '<a class="btn btn-o btn-mini" href="' + esc(p.link) + '" target="_blank" rel="noopener">Abrir no Diário</a>' : '') + '</div></div></div>').join('')
      : '<div class="card">' + (todas.length ? vazio('Nenhuma publicação neste recorte — mude o filtro.') : vazio('Nenhuma publicação ainda. Cadastre as OABs do escritório e o sistema busca no Diário todo dia.', 'OABs monitoradas', '#pub-oabs')) + '</div>');
  $('pub-corpo').querySelectorAll('[data-ver]').forEach((b2) => b2.onclick = () => { b2.previousElementSibling.classList.remove('curto'); b2.remove(); });
  $('pub-corpo').querySelectorAll('[data-st]').forEach((b2) => b2.onclick = () => comBotao(b2, async () => {
    const id = b2.closest('[data-pub]').dataset.pub;
    await q(sb.from('publicacoes').update({ status: b2.dataset.st }).eq('id', id));
    const p = E._pubs.find((x) => x.id === id); if (p) p.status = b2.dataset.st;
    pintarPublicacoes();
  }));
  $('pub-corpo').querySelectorAll('[data-tarefa]').forEach((b2) => b2.onclick = () => comBotao(b2, async () => {
    const p = E._pubs.find((x) => x.id === b2.dataset.tarefa), fer = await feriados();
    const proc = p.processo_id ? await q(sb.from('processos').select('grupo_id, advogado').eq('id', p.processo_id).maybeSingle()).catch(() => null) : null;
    const prazo = somarUteis(p.data_disponibilizacao || hojeISO(), prazoSugerido(p), fer);
    const titulo = 'Analisar ' + (p.tipo || 'publicação').toLowerCase() + ' — ' + (p.processo || p.tribunal);
    formTarefa({ titulo, prazo, prazo_fatal: prazo, responsavel: p.advogado || (proc && proc.advogado) || '', grupo_id: proc && proc.grupo_id, processos_vinculados: p.processo,
      prioridade: 'alta', descricao: p.tribunal + ' · ' + (p.orgao || '') + '\n' + p.texto.slice(0, 1500), inicio: hojeISO() }, async () => {
      const t = (await q(sb.from('tarefas').select('id').eq('titulo', titulo).order('criado_em', { ascending: false }).limit(1)))[0];
      await q(sb.from('publicacoes').update({ status: 'tratada', tarefa_id: t ? t.id : null }).eq('id', p.id));
      await carregarPublicacoes();
    });
  }));
}
async function janelaOabs() {
  const os = await q(sb.from('oabs_monitoradas').select('*').order('numero'));
  const j = abrirJanela({ titulo: 'OABs monitoradas',
    corpo: '<p class="sub" style="margin-bottom:10px">O sistema busca no Diário de Justiça Eletrônico Nacional as publicações destas OABs.</p>' +
      '<div class="lista-ficha">' + (os.map((o) => '<div class="item-ficha"><div><b>OAB ' + esc(o.numero) + '/' + esc(o.uf) + '</b> <span class="sub">' + esc(o.advogado || '') + '</span>' + (o.ativo ? '' : ' <span class="pill neutro">pausada</span>') + '</div>' +
        '<span><button class="btn btn-o btn-mini" data-oab-at="' + o.id + '">' + (o.ativo ? 'Pausar' : 'Ativar') + '</button> <button class="btn btn-x btn-mini" data-oab-x="' + o.id + '">Excluir</button></span></div>').join('') || '<div class="sub">Nenhuma OAB cadastrada.</div>') + '</div>' +
      '<form class="grade" id="f-oab" style="margin-top:12px">' + campo('Número da OAB', '<input name="numero" inputmode="numeric" placeholder="123456">') + campo('UF', '<input name="uf" maxlength="2" value="MG">') +
      campo('Advogado(a)', '<input name="advogado" list="oab-pessoas" placeholder="quem recebe o aviso">' + datalistPessoas('oab-pessoas'), 'inteiro') + '</form>',
    rodape: '<span></span><button class="btn btn-p" type="button" id="btn-add-oab">+ Incluir OAB</button>' });
  const f = j.querySelector('#f-oab');
  j.querySelector('#btn-add-oab').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const numero = soDigitos(f.numero.value), uf = f.uf.value.trim().toUpperCase();
    if (!numero || !/^[A-Z]{2}$/.test(uf)) throw new Error('Informe o número da OAB e a UF (2 letras).');
    await q(sb.from('oabs_monitoradas').insert({ numero, uf, advogado: f.advogado.value.trim() }));
    aviso('✓ OAB incluída.'); fecharJanela(j); janelaOabs();
  });
  j.querySelectorAll('[data-oab-at]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const o = os.find((x) => x.id === b.dataset.oabAt);
    await q(sb.from('oabs_monitoradas').update({ ativo: !o.ativo }).eq('id', o.id)); fecharJanela(j); janelaOabs();
  }));
  j.querySelectorAll('[data-oab-x]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    if (!confirm('Excluir esta OAB da busca?')) return;
    await excluir('oabs_monitoradas', b.dataset.oabX); fecharJanela(j); janelaOabs();
  }));
}

'use strict';
// ═══════════════════════════════════════════════════════════════════
// Acordos — detalhe da parcela (clicar na linha): o que é o acordo, todas as
// parcelas do mesmo processo (pagas, a pagar, vencidas), o processo ligado e
// as ações (baixa, editar, lembrar o cliente). Acordo é dívida do CLIENTE com
// terceiros: nada aqui entra no financeiro do escritório.
// ═══════════════════════════════════════════════════════════════════
async function detalheAcordo(id) {
  const a = await q(sb.from('acordos').select('*').eq('id', id).single());
  const [irmas, proc, cli] = await Promise.all([
    q(sb.from('acordos').select('*').eq('processo', a.processo).order('vencimento')),
    q(sb.from('processos').select('id, numero, natureza, autor, reu, status, advogado, competencia').eq('numero', a.processo).maybeSingle()).catch(() => null),
    a.grupo_id ? q(sb.from('clientes').select('id, nome, telefone, email, responsavel').eq('grupo_id', a.grupo_id).order('nome')).catch(() => []) : []
  ]);
  const h = hojeISO();
  const sit = (x) => x.pago ? ['pago', 'Pago' + (x.data_pagamento ? ' em ' + dataBR(x.data_pagamento) : '')] : x.vencimento && x.vencimento < h ? ['vencido', 'Vencida'] : x.vencimento === h ? ['hoje', 'Vence hoje'] : ['aberto', 'A pagar'];
  const pagas = irmas.filter((x) => x.pago), abertas = irmas.filter((x) => !x.pago), vencidas = abertas.filter((x) => x.vencimento && x.vencimento < h);
  const devedor = cli.find((c) => normalizar(c.nome) === normalizar(a.devedor)) || null;
  const tel = soDigitos((devedor && devedor.telefone) || '');
  const lin = (r, v) => v ? '<div class="dado"><span>' + r + '</span><b>' + v + '</b></div>' : '';
  const s = sit(a);
  const j = abrirJanela({ titulo: 'Acordo — parcela ' + (a.parcela || '?') + (a.total_parcelas ? '/' + a.total_parcelas : ''), larga: true,
    corpo:
      '<div class="ficha-topo"><div><div class="ficha-sub">Processo <b class="mono">' + esc(a.processo) + '</b>' + (a.grupo_id ? ' · ' + esc(nomeGrupo(a.grupo_id)) : '') + '</div>' +
      '<div class="ficha-selos"><span class="pill ' + s[0] + '">' + esc(s[1]) + '</span> <span class="mono"><b>' + brl(a.valor) + '</b></span> <span class="sub">vence ' + dataBR(a.vencimento) + '</span></div></div>' +
      '<div class="ficha-atalhos">' + (a.pago ? '' : '<button class="btn btn-v btn-mini" id="ac-baixa">✓ Marcar paga hoje</button>') +
      '<button class="btn btn-o btn-mini" id="ac-lembrar">+ Tarefa: lembrar o cliente</button>' +
      (tel ? '<a class="btn btn-o btn-mini" target="_blank" rel="noopener" href="https://wa.me/' + (tel.length <= 11 ? '55' : '') + tel + '?text=' +
        encodeURIComponent('Olá! Lembrete: a parcela ' + (a.parcela || '') + ' do acordo com ' + (a.credor || 'o credor') + ', de ' + brl(a.valor) + ', vence em ' + dataBR(a.vencimento) + '.') + '">WhatsApp</a>' : '') +
      '<button class="btn btn-p btn-mini" id="ac-editar">Editar</button></div></div>' +
      '<div class="dica" style="margin-bottom:12px">Acordo é uma <b>dívida do cliente com terceiros</b> (não é honorário do escritório): não entra no Financeiro.</div>' +
      '<div class="duas-col"><div class="dados">' + lin('Devedor (cliente)', esc(a.devedor)) + lin('Credor', esc(a.credor)) + lin('Responsável', esc(a.responsavel)) +
        lin('Parcela', esc((a.parcela || '—') + (a.total_parcelas ? ' de ' + a.total_parcelas : ''))) + lin('Valor', brl(a.valor)) + lin('Vencimento', dataBR(a.vencimento)) +
        lin('Aviso', esc(a.situacao && !/^(ok|pago|vencido)$/i.test(a.situacao) ? a.situacao : '')) + lin('PIX', esc(a.pix)) + lin('Banco', esc(a.banco)) + lin('Observação', esc(a.obs)) + '</div>' +
      '<div class="dados">' + (proc ? lin('Processo cadastrado', esc(proc.natureza || 'processo')) + lin('Partes', esc([proc.autor, proc.reu].filter(Boolean).join(' × '))) +
        lin('Situação do processo', esc(proc.status)) + lin('Advogado', esc(proc.advogado)) + lin('Competência', esc(proc.competencia)) : '<div class="sub">Este processo não está cadastrado em Jurídico → Processos.</div>') +
        (devedor ? lin('Contato do cliente', esc([devedor.telefone, devedor.email].filter(Boolean).join(' · '))) : '') + '</div></div>' +
      '<div class="kpis" style="margin-top:12px">' + kpi('Pago', brl(soma(pagas, (x) => x.valor)), 'verde', pagas.length + ' de ' + irmas.length + ' parcela(s)') +
        kpi('A pagar', brl(soma(abertas, (x) => x.valor)), '', abertas.length + ' parcela(s)') +
        kpi('Vencidas', brl(soma(vencidas, (x) => x.valor)), vencidas.length ? 'vermelho' : 'verde', vencidas.length + ' parcela(s)') + '</div>' +
      '<div class="secao" style="margin:8px 0">Todas as parcelas deste acordo</div>' +
      '<div class="tabela-wrap"><table><thead><tr><th>Parcela</th><th>Vencimento</th><th class="num">Valor</th><th>Situação</th></tr></thead><tbody>' +
      irmas.map((x) => { const t = sit(x); return '<tr' + (x.id === a.id ? ' class="linha-atual"' : '') + '><td>' + esc((x.parcela || '—') + (x.total_parcelas ? '/' + x.total_parcelas : '')) + '</td><td class="mono">' + dataBR(x.vencimento) +
        '</td><td class="num mono">' + brl(x.valor) + '</td><td><span class="pill ' + t[0] + '">' + esc(t[1]) + '</span></td></tr>'; }).join('') + '</tbody></table></div>' });
  j.querySelector('.janela').classList.add('ficha');
  const b = j.querySelector('#ac-baixa');
  if (b) b.onclick = () => comBotao(b, async () => {
    await q(sb.from('acordos').update({ pago: true, data_pagamento: hojeISO() }).eq('id', id));
    aviso('✓ Parcela do acordo marcada como paga.'); fecharJanela(j); await recarregar(); detalheAcordo(id);
  });
  j.querySelector('#ac-editar').onclick = () => { fecharJanela(j); if (window.ERP_EDITAR) window.ERP_EDITAR('acordos:' + id); };
  j.querySelector('#ac-lembrar').onclick = () => formTarefa({ titulo: 'Lembrar ' + (a.devedor || 'o cliente') + ' da parcela ' + (a.parcela || '') + ' do acordo com ' + (a.credor || 'o credor'),
    prazo: a.vencimento && a.vencimento > h ? somarDias(a.vencimento, -2) : h, responsavel: a.responsavel, grupo_id: a.grupo_id, processos_vinculados: a.processo,
    descricao: 'Valor ' + brl(a.valor) + ' · vencimento ' + dataBR(a.vencimento) }, async () => {});
}

'use strict';
// ═══════════════════════════════════════════════════════════════════
// Alertas — um painel com o que precisa de atenção em cada setor
// (cadastro, jurídico, financeiro, documentos, tarefas e rotinas
// automáticas). Cada cartão abre o relatório com a lista e o CSV.
// Mostra só o que a pessoa tem permissão de ver (as regras do banco valem).
// ═══════════════════════════════════════════════════════════════════
const PROVEDORES_CNPJ = [['brasilapi', 'BrasilAPI (grátis, sem chave — recomendado)'], ['receitaws', 'ReceitaWS (grátis: 3 por minuto; com token, sem limite)'], ['cnpja', 'CNPJá (open.cnpja.com, grátis com limite)']];

TELAS.alertas = async function () {
  await carregarCadastros();
  $('conteudo').innerHTML = '<div class="titulo-pag"><div><h1>Alertas</h1><p>O que precisa de atenção em cada setor · clique num cartão para ver o relatório</p></div>' +
    '<div class="acoes"><button class="btn btn-o" id="al-atualizar">↻ Atualizar</button></div></div><div id="al-corpo"><div class="carregando">Montando os alertas…</div></div>';
  $('al-atualizar').onclick = () => TELAS.alertas();
  const h = hojeISO(), nada = () => [];
  const podeJur = pode('juridico'), podeFin = pode('financeiro_juridico') || pode('financeiro_contab');
  const [pubs, parcelas, acordos, procs, lancs, contratos, certs, docs, tarefas, cnpj, emails, ultPub, ultReg, contatos] = await Promise.all([
    podeJur ? q(sb.from('publicacoes').select('id, tipo, processo, tribunal, data_disponibilizacao, advogado').eq('status', 'nova')).catch(nada) : [],
    podeJur ? buscarTodos(() => sb.from('parcelas').select('id, numero, vencimento, parcelamentos(empresa, natureza, grupo_id)').eq('pago', false).lt('vencimento', h)).catch(nada) : [],
    podeJur ? q(sb.from('acordos').select('id, processo, devedor, credor, parcela, valor, vencimento, grupo_id').eq('pago', false).lt('vencimento', h)).catch(nada) : [],
    podeJur ? buscarTodos(() => sb.from('processos').select('id, numero, natureza, grupo_id, valor')).catch(nada) : [],
    podeFin ? buscarTodos(() => sb.from('lancamentos').select('id, descricao, valor, redutor, vencimento, grupo_id, empresa, obs').eq('tipo', 'receita').eq('pago', false).eq('perda', false)).catch(nada) : [],
    pode('contratos') ? q(sb.from('contratos').select('id, descricao, status, cliente_id, documentos(id)').eq('status', 'Ativo')).catch(nada) : [],
    q(sb.from('certidoes').select('id, orgao, validade, cliente_id').lte('validade', somarDias(h, 15))).catch(nada),
    q(sb.from('documentos').select('id, nome, validade, cliente_id').eq('arquivado', false).lte('validade', somarDias(h, 15))).catch(nada),
    q(sb.from('tarefas').select('id, titulo, prazo, prazo_fatal, responsavel').not('status', 'in', '(concluida,cancelada)')).catch(nada),
    q(sb.from('cnpj_execucoes').select('*').order('inicio', { ascending: false }).limit(10)).catch(nada),
    E.perfil && E.perfil.papel === 'admin' ? q(sb.from('email_fila').select('id, para, assunto, erro, criado_em').eq('status', 'erro').order('criado_em', { ascending: false }).limit(50)).catch(nada) : [],
    q(sb.from('configuracoes').select('valor').eq('chave', 'publicacoes_ultima').maybeSingle()).catch(() => null),
    q(sb.from('configuracoes').select('valor').eq('chave', 'regras_tarefas_ultima').maybeSingle()).catch(() => null),
    pode('clientes') ? q(sb.from('contatos').select('cliente_id')).catch(nada) : []
  ]);
  const cls = E.clientes, ativos = cls.filter((c) => c.tipo !== 'Inativo');
  const pj = (c) => soDigitos(c.cpf_cnpj).length === 14;
  const comContato = new Set(contatos.map((x) => x.cliente_id));
  const linhaCli = (c) => [c.grupos ? c.grupos.nome : '—', c.nome, mascaraDoc(c.cpf_cnpj) || '—', c.responsavel || '—'];
  const colCli = ['Grupo', 'Entidade', 'CPF/CNPJ', 'Responsável'];
  // cada alerta: [setor, rótulo, valor exibido, detalhe, nível (ok|atencao|critico|info), relatório {colunas, linhas, abrir}]
  const A = [];
  const add = (setor, rot, valor, det, nivel, rel) => A.push({ setor, rot, valor, det, nivel, rel });
  // ── Cadastro ──
  const comProc = cls.filter((c) => c.procuracao === true), semProc = cls.filter((c) => c.procuracao !== true);
  add('Cadastro', 'Procurações', comProc.length + ' de ' + cls.length, semProc.length + ' entidade(s) sem procuração', semProc.length ? 'atencao' : 'ok',
    { titulo: 'Entidades sem procuração', colunas: colCli, linhas: semProc.map(linhaCli), ids: semProc.map((c) => c.id) });
  const comCert = cls.filter((c) => c.certificado === true), semCert = cls.filter((c) => c.certificado !== true && pj(c));
  add('Cadastro', 'Certificado digital', comCert.length + ' de ' + cls.filter(pj).length, semCert.length + ' empresa(s) sem certificado', semCert.length ? 'atencao' : 'ok',
    { titulo: 'Empresas sem certificado digital', colunas: colCli, linhas: semCert.map(linhaCli), ids: semCert.map((c) => c.id) });
  const omisso = cls.filter((c) => /omisso/i.test(c.capag || ''));
  add('Cadastro', 'CAPAG omisso', String(omisso.length), 'entidade(s) que não entregaram a declaração', omisso.length ? 'critico' : 'ok',
    { titulo: 'CAPAG omisso', colunas: colCli, linhas: omisso.map(linhaCli), ids: omisso.map((c) => c.id) });
  const capD = cls.filter((c) => /^d$/i.test(String(c.capag || '').trim()));
  add('Cadastro', 'CAPAG D', String(capD.length), 'menor capacidade de pagamento', capD.length ? 'atencao' : 'ok',
    { titulo: 'CAPAG D', colunas: colCli, linhas: capD.map(linhaCli), ids: capD.map((c) => c.id) });
  const irreg = cls.filter((c) => pj(c) && c.situacao_cadastral && !/^ativa$/i.test(c.situacao_cadastral.trim()));
  add('Cadastro', 'Situação cadastral irregular', String(irreg.length), 'inapta, suspensa ou baixada na Receita', irreg.length ? 'critico' : 'ok',
    { titulo: 'Situação cadastral diferente de ATIVA', colunas: colCli.concat(['Situação']), linhas: irreg.map((c) => linhaCli(c).concat([c.situacao_cadastral])), ids: irreg.map((c) => c.id) });
  const semResp = ativos.filter((c) => !c.responsavel);
  add('Cadastro', 'Sem responsável', String(semResp.length), 'entidade(s) ativas sem pessoa responsável', semResp.length ? 'atencao' : 'ok',
    { titulo: 'Entidades sem responsável', colunas: colCli, linhas: semResp.map(linhaCli), ids: semResp.map((c) => c.id) });
  const semCont = ativos.filter((c) => !c.email && !c.telefone && !comContato.has(c.id));
  add('Cadastro', 'Sem contato', String(semCont.length), 'sem e-mail, telefone ou contato cadastrado', semCont.length ? 'atencao' : 'ok',
    { titulo: 'Entidades sem contato', colunas: colCli, linhas: semCont.map(linhaCli), ids: semCont.map((c) => c.id) });
  // ── Jurídico ──
  if (podeJur) {
    add('Jurídico', 'Publicações novas', String(pubs.length), 'no Diário de Justiça, ainda não lidas', pubs.length ? 'atencao' : 'ok',
      { titulo: 'Publicações novas', colunas: ['Data', 'Tribunal', 'Tipo', 'Processo', 'Advogado'], linhas: pubs.map((p) => [dataBR(p.data_disponibilizacao), p.tribunal, p.tipo, p.processo, p.advogado]), tela: 'publicacoes' });
    add('Jurídico', 'Parcelamentos com parcela vencida', String(parcelas.length), 'dívida do cliente (não é financeiro do escritório)', parcelas.length ? 'critico' : 'ok',
      { titulo: 'Parcelas de parcelamento vencidas', colunas: ['Vencimento', 'Empresa', 'Natureza', 'Parcela', 'Grupo'],
        linhas: parcelas.map((x) => [dataBR(x.vencimento), x.parcelamentos ? x.parcelamentos.empresa : '—', x.parcelamentos ? x.parcelamentos.natureza : '', x.numero, x.parcelamentos ? nomeGrupo(x.parcelamentos.grupo_id) : '']), tela: 'parcelamentos' });
    add('Jurídico', 'Acordos vencidos', String(acordos.length), (acordos.length ? brlCurto(soma(acordos, (a) => a.valor)) + ' · ' : '') + 'parcelas de acordos dos clientes com terceiros', acordos.length ? 'critico' : 'ok',
      { titulo: 'Parcelas de acordo vencidas', colunas: ['Vencimento', 'Devedor', 'Credor', 'Parcela', 'Valor'], linhas: acordos.map((a) => [dataBR(a.vencimento), a.devedor, a.credor, a.parcela, brl(a.valor)]), tela: 'acordos' });
    const semValor = procs.filter((p) => !(Number(p.valor) > 0));
    add('Jurídico', 'Processos sem valor da causa', String(semValor.length) + ' de ' + procs.length, 'complete para o Painel somar certo', semValor.length ? 'info' : 'ok',
      { titulo: 'Processos sem valor da causa', colunas: ['Número', 'Natureza', 'Grupo'], linhas: semValor.map((p) => [p.numero, p.natureza, nomeGrupo(p.grupo_id)]), tela: 'processos' });
  }
  // ── Financeiro ──
  if (podeFin) {
    const atr = lancs.filter((l) => l.vencimento < h);
    add('Financeiro', 'Honorários em atraso', atr.length ? brlCurto(soma(atr, vl)) : '0', atr.length + ' lançamento(s) vencido(s), todos os meses', atr.length ? 'critico' : 'ok',
      { titulo: 'Honorários em atraso', colunas: ['Vencimento', 'Descrição', 'Grupo', 'Empresa', 'Valor'], linhas: atr.sort((a, b) => a.vencimento.localeCompare(b.vencimento)).map((l) => [dataBR(l.vencimento), l.descricao, nomeGrupo(l.grupo_id), l.empresa === 'contabilidade' ? 'Contabilidade' : 'Jurídico', brl(vl(l))]), tela: 'financeiro' });
    const prov = lancs.filter((l) => /salário mínimo de \d{4} ainda não cadastrado/i.test(l.obs || ''));
    add('Financeiro', 'Mensalidades com salário mínimo provisório', String(prov.length), 'cadastre o salário mínimo do ano em Contratos', prov.length ? 'atencao' : 'ok',
      { titulo: 'Mensalidades aguardando o salário mínimo do ano', colunas: ['Vencimento', 'Descrição', 'Valor provisório'], linhas: prov.map((l) => [dataBR(l.vencimento), l.descricao, brl(l.valor)]), tela: 'contratos' });
  }
  if (pode('contratos')) {
    const semAnexo = contratos.filter((c) => !(c.documentos || []).length);
    add('Financeiro', 'Contratos sem anexo', String(semAnexo.length) + ' de ' + contratos.length, 'contratos ativos sem o documento assinado', semAnexo.length ? 'atencao' : 'ok',
      { titulo: 'Contratos ativos sem anexo', colunas: ['Contrato', 'Cliente'], linhas: semAnexo.map((c) => [c.descricao, nomeCliente(c.cliente_id)]), tela: 'contratos' });
  }
  // ── Documentos e tarefas ──
  const certV = certs.filter((c) => c.validade);
  add('Documentos', 'Certidões vencendo', String(certV.length), 'vencidas ou nos próximos 15 dias', certV.some((c) => c.validade < h) ? 'critico' : certV.length ? 'atencao' : 'ok',
    { titulo: 'Certidões vencidas ou vencendo', colunas: ['Validade', 'Órgão', 'Cliente'], linhas: certV.map((c) => [dataBR(c.validade), c.orgao, nomeCliente(c.cliente_id)]) });
  const docV = docs.filter((d) => d.validade);
  add('Documentos', 'Documentos vencendo', String(docV.length), 'vencidos ou nos próximos 15 dias', docV.some((d) => d.validade < h) ? 'critico' : docV.length ? 'atencao' : 'ok',
    { titulo: 'Documentos vencidos ou vencendo', colunas: ['Validade', 'Documento', 'Cliente'], linhas: docV.map((d) => [dataBR(d.validade), d.nome, nomeCliente(d.cliente_id)]), tela: 'documentos' });
  const tAtr = tarefas.filter((t) => t.prazo && t.prazo < h), tFat = tarefas.filter((t) => t.prazo_fatal && t.prazo_fatal <= somarDias(h, 7));
  add('Tarefas', 'Tarefas atrasadas', String(tAtr.length), 'todas as pessoas', tAtr.length ? 'critico' : 'ok',
    { titulo: 'Tarefas atrasadas', colunas: ['Prazo', 'Tarefa', 'Pessoa'], linhas: tAtr.sort((a, b) => a.prazo.localeCompare(b.prazo)).map((t) => [dataBR(t.prazo), t.titulo, t.responsavel]), tela: 'tarefas' });
  add('Tarefas', 'Prazos fatais em 7 dias', String(tFat.length), 'inclui os já vencidos', tFat.some((t) => t.prazo_fatal < h) ? 'critico' : tFat.length ? 'atencao' : 'ok',
    { titulo: 'Prazos fatais nos próximos 7 dias', colunas: ['Prazo fatal', 'Tarefa', 'Pessoa'], linhas: tFat.sort((a, b) => a.prazo_fatal.localeCompare(b.prazo_fatal)).map((t) => [dataBR(t.prazo_fatal), t.titulo, t.responsavel]), tela: 'tarefas' });
  // ── Rotinas automáticas ──
  const ult = cnpj[0], hoje6 = new Date(h + 'T06:30:00'), rodouHoje = ult && new Date(ult.inicio) >= new Date(h + 'T00:00:00');
  const cnpjNivel = !ult ? 'atencao' : ult.status === 'erro' ? 'critico' : !rodouHoje && new Date() > hoje6 ? 'critico' : ult.status === 'parcial' ? 'atencao' : 'ok';
  add('Rotinas', 'Cartão CNPJ (6h)', !ult ? 'nunca rodou' : rodouHoje ? '✓ hoje ' + new Date(ult.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '⚠ ' + new Date(ult.inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    ult ? ult.mensagem || ult.status : 'publique a função erp-cnpj e ligue o agendador', cnpjNivel, { cnpj: true });
  if (emails.length || (E.perfil && E.perfil.papel === 'admin')) add('Rotinas', 'E-mails com erro', String(emails.length), 'não saíram depois de 3 tentativas', emails.length ? 'critico' : 'ok',
    { titulo: 'E-mails com erro', colunas: ['Quando', 'Para', 'Assunto', 'Erro'], linhas: emails.map((m) => [quandoRodou(m.criado_em), m.para, m.assunto, m.erro]) });
  if (podeJur) add('Rotinas', 'Busca de publicações', ultPub && ultPub.valor ? quandoCurto(ultPub.valor.quando) : 'nunca rodou',
    ultPub && ultPub.valor ? ultPub.valor.novas + ' nova(s) · ' + ((ultPub.valor.erros || []).length ? '⚠ ' + ultPub.valor.erros[0] : 'sem erro') : 'cadastre as OABs em Publicações',
    !ultPub || !ultPub.valor ? 'atencao' : (ultPub.valor.erros || []).length ? 'critico' : 'ok', { tela: 'publicacoes' });
  add('Rotinas', 'Regras de tarefas', ultReg && ultReg.valor ? quandoCurto(ultReg.valor.quando) : 'nunca rodou', ultReg && ultReg.valor ? ultReg.valor.criadas + ' criada(s) na última execução' : '',
    ultReg && ultReg.valor ? 'ok' : 'info', { tela: 'tarefas' });

  const setores = [...new Set(A.map((a) => a.setor))];
  const criticos = A.filter((a) => a.nivel === 'critico').length, atencao = A.filter((a) => a.nivel === 'atencao').length;
  $('al-corpo').innerHTML = '<div class="kpis">' + kpi('Críticos', String(criticos), criticos ? 'vermelho' : 'verde', 'pedem ação agora') + kpi('Atenção', String(atencao), atencao ? 'ambar' : 'verde', 'acompanhar') +
    kpi('Tudo certo', String(A.filter((a) => a.nivel === 'ok').length), 'verde', 'de ' + A.length + ' verificações') + '</div>' +
    setores.map((st) => '<div class="kpis-titulo">' + esc(st) + '</div><div class="al-grade">' + A.map((a, i) => a.setor !== st ? '' :
      '<button type="button" class="al-card al-' + a.nivel + '" data-al="' + i + '"><div class="al-rot">' + esc(a.rot) + '</div><div class="al-val">' + esc(a.valor) + '</div><div class="al-det">' + esc(a.det) + '</div></button>').join('') + '</div>').join('');
  $('al-corpo').querySelectorAll('[data-al]').forEach((b) => b.onclick = () => { const a = A[+b.dataset.al]; if (a.rel.cnpj) janelaCnpj(cnpj); else relatorioAlerta(a); });
};

function quandoCurto(v) {
  const d = new Date(v); if (isNaN(d)) return '—';
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return (d.toDateString() === new Date().toDateString() ? 'hoje ' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ') + hora;
}
function irTelaAlerta(t) { if (typeof window.nav === 'function') window.nav(null, t); else irPara(t); }

function relatorioAlerta(a) {
  const r = a.rel;
  if (!r.colunas) { if (r.tela) irTelaAlerta(r.tela); return; }
  relatorioTabela(Object.assign({}, r, r.tela ? { acao: { rotulo: 'Abrir a tela', fn: () => irTelaAlerta(r.tela) } } : {}));
}

// Cartão CNPJ: última execução, o que mudou, erros, histórico e a API usada
async function janelaCnpj(execs) {
  const cfg = await q(sb.rpc('status_config_cnpj')).catch(() => ({})) || {};
  const admin = E.perfil && E.perfil.papel === 'admin', ult = execs[0];
  const rel = (ult && ult.relatorio) || [];
  const alt = rel.filter((x) => x.mudancas && !x.primeira), err = rel.filter((x) => x.erro);
  const j = abrirJanela({ titulo: 'Cartão CNPJ — atualização diária (6h)', larga: true,
    corpo: (ult ? '<div class="dica" style="margin-bottom:10px"><b>Última execução:</b> ' + quandoRodou(ult.inicio) + ' · ' + ({ ok: '✅ sem erro', parcial: '⚠ com alguns erros', erro: '❌ com erro', rodando: '⏳ rodando' }[ult.status] || ult.status) +
        ' · ' + esc(ult.mensagem) + ' · API: ' + esc(ult.provedor) + '</div>' : '<div class="dica" style="margin-bottom:10px">Ainda não rodou. Publique a função <b>erp-cnpj</b> no Supabase e clique em "Atualizar agora".</div>') +
      '<div class="secao">Alterações encontradas (' + alt.length + ')</div>' +
      (alt.length ? '<div class="tabela-wrap"><table><thead><tr><th>Entidade</th><th>Campo</th><th>Antes</th><th>Agora</th></tr></thead><tbody>' +
        alt.flatMap((x) => x.mudancas.map((m, k) => '<tr>' + (k === 0 ? '<td rowspan="' + x.mudancas.length + '"><b>' + esc(x.nome) + '</b><div class="sub mono">' + esc(mascaraDoc(x.cnpj)) + '</div></td>' : '') +
          '<td>' + esc(m.campo) + '</td><td class="sub">' + esc(m.antes || '—') + '</td><td><b>' + esc(m.depois) + '</b></td></tr>')).join('') + '</tbody></table></div>' : '<div class="sub" style="margin-bottom:8px">Nenhuma alteração.</div>') +
      '<div class="secao">Erros (' + err.length + ')</div>' +
      (err.length ? '<div class="lista-ficha">' + err.map((x) => '<div class="item-ficha"><div><b>' + esc(x.nome) + '</b> <span class="sub mono">' + esc(mascaraDoc(x.cnpj)) + '</span><div class="sub">' + esc(x.erro) + '</div></div></div>').join('') + '</div>' : '<div class="sub" style="margin-bottom:8px">Nenhum erro.</div>') +
      '<div class="secao">Últimas execuções</div><div class="tabela-wrap"><table><thead><tr><th>Quando</th><th>Origem</th><th>Situação</th><th>Resultado</th></tr></thead><tbody>' +
      execs.map((x) => '<tr><td class="mono">' + quandoRodou(x.inicio) + '</td><td>' + (x.origem === 'rotina' ? '6h automática' : 'manual') + '</td><td><span class="pill ' + ({ ok: 'pago', parcial: 'hoje', erro: 'vencido' }[x.status] || 'neutro') + '">' + esc(x.status) + '</span></td><td>' + esc(x.mensagem) + '</td></tr>').join('') + '</tbody></table></div>' +
      (admin ? '<div class="secao">API do cartão CNPJ</div><form class="grade" id="f-cnpj">' + campo('API', selectPares('provedor', PROVEDORES_CNPJ, cfg.provedor || 'brasilapi'), 'inteiro') +
        campo('Token (só ReceitaWS paga)', '<input name="token" type="password" placeholder="' + (cfg.tem_token ? '•••• (deixe vazio para manter)' : 'opcional') + '">', 'inteiro') + '</form>' : ''),
    rodape: '<span></span><div class="acoes">' + (admin ? '<button class="btn btn-o" type="button" id="cnpj-salvar">Salvar API</button><button class="btn btn-p" type="button" id="cnpj-agora">↻ Atualizar agora</button>' : '') + '</div>' });
  const sv = j.querySelector('#cnpj-salvar');
  if (sv) sv.onclick = () => comBotao(sv, async () => {
    const f = j.querySelector('#f-cnpj');
    await q(sb.rpc('salvar_config_cnpj', { p: { provedor: f.provedor.value, token: f.token.value.trim() } }));
    aviso('✓ API do cartão CNPJ salva.');
  });
  const ag = j.querySelector('#cnpj-agora');
  if (ag) ag.onclick = () => comBotao(ag, async () => {
    const r = await chamarFuncao('erp-cnpj', { acao: 'rodar' });
    aviso('✓ Cartão CNPJ: ' + (r.mensagem || 'feito') + '.'); fecharJanela(j); await TELAS.alertas();
  });
}

// toda gravação confirmada aparece também no rodapé do ERP
const _avisoOrig = aviso;
aviso = function (msg, erro) { _avisoOrig(msg, erro); if (!erro && window.ERP_EDITOR && /^✓/.test(msg)) window.ERP_EDITOR.gravou(String(msg).replace(/^✓\s*/, '')); };
window.GS = { TELAS, E, irPara, carregarCadastros, formLancamento, formCliente, formContrato, formTarefa, tabelaLancamentos, ligarAcoesLancamentos, abrirJanela, fecharJanela, abrirFicha, invalidarCadastros, blocoDocumentos, abrirAlertas, contarAlertas, pode, janelaMeusAvisos, formOportunidade, detalheAcordo };
})();
