'use strict';
// ═══════════════════════════════════════════════════════════════════
// Ficha do cliente (visão 360°): tudo sobre o cliente numa janela só,
// em abas. Clicar no cliente (tela Clientes) abre esta ficha.
// ═══════════════════════════════════════════════════════════════════
const ABAS_FICHA = [['resumo', 'Resumo'], ['contatos', 'Contatos'], ['enderecos', 'Endereços'], ['contas', 'Contas bancárias'],
  ['socios', 'Sócios e vínculos'], ['processos', 'Processos'], ['contratos', 'Contratos'], ['financeiro', 'Financeiro'],
  ['tarefas', 'Tarefas'], ['documentos', 'Documentos'], ['linha', 'Linha do tempo'], ['fiscal', 'Dados fiscais'], ['receita', 'Cartão CNPJ'], ['pgfn', 'PGFN'], ['evolucao', '📈 Evolução']];

// Sub-cadastros editáveis da ficha (mesmo formulário para todos)
const FINALIDADES = SETORES_CONTATO;
const SUBLISTAS = {
  contatos: { tabela: 'contatos', titulo: 'Contatos', um: 'contato', vazio: 'Nenhum contato. Cadastre aqui financeiro, fiscal, RH, sócios, contador…',
    dica: 'Os e-mails automáticos vão para quem está marcado em <b>"Recebe por e-mail"</b>. Se ninguém estiver marcado, vão para o contato do setor certo ' +
      '(cobrança e recibo → Financeiro · guia → Fiscal · contrato e convite → Sócio), depois para o contato Geral e, por último, para o e-mail do cadastro.',
    campos: [['nome', 'Nome', 'texto', 1], ['cargo', 'Cargo / função'], ['finalidade', 'Setor', FINALIDADES], ['email', 'E-mail', 'email'],
      ['telefone', 'Telefone / WhatsApp'], ['whatsapp', 'Este telefone tem WhatsApp', 'check'], ['recebe', 'Recebe por e-mail', 'multi', RECEBE_EMAIL],
      ['preferencia', 'Preferência de contato (ex.: só WhatsApp, após 14h)'], ['obs', 'Observação', 'area']],
    linha: (x) => '<b>' + esc(x.nome || '—') + '</b>' + (x.cargo ? ' · ' + esc(x.cargo) : '') + ' <span class="pill neutro">' + esc(rotuloPar(FINALIDADES, x.finalidade)) + '</span>' +
      (x.recebe || []).map((k) => ' <span class="pill aberto">' + esc(RECEBE_CURTO[k] || k) + '</span>').join('') +
      '<div class="sub">' + [x.email ? '<a href="mailto:' + esc(x.email) + '">' + esc(x.email) + '</a>' : '', x.telefone ? esc(x.telefone) + (x.whatsapp ? ' ' + linkWhats(x.telefone, 'WhatsApp') : '') : '', esc(x.preferencia || '')].filter(Boolean).join(' · ') + '</div>' },
  enderecos: { tabela: 'enderecos', titulo: 'Endereços', um: 'endereço', vazio: 'Nenhum endereço além do cadastro principal.',
    campos: [['tipo', 'Tipo', [['sede', 'Sede'], ['correspondencia', 'Correspondência'], ['cobranca', 'Cobrança'], ['filial', 'Filial'], ['residencial', 'Residencial']]],
      ['cep', 'CEP'], ['logradouro', 'Logradouro', 'texto', 1], ['numero', 'Número'], ['complemento', 'Complemento'], ['bairro', 'Bairro'],
      ['cidade', 'Cidade'], ['uf', 'UF'], ['principal', 'Endereço principal', 'check'], ['obs', 'Observação', 'area']],
    linha: (x) => '<b>' + esc([x.logradouro, x.numero].filter(Boolean).join(', ') || '—') + '</b>' + (x.complemento ? ' · ' + esc(x.complemento) : '') +
      ' <span class="pill neutro">' + esc(x.tipo) + '</span>' + (x.principal ? ' <span class="pill pago">principal</span>' : '') +
      '<div class="sub">' + esc([x.bairro, x.cidade && x.uf ? x.cidade + '/' + x.uf : x.cidade || x.uf, x.cep].filter(Boolean).join(' · ')) + '</div>' },
  contas: { tabela: 'contas_bancarias', titulo: 'Contas bancárias', um: 'conta', vazio: 'Nenhuma conta cadastrada.',
    campos: [['banco', 'Banco', 'texto', 1], ['agencia', 'Agência'], ['conta', 'Conta'], ['tipo_conta', 'Tipo', [['', '—'], ['corrente', 'Corrente'], ['poupanca', 'Poupança'], ['pagamento', 'Pagamento']]],
      ['pix', 'Chave PIX'], ['titular', 'Titular'], ['documento_titular', 'CPF/CNPJ do titular'],
      ['uso', 'Uso', [['', '—'], ['recebimento', 'Recebimento'], ['pagamento', 'Pagamento'], ['restituicao', 'Restituição']]], ['principal', 'Conta principal', 'check'], ['obs', 'Observação', 'area']],
    linha: (x) => '<b>' + esc(x.banco || '—') + '</b>' + (x.agencia || x.conta ? ' · ag. ' + esc(x.agencia) + ' c. ' + esc(x.conta) : '') +
      (x.uso ? ' <span class="pill neutro">' + esc(x.uso) + '</span>' : '') + (x.principal ? ' <span class="pill pago">principal</span>' : '') +
      '<div class="sub">' + esc([x.pix ? 'PIX ' + x.pix : '', x.titular, mascaraDoc(x.documento_titular)].filter(Boolean).join(' · ')) + '</div>' },
  socios: { tabela: 'vinculos_societarios', titulo: 'Sócios e vínculos', um: 'sócio / vínculo', vazio: 'Nenhum sócio ou vínculo cadastrado.',
    campos: [['nome', 'Nome', 'texto', 1], ['cpf_cnpj', 'CPF/CNPJ'], ['qualificacao', 'Qualificação (sócio-administrador, procurador, cônjuge…)'],
      ['participacao', 'Participação (%)', 'numero'], ['email', 'E-mail', 'email'], ['telefone', 'Telefone'], ['obs', 'Observação', 'area']],
    linha: (x) => '<b>' + esc(x.nome || '—') + '</b>' + (x.qualificacao ? ' · ' + esc(x.qualificacao) : '') +
      (x.participacao != null ? ' <span class="pill neutro">' + String(x.participacao).replace('.', ',') + '%</span>' : '') +
      '<div class="sub">' + esc([mascaraDoc(x.cpf_cnpj), x.email, x.telefone].filter(Boolean).join(' · ')) + '</div>' },
  certidoes: { tabela: 'certidoes', titulo: 'Certidões', um: 'certidão', vazio: 'Nenhuma certidão registrada.',
    campos: [['orgao', 'Órgão', [['RFB/PGFN', 'Federal (RFB/PGFN)'], ['Estadual', 'Estadual'], ['Municipal', 'Municipal'], ['Trabalhista', 'Trabalhista (CNDT)'], ['FGTS', 'FGTS (CRF)'], ['Outra', 'Outra']]],
      ['situacao', 'Situação', [['negativa', 'Negativa'], ['positiva com efeito de negativa', 'Positiva com efeito de negativa'], ['positiva', 'Positiva']]],
      ['emissao', 'Emissão', 'data'], ['validade', 'Validade', 'data'], ['obs', 'Observação', 'area']],
    linha: (x) => '<b>' + esc(x.orgao || '—') + '</b> <span class="pill ' + (x.situacao === 'positiva' ? 'vencido' : x.situacao ? 'pago' : 'neutro') + '">' + esc(x.situacao || '—') + '</span>' +
      selo_validade(x.validade) + '<div class="sub">' + (x.emissao ? 'Emitida em ' + dataBR(x.emissao) : '') + (x.obs ? ' · ' + esc(x.obs) : '') + '</div>' }
};
function rotuloPar(pares, v) { return (pares.find((p) => p[0] === v) || [v, v || '—'])[1]; }
function linkWhats(tel, texto) {
  let d = soDigitos(tel);
  if (!d) return '';
  if (d.length <= 11) d = '55' + d;
  return '<a href="https://wa.me/' + d + '" target="_blank" rel="noopener">' + esc(texto || 'WhatsApp') + '</a>';
}

