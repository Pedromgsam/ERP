'use strict';
// ═══════════════════════════════════════════════════════════════════
// ERP unificado
//  • Barra superior no padrão do Gestão (texto da esquerda = ERP), com
//    entidades e grupos, "+ Lançar" e o usuário.
//  • Telas do Gestão dentro do ERP (Início, Contratos, Clientes, Tarefas,
//    Administração) — o código é o do próprio Gestão (gestao-embutida.js).
//  • Tabelas de lançamentos dos Honorários no formato do Gestão (menos colunas),
//    mantendo filtros, gráficos e cores do ERP.
// ═══════════════════════════════════════════════════════════════════
(function () {
  const ED = window.ERP_EDITOR;
  const { esc, erroAmigavel, aviso } = ED;
  const GS = () => window.GS;
  const ehCliente = () => !window.AC_SESSION || window.AC_SESSION.nivel === 'cliente';
  const ehAdmin = () => window.ERP_PAPEL === 'admin';
  const dadosERP = () => (typeof DB !== 'undefined' ? DB : {});

  // ═════════════════════════ MENU ═════════════════════════
  const MENU = [
    { id: 'hoje', rot: 'Início', equipe: true },
    { id: 'resumo', rot: 'Painel Executivo', func: 'relatorios' },
    { rot: 'Jurídico', itens: [['processos', 'Processos', 'juridico'], ['parcelamentos', 'Parcelamentos', 'juridico'], ['publicacoes', 'Publicações', 'juridico']] },
    { id: 'acordos', rot: 'Acordos', func: 'juridico' },
    { rot: 'Financeiro', equipe: true, itens: [['financeiro', 'Jurídico', 'financeiro_juridico'], ['financeiroContab', 'Contabilidade', 'financeiro_contab']] },
    { id: 'contratos', rot: 'Contratos', equipe: true, func: 'contratos' },
    { id: 'clientes', rot: 'Clientes', equipe: true, func: 'clientes' },
    { id: 'crm', rot: 'CRM', equipe: true, func: 'crm' },
    { id: 'documentos', rot: 'Documentos', equipe: true, func: 'documentos' },
    { id: 'tarefas', rot: 'Tarefas', equipe: true },
    { id: 'alertas', rot: 'Alertas', equipe: true },
    { id: 'admin', rot: 'Administração', admin: true }
  ];
  // Cobranças, avisos e recibos (antiga "Notificações"): fora da barra; abre pelo botão ✉ de cada tela e pelo ⋯
  const FUNC_EXTRA = { notificacoes: 'clientes' };
  // painéis novos → tela do Gestão que desenha nele
  const TELAS_GS = { hoje: 'inicio', contratos: 'contratos', clientes: 'clientes', crm: 'crm', publicacoes: 'publicacoes', documentos: 'documentos', tarefas: 'tarefas', alertas: 'alertas', automacoes: 'automacoes', aprovacoes: 'aprovacoes', admin: 'admin' };

  // "+ Lançar": formulários do Gestão onde existem; os demais, do editor do ERP
  const empresaAtual = () => (_painel === 'financeiroContab' ? 'contabilidade' : 'escritorio');
  const depois = () => ED.recarregar();
  async function comCadastros(fn) { await GS().carregarCadastros(); return fn(); }
  const LANCAR = [
    ['Receita (honorário)', () => comCadastros(() => GS().formLancamento({ tipo: 'receita', empresa: empresaAtual() }, depois)), '*fin'],
    ['Despesa', () => comCadastros(() => GS().formLancamento({ tipo: 'despesa', empresa: empresaAtual() }, depois)), '*fin'],
    ['Comissão / desconto (redutor de receita)', () => comCadastros(() => GS().formLancamento({ tipo: 'receita', redutor: true, empresa: empresaAtual(), categoria: 'Comissão' }, depois)), '*fin'],
    ['Cliente', () => comCadastros(() => GS().formCliente(undefined, depois)), 'clientes'],
    ['Contrato', () => comCadastros(() => GS().formContrato({})), 'contratos'],
    ['Processo', () => ED.abrirFormulario('processos', null, { carteira: 'Ativo', status: 'Em andamento' }), 'juridico'],
    ['Acordo (parcela)', () => ED.abrirFormulario('acordos', null, {}), 'juridico'],
    ['Parcelamento', () => ED.abrirParcelamento(null), 'juridico'],
    ['Tarefa', () => comCadastros(() => GS().formTarefa({}, depois))],
    ['Oportunidade (CRM)', () => comCadastros(() => GS().formOportunidade({}, depois)), 'crm']
  ];

  // ═════════════════ FUNÇÕES DE ACESSO (Administração → Usuários) ═════════════════
  const FUNC_TELA = {};
  Object.assign(FUNC_TELA, FUNC_EXTRA);
  MENU.forEach((m) => { if (m.id && m.func) FUNC_TELA[m.id] = m.func; (m.itens || []).forEach((x) => { if (x[2]) FUNC_TELA[x[0]] = x[2]; }); });
  function permitido(func, nivel) {
    if (!func) return true;
    const eu = window.ERP_EU || {};
    if (!GS() || !GS().pode) return true;
    if (func === '*fin') return GS().pode('financeiro_juridico', nivel, eu) || GS().pode('financeiro_contab', nivel, eu);
    return GS().pode(func, nivel, eu);
  }
  function aplicarFuncoes() {
    if (ehCliente()) return;
    document.querySelectorAll('#gs-hd [data-ir], #tn-baixo [data-baixo]').forEach((b) => { const id = b.dataset.ir || b.dataset.baixo; b.classList.toggle('gx-sem-funcao', !permitido(FUNC_TELA[id])); });
    document.querySelectorAll('#gs-hd [data-lancar]').forEach((b) => b.classList.toggle('gx-sem-funcao', !permitido(LANCAR[+b.dataset.lancar][2], 'editar')));
    document.querySelectorAll('#tn .tn-grupo').forEach((g) => { const its = g.querySelectorAll('.tn-menu [data-ir]'); if (its.length) g.classList.toggle('gx-sem-funcao', [...its].every((x) => x.classList.contains('gx-sem-funcao'))); });
    const lc = document.querySelector('#gs-hd .tn-lancar'); if (lc) lc.classList.toggle('gx-sem-funcao', [...document.querySelectorAll('#gs-hd [data-lancar]')].every((x) => x.classList.contains('gx-sem-funcao')));
  }
  document.addEventListener('erp:perfil', () => setTimeout(aplicarFuncoes, 0));

  // ═════════════════════ BARRA SUPERIOR ═════════════════════
  function montarBarra() {
    if (document.getElementById('gs-hd')) return;
    document.body.classList.add('gx-barra-topo');
    const hd = document.createElement('header');
    hd.id = 'gs-hd'; hd.className = 'gs';
    const itemCls = (m) => (m.equipe ? ' gx-so-equipe' : '') + (m.admin ? ' gx-so-admin' : '');
    hd.innerHTML =
      '<span id="gs-tela-nome"></span><nav id="tn" aria-label="Menu principal">' + MENU.map((m, i) => !m.itens
        ? '<button type="button" class="tn-it' + itemCls(m) + '" data-ir="' + m.id + '">' + esc(m.rot) + '</button>'
        : '<div class="tn-grupo' + itemCls(m) + '"><button type="button" class="tn-it tn-abre" data-grupo="' + i + '" aria-haspopup="true" aria-expanded="false">' + esc(m.rot) + ' <span class="tn-seta">▾</span></button>' +
          '<div class="tn-menu" role="menu">' + m.itens.map((x) => '<button type="button" role="menuitem" data-ir="' + x[0] + '">' + esc(x[1]) + '</button>').join('') + '</div></div>').join('') +
      '</nav>' +
      
      '<div class="tn-lancar gx-so-equipe"><button type="button" class="tn-lancar-bt" aria-haspopup="true" aria-expanded="false">+ Lançar</button>' +
      '<div class="tn-menu tn-menu-dir" role="menu">' + LANCAR.map((x, i) => '<button type="button" role="menuitem" data-lancar="' + i + '">' + esc(x[0]) + '</button>').join('') + '</div></div>' +
      '<div class="hd-usuario"><button type="button" id="gs-tema" title="Modo escuro / claro" aria-label="Alternar modo escuro" aria-pressed="false">◐</button><button type="button" id="gs-sino" class="gx-so-equipe" title="Avisos: prazos, menções e vencimentos" aria-label="Avisos">🔔<span id="gs-sino-n" hidden></span></button><span id="gs-nome"></span>' +
      '<div class="tn-grupo tn-mais-acoes"><button type="button" class="tn-abre gs-bt-mais" data-grupo="acoes" title="Atualizar dados e relatório em PDF" aria-label="Mais ações" aria-haspopup="true" aria-expanded="false">⋯</button>' +
      '<div class="tn-menu tn-menu-dir" role="menu"><button type="button" data-acao="atualizar">↻ Atualizar dados</button><button type="button" data-acao="pdf" class="gx-so-equipe">📄 Relatório em PDF</button><button type="button" data-acao="cobrancas" class="gx-so-equipe">✉ Cobranças, avisos e recibos</button><button type="button" data-acao="meunome">👤 Meu nome</button><button type="button" data-acao="aprovacoes" class="gx-so-equipe">📝 Aprovações (rascunhos)</button><button type="button" data-acao="avisos" class="gx-so-equipe">✉ Meus avisos por e-mail</button></div></div>' +
      '<button type="button" id="gs-sair">Sair</button></div>';
    document.body.insertBefore(hd, document.body.firstChild);
    const btTema = document.getElementById('gs-tema');
    const marcarTema = () => btTema.setAttribute('aria-pressed', temaEscuro() ? 'true' : 'false');
    marcarTema();
    btTema.onclick = () => {
      const escuro = !temaEscuro();
      if (escuro) document.documentElement.setAttribute('data-tema', 'escuro'); else document.documentElement.removeAttribute('data-tema');
      try { localStorage.setItem('erp_tema', escuro ? 'escuro' : 'claro'); } catch (e) { /* aba anônima: vale só agora */ }
      marcarTema();
      if (window.Chart && Chart.instances) Object.values(Chart.instances).forEach((c) => { try { c.update('none'); } catch (e) { /* gráfico já desmontado */ } });
    };
    document.getElementById('gs-sino').onclick = async () => {
      if (!GS()) return;
      try { await GS().carregarCadastros(); await GS().abrirAlertas(null, atualizarSino); } catch (e) { aviso(erroAmigavel(e), true); }
    };

    // celular: menu inferior + "Mais"
    const bn = document.createElement('nav');
    bn.id = 'tn-baixo'; bn.setAttribute('aria-label', 'Menu');
    bn.innerHTML = [['hoje', '⌂', 'Início', 1], ['resumo', '◈', 'Painel', 0], ['financeiro', '◎', 'Financeiro', 1], ['lancar', '+', 'Lançar', 1], ['mais', '☰', 'Mais', 0]]
      .map((x) => '<button type="button" data-baixo="' + x[0] + '"' + (x[3] ? ' class="gx-so-equipe"' : '') + '><span>' + x[1] + '</span>' + x[2] + '</button>').join('');
    document.body.appendChild(bn);

    document.addEventListener('click', (e) => {
      const alvo = e.target.closest && e.target.closest('[data-ir],[data-grupo],.tn-lancar-bt,[data-lancar],[data-baixo],[data-acao],#gs-sair,.gs-sair');
      const abertos = document.querySelectorAll('.tn-grupo.on,.tn-lancar.on');
      if (!alvo) { abertos.forEach(fecharMenu); return; }
      if (alvo.dataset.grupo !== undefined || alvo.classList.contains('tn-lancar-bt')) {
        const g = alvo.parentElement; const abrir = !g.classList.contains('on');
        abertos.forEach(fecharMenu);
        if (abrir) { g.classList.add('on'); alvo.setAttribute('aria-expanded', 'true'); }
        return;
      }
      abertos.forEach(fecharMenu); fecharMais();
      if (alvo.id === 'gs-sair' || alvo.classList.contains('gs-sair')) { if (typeof window.acLogout === 'function') window.acLogout(); }
      else if (alvo.dataset.acao === 'atualizar') { if (typeof window._dbCacheClear === 'function') window._dbCacheClear(); ED.recarregar(); }
      else if (alvo.dataset.acao === 'pdf') ir('relatorio');
      else if (alvo.dataset.acao === 'aprovacoes') ir('aprovacoes');
      else if (alvo.dataset.acao === 'meunome') pedirMeuNome(false);
      else if (alvo.dataset.acao === 'cobrancas') abrirCobrancas('hon');
      else if (alvo.dataset.acao === 'avisos') { if (GS()) GS().janelaMeusAvisos().catch((er) => aviso(erroAmigavel(er), true)); }
      else if (alvo.dataset.ir) ir(alvo.dataset.ir);
      else if (alvo.dataset.lancar !== undefined) LANCAR[+alvo.dataset.lancar][1]();
      else if (alvo.dataset.baixo === 'mais') abrirMais();
      else if (alvo.dataset.baixo === 'lancar') abrirMais(true);
      else if (alvo.dataset.baixo) ir(alvo.dataset.baixo);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { document.querySelectorAll('.tn-grupo.on,.tn-lancar.on').forEach(fecharMenu); fecharMais(); } });

    // Painel Executivo (Backup 15): sem o cartão de título; entidades, grupos e "Atualizado" ficam na linha dos filtros, à esquerda
    if (!document.getElementById('gx-linha-painel')) {
      const l = document.createElement('div');
      l.id = 'gx-linha-painel'; l.className = 'gx-so-equipe';
      l.innerHTML = '<div class="gs-contadores" id="gs-contadores" hidden><span class="gs-cont gs-cont-ent" title="Entidades (empresas e pessoas)">▣ <b id="gs-n-ent">0</b> entidades</span>' +
        '<span class="gs-cont gs-cont-grp" title="Grupos">◉ <b id="gs-n-grp">0</b> grupos</span></div><span id="gx-atualizado"></span>';
      document.body.appendChild(l);
      const sub = document.getElementById('pgResumoSub');
      const copiarHora = () => { const m = /Atualizado\s+\d{1,2}:\d{2}/.exec(sub ? sub.textContent : ''); document.getElementById('gx-atualizado').textContent = m ? '↻ ' + m[0] : ''; };
      if (sub) new MutationObserver(copiarHora).observe(sub, { childList: true, characterData: true, subtree: true });
      copiarHora();
    }
    const copiar = () => {
      const ent = document.getElementById('hdEntidades'), c = document.getElementById('gs-contadores');
      if (!ent || !c) return;
      c.hidden = ent.style.display === 'none';
      document.getElementById('gs-n-ent').textContent = (document.getElementById('hdEntCount') || {}).textContent || '0';
      document.getElementById('gs-n-grp').textContent = (document.getElementById('hdGrupoCount') || {}).textContent || '0';
    };
    const ent = document.getElementById('hdEntidades');
    if (ent) new MutationObserver(copiar).observe(ent, { attributes: true, childList: true, subtree: true, characterData: true });
    copiar();
  }
  function fecharMenu(g) { g.classList.remove('on'); const b = g.querySelector('[aria-expanded]'); if (b) b.setAttribute('aria-expanded', 'false'); }
  function abrirMais(soLancar) {
    fecharMais();
    const f = document.createElement('div');
    f.id = 'tn-mais';
    const cls = (m) => (m.equipe ? ' class="gx-so-equipe"' : m.admin ? ' class="gx-so-admin"' : '');
    const itens = soLancar ? '<div class="tn-mais-tit">Lançar</div>' + LANCAR.map((x, i) => '<button type="button" data-lancar="' + i + '">+ ' + esc(x[0]) + '</button>').join('')
      : MENU.map((m) => !m.itens ? '<button type="button"' + cls(m) + ' data-ir="' + m.id + '">' + esc(m.rot) + '</button>'
        : '<div class="tn-mais-tit' + (m.equipe ? ' gx-so-equipe' : '') + '">' + esc(m.rot) + '</div>' + m.itens.map((x) => '<button type="button"' + cls(m) + ' data-ir="' + x[0] + '">' + esc(x[1]) + '</button>').join('')).join('')
        + '<button type="button" data-acao="atualizar">↻ Atualizar dados</button><button type="button" data-acao="cobrancas">✉ Cobranças, avisos e recibos</button><button type="button" class="gs-sair">Sair</button>';
    f.innerHTML = '<div class="tn-mais-caixa">' + itens + '<button type="button" class="tn-mais-fechar" data-fechar>Fechar</button></div>';
    f.querySelectorAll('[data-ir]').forEach((b) => { if (!permitido(FUNC_TELA[b.dataset.ir])) b.remove(); });
    f.querySelectorAll('[data-lancar]').forEach((b) => { if (!permitido(LANCAR[+b.dataset.lancar][2], 'editar')) b.remove(); });
    document.body.appendChild(f);
    f.addEventListener('click', (e) => { if (e.target === f || e.target.closest('[data-fechar]')) fecharMais(); });
  }
  function fecharMais() { const f = document.getElementById('tn-mais'); if (f) f.remove(); }

  function ir(id) { if (typeof window.nav === 'function') window.nav(null, id); window.scrollTo(0, 0); }

  // ═════════════════ telas do Gestão dentro do ERP ═════════════════
  function criarPaineis() {
    const main = document.getElementById('main');
    if (!main) return;
    Object.keys(TELAS_GS).forEach((id) => {
      if (document.getElementById('panel-' + id)) return;
      const s = document.createElement('section');
      s.id = 'panel-' + id; s.className = 'panel gx-painel-gs'; s.dataset.loaded = '1';
      s.innerHTML = '<div class="gs"><main class="gs-main" id="gs-main-' + id + '"></main></div>';
      main.appendChild(s);
    });
  }
  function desenharGS(id) {
    if (!GS() || ehCliente()) return;
    if (id === 'admin' && !ehAdmin()) return;
    return GS().irPara(TELAS_GS[id], document.getElementById('gs-main-' + id));
  }

  let _painel = '', _voltando = false;
  function nomeTela(id) {
    for (const m of MENU) { if (m.id === id) return m.rot; const x = (m.itens || []).find((i) => i[0] === id); if (x) return m.rot + ' · ' + x[1]; }
    return { automacoes: 'Automações', aprovacoes: 'Aprovações', notificacoes: 'Cobranças e recibos' }[id] || '';
  }
  function destacar(id) {
    const tn = document.getElementById('gs-tela-nome'); if (tn) tn.textContent = nomeTela(id);
    document.querySelectorAll('#tn [data-ir], #tn-baixo [data-baixo]').forEach((b) => b.classList.toggle('ativo', b.dataset.ir === id || b.dataset.baixo === id));
    document.querySelectorAll('#tn .tn-grupo').forEach((g) => g.classList.toggle('ativo', !!g.querySelector('[data-ir="' + id + '"]')));
  }
  // ✉ dentro de cada tela: abre "Cobranças, avisos e recibos" já na aba certa
  let _abaCobranca = 'hon';
  function abrirCobrancas(aba) {
    _abaCobranca = aba || 'hon';
    if (_painel !== 'notificacoes') { ir('notificacoes'); return; }
    const b = document.querySelector('#notif-tab-bar [data-nt="' + _abaCobranca + '"]');
    if (typeof window.notifAba === 'function') window.notifAba(_abaCobranca, b);
  }
  function botoesCobranca() {
    [['panel-financeiro', 'hon', '✉ Cobrar clientes', true], ['panel-financeiroContab', 'hon', '✉ Cobrar clientes', true], ['panel-parcelamentos', 'parc', '✉ Notificar clientes', false], ['panel-acordos', 'acord', '✉ Notificar clientes', false]]
      .forEach(([pid, aba, rot, recibo]) => {
        const ban = document.querySelector('#' + pid + ' .mod-banner'); if (!ban || ban.querySelector('.gx-cobrar')) return;
        const d = document.createElement('div'); d.className = 'gx-cobrar gx-so-equipe';
        d.innerHTML = '<button type="button" data-cob="' + aba + '">' + rot + '</button>' + (recibo ? '<button type="button" data-cob="rec">🧾 Recibo</button>' +
          '<button type="button" data-ofx="' + (pid === 'panel-financeiroContab' ? 'contabilidade' : 'escritorio') + '" title="Dar baixa pelos créditos do extrato do banco (arquivo OFX)">🏦 Conciliar extrato</button>' : '');
        d.querySelectorAll('[data-cob]').forEach((b) => b.onclick = () => abrirCobrancas(b.dataset.cob));
        d.querySelectorAll('[data-ofx]').forEach((b) => b.onclick = () => { if (GS() && GS().conciliarOfx) GS().conciliarOfx(b.dataset.ofx); });
        ban.appendChild(d);
      });
  }
  function instalarGanchos() {
    botoesCobranca();
    // aba do Financeiro marcada no próprio conteúdo (o CSS esconde gráficos repetidos só nas abas de lista)
    ['setFinTab', 'setFinCTab'].forEach((nome) => {
      const orig = window[nome]; if (typeof orig !== 'function') return;
      const alvo = nome === 'setFinTab' ? 'finContent' : 'finCContent';
      window[nome] = function (tab) { const el = document.getElementById(alvo); if (el) el.dataset.aba = tab; return orig.apply(this, arguments); };
    });
    const navOrig = window.nav;
    window.nav = function (btn, pid) {
      const id = pid || (btn && btn.dataset && btn.dataset.panel);
      if (id && !ehCliente() && !permitido(FUNC_TELA[id])) { aviso('Sem acesso a esta área. Peça ao administrador para liberar a função.', true); if (id !== 'hoje') return window.nav(null, 'hoje'); }
      // como no Gestão: cada tela abre sem o filtro da tela anterior
      if (id && _painel && id !== _painel && typeof window.resetarFiltros === 'function') {
        try { window.resetarFiltros(); if (typeof window.applyFilters === 'function') window.applyFilters(); } catch (e) { console.warn('[ERP] limpar filtros:', e); }
      }
      navOrig.apply(this, arguments);
      // botão "voltar" do navegador: cada tela vira um passo do histórico (#tela)
      if (id && !_voltando) {
        const est = { tela: id };
        if (!history.state || !history.state.tela) history.replaceState(est, '', '#' + id);
        else if (history.state.tela !== id) history.pushState(est, '', '#' + id);
      }
      _painel = id; destacar(id);
      if (id) document.body.dataset.painel = id;
      document.body.classList.toggle('gx-tela-nova', !!TELAS_GS[id]);
      if (TELAS_GS[id]) desenharGS(id);
      if (id === 'notificacoes') setTimeout(() => abrirCobrancas(_abaCobranca), 0);
    };
    // equipe entra no Início
    const admOrig = window.acAplicarModoAdmin;
    // (ou na tela do endereço, ex.: .../#processos, quando a pessoa recarrega a página)
    if (typeof admOrig === 'function') window.acAplicarModoAdmin = function () {
      const r = admOrig.apply(this, arguments);
      const h = decodeURIComponent(location.hash.slice(1));
      setTimeout(() => ir(h && (TELAS_GS[h] || document.getElementById('panel-' + h)) ? h : 'hoje'), 0);
      return r;
    };
    window.addEventListener('popstate', (ev) => {
      // janela aberta: o "voltar" fecha a janela e fica na mesma tela
      const jan = document.getElementById('janelas');
      if (jan && jan.lastElementChild && GS() && GS().fecharJanela) {
        GS().fecharJanela(); history.pushState({ tela: _painel }, '', '#' + _painel); return;
      }
      const t = (ev.state && ev.state.tela) || decodeURIComponent(location.hash.slice(1));
      if (!t || t === _painel) return;
      _voltando = true;
      try { ir(t); } finally { _voltando = false; }
    });
    // depois de gravar: recarrega o ERP e redesenha a tela do Gestão que estiver aberta
    const recOrig = window.ERP_RECARREGAR;
    window.ERP_RECARREGAR = function () {
      if (GS() && GS().invalidarCadastros) GS().invalidarCadastros();
      const r = recOrig && recOrig.apply(this, arguments);
      if (TELAS_GS[_painel]) setTimeout(() => desenharGS(_painel), 200);
      return r;
    };
  }
  // nome na barra: o primeiro nome da pessoa (Administração → Usuários ou ⋯ → Meu nome), nunca o início do e-mail
  const nomeProvisorio = (eu) => !eu.nome || (eu.email && eu.nome === eu.email.split('@')[0]);
  function mostrarNome() {
    document.body.classList.toggle('gx-admin', ehAdmin());
    const n = document.getElementById('gs-nome');
    const eu = window.ERP_EU || {}, s = window.AC_SESSION || {};
    const nome = nomeProvisorio(eu) ? (s.nome && !/@|^[a-z0-9._-]+$/.test(s.nome) ? s.nome : '') : eu.nome;
    if (n) { n.textContent = (nome || '').split(/\s+/)[0]; n.title = nome || eu.email || ''; }
    if (eu.id && nomeProvisorio(eu) && !mostrarNome._pediu) { mostrarNome._pediu = true; setTimeout(() => pedirMeuNome(true), 1500); }
  }
  // janela "Como você quer ser chamado?" (primeiro acesso ou ⋯ → Meu nome)
  function pedirMeuNome(primeiro) {
    if (!GS() || !GS().abrirJanela || document.getElementById('meu-nome')) return;
    const eu = window.ERP_EU || {};
    const j = GS().abrirJanela({ titulo: primeiro ? 'Bem-vindo! Como você quer ser chamado?' : 'Meu nome',
      corpo: '<label class="campo"><span>Nome que aparece na barra e no "Olá"</span><input id="meu-nome" maxlength="80" placeholder="Ex.: Pedro Castro" value="' + esc(nomeProvisorio(eu) ? '' : eu.nome || '') + '"></label>' +
        '<div class="sub" style="margin-top:8px">O acesso continua pelo e-mail <b>' + esc(eu.email || '') + '</b>.</div>',
      rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-fechar-nome>Depois</button><button class="btn btn-p" type="button" id="meu-nome-ok">Salvar</button></div>' });
    j.querySelector('[data-fechar-nome]').onclick = () => GS().fecharJanela(j);
    j.querySelector('#meu-nome-ok').onclick = async () => {
      const v = j.querySelector('#meu-nome').value.trim(); if (!v) return j.querySelector('#meu-nome').focus();
      const { error } = await window.SB.rpc('salvar_meu_nome', { p: v });
      if (error) return aviso(erroAmigavel(error), true);
      eu.nome = v; if (GS().E && GS().E.perfil) GS().E.perfil.nome = v;
      GS().fecharJanela(j); mostrarNome(); aviso('✓ Pronto, ' + v.split(' ')[0] + '!');
      if (_painel === 'hoje') desenharGS('hoje');
    };
  }
  document.addEventListener('erp:perfil', mostrarNome);
  // registro de acesso (Administração → Acessos); aparelho novo avisa a própria pessoa
  function nomeAparelho() {
    const ua = navigator.userAgent;
    const nav = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
    const so = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
    return nav + (so ? ' · ' + so : '') + (/Mobi/.test(ua) ? ' (celular)' : '');
  }
  document.addEventListener('erp:perfil', () => {
    if (!['admin', 'equipe'].includes(window.ERP_PAPEL) || !window.SB || window._gxAcessoOk) return;
    window._gxAcessoOk = true;
    let id = '';
    try { id = localStorage.getItem('erp_dispositivo') || ''; if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)).replace(/-/g, ''); localStorage.setItem('erp_dispositivo', id); } }
    catch (e) { id = 'sem-armazenamento'; }
    window.SB.rpc('registrar_acesso', { p_dispositivo: id, p_navegador: nomeAparelho() }).then(() => {}, () => {});
  });

  // ═════ modo escuro nos gráficos: texto escuro vira claro, grade preta vira branca (e volta) ═════
  function temaEscuro() { return document.documentElement.getAttribute('data-tema') === 'escuro'; }
  window.ERP_TEMA_ESCURO = temaEscuro;
  function lum(c) {
    const m = String(c || '').match(/^#([0-9a-f]{6})$/i) || null;
    if (m) { const n = parseInt(m[1], 16); return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255; }
    const r = String(c || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); return r ? (r[1] * 0.299 + r[2] * 0.587 + r[3] * 0.114) / 255 : 1;
  }
  function misturar(a, b, t) {
    const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    const c = (sh) => Math.round(((x >> sh) & 255) * (1 - t) + ((y >> sh) & 255) * t);
    return '#' + [16, 8, 0].map((sh) => c(sh).toString(16).padStart(2, '0')).join('');
  }
  function corTema(c, grade) {
    if (typeof c !== 'string') return c;
    if (grade) return /rgba\(0,\s*0,\s*0,/.test(c) ? c.replace(/rgba\(0,\s*0,\s*0,\s*([\d.]+)\)/, (x, a) => 'rgba(255,255,255,' + Math.min(0.14, +a * 2) + ')') : c;
    return lum(c) < 0.5 ? '#C3CCDB' : c;
  }
  const CAMINHOS = (o) => {
    const out = [];
    Object.values((o && o.scales) || {}).forEach((sc) => { if (sc.ticks) out.push([sc.ticks, 'color', false]); if (sc.grid) out.push([sc.grid, 'color', true]); if (sc.title) out.push([sc.title, 'color', false]); });
    const lg = o && o.plugins && o.plugins.legend && o.plugins.legend.labels; if (lg) out.push([lg, 'color', false]);
    return out;
  };
  const pluginTema = { id: 'gxTema', beforeUpdate(ch) {
    const o = ch.config.options; if (!o) return;
    if (!ch.$gxOrig) ch.$gxOrig = CAMINHOS(o).map(([obj, k]) => [obj, k, obj[k]]);
    ch.$gxOrig.forEach(([obj, k, v], i) => { const grade = CAMINHOS(o)[i] && CAMINHOS(o)[i][2]; obj[k] = temaEscuro() ? corTema(v, grade) : v; });
    // barras muito escuras (rampa azul) clareiam; borda branca de rosca vira a cor do cartão
    const clarear = (c) => (typeof c === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c) && lum(c.slice(0, 7)) < 0.3 ? misturar(c.slice(0, 7), '#ffffff', 0.42) + c.slice(7) : c);
    const clarearTodos = (v) => (Array.isArray(v) ? v.map(clarear) : clarear(v));
    (ch.data.datasets || []).forEach((ds) => {
      if (!('$gxBg' in ds)) { ds.$gxBg = ds.backgroundColor; ds.$gxBd = ds.borderColor; ds.$gxHv = ds.hoverBackgroundColor; }
      const esc = temaEscuro();
      ds.backgroundColor = esc ? clarearTodos(ds.$gxBg) : ds.$gxBg;
      if (ds.$gxHv !== undefined) ds.hoverBackgroundColor = esc ? clarearTodos(ds.$gxHv) : ds.$gxHv;
      const bd = ds.$gxBd, branco = (x) => typeof x === 'string' && /^(#fff|#ffffff|white)$/i.test(x);
      ds.borderColor = esc && (branco(bd) || (Array.isArray(bd) && bd.every(branco))) ? '#161D2B' : esc ? clarearTodos(bd) : bd;
    });
    Chart.defaults.color = temaEscuro() ? '#C3CCDB' : '#666';
    Chart.defaults.borderColor = temaEscuro() ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,0.1)';
  } };

  // ═════ gráficos: números em pt-BR e aviso quando não há dados ═════
  function ajustarGraficos() {
    if (!window.Chart || window.Chart._gx) return;
    window.Chart._gx = true;
    Chart.defaults.locale = 'pt-BR';
    Chart.register(pluginTema);
    // valor escrito na frente de cada barra (gráficos marcados com options.gxValores)
    Chart.register({ id: 'gxValores', afterDatasetsDraw(ch) {
      if (!ch.config.options || !ch.config.options.gxValores) return;
      const meta = ch.getDatasetMeta(0), dados = ch.data.datasets[0].data, ctx = ch.ctx, horiz = ch.config.options.indexAxis === 'y';
      ctx.save(); ctx.fillStyle = temaEscuro() ? '#E6ECF7' : '#1F2937'; ctx.font = '600 12px Inter, "DM Sans", system-ui, sans-serif'; ctx.textBaseline = 'middle';
      // valor inteiro (R$ 1.234.567), sem abreviar — nas barras deitadas; nas em pé continua curto por falta de espaço
      const inteiro = (v) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
      meta.data.forEach((bar, i) => {
        const t = horiz ? inteiro(dados[i]) : typeof window._moedaCurta === 'function' ? window._moedaCurta(dados[i]) : String(dados[i]);
        if (horiz) { ctx.textAlign = 'left'; ctx.fillText(t, bar.x + 6, bar.y); } else { ctx.textAlign = 'center'; ctx.fillText(t, bar.x, bar.y - 9); }
      });
      ctx.restore();
    } });
    Chart.register({ id: 'gxSemDados', beforeDraw(ch) {
      const temDado = (ch.data.datasets || []).some((d) => (d.data || []).some((v) => Number(v && typeof v === 'object' ? v.y : v)));
      if (temDado) return;
      const { ctx, width, height } = ch;
      ctx.save(); ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#6B7280'; ctx.font = '500 13px "DM Sans", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Nada para mostrar neste recorte', width / 2, height / 2); ctx.restore();
      return false;
    } });
  }
  // celular: as tabelas do Gestão viram cartões — cada célula ganha o nome da coluna
  function rotularTabelas(raiz) {
    (raiz || document).querySelectorAll('.gs table, main .panel .tw table').forEach((t) => {
      if (t.closest('.no-cartoes')) return;
      const ths = [...t.querySelectorAll('thead tr:last-child th')].map((th) => th.textContent.replace(/[▲▼↕⇅]/g, '').trim());
      if (!ths.length) return;
      t.classList.add('gx-cartoes');
      t.querySelectorAll('tbody tr').forEach((tr) => {
        if (tr.dataset.rotulado === String(ths.length)) return; tr.dataset.rotulado = String(ths.length);
        [...tr.children].forEach((td, i) => { if (!td.hasAttribute('colspan')) td.setAttribute('data-rotulo', ths[i] || ''); });
      });
    });
  }
  let _rotT;
  new MutationObserver(() => { clearTimeout(_rotT); _rotT = setTimeout(() => rotularTabelas(), 120); }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', ajustarGraficos); window.addEventListener('load', ajustarGraficos); ajustarGraficos();

  // sino: número de avisos (notificações + prazos calculados), atualizado a cada 5 minutos
  let _sinoT;
  async function atualizarSino() {
    const n = document.getElementById('gs-sino-n');
    if (!n || !GS() || ehCliente()) return;
    try {
      GS().E.perfil = window.ERP_EU || GS().E.perfil;
      // regras automáticas de tarefas: no máximo a cada 6 horas por navegador (o agendador do banco também roda de manhã)
      let ult = 0; try { ult = +localStorage.getItem('erp-regras-ultima') || 0; } catch (e) { /* sem armazenamento */ }
      if (Date.now() - ult > 6 * 3600 * 1000) {
        try { localStorage.setItem('erp-regras-ultima', String(Date.now())); } catch (e) { /* sem armazenamento */ }
        await window.SB.rpc('rodar_regras_tarefas').then(() => {}, () => {});
      }
      const c = await GS().contarAlertas();
      n.hidden = !c.total; n.textContent = c.total > 99 ? '99+' : String(c.total);
      n.classList.toggle('alto', c.altos > 0);
      mostrarAvisosNovos(c.lista || []);
    } catch (e) { console.warn('[ERP] avisos:', e); }
  }
  // ao abrir o sistema (e quando chega assunto novo): cartão no canto com os avisos não lidos mais importantes
  const _vistos = new Set();
  function mostrarAvisosNovos(lista) {
    const novos = lista.filter((a) => !_vistos.has(a.chave || a.notif)); lista.forEach((a) => _vistos.add(a.chave || a.notif));
    if (!novos.length || document.getElementById('gx-pop-avisos')) return;
    const ICO = (GS() && GS().ICONE_AVISO) || {};
    const d = document.createElement('div'); d.id = 'gx-pop-avisos'; d.setAttribute('role', 'status');
    d.innerHTML = '<div class="gx-pop-hd"><b>🔔 ' + novos.length + ' aviso(s) novo(s)</b><button type="button" class="gx-pop-x" aria-label="Fechar">✕</button></div>' +
      novos.slice(0, 4).map((a) => '<div class="gx-pop-it nivel-' + a.nivel + '"><span>' + (ICO[a.tipo] || '•') + '</span><div><b>' + esc(a.titulo) + '</b><div>' + esc(a.detalhe || '') + '</div></div></div>').join('') +
      (novos.length > 4 ? '<div class="gx-pop-mais">+ ' + (novos.length - 4) + ' outro(s)</div>' : '') +
      '<button type="button" class="gx-pop-abrir">Abrir a caixa de avisos</button>';
    document.body.appendChild(d);
    requestAnimationFrame(() => d.classList.add('on'));
    const fechar = () => { d.classList.remove('on'); setTimeout(() => d.remove(), 300); };
    d.querySelector('.gx-pop-x').onclick = fechar;
    d.querySelector('.gx-pop-abrir').onclick = () => { fechar(); document.getElementById('gs-sino').click(); };
    setTimeout(fechar, 14000);
  }
  document.addEventListener('erp:perfil', () => { clearInterval(_sinoT); setTimeout(atualizarSino, 1500); _sinoT = setInterval(atualizarSino, 5 * 60 * 1000); });

  // ═══════ Honorários: tabelas de lançamentos no formato do Gestão ═══════
  // O ERP continua filtrando, ordenando e paginando; a tabela dele fica escondida
  // e, logo abaixo, aparece a mesma lista no formato do Gestão (menos colunas).
  const LISTAS = { tblFinBody: 'areceber', tblRecBody: 'recebidos', tblPrejBody: 'prejuizo', tblFcAbaBody: 'areceber', tblFcFechBody: 'recebidos' };
  function converterTabelas() {
    if (!GS() || ehCliente()) return;
    document.querySelectorAll('#panel-financeiro tbody, #panel-financeiroContab tbody').forEach((tb) => {
      const tabela = tb.closest('table');
      if (!tabela || tb.closest('.gs')) return;
      const linhas = [...tb.querySelectorAll('tr[data-gx^="lancamentos:"]')];
      const ehLista = LISTAS[tb.id] || linhas.length;
      if (!ehLista) return;
      const regs = linhas.map((tr) => (window.ERP_LANC || {})[tr.dataset.gx.split(':')[1]]).filter(Boolean);
      const assinatura = regs.map((l) => l.id + l.atualizado_em).join('|') || 'vazio';
      let caixa = tabela.nextElementSibling;
      if (!caixa || !caixa.classList.contains('gx-tab-gs')) {
        caixa = document.createElement('div'); caixa.className = 'gs gx-tab-gs';
        caixa.setAttribute('data-sem-ordem', '');   // quem ordena aqui é o Gestão, não o ERP
        tabela.after(caixa);
      }
      tabela.classList.add('gx-oculta');
      if (caixa.dataset.sig === assinatura) return;
      caixa.dataset.sig = assinatura;
      caixa.innerHTML = GS().tabelaLancamentos(regs, { aba: LISTAS[tb.id] || 'areceber' });
      GS().ligarAcoesLancamentos(caixa, () => ED.recarregar());
    });
  }
  let _agendado = false;
  new MutationObserver(() => {
    if (_agendado) return; _agendado = true;
    requestAnimationFrame(() => { _agendado = false; try { converterTabelas(); } catch (e) { console.warn('[ERP] tabela Gestão:', e); } });
  }).observe(document.documentElement, { childList: true, subtree: true });

  // ═════════════════ nova senha (link do e-mail) ═════════════════
  function telaNovaSenha() {
    const f = document.createElement('div');
    f.className = 'gx-fundo gx-sobre-login';
    f.innerHTML = '<div class="gx-janela" role="dialog" aria-modal="true" style="max-width:520px"><div class="gx-topo"><h3>Crie sua nova senha</h3></div><div class="gx-corpo">'
      + '<form class="gx-form" novalidate><div class="gx-grade">'
      + '<div class="gx-campo"><label>Nova senha</label><input name="s1" type="password" autocomplete="new-password"></div>'
      + '<div class="gx-campo"><label>Repita a nova senha</label><input name="s2" type="password" autocomplete="new-password"></div></div>'
      + '<div class="gx-msg"></div><div class="gx-acoes"><span style="flex:1"></span><button type="submit" class="gx-bt gx-prim">Salvar nova senha</button></div></form></div></div>';
    document.body.appendChild(f);
    const form = f.querySelector('form');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const msg = f.querySelector('.gx-msg');
      if (form.s1.value.length < 8) { msg.textContent = '⚠ Use pelo menos 8 caracteres.'; return; }
      if (form.s1.value !== form.s2.value) { msg.textContent = '⚠ As duas senhas não são iguais.'; return; }
      const { error } = await window.SB.auth.updateUser({ password: form.s1.value });
      if (error) { msg.textContent = '⚠ ' + erroAmigavel(error) + ' Peça um link novo ao administrador.'; return; }
      await window.SB.auth.signOut();
      f.remove();
      history.replaceState(null, '', location.pathname);
      aviso('✓ Senha alterada. Entre com o seu e-mail e a nova senha.');
    };
  }

  function iniciar() {
    montarBarra();
    criarPaineis();
    instalarGanchos();
    mostrarNome();
    if (window.ERP_RECUPERACAO) telaNovaSenha();
    document.addEventListener('erp:recuperacao', telaNovaSenha);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
  window.ERP_DADOS = dadosERP;
  window.ERP_TELAS = { ir, desenharGS, LANCAR };
})();
