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
    { id: 'resumo', rot: 'Painel Executivo' },
    { rot: 'Jurídico', itens: [['processos', 'Processos'], ['acordos', 'Acordos'], ['parcelamentos', 'Parcelamentos']] },
    { rot: 'Financeiro', equipe: true, itens: [['financeiro', 'Jurídico'], ['financeiroContab', 'Contabilidade']] },
    { id: 'contratos', rot: 'Contratos', equipe: true },
    { id: 'clientes', rot: 'Clientes', equipe: true },
    { id: 'tarefas', rot: 'Tarefas', equipe: true },
    { id: 'notificacoes', rot: 'Notificações', equipe: true },
    { id: 'admin', rot: 'Administração', admin: true }
  ];
  // painéis novos → tela do Gestão que desenha nele
  const TELAS_GS = { hoje: 'inicio', contratos: 'contratos', clientes: 'clientes', tarefas: 'tarefas', admin: 'admin' };

  // "+ Lançar": formulários do Gestão onde existem; os demais, do editor do ERP
  const empresaAtual = () => (_painel === 'financeiroContab' ? 'contabilidade' : 'escritorio');
  const depois = () => ED.recarregar();
  async function comCadastros(fn) { await GS().carregarCadastros(); return fn(); }
  const LANCAR = [
    ['Receita (honorário)', () => comCadastros(() => GS().formLancamento({ tipo: 'receita', empresa: empresaAtual() }, depois))],
    ['Despesa', () => comCadastros(() => GS().formLancamento({ tipo: 'despesa', empresa: empresaAtual() }, depois))],
    ['Comissão / desconto (redutor de receita)', () => comCadastros(() => GS().formLancamento({ tipo: 'receita', redutor: true, empresa: empresaAtual(), categoria: 'Comissão' }, depois))],
    ['Cliente', () => comCadastros(() => GS().formCliente(undefined, depois))],
    ['Contrato', () => comCadastros(() => GS().formContrato({}))],
    ['Processo', () => ED.abrirFormulario('processos', null, { carteira: 'Ativo', status: 'Em andamento' })],
    ['Acordo (parcela)', () => ED.abrirFormulario('acordos', null, {})],
    ['Parcelamento', () => ED.abrirParcelamento(null)],
    ['Tarefa', () => comCadastros(() => GS().formTarefa({}, depois))]
  ];

  // ═════════════════════ BARRA SUPERIOR ═════════════════════
  function montarBarra() {
    if (document.getElementById('gs-hd')) return;
    document.body.classList.add('gx-barra-topo');
    const hd = document.createElement('header');
    hd.id = 'gs-hd'; hd.className = 'gs';
    const itemCls = (m) => (m.equipe ? ' gx-so-equipe' : '') + (m.admin ? ' gx-so-admin' : '');
    hd.innerHTML =
      '<nav id="tn" aria-label="Menu principal">' + MENU.map((m, i) => !m.itens
        ? '<button type="button" class="tn-it' + itemCls(m) + '" data-ir="' + m.id + '">' + esc(m.rot) + '</button>'
        : '<div class="tn-grupo' + itemCls(m) + '"><button type="button" class="tn-it tn-abre" data-grupo="' + i + '" aria-haspopup="true" aria-expanded="false">' + esc(m.rot) + ' <span class="tn-seta">▾</span></button>' +
          '<div class="tn-menu" role="menu">' + m.itens.map((x) => '<button type="button" role="menuitem" data-ir="' + x[0] + '">' + esc(x[1]) + '</button>').join('') + '</div></div>').join('') +
      '</nav>' +
      '<div class="gs-contadores gx-so-equipe" id="gs-contadores" hidden><span class="gs-cont gs-cont-ent">▣ <b id="gs-n-ent">0</b> entidades</span><span class="gs-cont gs-cont-grp">◉ <b id="gs-n-grp">0</b> grupos</span></div>' +
      '<div class="tn-lancar gx-so-equipe"><button type="button" class="tn-lancar-bt" aria-haspopup="true" aria-expanded="false">+ Lançar</button>' +
      '<div class="tn-menu tn-menu-dir" role="menu">' + LANCAR.map((x, i) => '<button type="button" role="menuitem" data-lancar="' + i + '">' + esc(x[0]) + '</button>').join('') + '</div></div>' +
      '<div class="hd-usuario"><span id="gs-nome"></span>' +
      '<div class="tn-grupo tn-mais-acoes"><button type="button" class="tn-abre gs-bt-mais" data-grupo="acoes" title="Atualizar dados e relatório em PDF" aria-haspopup="true" aria-expanded="false">⋯</button>' +
      '<div class="tn-menu tn-menu-dir" role="menu"><button type="button" data-acao="atualizar">↻ Atualizar dados</button><button type="button" data-acao="pdf" class="gx-so-equipe">📄 Relatório em PDF</button><button type="button" data-acao="gestao" class="gx-so-equipe">↗ Abrir o Gestão (versão anterior)</button></div></div>' +
      '<button type="button" id="gs-sair">Sair</button></div>';
    document.body.insertBefore(hd, document.body.firstChild);

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
      else if (alvo.dataset.acao === 'gestao') window.open('gestao.html', '_blank', 'noopener');
      else if (alvo.dataset.ir) ir(alvo.dataset.ir);
      else if (alvo.dataset.lancar !== undefined) LANCAR[+alvo.dataset.lancar][1]();
      else if (alvo.dataset.baixo === 'mais') abrirMais();
      else if (alvo.dataset.baixo === 'lancar') abrirMais(true);
      else if (alvo.dataset.baixo) ir(alvo.dataset.baixo);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { document.querySelectorAll('.tn-grupo.on,.tn-lancar.on').forEach(fecharMenu); fecharMais(); } });

    // entidades e grupos: os mesmos números que o ERP calcula no cabeçalho dele
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
        + '<button type="button" data-acao="atualizar">↻ Atualizar dados</button><button type="button" data-acao="gestao">↗ Abrir o Gestão (versão anterior)</button><button type="button" class="gs-sair">Sair</button>';
    f.innerHTML = '<div class="tn-mais-caixa">' + itens + '<button type="button" class="tn-mais-fechar" data-fechar>Fechar</button></div>';
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

  let _painel = '';
  function destacar(id) {
    document.querySelectorAll('#tn [data-ir], #tn-baixo [data-baixo]').forEach((b) => b.classList.toggle('ativo', b.dataset.ir === id || b.dataset.baixo === id));
    document.querySelectorAll('#tn .tn-grupo').forEach((g) => g.classList.toggle('ativo', !!g.querySelector('[data-ir="' + id + '"]')));
  }
  function instalarGanchos() {
    const navOrig = window.nav;
    window.nav = function (btn, pid) {
      const id = pid || (btn && btn.dataset && btn.dataset.panel);
      // como no Gestão: cada tela abre sem o filtro da tela anterior
      if (id && _painel && id !== _painel && typeof window.resetarFiltros === 'function') {
        try { window.resetarFiltros(); if (typeof window.applyFilters === 'function') window.applyFilters(); } catch (e) { console.warn('[ERP] limpar filtros:', e); }
      }
      navOrig.apply(this, arguments);
      _painel = id; destacar(id);
      document.body.classList.toggle('gx-tela-nova', !!TELAS_GS[id]);
      if (TELAS_GS[id]) desenharGS(id);
    };
    // equipe entra no Início
    const admOrig = window.acAplicarModoAdmin;
    if (typeof admOrig === 'function') window.acAplicarModoAdmin = function () { const r = admOrig.apply(this, arguments); setTimeout(() => ir('hoje'), 0); return r; };
    // depois de gravar: recarrega o ERP e redesenha a tela do Gestão que estiver aberta
    const recOrig = window.ERP_RECARREGAR;
    window.ERP_RECARREGAR = function () {
      const r = recOrig && recOrig.apply(this, arguments);
      if (TELAS_GS[_painel]) setTimeout(() => desenharGS(_painel), 200);
      return r;
    };
  }
  function mostrarNome() {
    document.body.classList.toggle('gx-admin', ehAdmin());
    const n = document.getElementById('gs-nome');
    const eu = window.ERP_EU || {}, s = window.AC_SESSION || {};
    if (n) n.textContent = eu.nome || s.nome || eu.email || '';
  }
  document.addEventListener('erp:perfil', mostrarNome);

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
