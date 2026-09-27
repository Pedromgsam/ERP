'use strict';
// ═══════════════════════════════════════════════════════════════════
// ERP Araújo & Castro — núcleo: conexão, login, navegação e utilidades.
// Dados e regras de acesso ficam no Supabase (ver ../banco/estrutura.sql).
// As telas ficam em telas-*.js e se registram em TELAS.
// ═══════════════════════════════════════════════════════════════════

const CFG = window.ERP_CONFIG || {};
const CONFIGURADO = !!(CFG.url && CFG.chave && !/COLE_AQUI/.test(CFG.url + CFG.chave));
const sb = CONFIGURADO ? window.supabase.createClient(CFG.url, CFG.chave) : null;

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
  if (!erro) marcarGravacao();
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

// ─────────────────────────── login ─────────────────────────────────
function mostrarLogin(msg, ok) {
  $('tela-carregando').classList.add('escondido');
  $('tela-app').classList.add('escondido');
  $('tela-login').classList.remove('escondido');
  $('login-msg').innerHTML = msg ? '<div class="' + (ok ? 'msg-ok' : 'msg-erro') + '">' + esc(msg) + '</div>' : '';
  // só leva o cursor ao e-mail se a pessoa ainda não começou a digitar em outro campo
  setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) $('login-email').focus(); }, 50);
}

$('form-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (!sb) return mostrarLogin('O sistema ainda não foi configurado (falta o endereço do Supabase em config.js).');
  const btn = $('login-btn');
  btn.disabled = true; btn.textContent = 'Entrando…';
  try {
    const { data, error } = await sb.auth.signInWithPassword({
      email: $('login-email').value.trim(), password: $('login-senha').value });
    if (error) throw error;
    $('login-senha').value = '';
    await entrarNoSistema(data.user);
  } catch (e) {
    mostrarLogin(erroAmigavel(e));
  } finally {
    btn.disabled = false; btn.textContent = 'Entrar';
  }
});

$('btn-sair').addEventListener('click', async () => {
  try { await sb.auth.signOut(); } catch (e) { /* sai mesmo sem rede */ }
  E.perfil = null;
  mostrarLogin('Você saiu do sistema.', true);
});

async function entrarNoSistema(user) {
  if (!user) return mostrarLogin('Não foi possível confirmar o login. Tente de novo.');
  const perfil = await q(sb.from('perfis').select('*').eq('id', user.id).maybeSingle());
  if (!perfil || perfil.papel === 'inativo') {
    await sb.auth.signOut();
    return mostrarLogin('Seu acesso ainda não foi liberado. Peça ao administrador para ativar seu usuário.');
  }
  E.perfil = perfil;
  $('hd-nome').textContent = perfil.nome || perfil.email;
  document.querySelectorAll('.so-admin').forEach((el) => el.classList.toggle('escondido', perfil.papel !== 'admin'));
  $('tela-carregando').classList.add('escondido');
  $('tela-login').classList.add('escondido');
  $('tela-app').classList.remove('escondido');
  await carregarCadastros();
  irPara(E.tela);
}

async function carregarCadastros() {
  const [clientes, grupos] = await Promise.all([
    buscarTodos(() => sb.from('clientes').select('*, grupos(nome)').order('nome')),
    buscarTodos(() => sb.from('grupos').select('*').order('nome'))
  ]);
  E.clientes = clientes; E.grupos = grupos;
}

// ─────────────────────────── navegação ─────────────────────────────
// Cada tela: TELAS.x = async function () {...}. Monta a própria barra de
// filtros uma vez e repinta só o corpo quando um filtro muda.
const TELAS = {};
$('menu').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-tela]');
  if (b) irPara(b.dataset.tela);
});
async function irPara(tela) {
  if (!TELAS[tela] || (tela === 'admin' && E.perfil.papel !== 'admin')) tela = 'inicio';
  E.tela = tela;
  document.querySelectorAll('#menu button').forEach((b) => b.classList.toggle('ativo', b.dataset.tela === tela));
  $('conteudo').innerHTML = '<div class="carregando">Carregando…</div>';
  try { await TELAS[tela](); }
  catch (e) {
    console.error(e);
    $('conteudo').innerHTML = '<div class="card"><div class="card-bd msg-erro">' + esc(erroAmigavel(e)) + '</div></div>';
  }
}
function recarregar() { return irPara(E.tela); }

// ─────────────────────────── início ────────────────────────────────
window.addEventListener('DOMContentLoaded', async function iniciar() {
  const faltando = Object.keys({ 'inicio': 1, 'painel': 1, 'juridico': 1, 'contabilidade': 1, 'contratos': 1, 'clientes': 1, 'admin': 1 })
    .filter((t) => !TELAS[t]);
  if (faltando.length) console.error('[ERP] telas sem código:', faltando);
  if (!sb) return mostrarLogin('O sistema ainda não foi configurado (falta o endereço do Supabase em config.js).');
  sb.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT' && E.perfil) { E.perfil = null; mostrarLogin('Sua sessão terminou. Entre de novo.'); }
  });
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session) await entrarNoSistema(session.user);
    else mostrarLogin();
  } catch (e) {
    mostrarLogin(erroAmigavel(e));
  }
});
