'use strict';
// ═══════════════════════════════════════════════════════════════════
// ERP unificado: barra superior (no lugar do menu lateral), botão
// "+ Lançar", menu do celular e as telas que vieram do Gestão:
// Início, Clientes, Contratos, Tarefas e Administração
// (Usuários, Importar planilhas, Backup e Histórico).
// ═══════════════════════════════════════════════════════════════════
(function () {
  const sb = window.SB;
  const ED = window.ERP_EDITOR;
  const { esc, hojeISO, brData, brValor, aviso, erroAmigavel } = ED;
  const pad = (n) => String(n).padStart(2, '0');
  const soma = (l, f) => l.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const normalizar = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const soDigitos = (s) => String(s || '').replace(/\D/g, '');
  const ehCliente = () => !window.AC_SESSION || window.AC_SESSION.nivel === 'cliente';
  const ehAdmin = () => window.ERP_PAPEL === 'admin';
  // o ERP declara DB e _tarefasCache com let: existem como nomes globais, mas não em window
  const dadosERP = () => (typeof DB !== 'undefined' ? DB : {});
  const tarefasERP = () => (typeof _tarefasCache !== 'undefined' ? _tarefasCache : []);
  // dd/mm/aaaa → aaaa-mm-dd
  const isoDeBR = (s) => { const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? m[3] + '-' + m[2] + '-' + m[1] : ''; };
  const somarDias = (iso, n) => { const [a, m, d] = iso.split('-').map(Number); const x = new Date(a, m - 1, d + n); return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()); };
  const pessoa = (n) => (typeof window.advBadge === 'function' ? window.advBadge(n || '—') : esc(n || '—'));
  const kpi = (rot, val, sub, cls) => (typeof window.kC === 'function' ? window.kC(rot, val, sub || '', cls || 'cb') : '<div class="kc"><div class="kl">' + rot + '</div><div class="kv">' + val + '</div><div class="ks">' + (sub || '') + '</div></div>');
  const vazio = (t) => '<div class="emp"><div class="emp-ic">◎</div><div class="emp-t">' + esc(t) + '</div></div>';
  const banner = (icone, titulo, sub, cor) => '<div class="mod-banner"><div class="mod-banner-bar" style="background:' + (cor || 'linear-gradient(180deg,var(--ac-navy3),var(--ac-gold))') + '"></div><div><div class="mod-banner-t">' + icone + ' ' + esc(titulo) + '</div><div class="mod-banner-d">' + esc(sub) + '</div></div></div>';
  async function buscarTodos(montar) {
    const out = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await montar().range(de, de + 999);
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) return out;
    }
  }

  // ═════════════════════════ NAVEGAÇÃO ═════════════════════════
  // [id do painel, rótulo, só equipe?, só admin?]
  const MENU = [
    { id: 'hoje', rot: 'Início', equipe: true },
    { id: 'resumo', rot: 'Painel Executivo' },
    { rot: 'Jurídico', itens: [['processos', 'Processos'], ['acordos', 'Acordos'], ['parcelamentos', 'Parcelamentos']] },
    { rot: 'Financeiro', equipe: true, itens: [['financeiro', 'Honorários Jurídico'], ['financeiroContab', 'Honorários Contabilidade'], ['contratos', 'Contratos'], ['notificacoes', 'Notificações e recibos']] },
    { id: 'clientes', rot: 'Clientes', equipe: true },
    { id: 'tarefas', rot: 'Tarefas', equipe: true },
    { id: 'admin', rot: 'Administração', admin: true }
  ];
  const NOVAS = { hoje: 'Início', clientes: 'Clientes', contratos: 'Contratos', tarefas: 'Tarefas', admin: 'Administração' };

  function montarNavegacao() {
    const hd = document.getElementById('hd');
    if (!hd || document.getElementById('tn')) return;
    document.body.classList.add('gx-barra-topo');
    const nav = document.createElement('nav');
    nav.id = 'tn'; nav.setAttribute('aria-label', 'Menu principal');
    nav.innerHTML = MENU.map((m, i) => {
      const cls = (m.equipe ? ' gx-so-equipe' : '') + (m.admin ? ' gx-so-admin' : '');
      if (!m.itens) return '<button type="button" class="tn-it' + cls + '" data-ir="' + m.id + '">' + esc(m.rot) + '</button>';
      return '<div class="tn-grupo' + cls + '"><button type="button" class="tn-it tn-abre" data-grupo="' + i + '" aria-haspopup="true" aria-expanded="false">' + esc(m.rot) + ' <span class="tn-seta">▾</span></button>'
        + '<div class="tn-menu" role="menu">' + m.itens.map((x) => '<button type="button" role="menuitem" data-ir="' + x[0] + '"'
          + (['financeiro', 'financeiroContab', 'contratos', 'notificacoes'].includes(x[0]) ? ' class="gx-so-equipe"' : '') + '>' + esc(x[1]) + '</button>').join('') + '</div></div>';
    }).join('');
    hd.appendChild(nav);

    // + Lançar (canto superior direito)
    const hdr = hd.querySelector('.hd-r');
    const lanc = document.createElement('div');
    lanc.className = 'tn-lancar gx-so-equipe';
    lanc.innerHTML = '<button type="button" class="tn-lancar-bt" aria-haspopup="true" aria-expanded="false">＋ Lançar</button>'
      + '<div class="tn-menu tn-menu-dir" role="menu">' + ED.LANCAR.map((x, i) => '<button type="button" role="menuitem" data-lancar="' + i + '">' + esc(x[0]) + '</button>').join('') + '</div>';
    if (hdr) hdr.insertBefore(lanc, hdr.firstChild);

    // celular: menu inferior + "Mais"
    const bn = document.createElement('nav');
    bn.id = 'tn-baixo'; bn.setAttribute('aria-label', 'Menu');
    bn.innerHTML = [['hoje', '⌂', 'Início', 1], ['resumo', '◈', 'Painel', 0], ['financeiro', '◎', 'Honorários', 1], ['lancar', '＋', 'Lançar', 1], ['mais', '☰', 'Mais', 0]]
      .map((x) => '<button type="button" data-baixo="' + x[0] + '"' + (x[3] ? ' class="gx-so-equipe"' : '') + '><span>' + x[1] + '</span>' + x[2] + '</button>').join('');
    document.body.appendChild(bn);

    document.addEventListener('click', (e) => {
      const alvo = e.target.closest && e.target.closest('[data-ir],[data-grupo],.tn-lancar-bt,[data-lancar],[data-baixo]');
      const abertos = document.querySelectorAll('.tn-grupo.on,.tn-lancar.on');
      if (!alvo) { abertos.forEach((g) => fecharMenu(g)); return; }
      if (alvo.dataset.grupo !== undefined || alvo.classList.contains('tn-lancar-bt')) {
        const g = alvo.parentElement; const abrir = !g.classList.contains('on');
        abertos.forEach((x) => fecharMenu(x));
        if (abrir) { g.classList.add('on'); alvo.setAttribute('aria-expanded', 'true'); }
        return;
      }
      abertos.forEach((g) => fecharMenu(g));
      fecharMais();
      if (alvo.dataset.ir) ir(alvo.dataset.ir);
      else if (alvo.dataset.lancar !== undefined) ED.LANCAR[+alvo.dataset.lancar][1]();
      else if (alvo.dataset.baixo === 'mais') abrirMais();
      else if (alvo.dataset.baixo === 'lancar') abrirMais(true);
      else if (alvo.dataset.baixo) ir(alvo.dataset.baixo);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { document.querySelectorAll('.tn-grupo.on,.tn-lancar.on').forEach(fecharMenu); fecharMais(); } });
  }
  function fecharMenu(g) { g.classList.remove('on'); const b = g.querySelector('[aria-expanded]'); if (b) b.setAttribute('aria-expanded', 'false'); }

  function abrirMais(soLancar) {
    fecharMais();
    const f = document.createElement('div');
    f.id = 'tn-mais';
    const itens = soLancar ? '' : MENU.map((m) => {
      const cls = (m.equipe ? ' gx-so-equipe' : '') + (m.admin ? ' gx-so-admin' : '');
      if (!m.itens) return '<button type="button" class="' + cls + '" data-ir="' + m.id + '">' + esc(m.rot) + '</button>';
      return '<div class="tn-mais-tit' + cls + '">' + esc(m.rot) + '</div>' + m.itens.map((x) => '<button type="button" data-ir="' + x[0] + '"' + (['financeiro', 'financeiroContab', 'contratos', 'notificacoes'].includes(x[0]) ? ' class="gx-so-equipe"' : '') + '>' + esc(x[1]) + '</button>').join('');
    }).join('');
    f.innerHTML = '<div class="tn-mais-caixa">' + (soLancar ? '<div class="tn-mais-tit">Lançar</div>' + ED.LANCAR.map((x, i) => '<button type="button" data-lancar="' + i + '">＋ ' + esc(x[0]) + '</button>').join('') : itens)
      + '<button type="button" class="tn-mais-fechar" data-fechar>Fechar</button></div>';
    document.body.appendChild(f);
    f.addEventListener('click', (e) => { if (e.target === f || e.target.closest('[data-fechar]')) fecharMais(); });
  }
  function fecharMais() { const f = document.getElementById('tn-mais'); if (f) f.remove(); }

  function ir(id) { if (typeof window.nav === 'function') window.nav(null, id); window.scrollTo(0, 0); }

  // painéis novos dentro do <main> do ERP
  function criarPaineis() {
    const main = document.getElementById('main');
    if (!main) return;
    Object.keys(NOVAS).forEach((id) => {
      if (document.getElementById('panel-' + id)) return;
      const s = document.createElement('section');
      s.id = 'panel-' + id; s.className = 'panel'; s.dataset.loaded = '1';
      s.innerHTML = '<div class="gx-pn" id="gx-pn-' + id + '"></div>';
      main.appendChild(s);
    });
  }

  // o nav() do ERP ativa o painel; aqui marcamos o menu e desenhamos as telas novas
  function destacar(id) {
    document.querySelectorAll('#tn [data-ir], #tn-baixo [data-baixo]').forEach((b) => b.classList.toggle('on', b.dataset.ir === id || b.dataset.baixo === id));
    document.querySelectorAll('#tn .tn-grupo').forEach((g) => g.classList.toggle('ativo', !!g.querySelector('[data-ir="' + id + '"]')));
  }
  let _painel = '';
  function instalarGanchos() {
    const navOrig = window.nav;
    window.nav = function (btn, pid) {
      const id = pid || (btn && btn.dataset && btn.dataset.panel);
      navOrig.apply(this, arguments);
      _painel = id; destacar(id);
      document.body.classList.toggle('gx-tela-nova', !!NOVAS[id]);
      if (NOVAS[id]) desenhar(id);
    };
    const renderOrig = window.renderAll;
    if (typeof renderOrig === 'function') {
      window.renderAll = function () { const r = renderOrig.apply(this, arguments); if (_painel === 'hoje' || _painel === 'clientes') desenhar(_painel, true); return r; };
    }
    // entrar: equipe começa no Início
    const admOrig = window.acAplicarModoAdmin;
    if (typeof admOrig === 'function') {
      window.acAplicarModoAdmin = function () { const r = admOrig.apply(this, arguments); setTimeout(() => ir('hoje'), 0); return r; };
    }
    // recarregar após gravar: redesenha também a tela nova aberta
    const recOrig = window.ERP_RECARREGAR;
    window.ERP_RECARREGAR = function () { const r = recOrig && recOrig.apply(this, arguments); if (_painel === 'contratos' || _painel === 'tarefas') setTimeout(() => desenhar(_painel, true), 300); return r; };
  }
  document.addEventListener('erp:perfil', () => { document.body.classList.toggle('gx-admin', ehAdmin()); });

  const DESENHO = {};
  let _desenhando = {};
  async function desenhar(id, silencioso) {
    const alvo = document.getElementById('gx-pn-' + id);
    if (!alvo || _desenhando[id]) return;
    if (ehCliente() && id !== 'resumo') { alvo.innerHTML = vazio('Acesso restrito.'); return; }
    _desenhando[id] = true;
    try {
      if (!silencioso && !alvo.innerHTML) alvo.innerHTML = '<div class="gx-carregando">Carregando…</div>';
      await DESENHO[id](alvo);
    } catch (e) {
      console.error(e);
      alvo.innerHTML = '<div class="cc"><div class="gx-erro">⚠ ' + esc(erroAmigavel(e)) + '</div></div>';
    } finally { _desenhando[id] = false; }
  }

  // barra de filtros simples (mantém o valor ao redesenhar)
  const FILTRO = {};
  function filtros(tela, campos) {
    FILTRO[tela] = FILTRO[tela] || {};
    return '<div class="gx-filtros">' + campos.map((c) => {
      const v = FILTRO[tela][c.k] ?? (c.padrao || '');
      if (c.ops) return '<label class="gx-fl"><span>' + esc(c.rot) + '</span><select data-filtro="' + c.k + '">' + c.ops.map((o) => {
        const [val, rot] = Array.isArray(o) ? o : [o, o];
        return '<option value="' + esc(val) + '"' + (String(v) === String(val) ? ' selected' : '') + '>' + esc(rot) + '</option>';
      }).join('') + '</select></label>';
      return '<label class="gx-fl gx-fl-busca"><span>' + esc(c.rot) + '</span><input type="search" data-filtro="' + c.k + '" value="' + esc(v) + '" placeholder="' + esc(c.ph || '') + '"></label>';
    }).join('') + '</div>';
  }
  function ligarFiltros(raiz, tela, repintar) {
    raiz.querySelectorAll('[data-filtro]').forEach((el) => {
      const ev = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(ev, () => { FILTRO[tela][el.dataset.filtro] = el.value; repintar(); });
    });
  }
  const F = (tela, k) => (FILTRO[tela] || {})[k] || '';

  // ═════════════════════════ INÍCIO ═════════════════════════
  const NOME_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  DESENHO.hoje = async function (alvo) {
    const d = dadosERP(); const hoje = hojeISO(); const mes = hoje.slice(0, 7); const em15 = somarDias(hoje, 15);
    const emp = { escritorio: d.financeiro || [], contabilidade: d.financeiroContabilidade || [] };
    const abertos = (l) => l.filter((f) => f.pagamento !== 'SIM' && f.aba !== 'Prejuízo');
    const linha = (chave, titulo) => {
      const l = emp[chave];
      const receb = l.filter((f) => f.pagamento === 'SIM' && isoDeBR(f.dataPagamento || f.vencimento).slice(0, 7) === mes && f.aba !== 'Despesa');
      const aRec = abertos(l).filter((f) => f.aba === 'A Receber' && isoDeBR(f.vencimento).slice(0, 7) === mes);
      const atras = abertos(l).filter((f) => f.aba === 'A Receber' && isoDeBR(f.vencimento) < hoje);
      const aPag = abertos(l).filter((f) => f.aba === 'A Pagar' && isoDeBR(f.vencimento).slice(0, 7) === mes);
      const brl = (v) => brValor(v);
      return '<div class="gx-sec">' + titulo + '</div><div class="kpi-grid">'
        + kpi('Recebido no mês', brl(soma(receb, (f) => f.valor)), receb.length + ' recebimento(s)', 'cg')
        + kpi('A receber no mês', brl(soma(aRec, (f) => f.valor)), aRec.length + ' em aberto', 'cb')
        + kpi('Em atraso', brl(soma(atras, (f) => f.valor)), atras.length + ' vencido(s)', 'cr')
        + kpi('A pagar no mês', brl(soma(aPag, (f) => Math.abs(f.valor))), aPag.length + ' conta(s)', 'ca') + '</div>';
    };
    // listas: honorários + acordos + tarefas
    const itens = [];
    Object.keys(emp).forEach((k) => abertos(emp[k]).filter((f) => ['A Receber', 'A Pagar'].includes(f.aba)).forEach((f) => itens.push({
      o: f, venc: isoDeBR(f.vencimento), tipo: (k === 'contabilidade' ? 'Contabilidade' : 'Jurídico') + ' · ' + (f.aba === 'A Pagar' ? 'a pagar' : 'a receber'),
      quem: f.grupo || '—', desc: [f.tipo, f.referencia].filter(Boolean).join(' · '), valor: f.valor })));
    (d.acordos || []).filter((a) => a.situacao !== 'Pago').forEach((a) => itens.push({ o: a, venc: isoDeBR(a.vencimento), tipo: 'Acordo', quem: a.devedor || a.grupo || '—', desc: 'Parcela ' + (a.parcela || '?') + '/' + (a.totalParc || '?') + ' · ' + (a.processo || ''), valor: a.valor }));
    const tarefas = tarefasERP().filter((t) => !['concluida', 'cancelada'].includes(t.status) && t.prazo);
    tarefas.forEach((t) => itens.push({ o: { _t: 'tarefas', _id: t.id }, venc: t.prazo, tipo: 'Tarefa', quem: t.responsavel || '—', desc: t.titulo, valor: null }));
    const lista = (titulo, l, msgVazio) => '<div class="cc"><div class="cc-hd"><div class="cc-t">' + titulo + ' <span class="tag tx">' + l.length + '</span></div></div>'
      + (l.length ? '<div class="tw gx-lista-curta"><table><thead><tr><th>Vencimento</th><th>Tipo</th><th>Quem</th><th>Descrição</th><th style="text-align:right">Valor</th></tr></thead><tbody>'
        + l.sort((a, b) => a.venc.localeCompare(b.venc)).map((x) => '<tr data-gx="' + esc(window._gx(x.o)) + '"><td class="mono">' + brData(x.venc) + '</td><td>' + esc(x.tipo) + '</td><td><b>' + esc(x.quem) + '</b></td><td>' + esc(x.desc) + '</td><td class="mono" style="text-align:right">' + (x.valor == null ? '—' : brValor(x.valor)) + '</td></tr>').join('')
        + '</tbody></table></div>' : vazio(msgVazio)) + '</div>';
    const nome = ((window.ERP_EU && window.ERP_EU.nome) || (window.AC_SESSION && window.AC_SESSION.nome) || '').split(' ')[0];
    const agora = new Date();
    alvo.innerHTML = banner('⌂', 'Olá' + (nome ? ', ' + nome : ''), 'Resumo de ' + NOME_MES[agora.getMonth()] + ' de ' + agora.getFullYear() + ' · as duas empresas')
      + '<div class="ex-bn gx-bloco">' + linha('escritorio', '💼 Honorários Jurídico') + linha('contabilidade', '🧮 Honorários Contabilidade') + '</div>'
      + '<div class="crow c2">' + lista('⚠ Em atraso', itens.filter((x) => x.venc && x.venc < hoje), 'Nada em atraso. 👏')
      + lista('🗓 Próximos 15 dias', itens.filter((x) => x.venc >= hoje && x.venc <= em15), 'Nenhum vencimento nos próximos 15 dias.') + '</div>';
  };

  // ═════════════════════════ CLIENTES ═════════════════════════
  DESENHO.clientes = async function (alvo) {
    const todos = (dadosERP().baseDados || []);
    const uniq = (f) => [...new Set(todos.map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    alvo.innerHTML = banner('👥', 'Clientes', 'Cadastro completo da Base de Dados · clique em ✎ para editar')
      + '<div class="cc"><div class="cc-hd" style="flex-wrap:wrap;gap:8px"><div class="cc-t">Clientes <span class="gx-cont" id="gx-cli-n"></span></div>'
      + '<button type="button" class="gx-bt gx-prim" id="gx-cli-novo">＋ Novo cliente</button></div>'
      + filtros('clientes', [
        { k: 'busca', rot: 'Buscar', ph: 'nome, CPF/CNPJ, sócio…' },
        { k: 'grupo', rot: 'Grupo', ops: [['', 'Todos']].concat(uniq((c) => c.grupo)) },
        { k: 'tipo', rot: 'Tipo', ops: [['', 'Todos']].concat(uniq((c) => c.tipoCliente)) },
        { k: 'situacao', rot: 'Situação cadastral', ops: [['', 'Todas']].concat(uniq((c) => c.sitCadastral)) },
        { k: 'capag', rot: 'CAPAG', ops: [['', 'Todas']].concat(uniq((c) => c.capag)) },
        { k: 'pessoa', rot: 'Pessoa', ops: [['', 'PF e PJ'], ['pj', 'Só PJ'], ['pf', 'Só PF']] }])
      + '<div id="gx-cli-corpo"></div></div>';
    const tribAll = (r) => (r.rfb || 0) + (r.rfbNeg || 0) + (r.pgfn || 0) + (r.pgfnNeg || 0) + (r.ageMG || 0) + (r.ageMGNeg || 0);
    const pintar = () => {
      const b = normalizar(F('clientes', 'busca'));
      const l = todos.filter((c) => (!F('clientes', 'grupo') || c.grupo === F('clientes', 'grupo')) && (!F('clientes', 'tipo') || c.tipoCliente === F('clientes', 'tipo'))
        && (!F('clientes', 'situacao') || c.sitCadastral === F('clientes', 'situacao')) && (!F('clientes', 'capag') || c.capag === F('clientes', 'capag'))
        && (!F('clientes', 'pessoa') || (F('clientes', 'pessoa') === 'pj') === (c.isPJ !== false))
        && (!b || normalizar([c.nome, c.cpfCnpj, soDigitos(c.cpfCnpj), c.socioAdmin, c.grupo].join(' ')).includes(b)));
      const passivoPJ = soma(l.filter((c) => c.isPJ !== false), tribAll);
      document.getElementById('gx-cli-n').textContent = '· ' + l.length + ' de ' + todos.length + ' · passivo (só PJ, como no Painel): ' + brValor(passivoPJ);
      const selo = (v) => v === 'SIM' ? '<span class="tag tg">SIM</span>' : v === 'NÃO' ? '<span class="tag tr">NÃO</span>' : '—';
      document.getElementById('gx-cli-corpo').innerHTML = l.length ? '<div class="tw"><table><thead><tr><th>Grupo</th><th>Nome</th><th>CPF/CNPJ</th><th>Tipo</th><th>Responsável</th><th style="text-align:right">Passivo</th><th>CAPAG</th><th>Procuração</th><th>Certificado</th><th>Situação</th></tr></thead><tbody>'
        + l.map((c) => '<tr data-gx="' + esc(window._gx(c)) + '"><td><span class="tag tn">' + esc(c.grupo || '—') + '</span></td><td><b>' + esc(c.nome) + '</b>'
          + (c.isPJ === false ? ' <span class="tag tx" title="Pessoa física: não soma no total do grupo">PF</span>' : '') + (c.socioAdmin && c.socioAdmin !== '-' ? '<div class="gx-sub">Sócio: ' + esc(c.socioAdmin) + '</div>' : '') + '</td>'
          + '<td class="mono">' + esc(c.cpfCnpj || '—') + '</td><td>' + esc(c.tipoCliente || '—') + '</td><td>' + pessoa(c.responsavel) + '</td>'
          + '<td class="mono" style="text-align:right">' + (tribAll(c) ? brValor(tribAll(c)) : '—') + '</td><td>' + (c.capag ? '<span class="tag ' + (/^[ab]$/i.test(c.capag) ? 'tg' : /omisso/i.test(c.capag) ? 'tx' : 'ta') + '">' + esc(c.capag) + '</span>' : '—') + '</td>'
          + '<td>' + selo(c.procuracao) + '</td><td>' + selo(c.certificado) + '</td><td>' + (c.sitCadastral ? '<span class="tag ' + (/ativa/i.test(c.sitCadastral) ? 'tg' : 'tr') + '">' + esc(c.sitCadastral) + '</span>' : '—') + '</td></tr>').join('')
        + '</tbody></table></div>' : vazio('Nenhum cliente com esses filtros.');
    };
    ligarFiltros(alvo, 'clientes', pintar); pintar();
    document.getElementById('gx-cli-novo').onclick = () => ED.abrirFormulario('clientes', null, { tipo: 'Consultoria' });
  };

  // ═════════════════════════ CONTRATOS ═════════════════════════
  DESENHO.contratos = async function (alvo) {
    const [contratos, grupos] = await Promise.all([
      buscarTodos(() => sb.from('contratos').select('*, clientes(nome, grupo_id), lancamentos(valor, pago)').order('data_contrato', { ascending: false })),
      buscarTodos(() => sb.from('grupos').select('id,nome'))]);
    const G = {}; grupos.forEach((g) => { G[g.id] = g.nome; });
    alvo.innerHTML = banner('📄', 'Contratos', 'Ao cadastrar, as parcelas entram sozinhas em Honorários Jurídico')
      + '<div class="cc"><div class="cc-hd" style="flex-wrap:wrap;gap:8px"><div class="cc-t">Contratos <span class="gx-cont" id="gx-ct-n"></span></div>'
      + '<button type="button" class="gx-bt gx-prim" id="gx-ct-novo">＋ Novo contrato</button></div>'
      + filtros('contratos', [{ k: 'busca', rot: 'Buscar', ph: 'cliente ou descrição' },
        { k: 'status', rot: 'Status', padrao: 'Ativo', ops: [['', 'Todos'], 'Ativo', 'Encerrado', 'Cancelado'] }])
      + '<div id="gx-ct-corpo"></div></div>';
    const pintar = () => {
      const b = normalizar(F('contratos', 'busca')); const st = FILTRO.contratos.status ?? 'Ativo';
      const l = contratos.filter((c) => (!st || c.status === st) && (!b || normalizar([c.descricao, c.clientes && c.clientes.nome].join(' ')).includes(b)));
      document.getElementById('gx-ct-n').textContent = '· ' + l.length + ' · total ' + brValor(soma(l, (c) => c.valor_total));
      document.getElementById('gx-ct-corpo').innerHTML = l.length ? '<div class="tw"><table><thead><tr><th>Data</th><th>Cliente</th><th>Grupo</th><th>Descrição</th><th>Responsável</th><th style="text-align:right">Valor total</th><th>Parcelas pagas</th><th style="text-align:right">Recebido</th><th>Status</th></tr></thead><tbody>'
        + l.map((c) => {
          const parc = c.lancamentos || []; const pagas = parc.filter((x) => x.pago);
          return '<tr data-gx="contratos:' + c.id + '::"><td class="mono">' + brData(c.data_contrato) + '</td><td><b>' + esc(c.clientes ? c.clientes.nome : '—') + '</b></td><td>' + esc((c.clientes && G[c.clientes.grupo_id]) || '—') + '</td>'
            + '<td>' + esc(c.descricao) + (c.percentual_exito ? '<div class="gx-sub">Êxito: ' + c.percentual_exito + '%</div>' : '') + '</td><td>' + pessoa(c.responsavel) + '</td>'
            + '<td class="mono" style="text-align:right">' + brValor(c.valor_total) + '</td><td class="mono">' + pagas.length + ' / ' + parc.length + '</td>'
            + '<td class="mono" style="text-align:right">' + brValor(soma(pagas, (x) => x.valor)) + '</td><td><span class="tag ' + ({ Ativo: 'tg', Encerrado: 'tx', Cancelado: 'tr' }[c.status] || 'tx') + '">' + esc(c.status) + '</span></td></tr>';
        }).join('') + '</tbody></table></div>' : vazio('Nenhum contrato com esses filtros.');
    };
    ligarFiltros(alvo, 'contratos', pintar); pintar();
    document.getElementById('gx-ct-novo').onclick = () => ED.abrirFormulario('contratos', null, { data_contrato: hojeISO(), num_parcelas: 1, status: 'Ativo' });
  };

  // ═════════════════════════ TAREFAS ═════════════════════════
  const PRI = { alta: ['Alta', 'tr'], media: ['Média', 'ta'], baixa: ['Baixa', 'tg'] };
  const STT = { pendente: 'Pendente', andamento: 'Em andamento', aguardando: 'Aguardando', concluida: 'Concluída', cancelada: 'Cancelada' };
  DESENHO.tarefas = async function (alvo) {
    const [tarefas, grupos] = await Promise.all([
      buscarTodos(() => sb.from('tarefas').select('*').order('prazo', { nullsFirst: false })),
      buscarTodos(() => sb.from('grupos').select('id,nome'))]);
    const G = {}; grupos.forEach((g) => { G[g.id] = g.nome; });
    const resp = [...new Set(tarefas.map((t) => t.responsavel).filter(Boolean))].sort();
    alvo.innerHTML = banner('☑', 'Tarefas', 'Prazos do escritório · ✓ conclui, ✎ edita')
      + '<div class="cc"><div class="cc-hd" style="flex-wrap:wrap;gap:8px"><div class="cc-t">Tarefas <span class="gx-cont" id="gx-tf-n"></span></div>'
      + '<button type="button" class="gx-bt gx-prim" id="gx-tf-nova">＋ Nova tarefa</button></div>'
      + filtros('tarefas', [
        { k: 'situacao', rot: 'Situação', padrao: 'abertas', ops: [['abertas', 'Abertas'], ['concluidas', 'Concluídas'], ['', 'Todas']] },
        { k: 'prazo', rot: 'Prazo', ops: [['', 'Qualquer'], ['atrasadas', 'Atrasadas'], ['hoje', 'Até hoje'], ['7', 'Próximos 7 dias'], ['30', 'Próximos 30 dias']] },
        { k: 'resp', rot: 'Responsável', ops: [['', 'Todos']].concat(resp) },
        { k: 'pri', rot: 'Prioridade', ops: [['', 'Todas'], ['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']] },
        { k: 'busca', rot: 'Buscar', ph: 'tarefa ou processo' }])
      + '<div id="gx-tf-corpo"></div></div>';
    const hoje = hojeISO();
    const pintar = () => {
      const sit = FILTRO.tarefas.situacao ?? 'abertas', pz = F('tarefas', 'prazo'), b = normalizar(F('tarefas', 'busca'));
      const fechada = (t) => ['concluida', 'cancelada'].includes(t.status);
      const l = tarefas.filter((t) => (sit === '' || (sit === 'abertas' ? !fechada(t) : fechada(t)))
        && (!F('tarefas', 'resp') || t.responsavel === F('tarefas', 'resp')) && (!F('tarefas', 'pri') || t.prioridade === F('tarefas', 'pri'))
        && (!pz || (t.prazo && (pz === 'atrasadas' ? t.prazo < hoje : pz === 'hoje' ? t.prazo <= hoje : t.prazo >= hoje && t.prazo <= somarDias(hoje, +pz))))
        && (!b || normalizar(t.titulo + ' ' + t.processos_vinculados).includes(b)));
      document.getElementById('gx-tf-n').textContent = '· ' + l.length + ' · ' + tarefas.filter((t) => !fechada(t) && t.prazo && t.prazo < hoje).length + ' atrasada(s) no total';
      document.getElementById('gx-tf-corpo').innerHTML = l.length ? '<div class="tw"><table><thead><tr><th>Prazo</th><th>Tarefa</th><th>Grupo</th><th>Responsável</th><th>Prioridade</th><th>Status</th><th>Ações</th></tr></thead><tbody>'
        + l.map((t) => {
          const atr = t.prazo && t.prazo < hoje && !fechada(t);
          return '<tr data-gx="tarefas:' + t.id + '::"><td class="mono' + (atr ? ' gx-atraso' : '') + '">' + brData(t.prazo) + (atr ? ' ⚠' : '') + '</td><td><b>' + esc(t.titulo) + '</b>'
            + (t.processos_vinculados ? '<div class="gx-sub">' + esc(t.processos_vinculados) + '</div>' : '') + (t.obs ? '<div class="gx-sub">' + esc(t.obs) + '</div>' : '') + '</td>'
            + '<td>' + esc(G[t.grupo_id] || '—') + '</td><td>' + pessoa(t.responsavel) + '</td><td><span class="tag ' + ((PRI[t.prioridade] || [])[1] || 'tx') + '">' + esc((PRI[t.prioridade] || [t.prioridade])[0]) + '</span></td>'
            + '<td>' + esc(STT[t.status] || t.status) + '</td><td>' + (fechada(t) ? '' : '<button type="button" class="gx-la-bx" data-concluir="' + t.id + '">✓ Concluir</button>') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : vazio('Nenhuma tarefa com esses filtros.');
      alvo.querySelectorAll('[data-concluir]').forEach((bt) => bt.onclick = async (e) => {
        e.stopPropagation(); bt.disabled = true;
        const { data, error } = await sb.from('tarefas').update({ status: 'concluida' }).eq('id', bt.dataset.concluir).select().single();
        if (error) { bt.disabled = false; return aviso('⚠ ' + erroAmigavel(error)); }
        ED.gravou('Concluiu tarefa — ' + data.titulo, async () => { await sb.from('tarefas').update({ status: 'pendente' }).eq('id', data.id); ED.recarregar(); });
        ED.recarregar();
      });
    };
    ligarFiltros(alvo, 'tarefas', pintar); pintar();
    document.getElementById('gx-tf-nova').onclick = () => ED.abrirFormulario('tarefas', null, { status: 'pendente', prioridade: 'media', inicio: hojeISO() });
  };

  // ═════════════════════════ ADMINISTRAÇÃO ═════════════════════════
  let _abaAdm = 'usuarios';
  DESENHO.admin = async function (alvo) {
    if (!ehAdmin()) { alvo.innerHTML = vazio('Só o administrador acessa esta tela.'); return; }
    const ABAS = [['usuarios', '👤 Usuários'], ['importar', '📥 Importar planilhas'], ['backup', '💾 Backup'], ['historico', '🕘 Histórico']];
    alvo.innerHTML = banner('⚙', 'Administração', 'Usuários, importação das planilhas, backup e histórico de alterações')
      + '<div class="gx-abas">' + ABAS.map((a) => '<button type="button" data-aba="' + a[0] + '"' + (a[0] === _abaAdm ? ' class="on"' : '') + '>' + a[1] + '</button>').join('')
      + '<a class="gx-abas-link" href="gestao.html" title="A tela antiga continua disponível enquanto você testa">Abrir o Gestão (versão anterior) ↗</a></div>'
      + '<div id="gx-adm-corpo"><div class="gx-carregando">Carregando…</div></div>';
    alvo.querySelectorAll('[data-aba]').forEach((b) => b.onclick = () => { _abaAdm = b.dataset.aba; desenhar('admin'); });
    await ADM[_abaAdm](document.getElementById('gx-adm-corpo'));
  };
  const ADM = {};

  // ── Usuários ──
  const PAPEIS = [['admin', 'Administrador'], ['equipe', 'Equipe'], ['cliente', 'Cliente (Portal)'], ['inativo', 'Inativo']];
  ADM.usuarios = async function (corpo) {
    const [perfis, vinculos, grupos] = await Promise.all([
      buscarTodos(() => sb.from('perfis').select('*').order('criado_em')),
      buscarTodos(() => sb.from('perfil_grupos').select('*')).catch(() => []),
      buscarTodos(() => sb.from('grupos').select('id,nome').order('nome'))]);
    const G = {}; grupos.forEach((g) => { G[g.id] = g.nome; });
    const eu = window.ERP_EU && window.ERP_EU.id;
    corpo.innerHTML = '<div class="cc"><div class="cc-hd" style="flex-wrap:wrap;gap:8px"><div class="cc-t">Usuários <span class="gx-cont">· ' + perfis.length + '</span></div>'
      + '<button type="button" class="gx-bt gx-prim" id="gx-us-novo">＋ Novo usuário</button></div>'
      + '<div class="gx-dica"><b>Administrador</b>: tudo, inclusive excluir e liberar usuários. <b>Equipe</b>: lança, edita e dá baixa; não exclui. '
      + '<b>Cliente</b>: só consulta, no Portal, os grupos marcados. <b>Inativo</b>: não entra.</div>'
      + '<div class="tw"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Grupos (Portal)</th><th>Desde</th><th>Ações</th></tr></thead><tbody>'
      + perfis.map((p) => {
        const gs = vinculos.filter((v) => v.perfil_id === p.id).map((v) => G[v.grupo_id]).filter(Boolean);
        return '<tr><td><b>' + esc(p.nome || '—') + '</b>' + (p.id === eu ? ' <span class="tag tn">você</span>' : '') + '</td><td class="mono">' + esc(p.email) + '</td>'
          + '<td><select data-papel="' + p.id + '">' + PAPEIS.map((o) => '<option value="' + o[0] + '"' + (p.papel === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></td>'
          + '<td>' + (p.papel === 'cliente' ? (gs.length ? gs.map((g) => '<span class="tag tn">' + esc(g) + '</span>').join(' ') : '<span class="tag tr">nenhum</span>') + ' <button type="button" class="gx-mini" data-grupos="' + p.id + '">editar</button>' : '—') + '</td>'
          + '<td class="mono">' + brData(p.criado_em) + '</td><td class="gx-nowrap"><button type="button" class="gx-mini" data-senha="' + esc(p.email) + '" title="Envia por e-mail um link para a pessoa criar uma nova senha">🔑 Link de senha</button></td></tr>';
      }).join('') + '</tbody></table></div></div>';
    corpo.querySelectorAll('[data-papel]').forEach((s) => s.onchange = async () => {
      const antes = perfis.find((p) => p.id === s.dataset.papel).papel;
      if (s.dataset.papel === eu && s.value !== 'admin' && !confirm('Você vai tirar o seu próprio acesso de administrador. Continuar?')) { s.value = antes; return; }
      const { error } = await sb.from('perfis').update({ papel: s.value }).eq('id', s.dataset.papel);
      if (error) { s.value = antes; return aviso('⚠ ' + (/admin/i.test(error.message) ? 'Precisa existir pelo menos um administrador.' : erroAmigavel(error))); }
      const p = perfis.find((x) => x.id === s.dataset.papel);
      ED.gravou('Papel de ' + (p.nome || p.email) + ': ' + (PAPEIS.find((o) => o[0] === s.value) || [])[1]);
      ADM.usuarios(corpo);
    });
    corpo.querySelectorAll('[data-senha]').forEach((b) => b.onclick = async () => {
      if (!confirm('Enviar para ' + b.dataset.senha + ' um e-mail com link para criar nova senha?')) return;
      b.disabled = true;
      const { error } = await sb.auth.resetPasswordForEmail(b.dataset.senha, { redirectTo: location.origin + location.pathname });
      b.disabled = false;
      if (error) return aviso('⚠ ' + erroAmigavel(error));
      aviso('✓ Link enviado para ' + b.dataset.senha + '.');
    });
    corpo.querySelectorAll('[data-grupos]').forEach((b) => b.onclick = () => editarGruposCliente(perfis.find((p) => p.id === b.dataset.grupos), grupos, vinculos, () => ADM.usuarios(corpo)));
    document.getElementById('gx-us-novo').onclick = () => novoUsuario(grupos, () => ADM.usuarios(corpo));
  };

  function janela(titulo, html, largura) {
    document.querySelectorAll('.gx-fundo').forEach((f) => f.remove());
    const f = document.createElement('div');
    f.className = 'gx-fundo';
    f.innerHTML = '<div class="gx-janela" role="dialog" aria-modal="true" style="max-width:' + (largura || 620) + 'px"><div class="gx-barra-topo"><h3>' + esc(titulo) + '</h3><button type="button" class="gx-x" aria-label="Fechar">✕</button></div><div class="gx-corpo">' + html + '</div></div>';
    document.body.appendChild(f);
    f.querySelector('.gx-x').onclick = () => f.remove();
    f.addEventListener('mousedown', (e) => { if (e.target === f) f.remove(); });
    return f;
  }
  const marcaGrupos = (grupos, marcados) => '<div class="gx-grupos-lista">' + grupos.map((g) => '<label><input type="checkbox" value="' + g.id + '"' + (marcados.includes(g.id) ? ' checked' : '') + '> ' + esc(g.nome) + '</label>').join('') + '</div>';
  async function salvarGrupos(perfilId, ids) {
    let r = await sb.from('perfil_grupos').delete().eq('perfil_id', perfilId);
    if (r.error) throw r.error;
    if (ids.length) { r = await sb.from('perfil_grupos').insert(ids.map((g) => ({ perfil_id: perfilId, grupo_id: g }))); if (r.error) throw r.error; }
  }
  function editarGruposCliente(p, grupos, vinculos, depois) {
    const marcados = vinculos.filter((v) => v.perfil_id === p.id).map((v) => v.grupo_id);
    const f = janela('Grupos que ' + (p.nome || p.email) + ' vê no Portal', '<input type="search" class="gx-busca-g" placeholder="filtrar grupos…">' + marcaGrupos(grupos, marcados)
      + '<div class="gx-msg"></div><div class="gx-acoes"><span style="flex:1"></span><button type="button" class="gx-bt gx-prim" data-salvar>Salvar</button></div>');
    f.querySelector('.gx-busca-g').oninput = (e) => { const b = normalizar(e.target.value); f.querySelectorAll('.gx-grupos-lista label').forEach((l) => { l.style.display = normalizar(l.textContent).includes(b) ? '' : 'none'; }); };
    f.querySelector('[data-salvar]').onclick = async () => {
      const ids = [...f.querySelectorAll('.gx-grupos-lista input:checked')].map((i) => i.value);
      try { await salvarGrupos(p.id, ids); f.remove(); ED.gravou('Grupos do Portal de ' + (p.nome || p.email) + ': ' + ids.length); depois(); }
      catch (e) { f.querySelector('.gx-msg').textContent = '⚠ ' + erroAmigavel(e); }
    };
  }
  function novoUsuario(grupos, depois) {
    const f = janela('Novo usuário', '<form class="gx-form" novalidate><div class="gx-grade">'
      + '<div class="gx-campo"><label>Nome <b>*</b></label><input name="nome" autocomplete="off"></div>'
      + '<div class="gx-campo"><label>E-mail <b>*</b></label><input name="email" type="email" autocomplete="off"></div>'
      + '<div class="gx-campo"><label>Senha provisória <b>*</b></label><input name="senha" type="text" autocomplete="new-password"><small>mínimo 8 caracteres; a pessoa pode trocar depois</small></div>'
      + '<div class="gx-campo"><label>Papel</label><select name="papel">' + PAPEIS.filter((o) => o[0] !== 'inativo').map((o) => '<option value="' + o[0] + '"' + (o[0] === 'equipe' ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></div>'
      + '</div><div class="gx-sub-g" hidden><div class="gx-campo"><label>Grupos que o cliente vê</label></div><input type="search" class="gx-busca-g" placeholder="filtrar grupos…">' + marcaGrupos(grupos, []) + '</div>'
      + '<div class="gx-dica" style="margin-top:12px">Se o Supabase estiver com <b>confirmação de e-mail</b> ligada, a pessoa recebe um e-mail e precisa clicar no link antes do primeiro acesso.</div>'
      + '<div class="gx-msg"></div><div class="gx-acoes"><span style="flex:1"></span><button type="submit" class="gx-bt gx-prim">Criar usuário</button></div></form>', 680);
    const form = f.querySelector('form'), msg = f.querySelector('.gx-msg');
    form.papel.onchange = () => { f.querySelector('.gx-sub-g').hidden = form.papel.value !== 'cliente'; };
    f.querySelector('.gx-busca-g').oninput = (e) => { const b = normalizar(e.target.value); f.querySelectorAll('.gx-grupos-lista label').forEach((l) => { l.style.display = normalizar(l.textContent).includes(b) ? '' : 'none'; }); };
    form.onsubmit = async (e) => {
      e.preventDefault(); msg.textContent = '';
      const nome = form.nome.value.trim(), email = form.email.value.trim().toLowerCase(), senha = form.senha.value, papel = form.papel.value;
      const ids = [...f.querySelectorAll('.gx-grupos-lista input:checked')].map((i) => i.value);
      if (!nome || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.textContent = '⚠ Preencha nome e um e-mail válido.'; return; }
      if (senha.length < 8) { msg.textContent = '⚠ A senha provisória precisa ter pelo menos 8 caracteres.'; return; }
      if (papel === 'cliente' && !ids.length) { msg.textContent = '⚠ Marque pelo menos um grupo para o cliente.'; return; }
      const bt = form.querySelector('[type=submit]'); bt.disabled = true; bt.textContent = 'Criando…';
      try {
        // cliente temporário: não mexe na sua sessão de administrador
        const tmp = window.supabase.createClient(window.ERP_CONFIG.url, window.ERP_CONFIG.chave, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'gx-novo-usuario' } });
        const { data, error } = await tmp.auth.signUp({ email, password: senha, options: { data: { nome }, emailRedirectTo: location.origin + location.pathname } });
        if (error) {
          if (/not allowed|disabled|signups/i.test(error.message)) throw new Error('O cadastro de usuários está desligado no Supabase. Ligue em Authentication → Sign In / Providers → "Allow new users to sign up".');
          if (/registered|exists/i.test(error.message)) throw new Error('Já existe um usuário com esse e-mail.');
          if (/password/i.test(error.message)) throw new Error('Senha fraca: use pelo menos 8 caracteres, com letras e números.');
          throw error;
        }
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error('Já existe um usuário com esse e-mail.');
        let perfil = null;
        for (let i = 0; i < 6 && !perfil; i++) {
          const r = await sb.from('perfis').select('*').eq('email', email).maybeSingle();
          perfil = r.data; if (!perfil) await new Promise((ok) => setTimeout(ok, 500));
        }
        if (!perfil) throw new Error('Usuário criado, mas o perfil não apareceu. Clique em Usuários de novo em alguns segundos e ajuste o papel.');
        const r2 = await sb.from('perfis').update({ papel, nome }).eq('id', perfil.id);
        if (r2.error) throw r2.error;
        if (papel === 'cliente') await salvarGrupos(perfil.id, ids);
        f.remove();
        ED.gravou('Criou usuário ' + nome + ' (' + (PAPEIS.find((o) => o[0] === papel) || [])[1] + ')');
        aviso('✓ Usuário criado. Passe o e-mail e a senha provisória para ' + nome.split(' ')[0] + '.');
        depois();
      } catch (err) {
        msg.textContent = '⚠ ' + erroAmigavel(err);
        bt.disabled = false; bt.textContent = 'Criar usuário';
      }
    };
  }

  // ── Importar planilhas ──
  const NOME_IMP = { base: '👥 Base de Dados → Clientes', financeiro: '💼 Financeiro → Honorários Jurídico', contabilidade: '🧮 Financeiro → Contabilidade',
    processos: '⚖ Processos', parcelamentos: '◷ Parcelamentos Tributários', acordos: '✦ Acordos', tarefas: '☑ Tarefas' };
  const TABELA_IMP = { base: 'clientes', financeiro: 'lancamentos', contabilidade: 'lancamentos', processos: 'processos', parcelamentos: 'parcelamentos', acordos: 'acordos', tarefas: 'tarefas' };
  const registrosImp = (r) => r.clientes || r.lancamentos || r.processos || r.parcelamentos || r.acordos || r.tarefas || [];
  function carregarScript(src) {
    return new Promise((ok, falha) => {
      if (document.querySelector('script[src="' + src + '"]')) return ok();
      const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => falha(new Error('Não consegui carregar ' + src)); document.head.appendChild(s);
    });
  }
  let _imp = [];
  ADM.importar = async function (corpo) {
    corpo.innerHTML = '<div class="cc"><div class="cc-hd"><div class="cc-t">📥 Importar planilhas do Google Sheets</div></div>'
      + '<p class="gx-p">No Google Sheets: <b>Arquivo → Fazer download → Microsoft Excel (.xlsx)</b>. Depois escolha os arquivos aqui (pode escolher vários de uma vez). '
      + 'Aceita: 1 Base de Dados, 2 Processos, 3 Parcelamentos Tributários, 4 Acordos, 7 Financeiro, 12 Financeiro - Contabilidade e 15 Tarefas.</p>'
      + '<label class="gx-arquivo"><input type="file" id="gx-imp-arq" accept=".xlsx" multiple> <span>Escolher planilhas (.xlsx)</span></label>'
      + '<div class="gx-dica">Nada é gravado antes de você conferir a prévia. Importar de novo <b>não duplica</b>: atualiza o que veio das planilhas. A coluna <b>Senha</b> nunca é importada. Faça um backup antes de importações grandes.</div></div>'
      + '<div id="gx-imp-previa"></div>';
    document.getElementById('gx-imp-arq').onchange = (e) => lerPlanilhas([...e.target.files]);
  };
  async function lerPlanilhas(arquivos) {
    const previa = document.getElementById('gx-imp-previa');
    if (!arquivos.length) return;
    previa.innerHTML = '<div class="gx-carregando">Lendo planilhas…</div>';
    try {
      await carregarScript('importador.js'); await carregarScript('vendor/exceljs.min.js');
      _imp = [];
      for (const arq of arquivos) {
        const wb = new window.ExcelJS.Workbook();
        await wb.xlsx.load(await arq.arrayBuffer());
        const r = window.IMPORTADOR.importar(window.IMPORTADOR.lerWorkbook(wb)); r.arquivo = arq.name; _imp.push(r);
      }
    } catch (e) { previa.innerHTML = '<div class="cc gx-erro">Não consegui ler o arquivo: ' + esc(e.message) + '. Confira se é o .xlsx baixado do Google Sheets.</div>'; return; }
    const validos = _imp.filter((r) => r.tipo);
    const total = soma(validos, (r) => registrosImp(r).length);
    previa.innerHTML = _imp.map((r) => '<div class="cc"><div class="cc-hd"><div class="cc-t">' + (r.tipo ? NOME_IMP[r.tipo] : '⚠ Não reconhecida') + ' <span class="gx-cont">· ' + esc(r.arquivo) + '</span></div></div>'
      + (r.tipo ? '<div class="tw"><table><thead><tr><th>Aba</th><th>Linhas lidas</th><th>A importar</th><th>Ignoradas</th></tr></thead><tbody>'
        + Object.entries(r.resumo).map(([aba, x]) => '<tr><td>' + esc(aba) + '</td><td class="mono">' + x.lidas + '</td><td class="mono"><b>' + x.importadas + '</b></td><td class="mono">' + x.ignoradas + '</td></tr>').join('') + '</tbody></table></div>' : '')
      + (r.avisos.length ? '<details class="gx-det"' + (r.tipo ? '' : ' open') + '><summary>' + r.avisos.length + ' aviso(s)</summary><ul>' + r.avisos.map((a) => '<li>' + esc(a) + '</li>').join('') + '</ul></details>' : '') + '</div>').join('')
      + (validos.length ? '<div class="cc"><label class="gx-radio"><input type="radio" name="gx-imp-modo" value="atualizar" checked> Incluir novos <b>e atualizar</b> os que já vieram destas planilhas</label>'
        + '<label class="gx-radio"><input type="radio" name="gx-imp-modo" value="novos"> Só incluir novos (não mexe no que já foi importado)</label>'
        + '<div class="gx-acoes"><button type="button" class="gx-bt gx-prim" id="gx-imp-gravar">Importar ' + total + ' registro(s)</button> <span id="gx-imp-prog" class="gx-cont"></span></div></div>' : '');
    const b = document.getElementById('gx-imp-gravar');
    if (b) b.onclick = async () => { b.disabled = true; try { await gravarImportacao(); } catch (e) { document.getElementById('gx-imp-prog').textContent = '⚠ ' + erroAmigavel(e); b.disabled = false; } };
  }
  async function gravarImportacao() {
    const modo = (document.querySelector('input[name=gx-imp-modo]:checked') || {}).value || 'atualizar';
    const prog = document.getElementById('gx-imp-prog');
    const validos = _imp.filter((r) => r.tipo).sort((a, b) => (a.tipo === 'base' ? -1 : 0) - (b.tipo === 'base' ? -1 : 0));
    prog.textContent = 'Criando grupos…';
    let grupos = await buscarTodos(() => sb.from('grupos').select('id,nome'));
    const faltam = [...new Set(validos.flatMap((r) => r.grupos))].filter((g) => !grupos.some((x) => normalizar(x.nome) === normalizar(g)));
    for (let i = 0; i < faltam.length; i += 200) { const r = await sb.from('grupos').insert(faltam.slice(i, i + 200).map((nome) => ({ nome }))); if (r.error) throw r.error; }
    grupos = await buscarTodos(() => sb.from('grupos').select('id,nome'));
    const idGrupo = (n) => { const g = n && grupos.find((x) => normalizar(x.nome) === normalizar(n)); return g ? g.id : null; };
    const upsert = async (tabela, linhas) => {
      for (let i = 0; i < linhas.length; i += 200) {
        prog.textContent = 'Gravando ' + tabela + ': ' + Math.min(i + 200, linhas.length) + ' de ' + linhas.length + '…';
        const r = await sb.from(tabela).upsert(linhas.slice(i, i + 200), { onConflict: 'chave_importacao', ignoreDuplicates: modo === 'novos' });
        if (r.error) throw r.error;
      }
    };
    const resultado = [];
    for (const r of validos) {
      const tabela = TABELA_IMP[r.tipo];
      let clientes = [];
      if (r.tipo === 'parcelamentos') clientes = await buscarTodos(() => sb.from('clientes').select('nome,cpf_cnpj,grupo_id'));
      const grupoDoCliente = (x) => { const d = soDigitos(x.cnpj); const c = clientes.find((k) => (d && soDigitos(k.cpf_cnpj) === d) || normalizar(k.nome) === normalizar(x.empresa)); return c && c.grupo_id; };
      const filhos = [];
      const linhas = registrosImp(r).map((x) => {
        const y = Object.assign({}, x);
        y.grupo_id = (r.tipo === 'parcelamentos' && grupoDoCliente(x)) || idGrupo(x._grupo);
        delete y._grupo;
        if (y._parcelas) { filhos.push(...y._parcelas.map((p) => Object.assign({ _pai: y.chave_importacao }, p))); delete y._parcelas; }
        return y;
      });
      await upsert(tabela, linhas);
      if (filhos.length) {
        const ids = {};
        (await buscarTodos(() => sb.from('parcelamentos').select('id,chave_importacao').not('chave_importacao', 'is', null))).forEach((p) => { ids[p.chave_importacao] = p.id; });
        await upsert('parcelas', filhos.filter((p) => ids[p._pai]).map((p) => { const y = Object.assign({ parcelamento_id: ids[p._pai] }, p); delete y._pai; return y; }));
        resultado.push(filhos.length + ' parcela(s)');
      }
      resultado.push(linhas.length + ' — ' + NOME_IMP[r.tipo].replace(/^\S+\s/, ''));
    }
    prog.textContent = '';
    document.getElementById('gx-imp-previa').innerHTML = '<div class="cc gx-ok-box">✓ Importado: ' + esc(resultado.join(' · ')) + '. Confira os totais no Painel e em Honorários e compare com as planilhas.</div>';
    ED.gravou('Importação de planilhas: ' + resultado.join(' · '));
    ED.recarregar();
  }

  // ── Backup ──
  const TABELAS_BACKUP = ['clientes', 'grupos', 'contratos', 'lancamentos', 'processos', 'parcelamentos', 'parcelas', 'acordos', 'tarefas', 'perfis', 'perfil_grupos', 'configuracoes', 'historico'];
  ADM.backup = async function (corpo) {
    corpo.innerHTML = '<div class="cc"><div class="cc-hd"><div class="cc-t">💾 Backup de todos os dados</div></div>'
      + '<p class="gx-p">Baixa uma cópia completa: clientes, grupos, contratos, lançamentos, processos, parcelamentos, acordos, tarefas, usuários e histórico.</p>'
      + '<div class="gx-acoes" style="justify-content:flex-start"><button type="button" class="gx-bt gx-prim" id="gx-bk-x">⬇ Backup em Excel</button><button type="button" class="gx-bt" id="gx-bk-j">⬇ Backup completo (.json)</button></div>'
      + '<div id="gx-bk-prog" class="gx-cont" style="margin:10px 0"></div>'
      + '<div class="gx-dica"><b>Como guardar com segurança</b><br>1. Faça o backup toda semana e antes de qualquer importação grande.<br>2. Guarde numa pasta do seu Google Drive que só você acessa — não mande por e-mail nem WhatsApp.<br>3. O arquivo tem dados de clientes: trate como documento sigiloso (LGPD).</div></div>';
    const fazer = async (fmt) => {
      const prog = document.getElementById('gx-bk-prog'); const dados = {};
      for (const t of TABELAS_BACKUP) {
        prog.textContent = 'Lendo ' + t + '…';
        const ordem = t === 'historico' ? 'id' : t === 'perfil_grupos' ? 'perfil_id' : t === 'configuracoes' ? 'chave' : 'criado_em';
        try { dados[t] = await buscarTodos(() => sb.from(t).select('*').order(ordem)); } catch (e) { dados[t] = []; }
      }
      const nome = 'Backup ERP Araujo e Castro ' + new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', 'h');
      let blob;
      if (fmt === 'json') blob = new Blob([JSON.stringify({ gerado_em: new Date().toISOString(), versao: 3, dados }, null, 1)], { type: 'application/json' });
      else {
        prog.textContent = 'Montando o Excel…';
        await carregarScript('vendor/exceljs.min.js');
        const wb = new window.ExcelJS.Workbook();
        const leia = wb.addWorksheet('Leia-me');
        leia.addRows([['Backup do ERP Araújo & Castro'], ['Gerado em', new Date().toLocaleString('pt-BR')], [], ...TABELAS_BACKUP.map((t) => [t, dados[t].length + ' registro(s)'])]);
        TABELAS_BACKUP.forEach((t) => {
          const ws = wb.addWorksheet(t);
          const cols = dados[t].length ? Object.keys(dados[t][0]) : ['(vazio)'];
          ws.addRow(cols).font = { bold: true };
          dados[t].forEach((reg) => ws.addRow(cols.map((c) => (reg[c] != null && typeof reg[c] === 'object' ? JSON.stringify(reg[c]) : reg[c]))));
        });
        blob = new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome + (fmt === 'json' ? '.json' : '.xlsx');
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      prog.textContent = '✓ Backup baixado: ' + TABELAS_BACKUP.map((t) => dados[t].length + ' ' + t).join(' · ');
    };
    const liga = (id, fmt) => { const b = document.getElementById(id); b.onclick = async () => { b.disabled = true; try { await fazer(fmt); } catch (e) { aviso('⚠ ' + erroAmigavel(e)); } b.disabled = false; }; };
    liga('gx-bk-x', 'xlsx'); liga('gx-bk-j', 'json');
  };

  // ── Histórico ──
  const NOME_TAB = { clientes: 'Cliente', contratos: 'Contrato', lancamentos: 'Lançamento', processos: 'Processo', parcelamentos: 'Parcelamento', parcelas: 'Parcela', acordos: 'Acordo', tarefas: 'Tarefa', perfis: 'Usuário' };
  let _histTab = '';
  ADM.historico = async function (corpo) {
    let q = sb.from('historico').select('*').order('quando', { ascending: false }).limit(300);
    if (_histTab) q = q.eq('tabela', _histTab);
    const [{ data, error }, perfis] = await Promise.all([q, sb.from('perfis').select('id,nome,email')]);
    if (error) throw error;
    const quem = {}; (perfis.data || []).forEach((p) => { quem[p.id] = p.nome || p.email; });
    const ACAO = { INSERT: ['Incluiu', 'tg'], UPDATE: ['Alterou', 'ta'], DELETE: ['Excluiu', 'tr'] };
    const rot = (d) => d ? (d.nome || d.titulo || d.descricao || d.processo || d.empresa || d.numero || d.email || '') : '';
    corpo.innerHTML = '<div class="cc"><div class="cc-hd" style="flex-wrap:wrap;gap:8px"><div class="cc-t">🕘 Histórico <span class="gx-cont">· últimas 300 alterações</span></div>'
      + '<label class="gx-fl"><span>Tipo</span><select id="gx-hist-t"><option value="">Tudo</option>' + Object.entries(NOME_TAB).map(([k, v]) => '<option value="' + k + '"' + (k === _histTab ? ' selected' : '') + '>' + v + 's</option>').join('') + '</select></label></div>'
      + ((data || []).length ? '<div class="tw"><table><thead><tr><th>Quando</th><th>Quem</th><th>O quê</th><th>Registro</th><th data-sem-ordem>Detalhe</th></tr></thead><tbody>'
        + data.map((h) => '<tr><td class="mono">' + new Date(h.quando).toLocaleString('pt-BR') + '</td><td>' + esc(quem[h.usuario] || (h.usuario ? '?' : 'importação/sistema')) + '</td>'
          + '<td><span class="tag ' + (ACAO[h.acao] || ['', 'tx'])[1] + '">' + (ACAO[h.acao] || [h.acao])[0] + '</span> ' + esc(NOME_TAB[h.tabela] || h.tabela) + '</td><td>' + esc(rot(h.depois || h.antes)) + '</td>'
          + '<td>' + (h.registro_id && h.acao !== 'DELETE' ? '<button type="button" class="gx-mini" data-hist="' + h.tabela + ':' + h.registro_id + '">ver alterações</button>' : '') + '</td></tr>').join('')
        + '</tbody></table></div>' : vazio('Nenhuma alteração registrada ainda.')) + '</div>';
    document.getElementById('gx-hist-t').onchange = (e) => { _histTab = e.target.value; ADM.historico(corpo); };
    corpo.querySelectorAll('[data-hist]').forEach((b) => b.onclick = () => { const [t, id] = b.dataset.hist.split(':'); ED.verAlteracoes(t, id, NOME_TAB[t] || t); });
  };

  // ═════════════════ nova senha (link do e-mail) ═════════════════
  function telaNovaSenha() {
    const f = janela('Crie sua nova senha', '<form class="gx-form" novalidate><div class="gx-grade">'
      + '<div class="gx-campo"><label>Nova senha</label><input name="s1" type="password" autocomplete="new-password"></div>'
      + '<div class="gx-campo"><label>Repita a nova senha</label><input name="s2" type="password" autocomplete="new-password"></div></div>'
      + '<div class="gx-msg"></div><div class="gx-acoes"><span style="flex:1"></span><button type="submit" class="gx-bt gx-prim">Salvar nova senha</button></div></form>', 520);
    f.classList.add('gx-sobre-login');
    const form = f.querySelector('form');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const msg = f.querySelector('.gx-msg');
      if (form.s1.value.length < 8) { msg.textContent = '⚠ Use pelo menos 8 caracteres.'; return; }
      if (form.s1.value !== form.s2.value) { msg.textContent = '⚠ As duas senhas não são iguais.'; return; }
      const { error } = await sb.auth.updateUser({ password: form.s1.value });
      if (error) { msg.textContent = '⚠ ' + erroAmigavel(error) + ' Peça um link novo ao administrador.'; return; }
      await sb.auth.signOut();
      f.remove();
      history.replaceState(null, '', location.pathname);
      aviso('✓ Senha alterada. Entre com o seu e-mail e a nova senha.');
    };
  }

  // ═════════════════════════ início ═════════════════════════
  function iniciar() {
    montarNavegacao();
    criarPaineis();
    instalarGanchos();
    document.body.classList.toggle('gx-admin', ehAdmin());
    if (window.ERP_RECUPERACAO) telaNovaSenha();
    document.addEventListener('erp:recuperacao', telaNovaSenha);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
  window.ERP_DADOS = dadosERP;
  window.ERP_TELAS = { ir, desenhar };
})();
