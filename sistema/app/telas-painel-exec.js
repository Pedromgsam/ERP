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
const CORES_LINHA = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)', 'var(--chart-8)', 'var(--chart-7)'];

function estadoPE() { E.pe = E.pe || { grupo: '', empresa: '', evo: { visao: 'total', meses: 6, dados: null, lidoMeses: 0 } }; return E.pe; }

// ── números do Painel (as regras do renderResumo antigo) ──
function numerosPainel(D, P) {
  const base = D.baseDados || [];
  const data = base.filter((r) => (!P.grupo || r.grupo === P.grupo) && (!P.empresa || r.nome === P.empresa));
  const somaF = (k) => data.filter((r) => P.empresa || r.isPJ !== false).reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const rfb = somaF('rfb') + somaF('rfbNeg'), pgfn = somaF('pgfn') + somaF('pgfnNeg'), age = somaF('ageMG') + somaF('ageMGNeg');
  // parcelamentos: sem repetidos, do recorte, sem os concluídos
  const vistos = new Set(), bdDe = (p) => base.find((b) => b.nome === p.empresa || b.cpfCnpj === p.cnpj);
  const parcs = (D.parcelamentos || []).filter((p) => { const k = [p.empresa, p.natureza, p.local, p.numero || ''].join('|'); if (vistos.has(k)) return false; vistos.add(k); return true; })
    .filter((p) => { if (!P.grupo && !P.empresa) return true; const bd = bdDe(p); return !!bd && (!P.grupo || bd.grupo === P.grupo) && (!P.empresa || bd.nome === P.empresa); })
    .filter((p) => { const pend = (p.parcelas || []).some((x) => x.pagamento !== 'SIM'); if (pend) return true; const tot = Number(p.totalParcelas) || 0; return !(tot > 0 ? (Number(p.parcelasPagas) || 0) >= tot : (p.parcelas || []).length > 0); });
  const saldoParc = parcs.reduce((s, p) => s + (Number(p.residual) || 0), 0);
  const emp = (P.empresa || '').toLowerCase();
  const acs = (D.acordos || []).filter((a) => (!P.grupo || a.grupo === P.grupo) && (!emp || String(a.devedor || '').toLowerCase().includes(emp) || String(a.credor || '').toLowerCase().includes(emp)));
  const acAbertos = acs.filter((a) => a.situacao !== 'Pago'), acPagar = acAbertos.reduce((s, a) => s + (Number(a.valor) || 0), 0);
  // processos: o grupo escolhido (ou o da empresa); um processo com vários réus/autores conta uma vez
  const gEf = P.grupo || (P.empresa ? (base.find((r) => r.nome === P.empresa) || {}).grupo || '' : '');
  const porNum = new Map();
  (D.processos || []).filter((p) => !gEf || p.grupo === gEf).forEach((p) => { if (!p.numero) return; const x = porNum.get(p.numero);
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
  const grupos = unicosB(base.map((r) => r.grupo)), emps = unicosB(base.filter((r) => !P.grupo || r.grupo === P.grupo).map((r) => r.nome));
  if (P.empresa && !emps.includes(P.empresa)) P.empresa = '';
  const N = numerosPainel(D, P), t = (v) => '<span title="' + esc(brl(v)) + '">' + esc(brlCurto(v)) + '</span>';
  c.innerHTML = cabecalhoTela({ icone: 'pizza', titulo: 'Painel executivo', frase: 'Passivo tributário dos clientes, parcelamentos, acordos e processos — num lugar só.' }) +
    '<div class="b-fin-topo b-pe-topo"><select id="pe-grupo" aria-label="Grupo"><option value="">Todos os grupos</option>' + grupos.map((g) => '<option' + (P.grupo === g ? ' selected' : '') + '>' + esc(g) + '</option>').join('') + '</select>' +
      '<select id="pe-emp" aria-label="Empresa"><option value="">Todas as empresas</option>' + emps.map((e) => '<option' + (P.empresa === e ? ' selected' : '') + '>' + esc(e) + '</option>').join('') + '</select>' +
      '<span class="b-pe-conta">' + plural(N.data.length, 'entidade', 'entidades') + ' · ' + plural(unicosB(N.data.map((r) => r.grupo)).length, 'grupo', 'grupos') + '</span></div>' +
    '<div id="pe-nums">' + numsFaixa([['Passivo total', t(N.total), 'RFB ' + brlCurto(N.rfb) + ' · PGFN ' + brlCurto(N.pgfn) + ' · AGE/MG ' + brlCurto(N.age)], ['Parcelamentos (saldo)', t(N.saldoParc), plural(N.nParc, 'ativo', 'ativos')],
      ['Acordos (em aberto)', t(N.acPagar), plural(N.nAc, 'parcela', 'parcelas')], ['Passivo em disputa', t(N.passivo), plural(N.nProc, 'processo', 'processos'), N.passivo ? 'b-verm' : ''], ['Ativo em disputa', t(N.ativo), '', N.ativo ? 'b-verde' : '']]) + '</div>' +
    '<section class="b-fin-cartao" id="pe-evo"><div class="b-fin-hd b-pe-evo-hd"><div><h3>Evolução do passivo</h3><p id="pe-evo-sub"></p></div>' +
      '<div class="b-pe-evo-ctl"><div class="b-seg b-seg-mini" id="pe-evo-visao"><button type="button" class="b-seg-bt" data-v="total">Tudo junto</button><button type="button" class="b-seg-bt" data-v="linhas">' + (P.grupo ? 'Uma linha por empresa' : 'Uma linha por grupo') + '</button></div>' +
      '<select id="pe-evo-meses" aria-label="Período"><option value="6">6 meses</option><option value="12">12 meses</option><option value="24">24 meses</option></select></div></div>' +
      '<div class="b-pe-evo-res" id="pe-evo-res"></div><div class="b-fin-graf" id="pe-evo-graf"><div class="carregando">Carregando…</div></div>' +
      '<p class="b-fin-mostra">Soma de RFB, PGFN, SEFAZ e AGE/MG (em aberto + negociado). O valor de cada mês é o que estava cadastrado no último dia do mês.</p></section>' +
    '<div class="b-sec"><div><h2>Empresas do grupo</h2></div></div><div id="pe-nova"></div>';
  $('pe-grupo').onchange = (ev) => { P.grupo = ev.target.value; P.empresa = ''; TELAS.painelExec(); };
  $('pe-emp').onchange = (ev) => { P.empresa = ev.target.value; TELAS.painelExec(); };
  $('pe-evo-meses').value = String(P.evo.meses);
  $('pe-evo-meses').onchange = (ev) => { P.evo.meses = Number(ev.target.value); P.evo.dados = null; evolucaoPE(); };
  $('pe-evo-visao').onclick = (ev) => { const b = ev.target.closest('[data-v]'); if (!b) return; P.evo.visao = b.dataset.v; evolucaoPE(); };
  evolucaoPE();
  empresasPE(N.data);
};

async function evolucaoPE() {
  const P = estadoPE(), ev = P.evo, gr = $('pe-evo-graf'); if (!gr) return;
  document.querySelectorAll('#pe-evo-visao [data-v]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.v === ev.visao)));
  if (!ev.dados || ev.lidoMeses !== ev.meses) {
    try { ev.dados = await q(sb.rpc('evolucao_passivo', { p_grupo: null, p_meses: ev.meses })) || []; ev.lidoMeses = ev.meses; }
    catch (e) { gr.innerHTML = '<p class="msg-erro">Não foi possível ler a evolução: ' + esc(erroAmigavel(e)) + '</p>'; return; }
  }
  const linhas = ev.dados.filter((x) => (!P.grupo || x.grupo === P.grupo) && (!P.empresa || x.cliente === P.empresa));
  const meses = unicosB(ev.dados.map((x) => x.mes)), comDado = new Set(linhas.filter((x) => x.total != null).map((x) => x.mes));
  while (meses.length > 2 && !comDado.has(meses[0])) meses.shift();   // começa no 1º mês com passivo lançado
  const chave = ev.visao === 'total' ? () => P.empresa || P.grupo || 'Todos os grupos' : P.grupo ? (x) => x.cliente : (x) => x.grupo;
  const S = {}; linhas.forEach((x) => { if (x.total == null) return; const k = chave(x); (S[k] = S[k] || {})[x.mes] = (S[k][x.mes] || 0) + (Number(x.total) || 0); });
  const ult = meses[meses.length - 1], nomes = Object.keys(S).sort((a, b) => (S[b][ult] || 0) - (S[a][ult] || 0));
  const tot = (m) => linhas.filter((x) => x.mes === m && x.total != null).reduce((s, x) => s + (Number(x.total) || 0), 0);
  const ini = tot(meses[0]), fim = tot(ult), dif = fim - ini;
  $('pe-evo-sub').textContent = P.grupo ? 'Empresas do grupo ' + P.grupo + ', mês a mês' : 'Grupos, mês a mês';
  $('pe-evo-res').innerHTML = meses.length ? '<span><b>' + esc(brl(fim)) + '</b> hoje</span><span class="' + (dif > 0 ? 'b-verm-v' : dif < 0 ? 'b-verde-v' : '') + '">' + (dif > 0 ? '▲ ' : dif < 0 ? '▼ ' : '') + esc(brl(Math.abs(dif))) +
    (ini ? ' (' + (dif / ini * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%)' : '') + ' desde ' + esc(rotMesB(meses[0])) + '</span>' : '';
  gr.innerHTML = graficoLinhasB(meses, nomes.map((n, i) => ({ nome: n, cor: nomes.length === 1 ? 'var(--primario)' : CORES_LINHA[i % CORES_LINHA.length], valores: meses.map((m) => (S[n][m] == null ? null : S[n][m])) })), { titulo: 'Evolução do passivo' });
}

function empresasPE(base) {
  const el = $('pe-nova'); if (!el) return;
  const cli = E.clientes || [], areaDe = (r) => (cli.find((x) => x.id === r._id) || {}).area || 'ambos';
  const tot = (r) => (r.rfb || 0) + (r.rfbNeg || 0) + (r.pgfn || 0) + (r.pgfnNeg || 0) + (r.ageMG || 0) + (r.ageMGNeg || 0);
  const orgao = (v, n) => ((v || 0) + (n || 0) > 0 ? '<b class="b-pe-v" title="' + esc(brl(v || 0)) + '">' + esc(brlCurto(v || 0)) + '</b>' + (n > 0 ? '<small class="b-pe-neg" title="' + esc(brl(n)) + '">' + esc(brlCurto(n)) + ' neg.</small>' : '') : '<span class="sub">—</span>');
  const sit = (r) => String(r.sitCadastral || '').trim();
  const ops = (f) => unicosB(base.map(f)).map((x) => [x, x]);
  const op = (r) => (/^sim$/i.test(r.emOperacao || '') ? 'Sim' : /^n[aã]o$/i.test(r.emOperacao || '') ? 'Não' : '');
  tabelaB(el, { id: 'empresas', tabCls: 'b-tab-pe', linhas: base, chave: (r) => String(r._id), unidade: ['empresa', 'empresas'],
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
  const L = D.processos, P = L.filter((p) => p.carteira !== 'Prospecção');
  const podeEd = pode('juridico', 'editar');
  c.innerHTML = cabecalhoTela({ icone: 'documento', titulo: 'Processos', frase: 'Carteira judicial dos clientes: andamento, valores e movimentações.', botao: podeEd ? { id: 'pr-novo', rotulo: 'Processo' } : null }) +
    '<section class="b-fin-cartao b-pr-res' + (E.prRes.aberto ? ' b-aberto' : '') + '" id="pr-res"><button type="button" class="b-pr-res-hd" id="pr-res-bt" aria-expanded="' + E.prRes.aberto + '"><span class="b-seta" aria-hidden="true">▸</span><h3>Resumo da carteira</h3><span class="b-sub">' +
      'clique para ver os números da carteira</span></button><div id="pr-res-corpo"' + (E.prRes.aberto ? '' : ' hidden') + '>' + resumoCarteira(L) + '</div></section>' +
    '<div id="pr-nova"></div>';
  $('pr-res-bt').onclick = () => { E.prRes.aberto = !E.prRes.aberto; $('pr-res').classList.toggle('b-aberto', E.prRes.aberto); $('pr-res-bt').setAttribute('aria-expanded', String(E.prRes.aberto)); $('pr-res-corpo').hidden = !E.prRes.aberto; };
  if ($('pr-novo')) $('pr-novo').onclick = () => window.ERP_EDITOR && window.ERP_EDITOR.abrirFormulario('processos', null, { carteira: 'Ativo', status: 'Em andamento' });
  const sit = (p) => (p.arquivamento === 'Arquivado' ? 'arq' : p.arquivamento ? 'ext' : 'at');
  const ops = (f) => unicosB(P.map(f)).map((x) => [x, x]);
  const partes = (p) => [p.autor, p.reu].filter(Boolean).map((x) => String(x).replace(/;\s*/g, ' · '));
  tabelaB($('pr-nova'), { id: 'processos', tabCls: 'b-tab-proc', linhas: P, chave: (p) => String(p._id), unidade: ['processo', 'processos'], dicaBusca: 'Nº, grupo, autor, réu…',
    abas: [{ id: 'at', rot: 'Ativos', f: (p) => sit(p) === 'at' }, { id: 'arq', rot: 'Arquivados', f: (p) => sit(p) === 'arq' }, { id: 'ext', rot: 'Extintos', f: (p) => sit(p) === 'ext' }, { id: 'todos', rot: 'Todos', f: () => true }],
    busca: (p) => [p.numero, p.grupo, p.autor, p.reu, p.natureza, p.competencia, p.advogado, p.obs].join(' '), valor: (p) => Number(p.valor) || 0,
    conta: (n) => plural(n, 'processo', 'processos'), ord: { k: 'g', dir: 1 },
    listas: [{ k: 'g', rot: 'Grupo', todos: 'Todos os grupos', opcoes: ops((p) => p.grupo), get: (p) => p.grupo },
      { k: 'comp', rot: 'Competência', todos: 'Todas as competências', opcoes: ops((p) => p.competencia), get: (p) => p.competencia },
      { k: 'nat', rot: 'Natureza', todos: 'Todas as naturezas', opcoes: ops((p) => p.natureza), get: (p) => p.natureza },
      { k: 'adv', rot: 'Advogado', todos: 'Todos os advogados', opcoes: ops((p) => p.advogado), get: (p) => p.advogado }],
    colunas: [
      { k: 'g', rot: 'Grupo', html: (p) => esc(p.grupo || '—'), ord: (p) => (p.grupo || '').toLowerCase() },
      { k: 'n', rot: 'Processo', cls: 'b-num', html: (p) => esc(p.numero || '—') + (p.competencia ? '<span class="b-sub">' + esc(p.competencia) + '</span>' : ''), ord: (p) => p.numero || '' },
      { k: 'nat', rot: 'Natureza', html: (p) => esc(p.natureza || '—'), ord: (p) => p.natureza || '' },
      { k: 'pt', rot: 'Partes', html: (p) => { const x = partes(p); return x.length ? esc(x[0]) + (x[1] ? '<span class="b-sub">× ' + esc(x[1]) + '</span>' : '') : '—'; }, ord: (p) => (p.autor || '').toLowerCase() },
      { k: 'v', rot: 'Valor', cls: 'b-dir b-val', soma: true, html: (p) => (p.valor ? brl(p.valor) + (p.valorEm ? '<small>em ' + esc(p.valorEm) + '</small>' : '') : '—'), ord: (p) => Number(p.valor) || 0 },
      { k: 'mov', rot: 'Última movimentação', cls: 'b-cen b-data', html: (p) => { const d = p.ultimaMovEm || p.atualizacao, i = isoDeBRp(d), velho = i && i < somarDias(hojeISO(), -30);
        return d ? (velho ? '<span class="b-pz-r" title="Mais de 30 dias sem novidade">' + esc(d) + '</span>' : esc(d)) + (p.ultimaMov ? '<small title="' + esc(p.ultimaMov) + '">' + esc(String(p.ultimaMov).slice(0, 40)) + '</small>' : '') : '—'; }, ord: (p) => isoDeBRp(p.ultimaMovEm || p.atualizacao) || '0' },
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
    ['Passivo em disputas', esc(brl(vP)), 'cliente como réu', vP ? 'b-verm' : ''], ['Ativo em disputas', esc(brl(vA)), 'cliente como autor', vA ? 'b-verde' : '']]) +
    '<div class="b-pr-res-tres">' + agrupa('grupo', 'Grupo') + agrupa('competencia', 'Tribunal') + agrupa('natureza', 'Natureza') + '</div>';
}

// ═══════════════════════════════ PORTAL DO CLIENTE — Início ═══════════════════════════════
// Backup 78 (pedido): o Início do cliente é só uma introdução — boas-vindas, uma linha de situação (em dia ou em atraso)
// e os atalhos para Parcelamentos, Acordos e Processos. Os números e as listas ficam em cada tela.
TELAS.portalInicio = async function () {
  const D = dbE(), c = $('conteudo');
  if (!Array.isArray(D.baseDados)) { c.innerHTML = '<div class="carregando">Carregando…</div>'; return; }
  const s = window.AC_SESSION || {}, grupos = String(s.grupos || '').split(',').map((g) => g.trim()).filter(Boolean);
  const noGrupo = (g) => !grupos.length || grupos.includes(g);
  const empresas = (D.baseDados || []).filter((b) => noGrupo(b.grupo)), nomesEmp = new Set(empresas.map((b) => b.nome));
  const parc = (D.parcelamentos || []).filter((p) => nomesEmp.has(p.empresa) || (p.grupoNome && noGrupo(p.grupoNome)));
  const h = hojeISO(), isoP = (x) => x.vencIso || brIsoB(x.vencimento);
  let atr = 0;
  parc.forEach((p) => (p.parcelas || []).forEach((x) => { const v = isoP(x); if (x.pagamento !== 'SIM' && v && v < h) atr++; }));
  (D.acordos || []).filter((a) => noGrupo(a.grupo) && a.pagamento !== 'SIM' && a.situacao !== 'Pago').forEach((a) => { const v = a.vencIso || brIsoB(a.vencimento); if (v && v < h) atr++; });
  const titulo = grupos.length === 1 ? grupos[0] : (s.nome || 'cliente');
  const atalho = (ir, rot, txt) => '<button type="button" class="pt-tile" data-pt-ir="' + ir + '"><span>' + esc(rot) + '</span><small>' + esc(txt) + '</small></button>';
  c.innerHTML = '<div id="pt-home" class="pt-home">' +
    '<section class="pt-banda"><div><div class="pt-marca">Araújo &amp; Castro</div><div class="pt-marca-s">Portal do cliente</div></div><div class="pt-banda-dir">' + esc(titulo) + '<small>' + plural(empresas.length, 'empresa', 'empresas') + '</small></div></section>' +
    '<section class="pt-ola"><h1>Olá, ' + esc(titulo) + '!</h1><p>Este é o seu espaço no escritório. Aqui você acompanha, a qualquer hora, os parcelamentos, os acordos e os processos das suas empresas. Escolha abaixo por onde começar.</p></section>' +
    '<div class="pt-situacao ' + (atr ? 'pt-sit-atr' : 'pt-sit-ok') + '">' + (atr ? plural(atr, 'parcela em atraso', 'parcelas em atraso') + ' — fale com o escritório.' : 'Tudo em dia: nenhuma parcela em atraso.') + '</div>' +
    '<section class="pt-tiles pt-tiles-3">' + atalho('parcelamentos', 'Parcelamentos', 'Cada parcelamento, o que vence e as guias prontas') +
      atalho('acordos', 'Acordos', 'Os acordos com terceiros e as parcelas') + atalho('processos', 'Processos', 'Os processos das suas empresas e a última movimentação') + '</section>' +
    '<p class="pt-contato">Alguma dúvida? Fale com o escritório pelo seu contato de sempre (WhatsApp ou e-mail) — nossa equipe responde.</p></div>';
  c.querySelector('#pt-home').onclick = (ev) => { const b = ev.target.closest('[data-pt-ir]'); if (b) irParaTela(b.dataset.ptIr); };
};
const brIsoB = (d) => (/^\d{2}\/\d{2}\/\d{4}$/.test(d || '') ? d.split('/').reverse().join('-') : (/^\d{4}-\d{2}-\d{2}/.test(d || '') ? String(d).slice(0, 10) : ''));
