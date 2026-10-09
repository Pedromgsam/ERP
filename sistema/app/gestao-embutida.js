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
  ['relatorios', 'Relatórios', 'Painel Executivo']
];
// Backup 53: o que cada nível libera, em palavras simples (aparece em Administração → Usuários)
const FUNCOES_DETALHE = {
  financeiro_juridico: ['Vê o Financeiro do Jurídico (a receber, recebidos, despesas), os cartões de dinheiro do Início e os recibos.', 'Lança, edita e dá baixa (pago) em receitas e despesas do Jurídico, cobra pelo WhatsApp/e-mail e emite recibo.'],
  financeiro_contab: ['Vê o Financeiro da Contabilidade e os cartões dela no Início.', 'Lança, edita e dá baixa nos honorários e despesas da Contabilidade.'],
  contratos: ['Vê os contratos, aditivos, reajustes e as parcelas que eles geraram.', 'Cria e edita contratos (inclusive implantação), registra aditivo, rescinde e marca como assinado.'],
  clientes: ['Vê a lista de clientes e a ficha completa (contatos, sócios, documentos, histórico).', 'Cadastra e edita clientes, contatos e contas; liga/desliga os e-mails do cliente.'],
  juridico: ['Vê Processos, Parcelamentos, Acordos, Execuções, Publicações e a Rotina.', 'Edita tudo isso: registra movimentação, emite guias, dá baixa em parcelas, envia e-mails de guias/acordos.'],
  tarefas: ['Vê as tarefas de toda a equipe, os fluxos e os modelos (as próprias tarefas todos veem sempre).', 'Cria, delega e edita tarefas de qualquer pessoa, fluxos e modelos.'],
  documentos: ['Abre e baixa os documentos guardados.', 'Envia, organiza em pastas e apaga documentos; cadastra certificado digital.'],
  crm: ['Vê o funil, as oportunidades e as propostas.', 'Cria e move oportunidades, faz propostas e agenda reuniões.'],
  relatorios: ['Vê o Painel Executivo (passivo, evolução, empresas do grupo).', 'Mesmo que "Ver" (o Painel só mostra).']
};
const MODELOS_ACESSO = {
  'Sócio (tudo)': Object.fromEntries(FUNCOES.map((f) => [f[0], 'editar'])),
  'Financeiro': { financeiro_juridico: 'editar', financeiro_contab: 'editar', contratos: 'editar', clientes: 'ver', documentos: 'editar', relatorios: 'ver' },
  'Jurídico': { juridico: 'editar', clientes: 'editar', tarefas: 'editar', documentos: 'editar', contratos: 'ver' },
  'Atendimento / Comercial': { crm: 'editar', clientes: 'editar', contratos: 'ver', documentos: 'editar', tarefas: 'ver' },
  'Estagiário': { juridico: 'editar', clientes: 'editar', tarefas: 'editar', documentos: 'ver', contratos: 'ver' },
  'Adm. da Contabilidade': { financeiro_contab: 'editar', clientes: 'editar', contratos: 'editar', documentos: 'editar', tarefas: 'editar', relatorios: 'ver' },
  // Backup 45: mais modelos prontos
  'Coordenador(a) jurídico': { juridico: 'editar', clientes: 'editar', tarefas: 'editar', documentos: 'editar', contratos: 'ver', crm: 'ver', relatorios: 'ver' },
  'Advogado(a)': { juridico: 'editar', clientes: 'editar', tarefas: 'ver', documentos: 'editar', contratos: 'ver' },
  'Assistente administrativo': { clientes: 'editar', documentos: 'editar', tarefas: 'ver', contratos: 'ver', financeiro_juridico: 'ver' },
  'Contador(a)': { financeiro_contab: 'editar', clientes: 'editar', documentos: 'editar', tarefas: 'ver', relatorios: 'ver' }
};
// Backup 45: cargo = hierarquia (5 = sócio … 1 = estagiário). Quem está abaixo não vê a agenda de quem está acima; o administrador vê tudo.
const CARGOS = [['', '— sem cargo —', 2], ['socio', 'Sócio(a)', 5], ['coordenador', 'Coordenador(a)', 4], ['advogado', 'Advogado(a)', 3], ['contador', 'Contador(a)', 3],
  ['assistente', 'Assistente / Analista', 2], ['estagiario', 'Estagiário(a)', 1]];
const nivelCargo = (cargo, papel) => (papel === 'admin' && !cargo ? 5 : ((CARGOS.find((c) => c[0] === (cargo || '')) || CARGOS[0])[2]));
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
  return v === 'editar' || (v === 'ver' && n === 'ver');
}
function resumoFuncoes(p) {
  if (p.papel === 'admin') return 'tudo';
  const f = p.funcoes || {}, ks = FUNCOES.filter((x) => f[x[0]]);
  if (ks.length === FUNCOES.length && ks.every((x) => f[x[0]] === 'editar')) return 'tudo';
  return ks.map((x) => x[1].replace('Financeiro — ', 'Fin. ') + (f[x[0]] === 'ver' ? ' (ver)' : '')).join(' · ') + (p.areas && p.areas !== 'ambos' ? ' · só ' + rotArea(p.areas) : '') || 'nenhuma';
}
// grade de funções (Nenhum / Ver / Editar) com os modelos prontos
function gradeFuncoes(funcoes) {
  funcoes = funcoes || {};
  return '<div class="modelos-acesso">' + Object.keys(MODELOS_ACESSO).map((m) => '<button type="button" class="btn btn-o btn-mini" data-modelo-acesso="' + esc(m) + '">' + esc(m) + '</button>').join('') + '</div>' +
    '<div class="gf-legenda sub"><b>Nenhum</b> = a pessoa nem vê o menu · <b>Ver</b> = só olha, sem mudar nada · <b>Editar</b> = vê e altera. Clique em “o que libera” para ver o detalhe.</div>' +
    '<div class="grade-funcoes">' + FUNCOES.map(([k, rot, desc]) => '<div class="gf-lin"><div><b>' + rot + '</b><div class="sub">' + desc + '</div>' +
      (FUNCOES_DETALHE[k] ? '<details class="gf-mais"><summary>o que libera</summary><div><b>Ver:</b> ' + FUNCOES_DETALHE[k][0] + '</div><div><b>Editar:</b> ' + FUNCOES_DETALHE[k][1] + '</div></details>' : '') +
      '</div><div class="segmento gf-niveis" data-funcao="' + k + '">' +
      [['', 'Nenhum'], ['ver', 'Ver'], ['editar', 'Editar']].map(([v, r]) => '<button type="button" data-v="' + v + '" class="' + ((funcoes[k] || '') === v ? 'ativo' : '') + '">' + r + '</button>').join('') + '</div></div>').join('') + '</div>';
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
  } catch (e) { throw new Error('Não consegui falar com a função "' + nome + '". No Supabase, o endereço da função (aparece embaixo do nome dela) tem que terminar em /functions/v1/' + nome +
    ' — se terminar em outra palavra (ex.: /super-worker), mudar o nome não adianta: crie uma função NOVA com o nome ' + nome + ' e cole o código nela. Outras causas: "Verify JWT" ligado (tem que ficar desligado) ou sem internet.'); }
  const txt = await r.text(); let js = null;
  try { js = JSON.parse(txt); } catch (e) { /* resposta sem JSON */ }
  if (r.ok) return js || {};
  const det = (js && (js.erro || js.message || js.msg || js.error)) || txt.slice(0, 200);
  if (r.status === 404) throw new Error('A função "' + nome + '" não foi encontrada no Supabase: o endereço dela tem que terminar em /functions/v1/' + nome + '. Se ela foi criada com outro nome (o endereço não muda quando se renomeia), crie uma função nova chamada ' + nome + '.');
  if ((r.status === 401 || r.status === 403) && !(js && js.erro)) throw new Error('O Supabase recusou a chamada da função "' + nome + '": abra a função no Supabase → Details e desligue "Verify JWT" (Enforce JWT verification). Detalhe: ' + det);
  if (js && js.erro) throw new Error(js.erro);
  if (r.status >= 500) throw new Error('A função "' + nome + '" existe, mas deu erro ao rodar (' + r.status + '): ' + det + '. Confira se o arquivo foi colado inteiro e publique de novo.');
  throw new Error('A função "' + nome + '" respondeu ' + r.status + ': ' + det);
}
// Backup 42: depois de pôr um e-mail na fila, manda JÁ (sem esperar a rotina de 5 min) e devolve a frase com o que aconteceu de verdade.
// {ok, msg}: ok = saiu; senão msg diz o motivo (serviço não configurado, senha recusada pelo Gmail, função não publicada…)
async function enviarEmailAgora(ref, para) {
  let d;
  try { d = await chamarFuncao('erp-emails', { acao: 'enviar', ref: ref || undefined }); }
  catch (e) {
    // Backup 43: o navegador não alcançou a função → pede ao servidor (banco) para chamar a função por dentro, sem passar pelo navegador
    const viaServidor = await q(sb.rpc('disparar_envio_emails')).catch(() => false);
    return { ok: false, msg: 'o e-mail ficou na fila. ' + (viaServidor ? 'O navegador não alcançou a função de e-mail, então pedi ao servidor para enviar — confira em alguns segundos em Administração → E-mail. '
      : '') + 'Motivo: ' + e.message + ' Veja Administração → E-mail → "O e-mail está saindo?".' };
  }
  const it = d && d.item;
  if (it && it.status === 'enviado') return { ok: true, msg: 'e-mail enviado para ' + (it.para || para || '') + '.' };
  if (d && d.aviso) return { ok: false, msg: 'o e-mail ficou na fila e NÃO saiu: ' + d.aviso };
  if (it && it.status === 'retido') return { ok: false, msg: 'o e-mail ficou retido (envio pausado). Veja Administração → E-mail.' };
  if (it && it.erro) return { ok: false, msg: 'o e-mail NÃO saiu: ' + explicarErroEmail(it.erro) + (it.status === 'pendente' ? ' (vai tentar de novo)' : '') };
  return { ok: !it, msg: it ? 'e-mail na fila para ' + (it.para || para || '') + '.' : 'e-mail enviado.' };
}
// Backup 44: o e-mail já está na fila com status 'rascunho' → a função grava na pasta Rascunhos do Gmail (não envia)
async function salvarRascunhoAgora(ref) {
  let d;
  try { d = await chamarFuncao('erp-emails', { acao: 'rascunho', ref }); }
  catch (e) { return { ok: false, msg: 'o rascunho NÃO foi salvo. ' + e.message }; }
  if (d && d.aviso) return { ok: false, msg: 'o rascunho NÃO foi salvo: ' + d.aviso };
  const it = d && d.item;
  if (it && it.status === 'rascunho_salvo') return { ok: true, msg: 'rascunho salvo no Gmail' + (d.pasta ? ' (pasta ' + d.pasta + ')' : '') + ' — abra o Gmail, confira e clique em Enviar.' };
  return { ok: false, msg: 'o rascunho NÃO foi salvo: ' + explicarErroEmail((it && it.erro) || d.ultimoErro || 'motivo desconhecido') };
}
// a mensagem técnica do Gmail/SMTP em português simples
function explicarErroEmail(e) {
  const s = String(e || '');
  if (/535|Username and Password not accepted|Invalid login|BadCredentials/i.test(s)) return 'o Gmail recusou o login — use uma "senha de app" (16 letras) em Administração → E-mail, não a senha normal.';
  if (/ETIMEDOUT|ECONNREFUSED|getaddrinfo|ENOTFOUND/i.test(s)) return 'não consegui falar com o servidor de e-mail (confira o servidor/porta em Administração → E-mail).';
  if (/Resend recusou/i.test(s)) return s + ' — confira a chave e o domínio no Resend.';
  return s;
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
const ROTULO_SIT = { pago: 'Pago', vencido: 'Em atraso', hoje: 'Vence hoje', aberto: 'A vencer', perda: 'Prejuízo' };   // Backup 52 (P4): os mesmos textos de SITUACOES
const SIT_DE_PILL = { pago: 'pago', vencido: 'atraso', hoje: 'hoje', aberto: 'avencer' };
function pillSit(l) {
  const s = situacao(l);
  const rot = s === 'pago' && l.tipo === 'receita' ? 'Recebido' : ROTULO_SIT[s];
  return '<span class="pill ' + s + '"' + (SIT_DE_PILL[s] ? ' data-sit="' + SIT_DE_PILL[s] + '"' : '') + '>' + rot + '</span>' +
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
// Backup 40: reconhece a pessoa pelo primeiro nome, sem diferença de maiúscula/acento ("PEDRO", "Pedro Castro", "escritorio")
const _semAc = (s) => String(s || '').trim().split(/\s+/)[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function corPessoa(n) {
  const k = Object.keys(PESSOA).find((p) => p === String(n || '').trim()) || Object.keys(PESSOA).find((p) => _semAc(p) === _semAc(n));
  return PESSOA[k] || { fundo: '#EEF1F7', marca: '#6B7280', texto: '#4B5563' };
}
function pillPessoa(n) {
  if (!n) return '<span class="sub">—</span>';
  const c = corPessoa(n);
  return '<span class="pill pill-pessoa" style="background:' + c.fundo + ';color:' + c.texto + '">' + esc(n) + '</span>';
}

// ─────────────────────────── avisos e erros ────────────────────────
let _avisoT;
// Backup 52 (P4): situações com UM texto e UMA cor em todo o ERP (Parcelamentos, Acordos, Financeiro e Rotina).
// As cores ficam no design.css ([data-sit=…]); quem desenha uma situação usa pillSituacao ou põe data-sit no elemento.
const SITUACOES = { atraso: 'em atraso', hoje: 'vence hoje', avencer: 'a vencer', pago: 'pago', cliente: 'cliente emite' };
function situacaoDe(vencimento, pago) { const h = hojeISO(); return pago ? 'pago' : !vencimento ? 'avencer' : vencimento < h ? 'atraso' : vencimento === h ? 'hoje' : 'avencer'; }
function pillSituacao(k, texto) { return '<span class="pill pill-sit" data-sit="' + k + '">' + esc(texto || SITUACOES[k] || k) + '</span>'; }
// Backup 52 (P2): o botão "↻ Atualizar" é um só em todo o ERP (mesmo estilo; fica à direita do cabeçalho do quadro)
function botaoAtualizar(id, titulo) {
  return '<button type="button" class="btn btn-o btn-mini bt-atualizar" id="' + id + '" title="' + esc(titulo || 'Busca tudo de novo no banco') + '">↻ Atualizar</button>';
}
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
    console.error(e); aviso(erroAmigavel(e), true);
  }
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
// Backup 63 (reforma): a janela no CENTRO é a única para criar, editar e ver detalhes — kick (linha azul acima do título),
// sub (linha cinza abaixo) e dir (selo/pílula à direita, antes do ×) são opcionais
function abrirJanela({ titulo, corpo, rodape, larga, kick, sub, dir }) {
  const fundo = document.createElement('div');
  fundo.className = 'fundo';
  fundo.innerHTML =
    '<div class="janela' + (larga ? ' larga' : '') + '" role="dialog" aria-modal="true">' +
    '<div class="janela-hd">' + (kick || sub ? '<div class="j-tit">' + (kick ? '<span class="j-kick">' + esc(kick) + '</span>' : '') : '') + '<h2>' + esc(titulo) + '</h2>' +
    (kick || sub ? (sub ? '<small class="j-sub">' + sub + '</small>' : '') + '</div>' : '') + (dir ? '<div class="j-dir">' + dir + '</div>' : '') +
    '<button type="button" data-fechar aria-label="Fechar">×</button></div>' +
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
// ═══ Backup 63 (reforma, etapa 2): peças únicas do desenho novo (tela-modelo sistema/prototipos/guia-visual.html) ═══
// Toda tela refeita usa estas peças — o estilo fica em base.css (classes b-*). Nada de estilo inline nas telas.
const ICONES_B = {
  alerta: '<path d="M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  documento: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  pizza: '<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
  camadas: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  ok: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 5-5"/>',
  busca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  atualizar: '<path d="M20 11a8 8 0 0 0-14.7-4.3L3 9m0-5v5h5M4 13a8 8 0 0 0 14.7 4.3L21 15m0 5v-5h-5"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>'
};
function iconeB(k) { return '<svg class="b-ic" viewBox="0 0 24 24" aria-hidden="true">' + (ICONES_B[k] || '') + '</svg>'; }
// 1) cabeçalho da tela: ícone + título + frase; à direita "Atualizar" e o botão principal
function cabecalhoTela({ icone, titulo, frase, atualizar, botao }) {
  return '<div class="b-cab"><div class="b-cab-ic">' + iconeB(icone || 'camadas') + '</div><div class="b-cab-tx"><h1>' + esc(titulo) + '</h1>' + (frase ? '<p>' + esc(frase) + '</p>' : '') + '</div>' +
    '<div class="b-cab-acoes">' + (atualizar ? '<button type="button" class="b-link" id="' + esc(atualizar) + '">' + iconeB('atualizar') + 'Atualizar</button>' : '') +
    (botao ? '<button type="button" class="btn btn-p b-bt" id="' + esc(botao.id) + '">' + iconeB('mais') + esc(botao.rotulo) + '</button>' : '') + '</div></div>';
}
// 2) cartões de número: [{icone, cor: r|b|a|g, rotulo, valor, comp (texto menor ao lado), sub, barra (0–100), linhas: [[valor, rótulo, verde?]]}]
function cartoesNumero(lista) {
  return '<div class="b-kpis b-kpis-' + lista.length + '">' + lista.map((c) => '<div class="b-kpi"' + (c.id ? ' id="' + esc(c.id) + '"' : '') + '><div class="b-kpi-ic b-' + (c.cor || 'b') + '">' + iconeB(c.icone || 'ok') + '</div><div class="b-kpi-tx">' +
    '<div class="b-kpi-l">' + esc(c.rotulo) + '</div>' +
    (c.linhas ? '<div class="b-kpi-linhas">' + c.linhas.map((l) => '<div><span class="b-kpi-v' + (l[2] ? ' b-verde' : '') + '">' + esc(l[0]) + '</span><span class="b-kpi-s">' + esc(l[1]) + '</span></div>').join('') + '</div>'
      : '<div class="b-kpi-v' + (c.cor === 'r' && c.valor && c.valor !== '0' ? ' b-verm' : '') + '">' + esc(c.valor) + (c.comp ? ' <small>' + esc(c.comp) + '</small>' : '') + '</div>') +
    (c.barra != null ? '<div class="b-barra' + (c.cor === 'a' ? ' b-barra-a' : '') + '"><span style="width:' + Math.max(0, Math.min(100, Math.round(c.barra))) + '%"></span></div>' : '') +
    (c.sub ? '<div class="b-kpi-s">' + c.sub + '</div>' : '') + '</div></div>').join('') + '</div>';
}
// 3) abas sublinhadas com contador e os filtros à direita, na mesma linha (sem cartão)
function barraAbas({ abas, ativa, filtros, attr }) {
  const a = attr || 'data-b-aba';
  return '<div class="b-abas-linha"><div class="b-abas" role="tablist">' + abas.map((x) => '<button type="button" role="tab" class="b-aba" ' + a + '="' + esc(x.id) + '" aria-selected="' + (x.id === ativa) + '">' +
    esc(x.rotulo) + (x.n != null ? '<span class="b-aba-n' + (x.cor ? ' b-' + x.cor : '') + '">' + x.n + '</span>' : '') + '</button>').join('') + '</div>' +
    (filtros ? '<div class="b-filtros">' + filtros + '</div>' : '') + '</div>';
}
// campo de busca da barra de filtros
function buscaB(id, dica, valor) { return '<label class="b-busca">' + iconeB('busca') + '<input id="' + esc(id) + '" placeholder="' + esc(dica || 'Buscar') + '" aria-label="' + esc(dica || 'Buscar') + '" value="' + esc(valor || '') + '"></label>'; }
// 4) tabela leve: cabeçalho claro, ~12 linhas visíveis e o resto rolando (cabeçalho parado), clique na linha abre o detalhe/editar
//    colunas: [{rot, cls}] (cls: b-dir = dinheiro à direita, b-cen = centro) · linhas: [{attrs: 'data-x="…"', cels: [html]}]
function tabelaLeve({ titulo, resumo, colunas, linhas, vazio: v, id, clicavel }) {
  if (!linhas.length && v) return '<div class="b-quadro"' + (id ? ' id="' + esc(id) + '"' : '') + '>' + vazioB(v) + '</div>';
  return '<div class="b-quadro"' + (id ? ' id="' + esc(id) + '"' : '') + '>' + (titulo ? '<div class="b-quadro-hd"><h2>' + esc(titulo) + '</h2>' + (resumo ? '<span class="b-resumo">' + resumo + '</span>' : '') + '</div>' : '') +
    '<div class="b-rola" data-sem-pagina><table class="b-tab"><thead><tr>' + colunas.map((c) => '<th' + (c.cls ? ' class="' + c.cls + '"' : '') + '>' + esc(c.rot) + '</th>').join('') + '</tr></thead><tbody>' +
    linhas.map((l) => '<tr' + (clicavel !== false ? ' class="b-cl" tabindex="0"' : '') + (l.attrs ? ' ' + l.attrs : '') + '>' + l.cels.map((c, i) => '<td' + (colunas[i] && colunas[i].cls ? ' class="' + colunas[i].cls + '"' : '') + '>' + c + '</td>').join('') + '</tr>').join('') +
    '</tbody></table></div></div>';
}
// tela vazia que explica e oferece o próximo passo: {icone, titulo, frase, botao: {rotulo, seletor}}
function vazioB({ icone, titulo, frase, botao }) {
  return '<div class="b-vazio"><div class="b-vazio-ic">' + iconeB(icone || 'ok') + '</div><b>' + esc(titulo) + '</b>' + (frase ? '<p>' + esc(frase) + '</p>' : '') +
    (botao ? '<button type="button" class="btn btn-o" data-vazio-clica="' + esc(botao.seletor) + '">' + esc(botao.rotulo) + '</button>' : '') + '</div>';
}
// Enter na linha clicável = clique
document.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target && ev.target.matches && ev.target.matches('tr.b-cl')) ev.target.click(); });

// ═══ Backup 68 (reforma, etapa 3): as peças aprovadas no ambiente de teste (sistema/prototipos/ambiente-teste/pecas.js) ═══
// Valem para TODA tela refeita: cartões que abrem o detalhamento, tabela com abas, busca, listas, "Filtros" (vencimento e valor de/até),
// ordenar pelo título, total e média no rodapé, tabela compacta e marcar várias linhas para agir de uma vez (sempre com confirmação).
const ICONES_B2 = { filtro: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>', compacto: '<path d="M4 5h16M4 9.5h16M4 14h16M4 18.5h16"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>' };
Object.assign(ICONES_B, ICONES_B2);
// vencimento colorido: vermelho = em atraso (hoje conta como vencido), azul = a vencer; pago = data normal
function vencB(isoData, pago) {
  if (!isoData) return { cls: '', html: '—' };
  if (pago) return { cls: '', html: dataBR(isoData) };
  const d = Math.round((new Date(hojeISO() + 'T00:00:00') - new Date(isoData + 'T00:00:00')) / 864e5);
  return { cls: d >= 0 ? ' b-v-atr' : ' b-v-av', html: dataBR(isoData) + '<small>' + (d === 0 ? 'vence hoje' : d > 0 ? plural(d, 'dia', 'dias') + ' de atraso' : 'em ' + plural(-d, 'dia', 'dias')) + '</small>' };
}
// cartões que abrem o detalhamento logo abaixo (clicou → abre; clicou de novo → fecha)
// lista: [{id, icone, cor, rotulo, valor, comp, sub, barra, linhas, det(container)}]
function cartoesB(el, chave, lista) {
  E.kpiAberto = E.kpiAberto || {};
  const ab = E.kpiAberto[chave] || '';
  el.innerHTML = '<div class="b-kpis b-kpis-' + lista.length + ' b-kpis-ab">' + lista.map((c) => {
    const on = ab === c.id;
    return '<button type="button" class="b-kpi b-kpi-bt" data-kpi="' + esc(c.id) + '" aria-expanded="' + on + '"><span class="b-kpi-abre">' + (on ? 'fechar ▲' : 'ver ▼') + '</span>' +
      '<div class="b-kpi-ic b-' + (c.cor || 'b') + '">' + iconeB(c.icone || 'ok') + '</div><div class="b-kpi-tx"><div class="b-kpi-l">' + esc(c.rotulo) + '</div>' +
      (c.linhas ? '<div class="b-kpi-linhas">' + c.linhas.map((l) => '<div><span class="b-kpi-v' + (l[2] ? ' b-verde' : '') + '">' + esc(l[0]) + '</span><span class="b-kpi-s">' + esc(l[1]) + '</span></div>').join('') + '</div>'
        : '<div class="b-kpi-v' + (c.cor === 'r' && c.valor && c.valor !== '0' ? ' b-verm' : '') + '">' + esc(c.valor) + (c.comp ? ' <small>' + esc(c.comp) + '</small>' : '') + '</div>') +
      (c.barra != null ? '<div class="b-barra' + (c.cor === 'a' ? ' b-barra-a' : '') + '"><span style="width:' + Math.max(0, Math.min(100, Math.round(c.barra))) + '%"></span></div>' : '') +
      (c.sub ? '<div class="b-kpi-s">' + c.sub + '</div>' : '') + '</div></button>';
  }).join('') + '</div><div class="b-kpi-det"></div>';
  const atual = lista.find((c) => c.id === ab);
  if (atual && atual.det) atual.det(el.querySelector('.b-kpi-det'));
  el.querySelector('.b-kpis').onclick = (ev) => { const b = ev.target.closest('[data-kpi]'); if (!b) return; E.kpiAberto[chave] = ab === b.dataset.kpi ? '' : b.dataset.kpi; cartoesB(el, chave, lista); };
}
// TABELA de toda tela refeita. cfg: { id, titulo (texto ou fn(aba)), colunas: [{k, rot, cls, clsL(r), html(r), ord(r) | false, soma}], linhas,
//   abas: [{id, rot, f(r), cor:'r'}], abaPadrao, ordAbas: {aba: {k, dir}}, ord: {k, dir}, busca(r) → texto, dicaBusca,
//   listas: [{k, rot, todos, opcoes: [[v, rótulo]], get(r)}], venc(r) → 'aaaa-mm-dd', valor(r) → número,
//   lote: [{rot, icone, quando(r), fn(lista)}], clique(r), chave(r), vazio: {titulo, frase}, unidade: [um, varios], altura, semBarra }
function tabelaB(el, cfg) {
  E.tabB = E.tabB || {};
  const st = E.tabB[cfg.id] = E.tabB[cfg.id] || { aba: (cfg.abas && (cfg.abaPadrao || cfg.abas[0].id)) || '', q: '', listas: {}, vde: '', vate: '', min: '', max: '', ord: Object.assign({}, cfg.ord || { k: '', dir: 1 }), ordAba: {}, sel: {}, painel: false };
  if (cfg.ordAbas) Object.keys(cfg.ordAbas).forEach((a) => { if (!st.ordAba[a]) st.ordAba[a] = Object.assign({}, cfg.ordAbas[a]); });
  el._cfgB = cfg;
  const chave = cfg.chave || ((r) => String(r.id));
  const temFx = !!(cfg.venc || cfg.valor);
  const compacto = () => document.documentElement.classList.contains('b-compacto');
  if (!cfg.semBarra) {
    el.innerHTML = '<div class="b-abas-linha"' + (cfg.abas ? '' : ' style="border-bottom:0"') + '>' + (cfg.abas ? '<div class="b-abas" role="tablist"></div>' : '') +
      '<div class="b-filtros">' + (cfg.busca ? '<label class="b-busca">' + iconeB('busca') + '<input data-bt="q" placeholder="' + esc(cfg.dicaBusca || 'Buscar') + '" aria-label="Buscar" value="' + esc(st.q) + '"></label>' : '') +
      (cfg.listas || []).map((l) => '<select data-bt="l" data-k="' + esc(l.k) + '" aria-label="' + esc(l.rot) + '"><option value="">' + esc(l.todos) + '</option>' + l.opcoes.map((o) => '<option value="' + esc(o[0]) + '"' + (st.listas[l.k] === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>').join('') +
      (temFx ? '<button type="button" class="b-bt-f" data-bt="painel" aria-expanded="' + st.painel + '">' + iconeB('filtro') + 'Filtros <span class="b-nf" hidden></span></button>' : '') +
      '<button type="button" class="b-ic-bt" data-bt="dens" aria-pressed="' + compacto() + '" title="Tabela compacta (mais linhas na tela)" aria-label="Tabela compacta">' + iconeB('compacto') + '</button></div></div>' +
      (temFx ? '<div class="b-mais-filtros" data-bt="pn"' + (st.painel ? '' : ' hidden') + '>' +
        (cfg.venc ? '<div class="b-fx"><span>Vencimento</span><input type="date" data-bt="vde" aria-label="Vencimento de" value="' + st.vde + '"><span>até</span><input type="date" data-bt="vate" aria-label="Vencimento até" value="' + st.vate + '"></div>' : '') +
        (cfg.valor ? '<div class="b-fx"><span>Valor (R$)</span><input inputmode="decimal" data-mascara="nenhuma" data-bt="min" placeholder="de" aria-label="Valor mínimo" value="' + esc(st.min) + '"><span>até</span><input inputmode="decimal" data-mascara="nenhuma" data-bt="max" placeholder="até" aria-label="Valor máximo" value="' + esc(st.max) + '"></div>' : '') +
        '<button type="button" class="b-link" data-bt="limpar">Limpar filtros</button></div>' : '') +
      '<div data-bt="quadro"></div>';
  } else el.innerHTML = '<div data-bt="quadro"></div>';
  const Q = (s) => el.querySelector(s);
  const filtrar = (semAba) => {
    const q = normalizar(st.q.trim()), min = st.min ? lerValor(st.min) : null, max = st.max ? lerValor(st.max) : null;
    return cfg.linhas.filter((r) => {
      if (!semAba && cfg.abas && st.aba) { const a = cfg.abas.find((x) => x.id === st.aba); if (a && a.f && !a.f(r)) return false; }
      if (q && cfg.busca && normalizar(cfg.busca(r)).indexOf(q) < 0) return false;
      for (const l of (cfg.listas || [])) { const v = st.listas[l.k]; if (v && String(l.get(r)) !== v) return false; }
      if (cfg.venc) { const d = cfg.venc(r) || ''; if (st.vde && d < st.vde) return false; if (st.vate && d > st.vate) return false; }
      if (cfg.valor) { const v = cfg.valor(r) || 0; if (min != null && v < min) return false; if (max != null && v > max) return false; }
      return true;
    });
  };
  const ordem = () => (cfg.abas && st.ordAba[st.aba]) || st.ord;
  const filtrando = () => st.q || st.vde || st.vate || st.min || st.max || Object.keys(st.listas).some((k) => st.listas[k]);
  function abas() {
    if (!cfg.abas || cfg.semBarra) return;
    const guarda = st.aba, cont = {};
    cfg.abas.forEach((a) => { st.aba = a.id; cont[a.id] = filtrar().length; }); st.aba = guarda;
    Q('.b-abas').innerHTML = cfg.abas.map((a) => '<button type="button" role="tab" class="b-aba" data-b-aba="' + esc(a.id) + '" aria-selected="' + (a.id === st.aba) + '">' + esc(a.rot) +
      '<span class="b-aba-n' + (a.cor === 'r' && cont[a.id] ? ' b-r' : '') + '">' + cont[a.id] + '</span></button>').join('');
  }
  function quadro() {
    const o = ordem(), lin = filtrar(), col = cfg.colunas.find((c) => c.k === o.k);
    if (col && col.ord !== false) { const f = col.ord || ((r) => r[col.k]); lin.sort((a, b) => { const x = f(a), y = f(b); return (x > y ? 1 : x < y ? -1 : 0) * o.dir; }); }
    Object.keys(st.sel).forEach((k) => { if (!lin.some((r) => chave(r) === k)) delete st.sel[k]; });
    const titulo = typeof cfg.titulo === 'function' ? cfg.titulo(st.aba) : cfg.titulo;
    const un = cfg.unidade || ['linha', 'linhas'];
    if (!lin.length) {
      Q('[data-bt=quadro]').innerHTML = '<div class="b-quadro">' + (titulo ? '<div class="b-quadro-hd"><h2>' + esc(titulo) + '</h2></div>' : '') +
        (filtrando() ? '<div class="b-vazio"><div class="b-vazio-ic">' + iconeB('busca') + '</div><b>Nada encontrado</b><p>Nenhuma linha combina com a busca e os filtros escolhidos.</p><button type="button" class="btn btn-o" data-bt="limpar">Limpar filtros</button></div>'
          : vazioB({ icone: 'ok', titulo: (cfg.vazio && cfg.vazio.titulo) || 'Nada aqui por enquanto', frase: (cfg.vazio && cfg.vazio.frase) || '' })) + '</div>';
      return;
    }
    const soma = cfg.valor ? lin.reduce((s, r) => s + (cfg.valor(r) || 0), 0) : null;
    const temLote = !!(cfg.lote && cfg.lote.length);
    const marc = lin.filter((r) => st.sel[chave(r)]);
    const lote = temLote && marc.length ? '<div class="b-lote"><b>' + plural(marc.length, 'marcada', 'marcadas') + '</b>' + (cfg.valor ? '<span>' + brl(marc.reduce((s, r) => s + (cfg.valor(r) || 0), 0)) + '</span>' : '') +
      '<button type="button" class="b-link" data-bt="desmarcar">Desmarcar</button><div class="b-lote-acoes">' + cfg.lote.map((a, i) => { const n = marc.filter((r) => !a.quando || a.quando(r)).length;
        return '<button type="button" class="btn btn-o btn-mini" data-b-lote="' + i + '"' + (n ? '' : ' disabled') + '>' + iconeB(a.icone || 'check') + esc(a.rot) + (n !== marc.length ? ' (' + n + ')' : '') + '</button>'; }).join('') + '</div></div>' : '';
    const cols = cfg.colunas;
    const cel = (c, r) => '<td' + ((c.cls || c.clsL) ? ' class="' + (c.cls || '') + (c.clsL ? c.clsL(r) : '') + '"' : '') + '>' + c.html(r) + '</td>';
    Q('[data-bt=quadro]').innerHTML = '<div class="b-quadro">' + (titulo ? '<div class="b-quadro-hd"><h2>' + esc(titulo) + '</h2><span class="b-resumo">' + plural(lin.length, un[0], un[1]) + (soma != null ? ' · <b>' + brl(soma) + '</b>' : '') + '</span></div>' : '') + lote +
      '<div class="b-rola" data-sem-pagina' + (cfg.altura ? ' style="max-height:' + cfg.altura + '"' : '') + '><table class="b-tab"><thead><tr>' +
      (temLote ? '<th class="b-ck"><input type="checkbox" data-bt="todas" aria-label="Marcar todas"' + (marc.length && marc.length === lin.length ? ' checked' : '') + '></th>' : '') +
      cols.map((c) => { const pode = c.ord !== false; return '<th class="' + (pode ? 'b-ord ' : '') + (c.cls || '') + '"' + (pode ? ' data-b-ord="' + esc(c.k) + '" title="Ordenar"' : '') + (o.k === c.k ? ' data-dir="' + o.dir + '"' : '') + '>' + esc(c.rot) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + lin.map((r) => { const k = chave(r);
        return '<tr class="' + (cfg.clique ? 'b-cl' : '') + (st.sel[k] ? ' b-sel' : '') + '"' + (cfg.clique ? ' tabindex="0"' : '') + ' data-b-k="' + esc(k) + '">' +
          (temLote ? '<td class="b-ck"><input type="checkbox" data-bt="um" aria-label="Marcar"' + (st.sel[k] ? ' checked' : '') + '></td>' : '') + cols.map((c) => cel(c, r)).join('') + '</tr>'; }).join('') +
      '</tbody>' + (soma != null && lin.length > 1 ? '<tfoot><tr>' + (temLote ? '<td></td>' : '') + cols.map((c, i) => c.soma ? '<td class="b-dir b-val">' + brl(soma) + '<small>média ' + brl(soma / lin.length) + '</small></td>' : '<td>' + (i === 0 ? 'Total de ' + lin.length : '') + '</td>').join('') + '</tr></tfoot>' : '') +
      '</table></div></div>';
  }
  function contarFx() { const b = Q('[data-bt=painel]'); if (!b) return; const n = (st.vde || st.vate ? 1 : 0) + (st.min || st.max ? 1 : 0); b.classList.toggle('b-tem', n > 0); const s = b.querySelector('.b-nf'); s.hidden = !n; s.textContent = n; }
  const tudo = () => { abas(); quadro(); contarFx(); };
  el._redesenharB = tudo;
  tudo();
  if (!el._ligadoB) {
    el._ligadoB = true;
    el.addEventListener('input', (ev) => {
      const c2 = el._cfgB, s2 = E.tabB[c2.id], t = ev.target.dataset.bt;
      if (t === 'q') s2.q = ev.target.value; else if (t === 'l') s2.listas[ev.target.dataset.k] = ev.target.value;
      else if (['vde', 'vate', 'min', 'max'].includes(t)) s2[t] = ev.target.value; else return;
      el._redesenharB();
    });
    el.addEventListener('click', (ev) => {
      const c2 = el._cfgB, s2 = E.tabB[c2.id], ch2 = c2.chave || ((r) => String(r.id)), t = ev.target.closest('[data-bt]'), tt = t && t.dataset.bt;
      if (tt === 'painel') { s2.painel = !s2.painel; el.querySelector('[data-bt=pn]').hidden = !s2.painel; t.setAttribute('aria-expanded', s2.painel); return; }
      if (tt === 'limpar') { s2.q = ''; s2.listas = {}; s2.vde = s2.vate = s2.min = s2.max = ''; tabelaB(el, c2); return; }
      if (tt === 'dens') { const on = !document.documentElement.classList.contains('b-compacto'); document.documentElement.classList.toggle('b-compacto', on); try { localStorage.setItem('erp_compacto', on ? '1' : ''); } catch (e) { /* sem armazenamento */ } t.setAttribute('aria-pressed', on); return; }
      if (tt === 'desmarcar') { s2.sel = {}; el._redesenharB(); return; }
      if (tt === 'todas') { const marcar = t.checked; s2.sel = {}; if (marcar) el.querySelectorAll('tbody tr[data-b-k]').forEach((tr) => { s2.sel[tr.dataset.bK] = true; }); el._redesenharB(); return; }
      if (tt === 'um') { const k = t.closest('tr').dataset.bK; if (t.checked) s2.sel[k] = true; else delete s2.sel[k]; el._redesenharB(); return; }
      const ab = ev.target.closest('[data-b-aba]'); if (ab && el.contains(ab)) { s2.aba = ab.dataset.bAba; s2.sel = {}; el._redesenharB(); return; }
      const th = ev.target.closest('th[data-b-ord]'); if (th) { const o = c2.abas ? (s2.ordAba[s2.aba] = s2.ordAba[s2.aba] || Object.assign({}, s2.ord)) : s2.ord;
        if (o.k === th.dataset.bOrd) o.dir = -o.dir; else { o.k = th.dataset.bOrd; o.dir = 1; } el._redesenharB(); return; }
      const lt = ev.target.closest('[data-b-lote]'); if (lt) { const a = c2.lote[+lt.dataset.bLote]; const marc = c2.linhas.filter((r) => s2.sel[ch2(r)] && (!a.quando || a.quando(r)));
        Promise.resolve(a.fn(marc)).then((feito) => { if (feito !== false) { s2.sel = {}; if (el.isConnected) el._redesenharB(); } }); return; }
      if (ev.target.closest('button, a, input, select, label')) return;
      const tr = ev.target.closest('tbody tr[data-b-k]'); if (tr && c2.clique) { const r = c2.linhas.find((x) => ch2(x) === tr.dataset.bK); if (r) c2.clique(r); }
    });
  }
  return { st, redesenhar: tudo };
}
try { if (localStorage.getItem('erp_compacto')) document.documentElement.classList.add('b-compacto'); } catch (e) { /* sem armazenamento */ }

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
// Backup 52 (O1): a cópia ainda vale (menos de 60 s e nenhuma gravação desde então)?
function cadastrosEmDia() { return !!_cadQuando && Date.now() - _cadQuando < 60000; }

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
  // Backup 52 (O1): com clientes e grupos já guardados, a tela abre NA HORA e a cópia é renovada por trás (antes, toda tela esperava a lista do banco)
  // Backup 68: tela que não usa a lista de clientes (Parcelamentos lê do próprio ERP) abre sem esperar o banco
  try { if (!TELAS[tela].semCadastros) { if (!E.clientes.length) await carregarCadastros(); else if (!cadastrosEmDia()) carregarCadastros().catch(() => {}); } await TELAS[tela](); }
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
    '<div id="ini-valid"></div><div id="ini-lembretes"></div><div id="ini-resumo"></div>' +
    '<div id="ini-fila"></div>';
  cardLembretes().catch((e) => console.error(e));
  cardResumoEscritorio().catch((e) => console.error(e));
  if (typeof buscaPubAutomatica === 'function') buscaPubAutomatica().catch(() => {});
  if (typeof vigiarAgenda === 'function') vigiarAgenda();   // Backup 40: aviso antes dos compromissos
  if (typeof cardValidacoes === 'function') cardValidacoes().then((c) => { const el = $('ini-valid'); if (el) { el.innerHTML = c.html; c.ligar(el); } }).catch((e) => console.error(e));
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
  const jur = pode('juridico'), crm = pode('crm'), fin = pode('financeiro_juridico') || pode('financeiro_contab');
  const aberta = () => cnt('tarefas').not('status', 'in', '(concluida,cancelada)');
  const tres = (t, col, filtro) => jur ? Promise.all([
    conta(filtro(cnt(t)).lt(col, h)), conta(filtro(cnt(t)).eq(col, h)), conta(filtro(cnt(t)).gt(col, h).lte(col, lim5))]) : [0, 0, 0];
  let lancs = [];
  const [pubs, parc, aco, ops, tAb, tAtr, tHoje, t5] = await Promise.all([
    // Backup 39: só as publicações do advogado que entrou (pelo primeiro nome: Pedro vê as do Pedro)
    jur ? conta(cnt('publicacoes').eq('status', 'nova').or('advogado.ilike.' + primeiroNomeUsuario().replace(/[,()*%]/g, '') + '*,advogados.ilike.*' + primeiroNomeUsuario().replace(/[,()*%]/g, '') + '*')) : 0,
    tres('parcelas', 'vencimento', (x) => x.eq('pago', false)),
    tres('acordos', 'vencimento', (x) => x.eq('pago', false)),
    crm ? q(sb.from('crm_oportunidades').select('valor_estimado, crm_etapas(final)')).catch(() => []) : [],
    conta(aberta()), conta(aberta().lt('prazo', h)), conta(aberta().eq('prazo', h)), conta(aberta().gt('prazo', h).lte('prazo', lim5)),
    // Backup 50: financeiro que vence (em atraso, hoje e nos próximos 5 dias)
    fin ? buscarTodos(() => sb.from('lancamentos').select('id, tipo, valor, redutor, vencimento, empresa').eq('pago', false).eq('perda', false).lte('vencimento', lim5)).catch(() => []) : []
  ]).then((r) => { lancs = r.pop(); return r; });
  const abertas = (ops || []).filter((o) => !(o.crm_etapas && o.crm_etapas.final));
  // linhas de prazo: [quantidade, texto, cor] — Backup 19: plural certo, sem "(s)"
  const pl = (n, um, varios) => (Number(n) === 1 ? um : varios);
  const prazos = (v) => [[v[1], pl(v[1], 'vence hoje', 'vencem hoje'), 'ambar'], [v[2], 'nos próximos 5 dias', '']];
  const T = [
    jur ? ['publicacoes', '📰', 'Publicações', pubs, pl(pubs, 'nova sua para ler', 'novas suas para ler'), [], pubs ? 'ambar' : ''] : null,
    jur ? ['parcelamentos', '🧾', 'Parcelamentos', parc[0], pl(parc[0], 'parcela em atraso', 'parcelas em atraso'), prazos(parc), parc[0] ? 'vermelho' : parc[1] ? 'ambar' : ''] : null,
    jur ? ['acordos', '🤝', 'Acordos', aco[0], pl(aco[0], 'parcela em atraso', 'parcelas em atraso'), prazos(aco), aco[0] ? 'vermelho' : aco[1] ? 'ambar' : ''] : null,
    crm ? ['crm', '🎯', 'CRM', abertas.length, pl(abertas.length, 'oportunidade em andamento', 'oportunidades em andamento'), [[null, brl(soma(abertas, (o) => o.valor_estimado)) + ' em negociação', '']], ''] : null,
    // Backup 53: A receber separado (Jurídico × Contabilidade) e A pagar à parte; cada um com hoje · próximos 5 dias · em atraso (sem repetir valores)
    ...(() => { if (!fin) return [];
      const f = (l, a, b) => l.filter((x) => x.vencimento >= a && x.vencimento <= b), at = (l) => l.filter((x) => x.vencimento < h);
      const sm = (l) => brlCurto(soma(l, (x) => Math.abs(vl(x)))), amanha = somarDias(h, 1);
      const card = (k, tit, l) => [k, '💰', tit, sm(f(l, h, h)), 'vence hoje',
        [[null, sm(f(l, amanha, lim5)) + ' nos próximos 5 dias', ''], [null, at(l).length ? sm(at(l)) + ' em atraso' : '', '']].filter((x) => x[1]),
        at(l).length ? 'vermelho' : f(l, h, h).length ? 'ambar' : ''];   // Backup 53: o cartão aparece mesmo zerado (R$ 0 = nada vence)
      const rec = lancs.filter((l) => l.tipo === 'receita'), pag = lancs.filter((l) => l.tipo === 'despesa');
      return [pode('financeiro_juridico') ? card('fin-jur', 'A receber · Jurídico', rec.filter((l) => l.empresa !== 'contabilidade')) : null,
        pode('financeiro_contab') ? card('fin-contab', 'A receber · Contabilidade', rec.filter((l) => l.empresa === 'contabilidade')) : null,
        // Backup 55: "A pagar" virou "A pagar · Contabilidade" e mostra só as despesas da contabilidade
        pode('financeiro_contab') ? card('fin-pagar', 'A pagar · Contabilidade', pag.filter((l) => l.empresa === 'contabilidade')) : null].filter(Boolean); })(),
    ['tarefas', '📋', 'Tarefas do escritório', tAb, 'em aberto · equipe toda', [[tAtr, pl(tAtr, 'atrasada', 'atrasadas'), 'vermelho']].concat(prazos([0, tHoje, t5])), tAtr ? 'vermelho' : '']
  ].filter(Boolean);
  // Backup 38: ícones de traço fino num quadradinho (como nos prints), no lugar dos emojis coloridos
  const IC = { publicacoes: '<path d="M4 4h12a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2z"/><path d="M18 8h2v10a2 2 0 0 1-2 2M8 8h6M8 12h6M8 16h4"/>',
    parcelamentos: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h6M9 17h4"/>', acordos: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-5"/>',
    crm: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>', financeiro: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    'fin-pagar': '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>', tarefas: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>' };
  const icone = (k) => '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[k] || IC[k.replace(/^fin-(jur|contab)$/, 'financeiro')] || '') + '</svg>';
  // Backup 54: cartões organizados em duas faixas — Financeiro (A receber verde, A pagar vermelho) e Escritório (publicações, parcelamentos,
  // acordos, CRM, tarefas). Cada cartão: título pequeno, o número grande e, embaixo, uma linha por detalhe (sem amontoar numa linha só).
  const tom = (k) => (k === 'fin-pagar' ? ' ini-at-pag' : /^fin-/.test(k) ? ' ini-at-rec' : '');
  const cartao = (t) => '<button type="button" role="listitem" class="ini-at ' + t[6] + tom(t[0]) + '" data-ini-ir="' + t[0] + '">' +
    '<span class="ini-at-cab"><span class="ini-at-ic" aria-hidden="true">' + icone(t[0]) + '</span><span class="ini-at-tit">' + esc(t[2]) + '</span></span>' +
    '<span class="ini-at-lin"><b class="ini-at-num">' + t[3] + '</b> <span class="ini-at-rot">' + esc(t[4]) + '</span></span>' +
    t[5].filter((l) => l[0] == null || l[0]).map((l) => '<span class="ini-at-sub' + (l[0] && l[2] ? ' ' + l[2] : '') + '">' + (l[0] == null ? '' : '<b>' + l[0] + '</b> ') + esc(l[1]) + '</span>').join('') + '</button>';
  const finT = T.filter((t) => /^fin-/.test(t[0])), escT = T.filter((t) => !/^fin-/.test(t[0]));
  const faixa = (rot, L) => L.length ? '<div class="ini-faixa"><div class="ini-faixa-rot">' + rot + '</div><div class="ini-atalhos" role="list" aria-label="' + rot + '">' + L.map(cartao).join('') + '</div></div>' : '';
  el.innerHTML = faixa('Financeiro', finT) + faixa('Escritório', escT);
  el.querySelectorAll('[data-ini-ir]').forEach((b) => b.onclick = () => {
    const k = b.dataset.iniIr;
    if (k === 'tarefas') E.tf = Object.assign(E.tf || {}, { aba: 'abertas', atalho: '' });
    if (/^fin-/.test(k)) { if (typeof window.nav === 'function') window.nav(null, k === 'fin-contab' || k === 'fin-pagar' ? 'financeiroContab' : 'financeiro'); return; }
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
  { id: 'analise',   rot: 'Análise' },
  { id: 'areceber',  rot: 'A Receber' },
  { id: 'recebidos', rot: 'Recebidos' },
  { id: 'prejuizo',  rot: 'Prejuízo' },
  { id: 'apagar',    rot: 'A Pagar' },
  { id: 'despesas',  rot: 'Despesas pagas' }
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
        (comAtraso ? '<td data-ord="' + (l.pago || l.perda || !l.vencimento ? 99999 : diasAte(l.vencimento)) + '">' + (l.pago ? '<span class="pill pago" data-sit="pago">pago</span>' : l.perda ? pillSit(l) : celulaAtraso(l.vencimento, l)) + '</td>' : '') +
        '<td class="acoes-l">' +
        (l.pago ? '<button class="btn btn-o btn-mini" data-desfazer="' + l.id + '" title="Voltar para em aberto">↺</button> '
                : l.perda ? '' : (l.tipo === 'receita' && !l.redutor ? '<button class="btn btn-o btn-mini gx-cobrar" data-cobrar="' + l.id + '" title="Cobrar pelo WhatsApp (texto pronto)">💬 Cobrar</button> ' : '') +
                  '<button class="btn btn-v btn-mini" data-pagar="' + l.id + '" title="Dar baixa — ' + (l.tipo === 'despesa' && !l.redutor ? 'pago' : 'recebido') + ' (pergunta a data)">✓ Baixa</button>') +
        '</td></tr>';   // Backup 58: sem a caneta — clicar na linha abre o detalhe, com "✎ Editar"
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
  raiz.querySelectorAll('[data-cobrar]').forEach((b) => b.onclick = () => cobrarWhatsApp(b.dataset.cobrar));
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
// Backup 42: cobrança simples pelo WhatsApp — "Bom dia! Passando para lembrar dos honorários do mês tal, referente ao serviço tal."
const MESES_EXT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function textoCobranca(l) {
  const ref = String(l.competencia || l.vencimento || '').slice(0, 7), mes = ref ? MESES_EXT[+ref.slice(5, 7) - 1] + (ref.slice(0, 4) !== hojeISO().slice(0, 4) ? ' de ' + ref.slice(0, 4) : '') : '';
  const oQue = (l.servico || l.descricao || 'honorários').replace(/^honor[aá]rios?\s*[—-]?\s*/i, '').trim();
  const venc = l.vencimento ? (l.vencimento < hojeISO() ? ', que venceram em ' : ', com vencimento em ') + dataBR(l.vencimento) : '';
  return saudacaoGuia() + ' Passando para lembrar dos honorários' + (mes ? ' do mês de ' + mes : '') + (oQue ? ', referente ' + (/^(a|à|ao|aos|às)\s/i.test(oQue) ? '' : 'a ') + oQue : '') +
    ', no valor de ' + brl(l.valor || 0) + venc + '.\n\nQualquer dúvida, estou à disposição.';
}
async function cobrarWhatsApp(id) {
  if (!E.clientes.length) await carregarCadastros();
  const l = (await q(sb.from('lancamentos').select('id, descricao, servico, valor, vencimento, competencia, cliente_id, grupo_id, cobranca').eq('id', id)))[0];
  if (!l) return aviso('Lançamento não encontrado.', true);
  const c = E.clientes.find((x) => x.id === l.cliente_id) || {};
  // Backup 49 (24): o mesmo botão cobra por WhatsApp OU por e-mail (modelo bonito; respeita a chave "Recebe e-mails" do cliente)
  const naoRecebe = c.recebe_email === false;
  const j = abrirJanela({ titulo: '💬 Cobrar' + (c.nome ? ' — ' + c.nome : ''),
    corpo: '<div class="fila-chips cb-canal" role="group" aria-label="Como cobrar"><span class="fila-chips-rot">Por</span>' +
        '<button type="button" class="fila-chip ativo" data-cb-canal="zap">WhatsApp</button><button type="button" class="fila-chip" data-cb-canal="email">E-mail</button></div>' +
      '<div class="grade">' + campo('WhatsApp', '<input id="cb-tel" data-mascara="tel" inputmode="tel" value="' + esc(c.telefone || '') + '" placeholder="(37) 9 9999-9999">', 'cb-so-zap') +
      campo('E-mail', '<input id="cb-para" type="email" placeholder="email@cliente.com.br"' + (naoRecebe ? ' disabled' : '') + '>', 'cb-so-email escondido') +
      (naoRecebe ? '<div class="dica aviso-amarelo inteiro cb-so-email escondido">Este cliente está marcado para <b>não receber e-mails</b>. Para mandar, mude em Clientes → ✉ Recebe e-mails.</div>' : '') +
      campo('Mensagem', '<textarea id="cb-txt" rows="6">' + esc(textoCobranca(l)) + '</textarea>', 'inteiro') +
      '<p class="sub inteiro">Ao copiar, abrir o WhatsApp ou enviar o e-mail, o lançamento fica marcado como <b>COBRADO</b>.</p></div>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Fechar</button>' +
      '<button class="btn btn-o cb-so-zap" type="button" id="cb-copiar">📋 Copiar</button><button class="btn btn-v cb-so-zap" type="button" id="cb-zap">💬 Abrir WhatsApp</button>' +
      '<button class="btn btn-o cb-so-email escondido" type="button" id="cb-previa">👁 Prévia</button><button class="btn btn-p cb-so-email escondido" type="button" id="cb-email"' + (naoRecebe ? ' disabled' : '') + '>✉ Enviar e-mail</button></div>' });
  let paraCarregado = false;
  j.querySelector('.cb-canal').onclick = async (ev) => {
    const b = ev.target.closest('[data-cb-canal]'); if (!b) return;
    j.querySelectorAll('[data-cb-canal]').forEach((x) => x.classList.toggle('ativo', x === b));
    const email = b.dataset.cbCanal === 'email';
    j.querySelectorAll('.cb-so-zap').forEach((x) => x.classList.toggle('escondido', email));
    j.querySelectorAll('.cb-so-email').forEach((x) => x.classList.toggle('escondido', !email));
    if (email && !paraCarregado) { paraCarregado = true;
      const m = await q(sb.rpc('cobranca_email_html', { p_lanc: id, p_texto: '' })).catch(() => null);
      if (m && !j.querySelector('#cb-para').value) j.querySelector('#cb-para').value = m.para || ''; }
  };
  j.querySelector('#cb-previa').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const m = await q(sb.rpc('cobranca_email_html', { p_lanc: id, p_texto: j.querySelector('#cb-txt').value }));
    verEmailHtml(m.assunto, m.html);
  });
  // Backup 43: marca "Cobrado" só nesta linha (antes recarregava todos os dados do sistema — era isso que demorava)
  const marcar = () => q(sb.from('lancamentos').update({ cobranca: 'Cobrado' }).eq('id', id).select('id')).then(() => {
    document.querySelectorAll('[data-cobrar="' + id + '"]').forEach((b) => { b.textContent = '✓ Cobrado'; b.classList.add('gx-cobrado'); });
  }).catch((e) => aviso(erroAmigavel(e), true));
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#cb-copiar').onclick = (ev) => comBotao(ev.currentTarget, async () => { await copiarTexto(j.querySelector('#cb-txt').value); aviso('✓ Texto copiado — cole no WhatsApp.'); marcar(); });
  j.querySelector('#cb-zap').onclick = () => { const tel = soDigitos(j.querySelector('#cb-tel').value);
    window.open('https://wa.me/' + (tel ? (tel.length <= 11 ? '55' : '') + tel : '') + '?text=' + encodeURIComponent(j.querySelector('#cb-txt').value), '_blank', 'noopener'); marcar(); };
  j.querySelector('#cb-email').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const r = await q(sb.rpc('cobrar_por_email', { p_lanc: id, p_para: j.querySelector('#cb-para').value.trim(), p_texto: j.querySelector('#cb-txt').value }));
    document.querySelectorAll('[data-cobrar="' + id + '"]').forEach((b) => { b.textContent = '✓ Cobrado'; b.classList.add('gx-cobrado'); });
    fecharJanela(j); const s2 = await enviarEmailAgora(r.ref, r.para); aviso('Cobrança: ' + (s2.ok ? '✓ ' : '⚠ ') + s2.msg, !s2.ok);
  });
  return j;
}
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
        '</span>' +
      '<div class="acoes"><button class="btn btn-o" type="button" data-editar="' + l.id + '">✎ Editar</button>' +
      (!l.pago && !l.perda ? '<button class="btn btn-v" type="button" data-pagar="' + l.id + '">✓ ' + (l.tipo === 'despesa' && !l.redutor ? 'Pago' : 'Recebido') + '</button>' : '') + '</div>' });
  ligarAcoesLancamentos(j, async () => { fecharJanela(j); if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); else await recarregar(); });
  // Backup 58: "✎ Editar" troca o detalhe pelo formulário (não empilha duas janelas)
  const be = j.querySelector('[data-editar]'); if (be) { const ed = be.onclick; be.onclick = () => { fecharJanela(j); return ed(); }; }
  const bc = j.querySelector('#dl-ctr'); if (bc) bc.onclick = () => { fecharJanela(j); detalheContrato(l.contrato_id); };
  const bl = j.querySelector('#dl-cli'); if (bl) bl.onclick = () => { fecharJanela(j); abrirFicha(l.cliente_id); };
  return j;
}


// ═══ Backup 54: "+ Lançar → Recebimento" — achar o honorário em aberto e dar baixa sem sair da tela onde está ═══
async function janelaReceber(depois) {
  const L = await buscarTodos(() => sb.from('lancamentos').select('id, descricao, vencimento, valor, redutor, empresa, cliente_id, grupo_id, grupos(nome), clientes(nome)').eq('tipo', 'receita').eq('pago', false).eq('perda', false).order('vencimento').order('id')).catch(() => []);
  const j = abrirJanela({ titulo: '+ Lançar recebimento', larga: true,
    corpo: '<input class="busca" id="rc-busca" placeholder="Buscar cliente, grupo ou descrição" autocomplete="off" style="width:100%;margin-bottom:10px"><div id="rc-lista"></div>' });
  const pintar = () => { const b = normalizar(j.querySelector('#rc-busca').value);
    const ver = L.filter((l) => !b || normalizar([l.descricao, l.clientes && l.clientes.nome, l.grupos && l.grupos.nome].join(' ')).includes(b)).slice(0, 60);
    j.querySelector('#rc-lista').innerHTML = ver.length ? '<div class="tabela-wrap"><table><thead><tr><th>Vencimento</th><th>Cliente / grupo</th><th>Descrição</th><th>Valor</th><th></th></tr></thead><tbody>' +
      ver.map((l) => '<tr><td>' + dataBR(l.vencimento) + '</td><td>' + esc((l.clientes && l.clientes.nome) || (l.grupos && l.grupos.nome) || '—') + '</td><td>' + esc(l.descricao || '') + '</td>' +
        '<td class="col-valor">' + brl(l.valor) + '</td><td class="acoes-l"><button type="button" class="btn btn-v btn-mini" data-rc="' + l.id + '">✓ Recebido</button></td></tr>').join('') + '</tbody></table></div>'
      : vazio(L.length ? 'Nada com essa busca.' : 'Nenhum honorário em aberto.');
    j.querySelectorAll('[data-rc]').forEach((bt) => bt.onclick = () => comBotao(bt, async () => {
      if (!window.ERP_EDITOR || !window.ERP_EDITOR.baixaRapida) throw new Error('Abra o ERP completo para dar baixa.');
      const r = await window.ERP_EDITOR.baixaRapida('lancamentos', bt.dataset.rc, { semRecarregar: true });
      if (r) { const i = L.findIndex((x) => x.id === bt.dataset.rc); if (i >= 0) L.splice(i, 1); pintar(); if (depois) depois(); } })); };
  let t; j.querySelector('#rc-busca').oninput = () => { clearTimeout(t); t = setTimeout(pintar, 200); };
  pintar(); j.querySelector('#rc-busca').focus();
  return j;
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
  // Backup 52 (O1): com uma lista guardada, a tela aparece NA HORA e a lista é atualizada por trás (redesenha se algo mudou)
  const porTras = E.clientes.length && !cadastrosEmDia();
  if (!E.clientes.length) await carregarCadastros();
  const C = E.cli;
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Clientes</h1><p id="cli-conta"></p></div>' +
    '<div class="acoes"><button class="btn btn-o" id="cli-email-lote" title="Marcar vários clientes de uma vez: recebem ou não os e-mails do escritório">✉ Recebe e-mails…</button><button class="btn btn-p" data-novo="cliente">+ Novo cliente</button></div></div>' +
    '<div class="filtros">' +
    '<div class="segmento" id="cli-visao" title="Como mostrar a lista">' + [['grupo', 'Por grupo'], ['lista', 'Lista']].map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<div class="segmento" id="cli-tipo">' + [['ativos', 'Ativos'], ['Consultoria', 'Consultoria'], ['Demanda', 'Serviço pontual'], ['Inativo', 'Inativos'], ['todos', 'Todos']]
      .map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    // Backup 40: área em botões, como Ativos/Consultoria
    (minhasAreas() === 'ambos' ? '<div class="segmento" id="cli-area" aria-label="Área">' + [['', 'Todas as áreas'], ['juridico', 'Jurídico'], ['contabil', 'Contabilidade']].map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' : '') +
    '<select class="busca sel" id="cli-grupo" autocomplete="off"><option value="">Todos os grupos</option>' +
    E.grupos.map((g) => '<option value="' + g.id + '">' + esc(g.nome) + '</option>').join('') + '</select>' +
    '<input class="busca" id="cli-busca" placeholder="Buscar nome, grupo, responsável ou CPF/CNPJ" autocomplete="off">' +
    '</div><div id="cli-corpo"></div>';
  $('cli-tipo').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { C.tipo = b.dataset.v; pintarClientes(); } };
  $('cli-visao').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { C.visao = b.dataset.v; pintarClientes(); } };
  $('cli-grupo').onchange = (ev) => { C.grupo = ev.target.value; pintarClientes(); };
  if ($('cli-area')) $('cli-area').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { C.area = b.dataset.v; pintarClientes(); } };
  let t;
  $('cli-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { C.busca = ev.target.value; pintarClientes(); }, 250); };
  ligarBotoesNovo($('conteudo'));
  $('cli-email-lote').onclick = () => janelaRecebeEmailLote(C.ultima || E.clientes);
  pintarClientes();
  if (porTras) {
    const antes = E.clientes, assinatura = (L) => L.length + ':' + L.map((c) => c.id + (c.atualizado_em || '')).join('|');
    carregarCadastros(true).then(() => {
      if (!$('cli-conta') || E.tela !== 'clientes' || assinatura(antes) === assinatura(E.clientes)) return;
      const g = $('cli-grupo'); if (g) g.innerHTML = '<option value="">Todos os grupos</option>' + E.grupos.map((x) => '<option value="' + x.id + '"' + (x.id === C.grupo ? ' selected' : '') + '>' + esc(x.nome) + '</option>').join('');
      pintarClientes();
    }).catch(() => {});
  }
};
// Backup 49: a chave única "Recebe e-mails do escritório" (Sim/Não) — um clique na linha ou vários de uma vez
function pillRecebeEmail(c) {
  const on = c.recebe_email !== false;
  return '<button type="button" class="pill cli-email ' + (on ? 'pago' : 'neutro') + '" data-cli-email="' + c.id + '" title="' + (on ? 'Recebe os e-mails do escritório — clique para NÃO receber' : 'NÃO recebe e-mails — clique para voltar a receber') + '">' + (on ? '✉ Sim' : '✕ Não') + '</button>';
}
async function trocarRecebeEmail(ids, recebe) {
  await q(sb.rpc('clientes_recebe_email', { p_ids: ids, p_recebe: recebe }));
  E.clientes.forEach((c) => { if (ids.includes(c.id)) c.recebe_email = recebe; });
  aviso('✓ ' + plural(ids.length, 'cliente', 'clientes') + (recebe ? ' passa(m) a receber e-mails.' : ' não recebe(m) mais e-mails.'));
}
function janelaRecebeEmailLote(lista) {
  const j = abrirJanela({ titulo: '✉ Quem recebe os e-mails do escritório', larga: true,
    corpo: '<p class="sub" style="margin-bottom:10px">Marque os clientes e escolha <b>Recebem</b> ou <b>Não recebem</b>. Quem está em "Não" não recebe nada: lembretes, cobranças, guias, acordos, recibos e convites.</p>' +
      '<label class="check" style="margin-bottom:6px"><input type="checkbox" id="rel-todos"> <b>Marcar todos (' + lista.length + ')</b></label>' +
      '<div class="lista-grupos" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:4px 12px;max-height:380px;overflow-y:auto;border:1px solid var(--border-strong);border-radius:var(--r-sm);padding:10px">' +
      lista.map((c) => '<label class="check"><input type="checkbox" value="' + c.id + '"> ' + esc(c.nome) + ' <span class="sub">' + (c.recebe_email === false ? '✕ não recebe' : '✉ recebe') + '</span></label>').join('') + '</div>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-o" type="button" id="rel-nao">✕ Não recebem</button><button class="btn btn-p" type="button" id="rel-sim">✉ Recebem</button></div>' });
  j.querySelector('#rel-todos').onchange = (ev) => j.querySelectorAll('.lista-grupos input').forEach((i) => { i.checked = ev.target.checked; });
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  const ir = (recebe) => (ev) => comBotao(ev.currentTarget, async () => {
    const ids = [...j.querySelectorAll('.lista-grupos input:checked')].map((i) => i.value);
    if (!ids.length) { aviso('Marque ao menos um cliente.', true); return; }
    await trocarRecebeEmail(ids, recebe); fecharJanela(j); pintarClientes();
  });
  j.querySelector('#rel-sim').onclick = ir(true); j.querySelector('#rel-nao').onclick = ir(false);
}

function pintarClientes() {
  const C = E.cli, b = normalizar(C.busca), bd = soDigitos(C.busca);
  document.querySelectorAll('#cli-tipo button').forEach((x) => x.classList.toggle('ativo', x.dataset.v === C.tipo));
  document.querySelectorAll('#cli-visao button').forEach((x) => x.classList.toggle('ativo', x.dataset.v === (C.visao || 'grupo')));
  document.querySelectorAll('#cli-area button').forEach((x) => x.classList.toggle('ativo', x.dataset.v === (C.area || '')));
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
  const linhas = lista.map((c, i) => (porGrupo && (i === 0 || gn(lista[i - 1]) !== gn(c)) ? '<tr class="cli-grp"><td colspan="9">' + esc(gn(c) || 'Sem grupo') +
        ' <span class="sub">' + plural(lista.filter((x) => gn(x) === gn(c)).length, 'cadastro', 'cadastros') + '</span></td></tr>' : '') + '<tr class="clicavel cli-linha" tabindex="0" data-cli="' + c.id + '" title="Abrir a ficha completa">' +
      '<td class="cli-grupo" title="' + esc(c.grupos ? c.grupos.nome : '') + '">' + esc(c.grupos ? c.grupos.nome : '—') + '</td>' +
      '<td><span class="cli-nome">' + esc(c.nome) + '</span>' + (c.socio_admin ? '<div class="sub cli-socio">' + esc(c.socio_admin) + '</div>' : '') + '</td>' +
      '<td class="mono">' + esc(mascaraDoc(c.cpf_cnpj) || '—') + '</td>' +
      '<td>' + pillAreaCli(c.area) + '</td>' +
      '<td>' + pillPessoa(c.responsavel) + '</td><td>' + pillSimNao(c.procuracao) + '</td><td>' + pillSimNao(c.certificado) + '</td>' +
      '<td>' + pillSitCad(c.situacao_cadastral) + '</td><td>' + pillRecebeEmail(c) + '</td></tr>');
  // Backup 52 (O1): primeiro as linhas que cabem na tela; o resto entra logo depois (a tela aparece na hora, mesmo com 500 clientes)
  const PRIMEIRAS = 60, vez = (pintarClientes._vez = (pintarClientes._vez || 0) + 1);
  $('cli-corpo').innerHTML = '<div class="card">' + (lista.length ?
    '<div class="tabela-wrap"><table class="' + (porGrupo ? '' : 'ordenavel ') + 'cli-tabela"><thead><tr><th>Grupo</th><th>Nome</th><th>CPF/CNPJ</th><th>Área</th><th>Responsável</th>' +
    '<th>Procuração</th><th>Certificado</th><th>Situação</th><th title="Recebe os e-mails do escritório">E-mails</th></tr></thead><tbody id="cli-tbody">' +
    linhas.slice(0, PRIMEIRAS).join('') + '</tbody></table></div>'
    : (E.clientes.length ? vazio('Nenhum cliente neste recorte — mude o filtro ou a busca.') : vazio('Nenhum cliente ainda. Cadastre o primeiro ou importe a Base de Dados em Administração.', '+ Novo cliente', '[data-novo=cliente]'))) + '</div>';
  if (linhas.length > PRIMEIRAS) requestAnimationFrame(() => setTimeout(() => { const tb = $('cli-tbody');
    if (tb && pintarClientes._vez === vez) tb.insertAdjacentHTML('beforeend', linhas.slice(PRIMEIRAS).join('')); }, 0));
  // um ouvinte só para a lista inteira (vale também para as linhas que entram depois)
  $('cli-corpo').onclick = (ev) => {
    const b = ev.target.closest('[data-cli-email]');
    if (b) { ev.stopPropagation(); const c = E.clientes.find((x) => x.id === b.dataset.cliEmail);
      return comBotao(b, async () => { await trocarRecebeEmail([c.id], c.recebe_email === false); b.outerHTML = pillRecebeEmail(c); pintarClientes(); }); }
    const tr = ev.target.closest('tr[data-cli]'); if (tr) abrirFicha(tr.dataset.cli);
  };
  $('cli-corpo').onkeydown = (ev) => { const tr = ev.target.closest('tr[data-cli]'); if (tr && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); abrirFicha(tr.dataset.cli); } };
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

async function formCliente(cl, depois, abaInicial) {   // Backup 50: abaInicial (ex.: 'contato') abre direto naquela aba
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
      // Backup 50: o cadastro abre sempre completo (o cadastro rápido do Backup 49 saiu, a pedido). Abas sem ícone.
      '<div class="inteiro"><div class="segmento cli-abas" id="cli-abas" role="tablist">' + ABAS_CLI.map(([k, r], i) => '<button type="button" role="tab" data-cli-aba="' + k + '"' + (i ? '' : ' class="ativo"') + '>' + r.replace(/^\S+\s/, '') + '</button>').join('') + '</div></div>' +
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
        // Backup 49: a chave única; o perfil detalhado fica em "Avançado"
        campo('✉ Recebe e-mails do escritório', '<select name="recebe_email"><option value="sim"' + (cl.recebe_email !== false ? ' selected' : '') + '>Sim</option><option value="nao"' + (cl.recebe_email === false ? ' selected' : '') + '>Não — não manda nada para este cliente</option></select>') +
        '<details class="inteiro cli-avancado"><summary>Avançado: quais e-mails automáticos</summary>' +
        campo('E-mails automáticos', '<select name="perfil_email" title="Quais e-mails automáticos este cliente recebe">' + PERFIS_EMAIL.map(([v, r]) =>
          '<option value="' + v + '"' + ((cl.perfil_email || 'padrao') === v ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>') + '</details>' +
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
  if (abaInicial) irAba(abaInicial);
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
      email: f.email.value.trim(), telefone: f.telefone.value.trim(), endereco: f.endereco.value.trim(), perfil_email: f.perfil_email.value, recebe_email: f.recebe_email.value !== 'nao', cep: soDigitos(f.cep.value),
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
    let c = sb.from('contratos').select('*, clientes(nome, grupos(nome)), lancamentos(valor, pago, vencimento), documentos(id), exitos(id), contratos_aditivos(tipo, data)').order('data_contrato', { ascending: false });
    if (F.status !== 'todos') c = c.eq('status', F.status);
    _contratos = await q(c);
  }
  let lista = _contratos;
  if (F.busca) {
    const b = normalizar(F.busca);
    lista = lista.filter((c) => normalizar(c.descricao + ' ' + (c.clientes ? c.clientes.nome : '')).includes(b));
  }
  const h = hojeISO();
  const reaj = F.status === 'Ativo' || F.status === 'todos' ? reajustesProximos(_contratos) : [];
  $('ctr-corpo').innerHTML = (reaj.length ? await cardReajustes(reaj) : '') + '<div class="card">' + (lista.length ?
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
  ligarReajustes(reaj);
}

// Backup 49 (23): reajuste anual — consultoria com valor FIXO cujo aniversário cai nos próximos 30 dias (ou passou há até 15)
// e que ainda não teve aditivo de valor neste ciclo. O salário mínimo já reajusta sozinho e fica de fora.
function aniversarioContrato(c, hoje) {
  const base = c.inicio_vigencia || c.inicio_competencia || c.data_contrato; if (!base) return null;
  const [a, m, d] = base.split('-').map(Number); const ano = hoje.getFullYear();
  if (a >= ano + 1) return null;
  let anv = new Date(ano, m - 1, Math.min(d, 28));
  if ((anv - hoje) / 864e5 < -15) anv = new Date(ano + 1, m - 1, Math.min(d, 28));
  if (anv.getFullYear() <= a) return null;          // ainda não completou um ano
  return anv;
}
function reajustesProximos(lista) {
  const hoje = new Date(hojeISO() + 'T00:00:00');
  return lista.filter((c) => c.status === 'Ativo' && !c.rescindido_em && c.modalidade === 'consultoria' && c.forma_valor !== 'salario_minimo' && Number(c.valor_mensal) > 0)
    .map((c) => { const anv = aniversarioContrato(c, hoje); return anv && { c, anv, dias: Math.round((anv - hoje) / 864e5) }; })
    .filter((r) => r && r.dias <= 30 && !(r.c.contratos_aditivos || []).some((a) => a.tipo === 'valor' && (new Date(a.data + 'T00:00:00') - r.anv) / 864e5 > -45))
    .sort((a, b) => a.dias - b.dias);
}
// índice padrão = variação do salário mínimo do ano (a pessoa pode trocar pelo IPCA/IGP-M antes de aplicar)
async function indiceReajustePadrao() {
  if (E._idxReaj != null) return E._idxReaj;
  const sm = await sb.from('salarios_minimos').select('ano, valor').order('ano', { ascending: false }).limit(2).then((r) => r.data || [], () => []);
  E._idxReaj = sm.length === 2 && Number(sm[1].valor) > 0 ? Math.round((Number(sm[0].valor) / Number(sm[1].valor) - 1) * 10000) / 100 : 5;
  return E._idxReaj;
}
async function cardReajustes(reaj) {
  const idx = await indiceReajustePadrao();
  return '<div class="card ctr-reaj" id="ctr-reaj"><div class="card-hd">Reajuste anual nos próximos 30 dias <span class="pill hoje">' + reaj.length + '</span></div>' +
    '<p class="sub">Consultorias com valor fixo fazendo aniversário. O % sugerido é a variação do salário mínimo do ano — troque pelo índice do contrato (IPCA, IGP-M) se for outro.</p>' +
    '<div class="tabela-wrap"><table class="ctr-reaj-tab"><thead><tr><th>Cliente</th><th>Contrato</th><th>Aniversário</th><th class="num">Valor atual</th><th class="num">%</th><th class="num">Novo valor</th><th></th></tr></thead><tbody>' +
    reaj.map(({ c, anv, dias }) => {
      const novo = Math.round(Number(c.valor_mensal) * (1 + idx / 100) * 100) / 100;
      return '<tr data-reaj="' + c.id + '"><td>' + esc(c.clientes ? c.clientes.nome : '—') + '</td><td>' + esc(c.descricao) + '</td>' +
        '<td class="centro">' + dataBR(iso(anv)) + '<div class="sub">' + (dias < 0 ? 'há ' + plural(-dias, 'dia', 'dias') : dias === 0 ? 'hoje' : 'em ' + plural(dias, 'dia', 'dias')) + '</div></td>' +
        '<td class="num mono">' + brl(c.valor_mensal) + '</td>' +
        '<td class="num"><input class="ctr-reaj-pct" inputmode="decimal" data-mascara="nenhuma" value="' + String(idx).replace('.', ',') + '" aria-label="Percentual de reajuste"></td>' +
        '<td class="num mono ctr-reaj-novo">' + brl(novo) + '</td>' +
        '<td class="centro"><button class="btn btn-p btn-mini" data-reaj-aplicar="' + c.id + '">Aplicar</button></td></tr>';
    }).join('') + '</tbody></table></div></div>';
}
function ligarReajustes(reaj) {
  const box = $('ctr-reaj'); if (!box) return;
  const novoValor = (tr) => { const c = reaj.find((r) => r.c.id === tr.dataset.reaj).c; return Math.round(Number(c.valor_mensal) * (1 + (lerValor(tr.querySelector('.ctr-reaj-pct').value) || 0) / 100) * 100) / 100; };
  box.addEventListener('input', (ev) => { const tr = ev.target.closest('tr[data-reaj]'); if (tr) tr.querySelector('.ctr-reaj-novo').textContent = brl(novoValor(tr)); });
  box.querySelectorAll('[data-reaj-aplicar]').forEach((b) => b.onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const tr = b.closest('tr'); const r = reaj.find((x) => x.c.id === tr.dataset.reaj);
    const pct = lerValor(tr.querySelector('.ctr-reaj-pct').value) || 0, v = novoValor(tr);
    if (!(v > 0) || pct <= 0) throw new Error('Informe o % do reajuste.');
    if (!confirm('Aplicar reajuste de ' + String(pct).replace('.', ',') + '% em "' + r.c.descricao + '"?\n\nNovo valor: ' + brl(v) + '/mês a partir de ' + dataBR(iso(r.anv)).slice(3) + '.')) return;
    await q(sb.rpc('registrar_aditivo', { p_contrato: r.c.id, p: { tipo: 'valor', forma: 'fixo', valor_mensal: v, a_partir: iso(r.anv).slice(0, 7) + '-01',
      descricao: 'Reajuste anual de ' + String(pct).replace('.', ',') + '% (de ' + brl(r.c.valor_mensal) + ' para ' + brl(v) + ')' } }));
    aviso('✓ Reajuste aplicado — as mensalidades em aberto já estão com o valor novo.'); await pintarContratos(true);
  }));
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
      // Backup 53: "Implantação" = contrato antigo cujo financeiro já está lançado — grava o contrato sem gerar nenhum lançamento e deixa vincular os que já existem
      (novo ? '<div class="inteiro"><div class="segmento" id="ctr-assin">' + [['Ativo', '✓ Já está assinado (lança o financeiro agora)'], ['Aguardando assinatura', '⏳ Aguardando assinatura (lança só quando assinar)'],
        ['implantacao', '📥 Implantação (o financeiro já está lançado)']]
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
      const implant = situacao === 'implantacao';
      dados.status = implant ? 'Ativo' : situacao; dados.sem_financeiro = implant;
      const criado = await q(sb.from('contratos').insert(dados).select().single());
      if (implant) { aviso('✓ Contrato de implantação gravado — nenhum lançamento foi criado.'); fecharJanela(j); await recarregar(); return vincularLancamentos(criado, cli); }
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

// Backup 53: implantação — escolher os lançamentos que JÁ existem (do cliente/grupo, sem contrato) e ligá-los a este contrato
async function vincularLancamentos(ct, cli, depois) {
  cli = cli || E.clientes.find((c) => c.id === ct.cliente_id) || {};
  let L = await q(sb.from('lancamentos').select('id, descricao, vencimento, valor, pago, cliente_id, grupo_id').eq('tipo', 'receita').is('contrato_id', null)
    .or('cliente_id.eq.' + ct.cliente_id + (cli.grupo_id ? ',grupo_id.eq.' + cli.grupo_id : '')).order('vencimento').limit(500)).catch(() => []);
  const j = abrirJanela({ titulo: '🔗 Ligar lançamentos ao contrato — ' + (ct.descricao || ''), larga: true,
    corpo: '<p class="sub" style="margin-bottom:8px">Marque os lançamentos que já existem no Financeiro e pertencem a este contrato. Nada novo é lançado.</p>' +
      (L.length ? '<div class="tabela-wrap"><table><thead><tr><th><input type="checkbox" id="vl-todos" aria-label="Marcar todos"></th><th>Vencimento</th><th>Descrição</th><th>Valor</th><th>Situação</th></tr></thead><tbody>' +
        L.map((l) => '<tr><td><input type="checkbox" data-vl="' + l.id + '" aria-label="Ligar"></td><td>' + dataBR(l.vencimento) + '</td><td>' + esc(l.descricao || '') + '</td><td class="mono">' + brl(l.valor) + '</td><td>' +
          (l.pago ? '<span class="pill pago">pago</span>' : '<span class="pill aberto">em aberto</span>') + '</td></tr>').join('') + '</tbody></table></div>'
        : vazio('Nenhum lançamento sem contrato para este cliente.')),
    rodape: '<span class="sub" id="vl-n"></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Agora não</button><button class="btn btn-p" type="button" id="vl-ok">Ligar ao contrato</button></div>' });
  const marc = () => [...j.querySelectorAll('[data-vl]:checked')].map((x) => x.dataset.vl);
  const conta = () => { j.querySelector('#vl-n').textContent = plural(marc().length, 'lançamento marcado', 'lançamentos marcados'); };
  j.querySelectorAll('[data-vl]').forEach((x) => x.onchange = conta);
  const td = j.querySelector('#vl-todos'); if (td) td.onchange = () => { j.querySelectorAll('[data-vl]').forEach((x) => { x.checked = td.checked; }); conta(); };
  conta();
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#vl-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const ids = marc(); if (!ids.length) throw new Error('Marque ao menos um lançamento.');
    await q(sb.from('lancamentos').update({ contrato_id: ct.id }).in('id', ids));
    aviso('✓ ' + plural(ids.length, 'lançamento ligado', 'lançamentos ligados') + ' ao contrato.'); fecharJanela(j); if (depois) await depois(); else await recarregar();
  });
  return j;
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
        '<div class="acoes"><button class="btn btn-p" type="button" id="ctr-assinar">✓ Marcar como assinado</button></div></div>' : '') +
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
      '<div style="margin-top:10px"><button class="btn btn-o btn-mini" id="ctr-add-parc">+ Lançar valor avulso neste contrato</button> ' +
        '<button class="btn btn-o btn-mini" id="ctr-vincular" title="Implantação: liga a este contrato lançamentos que já estão no Financeiro (não cria nada novo)">🔗 Ligar lançamentos que já existem</button>' +
        (ct.sem_financeiro ? ' <span class="pill neutro" title="Contrato de implantação: o sistema não gera parcelas nem mensalidades">implantação</span>' : '') + '</div>' +
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
  blocoDocumentos(j.querySelector('#ctr-docs'), { contrato_id: id, cliente_id: ct.cliente_id, grupo_id: ct.clientes && ct.clientes.grupo_id, tipo: 'contrato' },
    { titulo: 'Documentos do contrato', vazio: 'Nenhum documento. Envie aqui o contrato assinado, a proposta e os aditivos.' }).catch((e) => console.error(e));
  j.querySelector('#btn-editar-ctr').onclick = () => formContrato(ct);
  const br = j.querySelector('#btn-rescindir-ctr'); if (br) br.onclick = () => formRescisao(ct, reabrir);
  const be = j.querySelector('#ctr-exito-reg'); if (be) be.onclick = () => formExito(ct, reabrir);
  const ba = j.querySelector('#ctr-aditivo'); if (ba) ba.onclick = () => formAditivo(ct, reabrir);
  j.querySelector('#ctr-vincular').onclick = () => vincularLancamentos(ct, null, reabrir);
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



'use strict';
// ═══════════════════════════════════════════════════════════════════
// Administração (só admin): Usuários · Importar planilhas · Backup ·
// Histórico. O Histórico lê a tabela "historico" do banco — é a prova
// de que cada gravação chegou ao servidor, com autor e horário.
// ═══════════════════════════════════════════════════════════════════

// Backup 49 (32): abas principais Usuários · Importar · E-mail · Backup; Histórico e Acessos (uso raro) ficam no "⋯ Mais".
// Automações saiu daqui (tem menu próprio). Abas sem ícone.
const ABAS_ADMIN = [
  { id: 'usuarios', rot: 'Usuários' },
  { id: 'importar', rot: 'Importar' },
  { id: 'email', rot: 'E-mail' },
  { id: 'backup',   rot: 'Backup' },
  // Backup 53: sem o "⋯ Mais" — Histórico e Acessos viraram abas normais
  { id: 'historico', rot: 'Histórico' },
  { id: 'acessos', rot: 'Acessos' }
];
const ABAS_ADMIN_MAIS = [];

TELAS.admin = async function () {
  E.adm = E.adm || { aba: 'usuarios', tabela: '' };
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Administração</h1><p>Usuários, importação, e-mail e backup</p></div></div>' +
    '<div class="abas" id="adm-abas">' + ABAS_ADMIN.map((a) => '<button data-aba="' + a.id + '">' + a.rot + '</button>').join('') + '</div>' +
    '<div id="adm-corpo"></div>';
  $('adm-abas').onclick = (ev) => { const b = ev.target.closest('button'); if (!b) return;
    if (b.id === 'adm-mais-bt') { $('adm-abas').classList.toggle('mais-aberto'); return; }
    $('adm-abas').classList.remove('mais-aberto'); E.adm.aba = b.dataset.aba; pintarAdmin(); };
  await pintarAdmin();
};

async function pintarAdmin() {
  // Backup 19: as telas de e-mail moraram para a Central de e-mails (abas) — lá o "atualizar" redesenha a aba aberta
  if (E.adm.aba === 'clientes_email') E.adm.aba = 'usuarios';   // Backup 38: módulo E-mails saiu (a aba E-mail da Administração voltou no Backup 42)
  if (E.adm.aba === 'automacoes') E.adm.aba = 'usuarios';
  document.querySelectorAll('#adm-abas button[data-aba]').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === E.adm.aba));
  const mais = $('adm-mais-bt'), noMais = ABAS_ADMIN_MAIS.find((a) => a.id === E.adm.aba);
  if (mais) { mais.classList.toggle('ativo', !!noMais); mais.textContent = noMais ? '⋯ ' + noMais.rot : '⋯ Mais'; }
  const corpo = $('adm-corpo');
  corpo.innerHTML = '<div class="carregando">Carregando…</div>';
  try { await ({ usuarios: admUsuarios, importar: admImportar, backup: admBackup, historico: admHistorico, acessos: admAcessos, clientes_email: admClientesEmail, email: admEmail })[E.adm.aba](corpo); }
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
    // Backup 46: a tabela só mostra; tudo (nome, acesso, cargo, revisor, funções, grupos do Portal) muda na janela "✎ Editar"
    '<div class="card"><div class="tabela-wrap"><table class="ordenavel us-tab"><thead><tr><th>Nome</th><th>Acesso</th><th>Cargo · Revisor</th><th>Funções / Grupos no Portal</th><th data-tipo="data">Desde</th><th class="sem-ordem"></th></tr></thead><tbody>' +
    lista.map((p) => '<tr data-us="' + p.id + '"><td><b class="us-nome">' + esc(p.nome || '—') + '</b><div class="sub">' + esc(p.email) + '</div></td>' +
      '<td><span class="pill ' + (p.papel === 'inativo' ? 'vencido' : 'neutro') + '">' + esc((PAPEIS.find((x) => x[0] === p.papel) || [0, p.papel])[1]) + '</span></td>' +
      '<td>' + (p.papel === 'admin' || p.papel === 'equipe' ? '<span class="sub">' + esc((CARGOS.find((c) => c[0] === (p.cargo || '')) || CARGOS[0])[1].replace('— sem cargo —', 'sem cargo')) +
        (p.revisor_id ? ' · revisor: ' + esc(((lista.find((r) => r.id === p.revisor_id) || {}).nome || '').split(' ')[0]) : '') + '</span>' : '<span class="sub">—</span>') + '</td>' +
      '<td class="us-func">' + (p.papel === 'equipe' ? '<span class="sub">' + esc(resumoFuncoes(p)) + '</span>'
        : p.papel === 'cliente' ? (gruposDe(p.id).map((g) => '<span class="pill neutro">' + esc(g) + '</span>').join(' ') || '<span class="pill vencido">nenhum</span>')
        : p.papel === 'admin' ? '<span class="sub">Tudo</span>' : '<span class="sub">—</span>') + '</td>' +
      '<td class="mono" data-ord="' + p.criado_em + '">' + dataBR(p.criado_em) + '</td>' +
      '<td class="acoes-l us-acoes">' +   // Backup 58: sem "✎ Editar" — clicar na linha abre a edição
        '<button class="btn btn-o btn-mini" data-liberar="' + p.id + '" title="Liberar entrada: confirma a conta sem depender do e-mail de confirmação (a pessoa entra com o e-mail e a senha provisória)">✓</button> ' +
        '<button class="btn btn-o btn-mini" data-senha="' + esc(p.email) + '" title="Link de senha: envia por e-mail um link para a pessoa criar uma senha nova">🔑</button>' +
        (E.perfil && p.id === E.perfil.id ? '' : ' <button class="btn btn-x btn-mini" data-excluir-u="' + p.id + '" data-nome-u="' + esc(p.nome || p.email) + '" title="Excluir: apaga o acesso desta pessoa (o que ela lançou continua no sistema)">🗑</button>') + '</td></tr>').join('') +
    '</tbody></table></div></div>' +
    '<div class="dica"><b>Administrador</b>: tudo, inclusive excluir, importar e liberar usuários. <b>Equipe</b>: só as <b>funções</b> marcadas (Financeiro, Contratos, Jurídico…), em Ver ou Editar; não exclui. ' +
    '<b>Cliente</b>: só consulta, no Portal, os grupos escolhidos. <b>Inativo</b>: não entra. ' +
    '<b>Cargo</b>: a hierarquia — na agenda do Início cada pessoa só vê a de quem está no mesmo nível ou abaixo (Sócio › Coordenador › Advogado/Contador › Assistente › Estagiário). ' +
    '<b>Revisor</b>: quem valida as tarefas dessa pessoa quando a tarefa pede validação e ninguém foi escolhido.</div>';
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
  corpo.querySelectorAll('tr[data-us]').forEach((tr) => { tr.classList.add('clicavel'); tr.title = 'Clique para editar'; tr.onclick = (ev) => { if (ev.target.closest('button, a, input, select, label')) return;
    formEditarUsuario(lista.find((x) => x.id === tr.dataset.us), lista, vinculos.filter((v) => v.perfil_id === tr.dataset.us).map((v) => v.grupo_id)); }; });
  corpo.querySelectorAll('[data-senha]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    if (!confirm('Enviar para ' + b.dataset.senha + ' um e-mail com link para criar uma senha nova?')) return;
    const { error } = await sb.auth.resetPasswordForEmail(b.dataset.senha, { redirectTo: location.origin + '/' });
    if (error) throw error;
    aviso('✓ Link enviado para ' + b.dataset.senha + '.');
  }));
  $('us-novo').onclick = () => formNovoUsuario();
  corpo.querySelectorAll('[data-prev]').forEach((b) => b.onclick = () => formNovoUsuario(previstos.find((v) => v.email === b.dataset.prev)));
  corpo.querySelectorAll('[data-prev-x]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    if (!confirm('Tirar ' + b.dataset.prevX + ' da lista de acessos combinados?')) return;
    await q(sb.from('usuarios_previstos').delete().eq('email', b.dataset.prevX)); await pintarAdmin();
  }));
}
// Backup 46: uma janela só para tudo o que se muda no usuário
function formEditarUsuario(p, lista, grupos) {
  const opc = (arr, sel) => arr.map(([v, r]) => '<option value="' + v + '"' + (sel === v ? ' selected' : '') + '>' + r + '</option>').join('');
  const j = abrirJanela({ titulo: 'Editar — ' + (p.nome || p.email), larga: true,
    corpo: '<div class="us-ed-grade">' +
        '<label class="campo"><span>Nome</span><input id="us-nome" value="' + esc(p.nome || '') + '"></label>' +
        '<label class="campo"><span>E-mail (não muda)</span><input value="' + esc(p.email) + '" disabled></label>' +
        '<label class="campo"><span>Acesso</span><select id="us-papel">' + opc(PAPEIS, p.papel) + '</select></label>' +
        '<label class="campo us-so-eq"><span>Cargo (hierarquia)</span><select id="us-cargo-sel">' + opc(CARGOS, p.cargo || '') + '</select></label>' +
        '<label class="campo us-so-eq"><span>Revisor padrão (valida as tarefas desta pessoa)</span><select id="us-rev-sel"><option value="">— ninguém —</option>' +
          lista.filter((r) => r.id !== p.id && (r.papel === 'admin' || r.papel === 'equipe')).map((r) => '<option value="' + r.id + '"' + (p.revisor_id === r.id ? ' selected' : '') + '>' + esc(r.nome || r.email) + '</option>').join('') + '</select></label>' +
      '</div>' +
      '<div class="us-ed-sec" data-us-sec="equipe"><div class="us-ed-tit">Funções</div><p class="sub" style="margin-bottom:10px">Marque o que esta pessoa pode <b>ver</b> ou <b>editar</b>. Use um modelo pronto e ajuste. As próprias tarefas ela sempre vê.</p>' +
        gradeAreas(p.areas) + gradeFuncoes(p.funcoes) + '</div>' +
      '<div class="us-ed-sec" data-us-sec="cliente"><div class="us-ed-tit">Grupos que vê no Portal</div>' + listaGruposMarcar(grupos) + '</div>' +
      '<div class="us-ed-sec sub" data-us-sec="admin">O administrador vê e edita tudo, inclusive excluir, importar e liberar usuários.</div>' +
      '<div class="us-ed-sec sub" data-us-sec="inativo">Inativo não entra no sistema.</div>' +
      '<p class="sub" style="margin-top:10px">Na agenda do Início, cada pessoa só vê a de quem está no mesmo nível ou abaixo: Sócio › Coordenador › Advogado/Contador › Assistente › Estagiário. O administrador vê todos.</p>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="us-salvar">Salvar</button></div>' });
  ligarGradeFuncoes(j); ligarFiltroGrupos(j);
  const papel = j.querySelector('#us-papel');
  const mostrar = () => { j.querySelectorAll('[data-us-sec]').forEach((d) => { d.hidden = d.dataset.usSec !== papel.value; });
    j.querySelectorAll('.us-so-eq').forEach((d) => { d.hidden = !(papel.value === 'admin' || papel.value === 'equipe'); }); };
  papel.onchange = mostrar; mostrar();
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#us-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const v = papel.value, nome = j.querySelector('#us-nome').value.trim(), eq = v === 'admin' || v === 'equipe';
    const dados = { nome, papel: v };
    if (eq) { dados.cargo = j.querySelector('#us-cargo-sel').value; dados.revisor_id = j.querySelector('#us-rev-sel').value || null; }
    if (v === 'equipe') { dados.funcoes = lerGradeFuncoes(j); dados.areas = lerAreas(j); }
    await q(sb.from('perfis').update(dados).eq('id', p.id));
    if (v === 'cliente') await salvarGruposPortal(p.id, [...j.querySelectorAll('.lista-grupos input:checked')].map((i) => i.value));
    if (E.perfil && p.id === E.perfil.id) { E.perfil.nome = nome; if ($('hd-nome')) $('hd-nome').textContent = nome;
      if (window.ERP_EU) { window.ERP_EU.nome = nome; document.dispatchEvent(new CustomEvent('erp:perfil')); } }
    E._equipe = null; aviso('✓ ' + (nome || p.email).split(' ')[0] + ' atualizado.'); fecharJanela(j); await pintarAdmin();
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
    'processos, parcelamento com parcelas, acordo, tarefas, oportunidades no CRM, documentos, certidões. E-mails dos exemplos usam o domínio <b>example.com</b> (não chegam a ninguém).</p>' +
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
  const faltam = window.IMPORTADOR.gruposFaltando(validos.flatMap((r) => r.grupos), E.grupos.map((x) => x.nome));
  for (let i = 0; i < faltam.length; i += 200) await q(sb.from('grupos').insert(faltam.slice(i, i + 200).map((nome) => ({ nome }))));
  await carregarCadastros(true);
  const nG = (t) => normalizar(t).replace(/\s+/g, ' ').trim();
  const idGrupo = (n) => { const g = n && E.grupos.find((x) => nG(x.nome) === nG(n)); return g ? g.id : null; };
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
// Backup 49: E-mail em três partes — quem recebe, o que espera revisão e a configuração (o que já existia)
// Backup 51 (E4): "Para revisar" e "Últimos e-mails" viraram a CAIXA DE SAÍDA (filtros Para revisar · Na fila · Enviados · Com erro)
async function admEmail(corpo) {
  E.adm.emailAba = E.adm.emailAba === 'revisar' ? 'saida' : (E.adm.emailAba || 'quem');
  corpo.innerHTML = '<div class="segmento em-abas" id="em-abas">' + [['quem', 'Quem recebe'], ['auto', 'Automáticos'], ['saida', 'Caixa de saída'], ['config', 'Configuração']]
    .map(([v, r]) => '<button type="button" data-em-aba="' + v + '"' + (E.adm.emailAba === v ? ' class="ativo"' : '') + '>' + r + '</button>').join('') + '</div><div id="em-corpo"></div>';
  corpo.querySelector('#em-abas').onclick = (ev) => { const b = ev.target.closest('[data-em-aba]'); if (b) { E.adm.emailAba = b.dataset.emAba; admEmail(corpo); } };
  const alvo = corpo.querySelector('#em-corpo');
  await ({ quem: admEmailQuem, auto: admEmailAuto, saida: admEmailSaida, config: admEmailConfig })[E.adm.emailAba](alvo);
}
// Backup 54: um lugar só para ligar/desligar TODO e-mail automático — os avisos para a equipe (tarefa, fluxo, menção…) e os e-mails aos clientes
const EMAILS_EQUIPE = [['fluxo', 'Fluxo / sequência de tarefas', 'Quando alguém cria um fluxo ou um "Lead completo", e quando o próximo passo é liberado'],
  ['tarefa', 'Tarefa nova para alguém', 'Tarefa atribuída, encaminhada ou criada por automação'], ['revisao', 'Tarefa para revisar', 'Quando a tarefa vai para o revisor'],
  ['mencao', 'Menção (@Nome)', 'Quando alguém é mencionado num comentário'], ['atraso', 'Tarefa atrasada', 'Aviso ao administrador'],
  ['agenda', 'Lembrete de compromisso', 'Antes de reunião, audiência ou compromisso'], ['publicacao', 'Publicação nova', 'Diário de Justiça'],
  ['financeiro', 'Contrato assinado', 'Financeiro lançado'], ['cnpj', 'Cartão CNPJ', 'Mudança no cadastro da Receita'], ['acesso', 'Acesso de aparelho novo', 'Segurança'],
  ['resumo', 'Resumo do dia', 'Dias úteis, de manhã']];
async function admEmailAuto(corpo) {
  const [eq, regras] = await Promise.all([q(sb.rpc('emails_equipe')).catch(() => ({})),
    q(sb.from('regras_tarefas').select('chave, nome, descricao, ligada, oculta').eq('grupo', 'cliente_email').order('nome')).catch(() => [])]);
  const adm = (E.perfil || window.ERP_EU || {}).papel === 'admin';
  const chave = (attr, k, on, rot, desc) => '<label class="em-auto-l"><input type="checkbox" ' + attr + '="' + esc(k) + '"' + (on ? ' checked' : '') + (adm ? '' : ' disabled') + '>' +
    '<span><b>' + esc(rot) + '</b><span class="sub">' + esc(desc || '') + '</span></span><span class="pill ' + (on ? 'pago' : 'neutro') + '">' + (on ? 'ligado' : 'desligado') + '</span></label>';
  corpo.innerHTML = '<div class="em-auto">' +
    '<div class="card"><div class="card-hd">👥 Para a equipe<span class="sub">avisos do ERP que também vão por e-mail — desligado, o aviso continua no sino, só o e-mail não sai</span></div><div class="card-bd em-auto-g">' +
      EMAILS_EQUIPE.map(([k, r, d]) => chave('data-eq', k, eq[k] !== false, r, d)).join('') + '</div></div>' +
    '<div class="card"><div class="card-hd">🏢 Para os clientes<span class="sub">vale para todos; por cliente, use "Quem recebe"</span></div><div class="card-bd em-auto-g">' +
      (regras.filter((r) => !r.oculta).map((r) => chave('data-eq-regra', r.chave, r.ligada, r.nome, r.descricao)).join('') || vazio('Nenhum e-mail automático para clientes.')) + '</div></div>' +
    '<p class="dica">Cada pessoa ainda pode desligar os seus em ⋯ → Meus avisos por e-mail. Aqui vale para o escritório todo' + (adm ? '' : ' (só o administrador muda)') + '.</p></div>';
  corpo.querySelectorAll('[data-eq]').forEach((c) => c.onchange = async () => {
    try { await q(sb.rpc('salvar_email_equipe', { p_tipo: c.dataset.eq, p_ligado: c.checked })); aviso('✓ E-mail "' + EMAILS_EQUIPE.find((x) => x[0] === c.dataset.eq)[1] + '" ' + (c.checked ? 'ligado.' : 'desligado.')); }
    catch (e) { c.checked = !c.checked; aviso(erroAmigavel(e), true); }
    admEmailAuto(corpo);
  });
  corpo.querySelectorAll('[data-eq-regra]').forEach((c) => c.onchange = async () => {
    try { await q(sb.from('regras_tarefas').update({ ligada: c.checked }).eq('chave', c.dataset.eqRegra)); aviso('✓ ' + (c.checked ? 'Ligado.' : 'Desligado.')); }
    catch (e) { c.checked = !c.checked; aviso(erroAmigavel(e), true); }
    admEmailAuto(corpo);
  });
}
// Backup 53: os tipos de e-mail automático (as chaves Sim/Não de cada cliente) e as regras que os disparam (Automações)
const TIPOS_EMAIL_AUTO = [['lembrete', 'Lembrete', 'Antes de vencer (honorários)', ['email_lembrete_honorario']], ['vencimento', 'Vence hoje', 'No dia do vencimento', []],
  ['cobranca', 'Cobrança', 'Depois do atraso', ['email_cobranca_honorario']], ['recibo', 'Recibo', 'Pagamento recebido', ['email_pagamento_recebido']],
  ['parcelamento', 'Parcelamento', 'Guias e atraso do parcelamento', ['email_lembrete_parcelamento', 'email_atraso_parcelamento']], ['acordo', 'Acordo', 'Parcelas e atraso do acordo', ['email_lembrete_acordo', 'email_atraso_acordo']]];
async function admEmailQuem(corpo) {
  const [linhas, M] = await Promise.all([q(sb.rpc('quem_recebe_emails')), q(sb.rpc('emails_matriz')).catch(() => ({}))]);
  const podeEd = pode('clientes', 'editar');
  E.adm.emFiltro = E.adm.emFiltro || '';
  const F = { '': ['Todos', () => true], sim: ['Recebem', (r) => r.recebe], nao: ['Não recebem', (r) => !r.recebe], sem: ['Sem e-mail', (r) => r.recebe && !r.destino] };
  const pinta = () => {
    const ver = linhas.filter(F[E.adm.emFiltro][1]);
    // Backup 55: o liga/desliga geral de cada tipo saiu daqui (fica só em E-mail → Automáticos); aqui ficam só os clientes e, nas colunas, a exceção de cada um
    const gn = (r) => r.grupo || '';
    const ord = ver.slice().sort((a, b) => (gn(a) || '\uffff').localeCompare(gn(b) || '\uffff', 'pt-BR') || String(a.cliente).localeCompare(String(b.cliente), 'pt-BR'));
    const celTipo = (r, k) => { const v = (M[r.cliente_id] || {})[k], on = v !== false;
      return '<td class="em-t"><button type="button" class="em-tk ' + (on ? 'em-tk-on' : 'em-tk-off') + '" data-em-tipo="' + k + '" data-em-tcli="' + r.cliente_id + '"' + (podeEd ? '' : ' disabled') +
        ' title="' + esc(r.cliente) + ' — ' + (on ? 'recebe' : 'não recebe') + ' este tipo (clique para trocar)" aria-pressed="' + on + '">' + (on ? '✓' : '✕') + '</button></td>'; };
    corpo.innerHTML = '<div class="fila-chips em-filtros" role="group" aria-label="Filtro">' + Object.entries(F).map(([k, [r, f]]) => chipFiltro('data-em-f', k || '*', r + ' (' + linhas.filter(f).length + ')', E.adm.emFiltro === k)).join('') + '</div>' +
      '<div class="card"><div class="tabela-wrap"><table class="cli-tabela em-quem"><thead><tr><th>Grupo</th><th>Cliente</th><th>E-mail de destino</th><th>Recebe</th>' +
      TIPOS_EMAIL_AUTO.map(([k, r, d]) => '<th class="em-t" title="' + esc(d) + '">' + r + '</th>').join('') + '<th data-tipo="data">Último e-mail</th></tr></thead><tbody>' +
      // Backup 50: clicar no cliente abre o cadastro (aba Contatos); ✎ troca o e-mail de destino aqui mesmo
      // Backup 53: mesmo desenho da tabela de Clientes (faixa cinza por grupo, nome em caixa alta sem azul)
      (ord.length ? ord.map((r, i) => (i === 0 || gn(ord[i - 1]) !== gn(r) ? '<tr class="cli-grp"><td colspan="' + (5 + TIPOS_EMAIL_AUTO.length) + '">' + esc(gn(r) || 'Sem grupo') + ' <span class="sub">' +
          plural(ord.filter((x) => gn(x) === gn(r)).length, 'cliente', 'clientes') + '</span></td></tr>' : '') +
        '<tr class="cli-linha"><td class="cli-grupo">' + esc(r.grupo || '—') + '</td><td class="clicavel" data-em-cli="' + r.cliente_id + '" title="Abrir o cadastro do cliente (contatos e e-mails)"><span class="cli-nome">' + esc(r.cliente) + '</span></td>' +
        '<td><span class="em-dest">' + (r.destino ? esc(r.destino) : '<span class="pill vencido">sem e-mail</span>') + '</span>' +
          ' <button type="button" class="btn btn-o btn-mini btn-ed" data-em-dest="' + r.cliente_id + '" title="Trocar o e-mail de destino" aria-label="Trocar o e-mail de destino de ' + esc(r.cliente) + '">✎</button></td>' +
        '<td>' + pillRecebeEmail({ id: r.cliente_id, recebe_email: r.recebe }) + '</td>' + TIPOS_EMAIL_AUTO.map(([k]) => celTipo(r, k)).join('') +
        '<td data-ord="' + (r.ultimo_em || '') + '">' + (r.ultimo_em ? dataBR(r.ultimo_em) + ' <span class="sub">' + esc(r.ultimo_assunto || '') + '</span>' : '<span class="sub">—</span>') + '</td></tr>').join('')
        : '<tr><td colspan="' + (5 + TIPOS_EMAIL_AUTO.length) + '">' + vazio('Ninguém neste filtro.') + '</td></tr>') + '</tbody></table></div></div>' +
      '<div class="dica">Clique em <b>✉ Sim</b> / <b>✕ Não</b> para trocar. Quem está em "Não" não recebe nada do escritório (nem rascunho). Nas colunas de tipo, <b>✓</b>/<b>✕</b> escolhe quais e-mails automáticos aquele cliente recebe ' +
        '(ex.: recebe o de Vencimento, mas não o de Acordo). <b>✎</b> troca o e-mail de destino; clique no <b>nome do cliente</b> para abrir o cadastro completo (vários e-mails, setores).</div>';
    corpo.querySelectorAll('[data-em-tipo]').forEach((b) => b.onclick = () => comBotao(b, async () => {
      const cli = b.dataset.emTcli, k = b.dataset.emTipo, novo = !((M[cli] || {})[k] !== false);
      M[cli] = await q(sb.rpc('salvar_email_tipo', { p_cliente: cli, p_tipo: k, p_valor: novo }));
      const r = linhas.find((x) => x.cliente_id === cli); aviso('✓ ' + (r ? r.cliente : 'Cliente') + (novo ? ' recebe' : ' não recebe') + ' e-mails de ' + TIPOS_EMAIL_AUTO.find((x) => x[0] === k)[1] + '.'); pinta(); }));
    corpo.querySelectorAll('[data-em-f]').forEach((b) => b.onclick = () => { E.adm.emFiltro = b.dataset.emF === '*' ? '' : b.dataset.emF; pinta(); });
    corpo.querySelectorAll('[data-em-cli]').forEach((b) => b.onclick = async () => {
      if (!E.clientes.length) await carregarCadastros();
      const cl = E.clientes.find((c) => c.id === b.dataset.emCli) || await q(sb.from('clientes').select('*').eq('id', b.dataset.emCli).single());
      formCliente(cl, () => admEmailQuem(corpo), 'contato');
    });
    corpo.querySelectorAll('[data-em-dest]').forEach((b) => b.onclick = () => {
      const r = linhas.find((x) => x.cliente_id === b.dataset.emDest);
      const j = abrirJanela({ titulo: '✉ E-mail de destino — ' + r.cliente,
        corpo: '<div class="grade">' + campo('E-mail que recebe cobranças, guias e recibos', '<input id="em-dest-in" type="email" value="' + esc(String(r.destino || '').split(',')[0].trim()) + '" placeholder="financeiro@empresa.com.br">', 'inteiro') +
          '<p class="sub inteiro">Muda o endereço de onde ele vem hoje (contato marcado, contato do setor ou o e-mail do cadastro). Para vários e-mails ou setores diferentes, use "Abrir cadastro".</p></div>',
        rodape: '<button class="btn btn-o" type="button" id="em-dest-cad">Abrir cadastro</button><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="em-dest-ok">Salvar</button></div>' });
      j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
      j.querySelector('#em-dest-cad').onclick = () => { fecharJanela(j); corpo.querySelector('[data-em-cli="' + r.cliente_id + '"]').click(); };
      j.querySelector('#em-dest-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
        r.destino = await q(sb.rpc('definir_email_destino', { p_cliente: r.cliente_id, p_email: j.querySelector('#em-dest-in').value }));
        await carregarCadastros(true); fecharJanela(j); aviso('✓ E-mail de destino de ' + r.cliente + ': ' + r.destino); pinta();
      });
    });
    corpo.querySelectorAll('[data-cli-email]').forEach((b) => b.onclick = () => comBotao(b, async () => {
      const r = linhas.find((x) => x.cliente_id === b.dataset.cliEmail); await trocarRecebeEmail([r.cliente_id], !r.recebe); r.recebe = !r.recebe;
      const c = E.clientes.find((x) => x.id === r.cliente_id); if (c) c.recebe_email = r.recebe; pinta(); }));
  };
  pinta();
}
// Backup 53: "Da Rotina" — os e-mails gerados na Rotina (rascunhos) podem ser autorizados aqui e saem pelo envio normal
const FILTROS_SAIDA = [['revisar', 'Para revisar', ['retido']], ['rotina', 'Da Rotina', ['rascunho', 'rascunho_salvo']], ['fila', 'Na fila', ['pendente']], ['enviados', 'Enviados', ['enviado']], ['erro', 'Com erro', ['erro']]];
async function admEmailSaida(corpo) {
  E.adm.saidaF = E.adm.saidaF || 'revisar';
  const [lista, liga, st] = await Promise.all([
    q(sb.from('email_fila').select('id, para, para_original, assunto, status, erro, criado_em, enviado_em, tipo, referencia').order('criado_em', { ascending: false }).limit(300)).catch(() => []),
    q(sb.rpc('emails_revisar')).catch(() => false),
    q(sb.rpc('status_config_email')).catch(() => ({}))]);
  const nDe = (k) => lista.filter((m) => FILTROS_SAIDA.find((f) => f[0] === k)[2].includes(m.status)).length;
  const F = FILTROS_SAIDA.find((f) => f[0] === E.adm.saidaF) || FILTROS_SAIDA[0], ver = lista.filter((m) => F[2].includes(m.status));
  const ret = lista.filter((m) => m.status === 'retido');
  const ST = { enviado: 'pago', pendente: 'aberto', erro: 'vencido', cancelado: 'neutro', retido: 'hoje', rascunho: 'vencido', rascunho_salvo: 'pago' };
  corpo.innerHTML = '<div class="card em-saida"><div class="card-hd">📤 Caixa de saída<span class="sub">' + nDe('fila') + ' na fila · ' + (st.enviados_7d || 0) + ' enviados em 7 dias · ' + nDe('erro') + ' com erro</span>' +
      '<label class="au-chave em-rev-chave" style="margin-left:auto"><input type="checkbox" role="switch" id="em-revisar"' + (liga ? ' checked' : '') + '><span class="au-trilho" aria-hidden="true"></span> ' +
      (liga ? '<b>Revisar antes de sair:</b> ligado' : '<b>Revisar antes de sair:</b> desligado') + '</label></div><div class="card-bd">' +
    '<div class="fila-chips em-saida-f" role="group" aria-label="Mostrar">' + FILTROS_SAIDA.map(([k, r]) => chipFiltro('data-saida-f', k, r + ' (' + nDe(k) + ')', E.adm.saidaF === k)).join('') +
      (E.adm.saidaF === 'revisar' && ret.length ? '<span class="acoes" style="margin-left:auto"><button class="btn btn-o btn-mini" id="em-desc-todos">Descartar todos</button><button class="btn btn-p btn-mini" id="em-env-todos">✉ Enviar todos (' + ret.length + ')</button></span>' : '') +
      (E.adm.saidaF === 'rotina' && ver.length ? '<span class="acoes" style="margin-left:auto"><button class="btn btn-p btn-mini" id="em-rot-todos">✓ Autorizar e enviar todos (' + ver.length + ')</button></span>' : '') + '</div>' +
    (E.adm.saidaF === 'rotina' ? '<p class="sub" style="margin:6px 0 0">E-mails montados na Rotina (Guias do mês). Confira com 👁 e clique em <b>Autorizar</b>: sai direto para o cliente. Se você já enviou pelo rascunho do Gmail, use ✕ para tirar daqui.</p>' : '') +
    (E.adm.saidaF === 'revisar' ? '<p class="sub" style="margin:6px 0 0">' + (liga ? 'Os automáticos ao cliente (lembretes, cobranças, avisos) esperam aqui o seu clique.' : 'Desligado: os automáticos saem sozinhos.') + ' Os e-mails que você manda na hora (guias, acordos, rascunhos) não passam por aqui.</p>' : '') +
    '</div>' +
    (ver.length ? '<div class="tabela-wrap"><table class="em-rev em-saida-tab"><thead><tr><th data-tipo="data">Quando</th><th>Para</th><th>Assunto</th><th>Situação</th><th></th></tr></thead><tbody>' +
      ver.map((m) => '<tr><td class="mono">' + dataHoraBR(m.enviado_em || m.criado_em) + '</td><td>' + esc(m.para_original || m.para) + '</td><td>' + esc(m.assunto) + '</td>' +
        '<td><span class="pill ' + (ST[m.status] || 'neutro') + '">' + esc(m.status === 'rascunho_salvo' ? 'rascunho no Gmail' : m.status) + '</span>' + (m.erro ? '<div class="sub">' + esc(explicarErroEmail(m.erro)) + '</div>' : '') + '</td>' +
        '<td class="acoes-l"><button class="btn btn-o btn-mini" data-em-ver="' + m.id + '" title="Prévia: como o cliente recebe">👁</button>' +
          (m.status === 'retido' ? ' <button class="btn btn-p btn-mini" data-em-env="' + m.id + '">Enviar</button> <button class="btn btn-x btn-mini" data-em-desc="' + m.id + '" title="Não enviar">✕</button>' : '') +
          (m.status === 'erro' ? ' <button class="btn btn-p btn-mini" data-em-tentar="' + m.id + '" title="Volta para a fila e tenta enviar agora">↻ Tentar de novo</button>' : '') +
          (/^rascunho/.test(m.status) ? ' <button class="btn btn-p btn-mini" data-em-rot="' + m.id + '" title="Autoriza: o e-mail sai agora para o cliente">✓ Autorizar</button> <button class="btn btn-x btn-mini" data-em-rotx="' + m.id + '" title="Tirar da Caixa de saída (não envia)">✕</button>' : '') + '</td></tr>').join('') +
      '</tbody></table></div>' : '<div class="card-bd">' + vazio({ revisar: 'Nada esperando revisão.', fila: 'Nada na fila: tudo já saiu.', enviados: 'Nenhum e-mail enviado ainda.', erro: 'Nenhum e-mail com erro. 🎉' }[F[0]]) + '</div>') + '</div>';
  const acao = (ids, a) => async () => { const n = await q(sb.rpc('emails_retidos_acao', { p_ids: ids, p_acao: a }));
    if (a === 'liberar' && n) await enviarEmailAgora(null).catch(() => null);
    aviso('✓ ' + plural(n, 'e-mail', 'e-mails') + (a === 'liberar' ? ' liberado(s) para envio.' : ' descartado(s).')); await admEmailSaida(corpo); };
  corpo.querySelectorAll('[data-saida-f]').forEach((b) => b.onclick = () => { E.adm.saidaF = b.dataset.saidaF; admEmailSaida(corpo); });
  const rotina = (ids, a) => async () => { const n = await q(sb.rpc('emails_rotina_acao', { p_ids: ids, p_acao: a }));
    if (a === 'enviar' && n) await enviarEmailAgora(null).catch(() => null);
    aviso('✓ ' + plural(n, 'e-mail', 'e-mails') + (a === 'enviar' ? ' autorizado(s) e enviado(s).' : ' tirado(s) da Caixa de saída.')); await admEmailSaida(corpo); };
  if (corpo.querySelector('#em-rot-todos')) corpo.querySelector('#em-rot-todos').onclick = (ev) => comBotao(ev.currentTarget, rotina(ver.map((m) => m.id), 'enviar'));
  corpo.querySelectorAll('[data-em-rot]').forEach((b) => b.onclick = () => comBotao(b, rotina([b.dataset.emRot], 'enviar')));
  corpo.querySelectorAll('[data-em-rotx]').forEach((b) => b.onclick = () => comBotao(b, rotina([b.dataset.emRotx], 'descartar')));
  corpo.querySelector('#em-revisar').onchange = (ev) => comBotao(ev.target, async () => { await q(sb.rpc('salvar_emails_revisar', { p: ev.target.checked })); await admEmailSaida(corpo); });
  const todos = ret.map((m) => m.id);
  if (corpo.querySelector('#em-env-todos')) corpo.querySelector('#em-env-todos').onclick = (ev) => comBotao(ev.currentTarget, acao(todos, 'liberar'));
  if (corpo.querySelector('#em-desc-todos')) corpo.querySelector('#em-desc-todos').onclick = (ev) => { if (confirm('Descartar os ' + todos.length + ' e-mails? Eles não serão enviados.')) comBotao(ev.currentTarget, acao(todos, 'descartar')); };
  corpo.querySelectorAll('[data-em-env]').forEach((b) => b.onclick = () => comBotao(b, acao([b.dataset.emEnv], 'liberar')));
  corpo.querySelectorAll('[data-em-desc]').forEach((b) => b.onclick = () => comBotao(b, acao([b.dataset.emDesc], 'descartar')));
  corpo.querySelectorAll('[data-em-tentar]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const m = lista.find((x) => x.id === b.dataset.emTentar);
    await q(sb.rpc('email_reenviar', { p_id: m.id }));
    const r = await enviarEmailAgora(m.referencia || null, m.para).catch((e) => ({ ok: false, msg: e.message }));
    aviso((r && r.ok ? '✓ ' : '⚠ ') + ((r && r.msg) || 'E-mail de volta na fila.'), !(r && r.ok)); await admEmailSaida(corpo); }));
  corpo.querySelectorAll('[data-em-ver]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const m = lista.find((x) => x.id === b.dataset.emVer), [h] = await q(sb.from('email_fila').select('html').eq('id', m.id));
    verEmailHtml(m.assunto, (h && h.html) || '<p style="font-family:sans-serif">Sem prévia guardada para este e-mail.</p>'); }));
}
// (Backup 49) "Para revisar" — continua existindo: agora é o filtro "Para revisar" da Caixa de saída
async function admEmailRevisar(corpo) { E.adm.saidaF = 'revisar'; return admEmailSaida(corpo); }
// mostra o e-mail como o cliente vai ver
function verEmailHtml(titulo, html) {
  const j = abrirJanela({ titulo: '👁 ' + titulo, larga: true, corpo: '<iframe class="em-previa" sandbox="" title="Prévia do e-mail"></iframe>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Fechar</button></div>' });
  j.querySelector('iframe').srcdoc = html || '';
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  return j;
}
// Backup 51 (E1–E3): três passos, um embaixo do outro — 1. Contas que enviam (Escritório e Contabilidade lado a lado, o mesmo formulário) ·
// 2. Dados para pagamento (lado a lado) · 3. Testar (um botão só). Gmail é o padrão; SMTP/Resend ficam no "Avançado". Os botões técnicos foram para "⋯ Ferramentas".
function formConta(id, rotUsuario, rotRem) {
  return '<form id="' + id + '" class="grade em-conta">' +
    campo('E-mail que envia (Gmail)', '<input name="usuario" type="email" placeholder="' + rotUsuario + '">', 'inteiro') +
    campo('<span class="rot-senha">Senha de app do Google</span>', '<input name="senha" type="password" autocomplete="new-password" placeholder="16 letras, sem espaços">', 'inteiro') +
    campo('Nome do remetente', '<input name="remetente" placeholder="' + rotRem + '">', 'inteiro') +
    '<details class="em-avancado inteiro"><summary>Avançado: outro serviço (SMTP ou Resend)</summary><div class="grade">' +
      campo('Serviço', '<select name="provedor"><option value="gmail">Gmail (padrão, sem custo)</option><option value="smtp">Outro e-mail (SMTP: Hostinger, Locaweb, Outlook…)</option><option value="resend">Resend (plano grátis com limite)</option></select>', 'inteiro') +
      '<div class="grade inteiro em-smtp">' + campo('Servidor SMTP', '<input name="host" placeholder="smtp.hostinger.com">') + campo('Porta', '<input name="porta" inputmode="numeric" value="465">') + '</div></div></details></form>';
}
async function admEmailConfig(corpo) {
  const st = await q(sb.rpc('status_config_email')).catch(() => ({}));
  const passo = (n, tit, sub, html, id) => '<section class="card em-passo"' + (id ? ' id="' + id + '"' : '') + '><div class="card-hd"><span class="em-passo-n">' + n + '</span>' + tit + (sub ? '<span class="sub">' + sub + '</span>' : '') + '</div><div class="card-bd">' + html + '</div></section>';
  corpo.innerHTML = '<div class="em-config-topo"><span class="sub">Configure de cima para baixo. Feito uma vez, os e-mails saem sozinhos.</span>' +
      '<div class="em-ferr"><button type="button" class="btn btn-o btn-mini" id="em-ferr-bt" aria-expanded="false">⋯ Ferramentas</button><div class="em-ferr-menu" id="em-ferr-menu" hidden>' +
        '<button type="button" id="email-diag" title="Confere se as funções do Supabase estão publicadas (erp-emails, erp-publicacoes, erp-cnpj, erp-agenda)">🩺 Verificar funções</button>' +
        '<button type="button" id="email-agora" title="A fila é a lista de e-mails esperando para sair; a rotina envia sozinha a cada 5 minutos. Este botão manda agora.">✉ Enviar fila agora</button>' +
        '<button type="button" id="email-resumo" title="E-mail interno para cada pessoa da equipe com as tarefas e prazos dela (sai sozinho às 7h45 nos dias úteis). Não vai para cliente.">📋 Mandar resumo do dia agora</button>' +
        '<button type="button" id="email-teste" title="Só manda o e-mail de teste (sem conferir o resto)">🧪 Só enviar e-mail de teste</button></div></div></div>' +
    passo('1', 'Contas que enviam', 'o mesmo formulário para as duas',
      '<div class="duas-col em-lado">' +
        '<div><div class="secao">⚖ Escritório (Jurídico) ' + (st.tem_senha ? '<span class="pill pago">configurado</span>' : '<span class="pill hoje">não configurado</span>') + '</div>' + formConta('f-email', 'escritorio@gmail.com', 'ERP Araújo & Castro') +
          '<div class="grade em-extra">' + campo('Responder para (opcional)', '<input form="f-email" name="responder" type="email" value="' + esc(st.responder || '') + '">') +
          campo('Endereço do sistema (botão "Abrir no ERP")', '<input form="f-email" name="url" value="' + esc(location.origin) + '">') + '</div>' +
          '<div class="acoes"><button class="btn btn-p" id="email-salvar">Salvar conta do Escritório</button></div>' + (st.configurado_em ? '<p class="sub">Configurado em ' + dataHoraBR(st.configurado_em) + '.</p>' : '') + '</div>' +
        '<div id="email-contab"><div class="secao">🧮 Contabilidade <span class="sub" id="ct-status"></span></div>' + formConta('f-email-ct', 'contabilidade@gmail.com', 'Contabilidade Araújo & Castro') +
          '<p class="sub">Clientes com área <b>Contabilidade</b> e lançamentos da Contabilidade saem por esta conta. Sem ela, sai pela do Escritório.</p>' +
          '<div class="acoes"><button class="btn btn-p" id="ct-salvar">Salvar conta da Contabilidade</button></div></div></div>' +
      '<details class="em-ajuda"><summary>Como configurar o Gmail (uma vez)</summary><div id="email-ajuda"></div></details>') +
    passo('2', 'Dados para pagamento', 'aparecem no quadro "Como pagar" dos e-mails aos clientes',
      '<div class="duas-col em-lado"><div><div class="secao">⚖ Escritório</div>' + formPagamento('f-pag', ' do escritório', 'Equipe Araújo & Castro') +
          '<div class="acoes"><button class="btn btn-p" id="pag-salvar">Salvar</button></div></div>' +
        '<div><div class="secao">🧮 Contabilidade</div>' + formPagamento('f-pag-ct', ' da Contabilidade', 'Equipe da Contabilidade') +
          '<div class="acoes"><button class="btn btn-p" id="pag-ct-salvar">Salvar</button></div></div></div>' +
      '<div class="acoes em-modelos"><span class="sub">Ver modelo:</span>' + [['lembrete', 'Lembrete'], ['cobranca', 'Cobrança'], ['acordo', 'Acordo'], ['parcelamento', 'Parcelamento'], ['recebido', 'Pagamento recebido']]
        .map(([k, r]) => '<button class="btn btn-o btn-mini" data-previa="' + k + '">' + r + '</button>').join('') + '</div>' +
      '<p class="sub">Os e-mails ao cliente vão para quem está em "Quem recebe". Sem e-mail cadastrado, nada é enviado. Liga/desliga cada um em Automações.</p>') +
    passo('3', 'Testar', 'confere tudo e manda um e-mail de teste',
      '<div class="acoes"><button class="btn btn-p" id="email-testar">🧪 Testar tudo</button></div><div id="email-check"><div id="email-check-bd"><span class="sub">verificando…</span></div></div>');
  // contas: o mesmo formulário
  const f = $('f-email'), fct = $('f-email-ct');
  const pintarConta = (fm, c) => { c = c || {}; ['usuario', 'host', 'remetente'].forEach((k) => { if (c[k]) fm[k].value = c[k]; }); fm.provedor.value = c.provedor || 'gmail'; fm.porta.value = c.porta || 465;
    fm.senha.placeholder = c.tem_senha ? '•••••••• (deixe vazio para manter)' : '16 letras, sem espaços'; if ((c.provedor || 'gmail') !== 'gmail') fm.querySelector('.em-avancado').open = true; trocar(fm); };
  const trocar = (fm) => {
    const pv = fm.provedor.value; fm.querySelector('.em-smtp').classList.toggle('escondido', pv !== 'smtp');
    fm.querySelector('.rot-senha').textContent = { gmail: 'Senha de app do Google', smtp: 'Senha do e-mail', resend: 'Chave da API (Resend)' }[pv];
    fm.querySelector('[name=usuario]').closest('.campo').querySelector('span').textContent = pv === 'gmail' ? 'E-mail que envia (Gmail)' : 'E-mail que envia';
    if (fm === f) $('email-ajuda').innerHTML = AJUDA[pv] + '<p class="sub"><b>Uma vez só, no Supabase:</b> Edge Functions → Deploy a new function → Via Editor → nome <b>erp-emails</b> → cole o arquivo ' +
      '<code>supabase/functions/erp-emails/index.ts</code> do GitHub → Deploy → desligue <b>Verify JWT</b>. O passo a passo completo está no COMO-ATUALIZAR.</p>';
  };
  const AJUDA = {
    gmail: '<ol class="passos"><li>No Gmail do escritório: <b>Conta Google → Segurança → Verificação em duas etapas</b> (ligar, se estiver desligada).</li>' +
      '<li>Ainda em Segurança, abra <b>Senhas de app</b>, crie uma com o nome "ERP" e copie as 16 letras.</li>' +
      '<li>Aqui: informe o e-mail e cole a senha de app. Clique em <b>Salvar</b> e depois em <b>🧪 Testar tudo</b>.</li></ol>',
    smtp: '<ol class="passos"><li>No painel do seu provedor de e-mail, pegue o <b>servidor SMTP</b> e a <b>porta SSL (465)</b>.</li><li>Informe o e-mail, a senha da caixa, o servidor e a porta.</li><li>Salve e teste.</li></ol>',
    resend: '<ol class="passos"><li>Crie a conta em resend.com e confirme o domínio do escritório (ex.: araujoecastro.adv.br).</li><li>Crie uma <b>API key</b> e cole no campo de senha; em "E-mail que envia", use um endereço do domínio confirmado.</li><li>Salve e teste. O plano grátis tem limite diário de envios; acima disso é pago.</li></ol>'
  };
  [f, fct].forEach((fm) => { fm.provedor.onchange = () => trocar(fm); });
  pintarConta(f, Object.assign({}, st, { remetente: st.remetente || 'ERP Araújo & Castro' }));
  q(sb.rpc('status_config_email_conta', { p_conta: 'contabilidade' })).then((c) => { pintarConta(fct, c); $('ct-status').innerHTML = c && c.tem_senha ? '<span class="pill pago">configurado</span>' : '<span class="pill hoje">não configurado</span>'; }).catch(() => {});
  const fp = $('f-pag'), fpct = $('f-pag-ct');
  carregarPagamento(fp, 'dados_pagamento'); carregarPagamento(fpct, 'dados_pagamento_contab');
  const dadosConta = (fm) => ({ provedor: fm.provedor.value, usuario: fm.usuario.value.trim(), senha: fm.senha.value.replace(/\s+/g, fm.provedor.value === 'gmail' ? '' : ' ').trim(),
    host: fm.host.value.trim(), porta: Number(fm.porta.value) || 465, remetente: fm.remetente.value.trim() });
  $('email-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.usuario.value.trim())) throw new Error('Informe o e-mail que envia.');
    if (f.provedor.value === 'smtp' && !f.host.value.trim()) throw new Error('Informe o servidor SMTP (em Avançado).');
    await q(sb.rpc('salvar_config_email', { p: Object.assign(dadosConta(f), { responder: corpo.querySelector('[name=responder]').value.trim() }) }));
    await q(sb.rpc('salvar_url_sistema', { p: corpo.querySelector('[name=url]').value.trim() }));
    aviso('✓ Conta do Escritório salva.'); await pintarAdmin();
  });
  $('ct-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fct.usuario.value.trim())) throw new Error('E-mail da Contabilidade inválido.');
    await q(sb.rpc('salvar_config_email_conta', { p_conta: 'contabilidade', p: dadosConta(fct) }));
    aviso('✓ Conta da Contabilidade salva.'); fct.senha.value = ''; $('ct-status').innerHTML = '<span class="pill pago">configurado</span>';
  });
  $('pag-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => { await salvarPagamento(fp, 'dados_pagamento'); aviso('✓ Dados para pagamento do Escritório salvos: já valem nos próximos e-mails.'); });
  $('pag-ct-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => { await salvarPagamento(fpct, 'dados_pagamento_contab'); aviso('✓ Dados para pagamento da Contabilidade salvos.'); });
  corpo.querySelectorAll('[data-previa]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const html = await q(sb.rpc('previa_email_cliente', { p_tipo: b.dataset.previa }));
    const j = abrirJanela({ titulo: 'Modelo: ' + b.textContent + ' (exemplo fictício)', larga: true, corpo: '<iframe class="previa-email" sandbox="" title="Prévia do e-mail"></iframe>' });
    j.querySelector('iframe').srcdoc = html;
  }));
  const chamar = async (acao, msgOk) => {
    const data = await chamarFuncao('erp-emails', { acao });
    if (data && data.aviso) throw new Error(data.aviso);
    aviso('✓ ' + msgOk + ' — enviados: ' + ((data && data.enviados) || 0) + (data && data.erros ? ', com erro: ' + data.erros + ' (' + data.ultimoErro + ')' : '') + '.');
  };
  // ⋯ Ferramentas
  const menu = $('em-ferr-menu');
  $('em-ferr-bt').onclick = (ev) => { ev.stopPropagation(); menu.hidden = !menu.hidden; ev.currentTarget.setAttribute('aria-expanded', String(!menu.hidden)); };
  menu.addEventListener('click', () => { menu.hidden = true; });
  corpo.addEventListener('click', (ev) => { if (!ev.target.closest('.em-ferr')) menu.hidden = true; });
  $('email-diag').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const r = await verificarFuncoes();
    return abrirJanela({ titulo: 'Funções do Supabase', corpo: '<div class="lista-ficha">' + r.map(([n, ok, m]) => '<div class="item-ficha"><div><b>' + (ok ? '✅ ' : '❌ ') + n + '</b><div class="sub">' + esc(m) + '</div></div></div>').join('') + '</div>' +
      '<p class="sub" style="margin-top:10px">Para publicar: Supabase → Edge Functions → Deploy a new function → Via Editor → nome exatamente como acima → cole o arquivo de <code>supabase/functions/NOME/index.ts</code> (botão Raw no GitHub) → Deploy → desligue "Verify JWT".</p>' });
  });
  $('email-teste').onclick = (ev) => comBotao(ev.currentTarget, () => chamar('teste', 'Teste enviado para o seu e-mail'));
  $('email-agora').onclick = (ev) => comBotao(ev.currentTarget, () => chamar('enviar', 'Fila enviada'));
  $('email-resumo').onclick = (ev) => comBotao(ev.currentTarget, () => chamar('resumo', 'Resumo do dia montado'));
  // 3. Testar: confere tudo (o check-list) e manda o e-mail de teste
  $('email-testar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    $('email-check-bd').innerHTML = '<span class="sub">verificando…</span>';
    await checarEmail();
    try { await chamar('teste', 'Tudo conferido. E-mail de teste enviado'); }
    catch (e) { throw new Error('O check-list acima foi conferido, mas o e-mail de teste não saiu: ' + e.message); }
  });
  checarEmail();
}

// Backup 42: lista do que falta para o e-mail sair (serviço, função, rotina, pausa, destino e o último erro)
async function checarEmail() {
  const bd = $('email-check-bd'); if (!bd) return;
  const d = await q(sb.rpc('diagnostico_email')).catch((e) => ({ falhou: e.message }));
  let fn; try { const r = await chamarFuncao('erp-emails', { acao: 'ping' }); fn = [true, 'publicada' + (r.versao ? ' (versão ' + r.versao + ')' : ' — versão antiga: publique de novo')]; }
  catch (e) { fn = [false, e.message]; }
  if (!bd.isConnected) return;
  if (d.falhou) { bd.innerHTML = '<div class="dica">Rode o SQL do Backup 42 no Supabase para ver o diagnóstico. (' + esc(d.falhou) + ')</div>'; return; }
  const lin = (ok, tit, txt) => '<div class="item-ficha"><div><b>' + (ok === true ? '✅ ' : ok === false ? '❌ ' : '⚠️ ') + tit + '</b><div class="sub">' + txt + '</div></div></div>';
  bd.innerHTML = '<div class="lista-ficha">' +
    lin(d.servico, '1. Serviço de envio', d.servico ? 'Configurado: ' + esc(d.usuario) + ' (' + esc(d.provedor) + ').' : 'Falta configurar: preencha o passo 1 "Contas que enviam" (Gmail + senha de app) e clique em Salvar.') +
    lin(fn[0], '2. Função erp-emails no Supabase', esc(fn[1])) +
    lin(d.rotina ? true : null, '3. Envio automático (a cada 5 min)', d.rotina ? 'Ligado.' : 'Desligado — sem problema: o sistema manda na hora em que você clica em Enviar. Para ligar: Supabase → Database → Extensions → pg_cron e pg_net → rode o SQL de novo.') +
    lin(!d.pausado, '4. Pausa', d.pausado ? 'Os e-mails estão PAUSADOS (ficam retidos).' : 'Sem pausa.') +
    lin(null, '5. Destino', d.redirecionar ? 'Modo teste: todo e-mail vai só para <b>' + esc(d.redirecionar) + '</b> (o destinatário original aparece no assunto).' : 'Os e-mails vão para os clientes de verdade.') +
    lin(d.ultimo_erro ? false : true, '6. Último problema', d.ultimo_erro ? esc(explicarErroEmail(d.ultimo_erro.erro)) + ' <span class="sub">(' + dataHoraBR(d.ultimo_erro.em) + ')</span>' : 'Nenhum erro registrado.' + (d.ultimo_envio ? ' Último e-mail enviado em ' + dataHoraBR(d.ultimo_envio) + '.' : '')) +
    '</div><p class="sub" style="margin-top:8px">Depois de corrigir, clique em <b>🧪 Testar tudo</b>: o e-mail de teste chega em ' + esc(d.redirecionar || 'seu e-mail') + ' em segundos.</p>';
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
// Backup 50: status com cor própria (pílula), igual à prioridade
function pillStatusTarefa(st) { return '<span class="pill tf-st tf-st-' + esc(st || 'pendente') + '">' + esc(STATUS_TAREFA[st] || st || '—') + '</span>'; }
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
  // Backup 45: com cargo e nível (hierarquia); se o SQL novo ainda não rodou, cai na lista antiga
  if (!E._equipe) E._equipe = await q(sb.rpc('equipe_hierarquia')).catch(() => q(sb.rpc('equipe_nomes')).catch(() => []));
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
const FILA = { toda: false, min: false, vista: 'lista', ref: null, lida: false, quem: '', pessoas: null, tipos: null, pri: '', atalho: '' };
// Backup 38: a agenda mostra SÓ o que está em Tarefas (tarefas e compromissos lançados pela equipe).
// O administrador escolhe de quem ver: só as suas, todos, ou uma pessoa; os demais veem só as suas.
const ehAdminFila = () => !!(E.perfil && E.perfil.papel === 'admin');
const VISTAS_FILA = [['mes', 'Mês'], ['semana', 'Semana'], ['dia', 'Dia'], ['lista', 'Lista']];   // Backup 53: as mesmas vistas do Calendário de Tarefas (+ Lista)
// Backup 53: filtros de prioridade e de prazo — os MESMOS de Tarefas (Início e Tarefas usam estas duas funções)
const PRI_FILTRO = [['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']], PRAZO_FILTRO = [['hoje', 'Hoje'], ['atrasadas', 'Atrasadas'], ['7', '7 dias']];
// Backup 54: os filtros em 2 colunas × 2 linhas — à esquerda Mostrar / De quem, à direita Urgência / Prazo
function gruposPriPrazo(attrPri, attrPrazo, pri, atalho, extras) {
  const grupo = (rot, miolo) => '<div class="fila-chips" role="group" aria-label="' + rot + '"><span class="fila-chips-rot">' + rot + '</span>' + miolo + '</div>';
  return [grupo('Urgência', PRI_FILTRO.map(([k, r]) => chipFiltro(attrPri, k, r, pri === k)).join('')),
    attrPrazo ? grupo('Prazo', PRAZO_FILTRO.concat(extras || []).map(([k, r]) => chipFiltro(attrPrazo, k, r, atalho === k)).join('')) : '<div></div>'];
}
const filtros2x2 = (mostrar, deQuem, urg, prazo) => mostrar + urg + (deQuem || '<div></div>') + prazo;
function passaPriPrazo(t, pri, a) {
  const h = hojeISO();
  if (pri && t.prioridade !== pri) return false;
  if (a === 'hoje' && (tarefaFechada(t) || !t.prazo || t.prazo > h)) return false;
  if (a === 'atrasadas' && (tarefaFechada(t) || !t.prazo || t.prazo >= h)) return false;
  if (a === '7' && (tarefaFechada(t) || !t.prazo || t.prazo > somarDias(h, 7))) return false;
  return true;
}   // Backup 52 (C1): a Semana voltou ao Início — a MESMA de Tarefas → Calendário (arrastar remarca)
function salvarPrefFila() {
  const v = { vista: FILA.vista, min: FILA.min, quem: FILA.quem || '', pessoas: FILA.pessoas || null, tipos: FILA.tipos || null, pri: FILA.pri || '', atalho: FILA.atalho || '' };
  if (E.perfil) E.perfil.preferencias = Object.assign({}, E.perfil.preferencias || {}, { fila: v });
  sb.rpc('salvar_preferencia', { p_chave: 'fila', p_valor: v }).then(() => {}, () => {});
}
// Backup 36: compromissos na agenda (tarefas com tipo_agenda + hora) — cor por tipo e legenda
const TIPOS_AGENDA = [['reuniao', 'Reunião', '🤝'], ['audiencia', 'Audiência', '⚖'], ['compromisso', 'Compromisso', '📌']];   // Backup 40: sem Ligação
// legenda curta: compromissos (reunião, audiência, compromisso), tarefa e atrasada; ⚑ = prazo fatal
const legendaAgenda = () => '<div class="ag-leg">' + TIPOS_AGENDA.map(([k, r]) => '<span><i class="ag-cor ag-' + k + '"></i>' + r + '</span>').join('') +
  '<span><i class="ag-cor ag-tarefa"></i>Tarefa</span><span><i class="ag-cor ag-rotina"></i>Rotina</span><span><i class="ag-cor ag-atrasada"></i>Atrasada</span><span><i class="ag-cor ag-feita"></i>Concluída</span><span><i class="ag-cor ag-prevista"></i>Próxima (repete)</span><span>⚑ Prazo fatal</span></div>';
// Backup 45: filtros da agenda (marca/desmarca) — tipo do item e de quem é (respeitando o cargo: ninguém vê a agenda de quem está acima)
const FILTRO_TIPOS_AG = [['reuniao', 'Reuniões'], ['audiencia', 'Audiências'], ['compromisso', 'Compromissos'], ['tarefa', 'Tarefas'], ['rotina', 'Rotinas']];
function tipoItemAgenda(t) {
  if (t.tipo_agenda) return t.tipo_agenda === 'ligacao' ? 'compromisso' : t.tipo_agenda;
  if (/^reuniao:/.test(t.chave_regra || '')) return 'reuniao';
  return t.recorrencia || /^rot-/.test(t.chave_regra || '') ? 'rotina' : 'tarefa';
}
// Backup 48: o mesmo botão de filtro no Início e em Tarefas (tipo = com a cor do tipo)
function chipFiltro(attr, v, rot, on, comCor) {
  return '<button type="button" class="chip fila-chip' + (comCor && v !== '*' ? ' fila-chip-' + v : '') + (on ? ' ativo' : '') + '" ' + attr + '="' + esc(v) + '" data-tipo-filtro="' + (comCor ? 'tipo' : 'pes') + '"' +
    (comCor ? ' data-fila-tipo-v="' + esc(v) + '"' : '') + ' aria-pressed="' + (on ? 'true' : 'false') + '">' + (on ? '✓ ' : '') + esc(rot) + '</button>';
}
// marca/desmarca num conjunto; '*' = todos (ou nenhum, se já estavam todos)
function alternarFiltro(atual, v, todos) {
  let t = new Set(atual); if (v === '*') t = t.size >= todos.length ? new Set() : new Set(todos); else if (t.has(v)) t.delete(v); else t.add(v);
  return [...t];
}
function nivelDe(u) { return u ? (u.nivel != null ? Number(u.nivel) : nivelCargo(u.cargo, u.papel)) : 2; }
// quem eu posso ver/lançar: eu + quem está no mesmo nível ou abaixo (o administrador vê todos)
function pessoasVisiveis() {
  const eq = E._equipe || [], eu = eq.find((u) => primeiroNome(u.nome) === primeiroNome(meuNome()));
  const meu = ehAdminFila() ? 99 : nivelDe(eu);
  const nomes = eq.filter((u) => nivelDe(u) <= meu).map((u) => String(u.nome || '').trim()).filter(Boolean);
  if (!nomes.some((n) => primeiroNome(n) === primeiroNome(meuNome())) && meuNome()) nomes.unshift(meuNome());
  return [...new Set(nomes)].sort((a, b) => (primeiroNome(b) === primeiroNome(meuNome())) - (primeiroNome(a) === primeiroNome(meuNome())) || a.localeCompare(b, 'pt-BR'));
}
// Backup 40: aviso antes do compromisso (vira notificação + e-mail para quem participa; e um aviso na tela de quem está com o ERP aberto)
const AVISOS_AGENDA = [['', 'Não avisar'], ['15', '15 min antes'], ['30', '30 min antes'], ['60', '1 hora antes'], ['120', '2 horas antes'], ['1440', '1 dia antes'], ['2880', '2 dias antes']];
const TIPOS_AUDIENCIA = ['Conciliação', 'Instrução e julgamento', 'Una', 'Mediação', 'Justificação', 'Outra'];
// hora "HH:MM" → minutos; fim padrão = início + 1 h
const minHora = (h) => { const m = String(h || '').match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
const horaFaixa = (t) => (t.hora ? String(t.hora).slice(0, 5) + (t.hora_fim ? '–' + String(t.hora_fim).slice(0, 5) : '') : '');
// quem se sobrepõe: mesmas pessoas, mesmo dia, horários que se cruzam
async function conflitosAgenda(dia, ini, fim, pessoas, ignorar) {
  const a = minHora(ini); if (a == null) return [];
  const b = minHora(fim) != null && minHora(fim) > a ? minHora(fim) : a + 60;
  const ts = await q(sb.from('tarefas').select('id, titulo, hora, hora_fim, responsavel, participantes').eq('prazo', dia).not('hora', 'is', null).not('status', 'in', '(concluida,cancelada)')).catch(() => []);
  const nomes = pessoas.map(primeiroNome);
  return ts.filter((t) => t.id !== ignorar).filter((t) => {
    const x = minHora(t.hora), y = minHora(t.hora_fim) != null && minHora(t.hora_fim) > x ? minHora(t.hora_fim) : x + 60;
    const deles = [t.responsavel].concat(String(t.participantes || '').split(',')).map(primeiroNome).filter(Boolean);
    return x < b && a < y && deles.some((n) => nomes.includes(n));
  });
}
async function janelaAgendar(dataIni, depois) {
  // Backup 40: só quem está CADASTRADO e ativo (Administração → Usuários); descadastrou, sai da lista
  const eq = await equipe().catch(() => []);
  const pessoas = [...new Set(eq.map((u) => String(u.nome || '').trim()).filter(Boolean))];
  if (!pessoas.some((n) => primeiroNome(n) === primeiroNome(meuNome()))) pessoas.unshift(meuNome());
  const procs = await q(sb.from('processos').select('numero, autor, reu').order('numero').limit(1000)).catch(() => []);
  // Backup 45: dá para lançar para outra pessoa (quem está no mesmo nível ou abaixo) e "Tarefa" é um tipo também
  const podeVer = pessoasVisiveis();
  const j = abrirJanela({ titulo: '📅 Agendar', larga: true,
    corpo: '<form id="f-ag" class="grade ag-form" data-tipo="reuniao">' +
      '<div class="campo" style="grid-column:1/-1"><span>Tipo</span><div class="segmento ag-tipos" id="ag-tipo">' + TIPOS_AGENDA.concat([['tarefa', 'Tarefa', '✓']]).map(([k, r, ic], i) => '<button type="button" data-v="' + k + '"' + (i ? '' : ' class="ativo"') + '>' + ic + ' ' + r + '</button>').join('') + '</div></div>' +
      '<label class="campo"><span>Responsável</span><select name="resp">' + podeVer.map((n) => '<option value="' + esc(n) + '"' + (primeiroNome(n) === primeiroNome(meuNome()) ? ' selected' : '') + '>' + esc(n) + (primeiroNome(n) === primeiroNome(meuNome()) ? ' (eu)' : '') + '</option>').join('') + '</select></label>' +
      // Audiência: processo, tipo, vara e se é virtual
      '<label class="campo ag-so-aud ag-toda"><span>Número do processo *</span><input name="processo" list="ag-procs" autocomplete="off" placeholder="0000000-00.0000.0.00.0000"><datalist id="ag-procs">' +
        procs.map((p) => '<option value="' + esc(p.numero) + '">' + esc([p.autor, p.reu].filter(Boolean).join(' × ')) + '</option>').join('') + '</datalist></label>' +
      '<label class="campo ag-so-aud"><span>Tipo de audiência</span><select name="tipo_aud">' + TIPOS_AUDIENCIA.map((x) => '<option>' + x + '</option>').join('') + '</select></label>' +
      '<label class="campo ag-so-aud"><span>Formato</span><select name="formato"><option value="presencial">Presencial</option><option value="virtual">Virtual (link)</option><option value="hibrida">Híbrida</option></select></label>' +
      '<label class="campo ag-toda"><span class="ag-rot-titulo">Assunto *</span><input name="titulo" placeholder="ex.: Reunião sobre o parcelamento"></label>' +
      '<label class="campo"><span>Dia *</span><input type="date" name="prazo" required value="' + (dataIni || hojeISO()) + '"></label>' +
      '<div class="campo ag-horas ag-nao-tarefa"><span>Horário</span><div class="ag-hh"><input type="time" name="hora" value="09:00" aria-label="Início"><span class="sub">até</span><input type="time" name="hora_fim" value="10:00" aria-label="Fim"></div></div>' +
      '<div class="ag-conflito ag-toda" id="ag-conflito" hidden></div>' +
      '<label class="campo ag-toda"><span class="ag-rot-local">Local ou link</span><input name="local" placeholder="escritório, Google Meet…"></label>' +
      '<div class="campo ag-toda"><span>Quem mais participa</span><div class="ag-pessoas">' + pessoas.map((n) =>
        '<label class="ag-p"><input type="checkbox" name="part" value="' + esc(n) + '"><span>' + esc(nomeCurto(n)) + '</span></label>').join('') + '</div></div>' +
      // cliente cadastrado (escolhe na lista) OU texto livre (ex.: "Dr. Fulano, contador da empresa X")
      '<label class="campo ag-toda ag-nao-comp"><span class="ag-rot-com">Com quem (cliente ou qualquer nome)</span><input name="com" list="ag-clis" autocomplete="off" placeholder="Cliente cadastrado ou texto livre"><datalist id="ag-clis">' + E.clientes.map((c) => '<option value="' + esc(c.nome) + '">').join('') + '</datalist></label>' +
      '<div class="campo ag-avisos"><span>Avisar</span><div class="ag-av2"><select name="aviso" aria-label="1º aviso">' + AVISOS_AGENDA.map(([v, r]) => '<option value="' + v + '"' + (v === '30' ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>' +
        '<span class="sub">e</span><select name="aviso2" aria-label="2º aviso">' + AVISOS_AGENDA.map(([v, r]) => '<option value="' + v + '">' + (v ? r : 'sem 2º aviso') + '</option>').join('') + '</select></div></div>' +
      '<label class="campo ag-toda"><span>Observação</span><textarea name="descricao" rows="2"></textarea></label></form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="ag-ok">Agendar</button></div>' });
  const f = j.querySelector('#f-ag');
  let tipo = 'reuniao';
  const ROT = { reuniao: ['Assunto *', 'Local ou link', 'Com quem (cliente ou qualquer nome)', 'ex.: Reunião sobre o parcelamento', 'escritório, Google Meet…'],
    audiencia: ['Descrição (opcional)', 'Vara / juízo, ou link da sala virtual', 'Cliente (parte que representamos)', 'se vazio: "Audiência de conciliação — nº do processo"', 'ex.: 2ª Vara Cível de Belo Horizonte'],
    compromisso: ['O quê *', 'Local', 'Com quem (opcional)', 'ex.: Cartório, banco, perícia…', 'endereço'],
    tarefa: ['Tarefa *', 'Local (opcional)', 'Cliente (opcional)', 'ex.: Protocolar a defesa', ''] };
  const pintarTipo = () => {
    f.dataset.tipo = tipo;
    const r = ROT[tipo];
    f.querySelector('.ag-rot-titulo').textContent = r[0]; f.querySelector('.ag-rot-local').textContent = r[1]; f.querySelector('.ag-rot-com').textContent = r[2];
    f.titulo.placeholder = r[3]; f.local.placeholder = r[4];
  };
  j.querySelector('#ag-tipo').onclick = (ev) => { const b = ev.target.closest('[data-v]'); if (!b) return; tipo = b.dataset.v; j.querySelectorAll('#ag-tipo button').forEach((x) => x.classList.toggle('ativo', x === b)); pintarTipo(); };
  // fim acompanha o início (1 h depois) até a pessoa mexer no fim
  let fimMexido = false;
  f.hora_fim.oninput = () => { fimMexido = true; };
  f.hora.oninput = () => { if (!fimMexido && minHora(f.hora.value) != null) { const m = Math.min(minHora(f.hora.value) + 60, 23 * 60 + 59); f.hora_fim.value = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); } };
  // processo escolhido → cliente sugerido (autor) se "com quem" estiver vazio
  f.processo.onchange = () => { const p = procs.find((x) => x.numero === f.processo.value.trim()); if (p && !f.com.value) f.com.value = p.autor || ''; };
  // aviso de sobreposição (não impede, só mostra)
  const verConflito = async () => {
    const parts = [f.resp.value].concat([...f.querySelectorAll('[name=part]:checked')].map((x) => x.value));
    const c = f.dataset.tipo !== 'tarefa' && f.prazo.value && f.hora.value ? await conflitosAgenda(f.prazo.value, f.hora.value, f.hora_fim.value, parts) : [];
    const el = j.querySelector('#ag-conflito'); el.hidden = !c.length;
    el.innerHTML = c.length ? '⚠ Choca com: ' + c.map((x) => '<b>' + esc(horaFaixa(x)) + '</b> ' + esc(x.titulo) + ' (' + esc([x.responsavel].concat(String(x.participantes || '').split(',')).map(nomeCurto).filter(Boolean).join(', ')) + ')').join(' · ') : '';
    return c;
  };
  ['prazo', 'hora', 'hora_fim'].forEach((n) => f[n].addEventListener('change', verConflito));
  f.querySelectorAll('[name=part]').forEach((x) => x.addEventListener('change', verConflito));
  f.resp.addEventListener('change', verConflito);
  verConflito();
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#ag-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const proc = f.processo.value.trim();
    let titulo = f.titulo.value.trim();
    if (tipo === 'audiencia') {
      if (!proc) throw new Error('Audiência: informe o número do processo.');
      if (!titulo) titulo = 'Audiência de ' + f.tipo_aud.value.toLowerCase() + ' — ' + proc;
    } else if (!titulo) throw new Error(tipo === 'reuniao' ? 'Escreva o assunto da reunião.' : tipo === 'tarefa' ? 'Escreva a tarefa.' : 'Escreva o que é o compromisso.');
    if (!f.prazo.value) throw new Error('Escolha o dia.');
    const semHora = tipo === 'tarefa';
    if (!semHora && f.hora.value && f.hora_fim.value && minHora(f.hora_fim.value) <= minHora(f.hora.value)) throw new Error('O fim tem que ser depois do início.');
    const resp = f.resp.value || meuNome();
    const parts = [resp].concat([...f.querySelectorAll('[name=part]:checked')].map((x) => x.value).filter((n) => primeiroNome(n) !== primeiroNome(resp)));
    const c = semHora ? [] : await verConflito();
    if (c.length && !confirm('Este horário choca com ' + plural(c.length, 'compromisso', 'compromissos') + ' de quem participa. Agendar mesmo assim?')) return;
    const com = f.com.value.trim(), cli = E.clientes.find((x) => normalizar(x.nome) === normalizar(com));
    const local = f.local.value.trim();
    const obs = [tipo === 'audiencia' ? 'Audiência: ' + f.tipo_aud.value + ' · ' + ({ presencial: 'Presencial', virtual: 'Virtual', hibrida: 'Híbrida' }[f.formato.value]) : '', f.descricao.value.trim()].filter(Boolean).join('\n');
    await q(sb.from('tarefas').insert({ titulo, prazo: f.prazo.value, hora: semHora ? null : f.hora.value || null, hora_fim: !semHora && f.hora.value && f.hora_fim.value ? f.hora_fim.value : null,
      tipo_agenda: semHora ? '' : tipo, local, processos_vinculados: tipo === 'audiencia' ? proc : '', aviso_min: f.aviso.value ? +f.aviso.value : null,
      aviso2_min: f.aviso2.value && f.aviso2.value !== f.aviso.value ? +f.aviso2.value : null,
      responsavel: resp, participantes: parts.filter((n) => n !== resp).join(', '), cliente_id: cli ? cli.id : null, com_quem: cli ? '' : com,
      grupo_id: cli ? cli.grupo_id || null : null, descricao: obs, prioridade: tipo === 'audiencia' ? 'alta' : 'media', status: 'pendente' }));
    try { if (f.aviso.value && window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) { /* navegador sem aviso */ }
    fecharJanela(j); aviso('✓ Agendado para ' + dataBR(f.prazo.value) + (!semHora && f.hora.value ? ' às ' + f.hora.value : '') + (primeiroNome(resp) !== primeiroNome(meuNome()) ? ' — com ' + nomeCurto(resp) : '') + '.'); if (depois) depois();
  });
}
// Backup 40: aviso na tela de quem está com o ERP aberto (o e-mail sai pelo banco, rotina avisos_agenda)
let _vigiaAg = null;
function vigiarAgenda() {
  if (_vigiaAg) return;
  const ver = async () => {
    if (!E.perfil) return;
    const h = hojeISO(), am = iso(new Date(Date.now() + 2 * 864e5));
    const ts = await q(sb.from('tarefas').select('id, titulo, prazo, hora, hora_fim, local, aviso_min, aviso2_min, responsavel, participantes').gte('prazo', h).lte('prazo', am)
      .or('aviso_min.not.is.null,aviso2_min.not.is.null').not('hora', 'is', null).not('status', 'in', '(concluida,cancelada)')).catch(() => []);
    let vistos = {}; try { vistos = JSON.parse(localStorage.getItem('erp_avisos_ag') || '{}'); } catch (e) { /* sem armazenamento */ }
    const agora = Date.now();
    ts.filter((t) => ehMinha(t) || String(t.participantes || '').split(',').some((n) => primeiroNome(n) === primeiroNome(meuNome()))).forEach((t) => {
      const ini = new Date(t.prazo + 'T' + String(t.hora).slice(0, 5) + ':00').getTime();
      // Backup 45: dois avisos (cada um avisa uma vez)
      const k = [[t.id, t.aviso_min], [t.id + ':2', t.aviso2_min]].find(([id, m]) => m != null && !vistos[id] && agora >= ini - m * 6e4 && agora <= ini);
      if (!k) return;
      vistos[k[0]] = 1;
      const txt = horaFaixa(t) + ' · ' + t.titulo + (t.local ? ' · ' + t.local : '');
      aviso('🔔 ' + (t.prazo === h ? 'Hoje' : dataBR(t.prazo)) + ' ' + txt);
      try { if (window.Notification && Notification.permission === 'granted') new Notification('Agenda — ' + t.titulo, { body: txt }); } catch (e) { /* navegador sem aviso */ }
    });
    try { localStorage.setItem('erp_avisos_ag', JSON.stringify(vistos)); } catch (e) { /* sem armazenamento */ }
  };
  ver(); _vigiaAg = setInterval(ver, 60000);
}
function classeAgenda(t, d) {
  const h = hojeISO();
  if (t._cls) return t._cls;
  if (t.prazo_fatal === d) return 'ag-fatal';
  if (tarefaFechada(t)) return 'ag-feita';   // Backup 40: concluída fica riscada
  if (t.tipo_agenda) return 'ag-' + (t.tipo_agenda === 'ligacao' ? 'compromisso' : t.tipo_agenda);
  if (/^reuniao:/.test(t.chave_regra || '')) return 'ag-reuniao';   // reuniões marcadas pelo CRM
  if (t.prazo && t.prazo < h) return 'ag-atrasada';
  return tipoItemAgenda(t) === 'rotina' ? 'ag-rotina' : 'ag-tarefa';   // Backup 46: rotina com cor própria
}
const horaAg = (t) => (t.hora ? horaFaixa(t) + ' ' : '');
// Backup 39: o quadro "Atrasadas" é um só — Início (agenda) e Tarefas (Minha semana e Calendário)
function quadroAtrasadas(atr) {
  return '<aside class="fila-atrasadas"><div class="fila-atr-tit">⏰ Atrasadas <span class="pill ' + (atr.length ? 'vencido' : 'pago') + '">' + atr.length + '</span></div>' +
    (atr.length ? atr.map((t) => '<button type="button" class="fila-atr-it" data-fila="' + t.id + '" title="' + esc(t.titulo) + '"><b>' + esc(t.titulo) + '</b><span class="sub">prazo ' + dataBR(t.prazo) + ' · ' + plural(-diasAte(t.prazo), 'dia', 'dias') + ' de atraso</span></button>').join('')
      : '<div class="sub">Nenhuma atrasada. 🎉</div>') + '</aside>';
}
function calendarioFila(lista) {
  const h = hojeISO(), ref = FILA.ref || h, d0 = new Date(ref + 'T12:00:00');
  const doDia = (d) => lista.filter((t) => t.prazo === d || t.prazo_fatal === d).sort((a, b) => String(a.hora || '99').localeCompare(String(b.hora || '99')));
  const item = (t, d) => '<button type="button" class="cal-tf ' + classeAgenda(t, d) + '" data-fila="' + t.id + '"' + (t._prev ? ' data-prevista="' + d + '"' : '') + ' title="' + esc(horaAg(t) + t.titulo + (t.local ? ' · ' + t.local : '') + (t._prev ? ' · próxima ocorrência (' + textoRepete(t) + ')' : ' · prioridade ' + ((PRIORIDADE[t.prioridade] || ['—'])[0]) + ' · ' + (STATUS_TAREFA[t.status] || ''))) + '">' +
    // Backup 50: bolinha da prioridade (vermelha alta, âmbar média, verde baixa) dentro do item do calendário
    '<span class="cal-pri cal-pri-' + esc(t.prioridade || 'media') + '" aria-hidden="true"></span>' +
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
  const lado = quadroAtrasadas(lista.filter((t) => t.prazo && t.prazo < h && !tarefaFechada(t)).sort((a, b) => a.prazo.localeCompare(b.prazo)));
  return '<div class="fila-com-atr">' + lado + '<div class="fila-cal-area"><div class="fila-cal-nav"><button type="button" class="btn btn-o btn-mini" data-fila-nav="-1" aria-label="Anterior">‹</button><b>' + esc(titulo) + '</b>' +
    '<button type="button" class="btn btn-o btn-mini" data-fila-nav="1" aria-label="Próximo">›</button><button type="button" class="btn btn-o btn-mini" data-fila-nav="0">Hoje</button>' +
    '<button type="button" class="btn btn-p btn-mini ag-bt" data-agendar>+ Agendar</button></div>' + corpo + legendaAgenda() + '</div></div>';
}
async function cardMinhaFila() {
  if (!FILA.lida) { const p = (E.perfil && E.perfil.preferencias && E.perfil.preferencias.fila) || {}; if (p.vista) FILA.vista = ['lista', 'semana', 'mes', 'dia'].includes(p.vista) ? p.vista : 'mes'; FILA.min = false; FILA.quem = p.quem || ''; FILA.pri = p.pri || ''; FILA.atalho = p.atalho || '';
    FILA.pessoas = Array.isArray(p.pessoas) ? p.pessoas : null; FILA.tipos = Array.isArray(p.tipos) ? p.tipos : null; FILA.lida = true; }
  await feriados();
  await equipe().catch(() => []);
  const ts = await q(sb.from('tarefas').select('*').not('status', 'in', '(concluida,cancelada)')).catch(() => []);
  // Backup 46: o que foi concluído nos últimos 60 dias aparece riscado no calendário
  const feitas = FILA.vista === 'lista' ? [] : await q(sb.from('tarefas').select('*').eq('status', 'concluida').not('prazo', 'is', null).gte('prazo', somarDias(hojeISO(), -60))).catch(() => []);
  // Backup 45: filtros que se marcam/desmarcam — pessoas (eu + quem está no mesmo nível ou abaixo) e tipos (reunião, audiência, compromisso, tarefa, rotina).
  // A tarefa aparece para o responsável, para quem participa e para quem valida (revisor).
  const visiveis = pessoasVisiveis(), chave = (n) => primeiroNome(n), eu = chave(meuNome());
  const okVis = new Set(visiveis.map(chave));
  let sel = (FILA.pessoas || [eu]).filter((k) => okVis.has(k)); if (!sel.length) sel = [eu];
  const tiposSel = new Set(FILA.tipos && FILA.tipos.length ? FILA.tipos : FILTRO_TIPOS_AG.map((x) => x[0]));
  const daPessoa = (t) => [t.responsavel, t.revisor].concat(String(t.participantes || '').split(',')).some((n) => n && sel.includes(chave(n))) && passaPriPrazo(t, FILA.pri, FILA.atalho);
  const todas = ordenarFila(ts.filter((t) => daPessoa(t) && tiposSel.has(tipoItemAgenda(t)) && !/^(cob|parc|aco):/.test(t.chave_regra || ''))), minhas = FILA.toda ? todas : todas.slice(0, 10);
  // Backup 51 (T2): as próximas ocorrências das tarefas que se repetem já aparecem no calendário (tracejadas)
  const proj = FILA.vista === 'lista' ? [] : await projecoesRecorrentes();
  const naAgenda = todas.concat(feitas.filter((t) => daPessoa(t) && tiposSel.has(tipoItemAgenda(t))), proj.filter((t) => daPessoa(t) && tiposSel.has(tipoItemAgenda(t))));
  const rotQuem = sel.length === 1 && sel[0] === eu ? 'suas' : sel.length >= okVis.size && okVis.size > 1 ? 'de todos' : sel.map((k) => nomeCurto(visiveis.find((n) => chave(n) === k) || k)).join(', ');
  const chip = (attr, v, rot, on) => chipFiltro(attr, v, rot, on, attr === 'data-fila-tipo');
  const [gUrg, gPrazo] = gruposPriPrazo('data-fila-pri', 'data-fila-prazo', FILA.pri, FILA.atalho);
  const filtros = '<div class="fila-filtros fila-2x2">' + filtros2x2(
    '<div class="fila-chips" role="group" aria-label="Mostrar"><span class="fila-chips-rot">Mostrar</span>' + chip('data-fila-tipo', '*', 'Tudo', tiposSel.size === FILTRO_TIPOS_AG.length) +
      FILTRO_TIPOS_AG.map(([k, r]) => chip('data-fila-tipo', k, r, tiposSel.has(k))).join('') + '</div>',
    (visiveis.length > 1 ? '<div class="fila-chips" role="group" aria-label="De quem"><span class="fila-chips-rot">De quem</span>' +
      // Backup 46: Todos primeiro, depois quem está logado, depois os demais
      chip('data-fila-pes', '*', 'Todos', sel.length >= okVis.size) + visiveis.map((n) => chip('data-fila-pes', chave(n), nomeCurto(n), sel.includes(chave(n)))).join('') + '</div>' : ''), gUrg, gPrazo) + '</div>';
  const html = '<div class="card ini-fila' + (FILA.min ? ' minimizada' : '') + '"><div class="card-hd">📋 Minha fila de trabalho ' + '<span class="sub">' + plural(todas.length, 'aberta', 'abertas') + ' · ' + esc(rotQuem) + '</span>' +
      '<div class="segmento ini-fila-vista" role="group" aria-label="Ver como">' + VISTAS_FILA.map(([v, r]) => '<button type="button" data-fila-vista="' + v + '"' + (FILA.vista === v ? ' class="ativo"' : '') + '>' + r + '</button>').join('') + '</div>' +
      '</div>' +   // Backup 39: sem "Minimizar" 
    (FILA.min ? '' : '<div class="card-bd">' + filtros + (FILA.vista === 'semana' ? '<div id="ini-semana"></div>' : FILA.vista !== 'lista' ? calendarioFila(naAgenda) :
    (minhas.length ? '<div class="lista-ficha fila-compacta">' + minhas.map((t) => '<div class="item-ficha clicavel" data-fila="' + t.id + '"><div>' + bolinha(t) + (t.tipo_agenda ? ' <i class="ag-cor ag-' + t.tipo_agenda + '"></i>' : '') + ' <b>' + (t.hora ? horaAg(t) : '') + esc(t.titulo) + '</b>' + seloPrazo(t) +
      '<div class="sub">' + (t.prazo ? 'prazo ' + dataBR(t.prazo) : 'sem prazo') + (t.prazo_fatal ? ' · ⚑ fatal ' + dataBR(t.prazo_fatal) : '') + (t.status === 'revisao' ? ' · aguardando revisão' : '') +
      (quemTarefa(t) ? ' · ' + esc(quemTarefa(t)) : '') + '</div></div>' +
      '<span class="pill ' + (PRIORIDADE[t.prioridade] || ['', 'neutro'])[1] + '">' + esc((PRIORIDADE[t.prioridade] || [t.prioridade])[0]) + '</span></div>').join('') + '</div>' +
      (todas.length > 10 ? '<div class="ini-fila-mais"><button type="button" class="btn btn-o btn-mini" data-fila-toda>' + (FILA.toda ? '▴ Mostrar só as 10 primeiras' : '▾ Ver todas (' + todas.length + ')') + '</button></div>' : '')
      : '<div class="sub">' + (FILA.quem ? 'Nenhuma tarefa aberta.' : 'Nenhuma tarefa com você.') + ' 🎉</div>')) + '</div>') + '</div>';
  const repinta = async (raiz) => { const c = await cardMinhaFila(); raiz.innerHTML = c.html; c.ligar(raiz); };
  return { html, ligar: (raiz) => {
    // Backup 46: a Lista fica da mesma altura do calendário (trocar Lista ↔ Mês não muda o tamanho do quadro)
    const bd = raiz.querySelector('.ini-fila > .card-bd');
    const medir = () => { if (bd && FILA.vista === 'mes' && bd.offsetHeight > 200) FILA.altCal = bd.offsetHeight; else if (bd && FILA.vista === 'semana' && FILA.altCal) bd.style.minHeight = FILA.altCal + 'px'; };
    // Backup 52 (C3): a Lista acompanha o conteúdo (com filtro e poucos itens, o quadro encolhe); com muitos, para na altura do calendário e rola por dentro
    if (bd) { if (FILA.vista !== 'lista') requestAnimationFrame(medir); else { bd.style.maxHeight = (FILA.altCal || 680) + 'px'; bd.style.overflowY = 'auto'; } }
    // Backup 52 (C1): Semana = a mesma de Tarefas → Calendário (arrastar remarca o prazo)
    const sem = raiz.querySelector('#ini-semana');
    if (sem) semanaArrastavel(sem, { lista: todas, estado: FILA, atrasadas: true, cartao: false, rotulo: rotQuem, altura: FILA.altCal ? FILA.altCal - 90 : 600,
      abrir: (t) => abrirTarefa(t, () => irPara(E.tela)), repintar: () => repinta(raiz) });
    raiz.querySelectorAll('[data-fila]').forEach((d) => { if (d.closest('#ini-semana')) return; d.onclick = () => {
      abrirTarefa(ts.find((t) => t.id === d.dataset.fila), () => irPara(E.tela)); }; });
    raiz.querySelectorAll('[data-fila-tipo]').forEach((b) => b.onclick = () => { const v = b.dataset.filaTipo, todos = FILTRO_TIPOS_AG.map((x) => x[0]);
      let t = new Set(tiposSel); if (v === '*') t = t.size === todos.length ? new Set() : new Set(todos); else if (t.has(v)) t.delete(v); else t.add(v);
      FILA.tipos = t.size ? [...t] : []; if (!t.size) FILA.tipos = ['__nada']; salvarPrefFila(); repinta(raiz); });
    raiz.querySelectorAll('[data-fila-pri]').forEach((b) => b.onclick = () => { FILA.pri = FILA.pri === b.dataset.filaPri ? '' : b.dataset.filaPri; salvarPrefFila(); repinta(raiz); });
    raiz.querySelectorAll('[data-fila-prazo]').forEach((b) => b.onclick = () => { FILA.atalho = FILA.atalho === b.dataset.filaPrazo ? '' : b.dataset.filaPrazo; salvarPrefFila(); repinta(raiz); });
    raiz.querySelectorAll('[data-fila-pes]').forEach((b) => b.onclick = () => { const v = b.dataset.filaPes;
      let p = new Set(sel); if (v === '*') p = p.size >= okVis.size ? new Set([eu]) : new Set(okVis); else if (p.has(v)) p.delete(v); else p.add(v);
      FILA.pessoas = p.size ? [...p] : [eu]; salvarPrefFila(); repinta(raiz); });
    const bt = raiz.querySelector('[data-fila-toda]'); if (bt) bt.onclick = () => { FILA.toda = !FILA.toda; repinta(raiz); };
    raiz.querySelectorAll('[data-fila-vista]').forEach((b) => b.onclick = () => { medir(); FILA.vista = b.dataset.filaVista; FILA.min = false; FILA.ref = null; salvarPrefFila(); repinta(raiz); });
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
// pessoas dos filtros: quem está cadastrado (Administração → Usuários); sem cadastro ainda, as de sempre
function pessoasFiltro() { const eq = (E._equipe || []).map((u) => String(u.nome || '').trim()).filter(Boolean); return eq.length ? [...new Set(eq)] : Object.keys(PESSOA); }
function quemTarefa(t) { return nomeCliente(t.cliente_id) || nomeGrupo(t.grupo_id) || (t.com_quem || ''); }
function nomeCliente(id) { const c = E.clientes.find((x) => x.id === id); return c ? c.nome : ''; }

// ─────────────────────────── tela ───────────────────────────
TELAS.tarefas = async function () {
  await equipe().catch(() => []);
  vigiarAgenda();
  E.tf = E.tf || { vista: 'lista', atalho: '', resp: '', pri: '', busca: '', mes: hojeISO().slice(0, 7) };
  const F = E.tf;
  // abas: o painel mostra só o que está em aberto; concluídas e excluídas ficam separadas
  F.aba = F.aba || 'abertas'; if (F.atalho === 'abertas' || F.atalho === 'concluidas') F.atalho = '';
  // Backup 49: Minha semana virou a vista Semana do Calendário; o Quadro saiu (repetia a Lista)
  if (F.vista === 'semana') { F.vista = 'calendario'; F.calVista = 'semana'; }
  if (F.vista === 'kanban') F.vista = 'lista';
  if (F.atalho === 'minhas') F.atalho = '';
  $('conteudo').innerHTML =
    // Backup 49: abas junto do título; só "+ Nova tarefa" e "Fluxo" à vista — o resto no ⚙ (Backup 55: a criação rápida ⚡ saiu)
    '<div class="titulo-pag"><div><h1>Tarefas</h1><div class="segmento tf-abas-seg" id="tf-abas">' + [['abertas', 'Em aberto'], ['concluidas', 'Concluídas'], ['excluidas', 'Excluídas']]
      .map(([v, r]) => '<button data-aba="' + v + '">' + r + '</button>').join('') + '</div></div>' +
    '<div class="acoes">' +
    '<span class="tf-cfg-wrap"><button class="btn btn-o tf-bt-ic" id="tf-config" title="Configurar: modelos de fluxo, feriados, Google Agenda e novo fluxo" aria-expanded="false">⚙</button>' +
      '<span class="tf-cfg-menu" id="tf-cfg-menu" hidden><button class="btn btn-o" id="tf-modelos">Modelos de fluxo</button>' +
      '<button class="btn btn-o" id="tf-feriados">Feriados</button><button class="btn btn-o" id="tf-agenda" title="Prazos fatais e audiências no seu Google Agenda">📅 Google Agenda</button></span></span>' +
    // Backup 54: "Delegar" saiu daqui — virou o botão "Fluxo" (as sequências com validação, como "Lead completo", estão na lista de modelos do fluxo)
    '<button class="btn btn-o" id="tf-fluxo" title="Cria várias tarefas de uma vez a partir de um modelo (inclui as sequências com validação, ex.: Lead completo)">🔀 Fluxo</button><button class="btn btn-p" id="tf-nova">+ Nova tarefa</button></div></div>' +
    '<div id="tf-kpis"></div><div class="filtros">' +
    '<div class="segmento" id="tf-vista">' + [['lista', 'Lista'], ['calendario', 'Calendário'], ['fluxos', 'Fluxos']]
      .map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<input class="busca" id="tf-busca" placeholder="Buscar tarefa, cliente, processo ou etiqueta" autocomplete="off">' +
    // Backup 48/49: Mostrar (tipo, prioridade e prazo) e De quem — o mesmo desenho da agenda do Início
    '</div><div class="fila-filtros tf-filtros" id="tf-chips"></div><div id="tf-corpo"><div class="carregando">Carregando…</div></div>';
  $('tf-nova').onclick = () => formTarefa({}, () => TELAS.tarefas());
  $('tf-config').onclick = (ev) => { ev.stopPropagation(); const m = $('tf-cfg-menu'); m.hidden = !m.hidden; $('tf-config').setAttribute('aria-expanded', String(!m.hidden)); };
  if (!window._tfCfgDoc) { window._tfCfgDoc = true; document.addEventListener('click', (ev) => { const m = $('tf-cfg-menu'); if (m && !m.hidden && !ev.target.closest('.tf-cfg-wrap')) m.hidden = true; }); }
  $('tf-cfg-menu').addEventListener('click', () => { setTimeout(() => { const m = $('tf-cfg-menu'); if (m) m.hidden = true; }, 0); });
  $('tf-fluxo').onclick = () => formNovoFluxo(() => TELAS.tarefas());
  $('tf-modelos').onclick = () => janelaModelos();
  $('tf-feriados').onclick = () => janelaFeriados();
  $('tf-agenda').onclick = () => janelaAgenda();
  $('tf-vista').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.vista = b.dataset.v; pintarTarefas(); } };
  $('tf-abas').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.aba = b.dataset.aba; pintarTarefas(); } };
  $('tf-chips').onclick = (ev) => { const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.tfTipo != null) F.tipos = alternarFiltro(F.tipos || FILTRO_TIPOS_AG.map((x) => x[0]), b.dataset.tfTipo, FILTRO_TIPOS_AG.map((x) => x[0]));
    else if (b.dataset.tfPri != null) F.pri = F.pri === b.dataset.tfPri ? '' : b.dataset.tfPri;
    else if (b.dataset.tfPrazo != null) F.atalho = F.atalho === b.dataset.tfPrazo ? '' : b.dataset.tfPrazo;
    else { const todos = pessoasFiltro().map(primeiroNome); F.pessoas = alternarFiltro(F.pessoas && F.pessoas.length ? F.pessoas : todos, b.dataset.tfPes, todos); if (!F.pessoas.length) F.pessoas = [primeiroNome(meuNome())]; }
    pintarTarefas(); };
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
    if (F.tipos && !F.tipos.includes(tipoItemAgenda(t))) return false;
    if (F.pessoas && F.pessoas.length && ![t.responsavel, t.revisor].concat(String(t.participantes || '').split(',')).some((n) => n && F.pessoas.includes(primeiroNome(n)))) return false;
    if (F.pri && t.prioridade !== F.pri) return false;
    if (b && !normalizar(t.titulo + ' ' + t.processos_vinculados + ' ' + nomeGrupo(t.grupo_id) + ' ' + nomeCliente(t.cliente_id) + ' ' + t.etiquetas + ' ' + t.descricao).includes(b)) return false;
    return true;
  });
}

function pintarTarefas() {
  const F = E.tf, h = hojeISO();
  document.querySelectorAll('#tf-vista button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === F.vista));
  document.querySelectorAll('#tf-abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === F.aba));
  // Backup 48: filtros em botões que se marcam/desmarcam (iguais aos da agenda do Início); pessoas: Todos, eu, depois os outros
  { const tipos = FILTRO_TIPOS_AG.map((x) => x[0]), tSel = new Set(F.tipos || tipos), eu = primeiroNome(meuNome());
    const pes = pessoasFiltro().slice().sort((a, b) => (primeiroNome(b) === eu) - (primeiroNome(a) === eu) || a.localeCompare(b, 'pt-BR'));
    const pSel = new Set(F.pessoas && F.pessoas.length ? F.pessoas : pes.map(primeiroNome)), todasP = pSel.size >= pes.length;
    const prazos = [['hoje', 'Hoje'], ['atrasadas', 'Atrasadas'], ['7', '7 dias']].concat(F.atalho === 'atencao' ? [['atencao', 'Pedem atenção']] : []);
    const [gUrg, gPrazo] = gruposPriPrazo('data-tf-pri', F.aba === 'abertas' && F.vista !== 'fluxos' ? 'data-tf-prazo' : '', F.pri, F.atalho, prazos.slice(3));
    $('tf-chips').classList.add('fila-2x2');
    $('tf-chips').innerHTML = filtros2x2('<div class="fila-chips" role="group" aria-label="Mostrar"><span class="fila-chips-rot">Mostrar</span>' +
        chipFiltro('data-tf-tipo', '*', 'Tudo', tSel.size === tipos.length, true) + FILTRO_TIPOS_AG.map(([k, r]) => chipFiltro('data-tf-tipo', k, r, tSel.has(k), true)).join('') + '</div>',
      (pes.length > 1 ? '<div class="fila-chips" role="group" aria-label="De quem"><span class="fila-chips-rot">De quem</span>' +
        chipFiltro('data-tf-pes', '*', 'Todos', todasP) + pes.map((n) => chipFiltro('data-tf-pes', primeiroNome(n), nomeCurto(n), pSel.has(primeiroNome(n)))).join('') + '</div>' : ''), gUrg, gPrazo); }
  const todas = E._tarefas || [];
  const abertas = todas.filter((t) => !tarefaFechada(t));
  const atrasadas = abertas.filter((t) => t.prazo && t.prazo < h).length;
  const fatais = abertas.filter((t) => t.prazo_fatal && t.prazo_fatal >= h && t.prazo_fatal <= somarDias(h, 7)).length;
  const minhas = abertas.filter(ehMinha).length;
  const kpis = '<div class="kpis">' + kpi('Em aberto', String(abertas.length), '', minhas + ' comigo') +
    kpi('Atrasadas', String(atrasadas), atrasadas ? 'vermelho' : 'verde', 'todas as pessoas') +
    kpi('Prazos fatais em 7 dias', String(fatais), fatais ? 'ambar' : '', 'tarefas com prazo fatal marcado') +
    kpi('Concluídas no mês', String(todas.filter((t) => t.status === 'concluida' && String(t.concluida_em || '').slice(0, 7) === h.slice(0, 7)).length), 'verde', '') + '</div>';
  const V = { lista: vistaLista, calendario: vistaCalendario, fluxos: vistaFluxos };
  $('tf-kpis').innerHTML = kpis; $('tf-corpo').innerHTML = '<div id="tf-vista-corpo"></div>';
  if (!V[F.vista]) F.vista = 'lista';
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
      (t.recorrencia ? ' <span class="pill neutro tf-repete" title="' + esc(textoRepete(t)) + '">' + esc(textoRepete(t)) + '</span>' : '') +
      // Backup 55: o progresso do fluxo vai na linha de baixo, junto do cliente (a tarefa ocupa no máximo 2 linhas)
      ((sub || progresso(t, filhas)) ? '<div class="sub tf-linha2">' + barraProgresso(progresso(t, filhas)) + (sub ? ' ' + esc(sub) : '') + '</div>' : '') + '</td>' +
      '<td>' + pillPessoa(t.responsavel) + '</td><td><span class="pill ' + pr[1] + '">' + esc(pr[0]) + '</span></td><td>' + pillStatusTarefa(t.status) + '</td>' +
      // Backup 50: Prazo e Dias em colunas separadas (como no Financeiro)
      '<td class="mono" data-ord="' + esc(t.prazo || '9999') + '">' + (t.prazo ? dataBR(t.prazo) : '<span class="sub">—</span>') + '</td>' +
      '<td data-ord="' + (t.prazo && !tarefaFechada(t) ? diasAte(t.prazo) : 99999) + '">' + (t.prazo && !tarefaFechada(t) ? celulaAtraso(t.prazo) : '<span class="sub">—</span>') + '</td>' +
      '<td class="acoes-l">' + (t.status === 'cancelada'
        ? '<button class="btn btn-o btn-mini" data-restaurar-t="' + t.id + '">↩ Restaurar</button>' + ((E.perfil || {}).papel === 'admin' ? ' <button class="btn btn-x btn-mini" data-apagar-t="' + t.id + '">Excluir de vez</button>' : '')
        : (tarefaFechada(t) ? '' : '<button class="btn btn-v btn-mini" data-concluir="' + t.id + '">✓ Concluir</button>')) + '</td></tr>' +   // Backup 39: sem ✎ (editar fica no detalhe)
      filhas.filter((f) => ids.has(f.id)).map((f) => linha(f, nivel + 1)).join('');
  };
  alvo.innerHTML = '<div class="card">' + (raizes.length ? '<div class="tabela-wrap"><table><thead><tr><th>Grupo</th><th>Tarefa</th><th>Pessoa</th><th>Prioridade</th><th>Status</th><th data-tipo="data">Prazo</th><th data-tipo="num">Dias</th><th class="sem-ordem"></th></tr></thead><tbody>' +
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
async function vistaCalendario(raiz) {
  // Backup 49: Calendário com Mês · Semana · Dia (a "Minha semana" de arrastar virou a Semana daqui; o Início ficou só com Lista e Mês)
  const F = E.tf; F.calVista = F.calVista || 'mes';
  raiz.innerHTML = '<div class="segmento tf-cal-vista" id="tf-cal-vista">' + [['mes', 'Mês'], ['semana', 'Semana'], ['dia', 'Dia']]
    .map(([v, r]) => '<button type="button" data-cal-v="' + v + '"' + (F.calVista === v ? ' class="ativo"' : '') + '>' + r + '</button>').join('') + '</div><div id="tf-cal-corpo"></div>';
  raiz.querySelector('#tf-cal-vista').onclick = (ev) => { const b = ev.target.closest('[data-cal-v]'); if (b) { F.calVista = b.dataset.calV; pintarTarefas(); } };
  const alvo = raiz.querySelector('#tf-cal-corpo');
  if (F.calVista === 'semana') return vistaSemana(alvo);
  // Backup 39: o MESMO calendário do Início (quadro Atrasadas, cores da legenda, sem cinza depois do último dia); clicar abre o detalhe
  await feriados();
  const dia = F.calVista === 'dia';
  F.dia = F.dia || hojeISO();
  const salvo = { vista: FILA.vista, ref: FILA.ref };
  FILA.vista = dia ? 'dia' : 'mes'; FILA.ref = dia ? F.dia : F.mes + '-01';
  // Backup 40: em "Em aberto" as concluídas do mês também aparecem, riscadas
  const filtradas = filtrarTarefas(), idsF = new Set(filtradas.map((t) => t.id));
  // Backup 51 (T2): as próximas ocorrências (tracejadas) das tarefas que se repetem e estão na lista filtrada
  const proj = F.aba === 'abertas' ? (await projecoesRecorrentes()).filter((x) => idsF.has(x.id)) : [];
  const pre = dia ? F.dia : F.mes + '-', lista = filtradas.concat(F.aba === 'abertas' ? (E._tarefas || []).filter((t) => t.status === 'concluida' && String(t.prazo || '').startsWith(pre)) : [], proj);
  alvo.innerHTML = '<div class="card ini-fila tf-cal"><div class="card-bd">' + calendarioFila(lista) + '</div></div>';
  FILA.vista = salvo.vista; FILA.ref = salvo.ref;
  // Backup 53: a Semana fica do mesmo tamanho do Mês (guarda a altura do calendário do mês)
  if (!dia) requestAnimationFrame(() => { const c = alvo.querySelector('.tf-cal'); if (c && c.offsetHeight > 300) F.altCal = c.offsetHeight; });
  const [a, m] = F.mes.split('-').map(Number);
  alvo.querySelectorAll('[data-fila-nav]').forEach((b) => b.onclick = () => {
    const n = +b.dataset.filaNav;
    if (dia) { F.dia = n ? somarDias(F.dia, n) : hojeISO(); return pintarTarefas(); }
    const d = n ? new Date(a, m - 1 + n, 1) : new Date();
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
      '<div class="tf-ficha-hd"><h3>' + bolinha(t) + ' ' + esc(t.titulo) + '</h3><div class="tf-selos">' + pillStatusTarefa(t.status) + ' <span class="pill ' + pr[1] + '">' + esc(pr[0]) + '</span>' + seloPrazo(t) + seloFatal(t) + '</div></div>' +
      '<div class="tf-grade">' +
        linha(t.tipo_agenda ? 'Dia' : 'Prazo', t.prazo ? dataBR(t.prazo) + (t.hora ? ' · <b>' + esc(horaFaixa(t)) + '</b>' : '') : '<span class="sub">sem prazo</span>') +
        linha('Tipo', t.tipo_agenda ? esc((TIPOS_AGENDA.find(([k]) => k === t.tipo_agenda) || [, t.tipo_agenda])[1]) : '') +
        linha('Local', esc(t.local || '')) +
        linha('Aviso', [[t.aviso_min, t.aviso_em], [t.aviso2_min, t.aviso2_em]].filter(([m]) => m != null).map(([m, em]) => esc((AVISOS_AGENDA.find(([v]) => +v === m) || [, m + ' min antes'])[1]) + (em ? ' <span class="sub">· enviado</span>' : '')).join(' e ')) +
        linha('Prazo fatal', t.prazo_fatal ? '<b>' + dataBR(t.prazo_fatal) + '</b>' : '') +
        linha('Cliente', esc(quemTarefa(t) || '')) +
        linha('Responsável', pillPessoa(t.responsavel)) +
        linha('Participantes', String(t.participantes || '').split(',').map((x) => x.trim()).filter(Boolean).map(pillPessoa).join(' ')) +
        linha('Revisor', t.exige_revisao || t.revisor ? pillPessoa(t.revisor) : '') +
        linha('Processos', esc(t.processos_vinculados || '')) +
        linha('Origem', esc(origem)) +
        linha('Repete', t.recorrencia ? '<span class="tf-repete">' + esc(textoRepete(t)) + '</span>' : '') +
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
    if (t.recorrencia_serie && t.recorrencia_regra) {   // Backup 51: na série, pular = cancelar só esta ocorrência
      await q(sb.from('tarefas').update({ status: 'cancelada' }).eq('id', t.id));
      await sb.from('comentarios').insert({ tarefa_id: t.id, texto: '⏭ Pulada a ocorrência de ' + dataBR(t.prazo) }).then(() => {}, () => {});
      esquecerProjecoes(); aviso('⏭ Pulada. As próximas continuam (' + textoRepete(t) + ').'); fecharJanela(j); return depois2(); }
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

// ═══ Backup 51 (T1–T3): regra de repetição — "toda segunda", "dias 5 e 20", "5º dia útil", "última sexta"… ═══
// A regra fica em tarefas.recorrencia_regra (jsonb). As datas certas são calculadas no banco (recorrencia_datas) — aqui há uma cópia
// fiel só para a prévia do formulário (o teste erp.js confere que as duas dão as mesmas datas).
const DIAS_SEM_ISO = ['', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
const DIAS_SEM_CURTO = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const ORDENS_SEM = [[1, '1ª'], [2, '2ª'], [3, '3ª'], [4, '4ª'], [-1, 'última']];
// Backup 53: atalhos "Todo dia útil" e "Quinzenal (a cada 2 semanas)" — viram a mesma regra semanal (dias de seg a sex / a cada 2 semanas)
const TIPOS_REPETE = [['', 'Não repete'], ['uteis', 'Todo dia útil (seg a sex)'], ['semanal', 'Toda semana, nos dias…'], ['quinzenal', 'Quinzenal (a cada 2 semanas)'], ['semanas', 'A cada N semanas'], ['mensal_dias', '2× ao mês, nos dias…'], ['mensal', 'Todo mês'], ['anual', 'Todo ano']];
const isoDow = (d) => { const x = new Date(d + 'T12:00:00').getDay(); return x === 0 ? 7 : x; };
const fimDoMesIso = (d) => { const x = new Date(d + 'T12:00:00'); return iso(new Date(x.getFullYear(), x.getMonth() + 1, 0)); };
function listaE(a) { return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1]; }
// a regra "efetiva": a nova ou a antiga (semanal / mensal / anual a partir do prazo) — igual a regra_da_tarefa() do banco
function regraDaTarefa(t) {
  if (!t) return null;
  if (t.recorrencia_regra && t.recorrencia_regra.tipo) return t.recorrencia_regra;
  if (!t.prazo) return null;
  const [, m, d] = t.prazo.split('-').map(Number);
  if (t.recorrencia === 'semanal') return { tipo: 'semanal', dias: [isoDow(t.prazo)], inicio: t.prazo };
  if (t.recorrencia === 'mensal') return { tipo: 'mensal', modo: 'dia', dia: d, inicio: t.prazo };
  if (t.recorrencia === 'anual') return { tipo: 'anual', mes: m, dia: d, inicio: t.prazo };
  return null;
}
// por extenso: "toda segunda, a partir de 13/10"
function textoRegra(r) {
  if (!r || !r.tipo) return '';
  const dm = (d) => { const s = dataBR(d); return d && d.slice(0, 4) === hojeISO().slice(0, 4) ? s.slice(0, 5) : s; };
  const toda = (dw) => (dw >= 6 ? 'todo ' : 'toda ');
  const dias = (r.dias || []).map(Number).filter(Boolean).sort((a, b) => a - b);
  let t = '';
  if (r.tipo === 'semanal' && (Number(r.cada) || 1) > 1) t = 'a cada ' + r.cada + ' semanas, ' + (dias[0] >= 6 ? 'no ' : 'na ') + listaE(dias.map((x) => DIAS_SEM_ISO[x]));
  else if (r.tipo === 'semanal') t = toda(dias[0]) + listaE(dias.map((x) => DIAS_SEM_ISO[x]));
  else if (r.tipo === 'mensal_dias') t = dias.length + '× ao mês, nos dias ' + listaE(dias.map(String));
  else if (r.tipo === 'mensal' && r.modo === 'util') t = 'todo mês no ' + (Number(r.n) || 1) + 'º dia útil';
  else if (r.tipo === 'mensal' && r.modo === 'semana') { const dw = Number(r.dow) || 5, o = Number(r.ordem) || 1;
    t = toda(dw) + (o === -1 ? (dw >= 6 ? 'último ' : 'última ') : (ORDENS_SEM.find(([k]) => k === o) || [, o + 'ª'])[1].replace('ª', dw >= 6 ? 'º' : 'ª') + ' ') + DIAS_SEM_ISO[dw] + ' do mês'; }
  else if (r.tipo === 'mensal') t = 'todo mês no dia ' + (Number(r.dia) || 1);
  else if (r.tipo === 'anual') t = 'todo ano em ' + String(Number(r.dia) || 1).padStart(2, '0') + '/' + String(Number(r.mes) || 1).padStart(2, '0');
  if (r.inicio) t += ', a partir de ' + dm(r.inicio);
  if (r.fim) t += ', até ' + dataBR(r.fim);
  if (r.util) t += ' (se cair em feriado ou fim de semana, no dia útil seguinte)';
  return t;
}
function textoRepete(t) { const r = regraDaTarefa(t); return r ? '↻ ' + textoRegra(r) : (t && t.recorrencia ? '↻ ' + t.recorrencia : ''); }
// as datas da regra entre de e ate (cópia de recorrencia_datas do banco)
function datasRegra(r, de, ate, fer) {
  if (!r || !r.tipo || ate < de) return [];
  fer = fer || E._feriados || new Set();
  const ini = r.inicio || de, fim = r.fim || null, cada = Math.max(1, Number(r.cada) || 1), dias = (r.dias || []).map(Number);
  const semana0 = somarDias(ini, -(isoDow(ini) - 1)), out = [];
  const util = (d) => diaUtil(d, fer);
  if (r.tipo === 'mensal' && r.modo === 'util') {
    let m = (de > ini ? somarDias(de, -10) : ini).slice(0, 7) + '-01';
    if (m < ini.slice(0, 7) + '-01') m = ini.slice(0, 7) + '-01';
    for (let k = 0; k < 600 && m <= ate; k++) { let n = 0, d = m, achou = null; const f = fimDoMesIso(m);
      while (d <= f) { if (util(d) && ++n === Math.max(1, Number(r.n) || 1)) { achou = d; break; } d = somarDias(d, 1); }
      if (achou) out.push(achou); const x = new Date(m + 'T12:00:00'); x.setMonth(x.getMonth() + 1); m = iso(x); }
  } else {
    let d = somarDias(de, -10) > ini ? somarDias(de, -10) : ini;
    for (let k = 0; k < 4000 && d <= ate; k++, d = somarDias(d, 1)) {
      const ult = Number(fimDoMesIso(d).slice(8)), dia = Number(d.slice(8)), mes = Number(d.slice(5, 7)), dw = isoDow(d);
      let ok = false;
      if (r.tipo === 'semanal') ok = dias.includes(dw) && (Math.round((new Date(d + 'T12:00:00') - new Date(semana0 + 'T12:00:00')) / 864e5 / 7) % cada) === 0;
      else if (r.tipo === 'mensal_dias') ok = dias.some((z) => Math.min(z, ult) === dia);
      else if (r.tipo === 'mensal' && (r.modo || 'dia') === 'dia') ok = Math.min(Math.max(1, Number(r.dia) || 1), ult) === dia;
      else if (r.tipo === 'mensal' && r.modo === 'semana') { const o = Number(r.ordem) || 1; ok = dw === (Number(r.dow) || 5) && (o === -1 ? dia + 7 > ult : Math.floor((dia - 1) / 7) + 1 === o); }
      else if (r.tipo === 'anual') ok = mes === (Number(r.mes) || 1) && Math.min(Number(r.dia) || 1, ult) === dia;
      if (ok && (!fim || d <= fim)) { let c = d; if (r.util) { for (let z = 0; z < 30 && !util(c); z++) c = somarDias(c, 1); } out.push(c); }
    }
  }
  const lim = de > ini ? de : ini;
  return [...new Set(out)].filter((z) => z >= lim && z <= ate).sort();
}
function proximasDatas(r, depois, n, fer) { return datasRegra(r, somarDias(depois, 1), somarDias(depois, 800), fer).slice(0, n || 8); }
// T2: as próximas ocorrências (até 8 por série) para o calendário — vêm do banco (as mesmas do Google Agenda)
let _projCache = null;
function projecoesRecorrentes(forcar) {
  if (forcar || !_projCache || Date.now() - _projCache.t > 30000) {
    _projCache = { t: Date.now(), p: q(sb.rpc('recorrencias_projecao', { p_n: 8 })).then((L) => {
      const out = []; (L || []).forEach((s) => (s.datas || []).forEach((d) => out.push({ id: s.tarefa_id, titulo: s.titulo, prazo: d, prioridade: s.prioridade, hora: s.hora, hora_fim: s.hora_fim,
        tipo_agenda: s.tipo_agenda, local: s.local, responsavel: s.responsavel, participantes: s.participantes, revisor: s.revisor, chave_regra: s.chave_regra,
        cliente_id: s.cliente_id, grupo_id: s.grupo_id, status: 'pendente', recorrencia: 'regra', recorrencia_regra: s.regra, _prev: true, _cls: 'ag-prevista' })));
      return out; }).catch(() => []) };
  }
  return _projCache.p;
}
function esquecerProjecoes() { _projCache = null; }
// formulário: o bloco "Repetir"
function campoRepetir(t) {
  const r = regraDaTarefa(t) || {}, cada = Number(r.cada) || 1, dd = (r.dias || []).map(Number).sort().join(',');
  const tipo = r.tipo === 'semanal' && cada === 2 ? 'quinzenal' : r.tipo === 'semanal' && cada > 1 ? 'semanas' : r.tipo === 'semanal' && dd === '1,2,3,4,5' ? 'uteis' : (r.tipo || '');
  const dias = (r.dias || []).map(Number), base = t.prazo || hojeISO();
  const md = r.tipo === 'mensal_dias' ? dias : [5, 20];
  const sel = (id, pares, v) => '<select id="' + id + '">' + pares.map(([k, rot]) => '<option value="' + k + '"' + (String(k) === String(v) ? ' selected' : '') + '>' + rot + '</option>').join('') + '</select>';
  const vis = (tipos) => ' data-rep-vis="' + tipos + '"';
  return '<div class="inteiro tf-rep" id="tf-rep"><div class="tf-rep-linha"><span class="tf-rep-rot">Repetir</span>' + sel('tf-rep-tipo', TIPOS_REPETE, tipo) +
      '<span' + vis('semanas') + '>a cada <input id="tf-rep-cada" type="number" min="2" max="12" value="' + (Number(r.cada) > 1 ? r.cada : 2) + '"> semanas</span></div>' +
    '<div class="tf-rep-linha tf-rep-dias"' + vis('semanal semanas quinzenal') + '>' + [1, 2, 3, 4, 5, 6, 7].map((k) => '<label class="tf-rep-dia"><input type="checkbox" data-rep-dia="' + k + '"' +
      ((dias.length ? dias.includes(k) : isoDow(base) === k) ? ' checked' : '') + '>' + DIAS_SEM_CURTO[k] + '</label>').join('') + '</div>' +
    '<div class="tf-rep-linha"' + vis('mensal_dias') + '>nos dias <input id="tf-rep-d1" type="number" min="1" max="31" value="' + (md[0] || 5) + '"> e <input id="tf-rep-d2" type="number" min="1" max="31" value="' + (md[1] || 20) + '"></div>' +
    '<div class="tf-rep-linha"' + vis('mensal') + '>' + sel('tf-rep-modo', [['dia', 'no dia'], ['util', 'no dia útil nº'], ['semana', 'na']], r.modo || 'dia') +
      '<input id="tf-rep-dia" type="number" min="1" max="31" data-rep-modo="dia" value="' + (r.tipo === 'mensal' && r.dia ? r.dia : Number(base.slice(8))) + '">' +
      '<input id="tf-rep-n" type="number" min="1" max="23" data-rep-modo="util" value="' + (r.n || 5) + '">' +
      '<span data-rep-modo="semana">' + sel('tf-rep-ordem', ORDENS_SEM, r.ordem || -1) + sel('tf-rep-dow', [1, 2, 3, 4, 5, 6, 7].map((k) => [k, DIAS_SEM_ISO[k]]), r.dow || 5) + ' do mês</span></div>' +
    '<div class="tf-rep-linha"' + vis('anual') + '>em <input id="tf-rep-anual" type="date" value="' + (r.tipo === 'anual' ? base.slice(0, 4) + '-' + String(r.mes).padStart(2, '0') + '-' + String(r.dia).padStart(2, '0') : base) + '"></div>' +
    '<div class="tf-rep-linha"' + vis('uteis semanal semanas quinzenal mensal_dias mensal anual') + '>a partir de <input id="tf-rep-ini" type="date" value="' + (r.inicio || base) + '"> até <input id="tf-rep-fim" type="date" value="' + (r.fim || '') + '" title="Deixe vazio para repetir sem fim"> <span class="sub">(fim opcional)</span></div>' +
    '<label class="check tf-rep-linha"' + vis('uteis semanal semanas quinzenal mensal_dias mensal anual') + '><input type="checkbox" id="tf-rep-util"' + (r.util ? ' checked' : '') + '> Se cair em feriado ou fim de semana, passa para o dia útil seguinte</label>' +
    '<div class="tf-rep-txt" id="tf-rep-txt" aria-live="polite"></div></div>';
}
function lerRepetir(j) {
  const v = (id) => (j.querySelector('#' + id) || {}).value || '';
  const tipo = v('tf-rep-tipo'); if (!tipo) return null;
  const r = { tipo: ['semanas', 'quinzenal', 'uteis'].includes(tipo) ? 'semanal' : tipo };
  if (tipo === 'uteis') r.dias = [1, 2, 3, 4, 5];
  if (tipo === 'quinzenal') { r.dias = [...j.querySelectorAll('[data-rep-dia]:checked')].map((c) => Number(c.dataset.repDia)); r.cada = 2; }
  if (tipo === 'semanal' || tipo === 'semanas') { r.dias = [...j.querySelectorAll('[data-rep-dia]:checked')].map((c) => Number(c.dataset.repDia)); if (tipo === 'semanas') r.cada = Math.max(2, Number(v('tf-rep-cada')) || 2); }
  if (tipo === 'mensal_dias') r.dias = [...new Set([Number(v('tf-rep-d1')), Number(v('tf-rep-d2'))].filter((x) => x >= 1 && x <= 31))].sort((a, b) => a - b);
  if (tipo === 'mensal') { r.modo = v('tf-rep-modo') || 'dia'; if (r.modo === 'dia') r.dia = Math.min(31, Math.max(1, Number(v('tf-rep-dia')) || 1));
    if (r.modo === 'util') r.n = Math.min(23, Math.max(1, Number(v('tf-rep-n')) || 1)); if (r.modo === 'semana') { r.ordem = Number(v('tf-rep-ordem')) || -1; r.dow = Number(v('tf-rep-dow')) || 5; } }
  if (tipo === 'anual') { const a = v('tf-rep-anual') || hojeISO(); r.mes = Number(a.slice(5, 7)); r.dia = Number(a.slice(8)); }
  r.inicio = v('tf-rep-ini') || hojeISO();
  if (v('tf-rep-fim')) r.fim = v('tf-rep-fim');
  if ((j.querySelector('#tf-rep-util') || {}).checked) r.util = true;
  return r;
}
function ligarRepetir(j, aoMudar) {
  const box = j.querySelector('#tf-rep'); if (!box) return;
  const pintar = () => {
    const tipo = box.querySelector('#tf-rep-tipo').value, modo = box.querySelector('#tf-rep-modo').value;
    box.querySelectorAll('[data-rep-vis]').forEach((x) => { x.hidden = !x.dataset.repVis.split(' ').includes(tipo); });
    box.querySelectorAll('[data-rep-modo]').forEach((x) => { x.hidden = x.dataset.repModo !== modo; });
    const r = lerRepetir(j), txt = box.querySelector('#tf-rep-txt');
    if (!r) { txt.innerHTML = ''; return; }
    if ((r.tipo === 'semanal' || r.tipo === 'mensal_dias') && !(r.dias || []).length) { txt.innerHTML = '<span class="msg-erro">Escolha pelo menos um dia.</span>'; return; }
    const prox = proximasDatas(r, somarDias(r.inicio, -1), 6, E._feriados);
    txt.innerHTML = '<b>' + esc(textoRepete({ recorrencia_regra: r })) + '</b><div class="sub">Próximas: ' + (prox.length ? prox.map((d) => '<span class="tf-rep-data">' + dataBR(d).slice(0, 5) + '</span>').join(' ') : 'nenhuma (confira o fim)') + '</div>';
    if (aoMudar) aoMudar(r, prox);
  };
  box.addEventListener('change', () => { box._mexeu = true; pintar(); });
  box.addEventListener('input', (ev) => { if (ev.target.type === 'number') { box._mexeu = true; pintar(); } });
  feriados().then(pintar, pintar);
  pintar();
}
// T3: editar uma tarefa de uma série → "só esta" ou "esta e as próximas"
function perguntarSerie(mudouRegra) {
  return new Promise((ok) => {
    const j = abrirJanela({ titulo: '↻ Tarefa que se repete',
      corpo: '<p>Esta tarefa faz parte de uma repetição. Onde aplicar a alteração?</p>' +
        (mudouRegra ? '<p class="dica">A <b>regra de repetição</b> mudou: ela só vale em “esta e as próximas”.</p>' : ''),
      rodape: '<button class="btn btn-o" type="button" data-cancelar>Cancelar</button><div class="acoes">' +
        '<button class="btn btn-o" type="button" id="tf-serie-esta">Só esta</button><button class="btn btn-p" type="button" id="tf-serie-prox">Esta e as próximas</button></div>' });
    let feito = false; const fim = (v) => { if (feito) return; feito = true; fecharJanela(j); ok(v); };
    j._aoFechar = () => fim(null);
    j.querySelector('[data-cancelar]').onclick = () => fim(null);
    j.querySelector('#tf-serie-esta').onclick = () => fim('esta');
    j.querySelector('#tf-serie-prox').onclick = () => fim('proximas');
  });
}

function formTarefa(t, depois) {
  t = t || {};
  const novo = !t.id;
  let checklist = Array.isArray(t.checklist) ? t.checklist.map((c) => ({ texto: c.texto, feito: !!c.feito })) : [];
  const outras = (E._tarefas || []).filter((x) => x.id !== t.id && !tarefaFechada(x));
  const j = abrirJanela({ titulo: novo ? (t.tarefa_pai_id ? 'Nova subtarefa' : 'Nova tarefa') : 'Tarefa', larga: true,
    corpo: '<form id="f-tf" class="grade">' +
      // Backup 54: à vista só o essencial (o que fazer, para quem, até quando, urgência, cliente, se repete); o resto em "Mais opções"
      campo('Tarefa <span class="obrig">*</span>', '<input name="titulo" maxlength="300" value="' + esc(t.titulo || '') + '" placeholder="O que precisa ser feito?">', 'inteiro') +
      campo('Para quem', selectPessoa('responsavel', t.responsavel || (novo && E.perfil ? E.perfil.nome : ''), '— escolha —')) +
      campo('Prazo', '<input name="prazo" type="date" value="' + esc(t.prazo || '') + '">') +
      campo('Urgência', selectPares('prioridade', [['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']], t.prioridade || 'media')) +
      campo('Cliente', '<select name="cliente_id">' + opcoesClientes(t.cliente_id || '') + '</select>') +
      campoRepetir(t) +
      '<details class="inteiro tf-mais" id="tf-mais"' + (novo ? '' : ' open') + '><summary>+ Mais opções <span class="sub">prazo fatal, participantes, revisão, checklist, descrição…</span></summary><div class="grade">' +
      campo('Grupo', '<input name="grupo" list="tf-grupos" value="' + esc(nomeGrupo(t.grupo_id)) + '">' + datalistGrupos('tf-grupos')) +
      campo('Prazo fatal (legal / judicial)', '<input name="prazo_fatal" type="date" value="' + esc(t.prazo_fatal || '') + '">') +
      '<div class="campo inteiro"><span>Participantes</span>' + campoParticipantes(t.participantes) + '</div>' +
      campo('Início', '<input name="inicio" type="date" value="' + esc(t.inicio || (novo ? hojeISO() : '')) + '">') +
      campo('Status', selectPares('status', Object.entries(STATUS_TAREFA), t.status || 'pendente')) +
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
      '</div></details>' +
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
  const aposSalvar = async () => { esquecerProjecoes(); await (depois || recarregar)(); };
  // tarefa nova com repetição: o prazo vira a primeira data da regra
  ligarRepetir(j, (r, prox) => { if (novo && j.querySelector('#tf-rep')._mexeu) { const p1 = proximasDatas(r, somarDias(r.inicio, -1), 1, E._feriados)[0]; if (p1) f.prazo.value = p1; } });
  j.querySelector('#btn-salvar-tf').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.titulo.value.trim()) throw new Error('Escreva a tarefa.');
    const est = f.estimativa_horas.value.trim() ? lerValor(f.estimativa_horas.value) : null;
    if (Number.isNaN(est)) throw new Error('Estimativa de horas inválida.');
    if (f.prazo.value && f.prazo_fatal.value && f.prazo.value > f.prazo_fatal.value) throw new Error('O prazo interno está depois do prazo fatal.');
    const dados = { titulo: f.titulo.value.trim(), cliente_id: f.cliente_id.value || null, grupo_id: await grupoPorNome(f.grupo.value), responsavel: f.responsavel.value.trim(),
      participantes: lerParticipantes(j), prazo: f.prazo.value || null, prazo_fatal: f.prazo_fatal.value || null, inicio: f.inicio.value || null,
      prioridade: f.prioridade.value, status: f.status.value, estimativa_horas: est, etiquetas: f.etiquetas.value.trim(),
      depende_de: f.depende_de.value || null, exige_anexo: f.exige_anexo.checked, exige_revisao: f.exige_revisao.checked, revisor: f.revisor.value.trim(),
      processos_vinculados: f.processos_vinculados.value.trim(), descricao: f.descricao.value.trim(), obs: f.obs.value.trim(), checklist };
    if (!dados.grupo_id && dados.cliente_id) { const c = E.clientes.find((x) => x.id === dados.cliente_id); if (c) dados.grupo_id = c.grupo_id; }
    ['tarefa_pai_id', 'fluxo_id', 'contrato_id'].forEach((k) => { if (novo && t[k]) dados[k] = t[k]; });
    if (dados.exige_revisao && !dados.revisor) throw new Error('Informe quem revisa (ou desmarque "Exige revisão").');
    if (dados.status !== (t.status || 'pendente')) await validarDependencia(dados, dados.status);
    // Backup 51: repetição — regra nova (série) ou a antiga, intocada
    const box = j.querySelector('#tf-rep'), regra = lerRepetir(j), legado = !t.recorrencia_regra && ['semanal', 'mensal', 'anual'].includes(t.recorrencia || '');
    if (regra && (regra.tipo === 'semanal' || regra.tipo === 'mensal_dias') && !(regra.dias || []).length) throw new Error('Repetir: escolha pelo menos um dia.');
    if (legado && !box._mexeu) dados.recorrencia = t.recorrencia;
    else if (regra || t.recorrencia_regra) { dados.recorrencia_regra = regra; dados.recorrencia = regra ? 'regra' : ''; }
    else dados.recorrencia = '';
    if (regra && !dados.prazo) dados.prazo = proximasDatas(regra, somarDias(regra.inicio, -1), 1, E._feriados)[0] || null;
    let modo = 'esta';
    if (!novo && t.recorrencia_serie) {
      const canon = (o) => (o ? JSON.stringify(Object.keys(o).sort().reduce((a, k) => { a[k] = o[k]; return a; }, {})) : 'null');
      const mudou = canon(t.recorrencia_regra) !== canon(dados.recorrencia_regra === undefined ? t.recorrencia_regra : dados.recorrencia_regra);
      modo = await perguntarSerie(mudou); if (!modo) return;
      if (modo === 'esta') { delete dados.recorrencia_regra; delete dados.recorrencia; }
    }
    if (modo === 'proximas') {
      // T3: esta e as próximas — os campos vão para as abertas seguintes da série (cada uma com a própria data)
      await q(sb.rpc('tarefa_serie_editar', { p_id: t.id, p: dados }));
      const proprio = Object.assign({}, dados); delete proprio.recorrencia_regra; delete proprio.recorrencia;
      await q(sb.from('tarefas').update(proprio).eq('id', t.id));
    } else if (novo) await q(sb.from('tarefas').insert(dados)); else await q(sb.from('tarefas').update(dados).eq('id', t.id));
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
// (as regras automáticas rodam sozinhas pelo pg_cron; o liga/desliga dos e-mails fica em Administração → E-mail → Automáticos)
function quandoRodou(v) { const d = new Date(v); return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }

// ─────────────────────────── fluxos e modelos ───────────────────────────
async function formNovoFluxo(depois) {
  const modelos = (await q(sb.from('modelos_fluxo').select('*').order('nome'))).sort((x, y) => !!x.sequencial - !!y.sequencial);   // Backup 54: os "passo a passo" no fim da lista
  if (!modelos.length) { aviso('Crie um modelo de fluxo primeiro (botão "Modelos de fluxo").', true); return; }
  const j = abrirJanela({ titulo: 'Novo fluxo de tarefas', larga: true,
    corpo: '<form class="grade" id="f-fl">' +
      campo('Modelo <span class="obrig">*</span>', '<select name="modelo">' + modelos.map((m) => '<option value="' + m.id + '">' + esc(m.nome) + (m.sequencial ? ' — passo a passo, com validação' : '') + '</option>').join('') + '</select>', 'inteiro') +
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
  // Backup 54: modelo "passo a passo" (ex.: Lead completo) = a antiga janela "Delegar" (cada passo começa quando o anterior termina)
  f.modelo.onchange = () => { const m = modelos.find((x) => x.id === f.modelo.value) || {};
    if (m.sequencial) { fecharJanela(j); return janelaDelegar({ modelo: m.nome, cliente_id: f.cliente_id.value || '' }, depois); } previa(); };
  f.prazo_fatal.onchange = previa; previa();
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
    if (!confirm('Excluir o feriado de ' + dataBR(data) + '?')) return;
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

// ─────────── Minha semana: segunda a sexta, arrastar para remarcar ───────────
// Backup 52 (C1): a semana com arrastar é UMA só — Tarefas → Calendário → Semana e o Início usam esta função.
// o = { lista (tarefas já filtradas), estado (guarda .semana), abrir(t), repintar(), atrasadas (bool), rotulo, cartao (bool: dentro de um cartão próprio) }
function semanaArrastavel(alvo, o) {
  const h = hojeISO(), F = o.estado;
  const base = new Date((F.semana || h) + 'T12:00:00'); base.setDate(base.getDate() - ((base.getDay() + 6) % 7));
  const seg = iso(base), dias = [0, 1, 2, 3, 4].map((i) => somarDias(seg, i)), sex = dias[4];
  const ts = o.lista;
  const atrasadas = o.atrasadas ? ts.filter((t) => t.prazo && t.prazo < h && !tarefaFechada(t)).sort((a, b) => a.prazo.localeCompare(b.prazo)) : [], semData = ts.filter((t) => !t.prazo);
  const cartao = (t) => '<div class="sm-card" draggable="true" data-sm="' + t.id + '"><b>' + esc(t.titulo) + '</b>' + seloFatal(t) +
    '<div class="sub">' + esc(quemTarefa(t) || '') + (t.estimativa_horas ? ' · ' + String(t.estimativa_horas).replace('.', ',') + ' h' : '') + '</div></div>';
  const col = (rot, data, lista, cls) => '<div class="sm-col' + (cls ? ' ' + cls : '') + '" data-dia="' + (data || '') + '"><div class="sm-tit">' + rot + ' <span class="sub">' + lista.length + '</span></div>' + lista.map(cartao).join('') + '</div>';
  const miolo = '<div class="fila-cal-nav"><button type="button" class="btn btn-o btn-mini" data-sm-nav="-7" aria-label="Semana anterior">‹</button><b>Semana de ' + dataBR(seg).slice(0, 5) + ' a ' + dataBR(sex).slice(0, 5) +
      (o.rotulo ? ' — ' + esc(o.rotulo) : '') + '</b><button type="button" class="btn btn-o btn-mini" data-sm-nav="7" aria-label="Próxima semana">›</button><button type="button" class="btn btn-o btn-mini" data-sm-nav="0">Esta semana</button></div>' +
    // Backup 39: "Atrasadas" no MESMO quadro do Início (⏰, número em vermelho, contorno vermelho e "prazo · N dias de atraso")
    (o.atrasadas ? '<div class="fila-com-atr sm-com-atr">' + quadroAtrasadas(atrasadas) : '<div>') +
    '<div class="sm-grade">' +
    dias.map((d, i) => col(['Seg', 'Ter', 'Qua', 'Qui', 'Sex'][i] + ' ' + dataBR(d).slice(0, 5), d, ts.filter((t) => t.prazo === d), d === h ? 'sm-hoje' : '')).join('') +
    (semData.length ? col('Sem data', 'sem', semData, 'sm-sem') : '') + '</div></div>' +
    '<p class="sub sm-dica">Arraste a tarefa para outro dia para remarcar o prazo.</p>';
  // Backup 40: dentro do mesmo cartão do calendário, com a mesma altura
  alvo.innerHTML = o.cartao === false ? '<div class="tf-sem tf-sem-ini">' + miolo + '</div>' : '<div class="card ini-fila tf-cal tf-sem"><div class="card-bd">' + miolo + '</div></div>';
  // Backup 53: mesma altura do calendário do mês (as colunas esticam até o pé)
  { const c = alvo.firstElementChild; if (c) c.style.minHeight = (o.altura || 680) + 'px'; }
  const achar = (id) => ts.find((t) => t.id === id) || (E._tarefas || []).find((t) => t.id === id);
  alvo.querySelectorAll('[data-sm-nav]').forEach((b) => b.onclick = () => { F.semana = +b.dataset.smNav ? somarDias(seg, +b.dataset.smNav) : null; o.repintar(); });
  alvo.querySelectorAll('.fila-atrasadas [data-fila]').forEach((b) => b.onclick = () => o.abrir(achar(b.dataset.fila)));
  let arr = null;
  alvo.querySelectorAll('.sm-card').forEach((c) => {
    c.addEventListener('dragstart', (ev) => { arr = c.dataset.sm; ev.dataTransfer.setData('text/plain', arr); c.classList.add('arrastando'); });
    c.addEventListener('dragend', () => c.classList.remove('arrastando'));
    c.onclick = () => o.abrir(achar(c.dataset.sm));
  });
  alvo.querySelectorAll('.sm-col[data-dia]').forEach((cl) => {
    if (!cl.dataset.dia || cl.dataset.dia === 'sem') return;
    cl.addEventListener('dragover', (ev) => { ev.preventDefault(); cl.classList.add('sobre'); });
    cl.addEventListener('dragleave', () => cl.classList.remove('sobre'));
    cl.addEventListener('drop', (ev) => { ev.preventDefault(); cl.classList.remove('sobre');
      const id = ev.dataTransfer.getData('text/plain') || arr, t = achar(id); if (!t || t.prazo === cl.dataset.dia) return;
      comBotao(null, async () => {
        if (t.prazo_fatal && cl.dataset.dia > t.prazo_fatal && !confirm('A nova data passa do PRAZO FATAL (' + dataBR(t.prazo_fatal) + '). Remarcar mesmo assim?')) return;
        await q(sb.from('tarefas').update({ prazo: cl.dataset.dia }).eq('id', id)); t.prazo = cl.dataset.dia;
        aviso('✓ "' + t.titulo + '" remarcada para ' + dataBR(cl.dataset.dia) + '.'); o.repintar();
      }); });
  });
}
function vistaSemana(alvo) {
  const F = E.tf;
  const quem = F.pessoas && F.pessoas.length ? 'escolhida' : '';
  // Backup 39: respeita a aba (Em aberto / Concluídas / Excluídas) — antes "Concluídas" ainda mostrava as abertas
  const doDono = (t) => (quem ? true : ehMinha(t));   // com pessoa escolhida, o filtro de cima já separou (responsável ou participante)
  semanaArrastavel(alvo, { lista: filtrarTarefas().filter(doDono), estado: F, atrasadas: F.aba === 'abertas', rotulo: quem || 'minhas tarefas', altura: F.altCal,
    abrir: (t) => abrirTarefa(t, recarregarTarefas), repintar: () => vistaSemana(alvo) });
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
      campo('Sequência', '<select name="modelo">' + seq.map((m) => '<option value="' + esc(m.nome) + '"' + (o.modelo === m.nome ? ' selected' : '') + '>' + esc(m.nome) + '</option>').join('') + '</select>', 'inteiro') +
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

// Janela de envio (arrastar ou escolher), já com o vínculo preenchido.
// Backup 40: o tipo é escolhido em botões; "Certificado digital" pede a senha, o sistema lê o arquivo e mostra a validade
// (e guarda senha + validade na ficha do certificado da empresa). Não existe mais o botão "Certificado" separado.
function janelaEnviarDocumento(vinculo, depois, titulo) {
  const tipo0 = vinculo.tipo || 'outro';
  const empresas = vinculo.grupo_id ? E.clientes.filter((c) => c.grupo_id === vinculo.grupo_id) : E.clientes;
  const j = abrirJanela({
    titulo: titulo || 'Enviar documento', larga: true,
    corpo: '<form id="f-doc" class="grade doc-envio" data-tipo="' + tipo0 + '" autocomplete="off">' +
      // Backup 41: o tipo voltou a ser uma lista suspensa
      campo('Tipo de documento', '<select name="tipo" id="doc-tipo-sel">' + TIPOS_DOC.map(([v, r]) => '<option value="' + v + '"' + (v === tipo0 ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>', 'inteiro') +
      '<div class="inteiro solta-arq" id="doc-solta"><b>Arraste os arquivos aqui</b> ou <label class="btn btn-o btn-mini" style="cursor:pointer">escolha<input type="file" id="doc-arq" multiple hidden></label>' +
      '<div class="sub" id="doc-lista">PDF, imagens, Word ou Excel · até ' + LIMITE_MB + ' MB cada</div></div>' +
      (vinculo.cliente_id || vinculo.contrato_id || vinculo.lancamento_id ? '' : campo(vinculo.grupo_id ? 'Empresa do grupo' : 'Cliente', '<select name="cliente_id">' +
        (vinculo.grupo_id ? '<option value="">— o grupo todo —</option>' + empresas.map((c) => '<option value="' + c.id + '"' + (c.id === vinculo.empresa_id ? ' selected' : '') + '>' + esc(c.nome) + '</option>').join('') : opcoesClientes(vinculo.empresa_id || '')) + '</select>', 'inteiro')) +
      '<label class="campo doc-so-cert"><span>Senha do certificado</span><span class="cert-senha"><input name="senha" type="password" autocomplete="new-password" placeholder="a senha do arquivo .pfx/.p12"><button type="button" class="btn btn-o btn-mini" id="cert-ver" aria-label="Mostrar a senha">👁</button></span></label>' +
      campo('Validade (se houver)', '<input name="validade" type="date">') +
      '<div class="inteiro cert-lido doc-so-cert" id="cert-lido"></div>' +
      campo('Etiquetas', '<input name="etiquetas" placeholder="ex.: 2026, original assinado">') +
      campo('Observação', '<textarea name="obs" maxlength="1000"></textarea>', 'inteiro') + '</form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-enviar-doc">Enviar</button></div>'
  });
  let arquivos = [], info = null, tipo = tipo0;
  const f = j.querySelector('#f-doc'), lista = j.querySelector('#doc-lista'), solta = j.querySelector('#doc-solta'), lido = j.querySelector('#cert-lido');
  const ehCert = () => tipo === 'certificado';
  const tentarLer = async () => { info = null; lido.innerHTML = ''; lido.className = 'inteiro cert-lido doc-so-cert';
    if (!ehCert() || !arquivos.length) return;
    if (!f.senha.value) { lido.innerHTML = '<span class="sub">Digite a senha: o sistema lê o arquivo e mostra a validade.</span>'; return; }
    try { info = await lerCertificado(arquivos[0], f.senha.value); f.validade.value = info.validade;
      lido.innerHTML = '✓ Certificado lido: <b>' + esc(info.titular || '—') + '</b> · válido de ' + dataBR(info.inicio) + ' até <b>' + dataBR(info.validade) + '</b>' + selo_validade(info.validade) + (info.emissor ? '<div class="sub">emitido por ' + esc(info.emissor) + '</div>' : '');
      lido.className = 'inteiro cert-lido doc-so-cert cert-ok'; }
    catch (e) { lido.innerHTML = '⚠ ' + esc(e.message); lido.className = 'inteiro cert-lido doc-so-cert cert-erro'; } };
  const mostrar = () => { lista.textContent = arquivos.length ? arquivos.map((a) => a.name + ' (' + tamanhoLegivel(a.size) + ')').join(' · ') : 'Nenhum arquivo escolhido'; tentarLer(); };
  const porTipo = (v) => { tipo = v; f.dataset.tipo = v; if (f.tipo.value !== v) f.tipo.value = v; tentarLer(); };
  f.tipo.onchange = () => porTipo(f.tipo.value);
  let tl; f.senha.addEventListener('input', () => { clearTimeout(tl); tl = setTimeout(tentarLer, 400); });
  j.querySelector('#cert-ver').onclick = () => { f.senha.type = f.senha.type === 'password' ? 'text' : 'password'; };
  j.querySelector('#doc-arq').onchange = (ev) => { arquivos = Array.from(ev.target.files); if (arquivos.some((a) => /\.(pfx|p12)$/i.test(a.name)) && !ehCert()) porTipo('certificado'); mostrar(); };
  ['dragenter', 'dragover'].forEach((e) => solta.addEventListener(e, (ev) => { ev.preventDefault(); solta.classList.add('sobre'); }));
  ['dragleave', 'drop'].forEach((e) => solta.addEventListener(e, (ev) => { ev.preventDefault(); solta.classList.remove('sobre'); }));
  solta.addEventListener('drop', (ev) => { arquivos = Array.from(ev.dataTransfer.files || []); if (arquivos.some((a) => /\.(pfx|p12)$/i.test(a.name)) && !ehCert()) porTipo('certificado'); mostrar(); });
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-enviar-doc').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!arquivos.length) throw new Error('Escolha pelo menos um arquivo.');
    const vinc = Object.assign({}, vinculo); delete vinc.empresa_id; delete vinc.tipo;
    if (f.cliente_id && f.cliente_id.value) vinc.cliente_id = f.cliente_id.value;
    if (vinc.cliente_id && !vinc.grupo_id) { const c = E.clientes.find((x) => x.id === vinc.cliente_id); if (c) vinc.grupo_id = c.grupo_id; }
    if (ehCert()) {
      const cli = E.clientes.find((c) => c.id === vinc.cliente_id); if (!cli) throw new Error('Certificado digital: escolha a empresa.');
      if (!info) throw new Error('Não consegui ler o certificado: confira a senha.');
      const a = arquivos[0];
      const doc = await enviarDocumento(a, Object.assign(vinc, { tipo: 'certificado' }),
        { nome: 'Certificado digital — ' + cli.nome + (a.name.match(/\.(pfx|p12)$/i) || ['.pfx'])[0].toLowerCase(), validade: f.validade.value || null, obs: info.titular ? 'Titular: ' + info.titular : '', etiquetas: f.etiquetas.value.trim() });
      await q(sb.from('cliente_certificado').upsert({ cliente_id: cli.id, validade: f.validade.value || null, senha: f.senha.value || '', documento_id: doc.id, titular: info.titular || '', emissor: info.emissor || '' }).select('cliente_id'));
      aviso('✓ Certificado de ' + cli.nome + ' salvo — vence em ' + dataBR(f.validade.value) + '.'); fecharJanela(j); if (depois) await depois();
      return;
    }
    const extra = { tipo, validade: f.validade.value || null, etiquetas: f.etiquetas.value.trim(), obs: f.obs.value.trim() };
    for (const a of arquivos) await enviarDocumento(a, vinc, extra);
    aviso('✓ ' + arquivos.length + ' documento(s) enviado(s).'); fecharJanela(j); if (depois) await depois();
  });
  return j;
}
// apaga o documento (o arquivo e o registro) — sempre com confirmação
async function excluirDocumento(doc) {
  if (!doc) return false;
  if (!confirm('Excluir "' + doc.nome + '"?\n\nO arquivo é apagado de vez e não pode ser recuperado.')) return false;
  await q(sb.from('documentos').delete().eq('id', doc.id).select('id')).then((r) => { if (!r.length) throw new Error('Sem permissão para excluir este documento.'); });
  if (doc.caminho) await sb.storage.from(BUCKET).remove([doc.caminho]).catch(() => {});
  return true;
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
        '<button class="btn btn-o btn-mini" data-versao-doc="' + d.id + '" title="Substituir por um arquivo novo — o anterior fica no histórico (Versões anteriores)">↑ Nova versão</button> ' +
        '<button class="btn btn-x btn-mini" data-excluir-doc="' + d.id + '" title="Apagar o documento (pede confirmação)">Excluir</button></td></tr>';
    }).join('') + '</tbody></table></div>';
}
function ligarDocumentos(raiz, docs, depois) {
  raiz.querySelectorAll('[data-abrir-doc]').forEach((b) => b.onclick = () => comBotao(b, () => abrirDocumento(docs.find((d) => d.id === b.dataset.abrirDoc))));
  raiz.querySelectorAll('[data-versao-doc]').forEach((b) => b.onclick = () => janelaNovaVersao(docs.find((d) => d.id === b.dataset.versaoDoc), depois));
  raiz.querySelectorAll('[data-excluir-doc]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    if (!(await excluirDocumento(docs.find((d) => d.id === b.dataset.excluirDoc)))) return;
    aviso('✓ Documento excluído.'); if (depois) await depois();
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
    '<div class="acoes"><a class="btn btn-o" id="doc-ger" href="documentos/index.html" target="_blank" rel="noopener" title="Abre o sistema de geração de documentos numa aba nova">Gerar documentos ↗</a><button class="btn btn-p" id="doc-novo">+ Enviar documento</button></div></div>' +
    '<div class="filtros">' +
    '<div class="segmento" id="doc-sit">' + [['ativos', 'Ativos'], ['vencendo', 'Vencendo em 30 dias'], ['arquivados', 'Versões anteriores']].map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<select class="busca sel" id="doc-tipo"><option value="">Todos os tipos</option>' + TIPOS_DOC.map(([v, r]) => '<option value="' + v + '">' + r + '</option>').join('') + '</select>' +
    '<select class="busca sel" id="doc-grupo"><option value="">Todos os grupos</option>' + (E.grupos || []).map((g) => '<option value="' + g.id + '">' + esc(g.nome) + '</option>').join('') + '</select>' +
    '<select class="busca sel" id="doc-cli"><option value="">Todos os clientes</option>' + E.clientes.map((c) => '<option value="' + c.id + '">' + esc(c.nome) + '</option>').join('') + '</select>' +
    '<input class="busca" id="doc-busca" placeholder="Buscar nome, etiqueta ou observação" autocomplete="off"></div>' +
    '<div class="doc-chips" id="doc-chips"></div><div id="doc-corpo"><div class="carregando">Carregando…</div></div>';
  $('doc-tipo').value = F.tipo; $('doc-cli').value = F.cliente; $('doc-grupo').value = F.grupo || ''; $('doc-busca').value = F.busca;
  $('doc-novo').onclick = () => janelaEnviarDocumento({}, () => TELAS.documentos());
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
  const b = normalizar(F.busca), lim = somarDias(hojeISO(), 30);
  // Backup 49 (28): selo do vencimento mais próximo (certidão, certificado…) direto na pasta e na subpasta
  const seloPasta = (docs) => {
    const v = docs.filter((d) => d.validade && d.validade <= lim).map((d) => d.validade).sort()[0]; if (!v) return '';
    const dias = Math.round((new Date(v + 'T00:00:00') - new Date(hojeISO() + 'T00:00:00')) / 864e5), n = docs.filter((d) => d.validade && d.validade <= lim).length;
    return ' <span class="pill ' + (dias < 0 ? 'vencido' : 'hoje') + ' doc-selo-venc" title="' + plural(n, 'documento vencendo', 'documentos vencendo') + ' em até 30 dias">' +
      (dias < 0 ? 'vencido há ' + plural(-dias, 'dia', 'dias') : dias === 0 ? 'vence hoje' : 'vence em ' + plural(dias, 'dia', 'dias')) + '</span>';
  };
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
  // Backup 40: dentro de cada grupo, uma subpasta por empresa (e "Documentos do grupo" para o que não é de uma empresa só)
  F.subAbertas = F.subAbertas || {};
  const subpastas = (k, docs) => {
    const S = {}; docs.forEach((d) => { const c = d.cliente_id || ''; (S[c] = S[c] || []).push(d); });
    const cs = Object.keys(S).sort((x, y) => (x ? 1 : 0) - (y ? 1 : 0) || nomeCliente(x).localeCompare(nomeCliente(y), 'pt-BR'));
    if (cs.length === 1 && !k) return tabelaDocumentos(docs, { vazio: '' });
    return '<div class="doc-subpastas">' + cs.map((c) => { const sk = k + '|' + c, ab = !!b || cs.length === 1 || !!F.subAbertas[sk];
      return '<details class="doc-sub" data-sub="' + esc(sk) + '"' + (ab ? ' open' : '') + '><summary><span class="doc-pasta-ic" aria-hidden="true">📂</span><b>' + esc(c ? nomeCliente(c) : 'Documentos do grupo') + '</b>' +
        '<span class="sub">' + plural(S[c].length, 'documento', 'documentos') + seloPasta(S[c]) + '</span>' + (c ? linkDrive('cliente', c, (E.clientes.find((x) => x.id === c) || {}).drive_url) : '') +
        '<span class="doc-pasta-ac"><button type="button" class="btn btn-o btn-mini" data-sub-enviar="' + esc(k) + '|' + esc(c) + '" title="Enviar já para esta empresa">+ Enviar</button></span></summary>' +
        (ab ? tabelaDocumentos(S[c], { vazio: '', semCliente: !!c }) : '') + '</details>'; }).join('') + '</div>';
  };
  $('doc-corpo').innerHTML = lista.length ? '<div class="doc-pastas">' + ks.map((k) => '<details class="card doc-pasta" data-pasta="' + esc(k) + '"' + (aberto(k) ? ' open' : '') + '><summary><span class="doc-pasta-ic" aria-hidden="true">📁</span><b>' + esc(nomeG(k)) + '</b>' +
      '<span class="sub">' + plural(G[k].length, 'documento', 'documentos') + seloPasta(G[k]) + '</span>' +
      (k ? linkDrive('grupo', k, (E.grupos.find((g) => g.id === k) || {}).drive_url) : '') +
      '<span class="doc-pasta-ac"><button type="button" class="btn btn-p btn-mini" data-pasta-enviar="' + esc(k) + '" title="Enviar documento já para este grupo">+ Enviar</button></span></summary>' +
      (aberto(k) ? subpastas(k, G[k]) : '') + '</details>').join('') + '</div>'
    : '<div class="card">' + tabelaDocumentos([], { vazio: 'Nenhum documento neste recorte.' }) + '</div>';
  // a tabela só é montada quando a pasta abre (pasta fechada não carrega nada)
  $('doc-corpo').querySelectorAll('details[data-pasta]').forEach((d) => d.addEventListener('toggle', (ev) => { if (ev.target !== d) return; const k = d.dataset.pasta; if (d.open === aberto(k)) return; F.abertos[k] = d.open; pintarDocumentos(false); }));
  $('doc-corpo').querySelectorAll('details[data-sub]').forEach((d) => d.addEventListener('toggle', (ev) => { ev.stopPropagation(); const k = d.dataset.sub; if (!!F.subAbertas[k] === d.open) return; F.subAbertas[k] = d.open; pintarDocumentos(false); }));
  $('doc-corpo').querySelectorAll('[data-pasta-enviar]').forEach((b) => b.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation();
    janelaEnviarDocumento({ grupo_id: b.dataset.pastaEnviar || undefined }, () => pintarDocumentos(), '+ Enviar documento — ' + nomeG(b.dataset.pastaEnviar)); });
  $('doc-corpo').querySelectorAll('[data-sub-enviar]').forEach((b) => b.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation();
    const [g, c] = b.dataset.subEnviar.split('|');
    janelaEnviarDocumento(c ? { cliente_id: c, grupo_id: g || undefined } : { grupo_id: g || undefined }, () => pintarDocumentos(), '+ Enviar documento — ' + (c ? nomeCliente(c) : nomeG(g))); });
  // Backup 46: link da pasta no Google Drive — abre numa aba nova; ✎ grava/troca o link
  $('doc-corpo').querySelectorAll('[data-drive-ed]').forEach((b) => b.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation();
    const [tipo, id] = b.dataset.driveEd.split('|'), atual = tipo === 'grupo' ? (E.grupos.find((g) => g.id === id) || {}).drive_url : (E.clientes.find((c) => c.id === id) || {}).drive_url;
    const url = prompt('Cole o link da pasta no Google Drive (deixe vazio para tirar):', atual || ''); if (url === null) return;
    q(sb.rpc('salvar_link_drive', { p_tipo: tipo, p_id: id, p_url: url })).then(async () => { await carregarCadastros(true); aviso(url.trim() ? '✓ Link do Drive gravado.' : '✓ Link do Drive tirado.'); pintarDocumentos(false); }, (e) => aviso(erroAmigavel(e), true)); });
  $('doc-corpo').querySelectorAll('a.doc-drive').forEach((a) => a.addEventListener('click', (ev) => ev.stopPropagation()));
  ligarDocumentos($('doc-corpo'), lista, () => pintarDocumentos());
}
function linkDrive(tipo, id, url) {
  return '<span class="doc-drive-box">' + (url ? '<a class="doc-drive" href="' + esc(url) + '" target="_blank" rel="noopener" title="Abrir a pasta no Google Drive (aba nova)">🔗 Drive</a>' : '') +
    '<button type="button" class="doc-drive-ed" data-drive-ed="' + tipo + '|' + esc(id) + '" title="' + (url ? 'Trocar o link do Google Drive' : 'Colocar o link da pasta no Google Drive') + '">' + (url ? '✎' : '+ link do Drive') + '</button></span>';
}

// ─────────── Geradores de documentos (Backup 16) ───────────
// Backup 32: a Central de Documentos (documentos/) substitui o gerador antigo de contrato e procuração.
// Os outros geradores (petição, solicitação, proposta, e-mails) continuam como antes, mais abaixo na janela.
// Backup 40: a geração de documentos é um sistema à parte — sempre abre numa aba nova (não fica mais dentro do ERP)
function abrirCentral(url) { window.open(url || 'documentos/index.html', '_blank', 'noopener'); }
// Backup 26: gerador de contrato já com o cliente e os valores do contrato (o documento fica ligado ao contrato)
function abrirGeradorContrato(clienteId, contratoId) {
  abrirCentral('documentos/index.html?modelo=contrato' + (clienteId ? '&cliente=' + encodeURIComponent(clienteId) : '') + (contratoId ? '&contrato=' + encodeURIComponent(contratoId) : ''));
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
// Backup 40: o certificado entra pelo "+ Enviar" (tipo Certificado digital); esta função fica para quem já chamava (alertas, ficha)
async function janelaCertificado(vinculo, depois) {
  if (!E.clientes.length) await carregarCadastros();
  return janelaEnviarDocumento({ grupo_id: vinculo.grupo_id || undefined, empresa_id: vinculo.cliente_id || undefined, tipo: 'certificado' }, depois, 'Enviar certificado digital');
}

// Backup 57: submódulo "Gerar documentos" — a Central de Documentos (documentos/index.html) dentro do ERP, com o mesmo login.
// "Abrir em aba nova" continua para quem prefere a tela inteira.
TELAS.gerador = async function () {
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Gerar documentos</h1><p>Procuração, substabelecimento, contrato, recibo, declaração e acordo — com os dados do cliente já preenchidos</p></div>' +
    '<div class="acoes"><a class="btn btn-o" id="ger-aba" href="documentos/index.html" target="_blank" rel="noopener">Abrir em aba nova ↗</a></div></div>' +
    '<div class="card ger-card"><iframe id="ger-frame" class="ger-frame" src="documentos/index.html?embutido=1" title="Central de Documentos"></iframe></div>';
};

'use strict';
// ═══════════════════════════════════════════════════════════════════
// Ficha do cliente (visão 360°): tudo sobre o cliente numa janela só,
// em abas. Clicar no cliente (tela Clientes) abre esta ficha.
// ═══════════════════════════════════════════════════════════════════
// Backup 49 (25): 7 abas — cada uma junta as partes antigas (as funções de ABA_FICHA continuam as mesmas, empilhadas)
const ABAS_FICHA = [['resumo', 'Resumo'], ['contatos', 'Contatos e endereços'], ['socios', 'Sócios'], ['processos', 'Processos'],
  ['financeiro', 'Financeiro e contratos'], ['documentos', 'Documentos'], ['historico', 'Histórico']];
// Backup 53: Resumo na ordem Cadastro · Situação · Tarefas · Dados da Receita · Histórico de alterações (débitos ao lado das tarefas; sem certidões)
const PARTES_FICHA = { resumo: ['resumo', 'receita'], contatos: ['contatos', 'enderecos', 'contas'], socios: ['socios'], processos: ['processos'],
  financeiro: ['contratos', 'financeiro'], documentos: ['documentos'], historico: ['linha', 'tarefas'] };
// nome antigo de aba (atalhos de outras telas) → aba nova
const ABA_NOVA = { enderecos: 'contatos', contas: 'contatos', contratos: 'financeiro', tarefas: 'historico', linha: 'historico', fiscal: 'resumo', receita: 'resumo' };

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
      ' ' + pillRecebeEmail(cl) + ' <button class="btn-etq" id="fc-etq" title="Etiquetas">+ etiqueta</button></div></div>' +
      // Backup 53: um botão só, "+ Lançar ▾", que abre os atalhos (tarefa, lançamento, documento, interação, reunião, indicação, lead)
      '<div class="ficha-atalhos"><span class="tf-cfg-wrap fc-lancar-wrap"><button class="btn btn-o btn-mini" id="fc-lancar" aria-expanded="false" aria-haspopup="true">+ Lançar ▾</button>' +
      '<span class="tf-cfg-menu fc-lancar-menu" id="fc-lancar-menu" hidden>' +
      '<button class="btn btn-o btn-mini" id="fc-tarefa">Tarefa</button><button class="btn btn-o btn-mini" id="fc-lanc">Lançamento financeiro</button>' +
      '<button class="btn btn-o btn-mini" id="fc-doc">Documento</button><button class="btn btn-o btn-mini" id="fc-int">Interação (ligação, WhatsApp…)</button>' +
      (pode('crm', 'editar') ? '<button class="btn btn-o btn-mini" id="fc-reuniao" title="Agenda reunião com o cliente: tarefa para os participantes e convite opcional">Reunião</button>' +
        '<button class="btn btn-o btn-mini" id="fc-indic" title="Oportunidade nova no CRM com origem = indicação deste cliente">Indicação</button>' +
        '<button class="btn btn-o btn-mini" id="fc-lead" title="Nova oportunidade no CRM para este cliente (novo serviço)">Novo serviço (CRM)</button>' : '') + '</span></span>' +
      (tel ? '<a class="btn btn-o btn-mini" target="_blank" rel="noopener" href="https://wa.me/' + (soDigitos(tel).length <= 11 ? '55' : '') + soDigitos(tel) + '">WhatsApp</a>' : '') +
      (mail ? '<a class="btn btn-o btn-mini" href="mailto:' + esc(mail) + '">E-mail</a>' : '') +
      '</div></div>' +
      '<div class="abas ficha-abas" id="fc-abas">' + ABAS_FICHA.map(([k, r]) => '<button data-aba="' + k + '">' + r + '</button>').join('') + '</div>' +
      '<div id="fc-corpo" class="ficha-corpo"></div>' });
  j.querySelector('.janela').classList.add('ficha');
  const corpo = j.querySelector('#fc-corpo');
  let atual = ABA_NOVA[aba] || aba || 'resumo';
  const mostrar = async (k) => {
    k = ABA_NOVA[k] || k; atual = k;
    j.querySelectorAll('#fc-abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === k));
    corpo.innerHTML = '<div class="carregando">Carregando…</div>';
    const partes = PARTES_FICHA[k] || [k];
    const caixas = partes.map((p) => { const d = document.createElement('div'); d.className = 'ficha-parte ficha-parte-' + p; return d; });
    corpo.innerHTML = ''; caixas.forEach((d) => corpo.appendChild(d));
    await Promise.all(partes.map(async (p, i) => {
      try { await ABA_FICHA[p](caixas[i], cl, () => mostrar(atual)); }
      catch (e) { console.error(e); caixas[i].innerHTML = '<div class="vazio">' + esc(erroAmigavel(e)) + '</div>'; }
    }));
  };
  { const bt = j.querySelector('#fc-lancar'), m = j.querySelector('#fc-lancar-menu');
    bt.onclick = (ev) => { ev.stopPropagation(); m.hidden = !m.hidden; bt.setAttribute('aria-expanded', String(!m.hidden)); };
    m.addEventListener('click', () => setTimeout(() => { m.hidden = true; bt.setAttribute('aria-expanded', 'false'); }, 0));
    j.addEventListener('click', (ev) => { if (!m.hidden && !ev.target.closest('.fc-lancar-wrap')) { m.hidden = true; bt.setAttribute('aria-expanded', 'false'); } }); }
  j.querySelector('#fc-abas').onclick = (ev) => { const b = ev.target.closest('button'); if (b) mostrar(b.dataset.aba); };
  const reabrir = async () => { await carregarCadastros(true); fecharJanela(j); await abrirFicha(id, atual); };
  j.querySelector('#fc-editar').onclick = () => formCliente(cl, reabrir);
  j.querySelector('#fc-tarefa').onclick = () => formTarefa({ cliente_id: cl.id, grupo_id: cl.grupo_id, responsavel: cl.responsavel }, () => mostrar('tarefas'));
  j.querySelector('#fc-lanc').onclick = () => formLancamento({ tipo: 'receita', empresa: 'escritorio', cliente_id: cl.id, grupo_id: cl.grupo_id, responsavel: cl.responsavel }, () => mostrar('financeiro'));
  j.querySelector('#fc-doc').onclick = () => janelaEnviarDocumento({ cliente_id: cl.id, grupo_id: cl.grupo_id }, () => mostrar('documentos'));
  j.querySelector('#fc-int').onclick = () => formInteracao(cl, () => mostrar('linha'));
  j.querySelector('#fc-etq').onclick = () => janelaEtiquetas(cl, etq, reabrir);
  const fcMail = j.querySelector('[data-cli-email]');
  if (fcMail) fcMail.onclick = () => comBotao(fcMail, async () => { await trocarRecebeEmail([cl.id], cl.recebe_email === false); fcMail.outerHTML = pillRecebeEmail(cl);
    const n = j.querySelector('[data-cli-email]'); if (n) n.onclick = fcMail.onclick; });
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
    const [lanc, tarefas, ints, procs, cert] = await Promise.all([
      lancamentosDoCliente(cl),
      q(sb.from('tarefas').select('*').or('cliente_id.eq.' + cl.id + (cl.grupo_id ? ',grupo_id.eq.' + cl.grupo_id : '')).not('status', 'in', '(concluida,cancelada)').order('prazo', { nullsFirst: false }).limit(200)),
      q(sb.from('interacoes').select('*').eq('cliente_id', cl.id).order('quando', { ascending: false }).limit(3)),
      cl.grupo_id ? q(sb.from('processos').select('id').eq('grupo_id', cl.grupo_id)) : [],
      q(sb.from('cliente_certificado').select('validade').eq('cliente_id', cl.id).maybeSingle()).catch(() => null)
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
      linhaDado('Origem', esc(cl.origem)) + linhaDado('Observação', esc(cl.obs)) + '</div></div>' +
      '<div class="card"><div class="card-hd">Situação</div><div class="card-bd dados">' +
      linhaDado('Procuração', pillSimNao(cl.procuracao)) + linhaDado('Certificado digital', pillSimNao(cl.certificado) + (cert && cert.validade ? ' <span class="sub">válido até ' + dataBR(cert.validade) + '</span>' : '')) +
      linhaDado('CAPAG', pillCapag(cl.capag)) + linhaDado('Situação cadastral', pillSitCad(cl.situacao_cadastral)) + linhaDado('Cadastro regular', pillSimNao(cl.cadastro_regular)) +
      linhaDado('Em operação', pillSimNao(cl.em_operacao)) + linhaDado('Regime tributário', esc(cl.regime_tributario)) + linhaDado('Tipo societário', esc(cl.tipo_societario)) +
      linhaDado('CEAT/TRT3', cl.ceat_trt3 != null ? String(cl.ceat_trt3) : '') + '</div></div></div>' +
      '<div class="duas-col"><div class="card"><div class="card-hd">Próximas tarefas</div><div class="card-bd">' +
      (tarefas.length ? tarefas.slice(0, 6).map((t) => '<div class="item-ficha"><div><b>' + esc(t.titulo) + '</b><div class="sub">' + (t.prazo ? 'até ' + dataBR(t.prazo) : 'sem prazo') + ' · ' + esc(t.responsavel || '—') + '</div></div>' +
        (t.prazo && t.prazo < h ? '<span class="pill vencido">atrasada</span>' : '') + '</div>').join('') : '<div class="sub">Nenhuma tarefa aberta.</div>') +
      '</div><div class="card-hd" style="border-top:1px solid var(--border)">Últimas interações</div><div class="card-bd">' +
      (ints.length ? ints.map((i) => '<div class="item-ficha"><div><b>' + esc(rotuloInteracao(i.tipo)) + '</b> <span class="sub">' + quandoBR(i.quando) + '</span><div>' + esc(i.resumo) + '</div></div></div>').join('') : '<div class="sub">Nenhuma interação registrada.</div>') +
      '</div></div>' + cardDebitos(cl) + '</div>';
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
    alvo.innerHTML = '<div class="duas-col">' + cardDebitos(cl) +
      '<div class="card"><div class="card-hd">Situação</div><div class="card-bd dados">' +
      linhaDado('CAPAG', pillCapag(cl.capag)) + linhaDado('Situação cadastral', pillSitCad(cl.situacao_cadastral)) + linhaDado('Cadastro regular', pillSimNao(cl.cadastro_regular)) +
      linhaDado('Em operação', pillSimNao(cl.em_operacao)) + linhaDado('Regime tributário', esc(cl.regime_tributario)) + linhaDado('Tipo societário', esc(cl.tipo_societario)) +
      linhaDado('CEAT/TRT3', cl.ceat_trt3 != null ? String(cl.ceat_trt3) : '') + '</div></div></div>';
  },
  // Cartão CNPJ: o que a Receita diz hoje (atualização diária às 6h) e o histórico do que mudou
  async receita(alvo, cl, repinta) {
    if (soDigitos(cl.cpf_cnpj).length !== 14) { alvo.innerHTML = ''; return; }   // Backup 49: no Resumo, pessoa física simplesmente não tem esta parte
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
function cardDebitos(cl) {
  const deb = (rot, v, neg) => v == null && neg == null ? '' : '<tr><td>' + rot + '</td><td class="mono">' + (v != null ? brl(v) : '—') + '</td><td class="mono">' + (neg != null ? brl(neg) : '—') + '</td></tr>';
  return '<div class="card"><div class="card-hd">Débitos</div><div class="card-bd">' +
    '<div class="tabela-wrap"><table><thead><tr><th>Órgão</th><th>Débito</th><th>Negociado</th></tr></thead><tbody>' +
    (deb('Receita Federal', cl.rfb, cl.rfb_negociada) + deb('PGFN', cl.pgfn, cl.pgfn_negociada) + deb('SEFAZ/MG', cl.sefaz_mg, null) + deb('AGE/MG', cl.age_mg, cl.age_mg_negociada) ||
      '<tr><td colspan="3" class="sub">Sem débitos informados.</td></tr>') + '</tbody></table></div>' +
    '<p class="sub" style="margin-top:8px">Para alterar os valores, use "Editar cadastro".</p></div></div>';
}
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
    '<div class="filtros cr-filtros"><div class="segmento" id="cr-abas">' + [['andamento', 'Em andamento'], ['ganho', 'Contratos assinados'], ['perdido', 'Leads perdidos']]
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
// Backup 49 (27): 5 etapas na tela — Contato · Diagnóstico · Proposta · Negociação · Fechado/Perdido (a faixa de baixo).
// As etapas detalhadas continuam no banco (as automações dependem delas) e aparecem como selo no cartão.
const GRUPOS_CRM = [['contato', 'Contato', /contato/i], ['diagnostico', 'Diagnóstico', /diagn/i], ['proposta', 'Proposta', /proposta|follow/i], ['negociacao', 'Negociação', /./]];
function grupoEtapa(e) { return (GRUPOS_CRM.find((g) => g[2].test(e.nome || '')) || GRUPOS_CRM[3])[0]; }
function colunaCrm(g, etapas, ops, h) {
  const ids = new Set(etapas.map((e) => e.id)), cs = ops.filter((o) => ids.has(o.etapa_id)), varias = etapas.length > 1;
  return '<div class="cr-col" data-etapa="' + (etapas[0] ? etapas[0].id : '') + '" data-grupo="' + g[0] + '" title="' + esc(etapas.map((e) => e.nome + (e.descricao ? ': ' + e.descricao : '')).join('\n')) + '">' +
    '<div class="cr-col-tit"><span>' + g[1] + '</span><span class="cr-col-n">' + cs.length + '</span></div>' + (cs.length ? '<div class="cr-col-val">' + esc(brlCurto(soma(cs, (o) => o.valor_estimado))) + '</div>' : '') +
    cs.map((o) => { const e = etapaDe(o.etapa_id); return cartaoOp(o, e, h).replace('<b>', (varias ? '<span class="cr-sub-etapa">' + esc(e.nome) + '</span>' : '') + '<b>'); }).join('') +
    (!cs.length ? '<div class="cr-vazia"><span class="cr-vazia-ic" aria-hidden="true">○</span>Nenhuma oportunidade<span class="sub">arraste um cartão para cá</span></div>' : '') + '</div>';
}
function crmFunil(alvo) {
  const ops = filtrarOps(), h = hojeISO(), et = E._crmEtapas || [];
  const abertas = et.filter((e) => !e.final), fins = et.filter((e) => e.final);
  const cols = GRUPOS_CRM.map((g) => [g, abertas.filter((e) => grupoEtapa(e) === g[0])]).filter(([, l]) => l.length);
  alvo.innerHTML = '<div class="cr-linha" style="--n:' + cols.length + '">' + cols.map(([g, l]) => colunaCrm(g, l, ops, h)).join('') + '</div>' +
    '<div class="cr-fins-tit">Fechado / Perdido</div>' +
    '<div class="cr-fins">' + fins.map((e) => '<div class="cr-solte cr-solte-' + e.final + '" data-etapa="' + e.id + '">' +
      (e.final === 'ganho' ? '✓ Solte aqui quando o cliente <b>assinar</b> — vai para a aba "Contratos assinados"' : '✕ Solte aqui quando <b>não fechar</b> — vai para a aba "Leads perdidos"') + '</div>').join('') + '</div>' +
    '<p class="sub" style="margin-top:8px">Arraste o cartão para mudar a etapa (no celular, use ▸, que também passa pelas etapas de dentro: Diagnóstico agendado → feito, Proposta enviada → follow-up, Negociação → Contrato fechado → Aguardando assinatura). ' +
    '<b>Contrato fechado</b> = o cliente disse sim (o sistema cria cadastro, contrato e onboarding).</p>';
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
  if (!e.final && !etapaDe(o.etapa_id).final && grupoEtapa(etapaDe(o.etapa_id)) === grupoEtapa(e)) return;   // Backup 49: solto na mesma coluna = não muda
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
        ' <a href="#" id="op-ver-cli">Abrir a ficha do cliente</a><span style="margin-left:auto;display:flex;gap:6px"><button class="btn btn-o btn-mini" type="button" id="op-ver-ctr">Abrir o contrato</button></span></div>' : '') +
      // Backup 40: sem atalhos para os geradores de documentos (sistema à parte); ficam a sala no Meet e a agenda
      '<div class="op-integra"><span class="sub">Ferramentas:</span>' +
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
  const vct = j.querySelector('#op-ver-ctr'); if (vct) vct.onclick = () => detalheContrato(o.contrato_id);
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
    corpo: '<div class="lista-ficha">' + ms.map((m) => '<div class="item-ficha clicavel" data-mod="' + m.id + '"><b>' + esc(m.nome) + '</b><span class="sub">' + (m.itens || []).length + ' item(ns)' + (m.texto_completo ? ' · tem versão completa' : '') + '</span></div>').join('') +
      (ps.length ? '<div class="item-ficha clicavel" data-mod="copia"><b>Copiar a última versão (v' + ps[0].versao + ')</b></div>' : '') +
      '<div class="item-ficha clicavel" data-mod=""><b>Em branco</b></div></div>' });
  j.querySelectorAll('[data-mod]').forEach((d) => d.onclick = () => {
    fecharJanela(j);
    const m = ms.find((x) => x.id === d.dataset.mod), ult = ps[0];
    const base = d.dataset.mod === 'copia' ? { titulo: ult.titulo, texto: ult.texto, itens: ult.itens, texto_completo: ult.texto_completo || '', formato: ult.formato || 'simplificada' }
      : m ? { titulo: m.nome, texto: m.texto, itens: m.itens, texto_completo: m.texto_completo || '', formato: 'simplificada' } : { titulo: 'Proposta de honorários', texto: '<p>Prezado(a) {cliente},</p><p></p>', itens: [], texto_completo: '', formato: 'simplificada' };
    editorProposta(o, Object.assign({ versao: (ult ? ult.versao : 0) + 1, validade: somarDias(hojeISO(), 15), status: 'rascunho' }, base), repinta);
  });
}
// Proposta com a marca do escritório (serve para PDF e e-mail: estilos embutidos e layout em tabelas)
function htmlProposta(o, p) {
  const cli = nomeOp(o), total = soma(p.itens || [], (i) => i.valor), N = '#1B2A4A', D = '#C9A84C', T = '#374151', C = '#6B7280';
  const trocar = (h) => String(h || '').split('{cliente}').join(esc(cli)).split('{validade}').join(p.validade ? dataBR(p.validade) : '—')
    .split('{valor}').join(brl(total)).split('{parcelas}').join('')
    .replace(/<h3>/g, '<h3 style="color:' + N + ';font-size:15px;margin:20px 0 6px;letter-spacing:.01em">').replace(/<ul>/g, '<ul style="margin:6px 0 12px;padding-left:20px">').replace(/<li>/g, '<li style="margin:3px 0">');
  // Backup 40: "completa" = o texto de sempre + o detalhamento do serviço (escopo, fases, prazo, documentos)
  const detalhe = p.formato === 'completa' && p.texto_completo ? '<div style="margin-top:8px;padding-top:4px;border-top:1px solid #E5E7EB">' + trocar(p.texto_completo) + '</div>' : '';
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
      '<div style="margin-top:22px">' + texto + detalhe + '</div>' +
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
      '<div class="campo inteiro"><span>Apresentação</span><div class="segmento" id="pr-formato">' + [['simplificada', 'Simplificada'], ['completa', 'Completa (detalha o serviço)']].map(([v, r]) => '<button type="button" data-v="' + v + '"' + ((p.formato || 'simplificada') === v ? ' class="ativo"' : '') + '>' + r + '</button>').join('') + '</div></div>' +
      '<div class="inteiro"><div class="secao">Texto <span class="sub">— clique e edite; {cliente} e {validade} são trocados sozinhos</span></div>' +
      '<div class="pr-texto" id="pr-texto" contenteditable="true">' + (p.texto || '') + '</div></div>' +
      '<div class="inteiro" id="pr-completo-box"' + ((p.formato || 'simplificada') === 'completa' ? '' : ' hidden') + '><div class="secao">Detalhamento do serviço <span class="sub">— entra só na versão completa</span></div>' +
      '<div class="pr-texto pr-completo" id="pr-completo" contenteditable="true">' + (p.texto_completo || '<h3>Escopo</h3><ul><li></li></ul><h3>Prazo</h3><p></p><h3>Documentos necessários</h3><ul><li></li></ul>') + '</div></div>' +
      '<div class="inteiro"><div class="secao">Valores</div><div id="pr-itens"></div><button type="button" class="btn btn-o btn-mini" id="pr-add">+ Item</button></div></form>' +
      // Backup 42: prévia ao vivo — a proposta como o cliente vai ver, redesenhada enquanto você digita (leve: só depois de uma pausa na digitação)
      '<aside class="pr-ao-vivo"><div class="secao">👁 Prévia ao vivo</div><iframe id="pr-previa" title="Prévia da proposta" sandbox></iframe></aside>',
    rodape: '<div class="acoes"><button class="btn btn-o" type="button" id="pr-pdf">Ver / salvar PDF</button><button class="btn btn-o" type="button" id="pr-guardar">Guardar nos Documentos</button>' +
      '<button class="btn btn-o" type="button" id="pr-email">Enviar por e-mail</button>' + (o.prospecto_telefone ? '<button class="btn btn-o" type="button" id="pr-zap">WhatsApp</button>' : '') + '</div>' +
      '<div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Fechar</button><button class="btn btn-p" type="button" id="pr-salvar">Salvar</button></div>' });
  const f = j.querySelector('#f-pr');
  let formato = p.formato || 'simplificada';
  j.querySelector('#pr-formato').onclick = (ev) => { const b = ev.target.closest('[data-v]'); if (!b) return; formato = b.dataset.v;
    j.querySelectorAll('#pr-formato button').forEach((x) => x.classList.toggle('ativo', x === b)); j.querySelector('#pr-completo-box').hidden = formato !== 'completa'; };
  const pintarItens = () => {
    j.querySelector('#pr-itens').innerHTML = itens.map((i, k) => '<div class="pr-item"><input data-k="' + k + '" data-c="servico" placeholder="Serviço" value="' + esc(i.servico || '') + '">' +
      '<input data-k="' + k + '" data-c="forma" placeholder="Forma de pagamento" value="' + esc(i.forma || '') + '">' +
      '<input data-k="' + k + '" data-c="valor" inputmode="decimal" placeholder="0,00" value="' + (i.valor ? valorParaCampo(i.valor) : '') + '"><button type="button" class="btn-etq" data-x="' + k + '">×</button></div>').join('') +
      '<div class="sub" style="margin:6px 0">Total: <b>' + brl(soma(itens, (i) => i.valor)) + '</b></div>';
    j.querySelectorAll('#pr-itens input').forEach((inp) => inp.onchange = () => { const v = inp.dataset.c === 'valor' ? (lerValor(inp.value) || 0) : inp.value; itens[+inp.dataset.k][inp.dataset.c] = v; pintarItens(); });
    j.querySelectorAll('#pr-itens [data-x]').forEach((b) => b.onclick = () => { itens.splice(+b.dataset.x, 1); pintarItens(); });
  };
  pintarItens();
  j.querySelector('.janela').classList.add('pr-janela');
  let tPrev; const previa = () => { clearTimeout(tPrev); tPrev = setTimeout(() => { const fr = j.querySelector('#pr-previa'); if (fr && fr.isConnected) fr.srcdoc = '<!doctype html><html><body style="margin:0;background:#EEF1F6;padding:10px">' + htmlProposta(o, atual()) + '</body></html>'; }, 450); };
  j.querySelector('#f-pr').addEventListener('input', previa); j.querySelector('#f-pr').addEventListener('change', previa); j.querySelector('#f-pr').addEventListener('click', previa);
  setTimeout(previa, 0);
  j.querySelector('#pr-add').onclick = () => { itens.push({ servico: '', forma: '', valor: 0 }); pintarItens(); };
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  const atual = () => Object.assign({}, p, { titulo: f.titulo.value.trim(), validade: f.validade.value || null, texto: limparHtml(j.querySelector('#pr-texto').innerHTML), itens,
    formato, texto_completo: limparHtml(j.querySelector('#pr-completo').innerHTML) });
  const salvar = async () => {
    const d = atual(), dados = { oportunidade_id: o.id, versao: d.versao, titulo: d.titulo, validade: d.validade, texto: d.texto, itens: d.itens, formato: d.formato, texto_completo: d.texto_completo };
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
    const s = await enviarEmailAgora(null, para.trim());   // Backup 42: sai na hora
    aviso('Proposta: ' + (s.ok ? '✓ ' : '⚠ ') + s.msg, !s.ok); fecharJanela(j); await repinta();
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
    // Backup 41: uma linha por modelo, em 4 colunas fixas — A (nome e itens) · B Simplificada · C Completa · D Editar
    corpo: '<div class="mp-lista">' + ms.map((m) => '<div class="mp-linha"><div class="mp-a"><b>' + esc(m.nome) + '</b><div class="sub">' + (m.itens || []).map((i) => esc(i.servico)).join(' · ') + '</div></div>' +
      '<button class="btn btn-o btn-mini" data-mp-ver="' + m.id + '">👁 Simplificada</button>' +
      (m.texto_completo ? '<button class="btn btn-o btn-mini" data-mp-ver="' + m.id + '" data-completa="1">👁 Completa</button>' : '<button class="btn btn-o btn-mini" disabled title="Sem detalhamento: clique em Editar e escreva a versão completa">👁 Completa</button>') +
      '<button class="btn btn-o btn-mini" data-mp="' + m.id + '">Editar</button></div>').join('') + '</div>',
    rodape: '<span></span><button class="btn btn-p" type="button" id="mp-novo">+ Novo modelo</button>' });
  const editar = (m) => {
    m = m || { nome: '', texto: '<p>Prezado(a) {cliente},</p><p></p><p>Esta proposta vale até {validade}.</p>', itens: [] };
    const k = abrirJanela({ titulo: m.id ? 'Editar modelo' : 'Novo modelo', larga: true,
      corpo: '<form class="grade" id="f-mp">' + campo('Nome', '<input name="nome" value="' + esc(m.nome) + '">', 'inteiro') +
        '<div class="inteiro"><div class="secao">Texto (versão simplificada)</div><div class="pr-texto" id="mp-texto" contenteditable="true">' + m.texto + '</div></div>' +
        '<div class="inteiro"><div class="secao">Detalhamento do serviço <span class="sub">— usado quando a proposta é "Completa" (escopo, fases, prazo, documentos)</span></div><div class="pr-texto pr-completo" id="mp-completo" contenteditable="true">' + (m.texto_completo || '') + '</div></div>' +
        campo('Itens (um por linha: serviço ; forma de pagamento ; valor)', '<textarea name="itens" rows="5">' + esc((m.itens || []).map((i) => [i.servico, i.forma || '', i.valor ? valorParaCampo(i.valor) : ''].join(' ; ')).join('\n')) + '</textarea>', 'inteiro') + '</form>',
      rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="mp-salvar">Salvar</button></div>' });
    const f = k.querySelector('#f-mp');
    k.querySelector('[data-cancelar]').onclick = () => fecharJanela(k);
    k.querySelector('#mp-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
      if (!f.nome.value.trim()) throw new Error('Dê um nome ao modelo.');
      const itens = f.itens.value.split('\n').map((l) => l.split(';').map((x) => x.trim())).filter((x) => x[0]).map(([servico, forma, valor]) => ({ servico, forma: forma || '', valor: lerValor(valor || '') || 0 }));
      const d = { nome: f.nome.value.trim(), texto: limparHtml(k.querySelector('#mp-texto').innerHTML), texto_completo: limparHtml(k.querySelector('#mp-completo').innerHTML), itens };
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
      htmlProposta({ prospecto_empresa: 'Empresa Exemplo Ltda' }, { versao: 1, titulo: m.nome, texto: m.texto, texto_completo: m.texto_completo || '', formato: b.dataset.completa ? 'completa' : 'simplificada', itens: (m.itens || []).map((i) => Object.assign({}, i, { valor: i.valor || 1000 })), validade: somarDias(hojeISO(), 15) }) + '</body></html>');
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
// úteis, ou pelo botão "Buscar agora" — desde o Backup 52 pelo navegador); aqui a equipe lê, cria a tarefa com
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
  const F = E.pub; F.status = 'nova';   // Backup 49 (31): sempre abre em Novas
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Publicações</h1><p id="pub-ult">Diário de Justiça Eletrônico Nacional · busca automática pelo navegador, 1× por dia ao abrir o ERP</p></div>' +
    '<div class="acoes"><button class="btn btn-o" id="pub-todas-lidas" title="Marca como lidas todas as publicações novas">✓ Marcar todas como lidas</button><button class="btn btn-o" id="pub-oabs">⚙ Monitoramento (OABs e clientes)</button><button class="btn btn-p" id="pub-buscar" title="Busca no Diário do CNJ pelo seu navegador (se ele falhar, tenta pelo servidor)">↻ Buscar agora</button></div></div>' +
    '<div class="filtros"><div class="segmento" id="pub-st">' + [['nova', 'Novas'], ['lida', 'Lidas'], ['tratada', 'Tratadas'], ['descartada', 'Descartadas'], ['', 'Todas']].map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<select class="busca sel" id="pub-dias"><option value="7">Últimos 7 dias</option><option value="15">Últimos 15 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="">Todo o período</option></select>' +

    '<input class="busca" id="pub-busca" placeholder="Buscar no texto, processo ou parte" autocomplete="off"></div>' +
    // Backup 21: tribunais como filtro de botões — só os que têm publicação pendente (nova ou lida) no período
    // Backup 35: filtro por advogado (os nomes cadastrados em Monitoramento → OABs) em botões, como os tribunais
    '<div class="filtros pub-trib-linha"><div class="segmento" id="pub-advs" role="group" aria-label="Advogado"></div></div>' +
    '<div class="filtros pub-trib-linha"><div class="segmento" id="pub-trib" role="group" aria-label="Tribunal"></div></div><div id="pub-corpo"><div class="carregando">Carregando…</div></div>';
  $('pub-oabs').onclick = () => janelaOabs();
  $('pub-todas-lidas').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!confirm('Marcar TODAS as publicações novas como lidas?')) return;
    const r = (await q(sb.from('publicacoes').update({ status: 'lida' }).eq('status', 'nova').select('id'))) || [];
    aviso('✓ ' + plural(r.length, 'publicação marcada como lida', 'publicações marcadas como lidas') + '.'); await carregarPublicacoes();
  });
  // Backup 52 (C5): "Buscar agora" busca PELO NAVEGADOR (o CNJ recusa o servidor do Supabase, que fica fora do Brasil);
  // se o navegador não alcançar o CNJ, tenta a função erp-publicacoes como reserva e explica. O antigo "🌐 Buscar pelo navegador" virou este botão.
  $('pub-buscar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const r = await buscarPubNoNavegador({ silencioso: true, detalhe: true });
    if (r.semMonitoramento) throw new Error('Cadastre pelo menos uma OAB ou um cliente em "Monitoramento".');
    if (r.erros.length && !r.lidas) {
      const data = await chamarFuncao('erp-publicacoes', {}).catch((e) => ({ erros: [e.message] }));
      const erro = data.erros && data.erros.length ? data.erros[0] : '';
      if (!erro) aviso('✓ Busca feita (pelo servidor, porque o navegador não alcançou o CNJ): ' + (data.lidas || 0) + ' publicação(ões) lida(s), ' + (data.novas || 0) + ' nova(s).');
      else aviso('⚠ A busca não foi feita. Pelo navegador: ' + r.erros[0] + '. Pelo servidor: ' + erro + '. Tente de novo em alguns minutos.', true);
    } else aviso('✓ Busca feita: ' + r.lidas + ' publicação(ões) lida(s), ' + r.novas + ' nova(s).' + (r.erros.length ? ' Atenção: ' + r.erros[0] : ''), !!r.erros.length);
    await TELAS.publicacoes();
  });
  $('pub-st').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.status = b.dataset.v; pintarPublicacoes(); } };
  $('pub-trib').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.tribunal = b.dataset.v; pintarPublicacoes(); } };
  $('pub-dias').onchange = (ev) => { F.dias = ev.target.value; carregarPublicacoes(); };
  $('pub-advs').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.adv = b.dataset.v; pintarPublicacoes(); } };
  $('pub-dias').value = F.dias; $('pub-busca').value = F.busca;
  let t; $('pub-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; pintarPublicacoes(); }, 250); };
  q(sb.from('configuracoes').select('valor').eq('chave', 'publicacoes_ultima').maybeSingle()).then((u) => {
    if (u && u.valor && $('pub-ult')) $('pub-ult').textContent = 'Última busca: ' + quandoRodou(u.valor.quando) + ' · ' + u.valor.novas + ' nova(s) de ' + u.valor.lidas + ' lida(s)' +
      (u.valor.erros && u.valor.erros.length ? ' · ⚠ ' + u.valor.erros[0] : '') + ' · automática 1× por dia ao abrir o ERP';
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
  if (!os.length && !ps.length) { if (op.detalhe) return { lidas: 0, novas: 0, erros: [], semMonitoramento: true }; if (op.silencioso) return 0; throw new Error('Cadastre pelo menos uma OAB ou um cliente em "Monitoramento".'); }
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
  return op.detalhe ? { lidas, novas, erros } : novas;
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
// Backup 53: voltou a versão do Backup 48 (publicações, parcelas e acordos vencidos, honorários em atraso e tarefas de volta)
TELAS.alertas = async function () {
  await carregarCadastros();
  $('conteudo').innerHTML = '<div class="titulo-pag"><div><h1>Alertas</h1><p>O que precisa de atenção em cada setor · clique num cartão para ver o relatório</p></div>' +
    '<div class="acoes">' + botaoAtualizar('al-atualizar', 'Monta os alertas de novo') + '</div></div><div id="al-corpo"><div class="carregando">Montando os alertas…</div></div>';
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
  if (emails.length || (E.perfil && E.perfil.papel === 'admin')) add('Rotinas', 'E-mails com erro', String(emails.length), 'não saíram depois de 3 tentativas', emails.length ? 'critico' : 'ok',
    { titulo: 'E-mails com erro', colunas: ['Quando', 'Para', 'Assunto', 'Erro'], linhas: emails.map((m) => [quandoRodou(m.criado_em), m.para, m.assunto, m.erro]) });
  // Backup 37: a busca é feita pela WEB (navegador, 1× por dia ao abrir o ERP, ou "Buscar pelo navegador")
  if (podeJur) add('Rotinas', 'Busca de publicações (web)', ultPub && ultPub.valor ? quandoCurto(ultPub.valor.quando) : 'nunca rodou',
    ultPub && ultPub.valor ? ultPub.valor.novas + ' nova(s) · ' + ((ultPub.valor.erros || []).length ? '⚠ ' + ultPub.valor.erros[0] : 'sem erro') : 'cadastre as OABs em Publicações',
    !ultPub || !ultPub.valor ? 'atencao' : (ultPub.valor.erros || []).length ? 'critico' : 'ok', { tela: 'publicacoes' });
  // Backup 37: a PGFN por arquivo (dados abertos, importado à mão) saiu dos Alertas
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
  $('al-corpo').querySelectorAll('[data-al]').forEach((b) => b.onclick = () => { const a = A[+b.dataset.al]; if (a.rel.cnpj) janelaCnpj(cnpj); else if (a.rel.saude) janelaSaude(a.rel.saude); else if (a.rel.backup) irTelaAlerta('admin', 'backup'); else relatorioAlerta(a); });
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



'use strict';
// ═══════════════════════════════════════════════════════════════════
// Guias (Backup 27) — emissão das guias de PARCELAMENTOS e dos boletos/PIX de ACORDOS,
// pensada para o estagiário: 1) emitir  2) marcar "emitida" (data e quem, com o PDF guardado)
// 3) mandar ao cliente por e-mail (a guia vai anexa)  4) conferir o pagamento (✓ Pago).
// Quadro "Guias para emitir" no alto de Parcelamentos e de Acordos + janela de emissão,
// usada também nos cartões das parcelas do detalhamento.
// ═══════════════════════════════════════════════════════════════════
const GUIA_DIAS = 15;   // o quadro mostra o que vence até 15 dias à frente (e tudo o que já venceu sem pagamento)
const ABAS_GUIA = [['emitir', 'A emitir'], ['emitidas', 'Emitidas — falta enviar'], ['vencidas', 'Vencidas sem pagamento']];   // Backup 49: abas sem ícone
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
    L = (await buscarTodos(() => sb.from('acordos').select('id, parcela, total_parcelas, vencimento, valor, pago, emissao, emitida_em, emitida_por, guia_doc, reenvio_em, reenvio_venc, reenvio_valor, reenvios, devedor, credor, processo, grupo_id, pix, pix_codigo, banco, forma_pagamento')
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
const guiaEnviada = (x) => !!x.email_em && !/erro|cancelado|^rascunho$/.test(x.email_st || '');   // Backup 44: rascunho não salvo volta para "falta enviar"
const ST_EMAIL = { pendente: ['aberto', '✉ na fila'], retido: ['hoje', '⏸ retido (pausa)'], enviado: ['pago', '✉ enviado'], erro: ['vencido', '⚠ e-mail falhou'], cancelado: ['neutro', 'e-mail descartado'], rascunho: ['vencido', '📝 rascunho não salvo'], rascunho_salvo: ['pago', '📝 rascunho no Gmail'] };

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
  const cx = campo.closest('.campo'); if (cx) cx.classList.toggle('ge-sem-email', !para);
}
let _emailTeste;
async function emailDeTeste() {
  if (_emailTeste === undefined) _emailTeste = ((await q(sb.from('configuracoes').select('valor').eq('chave', 'email_redirecionar')).catch(() => []))[0] || {}).valor || '';
  return typeof _emailTeste === 'string' ? _emailTeste : '';
}
async function copiarTexto(txt) {
  try { await navigator.clipboard.writeText(txt); }
  catch (e) { const a = document.createElement('textarea'); a.value = txt; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); }
}
// Backup 42: depois de pôr o e-mail na fila, manda na hora (enviarEmailAgora) e mostra o que aconteceu de verdade
async function avisoEnvio(prefixo, r) {
  const s = r && r.status === 'rascunho' ? await salvarRascunhoAgora(r.ref) : await enviarEmailAgora(r && r.ref, r && r.para);
  aviso(prefixo + (s.ok ? '✓ ' : '⚠ ') + s.msg, !s.ok);
  return s;
}

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
      await avisoEnvio((tabela === 'parcelas' ? 'Guia emitida' : 'Boleto emitido') + '. ', r); fecharJanela(j); if (depois) await depois(); if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); return;
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
    await avisoEnvio('↻ ' + (tabela === 'parcelas' ? 'Guia' : 'Boleto') + ' reenviado. ', r); fecharJanela(j);
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
// Backup 52 (C6): o PIX de uma parcela de acordo = o código copia e cola dela (pix_codigo) ou, sem ele, a chave PIX do acordo (qualquer forma de pagamento)
const pixDaParcela = (x) => String((x._pixCodigo != null ? x._pixCodigo : x.pix_codigo) || x.pix || '').trim();
const fechoGuias = (tabela, itens) => tabela === 'parcelas' ? 'Os arquivos seguem anexos. Depois de pagar, por favor nos envie o comprovante.'
  // Backup 42: acordo sem o pedido de comprovante; PIX sem fecho (não tem arquivo)
  : itens.every((x) => ehPixGuia(tabela, x)) ? ''
  : itens.some((x) => ehPixGuia(tabela, x)) ? 'Os boletos seguem anexos (as parcelas por PIX têm a chave acima).'
  : (itens.length > 1 ? 'Os boletos seguem anexos.' : 'O boleto segue anexo.');
// o texto (e-mail e WhatsApp). Parcelamentos: modelo das antigas Notificações. Acordos (Backup 37): objetivo, como o escritório escreve
function textoGuias(tabela, empresa, itens) {
  const vencida = itens.some((x) => x.vencimento < hojeISO());
  const valorDe = (x) => { const v = x._valor != null ? x._valor : x.valor; return v ? brl(v) : '[preencher]'; };
  const tot = itens.reduce((s2, x) => s2 + (Number(x._valor != null ? x._valor : x.valor) || 0), 0), fecho = fechoGuias(tabela, itens);
  if (tabela === 'parcelas') {
    // Backup 42: o texto das antigas Notificações → Parcelamento, palavra por palavra (o mesmo da Planilha da Rotina)
    // Backup 52 (C7): texto genérico — o nome do cliente fica só no assunto (antes: "guias dos parcelamentos da Fulano")
    const intro = 'Prezados,\n\nSeguem as guias dos parcelamentos com vencimento neste mês. Antes de pagar, confirme se a guia já não foi paga, para evitar duplicidade.';
    const blocos = itens.map((x) => { const p = x.parcelamentos || {}, [n, tt] = String(x.parcela || '').split('/'), v = x._venc || x.vencimento || '';
      return (x.vencimento < hojeISO() ? '⚠︎ GUIA VENCIDA\n' : '') + 'Parcelamento ' + (p.local || p.natureza || '') + ' — Natureza: ' + (p.natureza || '—') +
        '\nNº do Parcelamento: ' + (p.numero || '—') + '\nParcela: ' + (n || '?') + ' de ' + (tt || p.total_parcelas || '?') + ' | Vencimento: ' + (v ? v.slice(5, 7) + '/' + v.slice(0, 4) : '—') +
        '\nNº da Guia: ' + (n || '—') + '\nValor: ' + valorDe(x); });
    return { intro, fecho, email: intro + '\n\n' + fecho, zap: intro + '\n\n' + blocos.join('\n\n') + (itens.length > 1 ? '\n\n*Total: ' + brl(tot) + '*' : '') + '\n\n' + fecho };
  }
  // Backup 52 (C6/C7): texto genérico (sem "da Fulano") e o PIX da parcela — o código copia e cola dela ou, sem ele, a chave PIX do acordo
  const intro = saudacaoGuia() + '\n\nSeguem as parcelas de acordo com vencimento neste mês ou em atraso.';
  const blocos = itens.map((x) => { const pix = pixDaParcela(x);
    return (x.vencimento < hojeISO() ? '⚠ PARCELA EM ATRASO\n' : '') + '*Acordo para pagamento*\nProcesso: ' + (x.processo || '—') + ' | Parcela: ' + parcOrd(x) +
      '\nPartes: ' + (x.devedor || '—') + ' × ' + (x.credor || '—') + '\nVencimento: ' + dataBR(x._venc || x.vencimento) + '\nValor: ' + valorDe(x) +
      (pix ? '\nPIX: ' + pix + (x.banco && !x._pixCodigo && !x.pix_codigo ? '\nBanco: ' + x.banco : '') : ehPixGuia(tabela, x) ? '\nPIX: [chave PIX]' : ''); });
  return { intro, fecho, email: intro + (fecho ? '\n\n' + fecho : ''), zap: intro + '\n\n' + blocos.join('\n\n') + (itens.length > 1 ? '\n\nTotal: ' + brl(tot) : '') + (fecho ? '\n\n' + fecho : '') };
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
  const soRascunho = tabela === 'acordos';
  const j = abrirJanela({ titulo: tabela === 'parcelas' ? '✉ Enviar guias por empresa' : '✉ Enviar parcelas de acordo por empresa', larga: true,
    corpo: '<div class="ge"><aside class="ge-emps" id="ge-emps"></aside><section class="ge-msg" id="ge-msg"></section></div>',
    rodape: '<span class="ge-tot" id="ge-tot"></span><div class="acoes ge-acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button>' +
      // Backup 45: em Acordos o e-mail é só "Rascunho no Gmail" (sem prévia, sem WhatsApp, sem "Enviar e-mail")
      (soRascunho ? '<button type="button" class="btn btn-o" id="ge-copiar" title="Copia o texto">📋 Copiar texto</button>' +
        '<button type="button" class="btn btn-p" id="ge-rascunho" title="Guarda o e-mail pronto (com os anexos) na pasta Rascunhos do seu Gmail, já com o e-mail do cliente — confira e envie de lá">📝 Rascunho no Gmail</button></div>'
      : '<button type="button" class="btn btn-o" id="ge-previa" title="Ver o e-mail exatamente como o cliente vai receber">👁 Prévia do e-mail</button>' +
      '<button type="button" class="btn btn-o" id="ge-copiar" title="Copia o texto para você colar no WhatsApp">📋 Copiar texto</button>' +
      '<button type="button" class="btn btn-v" id="ge-zap">💬 WhatsApp</button>' +
      '<button type="button" class="btn btn-o" id="ge-rascunho" title="Guarda o e-mail pronto (com os anexos) na pasta Rascunhos do seu Gmail, para você conferir e enviar de lá">📝 Rascunho no Gmail</button>' +
      '<button class="btn btn-p" type="button" id="ge-enviar">✉ Enviar e-mail</button></div>') });
  j.querySelector('.janela').classList.add('ge-janela');
  const $j = (sel) => j.querySelector(sel);
  const pixItem = (i) => tabela === 'acordos' && pixDaParcela(i) ? { pix: pixDaParcela(i), banco: (i._pixCodigo || i.pix_codigo) ? '' : i.banco || '', pix_codigo: !!(i._pixCodigo || i.pix_codigo) } : {};
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
      '<div class="ge-dest"><label class="campo"><span>✉ E-mail (para)</span><input id="ge-para" type="text" autocomplete="off" placeholder="procurando o e-mail cadastrado…"><small class="sub" id="ge-teste"></small></label>' +
        (soRascunho ? '' : '<label class="campo"><span>💬 WhatsApp</span><input id="ge-tel" data-mascara="tel" inputmode="tel" value="' + esc(c.telefone || '') + '" placeholder="(37) 9 9999-9999"></label>') +
        '<label class="campo ge-ass"><span>Assunto</span><input id="ge-assunto" value="' + esc((tabela === 'parcelas' ? 'Guias de parcelamento' : e.itens.every((x) => ehPixGuia(tabela, x)) ? 'Parcela de acordo' : 'Boletos de acordo') + ' — ' + e.nome) + '"></label></div>' +
      '<div class="ge-papel"><textarea id="ge-texto" rows="5">' + esc(t.intro) + '</textarea>' +
        '<div class="ge-itens">' + e.itens.map((x) => { const p = x.parcelamentos || {};
          return '<label class="ge-it' + (tabela === 'acordos' ? ' ge-it-ac' : '') + (x.vencimento < hojeISO() ? ' ge-venc' : '') + '" data-ge="' + x.id + '"><input type="checkbox" checked aria-label="Incluir">' +
            '<span class="ge-it-txt">' + (x.vencimento < hojeISO() ? '<span class="ge-alerta">⚠ ' + (tabela === 'parcelas' ? 'GUIA VENCIDA' : 'PARCELA VENCIDA') + '</span>' : '') +
              '<b>' + esc(tabela === 'parcelas' ? 'Parcelamento ' + [p.local, p.natureza].filter(Boolean).join(' — ') : 'Processo ' + (x.processo || '—') + ' · ' + parcOrd(x)) + '</b>' +
              (ehPixGuia(tabela, x) ? ' <span class="ge-forma">PIX</span>' : tabela === 'acordos' ? ' <span class="ge-forma ge-forma-b">boleto</span>' : '') +
              '<span>' + (tabela === 'parcelas' ? (p.numero ? 'Nº do parcelamento: <b>' + esc(p.numero) + '</b> · Parcela <b>' + esc(parcDe(x)) + '</b> · ' : 'Parcela <b>' + esc(parcDe(x)) + '</b> · ') : 'Partes: <b>' + esc(x.devedor || '—') + ' × ' + esc(x.credor || '—') + '</b> · ') +
              'Vencimento <b>' + dataBR(x.vencimento) + '</b>' + '</span></span>' +
            (tabela === 'parcelas' && x.vencimento < hojeISO() ? '<span class="ge-it-v ge-it-d"><small>Novo vencimento</small><input type="date" class="ge-novo-venc" value="' + fimDoMesGuia(hojeISO()) + '" aria-label="Novo vencimento da guia atualizada"></span>' : '') +
            (tabela === 'acordos' ? '<span class="ge-it-v ge-it-pix"><small>Código PIX (copia e cola)</small><input class="ge-pix" data-mascara="nenhuma" value="' + esc(x.pix_codigo || '') + '" placeholder="' + esc(x.pix ? 'vazio = chave ' + x.pix : 'cole o código desta parcela') + '" aria-label="Código PIX (copia e cola)"></span>' : '') +
            '<span class="ge-it-v"><small>' + (tabela === 'acordos' ? 'Valor da parcela' : x.vencimento < hojeISO() ? 'Valor atualizado' : 'Valor da guia') + '</small><span class="ge-vbox"><span class="ge-rs">R$</span><input class="ge-valor" data-mascara="nenhuma" inputmode="decimal" value="' + (x.valor ? valorParaCampo(x.valor) : '') + '" placeholder="0,00" aria-label="Valor"></span></span></label>'; }).join('') + '</div>' +
        '<div class="ge-fecho">' + esc(t.fecho) + '</div></div>' +
      '<div class="ge-anexos"' + (e.itens.every((x) => ehPixGuia(tabela, x)) ? ' hidden' : '') + '><label class="ge-drop"><input type="file" id="ge-arqs" accept=".pdf,image/*" multiple hidden><span>📎 <b>Anexar os PDFs</b> ' + (tabela === 'acordos' ? 'dos boletos' : 'das guias') + '</span><small>vão só no e-mail — não ficam guardados no sistema</small></label><div class="ge-chips" id="ge-chips"></div></div>';
    $j('#ge-arqs').onchange = () => { arquivos = arquivos.concat([...$j('#ge-arqs').files]); $j('#ge-arqs').value = ''; pintarChips(); };
    j.querySelectorAll('.ge-it input').forEach((i) => i.addEventListener('input', total));
    j.querySelectorAll('.ge-it input[type=checkbox]').forEach((i) => i.addEventListener('change', total));
    j.querySelectorAll('.ge-valor').forEach((i) => i.addEventListener('blur', () => { const v = lerValor(i.value); i.value = v ? valorParaCampo(v) : ''; total(); }));
    preencherDestino($j('#ge-para'), e.cli, e.grupo, tabela);
    emailDeTeste().then((m) => { const x = $j('#ge-teste'); if (x && m) x.textContent = 'Modo teste: por enquanto todo e-mail chega só em ' + m + '.'; });
    pintarChips(); total();
  };
  const pintarChips = () => { $j('#ge-chips').innerHTML = arquivos.map((f, k) => '<span class="ge-chip">📄 ' + esc(f.name) + ' <small>' + Math.max(1, Math.round(f.size / 1024)) + ' KB</small><button type="button" data-tira="' + k + '" aria-label="Tirar">×</button></span>').join('');
    j.querySelectorAll('[data-tira]').forEach((b) => b.onclick = () => { arquivos.splice(+b.dataset.tira, 1); pintarChips(); }); };
  const marcados = () => [...j.querySelectorAll('.ge-it')].filter((l) => l.querySelector('input[type=checkbox]').checked).map((l) => {
    const x = atual().itens.find((y) => y.id === l.dataset.ge), v = lerValor(l.querySelector('.ge-valor').value);
    const dv = l.querySelector(".ge-novo-venc");   // Backup 34: parcela vencida → reemissão com novo vencimento e valor atualizado
    const px = l.querySelector('.ge-pix');   // Backup 52: código PIX desta parcela
    return Object.assign({}, x, { _valor: isNaN(v) ? 0 : v, _venc: dv ? dv.value : null }, px ? { _pixCodigo: px.value.trim() } : {});
  });
  const total = () => { const m = marcados(); $j('#ge-tot').innerHTML = m.length ? plural(m.length, 'parcela', 'parcelas') + ' · total <b>' + brl(m.reduce((s2, x) => s2 + x._valor, 0)) + '</b>' : 'Nenhuma parcela marcada'; };
  $j('#ge-emps').onclick = (ev) => { const b = ev.target.closest('[data-ge-emp]'); if (!b) return; atualK = b.dataset.geEmp; pintarEmps(); pintarMsg(); };
  pintarEmps(); pintarMsg();
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  // Backup 52 (C6): o código PIX digitado fica gravado na parcela (acordos.pix_codigo)
  const gravarPix = async (its) => { if (tabela !== 'acordos') return;
    // Backup 53: grava as parcelas alteradas ao mesmo tempo (antes, uma depois da outra)
    await Promise.all(its.filter((i) => i._pixCodigo != null && i._pixCodigo !== (i.pix_codigo || '')).map(async (i) => {
      await q(sb.from('acordos').update({ pix_codigo: i._pixCodigo }).eq('id', i.id));
      const o = atual().itens.find((y) => y.id === i.id); if (o) o.pix_codigo = i._pixCodigo; })); };
  if ($j('#ge-zap')) $j('#ge-zap').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const its = marcados(); if (!its.length) throw new Error('Marque ao menos uma parcela.');
    await gravarPix(its);
    const t = textoGuias(tabela, atual().nome, its), txt = $j('#ge-texto').value.trim() + t.zap.slice(t.intro.length);
    if (arquivos.length && navigator.canShare && navigator.canShare({ files: arquivos })) { await navigator.share({ text: txt, files: arquivos }); return; }
    const tel = soDigitos($j('#ge-tel').value);
    window.open('https://wa.me/' + (tel ? (tel.length <= 11 ? '55' : '') + tel : '') + '?text=' + encodeURIComponent(txt), '_blank', 'noopener');
    if (arquivos.length) aviso('No computador o WhatsApp não recebe anexo por link: arraste os PDFs para a conversa que abriu.');
  });
  $j('#ge-copiar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const its = marcados(); if (!its.length) throw new Error('Marque ao menos uma parcela.');
    await gravarPix(its);
    const t = textoGuias(tabela, atual().nome, its), txt = $j('#ge-texto').value.trim() + t.zap.slice(t.intro.length);
    await copiarTexto(txt); aviso('✓ Texto copiado — é só colar no WhatsApp.');
  });
  if ($j('#ge-previa')) $j('#ge-previa').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const its = marcados(), e = atual(); if (!its.length) throw new Error('Marque ao menos uma parcela.');
    const html = await q(sb.rpc('previa_guias_email', { p_cliente: e.cli || null,
      p_itens: its.map((i) => Object.assign({ tabela, id: i.id, descricao: descricaoGuia(tabela, i), vencimento: i._venc || i.vencimento, valor: i._valor }, pixItem(i))),
      p_assunto: $j('#ge-assunto').value.trim(), p_texto: $j('#ge-texto').value.trim() + '\n\n' + fechoGuias(tabela, its) }));
    const pj = abrirJanela({ titulo: '👁 ' + ($j('#ge-assunto').value.trim() || 'Prévia do e-mail'), larga: true, corpo: '<iframe class="ge-previa" title="Prévia do e-mail" sandbox></iframe>' });
    pj.querySelector('.ge-previa').srcdoc = html;
  });
  const mandar = (rascunho) => async () => {
    const its = marcados(), e = atual(); if (!its.length) throw new Error('Marque ao menos uma parcela.');
    if (!$j('#ge-para').value.trim()) throw new Error('Digite o e-mail do cliente no campo "Para".');
    if (its.some((i) => !(i._valor > 0))) throw new Error('Confira o valor de todas as parcelas marcadas.');
    if (its.some((i) => i._venc !== null && i._venc !== undefined && (!i._venc || i._venc < hojeISO()))) throw new Error('Confira o novo vencimento da guia atualizada (hoje ou depois).');
    if (arquivos.reduce((s2, f) => s2 + f.size, 0) > LIMITE_ANEXOS) throw new Error('Os PDFs somam mais de 15 MB: envie em dois e-mails.');
    const [, arqs] = await Promise.all([gravarPix(its), Promise.all(arquivos.map(lerArquivoB64))]);   // Backup 53: em paralelo
    const r = await q(sb.rpc(rascunho ? 'salvar_guias_rascunho' : 'enviar_guias_email', { p_cliente: e.cli || null, p_grupo: e.grupo || null,
      p_itens: its.map((i) => Object.assign(i._venc
        ? { tabela, id: i.id, descricao: descricaoGuia(tabela, i).replace(/^⚠ VENCIDA — /, '↻ Guia atualizada — ') + ' (vencia em ' + dataBR(i.vencimento) + ')', vencimento: i._venc, valor: i._valor, reenvio: true }
        : { tabela, id: i.id, descricao: descricaoGuia(tabela, i), vencimento: i.vencimento, valor: i._valor }, pixItem(i))),
      p_assunto: $j('#ge-assunto').value.trim(), p_texto: $j('#ge-texto').value.trim() + '\n\n' + fechoGuias(tabela, its), p_docs: its.map((i) => i.guia_doc).filter(Boolean),
      p_para: $j('#ge-para').value.trim() || null, p_arquivos: arqs }));
    // Backup 53 (lentidão do e-mail do acordo): a janela fecha assim que o e-mail fica pronto no banco; o Gmail e a tela atualizam por trás
    fecharJanela(j); aviso(rascunho ? '📝 Guardando o rascunho no seu Gmail…' : '✉ Enviando o e-mail…');
    Promise.all([avisoEnvio(plural(r.itens, 'parcela', 'parcelas') + (r.anexos ? ' e ' + plural(r.anexos, 'anexo', 'anexos') : '') + ': ', r).catch((er) => aviso('⚠ ' + erroAmigavel(er), true)),
      depois ? Promise.resolve(depois()).catch(() => {}) : null])
      .then(() => { if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); });
  };
  if ($j('#ge-enviar')) $j('#ge-enviar').onclick = (ev) => comBotao(ev.currentTarget, mandar(false));
  $j('#ge-rascunho').onclick = (ev) => comBotao(ev.currentTarget, mandar(true));
  return j;
}
// Backup 35: Acordos → aba "A pagar": marcar as parcelas e "✉ Enviar por empresa" (mesma janela/e-mail das guias)
async function enviarAcordosSelecionados(ids, depois) {
  if (!ids || !ids.length) return aviso('Marque ao menos uma parcela.', true);
  if (!E.clientes.length) await carregarCadastros();
  const L = (await q(sb.from('acordos').select('id, parcela, total_parcelas, vencimento, valor, pago, emissao, emitida_em, emitida_por, guia_doc, devedor, credor, processo, grupo_id, pix, pix_codigo, banco, forma_pagamento').in('id', ids)))
    .filter((x) => !x.pago)
    .map((x) => Object.assign(x, { quem: x.devedor, detalhe: 'deve a ' + (x.credor || '—') + (x.processo ? ' · ' + x.processo : ''), email_em: null,
      parcela: (x.parcela || '?') + (x.total_parcelas ? '/' + x.total_parcelas : ''), valor: Number(x.valor) || 0,
      cliente_id: (E.clientes.find((c) => c.grupo_id === x.grupo_id && primeiroNome(c.nome) === primeiroNome(x.devedor)) || {}).id || null }));
  return janelaGuiasEmpresa('acordos', L, null, depois);
}

// ═══ Backup 53: alterar o ACORDO INTEIRO (todas as parcelas, ou só as em aberto) — devedor, credor, processo, forma de pagamento, PIX, banco,
// valor da parcela e dia do vencimento. Para mudar UMA parcela só, clique na parcela.
async function editarAcordo(ids, depois) {
  const L = await q(sb.from('acordos').select('id, parcela, total_parcelas, vencimento, valor, pago, devedor, credor, processo, forma_pagamento, pix, banco').in('id', ids || []));
  if (!L.length) return aviso('Acordo não encontrado.', true);
  const a = L.find((x) => !x.pago) || L[0], abertas = L.filter((x) => !x.pago);
  const j = abrirJanela({ titulo: '✎ Alterar o acordo inteiro', larga: true,
    corpo: '<form class="grade" id="f-acordo-todo">' +
      '<div class="inteiro dica">Muda de uma vez <b>' + plural(L.length, 'parcela', 'parcelas') + '</b> deste acordo (' + plural(abertas.length, 'em aberto', 'em aberto') + '). ' +
        'Campo em branco = não muda. Para mudar uma parcela só, feche e clique na parcela.</div>' +
      campo('Devedor', '<input name="devedor" value="' + esc(a.devedor || '') + '">') + campo('Credor', '<input name="credor" value="' + esc(a.credor || '') + '">') +
      campo('Processo', '<input name="processo" value="' + esc(a.processo || '') + '">') +
      campo('Forma de pagamento', '<select name="forma_pagamento"><option value="">— não muda —</option><option value="boleto"' + (a.forma_pagamento === 'boleto' ? ' selected' : '') + '>Boleto</option><option value="pix"' + (a.forma_pagamento === 'pix' ? ' selected' : '') + '>PIX</option></select>') +
      campo('Chave PIX', '<input name="pix" value="' + esc(a.pix || '') + '">') + campo('Banco', '<input name="banco" value="' + esc(a.banco || '') + '">') +
      campo('Novo valor da parcela (só as em aberto)', '<input name="valor" data-mascara="brl" inputmode="decimal" placeholder="em branco = não muda">') +
      campo('Novo dia do vencimento (só as em aberto)', '<input name="dia" type="number" min="1" max="31" placeholder="ex.: 10">') +
      campo('Aplicar em', '<select name="alcance"><option value="abertas">Só nas parcelas em aberto (' + abertas.length + ')</option><option value="todas">Em todas as parcelas (' + L.length + ')</option></select>', 'inteiro') + '</form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="ac-todo-ok">Salvar no acordo inteiro</button></div>' });
  const f = j.querySelector('#f-acordo-todo');
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#ac-todo-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const alvo = f.alcance.value === 'todas' ? L : abertas;
    if (!alvo.length) throw new Error('Este acordo não tem parcela em aberto. Escolha "Em todas as parcelas".');
    const d = {}; ['devedor', 'credor', 'processo', 'pix', 'banco'].forEach((k) => { const v = f[k].value.trim(); if (v !== String(a[k] || '')) d[k] = v || null; });
    if (f.forma_pagamento.value) d.forma_pagamento = f.forma_pagamento.value;
    if (Object.keys(d).length) await q(sb.from('acordos').update(d).in('id', alvo.map((x) => x.id)));
    const v = lerValor(f.valor.value), dia = Math.min(31, Math.max(0, Number(f.dia.value) || 0));
    if (v > 0) await q(sb.from('acordos').update({ valor: v }).in('id', abertas.map((x) => x.id)));
    if (dia) await Promise.all(abertas.filter((x) => x.vencimento).map((x) => { const [y, m] = x.vencimento.split('-').map(Number), ult = new Date(y, m, 0).getDate();
      return q(sb.from('acordos').update({ vencimento: y + '-' + String(m).padStart(2, '0') + '-' + String(Math.min(dia, ult)).padStart(2, '0') }).eq('id', x.id)); }));
    if (!Object.keys(d).length && !(v > 0) && !dia) throw new Error('Nada mudou.');
    aviso('✓ Acordo alterado (' + plural(alvo.length, 'parcela', 'parcelas') + ').'); fecharJanela(j);
    if (depois) await depois(); else if (window.ERP_RECARREGAR) window.ERP_RECARREGAR();
  });
  return j;
}

// ═══ Backup 37: "🧾 Gerar guias\" — abre o envio por empresa (a tela que expande com vencimento e valor atualizado) já com as parcelas a emitir:
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
    base = (await buscarTodos(() => { let c = sb.from('acordos').select('id, parcela, total_parcelas, vencimento, valor, pago, emissao, emitida_em, emitida_por, guia_doc, devedor, credor, processo, grupo_id, pix, pix_codigo, banco, forma_pagamento').eq('pago', false);
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

// ═══ Backup 54: "+ Lançar → Acordo inteiro" — cadastra TODAS as parcelas de um acordo de uma vez (antes: uma parcela por vez) ═══
function formAcordoNovo(depois) {
  const grupos = (E.grupos || []).slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  const j = abrirJanela({ titulo: '+ Novo acordo (todas as parcelas)', larga: true,
    corpo: '<form class="grade" id="f-acordo-novo">' +
      campo('Grupo', '<select name="grupo_id"><option value="">— escolha —</option>' + grupos.map((g) => '<option value="' + g.id + '">' + esc(g.nome) + '</option>').join('') + '</select>') +
      campo('Responsável', selectPessoa('responsavel', (E.perfil && E.perfil.nome) || '', '— escolha —')) +
      campo('Devedor (nosso cliente) <span class="obrig">*</span>', '<input name="devedor" maxlength="200">') +
      campo('Credor <span class="obrig">*</span>', '<input name="credor" maxlength="200">') +
      campo('Processo / identificação <span class="obrig">*</span>', '<input name="processo" maxlength="80" placeholder="nº do processo ou do acordo">') +
      campo('Forma de pagamento', '<select name="forma_pagamento"><option value="boleto">Boleto</option><option value="pix">PIX</option></select>') +
      campo('Nº de parcelas <span class="obrig">*</span>', '<input name="n" type="number" min="1" max="240" value="1">') +
      campo('Valor de cada parcela (R$) <span class="obrig">*</span>', '<input name="valor" data-mascara="brl" inputmode="decimal" placeholder="0,00">') +
      campo('1º vencimento <span class="obrig">*</span>', '<input name="venc" type="date" value="' + somarDias(hojeISO(), 30) + '">') +
      campo('Chave PIX', '<input name="pix" maxlength="200">') +
      '<div class="dica inteiro" id="acn-previa">Preencha para ver as parcelas.</div></form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="acn-ok">Lançar o acordo</button></div>' });
  const f = j.querySelector('#f-acordo-novo');
  const venc = (k) => { const [y, m, d] = f.venc.value.split('-').map(Number), x = new Date(y, m - 1 + k, 1), ult = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(Math.min(d, ult)).padStart(2, '0'); };
  const previa = () => { const n = Math.max(1, Math.min(240, Number(f.n.value) || 1)), v = lerValor(f.valor.value);
    j.querySelector('#acn-previa').innerHTML = v > 0 && f.venc.value ? plural(n, 'parcela', 'parcelas') + ' de <b class="mono">' + brl(v) + '</b> (total ' + brl(v * n) + '), de ' + dataBR(venc(0)) + ' a ' + dataBR(venc(n - 1)) + ', todo mês.' : 'Preencha para ver as parcelas.'; };
  ['input', 'change'].forEach((x) => f.addEventListener(x, previa));
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#acn-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const n = Number(f.n.value) || 0, v = lerValor(f.valor.value);
    if (!f.devedor.value.trim() || !f.credor.value.trim() || !f.processo.value.trim()) throw new Error('Preencha devedor, credor e processo.');
    if (!(n >= 1 && n <= 240)) throw new Error('Nº de parcelas entre 1 e 240.');
    if (!(v > 0)) throw new Error('Informe o valor da parcela (ex.: 1.500,00).');
    if (!f.venc.value) throw new Error('Informe o 1º vencimento.');
    const base = { grupo_id: f.grupo_id.value || null, responsavel: f.responsavel.value || '', devedor: f.devedor.value.trim(), credor: f.credor.value.trim(), processo: f.processo.value.trim(),
      forma_pagamento: f.forma_pagamento.value, pix: f.pix.value.trim(), total_parcelas: String(n), valor: v };
    await q(sb.from('acordos').insert(Array.from({ length: n }, (_, k) => Object.assign({}, base, { parcela: String(k + 1), vencimento: venc(k) }))));
    aviso('✓ Acordo lançado: ' + plural(n, 'parcela', 'parcelas') + '.'); fecharJanela(j);
    if (depois) await depois(); else if (window.ERP_RECARREGAR) window.ERP_RECARREGAR();
  });
  return j;
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
const ABAS_ROTINA = [['passivo', 'Passivo'], ['processos', 'Processos'], ['guias', 'Guias do mês'], ['planilha', 'Planilha'], ['tarefas', 'Minhas tarefas']];   // Backup 49: nomes curtos, na ordem do mês; a aba Acordos saiu (o menu já tem Acordos)
const TIPOS_MOV = [['sem_novidade', '✓ Sem novidade'], ['movimentacao', 'Movimentação'], ['decisao', 'Decisão relevante'], ['valor', 'Mudança de valor'], ['procuracao', 'Procuração juntada']];
const PARES_PASSIVO = [['rfb', 'RFB'], ['pgfn', 'PGFN'], ['age_mg', 'AGE/MG']];
const COLS_PASSIVO = [['rfb', 'RFB'], ['rfb_negociada', 'RFB negociada'], ['pgfn', 'PGFN'], ['pgfn_negociada', 'PGFN negociada'], ['age_mg', 'AGE/MG'], ['age_mg_negociada', 'AGE/MG negociada']];
const CAPAG_OPCOES = ['', 'A', 'B', 'C', 'D', 'Omisso'];

TELAS.rotina = async function () {
  E.rt = Object.assign({ aba: 'passivo', busca: '', grupo: '', filtro: '' }, E.rt || {});
  if (E.rt.aba === 'parcs' || E.rt.aba === 'acs' || E.rt.aba === 'financeiro') E.rt.aba = 'planilha';   // Backup 42: o Controle saiu
  _rtDados = null;   // Backup 51: entrar na Rotina busca de novo; trocar de aba usa o que já veio
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Rotina</h1><p>Tudo o que era atualizado nas planilhas, num lugar só — o que você grava aqui aparece no Painel, nos Processos e no Financeiro</p></div></div>' +
    '<div class="rt-placar" id="rt-placar" aria-label="Placar do mês">' + placarRotina(null) + '</div>' +
    '<div class="segmento rt-abas" id="rt-abas" style="margin-bottom:14px">' + ABAS_ROTINA.map(([k, r]) => '<button type="button" data-rt-aba="' + k + '">' + r + '</button>').join('') + '</div>' +
    '<div id="rt-corpo"></div>';
  // Backup 42: "Acordos" abre a própria tela de Acordos (idêntica, sem repetir código)
  $('rt-abas').onclick = (ev) => { const b = ev.target.closest('[data-rt-aba]'); if (!b) return;
    if (b.dataset.rtAba === 'acs') { if (typeof window.nav === 'function') window.nav(null, 'acordos'); return; }
    E.rt.aba = b.dataset.rtAba; pintarRotina(); };
  $('rt-placar').onclick = (ev) => { const b = ev.target.closest('[data-placar]'); if (!b) return; const [aba, filtro] = b.dataset.placar.split(':');
    if (aba === 'processos' && filtro) E.rt.fp = Object.assign({}, E.rt.fp, { conf: ['ate30', 'mais30', 'nunca'] });
    E.rt.aba = aba; pintarRotina(); };
  atualizarPlacar();
  if (!E.clientes.length && E.rt.aba !== 'guias' && E.rt.aba !== 'planilha') await carregarCadastros();
  await pintarRotina();
};
// ── Backup 51 (R1): placar do mês — guias enviadas, pagamentos conferidos, passivo conferido e processos conferidos (15 dias); cada número leva ao que falta ──
function placarRotina(r) {
  const it = (alvo, rot, feitos, total, dica) => { const ok = total > 0 && feitos >= total;
    return '<button type="button" class="rt-pl-it' + (r ? (ok ? ' rt-pl-ok' : '') : ' rt-pl-esq') + '" data-placar="' + alvo + '" title="' + esc(dica) + '">' +
      '<span class="rt-pl-n">' + (!r ? '<span class="esq esq-n"></span>' : total ? '<b>' + feitos + '</b> de ' + total : '<b>—</b> nada no mês') + '</span><span class="rt-pl-rot">' + (ok ? '✓ ' : '') + esc(rot) + '</span>' +
      '<span class="rt-pl-bar"><span style="width:' + (r && total ? Math.round(100 * Math.min(feitos, total) / total) : 0) + '%"></span></span></button>'; };
  r = r || {};
  return it('guias', 'guias enviadas', r.guias_feitas, r.guias_total, 'Guias do mês (em atraso + vencem neste mês) que já foram enviadas — clique para ver as que faltam') +
    it('planilha', 'pagamentos conferidos', r.pag_feitos, r.pag_total, 'Parcelas que já venceram neste mês e estão marcadas como pagas — clique para conferir na Planilha') +
    it('passivo', 'passivo conferido no mês', r.passivo_feitos, r.passivo_total, 'Empresas com o passivo conferido neste mês — clique para conferir') +
    it('processos:velhos', 'processos conferidos (15 dias)', r.proc_feitos, r.proc_total, 'Processos conferidos nos últimos 15 dias — clique para ver os que faltam');
}
let _placarT = 0;
function atualizarPlacar() {
  clearTimeout(_placarT);
  _placarT = setTimeout(async () => { const el = $('rt-placar'); if (!el) return;
    const r = await q(sb.rpc('rotina_placar')).catch(() => null); if (r && $('rt-placar')) $('rt-placar').innerHTML = placarRotina(r); }, 150);
}
// ── Backup 51 (V1/V2): "Guias do mês" e "Planilha" usam UMA consulta enxuta (rotina_parcelas_json) e a guardam enquanto a Rotina está aberta.
// Gravou? Só a parcela mudada é atualizada aqui. "↻ Atualizar" busca tudo de novo.
let _rtDados = null;
function dadosRotina(forcar) {
  if (forcar || !_rtDados) {
    _rtDados = q(sb.rpc('rotina_parcelas_json')).then((r) => {
      // cada parcela vem como lista curta [id, número, vencimento, pago, data_pagamento, emitida_em, emissao, valor] dentro do parcelamento
      const PA = (r && r.parcelamentos) || [], P2 = [], antes = {}, porPa = {}, porId = {};
      PA.forEach((p) => { porId[p.id] = p;
        porPa[p.id] = (p.ps || []).map((a) => ({ id: a[0], parcelamento_id: p.id, numero: a[1], vencimento: a[2], pago: a[3], data_pagamento: a[4], emitida_em: a[5], emissao: a[6], valor: a[7] }));
        P2.push(...porPa[p.id]); if (p.fora) antes[p.id] = p.fora; delete p.ps; delete p.fora; });
      P2.sort((x, y) => String(x.vencimento || '9').localeCompare(String(y.vencimento || '9')));
      return { PA, P2, antes, porPa, porId };
    });
    _rtDados.catch(() => { _rtDados = null; });
  }
  return _rtDados;
}
// o cliente de um parcelamento (pelo CPF/CNPJ ou pelo nome) — com índice, em vez de procurar na lista inteira a cada parcela
let _cliIdx = null;
function clienteDoParcelamento(p) {
  if (!_cliIdx || _cliIdx.lista !== E.clientes) { const doc = {}, nome = {};
    E.clientes.forEach((c) => { const d = soDigitos(c.cpf_cnpj); if (d && !doc[d]) doc[d] = c.id; if (!nome[c.nome]) nome[c.nome] = c.id; });
    _cliIdx = { lista: E.clientes, doc, nome }; }
  const d = soDigitos(p.cnpj);
  return (d && _cliIdx.doc[d]) || _cliIdx.nome[p.empresa] || null;
}
// V3: a tela aparece na hora, com um esqueleto cinza no lugar dos números até os dados chegarem
function esqueletoRotina(aba) {
  const barra = (w) => '<span class="esq" style="width:' + w + '%"></span>';
  if (aba === 'planilha') return '<div class="card pl-card rt-esq" aria-busy="true"><div class="card-hd">📋 Planilha de parcelamentos<span class="sub">carregando…</span></div><div class="card-bd">' +
    '<div class="pl-abas">' + [70, 90, 60, 80, 75].map((w) => '<span class="pl-aba esq-aba">' + barra(w) + '</span>').join('') + '</div>' +
    '<div class="pl-linhas">' + [0, 1].map(() => '<div class="pl-linha">' + [0, 1, 2].map(() => '<section class="pl-bloco"><div class="pl-cab">' + barra(70) + barra(45) + barra(90) + '</div>' +
      '<table class="pl-tab"><tbody>' + [0, 1, 2, 3, 4].map(() => '<tr><td>' + barra(60) + '</td><td>' + barra(80) + '</td><td>' + barra(70) + '</td><td>' + barra(70) + '</td></tr>').join('') + '</tbody></table></section>').join('') + '</div>').join('') + '</div></div></div>';
  return '<div class="card ep-tela rt-esq" aria-busy="true"><div class="card-bd"><div class="rt-filtros">' + barra(30) + barra(20) + '</div>' +
    [0, 1, 2, 3, 4, 5].map(() => '<div class="ep-emp"><div class="ep-emp-hd">' + barra(40) + '</div><div class="ep-emp-body"><div class="ep-row">' + barra(55) + '</div><div class="ep-row">' + barra(45) + '</div></div></div>').join('') + '</div></div>';
}
async function pintarRotina() {
  document.querySelectorAll('#rt-abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.rtAba === E.rt.aba));
  const el = $('rt-corpo'); if (!el) return;
  el.innerHTML = E.rt.aba === 'guias' || E.rt.aba === 'planilha' ? esqueletoRotina(E.rt.aba) : '<div class="sub" style="padding:10px">Carregando…</div>';
  try { await ({ passivo: rotinaPassivo, processos: rotinaProcessos, planilha: rotinaPlanilha, guias: rotinaEnviarGuias, tarefas: rotinaTarefas })[E.rt.aba](el); }
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
    '<div class="tabela-wrap rt-grade rt-pas rt-sem-altura" data-sem-pagina><table><colgroup><col class="rt-w-emp"><col class="rt-w-org"><col class="rt-w-org"><col class="rt-w-org"><col class="rt-w-ceat"><col class="rt-w-sn"><col class="rt-w-sn"><col class="rt-w-capag"><col class="rt-w-conf"></colgroup><thead><tr><th>Empresa</th>' + PARES_PASSIVO.map(([k, r]) => '<th class="rt-num">' + r + '<small>em aberto · negociada</small></th>').join('') +
      '<th class="rt-num">CEAT</th><th title="Procuração">Procur.</th><th title="Certificado digital">Certif.</th><th>CAPAG</th><th class="rt-c-conf">Conferência</th></tr></thead><tbody id="rt-pas-corpo"></tbody></table></div>' + '</div></div>';
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
      // Backup 42: faixa do grupo simples (sem o contorno azul) e sem o relógio ao lado da empresa
      // Backup 51 (R4): "✓ Conferir o grupo todo (sem alteração)" — para o mês em que nada mudou
      const cab = g !== grp ? (grp = g, '<tr class="rt-grp"><td colspan="' + (PARES_PASSIVO.length + 6) + '">' + esc(g) +
        '<button type="button" class="btn btn-o btn-mini rt-conf-grp" data-conf-grp="' + esc(c.grupo_id || '') + '" title="Marca todas as empresas deste grupo (as que estão na tela) como conferidas, sem alteração">✓ Conferir o grupo todo (sem alteração)</button></td></tr>') : '';
      return cab + '<tr data-id="' + c.id + '"' + (alterados.has(c.id) ? ' class="rt-alterado"' : '') + '><td class="rt-emp"><b>' + esc(c.nome) + '</b><div class="sub">' + esc(mascaraDoc(c.cpf_cnpj) || '') + (podeCert ? ' <button type="button" class="rt-hist-bt" data-senha="' + c.id + '" title="Senha GOV (só quem pode editar clientes vê)">🔑</button>' : '') + '</div></td>' +
        PARES_PASSIVO.map(([k, r]) => '<td class="rt-par">' + [k, k + '_negociada'].map((kk, i) => '<input class="rt-in rt-valor' + (i ? ' rt-neg' : '') + '" data-mascara="brl" data-c="' + kk + '" inputmode="decimal" aria-label="' + r + (i ? ' negociada' : ' em aberto') + '" placeholder="' + (i ? 'negociada' : 'em aberto') + '" value="' + (c[kk] != null && c[kk] !== '' ? 'R$ ' + valorParaCampo(c[kk]) : '') + '">').join('') + '</td>').join('') +
        '<td><input class="rt-in rt-int" data-c="ceat_trt3" inputmode="numeric" value="' + (c.ceat_trt3 == null ? '' : esc(c.ceat_trt3)) + '"></td>' +
        '<td>' + simNaoSel('procuracao', c.procuracao) + '</td>' +
        '<td>' + simNaoSel('certificado', c.certificado) + '</td>' +
        '<td class="rt-c-capag"><select class="rt-in rt-sn rt-capag" data-c="capag">' + CAPAG_OPCOES.map((v) => '<option value="' + v + '"' + ((c.capag || '') === v ? ' selected' : '') + '>' + (v || '—') + '</option>').join('') + '</select></td>' +
        '<td class="rt-c-conf">' + celulaConferencia(SIT[c.id], c.id) + '</td></tr>';
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
    const ks = ev.target.closest('[data-senha]'); if (ks) return janelaSenhaGov(ks.dataset.senha, C);
    const cg = ev.target.closest('[data-conf-grp]');
    if (cg) return comBotao(cg, async () => {
      const ids = []; let tr = cg.closest('tr').nextElementSibling;
      for (; tr && !tr.classList.contains('rt-grp'); tr = tr.nextElementSibling) if (tr.dataset.id) ids.push(tr.dataset.id);
      const pend = ids.filter((id) => alterados.has(id));
      if (pend.length) throw new Error('Há ' + plural(pend.length, 'empresa alterada', 'empresas alteradas') + ' neste grupo: salve (ou confira linha por linha) antes de conferir o grupo todo.');
      if (!ids.length) return;
      // Backup 55: conferir pede confirmação
      if (!confirm('Confirmar a conferência de ' + plural(ids.length, 'empresa', 'empresas') + ' deste grupo (sem alteração)?')) return;
      await q(sb.rpc('conferir_rotina', { p_area: 'passivo', p_ids: ids, p_alterou: false }));
      const agora = new Date().toISOString(), quem = E.perfil ? E.perfil.nome : '';
      ids.forEach((id) => { SIT[id] = Object.assign({}, SIT[id], { conferido_em: agora, conferido_por: quem, conferido_alterou: false });
        const cel = $('rt-pas-corpo').querySelector('tr[data-id="' + id + '"] .rt-c-conf'); if (cel) cel.innerHTML = celulaConferencia(SIT[id], id); });
      aviso('✓ ' + plural(ids.length, 'empresa conferida', 'empresas conferidas') + ' (sem alteração).'); atualizarPlacar(); });
    // Backup 42: o ✓ da linha salva AQUELA linha — com alteração grava e marca "alterado"; sem alteração marca "conferido"
    const cf = ev.target.closest('[data-conferir]'); if (cf) return comBotao(cf, async () => {
      const id = cf.dataset.conferir, a = alterados.get(id), mudou = !!a;
      const emp = ((cf.closest('tr').querySelector('td') || {}).textContent || 'esta empresa').trim().split('\n')[0].replace(/\s+\d[\d./-]+.*$/, '');
      if (!confirm(mudou ? 'Salvar a alteração de ' + emp + ' e marcar como conferida?' : 'Confirmar que ' + emp + ' foi conferida (sem alteração)?')) return;
      if (a) await gravar([id, a]);
      await q(sb.rpc('conferir_rotina', { p_area: 'passivo', p_ids: [id], p_alterou: mudou }));
      SIT[id] = Object.assign({}, SIT[id], { conferido_em: new Date().toISOString(), conferido_por: E.perfil ? E.perfil.nome : '', conferido_alterou: mudou }, mudou ? { alterado_em: new Date().toISOString() } : {});
      if (mudou) { alterados.delete(id); cf.closest('tr').classList.remove('rt-alterado'); contar(); }
      cf.closest('td').innerHTML = celulaConferencia(SIT[id], id);
      aviso(mudou ? '✓ Linha salva.' : '✓ Conferido.'); });
    const b = ev.target.closest('[data-ver-senha]'); if (!b) return; const i = b.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; };
  $('rt-hist').onclick = () => janelaHistoricoPassivo(null);
  // Backup 45: preencher como numa planilha — Enter (ou ↓) desce para a mesma coluna da empresa de baixo, ↑ sobe; ao entrar no campo o valor fica selecionado
  $('rt-pas-corpo').addEventListener('keydown', (ev) => {
    const i = ev.target.closest('input.rt-in'); if (!i || !['Enter', 'ArrowDown', 'ArrowUp'].includes(ev.key)) return;
    const linhas = [...$('rt-pas-corpo').querySelectorAll('tr[data-id]')], tr = i.closest('tr'), k = linhas.indexOf(tr), td = i.closest('td');
    const col = [...tr.children].indexOf(td), neg = i.classList.contains('rt-neg');
    const alvo = linhas[k + (ev.key === 'ArrowUp' ? -1 : 1)]; if (!alvo) return;
    ev.preventDefault();
    const cel = alvo.children[col], prox = cel && (cel.querySelector(neg ? 'input.rt-neg' : 'input.rt-in:not(.rt-neg)') || cel.querySelector('.rt-in'));
    if (prox) { prox.focus(); if (prox.select) prox.select(); }
  });
  $('rt-pas-corpo').addEventListener('focusin', (ev) => { const i = ev.target.closest('input.rt-in'); if (i && i.select) setTimeout(() => { try { i.select(); } catch (e) { /* campo saiu */ } }, 0); });
  let n = 0;
  const gravar = async ([id, a]) => {
      const up = {};
      Object.entries(a.cli).forEach(([k, v]) => {
        if (k === 'em_operacao' || k === 'procuracao' || k === 'certificado') up[k] = v === '' ? null : v === 'true';
        else if (k === 'capag') up[k] = v;
        else if (k === 'ceat_trt3') up[k] = v.trim() === '' ? null : parseInt(soDigitos(v), 10) || 0;
        else { const n2 = lerValor(v); if (isNaN(n2)) throw new Error('Valor inválido: ' + v); up[k] = v.trim() === '' ? null : n2; }
      });
      if (Object.keys(up).length) await q(sb.from('clientes').update(up).eq('id', id).select('id'));
      const cl = E.clientes.find((x) => x.id === id); if (cl) Object.assign(cl, up);
      if (Object.keys(a.cert).length) {
        const atual = Object.assign({}, C[id] || {}), row = { cliente_id: id, validade: atual.validade || null, senha: atual.senha || '' };
        if ('senha' in a.cert) row.senha = a.cert.senha;
        await q(sb.from('cliente_certificado').upsert(row).select('cliente_id'));
      }
      n++;
    };
  $('rt-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    n = 0;
    // Backup 41: grava de 6 em 6 (antes, uma empresa por vez)
    const fila = [...alterados];
    for (let i = 0; i < fila.length; i += 6) await Promise.all(fila.slice(i, i + 6).map(gravar));
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
const dCurta = (ts) => { const x = dataLocal(ts); return x.slice(0, 6) + x.slice(8); };   // 03/10/26
const diasDesde = (ts) => ts ? Math.floor((Date.now() - new Date(ts).getTime()) / 864e5) : null;
function celulaConferencia(x, id) {
  x = x || {};
  // Backup 33: mais de 15 dias sem conferir = amarelo; mais de 30 (ou nunca) = vermelho. Datas no fuso de quem olha (Brasília)
  const d = diasDesde(x.conferido_em), cls = d == null || d > 30 ? 'rt-cf-nunca' : d > 15 ? 'rt-cf-velho' : 'rt-cf-ok';
  const alt = x.alterado_em ? 'Última alteração: ' + dataHoraBR(x.alterado_em) + (x.alterado_por ? ' por ' + x.alterado_por : '') : 'Sem alteração registrada';
  // Backup 45: uma linha só para o que aconteceu ("✓ conferido" ou "✎ alterado") e, embaixo, quem · há quanto tempo · alteração de outro dia (sem repetir "alterado")
  const altOutra = x.alterado_em && !(x.conferido_alterou && dataLocal(x.alterado_em) === dataLocal(x.conferido_em));
  const sub = [x.conferido_em ? String(x.conferido_por || '').split(' ')[0] : '', d != null && d > 15 ? 'há ' + d + ' d' : '', altOutra ? 'alt. ' + dCurta(x.alterado_em) : ''].filter(Boolean).join(' · ');
  return '<div class="rt-cf ' + cls + '" title="' + esc(alt) + '"><span class="rt-cf-txt">' +
      (x.conferido_em ? (x.conferido_alterou ? '✎ alterado ' : '✓ conferido ') + dCurta(x.conferido_em) : 'nunca conferido') + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>' +
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

// ── 2) Processos: acompanhamento — Backup 45: conferência na última coluna (como no Passivo), filtros em azul (procuração, conferência, tribunal)
// e o tribunal tirado do número CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO). "Sem novidade" deixou de ser botão solto: é uma opção da janela de conferência.
const UF_TR = ['', 'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SE', 'SP', 'TO'];
function tribunalProcesso(p) {
  const c = String(p.competencia || '').trim().toUpperCase(); if (/^(TJ|TRF|TRT|TRE|STJ|STF|TST|TJM|CARF|JF)/.test(c)) return c.split(/[\s—–-]/)[0];
  const m = String(p.numero || '').replace(/\s/g, '').match(/\d{7}-?\d{2}\.?\d{4}\.?(\d)\.?(\d{2})\.?\d{4}/); if (!m) return '';
  const j = m[1], tr = Number(m[2]);
  return j === '8' ? 'TJ' + (UF_TR[tr] || tr) : j === '4' ? 'TRF' + tr : j === '5' ? 'TRT' + tr : j === '6' ? 'TRE-' + (UF_TR[tr] || tr) : j === '9' ? 'TJM-' + (UF_TR[tr] || tr)
    : j === '3' ? 'STJ' : j === '1' ? 'STF' : j === '7' ? 'STM' : '';
}
async function rotinaProcessos(el) {
  // Backup 52 (O2): uma consulta só — os processos e a ÚLTIMA movimentação de cada um (antes baixava todas as movimentações, em páginas de 1000)
  const P = (await q(sb.rpc('rotina_processos_json'))) || [];
  const ULT = {}; P.forEach((p) => { if (p.ult) ULT[p.id] = p.ult; });
  P.forEach((p) => { p._trib = tribunalProcesso(p); p._dias = p.ultima_movimentacao_em ? Math.floor((new Date(hojeISO() + 'T12:00:00') - new Date(p.ultima_movimentacao_em + 'T12:00:00')) / 864e5) : null; });
  // Backup 46: dá para marcar vários filtros ao mesmo tempo (dentro do mesmo grupo vale "ou"; entre grupos, "e"); tribunal em lista suspensa
  const F = E.rt.fp = Object.assign({ proc: [], conf: [], trib: '' }, E.rt.fp || {});
  if (!Array.isArray(F.proc)) F.proc = F.proc ? [F.proc] : [];
  if (!Array.isArray(F.conf)) F.conf = [];
  const tribs = [...new Set(P.map((p) => p._trib).filter(Boolean))].sort();
  el.innerHTML = '<div class="card"><div class="card-hd">⚖ Acompanhamento dos processos<span class="sub">confira no tribunal e clique em ✓ na linha: marque “sem novidade” ou registre o que mudou</span>' +
      '<button type="button" class="btn btn-p btn-mini" id="rt-novo-proc" style="margin-left:auto">+ Processo</button></div>' +
    '<div class="card-bd">' + filtroRotina('') +
    '<div class="rt-segs" id="rt-proc-segs"></div>' +
    '<div class="tabela-wrap rt-proc" data-sem-pagina><table><colgroup><col class="rt-w-pnum"><col class="rt-w-trib"><col class="rt-w-nat"><col class="rt-w-ult"><col class="rt-w-sn"><col class="rt-w-val"><col class="rt-w-conf"></colgroup>' +
      '<thead><tr><th>Processo</th><th>Tribunal</th><th>Natureza</th><th>Última movimentação</th><th>Procuração</th><th class="rt-num">Valor</th><th class="rt-c-conf">Conferência</th></tr></thead><tbody id="rt-proc-corpo"></tbody></table></div></div></div>';
  const base = () => { const b = normalizar(E.rt.busca);
    return P.filter((p) => (!E.rt.grupo || p.grupo_id === E.rt.grupo) && (!b || normalizar([p.numero, p.autor, p.reu, p.natureza, p._trib, p.grupos ? p.grupos.nome : ''].join(' ')).includes(b))); };
  const faixa = (p) => p._dias == null ? 'nunca' : p._dias <= 7 ? 'ate7' : p._dias <= 15 ? 'ate15' : p._dias <= 30 ? 'ate30' : 'mais30';
  const passa = (p, f) => (!f.proc.length || f.proc.includes(p.procuracao === true ? 'com' : 'sem')) && (!f.conf.length || f.conf.includes(faixa(p))) && (!f.trib || p._trib === f.trib);
  const seg = (chave, ops) => { const B = base();
    return '<div class="segmento rt-seg" data-seg="' + chave + '"><button type="button" data-v=""' + (F[chave].length ? '' : ' class="ativo"') + '>Todos</button>' +
      ops.map(([v, r]) => { const n = B.filter((p) => passa(p, Object.assign({}, F, { [chave]: [v] }))).length;
        return '<button type="button" data-v="' + esc(v) + '"' + (F[chave].includes(v) ? ' class="ativo"' : '') + '>' + esc(r) + ' <span class="seg-n">' + n + '</span></button>'; }).join('') + '</div>'; };
  const pintar = () => {
    $('rt-proc-segs').innerHTML = seg('proc', [['com', 'Com procuração'], ['sem', 'Sem procuração']]) +
      seg('conf', [['ate7', 'Conferidos ≤ 7 dias'], ['ate15', '8–15 dias'], ['ate30', '16–30 dias'], ['mais30', '+30 dias'], ['nunca', 'Nunca']]) +
      (tribs.length ? '<select class="busca rt-trib" id="rt-trib" aria-label="Tribunal"><option value="">Todos os tribunais</option>' +
        tribs.map((t) => '<option value="' + esc(t) + '"' + (F.trib === t ? ' selected' : '') + '>' + esc(t) + ' (' + base().filter((p) => p._trib === t).length + ')</option>').join('') + '</select>' : '');
    const L = base().filter((p) => passa(p, F))
      .sort((x, y) => String(x.grupos ? x.grupos.nome : '￿').localeCompare(String(y.grupos ? y.grupos.nome : '￿'), 'pt-BR') || String(x.ultima_movimentacao_em || '').localeCompare(String(y.ultima_movimentacao_em || '')));
    let grp = null;
    $('rt-proc-corpo').innerHTML = L.length ? L.map((p) => { const g = p.grupos ? p.grupos.nome : 'Sem grupo';
      return (g !== grp ? (grp = g, '<tr class="rt-grp"><td colspan="7">' + esc(g) + ' <span class="sub">' + plural(L.filter((z) => (z.grupos ? z.grupos.nome : 'Sem grupo') === g).length, 'processo', 'processos') + '</span>' +
        '<button type="button" class="btn btn-o btn-mini rt-conf-grp" data-conf-pgrp title="Registra “sem novidade” em todos os processos deste grupo que estão na tela">✓ Conferir o grupo todo (sem alteração)</button></td></tr>') : '') +
      '<tr data-pid="' + p.id + '"><td><b class="mono">' + esc(p.numero) + '</b><div class="sub">' + esc(p.reu || p.autor || '') + '</div></td>' +
      '<td>' + (p._trib ? '<span class="pill neutro">' + esc(p._trib) + '</span>' : '<span class="sub">—</span>') + '</td>' +
      '<td>' + esc(p.natureza || '—') + '</td><td class="rt-mov">' + (p.ultima_movimentacao ? esc(p.ultima_movimentacao) : '<span class="sub">nada registrado</span>') + '</td>' +
      '<td><span class="pill ' + (p.procuracao ? 'pago' : 'vencido') + '">' + (p.procuracao ? 'Sim' : 'Não') + '</span></td>' +
      '<td class="rt-num">' + (p.valor ? brl(p.valor) : '—') + '</td>' +
      '<td class="rt-c-conf">' + celulaConfProc(p, ULT[p.id]) + '</td></tr>'; }).join('')
      : '<tr><td colspan="7">' + vazio('Nenhum processo com esses filtros.') + '</td></tr>';
  };
  $('rt-proc-segs').onclick = (ev) => { const b = ev.target.closest('[data-v]'); if (!b) return; const k = b.closest('[data-seg]').dataset.seg, v = b.dataset.v;
    F[k] = !v ? [] : F[k].includes(v) ? F[k].filter((x) => x !== v) : F[k].concat([v]); pintar(); };
  $('rt-proc-segs').onchange = (ev) => { if (ev.target.id !== 'rt-trib') return; F.trib = ev.target.value; pintar(); };
  $('rt-proc-corpo').onclick = (ev) => {
    const cg = ev.target.closest('[data-conf-pgrp]');
    if (cg) return comBotao(cg, async () => {
      const ids = []; let tr = cg.closest('tr').nextElementSibling;
      for (; tr && !tr.classList.contains('rt-grp'); tr = tr.nextElementSibling) if (tr.dataset.pid) ids.push(tr.dataset.pid);
      if (!ids.length) return;
      await q(sb.rpc('conferir_processos_grupo', { p_ids: ids }));
      aviso('✓ ' + plural(ids.length, 'processo conferido', 'processos conferidos') + ' (sem novidade).'); atualizarPlacar(); await rotinaProcessos(el); });
    const b = ev.target.closest('[data-mov]'); if (b) janelaMovimentacao(b.dataset.mov, () => rotinaProcessos(el), { conferir: true }); };
  $('rt-novo-proc').onclick = () => { if (window.ERP_EDITOR && window.ERP_EDITOR.abrirFormulario) window.ERP_EDITOR.abrirFormulario('processos', null, { carteira: 'Ativo', status: 'Em andamento' }); else aviso('Use + Lançar → Processo.', true); };
  ligarFiltroRotina(el, pintar); pintar();
}
function celulaConfProc(p, m) {
  const d = p._dias != null ? p._dias : p.ultima_movimentacao_em ? Math.floor((new Date(hojeISO() + 'T12:00:00') - new Date(p.ultima_movimentacao_em + 'T12:00:00')) / 864e5) : null;
  const sub = [m ? String(m.quem || '').split(' ')[0] : '', m ? (m.tipo === 'sem_novidade' ? 'sem novidade' : 'com alteração') : '', d != null && d > 15 ? 'há ' + d + ' d' : ''].filter(Boolean).join(' · ');
  return '<div class="rt-cf ' + (d == null || d > 30 ? 'rt-cf-nunca' : d > 15 ? 'rt-cf-velho' : 'rt-cf-ok') + '"><span class="rt-cf-txt">' +
    (d == null ? 'nunca conferido' : (m && m.tipo !== 'sem_novidade' ? '✎ alterado ' : '✓ conferido ') + dataBR(p.ultima_movimentacao_em).replace(/\/(\d\d)(\d\d)$/, '/$2')) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>' +
    '<button type="button" class="btn btn-o btn-mini" data-mov="' + p.id + '" title="Conferi no tribunal: marcar “sem novidade” ou registrar o que mudou">✓</button></div>';
}
// janela "Registrar movimentação" (também no detalhe do processo, em Jurídico → Processos)
async function janelaMovimentacao(processoId, depois, opc) {
  const [p] = await q(sb.from('processos').select('id, numero, valor, obs, grupos(nome)').eq('id', processoId));
  if (!p) return aviso('Processo não encontrado.', true);
  const H = await q(sb.from('processo_movimentacoes').select('*').eq('processo_id', processoId).order('data', { ascending: false }).order('criado_em', { ascending: false }).limit(30)).catch(() => []);
  const rot = Object.fromEntries(TIPOS_MOV);
  const j = abrirJanela({ titulo: (opc && opc.conferir ? 'Conferir processo ' : 'Processo ') + p.numero, larga: true,
    corpo: '<form class="form-grid" id="mov-form">' +
      campo('Data', '<input name="data" value="' + dataBR(hojeISO()) + '" placeholder="dd/mm/aaaa">') +
      // Backup 45: escolha em botões; "Sem novidade" é a primeira opção (a conferência sem alteração)
      '<div class="campo inteiro"><span>O que aconteceu</span><input type="hidden" name="tipo" value="' + (opc && opc.conferir ? 'sem_novidade' : 'movimentacao') + '"><div class="segmento mov-tipos">' +
        TIPOS_MOV.map(([v, r]) => '<button type="button" data-tipo="' + v + '"' + ((opc && opc.conferir ? 'sem_novidade' : 'movimentacao') === v ? ' class="ativo"' : '') + '>' + r + '</button>').join('') + '</div></div>' +
      campo('Descrição <button type="button" class="btn btn-o btn-mini mov-buscar" id="mov-buscar" title="Puxa o resumo da publicação mais recente deste processo (DJEN)">🔎 Buscar movimentação</button>',
        '<textarea name="descricao" rows="3" placeholder="Ex.: Juntada de petição; sentença de procedência; valor atualizado pela contadoria…"></textarea>', 'inteiro') +
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
  // Backup 49: a última publicação do mesmo número (já lida do DJEN) vira a descrição — é só conferir e salvar
  j.querySelector('#mov-buscar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const dig = soDigitos(p.numero);
    const pubs = await q(sb.from('publicacoes').select('data_disponibilizacao, tipo, classe, texto, processo, processo_numero, processo_id').or('processo_id.eq.' + p.id + (dig ? ',processo_numero.eq.' + dig + ',processo.eq.' + p.numero : ''))
      .order('data_disponibilizacao', { ascending: false }).limit(1)).catch(() => []);
    if (!pubs.length) { aviso('Nenhuma publicação deste processo foi encontrada (Jurídico → Publicações).', true); return; }
    const u = pubs[0], resumo = String(u.texto || '').replace(/\s+/g, ' ').trim();
    f.descricao.value = [u.tipo || u.classe, resumo.length > 400 ? resumo.slice(0, 400) + '…' : resumo].filter(Boolean).join(' — ');
    if (u.data_disponibilizacao) f.data.value = dataBR(u.data_disponibilizacao);
    const bm = j.querySelector('.mov-tipos [data-tipo=movimentacao]'); if (bm) bm.click();
    aviso('✓ Publicação de ' + dataBR(u.data_disponibilizacao) + ' trazida para a descrição — confira e salve.'); });
  const mostrarValor = () => { j.querySelector('.mov-valor').hidden = f.tipo.value !== 'valor'; };
  j.querySelector('.mov-tipos').onclick = (ev) => { const b = ev.target.closest('[data-tipo]'); if (!b) return; f.tipo.value = b.dataset.tipo;
    j.querySelectorAll('.mov-tipos button').forEach((x) => x.classList.toggle('ativo', x === b)); mostrarValor(); };
  mostrarValor();
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

// ── 3) Backup 45: ENVIAR GUIAS DO MÊS — o meio oficial de mandar as guias, IDÊNTICO às antigas "Notificações → Parcelamento" do ERP antigo:
// seleção por empresa (marcar a empresa marca todas as guias), "📨 Gerar Notificação", um cartão por empresa com o texto (valor editável no
// próprio texto), ✏️ Editar · 📋 Copiar · ✉ Enviar e-mail · 💬 Enviar WhatsApp · ✉ Marcar enviado. "Enviar e-mail" salva um RASCUNHO no Gmail
// (como o Apps Script fazia), já com o e-mail do cliente — e os PDFs das guias são anexados aqui no cartão (vão junto no rascunho).
const _epSel = new Set();
function textoNotifParcelas(empresa, itens) {   // _epTexto('parc') do ERP antigo, palavra por palavra ([VALOR] vira o campo do valor)
  // Backup 52 (C7): genérico — o nome da empresa fica só no assunto
  let t = 'Prezados,\n\nSeguem as guias dos parcelamentos com vencimento neste mês. Antes de pagar, confirme se a guia já não foi paga, para evitar duplicidade.';
  itens.forEach((g) => { t += '\n\n' + (g.vencida ? '⚠︎ GUIA VENCIDA\n' : '') + 'Parcelamento ' + (g.p.local || g.p.natureza || '') + ' — Natureza: ' + (g.p.natureza || '—') +
    '\nNº do Parcelamento: ' + (g.p.numero || '—') + '\nParcela: ' + (g.numero || '?') + ' de ' + (g.p.total_parcelas || '?') + ' | Vencimento: ' + (g.vencimento ? dataBR(g.vencimento) : '—') +
    '\nNº da Guia: ' + (g.numero || '—') + '\n' + (g._valor ? '[VALOR:' + valorParaCampo(g._valor) + ']' : '[VALOR]'); });
  return t;
}
// o texto com os campos de valor dentro (como no ERP antigo: "Valor: R$ ____")
function epHtml(txt) {
  return txt.split('\n').map((linha) => {
    const l = esc(linha), mv = l.match(/\[VALOR(?::([^\]]*))?\]/);
    if (mv) return l.replace(mv[0], () => '<span class="ep-val-wrap"><strong>Valor:</strong> R$&nbsp;<input class="ep-val" data-mascara="nenhuma" inputmode="decimal" placeholder="0,00" title="Preencha antes de copiar" value="' + (mv[1] || '') + '"></span>');
    return l.replace(/^(⚠.+)$/, '<strong class="ep-alerta">$1</strong>').replace(/^(Prezados,)$/, '<strong>$1</strong>').replace(/(Parcelamento [^—\n]+—)/g, '<strong>$1</strong>')
      .replace(/(Parcela:|Vencimento:|Nº da Guia:|Nº do Parcelamento:)/g, '<strong>$1</strong>');
  }).join('\n');
}
function epTextoAtual(card) {   // o texto como vai para o e-mail/WhatsApp (o valor digitado no lugar do campo)
  const ed = card.querySelector('.ep-card-edit');
  if (!ed.hidden) return ed.value.replace(/\[VALOR(?::([^\]]*))?\]/g, (_, v) => 'R$ ' + (v && v.trim() ? v.trim() : '_____'));
  const c = card.querySelector('.ep-card-body').cloneNode(true);
  c.querySelectorAll('.ep-val-wrap').forEach((w) => { const v = w.querySelector('input').value.trim(); w.replaceWith(document.createTextNode('Valor: R$ ' + (v || '_____'))); });
  return c.textContent;
}
function epParaEdicao(card) {
  const c = card.querySelector('.ep-card-body').cloneNode(true);
  c.querySelectorAll('.ep-val-wrap').forEach((w) => { const v = w.querySelector('input').value.trim(); w.replaceWith(document.createTextNode(v ? '[VALOR:' + v + ']' : '[VALOR]')); });
  return c.textContent;
}
async function rotinaEnviarGuias(el) {
  const h = hojeISO(), fimMes = fimDoMesGuia(h);
  // Backup 51 (V1/V2): uma consulta só, guardada enquanto a Rotina está aberta (antes: todas as parcelas de todos os anos, a cada clique)
  // os cadastros (clientes e grupos) chegam por trás: só o cartão de envio precisa deles (e-mail, telefone)
  const cad = E.clientes.length ? null : carregarCadastros().catch(() => null);
  const D = await dadosRotina();
  if (E.rt.aba !== 'guias' || !el.isConnected) return;
  const { porId, P2, antes } = D;
  const ult = {}, G = [];
  Object.keys(antes).forEach((k) => { if (antes[k].ultimo_valor != null && Number(antes[k].ultimo_valor) > 0) ult[k] = Number(antes[k].ultimo_valor); });
  P2.forEach((x) => { const p = porId[x.parcelamento_id]; if (!p) return;
    if (x.valor != null && Number(x.valor) > 0) ult[p.id] = Number(x.valor);
    if (x.pago || !x.vencimento || (x.vencimento > fimMes && x.id !== E.rt.epAbrir)) return;
    G.push(Object.assign(x, { p, clienteEmite: p.emitimos_guia === false, vencida: x.vencimento < h, enviada: !!x.emitida_em || /sim|emitid/i.test(x.emissao || ''),
      // Backup 53: sem valor lançado na parcela, vale o "Valor da última parcela" da Planilha; sem ele, o último valor lançado
      _valor: x.valor != null && Number(x.valor) > 0 ? Number(x.valor) : Number(p.valor_ultima_parcela) > 0 ? Number(p.valor_ultima_parcela) : ult[p.id] != null ? ult[p.id] : 0 })); });
  const empK = (g) => g.p.empresa || '—';
  // Backup 52 (P2): "↻ Atualizar" no mesmo lugar em todo o ERP — à direita do cabeçalho do quadro
  el.innerHTML = '<div class="card ep-tela"><div class="card-hd">📨 Guias do mês<span class="sub">vencidas e do mês · marque e gere a notificação de cada empresa</span>' + botaoAtualizar('ep-atu') + '</div><div class="card-bd">' +
    filtroRotina('') +
    // Backup 46: o normal é só quem o escritório emite; a exceção (cliente muito atrasado etc.) mostra também quem emite as próprias guias
    '<div class="ep-topo"><div id="ep-cnt" class="ep-cnt">Nenhum item selecionado.</div>' +
      '<label class="check ep-excecao" title="Mostra também os parcelamentos em que o próprio cliente emite as guias"><input type="checkbox" id="ep-todos"' + (E.rt.epTodos ? ' checked' : '') + '> Incluir clientes que emitem as próprias guias</label>' +
      '' +
      '<button type="button" class="ep-gen-btn" id="ep-gerar" disabled>📨 Gerar Notificação</button></div>' +
    '<div class="ep-legenda"><span class="ep-leg"><span class="ep-dot ep-dot-v"></span>Vencida</span><span class="ep-leg"><span class="ep-dot ep-dot-m"></span>Vence este mês</span><span class="ep-leg"><span class="ep-dot ep-dot-e"></span>Enviada</span></div>' +
    '<div id="ep-sel"></div><div id="ep-out" hidden></div></div></div>';
  const visiveis = () => { const b = normalizar(E.rt.busca), dig = soDigitos(E.rt.busca);
    return G.filter((g) => !g.pago && (E.rt.epTodos || !g.clienteEmite) && (!E.rt.grupo || g.p.grupo_id === E.rt.grupo) &&
      (!b || normalizar([g.p.empresa, g.p.natureza, g.p.local, g.p.numero].join(' ')).includes(b) || (dig.length >= 3 && soDigitos(g.p.cnpj).includes(dig)))); };
  const contar = () => { const its = G.filter((g) => _epSel.has(g.id)), n = its.length, e = new Set(its.map(empK)).size;
    $('ep-cnt').innerHTML = n ? '<strong>' + plural(e, 'empresa', 'empresas') + '</strong> · <strong>' + plural(n, 'item selecionado', 'itens selecionados') + '.</strong>' : 'Nenhum item selecionado.';
    $('ep-gerar').disabled = !n; };
  const fechadas = new Set();
  const pintar = () => {
    const emps = {}; visiveis().forEach((g) => { (emps[empK(g)] = emps[empK(g)] || []).push(g); });
    const nomes = Object.keys(emps).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    $('ep-sel').innerHTML = nomes.length ? nomes.map((emp) => { const its = emps[emp];
      return '<div class="ep-emp"><div class="ep-emp-hd" data-ep-emp-hd="' + esc(emp) + '"><label><input type="checkbox" class="ep-emp-chk" data-ep-emp="' + esc(emp) + '"' + (its.every((g) => _epSel.has(g.id)) ? ' checked' : '') + '>' +
        '<span class="ep-emp-nome">' + esc(emp) + '</span><span class="ep-emp-meta">' + its.length + ' item' + (its.length !== 1 ? 's' : '') + '</span></label>' +
        '<span class="ep-emp-arrow" data-ep-seta="' + esc(emp) + '" title="Mostrar/ocultar itens">▾</span></div>' +
        '<div class="ep-emp-body"' + (fechadas.has(emp) ? ' hidden' : '') + '>' + its.map((g) => '<div class="ep-row' + (g.enviada ? ' ep-re' : g.vencida ? ' ep-rv' : '') + '" data-ep-row="' + g.id + '"><label>' +
          '<input type="checkbox" class="ep-chk" data-ep="' + g.id + '"' + (_epSel.has(g.id) ? ' checked' : '') + '>' +
          (g.enviada ? '<span class="ep-tag ep-te">✓ Enviada</span>' : g.vencida ? '<span class="ep-tag ep-tv" data-sit="atraso">⚠︎ Vencida</span>' : '<span class="ep-tag ep-tm" data-sit="' + situacaoDe(g.vencimento, false) + '">📅 ' + (g.vencimento === hojeISO() ? 'Vence hoje' : 'Este mês') + '</span>') +
          '<span class="ep-row-lbl">' + esc((g.p.natureza || '') + (g.p.local && g.p.local !== g.p.natureza ? ' — ' + g.p.local : '')) + '</span>' + (g.clienteEmite ? '<span class="ep-tag ep-tc" data-sit="cliente" title="Normalmente o próprio cliente emite esta guia">cliente emite</span>' : '') + '</label>' +
          '<span class="ep-row-venc">Venc. ' + dataBR(g.vencimento) + '</span></div>').join('') + '</div></div>'; }).join('')
      : '<div class="ep-vazio">✅ Nenhum item vencido ou vencendo neste mês' + (E.rt.grupo || E.rt.busca ? ' com esses filtros' : '') + '.</div>';
    contar();
  };
  $('ep-sel').onclick = (ev) => {
    const seta = ev.target.closest('[data-ep-seta]'); if (seta) { const k = seta.dataset.epSeta; if (fechadas.has(k)) fechadas.delete(k); else fechadas.add(k); return pintar(); }
    if (ev.target.closest('input,label')) return;
    // clicar na linha (fora da caixinha) também marca/desmarca, como no ERP antigo
    const hd = ev.target.closest('[data-ep-emp-hd]'); if (hd) { const c = hd.querySelector('.ep-emp-chk'); c.checked = !c.checked; c.dispatchEvent(new Event('change', { bubbles: true })); return; }
    const row = ev.target.closest('[data-ep-row]'); if (row) { const c = row.querySelector('.ep-chk'); c.checked = !c.checked; c.dispatchEvent(new Event('change', { bubbles: true })); }
  };
  $('ep-sel').onchange = (ev) => {
    const c = ev.target.closest('[data-ep]'); if (c) { if (c.checked) _epSel.add(c.dataset.ep); else _epSel.delete(c.dataset.ep); return pintar(); }
    const ce = ev.target.closest('[data-ep-emp]'); if (ce) { visiveis().filter((g) => empK(g) === ce.dataset.epEmp).forEach((g) => { if (ce.checked) _epSel.add(g.id); else _epSel.delete(g.id); }); pintar(); }
  };
  $('ep-atu').onclick = (ev) => comBotao(ev.currentTarget, async () => { await dadosRotina(true); atualizarPlacar(); await rotinaEnviarGuias(el); });
  $('ep-todos').onchange = (ev) => { E.rt.epTodos = ev.target.checked; if (!ev.target.checked) G.filter((g) => g.clienteEmite).forEach((g) => _epSel.delete(g.id)); pintar(); };
  // ── mensagens geradas: um cartão por empresa ──
  const gerar = async () => {
    if (cad) await cad;
    const porEmp = {}; G.filter((g) => _epSel.has(g.id)).forEach((g) => { (porEmp[empK(g)] = porEmp[empK(g)] || []).push(g); });
    const lista = Object.keys(porEmp).sort((a, b) => a.localeCompare(b, 'pt-BR')).map((emp) => { const its = porEmp[emp], g0 = its[0], cid = clienteDoParcelamento(g0.p), c = E.clientes.find((y) => y.id === cid) || {};
      return { emp, its, cli: cid, grupo: g0.p.grupo_id, tel: c.telefone || '', arquivos: [] }; });
    const out = $('ep-out'); out.hidden = false; $('ep-sel').hidden = true;
    el.querySelector('.ep-topo').hidden = true; el.querySelector('.ep-legenda').hidden = true; el.querySelector('.rt-filtros').hidden = true;
    out.innerHTML = '<div class="ep-out-hd"><div class="ep-out-tit">📨 Mensagens geradas</div><span class="ep-out-ac">' +
        (lista.length > 1 ? '<button type="button" class="btn btn-p btn-mini" id="ep-todos-rasc" title="Salva o rascunho no Gmail de todas as mensagens abaixo, uma por uma">✉ Salvar todos os rascunhos (' + lista.length + ')</button>' : '') +
        '<button type="button" class="btn btn-o btn-mini ep-voltar" id="ep-voltar">← Voltar à seleção</button></span></div>' +
      // Backup 49: antes de salvar todos, o que ainda falta (sem e-mail, sem guia anexada, cliente que não recebe e-mails)
      '<div class="ep-pend" id="ep-pend" hidden></div>' +
      '<div class="ep-grid">' + lista.map((e, k) => { const tit = 'Guias de Parcelamento — ' + e.emp, wnum = soDigitos(e.tel), env = e.its.every((g) => g.enviada);
        return '<div class="ep-card" data-k="' + k + '"><div class="ep-card-hd2">' +
          '<div class="ep-card-hcol"><div class="ep-card-ch">📧 E-mail</div><div class="ep-card-emp">' + esc(e.emp) + '</div>' +
            '<div class="ep-card-assunto">Assunto: <em>' + esc(tit) + '</em></div>' +
            '<div class="ep-card-sub">Para: <input class="ep-para" placeholder="não cadastrado" aria-label="E-mail do cliente"></div></div>' +
          '<div class="ep-card-hcol"><div class="ep-card-ch ep-ch-zap">💬 WhatsApp</div><div class="ep-card-emp">' + esc(e.emp) + '</div>' +
            '<div class="ep-card-sub">' + (wnum ? '<a href="https://wa.me/55' + wnum + '" target="_blank" rel="noopener" class="ep-zap-l">' + esc(e.tel) + '</a>' : '<em class="ep-nada">número não cadastrado</em>') + '</div></div></div>' +
          '<div class="ep-card-body">' + epHtml(textoNotifParcelas(e.emp, e.its)) + '</div><textarea class="ep-card-edit" hidden></textarea>' +
          '<div class="ep-anexos"><label class="ep-anexar"><input type="file" class="ep-arqs" accept=".pdf,image/*" multiple hidden>📎 Anexar guias (PDF)</label><span class="ep-chips"></span>' +
            '<span class="ep-anx-dica">vão anexadas no rascunho do Gmail</span></div>' +
          // Backup 53: o "Pagamento" saiu do cartão da notificação (o pagamento se marca na Planilha)
          '<div class="ep-card-acts2">' +
            '<button type="button" class="ep-act ep-a-edit" data-ep-a="edit">✏️ Editar</button>' +
            '<button type="button" class="ep-act ep-a-copy" data-ep-a="copy">📋 Copiar</button>' +
            '<button type="button" class="ep-act ep-a-prev" data-ep-a="prev" title="Ver o e-mail como o cliente vai receber">👁 Prévia</button>' +
            '<button type="button" class="ep-act ep-a-mail" data-ep-a="mail" title="Salva um rascunho no seu Gmail, já com o e-mail do cliente e as guias anexadas — confira no Gmail e clique em Enviar">✉ Enviar e-mail</button>' +
            '<button type="button" class="ep-act ep-a-wpp2" data-ep-a="zap"' + (wnum ? '' : ' disabled') + '>💬 Enviar WhatsApp</button>' +
            '<button type="button" class="ep-act ep-a-sent" data-ep-a="sent"' + (env ? ' disabled' : '') + '>' + (env ? '✓ Enviado' : '✉ Marcar enviado') + '</button></div></div>'; }).join('') + '</div>';
    const pendencias = () => { const box = $('ep-pend'); if (!box) return; const P = [];
      out.querySelectorAll('.ep-card:not(.ep-feito)').forEach((card) => { const e = lista[+card.dataset.k], c = E.clientes.find((y) => y.id === e.cli) || {};
        if (c.recebe_email === false) P.push('<li><b>' + esc(e.emp) + '</b> — marcado para <b>não receber e-mails</b> (Clientes → ✉)</li>');
        else if (!card.querySelector('.ep-para').value.trim()) P.push('<li><b>' + esc(e.emp) + '</b> — sem e-mail de destino</li>');
        if (!e.arquivos.length) P.push('<li><b>' + esc(e.emp) + '</b> — nenhuma guia anexada</li>'); });
      box.hidden = !P.length; box.innerHTML = P.length ? '<b>⚠ Pendências do envio (' + P.length + ')</b><ul>' + P.join('') + '</ul>' : ''; };
    Promise.all([...out.querySelectorAll('.ep-card')].map((card) => { const e = lista[+card.dataset.k]; return Promise.resolve(preencherDestino(card.querySelector('.ep-para'), e.cli, e.grupo, 'parcelas')).catch(() => null); }))
      .then(pendencias);
    out.addEventListener('input', (ev) => { if (ev.target.closest('.ep-para')) pendencias(); });
    aviso('✓ ' + plural(lista.length, 'mensagem gerada', 'mensagens geradas') + '.');
    const chips = (card, e) => { card.querySelector('.ep-chips').innerHTML = e.arquivos.map((f, i) => '<span class="ge-chip">📄 ' + esc(f.name) + ' <small>' + Math.max(1, Math.round(f.size / 1024)) + ' KB</small><button type="button" data-ep-tira="' + i + '" aria-label="Tirar">×</button></span>').join(''); };
    // os valores digitados no texto voltam para cada guia (na ordem do texto)
    // Backup 46: salva o rascunho e, assim que o Gmail confirma, a guia fica "emitida" com a data de hoje (e o valor digitado vira o valor lançado)
    const salvarCard = async (card, e) => {
      const b = card.querySelector('[data-ep-a=mail]'), para = card.querySelector('.ep-para').value.trim();
      if (e.arquivos.reduce((s2, f) => s2 + f.size, 0) > LIMITE_ANEXOS) return { ok: false, msg: e.emp + ': os PDFs somam mais de 15 MB — divida em dois e-mails.' };
      const arqs = []; for (const f of e.arquivos) arqs.push(await lerArquivoB64(f));
      b.textContent = '⏳ Salvando rascunho…'; b.disabled = true;
      try {
        const r = await q(sb.rpc('rascunho_email_texto', { p_cliente: e.cli || null, p_para: para, p_assunto: 'Guias de Parcelamento — ' + e.emp, p_texto: epTextoAtual(card), p_arquivos: arqs }));
        const s2 = await salvarRascunhoAgora(r.ref);
        if (!s2.ok) return { ok: false, msg: e.emp + ': ' + s2.msg };
        valores(card, e);
        for (const g of e.its) { await q(sb.rpc('registrar_emissao', { p_tabela: 'parcelas', p_id: g.id, p_emitida: true, p_doc: null, p_enviar: false }));
          if (g._valor > 0) await q(sb.rpc('lancar_valor_parcela', { p_id: g.id, p_valor: g._valor })).catch(() => null);
          g.enviada = true; g.emitida_em = g.emitida_em || hojeISO(); g.emissao = 'SIM'; _epSel.delete(g.id); }
        if (window.ERP_EDITOR && window.ERP_EDITOR.marcarSujo) e.its.forEach((g) => window.ERP_EDITOR.marcarSujo('parcelas', g.parcelamento_id)); atualizarPlacar();
        card.classList.add('ep-feito'); const sb2 = card.querySelector('[data-ep-a=sent]'); if (sb2) { sb2.disabled = true; sb2.textContent = '✓ Enviado'; }
        return { ok: true, msg: '✓ Rascunho criado no Gmail' + (para ? ' para ' + para : ' (sem destinatário cadastrado)') + (arqs.length ? ' com ' + plural(arqs.length, 'anexo', 'anexos') : '') + ' — guia marcada como emitida. Abra o Gmail → Rascunhos, confira e envie.' };
      } catch (err) { return { ok: false, msg: e.emp + ': ' + erroAmigavel(err) }; }
      finally { b.textContent = card.classList.contains('ep-feito') ? '✓ Rascunho salvo' : '✉ Enviar e-mail'; b.disabled = card.classList.contains('ep-feito'); }
    };
    const valores = (card, e) => { const ins = [...card.querySelectorAll('.ep-card-body .ep-val')];
      if (ins.length === e.its.length) ins.forEach((i, n) => { const v = lerValor(i.value); e.its[n]._valor = isNaN(v) ? 0 : v; }); };
    out.onchange = (ev) => { const a = ev.target.closest('.ep-arqs'); if (!a) return; const card = a.closest('.ep-card'), e = lista[+card.dataset.k];
      e.arquivos = e.arquivos.concat([...a.files]); a.value = ''; chips(card, e); pendencias(); };
    out.addEventListener('focusout', (ev) => { const i = ev.target.closest('.ep-val'); if (!i || !i.value.trim()) return; const v = lerValor(i.value); i.value = isNaN(v) ? '' : valorParaCampo(v); });
    out.onclick = (ev) => {
      if (ev.target.closest('#ep-todos-rasc')) return comBotao(ev.target.closest('#ep-todos-rasc'), async () => {
        let ok = 0; const falhas = [];
        for (const card of out.querySelectorAll('.ep-card:not(.ep-feito)')) { const r = await salvarCard(card, lista[+card.dataset.k]); if (r.ok) ok++; else falhas.push(r.msg); }
        pendencias();
        if (falhas.length) aviso('⚠ ' + plural(ok, 'rascunho salvo', 'rascunhos salvos') + '; ' + plural(falhas.length, 'falhou', 'falharam') + ': ' + falhas.join(' · '), true);
        else aviso('✓ ' + plural(ok, 'rascunho salvo', 'rascunhos salvos') + ' no Gmail e as guias marcadas como emitidas. Abra o Gmail → Rascunhos.'); });
      if (ev.target.closest('#ep-voltar')) { out.hidden = true; $('ep-sel').hidden = false; el.querySelector('.ep-topo').hidden = false; el.querySelector('.ep-legenda').hidden = false; el.querySelector('.rt-filtros').hidden = false; return pintar(); }
      const card = ev.target.closest('.ep-card'); if (!card) return; const e = lista[+card.dataset.k];
      const pg = ev.target.closest('[data-ep-pago]');
      if (pg) { const g = e.its.find((y) => y.id === pg.dataset.epPago); if (!g || g.pago) return;
        const pintaBt = () => { const b2 = card.querySelector('[data-ep-pago="' + g.id + '"]'); if (!b2) return; b2.classList.toggle('ep-pago-ok', !!g.pago); b2.disabled = !!g.pago;
          b2.textContent = (g.pago ? '✓ Paga' : '○ Pago') + ' — parcela ' + (g.numero || '?') + ' · venc. ' + dataBR(g.vencimento).slice(0, 5); };
        pagarParcelaRotina(g, pintaBt); return; }
      const tira = ev.target.closest('[data-ep-tira]'); if (tira) { e.arquivos.splice(+tira.dataset.epTira, 1); chips(card, e); return pendencias(); }
      const b = ev.target.closest('[data-ep-a]'); if (!b) return; const a = b.dataset.epA;
      if (a === 'edit') { const v = card.querySelector('.ep-card-body'), t = card.querySelector('.ep-card-edit');
        if (!t.hidden) { v.innerHTML = epHtml(t.value); v.hidden = false; t.hidden = true; b.textContent = '✏️ Editar'; }
        else { t.value = epParaEdicao(card); v.hidden = true; t.hidden = false; t.focus(); b.textContent = '✔ Concluir'; } return; }
      if (a === 'copy') return copiarTexto(epTextoAtual(card)).then(() => { const o = b.textContent; b.textContent = '✓ Copiado!'; setTimeout(() => { b.textContent = o; }, 2000); });
      if (a === 'prev') return comBotao(b, async () => { const h = await q(sb.rpc('previa_rascunho_texto', { p_cliente: e.cli || null, p_assunto: 'Guias de Parcelamento — ' + e.emp, p_texto: epTextoAtual(card) }));
        verEmailHtml('Guias de Parcelamento — ' + e.emp, h); });
      if (a === 'zap') { window.open('https://wa.me/55' + soDigitos(e.tel) + '?text=' + encodeURIComponent(epTextoAtual(card)), '_blank', 'noopener'); return; }
      if (a === 'sent') { if (!confirm('Confirmar envio para "' + e.emp + '"?')) return;
        return comBotao(b, async () => { valores(card, e);
          for (const g of e.its) { await q(sb.rpc('registrar_emissao', { p_tabela: 'parcelas', p_id: g.id, p_emitida: true, p_doc: null, p_enviar: false }));
            if (g._valor > 0) await q(sb.rpc('lancar_valor_parcela', { p_id: g.id, p_valor: g._valor })).catch(() => null);
            g.enviada = true; g.emitida_em = g.emitida_em || hojeISO(); g.emissao = 'SIM'; _epSel.delete(g.id); }
          if (window.ERP_EDITOR && window.ERP_EDITOR.marcarSujo) e.its.forEach((g) => window.ERP_EDITOR.marcarSujo('parcelas', g.parcelamento_id)); atualizarPlacar();
          b.disabled = true; b.textContent = '✓ Enviado'; card.classList.add('ep-feito'); aviso('✓ Marcado como enviado para "' + e.emp + '".'); }); }
      if (a === 'mail') return comBotao(b, async () => { const r = await salvarCard(card, e); if (!r.ok) throw new Error(r.msg); aviso(r.msg); });
    };
  };
  $('ep-gerar').onclick = gerar;
  ligarFiltroRotina(el, pintar); pintar();
  // a lista de grupos do filtro completa quando os cadastros chegam
  if (cad) cad.then(() => { const sel = el.querySelector('#rt-grupo'); if (sel && sel.options.length <= 1) sel.innerHTML = '<option value="">Todos os grupos</option>' +
    E.grupos.map((g) => '<option value="' + g.id + '"' + (g.id === E.rt.grupo ? ' selected' : '') + '>' + esc(g.nome) + '</option>').join(''); });
  // Backup 51 (R3): veio da Planilha (clique na parcela) → abre direto o cartão de envio daquela guia
  if (E.rt.epAbrir) { const id = E.rt.epAbrir; E.rt.epAbrir = null;
    if (G.some((g) => g.id === id)) { _epSel.clear(); _epSel.add(id); gerar(); } }
}

// ── Backup 51 (V4): "Pago" e "Emitida" na hora — a tela muda no clique, o banco grava por trás; erro → a tela volta e o motivo aparece ──
// Backup 63: antes de marcar, pergunta (data do pagamento + confirmação); cancelou → nada muda
async function pagarParcelaRotina(x, redesenhar) {
  const D = _rtDados ? await _rtDados.catch(() => null) : null, pa = D && D.porId[x.parcelamento_id];
  const bx = await perguntarBaixa({ despesa: true, titulo: 'Pagamento da parcela — confirme', valor: x.valor != null ? Number(x.valor) : (pa && pa.valor_ultima_parcela != null ? Number(pa.valor_ultima_parcela) : null),
    descricao: 'Parcela ' + (x.numero || '') + (pa && pa.empresa ? ' — ' + pa.empresa : '') + (x.vencimento ? ' · venc. ' + dataBR(x.vencimento) : '') });
  if (!bx) return;
  const antes = { pago: x.pago, data_pagamento: x.data_pagamento };
  const volta = () => { x.pago = antes.pago; x.data_pagamento = antes.data_pagamento; redesenhar(); atualizarPlacar(); };
  x.pago = true; x.data_pagamento = bx.data_pagamento; redesenhar();
  const ED = window.ERP_EDITOR;
  const desfazer = async () => { const r = await sb.from('parcelas').update({ pago: false }).eq('id', x.id);
    if (r.error) return aviso('⚠ ' + erroAmigavel(r.error), true);
    if (ED && ED.gravou) ED.gravou('Baixa desfeita'); if (ED && ED.marcarSujo) ED.marcarSujo('parcelas', x.parcelamento_id); volta(); };
  const gravar = ED && ED.baixaRapida ? ED.baixaRapida('parcelas', x.id, { semRecarregar: true, desfazer, prazoDesfazer: 5000, dados: bx })
    : q(sb.from('parcelas').update(bx).eq('id', x.id).select().single()).catch((e) => { aviso('⚠ ' + erroAmigavel(e), true); return null; });
  return Promise.resolve(gravar).then((d) => {
    if (!d || !d.id) return volta();
    if (d.data_pagamento && d.data_pagamento !== x.data_pagamento) { x.data_pagamento = d.data_pagamento; redesenhar(); }
    atualizarPlacar();
  }, (e) => { aviso('⚠ ' + erroAmigavel(e), true); volta(); });
}
// Backup 53: desmarcar o pagamento (a tela muda na hora; erro → volta)
function desmarcarPagoRotina(x, redesenhar) {
  const antes = { pago: x.pago, data_pagamento: x.data_pagamento };
  x.pago = false; x.data_pagamento = null; redesenhar();
  return q(sb.from('parcelas').update({ pago: false, data_pagamento: null }).eq('id', x.id)).then(() => {
    const ED = window.ERP_EDITOR; if (ED && ED.gravou) ED.gravou('Pagamento desmarcado'); else aviso('Pagamento desmarcado.');
    if (ED && ED.marcarSujo) ED.marcarSujo('parcelas', x.parcelamento_id); atualizarPlacar();
  }, (e) => { Object.assign(x, antes); redesenhar(); aviso('⚠ ' + erroAmigavel(e), true); });
}
function emitirParcelaRotina(x, redesenhar) {
  const emitida = !!x.emitida_em || /sim|emitid/i.test(x.emissao || ''), novo = !emitida;
  const antes = { emitida_em: x.emitida_em, emissao: x.emissao, enviada: x.enviada };
  x.emitida_em = novo ? hojeISO() : null; x.emissao = novo ? 'SIM' : ''; if ('enviada' in x) x.enviada = novo; redesenhar();
  return q(sb.rpc('registrar_emissao', { p_tabela: 'parcelas', p_id: x.id, p_emitida: novo, p_doc: null, p_enviar: false })).then(() => {
    if (window.ERP_EDITOR && window.ERP_EDITOR.marcarSujo) window.ERP_EDITOR.marcarSujo('parcelas', x.parcelamento_id); atualizarPlacar();
  }, (e) => { Object.assign(x, antes); redesenhar(); aviso('⚠ Não foi possível marcar a emissão: ' + erroAmigavel(e), true); });
}

// ── 3c) Backup 35/43: "Planilha de parcelamentos" (voltou no Backup 43; deixou de ser teste) — igual à planilha do escritório: uma aba por GRUPO e um bloco por
// parcelamento (Nome, CPF/CNPJ, Local, Natureza, Nº, Total, Pagas, Valor da última parcela, Valor residual, Emitimos, observação) com a
// lista PARCELA · VENCIMENTO · EMISSÃO · PAGAMENTO. Botão "Emitir guias": as em atraso + as que vencem neste mês (como no ERP antigo).
async function rotinaPlanilha(el) {
  const h = hojeISO(), fimMes = fimDoMesGuia(h);
  // Backup 51 (V1/V2): a mesma consulta enxuta de "Guias do mês", guardada enquanto a Rotina está aberta
  const D = await dadosRotina();   // o nome do grupo já vem junto: a Planilha não espera os cadastros
  if (E.rt.aba !== 'planilha' || !el.isConnected) return;
  const { PA, P2, porPa, antes } = D;
  const gNomes = {}; PA.forEach((p) => { gNomes[p.grupo_id] = p.grupo_nome || nomeGrupo(p.grupo_id) || 'Sem grupo'; });
  const grupos = [...new Set(PA.map((p) => gNomes[p.grupo_id]))].sort((a, b) => (a === 'Sem grupo') - (b === 'Sem grupo') || a.localeCompare(b, 'pt-BR'));
  E.rt.plGrupo = grupos.includes(E.rt.plGrupo) ? E.rt.plGrupo : grupos[0];
  const emit = (x) => !!x.emitida_em || /sim|emitid/i.test(x.emissao || '');
  // "a emitir agora" = não paga, nós emitimos, sem emissão e vencendo até o fim do mês (vencidas entram de novo: reemissão) — só informação (o envio é na aba "Enviar guias do mês")
  const aEmitir = (p) => p.emitimos_guia === false ? [] : (porPa[p.id] || []).filter((x) => !x.pago && x.vencimento && x.vencimento <= fimMes && (!emit(x) || x.vencimento < h));
  // parcelas que ainda não foram lançadas: completa a lista até a última (mês a mês, a partir da última lançada)
  const prevista = (ps, tot) => { const u = ps[ps.length - 1], n0 = u ? Number(u.numero) : 0; if (!u || !n0 || !u.vencimento || !(tot > n0)) return [];
    const out = []; for (let n = n0 + 1; n <= Math.min(tot, n0 + 240); n++) { const d = new Date(u.vencimento + 'T12:00:00'), dia = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + (n - n0));
      d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); out.push({ n, v: d.toISOString().slice(0, 10) }); } return out; };
  const nGrupo = (g) => PA.filter((p) => gNomes[p.grupo_id] === g).reduce((s2, p) => s2 + aEmitir(p).length, 0);
  // Backup 45: mais leve — as pagas antigas e as previstas ficam resumidas numa linha (clique para abrir); só o bloco que mudou é redesenhado
  const abertos = new Set();
  const curta = (d) => { const s = dataBR(d); return s.slice(0, 6) + s.slice(8); };
  const linhaParcela = (x, cli) => { const at = !x.pago && x.vencimento < h, mes = x.vencimento && x.vencimento.slice(0, 7) === h.slice(0, 7), em = emit(x);
    const dEm = x.emitida_em ? curta(x.emitida_em) : em ? 'emitida' : '';
    return '<tr data-pl-x="' + x.id + '" class="' + (x.pago ? 'pl-pago' : at ? 'pl-atr' : mes ? 'pl-mes' : '') + '"' + (x.pago ? '' : ' title="Clique no nº ou no vencimento para abrir o cartão de envio da guia"') + '><td>' + esc(x.numero || '') + '</td><td>' + dataBR(x.vencimento) + '</td>' +
      '<td>' + (cli ? '<span class="pl-dt pl-dt-cli" data-sit="cliente" title="O cliente emite">cliente</span>'
        : em ? '<button type="button" class="pl-dt pl-dt-ok" data-pl-e="' + x.id + '" title="Emitida' + (x.emitida_em ? ' em ' + dataBR(x.emitida_em) : '') + ' · clique para desmarcar">✓ ' + esc(dEm) + '</button>'
        : x.pago ? '<span class="pl-dt">—</span>'
        : '<button type="button" class="pl-dt pl-dt-mk2" data-pl-e="' + x.id + '" title="Marcar como emitida">○ marcar</button>') + '</td>' +
      // Backup 52 (P4): situação com o texto e a cor únicos do ERP (SITUACOES)
      // Backup 53: a paga também é botão — clicar desmarca o pagamento
      '<td>' + (x.pago ? '<button type="button" class="pl-dt pl-dt-ok" data-sit="pago" data-pl-np="' + x.id + '" title="Paga · clique para desmarcar o pagamento">✓ ' + (x.data_pagamento ? curta(x.data_pagamento) : 'paga') + '</button>'
        : '<button type="button" class="pl-dt ' + (at ? 'pl-dt-atr' : 'pl-dt-ab') + '" data-sit="' + situacaoDe(x.vencimento, false) + '" data-pl-p="' + x.id + '" title="Clique para lançar o pagamento">' + SITUACOES[situacaoDe(x.vencimento, false)] + '</button>') + '</td></tr>'; };
  const bloco = (p) => {
    // Backup 51: as pagas há mais de 3 meses chegam resumidas (antes[p.id]); "ver" busca o histórico deste parcelamento
    const ant = antes[p.id] || null;
    const ps = (porPa[p.id] || []).slice().sort((x, y) => String(x.vencimento).localeCompare(String(y.vencimento))), pagas = ps.filter((x) => x.pago).length + (ant ? Number(ant.pagas) || 0 : 0), tot = Number(p.total_parcelas) || ps.length + (ant ? (Number(ant.n) || 0) + (Number(ant.depois) || 0) : 0), v = Number(p.valor_ultima_parcela) || 0;
    const resid = v * Math.max(0, tot - pagas), cli = p.emitimos_guia === false, atr = ps.filter((x) => !x.pago && x.vencimento < h).length, nAe = aEmitir(p).length;
    const pct = tot ? Math.round(100 * pagas / tot) : 0, ab = abertos.has(p.id);
    // Backup 46: todas as parcelas lançadas aparecem; só as PREVISTAS (ainda não lançadas) ficam resumidas numa linha
    const corte = 0, escondidas = 0, prev = prevista(ps, tot), prevVis = ab ? prev : prev.slice(0, 3);
    return '<section class="pl-bloco" data-pl-pa="' + p.id + '">' +
      '<div class="pl-cab"><div class="pl-cab-nome">' + esc(p.empresa || '—') + '</div>' +
        '<div class="pl-cab-doc">' + esc(mascaraDoc(p.cnpj) || 'sem CPF/CNPJ') + '</div>' +
        '<div class="pl-cab-tags">' + [p.local, p.natureza].filter(Boolean).map((z) => '<span class="pl-tag">' + esc(z) + '</span>').join('') + (p.numero ? '<span class="pl-tag pl-tag-n">nº ' + esc(p.numero) + '</span>' : '') + '</div>' +
        '<div class="pl-prog"><div class="pl-prog-bar"><span style="width:' + pct + '%"></span></div><span><b>' + pagas + '</b> de ' + (tot || '—') + ' pagas' + (atr ? ' · <b class="pl-atr-t">' + atr + ' em atraso</b>' : '') + '</span></div>' +
        '<div class="pl-kpis"><div><small>Última parcela</small><span class="rt-vbox"><span>R$</span><input data-pl-v="' + p.id + '" data-mascara="nenhuma" inputmode="decimal" value="' + (v ? valorParaCampo(v) : '') + '" aria-label="Valor da última parcela"></span></div>' +
          '<div><small>Valor residual</small><b>' + brl(resid) + '</b></div></div>' +
        '<div class="pl-cab-pe"><label class="rt-chave rt-chave-mini"><input type="checkbox" data-pl-emit="' + p.id + '"' + (cli ? '' : ' checked') + '><span></span><small>' + (cli ? 'O cliente emite as guias' : 'Nós emitimos as guias') + '</small></label>' +
          (nAe ? '<span class="pill hoje" title="Envie na aba “Enviar guias do mês”">' + plural(nAe, 'a emitir', 'a emitir') + '</span>' : '') + '</div>' +
        '<input class="pl-obs" data-pl-obs="' + p.id + '" value="' + esc(p.obs || '') + '" placeholder="Observação" aria-label="Observação"></div>' +
      (ps.length || ant ? '<table class="pl-tab"><colgroup><col style="width:12%"><col style="width:28%"><col style="width:30%"><col style="width:30%"></colgroup><thead><tr><th title="Parcela">Nº</th><th>Vencimento</th><th>Emissão</th><th>Pagamento</th></tr></thead><tbody>' +
        (ant && Number(ant.n) ? '<tr class="pl-resumo"><td colspan="4"><button type="button" class="pl-mais" data-pl-hist="' + p.id + '" title="Parcelas de antes dos últimos 3 meses">✓ ' + plural(Number(ant.n) || 0, 'parcela anterior', 'parcelas anteriores') +
          ' (' + (Number(ant.pagas) || 0) + ' pagas' + (ant.total_pago > 0 ? ' · ' + brl(ant.total_pago) : '') + ') · ver</button></td></tr>' : '') +
        (escondidas ? '<tr class="pl-resumo"><td colspan="4"><button type="button" class="pl-mais" data-pl-abre="' + p.id + '">✓ ' + plural(escondidas, 'parcela paga', 'parcelas pagas') + ' (' + esc(ps[0].numero || '') + ' a ' + esc(ps[escondidas - 1].numero || '') + ') · ver</button></td></tr>' : '') +
        ps.slice(escondidas).map((x, i, arr) => (ant && Number(ant.depois) && i === arr.length - 1 ? '<tr class="pl-resumo"><td colspan="4"><button type="button" class="pl-mais" data-pl-hist="' + p.id + '" title="Parcelas lançadas para depois dos próximos 3 meses">… ' +
          plural(Number(ant.depois), 'parcela lançada mais adiante', 'parcelas lançadas mais adiante') + ' · ver</button></td></tr>' : '') + linhaParcela(x, cli)).join('') +
        prevVis.map((r) => '<tr class="pl-prev" title="Parcela ainda não lançada no sistema (data prevista)"><td>' + r.n + '</td><td>' + dataBR(r.v) + '</td><td>—</td><td>prevista</td></tr>').join('') +
        (prev.length > prevVis.length ? '<tr class="pl-resumo"><td colspan="4"><button type="button" class="pl-mais" data-pl-abre="' + p.id + '">+ ' + plural(prev.length - prevVis.length, 'parcela prevista', 'parcelas previstas') + ' até ' + dataBR(prev[prev.length - 1].v) + ' · ver</button></td></tr>' : '') +
        (ab && (corte || prev.length > 3) ? '<tr class="pl-resumo"><td colspan="4"><button type="button" class="pl-mais" data-pl-fecha="' + p.id + '">▴ resumir</button></td></tr>' : '') +
        '</tbody></table>' : '<div class="pl-sem">Nenhuma parcela lançada neste parcelamento.</div>') + '</section>'; };
  const redesenharBloco = (id) => { const sec = el.querySelector('[data-pl-pa="' + id + '"]'), p = PA.find((y) => y.id === id); if (sec && p) sec.outerHTML = bloco(p);
    igualarCabs();
    const r = $('pl-rolo'), bx = $('pl-barra-x'); if (r && bx) { bx.firstElementChild.style.width = r.scrollWidth + 'px'; bx.hidden = r.scrollWidth <= r.clientWidth + 2; }
    const ab = el.querySelector('.pl-aba.ativo'), n = nGrupo(E.rt.plGrupo); if (ab) ab.innerHTML = esc(E.rt.plGrupo) + (n ? ' <span class="pl-n" title="Guias a emitir">' + n + '</span>' : ''); };
  // Backup 46: cada empresa numa linha, com os parcelamentos dela lado a lado; a tela rola para o lado (barra fixa no rodapé)
  // Backup 55: o cabeçalho de todos os blocos termina na mesma altura, para as linhas das parcelas ficarem alinhadas lado a lado
  const igualarCabs = () => { const cabs = [...el.querySelectorAll('#pl-rolo .pl-bloco > .pl-cab')]; cabs.forEach((c) => { c.style.minHeight = ''; });
    const h = Math.max(0, ...cabs.map((c) => c.getBoundingClientRect().height)); if (h) cabs.forEach((c) => { c.style.minHeight = Math.ceil(h) + 'px'; }); };
  const ligarRolo = () => {
    const rolo = $('pl-rolo'), bx = $('pl-barra-x'); if (!rolo || !bx) return;
    igualarCabs();
    const ajustar = () => { bx.firstElementChild.style.width = rolo.scrollWidth + 'px'; bx.hidden = rolo.scrollWidth <= rolo.clientWidth + 2; };
    ajustar(); let lock = false;
    rolo.onscroll = () => { if (lock) return; lock = true; bx.scrollLeft = rolo.scrollLeft; lock = false; };
    bx.onscroll = () => { if (lock) return; lock = true; rolo.scrollLeft = bx.scrollLeft; lock = false; };
    if (!window._plResize) { window._plResize = true; window.addEventListener('resize', () => { const r = $('pl-rolo'); if (r) { const b = $('pl-barra-x'); if (b) { b.firstElementChild.style.width = r.scrollWidth + 'px'; b.hidden = r.scrollWidth <= r.clientWidth + 2; } } }); }
  };
  const pintar = () => {
    const L = PA.filter((p) => gNomes[p.grupo_id] === E.rt.plGrupo).sort((a, b) => String(a.empresa).localeCompare(String(b.empresa), 'pt-BR') || String(a.natureza).localeCompare(String(b.natureza), 'pt-BR'));
    const porEmp = []; L.forEach((p) => { const u = porEmp[porEmp.length - 1]; if (u && u.nome === (p.empresa || '—')) u.ps.push(p); else porEmp.push({ nome: p.empresa || '—', ps: [p] }); });
    const nE = L.reduce((s2, p) => s2 + aEmitir(p).length, 0);
    el.innerHTML = '<div class="card pl-card"><div class="card-hd">📋 Planilha de parcelamentos<span class="sub">para conferência · uma aba por grupo, um bloco por parcelamento · clique em EMISSÃO ou PAGAMENTO para marcar · o envio das guias é na aba “Guias do mês”</span>' + botaoAtualizar('pl-atu') + '</div>' +
      '<div class="card-bd"><div class="pl-abas" role="tablist">' + grupos.map((g) => { const n = nGrupo(g);
        return '<button type="button" role="tab" class="pl-aba' + (g === E.rt.plGrupo ? ' ativo' : '') + '" data-pl-g="' + esc(g) + '">' + esc(g) + (n ? ' <span class="pl-n" title="Guias a emitir">' + n + '</span>' : '') + '</button>'; }).join('') + '</div>' +
      '<div class="pl-barra"><span class="sub">' + plural(L.length, 'parcelamento', 'parcelamentos') + ' em <b>' + esc(E.rt.plGrupo || '—') + '</b> · ' + (nE ? plural(nE, 'guia a emitir', 'guias a emitir') + ' (em atraso + vencem neste mês)' : 'nenhuma guia a emitir agora') + '</span>' +
        '</div>' +
      // Backup 53: TODOS os parcelamentos do grupo lado a lado numa linha só (antes: uma linha por empresa)
      (L.length ? '<div class="pl-rolo" id="pl-rolo"><div class="pl-linhas"><div class="pl-linha">' + porEmp.map((e) => e.ps.map(bloco).join('')).join('') + '</div></div></div>' +
        '<div class="pl-barra-x" id="pl-barra-x" aria-label="Rolar para o lado"><div></div></div>' : vazio('Nenhum parcelamento neste grupo.')) + '</div></div>';
    ligarRolo();
  };
  const recarregar = () => rotinaPlanilha(el);
  el.onclick = (ev) => {
    const ab = ev.target.closest('[data-pl-g]'); if (ab) { E.rt.plGrupo = ab.dataset.plG; return pintar(); }
    const atu = ev.target.closest('#pl-atu'); if (atu) return comBotao(atu, async () => { await dadosRotina(true); atualizarPlacar(); await rotinaPlanilha(el); });
    const ma = ev.target.closest('[data-pl-abre]'); if (ma) { abertos.add(ma.dataset.plAbre); return redesenharBloco(ma.dataset.plAbre); }
    const mf = ev.target.closest('[data-pl-fecha]'); if (mf) { abertos.delete(mf.dataset.plFecha); return redesenharBloco(mf.dataset.plFecha); }
    // Backup 51: histórico antigo de UM parcelamento, só quando pedido
    const hi = ev.target.closest('[data-pl-hist]');
    if (hi) return comBotao(hi, async () => { const id = hi.dataset.plHist;
      const L = await q(sb.from('parcelas').select('id, parcelamento_id, numero, vencimento, pago, data_pagamento, emitida_em, emissao, valor').eq('parcelamento_id', id).order('vencimento').order('id'));
      const ja = new Set((porPa[id] || []).map((x) => x.id)); L.forEach((x) => { if (!ja.has(x.id)) { (porPa[id] = porPa[id] || []).push(x); P2.push(x); } });
      delete antes[id]; redesenharBloco(id); });
    // Backup 51 (V4): emissão e pagamento mudam a tela NO CLIQUE; o banco grava por trás e, se der erro, a tela volta e mostra o motivo
    const be = ev.target.closest('[data-pl-e]');
    if (be) { const x = P2.find((y) => y.id === be.dataset.plE); if (x) emitirParcelaRotina(x, () => redesenharBloco(x.parcelamento_id)); return; }
    // o "Lançar o pagamento?" virou "Desfazer" (5 s) no rodapé
    const np = ev.target.closest('[data-pl-np]');
    if (np) { const x = P2.find((y) => y.id === np.dataset.plNp); if (x && confirm('Desmarcar o pagamento da parcela ' + (x.numero || '') + '?')) desmarcarPagoRotina(x, () => redesenharBloco(x.parcelamento_id)); return; }
    const bp = ev.target.closest('[data-pl-p]');
    if (bp) { const x = P2.find((y) => y.id === bp.dataset.plP); if (x) pagarParcelaRotina(x, () => redesenharBloco(x.parcelamento_id)); return; }
    // Backup 51 (R3): clicar na parcela (nº ou vencimento) abre o mesmo cartão de envio de "Guias do mês"
    const lp = ev.target.closest('tr[data-pl-x] td:nth-child(-n+2)');
    if (lp) { const x = P2.find((y) => y.id === lp.parentElement.dataset.plX); if (!x) return;
      if (x.pago) return aviso('Esta parcela já está paga.');
      E.rt.epAbrir = x.id; E.rt.aba = 'guias'; pintarRotina(); }
  };
  el.onchange = (ev) => {
    const c = ev.target.closest('[data-pl-emit]');
    if (c) q(sb.rpc('parcelamentos_emitimos', { p_ids: [c.dataset.plEmit], p_emitimos: c.checked })).then(() => { PA.find((p) => p.id === c.dataset.plEmit).emitimos_guia = c.checked; redesenharBloco(c.dataset.plEmit); atualizarPlacar(); }, (e) => aviso(erroAmigavel(e), true));
  };
  el.addEventListener('focusout', (ev) => {
    const iv = ev.target.closest('[data-pl-v]'), io = ev.target.closest('[data-pl-obs]');
    if (iv) { const v = iv.value.trim() ? lerValor(iv.value) : null; const p = PA.find((y) => y.id === iv.dataset.plV);
      if (v != null && isNaN(v)) return aviso('Valor inválido.', true);
      if ((v || null) === (Number(p.valor_ultima_parcela) || null)) return;
      q(sb.from('parcelamentos').update({ valor_ultima_parcela: v }).eq('id', p.id)).then(() => { p.valor_ultima_parcela = v; aviso('✓ Valor da última parcela gravado.'); redesenharBloco(p.id); }, (e) => aviso(erroAmigavel(e), true)); }
    if (io) { const p = PA.find((y) => y.id === io.dataset.plObs); if ((p.obs || '') === io.value) return;
      q(sb.from('parcelamentos').update({ obs: io.value }).eq('id', p.id)).then(() => { p.obs = io.value; aviso('✓ Observação gravada.'); }, (e) => aviso(erroAmigavel(e), true)); }
  });
  pintar();
}

// ── 5) Minhas tarefas — Backup 29: separadas em Recorrentes (voltam no próximo período), Com validação e Únicas ──
const REPETE = { semanal: 'toda semana', mensal: 'todo mês', anual: 'todo ano' };
async function rotinaTarefas(el) {
  const [T, F] = await Promise.all([q(sb.from('tarefas').select('*, clientes(nome)').not('status', 'in', '(concluida,cancelada)').order('prazo', { nullsFirst: false }).limit(1000)).catch(() => []),
    // Backup 53: as recorrentes já concluídas neste ciclo continuam à vista ("concluída neste ciclo · volta em …")
    q(sb.from('tarefas').select('*, clientes(nome)').eq('status', 'concluida').not('recorrencia', 'is', null).order('prazo', { ascending: false, nullsFirst: false }).limit(500)).catch(() => [])]);
  await feriados().catch(() => null);
  const eu = primeiroNome((E.perfil && E.perfil.nome) || '');
  const minhas = T.filter((t) => ehMinha(t) && !/^(cob|parc|aco):/.test(t.chave_regra || '') && t.status !== 'revisao');
  const validar = T.filter((t) => t.status === 'revisao' && t.revisor && primeiroNome(t.revisor) === eu);
  const h = hojeISO();
  const serie = (t) => t.recorrencia_serie || t.id, abertasSerie = new Set(minhas.filter((t) => t.recorrencia).map(serie)), vistas = new Set();
  const feitasCiclo = F.filter((t) => ehMinha(t) && !abertasSerie.has(serie(t)) && !vistas.has(serie(t)) && vistas.add(serie(t))).map((t) => {
    const r = typeof regraDaTarefa === 'function' ? regraDaTarefa(t) : null, prox = r && typeof proximasDatas === 'function' ? proximasDatas(r, t.prazo || hojeISO(), 1, E._feriados)[0] : null;
    return Object.assign({}, t, { _feita: true, _volta: prox }); }).filter((t) => !t.recorrencia_regra || !t.recorrencia_regra.fim || !t._volta || t._volta <= t.recorrencia_regra.fim);
  const sec = [['🔁 Recorrentes', 'fazem e voltam sozinhas no próximo período (semana, quinzena, mês ou ano)', minhas.filter((t) => t.recorrencia).concat(feitasCiclo)],
    ['✔ Com validação', 'ao concluir, vão para quem valida; só fecham depois do "aprovado"', minhas.filter((t) => !t.recorrencia && t.exige_revisao)],
    ['📌 Únicas', 'fazem uma vez e acabou', minhas.filter((t) => !t.recorrencia && !t.exige_revisao)],
    ['🔎 Para eu validar', 'o que a equipe concluiu e espera o seu aprovado', validar]];
  const linha = (t, validando) => '<tr class="clicavel" data-tarefa="' + t.id + '"><td><b>' + esc(t.titulo) + '</b>' + (t.clientes ? '<div class="sub">' + esc(t.clientes.nome) + '</div>' : '') + '</td>' +
    '<td>' + (t.recorrencia ? '<span class="pill aberto tf-repete">' + esc(typeof textoRepete === 'function' ? textoRepete(t) : '↻ ' + (REPETE[t.recorrencia] || t.recorrencia)) + '</span>' : '<span class="sub">—</span>') + '</td>' +
    '<td>' + (t.exige_revisao || validando ? '<span class="pill hoje">valida: ' + esc(t.revisor || '—') + '</span>' : '<span class="sub">—</span>') + '</td>' +
    '<td>' + (t.prazo ? '<span class="' + (t.prazo < h ? 'dias-r' : t.prazo === h ? 'dias-a' : '') + '">' + dataBR(t.prazo) + '</span>' : '—') + '</td>' +
    '<td class="acoes-l">' + (t._feita ? '<span class="pill pago rt-ciclo" title="Concluída em ' + esc(dataBR(String(t.concluida_em || t.prazo || '').slice(0, 10))) + '">✓ concluída neste ciclo' + (t._volta ? ' · volta em ' + dataBR(t._volta) : '') + '</span>' : validando ? '<button type="button" class="btn btn-v btn-mini" data-rt-ok="' + t.id + '">✓ Abrir e validar</button>'
      : '<button type="button" class="btn btn-v btn-mini" data-rt-concluir="' + t.id + '">' + (t.exige_revisao ? '✓ Concluir e enviar' : '✓ Concluir') + '</button>') + '</td></tr>';
  el.innerHTML = '<div class="card"><div class="card-hd">✓ Minhas tarefas<span class="sub">recorrentes voltam sozinhas; com validação vão para quem valida</span>' +
      '<span class="gd-hd-ac"><button type="button" class="btn btn-o btn-mini" id="rt-nova-rec">+ Tarefa recorrente</button><button type="button" class="btn btn-p btn-mini" id="rt-nova-t">+ Tarefa</button></span></div><div class="card-bd">' +
    sec.map(([tit, sub, L], k) => '<div class="rt-tsec"><div class="rt-tsec-tit">' + tit + ' <span class="pill neutro">' + L.length + '</span><span class="sub">' + sub + '</span></div>' +
      (L.length ? '<div class="tabela-wrap" data-sem-pagina><table class="rt-ttab"><thead><tr><th>Tarefa</th><th>Repete</th><th>Validação</th><th>Prazo</th><th></th></tr></thead><tbody>' + L.map((t) => linha(t, k === 3)).join('') + '</tbody></table></div>'
        : '<div class="sub" style="padding:4px 2px 10px">Nada aqui.</div>') + '</div>').join('') + '</div></div>';
  const rep = () => rotinaTarefas(el);
  $('rt-nova-t').onclick = () => formTarefa({}, rep);
  $('rt-nova-rec').onclick = () => formTarefa({ recorrencia_regra: { tipo: 'mensal', modo: 'dia', dia: Number(hojeISO().slice(8)), inicio: hojeISO() }, responsavel: (E.perfil && E.perfil.nome) || '' }, rep);
  el.querySelectorAll('[data-tarefa]').forEach((tr) => tr.onclick = (ev) => { if (ev.target.closest('button')) return; abrirTarefa(tr.dataset.tarefa, rep); });
  el.querySelectorAll('[data-rt-ok]').forEach((b) => b.onclick = () => abrirTarefa(b.dataset.rtOk, rep));
  el.querySelectorAll('[data-rt-concluir]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const t = T.find((x) => x.id === b.dataset.rtConcluir);
    if ((t.checklist || []).some((c) => !c.feito)) return abrirTarefa(t, rep);
    if (t.exige_revisao) { await q(sb.from('tarefas').update({ status: 'revisao' }).eq('id', t.id)); aviso('✓ Enviada para validação de ' + (t.revisor || 'quem valida') + '.'); }
    else { await concluirTarefa(t.id); aviso(t.recorrencia ? '✓ Concluída — ela volta sozinha ' + (t.recorrencia_regra ? textoRegra(t.recorrencia_regra).split(',')[0] : REPETE[t.recorrencia] || '') + '.' : '✓ Tarefa concluída.'); }
    await rep();
  }));
}

'use strict';
// ═══════════════════════════════════════════════════════════════════
// Backup 53 — EXECUÇÕES (cobrança ajuizada): o processo de execução, o que o CLIENTE já recebeu
// e o que fica para o ESCRITÓRIO (um % do que foi recebido). Cada recebimento lança sozinho, no
// Financeiro Jurídico, o honorário do escritório (gatilho execucao_recebimento_lanca no banco).
// ═══════════════════════════════════════════════════════════════════
const SITUACOES_EXEC = [['ativa', 'Em andamento', 'aberto'], ['acordo', 'Em acordo', 'hoje'], ['suspensa', 'Suspensa', 'neutro'], ['encerrada', 'Encerrada', 'pago']];
const FORMAS_RECEB = ['Alvará', 'Depósito judicial', 'Acordo', 'Penhora / Sisbajud', 'Pagamento direto', 'Outro'];
const pillSitExec = (s) => { const x = SITUACOES_EXEC.find((y) => y[0] === s) || SITUACOES_EXEC[0]; return '<span class="pill ' + x[2] + '">' + x[1] + '</span>'; };

TELAS.execucoes = async function () {
  await carregarCadastros();
  E.ex = E.ex || { sit: 'abertas', busca: '' };
  const F = E.ex, podeEd = pode('juridico', 'editar');
  $('conteudo').innerHTML = '<div class="titulo-pag"><div><h1>Execuções</h1><p>Cobranças ajuizadas: o processo, o que o cliente já recebeu e os honorários do escritório (% do recebido)</p></div>' +
    '<div class="acoes">' + botaoAtualizar('ex-atu', 'Busca de novo') + (podeEd ? '<button class="btn btn-p" id="ex-nova">+ Nova execução</button>' : '') + '</div></div>' +
    '<div id="ex-kpis"></div><div class="filtros"><div class="segmento" id="ex-sit">' + [['abertas', 'Em andamento'], ['encerrada', 'Encerradas'], ['todas', 'Todas']]
      .map(([v, r]) => '<button type="button" data-v="' + v + '"' + (F.sit === v ? ' class="ativo"' : '') + '>' + r + '</button>').join('') + '</div>' +
    '<input class="busca" id="ex-busca" placeholder="Buscar cliente, processo ou executado" autocomplete="off" value="' + esc(F.busca) + '"></div><div id="ex-corpo"><div class="carregando">Carregando…</div></div>';
  const [L, R] = await Promise.all([q(sb.from('execucoes').select('*').order('criado_em', { ascending: false })).catch(() => []),
    q(sb.from('execucao_recebimentos').select('id, execucao_id, data, valor, honorario, repassado_em, lancamento_id, lancamentos(pago)')).catch(() => [])]);
  const porEx = {}; R.forEach((r) => { (porEx[r.execucao_id] = porEx[r.execucao_id] || []).push(r); });
  const somaR = (id, k) => (porEx[id] || []).reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const nomeCli = (e) => (E.clientes.find((c) => c.id === e.cliente_id) || {}).nome || '—';
  const grupoDe = (e) => nomeGrupo(e.grupo_id || (E.clientes.find((c) => c.id === e.cliente_id) || {}).grupo_id) || '';
  const pintar = () => {
    const b = normalizar(F.busca);
    const ver = L.filter((e) => (F.sit === 'todas' || (F.sit === 'encerrada' ? e.situacao === 'encerrada' : e.situacao !== 'encerrada')) &&
      (!b || normalizar([nomeCli(e), e.numero, e.executado, grupoDe(e)].join(' ')).includes(b)))
      .sort((x, y) => (grupoDe(x) || '￿').localeCompare(grupoDe(y) || '￿', 'pt-BR') || nomeCli(x).localeCompare(nomeCli(y), 'pt-BR'));
    const abertas = L.filter((e) => e.situacao !== 'encerrada'), todosR = R;
    const honAberto = todosR.filter((r) => r.lancamento_id && !(r.lancamentos && r.lancamentos.pago)).reduce((s, r) => s + (Number(r.honorario) || 0), 0);
    $('ex-kpis').innerHTML = '<div class="kpis">' + kpi('Em andamento', String(abertas.length), '', plural(L.length, 'execução', 'execuções') + ' no total') +
      kpi('Valor executado', brl(abertas.reduce((s, e) => s + (Number(e.valor_execucao) || 0), 0)), '', 'das que estão em andamento') +
      kpi('Recebido pelos clientes', brl(todosR.reduce((s, r) => s + (Number(r.valor) || 0), 0)), 'verde', plural(todosR.length, 'recebimento', 'recebimentos')) +
      kpi('Honorários do escritório', brl(todosR.reduce((s, r) => s + (Number(r.honorario) || 0), 0)), '', honAberto ? brl(honAberto) + ' ainda a receber' : 'tudo recebido') + '</div>';
    const linhas = ver.map((e, i) => (i === 0 || grupoDe(ver[i - 1]) !== grupoDe(e) ? '<tr class="cli-grp"><td colspan="8">' + esc(grupoDe(e) || 'Sem grupo') + ' <span class="sub">' +
        plural(ver.filter((x) => grupoDe(x) === grupoDe(e)).length, 'execução', 'execuções') + '</span></td></tr>' : '') +
      '<tr class="clicavel cli-linha" tabindex="0" data-ex="' + e.id + '"><td><span class="cli-nome">' + esc(nomeCli(e)) + '</span></td><td class="mono">' + esc(e.numero || '—') + '</td><td>' + esc(e.executado || '—') + '</td>' +
      '<td class="col-valor">' + brl(e.valor_execucao) + '</td><td class="col-valor">' + brl(somaR(e.id, 'valor')) + '</td><td class="ex-pct">' + String(Number(e.percentual) || 0).replace('.', ',') + '%</td>' +
      '<td class="col-valor">' + brl(somaR(e.id, 'honorario')) + '</td><td>' + pillSitExec(e.situacao) + '</td></tr>');
    $('ex-corpo').innerHTML = '<div class="card">' + (ver.length ? '<div class="tabela-wrap"><table class="cli-tabela ex-tab"><thead><tr><th>Cliente</th><th>Processo</th><th>Executado</th><th>Valor da execução</th>' +
      '<th>Recebido pelo cliente</th><th>%</th><th>Honorários</th><th>Situação</th></tr></thead><tbody>' + linhas.join('') + '</tbody></table></div>'
      : L.length ? vazio('Nenhuma execução neste filtro.') : vazio('Nenhuma execução cadastrada. Cadastre a primeira cobrança ajuizada.', podeEd ? '+ Nova execução' : '', '#ex-nova')) + '</div>';
    $('ex-corpo').querySelectorAll('[data-ex]').forEach((tr) => { const abre = () => detalheExecucao(L.find((e) => e.id === tr.dataset.ex), porEx[tr.dataset.ex] || [], () => TELAS.execucoes());
      tr.onclick = abre; tr.onkeydown = (ev) => { if (ev.key === 'Enter') abre(); }; });
  };
  $('ex-sit').onclick = (ev) => { const b = ev.target.closest('button'); if (!b) return; F.sit = b.dataset.v; $('ex-sit').querySelectorAll('button').forEach((x) => x.classList.toggle('ativo', x === b)); pintar(); };
  let t; $('ex-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; pintar(); }, 250); };
  $('ex-atu').onclick = () => TELAS.execucoes();
  if ($('ex-nova')) $('ex-nova').onclick = () => formExecucao({}, () => TELAS.execucoes());
  pintar();
};

function formExecucao(e, depois) {
  e = e || {}; const novo = !e.id;
  const j = abrirJanela({ titulo: novo ? '+ Nova execução' : '✎ Editar execução', larga: true,
    corpo: '<form class="grade" id="f-exec">' +
      campo('Cliente (quem cobra) <span class="obrig">*</span>', '<select name="cliente_id">' + opcoesClientes(e.cliente_id || '').replace('— sem cliente —', 'Escolha o cliente') + '</select>', 'inteiro') +
      campo('Nº do processo', '<input name="numero" maxlength="40" placeholder="0000000-00.0000.0.00.0000" value="' + esc(e.numero || '') + '">') +
      campo('Executado (devedor)', '<input name="executado" maxlength="200" value="' + esc(e.executado || '') + '">') +
      campo('Valor da execução (R$)', '<input name="valor_execucao" data-mascara="brl" inputmode="decimal" value="' + (e.valor_execucao ? valorParaCampo(e.valor_execucao) : '') + '">') +
      campo('% do escritório sobre o que for recebido', '<input name="percentual" inputmode="decimal" placeholder="Ex.: 20" value="' + (e.percentual != null ? esc(String(e.percentual).replace('.', ',')) : '') + '">') +
      campo('Ajuizada em', '<input name="ajuizada_em" type="date" value="' + esc(e.ajuizada_em || '') + '">') +
      campo('Situação', '<select name="situacao">' + SITUACOES_EXEC.map(([v, r]) => '<option value="' + v + '"' + ((e.situacao || 'ativa') === v ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>') +
      campo('Responsável', selectPessoa('responsavel', e.responsavel || '', '— escolha —')) +
      campo('Observação', '<textarea name="obs" maxlength="2000">' + esc(e.obs || '') + '</textarea>', 'inteiro') +
      '<div class="dica inteiro">A cada recebimento registrado, o honorário do escritório (o % acima sobre o valor recebido) entra sozinho em Financeiro → Jurídico.</div></form>',
    rodape: (!novo && E.perfil && E.perfil.papel === 'admin' ? '<button class="btn btn-x" type="button" id="ex-apagar">Excluir</button>' : '<span></span>') +
      '<div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="ex-salvar">' + (novo ? 'Cadastrar' : 'Salvar') + '</button></div>' });
  const f = j.querySelector('#f-exec');
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  const ap = j.querySelector('#ex-apagar');
  if (ap) ap.onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!confirm('Excluir esta execução e os recebimentos dela? Os honorários ainda não pagos também saem do Financeiro.')) return;
    await q(sb.from('execucoes').delete().eq('id', e.id)); aviso('Execução excluída.'); fecharJanela(j); fecharJanela(); if (depois) await depois(); });
  j.querySelector('#ex-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.cliente_id.value) throw new Error('Escolha o cliente.');
    const pct = f.percentual.value.trim() ? lerValor(f.percentual.value) : 0, v = f.valor_execucao.value.trim() ? lerValor(f.valor_execucao.value) : 0;
    if (isNaN(pct) || pct < 0 || pct > 100) throw new Error('O % do escritório deve ficar entre 0 e 100.');
    if (isNaN(v) || v < 0) throw new Error('Valor da execução inválido (ex.: 25.000,00).');
    const cli = E.clientes.find((c) => c.id === f.cliente_id.value) || {};
    const d = { cliente_id: f.cliente_id.value, grupo_id: cli.grupo_id || null, numero: f.numero.value.trim(), executado: f.executado.value.trim(), valor_execucao: v, percentual: pct,
      ajuizada_em: f.ajuizada_em.value || null, situacao: f.situacao.value, responsavel: f.responsavel.value || cli.responsavel || '', obs: f.obs.value.trim() };
    if (novo) await q(sb.from('execucoes').insert(d)); else await q(sb.from('execucoes').update(d).eq('id', e.id));
    aviso(novo ? '✓ Execução cadastrada.' : '✓ Execução atualizada.'); fecharJanela(j); if (!novo) fecharJanela(); if (depois) await depois();
  });
  return j;
}

function detalheExecucao(e, recs, depois) {
  if (!e) return;
  const podeEd = pode('juridico', 'editar'), cli = E.clientes.find((c) => c.id === e.cliente_id) || {};
  const tot = recs.reduce((s, r) => s + (Number(r.valor) || 0), 0), hon = recs.reduce((s, r) => s + (Number(r.honorario) || 0), 0);
  const ord = recs.slice().sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const j = abrirJanela({ titulo: 'Execução ' + (e.numero || '') + ' — ' + (cli.nome || ''), larga: true,
    corpo: '<div class="ficha-sub" style="margin-bottom:10px">' + [esc(cli.nome || '—'), e.executado ? 'contra <b>' + esc(e.executado) + '</b>' : '', e.ajuizada_em ? 'ajuizada em ' + dataBR(e.ajuizada_em) : '', pillSitExec(e.situacao)].filter(Boolean).join(' · ') + '</div>' +
      '<div class="kpis">' + kpi('Valor da execução', brl(e.valor_execucao), '', '') + kpi('Recebido pelo cliente', brl(tot), 'verde', plural(recs.length, 'recebimento', 'recebimentos')) +
        kpi('Falta receber', brl(Math.max(0, (Number(e.valor_execucao) || 0) - tot)), 'ambar', '') + kpi('Honorários do escritório', brl(hon), '', String(Number(e.percentual) || 0).replace('.', ',') + '% do recebido') + '</div>' +
      (e.obs ? '<div class="dica" style="margin-bottom:10px">' + esc(e.obs) + '</div>' : '') +
      '<div class="card" style="margin:0"><div class="card-hd">Recebimentos' + (podeEd ? '<span class="gd-hd-ac"><button class="btn btn-p btn-mini" type="button" id="ex-receb">+ Registrar recebimento</button></span>' : '') + '</div>' +
      (ord.length ? '<div class="tabela-wrap"><table><thead><tr><th>Data</th><th>Recebido pelo cliente</th><th>Honorários do escritório</th><th>No Financeiro</th><th>Repassado ao cliente</th><th></th></tr></thead><tbody>' +
        ord.map((r) => '<tr><td>' + dataBR(r.data) + '</td><td class="col-valor">' + brl(r.valor) + '</td><td class="col-valor">' + brl(r.honorario) + '</td>' +
          '<td>' + (r.lancamento_id ? (r.lancamentos && r.lancamentos.pago ? '<span class="pill pago">recebido</span>' : '<span class="pill aberto">a receber</span>') : '<span class="sub">—</span>') + '</td>' +
          '<td>' + (r.repassado_em ? dataBR(r.repassado_em) : '<span class="sub">—</span>') + '</td>' +
          '<td class="acoes-l">' + (podeEd ? '<button class="btn btn-x btn-mini" type="button" data-exr-apagar="' + r.id + '" title="Apagar o recebimento (e o honorário ainda não pago)">✕</button>' : '') + '</td></tr>').join('') + '</tbody></table></div>'
        : '<div class="card-bd">' + vazio('Nenhum recebimento ainda.') + '</div>') + '</div>' +
      // Backup 54: contatos de quem não é cliente (executado, advogado da outra parte, cartório…)
      '<div class="card ex-contatos" style="margin:10px 0 0"><div class="card-hd">📇 Contatos (não clientes)' + (podeEd ? '<span class="gd-hd-ac"><button class="btn btn-o btn-mini" type="button" id="ex-contato-novo">+ Contato</button></span>' : '') +
        '</div><div id="ex-contatos-l"><div class="card-bd"><span class="sub">Carregando…</span></div></div></div>',
    rodape: '<span class="sub">Cada recebimento lança o honorário em Financeiro → Jurídico</span><div class="acoes">' + (podeEd ? '<button class="btn btn-o" type="button" id="ex-editar">✎ Editar execução</button>' : '') + '</div>' });
  const re = async () => { fecharJanela(j); if (depois) await depois(); };
  const ed = j.querySelector('#ex-editar'); if (ed) ed.onclick = () => formExecucao(e, depois);
  const rb = j.querySelector('#ex-receb'); if (rb) rb.onclick = () => formRecebimentoExec(e, re);
  pintarContatosExec(j, e, podeEd);
  const cn = j.querySelector('#ex-contato-novo'); if (cn) cn.onclick = () => formContatoExec(e, {}, () => pintarContatosExec(j, e, podeEd));
  j.querySelectorAll('[data-exr-apagar]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    if (!confirm('Apagar este recebimento? O honorário dele sai do Financeiro se ainda não foi pago.')) return;
    await q(sb.from('execucao_recebimentos').delete().eq('id', b.dataset.exrApagar)); aviso('Recebimento apagado.'); await re(); }));
  return j;
}

function formRecebimentoExec(e, depois) {
  const pct = Number(e.percentual) || 0;
  const j = abrirJanela({ titulo: '+ Recebimento — execução ' + (e.numero || ''),
    corpo: '<form class="grade" id="f-exr">' + campo('Data', '<input name="data" type="date" value="' + hojeISO() + '">') +
      campo('Valor recebido pelo cliente (R$) <span class="obrig">*</span>', '<input name="valor" data-mascara="brl" inputmode="decimal" placeholder="0,00">') +
      campo('Como foi recebido', '<select name="forma">' + FORMAS_RECEB.map((x) => '<option>' + x + '</option>').join('') + '</select>') +
      campo('Repassado ao cliente em', '<input name="repassado_em" type="date">') +
      campo('Honorários do escritório (R$)', '<input name="honorario" data-mascara="brl" inputmode="decimal" placeholder="calculado: ' + String(pct).replace('.', ',') + '%">') +
      campo('Observação', '<input name="obs" maxlength="300">') +
      '<div class="dica inteiro" id="exr-previa">Informe o valor para ver o honorário.</div></form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="exr-ok">Registrar</button></div>' });
  const f = j.querySelector('#f-exr');
  const previa = () => { const v = lerValor(f.valor.value), h = f.honorario.value.trim() ? lerValor(f.honorario.value) : Math.round((v || 0) * pct) / 100;
    j.querySelector('#exr-previa').innerHTML = v > 0 ? 'Entra em Financeiro → Jurídico um honorário de <b class="mono">' + brl(h) + '</b>' + (f.honorario.value.trim() ? '' : ' (' + String(pct).replace('.', ',') + '% de ' + brl(v) + ')') + ', com vencimento em ' + dataBR(f.data.value || hojeISO()) + '.' : 'Informe o valor para ver o honorário.'; };
  ['input', 'change'].forEach((x) => f.addEventListener(x, previa));
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#exr-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const v = lerValor(f.valor.value); if (!(v > 0)) throw new Error('Informe o valor recebido (ex.: 5.000,00).');
    const h = f.honorario.value.trim() ? lerValor(f.honorario.value) : null; if (h != null && (isNaN(h) || h < 0)) throw new Error('Honorário inválido.');
    await q(sb.from('execucao_recebimentos').insert({ execucao_id: e.id, data: f.data.value || hojeISO(), valor: v, forma: f.forma.value, repassado_em: f.repassado_em.value || null, honorario: h, obs: f.obs.value.trim() }));
    aviso('✓ Recebimento registrado e honorário lançado no Financeiro.'); fecharJanela(j); if (depois) await depois();
  });
  return j;
}

// Backup 54: "+ Lançar → Recebimento de execução" — escolher a execução e registrar o recebimento (o honorário entra sozinho no Financeiro)
async function escolherExecucaoReceb(depois) {
  if (!E.clientes.length) await carregarCadastros();
  const L = (await q(sb.from('execucoes').select('*').neq('situacao', 'encerrada').order('criado_em', { ascending: false })).catch(() => []));
  if (!L.length) return aviso('Nenhuma execução em andamento. Cadastre em Jurídico → Execuções.', true);
  const nome = (e) => ((E.clientes.find((c) => c.id === e.cliente_id) || {}).nome || '—') + ' × ' + (e.executado || '—') + (e.numero ? ' · ' + e.numero : '');
  const j = abrirJanela({ titulo: '+ Recebimento de execução', corpo: '<div class="grade">' + campo('Execução', '<select id="exs-sel">' + L.map((e) => '<option value="' + e.id + '">' + esc(nome(e)) + '</option>').join('') + '</select>', 'inteiro') + '</div>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="exs-ok">Continuar</button></div>' });
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#exs-ok').onclick = () => { const e = L.find((x) => x.id === j.querySelector('#exs-sel').value); fecharJanela(j); formRecebimentoExec(e, depois); };
  return j;
}

// Backup 54: contatos das execuções (pessoas que NÃO são clientes) — nome, papel, telefone (liga/WhatsApp), e-mail, endereço
const PAPEIS_CONTATO_EXEC = ['Executado', 'Sócio do executado', 'Advogado da outra parte', 'Cartório / secretaria', 'Oficial de justiça', 'Perito', 'Testemunha', 'Outro'];
async function pintarContatosExec(j, e, podeEd) {
  const alvo = j.querySelector('#ex-contatos-l'); if (!alvo) return;
  const lista = await q(sb.from('execucao_contatos').select('*').eq('execucao_id', e.id).order('nome')).catch(() => []);
  const zap = (t) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 10 ? 'https://wa.me/' + (d.length <= 11 ? '55' : '') + d : ''; };
  alvo.innerHTML = lista.length ? '<div class="tabela-wrap"><table class="ex-ct-tab"><thead><tr><th>Nome</th><th>Papel</th><th>Telefone</th><th>E-mail</th><th>Endereço</th><th></th></tr></thead><tbody>' +
    lista.map((c) => '<tr' + (podeEd ? ' class="clicavel" data-exc-linha="' + c.id + '" title="Clique para editar"' : '') + '><td><b>' + esc(c.nome) + '</b>' + (c.obs ? '<div class="sub">' + esc(c.obs) + '</div>' : '') + '</td><td>' + esc(c.papel || '—') + '</td>' +
      '<td>' + (c.telefone ? '<a href="tel:' + esc(c.telefone.replace(/[^\d+]/g, '')) + '">' + esc(c.telefone) + '</a>' + (zap(c.telefone) ? ' <a href="' + zap(c.telefone) + '" target="_blank" rel="noopener" title="WhatsApp">💬</a>' : '') : '<span class="sub">—</span>') + '</td>' +
      '<td>' + (c.email ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '<span class="sub">—</span>') + '</td><td>' + (esc(c.endereco) || '<span class="sub">—</span>') + '</td>' +
      '<td class="acoes-l">' + (podeEd ? '<button class="btn btn-x btn-mini" type="button" data-exc-apagar="' + c.id + '" title="Apagar">✕</button>' : '') + '</td></tr>').join('') +
    '</tbody></table></div>' : '<div class="card-bd">' + vazio('Nenhum contato. Guarde aqui telefone e endereço do executado, do advogado da outra parte, do cartório…') + '</div>';
  alvo.querySelectorAll('tr[data-exc-linha]').forEach((tr) => tr.onclick = (ev) => { if (ev.target.closest('button, a')) return;   // Backup 58: a linha edita (sem ✎)
    formContatoExec(e, lista.find((c) => c.id === tr.dataset.excLinha), () => pintarContatosExec(j, e, podeEd)); });
  alvo.querySelectorAll('[data-exc-apagar]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    if (!confirm('Apagar este contato?')) return;
    await q(sb.from('execucao_contatos').delete().eq('id', b.dataset.excApagar)); aviso('Contato apagado.'); pintarContatosExec(j, e, podeEd); }));
}
function formContatoExec(e, c, depois) {
  c = c || {};
  const j = abrirJanela({ titulo: (c.id ? '✎ Contato' : '+ Contato') + ' — execução ' + (e.numero || ''),
    corpo: '<form class="grade" id="f-exc">' + campo('Nome <span class="obrig">*</span>', '<input name="nome" maxlength="160" value="' + esc(c.nome || '') + '">') +
      campo('Papel', '<select name="papel">' + PAPEIS_CONTATO_EXEC.map((x) => '<option' + (c.papel === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select>') +
      campo('Telefone', '<input name="telefone" value="' + esc(c.telefone || '') + '" placeholder="(31) 99999-9999">') +
      campo('E-mail', '<input name="email" type="email" value="' + esc(c.email || '') + '">') +
      campo('Endereço', '<input name="endereco" maxlength="300" value="' + esc(c.endereco || '') + '">', 'inteiro') +
      campo('Observação', '<input name="obs" maxlength="300" value="' + esc(c.obs || '') + '" placeholder="ex.: ligar depois das 14h">', 'inteiro') + '</form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="exc-ok">Salvar</button></div>' });
  const f = j.querySelector('#f-exc');
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#exc-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const d = { execucao_id: e.id }; ['nome', 'papel', 'telefone', 'email', 'endereco', 'obs'].forEach((k) => { d[k] = f[k].value.trim(); });
    if (!d.nome) throw new Error('Informe o nome do contato.');
    if (c.id) await q(sb.from('execucao_contatos').update(d).eq('id', c.id)); else await q(sb.from('execucao_contatos').insert(d));
    fecharJanela(j); aviso('✓ Contato salvo.'); if (depois) await depois();
  });
}


// ═══════════════════════════════════════════════════════════════════════════
// PARCELAMENTOS — tela refeita (reforma, etapa 3 — Backup 68)
// Igual ao ambiente de teste aprovado (sistema/prototipos/ambiente-teste/telas-1.js):
// 1) cartões que abrem o detalhamento; 2) situação por cliente (um cartão por grupo → lista dos parcelamentos);
// 3) parcelas em abas Em atraso / A vencer / Pagas, com busca, listas, Filtros (vencimento e valor), ordenar, total e média,
//    marcar várias para dar baixa ou marcar guias como emitidas. Toda baixa pede confirmação e tem "Desfazer".
// Os dados vêm do próprio ERP (DB.parcelamentos, já carregado); no Gestão avulso (testes) são lidos direto do banco.
// Editar/criar parcelamento usa o formulário do ERP (gerar parcelas, excluir, histórico) — nenhuma função foi tirada.
// ═══════════════════════════════════════════════════════════════════════════

const ED_P = () => window.ERP_EDITOR || null;
const doMesP = (iso) => !!iso && iso.slice(0, 7) === hojeISO().slice(0, 7);
// E3: cada grupo com uma cor fixa (a mesma em todas as telas)
function corGrupo(nome) { let h = 0; String(nome || '').split('').forEach((c) => { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return 'var(--chart-' + (1 + (h % 8)) + ')'; }
function grupoTxtB(nome) { return '<span class="b-gtx"><span class="b-ponto" style="background:' + corGrupo(nome) + '"></span>' + esc(nome || 'Sem grupo') + '</span>'; }
function empresaB(nome, docx) { return '<span class="b-emp">' + esc(nome || '—') + '</span>' + (docx ? '<span class="b-doc">' + esc(docx) + '</span>' : ''); }
const brIso = (br) => { const m = String(br || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? m[3] + '-' + m[2] + '-' + m[1] : (/^\d{4}-\d{2}-\d{2}/.test(String(br || '')) ? String(br).slice(0, 10) : ''); };
const dbParc = () => { try { return (typeof DB !== 'undefined' && DB) || window.DB || null; } catch (e) { return window.DB || null; } }; // eslint-disable-line no-undef

// ── dados: o mesmo formato venha do ERP ou do banco ──
function paDoERP(p) {
  const pa = { id: p._id, grupo: p.grupoNome || p.aba || '', grupoId: p.grupoId || '', empresa: p.empresa || '', cnpj: p.cnpj || '', local: p.local || '', natureza: p.natureza || '', numero: p.numero || '',
    tot: Number(p.totalParcelas) || 0, pagas: Number(p.parcelasPagas) || 0, vparc: Number(p.valorUltimaParcela) || 0, emitimos: p.emitimosGuia !== false, obs: p.obs || '', _orig: p };
  pa.parcelas = (p.parcelas || []).map((x) => ({ id: x._id, pa, n: x.numero || '', venc: x.vencIso || brIso(x.vencimento), pago: x.pagamento === 'SIM', pagoEm: x.pagoEm || '',
    emitida: x.emitidaIso || brIso(x.emitidaEm), valor: Number(x.valor) || pa.vparc, lancado: !!x.valorLancado, _orig: x }));
  return pa;
}
async function paDoBanco() {
  const [pas, ps] = await Promise.all([buscarTodos(() => sb.from('parcelamentos').select('*, grupos(nome)')), buscarTodos(() => sb.from('parcelas').select('*'))]);
  const por = {}; ps.forEach((x) => { (por[x.parcelamento_id] = por[x.parcelamento_id] || []).push(x); });
  return pas.map((p) => {
    const L = (por[p.id] || []).sort((a, b) => String(a.vencimento || '').localeCompare(String(b.vencimento || '')));
    let ult = null;
    const pa = { id: p.id, grupo: (p.grupos && p.grupos.nome) || p.aba || '', grupoId: p.grupo_id || '', empresa: p.empresa || '', cnpj: mascaraDoc(p.cnpj || ''), local: p.local || '', natureza: p.natureza || '', numero: p.numero || '',
      tot: Number(p.total_parcelas) || L.length, pagas: L.filter((x) => x.pago).length, vparc: Number(p.valor_ultima_parcela) || 0, emitimos: p.emitimos_guia !== false, obs: p.obs || '' };
    pa.parcelas = L.map((x) => { if (x.valor != null && Number(x.valor) > 0) ult = Number(x.valor);
      return { id: x.id, pa, n: x.numero || '', venc: x.vencimento || '', pago: !!x.pago, pagoEm: x.data_pagamento || '', emitida: x.emitida_em || '', valor: ult != null ? ult : pa.vparc, lancado: x.valor != null && Number(x.valor) > 0 }; });
    return pa;
  });
}
async function dadosParcelamentos() {
  const D = dbParc();
  if (D && Array.isArray(D.parcelamentos)) return D.parcelamentos.map(paDoERP);
  return paDoBanco();
}
// números de um parcelamento
function resumoPa(pa) {
  const h = hojeISO(), L = pa.parcelas;
  const atr = L.filter((x) => !x.pago && x.venc && x.venc <= h);
  const abertas = L.filter((x) => !x.pago);
  const prox = abertas.filter((x) => x.venc > h).sort((a, b) => a.venc.localeCompare(b.venc))[0] || null;
  const vAtual = (L.length ? L[L.length - 1].valor : 0) || pa.vparc;
  const falta = Math.max(0, pa.tot - pa.pagas) * vAtual;
  return { atr: atr.length, valorAtr: atr.reduce((s, x) => s + x.valor, 0), prox, quitado: pa.pagas * vAtual, falta, concluido: pa.tot > 0 && pa.pagas >= pa.tot, pc: pa.tot ? Math.round(pa.pagas / pa.tot * 100) : 0,
    mes: abertas.filter((x) => x.venc && (x.venc <= h || doMesP(x.venc))) };
}
const estadoParc = (x) => (x.pago ? 'pagas' : x.venc && x.venc <= hojeISO() ? 'atraso' : 'avencer');
const paraEmitirP = (x) => x.pa.emitimos && !x.pago && !x.emitida && !!x.venc && (x.venc <= hojeISO() || doMesP(x.venc));

// ── células e colunas (as mesmas em todas as listas de parcelas) ──
function celEmissaoP(x, comBotao) {
  if (!x.pa.emitimos) return '<span class="b-em">Cliente emite</span>';
  if (x.emitida) return '<span class="b-em b-em-ok">✓ Emitida ' + dataBR(x.emitida).slice(0, 5) + '</span>';
  if (x.pago) return '<span class="b-em">—</span>';
  return comBotao && pode('juridico', 'editar') && x.venc && (x.venc <= hojeISO() || doMesP(x.venc)) ? '<button type="button" class="b-emitir" data-pc-emitir="' + esc(x.id) + '">' + iconeB('documento') + 'Emitir</button>' : '<span class="b-em">Não emitida</span>';
}
function celBaixaP(x) {
  if (x.pago) return '<span class="b-ok-txt">✓ ' + (x.pagoEm ? 'Pago em ' + dataBR(x.pagoEm).slice(0, 5) : 'Pago') + '</span>';
  return pode('juridico', 'editar') ? '<button type="button" class="b-baixa" data-pc-baixa="' + esc(x.id) + '">' + iconeB('check') + 'Baixa</button>' : '<span class="b-em">Em aberto</span>';
}
function colunasParcelas(o) {
  o = o || {};
  const C = [];
  if (!o.semGrupo) C.push({ k: 'g', rot: 'Grupo', html: (x) => grupoTxtB(x.pa.grupo), ord: (x) => normalizar(x.pa.grupo) });
  C.push({ k: 'emp', rot: 'Empresa', html: (x) => empresaB(x.pa.empresa, x.pa.cnpj), ord: (x) => normalizar(x.pa.empresa) });
  C.push({ k: 'plat', rot: 'Plataforma', html: (x) => '<span class="b-plat">' + esc(x.pa.local || '—') + '</span>', ord: (x) => x.pa.local });
  C.push({ k: 'nat', rot: 'Natureza', html: (x) => esc(x.pa.natureza || '—'), ord: (x) => x.pa.natureza });
  if (!o.semNum) C.push({ k: 'num', rot: 'Nº parcelamento', cls: 'b-num', html: (x) => esc(x.pa.numero || '—'), ord: (x) => x.pa.numero });
  C.push({ k: 'n', rot: 'Parcela', cls: 'b-data', html: (x) => esc(x.n) + (x.pa.tot ? ' de ' + x.pa.tot : ''), ord: (x) => Number(x.n) || 0 });
  C.push({ k: 'v', rot: 'Valor', cls: 'b-dir b-val', soma: true, html: (x) => brl(x.valor), ord: (x) => x.valor });
  C.push({ k: 'venc', rot: 'Vencimento', cls: 'b-cen b-data', clsL: (x) => vencB(x.venc, x.pago).cls, html: (x) => vencB(x.venc, x.pago).html, ord: (x) => x.venc || '9' });
  if (o.emissao) C.push({ k: 'em', rot: 'Guia', cls: 'b-cen', html: (x) => celEmissaoP(x, true), ord: (x) => x.emitida || '' });
  if (!o.semBaixa) C.push({ k: 'pago', rot: 'Baixa', cls: 'b-cen', html: celBaixaP, ord: (x) => x.pagoEm || (x.pago ? '1' : '') });
  return C;
}
function listasParcelas(T) {
  const uniq = (f) => [...new Set(T.map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((v) => [v, v]);
  return [{ k: 'g', rot: 'Grupo', todos: 'Todos os grupos', opcoes: uniq((x) => x.pa.grupo), get: (x) => x.pa.grupo },
    { k: 'plat', rot: 'Plataforma', todos: 'Todas as plataformas', opcoes: uniq((x) => x.pa.local), get: (x) => x.pa.local },
    { k: 'nat', rot: 'Natureza', todos: 'Todas as naturezas', opcoes: uniq((x) => x.pa.natureza), get: (x) => x.pa.natureza }];
}
const buscaParc = (x) => x.pa.empresa + ' ' + x.pa.cnpj + ' ' + soDigitos(x.pa.cnpj) + ' ' + x.pa.numero + ' ' + x.pa.grupo + ' ' + x.pa.natureza;

// ═════════ TELA ═════════
TELAS.parcelamentos = async function () {
  E.pc = E.pc || { grupo: '', chip: 'todos' };
  const el0 = $('conteudo');
  // o que mudou em outra tela (baixa na Rotina, por exemplo): relê só esses parcelamentos antes de desenhar
  const sujo = window.ERP_SUJO && window.ERP_SUJO.parcelamentos;
  if (sujo && typeof window.ERP_RECARREGAR_PARCELAMENTOS === 'function') { window.ERP_SUJO = null; try { await window.ERP_RECARREGAR_PARCELAMENTOS(sujo); } catch (e) { console.warn('[Parcelamentos] recarregar:', e.message); } }
  const PA = await dadosParcelamentos();
  if (!el0.isConnected) return;
  E.pc.PA = PA;
  pintarParcelamentos();
};
TELAS.parcelamentos.semCadastros = true;   // os dados vêm do ERP (DB.parcelamentos); a lista de clientes não é usada aqui
function pintarParcelamentos() {
  const el = $('conteudo'); if (!el) return;
  const PA = E.pc.PA || [], T = [].concat(...PA.map((pa) => pa.parcelas)), h = hojeISO(), podeEd = pode('juridico', 'editar');
  const atr = T.filter((x) => estadoParc(x) === 'atraso'), hoje = atr.filter((x) => x.venc === h);
  const mes = T.filter((x) => !x.pago && doMesP(x.venc));
  const guiasMes = T.filter((x) => x.pa.emitimos && !x.pago && x.venc && (x.venc <= h || doMesP(x.venc))), emit = guiasMes.filter((x) => x.emitida);
  const R = PA.map((pa) => [pa, resumoPa(pa)]), ativos = R.filter(([, r]) => !r.concluido);
  const pago = ativos.reduce((s, [, r]) => s + r.quitado, 0), falta = ativos.reduce((s, [, r]) => s + r.falta, 0);
  const soma = (l) => l.reduce((s, x) => s + x.valor, 0);
  el.innerHTML = cabecalhoTela({ icone: 'camadas', titulo: 'Parcelamentos', frase: 'Parcelas dos clientes no e-CAC, Regularize e SIARE, por vencimento', atualizar: 'pc-atualizar', botao: podeEd ? { id: 'pc-novo', rotulo: 'Novo parcelamento' } : null }) +
    '<div id="pc-cartoes"></div>' +
    '<div class="b-sec"><div><h2>Situação dos parcelamentos por cliente</h2><p>Quanto cada grupo já pagou, quanto falta e o que vence este mês. Clique no cartão para ver cada parcelamento.</p></div><div class="b-chips" id="pc-chips">' +
    [['todos', 'Todos'], ['atraso', 'Com atraso'], ['risco', 'Risco de rescisão'], ['dia', 'Em dia'], ['concluidos', 'Concluídos']].map((c) => '<button type="button" class="b-chip" data-pc-chip="' + c[0] + '" aria-pressed="' + (E.pc.chip === c[0]) + '">' + c[1] + '</button>').join('') + '</div></div>' +
    '<div class="b-cards" id="pc-grupos"></div>' +
    '<div class="b-sec"><div><h2>Parcelas</h2></div></div><div id="pc-tabela"></div>';
  const bt = $('pc-novo'); if (bt) bt.onclick = () => { const ED = ED_P(); if (ED && ED.abrirParcelamento) ED.abrirParcelamento(null); else aviso('Abra pelo ERP: + Lançar → Parcelamento.', true); };
  $('pc-atualizar').onclick = () => { if (window.ERP_RECARREGAR_MODULOS) window.ERP_RECARREGAR_MODULOS('parcelamentos').then(() => TELAS.parcelamentos()); else TELAS.parcelamentos(); };
  const det = (id, titulo, linhas, o) => (c) => tabelaB(c, Object.assign({ id, titulo, linhas, colunas: colunasParcelas(o), unidade: ['parcela', 'parcelas'], busca: buscaParc, valor: (x) => x.valor, venc: (x) => x.venc,
    ord: { k: 'venc', dir: 1 }, clique: janelaParcela, lote: lotesParcelas(), altura: '440px' }, o && o.cfg));
  cartoesB($('pc-cartoes'), 'parcelamentos', [
    { id: 'atr', cor: 'r', icone: 'alerta', rotulo: 'Parcelas em atraso', valor: String(atr.length), sub: brl(soma(atr)) + ' somadas · ' + plural(hoje.length, 'vence', 'vencem') + ' hoje', det: det('pc-d-atr', 'Parcelas em atraso (inclui as que vencem hoje)', atr, { semNum: true }) },
    { id: 'mes', cor: 'b', icone: 'calendario', rotulo: 'Vencem este mês', valor: String(mes.length), comp: '· ' + brl(soma(mes)) + ' no mês', sub: 'Emitir as guias até <b>dia 12</b>', det: det('pc-d-mes', 'Vencem em ' + nomeMes(new Date()), mes, { semNum: true, emissao: true }) },
    { id: 'guias', cor: 'a', icone: 'documento', rotulo: 'Guias a emitir', valor: String(guiasMes.length - emit.length), comp: 'de ' + guiasMes.length, barra: guiasMes.length ? emit.length / guiasMes.length * 100 : 100,
      sub: emit.length + ' já emitidas · prazo <b>dia 12</b>', det: det('pc-d-guias', 'Guias a emitir (vencidas e do mês)', guiasMes.filter((x) => !x.emitida), { semNum: true, emissao: true, semBaixa: true }) },
    { id: 'quit', cor: 'g', icone: 'pizza', rotulo: 'Quitado / falta', linhas: [[brl(pago), 'já pago', true], [brl(falta), 'falta pagar']], barra: pago + falta ? pago / (pago + falta) * 100 : 0,
      sub: (pago + falta ? Math.round(pago / (pago + falta) * 100) : 0) + '% do total dos parcelamentos em andamento', det: (c) => {
        const G = {}; ativos.forEach(([pa, r]) => { const g = G[pa.grupo] = G[pa.grupo] || { id: pa.grupo, nome: pa.grupo, n: 0, pago: 0, falta: 0 }; g.n++; g.pago += r.quitado; g.falta += r.falta; });
        tabelaB(c, { id: 'pc-d-quit', titulo: 'Quitado e falta, por grupo', linhas: Object.values(G), unidade: ['grupo', 'grupos'], valor: (g) => g.falta, ord: { k: 'falta', dir: -1 }, chave: (g) => g.id,
          colunas: [{ k: 'g', rot: 'Grupo', html: (g) => grupoTxtB(g.nome), ord: (g) => normalizar(g.nome) }, { k: 'n', rot: 'Parcelamentos', cls: 'b-cen b-data', html: (g) => g.n, ord: (g) => g.n },
            { k: 'pago', rot: 'Já pago', cls: 'b-dir b-val', html: (g) => '<span class="b-verde">' + brl(g.pago) + '</span>', ord: (g) => g.pago }, { k: 'falta', rot: 'Falta pagar', cls: 'b-dir b-val', soma: true, html: (g) => brl(g.falta), ord: (g) => g.falta },
            { k: 'pc', rot: 'Quitado', html: (g) => { const p = g.pago + g.falta ? Math.round(g.pago / (g.pago + g.falta) * 100) : 0; return '<div class="b-prog"><div class="b-barra"><span style="width:' + p + '%"></span></div><span>' + p + '%</span></div>'; }, ord: (g) => g.pago / ((g.pago + g.falta) || 1) }],
          clique: (g) => { E.pc.grupo = g.id; desenharGruposPc(); const x = $('pc-grupos'); if (x) x.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
      } }
  ]);
  desenharGruposPc();
  $('pc-chips').onclick = (ev) => { const b = ev.target.closest('[data-pc-chip]'); if (!b) return; E.pc.chip = b.dataset.pcChip; $('pc-chips').querySelectorAll('.b-chip').forEach((x) => x.setAttribute('aria-pressed', x === b)); desenharGruposPc(); };
  tabelaB($('pc-tabela'), { id: 'parcelas', linhas: T, colunas: colunasParcelas(), unidade: ['parcela', 'parcelas'], dicaBusca: 'Empresa, CNPJ ou nº',
    titulo: (a) => ({ atraso: 'Parcelas em atraso (inclui as que vencem hoje)', avencer: 'Parcelas a vencer', pagas: 'Parcelas pagas' }[a]),
    abas: [{ id: 'atraso', rot: 'Em atraso', cor: 'r', f: (x) => estadoParc(x) === 'atraso' }, { id: 'avencer', rot: 'A vencer', f: (x) => estadoParc(x) === 'avencer' }, { id: 'pagas', rot: 'Pagas', f: (x) => x.pago }],
    ordAbas: { atraso: { k: 'venc', dir: 1 }, avencer: { k: 'venc', dir: 1 }, pagas: { k: 'pago', dir: -1 } }, ord: { k: 'venc', dir: 1 },
    busca: buscaParc, listas: listasParcelas(T), venc: (x) => x.venc, valor: (x) => x.valor, lote: lotesParcelas(), clique: janelaParcela,
    vazio: { titulo: 'Nenhuma parcela aqui', frase: 'Quando houver parcelas nesta situação, elas aparecem nesta lista.' } });
}

// ── situação por cliente: um cartão por grupo; clicou → a lista dos parcelamentos do grupo ──
function desenharGruposPc() {
  const el = $('pc-grupos'); if (!el) return;
  const PA = E.pc.PA || [], G = {};
  PA.forEach((pa) => { const r = resumoPa(pa), k = pa.grupo || pa.empresa; const g = G[k] = G[k] || { id: k, nome: k, itens: [] }; g.itens.push([pa, r]); });
  const chip = E.pc.chip, grupos = Object.values(G).map((g) => {
    const vivos = g.itens.filter(([, r]) => !r.concluido), conc = g.itens.filter(([, r]) => r.concluido);
    let pg = 0, tot = 0, falta = 0, atr = 0, risco = false, nMes = 0, somaMes = 0;
    vivos.forEach(([pa, r]) => { pg += pa.pagas; tot += pa.tot; falta += r.falta; atr += r.atr; if (r.atr >= 2) risco = true; nMes += r.mes.length; somaMes += r.mes.reduce((s, x) => s + x.valor, 0); });
    return Object.assign(g, { vivos, conc, pg, tot, falta, atr, risco, nMes, somaMes });
  }).filter((g) => chip === 'concluidos' ? g.conc.length : g.vivos.length && (chip === 'todos' || (chip === 'atraso' && g.atr) || (chip === 'risco' && g.risco) || (chip === 'dia' && !g.atr)))
    .sort((a, b) => (b.atr ? 1 : 0) - (a.atr ? 1 : 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
  if (grupos.length === 1 && !E.pc.grupo) E.pc.grupo = grupos[0].id;
  let html = '';
  grupos.forEach((g) => {
    const ab = E.pc.grupo === g.id, n = chip === 'concluidos' ? g.conc.length : g.vivos.length, pc = g.tot ? Math.round(g.pg / g.tot * 100) : 100;
    html += '<button type="button" class="b-cg" data-pc-g="' + esc(g.id) + '" aria-expanded="' + ab + '"><div class="b-cg-hd"><span class="b-ponto" style="background:' + corGrupo(g.nome) + '"></span><b>' + esc(g.nome) + '</b>' +
      (chip === 'concluidos' ? '<span class="b-pill b-g">Concluídos</span>' : g.atr ? '<span class="b-pill b-r">' + plural(g.atr, 'parcela', 'parcelas') + ' em atraso</span>' : '<span class="b-pill b-g">Em dia</span>') + '</div>' +
      '<div class="b-cg-sub">' + plural(n, 'parcelamento', 'parcelamentos') + (g.risco && chip !== 'concluidos' ? ' · <span class="b-n-atr">risco de rescisão</span>' : '') + '</div>' +
      (chip === 'concluidos' ? '' : '<div class="b-barra"><span style="width:' + pc + '%"></span></div><div class="b-cg-lin"><span>Pagas</span><b><span class="b-verde">' + g.pg + '</span> de ' + g.tot + '</b></div>' +
        '<div class="b-cg-lin"><span>Falta pagar</span><b>' + brl(g.falta) + '</b></div><div class="b-cg-lin"><span>A pagar este mês</span><b>' + (g.nMes ? brl(g.somaMes) + ' (' + g.nMes + ')' : '—') + '</b></div>') + '</button>';
    if (ab) html += '<div class="b-cg-det" id="pc-det-grupo"></div>';
  });
  el.innerHTML = html || '<div class="b-quadro b-cg-det">' + vazioB({ icone: 'ok', titulo: 'Nenhum grupo neste recorte', frase: 'Troque a escolha acima (Todos, Com atraso, Risco de rescisão, Em dia, Concluídos).' }) + '</div>';
  el.onclick = (ev) => { const c = ev.target.closest('[data-pc-g]'); if (!c) return; E.pc.grupo = E.pc.grupo === c.dataset.pcG ? '' : c.dataset.pcG; desenharGruposPc(); };
  const det = $('pc-det-grupo'), g = grupos.find((x) => x.id === E.pc.grupo);
  if (!det || !g) return;
  const lista = chip === 'concluidos' ? g.conc : g.vivos;
  tabelaB(det, { id: 'pc-grupo', titulo: g.nome + ' — clique no parcelamento para ver a ficha e todas as parcelas', linhas: lista, unidade: ['parcelamento', 'parcelamentos'], chave: ([pa]) => pa.id, ord: { k: 'emp', dir: 1 },
    busca: ([pa]) => pa.empresa + ' ' + pa.numero + ' ' + pa.natureza, valor: ([, r]) => r.falta,
    colunas: [{ k: 'emp', rot: 'Empresa', html: ([pa]) => empresaB(pa.empresa, pa.cnpj), ord: ([pa]) => normalizar(pa.empresa) }, { k: 'plat', rot: 'Plataforma', html: ([pa]) => '<span class="b-plat">' + esc(pa.local || '—') + '</span>', ord: ([pa]) => pa.local },
      { k: 'nat', rot: 'Natureza', html: ([pa]) => esc(pa.natureza || '—'), ord: ([pa]) => pa.natureza }, { k: 'num', rot: 'Nº parcelamento', cls: 'b-num', html: ([pa]) => esc(pa.numero || '—'), ord: ([pa]) => pa.numero },
      { k: 'pg', rot: 'Pagas', html: ([pa, r]) => '<div class="b-prog"><div class="b-barra"><span style="width:' + r.pc + '%"></span></div><span><b class="b-verde">' + pa.pagas + '</b> de ' + pa.tot + '</span></div>', ord: ([, r]) => r.pc },
      { k: 'falta', rot: 'Falta pagar', cls: 'b-dir b-val', soma: true, html: ([, r]) => brl(r.falta), ord: ([, r]) => r.falta },
      { k: 'prox', rot: 'Próxima', cls: 'b-cen b-data', html: ([, r]) => (r.prox ? dataBR(r.prox.venc) : '—'), ord: ([, r]) => (r.prox ? r.prox.venc : '9') },
      { k: 'atr', rot: 'Situação', cls: 'b-cen', html: ([, r]) => (r.concluido ? '<span class="b-pill b-g">Concluído</span>' : r.atr ? '<span class="b-n-atr">' + plural(r.atr, 'parcela', 'parcelas') + ' em atraso</span>' : '<span class="b-pill b-g">Em dia</span>'), ord: ([, r]) => r.atr }],
    clique: ([pa]) => janelaParcelamento(pa) });
}

// ── janela do parcelamento: ficha, 5 números, TODAS as parcelas (lidas do banco), Emitir e Baixa ──
async function janelaParcelamento(pa) {
  const r = resumoPa(pa);
  const j = abrirJanela({ larga: true, kick: 'Parcelamento nº ' + (pa.numero || '—'), titulo: pa.empresa, sub: esc(pa.grupo || '') + ' · ' + esc(pa.local || '') + ' · ' + esc(pa.natureza || ''),
    dir: r.concluido ? '<span class="b-pill b-g">Concluído</span>' : r.atr ? '<span class="b-pill b-r">' + plural(r.atr, 'parcela', 'parcelas') + ' em atraso</span>' : '<span class="b-pill b-g">Em dia</span>',
    corpo: '<div class="b-ficha"><div><span>CPF / CNPJ</span><b class="b-m">' + esc(pa.cnpj || '—') + '</b></div><div><span>Plataforma</span><b>' + esc(pa.local || '—') + '</b></div><div><span>Natureza</span><b>' + esc(pa.natureza || '—') + '</b></div><div><span>Nº do parcelamento</span><b class="b-m">' + esc(pa.numero || '—') + '</b></div>' +
      '<div><span>Total de parcelas</span><b>' + (pa.tot || '—') + '</b></div><div><span>Valor da parcela</span><b>' + brl((pa.parcelas.length ? pa.parcelas[pa.parcelas.length - 1].valor : 0) || pa.vparc) + '</b></div><div><span>Valor residual</span><b>' + brl(r.falta) + '</b></div><div><span>Guias</span><b>' + (pa.emitimos ? 'Nós emitimos' : 'O cliente emite') + '</b></div>' +
      (pa.obs ? '<div style="grid-column:1/-1"><span>Observação</span><b>' + esc(pa.obs) + '</b></div>' : '') + '</div>' +
      '<div class="b-nums">' + [['Parcelas pagas', pa.pagas + ' de ' + pa.tot + ' (' + r.pc + '%)', ''], ['Já quitado', brl(r.quitado), 'b-verde'], ['Falta pagar', brl(r.falta), ''], ['Próxima parcela', r.prox ? dataBR(r.prox.venc) : '—', ''], ['Em atraso', r.atr ? plural(r.atr, 'parcela', 'parcelas') : 'nenhuma', r.atr ? 'b-verm' : '']]
        .map((k) => '<div><span>' + k[0] + '</span><b class="' + k[2] + '">' + k[1] + '</b></div>').join('') + '</div><div id="pc-j-parcelas"><p class="b-kpi-s">Carregando todas as parcelas…</p></div>',
    rodape: (pode('juridico', 'editar') ? '<button type="button" class="btn btn-o" id="pc-j-editar" style="margin-right:auto">Editar dados do parcelamento</button>' : '') +
      (pa.emitimos && r.mes.some((x) => !x.emitida) && pode('juridico', 'editar') ? '<button type="button" class="btn btn-o" id="pc-j-guias">' + iconeB('documento') + ' Emitir guias (' + r.mes.filter((x) => !x.emitida).length + ')</button>' : '') +
      '<button type="button" class="btn btn-o" data-fechar>Fechar</button>' });
  j.classList.add('pc-janela');
  const ed = j.querySelector('#pc-j-editar'); if (ed) ed.onclick = () => { fecharJanela(j); const ED = ED_P(); if (ED && ED.abrirParcelamento) ED.abrirParcelamento(pa.id); };
  const gu = j.querySelector('#pc-j-guias'); if (gu) gu.onclick = () => { fecharJanela(j); if (typeof gerarGuias === 'function') gerarGuias('parcelas', { ids: r.mes.filter((x) => !x.emitida).map((x) => x.id) }); };
  // todas as parcelas, direto do banco (a tela principal mostra 12 meses para trás e 18 para frente)
  let todas = pa.parcelas;
  try {
    const L = await q(sb.from('parcelas').select('*').eq('parcelamento_id', pa.id).order('vencimento').order('id'));
    let ult = null;
    todas = L.map((x) => { if (x.valor != null && Number(x.valor) > 0) ult = Number(x.valor); const ja = pa.parcelas.find((y) => y.id === x.id);
      const y = { id: x.id, pa, n: x.numero || '', venc: x.vencimento || '', pago: !!x.pago, pagoEm: x.data_pagamento || '', emitida: x.emitida_em || '', valor: ult != null ? ult : pa.vparc, lancado: x.valor != null && Number(x.valor) > 0, _orig: ja && ja._orig };
      if (ja) Object.assign(ja, y); return ja || y; });
  } catch (e) { console.warn('[Parcelamentos] parcelas:', e.message); }
  const alvo = j.querySelector('#pc-j-parcelas'); if (!alvo || !alvo.isConnected) return;
  E.pc.janelaPa = { pa, todas, el: alvo };
  tabelaB(alvo, { id: 'pc-j-' + pa.id, titulo: 'Parcelas', linhas: todas, unidade: ['parcela', 'parcelas'], ord: { k: 'n', dir: 1 }, valor: (x) => x.valor, venc: (x) => x.venc, altura: '360px', abaPadrao: 'abertas',
    abas: [{ id: 'abertas', rot: 'Em aberto', f: (x) => !x.pago }, { id: 'pagas', rot: 'Pagas', f: (x) => x.pago }, { id: 'todas', rot: 'Todas', f: () => true }],
    colunas: [{ k: 'n', rot: 'Parcela', cls: 'b-data', html: (x) => esc(x.n) + (pa.tot ? '/' + pa.tot : ''), ord: (x) => Number(x.n) || 0 },
      { k: 'venc', rot: 'Vencimento', cls: 'b-data', clsL: (x) => vencB(x.venc, x.pago).cls, html: (x) => vencB(x.venc, x.pago).html, ord: (x) => x.venc || '9' },
      { k: 'v', rot: 'Valor', cls: 'b-dir b-val', soma: true, html: (x) => brl(x.valor) + (x.lancado ? '' : ' <small title="Valor ainda não lançado nesta parcela: vale o último lançado">*</small>'), ord: (x) => x.valor },
      { k: 'em', rot: 'Guia', html: (x) => celEmissaoP(x, true), ord: (x) => x.emitida || '' },
      { k: 'pago', rot: 'Baixa', cls: 'b-cen', html: celBaixaP, ord: (x) => x.pagoEm || (x.pago ? '1' : '') }],
    lote: lotesParcelas(), clique: janelaParcela });
}

// ── clique na parcela: ficha + guia + pagamento (com Desmarcar) + editar no formulário do ERP ──
function janelaParcela(x) {
  const pa = x.pa, podeEd = pode('juridico', 'editar');
  const j = abrirJanela({ kick: 'Parcela ' + x.n + (pa.tot ? ' de ' + pa.tot : ''), titulo: pa.empresa, sub: esc(pa.local || '') + ' · ' + esc(pa.natureza || '') + ' · nº ' + esc(pa.numero || '—'),
    corpo: '<div class="b-ficha" style="grid-template-columns:1fr 1fr"><div><span>Grupo</span><b>' + grupoTxtB(pa.grupo) + '</b></div><div><span>CPF / CNPJ</span><b class="b-m">' + esc(pa.cnpj || '—') + '</b></div>' +
      '<div><span>Vencimento</span><b>' + (x.venc ? dataBR(x.venc) : '—') + '</b></div><div><span>Valor</span><b>' + brl(x.valor) + (x.lancado ? '' : ' <small>(último lançado)</small>') + '</b></div></div>' +
      '<div class="b-conf"><b>Guia</b><span>' + celEmissaoP(x, true) + '</span></div>' +
      '<div class="b-conf"><b>Pagamento</b><span>' + (x.pago ? '<span class="b-ok-txt">✓ Pago' + (x.pagoEm ? ' em ' + dataBR(x.pagoEm) : '') + '</span>' + (podeEd ? ' <button type="button" class="b-link" id="pc-p-desmarcar">Desmarcar o pagamento</button>' : '') : celBaixaP(x)) + '</span></div>',
    rodape: '<button type="button" class="btn btn-o" id="pc-p-pa" style="margin-right:auto">Ver o parcelamento inteiro</button>' + (podeEd ? '<button type="button" class="btn btn-o" id="pc-p-editar">Editar</button>' : '') + '<button type="button" class="btn btn-o" data-fechar>Fechar</button>' });
  j.querySelector('#pc-p-pa').onclick = () => { fecharJanela(j); janelaParcelamento(pa); };
  const ed = j.querySelector('#pc-p-editar'); if (ed) ed.onclick = () => { fecharJanela(j); const ED = ED_P(); if (ED && ED.abrirParcelamento) ED.abrirParcelamento(pa.id, x.id); };
  const dm = j.querySelector('#pc-p-desmarcar'); if (dm) dm.onclick = async () => {
    if (!confirm('Tirar a baixa desta parcela? Ela volta a ficar em aberto.')) return;
    fecharJanela(j); const antes = { pago: x.pago, pagoEm: x.pagoEm };
    marcarParcela(x, false, '');
    try { await q(sb.from('parcelas').update({ pago: false, data_pagamento: null }).eq('id', x.id)); const ED = ED_P(); if (ED && ED.gravou) ED.gravou('Pagamento desmarcado'); else aviso('Pagamento desmarcado.'); if (ED && ED.marcarSujo) ED.marcarSujo('parcelas', pa.id); }
    catch (e) { marcarParcela(x, antes.pago, antes.pagoEm); aviso('⚠ ' + erroAmigavel(e), true); }
  };
}

// muda a parcela na tela (e no ERP, para o Painel e os outros números) e redesenha
function marcarParcela(x, pago, pagoEm) {
  const eraPago = x.pago;
  x.pago = pago; x.pagoEm = pagoEm || '';
  if (eraPago !== pago) x.pa.pagas = Math.max(0, x.pa.pagas + (pago ? 1 : -1));
  const o = x._orig; if (o) { o.pagamento = pago ? 'SIM' : ''; o.status = pago ? 'Pago' : (x.venc <= hojeISO() ? 'Inadimplente' : 'A Vencer'); o.pagoEm = x.pagoEm; }
  const op = x.pa._orig; if (op && eraPago !== pago) { op.parcelasPagas = x.pa.pagas; op.pagasReais = x.pa.pagas; if (x.venc < hojeISO()) op.vencidas = Math.max(0, (op.vencidas || 0) + (pago ? -1 : 1)); }
  redesenharParc();
}
function redesenharParc() {
  if ($('pc-tabela')) pintarParcelamentos();
  const jp = E.pc && E.pc.janelaPa; if (jp && jp.el.isConnected && jp.el._redesenharB) jp.el._redesenharB();
}

// ── baixa (uma) — pergunta antes; a tela muda na hora; "Desfazer" no rodapé; erro → volta ──
async function baixaParcela(x) {
  const bx = await perguntarBaixa({ despesa: true, titulo: 'Pagamento da parcela — confirme', valor: x.valor, descricao: 'Parcela ' + x.n + (x.pa.tot ? ' de ' + x.pa.tot : '') + ' — ' + x.pa.empresa + (x.venc ? ' · venc. ' + dataBR(x.venc) : '') });
  if (!bx) return false;
  return gravarBaixas([x], bx);
}
async function gravarBaixas(lista, bx) {
  const antes = lista.map((x) => ({ x, pago: x.pago, pagoEm: x.pagoEm }));
  lista.forEach((x) => marcarParcela(x, true, bx.data_pagamento));
  const ED = ED_P();
  const desfazer = async () => {
    const r = await sb.from('parcelas').update({ pago: false, data_pagamento: null }).in('id', lista.map((x) => x.id));
    if (r.error) return aviso('⚠ ' + erroAmigavel(r.error), true);
    antes.forEach((a) => marcarParcela(a.x, a.pago, a.pagoEm));
    if (ED && ED.gravou) ED.gravou('Baixa desfeita'); if (ED && ED.marcarSujo) lista.forEach((x) => ED.marcarSujo('parcelas', x.pa.id));
  };
  try {
    if (lista.length === 1 && ED && ED.baixaRapida) {
      const d = await ED.baixaRapida('parcelas', lista[0].id, { semRecarregar: true, desfazer, prazoDesfazer: 8000, dados: bx });
      if (!d || !d.id) throw new Error('não gravou');
      if (d.data_pagamento && d.data_pagamento !== lista[0].pagoEm) marcarParcela(lista[0], true, d.data_pagamento);
    } else {
      await q(sb.from('parcelas').update({ pago: true, data_pagamento: bx.data_pagamento }).in('id', lista.map((x) => x.id)));
      if (ED && ED.gravou) ED.gravou('Baixa de ' + plural(lista.length, 'parcela', 'parcelas'), desfazer, 8000); else aviso('✓ ' + plural(lista.length, 'baixa gravada', 'baixas gravadas') + '.');
      if (ED && ED.marcarSujo) lista.forEach((x) => ED.marcarSujo('parcelas', x.pa.id));
    }
    return true;
  } catch (e) { antes.forEach((a) => marcarParcela(a.x, a.pago, a.pagoEm)); if (e.message !== 'não gravou') aviso('⚠ ' + erroAmigavel(e), true); return false; }
}
// ── ações em lote (sempre com confirmação) ──
function lotesParcelas() {
  if (!pode('juridico', 'editar')) return null;
  return [{ rot: 'Dar baixa', icone: 'check', quando: (x) => !x.pago, fn: async (l) => {
      const soma = l.reduce((s, x) => s + x.valor, 0);
      const bx = await perguntarBaixa({ despesa: true, titulo: 'Pagamento de ' + plural(l.length, 'parcela', 'parcelas') + ' — confirme', valor: soma,
        descricao: l.slice(0, 6).map((x) => x.pa.empresa + ' · parcela ' + x.n + (x.pa.tot ? '/' + x.pa.tot : '')).join(' · ') + (l.length > 6 ? ' · … e mais ' + (l.length - 6) : '') });
      if (!bx) return false;
      return gravarBaixas(l, bx);
    } },
    { rot: 'Marcar guias como emitidas', icone: 'documento', quando: paraEmitirP, fn: async (l) => {
      if (!confirm('Marcar ' + plural(l.length, 'guia', 'guias') + ' como emitida(s)?\n\nUse quando os PDFs já foram gerados no e-CAC/Regularize/SIARE. Nenhum e-mail é enviado por aqui.')) return false;
      const h = hojeISO(); l.forEach((x) => { x.emitida = h; if (x._orig) { x._orig.emitidaIso = h; x._orig.emitidaEm = dataBR(h); x._orig.emissao = 'SIM'; } }); redesenharParc();
      try {
        for (const x of l) await q(sb.rpc('registrar_emissao', { p_tabela: 'parcelas', p_id: x.id, p_emitida: true, p_doc: null, p_enviar: false }));
        const ED = ED_P(); if (ED && ED.gravou) ED.gravou(plural(l.length, 'guia marcada', 'guias marcadas') + ' como emitida(s)'); else aviso('✓ Guias marcadas.');
        if (ED && ED.marcarSujo) l.forEach((x) => ED.marcarSujo('parcelas', x.pa.id));
        return true;
      } catch (e) { l.forEach((x) => { x.emitida = ''; if (x._orig) { x._orig.emitidaIso = ''; x._orig.emitidaEm = ''; } }); redesenharParc(); aviso('⚠ Não foi possível marcar: ' + erroAmigavel(e), true); return false; }
    } }];
}
// botões dentro das linhas (Baixa e Emitir) — um ouvinte para a tela e as janelas
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-pc-baixa]'), em = ev.target.closest('[data-pc-emitir]');
  if (!b && !em) return;
  ev.stopPropagation(); ev.preventDefault();
  const id = (b || em).dataset[b ? 'pcBaixa' : 'pcEmitir'];
  const jp = E.pc && E.pc.janelaPa, PA = (E.pc && E.pc.PA) || [];
  const x = (jp && jp.todas.find((y) => y.id === id)) || [].concat(...PA.map((pa) => pa.parcelas)).find((y) => y.id === id);
  if (!x) return;
  const janela = (b || em).closest('.fundo'); if (janela && !janela.classList.contains('pc-janela') && !janela.querySelector('#pc-j-parcelas')) fecharJanela(janela);
  if (b) return baixaParcela(x);
  // Emitir: a janela de emissão do sistema (valor da guia, PDF, enviar ao cliente)
  // (a janela de emissão grava, envia ou desfaz e depois recarrega o ERP — a tela se redesenha sozinha com o dado novo)
  if (typeof emitirParcela === 'function') emitirParcela('parcelas', x.id);
}, true);

// toda gravação confirmada aparece também no rodapé do ERP
const _avisoOrig = aviso;
aviso = function (msg, erro) { _avisoOrig(msg, erro); if (!erro && window.ERP_EDITOR && /^✓/.test(msg)) window.ERP_EDITOR.gravou(String(msg).replace(/^✓\s*/, '')); };
window.GS = { cabecalhoTela, cartoesNumero, barraAbas, buscaB, tabelaLeve, vazioB, iconeB, tabelaB, cartoesB, vencB, janelaParcelamento, TELAS, E, irPara, carregarCadastros, formLancamento, formCliente, formContrato, formTarefa, tabelaLancamentos, ligarAcoesLancamentos, abrirJanela, fecharJanela, abrirFicha, invalidarCadastros, blocoDocumentos, abrirAlertas, contarAlertas, pode, janelaMeusAvisos, formOportunidade, detalheAcordo, perguntarBaixa, detalheContrato, ICONE_AVISO, abrirTarefa, detalheLancamento, formReuniao, janelaDelegar, abrirGeradorContrato, cardGuias, emitirParcela, enviarAcordosSelecionados, editarAcordo, formAcordoNovo, janelaReceber, formExecucao, escolherExecucaoReceb, formNovoFluxo, gerarGuias, janelaMovimentacao, cobrarWhatsApp, textoRegra, proximasDatas, regraDaTarefa, projecoesRecorrentes };
})();
