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

async function carregarCadastros() {
  const [clientes, grupos] = await Promise.all([
    buscarTodos(() => sb.from('clientes').select('*, grupos(nome)').order('nome')),
    buscarTodos(() => sb.from('grupos').select('*').order('nome'))
  ]);
  E.clientes = clientes; E.grupos = grupos;
}

// ── navegação dentro do ERP: cada tela desenha no painel que o ERP mostrou ──
const TELAS = {};
async function irPara(tela, alvo) {
  E.perfil = window.ERP_EU || E.perfil;
  E.tela = tela;
  if (alvo) { const ant = document.getElementById('conteudo'); if (ant && ant !== alvo) ant.removeAttribute('id'); alvo.id = 'conteudo'; }
  if (!$('conteudo')) return;
  $('conteudo').innerHTML = '<div class="carregando">Carregando…</div>';
  try { await carregarCadastros(); await TELAS[tela](); }
  catch (e) {
    console.error(e);
    $('conteudo').innerHTML = '<div class="card"><div class="card-bd msg-erro">' + esc(erroAmigavel(e)) + '</div></div>';
  }
}
function recarregar() { if (window.ERP_RECARREGAR) return window.ERP_RECARREGAR(); return irPara(E.tela); }

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
    const dica = it.rotulo + ': ' + brl(it.valor) + (it.extra ? ' · ' + it.extra : '');
    s += '<g data-dica="' + esc(dica) + '"' + (it.acao ? ' class="clicavel" data-acao="' + esc(it.acao) + '"' : '') + '>' +
      '<rect x="0" y="' + (y - 2) + '" width="' + larg + '" height="' + alt + '" fill="transparent"/>' +
      '<text x="' + (esq - 10) + '" y="' + (y + 16) + '" text-anchor="end" class="g-rot">' + esc(nome) + '</text>' +
      '<path d="M' + esq + ',' + (y + 4) + ' h' + (w - 4) + ' a4,4 0 0 1 4,4 v10 a4,4 0 0 1 -4,4 h-' + (w - 4) + ' z" fill="' + cor[i] + '"/>' +
      '<text x="' + (esq + w + 8) + '" y="' + (y + 16) + '" class="g-val">' + esc(brlCurto(it.valor)) + '</text></g>';
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

// ─────────────────────────── INÍCIO ────────────────────────────────
TELAS.inicio = async function () {
  const h = hojeISO(), ini = iso(primeiroDiaDoMes(new Date())), fim = iso(fimDoMes(new Date()));
  const sel = '*, grupos(nome), clientes(nome)';
  const [doMes, pagosNoMes, atrasados, proximos] = await Promise.all([
    buscarTodos(() => sb.from('lancamentos').select(sel).gte('vencimento', ini).lte('vencimento', fim).eq('pago', false).eq('perda', false)),
    buscarTodos(() => sb.from('lancamentos').select('empresa, tipo, valor').gte('data_pagamento', ini).lte('data_pagamento', fim).eq('pago', true)),
    buscarTodos(() => sb.from('lancamentos').select(sel).lt('vencimento', h).eq('pago', false).eq('perda', false).order('vencimento')),
    buscarTodos(() => sb.from('lancamentos').select(sel).gte('vencimento', h).lte('vencimento', somarDias(h, 15)).eq('pago', false).eq('perda', false).order('vencimento'))
  ]);
  const de = (lista, emp, tipo) => lista.filter((l) => l.empresa === emp && l.tipo === tipo);
  const linha = (emp, titulo) =>
    '<div class="kpis-titulo">' + titulo + '</div><div class="kpis">' +
    kpi('Recebido no mês', brl(soma(de(pagosNoMes, emp, 'receita'), vl)), 'verde', de(pagosNoMes, emp, 'receita').length + ' recebimento(s)') +
    kpi('A receber no mês', brl(soma(de(doMes, emp, 'receita'), vl)), '', de(doMes, emp, 'receita').length + ' em aberto') +
    kpi('Em atraso', brl(soma(de(atrasados, emp, 'receita'), vl)), 'vermelho', de(atrasados, emp, 'receita').length + ' vencido(s)') +
    kpi('A pagar no mês', brl(soma(de(doMes, emp, 'despesa'), vl)), 'ambar', de(doMes, emp, 'despesa').length + ' conta(s)') +
    '</div>';

  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Olá, ' + esc((E.perfil.nome || '').split(' ')[0]) + '</h1>' +
    '<p>Resumo de ' + esc(nomeMes(new Date())) + '</p></div>' +
    '<div class="acoes"><button class="btn btn-p" data-novo="receita">+ Receita</button>' +
    '<button class="btn btn-o" data-novo="despesa">+ Despesa</button>' +
    '<button class="btn btn-o" data-novo="contrato">+ Contrato</button></div></div>' +
    linha('escritorio', '💼 Honorários Jurídico') + linha('contabilidade', '🧮 Contabilidade') +
    '<div class="duas-col">' +
    cardLista('⚠ Em atraso', atrasados, 'Nada em atraso. 👏') +
    cardLista('🗓 Próximos 15 dias', proximos, 'Nenhum vencimento nos próximos 15 dias.') +
    '</div>';
  ligarAcoesLancamentos($('conteudo'));
  ligarBotoesNovo($('conteudo'));
};

