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
  // Backup 38: barra LATERAL (padrão ROMPEX) — seções Principal · Módulos · Sistema; submódulos abrem embaixo do item
  const MENU = [
    { sec: 'Principal' },
    { id: 'hoje', rot: 'Início', ic: 'inicio', equipe: true },
    { id: 'tarefas', rot: 'Tarefas', ic: 'tarefas', equipe: true },
    { id: 'alertas', rot: 'Alertas', ic: 'alertas', equipe: true },
    { sec: 'Módulos' },
    { id: 'resumo', rot: 'Painel Executivo', ic: 'painel', func: 'relatorios' },
    { rot: 'Jurídico', ic: 'juridico', itens: [['processos', 'Processos', 'juridico'], ['parcelamentos', 'Parcelamentos', 'juridico'], ['execucoes', 'Execuções', 'juridico'], ['publicacoes', 'Publicações', 'juridico']] },   // Backup 53: Execuções
    { id: 'acordos', rot: 'Acordos', ic: 'acordos', func: 'juridico' },
    { rot: 'Financeiro', ic: 'financeiro', equipe: true, itens: [['financeiro', 'Jurídico', 'financeiro_juridico'], ['financeiroContab', 'Contabilidade', 'financeiro_contab']] },
    { id: 'contratos', rot: 'Contratos', ic: 'contratos', equipe: true, func: 'contratos' },
    { id: 'clientes', rot: 'Clientes', ic: 'clientes', equipe: true, func: 'clientes' },
    { id: 'crm', rot: 'CRM', ic: 'crm', equipe: true, func: 'crm' },
    { rot: 'Documentos', ic: 'documentos', equipe: true, itens: [['documentos', 'Arquivos', 'documentos'], ['gerador', 'Gerar documentos', 'documentos']] },   // Backup 57: submódulo "Gerar documentos" (Central de Documentos dentro do ERP)
    { id: 'rotina', rot: 'Rotina', ic: 'rotina', equipe: true },   // Backup 28: o lugar do estagiário; Backup 39: em Módulos, abaixo de Documentos
    { sec: 'Sistema', admin: true },
    { id: 'admin', rot: 'Administração', ic: 'admin', admin: true }
  ];
  // ícones de traço fino (estilo dos prints): 16 px, cor do texto
  const ICONES = {
    inicio: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    tarefas: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    rotina: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 14l2 2 4-4"/>',
    alertas: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    painel: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-6"/>',
    juridico: '<path d="M12 3v18M5 21h14M3 7h18"/><path d="M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z"/>',
    acordos: '<path d="M8 12l3 3 5-5"/><circle cx="12" cy="12" r="9"/>',
    financeiro: '<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20M16 15h2"/>',
    contratos: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    clientes: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/>',
    crm: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    documentos: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    admin: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    recibo: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
    seta: '<path d="M6 9l6 6 6-6"/>', encolher: '<path d="M15 18l-6-6 6-6"/>'
  };
  const icone = (k) => '<svg class="tn-ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONES[k] || '') + '</svg>';
  // Cobranças, avisos e recibos (antiga "Notificações"): fora da barra; abre pelo botão ✉ de cada tela e pelo ⋯
  const FUNC_EXTRA = { notificacoes: 'clientes' };   // a Central de e-mails confere o acesso no banco
  // painéis novos → tela do Gestão que desenha nele
  const TELAS_GS = { hoje: 'inicio', contratos: 'contratos', clientes: 'clientes', crm: 'crm', publicacoes: 'publicacoes', documentos: 'documentos', gerador: 'gerador', tarefas: 'tarefas', alertas: 'alertas', rotina: 'rotina', execucoes: 'execucoes', admin: 'admin' };

  // "+ Lançar": formulários do Gestão onde existem; os demais, do editor do ERP
  const empresaAtual = () => (_painel === 'financeiroContab' ? 'contabilidade' : 'escritorio');
  const depois = () => ED.recarregar();
  async function comCadastros(fn) { await GS().carregarCadastros(); return fn(); }
  const LANCAR = [
    // Backup 54: lançamentos integrados — receber um honorário em aberto, acordo inteiro, execução e recebimento de execução, fluxo de tarefas
    ['Receita (honorário)', () => comCadastros(() => GS().formLancamento({ tipo: 'receita', empresa: empresaAtual() }, depois)), '*fin'],
    ['Despesa', () => comCadastros(() => GS().formLancamento({ tipo: 'despesa', empresa: empresaAtual() }, depois)), '*fin'],
    ['Comissão / desconto (redutor de receita)', () => comCadastros(() => GS().formLancamento({ tipo: 'receita', redutor: true, empresa: empresaAtual(), categoria: 'Comissão' }, depois)), '*fin'],
    ['Recebimento (dar baixa num honorário)', () => comCadastros(() => GS().janelaReceber(depois)), '*fin'],
    ['Cliente', () => comCadastros(() => GS().formCliente(undefined, depois)), 'clientes'],
    ['Contrato', () => comCadastros(() => GS().formContrato({})), 'contratos'],
    ['Processo', () => ED.abrirFormulario('processos', null, { carteira: 'Ativo', status: 'Em andamento' }), 'juridico'],
    ['Acordo (todas as parcelas)', () => comCadastros(() => GS().formAcordoNovo(depois)), 'juridico'],
    ['Acordo (uma parcela)', () => ED.abrirFormulario('acordos', null, {}), 'juridico'],
    ['Parcelamento', () => ED.abrirParcelamento(null), 'juridico'],
    ['Execução (cobrança ajuizada)', () => comCadastros(() => GS().formExecucao({}, depois)), 'juridico'],
    ['Recebimento de execução', () => comCadastros(() => GS().escolherExecucaoReceb(depois)), 'juridico'],
    ['Tarefa', () => comCadastros(() => GS().formTarefa({}, depois))],
    ['Fluxo de tarefas', () => comCadastros(() => GS().formNovoFluxo(depois))],
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
    document.querySelectorAll('#gs-lado [data-ir], #tn-baixo [data-baixo]').forEach((b) => { const id = b.dataset.ir || b.dataset.baixo; b.classList.toggle('gx-sem-funcao', !permitido(FUNC_TELA[id])); });
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
    // Backup 38: barra de cima branca = nome da tela à esquerda; + Lançar, tema, ⋯, sessão, pessoa e Sair à direita (sem o sino de avisos)
    hd.innerHTML =
      '<span id="gs-tela-nome"></span>' +
      '<div class="tn-lancar gx-so-equipe"><button type="button" class="tn-lancar-bt" aria-haspopup="true" aria-expanded="false">+ Lançar</button>' +
      '<div class="tn-menu tn-menu-dir" role="menu">' + LANCAR.map((x, i) => '<button type="button" role="menuitem" data-lancar="' + i + '">' + esc(x[0]) + '</button>').join('') + '</div></div>' +
      '<div class="hd-usuario"><button type="button" id="gs-tema" title="Modo escuro / claro" aria-label="Alternar modo escuro" aria-pressed="false">◐</button>' +
      '<div class="tn-grupo tn-mais-acoes"><button type="button" class="tn-abre gs-bt-mais" data-grupo="acoes" title="Atualizar dados e relatório em PDF" aria-label="Mais ações" aria-haspopup="true" aria-expanded="false">⋯</button>' +
      '<div class="tn-menu tn-menu-dir" role="menu"><button type="button" data-acao="atualizar">↻ Atualizar dados</button><button type="button" data-acao="meunome">👤 Meu nome</button></div></div>' +
      '<span id="gs-sessao" title="Tempo até sair sozinho por falta de uso (cada clique ou tecla recomeça a contagem)" aria-live="off"></span><span id="gs-nome"></span><button type="button" id="gs-sair">Sair</button></div>';
    // barra lateral: marca, seções, itens com ícone; submódulos abrem logo abaixo (linha fina à esquerda); "encolher" no pé
    const lado = document.createElement('aside');
    lado.id = 'gs-lado'; lado.className = 'gs';
    lado.innerHTML = '<div class="gl-marca"><span class="gl-nome">Araújo &amp; Castro<small>Advocacia e Contabilidade</small></span></div>' +
      '<nav id="tn" aria-label="Menu principal">' + MENU.map((m, i) => m.sec ? '<div class="tn-sec' + itemCls(m) + '">' + esc(m.sec) + '</div>'
        : !m.itens ? '<button type="button" class="tn-it' + itemCls(m) + '" data-ir="' + m.id + '" title="' + esc(m.rot) + '">' + icone(m.ic) + '<span class="tn-rot">' + esc(m.rot) + '</span></button>'
        : '<div class="tn-grupo' + itemCls(m) + '"><button type="button" class="tn-it tn-abre" data-grupo="' + i + '" aria-expanded="false" title="' + esc(m.rot) + '">' + icone(m.ic) + '<span class="tn-rot">' + esc(m.rot) + '</span>' + icone('seta').replace('tn-ic', 'tn-ic tn-seta') + '</button>' +
          '<div class="tn-menu" role="menu">' + m.itens.map((x) => '<button type="button" role="menuitem" data-ir="' + x[0] + '">' + esc(x[1]) + '</button>').join('') + '</div></div>').join('') +
      '</nav><button type="button" id="gs-encolher" title="Encolher / abrir a barra" aria-label="Encolher ou abrir a barra lateral">' + icone('encolher') + '<span class="tn-rot">encolher</span></button>';
    document.body.insertBefore(lado, document.body.firstChild);
    try { if (localStorage.getItem('erp_lado_min') === '1') document.body.classList.add('gx-lado-min'); } catch (e) { /* sem armazenamento: começa aberta */ }
    document.getElementById('gs-encolher').onclick = () => { const min = document.body.classList.toggle('gx-lado-min'); try { localStorage.setItem('erp_lado_min', min ? '1' : '0'); } catch (e) { /* vale só agora */ } };
    document.body.insertBefore(hd, document.body.firstChild);
    // Backup 37: contador discreto da sessão (60 min sem uso → sai). Fica vermelho nos últimos 5 minutos.
    const sessao = document.getElementById('gs-sessao');
    const pintarSessao = () => { const s = window.AC_SESSION; if (!s || !s.expira) { sessao.textContent = ''; return; }
      const min = Math.max(0, Math.ceil((s.expira - Date.now()) / 60000)); sessao.textContent = '⏱' + min + '′'; sessao.classList.toggle('gs-sessao-fim', min <= 5); };
    pintarSessao(); setInterval(pintarSessao, 15000); document.addEventListener('click', () => setTimeout(pintarSessao, 50), { passive: true });
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
    // celular: menu inferior + "Mais"
    const bn = document.createElement('nav');
    bn.id = 'tn-baixo'; bn.setAttribute('aria-label', 'Menu');
    bn.innerHTML = [['hoje', '⌂', 'Início', 1], ['resumo', '◈', 'Painel', 0], ['financeiro', '◎', 'Financeiro', 1], ['lancar', '+', 'Lançar', 1], ['mais', '☰', 'Mais', 0]]
      .map((x) => '<button type="button" data-baixo="' + x[0] + '"' + (x[3] ? ' class="gx-so-equipe"' : '') + '><span>' + x[1] + '</span>' + x[2] + '</button>').join('');
    document.body.appendChild(bn);

    // botão do meio do mouse num item do menu = aba nova (Backup 34)
    document.addEventListener('auxclick', (e) => { const b = e.button === 1 && e.target.closest && e.target.closest('#gs-lado [data-ir]'); if (b) { e.preventDefault(); window.open(location.pathname + '#' + b.dataset.ir, '_blank', 'noopener'); } });
    document.addEventListener('click', (e) => {
      const alvo = e.target.closest && e.target.closest('[data-ir],[data-grupo],.tn-lancar-bt,[data-lancar],[data-baixo],[data-acao],#gs-sair,.gs-sair');
      // menus suspensos só na barra de cima; na lateral os grupos abrem/fecham e ficam como estão
      const abertos = document.querySelectorAll('#gs-hd .tn-grupo.on,#gs-hd .tn-lancar.on');
      if (alvo && alvo.dataset.grupo !== undefined && alvo.closest('#gs-lado')) {
        const g = alvo.parentElement; const abrir = !g.classList.contains('on');
        if (document.body.classList.contains('gx-lado-min')) { document.querySelectorAll('#gs-lado .tn-grupo.on').forEach(fecharMenu); }
        g.classList.toggle('on', abrir); alvo.setAttribute('aria-expanded', abrir ? 'true' : 'false');
        return;
      }
      if (!alvo) { abertos.forEach(fecharMenu); if (document.body.classList.contains('gx-lado-min') && !e.target.closest('#gs-lado')) document.querySelectorAll('#gs-lado .tn-grupo.on').forEach(fecharMenu); return; }
      if (alvo.dataset.grupo !== undefined || alvo.classList.contains('tn-lancar-bt')) {
        const g = alvo.parentElement; const abrir = !g.classList.contains('on');
        abertos.forEach(fecharMenu);
        if (abrir) { g.classList.add('on'); alvo.setAttribute('aria-expanded', 'true'); }
        return;
      }
      abertos.forEach(fecharMenu); fecharMais();
      if (alvo.id === 'gs-sair' || alvo.classList.contains('gs-sair')) { if (typeof window.acLogout === 'function') window.acLogout(); }
      else if (alvo.dataset.acao === 'atualizar') { if (typeof window._dbCacheClear === 'function') window._dbCacheClear(); ED.recarregar(); }
      else if (alvo.dataset.acao === 'meunome') pedirMeuNome(false);
      else if (alvo.dataset.ir && (e.ctrlKey || e.metaKey || e.shiftKey)) window.open(location.pathname + '#' + alvo.dataset.ir, '_blank', 'noopener');   // Backup 34: Ctrl + clique = aba nova
      else if (alvo.dataset.ir) ir(alvo.dataset.ir);
      else if (alvo.dataset.lancar !== undefined) LANCAR[+alvo.dataset.lancar][1]();
      else if (alvo.dataset.baixo === 'mais') abrirMais();
      else if (alvo.dataset.baixo === 'lancar') abrirMais(true);
      else if (alvo.dataset.baixo) ir(alvo.dataset.baixo);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { document.querySelectorAll('#gs-hd .tn-grupo.on,#gs-hd .tn-lancar.on').forEach(fecharMenu); fecharMais(); } });

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
      : MENU.filter((m) => !m.sec).map((m) => !m.itens ? '<button type="button"' + cls(m) + ' data-ir="' + m.id + '">' + esc(m.rot) + '</button>'
        : '<div class="tn-mais-tit' + (m.equipe ? ' gx-so-equipe' : '') + '">' + esc(m.rot) + '</div>' + m.itens.map((x) => '<button type="button"' + cls(m) + ' data-ir="' + x[0] + '">' + esc(x[1]) + '</button>').join('')).join('')
        + '<button type="button" data-acao="atualizar">↻ Atualizar dados</button><button type="button" class="gs-sair">Sair</button>';
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
    return { notificacoes: 'Tela antiga de cobranças' }[id] || '';
  }
  function destacar(id) {
    const tn = document.getElementById('gs-tela-nome'); if (tn) tn.textContent = nomeTela(id);
    document.querySelectorAll('#tn [data-ir], #tn-baixo [data-baixo]').forEach((b) => b.classList.toggle('ativo', b.dataset.ir === id || b.dataset.baixo === id));
    // o grupo da tela aberta fica aberto na lateral (como "Fiscal" nos prints); os outros ficam como a pessoa deixou
    document.querySelectorAll('#tn .tn-grupo').forEach((g) => { const tem = !!g.querySelector('[data-ir="' + id + '"]'); g.classList.toggle('ativo', tem);
      if (tem && !document.body.classList.contains('gx-lado-min')) { g.classList.add('on'); const b = g.querySelector('.tn-abre'); if (b) b.setAttribute('aria-expanded', 'true'); } });
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
    [['panel-financeiro', 'hon', '✉ Cobrar clientes', true], ['panel-financeiroContab', 'hon', '✉ Cobrar clientes', true]]   // Backup 29: "Notificar clientes" saiu de Parcelamentos/Acordos (o envio é pelo quadro de guias)
      .forEach(([pid, aba, rot, recibo]) => {
        const ban = document.querySelector('#' + pid + ' .mod-banner'); if (!ban || document.querySelector('#' + pid + ' .gx-cobrar')) return;
        const d = document.createElement('div'); d.className = 'gx-cobrar gx-so-equipe';
        // Backup 40: fica só o Recibo (Conciliar extrato e Editar em tabela saíram); ícone de traço no lugar do emoji
        d.innerHTML = (recibo ? '<button type="button" data-cob="rec">' + icone('recibo') + 'Recibo</button>' : '');
        d.querySelectorAll('[data-cob]').forEach((b) => b.onclick = () => abrirCobrancas('rec'));
        ban.appendChild(d);
      });
  }
  // ═══════ Backup 20: tabelas do ERP antigo no MESMO padrão de Clientes ═══════
  // "Por grupo" (linha de título com o grupo e quantos cadastros) ou "Lista"; ▸ na frente de cada linha, que abre o detalhe logo abaixo;
  // filtros discretos (segmentos com fundo azul no escolhido). Vale para Painel → Empresas do grupo e Processos.
  const _pad = { emp: { visao: 'grupo', tipo: 'ativos', area: '', grupo: '', busca: '' }, proc: { visao: 'grupo' } };
  const escH = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const normH = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // o DB do ERP é um const do script principal: existe como nome global, mas NÃO como window.DB
  const dbERP = () => { try { return DB || {}; } catch (e) { return {}; } }; // eslint-disable-line no-undef
  // Backup 51: índice por id (antes, cada linha procurava na lista inteira: 500 empresas = 250 mil comparações no Painel)
  const _idxReg = new WeakMap();
  const regDe = (lista, tr) => { const id = (tr.dataset.gx || '').split(':')[1]; if (!lista) return undefined;
    let m = _idxReg.get(lista); if (!m || m.n !== lista.length) { m = new Map(); lista.forEach((x) => { if (!m.has(x._id)) m.set(x._id, x); }); m.n = lista.length; _idxReg.set(lista, m); }
    return m.get(id); };
  function tabelaPadrao(tbody, o) {
    const table = tbody && tbody.closest('table'); if (!table) return;
    // Backup 27: sem a seta (Painel abre a ficha; Processos abre a janela) — a coluna continua no lugar, só escondida,
    // para as regras de coluna (nth-child) não mudarem
    table.classList.toggle('gx-sem-seta', !!o.semSeta);
    const cab = table.querySelector('thead tr:last-child');
    if (cab && !cab.querySelector('.gx-th-seta')) { const th = document.createElement('th'); th.className = 'gx-th-seta'; th.setAttribute('aria-label', 'Abrir'); cab.insertBefore(th, cab.firstChild); }
    tbody.querySelectorAll(':scope > tr.gx-grp, :scope > tr.gx-det').forEach((x) => x.remove());
    const linhas = [...tbody.querySelectorAll(':scope > tr[data-gx]')];
    linhas.forEach((tr) => {
      if (!tr.querySelector(':scope > td.gx-seta')) { const td = document.createElement('td'); td.className = 'gx-seta'; td.textContent = o.popup ? '›' : '▸'; tr.insertBefore(td, tr.firstChild); }
      tr.classList.add('gx-linha-exp'); tr.classList.remove('gx-aberta'); tr.setAttribute('aria-expanded', 'false'); tr.tabIndex = 0;
      tr.hidden = o.filtro ? !o.filtro(tr) : false;
    });
    const vazia = tbody.querySelector(':scope > tr:not([data-gx]) td[colspan]'); if (vazia) vazia.colSpan = 50;
    if (_pad[o.chave].visao === 'grupo' && o.semDivisao) {   // Backup 40: ordena por grupo, sem a faixa "GRUPO X · N cadastros" nem o contorno
      linhas.slice().sort((a, b) => (o.grupo(a) || '￿').localeCompare(o.grupo(b) || '￿', 'pt-BR')).forEach((tr) => tbody.appendChild(tr));
    } else if (_pad[o.chave].visao === 'grupo') {
      const ord = linhas.slice().sort((a, b) => (o.grupo(a) || '￿').localeCompare(o.grupo(b) || '￿', 'pt-BR'));
      ord.forEach((tr) => tbody.appendChild(tr));
      const vis = ord.filter((tr) => !tr.hidden); let ult = null;
      vis.forEach((tr) => { const g = o.grupo(tr) || ''; if (g === ult) return; ult = g;
        const n = vis.filter((x) => (o.grupo(x) || '') === g).length, h = document.createElement('tr');
        h.className = 'gx-grp'; h.innerHTML = '<td colspan="50">' + escH(g || 'Sem grupo') + ' <span class="sub">' + n + ' ' + (n === 1 ? o.um : o.varios) + '</span></td>'; tr.before(h); });
    }
    if (!tbody._gxPad) {
      tbody._gxPad = true;
      const abrir = (tr) => {
        if (tbody._gxClique) return tbody._gxClique(tr);   // Backup 27: Painel abre direto a ficha completa
        if (tbody._gxPopup) return tbody._gxPopup(tr);   // Backup 21: Processos abre uma janela em vez de abrir para baixo
        const aberta = tr.classList.contains('gx-aberta');
        tbody.querySelectorAll(':scope > tr.gx-det').forEach((x) => x.remove());
        tbody.querySelectorAll(':scope > tr.gx-aberta').forEach((x) => { x.classList.remove('gx-aberta'); x.setAttribute('aria-expanded', 'false'); const s = x.querySelector('.gx-seta'); if (s) s.textContent = '▸'; });
        if (aberta) return;
        tr.classList.add('gx-aberta'); tr.setAttribute('aria-expanded', 'true'); const s = tr.querySelector('.gx-seta'); if (s) s.textContent = '▾';
        const det = document.createElement('tr'); det.className = 'gx-det'; det.innerHTML = '<td colspan="50"><div class="gx-det-corpo">' + tbody._gxDet(tr) + '</div></td>'; tr.after(det);
        det.querySelectorAll('[data-det-acao]').forEach((b) => b.onclick = () => tbody._gxAcao(b.dataset.detAcao, tr));
      };
      tbody.addEventListener('click', (ev) => { const tr = ev.target.closest('tr.gx-linha-exp'); if (!tr || ev.target.closest(tbody._gxClique ? 'button, a, input, select, .gx-la' : 'button, a, input, select, .gx-la, .lnk, .er-nome')) return; abrir(tr); });
      tbody.addEventListener('keydown', (ev) => { const tr = ev.target.closest('tr.gx-linha-exp'); if (tr && (ev.key === 'Enter' || ev.key === ' ') && ev.target === tr) { ev.preventDefault(); abrir(tr); } });
    }
    tbody._gxDet = o.detalhe; tbody._gxAcao = o.acao || (() => {}); tbody._gxPopup = o.popup || null; tbody._gxClique = o.clique || null;
  }
  const seg = (id, ops, atual) => '<div class="segmento gx-seg-cli" id="' + id + '">' + ops.map(([v, r]) => '<button type="button" data-v="' + v + '" class="' + (v === atual ? 'ativo' : '') + '">' + r + '</button>').join('') + '</div>';
  // ── Painel → Empresas do grupo ──
  const kNeg = (v) => { v = Number(v) || 0; return v >= 1e6 ? (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi' : Math.round(v / 1e3).toLocaleString('pt-BR') + 'k'; };
  function filtrosEmpresas() {
    const wrap = document.getElementById('execRankWrap'); if (!wrap || wrap.querySelector('#pe-filtros')) return;
    const hd = wrap.querySelector('.cc-hd'); if (!hd) return;
    const F = _pad.emp;
    const d = document.createElement('div'); d.id = 'pe-filtros'; d.className = 'gx-filtros-cli';
    d.innerHTML = '' +   // Backup 28: sem "Por grupo / Lista" (sempre por grupo)
      seg('pe-tipo', [['ativos', 'Ativos'], ['Consultoria', 'Consultoria'], ['Demanda', 'Serviço pontual'], ['Inativo', 'Inativos'], ['todos', 'Todos']], F.tipo) +
      seg('pe-area', [['', 'Todas as áreas'], ['juridico', 'Jurídico'], ['contabil', 'Contabilidade']], F.area || '') +   // Backup 39: mesmo estilo de Ativos/Consultoria

      '<input type="text" class="fsel" id="pe-busca" placeholder="Buscar nome, grupo, sócio ou CPF/CNPJ" autocomplete="off">';
    hd.appendChild(d);
    const re = () => { if (typeof window.renderExecRanking === 'function') window.renderExecRanking(); };
    d.querySelector('#pe-tipo').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.tipo = b.dataset.v; d.querySelectorAll('#pe-tipo button').forEach((x) => x.classList.toggle('ativo', x === b)); re(); } };
    d.querySelector('#pe-area').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.area = b.dataset.v; d.querySelectorAll('#pe-area button').forEach((x) => x.classList.toggle('ativo', x === b)); re(); } };
    let t; d.querySelector('#pe-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; re(); }, 250); };
  }
  function padraoEmpresas() {
    const tb = document.getElementById('tblExecRanking'); if (!tb || ehCliente()) return;
    if (tb.parentElement) tb.parentElement.setAttribute('data-sem-pagina', '');   // Backup 28: mostra todas
    filtrosEmpresas();
    const F = _pad.emp, B = dbERP().baseDados || [], cli = GS() && GS().E ? GS().E.clientes || [] : [];
    const busca = normH(F.busca), dig = String(F.busca || '').replace(/\D/g, '');
    // valor negociado: "18k neg." (sem caixa alta)
    tb.querySelectorAll('.tag.tv[title]').forEach((tg) => { const v = Number(String(tg.title).replace(/[^\d,]/g, '').replace(',', '.')); if (v) tg.textContent = kNeg(v) + ' neg.'; });
    tb.querySelectorAll('.er-grupo[onclick], .er-nome[onclick]').forEach((x) => { x.removeAttribute('onclick'); x.title = 'Abrir a ficha completa'; });
    // Backup 53: igual à tabela de Clientes — faixa cinza por grupo (nome + nº de empresas), coluna Grupo estreita, nome maior
    tabelaPadrao(tb, { chave: 'emp', um: 'empresa', varios: 'empresas', semSeta: true,
      clique: (tr) => { const r = regDe(B, tr) || {}; if (r._id && GS() && GS().abrirFicha) Promise.resolve(GS().carregarCadastros()).then(() => GS().abrirFicha(r._id)); },
      grupo: (tr) => (regDe(B, tr) || {}).grupo || '',
      filtro: (tr) => { const r = regDe(B, tr); if (!r) return true; const c = cli.find((x) => x.id === r._id) || {};
        const tipo = r.tipoCliente || c.tipo || '';
        if (F.tipo === 'ativos' && tipo === 'Inativo') return false;
        if (F.tipo !== 'ativos' && F.tipo !== 'todos' && tipo !== F.tipo) return false;
        if (F.area && (c.area || 'ambos') !== F.area && (c.area || 'ambos') !== 'ambos') return false;
        if (F.grupo && r.grupo !== F.grupo) return false;
        if (busca && !(normH([r.nome, r.grupo, r.socioAdmin].join(' ')).includes(busca) || (dig && String(r.cpfCnpj || '').replace(/\D/g, '').includes(dig)))) return false;
        return true; },
      detalhe: (tr) => { const r = regDe(B, tr) || {}, M = (v) => (Number(v) ? fBRL(v) : '—');
        const lin = (o, v, n) => '<tr><td>' + o + '</td><td class="num">' + M(v) + '</td><td class="num">' + (Number(n) ? M(n) : '—') + '</td><td class="num">' + M((Number(v) || 0) + (Number(n) || 0)) + '</td></tr>';
        return '<div class="gx-det-grade"><div><div class="gx-det-tit">Dívida por órgão</div><table class="gx-leg"><thead><tr><td>Órgão</td><td class="num">Em aberto</td><td class="num">Negociado</td><td class="num">Total</td></tr></thead><tbody>' +
          lin('RFB', r.rfb, r.rfbNeg) + lin('PGFN', r.pgfn, r.pgfnNeg) + lin('AGE/MG', r.ageMG, r.ageMGNeg) + lin('SEFAZ/MG', r.sefaz, 0) + '</tbody></table>' +
          (Number(r.ceat) ? '<div class="sub" style="margin-top:6px">CEAT/TRT3: ' + escH(r.ceat) + '</div>' : '') + '</div>' +
          '<div><div class="gx-det-tit">Cadastro</div><div class="gx-det-dados">' + [['Grupo', r.grupo], ['Sócio', r.socioAdmin], ['CPF/CNPJ', r.cpfCnpj], ['CAPAG', r.capag], ['Situação', r.sitCadastral], ['Regime', r.regimeTrib]]
            .filter((x) => x[1]).map((x) => '<div><span>' + x[0] + '</span><b>' + escH(x[1]) + '</b></div>').join('') + '</div></div></div>' +
          '<div class="gx-det-acoes"><button type="button" class="btn-m" data-det-acao="ficha">Abrir ficha completa</button><button type="button" class="btn-m" data-det-acao="empresa">Ver processos e parcelamentos</button></div>'; },
      acao: (a, tr) => { const r = regDe(B, tr) || {};
        if (a === 'ficha' && GS() && GS().abrirFicha) Promise.resolve(GS().carregarCadastros()).then(() => GS().abrirFicha(r._id));
        if (a === 'empresa' && typeof window.goEmpresa === 'function') window.goEmpresa(r.nome); } });
  }
  // ── Processos ──
  function padraoProcessos() {
    const tb = document.getElementById('tblProcBody'); if (!tb || ehCliente()) return;
    if (tb.parentElement) tb.parentElement.setAttribute('data-sem-pagina', '');   // Backup 28: mostra todos
    const hd = document.querySelector('#panel-processos .cc-hd > div:last-child');
    if (hd && !document.getElementById('pr-visao')) {
      // Backup 28: sem "Por grupo / Lista" (sempre por grupo)
      const sv = document.createElement('span'); sv.id = 'pr-visao'; sv.hidden = true; hd.insertBefore(sv, hd.firstChild);
      // Ativos · Arquivados · Extintos juntos, no mesmo desenho dos filtros de Clientes
      const chips = [...hd.querySelectorAll('.chip')]; if (chips.length) { const box = document.createElement('div'); box.className = 'segmento gx-seg-cli gx-seg-chips'; chips[0].before(box); chips.forEach((c) => box.appendChild(c)); }
    }
    const P = dbERP().processos || [];
    tabelaPadrao(tb, { chave: 'proc', um: 'processo', varios: 'processos', semSeta: true,
      grupo: (tr) => (regDe(P, tr) || {}).grupo || '',
      detalhe: (tr) => { const p = regDe(P, tr) || {};
        return '<div class="gx-det-grade"><div><div class="gx-det-tit">Processo</div><div class="gx-det-dados">' +
          [['Nº', p.numero], ['Grupo', p.grupo], ['Competência', p.competencia], ['Natureza', p.natureza], ['Autor', String(p.autor || '').replace(/;\s*/g, ' · ')], ['Réu', String(p.reu || '').replace(/;\s*/g, ' · ')]]
            .filter((x) => x[1]).map((x) => '<div><span>' + x[0] + '</span><b>' + escH(x[1]) + '</b></div>').join('') + '</div></div>' +
          '<div><div class="gx-det-tit">Andamento</div><div class="gx-det-dados">' +
          [['Valor da causa', p.valor ? fBRL(p.valor) + ' · ' + (p.valorEm ? 'atualizado em ' + p.valorEm : 'sem data de atualização') : ''], ['Situação', p.statusOriginal], ['Distribuição', p.dataDistrib], ['Última movimentação em', p.ultimaMovEm || p.atualizacao], ['Advogado', p.advogado], ['Procuração', p.procuracao], ['Prescrição', p.prescricao]]
            .filter((x) => x[1]).map((x) => '<div><span>' + x[0] + '</span><b>' + escH(x[1]) + '</b></div>').join('') + '</div></div></div>' +
          // Backup 28: sempre à vista — última movimentação e observação
          '<div class="gx-det-blocos"><div class="gx-det-bloco"><div class="gx-det-tit">Últimas movimentações</div>' +
            '<div class="gx-det-txt gx-movs" data-movs="' + escH(p._id || '') + '">' + (p.ultimaMov ? '<div class="gx-mov"><b>' + escH(p.ultimaMovEm || '') + '</b> ' + escH(p.ultimaMov) + '</div>' : '<span class="sub">Nenhuma registrada ainda.</span>') + '</div></div>' +
          '<div class="gx-det-bloco"><div class="gx-det-tit">Observação</div><div class="gx-det-txt">' + (p.obs ? escH(p.obs) : '<span class="sub">—</span>') + '</div></div></div>' +
          ''; },
      // Backup 21: clicar no processo abre uma janela com o detalhe (Editar fica no rodapé)
      popup: (tr) => { const p = regDe(P, tr) || {}; if (!GS() || !GS().abrirJanela) return;
        const j = GS().abrirJanela({ titulo: 'Processo ' + (p.numero || ''), larga: true, corpo: '<div class="gx-det-corpo gx-det-janela">' + tbody_det(tr) + '</div>',
          rodape: '<span class="sub">' + escH(p.grupo || '') + '</span><div class="acoes"><button type="button" class="btn btn-o" data-pr-mov>+ Registrar movimentação</button><button type="button" class="btn btn-p" data-pr-editar>✎ Editar processo</button></div>' });
        // Backup 35: as 3 últimas movimentações lançadas (Rotina → Processos ou "+ Registrar movimentação")
        const box = j.querySelector('[data-movs]');
        if (box && p._id && window.SB) window.SB.from('processo_movimentacoes').select('data, tipo, descricao, valor_novo, quem').eq('processo_id', p._id).order('data', { ascending: false }).order('criado_em', { ascending: false }).limit(3)
          .then(({ data }) => { if (!data || !data.length) return;
            const TIPO = { movimentacao: 'Movimentação', decisao: 'Decisão', valor: 'Valor', procuracao: 'Procuração', sem_novidade: 'Sem novidade' };
            box.innerHTML = data.map((m) => '<div class="gx-mov"><div class="gx-mov-cab"><span class="gx-mov-d">' + escH(String(m.data).split('-').reverse().join('/')) + '</span><span class="gx-mov-t">' + escH(TIPO[m.tipo] || m.tipo) + '</span></div>' +
              '<div class="gx-mov-x">' + escH(m.descricao || (m.tipo === 'sem_novidade' ? 'Conferido — sem novidade' : '')) + (m.valor_novo ? ' · novo valor ' + fBRL(m.valor_novo) : '') + '</div>' + (m.quem ? '<div class="gx-mov-q">por ' + escH(m.quem) + '</div>' : '') + '</div>').join(''); });
        j.querySelector('[data-pr-mov]').onclick = () => { GS().fecharJanela(j); if (GS().janelaMovimentacao) GS().janelaMovimentacao(p._id, () => { if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); }); };
        j.querySelector('[data-pr-editar]').onclick = () => { GS().fecharJanela(j); if (window.ERP_EDITAR) window.ERP_EDITAR(tr.dataset.gx); }; } });
    function tbody_det(tr) { return tb._gxDet(tr); }
  }
  const fBRL = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  // ═══════ Backup 20: sem o cartão de título no topo; botões e alertas vão para junto do conteúdo ═══════
  // Financeiro: à direita das abas (Análise, A receber…). Acordos/Parcelamentos: no canto de cima da "Situação".
  function acoesNoLugar() {
    [['panel-financeiro', 'finTabBar'], ['panel-financeiroContab', 'finCTabBar']].forEach(([pid, bar]) => {
      const tb = document.getElementById(bar), painel = document.getElementById(pid); if (!tb || !painel) return;
      let dir = tb.querySelector(':scope > .gx-tabbar-dir'); if (!dir) { dir = document.createElement('div'); dir.className = 'gx-tabbar-dir'; tb.appendChild(dir); }
      painel.querySelectorAll(':scope > .mod-banner [id^="alertFin"], :scope > .mod-banner .gx-cobrar').forEach((x) => dir.appendChild(x));
    });
  }
  function devolverAoBanner(pid) {
    const ban = document.querySelector('#' + pid + ' > .mod-banner'); if (!ban) return;
    document.querySelectorAll('#' + pid + ' .gx-bn-dir > *').forEach((x) => ban.appendChild(x));
  }
  function acoesNaSituacao(pid, bloco) {
    const ex = document.getElementById(bloco), ban = document.querySelector('#' + pid + ' > .mod-banner'); if (!ex || !ban) return;
    let dir = ex.querySelector(':scope > .gx-bn-dir'); if (!dir) { dir = document.createElement('div'); dir.className = 'gx-bn-dir'; ex.insertBefore(dir, ex.firstChild); }
    ban.querySelectorAll('[id^="alert"], .gx-cobrar').forEach((x) => dir.appendChild(x));
  }
  function instalarGanchos() {
    botoesCobranca();
    // Backup 20: Painel (Empresas do grupo) e Processos no padrão de Clientes — redesenha junto com a tabela do ERP
    [['renderExecRanking', () => { padraoEmpresas(); evolucaoPassivo(); }], ['renderProcTbl', padraoProcessos],
     ['renderAcordos', () => acoesNaSituacao('panel-acordos', 'exAcSit'), () => devolverAoBanner('panel-acordos')],
     ['renderParcelamentos', () => acoesNaSituacao('panel-parcelamentos', 'exParcSit'), () => devolverAoBanner('panel-parcelamentos')],
     ['renderParcAnalise', () => acoesNaSituacao('panel-parcelamentos', 'exParcSit'), () => devolverAoBanner('panel-parcelamentos')]].forEach(([nome, fn, antes]) => {
      const orig = window[nome]; if (typeof orig !== 'function') return;
      window[nome] = function () { if (antes) antes(); const r = orig.apply(this, arguments); try { fn(); } catch (e) { console.warn('[ERP] ' + nome + ':', e); } return r; };
    });
    acoesNoLugar();
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
        // Backup 51: sem filtro nenhum ligado, não redesenha tudo de novo (a tela nova já desenha sem filtro)
        let tinha = true;
        try { tinha = Object.values(FILTROS || {}).some(Boolean) || ['fGrupo', 'fEmpresa', 'fTipoCliente', 'fResp', 'fSit', 'fOrgao', 'fCapag'].some((k) => (document.getElementById(k) || {}).value); } catch (e) { tinha = true; } // eslint-disable-line no-undef
        try { window.resetarFiltros(); if (tinha && typeof window.applyFilters === 'function') window.applyFilters(); } catch (e) { console.warn('[ERP] limpar filtros:', e); }
      }
      navOrig.apply(this, arguments);
      // botão "voltar" do navegador: cada tela vira um passo do histórico (#tela)
      if (id && !_voltando) {
        const est = { tela: id };
        if (!history.state || !history.state.tela) history.replaceState(est, '', '#' + id);
        else if (history.state.tela !== id) history.pushState(est, '', '#' + id);
      }
      _painel = id; destacar(id);
      // Backup 52 (O1): as telas novas que ficaram para trás são esvaziadas quando o navegador está livre (cada uma é desenhada de novo ao voltar);
      // assim a página não carrega dezenas de milhares de elementos escondidos, que deixavam toda troca de tela mais lenta
      clearTimeout(window._gxLimpa); window._gxLimpa = setTimeout(() => { document.querySelectorAll('.gs-area').forEach((a) => { if (a.firstChild && !a.closest('.panel.active')) a.textContent = ''; }); }, 1500);
      if (id) document.body.dataset.painel = id;
      document.body.classList.toggle('gx-tela-nova', !!TELAS_GS[id]);
      if (TELAS_GS[id]) desenharGS(id);
      // Backup 46: baixa feita na Rotina não recarrega tudo na hora; recarrega ao abrir uma tela do ERP antigo (Parcelamentos, Painel…)
      else if (window.ERP_DADOS_SUJOS && typeof window.ERP_RECARREGAR === 'function') { window.ERP_DADOS_SUJOS = false; window.ERP_SUJO = null; window.ERP_RECARREGAR(); }
      // Backup 51 (V5): baixa/emissão de parcela feita na Rotina → relê SÓ os parcelamentos (não o ERP inteiro)
      else if (id === 'parcelamentos' && window.ERP_SUJO && window.ERP_SUJO.parcelamentos) { const ids = window.ERP_SUJO.parcelamentos; window.ERP_SUJO = null;
        // Backup 52 (O3): sabendo QUAIS mudaram, relê só eles; senão, o módulo inteiro
        if (Array.isArray(ids)) recarregarParcelamentos(ids); else recarregarModulos('parcelamentos'); }
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
  // Backup 51: relê só os módulos pedidos (ex.: 'parcelamentos') e redesenha a tela aberta do ERP — no lugar do ERP_RECARREGAR completo
  async function recarregarModulos(lista) {
    try {
      if (typeof window.ERP_LER_MODULOS !== 'function' || typeof window._aplicarEtapa2 !== 'function') { if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); return; }
      const j = await window.ERP_LER_MODULOS(lista);
      if (!j || j.erro || j._negado) throw new Error((j && j.erro) || 'falha ao ler ' + lista);
      window._aplicarEtapa2(j);
      try { window.applyFilters(); window.renderAll(); if (window.v16UpdateBadges) window.v16UpdateBadges(); } catch (e) { console.warn('[ERP] redesenho:', e.message); }
    } catch (e) { console.warn('[ERP] recarregar ' + lista + ':', e.message); if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); }
  }
  window.ERP_RECARREGAR_MODULOS = recarregarModulos;
  // Backup 52 (O3): troca no DB do ERP só os parcelamentos que mudaram e redesenha a tela aberta
  async function recarregarParcelamentos(ids) {
    try {
      if (typeof window.ERP_LER_PARCELAMENTOS !== 'function' || typeof window._normParcelamentos !== 'function') return recarregarModulos('parcelamentos');
      const novos = window._normParcelamentos(await window.ERP_LER_PARCELAMENTOS(ids)), db = dbERP();
      if (!Array.isArray(db.parcelamentos)) return recarregarModulos('parcelamentos');
      novos.forEach((n) => { const i = db.parcelamentos.findIndex((x) => x._id === n._id); if (i >= 0) db.parcelamentos[i] = n; else db.parcelamentos.push(n); });
      try { window.applyFilters(); window.renderAll(); if (window.v16UpdateBadges) window.v16UpdateBadges(); } catch (e) { console.warn('[ERP] redesenho:', e.message); }
    } catch (e) { console.warn('[ERP] recarregar parcelamentos:', e.message); recarregarModulos('parcelamentos'); }
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

  // ═════ Backup 49: faixa do MODO TESTE (só o administrador vê): todos os e-mails estão indo para um endereço só ═════
  async function faixaModoTeste() {
    const velha = document.getElementById('gx-modo-teste');
    if (window.ERP_PAPEL !== 'admin' || !window.SB) { if (velha) velha.remove(); return; }
    const r = await window.SB.rpc('modo_teste_email'); const alvo = (r && !r.error && r.data) || '';
    if (!alvo) { if (velha) velha.remove(); document.body.classList.remove('gx-com-teste'); return; }
    const f = velha || document.createElement('div');
    f.id = 'gx-modo-teste'; f.setAttribute('role', 'status');
    f.innerHTML = '⚠ <b>Modo teste:</b> todos os e-mails vão para <b>' + alvo.replace(/[<>&"]/g, '') + '</b>, não para os clientes. <button type="button" id="gx-teste-off">Desligar modo teste</button>';
    if (!velha) document.body.appendChild(f);
    document.body.classList.add('gx-com-teste');
    f.querySelector('#gx-teste-off').onclick = async () => {
      if (!confirm('Desligar o modo teste?\n\nA partir de agora os e-mails vão para os clientes de verdade (só para quem está marcado "✉ Recebe e-mails").')) return;
      const x = await window.SB.rpc('salvar_modo_teste_email', { p: '' });
      if (x && x.error) { alert('Não deu certo: ' + x.error.message); return; }
      faixaModoTeste();
    };
  }
  window.ERP_FAIXA_TESTE = faixaModoTeste;
  document.addEventListener('erp:perfil', () => setTimeout(faixaModoTeste, 300));

  // ═════ modo escuro nos gráficos: texto escuro vira claro, grade preta vira branca (e volta) ═════
  function temaEscuro() { return document.documentElement.getAttribute('data-tema') === 'escuro'; }
  window.ERP_TEMA_ESCURO = temaEscuro;
  // Backup 18: cores dos gráficos vêm dos tokens (--chart-*), lidas na hora de desenhar (o canvas não entende var())
  const tok = (n) => getComputedStyle(document.documentElement).getPropertyValue('--' + n).trim();
  window.ERP_TOKEN = tok;
  function rgbaDe(c) {
    let m = String(c).match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
    if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255, m[2] ? parseInt(m[2], 16) / 255 : 1]; }
    m = String(c).match(/^#([0-9a-f]{3})$/i);
    if (m) return m[1].split('').map((x) => parseInt(x + x, 16)).concat([1]);
    m = String(c).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/);
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
  }
  function comAlfa(cor, a) { const x = rgbaDe(cor); return !x || a >= 1 ? cor : 'rgba(' + x[0] + ',' + x[1] + ',' + x[2] + ',' + (+a.toFixed(3)) + ')'; }
  // cor fixa do gráfico → nome do token do mesmo matiz (rampa azul para barras; categórica para roscas)
  function tokenDaCor(c, categorica) {
    if (typeof c !== 'string') return null;
    if (/^(#fff|#ffffff|white)$/i.test(c)) return 'chart-borda';
    const x = rgbaDe(c); if (!x) return null;
    const r = x[0] / 255, g = x[1] / 255, b = x[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    let h = 0, sat = 0;
    if (mx !== mn) { const d = mx - mn; sat = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
    if (sat < 0.15) return l > 0.85 ? 'chart-rampa-5' : 'chart-7';
    if (h >= 200 && h < 250) return categorica ? 'chart-1' : 'chart-rampa-' + (l < 0.25 ? 1 : l < 0.45 ? 2 : l < 0.62 ? 3 : l < 0.8 ? 4 : 5);
    if (h >= 170 && h < 200) return 'chart-6';
    if (h >= 80 && h < 170) return 'chart-2';
    if (h >= 42 && h < 80) return 'chart-8';
    if (h >= 15 && h < 42) return 'chart-3';
    if (h >= 250 && h < 300) return 'chart-4';
    return 'chart-5';
  }
  function corDoToken(c, categorica) {
    const n = tokenDaCor(c, categorica), t = n && tok(n);
    if (!t) return c;
    const x = rgbaDe(c); return n === 'chart-borda' || !x ? t : comAlfa(t, x[3]);
  }
  // legenda feita em HTML (rosca do Painel/Parcelamentos/Acordos): mesma cor, e troca sozinha no modo escuro
  window.ERP_COR_LEGENDA = (c) => { const n = tokenDaCor(c, true); return n ? 'var(--' + n + ')' : String(c).slice(0, 7); };
  const CAMINHOS = (o) => {
    const out = [];
    Object.values((o && o.scales) || {}).forEach((sc) => { if (sc.ticks) out.push([sc.ticks, 'color', false]); if (sc.grid) out.push([sc.grid, 'color', true]); if (sc.title) out.push([sc.title, 'color', false]); });
    const lg = o && o.plugins && o.plugins.legend && o.plugins.legend.labels; if (lg) out.push([lg, 'color', false]);
    return out;
  };
  const pluginTema = { id: 'gxTema', beforeUpdate(ch) {
    const o = ch.config.options; if (!o) return;
    // grade bem leve e texto cinza dos tokens; sem animação ao repintar
    CAMINHOS(o).forEach(([obj, k, grade]) => { if (typeof obj[k] !== 'function') obj[k] = grade ? tok('chart-grade') : tok('chart-texto'); });
    Object.values(o.scales || {}).forEach((sc) => { if (sc.border) sc.border.color = tok('chart-grade'); });
    o.animation = false;
    // Backup 19: "Recebido mês a mês" (cores de cada pessoa) volta às cores de antes — não troca pelos tokens
    const corPropria = ch.canvas && /^(cFaMes|cFcMes|cFcCaixaFluxo)$/.test(ch.canvas.id);
    if (!corPropria) (ch.data.datasets || []).forEach((ds) => {
      if (!('$gxBg' in ds)) { ds.$gxBg = ds.backgroundColor; ds.$gxBd = ds.borderColor; ds.$gxHv = ds.hoverBackgroundColor; }
      const cat = /doughnut|pie|polarArea/.test(ch.config.type), um = (c) => corDoToken(c, cat);
      const conv = (v) => (Array.isArray(v) ? v.map(um) : um(v));
      ds.backgroundColor = conv(ds.$gxBg);
      if (ds.$gxHv !== undefined) ds.hoverBackgroundColor = conv(ds.$gxHv);
      if (ds.$gxBd !== undefined) ds.borderColor = conv(ds.$gxBd);
    });
    Chart.defaults.color = tok('chart-texto');
    Chart.defaults.borderColor = tok('chart-grade');
  } };

  // ═════ gráficos: números em pt-BR e aviso quando não há dados ═════
  function ajustarGraficos() {
    if (!window.Chart || window.Chart._gx) return;
    window.Chart._gx = true;
    Chart.defaults.locale = 'pt-BR';
    Chart.defaults.animation = false;
    Chart.register(pluginTema);
    // valor escrito na frente de cada barra (gráficos marcados com options.gxValores)
    Chart.register({ id: 'gxValores', afterDatasetsDraw(ch) {
      if (!ch.config.options || !ch.config.options.gxValores) return;
      const meta = ch.getDatasetMeta(0), dados = ch.data.datasets[0].data, ctx = ch.ctx, horiz = ch.config.options.indexAxis === 'y';
      ctx.save(); ctx.fillStyle = tok('ink'); ctx.font = '600 12px Inter, "DM Sans", system-ui, sans-serif'; ctx.textBaseline = 'middle';
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
      ctx.fillStyle = tok('text3'); ctx.font = '500 13px "DM Sans", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
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

  // Backup 38: sem avisos (sino, cartão no canto e caixa de avisos saíram a pedido do escritório)

  // ═══════ Honorários: tabelas de lançamentos no formato do Gestão ═══════
  // O ERP continua filtrando, ordenando e paginando; a tabela dele fica escondida
  // e, logo abaixo, aparece a mesma lista no formato do Gestão (menos colunas).
  const LISTAS = { tblFinBody: 'areceber', tblRecBody: 'recebidos', tblPrejBody: 'prejuizo', tblFcAbaBody: 'areceber', tblFcFechBody: 'recebidos' };
  function converterTabelas() {
    if (!GS() || ehCliente()) return;
    document.querySelectorAll('#panel-financeiro tbody, #panel-financeiroContab tbody').forEach((tb) => {
      const tabela = tb.closest('table');
      if (!tabela || tb.closest('.gs') || tb.closest('[data-sem-gs]')) return;   // Backup 27: "Em atraso" da Contabilidade tem colunas próprias (Receita/Despesa)
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
  // ═══════ Backup 22: RÉGUA ÚNICA das tabelas ═══════
  // Cada coluna é reconhecida pelo título do cabeçalho e ganha a classe da régua (design.css) — em todas as telas, do ERP antigo e do Gestão:
  // col-venc (vencimento/pago em: negrito; vermelho se vencido) · col-valor (negrito, à direita) · col-dias (atraso/dias) · col-nome (CAIXA ALTA).
  const REGUA = [
    ['col-venc', /^(vencimento|venc\.?|pago em|data (de )?pagamento|data pag\.?|prazo)$/],
    ['col-valor', /^(valor|valor da causa|valor parcela|total|saldo|saldo devedor)$/],
    ['col-dias', /^(atraso|dias|dias de atraso)$/],
    // Backup 55: "Grupo" virou coluna própria (estreita, uma linha; some quando a tabela já tem a faixa do grupo) e CPF/CNPJ discreto, como no ERP antigo
    ['col-grupo', /^grupo$/],
    ['col-doc', /^(cpf\/cnpj|cpf \/ cnpj|cnpj|cpf|documento)$/],
    ['col-num', /^(processo|n[ºo°]? ?processo|n[ºo°]? do processo|numero|parcela|parcelas|n[ºo°]? ?parc\.?)$/],
    ['col-texto', /^(natureza|autor|reu|tribunal|orgao|local|tipo|responsavel|advogado|forma)$/],
    ['col-nome', /^(grupo \/ favorecido|devedor|credor|empresa|cliente|nome|entidade|entidade \/ socio)$/],
    // Backup 49 (36): datas e situação também têm lugar fixo (centralizadas)
    ['col-data', /^(data|emissao|validade|desde|aniversario|quando|competencia|inicio|vigencia|criado em|enviado em|ultima movimentacao)$/],
    ['col-sit', /^(situacao|status|financeiro|cobranca|situacao da cobranca)$/]];
  const normTit = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[▲▼↑↓⇅]/g, '').trim().toLowerCase();
  function marcarColunas() {
    document.querySelectorAll('.tw table, .tabela-wrap table, .gx-tab-gs table').forEach((t) => {
      if (t.classList.contains('gx-leg') || t.classList.contains('massa')) return;
      const cab = t.querySelector('thead tr:last-child'); if (!cab) return;
      const ths = [...cab.children], sig = ths.map((x) => x.textContent).join('|');
      if (t._gxRegua !== sig) { t._gxRegua = sig; t._gxCols = ths.map((th) => { const n = normTit(th.textContent); const r = REGUA.find(([, re]) => re.test(n)); return r ? r[0] : ''; }); }
      const cols = t._gxCols; if (!cols.some(Boolean)) return;
      cols.forEach((c, i) => { if (c && ths[i]) ths[i].classList.add(c); });
      // Backup 55: tabela com a faixa do grupo ganha a marca tem-faixa (Backup 57: a coluna Grupo NÃO some mais — é a 1ª coluna)
      t.classList.toggle('tem-faixa', !!t.querySelector(':scope > tbody > tr:is(.gx-grp,.cli-grp,.rt-grp)'));
      t.querySelectorAll(':scope > tbody > tr').forEach((tr) => {
        if (tr._gxRegua === sig || tr.classList.contains('gx-grp') || tr.classList.contains('gx-det')) return;
        const tds = tr.children; if (!tds.length || [...tds].some((x) => x.colSpan > 1)) return;
        cols.forEach((c, i) => { if (!c || !tds[i]) return; const td = tds[i]; td.classList.add(c);
          // Backup 55: texto que não cabe numa linha termina em "…" e mostra tudo ao passar o mouse
          if ((c === 'col-nome' || c === 'col-grupo' || c === 'col-texto') && !td.title) td.title = td.textContent.trim().replace(/\s+/g, ' ');
          // vencido no ERP antigo vinha só com a cor no style: vira a marca da régua
          if (c === 'col-venc' && /red/.test(td.getAttribute('style') || '')) td.classList.add('venc-atraso');
          // Backup 57: Grupo em pílula, como no ERP antigo
          if (c === 'col-grupo' && !td.children.length && td.textContent.trim() && td.textContent.trim() !== '—') td.innerHTML = '<span class="gx-gpill">' + td.innerHTML + '</span>'; });
        // Backup 58: vazio é sempre "—" (o ERP antigo usava "-" em algumas colunas)
        [...tds].forEach((td) => { if (!td.children.length && td.textContent.trim() === '-') td.textContent = '—'; });
        tr._gxRegua = sig;
      });
    });
  }
  // ═══════ Backup 33: EVOLUÇÃO DO PASSIVO mês a mês (linhas, "tipo cotação do dólar") ═══════
  // Cartão no Painel Executivo, antes de "Empresas do grupo". Dados: evolucao_passivo (SQL), lidos uma vez e filtrados aqui.
  // Grupo: "Todos" ou um grupo. Visão: "Total" (uma linha) ou "Por empresa" (uma linha por empresa; em "Todos", uma por grupo).
  const EVO_CORES = ['#5873C1', '#2D7C75', '#AD6833', '#9A79D2', '#B74373', '#358452', '#C26464', '#3294AC', '#73A034'];
  const _evo = { dados: null, visao: 'total', meses: 6, ch: null, carregando: false };
  const evoMoeda = (v) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  const evoCurta = (v) => { const n = Math.abs(v); return n >= 1e6 ? 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi' : n >= 1e3 ? 'R$ ' + (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil' : evoMoeda(v); };
  const evoMes = (iso) => { const [a, m] = String(iso).split('-'); return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(m) - 1] + '/' + a.slice(2); };
  // Backup 35: sempre POR GRUPO (uma linha por grupo). Com um grupo no filtro do topo, uma linha por EMPRESA do grupo.
  // "Tudo junto" soma tudo numa linha só.
  const evoGrupoFiltro = () => { try { return (typeof FILTROS !== 'undefined' && FILTROS.grupo) || ''; } catch (e) { return ''; } };   // eslint-disable-line no-undef
  function evolucaoPassivo() {
    const rk = document.getElementById('execRankWrap'); if (!rk || ehCliente() || !window.SB) return;
    let card = document.getElementById('execEvolWrap');
    if (!card) {
      // Backup 49: recolhido por padrão (abre com um clique; só busca os dados quando abre)
      card = document.createElement('div'); card.id = 'execEvolWrap'; card.className = 'cc evo-card' + (_evo.aberto ? '' : ' evo-fechado');
      card.innerHTML = '<div class="cc-h evo-h"><div><button type="button" class="evo-abrir" id="evo-abrir" aria-expanded="' + (_evo.aberto ? 'true' : 'false') + '"><span class="evo-seta" aria-hidden="true">▸</span> <span class="cc-t">Evolução do passivo</span></button><div class="cc-d" id="evo-sub"></div></div>' +
        '<div class="evo-ctl"><div class="segmento gx-seg-cli" id="evo-visao"><button type="button" data-v="total" class="ativo">Tudo junto</button><button type="button" data-v="linhas" id="evo-bt-linhas">Uma linha por grupo</button></div>' +
        '<select class="fsel" id="evo-meses" autocomplete="off"><option value="6" selected>6 meses</option><option value="12">12 meses</option><option value="24">24 meses</option></select></div></div>' +
        '<div class="evo-resumo" id="evo-resumo"></div><div class="cb evo-cb"><canvas id="cEvoPassivo"></canvas></div>' +
        '<div class="evo-nota">Soma de RFB, PGFN, SEFAZ e AGE/MG (em aberto + negociado). O valor de cada mês é o que estava cadastrado no último dia do mês. Para ver as empresas de um grupo, escolha o grupo no filtro do topo.</div>';
      rk.parentElement.insertBefore(card, rk);
      card.querySelector('#evo-visao').onclick = (ev) => { const b = ev.target.closest('button'); if (!b) return; _evo.visao = b.dataset.v; card.querySelectorAll('#evo-visao button').forEach((x) => x.classList.toggle('ativo', x === b)); evoDesenhar(); };
      card.querySelector('#evo-meses').onchange = (ev) => { _evo.meses = Number(ev.target.value); _evo.dados = null; evolucaoPassivo(); };
      card.querySelector('#evo-abrir').onclick = () => { _evo.aberto = !_evo.aberto; card.classList.toggle('evo-fechado', !_evo.aberto);
        card.querySelector('#evo-abrir').setAttribute('aria-expanded', String(!!_evo.aberto)); if (_evo.aberto) evolucaoPassivo(); };
    }
    if (!_evo.aberto) return;
    if (_evo.dados) return evoDesenhar();
    if (_evo.carregando) return;
    _evo.carregando = true;
    window.SB.rpc('evolucao_passivo', { p_grupo: null, p_meses: _evo.meses }).then(({ data, error }) => {
      _evo.carregando = false;
      if (error) { const r = document.getElementById('evo-resumo'); if (r) r.textContent = 'Não foi possível ler a evolução: ' + error.message; return; }
      _evo.dados = data || []; evoDesenhar();
    });
  }
  function evoDesenhar() {
    const cv = document.getElementById('cEvoPassivo'); if (!cv || !_evo.dados || !window.Chart) return;
    const gf = evoGrupoFiltro();
    const linhas = _evo.dados.filter((x) => !gf || x.grupo === gf);
    // Backup 36: meses sem passivo lançado ainda (null) ficam de fora; o gráfico começa no 1º mês com dado
    let meses = [...new Set(_evo.dados.map((x) => x.mes))].sort();
    const comDado = new Set(linhas.filter((x) => x.total != null).map((x) => x.mes));
    while (meses.length > 2 && !comDado.has(meses[0])) meses.shift();
    const bt = document.getElementById('evo-bt-linhas'); if (bt) bt.textContent = gf ? 'Uma linha por empresa' : 'Uma linha por grupo';
    const sub = document.getElementById('evo-sub'); if (sub) sub.textContent = gf ? 'Empresas do grupo ' + gf + ', mês a mês' : 'Grupos, mês a mês';
    const chave = _evo.visao === 'total' ? () => (gf || 'Todos os grupos') : gf ? (x) => x.cliente : (x) => x.grupo;
    const series = {};
    linhas.forEach((x) => { if (x.total == null) return; const k = chave(x); (series[k] = series[k] || {})[x.mes] = (series[k][x.mes] || 0) + (Number(x.total) || 0); });
    const ult = meses[meses.length - 1];
    const nomes = Object.keys(series).sort((a, b) => (series[b][ult] || 0) - (series[a][ult] || 0));
    const ds = nomes.map((n, i) => {
      const cor = nomes.length === 1 ? '#16294B' : EVO_CORES[i % EVO_CORES.length];
      return { label: n, data: meses.map((m) => (series[n][m] == null ? null : series[n][m])), spanGaps: true, borderColor: cor, backgroundColor: cor, borderWidth: nomes.length === 1 ? 2.5 : 2,
        pointRadius: 2, pointHoverRadius: 5, tension: 0.25, fill: false };
    });
    const tot = (m) => linhas.filter((x) => x.mes === m && x.total != null).reduce((s, x) => s + (Number(x.total) || 0), 0);
    const ini = tot(meses[0]), fim = tot(ult), dif = fim - ini, pct = ini ? (dif / ini) * 100 : 0;
    const r = document.getElementById('evo-resumo');
    if (r) r.innerHTML = '<span><b>' + evoMoeda(fim) + '</b> hoje' + (gf ? ' · ' + esc(gf) : '') + '</span><span class="' + (dif > 0 ? 'evo-sobe' : dif < 0 ? 'evo-desce' : '') + '">' +
      (dif > 0 ? '▲ ' : dif < 0 ? '▼ ' : '') + evoMoeda(Math.abs(dif)) + (ini ? ' (' + pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%)' : '') + ' desde ' + evoMes(meses[0]) + '</span>';
    const cfg = { type: 'line', data: { labels: meses.map(evoMes), datasets: ds },
      options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: ds.length > 1, position: 'bottom', labels: { boxWidth: 12, boxHeight: 2 } },
          tooltip: { itemSort: (a, b) => b.parsed.y - a.parsed.y, callbacks: { label: (c) => ' ' + c.dataset.label + ': ' + evoMoeda(c.parsed.y) } } },
        scales: { y: { ticks: { callback: (v) => evoCurta(v) }, grid: {} }, x: { grid: { display: false } } } } };
    if (_evo.ch) _evo.ch.destroy();
    _evo.ch = new Chart(cv, cfg);
  }
  window.ERP_EVOLUCAO_PASSIVO = () => { _evo.dados = null; evolucaoPassivo(); };

  // ═══════ Backup 31: CONTORNO AZUL de cada grupo nas tabelas agrupadas (Painel, Processos, Rotina, Clientes…) ═══════
  // a linha do grupo (tr.gx-grp; Backup 45: Clientes saiu — faixa simples, como no Painel e na Rotina) abre o bloco; as linhas até o próximo grupo ficam dentro do contorno (design.css: .gc-*)
  let _agendado = false;
  new MutationObserver(() => {
    if (_agendado) return; _agendado = true;
    requestAnimationFrame(() => { _agendado = false; try { converterTabelas(); } catch (e) { console.warn('[ERP] tabela Gestão:', e); }
      try { marcarColunas(); } catch (e) { console.warn('[ERP] régua das tabelas:', e); }
      /* Backup 52 (C4): sem contorno azul nos grupos (contornarGrupos não roda mais; o cabeçalho de grupo é a faixa cinza, igual em todo o ERP) */ });
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
  window.ERP_TELAS = { ir, desenharGS, LANCAR, cobrancas: abrirCobrancas };
})();
