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
(function () {
  const CFG = window.ERP_CONFIG || {};
  const sb = window.supabase.createClient(CFG.url, CFG.chave);
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
      const { data, error } = await montar().range(de, de + 999);
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
      dataArqProv: br(p.data_arq_provisorio), prescricao: p.prescricao || '', obs: p.obs || ''
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
    return {
      _id: pa.id, _t: 'parcelamentos', aba: pa.aba || '', empresa: pa.empresa, cnpj: doc(pa.cnpj), local: pa.local || '',
      natureza: pa.natureza || '', numero: pa.numero || '', totalParcelas: pa.total_parcelas || 0, parcelasPagas: pagas,
      valorUltimaParcela: num(pa.valor_ultima_parcela), residual: num(pa.valor_residual),
      pagasReais: pagas, totalReais: ord.length, proximoVencimento: br(prox), vencidas, janela: true,
      parcelas: ord.filter((x) => !x.vencimento || (x.vencimento >= iIso && x.vencimento <= fIso))
        .map((x) => ({ _id: x.id, _t: 'parcelas', _pai: pa.id, numero: x.numero, vencimento: br(x.vencimento), pagamento: x.pago ? 'SIM' : '', status: status(x) }))
    };
  }
  function acordo(a, gNome) {
    return {
      _id: a.id, _t: 'acordos', aba: a.aba || '', grupo: gNome || '', responsavel: a.responsavel || '', processo: a.processo,
      devedor: a.devedor || '', credor: a.credor || '', parcela: a.parcela || '', totalParc: a.total_parcelas || '',
      valor: num(a.valor), vencimento: br(a.vencimento), diasRestantes: dias(a.vencimento),
      situacao: a.pago ? 'Pago' : (a.vencimento && a.vencimento < hojeISO()) ? 'Vencido' : /emitir/i.test(a.situacao || '') ? 'Emitir Guia' : 'OK', emissao: a.emissao || '', pagamento: a.pago ? 'SIM' : '',
      dataPag: br(a.data_pagamento), pix: a.pix || '', banco: a.banco || ''
    };
  }
  // Lançamento → linha do financeiro antigo. Despesa que veio da aba de
  // receitas (dedução/comissão: tem grupo e não tem fornecedor) volta como
  // valor negativo na mesma aba, exatamente como estava na planilha.
  function financeiro(l, gNome) {
    const deducao = l.tipo === 'despesa' && !l.favorecido && !!l.grupo_id;
    const estorno = l.tipo === 'receita' && !!l.favorecido && !l.grupo_id;   // negativo numa aba de despesa
    const receitaLike = (l.tipo === 'receita' && !estorno) || deducao;
    const aba = receitaLike ? (l.perda ? 'Prejuízo' : l.pago ? 'Receita' : 'A Receber') : (l.pago ? 'Despesa' : 'A Pagar');
    const cob = l.cobranca || '';
    const situacao = l.pago ? 'PAGO' : l.perda ? 'Vencido' : /^emitir guia$/i.test(cob) ? 'Emitir Guia'
      : (l.vencimento < hojeISO() ? 'Vencido' : 'OK');
    const dataPag = l.pago ? br(l.data_pagamento) : /^cobrado$/i.test(cob) ? 'COBRADO'
      : /^previs[aã]o:\s*/i.test(cob) ? cob.replace(/^previs[aã]o:\s*/i, '') : '';
    return {
      _id: l.id, _t: 'lancamentos', aba, categoria: l.tipo === 'despesa' ? l.categoria || '' : '', centCusto: '',
      responsavel: l.responsavel || '', descricao: l.descricao || '', grupo: gNome || l.favorecido || '',
      advogado: l.responsavel || '', tipo: l.categoria || '', referencia: l.referencia || '',
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
  const LEITORES = {
    async baseDados() { const G = await grupos(); return (await todos(() => sb.from('clientes').select('*').order('nome'))).map((c) => baseDados(c, G[c.grupo_id])); },
    async processos() { const G = await grupos(); return (await todos(() => sb.from('processos').select('*').order('criado_em'))).map((p) => processo(p, G[p.grupo_id])); },
    async parcelamentos() {
      const [pas, parc] = await Promise.all([todos(() => sb.from('parcelamentos').select('*').order('criado_em')),
                                             todos(() => sb.from('parcelas').select('*').order('vencimento'))]);
      const porParc = {}; parc.forEach((x) => { (porParc[x.parcelamento_id] = porParc[x.parcelamento_id] || []).push(x); });
      return pas.map((pa) => parcelamento(pa, porParc[pa.id] || []));
    },
    async acordos() { const G = await grupos(); return (await todos(() => sb.from('acordos').select('*').order('vencimento'))).map((a) => acordo(a, G[a.grupo_id])); },
    async financeiro() { const G = await grupos(); return (await todos(() => sb.from('lancamentos').select('*').eq('empresa', 'escritorio').order('vencimento'))).map((l) => financeiro(l, G[l.grupo_id])); },
    async financeiroContab() { const G = await grupos(); return (await todos(() => sb.from('lancamentos').select('*').eq('empresa', 'contabilidade').order('vencimento'))).map((l) => financeiro(l, G[l.grupo_id])); },
    async tarefas() {
      const G = await grupos();
      return (await todos(() => sb.from('tarefas').select('*').order('prazo'))).map((t) => ({
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
    let pedidos = params.get('modulos') ? params.get('modulos').split(',') : params.get('modulo') ? [params.get('modulo')] : MODULOS;
    pedidos = pedidos.filter((m) => MODULOS.includes(m));
    const t0 = performance.now();
    if (perfil.papel === 'cliente') return lerPortal(pedidos.filter((m) => ['baseDados', 'processos', 'parcelamentos', 'acordos'].includes(m)));
    const dados = {};
    carregarConfiguracoes();
    if (pedidos.includes('baseDados') && !pedidos.includes('tarefas')) pedidos.push('tarefas');
    const tempos = {};
    await Promise.all(pedidos.map(async (m) => { const t = performance.now(); dados[m] = await LEITORES[m](); tempos[m] = Math.round(performance.now() - t); }));
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

  // Recarrega os dados do ERP depois de uma gravação (usado pelo editor).
  window.ERP_RECARREGAR = function () { _gruposCache = null; _portal = null; if (typeof window.loadData === 'function') return window.loadData(true); };
  // Marca cada linha das tabelas do ERP com tabela:id (usado pelo botão ✎ Editar).
  window._gx = (o) => (o && o._id ? o._t + ':' + o._id + (o._pai ? ':' + o._pai : '') : '');
  window.ERP_CONVERSORES = { baseDados, processo, parcelamento, acordo, financeiro };
})();
