'use strict';
// ═══════════════════════════════════════════════════════════════════
// Ficha do cliente (visão 360°): tudo sobre o cliente numa janela só,
// em abas. Clicar no cliente (tela Clientes) abre esta ficha.
// ═══════════════════════════════════════════════════════════════════
// Backup 49 (25): 7 abas — cada uma junta as partes antigas (as funções de ABA_FICHA continuam as mesmas, empilhadas)
// Backup 85 (CL1/CL2): abas na ordem do ambiente — Resumo · Parcelamentos · Acordos · Processos · Financeiro · Documentos · E-mails · Linha do tempo;
// "Contatos e endereços" e "Sócios" (só do ERP) continuam no fim (lista do Backup 85 para decidir)
const ABAS_FICHA = [['resumo', 'Resumo'], ['parcelamentos', 'Parcelamentos'], ['acordos', 'Acordos'], ['processos', 'Processos'],
  ['financeiro', 'Financeiro'], ['documentos', 'Documentos'], ['emails', 'E-mails'], ['historico', 'Linha do tempo']];
// Backup 87 (D12): 8 abas, como no ambiente; Contatos, Endereços, Contas e Sócios continuam (a pedido) no fim do Resumo
// Backup 53: Resumo na ordem Cadastro · Situação · Tarefas · Dados da Receita · Histórico de alterações (débitos ao lado das tarefas; sem certidões)
const PARTES_FICHA = { resumo: ['resumo', 'contatos', 'enderecos', 'contas', 'socios', 'receita'], processos: ['processos'],
  financeiro: ['contratos', 'financeiro'], documentos: ['documentos', 'docsMes'], historico: ['linha', 'tarefas'],
  parcelamentos: ['parcelamentos'], acordos: ['acordos'], emails: ['emails'] };
