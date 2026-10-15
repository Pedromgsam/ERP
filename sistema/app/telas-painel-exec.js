'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// PAINEL EXECUTIVO e PROCESSOS da equipe — Backup 76 (S2 + S3): telas inteiras nas peças novas.
// Antes eram "misturadas": o ERP antigo calculava por baixo e a tela nova lia os números dele. Agora os números
// são calculados aqui, com as MESMAS regras do antigo (passivo só das PJ quando não há empresa escolhida, saldo
// dos parcelamentos não concluídos, acordos em aberto, passivo/ativo em disputa pelos nomes das empresas no réu/autor).
// Os dados são os que o ERP já carregou (DB). O portal do cliente continua com as telas dele (refeitas na S5).
// ═══════════════════════════════════════════════════════════════════════════

const dbE = () => dbParc() || {};
const unicosB = (l) => [...new Set(l.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));

function estadoPE() { E.pe = E.pe || { grupo: '', empresa: '', resp: '', evo: { visao: 'total', meses: 6, dados: null, lidoMeses: 0 } };
  // Backup 88: o filtro do alto (Grupo · Empresa · Responsável) fica à direita e fixo ao rolar — o estado dele em E.pe.f
  E.pe.f = E.pe.f || { grupo: E.pe.grupo || '', emp: E.pe.empresa || '', resp: E.pe.resp || '' };
  E.pe.grupo = E.pe.f.grupo; E.pe.empresa = E.pe.f.emp; E.pe.resp = E.pe.f.resp; return E.pe; }
const nome1PE = (s) => String(s || '').trim().split(/\s+/)[0] || '';   // primeiro nome como foi escrito (Pedro, Emanuelle…)
const respPE = (r) => nome1PE(r && r.responsavel || '');

// ── números do Painel (as regras do renderResumo antigo) ──
function numerosPainel(D, P) {
  const base = D.baseDados || [];
  const data = base.filter((r) => (!P.grupo || r.grupo === P.grupo) && (!P.empresa || r.nome === P.empresa) && (!P.resp || respPE(r) === P.resp));
  const noRecorte = new Set(data), gruposRec = new Set(data.map((r) => r.grupo));
  const somaF = (k) => data.filter((r) => P.empresa || r.isPJ !== false).reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const rfb = somaF('rfb') + somaF('rfbNeg'), pgfn = somaF('pgfn') + somaF('pgfnNeg'), age = somaF('ageMG') + somaF('ageMGNeg');
  // parcelamentos: sem repetidos, do recorte, sem os concluídos
  const vistos = new Set(), bdDe = (p) => base.find((b) => b.nome === p.empresa || b.cpfCnpj === p.cnpj);
  const parcs = (D.parcelamentos || []).filter((p) => { const k = [p.empresa, p.natureza, p.local, p.numero || ''].join('|'); if (vistos.has(k)) return false; vistos.add(k); return true; })
    .filter((p) => { if (!P.grupo && !P.empresa && !P.resp) return true; const bd = bdDe(p); return !!bd && noRecorte.has(bd); })
    .filter((p) => { const pend = (p.parcelas || []).some((x) => x.pagamento !== 'SIM'); if (pend) return true; const tot = Number(p.totalParcelas) || 0; return !(tot > 0 ? (Number(p.parcelasPagas) || 0) >= tot : (p.parcelas || []).length > 0); });
  const saldoParc = parcs.reduce((s, p) => s + (Number(p.residual) || 0), 0);
  const emp = (P.empresa || '').toLowerCase();
  const acs = (D.acordos || []).filter((a) => (!P.grupo || a.grupo === P.grupo) && (!P.resp || gruposRec.has(a.grupo)) && (!emp || String(a.devedor || '').toLowerCase().includes(emp) || String(a.credor || '').toLowerCase().includes(emp)));
  const acAbertos = acs.filter((a) => a.situacao !== 'Pago'), acPagar = acAbertos.reduce((s, a) => s + (Number(a.valor) || 0), 0);
  // processos: o grupo escolhido (ou o da empresa); um processo com vários réus/autores conta uma vez
  const gEf = P.grupo || (P.empresa ? (base.find((r) => r.nome === P.empresa) || {}).grupo || '' : '');
  const porNum = new Map();
  (D.processos || []).filter((p) => (!gEf || p.grupo === gEf) && (!P.resp || gruposRec.has(p.grupo))).forEach((p) => { if (!p.numero) return; const x = porNum.get(p.numero);
    if (!x) porNum.set(p.numero, Object.assign({}, p, { _r: [p.reu].filter(Boolean), _a: [p.autor].filter(Boolean) })); else { if (p.reu && !x._r.includes(p.reu)) x._r.push(p.reu); if (p.autor && !x._a.includes(p.autor)) x._a.push(p.autor); } });
  const procs = [...porNum.values()], nomes = unicosB(data.map((r) => r.nome)).map((n) => n.toLowerCase());
  let passivo = 0, ativo = 0; const totProc = procs.reduce((s, p) => s + (Number(p.valor) || 0), 0);
  if (nomes.length) {
    procs.forEach((p) => { const reu = p._r.join(' · ').toLowerCase(), aut = p._a.join(' · ').toLowerCase();
      if (nomes.some((n) => reu.includes(n))) passivo += Number(p.valor) || 0; if (nomes.some((n) => aut.includes(n))) ativo += Number(p.valor) || 0; });
    if (!passivo && !ativo && gEf) passivo = totProc;
  } else passivo = totProc;
  return { data, rfb, pgfn, age, total: rfb + pgfn + age, saldoParc, nParc: parcs.length, acPagar, nAc: acAbertos.length, passivo, ativo, nProc: procs.length };
}