function formSubitem(cfg, item, clienteId, depois) {
  const novo = !item.id;
  const html = (cfg.dica ? '<div class="dica inteiro">' + cfg.dica + '</div>' : '') + cfg.campos.map(([k, rot, tipo, inteiro]) => {
    const v = item[k];
    if (tipo === 'multi') return '<fieldset class="inteiro sub-multi"><legend>' + rot + '</legend>' + inteiro.map(([val, r]) =>
      '<label class="check"><input type="checkbox" name="' + k + '" value="' + val + '"' + ((v || []).includes(val) ? ' checked' : '') + '> ' + r + '</label>').join('') + '</fieldset>';
    if (Array.isArray(tipo)) return campo(rot, selectPares(k, tipo, v == null ? tipo[0][0] : v));
    if (tipo === 'check') return '<label class="check inteiro"><input type="checkbox" name="' + k + '"' + (v ? ' checked' : '') + '> ' + rot + '</label>';
    if (tipo === 'area') return campo(rot, '<textarea name="' + k + '" maxlength="2000">' + esc(v || '') + '</textarea>', 'inteiro');
    const t = tipo === 'data' ? 'date' : tipo === 'email' ? 'email' : 'text';
    return campo(rot, '<input name="' + k + '" type="' + t + '"' + (tipo === 'numero' ? ' inputmode="decimal"' : '') + ' value="' +
      esc(v == null ? '' : tipo === 'numero' ? String(v).replace('.', ',') : v) + '">', inteiro ? 'inteiro' : '');
  }).join('');
  const j = abrirJanela({ titulo: (novo ? 'Novo ' : 'Editar ') + cfg.um, corpo: '<form class="grade" id="f-sub">' + html + '</form>',
    rodape: (novo ? '<span></span>' : '<button class="btn btn-x" type="button" id="btn-exc-sub">Excluir</button>') +
      '<div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-salvar-sub">Salvar</button></div>' });
  const f = j.querySelector('#f-sub');
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  f.onsubmit = (ev) => { ev.preventDefault(); j.querySelector('#btn-salvar-sub').click(); };
  j.querySelector('#btn-salvar-sub').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const dados = { cliente_id: clienteId };
    cfg.campos.forEach(([k, , tipo]) => {
      const el = f.elements[k];
      if (tipo === 'multi') dados[k] = [...f.querySelectorAll('[name="' + k + '"]:checked')].map((x) => x.value);
      else if (tipo === 'check') dados[k] = el.checked;
      else if (tipo === 'data') dados[k] = el.value || null;
      else if (tipo === 'numero') { const n = el.value.trim() ? lerValor(el.value) : null; if (Number.isNaN(n)) throw new Error('Número inválido em "' + cfg.campos.find((c) => c[0] === k)[1] + '".'); dados[k] = n; }
      else dados[k] = el.value.trim();
    });
    const obrig = cfg.campos.find((c) => c[3] === 1);
    if (obrig && !dados[obrig[0]]) throw new Error('Preencha "' + obrig[1] + '".');
    if (novo) await q(sb.from(cfg.tabela).insert(dados)); else await q(sb.from(cfg.tabela).update(dados).eq('id', item.id));
    aviso('✓ ' + cfg.um.charAt(0).toUpperCase() + cfg.um.slice(1) + (novo ? ' incluído(a).' : ' atualizado(a).')); fecharJanela(j); await depois();
  });
  const bx = j.querySelector('#btn-exc-sub');
  if (bx) bx.onclick = () => comBotao(bx, async () => {
    if (!confirm('Excluir este(a) ' + cfg.um + '?')) return;
    await excluir(cfg.tabela, item.id);
    aviso('Excluído.'); fecharJanela(j); await depois();
  });
}
async function pintarSublista(alvo, chave, cl) {
  const cfg = SUBLISTAS[chave];
  const itens = await q(sb.from(cfg.tabela).select('*').eq('cliente_id', cl.id).order('criado_em'));
  alvo.innerHTML = '<div class="titulo-pag" style="margin-bottom:8px"><div><b>' + cfg.titulo + '</b> <span class="sub">' + itens.length + '</span></div>' +
    '<div class="acoes"><button class="btn btn-o btn-mini" data-novo-sub>+ Incluir ' + cfg.um + '</button></div></div>' +
    (itens.length ? '<div class="lista-ficha">' + itens.map((x) => '<div class="item-ficha" data-sub="' + x.id + '"><div>' + cfg.linha(x) + '</div>' +
      '<button class="btn btn-o btn-mini" data-editar-sub="' + x.id + '">Editar</button></div>').join('') + '</div>'
      : '<div class="vazio">' + cfg.vazio + '</div>');
  const repinta = () => pintarSublista(alvo, chave, cl);
  alvo.querySelector('[data-novo-sub]').onclick = () => formSubitem(cfg, {}, cl.id, repinta);
  alvo.querySelectorAll('[data-editar-sub]').forEach((b) => b.onclick = () => formSubitem(cfg, itens.find((x) => x.id === b.dataset.editarSub), cl.id, repinta));
  return itens;
}

