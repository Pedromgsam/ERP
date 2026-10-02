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
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');   // "1.234" = mil duzentos e trinta e quatro
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
  ['nada', 'Não enviar nenhum e-mail', 'o cliente não recebe nenhum e-mail automático (nem guias, acordos ou boas-vindas)'],
  ['personalizado', 'Personalizado', 'você marca cada tipo de e-mail']];
// Backup 26: setor do contato e "recebe o quê" (os e-mails automáticos usam isso para escolher o destinatário)
const SETORES_CONTATO = [['geral', 'Geral'], ['financeiro', 'Financeiro'], ['fiscal', 'Fiscal'], ['rh', 'RH / Depto. pessoal'], ['socio', 'Sócio / decisor'],
  ['juridico', 'Jurídico'], ['contador', 'Contador externo']];
const RECEBE_EMAIL = [['cobranca', 'Honorários (lembretes e atrasos)'], ['recibo', 'Recibo de honorário'], ['guia', 'Parcelamentos (guias)'],
  ['acordo', 'Acordos'], ['contrato', 'Contratos, propostas e boas-vindas'], ['convite', 'Reuniões (convites)']];
const ORIGENS_CLIENTE = ['Indicação', 'Site', 'Instagram', 'Google', 'Cliente antigo', 'Evento', 'CRM', 'Outro'];
const RECEBE_CURTO = { cobranca: 'Honorários', recibo: 'Recibo de honorário', guia: 'Parcelamentos', acordo: 'Acordos', contrato: 'Contratos', convite: 'Reuniões' };
const TIPOS_EMAIL = [['lembrete', 'Lembrete antes do vencimento'], ['vencimento', 'Aviso no dia do vencimento'], ['cobranca', 'Cobrança de atraso'],
  ['recibo', 'Recibo / pagamento recebido'], ['parcelamento', 'Guia de parcelamento'], ['acordo', 'Parcela de acordo'],
  ['boas_vindas', 'Boas-vindas (contrato assinado)'], ['convite', 'Convite de reunião']];
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
function normalizar(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
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
// Backup 23: ativa verde; suspensa, inapta, baixada e nula vermelho
const SITCAD_COR = { ATIVA: 'pago', SUSPENSA: 'vencido', INAPTA: 'vencido', BAIXADA: 'vencido', NULA: 'vencido' };
function pillSitCad(v) {
  const t = String(v || '').trim().toUpperCase();
  if (!t) return '<span class="sub">—</span>';
  return '<span class="pill ' + (SITCAD_COR[t] || 'neutro') + '">' + esc(t.charAt(0) + t.slice(1).toLowerCase()) + '</span>';
}
function pillSimNao(v) {
  if (v === true) return '<span class="pill pago pill-sim">Sim</span>';   // Backup 23: sim verde, não vermelho
  if (v === false) return '<span class="pill vencido pill-nao">Não</span>';
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
  const n = porPagina || 1000, todos = []; let semId = false;
  for (let de = 0; ; de += n) {
    // Backup 37: o Supabase devolve no máximo 1000 linhas por vez; o 'id' no fim da ordem evita pular/repetir linhas entre as páginas
    // (tabela sem coluna id — ex.: configuracoes — segue sem o desempate)
    let pag;
    if (semId) pag = await q(montar().range(de, de + n - 1));
    else { try { pag = await q(montar().order('id').range(de, de + n - 1)); }
      catch (e) { if (!/42703|column .*id.* does not exist|id.*não existe/i.test(String(e && (e.code || e.message || e)))) throw e; semId = true; pag = await q(montar().range(de, de + n - 1)); } }
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
const PAGINA_TABELA = 1e9;   // Backup 29: sem "Mostrar mais" — sempre todas as linhas (o cabeçalho fica fixo no topo)
function paginarTabelas() {
  document.querySelectorAll('.tw table, .tabela-wrap table').forEach((t) => {
    const corpo = t.tBodies[0]; if (!corpo) return;
    if (t.closest('[data-sem-pagina]') || t.hasAttribute('data-sem-pagina')) return;   // Backup 28: Painel/Processos mostram tudo
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
  const agendar = () => { if (agendado) return; agendado = true; requestAnimationFrame(() => { agendado = false; paginarTabelas(); nomearBotoesIcone(); mascararCampos(); }); };
  const ligar = () => new MutationObserver((ms) => { if (ms.some((m) => m.target.closest && m.target.closest('table, .tw, .tabela-wrap, main, .gs-area, #conteudo, #janelas, .janela, .gx-modal, form'))) agendar(); })
    .observe(document.body, { childList: true, subtree: true });
  if (document.body) ligar(); else document.addEventListener('DOMContentLoaded', ligar);
})();

// ═══ Backup 28: máscaras AO DIGITAR (valem para todo o sistema) ═══
// Dinheiro: "10,2" → "R$ 10,2" (ao sair do campo: "R$ 10,20"); "10" → "R$ 10" (ao sair: "R$ 10,00"); milhar com ponto.
// Telefone: "37998684323" → "(37) 9 9868-4323"; fixo "3732221234" → "(37) 3222-1234".
// Campos: data-mascara="brl" | "tel", e também inputmode="decimal" com name começando por "valor" e name="telefone".
function tipoMascara(el) {
  if (!el || el.tagName !== 'INPUT' || (el.type && !/^(text|tel|search|)$/.test(el.type))) return '';
  const m = el.getAttribute('data-mascara'); if (m) return m === 'nenhuma' ? '' : m;
  const n = el.name || '';
  if (el.getAttribute('inputmode') === 'decimal' && /^valor/.test(n)) return 'brl';
  if (/(^|_)telefone$|^whatsapp$/.test(n) || el.type === 'tel') return 'tel';
  return '';
}
function formatarBRL(txt, final) {
  const jaMascarado = /R\$/.test(String(txt || ''));
  let s = String(txt || '').replace(/R\$|\s/g, ''); if (!s) return '';
  const neg = /^-/.test(s); s = s.replace(/-/g, '');
  // ponto digitado como decimal vira vírgula: no fim do campo já mascarado ("R$ 10." → "R$ 10,") ou em valor colado ("10.5");
  // os demais pontos são de milhar e saem
  if (!s.includes(',')) {
    if (jaMascarado) s = s.replace(/\.$/, ',');
    else if (/\.\d{1,2}$/.test(s) && !/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\.(\d{1,2})$/, ',$1');
  }
  const temVirg = s.includes(','), [a, b] = s.split(',');
  let int = (a || '').replace(/\D/g, '').replace(/^0+(?=\d)/, ''), dec = (b || '').replace(/\D/g, '').slice(0, 2);
  if (!int && !temVirg) return neg ? '-' : '';
  if (!int) int = '0';
  int = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (final) dec = (dec + '00').slice(0, 2);
  return (neg ? '-' : '') + 'R$ ' + int + (temVirg || final ? ',' + dec : '');
}
function formatarTel(txt) {
  const d = soDigitos(txt).replace(/^0+/, '').slice(0, 11); if (!d) return '';
  if (d.length <= 2) return '(' + d;
  const dd = '(' + d.slice(0, 2) + ') ', r = d.slice(2);
  if (d.length === 11) return dd + r[0] + ' ' + r.slice(1, 5) + '-' + r.slice(5);
  if (r.length <= 4) return dd + r;
  return dd + r.slice(0, 4) + '-' + r.slice(4);
}
function aplicarMascara(el, final) {
  const t = tipoMascara(el); if (!t) return;
  const antes = el.value, fim = el.selectionStart === antes.length;
  const pos = el.selectionStart == null ? antes.length : el.selectionStart;
  const sig = (s, p) => s.slice(0, p).replace(t === 'brl' ? /[^\d,-]/g : /\D/g, '').length;   // dígitos antes do cursor
  const novo = t === 'brl' ? formatarBRL(antes, final) : formatarTel(antes);
  if (novo === antes) return;
  el.value = novo;
  if (document.activeElement === el && !final) {
    let alvo = novo.length;
    if (!fim) { const k = sig(antes, pos); alvo = 0; while (alvo < novo.length && sig(novo, alvo) < k) alvo++; }
    try { el.setSelectionRange(alvo, alvo); } catch (e) { /* campo sem seleção */ }
  }
}
document.addEventListener('input', (ev) => { if (!ev.isComposing) aplicarMascara(ev.target, false); }, true);
document.addEventListener('blur', (ev) => aplicarMascara(ev.target, true), true);
// valor que já vem preenchido (edição) também aparece com "R$"
function mascararCampos(raiz) {
  (raiz || document).querySelectorAll('input:not([data-mascara-ok])').forEach((el) => {
    const t = tipoMascara(el); if (!t) return; el.setAttribute('data-mascara-ok', '');
    if (t === 'brl' && !el.getAttribute('inputmode')) el.setAttribute('inputmode', 'decimal');
    if (el.value && document.activeElement !== el) aplicarMascara(el, true);
  });
}

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
//  · série mensal      → passado, mês atual (mais escuro) e futuro na rampa azul dos tokens (--chart-rampa-*)
//  · rosca por órgão   → cor fixa por categoria, saturação contida
// Todo gráfico tem dica ao passar o mouse (valor exato) e legenda/rótulo,
// para a cor nunca ser a única forma de identificar.
// ═══════════════════════════════════════════════════════════════════

// Backup 18: cores vêm dos tokens (tokens.css) — style="fill:var(--...)" troca sozinho no modo escuro
const RAMPA_AZUL = ['var(--chart-rampa-1)', 'var(--chart-rampa-2)', 'var(--chart-rampa-3)', 'var(--chart-rampa-4)', 'var(--chart-rampa-5)'];
function tomAzul(i, n) {
  if (!n || n <= 1) return RAMPA_AZUL[0];
  const passos = Math.min(n, RAMPA_AZUL.length);
  const k = Math.round(i * (RAMPA_AZUL.length - 1) / (passos - 1));
  return RAMPA_AZUL[Math.min(k, RAMPA_AZUL.length - 1)];
}
// Ordem validada (daltonismo e visão normal) — ver sistema/README.md.
const CORES_ORGAO = { 'PGFN': 'var(--chart-1)', 'AGE/MG': 'var(--chart-3)', 'RFB': 'var(--chart-2)', 'SEFAZ/MG': 'var(--chart-4)' };
const COR_MES = { passado: 'var(--chart-rampa-4)', atual: 'var(--chart-rampa-1)', futuro: 'var(--chart-rampa-5)' };

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
      '<path d="M' + esq + ',' + (y + 4) + ' h' + (w - 4) + ' a4,4 0 0 1 4,4 v10 a4,4 0 0 1 -4,4 h-' + (w - 4) + ' z" style="fill:' + cor[i] + '"/>' +
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
      (hh ? '<path d="M' + x + ',' + base + ' v-' + (hh - 4) + ' a4,4 0 0 1 4,-4 h' + (bw - 8) + ' a4,4 0 0 1 4,4 v' + (hh - 4) + ' z" style="fill:' + cor + '"/>' : '') +
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
    s += '<path d="' + d + '" style="fill:' + (CORES_ORGAO[it.nome] || 'var(--chart-7)') + '" fill-rule="evenodd" data-dica="' +
      esc(it.nome + ': ' + brl(it.valor) + ' (' + (frac * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%)') + '"/>';
    ang += frac * Math.PI * 2;
  });
  s += '<text x="80" y="76" text-anchor="middle" class="g-eixo">Total</text><text x="80" y="94" text-anchor="middle" class="g-val g-forte">' +
    esc(brlCurto(total)) + '</text></svg><div class="rosca-leg">';
  itens.forEach((it) => {
    s += '<div data-dica="' + esc(it.nome + ': ' + brl(it.valor)) + '"><i style="background:' + (CORES_ORGAO[it.nome] || 'var(--chart-7)') + '"></i>' +
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
// Cartões sem sobreposição: "A receber" = de hoje até o fim do mês (o que já venceu fica só em "Em atraso").
// Em atraso: duas tabelas completas lado a lado (Jurídico | Contabilidade), com o que vence HOJE destacado.
TELAS.inicio = async function () {
  // Backup 38: Início enxuto — sem os cartões de Honorários (ficam no Financeiro), sem a faixa de avisos/destaques.
  // Fica: Olá, Lembretes, Resumo do escritório e a fila/agenda de tarefas.
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Olá, ' + esc(primeiroNomeUsuario()) + '</h1></div></div>' +
    '<div id="ini-valid"></div><div id="ini-lembretes"></div><div id="ini-resumo"></div><div id="ini-aprov"></div>' +
    '<div id="ini-fila"></div>';
  cardLembretes().catch((e) => console.error(e));
  cardResumoEscritorio().catch((e) => console.error(e));
  if (typeof buscaPubAutomatica === 'function') buscaPubAutomatica().catch(() => {});
  if (typeof cardValidacoes === 'function') cardValidacoes().then((c) => { const el = $('ini-valid'); if (el) { el.innerHTML = c.html; c.ligar(el); } }).catch((e) => console.error(e));
  if (typeof cardAprovacoes === 'function') cardAprovacoes().then((x) => { const el = $('ini-aprov'); if (el) el.innerHTML = x; }).catch((e) => console.error(e));
  if (typeof cardMinhaFila === 'function') cardMinhaFila().then((c) => { const el = $('ini-fila'); if (el) { el.innerHTML = c.html; c.ligar(el); } }).catch((e) => console.error(e));
};

function diasAtraso(venc) {
  const n = Math.round((new Date(hojeISO() + 'T12:00:00') - new Date(venc + 'T12:00:00')) / 864e5);
  return n === 1 ? 'venceu ontem' : 'há ' + n + ' dias';
}
function primeiroNomeUsuario() { return ((E.perfil && E.perfil.nome) || '').trim().split(/\s+/)[0] || ''; }

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


// ─────────── Lembretes do Início (Backup 20: substituem o mural de recados) ───────────
// Topo do Início: destaques do que é SEU (avisos, tarefas atrasadas, prazos fatais…) e a lista de LEMBRETES sempre à vista.
// Lembrete pode ser SEM PRAZO (fica até "Feito", como era o recado), FIXO no topo e ter uma COR de destaque.
const EXPLICA = {
  avisos: 'Avisos (sino 🔔): novidades que pedem sua atenção agora — prazo chegando, o que vence hoje, menções, tarefa que alguém te passou. Depois de lido, some.',
  tarefas: 'Tarefas: trabalho com responsável e prazo (ex.: protocolar defesa). Aqui aparecem só as SUAS que já passaram do prazo.',
  fila: 'Minha fila de trabalho: todas as SUAS tarefas abertas, em ordem de prazo — é a sua lista do dia.',
  lembretes: 'Lembretes: recados com ou sem data que NÃO viram tarefa (ex.: pagar o aluguel, reunião sexta). Aparecem até 7 dias antes da data; sem prazo, ficam até você marcar "Feito".'
};
const DESTAQUES_LEMB = [['', 'Sem destaque'], ['vermelho', '🔴 Vermelho — urgente'], ['amarelo', '🟡 Amarelo — atenção'], ['verde', '🟢 Verde — tudo certo'], ['azul', '🔵 Azul — informação'], ['roxo', '🟣 Roxo — pessoal']];
// ⓘ com balão próprio (Backup 22: volta o ⓘ; o balão do Backup 21 fica)
function infoI(chave) { return '<span class="info-i" tabindex="0" role="note" data-dica="' + esc(EXPLICA[chave]) + '" aria-label="' + esc(EXPLICA[chave]) + '">ⓘ</span>'; }
async function dadosLembretes() {
  const h = hojeISO();
  const meus = await q(sb.from('lembretes').select('*').is('feito_em', null).order('dia', { nullsFirst: true })).catch(() => []);
  const eu = primeiroNome((E.perfil && E.perfil.nome) || ''), lim = somarDias(h, 7);
  const meu = meus.filter((l) => !l.pessoa || primeiroNome(l.pessoa) === eu || (E.perfil && E.perfil.papel === 'admin'))
    .sort((a, b) => (b.fixo - a.fixo) || ((a.dia ? 1 : 0) - (b.dia ? 1 : 0)) || String(a.dia || '').localeCompare(String(b.dia || '')));
  // Backup 23: o lembrete com data distante não "some" — fica em "Mais adiante" até faltar 7 dias
  const vis = meu.filter((l) => l.fixo || !l.dia || l.dia <= lim), futuros = meu.filter((l) => !(l.fixo || !l.dia || l.dia <= lim));
  return { semGuia: [], vis, futuros, todos: meu };   // Backup 38: as guias saíram do Início (ficam em Parcelamentos/Rotina)
}
// Cartão próprio de Lembretes (o que NÃO é tarefa; Backup 24: as guias foram para a faixa de destaques): lembretes dos próximos 7 dias / sem prazo / fixos,
// e "Mais adiante" com os de data distante. Clicar no lembrete abre o DETALHAMENTO (editar fica lá dentro).
async function cardLembretes() {
  const el = $('ini-lembretes'); if (!el) return;
  // Backup 27: aparecem os fixados (sempre), os sem prazo e os com data em até 7 dias; o resto fica em "Todos os lembretes"
  const L = await dadosLembretes().catch(() => ({ semGuia: [], vis: [], futuros: [], todos: [], dias: 5 }));
  el.innerHTML = '<div class="card ini-lemb"><div class="card-hd">🔔 Lembretes' +
      '<span style="margin-left:auto;display:flex;gap:6px"><button type="button" class="btn btn-o btn-mini" id="lemb-todos" title="Todos os lembretes, inclusive os com data depois de 7 dias e os concluídos">📋 Todos (' + L.todos.length + ')</button>' +
      '<button type="button" class="btn btn-p btn-mini" id="lemb-novo">+ Lembrete</button></span></div><div class="card-bd">' +
    (L.vis.length ? '<div class="lemb-lista">' + htmlLembretes(L.vis) + '</div>'
      : '<div class="sub">Nenhum lembrete para os próximos 7 dias. Use <b>+ Lembrete</b> (com ou sem data; dá para fixar no topo e escolher uma cor).</div>') +
    (L.futuros.length ? '<button type="button" class="lemb-tg lemb-tg-fut" id="lemb-fut">+ ' + plural(L.futuros.length, 'lembrete mais adiante', 'lembretes mais adiante') + ' — ver todos</button>' : '') +
    '</div></div>';
  const fu = $('lemb-fut'); if (fu) fu.onclick = () => janelaTodosLembretes();
  $('lemb-todos').onclick = () => janelaTodosLembretes();
  ligarLembretes(el, L);
  $('lemb-novo').onclick = () => formLembrete();
}
// Todos os lembretes (Backup 27): fixados, próximos 7 dias/sem prazo, mais adiante e concluídos nos últimos 90 dias
async function janelaTodosLembretes() {
  const h = hojeISO();
  const [L, feitos] = await Promise.all([dadosLembretes(), q(sb.from('lembretes').select('*').not('feito_em', 'is', null).gte('feito_em', somarDias(h, -90)).order('feito_em', { ascending: false })).catch(() => [])]);
  const fixos = L.todos.filter((l) => l.fixo), prox = L.vis.filter((l) => !l.fixo);
  const sec = (tit, lista, vazio) => '<div class="lemb-sec"><div class="secao">' + tit + ' <span class="sub">' + lista.length + '</span></div>' +
    (lista.length ? '<div class="lemb-lista">' + htmlLembretes(lista) + '</div>' : '<div class="sub">' + vazio + '</div>') + '</div>';
  const j = abrirJanela({ titulo: '🔔 Todos os lembretes', larga: true,
    corpo: sec('📌 Fixados no topo', fixos, 'Nenhum lembrete fixado.') + sec('Próximos 7 dias e sem prazo', prox, 'Nada para os próximos 7 dias.') +
      sec('Mais adiante (aparecem no Início 7 dias antes)', L.futuros.filter((l) => !l.fixo), 'Nenhum lembrete com data distante.') +
      '<div class="lemb-sec"><div class="secao">✓ Concluídos nos últimos 90 dias <span class="sub">' + feitos.length + '</span></div>' +
      (feitos.length ? '<div class="lista-ficha">' + feitos.map((l) => '<div class="item-ficha"><div><span style="text-decoration:line-through">' + esc(l.texto) + '</span><div class="sub">feito em ' + dataBR(String(l.feito_em).slice(0, 10)) + '</div></div>' +
        '<button type="button" class="btn btn-o btn-mini" data-lemb-volta="' + l.id + '">↺ Reabrir</button></div>').join('') + '</div>' : '<div class="sub">Nenhum.</div>') + '</div>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-p" type="button" id="lt-novo">+ Lembrete</button></div>' });
  const reabrir = () => { fecharJanela(j); janelaTodosLembretes(); };
  ligarLembretes(j, L, reabrir);
  j.querySelector('#lt-novo').onclick = () => { fecharJanela(j); formLembrete(); };
  j.querySelectorAll('[data-lemb-volta]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    await q(sb.from('lembretes').update({ feito_em: null }).eq('id', b.dataset.lembVolta)); aviso('Lembrete reaberto.'); await cardLembretes(); reabrir();
  }));
}

// ── Resumo do escritório (Início = "home"): um número por assunto, clicável ──
async function cardResumoEscritorio() {
  const el = $('ini-resumo'); if (!el) return;
  // Backup 17: só o que pede ação (sem Processos). Atraso, hoje e próximos 5 dias ficam no mesmo cartão, um por linha.
  const h = hojeISO(), lim5 = somarDias(h, 5);
  const conta = (qq) => qq.then((r) => (r.error ? 0 : r.count || 0)).catch(() => 0);
  const cnt = (t) => sb.from(t).select('id', { count: 'exact', head: true });
  const jur = pode('juridico'), crm = pode('crm');
  const aberta = () => cnt('tarefas').not('status', 'in', '(concluida,cancelada)');
  const tres = (t, col, filtro) => jur ? Promise.all([
    conta(filtro(cnt(t)).lt(col, h)), conta(filtro(cnt(t)).eq(col, h)), conta(filtro(cnt(t)).gt(col, h).lte(col, lim5))]) : [0, 0, 0];
  const [pubs, parc, aco, ops, tAb, tAtr, tHoje, t5] = await Promise.all([
    // Backup 39: só as publicações do advogado que entrou (pelo primeiro nome: Pedro vê as do Pedro)
    jur ? conta(cnt('publicacoes').eq('status', 'nova').or('advogado.ilike.' + primeiroNomeUsuario().replace(/[,()*%]/g, '') + '*,advogados.ilike.*' + primeiroNomeUsuario().replace(/[,()*%]/g, '') + '*')) : 0,
    tres('parcelas', 'vencimento', (x) => x.eq('pago', false)),
    tres('acordos', 'vencimento', (x) => x.eq('pago', false)),
    crm ? q(sb.from('crm_oportunidades').select('valor_estimado, crm_etapas(final)')).catch(() => []) : [],
    conta(aberta()), conta(aberta().lt('prazo', h)), conta(aberta().eq('prazo', h)), conta(aberta().gt('prazo', h).lte('prazo', lim5))
  ]);
  const abertas = (ops || []).filter((o) => !(o.crm_etapas && o.crm_etapas.final));
  // linhas de prazo: [quantidade, texto, cor] — Backup 19: plural certo, sem "(s)"
  const pl = (n, um, varios) => (Number(n) === 1 ? um : varios);
  const prazos = (v) => [[v[1], pl(v[1], 'vence hoje', 'vencem hoje'), 'ambar'], [v[2], 'nos próximos 5 dias', '']];
  const T = [
    jur ? ['publicacoes', '📰', 'Publicações', pubs, pl(pubs, 'nova sua para ler', 'novas suas para ler'), [], pubs ? 'ambar' : ''] : null,
    jur ? ['parcelamentos', '🧾', 'Parcelamentos', parc[0], pl(parc[0], 'parcela em atraso', 'parcelas em atraso'), prazos(parc), parc[0] ? 'vermelho' : parc[1] ? 'ambar' : ''] : null,
    jur ? ['acordos', '🤝', 'Acordos', aco[0], pl(aco[0], 'parcela em atraso', 'parcelas em atraso'), prazos(aco), aco[0] ? 'vermelho' : aco[1] ? 'ambar' : ''] : null,
    crm ? ['crm', '🎯', 'CRM', abertas.length, pl(abertas.length, 'oportunidade em andamento', 'oportunidades em andamento'), [[null, brl(soma(abertas, (o) => o.valor_estimado)) + ' em negociação', '']], ''] : null,
    ['tarefas', '📋', 'Tarefas do escritório', tAb, 'em aberto · equipe toda', [[tAtr, pl(tAtr, 'atrasada', 'atrasadas'), 'vermelho']].concat(prazos([0, tHoje, t5])), tAtr ? 'vermelho' : '']
  ].filter(Boolean);
  // Backup 38: ícones de traço fino num quadradinho (como nos prints), no lugar dos emojis coloridos
  const IC = { publicacoes: '<path d="M4 4h12a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2z"/><path d="M18 8h2v10a2 2 0 0 1-2 2M8 8h6M8 12h6M8 16h4"/>',
    parcelamentos: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h6M9 17h4"/>', acordos: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-5"/>',
    crm: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>', tarefas: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>' };
  const icone = (k) => '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[k] || '') + '</svg>';
  const sub = (l) => '<span class="ini-res-sub' + (l[0] && l[2] ? ' ' + l[2] : '') + '">' + (l[0] == null ? '' : '<b>' + l[0] + '</b> ') + esc(l[1]) + '</span>';
  el.innerHTML = '<div class="kpis-titulo">🏠 Resumo do escritório</div><div class="ini-resumo">' + T.map((t) =>
    '<button type="button" class="ini-res ' + t[6] + '" data-ini-ir="' + t[0] + '"' + (t[0] === 'tarefas' ? ' title="Tarefas do escritório: todas as tarefas abertas da equipe (a sua fila fica mais abaixo)."' : '') + '><span class="ini-res-ic" aria-hidden="true">' + icone(t[0]) + '</span>' +
    '<span class="ini-res-tit">' + esc(t[2]) + '</span><b class="ini-res-num">' + t[3] + '</b><span class="ini-res-rot">' + esc(t[4]) + '</span>' +
    (t[5].length ? '<span class="ini-res-subs">' + t[5].map(sub).join('') + '</span>' : '') + '</button>').join('') + '</div>';
  el.querySelectorAll('[data-ini-ir]').forEach((b) => b.onclick = () => {
    const k = b.dataset.iniIr;
    if (k === 'tarefas') E.tf = Object.assign(E.tf || {}, { aba: 'abertas', atalho: '' });
    if (k === 'publicacoes') E.pub = Object.assign(E.pub || { tribunal: '', dias: '30', busca: '' }, { status: 'nova', adv: primeiroNomeUsuario() });
    irParaTela(k);
  });
}
function fimDoMesISO(d) { const x = new Date(d + 'T12:00:00'); return iso(new Date(x.getFullYear(), x.getMonth() + 1, 0)); }

// ── Lembretes: o que NÃO é tarefa (recado sem prazo, pagar o aluguel, emitir guias de parcelamento) ──
// Linha do lembrete: fundo pela cor do destaque, "✓ Feito" e "📌 Fixar/Fixado" (o fixado fica marcado, como o Feito); clicar abre o detalhe
function htmlLembretes(lista) {
  const h = hojeISO();
  return lista.map((l) => '<div class="lemb-it' + (l.fixo ? ' fixo' : '') + (l.destaque ? ' dest-' + esc(l.destaque) : '') + '" data-lemb-det="' + l.id + '" tabindex="0" title="Clique para ver o detalhamento">' +
      '<div class="lemb-txt"><span>' + esc(l.texto) + '</span>' +
      '<div class="sub">' + (!l.dia ? 'sem prazo' : l.dia < h ? '<span class="pill vencido">desde ' + dataBR(l.dia) + '</span>' : l.dia === h ? '<span class="pill hoje">hoje</span>' : dataBR(l.dia)) +
        (l.repete ? ' · ↻ ' + esc(l.repete) : '') + (l.pessoa ? ' · ' + esc(l.pessoa) : ' · todos') + '</div></div>' +
    '<div class="acoes-l">' + botoesLembrete(l) + '</div></div>').join('');
}
function botoesLembrete(l) {
  return '<button type="button" class="btn btn-mini lemb-fixo' + (l.fixo ? ' on' : '') + '" data-lemb-fixo="' + l.id + '" aria-pressed="' + !!l.fixo + '" title="' + (l.fixo ? 'Fixado no topo — clique para tirar' : 'Fixar no topo') + '">📌 ' + (l.fixo ? 'Fixado' : 'Fixar') + '</button>' +
    '<button type="button" class="btn btn-v btn-mini" data-lemb-ok="' + l.id + '" title="Concluir (marcar como feito)">✓ Feito</button>' +
    '<button type="button" class="btn-etq" data-lemb-x="' + l.id + '" title="Apagar lembrete" aria-label="Apagar lembrete">×</button>';
}
// detalhamento do lembrete (igual aos outros cartões: abre uma janela; "Editar" fica aqui dentro)
function detalheLembrete(l) {
  const h = hojeISO(), lin = (r, v) => v ? '<div class="tf-lin"><span>' + r + '</span><div>' + v + '</div></div>' : '';
  const dest = (DESTAQUES_LEMB.find((d) => d[0] === (l.destaque || '')) || ['', ''])[1];
  const j = abrirJanela({ titulo: '🔔 Lembrete',
    corpo: '<div class="tf-ficha"><div class="tf-ficha-hd"><h3>' + esc(l.texto) + '</h3><div class="tf-selos">' + (l.fixo ? '<span class="pill aberto">📌 fixado no topo</span> ' : '') +
        (!l.dia ? '<span class="pill neutro">sem prazo</span>' : l.dia < h ? '<span class="pill vencido">desde ' + dataBR(l.dia) + '</span>' : l.dia === h ? '<span class="pill hoje">hoje</span>' : '<span class="pill neutro">' + dataBR(l.dia) + '</span>') + '</div></div>' +
      '<div class="tf-grade">' + lin('Data', l.dia ? dataBR(l.dia) : 'sem prazo — fica até "Feito"') + lin('Repete', esc({ semanal: 'Toda semana', mensal: 'Todo mês', anual: 'Todo ano' }[l.repete] || '')) +
        lin('Para quem', esc(l.pessoa || 'Todo o escritório')) + lin('Destaque', esc(dest)) + lin('Criado em', l.criado_em ? dataHoraBR(l.criado_em) : '') + '</div></div>',
    rodape: '<span><button class="btn btn-o btn-mini" type="button" id="ld-editar">✎ Editar</button></span><div class="acoes">' + botoesLembrete(l) + '</div>' });
  j.querySelector('#ld-editar').onclick = () => { fecharJanela(j); formLembrete(l); };
  ligarLembretes(j, { todos: [l], semGuia: [] }, () => fecharJanela(j));
  return j;
}
function ligarLembretes(el, L, depois) {
  const h = hojeISO(), acha = (id) => (L.todos || []).find((x) => x.id === id);
  const fim = async () => { if (depois) depois(); await cardLembretes(); };
  el.querySelectorAll('[data-guia-ok]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    await q(sb.rpc('registrar_emissao', { p_tabela: 'parcelas', p_id: b.dataset.guiaOk, p_emitida: true, p_doc: null, p_enviar: false })); aviso('✓ Guia marcada como emitida.'); await fim();
  }));
  el.querySelectorAll('[data-lemb-ok]').forEach((b) => b.onclick = (ev) => { ev.stopPropagation(); comBotao(b, async () => {
    const l = acha(b.dataset.lembOk);
    const prox = { semanal: 7, mensal: 'm1', anual: 'm12' }[l.repete];
    const dados = !l.repete || !l.dia ? { feito_em: h } : { dia: typeof prox === 'number' ? somarDias(l.dia, prox) : somarMeses(l.dia, +prox.slice(1)) };
    await q(sb.from('lembretes').update(dados).eq('id', l.id));
    aviso(dados.dia ? '✓ Feito. Próximo em ' + dataBR(dados.dia) + '.' : '✓ Lembrete concluído.'); await fim();
  }); });
  el.querySelectorAll('[data-lemb-fixo]').forEach((b) => b.onclick = (ev) => { ev.stopPropagation(); comBotao(b, async () => {
    const l = acha(b.dataset.lembFixo);
    await q(sb.from('lembretes').update({ fixo: !l.fixo }).eq('id', l.id)); aviso(l.fixo ? 'Lembrete tirado do topo.' : '📌 Lembrete fixado no topo.'); await fim();
  }); });
  el.querySelectorAll('[data-lemb-x]').forEach((b) => b.onclick = (ev) => { ev.stopPropagation(); comBotao(b, async () => {
    if (!confirm('Apagar este lembrete?')) return;
    await q(sb.from('lembretes').delete().eq('id', b.dataset.lembX)); await fim();
  }); });
  el.querySelectorAll('[data-lemb-det]').forEach((d) => {
    d.onclick = (ev) => { if (ev.target.closest('button')) return; detalheLembrete(acha(d.dataset.lembDet)); };
    d.onkeydown = (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === d) { ev.preventDefault(); detalheLembrete(acha(d.dataset.lembDet)); } };
  });
}
function formLembrete(l) {
  l = l || null;
  const semPrazo = l ? !l.dia : false;
  const j = abrirJanela({ titulo: l ? '📌 Editar lembrete' : '📌 Novo lembrete',
    corpo: '<div class="dica" style="margin-bottom:10px">Lembrete é um recado que <b>não vira tarefa</b> (ex.: "reunião sexta às 14h", "pagar o aluguel da sala"). ' +
      '<b>Sem prazo</b>: fica no Início até você marcar "Feito". Com data: aparece em destaque a partir de 7 dias antes (antes disso fica em "Mais adiante").</div><form id="f-lemb" class="grade">' +
      campo('Lembrete <span class="obrig">*</span>', '<input name="texto" maxlength="300" value="' + esc(l ? l.texto : '') + '">', 'inteiro') +
      campo('Prazo', '<select name="prazo"><option value="data">Com data</option><option value="sem"' + (semPrazo ? ' selected' : '') + '>Sem prazo (fica até "Feito")</option></select>') +
      campo('Data', '<input name="dia" type="date" value="' + esc(l ? l.dia || '' : hojeISO()) + '"' + (semPrazo ? ' disabled' : '') + '>') +
      campo('Repete', '<select name="repete"><option value="">Não repete</option>' + [['semanal', 'Toda semana'], ['mensal', 'Todo mês'], ['anual', 'Todo ano']].map(([v, r]) => '<option value="' + v + '"' + (l && l.repete === v ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>') +
      campo('Para quem', selectPessoa('pessoa', l ? l.pessoa : '', 'Todo o escritório')) +
      campo('Destaque', '<select name="destaque">' + DESTAQUES_LEMB.map(([v, r]) => '<option value="' + v + '"' + (l && l.destaque === v ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>') +
      '<label class="check inteiro"><input type="checkbox" name="fixo"' + (l && l.fixo ? ' checked' : '') + '> 📌 Fixar no topo</label></form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-p" type="button" id="lemb-salvar">Salvar</button></div>' });
  const f = j.querySelector('#f-lemb');
  f.prazo.onchange = () => { f.dia.disabled = f.prazo.value === 'sem'; if (!f.dia.disabled && !f.dia.value) f.dia.value = hojeISO(); };
  j.querySelector('#lemb-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const t = f.texto.value.trim(); if (!t) throw new Error('Escreva o lembrete.');
    const dados = { texto: t, dia: f.prazo.value === 'sem' ? null : (f.dia.value || hojeISO()), repete: f.prazo.value === 'sem' ? '' : f.repete.value,
      pessoa: f.pessoa.value, destaque: f.destaque.value, fixo: f.fixo.checked };
    if (l) await q(sb.from('lembretes').update(dados).eq('id', l.id)); else await q(sb.from('lembretes').insert(dados));
    aviso(l ? '✓ Lembrete salvo.' : '✓ Lembrete criado.'); fecharJanela(j); await cardLembretes();
  });
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
  let q1 = sb.from('lancamentos').select('*, grupos(nome), clientes(nome), contratos(descricao)').eq('empresa', empresa);
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

// Legenda do lançamento (vale no sistema todo): 2ª linha = "Área do serviço — contrato"; sem contrato, só a área;
// sem área, o tipo (categoria). Ex.: 1ª linha "Consultoria", 2ª linha "Tributário — Contrato Alfa 2026".
function legendaLanc(l) {
  const ct = (l.contratos && l.contratos.descricao) || l.contrato || '';
  const partes = [l.servico, ct].filter(Boolean);
  if (partes.length) return partes.join(' — ');
  return l.categoria && normalizar(l.categoria) !== normalizar(l.descricao) ? l.categoria : '';
}
// Backup 20 — TABELA PADRÃO de pagamento/recebimento (vale para o sistema todo; modelo: vencidos de Acordos):
// [lote] · Quem (advogado que recebe/paga) · Grupo / favorecido (legenda: área do serviço — contrato) · Descrição · Valor ·
// Vencimento (ou "Pago em") · Atraso (dias, vermelho) · ações (✓ Baixa, ✎). Marcar várias linhas = baixa em lote.
function celulaAtraso(venc, l) {
  if (!venc) return '<span class="sub">—</span>';
  const n = diasAte(venc);
  const extra = l && l.cobranca ? '<div class="sub">' + esc(l.cobranca) + '</div>' : '';
  // Backup 21: o dia do vencimento já conta como vencido; até vencer, a régua única: <3 amarelo · <10 azul · ≥10 verde
  if (n < 0) return '<span class="atraso-d">' + (-n) + ' d atraso</span>' + extra;
  if (n === 0) return '<span class="atraso-d">vence hoje</span>' + extra;
  return '<span class="' + (n < 3 ? 'dias-a' : n < 10 ? 'dias-b' : 'dias-g') + '">em ' + n + ' d</span>' + extra;
}
function tabelaLancamentos(lista, opc) {
  opc = opc || {};
  if (!lista.length) return '<div class="vazio">Nenhum lançamento aqui.</div>';
  const porPagamento = opc.aba === 'recebidos' || opc.aba === 'despesas';
  const compacta = !!opc.compacta;
  const comDesc = !opc.semDescricao, comAtraso = !opc.semSituacao && !porPagamento && opc.aba !== 'prejuizo';
  const lote = !compacta && !opc.semLote && lista.some((l) => !l.pago && !l.perda);
  const h = hojeISO();
  const nCols = (lote ? 1 : 0) + (compacta ? 0 : 2) + (comDesc ? 1 : 0) + 2 + (comAtraso ? 1 : 0) + 1;
  return '<div class="lote-wrap">' + (lote ? '<div class="lote-barra" hidden><span class="lote-txt"></span><button type="button" class="btn btn-v btn-mini" data-lote-baixa>✓ Dar baixa nos marcados</button><button type="button" class="btn btn-o btn-mini" data-lote-limpar>Desmarcar</button></div>' : '') +
    '<div class="tabela-wrap"><table class="ordenavel tab-pag' + (opc.semDescricao ? ' tab-rel' : '') + '"><thead><tr>' +
    (lote ? '<th class="sem-ordem th-lote"><input type="checkbox" data-lote-todos aria-label="Marcar todos" title="Marcar todos para dar baixa de uma vez"></th>' : '') +
    (compacta ? '' : '<th>Quem</th><th>Grupo / Favorecido</th>') + (comDesc ? '<th>Descrição</th>' : '') +
    '<th class="num">Valor</th><th data-tipo="data">' + (porPagamento ? 'Pago em' : 'Vencimento') + '</th>' + (comAtraso ? '<th>Atraso</th>' : '') + '<th class="sem-ordem"></th></tr></thead><tbody>' +
    lista.map((l) => {
      const data = porPagamento ? l.data_pagamento : l.vencimento;
      const quem = (l.grupos && l.grupos.nome) || l.favorecido || (l.clientes && l.clientes.nome) || '';
      const venceu = !l.pago && !l.perda && l.vencimento && l.vencimento <= h;
      const leg = legendaLanc(l);
      return '<tr class="clicavel' + (l.vencimento === h && !l.pago ? ' linha-hoje' : '') + '" data-lanc="' + l.id + '" title="Clique para ver o detalhe">' +
        (lote ? '<td class="td-lote">' + (!l.pago && !l.perda ? '<input type="checkbox" data-lote="' + l.id + '" data-valor="' + (l.tipo === 'despesa' ? -l.valor : vl(l)) + '" aria-label="Marcar para dar baixa">' : '') + '</td>' : '') +
        (compacta ? '' : '<td>' + pillPessoa(l.responsavel) + '</td><td title="' + esc(quem) + '">' + esc(quem || '—') +
          (l.clientes && l.grupos ? '<div class="sub">' + esc(l.clientes.nome) + '</div>' : !comDesc && leg ? '<div class="sub">' + esc(leg) + '</div>' : '') + '</td>') +
        (comDesc ? '<td>' + esc(l.descricao) + (leg ? '<div class="sub">' + esc(leg) + '</div>' : '') + '</td>' : '') +
        '<td class="num mono ' + (l.tipo === 'receita' && !l.redutor ? 'valor-rec' : 'valor-desp') + '" data-ord="' + (l.tipo === 'despesa' ? -l.valor : vl(l)) + '">' + (l.tipo === 'despesa' || l.redutor ? '− ' : '') + brl(l.valor) + (l.redutor ? '<div class="sub">redutor</div>' : '') + '</td>' +
        '<td class="mono' + (venceu ? ' venc-atraso' : '') + '" data-ord="' + esc(data || '') + '">' + dataBR(data) + (porPagamento && l.vencimento !== data ? '<div class="sub">venc. ' + dataBR(l.vencimento) + '</div>' : '') + '</td>' +
        (comAtraso ? '<td data-ord="' + (l.pago || l.perda || !l.vencimento ? 99999 : diasAte(l.vencimento)) + '">' + (l.pago ? '<span class="pill pago">pago</span>' : l.perda ? pillSit(l) : celulaAtraso(l.vencimento, l)) + '</td>' : '') +
        '<td class="acoes-l">' +
        (l.pago ? '<button class="btn btn-o btn-mini" data-desfazer="' + l.id + '" title="Voltar para em aberto">↺</button> '
                : l.perda ? '' : '<button class="btn btn-v btn-mini" data-pagar="' + l.id + '" title="Dar baixa — ' + (l.tipo === 'despesa' && !l.redutor ? 'pago' : 'recebido') + ' (pergunta a data)">✓ Baixa</button> ') +
        '<button class="btn btn-o btn-mini btn-ed" data-editar="' + l.id + '" title="Editar" aria-label="Editar">✎</button></td></tr>';
    }).join('') +
    '</tbody><tfoot><tr><td colspan="' + ((lote ? 1 : 0) + (compacta ? 0 : 2) + (comDesc ? 1 : 0)) + '">Total (' + lista.length + ')</td><td class="num mono">' +
    brl(soma(lista, (l) => l.tipo === 'despesa' ? -l.valor : vl(l))) + '</td><td colspan="' + (nCols - (lote ? 1 : 0) - (compacta ? 0 : 2) - (comDesc ? 1 : 0) - 1) + '"></td></tr></tfoot></table></div></div>';
}

function ligarAcoesLancamentos(raiz, depois) {
  const apos = depois || recarregar;
  // baixa em lote: marcar várias linhas → uma data só para todas
  raiz.querySelectorAll('.lote-wrap').forEach((w) => {
    const bar = w.querySelector('.lote-barra'); if (!bar) return;
    const marcados = () => [...w.querySelectorAll('[data-lote]:checked')];
    const atualiza = () => { const m = marcados(); bar.hidden = !m.length; bar.querySelector('.lote-txt').innerHTML = '<b>' + plural(m.length, 'lançamento marcado', 'lançamentos marcados') + '</b> · ' + brl(soma(m, (c) => Number(c.dataset.valor) || 0)); };
    w.querySelectorAll('[data-lote]').forEach((c) => c.onchange = atualiza);
    const todos = w.querySelector('[data-lote-todos]'); if (todos) todos.onchange = () => { w.querySelectorAll('[data-lote]').forEach((c) => { if (!c.closest('tr').classList.contains('pag-oculta')) c.checked = todos.checked; }); atualiza(); };
    bar.querySelector('[data-lote-limpar]').onclick = () => { w.querySelectorAll('[data-lote]').forEach((c) => { c.checked = false; }); if (todos) todos.checked = false; atualiza(); };
    bar.querySelector('[data-lote-baixa]').onclick = (ev) => comBotao(ev.currentTarget, async () => {
      const ids = marcados().map((c) => c.dataset.lote); if (!ids.length) return;
      const bx = await perguntarBaixa({ titulo: 'Baixa em lote — confirme a data', descricao: plural(ids.length, 'lançamento', 'lançamentos'), valor: soma(marcados(), (c) => Number(c.dataset.valor) || 0) });
      if (!bx) return;
      await q(sb.from('lancamentos').update(Object.assign(bx, { cobranca: '', perda: false })).in('id', ids));
      aviso('✓ Baixa de ' + plural(ids.length, 'lançamento', 'lançamentos') + ' em ' + dataBR(bx.data_pagamento) + '.'); await apos();
    });
  });
  raiz.querySelectorAll('tr[data-lanc]').forEach((tr) => tr.addEventListener('click', (ev) => {
    if (ev.target.closest('button, a, input, select, label')) return;
    detalheLancamento(tr.dataset.lanc).catch((e) => aviso(erroAmigavel(e), true));
  }));
  raiz.querySelectorAll('[data-pagar]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const l = await q(sb.from('lancamentos').select('descricao, valor, tipo, redutor').eq('id', b.dataset.pagar).single());
    const bx = await perguntarBaixa({ descricao: l.descricao, valor: l.valor, despesa: l.tipo === 'despesa' && !l.redutor });
    if (!bx) return;
    await q(sb.from('lancamentos').update(Object.assign(bx, { cobranca: '', perda: false })).eq('id', b.dataset.pagar));
    aviso('✓ Baixa registrada em ' + dataBR(bx.data_pagamento) + '.'); await apos();
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
  despesa: ['Distribuição de lucros', 'Pró-labore', 'Folha de Pagamento', 'Aluguel', 'Água / luz / internet', 'Sistema/Software', 'Impostos', 'Comissão', 'Custas processuais', 'Marketing', 'Material de escritório', 'Outros']
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
      // Backup 29: na despesa, a categoria é uma lista; "Distribuição de lucros" pede só o sócio (os campos que não se aplicam somem)
      (tipo === 'despesa'
        ? campo('Tipo de despesa', '<select name="categoria">' + ['', ...CATEGORIAS.despesa, ...(l.categoria && !CATEGORIAS.despesa.includes(l.categoria) ? [l.categoria] : [])]
            .map((c) => '<option value="' + esc(c) + '"' + ((l.categoria || '') === c ? ' selected' : '') + '>' + (c ? esc(c) : '— escolha —') + '</option>').join('') + '</select>') +
          campo('Sócio que recebeu', selectPessoa('socio', /^distribui/i.test(l.categoria || '') ? l.favorecido : '', '— escolha o sócio —'), 'lanc-socio')
        : campo('Categoria / tipo', '<input name="categoria" list="lanc-cat" value="' + esc(l.categoria || '') + '"><datalist id="lanc-cat">' +
          CATEGORIAS[tipo].map((c) => '<option value="' + esc(c) + '">').join('') + '</datalist>')) +
      (tipo === 'receita' ? campo('Área do serviço', selectServico(l.servico || '')) : '') +
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
  const ehLucro = () => tipo === 'despesa' && /^distribui/i.test(f.categoria.value);
  const ajustarLucro = () => {
    const sim = ehLucro();
    j.querySelectorAll('.lanc-socio').forEach((x) => x.classList.toggle('escondido', !sim));
    ['grupo', 'cliente_id', 'favorecido', 'referencia', 'cobranca', 'chave_pix'].forEach((n) => { const c = f[n] && f[n].closest('.campo'); if (c) c.classList.toggle('escondido', sim); });
    if (sim && !f.descricao.value.trim()) f.descricao.value = 'Distribuição de lucros' + (f.socio.value ? ' — ' + f.socio.value : '');
  };
  if (tipo === 'despesa') { f.categoria.onchange = ajustarLucro; f.socio.onchange = () => { if (/^Distribuição de lucros/.test(f.descricao.value) || !f.descricao.value.trim()) f.descricao.value = 'Distribuição de lucros' + (f.socio.value ? ' — ' + f.socio.value : ''); }; ajustarLucro(); }
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  f.onsubmit = (ev) => { ev.preventDefault(); j.querySelector('#btn-salvar-lanc').click(); };
  const apos = depois || recarregar;

  j.querySelector('#btn-salvar-lanc').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const valor = lerValor(f.valor.value);
    if (!f.descricao.value.trim()) throw new Error('Preencha a descrição.');
    if (!(valor > 0)) throw new Error('Informe um valor maior que zero (ex.: 1.500,00).');
    if (!f.vencimento.value) throw new Error('Informe o vencimento.');
    if (tipo === 'despesa' && /^distribui/i.test(f.categoria.value) && !f.socio.value) throw new Error('Escolha o sócio que recebeu a distribuição de lucros.');
    const lucro = tipo === 'despesa' && /^distribui/i.test(f.categoria.value);
    const grupo_id = lucro ? null : await grupoPorNome(f.grupo.value);
    const dados = {
      tipo, empresa: f.empresa.value, descricao: f.descricao.value.trim(), valor, vencimento: f.vencimento.value,
      grupo_id, cliente_id: lucro ? null : (f.cliente_id.value || null), categoria: f.categoria.value.trim(), servico: f.servico ? f.servico.value : (l.servico || ''),
      favorecido: lucro ? f.socio.value : f.favorecido ? f.favorecido.value.trim() : (l.favorecido || ''),
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


// Detalhe de um honorário/lançamento (clique na linha do Financeiro): o que é, de quem, contrato e ações
async function detalheLancamento(id) {
  const l = (await q(sb.from('lancamentos').select('*, grupos(nome), clientes(nome), contratos(descricao, modalidade, servico)').eq('id', id)))[0];
  if (!l) return aviso('Lançamento não encontrado (pode ter sido excluído ou ser de outra área).', true);
  const lin = (rot, v) => v ? '<div class="tf-lin"><span>' + rot + '</span><div>' + v + '</div></div>' : '';
  const empresa = l.empresa === 'contabilidade' ? 'Contabilidade' : 'Jurídico';
  const j = abrirJanela({ titulo: (l.tipo === 'despesa' ? 'Despesa' : l.redutor ? 'Redutor de receita' : 'Honorário') + ' — ' + empresa, larga: true,
    corpo: '<div class="tf-ficha"><div class="tf-ficha-hd"><h3>' + esc(l.descricao) + '</h3><div class="tf-selos">' + pillSit(l) +
        (l.servico ? ' <span class="pill neutro">' + esc(l.servico) + '</span>' : '') + (l.categoria ? ' <span class="pill neutro">' + esc(l.categoria) + '</span>' : '') + '</div></div>' +
      '<div class="tf-grade">' +
        lin('Valor', '<b>' + (l.redutor || l.tipo === 'despesa' ? '− ' : '') + brl(l.valor) + '</b>') +
        lin('Vencimento', dataBR(l.vencimento)) + lin('Recebido em', l.pago ? dataBR(l.data_pagamento) + (l.forma_pagamento ? ' · ' + esc(l.forma_pagamento) : '') : '') +
        lin('Grupo', esc((l.grupos && l.grupos.nome) || '')) + lin('Cliente', esc((l.clientes && l.clientes.nome) || '')) + lin('Favorecido', esc(l.favorecido || '')) +
        lin('Responsável', l.responsavel ? pillPessoa(l.responsavel) : '') + lin('Área do serviço', esc(l.servico || '')) + lin('Tipo', esc(l.categoria || '')) +
        lin('Referência', esc(l.referencia || '')) + lin('Situação da cobrança', esc(l.cobranca || '')) +
        lin('Contrato', l.contratos ? esc(l.contratos.descricao) + (l.contratos.modalidade === 'consultoria' ? ' <span class="sub">(consultoria mensal)</span>' : '') : '') +
      '</div>' + (l.obs ? '<div class="tf-bloco"><div class="secao">Observação</div><div class="tf-texto">' + esc(l.obs).replace(/\n/g, '<br>') + '</div></div>' : '') + '</div>',
    rodape: '<span>' + (l.contrato_id ? '<button class="btn btn-o btn-mini" type="button" id="dl-ctr">Abrir contrato</button> ' : '') +
        (l.cliente_id ? '<button class="btn btn-o btn-mini" type="button" id="dl-cli">Ficha do cliente</button>' : '') +
        // Backup 32: recibo já preenchido na Central de Documentos (valor, data, forma e cliente)
        (l.pago && l.tipo === 'receita' ? ' <a class="btn btn-o btn-mini" id="dl-recibo" target="_blank" rel="noopener" href="documentos/index.html?lancamento=' + encodeURIComponent(l.id) + '">📄 Recibo</a>' : '') + '</span>' +
      '<div class="acoes"><button class="btn btn-o" type="button" data-editar="' + l.id + '">✎ Editar</button>' +
      (!l.pago && !l.perda ? '<button class="btn btn-v" type="button" data-pagar="' + l.id + '">✓ ' + (l.tipo === 'despesa' && !l.redutor ? 'Pago' : 'Recebido') + '</button>' : '') + '</div>' });
  ligarAcoesLancamentos(j, async () => { fecharJanela(j); if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); else await recarregar(); });
  const bc = j.querySelector('#dl-ctr'); if (bc) bc.onclick = () => { fecharJanela(j); detalheContrato(l.contrato_id); };
  const bl = j.querySelector('#dl-cli'); if (bl) bl.onclick = () => { fecharJanela(j); abrirFicha(l.cliente_id); };
  return j;
}

// ─────────── Editar em tabela / por planilha (Backup 16) ───────────
// Para completar dados importados sem detalhe (área do serviço, descrição, tipo, pessoa, datas…):
// edita na tela (Tab/Enter/colar do Excel) ou baixa a planilha, ajusta no Excel e envia de volta.
// A coluna "id" liga cada linha ao lançamento; só o que mudou é gravado.
const COLS_LANC = [
  ['vencimento', 'Vencimento', 'data'], ['descricao', 'Descrição', 'texto'], ['categoria', 'Tipo', 'texto'], ['servico', 'Área do serviço', 'area'],
  ['referencia', 'Referência', 'texto'], ['valor', 'Valor', 'valor'], ['responsavel', 'Pessoa', 'texto'], ['pago', 'Pago', 'simnao'],
  ['data_pagamento', 'Pago em', 'data'], ['obs', 'Observação', 'texto']];
const txtLanc = (l, k, t) => { const v = l[k];
  if (t === 'simnao') return v ? 'Sim' : 'Não';
  if (v == null || v === '') return '';
  if (t === 'valor') return Number(v).toFixed(2).replace('.', ',');
  if (t === 'data') return dataBR(v);
  return String(v); };
function lerCelLanc(k, t, v, rot) {
  v = String(v == null ? '' : v).trim();
  if (t === 'simnao') return /^(s|sim|x|true|1|pago)$/i.test(v);
  if (t === 'valor') { const n = lerValor(v.replace(/^R\$\s*/, '')); if (!v || isNaN(n)) throw new Error(rot + ': valor inválido ("' + v + '").'); return n; }
  if (t === 'data') { if (!v) return null; const d = /^\d{4}-\d{2}-\d{2}/.test(v) ? { iso: v.slice(0, 10) } : lerDataBR(v); if (!d) throw new Error(rot + ': data inválida ("' + v + '"), use dd/mm/aaaa.'); return d.iso; }
  if (t === 'area') { if (!v) return ''; const a = AREAS_SERVICO.find((x) => normalizar(x) === normalizar(v)); if (!a) throw new Error(rot + ': área "' + v + '" não existe (use ' + AREAS_SERVICO.join(', ') + ').'); return a; }
  if (k === 'descricao' && !v) throw new Error(rot + ': a descrição não pode ficar vazia.');
  return v;
}
async function edicaoLancamentos(empresa) {
  const nomeEmp = empresa === 'contabilidade' ? 'Contabilidade' : 'Jurídico';
  const todos = await buscarTodos(() => sb.from('lancamentos').select('*, grupos(nome), clientes(nome)').eq('empresa', empresa).order('vencimento', { ascending: false }));
  const EST = { filtro: 'sem_area', busca: '' };
  const j = abrirJanela({ titulo: '✎ Editar em tabela — Financeiro ' + nomeEmp, larga: true,
    corpo: '<div class="dica" style="margin-bottom:10px">Para completar o que veio da planilha sem detalhe. Clique numa célula e digite (<b>Tab</b> anda para a direita, <b>Enter</b> para baixo, pode <b>colar do Excel</b>). ' +
        'Ou use <b>⬇ Baixar planilha</b>, ajuste no Excel (não mexa na coluna <b>id</b>) e <b>⬆ Enviar planilha</b>. Só o que mudou é gravado.</div>' +
      '<div class="filtros" style="margin-bottom:8px"><select class="busca sel" id="ml-filtro"><option value="sem_area">Sem área do serviço</option><option value="receitas">Todas as receitas</option>' +
        '<option value="todos">Tudo (receitas e despesas)</option></select><input class="busca" id="ml-busca" placeholder="Buscar grupo, cliente ou descrição" autocomplete="off">' +
        '<span class="sub" id="ml-qtd"></span></div><div id="ml-grade"></div>',
    rodape: '<span><button class="btn btn-o" type="button" id="ml-baixar">⬇ Baixar planilha</button> <label class="btn btn-o" style="cursor:pointer">⬆ Enviar planilha<input type="file" id="ml-arq" accept=".xlsx" hidden></label></span>' +
      '<div class="acoes"><span class="sub" id="ml-conta">Nenhuma alteração</span><button class="btn btn-p" type="button" id="ml-salvar">Salvar alterações</button></div>' });
  j.querySelector('.janela').classList.add('janela-massa', 'janela-cheia');
  let lista = [];
  const filtrar = () => { const b = normalizar(EST.busca);
    return todos.filter((l) => (EST.filtro === 'todos' || l.tipo === 'receita') && (EST.filtro !== 'sem_area' || !l.servico) &&
      (!b || normalizar([(l.grupos || {}).nome, (l.clientes || {}).nome, l.favorecido, l.descricao].join(' ')).includes(b))).slice(0, 400); };
  const cel = (i, c) => j.querySelector('tr[data-i="' + i + '"] [data-c="' + c + '"]');
  const marcar = (el) => { const l = lista[+el.closest('tr').dataset.i], [k, , t] = COLS_LANC[+el.dataset.c];
    el.closest('td').classList.toggle('mudou', el.value.trim() !== txtLanc(l, k, t));
    const n = new Set([...j.querySelectorAll('td.mudou')].map((td) => td.parentElement.dataset.i)).size;
    j.querySelector('#ml-conta').textContent = n ? n + ' linha(s) alterada(s)' : 'Nenhuma alteração'; };
  const pintar = () => {
    if (j.querySelector('td.mudou') && !confirm('Há alterações não salvas nesta lista. Trocar o filtro e perder essas alterações?')) return;
    lista = filtrar();
    j.querySelector('#ml-qtd').textContent = lista.length + (lista.length === 400 ? '+ (mostrando 400 — use a busca)' : '') + ' lançamento(s)';
    j.querySelector('#ml-grade').innerHTML = lista.length ? '<div class="tabela-wrap massa-wrap"><table class="massa"><thead><tr><th>Grupo / cliente</th>' +
      COLS_LANC.map(([, r, t]) => '<th' + (t === 'valor' ? ' class="num"' : '') + '>' + r + '</th>').join('') + '</tr></thead><tbody>' +
      lista.map((l, i) => '<tr data-i="' + i + '"><td class="sub">' + esc((l.grupos && l.grupos.nome) || (l.clientes && l.clientes.nome) || l.favorecido || '—') + '</td>' +
        COLS_LANC.map(([k, , t], jx) => '<td>' + (t === 'area' ? '<select data-k="' + k + '" data-c="' + jx + '"><option value=""></option>' + AREAS_SERVICO.map((a) => '<option' + (l.servico === a ? ' selected' : '') + '>' + a + '</option>').join('') + '</select>'
          : t === 'simnao' ? '<select data-k="' + k + '" data-c="' + jx + '"><option' + (l.pago ? '' : ' selected') + '>Não</option><option' + (l.pago ? ' selected' : '') + '>Sim</option></select>'
          : '<input data-k="' + k + '" data-c="' + jx + '" value="' + esc(txtLanc(l, k, t)) + '"' + (t === 'valor' ? ' inputmode="decimal" class="num"' : t === 'data' ? ' placeholder="dd/mm/aaaa" class="mono"' : '') + '>') + '</td>').join('') + '</tr>').join('') +
      '</tbody></table></div>' : vazio('Nada neste filtro. 👏');
    j.querySelector('#ml-conta').textContent = 'Nenhuma alteração';
    j.querySelectorAll('[data-k]').forEach((el) => {
      el.oninput = el.onchange = () => marcar(el);
      el.onkeydown = (ev) => { if (ev.key !== 'Enter' || el.tagName === 'SELECT') return; ev.preventDefault(); const p = cel(+el.closest('tr').dataset.i + 1, +el.dataset.c); if (p) p.focus(); };
      el.onpaste = (ev) => {
        const dado = (ev.clipboardData || window.clipboardData).getData('text'); if (!/[\t\n]/.test(dado)) return;
        ev.preventDefault(); const i0 = +el.closest('tr').dataset.i, c0 = +el.dataset.c;
        dado.replace(/\r/g, '').replace(/\n$/, '').split('\n').forEach((lin, di) => lin.split('\t').forEach((v, dc) => {
          const alvo = cel(i0 + di, c0 + dc); if (!alvo) return;
          if (alvo.tagName === 'SELECT') { const o = [...alvo.options].find((x) => normalizar(x.value || x.text) === normalizar(v.trim())); if (o) alvo.value = o.value || o.text; }
          else alvo.value = v.trim();
          marcar(alvo); }));
      };
    });
  };
  j.querySelector('#ml-filtro').onchange = (ev) => { EST.filtro = ev.target.value; pintar(); };
  let t0; j.querySelector('#ml-busca').oninput = (ev) => { clearTimeout(t0); t0 = setTimeout(() => { EST.busca = ev.target.value; pintar(); }, 300); };
  pintar();
  const gravar = async (mudancas) => {
    let ok = 0, rasc = 0;
    for (const [l, d] of mudancas) {
      if ('pago' in d && d.pago && !d.data_pagamento && !l.data_pagamento) d.data_pagamento = hojeISO();
      if ('pago' in d && !d.pago) d.data_pagamento = null;
      const { error } = await sb.from('lancamentos').update(d).eq('id', l.id);
      if (error && error.rascunho) rasc++; else if (error) throw new Error((l.descricao || 'lançamento') + ': ' + erroAmigavel(error)); else ok++;
    }
    return { ok, rasc };
  };
  const fim = async (r) => { fecharJanela(j);
    aviso(r.rasc ? '📝 ' + r.rasc + ' alteração(ões) enviada(s) para aprovação' + (r.ok ? ' e ' + r.ok + ' gravada(s)' : '') + '.' : '✓ ' + r.ok + ' lançamento(s) atualizado(s).');
    if (typeof recarregar === 'function') await recarregar(); };
  j.querySelector('#ml-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const linhas = [...new Set([...j.querySelectorAll('td.mudou')].map((td) => +td.parentElement.dataset.i))];
    if (!linhas.length) throw new Error('Nada foi alterado.');
    const mud = linhas.map((i) => { const l = lista[i], d = {};
      j.querySelectorAll('tr[data-i="' + i + '"] td.mudou [data-k]').forEach((el) => { const [k, r, t] = COLS_LANC[+el.dataset.c]; d[k] = lerCelLanc(k, t, el.value, r + ' de "' + (l.descricao || '') + '"'); });
      return [l, d]; });
    await fim(await gravar(mud));
  });
  j.querySelector('#ml-baixar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    await carregarScript('vendor/exceljs.min.js');
    const wb = new window.ExcelJS.Workbook(), ws = wb.addWorksheet('Lançamentos');
    ws.addRow(['id', 'Grupo / cliente', 'Receita/Despesa'].concat(COLS_LANC.map((c) => c[1]))).font = { bold: true };
    todos.forEach((l) => ws.addRow([l.id, (l.grupos && l.grupos.nome) || (l.clientes && l.clientes.nome) || l.favorecido || '', l.tipo === 'despesa' ? 'Despesa' : 'Receita']
      .concat(COLS_LANC.map(([k, , t]) => t === 'valor' ? Number(l[k]) || 0 : txtLanc(l, k, t)))));
    ws.views = [{ state: 'frozen', ySplit: 1 }]; ws.getColumn(1).hidden = false; ws.getColumn(1).width = 12;
    [2, 5, 13].forEach((c) => { ws.getColumn(c).width = 34; }); [4, 6, 7, 9, 10, 11, 12].forEach((c) => { ws.getColumn(c).width = 15; });
    const ls = wb.addWorksheet('Áreas do serviço'); AREAS_SERVICO.forEach((a) => ls.addRow([a]));
    const buf = await wb.xlsx.writeBuffer();
    baixarArquivo('Lancamentos ' + nomeEmp + ' ' + hojeISO() + '.xlsx', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  });
  j.querySelector('#ml-arq').onchange = (ev) => comBotao(null, async () => {
    const arq = ev.target.files[0]; if (!arq) return;
    await carregarScript('vendor/exceljs.min.js');
    const wb = new window.ExcelJS.Workbook(); await wb.xlsx.load(await arq.arrayBuffer());
    const ws = wb.worksheets[0], cab = (ws.getRow(1).values || []).map((v) => String(v || '').trim());
    const ci = (rot) => cab.findIndex((x) => normalizar(x) === normalizar(rot));
    if (ci('id') < 0) throw new Error('A planilha precisa da coluna "id" (use a planilha baixada aqui).');
    const porId = {}; todos.forEach((l) => { porId[l.id] = l; });
    const mud = []; let ign = 0;
    ws.eachRow((row, n) => { if (n === 1) return;
      const cv = (i) => { const x = row.getCell(i).value; return x && typeof x === 'object' && x.result !== undefined ? x.result : x instanceof Date ? x.toISOString().slice(0, 10) : x; };
      const l = porId[String(cv(ci('id')) || '').trim()]; if (!l) { ign++; return; }
      const d = {};
      COLS_LANC.forEach(([k, r, t]) => { const c = ci(r); if (c < 0) return;
        const bruto = cv(c), novo = lerCelLanc(k, t, t === 'valor' && typeof bruto === 'number' ? String(bruto).replace('.', ',') : bruto, r + ' (linha ' + n + ')');
        const atual = t === 'simnao' ? !!l[k] : t === 'valor' ? Number(l[k]) || 0 : (l[k] == null ? (t === 'data' ? null : '') : l[k]);
        if (t === 'valor' ? Math.abs(novo - atual) > 0.004 : String(novo == null ? '' : novo) !== String(atual == null ? '' : atual)) d[k] = novo; });
      if (Object.keys(d).length) mud.push([l, d]); });
    ev.target.value = '';
    if (!mud.length) return aviso('Nenhuma diferença encontrada na planilha' + (ign ? ' (' + ign + ' linha(s) sem id conhecido foram ignoradas)' : '') + '.');
    if (!confirm(mud.length + ' lançamento(s) serão atualizados a partir da planilha' + (ign ? ' (' + ign + ' linha(s) ignoradas: id desconhecido)' : '') + '. Continuar?')) return;
    await fim(await gravar(mud));
  });
}

'use strict';
// ═══════════════════════════════════════════════════════════════════
// Clientes (cadastro completo da Base de Dados) e Contratos.
// ═══════════════════════════════════════════════════════════════════

// ─────────────────────────── CLIENTES ──────────────────────────────
async function consultarCnpjNovo(id, nome) {
  try {
    const r = await chamarFuncao('erp-cnpj', { acao: 'rodar', cliente_id: id, auto: true });
    if (r.desligada) return;
    aviso(/aguardando/.test(r.mensagem || '') ? '⏳ ' + nome + ': CNPJ novo, ainda não está na base pública da Receita — o sistema tenta de novo todo dia.'
      : '✓ Dados da Receita preenchidos para ' + nome + '.');
    await carregarCadastros(true);
  } catch (e) { console.warn('[ERP] consulta do CNPJ na hora não rodou (fica para a rotina das 6h):', e.message); }
}

TELAS.clientes = async function () {
  E.cli = E.cli || { tipo: 'ativos', grupo: '', busca: '', area: '', visao: 'grupo' };
  await carregarCadastros();
  const C = E.cli;
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Clientes</h1><p id="cli-conta"></p></div>' +
    '<div class="acoes"><button class="btn btn-p" data-novo="cliente">+ Novo cliente</button></div></div>' +
    '<div class="filtros">' +
    '<div class="segmento" id="cli-visao" title="Como mostrar a lista">' + [['grupo', 'Por grupo'], ['lista', 'Lista']].map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<div class="segmento" id="cli-tipo">' + [['ativos', 'Ativos'], ['Consultoria', 'Consultoria'], ['Demanda', 'Serviço pontual'], ['Inativo', 'Inativos'], ['todos', 'Todos']]
      .map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    (minhasAreas() === 'ambos' ? '<select class="busca sel" id="cli-area" aria-label="Área" style="max-width:190px"><option value="">Todas as áreas</option><option value="juridico">Jurídico</option><option value="contabil">Contabilidade</option></select>' : '') +
    '<select class="busca sel" id="cli-grupo" autocomplete="off"><option value="">Todos os grupos</option>' +
    E.grupos.map((g) => '<option value="' + g.id + '">' + esc(g.nome) + '</option>').join('') + '</select>' +
    '<input class="busca" id="cli-busca" placeholder="Buscar nome, grupo, responsável ou CPF/CNPJ" autocomplete="off">' +
    '<button class="btn btn-o" type="button" id="cli-relatorio" title="Lista filtrada com todos os campos, em tabela e CSV">⬇ Relatório</button>' +
    '<button class="btn btn-o" type="button" id="cli-massa" title="Editar passivo, CEAT e CAPAG de vários clientes numa tabela (aceita colar do Excel)">✎ Editar em tabela</button>' +
    '</div><div id="cli-corpo"></div>';
  $('cli-tipo').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { C.tipo = b.dataset.v; pintarClientes(); } };
  $('cli-visao').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { C.visao = b.dataset.v; pintarClientes(); } };
  $('cli-grupo').onchange = (ev) => { C.grupo = ev.target.value; pintarClientes(); };
  if ($('cli-area')) { $('cli-area').value = C.area || ''; $('cli-area').onchange = (ev) => { C.area = ev.target.value; pintarClientes(); }; }
  let t;
  $('cli-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { C.busca = ev.target.value; pintarClientes(); }, 250); };
  $('cli-relatorio').onclick = () => { const l = E.cli.ultima || [];
    relatorioTabela({ titulo: 'Clientes', ids: l.map((c) => c.id),
      colunas: ['Grupo', 'Nome', 'CPF/CNPJ', 'Área', 'Tipo', 'Responsável', 'E-mail', 'Telefone', 'Cidade/UF', 'Procuração', 'Certificado', 'CAPAG', 'Situação cadastral'],
      linhas: l.map((c) => [c.grupos ? c.grupos.nome : '', c.nome, mascaraDoc(c.cpf_cnpj), rotArea(c.area), c.tipo === 'Demanda' ? 'Serviço pontual' : c.tipo, c.responsavel, c.email, c.telefone,
        [c.cidade, c.estado].filter(Boolean).join('/'), c.procuracao === true ? 'Sim' : c.procuracao === false ? 'Não' : '', c.certificado === true ? 'Sim' : c.certificado === false ? 'Não' : '', c.capag, c.situacao_cadastral]) }); };
  $('cli-massa').onclick = () => edicaoEmMassa(E.cli.ultima || []);
  ligarBotoesNovo($('conteudo'));
  pintarClientes();
};

function pintarClientes() {
  const C = E.cli, b = normalizar(C.busca), bd = soDigitos(C.busca);
  document.querySelectorAll('#cli-tipo button').forEach((x) => x.classList.toggle('ativo', x.dataset.v === C.tipo));
  document.querySelectorAll('#cli-visao button').forEach((x) => x.classList.toggle('ativo', x.dataset.v === (C.visao || 'grupo')));
  if (document.activeElement !== $('cli-grupo')) $('cli-grupo').value = C.grupo;
  if (document.activeElement !== $('cli-busca')) $('cli-busca').value = C.busca;
  const lista = E.clientes.filter((c) => {
    if (C.tipo === 'ativos' && c.tipo === 'Inativo') return false;
    if (C.tipo !== 'ativos' && C.tipo !== 'todos' && c.tipo !== C.tipo) return false;
    if (C.grupo && c.grupo_id !== C.grupo) return false;
    if (C.area && (c.area || 'ambos') !== C.area && (c.area || 'ambos') !== 'ambos') return false;
    if (b && !(normalizar(c.nome + ' ' + (c.grupos ? c.grupos.nome : '') + ' ' + c.responsavel + ' ' + c.socio_admin).includes(b) ||
               (bd && soDigitos(c.cpf_cnpj).includes(bd)))) return false;
    return true;
  });
  // "Por grupo" (padrão): ordem grupo → nome, com uma linha de título por grupo
  const porGrupo = (C.visao || 'grupo') === 'grupo';
  const gn = (c) => (c.grupos ? c.grupos.nome : '') || '';
  if (porGrupo) lista.sort((a, x) => (gn(a) || '\uffff').localeCompare(gn(x) || '\uffff', 'pt-BR') || String(a.nome).localeCompare(String(x.nome), 'pt-BR'));
  C.ultima = lista;
  $('cli-conta').textContent = lista.length + ' de ' + E.clientes.length + ' cadastro(s) · clique na linha para abrir a ficha completa';
  $('cli-corpo').innerHTML = '<div class="card">' + (lista.length ?
    '<div class="tabela-wrap"><table class="' + (porGrupo ? '' : 'ordenavel ') + 'cli-tabela"><thead><tr><th>Grupo</th><th>Nome</th><th>CPF/CNPJ</th><th>Área</th><th>Responsável</th>' +
    '<th>Procuração</th><th>Certificado</th><th>Situação</th></tr></thead><tbody>' +
    lista.map((c, i) => (porGrupo && (i === 0 || gn(lista[i - 1]) !== gn(c)) ? '<tr class="cli-grp"><td colspan="8">' + esc(gn(c) || 'Sem grupo') +
        ' <span class="sub">' + plural(lista.filter((x) => gn(x) === gn(c)).length, 'cadastro', 'cadastros') + '</span></td></tr>' : '') + '<tr class="clicavel cli-linha" tabindex="0" data-cli="' + c.id + '" title="Abrir a ficha completa">' +
      '<td class="cli-grupo" title="' + esc(c.grupos ? c.grupos.nome : '') + '">' + esc(c.grupos ? c.grupos.nome : '—') + '</td>' +
      '<td><span class="cli-nome">' + esc(c.nome) + '</span>' + (c.socio_admin ? '<div class="sub cli-socio">' + esc(c.socio_admin) + '</div>' : '') + '</td>' +
      '<td class="mono">' + esc(mascaraDoc(c.cpf_cnpj) || '—') + '</td>' +
      '<td>' + pillAreaCli(c.area) + '</td>' +
      '<td>' + pillPessoa(c.responsavel) + '</td><td>' + pillSimNao(c.procuracao) + '</td><td>' + pillSimNao(c.certificado) + '</td>' +
      '<td>' + pillSitCad(c.situacao_cadastral) + '</td></tr>').join('') +
    '</tbody></table></div>'
    : (E.clientes.length ? vazio('Nenhum cliente neste recorte — mude o filtro ou a busca.') : vazio('Nenhum cliente ainda. Cadastre o primeiro ou importe a Base de Dados em Administração.', '+ Novo cliente', '[data-novo=cliente]'))) + '</div>';
  $('cli-corpo').querySelectorAll('tr[data-cli]').forEach((tr) => {
    tr.onclick = () => abrirFicha(tr.dataset.cli);
    tr.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrirFicha(tr.dataset.cli); } };
  });
}

// Backup 28: coluna Área (Jurídico · Contábil · Jurídico e contábil)
function pillAreaCli(a) {
  a = a || 'ambos';
  return '<span class="pill area-' + a + '">' + (a === 'juridico' ? 'Jurídico' : a === 'contabil' ? 'Contábil' : 'Jurídico e contábil') + '</span>';
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
  return campo(rotulo, '<input name="' + nome + '" inputmode="decimal" data-mascara="brl" placeholder="R$ 0,00" value="' + (v == null || v === '' ? '' : 'R$ ' + esc(valorParaCampo(v))) + '">');
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
  // Backup 28: cadastro em abas, vários e-mails e telefones, CNPJ consultado enquanto digita, grupo existente ou novo
  const ABAS_CLI = [['id', '🏢 Empresa'], ['class', '🗂 Classificação'], ['contato', '📞 Contatos'], ['end', '📍 Endereço'], ['sit', '🏛 Situação e passivo'], ['obs', '📝 Observações']];
  const aba = (k, html) => '<div class="cli-aba grade g3 inteiro" data-aba="' + k + '"' + (k === 'id' ? '' : ' hidden') + '>' + html + '</div>';
  const setorOpc = (v) => SETORES_CONTATO.map(([k, r]) => '<option value="' + k + '"' + (k === (v || 'geral') ? ' selected' : '') + '>' + r + '</option>').join('');
  const linhaEmail = (v, principal) => '<div class="cli-lin cli-lin-email"><span class="cli-lin-ic" aria-hidden="true">✉</span><input ' + (principal ? 'name="email"' : 'data-extra="email"') + ' type="email" placeholder="nome@empresa.com.br" value="' + esc(v || '') + '">' +
    '<select data-setor>' + setorOpc(principal ? 'geral' : 'financeiro') + '</select>' + (principal ? '<span class="pill neutro" title="E-mail principal do cadastro">principal</span>' : '<button type="button" class="btn btn-o btn-mini" data-tirar title="Tirar">✕</button>') + '</div>';
  const linhaTel = (v, principal) => '<div class="cli-lin cli-lin-tel"><span class="cli-lin-ic" aria-hidden="true">📱</span><input ' + (principal ? 'name="telefone"' : 'data-extra="telefone"') + ' type="tel" data-mascara="tel" inputmode="tel" placeholder="(37) 9 9999-9999" value="' + esc(v || '') + '">' +
    '<select data-setor>' + setorOpc(principal ? 'geral' : 'financeiro') + '</select>' + (principal ? '<span class="pill neutro">principal</span>' : '<button type="button" class="btn btn-o btn-mini" data-tirar title="Tirar">✕</button>') + '</div>';
  const grupoAtual = cl.grupo_id || '';
  const j = abrirJanela({
    titulo: novo ? 'Novo cliente' : cl.nome, larga: true,
    corpo:
      '<form id="f-cli" class="grade g3 cli-form">' + resumo +
      '<div class="inteiro"><div class="segmento cli-abas" id="cli-abas" role="tablist">' + ABAS_CLI.map(([k, r], i) => '<button type="button" role="tab" data-cli-aba="' + k + '"' + (i ? '' : ' class="ativo"') + '>' + r + '</button>').join('') + '</div></div>' +
      aba('id',
        campo('CPF/CNPJ', '<div class="cli-doc"><input name="cpf_cnpj" inputmode="numeric" maxlength="18" placeholder="00.000.000/0000-00" value="' + esc(mascaraDoc(cl.cpf_cnpj)) + '">' +
          '<button type="button" class="btn btn-p" id="cli-buscar" title="Busca na Receita e preenche nome, endereço, situação, sócio, e-mail, telefone, tipo societário e regime">🔎 Buscar dados</button></div><div class="sub" id="cli-doc-aviso"></div>', 'dois') +
        campo('Nome / Razão social <span class="obrig">*</span>', '<input name="nome" required maxlength="200" value="' + esc(cl.nome || '') + '">', 'inteiro') +
        '<div class="inteiro" id="cli-cnpj-card"></div>' +
        campo('Tipo societário', selectOpcoes('tipo_societario', ['LTDA', 'S.A', 'MEI', 'EI', 'SLU', 'PF'], cl.tipo_societario)) +
        campo('Sócio-administrador', '<input name="socio_admin" value="' + esc(cl.socio_admin || '') + '">') +
        campo('Regime tributário', selectOpcoes('regime_tributario', ['PF', 'SN', 'LP', 'LR', 'BAIXADA'], cl.regime_tributario))) +
      aba('class',
        campo('Grupo', '<select name="grupo_sel"><option value="">— sem grupo —</option>' + E.grupos.map((g) => '<option value="' + g.id + '"' + (g.id === grupoAtual ? ' selected' : '') + '>' + esc(g.nome) + '</option>').join('') + '</select>' +
          '<label class="cli-chk"><input type="checkbox" name="grupo_novo"> É um grupo novo</label><input name="grupo" placeholder="Nome do grupo novo" hidden>') +
        campo('Tipo', '<select name="tipo">' + [['Consultoria', 'Consultoria'], ['Demanda', 'Serviço pontual'], ['Inativo', 'Inativo']].map(([t, r]) => '<option value="' + t + '"' + (cl.tipo === t ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>') +
        campo('Área do cliente', '<select name="area">' + AREAS.filter(([v]) => minhasAreas() === 'ambos' || v === minhasAreas() || v === (cl.area || '')).map(([v, r]) =>
          '<option value="' + v + '"' + ((cl.area || (novo ? minhasAreas() : 'ambos')) === v ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>') +
        campo('Responsável (quem cuida)', selectPessoa('responsavel', cl.responsavel || '', '— escolha —')) +
        campo('Origem', '<select name="origem">' + ['', ...ORIGENS_CLIENTE, ...(cl.origem && !ORIGENS_CLIENTE.includes(cl.origem) ? [cl.origem] : [])].map((o) =>
          '<option value="' + esc(o) + '"' + ((cl.origem || '') === o ? ' selected' : '') + '>' + (o ? esc(o) : '—') + '</option>').join('') + '</select>') +
        campo('Indicado por', '<input name="indicado_por" maxlength="200" placeholder="Quem indicou (quando a origem é Indicação)" value="' + esc(cl.indicado_por || '') + '">')) +
      aba('contato',
        '<div class="inteiro cli-bloco"><div class="cli-lista-tit"><span>E-mails</span><span class="sub">o principal é o do cadastro; os outros viram contatos do setor escolhido</span><button type="button" class="btn btn-o btn-mini" id="cli-mais-email">+ Adicionar e-mail</button></div><div id="cli-emails">' + linhaEmail(cl.email, true) + '</div></div>' +
        '<div class="inteiro cli-bloco"><div class="cli-lista-tit"><span>Telefones / WhatsApp</span><span class="sub">celular com 9 dígitos vira link de WhatsApp</span><button type="button" class="btn btn-o btn-mini" id="cli-mais-tel">+ Adicionar telefone</button></div><div id="cli-tels">' + linhaTel(cl.telefone, true) + '</div></div>' +
        campo('E-mails automáticos', '<select name="perfil_email" title="Quais e-mails automáticos este cliente recebe">' + PERFIS_EMAIL.map(([v, r]) =>
          '<option value="' + v + '"' + ((cl.perfil_email || 'padrao') === v ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>') +
        '<div class="dica dois">Os e-mails e telefones a mais viram <b>contatos</b> do cliente, com o setor escolhido (financeiro, fiscal, RH…): é por eles que o sistema sabe para quem mandar cobranças, guias e recibos (ficha → Contatos).</div>') +
      aba('end',
        campo('CEP', '<input name="cep" inputmode="numeric" maxlength="9" value="' + esc(cl.cep || '') + '">') +
        campo('Endereço', '<input name="endereco" value="' + esc(cl.endereco || '') + '">', 'dois') +
        campo('Cidade', '<input name="cidade" value="' + esc(cl.cidade || '') + '">') +
        campo('UF', '<input name="estado" maxlength="2" style="text-transform:uppercase" value="' + esc(cl.estado || '') + '">')) +
      aba('sit',
        campo('Em operação', selectSimNao('em_operacao', cl.em_operacao)) +
        campo('Procuração', selectSimNao('procuracao', cl.procuracao)) +
        campo('Certificado', selectSimNao('certificado', cl.certificado)) +
        campo('Cadastro regular', selectSimNao('cadastro_regular', cl.cadastro_regular)) +
        campo('CAPAG', selectOpcoes('capag', ['A', 'B', 'C', 'D', 'Omisso'], cl.capag)) +
        campo('Situação cadastral', selectOpcoes('situacao_cadastral', ['ATIVA', 'SUSPENSA', 'INAPTA', 'BAIXADA', 'NULA'], cl.situacao_cadastral)) +
        campoValor('RFB', 'rfb', cl.rfb) + campoValor('RFB negociada', 'rfb_negociada', cl.rfb_negociada) + campoValor('SEFAZ/MG', 'sefaz_mg', cl.sefaz_mg) +
        campoValor('PGFN', 'pgfn', cl.pgfn) + campoValor('PGFN negociada', 'pgfn_negociada', cl.pgfn_negociada) +
        campo('CEAT (TRT-3) — processos', '<input name="ceat_trt3" type="number" min="0" value="' + esc(cl.ceat_trt3 == null ? '' : cl.ceat_trt3) + '">') +
        campoValor('AGE/MG', 'age_mg', cl.age_mg) + campoValor('AGE/MG negociada', 'age_mg_negociada', cl.age_mg_negociada)) +
      aba('obs',
        campo('Observação interna', '<textarea name="obs" maxlength="4000">' + esc(cl.obs || '') + '</textarea>', 'inteiro') +
        (cl.historico_cadastral ? campo('Histórico cadastral', '<textarea name="historico_cadastral" maxlength="4000">' + esc(cl.historico_cadastral) + '</textarea>', 'inteiro') : '')) +
      '</form>',
    rodape:
      (!novo && E.perfil.papel === 'admin' ? '<button class="btn btn-x" id="btn-excluir-cli" type="button">Excluir</button>' : (novo ? '<label class="cli-chk"><input type="checkbox" id="cli-depois-ctr"> Depois de salvar, criar o contrato</label>' : '<span></span>')) +
      '<div class="acoes">' + (!novo ? '<button class="btn btn-o" type="button" id="btn-ctr-cli">+ Contrato</button>' : '') +
      '<button class="btn btn-o" type="button" data-cancelar>Cancelar</button>' +
      '<button class="btn btn-p" id="btn-salvar-cli" type="button">Salvar</button></div>'
  });
  const f = j.querySelector('#f-cli');
  const irAba = (k) => { j.querySelectorAll('[data-cli-aba]').forEach((b) => b.classList.toggle('ativo', b.dataset.cliAba === k)); j.querySelectorAll('.cli-aba').forEach((d) => { d.hidden = d.dataset.aba !== k; }); };
  j.querySelector('#cli-abas').onclick = (ev) => { const b = ev.target.closest('[data-cli-aba]'); if (b) irAba(b.dataset.cliAba); };
  f.grupo_novo.onchange = () => { f.grupo.hidden = !f.grupo_novo.checked; f.grupo_sel.disabled = f.grupo_novo.checked; if (f.grupo_novo.checked) f.grupo.focus(); };
  j.querySelector('#cli-mais-email').onclick = () => { j.querySelector('#cli-emails').insertAdjacentHTML('beforeend', linhaEmail('', false)); j.querySelector('#cli-emails').lastElementChild.querySelector('input').focus(); };
  j.querySelector('#cli-mais-tel').onclick = () => { j.querySelector('#cli-tels').insertAdjacentHTML('beforeend', linhaTel('', false)); j.querySelector('#cli-tels').lastElementChild.querySelector('input').focus(); };
  f.addEventListener('click', (ev) => { const b = ev.target.closest('[data-tirar]'); if (b) b.closest('.cli-lin').remove(); });
  // Backup 26: avisa na hora se o CPF/CNPJ já está cadastrado
  let repetidos = [], ultimoCnpj = '';
  const conferirDoc = async () => {
    const d = soDigitos(f.cpf_cnpj.value), el = j.querySelector('#cli-doc-aviso'); repetidos = [];
    if (d.length < 11) { el.innerHTML = ''; return; }
    repetidos = await q(sb.rpc('clientes_mesmo_documento', { p_doc: d, p_ignorar: cl.id || null })).catch(() => []);
    el.innerHTML = repetidos.length ? '<span class="pill vencido">já cadastrado</span> ' + repetidos.map((x) => esc(x.nome) + (x.grupo ? ' (' + esc(x.grupo) + ')' : '')).join(', ') : '';
  };
  // Backup 29: a busca é pelo botão "🔎 Buscar dados" (não sai sozinha ao digitar) e SOBRESCREVE o que veio do CNPJ anterior
  const TIPO_SOC = (nat, mei) => mei ? 'MEI' : /limitada/i.test(nat) ? (/unipessoal/i.test(nat) ? 'SLU' : 'LTDA') : /an[oô]nima/i.test(nat) ? 'S.A' : /empres[aá]rio/i.test(nat) ? 'EI' : '';
  const consultarNaHora = async (d) => {
    const card = j.querySelector('#cli-cnpj-card'); ultimoCnpj = d;
    card.innerHTML = '<div class="cli-cnpj carregando">🔎 Consultando o CNPJ na Receita…</div>';
    try {
      const r = await chamarFuncao('erp-cnpj', { acao: 'previa', cnpj: d });
      if (ultimoCnpj !== d || !card.isConnected) return;
      if (!r || !r.ok || !r.dados) { card.innerHTML = '<div class="cli-cnpj">' + esc((r && r.erro) || 'Não foi possível consultar agora.') + '</div>'; return; }
      const x = r.dados, adm = (x.socios || []).find((s2) => /administrador/i.test(s2.qualificacao)) || (x.socios || [])[0];
      const poe = (n, v) => { if (f[n]) f[n].value = v || ''; };
      poe('nome', x.razao_social || f.nome.value); poe('endereco', x.endereco); poe('cidade', x.cidade); poe('estado', x.estado); poe('cep', x.cep);
      poe('socio_admin', adm ? adm.nome : '');
      if (x.situacao_cadastral) f.situacao_cadastral.value = x.situacao_cadastral;
      const ts = TIPO_SOC(x.natureza_juridica || '', x.mei); if (ts && [...f.tipo_societario.options].some((o) => o.value === ts)) f.tipo_societario.value = ts;
      if (x.simples === true) f.regime_tributario.value = 'SN';
      if (x.email && !f.email.value.trim()) f.email.value = x.email;
      if (x.telefone && !f.telefone.value.trim()) { f.telefone.value = x.telefone; aplicarMascara(f.telefone, true); }
      card.innerHTML = '<div class="cli-cnpj ok"><b>✓ ' + esc(x.razao_social || '') + '</b>' + (x.nome_fantasia ? ' <span class="sub">(' + esc(x.nome_fantasia) + ')</span>' : '') +
        ' <span class="pill ' + (x.situacao_cadastral === 'ATIVA' ? 'pago' : 'vencido') + '">' + esc(x.situacao_cadastral || '—') + '</span>' +
        '<div class="sub">' + esc([x.natureza_juridica, x.cnae_principal, x.porte, x.simples === true ? 'Simples Nacional' : '', x.cidade && x.estado ? x.cidade + '/' + x.estado : ''].filter(Boolean).join(' · ')) + '</div>' +
        ((x.socios || []).length ? '<div class="sub">Sócios: ' + esc(x.socios.map((s2) => s2.nome + (s2.qualificacao ? ' (' + s2.qualificacao + ')' : '')).join(', ')) + '</div>' : '') +
        '<div class="sub">Preenchido com a Receita: nome, endereço, situação, sócio-administrador, tipo societário' + (x.simples === true ? ', regime' : '') + (x.email ? ', e-mail' : '') + (x.telefone ? ', telefone' : '') + '. Confira nas abas.</div></div>';
    } catch (e) { if (card.isConnected) card.innerHTML = '<div class="cli-cnpj">Consulta do CNPJ indisponível agora (' + esc(e.message) + '). Confira se a função erp-cnpj está publicada; ao salvar, a rotina tenta de novo.</div>'; }
  };
  f.cpf_cnpj.oninput = () => {
    const d = soDigitos(f.cpf_cnpj.value).slice(0, 14);
    f.cpf_cnpj.value = d.length > 11 ? d.replace(/^(\d{2})(\d{3})?(\d{3})?(\d{4})?(\d{0,2})?$/, (m, a, b, c, e, g) => a + (b ? '.' + b : '') + (c ? '.' + c : '') + (e ? '/' + e : '') + (g ? '-' + g : ''))
      : d.replace(/^(\d{3})(\d{3})?(\d{3})?(\d{0,2})?$/, (m, a, b, c, e) => a + (b ? '.' + b : '') + (c ? '.' + c : '') + (e ? '-' + e : ''));
    if (d.length === 14 || d.length === 11) conferirDoc();
    // CNPJ trocado: some o resultado da busca anterior (o sócio e o resto só voltam ao buscar de novo)
    if (ultimoCnpj && d !== ultimoCnpj) { j.querySelector('#cli-cnpj-card').innerHTML = '<div class="cli-cnpj">CNPJ alterado — clique em <b>🔎 Buscar dados</b> para trocar as informações.</div>'; }
  };
  j.querySelector('#cli-buscar').onclick = () => { const d = soDigitos(f.cpf_cnpj.value); if (d.length !== 14) return aviso('Digite o CNPJ completo (14 números) para buscar.', true); ultimoCnpj = ''; consultarNaHora(d); };
  f.cpf_cnpj.onblur = () => { f.cpf_cnpj.value = mascaraDoc(f.cpf_cnpj.value); conferirDoc(); };
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  const apos = async () => { await carregarCadastros(true); if (depois) depois(); else await recarregar(); };
  const bc = j.querySelector('#btn-ctr-cli');
  if (bc) bc.onclick = () => { fecharJanela(j); formContrato({ cliente_id: cl.id }); };

  j.querySelector('#btn-salvar-cli').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.nome.value.trim()) { irAba('id'); throw new Error('Preencha o nome.'); }
    if (f.grupo_novo.checked && !f.grupo.value.trim()) { irAba('class'); throw new Error('Escreva o nome do grupo novo (ou desmarque "É um grupo novo").'); }
    if (soDigitos(f.cpf_cnpj.value) !== soDigitos(cl.cpf_cnpj || '')) await conferirDoc();
    if (repetidos.length && !confirm('Já existe cliente com este CPF/CNPJ: ' + repetidos.map((x) => x.nome).join(', ') + '.\n\nCadastrar mesmo assim?')) return;
    const num = (n) => { const t = f[n].value.trim(); if (!t) return null; const v = lerValor(t); if (isNaN(v)) throw new Error('Valor inválido em ' + n.toUpperCase().replace(/_/g, ' ') + '.'); return v; };
    const grupo_id = f.grupo_novo.checked ? await grupoPorNome(f.grupo.value) : (f.grupo_sel.value || null);
    const dados = {
      nome: f.nome.value.trim(), cpf_cnpj: soDigitos(f.cpf_cnpj.value), grupo_id, tipo: f.tipo.value, area: f.area.value,
      responsavel: f.responsavel.value.trim(), socio_admin: f.socio_admin.value.trim(), tipo_societario: f.tipo_societario.value,
      em_operacao: lerSimNao(f.em_operacao.value), procuracao: lerSimNao(f.procuracao.value),
      certificado: lerSimNao(f.certificado.value), cadastro_regular: lerSimNao(f.cadastro_regular.value),
      capag: f.capag.value, regime_tributario: f.regime_tributario.value, situacao_cadastral: f.situacao_cadastral.value,
      rfb: num('rfb'), rfb_negociada: num('rfb_negociada'), pgfn: num('pgfn'), pgfn_negociada: num('pgfn_negociada'),
      age_mg: num('age_mg'), age_mg_negociada: num('age_mg_negociada'), sefaz_mg: num('sefaz_mg'),
      ceat_trt3: f.ceat_trt3.value === '' ? null : Number(f.ceat_trt3.value),
      email: f.email.value.trim(), telefone: f.telefone.value.trim(), endereco: f.endereco.value.trim(), perfil_email: f.perfil_email.value, cep: soDigitos(f.cep.value),
      cidade: f.cidade.value.trim(), estado: f.estado.value.trim().toUpperCase(), origem: f.origem.value.trim(), indicado_por: f.indicado_por.value.trim(),
      obs: f.obs.value.trim()
    };
    if (f.historico_cadastral) dados.historico_cadastral = f.historico_cadastral.value.trim();
    let id = cl.id;
    if (novo) id = (await q(sb.from('clientes').insert(dados).select('id').single())).id;
    else await q(sb.from('clientes').update(dados).eq('id', cl.id));
    // e-mails e telefones a mais → contatos do cliente, no setor escolhido
    const extras = [...j.querySelectorAll('[data-extra]')].filter((i) => i.value.trim()).map((i) => {
      const setor = i.closest('.cli-lin').querySelector('[data-setor]').value, rot = (SETORES_CONTATO.find((x) => x[0] === setor) || ['', ''])[1];
      return i.dataset.extra === 'email' ? { cliente_id: id, nome: rot, finalidade: setor, email: i.value.trim() } : { cliente_id: id, nome: rot, finalidade: setor, telefone: i.value.trim(), whatsapp: soDigitos(i.value).length === 11 };
    });
    if (extras.length) await q(sb.from('contatos').insert(extras).select('id')).catch((e) => aviso('Cadastro salvo, mas os contatos a mais não: ' + erroAmigavel(e), true));
    aviso(novo ? '✓ Cliente cadastrado.' + (extras.length ? ' ' + plural(extras.length, 'contato a mais', 'contatos a mais') + ' na ficha.' : '') : '✓ Cadastro atualizado.');
    const depoisCtr = novo && j.querySelector('#cli-depois-ctr') && j.querySelector('#cli-depois-ctr').checked;
    fecharJanela(j);
    await apos();
    // automação: empresa nova (ou CNPJ trocado) → consulta a Receita na hora e preenche razão social, endereço, situação…
    if (dados.cpf_cnpj.length === 14 && (novo || soDigitos(cl.cpf_cnpj) !== dados.cpf_cnpj)) consultarCnpjNovo(id, dados.nome);
    if (depoisCtr) formContrato({ cliente_id: id });
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
    '<div class="filtros"><div class="segmento" id="ctr-status">' + [['Ativo', 'Ativos'], ['Aguardando assinatura', 'Aguardando assinatura'], ['Encerrado', 'Encerrados'], ['Cancelado', 'Cancelados'], ['todos', 'Todos']]
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
    let c = sb.from('contratos').select('*, clientes(nome, grupos(nome)), lancamentos(valor, pago, vencimento), documentos(id), exitos(id)').order('data_contrato', { ascending: false });
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
    '<div class="tabela-wrap"><table class="ordenavel ctr-tab"><thead><tr><th>Cliente</th><th>Contrato</th><th>Tipo</th><th data-tipo="data">Data</th><th class="num">Valor</th><th class="num">Recebido</th><th>Financeiro</th><th>Situação</th></tr></thead><tbody>' +
    lista.map((c) => {
      const parc = c.lancamentos || [];
      const recebido = soma(parc.filter((p) => p.pago), (p) => p.valor);
      const atraso = parc.some((p) => !p.pago && p.vencimento < h);
      return '<tr class="clicavel" data-ctr="' + c.id + '"><td>' + esc(c.clientes ? c.clientes.nome : '—') +
        (c.clientes && c.clientes.grupos ? '<div class="sub">' + esc(c.clientes.grupos.nome) + '</div>' : '') + '</td>' +
        '<td>' + esc(c.descricao) + (c.percentual_exito ? '<div class="sub">+ ' + esc(String(c.percentual_exito).replace('.', ',')) + '% de êxito ' + ((c.exitos || []).length ? '<span class="pill pago">🏆 ' + c.exitos.length + ' registrado(s)</span>' : '<span class="pill neutro">aguardando o êxito</span>') + '</div>' : '') + '</td>' +
        '<td><span class="pill ' + (c.modalidade === 'consultoria' ? 'aberto' : 'neutro') + '">' + (c.modalidade === 'consultoria' ? 'Consultoria' : 'Pontual') + '</span></td>' +
        '<td class="mono" data-ord="' + c.data_contrato + '">' + dataBR(c.data_contrato) + (c.rescindido_em ? '<div class="sub">rescindido ' + dataBR(c.rescindido_em) + '</div>' : '') + '</td>' +
        '<td class="num mono" data-ord="' + (c.modalidade === 'consultoria' ? (c.valor_mensal || 0) : c.valor_total) + '">' + valorContratoTexto(c) + '</td>' +
        '<td class="num mono valor-rec" data-ord="' + recebido + '">' + brl(recebido) + '</td>' +
        // Backup 39: sem as colunas Parcelas e Anexo (ficam no detalhe); Financeiro antes de Situação
        '<td>' + (atraso ? '<span class="pill vencido">Parcela em atraso</span>' : parc.length ? '<span class="pill pago">Em dia</span>' : '<span class="pill neutro">—</span>') + '</td>' +
        '<td>' + pillSituacaoCtr(c) + '</td></tr>';
    }).join('') + '</tbody></table></div>'
    : vazio('Nenhum contrato' + (F.status !== 'todos' ? ' com essa situação' : '') + ' — cadastre um contrato e o sistema gera os lançamentos.', '+ Novo contrato', '[data-novo=contrato]')) + '</div>';
  $('ctr-corpo').querySelectorAll('[data-ctr]').forEach((tr) => tr.onclick = () => detalheContrato(tr.dataset.ctr));
}

// Backup 28: situação do contrato (sem misturar com o financeiro, que tem coluna própria)
const SITUACOES_CTR = ['Ativo', 'Aguardando assinatura', 'Encerrado', 'Cancelado'];
function situacaoCtr(c) { return c.rescindido_em && c.status === 'Ativo' ? 'Rescindido' : c.status; }
function pillSituacaoCtr(c) {
  const s = situacaoCtr(c);
  return '<span class="pill ' + ({ Ativo: 'aberto', 'Aguardando assinatura': 'hoje', Cancelado: 'vencido', Rescindido: 'neutro' }[s] || 'neutro') + '">' + esc(s) + '</span>';
}
// Êxito: base de cálculo (o "X" que a pessoa informa quando o êxito acontece)
const EXITO_BASES = [['economia', 'Economia obtida (redução da dívida)'], ['valor_recebido', 'Valor recebido pelo cliente'],
  ['valor_causa', 'Valor da causa / condenação'], ['outro', 'Outro valor (descrever)']];
const exitoBaseRot = (b) => (EXITO_BASES.find((x) => x[0] === b) || EXITO_BASES[3])[1];
// Backup 22: "1,5 salários/mês" (mais curto; a forma "em salários mínimos" já aparece no contrato)
const SM_ROT = (c) => String(c.qtd_salarios).replace('.', ',') + (Number(c.qtd_salarios) === 1 ? ' salário' : ' salários');
function valorContratoTexto(c) {
  if (c.modalidade !== 'consultoria') return brl(c.valor_total);
  return (c.forma_valor === 'salario_minimo' ? SM_ROT(c) : brl(c.valor_mensal)) + '/mês';
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
      campo('Cliente <span class="obrig">*</span>', '<div class="ctr-cli"><select name="cliente_id" required>' + opcoesClientes(ct.cliente_id).replace('— sem cliente —', 'Escolha o cliente') + '</select>' +
        '<button type="button" class="btn btn-o btn-mini" id="ctr-novo-cli" title="Cadastrar o cliente sem sair do contrato">+ Novo cliente</button></div>', 'inteiro') +
      '<div class="inteiro"><div class="segmento seg-grande" id="ctr-mod">' + [['consultoria', 'Consultoria (mensal, recorrente)'], ['pontual', 'Serviço pontual (valor fechado)']]
        .map(([v, r]) => '<button type="button" data-v="' + v + '"' + (mod === v ? ' class="ativo"' : '') + (novo ? '' : ' disabled') + '>' + r + '</button>').join('') + '</div></div>' +
      campo('Descrição do serviço <span class="obrig">*</span>', '<input name="descricao" required maxlength="200" placeholder="Ex.: Consultoria tributária mensal" value="' + esc(ct.descricao || '') + '">', 'inteiro') +
      campo('Área do serviço', selectServico(ct.servico || '')) +
      campo('Data em que fechou', '<input name="data_contrato" type="date" value="' + esc(ct.data_contrato || hojeISO()) + '">') +
      campo('Início da vigência', '<input name="inicio_vigencia" type="date" value="' + esc(ct.inicio_vigencia || ct.inicio_competencia || somarDias(iso(fimDoMes(new Date())), 1)) + '">') +
      campo('Quem fechou', selectPessoa('fechado_por', ct.fechado_por || (novo && E.perfil ? E.perfil.nome : ''), '— escolha —')) +
      campo('% de êxito (se houver)', '<input name="percentual_exito" inputmode="decimal" placeholder="Ex.: 20" value="' + (ct.percentual_exito != null ? esc(String(ct.percentual_exito).replace('.', ',')) : '') + '">') +
      // êxito: sobre o quê e como foi combinado; só vira dinheiro quando acontecer (botão "Registrar êxito" no detalhe)
      '<div class="grade inteiro" id="ctr-exito">' +
      campo('O êxito é calculado sobre', '<select name="exito_base">' + EXITO_BASES.map(([v, r]) => '<option value="' + v + '"' + ((ct.exito_base || 'economia') === v ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>') +
      campo('Como foi combinado', '<input name="exito_regra" maxlength="300" placeholder="Ex.: 20% da redução da dívida na PGFN, pago em até 10 dias" value="' + esc(ct.exito_regra || '') + '">') +
      '<div class="dica inteiro">O êxito <b>não entra no financeiro agora</b>. Quando acontecer, abra o contrato e clique em <b>🏆 Registrar êxito</b>: você informa o valor (ex.: quanto a dívida reduziu) e o sistema lança o % em Honorários Jurídico.</div></div>' +
      // consultoria
      '<div class="grade inteiro" id="ctr-rec">' +
      '<div class="inteiro"><div class="segmento" id="ctr-forma">' + [['fixo', 'Valor fixo'], ['salario_minimo', 'Em salários mínimos']]
        .map(([v, r]) => '<button type="button" data-v="' + v + '"' + (forma === v ? ' class="ativo"' : '') + '>' + r + '</button>').join('') + '</div></div>' +
      campo('<span id="rot-valor-mensal">Valor mensal (R$)</span>', '<input name="valor_mensal" inputmode="decimal" placeholder="4.000,00" value="' + (ct.valor_mensal ? valorParaCampo(ct.valor_mensal) : '') + '">') +
      campo('Quantos salários mínimos', '<input name="qtd_salarios" inputmode="decimal" placeholder="1" value="' + (ct.qtd_salarios != null ? esc(String(ct.qtd_salarios).replace('.', ',')) : '') + '">') +
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
      (novo ? '<div class="inteiro"><div class="segmento" id="ctr-assin">' + [['Ativo', '✓ Já está assinado (lança o financeiro agora)'], ['Aguardando assinatura', '⏳ Aguardando assinatura (lança só quando assinar)']]
          .map(([v, r], i) => '<button type="button" data-v="' + v + '"' + (i === 0 ? ' class="ativo"' : '') + '>' + r + '</button>').join('') + '</div></div>'
        : campo('Situação', '<select name="status">' + SITUACOES_CTR
          .map((st) => '<option value="' + st + '"' + (ct.status === st ? ' selected' : '') + '>' + (st === 'Ativo' && ct.status === 'Aguardando assinatura' ? 'Ativo (assinado: lança o financeiro)' : st) + '</option>').join('') + '</select>')) +
      campo('Observação', '<textarea name="obs" maxlength="2000">' + esc(ct.obs || '') + '</textarea>', 'inteiro') +
      '<div class="dica inteiro">Depois de salvar, anexe o contrato assinado no detalhe do contrato (Documentos do contrato).</div>' +
      '</form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button>' +
      '<button class="btn btn-p" id="btn-salvar-ctr" type="button">' + (novo ? 'Criar contrato' : 'Salvar') + '</button></div>'
  });
  const f = j.querySelector('#f-ctr');
  // cliente ainda não cadastrado: cadastra aqui mesmo e já volta escolhido no contrato
  j.querySelector('#ctr-novo-cli').onclick = () => {
    const antes = new Set(E.clientes.map((c) => c.id));
    formCliente(undefined, async () => {
      await carregarCadastros(true);
      const novoCli = E.clientes.find((c) => !antes.has(c.id));
      const sel = j.querySelector('[name=cliente_id]');
      sel.innerHTML = opcoesClientes(novoCli ? novoCli.id : sel.value).replace('— sem cliente —', 'Escolha o cliente');
      if (novoCli) { sel.value = novoCli.id; sel.dispatchEvent(new Event('change')); aviso('✓ Cliente cadastrado e escolhido no contrato.'); }
    });
  };
  let modalidade = mod, formaValor = forma, sm = [], situacao = 'Ativo';
  const segAssin = j.querySelector('#ctr-assin');
  if (segAssin) segAssin.onclick = (ev) => { const b = ev.target.closest('button'); if (!b) return; situacao = b.dataset.v; segAssin.querySelectorAll('button').forEach((x) => x.classList.toggle('ativo', x === b)); };
  q(sb.from('salarios_minimos').select('*').order('ano', { ascending: false })).then((x) => { sm = x; previaRec(); }).catch(() => {});
  const previaRec = () => {
    const el = j.querySelector('#ctr-previa-rec'); if (!el) return;
    const ini = f.inicio_vigencia.value || hojeISO(), ano = Number(ini.slice(0, 4)), s0 = sm.find((x) => x.ano <= ano);
    const dia = Math.min(28, Math.max(1, Number(f.dia_vencimento.value) || 10)), mesSeg = somarMeses(ini.slice(0, 7) + '-01', 1).slice(0, 8) + String(dia).padStart(2, '0');
    const v = formaValor === 'salario_minimo' ? (lerValor(f.qtd_salarios.value) || 0) * (s0 ? Number(s0.valor) : 0) : lerValor(f.valor_mensal.value) || 0;
    el.innerHTML = 'Vigência a partir de <b>' + dataBR(ini) + '</b> · <b>1º pagamento em ' + dataBR(mesSeg) + '</b> (competência ' + ini.slice(5, 7) + '/' + ini.slice(0, 4) + '). ' +
      'Todo mês entra um lançamento em Honorários Jurídico (competência do mês, vencimento dia <b>' + dia + '</b> do mês seguinte) de <b class="mono">' + brl(v) + '</b>' +
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
  const mostrarExito = () => j.querySelector('#ctr-exito').classList.toggle('escondido', !(lerValor(f.percentual_exito.value) > 0));
  f.percentual_exito.addEventListener('input', mostrarExito); mostrarExito();
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
    const dados = { cliente_id: f.cliente_id.value, descricao: f.descricao.value.trim(), servico: f.servico.value, modalidade,
      data_contrato: f.data_contrato.value || hojeISO(), percentual_exito: exito, obs: f.obs.value.trim(),
      exito_base: exito ? f.exito_base.value : null, exito_regra: exito ? f.exito_regra.value.trim() : '', responsavel: ct.responsavel || (cli && cli.responsavel) || '',
      inicio_vigencia: f.inicio_vigencia.value || f.data_contrato.value || hojeISO(), fechado_por: f.fechado_por.value };
    if (modalidade === 'consultoria') {
      const vm = formaValor === 'fixo' ? lerValor(f.valor_mensal.value) : null, qs = formaValor === 'salario_minimo' ? lerValor(f.qtd_salarios.value) : null;
      if (formaValor === 'fixo' && !(vm > 0)) throw new Error('Informe o valor mensal (ex.: 4.000,00).');
      if (formaValor === 'salario_minimo' && !(qs > 0)) throw new Error('Informe quantos salários mínimos (ex.: 1 ou 0,7).');
      const dia = Number(f.dia_vencimento.value) || 10;
      if (dia < 1 || dia > 28) throw new Error('Dia do vencimento entre 1 e 28.');
      if (!f.inicio_vigencia.value) throw new Error('Informe o início da vigência.');
      Object.assign(dados, { forma_valor: formaValor, valor_mensal: vm, qtd_salarios: qs, dia_vencimento: dia, inicio_competencia: f.inicio_vigencia.value.slice(0, 7) + '-01', valor_total: 0, num_parcelas: 1 });
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
      dados.status = situacao;
      const criado = await q(sb.from('contratos').insert(dados).select().single());
      if (modalidade === 'pontual' && dados.valor_total > 0 && cli) await q(sb.from('lancamentos').update({ grupo_id: cli.grupo_id, responsavel: cli.responsavel || '' }).eq('contrato_id', criado.id));
      if (situacao === 'Aguardando assinatura') aviso('✓ Contrato criado aguardando assinatura: o financeiro é lançado quando você marcar "✓ Assinado".');
      else aviso(modalidade === 'consultoria' ? '✓ Contrato de consultoria criado: mensalidades lançadas em Honorários Jurídico.' :
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

// abre o contrato; se algo falhar, diz o porquê (antes o clique não fazia nada)
async function detalheContrato(id) {
  try { await _detalheContrato(id); }
  catch (e) {
    console.error('[contrato]', e);
    aviso('Não foi possível abrir o contrato: ' + erroAmigavel(e) + '. Se continuar, confira se o SQL mais recente foi rodado no Supabase.', true);
  }
}
async function _detalheContrato(id) {
  const ct = (await q(sb.from('contratos').select('*, clientes(nome, grupo_id, responsavel)').eq('id', id)))[0];
  if (ct && !ct.fechado_por && ct.criado_por) ct.fechado_por = ((await q(sb.from('perfis').select('nome, email').eq('id', ct.criado_por)).catch(() => []))[0] || {}).nome || '';
  if (!ct) throw new Error('contrato não encontrado ou de um cliente que você não vê (área)');
  const [parc, exitos, aditivos] = await Promise.all([q(sb.from('lancamentos').select('*').eq('contrato_id', id).order('vencimento')),
    ct.percentual_exito ? q(sb.from('exitos').select('*').eq('contrato_id', id).order('data')).catch(() => []) : [],
    q(sb.from('contratos_aditivos').select('*').eq('contrato_id', id).order('numero')).catch(() => [])]);
  const recebido = soma(parc.filter((p) => p.pago), (p) => p.valor);
  const total = soma(parc, (p) => p.valor);
  const h = hojeISO(), atrasadas = parc.filter((p) => !p.pago && p.vencimento < h), prox = parc.find((p) => !p.pago && p.vencimento >= h);
  // Backup 17: ficha do contrato — resumo em linha (tipo, área, vigência, reajuste, próximo vencimento) + aditivos
  const reajuste = ct.modalidade !== 'consultoria' ? 'Sem reajuste (serviço pontual)'
    : ct.forma_valor === 'salario_minimo' ? 'Automático pelo salário mínimo (todo ano)' : 'Sem reajuste · mudança de valor só por aditivo';
  const ficha = [['Tipo', ct.modalidade === 'consultoria' ? 'Consultoria (mensal)' : 'Serviço pontual'], ['Área do serviço', ct.servico || '—'],
    ['Fechado em', dataBR(ct.data_contrato)], ['Quem fechou', ct.fechado_por || '—'], ['Quem cuida do cliente', (ct.clientes && ct.clientes.responsavel) || ct.responsavel || '—'],
    ['Vigência', dataBR(ct.inicio_vigencia || ct.inicio_competencia || ct.data_contrato) + ' → ' + (ct.rescindido_em ? 'rescindido em ' + dataBR(ct.rescindido_em) : ct.modalidade === 'consultoria' ? 'até a rescisão' : 'fim das parcelas')],
    ['Reajuste', reajuste], ['Próximo vencimento', prox ? dataBR(prox.vencimento) + ' · ' + brl(prox.valor) : '—'],
    ['Situação', pillSituacaoCtr(ct)],
    ['Financeiro', atrasadas.length ? '<span class="pill vencido">' + plural(atrasadas.length, 'parcela em atraso', 'parcelas em atraso') + ' · ' + brl(soma(atrasadas, (p) => p.valor)) + '</span>' : '<span class="pill pago">em dia</span>']];
  const pctRec = total > 0 ? Math.round(recebido / total * 100) : 0;
  const j = abrirJanela({
    titulo: '📄 Ficha do contrato — ' + ct.descricao, larga: true,
    corpo:
      (ct.status === 'Aguardando assinatura' ? '<div class="faixa-aprov tem" id="ctr-assinatura"><span class="faixa-ic" aria-hidden="true">⏳</span><div><b>Aguardando a assinatura do cliente</b>' +
        '<div class="sub">O financeiro, o onboarding e o aviso à equipe acontecem quando você marcar como assinado. Anexe o PDF assinado em "Documentos do contrato", abaixo.</div></div>' +
        '<div class="acoes"><button class="btn btn-o" type="button" id="ctr-gerar">📄 Gerar contrato</button><button class="btn btn-p" type="button" id="ctr-assinar">✓ Marcar como assinado</button></div></div>' : '') +
      '<div class="ctr-ficha">' + ficha.map(([r, v]) => '<div><span>' + r + '</span><b>' + (/^</.test(v) ? v : esc(v)) + '</b></div>').join('') + '</div>' +
      (ct.modalidade === 'consultoria' ? '' : '<div class="ctr-barra" title="Recebido × previsto"><div style="width:' + pctRec + '%"></div></div><div class="sub" style="margin:-4px 0 12px">' + pctRec + '% do previsto já recebido</div>') +
      '<div class="kpis" style="margin-bottom:12px">' +
      kpi('Cliente', '<span style="font-family:var(--font-d);font-size:16px">' + esc(ct.clientes ? ct.clientes.nome : '—') + '</span>', '', 'Contrato de ' + dataBR(ct.data_contrato)) +
      (ct.modalidade === 'consultoria' ? kpi('Consultoria mensal', valorContratoTexto(ct), '', ct.rescindido_em ? 'rescindido em ' + dataBR(ct.rescindido_em) : 'vence dia ' + ct.dia_vencimento + ' do mês seguinte · até a rescisão') : '') +
      kpi('Recebido', brl(recebido), 'verde', parc.filter((p) => p.pago).length + ' de ' + parc.length + ' parcela(s)') +
      kpi('Falta receber', brl(total - recebido), 'ambar', ct.percentual_exito ? '+ ' + String(ct.percentual_exito).replace('.', ',') + '% de êxito' : ct.status) +
      '</div>' +
      (ct.obs ? '<div class="dica" style="margin-bottom:12px">' + esc(ct.obs) + '</div>' : '') +
      '<div class="card" style="margin:0">' + tabelaLancamentos(parc, { compacta: true }) + '</div>' +
      '<div style="margin-top:10px"><button class="btn btn-o btn-mini" id="ctr-add-parc">+ Lançar valor avulso neste contrato</button></div>' +
      (ct.percentual_exito ? blocoExito(ct, exitos) : '') +
      '<div class="card" style="margin:14px 0 0"><div class="card-bd" id="ctr-docs"></div></div>' + blocoAditivos(ct, aditivos),
    rodape:
      (E.perfil.papel === 'admin' ? '<button class="btn btn-x" id="btn-excluir-ctr" type="button">Excluir contrato</button>' : '<span></span>') +
      '<div class="acoes">' + (ct.modalidade === 'consultoria' && !ct.rescindido_em ? '<button class="btn btn-x" id="btn-rescindir-ctr" type="button">Rescindir</button>' : '') +
      '<button class="btn btn-o" id="btn-editar-ctr" type="button">Editar contrato</button></div>'
  });
  const reabrir = async () => { fecharJanela(j); await detalheContrato(id); };
  ligarAcoesLancamentos(j, reabrir);
  const btAssinar = j.querySelector('#ctr-assinar');
  if (btAssinar) btAssinar.onclick = () => comBotao(btAssinar, async () => {
    if (!confirm('Marcar o contrato como assinado? O sistema lança o financeiro, cria o onboarding e avisa a equipe.')) return;
    const r = await q(sb.rpc('contrato_assinar', { p_contrato: id, p_data: null }));
    aviso('✓ Contrato assinado: ' + plural((r && r.lancamentos) || 0, 'lançamento', 'lançamentos') + ' no financeiro.'); await reabrir();
  });
  const btGerar = j.querySelector('#ctr-gerar');
  if (btGerar) btGerar.onclick = (ev) => abrirGeradorContrato(ct.cliente_id, id, ev);
  blocoDocumentos(j.querySelector('#ctr-docs'), { contrato_id: id, cliente_id: ct.cliente_id, grupo_id: ct.clientes && ct.clientes.grupo_id, tipo: 'contrato' },
    { titulo: 'Documentos do contrato', vazio: 'Nenhum documento. Envie aqui o contrato assinado, a proposta e os aditivos.' }).catch((e) => console.error(e));
  j.querySelector('#btn-editar-ctr').onclick = () => formContrato(ct);
  const br = j.querySelector('#btn-rescindir-ctr'); if (br) br.onclick = () => formRescisao(ct, reabrir);
  const be = j.querySelector('#ctr-exito-reg'); if (be) be.onclick = () => formExito(ct, reabrir);
  const ba = j.querySelector('#ctr-aditivo'); if (ba) ba.onclick = () => formAditivo(ct, reabrir);
  j.querySelector('#ctr-add-parc').onclick = () => {
    formLancamento({ tipo: 'receita', empresa: 'escritorio', cliente_id: ct.cliente_id, contrato_id: id,
                     grupo_id: ct.clientes && ct.clientes.grupo_id, responsavel: ct.clientes && ct.clientes.responsavel,
                     descricao: ct.descricao + ' — avulso' }, reabrir);
  };
  const bx = j.querySelector('#btn-excluir-ctr');
  if (bx) bx.onclick = () => comBotao(bx, async () => {
    if (!confirm('Excluir o contrato e TODAS as parcelas dele? Esta ação não pode ser desfeita.')) return;
    await excluir('contratos', id);
    aviso('Contrato excluído.'); fecharJanela(j); await recarregar();
  });
}

// ─────────── aditivos: o que mudou no contrato, com a data e o efeito no financeiro ───────────
const TIPOS_ADITIVO = [['valor', 'Valor'], ['escopo', 'Escopo (o que está incluído)'], ['prazo', 'Prazo / vigência'], ['outro', 'Outro']];
function blocoAditivos(ct, ads) {
  const efeito = (a) => a.tipo !== 'valor' ? '—' : a.valor_adicional ? '+ ' + brl(a.valor_adicional) + (a.parcelas > 1 ? ' em ' + a.parcelas + ' parcelas' : '')
    : (a.forma_nova === 'salario_minimo' ? String(a.qtd_salarios_novo).replace('.', ',') + ' SM' : brl(a.valor_mensal_novo)) + '/mês a partir de ' + dataBR(a.a_partir).slice(3) +
      '<div class="sub">antes: ' + (a.forma_anterior === 'salario_minimo' ? String(a.qtd_salarios_anterior || 0).replace('.', ',') + ' SM' : brl(a.valor_mensal_anterior)) + '</div>';
  return '<div class="card" style="margin:14px 0 0"><div class="card-hd">📝 Aditivos <span class="pill ' + (ads.length ? 'aberto' : 'neutro') + '">' + ads.length + '</span>' +
      (pode('contratos', 'editar') ? '<button class="btn btn-o btn-mini" id="ctr-aditivo" style="margin-left:auto">+ Novo aditivo</button>' : '') + '</div>' +
    '<div class="card-bd">' + (ads.length ? '<div class="tabela-wrap"><table><thead><tr><th>Nº</th><th>Data</th><th>Tipo</th><th>O que mudou</th><th>Efeito no financeiro</th></tr></thead><tbody>' +
      ads.map((a) => '<tr><td>' + a.numero + '</td><td class="mono">' + dataBR(a.data) + '</td><td><span class="pill neutro">' + esc((TIPOS_ADITIVO.find((t) => t[0] === a.tipo) || [0, a.tipo])[1]) + '</span></td>' +
        '<td>' + esc(a.descricao) + '</td><td class="mono">' + efeito(a) + '</td></tr>').join('') + '</tbody></table></div>'
      : '<div class="sub">Nenhum aditivo. Use <b>+ Novo aditivo</b> quando mudar valor, escopo ou prazo — o documento assinado vai em "Documentos do contrato".</div>') + '</div></div>';
}
function formAditivo(ct, depois) {
  const cons = ct.modalidade === 'consultoria';
  const j = abrirJanela({ titulo: '📝 Novo aditivo — ' + ct.descricao, larga: true,
    corpo: '<form class="grade" id="f-ad">' +
      campo('Tipo', '<select name="tipo">' + TIPOS_ADITIVO.map(([v, r]) => '<option value="' + v + '">' + r + '</option>').join('') + '</select>') +
      campo('Data do aditivo', '<input name="data" type="date" value="' + hojeISO() + '">') +
      campo('O que o aditivo muda <span class="obrig">*</span>', '<textarea name="descricao" maxlength="1000" placeholder="Ex.: inclui a consultoria trabalhista a partir de novembro"></textarea>', 'inteiro') +
      '<div class="grade inteiro" id="ad-valor">' + (cons
        ? '<div class="inteiro"><div class="segmento" id="ad-forma">' + [['fixo', 'Valor fixo'], ['salario_minimo', 'Em salários mínimos']].map(([v, r]) => '<button type="button" data-v="' + v + '"' + ((ct.forma_valor || 'fixo') === v ? ' class="ativo"' : '') + '>' + r + '</button>').join('') + '</div></div>' +
          campo('Novo valor mensal (R$)', '<input name="valor_mensal" inputmode="decimal" placeholder="' + (ct.valor_mensal ? valorParaCampo(ct.valor_mensal) : '0,00') + '">') +
          campo('Nº de salários mínimos', '<input name="qtd_salarios" inputmode="decimal" placeholder="' + (ct.qtd_salarios ? String(ct.qtd_salarios).replace('.', ',') : '1') + '">') +
          campo('Vale a partir da competência', '<input name="a_partir" type="month" value="' + somarMeses(hojeISO(), 1).slice(0, 7) + '">') +
          '<div class="dica inteiro">As mensalidades <b>antes</b> dessa competência continuam com o valor antigo; as em aberto a partir dela mudam sozinhas. Atual: <b>' + valorContratoTexto(ct) + '</b>.</div>'
        : campo('Valor a mais (R$)', '<input name="valor_adicional" inputmode="decimal" placeholder="0,00">') +
          campo('Nº de parcelas', '<input name="parcelas" type="number" min="1" max="120" value="1">') +
          campo('1º vencimento', '<input name="primeiro_vencimento" type="date" value="' + somarDias(hojeISO(), 30) + '">') +
          '<div class="dica inteiro">O valor a mais entra em Honorários Jurídico, nas parcelas escolhidas, marcado como "aditivo".</div>') + '</div></form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-ad">Registrar aditivo</button></div>' });
  const f = j.querySelector('#f-ad'); let forma = ct.forma_valor || 'fixo';
  const mostrar = () => {
    j.querySelector('#ad-valor').classList.toggle('escondido', f.tipo.value !== 'valor');
    if (cons) { j.querySelectorAll('#ad-forma button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === forma));
      f.valor_mensal.closest('.campo').classList.toggle('escondido', forma !== 'fixo'); f.qtd_salarios.closest('.campo').classList.toggle('escondido', forma !== 'salario_minimo'); }
  };
  f.tipo.onchange = mostrar; if (cons) j.querySelector('#ad-forma').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { forma = b.dataset.v; mostrar(); } };
  mostrar();
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-ad').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const p = { tipo: f.tipo.value, data: f.data.value, descricao: f.descricao.value.trim() };
    if (!p.descricao) throw new Error('Descreva o que o aditivo muda.');
    if (p.tipo === 'valor') {
      if (cons) Object.assign(p, { forma, valor_mensal: forma === 'fixo' ? lerValor(f.valor_mensal.value) : null, qtd_salarios: forma === 'salario_minimo' ? lerValor(f.qtd_salarios.value) : null, a_partir: (f.a_partir.value || hojeISO().slice(0, 7)) + '-01' });
      else Object.assign(p, { valor_adicional: lerValor(f.valor_adicional.value), parcelas: Number(f.parcelas.value) || 1, primeiro_vencimento: f.primeiro_vencimento.value });
    }
    await q(sb.rpc('registrar_aditivo', { p_contrato: ct.id, p }));
    aviso('✓ Aditivo registrado' + (p.tipo === 'valor' ? ' e financeiro ajustado.' : '.')); fecharJanela(j); await recarregar(); if (depois) await depois();
  });
}

// ─────────── êxito: regra combinada + registros (só vira lançamento quando acontece) ───────────
function blocoExito(ct, exitos) {
  const pct = String(ct.percentual_exito).replace('.', ',');
  return '<div class="card exito-card" style="margin:14px 0 0"><div class="card-hd">🏆 Êxito<span class="pill ' + (exitos.length ? 'pago' : 'neutro') + '">' +
      (exitos.length ? exitos.length + ' registrado(s) · ' + brl(soma(exitos, (x) => x.valor)) : 'aguardando o êxito') + '</span>' +
      (pode('contratos', 'editar') ? '<button class="btn btn-p btn-mini" id="ctr-exito-reg" style="margin-left:auto">🏆 Registrar êxito</button>' : '') + '</div>' +
    '<div class="card-bd"><div class="dica"><b>' + pct + '%</b> sobre ' + esc(exitoBaseRot(ct.exito_base).toLowerCase()) + (ct.exito_regra ? ' — ' + esc(ct.exito_regra) : '') +
      '. Só entra no financeiro quando o êxito acontecer.</div>' +
    (exitos.length ? '<div class="tabela-wrap" style="margin-top:10px"><table><thead><tr><th>Data</th><th>O que aconteceu</th><th class="num">Base (X)</th><th class="num">Honorário</th></tr></thead><tbody>' +
      exitos.map((x) => '<tr><td class="mono">' + dataBR(x.data) + '</td><td>' + esc(x.descricao) + '</td><td class="num mono">' + brl(x.base_valor) + '</td><td class="num mono valor-rec">' +
        brl(x.valor) + '<div class="sub">' + String(x.percentual).replace('.', ',') + '% de X</div></td></tr>').join('') + '</tbody></table></div>' : '') + '</div></div>';
}
function formExito(ct, depois) {
  const pct = Number(ct.percentual_exito) || 0;
  const j = abrirJanela({ titulo: 'Registrar êxito — ' + ct.descricao,
    corpo: '<form class="grade" id="f-exito">' +
      '<div class="dica inteiro">Combinado: <b>' + String(pct).replace('.', ',') + '%</b> sobre ' + esc(exitoBaseRot(ct.exito_base).toLowerCase()) + (ct.exito_regra ? ' — ' + esc(ct.exito_regra) : '') + '</div>' +
      campo('X = ' + esc(exitoBaseRot(ct.exito_base)) + ' (R$)', '<input name="base" inputmode="decimal" placeholder="Ex.: 150.000,00" required>', 'inteiro') +
      campo('O que aconteceu', '<input name="descricao" maxlength="200" placeholder="Ex.: Transação na PGFN reduziu a dívida de 500 mil para 350 mil">', 'inteiro') +
      campo('Data do êxito', '<input name="data" type="date" value="' + hojeISO() + '">') +
      campo('Vencimento do honorário', '<input name="vencimento" type="date" value="' + somarDias(hojeISO(), 10) + '">') +
      '<div class="exito-previa inteiro" id="exito-previa"></div></form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-exito">Lançar no financeiro</button></div>' });
  const f = j.querySelector('#f-exito');
  const previa = () => {
    const x = lerValor(f.base.value) || 0, v = Math.round(x * pct) / 100;
    j.querySelector('#exito-previa').innerHTML = '<span>' + String(pct).replace('.', ',') + '% × ' + brl(x) + ' =</span><b class="mono">' + brl(v) + '</b><span class="sub">vai para Honorários Jurídico com vencimento em ' + dataBR(f.vencimento.value) + '</span>';
  };
  f.addEventListener('input', previa); previa();
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-exito').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const x = lerValor(f.base.value);
    if (!(x > 0)) throw new Error('Informe o valor X (ex.: quanto a dívida reduziu).');
    if (!f.data.value || !f.vencimento.value) throw new Error('Informe as datas.');
    await q(sb.rpc('registrar_exito', { p_contrato: ct.id, p_base: x, p_data: f.data.value, p_vencimento: f.vencimento.value, p_descricao: f.descricao.value.trim() }));
    aviso('✓ Êxito registrado: ' + brl(Math.round(x * pct) / 100) + ' lançado em Honorários Jurídico.');
    fecharJanela(j); if (depois) await depois();
  });
}


// ─────────── Editar em tabela (vários clientes de uma vez) ───────────
// Tab/Enter andam entre as células; colar do Excel preenche a partir da célula; o que mudou fica destacado.
// Salvar grava só as linhas alteradas. Quem está em modo rascunho gera uma proposta por linha (Aprovações).
const COLS_MASSA = [['nome', 'Nome', 'texto'], ['rfb', 'RFB', 'valor'], ['rfb_negociada', 'RFB neg.', 'valor'], ['pgfn', 'PGFN', 'valor'], ['pgfn_negociada', 'PGFN neg.', 'valor'],
  ['age_mg', 'AGE/MG', 'valor'], ['age_mg_negociada', 'AGE neg.', 'valor'], ['sefaz_mg', 'SEFAZ/MG', 'valor'], ['ceat_trt3', 'CEAT', 'int'], ['capag', 'CAPAG', 'capag']];
const CAPAGS = ['', 'A', 'B', 'C', 'D', 'Omisso'];
function edicaoEmMassa(lista) {
  if (!lista.length) return aviso('Nenhum cliente na lista: mude o filtro.', true);
  if (lista.length > 300) return aviso('São ' + lista.length + ' clientes: filtre por grupo ou tipo (até 300 por vez).', true);
  const txt = (c, k, t) => c[k] == null || c[k] === '' ? '' : t === 'valor' ? String(Number(c[k]).toFixed(2)).replace('.', ',') : String(c[k]);
  const j = abrirJanela({ titulo: 'Editar em tabela — ' + lista.length + ' cliente(s)', larga: true,
    corpo: '<div class="dica" style="margin-bottom:10px">Clique numa célula e digite. <b>Tab</b> vai para a direita, <b>Enter</b> para baixo. Pode <b>colar do Excel</b> (várias linhas e colunas) a partir da célula escolhida. ' +
      'Valores em reais (ex.: 12500,00). Só as linhas alteradas são gravadas.</div>' +
      '<div class="tabela-wrap massa-wrap"><table class="massa"><thead><tr><th>Grupo</th>' + COLS_MASSA.map(([, r, t]) => '<th' + (t === 'valor' || t === 'int' ? ' class="num"' : '') + '>' + r + '</th>').join('') + '</tr></thead><tbody>' +
      lista.map((c, i) => '<tr data-i="' + i + '"><td class="sub">' + esc(c.grupos ? c.grupos.nome : '') + '</td>' + COLS_MASSA.map(([k, , t], jx) =>
        '<td>' + (t === 'capag' ? '<select data-k="' + k + '" data-c="' + jx + '">' + CAPAGS.map((v) => '<option' + ((c[k] || '') === v ? ' selected' : '') + '>' + v + '</option>').join('') + '</select>'
          : '<input data-k="' + k + '" data-c="' + jx + '" value="' + esc(txt(c, k, t)) + '"' + (t !== 'texto' ? ' inputmode="decimal" class="num"' : '') + ' aria-label="' + esc(c.nome) + ' — ' + k + '">') + '</td>').join('') + '</tr>').join('') +
      '</tbody></table></div>',
    rodape: '<span class="sub" id="massa-conta">Nenhuma alteração</span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="massa-salvar">Salvar alterações</button></div>' });
  j.querySelector('.janela').classList.add('janela-massa');
  const cel = (i, c) => j.querySelector('tr[data-i="' + i + '"] [data-c="' + c + '"]');
  const marcar = (el) => { const c = lista[+el.closest('tr').dataset.i], [k, , t] = COLS_MASSA[+el.dataset.c];
    el.closest('td').classList.toggle('mudou', el.value.trim() !== txt(c, k, t));
    const n = new Set([...j.querySelectorAll('td.mudou')].map((td) => td.parentElement.dataset.i)).size;
    j.querySelector('#massa-conta').textContent = n ? n + ' linha(s) alterada(s)' : 'Nenhuma alteração'; };
  j.querySelectorAll('[data-k]').forEach((el) => {
    el.oninput = el.onchange = () => marcar(el);
    el.onkeydown = (ev) => {
      if (ev.key !== 'Enter' || el.tagName === 'SELECT') return;
      ev.preventDefault(); const p = cel(+el.closest('tr').dataset.i + 1, +el.dataset.c); if (p) p.focus();
    };
    el.onpaste = (ev) => {
      const dado = (ev.clipboardData || window.clipboardData).getData('text');
      if (!/[\t\n]/.test(dado)) return;
      ev.preventDefault();
      const i0 = +el.closest('tr').dataset.i, c0 = +el.dataset.c;
      dado.replace(/\r/g, '').replace(/\n$/, '').split('\n').forEach((lin, di) => lin.split('\t').forEach((v, dc) => {
        const alvo = cel(i0 + di, c0 + dc); if (!alvo) return;
        alvo.value = alvo.tagName === 'SELECT' ? (CAPAGS.find((x) => x.toLowerCase() === v.trim().toLowerCase()) || alvo.value) : v.trim().replace(/^R\$\s*/, ''); marcar(alvo);
      }));
    };
  });
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#massa-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const linhas = [...new Set([...j.querySelectorAll('td.mudou')].map((td) => +td.parentElement.dataset.i))];
    if (!linhas.length) throw new Error('Nada foi alterado.');
    const pacotes = linhas.map((i) => { const c = lista[i], d = {};
      j.querySelectorAll('tr[data-i="' + i + '"] td.mudou [data-k]').forEach((el) => { const [k, r, t] = COLS_MASSA[+el.dataset.c], v = el.value.trim();
        if (t === 'texto') { if (!v) throw new Error('O nome não pode ficar vazio (' + c.nome + ').'); d[k] = v; }
        else if (t === 'capag') d[k] = v;
        else if (t === 'int') { if (v && !/^\d+$/.test(v)) throw new Error(r + ' de ' + c.nome + ': use só números.'); d[k] = v ? Number(v) : null; }
        else { const n = v ? lerValor(v) : null; if (v && isNaN(n)) throw new Error(r + ' de ' + c.nome + ': valor inválido ("' + v + '").'); d[k] = n; } });
      return [c, d]; });
    let ok = 0, rasc = 0;
    for (const [c, d] of pacotes) {
      const { error } = await sb.from('clientes').update(d).eq('id', c.id);
      if (error && error.rascunho) rasc++; else if (error) throw new Error(c.nome + ': ' + erroAmigavel(error)); else ok++;
    }
    await carregarCadastros(true); fecharJanela(j);
    aviso(rasc ? '📝 ' + rasc + ' alteração(ões) enviada(s) para aprovação' + (ok ? ' e ' + ok + ' gravada(s)' : '') + '.' : '✓ ' + ok + ' cliente(s) atualizado(s).');
    if (E.tela === 'clientes') pintarClientes(); else await recarregar();
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
  { id: 'acessos', rot: '🔐 Acessos' },
  { id: 'automacoes', rot: '⚡ Automações' }
  // Backup 28: E-mails saiu da Administração (menu de cima → E-mails)
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
  // Backup 19: as telas de e-mail moraram para a Central de e-mails (abas) — lá o "atualizar" redesenha a aba aberta
  if (!$('adm-corpo') && $('em-area-corpo')) return pintarAreaEmail();
  if (E.adm.aba === 'email' || E.adm.aba === 'clientes_email') E.adm.aba = 'usuarios';   // Backup 38: módulo E-mails saiu
  document.querySelectorAll('#adm-abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === E.adm.aba));
  const corpo = $('adm-corpo');
  corpo.innerHTML = '<div class="carregando">Carregando…</div>';
  try { await ({ usuarios: admUsuarios, importar: admImportar, backup: admBackup, historico: admHistorico, acessos: admAcessos, clientes_email: admClientesEmail, automacoes: () => { E.adm.aba = 'usuarios'; irParaTela('automacoes'); }, email: admEmail })[E.adm.aba](corpo); }
  catch (e) { console.error(e); corpo.innerHTML = '<div class="card"><div class="card-bd msg-erro">' + esc(erroAmigavel(e)) + '</div></div>'; }
}

// ─────────────────────────── USUÁRIOS ──────────────────────────────
const PAPEIS = [['admin', 'Administrador'], ['equipe', 'Equipe'], ['cliente', 'Cliente (Portal)'], ['inativo', 'Inativo (sem acesso)']];
async function admUsuarios(corpo) {
  const [lista, vinculos, previstos] = await Promise.all([
    q(sb.from('perfis').select('*').order('criado_em')),
    q(sb.from('perfil_grupos').select('*')).catch(() => []),
    q(sb.from('usuarios_previstos').select('*').order('criado_em')).catch(() => [])
  ]);
  const gruposDe = (id) => vinculos.filter((v) => v.perfil_id === id).map((v) => nomeGrupo(v.grupo_id)).filter(Boolean);
  corpo.innerHTML =
    '<div class="titulo-pag" style="margin-bottom:10px"><div></div><div class="acoes"><button class="btn btn-p" id="us-novo">+ Novo usuário</button></div></div>' +
    // acessos já combinados (SQL do Backup 14): falta só criar a conta — a pessoa já nasce com a função certa
    (previstos.length ? '<div class="card"><div class="card-hd">👥 Acessos combinados — falta criar a conta <span class="sub">' + previstos.length + '</span></div><div class="card-bd"><div class="lista-ficha">' +
      previstos.map((v) => '<div class="item-ficha"><div><b>' + esc(v.nome) + '</b> <span class="pill neutro">' + esc(v.modelo || (v.papel === 'admin' ? 'Administrador' : 'Equipe')) + '</span>' +
        ' <span class="pill area-' + esc(v.areas) + '">' + esc(rotArea(v.areas)) + '</span><div class="sub">' + esc(v.email) + '</div></div>' +
        '<span><button class="btn btn-p btn-mini" data-prev="' + esc(v.email) + '">Criar conta</button> <button class="btn btn-o btn-mini" data-prev-x="' + esc(v.email) + '" title="Não criar">✕</button></span></div>').join('') +
      '</div><div class="sub" style="margin-top:8px">Clique em <b>Criar conta</b>, escolha uma senha provisória e passe para a pessoa (ou use depois o 🔑 Link de senha).</div></div></div>' : '') +
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
      '<td class="acoes-l"><button class="btn btn-o btn-mini" data-liberar="' + p.id + '" title="Confirma a conta sem depender do e-mail de confirmação: a pessoa entra com o e-mail e a senha provisória">✓ Liberar entrada</button> ' +
        '<button class="btn btn-o btn-mini" data-senha="' + esc(p.email) + '" title="Envia por e-mail um link para a pessoa criar uma senha nova">🔑 Link de senha</button>' +
        (E.perfil && p.id === E.perfil.id ? '' : ' <button class="btn btn-x btn-mini" data-excluir-u="' + p.id + '" data-nome-u="' + esc(p.nome || p.email) + '" title="Apaga o acesso desta pessoa (o que ela lançou continua no sistema)">🗑 Excluir</button>') + '</td></tr>').join('') +
    '</tbody></table></div></div>' +
    '<div class="dica"><b>Administrador</b>: tudo, inclusive excluir, importar e liberar usuários. <b>Equipe</b>: só as <b>funções</b> marcadas (Financeiro, Contratos, Jurídico…), em Ver ou Editar; não exclui. ' +
    '<b>Cliente</b>: só consulta, no Portal, os grupos escolhidos. <b>Inativo</b>: não entra.</div>';
  // Backup 23: excluir usuário (só administrador; não exclui a si mesmo nem o último administrador)
  corpo.querySelectorAll('[data-excluir-u]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    if (!confirm('Excluir o usuário "' + b.dataset.nomeU + '"?\n\nA pessoa perde o acesso ao sistema. O que ela lançou (tarefas, honorários, histórico) continua gravado.\nNão dá para desfazer: para voltar, crie a conta de novo.')) return;
    await q(sb.rpc('excluir_usuario', { p_perfil: b.dataset.excluirU }));
    aviso('✓ Usuário excluído.'); await pintarAdmin();
  }));
  corpo.querySelectorAll('[data-liberar]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const ok = await q(sb.rpc('confirmar_email_usuario', { p_perfil: b.dataset.liberar }));
    aviso(ok ? '✓ Entrada liberada: a pessoa já entra com o e-mail e a senha provisória.' : 'Não foi possível confirmar por aqui: confirme em Supabase → Authentication → Users.', !ok);
  }));
  corpo.querySelectorAll('[data-papel]').forEach((s) => s.onchange = () => comBotao(s, async () => {
    try {
      await q(sb.from('perfis').update({ papel: s.value }).eq('id', s.dataset.papel));
      aviso('✓ Acesso atualizado.');
      await pintarAdmin();
    } catch (e) { await pintarAdmin(); throw e; }
  }));
  corpo.querySelectorAll('[data-nome]').forEach((i) => i.onchange = () => comBotao(i, async () => {
    await q(sb.from('perfis').update({ nome: i.value.trim() }).eq('id', i.dataset.nome));
    if (E.perfil && i.dataset.nome === E.perfil.id) { E.perfil.nome = i.value.trim(); if ($('hd-nome')) $('hd-nome').textContent = E.perfil.nome;
      if (window.ERP_EU) { window.ERP_EU.nome = E.perfil.nome; document.dispatchEvent(new CustomEvent('erp:perfil')); } }
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
  corpo.querySelectorAll('[data-prev]').forEach((b) => b.onclick = () => formNovoUsuario(previstos.find((v) => v.email === b.dataset.prev)));
  corpo.querySelectorAll('[data-prev-x]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    if (!confirm('Tirar ' + b.dataset.prevX + ' da lista de acessos combinados?')) return;
    await q(sb.from('usuarios_previstos').delete().eq('email', b.dataset.prevX)); await pintarAdmin();
  }));
}
function formFuncoes(p) {
  const j = abrirJanela({ titulo: 'Funções de ' + (p.nome || p.email), larga: true,
    corpo: '<p class="sub" style="margin-bottom:10px">Marque o que esta pessoa pode <b>ver</b> ou <b>editar</b>. Use um modelo pronto e ajuste. As próprias tarefas ela sempre vê. <b>Rascunho</b>: a pessoa preenche, mas só vale depois que alguém que edita aprovar.</p>' + gradeAreas(p.areas) + gradeFuncoes(p.funcoes),
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-salvar-func">Salvar</button></div>' });
  ligarGradeFuncoes(j);
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-salvar-func').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    await q(sb.from('perfis').update({ funcoes: lerGradeFuncoes(j), areas: lerAreas(j) }).eq('id', p.id));
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
function formNovoUsuario(pre) {
  pre = pre || null;
  const j = abrirJanela({ titulo: pre ? 'Criar conta — ' + pre.nome : 'Novo usuário', larga: true,
    corpo: '<form id="f-us" class="grade">' +
      campo('Nome <span class="obrig">*</span>', '<input name="nome" autocomplete="off" value="' + esc(pre ? pre.nome : '') + '">') +
      campo('E-mail <span class="obrig">*</span>', '<input name="email" type="email" autocomplete="off" value="' + esc(pre ? pre.email : '') + '">') +
      campo('Senha provisória <span class="obrig">*</span>', '<input name="senha" autocomplete="new-password" placeholder="mínimo 8 caracteres">') +
      campo('Acesso', '<select name="papel">' + PAPEIS.filter((x) => x[0] !== 'inativo').map(([v, r]) => '<option value="' + v + '"' + (v === (pre ? pre.papel : 'equipe') ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>') +
      '<div class="inteiro' + (pre && pre.papel !== 'equipe' ? ' escondido' : '') + '" id="us-funcoes"><div class="secao" style="margin-bottom:6px">Funções (o que a pessoa pode usar)</div>' +
        gradeAreas(pre ? pre.areas : 'ambos') + gradeFuncoes(pre && pre.papel === 'equipe' ? pre.funcoes : MODELOS_ACESSO['Sócio (tudo)']) + '</div>' +
      '<div class="inteiro escondido" id="us-grupos"><div class="sub" style="margin-bottom:6px">Grupos que o cliente vê no Portal</div>' + listaGruposMarcar([]) + '</div>' +
      '<div class="dica inteiro">Passe o e-mail e a senha provisória para a pessoa: a conta já nasce <b>liberada</b> (não precisa clicar em link de confirmação). ' +
      'Se o Supabase ainda mandar o e-mail de confirmação, desligue em Authentication → Sign In / Providers → Email → "Confirm email".</div>' +
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
    await q(sb.from('perfis').update({ papel, nome, funcoes: papel === 'equipe' ? lerGradeFuncoes(j) : {}, areas: papel === 'equipe' ? lerAreas(j) : 'ambos' }).eq('id', perfil.id));
    if (papel === 'cliente') await salvarGruposPortal(perfil.id, ids);
    await q(sb.rpc('confirmar_email_usuario', { p_perfil: perfil.id })).catch(() => false);   // entra direto, sem esperar o e-mail de confirmação
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
    '</div></div><div id="imp-previa"></div>' +
    // demonstração: dados fictícios ligados entre si (clientes, contratos, CRM, documentos, tarefas, acordos…)
    '<div class="card"><div class="card-hd">🧪 Dados de demonstração<span class="sub" style="margin-left:auto;font-weight:400">para testar antes de importar as planilhas de verdade</span></div><div class="card-bd">' +
    '<p style="margin-bottom:10px">Cria 3 grupos e 6 clientes <b>fictícios</b> (nomes começam com <b>DEMO ·</b>), com contatos, contratos (mensal, salário mínimo, pontual e êxito), honorários pagos e em atraso, ' +
    'processos, parcelamento com parcelas, acordo, tarefas, oportunidades no CRM, documentos, certidões e um <b>rascunho de estagiário</b> esperando aprovação. E-mails dos exemplos usam o domínio <b>example.com</b> (não chegam a ninguém).</p>' +
    '<div class="acoes"><button class="btn btn-p" id="demo-carregar">Carregar demonstração</button><button class="btn btn-x" id="demo-apagar">Apagar demonstração</button></div>' +
    '<p class="sub" style="margin-top:8px">Carregar de novo apaga a demonstração anterior e cria outra (datas sempre a partir de hoje). Nada que você cadastrou é tocado.</p></div></div>';
  $('imp-arquivos').onchange = (ev) => lerArquivosImportacao(Array.from(ev.target.files));
  $('demo-carregar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const n = await q(sb.rpc('carregar_demonstracao'));
    await carregarCadastros(true); aviso('✓ Demonstração carregada: ' + n + ' clientes fictícios (DEMO ·). Abra Início, Clientes, Contratos, CRM e Aprovações.');
    if (window.ERP_RECARREGAR) window.ERP_RECARREGAR();
  });
  $('demo-apagar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!confirm('Apagar todos os dados de demonstração (DEMO ·)? O que você cadastrou não é tocado.')) return;
    const n = await q(sb.rpc('limpar_demonstracao'));
    await carregarCadastros(true); aviso('Demonstração apagada (' + n + ' clientes fictícios).');
    if (window.ERP_RECARREGAR) window.ERP_RECARREGAR();
  });
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
    '4. O arquivo tem dados de clientes: trate como documento sigiloso (LGPD).</div></div></div>' +
    '<div class="card"><div class="card-hd">🗓 Backups automáticos (todo domingo, 3h) <span class="sub" style="margin-left:auto">ficam as 8 últimas cópias, no armazenamento privado do sistema</span></div><div class="card-bd" id="bk-auto"><div class="carregando">Carregando…</div></div></div>';
  $('bk-excel').onclick = (ev) => comBotao(ev.currentTarget, () => fazerBackup('xlsx'));
  $('bk-json').onclick = (ev) => comBotao(ev.currentTarget, () => fazerBackup('json'));
  await pintarBackupsAuto();
}

async function pintarBackupsAuto() {
  const alvo = $('bk-auto'); if (!alvo) return;
  const lista = await q(sb.from('backups_auto').select('*').order('criado_em', { ascending: false })).catch(() => null);
  if (lista === null) { alvo.innerHTML = '<div class="dica">Rode o <b>estrutura.sql</b> novo e publique a função <b>erp-backup</b> para ligar o backup semanal.</div>'; return; }
  alvo.innerHTML = '<div class="acoes" style="margin-bottom:10px"><button class="btn btn-o" id="bk-agora">↻ Fazer backup agora</button></div>' +
    (lista.length ? '<div class="tabela-wrap"><table><thead><tr><th>Quando</th><th>Origem</th><th class="num">Tamanho</th><th>Registros</th><th></th></tr></thead><tbody>' +
      lista.map((b) => '<tr><td class="mono">' + quandoRodou(b.criado_em) + '</td><td>' + (b.origem === 'rotina' ? 'semanal' : 'manual') + '</td>' +
        '<td class="num mono">' + (b.tamanho > 1048576 ? (b.tamanho / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b.tamanho / 1024)) + ' KB') + '</td>' +
        '<td class="sub">' + Object.values(b.resumo || {}).reduce((a, n) => a + n, 0) + ' em ' + Object.keys(b.resumo || {}).length + ' tabelas</td>' +
        '<td class="acoes-l"><button class="btn btn-o btn-mini" data-bk="' + esc(b.caminho) + '">⬇ Baixar</button></td></tr>').join('') + '</tbody></table></div>'
      : vazio('Nenhum backup automático ainda. O primeiro sai no próximo domingo, ou clique em "Fazer backup agora".'));
  $('bk-agora').onclick = (ev) => comBotao(ev.currentTarget, async () => { const r = await chamarFuncao('erp-backup', { acao: 'rodar' }); aviso('✓ ' + (r.mensagem || 'Backup feito.')); await pintarBackupsAuto(); });
  alvo.querySelectorAll('[data-bk]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const { data, error } = await sb.storage.from('backups').createSignedUrl(b.dataset.bk, 60, { download: true });
    if (error) throw error;
    const a = document.createElement('a'); a.href = /^https?:/.test(data.signedUrl) ? data.signedUrl : String(CFG.url || location.origin).replace(/\/$/, '') + '/storage/v1' + data.signedUrl; a.download = b.dataset.bk; a.rel = 'noopener'; a.click();
  }));
}

// ─────────────────────────── ACESSOS ───────────────────────────────
async function admAcessos(corpo) {
  const [lista, pessoas] = await Promise.all([
    q(sb.from('acessos').select('*').order('quando', { ascending: false }).limit(300)).catch(() => null),
    q(sb.from('perfis').select('id, nome, email'))
  ]);
  if (lista === null) { corpo.innerHTML = '<div class="card"><div class="card-bd dica">Rode o <b>estrutura.sql</b> novo para ligar o registro de acessos.</div></div>'; return; }
  const nome = (id) => { const p = pessoas.find((x) => x.id === id); return p ? (p.nome || p.email) : '—'; };
  corpo.innerHTML = '<div class="card"><div class="card-hd">🔐 Últimos acessos <span class="sub" style="margin-left:auto">guardados por 180 dias · aparelho novo avisa a própria pessoa por e-mail</span></div>' +
    (lista.length ? '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th data-tipo="data">Quando</th><th>Pessoa</th><th>Aparelho / navegador</th><th></th></tr></thead><tbody>' +
      lista.map((a) => '<tr><td class="mono" data-ord="' + a.quando + '">' + quandoRodou(a.quando) + '</td><td>' + esc(nome(a.usuario_id)) + '</td><td class="sub">' + esc(a.navegador || '—') + '</td>' +
        '<td>' + (a.novo ? '<span class="pill hoje">aparelho novo</span>' : '') + '</td></tr>').join('') + '</tbody></table></div>' : vazio('Nenhum acesso registrado ainda.')) + '</div>';
}

async function fazerBackup(formato) {
  const prog = $('bk-prog'), dados = {};
  // todas as tabelas do sistema (mesma lista do backup automático); banco antigo: a lista fixa
  const tabelas = await q(sb.rpc('listar_tabelas_backup')).catch(() => null) || TABELAS_BACKUP;
  TABELAS_BACKUP.length = 0; tabelas.forEach((t) => TABELAS_BACKUP.push(t));
  const ORD = { historico: 'id', perfil_grupos: 'perfil_id', configuracoes: 'chave', cliente_etiquetas: 'cliente_id', salarios_minimos: 'ano' };
  for (const t of TABELAS_BACKUP) {
    prog.textContent = 'Lendo ' + t + '…';
    dados[t] = await buscarTodos(() => sb.from(t).select('*').order(ORD[t] || 'id'))
      .catch(() => buscarTodos(() => sb.from(t).select('*')));
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
// Backup 29: dados para pagamento no MESMO formato para o escritório e a Contabilidade; banco, agência e conta separados
const CAMPOS_PAG = ['pix', 'titular', 'banco', 'agencia', 'conta', 'whatsapp', 'assinatura'];
function formPagamento(id, rotPix, rotAss) {
  return '<form id="' + id + '" class="grade g3">' + campo('Chave PIX' + (rotPix || ''), '<input name="pix" placeholder="CNPJ, e-mail ou telefone">') + campo('Titular da conta', '<input name="titular">', 'dois') +
    campo('Banco', '<input name="banco" placeholder="Ex.: Sicoob">') + campo('Agência', '<input name="agencia" inputmode="numeric" placeholder="0000">') + campo('Conta', '<input name="conta" placeholder="00000-0">') +
    campo('WhatsApp para dúvidas', '<input name="whatsapp" data-mascara="tel" placeholder="(37) 9 0000-0000">') + campo('Assinatura dos e-mails', '<input name="assinatura" placeholder="' + (rotAss || 'Equipe Araújo & Castro') + '">', 'dois') + '</form>';
}
async function carregarPagamento(form, chave) {
  const r = await q(sb.from('configuracoes').select('valor').eq('chave', chave).maybeSingle()).catch(() => null), v = (r && r.valor) || {};
  // dados antigos com "Banco / agência / conta" num campo só continuam aparecendo no campo Banco
  CAMPOS_PAG.forEach((k) => { if (form[k]) form[k].value = v[k] || ''; });
  mascararCampos(form);
}
async function salvarPagamento(form, chave) {
  const v = {}; CAMPOS_PAG.forEach((k) => { v[k] = form[k].value.trim(); });
  await q(sb.from('configuracoes').upsert({ chave, valor: v }, { onConflict: 'chave' }));
}
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
    '<button class="btn btn-o" id="email-diag" title="Confere se as funções do Supabase estão publicadas (erp-emails, erp-publicacoes, erp-cnpj, erp-agenda)">🩺 Verificar funções</button>' +
    '<button class="btn btn-o" id="email-agora" title="A fila é a lista de e-mails esperando para sair; a rotina envia sozinha a cada 5 minutos. Este botão manda agora.">Enviar fila agora</button>' +
    '<button class="btn btn-o" id="email-resumo" title="Resumo do dia = e-mail interno para cada pessoa da equipe com as tarefas e prazos dela (sai sozinho às 7h45 nos dias úteis). Não vai para cliente.">Mandar resumo do dia agora</button></div>' +
    '<p class="sub" style="margin-top:8px"><b>Enviar fila agora:</b> manda já o que está esperando (a rotina manda sozinha a cada 5 min). <b>Resumo do dia:</b> e-mail interno para a equipe com as tarefas e prazos de cada um — não vai para cliente.</p>' +
    (st.configurado_em ? '<p class="sub" style="margin-top:8px">Configurado em ' + dataHoraBR(st.configurado_em) + '.</p>' : '') +
    '</div></div>' +
    '<div class="card"><div class="card-hd">Como configurar (uma vez)</div><div class="card-bd" id="email-ajuda"></div></div></div>' +
    // e-mails ao cliente: dados do quadro "Como pagar" e prévia de cada modelo
    '<div class="card"><div class="card-hd">⚖ Escritório (Jurídico) — dados para pagamento<span class="sub" style="margin-left:auto;font-weight:400">aparecem nos e-mails dos clientes do escritório</span></div><div class="card-bd">' +
      formPagamento('f-pag', ' do escritório', 'Equipe Araújo & Castro') +
      '<div class="acoes" style="margin-top:10px;flex-wrap:wrap"><button class="btn btn-p" id="pag-salvar">Salvar</button><span class="sub" style="align-self:center">Ver modelo:</span>' +
      [['lembrete', 'Lembrete'], ['cobranca', 'Cobrança'], ['acordo', 'Acordo'], ['parcelamento', 'Parcelamento'], ['recebido', 'Pagamento recebido']].map(([k, r]) => '<button class="btn btn-o btn-mini" data-previa="' + k + '">' + r + '</button>').join('') +
      '</div><p class="sub" style="margin-top:8px">Os e-mails ao cliente vão para os contatos marcados em "Recebe por e-mail" ou, se ninguém estiver marcado, para o contato do setor certo (veja Central de e-mails → Quem recebe o quê). Sem e-mail cadastrado, nada é enviado. Liga/desliga cada um em Automações.</p></div></div>' +
    // Backup 28: a Contabilidade manda pelo e-mail dela e com os dados de pagamento dela
    '<div class="card" id="email-contab"><div class="card-hd">🧮 Contabilidade — e-mail que envia e dados para pagamento<span class="sub" style="margin-left:auto;font-weight:400">usados nos e-mails dos clientes da Contabilidade e nas cobranças da Contabilidade</span></div><div class="card-bd">' +
      '<div class="dica" style="margin-bottom:10px">Quem cobra é quem aparece: clientes do escritório recebem pelo e-mail acima com os dados do escritório; clientes com área <b>Contabilidade</b> e lançamentos da Contabilidade saem por esta conta, com estes dados. Sem esta conta configurada, sai pela do escritório.</div>' +
      '<form id="f-email-ct" class="grade">' + campo('Serviço', '<select name="provedor"><option value="gmail">Gmail (sem custo)</option><option value="smtp">Outro e-mail (SMTP)</option><option value="resend">Resend</option></select>') +
      campo('E-mail que envia', '<input name="usuario" type="email" placeholder="contabilidade@...">') +
      campo('Senha de app / senha', '<input name="senha" type="password" autocomplete="new-password" placeholder="deixe vazio para manter">') +
      campo('Servidor SMTP (só "Outro e-mail")', '<input name="host" placeholder="smtp.hostinger.com">') + campo('Porta', '<input name="porta" inputmode="numeric" value="465">') +
      campo('Nome do remetente', '<input name="remetente" placeholder="Contabilidade Araújo & Castro">') + '</form>' +
      '<div class="secao" style="margin-top:14px">Dados para pagamento da Contabilidade</div>' + formPagamento('f-pag-ct', ' da Contabilidade', 'Equipe da Contabilidade') +
      '<div class="acoes" style="margin-top:10px"><button class="btn btn-p" id="ct-salvar">Salvar Contabilidade</button><span class="sub" id="ct-status"></span></div></div></div>' +
    '<div class="kpis">' + kpi('Na fila', String(st.pendentes || 0), '', 'saem a cada 5 minutos') + kpi('Enviados em 7 dias', String(st.enviados_7d || 0), 'verde', '') +
    kpi('Com erro', String(st.erros || 0), st.erros ? 'vermelho' : '', 'veja o motivo abaixo') + '</div>' +
    '<div class="card"><div class="card-hd">Últimos e-mails</div>' + (fila.length ? '<div class="tabela-wrap"><table><thead><tr><th>Quando</th><th>Para</th><th>Assunto</th><th>Situação</th></tr></thead><tbody>' +
      fila.map((m) => '<tr><td class="mono">' + dataHoraBR(m.criado_em) + '</td><td>' + esc(m.para) + '</td><td>' + esc(m.assunto) + '</td><td>' +
        '<span class="pill ' + ({ enviado: 'pago', pendente: 'aberto', erro: 'vencido', cancelado: 'neutro' }[m.status] || 'neutro') + '">' + esc(m.status) + '</span>' +
        (m.erro ? '<div class="sub">' + esc(m.erro) + '</div>' : '') + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="vazio">Nenhum e-mail ainda.</div>') + '</div>';
  const f = $('f-email');
  f.provedor.value = prov;
  const fp = $('f-pag');
  carregarPagamento(fp, 'dados_pagamento');
  const fct = $('f-email-ct'), fpct = $('f-pag-ct');
  q(sb.rpc('status_config_email_conta', { p_conta: 'contabilidade' })).then((c) => { c = c || {}; ['usuario', 'host', 'remetente'].forEach((k) => { fct[k].value = c[k] || ''; });
    fct.provedor.value = c.provedor || 'gmail'; fct.porta.value = c.porta || 465; $('ct-status').textContent = c.tem_senha ? '✓ conta configurada' : 'conta ainda não configurada'; }).catch(() => {});
  carregarPagamento(fpct, 'dados_pagamento_contab');
  $('ct-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (fct.usuario.value.trim()) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fct.usuario.value.trim())) throw new Error('E-mail da Contabilidade inválido.');
      await q(sb.rpc('salvar_config_email_conta', { p_conta: 'contabilidade', p: { provedor: fct.provedor.value, usuario: fct.usuario.value.trim(), senha: fct.senha.value.replace(/\s+/g, fct.provedor.value === 'gmail' ? '' : ' ').trim(),
        host: fct.host.value.trim(), porta: Number(fct.porta.value) || 465, remetente: fct.remetente.value.trim() } }));
    }
    await salvarPagamento(fpct, 'dados_pagamento_contab');
    aviso('✓ Dados da Contabilidade salvos.'); fct.senha.value = '';
  });
  $('pag-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    await salvarPagamento(fp, 'dados_pagamento');
    aviso('✓ Dados para pagamento salvos: já valem nos próximos e-mails.');
  });
  corpo.querySelectorAll('[data-previa]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const html = await q(sb.rpc('previa_email_cliente', { p_tipo: b.dataset.previa }));
    const j = abrirJanela({ titulo: 'Modelo: ' + b.textContent + ' (exemplo fictício)', larga: true, corpo: '<iframe class="previa-email" sandbox="" title="Prévia do e-mail"></iframe>' });
    j.querySelector('iframe').srcdoc = html;
  }));
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

// ─────────────────────── E-MAILS AOS CLIENTES (perfil por cliente) ───────────────────────
// Um lugar só para decidir quem recebe o quê: cada cliente tem um perfil; dá para mudar vários de uma vez.
async function admClientesEmail(corpo) {
  await carregarCadastros(true);
  const ult = await q(sb.rpc('ultimos_emails_clientes')).catch(() => []);
  const ultimo = {}; ult.forEach((u) => { ultimo[u.cliente_id] = u; });
  const F = E.adm.cem = E.adm.cem || { busca: '', perfil: '' };
  const rot = (v) => (PERFIS_EMAIL.find((p) => p[0] === (v || 'padrao')) || PERFIS_EMAIL[0])[1];
  corpo.innerHTML =
    '<div class="card"><div class="card-hd">📨 Quem recebe e-mail automático de honorários</div><div class="card-bd">' +
      '<div class="cem-perfis">' + PERFIS_EMAIL.map(([v, r, d]) => '<div class="cem-perfil"><b>' + r + '</b><span>' + d + '</span></div>').join('') + '</div>' +
      '<p class="sub" style="margin-top:10px">Cliente novo entra como <b>Padrão</b>. Os e-mails vão para o contato financeiro do cliente (ficha → Contatos) e só saem se a automação estiver ligada em ⚡ Automações. ' +
      'Nome, chave PIX e modelos ficam na aba <b>⚙ Configuração do envio</b>.</p></div></div>' +
    '<div class="filtros"><input class="busca" id="cem-busca" placeholder="Buscar cliente ou grupo" autocomplete="off" value="' + esc(F.busca) + '">' +
      '<select class="busca sel" id="cem-filtro"><option value="">Todos os perfis</option>' + PERFIS_EMAIL.map(([v, r]) => '<option value="' + v + '"' + (F.perfil === v ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>' +
      '<span class="sub" id="cem-sel" style="align-self:center"></span>' +
      '<select class="busca sel" id="cem-lote"><option value="">Aplicar aos marcados…</option>' + PERFIS_EMAIL.filter((p) => p[0] !== 'personalizado').map(([v, r]) => '<option value="' + v + '">' + r + '</option>').join('') + '</select></div>' +
    '<div class="card"><div id="cem-tab"></div></div>';
  const pintar = () => {
    const b = normalizar(F.busca);
    const lista = E.clientes.filter((c) => c.tipo !== 'Inativo' && (!F.perfil || (c.perfil_email || 'padrao') === F.perfil) &&
      (!b || normalizar(c.nome + ' ' + (c.grupos ? c.grupos.nome : '')).includes(b)))
      .sort((a, x) => String(a.grupos ? a.grupos.nome : '').localeCompare(String(x.grupos ? x.grupos.nome : ''), 'pt-BR') || String(a.nome).localeCompare(String(x.nome), 'pt-BR'));
    $('cem-tab').innerHTML = lista.length ? '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th class="sem-ordem"><input type="checkbox" id="cem-todos" aria-label="Marcar todos"></th><th>Grupo</th><th>Cliente</th><th>E-mails de cobrança</th><th>Último e-mail enviado</th></tr></thead><tbody>' +
      lista.map((c) => { const u = ultimo[c.id]; return '<tr><td><input type="checkbox" data-cem-x="' + c.id + '" aria-label="Marcar ' + esc(c.nome) + '"></td><td>' + esc(c.grupos ? c.grupos.nome : '—') + '</td><td><b>' + esc(c.nome) + '</b></td>' +
        '<td><select class="busca sel cem-perfil-sel" data-cem="' + c.id + '" aria-label="Perfil de ' + esc(c.nome) + '">' + PERFIS_EMAIL.map(([v, r]) => '<option value="' + v + '"' + ((c.perfil_email || 'padrao') === v ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>' +
        ((c.perfil_email || 'padrao') === 'personalizado' ? ' <button type="button" class="btn btn-o btn-mini" data-cem-tipos="' + c.id + '">Tipos</button>' : '') + '</td>' +
        '<td data-ord="' + (u ? u.quando : '') + '">' + (u ? '<span class="sub">' + dataHoraBR(u.quando) + '</span><div class="sub" title="' + esc(u.descricao) + '">' + esc(String(u.descricao).slice(0, 70)) + '</div>' : '<span class="sub">—</span>') + '</td></tr>'; }).join('') +
      '</tbody></table></div>' : vazio('Nenhum cliente neste filtro.');
    const marcados = () => [...document.querySelectorAll('[data-cem-x]:checked')].map((x) => x.dataset.cemX);
    const conta = () => { const n = marcados().length; $('cem-sel').textContent = n ? n + ' marcado(s)' : ''; };
    const todos = $('cem-todos'); if (todos) todos.onchange = () => { document.querySelectorAll('[data-cem-x]').forEach((x) => { x.checked = todos.checked; }); conta(); };
    document.querySelectorAll('[data-cem-x]').forEach((x) => x.onchange = conta);
    document.querySelectorAll('[data-cem]').forEach((sel) => sel.onchange = () => comBotao(sel, async () => {
      if (sel.value === 'personalizado') { await janelaTiposEmail([sel.dataset.cem]); return; }
      await q(sb.rpc('salvar_perfil_email', { p_ids: [sel.dataset.cem], p_perfil: sel.value, p_tipos: null }));
      aviso('✓ ' + rot(sel.value) + ' — ' + (E.clientes.find((c) => c.id === sel.dataset.cem) || {}).nome); await carregarCadastros(true); pintar();
    }));
    document.querySelectorAll('[data-cem-tipos]').forEach((b) => b.onclick = () => janelaTiposEmail([b.dataset.cemTipos]));
    $('cem-lote').onchange = (ev) => comBotao(ev.target, async () => {
      const v = ev.target.value, ids = marcados(); ev.target.value = '';
      if (!v) return; if (!ids.length) throw new Error('Marque os clientes na primeira coluna.');
      const n = await q(sb.rpc('salvar_perfil_email', { p_ids: ids, p_perfil: v, p_tipos: null }));
      aviso('✓ ' + n + ' cliente(s) agora em "' + rot(v) + '".'); await carregarCadastros(true); pintar();
    });
  };
  // Personalizado: caixinhas por tipo de e-mail
  const janelaTiposEmail = (ids) => new Promise((ok) => {
    const c = E.clientes.find((x) => x.id === ids[0]) || {}, t = c.emails_tipos || {};
    const padrao = (k) => k !== 'vencimento';
    const j = abrirJanela({ titulo: 'E-mails de ' + (c.nome || 'cliente'), corpo: '<div class="lista-ficha">' + TIPOS_EMAIL.map(([k, r]) =>
        '<label class="check"><input type="checkbox" data-tipo="' + k + '"' + ((t[k] != null ? t[k] : padrao(k)) ? ' checked' : '') + '> ' + r + '</label>').join('') + '</div>',
      rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="cem-tipos-ok">Salvar</button></div>' });
    j._aoFechar = () => { ok(); pintar(); };
    j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
    j.querySelector('#cem-tipos-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
      const tipos = {}; j.querySelectorAll('[data-tipo]').forEach((x) => { tipos[x.dataset.tipo] = x.checked; });
      await q(sb.rpc('salvar_perfil_email', { p_ids: ids, p_perfil: 'personalizado', p_tipos: tipos }));
      await carregarCadastros(true); aviso('✓ E-mails de ' + (c.nome || 'cliente') + ' atualizados.'); fecharJanela(j);
    });
  });
  let tb; $('cem-busca').oninput = (ev) => { clearTimeout(tb); tb = setTimeout(() => { F.busca = ev.target.value; pintar(); }, 250); };
  $('cem-filtro').onchange = (ev) => { F.perfil = ev.target.value; pintar(); };
  pintar();
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
// Backup 39: primeiro nome para mostrar na tela, com a inicial maiúscula (Pedro, Emanuelle, Adriana…)
function nomeCurto(s) { const p = String(s || '').trim().split(/\s+/)[0] || ''; return p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1).toLocaleLowerCase('pt-BR'); }
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
// Pessoas do escritório para as listas (Responsável, Revisor, Participantes): as de sempre + quem tem acesso ao sistema
const EQUIPE_BASE = ['Pedro', 'Emanuelle', 'Adriana', 'João Vitor', 'Éder'];
function pessoasEscritorio(incluir) {
  const lista = EQUIPE_BASE.slice();
  (E._equipe || []).forEach((u) => { const n = String(u.nome || '').trim(); if (n && !lista.some((b) => primeiroNome(b) === primeiroNome(n))) lista.push(n); });
  String(incluir || '').split(',').map((x) => x.trim()).filter(Boolean).forEach((n) => { if (!lista.some((b) => primeiroNome(b) === primeiroNome(n))) lista.push(n); });
  return lista;
}
function selectPessoa(nome, valor, rotVazio) {
  const v = String(valor || '').trim(), lista = pessoasEscritorio(v);
  const marcada = lista.find((p) => primeiroNome(p) === primeiroNome(v)) || '';
  return '<select name="' + nome + '" class="sel-pessoa"><option value="">' + esc(rotVazio || '— ninguém —') + '</option>' +
    lista.map((p) => '<option value="' + esc(p) + '"' + (p === marcada ? ' selected' : '') + '>' + esc(p) + '</option>').join('') + '</select>';
}
// participantes: marcar as pessoas (sem digitar)
function campoParticipantes(valor) {
  const marcados = String(valor || '').split(',').map((x) => primeiroNome(x)).filter(Boolean);
  return '<div class="tf-part" role="group" aria-label="Participantes">' + pessoasEscritorio(valor).map((p) =>
    '<label class="tf-part-it"><input type="checkbox" value="' + esc(p) + '"' + (marcados.includes(primeiroNome(p)) ? ' checked' : '') + '><span>' + esc(p) + '</span></label>').join('') + '</div>';
}
const lerParticipantes = (raiz) => [...raiz.querySelectorAll('.tf-part input:checked')].map((i) => i.value).join(', ');

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
// Fila do Início: 5 primeiras + "Ver todas"; ou em calendário (mês, semana ou dia). A escolha fica salva na pessoa
// (perfis.preferencias.fila) e vale no próximo acesso, em qualquer computador. Cobrança de honorário atrasado não entra
// (já aparece em "Atrasados", logo abaixo).
const FILA = { toda: false, min: false, vista: 'lista', ref: null, lida: false, quem: '' };
// Backup 38: a agenda mostra SÓ o que está em Tarefas (tarefas e compromissos lançados pela equipe).
// O administrador escolhe de quem ver: só as suas, todos, ou uma pessoa; os demais veem só as suas.
const ehAdminFila = () => !!(E.perfil && E.perfil.papel === 'admin');
const VISTAS_FILA = [['lista', 'Lista'], ['mes', 'Mês'], ['semana', 'Semana'], ['dia', 'Dia']];
function salvarPrefFila() {
  const v = { vista: FILA.vista, min: FILA.min, quem: FILA.quem || '' };
  if (E.perfil) E.perfil.preferencias = Object.assign({}, E.perfil.preferencias || {}, { fila: v });
  sb.rpc('salvar_preferencia', { p_chave: 'fila', p_valor: v }).then(() => {}, () => {});
}
// Backup 36: compromissos na agenda (tarefas com tipo_agenda + hora) — cor por tipo e legenda
const TIPOS_AGENDA = [['reuniao', 'Reunião', '🤝'], ['audiencia', 'Audiência', '⚖'], ['compromisso', 'Compromisso', '📌'], ['ligacao', 'Ligação', '📞']];
// legenda curta: compromissos (reunião, audiência, compromisso), tarefa e atrasada; ⚑ = prazo fatal
const legendaAgenda = () => '<div class="ag-leg">' + TIPOS_AGENDA.filter(([k]) => k !== 'ligacao').map(([k, r]) => '<span><i class="ag-cor ag-' + k + '"></i>' + r + '</span>').join('') +
  '<span><i class="ag-cor ag-tarefa"></i>Tarefa</span><span><i class="ag-cor ag-atrasada"></i>Atrasada</span><span>⚑ Prazo fatal</span></div>';
function janelaAgendar(dataIni, depois) {
  const pessoas = pessoasEscritorio();
  const j = abrirJanela({ titulo: '📅 Agendar na minha agenda',
    corpo: '<form id="f-ag" class="grade">' +
      '<div class="campo" style="grid-column:1/-1"><span>Tipo</span><div class="segmento ag-tipos" id="ag-tipo">' + TIPOS_AGENDA.map(([k, r, ic], i) => '<button type="button" data-v="' + k + '"' + (i ? '' : ' class="ativo"') + '>' + ic + ' ' + r + '</button>').join('') + '</div></div>' +
      campo('O quê', '<input name="titulo" required placeholder="ex.: Reunião com o cliente sobre o parcelamento">', 'ag-toda') +
      campo('Dia', '<input type="date" name="prazo" required value="' + (dataIni || hojeISO()) + '">') + campo('Hora', '<input type="time" name="hora" value="09:00">') +
      campo('Local ou link', '<input name="local" placeholder="escritório, Google Meet…">', 'ag-toda') +
      '<div class="campo" style="grid-column:1/-1"><span>Quem participa</span><div class="ag-pessoas">' + (pessoas.length ? pessoas : [meuNome()]).filter(Boolean).map((n) =>
        '<label class="ag-p"><input type="checkbox" name="part" value="' + esc(n) + '"' + (primeiroNome(n) === primeiroNome(meuNome()) ? ' checked' : '') + '><span>' + esc(nomeCurto(n)) + '</span></label>').join('') + '</div></div>' +
      // Backup 39: cliente cadastrado (escolhe na lista) OU texto livre (ex.: "Dr. Fulano, contador da empresa X")
      campo('Com quem (opcional)', '<input name="com" list="ag-clis" autocomplete="off" placeholder="Cliente cadastrado ou qualquer nome"><datalist id="ag-clis">' + E.clientes.map((c) => '<option value="' + esc(c.nome) + '">').join('') + '</datalist>', 'ag-toda') +
      campo('Observação', '<textarea name="descricao" rows="2"></textarea>', 'ag-toda') + '</form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="ag-ok">Agendar</button></div>' });
  let tipo = 'reuniao';
  j.querySelector('#ag-tipo').onclick = (ev) => { const b = ev.target.closest('[data-v]'); if (!b) return; tipo = b.dataset.v; j.querySelectorAll('#ag-tipo button').forEach((x) => x.classList.toggle('ativo', x === b)); };
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#ag-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const f = j.querySelector('#f-ag');
    if (!f.titulo.value.trim()) throw new Error('Escreva o que é o compromisso.');
    if (!f.prazo.value) throw new Error('Escolha o dia.');
    const parts = [...f.querySelectorAll('[name=part]:checked')].map((x) => x.value);
    const resp = parts.find((n) => primeiroNome(n) === primeiroNome(meuNome())) || parts[0] || meuNome();
    const com = f.com.value.trim(), cli = E.clientes.find((c) => normalizar(c.nome) === normalizar(com));
    await q(sb.from('tarefas').insert({ titulo: f.titulo.value.trim(), prazo: f.prazo.value, hora: f.hora.value || null, tipo_agenda: tipo, local: f.local.value.trim(),
      responsavel: resp, participantes: parts.filter((n) => n !== resp).join(', '), cliente_id: cli ? cli.id : null, com_quem: cli ? '' : com,
      grupo_id: cli ? cli.grupo_id || null : null, descricao: f.descricao.value.trim(), prioridade: 'media', status: 'pendente' }));
    fecharJanela(j); aviso('✓ Agendado para ' + dataBR(f.prazo.value) + (f.hora.value ? ' às ' + f.hora.value : '') + '.'); if (depois) depois();
  });
}
function classeAgenda(t, d) {
  const h = hojeISO();
  if (t._cls) return t._cls;
  if (t.prazo_fatal === d) return 'ag-fatal';
  if (t.tipo_agenda) return 'ag-' + (t.tipo_agenda === 'ligacao' ? 'compromisso' : t.tipo_agenda);   // Backup 38: ligação entra como compromisso (legenda curta)
  if (/^reuniao:/.test(t.chave_regra || '')) return 'ag-reuniao';   // reuniões marcadas pelo CRM
  return t.prazo && t.prazo < h ? 'ag-atrasada' : 'ag-tarefa';
}
const horaAg = (t) => (t.hora ? String(t.hora).slice(0, 5) + ' ' : '');
// Backup 39: o quadro "Atrasadas" é um só — Início (agenda) e Tarefas (Minha semana e Calendário)
function quadroAtrasadas(atr) {
  return '<aside class="fila-atrasadas"><div class="fila-atr-tit">⏰ Atrasadas <span class="pill ' + (atr.length ? 'vencido' : 'pago') + '">' + atr.length + '</span></div>' +
    (atr.length ? atr.map((t) => '<button type="button" class="fila-atr-it" data-fila="' + t.id + '" title="' + esc(t.titulo) + '"><b>' + esc(t.titulo) + '</b><span class="sub">prazo ' + dataBR(t.prazo) + ' · ' + plural(-diasAte(t.prazo), 'dia', 'dias') + ' de atraso</span></button>').join('')
      : '<div class="sub">Nenhuma atrasada. 🎉</div>') + '</aside>';
}
function calendarioFila(lista) {
  const h = hojeISO(), ref = FILA.ref || h, d0 = new Date(ref + 'T12:00:00');
  const doDia = (d) => lista.filter((t) => t.prazo === d || t.prazo_fatal === d).sort((a, b) => String(a.hora || '99').localeCompare(String(b.hora || '99')));
  const item = (t, d) => '<button type="button" class="cal-tf ' + classeAgenda(t, d) + '" data-fila="' + t.id + '" title="' + esc(horaAg(t) + t.titulo + (t.local ? ' · ' + t.local : '')) + '">' +
    (t.prazo_fatal === d ? '⚑ ' : '') + (t.hora ? '<b>' + horaAg(t) + '</b>' : '') + esc(t.titulo) + '</button>';
  let titulo, corpo;
  if (FILA.vista === 'dia') {
    titulo = d0.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    const l = doDia(ref);
    corpo = l.length ? '<div class="lista-ficha">' + l.map((t) => '<div class="item-ficha clicavel" data-fila="' + t.id + '"><div>' + bolinha(t) + ' <b>' + esc(t.titulo) + '</b>' + seloFatal(t) +
      '<div class="sub">' + esc(quemTarefa(t) || '') + '</div></div></div>').join('') + '</div>' : '<div class="sub">Nada com prazo neste dia.</div>';
  } else if (FILA.vista === 'semana') {
    const ini = new Date(d0); ini.setDate(d0.getDate() - d0.getDay());
    const dias = [...Array(7)].map((_, k) => { const x = new Date(ini); x.setDate(ini.getDate() + k); return iso(x); });
    titulo = 'Semana de ' + dataBR(dias[0]).slice(0, 5) + ' a ' + dataBR(dias[6]).slice(0, 5);
    corpo = '<div class="fila-semana">' + dias.map((d) => '<div class="fila-sem-dia' + (d === h ? ' cal-hoje' : '') + '" data-ag-dia="' + d + '"><div class="cal-num">' +
      new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }) + '</div>' + doDia(d).map((t) => item(t, d)).join('') + '</div>').join('') + '</div>';
  } else {
    const a = d0.getFullYear(), m = d0.getMonth(), primeiro = new Date(a, m, 1), n = new Date(a, m + 1, 0).getDate();
    titulo = primeiro.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    let c = '<div class="calendario">' + ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((x) => '<div class="cal-sem">' + x + '</div>').join('') + '<div class="cal-dia vazio-dia"></div>'.repeat(primeiro.getDay());
    for (let k = 1; k <= n; k++) {
      const d = iso(new Date(a, m, k)), l = doDia(d);
      c += '<div class="cal-dia' + (d === h ? ' cal-hoje' : '') + '" data-ag-dia="' + d + '" title="Clique no espaço vazio para agendar neste dia"><div class="cal-num">' + k + '</div>' + l.slice(0, 3).map((t) => item(t, d)).join('') + (l.length > 3 ? '<div class="sub">+ ' + (l.length - 3) + '</div>' : '') + '</div>';
    }
    // Backup 27: completa a última semana com dias vazios (igual aos dias antes do dia 1, sem o cinza do fundo)
    const resto = (7 - ((primeiro.getDay() + n) % 7)) % 7;
    corpo = c + '<div class="cal-dia vazio-dia"></div>'.repeat(resto) + '</div>';
  }
  // Backup 27: à esquerda, as tarefas atrasadas (não aparecem na semana/dia/mês que você está vendo)
  const lado = quadroAtrasadas(lista.filter((t) => t.prazo && t.prazo < h).sort((a, b) => a.prazo.localeCompare(b.prazo)));
  return '<div class="fila-com-atr">' + lado + '<div class="fila-cal-area"><div class="fila-cal-nav"><button type="button" class="btn btn-o btn-mini" data-fila-nav="-1" aria-label="Anterior">‹</button><b>' + esc(titulo) + '</b>' +
    '<button type="button" class="btn btn-o btn-mini" data-fila-nav="1" aria-label="Próximo">›</button><button type="button" class="btn btn-o btn-mini" data-fila-nav="0">Hoje</button>' +
    '<button type="button" class="btn btn-p btn-mini ag-bt" data-agendar>+ Agendar</button></div>' + corpo + legendaAgenda() + '</div></div>';
}
async function cardMinhaFila() {
  if (!FILA.lida) { const p = (E.perfil && E.perfil.preferencias && E.perfil.preferencias.fila) || {}; if (p.vista) FILA.vista = p.vista; FILA.min = false; FILA.quem = p.quem || ''; FILA.lida = true; }
  if (!ehAdminFila()) FILA.quem = '';
  await feriados();
  await equipe().catch(() => []);
  const ts = await q(sb.from('tarefas').select('*').not('status', 'in', '(concluida,cancelada)')).catch(() => []);
  const daPessoa = (t) => (FILA.quem === 'todos' ? true : FILA.quem ? [t.responsavel].concat(String(t.participantes || '').split(',')).some((n) => primeiroNome(n) === primeiroNome(FILA.quem)) : ehMinha(t));
  const todas = ordenarFila(ts.filter((t) => daPessoa(t) && !/^(cob|parc|aco):/.test(t.chave_regra || ''))), minhas = FILA.toda ? todas : todas.slice(0, 5);
  const naAgenda = todas;
  const rotQuem = FILA.quem === 'todos' ? 'de todos' : FILA.quem ? 'de ' + primeiroNome(FILA.quem) : 'suas';
  const selQuem = ehAdminFila() ? '<select class="ini-fila-quem" data-fila-quem aria-label="De quem ver as tarefas"><option value="">Só as minhas</option><option value="todos"' + (FILA.quem === 'todos' ? ' selected' : '') + '>Todos</option>' +
    pessoasEscritorio().filter((n) => primeiroNome(n) !== primeiroNome(meuNome())).map((n) => '<option' + (FILA.quem === n ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select>' : '';
  const html = '<div class="card ini-fila' + (FILA.min ? ' minimizada' : '') + '"><div class="card-hd">📋 Minha fila de trabalho ' + '<span class="sub">' + plural(todas.length, 'aberta', 'abertas') + ' · ' + rotQuem + '</span>' + selQuem +
      '<div class="segmento ini-fila-vista" role="group" aria-label="Ver como">' + VISTAS_FILA.map(([v, r]) => '<button type="button" data-fila-vista="' + v + '"' + (FILA.vista === v ? ' class="ativo"' : '') + '>' + r + '</button>').join('') + '</div>' +
      '</div>' +   // Backup 39: sem "Minimizar" 
    (FILA.min ? '' : '<div class="card-bd">' + (FILA.vista !== 'lista' ? calendarioFila(naAgenda) :
    (minhas.length ? '<div class="lista-ficha fila-compacta">' + minhas.map((t) => '<div class="item-ficha clicavel" data-fila="' + t.id + '"><div>' + bolinha(t) + (t.tipo_agenda ? ' <i class="ag-cor ag-' + t.tipo_agenda + '"></i>' : '') + ' <b>' + (t.hora ? horaAg(t) : '') + esc(t.titulo) + '</b>' + seloPrazo(t) +
      '<div class="sub">' + (t.prazo ? 'prazo ' + dataBR(t.prazo) : 'sem prazo') + (t.prazo_fatal ? ' · ⚑ fatal ' + dataBR(t.prazo_fatal) : '') + (t.status === 'revisao' ? ' · aguardando revisão' : '') +
      (quemTarefa(t) ? ' · ' + esc(quemTarefa(t)) : '') + '</div></div>' +
      '<span class="pill ' + (PRIORIDADE[t.prioridade] || ['', 'neutro'])[1] + '">' + esc((PRIORIDADE[t.prioridade] || [t.prioridade])[0]) + '</span></div>').join('') + '</div>' +
      (todas.length > 5 ? '<div class="ini-fila-mais"><button type="button" class="btn btn-o btn-mini" data-fila-toda>' + (FILA.toda ? '▴ Mostrar só as 5 primeiras' : '▾ Ver todas (' + todas.length + ')') + '</button></div>' : '')
      : '<div class="sub">' + (FILA.quem ? 'Nenhuma tarefa aberta.' : 'Nenhuma tarefa com você.') + ' 🎉</div>')) + '</div>') + '</div>';
  const repinta = async (raiz) => { const c = await cardMinhaFila(); raiz.innerHTML = c.html; c.ligar(raiz); };
  return { html, ligar: (raiz) => {
    raiz.querySelectorAll('[data-fila]').forEach((d) => d.onclick = () => {
      abrirTarefa(ts.find((t) => t.id === d.dataset.fila), () => irPara(E.tela)); });
    const sq = raiz.querySelector('[data-fila-quem]'); if (sq) sq.onchange = () => { FILA.quem = sq.value; salvarPrefFila(); repinta(raiz); };
    const bt = raiz.querySelector('[data-fila-toda]'); if (bt) bt.onclick = () => { FILA.toda = !FILA.toda; repinta(raiz); };
    raiz.querySelectorAll('[data-fila-vista]').forEach((b) => b.onclick = () => { FILA.vista = b.dataset.filaVista; FILA.min = false; FILA.ref = null; salvarPrefFila(); repinta(raiz); });
    raiz.querySelectorAll('[data-agendar]').forEach((b) => b.onclick = () => janelaAgendar(FILA.vista === 'dia' ? (FILA.ref || hojeISO()) : hojeISO(), () => repinta(raiz)));
    raiz.querySelectorAll('[data-ag-dia]').forEach((d) => d.addEventListener('click', (ev) => { if (ev.target.closest('[data-fila]')) return; janelaAgendar(d.dataset.agDia, () => repinta(raiz)); }));
    raiz.querySelectorAll('[data-fila-nav]').forEach((b) => b.onclick = () => {
      const n = +b.dataset.filaNav, d = new Date((FILA.ref || hojeISO()) + 'T12:00:00');
      if (!n) FILA.ref = null;
      else { if (FILA.vista === 'mes') d.setMonth(d.getMonth() + n, 1); else d.setDate(d.getDate() + n * (FILA.vista === 'semana' ? 7 : 1)); FILA.ref = iso(d); }
      repinta(raiz);
    });
  } };
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
  const d = diasAte(t.prazo_fatal), u = tarefaFechada(t) ? null : uteisAte(t.prazo_fatal, E._feriados || new Set());
  const falta = u == null ? '' : u < 0 ? ' · vencido' : u === 0 ? ' · hoje!' : ' · faltam ' + u + ' dia(s) útil(eis)';
  return ' <span class="pill ' + (tarefaFechada(t) ? 'neutro' : d <= 2 ? 'vencido' : 'cobranca') + '" title="Prazo fatal (contagem em dias úteis, com os feriados cadastrados)">⚑ ' + dataBR(t.prazo_fatal) + falta + '</span>';
}
// Backup 39: cliente, grupo ou o "com quem" livre da agenda
function quemTarefa(t) { return nomeCliente(t.cliente_id) || nomeGrupo(t.grupo_id) || (t.com_quem || ''); }
function nomeCliente(id) { const c = E.clientes.find((x) => x.id === id); return c ? c.nome : ''; }

// ─────────────────────────── tela ───────────────────────────
TELAS.tarefas = async function () {
  E.tf = E.tf || { vista: 'lista', atalho: '', resp: '', pri: '', busca: '', mes: hojeISO().slice(0, 7) };
  const F = E.tf;
  // abas: o painel mostra só o que está em aberto; concluídas e excluídas ficam separadas
  F.aba = F.aba || 'abertas'; if (F.atalho === 'abertas' || F.atalho === 'concluidas') F.atalho = '';
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Tarefas</h1><p>Prazos, fluxos e acompanhamento do escritório</p></div>' +
    '<div class="acoes"><button class="btn btn-o" id="tf-modelos">Modelos de fluxo</button><button class="btn btn-o" id="tf-feriados">Feriados</button><button class="btn btn-o" id="tf-agenda" title="Prazos fatais e audiências no seu Google Agenda">📅 Google Agenda</button>' +
    '<button class="btn btn-o" id="tf-delegar" title="Delegar uma sequência de passos (ex.: lead completo) com validação">👥 Delegar</button><button class="btn btn-o" id="tf-fluxo">+ Novo fluxo</button><button class="btn btn-p" id="tf-nova">+ Nova tarefa</button></div></div>' +
    '<div class="tf-rapida"><input id="tf-rapida" autocomplete="off" placeholder="⚡ Criação rápida: “Protocolar defesa amanhã @Emanuelle !alta” e Enter" aria-label="Criação rápida de tarefa">' +
      '<div id="tf-rapida-prev" class="tf-rapida-prev"></div></div>' +
    // Backup 39: Em aberto / Concluídas / Excluídas no mesmo estilo de Lista / Minha semana / Quadro
    '<div class="segmento tf-abas-seg" id="tf-abas">' + [['abertas', 'Em aberto'], ['concluidas', 'Concluídas'], ['excluidas', 'Excluídas']]
      .map(([v, r]) => '<button data-aba="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<div class="filtros">' +
    '<div class="segmento" id="tf-vista">' + [['lista', 'Lista'], ['semana', 'Minha semana'], ['kanban', 'Quadro'], ['calendario', 'Calendário'], ['fluxos', 'Fluxos'], ['relatorio', 'Relatório']]
      .map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<div class="segmento" id="tf-atalho">' + [['', 'Todas'], ['minhas', 'Minhas'], ['hoje', 'Hoje'], ['atrasadas', 'Atrasadas'], ['7', '7 dias']].concat(F.atalho === 'atencao' ? [['atencao', 'Pedem atenção']] : [])
      .map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<select class="busca sel" id="tf-resp"><option value="">Todas as pessoas</option>' + Object.keys(PESSOA).map((p) => '<option>' + p + '</option>').join('') + '</select>' +
    '<select class="busca sel" id="tf-pri"><option value="">Todas as prioridades</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select>' +
    '<input class="busca" id="tf-busca" placeholder="Buscar tarefa, cliente, processo ou etiqueta" autocomplete="off">' +
    '</div><div id="tf-corpo"><div class="carregando">Carregando…</div></div>';
  $('tf-nova').onclick = () => formTarefa({}, () => TELAS.tarefas());
  ligarCriacaoRapida();
  $('tf-fluxo').onclick = () => formNovoFluxo(() => TELAS.tarefas());
  $('tf-modelos').onclick = () => janelaModelos();
  $('tf-delegar').onclick = () => janelaDelegar({}, () => TELAS.tarefas());
  $('tf-feriados').onclick = () => janelaFeriados();
  $('tf-agenda').onclick = () => janelaAgenda();
  $('tf-vista').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.vista = b.dataset.v; pintarTarefas(); } };
  $('tf-abas').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.aba = b.dataset.aba; pintarTarefas(); } };
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
    if (F.aba === 'concluidas') { if (t.status !== 'concluida') return false; }
    else if (F.aba === 'excluidas') { if (t.status !== 'cancelada' || String(t.atualizado_em || '') < somarDias(hojeISO(), -90)) return false; }   // mais de 90 dias: só no histórico
    else if (tarefaFechada(t)) return false;
    const a = F.aba === 'abertas' ? F.atalho : '';
    if (a === 'minhas' && (tarefaFechada(t) || !ehMinha(t))) return false;
    if (a === 'hoje' && (tarefaFechada(t) || !t.prazo || t.prazo > h)) return false;
    if (a === 'atrasadas' && (tarefaFechada(t) || !t.prazo || t.prazo >= h)) return false;
    if (a === '7' && (tarefaFechada(t) || !t.prazo || t.prazo > somarDias(h, 7))) return false;
    // "pedem atenção" (destaque do Início): minhas atrasadas ou com prazo fatal em até 7 dias
    if (a === 'atencao' && (tarefaFechada(t) || !ehMinha(t) || !((t.prazo && t.prazo < h) || (t.prazo_fatal && t.prazo_fatal <= somarDias(h, 7))))) return false;
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
  document.querySelectorAll('#tf-abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === F.aba));
  $('tf-atalho').style.display = F.vista === 'fluxos' || F.vista === 'relatorio' || F.aba !== 'abertas' ? 'none' : '';
  const todas = E._tarefas || [];
  const abertas = todas.filter((t) => !tarefaFechada(t));
  const atrasadas = abertas.filter((t) => t.prazo && t.prazo < h).length;
  const fatais = abertas.filter((t) => t.prazo_fatal && t.prazo_fatal >= h && t.prazo_fatal <= somarDias(h, 7)).length;
  const minhas = abertas.filter(ehMinha).length;
  const kpis = '<div class="kpis">' + kpi('Em aberto', String(abertas.length), '', minhas + ' comigo') +
    kpi('Atrasadas', String(atrasadas), atrasadas ? 'vermelho' : 'verde', 'todas as pessoas') +
    kpi('Prazos fatais em 7 dias', String(fatais), fatais ? 'ambar' : '', 'tarefas com prazo fatal marcado') +
    kpi('Concluídas no mês', String(todas.filter((t) => t.status === 'concluida' && String(t.concluida_em || '').slice(0, 7) === h.slice(0, 7)).length), 'verde', '') + '</div>';
  const V = { lista: vistaLista, semana: vistaSemana, kanban: vistaKanban, calendario: vistaCalendario, fluxos: vistaFluxos, relatorio: vistaRelatorio };
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
  raiz.querySelectorAll('[data-restaurar-t]').forEach((bt) => bt.onclick = (ev) => { ev.stopPropagation(); comBotao(bt, async () => {
    await q(sb.from('tarefas').update({ status: 'pendente' }).eq('id', bt.dataset.restaurarT)); aviso('✓ Tarefa restaurada (voltou para Em aberto).'); await recarregarTarefas();
  }); });
  raiz.querySelectorAll('[data-apagar-t]').forEach((bt) => bt.onclick = (ev) => { ev.stopPropagation(); comBotao(bt, async () => {
    if (!confirm('Excluir de vez? Esta ação não pode ser desfeita.')) return;
    await excluir('tarefas', bt.dataset.apagarT); aviso('Tarefa excluída de vez.'); await recarregarTarefas();
  }); });
  raiz.querySelectorAll('[data-editar-t]').forEach((bt) => bt.onclick = (ev) => { ev.stopPropagation();
    formTarefa(E._tarefas.find((t) => t.id === bt.dataset.editarT), recarregarTarefas); });
  raiz.querySelectorAll('[data-abrir-t]').forEach((tr) => tr.onclick = () => abrirTarefa(E._tarefas.find((t) => t.id === tr.dataset.abrirT), recarregarTarefas));
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
    // Backup 23: Grupo · Tarefa · Pessoa · Prioridade · Status · Prazo
    const cli = t.cliente_id ? (E.clientes || []).find((c) => c.id === t.cliente_id) : null;
    const grupo = nomeGrupo(t.grupo_id || (cli && cli.grupo_id)) || '';
    const sub = [pai ? 'parte de: ' + pai : '', cli ? nomeCliente(t.cliente_id) : '', t.processos_vinculados, t.etiquetas].filter(Boolean).join(' · ');
    return '<tr class="clicavel' + (tarefaFechada(t) ? ' tf-feita' : '') + '" data-abrir-t="' + t.id + '"><td>' + (grupo ? esc(grupo) : '<span class="sub">—</span>') + '</td>' +
      '<td style="padding-left:' + (12 + nivel * 22) + 'px">' + bolinha(t) + ' ' + (nivel ? '<span class="sub">↳ </span>' : '') + esc(t.titulo) + seloFatal(t) +
      (t.recorrencia ? ' <span class="pill neutro" title="Repete">↻ ' + esc(t.recorrencia) + '</span>' : '') + ' ' + barraProgresso(progresso(t, filhas)) +
      (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</td>' +
      '<td>' + pillPessoa(t.responsavel) + '</td><td><span class="pill ' + pr[1] + '">' + esc(pr[0]) + '</span></td><td>' + esc(STATUS_TAREFA[t.status] || t.status) + '</td>' +
      '<td class="mono" data-ord="' + esc(t.prazo || '9999') + '">' + dataBR(t.prazo) + seloPrazo(t) + '</td>' +
      '<td class="acoes-l">' + (t.status === 'cancelada'
        ? '<button class="btn btn-o btn-mini" data-restaurar-t="' + t.id + '">↩ Restaurar</button>' + ((E.perfil || {}).papel === 'admin' ? ' <button class="btn btn-x btn-mini" data-apagar-t="' + t.id + '">Excluir de vez</button>' : '')
        : (tarefaFechada(t) ? '' : '<button class="btn btn-v btn-mini" data-concluir="' + t.id + '">✓ Concluir</button>')) + '</td></tr>' +   // Backup 39: sem ✎ (editar fica no detalhe)
      filhas.filter((f) => ids.has(f.id)).map((f) => linha(f, nivel + 1)).join('');
  };
  alvo.innerHTML = '<div class="card">' + (raizes.length ? '<div class="tabela-wrap"><table><thead><tr><th>Grupo</th><th>Tarefa</th><th>Pessoa</th><th>Prioridade</th><th>Status</th><th data-tipo="data">Prazo</th><th class="sem-ordem"></th></tr></thead><tbody>' +
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
        '<div class="sub">' + esc(quemTarefa(t) || '') + '</div>' +
        '<div class="kb-rod">' + pillPessoa(t.responsavel) + (t.prazo ? ' <span class="sub mono">' + dataBR(t.prazo) + '</span>' : '') + seloPrazo(t) + seloFatal(t) + '</div>' +
        barraProgresso(progresso(t, (E._tarefas || []).filter((x) => x.tarefa_pai_id === t.id))) + '</div>').join('') +
      '</div>';
  }).join('') + '</div><p class="sub" style="margin-top:8px">Arraste um cartão para outra coluna para mudar o status. Clique para abrir.</p>';
  let arrastando = null;
  alvo.querySelectorAll('.kb-card').forEach((c) => {
    c.addEventListener('dragstart', (ev) => { arrastando = c.dataset.id; ev.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('arrastando'); });
    c.addEventListener('dragend', () => c.classList.remove('arrastando'));
    c.onclick = () => abrirTarefa(E._tarefas.find((t) => t.id === c.dataset.id), recarregarTarefas);
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
  // Backup 39: o MESMO calendário do Início (quadro Atrasadas, cores da legenda, sem cinza depois do último dia); clicar abre o detalhe
  const F = E.tf; await feriados();
  const salvo = { vista: FILA.vista, ref: FILA.ref };
  FILA.vista = 'mes'; FILA.ref = F.mes + '-01';
  const lista = filtrarTarefas();
  alvo.innerHTML = '<div class="card ini-fila tf-cal"><div class="card-bd">' + calendarioFila(lista) + '</div></div>';
  FILA.vista = salvo.vista; FILA.ref = salvo.ref;
  const [a, m] = F.mes.split('-').map(Number);
  alvo.querySelectorAll('[data-fila-nav]').forEach((b) => b.onclick = () => {
    const n = +b.dataset.filaNav, d = n ? new Date(a, m - 1 + n, 1) : new Date();
    F.mes = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); pintarTarefas(); });
  alvo.querySelectorAll('[data-fila]').forEach((d) => d.onclick = () => abrirTarefa(E._tarefas.find((t) => t.id === d.dataset.fila), recarregarTarefas));
  alvo.querySelectorAll('[data-agendar]').forEach((b) => b.onclick = () => janelaAgendar(hojeISO(), recarregarTarefas));
  alvo.querySelectorAll('[data-ag-dia]').forEach((d) => d.addEventListener('click', (ev) => { if (ev.target.closest('[data-fila]')) return; janelaAgendar(d.dataset.agDia, recarregarTarefas); }));
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
  const ts = E._tarefas || [], h = hojeISO(), mes = E.tf.mesRel || h.slice(0, 7);
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
  // por cliente no mês: concluídas no prazo × com atraso; e as abertas atrasadas
  const porCli = {};
  ts.forEach((t) => { const k = quemTarefa(t); if (!k) return; const c = porCli[k] = porCli[k] || { concl: 0, noPrazo: 0, atrasoConcl: 0, abertasAtr: 0 };
    if (t.status === 'concluida' && String(t.concluida_em || '').slice(0, 7) === mes) { c.concl++; if (!t.prazo || String(t.concluida_em).slice(0, 10) <= t.prazo) c.noPrazo++; else c.atrasoConcl++; }
    if (!tarefaFechada(t) && t.prazo && t.prazo < h) c.abertasAtr++; });
  const cliLinhas = Object.entries(porCli).filter(([, c]) => c.concl || c.abertasAtr).sort((a, b) => b[1].abertasAtr - a[1].abertasAtr || b[1].concl - a[1].concl);
  // carga da semana: horas estimadas (abertas com prazo até sexta) × horas disponíveis de cada pessoa
  const sexta = somarDias(h, (5 - new Date(h + 'T12:00:00').getDay() + 7) % 7), cap = E._cargaHoras || {};
  const carga = pessoasEscritorio().map((p) => { const d = ts.filter((t) => !tarefaFechada(t) && primeiroNome(t.responsavel) === primeiroNome(p) && t.prazo && t.prazo <= sexta);
    return { p, n: d.length, horas: soma(d, (t) => t.estimativa_horas), cap: Number(cap[primeiroNome(p)] || 40) }; }).filter((c) => c.n);
  const meses = [...Array(12)].map((_, i) => { const d = new Date(h + 'T12:00:00'); d.setDate(1); d.setMonth(d.getMonth() - i); return iso(d).slice(0, 7); });
  alvo.innerHTML = '<div class="filtros" style="margin-bottom:10px"><label class="sub">Mês do relatório <select class="busca sel" id="tf-mes-rel">' + meses.map((m) => '<option value="' + m + '"' + (m === mes ? ' selected' : '') + '>' + nomeMes(new Date(m + '-01T12:00:00')) + '</option>').join('') + '</select></label></div>' +
    '<div class="kpis">' + kpi('Tempo médio de conclusão', medio == null ? '—' : String(Math.round(medio * 10) / 10).replace('.', ',') + ' dia(s)', '', concl.length + ' concluída(s)') +
    kpi('Prazos fatais cumpridos', fatConcl.length ? Math.round(fatOk / fatConcl.length * 100) + '%' : '—', fatConcl.length && fatOk < fatConcl.length ? 'vermelho' : 'verde', fatOk + ' de ' + fatConcl.length + ' · meta 100%') + '</div>' +
    '<div class="card"><div class="card-hd">Por pessoa <button class="btn btn-o btn-mini" id="tf-csv">Baixar planilha (CSV)</button></div>' +
    '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Pessoa</th><th data-tipo="num">Abertas</th><th data-tipo="num">Atrasadas</th><th data-tipo="num">Concluídas no mês</th><th data-tipo="num">% no prazo</th><th data-tipo="num">Horas estimadas (abertas)</th><th data-tipo="num">Horas gastas no mês</th></tr></thead><tbody>' +
    (linhas.map((l) => '<tr><td>' + pillPessoa(l.p) + '</td><td class="mono">' + l.abertas + '</td><td class="mono">' + (l.atrasadas ? '<b style="color:var(--red)">' + l.atrasadas + '</b>' : '0') + '</td>' +
      '<td class="mono">' + l.concl + '</td><td class="mono">' + (l.noPrazo == null ? '—' : l.noPrazo + '%') + '</td><td class="mono">' + (l.horas ? String(l.horas).replace('.', ',') : '—') + '</td><td class="mono" data-gasto="' + esc(l.p) + '">—</td></tr>').join('') ||
      '<tr><td colspan="7" class="sub">Nenhuma tarefa.</td></tr>') + '</tbody></table></div></div>' +
    '<div class="card"><div class="card-hd">Por cliente — ' + esc(nomeMes(new Date(mes + '-01T12:00:00'))) + '</div>' + (cliLinhas.length ? '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Cliente / grupo</th>' +
      '<th data-tipo="num">Concluídas</th><th data-tipo="num">No prazo</th><th data-tipo="num">Com atraso</th><th data-tipo="num">Abertas atrasadas hoje</th></tr></thead><tbody>' +
      cliLinhas.map(([k, c]) => '<tr><td><b>' + esc(k) + '</b></td><td class="mono">' + c.concl + '</td><td class="mono">' + c.noPrazo + '</td><td class="mono">' + (c.atrasoConcl ? '<b style="color:var(--red)">' + c.atrasoConcl + '</b>' : '0') + '</td>' +
        '<td class="mono">' + (c.abertasAtr ? '<b style="color:var(--red)">' + c.abertasAtr + '</b>' : '0') + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="vazio">Nada no mês.</div>') + '</div>' +
    '<div class="card"><div class="card-hd">⚖ Carga da semana (até ' + dataBR(sexta).slice(0, 5) + ')' + ((E.perfil || {}).papel === 'admin' ? ' <button class="btn btn-o btn-mini" id="tf-cap">Horas disponíveis</button>' : '') + '</div>' +
      (carga.length ? '<div class="card-bd">' + carga.map((c) => { const pc = c.cap ? Math.min(100, Math.round(c.horas / c.cap * 100)) : 0;
        return '<div class="carga-lin"><div class="carga-nome">' + pillPessoa(c.p) + '</div><div class="carga-bar"><div class="carga-in' + (c.horas > c.cap ? ' acima' : pc > 80 ? ' alta' : '') + '" style="width:' + pc + '%"></div></div>' +
          '<div class="carga-num mono">' + String(c.horas).replace('.', ',') + ' / ' + c.cap + ' h · ' + c.n + ' tarefa(s)</div></div>'; }).join('') +
        '<p class="sub">Horas estimadas das tarefas abertas com prazo até sexta × horas disponíveis na semana. Tarefa sem estimativa conta 0 h — preencha "Estimativa (h)" para a carga ficar fiel.</p></div>'
        : '<div class="vazio">Ninguém com tarefa para esta semana.</div>') + '</div>' +
    '<div class="card"><div class="card-hd">Prazos fatais nos próximos 30 dias (e vencidos)</div>' +
    (fatais.length ? '<div class="tabela-wrap"><table><thead><tr><th>Prazo fatal</th><th>Tarefa</th><th>Cliente / grupo</th><th>Pessoa</th><th>Status</th></tr></thead><tbody>' +
      fatais.map((t) => '<tr class="clicavel" data-editar-t="' + t.id + '"><td class="mono">' + dataBR(t.prazo_fatal) + (t.prazo_fatal < h ? ' <span class="pill vencido">vencido</span>' : '') + '</td><td><b>' + esc(t.titulo) + '</b></td>' +
        '<td>' + esc(quemTarefa(t) || '—') + '</td><td>' + pillPessoa(t.responsavel) + '</td><td>' + esc(STATUS_TAREFA[t.status] || t.status) + '</td></tr>').join('') +
      '</tbody></table></div>' : '<div class="vazio">Nenhum prazo fatal nos próximos 30 dias.</div>') + '</div>';
  ligarLinhasTarefa(alvo);
  horasGastasPorPessoa(alvo).catch(() => {});
  $('tf-mes-rel').onchange = (ev) => { E.tf.mesRel = ev.target.value; vistaRelatorio(alvo); };
  if (!E._cargaHoras) q(sb.from('configuracoes').select('valor').eq('chave', 'carga_horas').maybeSingle()).then((r) => { E._cargaHoras = (r && r.valor) || {}; if (carga.length) vistaRelatorio(alvo); }).catch(() => { E._cargaHoras = {}; });
  const bc = $('tf-cap'); if (bc) bc.onclick = () => {
    const k = abrirJanela({ titulo: 'Horas disponíveis por semana',
      corpo: '<div class="grade">' + pessoasEscritorio().map((p) => campo(esc(p), '<input type="number" min="0" max="80" data-cap="' + esc(primeiroNome(p)) + '" value="' + (cap[primeiroNome(p)] || 40) + '">')).join('') + '</div>' +
        '<p class="sub">Ex.: estagiário de meio período = 20.</p>', rodape: '<span></span><button class="btn btn-p" type="button" id="cap-ok">Salvar</button>' });
    k.querySelector('#cap-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
      const v = {}; k.querySelectorAll('[data-cap]').forEach((i) => { v[i.dataset.cap] = Math.max(0, parseInt(i.value, 10) || 0); });
      await q(sb.from('configuracoes').upsert({ chave: 'carga_horas', valor: v }, { onConflict: 'chave' })); E._cargaHoras = v;
      aviso('✓ Horas salvas.'); fecharJanela(k); vistaRelatorio(alvo);
    });
  };
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
// Abrir tarefa = ficha de leitura (o que é, prazos, quem, origem). As ações ficam no rodapé:
// Concluir · Encaminhar · + Subtarefa · Editar (o formulário completo).
const ORIGEM_REGRA = { onb: 'Automação: contrato novo (onboarding)', proc: 'Automação: processo novo', cert: 'Automação: certidão vencendo', doc: 'Automação: documento vencendo',
  parc: 'Automação: parcela de parcelamento', aco: 'Automação: parcela de acordo', cob: 'Automação: cobrança de honorário', anexo: 'Automação: contrato sem anexo',
  procur: 'Automação: processo sem procuração', pub: 'Automação: publicação', esc: 'Automação: escalada de atraso',
  reuniao: 'Reunião agendada', deleg: 'Delegação (sequência de passos)', 'crm-contrato': 'CRM: contrato fechado' };
async function abrirTarefa(t, depois) {
  if (!t) return;
  if (typeof t === 'string') t = (await q(sb.from('tarefas').select('*').eq('id', t)))[0];
  if (!t) return aviso('Tarefa não encontrada (pode ter sido excluída).', true);
  await equipe().catch(() => []);
  const [subs, coms] = await Promise.all([q(sb.from('tarefas').select('*').eq('tarefa_pai_id', t.id).order('prazo', { nullsFirst: false })).catch(() => []),
    q(sb.from('comentarios').select('texto, criado_em').eq('tarefa_id', t.id).order('criado_em', { ascending: false }).limit(8)).catch(() => [])]);
  const souRevisor = t.status === 'revisao' && (E.perfil.papel === 'admin' || (t.revisor && primeiroNome(t.revisor) === primeiroNome(E.perfil.nome || '')));
  const pr = PRIORIDADE[t.prioridade] || [t.prioridade || '—', 'neutro'];
  const ck = Array.isArray(t.checklist) ? t.checklist : [];
  const origem = t.chave_regra ? (ORIGEM_REGRA[String(t.chave_regra).split(':')[0]] || 'Automação') : t.fluxo_id ? 'Fluxo de trabalho' : 'Criada à mão';
  const linha = (rot, val) => val ? '<div class="tf-lin"><span>' + rot + '</span><div>' + val + '</div></div>' : '';
  const fechada = tarefaFechada(t);
  const j = abrirJanela({ titulo: 'Tarefa', larga: true,
    corpo: '<div class="tf-ficha">' +
      '<div class="tf-ficha-hd"><h3>' + bolinha(t) + ' ' + esc(t.titulo) + '</h3><div class="tf-selos"><span class="pill ' + (fechada ? 'pago' : t.status === 'revisao' ? 'hoje' : 'neutro') + '">' +
        esc(STATUS_TAREFA[t.status] || t.status) + '</span> <span class="pill ' + pr[1] + '">' + esc(pr[0]) + '</span>' + seloPrazo(t) + seloFatal(t) + '</div></div>' +
      '<div class="tf-grade">' +
        linha('Prazo', t.prazo ? dataBR(t.prazo) : '<span class="sub">sem prazo</span>') +
        linha('Prazo fatal', t.prazo_fatal ? '<b>' + dataBR(t.prazo_fatal) + '</b>' : '') +
        linha('Cliente', esc(quemTarefa(t) || '')) +
        linha('Responsável', pillPessoa(t.responsavel)) +
        linha('Participantes', String(t.participantes || '').split(',').map((x) => x.trim()).filter(Boolean).map(pillPessoa).join(' ')) +
        linha('Revisor', t.exige_revisao || t.revisor ? pillPessoa(t.revisor) : '') +
        linha('Processos', esc(t.processos_vinculados || '')) +
        linha('Origem', esc(origem)) +
        linha('Repete', t.recorrencia ? esc(t.recorrencia) : '') +
      '</div>' +
      (t.descricao ? '<div class="tf-bloco"><div class="secao">O que fazer</div><div class="tf-texto">' + esc(t.descricao).replace(/\n/g, '<br>') + '</div></div>' : '') +
      (t.obs ? '<div class="tf-bloco"><div class="secao">Observação</div><div class="tf-texto">' + esc(t.obs).replace(/\n/g, '<br>') + '</div></div>' : '') +
      (ck.length ? '<div class="tf-bloco"><div class="secao">Checklist · ' + ck.filter((c) => c.feito).length + '/' + ck.length + '</div>' +
        ck.map((c) => '<div class="tf-ck' + (c.feito ? ' feito' : '') + '">' + (c.feito ? '☑' : '☐') + ' ' + esc(c.texto) + '</div>').join('') + '</div>' : '') +
      (subs.length ? '<div class="tf-bloco"><div class="secao">Subtarefas</div><div class="lista-ficha">' + subs.map((x) => '<div class="item-ficha clicavel' + (tarefaFechada(x) ? ' feita' : '') + '" data-ficha-sub="' + x.id + '"><div><b>' + esc(x.titulo) + '</b> ' + seloPrazo(x) +
        '<div class="sub">' + (x.prazo ? 'até ' + dataBR(x.prazo) : 'sem prazo') + ' · ' + esc(x.responsavel || '—') + ' · ' + esc(STATUS_TAREFA[x.status]) + '</div></div></div>').join('') + '</div></div>' : '') +
      (coms.length ? '<div class="tf-bloco"><div class="secao">Comentários</div>' + coms.map((c) => '<div class="tf-com"><span class="sub">' + dataHoraBR(c.criado_em) + '</span> ' + esc(c.texto) + '</div>').join('') + '</div>' : '') +
      (t.status === 'aguardando' && t.depende_de ? '<div class="dica" style="margin-top:10px">⏳ Este passo começa quando o anterior for concluído' + (t.exige_revisao ? '' : ' (e aprovado, se precisar de validação)') + '.</div>' : '') +
      '</div>',
    rodape: '<button class="btn btn-o" type="button" id="tf-f-editar">✎ Editar</button><div class="acoes">' +
      (fechada ? '' : (t.recorrencia && t.prazo ? '<button class="btn btn-o" type="button" id="tf-f-pular" title="Esta vez não precisa: a tarefa passa para a próxima data">⏭ Pular esta vez</button>' : '') +
        '<button class="btn btn-o" type="button" id="tf-f-sub">+ Subtarefa</button><button class="btn btn-o" type="button" id="tf-f-enc">↪ Encaminhar</button>' +
        (souRevisor ? '<button class="btn btn-x" type="button" id="tf-f-devolver">↩ Devolver</button><button class="btn btn-v" type="button" id="tf-f-aprovar">✓ Aprovar</button>'
          : '<button class="btn btn-v" type="button" id="tf-f-ok">✓ Concluir</button>')) + '</div>' });
  const bAp = j.querySelector('#tf-f-aprovar'), bDv = j.querySelector('#tf-f-devolver');
  if (bAp) bAp.onclick = () => comBotao(bAp, async () => { await q(sb.rpc('tarefa_validar', { p_tarefa: t.id, p_aprovar: true, p_comentario: '' })); aviso('✓ Aprovado: o próximo passo foi liberado.'); fecharJanela(j); await (depois || recarregar)(); });
  if (bDv) bDv.onclick = () => janelaDevolver(t, async () => { fecharJanela(j); await (depois || recarregar)(); });
  const depois2 = async () => { await (depois || recarregar)(); };
  j.querySelector('#tf-f-editar').onclick = () => { fecharJanela(j); formTarefa(t, depois); };
  j.querySelectorAll('[data-ficha-sub]').forEach((d) => d.onclick = () => { fecharJanela(j); abrirTarefa(subs.find((x) => x.id === d.dataset.fichaSub), depois); });
  const bp = j.querySelector('#tf-f-pular');
  if (bp) bp.onclick = () => comBotao(bp, async () => {
    const mais = (d) => { if (!d) return null; const x = new Date(d + 'T12:00:00');
      if (t.recorrencia === 'semanal') x.setDate(x.getDate() + 7); else if (t.recorrencia === 'mensal') x.setMonth(x.getMonth() + 1); else x.setFullYear(x.getFullYear() + 1); return iso(x); };
    const d = { prazo: mais(t.prazo), prazo_fatal: mais(t.prazo_fatal), checklist: (Array.isArray(t.checklist) ? t.checklist : []).map((c) => ({ texto: c.texto, feito: false })) };
    await q(sb.from('tarefas').update(d).eq('id', t.id));
    await sb.from('comentarios').insert({ tarefa_id: t.id, texto: '⏭ Pulada a ocorrência de ' + dataBR(t.prazo) }).then(() => {}, () => {});
    aviso('⏭ Pulada. Próxima em ' + dataBR(d.prazo) + '.'); fecharJanela(j); await depois2();
  });
  const bs = j.querySelector('#tf-f-sub');
  if (bs) bs.onclick = () => { fecharJanela(j); formTarefa({ tarefa_pai_id: t.id, fluxo_id: t.fluxo_id, cliente_id: t.cliente_id, grupo_id: t.grupo_id, responsavel: t.responsavel, prazo: t.prazo }, depois); };
  const bo = j.querySelector('#tf-f-ok');
  if (bo) bo.onclick = () => comBotao(bo, async () => {
    if (ck.some((c) => !c.feito)) { fecharJanela(j); formTarefa(t, depois); return aviso('Marque os itens do checklist para concluir.', true); }
    if (t.exige_revisao && t.status !== 'revisao') { await q(sb.from('tarefas').update({ status: 'revisao' }).eq('id', t.id)); aviso('✓ Enviada para revisão de ' + (t.revisor || 'quem revisa') + '.'); }
    else { await validarDependencia(t, 'concluida'); await concluirTarefa(t.id); aviso('✓ Tarefa concluída.'); }
    fecharJanela(j); await depois2();
  });
  const be = j.querySelector('#tf-f-enc');
  if (be) be.onclick = () => {
    const k = abrirJanela({ titulo: 'Encaminhar tarefa', corpo: '<div class="grade">' + campo('Para quem', selectPessoa('para', '', '— escolha —'), 'inteiro') +
        campo('Recado (opcional, vai como comentário)', '<textarea name="recado" maxlength="1000" placeholder="Ex.: falta só protocolar"></textarea>', 'inteiro') + '</div>',
      rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Voltar</button><button class="btn btn-p" type="button" id="tf-enc-ok">Encaminhar</button></div>' });
    k.querySelector('[data-cancelar]').onclick = () => fecharJanela(k);
    k.querySelector('#tf-enc-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
      const para = k.querySelector('[name=para]').value, recado = k.querySelector('[name=recado]').value.trim();
      if (!para) throw new Error('Escolha para quem encaminhar.');
      await q(sb.from('tarefas').update({ responsavel: para }).eq('id', t.id));
      if (recado) await sb.from('comentarios').insert({ tarefa_id: t.id, texto: '↪ Encaminhada para ' + para + ': ' + recado }).then(() => {}, () => {});
      await notificar(para, 'Tarefa encaminhada para você: ' + t.titulo, recado || (t.prazo ? 'Prazo ' + dataBR(t.prazo) : ''), 'tarefas').catch(() => {});
      aviso('✓ Tarefa encaminhada para ' + para + '.'); fecharJanela(k); fecharJanela(j); await depois2();
    });
  };
  return j;
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
      campo('Pessoa responsável', selectPessoa('responsavel', t.responsavel, '— escolha —')) +
      '<div class="campo inteiro"><span>Participantes</span>' + campoParticipantes(t.participantes) + '</div>' +
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
      campo('Revisor (quem revisa)', selectPessoa('revisor', t.revisor, '— sem revisor —')) +
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
      participantes: lerParticipantes(j), prazo: f.prazo.value || null, prazo_fatal: f.prazo_fatal.value || null, inicio: f.inicio.value || null,
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
    if (!confirm('Excluir esta tarefa' + ((E._tarefas || []).some((x) => x.tarefa_pai_id === t.id) ? ' e as subtarefas dela' : '') + '? Ela vai para a aba "Excluídas" (dá para restaurar).')) return;
    // exclusão "suave": vira cancelada e vai para a aba Excluídas (subtarefas abertas junto)
    await q(sb.from('tarefas').update({ status: 'cancelada' }).eq('id', t.id));
    await q(sb.from('tarefas').update({ status: 'cancelada' }).eq('tarefa_pai_id', t.id).not('status', 'in', '(concluida,cancelada)'));
    aviso('Tarefa movida para "Excluídas".'); fecharJanela(j); await aposSalvar();
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
  alvo.querySelectorAll('[data-sub-ed]').forEach((b) => b.onclick = () => abrirTarefa(subs.find((s) => s.id === b.dataset.subEd), repinta));
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
// (a antiga janela de regras virou a tela Automações — telas-automacoes.js)
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
      campo('Pessoa responsável', selectPessoa('responsavel', '', '— escolha —')) +
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

// ─────────────────────────── caixa de avisos (sino) ───────────────────────────
// Funciona como caixa de mensagens: cada aviso tem um ASSUNTO (chave) e uma LEVA.
//  • Ler = some da caixa (tabela avisos_lidos, por pessoa).
//  • Se o assunto não for resolvido, a próxima leva volta como não lida:
//    urgentes (vermelho) todo dia; os demais uma vez por semana.
//  • Notificações gravadas (tarefa atribuída, menção, rascunho…) são lidas uma vez só.
function levaDoAviso(nivel) {
  const h = hojeISO();
  if (nivel === 'alto') return h;
  const d = new Date(h + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));   // segunda-feira da semana
  return 's' + iso(d);
}
async function coletarAlertas() {
  const h = hojeISO(), lim = somarDias(h, 2);
  // Backup 27: aviso é só o que NÃO aparece no Início nem nas Tarefas. Saíram: publicações novas, tarefas (atribuída, atrasada, prazo),
  // honorários/acordos/parcelamentos que vencem hoje. Ficam: CRM com o próximo passo chegando, certidões, aprovações, menções, acessos.
  const [nots, ops, certs, lidos] = await Promise.all([
    q(sb.from('notificacoes').select('*').eq('lida', false).not('tipo', 'in', '(publicacao,tarefa,atraso,prazo)').order('criado_em', { ascending: false }).limit(50)).catch(() => []),
    pode('crm') ? q(sb.from('crm_oportunidades').select('id, titulo, responsavel, proxima_acao, proxima_acao_em, crm_etapas(final)').not('proxima_acao_em', 'is', null).lte('proxima_acao_em', lim)).catch(() => []) : [],
    q(sb.from('certidoes').select('id, orgao, validade, cliente_id').not('validade', 'is', null).lte('validade', somarDias(h, 15))).catch(() => []),
    q(sb.from('avisos_lidos').select('chave').gte('lido_em', new Date(Date.now() - 21 * 864e5).toISOString())).catch(() => [])
  ]);
  const al = nots.map((n) => ({ nivel: n.tipo === 'rascunho' ? 'medio' : 'info', tipo: n.tipo || 'aviso', titulo: n.titulo, detalhe: n.detalhe, notif: n.id, link: n.link, quando: n.criado_em }));
  const add = (a) => { a.chave = a.assunto + '@' + levaDoAviso(a.nivel); al.push(a); };
  const eu = primeiroNome((E.perfil && E.perfil.nome) || '');
  ops.filter((o) => !(o.crm_etapas && o.crm_etapas.final) && (!o.responsavel || primeiroNome(o.responsavel) === eu)).forEach((o) => {
    const d = diasAte(o.proxima_acao_em);
    add({ nivel: d <= 0 ? 'alto' : 'medio', tipo: 'crm', assunto: 'crm:' + o.id + ':' + o.proxima_acao_em,
      titulo: 'CRM — ' + (d < 0 ? 'passou do prazo' : d === 0 ? 'hoje' : 'em ' + plural(d, 'dia', 'dias')) + ': ' + (o.proxima_acao || 'próximo passo'),
      detalhe: o.titulo + ' · ' + dataBR(o.proxima_acao_em), tela: 'crm' });
  });
  certs.forEach((x) => add({ nivel: x.validade < h ? 'alto' : 'medio', tipo: 'certidao', assunto: 'cert:' + x.id, titulo: 'Certidão ' + x.orgao + ' ' + (x.validade < h ? 'vencida' : 'vencendo'), detalhe: dataBR(x.validade) + ' · ' + nomeCliente(x.cliente_id), cliente: x.cliente_id }));
  const lidas = new Set(lidos.map((x) => x.chave));
  al.forEach((a) => { a.lido = !!(a.chave && lidas.has(a.chave)); });
  const ordem = { alto: 0, medio: 1, info: 2 };
  return al.sort((a, b) => (a.lido - b.lido) || (ordem[a.nivel] - ordem[b.nivel]));
}
const ICONE_AVISO = { crm: '🎯', prazo: '⏰', equipe: '👥', documento: '📄', certidao: '📜', financeiro: '💰', acordo: '🤝', rascunho: '📝', publicacao: '⚖', mencao: '💬', revisao: '🔎', acesso: '🔐', tarefa: '✅', cnpj: '🏢' };
async function marcarAvisosLidos(lista) {
  const nots = lista.filter((a) => a.notif).map((a) => a.notif), chaves = lista.filter((a) => a.chave).map((a) => ({ chave: a.chave }));
  if (nots.length) await q(sb.from('notificacoes').update({ lida: true }).in('id', nots));
  if (chaves.length) await q(sb.from('avisos_lidos').upsert(chaves, { onConflict: 'usuario_id,chave', ignoreDuplicates: true }));
}
async function abrirAlertas(ancora, aoMudar) {
  if (!E.clientes.length) await carregarCadastros();
  const todos = await coletarAlertas();
  let aba = 'novos';
  const j = abrirJanela({ titulo: '🔔 Avisos', larga: true, corpo: '<div id="cx-avisos"></div>',
    rodape: '<span class="sub">Lido some da caixa. Se o assunto não for resolvido, volta na próxima leva (urgentes: amanhã; demais: semana que vem).</span><button class="btn btn-o" type="button" id="al-todas">✓ Marcar todos como lidos</button>' });
  j.querySelector('.janela').classList.add('cx-janela');
  const pintar = () => {
    const novos = todos.filter((a) => !a.lido), lidos = todos.filter((a) => a.lido), lista = aba === 'novos' ? novos : lidos;
    j.querySelector('#cx-avisos').innerHTML =
      '<div class="segmento cx-abas"><button data-cx="novos" class="' + (aba === 'novos' ? 'ativo' : '') + '">Não lidos (' + novos.length + ')</button><button data-cx="lidos" class="' + (aba === 'lidos' ? 'ativo' : '') + '">Lidos nesta leva (' + lidos.length + ')</button></div>' +
      (lista.length ? '<div class="cx-lista">' + lista.map((a) => { const i = todos.indexOf(a); return '<div class="cx-item nivel-' + a.nivel + (a.lido ? ' lido' : '') + '">' +
        '<span class="cx-ic" aria-hidden="true">' + (ICONE_AVISO[a.tipo] || '🔔') + '</span><div class="cx-txt"><b>' + esc(a.titulo) + '</b><div class="sub">' + esc(a.detalhe || '') + (a.quando ? ' · ' + quandoRodou(a.quando) : '') + '</div></div>' +
        '<div class="cx-acoes">' + (a.tarefa || a.cliente || a.tela || a.link ? '<button class="btn btn-o btn-mini" data-al-abrir="' + i + '">Abrir</button>' : '') +
        (a.lido ? '' : '<button class="btn btn-mini btn-o" data-al-lida="' + i + '" title="Marcar como lido">✓ Lido</button>') + '</div></div>'; }).join('') + '</div>'
        : '<div class="vazio">' + (aba === 'novos' ? 'Tudo lido. 🎉 Os avisos voltam se o assunto continuar pendente.' : 'Nada lido nesta leva.') + '</div>');
    j.querySelector('#al-todas').hidden = !novos.length;
    j.querySelectorAll('[data-cx]').forEach((b) => b.onclick = () => { aba = b.dataset.cx; pintar(); });
    j.querySelectorAll('[data-al-lida]').forEach((b) => b.onclick = () => comBotao(b, async () => { const a = todos[+b.dataset.alLida]; await marcarAvisosLidos([a]); a.lido = true; pintar(); if (aoMudar) aoMudar(); }));
    j.querySelectorAll('[data-al-abrir]').forEach((b) => b.onclick = () => comBotao(b, async () => {
      const a = todos[+b.dataset.alAbrir];
      if (!a.lido) { await marcarAvisosLidos([a]); a.lido = true; if (aoMudar) aoMudar(); }
      if (a.tarefa) await abrirTarefa(a.tarefa, async () => { if (aoMudar) aoMudar(); });
      else if (a.cliente) abrirFicha(a.cliente, 'documentos');
      else { fecharJanela(j); irParaTela(a.tela || a.link); }
    }));
  };
  pintar();
  j.querySelector('#al-todas').onclick = (ev) => comBotao(ev.currentTarget, async () => { const n = todos.filter((a) => !a.lido); await marcarAvisosLidos(n); n.forEach((a) => { a.lido = true; }); pintar(); if (aoMudar) aoMudar(); });
}
async function contarAlertas() {
  const al = (await coletarAlertas()).filter((a) => !a.lido);
  return { total: al.length, altos: al.filter((a) => a.nivel === 'alto').length, lista: al };
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

// ─────────── Criação rápida (Backup 16): "Protocolar defesa amanhã @Emanuelle !alta #tributário" ───────────
const DIAS_SEMANA_TF = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
function interpretarRapida(texto) {
  let t = ' ' + String(texto || '') + ' ', prazo = null, resp = '', pri = 'media';
  const h = hojeISO(), tira = (re) => { t = t.replace(re, ' '); };
  const m1 = /\s@([\wÀ-ÿ]+(?:\s[A-ZÀ-Ý][\wÀ-ÿ]+)?)/.exec(t);
  if (m1) { const alvo = primeiroNome(m1[1]), p = pessoasEscritorio().find((x) => primeiroNome(x) === alvo || normalizar(x) === normalizar(m1[1])); if (p) { resp = p; tira(m1[0]); } }
  const m2 = /\s!(alta|media|média|baixa|urgente)\b/i.exec(t);
  if (m2) { pri = /baixa/i.test(m2[1]) ? 'baixa' : /alta|urgente/i.test(m2[1]) ? 'alta' : 'media'; tira(m2[0]); }
  const etq = []; t = t.replace(/\s#([\wÀ-ÿ-]+)/g, (_, e) => { etq.push(e); return ' '; });
  const n = normalizar(t);
  let m;
  if ((m = /\s(depois de amanha)\s/.exec(n))) { prazo = somarDias(h, 2); t = t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length - 1); }
  else if ((m = /\s(amanha)\s/.exec(n))) { prazo = somarDias(h, 1); t = t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length - 1); }
  else if ((m = /\s(hoje)\s/.exec(n))) { prazo = h; t = t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length - 1); }
  else if ((m = /\s(?:em|daqui a)\s(\d{1,3})\sdias?\s/.exec(n))) { prazo = somarDias(h, +m[1]); t = t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length - 1); }
  else if ((m = /\s(?:ate |na |no )?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s/.exec(n))) {
    const ano = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : h.slice(0, 4);
    let d = ano + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); if (!m[3] && d < h) d = (+ano + 1) + d.slice(4);
    prazo = d; t = t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length - 1);
  } else if ((m = /\s(?:na |no |ate |proxima |proximo )?(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?\s/.exec(n))) {
    const alvo = DIAS_SEMANA_TF.indexOf(m[1]), hoje = new Date(h + 'T12:00:00').getDay();
    prazo = somarDias(h, ((alvo - hoje + 7) % 7) || 7); t = t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length - 1);
  }
  return { titulo: t.replace(/\s+/g, ' ').trim(), prazo, responsavel: resp, prioridade: pri, etiquetas: etq.join(', ') };
}
function ligarCriacaoRapida() {
  const inp = $('tf-rapida'), prev = $('tf-rapida-prev'); if (!inp) return;
  const mostra = () => { const r = interpretarRapida(inp.value);
    prev.innerHTML = inp.value.trim() ? '<b>' + esc(r.titulo || '—') + '</b> · ' + (r.prazo ? 'prazo ' + dataBR(r.prazo) : 'sem prazo') + ' · ' + (r.responsavel ? pillPessoa(r.responsavel) : 'você') +
      ' · <span class="pill ' + PRIORIDADE[r.prioridade][1] + '">' + PRIORIDADE[r.prioridade][0] + '</span>' + (r.etiquetas ? ' · #' + esc(r.etiquetas) : '') + ' <span class="sub">— Enter cria</span>' : ''; };
  inp.oninput = mostra;
  inp.onkeydown = (ev) => { if (ev.key !== 'Enter') return; ev.preventDefault();
    const r = interpretarRapida(inp.value); if (!r.titulo) return aviso('Escreva o que precisa ser feito.', true);
    comBotao(null, async () => {
      const resp = r.responsavel || (E.perfil && (E.perfil.nome || '').split(' ')[0]) || '';
      await q(sb.from('tarefas').insert({ titulo: r.titulo, prazo: r.prazo, responsavel: resp, prioridade: r.prioridade, etiquetas: r.etiquetas, status: 'pendente', inicio: hojeISO() }));
      if (r.responsavel && primeiroNome(r.responsavel) !== primeiroNome(meuNome())) await notificar(r.responsavel, 'Nova tarefa para você: ' + r.titulo, r.prazo ? 'Prazo ' + dataBR(r.prazo) : '', 'tarefas').catch(() => {});
      aviso('✓ Tarefa criada: ' + r.titulo + (r.prazo ? ' (prazo ' + dataBR(r.prazo) + ')' : '') + '.'); inp.value = ''; prev.innerHTML = ''; await recarregarTarefas();
    });
  };
}

// ─────────── Minha semana: segunda a sexta, arrastar para remarcar ───────────
function vistaSemana(alvo) {
  const F = E.tf, h = hojeISO();
  const base = new Date((F.semana || h) + 'T12:00:00'); base.setDate(base.getDate() - ((base.getDay() + 6) % 7));
  const seg = iso(base), dias = [0, 1, 2, 3, 4].map((i) => somarDias(seg, i)), sex = dias[4];
  const quem = F.resp || '';
  // Backup 39: respeita a aba (Em aberto / Concluídas / Excluídas) — antes "Concluídas" ainda mostrava as abertas
  const doDono = (t) => (quem ? primeiroNome(t.responsavel) === primeiroNome(quem) : ehMinha(t));
  const ts = filtrarTarefas().filter(doDono);
  const abertasAba = F.aba === 'abertas';
  const atrasadas = abertasAba ? ts.filter((t) => t.prazo && t.prazo < h).sort((a, b) => a.prazo.localeCompare(b.prazo)) : [], semData = ts.filter((t) => !t.prazo);
  const cartao = (t) => '<div class="sm-card" draggable="true" data-sm="' + t.id + '"><b>' + esc(t.titulo) + '</b>' + seloFatal(t) +
    '<div class="sub">' + esc(quemTarefa(t) || '') + (t.estimativa_horas ? ' · ' + String(t.estimativa_horas).replace('.', ',') + ' h' : '') + '</div></div>';
  const col = (rot, data, lista, cls) => '<div class="sm-col' + (cls ? ' ' + cls : '') + '" data-dia="' + (data || '') + '"><div class="sm-tit">' + rot + ' <span class="sub">' + lista.length + '</span></div>' + lista.map(cartao).join('') + '</div>';
  alvo.innerHTML = '<div class="fila-cal-nav"><button type="button" class="btn btn-o btn-mini" data-sm-nav="-7">‹</button><b>Semana de ' + dataBR(seg).slice(0, 5) + ' a ' + dataBR(sex).slice(0, 5) +
      (quem ? ' — ' + esc(quem) : ' — minhas tarefas') + '</b><button type="button" class="btn btn-o btn-mini" data-sm-nav="7">›</button><button type="button" class="btn btn-o btn-mini" data-sm-nav="0">Esta semana</button></div>' +
    // Backup 39: "Atrasadas" no MESMO quadro do Início (⏰, número em vermelho, contorno vermelho e "prazo · N dias de atraso")
    (abertasAba ? '<div class="fila-com-atr sm-com-atr">' + quadroAtrasadas(atrasadas) : '<div>') +
    '<div class="sm-grade">' +
    dias.map((d, i) => col(['Seg', 'Ter', 'Qua', 'Qui', 'Sex'][i] + ' ' + dataBR(d).slice(0, 5), d, ts.filter((t) => t.prazo === d), d === h ? 'sm-hoje' : '')).join('') +
    (semData.length ? col('Sem data', 'sem', semData, 'sm-sem') : '') + '</div></div>' +
    '<p class="sub" style="margin-top:8px">Arraste a tarefa para outro dia para remarcar o prazo. Para ver a semana de outra pessoa, escolha a pessoa no filtro acima.</p>';
  alvo.querySelectorAll('[data-sm-nav]').forEach((b) => b.onclick = () => { F.semana = +b.dataset.smNav ? somarDias(seg, +b.dataset.smNav) : null; vistaSemana(alvo); });
  alvo.querySelectorAll('.fila-atrasadas [data-fila]').forEach((b) => b.onclick = () => abrirTarefa(E._tarefas.find((t) => t.id === b.dataset.fila), recarregarTarefas));
  let arr = null;
  alvo.querySelectorAll('.sm-card').forEach((c) => {
    c.addEventListener('dragstart', (ev) => { arr = c.dataset.sm; ev.dataTransfer.setData('text/plain', arr); c.classList.add('arrastando'); });
    c.addEventListener('dragend', () => c.classList.remove('arrastando'));
    c.onclick = () => abrirTarefa(E._tarefas.find((t) => t.id === c.dataset.sm), recarregarTarefas);
  });
  alvo.querySelectorAll('.sm-col[data-dia]').forEach((cl) => {
    if (!cl.dataset.dia || cl.dataset.dia === 'sem') return;
    cl.addEventListener('dragover', (ev) => { ev.preventDefault(); cl.classList.add('sobre'); });
    cl.addEventListener('dragleave', () => cl.classList.remove('sobre'));
    cl.addEventListener('drop', (ev) => { ev.preventDefault(); cl.classList.remove('sobre');
      const id = ev.dataTransfer.getData('text/plain') || arr, t = E._tarefas.find((x) => x.id === id); if (!t || t.prazo === cl.dataset.dia) return;
      comBotao(null, async () => {
        if (t.prazo_fatal && cl.dataset.dia > t.prazo_fatal && !confirm('A nova data passa do PRAZO FATAL (' + dataBR(t.prazo_fatal) + '). Remarcar mesmo assim?')) return;
        await q(sb.from('tarefas').update({ prazo: cl.dataset.dia }).eq('id', id)); t.prazo = cl.dataset.dia;
        aviso('✓ "' + t.titulo + '" remarcada para ' + dataBR(cl.dataset.dia) + '.'); vistaSemana(alvo);
      }); });
  });
}

// ═══ Backup 26: DELEGAR e VALIDAR ═══
// devolver com comentário (volta para quem fez, com aviso)
function janelaDevolver(t, depois) {
  const k = abrirJanela({ titulo: '↩ Devolver para ajuste', corpo: '<p class="sub" style="margin-bottom:8px">' + esc(t.titulo) + ' — volta para <b>' + esc(t.responsavel || '—') + '</b>, que recebe um aviso com o seu comentário.</p>' +
      '<div class="grade">' + campo('O que precisa ser ajustado <span class="obrig">*</span>', '<textarea name="coment" maxlength="1500" placeholder="Ex.: faltou a cláusula de êxito; conferir o CNPJ"></textarea>', 'inteiro') + '</div>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Voltar</button><button class="btn btn-x" type="button" id="tf-dev-ok">Devolver</button></div>' });
  k.querySelector('[data-cancelar]').onclick = () => fecharJanela(k);
  k.querySelector('#tf-dev-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const c = k.querySelector('[name=coment]').value.trim();
    if (!c) throw new Error('Escreva o que precisa ser ajustado.');
    await q(sb.rpc('tarefa_validar', { p_tarefa: t.id, p_aprovar: false, p_comentario: c }));
    aviso('↩ Devolvido para ' + (t.responsavel || 'a pessoa') + '.'); fecharJanela(k); if (depois) await depois();
  });
}
// delegar uma sequência de passos (ex.: "Lead completo": cadastrar → reunião → contrato com validação → enviar)
async function janelaDelegar(o, depois) {
  o = o || {};
  const modelos = await q(sb.from('modelos_fluxo').select('nome, descricao, itens, sequencial').order('nome')).catch(() => []);
  const seq = modelos.filter((m) => m.sequencial);
  if (!seq.length) return aviso('Nenhum modelo de sequência. Rode o SQL mais recente no Supabase.', true);
  const eu = (E.perfil && E.perfil.nome) || '';
  const j = abrirJanela({ titulo: '👥 Delegar passos', larga: true,
    corpo: '<form id="f-deleg" class="grade">' +
      campo('Sequência', '<select name="modelo">' + seq.map((m) => '<option value="' + esc(m.nome) + '">' + esc(m.nome) + '</option>').join('') + '</select>', 'inteiro') +
      '<div class="inteiro" id="deleg-passos"></div>' +
      campo('Para quem <span class="obrig">*</span>', selectPessoa('pessoa', o.pessoa || '', '— escolha —')) +
      campo('Quem valida', selectPessoa('revisor', eu, '— eu —')) +
      campo('Cliente (se já cadastrado)', '<select name="cliente_id">' + opcoesClientes(o.cliente_id || '') + '</select>', 'inteiro') +
      campo('Recado (opcional)', '<textarea name="obs" maxlength="1500" placeholder="Ex.: Empresa X é lead; o contato é o João (financeiro)">' + esc(o.obs || '') + '</textarea>', 'inteiro') + '</form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="deleg-ok">Delegar</button></div>' });
  const f = j.querySelector('#f-deleg');
  const passos = () => { const m = seq.find((x) => x.nome === f.modelo.value) || seq[0];
    j.querySelector('#deleg-passos').innerHTML = '<div class="dica">' + esc(m.descricao || '') + '<ol style="margin:6px 0 0 18px">' + (m.itens || []).map((it) =>
      '<li>' + esc(it.titulo) + ' <span class="sub">(' + plural(it.dias || 1, 'dia útil', 'dias úteis') + ')</span>' + (it.validar ? ' <span class="pill hoje">passa pela validação</span>' : '') + '</li>').join('') + '</ol>' +
      '<div class="sub" style="margin-top:6px">Cada passo só começa quando o anterior termina. O passo com validação vai para você aprovar ou devolver com comentário.</div></div>'; };
  f.modelo.onchange = passos; passos();
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#deleg-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.pessoa.value) throw new Error('Escolha para quem delegar.');
    await q(sb.rpc('delegar_sequencia', { p_modelo: f.modelo.value, p_pessoa: f.pessoa.value, p_revisor: f.revisor.value || eu, p_cliente: f.cliente_id.value || null,
      p_oportunidade: o.oportunidade_id || null, p_nome: null, p_obs: f.obs.value.trim() }));
    aviso('✓ Delegado para ' + f.pessoa.value + ': o 1º passo já está na fila dele(a).'); fecharJanela(j); if (depois) await depois();
  });
}
// Início: "Aguardando minha validação"
async function cardValidacoes() {
  const l = await q(sb.rpc('minhas_validacoes')).catch(() => []);
  if (!l.length) return { html: '', ligar: () => {} };
  return { html: '<div class="card ini-valid"><div class="card-hd">✅ Aguardando minha validação <span class="pill hoje">' + l.length + '</span>' +
      '<span class="sub" style="margin-left:8px">aprove para liberar o próximo passo, ou devolva com comentário</span></div><div class="card-bd"><div class="lista-ficha">' +
      l.map((t) => '<div class="item-ficha"><div class="clicavel" data-val-abrir="' + t.id + '"><b>' + esc(t.titulo) + '</b><div class="sub">' +
        esc([t.cliente, t.fluxo].filter(Boolean).join(' · ')) + (t.prazo ? ' · prazo ' + dataBR(t.prazo) : '') + '</div></div>' +
        '<div class="acoes">' + pillPessoa(t.responsavel) + '<button class="btn btn-x btn-mini" type="button" data-val-dev="' + t.id + '">↩ Devolver</button>' +
        '<button class="btn btn-v btn-mini" type="button" data-val-ok="' + t.id + '">✓ Aprovar</button></div></div>').join('') + '</div></div></div>',
    ligar: (el) => {
      const recarregarCard = async () => { const c = await cardValidacoes(); el.innerHTML = c.html; c.ligar(el); };
      el.querySelectorAll('[data-val-ok]').forEach((b) => b.onclick = () => comBotao(b, async () => {
        await q(sb.rpc('tarefa_validar', { p_tarefa: b.dataset.valOk, p_aprovar: true, p_comentario: '' })); aviso('✓ Aprovado: o próximo passo foi liberado.'); await recarregarCard(); }));
      el.querySelectorAll('[data-val-dev]').forEach((b) => b.onclick = () => janelaDevolver(l.find((x) => x.id === b.dataset.valDev), recarregarCard));
      el.querySelectorAll('[data-val-abrir]').forEach((d) => d.onclick = async () => {
        const t = (await q(sb.from('tarefas').select('*').eq('id', d.dataset.valAbrir)))[0]; if (t) abrirTarefa(t, recarregarCard); });
    } };
}

'use strict';
// ═══════════════════════════════════════════════════════════════════
// Documentos — arquivos guardados no Storage privado do Supabase
// (bucket "documentos"). Abrir gera um link temporário (5 minutos).
// Usado na tela Documentos, na ficha do cliente, no contrato e no lançamento.
// ═══════════════════════════════════════════════════════════════════
const TIPOS_DOC = [['contrato', 'Contrato'], ['procuracao', 'Procuração'], ['proposta', 'Proposta'], ['pessoal', 'Documento pessoal'],
  ['societario', 'Societário'], ['certidao', 'Certidão'], ['guia', 'Guia / boleto'], ['comprovante', 'Comprovante de pagamento'],
  ['peticao', 'Petição / peça'], ['certificado', 'Certificado digital'], ['outro', 'Outro']];
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
      (vinculo.cliente_id || vinculo.contrato_id || vinculo.lancamento_id ? '' : campo(vinculo.grupo_id ? 'Empresa do grupo (opcional)' : 'Cliente', '<select name="cliente_id">' +
        (vinculo.grupo_id ? '<option value="">— o grupo todo —</option>' + E.clientes.filter((c) => c.grupo_id === vinculo.grupo_id).map((c) => '<option value="' + c.id + '">' + esc(c.nome) + '</option>').join('') : opcoesClientes('')) + '</select>', 'inteiro')) +
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
  E.docs = E.docs || { tipo: '', cliente: '', grupo: '', busca: '', situacao: 'ativos' };
  const F = E.docs;
  await carregarCadastros();
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Documentos</h1><p>Contratos, procurações, certidões, comprovantes e demais arquivos — guardados com acesso restrito</p></div>' +
    '<div class="acoes"><button class="btn btn-o" id="doc-ger">📄 Gerar documento</button><button class="btn btn-o" id="doc-cert" title="Arquivo .pfx/.p12 + senha; o sistema lê a validade">🔐 Certificado digital</button><button class="btn btn-p" id="doc-novo">+ Enviar documento</button></div></div>' +
    '<div class="filtros">' +
    '<div class="segmento" id="doc-sit">' + [['ativos', 'Ativos'], ['vencendo', 'Vencendo / vencidos'], ['arquivados', 'Arquivados']].map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<select class="busca sel" id="doc-tipo"><option value="">Todos os tipos</option>' + TIPOS_DOC.map(([v, r]) => '<option value="' + v + '">' + r + '</option>').join('') + '</select>' +
    '<select class="busca sel" id="doc-grupo"><option value="">Todos os grupos</option>' + (E.grupos || []).map((g) => '<option value="' + g.id + '">' + esc(g.nome) + '</option>').join('') + '</select>' +
    '<select class="busca sel" id="doc-cli"><option value="">Todos os clientes</option>' + E.clientes.map((c) => '<option value="' + c.id + '">' + esc(c.nome) + '</option>').join('') + '</select>' +
    '<input class="busca" id="doc-busca" placeholder="Buscar nome, etiqueta ou observação" autocomplete="off"></div>' +
    '<div class="doc-chips" id="doc-chips"></div><div id="doc-corpo"><div class="carregando">Carregando…</div></div>';
  $('doc-tipo').value = F.tipo; $('doc-cli').value = F.cliente; $('doc-grupo').value = F.grupo || ''; $('doc-busca').value = F.busca;
  $('doc-novo').onclick = () => janelaEnviarDocumento({}, () => TELAS.documentos());
  $('doc-ger').onclick = () => janelaGeradores($('doc-cli').value || '');
  $('doc-cert').onclick = () => janelaCertificado({ cliente_id: F.cliente || '', grupo_id: F.grupo || '' }, () => pintarDocumentos());
  $('doc-sit').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.situacao = b.dataset.v; pintarDocumentos(); } };
  $('doc-tipo').onchange = (ev) => { F.tipo = ev.target.value; pintarDocumentos(); };
  $('doc-cli').onchange = (ev) => { F.cliente = ev.target.value; pintarDocumentos(false); };
  $('doc-grupo').onchange = (ev) => { F.grupo = ev.target.value; pintarDocumentos(false); };
  $('doc-chips').onclick = (ev) => { const b = ev.target.closest('[data-tipo]'); if (!b) return; F.tipo = F.tipo === b.dataset.tipo ? '' : b.dataset.tipo; $('doc-tipo').value = F.tipo; pintarDocumentos(false); };
  let t; $('doc-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; pintarDocumentos(false); }, 250); };
  await pintarDocumentos();
};
let _docsTela = [];
async function pintarDocumentos(buscar) {
  const F = E.docs;
  document.querySelectorAll('#doc-sit button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === F.situacao));
  if (buscar !== false) _docsTela = await buscarTodos(() => sb.from('documentos').select('*').order('criado_em', { ascending: false }));
  const b = normalizar(F.busca), lim = somarDias(hojeISO(), 15);
  // grupo: o do documento ou o do cliente vinculado
  const grupoDe = (d) => d.grupo_id || ((E.clientes.find((c) => c.id === d.cliente_id) || {}).grupo_id) || '';
  const base = _docsTela.filter((d) => (F.situacao === 'arquivados' ? d.arquivado : !d.arquivado)
    && (F.situacao !== 'vencendo' || (d.validade && d.validade <= lim))
    && (!F.cliente || d.cliente_id === F.cliente) && (!F.grupo || grupoDe(d) === F.grupo)
    && (!b || normalizar(d.nome + ' ' + d.etiquetas + ' ' + d.obs).includes(b)));
  const lista = base.filter((d) => !F.tipo || d.tipo === F.tipo);
  // atalhos por tipo (Procuração, Contrato…) com a quantidade no recorte atual
  const cont = {}; base.forEach((d) => { cont[d.tipo] = (cont[d.tipo] || 0) + 1; });
  $('doc-chips').innerHTML = TIPOS_DOC.filter(([v]) => cont[v] || v === F.tipo || v === 'procuracao' || v === 'contrato')
    .map(([v, r]) => '<button class="chip' + (F.tipo === v ? ' ativo' : '') + '" data-tipo="' + v + '">' + r + ' <span class="sub">' + (cont[v] || 0) + '</span></button>').join('');
  // Backup 28: separados por grupo, como pastas (clique no grupo para abrir/fechar); com um grupo escolhido, só ele e aberto
  const nomeG = (id) => (E.grupos.find((g) => g.id === id) || {}).nome || 'Sem grupo';
  const G = {}; lista.forEach((d) => { const k = grupoDe(d); (G[k] = G[k] || []).push(d); });
  const ks = Object.keys(G).sort((a, b2) => (a ? 0 : 1) - (b2 ? 0 : 1) || nomeG(a).localeCompare(nomeG(b2), 'pt-BR'));
  F.abertos = F.abertos || {};
  const aberto = (k) => ks.length === 1 || !!F.grupo || !!b || !!F.abertos[k];
  $('doc-corpo').innerHTML = lista.length ? '<div class="doc-pastas">' + ks.map((k) => '<details class="card doc-pasta" data-pasta="' + esc(k) + '"' + (aberto(k) ? ' open' : '') + '><summary><span class="doc-pasta-ic" aria-hidden="true">📁</span><b>' + esc(nomeG(k)) + '</b>' +
      '<span class="sub">' + plural(G[k].length, 'documento', 'documentos') + (G[k].some((d) => d.validade && d.validade <= lim) ? ' · <span class="pill vencido">vencendo</span>' : '') + '</span>' +
      // Backup 37: enviar direto para este grupo (sem abrir a pasta) e o certificado digital
      '<span class="doc-pasta-ac"><button type="button" class="btn btn-o btn-mini" data-pasta-cert="' + esc(k) + '" title="Certificado digital de uma empresa deste grupo">🔐 Certificado</button>' +
      '<button type="button" class="btn btn-p btn-mini" data-pasta-enviar="' + esc(k) + '" title="Enviar documento já para este grupo">+ Enviar</button></span></summary>' +
      (aberto(k) ? tabelaDocumentos(G[k], { vazio: '' }) : '') + '</details>').join('') + '</div>'
    : '<div class="card">' + tabelaDocumentos([], { vazio: 'Nenhum documento neste recorte.' }) + '</div>';
  // a tabela só é montada quando a pasta abre (pasta fechada não carrega nada)
  $('doc-corpo').querySelectorAll('details[data-pasta]').forEach((d) => d.addEventListener('toggle', () => { const k = d.dataset.pasta; if (d.open === aberto(k)) return; F.abertos[k] = d.open; pintarDocumentos(false); }));
  $('doc-corpo').querySelectorAll('[data-pasta-enviar]').forEach((b) => b.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation();
    janelaEnviarDocumento({ grupo_id: b.dataset.pastaEnviar || undefined }, () => pintarDocumentos(), '+ Enviar documento — ' + nomeG(b.dataset.pastaEnviar)); });
  $('doc-corpo').querySelectorAll('[data-pasta-cert]').forEach((b) => b.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation();
    janelaCertificado({ grupo_id: b.dataset.pastaCert || '' }, () => pintarDocumentos()); });
  ligarDocumentos($('doc-corpo'), lista, () => pintarDocumentos());
}

// ─────────── Geradores de documentos (Backup 16) ───────────
// Backup 32: a Central de Documentos (documentos/) substitui o gerador antigo de contrato e procuração.
// Os outros geradores (petição, solicitação, proposta, e-mails) continuam como antes, mais abaixo na janela.
const MODELOS_CENTRAL = [['procuracao', '📜 Procuração', 'ad judicia et extra, com a finalidade em destaque'], ['substabelecimento', '🔁 Substabelecimento', 'com ou sem reserva'],
  ['contrato', '🤝 Contrato de honorários', 'fixo, parcelado, salário mínimo, mensal e êxito'], ['recibo', '🧾 Recibo', 'numerado, com valor por extenso'],
  ['declaracao', '✍️ Declaração', 'hipossuficiência, residência ou texto livre'], ['acordo', '⚖️ Acordo entre partes', 'quitação de dívida, com ou sem processo']];
const GERADORES_DOC = [['peticao.html', '⚖ Petição', 'inicial, contestação, manifestação, embargos, exceção — com cliente e processo'],
  ['solicitacao-documentos.html', '📋 Solicitação de Documentos', 'lista do que o cliente precisa enviar'],
  ['propostas.html', '💼 Proposta (apresentação)', 'proposta comercial em páginas, com a marca'],
  ['modelos-email.html', '✉ Modelos de E-mail (implantação)', 'e-mails do processo de implantação, enviados pelo ERP']];
const urlCentral = (modelo, clienteId) => 'documentos/index.html' + (modelo ? '?modelo=' + modelo + (clienteId ? '&cliente=' + encodeURIComponent(clienteId) : '') : '');
// Backup 34: a Central abre DENTRO do ERP (Documentos → Gerar documento). Ctrl/⌘ + clique (ou botão do meio) abre numa aba nova.
const abaNova = (ev) => !!ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button === 1);
let _centralUrl = 'documentos/index.html';
function abrirCentral(url, ev) {
  url = url || 'documentos/index.html';
  if (abaNova(ev)) { window.open(url, '_blank', 'noopener'); return; }
  _centralUrl = url;
  const jn = $('janelas'); if (jn) [...jn.children].forEach((f) => fecharJanela(f));   // sai das janelas abertas (ficha, lançamento…) e vai para a Central
  if (typeof window.nav === 'function' && document.getElementById('panel-gerador')) window.nav(null, 'gerador');
  else if (typeof TELAS.gerador === 'function' && $('conteudo')) TELAS.gerador();
  else window.open(url, '_blank', 'noopener');
}
TELAS.gerador = async function () {
  const url = _centralUrl + (_centralUrl.includes('?') ? '&' : '?') + 'embutido=1';
  $('conteudo').innerHTML = '<div class="doc-central-topo"><span class="sub">Central de Documentos — procuração, substabelecimento, contrato, recibo, declaração e acordo</span>' +
    '<a class="btn btn-o btn-mini" href="' + esc(_centralUrl) + '" target="_blank" rel="noopener" title="Abrir numa aba nova (ou Ctrl + clique em qualquer link de documento)">Abrir em nova aba ↗</a></div>' +
    '<iframe class="doc-central" id="doc-central" title="Central de Documentos" src="' + esc(url) + '"></iframe>';
  _centralUrl = 'documentos/index.html';   // da próxima vez (pelo menu), abre a Central limpa
};
// links para a Central (recibo do Financeiro, janelas…): clique comum abre dentro do ERP; Ctrl/⌘/meio abre aba nova (padrão do navegador)
document.addEventListener('click', (ev) => {
  const a = ev.target.closest && ev.target.closest('a[href^="documentos/index.html"]');
  if (!a || abaNova(ev) || a.closest('.doc-central-topo')) return;
  ev.preventDefault(); abrirCentral(a.getAttribute('href'), ev);
});
function janelaGeradores(clienteId) {
  const j = abrirJanela({ titulo: '📄 Documentos', larga: true,
    corpo: '<p class="sub" style="margin-bottom:10px">Abre a <b>Central de Documentos</b> aqui no ERP' + (clienteId ? ', já com este cliente' : '') + ' (<b>Ctrl + clique</b> abre numa aba nova). Lá você preenche, vê a folha pronta, salva (fica no histórico) e baixa em <b>PDF</b> ou <b>Word</b>.</p>' +
      '<div class="lista-ficha">' + MODELOS_CENTRAL.map(([m, rot, d]) => '<a class="item-ficha clicavel ger-link" href="' + urlCentral(m, clienteId) + '">' +
        '<div><b>' + rot + '</b><div class="sub">' + d + '</div></div><span class="sub">abrir ›</span></a>').join('') +
        '<a class="item-ficha clicavel ger-link" href="documentos/index.html"><div><b>🗂 Histórico de documentos</b><div class="sub">tudo o que já foi gerado e salvo</div></div><span class="sub">abrir ›</span></a></div>' +
      '<div class="gx-det-tit" style="margin-top:14px">Outros geradores</div><div class="lista-ficha">' + GERADORES_DOC.map(([arq, rot, d]) => '<a class="item-ficha clicavel ger-link" target="_blank" rel="noopener" href="geradores/' + arq + (clienteId ? '?cliente=' + encodeURIComponent(clienteId) : '') + '">' +
        '<div><b>' + rot + '</b><div class="sub">' + d + '</div></div><span class="sub">abrir ↗</span></a>').join('') + '</div>' });
  return j;
}
// Backup 26: gerador de contrato já com o cliente e os valores do contrato (o documento fica ligado ao contrato)
function abrirGeradorContrato(clienteId, contratoId, ev) {
  abrirCentral('documentos/index.html?modelo=contrato' + (clienteId ? '&cliente=' + encodeURIComponent(clienteId) : '') + (contratoId ? '&contrato=' + encodeURIComponent(contratoId) : ''), ev);
}

// ═══ Backup 37: Certificado digital — o arquivo (.pfx/.p12) fica em Documentos; a senha e a validade (lida do arquivo) na ficha do certificado.
// A leitura é feita aqui no navegador (biblioteca node-forge, gratuita, carregada só quando abre esta janela): o arquivo não sai do computador
// para ser lido — só é guardado no Storage privado, como qualquer documento.
function carregarForge() {
  if (window.forge) return Promise.resolve(window.forge);
  return new Promise((ok, falha) => { const s = document.createElement('script'); s.src = 'vendor/forge.min.js'; s.onload = () => ok(window.forge); s.onerror = () => falha(new Error('Não consegui carregar o leitor de certificado.')); document.head.appendChild(s); });
}
async function lerCertificado(arquivo, senha) {
  const forge = await carregarForge();
  const u = new Uint8Array(await arquivo.arrayBuffer()); let bin = '';
  for (let i = 0; i < u.length; i += 8192) bin += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
  let p12;
  try { p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(bin), senha || ''); }
  catch (e) { throw new Error(/password|mac|Invalid/i.test(e.message || '') ? 'Senha incorreta para este certificado.' : 'Arquivo não é um certificado .pfx/.p12 válido.'); }
  const bags = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []).map((b) => b.cert).filter(Boolean);
  if (!bags.length) throw new Error('Não achei o certificado dentro do arquivo.');
  // o certificado da empresa é o que NÃO é autoridade certificadora (e, entre os que sobram, o que vence primeiro)
  const ehCA = (c) => { const bc = c.getExtension && c.getExtension('basicConstraints'); return !!(bc && bc.cA); };
  const c = (bags.filter((x) => !ehCA(x)).length ? bags.filter((x) => !ehCA(x)) : bags).sort((a, b) => a.validity.notAfter - b.validity.notAfter)[0];
  const campo = (attrs, n) => ((attrs.find((a) => a.shortName === n || a.name === n) || {}).value || '');
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  return { validade: iso(c.validity.notAfter), inicio: iso(c.validity.notBefore), titular: campo(c.subject.attributes, 'CN'), emissor: campo(c.issuer.attributes, 'CN') || campo(c.issuer.attributes, 'O') };
}
async function janelaCertificado(vinculo, depois) {
  if (!E.clientes.length) await carregarCadastros();
  const lista = E.clientes.filter((c) => !vinculo.grupo_id || c.grupo_id === vinculo.grupo_id);
  const j = abrirJanela({ titulo: '🔐 Certificado digital' + (vinculo.grupo_id ? ' — ' + (nomeGrupo(vinculo.grupo_id) || '') : ''), larga: true,
    corpo: '<form id="f-cert" class="grade" autocomplete="off">' +
      campo('Empresa', '<select name="cliente_id" required><option value="">— escolha —</option>' + lista.map((c) => '<option value="' + c.id + '"' + (c.id === vinculo.cliente_id ? ' selected' : '') + '>' + esc(c.nome) + (c.cpf_cnpj ? ' · ' + esc(mascaraDoc(c.cpf_cnpj)) : '') + '</option>').join('') + '</select>', 'inteiro') +
      '<div class="inteiro cert-atual" id="cert-atual"></div>' +
      '<div class="inteiro solta-arq" id="cert-solta"><b>Arraste o arquivo do certificado (.pfx ou .p12)</b> ou <label class="btn btn-o btn-mini" style="cursor:pointer">escolha<input type="file" id="cert-arq" accept=".pfx,.p12,application/x-pkcs12" hidden></label><div class="sub" id="cert-nome">nenhum arquivo</div></div>' +
      campo('Senha do certificado', '<span class="cert-senha"><input name="senha" type="password" autocomplete="new-password" placeholder="a senha do arquivo"><button type="button" class="btn btn-o btn-mini" id="cert-ver" aria-label="Mostrar a senha">👁</button></span>') +
      campo('Validade (lida do arquivo)', '<input name="validade" type="date">') +
      '<div class="inteiro cert-lido" id="cert-lido"></div></form>',
    rodape: '<span class="sub">A senha fica guardada com acesso restrito (quem edita clientes).</span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="cert-ok">Salvar certificado</button></div>' });
  const f = j.querySelector('#f-cert'), lido = j.querySelector('#cert-lido');
  let arquivo = null, info = null;
  const mostrarAtual = async () => { const box = j.querySelector('#cert-atual'); box.innerHTML = ''; if (!f.cliente_id.value) return;
    const [c] = await q(sb.from('cliente_certificado').select('validade, titular, emissor, senha, atualizado_por, atualizado_em').eq('cliente_id', f.cliente_id.value)).catch(() => []);
    if (!c) { box.innerHTML = '<span class="sub">Esta empresa ainda não tem certificado cadastrado.</span>'; return; }
    box.innerHTML = 'Certificado atual: ' + (c.validade ? 'vence em <b>' + dataBR(c.validade) + '</b>' + selo_validade(c.validade) : 'sem validade') + (c.titular ? ' · ' + esc(c.titular) : '') +
      '<div class="sub">atualizado ' + (c.atualizado_em ? dataLocal(c.atualizado_em) : '') + (c.atualizado_por ? ' por ' + esc(c.atualizado_por) : '') + (c.senha ? ' · <button type="button" class="dc-link btn-link" id="cert-copiar">copiar a senha</button>' : '') + '</div>';
    const cp = box.querySelector('#cert-copiar'); if (cp) cp.onclick = () => { navigator.clipboard.writeText(c.senha).then(() => aviso('✓ Senha copiada.'), () => aviso('Não consegui copiar.', true)); }; };
  const tentarLer = async () => { info = null; lido.innerHTML = ''; if (!arquivo) return;
    if (!f.senha.value) { lido.innerHTML = '<span class="sub">Digite a senha para o sistema ler a validade.</span>'; return; }
    try { info = await lerCertificado(arquivo, f.senha.value); f.validade.value = info.validade;
      lido.innerHTML = '✓ Certificado lido: <b>' + esc(info.titular || '—') + '</b> · válido de ' + dataBR(info.inicio) + ' até <b>' + dataBR(info.validade) + '</b>' + (info.emissor ? '<div class="sub">emitido por ' + esc(info.emissor) + '</div>' : '');
      lido.className = 'inteiro cert-lido cert-ok'; }
    catch (e) { lido.innerHTML = '⚠ ' + esc(e.message); lido.className = 'inteiro cert-lido cert-erro'; } };
  let tl; f.senha.addEventListener('input', () => { clearTimeout(tl); tl = setTimeout(tentarLer, 400); });
  j.querySelector('#cert-ver').onclick = () => { f.senha.type = f.senha.type === 'password' ? 'text' : 'password'; };
  const escolher = (a) => { arquivo = a || null; j.querySelector('#cert-nome').textContent = arquivo ? arquivo.name + ' (' + tamanhoLegivel(arquivo.size) + ')' : 'nenhum arquivo'; tentarLer(); };
  j.querySelector('#cert-arq').onchange = (ev) => escolher(ev.target.files[0]);
  const solta = j.querySelector('#cert-solta');
  ['dragenter', 'dragover'].forEach((e) => solta.addEventListener(e, (ev) => { ev.preventDefault(); solta.classList.add('sobre'); }));
  ['dragleave', 'drop'].forEach((e) => solta.addEventListener(e, (ev) => { ev.preventDefault(); solta.classList.remove('sobre'); }));
  solta.addEventListener('drop', (ev) => escolher((ev.dataTransfer.files || [])[0]));
  f.cliente_id.onchange = mostrarAtual; mostrarAtual();
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#cert-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const cli = E.clientes.find((c) => c.id === f.cliente_id.value); if (!cli) throw new Error('Escolha a empresa.');
    if (!arquivo && !f.validade.value) throw new Error('Escolha o arquivo do certificado (ou ao menos informe a validade).');
    if (arquivo && !info) throw new Error('Não consegui ler o certificado: confira a senha.');
    let doc = null;
    if (arquivo) doc = await enviarDocumento(arquivo, { cliente_id: cli.id, grupo_id: cli.grupo_id || undefined, tipo: 'certificado' },
      { nome: 'Certificado digital — ' + cli.nome + (arquivo.name.match(/\.(pfx|p12)$/i) || ['.pfx'])[0].toLowerCase(), validade: f.validade.value || null, obs: info && info.titular ? 'Titular: ' + info.titular : '' });
    await q(sb.from('cliente_certificado').upsert(Object.assign({ cliente_id: cli.id, validade: f.validade.value || null, senha: f.senha.value || '' },
      doc ? { documento_id: doc.id } : {}, info ? { titular: info.titular || '', emissor: info.emissor || '' } : {})).select('cliente_id'));
    aviso('✓ Certificado de ' + cli.nome + ' salvo' + (f.validade.value ? ' — vence em ' + dataBR(f.validade.value) : '') + '.'); fecharJanela(j); if (depois) await depois();
  });
  return j;
}

'use strict';
// ═══════════════════════════════════════════════════════════════════
// Ficha do cliente (visão 360°): tudo sobre o cliente numa janela só,
// em abas. Clicar no cliente (tela Clientes) abre esta ficha.
// ═══════════════════════════════════════════════════════════════════
const ABAS_FICHA = [['resumo', 'Resumo'], ['contatos', 'Contatos'], ['enderecos', 'Endereços'], ['contas', 'Contas bancárias'],
  ['socios', 'Sócios e vínculos'], ['processos', 'Processos'], ['contratos', 'Contratos'], ['financeiro', 'Financeiro'],
  ['tarefas', 'Tarefas'], ['documentos', 'Documentos'], ['linha', 'Linha do tempo'], ['fiscal', 'Dados fiscais'], ['receita', 'Cartão CNPJ'], ['pgfn', 'PGFN'], ['evolucao', '📈 Evolução']];

// Sub-cadastros editáveis da ficha (mesmo formulário para todos)
const FINALIDADES = SETORES_CONTATO;
const SUBLISTAS = {
  contatos: { tabela: 'contatos', titulo: 'Contatos', um: 'contato', vazio: 'Nenhum contato. Cadastre aqui financeiro, fiscal, RH, sócios, contador…',
    dica: 'Os e-mails automáticos vão para quem está marcado em <b>"Recebe por e-mail"</b>. Se ninguém estiver marcado, vão para o contato do setor certo ' +
      '(cobrança e recibo → Financeiro · guia → Fiscal · contrato e convite → Sócio), depois para o contato Geral e, por último, para o e-mail do cadastro.',
    campos: [['nome', 'Nome', 'texto', 1], ['cargo', 'Cargo / função'], ['finalidade', 'Setor', FINALIDADES], ['email', 'E-mail', 'email'],
      ['telefone', 'Telefone / WhatsApp'], ['whatsapp', 'Este telefone tem WhatsApp', 'check'], ['recebe', 'Recebe por e-mail', 'multi', RECEBE_EMAIL],
      ['preferencia', 'Preferência de contato (ex.: só WhatsApp, após 14h)'], ['obs', 'Observação', 'area']],
    linha: (x) => '<b>' + esc(x.nome || '—') + '</b>' + (x.cargo ? ' · ' + esc(x.cargo) : '') + ' <span class="pill neutro">' + esc(rotuloPar(FINALIDADES, x.finalidade)) + '</span>' +
      (x.recebe || []).map((k) => ' <span class="pill aberto">' + esc(RECEBE_CURTO[k] || k) + '</span>').join('') +
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
  const html = (cfg.dica ? '<div class="dica inteiro">' + cfg.dica + '</div>' : '') + cfg.campos.map(([k, rot, tipo, inteiro]) => {
    const v = item[k];
    if (tipo === 'multi') return '<fieldset class="inteiro sub-multi"><legend>' + rot + '</legend>' + inteiro.map(([val, r]) =>
      '<label class="check"><input type="checkbox" name="' + k + '" value="' + val + '"' + ((v || []).includes(val) ? ' checked' : '') + '> ' + r + '</label>').join('') + '</fieldset>';
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
      if (tipo === 'multi') dados[k] = [...f.querySelectorAll('[name="' + k + '"]:checked')].map((x) => x.value);
      else if (tipo === 'check') dados[k] = el.checked;
      else if (tipo === 'data') dados[k] = el.value || null;
      else if (tipo === 'numero') { const n = el.value.trim() ? lerValor(el.value) : null; if (Number.isNaN(n)) throw new Error('Número inválido em "' + cfg.campos.find((c) => c[0] === k)[1] + '".'); dados[k] = n; }
      else dados[k] = el.value.trim();
    });
    const obrig = cfg.campos.find((c) => c[3] === 1);
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
      // Backup 39: "Editar cadastro" em destaque, no canto de cima à direita (não some no meio dos atalhos)
      '<div class="ficha-topo"><button class="btn btn-p ficha-bt-editar" id="fc-editar">✎ Editar cadastro</button><div class="ficha-id">' +
      '<div class="ficha-sub">' + [cl.grupos && cl.grupos.nome ? esc(cl.grupos.nome) : '', esc(mascaraDoc(cl.cpf_cnpj) || ''), esc(cl.tipo_societario || ''), esc(cl.regime_tributario || '')].filter(Boolean).join(' · ') + '</div>' +
      '<div class="ficha-selos"><span class="pill ' + (cl.tipo === 'Inativo' ? 'neutro' : cl.tipo === 'Demanda' ? 'hoje' : 'aberto') + '">' + esc(cl.tipo === 'Demanda' ? 'Serviço pontual' : cl.tipo) + '</span> ' +
      pillPessoa(cl.responsavel) + ' ' + (cl.situacao_cadastral ? pillSitCad(cl.situacao_cadastral) + ' ' : '') + (cl.capag ? 'CAPAG ' + pillCapag(cl.capag) + ' ' : '') +
      etq.map((e) => e.etiquetas ? '<span class="pill" style="background:' + esc(e.etiquetas.cor) + '22;color:' + esc(e.etiquetas.cor) + '">' + esc(e.etiquetas.nome) + '</span>' : '').join(' ') +
      ' <button class="btn-etq" id="fc-etq" title="Etiquetas">+ etiqueta</button></div></div>' +
      '<div class="ficha-atalhos">' +
      '<button class="btn btn-o btn-mini" id="fc-tarefa">+ Tarefa</button><button class="btn btn-o btn-mini" id="fc-lanc">+ Lançamento</button>' +
      '<button class="btn btn-o btn-mini" id="fc-ger" title="Contrato, procuração, petição… já com os dados deste cliente">📄 Gerar</button><button class="btn btn-o btn-mini" id="fc-doc">+ Documento</button><button class="btn btn-o btn-mini" id="fc-int">+ Interação</button>' +
      (pode('crm', 'editar') ? '<button class="btn btn-o btn-mini" id="fc-lead" title="Nova oportunidade no CRM para este cliente (novo serviço)">🎯 Virar lead</button>' +
        '<button class="btn btn-o btn-mini" id="fc-reuniao" title="Agenda reunião com o cliente: tarefa para os participantes e convite opcional">📅 Reunião</button>' : '') +
      (pode('crm', 'editar') ? '<button class="btn btn-o btn-mini" id="fc-indic" title="Oportunidade nova no CRM com origem = indicação deste cliente">🤝 Indicação</button>' : '') +
      (tel ? '<a class="btn btn-o btn-mini" target="_blank" rel="noopener" href="https://wa.me/' + (soDigitos(tel).length <= 11 ? '55' : '') + soDigitos(tel) + '">WhatsApp</a>' : '') +
      (mail ? '<a class="btn btn-o btn-mini" href="mailto:' + esc(mail) + '">E-mail</a>' : '') +
      '</div></div>' +
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
  j.querySelector('#fc-ger').onclick = () => janelaGeradores(cl.id);
  const lead = j.querySelector('#fc-lead');
  if (lead) lead.onclick = async () => { if (!E._crmEtapas) E._crmEtapas = await q(sb.from('crm_etapas').select('*').order('ordem')).catch(() => []);
    formOportunidade({ cliente_id: cl.id, responsavel: cl.responsavel, origem: 'Cliente antigo' }, () => aviso('✓ Oportunidade criada no CRM para ' + cl.nome + '.')); };
  const reuC = j.querySelector('#fc-reuniao');
  if (reuC) reuC.onclick = () => formReuniao({ cliente_id: cl.id, titulo: 'Reunião — ' + cl.nome, participantes: cl.responsavel }, () => mostrar('linha'));
  const ind = j.querySelector('#fc-indic');
  if (ind) ind.onclick = async () => { if (!E._crmEtapas) E._crmEtapas = await q(sb.from('crm_etapas').select('*').order('ordem')).catch(() => []);
    formOportunidade({ origem: 'Indicação de cliente', indicado_por: cl.nome, responsavel: cl.responsavel }, () => aviso('✓ Prospecto indicado por ' + cl.nome + ' criado no CRM.')); };
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
  emails: (alvo, cl) => abaEmailsCliente(alvo, cl),
  async linha(alvo, cl) {
    const [ints, ctrs, lanc, ts, docs, hist, crm, reus, mails] = await Promise.all([
      q(sb.from('interacoes').select('*').eq('cliente_id', cl.id)),
      q(sb.from('contratos').select('id, descricao, data_contrato, status, assinado_em').eq('cliente_id', cl.id)),
      q(sb.from('lancamentos').select('descricao, valor, redutor, data_pagamento, vencimento').eq('cliente_id', cl.id).eq('pago', true).order('data_pagamento', { ascending: false }).limit(60)),
      q(sb.from('tarefas').select('titulo, concluida_em, status').or('cliente_id.eq.' + cl.id + (cl.grupo_id ? ',grupo_id.eq.' + cl.grupo_id : '')).eq('status', 'concluida').not('concluida_em', 'is', null)),
      q(sb.from('documentos').select('nome, tipo, criado_em').eq('cliente_id', cl.id)),
      q(sb.from('historico').select('acao, quando, antes, depois').eq('tabela', 'clientes').eq('registro_id', cl.id).order('quando', { ascending: false }).limit(30)).catch(() => []),
      // atividades do CRM (inclusive as de antes de virar cliente)
      pode('crm') ? q(sb.from('crm_atividades').select('tipo, quando, resumo, crm_oportunidades!inner(titulo, cliente_id)').eq('crm_oportunidades.cliente_id', cl.id)).catch(() => []) : [],
      // Backup 26: reuniões e e-mails enviados também entram na linha do tempo
      q(sb.from('reunioes').select('titulo, inicio, local, status, participantes').eq('cliente_id', cl.id)).catch(() => []),
      q(sb.rpc('emails_do_cliente', { p_cliente: cl.id })).catch(() => [])
    ]);
    const ev = [];
    // [quando, ícone, título, texto, item, categoria]
    ints.filter((i) => !(crm.length && /^\[CRM\]/.test(i.resumo || '')) && !(reus.length && /^Reunião agendada:/.test(i.resumo || '')))
      .forEach((i) => ev.push([i.quando, '💬', rotuloInteracao(i.tipo), i.resumo, i, /^Contrato /.test(i.resumo || '') ? 'contratos' : 'contatos']));
    crm.forEach((a) => ev.push([a.quando, '🎯', 'CRM · ' + rotuloInteracao(a.tipo), (a.crm_oportunidades ? a.crm_oportunidades.titulo + ': ' : '') + a.resumo, null, 'contatos']));
    reus.forEach((r) => ev.push([r.inicio, '📅', 'Reunião' + (r.status === 'cancelada' ? ' (cancelada)' : ''), r.titulo + (r.local ? ' — ' + r.local : '') + (r.participantes ? ' · ' + r.participantes : ''), null, 'contatos']));
    ctrs.forEach((c) => { ev.push([c.data_contrato + 'T12:00:00', '📄', 'Contrato' + (c.status === 'Aguardando assinatura' ? ' (aguardando assinatura)' : ''), c.descricao, null, 'contratos']);
      if (c.assinado_em) ev.push([c.assinado_em + 'T12:00:01', '✍', 'Contrato assinado', c.descricao, null, 'contratos']); });
    lanc.forEach((l) => ev.push([(l.data_pagamento || l.vencimento) + 'T12:00:00', '💰', 'Pagamento', l.descricao + ' — ' + brl(vl(l)), null, 'financeiro']));
    (mails || []).forEach((m) => ev.push([m.quando, '✉', 'E-mail · ' + (m.tipo || ''), m.assunto + ' → ' + m.para + (m.status === 'erro' ? ' (erro)' : m.status === 'retido' ? ' (retido pela pausa)' : ''), null, 'emails']));
    ts.forEach((t) => ev.push([t.concluida_em, '✓', 'Tarefa concluída', t.titulo, null, 'tarefas']));
    docs.forEach((d) => ev.push([d.criado_em, '📎', 'Documento', d.nome + ' (' + nomeTipoDoc(d.tipo) + ')', null, 'documentos']));
    hist.forEach((x) => {
      if (x.acao === 'INSERT') ev.push([x.quando, '＋', 'Cadastro criado', '', null, 'cadastro']);
      else if (x.acao === 'UPDATE' && x.antes && x.depois) {
        const mud = Object.keys(x.depois).filter((k) => !/atualizado_em|criado/.test(k) && JSON.stringify(x.antes[k]) !== JSON.stringify(x.depois[k]));
        if (mud.length) ev.push([x.quando, '✎', 'Cadastro alterado', mud.join(', '), null, 'cadastro']);
      }
    });
    ev.sort((a, b) => String(b[0]).localeCompare(String(a[0])));
    const CATS = [['', 'Tudo'], ['contatos', 'Contatos e reuniões'], ['contratos', 'Contratos'], ['financeiro', 'Financeiro'], ['emails', 'E-mails'], ['tarefas', 'Tarefas'], ['documentos', 'Documentos'], ['cadastro', 'Cadastro']];
    const presentes = new Set(ev.map((e) => e[5]));
    let cat = '';
    const pintarLt = () => {
      const vis = ev.filter((e) => !cat || e[5] === cat);
      alvo.querySelector('#fc-lt').innerHTML = vis.length ? '<div class="linha-tempo">' + vis.map(([q_, ic, tit, txt]) => '<div class="lt-item"><span class="lt-ic">' + ic + '</span><div><b>' + esc(tit) + '</b> <span class="sub">' + quandoBR(q_) + '</span>' +
        (txt ? '<div>' + esc(txt) + '</div>' : '') + '</div></div>').join('') + '</div>' : '<div class="vazio">Nada registrado ainda.</div>';
      alvo.querySelectorAll('#fc-lt-cat button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === cat));
    };
    alvo.innerHTML = '<div class="titulo-pag" style="margin-bottom:8px"><div><b>Linha do tempo</b> <span class="sub">' + ev.length + ' evento(s) · do primeiro contato ao financeiro</span></div>' +
      '<div class="acoes"><button class="btn btn-o btn-mini" id="fc-int2">+ Registrar interação</button></div></div>' +
      (ev.length ? '<div class="segmento" id="fc-lt-cat" style="margin-bottom:10px">' + CATS.filter(([v]) => !v || presentes.has(v)).map(([v, r]) => '<button type="button" data-v="' + v + '">' + r + '</button>').join('') + '</div>' : '') +
      '<div id="fc-lt"></div>';
    const segLt = alvo.querySelector('#fc-lt-cat'); if (segLt) segLt.onclick = (evt) => { const b = evt.target.closest('button'); if (b) { cat = b.dataset.v; pintarLt(); } };
    pintarLt();
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
    execs.forEach((x) => (x.relatorio || []).forEach((r) => { if (r.cliente_id === cl.id && (r.erro || r.aguardando || (r.mudancas && !r.primeira))) hist.push(Object.assign({ quando: x.inicio }, r)); }));
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
        (h.aguardando ? '<div class="sub">⏳ ' + esc(h.aviso) + '</div>' : h.erro ? '<div class="sub" style="color:var(--red-d)">Erro na consulta: ' + esc(h.erro) + '</div>' :
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


// ─────────── 📈 Evolução: "devia X, hoje deve Y" — foto mensal do grupo × agora ───────────
const ORG_FOTO = [['rfb', 'Receita Federal'], ['pgfn', 'PGFN'], ['age_mg', 'AGE/MG'], ['sefaz_mg', 'SEFAZ/MG']];
function mesBR(iso) { return String(iso || '').slice(5, 7) + '/' + String(iso || '').slice(0, 4); }
function variacao(antes, depois) {
  const d = (Number(depois) || 0) - (Number(antes) || 0);
  if (!d) return '<span class="sub">igual</span>';
  const pc = Number(antes) ? ' (' + (d > 0 ? '+' : '') + (d / Number(antes) * 100).toFixed(1).replace('.', ',') + '%)' : '';
  return '<span class="' + (d > 0 ? 'ev-pior' : 'ev-melhor') + '">' + (d > 0 ? '▲ +' : '▼ −') + brl(Math.abs(d)).replace('R$ ', 'R$ ') + pc + '</span>';
}
ABA_FICHA.evolucao = async function (alvo, cl) {
  if (!cl.grupo_id) { alvo.innerHTML = vazio('Este cliente não está em um grupo: o histórico é guardado por grupo.'); return; }
  const [fotos, agora] = await Promise.all([
    q(sb.from('fotos_mensais').select('mes, dados, tirada_em').eq('grupo_id', cl.grupo_id).order('mes', { ascending: false })).catch(() => []),
    q(sb.rpc('foto_do_grupo', { p_grupo: cl.grupo_id }))
  ]);
  const mesAtual = hojeISO().slice(0, 7);
  const antigas = fotos.filter((f) => f.mes.slice(0, 7) < mesAtual);
  const admin = E.perfil && E.perfil.papel === 'admin';
  if (!antigas.length) {
    alvo.innerHTML = '<div class="dica" style="margin-bottom:12px">O histórico deste grupo começou em <b>' + (fotos.length ? mesBR(fotos[fotos.length - 1].mes) : mesBR(hojeISO())) + '</b>. ' +
      'Todo dia 1º o sistema guarda uma "foto" (passivo, CAPAG, processos, parcelamentos e acordos). O comparativo aparece a partir do mês que vem.</div>' + fotoResumo(agora, 'Hoje');
    return;
  }
  const E2 = E.ev = E.ev || {};
  const escolhido = antigas.find((f) => f.mes === E2.mes) || antigas.find((f) => f.mes.slice(0, 7) <= somarDias(hojeISO(), -30).slice(0, 7)) || antigas[0];
  const a = escolhido.dados || {}, h = agora || {};
  const pa = (a.passivo || {}), ph = (h.passivo || {});
  const nomeG = nomeGrupo(cl.grupo_id);
  // processos: novos = ativos hoje que não existiam; encerrados = estavam ativos e hoje estão encerrados (ou sumiram)
  const atA = new Set(a.processos_ativos || []), atH = new Set(h.processos_ativos || []), encH = new Set(h.processos_encerrados || []);
  const todosA = new Set([...(a.processos_ativos || []), ...(a.processos_encerrados || [])]);
  const novos = [...atH].filter((n) => !todosA.has(n)), encerrados = [...atA].filter((n) => !atH.has(n));
  const empA = {}; (a.empresas || []).forEach((e) => { empA[e.id] = e; });
  const capagMudou = (h.empresas || []).filter((e) => empA[e.id] && (empA[e.id].capag || '') !== (e.capag || ''));
  const frase = 'Em ' + mesBR(escolhido.mes) + ' o grupo ' + esc(nomeG) + ' devia <b>' + brl(pa.total) + '</b>; hoje deve <b>' + brl(ph.total) + '</b> ' + variacao(pa.total, ph.total) + '. ' +
    'Tinha <b>' + atA.size + '</b> processo(s) em andamento: <b>' + encerrados.length + '</b> encerrado(s) desde então e <b>' + novos.length + '</b> novo(s)' +
    (capagMudou.length ? '. CAPAG mudou em ' + capagMudou.map((e) => esc(e.nome) + ' (' + esc(empA[e.id].capag || '—') + ' → ' + esc(e.capag || '—') + ')').join(', ') : '') + '.';
  alvo.innerHTML =
    '<div class="filtros" style="margin-bottom:10px"><label class="sub" for="ev-mes" style="align-self:center">Comparar hoje com</label><select class="busca sel" id="ev-mes">' +
      antigas.map((f) => '<option value="' + f.mes + '"' + (f.mes === escolhido.mes ? ' selected' : '') + '>' + mesBR(f.mes) + '</option>').join('') + '</select>' +
      (admin ? '<button class="btn btn-o btn-mini" id="ev-foto" title="Grava a foto deste mês de todos os grupos (a rotina faz isso sozinha todo dia 1º)">📸 Atualizar foto do mês</button>' : '') + '</div>' +
    '<div class="ev-frase">' + frase + '</div>' +
    '<div class="duas-col"><div class="card"><div class="card-hd">Passivo por órgão</div><div class="tabela-wrap"><table><thead><tr><th>Órgão</th><th class="num">' + mesBR(escolhido.mes) + '</th><th class="num">Hoje</th><th class="num">Diferença</th></tr></thead><tbody>' +
      ORG_FOTO.map(([k, r]) => '<tr><td>' + r + '</td><td class="num mono">' + brl(pa[k]) + '</td><td class="num mono">' + brl(ph[k]) + '</td><td class="num">' + variacao(pa[k], ph[k]) + '</td></tr>').join('') +
      '</tbody><tfoot><tr><td>Total</td><td class="num mono">' + brl(pa.total) + '</td><td class="num mono">' + brl(ph.total) + '</td><td class="num">' + variacao(pa.total, ph.total) + '</td></tr></tfoot></table></div></div>' +
    '<div class="card"><div class="card-hd">Empresas do grupo</div><div class="tabela-wrap"><table><thead><tr><th>Empresa</th><th>CAPAG</th><th class="num">' + mesBR(escolhido.mes) + '</th><th class="num">Hoje</th></tr></thead><tbody>' +
      (h.empresas || []).map((e) => { const x = empA[e.id]; return '<tr><td><b>' + esc(e.nome) + '</b>' + (x ? '' : ' <span class="pill aberto">nova</span>') + '</td><td>' +
        (x && (x.capag || '') !== (e.capag || '') ? pillCapag(x.capag || '—') + ' → ' + pillCapag(e.capag || '—') : e.capag ? pillCapag(e.capag) : '<span class="sub">—</span>') + '</td>' +
        '<td class="num mono">' + (x ? brl(x.total) : '—') + '</td><td class="num mono">' + brl(e.total) + '</td></tr>'; }).join('') +
      '</tbody></table></div></div></div>' +
    '<div class="duas-col"><div class="card"><div class="card-hd">Processos novos <span class="pill aberto">' + novos.length + '</span></div><div class="card-bd">' +
      (novos.length ? novos.map((n) => '<div class="mono">' + esc(n) + '</div>').join('') : '<span class="sub">Nenhum.</span>') + '</div></div>' +
    '<div class="card"><div class="card-hd">Processos encerrados <span class="pill pago">' + encerrados.length + '</span></div><div class="card-bd">' +
      (encerrados.length ? encerrados.map((n) => '<div class="mono">' + esc(n) + (encH.has(n) ? '' : ' <span class="sub">(saiu do cadastro)</span>') + '</div>').join('') : '<span class="sub">Nenhum.</span>') + '</div></div></div>' +
    '<div class="sub">Parcelamentos: ' + (a.parcelamentos || 0) + ' → ' + (h.parcelamentos || 0) + ' · Acordos em aberto: ' + (a.acordos_abertos || 0) + ' → ' + (h.acordos_abertos || 0) +
      ' (' + brl(a.acordos_saldo) + ' → ' + brl(h.acordos_saldo) + ')</div>';
  $('ev-mes').onchange = (ev) => { E2.mes = ev.target.value; ABA_FICHA.evolucao(alvo, cl); };
  const bf = $('ev-foto'); if (bf) bf.onclick = () => comBotao(bf, async () => { const n = await q(sb.rpc('tirar_fotos_mensais')); aviso('✓ Foto do mês atualizada (' + n + ' grupo(s)).'); });
};
function fotoResumo(f, rot) {
  const p = (f && f.passivo) || {};
  return '<div class="kpis">' + kpi('Passivo — ' + rot, brl(p.total), 'ambar', ORG_FOTO.filter(([k]) => Number(p[k])).map(([k, r]) => r + ' ' + brl(p[k])).join(' · ') || 'sem débitos') +
    kpi('Processos em andamento', String((f && f.processos_ativos || []).length), '', (f && f.processos_encerrados || []).length + ' encerrado(s)') +
    kpi('Parcelamentos', String((f && f.parcelamentos) || 0), '', '') + kpi('Acordos em aberto', String((f && f.acordos_abertos) || 0), '', brl(f && f.acordos_saldo)) + '</div>';
}

// ─────────── PGFN: inscrições em dívida ativa (API SERPRO, rotina erp-pgfn) ───────────
ABA_FICHA.pgfn = async function (alvo, cl) {
  const [ins, st] = await Promise.all([
    q(sb.from('pgfn_inscricoes').select('*').eq('cliente_id', cl.id).order('valor', { ascending: false })).catch(() => []),
    q(sb.rpc('status_config_pgfn')).catch(() => ({}))
  ]);
  if (!ins.length) {
    alvo.innerHTML = vazio(st && st.ligada && st.tem_chave ? 'Nenhuma inscrição em dívida ativa encontrada para este CNPJ na última consulta.' :
      'A consulta automática da PGFN ainda não está ligada. Depois de contratar a API "Consulta Dívida Ativa" do SERPRO, salve a chave em Alertas → PGFN.');
    return;
  }
  const porNat = {}; ins.forEach((x) => { const k = x.natureza || 'Outras'; porNat[k] = porNat[k] || { n: 0, v: 0, parc: 0 }; porNat[k].n++; porNat[k].v += Number(x.valor) || 0; if (x.parcelada) porNat[k].parc += Number(x.valor) || 0; });
  const tot = soma(ins, (x) => x.valor), parc = soma(ins.filter((x) => x.parcelada), (x) => x.valor);
  alvo.innerHTML = '<div class="kpis">' + kpi('Dívida ativa (PGFN)', brl(tot), 'ambar', ins.length + ' inscrição(ões)') + kpi('Parcelada / negociada', brl(parc), 'verde', ins.filter((x) => x.parcelada).length + ' inscrição(ões)') +
    kpi('Em cobrança', brl(tot - parc), tot - parc ? 'vermelho' : '', 'sem parcelamento') + '</div>' +
    '<div class="card"><div class="card-hd">Por origem</div><div class="tabela-wrap"><table><thead><tr><th>Origem</th><th class="num">Inscrições</th><th class="num">Parcelado</th><th class="num">Total</th></tr></thead><tbody>' +
      Object.keys(porNat).sort((a, b) => porNat[b].v - porNat[a].v).map((k) => '<tr><td><b>' + esc(k) + '</b></td><td class="num">' + porNat[k].n + '</td><td class="num mono">' + brl(porNat[k].parc) + '</td><td class="num mono">' + brl(porNat[k].v) + '</td></tr>').join('') + '</tbody></table></div></div>' +
    '<div class="card"><div class="card-hd">Inscrições (CDAs)</div><div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Nº da inscrição</th><th>Origem</th><th>Receita</th><th>Situação</th><th data-tipo="data">Inscrita em</th><th class="num">Valor</th></tr></thead><tbody>' +
      ins.map((x) => '<tr><td class="mono">' + esc(x.inscricao) + '</td><td>' + esc(x.natureza) + '</td><td>' + esc(x.receita) + '</td><td>' + (x.parcelada ? '<span class="pill pago">' : '<span class="pill hoje">') + esc(x.situacao || (x.parcelada ? 'Parcelada' : 'Em cobrança')) + '</span></td>' +
        '<td class="mono" data-ord="' + esc(x.data_inscricao || '') + '">' + dataBR(x.data_inscricao) + '</td><td class="num mono" data-ord="' + x.valor + '">' + brl(x.valor) + '</td></tr>').join('') + '</tbody></table></div>' +
      '<div class="sub" style="padding:8px 12px">Atualizado em ' + dataHoraBR(ins[0].atualizado_em) + ' pela consulta automática.</div></div>';
};

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
  E.crm = E.crm || { vista: 'funil', resp: '', origem: '', busca: '', aba: 'andamento' };
  E.crm.aba = E.crm.aba || 'andamento';
  const F = E.crm;
  await carregarCadastros();
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>CRM</h1><p>Oportunidades, propostas e o caminho até o contrato assinado</p></div>' +
    '<div class="acoes"><button class="btn btn-o" id="cr-etapas" title="Prazo de cada etapa (depois dele vira tarefa) e o que cada uma significa">⚙ Etapas</button><button class="btn btn-o" id="cr-modelos">Modelos de proposta</button>' +
    '<button class="btn btn-o" id="cr-rapido" title="Só nome, telefone e interesse">⚡ Cadastro rápido</button><button class="btn btn-p" id="cr-nova">+ Nova oportunidade</button></div></div>' +
    // abas: no painel ficam só as oportunidades em andamento; ganhas (contrato assinado) e perdidas (cancelado) têm aba própria
    // Backup 37: as abas usam o MESMO filtro escuro dos outros (simetria); "Painel" saiu; responsáveis viram botões
    '<div class="filtros cr-filtros"><div class="segmento" id="cr-abas">' + [['andamento', 'Em andamento'], ['ganho', '✍ Contratos assinados'], ['perdido', '✗ Leads perdidos']]
      .map(([v, r]) => '<button data-aba="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<div class="segmento" id="cr-vista">' + [['funil', 'Funil'], ['lista', 'Lista']].map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div></div>' +
    '<div class="filtros"><div class="segmento" id="cr-resp-seg"><button data-r="">Todos</button>' + Object.keys(PESSOA).map((p) => '<button data-r="' + esc(p) + '">' + esc(p) + '</button>').join('') + '</div>' +
    '<select class="busca sel" id="cr-origem"><option value="">Todas as origens</option>' + ORIGENS_CRM.map((o) => '<option>' + esc(o) + '</option>').join('') + '</select>' +
    '<input class="busca" id="cr-busca" placeholder="Buscar nome, empresa, CNPJ ou telefone" autocomplete="off"></div>' +
    '<div id="cr-corpo"><div class="carregando">Carregando…</div></div>';
  $('cr-nova').onclick = () => formOportunidade({}, recarregarCrm);
  $('cr-modelos').onclick = () => janelaModelosProposta();
  $('cr-rapido').onclick = () => cadastroRapido();
  $('cr-etapas').onclick = () => janelaEtapasCrm();
  $('cr-vista').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.vista = b.dataset.v; pintarCrm(); } };
  $('cr-abas').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.aba = b.dataset.aba; pintarCrm(); } };
  $('cr-resp-seg').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.resp = b.dataset.r; pintarCrm(); } };
  [['cr-origem', 'origem']].forEach(([id, k]) => { $(id).value = F[k]; $(id).onchange = (ev) => { F[k] = ev.target.value; pintarCrm(); }; });
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
    (!b || normalizar([o.titulo, nomeOp(o), o.prospecto_nome, o.prospecto_empresa, o.prospecto_email, o.indicado_por].join(' ')).includes(b) ||
      (soDigitos(F.busca).length >= 4 && (soDigitos(o.prospecto_doc).includes(soDigitos(F.busca)) || soDigitos(o.prospecto_telefone).includes(soDigitos(F.busca))))));
}
function pintarCrm() {
  if (!$('cr-corpo')) return;
  const F = E.crm;
  document.querySelectorAll('#cr-abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === F.aba));
  if (F.vista === 'painel') F.vista = 'funil';
  document.querySelectorAll('#cr-vista button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === F.vista));
  document.querySelectorAll('#cr-resp-seg button').forEach((b) => b.classList.toggle('ativo', b.dataset.r === (F.resp || '')));
  if ($('cr-vista')) $('cr-vista').hidden = F.aba !== 'andamento';
  if (F.aba !== 'andamento') return crmFinalizadas($('cr-corpo'), F.aba);
  ({ funil: crmFunil, lista: crmLista })[F.vista]($('cr-corpo'));
}
// Ganhos (contrato assinado) e Perdidos (não fechou): lista própria, fora do painel do dia a dia
function crmFinalizadas(alvo, tipo) {
  const ops = filtrarOps().filter((o) => etapaDe(o.etapa_id).final === tipo)
    .sort((a, b) => String(b.assinado_em || b.ganho_em || b.perdido_em || b.atualizado_em).localeCompare(String(a.assinado_em || a.ganho_em || a.perdido_em || a.atualizado_em)));
  alvo.innerHTML = '<div class="dica" style="margin-bottom:12px">' + (tipo === 'ganho'
      ? '<b>Contrato assinado</b> = o cliente assinou: o financeiro e o onboarding foram lançados nessa hora. Antes disso ele passa por <b>Aguardando assinatura</b> (disse sim: cadastro e contrato criados, sem financeiro).'
      : '<b>Lead perdido</b> = não fechou (preço, prazo, foi para concorrente, desistiu, sem retorno…). O motivo alimenta o relatório de perdas no Painel.') + '</div>' +
    '<div class="card">' + (ops.length ? '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Oportunidade</th><th data-tipo="num">Valor</th><th>Responsável</th><th data-tipo="data">' +
      (tipo === 'ganho' ? 'Assinado em' : 'Perdido em') + '</th>' + (tipo === 'perdido' ? '<th>Motivo</th>' : '<th>Área do serviço</th>') + '</tr></thead><tbody>' +
      ops.map((o) => { const d = o.assinado_em || o.ganho_em || o.perdido_em || o.atualizado_em; return '<tr class="clicavel" data-op="' + o.id + '"><td><b>' + esc(o.titulo) + '</b><div class="sub">' + esc(nomeOp(o)) + '</div></td>' +
        '<td class="num mono" data-ord="' + (o.valor_estimado || 0) + '">' + brl(o.valor_estimado) + '</td><td>' + pillPessoa(o.responsavel) + '</td>' +
        '<td class="mono" data-ord="' + esc(d || '') + '">' + dataBR(d) + '</td><td>' + esc((tipo === 'perdido' ? o.motivo_perda : o.servico) || '—') + '</td></tr>'; }).join('') +
      '</tbody></table></div>' : vazio(tipo === 'ganho' ? 'Nenhum contrato assinado ainda.' : 'Nenhum lead perdido.')) + '</div>';
  alvo.querySelectorAll('[data-op]').forEach((tr) => tr.onclick = () => fichaOportunidade(tr.dataset.op));
}

// ── Funil (kanban) em duas linhas: prospecção em cima; negociação, contrato e o fim embaixo ──
function telOp(o) { return soDigitos(o.prospecto_telefone || (o.cliente_id && (E.clientes.find((c) => c.id === o.cliente_id) || {}).telefone) || ''); }
function mailOp(o) { return o.prospecto_email || (o.cliente_id && (E.clientes.find((c) => c.id === o.cliente_id) || {}).email) || ''; }
function linkWa(tel, texto) { return 'https://wa.me/' + (tel.length <= 11 ? '55' : '') + tel + (texto ? '?text=' + encodeURIComponent(texto) : ''); }
function cartaoOp(o, e, h) {
  const atr = o.proxima_acao_em && o.proxima_acao_em < h, tel = telOp(o), mail = mailOp(o);
  const parado = e.dias_alerta != null && diasParado(o) > e.dias_alerta;
  return '<div class="cr-card' + (atr ? ' cr-atrasada' : '') + '" draggable="true" data-op="' + o.id + '"><b>' + esc(o.titulo) + '</b><div class="sub">' + esc(nomeOp(o)) + (o.servico ? ' · ' + esc(o.servico) : '') + '</div>' +
    '<div class="cr-card-rod"><span class="mono">' + brl(o.valor_estimado) + '</span><span class="sub' + (parado ? ' texto-vermelho' : '') + '" title="dias nesta etapa' + (e.dias_alerta != null ? ' (prazo: ' + e.dias_alerta + ')' : '') + '">' + diasParado(o) + 'd na etapa</span></div>' +
    (o.proxima_acao ? '<div class="cr-prox' + (atr ? ' atrasada' : '') + '">→ ' + esc(o.proxima_acao) + (o.proxima_acao_em ? ' · ' + dataBR(o.proxima_acao_em) : '') + '</div>' : '<div class="cr-prox cr-sem-prox">sem próximo passo</div>') +
    '<div class="cr-card-at">' + (o.responsavel ? pillPessoa(o.responsavel) : '<span></span>') + '<span class="cr-atalhos">' +
      (tel ? '<a class="cr-at" href="' + linkWa(tel) + '" target="_blank" rel="noopener" title="WhatsApp" aria-label="WhatsApp">💬</a>' : '') +
      (mail ? '<a class="cr-at" href="mailto:' + esc(mail) + '" title="E-mail" aria-label="E-mail">✉</a>' : '') +
      '<button type="button" class="cr-at" data-ligacao="' + o.id + '" title="Registrar ligação (1 clique)" aria-label="Registrar ligação">📞</button>' +
      '<button type="button" class="cr-at cr-avancar" data-avancar="' + o.id + '" title="Avançar para a próxima etapa" aria-label="Avançar etapa">▸</button></span></div></div>';
}
function colunaCrm(e, ops, h) {
  const cs = ops.filter((o) => o.etapa_id === e.id);
  return '<div class="cr-col" data-etapa="' + e.id + '" title="' + esc(e.descricao || '') + '"><div class="cr-col-tit"><span>' + esc(e.nome) + '</span><span class="cr-col-n">' +
    cs.length + '</span></div>' + (cs.length ? '<div class="cr-col-val">' + esc(brlCurto(soma(cs, (o) => o.valor_estimado))) + '</div>' : '') +
    cs.map((o) => cartaoOp(o, e, h)).join('') +
    (!cs.length ? '<div class="cr-vazia"><span class="cr-vazia-ic" aria-hidden="true">○</span>Nenhuma oportunidade<span class="sub">arraste um cartão para cá</span></div>' : '') + '</div>';
}
// Backup 17: "Em andamento" mostra só as etapas abertas — 4 em cima e 4 embaixo, todas do mesmo tamanho.
// Contrato assinado e Lead perdido saem daqui (ficam nas abas); para mandar um cartão para lá, solte na faixa de baixo.
function crmFunil(alvo) {
  const ops = filtrarOps(), h = hojeISO(), et = E._crmEtapas || [];
  const abertas = et.filter((e) => !e.final), fins = et.filter((e) => e.final);
  const porLinha = Math.max(4, Math.ceil(abertas.length / 2)), cima = abertas.slice(0, porLinha), baixo = abertas.slice(porLinha);
  alvo.innerHTML = '<div class="cr-linha" style="--n:' + porLinha + '">' + cima.map((e) => colunaCrm(e, ops, h)).join('') + '</div>' +
    (baixo.length ? '<div class="cr-linha" style="--n:' + porLinha + '">' + baixo.map((e) => colunaCrm(e, ops, h)).join('') + '</div>' : '') +
    '<div class="cr-fins">' + fins.map((e) => '<div class="cr-solte cr-solte-' + e.final + '" data-etapa="' + e.id + '">' +
      (e.final === 'ganho' ? '✓ Solte aqui quando o cliente <b>assinar</b> — vai para a aba "Contratos assinados"' : '✕ Solte aqui quando <b>não fechar</b> — vai para a aba "Leads perdidos"') + '</div>').join('') + '</div>' +
    '<p class="sub" style="margin-top:8px">Arraste o cartão para mudar a etapa (no celular, use ▸). <b>Contrato fechado</b> = o cliente disse sim (o sistema cria cadastro, contrato e onboarding). ' +
    'Passe o mouse no nome da etapa para ver o que ela significa.</p>';
  let arrastando = null;
  alvo.querySelectorAll('.cr-card').forEach((c) => {
    c.addEventListener('dragstart', (ev) => { arrastando = c.dataset.op; ev.dataTransfer.setData('text/plain', c.dataset.op); c.classList.add('arrastando'); });
    c.addEventListener('dragend', () => c.classList.remove('arrastando'));
    c.onclick = (ev) => { if (ev.target.closest('a, button')) return; fichaOportunidade(c.dataset.op); };
  });
  alvo.querySelectorAll('[data-ligacao]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const o = E._crmOps.find((x) => x.id === b.dataset.ligacao);
    await q(sb.from('crm_atividades').insert({ oportunidade_id: o.id, tipo: 'ligacao', resumo: 'Ligação registrada' }));
    if (o.cliente_id) await q(sb.from('interacoes').insert({ cliente_id: o.cliente_id, tipo: 'ligacao', resumo: '[CRM] Ligação registrada — ' + o.titulo })).catch(() => {});
    aviso('✓ Ligação registrada em "' + o.titulo + '". Para detalhar, abra o cartão → Atividades.');
  }));
  alvo.querySelectorAll('[data-avancar]').forEach((b) => b.onclick = () => {
    const o = E._crmOps.find((x) => x.id === b.dataset.avancar), abertas = (E._crmEtapas || []).filter((e) => !e.final);
    const i = abertas.findIndex((e) => e.id === o.etapa_id), prox = abertas[i + 1] || (E._crmEtapas || []).find((e) => e.final === 'ganho');
    if (prox) moverOp(o.id, prox.id);
  });
  alvo.querySelectorAll('.cr-col, .cr-solte').forEach((col) => {
    col.addEventListener('dragover', (ev) => { ev.preventDefault(); col.classList.add('sobre'); });
    col.addEventListener('dragleave', () => col.classList.remove('sobre'));
    col.addEventListener('drop', (ev) => { ev.preventDefault(); col.classList.remove('sobre'); moverOp(ev.dataTransfer.getData('text/plain') || arrastando, col.dataset.etapa); });
  });
}
async function moverOp(opId, etapaId) {
  const o = E._crmOps.find((x) => x.id === opId), e = etapaDe(etapaId);
  if (!o || o.etapa_id === etapaId) return;
  if (e.final === 'perdido') return janelaPerder(o);
  // "Contrato fechado" (ou pular direto para assinado) sem ter fechado ainda: primeiro cria cadastro e contrato
  if (!o.ganho_em && (e.nome === 'Contrato fechado' || e.final === 'ganho' || e.ordem > etapaFechado().ordem)) return janelaGanhar(o, null, e.final === 'ganho' || e.nome !== 'Contrato fechado' ? etapaId : null);
  comBotao(null, async () => {
    const d = { etapa_id: etapaId, probabilidade: e.probabilidade, perdido_em: null };
    if (!e.final && e.ordem < etapaFechado().ordem) d.ganho_em = null;
    await q(sb.from('crm_oportunidades').update(d).eq('id', opId));
    aviso(e.final === 'ganho' ? '✍ Contrato assinado! "' + o.titulo + '" foi para a aba Contratos assinados.' : '✓ ' + o.titulo + ' → ' + e.nome + '.'); await recarregarCrm();
  });
}
function etapaFechado() { return (E._crmEtapas || []).find((e) => e.nome === 'Contrato fechado') || { ordem: 99 }; }

// ── Lista ──
function crmLista(alvo) {
  const ops = filtrarOps().filter(opAberta), abertas = ops, h = hojeISO();
  const pond = (o) => (Number(o.valor_estimado) || 0) * (o.probabilidade || 0) / 100;
  alvo.innerHTML = '<div class="kpis">' + kpi('Oportunidades abertas', String(abertas.length), '', 'assinados e perdidos ficam nas abas acima') +
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
  const novasMes = ops.filter((o) => String(o.criado_em).slice(0, 7) === mes).length;
  const assinados = ops.filter((o) => o.assinado_em), ano = Date.now() - 365 * 86400000;
  const porArea = {}; ganhos.filter((o) => new Date(o.ganho_em) > ano).forEach((o) => { const k = o.servico || 'Não informada'; porArea[k] = (porArea[k] || 0) + (Number(o.valor_estimado) || 0); });
  const indic = {}; ops.filter((o) => (o.indicado_por || '').trim()).forEach((o) => { const k = o.indicado_por.trim(); indic[k] = indic[k] || { total: 0, ganhos: 0, valor: 0 }; indic[k].total++; if (o.ganho_em) { indic[k].ganhos++; indic[k].valor += Number(o.valor_estimado) || 0; } });
  const pond = (o) => (Number(o.valor_estimado) || 0) * (o.probabilidade || 0) / 100;
  const funil = (E._crmEtapas || []).filter((e) => !e.final).map((e) => ({ rotulo: e.nome, valor: abertas.filter((o) => o.etapa_id === e.id).length }));
  const motivos = {}; perdas.forEach((o) => { const m = o.motivo_perda || 'sem motivo'; motivos[m] = (motivos[m] || 0) + 1; });
  const origens = {}; ops.forEach((o) => { const k = o.origem || 'Não informada'; origens[k] = origens[k] || { total: 0, ganhos: 0, valor: 0 }; origens[k].total++; if (o.ganho_em) { origens[k].ganhos++; origens[k].valor += Number(o.valor_estimado) || 0; } });
  const meses = [0, 1, 2].map((i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + i); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); });
  const previsao = meses.map((m) => ({ rotulo: nomeMes(new Date(m + '-01T12:00:00')), valor: soma(abertas.filter((o) => String(o.previsao_fechamento || '').slice(0, 7) === m), pond) }));
  const fmtN = (n) => String(n);
  const ranking = (itens, opc, vazio) => itens.some((i) => i.valor) ? graficoRanking(itens, opc) : '<div class="vazio">' + vazio + '</div>';
  alvo.innerHTML = '<div class="kpis">' +
    kpi('Novas no mês', String(novasMes), '', 'oportunidades criadas em ' + nomeMes(new Date()).split(' ')[0].toLowerCase()) +
    kpi('Em aberto', brl(soma(abertas, (o) => o.valor_estimado)), '', abertas.length + ' oportunidade(s) · ponderado ' + brl(soma(abertas, pond))) +
    kpi('Fechados no mês', brl(soma(noMes(ganhos, 'ganho_em'), (o) => o.valor_estimado)), 'verde', noMes(ganhos, 'ganho_em').length + ' contrato(s) · ' + noMes(assinados, 'assinado_em').length + ' assinado(s)') +
    kpi('Perdidas no mês', String(noMes(perdas, 'perdido_em').length), noMes(perdas, 'perdido_em').length ? 'vermelho' : '', '') +
    kpi('Conversão (90 dias)', g90 + p90 ? Math.round(g90 / (g90 + p90) * 100) + '%' : '—', '', g90 + ' ganha(s) de ' + (g90 + p90) + ' decidida(s)') +
    kpi('Tempo médio até fechar', tempo == null ? '—' : Math.round(tempo) + ' dia(s)', '', 'do primeiro contato ao "Contrato fechado"') + '</div>' +
    '<div class="duas-col"><div class="card"><div class="card-hd">Funil — oportunidades abertas por etapa</div><div class="card-bd">' + ranking(funil, { fmt: fmtN, titulo: 'Funil' }, 'Nenhuma oportunidade aberta.') + '</div></div>' +
    '<div class="card"><div class="card-hd">Previsão ponderada — próximos 3 meses</div><div class="card-bd">' + ranking(previsao, { titulo: 'Previsão' }, 'Sem previsão de fechamento nos próximos 3 meses.') +
      '<p class="sub">Pela data de previsão de fechamento de cada oportunidade × probabilidade.</p></div></div></div>' +
    '<div class="duas-col"><div class="card"><div class="card-hd">Valor fechado por área do serviço <span class="sub">últimos 12 meses</span></div><div class="card-bd">' +
      ranking(Object.entries(porArea).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ rotulo: k, valor: v })), { titulo: 'Por área' }, 'Nenhum contrato fechado nos últimos 12 meses.') + '</div></div>' +
    '<div class="card"><div class="card-hd">🤝 Quem mais indica</div>' + (Object.keys(indic).length ? '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Quem indicou</th><th data-tipo="num">Indicações</th><th data-tipo="num">Fechadas</th><th data-tipo="num">Valor fechado</th></tr></thead><tbody>' +
      Object.entries(indic).sort((a, b) => b[1].total - a[1].total || b[1].valor - a[1].valor).map(([k, v]) => '<tr><td><b>' + esc(k) + '</b></td><td class="mono">' + v.total + '</td><td class="mono">' + v.ganhos + '</td><td class="num mono" data-ord="' + v.valor + '">' + brl(v.valor) + '</td></tr>').join('') +
      '</tbody></table></div>' : '<div class="card-bd"><div class="vazio">Nenhuma indicação registrada (campo "Indicado por").</div></div>') + '</div></div>' +
    '<div class="duas-col"><div class="card"><div class="card-hd">Motivos de perda</div><div class="card-bd">' +
      ranking(Object.entries(motivos).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ rotulo: k, valor: v })), { fmt: fmtN, titulo: 'Motivos' }, 'Nenhuma perda registrada.') + '</div></div>' +
    '<div class="card"><div class="card-hd">Origem que mais converte</div><div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Origem</th><th data-tipo="num">Oportunidades</th><th data-tipo="num">Ganhas</th><th data-tipo="num">Conversão</th><th data-tipo="num">Valor ganho</th></tr></thead><tbody>' +
      Object.entries(origens).sort((a, b) => b[1].ganhos - a[1].ganhos).map(([k, v]) => '<tr><td>' + esc(k) + '</td><td class="mono">' + v.total + '</td><td class="mono">' + v.ganhos + '</td><td class="mono" data-ord="' + (v.ganhos / v.total) + '">' + Math.round(v.ganhos / v.total * 100) + '%</td><td class="num mono" data-ord="' + v.valor + '">' + brl(v.valor) + '</td></tr>').join('') +
      '</tbody></table></div></div></div>';
}

// ── Formulário da oportunidade ──
function formOportunidade(o, depois) {
  const novo = !o.id, et = E._crmEtapas || [];
  const abertas = et.filter((e) => !e.final && (e.ordem < etapaFechado().ordem || e.id === o.etapa_id));
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
      campo('Área do serviço', selectServico(o.servico || '')) +
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
      honorario_tipo: f.honorario_tipo.value, servico: f.servico.value, previsao_fechamento: f.previsao_fechamento.value || null, responsavel: f.responsavel.value.trim(),
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
      '<div class="ficha-atalhos">' + (aberta && !o.ganho_em ? '<button class="btn btn-v btn-mini" id="op-ganhou" title="O cliente disse SIM: cria cadastro, contrato e onboarding">✓ Contrato fechado</button>' : '') +
      (aberta && o.ganho_em ? '<button class="btn btn-v btn-mini" id="op-assinado" title="O cliente assinou o contrato: sai do painel">✍ Contrato assinado</button>' : '') +
      (aberta ? '<button class="btn btn-x btn-mini" id="op-perdeu" title="Não fechou (preço, prazo, concorrente, desistiu, sem retorno)">✗ Lead perdido</button>' : '') +
      (aberta ? '<button class="btn btn-o btn-mini" id="op-delegar" title="Delegar a um colaborador: cadastrar, agendar a reunião e preparar o contrato (com a sua validação)">👥 Delegar</button>' : '') +
      (aberta ? '<button class="btn btn-o btn-mini" id="op-reuniao" title="Agenda a reunião: tarefa para cada participante, agenda e convite opcional ao cliente">📅 Reunião</button>' : '') +
      (aberta && mailOp(o) ? '<button class="btn btn-o btn-mini" id="op-follow" title="E-mail pronto de acompanhamento da proposta">✉ Follow-up</button>' : '') +
      (tel ? '<a class="btn btn-o btn-mini" target="_blank" rel="noopener" href="' + linkWa(tel) + '">WhatsApp</a>' : '') +
      (mailOp(o) ? '<a class="btn btn-o btn-mini" href="mailto:' + esc(mailOp(o)) + '">E-mail</a>' : '') +
      '<button class="btn btn-p btn-mini" id="op-editar">Editar</button></div></div>' +
      (e.final === 'perdido' && o.motivo_perda ? '<div class="dica" style="margin-bottom:10px">Perdida: ' + esc(o.motivo_perda) + '</div>' : '') +
      (o.contrato_id ? '<div class="dica" style="margin-bottom:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">' + (e.final === 'ganho' ? 'Contrato assinado.' : 'Contrato criado, <b>aguardando assinatura</b>.') +
        ' <a href="#" id="op-ver-cli">Abrir a ficha do cliente</a><span style="margin-left:auto;display:flex;gap:6px"><button class="btn btn-o btn-mini" type="button" id="op-gerar">📄 Gerar contrato</button>' +
        '<button class="btn btn-o btn-mini" type="button" id="op-ver-ctr">Abrir o contrato</button></span></div>' : '') +
      // Backup 28: o CRM conversa com os outros módulos — proposta, contrato, sala no Meet e agenda
      '<div class="op-integra"><span class="sub">Ferramentas:</span>' +
        '<button class="btn btn-o btn-mini" type="button" id="op-int-prop" title="Proposta com a marca (aba Propostas) ou o gerador de apresentação">💼 Proposta</button>' +
        '<button class="btn btn-o btn-mini" type="button" id="op-int-ctr" title="Gerador de contrato e procuração, já com o cliente">📜 Contrato</button>' +
        '<button class="btn btn-o btn-mini" type="button" id="op-int-meet" title="Cria uma sala nova no Google Meet (abre em outra aba; copie o link para a reunião)">🎥 Meet</button>' +
        '<button class="btn btn-o btn-mini" type="button" id="op-int-agenda" title="Abre o Google Agenda com o evento pronto para salvar">🗓 Agenda</button></div>' +
      '<div class="abas" id="op-abas">' + [['dados', 'Resumo'], ['atividades', 'Atividades'], ['propostas', 'Propostas'], ['documentos', 'Documentos']].map(([k, r]) => '<button data-aba="' + k + '">' + r + '</button>').join('') + '</div>' +
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
  const as = j.querySelector('#op-assinado'); if (as) as.onclick = () => comBotao(as, async () => {
    const fim = (E._crmEtapas || []).find((x) => x.final === 'ganho'); if (!fim) return;
    await q(sb.from('crm_oportunidades').update({ etapa_id: fim.id }).eq('id', o.id));
    aviso('✍ Contrato assinado! A oportunidade foi para a aba "Contratos assinados".'); fecharJanela(j); await recarregarCrm();
  });
  const fu = j.querySelector('#op-follow'); if (fu) fu.onclick = () => janelaFollowup(o);
  const dlg = j.querySelector('#op-delegar'); if (dlg) dlg.onclick = () => janelaDelegar({ oportunidade_id: o.id, cliente_id: o.cliente_id, obs: nomeOp(o) + (o.prospecto_telefone ? ' · ' + o.prospecto_telefone : '') + (o.prospecto_email ? ' · ' + o.prospecto_email : '') });
  const reu = j.querySelector('#op-reuniao'); if (reu) reu.onclick = () => formReuniao({ oportunidade_id: o.id, cliente_id: o.cliente_id }, () => reabrir('atividades'));
  const p = j.querySelector('#op-perdeu'); if (p) p.onclick = () => janelaPerder(o, () => { fecharJanela(j); });
  const vc = j.querySelector('#op-ver-cli'); if (vc) vc.onclick = (ev) => { ev.preventDefault(); abrirFicha(o.cliente_id); };
  const vg = j.querySelector('#op-gerar'); if (vg) vg.onclick = (ev) => abrirGeradorContrato(o.cliente_id, o.contrato_id, ev);
  const vct = j.querySelector('#op-ver-ctr'); if (vct) vct.onclick = () => detalheContrato(o.contrato_id);
  j.querySelector('#op-int-prop').onclick = () => { mostrar('propostas'); window.open('geradores/propostas.html' + (o.cliente_id ? '?cliente=' + encodeURIComponent(o.cliente_id) : ''), '_blank', 'noopener'); };
  j.querySelector('#op-int-ctr').onclick = (ev) => (o.cliente_id ? abrirGeradorContrato(o.cliente_id, o.contrato_id, ev) : abrirCentral('documentos/index.html?modelo=contrato', ev));
  j.querySelector('#op-int-meet').onclick = () => window.open('https://meet.google.com/new', '_blank', 'noopener');
  j.querySelector('#op-int-agenda').onclick = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); window.open(linkAgendaGoogle({ titulo: 'Reunião — ' + o.titulo, inicio: d, duracao_min: 60, detalhe: nomeOp(o) + (mailOp(o) ? ' · ' + mailOp(o) : '') }), '_blank', 'noopener'); };
  await mostrar(aba || 'dados');
  return j;
}
async function opAtividades(alvo, o, repinta) {
  const [at, reus] = await Promise.all([q(sb.from('crm_atividades').select('*').eq('oportunidade_id', o.id).order('quando', { ascending: false })),
    q(sb.from('reunioes').select('*').eq('oportunidade_id', o.id).order('inicio', { ascending: false })).catch(() => [])]);
  const agora = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  alvo.innerHTML = '<div class="titulo-pag" style="margin-bottom:6px"><div><b>Reuniões</b> <span class="sub">' + reus.length + '</span></div><div class="acoes"><button type="button" class="btn btn-o btn-mini" id="at-reuniao">📅 Agendar reunião</button></div></div>' +
    htmlReunioes(reus) + '<div class="secao" style="margin-top:14px">Registrar atividade</div>' +
    '<form id="f-at" class="grade" style="margin-bottom:12px">' + campo('Tipo', selectPares('tipo', TIPOS_ATIV, 'ligacao')) +
    campo('Quando', '<input type="datetime-local" name="quando" value="' + agora + '">') +
    campo('O que foi tratado / o que fazer', '<textarea name="resumo" maxlength="3000" placeholder="Ex.: enviou o relatório da PGFN; retornar na sexta"></textarea>', 'inteiro') +
    '<div class="inteiro acoes"><button type="button" class="btn btn-p btn-mini" id="at-salvar">Registrar</button><span class="sub">Data futura vira tarefa na fila do responsável.</span></div></form>' +
    (at.length ? '<div class="linha-tempo">' + at.map((a) => '<div class="lt-item"><span class="lt-ic">' + ({ ligacao: '📞', reuniao: '🤝', whatsapp: '💬', email: '✉', anotacao: '📝' }[a.tipo] || '•') + '</span><div><b>' +
      esc(rotuloPar(TIPOS_ATIV, a.tipo)) + '</b> <span class="sub">' + quandoBR(a.quando) + (a.feita ? '' : ' · agendada') + '</span><div>' + esc(a.resumo) + '</div></div></div>').join('') + '</div>'
      : '<div class="vazio">Nenhuma atividade ainda.</div>');
  const f = alvo.querySelector('#f-at');
  alvo.querySelector('#at-reuniao').onclick = () => formReuniao({ oportunidade_id: o.id, cliente_id: o.cliente_id }, repinta);
  alvo.querySelectorAll('[data-reu]').forEach((d) => d.onclick = () => formReuniao(reus.find((x) => x.id === d.dataset.reu), repinta));
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
// Proposta com a marca do escritório (serve para PDF e e-mail: estilos embutidos e layout em tabelas)
function htmlProposta(o, p) {
  const cli = nomeOp(o), total = soma(p.itens || [], (i) => i.valor), N = '#1B2A4A', D = '#C9A84C', T = '#374151', C = '#6B7280';
  const texto = String(p.texto || '').split('{cliente}').join(esc(cli)).split('{validade}').join(p.validade ? dataBR(p.validade) : '—')
    .split('{valor}').join(brl(total)).split('{parcelas}').join('')
    .replace(/<h3>/g, '<h3 style="color:' + N + ';font-size:15px;margin:20px 0 6px;letter-spacing:.01em">').replace(/<ul>/g, '<ul style="margin:6px 0 12px;padding-left:20px">').replace(/<li>/g, '<li style="margin:3px 0">');
  const meta = (r, v) => '<td style="padding:10px 14px;border-right:1px solid #E5E7EB"><div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:' + C + '">' + r + '</div>' +
    '<div style="font-size:13.5px;font-weight:bold;color:' + N + ';margin-top:2px">' + v + '</div></td>';
  const passo = (n, t, d) => '<td style="width:33%;vertical-align:top;padding:0 8px"><div style="width:26px;height:26px;border-radius:50%;background:' + D + ';color:' + N + ';font-weight:bold;text-align:center;line-height:26px;font-size:13px">' + n + '</div>' +
    '<div style="font-weight:bold;color:' + N + ';margin-top:6px;font-size:13px">' + t + '</div><div style="color:' + C + ';font-size:12px;margin-top:2px">' + d + '</div></td>';
  return '<div style="font-family:Arial,Helvetica,sans-serif;color:' + T + ';max-width:760px;margin:0 auto;font-size:14px;line-height:1.65;background:#fff">' +
    '<table role="presentation" style="width:100%;border-collapse:collapse;background:' + N + '"><tr><td style="padding:26px 30px">' +
      '<div style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:.06em">ARAÚJO &amp; CASTRO</div>' +
      '<div style="color:' + D + ';font-size:10.5px;letter-spacing:.3em;text-transform:uppercase;margin-top:2px">Advocacia e Consultoria</div></td>' +
      '<td style="padding:26px 30px;text-align:right;color:#CBD5E1;font-size:11px;letter-spacing:.18em;text-transform:uppercase;vertical-align:bottom">Proposta de honorários</td></tr></table>' +
    '<div style="height:4px;background:' + D + '"></div>' +
    '<div style="padding:28px 30px 8px">' +
      '<div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:' + D + ';font-weight:bold">Proposta nº ' + p.versao + '</div>' +
      '<h1 style="color:' + N + ';font-size:24px;line-height:1.25;margin:6px 0 18px">' + esc(p.titulo || 'Proposta de honorários') + '</h1>' +
      '<table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #E5E7EB;border-radius:8px;background:#F8FAFC"><tr>' +
        meta('Preparada para', esc(cli)) + meta('Data', dataBR(hojeISO())) + meta('Válida até', p.validade ? dataBR(p.validade) : '—') +
        '<td style="padding:10px 14px"><div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:' + C + '">Investimento</div><div style="font-size:13.5px;font-weight:bold;color:' + N + ';margin-top:2px">' + brl(total) + '</div></td></tr></table>' +
      '<div style="margin-top:22px">' + texto + '</div>' +
      ((p.itens || []).length ? '<h3 style="color:' + N + ';font-size:15px;margin:24px 0 8px">Investimento</h3>' +
        '<table style="width:100%;border-collapse:collapse;font-size:13.5px"><thead><tr>' +
        '<th style="text-align:left;padding:10px 12px;background:' + N + ';color:#fff;font-weight:bold">Serviço</th><th style="text-align:left;padding:10px 12px;background:' + N + ';color:#fff;font-weight:bold">Forma de pagamento</th>' +
        '<th style="text-align:right;padding:10px 12px;background:' + N + ';color:#fff;font-weight:bold">Valor</th></tr></thead><tbody>' +
        p.itens.map((i, k) => '<tr style="background:' + (k % 2 ? '#F8FAFC' : '#fff') + '"><td style="padding:10px 12px;border-bottom:1px solid #E5E7EB">' + esc(i.servico) + '</td><td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;color:' + C + '">' + esc(i.forma || '') +
          '</td><td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;text-align:right;white-space:nowrap">' + brl(i.valor) + '</td></tr>').join('') +
        '<tr><td colspan="2" style="padding:12px;font-weight:bold;color:' + N + ';border-top:2px solid ' + D + '">Total</td><td style="padding:12px;text-align:right;font-weight:bold;color:' + N + ';white-space:nowrap;border-top:2px solid ' + D + '">' + brl(total) + '</td></tr></tbody></table>' : '') +
      '<h3 style="color:' + N + ';font-size:15px;margin:26px 0 12px">Como seguimos</h3>' +
      '<table role="presentation" style="width:100%;border-collapse:collapse"><tr>' + passo(1, 'Aceite', 'Você confirma a proposta por e-mail, WhatsApp ou assinando abaixo.') +
        passo(2, 'Contrato', 'Enviamos o contrato de prestação de serviços para assinatura.') + passo(3, 'Início', 'Reunião de abertura e lista dos documentos necessários.') + '</tr></table>' +
      (p.validade ? '<p style="color:' + C + ';font-size:12px;margin-top:20px">Esta proposta é válida até ' + dataBR(p.validade) + '. Valores sem custas processuais, taxas e emolumentos, quando houver.</p>' : '') +
      '<table role="presentation" style="width:100%;border-collapse:collapse;margin-top:46px"><tr>' +
        '<td style="width:48%;border-top:1px solid #9CA3AF;padding-top:8px;font-size:12px;color:' + C + '">Araújo &amp; Castro Advocacia e Consultoria</td><td style="width:4%"></td>' +
        '<td style="width:48%;border-top:1px solid #9CA3AF;padding-top:8px;font-size:12px;color:' + C + '">De acordo — ' + esc(cli) + '</td></tr></table></div>' +
    '<div style="margin-top:26px;padding:12px 30px;border-top:1px solid #E5E7EB;color:#9CA3AF;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase">Araújo &amp; Castro · Advocacia e Consultoria</div></div>';
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

// ── Contrato fechado / Lead perdido ──
// Fechar: herda os dados do prospecto e a proposta aceita (valor, parcelas ou mensalidade, área do serviço).
async function janelaGanhar(o, depois, etapaDestino) {
  const cli = o.cliente_id ? E.clientes.find((c) => c.id === o.cliente_id) : null;
  const pr = (await q(sb.from('crm_propostas').select('*').eq('oportunidade_id', o.id).order('versao', { ascending: false }).limit(1)).catch(() => []))[0];
  const itens = (pr && pr.itens) || [], mensais = itens.filter((i) => /mens/i.test(i.forma || '') || /mensal/i.test(i.servico || ''));
  const consult = o.honorario_tipo === 'mensal' || mensais.length > 0;
  const totalPr = soma(itens.filter((i) => !mensais.includes(i)), (i) => i.valor), mensal = soma(mensais, (i) => i.valor);
  const parcelas = (() => { const m = itens.map((i) => /(\d+)\s*(x|parcelas?)/i.exec(i.forma || '')).find(Boolean); return m ? +m[1] : 1; })();
  const j = abrirJanela({ titulo: '✓ Contrato fechado — ' + o.titulo, larga: true,
    corpo: '<div class="dica" style="margin-bottom:10px">O cliente disse <b>sim</b>. Confira os dados: ao confirmar, o sistema cria ' + (cli ? '' : 'o <b>cliente</b> (com os dados do contato' + (o.prospecto_doc ? ' e consulta o cartão CNPJ' : '') + '), ') +
        'o <b>contrato aguardando assinatura</b> ' + (pr ? '(a partir da proposta v' + pr.versao + ')' : '') + ' e a tarefa <b>"Enviar contrato para assinatura"</b>. ' +
        '<b>O financeiro e o onboarding só entram quando o contrato for assinado.</b> Depois, use <b>📄 Gerar contrato</b> na ficha: o gerador abre já preenchido.</div>' +
      '<form id="f-gan" class="grade">' +
      (cli ? '<div class="inteiro dica">Cliente: <b>' + esc(cli.nome) + '</b></div>' :
        campo('Nome do cliente <span class="obrig">*</span>', '<input name="cliente_nome" value="' + esc(o.prospecto_empresa || o.prospecto_nome || '') + '">') +
        campo('CPF/CNPJ', '<input name="cpf_cnpj" value="' + esc(o.prospecto_doc || '') + '">') + campo('E-mail', '<input name="email" value="' + esc(o.prospecto_email || '') + '">') +
        campo('Telefone', '<input name="telefone" value="' + esc(o.prospecto_telefone || '') + '">') +
        campo('Grupo', '<input name="grupo" list="gan-grupos" value="' + esc(o.prospecto_empresa || o.prospecto_nome || '') + '">' + datalistGrupos('gan-grupos'))) +
      '<div class="inteiro secao">Contrato</div>' +
      campo('Descrição do serviço', '<input name="descricao" value="' + esc(o.titulo) + '">', 'inteiro') +
      campo('Área do serviço', selectServico(o.servico || '')) +
      campo('Tipo', '<select name="modalidade"><option value="pontual"' + (consult ? '' : ' selected') + '>Serviço pontual (parcelas)</option><option value="consultoria"' + (consult ? ' selected' : '') + '>Consultoria (mensalidade)</option></select>') +
      '<div class="grade inteiro" id="gan-pontual">' +
        campo('Valor total (R$)', '<input name="valor_total" inputmode="decimal" value="' + valorParaCampo(totalPr || o.valor_estimado || 0) + '">') +
        campo('Número de parcelas', '<input name="num_parcelas" type="number" min="1" max="120" value="' + parcelas + '">') +
        campo('1º vencimento', '<input name="primeiro_vencimento" type="date" value="' + somarDias(hojeISO(), 10) + '">') +
        campo('% de êxito (se houver)', '<input name="percentual_exito" inputmode="decimal">') + '</div>' +
      '<div class="grade inteiro" id="gan-consult">' +
        campo('Mensalidade (R$)', '<input name="valor_mensal" inputmode="decimal" value="' + valorParaCampo(mensal || (consult ? o.valor_estimado : 0) || 0) + '">') +
        campo('Dia do vencimento', '<input name="dia_vencimento" type="number" min="1" max="28" value="10">') +
        campo('1ª competência', '<input name="inicio_competencia" type="month" value="' + hojeISO().slice(0, 7) + '">') + '</div>' +
      campo('Responsável', '<input name="responsavel" list="gan-pessoas" value="' + esc(o.responsavel || '') + '">' + datalistPessoas('gan-pessoas')) +
      '<label class="check inteiro"><input type="checkbox" name="criar_fluxo" checked> Na assinatura, criar o fluxo "Onboarding de cliente" (tarefas com prazos em dias úteis)</label></form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-v" type="button" id="btn-ganhar">Confirmar — Contrato fechado</button></div>' });
  const f = j.querySelector('#f-gan');
  const modo = () => { const c = f.modalidade.value === 'consultoria'; j.querySelector('#gan-pontual').classList.toggle('escondido', c); j.querySelector('#gan-consult').classList.toggle('escondido', !c); };
  f.modalidade.onchange = modo; modo();
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-ganhar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const consultoria = f.modalidade.value === 'consultoria';
    const valor = !consultoria && f.valor_total.value.trim() ? lerValor(f.valor_total.value) : 0, mens = consultoria ? lerValor(f.valor_mensal.value || '') : null;
    if (Number.isNaN(valor)) throw new Error('Valor inválido.');
    if (consultoria && !(mens > 0)) throw new Error('Informe a mensalidade da consultoria.');
    const p = { cliente_id: o.cliente_id || '', descricao: f.descricao.value.trim(), servico: f.servico.value, modalidade: f.modalidade.value, valor_total: valor,
      num_parcelas: parseInt(f.num_parcelas.value, 10) || 1, primeiro_vencimento: f.primeiro_vencimento.value || '',
      percentual_exito: f.percentual_exito.value ? String(lerValor(f.percentual_exito.value)) : '',
      valor_mensal: consultoria ? String(mens) : '', dia_vencimento: f.dia_vencimento.value || '10', inicio_competencia: f.inicio_competencia.value ? f.inicio_competencia.value + '-01' : '',
      responsavel: f.responsavel.value.trim(), criar_fluxo: f.criar_fluxo.checked };
    if (!cli) Object.assign(p, { cliente_nome: f.cliente_nome.value.trim(), cpf_cnpj: soDigitos(f.cpf_cnpj.value), email: f.email.value.trim(), telefone: f.telefone.value.trim(), grupo: f.grupo.value.trim() });
    if (!cli && !p.cliente_nome) throw new Error('Informe o nome do cliente.');
    const r = await q(sb.rpc('crm_ganhar', { p_op: o.id, p }));
    if (etapaDestino) await q(sb.from('crm_oportunidades').update({ etapa_id: etapaDestino }).eq('id', o.id));
    // cliente novo com CNPJ: busca o cartão CNPJ na hora (se a função estiver publicada)
    if (!cli && soDigitos(p.cpf_cnpj).length === 14 && r && r.cliente_id) chamarFuncao('erp-cnpj', { cliente_id: r.cliente_id, auto: true }).catch(() => {});
    aviso('✓ Contrato fechado: contrato aguardando assinatura e a tarefa "Enviar contrato para assinatura" criados. Gere o contrato em 📄 Gerar contrato.');
    fecharJanela(j); if (depois) depois(r);
    await carregarCadastros(true); await recarregarCrm();
  });
}
const MOTIVOS_PERDA = ['Preço', 'Prazo', 'Foi para concorrente', 'Desistiu', 'Sem retorno', 'Outro'];
function janelaPerder(o, depois) {
  const j = abrirJanela({ titulo: '✗ Lead perdido — ' + o.titulo,
    corpo: '<form id="f-per" class="grade">' + campo('Motivo <span class="obrig">*</span>', '<select name="motivo"><option value="">— escolha —</option>' + MOTIVOS_PERDA.map((m) => '<option>' + m + '</option>').join('') + '</select>', 'inteiro') +
      campo('Detalhe (opcional)', '<input name="detalhe" maxlength="200" placeholder="Ex.: achou caro; fechou com o escritório X">', 'inteiro') +
      '<label class="check inteiro"><input type="checkbox" name="reativar"> Criar tarefa para retomar o contato daqui a 6 meses</label></form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-x" type="button" id="btn-perder">Confirmar — Lead perdido</button></div>' });
  const f = j.querySelector('#f-per');
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-perder').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.motivo.value) throw new Error('Escolha o motivo.');
    const motivo = f.motivo.value + (f.detalhe.value.trim() ? ' — ' + f.detalhe.value.trim() : '');
    await q(sb.rpc('crm_perder', { p_op: o.id, p_motivo: motivo, p_reativar: f.reativar.checked }));
    aviso('✓ Lead perdido registrado (aba "Leads perdidos").'); fecharJanela(j); if (depois) depois(); await recarregarCrm();
  });
}
// Follow-up da proposta: e-mail pronto, 1 clique
async function janelaFollowup(o) {
  const pr = (await q(sb.from('crm_propostas').select('titulo, versao, enviada_em').eq('oportunidade_id', o.id).order('versao', { ascending: false }).limit(1)).catch(() => []))[0];
  const nome = (o.prospecto_nome || nomeOp(o)).split(' ')[0];
  const texto = 'Olá, ' + nome + '! Tudo bem?\n\nPassando para saber se conseguiu analisar a nossa proposta' + (pr ? ' "' + (pr.titulo || 'de honorários') + '"' : '') + (pr && pr.enviada_em ? ', enviada em ' + dataBR(pr.enviada_em) : '') + '.\n\n' +
    'Se tiver qualquer dúvida sobre o escopo, os valores ou a forma de pagamento, fico à disposição para uma conversa rápida — posso ligar no horário que for melhor para você.\n\nUm abraço.';
  const j = abrirJanela({ titulo: '✉ Follow-up — ' + o.titulo, larga: true,
    corpo: '<form id="f-fu" class="grade">' + campo('Para', '<input name="para" value="' + esc(mailOp(o)) + '">') + campo('Assunto', '<input name="assunto" value="' + esc('Nossa proposta' + (pr && pr.titulo ? ' — ' + pr.titulo : '')) + '">') +
      campo('Mensagem', '<textarea name="texto" rows="9">' + esc(texto) + '</textarea>', 'inteiro') + '</form><p class="sub">Vai com a marca do escritório e fica registrado nas atividades da oportunidade.</p>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="fu-enviar">Enviar</button></div>' });
  const f = j.querySelector('#f-fu');
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#fu-enviar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    await q(sb.rpc('crm_followup_email', { p_op: o.id, p_para: f.para.value.trim(), p_assunto: f.assunto.value.trim(), p_texto: f.texto.value }));
    aviso('✓ Follow-up na fila de e-mails (sai em até 5 minutos).'); fecharJanela(j);
  });
}
// Cadastro rápido: só nome, telefone e interesse
function cadastroRapido() {
  const j = abrirJanela({ titulo: '⚡ Cadastro rápido',
    corpo: '<form id="f-rap" class="grade">' + campo('Nome <span class="obrig">*</span>', '<input name="nome" placeholder="Pessoa ou empresa">', 'inteiro') +
      campo('Telefone / WhatsApp', '<input name="tel" inputmode="tel">') + campo('Interesse', '<input name="interesse" placeholder="Ex.: parcelamento, holding, defesa">') + '</form>' +
      '<p class="sub">Entra em "Novo contato" com você como responsável. O resto dá para completar depois (Editar).</p>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-p" type="button" id="rap-salvar">Salvar</button></div>' });
  const f = j.querySelector('#f-rap');
  j.querySelector('#rap-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const nome = f.nome.value.trim(); if (!nome) throw new Error('Informe o nome.');
    const et = (E._crmEtapas || []).filter((e) => !e.final)[0];
    await q(sb.from('crm_oportunidades').insert({ titulo: (f.interesse.value.trim() || 'Contato') + ' — ' + nome, prospecto_nome: nome, prospecto_telefone: f.tel.value.trim(),
      etapa_id: et ? et.id : null, probabilidade: et ? et.probabilidade : 10, responsavel: (E.perfil && (E.perfil.nome || '').split(' ')[0]) || '' }));
    aviso('✓ Contato cadastrado em "Novo contato".'); fecharJanela(j); await recarregarCrm();
  });
}
// Etapas: o que significa cada uma e o prazo (em dias) antes de virar tarefa "parada"
async function janelaEtapasCrm() {
  const et = await q(sb.from('crm_etapas').select('*').order('ordem'));
  const admin = E.perfil && E.perfil.papel === 'admin';
  const j = abrirJanela({ titulo: '⚙ Etapas do CRM', larga: true,
    corpo: '<div class="dica" style="margin-bottom:10px">Se a oportunidade ficar na etapa mais dias do que o prazo, o sistema cria uma tarefa para o responsável (Central de automações → "CRM: oportunidade parada").</div>' +
      '<div class="tabela-wrap"><table><thead><tr><th>Etapa</th><th>O que significa</th><th class="num">Prazo (dias)</th></tr></thead><tbody>' +
      et.map((e) => '<tr><td><b>' + esc(e.nome) + '</b>' + (e.final ? '<div class="sub">fim — sai do painel</div>' : '') + '</td><td><input data-desc="' + e.id + '" value="' + esc(e.descricao || '') + '"' + (admin ? '' : ' disabled') + ' style="width:100%"></td>' +
        '<td class="num">' + (e.final ? '—' : '<input data-dias="' + e.id + '" type="number" min="0" max="90" value="' + (e.dias_alerta == null ? '' : e.dias_alerta) + '"' + (admin ? '' : ' disabled') + ' style="width:70px">') + '</td></tr>').join('') + '</tbody></table></div>',
    rodape: '<span class="sub">' + (admin ? 'Vazio = sem prazo.' : 'Só o administrador altera.') + '</span>' + (admin ? '<button class="btn btn-p" type="button" id="et-salvar">Salvar</button>' : '') });
  const b = j.querySelector('#et-salvar');
  if (b) b.onclick = () => comBotao(b, async () => {
    for (const e of et) {
      const d = { descricao: j.querySelector('[data-desc="' + e.id + '"]').value.trim() }, x = j.querySelector('[data-dias="' + e.id + '"]');
      if (x) d.dias_alerta = x.value === '' ? null : Math.max(0, parseInt(x.value, 10) || 0);
      await q(sb.from('crm_etapas').update(d).eq('id', e.id));
    }
    aviso('✓ Etapas salvas.'); fecharJanela(j); await recarregarCrm();
  });
}

// ── Modelos de proposta ──
async function janelaModelosProposta() {
  const ms = await q(sb.from('crm_modelos_proposta').select('*').order('nome'));
  const j = abrirJanela({ titulo: 'Modelos de proposta', larga: true,
    corpo: '<div class="lista-ficha">' + ms.map((m) => '<div class="item-ficha"><div><b>' + esc(m.nome) + '</b><div class="sub">' + (m.itens || []).map((i) => esc(i.servico)).join(' · ') + '</div></div>' +
      '<span><button class="btn btn-o btn-mini" data-mp-ver="' + m.id + '">👁 Ver como fica</button> <button class="btn btn-o btn-mini" data-mp="' + m.id + '">Editar</button></span></div>').join('') + '</div>',
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
  j.querySelectorAll('[data-mp-ver]').forEach((b) => b.onclick = () => {
    const m = ms.find((x) => x.id === b.dataset.mpVer), w = window.open('', '_blank');
    if (!w) return aviso('O navegador bloqueou a janela. Libere pop-ups para este site.', true);
    w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Modelo — ' + esc(m.nome) + '</title></head><body style="background:#EEF1F6;padding:20px">' +
      htmlProposta({ prospecto_empresa: 'Empresa Exemplo Ltda' }, { versao: 1, titulo: m.nome, texto: m.texto, itens: (m.itens || []).map((i) => Object.assign({}, i, { valor: i.valor || 1000 })), validade: somarDias(hojeISO(), 15) }) + '</body></html>');
    w.document.close();
  });
}

// ═══ Backup 26: REUNIÃO a partir do lead (ou da ficha do cliente) ═══
// Vira tarefa de cada participante, cai na agenda (Google Agenda assinado), entra nas atividades do CRM e na linha do tempo.
// Convite por e-mail ao cliente só quando marcado "Sim" (e só sai com a pausa de e-mails desligada).
async function formReuniao(r, depois) {
  r = r || {};
  const novo = !r.id;
  const o = r.oportunidade_id ? (await q(sb.from('crm_oportunidades').select('id, titulo, cliente_id, prospecto_email, prospecto_nome, responsavel').eq('id', r.oportunidade_id)))[0] : null;
  const cli = r.cliente_id || (o && o.cliente_id) || null;
  const ini = r.inicio ? new Date(r.inicio) : (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; })();
  const pad = (n) => String(n).padStart(2, '0');
  const dataLocal = ini.getFullYear() + '-' + pad(ini.getMonth() + 1) + '-' + pad(ini.getDate()), horaLocal = pad(ini.getHours()) + ':' + pad(ini.getMinutes());
  let destino = '';
  if (cli) { const c = E.clientes.find((x) => x.id === cli); destino = c ? 'o contato de "Convites" de ' + c.nome + ' (ou o setor Sócio / contato Geral)' : ''; }
  else if (o && o.prospecto_email) destino = o.prospecto_email;
  const j = abrirJanela({ titulo: novo ? '📅 Agendar reunião' : '📅 Reunião', larga: true,
    corpo: '<form id="f-reu" class="grade">' +
      campo('Assunto <span class="obrig">*</span>', '<input name="titulo" maxlength="200" value="' + esc(r.titulo || (o ? 'Reunião de diagnóstico — ' + o.titulo : 'Reunião')) + '">', 'inteiro') +
      campo('Data <span class="obrig">*</span>', '<input name="data" type="date" value="' + dataLocal + '">') +
      campo('Hora <span class="obrig">*</span>', '<input name="hora" type="time" value="' + horaLocal + '">') +
      campo('Duração', '<select name="duracao_min">' + [[30, '30 min'], [60, '1 hora'], [90, '1h30'], [120, '2 horas']].map(([v, t]) => '<option value="' + v + '"' + (Number(r.duracao_min || 60) === v ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>') +
      campo('Local ou link', '<div class="reu-local"><input name="local" maxlength="300" placeholder="Ex.: escritório, ou o link do Meet/Zoom" value="' + esc(r.local || '') + '">' +
        '<button type="button" class="btn btn-o btn-mini" id="reu-meet" title="Abre uma sala nova no Google Meet: copie o endereço e cole aqui">🎥 Criar sala no Meet</button>' +
        '<button type="button" class="btn btn-o btn-mini" id="reu-agenda" title="Abre o Google Agenda com a reunião preenchida">🗓 Google Agenda</button></div>', 'inteiro') +
      '<div class="inteiro"><div class="secao">Participantes do escritório</div>' + campoParticipantes(r.participantes || (o && o.responsavel) || (E.perfil && E.perfil.nome) || '') + '</div>' +
      '<div class="inteiro"><div class="secao">Enviar convite por e-mail ao cliente?</div><div class="segmento" id="reu-convite">' +
        [['nao', 'Não'], ['sim', 'Sim, enviar o convite']].map(([v, t]) => '<button type="button" data-v="' + v + '"' + ((r.convite ? 'sim' : 'nao') === v ? ' class="ativo"' : '') + '>' + t + '</button>').join('') + '</div>' +
        '<div class="grade" id="reu-conv-det" style="margin-top:8px">' +
          campo('E-mail do convite (opcional)', '<input name="convite_para" type="email" placeholder="' + esc(destino || 'e-mail do cliente') + '" value="' + esc(r.convite_para || '') + '">', 'inteiro') +
          '<div class="dica inteiro">Vazio = vai para ' + esc(destino || 'o e-mail do lead') + '. O convite leva o arquivo para o cliente salvar na agenda. <b>Com a pausa de e-mails ligada, ele fica retido.</b></div></div></div>' +
      campo('Observação', '<textarea name="obs" maxlength="2000">' + esc(r.obs || '') + '</textarea>', 'inteiro') + '</form>',
    rodape: (!novo ? '<button class="btn btn-x" type="button" id="reu-cancelar">Cancelar reunião</button>' : '<span></span>') +
      '<div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Fechar</button><button class="btn btn-p" type="button" id="reu-salvar">' + (novo ? 'Agendar' : 'Salvar') + '</button></div>' });
  const f = j.querySelector('#f-reu');
  let convite = !!r.convite;
  const seg = j.querySelector('#reu-convite');
  const mostrarConv = () => { seg.querySelectorAll('button').forEach((b) => b.classList.toggle('ativo', (b.dataset.v === 'sim') === convite)); j.querySelector('#reu-conv-det').classList.toggle('escondido', !convite); };
  seg.onclick = (ev) => { const b = ev.target.closest('button'); if (b) { convite = b.dataset.v === 'sim'; mostrarConv(); } };
  mostrarConv();
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#reu-meet').onclick = () => { window.open('https://meet.google.com/new', '_blank', 'noopener'); aviso('Sala criada no Meet (outra aba): copie o endereço e cole em "Local ou link".'); };
  j.querySelector('#reu-agenda').onclick = () => { if (!f.data.value || !f.hora.value) return aviso('Informe a data e a hora.', true);
    window.open(linkAgendaGoogle({ titulo: f.titulo.value, inicio: new Date(f.data.value + 'T' + f.hora.value + ':00'), duracao_min: Number(f.duracao_min.value) || 60, local: f.local.value, detalhe: f.obs.value }), '_blank', 'noopener'); };
  j.querySelector('#reu-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.titulo.value.trim()) throw new Error('Informe o assunto da reunião.');
    if (!f.data.value || !f.hora.value) throw new Error('Informe a data e a hora.');
    const part = lerParticipantes(j);
    if (!part) throw new Error('Marque pelo menos um participante do escritório.');
    const dados = { titulo: f.titulo.value.trim(), inicio: new Date(f.data.value + 'T' + f.hora.value + ':00').toISOString(), duracao_min: Number(f.duracao_min.value) || 60,
      local: f.local.value.trim(), participantes: part, convite, convite_para: convite ? f.convite_para.value.trim() : '', obs: f.obs.value.trim(),
      oportunidade_id: r.oportunidade_id || null, cliente_id: cli };
    if (novo) await q(sb.from('reunioes').insert(dados)); else await q(sb.from('reunioes').update(dados).eq('id', r.id));
    aviso('✓ Reunião ' + (novo ? 'agendada' : 'atualizada') + ': tarefa para ' + part + (convite ? ' e convite ao cliente na fila de e-mails.' : '.'));
    fecharJanela(j); if (depois) await depois();
  });
  const bc = j.querySelector('#reu-cancelar');
  if (bc) bc.onclick = () => comBotao(bc, async () => {
    if (!confirm('Cancelar esta reunião? As tarefas dos participantes são canceladas.')) return;
    await q(sb.from('reunioes').update({ status: 'cancelada' }).eq('id', r.id)); aviso('Reunião cancelada.'); fecharJanela(j); if (depois) await depois();
  });
}
// lista de reuniões (ficha do lead e do cliente)
function htmlReunioes(lista) {
  if (!lista.length) return '<div class="sub">Nenhuma reunião agendada.</div>';
  return '<div class="lista-ficha">' + lista.map((x) => '<div class="item-ficha clicavel" data-reu="' + x.id + '"><div><b>' + esc(x.titulo) + '</b>' +
    ' <span class="pill ' + (x.status === 'cancelada' ? 'neutro' : new Date(x.inicio) < new Date() ? 'pago' : 'aberto') + '">' + (x.status === 'cancelada' ? 'cancelada' : dataHoraBR(x.inicio)) + '</span>' +
    (x.convite ? ' <span class="pill ' + (x.convite_enviado_em ? 'pago' : 'hoje') + '">' + (x.convite_enviado_em ? '✉ convite enviado' : '✉ convite na fila') + '</span>' : '') +
    '<div class="sub">' + esc([x.local, x.participantes].filter(Boolean).join(' · ')) + '</div></div></div>').join('') + '</div>';
}

// Backup 28: evento pronto no Google Agenda (a pessoa só confere e salva; dá para ligar o Meet lá também)
function linkAgendaGoogle(ev) {
  const z = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ini = ev.inicio instanceof Date ? ev.inicio : new Date(ev.inicio), fim = new Date(ini.getTime() + (ev.duracao_min || 60) * 60000);
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(ev.titulo || 'Reunião') + '&dates=' + z(ini) + '/' + z(fim) +
    (ev.local ? '&location=' + encodeURIComponent(ev.local) : '') + (ev.detalhe ? '&details=' + encodeURIComponent(ev.detalhe) : '');
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
    '<div class="acoes"><button class="btn btn-o" id="pub-oabs">⚙ Monitoramento (OABs e clientes)</button><button class="btn btn-o" id="pub-nav" title="Busca direto do seu computador — use se o servidor não conseguir falar com o CNJ">🌐 Buscar pelo navegador</button><button class="btn btn-p" id="pub-buscar">↻ Buscar agora</button></div></div>' +
    '<div class="filtros"><div class="segmento" id="pub-st">' + [['nova', 'Novas'], ['lida', 'Lidas'], ['tratada', 'Tratadas'], ['descartada', 'Descartadas'], ['', 'Todas']].map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<select class="busca sel" id="pub-dias"><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="">Todo o período</option></select>' +

    '<input class="busca" id="pub-busca" placeholder="Buscar no texto, processo ou parte" autocomplete="off"></div>' +
    // Backup 21: tribunais como filtro de botões — só os que têm publicação pendente (nova ou lida) no período
    // Backup 35: filtro por advogado (os nomes cadastrados em Monitoramento → OABs) em botões, como os tribunais
    '<div class="filtros pub-trib-linha"><div class="segmento" id="pub-advs" role="group" aria-label="Advogado"></div></div>' +
    '<div class="filtros pub-trib-linha"><div class="segmento" id="pub-trib" role="group" aria-label="Tribunal"></div></div><div id="pub-corpo"><div class="carregando">Carregando…</div></div>';
  $('pub-oabs').onclick = () => janelaOabs();
  $('pub-buscar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const data = await chamarFuncao('erp-publicacoes', {});
    if (!data.oabs && !data.partes) throw new Error('Cadastre pelo menos uma OAB ou um cliente em "Monitoramento".');
    const erro = data.erros && data.erros.length ? data.erros[0] : '';
    aviso('✓ Busca feita: ' + data.lidas + ' publicação(ões) lida(s), ' + data.novas + ' nova(s).' + (erro ? ' Atenção: ' + erro : ''), !!erro);
    if (erro && /recusou|conexão|navegador/i.test(erro) && confirm('O servidor não conseguiu falar com o Diário do CNJ.\n\nBuscar agora pelo seu navegador?')) await buscarPubNoNavegador();
    await TELAS.publicacoes();
  });
  $('pub-nav').onclick = (ev) => comBotao(ev.currentTarget, async () => { await buscarPubNoNavegador(); await TELAS.publicacoes(); });
  $('pub-st').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.status = b.dataset.v; pintarPublicacoes(); } };
  $('pub-trib').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.tribunal = b.dataset.v; pintarPublicacoes(); } };
  $('pub-dias').onchange = (ev) => { F.dias = ev.target.value; carregarPublicacoes(); };
  $('pub-advs').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.adv = b.dataset.v; pintarPublicacoes(); } };
  $('pub-dias').value = F.dias; $('pub-busca').value = F.busca;
  let t; $('pub-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; pintarPublicacoes(); }, 250); };
  q(sb.from('configuracoes').select('valor').eq('chave', 'publicacoes_ultima').maybeSingle()).then((u) => {
    if (u && u.valor && $('pub-ult')) $('pub-ult').textContent = 'Última busca: ' + quandoRodou(u.valor.quando) + ' · ' + u.valor.novas + ' nova(s) de ' + u.valor.lidas + ' lida(s)' +
      (u.valor.erros && u.valor.erros.length ? ' · ⚠ ' + u.valor.erros[0] : '') + ' · automática às 7h e 13h (dias úteis)';
  }).catch(() => {});
  await carregarPublicacoes();
};
// Partes em linhas: "Autor: …" e "Réu: …" (polo do Diário; as antigas sem polo continuam em "Partes:")
// Backup 28: identificação no topo de toda publicação (para copiar e encaixar rápido):
//   Processo: 5003925-39.2025.8.13.0604 / Autor: … / Réu: … — Advogado: Pedro
function partesPub(p) {
  const G = { 'Autor': [], 'Réu': [], 'Partes': [] };
  if (Array.isArray(p.polos) && p.polos.some((d) => d && d.polo)) p.polos.forEach((d) => { if (d && d.nome) G[{ A: 'Autor', P: 'Réu' }[String(d.polo || '').toUpperCase()] || 'Partes'].push(d.nome); });
  else String(p.destinatarios || '').split(/;\s*/).filter(Boolean).forEach((x) => { const m = /^(Autor|Réu):\s*(.*)$/.exec(x); if (m) G[m[1]].push(m[2]); else G.Partes.push(x); });
  const adv = p.advogado || String(p.advogados || '').split(';')[0].replace(/\s*OAB.*$/i, '').trim();
  const linhas = [['Processo', p.processo || '—']].concat(Object.keys(G).filter((k) => G[k].length).map((k) => [k, G[k].join(' · ')]));
  const txt = linhas.map((l) => l[0] + ': ' + l[1]).join('\n') + (adv ? ' - Advogado: ' + adv : '');
  return '<div class="pub-id"><div class="pub-id-txt">' + linhas.map((l, i) => '<div><b>' + l[0] + ':</b> ' + (l[0] === 'Processo' ? '<span class="mono">' + esc(l[1]) + '</span>' : esc(l[1])) +
      (i === linhas.length - 1 && adv ? ' <span class="pub-adv">— Advogado: <b>' + esc(adv) + '</b></span>' : '') + '</div>').join('') + '</div>' +
    '<button type="button" class="btn btn-o btn-mini" data-copiar-id="' + esc(txt) + '" title="Copiar Processo, Autor, Réu e Advogado">📋 Copiar</button></div>';
}
async function carregarPublicacoes() {
  const F = E.pub;
  E._pubs = await buscarTodos(() => { let c = sb.from('publicacoes').select('id, data_disponibilizacao, tribunal, orgao, tipo, processo, processo_numero, classe, texto, link, destinatarios, polos:bruto->destinatarios, advogados, oab_numero, oab_uf, advogado, parte_monitorada, processo_id, status, tarefa_id')
    .order('data_disponibilizacao', { ascending: false, nullsFirst: false }); if (F.dias) c = c.gte('data_disponibilizacao', somarDias(hojeISO(), -Number(F.dias))); return c; });
  const opts = (id, vals, rot) => { const s = $(id); if (!s) return; const v = s.value; s.innerHTML = '<option value="">' + rot + '</option>' + [...new Set(vals.filter(Boolean))].sort().map((x) => '<option>' + esc(x) + '</option>').join(''); s.value = v; };
  void opts;
  E._pubAdvs = await q(sb.from('oabs_monitoradas').select('advogado')).then((l) => l.map((o) => o.advogado)).catch(() => []);
  pintarPublicacoes();
}
function pintarPublicacoes() {
  const F = E.pub, b = normalizar(F.busca);
  if (!$('pub-corpo')) return;
  const todas = E._pubs || [];
  // Backup 36: cada contador mostra exatamente o que aparece ao clicar nele — vale o recorte dos OUTROS filtros
  // (situação × advogado × tribunal × busca). Ex.: 61 no total, 5 tratadas → Novas 56 · Tratadas 5 · Todas 61.
  const pn = (n) => normalizar(String(n || '').trim().split(/\s+/)[0] || '');
  const doAdv = (p, n) => { const k = pn(n); return !!k && (pn(p.advogado) === k || normalizar(p.advogados || '').split(/[;,]/).some((x) => pn(x) === k)); };
  const okSt = (p) => !F.status || p.status === F.status, okAdv = (p) => !F.adv || doAdv(p, F.adv), okTrib = (p) => !F.tribunal || p.tribunal === F.tribunal;
  const okBusca = (p) => !b || normalizar(p.texto + ' ' + p.processo + ' ' + p.destinatarios + ' ' + p.orgao).includes(b);
  const semSt = todas.filter((p) => okAdv(p) && okTrib(p) && okBusca(p));
  document.querySelectorAll('#pub-st button').forEach((x) => { x.classList.toggle('ativo', x.dataset.v === F.status);
    const n = semSt.filter((p) => !x.dataset.v || p.status === x.dataset.v).length;
    x.innerHTML = esc(x.dataset.rot || (x.dataset.rot = x.textContent)) + ' <span class="seg-n">' + n + '</span>'; });
  const semTrib = todas.filter((p) => okSt(p) && okAdv(p) && okBusca(p));
  const pend = {}; semTrib.filter((p) => p.tribunal).forEach((p) => { pend[p.tribunal] = (pend[p.tribunal] || 0) + 1; });
  const tribs = Object.keys(pend).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (F.tribunal && !pend[F.tribunal]) F.tribunal = '';
  const st = $('pub-trib');
  if (st) { st.parentNode.hidden = !tribs.length;
    st.innerHTML = '<button type="button" data-v="" class="' + (F.tribunal ? '' : 'ativo') + '">Todos os tribunais <span class="seg-n">' + semTrib.length + '</span></button>' +
      tribs.map((t) => '<button type="button" data-v="' + esc(t) + '" class="' + (F.tribunal === t ? 'ativo' : '') + '">' + esc(t) + ' <span class="seg-n">' + pend[t] + '</span></button>').join(''); }
  const nomesAdv = [...new Set((E._pubAdvs || []).concat(todas.map((p) => p.advogado)).filter(Boolean).map((n) => String(n).trim().split(/\s+/)[0]))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (F.adv && !nomesAdv.includes(F.adv)) F.adv = '';
  const semAdv = todas.filter((p) => okSt(p) && okTrib(p) && okBusca(p));
  const sa = $('pub-advs');
  if (sa) { sa.parentNode.hidden = !nomesAdv.length;
    sa.innerHTML = '<button type="button" data-v="" class="' + (F.adv ? '' : 'ativo') + '">Todos os advogados <span class="seg-n">' + semAdv.length + '</span></button>' + nomesAdv.map((n) => { const c = semAdv.filter((p) => doAdv(p, n)).length;
      return '<button type="button" data-v="' + esc(n) + '" class="' + (F.adv === n ? 'ativo' : '') + '">' + esc(n) + ' <span class="seg-n">' + c + '</span></button>'; }).join(''); }
  const lista = todas.filter((p) => okSt(p) && okAdv(p) && okTrib(p) && okBusca(p));
  const conta = (s) => semSt.filter((p) => p.status === s).length;
  $('pub-corpo').innerHTML = '<div class="kpis">' + kpi('Novas', String(conta('nova')), conta('nova') ? 'ambar' : 'verde', 'ainda não lidas') + kpi('Lidas', String(conta('lida')), '', 'sem tarefa ainda') +
    kpi('Tratadas', String(conta('tratada')), 'verde', 'com tarefa criada') + '</div>' +
    (lista.length ? lista.map((p) => '<div class="card pub-card' + (p.status === 'nova' ? ' pub-nova' : '') + '" data-pub="' + p.id + '"><div class="card-bd">' +
      '<div class="pub-topo"><div><span class="pill ' + ({ nova: 'hoje', lida: 'aberto', tratada: 'pago', descartada: 'neutro' }[p.status]) + '">' + p.status + '</span> ' +
      '<b>' + esc(p.tipo || 'Comunicação') + '</b> · ' + esc(p.tribunal) + ' · <span class="mono">' + dataBR(p.data_disponibilizacao) + '</span>' +
      '<div class="sub">' + esc(p.orgao) + (p.classe ? ' · ' + esc(p.classe) : '') + '</div></div>' +
      '<div class="sub" style="text-align:right">' + (p.processo ? '<b class="mono">' + esc(p.processo) + '</b>' : '') + (p.processo_id ? ' <span class="pill pago" title="Processo cadastrado no ERP">no ERP</span>' : '') +
      '<div>' + (p.oab_numero ? esc(p.advogado ? p.advogado + ' · ' : '') + 'OAB ' + esc(p.oab_numero + '/' + p.oab_uf) : '🏢 cliente monitorado: ' + esc(p.parte_monitorada || '—')) + '</div></div></div>' +
      partesPub(p) +
      '<div class="pub-texto' + (p.texto.length > 500 ? ' curto' : '') + '">' + destacar(p.texto) + '</div>' + (p.texto.length > 500 ? '<button class="btn-link" data-ver>ver tudo</button>' : '') +
      '<div class="acoes" style="margin-top:10px">' + (p.tarefa_id || p.status === 'tratada' ? '' : '<button class="btn btn-p btn-mini" data-tarefa="' + p.id + '">+ Criar tarefa (' + prazoSugerido(p) + ' dias úteis)</button>') +
      (p.status === 'nova' ? '<button class="btn btn-o btn-mini" data-st="lida">Marcar lida</button>' : '') +
      (p.status !== 'tratada' ? '<button class="btn btn-o btn-mini" data-st="tratada">Tratada</button>' : '') +
      (p.status !== 'descartada' ? '<button class="btn btn-o btn-mini" data-st="descartada">Descartar</button>' : '<button class="btn btn-o btn-mini" data-st="nova">Voltar para novas</button>') +
      (p.link && /^https?:/.test(p.link) ? '<a class="btn btn-o btn-mini" href="' + esc(p.link) + '" target="_blank" rel="noopener">Abrir no Diário</a>' : '') + '</div></div></div>').join('')
      : '<div class="card">' + (todas.length ? vazio('Nenhuma publicação neste recorte — mude o filtro.') : vazio('Nenhuma publicação ainda. Cadastre as OABs do escritório e o sistema busca no Diário todo dia.', 'OABs monitoradas', '#pub-oabs')) + '</div>');
  $('pub-corpo').querySelectorAll('[data-copiar-id]').forEach((b2) => b2.onclick = async () => {
    try { await navigator.clipboard.writeText(b2.dataset.copiarId); aviso('✓ Copiado: Processo, Autor, Réu e Advogado.'); } catch (e) { aviso('Não consegui copiar: selecione o texto e use Ctrl+C.', true); } });
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
  const [os, ps] = await Promise.all([q(sb.from('oabs_monitoradas').select('*').order('numero')), q(sb.from('partes_monitoradas').select('*').order('nome')).catch(() => [])]);
  await carregarCadastros();
  const j = abrirJanela({ titulo: 'Monitoramento de publicações', larga: true,
    corpo: '<div class="dica" style="margin-bottom:10px">O sistema busca no <b>Diário de Justiça Eletrônico Nacional (CNJ)</b> as publicações das <b>OABs</b> e dos <b>clientes</b> abaixo, todo dia útil às 7h e 13h. ' +
        'O Diário não pesquisa por CNPJ: o cliente é buscado pelo <b>nome (razão social)</b> e o sistema confere o nome entre as partes. Para receber citações pelo CNPJ, cadastre o escritório como representante da empresa no <b>Domicílio Judicial Eletrônico</b>.</div>' +
      '<div class="secao">OABs</div><div class="lista-ficha">' + (os.map((o) => '<div class="item-ficha"><div><b>OAB ' + esc(o.numero) + '/' + esc(o.uf) + '</b> <span class="sub">' + esc(o.advogado || '') + '</span>' + (o.ativo ? '' : ' <span class="pill neutro">pausada</span>') + '</div>' +
        '<span><button class="btn btn-o btn-mini" data-oab-at="' + o.id + '">' + (o.ativo ? 'Pausar' : 'Ativar') + '</button> <button class="btn btn-x btn-mini" data-oab-x="' + o.id + '">Excluir</button></span></div>').join('') || '<div class="sub">Nenhuma OAB cadastrada.</div>') + '</div>' +
      '<form class="grade" id="f-oab" style="margin-top:8px">' + campo('Número da OAB', '<input name="numero" inputmode="numeric" placeholder="123456">') + campo('UF', '<input name="uf" maxlength="2" value="MG">') +
        campo('Advogado(a)', '<input name="advogado" list="oab-pessoas" placeholder="quem recebe o aviso">' + datalistPessoas('oab-pessoas')) +
        '<div class="campo"><span>&nbsp;</span><button class="btn btn-p" type="button" id="btn-add-oab">+ Incluir OAB</button></div></form>' +
      '<div class="secao" style="margin-top:14px">Clientes (pelo nome da empresa)</div><div class="lista-ficha">' + (ps.map((o) => '<div class="item-ficha"><div><b>' + esc(o.nome) + '</b> <span class="sub mono">' + esc(o.documento || '') + '</span>' + (o.ativo ? '' : ' <span class="pill neutro">pausado</span>') + '</div>' +
        '<span><button class="btn btn-o btn-mini" data-pt-at="' + o.id + '">' + (o.ativo ? 'Pausar' : 'Ativar') + '</button> <button class="btn btn-x btn-mini" data-pt-x="' + o.id + '">Excluir</button></span></div>').join('') || '<div class="sub">Nenhum cliente monitorado.</div>') + '</div>' +
      '<form class="grade" id="f-pt" style="margin-top:8px">' + campo('Cliente', '<select name="cliente_id"><option value="">— escolha —</option>' + E.clientes.filter((c) => !ps.some((x) => x.cliente_id === c.id)).map((c) => '<option value="' + c.id + '">' + esc(c.nome) + '</option>').join('') + '</select>') +
        campo('Ou digite o nome da parte', '<input name="nome" placeholder="EMPRESA EXEMPLO LTDA">') +
        '<div class="campo"><span>&nbsp;</span><button class="btn btn-p" type="button" id="btn-add-pt">+ Monitorar</button></div></form>',
    rodape: '<button class="btn btn-o" type="button" id="pub-diag">🩺 Testar conexão com o CNJ</button><span id="pub-diag-res" class="sub"></span>' });
  const f = j.querySelector('#f-oab'), fp = j.querySelector('#f-pt');
  const reabrir = () => { fecharJanela(j); janelaOabs(); };
  j.querySelector('#btn-add-oab').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const numero = soDigitos(f.numero.value), uf = f.uf.value.trim().toUpperCase();
    if (!numero || !/^[A-Z]{2}$/.test(uf)) throw new Error('Informe o número da OAB e a UF (2 letras).');
    await q(sb.from('oabs_monitoradas').insert({ numero, uf, advogado: f.advogado.value.trim() }));
    aviso('✓ OAB incluída.'); reabrir();
  });
  j.querySelector('#btn-add-pt').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const c = E.clientes.find((x) => x.id === fp.cliente_id.value), nome = (c ? c.nome : fp.nome.value).trim().toUpperCase();
    if (!nome) throw new Error('Escolha um cliente ou digite o nome da parte.');
    await q(sb.from('partes_monitoradas').insert({ nome, documento: c ? (c.cpf_cnpj || '') : '', cliente_id: c ? c.id : null }));
    aviso('✓ ' + nome + ' passa a ser monitorado.'); reabrir();
  });
  j.querySelectorAll('[data-oab-at]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const o = os.find((x) => x.id === b.dataset.oabAt); await q(sb.from('oabs_monitoradas').update({ ativo: !o.ativo }).eq('id', o.id)); reabrir();
  }));
  j.querySelectorAll('[data-oab-x]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    if (!confirm('Excluir esta OAB da busca?')) return; await excluir('oabs_monitoradas', b.dataset.oabX); reabrir();
  }));
  j.querySelectorAll('[data-pt-at]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const o = ps.find((x) => x.id === b.dataset.ptAt); await q(sb.from('partes_monitoradas').update({ ativo: !o.ativo }).eq('id', o.id)); reabrir();
  }));
  j.querySelectorAll('[data-pt-x]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    if (!confirm('Parar de monitorar este cliente?')) return; await q(sb.from('partes_monitoradas').delete().eq('id', b.dataset.ptX)); reabrir();
  }));
  j.querySelector('#pub-diag').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const res = j.querySelector('#pub-diag-res');
    let r;
    try { r = await chamarFuncao('erp-publicacoes', { acao: 'diagnostico' }); }
    catch (e) {
      // não respondeu: descobre se é a função (não publicada / versão antiga) ou o CNJ (demorou demais)
      const ping = await chamarFuncao('erp-publicacoes', { acao: 'ping' }).catch((e2) => ({ erro: e2.message }));
      res.innerHTML = '❌ ' + (ping.versao
        ? 'A função está no ar (versão ' + esc(ping.versao) + '), mas o CNJ não respondeu ao servidor do Supabase a tempo. ' + (ping.versao < '2026-10-02' ? '<b>Publique a versão nova da função erp-publicacoes</b> (ela avisa em vez de travar). ' : '')
        : esc(ping.erro || e.message) + ' ') +
        'Enquanto isso, use <b>🌐 Buscar pelo navegador</b> — o ERP também faz essa busca sozinho 1 vez por dia quando você abre o Início.';
      return;
    }
    res.textContent = (r.ok ? '✅ ' : '❌ ') + r.dica + (r.status ? ' (código ' + r.status + ')' : '');
  });
}

// Busca feita pelo navegador de quem está usando (plano B quando o servidor do Supabase não alcança o CNJ).
const API_DJEN = () => window.ERP_DJEN_API || 'https://comunicaapi.pje.jus.br/api/v1';
function normalizarPub(it, oab, parte) {
  const pr = (o, nomes) => { for (const n of nomes) { if (o && o[n] != null && o[n] !== '') return o[n]; } return ''; };
  const dataISO = (v) => { const x = String(v || ''); let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(x); if (m) return m[1] + '-' + m[2] + '-' + m[3]; m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(x); return m ? m[3] + '-' + m[2] + '-' + m[1] : null; };
  const numero = String(pr(it, ['numero_processo', 'numeroProcesso', 'numeroprocesso'])).replace(/\D/g, '');
  const cnj = numero.length === 20 ? numero.replace(/^(\d{7})(\d{2})(\d{4})(\d)(\d{2})(\d{4})$/, '$1-$2.$3.$4.$5.$6') : numero;
  const dest = pr(it, ['destinatarios']) || [], advs = pr(it, ['destinatarioadvogados', 'destinatarioAdvogados', 'advogados']) || [];
  const texto = String(pr(it, ['texto', 'conteudo', 'teor']));
  return {
    id_origem: 'djen:' + String(pr(it, ['id', 'hash', 'numeroComunicacao']) || (numero + '|' + pr(it, ['data_disponibilizacao', 'dataDisponibilizacao']) + '|' + texto.slice(0, 40))),
    data_disponibilizacao: dataISO(pr(it, ['data_disponibilizacao', 'dataDisponibilizacao', 'datadisponibilizacao'])),
    tribunal: String(pr(it, ['siglaTribunal', 'sigla_tribunal', 'tribunal'])), orgao: String(pr(it, ['nomeOrgao', 'nome_orgao', 'orgao'])),
    tipo: String(pr(it, ['tipoComunicacao', 'tipo_comunicacao', 'tipoDocumento', 'tipo'])),
    processo: String(pr(it, ['numeroprocessocommascara', 'numeroProcessoComMascara', 'numero_processo_com_mascara']) || cnj), processo_numero: numero,
    classe: String(pr(it, ['nomeClasse', 'nome_classe', 'classe'])),
    texto: texto.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20000), link: String(pr(it, ['link', 'url'])),
    destinatarios: Array.isArray(dest) ? dest.map((d) => (d && (d.nome || d.name)) ? ({ A: 'Autor: ', P: 'Réu: ' }[String(d.polo || '').toUpperCase()] || '') + (d.nome || d.name) : '').filter(Boolean).join('; ') : String(dest),
    advogados: Array.isArray(advs) ? advs.map((a) => { const x = (a && (a.advogado || a)) || {}; return [x.nome, x.numero_oab ? 'OAB ' + x.numero_oab + '/' + (x.uf_oab || '') : ''].filter(Boolean).join(' '); }).filter(Boolean).join('; ') : String(advs),
    oab_numero: (oab && oab.numero) || '', oab_uf: (oab && oab.uf) || '', advogado: (oab && oab.advogado) || '', parte_monitorada: parte || ''
  };
}
// Busca automática pelo navegador (Backup 17): o CNJ costuma recusar o servidor do Supabase, mas aceita o navegador do escritório.
// Ao abrir o Início, se a última busca deste navegador tem mais de 20 horas, busca em segundo plano (só avisa se achar novas).
async function buscaPubAutomatica() {
  if (!pode('juridico')) return;
  let ult = 0; try { ult = Number(localStorage.getItem('erp_pub_auto') || 0); } catch (e) { /* sem armazenamento: busca */ }
  if (Date.now() - ult < 20 * 3600000) return;
  try { localStorage.setItem('erp_pub_auto', String(Date.now())); } catch (e) { /* ok */ }
  const n = await buscarPubNoNavegador({ silencioso: true }).catch(() => 0);
  if (n) aviso('📰 ' + n + ' publicação(ões) nova(s) no Diário. Veja em Jurídico → Publicações.');
}
async function buscarPubNoNavegador(op) {
  op = op || {};
  const [os, ps] = await Promise.all([q(sb.from('oabs_monitoradas').select('*').eq('ativo', true)), q(sb.from('partes_monitoradas').select('*').eq('ativo', true)).catch(() => [])]);
  if (!os.length && !ps.length) { if (op.silencioso) return 0; throw new Error('Cadastre pelo menos uma OAB ou um cliente em "Monitoramento".'); }
  const de = somarDias(hojeISO(), -Number(E.pub && E.pub.dias ? Math.min(Number(E.pub.dias), 30) : 7)), ate = hojeISO();
  const alvos = os.map((o) => ['numeroOab=' + encodeURIComponent(soDigitos(o.numero)) + '&ufOab=' + encodeURIComponent(o.uf), o, '']).concat(ps.map((p) => ['nomeParte=' + encodeURIComponent(p.nome), null, p.nome]));
  let lidas = 0, novas = 0; const erros = [];
  for (const [filtro, oab, parte] of alvos) {
    try {
      const r = await fetch(API_DJEN() + '/comunicacao?' + filtro + '&dataDisponibilizacaoInicio=' + de + '&dataDisponibilizacaoFim=' + ate + '&pagina=1&itensPorPagina=100', { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('o CNJ respondeu ' + r.status);
      const json = await r.json(), itens = Array.isArray(json) ? json : (json.items || json.itens || json.content || json.data || []);
      const alvo = normalizar(parte).toUpperCase();
      const certos = parte ? itens.filter((it) => !Array.isArray(it.destinatarios) || !it.destinatarios.length || it.destinatarios.some((d) => normalizar((d && d.nome) || '').toUpperCase().includes(alvo))) : itens;
      lidas += certos.length;
      if (certos.length) { const ins = await q(sb.from('publicacoes').upsert(certos.map((it) => normalizarPub(it, oab, parte)), { onConflict: 'id_origem', ignoreDuplicates: true }).select('id')); novas += (ins || []).length; }
    } catch (e) { erros.push((oab ? 'OAB ' + oab.numero : parte) + ': ' + (/fetch|network|Failed/i.test(e.message) ? 'o navegador não conseguiu acessar o CNJ (bloqueio do site do CNJ)' : e.message)); }
  }
  // Backup 37: a busca pela web fica registrada (Alertas → Rotinas → "Busca de publicações (web)")
  await q(sb.rpc('registrar_busca_publicacoes', { p_lidas: lidas, p_novas: novas, p_erros: erros })).catch(() => null);
  if (!op.silencioso) aviso('✓ Busca pelo navegador: ' + lidas + ' lida(s), ' + novas + ' nova(s).' + (erros.length ? ' Atenção: ' + erros[0] : ''), !!erros.length);
  return novas;
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
      '<div class="ficha-atalhos">' + (a.pago ? '' : '<button class="btn btn-v btn-mini" id="ac-baixa">✓ Marcar paga</button>') +
      '<button class="btn btn-o btn-mini" id="ac-lembrar">+ Tarefa: lembrar o cliente</button>' +
      (tel ? '<a class="btn btn-o btn-mini" target="_blank" rel="noopener" href="https://wa.me/' + (tel.length <= 11 ? '55' : '') + tel + '?text=' +
        encodeURIComponent('Olá! Lembrete: a parcela ' + (a.parcela || '') + ' do acordo com ' + (a.credor || 'o credor') + ', de ' + brl(a.valor) + ', vence em ' + dataBR(a.vencimento) + '.') + '">WhatsApp</a>' : '') +
      '<button class="btn btn-p btn-mini" id="ac-editar">Editar</button></div></div>' +
      '<div class="dica" style="margin-bottom:12px">Acordo é uma <b>dívida do cliente com terceiros</b> (não é honorário do escritório): não entra no Financeiro.</div>' +
      '<div class="duas-col"><div class="dados">' + lin('Devedor (cliente)', esc(a.devedor)) + lin('Credor', esc(a.credor)) + lin('Responsável', esc(a.responsavel)) +
        lin('Parcela', esc((a.parcela || '—') + (a.total_parcelas ? ' de ' + a.total_parcelas : ''))) + lin('Valor', brl(a.valor)) + lin('Vencimento', dataBR(a.vencimento)) +
        lin('Aviso', esc(a.situacao && !/^(ok|pago|vencido)$/i.test(a.situacao) ? a.situacao : '')) + lin('PIX', esc(a.pix)) + lin('Banco', esc(a.banco)) + lin('Observação', esc(a.obs)) +
        (a.pago ? lin('Comprovante no processo', a.comprovante_processo ? 'Sim' + (a.comprovante_id ? ' · ID ' + esc(a.comprovante_id) : '') : a.comprovante_processo === false ? '<span class="pill atencao">Não anexado</span>' : '—') : '') + '</div>' +
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
    const bx = await perguntarBaixa({ acordo: true, descricao: 'Parcela ' + (a.parcela || '') + (a.total_parcelas ? '/' + a.total_parcelas : '') + ' — ' + (a.credor || a.processo), valor: a.valor });
    if (!bx) return;
    await q(sb.from('acordos').update(bx).eq('id', id));
    aviso('✓ Parcela do acordo marcada como paga em ' + dataBR(bx.data_pagamento) + '.'); fecharJanela(j); await recarregar(); detalheAcordo(id);
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

let Alertas_emDiaAberto = false;
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
    q(sb.from('cliente_certificado').select('cliente_id, validade').lte('validade', somarDias(h, 30))).catch(nada),
    [],
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
  // Backup 37: BAIXADA não é irregular (a empresa encerrou por vontade própria) — conta só inapta, suspensa, nula…
  const irreg = cls.filter((c) => pj(c) && c.situacao_cadastral && !/^(ativa|baixada)$/i.test(c.situacao_cadastral.trim()));
  add('Cadastro', 'Situação cadastral irregular', String(irreg.length), 'inapta, suspensa ou nula na Receita (baixada não conta)', irreg.length ? 'critico' : 'ok',
    { titulo: 'Situação cadastral diferente de ATIVA', colunas: colCli.concat(['Situação']), linhas: irreg.map((c) => linhaCli(c).concat([c.situacao_cadastral])), ids: irreg.map((c) => c.id) });
  const semResp = ativos.filter((c) => !c.responsavel);
  add('Cadastro', 'Sem responsável', String(semResp.length), 'entidade(s) ativas sem pessoa responsável', semResp.length ? 'atencao' : 'ok',
    { titulo: 'Entidades sem responsável', colunas: colCli, linhas: semResp.map(linhaCli), ids: semResp.map((c) => c.id) });
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
  // Backup 37: em Documentos fica só o CERTIFICADO DIGITAL vencendo (validade lida do arquivo .pfx em Documentos → 🔐 Certificado digital)
  const certDig = certs.filter((c) => c.validade);
  add('Documentos', 'Certificado digital vencendo', String(certDig.length), 'vencidos ou nos próximos 30 dias', certDig.some((c) => c.validade < h) ? 'critico' : certDig.length ? 'atencao' : 'ok',
    { titulo: 'Certificados digitais vencidos ou vencendo', colunas: ['Validade', 'Empresa', 'Grupo'], linhas: certDig.sort((a, b) => a.validade.localeCompare(b.validade)).map((c) => [dataBR(c.validade), nomeCliente(c.cliente_id), nomeGrupo((E.clientes.find((x) => x.id === c.cliente_id) || {}).grupo_id) || '—']), tela: 'documentos' });
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
  // PGFN (dívida ativa, API paga do SERPRO): só aparece depois de configurada, ou para o admin configurar
  const pgfnCfg = await q(sb.rpc('status_config_pgfn')).catch(() => null) || {};
  const pgfnEx = pgfnCfg.tem_chave ? await q(sb.from('pgfn_execucoes').select('*').order('inicio', { ascending: false }).limit(10)).catch(nada) : [];
  if (pgfnCfg.tem_chave) {   // sem SERPRO contratado o cartão fica escondido (decisão do escritório)
    const u = pgfnEx[0];
    add('Rotinas', 'PGFN — dívida ativa', !pgfnCfg.tem_chave ? 'não contratada' : !pgfnCfg.ligada ? 'desligada' : u ? quandoCurto(u.inicio) : 'nunca rodou',
      !pgfnCfg.tem_chave ? 'API paga do SERPRO: clique para ver como ligar' : u ? u.mensagem || u.status : 'frequência: ' + (pgfnCfg.frequencia || 'diaria'),
      !pgfnCfg.tem_chave ? 'info' : u && u.status === 'erro' ? 'critico' : u && u.status === 'parcial' ? 'atencao' : 'ok', { pgfn: true });
  }
  if (emails.length || (E.perfil && E.perfil.papel === 'admin')) add('Rotinas', 'E-mails com erro', String(emails.length), 'não saíram depois de 3 tentativas', emails.length ? 'critico' : 'ok',
    { titulo: 'E-mails com erro', colunas: ['Quando', 'Para', 'Assunto', 'Erro'], linhas: emails.map((m) => [quandoRodou(m.criado_em), m.para, m.assunto, m.erro]) });
  // Backup 37: a busca é feita pela WEB (navegador, 1× por dia ao abrir o ERP, ou "Buscar pelo navegador")
  if (podeJur) add('Rotinas', 'Busca de publicações (web)', ultPub && ultPub.valor ? quandoCurto(ultPub.valor.quando) : 'nunca rodou',
    ultPub && ultPub.valor ? ultPub.valor.novas + ' nova(s) · ' + ((ultPub.valor.erros || []).length ? '⚠ ' + ultPub.valor.erros[0] : 'sem erro') : 'cadastre as OABs em Publicações',
    !ultPub || !ultPub.valor ? 'atencao' : (ultPub.valor.erros || []).length ? 'critico' : 'ok', { tela: 'publicacoes' });
  // Backup 37: a PGFN por arquivo (dados abertos, importado à mão) saiu dos Alertas
  // Central de e-mails: automático por tipo (clicar abre a configuração; admin)
  const cfgEm = await q(sb.rpc('config_emails')).catch(() => null);
  if (false && cfgEm && E.perfil && E.perfil.papel === 'admin') {   // Backup 38: módulo E-mails saiu
    const ligados = ['honorarios', 'parcelamentos', 'acordos', 'recibos'].filter((k) => cfgEm[k]);
    add('Rotinas', 'E-mails automáticos ao cliente', ligados.length + ' de 4 ligados', (cfgEm.hora ? 'envio às ' + cfgEm.hora : 'envio junto das regras (7h)') + ' · clique para configurar', ligados.length ? 'ok' : 'info', { emailsAuto: true });
  }
  add('Rotinas', 'Regras de tarefas', ultReg && ultReg.valor ? quandoCurto(ultReg.valor.quando) : 'nunca rodou', ultReg && ultReg.valor ? ultReg.valor.criadas + ' criada(s) na última execução' : '',
    ultReg && ultReg.valor ? 'ok' : 'info', { tela: 'tarefas' });
  // saúde do sistema e backup semanal (só o administrador)
  if (E.perfil && E.perfil.papel === 'admin') {
    const s = await q(sb.rpc('saude_sistema')).catch(() => null);
    if (s) {
      const pct = (a, b) => Math.round(100 * (a || 0) / b), mb = (x) => (x / 1048576).toFixed(x < 10485760 ? 1 : 0).replace('.', ',') + ' MB';
      const pb = pct(s.banco_bytes, s.banco_limite), pa = pct(s.arquivos_bytes, s.arquivos_limite), maior = Math.max(pb, pa);
      add('Rotinas', 'Saúde do sistema', 'Banco ' + pb + '% · Arquivos ' + pa + '%', mb(s.banco_bytes) + ' de 500 MB · ' + mb(s.arquivos_bytes) + ' de 1 GB (plano grátis)',
        maior >= 90 ? 'critico' : maior >= 70 ? 'atencao' : 'ok', { saude: s });
      const dias = s.ultimo_backup ? Math.floor((Date.now() - new Date(s.ultimo_backup)) / 86400000) : null;
      add('Rotinas', 'Backup semanal', s.ultimo_backup ? quandoCurto(s.ultimo_backup) : 'nunca rodou', s.ultimo_backup ? 'há ' + dias + ' dia(s) · 8 cópias guardadas' : 'publique a função erp-backup',
        dias === null ? 'atencao' : dias > 8 ? 'critico' : 'ok', { backup: true });
    }
  }

  // ── desenho: radar no topo, só o que pede ação em destaque; o que está em dia vira selinho verde ──
  const ICONE_SETOR = { Cadastro: '🗂', 'Jurídico': '⚖', Financeiro: '💰', Documentos: '📄', Tarefas: '✅', Rotinas: '⚙' };
  const acao = A.map((a, i) => Object.assign({ i }, a)).filter((a) => a.setor !== 'Rotinas' && (a.nivel === 'critico' || a.nivel === 'atencao'))
    .sort((x, y) => (x.nivel === 'critico' ? 0 : 1) - (y.nivel === 'critico' ? 0 : 1));
  const emDia = A.map((a, i) => Object.assign({ i }, a)).filter((a) => a.setor !== 'Rotinas' && !(a.nivel === 'critico' || a.nivel === 'atencao'));
  const rotinas = A.map((a, i) => Object.assign({ i }, a)).filter((a) => a.setor === 'Rotinas');
  const criticos = A.filter((a) => a.nivel === 'critico').length, atencao = A.filter((a) => a.nivel === 'atencao').length;
  const nota = Math.round(100 * A.filter((a) => a.nivel === 'ok' || a.nivel === 'info').length / (A.length || 1));
  const humor = criticos ? ['critico', plural(criticos, 'ponto pede ação agora', 'pontos pedem ação agora'), 'Comece pelos vermelhos: cada um abre a lista pronta para agir.']
    : atencao ? ['atencao', 'Quase tudo em dia', plural(atencao, 'ponto para acompanhar', 'pontos para acompanhar') + ' nesta semana.'] : ['ok', 'Tudo em dia! 🎉', 'Nenhum alerta aberto. Bom trabalho.'];
  const setores = [...new Set(acao.map((a) => a.setor))];
  $('al-corpo').innerHTML =
    '<div class="al-radar al-' + humor[0] + '"><div class="al-anel" style="--p:' + nota + '"><div class="al-anel-in"><b>' + nota + '</b><span>em dia</span></div></div>' +
      '<div class="al-radar-txt"><h2>' + esc(humor[1]) + '</h2><p>' + esc(humor[2]) + '</p>' +
      '<div class="al-contas"><span class="al-conta critico">' + plural(criticos, 'crítico', 'críticos') + '</span><span class="al-conta atencao">' + atencao + ' atenção</span><span class="al-conta ok" title="Verificações que o sistema fez e não encontraram nada a fazer (ex.: certidões válidas, nenhum honorário vencido)">' +
        plural(emDia.length, 'verificação sem pendência', 'verificações sem pendência') + '</span></div>' +
      (setores.length > 1 ? '<div class="al-filtros"><button type="button" class="ativo" data-al-setor="">Todos</button>' + setores.map((st) => '<button type="button" data-al-setor="' + esc(st) + '">' + (ICONE_SETOR[st] || '') + ' ' + esc(st) + '</button>').join('') + '</div>' : '') +
    '</div></div>' +
    // Backup 28: blocos por setor (Cadastro, Jurídico, Financeiro…), dois lado a lado, cada um com o que pede ação
    (acao.length ? '<div class="al-blocos">' + setores.map((st) => { const l = acao.filter((a) => a.setor === st);
        return '<section class="al-bloco" data-setor="' + esc(st) + '"><div class="al-bloco-hd"><span class="al-ic" aria-hidden="true">' + (ICONE_SETOR[st] || '•') + '</span>' + esc(st) +
          '<span class="al-bloco-n">' + l.length + '</span></div>' + l.map((a, k) => '<button type="button" class="al-card al-linha al-' + a.nivel + '" data-al="' + a.i + '" data-setor="' + esc(a.setor) + '" style="--k:' + k + '">' +
          '<span class="al-meio"><span class="al-rot">' + esc(a.rot) + '</span> <span class="al-det">' + esc(a.det) + '</span></span>' +
          '<span class="al-val">' + esc(a.valor) + '</span><span class="al-ir">Ver →</span></button>').join('') + '</section>'; }).join('') + '</div>' : '') +
    // Backup 19: menos poluído — o que está em dia fica recolhido (abre ao clicar); rotinas numa lista só
    (emDia.length ? '<div class="al-emdia"><button type="button" class="al-emdia-bt" aria-expanded="' + Alertas_emDiaAberto + '">' + (Alertas_emDiaAberto ? '▾' : '▸') + ' ✓ ' + plural(emDia.length, 'verificação em dia', 'verificações em dia') +
      ' <span class="sub">— clique para ' + (Alertas_emDiaAberto ? 'esconder' : 'ver') + '</span></button><div class="al-chips"' + (Alertas_emDiaAberto ? '' : ' hidden') + '>' +
      emDia.map((a) => '<button type="button" class="al-card al-chip al-' + a.nivel + '" data-al="' + a.i + '" data-setor="' + esc(a.setor) + '" title="' + esc(a.det) + '"><span class="al-rot">' + esc(a.rot) + '</span> <span class="al-val">' + esc(a.valor) + '</span></button>').join('') + '</div></div>' : '') +
    // Backup 28: rotinas automáticas numa tabela (rotina · situação · detalhe); clicar na linha abre o detalhe
    (rotinas.length ? '<div class="kpis-titulo">⚙ Rotinas automáticas</div><div class="card al-rot-card"><div class="tabela-wrap" data-sem-pagina><table class="al-rot-tab"><thead><tr><th>Rotina</th><th>Situação</th><th>Detalhe</th><th></th></tr></thead><tbody>' +
      rotinas.map((a) => '<tr class="clicavel al-rotina al-' + a.nivel + '" data-al="' + a.i + '" tabindex="0"><td><span class="al-pt" aria-hidden="true"></span> <b>' + esc(a.rot) + '</b></td>' +
        '<td><span class="pill ' + ({ ok: 'pago', critico: 'vencido', atencao: 'hoje' }[a.nivel] || 'neutro') + '">' + esc(a.valor) + '</span></td><td class="sub">' + esc(a.det) + '</td><td class="al-ir">Abrir →</td></tr>').join('') +
      '</tbody></table></div></div>' : '');
  const btEd = $('al-corpo').querySelector('.al-emdia-bt');
  if (btEd) btEd.onclick = () => { Alertas_emDiaAberto = !Alertas_emDiaAberto; const ch = btEd.nextElementSibling; ch.hidden = !Alertas_emDiaAberto;
    btEd.setAttribute('aria-expanded', Alertas_emDiaAberto); btEd.innerHTML = btEd.innerHTML.replace(/^[▸▾]/, Alertas_emDiaAberto ? '▾' : '▸').replace(/clique para (ver|esconder)/, 'clique para ' + (Alertas_emDiaAberto ? 'esconder' : 'ver')); };
  $('al-corpo').querySelectorAll('[data-al-setor]').forEach((b) => b.onclick = () => {
    $('al-corpo').querySelectorAll('[data-al-setor]').forEach((x) => x.classList.toggle('ativo', x === b));
    $('al-corpo').querySelectorAll('.al-linha,.al-chip,.al-bloco').forEach((l) => { l.hidden = !!b.dataset.alSetor && l.dataset.setor !== b.dataset.alSetor; });
  });
  $('al-corpo').querySelectorAll('[data-al]').forEach((b) => b.onclick = () => { const a = A[+b.dataset.al]; if (a.rel.cnpj) janelaCnpj(cnpj); else if (a.rel.emailsAuto) janelaAutoEmails(); else if (a.rel.pgfnAbertos) janelaPgfnAbertos(); else if (a.rel.pgfn) janelaPgfn(pgfnEx); else if (a.rel.saude) janelaSaude(a.rel.saude); else if (a.rel.backup) irTelaAlerta('admin', 'backup'); else relatorioAlerta(a); });
};

function quandoCurto(v) {
  const d = new Date(v); if (isNaN(d)) return '—';
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return (d.toDateString() === new Date().toDateString() ? 'hoje ' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ') + hora;
}
function janelaSaude(s) {
  const mb = (x) => (x / 1048576).toFixed(1).replace('.', ',') + ' MB';
  const barra = (usado, lim) => { const p = Math.min(100, Math.round(100 * usado / lim)); return '<div style="height:10px;border-radius:6px;background:var(--surface3);overflow:hidden;margin:4px 0 10px"><div style="width:' + p + '%;height:100%;background:' + (p >= 90 ? 'var(--red)' : p >= 70 ? 'var(--amber)' : 'var(--green)') + '"></div></div>'; };
  abrirJanela({ titulo: 'Saúde do sistema', corpo:
    '<p><b>Banco de dados:</b> ' + mb(s.banco_bytes) + ' de 500 MB</p>' + barra(s.banco_bytes, s.banco_limite) +
    '<p><b>Arquivos (documentos e backups):</b> ' + mb(s.arquivos_bytes) + ' de 1 GB · ' + s.arquivos_qtd + ' arquivo(s)</p>' + barra(s.arquivos_bytes, s.arquivos_limite) +
    '<div class="secao">Maiores tabelas</div><div class="tabela-wrap"><table><tbody>' + (s.maiores || []).map((m) => '<tr><td>' + esc(m.tabela) + '</td><td class="num mono">' + mb(m.bytes) + '</td></tr>').join('') + '</tbody></table></div>' +
    '<div class="dica" style="margin-top:10px">Limites do plano grátis do Supabase. Passando de 70%, vale limpar arquivos antigos ou avaliar o plano Pro (US$ 25/mês: 8 GB de banco e 100 GB de arquivos).</div>' });
}
function irTelaAlerta(t, aba) { if (aba && t === 'admin') { E.adm = Object.assign(E.adm || {}, { aba }); } if (typeof window.nav === 'function') window.nav(null, t); else irPara(t); }

function relatorioAlerta(a) {
  const r = a.rel;
  if (!r.colunas) { if (r.tela) irTelaAlerta(r.tela); return; }
  const j = relatorioTabela(Object.assign({}, r, r.tela ? { acao: { rotulo: 'Abrir a tela', fn: () => irTelaAlerta(r.tela) } } : {}));
  // transformar o alerta em tarefa (para o administrador ou o estagiário), com subtarefas e prazos
  const ac = j.querySelector('.janela-rp .acoes');
  if (r.linhas.length && ac) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-o'; b.dataset.virarTarefa = '1'; b.textContent = '📋 Virar tarefa';
    b.onclick = () => { fecharJanela(j); janelaVirarTarefa(a.rot || a.titulo || r.titulo, r); };
    ac.prepend(b);
  }
}
async function janelaVirarTarefa(titulo, r) {
  const linhas = r.linhas.slice(0, 60), rot = (l) => l.filter((v) => v != null && v !== '').slice(0, 3).join(' · ');
  const prazo = somarDias(hojeISO(), 7);
  const j = abrirJanela({ titulo: '📋 Virar tarefa', larga: true,
    corpo: '<form id="f-vt" class="grade">' +
      campo('Tarefa <span class="obrig">*</span>', '<input name="titulo" maxlength="300" value="' + esc(titulo) + '">', 'inteiro') +
      campo('Quem faz', selectPessoa('responsavel', '', '— escolha —')) +
      campo('Prazo da tarefa', '<input name="prazo" type="date" value="' + prazo + '">') +
      campo('Prioridade', '<select name="prioridade"><option value="media">Média</option><option value="alta">Alta</option><option value="baixa">Baixa</option></select>') +
      campo('Cada linha do alerta vira', '<select name="modo"><option value="sub">Uma subtarefa (com prazo próprio)</option><option value="check">Um item do checklist</option><option value="nada">Nada (só a tarefa)</option></select>') +
      campo('Prazo de cada subtarefa', '<input name="prazo_sub" type="date" value="' + prazo + '">') +
      '<div class="inteiro"><div class="secao">Linhas (' + linhas.length + (r.linhas.length > linhas.length ? ' de ' + r.linhas.length : '') + ') — desmarque o que não entra</div>' +
      '<div class="lista-ficha" style="max-height:34vh;overflow:auto">' + linhas.map((l, i) => '<label class="check item-ficha"><input type="checkbox" data-vt="' + i + '" checked> ' + esc(rot(l)) + '</label>').join('') + '</div></div>' +
      '</form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" id="vt-cancelar">Cancelar</button><button class="btn btn-p" type="button" id="vt-salvar">Criar tarefa</button></div>' });
  j.querySelector('#vt-cancelar').onclick = () => fecharJanela(j);
  j.querySelector('#vt-salvar').onclick = (ev) => comBotao(ev.target, async () => {
    const f = j.querySelector('#f-vt'), marc = [...j.querySelectorAll('[data-vt]:checked')].map((c) => linhas[+c.dataset.vt]);
    const t = { titulo: f.titulo.value.trim(), responsavel: f.responsavel.value, prazo: f.prazo.value || null, prioridade: f.prioridade.value, status: 'pendente',
      descricao: 'Criada a partir do alerta "' + titulo + '".', checklist: f.modo.value === 'check' ? marc.map((l) => ({ texto: rot(l), feito: false })) : [] };
    if (!t.titulo) throw new Error('Informe o nome da tarefa.');
    if (!t.responsavel) throw new Error('Escolha quem faz.');
    const nova = (await q(sb.from('tarefas').insert(t).select('id')))[0];
    if (f.modo.value === 'sub' && marc.length && nova) await q(sb.from('tarefas').insert(marc.map((l) => ({ titulo: rot(l), responsavel: t.responsavel, prazo: f.prazo_sub.value || t.prazo,
      prioridade: t.prioridade, status: 'pendente', tarefa_pai_id: nova.id }))));
    await notificar(t.responsavel, 'Nova tarefa para você: ' + t.titulo, t.prazo ? 'Prazo ' + dataBR(t.prazo) : '', 'tarefas').catch(() => {});
    aviso('✓ Tarefa criada para ' + t.responsavel + (f.modo.value === 'sub' && marc.length ? ' com ' + marc.length + ' subtarefa(s).' : '.'));
    fecharJanela(j);
  });
}

// PGFN: chave do SERPRO (só admin), frequência, ligar/desligar, consultar agora e o que mudou
async function janelaPgfn(execs) {
  const cfg = await q(sb.rpc('status_config_pgfn')).catch(() => ({})) || {};
  const admin = E.perfil && E.perfil.papel === 'admin', ult = execs[0], mud = ((ult && ult.relatorio) || []).filter((x) => x.antes), err = ((ult && ult.relatorio) || []).filter((x) => x.erro);
  const j = abrirJanela({ titulo: 'PGFN — dívida ativa (API do SERPRO)', larga: true,
    corpo: '<div class="dica" style="margin-bottom:10px">Consulta cada CNPJ na <b>API "Consulta Dívida Ativa" do SERPRO</b> e atualiza sozinho os campos <b>PGFN</b> (em cobrança) e <b>PGFN negociada</b> (parcelada). ' +
        'Na ficha do cliente, a aba <b>PGFN</b> mostra cada inscrição (CDA), a origem (tributária, previdenciária, FGTS, Simples) e se está parcelada. ' +
        '<b>É pago por consulta</b> (tabela na Loja SERPRO): consulta diária de 100 CNPJs são cerca de 2.200 consultas/mês. Semanal ou mensal custa bem menos.</div>' +
      (ult ? '<div class="dica" style="margin-bottom:10px"><b>Última execução:</b> ' + quandoRodou(ult.inicio) + ' · ' + esc(ult.mensagem || ult.status) + '</div>' : '') +
      (mud.length ? '<div class="secao">Mudanças na última consulta (' + mud.length + ')</div><div class="tabela-wrap"><table><thead><tr><th>Empresa</th><th class="num">PGFN antes</th><th class="num">agora</th><th class="num">Negociada antes</th><th class="num">agora</th></tr></thead><tbody>' +
        mud.map((x) => '<tr><td><b>' + esc(x.nome) + '</b></td><td class="num mono">' + brl(x.antes[0]) + '</td><td class="num mono"><b>' + brl(x.depois[0]) + '</b></td><td class="num mono">' + brl(x.antes[1]) + '</td><td class="num mono"><b>' + brl(x.depois[1]) + '</b></td></tr>').join('') + '</tbody></table></div>' : '') +
      (err.length ? '<div class="secao">Erros (' + err.length + ')</div><div class="lista-ficha">' + err.map((x) => '<div class="item-ficha"><div><b>' + esc(x.nome) + '</b><div class="sub">' + esc(x.erro) + '</div></div></div>').join('') + '</div>' : '') +
      (admin ? '<div class="secao">Configuração</div><form class="grade" id="f-pgfn">' +
        campo('Consumer key (área do cliente SERPRO)', '<input name="ck" autocomplete="off" placeholder="' + (cfg.tem_chave ? '•••• (deixe vazio para manter)' : 'cole aqui') + '">') +
        campo('Consumer secret', '<input name="cs" type="password" autocomplete="new-password" placeholder="' + (cfg.tem_chave ? '•••• (deixe vazio para manter)' : 'cole aqui') + '">') +
        campo('Frequência', selectPares('frequencia', [['diaria', 'Todo dia (6h15)'], ['semanal', 'Toda segunda-feira'], ['mensal', 'Todo dia 1º']], cfg.frequencia || 'diaria')) +
        '<label class="check" style="align-self:end"><input type="checkbox" name="ligada"' + (cfg.ligada ? ' checked' : '') + '> Rotina ligada</label></form>' : ''),
    rodape: '<span></span><div class="acoes">' + (admin ? '<button class="btn btn-o" type="button" id="pgfn-salvar">Salvar</button><button class="btn btn-p" type="button" id="pgfn-agora"' + (cfg.tem_chave ? '' : ' disabled') + '>↻ Consultar agora</button>' : '') + '</div>' });
  const sv = j.querySelector('#pgfn-salvar');
  if (sv) sv.onclick = () => comBotao(sv, async () => {
    const f = j.querySelector('#f-pgfn');
    await q(sb.rpc('salvar_config_pgfn', { p: { consumer_key: f.ck.value.trim(), consumer_secret: f.cs.value.trim(), frequencia: f.frequencia.value, ligada: f.ligada.checked } }));
    aviso('✓ PGFN: configuração salva.'); fecharJanela(j); await TELAS.alertas();
  });
  const ag = j.querySelector('#pgfn-agora');
  if (ag) ag.onclick = () => comBotao(ag, async () => {
    const r = await chamarFuncao('erp-pgfn', { acao: 'rodar' });
    if (r && r.erro) throw new Error(r.erro);
    aviso('✓ PGFN: ' + ((r && r.mensagem) || 'feito') + '.'); fecharJanela(j); await carregarCadastros(true); await TELAS.alertas();
  });
}

// Cartão CNPJ: última execução, o que mudou, erros, histórico e a API usada
async function janelaCnpj(execs) {
  const cfg = await q(sb.rpc('status_config_cnpj')).catch(() => ({})) || {};
  const admin = E.perfil && E.perfil.papel === 'admin', ult = execs[0];
  const rel = (ult && ult.relatorio) || [];
  const alt = rel.filter((x) => x.mudancas && !x.primeira), err = rel.filter((x) => x.erro), agu = rel.filter((x) => x.aguardando);
  const j = abrirJanela({ titulo: 'Cartão CNPJ — atualização diária (6h)', larga: true,
    corpo: (ult ? '<div class="dica" style="margin-bottom:10px"><b>Última execução:</b> ' + quandoRodou(ult.inicio) + ' · ' + ({ ok: '✅ sem erro', parcial: '⚠ com alguns erros', erro: '❌ com erro', rodando: '⏳ rodando' }[ult.status] || ult.status) +
        ' · ' + esc(ult.mensagem) + ' · API: ' + esc(ult.provedor) + '</div>' : '<div class="dica" style="margin-bottom:10px">Ainda não rodou. Publique a função <b>erp-cnpj</b> no Supabase e clique em "Atualizar agora".</div>') +
      '<div class="secao">Alterações encontradas (' + alt.length + ')</div>' +
      (alt.length ? '<div class="tabela-wrap"><table><thead><tr><th>Entidade</th><th>Campo</th><th>Antes</th><th>Agora</th></tr></thead><tbody>' +
        alt.flatMap((x) => x.mudancas.map((m, k) => '<tr>' + (k === 0 ? '<td rowspan="' + x.mudancas.length + '"><b>' + esc(x.nome) + '</b><div class="sub mono">' + esc(mascaraDoc(x.cnpj)) + '</div></td>' : '') +
          '<td>' + esc(m.campo) + '</td><td class="sub">' + esc(m.antes || '—') + '</td><td><b>' + esc(m.depois) + '</b></td></tr>')).join('') + '</tbody></table></div>' : '<div class="sub" style="margin-bottom:8px">Nenhuma alteração.</div>') +
      (agu.length ? '<div class="secao">Aguardando a Receita (' + agu.length + ')</div><div class="dica" style="margin-bottom:8px">Empresa recém-aberta ainda não aparece na base pública da Receita (ela é publicada uma vez por mês). ' +
        'O sistema já tentou as fontes reserva e tenta de novo todo dia; enquanto isso, preencha o cadastro à mão se precisar.</div><div class="lista-ficha">' +
        agu.map((x) => '<div class="item-ficha"><div><b>' + esc(x.nome) + '</b> <span class="sub mono">' + esc(mascaraDoc(x.cnpj)) + '</span></div></div>').join('') + '</div>' : '') +
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


// ─────────── PGFN pelos dados abertos (Backup 16) ───────────
// A PGFN publica, de graça, a lista de todos os devedores inscritos em dívida ativa (atualizada a cada trimestre).
// Não existe consulta gratuita "por CNPJ" em tempo real (essa é a API paga do SERPRO): aqui o arquivo é lido
// no próprio navegador, linha a linha, e só os CPFs/CNPJs dos clientes são aproveitados.
async function janelaPgfnAbertos() {
  await carregarCadastros();
  const j = abrirJanela({ titulo: 'PGFN — dados abertos (gratuito)', larga: true,
    corpo: '<ol class="passos"><li>Abra <a href="https://www.gov.br/pgfn/pt-br/assuntos/divida-ativa-da-uniao/transparencia-fiscal-1/dados-abertos" target="_blank" rel="noopener">gov.br/pgfn → Dados abertos</a> e baixe os arquivos da <b>Dívida Ativa</b> (Não previdenciário, Previdenciário e FGTS) do trimestre mais recente.</li>' +
      '<li><b>Mais atual (atualiza com frequência):</b> no site <a href="https://www.dividaaberta.pgfn.gov.br/consultar-devedores" target="_blank" rel="noopener">Dívida Aberta</a>, pesquise (por nome, CNPJ ou por estado/município), clique em <b>Exportar (CSV)</b> e escolha esse arquivo abaixo — o ERP entende os dois formatos. Nesse caso <b>não</b> marque "Zerar".</li>' +
      '<li>Descompacte (botão direito → Extrair tudo). Dentro há arquivos <b>.csv</b> (às vezes um por estado).</li><li>Escolha abaixo os .csv (pode marcar vários) e clique em <b>Ler e atualizar</b>. Arquivos grandes levam alguns minutos; a tela mostra o andamento.</li></ol>' +
      '<div class="grade"><div class="campo inteiro"><span>Arquivos .csv da PGFN</span><input type="file" id="pa-arq" accept=".csv,.txt" multiple></div>' +
      '<label class="check inteiro"><input type="checkbox" id="pa-zerar"> Zerar a PGFN dos clientes com CPF/CNPJ que <b>não</b> aparecem nos arquivos (use só se importou todos os arquivos do trimestre)</label></div>' +
      '<div id="pa-prog" class="dica" style="margin-top:10px">Nada lido ainda.</div>',
    rodape: '<span class="sub">Custo: zero. Dados abertos: trimestral · Dívida Aberta (CSV do site): atualização frequente.</span><button class="btn btn-p" type="button" id="pa-ler">Ler e atualizar</button>' });
  j.querySelector('#pa-ler').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const arqs = [...j.querySelector('#pa-arq').files]; if (!arqs.length) throw new Error('Escolha pelo menos um arquivo .csv.');
    const porDoc = {}; E.clientes.forEach((c) => { const d = soDigitos(c.cpf_cnpj); if (d.length === 11 || d.length === 14) porDoc[d] = c; });
    const achados = {}; const prog = j.querySelector('#pa-prog');
    let linhas = 0;
    for (const arq of arqs) {
      const natArq = /previd/i.test(arq.name) ? 'Previdenciária' : /fgts/i.test(arq.name) ? 'FGTS' : 'Tributária';
      const r = await lerCsvPgfn(arq, (lin) => {
        const d = soDigitos(lin.CPF_CNPJ); const c = porDoc[d]; if (!c) return;
        const sit = [lin.TIPO_SITUACAO_INSCRICAO, lin.SITUACAO_INSCRICAO].filter(Boolean).join(' — ');
        const v = String(lin.VALOR_CONSOLIDADO || '0'); const valor = /,/.test(v) ? lerValor(v) : parseFloat(v) || 0;
        const dt = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(lin.DATA_INSCRICAO || '');
        (achados[c.id] = achados[c.id] || []).push({ inscricao: lin.NUMERO_INSCRICAO, natureza: /simples/i.test(lin.RECEITA_PRINCIPAL || '') ? 'Simples Nacional' : natArq,
          receita: lin.RECEITA_PRINCIPAL || '', situacao: sit, parcelada: /benef|parcel|negoci|transa/i.test(sit), valor, data: dt ? dt[3] + '-' + dt[2] + '-' + dt[1] : (lin.DATA_INSCRICAO || '').slice(0, 10) });
      }, (n) => { prog.textContent = arq.name + ': ' + (linhas + n).toLocaleString('pt-BR') + ' linhas lidas · ' + Object.keys(achados).length + ' cliente(s) encontrado(s)…'; });
      linhas += r;
    }
    const lote = Object.entries(achados).map(([cliente_id, inscricoes]) => ({ cliente_id, inscricoes }));
    if (j.querySelector('#pa-zerar').checked) Object.values(porDoc).forEach((c) => { if (!achados[c.id]) lote.push({ cliente_id: c.id, inscricoes: [] }); });
    if (!lote.length) { prog.textContent = linhas.toLocaleString('pt-BR') + ' linhas lidas. Nenhum cliente encontrado nos arquivos.'; return; }
    for (let i = 0; i < lote.length; i += 50) await q(sb.rpc('pgfn_importar_abertos', { p: lote.slice(i, i + 50), p_referencia: arqs.map((a) => a.name).join(', ').slice(0, 120) }));
    await carregarCadastros(true);
    prog.innerHTML = '✓ ' + linhas.toLocaleString('pt-BR') + ' linhas lidas · <b>' + Object.keys(achados).length + '</b> cliente(s) com inscrição · PGFN e PGFN negociada atualizados. A ficha do cliente → aba PGFN mostra cada inscrição.';
    aviso('✓ PGFN atualizada pelos dados abertos.');
  });
}
// lê o CSV em partes (arquivos de centenas de MB) e chama "cada" para cada linha como objeto {COLUNA: valor}
// aceita o arquivo dos dados abertos (CPF_CNPJ, VALOR_CONSOLIDADO…) e o CSV exportado no site "Dívida Aberta"
// (colunas com nomes por extenso, ex.: "CPF/CNPJ", "Nº Inscrição", "Valor Consolidado", "Situação")
function cabecalhoPgfn(c) {
  const t = c.replace(/^"|"$/g, '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (/^(CPF|CNPJ)/.test(t) || t === 'DOCUMENTO') return 'CPF_CNPJ';
  if (/DATA.*INSCRI/.test(t)) return 'DATA_INSCRICAO';
  if (/^(N|NUM|NUMERO|NO)_?INSCRI/.test(t) || t === 'INSCRICAO') return 'NUMERO_INSCRICAO';
  if (/^VALOR/.test(t)) return 'VALOR_CONSOLIDADO';
  if (/^TIPO_SITUA/.test(t)) return 'TIPO_SITUACAO_INSCRICAO';
  if (/SITUA/.test(t)) return 'SITUACAO_INSCRICAO';
  if (/RECEITA/.test(t)) return 'RECEITA_PRINCIPAL';
  return t;
}
async function lerCsvPgfn(arq, cada, andamento) {
  const leitor = arq.stream().getReader();
  let dec = new TextDecoder('utf-8'), resto = '', cab = null, sep = ';', n = 0, primeiro = true;
  for (;;) {
    const { value, done } = await leitor.read();
    if (value && primeiro) { primeiro = false; const t = new TextDecoder('utf-8').decode(value.slice(0, 4096)); if (t.includes('�')) dec = new TextDecoder('iso-8859-1'); }
    const txt = resto + (value ? dec.decode(value, { stream: true }) : dec.decode());
    const partes = txt.split(/\r?\n/); resto = done ? '' : partes.pop();
    for (const l of partes) {
      if (!l.trim()) continue;
      if (!cab) { sep = (l.match(/;/g) || []).length >= (l.match(/,/g) || []).length ? ';' : ','; cab = l.split(sep).map((c) => cabecalhoPgfn(c)); continue; }
      const cols = l.split(sep).map((c) => c.replace(/^"|"$/g, '').trim()), o = {};
      cab.forEach((c, i) => { o[c] = cols[i]; }); cada(o); n++;
    }
    if (andamento && n % 50000 < 5000) andamento(n);
    if (done) break;
  }
  if (!cab || !cab.includes('CPF_CNPJ')) throw new Error('"' + arq.name + '" não parece o arquivo da PGFN (falta a coluna CPF_CNPJ).');
  andamento && andamento(n);
  return n;
}

'use strict';
// ═══════════════════════════════════════════════════════════════════
// Central de automações — tudo o que o sistema faz sozinho, num lugar só:
// tarefas automáticas, e-mails ao cliente, integrações e rotinas agendadas.
// Liga/desliga salva na hora (só o administrador altera); cada automação mostra
// quantas vezes agiu nos últimos 30 dias (tabela automacoes_log) e as últimas ações.
// ═══════════════════════════════════════════════════════════════════
const GRUPOS_AUTOMACAO = [
  ['tarefas', '🗂 Tarefas automáticas', 'Um lançamento cria (e conclui) tarefas sozinho, sem duplicar.'],
  ['cliente_email', '✉ E-mails ao cliente', 'Vão pelo Gmail do escritório, para o contato financeiro. Começam desligados; nunca repetem a mesma cobrança.'],
  ['integracao', '🔗 Integrações', 'Consultas automáticas a serviços externos gratuitos.']
];
// prefixo gravado no registro → automação
const PREFIXO_AUTOMACAO = { 'rot-conf': 'rotina_conferir', 'rot-sup': 'rotina_supervisao', onb: 'contrato_onboarding', proc: 'processo_novo', cert: 'certidao_vencendo', doc: 'certidao_vencendo', parc: 'parcela_parcelamento',
  aco: 'parcela_acordo', cob: 'cobrar_honorario', anexo: 'contrato_anexo', procur: 'processo_procuracao', pagamento_conclui: 'pagamento_conclui', pub: 'publicacao_tarefa',
  cliente_novo_cnpj: 'cliente_novo_cnpj', email_lp: 'email_lembrete_parcelamento', email_lh: 'email_lembrete_honorario', email_ch: 'email_cobranca_honorario', email_la: 'email_lembrete_acordo', email_pr: 'email_pagamento_recebido', email_vh: 'email_lembrete_honorario', 'crm-parada': 'crm_parada', 'crm-follow': 'crm_followup', email_bv: 'email_boas_vindas' };
// automações que não usam "N dias"
const SEM_DIAS = ['pagamento_conclui', 'cliente_novo_cnpj', 'email_pagamento_recebido', 'email_boas_vindas'];
// automações de tarefa que não criam tarefa nova (não têm responsável)
const SEM_RESP = ['pagamento_conclui', 'escalar_atraso'];

TELAS.automacoes = async function () {
  const admin = E.perfil && E.perfil.papel === 'admin';
  const [regras, cont, log, ultReg, ultPub, cnpj, backup, emails] = await Promise.all([
    q(sb.from('regras_tarefas').select('*').order('nome')),
    q(sb.rpc('resumo_automacoes')).catch(() => ({})),
    q(sb.from('automacoes_log').select('*').neq('chave', '_item').order('quando', { ascending: false }).limit(25)).catch(() => []),
    q(sb.from('configuracoes').select('valor').eq('chave', 'regras_tarefas_ultima').maybeSingle()).catch(() => null),
    q(sb.from('configuracoes').select('valor').eq('chave', 'publicacoes_ultima').maybeSingle()).catch(() => null),
    q(sb.from('cnpj_execucoes').select('inicio, status, mensagem').order('inicio', { ascending: false }).limit(1)).catch(() => []),
    admin ? q(sb.from('backups_auto').select('criado_em, tamanho').order('criado_em', { ascending: false }).limit(1)).catch(() => []) : [],
    admin ? q(sb.from('email_fila').select('status, criado_em').gte('criado_em', new Date(Date.now() - 7 * 864e5).toISOString())).catch(() => []) : []
  ]);
  const porRegra = {};
  Object.entries(cont || {}).forEach(([pref, n]) => { const k = PREFIXO_AUTOMACAO[pref] || pref; porRegra[k] = (porRegra[k] || 0) + n; });
  const ligadas = regras.filter((r) => r.ligada).length, acoes = Object.values(porRegra).reduce((a, n) => a + n, 0);
  const envCli = ['email_lh', 'email_ch', 'email_la', 'email_pr'].reduce((a, k) => a + ((cont || {})[k] || 0), 0);
  const linha = (r) => '<div class="au-item' + (r.ligada ? ' ligada' : '') + '" data-au="' + r.chave + '">' +
    '<label class="au-chave" title="' + (admin ? 'Ligar / desligar' : 'Só o administrador altera') + '"><input type="checkbox" role="switch" data-au-lig="' + r.chave + '"' + (r.ligada ? ' checked' : '') + (admin ? '' : ' disabled') +
      ' aria-label="' + esc(r.nome) + '"><span class="au-trilho" aria-hidden="true"></span></label>' +
    '<div class="au-txt"><b>' + esc(r.nome) + '</b><div class="sub">' + esc(r.descricao) + '</div></div>' +
    '<div class="au-cfg">' +
      (SEM_DIAS.includes(r.chave) ? '' : '<label class="au-dias">N = <input type="number" min="0" max="90" data-au-dias="' + r.chave + '" value="' + r.dias + '"' + (admin ? '' : ' disabled') + '> dia(s)</label>') +
      (r.grupo === 'tarefas' && !SEM_RESP.includes(r.chave) ? '<input class="au-resp" list="au-pessoas" data-au-resp="' + r.chave + '" value="' + esc(r.responsavel) + '" placeholder="responsável padrão"' + (admin ? '' : ' disabled') + '>' : '') +
      '<span class="pill ' + (porRegra[r.chave] ? 'aberto' : 'neutro') + '" title="Vezes que agiu nos últimos 30 dias">' + (porRegra[r.chave] || 0) + '× em 30 dias</span>' +
    '</div></div>';
  const rotina = (nome, quando, det, nivel, botao) => '<div class="au-item au-rotina"><span class="au-pt ' + nivel + '" aria-hidden="true"></span>' +
    '<div class="au-txt"><b>' + esc(nome) + '</b><div class="sub">' + det + '</div></div><div class="au-cfg"><span class="sub mono">' + (quando === false ? 'automática' : quando ? quandoRodou(quando) : 'nunca rodou') + '</span>' + (botao || '') + '</div></div>';
  const ult = (x) => x && x.valor ? x.valor : null;
  const erroEmail = emails.filter((m) => m.status === 'erro').length;
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Automações</h1><p>Tudo o que o sistema faz sozinho: com poucos lançamentos, várias ações encadeadas</p></div>' +
    '<div class="acoes"><button class="btn btn-o" id="au-rodar">↻ Rodar regras agora</button></div></div>' +
    '<div class="kpis">' + kpi('Ligadas', ligadas + ' de ' + regras.length, 'verde', 'automações ativas') + kpi('Ações em 30 dias', String(acoes), '', 'tarefas criadas/concluídas e e-mails') +
      kpi('E-mails ao cliente', String(envCli), envCli ? '' : 'ambar', 'enviados nos últimos 30 dias') +
      kpi('Última execução', ult(ultReg) ? quandoCurto(ult(ultReg).quando) : '—', '', ult(ultReg) ? ult(ultReg).criadas + ' novidade(s)' : 'as regras rodam todo dia útil de manhã') + '</div>' +
    GRUPOS_AUTOMACAO.map(([g, tit, desc]) => { const rs = regras.filter((r) => (r.grupo || 'tarefas') === g); return rs.length ?
      '<div class="card"><div class="card-hd">' + tit + '<span class="sub" style="margin-left:auto;font-weight:400">' + esc(desc) + '</span></div><div class="au-lista">' + rs.map(linha).join('') + '</div></div>' : ''; }).join('') +
    '<div class="card"><div class="card-hd">⏱ Rotinas agendadas<span class="sub" style="margin-left:auto;font-weight:400">rodam sozinhas no Supabase; aqui dá para conferir e rodar agora</span></div><div class="au-lista">' +
      rotina('Regras e e-mails ao cliente', ult(ultReg) && ult(ultReg).quando, 'Dias úteis, 7h', ult(ultReg) ? 'ok' : 'atencao') +
      rotina('Busca de publicações (DJEN)', ult(ultPub) && ult(ultPub).quando, 'Dias úteis, 7h e 13h' + (ult(ultPub) ? ' · ' + ult(ultPub).novas + ' nova(s) na última' : ''), ult(ultPub) ? ((ult(ultPub).erros || []).length ? 'critico' : 'ok') : 'atencao',
        admin ? '<button class="btn btn-o btn-mini" data-au-fn="erp-publicacoes">Rodar agora</button>' : '') +
      rotina('Cartão CNPJ', cnpj[0] && cnpj[0].inicio, 'Todo dia, 6h' + (cnpj[0] ? ' · ' + esc(cnpj[0].mensagem || cnpj[0].status) : ''), !cnpj[0] ? 'atencao' : cnpj[0].status === 'erro' ? 'critico' : cnpj[0].status === 'parcial' ? 'atencao' : 'ok',
        admin ? '<button class="btn btn-o btn-mini" data-au-fn="erp-cnpj">Rodar agora</button>' : '') +
      rotina('Mensalidades de consultoria', false, 'Todo dia, 6h30 · gera a competência do mês e reajusta pelo salário mínimo', 'ok') +
      (admin ? rotina('Envio de e-mails', emails.length ? emails.map((m) => m.criado_em).sort().pop() : null, 'A cada 10 minutos · últimos 7 dias: ' + emails.filter((m) => m.status === 'enviado').length + ' enviado(s)' + (erroEmail ? ', ' + erroEmail + ' com erro' : ''), erroEmail ? 'critico' : 'ok') +
        rotina('Backup semanal', backup[0] && backup[0].criado_em, 'Domingo, 3h · guarda as 8 últimas cópias', !backup[0] ? 'atencao' : Date.now() - new Date(backup[0].criado_em) > 8 * 864e5 ? 'critico' : 'ok',
          '<button class="btn btn-o btn-mini" data-au-fn="erp-backup">Rodar agora</button>') : '') +
    '</div></div>' +
    '<div class="card"><div class="card-hd">🧾 Últimas ações automáticas</div>' +
      (log.length ? '<div class="tabela-wrap"><table><thead><tr><th>Quando</th><th>O que aconteceu</th></tr></thead><tbody>' +
        log.map((l) => '<tr' + (l.cliente_id ? ' class="clicavel" data-cli="' + l.cliente_id + '"' : '') + '><td class="mono">' + quandoRodou(l.quando) + '</td><td>' + esc(l.descricao) + '</td></tr>').join('') + '</tbody></table></div>'
        : vazio('Nenhuma ação automática ainda. Elas aparecem aqui assim que acontecerem.')) + '</div>' +
    datalistPessoas('au-pessoas');
  const salvar = async (chave, campos, msg) => { await q(sb.from('regras_tarefas').update(campos).eq('chave', chave)); aviso('✓ ' + msg); };
  $('conteudo').querySelectorAll('[data-au-lig]').forEach((c) => c.onchange = async () => {
    try { await salvar(c.dataset.auLig, { ligada: c.checked }, (c.checked ? 'Ligada: ' : 'Desligada: ') + c.closest('.au-item').querySelector('b').textContent);
      c.closest('.au-item').classList.toggle('ligada', c.checked); } catch (e) { c.checked = !c.checked; aviso(erroAmigavel(e), true); }
  });
  $('conteudo').querySelectorAll('[data-au-dias]').forEach((c) => c.onchange = () => salvar(c.dataset.auDias, { dias: Math.max(0, parseInt(c.value, 10) || 0) }, 'Prazo atualizado.').catch((e) => aviso(erroAmigavel(e), true)));
  $('conteudo').querySelectorAll('[data-au-resp]').forEach((c) => c.onchange = () => salvar(c.dataset.auResp, { responsavel: c.value.trim() }, 'Responsável atualizado.').catch((e) => aviso(erroAmigavel(e), true)));
  $('conteudo').querySelectorAll('[data-cli]').forEach((tr) => tr.onclick = () => abrirFicha(tr.dataset.cli));
  $('au-rodar').onclick = (ev) => comBotao(ev.currentTarget, async () => { const n = await q(sb.rpc('rodar_regras_tarefas')); aviso('✓ Regras rodadas: ' + n + ' novidade(s).'); await TELAS.automacoes(); });
  $('conteudo').querySelectorAll('[data-au-fn]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const r = await chamarFuncao(b.dataset.auFn, { acao: 'rodar' }); aviso('✓ ' + (r.mensagem || 'Feito.')); await TELAS.automacoes();
  }));
};

'use strict';
// ═══════════════════════════════════════════════════════════════════
// Aprovações — alterações feitas em modo "Rascunho" (estagiários).
// Quem edita a área vê o que mudou (antes → depois) e aprova ou recusa;
// quem propôs acompanha as próprias. Nada vale antes da aprovação.
// ═══════════════════════════════════════════════════════════════════
const ROT_CAMPO = { nome: 'Nome', cpf_cnpj: 'CPF/CNPJ', area: 'Área', tipo: 'Tipo', responsavel: 'Responsável', email: 'E-mail', telefone: 'Telefone', obs: 'Observação',
  descricao: 'Descrição', valor: 'Valor', vencimento: 'Vencimento', pago: 'Pago', data_pagamento: 'Data do pagamento', processo: 'Processo', numero: 'Número',
  status: 'Situação', grupo_id: 'Grupo', cliente_id: 'Cliente', comprovante_processo: 'Comprovante no processo', comprovante_id: 'ID do comprovante', servico: 'Área do serviço', perfil_email: 'E-mails de cobrança' };
function valorCampo(k, v) {
  if (v == null || v === '') return '<span class="sub">—</span>';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (k === 'grupo_id') return esc(nomeGrupo(v) || v);
  if (k === 'cliente_id') { const c = E.clientes.find((x) => x.id === v); return esc(c ? c.nome : v); }
  if (k === 'area') return esc(rotArea(v));
  if (/^(valor|rfb|pgfn|sefaz_mg|age_mg)/.test(k) && !isNaN(Number(v))) return brl(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return dataBR(v);
  return esc(typeof v === 'object' ? JSON.stringify(v) : v);
}
// antes → depois, só do que muda
function diferencas(r) {
  const d = Array.isArray(r.dados) ? r.dados[0] || {} : r.dados || {}, a = r.antes || {};
  if (r.operacao === 'excluir') return '<div class="ap-dif"><span class="pill vencido">Excluir</span> ' + esc(a.nome || a.descricao || a.processo || a.numero || 'registro') + '</div>';
  const ks = Object.keys(d).filter((k) => !/^(id|atualizado_em|criado_em|criado_por)$/.test(k) && (r.operacao === 'incluir' ? d[k] != null && d[k] !== '' : JSON.stringify(d[k]) !== JSON.stringify(a[k])));
  if (!ks.length) return '<div class="sub">Sem mudança de conteúdo.</div>';
  return '<table class="ap-tab"><tbody>' + ks.slice(0, 14).map((k) => '<tr><th>' + esc(ROT_CAMPO[k] || k.replace(/_/g, ' ')) + '</th>' +
    (r.operacao === 'alterar' ? '<td class="ap-antes">' + valorCampo(k, a[k]) + '</td><td class="ap-seta">→</td>' : '') + '<td class="ap-depois">' + valorCampo(k, d[k]) + '</td></tr>').join('') +
    (ks.length > 14 ? '<tr><td colspan="4" class="sub">+ ' + (ks.length - 14) + ' campo(s)</td></tr>' : '') + '</tbody></table>';
}

TELAS.aprovacoes = async function () {
  await carregarCadastros();
  const lista = await q(sb.from('rascunhos').select('*').order('criado_em', { ascending: false }).limit(200)).catch(() => []);
  const eu = E.perfil.id, pend = lista.filter((r) => r.status === 'pendente');
  const paraMim = pend.filter((r) => r.autor !== eu && pode(r.funcao, 'aprovar'));
  const minhas = lista.filter((r) => r.autor === eu);
  const outras = lista.filter((r) => r.status !== 'pendente' && r.autor !== eu).slice(0, 30);
  const SIT = { pendente: ['hoje', 'Aguardando'], aprovado: ['pago', 'Aprovado'], recusado: ['vencido', 'Recusado'], cancelado: ['neutro', 'Cancelado'] };
  const cartao = (r, acoes) => '<div class="ap-item" data-rasc="' + r.id + '"><div class="ap-hd"><div><b>' + esc(r.resumo || r.tabela) + '</b>' +
      '<div class="sub">' + esc(r.autor_nome || 'alguém') + ' · ' + dataHoraBR(r.criado_em) + (r.revisor_nome ? ' · ' + (r.status === 'aprovado' ? 'aprovado' : 'decidido') + ' por ' + esc(r.revisor_nome) : '') + '</div></div>' +
      '<span class="pill ' + SIT[r.status][0] + '">' + SIT[r.status][1] + '</span></div>' + diferencas(r) +
      (r.motivo ? '<div class="dica" style="margin-top:8px">Motivo: ' + esc(r.motivo) + '</div>' : '') +
      (acoes ? '<div class="ap-acoes">' + acoes + '</div>' : '') + '</div>';
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Aprovações</h1><p>Alterações feitas em modo rascunho: só valem depois que alguém que edita a área aprovar</p></div></div>' +
    '<div class="kpis">' + kpi('Para você aprovar', String(paraMim.length), paraMim.length ? 'ambar' : 'verde', paraMim.length ? 'aguardando decisão' : 'nada pendente') +
      kpi('Suas propostas pendentes', String(minhas.filter((r) => r.status === 'pendente').length), '', 'enviadas por você') +
      kpi('Aprovadas em 30 dias', String(lista.filter((r) => r.status === 'aprovado' && Date.now() - new Date(r.decidido_em) < 30 * 864e5).length), 'verde', 'já valendo no sistema') + '</div>' +
    (paraMim.length || !minhas.length ? '<div class="card"><div class="card-hd">📝 Aguardando sua aprovação<span class="pill neutro">' + paraMim.length + '</span></div><div class="ap-lista">' +
      (paraMim.length ? paraMim.map((r) => cartao(r, '<button class="btn btn-o btn-mini" data-recusar="' + r.id + '">Recusar</button><button class="btn btn-v btn-mini" data-aprovar="' + r.id + '">✓ Aprovar</button>')).join('')
        : vazio('Nada aguardando aprovação. Quem tem o nível "Rascunho" nas Funções envia as alterações para cá.')) + '</div></div>' : '') +
    (minhas.length ? '<div class="card"><div class="card-hd">🗂 Minhas propostas</div><div class="ap-lista">' +
      minhas.slice(0, 40).map((r) => cartao(r, r.status === 'pendente' ? '<button class="btn btn-o btn-mini" data-cancelar-rasc="' + r.id + '">Desistir</button>' : '')).join('') + '</div></div>' : '') +
    (outras.length ? blocoRecolhivel('ap-hist', '🧾 Decididas recentemente (' + outras.length + ')', '<div class="ap-lista">' + outras.map((r) => cartao(r)).join('') + '</div>') : '');
  const depois = async (msg) => { aviso(msg); await carregarCadastros(true); if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); else await TELAS.aprovacoes(); };
  $('conteudo').querySelectorAll('[data-aprovar]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    await q(sb.rpc('aprovar_rascunho', { p_id: b.dataset.aprovar })); await depois('✓ Aprovado: a alteração já vale no sistema.');
  }));
  $('conteudo').querySelectorAll('[data-recusar]').forEach((b) => b.onclick = () => {
    const j = abrirJanela({ titulo: 'Recusar alteração', corpo: campo('Motivo (a pessoa recebe o aviso)', '<textarea name="motivo" maxlength="500" placeholder="Ex.: o CNPJ está errado; confira na procuração"></textarea>', 'inteiro'),
      rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Voltar</button><button class="btn btn-x" type="button" id="ap-recusar">Recusar</button></div>' });
    j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
    j.querySelector('#ap-recusar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
      await q(sb.rpc('recusar_rascunho', { p_id: b.dataset.recusar, p_motivo: j.querySelector('[name=motivo]').value.trim() }));
      fecharJanela(j); aviso('Alteração recusada. A pessoa foi avisada.'); await TELAS.aprovacoes();
    });
  });
  $('conteudo').querySelectorAll('[data-cancelar-rasc]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    await q(sb.rpc('recusar_rascunho', { p_id: b.dataset.cancelarRasc, p_motivo: '' })); aviso('Proposta cancelada.'); await TELAS.aprovacoes();
  }));
};

// Início: aviso de aprovações pendentes (quem aprova) e das próprias propostas (quem está em rascunho)
async function cardAprovacoes() {
  const temRascunho = FUNCOES_PROPOR.some((f) => emRascunho(f));
  const podeAprovar = E.perfil.papel === 'admin' || FUNCOES_PROPOR.some((f) => pode(f, 'aprovar'));
  if (!temRascunho && !podeAprovar) return '';
  const pend = await q(sb.from('rascunhos').select('id, autor, funcao').eq('status', 'pendente')).catch(() => []);
  const paraMim = pend.filter((r) => r.autor !== E.perfil.id && pode(r.funcao, 'aprovar')).length, minhas = pend.filter((r) => r.autor === E.perfil.id).length;
  if (!paraMim && !temRascunho) return '';
  return '<div class="faixa-aprov' + (paraMim ? ' tem' : '') + '"><span class="faixa-ic" aria-hidden="true">📝</span><div>' +
    (paraMim ? '<b>' + paraMim + ' alteração(ões) aguardando sua aprovação</b><div class="sub">Feitas em modo rascunho: só valem depois que você aprovar.</div>'
      : '<b>Você está em modo rascunho</b><div class="sub">O que você salvar vai para aprovação' + (minhas ? ' · ' + minhas + ' aguardando' : '') + '.</div>') +
    '</div><button class="btn btn-o btn-mini" data-ir-aprovacoes>Abrir Aprovações</button></div>';
}
document.addEventListener('click', (ev) => { if (ev.target.closest && ev.target.closest('[data-ir-aprovacoes]')) irParaTela('aprovacoes'); });

'use strict';
// ═══════════════════════════════════════════════════════════════════
// Conciliar extrato (OFX do Sicoob ou de qualquer banco): lê o arquivo no
// navegador, pega só as ENTRADAS e procura o honorário em aberto de mesmo
// valor. Três grupos: identificados (marcados para baixa), em dúvida (escolher
// entre os candidatos) e não identificados (o escritório escolhe à mão ou ignora).
// A data do recebimento é a do banco. O FITID do banco evita tratar duas vezes.
// ═══════════════════════════════════════════════════════════════════

// OFX 1.x (SGML, tags sem fechamento) e 2.x (XML): uma entrada por <STMTTRN>
function lerOfx(texto) {
  const tag = (bloco, t) => { const m = new RegExp('<' + t + '>\\s*([^<\\r\\n]*)', 'i').exec(bloco); return m ? m[1].trim() : ''; };
  return String(texto || '').split(/<STMTTRN>/i).slice(1).map((b) => {
    const bloco = b.split(/<\/STMTTRN>/i)[0], d = tag(bloco, 'DTPOSTED');
    return { fitid: tag(bloco, 'FITID'), tipo: tag(bloco, 'TRNTYPE').toUpperCase(), valor: Number(tag(bloco, 'TRNAMT').replace(',', '.')) || 0,
      data: d.length >= 8 ? d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8) : '', nome: tag(bloco, 'NAME'), memo: tag(bloco, 'MEMO') };
  }).filter((t) => t.valor > 0 && t.data && t.fitid);
}
// palavras "de verdade" do nome (tira LTDA, ME, PIX, TED…)
const PALAVRAS_VAZIAS = /^(ltda|me|epp|eireli|sa|s\/a|pix|ted|doc|transf|transferencia|recebido|recebida|credito|cred|de|da|do|dos|das|e|pagamento|pag|ref|grupo|familia|holding|participacoes|comercio|servicos|industria|demo)$/;
function palavras(s) { return normalizar(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !PALAVRAS_VAZIAS.test(w)); }
function nomeBate(t, l) {
  const doExtrato = new Set(palavras(t.nome + ' ' + t.memo)), dig = soDigitos(t.nome + ' ' + t.memo);
  const cl = l.cliente_id ? E.clientes.find((c) => c.id === l.cliente_id) : null;
  const doc = cl ? soDigitos(cl.cpf_cnpj) : '';
  if (doc && doc.length >= 11 && dig.includes(doc)) return true;
  const alvo = palavras([(l.clientes && l.clientes.nome) || '', (l.grupos && l.grupos.nome) || '', l.favorecido || '', cl ? cl.nome : ''].join(' '));
  return alvo.some((w) => doExtrato.has(w));
}
function casar(entradas, abertos) {
  const usados = new Set();
  return entradas.map((t) => {
    const mesmoValor = abertos.filter((l) => Math.abs(Number(l.valor) - t.valor) < 0.01);
    const perto = mesmoValor.filter((l) => Math.abs(new Date(l.vencimento) - new Date(t.data)) <= 45 * 864e5);
    const porNome = perto.filter((l) => nomeBate(t, l));
    let certo = null, cands = [];
    const dist = (l) => Math.abs(new Date(l.vencimento) - new Date(t.data)) / 864e5;
    if (porNome.length === 1) certo = porNome[0];
    else if (porNome.length > 1) {
      // mesmo cliente com vários honorários iguais (mensalidade): fica o de vencimento mais perto, se for claramente o mais perto
      const o = porNome.slice().sort((a, b) => dist(a) - dist(b));
      if (dist(o[0]) <= 20 && dist(o[1]) - dist(o[0]) >= 7) certo = o[0]; else cands = o;
    }
    else if (perto.length === 1 && Math.abs(new Date(perto[0].vencimento) - new Date(t.data)) <= 10 * 864e5) cands = perto;
    else cands = perto.length ? perto : mesmoValor;
    if (certo && usados.has(certo.id)) { cands = [certo]; certo = null; }
    if (certo) usados.add(certo.id);
    return { t, certo, cands: cands.slice(0, 5) };
  });
}

async function conciliarOfx(empresa) {
  if (!pode(empresa === 'contabilidade' ? 'financeiro_contab' : 'financeiro_juridico', 'propor')) return aviso('Sem acesso ao financeiro desta área.', true);
  await carregarCadastros();
  const nomeEmp = empresa === 'contabilidade' ? 'Contabilidade' : 'Jurídico';
  const j = abrirJanela({ titulo: '🏦 Conciliar extrato — ' + nomeEmp, larga: true,
    corpo: '<div id="ofx-corpo"><ol class="passos"><li>No app ou internet banking do Sicoob: <b>Extrato → escolha o período → Exportar / Salvar em OFX</b>.</li>' +
      '<li>Escolha o arquivo abaixo. Nada é gravado antes de você conferir.</li></ol>' +
      '<label class="btn btn-p" style="cursor:pointer;margin-top:8px">Escolher arquivo .ofx<input type="file" id="ofx-arq" accept=".ofx,.OFX,.txt" hidden></label>' +
      '<p class="sub" style="margin-top:8px">O arquivo é lido aqui no seu computador; só as entradas (créditos) são usadas.</p></div>',
    rodape: '<span class="sub" id="ofx-resumo"></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Fechar</button><button class="btn btn-p" type="button" id="ofx-gravar" hidden>✓ Dar como recebidos os marcados</button></div>' });
  j.querySelector('.janela').classList.add('janela-ofx');
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#ofx-arq').onchange = async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    const buf = await f.arrayBuffer();
    let txt = new TextDecoder('utf-8').decode(buf); if (/�/.test(txt)) txt = new TextDecoder('windows-1252').decode(buf);
    const todas = lerOfx(txt);
    if (!todas.length) return aviso('Nenhuma entrada encontrada no arquivo. Confira se é um extrato OFX.', true);
    const [tratados, abertos] = await Promise.all([
      q(sb.from('extrato_itens').select('fitid').in('fitid', todas.map((t) => t.fitid))).catch(() => []),
      buscarTodos(() => sb.from('lancamentos').select('*, grupos(nome), clientes(nome)').eq('empresa', empresa).eq('tipo', 'receita').eq('pago', false).eq('perda', false).eq('redutor', false))
    ]);
    const ja = new Set(tratados.map((x) => x.fitid)), entradas = todas.filter((t) => !ja.has(t.fitid));
    pintar(casar(entradas, abertos), abertos, todas.length - entradas.length);
  };
  const quem = (l) => (l.grupos && l.grupos.nome) || (l.clientes && l.clientes.nome) || l.favorecido || '';
  const rotLanc = (l) => dataBR(l.vencimento) + ' · ' + quem(l) + ' · ' + l.descricao + ' · ' + brl(l.valor);
  let itens = [];
  function pintar(lista, abertos, repetidos) {
    itens = lista;
    const ok = lista.filter((x) => x.certo), duv = lista.filter((x) => !x.certo && x.cands.length), nao = lista.filter((x) => !x.certo && !x.cands.length);
    const linhaT = (x) => '<div class="ofx-t"><b>' + brl(x.t.valor) + '</b> em ' + dataBR(x.t.data) + '<div class="sub">' + esc(x.t.nome || '—') + (x.t.memo ? ' · ' + esc(x.t.memo) : '') + '</div></div>';
    const opcoes = (lst, marcado) => lst.map((l) => '<option value="' + l.id + '"' + (l.id === marcado ? ' selected' : '') + '>' + esc(rotLanc(l)) + '</option>').join('');
    // não identificados: todos os abertos, os de valor mais parecido primeiro
    const todosOrdenados = (v) => abertos.slice().sort((a, b) => Math.abs(a.valor - v) - Math.abs(b.valor - v)).slice(0, 60);
    j.querySelector('#ofx-corpo').innerHTML =
      (repetidos ? '<div class="dica" style="margin-bottom:10px">' + repetidos + ' entrada(s) deste arquivo já foram tratadas antes e ficaram de fora.</div>' : '') +
      '<div class="secao">✓ Identificados (' + ok.length + ')</div>' + (ok.length ? '<div class="lista-ficha">' + ok.map((x) => { const i = lista.indexOf(x);
        return '<label class="item-ficha ofx-it"><input type="checkbox" data-ofx-ok="' + i + '" checked>' + linhaT(x) + '<span class="ofx-seta">→</span><div class="ofx-l">' + esc(rotLanc(x.certo)) + '</div></label>'; }).join('') + '</div>'
        : '<div class="sub" style="margin-bottom:8px">Nenhum com valor e nome batendo.</div>') +
      '<div class="secao">? Em dúvida (' + duv.length + ') <span class="sub">— mesmo valor, mas o nome não bate ou há mais de um</span></div>' + (duv.length ? '<div class="lista-ficha">' + duv.map((x) => { const i = lista.indexOf(x);
        return '<div class="item-ficha ofx-it">' + linhaT(x) + '<span class="ofx-seta">→</span><select class="busca sel ofx-sel" data-ofx-esc="' + i + '"><option value="">— deixar para depois —</option><option value="ignorar">Ignorar (não é honorário)</option>' + opcoes(x.cands) + '</select></div>'; }).join('') + '</div>'
        : '<div class="sub" style="margin-bottom:8px">Nenhuma.</div>') +
      '<div class="secao">✗ Não identificados (' + nao.length + ') <span class="sub">— escolha o honorário à mão, ignore ou deixe para depois</span></div>' + (nao.length ? '<div class="lista-ficha">' + nao.map((x) => { const i = lista.indexOf(x);
        return '<div class="item-ficha ofx-it">' + linhaT(x) + '<span class="ofx-seta">→</span><select class="busca sel ofx-sel" data-ofx-esc="' + i + '"><option value="">— deixar para depois —</option><option value="ignorar">Ignorar (não é honorário)</option>' + opcoes(todosOrdenados(x.t.valor)) + '</select></div>'; }).join('') + '</div>'
        : '<div class="sub">Nenhum.</div>');
    j.querySelector('#ofx-gravar').hidden = !lista.length;
    const conta = () => { const n = j.querySelectorAll('[data-ofx-ok]:checked').length + [...j.querySelectorAll('[data-ofx-esc]')].filter((s) => s.value && s.value !== 'ignorar').length;
      j.querySelector('#ofx-resumo').textContent = lista.length + ' entrada(s) · ' + n + ' pagamento(s) para registrar'; };
    j.querySelectorAll('[data-ofx-ok],[data-ofx-esc]').forEach((el) => { el.onchange = conta; });
    conta();
  }
  j.querySelector('#ofx-gravar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const escolhas = [];
    j.querySelectorAll('[data-ofx-ok]:checked').forEach((c) => { const x = itens[+c.dataset.ofxOk]; escolhas.push([x.t, x.certo.id]); });
    j.querySelectorAll('[data-ofx-esc]').forEach((s) => { if (s.value) escolhas.push([itens[+s.dataset.ofxEsc].t, s.value]); });
    const lancs = escolhas.filter(([, id]) => id !== 'ignorar').map(([, id]) => id);
    if (new Set(lancs).size !== lancs.length) throw new Error('O mesmo honorário foi escolhido para duas entradas do extrato. Corrija antes de gravar.');
    if (!escolhas.length) throw new Error('Marque ou escolha pelo menos uma entrada.');
    let baixas = 0, ign = 0, rasc = 0;
    for (const [t, id] of escolhas) {
      const reg = { fitid: t.fitid, empresa, data: t.data, valor: t.valor, nome: t.nome.slice(0, 200), memo: t.memo.slice(0, 300) };
      if (id === 'ignorar') { await q(sb.from('extrato_itens').insert(Object.assign(reg, { situacao: 'ignorado' }))); ign++; continue; }
      const { error } = await sb.from('lancamentos').update({ pago: true, data_pagamento: t.data, cobranca: '', perda: false }).eq('id', id);
      if (error && error.rascunho) { rasc++; continue; }
      if (error) throw new Error(erroAmigavel(error));
      await q(sb.from('extrato_itens').insert(Object.assign(reg, { situacao: 'baixado', lancamento_id: id })));
      baixas++;
    }
    fecharJanela(j);
    aviso(rasc ? '📝 ' + rasc + ' pagamento(s) enviado(s) para aprovação' + (baixas ? '; ' + baixas + ' registrado(s)' : '') + '.'
      : '✓ ' + baixas + ' pagamento(s) registrado(s) com a data do banco' + (ign ? ' · ' + ign + ' entrada(s) ignorada(s)' : '') + '.');
    if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); else await recarregar();
  });
}

'use strict';
// ═══════════════════════════════════════════════════════════════════
// Central de e-mails ao cliente (Backup 16): honorários, parcelamentos,
// acordos e recibos numa tela só. "A enviar hoje" mostra o que a rotina
// vai mandar (com prévia); dá para enviar agora, pular ou enviar vários.
// Modelos editáveis (Administração → E-mails) e o automático por tipo.
// ═══════════════════════════════════════════════════════════════════
const TIPOS_CENTRAL_EM = [['', 'Todos'], ['honorarios', 'Honorários'], ['parcelamentos', 'Parcelamentos'], ['acordos', 'Acordos'], ['recibos', 'Recibos']];
const ROT_TIPO_EMAIL = { honorarios: 'Honorários', parcelamentos: 'Parcelamento', acordos: 'Acordo', recibos: 'Recibo', propostas: 'Proposta', contratos: 'Boas-vindas', convites: 'Convite' };
const SIT_EMAIL = [['hoje', 'A enviar hoje'], ['enviados', 'Enviados'], ['erro', 'Com erro'], ['retidos', 'Retidos (pausa)']];
// Backup 19: tudo de e-mail num lugar só — cada área é uma aba da Central
// Backup 35: mais simples — 3 abas (E-mails · Quem recebe · Ajustes); pausa e e-mails de teste numa faixa só
const AREAS_EMAIL = [['fila', '📬 E-mails'], ['clientes', '📨 Quem recebe'], ['config', '⚙ Ajustes', true]];

TELAS.emails = async function () {
  E.em = Object.assign({ sit: 'hoje', tipo: '', busca: '', area: 'fila' }, E.em || {});
  const F = E.em;
  const admin = E.perfil && E.perfil.papel === 'admin';
  const pausado = await q(sb.rpc('emails_pausados')).catch(() => false);
  const emTeste = await q(sb.from('configuracoes').select('valor').eq('chave', 'emails_teste').maybeSingle()).then((r) => (r && r.valor) || '').catch(() => '');
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>E-mails</h1></div>' +
    '<div class="acoes"><button class="btn btn-o" id="em-meus" type="button">🔔 Meus avisos</button>' + (admin ? '<button class="btn btn-o" id="em-modelos">✎ Modelos</button><button class="btn btn-o" id="em-auto">⚙ Automático</button>' : '') + '</div></div>' +
    '<div class="em-faixa' + (pausado ? ' em-faixa-pausa' : '') + '" id="em-pausa"><span class="em-faixa-ic" aria-hidden="true">' + (pausado ? '⏸' : '▶') + '</span>' +
      '<div class="em-faixa-txt"><b>' + (pausado ? 'Envio PAUSADO' : 'Envio ligado') + '</b><span class="sub">' + (pausado ? ' · nada sai, só para os e-mails de teste:' : ' · sai em até 5 minutos') + '</span></div>' +
      (pausado || admin ? '<input id="em-teste-lista" value="' + esc(emTeste) + '" placeholder="e-mails de teste (separados por vírgula)" title="Estes e-mails recebem mesmo com o envio pausado"' + (admin ? '' : ' disabled') + '>' + (admin ? '<button class="btn btn-o btn-mini" id="em-teste-salvar">Salvar</button>' : '') : '') +
      (admin ? '<button class="btn btn-mini ' + (pausado ? 'btn-p' : 'btn-o') + '" id="em-pausar" data-pausar="' + (pausado ? '0' : '1') + '">' + (pausado ? '▶ Liberar o envio' : '⏸ Pausar') + '</button>' : '') + '</div>' +
    '<div class="segmento" id="em-area" style="margin-bottom:14px">' + AREAS_EMAIL.filter((a) => !a[2] || admin).map(([v, r]) => '<button data-area="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<div id="em-area-corpo"></div>';
  if ($('em-teste-salvar')) $('em-teste-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    await q(sb.rpc('salvar_emails_teste', { p: $('em-teste-lista').value.trim() })); aviso('✓ E-mails de teste salvos: saem mesmo com a pausa ligada.');
  });
  $('em-area').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.area = b.dataset.area; pintarAreaEmail(); } };
  if ($('em-auto')) $('em-auto').onclick = () => janelaAutoEmails();
  $('em-meus').onclick = () => janelaMeusAvisos();
  if ($('em-modelos')) $('em-modelos').onclick = () => janelaModelosEmail();
  if ($('em-pausar')) $('em-pausar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const pausar = ev.currentTarget.dataset.pausar === '1';
    if (!pausar && !confirm('Liberar o envio? Os e-mails automáticos voltam a sair (os que já estão retidos continuam retidos até você liberar cada um).')) return;
    await q(sb.rpc('pausar_emails', { p_pausar: pausar })); aviso(pausar ? '⏸ Envio de e-mails pausado.' : '▶ Envio de e-mails liberado.'); await TELAS.emails();
  });
  await pintarAreaEmail();
};
async function pintarAreaEmail() {
  const F = E.em, alvo = $('em-area-corpo'); if (!alvo) return;
  document.querySelectorAll('#em-area button').forEach((b) => b.classList.toggle('ativo', b.dataset.area === F.area));
  if (F.area === 'clientes') return controleEmails(alvo);
  if (F.area === 'config') { E.adm = E.adm || {}; return admEmail(alvo); }
  if (F.area === 'avisos') F.area = 'fila';
  alvo.innerHTML = '<div class="abas" id="em-sit">' + SIT_EMAIL.map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<div class="filtros"><div class="segmento" id="em-tipo">' + TIPOS_CENTRAL_EM.map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<input class="busca" id="em-busca" placeholder="Buscar cliente, grupo ou assunto" autocomplete="off"></div>' +
    '<div id="em-corpo"><div class="carregando">Carregando…</div></div>';
  $('em-sit').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.sit = b.dataset.v; carregarEmails(); } };
  $('em-tipo').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.tipo = b.dataset.v; pintarEmails(); } };
  $('em-busca').value = F.busca;
  let t; $('em-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; pintarEmails(); }, 250); };
  await carregarEmails();
}
let _emLista = [], _emCfg = {};
async function carregarEmails() {
  const F = E.em;
  if ($('em-corpo')) $('em-corpo').innerHTML = '<div class="carregando">Carregando…</div>';
  [_emLista, _emCfg] = await Promise.all([F.sit === 'retidos'
    ? q(sb.from('email_fila').select('id, para, assunto, tipo, criado_em').eq('status', 'retido').order('criado_em', { ascending: false }).limit(500)).then((l) => l.map((x) => ({ id: x.id, para: x.para, assunto: x.assunto, quando: x.criado_em, tipo_fila: x.tipo, status: 'retido' })))
    : q(sb.rpc('emails_central', { p_situacao: F.sit })), q(sb.rpc('config_emails')).catch(() => ({}))]);
  pintarEmails();
}
function pintarEmails() {
  const F = E.em, alvo = $('em-corpo'); if (!alvo) return;
  document.querySelectorAll('#em-sit button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === F.sit));
  document.querySelectorAll('#em-tipo button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === F.tipo));
  const b = normalizar(F.busca);
  const lista = (_emLista || []).filter((x) => (!F.tipo || x.tipo === F.tipo) && (!b || normalizar([x.cliente, x.grupo, x.assunto, x.para].join(' ')).includes(b)));
  const autoTxt = ['honorarios', 'parcelamentos', 'acordos', 'recibos'].map((k) => '<span class="pill ' + (_emCfg[k] ? 'pago' : 'neutro') + '">' + ROT_TIPO_EMAIL[k] + ': ' + (_emCfg[k] ? 'automático' : 'manual') + '</span>').join(' ');
  let html = '<div class="dica" style="margin-bottom:12px">' + autoTxt + (_emCfg.hora ? ' · envio às <b>' + esc(_emCfg.hora) + '</b>' : ' · envio junto da rotina das 7h') +
    '<br><span class="sub">No automático, a lista "A enviar hoje" sai sozinha no horário. Em manual, nada sai até você clicar em "Enviar".</span></div>';
  if (F.sit === 'retidos') {
    const ret = (_emLista || []).filter((x) => !b || normalizar([x.assunto, x.para].join(' ')).includes(b));
    alvo.innerHTML = '<div class="card"><div class="card-hd">⏸ Retidos pela pausa <span class="pill neutro">' + ret.length + '</span>' +
      (ret.length ? '<span style="margin-left:auto;display:flex;gap:6px"><label class="check" style="font-size:12.5px"><input type="checkbox" id="em-todos"> marcar todos</label>' +
        '<button class="btn btn-o btn-mini" id="em-desc-sel">Descartar marcados</button><button class="btn btn-p btn-mini" id="em-lib-sel">Enviar marcados</button></span>' : '') + '</div>' +
      (ret.length ? '<div class="tabela-wrap"><table><thead><tr><th class="sem-ordem"></th><th>Quando</th><th>Tipo</th><th>Assunto</th><th>Para</th></tr></thead><tbody>' +
        ret.map((x) => '<tr class="clicavel" data-em-ref="' + x.id + '"><td><input type="checkbox" data-em-ret="' + x.id + '" aria-label="Marcar"></td><td class="mono">' + dataHoraBR(x.quando) + '</td>' +
          '<td>' + esc(x.tipo_fila || '—') + '</td><td>' + esc(x.assunto) + '</td><td>' + esc(x.para) + '</td></tr>').join('') + '</tbody></table></div>'
        : vazio('Nenhum e-mail retido.')) + '</div>';
    alvo.querySelectorAll('tr[data-em-ref]').forEach((tr) => tr.onclick = (ev) => { if (ev.target.closest('input, label')) return; previaEmail(tr.dataset.emRef); });
    const todosR = $('em-todos'); if (todosR) todosR.onchange = () => alvo.querySelectorAll('[data-em-ret]').forEach((c) => { c.checked = todosR.checked; });
    const acao = (tipo, bt) => comBotao(bt, async () => {
      const ids = [...alvo.querySelectorAll('[data-em-ret]:checked')].map((c) => c.dataset.emRet);
      if (!ids.length) throw new Error('Marque pelo menos um e-mail.');
      if (!confirm(tipo === 'liberar' ? 'Enviar de verdade os ' + ids.length + ' e-mail(s) marcados?' : 'Descartar os ' + ids.length + ' e-mail(s) marcados? Eles não serão enviados.')) return;
      const n = await q(sb.rpc('emails_retidos_acao', { p_ids: ids, p_acao: tipo }));
      aviso(tipo === 'liberar' ? '✓ ' + n + ' e-mail(s) liberado(s): saem em até 5 minutos.' : n + ' e-mail(s) descartado(s).'); await carregarEmails();
    });
    if ($('em-lib-sel')) $('em-lib-sel').onclick = (ev) => acao('liberar', ev.currentTarget);
    if ($('em-desc-sel')) $('em-desc-sel').onclick = (ev) => acao('descartar', ev.currentTarget);
    return;
  }
  if (F.sit === 'hoje') {
    const envia = lista.filter((x) => !x.bloqueio);
    html += '<div class="card"><div class="card-hd">📬 A enviar hoje <span class="pill neutro">' + lista.length + '</span>' +
      (envia.length ? '<span style="margin-left:auto;display:flex;gap:6px"><label class="check" style="font-size:12.5px"><input type="checkbox" id="em-todos"> marcar todos</label>' +
        '<button class="btn btn-p btn-mini" id="em-enviar-sel">Enviar selecionados</button></span>' : '') + '</div>' +
      (lista.length ? '<div class="tabela-wrap"><table><thead><tr><th class="sem-ordem"></th><th>Tipo</th><th>Cliente</th><th>Quem</th><th>Assunto</th><th>E-mail de destino</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead><tbody>' +
        lista.map((x) => '<tr class="clicavel" data-em-ref="' + esc(x.ref) + '" title="Clique para ver a prévia"><td>' + (x.bloqueio ? '' : '<input type="checkbox" data-em-sel="' + esc(x.ref) + '" aria-label="Selecionar">') + '</td>' +
          '<td><span class="pill aberto">' + esc(ROT_TIPO_EMAIL[x.tipo] || x.tipo) + '</span></td><td><b>' + esc(x.cliente || '—') + '</b>' + (x.grupo && x.grupo !== x.cliente ? '<div class="sub">' + esc(x.grupo) + '</div>' : '') + '</td>' +
          '<td>' + pillPessoa(x.responsavel) + '</td><td>' + esc(x.assunto) + '</td><td>' + destinoEmail(x) + '</td>' +
          '<td class="num mono">' + (Number(x.total) ? brl(x.total) : '—') + '</td>' +
          '<td>' + (x.bloqueio ? '<span class="pill neutro" title="Não vai sair">' + esc(x.bloqueio) + '</span>' : '<span class="pill pago">' + (x.auto ? 'sai no horário' : 'pronto') + '</span>') + '</td>' +
          '<td class="acoes-l">' + (x.bloqueio ? '' : '<button class="btn btn-v btn-mini" data-em-agora="' + esc(x.ref) + '">Enviar agora</button> ') + '<button class="btn btn-o btn-mini" data-em-pular="' + esc(x.ref) + '">Pular este</button></td></tr>').join('') +
        '</tbody></table></div>' : vazio('Nada para enviar hoje. 👏')) + '</div>';
  } else {
    html += '<div class="card">' + (lista.length ? '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th data-tipo="data">Quando</th><th>Tipo</th><th>Cliente</th><th>Quem</th><th>Assunto</th><th>E-mail de destino</th><th>Situação</th><th></th></tr></thead><tbody>' +
      lista.map((x) => '<tr class="clicavel" data-em-ref="' + esc(x.ref || x.id) + '"><td class="mono" data-ord="' + esc(x.quando) + '">' + dataHoraBR(x.quando) + '</td>' +
        '<td><span class="pill aberto">' + esc(ROT_TIPO_EMAIL[x.tipo] || x.tipo) + '</span>' + (x.anexo ? ' 📎' : '') + '</td><td>' + esc(x.cliente || '—') + '</td><td>' + pillPessoa(x.responsavel || '') + '</td><td>' + esc(x.assunto) + '</td><td>' + esc(x.para) + '</td>' +
        '<td>' + (x.status === 'erro' ? '<span class="pill vencido" title="' + esc(x.erro) + '">erro</span><div class="sub">' + esc(String(x.erro || '').slice(0, 80)) + '</div>' : x.status === 'enviado' ? '<span class="pill pago">enviado</span>' : '<span class="pill hoje">na fila</span>') + '</td>' +
        '<td class="acoes-l">' + (x.status === 'erro' ? '<button class="btn btn-o btn-mini" data-em-de-novo="' + x.id + '">Tentar de novo</button>' : '') + '</td></tr>').join('') +
      '</tbody></table></div>' : vazio(F.sit === 'erro' ? 'Nenhum e-mail com erro. 👏' : 'Nenhum e-mail enviado nos últimos 120 dias.')) + '</div>';
  }
  alvo.innerHTML = html;
  alvo.querySelectorAll('tr[data-em-ref]').forEach((tr) => tr.onclick = (ev) => { if (ev.target.closest('button, input, label')) return; previaEmail(tr.dataset.emRef); });
  const todos = $('em-todos'); if (todos) todos.onchange = () => alvo.querySelectorAll('[data-em-sel]').forEach((c) => { c.checked = todos.checked; });
  const env = async (refs, bt) => comBotao(bt, async () => {
    if (!refs.length) throw new Error('Marque pelo menos um e-mail.');
    const n = await q(sb.rpc('emails_central_enviar', { p_refs: refs }));
    aviso('✓ ' + n + ' e-mail(s) na fila de envio (saem em até 5 minutos).'); await carregarEmails();
  });
  alvo.querySelectorAll('[data-em-agora]').forEach((bt) => bt.onclick = () => env([bt.dataset.emAgora], bt));
  const sel = $('em-enviar-sel'); if (sel) sel.onclick = () => env([...alvo.querySelectorAll('[data-em-sel]:checked')].map((c) => c.dataset.emSel), sel);
  alvo.querySelectorAll('[data-em-pular]').forEach((bt) => bt.onclick = () => comBotao(bt, async () => {
    if (!confirm('Pular este e-mail? Ele não será enviado (nem pela rotina automática).')) return;
    await q(sb.rpc('emails_central_pular', { p_refs: [bt.dataset.emPular] })); aviso('E-mail pulado.'); await carregarEmails();
  }));
  alvo.querySelectorAll('[data-em-de-novo]').forEach((bt) => bt.onclick = () => comBotao(bt, async () => {
    await q(sb.rpc('email_reenviar', { p_id: bt.dataset.emDeNovo })); aviso('✓ Voltou para a fila: sai na próxima rodada (até 5 minutos).'); await carregarEmails();
  }));
}
// "E-mail de destino": o endereço e de qual contato ele veio (empresas podem ter vários e-mails)
// Backup 26: de onde veio o destinatário — marcado para este tipo, contato do setor, contato geral ou e-mail do cadastro
const ORIGEM_DESTINO = { marcado: 'marcado para receber', setor: 'contato do setor', geral: 'contato geral', cadastro: 'e-mail do cadastro' };
const rotSetor = (k) => (SETORES_CONTATO.find((x) => x[0] === k) || [k, k || ''])[1];
function destinoEmail(x) {
  if (!x.para) return '<span class="sub">— sem e-mail —</span><div class="sub">cadastre em Clientes → ficha → Contatos</div>';
  const de = x.origem === 'cadastro' || (!x.contato && !x.setor) ? 'e-mail do cadastro' : [x.contato ? esc(x.contato) : '', x.setor ? esc(rotSetor(x.setor)) : '', esc(ORIGEM_DESTINO[x.origem] || '')].filter(Boolean).join(' · ');
  return '<span class="em-para">' + esc(x.para) + '</span><div class="sub" title="Quem recebe: o contato marcado com a finalidade deste e-mail (Clientes → ficha → Contatos)">' + de + '</div>';
}
async function previaEmail(ref) {
  const p = await q(sb.rpc('emails_central_previa', { p_ref: ref }));
  if (!p) return aviso('Prévia indisponível.', true);
  const j = abrirJanela({ titulo: '✉ ' + p.assunto, larga: true,
    corpo: '<div class="sub" style="margin-bottom:8px">Para: <b>' + esc(p.para || '— sem e-mail —') + '</b></div><iframe class="em-previa" sandbox="" title="Prévia do e-mail"></iframe>' });
  j.querySelector('iframe').srcdoc = p.html;
}
// ⚙ automático por tipo, horário e os intervalos dos avisos
async function janelaAutoEmails() {
  const c = await q(sb.rpc('config_emails'));
  const lig = (k, r, d) => '<label class="check em-lig"><input type="checkbox" name="' + k + '"' + (c[k] ? ' checked' : '') + '> <b>' + r + '</b> <span class="sub">' + d + '</span></label>';
  const j = abrirJanela({ titulo: '⚙ E-mails automáticos', larga: true,
    corpo: '<form id="f-emauto" class="grade">' +
      '<div class="inteiro">' + lig('honorarios', 'Honorários', 'lembrete, vence hoje e 1º/2º/3º aviso de atraso') + lig('parcelamentos', 'Parcelamentos', 'guia do mês e aviso de parcelas em atraso') +
        lig('acordos', 'Acordos', 'lembrete da parcela e aviso de atraso') + lig('recibos', 'Recibos', 'ao marcar "Recebido", com o PDF do recibo') + '</div>' +
      campo('Horário do envio (Brasília)', '<input name="hora" type="time" value="' + esc(c.hora || '') + '">') +
      campo('Lembrete de honorários: dias antes', '<input name="lembrete_dias" type="number" min="1" max="30" value="' + c.lembrete_dias + '">') +
      campo('1º aviso de atraso (dias)', '<input name="a1" type="number" min="1" value="' + c.atraso[0] + '">') +
      campo('2º aviso (dias)', '<input name="a2" type="number" min="2" value="' + c.atraso[1] + '">') +
      campo('3º aviso (dias)', '<input name="a3" type="number" min="3" value="' + c.atraso[2] + '">') +
      campo('Guia do parcelamento: dias antes', '<input name="parc_dias" type="number" min="0" max="30" value="' + c.parc_dias + '">') +
      campo('Parcela do acordo: dias antes', '<input name="aco_dias" type="number" min="0" max="30" value="' + c.aco_dias + '">') +
      campo('Acordo em atraso: avisar após (dias)', '<input name="aco_atraso_dias" type="number" min="0" max="60" value="' + c.aco_atraso_dias + '">') + '</form>' +
      '<p class="sub">Horário vazio = os e-mails saem junto da rotina das 7h (dias úteis). O perfil de e-mail de cada cliente continua valendo.</p>',
    rodape: '<span></span><button class="btn btn-p" type="button" id="emauto-salvar">Salvar</button>' });
  const f = j.querySelector('#f-emauto');
  j.querySelector('#emauto-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const n = (k) => parseInt(f[k].value, 10) || 0;
    await q(sb.rpc('salvar_config_emails', { p: { honorarios: f.honorarios.checked, parcelamentos: f.parcelamentos.checked, acordos: f.acordos.checked, recibos: f.recibos.checked,
      hora: f.hora.value || '', lembrete_dias: n('lembrete_dias'), atraso: [n('a1'), n('a2'), n('a3')], parc_dias: n('parc_dias'), aco_dias: n('aco_dias'), aco_atraso_dias: n('aco_atraso_dias') } }));
    aviso('✓ Configuração dos e-mails salva.'); fecharJanela(j); if ($('em-corpo')) await carregarEmails();
  });
}
// ✎ modelos (texto e assunto de cada e-mail)
async function janelaModelosEmail() {
  const ms = await q(sb.from('emails_modelos').select('*').order('ordem'));
  const j = abrirJanela({ titulo: '✎ Modelos dos e-mails ao cliente', larga: true,
    corpo: '<div class="dica" style="margin-bottom:10px">Os campos entre chaves são trocados sozinhos: {vencimento}, {parcela}, {credor}, {processo}, {empresa}, {natureza}, {numero}, {atrasadas}, {pix}, {valor}, {extenso}, {data_pagamento}. ' +
      'A saudação ("Olá, Fulano"), a tabela de valores e a assinatura com a marca do escritório entram automaticamente.</div>' +
      '<div class="lista-ficha">' + ms.map((m) => '<div class="item-ficha"><div><b>' + esc(m.nome) + '</b><div class="sub">' + esc(m.assunto) + '</div></div><button class="btn btn-o btn-mini" data-emm="' + m.chave + '">Editar</button></div>').join('') + '</div>' });
  j.querySelectorAll('[data-emm]').forEach((b) => b.onclick = () => {
    const m = ms.find((x) => x.chave === b.dataset.emm);
    const k = abrirJanela({ titulo: 'Modelo — ' + m.nome, larga: true,
      corpo: '<form id="f-emm" class="grade">' + campo('Assunto', '<input name="assunto" maxlength="200" value="' + esc(m.assunto) + '">', 'inteiro') +
        '<div class="inteiro em-manual"><div><div class="secao">Texto</div><div class="pr-texto" id="emm-texto" contenteditable="true">' + m.texto + '</div></div>' +
        '<div><div class="secao">Como o cliente recebe <span class="sub">(com dados de exemplo)</span></div><iframe id="emm-previa" class="em-previa" sandbox="" title="Prévia"></iframe></div></div></form>',
      rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="emm-salvar">Salvar</button></div>' });
    k.querySelector('.janela').classList.add('janela-rel');
    const EXEMPLO = { vencimento: '10/10/2026', parcela: '4/6', credor: 'Fornecedor Exemplo S.A.', processo: '0000000-00.2025.8.13.0000', empresa: 'Empresa Exemplo Ltda',
      natureza: 'Transação tributária · PGFN', numero: '12345', atrasadas: '2', pix: 'pix@escritorio.com.br', valor: 'R$ 4.500,00', extenso: 'quatro mil e quinhentos reais', data_pagamento: '28/09/2026' };
    let tPv; const pv = () => { clearTimeout(tPv); tPv = setTimeout(async () => {
      const troca = (t) => String(t).replace(/\{(\w+)\}/g, (x, c) => EXEMPLO[c] || x);
      const r = await sb.rpc('previa_email_modelo', { p_assunto: troca(k.querySelector('[name=assunto]').value), p_html: troca(limparHtmlEmail(k.querySelector('#emm-texto').innerHTML)) });
      if (!r.error) k.querySelector('#emm-previa').srcdoc = r.data || ''; }, 350); };
    k.querySelector('#emm-texto').addEventListener('input', pv); k.querySelector('[name=assunto]').addEventListener('input', pv); pv();
    k.querySelector('[data-cancelar]').onclick = () => fecharJanela(k);
    k.querySelector('#emm-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
      const f = k.querySelector('#f-emm'), txt = limparHtmlEmail(k.querySelector('#emm-texto').innerHTML);
      if (!f.assunto.value.trim() || !txt.trim()) throw new Error('Assunto e texto não podem ficar vazios.');
      await q(sb.from('emails_modelos').update({ assunto: f.assunto.value.trim(), texto: txt }).eq('chave', m.chave));
      aviso('✓ Modelo salvo.'); fecharJanela(k); fecharJanela(j); janelaModelosEmail();
    });
  });
}
function limparHtmlEmail(h) {
  const d = document.createElement('div'); d.innerHTML = h;
  d.querySelectorAll('script,style,iframe,object,embed,link,meta,img').forEach((x) => x.remove());
  d.querySelectorAll('*').forEach((x) => [...x.attributes].forEach((a) => { if (a.name !== 'style' || /url\(|expression/i.test(a.value)) x.removeAttribute(a.name); }));
  return d.innerHTML;
}
// aba "E-mails" da ficha do cliente
async function abaEmailsCliente(alvo, cl) {
  const l = await q(sb.rpc('emails_do_cliente', { p_cliente: cl.id }));
  alvo.innerHTML = '<div class="titulo-pag" style="margin-bottom:8px"><div><b>E-mails enviados</b> <span class="sub">' + l.length + '</span></div></div>' +
    (l.length ? '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th data-tipo="data">Quando</th><th>Tipo</th><th>Assunto</th><th>Para</th><th>Situação</th></tr></thead><tbody>' +
      l.map((x) => '<tr class="clicavel" data-em-id="' + x.id + '"><td class="mono" data-ord="' + esc(x.quando) + '">' + dataHoraBR(x.quando) + '</td><td>' + esc(x.tipo) + (x.anexo ? ' 📎' : '') + '</td><td>' + esc(x.assunto) + '</td><td>' + esc(x.para) + '</td>' +
        '<td>' + (x.status === 'erro' ? '<span class="pill vencido" title="' + esc(x.erro) + '">erro</span>' : x.status === 'enviado' ? '<span class="pill pago">entregue ao servidor</span>' : '<span class="pill hoje">na fila</span>') + '</td></tr>').join('') +
      '</tbody></table></div>' : vazio('Nenhum e-mail enviado a este cliente.'));
  alvo.querySelectorAll('[data-em-id]').forEach((tr) => tr.onclick = () => previaEmail(tr.dataset.emId).catch((e) => aviso(erroAmigavel(e), true)));
}

// ═══ Backup 26: CONTROLE POR CLIENTE — o que cada cliente recebe, para qual e-mail, quem é o responsável, modelo e histórico ═══
// Backup 29: nomes mais claros — Honorários, Parcelamentos, Recibo de honorário, Reuniões (as chaves internas não mudam)
const TIPOS_CONTROLE = [['cobranca', 'Honorários', 'hon_lembrete', 'lembrete antes do vencimento, vence hoje e 1º/2º/3º aviso de atraso dos honorários'],
  ['guia', 'Parcelamentos', 'parc_guia', 'guias dos parcelamentos e parcelas em atraso'], ['acordo', 'Acordos', 'aco_lembrete', 'lembrete e atraso da parcela do acordo'],
  ['recibo', 'Recibo de honorário', 'recibo', 'ao dar baixa no honorário, com o PDF do recibo'], ['contrato', 'Contratos', 'boas_vindas', 'boas-vindas na assinatura, propostas'],
  ['convite', 'Reuniões', 'convite', 'convite de reunião (quando marcado na reunião)']];
let _emCtrl = [];
async function controleEmails(alvo) {
  // Backup 36: mais simples — uma linha por cliente com um sinal por tipo (✓ recebe · ⚠ sem e-mail · — não recebe) e o e-mail principal;
  // a regra geral (setor quando ninguém está marcado) fica recolhida; clique no cliente para escolher contatos e ver o histórico
  const admin = E.perfil && E.perfil.papel === 'admin';
  E.emc = Object.assign({ busca: '', perfil: '', problema: false }, E.emc || {});
  const F = E.emc;
  alvo.innerHTML = '<div class="carregando">Carregando…</div>';
  const [lista, dest] = await Promise.all([q(sb.rpc('emails_controle')), q(sb.from('configuracoes').select('valor').eq('chave', 'emails_destino').maybeSingle()).catch(() => null)]);
  _emCtrl = lista || [];
  const mapa = (dest && dest.valor) || {};
  const falta = (c) => TIPOS_CONTROLE.some(([k]) => c.tipos[k] && c.tipos[k].recebe && !c.tipos[k].para);
  const nFalta = _emCtrl.filter(falta).length;
  alvo.innerHTML =
    '<div class="emc-topo"><div class="emc-resumo"><div class="emc-n"><b>' + _emCtrl.length + '</b><span>clientes</span></div>' +
      '<button type="button" class="emc-n' + (nFalta ? ' emc-n-ruim' : ' emc-n-ok') + (F.problema ? ' ativo' : '') + '" id="emc-prob" aria-pressed="' + F.problema + '"><b>' + nFalta + '</b><span>' + (nFalta ? 'com e-mail faltando — ver' : 'com e-mail faltando') + '</span></button></div>' +
      '<div class="emc-leg"><span class="emc-s emc-s-ok">✓</span> recebe <span class="emc-s emc-s-falta">!</span> recebe, mas sem e-mail <span class="emc-s emc-s-nao">–</span> não recebe · <b>clique no cliente</b> para escolher quem recebe cada tipo</div></div>' +
    '<div class="filtros" id="emc-filtros"><input class="busca" id="emc-busca" placeholder="Buscar cliente ou grupo" autocomplete="off" value="' + esc(F.busca) + '">' +
      '<div class="segmento" id="emc-perfis"><button type="button" data-v="">Todos</button>' + PERFIS_EMAIL.map(([v, r]) => '<button type="button" data-v="' + v + '">' + esc(r) + '</button>').join('') + '</div></div>' +
    '<div class="card"><div id="emc-tab"></div></div>' +
    '<details class="emc-regra"><summary>⚙ Regra geral: para qual setor vai cada tipo quando ninguém está marcado</summary><div class="emc-destinos">' +
      TIPOS_CONTROLE.map(([k, r]) => '<label>' + r + ' → <select class="busca sel" data-emc-dest="' + k + '"' + (admin ? '' : ' disabled') + '>' +
        SETORES_CONTATO.map(([v, rs]) => '<option value="' + v + '"' + ((mapa[k] || 'financeiro') === v ? ' selected' : '') + '>' + rs + '</option>').join('') + '</select></label>').join('') +
      '<span class="sub">Sem contato nesse setor: vai para o contato Geral e, por último, para o e-mail do cadastro.</span></div></details>';
  const sinal = (t, r) => {
    if (!t || !t.recebe) return '<span class="emc-s emc-s-nao" title="' + esc(r) + ': não recebe (perfil do cliente)">–</span>';
    if (!t.para) return '<span class="emc-s emc-s-falta" title="' + esc(r) + ': recebe, mas não há e-mail — cadastre um contato">!</span>';
    return '<span class="emc-s emc-s-ok" title="' + esc(r + ': ' + t.para) + '">✓</span>';
  };
  const principal = (c) => { const n = {}; TIPOS_CONTROLE.forEach(([k]) => { const t = c.tipos[k]; if (t && t.recebe && t.para) String(t.para).split(/,\s*/).forEach((m) => { n[m] = (n[m] || 0) + 1; }); });
    const L = Object.keys(n).sort((x, y) => n[y] - n[x]); return L; };
  const pintar = () => {
    const b = normalizar(F.busca);
    alvo.querySelectorAll('#emc-perfis button').forEach((x) => x.classList.toggle('ativo', x.dataset.v === F.perfil));
    const pb = $('emc-prob'); if (pb) { pb.classList.toggle('ativo', F.problema); pb.setAttribute('aria-pressed', F.problema); }
    const vis = _emCtrl.filter((c) => (!F.perfil || (c.perfil || 'padrao') === F.perfil) && (!b || normalizar(c.nome + ' ' + (c.grupo || '')).includes(b)) && (!F.problema || falta(c)));
    $('emc-tab').innerHTML = vis.length ? '<div class="tabela-wrap"><table class="ordenavel emc-tab emc-tab2"><thead><tr>' +
      '<th>Cliente</th><th>Vai para</th>' + TIPOS_CONTROLE.map(([, r, , d]) => '<th class="emc-c-t" title="' + esc(d) + '">' + r + '</th>').join('') + '<th>Perfil</th></tr></thead><tbody>' +
      vis.map((c) => { const em = principal(c);
        return '<tr class="clicavel' + (falta(c) ? ' emc-ruim' : '') + '" data-emc="' + c.id + '">' +
        '<td><b>' + esc(c.nome) + '</b>' + (c.grupo && c.grupo !== c.nome ? '<div class="sub">' + esc(c.grupo) + '</div>' : '') + '</td>' +
        '<td>' + (em.length ? '<span class="em-para" title="' + esc(em.join(', ')) + '">' + esc(em[0]) + '</span>' + (em.length > 1 ? ' <span class="sub">+' + (em.length - 1) + '</span>' : '') : '<span class="pill vencido">sem e-mail</span>') + '</td>' +
        TIPOS_CONTROLE.map(([k, r]) => '<td class="emc-c-t">' + sinal(c.tipos[k], r) + '</td>').join('') +
        '<td><select class="busca sel cem-perfil-sel" data-cem="' + c.id + '" aria-label="Perfil de ' + esc(c.nome) + '">' + PERFIS_EMAIL.map(([v, r]) => '<option value="' + v + '"' + ((c.perfil || 'padrao') === v ? ' selected' : '') + '>' + r + '</option>').join('') + '</select></td></tr>'; }).join('') + '</tbody></table></div>'
      : vazio(F.problema ? 'Nenhum cliente com e-mail faltando. 👍' : 'Nenhum cliente neste filtro.');
    alvo.querySelectorAll('tr[data-emc]').forEach((tr) => tr.onclick = (ev) => { if (ev.target.closest('input, select, label, button')) return; janelaControleCliente(tr.dataset.emc, () => controleEmails(alvo)); });
    alvo.querySelectorAll('[data-cem]').forEach((sel) => sel.onchange = () => comBotao(sel, async () => {
      if (sel.value === 'personalizado') {
        await q(sb.rpc('salvar_perfil_email', { p_ids: [sel.dataset.cem], p_perfil: 'personalizado', p_tipos: null }));
        _emCtrl = (await q(sb.rpc('emails_controle'))) || [];
        await janelaControleCliente(sel.dataset.cem, () => controleEmails(alvo)); return;
      }
      await q(sb.rpc('salvar_perfil_email', { p_ids: [sel.dataset.cem], p_perfil: sel.value, p_tipos: null }));
      aviso('✓ Perfil de e-mail atualizado.'); await carregarCadastros(true); await controleEmails(alvo);
    }));
  };
  alvo.querySelectorAll('[data-emc-dest]').forEach((sel) => sel.onchange = () => comBotao(sel, async () => {
    await q(sb.rpc('salvar_destinos_email', { p: { [sel.dataset.emcDest]: sel.value } }));
    aviso('✓ Regra geral salva.'); await controleEmails(alvo);
  }));
  let tb; $('emc-busca').oninput = (ev) => { clearTimeout(tb); tb = setTimeout(() => { F.busca = ev.target.value; pintar(); }, 250); };
  $('emc-perfis').onclick = (ev) => { const x = ev.target.closest('button'); if (x) { F.perfil = x.dataset.v; pintar(); } };
  $('emc-prob').onclick = () => { F.problema = !F.problema; pintar(); };
  pintar();
}
// detalhe de um cliente: tipo a tipo (recebe? para quem? quais contatos?), modelo de cada e-mail e histórico
async function janelaControleCliente(id, depois) {
  const c = _emCtrl.find((x) => x.id === id) || ((await q(sb.rpc('emails_controle'))) || []).find((x) => x.id === id);
  if (!c) return aviso('Cliente não encontrado.', true);
  const [contatos, cli, modelos] = await Promise.all([q(sb.from('contatos').select('id, nome, finalidade, email, recebe').eq('cliente_id', id).order('criado_em')),
    q(sb.from('clientes').select('perfil_email, emails_tipos').eq('id', id).single()), q(sb.from('emails_modelos').select('chave, nome, assunto, texto')).catch(() => [])]);
  const pers = cli.perfil_email === 'personalizado', tip = cli.emails_tipos || {};
  const PERM = { cobranca: ['lembrete', 'vencimento', 'cobranca'], guia: ['parcelamento'], acordo: ['acordo'], recibo: ['recibo'], contrato: ['boas_vindas'], convite: ['convite'] };
  const comEmail = contatos.filter((x) => x.email);
  const j = abrirJanela({ titulo: '📨 E-mails de ' + c.nome, larga: true,
    corpo: '<div class="ficha-selos" style="margin-bottom:10px">' + pillPessoa(c.responsavel) + ' <span class="pill neutro">Perfil: ' + esc((PERFIS_EMAIL.find((p) => p[0] === (c.perfil || 'padrao')) || PERFIS_EMAIL[0])[1]) + '</span></div>' +
      (comEmail.length ? '' : '<div class="dica" style="margin-bottom:10px">Este cliente não tem contato com e-mail. Cadastre em <b>Clientes → ficha → Contatos</b> (com o setor e o que cada um recebe).</div>') +
      '<div class="tabela-wrap"><table class="emc-det"><thead><tr><th>Tipo de e-mail</th><th>Recebe?</th><th>Vai para</th><th>Contatos que recebem este tipo</th><th></th></tr></thead><tbody>' +
      TIPOS_CONTROLE.map(([k, r, mod, d]) => { const t = c.tipos[k] || {};
        return '<tr><td><b>' + r + '</b><div class="sub">' + esc(d) + '</div></td>' +
          '<td>' + (pers ? PERM[k].map((pk) => '<label class="check"><input type="checkbox" data-emc-tipo="' + pk + '"' + ((tip[pk] != null ? tip[pk] : pk !== 'vencimento') ? ' checked' : '') + '> ' + esc((TIPOS_EMAIL.find((x) => x[0] === pk) || [pk, pk])[1]) + '</label>').join('')
            : t.recebe ? '<span class="pill pago">sim</span>' : '<span class="pill neutro">não</span>') + '</td>' +
          '<td>' + (t.para ? '<span class="em-para">' + esc(t.para) + '</span><div class="sub">' + esc(ORIGEM_DESTINO[t.origem] || '') + '</div>' : '<span class="pill vencido">sem e-mail</span>') + '</td>' +
          '<td>' + (comEmail.length ? comEmail.map((ct) => '<label class="check"><input type="checkbox" data-emc-ct="' + ct.id + '" data-k="' + k + '"' + ((ct.recebe || []).includes(k) ? ' checked' : '') + '> ' +
              esc(ct.nome || ct.email) + ' <span class="sub">' + esc(rotSetor(ct.finalidade)) + '</span></label>').join('') : '<span class="sub">—</span>') + '</td>' +
          '<td>' + (modelos.some((m) => m.chave === mod) ? '<button class="btn btn-o btn-mini" type="button" data-emc-modelo="' + mod + '">Ver modelo</button>' : '') + '</td></tr>'; }).join('') +
      '</tbody></table></div>' +
      '<p class="sub" style="margin:8px 0 14px">Marcar um contato num tipo faz <b>só ele(s)</b> receber aquele tipo. Sem ninguém marcado, vale a regra geral (embaixo da lista).' +
        (pers ? ' Perfil <b>Personalizado</b>: as caixinhas de "Recebe?" valem para este cliente.' : ' Para escolher tipo a tipo o que ele recebe, mude o perfil para <b>Personalizado</b>.') + '</p>' +
      '<div class="secao">Histórico de e-mails</div><div id="emc-hist"><div class="carregando">Carregando…</div></div>',
    rodape: '<button class="btn btn-o" type="button" id="emc-ficha">Abrir a ficha (Contatos)</button><div class="acoes">' + (pers ? '<button class="btn btn-p" type="button" id="emc-salvar-tipos">Salvar o que recebe</button>' : '') + '</div>' });
  let mudou = false;
  j._aoFechar = () => { if (mudou && depois) depois(); };
  j.querySelectorAll('[data-emc-ct]').forEach((x) => x.onchange = () => comBotao(x, async () => {
    await q(sb.rpc('contato_recebe', { p_contato: x.dataset.emcCt, p_tipo: x.dataset.k, p_recebe: x.checked })); mudou = true;
    aviso('✓ ' + (x.checked ? 'Passa a receber' : 'Deixa de receber') + ' ' + (RECEBE_CURTO[x.dataset.k] || '').toLowerCase() + '.');
  }));
  j.querySelectorAll('[data-emc-modelo]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const m = modelos.find((x) => x.chave === b.dataset.emcModelo);
    const html = await q(sb.rpc('previa_email_modelo', { p_assunto: m.assunto, p_html: m.texto }));
    const k = abrirJanela({ titulo: '✉ Modelo — ' + m.nome, larga: true, corpo: '<div class="sub" style="margin-bottom:8px">Assunto: <b>' + esc(m.assunto) + '</b> · os campos entre chaves são trocados pelos dados de verdade. Para mudar o texto: ✎ Modelos.</div><iframe class="em-previa" sandbox="" title="Prévia do modelo"></iframe>' });
    k.querySelector('iframe').srcdoc = html;
  }));
  const bs = j.querySelector('#emc-salvar-tipos');
  if (bs) bs.onclick = () => comBotao(bs, async () => {
    const tipos = Object.assign({}, tip); j.querySelectorAll('[data-emc-tipo]').forEach((x) => { tipos[x.dataset.emcTipo] = x.checked; });
    await q(sb.rpc('salvar_perfil_email', { p_ids: [id], p_perfil: 'personalizado', p_tipos: tipos })); mudou = true;
    aviso('✓ O que ' + c.nome + ' recebe foi salvo.'); fecharJanela(j);
  });
  j.querySelector('#emc-ficha').onclick = () => { fecharJanela(j); abrirFicha(id, 'contatos'); };
  abaEmailsCliente(j.querySelector('#emc-hist'), { id }).catch((e) => { j.querySelector('#emc-hist').innerHTML = '<div class="vazio">' + esc(erroAmigavel(e)) + '</div>'; });
}

'use strict';
// ═══════════════════════════════════════════════════════════════════
// Guias (Backup 27) — emissão das guias de PARCELAMENTOS e dos boletos/PIX de ACORDOS,
// pensada para o estagiário: 1) emitir  2) marcar "emitida" (data e quem, com o PDF guardado)
// 3) mandar ao cliente por e-mail (a guia vai anexa)  4) conferir o pagamento (✓ Pago).
// Quadro "Guias para emitir" no alto de Parcelamentos e de Acordos + janela de emissão,
// usada também nos cartões das parcelas do detalhamento.
// ═══════════════════════════════════════════════════════════════════
const GUIA_DIAS = 15;   // o quadro mostra o que vence até 15 dias à frente (e tudo o que já venceu sem pagamento)
const ABAS_GUIA = [['emitir', '🧾 A emitir'], ['emitidas', '✓ Emitidas — falta enviar'], ['vencidas', '⏰ Vencidas sem pagamento']];
const _guiaAba = { parcelas: 'emitir', acordos: 'emitir' };
// Backup 28: quadro minimizável (lembra por navegador) e envio de várias guias da mesma empresa num e-mail/WhatsApp
const _guiaMin = {};
try { Object.assign(_guiaMin, JSON.parse(localStorage.getItem('erp_guias_min') || '{}')); } catch (e) { /* sem armazenamento: começa aberto */ }
const emitida = (x) => !!x.emitida_em || /sim|emitid/i.test(x.emissao || '');

async function dadosGuias(tabela) {
  const lim = somarDias(hojeISO(), GUIA_DIAS);
  let L;
  if (tabela === 'parcelas') {
    L = (await buscarTodos(() => sb.from('parcelas').select('id, numero, vencimento, pago, emissao, emitida_em, emitida_por, guia_doc, reenvio_em, reenvio_venc, reenvio_valor, reenvios, parcelamentos(id, empresa, natureza, local, numero, total_parcelas, valor_ultima_parcela, grupo_id, emitimos_guia, cnpj)')
      .eq('pago', false).lte('vencimento', lim).order('vencimento').order('id')).catch(() => []))
      .filter((x) => x.parcelamentos && x.parcelamentos.emitimos_guia !== false)
      .map((x) => { const p = x.parcelamentos;
        return Object.assign(x, { quem: p.empresa, detalhe: [p.natureza, p.local, p.numero ? 'nº ' + p.numero : ''].filter(Boolean).join(' · '),
          parcela: (x.numero || '?') + (p.total_parcelas ? '/' + p.total_parcelas : ''), valor: Number(p.valor_ultima_parcela) || 0, grupo_id: p.grupo_id,
          cliente_id: (E.clientes.find((c) => (soDigitos(p.cnpj) && soDigitos(c.cpf_cnpj) === soDigitos(p.cnpj)) || c.nome === p.empresa) || {}).id || null }); });
  } else {
    L = (await buscarTodos(() => sb.from('acordos').select('id, parcela, total_parcelas, vencimento, valor, pago, emissao, emitida_em, emitida_por, guia_doc, reenvio_em, reenvio_venc, reenvio_valor, reenvios, devedor, credor, processo, grupo_id, pix, banco, forma_pagamento')
      .eq('pago', false).lte('vencimento', lim).order('vencimento').order('id')).catch(() => []))
      .map((x) => Object.assign(x, { quem: x.devedor, detalhe: 'deve a ' + (x.credor || '—') + (x.processo ? ' · ' + x.processo : ''),
        parcela: (x.parcela || '?') + (x.total_parcelas ? '/' + x.total_parcelas : ''), valor: Number(x.valor) || 0,
        cliente_id: (E.clientes.find((c) => c.grupo_id === x.grupo_id && primeiroNome(c.nome) === primeiroNome(x.devedor)) || {}).id || null }));
  }
  const envios = L.length ? await q(sb.rpc('emissao_emails', { p_tabela: tabela, p_ids: L.map((x) => x.id) })).catch(() => ({})) : {};
  L.forEach((x) => { const v = (envios || {})[x.id];
    // Backup 30: {em, status, para, erro} — status vem da fila (pendente · retido · enviado · erro · cancelado)
    const o = !v ? null : typeof v === 'string' ? { em: v, status: 'enviado' } : v;
    x.email_em = o ? o.em : null; x.email_st = o ? o.status : ''; x.email_para = o ? o.para || '' : ''; x.email_erro = o ? o.erro || '' : ''; });
  return L;
}
// já saiu (ou está saindo) para o cliente: na fila, retido pela pausa ou enviado. Erro/descartado volta para "falta enviar".
const guiaEnviada = (x) => !!x.email_em && !/erro|cancelado/.test(x.email_st || '');
const ST_EMAIL = { pendente: ['aberto', '✉ na fila'], retido: ['hoje', '⏸ retido (pausa)'], enviado: ['pago', '✉ enviado'], erro: ['vencido', '⚠ e-mail falhou'], cancelado: ['neutro', 'e-mail descartado'] };

// quadro no alto de Parcelamentos / Acordos
// Backup 29: "Parcelamentos para emitir" / "Acordos para emitir"; o que já foi ENVIADO ao cliente sai do quadro (evita confusão)
async function cardGuias(tabela, el) {
  if (!el) return;
  if (!E.clientes.length) await carregarCadastros();
  const h = hojeISO(), TODOS = await dadosGuias(tabela), L = TODOS.filter((x) => !guiaEnviada(x)), enviadas = TODOS.filter((x) => guiaEnviada(x) && x.vencimento >= h).length,
    retidas = TODOS.filter((x) => x.email_st === 'retido').length, naFila = TODOS.filter((x) => x.email_st === 'pendente').length;
  // Backup 33: cada parcela em UMA aba só — a emitir / emitida (falta enviar) / VENCIDA sem pagamento (mesmo já enviada: fica até o ✓ Pago, com o reenvio)
  const grupos = { emitir: L.filter((x) => !emitida(x) && x.vencimento >= h), emitidas: L.filter((x) => emitida(x) && x.vencimento >= h), vencidas: TODOS.filter((x) => x.vencimento < h) };
  const aba = _guiaAba[tabela], lista = grupos[aba], nome = tabela === 'parcelas' ? 'guia' : 'boleto/PIX';
  const dias = (v) => { const d = Math.round((new Date(v + 'T12:00:00') - new Date(h + 'T12:00:00')) / 864e5);
    return d < 0 ? '<span class="dias-r">' + (-d) + ' d atraso</span>' : d === 0 ? '<span class="dias-r">vence hoje</span>' : '<span class="' + (d < 3 ? 'dias-a' : d < 10 ? 'dias-b' : 'dias-g') + '">em ' + d + ' d</span>'; };
  const min = !!_guiaMin[tabela];
  el.innerHTML = '<div class="card gd-card' + (min ? ' gd-min' : '') + '"><div class="card-hd">🧾 ' + (tabela === 'parcelas' ? 'Parcelamentos para emitir' : 'Acordos para emitir') +
      (min && grupos.emitir.length ? ' <span class="pill hoje">' + grupos.emitir.length + ' a emitir</span>' : '') +
      '<span class="sub">vencem até ' + dataBR(somarDias(h, GUIA_DIAS)) + ' · emitir → enviar ao cliente → conferir o pagamento' + (enviadas ? ' · ✉ ' + plural(enviadas, 'já enviada ao cliente saiu', 'já enviadas ao cliente saíram') + ' da lista' : '') + '</span>' +
      '<span class="gd-hd-ac">' + (L.length ? '<button type="button" class="btn btn-p btn-mini" data-gd-empresa>✉ Enviar por empresa</button>' : '') +
      '<button type="button" class="btn btn-o btn-mini" data-gd-min aria-expanded="' + (min ? 'false' : 'true') + '">' + (min ? '▸ Mostrar' : '▾ Minimizar') + '</button></span></div>' +
    '<div class="card-bd"' + (min ? ' hidden' : '') + '>' +
    (retidas || naFila ? '<div class="gd-fila">' + (retidas ? '⏸ <b>' + plural(retidas, 'e-mail de guia retido', 'e-mails de guias retidos') + '</b> pela pausa de envio — só sai quando alguém liberar. ' : '') +
      (naFila ? '✉ ' + plural(naFila, 'e-mail na fila', 'e-mails na fila') + ' (sai em até 5 minutos). ' : '') +
      '</div>' : '') +
    '<div class="segmento gd-abas">' + ABAS_GUIA.map(([k, r]) => '<button type="button" data-gd-aba="' + k + '" class="' + (aba === k ? 'ativo' : '') + '">' + r +
        ' <span class="pill ' + (k === 'vencidas' && grupos[k].length ? 'vencido' : k === 'emitir' && grupos[k].length ? 'hoje' : 'neutro') + '">' + grupos[k].length + '</span></button>').join('') + '</div>' +
    (lista.length ? htmlGuiasPorGrupo(tabela, lista, TODOS, nome, dias, h, aba)
      : '<div class="sub" style="padding:8px 2px">' + ({ emitir: 'Nada a emitir agora. 👏', emitidas: 'Nenhuma ' + nome + ' emitida aguardando envio.', vencidas: 'Nenhuma parcela vencida sem pagamento. 👏' })[aba] + '</div>') +
    '</div></div>';
  const bf = el.querySelector('[data-gd-fila]'); if (bf) bf.onclick = () => { if (typeof window.nav === 'function') window.nav(null, 'emails'); };
  el.querySelector('[data-gd-min]').onclick = () => { _guiaMin[tabela] = !_guiaMin[tabela]; try { localStorage.setItem('erp_guias_min', JSON.stringify(_guiaMin)); } catch (e) { /* ok */ } cardGuias(tabela, el); };
  const be = el.querySelector('[data-gd-empresa]'); if (be) be.onclick = () => janelaGuiasEmpresa(tabela, L, null, () => cardGuias(tabela, el));
  el.querySelectorAll('[data-gd-grp]').forEach((b) => b.onclick = () => { const k = tabela + '|' + b.dataset.gdGrp; _guiaGrpAberto[k] = !_guiaGrpAberto[k]; cardGuias(tabela, el); });
  el.querySelectorAll('[data-gd-emp]').forEach((b) => b.onclick = () => janelaGuiasEmpresa(tabela, L, b.dataset.gdEmp, () => cardGuias(tabela, el)));
  el.querySelectorAll('[data-gd-aba]').forEach((b) => b.onclick = () => { _guiaAba[tabela] = b.dataset.gdAba; cardGuias(tabela, el); });
  el.querySelectorAll('[data-gd-emitir]').forEach((b) => b.onclick = () => janelaEmissao(tabela, TODOS.find((x) => x.id === b.dataset.gdEmitir), () => cardGuias(tabela, el)));
  el.querySelectorAll('[data-gd-ver]').forEach((b) => b.onclick = () => comBotao(b, async () => { const d = (await q(sb.from('documentos').select('*').eq('id', b.dataset.gdVer)))[0]; if (d) await abrirDocumento(d); }));
  el.querySelectorAll('[data-gd-pago]').forEach((b) => b.onclick = () => { if (window.ERP_EDITOR && window.ERP_EDITOR.baixaRapida) window.ERP_EDITOR.baixaRapida(tabela, b.dataset.gdPago); });
}
// Backup 31: o quadro em blocos — GRUPO (clique abre) › empresa (botão "Emitir" = e-mail com as guias dela) › parcelas
const _guiaGrpAberto = {};
const chaveParcGuia = (tabela, x) => tabela === 'parcelas' ? (x.parcelamentos && x.parcelamentos.id) || x.parcelamento_id || x.id : [x.devedor, x.credor, x.processo].join('|');
function htmlGuiasPorGrupo(tabela, lista, TODOS, nome, dias, h, aba) {
  // Backup 33: tudo em COLUNAS fixas (como tabela) — A data · B parcela · C atraso · D valor · E situação · F ações — nas três abas
  const atr = {}; TODOS.forEach((x) => { if (x.vencimento < h) { const k = chaveParcGuia(tabela, x); atr[k] = (atr[k] || 0) + 1; } });
  const grs = {};
  lista.forEach((x) => { const gid = x.grupo_id || ''; const g = (grs[gid] = grs[gid] || { gid, nome: nomeGrupo(gid) || 'Sem grupo', emps: {} });
    const k = chaveEmpresaGuia(x); (g.emps[k] = g.emps[k] || { k, nome: x.quem || '—', itens: [] }).itens.push(x); });
  const G = Object.values(grs).sort((a, b) => (a.nome === 'Sem grupo') - (b.nome === 'Sem grupo') || a.nome.localeCompare(b.nome, 'pt-BR'));
  const unico = G.length === 1, mostrado = {}, venc = aba === 'vencidas', plN = nome === 'guia' ? 'guias' : 'boletos';
  const pillAtr = (n) => n ? '<span class="pill ' + (n >= 2 ? 'vencido' : 'atr-leve') + '">' + n + ' em atraso' + (n >= 2 ? ' · risco de rescisão' : '') + '</span>' : '';
  return '<div class="gd-grupos gd-tab">' +
    '<div class="gd-row gd-cab" aria-hidden="true"><span>Vencimento</span><span>' + (tabela === 'parcelas' ? 'Grupo / empresa / parcela' : 'Grupo / devedor / parcela') + '</span><span>Atraso</span><span class="gd-dir">Valor</span><span>Situação</span><span></span></div>' +
    G.map((g) => {
      const its = Object.values(g.emps).flatMap((e) => e.itens), aberto = unico || !!_guiaGrpAberto[tabela + '|' + g.gid];
      const nv = its.filter((x) => x.vencimento < h).length, tot = its.reduce((s2, x) => s2 + (Number(x.valor) || 0), 0);
      return '<div class="gd-g' + (aberto ? ' gd-g-aberto' : '') + '"><button type="button" class="gd-row gd-g-hd" data-gd-grp="' + esc(g.gid) + '" aria-expanded="' + aberto + '">' +
          '<span class="gd-g-nome"><span class="gd-g-seta">' + (aberto ? '▾' : '▸') + '</span><b>' + esc(g.nome) + '</b><span class="sub">' + plural(Object.keys(g.emps).length, 'empresa', 'empresas') + ' · ' + plural(its.length, nome, plN) + '</span></span>' +
          '<span>' + (nv ? '<span class="pill atr-leve">' + nv + ' vencida' + (nv > 1 ? 's' : '') + '</span>' : '') + '</span>' +
          '<span class="gd-dir gd-g-tot">' + (tot ? brl(tot) : '') + '</span><span></span><span></span></button>' +
        (aberto ? '<div class="gd-g-corpo">' + Object.values(g.emps).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((e) =>
          '<div class="gd-row gd-emp-hd"><span class="gd-emp-nome"><b>' + esc(e.nome) + '</b></span><span></span><span class="gd-dir sub">' + (e.itens.length > 1 ? brl(e.itens.reduce((s2, x) => s2 + (Number(x.valor) || 0), 0)) : '') + '</span><span></span>' +
            '<span class="gd-ac">' + (venc ? '' : '<button type="button" class="btn btn-p btn-mini" data-gd-emp="' + esc(e.k) + '" title="Abre o e-mail com ' + (e.itens.length > 1 ? 'as ' + e.itens.length + ' guias' : 'a guia') + ' desta empresa: anexe os PDFs e envie">🧾 Emitir</button>') + '</span></div>' +
            e.itens.map((x) => { const kp = chaveParcGuia(tabela, x), n = atr[kp] && !mostrado[kp] ? atr[kp] : 0; mostrado[kp] = true;   // uma vez por parcelamento
              return '<div class="gd-row gd-it' + (x.vencimento < h ? ' gd-venc' : '') + '">' +
                '<span class="gd-venc-d"><b>' + dataBR(x.vencimento).slice(0, 5) + '</b>' + dias(x.vencimento) + '</span>' +
                '<span class="gd-quem">Parcela ' + esc(x.parcela) + (x.detalhe ? ' · ' + esc(x.detalhe) : '') + '</span>' +
                '<span class="gd-atr">' + pillAtr(n) + '</span>' +
                '<span class="gd-val gd-dir">' + (x.valor ? brl(x.valor) : '—') + (x.reenvio_valor ? '<small title="valor atualizado da guia reenviada">→ ' + brl(x.reenvio_valor) + '</small>' : '') + '</span>' +
                '<span class="gd-st">' + seloEmissao(x, nome) + '</span>' +
                '<span class="gd-ac">' + (venc ? '<button type="button" class="btn btn-o btn-mini" data-gd-emitir="' + x.id + '" title="Reemitir a guia no portal (valor com SELIC) e mandar de novo ao cliente">↻ Reenviar</button>'
                  : emitida(x) ? (x.guia_doc ? '<button type="button" class="btn btn-o btn-mini" data-gd-ver="' + x.guia_doc + '">📄</button>' : '') +
                    '<button type="button" class="btn btn-o btn-mini" data-gd-emitir="' + x.id + '" title="Emissão / enviar esta guia">✎</button>'
                  : '<button type="button" class="btn btn-o btn-mini" data-gd-emitir="' + x.id + '" title="Emitir só esta guia">Só esta</button>') +
                  '<button type="button" class="btn btn-v btn-mini" data-gd-pago="' + x.id + '" title="Conferiu que o cliente pagou">✓ Pago</button></span></div>'; }).join('')).join('') + '</div>' : '') + '</div>';
    }).join('') + '</div>';
}
function seloEmissao(x, nome) {
  return (emitida(x) ? '<span class="pill pago" title="' + esc(x.emitida_por ? 'por ' + x.emitida_por : '') + '">' + (nome === 'guia' ? 'Guia emitida' : 'Boleto emitido') + (x.emitida_em ? ' em ' + dataBR(x.emitida_em) : '') + '</span>'
      : '<span class="pill hoje">' + (nome === 'guia' ? 'Guia a emitir' : 'Boleto a emitir') + '</span>') +
    (x.email_em ? ' <span class="pill ' + (ST_EMAIL[x.email_st] || ST_EMAIL.enviado)[0] + '" title="' + esc((x.email_para ? 'para ' + x.email_para : '') + (x.email_erro ? ' — ' + x.email_erro : '')) + '">' +
      (ST_EMAIL[x.email_st] || ST_EMAIL.enviado)[1] + ' ' + dataLocal(x.email_em) + '</span>' : '') +
    (x.reenvio_em ? ' <span class="pill aberto" title="' + esc('reenviada ' + (x.reenvios > 1 ? x.reenvios + ' vezes' : '1 vez') + (x.reenvio_valor ? ' · valor atualizado ' + brl(x.reenvio_valor) : '')) + '">↻ reenviada ' + dataLocal(x.reenvio_em) +
      (x.reenvio_venc ? ' · vence ' + dataBR(x.reenvio_venc).slice(0, 5) : '') + '</span>' : '');
}
// data local (fuso do navegador) de um carimbo de hora do banco — "2026-10-01T02:10Z" em Brasília ainda é 30/09
function dataLocal(ts) { if (!ts) return ''; const d = new Date(ts); return isNaN(d) ? dataBR(String(ts).slice(0, 10)) : d.toLocaleDateString('pt-BR'); }
// arquivo escolhido na tela → {arquivo, mime, b64} (vai só dentro do e-mail; não é guardado no sistema)
function lerArquivoB64(f) {
  return new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok({ arquivo: f.name, mime: f.type || 'application/pdf', b64: String(r.result).split(',')[1] || '' }); r.onerror = () => erro(new Error('Não consegui ler ' + f.name)); r.readAsDataURL(f); });
}
const LIMITE_ANEXOS = 15 * 1024 * 1024;

// e-mail cadastrado para receber as guias (contato marcado "Parcelamentos"/"Acordos", setor, geral ou cadastro)
async function preencherDestino(campo, cli, grp, tabela) {
  let para = '';
  if (cli || grp) para = await q(sb.rpc('guia_destino', { p_cliente: cli || null, p_grupo: grp || null, p_tabela: tabela })).catch(() => '') || '';
  if (!campo.isConnected) return;
  if (!campo.value) campo.value = para;
  campo.placeholder = para ? '' : 'sem e-mail cadastrado — digite aqui (ex.: financeiro@empresa.com.br)';
  campo.closest('.campo').classList.toggle('ge-sem-email', !para);
}
// a mensagem depois de pôr o e-mail na fila, conforme a situação real (pausa ligada = retido)
const msgEnvio = (r) => r && r.status === 'retido'
  ? 'e-mail para ' + r.para + ' RETIDO: o envio de e-mails está pausado. Para sair, vá em E-mails → Fila → Liberar (ou desligue a pausa).'
  : 'e-mail na fila para ' + (r && r.para) + ' (sai em até 5 minutos).';

// janela de emissão: marcar como emitida e, se quiser, mandar ao cliente com o PDF (o PDF vai só no e-mail)
async function janelaEmissao(tabela, x, depois) {
  if (!x) return;
  if (!E.clientes.length) await carregarCadastros();
  if (x.vencimento < hojeISO() && !x.pago) return janelaReenvio(tabela, x, depois);   // Backup 33: parcela vencida = reenviar a guia atualizada
  const nome = tabela === 'parcelas' ? 'guia' : 'boleto / PIX', ja = emitida(x);
  const j = abrirJanela({ titulo: '🧾 ' + (ja ? 'Emissão' : 'Emitir ' + nome) + ' — ' + (x.quem || ''), larga: true,
    corpo: '<div class="gd-jan-hd"><div><b>' + esc(x.quem || '—') + '</b><div class="sub">Parcela ' + esc(x.parcela || '') + (x.detalhe ? ' · ' + esc(x.detalhe) : '') + '</div></div>' +
        '<div class="gd-jan-v"><span>Vencimento</span><b>' + dataBR(x.vencimento) + '</b></div>' +
        '<div class="gd-jan-v ge-it-v"><span>Valor da guia</span><span class="ge-vbox"><span class="ge-rs">R$</span><input id="gd-valor" data-mascara="nenhuma" inputmode="decimal" value="' + (x.valor ? valorParaCampo(x.valor) : '') + '" placeholder="0,00" aria-label="Valor da guia"></span></div></div>' +
      (ja ? '<div class="dica" style="margin:10px 0">' + (tabela === 'parcelas' ? 'Guia emitida' : 'Boleto emitido') + (x.emitida_em ? ' em <b>' + dataBR(x.emitida_em) + '</b>' : '') + (x.emitida_por ? ' por <b>' + esc(x.emitida_por) + '</b>' : '') +
          (x.email_em ? ' · e-mail ao cliente em <b>' + dataLocal(x.email_em) + '</b>' + (x.email_st && x.email_st !== 'enviado' ? ' (' + (ST_EMAIL[x.email_st] || ['', x.email_st])[1] + ')' : '') : ' · ainda não enviada ao cliente') + '.</div>' : '') +
      (tabela === 'acordos' && (x.pix || x.banco) ? '<div class="dica" style="margin:10px 0">Dados do credor: ' + [x.pix ? 'PIX <b>' + esc(x.pix) + '</b>' : '', x.banco ? esc(x.banco) : ''].filter(Boolean).join(' · ') + '</div>' : '') +
      '<ol class="passos gd-passos"><li>Emita a ' + nome + ' no site do órgão/credor.</li><li>Anexe o PDF aqui e marque "enviar ao cliente".</li>' +
        '<li>O PDF vai <b>só no e-mail</b> — não fica guardado no sistema.</li></ol>' +
      '<div class="grade"><div class="inteiro"><label class="ge-drop"><input type="file" id="gd-arq" accept=".pdf,image/*" hidden><span id="gd-arq-n">📎 <b>Anexar o PDF</b> da ' + nome + ' (opcional)</span><small>vai só no e-mail — não fica guardado no sistema</small></label></div>' +
      '<label class="check inteiro"><input type="checkbox" id="gd-enviar"' + (guiaEnviada(x) ? '' : ' checked') + '> ✉ Enviar ao cliente por e-mail agora</label>' +
      '<label class="campo inteiro" id="gd-para-l"><span>✉ Para (e-mail do cliente)</span><input id="gd-para" type="text" autocomplete="off" placeholder="procurando o e-mail cadastrado…"></label></div>',
    rodape: (ja ? '<button class="btn btn-x" type="button" id="gd-desfazer">Desmarcar emissão</button>' : '<span></span>') +
      '<div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="gd-ok">' + (ja ? 'Salvar' : '✓ Marcar como emitida') + '</button></div>' });
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  // Backup 30: o mesmo destinatário do "Enviar por empresa" — já vem preenchido; se não houver, digite aqui
  const cPara = j.querySelector('#gd-para'), cEnv = j.querySelector('#gd-enviar');
  const verPara = () => { j.querySelector('#gd-para-l').hidden = !cEnv.checked;
    j.querySelector('#gd-ok').textContent = cEnv.checked ? '✉ ' + (ja ? 'Salvar e enviar e-mail' : 'Marcar emitida e enviar e-mail') : (ja ? 'Salvar' : '✓ Marcar como emitida'); };
  cEnv.addEventListener('change', verPara); verPara();
  j.querySelector('#gd-arq').onchange = (ev) => { const f = ev.target.files[0]; j.querySelector('#gd-arq-n').innerHTML = f ? '📄 <b>' + esc(f.name) + '</b> · ' + Math.max(1, Math.round(f.size / 1024)) + ' KB (clique para trocar)' : '📎 <b>Anexar o PDF</b>'; };
  const cVal = j.querySelector('#gd-valor'); cVal.addEventListener('blur', () => { const v = lerValor(cVal.value); cVal.value = v ? valorParaCampo(v) : ''; });
  preencherDestino(cPara, x.cliente_id, x.grupo_id, tabela);
  const fim = async (msg) => { aviso(msg); fecharJanela(j); if (depois) await depois(); if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); };
  j.querySelector('#gd-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const arq = j.querySelector('#gd-arq').files[0], enviar = j.querySelector('#gd-enviar').checked, v = lerValor(j.querySelector('#gd-valor').value) || x.valor || 0;
    if (enviar) {
      if (arq && arq.size > LIMITE_ANEXOS) throw new Error('O PDF passa de 15 MB.');
      if (!cPara.value.trim()) throw new Error('Digite o e-mail do cliente no campo "Para" (ou desmarque "Enviar ao cliente").');
      const r = await q(sb.rpc('enviar_guias_email', { p_cliente: x.cliente_id || null, p_grupo: x.grupo_id || null,
        p_itens: [{ tabela, id: x.id, descricao: descricaoGuia(tabela, x), vencimento: x.vencimento, valor: v }],
        p_assunto: (tabela === 'parcelas' ? 'Guia de parcelamento' : 'Boleto de acordo') + ' — ' + (x.quem || ''), p_texto: textoGuias(tabela, x.quem || '', [x]).email,
        p_docs: x.guia_doc ? [x.guia_doc] : [], p_para: cPara.value.trim(), p_arquivos: arq ? [await lerArquivoB64(arq)] : [] }));
      return fim('✓ ' + (tabela === 'parcelas' ? 'Guia emitida' : 'Boleto emitido') + ' e ' + msgEnvio(r));
    }
    await q(sb.rpc('registrar_emissao', { p_tabela: tabela, p_id: x.id, p_emitida: true, p_doc: null, p_enviar: false }));
    await fim('✓ ' + (tabela === 'parcelas' ? 'Guia emitida' : 'Boleto emitido') + ' em ' + dataBR(hojeISO()) + '. Ela fica em "Emitidas — falta enviar" até o e-mail sair.');
  });
  const d = j.querySelector('#gd-desfazer');
  if (d) d.onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!confirm('Desmarcar a emissão desta parcela?')) return;
    await q(sb.rpc('registrar_emissao', { p_tabela: tabela, p_id: x.id, p_emitida: false, p_doc: null, p_enviar: false }));
    await fim('Emissão desmarcada.');
  });
}
// Backup 33: parcela VENCIDA sem pagamento — reemitir no portal (o órgão já calcula os juros/SELIC) e mandar de novo ao cliente.
// A parcela continua a mesma (mesmo número); guardamos o novo vencimento, o valor atualizado e quantas vezes foi reenviada.
function fimDoMesGuia(iso) { const d = new Date(iso.slice(0, 7) + '-01T12:00:00'); d.setMonth(d.getMonth() + 1); d.setDate(0); return d.toISOString().slice(0, 10); }
async function janelaReenvio(tabela, x, depois) {
  const nome = tabela === 'parcelas' ? 'guia' : 'boleto / PIX', h = hojeISO();
  const j = abrirJanela({ titulo: '↻ Reenviar ' + nome + ' vencida — ' + (x.quem || ''), larga: true,
    corpo: '<div class="gd-jan-hd"><div><b>' + esc(x.quem || '—') + '</b><div class="sub">Parcela ' + esc(x.parcela || '') + (x.detalhe ? ' · ' + esc(x.detalhe) : '') + '</div></div>' +
        '<div class="gd-jan-v"><span>Venceu em</span><b class="dias-r">' + dataBR(x.vencimento) + '</b></div>' +
        '<div class="gd-jan-v"><span>Valor original</span><b>' + (x.valor ? brl(x.valor) : '—') + '</b></div></div>' +
      (x.reenvio_em ? '<div class="dica" style="margin:10px 0">Já reenviada ' + (x.reenvios > 1 ? x.reenvios + ' vezes' : '1 vez') + ' — a última em <b>' + dataLocal(x.reenvio_em) + '</b>' +
        (x.reenvio_venc ? ', com vencimento em <b>' + dataBR(x.reenvio_venc) + '</b>' : '') + (x.reenvio_valor ? ' e valor de <b>' + brl(x.reenvio_valor) + '</b>' : '') + '.</div>' : '') +
      '<ol class="passos gd-passos"><li>Emita a ' + nome + ' <b>de novo</b> no portal (e-CAC, Regularize, SIARE, banco do credor…): ' + (tabela === 'parcelas' ? 'a guia nova já vem com os <b>juros (SELIC)</b> do atraso.' : 'peça o valor atualizado ao credor.') + '</li>' +
        '<li>Copie aqui o <b>novo vencimento</b> e o <b>valor atualizado</b> da guia nova e anexe o PDF.</li><li>O cliente recebe o e-mail avisando que é a mesma parcela, agora atualizada.</li></ol>' +
      '<div class="grade"><div class="campo"><span>Novo vencimento</span><input type="date" id="rv-venc" value="' + (x.reenvio_venc && x.reenvio_venc >= h ? x.reenvio_venc: fimDoMesGuia(h)) + '"></div>' +
        '<div class="campo ge-it-v"><span>Valor atualizado (com juros)</span><span class="ge-vbox"><span class="ge-rs">R$</span><input id="rv-valor" data-mascara="nenhuma" inputmode="decimal" value="' + valorParaCampo(x.reenvio_valor || x.valor || '') + '" placeholder="0,00"></span></div>' +
        '<div class="inteiro"><label class="ge-drop"><input type="file" id="rv-arq" accept=".pdf,image/*" hidden><span id="rv-arq-n">📎 <b>Anexar o PDF</b> da ' + nome + ' nova</span><small>vai só no e-mail — não fica guardado no sistema</small></label></div>' +
        '<label class="campo inteiro"><span>✉ Para (e-mail do cliente)</span><input id="rv-para" type="text" autocomplete="off" placeholder="procurando o e-mail cadastrado…"></label></div>',
    rodape: '<span class="sub">A parcela continua em "Vencidas" até você marcar ✓ Pago.</span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="rv-ok">↻ Reenviar ao cliente</button></div>' });
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  const cPara = j.querySelector('#rv-para'), cVal = j.querySelector('#rv-valor');
  cVal.addEventListener('blur', () => { const v = lerValor(cVal.value); cVal.value = v ? valorParaCampo(v) : ''; });
  j.querySelector('#rv-arq').onchange = (ev) => { const f = ev.target.files[0]; j.querySelector('#rv-arq-n').innerHTML = f ? '📄 <b>' + esc(f.name) + '</b> · ' + Math.max(1, Math.round(f.size / 1024)) + ' KB (clique para trocar)' : '📎 <b>Anexar o PDF</b>'; };
  preencherDestino(cPara, x.cliente_id, x.grupo_id, tabela);
  j.querySelector('#rv-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const venc = j.querySelector('#rv-venc').value, v = lerValor(cVal.value), arq = j.querySelector('#rv-arq').files[0];
    if (!venc || venc < h) throw new Error('Informe o novo vencimento (hoje ou depois).');
    if (!(v > 0)) throw new Error('Informe o valor atualizado da guia nova.');
    if (!cPara.value.trim()) throw new Error('Digite o e-mail do cliente no campo "Para".');
    if (arq && arq.size > LIMITE_ANEXOS) throw new Error('O PDF passa de 15 MB.');
    const desc = 'Guia ATUALIZADA da parcela vencida em ' + dataBR(x.vencimento) + ' — ' + descricaoGuia(tabela, Object.assign({}, x, { vencimento: venc }));
    const texto = 'Prezados,\n\nA parcela ' + parcDe(x) + (tabela === 'parcelas' ? ' do parcelamento' : ' do acordo') + ' em nome de ' + (x.quem || '') + ', que venceu em ' + dataBR(x.vencimento) + ', ainda consta em aberto.\n' +
      'Segue ' + (tabela === 'parcelas' ? 'a guia atualizada (já com os juros do atraso)' : 'o boleto atualizado') + ', com vencimento em ' + dataBR(venc) + ', no valor de ' + brl(v) + '.\n' +
      'Se o pagamento já foi feito, por favor desconsidere e nos envie o comprovante.\n\nOs arquivos seguem anexos.';
    const r = await q(sb.rpc('enviar_guias_email', { p_cliente: x.cliente_id || null, p_grupo: x.grupo_id || null,
      p_itens: [{ tabela, id: x.id, descricao: desc, vencimento: venc, valor: v, reenvio: true }],
      p_assunto: (tabela === 'parcelas' ? 'Guia atualizada (parcela em atraso)' : 'Boleto atualizado (parcela em atraso)') + ' — ' + (x.quem || ''), p_texto: texto,
      p_docs: [], p_para: cPara.value.trim(), p_arquivos: arq ? [await lerArquivoB64(arq)] : [] }));
    aviso('↻ ' + (tabela === 'parcelas' ? 'Guia' : 'Boleto') + ' reenviado: ' + msgEnvio(r), r.status === 'retido'); fecharJanela(j);
    if (depois) await depois(); if (window.ERP_RECARREGAR) window.ERP_RECARREGAR();
  });
  return j;
}
// para os cartões do ERP (detalhamento do parcelamento/acordo): busca a parcela e abre a janela
async function emitirParcela(tabela, id, depois) {
  const L = await dadosGuias(tabela);
  let x = L.find((y) => y.id === id);
  if (!x) {   // vence depois de 15 dias: busca direto
    if (tabela === 'parcelas') {
      const r = (await q(sb.from('parcelas').select('id, numero, vencimento, pago, emissao, emitida_em, emitida_por, guia_doc, parcelamentos(empresa, natureza, local, numero, total_parcelas, valor_ultima_parcela, grupo_id)').eq('id', id)))[0];
      if (r) { const p = r.parcelamentos || {}; x = Object.assign(r, { quem: p.empresa, detalhe: [p.natureza, p.local].filter(Boolean).join(' · '), parcela: (r.numero || '?') + (p.total_parcelas ? '/' + p.total_parcelas : ''), valor: Number(p.valor_ultima_parcela) || 0, grupo_id: p.grupo_id, parcelamentos: p }); }
    } else {
      const r = (await q(sb.from('acordos').select('*').eq('id', id)))[0];
      if (r) x = Object.assign(r, { quem: r.devedor, detalhe: 'deve a ' + (r.credor || '—'), parcela: (r.parcela || '?') + (r.total_parcelas ? '/' + r.total_parcelas : ''), valor: Number(r.valor) || 0 });
    }
  }
  return janelaEmissao(tabela, x, depois);
}

// ═══ Várias guias da MESMA empresa num e-mail só (ou no WhatsApp) — Backup 29: visual novo e o texto das antigas "Notificações" ═══
const chaveEmpresaGuia = (x) => x.cliente_id || 'q:' + normalizar(x.quem || '');
const parcDe = (x) => { const [n, t] = String(x.parcela || '').split('/'); return (n || '?') + (t ? ' de ' + t : ''); };
function descricaoGuia(tabela, x) {
  const venc = x.vencimento < hojeISO() ? '⚠ VENCIDA — ' : '';
  if (tabela === 'parcelas') { const p = x.parcelamentos || {};
    return venc + 'Parcelamento ' + [p.local, p.natureza].filter(Boolean).join(' — ') + (p.numero ? ' · nº ' + p.numero : '') + ' · Parcela ' + parcDe(x); }
  return venc + 'Processo ' + (x.processo || '—') + ' · ' + parcOrd(x) + ' · ' + (x.devedor || '') + ' × ' + (x.credor || '');
}
// Backup 37: "8ª parcela de 40"; saudação pela hora; acordo pago por PIX ou por boleto (campo "Forma de pagamento" do acordo)
const parcOrd = (x) => { const [n, t] = String(x.parcela || '').split('/'); return (/^\d+$/.test(n || '') ? n + 'ª parcela' : 'Parcela ' + (n || '?')) + (t ? ' de ' + t : ''); };
const saudacaoGuia = () => { const hh = new Date().getHours(); return hh < 12 ? 'Bom dia!' : hh < 18 ? 'Boa tarde!' : 'Boa noite!'; };
const ehPixGuia = (tabela, x) => tabela === 'acordos' && x.forma_pagamento === 'pix';
const fechoGuias = (tabela, itens) => tabela === 'parcelas' ? 'Os arquivos seguem anexos. Depois de pagar, por favor nos envie o comprovante.'
  : itens.every((x) => ehPixGuia(tabela, x)) ? 'Depois de pagar, por favor nos envie o comprovante.'
  : itens.some((x) => ehPixGuia(tabela, x)) ? 'Os boletos seguem anexos (as parcelas por PIX têm a chave acima). Depois de pagar, por favor nos envie o comprovante.'
  : (itens.length > 1 ? 'Os boletos seguem anexos.' : 'O boleto segue anexo.') + ' Depois de pagar, por favor nos envie o comprovante.';
// o texto (e-mail e WhatsApp). Parcelamentos: modelo das antigas Notificações. Acordos (Backup 37): objetivo, como o escritório escreve
function textoGuias(tabela, empresa, itens) {
  const vencida = itens.some((x) => x.vencimento < hojeISO());
  const valorDe = (x) => { const v = x._valor != null ? x._valor : x.valor; return v ? brl(v) : '[preencher]'; };
  const tot = itens.reduce((s2, x) => s2 + (Number(x._valor != null ? x._valor : x.valor) || 0), 0), fecho = fechoGuias(tabela, itens);
  if (tabela === 'parcelas') {
    const intro = 'Prezados,\n\nSeguem as guias ' + (itens.length > 1 ? 'dos parcelamentos' : 'do parcelamento') + ' em nome de ' + empresa + (vencida ? '.\nAtenção: há guia vencida — veja abaixo.' : ', com vencimento próximo.') + '\nAntes de pagar, confirme se a guia já não foi paga, para evitar pagamento em duplicidade.';
    const blocos = itens.map((x) => { const p = x.parcelamentos || {};
      return (x.vencimento < hojeISO() ? '⚠ GUIA VENCIDA\n' : '') + '*Parcelamento ' + [p.local, p.natureza].filter(Boolean).join(' — ') + '*' + (p.numero ? '\nNº do parcelamento: ' + p.numero : '') +
        '\nParcela: ' + parcDe(x) + ' | Vencimento: ' + dataBR(x.vencimento) + '\nValor: ' + valorDe(x); });
    return { intro, fecho, email: intro + '\n\n' + fecho, zap: intro + '\n\n' + blocos.join('\n\n') + (itens.length > 1 ? '\n\n*Total: ' + brl(tot) + '*' : '') + '\n\n' + fecho };
  }
  const soPix = itens.every((x) => ehPixGuia(tabela, x));
  const intro = saudacaoGuia() + (soPix ? '' : '\n\nSeguem as parcelas de acordos da ' + empresa + ' com vencimento neste mês ou em atraso.');
  const blocos = itens.map((x) => (x.vencimento < hojeISO() ? '⚠ PARCELA EM ATRASO\n' : '') + 'Processo: ' + (x.processo || '—') + ' | Parcela: ' + parcOrd(x) +
    '\nPartes: ' + (x.devedor || '—') + ' × ' + (x.credor || '—') + '\nVencimento: ' + dataBR(x._venc || x.vencimento) + '\nValor: ' + valorDe(x) +
    (ehPixGuia(tabela, x) ? '\nPIX: ' + (x.pix || '[chave PIX]') + (x.banco ? '\nBanco: ' + x.banco : '') : ''));
  return { intro, fecho, email: intro + '\n\n' + fecho, zap: intro + '\n\n' + blocos.join('\n\n') + (itens.length > 1 ? '\n\nTotal: ' + brl(tot) : '') + '\n\n' + fecho };
}
async function janelaGuiasEmpresa(tabela, L, chaveIni, depois) {
  if (!E.clientes.length) await carregarCadastros();
  L = (L || []).filter((x) => !x.pago && !x.email_em);
  const emp = {};
  L.forEach((x) => { const k = chaveEmpresaGuia(x); (emp[k] = emp[k] || { k, nome: x.quem || '—', cli: x.cliente_id, grupo: x.grupo_id, itens: [] }).itens.push(x); });
  // Backup 30: empresas organizadas por GRUPO (igual ao Painel Executivo); sem grupo vai por último
  Object.values(emp).forEach((e) => { const c = E.clientes.find((y) => y.id === e.cli) || {}; e.gid = e.grupo || c.grupo_id || ''; e.gnome = nomeGrupo(e.gid) || ''; });
  const lista = Object.values(emp).sort((a, b) => (!a.gnome) - (!b.gnome) || a.gnome.localeCompare(b.gnome, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'));
  if (!lista.length) return aviso('Nenhuma parcela em aberto para enviar.', true);
  const nome = tabela === 'parcelas' ? 'guias' : 'boletos';
  let atualK = chaveIni && emp[chaveIni] ? chaveIni : lista[0].k, arquivos = [];
  const j = abrirJanela({ titulo: tabela === 'parcelas' ? '✉ Enviar guias por empresa' : '✉ Enviar parcelas de acordo por empresa', larga: true,
    corpo: '<div class="ge"><aside class="ge-emps" id="ge-emps"></aside><section class="ge-msg" id="ge-msg"></section></div>',
    rodape: '<span class="ge-tot" id="ge-tot"></span><div class="acoes ge-acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button>' +
      '<button type="button" class="btn btn-o" id="ge-previa" title="Ver o e-mail exatamente como o cliente vai receber">👁 Prévia do e-mail</button>' +
      '<button type="button" class="btn btn-v" id="ge-zap">💬 WhatsApp</button><button class="btn btn-p" type="button" id="ge-enviar">✉ Enviar e-mail</button></div>' });
  j.querySelector('.janela').classList.add('ge-janela');
  const $j = (sel) => j.querySelector(sel);
  const pixItem = (i) => ehPixGuia(tabela, i) && i.pix ? { pix: i.pix, banco: i.banco || '' } : {};
  const atual = () => emp[atualK];
  const pintarEmps = () => {
    const grs = []; lista.forEach((e) => { const g = grs[grs.length - 1]; if (g && g.k === e.gid) g.emps.push(e); else grs.push({ k: e.gid, nome: e.gnome || 'Sem grupo', emps: [e] }); });
    $j('#ge-emps').innerHTML = '<div class="ge-emps-tit">Grupos <span class="sub">' + grs.length + ' · ' + plural(lista.length, 'empresa', 'empresas') + '</span></div>' +
      grs.map((g) => '<div class="ge-grp"><div class="ge-grp-hd"><b>' + esc(g.nome) + '</b><span class="sub">' + plural(g.emps.length, 'empresa', 'empresas') + '</span></div>' +
        g.emps.map((e) => '<button type="button" class="ge-emp' + (e.k === atualK ? ' ativo' : '') + '" data-ge-emp="' + esc(e.k) + '">' +
          '<b>' + esc(e.nome) + '</b><span class="sub">' + plural(e.itens.length, nome.slice(0, -1), nome) + ' · ' + brl(e.itens.reduce((s2, x) => s2 + (Number(x.valor) || 0), 0)) + '</span>' +
          (e.itens.some((x) => x.vencimento < hojeISO()) ? '<span class="pill vencido">vencida</span>' : '') + '</button>').join('') + '</div>').join('');
  };
  const pintarMsg = () => {
    const e = atual(), c = E.clientes.find((y) => y.id === e.cli) || {}, t = textoGuias(tabela, e.nome, e.itens);
    arquivos = [];
    $j('#ge-msg').innerHTML =
      '<div class="ge-cab"><div><div class="ge-emp-nome">' + esc(e.nome) + '</div><div class="sub">' + esc([mascaraDoc(c.cpf_cnpj), e.gnome].filter(Boolean).join(' · ')) + '</div></div></div>' +
      '<div class="ge-dest"><label class="campo"><span>✉ E-mail (para)</span><input id="ge-para" type="text" autocomplete="off" placeholder="procurando o e-mail cadastrado…"></label>' +
        '<label class="campo"><span>💬 WhatsApp</span><input id="ge-tel" data-mascara="tel" inputmode="tel" value="' + esc(c.telefone || '') + '" placeholder="(37) 9 9999-9999"></label>' +
        '<label class="campo ge-ass"><span>Assunto</span><input id="ge-assunto" value="' + esc((tabela === 'parcelas' ? 'Guias de parcelamento' : e.itens.every((x) => ehPixGuia(tabela, x)) ? 'Parcela de acordo' : 'Boletos de acordo') + ' — ' + e.nome) + '"></label></div>' +
      '<div class="ge-papel"><textarea id="ge-texto" rows="5">' + esc(t.intro) + '</textarea>' +
        '<div class="ge-itens">' + e.itens.map((x) => { const p = x.parcelamentos || {};
          return '<label class="ge-it' + (x.vencimento < hojeISO() ? ' ge-venc' : '') + '" data-ge="' + x.id + '"><input type="checkbox" checked aria-label="Incluir">' +
            '<span class="ge-it-txt">' + (x.vencimento < hojeISO() ? '<span class="ge-alerta">⚠ ' + (tabela === 'parcelas' ? 'GUIA VENCIDA' : 'PARCELA VENCIDA') + '</span>' : '') +
              '<b>' + esc(tabela === 'parcelas' ? 'Parcelamento ' + [p.local, p.natureza].filter(Boolean).join(' — ') : 'Processo ' + (x.processo || '—') + ' · ' + parcOrd(x)) + '</b>' +
              (ehPixGuia(tabela, x) ? ' <span class="ge-forma">PIX</span>' : tabela === 'acordos' ? ' <span class="ge-forma ge-forma-b">boleto</span>' : '') +
              '<span>' + (tabela === 'parcelas' ? (p.numero ? 'Nº do parcelamento: <b>' + esc(p.numero) + '</b> · Parcela <b>' + esc(parcDe(x)) + '</b> · ' : 'Parcela <b>' + esc(parcDe(x)) + '</b> · ') : 'Partes: <b>' + esc(x.devedor || '—') + ' × ' + esc(x.credor || '—') + '</b> · ') +
              'Vencimento <b>' + dataBR(x.vencimento) + '</b>' + (ehPixGuia(tabela, x) ? ' · PIX <b>' + esc(x.pix || '—') + '</b>' : '') + '</span></span>' +
            (x.vencimento < hojeISO() ? '<span class="ge-it-v ge-it-d"><small>Novo vencimento</small><input type="date" class="ge-novo-venc" value="' + fimDoMesGuia(hojeISO()) + '" aria-label="Novo vencimento da guia atualizada"></span>' : '') +
            '<span class="ge-it-v"><small>' + (x.vencimento < hojeISO() ? 'Valor atualizado' : 'Valor da guia') + '</small><span class="ge-vbox"><span class="ge-rs">R$</span><input class="ge-valor" data-mascara="nenhuma" inputmode="decimal" value="' + (x.valor ? valorParaCampo(x.valor) : '') + '" placeholder="0,00" aria-label="Valor"></span></span></label>'; }).join('') + '</div>' +
        '<div class="ge-fecho">' + esc(t.fecho) + '</div></div>' +
      '<div class="ge-anexos"><label class="ge-drop"><input type="file" id="ge-arqs" accept=".pdf,image/*" multiple hidden><span>📎 <b>Anexar os PDFs</b> ' + (tabela === 'acordos' ? 'dos boletos' : 'das guias') + '</span><small>vão só no e-mail — não ficam guardados no sistema</small></label><div class="ge-chips" id="ge-chips"></div></div>';
    $j('#ge-arqs').onchange = () => { arquivos = arquivos.concat([...$j('#ge-arqs').files]); $j('#ge-arqs').value = ''; pintarChips(); };
    j.querySelectorAll('.ge-it input').forEach((i) => i.addEventListener('input', total));
    j.querySelectorAll('.ge-it input[type=checkbox]').forEach((i) => i.addEventListener('change', total));
    j.querySelectorAll('.ge-valor').forEach((i) => i.addEventListener('blur', () => { const v = lerValor(i.value); i.value = v ? valorParaCampo(v) : ''; total(); }));
    preencherDestino($j('#ge-para'), e.cli, e.grupo, tabela);
    pintarChips(); total();
  };
  const pintarChips = () => { $j('#ge-chips').innerHTML = arquivos.map((f, k) => '<span class="ge-chip">📄 ' + esc(f.name) + ' <small>' + Math.max(1, Math.round(f.size / 1024)) + ' KB</small><button type="button" data-tira="' + k + '" aria-label="Tirar">×</button></span>').join('');
    j.querySelectorAll('[data-tira]').forEach((b) => b.onclick = () => { arquivos.splice(+b.dataset.tira, 1); pintarChips(); }); };
  const marcados = () => [...j.querySelectorAll('.ge-it')].filter((l) => l.querySelector('input[type=checkbox]').checked).map((l) => {
    const x = atual().itens.find((y) => y.id === l.dataset.ge), v = lerValor(l.querySelector('.ge-valor').value);
    const dv = l.querySelector(".ge-novo-venc");   // Backup 34: parcela vencida → reemissão com novo vencimento e valor atualizado
    return Object.assign({}, x, { _valor: isNaN(v) ? 0 : v, _venc: dv ? dv.value : null });
  });
  const total = () => { const m = marcados(); $j('#ge-tot').innerHTML = m.length ? plural(m.length, 'parcela', 'parcelas') + ' · total <b>' + brl(m.reduce((s2, x) => s2 + x._valor, 0)) + '</b>' : 'Nenhuma parcela marcada'; };
  $j('#ge-emps').onclick = (ev) => { const b = ev.target.closest('[data-ge-emp]'); if (!b) return; atualK = b.dataset.geEmp; pintarEmps(); pintarMsg(); };
  pintarEmps(); pintarMsg();
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  $j('#ge-zap').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const its = marcados(); if (!its.length) throw new Error('Marque ao menos uma parcela.');
    const t = textoGuias(tabela, atual().nome, its), txt = $j('#ge-texto').value.trim() + t.zap.slice(t.intro.length);
    if (arquivos.length && navigator.canShare && navigator.canShare({ files: arquivos })) { await navigator.share({ text: txt, files: arquivos }); return; }
    const tel = soDigitos($j('#ge-tel').value);
    window.open('https://wa.me/' + (tel ? (tel.length <= 11 ? '55' : '') + tel : '') + '?text=' + encodeURIComponent(txt), '_blank', 'noopener');
    if (arquivos.length) aviso('No computador o WhatsApp não recebe anexo por link: arraste os PDFs para a conversa que abriu.');
  });
  $j('#ge-previa').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const its = marcados(), e = atual(); if (!its.length) throw new Error('Marque ao menos uma parcela.');
    const html = await q(sb.rpc('previa_guias_email', { p_cliente: e.cli || null,
      p_itens: its.map((i) => Object.assign({ tabela, id: i.id, descricao: descricaoGuia(tabela, i), vencimento: i._venc || i.vencimento, valor: i._valor }, pixItem(i))),
      p_assunto: $j('#ge-assunto').value.trim(), p_texto: $j('#ge-texto').value.trim() + '\n\n' + fechoGuias(tabela, its) }));
    const pj = abrirJanela({ titulo: '👁 ' + ($j('#ge-assunto').value.trim() || 'Prévia do e-mail'), larga: true, corpo: '<iframe class="ge-previa" title="Prévia do e-mail" sandbox></iframe>' });
    pj.querySelector('.ge-previa').srcdoc = html;
  });
  $j('#ge-enviar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const its = marcados(), e = atual(); if (!its.length) throw new Error('Marque ao menos uma parcela.');
    if (!$j('#ge-para').value.trim()) throw new Error('Digite o e-mail do cliente no campo "Para".');
    if (its.some((i) => !(i._valor > 0))) throw new Error('Confira o valor de todas as parcelas marcadas.');
    if (its.some((i) => i._venc !== null && i._venc !== undefined && (!i._venc || i._venc < hojeISO()))) throw new Error('Confira o novo vencimento da guia atualizada (hoje ou depois).');
    if (arquivos.reduce((s2, f) => s2 + f.size, 0) > LIMITE_ANEXOS) throw new Error('Os PDFs somam mais de 15 MB: envie em dois e-mails.');
    const arqs = []; for (const f of arquivos) arqs.push(await lerArquivoB64(f));
    const r = await q(sb.rpc('enviar_guias_email', { p_cliente: e.cli || null, p_grupo: e.grupo || null,
      p_itens: its.map((i) => Object.assign(i._venc
        ? { tabela, id: i.id, descricao: descricaoGuia(tabela, i).replace(/^⚠ VENCIDA — /, '↻ Guia atualizada — ') + ' (vencia em ' + dataBR(i.vencimento) + ')', vencimento: i._venc, valor: i._valor, reenvio: true }
        : { tabela, id: i.id, descricao: descricaoGuia(tabela, i), vencimento: i.vencimento, valor: i._valor }, pixItem(i))),
      p_assunto: $j('#ge-assunto').value.trim(), p_texto: $j('#ge-texto').value.trim() + '\n\n' + fechoGuias(tabela, its), p_docs: its.map((i) => i.guia_doc).filter(Boolean),
      p_para: $j('#ge-para').value.trim() || null, p_arquivos: arqs }));
    aviso('✓ ' + plural(r.itens, 'parcela', 'parcelas') + (r.anexos ? ' e ' + plural(r.anexos, 'anexo', 'anexos') : '') + ': ' + msgEnvio(r) + ' As parcelas enviadas saíram do quadro.', r.status === 'retido');
    fecharJanela(j); if (depois) await depois(); if (window.ERP_RECARREGAR) window.ERP_RECARREGAR();
  });
  return j;
}
// Backup 35: Acordos → aba "A pagar": marcar as parcelas e "✉ Enviar por empresa" (mesma janela/e-mail das guias)
async function enviarAcordosSelecionados(ids, depois) {
  if (!ids || !ids.length) return aviso('Marque ao menos uma parcela.', true);
  if (!E.clientes.length) await carregarCadastros();
  const L = (await q(sb.from('acordos').select('id, parcela, total_parcelas, vencimento, valor, pago, emissao, emitida_em, emitida_por, guia_doc, devedor, credor, processo, grupo_id, pix, banco, forma_pagamento').in('id', ids)))
    .filter((x) => !x.pago)
    .map((x) => Object.assign(x, { quem: x.devedor, detalhe: 'deve a ' + (x.credor || '—') + (x.processo ? ' · ' + x.processo : ''), email_em: null,
      parcela: (x.parcela || '?') + (x.total_parcelas ? '/' + x.total_parcelas : ''), valor: Number(x.valor) || 0,
      cliente_id: (E.clientes.find((c) => c.grupo_id === x.grupo_id && primeiroNome(c.nome) === primeiroNome(x.devedor)) || {}).id || null }));
  return janelaGuiasEmpresa('acordos', L, null, depois);
}

// ═══ Backup 37: "🧾 Gerar guias" — abre o envio por empresa (a tela que expande com vencimento e valor atualizado) já com as parcelas a emitir:
// em atraso + as que vencem neste mês. alcance: {} = tudo · {grupo_id} · {empresa} · {itens: ids de parcelamento ou chaves de acordo}.
// proximas: true → se o parcelamento/acordo não tem nada a emitir agora, entra a PRÓXIMA parcela (mesmo futura).
const chaveAcordoGuia = (a) => [a.grupo_id || '', a.devedor || '', a.credor || '', a.processo || ''].join('|');
async function gerarGuias(tabela, alcance, depois) {
  alcance = alcance || {};
  if (!E.clientes.length) await carregarCadastros();
  const h = hojeISO(), fim = fimDoMesGuia(h), parc = tabela === 'parcelas';
  const cliDe = (doc, nome, grp) => (E.clientes.find((c) => (soDigitos(doc) && soDigitos(c.cpf_cnpj) === soDigitos(doc)) || (grp ? c.grupo_id === grp && primeiroNome(c.nome) === primeiroNome(nome) : c.nome === nome)) || {}).id || null;
  let base;
  if (parc) {
    base = (await buscarTodos(() => { let c = sb.from('parcelas').select('id, parcelamento_id, numero, vencimento, pago, emissao, emitida_em, guia_doc, valor, parcelamentos!inner(id, empresa, natureza, local, numero, total_parcelas, valor_ultima_parcela, grupo_id, cnpj, emitimos_guia)').eq('pago', false);
      if (alcance.grupo_id) c = c.eq('parcelamentos.grupo_id', alcance.grupo_id);
      if (alcance.empresa) c = c.eq('parcelamentos.empresa', alcance.empresa);
      if (alcance.itens) c = c.in('parcelamento_id', alcance.itens);
      if (alcance.ids) c = c.in('id', alcance.ids);
      return c.order('vencimento').order('id'); })).filter((x) => x.parcelamentos && (alcance.ids || x.parcelamentos.emitimos_guia !== false));
    base.forEach((x) => { const p = x.parcelamentos;
      Object.assign(x, { _k: p.id, quem: p.empresa, grupo_id: p.grupo_id, email_em: null, parcela: (x.numero || '?') + (p.total_parcelas ? '/' + p.total_parcelas : ''),
        valor: Number(x.valor) > 0 ? Number(x.valor) : Number(p.valor_ultima_parcela) || 0, detalhe: [p.natureza, p.local].filter(Boolean).join(' · '), cliente_id: cliDe(p.cnpj, p.empresa) }); });
  } else {
    base = (await buscarTodos(() => { let c = sb.from('acordos').select('id, parcela, total_parcelas, vencimento, valor, pago, emissao, emitida_em, emitida_por, guia_doc, devedor, credor, processo, grupo_id, pix, banco, forma_pagamento').eq('pago', false);
      if (alcance.grupo_id) c = c.eq('grupo_id', alcance.grupo_id);
      if (alcance.empresa) c = c.eq('devedor', alcance.empresa);
      return c.order('vencimento').order('id'); }));
    if (alcance.itens) base = base.filter((a) => alcance.itens.includes(chaveAcordoGuia(a)) || alcance.itens.includes([a.processo || '', a.devedor || '', a.credor || ''].join('|')));
    base.forEach((x) => Object.assign(x, { _k: chaveAcordoGuia(x), quem: x.devedor, email_em: null, detalhe: 'deve a ' + (x.credor || '—') + (x.processo ? ' · ' + x.processo : ''),
      parcela: (x.parcela || '?') + (x.total_parcelas ? '/' + x.total_parcelas : ''), valor: Number(x.valor) || 0, cliente_id: cliDe('', x.devedor, x.grupo_id) }));
  }
  let L = alcance.ids ? base : base.filter((x) => x.vencimento && x.vencimento <= fim);   // parcelas escolhidas: vale até a futura
  if (alcance.proximas) { const tem = new Set(L.map((x) => x._k)), prox = {};
    base.forEach((x) => { if (!tem.has(x._k) && !prox[x._k]) prox[x._k] = x; });
    L = L.concat(Object.values(prox)); }
  if (!L.length) {
    if (base.length && !alcance.proximas && confirm('Nada em atraso nem vencendo neste mês.\n\nEmitir a PRÓXIMA parcela ' + (parc ? 'de cada parcelamento' : 'de cada acordo') + ' deste recorte?'))
      return gerarGuias(tabela, Object.assign({}, alcance, { proximas: true }), depois);
    return aviso(base.length ? 'Nenhuma guia escolhida.' : 'Nenhuma parcela em aberto neste recorte' + (parc ? ' (que o escritório emita).' : '.'), !base.length);
  }
  return janelaGuiasEmpresa(tabela, L, null, depois);
}

'use strict';
// ═══════════════════════════════════════════════════════════════════
// Rotina do estagiário (Backup 28) — o lugar limpo que substitui as planilhas:
//  1) Passivo e cadastro: RFB, PGFN, AGE/MG (em aberto e negociada), CEAT, em operação,
//     procuração, certificado (validade e senha, guardada à parte) e CAPAG — edita na própria tabela.
//  2) Processos: última movimentação, procuração, mudança de valor e decisão relevante
//     (cada registro fica no histórico do processo).
//  3) Guias de parcelamentos e boletos de acordos (emitir → enviar → conferir o pagamento).
//  4) Financeiro do escritório (atalhos) e 5) Minhas tarefas.
// ═══════════════════════════════════════════════════════════════════
const ABAS_ROTINA = [['passivo', '🏛 Passivo e cadastro'], ['processos', '⚖ Processos'], ['parcs', '📋 Controle dos parcelamentos'], ['acs', '📋 Controle dos acordos'], ['planilha', '🧪 Planilha de parcelamentos (teste)'], ['financeiro', '💰 Financeiro'], ['tarefas', '✓ Minhas tarefas']];
const TIPOS_MOV = [['movimentacao', 'Movimentação'], ['decisao', 'Decisão relevante'], ['valor', 'Mudança de valor'], ['procuracao', 'Procuração juntada'], ['sem_novidade', 'Conferido — sem novidade']];
const PARES_PASSIVO = [['rfb', 'RFB'], ['pgfn', 'PGFN'], ['age_mg', 'AGE/MG']];
const COLS_PASSIVO = [['rfb', 'RFB'], ['rfb_negociada', 'RFB negociada'], ['pgfn', 'PGFN'], ['pgfn_negociada', 'PGFN negociada'], ['age_mg', 'AGE/MG'], ['age_mg_negociada', 'AGE/MG negociada']];
const CAPAG_OPCOES = ['', 'A', 'B', 'C', 'D', 'Omisso'];

TELAS.rotina = async function () {
  E.rt = Object.assign({ aba: 'passivo', busca: '', grupo: '', filtro: '' }, E.rt || {});
  if (E.rt.aba === 'guias') E.rt.aba = 'parcs';   // Backup 34: a aba "para emitir" saiu — a emissão é feita no Controle
  if (!E.clientes.length) await carregarCadastros();
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Rotina</h1><p>Tudo o que era atualizado nas planilhas, num lugar só — o que você grava aqui aparece no Painel, nos Processos e no Financeiro</p></div></div>' +
    '<div class="segmento rt-abas" id="rt-abas" style="margin-bottom:14px">' + ABAS_ROTINA.map(([k, r]) => '<button type="button" data-rt-aba="' + k + '">' + r + '</button>').join('') + '</div>' +
    '<div id="rt-corpo"></div>';
  $('rt-abas').onclick = (ev) => { const b = ev.target.closest('[data-rt-aba]'); if (b) { E.rt.aba = b.dataset.rtAba; pintarRotina(); } };
  await pintarRotina();
};
async function pintarRotina() {
  document.querySelectorAll('#rt-abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.rtAba === E.rt.aba));
  const el = $('rt-corpo'); if (!el) return;
  el.innerHTML = '<div class="sub" style="padding:10px">Carregando…</div>';
  try { await ({ passivo: rotinaPassivo, processos: rotinaProcessos, parcs: rotinaParcelamentos, acs: rotinaAcordos, planilha: rotinaPlanilha, financeiro: rotinaFinanceiro, tarefas: rotinaTarefas })[E.rt.aba](el); }
  catch (e) { console.error(e); el.innerHTML = '<div class="card"><div class="card-bd msg-erro">' + esc(erroAmigavel(e)) + '</div></div>'; }
}
function filtroRotina(extra) {
  return '<div class="rt-filtros"><input type="search" class="busca" id="rt-busca" placeholder="Buscar empresa, CNPJ ou nº do processo…" value="' + esc(E.rt.busca) + '" autocomplete="off">' +
    '<select class="busca" id="rt-grupo" autocomplete="off"><option value="">Todos os grupos</option>' + E.grupos.map((g) => '<option value="' + g.id + '"' + (g.id === E.rt.grupo ? ' selected' : '') + '>' + esc(g.nome) + '</option>').join('') + '</select>' +
    (extra || '') + '</div>';
}
function ligarFiltroRotina(el, repintar) {
  let t; el.querySelector('#rt-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { E.rt.busca = ev.target.value; repintar(); }, 250); };
  el.querySelector('#rt-grupo').onchange = (ev) => { E.rt.grupo = ev.target.value; repintar(); };
  const f = el.querySelector('#rt-filtro'); if (f) f.onchange = (ev) => { E.rt.filtro = ev.target.value; repintar(); };
}
// Backup 29: Sim verde / Não vermelho; CAPAG nas cores de sempre (A e B verde, C amarelo, D e Omisso vermelho)
const corSel = (sel) => { const v = sel.value, k = sel.dataset.c;
  sel.classList.remove('rt-verde', 'rt-vermelho', 'rt-amarelo');
  const c = k === 'capag' ? ({ A: 'rt-verde', B: 'rt-verde', C: 'rt-amarelo', D: 'rt-vermelho', Omisso: 'rt-vermelho' }[v] || '') : v === 'true' ? 'rt-verde' : v === 'false' ? 'rt-vermelho' : '';
  if (c) sel.classList.add(c); };
const simNaoSel = (nome, v) => '<select class="rt-in rt-sn" data-c="' + nome + '"><option value=""' + (v == null ? ' selected' : '') + '>—</option><option value="true"' + (v === true ? ' selected' : '') + '>Sim</option><option value="false"' + (v === false ? ' selected' : '') + '>Não</option></select>';

// ── 1) Passivo e cadastro (edita na tabela e grava tudo de uma vez) ──
async function rotinaPassivo(el) {
  const certs = await q(sb.from('cliente_certificado').select('cliente_id, validade, senha, atualizado_por, atualizado_em')).catch(() => null);
  const C = {}; (certs || []).forEach((c) => { C[c.cliente_id] = c; });
  const podeCert = certs !== null;
  const SIT = await situacaoRotina('passivo');
  el.innerHTML = '<div class="card"><div class="card-hd">🏛 Passivo e cadastro das empresas<span class="sub">edite direto na tabela · valores em R$ · as linhas alteradas ficam marcadas até você salvar</span></div>' +
    '<div class="card-bd">' + filtroRotina('<select class="busca" id="rt-filtro" autocomplete="off">' + [['', 'Todas as empresas'], ['cert', 'Sem certificado'], ['proc', 'Sem procuração'], ['capag', 'Sem CAPAG']]
      .map(([v, r]) => '<option value="' + v + '"' + (v === E.rt.filtro ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>' +
      '<span class="rt-salvar-box"><button type="button" class="btn btn-o" id="rt-hist">🕘 Histórico do passivo</button><span class="sub" id="rt-alt"></span><button type="button" class="btn btn-p" id="rt-salvar" disabled>Salvar alterações</button></span>') +
    // Backup 33: tabela cabe na tela — cada órgão numa coluna só (em aberto em cima, negociada embaixo); a senha GOV saiu da conferência (fica no 🔑)
    '<div class="tabela-wrap rt-grade rt-pas rt-sem-altura" data-sem-pagina><table><thead><tr><th>Empresa</th><th>Conferência</th>' + PARES_PASSIVO.map(([k, r]) => '<th class="rt-num">' + r + '<small>em aberto · negociada</small></th>').join('') +
      '<th class="rt-num">CEAT</th><th>Procuração</th><th>Certificado</th><th>CAPAG</th></tr></thead><tbody id="rt-pas-corpo"></tbody></table></div>' + '</div></div>';
  const alterados = new Map();
  const pintar = () => {
    const b = normalizar(E.rt.busca), dig = soDigitos(E.rt.busca), lim = somarDias(hojeISO(), 30);
    const L = E.clientes.filter((c) => (!E.rt.grupo || c.grupo_id === E.rt.grupo) &&
      (!b || normalizar(c.nome + ' ' + (c.grupos ? c.grupos.nome : '')).includes(b) || (dig.length >= 3 && soDigitos(c.cpf_cnpj).includes(dig))) &&
      (E.rt.filtro !== 'cert' || c.certificado !== true) &&
      (E.rt.filtro !== 'proc' || c.procuracao !== true) && (E.rt.filtro !== 'capag' || !c.capag))
      .sort((x, y) => String(x.grupos ? x.grupos.nome : '').localeCompare(String(y.grupos ? y.grupos.nome : ''), 'pt-BR') || x.nome.localeCompare(y.nome, 'pt-BR'));
    let grp = null;
    $('rt-pas-corpo').innerHTML = L.length ? L.map((c) => {
      const g = c.grupos ? c.grupos.nome : 'Sem grupo', ct = C[c.id] || {};
      const cab = g !== grp ? (grp = g, '<tr class="gx-grp"><td colspan="' + (PARES_PASSIVO.length + 6) + '">' + esc(g) + '</td></tr>') : '';
      return cab + '<tr data-id="' + c.id + '"' + (alterados.has(c.id) ? ' class="rt-alterado"' : '') + '><td class="rt-emp"><b>' + esc(c.nome) + '</b><div class="sub">' + esc(mascaraDoc(c.cpf_cnpj) || '') + ' <button type="button" class="rt-hist-bt" data-hist="' + c.id + '" title="Histórico de alterações desta empresa">🕘</button>' + (podeCert ? '<button type="button" class="rt-hist-bt" data-senha="' + c.id + '" title="Senha GOV (só quem pode editar clientes vê)">🔑</button>' : '') + '</div></td>' +
        '<td>' + celulaConferencia(SIT[c.id], c.id) + '</td>' +
        PARES_PASSIVO.map(([k, r]) => '<td class="rt-par">' + [k, k + '_negociada'].map((kk, i) => '<input class="rt-in rt-valor' + (i ? ' rt-neg' : '') + '" data-mascara="brl" data-c="' + kk + '" inputmode="decimal" aria-label="' + r + (i ? ' negociada' : ' em aberto') + '" placeholder="' + (i ? 'negociada' : 'em aberto') + '" value="' + (c[kk] != null && c[kk] !== '' ? 'R$ ' + valorParaCampo(c[kk]) : '') + '">').join('') + '</td>').join('') +
        '<td><input class="rt-in rt-int" data-c="ceat_trt3" inputmode="numeric" value="' + (c.ceat_trt3 == null ? '' : esc(c.ceat_trt3)) + '"></td>' +
        '<td>' + simNaoSel('procuracao', c.procuracao) + '</td>' +
        '<td>' + simNaoSel('certificado', c.certificado) + '</td>' +
        '<td class="rt-c-capag"><select class="rt-in rt-sn rt-capag" data-c="capag">' + CAPAG_OPCOES.map((v) => '<option value="' + v + '"' + ((c.capag || '') === v ? ' selected' : '') + '>' + (v || '—') + '</option>').join('') + '</select></td></tr>';
    }).join('') : '<tr><td colspan="12">' + vazio('Nenhuma empresa com esses filtros.') + '</td></tr>';
    $('rt-pas-corpo').querySelectorAll('select.rt-sn').forEach(corSel);
  };
  const contar = () => { $('rt-alt').textContent = alterados.size ? plural(alterados.size, 'empresa alterada', 'empresas alteradas') : ''; $('rt-salvar').disabled = !alterados.size; };
  $('rt-pas-corpo').oninput = $('rt-pas-corpo').onchange = (ev) => {
    const tr = ev.target.closest('tr[data-id]'); if (!tr || !ev.target.classList.contains('rt-in')) return;
    if (ev.target.classList.contains('rt-sn')) corSel(ev.target);
    const a = alterados.get(tr.dataset.id) || { cli: {}, cert: {} };
    if (ev.target.dataset.c) a.cli[ev.target.dataset.c] = ev.target.value; else a.cert[ev.target.dataset.cert] = ev.target.value;
    alterados.set(tr.dataset.id, a); tr.classList.add('rt-alterado'); contar();
  };
  $('rt-pas-corpo').onclick = (ev) => {
    const h2 = ev.target.closest('[data-hist]'); if (h2) return janelaHistoricoPassivo(h2.dataset.hist);
    const ks = ev.target.closest('[data-senha]'); if (ks) return janelaSenhaGov(ks.dataset.senha, C);
    const cf = ev.target.closest('[data-conferir]'); if (cf) return comBotao(cf, async () => {
      if (alterados.has(cf.dataset.conferir)) throw new Error('Esta linha tem alteração: clique em "Salvar alterações".');
      await q(sb.rpc('conferir_rotina', { p_area: 'passivo', p_ids: [cf.dataset.conferir], p_alterou: false }));
      SIT[cf.dataset.conferir] = Object.assign({}, SIT[cf.dataset.conferir], { conferido_em: new Date().toISOString(), conferido_por: E.perfil ? E.perfil.nome : '', conferido_alterou: false });
      cf.closest('td').innerHTML = celulaConferencia(SIT[cf.dataset.conferir], cf.dataset.conferir); });
    const b = ev.target.closest('[data-ver-senha]'); if (!b) return; const i = b.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; };
  $('rt-hist').onclick = () => janelaHistoricoPassivo(null);
  $('rt-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    let n = 0;
    for (const [id, a] of alterados) {
      const up = {};
      Object.entries(a.cli).forEach(([k, v]) => {
        if (k === 'em_operacao' || k === 'procuracao' || k === 'certificado') up[k] = v === '' ? null : v === 'true';
        else if (k === 'capag') up[k] = v;
        else if (k === 'ceat_trt3') up[k] = v.trim() === '' ? null : parseInt(soDigitos(v), 10) || 0;
        else { const n2 = lerValor(v); if (isNaN(n2)) throw new Error('Valor inválido: ' + v); up[k] = v.trim() === '' ? null : n2; }
      });
      if (Object.keys(up).length) await q(sb.from('clientes').update(up).eq('id', id).select('id'));
      if (Object.keys(a.cert).length) {
        const atual = Object.assign({}, C[id] || {}), row = { cliente_id: id, validade: atual.validade || null, senha: atual.senha || '' };
        if ('senha' in a.cert) row.senha = a.cert.senha;
        await q(sb.from('cliente_certificado').upsert(row).select('cliente_id'));
      }
      n++;
    }
    if (alterados.size) await q(sb.rpc('conferir_rotina', { p_area: 'passivo', p_ids: [...alterados.keys()], p_alterou: true })).catch(() => null);
    alterados.clear(); aviso('✓ ' + plural(n, 'empresa atualizada', 'empresas atualizadas') + '.');
    await carregarCadastros(true); await rotinaPassivo(el);
  });
  ligarFiltroRotina(el, pintar); pintar(); contar();
}

// Backup 33: senha GOV fora da tabela de conferência — numa janela só para quem pode editar clientes
function janelaSenhaGov(clienteId, C) {
  const c = E.clientes.find((x) => x.id === clienteId) || {}, ct = C[clienteId] || {};
  const j = abrirJanela({ titulo: '🔑 Senha GOV — ' + (c.nome || ''),
    corpo: '<p class="sub" style="margin-bottom:10px">Fica numa tabela separada: só quem pode <b>editar clientes</b> vê. Não copie a senha para e-mail ou WhatsApp.</p>' +
      '<label class="campo"><span>Senha GOV</span><span class="rt-senha"><input class="rt-in" type="password" id="sg-senha" autocomplete="new-password" value="' + esc(ct.senha || '') + '"><button type="button" class="btn btn-o btn-mini" id="sg-ver" title="Mostrar senha">👁</button></span></label>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="sg-ok">Salvar</button></div>' });
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#sg-ver').onclick = () => { const i = j.querySelector('#sg-senha'); i.type = i.type === 'password' ? 'text' : 'password'; };
  j.querySelector('#sg-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const senha = j.querySelector('#sg-senha').value;
    await q(sb.from('cliente_certificado').upsert({ cliente_id: clienteId, validade: ct.validade || null, senha }).select('cliente_id'));
    C[clienteId] = Object.assign({}, ct, { cliente_id: clienteId, senha }); aviso('✓ Senha GOV salva.'); fecharJanela(j);
  });
}
// Backup 31: conferência da linha — "✓ Conferido" mesmo quando nada mudou (mostra onde o estagiário parou e se esqueceu algo)
async function situacaoRotina(area) {
  const L = await q(sb.rpc('rotina_situacao', { p_area: area })).catch(() => []);
  const m = {}; (L || []).forEach((x) => { m[x.registro_id] = x; }); return m;
}
const diasDesde = (ts) => ts ? Math.floor((Date.now() - new Date(ts).getTime()) / 864e5) : null;
function celulaConferencia(x, id) {
  x = x || {};
  // Backup 33: mais de 15 dias sem conferir = amarelo; mais de 30 (ou nunca) = vermelho. Datas no fuso de quem olha (Brasília)
  const d = diasDesde(x.conferido_em), cls = d == null || d > 30 ? 'rt-cf-nunca' : d > 15 ? 'rt-cf-velho' : 'rt-cf-ok';
  const alt = x.alterado_em ? 'Última alteração: ' + dataHoraBR(x.alterado_em) + (x.alterado_por ? ' por ' + x.alterado_por : '') : 'Sem alteração registrada';
  return '<div class="rt-cf ' + cls + '" title="' + esc(alt) + '"><span class="rt-cf-txt">' +
      (x.conferido_em ? (x.conferido_alterou ? '✎ alterado ' : '✓ conferido ') + dataLocal(x.conferido_em) + '<small>' + esc(x.conferido_por || '') + (d > 15 ? ' · há ' + d + ' d' : '') + '</small>' : 'nunca conferido') +
      (x.alterado_em ? '<small class="rt-cf-alt">alt. ' + dataLocal(x.alterado_em) + '</small>' : '') + '</span>' +
    '<button type="button" class="btn btn-o btn-mini" data-conferir="' + id + '" title="Fui até esta linha e os dados continuam certos">✓</button></div>';
}

// Backup 29: histórico de alterações do passivo (quem mudou, quando, de quanto para quanto)
const CAMPOS_PASSIVO = { rfb: 'RFB', rfb_negociada: 'RFB negociada', pgfn: 'PGFN', pgfn_negociada: 'PGFN negociada', age_mg: 'AGE/MG', age_mg_negociada: 'AGE/MG negociada',
  sefaz_mg: 'SEFAZ/MG', ceat_trt3: 'CEAT', em_operacao: 'Em operação', procuracao: 'Procuração', certificado: 'Certificado', capag: 'CAPAG' };
async function janelaHistoricoPassivo(clienteId) {
  const L = await q(sb.rpc('historico_passivo', { p_cliente: clienteId || null, p_limite: 500 }));
  const cli = clienteId ? E.clientes.find((c) => c.id === clienteId) : null;
  const fmt = (k, v) => v == null || v === '' ? '—' : /^(em_operacao|procuracao|certificado)$/.test(k) ? (v === true || v === 'true' ? 'Sim' : 'Não') : k === 'capag' || k === 'ceat_trt3' ? String(v) : brl(v);
  return relatorioTabela({ titulo: 'Histórico do passivo' + (cli ? ' — ' + cli.nome : ''), colunas: ['Quando', 'Quem', 'Empresa', 'Campo', 'Antes', 'Depois'],
    linhas: (L || []).map((x) => [dataHoraBR(x.quando), x.quem || '—', x.cliente || '—', CAMPOS_PASSIVO[x.campo] || x.campo, fmt(x.campo, x.antes), fmt(x.campo, x.depois)]),
    ids: (L || []).map((x) => x.cliente_id) });
}

// ── 2) Processos: acompanhamento (o que está há mais tempo sem conferir vem primeiro) ──
async function rotinaProcessos(el) {
  const P = await buscarTodos(() => sb.from('processos').select('id, numero, grupo_id, natureza, competencia, autor, reu, valor, procuracao, obs, atualizacao, ultima_movimentacao, ultima_movimentacao_em, grupos(nome)').order('id'));
  // Backup 31: a última conferência de cada processo (quem, quando e se mudou algo ou foi "sem novidade")
  const ULT = {}; (await buscarTodos(() => sb.from('processo_movimentacoes').select('processo_id, tipo, quem, criado_em').order('criado_em', { ascending: false }).order('id')).catch(() => []))
    .forEach((m) => { if (!ULT[m.processo_id]) ULT[m.processo_id] = m; });
  el.innerHTML = '<div class="card"><div class="card-hd">⚖ Acompanhamento dos processos<span class="sub">confira no tribunal e registre: movimentação, decisão relevante, mudança de valor ou procuração</span>' +
      '<button type="button" class="btn btn-p btn-mini" id="rt-novo-proc" style="margin-left:auto">+ Processo</button></div>' +
    '<div class="card-bd">' + filtroRotina('<select class="busca" id="rt-filtro" autocomplete="off">' + [['', 'Todos'], ['30', 'Sem conferir há 30 dias ou mais'], ['proc', 'Sem procuração']]
      .map(([v, r]) => '<option value="' + v + '"' + (v === E.rt.filtro ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>') +
    '<div class="tabela-wrap" data-sem-pagina><table><thead><tr><th>Processo</th><th>Conferido em</th><th>Natureza</th><th>Última movimentação</th><th>Procuração</th><th class="rt-num">Valor</th><th></th></tr></thead><tbody id="rt-proc-corpo"></tbody></table></div></div></div>';
  const pintar = () => {
    const b = normalizar(E.rt.busca), lim = somarDias(hojeISO(), -30);
    const L = P.filter((p) => (!E.rt.grupo || p.grupo_id === E.rt.grupo) && (!b || normalizar([p.numero, p.autor, p.reu, p.natureza, p.grupos ? p.grupos.nome : ''].join(' ')).includes(b)) &&
      (E.rt.filtro !== '30' || !p.ultima_movimentacao_em || p.ultima_movimentacao_em <= lim) && (E.rt.filtro !== 'proc' || p.procuracao !== true))
      // Backup 29: separados por grupo (como no Passivo); dentro do grupo, o que está há mais tempo sem conferir vem primeiro
      .sort((x, y) => String(x.grupos ? x.grupos.nome : '\uffff').localeCompare(String(y.grupos ? y.grupos.nome : '\uffff'), 'pt-BR') || String(x.ultima_movimentacao_em || '').localeCompare(String(y.ultima_movimentacao_em || '')));
    let grp = null;
    $('rt-proc-corpo').innerHTML = L.length ? L.map((p) => { const g = p.grupos ? p.grupos.nome : 'Sem grupo';
      return (g !== grp ? (grp = g, '<tr class="gx-grp"><td colspan="7">' + esc(g) + ' <span class="sub">' + plural(L.filter((z) => (z.grupos ? z.grupos.nome : 'Sem grupo') === g).length, 'processo', 'processos') + '</span></td></tr>') : '') + '<tr><td><b class="mono">' + esc(p.numero) + '</b><div class="sub">' + esc((p.grupos ? p.grupos.nome : '') + (p.reu ? ' · ' + p.reu : '')) + '</div></td>' +
      '<td>' + celulaConfProc(p, ULT[p.id]) + '</td>' +
      '<td>' + esc(p.natureza || '—') + '</td><td class="rt-mov">' + (p.ultima_movimentacao ? esc(p.ultima_movimentacao) : '<span class="sub">nada registrado</span>') + '</td>' +
      '<td><span class="pill ' + (p.procuracao ? 'pago' : 'vencido') + '">' + (p.procuracao ? 'Sim' : 'Não') + '</span></td>' +
      '<td class="rt-num">' + (p.valor ? brl(p.valor) : '—') + '</td>' +
      '<td class="acoes-l"><button type="button" class="btn btn-o btn-mini" data-sem-nov="' + p.id + '" title="Conferi no tribunal e não há novidade">✓ Sem novidade</button><button type="button" class="btn btn-p btn-mini" data-mov="' + p.id + '">+ Registrar</button></td></tr>'; }).join('')
      : '<tr><td colspan="7">' + vazio('Nenhum processo com esses filtros.') + '</td></tr>';
  };
  $('rt-proc-corpo').onclick = (ev) => {
    const sn = ev.target.closest('[data-sem-nov]');
    if (sn) return comBotao(sn, async () => {
      await q(sb.from('processo_movimentacoes').insert({ processo_id: sn.dataset.semNov, data: hojeISO(), tipo: 'sem_novidade', descricao: 'Conferido — sem novidade' }).select('id'));
      aviso('✓ Conferência registrada (sem novidade).'); await rotinaProcessos(el); });
    const b = ev.target.closest('[data-mov]'); if (b) janelaMovimentacao(b.dataset.mov, () => rotinaProcessos(el)); };
  // processo novo: o mesmo formulário de Jurídico → Processos (+ Lançar → Processo)
  $('rt-novo-proc').onclick = () => { if (window.ERP_EDITOR && window.ERP_EDITOR.abrirFormulario) window.ERP_EDITOR.abrirFormulario('processos', null, { carteira: 'Ativo', status: 'Em andamento' }); else aviso('Use + Lançar → Processo.', true); };
  ligarFiltroRotina(el, pintar); pintar();
}
function celulaConfProc(p, m) {
  if (!p.ultima_movimentacao_em) return '<span class="pill vencido">nunca</span>';
  const d = Math.floor((new Date(hojeISO() + 'T12:00:00') - new Date(p.ultima_movimentacao_em + 'T12:00:00')) / 864e5);
  return '<div class="rt-cf ' + (d > 30 ? 'rt-cf-nunca' : d > 15 ? 'rt-cf-velho' : 'rt-cf-ok') + '"><span class="rt-cf-txt">' + (m && m.tipo !== 'sem_novidade' ? '✎ ' : '✓ ') + dataBR(p.ultima_movimentacao_em) +
    '<small>' + esc(m ? (m.quem || '') + (m.tipo === 'sem_novidade' ? ' · sem novidade' : ' · com alteração') : '') + (d > 15 ? ' · há ' + d + ' d' : '') + '</small></span></div>';
}
// janela "Registrar movimentação" (também no detalhe do processo, em Jurídico → Processos)
async function janelaMovimentacao(processoId, depois) {
  const [p] = await q(sb.from('processos').select('id, numero, valor, obs, grupos(nome)').eq('id', processoId));
  if (!p) return aviso('Processo não encontrado.', true);
  const H = await q(sb.from('processo_movimentacoes').select('*').eq('processo_id', processoId).order('data', { ascending: false }).order('criado_em', { ascending: false }).limit(30)).catch(() => []);
  const rot = Object.fromEntries(TIPOS_MOV);
  const j = abrirJanela({ titulo: 'Processo ' + p.numero, larga: true,
    corpo: '<form class="form-grid" id="mov-form">' +
      campo('Data', '<input name="data" value="' + dataBR(hojeISO()) + '" placeholder="dd/mm/aaaa">') +
      campo('O que aconteceu', '<select name="tipo">' + TIPOS_MOV.map(([v, r]) => '<option value="' + v + '">' + r + '</option>').join('') + '</select>') +
      campo('Descrição', '<textarea name="descricao" rows="3" placeholder="Ex.: Juntada de petição; sentença de procedência; valor atualizado pela contadoria…"></textarea>', 'inteiro') +
      // Backup 37: o valor atual fica ao lado, como referência
      '<div class="mov-valor mov-valores inteiro"><div class="mov-vatual"><span>Valor atual da causa</span><b>' + (p.valor ? brl(p.valor) : '—') + '</b></div>' +
        campo('Valor novo', '<input name="valor" data-mascara="brl" inputmode="decimal" placeholder="R$ 0,00">') + '</div>' +
      '</form>' +
      '<div class="mov-hist"><div class="gx-det-tit">Histórico' + (p.grupos ? ' · ' + esc(p.grupos.nome) : '') + '</div>' +
      (H.length ? H.map((m) => '<div class="mov-it"><span class="mov-d">' + dataBR(m.data) + '</span><span class="pill neutro">' + esc(rot[m.tipo] || m.tipo) + '</span><span class="mov-t">' +
        esc(m.descricao || '') + (m.valor_novo != null ? ' <b>' + brl(m.valor_novo) + '</b>' : '') + '</span><span class="sub">' + esc(m.quem || '') + '</span></div>').join('')
        : '<div class="sub">Nada registrado ainda.</div>') + '</div>',
    rodape: '<span class="sub">A "última movimentação" do processo é atualizada ao salvar.</span><div class="acoes"><button type="button" class="btn btn-p" data-mov-ok>Salvar</button></div>' });
  const f = j.querySelector('#mov-form'); mascaraData(f.data);
  const mostrarValor = () => { j.querySelector('.mov-valor').hidden = f.tipo.value !== 'valor'; };
  f.tipo.onchange = mostrarValor; mostrarValor();
  j.querySelector('[data-mov-ok]').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const d = lerDataBR(f.data.value); if (!d) throw new Error('Preencha a data (dd/mm/aaaa).');
    const tipo = f.tipo.value, desc = f.descricao.value.trim();
    if (tipo !== 'sem_novidade' && tipo !== 'procuracao' && tipo !== 'valor' && !desc) throw new Error('Descreva o que aconteceu.');
    const row = { processo_id: processoId, data: d.iso, tipo, descricao: desc || rot[tipo] };
    if (tipo === 'valor') { const v = lerValor(f.valor.value); if (!v) throw new Error('Informe o valor novo.'); row.valor_novo = v; if (!desc) row.descricao = 'Valor alterado para ' + brl(v); }
    await q(sb.from('processo_movimentacoes').insert(row).select('id'));
    aviso('✓ Movimentação registrada.'); fecharJanela(j); if (depois) depois();
  });
  return j;
}

// ── 3) Guias ──
// ── 3) Backup 31/33/34: CONTROLE dos parcelamentos e dos acordos — planilha por mês (5 meses atrás, o atual e 2 à frente).
// Backup 34: cada mês tem EMISSÃO e PAGAMENTO. A emissão é feita AQUI: marque as parcelas (meses) e clique em "Enviar por empresa"
// (a mesma janela/e-mail de sempre); ao enviar, a parcela fica marcada como emitida. Vencida sem pagamento pode ser marcada de novo
// no mês seguinte (reemissão com valor atualizado). O valor de cada parcela é editável (o mês sem valor herda o último lançado).
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const _rtAberto = {};
const _rtSel = { parcelas: new Set(), acordos: new Set() };
const rotinaParcelamentos = (el) => rotinaControle(el, 'parcelas');
const rotinaAcordos = (el) => rotinaControle(el, 'acordos');
const emitidaRt = (x) => !!x.emitida_em || /sim|emitid/i.test(x.emissao || '');
async function rotinaControle(el, tipo) {
  const parc = tipo === 'parcelas', chaveMes = 'mesIni_' + tipo, SEL = _rtSel[tipo];
  E.rt[chaveMes] = E.rt[chaveMes] == null ? -5 : E.rt[chaveMes];
  const h = hojeISO(), base = new Date(h.slice(0, 7) + '-01T12:00:00');
  const mes = (k) => { const d = new Date(base); d.setMonth(d.getMonth() + k); return d.toISOString().slice(0, 7); };
  const MS = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => mes(E.rt[chaveMes] + i));
  if (!E.clientes.length) await carregarCadastros();
  let IT, PC, SIT = {};
  if (parc) {
    const [PA, P2, S2] = await Promise.all([
      buscarTodos(() => sb.from('parcelamentos').select('id, empresa, cnpj, local, natureza, numero, total_parcelas, valor_ultima_parcela, grupo_id, emitimos_guia').order('id')),
      buscarTodos(() => sb.from('parcelas').select('id, parcelamento_id, numero, vencimento, pago, emitida_em, emissao, reenvio_em, reenvio_valor, valor, guia_doc').order('vencimento').order('id')),
      situacaoRotina('parcelamentos')]);
    SIT = S2;
    const porId = {}; PA.forEach((p) => { porId[p.id] = p; });
    // valor de cada parcela: o lançado; sem lançamento, o último lançado antes dela; sem nenhum, o "valor da última parcela"
    const ult = {};
    PC = P2.filter((x) => porId[x.parcelamento_id]).map((x) => { const p = porId[x.parcelamento_id];
      if (x.valor != null && Number(x.valor) > 0) ult[p.id] = Number(x.valor);
      return Object.assign(x, { item: p.id, rot: (x.numero || '?') + (p.total_parcelas ? '/' + p.total_parcelas : ''), valorEf: ult[p.id] != null ? ult[p.id] : Number(p.valor_ultima_parcela) || 0,
        lancado: x.valor != null && Number(x.valor) > 0, parcelamentos: p, quem: p.empresa, grupo_id: p.grupo_id,
        cliente_id: (E.clientes.find((c) => (soDigitos(p.cnpj) && soDigitos(c.cpf_cnpj) === soDigitos(p.cnpj)) || c.nome === p.empresa) || {}).id || null }); });
    // Backup 35: valor residual = valor da última parcela lançada × parcelas que faltam
    const residual = (p) => { const ps = P2.filter((x) => x.parcelamento_id === p.id), pagas = ps.filter((x) => x.pago).length, tot = Number(p.total_parcelas) || ps.length;
      return { falta: Math.max(0, tot - pagas), v: (Number(p.valor_ultima_parcela) || 0) * Math.max(0, tot - pagas) }; };
    IT = PA.map((p) => ({ id: p.id, grupo_id: p.grupo_id, titulo: p.empresa || '—', resid: residual(p), sub: [p.local, p.natureza, p.numero ? 'nº ' + p.numero : ''].filter(Boolean).join(' · '),
      busca: [p.empresa, p.natureza, p.local, p.numero, p.cnpj].join(' '), nos: p.emitimos_guia !== false, p }));
  } else {
    const A = await buscarTodos(() => sb.from('acordos').select('id, parcela, total_parcelas, vencimento, valor, pago, emissao, emitida_em, reenvio_em, reenvio_valor, devedor, credor, processo, grupo_id, pix, banco, forma_pagamento, guia_doc').order('vencimento').order('id'));
    const M = {};
    A.forEach((a) => { const k = [a.grupo_id || '', a.devedor || '', a.credor || '', a.processo || ''].join('|');
      (M[k] = M[k] || { id: k, grupo_id: a.grupo_id, titulo: a.devedor || '—', sub: 'deve a ' + (a.credor || '—') + (a.processo ? ' · ' + a.processo : ''), busca: [a.devedor, a.credor, a.processo].join(' '), nos: true, l: [] }).l.push(a);
      Object.assign(a, { item: k, rot: String(a.parcela || '?') + (a.total_parcelas ? '/' + a.total_parcelas : ''), valorEf: Number(a.valor) || 0, lancado: true, quem: a.devedor,
        cliente_id: (E.clientes.find((c) => c.grupo_id === a.grupo_id && primeiroNome(c.nome) === primeiroNome(a.devedor)) || {}).id || null }); });
    IT = Object.values(M); PC = A;
  }
  const atrasos = {}, porItem = {}, cel = {}, porId = {};
  PC.forEach((x) => { porId[x.id] = x; (porItem[x.item] = porItem[x.item] || []).push(x); if (!x.pago && x.vencimento < h) atrasos[x.item] = (atrasos[x.item] || 0) + 1;
    const m = String(x.vencimento || '').slice(0, 7); if (MS.includes(m)) (cel[x.item + '|' + m] = cel[x.item + '|' + m] || []).push(x); });
  [...SEL].forEach((id) => { if (!porId[id] || porId[id].pago) SEL.delete(id); });
  const gnome = (id) => nomeGrupo(id) || 'Sem grupo';
  const nomeItem = parc ? 'parcelamento' : 'acordo', ncol = MS.length + (parc ? 3 : 1);
  const rotMes = (m) => MESES_CURTOS[+m.slice(5) - 1] + '/' + m.slice(2, 4);
  const fimMes = fimDoMesISO(h);
  el.innerHTML = '<div class="card rt-ctl-card"><div class="card-hd">📋 Controle ' + (parc ? 'dos parcelamentos' : 'dos acordos') +
      '<span class="sub">um quadrinho por parcela em cada mês · clique no quadrinho para agir</span></div>' +
    '<div class="card-bd">' + filtroRotina('<select class="busca" id="rt-filtro" autocomplete="off">' + (parc ? [['', 'Todos os parcelamentos'], ['nos', 'Só os que nós emitimos'], ['cli', 'Só os que o cliente emite'], ['atr', 'Com parcela em atraso']] : [['', 'Todos os acordos'], ['atr', 'Com parcela em atraso']])
        .map(([v, r]) => '<option value="' + v + '"' + (v === E.rt.filtro ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>' +
        '<span class="rt-meses"><button type="button" class="btn btn-o btn-mini" data-mes="-1" aria-label="Meses anteriores">‹</button><b>' + rotMes(MS[0]) + ' – ' + rotMes(MS[7]) + '</b><button type="button" class="btn btn-o btn-mini" data-mes="1" aria-label="Próximos meses">›</button>' +
          (E.rt[chaveMes] !== -5 ? '<button type="button" class="btn btn-o btn-mini" data-mes="0">hoje</button>' : '') + '</span>') +
      '<div class="rt-leg2"><span class="rt-leg2-txt"><span class="rt-leg2-t">Como usar:</span> clique no quadrinho → <b>Marcar para enviar</b> → <b>✉ Enviar por empresa</b> (barra de baixo). A parcela fica <b>Emitida</b> sozinha.</span>' +
        '<span class="rt-leg2-cores"><span class="rt-ch rt-ch-emitir">Emitir</span><span class="rt-ch rt-ch-sel">✉ Marcada</span><span class="rt-ch rt-ch-emit">Emitida</span><span class="rt-ch rt-ch-atr">Vencida</span><span class="rt-ch rt-ch-ok">✓ Paga</span><span class="rt-ch">A vencer</span>' + (parc ? '<span class="rt-ch rt-ch-cli">Cliente emite</span>' : '') + '</span></div>' +
      '<div class="rt-ctl-wrap" data-sem-pagina><table class="rt-ctl rt-ctl2"><thead><tr>' + (parc ? '<th class="rt-c-emit" title="O escritório emite a guia deste parcelamento?">Nós<br>emitimos</th>' : '') + '<th class="rt-c-item">' + (parc ? 'Parcelamento' : 'Acordo') + '</th>' +
        MS.map((m) => '<th class="rt-c-mes' + (m === h.slice(0, 7) ? ' rt-mes-atual' : '') + '">' + rotMes(m) + (m === h.slice(0, 7) ? '<small>este mês</small>' : '') + '</th>').join('') + (parc ? '<th class="rt-c-conf">Conferência</th>' : '') + '</tr></thead><tbody id="rt-parc-corpo"></tbody></table></div>' +
      '<div class="rt-pop" id="rt-pop" hidden></div>' +
      '<div class="rt-selbar" id="rt-selbar" hidden></div></div></div>';
  const corpo = $('rt-parc-corpo'), pop = $('rt-pop');
  // estado de cada parcela → [classe, rótulo, linha de baixo]
  const estado = (x, it) => {
    const em = emitidaRt(x), venc = x.vencimento < h, dEm = x.emitida_em ? dataBR(x.emitida_em).slice(0, 5) : '';
    if (x.pago) return ['rt-ch-ok', '✓ Paga', em ? 'emitida' + (dEm ? ' ' + dEm : '') : ''];
    if (!it.nos) return [venc ? 'rt-ch-atr rt-ch-cli' : 'rt-ch-cli', venc ? 'Vencida' : 'A vencer', 'cliente emite'];
    if (SEL.has(x.id)) return ['rt-ch-sel', '✉ Marcada', 'para enviar'];
    if (venc) return ['rt-ch-atr', 'Vencida', em ? 'reemitir' : 'não emitida'];
    if (em) return ['rt-ch-emit', 'Emitida', dEm];
    if (x.vencimento <= fimMes) return ['rt-ch-emitir', 'Emitir', 'vence ' + dataBR(x.vencimento).slice(0, 5)];
    return ['', 'A vencer', 'vence ' + dataBR(x.vencimento).slice(0, 5)];
  };
  const chip = (x, it) => { const [c, r, s] = estado(x, it);
    return '<button type="button" class="rt-ch ' + c + '" data-cel="' + x.id + '" title="Parcela ' + esc(x.rot) + ' · ' + brl(x.valorEf) + ' · clique para agir"><span>' + r + '</span>' + (s ? '<small>' + esc(s) + '</small>' : '') + '</button>'; };
  const fecharPop = () => { pop.hidden = true; pop.innerHTML = ''; };
  const abrirPop = (b) => {
    const x = porId[b.dataset.cel], it = IT.find((p) => p.id === x.item) || {}, [c, r] = estado(x, it), sel = SEL.has(x.id);
    pop.innerHTML = '<div class="rt-pop-hd"><b>' + esc(it.titulo || x.quem || '') + '</b><button type="button" class="rt-pop-x" data-pop-fechar aria-label="Fechar">✕</button></div>' +
      '<div class="rt-pop-info">Parcela <b>' + esc(x.rot) + '</b> · vence <b>' + dataBR(x.vencimento) + '</b><br>Valor <b>' + brl(x.valorEf) + '</b>' + (x.lancado ? '' : ' <span class="sub">(último lançado)</span>') +
        '<br><span class="rt-ch ' + c + '">' + r + '</span>' + (emitidaRt(x) ? ' <span class="sub">emitida' + (x.emitida_em ? ' em ' + dataBR(x.emitida_em) : '') + '</span>' : '') + (x.reenvio_em ? ' <span class="sub">· reenviada ' + dataLocal(x.reenvio_em) + '</span>' : '') + '</div>' +
      '<div class="rt-pop-acoes">' +
        (!x.pago && it.nos ? '<button type="button" class="btn ' + (sel ? 'btn-o' : 'btn-p') + '" data-sel="' + x.id + '">' + (sel ? '✕ Desmarcar' : '✉ Marcar para enviar') + '</button>' : '') +
        (!x.pago ? '<button type="button" class="btn btn-o" data-pag="' + x.id + '">💲 Lançar pagamento</button>' : '') +
        '<button type="button" class="btn btn-o" data-abre="' + esc(x.item) + '">' + (parc ? '✎ Ver parcelas e editar valor' : '☰ Ver todas as parcelas') + '</button></div>';
    pop.hidden = false;
    const wr = el.querySelector('.rt-ctl-card').getBoundingClientRect(), rb = b.getBoundingClientRect();
    pop.style.top = (rb.bottom - wr.top + 6) + 'px';
    pop.style.left = Math.max(8, Math.min(rb.left - wr.left - 120, wr.width - 300)) + 'px';
  };
  const detalhe = (it) => '<tr class="rt-det"><td colspan="' + ncol + '"><table class="rt-det-tab"><thead><tr><th>Parcela</th><th>Vencimento</th><th>Valor</th><th>Situação</th><th>Reenviada</th></tr></thead><tbody>' +
    (porItem[it.id] || []).slice().sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento))).map((x) =>
      '<tr><td>' + esc(x.rot || '—') + '</td><td>' + dataBR(x.vencimento) + '</td>' +
      '<td>' + (parc ? '<span class="rt-vbox"><span>R$</span><input class="rt-valor-p" data-valor="' + x.id + '" data-mascara="nenhuma" inputmode="decimal" value="' + (x.lancado ? valorParaCampo(x.valor) : '') + '" placeholder="' + valorParaCampo(x.valorEf) + '" aria-label="Valor da parcela ' + esc(x.rot) + '" title="Valor lançado nesta parcela (vazio = vale o último lançado)"></span>' : brl(x.valorEf)) + '</td>' +
      '<td>' + chip(x, it) + '</td><td>' + (x.reenvio_em ? dataLocal(x.reenvio_em) + (x.reenvio_valor ? ' · ' + brl(x.reenvio_valor) : '') : '—') + '</td></tr>').join('') + '</tbody></table></td></tr>';
  const pintarSel = () => {
    const bar = $('rt-selbar'); if (!bar) return;
    const L = [...SEL].map((id) => porId[id]).filter(Boolean);
    bar.hidden = !L.length;
    if (L.length) bar.innerHTML = '<span><b>' + plural(L.length, 'parcela marcada', 'parcelas marcadas') + '</b> · ' + plural(new Set(L.map((x) => x.cliente_id || x.quem)).size, 'empresa', 'empresas') + ' · total ' + brl(L.reduce((s2, x) => s2 + (x.valorEf || 0), 0)) +
      (L.some((x) => x.vencimento < h) ? ' · <span class="rt-sel-atr">inclui vencida (reemissão com valor atualizado)</span>' : '') + '</span>' +
      '<span class="acoes"><button type="button" class="btn btn-o btn-mini" data-sel-limpar>Desmarcar</button><button type="button" class="btn btn-p" data-sel-enviar>✉ Enviar por empresa</button></span>';
  };
  const pintar = () => {
    fecharPop();
    const b = normalizar(E.rt.busca), dig = soDigitos(E.rt.busca);
    const L = IT.filter((p) => (!E.rt.grupo || p.grupo_id === E.rt.grupo) && (!b || normalizar(p.busca + ' ' + gnome(p.grupo_id)).includes(b) || (dig.length >= 3 && soDigitos(p.busca).includes(dig))) &&
        (E.rt.filtro !== 'nos' || p.nos) && (E.rt.filtro !== 'cli' || !p.nos) && (E.rt.filtro !== 'atr' || atrasos[p.id]))
      .sort((x, y) => (gnome(x.grupo_id) === 'Sem grupo') - (gnome(y.grupo_id) === 'Sem grupo') || gnome(x.grupo_id).localeCompare(gnome(y.grupo_id), 'pt-BR') || String(x.titulo).localeCompare(String(y.titulo), 'pt-BR'));
    let grp = null;
    corpo.innerHTML = L.length ? L.map((p) => {
      const g = gnome(p.grupo_id), doG = L.filter((z) => gnome(z.grupo_id) === g), atr = atrasos[p.id] || 0, ab = !!_rtAberto[tipo + p.id];
      const cab = g !== grp ? (grp = g, '<tr class="gx-grp rt-grp"><td colspan="' + ncol + '"><span class="rt-g-nome">' + esc(g) + '</span> <span class="sub">' + plural(doG.length, nomeItem, nomeItem + 's') + '</span></td></tr>') : '';
      return cab + '<tr data-pc="' + esc(p.id) + '"' + (ab ? ' class="rt-aberto"' : '') + '>' +
        (parc ? '<td class="rt-c-emit"><label class="rt-chave rt-chave-mini" title="' + (p.nos ? 'O escritório emite a guia (desligue se o cliente emite)' : 'O cliente emite a guia (ligue se o escritório emite)') + '"><input type="checkbox" data-emit="' + p.id + '"' + (p.nos ? ' checked' : '') + ' aria-label="Nós emitimos a guia"><span></span></label></td>' : '') +
        '<td class="rt-emp rt-abre" data-abre="' + esc(p.id) + '" role="button" tabindex="0" title="Ver todas as parcelas (e editar o valor)"><div class="rt-emp-l1"><span class="rt-seta">' + (ab ? '▾' : '▸') + '</span><b>' + esc(p.titulo) + '</b></div>' +
          (atr ? '<div class="rt-emp-pill"><span class="pill ' + (atr >= 2 ? 'vencido' : 'atr-leve') + '">' + atr + ' em atraso</span></div>' : '') + '<div class="sub">' + esc(p.sub) + '</div>' +
          (p.resid ? '<div class="rt-resid" title="Valor da última parcela × ' + p.resid.falta + ' parcelas que faltam">Residual <b>' + brl(p.resid.v) + '</b> · ' + plural(p.resid.falta, 'falta 1', 'faltam ' + p.resid.falta).replace(/^\d+ /, '') + '</div>' : '') + '</td>' +
        MS.map((m) => '<td class="rt-c-mes' + (m === h.slice(0, 7) ? ' rt-mes-atual' : '') + '">' + ((cel[p.id + '|' + m] || []).map((x) => chip(x, p)).join('') || '<span class="rt-ch-vazio">—</span>') + '</td>').join('') +
        (parc ? '<td class="rt-c-conf">' + celulaConferencia(SIT[p.id], p.id) + '</td>' : '') + '</tr>' + (ab ? detalhe(p) : '');
    }).join('') : '<tr><td colspan="' + ncol + '">' + vazio('Nenhum ' + nomeItem + ' com esses filtros.') + '</td></tr>';
    pintarSel();
  };
  const emitimos = async (ids, v) => { await q(sb.rpc('parcelamentos_emitimos', { p_ids: ids, p_emitimos: v }));
    await q(sb.rpc('conferir_rotina', { p_area: 'parcelamentos', p_ids: ids, p_alterou: true })).catch(() => null);
    IT.forEach((p) => { if (ids.includes(p.id)) p.nos = v; });
    if (!v) PC.forEach((x) => { if (ids.includes(x.item)) SEL.delete(x.id); });
    ids.forEach((id) => { SIT[id] = Object.assign({}, SIT[id], { conferido_em: new Date().toISOString(), conferido_por: E.perfil ? E.perfil.nome : '', conferido_alterou: true }); });
    if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); pintar(); };
  corpo.onchange = (ev) => { const c = ev.target.closest('[data-emit]'); if (!c) return;
    emitimos([c.dataset.emit], c.checked).then(() => aviso(c.checked ? '✓ O escritório emite a guia deste parcelamento.' : '✓ Marcado: o cliente emite a guia.'), (e) => { aviso(erroAmigavel(e), true); pintar(); }); };
  // valor da parcela (só parcelamentos): grava ao sair do campo
  corpo.addEventListener('focusout', (ev) => { const i = ev.target.closest('[data-valor]'); if (!i) return;
    const x = porId[i.dataset.valor], v = i.value.trim() ? lerValor(i.value) : null;
    if (v != null && isNaN(v)) { aviso('Valor inválido.', true); return; }
    if ((v || null) === (x.lancado ? Number(x.valor) : null)) return;
    q(sb.rpc('lancar_valor_parcela', { p_id: x.id, p_valor: v })).then(() => { aviso('✓ Valor da parcela ' + x.rot + ' gravado.'); if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); rotinaControle(el, tipo); }, (e) => aviso(erroAmigavel(e), true)); });
  const acao = (ev) => {
    if (ev.target.closest('[data-pop-fechar]')) { fecharPop(); return true; }
    const sl = ev.target.closest('[data-sel]');
    if (sl) { const id = sl.dataset.sel; if (SEL.has(id)) SEL.delete(id); else SEL.add(id); pintar(); return true; }
    const pg = ev.target.closest('[data-pag]');
    if (pg) { const x = porId[pg.dataset.pag]; fecharPop();
      if (!confirm('Lançar o pagamento da parcela ' + (x ? x.rot + ' (' + brl(x.valorEf) + ', vence ' + dataBR(x.vencimento) + ')' : '') + '?')) return true;
      if (window.ERP_EDITOR && window.ERP_EDITOR.baixaRapida) Promise.resolve(window.ERP_EDITOR.baixaRapida(tipo, pg.dataset.pag)).then(() => setTimeout(() => rotinaControle(el, tipo), 1500)); return true; }
    return false;
  };
  pop.onclick = (ev) => { if (acao(ev)) return; const ab = ev.target.closest('[data-abre]'); if (!ab) return;
    // Backup 37: nos acordos abre a MESMA ficha do módulo Acordos (todas as parcelas, baixa, editar)
    if (!parc) { const id = pop.dataset.de; fecharPop(); return detalheAcordo(id); }
    _rtAberto[tipo + ab.dataset.abre] = true; pintar(); };
  if (!el._rtFora) { el._rtFora = true; document.addEventListener('mousedown', (ev) => { const p2 = document.getElementById('rt-pop'); if (p2 && !p2.hidden && !ev.target.closest('#rt-pop, [data-cel]')) { p2.hidden = true; } });
    document.addEventListener('keydown', (ev) => { const p2 = document.getElementById('rt-pop'); if (ev.key === 'Escape' && p2 && !p2.hidden) p2.hidden = true; }); }
  corpo.onclick = (ev) => {
    const ch = ev.target.closest('[data-cel]');
    if (ch) { if (!pop.hidden && pop.dataset.de === ch.dataset.cel) { fecharPop(); return; } pop.dataset.de = ch.dataset.cel; abrirPop(ch); return; }
    const cf = ev.target.closest('[data-conferir]');
    if (cf) return comBotao(cf, async () => { await q(sb.rpc('conferir_rotina', { p_area: 'parcelamentos', p_ids: [cf.dataset.conferir], p_alterou: false }));
      SIT[cf.dataset.conferir] = Object.assign({}, SIT[cf.dataset.conferir], { conferido_em: new Date().toISOString(), conferido_por: E.perfil ? E.perfil.nome : '', conferido_alterou: false });
      cf.closest('td').innerHTML = celulaConferencia(SIT[cf.dataset.conferir], cf.dataset.conferir); });
    const ab = ev.target.closest('[data-abre]'); if (ab && !ev.target.closest('input')) { _rtAberto[tipo + ab.dataset.abre] = !_rtAberto[tipo + ab.dataset.abre]; pintar(); }
  };
  corpo.onkeydown = (ev) => { if (ev.key === 'Enter' && ev.target.matches('[data-abre]')) ev.target.click(); if (ev.key === 'Enter' && ev.target.matches('[data-valor]')) ev.target.blur(); };
  $('rt-selbar').onclick = (ev) => {
    if (ev.target.closest('[data-sel-limpar]')) { SEL.clear(); pintar(); return; }
    if (!ev.target.closest('[data-sel-enviar]')) return;
    const L = [...SEL].map((id) => porId[id]).filter(Boolean).map((x) => Object.assign({}, x, { valor: x.valorEf, parcela: x.rot, email_em: null,
      detalhe: parc ? [x.parcelamentos.natureza, x.parcelamentos.local].filter(Boolean).join(' · ') : 'deve a ' + (x.credor || '—') }));
    if (!L.length) return;
    janelaGuiasEmpresa(tipo, L, null, async () => { L.forEach((x) => SEL.delete(x.id)); await rotinaControle(el, tipo); });
  };
  el.querySelectorAll('[data-mes]').forEach((b) => b.onclick = () => { E.rt[chaveMes] = Number(b.dataset.mes) === 0 ? -5 : E.rt[chaveMes] + 3 * Number(b.dataset.mes); rotinaControle(el, tipo); });
  ligarFiltroRotina(el, pintar); pintar();
}

// ── 3c) Backup 35 (TESTE): "Planilha de parcelamentos" — igual à planilha do escritório: uma aba por GRUPO e um bloco por
// parcelamento (Nome, CPF/CNPJ, Local, Natureza, Nº, Total, Pagas, Valor da última parcela, Valor residual, Emitimos, observação) com a
// lista PARCELA · VENCIMENTO · EMISSÃO · PAGAMENTO. Botão "Emitir guias": as em atraso + as que vencem neste mês (como no ERP antigo).
async function rotinaPlanilha(el) {
  if (!E.clientes.length) await carregarCadastros();
  const h = hojeISO(), fimMes = fimDoMesGuia(h);
  const [PA, P2] = await Promise.all([
    buscarTodos(() => sb.from('parcelamentos').select('id, empresa, cnpj, local, natureza, numero, total_parcelas, valor_ultima_parcela, grupo_id, emitimos_guia, obs').order('id')),
    buscarTodos(() => sb.from('parcelas').select('id, parcelamento_id, numero, vencimento, pago, data_pagamento, emitida_em, emissao, valor, guia_doc').order('vencimento').order('id'))]);
  const porPa = {}; P2.forEach((x) => { (porPa[x.parcelamento_id] = porPa[x.parcelamento_id] || []).push(x); });
  const gnome = (id) => nomeGrupo(id) || 'Sem grupo';
  const grupos = [...new Set(PA.map((p) => gnome(p.grupo_id)))].sort((a, b) => (a === 'Sem grupo') - (b === 'Sem grupo') || a.localeCompare(b, 'pt-BR'));
  E.rt.plGrupo = grupos.includes(E.rt.plGrupo) ? E.rt.plGrupo : grupos[0];
  const emit = (x) => !!x.emitida_em || /sim|emitid/i.test(x.emissao || '');
  // "a emitir agora" = não paga, nós emitimos, sem emissão e vencendo até o fim do mês (vencidas entram de novo: reemissão)
  const aEmitir = (p) => p.emitimos_guia === false ? [] : (porPa[p.id] || []).filter((x) => !x.pago && x.vencimento && x.vencimento <= fimMes && (!emit(x) || x.vencimento < h));
  // parcelas que ainda não foram lançadas: completa a lista até a última (mês a mês, a partir da última lançada)
  const prevista = (ps, tot) => { const u = ps[ps.length - 1], n0 = u ? Number(u.numero) : 0; if (!u || !n0 || !u.vencimento || !(tot > n0)) return [];
    const out = []; for (let n = n0 + 1; n <= Math.min(tot, n0 + 240); n++) { const d = new Date(u.vencimento + 'T12:00:00'), dia = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + (n - n0));
      d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); out.push({ n, v: d.toISOString().slice(0, 10) }); } return out; };
  const nGrupo = (g) => PA.filter((p) => gnome(p.grupo_id) === g).reduce((s2, p) => s2 + aEmitir(p).length, 0);
  const pintar = () => {
    const L = PA.filter((p) => gnome(p.grupo_id) === E.rt.plGrupo).sort((a, b) => String(a.empresa).localeCompare(String(b.empresa), 'pt-BR') || String(a.natureza).localeCompare(String(b.natureza), 'pt-BR'));
    const nE = L.reduce((s2, p) => s2 + aEmitir(p).length, 0);
    el.innerHTML = '<div class="card pl-card"><div class="card-hd">🧪 Planilha de parcelamentos <span class="pill hoje">teste</span><span class="sub">uma aba por grupo, um bloco por parcelamento · clique em EMISSÃO ou PAGAMENTO para marcar</span></div>' +
      '<div class="card-bd"><div class="pl-abas" role="tablist">' + grupos.map((g) => { const n = nGrupo(g);
        return '<button type="button" role="tab" class="pl-aba' + (g === E.rt.plGrupo ? ' ativo' : '') + '" data-pl-g="' + esc(g) + '">' + esc(g) + (n ? ' <span class="pl-n" title="Guias a emitir">' + n + '</span>' : '') + '</button>'; }).join('') + '</div>' +
      '<div class="pl-barra"><span class="sub">' + plural(L.length, 'parcelamento', 'parcelamentos') + ' em <b>' + esc(E.rt.plGrupo || '—') + '</b> · ' + (nE ? plural(nE, 'guia a emitir', 'guias a emitir') + ' (em atraso + vencem neste mês)' : 'nenhuma guia a emitir agora') + '</span>' +
        '<button type="button" class="btn btn-p" id="pl-emitir">🧾 Emitir guias — em atraso + vencem neste mês' + (nE ? ' (' + nE + ')' : '') + '</button></div>' +
      '<div class="pl-blocos">' + L.map((p) => {
        const ps = (porPa[p.id] || []).slice().sort((x, y) => String(x.vencimento).localeCompare(String(y.vencimento))), pagas = ps.filter((x) => x.pago).length, tot = Number(p.total_parcelas) || ps.length, v = Number(p.valor_ultima_parcela) || 0;
        const resid = v * Math.max(0, tot - pagas), cli = p.emitimos_guia === false, atr = ps.filter((x) => !x.pago && x.vencimento < h).length, nAe = aEmitir(p).length;
        const pct = tot ? Math.round(100 * pagas / tot) : 0;
        return '<section class="pl-bloco" data-pl-pa="' + p.id + '">' +
          '<div class="pl-cab"><div class="pl-cab-nome">' + esc(p.empresa || '—') + '</div>' +
            '<div class="pl-cab-doc">' + esc(mascaraDoc(p.cnpj) || 'sem CPF/CNPJ') + '</div>' +
            '<div class="pl-cab-tags">' + [p.local, p.natureza].filter(Boolean).map((z) => '<span class="pl-tag">' + esc(z) + '</span>').join('') + (p.numero ? '<span class="pl-tag pl-tag-n">nº ' + esc(p.numero) + '</span>' : '') + '</div>' +
            '<div class="pl-prog"><div class="pl-prog-bar"><span style="width:' + pct + '%"></span></div><span><b>' + pagas + '</b> de ' + (tot || '—') + ' pagas' + (atr ? ' · <b class="pl-atr-t">' + atr + ' em atraso</b>' : '') + '</span></div>' +
            '<div class="pl-kpis"><div><small>Última parcela</small><span class="rt-vbox"><span>R$</span><input data-pl-v="' + p.id + '" data-mascara="nenhuma" inputmode="decimal" value="' + (v ? valorParaCampo(v) : '') + '" aria-label="Valor da última parcela"></span></div>' +
              '<div><small>Valor residual</small><b>' + brl(resid) + '</b></div></div>' +
            '<div class="pl-cab-pe"><label class="rt-chave rt-chave-mini"><input type="checkbox" data-pl-emit="' + p.id + '"' + (cli ? '' : ' checked') + '><span></span><small>' + (cli ? 'O cliente emite as guias' : 'Nós emitimos as guias') + '</small></label>' +
              (nAe ? '<span class="pill hoje">' + plural(nAe, 'a emitir', 'a emitir') + '</span>' : '') + '</div>' +
            '<input class="pl-obs" data-pl-obs="' + p.id + '" value="' + esc(p.obs || '') + '" placeholder="Observação (ex.: enviar por WhatsApp)" aria-label="Observação">' +
            // Backup 37: emitir mesmo parcela futura — deste parcelamento ou de todos os parcelamentos da empresa
            (cli ? '' : '<div class="pl-cab-bts"><button type="button" class="btn btn-o btn-mini" data-pl-gpa="' + p.id + '" title="Em atraso + do mês; se não houver, a próxima parcela">🧾 Emitir deste parcelamento</button>' +
              '<button type="button" class="btn btn-o btn-mini" data-pl-gemp="' + esc(p.empresa || '') + '" title="Todos os parcelamentos desta empresa">🧾 Todos da empresa</button></div>') + '</div>' +
          (ps.length ? '<table class="pl-tab"><colgroup><col style="width:12%"><col style="width:28%"><col style="width:30%"><col style="width:30%"></colgroup><thead><tr><th title="Parcela">Nº</th><th>Vencimento</th><th>Emissão</th><th>Pagamento</th></tr></thead><tbody>' +
          ps.map((x) => { const at = !x.pago && x.vencimento < h, mes = x.vencimento && x.vencimento.slice(0, 7) === h.slice(0, 7), em = emit(x);
            const curta = (d) => { const s = dataBR(d); return s.slice(0, 6) + s.slice(8); }, dEm = x.emitida_em ? curta(x.emitida_em) : em ? 'emitida' : '';
            return '<tr class="' + (x.pago ? 'pl-pago' : at ? 'pl-atr' : mes ? 'pl-mes' : '') + '"><td>' + esc(x.numero || '') + '</td><td>' + dataBR(x.vencimento) + '</td>' +
              '<td>' + (cli ? '<span class="pl-dt pl-dt-cli" title="O cliente emite">cliente</span>'
                : em ? '<button type="button" class="pl-dt pl-dt-ok" data-pl-e="' + x.id + '" title="Emitida' + (x.emitida_em ? ' em ' + dataBR(x.emitida_em) : '') + ' · clique para desmarcar">✓ ' + esc(dEm) + '</button>'
                : x.pago ? '<span class="pl-dt">—</span>'
                : '<span class="pl-em2"><button type="button" class="pl-dt pl-dt-emitir" data-pl-gx="' + x.id + '" title="Abrir o envio com esta guia (vale parcela futura)">🧾 Emitir</button><button type="button" class="pl-dt-mk" data-pl-e="' + x.id + '" title="Só marcar como emitida (sem enviar)">✓</button></span>') + '</td>' +
              '<td>' + (x.pago ? '<span class="pl-dt pl-dt-ok" title="Paga">✓ ' + (x.data_pagamento ? curta(x.data_pagamento) : 'paga') + '</span>'
                : '<button type="button" class="pl-dt ' + (at ? 'pl-dt-atr' : 'pl-dt-ab') + '" data-pl-p="' + x.id + '" title="Clique para lançar o pagamento">' + (at ? 'em atraso' : 'a vencer') + '</button>') + '</td></tr>'; }).join('') +
          prevista(ps, tot).map((r) => '<tr class="pl-prev" title="Parcela ainda não lançada no sistema (data prevista)"><td>' + r.n + '</td><td>' + dataBR(r.v) + '</td><td>—</td><td>prevista</td></tr>').join('') +
          '</tbody></table>' : '<div class="pl-sem">Nenhuma parcela lançada neste parcelamento.</div>') + '</section>'; }).join('') + (L.length ? '' : vazio('Nenhum parcelamento neste grupo.')) + '</div></div></div>';
  };
  const recarregar = () => rotinaPlanilha(el);
  el.onclick = (ev) => {
    const ab = ev.target.closest('[data-pl-g]'); if (ab) { E.rt.plGrupo = ab.dataset.plG; return pintar(); }
    const be = ev.target.closest('[data-pl-e]');
    if (be) return comBotao(be, async () => { const x = P2.find((y) => y.id === be.dataset.plE), novo = !emit(x);
      await q(sb.rpc('registrar_emissao', { p_tabela: 'parcelas', p_id: x.id, p_emitida: novo, p_doc: null, p_enviar: false }));
      x.emitida_em = novo ? h : null; x.emissao = novo ? 'SIM' : ''; pintar(); });
    // Backup 37: emitir pelo mesmo envio dos outros módulos (vale parcela futura)
    const gx = ev.target.closest('[data-pl-gx]'); if (gx) return gerarGuias('parcelas', { ids: [gx.dataset.plGx] }, recarregar);
    const gpa = ev.target.closest('[data-pl-gpa]'); if (gpa) return gerarGuias('parcelas', { itens: [gpa.dataset.plGpa], proximas: true }, recarregar);
    const gemp = ev.target.closest('[data-pl-gemp]'); if (gemp) return gerarGuias('parcelas', { empresa: gemp.dataset.plGemp, proximas: true }, recarregar);
    const bp = ev.target.closest('[data-pl-p]');
    if (bp && !confirm('Lançar o pagamento desta parcela?')) return;
    if (bp && window.ERP_EDITOR && window.ERP_EDITOR.baixaRapida) return Promise.resolve(window.ERP_EDITOR.baixaRapida('parcelas', bp.dataset.plP)).then(() => setTimeout(recarregar, 1500));
    if (ev.target.closest('#pl-emitir')) {
      const gid = (PA.find((p) => gnome(p.grupo_id) === E.rt.plGrupo) || {}).grupo_id;
      if (gid) return gerarGuias('parcelas', { grupo_id: gid }, recarregar);
      const its = PA.filter((p) => gnome(p.grupo_id) === E.rt.plGrupo).flatMap((p) => aEmitir(p).map((x) => {
        const ult = (porPa[p.id] || []).filter((y) => y.valor != null && y.vencimento <= x.vencimento).slice(-1)[0];
        return Object.assign({}, x, { parcelamentos: p, quem: p.empresa, grupo_id: p.grupo_id, email_em: null, parcela: (x.numero || '?') + (p.total_parcelas ? '/' + p.total_parcelas : ''),
          valor: x.valor != null ? Number(x.valor) : ult ? Number(ult.valor) : Number(p.valor_ultima_parcela) || 0, detalhe: [p.natureza, p.local].filter(Boolean).join(' · '),
          cliente_id: (E.clientes.find((c) => (soDigitos(p.cnpj) && soDigitos(c.cpf_cnpj) === soDigitos(p.cnpj)) || c.nome === p.empresa) || {}).id || null }); }));
      if (its.length) janelaGuiasEmpresa('parcelas', its, null, recarregar);
      else aviso('Nenhuma guia a emitir em ' + (E.rt.plGrupo || 'este grupo') + ': não há parcela em atraso nem vencendo neste mês (que o escritório emita).');
    }
  };
  el.onchange = (ev) => {
    const c = ev.target.closest('[data-pl-emit]');
    if (c) q(sb.rpc('parcelamentos_emitimos', { p_ids: [c.dataset.plEmit], p_emitimos: c.checked })).then(() => { PA.find((p) => p.id === c.dataset.plEmit).emitimos_guia = c.checked; pintar(); }, (e) => aviso(erroAmigavel(e), true));
  };
  el.addEventListener('focusout', (ev) => {
    const iv = ev.target.closest('[data-pl-v]'), io = ev.target.closest('[data-pl-obs]');
    if (iv) { const v = iv.value.trim() ? lerValor(iv.value) : null; const p = PA.find((y) => y.id === iv.dataset.plV);
      if (v != null && isNaN(v)) return aviso('Valor inválido.', true);
      if ((v || null) === (Number(p.valor_ultima_parcela) || null)) return;
      q(sb.from('parcelamentos').update({ valor_ultima_parcela: v }).eq('id', p.id)).then(() => { p.valor_ultima_parcela = v; aviso('✓ Valor da última parcela gravado.'); pintar(); }, (e) => aviso(erroAmigavel(e), true)); }
    if (io) { const p = PA.find((y) => y.id === io.dataset.plObs); if ((p.obs || '') === io.value) return;
      q(sb.from('parcelamentos').update({ obs: io.value }).eq('id', p.id)).then(() => { p.obs = io.value; aviso('✓ Observação gravada.'); }, (e) => aviso(erroAmigavel(e), true)); }
  });
  pintar();
}

// ── 4) Financeiro do escritório: atalhos ──
async function rotinaFinanceiro(el) {
  const h = hojeISO(), fim = somarDias(h, 7);
  const L = await q(sb.from('lancamentos').select('id, tipo, empresa, valor, vencimento, pago, descricao, redutor').eq('pago', false).lte('vencimento', fim).order('vencimento').limit(300)).catch(() => []);
  const cont = (emp, tipo, cond) => L.filter((x) => x.empresa === emp && x.tipo === tipo && cond(x));
  const atr = (x) => x.vencimento < h, sem = (x) => x.vencimento >= h;
  const bloco = (emp, rot, painel) => '<div class="card"><div class="card-hd">' + rot + '</div><div class="card-bd rt-fin">' +
    [['A receber em atraso', cont(emp, 'receita', atr), 'vencido'], ['A receber nos próximos 7 dias', cont(emp, 'receita', sem), 'hoje'], ['A pagar em atraso', cont(emp, 'despesa', atr), 'vencido'], ['A pagar nos próximos 7 dias', cont(emp, 'despesa', sem), 'hoje']]
      .map(([r, l, c]) => '<div class="rt-fin-l"><span>' + r + '</span><span class="pill ' + (l.length ? c : 'neutro') + '">' + l.length + '</span><b>' + brl(l.reduce((s, x) => s + vl(x), 0)) + '</b></div>').join('') +
    '<div class="acoes" style="margin-top:10px"><button type="button" class="btn btn-o" data-fin-ir="' + painel + '">Abrir ' + rot + '</button>' +
      '<button type="button" class="btn btn-p" data-fin-novo="' + emp + '|receita">+ Receita</button><button type="button" class="btn btn-o" data-fin-novo="' + emp + '|despesa">+ Despesa</button></div></div></div>';
  el.innerHTML = '<div class="rt-duas">' + (pode('financeiro_juridico') ? bloco('escritorio', 'Financeiro — Jurídico', 'financeiro') : '') + (pode('financeiro_contab') ? bloco('contabilidade', 'Financeiro — Contabilidade', 'financeiroContab') : '') + '</div>' +
    (!pode('financeiro_juridico') && !pode('financeiro_contab') ? vazio('Você não tem acesso ao Financeiro.') : '');
  el.onclick = (ev) => {
    const b = ev.target.closest('[data-fin-ir],[data-fin-novo]'); if (!b) return;
    if (b.dataset.finIr) return irParaTela(b.dataset.finIr);
    const [empresa, tipo] = b.dataset.finNovo.split('|'); formLancamento({ tipo, empresa }, () => rotinaFinanceiro(el));
  };
}

// ── 5) Minhas tarefas — Backup 29: separadas em Recorrentes (voltam no próximo período), Com validação e Únicas ──
const REPETE = { semanal: 'toda semana', mensal: 'todo mês', anual: 'todo ano' };
async function rotinaTarefas(el) {
  const T = (await q(sb.from('tarefas').select('*, clientes(nome)').not('status', 'in', '(concluida,cancelada)').order('prazo', { nullsFirst: false }).limit(1000)).catch(() => []));
  const eu = primeiroNome((E.perfil && E.perfil.nome) || '');
  const minhas = T.filter((t) => ehMinha(t) && !/^(cob|parc|aco):/.test(t.chave_regra || '') && t.status !== 'revisao');
  const validar = T.filter((t) => t.status === 'revisao' && t.revisor && primeiroNome(t.revisor) === eu);
  const h = hojeISO();
  const sec = [['🔁 Recorrentes', 'fazem e voltam sozinhas no próximo período (semana, mês ou ano)', minhas.filter((t) => t.recorrencia)],
    ['✔ Com validação', 'ao concluir, vão para quem valida; só fecham depois do "aprovado"', minhas.filter((t) => !t.recorrencia && t.exige_revisao)],
    ['📌 Únicas', 'fazem uma vez e acabou', minhas.filter((t) => !t.recorrencia && !t.exige_revisao)],
    ['🔎 Para eu validar', 'o que a equipe concluiu e espera o seu aprovado', validar]];
  const linha = (t, validando) => '<tr class="clicavel" data-tarefa="' + t.id + '"><td><b>' + esc(t.titulo) + '</b>' + (t.clientes ? '<div class="sub">' + esc(t.clientes.nome) + '</div>' : '') + '</td>' +
    '<td>' + (t.recorrencia ? '<span class="pill aberto">↻ ' + esc(REPETE[t.recorrencia] || t.recorrencia) + '</span>' : '<span class="sub">—</span>') + '</td>' +
    '<td>' + (t.exige_revisao || validando ? '<span class="pill hoje">valida: ' + esc(t.revisor || '—') + '</span>' : '<span class="sub">—</span>') + '</td>' +
    '<td>' + (t.prazo ? '<span class="' + (t.prazo < h ? 'dias-r' : t.prazo === h ? 'dias-a' : '') + '">' + dataBR(t.prazo) + '</span>' : '—') + '</td>' +
    '<td class="acoes-l">' + (validando ? '<button type="button" class="btn btn-v btn-mini" data-rt-ok="' + t.id + '">✓ Abrir e validar</button>'
      : '<button type="button" class="btn btn-v btn-mini" data-rt-concluir="' + t.id + '">' + (t.exige_revisao ? '✓ Concluir e enviar' : '✓ Concluir') + '</button>') + '</td></tr>';
  el.innerHTML = '<div class="card"><div class="card-hd">✓ Minhas tarefas<span class="sub">recorrentes voltam sozinhas; com validação vão para quem valida</span>' +
      '<span class="gd-hd-ac"><button type="button" class="btn btn-o btn-mini" id="rt-nova-rec">+ Tarefa recorrente</button><button type="button" class="btn btn-p btn-mini" id="rt-nova-t">+ Tarefa</button></span></div><div class="card-bd">' +
    sec.map(([tit, sub, L], k) => '<div class="rt-tsec"><div class="rt-tsec-tit">' + tit + ' <span class="pill neutro">' + L.length + '</span><span class="sub">' + sub + '</span></div>' +
      (L.length ? '<div class="tabela-wrap" data-sem-pagina><table class="rt-ttab"><thead><tr><th>Tarefa</th><th>Repete</th><th>Validação</th><th>Prazo</th><th></th></tr></thead><tbody>' + L.map((t) => linha(t, k === 3)).join('') + '</tbody></table></div>'
        : '<div class="sub" style="padding:4px 2px 10px">Nada aqui.</div>') + '</div>').join('') + '</div></div>';
  const rep = () => rotinaTarefas(el);
  $('rt-nova-t').onclick = () => formTarefa({}, rep);
  $('rt-nova-rec').onclick = () => formTarefa({ recorrencia: 'mensal', responsavel: (E.perfil && E.perfil.nome) || '' }, rep);
  el.querySelectorAll('[data-tarefa]').forEach((tr) => tr.onclick = (ev) => { if (ev.target.closest('button')) return; abrirTarefa(tr.dataset.tarefa, rep); });
  el.querySelectorAll('[data-rt-ok]').forEach((b) => b.onclick = () => abrirTarefa(b.dataset.rtOk, rep));
  el.querySelectorAll('[data-rt-concluir]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const t = T.find((x) => x.id === b.dataset.rtConcluir);
    if ((t.checklist || []).some((c) => !c.feito)) return abrirTarefa(t, rep);
    if (t.exige_revisao) { await q(sb.from('tarefas').update({ status: 'revisao' }).eq('id', t.id)); aviso('✓ Enviada para validação de ' + (t.revisor || 'quem valida') + '.'); }
    else { await concluirTarefa(t.id); aviso(t.recorrencia ? '✓ Concluída — ela volta sozinha ' + (REPETE[t.recorrencia] || '') + '.' : '✓ Tarefa concluída.'); }
    await rep();
  }));
}

'use strict';
// ═══════════════════════════════════════════════════════════════════
// Relatório em PDF (Backup 29) — refeito do zero no desenho novo.
// Escolhe o grupo (ou todos) e as seções; abre a prévia numa aba com o botão "Salvar em PDF".
// Lê direto do banco: passivo das empresas, parcelamentos, acordos, processos, vencimentos e honorários.
// ═══════════════════════════════════════════════════════════════════
const SECOES_PDF = [['passivo', 'Passivo tributário por empresa', true], ['parcelamentos', 'Parcelamentos', true], ['acordos', 'Acordos', true],
  ['processos', 'Processos judiciais', true], ['vencimentos', 'Vencimentos dos próximos 30 dias', true], ['honorarios', 'Honorários (a receber e em atraso)', false]];

function janelaRelatorioPDF() {
  const j = abrirJanela({ titulo: '📄 Relatório em PDF',
    corpo: '<div class="grade">' + campo('Grupo', '<select id="rp-grupo"><option value="">Todos os grupos (carteira inteira)</option>' + E.grupos.map((g) => '<option value="' + g.id + '">' + esc(g.nome) + '</option>').join('') + '</select>', 'inteiro') +
      '<div class="inteiro"><div class="secao">O que entra no relatório</div><div class="rp-secoes">' + SECOES_PDF.map(([k, r, on]) =>
        '<label class="check"><input type="checkbox" data-rp="' + k + '"' + (on ? ' checked' : '') + '> ' + r + '</label>').join('') + '</div></div>' +
      '<div class="dica inteiro">Abre a prévia numa aba nova. Lá, clique em <b>Salvar em PDF</b> (ou Ctrl+P → "Salvar como PDF").</div></div>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="rp-gerar">📄 Gerar relatório</button></div>' });
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#rp-gerar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const w = window.open('', '_blank');
    if (!w) throw new Error('O navegador bloqueou a aba nova: permita pop-ups para este site e tente de novo.');
    w.document.write('<p style="font-family:sans-serif;padding:30px">Montando o relatório…</p>');
    const grupo = j.querySelector('#rp-grupo').value, sec = {};
    j.querySelectorAll('[data-rp]').forEach((c) => { sec[c.dataset.rp] = c.checked; });
    try { const html = await montarRelatorioPDF(grupo, sec); w.document.open(); w.document.write(html); w.document.close(); fecharJanela(j); }
    catch (e) { w.close(); throw e; }
  });
  return j;
}

async function montarRelatorioPDF(grupoId, sec) {
  await carregarCadastros();
  const h = hojeISO(), lim30 = somarDias(h, 30), g = E.grupos.find((x) => x.id === grupoId);
  const doGrupo = (qq) => (grupoId ? qq.eq('grupo_id', grupoId) : qq);
  const [parcs, acs, procs, lancs] = await Promise.all([
    sec.parcelamentos || sec.vencimentos ? buscarTodos(() => doGrupo(sb.from('parcelamentos').select('id, empresa, natureza, local, numero, total_parcelas, valor_ultima_parcela, grupo_id, grupos(nome), parcelas(numero, vencimento, pago)'))).catch(() => []) : [],
    sec.acordos || sec.vencimentos ? buscarTodos(() => doGrupo(sb.from('acordos').select('id, devedor, credor, processo, parcela, total_parcelas, valor, vencimento, pago, grupo_id'))).catch(() => []) : [],
    sec.processos ? buscarTodos(() => doGrupo(sb.from('processos').select('numero, natureza, competencia, autor, reu, valor, status, ultima_movimentacao, ultima_movimentacao_em, grupos(nome)'))).catch(() => []) : [],
    sec.honorarios ? buscarTodos(() => doGrupo(sb.from('lancamentos').select('descricao, valor, vencimento, empresa, redutor, grupos(nome), clientes(nome)').eq('tipo', 'receita').eq('pago', false).eq('perda', false))).catch(() => []) : []
  ]);
  const cli = E.clientes.filter((c) => (!grupoId || c.grupo_id === grupoId) && c.tipo !== 'Inativo');
  const n = (v) => Number(v) || 0, R = (v) => (n(v) ? brl(v) : '—');
  const aberto = (c) => n(c.rfb) + n(c.pgfn) + n(c.age_mg) + n(c.sefaz_mg), neg = (c) => n(c.rfb_negociada) + n(c.pgfn_negociada) + n(c.age_mg_negociada);
  const totAb = cli.reduce((s, c) => s + aberto(c), 0), totNeg = cli.reduce((s, c) => s + neg(c), 0);
  // parcelamentos: pagas, atraso, próxima
  const P = parcs.map((p) => { const ps = p.parcelas || [], ab = ps.filter((x) => !x.pago).sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
    return Object.assign(p, { pagas: ps.filter((x) => x.pago).length, atr: ab.filter((x) => x.vencimento < h).length, prox: ab.find((x) => x.vencimento >= h) || null, abertas: ab }); })
    .filter((p) => p.abertas.length);
  // acordos: agrupados por devedor × credor × processo
  const AG = {}; acs.forEach((a) => { const k = [a.devedor, a.credor, a.processo].join('|'); (AG[k] = AG[k] || { a, l: [] }).l.push(a); });
  const A = Object.values(AG).map((x) => { const ab = x.l.filter((y) => !y.pago).sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
    return { a: x.a, pagas: x.l.length - ab.length, total: x.l.length, saldo: ab.reduce((s, y) => s + n(y.valor), 0), atr: ab.filter((y) => y.vencimento < h).length, prox: ab.find((y) => y.vencimento >= h) || null }; })
    .filter((x) => x.saldo > 0);
  const venc = [].concat(
    P.flatMap((p) => p.abertas.filter((x) => x.vencimento <= lim30).map((x) => ({ d: x.vencimento, tipo: 'Parcelamento', quem: p.empresa, det: [p.local, p.natureza].filter(Boolean).join(' — ') + ' · parcela ' + x.numero + (p.total_parcelas ? '/' + p.total_parcelas : ''), v: n(p.valor_ultima_parcela) }))),
    acs.filter((a) => !a.pago && a.vencimento <= lim30).map((a) => ({ d: a.vencimento, tipo: 'Acordo', quem: a.devedor, det: 'deve a ' + (a.credor || '—') + ' · parcela ' + (a.parcela || '') + (a.total_parcelas ? '/' + a.total_parcelas : ''), v: n(a.valor) })))
    .sort((a, b) => String(a.d).localeCompare(String(b.d)));
  const atrParc = P.reduce((s, p) => s + p.atr, 0), atrAc = A.reduce((s, x) => s + x.atr, 0);
  const tab = (cab, linhas, dir, total) => '<table><thead><tr>' + cab.map((c, i) => '<th' + (dir && dir.includes(i) ? ' class="r"' : '') + '>' + c + '</th>').join('') + '</tr></thead><tbody>' +
    (linhas.length ? linhas.map((l) => '<tr>' + l.map((v, i) => '<td' + (dir && dir.includes(i) ? ' class="r"' : '') + '>' + v + '</td>').join('') + '</tr>').join('') : '<tr><td colspan="' + cab.length + '" class="vazio">Nada a mostrar.</td></tr>') +
    (total ? '<tr class="tot">' + total.map((v, i) => '<td' + (dir && dir.includes(i) ? ' class="r"' : '') + '>' + v + '</td>').join('') + '</tr>' : '') + '</tbody></table>';
  const pill = (t, c) => '<span class="p ' + c + '">' + esc(t) + '</span>';
  const capag = (v) => v ? pill(v, { A: 'ok', B: 'ok', C: 'at', D: 'rv', OMISSO: 'rv' }[String(v).toUpperCase()] || 'nx') : '—';
  const S = [];
  if (sec.passivo) S.push(['Passivo tributário por empresa', cli.length + ' empresa(s) ativa(s)', tab(['Empresa', 'CNPJ', 'RFB', 'PGFN', 'AGE/MG', 'SEFAZ/MG', 'Negociado', 'CAPAG'],
    cli.sort((a, b) => aberto(b) - aberto(a)).map((c) => ['<b>' + esc(c.nome) + '</b>' + (!grupoId && c.grupos ? '<div class="s">' + esc(c.grupos.nome) + '</div>' : ''), esc(mascaraDoc(c.cpf_cnpj) || '—'), R(c.rfb), R(c.pgfn), R(c.age_mg), R(c.sefaz_mg), R(neg(c)), capag(c.capag)]),
    [2, 3, 4, 5, 6], ['<b>Total</b>', '', R(cli.reduce((s, c) => s + n(c.rfb), 0)), R(cli.reduce((s, c) => s + n(c.pgfn), 0)), R(cli.reduce((s, c) => s + n(c.age_mg), 0)), R(cli.reduce((s, c) => s + n(c.sefaz_mg), 0)), R(totNeg), ''])]);
  if (sec.parcelamentos) S.push(['Parcelamentos', P.length + ' em andamento' + (atrParc ? ' · ' + atrParc + ' parcela(s) em atraso' : ''), tab(['Empresa', 'Órgão / natureza', 'Nº', 'Pagas', 'Próxima parcela', 'Situação'],
    P.map((p) => ['<b>' + esc(p.empresa || '—') + '</b>', esc([p.local, p.natureza].filter(Boolean).join(' — ') || '—'), esc(p.numero || '—'), p.pagas + ' de ' + (p.total_parcelas || (p.parcelas || []).length),
      p.prox ? dataBR(p.prox.vencimento) + ' · ' + R(p.valor_ultima_parcela) : '—', p.atr ? pill(p.atr + ' em atraso' + (p.atr >= 2 ? ' — risco' : ''), 'rv') : pill('Em dia', 'ok')]), [])]);
  if (sec.acordos) S.push(['Acordos', A.length + ' em andamento' + (atrAc ? ' · ' + atrAc + ' parcela(s) em atraso' : ''), tab(['Devedor', 'Credor', 'Processo', 'Pagas', 'Saldo', 'Próxima', 'Situação'],
    A.map((x) => ['<b>' + esc(x.a.devedor || '—') + '</b>', esc(x.a.credor || '—'), esc(x.a.processo || '—'), x.pagas + ' de ' + x.total, R(x.saldo), x.prox ? dataBR(x.prox.vencimento) + ' · ' + R(x.prox.valor) : '—',
      x.atr ? pill(x.atr + ' em atraso', 'rv') : pill('Em dia', 'ok')]), [4], ['<b>Total</b>', '', '', '', R(A.reduce((s, x) => s + x.saldo, 0)), '', ''])]);
  if (sec.processos) S.push(['Processos judiciais', procs.length + ' processo(s)', tab(['Processo', 'Natureza', 'Competência', 'Partes', 'Valor da causa', 'Última movimentação'],
    procs.map((p) => ['<b class="m">' + esc(p.numero) + '</b>' + (!grupoId && p.grupos ? '<div class="s">' + esc(p.grupos.nome) + '</div>' : ''), esc(p.natureza || '—'), esc(p.competencia || '—'),
      esc([p.autor, p.reu].filter(Boolean).join(' × ') || '—'), R(p.valor), p.ultima_movimentacao ? esc(p.ultima_movimentacao) + (p.ultima_movimentacao_em ? '<div class="s">' + dataBR(p.ultima_movimentacao_em) + '</div>' : '') : '<span class="s">—</span>']),
    [4], ['<b>Total</b>', '', '', '', R(procs.reduce((s, p) => s + n(p.valor), 0)), ''])]);
  if (sec.vencimentos) S.push(['Vencimentos dos próximos 30 dias', 'inclui o que já venceu e não foi pago', tab(['Vencimento', 'Tipo', 'Empresa / devedor', 'Detalhe', 'Valor'],
    venc.map((x) => [(x.d < h ? '<b class="rv-t">' : '<b>') + dataBR(x.d) + '</b>', esc(x.tipo), esc(x.quem || '—'), esc(x.det), R(x.v)]), [4], ['<b>Total</b>', '', '', '', R(venc.reduce((s, x) => s + x.v, 0))])]);
  if (sec.honorarios) { const atr = lancs.filter((l) => l.vencimento < h), s2 = (l) => l.reduce((s, x) => s + (x.redutor ? -n(x.valor) : n(x.valor)), 0);
    S.push(['Honorários', 'a receber ' + brl(s2(lancs)) + ' · em atraso ' + brl(s2(atr)), tab(['Vencimento', 'Quem', 'Descrição', 'Empresa', 'Valor'],
      lancs.sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento))).map((l) => [(l.vencimento < h ? '<b class="rv-t">' : '<b>') + dataBR(l.vencimento) + '</b>', esc((l.grupos && l.grupos.nome) || (l.clientes && l.clientes.nome) || '—'),
        esc(l.descricao || ''), l.empresa === 'contabilidade' ? 'Contabilidade' : 'Jurídico', R(l.redutor ? -l.valor : l.valor)]), [4], ['<b>Total</b>', '', '', '', R(s2(lancs))])]); }
  const kpis = [['Passivo em aberto', brl(totAb), cli.length + ' empresa(s)', 'rv'], ['Negociado', brl(totNeg), 'parcelado ou em acordo', 'az'],
    ['Parcelamentos', String(P.length), atrParc ? atrParc + ' parcela(s) em atraso' : 'todos em dia', atrParc ? 'rv' : 'ok'], ['Acordos', String(A.length), 'saldo ' + brl(A.reduce((s, x) => s + x.saldo, 0)), atrAc ? 'at' : 'ok'],
    ['Processos', String(procs.length || '—'), sec.processos ? 'valor ' + brl(procs.reduce((s, p) => s + n(p.valor), 0)) : 'não incluído', 'az']];
  const titulo = 'Relatório — ' + (g ? g.nome : 'Carteira completa') + ' — ' + dataBR(h).replace(/\//g, '-');
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(titulo) + '</title>' +
    '<style>' + CSS_RELATORIO + '</style></head><body>' +
    '<div class="barra no-print"><span>Prévia do relatório</span><button onclick="window.print()">Salvar em PDF</button></div>' +
    '<main><header class="cab"><div><div class="marca">Araújo &amp; Castro</div><div class="sub-m">Advocacia · Contabilidade · Consultoria</div></div>' +
      '<div class="cab-d"><div class="t">' + esc(g ? g.nome : 'Carteira completa') + '</div><div>Relatório gerado em ' + dataHoraBR(new Date().toISOString()) + '</div></div></header>' +
    '<section class="kpis">' + kpis.map(([l, v, s, c]) => '<div class="kpi"><div class="kl"><i class="' + c + '"></i>' + l + '</div><div class="kv">' + v + '</div><div class="ks">' + esc(s) + '</div></div>').join('') + '</section>' +
    S.map(([t, d, corpo]) => '<section class="sec"><h2>' + esc(t) + '<small>' + esc(d) + '</small></h2>' + corpo + '</section>').join('') +
    '<footer>Relatório do sistema do escritório Araújo &amp; Castro · dados de ' + dataBR(h) + ' · uso interno e do cliente</footer></main>' +
    '</body></html>';
}

// cores fixas (o PDF sai igual no modo claro ou escuro da tela)
const CSS_RELATORIO = [
  '@page{size:A4;margin:12mm 11mm}',
  '*{box-sizing:border-box}body{margin:0;background:#EEF1F6;font-family:"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1F2937;font-size:11.5px;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
  '.barra{position:sticky;top:0;display:flex;justify-content:space-between;align-items:center;padding:10px 18px;background:#1B2A4A;color:#fff;z-index:5}',
  '.barra button{background:#C9A84C;color:#1B2A4A;border:0;border-radius:8px;padding:8px 16px;font-weight:700;cursor:pointer}',
  'main{max-width:1000px;margin:18px auto;background:#fff;padding:26px 30px;border-radius:12px;box-shadow:0 2px 14px rgba(0,0,0,.08)}',
  '.cab{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #C9A84C;padding-bottom:12px;margin-bottom:16px}',
  '.marca{font-family:Georgia,serif;font-size:22px;font-weight:700;color:#1B2A4A}.sub-m{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:#6B7280;margin-top:2px}',
  '.cab-d{text-align:right;color:#6B7280;font-size:10.5px}.cab-d .t{font-size:16px;font-weight:700;color:#1B2A4A;text-transform:uppercase;margin-bottom:2px}',
  '.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:18px}',
  '.kpi{border:1px solid #E5E7EB;border-radius:10px;padding:9px 11px;break-inside:avoid}.kl{font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6B7280;display:flex;align-items:center;gap:5px}',
  '.kl i{width:7px;height:7px;border-radius:50%;display:inline-block;background:#9CA3AF}.kl i.rv{background:#B42318}.kl i.ok{background:#1E7B45}.kl i.at{background:#B7791F}.kl i.az{background:#2E4C81}',
  '.kv{font-size:15px;font-weight:700;color:#1B2A4A;margin-top:3px}.ks{font-size:9.5px;color:#6B7280;margin-top:1px}',
  '.sec{margin-top:16px}h2{font-size:13px;color:#1B2A4A;margin:0 0 7px;display:flex;align-items:baseline;gap:8px;break-after:avoid}h2 small{font-size:10px;font-weight:400;color:#6B7280}',
  'table{width:100%;border-collapse:collapse;font-size:10.5px}thead{display:table-header-group}th{background:#F3F5F9;color:#374151;text-align:left;font-size:9px;letter-spacing:.05em;text-transform:uppercase;padding:6px 7px;border-bottom:1px solid #D9DEE7}',
  'td{padding:6px 7px;border-bottom:1px solid #EEF0F4;vertical-align:top}tr{break-inside:avoid}.r{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}',
  'tr.tot td{border-top:2px solid #1B2A4A;border-bottom:0;font-weight:700;background:#FAFBFD}.vazio{color:#9CA3AF;text-align:center;padding:12px}',
  '.s{font-size:9.5px;color:#6B7280;margin-top:1px}.m{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10px}.rv-t{color:#B42318}',
  '.p{display:inline-block;padding:1px 8px;border-radius:99px;font-size:9.5px;font-weight:700;border:1px solid}.p.ok{background:#E8F5EC;color:#1E7B45;border-color:#B7DFC3}.p.rv{background:#FDECEA;color:#B42318;border-color:#F4C2BC}.p.at{background:#FFF6E0;color:#8A5A00;border-color:#F0D9A0}.p.nx{background:#F3F4F6;color:#6B7280;border-color:#E5E7EB}',
  'footer{margin-top:22px;padding-top:8px;border-top:1px solid #E5E7EB;font-size:9px;color:#9CA3AF;text-align:center}',
  '@media print{body{background:#fff}.no-print{display:none!important}main{box-shadow:none;margin:0;max-width:none;padding:0;border-radius:0}}'
].join('\n');

// toda gravação confirmada aparece também no rodapé do ERP
const _avisoOrig = aviso;
aviso = function (msg, erro) { _avisoOrig(msg, erro); if (!erro && window.ERP_EDITOR && /^✓/.test(msg)) window.ERP_EDITOR.gravou(String(msg).replace(/^✓\s*/, '')); };
window.GS = { TELAS, E, irPara, carregarCadastros, formLancamento, formCliente, formContrato, formTarefa, tabelaLancamentos, ligarAcoesLancamentos, abrirJanela, fecharJanela, abrirFicha, invalidarCadastros, blocoDocumentos, abrirAlertas, contarAlertas, pode, janelaMeusAvisos, formOportunidade, detalheAcordo, perguntarBaixa, detalheContrato, ICONE_AVISO, conciliarOfx, abrirTarefa, detalheLancamento, edicaoLancamentos, janelaModelosEmail, janelaAutoEmails, janelaGeradores, formReuniao, janelaDelegar, abrirGeradorContrato, cardGuias, emitirParcela, enviarAcordosSelecionados, gerarGuias, janelaMovimentacao, janelaRelatorioPDF };
})();