TELAS.painelExec = async function () {
  const D = dbE(), P = estadoPE(), c = $('conteudo');
  if (!Array.isArray(D.baseDados)) { c.innerHTML = vazioB({ icone: 'pizza', titulo: 'Abra pelo ERP', frase: 'O Painel executivo usa os dados que o ERP carrega.' }); return; }
  const base = D.baseDados;
  const grupos = unicosB(base.filter((r) => !P.resp || respPE(r) === P.resp).map((r) => r.grupo)),
    emps = unicosB(base.filter((r) => (!P.grupo || r.grupo === P.grupo) && (!P.resp || respPE(r) === P.resp)).map((r) => r.nome)), resps = unicosB(base.map(respPE));
  if (P.empresa && !emps.includes(P.empresa)) P.empresa = P.f.emp = '';
  const N = numerosPainel(D, P), t = (v) => '<span title="' + esc(brl(v)) + '">' + esc(brlCurto(v)) + '</span>';
  c.innerHTML = cabecalhoTela({ icone: 'painel', titulo: 'Painel Executivo', frase: 'Passivo dos clientes e onde ele está' }) +
    filtroSusB('pe-filtro', [{ k: 'grupo', rot: 'Grupo', todos: 'Todos os grupos', opcoes: grupos, v: P.grupo }, { k: 'emp', rot: 'Empresa', todos: 'Todas as empresas', opcoes: emps, v: P.empresa },
      { k: 'resp', rot: 'Responsável', todos: 'Todos', opcoes: resps, v: P.resp }]) +
    '<div id="pe-nums">' + numsFaixa([['Passivo total', t(N.total), 'RFB ' + brlCurto(N.rfb) + ' · PGFN ' + brlCurto(N.pgfn) + ' · AGE/MG ' + brlCurto(N.age)], ['Parcelamentos (saldo)', t(N.saldoParc), plural(N.nParc, 'ativo', 'ativos')],
      ['Acordos (em aberto)', t(N.acPagar), plural(N.nAc, 'parcela', 'parcelas')], ['Passivo em disputa', t(N.passivo), plural(N.nProc, 'processo', 'processos'), 'b-verm'], ['Ativo em disputa', t(N.ativo), '', 'b-verde']]) + '</div>' +
    // Backup 83: como no ambiente — só o título e "6 meses · 12 meses"; a linha é o total do que está escolhido no alto (todos, um grupo ou uma empresa)
    '<section class="b-fin-cartao b-pe-evo" id="pe-evo"><div class="b-fin-hd b-pe-evo-hd"><div><h3>Evolução do passivo</h3></div>' +
      '<div class="b-chips" id="pe-evo-meses" role="group" aria-label="Período">' + [6, 12].map((m) => '<button type="button" class="b-chip" data-m="' + m + '">' + m + ' meses</button>').join('') + '</div></div>' +
      '<div id="pe-evo-graf"><div class="carregando">Carregando…</div></div></section>' +
    '<div class="b-sec"><div><h2>Empresas do grupo</h2></div></div><div id="pe-nova"></div>';
  ligarFiltroSusB('pe-filtro', P.f, () => TELAS.painelExec());
  $('pe-evo-meses').onclick = (ev) => { const b = ev.target.closest('[data-m]'); if (!b) return; P.evo.meses = Number(b.dataset.m); P.evo.dados = null; evolucaoPE(); };
  evolucaoPE();
  empresasPE(N.data);
};

