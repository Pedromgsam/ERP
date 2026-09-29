'use strict';
// ═══════════════════════════════════════════════════════════════════
// Conciliar extrato (OFX do Sicoob ou de qualquer banco): lê o arquivo no
// navegador, pega só as ENTRADAS e procura o honorário em aberto de mesmo
// valor. Três grupos: identificados (marcados para baixa), em dúvida (escolher
// entre os candidatos) e não identificados (o escritório escolhe à mão ou ignora).
// A data do recebimento é a do banco. O FITID do banco evita tratar duas vezes.
// ═══════════════════════════════════════════════════════════════════

// OFX 1.x (SGML, tags sem fechamento) e 2.x (XML): uma entrada por <STMTTRN>
function lerOfx(texto) {
  const tag = (bloco, t) => { const m = new RegExp('<' + t + '>\\s*([^<\\r\\n]*)', 'i').exec(bloco); return m ? m[1].trim() : ''; };
  return String(texto || '').split(/<STMTTRN>/i).slice(1).map((b) => {
    const bloco = b.split(/<\/STMTTRN>/i)[0], d = tag(bloco, 'DTPOSTED');
    return { fitid: tag(bloco, 'FITID'), tipo: tag(bloco, 'TRNTYPE').toUpperCase(), valor: Number(tag(bloco, 'TRNAMT').replace(',', '.')) || 0,
      data: d.length >= 8 ? d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8) : '', nome: tag(bloco, 'NAME'), memo: tag(bloco, 'MEMO') };
  }).filter((t) => t.valor > 0 && t.data && t.fitid);
}
// palavras "de verdade" do nome (tira LTDA, ME, PIX, TED…)
const PALAVRAS_VAZIAS = /^(ltda|me|epp|eireli|sa|s\/a|pix|ted|doc|transf|transferencia|recebido|recebida|credito|cred|de|da|do|dos|das|e|pagamento|pag|ref|grupo|familia|holding|participacoes|comercio|servicos|industria|demo)$/;
function palavras(s) { return normalizar(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !PALAVRAS_VAZIAS.test(w)); }
function nomeBate(t, l) {
  const doExtrato = new Set(palavras(t.nome + ' ' + t.memo)), dig = soDigitos(t.nome + ' ' + t.memo);
  const cl = l.cliente_id ? E.clientes.find((c) => c.id === l.cliente_id) : null;
  const doc = cl ? soDigitos(cl.cpf_cnpj) : '';
  if (doc && doc.length >= 11 && dig.includes(doc)) return true;
  const alvo = palavras([(l.clientes && l.clientes.nome) || '', (l.grupos && l.grupos.nome) || '', l.favorecido || '', cl ? cl.nome : ''].join(' '));
  return alvo.some((w) => doExtrato.has(w));
}
function casar(entradas, abertos) {
  const usados = new Set();
  return entradas.map((t) => {
    const mesmoValor = abertos.filter((l) => Math.abs(Number(l.valor) - t.valor) < 0.01);
    const perto = mesmoValor.filter((l) => Math.abs(new Date(l.vencimento) - new Date(t.data)) <= 45 * 864e5);
    const porNome = perto.filter((l) => nomeBate(t, l));
    let certo = null, cands = [];
    const dist = (l) => Math.abs(new Date(l.vencimento) - new Date(t.data)) / 864e5;
    if (porNome.length === 1) certo = porNome[0];
    else if (porNome.length > 1) {
      // mesmo cliente com vários honorários iguais (mensalidade): fica o de vencimento mais perto, se for claramente o mais perto
      const o = porNome.slice().sort((a, b) => dist(a) - dist(b));
      if (dist(o[0]) <= 20 && dist(o[1]) - dist(o[0]) >= 7) certo = o[0]; else cands = o;
    }
    else if (perto.length === 1 && Math.abs(new Date(perto[0].vencimento) - new Date(t.data)) <= 10 * 864e5) cands = perto;
    else cands = perto.length ? perto : mesmoValor;
    if (certo && usados.has(certo.id)) { cands = [certo]; certo = null; }
    if (certo) usados.add(certo.id);
    return { t, certo, cands: cands.slice(0, 5) };
  });
}

