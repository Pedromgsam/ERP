'use strict';
// ═══════════════════════════════════════════════════════════════════
// ERP Araújo & Castro — telas
// Dados e regras de acesso ficam no Supabase (ver ../banco/estrutura.sql).
// Esta página só mostra e envia; quem decide o que cada um pode é o banco.
// ═══════════════════════════════════════════════════════════════════

const CFG = window.ERP_CONFIG || {};
const CONFIGURADO = !!(CFG.url && CFG.chave && !/COLE_AQUI/.test(CFG.url + CFG.chave));
const sb = CONFIGURADO ? window.supabase.createClient(CFG.url, CFG.chave) : null;

const E = {                 // estado da tela
  perfil: null,
  tela: 'inicio',
  clientes: [], grupos: [],
  mes: primeiroDiaDoMes(new Date()),
  fin: { tipo: 'todos', sit: 'todos', busca: '' },
  cli: { busca: '' },
  ctr: { busca: '', status: 'Ativo' }
};

// ─────────────────────────── utilitários ───────────────────────────
const $ = (id) => document.getElementById(id);
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function brl(n) { return fmtBRL.format(Number(n) || 0); }
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
  const ultimo = fimDoMes(alvo).getDate();
  alvo.setDate(Math.min(dia, ultimo));
  return iso(alvo);
}
function dataBR(isoStr) {
  if (!isoStr) return '—';
  const [a, m, d] = String(isoStr).slice(0, 10).split('-');
  return d + '/' + m + '/' + a;
}
function nomeMes(d) { const t = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); }
// Aceita "1.234,56", "1234,56", "1234.56" e "R$ 1.234,56".
function lerValor(txt) {
  let s = String(txt || '').replace(/[R$\s]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
function valorParaCampo(n) { return (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }
function mascaraDoc(s) {
  const d = soDigitos(s);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return s || '';
}
function normalizar(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

function situacao(l) {
  if (l.pago) return 'pago';
  const h = hojeISO();
  if (l.vencimento < h) return 'vencido';
  if (l.vencimento === h) return 'hoje';
  return 'aberto';
}
const ROTULO_SIT = { pago: 'Pago', vencido: 'Em atraso', hoje: 'Vence hoje', aberto: 'Em aberto' };
function pillSit(l) { const s = situacao(l); return '<span class="pill ' + s + '">' + ROTULO_SIT[s] + '</span>'; }

let _avisoT;
function aviso(msg, erro) {
  const a = $('aviso');
  a.textContent = msg;
  a.className = 'mostrar' + (erro ? ' erro' : '');
  clearTimeout(_avisoT);
  _avisoT = setTimeout(() => { a.className = ''; }, erro ? 6000 : 3000);
}

function erroAmigavel(e) {
  const m = String((e && (e.message || e.error_description)) || e || '');
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(m)) return 'E-mail ainda não confirmado. Peça ao administrador para confirmar o usuário.';
  if (/row-level security|permission denied/i.test(m)) return 'Você não tem permissão para fazer isso.';
  if (/foreign key|violates.*restrict/i.test(m)) return 'Não dá para excluir: existem contratos ligados a este cadastro.';
  if (/grupos_nome_unico/i.test(m)) return 'Já existe um grupo com esse nome.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
  if (/JWT expired|session/i.test(m)) return 'Sua sessão expirou. Entre de novo.';
  return m || 'Erro inesperado.';
}

// Executa uma consulta do Supabase e lança erro legível se falhar.
async function q(consulta) {
  const { data, error } = await consulta;
  if (error) throw error;
  return data;
}

// Trava o botão enquanto salva, para não gravar duas vezes.
async function comBotao(btn, fn) {
  if (btn) btn.disabled = true;
  try { await fn(); }
  catch (e) { console.error(e); aviso(erroAmigavel(e), true); }
  finally { if (btn) btn.disabled = false; }
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
  const primeiro = fundo.querySelector('input:not([type=hidden]),select,textarea');
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
    q(sb.from('clientes').select('*, grupos(nome)').order('nome')),
    q(sb.from('grupos').select('*').order('nome'))
  ]);
  E.clientes = clientes; E.grupos = grupos;
}

// ─────────────────────────── navegação ─────────────────────────────
$('menu').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-tela]');
  if (b) irPara(b.dataset.tela);
});

