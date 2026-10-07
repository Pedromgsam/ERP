'use strict';
// ═══════════════════════════════════════════════════════════════════
// Ponte entre o ERP (erp.html, o mesmo HTML de sempre) e o Supabase.
//
// O ERP foi escrito para conversar com o script do Google: faz fetch na
// URL do Apps Script e recebe JSON num formato próprio (baseDados,
// processos, parcelamentos, acordos, financeiro, financeiroContab…).
// Este arquivo intercepta essas chamadas e responde com os dados do
// Supabase NO MESMO FORMATO. Assim o ERP continua igual — telas, filtros,
// cálculos e particularidades (ex.: dívida de PF não somada no grupo) —
// e só a origem dos dados muda.
// ═══════════════════════════════════════════════════════════════════
// Colunas dos clientes que as telas usam: fica de fora a resposta completa da Receita (cnpj_dados,
// vários KB por cliente, só na ficha) e a chave técnica de importação. Coluna nova no banco → incluir aqui
// (o teste erp.js avisa quando a lista fica desatualizada).
window.ERP_COLS_CLIENTE = 'id,grupo_id,nome,cpf_cnpj,tipo,responsavel,email,telefone,endereco,cidade,estado,obs,criado_por,criado_em,atualizado_em,socio_admin,rfb,rfb_negociada,pgfn,pgfn_negociada,sefaz_mg,age_mg,age_mg_negociada,ceat_trt3,em_operacao,procuracao,certificado,cadastro_regular,capag,regime_tributario,situacao_cadastral,tipo_societario,historico_cadastral,origem,data_migracao,razao_social,nome_fantasia,cnae_principal,porte,data_abertura,data_situacao,cep,cnpj_atualizado_em,area,perfil_email,emails_tipos,indicado_por,drive_url,recebe_email';
(function () {
  const CFG = window.ERP_CONFIG || {};
  // link "criar nova senha" enviado por e-mail: o Supabase volta para cá com type=recovery
  window.ERP_RECUPERACAO = /type=recovery/.test(location.hash);
  const sb = window.supabase.createClient(CFG.url, CFG.chave);
  sb.auth.onAuthStateChange((ev) => {
    if (ev === 'PASSWORD_RECOVERY' && !window.ERP_RECUPERACAO) { window.ERP_RECUPERACAO = true; document.dispatchEvent(new CustomEvent('erp:recuperacao')); }
  });
  window.SB = sb;                       // usado pelo editor (editor.js)
  const fetchOriginal = window.fetch.bind(window);
  const ehScriptGoogle = (u) => /script\.google\.com\/macros\//.test(String(u || ''));

  // ─────────────────────────── utilidades ───────────────────────────
  const pad = (n) => String(n).padStart(2, '0');
  const br = (iso) => { if (!iso) return ''; const [a, m, d] = String(iso).slice(0, 10).split('-'); return d + '/' + m + '/' + a; };
  const hoje0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const hojeISO = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const dias = (iso) => { if (!iso) return 0; const [a, m, d] = iso.split('-').map(Number); return Math.round((new Date(a, m - 1, d) - hoje0()) / 86400000); };
  const num = (v) => (v == null || v === '' ? 0 : Number(v) || 0);
  const sn = (b) => (b === true ? 'SIM' : b === false ? 'NÃO' : '');
  const doc = (s) => {
    const d = String(s || '').replace(/\D/g, '');
    if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    return s ? String(s) : '';
  };
  const resposta = (obj) => new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } });
  async function todos(montar) {
    const out = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await montar().order('id').range(de, de + 999);   // Backup 37: 'id' desempata a ordem entre as páginas
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) return out;
    }
  }

  // ─────────────────── conversores: Supabase → formato do ERP ──────────
  // Espelham os leitores do script antigo (SCRIPT - MENU - ERP.gs).
  function baseDados(c, gNome) {
    return {
      _id: c.id, _t: 'clientes', grupo: gNome || '', nome: c.nome, cpfCnpj: doc(c.cpf_cnpj), socioAdmin: c.socio_admin || '',
      responsavel: c.responsavel || '', rfb: num(c.rfb), rfbNeg: num(c.rfb_negociada), pgfn: num(c.pgfn), pgfnNeg: num(c.pgfn_negociada),
      sefaz: num(c.sefaz_mg), ageMG: num(c.age_mg), ageMGNeg: num(c.age_mg_negociada), ceat: num(c.ceat_trt3),
      emOperacao: sn(c.em_operacao), procuracao: sn(c.procuracao), certificado: sn(c.certificado),
      capag: c.capag || '', regimeTrib: c.regime_tributario || '', sitCadastral: c.situacao_cadastral || '', tipoSoc: c.tipo_societario || '',
      email: c.email || '', telefone: c.telefone || '', endereco: c.endereco || '', cidade: c.cidade || '', estado: c.estado || '',
      tipoCliente: c.tipo || '', obs: c.obs || ''
    };
  }
  function processo(p, gNome) {
    const carteira = p.carteira === 'Prospecção' ? 'Prospecção' : 'Ativo';
    const st = p.status || (carteira === 'Prospecção' ? 'Em prospecção' : 'Em andamento');
    const arq = /arq/i.test(st) ? 'Arquivado' : /extint/i.test(st) ? 'Extinto' : /prescrit/i.test(st) ? 'Prescrito' : '';
    return {
      _id: p.id, _t: 'processos', abaProcesso: carteira === 'Prospecção' ? 'Prospecção' : 'Ativos', carteira, grupo: gNome || '',
      advogado: p.advogado || '', numero: p.numero, competencia: p.competencia || '', natureza: p.natureza || '',
      autor: p.autor || '', reu: p.reu || '', dataDistrib: br(p.data_distribuicao), valor: num(p.valor), atualizacao: br(p.atualizacao),
      procuracao: sn(p.procuracao), outroAdv: sn(p.outro_advogado), arquivamento: arq, statusOriginal: st,
      dataArqProv: br(p.data_arq_provisorio), prescricao: p.prescricao || '', obs: p.obs || '',
      ultimaMov: p.ultima_movimentacao || '', ultimaMovEm: br(p.ultima_movimentacao_em),   // Backup 28
      valorEm: br(p.valor_em)   // Backup 35: quando o valor da causa foi atualizado
    };
  }
  function parcelamento(pa, parcelas) {
    const h = hoje0(), hIso = hojeISO();
    const ini = new Date(h); ini.setMonth(ini.getMonth() - 12);
    const fim = new Date(h); fim.setMonth(fim.getMonth() + 18);
    const iIso = ini.toISOString().slice(0, 10), fIso = fim.toISOString().slice(0, 10);
    const ord = parcelas.slice().sort((a, b) => String(a.vencimento || '').localeCompare(String(b.vencimento || '')));
    const status = (x) => x.pago ? 'Pago' : (x.vencimento && x.vencimento <= hIso ? 'Inadimplente' : 'A Vencer');
    let prox = '', vencidas = 0;
    ord.forEach((x) => {
      if (!x.pago && x.vencimento && x.vencimento < hIso) vencidas++;
      if (!x.pago && x.vencimento && x.vencimento >= hIso && !prox) prox = x.vencimento;
    });
    const pagas = ord.filter((x) => x.pago).length;
    // Backup 34: valor de cada parcela = o lançado nela; sem lançamento, vale o último lançado antes dela; sem nenhum, o "valor da última parcela"
    let ultimoLancado = null;
    ord.forEach((x) => { if (x.valor != null && Number(x.valor) > 0) ultimoLancado = Number(x.valor); x._valorEf = ultimoLancado != null ? ultimoLancado : num(pa.valor_ultima_parcela); x._lancado = x.valor != null && Number(x.valor) > 0; });
    return {
      _id: pa.id, _t: 'parcelamentos', aba: pa.aba || '', empresa: pa.empresa, cnpj: doc(pa.cnpj), local: pa.local || '',
      natureza: pa.natureza || '', numero: pa.numero || '', totalParcelas: pa.total_parcelas || 0, parcelasPagas: pagas,
      emitimosGuia: pa.emitimos_guia !== false,   // Backup 25: o escritório emite as guias deste parcelamento?
      valorUltimaParcela: num(pa.valor_ultima_parcela), residual: num(pa.valor_residual),
      pagasReais: pagas, totalReais: ord.length, proximoVencimento: br(prox), vencidas, janela: true,
      parcelas: ord.filter((x) => !x.vencimento || (x.vencimento >= iIso && x.vencimento <= fIso))
        .map((x) => ({ _id: x.id, _t: 'parcelas', _pai: pa.id, numero: x.numero, vencimento: br(x.vencimento), pagamento: x.pago ? 'SIM' : '', status: status(x),
          // Backup 27: emissão da guia (data, quem, PDF guardado)
          emissao: x.emissao || '', emitidaEm: br(x.emitida_em), emitidaPor: x.emitida_por || '', guiaDoc: x.guia_doc || '',
          valor: x._valorEf, valorLancado: x._lancado, reenvioEm: x.reenvio_em || '', reenvioValor: num(x.reenvio_valor) }))
    };
  }
  function acordo(a, gNome) {
    return {
      _id: a.id, _t: 'acordos', aba: a.aba || '', grupo: gNome || '', responsavel: a.responsavel || '', processo: a.processo,
      devedor: a.devedor || '', credor: a.credor || '', parcela: a.parcela || '', totalParc: a.total_parcelas || '',
      valor: num(a.valor), vencimento: br(a.vencimento), diasRestantes: dias(a.vencimento),
      situacao: a.pago ? 'Pago' : (a.vencimento && a.vencimento < hojeISO()) ? 'Vencido' : /emitir/i.test(a.situacao || '') ? 'Emitir Guia' : 'OK', emissao: a.emissao || '', pagamento: a.pago ? 'SIM' : '',
      dataPag: br(a.data_pagamento), pix: a.pix || '', banco: a.banco || '', obs: a.obs || '', formaPag: a.forma_pagamento || 'boleto',
      emitidaEm: br(a.emitida_em), emitidaPor: a.emitida_por || '', guiaDoc: a.guia_doc || ''
    };
  }
  // Lançamento → linha do financeiro antigo. Despesa que veio da aba de
  // receitas (dedução/comissão: tem grupo e não tem fornecedor) volta como
  // valor negativo na mesma aba, exatamente como estava na planilha.
  function financeiro(l, gNome) {
    // redutor de receita (comissão/desconto): aparece negativo nas abas de receita
    const deducao = !!l.redutor || (l.tipo === 'despesa' && !l.favorecido && !!l.grupo_id);
    const estorno = l.tipo === 'receita' && !l.redutor && !!l.favorecido && !l.grupo_id;   // negativo numa aba de despesa
    const receitaLike = (l.tipo === 'receita' && !estorno) || deducao;
    const aba = receitaLike ? (l.perda ? 'Prejuízo' : l.pago ? 'Receita' : 'A Receber') : (l.pago ? 'Despesa' : 'A Pagar');
    const cob = l.cobranca || '';
    // mesma regra do Gestão: passou do vencimento sem pagar = em atraso, mesmo com "emitir guia"
    const situacao = l.pago ? 'PAGO' : l.perda ? 'Prejuízo' : l.vencimento < hojeISO() ? 'Vencido'
      : /^emitir guia$/i.test(cob) ? 'Emitir Guia' : 'OK';
    const dataPag = l.pago ? br(l.data_pagamento) : /^cobrado$/i.test(cob) ? 'COBRADO'
      : /^previs[aã]o:\s*/i.test(cob) ? cob.replace(/^previs[aã]o:\s*/i, '') : '';
    return {
      _id: l.id, _t: 'lancamentos', aba, categoria: l.tipo === 'despesa' ? l.categoria || '' : '', centCusto: '',
      responsavel: l.responsavel || '', descricao: l.descricao || '', grupo: gNome || l.favorecido || '',
      advogado: l.responsavel || '', tipo: l.categoria || '', servico: l.servico || '', contrato: (l.contratos && l.contratos.descricao) || '', referencia: l.referencia || '',
      vencimento: br(l.vencimento), valor: (deducao || estorno) ? -num(l.valor) : num(l.valor), diasRestantes: l.pago ? 0 : dias(l.vencimento),
      situacao, pagamento: l.pago ? 'SIM' : '', dataPagamento: dataPag, formaPagamento: l.forma_pagamento || '',
      pix: /cheque/i.test(l.forma_pagamento || '') ? 'Cheque' : (l.chave_pix || ''), banco: l.conta || '', obs: l.obs || ''
    };
  }

  // ─────────────────────── leitura dos módulos ──────────────────────
  let _gruposCache = null;
  async function grupos() {
    if (!_gruposCache) {
      const lista = await todos(() => sb.from('grupos').select('id,nome'));
      _gruposCache = {}; lista.forEach((g) => { _gruposCache[g.id] = g.nome; });
      setTimeout(() => { _gruposCache = null; }, 5000);
    }
    return _gruposCache;
  }
  // Lançamentos como vieram do banco (as tabelas no estilo Gestão usam o registro original)
  window.ERP_LANC = window.ERP_LANC || {};
  function guardarLanc(l, G) { window.ERP_LANC[l.id] = Object.assign({}, l, { grupos: l.grupo_id ? { nome: G[l.grupo_id] || '' } : null }); }
  const LEITORES = {
    async baseDados() { const G = await grupos(); return (await todos(() => sb.from('clientes').select(window.ERP_COLS_CLIENTE).order('nome'))).map((c) => baseDados(c, G[c.grupo_id])); },
    async processos() { const G = await grupos(); return (await todos(() => sb.from('processos').select('*').order('criado_em').order('id'))).map((p) => processo(p, G[p.grupo_id])); },
    async parcelamentos() {
      const [pas, parc, G] = await Promise.all([todos(() => sb.from('parcelamentos').select('*').order('criado_em').order('id')),
                                             todos(() => sb.from('parcelas').select('*').order('vencimento').order('id')), grupos()]);
      const porParc = {}; parc.forEach((x) => { (porParc[x.parcelamento_id] = porParc[x.parcelamento_id] || []).push(x); });
      return pas.map((pa) => Object.assign(parcelamento(pa, porParc[pa.id] || []), { grupoNome: G[pa.grupo_id] || '' }));
    },
    async acordos() { const G = await grupos(); return (await todos(() => sb.from('acordos').select('*').order('vencimento').order('id'))).map((a) => acordo(a, G[a.grupo_id])); },
    async financeiro() { const G = await grupos(); return (await todos(() => sb.from('lancamentos').select('*, contratos(descricao)').eq('empresa', 'escritorio').order('vencimento').order('id'))).map((l) => { guardarLanc(l, G); return financeiro(l, G[l.grupo_id]); }); },
    async financeiroContab() { const G = await grupos(); return (await todos(() => sb.from('lancamentos').select('*, contratos(descricao)').eq('empresa', 'contabilidade').order('vencimento').order('id'))).map((l) => { guardarLanc(l, G); return financeiro(l, G[l.grupo_id]); }); },
    async tarefas() {
      const G = await grupos();
      return (await todos(() => sb.from('tarefas').select('*').order('prazo').order('id'))).map((t) => ({
        _id: t.id, _t: 'tarefas', id: t.id, titulo: t.titulo, grupo: G[t.grupo_id] || '', responsavel: t.responsavel || '',
        obs: t.obs || '', prioridade: t.prioridade || '', prazo: t.prazo || '', dataFim: t.prazo || '', dataInicio: t.inicio || '',
        createdAt: t.inicio || t.criado_em, status: t.status || '', processosVinculados: t.processos_vinculados || '',
        abaOrigem: t.status === 'concluida' ? 'Concluídas' : 'Tarefas'
      }));
    }
  };
  const MODULOS = Object.keys(LEITORES);

  // Portal do cliente: tudo vem do portal_dados() (já sem campos internos).
  let _portal = null, _portalEm = 0;
  async function lerPortal(pedidos) {
    if (!_portal || Date.now() - _portalEm > 10000) {
      const { data, error } = await sb.rpc('portal_dados');
      if (error) throw error;
      _portal = data; _portalEm = Date.now();
    }
    const out = {};
    if (pedidos.includes('baseDados')) out.baseDados = _portal.clientes.map((c) => baseDados(c, c.grupo_nome));
    if (pedidos.includes('processos')) out.processos = _portal.processos.map((p) => processo(p, p.grupo_nome));
    if (pedidos.includes('parcelamentos')) out.parcelamentos = _portal.parcelamentos.map((p) => parcelamento(p, p.parcelas || []));
    if (pedidos.includes('acordos')) out.acordos = _portal.acordos.map((a) => acordo(a, a.grupo_nome));
    out._nivel = 'cliente'; out._grupos = _portal.grupos;
    return out;
  }

  // Recibos: dados dos advogados vêm do banco (não ficam no HTML público).
  let _configOk = false;
  async function carregarConfiguracoes() {
    if (_configOk) return;
    const { data } = await sb.from('configuracoes').select('valor').eq('chave', 'recibo_emitentes').maybeSingle();
    if (data && data.valor && window.RECIBO_EMITENTES) { Object.assign(window.RECIBO_EMITENTES, data.valor); _configOk = true; }
  }

  // ─────────────── aviso de módulo que não carregou ───────────────
  const NOME_MOD = { baseDados: 'Clientes', processos: 'Processos', parcelamentos: 'Parcelamentos', acordos: 'Acordos',
    financeiro: 'Honorários Jurídico', financeiroContab: 'Honorários Contabilidade', tarefas: 'Tarefas', portal: 'Portal do Cliente' };
  const _falhas = {};
  function registrarFalha(m, e) {
    console.error('[ERP/Supabase] ' + m + ':', e);
    const msg = (e && (e.message || e.code)) || String(e);
    const faltaTabela = /42P01|PGRST20[45]|does not exist|Could not find the table|schema cache/i.test(msg + ' ' + (e && e.code));
    _falhas[m] = faltaTabela ? 'banco desatualizado' : msg;
    mostrarFalhas();
  }
  function mostrarFalhas() {
    const lista = Object.keys(_falhas);
    let el = document.getElementById('erp-aviso-banco');
    if (!lista.length) { if (el) el.remove(); return; }
    if (!document.body) return;
    if (!el) { el = document.createElement('div'); el.id = 'erp-aviso-banco'; document.body.appendChild(el); }
    const desatualizado = lista.some((m) => _falhas[m] === 'banco desatualizado');
    el.innerHTML = '<b>⚠ Alguns dados não carregaram:</b> ' + lista.map((m) => NOME_MOD[m] || m).join(', ') + '.<br>' +
      (desatualizado
        ? 'O banco de dados ainda não recebeu a atualização. No Supabase, abra o <b>SQL Editor</b>, cole o arquivo <b>sistema/banco/estrutura.sql</b> inteiro e clique em <b>Run</b>; depois faça o mesmo com <b>sistema/banco/dados-recibos.sql</b>. Em seguida clique em ↻ Atualizar.'
        : 'Detalhe: ' + lista.map((m) => (NOME_MOD[m] || m) + ' — ' + _falhas[m]).join('; ').replace(/</g, '&lt;')) +
      ' <button type="button">fechar</button>';
    el.querySelector('button').onclick = () => el.remove();
  }

  async function perfilAtual() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    const { data } = await sb.from('perfis').select('*').eq('id', session.user.id).maybeSingle();
    return data;
  }
  window.ERP_PERFIL = perfilAtual;

  async function ler(params) {
    const perfil = await perfilAtual();
    if (!perfil) return { ok: false, erro: 'Acesso negado. Sessão expirada. Faça login novamente.', _negado: true, _sessaoExpirada: true };
    if (perfil.papel === 'inativo') return { ok: false, erro: 'Acesso negado. Usuário inativo.', _negado: true };
    window.ERP_PAPEL = perfil.papel; window.ERP_EU = perfil; document.dispatchEvent(new CustomEvent('erp:perfil'));
    let pedidos = params.get('modulos') ? params.get('modulos').split(',') : params.get('modulo') ? [params.get('modulo')] : MODULOS;
    pedidos = pedidos.filter((m) => MODULOS.includes(m));
    const t0 = performance.now();
    if (perfil.papel === 'cliente') {
      try { return await lerPortal(pedidos.filter((m) => ['baseDados', 'processos', 'parcelamentos', 'acordos'].includes(m))); }
      catch (e) { registrarFalha('portal', e); return { _nivel: 'cliente', baseDados: [], processos: [], parcelamentos: [], acordos: [] }; }
    }
    const dados = {};
    if (pedidos.includes('baseDados')) { Object.keys(_falhas).forEach((k) => delete _falhas[k]); mostrarFalhas(); }
    carregarConfiguracoes().catch(() => {});
    if (pedidos.includes('baseDados') && !pedidos.includes('tarefas')) pedidos.push('tarefas');
    const tempos = {};
    // Cada módulo carrega sozinho: se um falhar (ex.: tabela ainda não criada), os outros aparecem
    // normalmente e um aviso claro diz o que falta.
    await Promise.all(pedidos.map(async (m) => {
      const t = performance.now();
      try { dados[m] = await LEITORES[m](); }
      catch (e) { dados[m] = []; registrarFalha(m, e); }
      tempos[m] = Math.round(performance.now() - t);
    }));
    dados._nivel = 'admin';
    dados.geradoEm = new Date().toISOString();
    dados._diag = { msTotal: Math.round(performance.now() - t0), msPorModulo: tempos, modulos: pedidos, origem: 'supabase' };
    return dados;
  }

  // ─────────────────────────── login ────────────────────────────────
  async function login(pl) {
    const email = String(pl.login || pl.email || '').trim();
    const senha = String(pl.senha || '');
    if (!email || !senha) return { ok: false, erro: 'Preencha e-mail e senha.' };
    if (!/@/.test(email)) return { ok: false, erro: 'Entre com o seu e-mail (o mesmo cadastrado no sistema).' };
    const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) return { ok: false, erro: /Invalid login/i.test(error.message) ? 'E-mail ou senha incorretos.' : error.message };
    const { data: perfil } = await sb.from('perfis').select('*').eq('id', data.user.id).maybeSingle();
    if (!perfil || perfil.papel === 'inativo') { await sb.auth.signOut(); return { ok: false, erro: 'Seu acesso ainda não foi liberado. Peça ao administrador.' }; }
    window.ERP_PAPEL = perfil.papel; window.ERP_EU = perfil; document.dispatchEvent(new CustomEvent('erp:perfil'));
    let gruposTxt = 'admin';
    if (perfil.papel === 'cliente') {
      const { data: pg } = await sb.from('perfil_grupos').select('grupos(nome)').eq('perfil_id', perfil.id);
      gruposTxt = (pg || []).map((x) => x.grupos && x.grupos.nome).filter(Boolean).join(', ');
      if (!gruposTxt) { await sb.auth.signOut(); return { ok: false, erro: 'Seu usuário ainda não tem grupos liberados. Fale com o escritório.' }; }
    }
    return { ok: true, token: 'supabase', usuario: { login: email, nome: perfil.nome || email, grupos: gruposTxt, ativo: 'SIM',
      isAdmin: perfil.papel !== 'cliente', papel: perfil.papel, status: 'ativo' } };
  }

  async function responder(url, init) {
    const u = new URL(url, location.href);
    let pl = null;
    if (init && init.body) { try { pl = JSON.parse(init.body); } catch (e) { pl = null; } }
    if (!pl && u.searchParams.get('payload')) {
      try { pl = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(u.searchParams.get('payload')))))); } catch (e) { pl = null; }
    }
    if (u.searchParams.get('acao') === 'ping') return { ok: true, msg: 'pong', versao: 'supabase', lote: true };
    if (pl && (pl._auth || u.searchParams.get('_auth') === '1')) {
      if (pl.acao === 'login') return login(pl);
      if (pl.acao === 'logout') { await sb.auth.signOut(); return { ok: true }; }
      if (pl.acao === 'logAcesso') return { ok: true };
      if (pl.acao === 'lerUsuariosPortal') {
        const { data, error } = await sb.from('perfis').select('*').order('criado_em');
        if (error) return { ok: false, erro: error.message };
        return { ok: true, usuarios: data.map((p) => ({ login: p.email, grupos: p.papel === 'admin' ? 'admin' : p.papel, ativo: p.papel === 'inativo' ? 'NÃO' : 'SIM',
          email: p.email, whatsapp: '', ultimoAcesso: '', isAdmin: p.papel === 'admin', status: 'ativo' })) };
      }
      return { ok: false, erro: 'Ação não disponível no sistema novo: ' + pl.acao };
    }
    if (pl && pl.acao === 'criarRascunhoEmail') {
      // Enviar: pelo e-mail do escritório (modelo com a marca, fila do erp-emails) ou no programa de e-mail do computador
      const d = pl.dados || {};
      const G = window.GS;
      if (G && G.abrirJanela) {
        const r = await new Promise((ok) => {
          const esc2 = (x) => String(x || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
          const j = G.abrirJanela({ titulo: '✉ Enviar e-mail ao cliente', larga: true,
            corpo: '<div class="grade"><label class="campo inteiro"><span>Para</span><input id="em-para" type="email" value="' + esc2(d.to) + '" placeholder="e-mail do cliente"></label>' +
              '<label class="campo inteiro"><span>Assunto</span><input id="em-assunto" value="' + esc2(d.assunto) + '"></label>' +
              '<div class="inteiro em-manual"><label class="campo"><span>Mensagem (pode ajustar)</span><textarea id="em-texto" rows="16">' + esc2(d.corpo) + '</textarea></label>' +
              '<div class="campo"><span>Como o cliente recebe</span><iframe id="em-previa" class="em-previa" sandbox="" title="Prévia do e-mail"></iframe></div></div>' +
              '<div class="dica inteiro"><b>Pelo e-mail do escritório</b>: sai com a marca Araújo &amp; Castro, fica registrado em Administração → E-mail e em Automações. ' +
              '<b>No meu e-mail</b>: abre o programa de e-mail deste computador com o texto pronto.</div></div>',
            rodape: '<button class="btn btn-o" type="button" id="em-meu">Abrir no meu e-mail</button><div class="acoes"><button class="btn btn-o" type="button" id="em-cancelar">Cancelar</button><button class="btn btn-p" type="button" id="em-enviar">✉ Enviar pelo e-mail do escritório</button></div>' });
          const jn = j.querySelector('.janela'); if (jn) jn.classList.add('janela-rel');
          // prévia ao vivo no layout com a marca (o mesmo que sai pelo e-mail do escritório)
          let tPrev; const previa = () => { clearTimeout(tPrev); tPrev = setTimeout(async () => {
            const r = await sb.rpc('previa_email_manual', { p_assunto: j.querySelector('#em-assunto').value, p_texto: j.querySelector('#em-texto').value });
            const f = j.querySelector('#em-previa'); if (f && !r.error) f.srcdoc = r.data || ''; }, 350); };
          j.querySelector('#em-texto').addEventListener('input', previa); j.querySelector('#em-assunto').addEventListener('input', previa); previa();
          let feito = false; const fim = (v) => { if (feito) return; feito = true; G.fecharJanela(j); ok(v); };
          j._aoFechar = () => fim({ ok: false, cancelado: true });
          j.querySelector('#em-cancelar').onclick = () => fim({ ok: false, cancelado: true });
          j.querySelector('#em-meu').onclick = () => {
            const a = document.createElement('a');
            a.href = 'mailto:' + encodeURIComponent(j.querySelector('#em-para').value) + '?subject=' + encodeURIComponent(j.querySelector('#em-assunto').value) + '&body=' + encodeURIComponent(j.querySelector('#em-texto').value);
            document.body.appendChild(a); a.click(); a.remove(); fim({ ok: true, msg: 'E-mail aberto no seu programa de e-mail' });
          };
          j.querySelector('#em-enviar').onclick = async (ev) => {
            const bt = ev.currentTarget; // depois do await o currentTarget vira null
            bt.disabled = true;
            const { error } = await sb.rpc('enviar_email_manual', { p_para: j.querySelector('#em-para').value.trim(), p_assunto: j.querySelector('#em-assunto').value, p_texto: j.querySelector('#em-texto').value });
            bt.disabled = false;
            if (error) { if (window.toast) window.toast('⚠ ' + (error.message || 'não foi possível enviar')); return; }
            fim({ ok: true, msg: 'E-mail na fila de envio do escritório (sai em até 5 minutos)' });
          };
        });
        return r;
      }
      const a = document.createElement('a');
      a.href = 'mailto:' + encodeURIComponent(d.to || '') + '?subject=' + encodeURIComponent(d.assunto || '') + '&body=' + encodeURIComponent(d.corpo || '');
      document.body.appendChild(a); a.click(); a.remove();
      return { ok: true };
    }
    if (pl && (pl.acao || u.searchParams.get('_wb') === '1')) {
      return { ok: false, erro: 'Esta ação ainda não foi migrada para o sistema novo (' + (pl.acao || '?') + ').' };
    }
    return ler(u.searchParams);
  }

  window.fetch = async function (entrada, init) {
    const url = typeof entrada === 'string' ? entrada : entrada && entrada.url;
    if (!ehScriptGoogle(url)) return fetchOriginal(entrada, init);
    try { return resposta(await responder(url, init)); }
    catch (e) { console.error('[ERP/Supabase]', e); return resposta({ ok: false, erro: e.message || String(e) }); }
  };

  // Backup 51: lê só alguns módulos (ex.: 'parcelamentos'), no mesmo formato da carga do ERP — usado depois de uma baixa na Rotina
  window.ERP_LER_MODULOS = (lista) => ler(new URLSearchParams({ modulos: String(lista) }));
  // Backup 52 (O3): relê SÓ alguns parcelamentos (o que mudou numa baixa), no formato do módulo "parcelamentos" — uma consulta só
  window.ERP_LER_PARCELAMENTOS = async (ids) => {
    const { data, error } = await sb.rpc('parcelamentos_json', { p_ids: ids }); if (error) throw error;
    const G = await grupos();
    return (data || []).map((pa) => Object.assign(parcelamento(pa, pa.parcelas || []), { grupoNome: G[pa.grupo_id] || '' }));
  };
  // Recarrega os dados do ERP depois de uma gravação (usado pelo editor).
  window.ERP_RECARREGAR = function () { _gruposCache = null; _portal = null; if (typeof window.loadData === 'function') return window.loadData(true); };
  // Marca cada linha das tabelas do ERP com tabela:id (usado pelo botão ✎ Editar).
  window._gx = (o) => {
    if (!o || !o._id) return '';
    const pago = o.pagamento === 'SIM' || o.situacao === 'Pago' || o.status === 'Pago';
    // Backup 42: 5ª parte "r" = honorário a receber (ganha o botão 💬 Cobrar)
    return o._t + ':' + o._id + ':' + (o._pai || '') + ':' + (['lancamentos', 'acordos', 'parcelas'].includes(o._t) ? (pago ? 'p' : 'a') : '') + (o._t === 'lancamentos' && o.aba === 'A Receber' ? ':r' : '');
  };
  // "Em atraso" do Gestão: roda um filtro do ERP ignorando o período (de/até/preset), mantendo os demais recortes
  window._semPeriodo = function (st, fn) {
    const s = { de: st.de, ate: st.ate, preset: st.preset };
    st.de = ''; st.ate = ''; st.preset = 'tudo';
    try { return fn(); } finally { st.de = s.de; st.ate = s.ate; st.preset = s.preset; }
  };
  window.ERP_CONVERSORES = { baseDados, processo, parcelamento, acordo, financeiro };
})();
