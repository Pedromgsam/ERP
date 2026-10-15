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
  // Backup 85 (JN3): confirmação dentro da página (a do Gestão); sem ela, a caixinha do navegador
  const confirmarPag = (t) => (window.GS && window.GS.confirmarB ? window.GS.confirmarB(t) : Promise.resolve(window.confirm(t)));
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
    // Backup 80 (E1): Alertas saiu do menu — os avisos viram a faixa do Início e as rotinas automáticas vão para Administração → Saúde do sistema
    { sec: 'Módulos' },
    { id: 'resumo', rot: 'Painel Executivo', ic: 'painel', func: 'relatorios' },
    { rot: 'Jurídico', ic: 'juridico', equipe: true, itens: [['processos', 'Processos', 'juridico'], ['parcelamentos', 'Parcelamentos', 'juridico'], ['execucoes', 'Execuções', 'juridico', 1], ['publicacoes', 'Publicações', 'juridico', 1]] },   // Backup 53: Execuções; Backup 75: o 4º item = só equipe (o cliente não vê)
    { id: 'acordos', rot: 'Acordos', ic: 'acordos', equipe: true, func: 'juridico' },   // Backup 81: o cliente vê Processos/Parcelamentos/Acordos dentro do portal
    { rot: 'Financeiro', ic: 'financeiro', equipe: true, itens: [['financeiro', 'Jurídico', 'financeiro_juridico'], ['financeiroContab', 'Contabilidade', 'financeiro_contab']] },
    { id: 'contratos', rot: 'Contratos', ic: 'contratos', equipe: true, func: 'contratos' },
    { id: 'clientes', rot: 'Clientes', ic: 'clientes', equipe: true, func: 'clientes' },
    { id: 'crm', rot: 'CRM', ic: 'crm', equipe: true, func: 'crm' },
    { id: 'documentos', rot: 'Documentos', ic: 'documentos', equipe: true, func: 'documentos' },   // Backup 80 (E11): "Gerar documentos" virou botão dentro de Documentos
    { id: 'rotina', rot: 'Rotina', ic: 'rotina', equipe: true },   // Backup 28: o lugar do estagiário; Backup 39: em Módulos, abaixo de Documentos
    { sec: 'Sistema', admin: true },
    { id: 'admin', rot: 'Administração', ic: 'admin', admin: true }
  ];
  // ícones de traço fino (estilo dos prints): 16 px, cor do texto
  const ICONES = {
    busca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
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
  const FUNC_EXTRA = {};
  // painéis novos → tela do Gestão que desenha nele
  const TELAS_GS = { hoje: 'inicio', contratos: 'contratos', clientes: 'clientes', crm: 'crm', publicacoes: 'publicacoes', documentos: 'documentos', gerador: 'gerador', tarefas: 'tarefas', alertas: 'alertas', rotina: 'rotina', execucoes: 'execucoes', admin: 'admin', parcelamentos: 'parcelamentos', acordos: 'acordos', financeiro: 'juridico', financeiroContab: 'contabilidade', resumo: 'painelExec', processos: 'processosERP', portal: 'portal' };   // Backup 76: Financeiro (S1), Painel (S2) e Processos (S3) novos
  // Backup 68 (reforma, etapa 3): Parcelamentos é tela nova para a equipe; o cliente (portal) continua vendo a antiga
  // Backup 76 (S5): o cliente também usa as telas novas; o Início dele é o portal (as outras telas novas já são só leitura para quem não edita)
  // Backup 81 (A3): o cliente entra direto no portal novo (abas dentro dele); as telas antigas saem do menu dele
  const TELAS_CLIENTE = { resumo: 'portal' };
  const telaGS = (id) => (ehCliente() && TELAS_CLIENTE[id]) || TELAS_GS[id];
  const ehGS = (id) => !!TELAS_GS[id];
  window.ERP_TELA_NOVA = ehGS;   // Backup 76: o ERP antigo pula o desenho escondido destas telas

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
  // Backup 80 (M15): a busca Ctrl+K também lista as ações de "+ Lançar" e as telas do menu
  window.ERP_ACOES_BUSCA = () => ehCliente() ? [] : LANCAR.filter((x) => permitido(x[2], 'editar')).map((x) => ({ rot: x[0], fn: x[1] }))
    .concat(MENU.filter((m) => !m.sec).flatMap((m) => m.itens ? m.itens.map((i) => ({ ir: i[0], rot: m.rot + ' · ' + i[1], f: i[2] })) : [{ ir: m.id, rot: m.rot, f: m.func, adm: m.admin }])
      .filter((x) => x.ir && permitido(x.f) && (!x.adm || ehAdmin())).map((x) => ({ rot: 'Ir para ' + x.rot, fn: () => ir(x.ir), tela: 1 })));
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
      // Backup 83: sem o campo de busca na barra do alto (pedido do usuário); a busca geral continua no Ctrl+K (⌘K no Mac)
      '<span class="gs-hd-esp"></span>' +
      '<div class="tn-lancar gx-so-equipe"><button type="button" class="tn-lancar-bt" aria-haspopup="true" aria-expanded="false">+ Lançar</button>' +
      '<div class="tn-menu tn-menu-dir" role="menu">' + LANCAR.map((x, i) => '<button type="button" role="menuitem" data-lancar="' + i + '">' + esc(x[0]) + '</button>').join('') + '</div></div>' +
      '<div class="hd-usuario"><button type="button" id="gs-ajuda" title="Ajuda desta tela" aria-label="Ajuda desta tela"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/></svg></button><button type="button" id="gs-tema" title="Modo escuro / claro" aria-label="Alternar modo escuro" aria-pressed="false"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg></button>' +
      '<div class="tn-grupo tn-mais-acoes"><button type="button" class="tn-abre gs-bt-mais" data-grupo="acoes" title="Atualizar dados e relatório em PDF" aria-label="Mais ações" aria-haspopup="true" aria-expanded="false">⋯</button>' +
      '<div class="tn-menu tn-menu-dir" role="menu"><button type="button" data-acao="atualizar">↻ Atualizar dados</button><button type="button" data-acao="meunome">👤 Meu nome</button></div></div>' +
      '<span class="gs-eu"><span class="gs-ava" id="gs-ava" aria-hidden="true"></span><span class="gs-eu-tx"><span id="gs-nome"></span><small id="gs-papel"></small></span></span><button type="button" id="gs-sair">Sair</button></div>';
    // barra lateral: marca, seções, itens com ícone; submódulos abrem logo abaixo (linha fina à esquerda); "encolher" no pé
    const lado = document.createElement('aside');
    lado.id = 'gs-lado'; lado.className = 'gs';
    lado.innerHTML = '<div class="gl-marca"><span class="gl-nome">Araújo &amp; Castro<small>Advocacia e Contabilidade</small></span></div>' +
      '<nav id="tn" aria-label="Menu principal">' + MENU.map((m, i) => m.sec ? '<div class="tn-sec' + itemCls(m) + '">' + esc(m.sec) + '</div>'
        : !m.itens ? '<button type="button" class="tn-it' + itemCls(m) + '" data-ir="' + m.id + '" title="' + esc(m.rot) + '">' + icone(m.ic) + '<span class="tn-rot">' + esc(m.rot) + '</span></button>'
        : '<div class="tn-grupo' + itemCls(m) + '"><button type="button" class="tn-it tn-abre" data-grupo="' + i + '" aria-expanded="false" title="' + esc(m.rot) + '">' + icone(m.ic) + '<span class="tn-rot">' + esc(m.rot) + '</span>' + icone('seta').replace('tn-ic', 'tn-ic tn-seta') + '</button>' +
          '<div class="tn-menu" role="menu">' + m.itens.map((x) => '<button type="button" role="menuitem"' + (x[3] ? ' class="gx-so-equipe"' : '') + ' data-ir="' + x[0] + '">' + esc(x[1]) + '</button>').join('') + '</div></div>').join('') +
      '</nav><button type="button" id="gs-encolher" title="Encolher / abrir a barra" aria-label="Encolher ou abrir a barra lateral">' + icone('encolher') + '<span class="tn-rot">encolher</span></button>';
    document.body.insertBefore(lado, document.body.firstChild);
    const ba = hd.querySelector('#gs-ajuda'); if (ba) ba.onclick = () => abrirAjuda(_painel);
    try { if (localStorage.getItem('erp_lado_min') === '1') document.body.classList.add('gx-lado-min'); } catch (e) { /* sem armazenamento: começa aberta */ }
    document.getElementById('gs-encolher').onclick = () => { const min = document.body.classList.toggle('gx-lado-min'); try { localStorage.setItem('erp_lado_min', min ? '1' : '0'); } catch (e) { /* vale só agora */ } };
    document.body.insertBefore(hd, document.body.firstChild);
    // Backup 87: o contador da sessão (⏱60′) saiu da barra, a pedido — a saída automática depois de 60 min sem uso continua
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
        : '<div class="tn-mais-tit' + (m.equipe ? ' gx-so-equipe' : '') + '">' + esc(m.rot) + '</div>' + m.itens.map((x) => '<button type="button"' + (x[3] && !m.equipe ? ' class="gx-so-equipe"' : cls(m)) + ' data-ir="' + x[0] + '">' + esc(x[1]) + '</button>').join('')).join('')
        + '<button type="button" data-acao="atualizar">↻ Atualizar dados</button><button type="button" class="gs-sair">Sair</button>';
    f.innerHTML = '<div class="tn-mais-caixa">' + itens + '<button type="button" class="tn-mais-fechar" data-fechar>Fechar</button></div>';
    f.querySelectorAll('[data-ir]').forEach((b) => { if (!permitido(FUNC_TELA[b.dataset.ir])) b.remove(); });
    f.querySelectorAll('[data-lancar]').forEach((b) => { if (!permitido(LANCAR[+b.dataset.lancar][2], 'editar')) b.remove(); });
    document.body.appendChild(f);
    f.addEventListener('click', (e) => { if (e.target === f || e.target.closest('[data-fechar]')) fecharMais(); });
  }
  function fecharMais() { const f = document.getElementById('tn-mais'); if (f) f.remove(); }

  function ir(id) { if (typeof window.nav === 'function') window.nav(null, id); window.scrollTo(0, 0); }

  // ═══════ Backup 80 (F5): ajuda "?" de cada tela — o que a tela faz e o que fazer primeiro ═══════
  const AJUDA = {
    hoje: ['Os cartões <b>Financeiro</b> e <b>Escritório</b> abrem a lista certa, já filtrada.', 'A faixa <b>Avisos</b> junta o que antes ficava na tela Alertas (certificado vencendo, e-mail com erro, cadastro incompleto…). Clique para ver a lista e, se quiser, "Virar tarefa".', '<b>Meu dia</b>: o que vence hoje e o que atrasou. "Concluir" tem Desfazer.', '<b>Lembretes</b>: anotações rápidas, com ou sem data.'],
    tarefas: ['Abas Em aberto · Atrasadas · Concluídas; os atalhos Vencidas · 5 · 10 · 15 · 30 dias filtram pelo prazo.', 'Lista, Semana, Calendário e Fluxos ficam no alto, ao lado de "+ Nova tarefa".', 'Tarefa com revisor vai para validação ao concluir.'],
    resumo: ['Os números do alto são o passivo dos clientes (em aberto + negociado).', 'Escolha o grupo ou a empresa no alto para recortar tudo.', '<b>Empresas do grupo</b>: clique na empresa para abrir a ficha.'],
    processos: ['O <b>Resumo da carteira</b> começa fechado: clique para abrir os números e as tabelas por grupo, tribunal e natureza.', 'O filtro do alto (Grupo, Competência) recorta o resumo e a tabela.', 'A última movimentação fica vermelha com mais de 30 dias sem novidade. Clique no processo para ver a ficha e registrar movimentação.'],
    parcelamentos: ['A tela começa na <b>Situação por cliente</b>: clique no cartão do grupo para ver os parcelamentos.', 'Tabela A pagar / Pago com atalhos de prazo, <b>Emitir</b> e <b>Baixa</b> (a baixa sempre pede confirmação).', 'O filtro do alto (Grupo, Empresa) recorta a situação e a tabela.'],
    acordos: ['Dívidas dos clientes com terceiros (fora do Financeiro).', 'Clique no cartão do grupo para ver os acordos; Emitir e Baixa ficam na linha.', 'O filtro do alto (Grupo, Devedor) recorta tudo.'],
    execucoes: ['Cobranças na Justiça: o processo, o que o cliente recebeu e a parte do escritório.', 'Cada recebimento lança sozinho o "Honorário de êxito" no Financeiro.'],
    publicacoes: ['Intimações do Diário de Justiça das OABs cadastradas.', 'Marque como lida ou tratada; o botão "Tarefa" cria a tarefa já com o título.'],
    financeiro: ['<b>Análise</b>: Fluxo do mês, Resultado do mês, gráficos e comparativos. O período "de … até …" é digitado (dd/mm/aaaa).', '<b>Lançamentos</b>: A receber, Recebido, A pagar, Pago e Perdas, com Cobrar e Baixa na linha.', 'A baixa de honorário manda o recibo sozinho (se ligado em Administração → E-mail).'],
    contratos: ['Consultoria (mensal fixo ou em salários mínimos) ou serviço pontual com parcelas.', 'Ao assinar, as parcelas e mensalidades entram sozinhas no Financeiro.', 'Reajuste nos próximos dias aparece no alto, com "Aplicar".'],
    clientes: ['Clique no cliente para abrir a ficha completa.', '"Recebe e-mails" liga e desliga todos os e-mails a esse cliente.'],
    crm: ['4 colunas: Novo contato · Diagnóstico · Proposta · Fechamento. Ganhos e perdidos ficam na faixa de baixo.', 'Arraste o cartão para mudar de etapa, ou clique para abrir a oportunidade.'],
    documentos: ['Uma pasta por grupo e cliente. "Vencendo em 30 dias" junta certidões, procurações e certificados.', '"Gerar documentos" abre a Central (procuração, contrato, recibo…).'],
    gerador: ['Central de Documentos: escolha o modelo, o cliente, confira a prévia e gere PDF ou Word.'],
    rotina: ['O <b>placar</b> do mês fica numa linha só: clique em cada item para ir à aba.', '<b>Passivo</b>: edite direto e clique em Salvar. <b>Guias do mês</b>: anexe a guia e mande ao cliente.', '<b>Planilha</b>: clique em Emissão ou Pagamento para marcar (pagamento sempre pede confirmação).'],
    admin: ['<b>E-mail → Como funciona</b> explica o que sai sozinho e o que é você quem manda.', '<b>Saúde do sistema</b> mostra as rotinas automáticas (cartão CNPJ, publicações, backup) — antes ficavam em Alertas.'],
    alertas: ['Tudo o que pede atenção em cada setor. Cada linha abre a lista; "Virar tarefa" transforma em tarefa.']
  };
  function abrirAjuda(id) {
    if (!GS() || !GS().abrirJanela) return;
    const itens = AJUDA[id] || ['Use o menu da esquerda para trocar de tela e a busca (Ctrl+K) para achar cliente, processo ou parcelamento.'];
    const nome = nomeTela(id) || 'Esta tela';
    GS().abrirJanela({ kick: 'Ajuda', titulo: nome, corpo: '<ul class="b-ajuda">' + itens.map((x) => '<li>' + x + '</li>').join('') + '</ul>' +
      '<p class="sub" style="margin-top:10px">Dica: <b>Ctrl+K</b> busca cliente, processo, parcelamento ou uma ação (ex.: "nova tarefa").</p>' });
  }

  // ═════════════════ telas do Gestão dentro do ERP ═════════════════
  function criarPaineis() {
    const main = document.getElementById('main');
    if (!main) return;
    Object.keys(TELAS_GS).forEach((id) => {
      const antigo = document.getElementById('panel-' + id);
      // Backup 68: o painel antigo fica (portal do cliente); a tela nova entra dentro dele e o CSS mostra uma ou outra (body.gx-tela-nova)
      if (antigo) { if (!document.getElementById('gs-main-' + id)) antigo.insertAdjacentHTML('beforeend', '<div class="gs gx-gs-no-antigo"><main class="gs-main" id="gs-main-' + id + '"></main></div>'); return; }
      const s = document.createElement('section');
      s.id = 'panel-' + id; s.className = 'panel gx-painel-gs'; s.dataset.loaded = '1';
      s.innerHTML = '<div class="gs"><main class="gs-main" id="gs-main-' + id + '"></main></div>';
      main.appendChild(s);
    });
  }
  function desenharGS(id) {
    if (!GS() || !ehGS(id)) return;
    if (id === 'admin' && !ehAdmin()) return;
    if (id === 'resumo' && ehCliente()) rotuloInicioCliente();
    return GS().irPara(telaGS(id), document.getElementById('gs-main-' + id));
  }

  // ═══════ Backup 76 (L2): contagem discreta no menu — tarefas minhas atrasadas, publicações novas, parcelas de parcelamento vencidas ═══════
  let _pubN = { n: 0, em: 0 }, _tfN = { n: 0, em: 0, hoje: '' };
  function contagensMenu() {
    if (ehCliente() || !document.getElementById('tn')) return;
    const D = dbERP(), dh = new Date(), hoje = dh.getFullYear() + '-' + String(dh.getMonth() + 1).padStart(2, '0') + '-' + String(dh.getDate()).padStart(2, '0');
    // tarefas: o ERP antigo não carrega a lista — conta direto no banco (minhas, com prazo vencido e ainda abertas)
    const eu = String((window.AC_SESSION && window.AC_SESSION.nome) || '').trim().split(/\s+/)[0];
    const tarefas = _tfN.n;
    let vencidas = 0; (D.parcelamentos || []).forEach((p) => (p.parcelas || []).forEach((x) => { if (x.status === 'Inadimplente') vencidas++; }));
    const marca = (id, n, dica) => document.querySelectorAll('#tn [data-ir="' + id + '"]').forEach((b) => {
      let s = b.querySelector(':scope > .tn-n'); if (!n) { if (s) s.remove(); return; }
      if (!s) { s = document.createElement('span'); s.className = 'tn-n'; b.appendChild(s); } s.textContent = n > 99 ? '99+' : String(n); s.title = dica; });
    marca('tarefas', tarefas, 'Minhas tarefas atrasadas'); marca('parcelamentos', vencidas, 'Parcelas vencidas'); marca('publicacoes', _pubN.n, 'Publicações novas');
    // no grupo fechado (Jurídico), a soma aparece no próprio grupo
    document.querySelectorAll('#tn .tn-grupo').forEach((g) => { const soma = [...g.querySelectorAll('.tn-menu .tn-n')].reduce((s, x) => s + (parseInt(x.textContent, 10) || 0), 0);
      const bt = g.querySelector('.tn-abre'); if (!bt) return; let s = bt.querySelector('.tn-n');
      if (!soma) { if (s) s.remove(); return; } if (!s) { s = document.createElement('span'); s.className = 'tn-n tn-n-grupo'; bt.insertBefore(s, bt.querySelector('.tn-seta')); } s.textContent = soma > 99 ? '99+' : String(soma); });
    if ((Date.now() - _tfN.em > 120000 || _tfN.hoje !== hoje) && window.SB && eu) { _tfN.em = Date.now(); _tfN.hoje = hoje;
      window.SB.from('tarefas').select('id', { count: 'exact', head: true }).lt('prazo', hoje).not('status', 'in', '(concluida,cancelada)').ilike('responsavel', eu + '%')
        .then(({ count }) => { if (typeof count === 'number' && count !== _tfN.n) { _tfN.n = count; contagensMenu(); } }); }
    if (Date.now() - _pubN.em > 120000 && window.SB) { _pubN.em = Date.now();
      window.SB.from('publicacoes').select('id', { count: 'exact', head: true }).eq('status', 'nova').then(({ count }) => { if (typeof count === 'number' && count !== _pubN.n) { _pubN.n = count; contagensMenu(); } }); }
  }
  setInterval(() => { try { contagensMenu(); } catch (e) { /* menu ainda não montado */ } }, 300000);
  // no portal do cliente, "Painel Executivo" se chama "Início"
  function rotuloInicioCliente() {
    const m = MENU.find((x) => x.id === 'resumo'); if (m) m.rot = 'Início';
    document.querySelectorAll('#tn [data-ir=resumo] .tn-rot').forEach((x) => { x.textContent = 'Início'; });
    const nt = document.getElementById('gs-tela-nome'); if (nt && /Painel Executivo/.test(nt.textContent)) nt.textContent = 'Início';
  }
  let _painel = '', _voltando = false;
  function nomeTela(id) {
    for (const m of MENU) { if (m.id === id) return m.rot; const x = (m.itens || []).find((i) => i[0] === id); if (x) return m.rot + ' · ' + x[1]; }
    return ({ gerador: 'Documentos · Gerar documentos', alertas: 'Alertas', portal: 'Portal do cliente (prévia)' })[id] || '';
  }
  function destacar(id) {
    const tn = document.getElementById('gs-tela-nome'); if (tn) tn.textContent = nomeTela(id);
    id = ({ gerador: 'documentos', portal: 'clientes' })[id] || id;   // Backup 80: "Gerar documentos" saiu do menu — acende Documentos
    document.querySelectorAll('#tn [data-ir], #tn-baixo [data-baixo]').forEach((b) => b.classList.toggle('ativo', b.dataset.ir === id || b.dataset.baixo === id));
    // o grupo da tela aberta fica aberto na lateral (como "Fiscal" nos prints); os outros ficam como a pessoa deixou
    document.querySelectorAll('#tn .tn-grupo').forEach((g) => { const tem = !!g.querySelector('[data-ir="' + id + '"]'); g.classList.toggle('ativo', tem);
      if (tem && !document.body.classList.contains('gx-lado-min')) { g.classList.add('on'); const b = g.querySelector('.tn-abre'); if (b) b.setAttribute('aria-expanded', 'true'); } });
  }
  // Backup 76: as tabelas antigas do Painel e de Processos saíram (equipe e cliente usam as telas novas); ficam só os ajudantes usados abaixo
  const escH = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // o DB do ERP é um const do script principal: existe como nome global, mas NÃO como window.DB
  const dbERP = () => { try { return DB || {}; } catch (e) { return {}; } }; // eslint-disable-line no-undef
  // Backup 86: a janela do processo IGUAL à do ambiente — ficha com 8 campos (Natureza, Autor, Réu, Advogado, Valor da causa,
  // Valor atualizado em, Cliente é, Conferido em) e "Últimas movimentações" em linha do tempo. O que só o ERP tem (M05: observação,
  // distribuição, procuração, prescrição) entra na mesma ficha, só quando preenchido.
  const icMov = () => (GS() && GS().iconeB ? GS().iconeB('publicacao') : '');
  const dMov = (iso) => String(iso || '').slice(0, 10).split('-').reverse().join('/');
  function detalheProcHTML(p, polo) {
    const campo = (r, v, cls) => '<div><span>' + r + '</span><b' + (cls ? ' class="' + cls + '"' : '') + '>' + (v ? escH(v) : '—') + '</b></div>';
    const extra = [['Observação', p.obs], ['Distribuição', p.dataDistrib], ['Procuração', p.procuracao], ['Prescrição', p.prescricao]].filter((x) => x[1]);
    return '<div class="b-ficha b-ficha-4">' + campo('Natureza', p.natureza) + campo('Autor', String(p.autor || '').replace(/;\s*/g, ' · ')) + campo('Réu', String(p.reu || '').replace(/;\s*/g, ' · ')) +
        campo('Advogado', p.advogado) + campo('Valor da causa', p.valor ? fBRL(p.valor) : '') + campo('Valor atualizado em', p.valorEm) + campo('Cliente é', polo) +
        campo('Conferido em', p.ultimaMovEm || 'nunca') + extra.map((x) => campo(x[0], x[1])).join('') + '</div>' +
      '<div class="b-bloco"><h3>Últimas movimentações</h3><div class="b-tempo" data-movs="' + escH(p._id || '') + '">' +
        (p.ultimaMov ? '<div class="b-ev"><span class="b-ev-q">' + escH(p.ultimaMovEm || '') + '</span><span class="b-ev-ic">' + icMov() + '</span><div class="b-ev-tx"><b>' + escH(p.ultimaMov) + '</b></div></div>'
          : '<p class="sub">Nenhuma movimentação registrada ainda.</p>') + '</div></div>';
  }
  window.ERP_ABRIR_PROCESSO = (p) => abrirProcesso(p);   // Backup 76: a tela nova de Processos (telas-painel-exec.js) abre a mesma janela
  // Backup 85 (PR5/PR6/PR8): cabeçalho do ambiente ("Processo · tribunal", nº, cliente/grupo e a situação à direita) e os botões
  // Ficha do cliente · Conferido, sem novidade · Registrar movimentação · Editar. Os blocos do ERP (observação, procuração…) continuam.
  function abrirProcesso(p) { if (!GS() || !GS().abrirJanela) return;
        const trib = GS().tribunalProcesso ? GS().tribunalProcesso(p) : '', sit = p.arquivamento || 'Ativo';
        const cliP = () => { const L = (GS().E && GS().E.clientes) || [], nomes = (String(p.autor || '') + ';' + String(p.reu || '')).toLowerCase();
          const doGrupo = L.filter((c) => (c.grupos && c.grupos.nome) === p.grupo || (GS().E.grupos || []).some((g) => g.id === c.grupo_id && g.nome === p.grupo));
          return doGrupo.find((c) => c.nome && nomes.includes(String(c.nome).toLowerCase())) || doGrupo[0] || null; };
        const cli0 = cliP(), nomeL = String((cli0 && cli0.nome) || '').toLowerCase();
        const polo = !nomeL ? '' : String(p.reu || '').toLowerCase().includes(nomeL) ? 'Réu (passivo)' : String(p.autor || '').toLowerCase().includes(nomeL) ? 'Autor (ativo)' : '';
        const j = GS().abrirJanela({ kick: 'Processo' + (trib ? ' · ' + trib : ''), titulo: p.numero || 'Processo', larga: true, sub: escH([cli0 && cli0.nome, p.grupo].filter(Boolean).join(' · ')),
          dir: '<span class="b-pill ' + (sit === 'Ativo' ? 'b-g' : sit === 'Arquivado' ? 'b-a' : 'b-r') + '">' + escH(sit) + '</span>',
          corpo: detalheProcHTML(p, polo),
          rodape: (ehCliente() ? '<span></span>' : '<button type="button" class="btn btn-o" data-pr-ficha>' + (GS().iconeB ? GS().iconeB('clientes') : '') + 'Ficha do cliente</button><div class="acoes"><button type="button" class="btn btn-o" data-pr-conf>' + (GS().iconeB ? GS().iconeB('check') : '') + 'Conferido, sem novidade</button>' +
            '<button type="button" class="btn btn-o" data-pr-mov>' + (GS().iconeB ? GS().iconeB('mais') : '') + 'Registrar movimentação</button><button type="button" class="btn btn-p" data-pr-editar>' + (GS().iconeB ? GS().iconeB('lapis') : '') + 'Editar</button></div>') });
        j.classList.add('proc-janela');
        // as 3 últimas movimentações lançadas (Rotina → Processos ou "Registrar movimentação"), em linha do tempo como no ambiente
        const box = j.querySelector('[data-movs]');
        if (box && p._id && window.SB) window.SB.from('processo_movimentacoes').select('data, tipo, descricao, valor_novo, quem').eq('processo_id', p._id).order('data', { ascending: false }).order('criado_em', { ascending: false }).limit(3)
          .then(({ data }) => { if (!data || !data.length) return;
            const TIPO = { movimentacao: 'Movimentação', decisao: 'Decisão', valor: 'Mudança de valor', procuracao: 'Procuração', sem_novidade: 'Conferido — sem novidade' };
            box.innerHTML = data.map((m) => '<div class="b-ev"><span class="b-ev-q">' + escH(dMov(m.data)) + '</span><span class="b-ev-ic">' + icMov() + '</span><div class="b-ev-tx"><b>' +
              escH(m.descricao || TIPO[m.tipo] || m.tipo) + (m.valor_novo ? ' · novo valor ' + fBRL(m.valor_novo) : '') + '</b><span>' + escH([m.descricao ? TIPO[m.tipo] : '', m.quem ? 'por ' + m.quem : ''].filter(Boolean).join(' · ')) + '</span></div></div>').join(''); }, () => {});
        if (ehCliente()) return;
        j.querySelector('[data-pr-ficha]').onclick = async () => { if (GS().carregarCadastros) await GS().carregarCadastros(); const c = cliP(); if (!c) { GS().aviso ? GS().aviso('Não achei o cliente deste processo.', true) : alert('Não achei o cliente deste processo.'); return; } GS().fecharJanela(j); GS().abrirFicha(c.id); };
        j.querySelector('[data-pr-conf]').onclick = async (ev) => { ev.currentTarget.disabled = true;
          const r = await window.SB.rpc('conferir_processos_grupo', { p_ids: [p._id] });
          if (r && r.error) { ev.currentTarget.disabled = false; alert('Não deu certo: ' + r.error.message); return; }
          GS().fecharJanela(j); if (GS().feitoDesfazer) GS().feitoDesfazer('Processo conferido (sem novidade).'); if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); };
        j.querySelector('[data-pr-mov]').onclick = () => { GS().fecharJanela(j); if (GS().janelaMovimentacao) GS().janelaMovimentacao(p._id, () => { if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); }); };
        j.querySelector('[data-pr-editar]').onclick = () => { GS().fecharJanela(j); if (window.ERP_EDITAR) window.ERP_EDITAR('processos:' + p._id); }; }
  const fBRL = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  // ═══════ Backup 20: sem o cartão de título no topo; botões e alertas vão para junto do conteúdo ═══════
  // Financeiro: à direita das abas (Análise, A receber…). Acordos/Parcelamentos: no canto de cima da "Situação".
  function instalarGanchos() {
    // Backup 76 (S5): equipe E cliente usam as telas novas de Painel/Início, Processos, Parcelamentos, Acordos e Financeiro —
    // o desenho antigo destas telas (escondido) não roda mais para ninguém
    ['renderResumo', 'renderExecRanking', '_execDetalhe', 'renderProcessos', 'renderProcTbl', 'renderProcAnalise', 'renderParcelamentos', 'renderParcAnalise', 'renderAcordos',
     'renderFinanceiro', 'renderFinanceiroContab', 'renderFinTbl', 'renderFinCAbaTbl', 'renderInicio', 'renderDashboardCliente'].forEach((nome) => { if (typeof window[nome] === 'function') window[nome] = function () {}; });
    // Backup 70: a tela nova aberta antes de os dados chegarem (2ª/3ª etapa da carga) se redesenha quando eles chegam
    const etapaOrig = window._aplicarEtapa2;
    if (typeof etapaOrig === 'function') {
      window._aplicarEtapa2 = function (json) {
        const r = etapaOrig.apply(this, arguments);
        if (json && ehGS(_painel) && Object.keys(json).some((m) => m === _painel)) setTimeout(() => desenharGS(_painel), 60);
        setTimeout(() => { try { contagensMenu(); } catch (e) { /* sem menu */ } }, 80);
        return r;
      };
    }
    const navOrig = window.nav;
    window.nav = function (btn, pid) {
      const id = pid || (btn && btn.dataset && btn.dataset.panel);
      // Backup 76 (S4): a tela antiga de Notificações/cobranças saiu — cobrar é no Financeiro, guias na Rotina, recibo na Central de Documentos
      if (id === 'notificacoes' || id === 'inicio' || id === 'relatorio') return window.nav(null, id === 'notificacoes' ? 'financeiro' : 'hoje');
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
      if (_painel === 'tarefas') _tfN.em = 0;   // saiu de Tarefas: reconta (pode ter concluído alguma)
      _painel = id; destacar(id); try { contagensMenu(); } catch (e) { console.warn('[ERP] contagens do menu:', e); }
      // Backup 52 (O1): as telas novas que ficaram para trás são esvaziadas quando o navegador está livre (cada uma é desenhada de novo ao voltar);
      // assim a página não carrega dezenas de milhares de elementos escondidos, que deixavam toda troca de tela mais lenta
      clearTimeout(window._gxLimpa); window._gxLimpa = setTimeout(() => { document.querySelectorAll('.gs-area').forEach((a) => { if (a.firstChild && !a.closest('.panel.active')) a.textContent = ''; }); }, 1500);
      if (id) document.body.dataset.painel = id;
      document.body.classList.toggle('gx-tela-nova', ehGS(id));
      // Backup 76: Painel, Processos, Acordos e Financeiro agora são telas novas que leem os dados do ERP — se algo ficou "a atualizar", relê antes
      if (ehGS(id) && window.ERP_DADOS_SUJOS && ['resumo', 'processos', 'acordos', 'financeiro', 'financeiroContab'].includes(id) && typeof window.ERP_RECARREGAR === 'function') { window.ERP_DADOS_SUJOS = false; window.ERP_SUJO = null; desenharGS(id); window.ERP_RECARREGAR(); }
      else if (ehGS(id)) desenharGS(id);
      // Backup 46: baixa feita na Rotina não recarrega tudo na hora; recarrega ao abrir uma tela do ERP antigo (Parcelamentos, Painel…)
      else if (window.ERP_DADOS_SUJOS && typeof window.ERP_RECARREGAR === 'function') { window.ERP_DADOS_SUJOS = false; window.ERP_SUJO = null; window.ERP_RECARREGAR(); }
      // Backup 51 (V5): baixa/emissão de parcela feita na Rotina → relê SÓ os parcelamentos (não o ERP inteiro)
      else if (id === 'parcelamentos' && window.ERP_SUJO && window.ERP_SUJO.parcelamentos) { const ids = window.ERP_SUJO.parcelamentos; window.ERP_SUJO = null;
        // Backup 52 (O3): sabendo QUAIS mudaram, relê só eles; senão, o módulo inteiro
        if (Array.isArray(ids)) recarregarParcelamentos(ids); else recarregarModulos('parcelamentos'); }
    };
    // equipe entra no Início
    const admOrig = window.acAplicarModoAdmin;
    // (ou na tela do endereço, ex.: .../#processos, quando a pessoa recarrega a página)
    if (typeof admOrig === 'function') window.acAplicarModoAdmin = function () {
      const r = admOrig.apply(this, arguments);
      const h = decodeURIComponent(location.hash.slice(1));
      setTimeout(() => ir(h && !['inicio', 'relatorio'].includes(h) && (TELAS_GS[h] || document.getElementById('panel-' + h)) ? h : 'hoje'), 0);   // Backup 76: Início/Relatório antigos saíram
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
      // Backup 68: redesenha a tela nova DEPOIS que os dados chegaram (antes eram 200 ms fixos — a tela podia sair com o dado velho)
      if (ehGS(_painel)) Promise.resolve(r).catch(() => null).then(() => setTimeout(() => desenharGS(_painel), 50));
      _tfN.em = 0; _pubN.em = 0;
      Promise.resolve(r).catch(() => null).then(() => setTimeout(() => { try { contagensMenu(); } catch (e) { /* sem menu */ } }, 60));
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
  // Backup 68: a tela nova de Parcelamentos relê o que mudou (baixa na Rotina, por exemplo) antes de se desenhar
  window.ERP_RECARREGAR_PARCELAMENTOS = (ids) => (Array.isArray(ids) ? recarregarParcelamentos(ids) : recarregarModulos('parcelamentos'));
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
    const av = document.getElementById('gs-ava'), pp = document.getElementById('gs-papel');
    if (av) av.textContent = (nome || eu.email || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
    if (pp) pp.textContent = ehCliente() ? 'Cliente' : ehAdmin() ? 'Administrador' : 'Equipe';
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
      if (!await confirmarPag('Desligar o modo teste?\n\nA partir de agora os e-mails vão para os clientes de verdade (só para quem está marcado "✉ Recebe e-mails").')) return;
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
      if (t.classList.contains('gx-leg') || t.classList.contains('massa') || t.classList.contains('b-tab')) return;   // Backup 71: a tabela nova tem régua própria
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
  // ═══════ Backup 31: CONTORNO AZUL de cada grupo nas tabelas agrupadas (Painel, Processos, Rotina, Clientes…) ═══════
  // a linha do grupo (tr.gx-grp; Backup 45: Clientes saiu — faixa simples, como no Painel e na Rotina) abre o bloco; as linhas até o próximo grupo ficam dentro do contorno (design.css: .gc-*)
  let _agendado = false;
  new MutationObserver(() => {
    if (_agendado) return; _agendado = true;
    requestAnimationFrame(() => { _agendado = false; 
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
  window.ERP_TELAS = { ir, desenharGS, LANCAR };
})();