function cardLista(titulo, lista, vazio) {
  const linhas = lista.map((l) => {
    const quem = (l.grupos && l.grupos.nome) || l.favorecido || (l.clientes && l.clientes.nome) || '';
    return '<tr><td class="mono" data-ord="' + l.vencimento + '">' + dataBR(l.vencimento) + '</td><td><b>' + esc(quem || l.descricao) + '</b>' +
      '<div class="sub">' + (l.empresa === 'contabilidade' ? 'Contabilidade · ' : 'Jurídico · ') + esc(l.descricao) + '</div></td>' +
      '<td class="num mono ' + (l.tipo === 'receita' && !l.redutor ? 'valor-rec' : 'valor-desp') + '" data-ord="' + (l.tipo === 'despesa' ? -l.valor : vl(l)) + '">' + (l.tipo === 'despesa' || l.redutor ? '− ' : '') + brl(l.valor) + (l.redutor ? '<div class="sub">redutor</div>' : '') + '</td>' +
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
    '<div class="segmento" id="pn-tipo">' + [['ativos', 'Ativos'], ['Consultoria', 'Consultoria'], ['Demanda', 'Demanda'], ['Inativo', 'Inativos'], ['todos', 'Todos']]
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
        '<td class="num mono ' + (l.tipo === 'receita' && !l.redutor ? 'valor-rec' : 'valor-desp') + '" data-ord="' + (l.tipo === 'despesa' ? -l.valor : vl(l)) + '">' + (l.tipo === 'despesa' || l.redutor ? '− ' : '') + brl(l.valor) + (l.redutor ? '<div class="sub">redutor</div>' : '') + '</td>' +
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
    '<div class="segmento" id="cli-tipo">' + [['ativos', 'Ativos'], ['Consultoria', 'Consultoria'], ['Demanda', 'Demanda'], ['Inativo', 'Inativos'], ['todos', 'Todos']]
      .map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<select class="busca sel" id="cli-grupo" autocomplete="off"><option value="">Todos os grupos</option>' +
    E.grupos.map((g) => '<option value="' + g.id + '">' + esc(g.nome) + '</option>').join('') + '</select>' +
    '<input class="busca" id="cli-busca" placeholder="Buscar nome, grupo, responsável ou CPF/CNPJ" autocomplete="off">' +
    '</div><div id="cli-corpo"></div>';
  $('cli-tipo').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { C.tipo = b.dataset.v; pintarClientes(); } };
  $('cli-grupo').onchange = (ev) => { C.grupo = ev.target.value; pintarClientes(); };
  let t;
  $('cli-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { C.busca = ev.target.value; pintarClientes(); }, 250); };
  ligarBotoesNovo($('conteudo'));
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
  $('cli-conta').textContent = lista.length + ' de ' + E.clientes.length + ' cadastro(s)';
  $('cli-corpo').innerHTML = '<div class="card">' + (lista.length ?
    '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Grupo</th><th>Nome</th><th>CPF/CNPJ</th><th>Tipo</th><th>Responsável</th>' +
    '<th>Procuração</th><th>Certificado</th><th>Situação</th><th>Contato</th></tr></thead><tbody>' +
    lista.map((c) => '<tr class="clicavel" data-cli="' + c.id + '"><td title="' + esc(c.grupos ? c.grupos.nome : '') + '">' + esc(c.grupos ? c.grupos.nome : '—') + '</td>' +
      '<td><b>' + esc(c.nome) + '</b>' + (c.socio_admin ? '<div class="sub">' + esc(c.socio_admin) + '</div>' : '') + '</td>' +
      '<td class="mono">' + esc(mascaraDoc(c.cpf_cnpj) || '—') + '</td>' +
      '<td><span class="pill ' + (c.tipo === 'Inativo' ? 'neutro' : c.tipo === 'Demanda' ? 'hoje' : 'aberto') + '">' + esc(c.tipo) + '</span></td>' +
      '<td>' + pillPessoa(c.responsavel) + '</td><td>' + pillSimNao(c.procuracao) + '</td><td>' + pillSimNao(c.certificado) + '</td>' +
      '<td>' + pillSitCad(c.situacao_cadastral) + '</td><td>' + esc(c.telefone || c.email || '—') + '</td></tr>').join('') +
    '</tbody></table></div>'
    : '<div class="vazio">' + (E.clientes.length ? 'Nenhum cliente neste recorte.' : 'Nenhum cliente ainda. Clique em "+ Novo cliente" ou importe a Base de Dados em Administração.') + '</div>') + '</div>';
  $('cli-corpo').querySelectorAll('[data-cli]').forEach((tr) => tr.onclick = () => formCliente(E.clientes.find((x) => x.id === tr.dataset.cli), pintarClientes));
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
      campo('Tipo', '<select name="tipo">' + ['Consultoria', 'Demanda', 'Inativo'].map((t) => '<option' + (cl.tipo === t ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>') +
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
  const apos = async () => { await carregarCadastros(); if (depois) depois(); else await recarregar(); };
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
    '<div class="titulo-pag"><div><h1>Contratos</h1><p>Ao cadastrar um contrato, as parcelas entram sozinhas em Honorários Jurídico</p></div>' +
    '<div class="acoes"><button class="btn btn-p" data-novo="contrato">+ Novo contrato</button></div></div>' +
    '<div class="filtros"><div class="segmento" id="ctr-status">' + [['Ativo', 'Ativos'], ['Encerrado', 'Encerrados'], ['Cancelado', 'Cancelados'], ['todos', 'Todos']]
      .map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<input class="busca" id="ctr-busca" placeholder="Buscar cliente ou descrição" autocomplete="off"></div><div id="ctr-corpo"></div>';
  $('ctr-status').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.status = b.dataset.v; pintarContratos(true); } };
  let t;
  $('ctr-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; pintarContratos(false); }, 250); };
  ligarBotoesNovo($('conteudo'));
  await pintarContratos(true);
};

let _contratos = [];
async function pintarContratos(buscar) {
  const F = E.ctr;
  document.querySelectorAll('#ctr-status button').forEach((x) => x.classList.toggle('ativo', x.dataset.v === F.status));
  if (document.activeElement !== $('ctr-busca')) $('ctr-busca').value = F.busca;
  if (buscar) {
    let c = sb.from('contratos').select('*, clientes(nome, grupos(nome)), lancamentos(valor, pago, vencimento)').order('data_contrato', { ascending: false });
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
    '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Cliente</th><th>Contrato</th><th data-tipo="data">Data</th><th class="num">Valor</th><th class="num">Recebido</th><th>Parcelas</th><th>Situação</th></tr></thead><tbody>' +
    lista.map((c) => {
      const parc = c.lancamentos || [];
      const recebido = soma(parc.filter((p) => p.pago), (p) => p.valor);
      const atraso = parc.some((p) => !p.pago && p.vencimento < h);
      return '<tr class="clicavel" data-ctr="' + c.id + '"><td>' + esc(c.clientes ? c.clientes.nome : '—') +
        (c.clientes && c.clientes.grupos ? '<div class="sub">' + esc(c.clientes.grupos.nome) + '</div>' : '') + '</td>' +
        '<td>' + esc(c.descricao) + (c.percentual_exito ? '<div class="sub">+ ' + esc(String(c.percentual_exito).replace('.', ',')) + '% de êxito</div>' : '') + '</td>' +
        '<td class="mono" data-ord="' + c.data_contrato + '">' + dataBR(c.data_contrato) + '</td>' +
        '<td class="num mono" data-ord="' + c.valor_total + '">' + brl(c.valor_total) + '</td>' +
        '<td class="num mono valor-rec" data-ord="' + recebido + '">' + brl(recebido) + '</td>' +
        '<td>' + parc.filter((p) => p.pago).length + '/' + parc.length + '</td>' +
        '<td>' + (atraso ? '<span class="pill vencido">Parcela em atraso</span>' : '<span class="pill ' + (c.status === 'Ativo' ? 'aberto' : 'neutro') + '">' + esc(c.status) + '</span>') + '</td></tr>';
    }).join('') + '</tbody></table></div>'
    : '<div class="vazio">Nenhum contrato' + (F.status !== 'todos' ? ' com essa situação' : '') + '.</div>') + '</div>';
  $('ctr-corpo').querySelectorAll('[data-ctr]').forEach((tr) => tr.onclick = () => detalheContrato(tr.dataset.ctr));
}

function formContrato(ct) {
  ct = ct || {};
  const novo = !ct.id;
  if (novo && !E.clientes.length) {
    aviso('Cadastre um cliente antes de criar o contrato.', true);
    return formCliente();
  }
  const j = abrirJanela({
    titulo: novo ? 'Novo contrato' : 'Editar contrato',
    corpo:
      '<form id="f-ctr" class="grade">' +
      campo('Cliente <span class="obrig">*</span>', '<select name="cliente_id" required>' + opcoesClientes(ct.cliente_id).replace('— sem cliente —', 'Escolha o cliente') + '</select>', 'inteiro') +
      campo('Descrição do serviço <span class="obrig">*</span>', '<input name="descricao" required maxlength="200" placeholder="Ex.: Consultoria tributária mensal" value="' + esc(ct.descricao || '') + '">', 'inteiro') +
      campo('Data do contrato', '<input name="data_contrato" type="date" value="' + esc(ct.data_contrato || hojeISO()) + '">') +
      campo('% de êxito (se houver)', '<input name="percentual_exito" inputmode="decimal" placeholder="Ex.: 20" value="' + (ct.percentual_exito != null ? esc(String(ct.percentual_exito).replace('.', ',')) : '') + '">') +
      (novo
        ? campo('Valor total (R$)', '<input name="valor_total" inputmode="decimal" placeholder="0,00">') +
          campo('Nº de parcelas', '<input name="num_parcelas" type="number" min="1" max="120" value="1">') +
          campo('1º vencimento', '<input name="primeiro_vencimento" type="date" value="' + somarDias(hojeISO(), 30) + '">') +
          '<div class="dica inteiro" id="ctr-previa">Informe o valor para ver as parcelas.</div>'
        : campo('Situação', '<select name="status">' + ['Ativo', 'Encerrado', 'Cancelado'].map((s) => '<option' + (ct.status === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select>') +
          '<div class="dica inteiro">Valor e parcelas já foram lançados em Honorários Jurídico. Para ajustar uma parcela, use o botão Editar dela.</div>') +
      campo('Observação', '<textarea name="obs" maxlength="2000">' + esc(ct.obs || '') + '</textarea>', 'inteiro') +
      '</form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button>' +
      '<button class="btn btn-p" id="btn-salvar-ctr" type="button">' + (novo ? 'Criar contrato' : 'Salvar') + '</button></div>'
  });
  const f = j.querySelector('#f-ctr');
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
    const dados = { cliente_id: f.cliente_id.value, descricao: f.descricao.value.trim(),
      data_contrato: f.data_contrato.value || hojeISO(), percentual_exito: exito, obs: f.obs.value.trim() };
    if (novo) {
      const v = f.valor_total.value.trim() ? lerValor(f.valor_total.value) : 0;
      if (isNaN(v) || v < 0) throw new Error('Valor total inválido (ex.: 12.000,00).');
      const n = Number(f.num_parcelas.value) || 1;
      if (n < 1 || n > 120) throw new Error('Nº de parcelas deve ficar entre 1 e 120.');
      if (v > 0 && !f.primeiro_vencimento.value) throw new Error('Informe o 1º vencimento.');
      Object.assign(dados, { valor_total: v, num_parcelas: n, primeiro_vencimento: v > 0 ? f.primeiro_vencimento.value : null });
      const criado = await q(sb.from('contratos').insert(dados).select().single());
      // parcelas geradas pelo banco: completa grupo e responsável do cliente
      const cli = E.clientes.find((c) => c.id === dados.cliente_id);
      if (v > 0 && cli) await q(sb.from('lancamentos').update({ grupo_id: cli.grupo_id, responsavel: cli.responsavel || '' }).eq('contrato_id', criado.id));
      aviso(v > 0 ? '✓ Contrato criado e ' + n + ' parcela(s) lançada(s) em Honorários Jurídico.' : '✓ Contrato criado.');
    } else {
      dados.status = f.status.value;
      await q(sb.from('contratos').update(dados).eq('id', ct.id));
      aviso('✓ Contrato atualizado.');
    }
    fecharJanela(j);
    if (!novo) fecharJanela();
    await recarregar();
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
      kpi('Recebido', brl(recebido), 'verde', parc.filter((p) => p.pago).length + ' de ' + parc.length + ' parcela(s)') +
      kpi('Falta receber', brl(total - recebido), 'ambar', ct.percentual_exito ? '+ ' + String(ct.percentual_exito).replace('.', ',') + '% de êxito' : ct.status) +
      '</div>' +
      (ct.obs ? '<div class="dica" style="margin-bottom:12px">' + esc(ct.obs) + '</div>' : '') +
      '<div class="card" style="margin:0">' + tabelaLancamentos(parc, { compacta: true }) + '</div>' +
      '<div style="margin-top:10px"><button class="btn btn-o btn-mini" id="ctr-add-parc">+ Lançar valor avulso neste contrato (ex.: êxito)</button></div>',
    rodape:
      (E.perfil.papel === 'admin' ? '<button class="btn btn-x" id="btn-excluir-ctr" type="button">Excluir contrato</button>' : '<span></span>') +
      '<button class="btn btn-o" id="btn-editar-ctr" type="button">Editar contrato</button>'
  });
  const reabrir = async () => { fecharJanela(j); await detalheContrato(id); };
  ligarAcoesLancamentos(j, reabrir);
  j.querySelector('#btn-editar-ctr').onclick = () => formContrato(ct);
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
  { id: 'historico', rot: '🕘 Histórico' }
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
  try { await ({ usuarios: admUsuarios, importar: admImportar, backup: admBackup, historico: admHistorico })[E.adm.aba](corpo); }
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
    '<div class="card"><div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Nome</th><th>E-mail</th><th>Acesso</th><th>Grupos no Portal</th><th data-tipo="data">Desde</th><th class="sem-ordem"></th></tr></thead><tbody>' +
    lista.map((p) => '<tr><td><input class="busca" style="min-width:160px" data-nome="' + p.id + '" value="' + esc(p.nome) + '"></td>' +
      '<td>' + esc(p.email) + '</td><td><select class="busca" style="min-width:150px" data-papel="' + p.id + '">' +
      PAPEIS.map(([v, r]) => '<option value="' + v + '"' + (p.papel === v ? ' selected' : '') + '>' + r + '</option>').join('') +
      '</select></td><td>' + (p.papel === 'cliente'
        ? (gruposDe(p.id).map((g) => '<span class="pill neutro">' + esc(g) + '</span>').join(' ') || '<span class="pill vencido">nenhum</span>') +
          ' <button class="btn btn-o btn-mini" data-grupos="' + p.id + '">Escolher</button>'
        : '<span class="sub">—</span>') + '</td>' +
      '<td class="mono" data-ord="' + p.criado_em + '">' + dataBR(p.criado_em) + '</td>' +
      '<td class="acoes-l"><button class="btn btn-o btn-mini" data-senha="' + esc(p.email) + '" title="Envia por e-mail um link para a pessoa criar uma senha nova">🔑 Link de senha</button></td></tr>').join('') +
    '</tbody></table></div></div>' +
    '<div class="dica"><b>Administrador</b>: tudo, inclusive excluir, importar e liberar usuários. <b>Equipe</b>: cadastra, edita e dá baixa, mas não exclui. ' +
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
  $('us-novo').onclick = () => formNovoUsuario();
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
      '<div class="inteiro escondido" id="us-grupos"><div class="sub" style="margin-bottom:6px">Grupos que o cliente vê no Portal</div>' + listaGruposMarcar([]) + '</div>' +
      '<div class="dica inteiro">Passe o e-mail e a senha provisória para a pessoa. Se o Supabase estiver com <b>confirmação de e-mail</b> ligada, ela recebe um e-mail e precisa clicar no link antes do primeiro acesso.</div>' +
      '</form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-criar-us">Criar usuário</button></div>' });
  const f = j.querySelector('#f-us');
  ligarFiltroGrupos(j);
  f.papel.onchange = () => j.querySelector('#us-grupos').classList.toggle('escondido', f.papel.value !== 'cliente');
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
    await q(sb.from('perfis').update({ papel, nome }).eq('id', perfil.id));
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
      const res = window.IMPORTADOR.importar(window.IMPORTADOR.lerWorkbook(wb));
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
    '<div class="dica" style="margin:10px 0">Atualizar sobrescreve, nesses registros, alterações que alguém tenha feito no sistema novo depois da última importação.</div>' +
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
      '</td><td class="num mono ' + (l.tipo === 'receita' ? 'valor-rec' : 'valor-desp') + '">' + (l.tipo === 'despesa' ? '− ' : '') + brl(l.valor) + '</td><td>' + pillSit(l) + '</td></tr>').join('') +
    '</tbody></table></div>';
}

async function gravarImportacao() {
  const modo = (document.querySelector('input[name=imp-modo]:checked') || {}).value || 'atualizar';
  const prog = $('imp-progresso');
  const validos = _importacoes.filter((r) => r.tipo);
  // 1. grupos que ainda não existem
  prog.textContent = 'Criando grupos…';
  await carregarCadastros();
  const faltam = [...new Set(validos.flatMap((r) => r.grupos))].filter((g) => !E.grupos.some((x) => normalizar(x.nome) === normalizar(g)));
  for (let i = 0; i < faltam.length; i += 200) await q(sb.from('grupos').insert(faltam.slice(i, i + 200).map((nome) => ({ nome }))));
  await carregarCadastros();
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
    if (r.tipo === 'parcelamentos') await carregarCadastros();
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
  await carregarCadastros();
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
    '<input class="busca" type="date" id="hist-de" value="' + esc(F.de) + '" title="De" style="min-width:0;max-width:160px">' +
    '<input class="busca" type="date" id="hist-ate" value="' + esc(F.ate) + '" title="Até" style="min-width:0;max-width:160px">' +
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
  $('hist-de').onchange = muda('de'); $('hist-ate').onchange = muda('ate');
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

'use strict';
// ═══════════════════════════════════════════════════════════════════
// Tarefas — mesmo padrão visual das outras telas (filtros, tabela, janela).
// ═══════════════════════════════════════════════════════════════════
const PRIORIDADE = { alta: ['Alta', 'vencido'], media: ['Média', 'hoje'], baixa: ['Baixa', 'pago'] };
const STATUS_TAREFA = { pendente: 'Pendente', andamento: 'Em andamento', aguardando: 'Aguardando', concluida: 'Concluída', cancelada: 'Cancelada' };
const tarefaFechada = (t) => t.status === 'concluida' || t.status === 'cancelada';

TELAS.tarefas = async function () {
  E.tf = E.tf || { situacao: 'abertas', prazo: '', resp: '', pri: '', busca: '' };
  const F = E.tf;
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Tarefas</h1><p>Prazos do escritório · ✓ conclui, Editar abre a tarefa</p></div>' +
    '<div class="acoes"><button class="btn btn-p" id="tf-nova">+ Nova tarefa</button></div></div>' +
    '<div class="filtros">' +
    '<div class="segmento" id="tf-sit">' + [['abertas', 'Abertas'], ['concluidas', 'Concluídas'], ['', 'Todas']].map(([v, r]) =>
      '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<select class="busca sel" id="tf-prazo"><option value="">Qualquer prazo</option><option value="atrasadas">Atrasadas</option><option value="hoje">Até hoje</option>' +
    '<option value="7">Próximos 7 dias</option><option value="30">Próximos 30 dias</option></select>' +
    '<select class="busca sel" id="tf-resp"><option value="">Todas as pessoas</option>' + Object.keys(PESSOA).map((p) => '<option>' + p + '</option>').join('') + '</select>' +
    '<select class="busca sel" id="tf-pri"><option value="">Todas as prioridades</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select>' +
    '<input class="busca" id="tf-busca" placeholder="Buscar tarefa ou processo" autocomplete="off">' +
    '</div><div id="tf-corpo"><div class="carregando">Carregando…</div></div>';
  $('tf-nova').onclick = () => formTarefa({}, () => TELAS.tarefas());
  $('tf-sit').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.situacao = b.dataset.v; pintarTarefas(); } };
  [['tf-prazo', 'prazo'], ['tf-resp', 'resp'], ['tf-pri', 'pri']].forEach(([id, k]) => { $(id).value = F[k]; $(id).onchange = (ev) => { F[k] = ev.target.value; pintarTarefas(); }; });
  $('tf-busca').value = F.busca;
  let t; $('tf-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; pintarTarefas(); }, 250); };
  E._tarefas = await buscarTodos(() => sb.from('tarefas').select('*').order('prazo', { nullsFirst: false }));
  pintarTarefas();
};

function pintarTarefas() {
  const F = E.tf, h = hojeISO();
  document.querySelectorAll('#tf-sit button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === F.situacao));
  const b = normalizar(F.busca);
  const lista = (E._tarefas || []).filter((t) => (!F.situacao || (F.situacao === 'abertas' ? !tarefaFechada(t) : tarefaFechada(t)))
    && (!F.resp || t.responsavel === F.resp) && (!F.pri || t.prioridade === F.pri)
    && (!F.prazo || (t.prazo && (F.prazo === 'atrasadas' ? t.prazo < h : F.prazo === 'hoje' ? t.prazo <= h : t.prazo >= h && t.prazo <= somarDias(h, Number(F.prazo)))))
    && (!b || normalizar(t.titulo + ' ' + t.processos_vinculados + ' ' + nomeGrupo(t.grupo_id)).includes(b)));
  const atrasadas = (E._tarefas || []).filter((t) => !tarefaFechada(t) && t.prazo && t.prazo < h).length;
  $('tf-corpo').innerHTML =
    '<div class="kpis">' + kpi('Tarefas listadas', String(lista.length), '', 'com os filtros acima') +
    kpi('Atrasadas', String(atrasadas), 'vermelho', 'em aberto, todas as pessoas') + '</div>' +
    '<div class="card">' + (lista.length ? '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th data-tipo="data">Prazo</th><th>Tarefa</th><th>Grupo</th><th>Pessoa</th><th>Prioridade</th><th>Status</th><th class="sem-ordem"></th></tr></thead><tbody>' +
      lista.map((t) => {
        const atr = t.prazo && t.prazo < h && !tarefaFechada(t);
        const pr = PRIORIDADE[t.prioridade] || [t.prioridade || '—', 'neutro'];
        return '<tr><td class="mono" data-ord="' + esc(t.prazo || '') + '">' + dataBR(t.prazo) + (atr ? ' <span class="pill vencido">atrasada</span>' : '') + '</td>' +
          '<td><b>' + esc(t.titulo) + '</b>' + (t.processos_vinculados ? '<div class="sub">' + esc(t.processos_vinculados) + '</div>' : '') + '</td>' +
          '<td>' + esc(nomeGrupo(t.grupo_id) || '—') + '</td><td>' + pillPessoa(t.responsavel) + '</td>' +
          '<td><span class="pill ' + pr[1] + '">' + esc(pr[0]) + '</span></td><td>' + esc(STATUS_TAREFA[t.status] || t.status) + '</td>' +
          '<td class="acoes-l">' + (tarefaFechada(t) ? '' : '<button class="btn btn-v btn-mini" data-concluir="' + t.id + '">✓ Concluir</button> ') +
          '<button class="btn btn-o btn-mini" data-editar-t="' + t.id + '">Editar</button></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="vazio">Nenhuma tarefa com esses filtros.</div>') + '</div>';
  $('tf-corpo').querySelectorAll('[data-concluir]').forEach((bt) => bt.onclick = () => comBotao(bt, async () => {
    await q(sb.from('tarefas').update({ status: 'concluida' }).eq('id', bt.dataset.concluir));
    aviso('✓ Tarefa concluída.'); await TELAS.tarefas();
  }));
  $('tf-corpo').querySelectorAll('[data-editar-t]').forEach((bt) => bt.onclick = () =>
    formTarefa(E._tarefas.find((t) => t.id === bt.dataset.editarT), () => TELAS.tarefas()));
}

function selectPares(nome, pares, v) {
  return '<select name="' + nome + '">' + pares.map(([val, rot]) => '<option value="' + val + '"' + (val === v ? ' selected' : '') + '>' + esc(rot) + '</option>').join('') + '</select>';
}
function formTarefa(t, depois) {
  const novo = !t.id;
  const j = abrirJanela({ titulo: novo ? 'Nova tarefa' : 'Editar tarefa', larga: true,
    corpo: '<form id="f-tf" class="grade">' +
      campo('Tarefa <span class="obrig">*</span>', '<input name="titulo" maxlength="300" value="' + esc(t.titulo || '') + '">', 'inteiro') +
      campo('Grupo', '<input name="grupo" list="tf-grupos" value="' + esc(nomeGrupo(t.grupo_id)) + '">' + datalistGrupos('tf-grupos')) +
      campo('Pessoa responsável', '<input name="responsavel" list="tf-pessoas" value="' + esc(t.responsavel || '') + '">' + datalistPessoas('tf-pessoas')) +
      campo('Prazo', '<input name="prazo" type="date" value="' + esc(t.prazo || '') + '">') +
      campo('Início', '<input name="inicio" type="date" value="' + esc(t.inicio || (novo ? hojeISO() : '')) + '">') +
      campo('Prioridade', selectPares('prioridade', [['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']], t.prioridade || 'media')) +
      campo('Status', selectPares('status', Object.entries(STATUS_TAREFA), t.status || 'pendente')) +
      campo('Processos vinculados', '<input name="processos_vinculados" value="' + esc(t.processos_vinculados || '') + '">', 'inteiro') +
      campo('Observação', '<textarea name="obs" maxlength="2000">' + esc(t.obs || '') + '</textarea>', 'inteiro') +
      '</form>',
    rodape: (novo ? '<span></span>' : '<button class="btn btn-x" type="button" id="btn-excluir-tf">Excluir</button>') +
      '<div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-salvar-tf">Salvar</button></div>' });
  const f = j.querySelector('#f-tf');
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  f.onsubmit = (ev) => { ev.preventDefault(); j.querySelector('#btn-salvar-tf').click(); };
  j.querySelector('#btn-salvar-tf').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.titulo.value.trim()) throw new Error('Escreva a tarefa.');
    const dados = { titulo: f.titulo.value.trim(), grupo_id: await grupoPorNome(f.grupo.value), responsavel: f.responsavel.value.trim(),
      prazo: f.prazo.value || null, inicio: f.inicio.value || null, prioridade: f.prioridade.value, status: f.status.value,
      processos_vinculados: f.processos_vinculados.value.trim(), obs: f.obs.value.trim() };
    if (novo) await q(sb.from('tarefas').insert(dados)); else await q(sb.from('tarefas').update(dados).eq('id', t.id));
    aviso(novo ? '✓ Tarefa criada.' : '✓ Tarefa atualizada.'); fecharJanela(j); await (depois || recarregar)();
  });
  const bx = j.querySelector('#btn-excluir-tf');
  if (bx) bx.onclick = () => comBotao(bx, async () => {
    if (!confirm('Excluir esta tarefa?')) return;
    await excluir('tarefas', t.id);
    aviso('Tarefa excluída.'); fecharJanela(j); await (depois || recarregar)();
  });
}

// toda gravação confirmada aparece também no rodapé do ERP
const _avisoOrig = aviso;
aviso = function (msg, erro) { _avisoOrig(msg, erro); if (!erro && window.ERP_EDITOR && /^✓/.test(msg)) window.ERP_EDITOR.gravou(String(msg).replace(/^✓\s*/, '')); };
window.GS = { TELAS, E, irPara, carregarCadastros, formLancamento, formCliente, formContrato, formTarefa, tabelaLancamentos, ligarAcoesLancamentos, abrirJanela, fecharJanela };
})();
