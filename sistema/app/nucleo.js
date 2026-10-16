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
  if (v >= 1e6) return s + 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi';   // Backup 84: como no ambiente (R$ 1,44 mi)
  if (v >= 1e4) return s + 'R$ ' + Math.round(v / 1e3).toLocaleString('pt-BR') + ' mil';
  return s + brl(v).replace(/\u00a0/g, ' ');   // Backup 76: espaço comum (o mesmo dos valores "mil"/"mi")
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
    // Backup 88: erp-publicacoes roda na região de São Paulo (o Diário do CNJ recusa servidores fora do Brasil)
    r = await fetch(String(CFG.url).replace(/\/$/, '') + '/functions/v1/' + nome + (nome === 'erp-publicacoes' ? '?forceFunctionRegion=sa-east-1' : ''), { method: 'POST',
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
function abrirJanela({ titulo, corpo, rodape, larga, kick, sub, dir, abas, noLugarDe }) {   // Backup 89: noLugarDe = troca a janela aberta por esta, sem fechar/abrir (ex.: Tarefa → Reunião)   // Backup 85 (JN2): abas = html preso ao cabeçalho (fica parado ao rolar)
  // Backup 87: título como no ambiente — sem o emoji/sinal do começo ("✎ Editar…", "📝 Novo aditivo", "+ Nova…")
  titulo = String(titulo == null ? '' : titulo).replace(/^[^\p{L}\p{N}"'(]+(?=\p{L}|\p{N})/u, '');
  const fundo = document.createElement('div');
  fundo.className = 'fundo' + (noLugarDe ? ' j-troca' : '');
  fundo.innerHTML =
    '<div class="janela' + (larga ? ' larga' : '') + '" role="dialog" aria-modal="true">' +
    '<div class="janela-hd">' + (kick || sub ? '<div class="j-tit">' + (kick ? '<span class="j-kick">' + esc(kick) + '</span>' : '') : '') + '<h2>' + esc(titulo) + '</h2>' +
    (kick || sub ? (sub ? '<small class="j-sub">' + sub + '</small>' : '') + '</div>' : '') + (dir ? '<div class="j-dir">' + dir + '</div>' : '') +
    '<button type="button" data-fechar aria-label="Fechar" title="Fechar">' + iconeB('x') + '</button></div>' +   // Backup 85 (JN1): X desenhado, como no ambiente
    (abas ? '<div class="j-abas">' + abas + '</div>' : '') +
    '<div class="janela-bd">' + corpo + '</div>' +
    (rodape ? '<div class="janela-rp">' + rodape + '</div>' : '') + '</div>';
  fundo.addEventListener('mousedown', (ev) => { if (ev.target === fundo) fecharJanela(fundo); });
  fundo.querySelector('[data-fechar]').onclick = () => fecharJanela(fundo);
  $('janelas').appendChild(fundo);
  if (noLugarDe && noLugarDe.parentNode) { noLugarDe._aoFechar = null; noLugarDe.remove(); }
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

// Backup 85 (JN3): confirmação DENTRO da página (no lugar da caixinha do navegador) — devolve true/false.
// o: { kick, titulo, sub, texto, resumo (html), ok (rótulo do botão), perigo }
function confirmarB(o) {
  if (typeof o === 'string') {   // texto solto (o que antes ia para o confirm do navegador): 1º parágrafo = título, o resto = explicação
    const partes = o.split(/\n\s*\n/), apaga = /^(excluir|apagar|descartar|cancelar esta|tirar|desmarcar|parar)/i.test(o.trim());
    o = { titulo: partes[0].replace(/\n/g, ' '), texto: partes.slice(1).join(' ').replace(/\n/g, ' '), perigo: apaga, ok: apaga ? ((w) => (w === 'Cancelar' ? 'Sim, cancelar' : w || 'Confirmar'))(o.trim().split(' ')[0].replace(/[^\wÀ-ú]/g, '')) : 'Confirmar' };
  }
  return new Promise((ok) => {
    let feito = false;
    const j = abrirJanela({ kick: o.kick || 'Confirmar', titulo: o.titulo, sub: o.sub,
      corpo: (o.resumo ? '<div class="b-conf-resumo">' + o.resumo + '</div>' : '') + (o.texto ? '<p class="b-conf-tx">' + esc(o.texto) + '</p>' : ''),
      rodape: '<button type="button" class="btn btn-o" data-cf-nao>Cancelar</button><button type="button" class="btn ' + (o.perigo ? 'btn-perigo' : 'btn-p') + '" data-cf-sim>' + iconeB('check') + esc(o.ok || 'Confirmar') + '</button>' });
    j.classList.add('janela-conf');
    const fim = (v) => { if (feito) return; feito = true; fecharJanela(j); ok(v); };
    j.querySelector('[data-cf-nao]').onclick = () => fim(false);
    j.querySelector('[data-fechar]').onclick = () => fim(false);
    j.addEventListener('mousedown', (ev) => { if (ev.target === j) fim(false); });
    j.querySelector('[data-cf-sim]').onclick = () => fim(true);
    setTimeout(() => { const b = j.querySelector('[data-cf-sim]'); if (b) b.focus(); }, 60);
    new MutationObserver((_, ob) => { if (!j.isConnected) { ob.disconnect(); fim(false); } }).observe(j.parentNode, { childList: true });
  });
}

// Baixa (recebimento/pagamento): pergunta a data — vem com hoje, mas dá para trocar quando o
// lançamento é feito depois. Acordo: pergunta também se o comprovante foi juntado ao processo (e o ID).
// Devolve os campos a gravar, ou null se a pessoa cancelou.
// Backup 85 (JN5/TX3): desenho do ambiente — "Confirmar pagamento" em cima, a pergunta no título, o nome embaixo,
// um resumo (descrição, nº/vencimento, valor) e, quando houver, o aviso do recibo automático.
function perguntarBaixa({ titulo, descricao, valor, acordo, despesa, sub, linha, aviso: avisoTx, recebimento }) {
  const receb = recebimento != null ? recebimento : !despesa && !acordo;
  return new Promise((ok) => {
    let feito = false;
    const j = abrirJanela({ kick: receb ? 'Confirmar recebimento' : 'Confirmar pagamento',
      titulo: titulo || (acordo ? 'Lançar o pagamento desta parcela do acordo?' : receb ? 'Lançar este recebimento?' : 'Lançar este pagamento?'), sub: sub ? esc(sub) : '',
      corpo: (descricao || valor != null ? '<div class="b-conf-resumo">' + (descricao ? '<b>' + esc(descricao) + '</b>' : '') + (linha ? '<span>' + esc(linha) + '</span>' : '') +
          (valor != null && valor !== '' ? '<span class="b-conf-val">' + brl(valor) + '</span>' : '') + (avisoTx ? '<span class="b-conf-av">' + esc(avisoTx) + '</span>' : '') + '</div>' : '') +
        campo(despesa || acordo || !receb ? 'Data do pagamento' : 'Data do recebimento', '<input type="date" name="bx-data" required value="' + hojeISO() + '">') +
        '<div class="sub" style="margin:4px 0 10px">Já vem com hoje. Se foi em outro dia, troque.</div>' +
        (acordo ? '<fieldset class="bx-comp"><legend>O comprovante foi anexado ao processo?</legend>' +
          '<label><input type="radio" name="bx-comp" value="sim"> Sim</label> <label><input type="radio" name="bx-comp" value="nao" checked> Não</label>' +
          '<div class="bx-id" hidden>' + campo('ID do documento no processo', '<input name="bx-id" placeholder="ex.: 123456789 (ID do PJe)">') + '</div></fieldset>' : ''),
      rodape: '<button type="button" class="btn btn-o" data-bx-cancelar>Cancelar</button><button type="button" class="btn btn-v" data-bx-ok>' + iconeB('check') + (receb ? 'Confirmar recebimento' : 'Confirmar pagamento') + '</button>' });
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
// Backup 85 (JN4): "Desfazer" no rodapé depois de salvar, editar ou excluir — desfazer = função que volta o que foi feito
function feitoDesfazer(texto, desfazer, depois) {
  const ed = window.ERP_EDITOR;
  const volta = desfazer ? async () => { try { await desfazer(); aviso('Desfeito.'); if (depois) await depois(); } catch (e) { aviso(erroAmigavel(e), true); } } : null;
  if (ed && ed.gravou) { ed.gravou(texto, volta); marcarGravacao(); invalidarCadastros(); } else aviso('✓ ' + texto);
}
// guarda os campos de um registro antes de mudar e devolve a função que volta a eles (para o "Desfazer")
async function fotoRegistro(tabela, id, campos) {
  const r = (await q(sb.from(tabela).select(campos.join(',')).eq('id', id)))[0];
  return r ? async () => { await q(sb.from(tabela).update(r).eq('id', id)); } : null;
}
// Backup 85 (JN4): excluir com "Desfazer" — guarda a linha inteira antes de apagar e, no Desfazer, grava de volta com o mesmo id
async function excluirComDesfazer(tabela, id, texto, depois) {
  const linha = (await q(sb.from(tabela).select('*').eq('id', id)))[0];
  await excluir(tabela, id);
  feitoDesfazer(texto || 'Excluído.', linha ? () => q(sb.from(tabela).insert(linha)) : null, depois);
}
// gravar alterações com "Desfazer": fotografa os campos que vão mudar e volta a eles
async function alterarComDesfazer(tabela, id, dados, texto, depois) {
  const volta = await fotoRegistro(tabela, id, Object.keys(dados));
  await q(sb.from(tabela).update(dados).eq('id', id));
  feitoDesfazer(texto || 'Alterações salvas.', volta, depois);
}
// incluir com "Desfazer": devolve as linhas criadas; o Desfazer apaga
async function incluirComDesfazer(tabela, linhas, texto, depois) {
  const novas = await q(sb.from(tabela).insert(linhas).select('id'));
  const ids = (novas || []).map((r) => r.id);
  feitoDesfazer(texto || 'Salvo.', ids.length ? () => q(sb.from(tabela).delete().in('id', ids)) : null, depois);
  return novas;
}
// Backup 85 (JN5): o aviso "O recibo em PDF vai sozinho para…" — só quando o e-mail automático de recibo está ligado e o cliente recebe e-mails
let _reciboLigado = null;
async function avisoRecibo(clienteId) {
  if (!clienteId) return '';
  try {
    if (_reciboLigado == null) { const r = await q(sb.from('regras_tarefas').select('ligada').eq('chave', 'email_pagamento_recebido')); _reciboLigado = !!(r[0] && r[0].ligada); setTimeout(() => { _reciboLigado = null; }, 60000); }
    if (!_reciboLigado) return '';
    const c = (await q(sb.from('clientes').select('email, recebe_email').eq('id', clienteId)))[0];
    return c && c.email && c.recebe_email !== false ? 'O recibo em PDF vai sozinho para ' + String(c.email).split(',')[0].trim() + '.' : '';
  } catch (e) { return ''; }
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
// Backup 89 (D2): no máximo dois botões à vista no cabeçalho — as ações raras vão para o "⋯".
// itens: [[id, rótulo] | html]; cada item é um botão com o MESMO id de antes (quem ligava o clique pelo id continua funcionando)
function maisB(itens, rotulo) {
  itens = (itens || []).filter(Boolean); if (!itens.length) return '';
  return '<span class="b-mais-wrap"><button type="button" class="b-ic-bt b-mais-bt" aria-haspopup="menu" aria-expanded="false" title="' + esc(rotulo || 'Mais ações') + '" aria-label="' + esc(rotulo || 'Mais ações') + '">⋯</button>' +
    '<div class="b-mais-menu" role="menu" hidden>' + itens.map((i) => (Array.isArray(i) ? '<button type="button" role="menuitem" class="b-mais-it" id="' + esc(i[0]) + '">' + esc(i[1]) + '</button>' : i)).join('') + '</div></span>';
}
document.addEventListener('click', (ev) => {
  const bt = ev.target.closest('.b-mais-bt');
  document.querySelectorAll('.b-mais-menu:not([hidden])').forEach((m) => { if (!bt || m.previousElementSibling !== bt) { m.hidden = true; m.previousElementSibling.setAttribute('aria-expanded', 'false'); } });
  if (bt) { const m = bt.nextElementSibling; m.hidden = !m.hidden; bt.setAttribute('aria-expanded', String(!m.hidden)); return; }
  const it = ev.target.closest('.b-mais-menu .b-mais-it'); if (it) setTimeout(() => { const m = it.closest('.b-mais-menu'); if (m) { m.hidden = true; m.previousElementSibling.setAttribute('aria-expanded', 'false'); } }, 0);
});
function cabecalhoTela({ icone, titulo, frase, atualizar, botao, extra, mais }) {
  // Backup 82 (ambiente): "Atualizar" virou um botão só com o ícone; `extra` = outros botões antes do principal (ex.: "Guias do mês")
  return '<div class="b-cab"><div class="b-cab-ic">' + iconeB(icone || 'camadas') + '</div><div class="b-cab-tx"><h1>' + esc(titulo) + '</h1>' + (frase ? '<p>' + esc(frase) + '</p>' : '') + '</div>' +
    '<div class="b-cab-acoes">' + (atualizar ? '<button type="button" class="b-ic-bt" id="' + esc(atualizar) + '" title="Atualizar" aria-label="Atualizar">' + iconeB('atualizar') + '</button>' : '') + (extra || '') + maisB(mais) +
    (botao ? '<button type="button" class="btn btn-p b-bt" id="' + esc(botao.id) + '">' + iconeB('mais') + esc(botao.rotulo) + '</button>' : '') + '</div></div>';
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
ICONES_B.painel = '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-6"/>';   // Backup 82: gráfico de linha (Painel), como no ambiente
ICONES_B.rotina = '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 14l2 2 4-4"/>';
ICONES_B.olho = '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';   // Backup 81: prévia do portal
ICONES_B.lapis = '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>';   // Backup 85: editar (sem emoji ✎), como no ambiente
ICONES_B.lixo = '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>';
// Backup 76: ícones do Financeiro novo (e de quem mais precisar)
// Backup 76 (L4): ícones do cabeçalho único de todas as telas
Object.assign(ICONES_B, { admin: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  clientes: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
  contrato: '<path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><path d="M14 2.5V8h5.5M8.5 13h7M8.5 17h4"/>',
  crm: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  execucao: '<path d="m14.5 12.5-8 8a2 2 0 0 1-3-3l8-8M16 16l6-6M8 8l6-6M9 7l8 8M21 11l-8-8"/>',
  publicacao: '<path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  tarefas: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="m8 12 2.5 2.5L16 9"/>' });
Object.assign(ICONES_B, { financeiro: '<rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19M6.5 15h4"/>',
  recibo: '<path d="M6 2.5h12v19l-3-2-3 2-3-2-3 2z"/><path d="M9 7.5h6M9 11h6M9 14.5h4"/>', enviar: '<path d="m21.5 2.5-19 7 8 3 3 8z"/><path d="m10.5 12.5 11-10"/>' });
// Backup 74: faixa de números (a mesma do Painel, da Análise do Financeiro e da ficha do cliente): [[rótulo, valor, sub, classe b-verde|b-verm]]
// Backup 79: FILTRO SUSPENSO no alto das telas refeitas (Grupo, Empresa…). campos: [{k, rot, todos, opcoes:[texto], v}].
// A tela guarda o valor em E.<tela>.f e, ao trocar, redesenha tudo (resumo/cartões e a tabela) com o recorte.
// Backup 88: "PADRÃO DO ESCRITÓRIO" para filtros de escolha única — o mesmo controle em caixa do "Mês · Semana · Dia" do calendário.
// opcoes: [[valor, rótulo]]; attr: o data-* que a tela lê no clique (ex.: 'data-pc-chip'). marcarSegB(caixa, botão) acende o escolhido.
function segFiltroB(id, attr, opcoes, valor, rotulo) {
  return '<div class="b-seg b-seg-f"' + (id ? ' id="' + id + '"' : '') + ' role="group" aria-label="' + esc(rotulo || '') + '">' + opcoes.map((o) => { const on = String(valor) === String(o[0]);
    return '<button type="button" class="b-seg-bt" ' + attr + '="' + esc(o[0]) + '" aria-pressed="' + on + '" aria-selected="' + on + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>';
}
function marcarSegB(caixa, bt) { if (caixa) caixa.querySelectorAll('.b-seg-bt').forEach((x) => { const on = x === bt; x.setAttribute('aria-pressed', on); x.setAttribute('aria-selected', on); }); }
// Backup 88: o filtro de Grupo/Empresa fica À DIREITA e FIXO no alto ao rolar a tela (b-fsus-fixo)
function filtroSusB(id, campos) {
  return '<div class="b-fsus b-fsus-fixo" id="' + id + '"><span class="b-fsus-rot">Filtros</span>' + campos.map((c) => '<label class="b-fsus-c"><span>' + esc(c.rot) + '</span><select data-fsus="' + c.k + '" aria-label="' + esc(c.rot) + '"><option value="">' + esc(c.todos) + '</option>' +
    c.opcoes.map((o) => '<option' + (o === c.v ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select></label>').join('') +
    // Backup 89: o "Limpar" sempre existe; sem filtro ligado ele fica escondido no visual normal e à vista (apagado) no visual premium
    '<button type="button" class="b-fsus-limpar' + (campos.some((c) => c.v) ? '' : ' b-fsus-limpar-x') + '" data-fsus-limpar>Limpar filtro</button>' + '</div>';
}
function ligarFiltroSusB(id, estado, depois) {
  const el = $(id); if (!el) return;
  el.onchange = (ev) => { const s = ev.target.closest('[data-fsus]'); if (!s) return; estado[s.dataset.fsus] = s.value; if (s.dataset.fsus === 'grupo' && 'emp' in estado) estado.emp = ''; depois(); };
  el.onclick = (ev) => { if (!ev.target.closest('[data-fsus-limpar]')) return; Object.keys(estado).forEach((k) => { estado[k] = ''; }); depois(); };
}
const unicosTxt = (L) => [...new Set(L.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
// Backup 84: seção que se minimiza (ex.: "Situação por cliente") — o botão fica no cabeçalho da seção e a escolha é lembrada neste navegador
function botaoMinB(chave) {
  let min = false; try { min = localStorage.getItem('erp_min_' + chave) === '1'; } catch (e) { /* sem armazenamento */ }
  return '<button type="button" class="b-link b-min-bt" data-b-min="' + esc(chave) + '" aria-expanded="' + !min + '">' + (min ? 'Mostrar' : 'Minimizar') + '</button>';
}
function ligarMinB(chave, ids) {
  const bt = document.querySelector('[data-b-min="' + chave + '"]'); if (!bt) return;
  const aplicar = () => { const aberto = bt.getAttribute('aria-expanded') === 'true'; ids.forEach((id) => { const el = $(id); if (el) el.hidden = !aberto; }); bt.textContent = aberto ? 'Minimizar' : 'Mostrar'; };
  bt.onclick = () => { const abrir = bt.getAttribute('aria-expanded') !== 'true'; bt.setAttribute('aria-expanded', String(abrir)); try { localStorage.setItem('erp_min_' + chave, abrir ? '0' : '1'); } catch (e) { /* vale só agora */ } aplicar(); };
  aplicar();
}
function numsFaixa(itens) {
  return '<div class="b-nums b-nums-faixa b-nums-' + itens.length + '">' + itens.map((i) => '<div><span>' + esc(i[0]) + '</span><b class="' + (i[3] || '') + '">' + i[1] + '</b>' + (i[2] ? '<small>' + esc(i[2]) + '</small>' : '') + '</div>').join('') + '</div>';
}
// TABELA de toda tela refeita. cfg: { id, titulo (texto ou fn(aba)), colunas: [{k, rot, cls, clsL(r), html(r), ord(r) | false, soma}], linhas,
//   abas: [{id, rot, f(r), cor:'r'}], abaPadrao, ordAbas: {aba: {k, dir}}, ord: {k, dir}, busca(r) → texto, dicaBusca,
//   listas: [{k, rot, todos, opcoes: [[v, rótulo]], get(r)}], venc(r) → 'aaaa-mm-dd', valor(r) → número,
//   lote: [{rot, icone, quando(r), fn(lista)}], clique(r), chave(r), vazio: {titulo, frase}, unidade: [um, varios], altura, semBarra, barraExtra (html) }
function prepararTabB(id, arg) { E.tabBPend = E.tabBPend || {}; E.tabBPend[id] = arg; }
function tabelaB(el, cfg) {
  E.tabB = E.tabB || {};
  const st = E.tabB[cfg.id] = E.tabB[cfg.id] || { aba: (cfg.abas && (cfg.abaPadrao || cfg.abas[0].id)) || '', q: '', listas: {}, vde: '', vate: '', min: '', max: '', ord: Object.assign({}, cfg.ord || { k: '', dir: 1 }), ordAba: {}, sel: {}, painel: false, prazo: '', prazoAte: '', limite: 150 };
  if (cfg.ordAbas) Object.keys(cfg.ordAbas).forEach((a) => { if (!st.ordAba[a]) st.ordAba[a] = Object.assign({}, cfg.ordAbas[a]); });
  if (!st.limite) st.limite = 150;
  // Backup 85 (TB8): tela aberta já filtrada (ex.: pela faixa do Início) — prepararTabB(id, {aba, prazo, q})
  const pend = E.tabBPend && E.tabBPend[cfg.id]; if (pend) { if (pend.aba) st.aba = pend.aba; if (pend.prazo != null) { st.prazo = pend.prazo; st.prazoAte = ''; } if (pend.q != null) st.q = pend.q; st.limite = 150; delete E.tabBPend[cfg.id]; }
  el._cfgB = cfg;
  const chave = cfg.chave || ((r) => String(r.id));
  const temFx = !!(cfg.venc || cfg.valor);
  if (!cfg.semBarra) {
    // Backup 69: como a tabela de Acordos (o usuário preferiu) — botões "A pagar / Pago", atalhos de prazo, busca e contador numa linha;
    // grupo/plataforma/natureza, vencimento de/até e valor ficam no botão "Filtros"
    const temPainel = temFx || (cfg.listas || []).length;
    el.innerHTML = '<div class="b-barra-tab">' + (cfg.abas ? '<div class="b-seg" role="tablist"></div>' : '') +
      (cfg.prazos ? '<div class="b-prazos" data-bt="prazos"></div>' : '') +
      // Backup 88: sem a barra de busca nas tabelas (pedido: "remova a barra de pesquisa"; Ctrl+K continua achando tudo) — só fica onde a tela pede (buscaFica)
      (cfg.busca && cfg.buscaFica ? '<label class="b-busca">' + iconeB('busca') + '<input data-bt="q" placeholder="' + esc(cfg.dicaBusca || 'Buscar') + '" aria-label="Buscar" value="' + esc(st.q) + '"></label>' : '') +
      '<span class="b-conta" data-bt="conta"></span><span class="b-barra-dir">' + (cfg.barraExtra || '') +   // Backup 72: controle extra da tela (ex.: período das Publicações)
      (cfg.lote && cfg.loteBotao !== false ? '<button type="button" class="b-bt-f" data-bt="loteon" aria-pressed="' + !!st.loteOn + '" title="Marcar várias linhas para dar baixa de uma vez">' + iconeB('check') + (st.loteOn ? 'Fechar marcação' : 'Marcar várias') + '</button>' : '') +
      (temPainel ? '<button type="button" class="b-bt-f" data-bt="painel" aria-expanded="' + st.painel + '">' + iconeB('filtro') + 'Filtros <span class="b-nf" hidden></span></button>' : '') +
      '</span></div>' +   // Backup 88: saiu o botão "Tabela compacta" (do sistema todo)
      (temPainel ? '<div class="b-mais-filtros" data-bt="pn"' + (st.painel ? '' : ' hidden') + '>' +
        // Backup 85 (TB5): como no ambiente — cada filtro com o nome escrito em cima
        (cfg.listas || []).map((l) => '<div class="b-campo"><span class="b-rot">' + esc(l.rot) + '</span><select data-bt="l" data-k="' + esc(l.k) + '" aria-label="' + esc(l.rot) + '"><option value="">' + esc(l.todos) + '</option>' + l.opcoes.map((o) => '<option value="' + esc(o[0]) + '"' + (st.listas[l.k] === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select></div>').join('') +
        (cfg.venc ? '<div class="b-campo"><span class="b-rot">Vencimento</span><div class="b-fx">' + campoDataB('data-bt="vde"', st.vde, 'Vencimento de') + '<span>até</span>' + campoDataB('data-bt="vate"', st.vate, 'Vencimento até') + '</div></div>' : '') +
        (cfg.valor ? '<div class="b-campo"><span class="b-rot">Valor (R$)</span><div class="b-fx"><input inputmode="decimal" data-mascara="nenhuma" data-bt="min" placeholder="de" aria-label="Valor mínimo" value="' + esc(st.min) + '"><span>até</span><input inputmode="decimal" data-mascara="nenhuma" data-bt="max" placeholder="até" aria-label="Valor máximo" value="' + esc(st.max) + '"></div></div>' : '') +
        '<button type="button" class="btn btn-g" data-bt="limpar">Limpar filtros</button></div>' : '') +
      '<div data-bt="quadro"></div>';
  } else el.innerHTML = '<div data-bt="quadro"></div>';
  const Q = (s) => el.querySelector(s);
  const filtrar = (semAba) => {
    const q = normalizar(st.q.trim()), min = st.min ? lerValor(st.min) : null, max = st.max ? lerValor(st.max) : null;
    return cfg.linhas.filter((r) => {
      if (!semAba && cfg.abas && st.aba) { const a = cfg.abas.find((x) => x.id === st.aba); if (a && a.f && !a.f(r)) return false; }
      if (q && cfg.busca && cfg.buscaFica && normalizar(cfg.busca(r)).indexOf(q) < 0) return false;
      for (const l of (cfg.listas || [])) { const v = st.listas[l.k]; if (!v) continue; const g = l.get(r); if (Array.isArray(g) ? !g.map(String).includes(v) : String(g) !== v) return false; }   // Backup 82: get pode devolver lista (ex.: De quem)
      if (cfg.venc) { const d = cfg.venc(r) || ''; if (st.vde && d < st.vde) return false; if (st.vate && d > st.vate) return false;
        // atalhos de prazo (só nas abas em aberto): Vencidas = até hoje; N dias = vence até hoje + N (inclui as vencidas); até = data escolhida
        if (cfg.prazos && st.prazo && prazoNaAba()) { const h = hojeISO();
          if (st.prazo === 'venc' && !(d && d <= h)) return false;
          if (/^\d+$/.test(st.prazo) && !(d && d <= somarDias(h, Number(st.prazo)))) return false;
          if (st.prazo === 'ate' && st.prazoAte && !(d && d <= st.prazoAte)) return false; } }
      if (cfg.valor) { const v = cfg.valor(r) || 0; if (min != null && v < min) return false; if (max != null && v > max) return false; }
      return true;
    });
  };
  const ordem = () => (cfg.abas && st.ordAba[st.aba]) || st.ord;
  const prazoNaAba = () => !cfg.prazosAbas || cfg.prazosAbas.includes(st.aba);
  const filtrando = () => st.q || st.vde || st.vate || st.min || st.max || (st.prazo && prazoNaAba()) || Object.keys(st.listas).some((k) => st.listas[k]);
  function abas() {
    if (!cfg.abas || cfg.semBarra) return;
    const guarda = st.aba, cont = {};
    const contar = !!cfg.contagem && !cfg.semContagemAbas;   // Backup 85 (TB1): número nas abas só quando a tela pede, como no ambiente
    if (contar) { cfg.abas.forEach((a) => { st.aba = a.id; cont[a.id] = filtrar().length; }); st.aba = guarda; }
    Q('.b-seg').innerHTML = cfg.abas.map((a) => '<button type="button" role="tab" class="b-seg-bt" data-b-aba="' + esc(a.id) + '" aria-selected="' + (a.id === st.aba) + '">' + esc(a.rot) +
      (!contar ? '' : ' <span class="b-seg-n' + (a.cor === 'r' && cont[a.id] ? ' b-seg-n-r' : '') + '">' + cont[a.id] + '</span>') + '</button>').join('');
  }
  function quadro() {
    const cols = cfg.colunasAba ? cfg.colunasAba(st.aba) : cfg.colunas;   // Backup 76: colunas que mudam com a aba (ex.: Vencimento × Pago em)
    const o = ordem(), lin = filtrar(), col = cols.find((c) => c.k === o.k);
    if (col && col.ord !== false) { const f = col.ord || ((r) => r[col.k]); lin.sort((a, b) => { const x = f(a), y = f(b); return (x > y ? 1 : x < y ? -1 : 0) * o.dir; }); }
    Object.keys(st.sel).forEach((k) => { if (!lin.some((r) => chave(r) === k)) delete st.sel[k]; });
    const titulo = typeof cfg.titulo === 'function' ? cfg.titulo(st.aba) : cfg.titulo;
    const un = cfg.unidade || ['linha', 'linhas'];
    if (!lin.length) {
      Q('[data-bt=quadro]').innerHTML = '<div class="b-quadro">' + (titulo ? '<div class="b-quadro-hd"><h2>' + esc(titulo) + '</h2></div>' : '') +
        (filtrando() ? '<div class="b-vazio"><div class="b-vazio-ic">' + iconeB('busca') + '</div><b>Nada encontrado</b><p>Nenhuma linha combina com a busca e os filtros escolhidos.</p><button type="button" class="btn btn-o" data-bt="limpar">Limpar filtros</button></div>'
          : vazioB({ icone: 'ok', titulo: (cfg.vazio && cfg.vazio.titulo) || 'Nada aqui por enquanto', frase: (cfg.vazio && cfg.vazio.frase) || '' }) +
            // Backup 72: lista vazia com o botão de criar (vazio.botao = [rótulo, seletor do botão da tela])
            (cfg.vazio && cfg.vazio.botao ? '<div class="vazio b-vazio-bt"><button type="button" class="btn btn-p btn-mini vazio-bt" data-vazio-clica="' + esc(cfg.vazio.botao[1]) + '">' + esc(cfg.vazio.botao[0]) + '</button></div>' : '')) + '</div>';
      return;
    }
    const vSoma = cfg.valor || cfg.somaB;   // Backup 85: somaB = total no rodapé sem abrir "Filtros" de valor (janelas do ambiente)
    const soma = vSoma ? lin.reduce((s, r) => s + (vSoma(r) || 0), 0) : null;
    const temLote = !!(cfg.lote && cfg.lote.length) && (cfg.loteBotao === false || !!st.loteOn);   // Backup 85 (TB3): caixinhas só depois de "Marcar várias", em toda tela
    const marc = lin.filter((r) => st.sel[chave(r)]);
    // Backup 85 (TB4): com a marcação ligada a barra aparece já com "Marque as linhas"
    const lote = temLote ? '<div class="b-lote"><b>' + (marc.length ? plural(marc.length, 'marcada', 'marcadas') : 'Marque as linhas') + '</b>' + (cfg.valor && marc.length ? '<span>' + brl(marc.reduce((s, r) => s + (cfg.valor(r) || 0), 0)) + '</span>' : '') +
      (marc.length ? '<button type="button" class="btn btn-g btn-mini" data-bt="desmarcar">Desmarcar</button>' : '') + '<div class="b-lote-acoes">' + cfg.lote.map((a, i) => { const n = marc.filter((r) => !a.quando || a.quando(r)).length;
        return '<button type="button" class="btn btn-o btn-mini" data-b-lote="' + i + '"' + (n ? '' : ' disabled') + '>' + iconeB(a.icone || 'check') + esc(a.rot) + (n && n !== marc.length ? ' (' + n + ')' : '') + '</button>'; }).join('') + '</div></div>' : '';
    const cel = (c, r) => '<td' + ((c.cls || c.clsL) ? ' class="' + (c.cls || '') + (c.clsL ? c.clsL(r) : '') + '"' : '') + '>' + c.html(r) + '</td>';
    Q('[data-bt=quadro]').innerHTML = '<div class="b-quadro">' + (titulo ? '<div class="b-quadro-hd"><h2>' + esc(titulo) + '</h2><span class="b-resumo">' + plural(lin.length, un[0], un[1]) + (soma != null ? ' · <b>' + brl(soma) + '</b>' : '') + '</span></div>' : '') + lote +
      '<div class="b-rola" data-sem-pagina' + (cfg.altura ? ' style="max-height:' + cfg.altura + '"' : '') + '><table class="b-tab' + (cfg.tabCls ? ' ' + cfg.tabCls : '') + '"><thead><tr>' +
      (temLote ? '<th class="b-ck"><input type="checkbox" data-bt="todas" aria-label="Marcar todas"' + (marc.length && marc.length === lin.length ? ' checked' : '') + '></th>' : '') +
      cols.map((c) => { const pode = c.ord !== false; return '<th class="' + (pode ? 'b-ord ' : '') + (c.cls || '') + '"' + (pode ? ' data-b-ord="' + esc(c.k) + '" title="Ordenar"' : '') + (o.k === c.k ? ' data-dir="' + o.dir + '" aria-sort="' + (o.dir > 0 ? 'ascending' : 'descending') + '"' : '') + '>' + esc(c.rot) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + lin.slice(0, st.limite).map((r) => { const k = chave(r);
        return '<tr class="' + (cfg.clique ? 'b-cl' : '') + (st.sel[k] ? ' b-sel' : '') + (cfg.linhaCls ? cfg.linhaCls(r) : '') + '"' + (cfg.clique ? ' tabindex="0"' : '') + ' data-b-k="' + esc(k) + '">' +
          (temLote ? '<td class="b-ck"><input type="checkbox" data-bt="um" aria-label="Marcar"' + (st.sel[k] ? ' checked' : '') + '></td>' : '') + cols.map((c) => cel(c, r)).join('') + '</tr>'; }).join('') +
      // Backup 69: com muitas linhas (ex.: 15 mil parcelas), desenha 150 por vez — a tela abre na hora
      (lin.length > st.limite ? '<tr class="b-tr-mais"><td colspan="' + (cols.length + (temLote ? 1 : 0)) + '"><button type="button" class="btn btn-g btn-mini" data-bt="mais">Mostrar mais ' + Math.min(150, lin.length - st.limite) + ' (' + lin.length + ' no total)</button></td></tr>' : '') +
      '</tbody>' +   // Backup 88: sem a linha "Total de N" com soma e média no pé (pedido: "remova completamente a linha")
      '</table></div></div>';
    // Backup 88: a caixa da tabela mostra 20 linhas antes de rolar (era ~10–12)
    if (!cfg.altura) requestAnimationFrame(() => { const rola = Q('.b-rola'), trs = rola && rola.querySelectorAll('tbody > tr');
      if (!rola || !trs || trs.length <= 20 || !trs[20].offsetTop) { if (rola) rola.style.maxHeight = 'none'; return; }
      rola.style.maxHeight = (trs[20].offsetTop + 2) + 'px'; });
  }
  function contarFx() { const b = Q('[data-bt=painel]'); if (!b) return; const n = (st.vde || st.vate ? 1 : 0) + (st.min || st.max ? 1 : 0) + Object.keys(st.listas).filter((k) => st.listas[k]).length; b.classList.toggle('b-tem', n > 0); const s = b.querySelector('.b-nf'); s.hidden = !n; s.textContent = n; }
  function prazos() {
    const b = Q('[data-bt=prazos]'); if (!b) return;
    b.hidden = !prazoNaAba();
    // Backup 88: no "padrão do escritório" (o controle em caixa do Mês · Semana · Dia) e sem o "até dd/mm/aaaa"
    if (st.prazo === 'ate') st.prazo = '';
    b.className = 'b-seg b-prazos'; b.setAttribute('role', 'group'); b.setAttribute('aria-label', 'Prazo');
    b.innerHTML = [['', 'Todas'], ['venc', 'Vencidas'], ['5', '5 dias'], ['10', '10 dias'], ['15', '15 dias'], ['30', '30 dias']].map((o) => '<button type="button" class="b-seg-bt" data-b-prazo="' + o[0] + '" aria-pressed="' + (st.prazo === o[0]) + '" aria-selected="' + (st.prazo === o[0]) + '">' + o[1] + '</button>').join('');
  }
  function conta() { const c = Q('[data-bt=conta]'); if (!c) return; const n = filtrar().length, un = cfg.unidade || ['linha', 'linhas']; c.textContent = cfg.conta ? cfg.conta(n, st.aba) : plural(n, un[0], un[1]); }   // Backup 85 (TB2): sempre à vista
  const tudo = () => { abas(); prazos(); quadro(); contarFx(); conta(); };
  el._redesenharB = tudo;
  tudo();
  if (!el._ligadoB) {
    el._ligadoB = true;
    el.addEventListener('input', (ev) => {
      const c2 = el._cfgB, s2 = E.tabB[c2.id], t = ev.target.dataset.bt;
      if (t === 'q') s2.q = ev.target.value; else if (t === 'l') s2.listas[ev.target.dataset.k] = ev.target.value;
      else if (['min', 'max'].includes(t)) s2[t] = ev.target.value;
      else if (['vde', 'vate', 'prazoate'].includes(t)) {
        // data digitada: só filtra quando a data está completa (ou o campo ficou vazio) — nada roda no meio da digitação
        const v = formatarDataBR(ev.target.value), i = isoDeDataBR(v); if (v && !i) return;
        if (t === 'prazoate') { s2.prazoAte = i; s2.prazo = i ? 'ate' : ''; } else s2[t] = i;
        if (i && dataBR(i) !== v) ev.target.value = dataBR(i);
      } else return;
      el._redesenharB();
    });
    el.addEventListener('click', (ev) => {
      const c2 = el._cfgB, s2 = E.tabB[c2.id], ch2 = c2.chave || ((r) => String(r.id)), t = ev.target.closest('[data-bt]'), tt = t && t.dataset.bt;
      if (tt === 'painel') { s2.painel = !s2.painel; el.querySelector('[data-bt=pn]').hidden = !s2.painel; t.setAttribute('aria-expanded', s2.painel); return; }
      if (tt === 'limpar') { s2.q = ''; s2.listas = {}; s2.vde = s2.vate = s2.min = s2.max = ''; s2.prazo = s2.prazoAte = ''; tabelaB(el, c2); return; }
      const pz = ev.target.closest('[data-b-prazo]'); if (pz) { s2.prazo = pz.dataset.bPrazo; s2.prazoAte = ''; el._redesenharB(); return; }
      if (tt === 'desmarcar') { s2.sel = {}; el._redesenharB(); return; }
      if (tt === 'loteon') { s2.loteOn = !s2.loteOn; s2.sel = {}; t.setAttribute('aria-pressed', s2.loteOn); t.lastChild.textContent = s2.loteOn ? 'Fechar marcação' : 'Marcar várias'; el._redesenharB(); return; }
      if (tt === 'mais') { s2.limite += 150; el._redesenharB(); return; }
      if (tt === 'todas') { const marcar = t.checked; s2.sel = {}; if (marcar) el.querySelectorAll('tbody tr[data-b-k]').forEach((tr) => { s2.sel[tr.dataset.bK] = true; }); el._redesenharB(); return; }
      if (tt === 'um') { const k = t.closest('tr').dataset.bK; if (t.checked) s2.sel[k] = true; else delete s2.sel[k]; el._redesenharB(); return; }
      const ab = ev.target.closest('[data-b-aba]'); if (ab && el.contains(ab)) { s2.aba = ab.dataset.bAba; s2.sel = {}; s2.limite = 150; el._redesenharB(); return; }
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
try { localStorage.removeItem('erp_compacto'); } catch (e) { /* Backup 88: a tabela compacta saiu */ }

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
// Backup 83: o desenho do ambiente em todas as telas, pela peça única — "+ Texto" num botão vira o ícone + do ambiente,
// e o título de cartão perde a figurinha (emoji) do começo
const EMOJI_INI_B = /^\s*(?:\p{Extended_Pictographic}|[⚖⚠✉☰⏱])\uFE0F?\s*/u;
function enfeitarB() {
  document.querySelectorAll('.gs button.btn:not([data-b-enf]), .gs a.btn:not([data-b-enf])').forEach((b) => {
    b.setAttribute('data-b-enf', '1');
    const n = b.firstChild; if (!n || n.nodeType !== 3 || !/^\s*\+\s+\S/.test(n.nodeValue)) return;
    n.nodeValue = n.nodeValue.replace(/^\s*\+\s+/, ''); b.insertAdjacentHTML('afterbegin', iconeB('mais')); b.classList.add('b-bt-ic');
  });
  document.querySelectorAll('.gs .card-hd:not([data-b-enf])').forEach((h) => {
    h.setAttribute('data-b-enf', '1');
    const n = h.firstChild; if (n && n.nodeType === 3 && EMOJI_INI_B.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(EMOJI_INI_B, '');
  });
}
(() => {
  let agendado = false;
  const agendar = () => { if (agendado) return; agendado = true; requestAnimationFrame(() => { agendado = false; paginarTabelas(); nomearBotoesIcone(); mascararCampos(); enfeitarB(); }); };
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
// Backup 79: data digitada "dd/mm/aaaa" (no lugar do calendário do navegador, que aparece como mm/dd/yyyy em alguns computadores)
function formatarDataBR(txt) { const d = String(txt || '').replace(/\D/g, '').slice(0, 8); return d.length > 4 ? d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4) : d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d; }
// "31/11/2025" → "2025-11-30" (dia acima do fim do mês vira o último dia); incompleta ou inválida → ''
function isoDeDataBR(txt) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(txt || '').trim()); if (!m) return '';
  const a = +m[3], me = +m[2]; if (me < 1 || me > 12 || a < 1900) return '';
  const ult = new Date(a, me, 0).getDate(), d = Math.min(Math.max(+m[1], 1), ult);
  return a + '-' + String(me).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
function campoDataB(attrs, iso, rotulo) { return '<input type="text" inputmode="numeric" data-mascara="data" placeholder="dd/mm/aaaa" maxlength="10" class="b-data-br" ' + attrs + ' aria-label="' + esc(rotulo || 'Data') + '" value="' + (iso ? dataBR(iso) : '') + '">'; }
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
  const novo = t === 'brl' ? formatarBRL(antes, final) : t === 'data' ? formatarDataBR(antes) : formatarTel(antes);
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
// Backup 52 (O1): a cópia ainda vale (menos de 60 s e nenhuma gravação desde então)?
function cadastrosEmDia() { return !!_cadQuando && Date.now() - _cadQuando < 60000; }

// ═══ Backup 80 (M4): LER A GUIA EM PDF — valor e vencimento saem do próprio arquivo (pdf.js de vendor/, carregado só quando precisa).
// Se o pdf.js não carregar, um leitor simples procura o texto nos blocos do PDF. Devolve { nome, valor (número|null), venc ('aaaa-mm-dd'|null) }.
let _pdfJs = null;
function carregarPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!_pdfJs) _pdfJs = new Promise((ok, falha) => { const s = document.createElement('script'); s.src = 'vendor/pdf-3.11.174.min.js';
    s.onload = () => { try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf-3.11.174.worker.min.js'; } catch (e) { /* sem worker: o pdf.js usa o modo lento */ } ok(window.pdfjsLib); };
    s.onerror = () => { _pdfJs = null; falha(new Error('leitor de PDF indisponível')); }; document.head.appendChild(s); });
  return _pdfJs;
}
async function textoPdfJs(buf) {
  const lib = await carregarPdfJs(), doc = await lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise, pags = [];
  for (let i = 1; i <= Math.min(doc.numPages, 3); i++) { const t = await (await doc.getPage(i)).getTextContent(); pags.push(t.items.map((it) => it.str).join(' ')); }
  return pags.join('\n');
}
async function textoPdfSimples(buf) {
  const bytes = new Uint8Array(buf); let bruto = ''; for (let i = 0; i < bytes.length; i++) bruto += String.fromCharCode(bytes[i]);
  const partes = [bruto], re = /stream\r?\n/g; let m; const tarefas = [];
  while ((m = re.exec(bruto))) { const ini = m.index + m[0].length, fim = bruto.indexOf('endstream', ini); if (fim < 0) break;
    if (/FlateDecode/.test(bruto.slice(Math.max(0, m.index - 300), m.index)) && window.DecompressionStream)
      tarefas.push(new Response(new Blob([bytes.slice(ini, fim)]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()
        .then((b) => { const u = new Uint8Array(b); let s = ''; for (let j = 0; j < u.length; j++) s += String.fromCharCode(u[j]); partes.push(s); }).catch(() => {})); }
  await Promise.all(tarefas);
  const out = []; partes.forEach((p) => { const r2 = /\(((?:\\.|[^\\)])*)\)\s*T[jJ]/g; let mm; while ((mm = r2.exec(p))) out.push(mm[1].replace(/\\([()\\])/g, '$1')); });
  return out.join('\n');
}
function extrairGuia(txt) {
  const t = String(txt || '').replace(/\s+/g, ' ');
  const v = t.match(/valor(?:\s+total)?(?:\s+a\s+pagar)?(?:\s+do\s+documento)?\s*(?:\(r\$\))?\s*[:\-]?\s*(?:r\$\s*)?([\d.]{1,12},\d{2})/i) || t.match(/r\$\s*([\d.]{1,12},\d{2})/i);
  const d = t.match(/(?:data\s+de\s+)?vencimento\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i) || t.match(/pag(?:ar|ável)\s+até\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i) || t.match(/(\d{2}\/\d{2}\/\d{4})/);
  return { valor: v ? lerValor(v[1]) : null, venc: d ? d[1].split('/').reverse().join('-') : null };
}
async function lerPdfGuia(arquivo) {
  if (!arquivo || !/pdf$/i.test(arquivo.type || arquivo.name || '')) return { nome: arquivo && arquivo.name, valor: null, venc: null };
  const buf = await arquivo.arrayBuffer();
  let t = ''; try { t = await textoPdfJs(buf.slice(0)); } catch (e) { t = await textoPdfSimples(buf).catch(() => ''); }
  return Object.assign(extrairGuia(t), { nome: arquivo.name });
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


