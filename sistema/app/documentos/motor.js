'use strict';
// ═══════════════════════════════════════════════════════════════════
// Central de Documentos (Backup 32) — o MOTOR: entra com o login do ERP, desenha o formulário do modelo,
// mostra a prévia em folha A4 ao vivo, puxa os dados do cliente, salva (com número), lista o histórico
// e exporta em PDF (impressão) e Word (.docx de verdade, com a logo no cabeçalho e a banda no rodapé).
// Os textos ficam em modelos.js. Um documento = lista de blocos; a prévia, o PDF e o Word leem os mesmos blocos.
// ═══════════════════════════════════════════════════════════════════
(function () {
  const CFG = window.ERP_CONFIG || {};
  const sb = window.supabase && CFG.url ? window.supabase.createClient(CFG.url, CFG.chave) : null;
  const MODELOS = window.MODELOS_DOC || [];
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dig = (s) => String(s || '').replace(/\D/g, '');
  const q = async (p) => { const { data, error } = await p; if (error) throw error; return data; };
  const hojeISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  const FALTA_A = '⟦', FALTA_F = '⟧';
  try { if (localStorage.getItem('erp_tema') === 'escuro') document.documentElement.setAttribute('data-tema', 'escuro'); } catch (e) { /* sem armazenamento */ }

  // ══════════ números e datas por extenso ══════════
  const UN = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const DZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const CT = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  function ate999(n) {
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100), r = n % 100, p = [];
    if (c) p.push(CT[c]);
    if (r) p.push(r < 20 ? UN[r] : DZ[Math.floor(r / 10)] + (r % 10 ? ' e ' + UN[r % 10] : ''));
    return p.join(' e ');
  }
  function inteiroExtenso(n) {
    n = Math.floor(Math.abs(n)); if (!n) return 'zero';
    const grupos = [], nomes = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões']];
    for (let i = 0; n > 0; i++, n = Math.floor(n / 1000)) grupos.push([n % 1000, i]);
    const partes = grupos.filter(([v]) => v).reverse().map(([v, i]) => (i === 1 && v === 1 ? '' : ate999(v)) + (i ? (i === 1 && v === 1 ? 'mil' : ' ' + nomes[i][v === 1 ? 0 : 1]) : ''));
    // "e" antes do último grupo quando ele é < 100 ou centena redonda (mil e quinhentos; dois mil e cinquenta)
    const ult = grupos.find(([v]) => v), sepE = grupos.length > 1 && ult && ult[1] === 0 && (ult[0] < 100 || ult[0] % 100 === 0);
    return partes.length > 1 ? partes.slice(0, -1).join(', ').replace(/^, /, '') + (sepE ? ' e ' : ', ') + partes[partes.length - 1] : partes[0];
  }
  function dinheiroExtenso(v) {
    v = Math.round((Number(v) || 0) * 100) / 100;
    const r = Math.floor(v), c = Math.round((v - r) * 100);
    const rs = r ? inteiroExtenso(r) + (r % 1000000 === 0 ? ' de' : '') + (r === 1 ? ' real' : ' reais') : '';
    const cs = c ? inteiroExtenso(c) + (c === 1 ? ' centavo' : ' centavos') : '';
    return rs && cs ? rs + ' e ' + cs : rs || cs || 'zero real';
  }
  function numExtenso(n) {
    if (n === '' || n == null || isNaN(Number(String(n).replace(',', '.')))) return FALTA_A + 'por extenso' + FALTA_F;
    const v = Number(String(n).replace(',', '.')), i = Math.floor(v), d = Math.round((v - i) * 100);
    return inteiroExtenso(i) + (d ? ' vírgula ' + (d % 10 === 0 ? inteiroExtenso(d / 10) : inteiroExtenso(d)) : '');
  }
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const dataExtenso = (iso) => { if (!iso) return FALTA_A + 'data' + FALTA_F; const [a, m, d] = iso.split('-').map(Number); return (d === 1 ? '1º' : d) + ' de ' + MESES[m - 1] + ' de ' + a; };
  const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const lerValor = (x) => { if (typeof x === 'number') return x; let s = String(x || '').replace(/[R$\s]/g, ''); if (!s) return 0; if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); const n = Number(s); return isNaN(n) ? 0 : n; };
  const mascaraDoc = (d) => { d = dig(d); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : String(d || ''); };

  // ══════════ ajudantes dos modelos (h) ══════════
  let ESC = { cidade: 'Santo Antônio do Monte/MG', foro: 'Santo Antônio do Monte/MG', advogados: [] };
  const V = (x, rot) => (x === 0 || (x != null && String(x).trim() !== '')) ? String(x) : FALTA_A + rot + FALTA_F;
  const up = (s) => String(s || '').toLocaleUpperCase('pt-BR');
  const lista = (a) => { a = (a || []).filter(Boolean); return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1]; };
  const g = (p, m, f) => (p && (p.tipo === 'pj' || p.genero === 'f')) ? f : m;
  function qualifica(p, op) {
    p = p || {}; op = op || {};
    const nome = '**' + up(V(p.nome, 'nome')) + '**', doc = mascaraDoc(p.doc);
    if (p.tipo === 'pj') {
      const rep = p.rep_nome ? ', neste ato representada por seu ' + (p.rep_genero === 'f' ? 'sócia-administradora' : 'sócio-administrador') + ' **' + up(p.rep_nome) + '**, inscrit' + (p.rep_genero === 'f' ? 'a' : 'o') + ' no CPF sob o n. ' + V(mascaraDoc(p.rep_doc), 'CPF do representante') : '';
      return nome + ', pessoa jurídica de direito privado, inscrita no CNPJ sob o n. ' + V(doc, 'CNPJ') + (op.curto ? '' : ', com sede na ' + V(p.endereco, 'endereço') + rep);
    }
    const f = p.genero === 'f';
    if (op.curto) return nome + ', inscrit' + (f ? 'a' : 'o') + ' no CPF sob o n. ' + V(doc, 'CPF');
    return nome + ', ' + [p.nacionalidade || (f ? 'brasileira' : 'brasileiro'), p.estado_civil, p.profissao].filter(Boolean).join(', ') +
      ', inscrit' + (f ? 'a' : 'o') + ' no CPF sob o n. ' + V(doc, 'CPF') + (p.endereco ? ', residente e domiciliad' + (f ? 'a' : 'o') + ' na ' + p.endereco : (op.semEndereco ? '' : ', residente e domiciliad' + (f ? 'a' : 'o') + ' na ' + V('', 'endereço')));
  }
  const qualificaAdv = (a) => !a ? V('', 'advogado') : '**' + up(a.nome) + '**, ' + (a.genero === 'f' ? 'advogada, inscrita' : 'advogado, inscrito') + ' na ' + String(a.oab || '').replace(/^OAB\/(\w\w)\s*/i, 'OAB/$1 sob o n. ') +
    ', com escritório profissional na ' + V(a.endereco, 'endereço profissional') + (a.email ? ', endereço eletrônico ' + a.email : '');
  const adv = (id) => (ESC.advogados || []).find((a) => a.id === id) || null;
  const assinaParte = (p) => { p = p || {}; return p.tipo === 'pj' ? { nome: up(p.nome || ' '), doc: 'CNPJ ' + (mascaraDoc(p.doc) || ''), extra: p.rep_nome ? 'p.p. ' + up(p.rep_nome) : '' } : { nome: up(p.nome || ' '), doc: 'CPF ' + (mascaraDoc(p.doc) || '') }; };
  const H = {
    V, up, lista, esc: null, qualifica, qualificaAdv, adv, assinaParte, brl, valor: lerValor, numExtenso,
    o: (p) => g(p, 'o', 'a'),
    cap: (s) => { s = String(s || ''); const i = s.search(/[^*_\s]/); return i < 0 ? s : s.slice(0, i) + s.charAt(i).toLocaleUpperCase('pt-BR') + s.slice(i + 1); },
    nomeParte: (p) => (p && p.nome) || 'sem nome',
    advs: (ids) => (ids || []).map(adv).filter(Boolean),
    num: (n) => n === '' || n == null ? '' : String(n).replace('.', ','),
    dinheiro: (v) => { const n = lerValor(v); return n ? brl(n) + ' (' + dinheiroExtenso(n) + ')' : V('', 'valor'); },
    dataCurta: (iso) => iso ? iso.split('-').reverse().join('/') : V('', 'data'),
    mesAno: (ym) => ym ? MESES[Number(ym.slice(5, 7)) - 1] + ' de ' + ym.slice(0, 4) : V('', 'mês'),
    recebedor: (id) => {
      if (!id || id === 'escritorio') return { nome: ESC.razao || 'Araújo & Castro Advocacia e Consultoria', doc: ESC.cnpj ? 'CNPJ ' + ESC.cnpj : '', plural: true };
      const a = adv(id); return a ? { nome: a.nome, doc: a.oab + (a.cpf ? ' · CPF ' + a.cpf : ''), plural: false } : { nome: V('', 'recebedor'), doc: '', plural: false };
    }
  };

  // ══════════ blocos (B) ══════════
  const B = {
    titulo: (texto) => ({ t: 'titulo', texto }),
    p: (texto, alinh) => ({ t: 'p', texto, alinh: alinh || 'j' }),
    clausula: (ord, nome, texto) => ({ t: 'p', texto: '**CLÁUSULA ' + ord + ' – ' + nome + ':** ' + texto, alinh: 'j' }),
    par: (rot, texto, italico) => ({ t: 'p', texto: (italico ? '__' + rot + '__ ' : '**' + rot + '** ') + texto, alinh: 'j' }),
    fecho: (local, data) => ({ t: 'fecho', texto: V(local, 'local') + ', ' + dataExtenso(data) + '.' }),
    assinaturas: (linhas) => ({ t: 'assin', linhas }),
    tabela: (cab, linhas, larg) => ({ t: 'tabela', cab, linhas, larg }),
    quebra: () => ({ t: 'quebra' }),
    recibo: (numero, valor) => ({ t: 'recibo', numero, valor }),
    bloco: (linhas) => ({ t: 'bloco', linhas })
  };
  // texto com **negrito**, __itálico__ e ⟦faltando⟧ → pedaços
  function pedacos(txt) {
    const out = []; let b = false, i = false, falta = false, buf = '';
    const s = String(txt == null ? '' : txt), push = () => { if (buf) out.push({ text: buf, b, i, falta }); buf = ''; };
    for (let k = 0; k < s.length; k++) {
      if (s[k] === '*' && s[k + 1] === '*') { push(); b = !b; k++; continue; }
      if (s[k] === '_' && s[k + 1] === '_') { push(); i = !i; k++; continue; }
      if (s[k] === FALTA_A) { push(); falta = true; continue; }
      if (s[k] === FALTA_F) { push(); falta = false; continue; }
      buf += s[k];
    }
    push(); return out;
  }
  const htmlPedacos = (txt) => pedacos(txt).map((r) => { let h = esc(r.text); if (r.falta) return '<span class="falta" title="Falta preencher">' + h + '</span>'; if (r.i) h = '<i>' + h + '</i>'; if (r.b) h = '<b>' + h + '</b>'; return h; }).join('');
  const contarFaltas = (blocos) => (JSON.stringify(blocos).match(new RegExp(FALTA_A, 'g')) || []).length;

  function htmlBlocos(blocos, editavel) {
    const ce = editavel ? ' contenteditable="true"' : '';
    return blocos.map((b, k) => {
      if (b.t === 'titulo') return '<h1 class="dc-tit" data-b="' + k + '"' + ce + '>' + htmlPedacos(b.texto) + '</h1>';
      if (b.t === 'p') return '<p class="dc-p dc-' + (b.alinh || 'j') + '" data-b="' + k + '"' + ce + '>' + htmlPedacos(b.texto) + '</p>';
      if (b.t === 'fecho') return '<p class="dc-p dc-c dc-fecho" data-b="' + k + '"' + ce + '>' + htmlPedacos(b.texto) + '</p>';
      if (b.t === 'quebra') return '<div class="dc-quebra" data-b="' + k + '"><span>nova página</span></div>';
      if (b.t === 'recibo') return '<div class="dc-recibo" data-b="' + k + '"><span>' + htmlPedacos(b.numero) + '</span><b>' + htmlPedacos(b.valor) + '</b></div>';
      if (b.t === 'bloco') return '<div class="dc-bloco" data-b="' + k + '">' + b.linhas.map((l) => '<div>' + htmlPedacos(l) + '</div>').join('') + '</div>';
      if (b.t === 'tabela') return '<table class="dc-tab" data-b="' + k + '"><thead><tr>' + b.cab.map((c, i) => '<th style="width:' + ((b.larg || [])[i] || '') + '%">' + esc(c) + '</th>').join('') + '</tr></thead><tbody>' +
        b.linhas.map((l) => '<tr>' + l.map((c, i) => '<td' + (i ? ' class="dc-num"' : '') + '>' + htmlPedacos(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
      if (b.t === 'assin') return '<div class="dc-assin" data-b="' + k + '">' + b.linhas.map((l) => '<div class="dc-assin-l" style="grid-template-columns:repeat(' + l.length + ',1fr)">' +
        l.map((a) => '<div class="dc-assin-c">' + (a.rotulo ? '<small>' + esc(a.rotulo) + '</small>' : '') + '<div class="dc-linha"></div><b>' + esc(String(a.nome || '').trim() || ' ') + '</b>' + (a.doc ? '<span>' + esc(a.doc) + '</span>' : '') + (a.extra ? '<span>' + esc(a.extra) + '</span>' : '') + '</div>').join('') + '</div>').join('') + '</div>';
      return '';
    }).join('');
  }
  // ajuste manual na prévia → volta para blocos (mantém negrito e itálico)
  function lerEditados(papel, blocos) {
    const novo = JSON.parse(JSON.stringify(blocos));
    $$('[data-b][contenteditable]', papel).forEach((el) => {
      const k = Number(el.dataset.b), b = novo[k]; if (!b) return;
      const anda = (n, bb, ii) => [...n.childNodes].map((c) => {
        if (c.nodeType === 3) { const t = c.textContent; return t ? (bb ? '**' : '') + (ii ? '__' : '') + t + (ii ? '__' : '') + (bb ? '**' : '') : ''; }
        if (c.nodeType !== 1) return '';
        if (c.classList.contains('falta')) return FALTA_A + c.textContent + FALTA_F;
        const tag = c.tagName, nb = bb || tag === 'B' || tag === 'STRONG', ni = ii || tag === 'I' || tag === 'EM';
        return (tag === 'BR' ? ' ' : '') + anda(c, nb, ni) + (tag === 'DIV' || tag === 'P' ? ' ' : '');
      }).join('');
      b.texto = anda(el, false, false).replace(/\*\*\*\*/g, '').replace(/____/g, '').replace(/\s+/g, ' ').trim();
    });
    return novo;
  }

  // ══════════ estado ══════════
  const E = { modelo: null, dados: {}, docId: null, numero: '', editados: null, sujo: false, clientes: [], grupos: {}, eu: null, admin: false, vista: 'novo' };
  const modeloPor = (id) => MODELOS.find((m) => m.id === id);
  H.esc = ESC;
  function blocosAtuais() { if (E.editados) return E.editados; const d = Object.assign({}, E.dados, { _numero: E.numero }); H.esc = ESC; return E.modelo.montar(d, H, B); }
  function valorPadrao(c) { return typeof c.padrao === 'function' ? c.padrao({ esc: ESC }) : c.padrao === 'hoje' ? hojeISO() : c.padrao != null ? JSON.parse(JSON.stringify(c.padrao)) : (c.tipo === 'parte' ? { tipo: 'pj', genero: 'm', rep_genero: 'm' } : c.tipo === 'checks' ? [] : ''); }
  function novoDocumento(id, dados) {
    E.modelo = modeloPor(id) || MODELOS[0]; E.docId = null; E.numero = ''; E.editados = null; E.sujo = false;
    E.dados = {}; E.modelo.campos.forEach((c) => { if (c.id) E.dados[c.id] = valorPadrao(c); });
    if (dados) Object.assign(E.dados, dados);
    E.vista = 'novo'; desenhar();
  }

  // ══════════ tela ══════════
  function aviso(msg, erro) {
    const t = document.createElement('div'); t.className = 'dc-toast' + (erro ? ' erro' : ''); t.textContent = msg; t.setAttribute('role', 'status');
    document.body.appendChild(t); setTimeout(() => t.remove(), erro ? 6000 : 3500);
  }
  async function comBotao(b, fn) { const txt = b.innerHTML; b.disabled = true; try { await fn(); } catch (e) { console.error(e); aviso(e.message || String(e), true); } finally { if (b.isConnected) { b.disabled = false; b.innerHTML = txt; } } }

  function desenhar() {
    $$('.dc-mod').forEach((b) => b.classList.toggle('ativo', E.vista === 'novo' && E.modelo && b.dataset.mod === E.modelo.id));
    $$('[data-vista]').forEach((b) => b.classList.toggle('ativo', b.dataset.vista === E.vista));
    if (E.vista === 'historico') return desenharHistorico();
    if (E.vista === 'escritorio') return desenharEscritorio();
    const m = E.modelo;
    $('#dc-area').innerHTML =
      '<section class="dc-form" aria-label="Formulário"><div class="dc-form-hd"><span class="dc-ic">' + m.icone + '</span><div><h2>' + esc(m.nome) + '</h2><p>' + esc(m.descricao) + '</p></div></div>' +
        '<form id="dc-campos" autocomplete="off" novalidate></form></section>' +
      '<section class="dc-prev" aria-label="Prévia do documento"><div class="dc-barra">' +
        '<span class="dc-status" id="dc-status"></span>' +
        '<button type="button" class="dc-bt" id="dc-editar" title="Escrever direto no documento">✎ Ajustar texto</button>' +
        '<button type="button" class="dc-bt" id="dc-word">⬇ Word</button><button type="button" class="dc-bt" id="dc-pdf">⎙ PDF</button>' +
        '<button type="button" class="dc-bt dc-prim" id="dc-salvar">💾 Salvar</button></div>' +
        '<div class="dc-folha-wrap" id="dc-wrap"><article class="dc-papel" id="dc-papel"><img class="dc-cab" src="../img/recibo-cabecalho.png" alt="Araújo & Castro — Advocacia e Consultoria"><div class="dc-corpo" id="dc-corpo"></div><img class="dc-rod" src="../img/rodape-documento.png" alt=""></article></div></section>';
    desenharCampos(); prever(); ajustarZoom();
    $('#dc-salvar').onclick = (ev) => comBotao(ev.currentTarget, salvar);
    $('#dc-pdf').onclick = () => imprimir();
    $('#dc-word').onclick = (ev) => comBotao(ev.currentTarget, baixarWord);
    $('#dc-editar').onclick = alternarEdicao;
  }

  // ── formulário ──
  const campoVisivel = (c) => !c.se || c.se(E.dados);
  function htmlCampo(c) {
    const v = E.dados[c.id], id = 'f-' + c.id, dica = c.dica ? '<small class="dc-dica">' + esc(c.dica) + '</small>' : '';
    const rot = '<label for="' + id + '">' + esc(c.rotulo) + '</label>';
    const caixa = (inner, cls) => '<div class="dc-campo' + (c.meia ? ' meia' : '') + (cls ? ' ' + cls : '') + '" data-campo="' + c.id + '">' + inner + dica + '</div>';
    switch (c.tipo) {
      case 'texto': case 'cliente-nome': return caixa(rot + '<input id="' + id + '" data-k="' + c.id + '" value="' + esc(v) + '"' + (c.tipo === 'cliente-nome' ? ' list="dc-lista-cli"' : '') + '>');
      case 'area': return caixa(rot + '<textarea id="' + id + '" data-k="' + c.id + '" rows="3">' + esc(v) + '</textarea>');
      case 'valor': return caixa(rot + '<div class="dc-rs"><span>R$</span><input id="' + id + '" data-k="' + c.id + '" inputmode="decimal" value="' + esc(v) + '" placeholder="0,00"></div>');
      case 'data': return caixa(rot + '<input id="' + id + '" type="date" data-k="' + c.id + '" value="' + esc(v) + '">');
      case 'mes': return caixa(rot + '<input id="' + id + '" type="month" data-k="' + c.id + '" value="' + esc(v) + '">');
      case 'inteiro': case 'decimal': return caixa(rot + '<input id="' + id + '" data-k="' + c.id + '" inputmode="' + (c.tipo === 'inteiro' ? 'numeric' : 'decimal') + '" value="' + esc(v) + '">');
      case 'select': return caixa(rot + '<select id="' + id + '" data-k="' + c.id + '">' + c.opcoes.map(([o, r]) => '<option value="' + o + '"' + (String(v) === o ? ' selected' : '') + '>' + esc(r) + '</option>').join('') + '</select>');
      case 'radio': return caixa('<span class="dc-rot">' + esc(c.rotulo) + '</span><div class="dc-seg">' + c.opcoes.map(([o, r]) => '<label><input type="radio" name="' + id + '" data-k="' + c.id + '" value="' + o + '"' + (v === o ? ' checked' : '') + '><span>' + esc(r) + '</span></label>').join('') + '</div>');
      case 'check': return caixa('<label class="dc-chk"><input type="checkbox" data-k="' + c.id + '"' + (v ? ' checked' : '') + '><span>' + esc(c.rotulo) + '</span></label>');
      case 'checks': return caixa('<span class="dc-rot">' + esc(c.rotulo) + '</span><div class="dc-chips">' + c.opcoes.map(([o, r]) => '<label class="dc-chip"><input type="checkbox" data-k="' + c.id + '" data-multi value="' + o + '"' + ((v || []).includes(o) ? ' checked' : '') + '><span>' + esc(r) + '</span></label>').join('') + '</div>');
      case 'advogados': return caixa('<span class="dc-rot">' + esc(c.rotulo) + '</span><div class="dc-chips">' + (ESC.advogados || []).map((a) => '<label class="dc-chip"><input type="checkbox" data-k="' + c.id + '" data-multi value="' + a.id + '"' + ((v || []).includes(a.id) ? ' checked' : '') + '><span>' + esc(a.nome.split(' ')[0]) + ' <small>' + esc(a.oab) + '</small></span></label>').join('') + '</div>');
      case 'advogado': return caixa(rot + '<select id="' + id + '" data-k="' + c.id + '">' + (c.vazio ? '<option value="">— nenhum —</option>' : '') + (ESC.advogados || []).map((a) => '<option value="' + a.id + '"' + (v === a.id ? ' selected' : '') + '>' + esc(a.nome + ' · ' + a.oab) + '</option>').join('') + '</select>');
      case 'recebedor': return caixa(rot + '<select id="' + id + '" data-k="' + c.id + '"><option value="escritorio"' + (v === 'escritorio' ? ' selected' : '') + '>' + esc(ESC.razao || 'Araújo & Castro Advocacia e Consultoria') + ' (escritório)</option>' +
        (ESC.advogados || []).map((a) => '<option value="' + a.id + '"' + (v === a.id ? ' selected' : '') + '>' + esc(a.nome) + '</option>').join('') + '</select>');
      case 'tabela': return caixa('<span class="dc-rot">' + esc(c.rotulo) + '</span><table class="dc-ftab"><thead><tr>' + c.colunas.map((x) => '<th>' + esc(x) + '</th>').join('') + '<th></th></tr></thead><tbody>' +
        (v || []).map((r, i) => '<tr>' + c.colunas.map((x, j) => '<td><input data-k="' + c.id + '" data-tab="' + i + ',' + j + '" value="' + esc(r[j] || '') + '"' + (j ? ' inputmode="decimal" placeholder="R$"' : '') + '></td>').join('') +
          '<td><button type="button" class="dc-x" data-tab-tira="' + c.id + ',' + i + '" aria-label="Tirar linha">×</button></td></tr>').join('') + '</tbody></table><button type="button" class="dc-bt dc-mini" data-tab-mais="' + c.id + '">+ linha</button>', 'larga');
      case 'parte': return htmlParte(c, v || {});
    }
    return '';
  }
  function htmlParte(c, p) {
    const k = c.id, f = (n, r, extra, cls) => '<div class="dc-campo' + (cls ? ' ' + cls : '') + '"><label for="f-' + k + '-' + n + '">' + r + '</label><input id="f-' + k + '-' + n + '" data-k="' + k + '" data-sub="' + n + '" value="' + esc(p[n] || '') + '"' + (extra || '') + '></div>';
    const sel = (n, r, ops, cls) => '<div class="dc-campo' + (cls ? ' ' + cls : '') + '"><label for="f-' + k + '-' + n + '">' + r + '</label><select id="f-' + k + '-' + n + '" data-k="' + k + '" data-sub="' + n + '">' + ops.map(([o, t]) => '<option value="' + o + '"' + ((p[n] || '') === o ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></div>';
    const pj = p.tipo === 'pj';
    return '<fieldset class="dc-parte" data-campo="' + k + '"><legend>' + esc(c.rotulo) + '</legend>' +
      '<div class="dc-busca-cli"><input type="search" placeholder="🔎 Buscar cliente cadastrado (nome ou CPF/CNPJ)…" data-busca-cli="' + k + '" aria-label="Buscar cliente"><div class="dc-sug" hidden></div></div>' +
      (p.cliente_id ? '<div class="dc-vinc">Vinculado ao cadastro do cliente <button type="button" class="dc-link" data-desvincula="' + k + '">desvincular</button></div>' : '') +
      '<div class="dc-seg"><label><input type="radio" name="f-' + k + '-tipo" data-k="' + k + '" data-sub="tipo" value="pj"' + (pj ? ' checked' : '') + '><span>Empresa (CNPJ)</span></label><label><input type="radio" name="f-' + k + '-tipo" data-k="' + k + '" data-sub="tipo" value="pf"' + (!pj ? ' checked' : '') + '><span>Pessoa física (CPF)</span></label></div>' +
      '<div class="dc-grade">' + f('nome', pj ? 'Razão social' : 'Nome completo', '', 'larga') + f('doc', pj ? 'CNPJ' : 'CPF', ' inputmode="numeric"', 'meia') +
      (pj ? '' : sel('genero', 'Tratamento', [['m', 'masculino'], ['f', 'feminino']], 'meia')) +
      (c.simples ? '' : (pj ? '' : f('nacionalidade', 'Nacionalidade', ' placeholder="' + (p.genero === 'f' ? 'brasileira' : 'brasileiro') + '"', 'meia') + f('estado_civil', 'Estado civil', '', 'meia') + f('profissao', 'Profissão', '', 'larga')) +
        f('endereco', pj ? 'Sede (endereço completo)' : 'Endereço completo', ' placeholder="Rua, n., bairro, cidade/UF, CEP"', 'larga') +
        (pj ? f('rep_nome', 'Sócio-administrador', '', 'larga') + f('rep_doc', 'CPF do sócio', ' inputmode="numeric"', 'meia') + sel('rep_genero', 'Tratamento', [['m', 'sócio-administrador'], ['f', 'sócia-administradora']], 'meia') : '')) +
      '</div></fieldset>';
  }
  function desenharCampos() {
    const form = $('#dc-campos'); if (!form) return;
    let html = '', sec = null;
    E.modelo.campos.forEach((c) => {
      if (c.sec) { if (sec) html += '</div></div>'; sec = c.sec; html += '<div class="dc-sec"><h3>' + esc(c.sec) + '</h3><div class="dc-grade">'; return; }
      if (campoVisivel(c)) html += htmlCampo(c);
    });
    if (sec) html += '</div></div>';
    form.innerHTML = html + '<datalist id="dc-lista-cli">' + E.clientes.slice(0, 2000).map((c) => '<option value="' + esc(c.razao_social || c.nome) + '">').join('') + '</datalist>';
  }
  function lerCampo(el) {
    const k = el.dataset.k, c = E.modelo.campos.find((x) => x.id === k); if (!c) return;
    if (el.dataset.sub) { const p = E.dados[k] = Object.assign({}, E.dados[k] || {}); p[el.dataset.sub] = el.value; if (el.dataset.sub === 'tipo') return 'redesenhar'; return; }
    if (el.dataset.tab) { const [i, j] = el.dataset.tab.split(',').map(Number); const t = E.dados[k] = (E.dados[k] || []).map((r) => r.slice()); (t[i] = t[i] || [])[j] = el.value; return; }
    if (el.dataset.multi != null) { E.dados[k] = $$('[data-k="' + k + '"][data-multi]:checked').map((x) => x.value); return 'redesenhar'; }
    if (el.type === 'checkbox') { E.dados[k] = el.checked; return 'redesenhar'; }
    E.dados[k] = el.value;
    if (c.tipo === 'select' || c.tipo === 'radio' || c.tipo === 'advogado') return 'redesenhar';
  }
  function aoMudar(ev) {
    const el = ev.target; if (!el.dataset || !el.dataset.k) return;
    if (E.editados && !confirm('Você ajustou o texto à mão. Mudar o formulário descarta esses ajustes. Continuar?')) { desenharCampos(); return; }
    E.editados = null; E.sujo = true;
    const r = lerCampo(el);
    if (r === 'redesenhar' && ev.type === 'change') { const foco = el.id; desenharCampos(); const n = foco && document.getElementById(foco); if (n) n.focus(); }
    prever();
  }

  // ── busca de cliente dentro da parte ──
  let _tBusca;
  function sugerir(inp) {
    const box = inp.nextElementSibling, t = inp.value.trim().toLowerCase(), d = dig(t);
    if (t.length < 2) { box.hidden = true; return; }
    const L = E.clientes.filter((c) => (c.nome + ' ' + (c.razao_social || '')).toLowerCase().includes(t) || (d.length >= 3 && dig(c.cpf_cnpj).includes(d))).slice(0, 8);
    box.innerHTML = L.length ? L.map((c) => '<button type="button" data-cli="' + c.id + '"><b>' + esc(c.razao_social || c.nome) + '</b><small>' + esc([mascaraDoc(c.cpf_cnpj), E.grupos[c.grupo_id]].filter(Boolean).join(' · ')) + '</small></button>').join('') : '<div class="dc-sug-vazio">Nenhum cliente com esse nome.</div>';
    box.hidden = false;
  }
  async function dadosCliente(id) {
    const c = E.clientes.find((x) => x.id === id); if (!c) return null;
    const [ends, socios] = await Promise.all([q(sb.from('enderecos').select('*').eq('cliente_id', id)).catch(() => []), q(sb.from('vinculos_societarios').select('*').eq('cliente_id', id)).catch(() => [])]);
    const e = ends.find((x) => x.principal) || ends[0];
    const endereco = e ? [[e.logradouro, e.numero ? 'n. ' + e.numero : ''].filter(Boolean).join(', '), e.complemento, e.bairro, (e.cidade || '') + (e.uf ? '/' + e.uf : ''), e.cep ? 'CEP ' + e.cep : ''].filter((x) => x && x !== '/').join(', ')
      : [c.endereco, (c.cidade || '') + (c.estado ? '/' + c.estado : ''), c.cep ? 'CEP ' + c.cep : ''].filter((x) => x && x !== '/').join(', ');
    const rep = socios.find((s) => /administr|represent/i.test(s.qualificacao || '')) || socios[0] || (c.socio_admin ? { nome: c.socio_admin } : null);
    const doc = dig(c.cpf_cnpj), pj = doc.length === 14 || (!doc && /ltda|s\/a|eireli|\bme\b|epp/i.test(c.nome));
    return { cliente_id: c.id, grupo_id: c.grupo_id || null, tipo: pj ? 'pj' : 'pf', nome: c.razao_social || c.nome, doc: mascaraDoc(doc), endereco, genero: 'm',
      rep_nome: rep ? rep.nome : '', rep_doc: rep ? mascaraDoc(rep.cpf_cnpj) : '', rep_genero: 'm' };
  }
  async function escolherCliente(k, id) {
    const d = await dadosCliente(id); if (!d) return;
    if (E.editados && !confirm('Descartar os ajustes feitos à mão no texto?')) return;
    E.editados = null; E.dados[k] = Object.assign({}, E.dados[k] || {}, d); E.sujo = true;
    desenharCampos(); prever();
    if (!d.endereco || (d.tipo === 'pj' && !d.rep_nome)) aviso('Cliente puxado. Confira o que ficou em amarelo na prévia (endereço/sócio não cadastrados).');
  }

  // ── prévia ──
  function prever() {
    const corpo = $('#dc-corpo'); if (!corpo) return;
    const bl = blocosAtuais(), n = contarFaltas(bl);
    corpo.innerHTML = htmlBlocos(bl, false);
    const st = $('#dc-status');
    if (st) st.innerHTML = (E.docId ? '<span class="dc-pill ok">' + (E.numero ? 'Nº ' + esc(E.numero) + ' · ' : '') + (E.sujo ? 'alterado — falta salvar' : 'salvo') + '</span>' : '<span class="dc-pill">novo</span>') +
      (n ? ' <span class="dc-pill aviso">' + n + ' campo' + (n > 1 ? 's' : '') + ' a preencher</span>' : ' <span class="dc-pill ok">completo</span>') + (E.editados ? ' <span class="dc-pill">texto ajustado à mão</span>' : '');
  }
  function ajustarZoom() {
    const w = $('#dc-wrap'), p = $('#dc-papel'); if (!w || !p) return;
    const z = Math.min(1, (w.clientWidth - 24) / 794); p.style.zoom = z > 0.3 ? z : 0.3;
  }
  window.addEventListener('resize', ajustarZoom);
  function alternarEdicao() {
    const corpo = $('#dc-corpo'), b = $('#dc-editar');
    if (b.classList.contains('ativo')) { E.editados = lerEditados(corpo, blocosAtuais()); E.sujo = true; b.classList.remove('ativo'); b.innerHTML = '✎ Ajustar texto'; prever(); aviso('Ajustes guardados na prévia. Salve para não perder.'); return; }
    corpo.innerHTML = htmlBlocos(blocosAtuais(), true); b.classList.add('ativo'); b.innerHTML = '✓ Terminar ajustes';
    aviso('Clique no texto e escreva. Negrito: Ctrl+B. Assinaturas e tabelas não mudam aqui.');
  }

  // ── salvar ──
  async function salvar() {
    const ed = $('#dc-editar'); if (ed && ed.classList.contains('ativo')) alternarEdicao();
    const bl = blocosAtuais(), n = contarFaltas(bl);
    if (n && !confirm('Ainda há ' + n + ' campo' + (n > 1 ? 's' : '') + ' a preencher (em amarelo). Salvar assim mesmo?')) return;
    if (E.modelo.numerado && !E.numero) E.numero = E.modelo.numerado + ' ' + await q(sb.rpc('proximo_numero_documento', { p_modelo: E.modelo.numerado }));
    const blocos = blocosAtuais();     // de novo: o número entra no recibo
    const parte = E.modelo.parte ? E.dados[E.modelo.parte] || {} : {};
    const row = { modelo: E.modelo.id, numero: E.numero, titulo: E.modelo.titulo(E.dados, H), cliente_id: parte.cliente_id || null, grupo_id: parte.grupo_id || null,
      dados: Object.assign({}, E.dados, { _editados: E.editados || null }), html: htmlBlocos(blocos, false), editado: !!E.editados };
    if (E.docId) await q(sb.from('documentos_gerados').update(row).eq('id', E.docId).select('id'));
    else E.docId = (await q(sb.from('documentos_gerados').insert(row).select('id')))[0].id;
    E.sujo = false; prever();
    try { history.replaceState(null, '', '?doc=' + E.docId); } catch (e) { /* ok */ }
    aviso('✓ Documento salvo' + (E.numero ? ' (Nº ' + E.numero + ')' : '') + '. Ele fica no Histórico.');
  }
  async function abrirDocumento(id, duplicar) {
    const [d] = await q(sb.from('documentos_gerados').select('*').eq('id', id)); if (!d) return aviso('Documento não encontrado.', true);
    const dados = Object.assign({}, d.dados || {}), ed = dados._editados || null; delete dados._editados;
    novoDocumento(d.modelo, dados);
    if (!duplicar) { E.docId = d.id; E.numero = d.numero || ''; E.editados = ed; try { history.replaceState(null, '', '?doc=' + d.id); } catch (e) { /* ok */ } }
    else aviso('Cópia aberta: ao salvar vira um documento novo' + (E.modelo.numerado ? ', com número novo' : '') + '.');
    prever();
  }

  // ── nome do arquivo ──
  function nomeArquivo() {
    const p = E.modelo.parte ? (E.dados[E.modelo.parte] || {}).nome : '';
    // sem acento no NOME DO ARQUIVO (alguns navegadores trocam o nome acentuado por "download"); o documento continua acentuado
    return (E.modelo.nome + (E.numero ? ' ' + E.numero.replace(/\//g, '-') : '') + (p ? ' - ' + p : '') + ' - ' + (E.dados.data || hojeISO()))
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w .&()-]/g, '-').slice(0, 120);
  }

  // ── PDF (impressão: a logo e a banda repetem em todas as páginas) ──
  function imprimir() {
    const bl = blocosAtuais(), n = contarFaltas(bl);
    if (n && !confirm('Ainda há ' + n + ' campo' + (n > 1 ? 's' : '') + ' a preencher (em amarelo). Gerar o PDF assim mesmo?')) return;
    const w = window.open('', '_blank'); if (!w) return aviso('O navegador bloqueou a janela. Libere pop-ups para este site e tente de novo.', true);
    const base = new URL('.', location.href).href, css = $$('link[rel=stylesheet]').filter((l) => /documento\.css/.test(l.href)).map((l) => '<link rel="stylesheet" href="' + l.href + '">').join('');
    w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + esc(nomeArquivo()) + '</title><base href="' + base + '">' + css + '</head><body class="dc-impressao">' +
      '<div class="dc-barra-imp no-print"><b>' + esc(nomeArquivo()) + '</b><button onclick="print()">Salvar em PDF / Imprimir</button></div>' +
      '<img class="dc-cab-fixo" src="../img/recibo-cabecalho.png" alt=""><img class="dc-rod-fixo" src="../img/rodape-documento.png" alt="">' +
      '<table class="dc-pagina"><thead><tr><td><div class="dc-esp-cab"></div></td></tr></thead><tbody><tr><td><div class="dc-corpo">' + htmlBlocos(bl, false).replace(/<span class="falta"[^>]*>([^<]*)<\/span>/g, '[$1]') + '</div></td></tr></tbody>' +
      '<tfoot><tr><td><div class="dc-esp-rod"></div></td></tr></tfoot></table></body></html>');
    w.document.close();
    const pronto = () => Promise.all([...w.document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })));
    Promise.race([Promise.all([pronto(), w.document.fonts ? w.document.fonts.ready : 0]), new Promise((r) => setTimeout(r, 4000))]).then(() => { try { w.focus(); w.print(); } catch (e) { /* o botão fica na tela */ } });
  }

  // ── Word (.docx) com a biblioteca docx, carregada só quando pedem ──
  let _docx = null;
  function carregarDocx() {
    if (_docx) return _docx;
    _docx = new Promise((ok, erro) => { const s = document.createElement('script'); s.src = '../vendor/docx.js'; s.onload = () => ok(window.docx); s.onerror = () => { _docx = null; erro(new Error('Não consegui carregar o gerador de Word. Confira a internet e tente de novo.')); }; document.head.appendChild(s); });
    return _docx;
  }
  const bytes = async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer());
  async function baixarWord() {
    const bl = blocosAtuais(), n = contarFaltas(bl);
    if (n && !confirm('Ainda há ' + n + ' campo' + (n > 1 ? 's' : '') + ' a preencher (em amarelo). Gerar o Word assim mesmo?')) return;
    const D = await carregarDocx();
    const [logo, rod] = await Promise.all([bytes('../img/recibo-cabecalho.png'), bytes('../img/rodape-documento.png')]);
    const FONTE = 'Times New Roman', TAM = 24, NADA = { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const corridas = (txt, extra) => pedacos(txt).map((r) => new D.TextRun(Object.assign({ text: r.falta ? '[' + r.text + ']' : r.text, bold: r.b, italics: r.i, font: FONTE, size: TAM }, r.falta ? { highlight: 'yellow' } : {}, extra || {})));
    const par = (txt, op) => new D.Paragraph(Object.assign({ alignment: D.AlignmentType.JUSTIFIED, spacing: { after: 160, line: 360 }, children: corridas(txt) }, op || {}));
    const centro = (txt, op, extra) => new D.Paragraph(Object.assign({ alignment: D.AlignmentType.CENTER, spacing: { after: 0, line: 300 }, children: corridas(txt, extra) }, op || {}));
    const filhos = [];
    bl.forEach((b) => {
      if (b.t === 'titulo') filhos.push(new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { before: 240, after: 600 }, children: corridas(b.texto, { bold: true }) }));
      else if (b.t === 'p') filhos.push(par(b.texto, b.alinh === 'c' ? { alignment: D.AlignmentType.CENTER } : null));
      else if (b.t === 'fecho') filhos.push(new D.Paragraph({ alignment: D.AlignmentType.CENTER, keepNext: true, spacing: { before: 240, after: 160 }, children: corridas(b.texto) }));
      else if (b.t === 'quebra') filhos.push(new D.Paragraph({ children: [new D.PageBreak()] }));
      else if (b.t === 'recibo') filhos.push(centro(b.numero, { spacing: { after: 80 } }), centro(b.valor, { spacing: { after: 360 } }, { bold: true, size: 32 }));
      else if (b.t === 'bloco') b.linhas.forEach((l, i) => filhos.push(centro(l, { spacing: { after: i === b.linhas.length - 1 ? 160 : 0, line: 300 } })));
      else if (b.t === 'tabela') {
        const larg = (b.larg || b.cab.map(() => 100 / b.cab.length)).map((p) => Math.round(8504 * p / 100));
        const cel = (t, i, cab) => new D.TableCell({ width: { size: larg[i], type: D.WidthType.DXA }, shading: cab ? { fill: '1F3864', type: D.ShadingType.CLEAR, color: 'auto' } : undefined,
          margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new D.Paragraph({ alignment: i && !cab ? D.AlignmentType.RIGHT : D.AlignmentType.LEFT, children: corridas(t, Object.assign({ size: 22 }, cab ? { bold: true, color: 'FFFFFF' } : {})) })] });
        filhos.push(new D.Table({ width: { size: 8504, type: D.WidthType.DXA }, columnWidths: larg,
          rows: [new D.TableRow({ cantSplit: true, tableHeader: true, children: b.cab.map((c, i) => cel(c, i, true)) })].concat(b.linhas.map((l) => new D.TableRow({ cantSplit: true, children: l.map((c, i) => cel(c, i, false)) }))) }));
      } else if (b.t === 'assin') {
        b.linhas.forEach((l, li) => {
          const w = Math.floor(8504 / l.length), cel = (a) => new D.TableCell({ width: { size: w, type: D.WidthType.DXA }, borders: { top: NADA, bottom: NADA, left: NADA, right: NADA },
            children: [].concat(a.rotulo ? [centro(a.rotulo, { spacing: { before: 200, after: 0 } }, { size: 20 })] : [],
              [new D.Paragraph({ spacing: { before: a.rotulo ? 360 : 560, after: 60 }, indent: { left: 240, right: 240 }, border: { bottom: { style: D.BorderStyle.SINGLE, size: 6, color: '000000', space: 1 } }, children: [] }),
                centro(String(a.nome || '').trim() || ' ', null, { bold: true })],
              a.doc ? [centro(a.doc)] : [], a.extra ? [centro(a.extra)] : []) });
          filhos.push(new D.Table({ width: { size: 8504, type: D.WidthType.DXA }, columnWidths: l.map(() => w),
            borders: { top: NADA, bottom: NADA, left: NADA, right: NADA, insideHorizontal: NADA, insideVertical: NADA },
            rows: [new D.TableRow({ cantSplit: true, children: l.map(cel) })] }));
          if (li < b.linhas.length - 1) filhos.push(new D.Paragraph({ spacing: { after: 120 }, children: [] }));
        });
      }
    });
    const doc = new D.Document({
      creator: 'Araújo & Castro', title: nomeArquivo(),
      styles: { default: { document: { run: { font: FONTE, size: TAM } } } },
      sections: [{
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1701, bottom: 1985, left: 1701, right: 1701, header: 0, footer: 0 } } },
        headers: { default: new D.Header({ children: [new D.Paragraph({ indent: { left: -1701 }, spacing: { after: 0 }, children: [new D.ImageRun({ type: 'png', data: logo, transformation: { width: 797.6, height: 109.35 } })] })] }) },
        footers: { default: new D.Footer({ children: [new D.Paragraph({ indent: { left: -1701 }, spacing: { after: 0 }, children: [new D.ImageRun({ type: 'png', data: rod, transformation: { width: 797.6, height: 125.38 } })] })] }) },
        children: filhos }]
    });
    const blob = await D.Packer.toBlob(doc);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nomeArquivo() + '.docx';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    aviso('✓ Word baixado: ' + a.download);
  }

  // ══════════ histórico ══════════
  async function desenharHistorico() {
    $('#dc-area').innerHTML = '<section class="dc-hist"><div class="dc-hist-hd"><h2>🗂 Histórico de documentos</h2>' +
      '<input type="search" id="dc-h-busca" placeholder="Buscar por cliente, número ou título…" aria-label="Buscar no histórico">' +
      '<select id="dc-h-mod" aria-label="Tipo"><option value="">Todos os tipos</option>' + MODELOS.map((m) => '<option value="' + m.id + '">' + esc(m.nome) + '</option>').join('') + '</select></div>' +
      '<div id="dc-h-lista"><p class="dc-vazio">Carregando…</p></div></section>';
    const L = await q(sb.from('documentos_gerados').select('id, modelo, numero, titulo, cliente_id, autor, criado_em, atualizado_em, editado, criado_por').order('atualizado_em', { ascending: false }).limit(500)).catch((e) => { aviso(e.message, true); return []; });
    const pintar = () => {
      const t = ($('#dc-h-busca').value || '').toLowerCase(), m = $('#dc-h-mod').value;
      const F = L.filter((d) => (!m || d.modelo === m) && (!t || (d.titulo + ' ' + d.numero + ' ' + (d.autor || '')).toLowerCase().includes(t)));
      $('#dc-h-lista').innerHTML = F.length ? '<table class="dc-htab"><thead><tr><th>Documento</th><th>Nº</th><th>Feito por</th><th>Atualizado</th><th></th></tr></thead><tbody>' +
        F.map((d) => { const mm = modeloPor(d.modelo) || { icone: '📄', nome: d.modelo };
          return '<tr><td><span class="dc-h-ic">' + mm.icone + '</span><b>' + esc(d.titulo || mm.nome) + '</b>' + (d.editado ? ' <span class="dc-pill">ajustado</span>' : '') + '</td><td>' + esc(d.numero || '—') + '</td><td>' + esc(d.autor || '—') + '</td>' +
            '<td>' + new Date(d.atualizado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) + '</td>' +
            '<td class="dc-h-ac"><button type="button" class="dc-bt dc-mini" data-h-abrir="' + d.id + '">Abrir</button><button type="button" class="dc-bt dc-mini" data-h-dup="' + d.id + '" title="Abre uma cópia para fazer outro igual">Duplicar</button>' +
            (E.admin || d.criado_por === (E.eu && E.eu.id) ? '<button type="button" class="dc-bt dc-mini dc-perigo" data-h-apagar="' + d.id + '" aria-label="Apagar">🗑</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table>'
        : '<p class="dc-vazio">' + (L.length ? 'Nada com esse filtro.' : 'Nenhum documento salvo ainda. Escolha um modelo à esquerda para começar.') + '</p>';
    };
    $('#dc-h-busca').oninput = pintar; $('#dc-h-mod').onchange = pintar;
    $('#dc-h-lista').onclick = (ev) => {
      const a = ev.target.closest('[data-h-abrir]'), d = ev.target.closest('[data-h-dup]'), x = ev.target.closest('[data-h-apagar]');
      if (a) abrirDocumento(a.dataset.hAbrir); if (d) abrirDocumento(d.dataset.hDup, true);
      if (x && confirm('Apagar este documento do histórico? (não dá para desfazer)')) comBotao(x, async () => { await q(sb.from('documentos_gerados').delete().eq('id', x.dataset.hApagar)); L.splice(L.findIndex((z) => z.id === x.dataset.hApagar), 1); pintar(); aviso('Documento apagado.'); });
    };
    pintar();
  }

  // ══════════ escritório (advogados e dados que entram nos documentos) ══════════
  function desenharEscritorio() {
    const campo = (k, r, v, extra) => '<div class="dc-campo"><label>' + r + '</label><input data-e="' + k + '" value="' + esc(v || '') + '"' + (extra || '') + (E.admin ? '' : ' disabled') + '></div>';
    $('#dc-area').innerHTML = '<section class="dc-hist"><div class="dc-hist-hd"><h2>🏛 Escritório e advogados</h2><span class="dc-dica">' + (E.admin ? 'O que estiver aqui entra nos documentos (qualificação, OAB, endereço profissional, foro).' : 'Só o administrador altera estes dados.') + '</span></div>' +
      '<div class="dc-grade dc-esc">' + campo('razao', 'Razão social (recibos do escritório)', ESC.razao || 'Araújo & Castro Advocacia e Consultoria') + campo('cnpj', 'CNPJ do escritório', ESC.cnpj) +
        campo('cidade', 'Cidade padrão dos documentos', ESC.cidade) + campo('foro', 'Foro dos contratos', ESC.foro) + campo('email', 'E-mail profissional', ESC.email) + '</div>' +
      (ESC.advogados || []).map((a, i) => '<fieldset class="dc-parte"><legend>' + esc(a.nome) + '</legend><div class="dc-grade">' +
        ['nome:Nome completo', 'oab:OAB (ex.: OAB/MG 228.471)', 'endereco:Endereço profissional', 'telefone:Telefone', 'cpf:CPF (recibos)', 'nacionalidade:Nacionalidade'].map((x) => { const [k, r] = x.split(':'); return campo(i + '.' + k, r, a[k]); }).join('') +
        '<div class="dc-campo"><label>Tratamento</label><select data-e="' + i + '.genero"' + (E.admin ? '' : ' disabled') + '><option value="m"' + (a.genero !== 'f' ? ' selected' : '') + '>advogado</option><option value="f"' + (a.genero === 'f' ? ' selected' : '') + '>advogada</option></select></div></div></fieldset>').join('') +
      (E.admin ? '<div class="dc-acoes"><button type="button" class="dc-bt dc-prim" id="dc-e-salvar">💾 Salvar dados do escritório</button></div>' : '') + '</section>';
    const b = $('#dc-e-salvar'); if (!b) return;
    b.onclick = () => comBotao(b, async () => {
      const novo = JSON.parse(JSON.stringify(ESC));
      $$('[data-e]').forEach((el) => { const [i, k] = el.dataset.e.split('.'); if (k) novo.advogados[Number(i)][k] = el.value.trim(); else novo[i] = el.value.trim(); });
      await q(sb.rpc('salvar_documentos_escritorio', { p: novo })); Object.assign(ESC, novo); aviso('✓ Dados do escritório salvos.');
    });
  }

  // ══════════ vindos do ERP: ?modelo=…&cliente=… · &contrato=… · &lancamento=… · ?doc=… ══════════
  async function preencherDaUrl() {
    const u = new URLSearchParams(location.search);
    if (u.get('doc')) return abrirDocumento(u.get('doc'));
    const mod = modeloPor(u.get('modelo')) ? u.get('modelo') : null;
    if (!mod && !u.get('lancamento')) return;
    const m = modeloPor(mod || 'recibo'), extra = {};
    if (u.get('cliente') && m.parte) extra[m.parte] = await dadosCliente(u.get('cliente'));
    if (u.get('contrato') && m.id === 'contrato') {
      const [c] = await q(sb.from('contratos').select('*').eq('id', u.get('contrato'))).catch(() => []);
      if (c) {
        if (!extra.contratante && c.cliente_id) extra.contratante = await dadosCliente(c.cliente_id);
        extra.objeto = c.descricao || c.servico || ''; extra.formas = [];
        if (Number(c.valor_mensal) || Number(c.qtd_salarios)) { extra.formas.push('mensal'); Object.assign(extra, { mensal_tipo: Number(c.qtd_salarios) ? 'sm' : 'rs', mensal_valor: c.valor_mensal ? String(c.valor_mensal).replace('.', ',') : '', mensal_sm: c.qtd_salarios || '', mensal_dia: c.dia_vencimento || 10, mensal_inicio: (c.inicio_competencia || '').slice(0, 7) }); }
        else if (Number(c.valor_total)) { extra.formas.push('fixo'); extra.fixo_valor = String(c.valor_total).replace('.', ',');
          extra.fixo_quando = Number(c.num_parcelas) > 1 ? 'em ' + c.num_parcelas + ' (' + inteiroExtenso(c.num_parcelas) + ') parcelas mensais e sucessivas de ' + brl(c.valor_total / c.num_parcelas) + (c.primeiro_vencimento ? ', a primeira em ' + c.primeiro_vencimento.split('-').reverse().join('/') : '') : 'na assinatura deste contrato'; }
        if (Number(c.percentual_exito)) { extra.formas.push('exito'); Object.assign(extra, { exito_tipo: 'pct', exito_pct: String(c.percentual_exito).replace('.', ',') }); }
        if (!extra.formas.length) extra.formas = ['fixo'];
        if (c.data_contrato) extra.data = c.data_contrato;
      }
    }
    if (u.get('lancamento')) {
      const [l] = await q(sb.from('lancamentos').select('*').eq('id', u.get('lancamento'))).catch(() => []);
      if (l) { Object.assign(extra, { valor: String(l.valor || '').replace('.', ','), pago_em: l.data_pagamento || hojeISO(), referente: l.descricao ? 'honorários advocatícios — ' + l.descricao : 'honorários advocatícios',
        forma: /pix/i.test(l.forma_pagamento || '') ? 'pix' : /boleto/i.test(l.forma_pagamento || '') ? 'boleto' : /dinheiro|esp[eé]cie/i.test(l.forma_pagamento || '') ? 'dinheiro' : /transf|ted|doc/i.test(l.forma_pagamento || '') ? 'transferencia' : 'pix' });
        if (l.cliente_id && !extra.pagador) extra.pagador = await dadosCliente(l.cliente_id); }
    }
    novoDocumento(m.id, extra); E.sujo = true; prever();
  }

  // ══════════ início ══════════
  // Backup 34: dentro do ERP (iframe) a Central esconde a barra própria — o ERP já tem a dele
  if (window.self !== window.top) document.documentElement.classList.add('dc-embutido');
  async function iniciar() {
    if (!sb) return bloqueio('O ERP não está configurado neste endereço.');
    const { data: s } = await sb.auth.getSession();
    if (!s || !s.session) return bloqueio('Entre no ERP primeiro — esta tela usa o mesmo login.');
    const eu = s.session.user;
    const [perfil, esc2, clientes, grupos] = await Promise.all([
      q(sb.from('perfis').select('id, nome, email, papel').eq('id', eu.id)).then((r) => r[0]).catch(() => null),
      q(sb.from('configuracoes').select('valor').eq('chave', 'documentos_escritorio')).then((r) => r[0] && r[0].valor).catch(() => null),
      q(sb.from('clientes').select('id, nome, razao_social, cpf_cnpj, grupo_id, endereco, cidade, estado, cep, socio_admin').order('nome').limit(5000)).catch(() => []),
      q(sb.from('grupos').select('id, nome')).catch(() => [])]);
    E.eu = perfil || { id: eu.id, nome: eu.email }; E.admin = !!perfil && perfil.papel === 'admin';
    if (esc2) Object.assign(ESC, esc2);
    E.clientes = clientes; grupos.forEach((g2) => { E.grupos[g2.id] = g2.nome; });
    $('#dc-eu').textContent = E.eu.nome || E.eu.email || '';
    // menu de modelos (por grupo)
    const grs = []; MODELOS.forEach((m) => { let g2 = grs.find((x) => x.nome === m.grupo); if (!g2) grs.push(g2 = { nome: m.grupo, ms: [] }); g2.ms.push(m); });
    $('#dc-menu').innerHTML = grs.map((g2) => '<div class="dc-menu-g"><h4>' + esc(g2.nome) + '</h4>' + g2.ms.map((m) => '<button type="button" class="dc-mod" data-mod="' + m.id + '"><span>' + m.icone + '</span><b>' + esc(m.nome) + '</b></button>').join('') + '</div>').join('');
    $('#dc-menu').onclick = (ev) => { const b = ev.target.closest('[data-mod]'); if (!b) return; if (E.sujo && !confirm('Há alterações não salvas. Começar outro documento mesmo assim?')) return; try { history.replaceState(null, '', '?'); } catch (e) { /* ok */ } novoDocumento(b.dataset.mod); };
    $$('[data-vista]').forEach((b) => b.onclick = () => { if (E.vista === 'novo' && E.sujo && !confirm('Há alterações não salvas. Sair mesmo assim?')) return; E.vista = b.dataset.vista; E.sujo = false; desenhar(); });
    const area = $('#dc-area');
    area.addEventListener('input', (ev) => { if (ev.target.matches('[data-busca-cli]')) { clearTimeout(_tBusca); _tBusca = setTimeout(() => sugerir(ev.target), 150); return; } if (ev.target.closest('#dc-campos')) aoMudar(ev); });
    area.addEventListener('change', (ev) => { if (ev.target.closest('#dc-campos') && !ev.target.matches('[data-busca-cli]')) aoMudar(ev); });
    area.addEventListener('click', (ev) => {
      const c = ev.target.closest('[data-cli]'); if (c) { const k = c.closest('.dc-parte').dataset.campo; escolherCliente(k, c.dataset.cli); return; }
      const dv = ev.target.closest('[data-desvincula]'); if (dv) { const p = E.dados[dv.dataset.desvincula] || {}; delete p.cliente_id; delete p.grupo_id; desenharCampos(); return; }
      const tm = ev.target.closest('[data-tab-mais]'); if (tm) { const k = tm.dataset.tabMais; E.dados[k] = (E.dados[k] || []).concat([['', '', '']]); desenharCampos(); prever(); return; }
      const tt = ev.target.closest('[data-tab-tira]'); if (tt) { const [k, i] = tt.dataset.tabTira.split(','); E.dados[k] = (E.dados[k] || []).filter((x, j) => j !== Number(i)); desenharCampos(); prever(); return; }
      if (!ev.target.closest('.dc-busca-cli')) $$('.dc-sug').forEach((x) => { x.hidden = true; });
    });
    window.addEventListener('beforeunload', (ev) => { if (E.sujo) { ev.preventDefault(); ev.returnValue = ''; } });
    novoDocumento('procuracao'); E.sujo = false;
    await preencherDaUrl().catch((e) => aviso(e.message, true));
    document.body.classList.add('dc-pronto');
  }
  function bloqueio(msg) { $('#dc-area').innerHTML = '<section class="dc-hist"><p class="dc-vazio"><b>' + esc(msg) + '</b><br><br><a class="dc-bt dc-prim" href="../index.html" target="_top">Entrar no ERP</a></p></section>'; document.body.classList.add('dc-pronto'); }

  // para os testes (sem expor dados): os mesmos cálculos que o documento usa
  window.DOCS = { extenso: dinheiroExtenso, numExtenso, dataExtenso, estado: () => E, blocos: () => blocosAtuais(), faltas: () => contarFaltas(blocosAtuais()) };
  document.addEventListener('DOMContentLoaded', () => iniciar().catch((e) => { console.error(e); aviso(e.message || String(e), true); }));
})();