async function evolucaoPE() {
  const P = estadoPE(), ev = P.evo, gr = $('pe-evo-graf'); if (!gr) return;
  if (![6, 12].includes(Number(ev.meses))) ev.meses = 6;
  document.querySelectorAll('#pe-evo-meses [data-m]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.m) === Number(ev.meses))));
  if (!ev.dados || ev.lidoMeses !== ev.meses) {
    try { ev.dados = await q(sb.rpc('evolucao_passivo', { p_grupo: null, p_meses: ev.meses })) || []; ev.lidoMeses = ev.meses; }
    catch (e) { gr.innerHTML = '<p class="msg-erro">Não foi possível ler a evolução: ' + esc(erroAmigavel(e)) + '</p>'; return; }
  }
  const nomesResp = P.resp ? new Set((dbE().baseDados || []).filter((r) => respPE(r) === P.resp).map((r) => r.nome)) : null;
  const linhas = ev.dados.filter((x) => (!P.grupo || x.grupo === P.grupo) && (!P.empresa || x.cliente === P.empresa) && (!nomesResp || nomesResp.has(x.cliente)) && x.total != null);
  const meses = unicosB(ev.dados.map((x) => x.mes)), comDado = new Set(linhas.map((x) => x.mes));
  while (meses.length > 2 && !comDado.has(meses[0])) meses.shift();   // começa no 1º mês com passivo lançado
  const tot = (m) => linhas.filter((x) => x.mes === m).reduce((s, x) => s + (Number(x.total) || 0), 0);
  const rot = (m) => rotMesB(m).toLowerCase();
  const ms = meses.filter((m) => comDado.has(m));
  while (ms.length > 1 && !tot(ms[0])) ms.shift();   // meses do começo com passivo zero não entram (a linha não "cai para zero")
  gr.innerHTML = graficoLinhaB(ms.map((m) => ({ rot: rot(m), v: tot(m), dica: rot(m) + ': ' + brl(tot(m)) })));
}

// Backup 84: o negociado em uma palavra, como no ambiente — "R$ 42 mil neg.", "R$ 8 mil neg." (abaixo de R$ 1.000, o valor inteiro)
const negCurto = (v) => (Math.abs(v) >= 1e6 ? brlCurto(v) : Math.abs(v) >= 1e3 ? 'R$ ' + Math.round(v / 1e3).toLocaleString('pt-BR') + ' mil' : brlCurto(v));
function empresasPE(base) {
  const el = $('pe-nova'); if (!el) return;
  const cli = E.clientes || [], areaDe = (r) => (cli.find((x) => x.id === r._id) || {}).area || 'ambos';
  const tot = (r) => (r.rfb || 0) + (r.rfbNeg || 0) + (r.pgfn || 0) + (r.pgfnNeg || 0) + (r.ageMG || 0) + (r.ageMGNeg || 0);
  const orgao = (v, n) => ((v || 0) + (n || 0) > 0 ? '<b class="b-pe-v" title="' + esc(brl(v || 0)) + '">' + esc(brlCurto(v || 0)) + '</b>' + (n > 0 ? '<small class="b-pe-neg" title="' + esc(brl(n)) + '">' + esc(negCurto(n)) + ' neg.</small>' : '') : '<span class="sub">—</span>');
  const sit = (r) => String(r.sitCadastral || '').trim();
  const ops = (f) => unicosB(base.map(f)).map((x) => [x, x]);
  const op = (r) => (/^sim$/i.test(r.emOperacao || '') ? 'Sim' : /^n[aã]o$/i.test(r.emOperacao || '') ? 'Não' : '');
  tabelaB(el, { id: 'empresas', tabCls: 'b-tab-pe', semContagemAbas: true, linhas: base, chave: (r) => String(r._id), unidade: ['empresa', 'empresas'],
    abas: [{ id: 'at', rot: 'Ativos', f: (r) => r.tipoCliente !== 'Inativo' }, { id: 'cons', rot: 'Consultoria', f: (r) => r.tipoCliente === 'Consultoria' },
      { id: 'pont', rot: 'Serviço pontual', f: (r) => r.tipoCliente === 'Serviço pontual' }, { id: 'in', rot: 'Inativos', f: (r) => r.tipoCliente === 'Inativo' }, { id: 'todos', rot: 'Todos', f: () => true }],
    busca: (r) => [r.nome, r.grupo, r.socioAdmin, r.cpfCnpj, String(r.cpfCnpj || '').replace(/\D/g, '')].join(' '), dicaBusca: 'Nome, sócio ou CPF/CNPJ…',
    conta: (n) => plural(n, 'empresa', 'empresas'), valor: tot, ord: { k: 'g', dir: 1 },
    listas: [{ k: 'area', rot: 'Área', todos: 'Todas as áreas', opcoes: [['juridico', 'Jurídico'], ['contabilidade', 'Contabilidade']], get: (r) => { const a = areaDe(r); return a === 'ambos' ? '' : a; } },
      { k: 'op', rot: 'Operação', todos: 'Operação: todas', opcoes: [['Sim', 'Em operação'], ['Não', 'Sem operação']], get: op },
      { k: 'sit', rot: 'Situação', todos: 'Situação: todas', opcoes: ops(sit), get: sit }],
    colunas: [
      { k: 'g', rot: 'Grupo', html: (r) => esc(r.grupo || '—'), ord: (r) => (r.grupo || '~').toLowerCase() },
      { k: 'nome', rot: 'Entidade / sócio', html: (r) => esc(r.nome || '—') + (r.isPJ !== false && String(r.socioAdmin || '').trim().length > 1 && r.socioAdmin !== '-' ? '<span class="b-sub">Sócio: ' + esc(r.socioAdmin) + '</span>' : ''), ord: (r) => (r.nome || '').toLowerCase() },
      { k: 'doc', rot: 'CPF/CNPJ', cls: 'b-num', html: (r) => esc(r.cpfCnpj || '—'), ord: (r) => r.cpfCnpj || '' },
      { k: 'rfb', rot: 'RFB', cls: 'b-dir', html: (r) => orgao(r.rfb, r.rfbNeg), ord: (r) => (r.rfb || 0) + (r.rfbNeg || 0) },
      { k: 'pgfn', rot: 'PGFN', cls: 'b-dir', html: (r) => orgao(r.pgfn, r.pgfnNeg), ord: (r) => (r.pgfn || 0) + (r.pgfnNeg || 0) },
      { k: 'age', rot: 'AGE/MG', cls: 'b-dir', html: (r) => orgao(r.ageMG, r.ageMGNeg), ord: (r) => (r.ageMG || 0) + (r.ageMGNeg || 0) },
      { k: 'tot', rot: 'Total', cls: 'b-dir b-val', soma: true, html: (r) => (tot(r) > 0 ? '<span title="' + esc(brl(tot(r))) + '">' + esc(brlCurto(tot(r))) + '</span>' : '<span class="sub">—</span>'), ord: tot },
      { k: 'op', rot: 'Operação', cls: 'b-cen', html: (r) => (op(r) === 'Sim' ? '<span class="b-pill b-g">Sim</span>' : op(r) === 'Não' ? '<span class="b-pill b-r">Não</span>' : '<span class="sub">—</span>'), ord: op },
      { k: 'sit', rot: 'Situação', cls: 'b-cen', html: (r) => { const s = sit(r); return s ? '<span class="b-pill ' + (/^ativa$/i.test(s) ? 'b-g' : 'b-r') + '">' + esc(s.toLowerCase().replace(/^./, (x) => x.toUpperCase())) + '</span>' : '<span class="sub">—</span>'; }, ord: sit }],
    clique: (r) => { if (r._id) Promise.resolve(carregarCadastros()).then(() => abrirFicha(r._id)); },
    vazio: { titulo: 'Nenhuma empresa aqui', frase: 'Troque a aba (Ativos, Consultoria, Serviço pontual, Inativos, Todos), o grupo ou limpe os filtros.' } });
}

// ═══════════════════════════════ PROCESSOS ═══════════════════════════════
const isoDeBRp = (d) => (/^\d{2}\/\d{2}\/\d{4}$/.test(d || '') ? d.split('/').reverse().join('-') : '');
TELAS.processosERP = async function () {
  const D = dbE(), c = $('conteudo');
  if (!Array.isArray(D.processos)) { c.innerHTML = vazioB({ icone: 'documento', titulo: 'Abra pelo ERP', frase: 'A lista de processos usa os dados que o ERP carrega.' }); return; }
  E.prRes = E.prRes || { aberto: false };
  E.prF = E.prF || { grupo: '', comp: '', adv: '' };
  // Backup 79: filtro suspenso (Grupo / Competência) — recorta o Resumo da carteira e a lista
  const F = E.prF, L0 = D.processos, L = L0.filter((p) => (!F.grupo || p.grupo === F.grupo) && (!F.comp || p.competencia === F.comp) && (!F.adv || nome1PE(p.advogado || '') === F.adv)), P = L.filter((p) => p.carteira !== 'Prospecção');
  const podeEd = pode('juridico', 'editar');
  c.innerHTML = cabecalhoTela({ icone: 'documento', titulo: 'Processos', frase: 'Processos dos clientes', botao: podeEd ? { id: 'pr-novo', rotulo: 'Processo' } : null }) +
    filtroSusB('pr-filtro', [{ k: 'grupo', rot: 'Grupo', todos: 'Todos os grupos', opcoes: unicosTxt(L0.map((p) => p.grupo)), v: F.grupo },
      { k: 'comp', rot: 'Competência', todos: 'Todas as competências', opcoes: unicosTxt(L0.filter((p) => !F.grupo || p.grupo === F.grupo).map((p) => p.competencia)), v: F.comp },
      // Backup 88: o advogado que acompanha o processo
      { k: 'adv', rot: 'Advogado', todos: 'Todos os advogados', opcoes: unicosTxt(L0.map((p) => nome1PE(p.advogado || ''))), v: F.adv }]) +
    '<section class="b-fin-cartao b-pr-res' + (E.prRes.aberto ? ' b-aberto' : '') + '" id="pr-res"><button type="button" class="b-pr-res-hd" id="pr-res-bt" aria-expanded="' + E.prRes.aberto + '"><span class="b-seta" aria-hidden="true">▸</span><h3>Resumo da carteira</h3><span class="b-sub">' +
      (F.grupo || F.comp ? esc([F.grupo, F.comp].filter(Boolean).join(' · ')) + ' · ' : '') + (() => { const at = L.filter((p) => !p.arquivamento); return plural(at.length, 'processo ativo', 'processos ativos') + ' · ' + esc(brlCurto(soma(at, (p) => Number(p.valor) || 0))) + ' em disputa'; })() + '</span></button><div id="pr-res-corpo"' + (E.prRes.aberto ? '' : ' hidden') + '>' + resumoCarteira(L) + '</div></section>' +
    '<div id="pr-nova"></div>';
  ligarFiltroSusB('pr-filtro', E.prF, () => TELAS.processosERP());
  $('pr-res-bt').onclick = () => { E.prRes.aberto = !E.prRes.aberto; $('pr-res').classList.toggle('b-aberto', E.prRes.aberto); $('pr-res-bt').setAttribute('aria-expanded', String(E.prRes.aberto)); $('pr-res-corpo').hidden = !E.prRes.aberto; };
  if ($('pr-novo')) $('pr-novo').onclick = () => window.ERP_EDITOR && window.ERP_EDITOR.abrirFormulario('processos', null, { carteira: 'Ativo', status: 'Em andamento' });
  const sit = (p) => (p.arquivamento === 'Arquivado' ? 'arq' : p.arquivamento ? 'ext' : 'at');
  const ops = (f) => unicosB(P.map(f)).map((x) => [x, x]);
  const partes = (p) => [p.autor, p.reu].filter(Boolean).map((x) => String(x).replace(/;\s*/g, ' · '));
  const trib = (p) => tribunalProcesso(p) || '', hojeP = new Date(hojeISO() + 'T12:00:00');
  const diasConf = (p) => { const i = isoDeBRp(p.ultimaMovEm); return i ? Math.floor((hojeP - new Date(i + 'T12:00:00')) / 864e5) : null; };
  tabelaB($('pr-nova'), { id: 'processos', contagem: true, tabCls: 'b-tab-proc', linhas: P, chave: (p) => String(p._id), unidade: ['processo', 'processos'], dicaBusca: 'Nº, grupo, autor, réu…',
    abas: [{ id: 'at', rot: 'Ativos', f: (p) => sit(p) === 'at' }, { id: 'arq', rot: 'Arquivados', f: (p) => sit(p) === 'arq' }, { id: 'ext', rot: 'Extintos', f: (p) => sit(p) === 'ext' }, { id: 'todos', rot: 'Todos', f: () => true }],
    busca: (p) => [p.numero, p.grupo, p.autor, p.reu, p.natureza, p.competencia, p.advogado, p.obs].join(' '), valor: (p) => Number(p.valor) || 0,
    conta: (n) => plural(n, 'processo', 'processos'), ord: { k: 'g', dir: 1 },
    // Backup 85 (PR4) / 86 (M06): Grupo, Tribunal, Natureza e Conferência, como no ambiente
    listas: [{ k: 'trib', rot: 'Tribunal', todos: 'Todos os tribunais', opcoes: ops(trib), get: trib },
      { k: 'nat', rot: 'Natureza', todos: 'Todas as naturezas', opcoes: ops((p) => p.natureza), get: (p) => p.natureza },
      { k: 'conf', rot: 'Conferência', todos: 'Conferidos e não conferidos', opcoes: [['nao', 'Sem conferir há 15 dias ou mais'], ['sim', 'Conferidos nos últimos 15 dias']], get: (p) => (diasConf(p) != null && diasConf(p) < 15 ? 'sim' : 'nao') }],
    colunas: [
      { k: 'g', rot: 'Grupo', html: (p) => esc(p.grupo || '—'), ord: (p) => (p.grupo || '').toLowerCase() },
      { k: 'n', rot: 'Processo', cls: 'b-num', html: (p) => esc(p.numero || '—') + (trib(p) || p.competencia ? '<span class="b-sub">' + esc(trib(p) || p.competencia) + '</span>' : ''), ord: (p) => p.numero || '' },   // Backup 85 (PR2): tribunal embaixo
      { k: 'nat', rot: 'Natureza', html: (p) => esc(p.natureza || '—'), ord: (p) => p.natureza || '' },
      { k: 'pt', rot: 'Partes', html: (p) => { const x = partes(p); return x.length ? esc(x[0]) + (x[1] ? '<span class="b-sub">× ' + esc(x[1]) + '</span>' : '') : '—'; }, ord: (p) => (p.autor || '').toLowerCase() },
      { k: 'v', rot: 'Valor', cls: 'b-dir b-val', soma: true, html: (p) => (p.valor ? brl(p.valor) : '—'), ord: (p) => Number(p.valor) || 0 },
      { k: 'mov', rot: 'Última movimentação', cls: 'b-data b-mov', html: (p) => { const d = p.ultimaMovEm || p.atualizacao, i = isoDeBRp(d), velho = i && i < somarDias(hojeISO(), -30);
        return d ? (velho ? '<span class="b-pz-r" title="Mais de 30 dias sem novidade">' + esc(d) + '</span>' : esc(d)) + (p.ultimaMov ? '<small title="' + esc(p.ultimaMov) + '">' + esc(String(p.ultimaMov).slice(0, 40)) + '</small>' : '') : '—'; }, ord: (p) => isoDeBRp(p.ultimaMovEm || p.atualizacao) || '0' },
      // Backup 85 (PR1): "Conferido" — data da última conferência (verde até 15 dias; âmbar depois; "nunca" em vermelho)
      { k: 'conf', rot: 'Conferido', cls: 'b-cen b-data', html: (p) => { const d = diasConf(p); return d == null ? '<span class="b-pz-r">nunca</span>' : '<span class="' + (d < 15 ? 'b-ok-txt' : 'b-pz-a') + '">' + esc(String(p.ultimaMovEm).slice(0, 5)) + '</span>'; }, ord: (p) => isoDeBRp(p.ultimaMovEm) || '0' },
      { k: 'st', rot: 'Status', cls: 'b-cen', html: (p) => '<span class="b-pill ' + (sit(p) === 'at' ? 'b-g' : sit(p) === 'arq' ? 'b-a' : 'b-r') + '">' + esc(p.arquivamento || 'Ativo') + '</span>', ord: sit }],
    clique: (p) => (window.ERP_ABRIR_PROCESSO ? window.ERP_ABRIR_PROCESSO(p) : null),
    vazio: { titulo: 'Nenhum processo aqui', frase: 'Troque a aba (Ativos, Arquivados, Extintos, Todos) ou limpe os filtros.', botao: podeEd ? ['+ Processo', '#pr-novo'] : null } });
};
// "Resumo da carteira" (o renderProcAnalise antigo, com os ajustes dos Backups 16/27): o mesmo nº conta uma vez;
// Processos (em andamento / arquivados-extintos) · Valor em disputa · Passivo em disputas (cliente réu) · Ativo em disputas (cliente autor);
// e as tabelas por grupo, tribunal e natureza
function resumoCarteira(L0) {
  const vistos = {}, L = L0.filter((p) => { const k = String(p.numero || '').replace(/\D/g, '') || String(p.numero || '') || ('#' + Math.random()); if (vistos[k]) return false; vistos[k] = 1; return true; });
  if (!L.length) return '<p class="b-barras-vazio">Nenhum processo cadastrado.</p>';
  const v = (p) => Number(p.valor) || 0, tot = L.reduce((s, p) => s + v(p), 0), ativos = L.filter((p) => !String(p.arquivamento || '').trim()).length;
  const nomes = (dbE().baseDados || []).map((r) => String(r.nome || '').toLowerCase()).filter((n) => n.length > 2);
  const tem = (x) => { x = String(x || '').toLowerCase(); return nomes.some((n) => x.includes(n)); };
  const vP = L.filter((p) => tem(p.reu)).reduce((s, p) => s + v(p), 0), vA = L.filter((p) => tem(p.autor)).reduce((s, p) => s + v(p), 0);
  const agrupa = (campo, rot) => { const M = {}; L.forEach((p) => { const k = String(p[campo] || '').trim() || '—'; M[k] = M[k] || { n: 0, v: 0 }; M[k].n++; M[k].v += v(p); });
    const ks = Object.keys(M).sort((a, b) => M[b].v - M[a].v || M[b].n - M[a].n).slice(0, 10);
    return '<div class="b-pr-res-t"><div class="b-rola b-rola-solta" data-sem-pagina><table class="b-tab"><thead><tr><th>' + esc(rot) + '</th><th class="b-cen">Processos</th><th class="b-dir">Valor</th></tr></thead><tbody>' +
      ks.map((k) => '<tr><td>' + esc(k) + '</td><td class="b-cen">' + M[k].n + '</td><td class="b-dir">' + (M[k].v ? esc(brl(M[k].v)) : '—') + '</td></tr>').join('') + '</tbody></table></div></div>'; };
  return numsFaixa([['Processos', String(L.length), ativos + ' em andamento · ' + (L.length - ativos) + ' arquivados/extintos'], ['Valor em disputa', esc(brl(tot)), 'soma dos valores da causa'],
    ['Passivo em disputas', esc(brl(vP)), 'cliente como réu', 'b-verm'], ['Ativo em disputas', esc(brl(vA)), 'cliente como autor', 'b-verde']]) +
    '<div class="b-pr-res-tres">' + agrupa('grupo', 'Grupo') + agrupa('competencia', 'Tribunal') + agrupa('natureza', 'Natureza') + '</div>';
}

// Backup 81: o Início antigo do cliente (TELAS.portalInicio) saiu — o cliente entra no portal novo (telas-portal.js)