// ─────────────────────────── a ficha ───────────────────────────
async function abrirFicha(id, aba) {
  if (!E.clientes.length) await carregarCadastros();
  const cl = E.clientes.find((c) => c.id === id) || await q(sb.from('clientes').select('*, grupos(nome)').eq('id', id).single());
  const etq = await q(sb.from('cliente_etiquetas').select('etiqueta_id, etiquetas(nome, cor)').eq('cliente_id', id)).catch(() => []);
  const tel = cl.telefone, mail = cl.email;
  const j = abrirJanela({ titulo: cl.nome, larga: true,
    corpo:
      // Backup 39: "Editar cadastro" em destaque, no canto de cima à direita (não some no meio dos atalhos)
      '<div class="ficha-topo"><button class="btn btn-p ficha-bt-editar" id="fc-editar">✎ Editar cadastro</button><div class="ficha-id">' +
      '<div class="ficha-sub">' + [cl.grupos && cl.grupos.nome ? esc(cl.grupos.nome) : '', esc(mascaraDoc(cl.cpf_cnpj) || ''), esc(cl.tipo_societario || ''), esc(cl.regime_tributario || '')].filter(Boolean).join(' · ') + '</div>' +
      '<div class="ficha-selos"><span class="pill ' + (cl.tipo === 'Inativo' ? 'neutro' : cl.tipo === 'Demanda' ? 'hoje' : 'aberto') + '">' + esc(cl.tipo === 'Demanda' ? 'Serviço pontual' : cl.tipo) + '</span> ' +
      pillPessoa(cl.responsavel) + ' ' + (cl.situacao_cadastral ? pillSitCad(cl.situacao_cadastral) + ' ' : '') + (cl.capag ? 'CAPAG ' + pillCapag(cl.capag) + ' ' : '') +
      etq.map((e) => e.etiquetas ? '<span class="pill" style="background:' + esc(e.etiquetas.cor) + '22;color:' + esc(e.etiquetas.cor) + '">' + esc(e.etiquetas.nome) + '</span>' : '').join(' ') +
      ' <button class="btn-etq" id="fc-etq" title="Etiquetas">+ etiqueta</button></div></div>' +
      '<div class="ficha-atalhos">' +
      '<button class="btn btn-o btn-mini" id="fc-tarefa">+ Tarefa</button><button class="btn btn-o btn-mini" id="fc-lanc">+ Lançamento</button>' +
      '<button class="btn btn-o btn-mini" id="fc-ger" title="Contrato, procuração, petição… já com os dados deste cliente">📄 Gerar</button><button class="btn btn-o btn-mini" id="fc-doc">+ Documento</button><button class="btn btn-o btn-mini" id="fc-int">+ Interação</button>' +
      (pode('crm', 'editar') ? '<button class="btn btn-o btn-mini" id="fc-lead" title="Nova oportunidade no CRM para este cliente (novo serviço)">🎯 Virar lead</button>' +
        '<button class="btn btn-o btn-mini" id="fc-reuniao" title="Agenda reunião com o cliente: tarefa para os participantes e convite opcional">📅 Reunião</button>' : '') +
      (pode('crm', 'editar') ? '<button class="btn btn-o btn-mini" id="fc-indic" title="Oportunidade nova no CRM com origem = indicação deste cliente">🤝 Indicação</button>' : '') +
      (tel ? '<a class="btn btn-o btn-mini" target="_blank" rel="noopener" href="https://wa.me/' + (soDigitos(tel).length <= 11 ? '55' : '') + soDigitos(tel) + '">WhatsApp</a>' : '') +
      (mail ? '<a class="btn btn-o btn-mini" href="mailto:' + esc(mail) + '">E-mail</a>' : '') +
      '</div></div>' +
      '<div class="abas ficha-abas" id="fc-abas">' + ABAS_FICHA.map(([k, r]) => '<button data-aba="' + k + '">' + r + '</button>').join('') + '</div>' +
      '<div id="fc-corpo" class="ficha-corpo"></div>' });
  j.querySelector('.janela').classList.add('ficha');
  const corpo = j.querySelector('#fc-corpo');
  let atual = aba || 'resumo';
  const mostrar = async (k) => {
    atual = k;
    j.querySelectorAll('#fc-abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === k));
    corpo.innerHTML = '<div class="carregando">Carregando…</div>';
    try { await ABA_FICHA[k](corpo, cl, () => mostrar(atual)); }
    catch (e) { console.error(e); corpo.innerHTML = '<div class="vazio">' + esc(erroAmigavel(e)) + '</div>'; }
  };
  j.querySelector('#fc-abas').onclick = (ev) => { const b = ev.target.closest('button'); if (b) mostrar(b.dataset.aba); };
  const reabrir = async () => { await carregarCadastros(true); fecharJanela(j); await abrirFicha(id, atual); };
  j.querySelector('#fc-editar').onclick = () => formCliente(cl, reabrir);
  j.querySelector('#fc-tarefa').onclick = () => formTarefa({ cliente_id: cl.id, grupo_id: cl.grupo_id, responsavel: cl.responsavel }, () => mostrar('tarefas'));
  j.querySelector('#fc-lanc').onclick = () => formLancamento({ tipo: 'receita', empresa: 'escritorio', cliente_id: cl.id, grupo_id: cl.grupo_id, responsavel: cl.responsavel }, () => mostrar('financeiro'));
  j.querySelector('#fc-doc').onclick = () => janelaEnviarDocumento({ cliente_id: cl.id, grupo_id: cl.grupo_id }, () => mostrar('documentos'));
  j.querySelector('#fc-int').onclick = () => formInteracao(cl, () => mostrar('linha'));
  j.querySelector('#fc-etq').onclick = () => janelaEtiquetas(cl, etq, reabrir);
  j.querySelector('#fc-ger').onclick = () => janelaGeradores(cl.id);
  const lead = j.querySelector('#fc-lead');
  if (lead) lead.onclick = async () => { if (!E._crmEtapas) E._crmEtapas = await q(sb.from('crm_etapas').select('*').order('ordem')).catch(() => []);
    formOportunidade({ cliente_id: cl.id, responsavel: cl.responsavel, origem: 'Cliente antigo' }, () => aviso('✓ Oportunidade criada no CRM para ' + cl.nome + '.')); };
  const reuC = j.querySelector('#fc-reuniao');
  if (reuC) reuC.onclick = () => formReuniao({ cliente_id: cl.id, titulo: 'Reunião — ' + cl.nome, participantes: cl.responsavel }, () => mostrar('linha'));
  const ind = j.querySelector('#fc-indic');
  if (ind) ind.onclick = async () => { if (!E._crmEtapas) E._crmEtapas = await q(sb.from('crm_etapas').select('*').order('ordem')).catch(() => []);
    formOportunidade({ origem: 'Indicação de cliente', indicado_por: cl.nome, responsavel: cl.responsavel }, () => aviso('✓ Prospecto indicado por ' + cl.nome + ' criado no CRM.')); };
  await mostrar(atual);
  return j;
}

function formInteracao(cl, depois) {
  const agora = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const j = abrirJanela({ titulo: 'Registrar interação — ' + cl.nome,
    corpo: '<form class="grade" id="f-int">' +
      campo('Tipo', selectPares('tipo', [['ligacao', 'Ligação'], ['reuniao', 'Reunião'], ['whatsapp', 'WhatsApp'], ['email', 'E-mail'], ['anotacao', 'Anotação']], 'ligacao')) +
      campo('Quando', '<input type="datetime-local" name="quando" value="' + agora + '">') +
      campo('O que foi tratado <span class="obrig">*</span>', '<textarea name="resumo" maxlength="4000" placeholder="Ex.: cliente pediu simulação do parcelamento; enviar até sexta"></textarea>', 'inteiro') + '</form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-salvar-int">Salvar</button></div>' });
  const f = j.querySelector('#f-int');
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-salvar-int').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.resumo.value.trim()) throw new Error('Escreva o que foi tratado.');
    await q(sb.from('interacoes').insert({ cliente_id: cl.id, tipo: f.tipo.value, quando: f.quando.value ? new Date(f.quando.value).toISOString() : new Date().toISOString(), resumo: f.resumo.value.trim() }));
    aviso('✓ Interação registrada.'); fecharJanela(j); await depois();
  });
}

async function janelaEtiquetas(cl, atuais, depois) {
  const todas = await q(sb.from('etiquetas').select('*').order('nome'));
  const tem = new Set(atuais.map((e) => e.etiqueta_id));
  const j = abrirJanela({ titulo: 'Etiquetas — ' + cl.nome,
    corpo: '<p class="sub" style="margin-bottom:10px">Marque as etiquetas do cliente (ex.: VIP, Inadimplente, Recuperação judicial).</p>' +
      '<div id="etq-lista">' + (todas.length ? todas.map((e) => '<label class="check"><input type="checkbox" value="' + e.id + '"' + (tem.has(e.id) ? ' checked' : '') + '> <span class="pill" style="background:' + esc(e.cor) + '22;color:' + esc(e.cor) + '">' + esc(e.nome) + '</span></label>').join('') : '<div class="sub">Nenhuma etiqueta criada ainda.</div>') + '</div>' +
      '<div class="filtros" style="margin-top:12px"><input class="busca" id="etq-nova" placeholder="Nova etiqueta"><input type="color" id="etq-cor" value="#2E5EAA"></div>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-salvar-etq">Salvar</button></div>' });
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-salvar-etq').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const marcadas = new Set(Array.from(j.querySelectorAll('#etq-lista input:checked')).map((i) => i.value));
    const nova = j.querySelector('#etq-nova').value.trim();
    if (nova) { const e = await q(sb.from('etiquetas').insert({ nome: nova, cor: j.querySelector('#etq-cor').value }).select().single()); marcadas.add(e.id); }
    const tirar = [...tem].filter((x) => !marcadas.has(x)), por = [...marcadas].filter((x) => !tem.has(x));
    if (tirar.length) await q(sb.from('cliente_etiquetas').delete().eq('cliente_id', cl.id).in('etiqueta_id', tirar));
    if (por.length) await q(sb.from('cliente_etiquetas').insert(por.map((etiqueta_id) => ({ cliente_id: cl.id, etiqueta_id }))));
    aviso('✓ Etiquetas atualizadas.'); fecharJanela(j); await depois();
  });
}