const TELAS = {};
async function irPara(tela) {
  if (!TELAS[tela] || (tela === 'usuarios' && E.perfil.papel !== 'admin')) tela = 'inicio';
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

// ─────────────────────────── INÍCIO ────────────────────────────────
TELAS.inicio = async function () {
  const h = hojeISO();
  const ini = iso(primeiroDiaDoMes(new Date())), fim = iso(fimDoMes(new Date()));
  const sel = '*, clientes(nome)';
  const [doMes, pagosNoMes, atrasados, proximos] = await Promise.all([
    q(sb.from('lancamentos').select(sel).gte('vencimento', ini).lte('vencimento', fim).eq('pago', false)),
    q(sb.from('lancamentos').select('tipo, valor').gte('data_pagamento', ini).lte('data_pagamento', fim).eq('pago', true)),
    q(sb.from('lancamentos').select(sel).lt('vencimento', h).eq('pago', false).order('vencimento')),
    q(sb.from('lancamentos').select(sel).gte('vencimento', h).lte('vencimento', somarDias(h, 15)).eq('pago', false).order('vencimento'))
  ]);
  const soma = (lista, tipo) => lista.filter((l) => l.tipo === tipo).reduce((s, l) => s + Number(l.valor), 0);
  const conta = (lista, tipo) => lista.filter((l) => l.tipo === tipo).length;
  const recebido = soma(pagosNoMes, 'receita'), pago = soma(pagosNoMes, 'despesa');
  const aReceber = soma(doMes, 'receita'), aPagar = soma(doMes, 'despesa');
  const atrasoRec = soma(atrasados, 'receita');

  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Olá, ' + esc((E.perfil.nome || '').split(' ')[0]) + '</h1>' +
    '<p>Resumo de ' + esc(nomeMes(new Date())) + '</p></div>' +
    '<div class="acoes"><button class="btn btn-p" data-novo="receita">+ Receita</button>' +
    '<button class="btn btn-o" data-novo="despesa">+ Despesa</button>' +
    '<button class="btn btn-o" data-novo="contrato">+ Contrato</button></div></div>' +
    '<div class="kpis">' +
    kpi('Recebido no mês', brl(recebido), 'verde', conta(pagosNoMes, 'receita') + ' recebimento(s)') +
    kpi('A receber no mês', brl(aReceber), '', conta(doMes, 'receita') + ' em aberto') +
    kpi('A pagar no mês', brl(aPagar), 'ambar', conta(doMes, 'despesa') + ' conta(s)') +
    kpi('Em atraso (a receber)', brl(atrasoRec), 'vermelho', conta(atrasados, 'receita') + ' lançamento(s)') +
    kpi('Saldo do mês', brl(recebido - pago), recebido - pago >= 0 ? 'verde' : 'vermelho', 'recebido − pago') +
    '</div>' +
    '<div class="duas-col">' +
    cardLista('⚠ Em atraso', atrasados, 'Nada em atraso. 👏') +
    cardLista('🗓 Próximos 15 dias', proximos, 'Nenhum vencimento nos próximos 15 dias.') +
    '</div>';
  ligarAcoesLancamentos($('conteudo'));
  ligarBotoesNovo($('conteudo'));
};
function kpi(rotulo, valor, cor, sub) {
  return '<div class="kpi ' + cor + '"><div class="kpi-l">' + rotulo + '</div><div class="kpi-v">' + valor +
    '</div><div class="kpi-s">' + esc(sub) + '</div></div>';
}
function cardLista(titulo, lista, vazio) {
  const linhas = lista.map((l) =>
    '<tr><td class="mono">' + dataBR(l.vencimento) + '</td><td>' + esc(l.descricao) +
    '<div class="sub">' + (l.tipo === 'receita' ? 'Receita' : 'Despesa') + (l.clientes ? ' · ' + esc(l.clientes.nome) : '') + '</div></td>' +
    '<td class="num mono ' + (l.tipo === 'receita' ? 'valor-rec' : 'valor-desp') + '">' + brl(l.valor) + '</td>' +
    '<td class="acoes-l"><button class="btn btn-v btn-mini" data-pagar="' + l.id + '">✓ ' + (l.tipo === 'receita' ? 'Recebido' : 'Pago') + '</button></td></tr>').join('');
  return '<div class="card"><div class="card-hd">' + titulo + '<span class="pill neutro">' + lista.length + '</span></div>' +
    (lista.length ? '<div class="tabela-wrap"><table><tbody>' + linhas + '</tbody></table></div>'
                  : '<div class="vazio">' + vazio + '</div>') + '</div>';
}
function ligarBotoesNovo(raiz) {
  raiz.querySelectorAll('[data-novo]').forEach((b) => {
    b.onclick = () => {
      const t = b.dataset.novo;
      if (t === 'contrato') formContrato();
      else if (t === 'cliente') formCliente();
      else formLancamento({ tipo: t });
    };
  });
}

// ─────────────────────────── FINANCEIRO ────────────────────────────
TELAS.financeiro = async function () {
  const F = E.fin;
  let consulta = sb.from('lancamentos').select('*, clientes(nome), contratos(descricao)');
  // "Em atraso" mostra tudo que venceu e não foi pago, de qualquer mês.
  if (F.sit === 'vencidos') consulta = consulta.lt('vencimento', hojeISO()).eq('pago', false);
  else consulta = consulta.gte('vencimento', iso(E.mes)).lte('vencimento', iso(fimDoMes(E.mes)));
  if (F.tipo !== 'todos') consulta = consulta.eq('tipo', F.tipo);
  if (F.sit === 'pendentes') consulta = consulta.eq('pago', false);
  if (F.sit === 'pagos') consulta = consulta.eq('pago', true);
  let lista = await q(consulta.order('vencimento').order('descricao'));
  if (F.busca) {
    const b = normalizar(F.busca);
    lista = lista.filter((l) => normalizar(l.descricao + ' ' + (l.clientes ? l.clientes.nome : '') + ' ' + l.categoria).includes(b));
  }
  const rec = lista.filter((l) => l.tipo === 'receita').reduce((s, l) => s + Number(l.valor), 0);
  const desp = lista.filter((l) => l.tipo === 'despesa').reduce((s, l) => s + Number(l.valor), 0);

  const seg = (grupo, val, rot) => '<button data-' + grupo + '="' + val + '" class="' + (F[grupo] === val ? 'ativo' : '') + '">' + rot + '</button>';
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Financeiro</h1><p>Receitas e despesas do escritório</p></div>' +
    '<div class="acoes"><button class="btn btn-p" data-novo="receita">+ Receita</button>' +
    '<button class="btn btn-o" data-novo="despesa">+ Despesa</button></div></div>' +
    '<div class="filtros">' +
    (F.sit === 'vencidos' ? '<span class="pill vencido" style="padding:8px 12px">Todos os meses</span>'
      : '<div class="mes-sel"><button data-mes="-1" aria-label="Mês anterior">‹</button><span>' + esc(nomeMes(E.mes)) +
        '</span><button data-mes="1" aria-label="Próximo mês">›</button></div>') +
    '<div class="segmento">' + seg('tipo', 'todos', 'Tudo') + seg('tipo', 'receita', 'Receitas') + seg('tipo', 'despesa', 'Despesas') + '</div>' +
    '<div class="segmento">' + seg('sit', 'todos', 'Todos') + seg('sit', 'pendentes', 'Em aberto') + seg('sit', 'pagos', 'Pagos') + seg('sit', 'vencidos', 'Em atraso') + '</div>' +
    '<input class="busca" id="fin-busca" placeholder="Buscar descrição, cliente ou categoria" value="' + esc(F.busca) + '">' +
    '</div>' +
    '<div class="card">' + tabelaLancamentos(lista, true) +
    (lista.length ? '<div class="card-bd" style="display:flex;gap:26px;justify-content:flex-end;flex-wrap:wrap;border-top:1px solid var(--border)">' +
      '<span>Receitas <b class="mono valor-rec">' + brl(rec) + '</b></span>' +
      '<span>Despesas <b class="mono valor-desp">' + brl(desp) + '</b></span>' +
      '<span>Resultado <b class="mono">' + brl(rec - desp) + '</b></span></div>' : '') +
    '</div>';

  const c = $('conteudo');
  c.querySelectorAll('[data-mes]').forEach((b) => b.onclick = () => {
    E.mes = new Date(E.mes.getFullYear(), E.mes.getMonth() + Number(b.dataset.mes), 1); recarregar();
  });
  c.querySelectorAll('[data-tipo]').forEach((b) => b.onclick = () => { F.tipo = b.dataset.tipo; recarregar(); });
  c.querySelectorAll('[data-sit]').forEach((b) => b.onclick = () => { F.sit = b.dataset.sit; recarregar(); });
  let t;
  $('fin-busca').oninput = (ev) => {
    clearTimeout(t);
    t = setTimeout(async () => { F.busca = ev.target.value; await recarregar(); const i = $('fin-busca'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300);
  };
  ligarAcoesLancamentos(c);
  ligarBotoesNovo(c);
};

function tabelaLancamentos(lista, completa) {
  if (!lista.length) return '<div class="vazio">Nenhum lançamento aqui.</div>';
  return '<div class="tabela-wrap"><table><thead><tr><th>Vencimento</th><th>Descrição</th>' +
    (completa ? '<th>Cliente</th><th>Categoria</th>' : '') +
    '<th class="num">Valor</th><th>Situação</th><th></th></tr></thead><tbody>' +
    lista.map((l) =>
      '<tr><td class="mono">' + dataBR(l.vencimento) + '</td>' +
      '<td>' + esc(l.descricao) + (l.pago && l.data_pagamento ? '<div class="sub">pago em ' + dataBR(l.data_pagamento) + (l.forma_pagamento ? ' · ' + esc(l.forma_pagamento) : '') + '</div>' : '') + '</td>' +
      (completa ? '<td>' + (l.clientes ? esc(l.clientes.nome) : '<span class="sub">—</span>') + '</td><td>' + esc(l.categoria || '—') + '</td>' : '') +
      '<td class="num mono ' + (l.tipo === 'receita' ? 'valor-rec' : 'valor-desp') + '">' + (l.tipo === 'despesa' ? '− ' : '') + brl(l.valor) + '</td>' +
      '<td>' + pillSit(l) + '</td>' +
      '<td class="acoes-l">' +
      (l.pago ? '<button class="btn btn-o btn-mini" data-desfazer="' + l.id + '" title="Voltar para em aberto">↺</button> '
              : '<button class="btn btn-v btn-mini" data-pagar="' + l.id + '">✓ ' + (l.tipo === 'receita' ? 'Recebido' : 'Pago') + '</button> ') +
      '<button class="btn btn-o btn-mini" data-editar="' + l.id + '">Editar</button></td></tr>').join('') +
    '</tbody></table></div>';
}

function ligarAcoesLancamentos(raiz, depois) {
  const apos = depois || recarregar;
  raiz.querySelectorAll('[data-pagar]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    await q(sb.from('lancamentos').update({ pago: true }).eq('id', b.dataset.pagar));
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

const CATEGORIAS = {
  receita: ['Honorários', 'Honorários de êxito', 'Consultoria mensal', 'Reembolso', 'Outras receitas'],
  despesa: ['Aluguel', 'Salários', 'Impostos', 'Sistemas e softwares', 'Custas processuais', 'Marketing', 'Contabilidade', 'Outras despesas']
};

function formLancamento(l, depois) {
  const novo = !l.id;
  const tipo = l.tipo || 'receita';
  const j = abrirJanela({
    titulo: (novo ? 'Nova ' : 'Editar ') + (tipo === 'receita' ? 'receita' : 'despesa'),
    corpo:
      '<form id="f-lanc" class="grade">' +
      campo('Descrição <span class="obrig">*</span>', '<input name="descricao" required maxlength="200" value="' + esc(l.descricao || '') + '">', 'inteiro') +
      campo('Valor (R$) <span class="obrig">*</span>', '<input name="valor" required inputmode="decimal" placeholder="0,00" value="' + (l.valor ? valorParaCampo(l.valor) : '') + '">') +
      campo('Vencimento <span class="obrig">*</span>', '<input name="vencimento" type="date" required value="' + esc(l.vencimento || hojeISO()) + '">') +
      campo('Cliente', '<select name="cliente_id">' + opcoesClientes(l.cliente_id) + '</select>') +
      campo('Categoria', '<input name="categoria" list="lista-cat" value="' + esc(l.categoria || '') + '"><datalist id="lista-cat">' +
        CATEGORIAS[tipo].map((c) => '<option value="' + esc(c) + '">').join('') + '</datalist>') +
      '<label class="check inteiro"><input type="checkbox" name="pago"' + (l.pago ? ' checked' : '') + '> Já foi ' + (tipo === 'receita' ? 'recebido' : 'pago') + '</label>' +
      '<div id="bloco-pag" class="grade inteiro' + (l.pago ? '' : ' escondido') + '">' +
      campo('Data do pagamento', '<input name="data_pagamento" type="date" value="' + esc(l.data_pagamento || hojeISO()) + '">') +
      campo('Forma de pagamento', '<input name="forma_pagamento" list="lista-forma" value="' + esc(l.forma_pagamento || '') + '"><datalist id="lista-forma">' +
        ['PIX', 'Boleto', 'Transferência', 'Cartão', 'Dinheiro'].map((c) => '<option value="' + c + '">').join('') + '</datalist>') +
      '</div>' +
      (novo ? campo('Repetir todo mês por', '<select name="repetir">' + [1, 2, 3, 6, 12, 24].map((n) =>
        '<option value="' + n + '">' + (n === 1 ? 'Não repetir' : n + ' meses') + '</option>').join('') + '</select>') : '') +
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
    const dados = {
      tipo, descricao: f.descricao.value.trim(), valor, vencimento: f.vencimento.value,
      cliente_id: f.cliente_id.value || null, categoria: f.categoria.value.trim(),
      pago: f.pago.checked,
      data_pagamento: f.pago.checked ? (f.data_pagamento.value || hojeISO()) : null,
      forma_pagamento: f.pago.checked ? f.forma_pagamento.value.trim() : '',
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
    await q(sb.from('lancamentos').delete().eq('id', l.id));
    aviso('Lançamento excluído.'); fecharJanela(j); await apos();
  });
}

// ─────────────────────────── CONTRATOS ─────────────────────────────
TELAS.contratos = async function () {
  const F = E.ctr;
  let consulta = sb.from('contratos').select('*, clientes(nome, grupos(nome)), lancamentos(valor, pago, vencimento)').order('data_contrato', { ascending: false });
  if (F.status !== 'todos') consulta = consulta.eq('status', F.status);
  let lista = await q(consulta);
  if (F.busca) {
    const b = normalizar(F.busca);
    lista = lista.filter((c) => normalizar(c.descricao + ' ' + (c.clientes ? c.clientes.nome : '')).includes(b));
  }
  const h = hojeISO();
  const seg = (val, rot) => '<button data-status="' + val + '" class="' + (F.status === val ? 'ativo' : '') + '">' + rot + '</button>';
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Contratos</h1><p>Ao cadastrar um contrato, as parcelas entram sozinhas no Financeiro</p></div>' +
    '<div class="acoes"><button class="btn btn-p" data-novo="contrato">+ Novo contrato</button></div></div>' +
    '<div class="filtros"><div class="segmento">' + seg('Ativo', 'Ativos') + seg('Encerrado', 'Encerrados') + seg('Cancelado', 'Cancelados') + seg('todos', 'Todos') + '</div>' +
    '<input class="busca" id="ctr-busca" placeholder="Buscar cliente ou descrição" value="' + esc(F.busca) + '"></div>' +
    '<div class="card">' + (lista.length ?
      '<div class="tabela-wrap"><table><thead><tr><th>Cliente</th><th>Contrato</th><th>Data</th><th class="num">Valor</th><th class="num">Recebido</th><th>Parcelas</th><th>Situação</th></tr></thead><tbody>' +
      lista.map((c) => {
        const parc = c.lancamentos || [];
        const recebido = parc.filter((p) => p.pago).reduce((s, p) => s + Number(p.valor), 0);
        const atraso = parc.some((p) => !p.pago && p.vencimento < h);
        return '<tr class="clicavel" data-ctr="' + c.id + '"><td>' + esc(c.clientes ? c.clientes.nome : '—') +
          (c.clientes && c.clientes.grupos ? '<div class="sub">' + esc(c.clientes.grupos.nome) + '</div>' : '') + '</td>' +
          '<td>' + esc(c.descricao) + (c.percentual_exito ? '<div class="sub">+ ' + esc(String(c.percentual_exito).replace('.', ',')) + '% de êxito</div>' : '') + '</td>' +
          '<td class="mono">' + dataBR(c.data_contrato) + '</td>' +
          '<td class="num mono">' + brl(c.valor_total) + '</td>' +
          '<td class="num mono valor-rec">' + brl(recebido) + '</td>' +
          '<td>' + parc.filter((p) => p.pago).length + '/' + parc.length + '</td>' +
          '<td>' + (atraso ? '<span class="pill vencido">Parcela em atraso</span>' : '<span class="pill ' + (c.status === 'Ativo' ? 'aberto' : 'neutro') + '">' + esc(c.status) + '</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>'
      : '<div class="vazio">Nenhum contrato' + (F.status !== 'todos' ? ' com essa situação' : '') + '.</div>') + '</div>';
  const c = $('conteudo');
  c.querySelectorAll('[data-status]').forEach((b) => b.onclick = () => { F.status = b.dataset.status; recarregar(); });
  c.querySelectorAll('[data-ctr]').forEach((tr) => tr.onclick = () => detalheContrato(tr.dataset.ctr));
  let t;
  $('ctr-busca').oninput = (ev) => {
    clearTimeout(t);
    t = setTimeout(async () => { F.busca = ev.target.value; await recarregar(); const i = $('ctr-busca'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300);
  };
  ligarBotoesNovo(c);
};

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
          '<div class="dica inteiro">Valor e parcelas já foram lançados no Financeiro. Para ajustar uma parcela, use o botão Editar dela.</div>') +
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
      await q(sb.from('contratos').insert(dados));
      aviso(v > 0 ? '✓ Contrato criado e ' + n + ' parcela(s) lançada(s) no Financeiro.' : '✓ Contrato criado.');
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
  const ct = await q(sb.from('contratos').select('*, clientes(nome)').eq('id', id).single());
  const parc = await q(sb.from('lancamentos').select('*').eq('contrato_id', id).order('vencimento'));
  const recebido = parc.filter((p) => p.pago).reduce((s, p) => s + Number(p.valor), 0);
  const total = parc.reduce((s, p) => s + Number(p.valor), 0);
  const j = abrirJanela({
    titulo: ct.descricao, larga: true,
    corpo:
      '<div class="kpis" style="margin-bottom:12px">' +
      kpi('Cliente', '<span style="font-family:var(--font-d);font-size:16px">' + esc(ct.clientes ? ct.clientes.nome : '—') + '</span>', '', 'Contrato de ' + dataBR(ct.data_contrato)) +
      kpi('Recebido', brl(recebido), 'verde', parc.filter((p) => p.pago).length + ' de ' + parc.length + ' parcela(s)') +
      kpi('Falta receber', brl(total - recebido), 'ambar', ct.percentual_exito ? '+ ' + String(ct.percentual_exito).replace('.', ',') + '% de êxito' : ct.status) +
      '</div>' +
      (ct.obs ? '<div class="dica" style="margin-bottom:12px">' + esc(ct.obs) + '</div>' : '') +
      '<div class="card" style="margin:0" id="ctr-parcelas">' + tabelaLancamentos(parc, false) + '</div>' +
      '<div style="margin-top:10px"><button class="btn btn-o btn-mini" id="ctr-add-parc">+ Lançar valor avulso neste contrato (ex.: êxito)</button></div>',
    rodape:
      (E.perfil.papel === 'admin' ? '<button class="btn btn-x" id="btn-excluir-ctr" type="button">Excluir contrato</button>' : '<span></span>') +
      '<button class="btn btn-o" id="btn-editar-ctr" type="button">Editar contrato</button>'
  });
  const reabrir = async () => { fecharJanela(j); await detalheContrato(id); };
  ligarAcoesLancamentos(j, reabrir);
  j.querySelector('#btn-editar-ctr').onclick = () => formContrato(ct);
  j.querySelector('#ctr-add-parc').onclick = () => {
    formLancamento({ tipo: 'receita', cliente_id: ct.cliente_id, contrato_id: id,
                     categoria: 'Honorários de êxito', descricao: ct.descricao + ' — êxito' }, reabrir);
  };
  const bx = j.querySelector('#btn-excluir-ctr');
  if (bx) bx.onclick = () => comBotao(bx, async () => {
    if (!confirm('Excluir o contrato e TODAS as parcelas dele no Financeiro? Esta ação não pode ser desfeita.')) return;
    await q(sb.from('contratos').delete().eq('id', id));
    aviso('Contrato excluído.'); fecharJanela(j); await recarregar();
  });
}

// ─────────────────────────── CLIENTES ──────────────────────────────
TELAS.clientes = async function () {
  await carregarCadastros();
  const b = normalizar(E.cli.busca);
  const lista = E.clientes.filter((c) => !b ||
    normalizar(c.nome + ' ' + (c.grupos ? c.grupos.nome : '') + ' ' + c.responsavel).includes(b) ||
    (soDigitos(b) && soDigitos(c.cpf_cnpj).includes(soDigitos(b))));
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Clientes</h1><p>' + E.clientes.length + ' cadastrado(s)</p></div>' +
    '<div class="acoes"><button class="btn btn-p" data-novo="cliente">+ Novo cliente</button></div></div>' +
    '<div class="filtros"><input class="busca" id="cli-busca" placeholder="Buscar nome, grupo, responsável ou CPF/CNPJ" value="' + esc(E.cli.busca) + '"></div>' +
    '<div class="card">' + (lista.length ?
      '<div class="tabela-wrap"><table><thead><tr><th>Nome</th><th>Grupo</th><th>CPF/CNPJ</th><th>Tipo</th><th>Responsável</th><th>Contato</th></tr></thead><tbody>' +
      lista.map((c) => '<tr class="clicavel" data-cli="' + c.id + '"><td><b>' + esc(c.nome) + '</b></td>' +
        '<td>' + esc(c.grupos ? c.grupos.nome : '—') + '</td><td class="mono">' + esc(mascaraDoc(c.cpf_cnpj)) + '</td>' +
        '<td><span class="pill ' + (c.tipo === 'Inativo' ? 'neutro' : 'aberto') + '">' + esc(c.tipo) + '</span></td>' +
        '<td>' + esc(c.responsavel || '—') + '</td><td>' + esc(c.telefone || c.email || '—') + '</td></tr>').join('') +
      '</tbody></table></div>'
      : '<div class="vazio">' + (E.clientes.length ? 'Nenhum cliente encontrado.' : 'Nenhum cliente ainda. Clique em "+ Novo cliente".') + '</div>') + '</div>';
  const c = $('conteudo');
  c.querySelectorAll('[data-cli]').forEach((tr) => tr.onclick = () => formCliente(E.clientes.find((x) => x.id === tr.dataset.cli)));
  $('cli-busca').oninput = (ev) => {
    E.cli.busca = ev.target.value;
    clearTimeout(c._t);
    c._t = setTimeout(async () => { await recarregar(); const i = $('cli-busca'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250);
  };
  ligarBotoesNovo(c);
};

async function formCliente(cl) {
  const novo = !cl;
  cl = cl || {};
  let resumo = '';
  if (!novo) {
    const [ctrs, abertos] = await Promise.all([
      q(sb.from('contratos').select('id, descricao, status').eq('cliente_id', cl.id)),
      q(sb.from('lancamentos').select('valor, vencimento').eq('cliente_id', cl.id).eq('tipo', 'receita').eq('pago', false))
    ]);
    const emAberto = abertos.reduce((s, l) => s + Number(l.valor), 0);
    const atraso = abertos.filter((l) => l.vencimento < hojeISO()).reduce((s, l) => s + Number(l.valor), 0);
    resumo = '<div class="dica inteiro"><b>' + ctrs.length + '</b> contrato(s) · em aberto <b class="mono">' + brl(emAberto) + '</b>' +
      (atraso ? ' · <span style="color:var(--red)">em atraso <b class="mono">' + brl(atraso) + '</b></span>' : '') + '</div>';
  }
  const g = cl.grupos ? cl.grupos.nome : '';
  const j = abrirJanela({
    titulo: novo ? 'Novo cliente' : cl.nome,
    corpo:
      '<form id="f-cli" class="grade">' + resumo +
      campo('Nome / Razão social <span class="obrig">*</span>', '<input name="nome" required maxlength="200" value="' + esc(cl.nome || '') + '">', 'inteiro') +
      campo('CPF/CNPJ', '<input name="cpf_cnpj" inputmode="numeric" maxlength="18" value="' + esc(mascaraDoc(cl.cpf_cnpj)) + '">') +
      campo('Grupo', '<input name="grupo" list="lista-grupos" placeholder="Digite ou escolha" value="' + esc(g) + '"><datalist id="lista-grupos">' +
        E.grupos.map((x) => '<option value="' + esc(x.nome) + '">').join('') + '</datalist>') +
      campo('Tipo', '<select name="tipo">' + ['Consultoria', 'Demanda', 'Inativo'].map((t) => '<option' + (cl.tipo === t ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>') +
      campo('Responsável no escritório', '<input name="responsavel" value="' + esc(cl.responsavel || '') + '">') +
      campo('E-mail', '<input name="email" type="email" value="' + esc(cl.email || '') + '">') +
      campo('Telefone / WhatsApp', '<input name="telefone" inputmode="tel" value="' + esc(cl.telefone || '') + '">') +
      campo('Endereço', '<input name="endereco" value="' + esc(cl.endereco || '') + '">', 'inteiro') +
      campo('Cidade', '<input name="cidade" value="' + esc(cl.cidade || '') + '">') +
      campo('UF', '<input name="estado" maxlength="2" style="text-transform:uppercase" value="' + esc(cl.estado || '') + '">') +
      campo('Observação interna', '<textarea name="obs" maxlength="4000">' + esc(cl.obs || '') + '</textarea>', 'inteiro') +
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
  const bc = j.querySelector('#btn-ctr-cli');
  if (bc) bc.onclick = () => { fecharJanela(j); formContrato({ cliente_id: cl.id }); };

  j.querySelector('#btn-salvar-cli').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.nome.value.trim()) throw new Error('Preencha o nome.');
    const grupo_id = await grupoPorNome(f.grupo.value);
    const dados = {
      nome: f.nome.value.trim(), cpf_cnpj: soDigitos(f.cpf_cnpj.value), grupo_id, tipo: f.tipo.value,
      responsavel: f.responsavel.value.trim(), email: f.email.value.trim(), telefone: f.telefone.value.trim(),
      endereco: f.endereco.value.trim(), cidade: f.cidade.value.trim(), estado: f.estado.value.trim().toUpperCase(),
      obs: f.obs.value.trim()
    };
    if (novo) await q(sb.from('clientes').insert(dados));
    else await q(sb.from('clientes').update(dados).eq('id', cl.id));
    aviso(novo ? '✓ Cliente cadastrado.' : '✓ Cadastro atualizado.');
    fecharJanela(j);
    await carregarCadastros();
    await recarregar();
  });
  const bx = j.querySelector('#btn-excluir-cli');
  if (bx) bx.onclick = () => comBotao(bx, async () => {
    if (!confirm('Excluir o cliente "' + cl.nome + '"? Esta ação não pode ser desfeita.')) return;
    await q(sb.from('clientes').delete().eq('id', cl.id));
    aviso('Cliente excluído.'); fecharJanela(j);
    await carregarCadastros(); await recarregar();
  });
}

// Devolve o id do grupo com esse nome; cria se ainda não existir.
async function grupoPorNome(nome) {
  nome = String(nome || '').trim();
  if (!nome) return null;
  const achado = E.grupos.find((g) => normalizar(g.nome) === normalizar(nome));
  if (achado) return achado.id;
  const novo = await q(sb.from('grupos').insert({ nome }).select().single());
  E.grupos.push(novo);
  return novo.id;
}

// ─────────────────────────── USUÁRIOS ──────────────────────────────
TELAS.usuarios = async function () {
  const lista = await q(sb.from('perfis').select('*').order('criado_em'));
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Usuários</h1><p>Quem pode entrar no sistema</p></div></div>' +
    '<div class="card"><div class="card-bd dica" style="border-radius:var(--r) var(--r) 0 0">' +
    '<b>Para cadastrar alguém novo:</b> no site do Supabase, abra o projeto → <b>Authentication</b> → <b>Users</b> → ' +
    '<b>Add user</b> → <b>Create new user</b>, informe e-mail e senha e marque <b>Auto Confirm User</b>. ' +
    'A pessoa aparece aqui como <b>Inativo</b>; troque para <b>Equipe</b> para liberar.</div>' +
    '<div class="tabela-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Acesso</th><th>Desde</th></tr></thead><tbody>' +
    lista.map((p) => '<tr><td><input class="busca" style="min-width:160px" data-nome="' + p.id + '" value="' + esc(p.nome) + '"></td>' +
      '<td>' + esc(p.email) + '</td><td><select class="busca" style="min-width:150px" data-papel="' + p.id + '">' +
      [['admin', 'Administrador'], ['equipe', 'Equipe'], ['inativo', 'Inativo (sem acesso)']].map(([v, r]) =>
        '<option value="' + v + '"' + (p.papel === v ? ' selected' : '') + '>' + r + '</option>').join('') +
      '</select></td><td class="mono">' + dataBR(p.criado_em) + '</td></tr>').join('') +
    '</tbody></table></div></div>' +
    '<div class="dica"><b>Administrador</b>: tudo, inclusive excluir e liberar usuários. <b>Equipe</b>: cadastra, edita e dá baixa, mas não exclui clientes nem contratos. <b>Inativo</b>: não entra.</div>';
  const c = $('conteudo');
  c.querySelectorAll('[data-papel]').forEach((s) => s.onchange = () => comBotao(s, async () => {
    try {
      await q(sb.from('perfis').update({ papel: s.value }).eq('id', s.dataset.papel));
      aviso('✓ Acesso atualizado.');
    } catch (e) { await recarregar(); throw e; }
  }));
  c.querySelectorAll('[data-nome]').forEach((i) => i.onchange = () => comBotao(i, async () => {
    await q(sb.from('perfis').update({ nome: i.value.trim() }).eq('id', i.dataset.nome));
    if (i.dataset.nome === E.perfil.id) { E.perfil.nome = i.value.trim(); $('hd-nome').textContent = E.perfil.nome; }
    aviso('✓ Nome atualizado.');
  }));
};

// ─────────────────────────── início ────────────────────────────────
(async function iniciar() {
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
})();
