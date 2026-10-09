/* Peças comuns do ambiente de teste — as mesmas vão para o ERP de verdade (nucleo.js/base.css).
   Toda tela usa SÓ estas peças: cabecalho, cartoes (abrem o detalhamento), tabela (filtros, ordenação, filtros salvos,
   densidade, total no rodapé, seleção para ações em lote), janela no centro, confirmar, acao (com Desfazer), busca geral e ajuda. */
(function(){
  var APP = window.APP = { telas:{}, ordem:[], atual:null, arg:null };
  var DIA = DADOS.DIA, HOJE = DADOS.HOJE;

  /* ── utilidades ── */
  var $ = APP.$ = function(id){ return document.getElementById(id); };
  var esc = APP.esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
  var brl = APP.brl = function(v){ return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 }); };
  var d2 = function(n){ return String(n).padStart(2, '0'); };
  APP.fd = function(d){ return d ? d2(d.getDate()) + '/' + d2(d.getMonth() + 1) + '/' + d.getFullYear() : '—'; };
  APP.fc = function(d){ return d ? d2(d.getDate()) + '/' + d2(d.getMonth() + 1) : '—'; };
  APP.fh = function(d){ return d ? d2(d.getHours()) + ':' + d2(d.getMinutes()) : ''; };
  APP.iso = function(d){ return d.getFullYear() + '-' + d2(d.getMonth() + 1) + '-' + d2(d.getDate()); };
  APP.deIso = function(v){ if (!v) return null; var a = String(v).split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); };
  APP.deBR = function(v){ var m = String(v || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };
  APP.num = function(v){ v = String(v == null ? '' : v).replace(/[^\d,.-]/g, ''); if (v === '') return null; if (v.indexOf(',') >= 0) v = v.replace(/\./g, '').replace(',', '.'); return Number(v); };
  APP.plural = function(n, um, varios){ return n + ' ' + (n === 1 ? um : varios); };
  APP.dias = function(d){ return Math.round((HOJE - d) / DIA); };
  APP.doMes = function(d, ref){ ref = ref || HOJE; return d && d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear(); };
  APP.cli = function(id){ return APP.D.clientes.find(function(c){ return c.id === id; }) || { nome:'?', doc:'', g:null }; };
  APP.grupo = function(id){ return APP.D.grupos.find(function(g){ return g.id === id; }) || { nome:'Sem grupo', cor:7 }; };
  APP.pessoa = function(id){ return APP.D.equipe.find(function(p){ return p.id === id; }) || { nome:id, curto:id }; };
  // E3: ponto de cor do grupo — o mesmo em todas as telas
  APP.grupoTxt = function(gid){ var g = APP.grupo(gid); return '<span class="g-txt"><span class="ponto" style="background:var(--g' + g.cor + ')"></span>' + esc(g.nome) + '</span>'; };
  APP.vencTxt = function(venc, pago){   // vencimento colorido (vermelho = em atraso, inclui hoje; azul = a vencer)
    if (pago) return { cls:'', html:APP.fd(venc) };
    var d = APP.dias(venc);
    return { cls: d >= 0 ? ' v-atr' : ' v-av', html: APP.fd(venc) + '<small>' + (d === 0 ? 'vence hoje' : d > 0 ? APP.plural(d, 'dia', 'dias') + ' de atraso' : 'em ' + APP.plural(-d, 'dia', 'dias')) + '</small>' };
  };

  /* ── ícones de traço fino (E4: nenhum emoji no sistema) ── */
  var ICONES = {
    inicio:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    camadas:'<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>', dinheiro:'<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
    pessoas:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
    rotina:'<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    admin:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    alerta:'<path d="M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>', doc:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    pizza:'<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>', ok:'<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 5-5"/>',
    check:'<path d="M20 6 9 17l-5-5"/>', busca:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', mais:'<path d="M12 5v14M5 12h14"/>', x:'<path d="M18 6 6 18M6 6l12 12"/>',
    voltar:'<path d="M15 18l-6-6 6-6"/>', lua:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>', ajuda:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14m0 3h.01"/>',
    email:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>', raio:'<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>', relogio:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    tarefa:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 12 3 3 5-6"/>', clipe:'<path d="M21 11.5 12.5 20a5 5 0 0 1-7-7L14 4.5a3.3 3.3 0 0 1 4.7 4.7L10.2 17.7a1.7 1.7 0 0 1-2.4-2.4L15.5 7.6"/>',
    linhas:'<path d="M4 6h16M4 12h16M4 18h16"/>', compacto:'<path d="M4 5h16M4 9.5h16M4 14h16M4 18.5h16"/>', filtro:'<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    estrela:'<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>', importar:'<path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3"/>',
    novidade:'<path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/>', teste:'<path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.8-2.5L14 9V3"/>',
    link:'<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>', escudo:'<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>', menu:'<path d="M4 6h16M4 12h16M4 18h16"/>'
  };
  var ic = APP.ic = function(k){ return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + (ICONES[k] || '') + '</svg>'; };

  /* ── preferências de cada pessoa (neste navegador) ── */
  var PREF = 'erp-ambiente-teste-prefs', prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(PREF) || '{}') || {}; } catch (e) { prefs = {}; }
  APP.pref = function(k, v){ if (arguments.length < 2) return prefs[k]; prefs[k] = v; try { localStorage.setItem(PREF, JSON.stringify(prefs)); } catch (e) {} };

  /* ── gravar + avisar + desfazer (F5: todo gravar, editar e excluir tem "Desfazer") ── */
  APP.salvar = function(){ DADOS.salvar(APP.D); APP.contadores(); };
  APP.aviso = function(txt, desfazer, prazo){
    var box = $('avisos'), el = document.createElement('div');
    el.className = 'aviso-tx'; el.setAttribute('role', 'status');
    el.innerHTML = '<span>' + esc(txt) + '</span>' + (desfazer ? '<button type="button">Desfazer</button>' : '');
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();   // no máximo 3 avisos na tela
    var t = setTimeout(function(){ el.remove(); }, prazo || (desfazer ? 7000 : 3500));
    if (desfazer) el.querySelector('button').onclick = function(){ clearTimeout(t); el.remove(); desfazer(); APP.salvar(); APP.redesenhar(); APP.aviso('Desfeito.'); };
  };
  // fazer() muda os dados e devolve a função que volta como era
  APP.acao = function(texto, fazer){ var volta = fazer(); APP.salvar(); APP.redesenhar(); APP.aviso(texto, typeof volta === 'function' ? volta : null); };
  // guarda os campos de um objeto antes de mudar (para o Desfazer)
  APP.foto = function(obj, campos){ var c = {}; campos.forEach(function(k){ c[k] = obj[k]; }); return function(){ campos.forEach(function(k){ obj[k] = c[k]; }); }; };

  /* ── janela no centro (criar, editar, detalhe) — pode empilhar (ex.: confirmar por cima do detalhe) ── */
  var pilha = [];
  APP.janela = function(o){
    var f = document.createElement('div'); f.className = 'fundo';
    f.innerHTML = '<div class="janela' + (o.larga ? ' larga' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(o.tit) + '">'
      + '<div class="j-hd"><div>' + (o.kick ? '<span class="kick">' + esc(o.kick) + '</span>' : '') + '<b>' + esc(o.tit) + '</b>' + (o.sub ? '<small>' + o.sub + '</small>' : '') + '</div>'
      + '<div class="dir-hd">' + (o.dir || '') + '<button class="fechar" type="button" data-fechar aria-label="Fechar">' + ic('x') + '</button></div></div>'
      + (o.abas ? '<div class="j-abas">' + o.abas + '</div>' : '')
      + '<div class="j-bd">' + (o.corpo || '') + '</div>' + (o.rodape ? '<div class="j-pe">' + o.rodape + '</div>' : '') + '</div>';
    var J = { el:f, voltar:document.activeElement, fechar:function(){ var i = pilha.indexOf(J); if (i >= 0) pilha.splice(i, 1); f.remove(); if (J.aoFechar) J.aoFechar(); try { J.voltar && J.voltar.focus(); } catch (e) {} },
      bd:function(){ return f.querySelector('.j-bd'); }, q:function(s){ return f.querySelector(s); } };
    f.addEventListener('click', function(e){
      if (e.target === f || e.target.closest('[data-fechar]')) return J.fechar();
      var op = e.target.closest('.opcoes button'); if (op) op.parentNode.querySelectorAll('button').forEach(function(x){ x.setAttribute('aria-pressed', x === op); });
    });
    document.body.appendChild(f); pilha.push(J);
    setTimeout(function(){ var x = f.querySelector('.j-bd input:not([type=checkbox]), .j-bd select, .j-bd textarea') || f.querySelector('.fechar'); if (x) x.focus(); }, 30);
    return J;
  };
  APP.fecharTodas = function(){ while (pilha.length) pilha[pilha.length - 1].fechar(); };
  APP.opcoes = function(nome, itens, sel){ return '<div class="opcoes" role="group" aria-label="' + esc(nome) + '">' + itens.map(function(t){ return '<button type="button" aria-pressed="' + (t === sel) + '">' + esc(t) + '</button>'; }).join('') + '</div>'; };
  APP.opcaoDe = function(J, nome){ var b = J.q('.opcoes[aria-label="' + nome + '"] [aria-pressed="true"]'); return b ? b.textContent : ''; };

  // confirmação dentro da página (todo pagamento, envio e exclusão passa por aqui)
  APP.confirmar = function(o){
    return new Promise(function(ok){
      var feito = false;
      var J = APP.janela({ kick:o.kick || 'Confirmar', tit:o.tit, sub:o.sub,
        corpo:(o.resumo ? '<div class="conf-resumo">' + o.resumo + '</div>' : '') + (o.data ? '<div class="campo"><label for="cf-data">' + esc(o.data) + '</label><input class="ctl" id="cf-data" type="date" value="' + APP.iso(HOJE) + '"><span class="ajuda">Já vem com a data de hoje. Se foi em outro dia, troque aqui.</span></div>' : '') + (o.extra || ''),
        rodape:'<button class="bt bt-o" type="button" data-nao>Cancelar</button><button class="bt ' + (o.perigo ? 'bt-perigo' : 'bt-p') + '" type="button" data-sim>' + ic('check') + esc(o.ok || 'Confirmar') + '</button>' });
      J.aoFechar = function(){ if (!feito){ feito = true; ok(null); } };
      J.q('[data-nao]').onclick = function(){ J.fechar(); };
      J.q('[data-sim]').onclick = function(){ feito = true; var v = o.data ? APP.deIso(J.q('#cf-data').value) || HOJE : true; J.fechar(); ok(v); };
    });
  };

  /* ── cabeçalho da tela ── */
  APP.cabecalho = function(o){
    return '<div class="cab"><div class="cab-ic">' + ic(o.ic) + '</div><div class="cab-tx"><h1>' + esc(o.tit) + '</h1>' + (o.frase ? '<p>' + esc(o.frase) + '</p>' : '') + '</div>'
      + '<div class="cab-acoes">' + (o.acoes || '') + '</div></div>';
  };

  /* ── cartões que abrem o detalhamento (toda informação clicável abre o detalhe) ── */
  var abertos = {};
  APP.cartoes = function(el, id, lista){
    var ab = abertos[id] || '';
    el.innerHTML = '<div class="kpis">' + lista.map(function(c){
      var on = ab === c.id;
      return '<button type="button" class="kpi" data-kpi="' + c.id + '" aria-expanded="' + on + '"><span class="abre">' + (on ? 'fechar ▲' : 'ver ▼') + '</span>'
        + '<div class="kpi-ic ' + (c.cor || 'b') + '">' + ic(c.ic || 'ok') + '</div><div class="kpi-tx"><div class="l">' + esc(c.rot) + '</div>'
        + (c.linhas ? '<div class="linhas">' + c.linhas.map(function(l){ return '<div><span class="v' + (l[2] ? ' ' + l[2] : '') + '">' + l[0] + '</span><span class="s">' + esc(l[1]) + '</span></div>'; }).join('') + '</div>'
          : '<div class="v' + (c.vcls ? ' ' + c.vcls : '') + '">' + c.v + '</div>')
        + (c.barra != null ? '<div class="barra' + (c.barraCor ? ' ' + c.barraCor : '') + '"><span style="width:' + Math.max(0, Math.min(100, Math.round(c.barra))) + '%"></span></div>' : '')
        + (c.sub ? '<div class="s">' + c.sub + '</div>' : '') + '</div></button>';
    }).join('') + '</div><div class="kpi-det"></div>';
    var det = el.querySelector('.kpi-det'), atual = lista.find(function(c){ return c.id === ab; });
    if (atual && atual.det) atual.det(det);
    el.querySelector('.kpis').onclick = function(e){ var b = e.target.closest('[data-kpi]'); if (!b) return; abertos[id] = ab === b.dataset.kpi ? '' : b.dataset.kpi; APP.cartoes(el, id, lista); };
  };

  /* ── TABELA: toda tabela do sistema ──
     cfg: { id, titulo, colunas:[{k, rot, cls, html(r), ord(r), soma}], linhas:[...], abas:[{id, rot, f(r), cor}], busca(r), listas:[{k, rot, todos, opcoes:[[v, rótulo]], get(r)}],
            venc(r), valor(r), lote:[{rot, ic, quando(r), fn(lista)}], clique(r), chave(r), vazio:{tit, frase}, ord:{k, dir}, altura, semBarra } */
  var EST = APP.estTab = {};
  APP.tabela = function(el, cfg){
    var st = EST[cfg.id] = EST[cfg.id] || { aba:(cfg.abas && (cfg.abaPadrao || cfg.abas[0].id)) || '', q:'', listas:{}, vde:'', vate:'', min:'', max:'', ord:Object.assign({}, cfg.ord || { k:'', dir:1 }), ordAba:{}, sel:{}, painel:false };
    el._cfg = cfg;
    var temFx = !!(cfg.venc || cfg.valor);
    if (!cfg.semBarra){
      el.innerHTML = '<div class="barra-abas"' + (cfg.abas ? '' : ' style="border-bottom:0"') + '>' + (cfg.abas ? '<div class="abas" role="tablist"></div>' : '')
        + '<div class="filtros">' + (cfg.busca ? '<label class="ctl-busca">' + ic('busca') + '<input data-t="q" placeholder="' + esc(cfg.dicaBusca || 'Buscar') + '" aria-label="Buscar" value="' + esc(st.q) + '"></label>' : '')
        + (cfg.listas || []).map(function(l){ return '<select class="ctl" data-t="l" data-k="' + l.k + '" aria-label="' + esc(l.rot) + '"><option value="">' + esc(l.todos) + '</option>' + l.opcoes.map(function(o){ return '<option value="' + esc(o[0]) + '"' + (st.listas[l.k] === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }).join('')
        + (temFx ? '<button class="bt-f" type="button" data-t="painel" aria-expanded="' + st.painel + '">' + ic('filtro') + 'Filtros <span class="nf" hidden></span></button>' : '')
        + '<span style="position:relative"><button class="bt-f" type="button" data-t="salvos" title="Filtros salvos">' + ic('estrela') + '<span class="so-largo">Salvos</span></button></span>'
        + '<button class="ic-bt" type="button" data-t="dens" aria-pressed="' + document.documentElement.classList.contains('compacto') + '" title="Tabela compacta (mais linhas na tela)">' + ic('compacto') + '</button>'
        + '</div></div>'
        + (temFx ? '<div class="mais-filtros" data-t="pn"' + (st.painel ? '' : ' hidden') + '>'
          + (cfg.venc ? '<div class="campo"><span class="rot">Vencimento</span><div class="par"><input class="ctl" type="date" data-t="vde" aria-label="Vencimento de" value="' + st.vde + '"><span>até</span><input class="ctl" type="date" data-t="vate" aria-label="Vencimento até" value="' + st.vate + '"></div></div>' : '')
          + (cfg.valor ? '<div class="campo"><span class="rot">Valor (R$)</span><div class="par"><input class="ctl" inputmode="decimal" data-t="min" placeholder="de" aria-label="Valor mínimo" style="width:110px" value="' + esc(st.min) + '"><span>até</span><input class="ctl" inputmode="decimal" data-t="max" placeholder="até" aria-label="Valor máximo" style="width:110px" value="' + esc(st.max) + '"></div></div>' : '')
          + '<button class="bt bt-g" type="button" data-t="limpar">Limpar filtros</button></div>' : '')
        + '<div data-t="quadro"></div>';
    } else el.innerHTML = '<div data-t="quadro"></div>';
    var Q = function(s){ return el.querySelector(s); };
    function filtrar(){
      var vde = APP.deIso(st.vde), vate = APP.deIso(st.vate), min = APP.num(st.min), max = APP.num(st.max), q = st.q.trim().toLowerCase();
      return cfg.linhas.filter(function(r){
        if (cfg.abas && st.aba){ var a = cfg.abas.find(function(x){ return x.id === st.aba; }); if (a && a.f && !a.f(r)) return false; }
        if (q && cfg.busca && cfg.busca(r).toLowerCase().indexOf(q) < 0) return false;
        for (var i = 0; i < (cfg.listas || []).length; i++){ var l = cfg.listas[i], v = st.listas[l.k]; if (v && String(l.get(r)) !== v) return false; }
        if (cfg.venc){ var dv = cfg.venc(r); if (vde && dv < vde) return false; if (vate && dv > vate) return false; }
        if (cfg.valor){ var vv = cfg.valor(r); if (min != null && vv < min) return false; if (max != null && vv > max) return false; }
        return true;
      });
    }
    function ordem(){ return (cfg.abas && st.ordAba[st.aba]) || st.ord; }
    function contarFx(){ var n = (st.vde || st.vate ? 1 : 0) + (st.min || st.max ? 1 : 0); var b = Q('[data-t=painel]'); if (b){ b.classList.toggle('tem', n > 0); var s = b.querySelector('.nf'); s.hidden = !n; s.textContent = n; } }
    function abas(){
      if (!cfg.abas || cfg.semBarra) return;
      var guarda = st.aba, cont = {};
      cfg.abas.forEach(function(a){ st.aba = a.id; cont[a.id] = filtrar().length; }); st.aba = guarda;
      Q('.abas').innerHTML = cfg.abas.map(function(a){ return '<button class="aba" role="tab" type="button" data-aba="' + a.id + '" aria-selected="' + (a.id === st.aba) + '">' + esc(a.rot) + '<span class="c' + (a.cor === 'r' && cont[a.id] ? ' r' : '') + '">' + cont[a.id] + '</span></button>'; }).join('');
    }
    function quadro(){
      var o = ordem(), lin = filtrar(), col = cfg.colunas.find(function(c){ return c.k === o.k; });
      if (col){ var f = col.ord || function(r){ return r[col.k]; }; lin.sort(function(a, b){ var x = f(a), y = f(b); if (x instanceof Date) x = +x; if (y instanceof Date) y = +y; return (x > y ? 1 : x < y ? -1 : 0) * o.dir; }); }
      var chave = cfg.chave || function(r){ return r.id; };
      Object.keys(st.sel).forEach(function(k){ if (!lin.some(function(r){ return chave(r) === k; })) delete st.sel[k]; });
      var titulo = typeof cfg.titulo === 'function' ? cfg.titulo(st.aba) : cfg.titulo;
      var soma = cfg.valor ? lin.reduce(function(s, r){ return s + (cfg.valor(r) || 0); }, 0) : null;
      var temLote = cfg.lote && cfg.lote.length;
      if (!lin.length){
        var filtrando = st.q || st.vde || st.vate || st.min || st.max || Object.keys(st.listas).some(function(k){ return st.listas[k]; });
        Q('[data-t=quadro]').innerHTML = '<div class="quadro">' + (titulo ? '<div class="quadro-hd"><h2>' + esc(titulo) + '</h2></div>' : '') + '<div class="vazio"><div class="vazio-ic">' + ic(filtrando ? 'busca' : 'ok') + '</div>'
          + (filtrando ? '<b>Nada encontrado</b><p>Nenhuma linha combina com a busca e os filtros escolhidos.</p><button class="bt bt-o" type="button" data-t="limpar">Limpar filtros</button>'
            : '<b>' + esc((cfg.vazio && cfg.vazio.tit) || 'Nada aqui por enquanto') + '</b><p>' + esc((cfg.vazio && cfg.vazio.frase) || '') + '</p>') + '</div></div>';
        return;
      }
      var marc = lin.filter(function(r){ return st.sel[chave(r)]; });
      var selec = temLote && marc.length ? '<div class="lote"><b>' + APP.plural(marc.length, 'selecionada', 'selecionadas') + '</b>' + (cfg.valor ? '<span>' + brl(marc.reduce(function(s, r){ return s + cfg.valor(r); }, 0)) + '</span>' : '')
        + '<button class="bt bt-g bt-mini" type="button" data-t="desmarcar">Desmarcar</button><div class="acoes">' + cfg.lote.map(function(a, i){ var n = marc.filter(function(r){ return !a.quando || a.quando(r); }).length;
          return '<button class="bt bt-o bt-mini" type="button" data-lote="' + i + '"' + (n ? '' : ' disabled') + '>' + ic(a.ic || 'check') + esc(a.rot) + (n !== marc.length ? ' (' + n + ')' : '') + '</button>'; }).join('') + '</div></div>' : '';
      var cols = cfg.colunas;
      Q('[data-t=quadro]').innerHTML = '<div class="quadro">' + (titulo ? '<div class="quadro-hd"><h2>' + esc(titulo) + '</h2><span class="resumo">' + APP.plural(lin.length, cfg.unidade ? cfg.unidade[0] : 'linha', cfg.unidade ? cfg.unidade[1] : 'linhas') + (soma != null ? ' · <b>' + brl(soma) + '</b>' : '') + '</span></div>' : '') + selec
        + '<div class="rola' + (cfg.livre ? ' livre' : '') + '"' + (cfg.altura ? ' style="max-height:' + cfg.altura + '"' : '') + '><table class="tab"' + (cfg.minLarg ? ' style="min-width:' + cfg.minLarg + '"' : '') + '><thead><tr>'
        + (temLote ? '<th class="ck"><input type="checkbox" data-t="todas" aria-label="Marcar todas" ' + (marc.length && marc.length === lin.length ? 'checked' : '') + '></th>' : '')
        + cols.map(function(c){ var podeOrd = c.ord !== false; return '<th class="' + (podeOrd ? 'ord ' : '') + (c.cls || '') + '"' + (podeOrd ? ' data-ord="' + c.k + '" title="Ordenar"' : '') + (o.k === c.k ? ' data-dir="' + o.dir + '"' : '') + '>' + esc(c.rot) + '</th>'; }).join('')
        + '</tr></thead><tbody>' + lin.map(function(r){ var k = chave(r);
          return '<tr class="' + (cfg.clique ? 'cl' : '') + (st.sel[k] ? ' sel' : '') + '"' + (cfg.clique ? ' tabindex="0"' : '') + ' data-k="' + esc(k) + '">' + (temLote ? '<td class="ck"><input type="checkbox" data-t="um" aria-label="Marcar" ' + (st.sel[k] ? 'checked' : '') + '></td>' : '')
            + cols.map(function(c){ return '<td' + (c.cls ? ' class="' + c.cls + (c.clsR ? c.clsR(r) : '') + '"' : (c.clsR ? ' class="' + c.clsR(r) + '"' : '')) + '>' + c.html(r) + '</td>'; }).join('') + '</tr>'; }).join('')
        + '</tbody>' + (soma != null && lin.length > 1 ? '<tfoot><tr>' + (temLote ? '<td></td>' : '') + cols.map(function(c, i){ return c.soma ? '<td class="dir val">' + brl(soma) + '<small style="display:block;font-weight:500;color:var(--text3)">média ' + brl(soma / lin.length) + '</small></td>' : '<td>' + (i === 0 ? 'Total de ' + lin.length : '') + '</td>'; }).join('') + '</tr></tfoot>' : '')
        + '</table></div></div>';
    }
    function tudo(){ abas(); quadro(); contarFx(); }
    el._redesenhar = tudo;
    tudo();
    // eventos (um por tabela)
    if (!el._ligado){
      el._ligado = true;
      el.addEventListener('input', function(e){
        var t = e.target.dataset.t, cfg2 = el._cfg, s2 = EST[cfg2.id];
        if (t === 'q') s2.q = e.target.value; else if (t === 'l') s2.listas[e.target.dataset.k] = e.target.value;
        else if (t === 'vde' || t === 'vate' || t === 'min' || t === 'max') s2[t] = e.target.value; else return;
        el._redesenhar();
      });
      el.addEventListener('click', function(e){
        var cfg2 = el._cfg, s2 = EST[cfg2.id], t = e.target.closest('[data-t]'), tt = t && t.dataset.t;
        if (tt === 'painel'){ s2.painel = !s2.painel; el.querySelector('[data-t=pn]').hidden = !s2.painel; t.setAttribute('aria-expanded', s2.painel); return; }
        if (tt === 'limpar'){ s2.q = ''; s2.listas = {}; s2.vde = s2.vate = s2.min = s2.max = ''; APP.tabela(el, cfg2); return; }
        if (tt === 'dens'){ var on = !document.documentElement.classList.contains('compacto'); document.documentElement.classList.toggle('compacto', on); APP.pref('compacto', on); APP.redesenhar(); APP.aviso(on ? 'Tabelas compactas: mais linhas na tela.' : 'Tabelas confortáveis.'); return; }
        if (tt === 'salvos') return menuSalvos(t, el, cfg2);
        if (tt === 'desmarcar'){ s2.sel = {}; el._redesenhar(); return; }
        if (tt === 'todas'){ var lin = []; el.querySelectorAll('tbody tr').forEach(function(tr){ lin.push(tr.dataset.k); }); var marcar = t.checked; s2.sel = {}; if (marcar) lin.forEach(function(k){ s2.sel[k] = true; }); el._redesenhar(); return; }
        if (tt === 'um'){ var k = t.closest('tr').dataset.k; if (t.checked) s2.sel[k] = true; else delete s2.sel[k]; el._redesenhar(); return; }
        var ab = e.target.closest('[data-aba]'); if (ab){ s2.aba = ab.dataset.aba; s2.sel = {}; el._redesenhar(); return; }
        var th = e.target.closest('th[data-ord]'); if (th){ var o = (cfg2.abas && (s2.ordAba[s2.aba] = s2.ordAba[s2.aba] || Object.assign({}, (cfg2.ordAbas && cfg2.ordAbas[s2.aba]) || s2.ord))) || s2.ord;
          if (o.k === th.dataset.ord) o.dir = -o.dir; else { o.k = th.dataset.ord; o.dir = 1; } el._redesenhar(); return; }
        var lt = e.target.closest('[data-lote]'); if (lt){ var a = cfg2.lote[+lt.dataset.lote], chave = cfg2.chave || function(r){ return r.id; };
          var marc = cfg2.linhas.filter(function(r){ return s2.sel[chave(r)] && (!a.quando || a.quando(r)); }); Promise.resolve(a.fn(marc)).then(function(feito){ if (feito !== false){ s2.sel = {}; } }); return; }
        if (e.target.closest('button, a, input, select, label')) return;
        var tr = e.target.closest('tbody tr[data-k]'); if (tr && cfg2.clique){ var r = cfg2.linhas.find(function(x){ return String((cfg2.chave || function(y){ return y.id; })(x)) === tr.dataset.k; }); if (r) cfg2.clique(r); }
      });
    }
    // estado inicial das abas: ordem própria por aba
    if (cfg.ordAbas && cfg.abas){ cfg.abas.forEach(function(a){ if (!st.ordAba[a.id] && cfg.ordAbas[a.id]) st.ordAba[a.id] = Object.assign({}, cfg.ordAbas[a.id]); }); el._redesenhar(); }
    return { st:st, redesenhar:el._redesenhar };
  };
  APP.marcadas = function(id){ return Object.keys((EST[id] || {}).sel || {}); };

  // F2: filtros salvos (por tabela)
  function menuSalvos(bt, el, cfg){
    fecharMenus();
    var L = (APP.D.filtrosSalvos[cfg.id] = APP.D.filtrosSalvos[cfg.id] || []);
    var m = document.createElement('div'); m.className = 'menu'; m.style.right = '0'; m.style.top = '38px';
    m.innerHTML = '<div class="tit">Filtros salvos</div>' + (L.length ? L.map(function(f, i){ return '<button type="button" data-usar="' + i + '">' + ic('estrela') + esc(f.nome) + '<span class="x" data-apagar="' + i + '" title="Apagar">×</span></button>'; }).join('') : '<button type="button" disabled style="color:var(--text3)">Nenhum ainda</button>')
      + '<div class="sep"></div><button type="button" data-salvar>' + ic('mais') + 'Salvar os filtros de agora…</button>';
    bt.parentNode.appendChild(m);
    m.onclick = function(e){
      e.stopPropagation();
      var ap = e.target.closest('[data-apagar]'); if (ap){ var f = L.splice(+ap.dataset.apagar, 1)[0]; fecharMenus(); APP.salvar(); APP.aviso('Filtro "' + f.nome + '" apagado.', function(){ L.push(f); }); return; }
      var u = e.target.closest('[data-usar]'); if (u){ var s = EST[cfg.id], f2 = L[+u.dataset.usar].st; s.q = f2.q || ''; s.listas = Object.assign({}, f2.listas || {}); s.vde = f2.vde || ''; s.vate = f2.vate || ''; s.min = f2.min != null ? String(f2.min) : ''; s.max = f2.max != null ? String(f2.max) : ''; if (f2.aba) s.aba = f2.aba; s.painel = !!(s.vde || s.vate || s.min || s.max); fecharMenus(); APP.tabela(el, cfg); APP.aviso('Filtro aplicado: ' + L[+u.dataset.usar].nome); return; }
      if (e.target.closest('[data-salvar]')){ fecharMenus();
        var J = APP.janela({ kick:'Filtros salvos', tit:'Salvar os filtros de agora', corpo:'<div class="campo"><label for="fs-nome">Nome</label><input class="ctl" id="fs-nome" placeholder="Ex.: Horizonte · em atraso · acima de R$ 1.000"></div><span class="ajuda" style="color:var(--text3);font-size:12px">Guarda a aba, a busca, as listas, o vencimento e o valor escolhidos. Vale só para esta tabela.</span>',
          rodape:'<button class="bt bt-o" type="button" data-fechar>Cancelar</button><button class="bt bt-p" type="button" id="fs-ok">' + ic('check') + 'Salvar</button>' });
        J.q('#fs-ok').onclick = function(){ var nome = J.q('#fs-nome').value.trim(); if (!nome) return J.q('#fs-nome').focus(); var s = EST[cfg.id];
          L.push({ nome:nome, st:{ aba:s.aba, q:s.q, listas:Object.assign({}, s.listas), vde:s.vde, vate:s.vate, min:s.min, max:s.max } }); J.fechar(); APP.salvar(); APP.aviso('Filtro "' + nome + '" salvo. Ele aparece em "Salvos".'); };
      }
    };
  }
  function fecharMenus(){ document.querySelectorAll('.menu').forEach(function(m){ m.remove(); }); }
  document.addEventListener('click', function(e){ if (!e.target.closest('.menu') && !e.target.closest('[data-t=salvos]')) fecharMenus(); });

  /* ── F1: busca geral (Ctrl+K) ── */
  APP.abrirBusca = function(){
    if (document.querySelector('.paleta')) return;
    var p = document.createElement('div'); p.className = 'paleta';
    p.innerHTML = '<div class="paleta-box" role="dialog" aria-modal="true" aria-label="Buscar"><div class="paleta-in">' + ic('busca') + '<input id="pal-q" placeholder="Cliente, CNPJ, nº do parcelamento, tela ou ação…" autocomplete="off"></div><div class="paleta-res" id="pal-res"></div>'
      + '<div class="paleta-pe"><span>↑ ↓ para escolher</span><span>Enter abre</span><span>Esc fecha</span></div></div>';
    document.body.appendChild(p);
    var inp = p.querySelector('#pal-q'), res = p.querySelector('#pal-res'), itens = [], foco = 0;
    function norm(s){ return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.\-\/]/g, ''); }
    function desenhar(){
      var q = norm(inp.value.trim()), idx = APP.indice();
      itens = idx.filter(function(x){ return !q || norm(x.rot + ' ' + (x.sub || '') + ' ' + (x.extra || '')).indexOf(q) >= 0; }).slice(0, 40);
      foco = Math.min(foco, Math.max(0, itens.length - 1));
      var grp = '';
      res.innerHTML = itens.length ? itens.map(function(x, i){ var h = x.grupo !== grp ? '<div class="grp">' + esc(x.grupo) + '</div>' : ''; grp = x.grupo;
        return h + '<button type="button" data-i="' + i + '" class="' + (i === foco ? 'foco' : '') + '">' + ic(x.ic || 'busca') + '<span>' + esc(x.rot) + '</span><small>' + esc(x.sub || '') + '</small></button>'; }).join('') : '<div class="vazio"><b>Nada encontrado</b><p>Tente o nome, o CNPJ (só números servem) ou o número do parcelamento.</p></div>';
    }
    function fechar(){ p.remove(); }
    function abrir(i){ var x = itens[i]; if (!x) return; fechar(); x.fn(); }
    inp.addEventListener('input', function(){ foco = 0; desenhar(); });
    inp.addEventListener('keydown', function(e){
      if (e.key === 'ArrowDown'){ foco = Math.min(foco + 1, itens.length - 1); desenhar(); e.preventDefault(); }
      else if (e.key === 'ArrowUp'){ foco = Math.max(foco - 1, 0); desenhar(); e.preventDefault(); }
      else if (e.key === 'Enter'){ abrir(foco); e.preventDefault(); }
      else if (e.key === 'Escape') fechar();
    });
    p.addEventListener('click', function(e){ if (e.target === p) return fechar(); var b = e.target.closest('[data-i]'); if (b) abrir(+b.dataset.i); });
    desenhar(); inp.focus();
  };

  /* ── ajuda da tela ("?") ── */
  APP.abrirAjuda = function(){
    var t = APP.telas[APP.atual], g = document.querySelector('.ajuda-gaveta');
    if (g){ g.remove(); return; }
    g = document.createElement('aside'); g.className = 'ajuda-gaveta'; g.setAttribute('aria-label', 'Ajuda');
    g.innerHTML = '<div class="j-hd"><div><span class="kick">Ajuda desta tela</span><b>' + esc(t.tit) + '</b></div><div class="dir-hd"><button class="fechar" type="button" aria-label="Fechar">' + ic('x') + '</button></div></div>'
      + '<div class="j-bd"><ul>' + (t.ajuda || []).map(function(a){ return '<li>' + a + '</li>'; }).join('') + '</ul>'
      + '<div class="texto" style="padding:12px 14px"><h3>Atalhos</h3><p><b>Ctrl+K</b> ou <b>/</b> busca qualquer coisa · <b>N</b> cria um novo item nesta tela · <b>Esc</b> fecha a janela · <b>?</b> abre esta ajuda.</p></div></div>';
    document.body.appendChild(g);
    g.querySelector('.fechar').onclick = function(){ g.remove(); };
  };

  /* ── navegação ── */
  APP.registrar = function(id, t){ APP.telas[id] = t; APP.ordem.push(id); };
  APP.ir = function(id, arg){
    APP.atual = id; APP.arg = arg || null; APP.pref('tela', id);
    document.querySelectorAll('.lado .item').forEach(function(b){ b.classList.toggle('on', b.dataset.ir === id); });
    $('onde').textContent = APP.telas[id].tit; document.title = 'Ambiente de Teste ERP';
    var g = document.querySelector('.ajuda-gaveta'); if (g) g.remove();
    document.querySelector('.lado').classList.remove('aberto');
    APP.redesenhar(); window.scrollTo(0, 0);
  };
  APP.redesenhar = function(){ var el = $('corpo'), t = APP.telas[APP.atual]; if (!t) return; t.desenhar(el, APP.arg); APP.contadores(); };
  APP.contadores = function(){
    var c = { inicio:APP.D.tarefas.filter(function(t){ return !t.feita && t.prazo <= HOJE; }).length, admin:APP.D.emails.filter(function(e){ return e.status === 'revisar'; }).length };
    document.querySelectorAll('.lado .item').forEach(function(b){ var n = c[b.dataset.ir], s = b.querySelector('.n'); if (s) s.remove(); if (n) b.insertAdjacentHTML('beforeend', '<span class="n">' + n + '</span>'); });
  };
  // atalhos de teclado
  document.addEventListener('keydown', function(e){
    var digitando = /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || '')) || e.target.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'){ e.preventDefault(); APP.abrirBusca(); return; }
    if (e.key === 'Escape'){ var pal = document.querySelector('.paleta'); if (pal){ pal.remove(); return; } if (pilha.length){ pilha[pilha.length - 1].fechar(); return; } var g = document.querySelector('.ajuda-gaveta'); if (g) g.remove(); return; }
    if (digitando || document.querySelector('.paleta') || pilha.length) return;
    if (e.key === '/'){ e.preventDefault(); APP.abrirBusca(); }
    else if (e.key === '?'){ APP.abrirAjuda(); }
    else if (e.key.toLowerCase() === 'n'){ var t = APP.telas[APP.atual]; if (t && t.novo){ e.preventDefault(); t.novo(); } }
    else if (e.key === 'Enter' && e.target.matches && e.target.matches('tr.cl')) e.target.click();
  });
})();