async function conciliarOfx(empresa) {
  if (!pode(empresa === 'contabilidade' ? 'financeiro_contab' : 'financeiro_juridico', 'propor')) return aviso('Sem acesso ao financeiro desta área.', true);
  await carregarCadastros();
  const nomeEmp = empresa === 'contabilidade' ? 'Contabilidade' : 'Jurídico';
  const j = abrirJanela({ titulo: '🏦 Conciliar extrato — ' + nomeEmp, larga: true,
    corpo: '<div id="ofx-corpo"><ol class="passos"><li>No app ou internet banking do Sicoob: <b>Extrato → escolha o período → Exportar / Salvar em OFX</b>.</li>' +
      '<li>Escolha o arquivo abaixo. Nada é gravado antes de você conferir.</li></ol>' +
      '<label class="btn btn-p" style="cursor:pointer;margin-top:8px">Escolher arquivo .ofx<input type="file" id="ofx-arq" accept=".ofx,.OFX,.txt" hidden></label>' +
      '<p class="sub" style="margin-top:8px">O arquivo é lido aqui no seu computador; só as entradas (créditos) são usadas.</p></div>',
    rodape: '<span class="sub" id="ofx-resumo"></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Fechar</button><button class="btn btn-p" type="button" id="ofx-gravar" hidden>✓ Dar como recebidos os marcados</button></div>' });
  j.querySelector('.janela').classList.add('janela-ofx');
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#ofx-arq').onchange = async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    const buf = await f.arrayBuffer();
    let txt = new TextDecoder('utf-8').decode(buf); if (/�/.test(txt)) txt = new TextDecoder('windows-1252').decode(buf);
    const todas = lerOfx(txt);
    if (!todas.length) return aviso('Nenhuma entrada encontrada no arquivo. Confira se é um extrato OFX.', true);
    const [tratados, abertos] = await Promise.all([
      q(sb.from('extrato_itens').select('fitid').in('fitid', todas.map((t) => t.fitid))).catch(() => []),
      buscarTodos(() => sb.from('lancamentos').select('*, grupos(nome), clientes(nome)').eq('empresa', empresa).eq('tipo', 'receita').eq('pago', false).eq('perda', false).eq('redutor', false))
    ]);
    const ja = new Set(tratados.map((x) => x.fitid)), entradas = todas.filter((t) => !ja.has(t.fitid));
    pintar(casar(entradas, abertos), abertos, todas.length - entradas.length);
  };
  const quem = (l) => (l.grupos && l.grupos.nome) || (l.clientes && l.clientes.nome) || l.favorecido || '';
  const rotLanc = (l) => dataBR(l.vencimento) + ' · ' + quem(l) + ' · ' + l.descricao + ' · ' + brl(l.valor);
  let itens = [];
  function pintar(lista, abertos, repetidos) {
    itens = lista;
    const ok = lista.filter((x) => x.certo), duv = lista.filter((x) => !x.certo && x.cands.length), nao = lista.filter((x) => !x.certo && !x.cands.length);
    const linhaT = (x) => '<div class="ofx-t"><b>' + brl(x.t.valor) + '</b> em ' + dataBR(x.t.data) + '<div class="sub">' + esc(x.t.nome || '—') + (x.t.memo ? ' · ' + esc(x.t.memo) : '') + '</div></div>';
    const opcoes = (lst, marcado) => lst.map((l) => '<option value="' + l.id + '"' + (l.id === marcado ? ' selected' : '') + '>' + esc(rotLanc(l)) + '</option>').join('');
    // não identificados: todos os abertos, os de valor mais parecido primeiro
    const todosOrdenados = (v) => abertos.slice().sort((a, b) => Math.abs(a.valor - v) - Math.abs(b.valor - v)).slice(0, 60);
    j.querySelector('#ofx-corpo').innerHTML =
      (repetidos ? '<div class="dica" style="margin-bottom:10px">' + repetidos + ' entrada(s) deste arquivo já foram tratadas antes e ficaram de fora.</div>' : '') +
      '<div class="secao">✓ Identificados (' + ok.length + ')</div>' + (ok.length ? '<div class="lista-ficha">' + ok.map((x) => { const i = lista.indexOf(x);
        return '<label class="item-ficha ofx-it"><input type="checkbox" data-ofx-ok="' + i + '" checked>' + linhaT(x) + '<span class="ofx-seta">→</span><div class="ofx-l">' + esc(rotLanc(x.certo)) + '</div></label>'; }).join('') + '</div>'
        : '<div class="sub" style="margin-bottom:8px">Nenhum com valor e nome batendo.</div>') +
      '<div class="secao">? Em dúvida (' + duv.length + ') <span class="sub">— mesmo valor, mas o nome não bate ou há mais de um</span></div>' + (duv.length ? '<div class="lista-ficha">' + duv.map((x) => { const i = lista.indexOf(x);
        return '<div class="item-ficha ofx-it">' + linhaT(x) + '<span class="ofx-seta">→</span><select class="busca sel ofx-sel" data-ofx-esc="' + i + '"><option value="">— deixar para depois —</option><option value="ignorar">Ignorar (não é honorário)</option>' + opcoes(x.cands) + '</select></div>'; }).join('') + '</div>'
        : '<div class="sub" style="margin-bottom:8px">Nenhuma.</div>') +
      '<div class="secao">✗ Não identificados (' + nao.length + ') <span class="sub">— escolha o honorário à mão, ignore ou deixe para depois</span></div>' + (nao.length ? '<div class="lista-ficha">' + nao.map((x) => { const i = lista.indexOf(x);
        return '<div class="item-ficha ofx-it">' + linhaT(x) + '<span class="ofx-seta">→</span><select class="busca sel ofx-sel" data-ofx-esc="' + i + '"><option value="">— deixar para depois —</option><option value="ignorar">Ignorar (não é honorário)</option>' + opcoes(todosOrdenados(x.t.valor)) + '</select></div>'; }).join('') + '</div>'
        : '<div class="sub">Nenhum.</div>');
    j.querySelector('#ofx-gravar').hidden = !lista.length;
    const conta = () => { const n = j.querySelectorAll('[data-ofx-ok]:checked').length + [...j.querySelectorAll('[data-ofx-esc]')].filter((s) => s.value && s.value !== 'ignorar').length;
      j.querySelector('#ofx-resumo').textContent = lista.length + ' entrada(s) · ' + n + ' pagamento(s) para registrar'; };
    j.querySelectorAll('[data-ofx-ok],[data-ofx-esc]').forEach((el) => { el.onchange = conta; });
    conta();
  }
  j.querySelector('#ofx-gravar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const escolhas = [];
    j.querySelectorAll('[data-ofx-ok]:checked').forEach((c) => { const x = itens[+c.dataset.ofxOk]; escolhas.push([x.t, x.certo.id]); });
    j.querySelectorAll('[data-ofx-esc]').forEach((s) => { if (s.value) escolhas.push([itens[+s.dataset.ofxEsc].t, s.value]); });
    const lancs = escolhas.filter(([, id]) => id !== 'ignorar').map(([, id]) => id);
    if (new Set(lancs).size !== lancs.length) throw new Error('O mesmo honorário foi escolhido para duas entradas do extrato. Corrija antes de gravar.');
    if (!escolhas.length) throw new Error('Marque ou escolha pelo menos uma entrada.');
    let baixas = 0, ign = 0, rasc = 0;
    for (const [t, id] of escolhas) {
      const reg = { fitid: t.fitid, empresa, data: t.data, valor: t.valor, nome: t.nome.slice(0, 200), memo: t.memo.slice(0, 300) };
      if (id === 'ignorar') { await q(sb.from('extrato_itens').insert(Object.assign(reg, { situacao: 'ignorado' }))); ign++; continue; }
      const { error } = await sb.from('lancamentos').update({ pago: true, data_pagamento: t.data, cobranca: '', perda: false }).eq('id', id);
      if (error && error.rascunho) { rasc++; continue; }
      if (error) throw new Error(erroAmigavel(error));
      await q(sb.from('extrato_itens').insert(Object.assign(reg, { situacao: 'baixado', lancamento_id: id })));
      baixas++;
    }
    fecharJanela(j);
    aviso(rasc ? '📝 ' + rasc + ' pagamento(s) enviado(s) para aprovação' + (baixas ? '; ' + baixas + ' registrado(s)' : '') + '.'
      : '✓ ' + baixas + ' pagamento(s) registrado(s) com a data do banco' + (ign ? ' · ' + ign + ' entrada(s) ignorada(s)' : '') + '.');
    if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); else await recarregar();
  });
}
