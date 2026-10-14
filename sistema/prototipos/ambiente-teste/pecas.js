/* Peças comuns do ambiente de teste (versão 2) — as mesmas vão para o ERP de verdade (nucleo.js/base.css).
   Toda tela usa SÓ estas peças: cabeçalho, faixa de avisos, tabela (desenho de Acordos: A pagar/Pago, atalhos de prazo,
   Filtros, ordenar, total, "Marcar várias"), cartões por grupo, janela no centro, confirmar, ação com Desfazer,
   gráficos simples, busca geral (Ctrl+K), ajuda (?) e os textos "antes → depois" (para aprovar). SEM cartões de número no topo. */
(function(){
  var APP = window.APP = { telas:{}, ordem:[], atual:null, arg:null, modo:'equipe' };
  var DIA = DADOS.DIA, HOJE = DADOS.HOJE;

  /* ── utilidades ── */
  var $ = APP.$ = function(id){ return document.getElementById(id); };
  var esc = APP.esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
  var brl = APP.brl = function(v){ return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 }); };
  APP.brlK = function(v){ v = Number(v) || 0; var a = Math.abs(v); return a >= 1e6 ? 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits:2 }) + ' mi' : a >= 1e4 ? 'R$ ' + Math.round(v / 1e3).toLocaleString('pt-BR') + ' mil' : brl(v); };
  var d2 = function(n){ return String(n).padStart(2, '0'); };
  APP.fd = function(d){ return d ? d2(d.getDate()) + '/' + d2(d.getMonth() + 1) + '/' + d.getFullYear() : '—'; };
  APP.fc = function(d){ return d ? d2(d.getDate()) + '/' + d2(d.getMonth() + 1) : '—'; };
  APP.fh = function(d){ return d ? d2(d.getHours()) + ':' + d2(d.getMinutes()) : ''; };
  APP.iso = function(d){ return d.getFullYear() + '-' + d2(d.getMonth() + 1) + '-' + d2(d.getDate()); };
  APP.deIso = function(v){ if (!v) return null; var a = String(v).split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); };
  // Backup 79: datas digitadas dd/mm/aaaa (máscara ao digitar; 31/11 vira 30/11; incompleta = '')
  APP.mascData = function(v){ var d = String(v || '').replace(/\D/g, '').slice(0, 8); return d.length > 4 ? d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4) : d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d; };
  APP.isoBR = function(v){ var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v || '').trim()); if (!m || +m[2] < 1 || +m[2] > 12) return ''; var ult = new Date(+m[3], +m[2], 0).getDate(); return m[3] + '-' + m[2] + '-' + String(Math.min(Math.max(+m[1], 1), ult)).padStart(2, '0'); };
  APP.campoData = function(attrs, iso, rot){ return '<input class="ctl in-data" type="text" inputmode="numeric" placeholder="dd/mm/aaaa" maxlength="10" data-mdata ' + attrs + ' aria-label="' + esc(rot || 'Data') + '" value="' + (iso ? APP.fd(APP.deIso(iso)) : '') + '">'; };
  document.addEventListener('input', function(e){ if (e.target.matches && e.target.matches('[data-mdata]')){ var v = APP.mascData(e.target.value); if (v !== e.target.value) e.target.value = v; } }, true);
  APP.deBR = function(v){ var m = String(v || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };
  APP.num = function(v){ v = String(v == null ? '' : v).replace(/[^\d,.-]/g, ''); if (v === '') return null; if (v.indexOf(',') >= 0) v = v.replace(/\./g, '').replace(',', '.'); return Number(v); };
  APP.plural = function(n, um, varios){ return n + ' ' + (n === 1 ? um : varios); };
  APP.dias = function(d){ return Math.round((HOJE - d) / DIA); };   // > 0 = já passou
  APP.doMes = function(d, ref){ ref = ref || HOJE; return !!d && d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear(); };
  APP.MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  APP.mesCurto = function(d){ return APP.MESES[d.getMonth()].slice(0, 3) + '/' + String(d.getFullYear()).slice(2); };
  APP.soma = function(l, f){ return l.reduce(function(s, x){ return s + (f ? f(x) : x) ; }, 0); };
  APP.cli = function(id){ return APP.D.clientes.find(function(c){ return c.id === id; }) || { nome:'?', doc:'', g:null, passivo:{} }; };
  APP.grupo = function(id){ return APP.D.grupos.find(function(g){ return g.id === id; }) || { nome:'Sem grupo', cor:7 }; };
  APP.pessoa = function(id){ return APP.D.equipe.find(function(p){ return p.id === id; }) || { nome:id || '—', curto:id || '—' }; };
  APP.curto = function(c){ return c.nome.split(' ').slice(0, 2).join(' '); };
  APP.grupoTxt = function(gid){ var g = APP.grupo(gid); return '<span class="g-txt">' + esc(g.nome) + '</span>'; };   // Backup 78: sem a bolinha de cor do grupo (X4)
  APP.empresa = function(c){ return '<span class="nome">' + esc(c.nome) + '</span><span class="doc">' + esc(c.doc) + '</span>'; };
  APP.pessoaTxt = function(id){ var p = APP.pessoa(id); return '<span class="selo-p">' + esc(p.curto) + '</span>'; };

  /* ── ícones de traço fino (nenhum emoji no sistema) ── */
  var ICONES = {
    inicio:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    camadas:'<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>', dinheiro:'<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
    pessoas:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
    rotina:'<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    admin:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    alerta:'<path d="M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>', doc:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    ok:'<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 5-5"/>', check:'<path d="M20 6 9 17l-5-5"/>', busca:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    mais:'<path d="M12 5v14M5 12h14"/>', x:'<path d="M18 6 6 18M6 6l12 12"/>', voltar:'<path d="M15 18l-6-6 6-6"/>', seta:'<path d="m9 18 6-6-6-6"/>',
    lua:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>', ajuda:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14m0 3h.01"/>',
    email:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>', relogio:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    tarefa:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 12 3 3 5-6"/>', clipe:'<path d="M21 11.5 12.5 20a5 5 0 0 1-7-7L14 4.5a3.3 3.3 0 0 1 4.7 4.7L10.2 17.7a1.7 1.7 0 0 1-2.4-2.4L15.5 7.6"/>',
    compacto:'<path d="M4 5h16M4 9.5h16M4 14h16M4 18.5h16"/>', filtro:'<path d="M3 5h18l-7 8v6l-4 2v-8z"/>', importar:'<path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3"/>',
    teste:'<path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.8-2.5L14 9V3"/>', escudo:'<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>', menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    grafico:'<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-7"/>', balanca:'<path d="M12 3v18M5 7h14M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0zM8 21h8"/>',
    alvo:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>', pasta:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    martelo:'<path d="m14 13-7.5 7.5a2.1 2.1 0 0 1-3-3L11 10M15 3l6 6M12 6l6 6M9 9l6-6 6 6-6 6z"/>', jornal:'<path d="M4 4h13v16H6a2 2 0 0 1-2-2zM17 8h3v10a2 2 0 0 1-2 2"/><path d="M8 8h5M8 12h5M8 16h3"/>',
    contrato:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 15c1.5-2 3-2 4 0s2.5 1 3-1"/>',
    portal:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 14h4"/>', enviar:'<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    olho:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', texto:'<path d="M4 7V5h16v2M9 19h6M12 5v14"/>', estrela:'<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    lixo:'<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>', lapis:'<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>', saida:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'
  };
  var ic = APP.ic = function(k){ return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + (ICONES[k] || '') + '</svg>'; };

  /* ── preferências de cada pessoa (neste navegador) ── */
  var PREF = 'erp-ambiente-teste-prefs', prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(PREF) || '{}') || {}; } catch (e) { prefs = {}; }
  APP.pref = function(k, v){ if (arguments.length < 2) return prefs[k]; prefs[k] = v; try { localStorage.setItem(PREF, JSON.stringify(prefs)); } catch (e) {} };

  /* ── textos "antes → depois" (para o usuário aprovar): T('chave') devolve o texto novo; com "Ver textos antigos" ligado, o antigo marcado ── */
  APP.T = function(k){
    var t = (window.TEXTOS || {})[k]; if (!t) return k;
    if (APP.pref('textosAntigos') && t.antigo) return '<mark class="tx-antigo" title="Texto novo: ' + esc(t.novo) + '">' + esc(t.antigo) + '</mark>';
    return esc(t.novo);
  };

  /* ── gravar + avisar + desfazer (todo gravar, editar e excluir tem "Desfazer") ── */
  APP.salvar = function(){ DADOS.salvar(APP.D); APP.contadores(); };
  APP.aviso = function(txt, desfazer, prazo){
    var box = $('avisos'), el = document.createElement('div');
    el.className = 'aviso-tx'; el.setAttribute('role', 'status');
    el.innerHTML = '<span>' + esc(txt) + '</span>' + (desfazer ? '<button type="button">Desfazer</button>' : '');
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    var t = setTimeout(function(){ el.remove(); }, prazo || (desfazer ? 7000 : 3500));
    if (desfazer) el.querySelector('button').onclick = function(){ clearTimeout(t); el.remove(); desfazer(); APP.salvar(); APP.redesenhar(); APP.aviso('Desfeito.'); };
  };
  APP.acao = function(texto, fazer){ var volta = fazer(); APP.salvar(); APP.redesenhar(); APP.aviso(texto, typeof volta === 'function' ? volta : null); };
  APP.foto = function(obj, campos){ var c = {}; campos.forEach(function(k){ c[k] = obj[k]; }); return function(){ campos.forEach(function(k){ obj[k] = c[k]; }); }; };

  /* ── janela no centro (criar, editar, detalhe) — pode empilhar ── */
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
    setTimeout(function(){ var x = f.querySelector('.j-bd input:not([type=checkbox]):not([type=radio]), .j-bd select, .j-bd textarea') || f.querySelector('.fechar'); if (x) x.focus(); }, 30);
    return J;
  };
  APP.fecharTodas = function(){ while (pilha.length) pilha[pilha.length - 1].fechar(); };
  APP.opcoes = function(nome, itens, sel){ return '<div class="opcoes" role="group" aria-label="' + esc(nome) + '">' + itens.map(function(t){ return '<button type="button" aria-pressed="' + (t === sel) + '">' + esc(t) + '</button>'; }).join('') + '</div>'; };
  APP.opcaoDe = function(J, nome){ var b = J.q('.opcoes[aria-label="' + nome + '"] [aria-pressed="true"]'); return b ? b.textContent : ''; };
  APP.campo = function(rot, html, ajuda){ return '<div class="campo"><label>' + esc(rot) + '</label>' + html + (ajuda ? '<span class="ajuda">' + ajuda + '</span>' : '') + '</div>'; };

  // confirmação dentro da página (todo pagamento, envio e exclusão passa por aqui)
  APP.confirmar = function(o){
    return new Promise(function(ok){
      var feito = false;
      var J = APP.janela({ kick:o.kick || 'Confirmar', tit:o.tit, sub:o.sub,
        corpo:(o.resumo ? '<div class="conf-resumo">' + o.resumo + '</div>' : '') + (o.data ? '<div class="campo"><label for="cf-data">' + esc(o.data) + '</label><input class="ctl" id="cf-data" type="date" value="' + APP.iso(HOJE) + '"><span class="ajuda">' + APP.T('baixa.ajuda') + '</span></div>' : '') + (o.extra || ''),
        rodape:'<button class="bt bt-o" type="button" data-nao>Cancelar</button><button class="bt ' + (o.perigo ? 'bt-perigo' : 'bt-p') + '" type="button" data-sim>' + ic('check') + esc(o.ok || 'Confirmar') + '</button>' });
      J.aoFechar = function(){ if (!feito){ feito = true; ok(null); } };
      J.q('[data-nao]').onclick = function(){ J.fechar(); };
      J.q('[data-sim]').onclick = function(){ feito = true; var v = o.data ? APP.deIso(J.q('#cf-data').value) || HOJE : true; var extra = o.ler ? o.ler(J) : null; J.fechar(); ok(o.ler ? { data:v, extra:extra } : v); };
    });
  };

  /* ── cabeçalho da tela (ícone + título + frase curta + ações à direita) ── */
  APP.cabecalho = function(o){
    return '<div class="cab"><div class="cab-ic">' + ic(o.ic) + '</div><div class="cab-tx"><h1>' + esc(o.tit) + '</h1>' + (o.frase ? '<p>' + o.frase + '</p>' : '') + '</div>'
      + '<div class="cab-acoes">' + (o.acoes || '') + '</div></div>';
  };

  /* ── faixa de avisos (no lugar dos cartões do topo): uma linha, cada item leva ao lugar certo ── */
  APP.faixa = function(itens, rot){
    itens = itens.filter(Boolean);
    if (!itens.length) return '<div class="faixa ok">' + ic('ok') + '<span>Nada pendente aqui. Tudo em dia.</span></div>';
    return '<div class="faixa" role="list">' + (rot ? '<span class="faixa-rot">' + esc(rot) + '</span>' : '') + itens.map(function(x, i){
      return '<button type="button" role="listitem" class="fx fx-' + (x.cor || 'b') + '" data-fx="' + i + '"' + (x.dica ? ' title="' + esc(x.dica) + '"' : '') + '><span class="fx-p"></span>' + x.txt + '</button>'; }).join('') + '</div>';
  };
  APP.ligarFaixa = function(el, itens){
    itens = itens.filter(Boolean);
    el.querySelectorAll('[data-fx]').forEach(function(b){ b.onclick = function(){ var x = itens[+b.dataset.fx]; if (x.fn) x.fn(); else if (x.ir) APP.ir(x.ir, x.arg); }; });
  };

  /* ── prazo colorido (vermelho = em atraso, inclui hoje; âmbar < 3 dias; azul < 10; verde) ── */
  APP.celPrazo = function(venc, pago, extra){
    if (pago) return '<span class="ok-txt">✓ ' + (pago instanceof Date ? 'Pago em ' + APP.fc(pago) : 'Pago') + '</span>';
    if (!venc) return '—';
    var d = -APP.dias(venc), cls = d <= 0 ? 'pz-r' : d < 3 ? 'pz-a' : d < 10 ? 'pz-b' : 'pz-g';
    return '<span class="' + cls + '">' + (d < 0 ? -d + ' d atraso' : d === 0 ? 'vence hoje' : d + (d === 1 ? ' dia' : ' dias')) + '</span>' + (extra ? '<small class="pz-sub">' + extra + '</small>' : '');
  };
  APP.vencida = function(venc, pago){ return !pago && venc && venc <= HOJE ? ' tr-venc' : ''; };
  APP.btEmitir = function(attr, feito){ return '<button type="button" class="bt-emitir' + (feito ? ' feito' : '') + '" ' + attr + '>Emitir</button>'; };
  APP.btBaixa = function(attr, rot){ return '<button type="button" class="bt-baixa" ' + attr + '>' + esc(rot || 'Baixa') + '</button>'; };

  /* ── TABELA: toda tabela do sistema (desenho de Acordos) ──
     cfg: { id, titulo, colunas:[{k, rot, cls, clsR(r), html(r), ord(r)|false, soma}], linhas, abas:[{id, rot, f(r)}], abaPadrao, contagem,
            prazos (atalhos Todas·Vencidas·5·10·15·30·até), prazosAbas, busca(r), dicaBusca, conta(n, aba), listas:[{k, rot, todos, opcoes, get}],
            venc(r), valor(r), lote:[{rot, ic, quando(r), fn(lista)}], clique(r), chave(r), vazio:{tit, frase}, ord, ordAbas, linhaCls(r),
            altura, tabCls, minLarg, semBarra, extra (html à direita da barra) } */
  var EST = APP.estTab = {};
  APP.pend = {};   // tela aberta já filtrada (ex.: da faixa do Início): APP.preparar(id, {prazo, aba, q})
  APP.preparar = function(id, arg){ if (arg) APP.pend[id] = arg; };
  APP.tabela = function(el, cfg){
    var st = EST[cfg.id] = EST[cfg.id] || { aba:(cfg.abas && (cfg.abaPadrao || cfg.abas[0].id)) || '', q:'', listas:{}, vde:'', vate:'', min:'', max:'', ord:Object.assign({}, cfg.ord || { k:'', dir:1 }), ordAba:{}, sel:{}, painel:false, prazo:'', prazoAte:'', lim:150, lote:false };
    if (cfg.ordAbas) Object.keys(cfg.ordAbas).forEach(function(a){ if (!st.ordAba[a]) st.ordAba[a] = Object.assign({}, cfg.ordAbas[a]); });
    var pend = APP.pend[cfg.id]; if (pend){ if (pend.prazo != null) st.prazo = pend.prazo; if (pend.aba) st.aba = pend.aba; if (pend.q != null) st.q = pend.q; st.lim = 150; delete APP.pend[cfg.id]; }
    el._cfg = cfg;
    var temPainel = !!(cfg.venc || cfg.valor || (cfg.listas || []).length);
    var chave = cfg.chave || function(r){ return r.id; };
    if (!cfg.semBarra){
      el.innerHTML = '<div class="barra-tab">' + (cfg.abas ? '<div class="seg" role="tablist"></div>' : '') + (cfg.prazos ? '<div class="prazos" data-t="prazos"></div>' : '')
        + (cfg.busca ? '<label class="ctl-busca">' + ic('busca') + '<input data-t="q" placeholder="' + esc(cfg.dicaBusca || 'Buscar') + '" aria-label="Buscar" value="' + esc(st.q) + '"></label>' : '')
        + '<span class="conta" data-t="conta"></span><span class="barra-dir">' + (cfg.extra || '')
        + (cfg.lote && cfg.lote.length ? '<button class="bt-f" type="button" data-t="loteon" aria-pressed="' + st.lote + '" title="Marcar várias linhas para agir de uma vez">' + ic('check') + (st.lote ? 'Fechar marcação' : 'Marcar várias') + '</button>' : '')
        + (temPainel ? '<button class="bt-f" type="button" data-t="painel" aria-expanded="' + st.painel + '">' + ic('filtro') + 'Filtros <span class="nf" hidden></span></button>' : '')
        + '<button class="ic-bt" type="button" data-t="dens" aria-pressed="' + document.documentElement.classList.contains('compacto') + '" title="Tabela compacta (mais linhas na tela)">' + ic('compacto') + '</button></span></div>'
        + (temPainel ? '<div class="mais-filtros" data-t="pn"' + (st.painel ? '' : ' hidden') + '>'
          + (cfg.listas || []).map(function(l){ return '<div class="campo"><span class="rot">' + esc(l.rot) + '</span><select class="ctl" data-t="l" data-k="' + l.k + '" aria-label="' + esc(l.rot) + '"><option value="">' + esc(l.todos) + '</option>' + l.opcoes.map(function(o){ return '<option value="' + esc(o[0]) + '"' + (st.listas[l.k] === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></div>'; }).join('')
          + (cfg.venc ? '<div class="campo"><span class="rot">Vencimento</span><div class="par">' + APP.campoData('data-t="vde"', st.vde, 'Vencimento de') + '<span>até</span>' + APP.campoData('data-t="vate"', st.vate, 'Vencimento até') + '</div></div>' : '')
          + (cfg.valor ? '<div class="campo"><span class="rot">Valor (R$)</span><div class="par"><input class="ctl" inputmode="decimal" data-t="min" placeholder="de" aria-label="Valor mínimo" style="width:110px" value="' + esc(st.min) + '"><span>até</span><input class="ctl" inputmode="decimal" data-t="max" placeholder="até" aria-label="Valor máximo" style="width:110px" value="' + esc(st.max) + '"></div></div>' : '')
          + '<button class="bt bt-g" type="button" data-t="limpar">Limpar filtros</button></div>' : '')
        + '<div data-t="quadro"></div>';
    } else el.innerHTML = '<div data-t="quadro"></div>';
    var Q = function(s){ return el.querySelector(s); };
    function prazoNaAba(){ return !cfg.prazosAbas || cfg.prazosAbas.indexOf(st.aba) >= 0; }
    function filtrar(semAba){
      var vde = APP.deIso(st.vde), vate = APP.deIso(st.vate), min = APP.num(st.min), max = APP.num(st.max), q = norm(st.q.trim());
      return cfg.linhas.filter(function(r){
        if (!semAba && cfg.abas && st.aba){ var a = cfg.abas.find(function(x){ return x.id === st.aba; }); if (a && a.f && !a.f(r)) return false; }
        if (q && cfg.busca && norm(cfg.busca(r)).indexOf(q) < 0) return false;
        for (var i = 0; i < (cfg.listas || []).length; i++){ var l = cfg.listas[i], v = st.listas[l.k]; if (v && String(l.get(r)) !== v) return false; }
        if (cfg.venc){ var dv = cfg.venc(r); if (vde && (!dv || dv < vde)) return false; if (vate && (!dv || dv > vate)) return false;
          if (cfg.prazos && st.prazo && prazoNaAba()){ if (!dv) return false;
            if (st.prazo === 'venc' && dv > HOJE) return false;
            if (/^\d+$/.test(st.prazo) && dv > new Date(+HOJE + (+st.prazo) * DIA)) return false;
            if (st.prazo === 'ate' && st.prazoAte && dv > APP.deIso(st.prazoAte)) return false; } }
        if (cfg.valor){ var vv = cfg.valor(r); if (min != null && vv < min) return false; if (max != null && vv > max) return false; }
        return true;
      });
    }
    function ordem(){ return (cfg.abas && st.ordAba[st.aba]) || st.ord; }
    function filtrando(){ return st.q || st.vde || st.vate || st.min || st.max || (st.prazo && prazoNaAba()) || Object.keys(st.listas).some(function(k){ return st.listas[k]; }); }
    function contarFx(){ var n = (st.vde || st.vate ? 1 : 0) + (st.min || st.max ? 1 : 0) + Object.keys(st.listas).filter(function(k){ return st.listas[k]; }).length; var b = Q('[data-t=painel]'); if (b){ b.classList.toggle('tem', n > 0); var s = b.querySelector('.nf'); s.hidden = !n; s.textContent = n; } }
    function abas(){
      if (!cfg.abas || cfg.semBarra) return;
      var guarda = st.aba, cont = {};
      if (cfg.contagem) { cfg.abas.forEach(function(a){ st.aba = a.id; cont[a.id] = filtrar().length; }); st.aba = guarda; }
      Q('.seg').innerHTML = cfg.abas.map(function(a){ return '<button type="button" role="tab" class="seg-bt" data-aba="' + a.id + '" aria-selected="' + (a.id === st.aba) + '">' + esc(a.rot) + (cfg.contagem ? ' <span class="seg-n' + (a.cor === 'r' && cont[a.id] ? ' r' : '') + '">' + cont[a.id] + '</span>' : '') + '</button>'; }).join('');
    }
    function prazos(){
      var b = Q('[data-t=prazos]'); if (!b) return; b.hidden = !prazoNaAba();
      b.innerHTML = [['', 'Todas'], ['venc', 'Vencidas'], ['5', '5 dias'], ['10', '10 dias'], ['15', '15 dias'], ['30', '30 dias']].map(function(o){ return '<button type="button" class="chip" data-prazo="' + o[0] + '" aria-pressed="' + (st.prazo === o[0]) + '">' + o[1] + '</button>'; }).join('')
        + '<label class="prazo-ate' + (st.prazo === 'ate' ? ' on' : '') + '" title="Vencimento até esta data">até ' + APP.campoData('data-t="prazoate"', st.prazoAte, 'Vencimento até') + '</label>';
    }
    function conta(){ var c = Q('[data-t=conta]'); if (!c) return; var n = filtrar().length; c.textContent = cfg.conta ? cfg.conta(n, st.aba) : APP.plural(n, cfg.unidade ? cfg.unidade[0] : 'linha', cfg.unidade ? cfg.unidade[1] : 'linhas'); }
    function quadro(){
      var o = ordem(), lin = filtrar(), col = cfg.colunas.find(function(c){ return c.k === o.k; });
      if (col && col.ord !== false){ var f = col.ord || function(r){ return r[col.k]; }; lin.sort(function(a, b){ var x = f(a), y = f(b); if (x instanceof Date) x = +x; if (y instanceof Date) y = +y; if (x == null) x = ''; if (y == null) y = ''; return (x > y ? 1 : x < y ? -1 : 0) * o.dir; }); }
      Object.keys(st.sel).forEach(function(k){ if (!lin.some(function(r){ return String(chave(r)) === k; })) delete st.sel[k]; });
      var titulo = typeof cfg.titulo === 'function' ? cfg.titulo(st.aba) : cfg.titulo;
      var soma = cfg.valor ? lin.reduce(function(s, r){ return s + (cfg.valor(r) || 0); }, 0) : null;
      var temLote = cfg.lote && cfg.lote.length && st.lote;
      if (!lin.length){
        Q('[data-t=quadro]').innerHTML = '<div class="quadro">' + (titulo ? '<div class="quadro-hd"><h2>' + esc(titulo) + '</h2></div>' : '') + '<div class="vazio"><div class="vazio-ic">' + ic(filtrando() ? 'busca' : 'ok') + '</div>'
          + (filtrando() ? '<b>Nada encontrado</b><p>Nenhuma linha combina com a busca e os filtros.</p><button class="bt bt-o" type="button" data-t="limpar">Limpar filtros</button>'
            : '<b>' + esc((cfg.vazio && cfg.vazio.tit) || 'Nada aqui por enquanto') + '</b><p>' + esc((cfg.vazio && cfg.vazio.frase) || '') + '</p>') + '</div></div>';
        return;
      }
      var marc = lin.filter(function(r){ return st.sel[chave(r)]; });
      var selec = temLote ? '<div class="lote"><b>' + (marc.length ? APP.plural(marc.length, 'marcada', 'marcadas') : 'Marque as linhas') + '</b>' + (cfg.valor && marc.length ? '<span>' + brl(marc.reduce(function(s, r){ return s + cfg.valor(r); }, 0)) + '</span>' : '')
        + (marc.length ? '<button class="bt bt-g bt-mini" type="button" data-t="desmarcar">Desmarcar</button>' : '') + '<div class="acoes">' + cfg.lote.map(function(a, i){ var n = marc.filter(function(r){ return !a.quando || a.quando(r); }).length;
          return '<button class="bt bt-o bt-mini" type="button" data-lote="' + i + '"' + (n ? '' : ' disabled') + '>' + ic(a.ic || 'check') + esc(a.rot) + (n && n !== marc.length ? ' (' + n + ')' : '') + '</button>'; }).join('') + '</div></div>' : '';
      var cols = cfg.colunas;
      var cel = function(c, r){ var k = (c.cls || '') + (c.clsR ? c.clsR(r) : ''); return '<td' + (k ? ' class="' + k + '"' : '') + ' data-rot="' + esc(c.rot) + '">' + c.html(r) + '</td>'; };
      Q('[data-t=quadro]').innerHTML = '<div class="quadro">' + (titulo ? '<div class="quadro-hd"><h2>' + esc(titulo) + '</h2><span class="resumo">' + APP.plural(lin.length, cfg.unidade ? cfg.unidade[0] : 'linha', cfg.unidade ? cfg.unidade[1] : 'linhas') + (soma != null ? ' · <b>' + brl(soma) + '</b>' : '') + '</span></div>' : '') + selec
        + '<div class="rola"' + (cfg.altura ? ' style="max-height:' + cfg.altura + '"' : '') + '><table class="tab' + (cfg.tabCls ? ' ' + cfg.tabCls : '') + '"' + (cfg.minLarg ? ' style="min-width:' + cfg.minLarg + '"' : '') + '><thead><tr>'
        + (temLote ? '<th class="ck"><input type="checkbox" data-t="todas" aria-label="Marcar todas" ' + (marc.length && marc.length === lin.length ? 'checked' : '') + '></th>' : '')
        + cols.map(function(c){ var pode = c.ord !== false; return '<th class="' + (pode ? 'ord ' : '') + (c.cls || '') + '"' + (pode ? ' data-ord="' + c.k + '" title="Ordenar"' : '') + (o.k === c.k ? ' data-dir="' + o.dir + '" aria-sort="' + (o.dir > 0 ? 'ascending' : 'descending') + '"' : '') + '>' + esc(c.rot) + '</th>'; }).join('')
        + '</tr></thead><tbody>' + lin.slice(0, st.lim).map(function(r){ var k = chave(r);
          return '<tr class="' + (cfg.clique ? 'cl' : '') + (st.sel[k] ? ' sel' : '') + (cfg.linhaCls ? cfg.linhaCls(r) : '') + '"' + (cfg.clique ? ' tabindex="0"' : '') + ' data-k="' + esc(k) + '">' + (temLote ? '<td class="ck"><input type="checkbox" data-t="um" aria-label="Marcar" ' + (st.sel[k] ? 'checked' : '') + '></td>' : '')
            + cols.map(function(c){ return cel(c, r); }).join('') + '</tr>'; }).join('')
        + (lin.length > st.lim ? '<tr class="tr-mais"><td colspan="' + (cols.length + (temLote ? 1 : 0)) + '"><button class="bt bt-g bt-mini" type="button" data-t="mais">Mostrar mais ' + Math.min(150, lin.length - st.lim) + ' (' + lin.length + ' no total)</button></td></tr>' : '')
        + '</tbody>' + (soma != null && lin.length > 1 ? '<tfoot><tr>' + (temLote ? '<td></td>' : '') + cols.map(function(c, i){ return c.soma ? '<td class="dir val">' + brl(soma) + '<small>média ' + brl(soma / lin.length) + '</small></td>' : '<td>' + (i === 0 ? 'Total de ' + lin.length : '') + '</td>'; }).join('') + '</tr></tfoot>' : '')
        + '</table></div></div>';
    }
    function tudo(){ abas(); prazos(); quadro(); contarFx(); conta(); }
    el._redesenhar = tudo;
    tudo();
    if (!el._ligado){
      el._ligado = true;
      el.addEventListener('input', function(e){
        var t = e.target.dataset.t, cfg2 = el._cfg, s2 = EST[cfg2.id];
        if (t === 'q') s2.q = e.target.value; else if (t === 'l') s2.listas[e.target.dataset.k] = e.target.value;
        else if (t === 'min' || t === 'max') s2[t] = e.target.value;
        else if (t === 'vde' || t === 'vate' || t === 'prazoate'){ var v = e.target.value, i = APP.isoBR(v); if (v && !i) return;   // só filtra com a data completa
          if (t === 'prazoate'){ s2.prazoAte = i; s2.prazo = i ? 'ate' : ''; } else s2[t] = i; } else return;
        s2.lim = 150; el._redesenhar();
      });
      el.addEventListener('click', function(e){
        var cfg2 = el._cfg, s2 = EST[cfg2.id], ch2 = cfg2.chave || function(r){ return r.id; }, t = e.target.closest('[data-t]'), tt = t && t.dataset.t;
        if (tt === 'painel'){ s2.painel = !s2.painel; el.querySelector('[data-t=pn]').hidden = !s2.painel; t.setAttribute('aria-expanded', s2.painel); return; }
        if (tt === 'limpar'){ s2.q = ''; s2.listas = {}; s2.vde = s2.vate = s2.min = s2.max = ''; s2.prazo = s2.prazoAte = ''; APP.tabela(el, cfg2); return; }
        if (tt === 'dens'){ var on = !document.documentElement.classList.contains('compacto'); document.documentElement.classList.toggle('compacto', on); APP.pref('compacto', on); t.setAttribute('aria-pressed', on); APP.aviso(on ? 'Tabelas compactas: mais linhas na tela.' : 'Tabelas confortáveis.'); return; }
        if (tt === 'loteon'){ s2.lote = !s2.lote; s2.sel = {}; APP.tabela(el, cfg2); return; }
        if (tt === 'desmarcar'){ s2.sel = {}; el._redesenhar(); return; }
        if (tt === 'mais'){ s2.lim += 150; el._redesenhar(); return; }
        if (tt === 'todas'){ var marcar = t.checked; s2.sel = {}; if (marcar) el.querySelectorAll('tbody tr[data-k]').forEach(function(tr){ s2.sel[tr.dataset.k] = true; }); el._redesenhar(); return; }
        if (tt === 'um'){ var k = t.closest('tr').dataset.k; if (t.checked) s2.sel[k] = true; else delete s2.sel[k]; el._redesenhar(); return; }
        var pz = e.target.closest('[data-prazo]'); if (pz && el.contains(pz)){ s2.prazo = pz.dataset.prazo; s2.prazoAte = ''; s2.lim = 150; el._redesenhar(); return; }
        var ab = e.target.closest('[data-aba]'); if (ab && el.contains(ab)){ s2.aba = ab.dataset.aba; s2.sel = {}; s2.lim = 150; el._redesenhar(); if (cfg2.aoTrocarAba) cfg2.aoTrocarAba(s2.aba); return; }
        var th = e.target.closest('th[data-ord]'); if (th){ var o = cfg2.abas ? (s2.ordAba[s2.aba] = s2.ordAba[s2.aba] || Object.assign({}, s2.ord)) : s2.ord;
          if (o.k === th.dataset.ord) o.dir = -o.dir; else { o.k = th.dataset.ord; o.dir = 1; } el._redesenhar(); return; }
        var lt = e.target.closest('[data-lote]'); if (lt){ var a = cfg2.lote[+lt.dataset.lote];
          var marc = cfg2.linhas.filter(function(r){ return s2.sel[ch2(r)] && (!a.quando || a.quando(r)); }); Promise.resolve(a.fn(marc)).then(function(feito){ if (feito !== false){ s2.sel = {}; } }); return; }
        if (e.target.closest('button, a, input, select, label, textarea')) return;
        var tr = e.target.closest('tbody tr[data-k]'); if (tr && cfg2.clique){ var r = cfg2.linhas.find(function(x){ return String(ch2(x)) === tr.dataset.k; }); if (r) cfg2.clique(r); }
      });
    }
    return { st:st, redesenhar:el._redesenhar, filtrar:filtrar };
  };
  APP.marcadas = function(id){ return Object.keys((EST[id] || {}).sel || {}); };
  function norm(s){ return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.\-\/]/g, ''); }
  APP.norm = norm;

  /* ── cartões por grupo ("Situação por cliente"): clicou → a lista do grupo logo abaixo ── */
  APP.cartoesGrupo = function(el, o){
    // o: { id, grupos:[{id, nome, cor, pill:[cls, txt], sub, linhas:[[rot, valor, cls]], barra, prog (legenda da barra)}], det(el, grupo), vazio }
    var ab = APP.pref('cg-' + o.id) || '';
    if (o.grupos.length === 1 && !ab) ab = o.grupos[0].id;
    if (ab === '-') ab = '';   // Backup 79: '-' = você fechou o cartão único (não reabre sozinho)
    el.innerHTML = o.grupos.length ? o.grupos.map(function(g){ var on = ab === g.id;
      return '<button type="button" class="cg" data-cg="' + esc(g.id) + '" aria-expanded="' + on + '"><div class="cg-hd"><b>' + esc(g.nome) + '</b>' + (g.pill ? '<span class="pill ' + g.pill[0] + '">' + g.pill[1] + '</span>' : '') + '</div>'
        + (g.sub ? '<div class="cg-sub">' + g.sub + '</div>' : '') + (g.barra != null ? '<div class="barra"><span style="width:' + Math.round(g.barra) + '%"></span></div>' : '') + (g.prog ? '<small class="cg-prog">' + g.prog + '</small>' : '')
        + (g.linhas || []).map(function(l){ return '<div class="cg-lin"><span>' + esc(l[0]) + '</span><b' + (l[2] ? ' class="' + l[2] + '"' : '') + '>' + l[1] + '</b></div>'; }).join('') + '</button>'
        + (on ? '<div class="det" id="' + o.id + '-det"></div>' : ''); }).join('')
      : '<div class="quadro det"><div class="vazio"><div class="vazio-ic">' + ic('ok') + '</div><b>' + esc(o.vazio || 'Nenhum grupo neste recorte') + '</b></div></div>';
    el.onclick = function(e){ var c = e.target.closest('[data-cg]'); if (!c) return; APP.pref('cg-' + o.id, ab === c.dataset.cg ? (o.grupos.length === 1 ? '-' : '') : c.dataset.cg); APP.cartoesGrupo(el, o); };
    var g = o.grupos.find(function(x){ return x.id === ab; }), det = document.getElementById(o.id + '-det');
    if (g && det) o.det(det, g);
  };

  /* ── gráficos simples (SVG, sem biblioteca): barras deitadas, colunas empilhadas e linha ── */
  APP.barrasH = function(itens, fmt){
    var max = Math.max.apply(null, itens.map(function(x){ return x.v; }).concat([1]));
    return '<div class="gb">' + itens.map(function(x){ return '<div class="gb-l"><span class="gb-r" title="' + esc(x.rot) + '">' + esc(x.rot) + '</span><span class="gb-b"><span style="width:' + Math.max(2, x.v / max * 100) + '%;background:' + (x.cor || 'var(--primario)') + '"></span></span><b>' + (fmt || APP.brlK)(x.v) + '</b></div>'; }).join('') + '</div>';
  };
  APP.colunas = function(meses, series, fmt){
    // colunas empilhadas em HTML (o texto não estica com a largura da tela)
    var tot = meses.map(function(_, i){ return series.reduce(function(s, x){ return s + (x.v[i] || 0); }, 0); }), max = Math.max.apply(null, tot.concat([1]));
    return '<div class="gcol"><div class="gcol-y"><span>' + APP.brlK(max) + '</span><span>' + APP.brlK(max / 2) + '</span><span>0</span></div><div class="gcol-area">' + meses.map(function(m, i){
      return '<div class="gcol-c" title="' + esc(m + ': ' + (fmt || brl)(tot[i])) + '"><div class="gcol-pilha" style="height:' + (tot[i] / max * 100) + '%">' + series.map(function(s){ var v = s.v[i] || 0; return v ? '<span style="flex:' + v + ';background:' + s.cor + '" title="' + esc(s.rot + ' · ' + m + ': ' + (fmt || brl)(v)) + '"></span>' : ''; }).reverse().join('') + '</div><small>' + esc(m) + '</small></div>'; }).join('') + '</div></div>'
      + '<div class="gc-leg">' + series.map(function(s){ return '<span><i style="background:' + s.cor + '"></i>' + esc(s.rot) + '</span>'; }).join('') + '</div>';
  };
  APP.linha = function(pontos, fmt){
    // linha: o traço em SVG que estica; os pontos e os rótulos em HTML (não deformam)
    var max = Math.max.apply(null, pontos.map(function(p){ return p.v; })), min = Math.min.apply(null, pontos.map(function(p){ return p.v; })), rng = (max - min) || 1;
    var xy = pontos.map(function(p, i){ return [pontos.length > 1 ? i / (pontos.length - 1) * 100 : 50, 8 + (1 - (p.v - min) / rng) * 84]; });
    return '<div class="glin"><div class="gcol-y"><span>' + APP.brlK(max) + '</span><span>' + APP.brlK(min) + '</span></div><div class="glin-area"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + xy.map(function(q){ return q.join(','); }).join(' ') + '" fill="none" stroke="var(--primario)" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>'
      + xy.map(function(q, i){ return '<span class="glin-p" style="left:' + q[0] + '%;top:' + q[1] + '%" title="' + esc(pontos[i].rot + ': ' + (fmt || APP.brlK)(pontos[i].v)) + '"></span>'; }).join('') + '</div>'
      + '<div class="glin-x">' + pontos.map(function(p){ return '<small>' + esc(p.rot) + '</small>'; }).join('') + '</div></div>';
  };

  /* ── busca geral (Ctrl+K) ── */
  APP.abrirBusca = function(){
    if (document.querySelector('.paleta')) return;
    var p = document.createElement('div'); p.className = 'paleta';
    p.innerHTML = '<div class="paleta-box" role="dialog" aria-modal="true" aria-label="Buscar"><div class="paleta-in">' + ic('busca') + '<input id="pal-q" placeholder="Cliente, CNPJ, processo, parcelamento, tela ou ação…" autocomplete="off"></div><div class="paleta-res" id="pal-res"></div>'
      + '<div class="paleta-pe"><span>↑ ↓ escolhe</span><span>Enter abre</span><span>Esc fecha</span></div></div>';
    document.body.appendChild(p);
    var inp = p.querySelector('#pal-q'), res = p.querySelector('#pal-res'), itens = [], foco = 0;
    function desenhar(){
      var q = norm(inp.value.trim()), idx = APP.indice();
      itens = idx.filter(function(x){ return !q || norm(x.rot + ' ' + (x.sub || '') + ' ' + (x.extra || '')).indexOf(q) >= 0; }).slice(0, 40);
      foco = Math.min(foco, Math.max(0, itens.length - 1));
      var grp = '';
      res.innerHTML = itens.length ? itens.map(function(x, i){ var h = x.grupo !== grp ? '<div class="grp">' + esc(x.grupo) + '</div>' : ''; grp = x.grupo;
        return h + '<button type="button" data-i="' + i + '" class="' + (i === foco ? 'foco' : '') + '">' + ic(x.ic || 'busca') + '<span>' + esc(x.rot) + '</span><small>' + esc(x.sub || '') + '</small></button>'; }).join('') : '<div class="vazio"><b>Nada encontrado</b><p>Tente o nome, o CNPJ (só números servem) ou o número do processo.</p></div>';
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
      + '<div class="j-bd"><ul>' + (t.ajuda || ['Clique em qualquer linha para ver o detalhe.']).map(function(a){ return '<li>' + a + '</li>'; }).join('') + '</ul>'
      + '<div class="texto" style="padding:12px 14px"><h3>Atalhos</h3><p><b>Ctrl+K</b> ou <b>/</b> busca qualquer coisa · <b>N</b> cria um novo item nesta tela · <b>Esc</b> fecha a janela · <b>?</b> abre esta ajuda.</p></div></div>';
    document.body.appendChild(g);
    g.querySelector('.fechar').onclick = function(){ g.remove(); };
  };

  /* ── navegação ── */
  APP.registrar = function(id, t){ APP.telas[id] = t; APP.ordem.push(id); };
  APP.ir = function(id, arg){
    if (!APP.telas[id]) id = 'inicio';
    APP.atual = id; APP.arg = arg || null; APP.pref('tela', id);
    document.querySelectorAll('.lado .item').forEach(function(b){ b.classList.toggle('on', b.dataset.ir === id); });
    var t = APP.telas[id]; $('onde').textContent = (t.pai ? t.pai + ' · ' : '') + t.tit;
    var g = document.querySelector('.ajuda-gaveta'); if (g) g.remove();
    document.querySelector('.lado').classList.remove('aberto');
    APP.redesenhar(); APP.arg = null; window.scrollTo(0, 0);
  };
  APP.redesenhar = function(){ var el = $('corpo'), t = APP.telas[APP.atual]; if (!t) return; t.desenhar(el, APP.arg); APP.contadores(); };
  APP.contadores = function(){
    var N = APP.N, c = { inicio: N ? N.pendencias().length : 0, publicacoes: APP.D.publicacoes.filter(function(p){ return !p.lida; }).length };
    document.querySelectorAll('.lado .item').forEach(function(b){ var n = c[b.dataset.ir], s = b.querySelector('.n'); if (s) s.remove(); if (n) b.insertAdjacentHTML('beforeend', '<span class="n">' + n + '</span>'); });
  };
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