// nome antigo de aba (atalhos de outras telas) → aba nova
const ABA_NOVA = { enderecos: 'resumo', contas: 'resumo', contatos: 'resumo', socios: 'resumo', contratos: 'financeiro', tarefas: 'historico', linha: 'historico', fiscal: 'resumo', receita: 'resumo' };

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
    if (!await confirmarB('Excluir este(a) ' + cfg.um + '?')) return;
    await excluir(cfg.tabela, item.id);
    aviso('Excluído.'); fecharJanela(j); await depois();
  });
}
async function pintarSublista(alvo, chave, cl) {
  const cfg = SUBLISTAS[chave];
  const itens = await q(sb.from(cfg.tabela).select('*').eq('cliente_id', cl.id).order('criado_em'));
  // Backup 87 (D12): bloco no desenho do ambiente — título com linha, itens em .b-li e "+ Incluir" discreto
  alvo.innerHTML = '<div class="b-bloco fc-sub"><h3>' + cfg.titulo + (itens.length ? ' · ' + itens.length : '') + '</h3>' +
    '<div class="b-lista">' + itens.map((x) => '<div class="b-li" data-sub="' + x.id + '"><span class="b-li-tx fc-sub-tx">' + cfg.linha(x) + '</span>' +
      '<button class="b-link" type="button" data-editar-sub="' + x.id + '" title="Editar">' + iconeB('lapis') + '</button></div>').join('') +
    (itens.length ? '' : '<p class="fc-sub-vazio">' + cfg.vazio + '</p>') + '</div>' +
    '<div><button class="b-link" type="button" data-novo-sub>' + iconeB('mais') + ' Incluir ' + cfg.um + '</button></div></div>';
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
  // Backup 74: cabeçalho como no ambiente de teste — grupo · tipo em cima (pequeno), o nome e, embaixo, CPF/CNPJ · sócio; o conteúdo continua o completo de antes
  const tipoCli = cl.tipo === 'Demanda' ? 'Serviço pontual' : cl.tipo;
  // Backup 85 (CL4/JN2): como no ambiente — "Recebe e-mails" no alto à direita, as abas presas ao cabeçalho e os botões no rodapé
  // ("Ver como o cliente vê", "Editar cadastro", Fechar); os atalhos do ERP (+ Lançar, WhatsApp, E-mail, etiquetas) continuam
  const j = abrirJanela({ titulo: cl.nome, larga: true, kick: [cl.grupos && cl.grupos.nome, tipoCli].filter(Boolean).join(' · '),
    sub: esc([mascaraDoc(cl.cpf_cnpj), cl.socio_admin ? 'sócio: ' + cl.socio_admin : ''].filter(Boolean).join(' · ')),
    dir: pillRecebeEmail(cl, true),
    abas: '<div class="b-seg ficha-abas" id="fc-abas" role="tablist">' + ABAS_FICHA.map(([k, r]) => '<button type="button" class="b-seg-bt" role="tab" data-aba="' + k + '">' + r + '</button>').join('') + '</div>',
    // Backup 87 (D12): corpo igual ao ambiente (sem a faixa de selos); "+ Lançar ▾" (com WhatsApp, E-mail e Etiquetas) foi para o rodapé
    rodape: '<div class="acoes fc-pe-esq">' + (cl.grupo_id ? '<button class="btn btn-o" type="button" id="fc-portal" title="Abre o portal do cliente deste grupo, do jeito que ele vê">' + iconeB('olho') + ' Ver como o cliente vê</button>' : '') +
      '<span class="tf-cfg-wrap fc-lancar-wrap"><button class="btn btn-o" type="button" id="fc-lancar" aria-expanded="false" aria-haspopup="true">' + iconeB('mais') + ' Lançar</button>' +
      '<span class="tf-cfg-menu fc-lancar-menu" id="fc-lancar-menu" hidden>' +
      '<button class="btn btn-o btn-mini" id="fc-tarefa">Tarefa</button><button class="btn btn-o btn-mini" id="fc-lanc">Lançamento financeiro</button>' +
      '<button class="btn btn-o btn-mini" id="fc-doc">Documento</button><button class="btn btn-o btn-mini" id="fc-int">Interação (ligação, WhatsApp…)</button>' +
      (pode('crm', 'editar') ? '<button class="btn btn-o btn-mini" id="fc-reuniao" title="Agenda reunião com o cliente: tarefa para os participantes e convite opcional">Reunião</button>' +
        '<button class="btn btn-o btn-mini" id="fc-indic" title="Oportunidade nova no CRM com origem = indicação deste cliente">Indicação</button>' +
        '<button class="btn btn-o btn-mini" id="fc-lead" title="Nova oportunidade no CRM para este cliente (novo serviço)">Novo serviço (CRM)</button>' : '') +
      '<button class="btn btn-o btn-mini" id="fc-etq" title="Etiquetas">Etiquetas' + (etq.length ? ' (' + etq.length + ')' : '') + '</button>' +
      (tel ? '<a class="btn btn-o btn-mini" target="_blank" rel="noopener" href="https://wa.me/' + (soDigitos(tel).length <= 11 ? '55' : '') + soDigitos(tel) + '">WhatsApp</a>' : '') +
      (mail ? '<a class="btn btn-o btn-mini" href="mailto:' + esc(mail) + '">E-mail</a>' : '') + '</span></span></div>' +
      '<div class="acoes"><button class="btn btn-o" type="button" id="fc-editar">' + iconeB('lapis') + ' Editar cadastro</button><button class="btn btn-o" type="button" data-fechar>Fechar</button></div>',
    corpo:
      '<div id="fc-corpo" class="ficha-corpo"></div>' });
  j.querySelector('.janela').classList.add('ficha');
  const corpo = j.querySelector('#fc-corpo');
  let atual = ABA_NOVA[aba] || aba || 'resumo';
  const mostrar = async (k) => {
    k = ABA_NOVA[k] || k; atual = k;
    j.querySelectorAll('#fc-abas button').forEach((b) => { b.classList.toggle('ativo', b.dataset.aba === k); b.setAttribute('aria-selected', String(b.dataset.aba === k)); });
    corpo.innerHTML = '<div class="carregando">Carregando…</div>';
    const partes = PARTES_FICHA[k] || [k];
    const caixas = partes.map((p) => { const d = document.createElement('div'); d.className = 'ficha-parte ficha-parte-' + p; return d; });
    corpo.innerHTML = ''; caixas.forEach((d) => corpo.appendChild(d));
    await Promise.all(partes.map(async (p, i) => {
      try { await ABA_FICHA[p](caixas[i], cl, () => mostrar(atual)); }
      catch (e) { console.error(e); caixas[i].innerHTML = '<div class="vazio">' + esc(erroAmigavel(e)) + '</div>'; }
    }));
  };
  { const bt = j.querySelector('#fc-lancar'), m = j.querySelector('#fc-lancar-menu');
    bt.onclick = (ev) => { ev.stopPropagation(); m.hidden = !m.hidden; bt.setAttribute('aria-expanded', String(!m.hidden)); };
    m.addEventListener('click', () => setTimeout(() => { m.hidden = true; bt.setAttribute('aria-expanded', 'false'); }, 0));
    j.addEventListener('click', (ev) => { if (!m.hidden && !ev.target.closest('.fc-lancar-wrap')) { m.hidden = true; bt.setAttribute('aria-expanded', 'false'); } }); }
  j.querySelector('#fc-abas').onclick = (ev) => { const b = ev.target.closest('button'); if (b) mostrar(b.dataset.aba); };
  const reabrir = async () => { await carregarCadastros(true); fecharJanela(j); await abrirFicha(id, atual); };
  j.querySelector('#fc-editar').onclick = () => formCliente(cl, reabrir);
  j.querySelector('#fc-tarefa').onclick = () => formTarefa({ cliente_id: cl.id, grupo_id: cl.grupo_id, responsavel: cl.responsavel }, () => mostrar('tarefas'));
  j.querySelector('#fc-lanc').onclick = () => formLancamento({ tipo: 'receita', empresa: 'escritorio', cliente_id: cl.id, grupo_id: cl.grupo_id, responsavel: cl.responsavel }, () => mostrar('financeiro'));
  j.querySelector('#fc-doc').onclick = () => janelaEnviarDocumento({ cliente_id: cl.id, grupo_id: cl.grupo_id }, () => mostrar('documentos'));
  j.querySelector('#fc-int').onclick = () => formInteracao(cl, () => mostrar('linha'));
  j.querySelector('#fc-etq').onclick = () => janelaEtiquetas(cl, etq, reabrir);
  { const bp = j.querySelector('#fc-portal'); if (bp) bp.onclick = () => { fecharJanela(j); verComoCliente(cl.grupo_id); }; }
  const fcMail = j.querySelector('[data-cli-email]');
  if (fcMail) fcMail.onclick = () => comBotao(fcMail, async () => { await trocarRecebeEmail([cl.id], cl.recebe_email === false); fcMail.outerHTML = pillRecebeEmail(cl, true);
    const n = j.querySelector('[data-cli-email]'); if (n) n.onclick = fcMail.onclick; });
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
  // Backup 87 (D12): Resumo do ambiente — ficha de 8 campos + 4 números (Passivo · Parcelamentos · Parcelas em atraso · Honorários em aberto);
  // abaixo, Contatos, Endereços, Contas, Sócios e o Cartão CNPJ (funções do ERP mantidas a pedido)
  async resumo(alvo, cl) {
    const h = hojeISO();
    E.pc = E.pc || { grupo: '', chip: 'todos' };
    const [lanc, cert, conf, PA] = await Promise.all([
      lancamentosDoCliente(cl),
      q(sb.from('cliente_certificado').select('validade').eq('cliente_id', cl.id).maybeSingle()).catch(() => null),
      q(sb.from('rotina_conferencias').select('quando').eq('area', 'passivo').eq('registro_id', cl.id).order('quando', { ascending: false }).limit(1)).catch(() => []),
      (E.pc.PA ? Promise.resolve(E.pc.PA) : dadosParcelamentos().then((x) => (E.pc.PA = x))).catch(() => [])
    ]);
    const doc = soDigitos(cl.cpf_cnpj || ''), nome = normalizar(cl.nome || '');
    const meus = PA.filter((pa) => (doc && soDigitos(pa.cnpj || '') === doc) || (nome && normalizar(pa.empresa || '') === nome));
    const atr = [].concat(...meus.map((pa) => pa.parcelas || [])).filter((x) => !x.pago && x.venc && x.venc <= h);
    const hon = lanc.filter((l) => l.tipo === 'receita' && !l.pago && !l.perda);
    const honAtr = hon.some((l) => l.vencimento && l.vencimento <= h);
    const passivo = soma([cl.rfb, cl.rfb_negociada, cl.pgfn, cl.pgfn_negociada, cl.sefaz_mg, cl.age_mg, cl.age_mg_negociada].map((x) => Number(x) || 0));
    const val = cert && cert.validade, perto = val && val <= somarDias(h, 30);
    const area = cl.area === 'juridico' ? 'Jurídico' : cl.area === 'contabil' ? 'Contábil' : 'Jurídico e contábil';
    const campo = (r, v, cls) => '<div><span>' + r + '</span><b' + (cls ? ' class="' + cls + '"' : '') + '>' + v + '</b></div>';
    alvo.innerHTML = '<div class="b-ficha b-ficha-4 fc-ficha">' +
      campo('E-mail', cl.email ? esc(cl.email) : '—') + campo('Telefone', esc(cl.telefone || '—')) + campo('Responsável', esc(cl.responsavel || '—')) + campo('Área', area) +
      campo('CAPAG', esc(cl.capag || '—')) + campo('Procuração', cl.procuracao ? 'Sim' : cl.procuracao === false ? 'Não' : '—') +
      campo('Certificado digital', val ? 'vale até ' + dataBR(val) : cl.certificado ? 'Sim' : 'não tem', !val && !cl.certificado ? 'b-verm' : perto ? 'b-amb' : '') +
      campo('Passivo conferido', conf && conf[0] ? dataBR(String(conf[0].quando).slice(0, 10)) : 'nunca') + '</div>' +
      numsFaixa([['Passivo', brlCurto(passivo)], ['Parcelamentos', String(meus.length)], ['Parcelas em atraso', String(atr.length), '', atr.length ? 'b-verm' : ''],
        ['Honorários em aberto', brl(soma(hon, vl)), '', honAtr ? 'b-verm' : '']]);
  },
  contatos: (alvo, cl) => pintarSublista(alvo, 'contatos', cl),
  enderecos: (alvo, cl) => pintarSublista(alvo, 'enderecos', cl),
  contas: (alvo, cl) => pintarSublista(alvo, 'contas', cl),
  socios: (alvo, cl) => pintarSublista(alvo, 'socios', cl),
  // Backup 87 (D03): lista do ambiente — natureza · tribunal, nº, última movimentação e situação; o clique abre a janela do processo
  async processos(alvo, cl) {
    if (!cl.grupo_id) { alvo.innerHTML = '<p class="fc-sub-vazio">Este cliente não tem grupo; os processos são ligados por grupo.</p>'; return; }
    const ps = await q(sb.from('processos').select('*').eq('grupo_id', cl.grupo_id).order('data_distribuicao', { ascending: false, nullsFirst: false }));
    if (!ps.length) { alvo.innerHTML = '<p class="fc-sub-vazio">Nenhum processo.</p>'; return; }
    const D = (typeof dbE === 'function' ? dbE() : null) || {}, doERP = {};
    (Array.isArray(D.processos) ? D.processos : []).forEach((x) => { if (x._id) doERP[x._id] = x; });
    const forma = (p) => doERP[p.id] || { _id: p.id, numero: p.numero, autor: p.autor, reu: p.reu, natureza: p.natureza, competencia: p.competencia, advogado: p.advogado, valor: p.valor,
      grupo: nomeGrupo(cl.grupo_id), obs: p.obs, arquivamento: /arquiv/i.test(p.status || '') ? 'Arquivado' : /extint|baixad/i.test(p.status || '') ? p.status : '',
      ultimaMov: p.ultima_movimentacao, ultimaMovEm: p.ultima_movimentacao_em ? dataBR(String(p.ultima_movimentacao_em).slice(0, 10)) : '' };
    const L = ps.map(forma);
    alvo.innerHTML = '<div class="b-lista">' + L.map((p, i) => { const sit = p.arquivamento || 'Ativo', trib = tribunalProcesso(p) || p.competencia || '';
      return '<button type="button" class="b-li b-li-bt" data-fc-proc="' + i + '"><span class="b-li-tx"><b>' + esc([p.natureza || 'Processo', trib].filter(Boolean).join(' · ')) + '</b>' +
        '<small class="b-num">' + esc(p.numero || '—') + '</small>' + (p.ultimaMovEm || p.ultimaMov ? '<small>Última movimentação: ' + esc([p.ultimaMovEm, p.ultimaMov].filter(Boolean).join(' — ')) + '</small>' : '') + '</span>' +
        '<span class="b-pill ' + (sit === 'Ativo' ? 'b-g' : 'b-n') + '">' + esc(sit) + '</span></button>'; }).join('') + '</div>';
    alvo.onclick = (ev) => { const b = ev.target.closest('[data-fc-proc]'); if (b && window.ERP_ABRIR_PROCESSO) window.ERP_ABRIR_PROCESSO(L[+b.dataset.fcProc]); };
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
  // Backup 85 (CL2): parcelas dos parcelamentos desta empresa (pelo CNPJ ou pelo nome), com Emitir e Baixa na linha
  async parcelamentos(alvo, cl) {
    E.pc = E.pc || { grupo: '', chip: 'todos' };
    const PA = E.pc.PA || (E.pc.PA = await dadosParcelamentos());
    const doc = soDigitos(cl.cpf_cnpj || ''), nome = normalizar(cl.nome || '');
    const meus = PA.filter((pa) => (doc && soDigitos(pa.cnpj || '') === doc) || (nome && normalizar(pa.empresa || '') === nome));
    const L = [].concat(...meus.map((pa) => pa.parcelas));
    if (!L.length) { alvo.innerHTML = vazioB({ icone: 'camadas', titulo: 'Nenhum parcelamento', frase: 'Esta empresa não tem parcelamento cadastrado.' }); return; }
    tabelaB(alvo, { id: 'fc-parc-' + cl.id, linhas: L, unidade: ['parcela', 'parcelas'], contagem: true, altura: '360px', ord: { k: 'venc', dir: 1 },
      abas: [{ id: 'apagar', rot: 'A pagar', f: (x) => !x.pago }, { id: 'pago', rot: 'Pagas', f: (x) => x.pago }], prazos: true, prazosAbas: ['apagar'],
      venc: (x) => x.venc, somaB: (x) => x.valor, linhaCls: (x) => (!x.pago && x.venc && x.venc <= hojeISO() ? ' b-tr-venc' : ''),
      colunas: colunasParcelas({ semGrupo: true }).filter((c) => c.k !== 'emp'), clique: (x) => janelaParcelamento(x.pa) });
  },
  async acordos(alvo, cl) {
    E.ac = E.ac || { grupo: '', chip: 'todos' };
    const T = E.ac.T || (E.ac.T = await dadosAcordos());
    const nome = normalizar(cl.nome || '');
    const L = T.filter((x) => nome && normalizar(x.devedor || '') === nome);
    if (!L.length) { alvo.innerHTML = vazioB({ icone: 'contrato', titulo: 'Nenhum acordo', frase: 'Esta empresa não aparece como devedora em nenhum acordo.' }); return; }
    const A = acordosDe(L), porId = {}; A.forEach((a) => a.parcelas.forEach((x) => { porId[x.id] = a; }));
    tabelaB(alvo, { id: 'fc-ac-' + cl.id, linhas: L, unidade: ['parcela', 'parcelas'], contagem: true, altura: '360px', ord: { k: 'venc', dir: 1 },
      abas: [{ id: 'apagar', rot: 'A pagar', f: (x) => !x.pago }, { id: 'pago', rot: 'Pagas', f: (x) => x.pago }],
      venc: (x) => x.venc, somaB: (x) => x.valor, linhaCls: vencidaA,
      colunas: colunasAcordos({ semGrupo: true }).filter((c) => !['dev'].includes(c.k)), clique: (x) => { if (porId[x.id]) janelaAcordo(porId[x.id]); } });
  },
  // e-mails que saíram (ou ficaram no rascunho / com erro) para este cliente
  async emails(alvo, cl) {
    const L = await q(sb.from('email_fila').select('id, assunto, para, status, erro, criado_em, enviado_em').eq('cliente_id', cl.id).order('criado_em', { ascending: false }).limit(200)).catch(() => []);
    const ST = { enviado: ['Enviado', 'pago'], rascunho: ['No rascunho', 'aberto'], rascunho_salvo: ['No rascunho', 'aberto'], erro: ['Com erro', 'vencido'], pendente: ['Na fila', 'neutro'], retido: ['Retido', 'neutro'], cancelado: ['Cancelado', 'neutro'] };
    if (!L.length) { alvo.innerHTML = vazioB({ icone: 'enviar', titulo: 'Nenhum e-mail para este cliente ainda', frase: 'Os e-mails de guias, recibos e cobranças aparecem aqui.' }); return; }
    alvo.innerHTML = '<div class="b-lista">' + L.map((e) => { const st = ST[e.status] || [e.status, 'neutro'];
      return '<div class="b-li"><span class="b-li-tx"><b>' + esc(e.assunto || '—') + '</b><small>' + dataBR(String(e.enviado_em || e.criado_em || '').slice(0, 10)) + ' · para ' + esc(e.para || '—') +
        (e.status === 'erro' && e.erro ? ' · <span class="b-pz-r">' + esc(e.erro) + '</span>' : '') + '</small></span><span class="pill ' + st[1] + '">' + esc(st[0]) + '</span></div>'; }).join('') + '</div>';
  },
  // "Documentos do mês": o que o cliente mandou no mês passado (competência), por tipo
  async docsMes(alvo, cl) {
    const h = hojeISO(), ini = somarMeses(h.slice(0, 7) + '-01', -1), fim = h.slice(0, 7) + '-01';
    const L = await q(sb.from('documentos').select('id, tipo, nome, criado_em').eq('cliente_id', cl.id).gte('criado_em', ini).lt('criado_em', somarMeses(fim, 1))).catch(() => []);
    const mes = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][+ini.slice(5, 7) - 1];
    const tipos = [...new Set(L.map((d) => d.tipo || 'outros'))];
    alvo.innerHTML = '<div class="b-bloco"><h3>Documentos do mês (' + mes + ' e este mês)</h3>' + (tipos.length ? '<div class="b-lista">' + tipos.map((t) => { const n = L.filter((d) => (d.tipo || 'outros') === t).length;
      return '<div class="b-li"><span class="b-li-tx"><b>' + esc(t) + '</b></span><span class="b-ok-txt">✓ ' + plural(n, 'recebido', 'recebidos') + '</span></div>'; }).join('') + '</div>'
      : '<p class="b-mudo">Nada recebido desde 1º de ' + mes + '.</p>') + '</div>';
  },
  documentos: (alvo, cl) => blocoDocumentos(alvo, { cliente_id: cl.id, grupo_id: cl.grupo_id }, { vazio: 'Nenhum documento. Envie contrato social, procuração, documentos pessoais…' }),
  async linha(alvo, cl) {
    const g = cl.grupo_id;
    const [ints, ctrs, lanc, ts, docs, hist, crm, reus, mails, pBx, aBx, movs] = await Promise.all([
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
      q(sb.rpc('emails_do_cliente', { p_cliente: cl.id })).catch(() => []),
      // Backup 76 (F6): baixas de parcelamentos e de acordos do grupo e as movimentações dos processos — tudo num lugar só
      g && pode('juridico') ? q(sb.from('parcelas').select('numero, data_pagamento, parcelamentos!inner(empresa, natureza, local, total_parcelas, grupo_id)').eq('parcelamentos.grupo_id', g).eq('pago', true).not('data_pagamento', 'is', null).order('data_pagamento', { ascending: false }).limit(60)).catch(() => []) : [],
      g && pode('juridico') ? q(sb.from('acordos').select('parcela, total_parcelas, valor, credor, data_pagamento').eq('grupo_id', g).eq('pago', true).not('data_pagamento', 'is', null).order('data_pagamento', { ascending: false }).limit(60)).catch(() => []) : [],
      g && pode('juridico') ? q(sb.from('processo_movimentacoes').select('data, tipo, descricao, processos!inner(numero, grupo_id)').eq('processos.grupo_id', g).order('data', { ascending: false }).limit(40)).catch(() => []) : []
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
    pBx.forEach((x) => { const pa = x.parcelamentos || {}; ev.push([x.data_pagamento + 'T12:00:00', '✓', 'Baixa — parcelamento', (pa.empresa || '') + ' · ' + (pa.natureza || '') + (pa.local ? ' (' + pa.local + ')' : '') + ' · parcela ' + x.numero + (pa.total_parcelas ? ' de ' + pa.total_parcelas : ''), null, 'baixas']); });
    aBx.forEach((x) => ev.push([x.data_pagamento + 'T12:00:00', '✓', 'Baixa — acordo', 'com ' + (x.credor || '—') + ' · parcela ' + (x.parcela || '') + (x.total_parcelas ? ' de ' + x.total_parcelas : '') + ' · ' + brl(x.valor), null, 'baixas']));
    const TIPO_MOV = { movimentacao: 'Movimentação', decisao: 'Decisão', valor: 'Valor atualizado', procuracao: 'Procuração', sem_novidade: 'Conferido — sem novidade' };
    movs.forEach((m) => ev.push([m.data + 'T12:00:00', '⚖', 'Processo ' + ((m.processos && m.processos.numero) || ''), (TIPO_MOV[m.tipo] || m.tipo) + (m.descricao ? ' — ' + m.descricao : ''), null, 'processos']));
    docs.forEach((d) => ev.push([d.criado_em, '📎', 'Documento', d.nome + ' (' + nomeTipoDoc(d.tipo) + ')', null, 'documentos']));
    hist.forEach((x) => {
      if (x.acao === 'INSERT') ev.push([x.quando, '＋', 'Cadastro criado', '', null, 'cadastro']);
      else if (x.acao === 'UPDATE' && x.antes && x.depois) {
        const mud = Object.keys(x.depois).filter((k) => !/atualizado_em|criado/.test(k) && JSON.stringify(x.antes[k]) !== JSON.stringify(x.depois[k]));
        if (mud.length) ev.push([x.quando, '✎', 'Cadastro alterado', mud.join(', '), null, 'cadastro']);
      }
    });
    ev.sort((a, b) => String(b[0]).localeCompare(String(a[0])));
    const CATS = [['', 'Tudo'], ['contatos', 'Contatos e reuniões'], ['contratos', 'Contratos'], ['financeiro', 'Financeiro'], ['baixas', 'Baixas'], ['processos', 'Processos'], ['emails', 'E-mails'], ['tarefas', 'Tarefas'], ['documentos', 'Documentos'], ['cadastro', 'Cadastro']];
    const presentes = new Set(ev.map((e) => e[5]));
    let cat = '';
    const pintarLt = () => {
      const vis = ev.filter((e) => !cat || e[5] === cat);
      alvo.querySelector('#fc-lt').innerHTML = vis.length ? '<div class="linha-tempo">' + vis.map(([q_, ic, tit, txt]) => '<div class="lt-item"><span class="lt-ic">' + ic + '</span><div><b>' + esc(tit) + '</b> <span class="sub">' + quandoBR(q_) + '</span>' +
        (txt ? '<div>' + esc(txt) + '</div>' : '') + '</div></div>').join('') + '</div>' : '<div class="vazio">Nada registrado ainda.</div>';
      alvo.querySelectorAll('#fc-lt-cat button').forEach((b) => { b.classList.toggle('ativo', b.dataset.v === cat); b.setAttribute('aria-selected', String(b.dataset.v === cat)); });
    };
    alvo.innerHTML = '<div class="titulo-pag" style="margin-bottom:8px"><div><b>Linha do tempo</b> <span class="sub">' + ev.length + ' evento(s) · do primeiro contato ao financeiro</span></div>' +
      '<div class="acoes"><button class="btn btn-o btn-mini" id="fc-int2">+ Registrar interação</button></div></div>' +
      (ev.length ? '<div class="b-seg b-seg-mini" id="fc-lt-cat" style="margin-bottom:10px">' + CATS.filter(([v]) => !v || presentes.has(v)).map(([v, r]) => '<button type="button" class="b-seg-bt" data-v="' + v + '">' + r + '</button>').join('') + '</div>' : '') +
      '<div id="fc-lt"></div>';
    const segLt = alvo.querySelector('#fc-lt-cat'); if (segLt) segLt.onclick = (evt) => { const b = evt.target.closest('button'); if (b) { cat = b.dataset.v; pintarLt(); } };
    pintarLt();
    alvo.querySelector('#fc-int2').onclick = () => formInteracao(cl, () => ABA_FICHA.linha(alvo, cl));
  },
  async fiscal(alvo, cl) {
    alvo.innerHTML = '<div class="duas-col">' + cardDebitos(cl) +
      '<div class="card"><div class="card-hd">Situação</div><div class="card-bd dados">' +
      linhaDado('CAPAG', pillCapag(cl.capag)) + linhaDado('Situação cadastral', pillSitCad(cl.situacao_cadastral)) + linhaDado('Cadastro regular', pillSimNao(cl.cadastro_regular)) +
      linhaDado('Em operação', pillSimNao(cl.em_operacao)) + linhaDado('Regime tributário', esc(cl.regime_tributario)) + linhaDado('Tipo societário', esc(cl.tipo_societario)) +
      linhaDado('CEAT/TRT3', cl.ceat_trt3 != null ? String(cl.ceat_trt3) : '') + '</div></div></div>';
  },
  // Cartão CNPJ: o que a Receita diz hoje (atualização diária às 6h) e o histórico do que mudou
  async receita(alvo, cl, repinta) {
    if (soDigitos(cl.cpf_cnpj).length !== 14) { alvo.innerHTML = ''; return; }   // Backup 49: no Resumo, pessoa física simplesmente não tem esta parte
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
    alvo.innerHTML = '<details class="b-bloco fc-receita"><summary>Cartão CNPJ (Receita Federal)</summary>' + alvo.innerHTML + '</details>';
    const bt = alvo.querySelector('#fc-cnpj-agora');
    if (bt) bt.onclick = () => comBotao(bt, async () => {
      const r = await chamarFuncao('erp-cnpj', { acao: 'rodar', cliente_id: cl.id });
      aviso('✓ Cartão CNPJ: ' + (r.mensagem || 'consultado') + '.'); repinta();
    });
  }
};
function cardDebitos(cl) {
  const deb = (rot, v, neg) => v == null && neg == null ? '' : '<tr><td>' + rot + '</td><td class="mono">' + (v != null ? brl(v) : '—') + '</td><td class="mono">' + (neg != null ? brl(neg) : '—') + '</td></tr>';
  return '<div class="card"><div class="card-hd">Débitos</div><div class="card-bd">' +
    '<div class="tabela-wrap"><table><thead><tr><th>Órgão</th><th>Débito</th><th>Negociado</th></tr></thead><tbody>' +
    (deb('Receita Federal', cl.rfb, cl.rfb_negociada) + deb('PGFN', cl.pgfn, cl.pgfn_negociada) + deb('SEFAZ/MG', cl.sefaz_mg, null) + deb('AGE/MG', cl.age_mg, cl.age_mg_negociada) ||
      '<tr><td colspan="3" class="sub">Sem débitos informados.</td></tr>') + '</tbody></table></div>' +
    '<p class="sub" style="margin-top:8px">Para alterar os valores, use "Editar cadastro".</p></div></div>';
}
function rotuloInteracao(t) { return { ligacao: 'Ligação', reuniao: 'Reunião', whatsapp: 'WhatsApp', email: 'E-mail', anotacao: 'Anotação' }[t] || t; }
function quandoBR(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return dataBR(v);
  return d.toLocaleDateString('pt-BR') + (/T12:00:00$/.test(v) ? '' : ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
}