// lançamentos do cliente: os dele e os do grupo sem cliente definido
async function lancamentosDoCliente(cl) {
  const filtro = 'cliente_id.eq.' + cl.id + (cl.grupo_id ? ',and(grupo_id.eq.' + cl.grupo_id + ',cliente_id.is.null)' : '');
  return buscarTodos(() => sb.from('lancamentos').select('*').or(filtro).order('vencimento', { ascending: false }));
}
function linhaDado(rot, v) { return v === '' || v == null ? '' : '<div class="dado"><span>' + rot + '</span><b>' + v + '</b></div>'; }

const ABA_FICHA = {
  async resumo(alvo, cl) {
    const h = hojeISO();
    const [lanc, tarefas, ints, procs] = await Promise.all([
      lancamentosDoCliente(cl),
      q(sb.from('tarefas').select('*').or('cliente_id.eq.' + cl.id + (cl.grupo_id ? ',grupo_id.eq.' + cl.grupo_id : '')).not('status', 'in', '(concluida,cancelada)').order('prazo', { nullsFirst: false }).limit(200)),
      q(sb.from('interacoes').select('*').eq('cliente_id', cl.id).order('quando', { ascending: false }).limit(3)),
      cl.grupo_id ? q(sb.from('processos').select('id').eq('grupo_id', cl.grupo_id)) : []
    ]);
    const rec = lanc.filter((l) => l.tipo === 'receita' && !l.perda);
    const aberto = rec.filter((l) => !l.pago), atraso = aberto.filter((l) => l.vencimento < h);
    const ano = rec.filter((l) => l.pago && (l.data_pagamento || l.vencimento) >= somarDias(h, -365));
    const tAtr = tarefas.filter((t) => t.prazo && t.prazo < h);
    const debitos = soma([cl.rfb, cl.pgfn, cl.sefaz_mg, cl.age_mg].map((x) => Number(x) || 0));
    alvo.innerHTML = '<div class="kpis">' +
      kpi('A receber', brl(soma(aberto, vl)), atraso.length ? 'vermelho' : '', atraso.length ? brl(soma(atraso, vl)) + ' em atraso' : aberto.length + ' lançamento(s) em aberto') +
      kpi('Recebido em 12 meses', brl(soma(ano, vl)), 'verde', ano.length + ' pagamento(s)') +
      kpi('Tarefas abertas', String(tarefas.length), tAtr.length ? 'vermelho' : '', tAtr.length ? tAtr.length + ' atrasada(s)' : 'nenhuma atrasada') +
      kpi('Débitos fiscais', brl(debitos), debitos ? 'ambar' : '', procs.length + ' processo(s) do grupo') + '</div>' +
      '<div class="duas-col"><div class="card"><div class="card-hd">Cadastro</div><div class="card-bd dados">' +
      linhaDado('Nome', esc(cl.nome)) + linhaDado('CPF/CNPJ', esc(mascaraDoc(cl.cpf_cnpj))) + linhaDado('Sócio-administrador', esc(cl.socio_admin)) +
      linhaDado('E-mail', cl.email ? '<a href="mailto:' + esc(cl.email) + '">' + esc(cl.email) + '</a>' : '') + linhaDado('Telefone', esc(cl.telefone)) +
      linhaDado('Endereço', esc([cl.endereco, cl.cidade && cl.estado ? cl.cidade + '/' + cl.estado : cl.cidade].filter(Boolean).join(' · '))) +
      linhaDado('Procuração', pillSimNao(cl.procuracao)) + linhaDado('Certificado digital', pillSimNao(cl.certificado)) +
      linhaDado('Origem', esc(cl.origem)) + linhaDado('Observação', esc(cl.obs)) + '</div></div>' +
      '<div class="card"><div class="card-hd">Próximas tarefas</div><div class="card-bd">' +
      (tarefas.length ? tarefas.slice(0, 6).map((t) => '<div class="item-ficha"><div><b>' + esc(t.titulo) + '</b><div class="sub">' + (t.prazo ? 'até ' + dataBR(t.prazo) : 'sem prazo') + ' · ' + esc(t.responsavel || '—') + '</div></div>' +
        (t.prazo && t.prazo < h ? '<span class="pill vencido">atrasada</span>' : '') + '</div>').join('') : '<div class="sub">Nenhuma tarefa aberta.</div>') +
      '</div><div class="card-hd" style="border-top:1px solid var(--border)">Últimas interações</div><div class="card-bd">' +
      (ints.length ? ints.map((i) => '<div class="item-ficha"><div><b>' + esc(rotuloInteracao(i.tipo)) + '</b> <span class="sub">' + quandoBR(i.quando) + '</span><div>' + esc(i.resumo) + '</div></div></div>').join('') : '<div class="sub">Nenhuma interação registrada.</div>') +
      '</div></div></div>';
  },
  contatos: (alvo, cl) => pintarSublista(alvo, 'contatos', cl),
  enderecos: (alvo, cl) => pintarSublista(alvo, 'enderecos', cl),
  contas: (alvo, cl) => pintarSublista(alvo, 'contas', cl),
  socios: (alvo, cl) => pintarSublista(alvo, 'socios', cl),
  async processos(alvo, cl) {
    if (!cl.grupo_id) { alvo.innerHTML = '<div class="vazio">Este cliente não tem grupo; os processos são ligados por grupo.</div>'; return; }
    const ps = await q(sb.from('processos').select('*').eq('grupo_id', cl.grupo_id).order('data_distribuicao', { ascending: false, nullsFirst: false }));
    alvo.innerHTML = '<div class="sub" style="margin-bottom:8px">Processos do grupo ' + esc(nomeGrupo(cl.grupo_id)) + ' · para editar, use o menu Jurídico → Processos.</div>' +
      (ps.length ? '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Número</th><th>Natureza</th><th>Partes</th><th data-tipo="num">Valor</th><th>Status</th><th>Advogado</th></tr></thead><tbody>' +
        ps.map((p) => '<tr><td class="mono">' + esc(p.numero) + '<div class="sub">' + esc(p.competencia) + '</div></td><td>' + esc(p.natureza || '—') + '</td>' +
          '<td>' + esc(p.autor || '') + (p.reu ? ' × ' + esc(p.reu) : '') + '</td><td class="mono" data-ord="' + (Number(p.valor) || 0) + '">' + (p.valor != null ? brl(p.valor) : '—') + '</td>' +
          '<td>' + esc(p.status || '—') + '</td><td>' + pillPessoa(p.advogado) + '</td></tr>').join('') + '</tbody></table></div>'
        : '<div class="vazio">Nenhum processo deste grupo.</div>');
  },
  async contratos(alvo, cl) {
    const cs = await q(sb.from('contratos').select('*').eq('cliente_id', cl.id).order('data_contrato', { ascending: false }));
    alvo.innerHTML = '<div class="titulo-pag" style="margin-bottom:8px"><div><b>Contratos</b> <span class="sub">' + cs.length + '</span></div>' +
      '<div class="acoes"><button class="btn btn-o btn-mini" id="fc-novo-ctr">+ Novo contrato</button></div></div>' +
      (cs.length ? '<div class="tabela-wrap"><table><thead><tr><th>Serviço</th><th>Data</th><th>Valor</th><th>Parcelas</th><th>Status</th></tr></thead><tbody>' +
        cs.map((c) => '<tr class="clicavel" data-ctr-f="' + c.id + '"><td><b>' + esc(c.descricao) + '</b></td><td class="mono">' + dataBR(c.data_contrato) + '</td><td class="mono">' + brl(c.valor_total) +
          (c.percentual_exito ? '<div class="sub">+ ' + String(c.percentual_exito).replace('.', ',') + '% êxito</div>' : '') + '</td><td>' + c.num_parcelas + '</td>' +
          '<td><span class="pill ' + (c.status === 'Ativo' ? 'aberto' : 'neutro') + '">' + esc(c.status) + '</span></td></tr>').join('') + '</tbody></table></div>'
        : vazio('Nenhum contrato deste cliente.', '+ Novo contrato', '#fc-novo-ctr'));
    alvo.querySelector('#fc-novo-ctr').onclick = () => formContrato({ cliente_id: cl.id });
    alvo.querySelectorAll('[data-ctr-f]').forEach((tr) => tr.onclick = () => detalheContrato(tr.dataset.ctrF));
  },
  async financeiro(alvo, cl, repinta) {
    const lanc = await lancamentosDoCliente(cl);
    alvo.innerHTML = '<div class="sub" style="margin-bottom:8px">Lançamentos do cliente' + (cl.grupo_id ? ' e do grupo ' + esc(nomeGrupo(cl.grupo_id)) + ' sem cliente definido' : '') + '.</div>' +
      '<div class="card" style="margin:0">' + tabelaLancamentos(lanc, { compacta: true }) + '</div>';
    ligarAcoesLancamentos(alvo, repinta);
  },
  async tarefas(alvo, cl, repinta) {
    const ts = await q(sb.from('tarefas').select('*').or('cliente_id.eq.' + cl.id + (cl.grupo_id ? ',grupo_id.eq.' + cl.grupo_id : '')).order('prazo', { nullsFirst: false }));
    const h = hojeISO();
    alvo.innerHTML = '<div class="titulo-pag" style="margin-bottom:8px"><div><b>Tarefas</b> <span class="sub">' + ts.filter((t) => !tarefaFechada(t)).length + ' aberta(s)</span></div>' +
      '<div class="acoes"><button class="btn btn-o btn-mini" id="fc-nova-tf">+ Nova tarefa</button></div></div>' +
      (ts.length ? '<div class="lista-ficha">' + ts.map((t) => '<div class="item-ficha' + (tarefaFechada(t) ? ' feita' : '') + '"><div><b>' + esc(t.titulo) + '</b> ' +
        (t.prazo && t.prazo < h && !tarefaFechada(t) ? '<span class="pill vencido">atrasada</span>' : '') +
        '<div class="sub">' + (t.prazo ? 'até ' + dataBR(t.prazo) : 'sem prazo') + (t.prazo_fatal ? ' · fatal ' + dataBR(t.prazo_fatal) : '') + ' · ' + esc(t.responsavel || '—') + ' · ' + esc(STATUS_TAREFA[t.status] || t.status) + '</div></div>' +
        '<button class="btn btn-o btn-mini" data-editar-tf="' + t.id + '">Abrir</button></div>').join('') + '</div>'
        : vazio('Nenhuma tarefa deste cliente.', '+ Nova tarefa', '#fc-nova-tf'));
    alvo.querySelector('#fc-nova-tf').onclick = () => formTarefa({ cliente_id: cl.id, grupo_id: cl.grupo_id, responsavel: cl.responsavel }, repinta);
    alvo.querySelectorAll('[data-editar-tf]').forEach((b) => b.onclick = () => formTarefa(ts.find((t) => t.id === b.dataset.editarTf), repinta));
  },
  documentos: (alvo, cl) => blocoDocumentos(alvo, { cliente_id: cl.id, grupo_id: cl.grupo_id }, { vazio: 'Nenhum documento. Envie contrato social, procuração, documentos pessoais…' }),
  emails: (alvo, cl) => abaEmailsCliente(alvo, cl),
  async linha(alvo, cl) {
    const [ints, ctrs, lanc, ts, docs, hist, crm, reus, mails] = await Promise.all([
      q(sb.from('interacoes').select('*').eq('cliente_id', cl.id)),
      q(sb.from('contratos').select('id, descricao, data_contrato, status, assinado_em').eq('cliente_id', cl.id)),
      q(sb.from('lancamentos').select('descricao, valor, redutor, data_pagamento, vencimento').eq('cliente_id', cl.id).eq('pago', true).order('data_pagamento', { ascending: false }).limit(60)),
      q(sb.from('tarefas').select('titulo, concluida_em, status').or('cliente_id.eq.' + cl.id + (cl.grupo_id ? ',grupo_id.eq.' + cl.grupo_id : '')).eq('status', 'concluida').not('concluida_em', 'is', null)),
      q(sb.from('documentos').select('nome, tipo, criado_em').eq('cliente_id', cl.id)),
      q(sb.from('historico').select('acao, quando, antes, depois').eq('tabela', 'clientes').eq('registro_id', cl.id).order('quando', { ascending: false }).limit(30)).catch(() => []),
      // atividades do CRM (inclusive as de antes de virar cliente)
      pode('crm') ? q(sb.from('crm_atividades').select('tipo, quando, resumo, crm_oportunidades!inner(titulo, cliente_id)').eq('crm_oportunidades.cliente_id', cl.id)).catch(() => []) : [],
      // Backup 26: reuniões e e-mails enviados também entram na linha do tempo
      q(sb.from('reunioes').select('titulo, inicio, local, status, participantes').eq('cliente_id', cl.id)).catch(() => []),
      q(sb.rpc('emails_do_cliente', { p_cliente: cl.id })).catch(() => [])
    ]);
    const ev = [];
    // [quando, ícone, título, texto, item, categoria]
    ints.filter((i) => !(crm.length && /^\[CRM\]/.test(i.resumo || '')) && !(reus.length && /^Reunião agendada:/.test(i.resumo || '')))
      .forEach((i) => ev.push([i.quando, '💬', rotuloInteracao(i.tipo), i.resumo, i, /^Contrato /.test(i.resumo || '') ? 'contratos' : 'contatos']));
    crm.forEach((a) => ev.push([a.quando, '🎯', 'CRM · ' + rotuloInteracao(a.tipo), (a.crm_oportunidades ? a.crm_oportunidades.titulo + ': ' : '') + a.resumo, null, 'contatos']));
    reus.forEach((r) => ev.push([r.inicio, '📅', 'Reunião' + (r.status === 'cancelada' ? ' (cancelada)' : ''), r.titulo + (r.local ? ' — ' + r.local : '') + (r.participantes ? ' · ' + r.participantes : ''), null, 'contatos']));
    ctrs.forEach((c) => { ev.push([c.data_contrato + 'T12:00:00', '📄', 'Contrato' + (c.status === 'Aguardando assinatura' ? ' (aguardando assinatura)' : ''), c.descricao, null, 'contratos']);
      if (c.assinado_em) ev.push([c.assinado_em + 'T12:00:01', '✍', 'Contrato assinado', c.descricao, null, 'contratos']); });
    lanc.forEach((l) => ev.push([(l.data_pagamento || l.vencimento) + 'T12:00:00', '💰', 'Pagamento', l.descricao + ' — ' + brl(vl(l)), null, 'financeiro']));
    (mails || []).forEach((m) => ev.push([m.quando, '✉', 'E-mail · ' + (m.tipo || ''), m.assunto + ' → ' + m.para + (m.status === 'erro' ? ' (erro)' : m.status === 'retido' ? ' (retido pela pausa)' : ''), null, 'emails']));
    ts.forEach((t) => ev.push([t.concluida_em, '✓', 'Tarefa concluída', t.titulo, null, 'tarefas']));
    docs.forEach((d) => ev.push([d.criado_em, '📎', 'Documento', d.nome + ' (' + nomeTipoDoc(d.tipo) + ')', null, 'documentos']));
    hist.forEach((x) => {
      if (x.acao === 'INSERT') ev.push([x.quando, '＋', 'Cadastro criado', '', null, 'cadastro']);
      else if (x.acao === 'UPDATE' && x.antes && x.depois) {
        const mud = Object.keys(x.depois).filter((k) => !/atualizado_em|criado/.test(k) && JSON.stringify(x.antes[k]) !== JSON.stringify(x.depois[k]));
        if (mud.length) ev.push([x.quando, '✎', 'Cadastro alterado', mud.join(', '), null, 'cadastro']);
      }
    });
    ev.sort((a, b) => String(b[0]).localeCompare(String(a[0])));
    const CATS = [['', 'Tudo'], ['contatos', 'Contatos e reuniões'], ['contratos', 'Contratos'], ['financeiro', 'Financeiro'], ['emails', 'E-mails'], ['tarefas', 'Tarefas'], ['documentos', 'Documentos'], ['cadastro', 'Cadastro']];
    const presentes = new Set(ev.map((e) => e[5]));
    let cat = '';
    const pintarLt = () => {
      const vis = ev.filter((e) => !cat || e[5] === cat);
      alvo.querySelector('#fc-lt').innerHTML = vis.length ? '<div class="linha-tempo">' + vis.map(([q_, ic, tit, txt]) => '<div class="lt-item"><span class="lt-ic">' + ic + '</span><div><b>' + esc(tit) + '</b> <span class="sub">' + quandoBR(q_) + '</span>' +
        (txt ? '<div>' + esc(txt) + '</div>' : '') + '</div></div>').join('') + '</div>' : '<div class="vazio">Nada registrado ainda.</div>';
      alvo.querySelectorAll('#fc-lt-cat button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === cat));
    };
    alvo.innerHTML = '<div class="titulo-pag" style="margin-bottom:8px"><div><b>Linha do tempo</b> <span class="sub">' + ev.length + ' evento(s) · do primeiro contato ao financeiro</span></div>' +
      '<div class="acoes"><button class="btn btn-o btn-mini" id="fc-int2">+ Registrar interação</button></div></div>' +
      (ev.length ? '<div class="segmento" id="fc-lt-cat" style="margin-bottom:10px">' + CATS.filter(([v]) => !v || presentes.has(v)).map(([v, r]) => '<button type="button" data-v="' + v + '">' + r + '</button>').join('') + '</div>' : '') +
      '<div id="fc-lt"></div>';
    const segLt = alvo.querySelector('#fc-lt-cat'); if (segLt) segLt.onclick = (evt) => { const b = evt.target.closest('button'); if (b) { cat = b.dataset.v; pintarLt(); } };
    pintarLt();
    alvo.querySelector('#fc-int2').onclick = () => formInteracao(cl, () => ABA_FICHA.linha(alvo, cl));
  },
  async fiscal(alvo, cl) {
    const deb = (rot, v, neg) => v == null && neg == null ? '' : '<tr><td>' + rot + '</td><td class="mono">' + (v != null ? brl(v) : '—') + '</td><td class="mono">' + (neg != null ? brl(neg) : '—') + '</td></tr>';
    alvo.innerHTML = '<div class="duas-col"><div class="card"><div class="card-hd">Débitos</div><div class="card-bd">' +
      '<div class="tabela-wrap"><table><thead><tr><th>Órgão</th><th>Débito</th><th>Negociado</th></tr></thead><tbody>' +
      (deb('Receita Federal', cl.rfb, cl.rfb_negociada) + deb('PGFN', cl.pgfn, cl.pgfn_negociada) + deb('SEFAZ/MG', cl.sefaz_mg, null) + deb('AGE/MG', cl.age_mg, cl.age_mg_negociada) ||
        '<tr><td colspan="3" class="sub">Sem débitos informados.</td></tr>') + '</tbody></table></div>' +
      '<p class="sub" style="margin-top:8px">Para alterar os valores, use "Editar cadastro".</p></div></div>' +
      '<div class="card"><div class="card-hd">Situação</div><div class="card-bd dados">' +
      linhaDado('CAPAG', pillCapag(cl.capag)) + linhaDado('Situação cadastral', pillSitCad(cl.situacao_cadastral)) + linhaDado('Cadastro regular', pillSimNao(cl.cadastro_regular)) +
      linhaDado('Em operação', pillSimNao(cl.em_operacao)) + linhaDado('Regime tributário', esc(cl.regime_tributario)) + linhaDado('Tipo societário', esc(cl.tipo_societario)) +
      linhaDado('CEAT/TRT3', cl.ceat_trt3 != null ? String(cl.ceat_trt3) : '') + '</div></div></div>' +
      '<div class="card"><div class="card-bd" id="fc-certidoes"></div></div>';
    await pintarSublista(alvo.querySelector('#fc-certidoes'), 'certidoes', cl);
  },
  // Cartão CNPJ: o que a Receita diz hoje (atualização diária às 6h) e o histórico do que mudou
  async receita(alvo, cl, repinta) {
    if (soDigitos(cl.cpf_cnpj).length !== 14) { alvo.innerHTML = vazio('O cartão CNPJ vale só para empresas (CNPJ com 14 dígitos).'); return; }
    const [c, execs] = await Promise.all([
      q(sb.from('clientes').select('razao_social, nome_fantasia, situacao_cadastral, data_situacao, cnae_principal, porte, data_abertura, endereco, cidade, estado, cep, cnpj_atualizado_em').eq('id', cl.id).single()),
      q(sb.from('cnpj_execucoes').select('inicio, relatorio').filter('relatorio', 'cs', JSON.stringify([{ cliente_id: cl.id }])).order('inicio', { ascending: false }).limit(30)).catch(() => [])
    ]);
    const hist = [];
    execs.forEach((x) => (x.relatorio || []).forEach((r) => { if (r.cliente_id === cl.id && (r.erro || r.aguardando || (r.mudancas && !r.primeira))) hist.push(Object.assign({ quando: x.inicio }, r)); }));
    const admin = E.perfil && E.perfil.papel === 'admin';
    alvo.innerHTML = '<div class="titulo-pag" style="margin-bottom:8px"><div><b>Cartão CNPJ</b> <span class="sub">' +
      (c.cnpj_atualizado_em ? 'consultado na Receita em ' + quandoBR(c.cnpj_atualizado_em) : 'ainda não consultado — a atualização roda todo dia às 6h') + '</span></div>' +
      (admin ? '<div class="acoes"><button class="btn btn-o btn-mini" id="fc-cnpj-agora">↻ Consultar agora</button></div>' : '') + '</div>' +
      '<div class="duas-col"><div class="card"><div class="card-hd">Dados da Receita</div><div class="card-bd dados">' +
      linhaDado('Razão social', esc(c.razao_social)) + linhaDado('Nome fantasia', esc(c.nome_fantasia)) +
      linhaDado('Situação', (c.situacao_cadastral ? pillSitCad(c.situacao_cadastral) : '') + (c.data_situacao ? ' <span class="sub">desde ' + dataBR(c.data_situacao) + '</span>' : '')) +
      linhaDado('Atividade principal (CNAE)', esc(c.cnae_principal)) + linhaDado('Porte', esc(c.porte)) + linhaDado('Abertura', c.data_abertura ? dataBR(c.data_abertura) : '') +
      linhaDado('Endereço', esc(c.endereco)) + linhaDado('Cidade/UF', esc([c.cidade, c.estado].filter(Boolean).join('/'))) + linhaDado('CEP', esc(c.cep ? String(c.cep).replace(/^(\d{5})(\d{3})$/, '$1-$2') : '')) +
      '</div></div><div class="card"><div class="card-hd">Histórico de alterações</div><div class="card-bd">' +
      (hist.length ? '<div class="lista-ficha">' + hist.map((h) => '<div class="item-ficha"><div><b>' + quandoBR(h.quando) + '</b>' +
        (h.aguardando ? '<div class="sub">⏳ ' + esc(h.aviso) + '</div>' : h.erro ? '<div class="sub" style="color:var(--red-d)">Erro na consulta: ' + esc(h.erro) + '</div>' :
          h.mudancas.map((m) => '<div class="sub">' + esc(m.campo) + ': <s>' + esc(m.antes || '—') + '</s> → <b>' + esc(m.depois) + '</b></div>').join('')) + '</div></div>').join('') + '</div>'
        : vazio('Nenhuma alteração desde a primeira consulta.')) + '</div></div></div>';
    const bt = alvo.querySelector('#fc-cnpj-agora');
    if (bt) bt.onclick = () => comBotao(bt, async () => {
      const r = await chamarFuncao('erp-cnpj', { acao: 'rodar', cliente_id: cl.id });
      aviso('✓ Cartão CNPJ: ' + (r.mensagem || 'consultado') + '.'); repinta();
    });
  }
};
function rotuloInteracao(t) { return { ligacao: 'Ligação', reuniao: 'Reunião', whatsapp: 'WhatsApp', email: 'E-mail', anotacao: 'Anotação' }[t] || t; }
function quandoBR(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return dataBR(v);
  return d.toLocaleDateString('pt-BR') + (/T12:00:00$/.test(v) ? '' : ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
}


// ─────────── 📈 Evolução: "devia X, hoje deve Y" — foto mensal do grupo × agora ───────────
const ORG_FOTO = [['rfb', 'Receita Federal'], ['pgfn', 'PGFN'], ['age_mg', 'AGE/MG'], ['sefaz_mg', 'SEFAZ/MG']];
function mesBR(iso) { return String(iso || '').slice(5, 7) + '/' + String(iso || '').slice(0, 4); }
function variacao(antes, depois) {
  const d = (Number(depois) || 0) - (Number(antes) || 0);
  if (!d) return '<span class="sub">igual</span>';
  const pc = Number(antes) ? ' (' + (d > 0 ? '+' : '') + (d / Number(antes) * 100).toFixed(1).replace('.', ',') + '%)' : '';
  return '<span class="' + (d > 0 ? 'ev-pior' : 'ev-melhor') + '">' + (d > 0 ? '▲ +' : '▼ −') + brl(Math.abs(d)).replace('R$ ', 'R$ ') + pc + '</span>';
}
ABA_FICHA.evolucao = async function (alvo, cl) {
  if (!cl.grupo_id) { alvo.innerHTML = vazio('Este cliente não está em um grupo: o histórico é guardado por grupo.'); return; }
  const [fotos, agora] = await Promise.all([
    q(sb.from('fotos_mensais').select('mes, dados, tirada_em').eq('grupo_id', cl.grupo_id).order('mes', { ascending: false })).catch(() => []),
    q(sb.rpc('foto_do_grupo', { p_grupo: cl.grupo_id }))
  ]);
  const mesAtual = hojeISO().slice(0, 7);
  const antigas = fotos.filter((f) => f.mes.slice(0, 7) < mesAtual);
  const admin = E.perfil && E.perfil.papel === 'admin';
  if (!antigas.length) {
    alvo.innerHTML = '<div class="dica" style="margin-bottom:12px">O histórico deste grupo começou em <b>' + (fotos.length ? mesBR(fotos[fotos.length - 1].mes) : mesBR(hojeISO())) + '</b>. ' +
      'Todo dia 1º o sistema guarda uma "foto" (passivo, CAPAG, processos, parcelamentos e acordos). O comparativo aparece a partir do mês que vem.</div>' + fotoResumo(agora, 'Hoje');
    return;
  }
  const E2 = E.ev = E.ev || {};
  const escolhido = antigas.find((f) => f.mes === E2.mes) || antigas.find((f) => f.mes.slice(0, 7) <= somarDias(hojeISO(), -30).slice(0, 7)) || antigas[0];
  const a = escolhido.dados || {}, h = agora || {};
  const pa = (a.passivo || {}), ph = (h.passivo || {});
  const nomeG = nomeGrupo(cl.grupo_id);
  // processos: novos = ativos hoje que não existiam; encerrados = estavam ativos e hoje estão encerrados (ou sumiram)
  const atA = new Set(a.processos_ativos || []), atH = new Set(h.processos_ativos || []), encH = new Set(h.processos_encerrados || []);
  const todosA = new Set([...(a.processos_ativos || []), ...(a.processos_encerrados || [])]);
  const novos = [...atH].filter((n) => !todosA.has(n)), encerrados = [...atA].filter((n) => !atH.has(n));
  const empA = {}; (a.empresas || []).forEach((e) => { empA[e.id] = e; });
  const capagMudou = (h.empresas || []).filter((e) => empA[e.id] && (empA[e.id].capag || '') !== (e.capag || ''));
  const frase = 'Em ' + mesBR(escolhido.mes) + ' o grupo ' + esc(nomeG) + ' devia <b>' + brl(pa.total) + '</b>; hoje deve <b>' + brl(ph.total) + '</b> ' + variacao(pa.total, ph.total) + '. ' +
    'Tinha <b>' + atA.size + '</b> processo(s) em andamento: <b>' + encerrados.length + '</b> encerrado(s) desde então e <b>' + novos.length + '</b> novo(s)' +
    (capagMudou.length ? '. CAPAG mudou em ' + capagMudou.map((e) => esc(e.nome) + ' (' + esc(empA[e.id].capag || '—') + ' → ' + esc(e.capag || '—') + ')').join(', ') : '') + '.';
  alvo.innerHTML =
    '<div class="filtros" style="margin-bottom:10px"><label class="sub" for="ev-mes" style="align-self:center">Comparar hoje com</label><select class="busca sel" id="ev-mes">' +
      antigas.map((f) => '<option value="' + f.mes + '"' + (f.mes === escolhido.mes ? ' selected' : '') + '>' + mesBR(f.mes) + '</option>').join('') + '</select>' +
      (admin ? '<button class="btn btn-o btn-mini" id="ev-foto" title="Grava a foto deste mês de todos os grupos (a rotina faz isso sozinha todo dia 1º)">📸 Atualizar foto do mês</button>' : '') + '</div>' +
    '<div class="ev-frase">' + frase + '</div>' +
    '<div class="duas-col"><div class="card"><div class="card-hd">Passivo por órgão</div><div class="tabela-wrap"><table><thead><tr><th>Órgão</th><th class="num">' + mesBR(escolhido.mes) + '</th><th class="num">Hoje</th><th class="num">Diferença</th></tr></thead><tbody>' +
      ORG_FOTO.map(([k, r]) => '<tr><td>' + r + '</td><td class="num mono">' + brl(pa[k]) + '</td><td class="num mono">' + brl(ph[k]) + '</td><td class="num">' + variacao(pa[k], ph[k]) + '</td></tr>').join('') +
      '</tbody><tfoot><tr><td>Total</td><td class="num mono">' + brl(pa.total) + '</td><td class="num mono">' + brl(ph.total) + '</td><td class="num">' + variacao(pa.total, ph.total) + '</td></tr></tfoot></table></div></div>' +
    '<div class="card"><div class="card-hd">Empresas do grupo</div><div class="tabela-wrap"><table><thead><tr><th>Empresa</th><th>CAPAG</th><th class="num">' + mesBR(escolhido.mes) + '</th><th class="num">Hoje</th></tr></thead><tbody>' +
      (h.empresas || []).map((e) => { const x = empA[e.id]; return '<tr><td><b>' + esc(e.nome) + '</b>' + (x ? '' : ' <span class="pill aberto">nova</span>') + '</td><td>' +
        (x && (x.capag || '') !== (e.capag || '') ? pillCapag(x.capag || '—') + ' → ' + pillCapag(e.capag || '—') : e.capag ? pillCapag(e.capag) : '<span class="sub">—</span>') + '</td>' +
        '<td class="num mono">' + (x ? brl(x.total) : '—') + '</td><td class="num mono">' + brl(e.total) + '</td></tr>'; }).join('') +
      '</tbody></table></div></div></div>' +
    '<div class="duas-col"><div class="card"><div class="card-hd">Processos novos <span class="pill aberto">' + novos.length + '</span></div><div class="card-bd">' +
      (novos.length ? novos.map((n) => '<div class="mono">' + esc(n) + '</div>').join('') : '<span class="sub">Nenhum.</span>') + '</div></div>' +
    '<div class="card"><div class="card-hd">Processos encerrados <span class="pill pago">' + encerrados.length + '</span></div><div class="card-bd">' +
      (encerrados.length ? encerrados.map((n) => '<div class="mono">' + esc(n) + (encH.has(n) ? '' : ' <span class="sub">(saiu do cadastro)</span>') + '</div>').join('') : '<span class="sub">Nenhum.</span>') + '</div></div></div>' +
    '<div class="sub">Parcelamentos: ' + (a.parcelamentos || 0) + ' → ' + (h.parcelamentos || 0) + ' · Acordos em aberto: ' + (a.acordos_abertos || 0) + ' → ' + (h.acordos_abertos || 0) +
      ' (' + brl(a.acordos_saldo) + ' → ' + brl(h.acordos_saldo) + ')</div>';
  $('ev-mes').onchange = (ev) => { E2.mes = ev.target.value; ABA_FICHA.evolucao(alvo, cl); };
  const bf = $('ev-foto'); if (bf) bf.onclick = () => comBotao(bf, async () => { const n = await q(sb.rpc('tirar_fotos_mensais')); aviso('✓ Foto do mês atualizada (' + n + ' grupo(s)).'); });
};
function fotoResumo(f, rot) {
  const p = (f && f.passivo) || {};
  return '<div class="kpis">' + kpi('Passivo — ' + rot, brl(p.total), 'ambar', ORG_FOTO.filter(([k]) => Number(p[k])).map(([k, r]) => r + ' ' + brl(p[k])).join(' · ') || 'sem débitos') +
    kpi('Processos em andamento', String((f && f.processos_ativos || []).length), '', (f && f.processos_encerrados || []).length + ' encerrado(s)') +
    kpi('Parcelamentos', String((f && f.parcelamentos) || 0), '', '') + kpi('Acordos em aberto', String((f && f.acordos_abertos) || 0), '', brl(f && f.acordos_saldo)) + '</div>';
}

// ─────────── PGFN: inscrições em dívida ativa (API SERPRO, rotina erp-pgfn) ───────────
ABA_FICHA.pgfn = async function (alvo, cl) {
  const [ins, st] = await Promise.all([
    q(sb.from('pgfn_inscricoes').select('*').eq('cliente_id', cl.id).order('valor', { ascending: false })).catch(() => []),
    q(sb.rpc('status_config_pgfn')).catch(() => ({}))
  ]);
  if (!ins.length) {
    alvo.innerHTML = vazio(st && st.ligada && st.tem_chave ? 'Nenhuma inscrição em dívida ativa encontrada para este CNPJ na última consulta.' :
      'A consulta automática da PGFN ainda não está ligada. Depois de contratar a API "Consulta Dívida Ativa" do SERPRO, salve a chave em Alertas → PGFN.');
    return;
  }
  const porNat = {}; ins.forEach((x) => { const k = x.natureza || 'Outras'; porNat[k] = porNat[k] || { n: 0, v: 0, parc: 0 }; porNat[k].n++; porNat[k].v += Number(x.valor) || 0; if (x.parcelada) porNat[k].parc += Number(x.valor) || 0; });
  const tot = soma(ins, (x) => x.valor), parc = soma(ins.filter((x) => x.parcelada), (x) => x.valor);
  alvo.innerHTML = '<div class="kpis">' + kpi('Dívida ativa (PGFN)', brl(tot), 'ambar', ins.length + ' inscrição(ões)') + kpi('Parcelada / negociada', brl(parc), 'verde', ins.filter((x) => x.parcelada).length + ' inscrição(ões)') +
    kpi('Em cobrança', brl(tot - parc), tot - parc ? 'vermelho' : '', 'sem parcelamento') + '</div>' +
    '<div class="card"><div class="card-hd">Por origem</div><div class="tabela-wrap"><table><thead><tr><th>Origem</th><th class="num">Inscrições</th><th class="num">Parcelado</th><th class="num">Total</th></tr></thead><tbody>' +
      Object.keys(porNat).sort((a, b) => porNat[b].v - porNat[a].v).map((k) => '<tr><td><b>' + esc(k) + '</b></td><td class="num">' + porNat[k].n + '</td><td class="num mono">' + brl(porNat[k].parc) + '</td><td class="num mono">' + brl(porNat[k].v) + '</td></tr>').join('') + '</tbody></table></div></div>' +
    '<div class="card"><div class="card-hd">Inscrições (CDAs)</div><div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Nº da inscrição</th><th>Origem</th><th>Receita</th><th>Situação</th><th data-tipo="data">Inscrita em</th><th class="num">Valor</th></tr></thead><tbody>' +
      ins.map((x) => '<tr><td class="mono">' + esc(x.inscricao) + '</td><td>' + esc(x.natureza) + '</td><td>' + esc(x.receita) + '</td><td>' + (x.parcelada ? '<span class="pill pago">' : '<span class="pill hoje">') + esc(x.situacao || (x.parcelada ? 'Parcelada' : 'Em cobrança')) + '</span></td>' +
        '<td class="mono" data-ord="' + esc(x.data_inscricao || '') + '">' + dataBR(x.data_inscricao) + '</td><td class="num mono" data-ord="' + x.valor + '">' + brl(x.valor) + '</td></tr>').join('') + '</tbody></table></div>' +
      '<div class="sub" style="padding:8px 12px">Atualizado em ' + dataHoraBR(ins[0].atualizado_em) + ' pela consulta automática.</div></div>';
};
