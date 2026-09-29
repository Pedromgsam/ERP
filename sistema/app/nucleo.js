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
// plural certo, sem "(s)": plural(1, 'aviso não lido', 'avisos não lidos') → "1 aviso não lido"
function plural(n, um, varios) { return n + ' ' + (Number(n) === 1 ? um : varios); }
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
  'Estagiário (rascunho)': { juridico: 'propor', clientes: 'propor', tarefas: 'ver', documentos: 'ver', contratos: 'ver' },
  'Adm. da Contabilidade': { financeiro_contab: 'editar', clientes: 'editar', contratos: 'editar', documentos: 'editar', tarefas: 'editar', relatorios: 'ver' }
};
// Área do serviço (gráfico "Recebido por tipo de serviço"). A consultoria mensal continua sendo a regra de recorrência do contrato.
const AREAS_SERVICO = ['Tributário', 'Imobiliário', 'Empresarial', 'Sucessões', 'Família', 'Criminal', 'Trabalhista', 'Contratual', 'Cobrança', 'Consultoria'];
function selectServico(valor) {
  return '<select name="servico"><option value="">— escolha —</option>' + AREAS_SERVICO.concat(valor && !AREAS_SERVICO.includes(valor) ? [valor] : [])
    .map((a) => '<option' + (a === valor ? ' selected' : '') + '>' + esc(a) + '</option>').join('') + '</select>';
}
// Perfil de e-mail ao cliente (Administração → E-mails aos clientes e ficha do cliente)
const PERFIS_EMAIL = [['padrao', 'Padrão', 'lembrete antes do vencimento, cobrança depois do atraso e recibo'],
  ['vencimento', 'Só no vencimento', 'um aviso no dia do vencimento e o recibo; sem lembrete antes nem cobrança'],
  ['nunca', 'Não enviar financeiro', 'nenhum e-mail de honorários (clientes importantes); guias de parcelamento e acordos continuam'],
  ['personalizado', 'Personalizado', 'você marca cada tipo de e-mail']];
const TIPOS_EMAIL = [['lembrete', 'Lembrete antes do vencimento'], ['vencimento', 'Aviso no dia do vencimento'], ['cobranca', 'Cobrança de atraso'],
  ['recibo', 'Recibo / pagamento recebido'], ['parcelamento', 'Guia de parcelamento'], ['acordo', 'Parcela de acordo']];
