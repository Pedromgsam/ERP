'use strict';
// ═══════════════════════════════════════════════════════════════════
// Lançamentos e edições dentro do ERP.
//  • Passe o mouse numa linha de tabela → botão "✎ Editar" (no celular: toque).
//  • Menu lateral "Lançar": novo honorário/despesa, cliente, processo,
//    acordo, parcelamento; Tarefas; Gestão (importar, backup, histórico, usuários).
// Tudo grava direto no Supabase e o ERP recarrega os dados na hora.
// ═══════════════════════════════════════════════════════════════════
(function () {
  const sb = window.SB;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const hojeISO = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const brData = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');
  const brValor = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const aviso = (m) => { if (typeof window.toast === 'function') window.toast(m); else alert(m); };
  const ehCliente = () => !window.AC_SESSION || window.AC_SESSION.nivel === 'cliente';
  function erroAmigavel(e) {
    const m = (e && (e.message || e.details)) || String(e);
    if (/row-level security|permission denied|42501/i.test(m)) return 'Seu usuário não tem permissão para isso.';
    if (/duplicate key|23505/i.test(m)) return 'Já existe um registro igual.';
    if (/violates check constraint/i.test(m)) return 'Algum campo obrigatório ficou vazio ou com valor inválido.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com a internet. Nada foi gravado.';
    return m;
  }

  // ───────────────────── definição dos formulários ─────────────────────
  const PESSOAS = ['Pedro', 'Emanuelle', 'Escritório', 'Adriana'];
  const SN = { tipo: 'sn' };
  const F = {
    lancamentos: {
      nome: 'Honorário / despesa',
      campos: [
        { k: 'empresa', rot: 'Empresa', tipo: 'sel', ops: [['escritorio', 'Jurídico (escritório)'], ['contabilidade', 'Contabilidade']], req: true },
        { k: 'tipo', rot: 'Tipo', tipo: 'sel', ops: [['receita', 'Receita (honorário a receber)'], ['despesa', 'Despesa / dedução']], req: true },
        { k: 'grupo_id', rot: 'Grupo (cliente)', tipo: 'grupo' },
        { k: 'favorecido', rot: 'Fornecedor (só despesa)', tipo: 'texto' },
        { k: 'categoria', rot: 'Tipo de honorário / categoria', tipo: 'texto', lista: 'categorias' },
        { k: 'responsavel', rot: 'Advogado / responsável', tipo: 'texto', lista: PESSOAS },
        { k: 'referencia', rot: 'Referência', tipo: 'texto', dica: 'ex.: 03/2026, parcela 2/10' },
        { k: 'descricao', rot: 'Descrição', tipo: 'texto', dica: 'se deixar vazio, uso tipo + referência' },
        { k: 'vencimento', rot: 'Vencimento', tipo: 'data', req: true },
        { k: 'valor', rot: 'Valor (R$)', tipo: 'num', req: true, dica: 'sempre positivo; dedução/comissão = tipo Despesa com grupo' },
        { k: 'pago', rot: 'Pago', tipo: 'bool' },
        { k: 'data_pagamento', rot: 'Data do pagamento', tipo: 'data' },
        { k: 'forma_pagamento', rot: 'Forma de pagamento', tipo: 'texto', lista: ['PIX', 'Boleto', 'Transferência', 'Dinheiro', 'Cheque', 'Cartão'] },
        { k: 'conta', rot: 'Banco / conta', tipo: 'texto' },
        { k: 'chave_pix', rot: 'Chave PIX', tipo: 'texto' },
        { k: 'cobranca', rot: 'Cobrança', tipo: 'texto', lista: ['Cobrado', 'Emitir guia', 'Previsão: '], dica: 'Cobrado · Emitir guia · Previsão: dd/mm/aaaa' },
        { k: 'perda', rot: 'Prejuízo (não vai receber)', tipo: 'bool' },
        { k: 'obs', rot: 'Observação', tipo: 'area' }
      ],
      baixa: true,
      antesDeGravar(d) {
        if (!d.descricao) d.descricao = [d.categoria || (d.tipo === 'despesa' ? 'Despesa' : 'Honorários'), d.referencia ? '(' + d.referencia + ')' : '', d.tipo === 'despesa' && d.favorecido ? '— ' + d.favorecido : ''].filter(Boolean).join(' ');
        if (!(Number(d.valor) > 0)) throw new Error('Informe um valor maior que zero (dedução: escolha o tipo Despesa).');
      }
    },
    clientes: {
      nome: 'Cliente / empresa',
      campos: [
        { k: 'grupo_id', rot: 'Grupo', tipo: 'grupo' },
        { k: 'nome', rot: 'Nome / razão social', tipo: 'texto', req: true },
        { k: 'cpf_cnpj', rot: 'CPF / CNPJ', tipo: 'texto' },
        { k: 'socio_admin', rot: 'Sócio administrador', tipo: 'texto' },
        { k: 'tipo', rot: 'Tipo de cliente', tipo: 'sel', ops: [['Consultoria', 'Consultoria'], ['Demanda', 'Demanda'], ['Inativo', 'Inativo']] },
        { k: 'responsavel', rot: 'Responsável', tipo: 'texto', lista: PESSOAS },
        { k: 'rfb', rot: 'RFB (R$)', tipo: 'num' }, { k: 'rfb_negociada', rot: 'RFB negociada (R$)', tipo: 'num' },
        { k: 'pgfn', rot: 'PGFN (R$)', tipo: 'num' }, { k: 'pgfn_negociada', rot: 'PGFN negociada (R$)', tipo: 'num' },
        { k: 'age_mg', rot: 'AGE/MG (R$)', tipo: 'num' }, { k: 'age_mg_negociada', rot: 'AGE/MG negociada (R$)', tipo: 'num' },
        { k: 'sefaz_mg', rot: 'SEFAZ/MG (R$)', tipo: 'num' }, { k: 'ceat_trt3', rot: 'CEAT/TRT3 (R$)', tipo: 'num' },
        Object.assign({ k: 'em_operacao', rot: 'Em operação' }, SN),
        Object.assign({ k: 'procuracao', rot: 'Procuração' }, SN),
        Object.assign({ k: 'certificado', rot: 'Certificado digital' }, SN),
        { k: 'capag', rot: 'CAPAG', tipo: 'texto', lista: ['A', 'B', 'C', 'D', 'Omisso'] },
        { k: 'regime_tributario', rot: 'Regime tributário', tipo: 'texto', lista: ['Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'MEI'] },
        { k: 'situacao_cadastral', rot: 'Situação cadastral', tipo: 'texto', lista: ['Ativa', 'Inapta', 'Baixada', 'Suspensa'] },
        { k: 'tipo_societario', rot: 'Tipo societário', tipo: 'texto' },
        { k: 'email', rot: 'E-mail', tipo: 'texto' }, { k: 'telefone', rot: 'Telefone', tipo: 'texto' },
        { k: 'endereco', rot: 'Endereço', tipo: 'texto' }, { k: 'cidade', rot: 'Cidade', tipo: 'texto' },
        { k: 'estado', rot: 'UF', tipo: 'texto' },
        { k: 'obs', rot: 'Observação', tipo: 'area' }
      ]
    },
    processos: {
      nome: 'Processo',
      campos: [
        { k: 'grupo_id', rot: 'Grupo', tipo: 'grupo' },
        { k: 'carteira', rot: 'Carteira', tipo: 'sel', ops: [['Ativo', 'Ativos'], ['Prospecção', 'Prospecção']] },
        { k: 'numero', rot: 'Nº do processo', tipo: 'texto', req: true },
        { k: 'advogado', rot: 'Advogado', tipo: 'texto', lista: PESSOAS },
        { k: 'competencia', rot: 'Competência', tipo: 'texto', lista: ['Federal', 'Estadual', 'Trabalhista'] },
        { k: 'natureza', rot: 'Natureza', tipo: 'texto' },
        { k: 'autor', rot: 'Autor', tipo: 'texto' }, { k: 'reu', rot: 'Réu', tipo: 'texto' },
        { k: 'data_distribuicao', rot: 'Distribuição', tipo: 'data' },
        { k: 'valor', rot: 'Valor da causa (R$)', tipo: 'num' },
        { k: 'atualizacao', rot: 'Última atualização', tipo: 'data' },
        Object.assign({ k: 'procuracao', rot: 'Procuração' }, SN),
        Object.assign({ k: 'outro_advogado', rot: 'Outro advogado' }, SN),
        { k: 'status', rot: 'Status', tipo: 'texto', lista: ['Em andamento', 'Aguardando Decisão', 'Bloqueio Realizado', 'Arq. Provisoriamente', 'Arquivado', 'Extinto'] },
        { k: 'data_arq_provisorio', rot: 'Arquivamento provisório em', tipo: 'data' },
        { k: 'prescricao', rot: 'Prescrição', tipo: 'sel', ops: [['', '—'], ['Prescrito', 'Prescrito']] },
        { k: 'obs', rot: 'Observação', tipo: 'area' }
      ]
    },
    acordos: {
      nome: 'Parcela de acordo',
      campos: [
        { k: 'grupo_id', rot: 'Grupo', tipo: 'grupo' },
        { k: 'processo', rot: 'Processo', tipo: 'texto', req: true },
        { k: 'responsavel', rot: 'Responsável', tipo: 'texto', lista: PESSOAS },
        { k: 'devedor', rot: 'Devedor', tipo: 'texto' }, { k: 'credor', rot: 'Credor', tipo: 'texto' },
        { k: 'parcela', rot: 'Parcela nº', tipo: 'texto' }, { k: 'total_parcelas', rot: 'Total de parcelas', tipo: 'texto' },
        { k: 'valor', rot: 'Valor (R$)', tipo: 'num' },
        { k: 'vencimento', rot: 'Vencimento', tipo: 'data', req: true },
        { k: 'situacao', rot: 'Aviso', tipo: 'sel', ops: [['', '—'], ['Emitir Guia', 'Emitir guia']] },
        { k: 'pago', rot: 'Pago', tipo: 'bool' },
        { k: 'data_pagamento', rot: 'Data do pagamento', tipo: 'data' },
        { k: 'pix', rot: 'PIX', tipo: 'texto' }, { k: 'banco', rot: 'Banco', tipo: 'texto' },
        { k: 'obs', rot: 'Observação', tipo: 'area' }
      ],
      baixa: true,
      antesDeGravar(d) { if (d.pago && !d.data_pagamento) d.data_pagamento = hojeISO(); if (!d.pago) d.data_pagamento = null; }
    },
    parcelamentos: {
      nome: 'Parcelamento',
      campos: [
        { k: 'grupo_id', rot: 'Grupo', tipo: 'grupo' },
        { k: 'empresa', rot: 'Empresa', tipo: 'texto', req: true, lista: 'empresas' },
        { k: 'cnpj', rot: 'CNPJ', tipo: 'texto' },
        { k: 'local', rot: 'Local', tipo: 'texto', lista: ['e-CAC', 'Regularize', 'SIARE', 'Simples Nacional'] },
        { k: 'natureza', rot: 'Natureza', tipo: 'texto', lista: ['Simples Nacional', 'Previdenciário', 'Não previdenciário', 'ICMS'] },
        { k: 'numero', rot: 'Nº do parcelamento', tipo: 'texto' },
        { k: 'total_parcelas', rot: 'Total de parcelas', tipo: 'num' },
        { k: 'valor_ultima_parcela', rot: 'Valor da parcela (R$)', tipo: 'num' },
        { k: 'valor_residual', rot: 'Saldo residual (R$)', tipo: 'num' },
        { k: 'obs', rot: 'Observação', tipo: 'area' }
      ]
    },
    tarefas: {
      nome: 'Tarefa',
      campos: [
        { k: 'titulo', rot: 'Tarefa', tipo: 'texto', req: true },
        { k: 'grupo_id', rot: 'Grupo', tipo: 'grupo' },
        { k: 'processos_vinculados', rot: 'Processos vinculados', tipo: 'texto' },
        { k: 'responsavel', rot: 'Responsável', tipo: 'texto', lista: PESSOAS },
        { k: 'prioridade', rot: 'Prioridade', tipo: 'sel', ops: [['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']] },
        { k: 'status', rot: 'Status', tipo: 'sel', ops: [['pendente', 'Pendente'], ['andamento', 'Em andamento'], ['aguardando', 'Aguardando'], ['concluida', 'Concluída'], ['cancelada', 'Cancelada']] },
        { k: 'inicio', rot: 'Início', tipo: 'data' }, { k: 'prazo', rot: 'Prazo', tipo: 'data' },
        { k: 'obs', rot: 'Observação', tipo: 'area' }
      ]
    }
  };

  // ───────────────────────────── janela ─────────────────────────────
  function abrirJanela(titulo, corpoHtml, largura) {
    fecharJanela();
    const fundo = document.createElement('div');
    fundo.className = 'gx-fundo';
    fundo.innerHTML = '<div class="gx-janela" role="dialog" aria-modal="true" style="max-width:' + (largura || 760) + 'px">'
      + '<div class="gx-topo"><h3>' + esc(titulo) + '</h3><button type="button" class="gx-x" aria-label="Fechar">✕</button></div>'
      + '<div class="gx-corpo">' + corpoHtml + '</div></div>';
    document.body.appendChild(fundo);
    fundo.addEventListener('mousedown', (e) => { if (e.target === fundo) fecharJanela(); });
    fundo.querySelector('.gx-x').addEventListener('click', fecharJanela);
    return fundo.querySelector('.gx-janela');
  }
  function fecharJanela() { document.querySelectorAll('.gx-fundo').forEach((f) => f.remove()); }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharJanela(); });

  let _grupos = [];
  async function carregarGrupos() {
    const { data } = await sb.from('grupos').select('id,nome').order('nome');
    _grupos = data || [];
  }
  const nomeGrupo = (id) => (_grupos.find((g) => g.id === id) || {}).nome || '';
  async function idDoGrupo(nome) {
    nome = String(nome || '').trim();
    if (!nome) return null;
    const achado = _grupos.find((g) => g.nome.trim().toLowerCase() === nome.toLowerCase());
    if (achado) return achado.id;
    if (!confirm('O grupo "' + nome + '" não existe. Criar agora?')) throw new Error('Escolha um grupo existente.');
    const { data, error } = await sb.from('grupos').insert({ nome }).select('id,nome').single();
    if (error) throw error;
    _grupos.push(data);
    return data.id;
  }
  function listaSugestoes(lista) {
    const DB = window.DB || {};
    if (lista === 'categorias') return [...new Set([...(DB.financeiro || []), ...(DB.financeiroContabilidade || [])].map((f) => f.tipo).filter(Boolean))].sort();
    if (lista === 'empresas') return [...new Set((DB.baseDados || []).map((b) => b.nome))].sort();
    return lista || [];
  }

  function campoHtml(c, v) {
    const id = 'gx-f-' + c.k;
    const rot = '<label for="' + id + '">' + esc(c.rot) + (c.req ? ' <b>*</b>' : '') + '</label>';
    const dica = c.dica ? '<small>' + esc(c.dica) + '</small>' : '';
    let inp;
    if (c.tipo === 'sel') inp = '<select id="' + id + '">' + c.ops.map((o) => '<option value="' + esc(o[0]) + '"' + (String(v ?? '') === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
    else if (c.tipo === 'sn') inp = '<select id="' + id + '"><option value="">—</option><option value="1"' + (v === true ? ' selected' : '') + '>SIM</option><option value="0"' + (v === false ? ' selected' : '') + '>NÃO</option></select>';
    else if (c.tipo === 'bool') return '<div class="gx-campo gx-bool"><label><input type="checkbox" id="' + id + '"' + (v ? ' checked' : '') + '> ' + esc(c.rot) + '</label></div>';
    else if (c.tipo === 'area') return '<div class="gx-campo gx-largo">' + rot + '<textarea id="' + id + '" rows="2">' + esc(v) + '</textarea></div>';
    else if (c.tipo === 'grupo') inp = '<input id="' + id + '" list="gx-l-grupos" autocomplete="off" value="' + esc(nomeGrupo(v)) + '" placeholder="digite para buscar">';
    else {
      const lista = listaSugestoes(c.lista);
      const lid = lista.length ? 'gx-l-' + c.k : '';
      inp = '<input id="' + id + '" type="' + (c.tipo === 'data' ? 'date' : c.tipo === 'num' ? 'number' : 'text') + '"'
        + (c.tipo === 'num' ? ' step="0.01" inputmode="decimal"' : '') + (lid ? ' list="' + lid + '"' : '')
        + ' value="' + esc(v == null ? '' : (c.tipo === 'data' ? String(v).slice(0, 10) : v)) + '">'
        + (lid ? '<datalist id="' + lid + '">' + lista.map((x) => '<option value="' + esc(x) + '">').join('') + '</datalist>' : '');
    }
    return '<div class="gx-campo">' + rot + inp + dica + '</div>';
  }
  async function lerCampos(janela, def) {
    const d = {};
    for (const c of def.campos) {
      const el = janela.querySelector('#gx-f-' + c.k);
      if (!el) continue;
      if (c.tipo === 'bool') d[c.k] = el.checked;
      else if (c.tipo === 'sn') d[c.k] = el.value === '' ? null : el.value === '1';
      else if (c.tipo === 'num') d[c.k] = el.value === '' ? null : Number(el.value);
      else if (c.tipo === 'data') d[c.k] = el.value || null;
      else if (c.tipo === 'grupo') d[c.k] = await idDoGrupo(el.value);
      else d[c.k] = el.value.trim();
      if (c.req && (d[c.k] === null || d[c.k] === '')) throw new Error('Preencha: ' + c.rot);
    }
    return d;
  }

  // ─────────────────────────── formulário ───────────────────────────
  // tabela: chave de F; id: registro a editar (ou null = novo); padrao: valores iniciais
  async function abrirFormulario(tabela, id, padrao, extra) {
    if (ehCliente()) return aviso('🔒 Acesso é somente leitura.');
    const def = F[tabela];
    await carregarGrupos();
    let reg = Object.assign({}, padrao || {});
    if (id) {
      const { data, error } = await sb.from(tabela).select('*').eq('id', id).maybeSingle();
      if (error || !data) return aviso('⚠ Não encontrei o registro (talvez tenha sido excluído). Clique ↻ Atualizar.');
      reg = data;
    }
    const corpo = (extra && extra.topo || '')
      + '<datalist id="gx-l-grupos">' + _grupos.map((g) => '<option value="' + esc(g.nome) + '">').join('') + '</datalist>'
      + '<form class="gx-form" novalidate><div class="gx-grade">' + def.campos.map((c) => campoHtml(c, reg[c.k])).join('') + '</div>'
      + (extra && extra.meio || '')
      + '<div class="gx-msg" role="alert"></div>'
      + '<div class="gx-acoes">'
      + (id ? '<button type="button" class="gx-bt gx-perigo" data-a="excluir">Excluir</button>' : '')
      + '<span style="flex:1"></span>'
      + (id && def.baixa && !reg.pago ? '<button type="button" class="gx-bt gx-ok" data-a="baixa">✓ Dar baixa (pago hoje)</button>' : '')
      + '<button type="button" class="gx-bt" data-a="cancelar">Cancelar</button>'
      + '<button type="submit" class="gx-bt gx-prim">' + (id ? 'Salvar alterações' : 'Salvar') + '</button>'
      + '</div></form>';
    const jan = abrirJanela((id ? 'Editar — ' : 'Novo — ') + def.nome, corpo, extra && extra.largura);
    const form = jan.querySelector('form');
    const msg = jan.querySelector('.gx-msg');
    const primeiro = jan.querySelector('input:not([type=checkbox]),select,textarea');
    if (primeiro && !id) primeiro.focus();
    // pago marcado → data de hoje sugerida
    const pg = jan.querySelector('#gx-f-pago'), dp = jan.querySelector('#gx-f-data_pagamento');
    if (pg && dp) pg.addEventListener('change', () => { if (pg.checked && !dp.value) dp.value = hojeISO(); if (!pg.checked) dp.value = ''; });

    async function gravar(ajuste) {
      msg.textContent = '';
      const botoes = jan.querySelectorAll('button'); botoes.forEach((b) => { b.disabled = true; });
      try {
        const d = await lerCampos(jan, def);
        if (ajuste) Object.assign(d, ajuste);
        if (def.antesDeGravar) def.antesDeGravar(d, reg);
        if (extra && extra.antesDeGravar) await extra.antesDeGravar(d, jan);
        let salvo;
        if (id) { const r = await sb.from(tabela).update(d).eq('id', id).select().single(); if (r.error) throw r.error; salvo = r.data; }
        else { const r = await sb.from(tabela).insert(d).select().single(); if (r.error) throw r.error; salvo = r.data; }
        if (extra && extra.depoisDeGravar) await extra.depoisDeGravar(salvo, jan);
        fecharJanela();
        aviso('✓ Gravado no banco de dados.');
        recarregar();
      } catch (e) {
        msg.textContent = '⚠ ' + erroAmigavel(e) + ' Nada foi perdido: corrija e tente de novo.';
        botoes.forEach((b) => { b.disabled = false; });
      }
    }
    form.addEventListener('submit', (e) => { e.preventDefault(); gravar(); });
    jan.querySelector('[data-a=cancelar]').addEventListener('click', fecharJanela);
    const bx = jan.querySelector('[data-a=baixa]');
    if (bx) bx.addEventListener('click', () => gravar({ pago: true, data_pagamento: hojeISO(), perda: tabela === 'lancamentos' ? false : undefined }));
    const ex = jan.querySelector('[data-a=excluir]');
    if (ex) ex.addEventListener('click', async () => {
      if (!confirm('Excluir este registro? Essa ação fica registrada no Histórico.')) return;
      const { data, error } = await sb.from(tabela).delete().eq('id', id).select('id');
      if (error) { msg.textContent = '⚠ ' + erroAmigavel(error); return; }
      if (!data || !data.length) { msg.textContent = '⚠ Só o administrador pode excluir este tipo de registro.'; return; }
      fecharJanela(); aviso('✓ Excluído.'); recarregar();
    });
    return jan;
  }

  // Parcelamento: formulário + parcelas (marcar pagas, mudar vencimento, gerar novas).
  async function abrirParcelamento(id, destacarParcela) {
    let parcelas = [];
    if (id) {
      const { data } = await sb.from('parcelas').select('*').eq('parcelamento_id', id).order('vencimento');
      parcelas = data || [];
    }
    const linhas = parcelas.map((p) => '<tr data-p="' + p.id + '"' + (p.id === destacarParcela ? ' class="gx-destaque"' : '') + '>'
      + '<td>' + esc(p.numero) + '</td><td><input type="date" value="' + esc(p.vencimento || '') + '" data-c="vencimento"></td>'
      + '<td><label><input type="checkbox" data-c="pago"' + (p.pago ? ' checked' : '') + '> pago</label></td>'
      + '<td><button type="button" class="gx-mini" data-del="' + p.id + '" title="Excluir parcela">✕</button></td></tr>').join('');
    const meio = '<div class="gx-sub"><h4>Parcelas</h4>'
      + (parcelas.length ? '<div class="gx-rolagem"><table class="gx-tab"><thead><tr><th>Nº</th><th>Vencimento</th><th>Situação</th><th></th></tr></thead><tbody>' + linhas + '</tbody></table></div>' : '<p class="gx-nada">Nenhuma parcela cadastrada.</p>')
      + '<div class="gx-gerar"><b>Gerar parcelas mensais:</b> <input type="number" min="1" max="240" id="gx-g-n" placeholder="quantas"> a partir de <input type="date" id="gx-g-venc"> começando no nº <input type="number" min="1" id="gx-g-ini" value="' + (parcelas.length + 1) + '"></div></div>';
    const topo = destacarParcela ? '<div class="gx-dica">A parcela que você clicou está destacada em amarelo. Marque "pago" e salve.</div>' : '';
    const excluidas = new Set();
    const jan = await abrirFormulario('parcelamentos', id, null, {
      meio, topo, largura: 820,
      antesDeGravar(d) {
        const n = Number(document.getElementById('gx-g-n').value || 0);
        if (n && !document.getElementById('gx-g-venc').value) throw new Error('Informe o 1º vencimento das parcelas a gerar.');
        if (d.grupo_id && !d.aba) d.aba = nomeGrupo(d.grupo_id);
      },
      async depoisDeGravar(salvo, j) {
        for (const tr of j.querySelectorAll('tr[data-p]')) {
          const pid = tr.dataset.p;
          if (excluidas.has(pid)) continue;
          const orig = parcelas.find((x) => x.id === pid);
          const venc = tr.querySelector('[data-c=vencimento]').value || null;
          const pago = tr.querySelector('[data-c=pago]').checked;
          if (orig && (orig.vencimento !== venc || orig.pago !== pago)) {
            const r = await sb.from('parcelas').update({ vencimento: venc, pago }).eq('id', pid); if (r.error) throw r.error;
          }
        }
        for (const pid of excluidas) { const r = await sb.from('parcelas').delete().eq('id', pid); if (r.error) throw r.error; }
        const n = Number(j.querySelector('#gx-g-n').value || 0);
        if (n > 0) {
          const [a, m, dd] = j.querySelector('#gx-g-venc').value.split('-').map(Number);
          const ini = Number(j.querySelector('#gx-g-ini').value || 1);
          const novas = [];
          for (let i = 0; i < n; i++) {
            const dt = new Date(a, m - 1 + i, 1);
            const ult = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
            novas.push({ parcelamento_id: salvo.id, numero: String(ini + i), vencimento: dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(Math.min(dd, ult)), pago: false });
          }
          const r = await sb.from('parcelas').insert(novas); if (r.error) throw r.error;
        }
      }
    });
    if (!jan) return;
    jan.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
      const tr = b.closest('tr'); excluidas.add(b.dataset.del); tr.style.opacity = '.35'; tr.style.textDecoration = 'line-through'; b.disabled = true;
    }));
    const destaque = jan.querySelector('.gx-destaque'); if (destaque) destaque.scrollIntoView({ block: 'center' });
  }

  function recarregar() { if (typeof window.ERP_RECARREGAR === 'function') window.ERP_RECARREGAR(); }

  // ─────────────────────────── tarefas ────────────────────────────
  async function abrirTarefas(filtro) {
    if (ehCliente()) return;
    filtro = filtro || 'abertas';
    await carregarGrupos();
    let q = sb.from('tarefas').select('*').order('prazo', { nullsFirst: false });
    if (filtro === 'abertas') q = q.not('status', 'in', '(concluida,cancelada)');
    if (filtro === 'concluidas') q = q.in('status', ['concluida', 'cancelada']);
    const { data, error } = await q;
    if (error) return aviso('⚠ ' + erroAmigavel(error));
    const hoje = hojeISO();
    const PRI = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
    const ST = { pendente: 'Pendente', andamento: 'Em andamento', aguardando: 'Aguardando', concluida: 'Concluída', cancelada: 'Cancelada' };
    const linhas = (data || []).map((t) => {
      const atrasada = t.prazo && t.prazo < hoje && !/conclu|cancel/.test(t.status);
      return '<tr data-t="' + t.id + '"><td class="gx-mono' + (atrasada ? ' gx-atraso' : '') + '">' + brData(t.prazo) + '</td><td>' + esc(t.titulo)
        + (t.processos_vinculados ? '<br><small>' + esc(t.processos_vinculados) + '</small>' : '') + '</td><td>' + esc(nomeGrupo(t.grupo_id) || '—') + '</td>'
        + '<td>' + esc(t.responsavel || '—') + '</td><td><span class="gx-pri gx-pri-' + esc(t.prioridade) + '">' + esc(PRI[t.prioridade] || t.prioridade) + '</span></td>'
        + '<td>' + esc(ST[t.status] || t.status) + '</td><td class="gx-nowrap">'
        + (/conclu|cancel/.test(t.status) ? '' : '<button type="button" class="gx-mini gx-ok" data-concluir="' + t.id + '" title="Concluir">✓</button> ')
        + '<button type="button" class="gx-mini" data-editar="' + t.id + '" title="Editar">✎</button></td></tr>';
    }).join('');
    const corpo = '<div class="gx-barra"><div class="gx-seg">'
      + [['abertas', 'Abertas'], ['concluidas', 'Concluídas'], ['todas', 'Todas']].map((o) => '<button type="button" data-f="' + o[0] + '"' + (o[0] === filtro ? ' class="on"' : '') + '>' + o[1] + '</button>').join('')
      + '</div><span style="flex:1"></span><button type="button" class="gx-bt gx-prim" data-nova>＋ Nova tarefa</button></div>'
      + ((data || []).length ? '<div class="gx-rolagem"><table class="gx-tab"><thead><tr><th>Prazo</th><th>Tarefa</th><th>Grupo</th><th>Responsável</th><th>Prioridade</th><th>Status</th><th></th></tr></thead><tbody>' + linhas + '</tbody></table></div>'
        : '<p class="gx-nada">Nenhuma tarefa aqui.</p>');
    const jan = abrirJanela('Tarefas', corpo, 980);
    jan.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => abrirTarefas(b.dataset.f)));
    jan.querySelector('[data-nova]').addEventListener('click', () => abrirFormulario('tarefas', null, { status: 'pendente', prioridade: 'media', inicio: hojeISO() }));
    jan.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => abrirFormulario('tarefas', b.dataset.editar)));
    jan.querySelectorAll('[data-concluir]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      const { error } = await sb.from('tarefas').update({ status: 'concluida' }).eq('id', b.dataset.concluir);
      if (error) { b.disabled = false; return aviso('⚠ ' + erroAmigavel(error)); }
      aviso('✓ Tarefa concluída.'); recarregar(); abrirTarefas(filtro);
    }));
  }

  // ─────────────────── abrir edição a partir de uma linha ───────────────────
  function editarPorMarca(marca) {
    const [t, id, pai] = String(marca || '').split(':');
    if (!t || !id) return;
    if (t === 'parcelas') return abrirParcelamento(pai, id);
    if (t === 'parcelamentos') return abrirParcelamento(id);
    return abrirFormulario(t, id);
  }
  window.ERP_EDITAR = editarPorMarca;

  // botão flutuante "✎ Editar" que acompanha a linha sob o mouse
  const botao = document.createElement('button');
  botao.type = 'button'; botao.id = 'gx-editar'; botao.textContent = '✎ Editar'; botao.hidden = true;
  document.body.appendChild(botao);
  let linhaAtual = null;
  function mostrarBotao(tr) {
    if (ehCliente()) return;
    linhaAtual = tr;
    const r = tr.getBoundingClientRect();
    botao.hidden = false;
    botao.style.top = Math.max(4, r.top + r.height / 2 - 14) + 'px';
    botao.style.left = Math.min(window.innerWidth - 92, Math.max(4, r.right - 88)) + 'px';
  }
  document.addEventListener('mouseover', (e) => {
    if (e.target === botao) return;
    const tr = e.target.closest && e.target.closest('tr[data-gx]');
    if (tr && tr.dataset.gx) mostrarBotao(tr); else if (!e.target.closest('#gx-editar')) botao.hidden = true;
  });
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || e.target === botao) return;
    const tr = e.target.closest && e.target.closest('tr[data-gx]');
    if (tr && tr.dataset.gx) mostrarBotao(tr);
  });
  // rolou a página: o botão acompanha a linha (some se ela saiu da tela)
  window.addEventListener('scroll', () => {
    if (botao.hidden || !linhaAtual) return;
    const r = linhaAtual.getBoundingClientRect();
    if (!linhaAtual.isConnected || r.bottom < 0 || r.top > window.innerHeight) botao.hidden = true; else mostrarBotao(linhaAtual);
  }, true);
  botao.addEventListener('click', () => { botao.hidden = true; if (linhaAtual) editarPorMarca(linhaAtual.dataset.gx); });
  document.addEventListener('dblclick', (e) => {
    const tr = e.target.closest && e.target.closest('tr[data-gx]');
    if (tr && tr.dataset.gx && !ehCliente()) { window.getSelection && window.getSelection().removeAllRanges(); editarPorMarca(tr.dataset.gx); }
  });

  // ─────────────────────── menu lateral "Lançar" ───────────────────────
  function painelAtual() { const a = document.querySelector('.panel.active'); return a ? a.id.replace('panel-', '') : ''; }
  const ITENS = [
    ['＋', 'Honorário / despesa', () => abrirFormulario('lancamentos', null, { empresa: painelAtual() === 'financeiroContab' ? 'contabilidade' : 'escritorio', tipo: 'receita', vencimento: hojeISO() })],
    ['＋', 'Cliente / empresa', () => abrirFormulario('clientes', null, { tipo: 'Consultoria' })],
    ['＋', 'Processo', () => abrirFormulario('processos', null, { carteira: 'Ativo', status: 'Em andamento' })],
    ['＋', 'Acordo (parcela)', () => abrirFormulario('acordos', null, {})],
    ['＋', 'Parcelamento', () => abrirParcelamento(null)],
    ['☑', 'Tarefas', () => abrirTarefas()],
    ['⚙', 'Gestão', () => { location.href = 'gestao.html'; }]
  ];
  function montarMenu() {
    const sbEl = document.getElementById('sb');
    if (!sbEl || document.getElementById('gx-menu')) return;
    const sec = document.createElement('div');
    sec.id = 'gx-menu'; sec.className = 'gx-so-equipe';
    sec.innerHTML = '<div class="gx-menu-tit">Lançar</div>' + ITENS.map((it, i) =>
      '<button type="button" class="sb-btn" data-gxi="' + i + '" data-label="' + esc(it[1]) + '" title="' + esc(it[1] === 'Gestão' ? 'Importar planilhas, backup, histórico e usuários' : it[1]) + '"><span class="sb-ic">' + it[0] + '</span><span class="sb-lbl">' + esc(it[1]) + '</span></button>').join('');
    sbEl.appendChild(sec);
    sec.addEventListener('click', (e) => {
      const b = e.target.closest('[data-gxi]'); if (!b) return;
      if (typeof window.closeSidebar === 'function') try { window.closeSidebar(); } catch (x) { /* menu já fechado */ }
      ITENS[+b.dataset.gxi][2]();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarMenu); else montarMenu();

  window.ERP_EDITOR = { abrirFormulario, abrirParcelamento, abrirTarefas };
})();