// modelo que já escolhe "Clientes que vê"
const MODELOS_AREA = { 'Adm. da Contabilidade': 'contabil' };
// Nível "Propor" (rascunho): a pessoa preenche normalmente, mas nada vale até alguém que edita aprovar.
const FUNCOES_PROPOR = ['financeiro_juridico', 'financeiro_contab', 'contratos', 'clientes', 'juridico'];
// Área do cliente e áreas que cada usuário vê
const AREAS = [['juridico', 'Jurídico'], ['contabil', 'Contabilidade'], ['ambos', 'Jurídico + Contabilidade']];
function rotArea(a) { return (AREAS.find((x) => x[0] === (a || 'ambos')) || AREAS[2])[1]; }
function pillArea(a) {
  a = a || 'ambos';
  return '<span class="pill area-' + a + '" title="Área: ' + rotArea(a) + '">' + (a === 'juridico' ? 'Jurídico' : a === 'contabil' ? 'Contábil' : 'Jurídico + Contábil') + '</span>';
}
function minhasAreas(perfil) { const p = perfil || E.perfil || window.ERP_EU || {}; return p.papel === 'admin' ? 'ambos' : (p.areas || 'ambos'); }
// pode('contratos') → pode ver; pode('contratos','editar') → pode gravar. Admin pode tudo.
function pode(f, nivel, perfil) {
  const p = perfil || E.perfil || window.ERP_EU || {};
  if (p.papel === 'admin') return true;
  if (p.papel !== 'equipe') return false;
  const v = (p.funcoes || {})[f], n = nivel || 'ver';
  if (v === 'propor') return n !== 'aprovar';          // vê e preenche; a gravação vira rascunho
  return v === 'editar' || (v === 'ver' && n === 'ver');
}
// esta pessoa trabalha em modo rascunho nesta função?
function emRascunho(f, perfil) {
  const p = perfil || E.perfil || window.ERP_EU || {};
  return p.papel === 'equipe' && (p.funcoes || {})[f] === 'propor';
}
function resumoFuncoes(p) {
  if (p.papel === 'admin') return 'tudo';
  const f = p.funcoes || {}, ks = FUNCOES.filter((x) => f[x[0]]);
  if (ks.length === FUNCOES.length && ks.every((x) => f[x[0]] === 'editar')) return 'tudo';
  return ks.map((x) => x[1].replace('Financeiro — ', 'Fin. ') + (f[x[0]] === 'ver' ? ' (ver)' : f[x[0]] === 'propor' ? ' (rascunho)' : '')).join(' · ') + (p.areas && p.areas !== 'ambos' ? ' · só ' + rotArea(p.areas) : '') || 'nenhuma';
}
// grade de funções (Nenhum / Ver / Editar) com os modelos prontos
function gradeFuncoes(funcoes) {
  funcoes = funcoes || {};
  return '<div class="modelos-acesso">' + Object.keys(MODELOS_ACESSO).map((m) => '<button type="button" class="btn btn-o btn-mini" data-modelo-acesso="' + esc(m) + '">' + esc(m) + '</button>').join('') + '</div>' +
    '<div class="grade-funcoes">' + FUNCOES.map(([k, rot, desc]) => '<div class="gf-lin"><div><b>' + rot + '</b><div class="sub">' + desc + '</div></div><div class="segmento gf-niveis" data-funcao="' + k + '">' +
      [['', 'Nenhum'], ['ver', 'Ver']].concat(FUNCOES_PROPOR.includes(k) ? [['propor', 'Rascunho']] : [], [['editar', 'Editar']]).map(([v, r]) => '<button type="button" data-v="' + v + '" class="' + ((funcoes[k] || '') === v ? 'ativo' : '') + '">' + r + '</button>').join('') + '</div></div>').join('') + '</div>';
}
// quais clientes a pessoa vê: só do Jurídico, só da Contabilidade ou os dois (clientes "Jurídico + Contabilidade" todos veem)
function gradeAreas(areas) {
  return '<div class="gf-lin gf-lin-area"><div><b>Clientes que vê</b><div class="sub">Vale para a lista de clientes, contatos, contratos e documentos</div></div>' +
    '<div class="segmento gf-areas">' + [['juridico', 'Só Jurídico'], ['contabil', 'Só Contabilidade'], ['ambos', 'Os dois']].map(([v, r]) =>
      '<button type="button" data-v="' + v + '" class="' + ((areas || 'ambos') === v ? 'ativo' : '') + '">' + r + '</button>').join('') + '</div></div>';
}
function lerAreas(raiz) { const b = raiz.querySelector('.gf-areas button.ativo'); return b ? b.dataset.v : 'ambos'; }
function ligarGradeFuncoes(raiz) {
  raiz.querySelectorAll('.gf-areas').forEach((g) => g.onclick = (ev) => { const b = ev.target.closest('button'); if (!b) return; g.querySelectorAll('button').forEach((x) => x.classList.toggle('ativo', x === b)); });
  raiz.querySelectorAll('.gf-niveis').forEach((g) => g.onclick = (ev) => { const b = ev.target.closest('button'); if (!b) return; g.querySelectorAll('button').forEach((x) => x.classList.toggle('ativo', x === b)); });
  raiz.querySelectorAll('[data-modelo-acesso]').forEach((b) => b.onclick = () => {
    const m = MODELOS_ACESSO[b.dataset.modeloAcesso], area = MODELOS_AREA[b.dataset.modeloAcesso];
    if (area) raiz.querySelectorAll('.gf-areas button').forEach((x) => x.classList.toggle('ativo', x.dataset.v === area));
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
  'Adriana':    { fundo: '#DBEAFE', marca: '#3B6FD4', texto: '#1D4ED8' },
  'João Vitor': { fundo: '#E9DDFB', marca: '#7C4DCC', texto: '#5B2E9E' },
  'Éder':       { fundo: '#D5F0EC', marca: '#2D8C7E', texto: '#1F6B60' }
};
function corPessoa(n) { return PESSOA[String(n || '').trim()] || { fundo: '#EEF1F7', marca: '#6B7280', texto: '#4B5563' }; }
function pillPessoa(n) {
  if (!n) return '<span class="sub">—</span>';
  const c = corPessoa(n);
  return '<span class="pill pill-pessoa" style="background:' + c.fundo + ';color:' + c.texto + '">' + esc(n) + '</span>';
}

// ─────────────────────────── avisos e erros ────────────────────────
let _avisoT;
function aviso(msg, erro) {
  if (/^📝/.test(String(msg))) erro = false;              // rascunho enviado: não é erro
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
  if (e && e.rascunho) return e.message;
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
  catch (e) {
    if (e && e.rascunho) { const j = btn && btn.closest && btn.closest('.fundo'); if (j) fecharJanela(j); aviso(e.message); return; }
    console.error(e); aviso(erroAmigavel(e), true);
  }
  finally { if (btn) btn.disabled = false; }
}

// ═════════════ RASCUNHO (nível "Propor" das funções de acesso) ═════════════
// Quem tem "Rascunho" numa função usa as telas normalmente; na hora de gravar, em vez de
// alterar o banco, a alteração vai para public.rascunhos (RPC propor_alteracao) e só vale
// depois que alguém que edita aquela área aprovar (tela Aprovações). O banco garante a regra:
// sem "Editar", a gravação direta é recusada pela RLS.
const TABELAS_RASCUNHO = { clientes: 'clientes', contatos: 'clientes', enderecos: 'clientes', contas_bancarias: 'clientes', vinculos_societarios: 'clientes',
  interacoes: 'clientes', certidoes: 'clientes', cliente_etiquetas: 'clientes', contratos: 'contratos',
  processos: 'juridico', parcelamentos: 'juridico', parcelas: 'juridico', acordos: 'juridico', lancamentos: '*fin' };
const NOME_TAB_RASC = { clientes: 'cliente', contatos: 'contato', enderecos: 'endereço', contas_bancarias: 'conta bancária', vinculos_societarios: 'vínculo societário',
  interacoes: 'interação', certidoes: 'certidão', cliente_etiquetas: 'etiqueta', contratos: 'contrato', processos: 'processo', parcelamentos: 'parcelamento',
  parcelas: 'parcela', acordos: 'acordo', lancamentos: 'lançamento' };
function funcaoDaGravacao(t, dados, filtros) {
  const f = TABELAS_RASCUNHO[t];
  if (f !== '*fin') return f;
  const um = Array.isArray(dados) ? dados[0] : dados;
  const emp = (um && um.empresa) || (filtros.id && window.ERP_LANC && window.ERP_LANC[filtros.id] && window.ERP_LANC[filtros.id].empresa) || '';
  if (emp) return emp === 'contabilidade' ? 'financeiro_contab' : 'financeiro_juridico';
  return emRascunho('financeiro_juridico') ? 'financeiro_juridico' : 'financeiro_contab';
}
function resumoRascunho(t, op, dados, filtros) {
  const um = (Array.isArray(dados) ? dados[0] : dados) || {};
  const nome = um.nome || um.descricao || um.titulo || um.numero || um.processo || '';
  const campos = op === 'alterar' ? Object.keys(um).filter((k) => !/^(id|atualizado_em)$/.test(k)).length : 0;
  return ({ incluir: 'Incluir ', alterar: 'Alterar ', excluir: 'Excluir ' }[op]) + (NOME_TAB_RASC[t] || t) + (nome ? ': ' + nome : '') +
    (op === 'alterar' && !nome ? ' (' + campos + ' campo(s))' : '') + (Array.isArray(dados) && dados.length > 1 ? ' (+' + (dados.length - 1) + ')' : '');
}
function envolverRascunho(cli) {
  if (!cli || cli._rascunho) return cli;
  cli._rascunho = true;
  const fromOriginal = cli.from.bind(cli);
  cli.from = (t) => {
    const real = fromOriginal(t);
    if (!TABELAS_RASCUNHO[t]) return real;
    return new Proxy(real, { get(alvo, k) {
      if (!['insert', 'update', 'upsert', 'delete'].includes(k)) { const v = alvo[k]; return typeof v === 'function' ? v.bind(alvo) : v; }
      return (dados, opcoes) => construtorGravacao(real, t, k, dados, opcoes);
    } });
  };
  return cli;
}
// grava o encadeamento (.eq, .select, .single…) e decide no fim: grava direto ou vira rascunho
function construtorGravacao(real, t, metodo, dados, opcoes) {
  const cadeia = [], filtros = {};
  const eu = {
    then(ok, falha) { return executar().then(ok, falha); },
    catch(falha) { return executar().catch(falha); }
  };
  ['eq', 'in', 'match', 'select', 'single', 'maybeSingle', 'order', 'limit', 'neq', 'is', 'not', 'gte', 'lte', 'lt', 'gt', 'filter', 'contains', 'range', 'throwOnError'].forEach((m) => {
    eu[m] = (...a) => { cadeia.push([m, a]);
      if (m === 'eq') filtros[a[0]] = a[1]; else if (m === 'in') filtros[a[0]] = a[1]; else if (m === 'match') Object.assign(filtros, a[0]);
      else if (!['select', 'single', 'maybeSingle', 'order', 'limit', 'throwOnError'].includes(m)) filtros._outro = true;
      return eu; };
  });
  let _p = null;
  function executar() {
    if (_p) return _p;
    const d = metodo === 'delete' ? null : dados;
    if (metodo === 'upsert' && d && !Array.isArray(d) && d.id) filtros.id = d.id;
    const f = funcaoDaGravacao(t, d, filtros);
    if (!emRascunho(f) || filtros._outro) {
      let b = metodo === 'delete' ? real.delete(opcoes) : real[metodo](dados, opcoes);
      cadeia.forEach(([m, a]) => { b = b[m](...a); });
      return (_p = Promise.resolve(b));
    }
    const op = metodo === 'insert' || (metodo === 'upsert' && !filtros.id) ? 'incluir' : metodo === 'delete' ? 'excluir' : 'alterar';
    const semId = Object.assign({}, filtros);
    return (_p = sb.rpc('propor_alteracao', { p_tabela: t, p_operacao: op, p_filtros: op === 'incluir' ? {} : semId, p_dados: d || {}, p_resumo: resumoRascunho(t, op, d, filtros) })
      .then(({ error }) => {
        if (error) return { data: null, error };
        const e = new Error('📝 Enviado para aprovação: só vale depois que alguém que edita esta área aprovar (veja em Aprovações).');
        e.rascunho = true;
        document.dispatchEvent(new CustomEvent('erp:rascunho'));
        return { data: null, error: e };
      }));
  }
  return eu;
}
envolverRascunho(sb);
if (window.SB && window.SB !== sb) envolverRascunho(window.SB);

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
  if (!alvo) return;
  alvo.remove();
  // quem abriu a janela pode saber que ela fechou (×, Esc, clique fora ou voltar do navegador)
  if (typeof alvo._aoFechar === 'function') { const f = alvo._aoFechar; alvo._aoFechar = null; try { f(); } catch (e) { /* nada */ } }
}
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') fecharJanela(); });

// Baixa (recebimento/pagamento): pergunta a data — vem com hoje, mas dá para trocar quando o
// lançamento é feito depois. Acordo: pergunta também se o comprovante foi juntado ao processo (e o ID).
// Devolve os campos a gravar, ou null se a pessoa cancelou.
function perguntarBaixa({ titulo, descricao, valor, acordo, despesa }) {
  return new Promise((ok) => {
    let feito = false;
    const j = abrirJanela({ titulo: titulo || (despesa ? 'Pago — confirme a data' : 'Recebido — confirme a data'),
      corpo: (descricao ? '<div class="dica" style="margin-bottom:12px"><b>' + esc(descricao) + '</b>' + (valor != null ? ' · ' + brl(valor) : '') + '</div>' : '') +
        campo(despesa || acordo ? 'Data do pagamento' : 'Data do recebimento', '<input type="date" name="bx-data" required value="' + hojeISO() + '">') +
        '<div class="sub" style="margin:4px 0 10px">Já vem com a data de hoje. Se o dinheiro entrou em outro dia, troque aqui.</div>' +
        (acordo ? '<fieldset class="bx-comp"><legend>O comprovante foi anexado ao processo?</legend>' +
          '<label><input type="radio" name="bx-comp" value="sim"> Sim</label> <label><input type="radio" name="bx-comp" value="nao" checked> Não</label>' +
          '<div class="bx-id" hidden>' + campo('ID do documento no processo', '<input name="bx-id" placeholder="ex.: 123456789 (ID do PJe)">') + '</div></fieldset>' : ''),
      rodape: '<button type="button" class="btn btn-o" data-bx-cancelar>Cancelar</button><button type="button" class="btn btn-v" data-bx-ok>✓ Confirmar</button>' });
    j.classList.add('janela-baixa');
    const data = j.querySelector('[name=bx-data]');
    const radios = j.querySelectorAll('[name=bx-comp]'), caixaId = j.querySelector('.bx-id');
    radios.forEach((r) => r.onchange = () => { caixaId.hidden = r.value !== 'sim' || !r.checked; if (!caixaId.hidden) caixaId.querySelector('input').focus(); });
    const fim = (v) => { if (feito) return; feito = true; fecharJanela(j); ok(v); };
    j.querySelector('[data-bx-cancelar]').onclick = () => fim(null);
    j.querySelector('[data-fechar]').onclick = () => fim(null);
    j.addEventListener('mousedown', (ev) => { if (ev.target === j) fim(null); });
    j.querySelector('[data-bx-ok]').onclick = () => {
      if (!data.value) { data.focus(); return aviso('Informe a data.', true); }
      const r = { pago: true, data_pagamento: data.value };
      if (acordo) {
        const sim = j.querySelector('[name=bx-comp]:checked').value === 'sim', idDoc = j.querySelector('[name=bx-id]').value.trim();
        if (sim && !idDoc) { j.querySelector('[name=bx-id]').focus(); return aviso('Informe o ID do comprovante no processo (ou marque "Não").', true); }
        r.comprovante_processo = sim; r.comprovante_id = sim ? idDoc : '';
      }
      fim(r);
    };
    new MutationObserver((_, o) => { if (!j.isConnected) { o.disconnect(); fim(null); } }).observe(j.parentNode, { childList: true });
  });
}

function irParaTela(t) { if (typeof window.nav === 'function') window.nav(null, t); else irPara(t); }

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
function recarregar() { invalidarCadastros(); return irPara(E.tela); }

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

