'use strict';
// ═══════════════════════════════════════════════════════════════════
// Administração (só admin): Usuários · Importar planilhas · Backup ·
// Histórico. O Histórico lê a tabela "historico" do banco — é a prova
// de que cada gravação chegou ao servidor, com autor e horário.
// ═══════════════════════════════════════════════════════════════════

const ABAS_ADMIN = [
  { id: 'usuarios', rot: '👤 Usuários' },
  { id: 'importar', rot: '📥 Importar planilhas' },
  { id: 'backup',   rot: '💾 Backup' },
  { id: 'historico', rot: '🕘 Histórico' }
];

TELAS.admin = async function () {
  E.adm = E.adm || { aba: 'usuarios', tabela: '' };
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Administração</h1><p>Usuários, importação, backup e histórico de alterações</p></div></div>' +
    '<div class="abas" id="adm-abas">' + ABAS_ADMIN.map((a) => '<button data-aba="' + a.id + '">' + a.rot + '</button>').join('') + '</div>' +
    '<div id="adm-corpo"></div>';
  $('adm-abas').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { E.adm.aba = b.dataset.aba; pintarAdmin(); } };
  await pintarAdmin();
};

async function pintarAdmin() {
  document.querySelectorAll('#adm-abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === E.adm.aba));
  const corpo = $('adm-corpo');
  corpo.innerHTML = '<div class="carregando">Carregando…</div>';
  try { await ({ usuarios: admUsuarios, importar: admImportar, backup: admBackup, historico: admHistorico })[E.adm.aba](corpo); }
  catch (e) { console.error(e); corpo.innerHTML = '<div class="card"><div class="card-bd msg-erro">' + esc(erroAmigavel(e)) + '</div></div>'; }
}

// ─────────────────────────── USUÁRIOS ──────────────────────────────
async function admUsuarios(corpo) {
  const lista = await q(sb.from('perfis').select('*').order('criado_em'));
  corpo.innerHTML =
    '<div class="card"><div class="card-bd dica" style="border-radius:var(--r) var(--r) 0 0">' +
    '<b>Para cadastrar alguém novo:</b> no site do Supabase, abra o projeto → <b>Authentication</b> → <b>Users</b> → ' +
    '<b>Add user</b> → <b>Create new user</b>, informe e-mail e senha e marque <b>Auto Confirm User</b>. ' +
    'A pessoa aparece aqui como <b>Inativo</b>; troque para <b>Equipe</b> para liberar.</div>' +
    '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Nome</th><th>E-mail</th><th>Acesso</th><th data-tipo="data">Desde</th></tr></thead><tbody>' +
    lista.map((p) => '<tr><td><input class="busca" style="min-width:160px" data-nome="' + p.id + '" value="' + esc(p.nome) + '"></td>' +
      '<td>' + esc(p.email) + '</td><td><select class="busca" style="min-width:150px" data-papel="' + p.id + '">' +
      [['admin', 'Administrador'], ['equipe', 'Equipe'], ['inativo', 'Inativo (sem acesso)']].map(([v, r]) =>
        '<option value="' + v + '"' + (p.papel === v ? ' selected' : '') + '>' + r + '</option>').join('') +
      '</select></td><td class="mono" data-ord="' + p.criado_em + '">' + dataBR(p.criado_em) + '</td></tr>').join('') +
    '</tbody></table></div></div>' +
    '<div class="dica"><b>Administrador</b>: tudo, inclusive excluir, importar e liberar usuários. <b>Equipe</b>: cadastra, edita e dá baixa, mas não exclui clientes nem contratos. <b>Inativo</b>: não entra.</div>';
  corpo.querySelectorAll('[data-papel]').forEach((s) => s.onchange = () => comBotao(s, async () => {
    try {
      await q(sb.from('perfis').update({ papel: s.value }).eq('id', s.dataset.papel));
      aviso('✓ Acesso atualizado.');
    } catch (e) { await pintarAdmin(); throw e; }
  }));
  corpo.querySelectorAll('[data-nome]').forEach((i) => i.onchange = () => comBotao(i, async () => {
    await q(sb.from('perfis').update({ nome: i.value.trim() }).eq('id', i.dataset.nome));
    if (i.dataset.nome === E.perfil.id) { E.perfil.nome = i.value.trim(); $('hd-nome').textContent = E.perfil.nome; }
    aviso('✓ Nome atualizado.');
  }));
}

// ─────────────────────────── IMPORTAR ──────────────────────────────
let _importacoes = [];
async function admImportar(corpo) {
  corpo.innerHTML =
    '<div class="card"><div class="card-hd">📥 Importar as planilhas do sistema atual</div><div class="card-bd">' +
    '<ol class="passos"><li>No Google Sheets, abra a planilha e clique em <b>Arquivo → Fazer download → Microsoft Excel (.xlsx)</b>.</li>' +
    '<li>Faça isso com a <b>1 - Base de Dados</b>, a <b>7 - Financeiro</b> e a <b>12 - Financeiro - Contabilidade</b>.</li>' +
    '<li>Escolha os arquivos abaixo (pode ser os três de uma vez). Nada é gravado antes de você conferir e clicar em <b>Importar</b>.</li></ol>' +
    '<div class="dica" style="margin:10px 0">A coluna <b>Senha</b> da Base de Dados <b>não é importada</b>. As planilhas não são alteradas. ' +
    'Importar de novo a mesma planilha <b>atualiza</b> os registros que vieram dela, sem duplicar.</div>' +
    '<label class="btn btn-p" style="cursor:pointer">Escolher arquivos .xlsx<input type="file" id="imp-arquivos" accept=".xlsx" multiple hidden></label>' +
    '</div></div><div id="imp-previa"></div>';
  $('imp-arquivos').onchange = (ev) => lerArquivosImportacao(Array.from(ev.target.files));
}

async function lerArquivosImportacao(arquivos) {
  const previa = $('imp-previa');
  if (!arquivos.length) return;
  previa.innerHTML = '<div class="carregando">Lendo planilhas…</div>';
  try {
    await carregarScript('vendor/exceljs.min.js');
    _importacoes = [];
    for (const arq of arquivos) {
      const wb = new window.ExcelJS.Workbook();
      await wb.xlsx.load(await arq.arrayBuffer());
      const res = window.IMPORTADOR.importar(window.IMPORTADOR.lerWorkbook(wb));
      res.arquivo = arq.name;
      _importacoes.push(res);
    }
  } catch (e) {
    console.error(e);
    previa.innerHTML = '<div class="card"><div class="card-bd msg-erro">Não consegui ler o arquivo: ' + esc(e.message) +
      '. Confira se é o .xlsx baixado do Google Sheets.</div></div>';
    return;
  }
  const NOME = { base: '👥 Base de Dados → Clientes', financeiro: '💼 Financeiro → Honorários Jurídico', contabilidade: '🧮 Financeiro → Contabilidade',
    processos: '⚖ Processos', parcelamentos: '◷ Parcelamentos Tributários', acordos: '✦ Acordos', tarefas: '☑ Tarefas' };
  const validos = _importacoes.filter((r) => r.tipo);
  const totalReg = soma(validos, (r) => registrosImp(r).length);
  previa.innerHTML = _importacoes.map((r, i) => {
    const regs = registrosImp(r);
    return '<div class="card"><div class="card-hd">' + (r.tipo ? NOME[r.tipo] : '⚠ Não reconhecida') +
      '<span class="sub">' + esc(r.arquivo) + '</span></div><div class="card-bd">' +
      (r.tipo ? '<div class="tabela-wrap"><table><thead><tr><th>Aba</th><th class="num">Linhas lidas</th><th class="num">A importar</th><th class="num">Ignoradas</th>' +
        (r.clientes || r.processos || r.tarefas ? '' : '<th class="num">Soma dos valores</th>') + '</tr></thead><tbody>' +
        Object.entries(r.resumo).map(([aba, x]) => '<tr><td>' + esc(aba) + '</td><td class="num mono">' + x.lidas + '</td><td class="num mono"><b>' + x.importadas +
          '</b></td><td class="num mono">' + x.ignoradas + '</td>' + (r.clientes || r.processos || r.tarefas ? '' : '<td class="num mono">' + brl(x.total) + '</td>') + '</tr>').join('') +
        '</tbody></table></div>' +
        (r.grupos.length ? '<p class="sub" style="margin-top:8px">' + r.grupos.length + ' grupo(s) encontrados.</p>' : '') : '') +
      (r.avisos.length ? '<details style="margin-top:8px"' + (r.tipo ? '' : ' open') + '><summary>' + r.avisos.length + ' aviso(s)</summary><ul class="avisos">' +
        r.avisos.map((a) => '<li>' + esc(a) + '</li>').join('') + '</ul></details>' : '') +
      (regs.length ? '<details style="margin-top:8px"><summary>Ver os primeiros registros</summary>' + amostraImportacao(r) + '</details>' : '') +
      '</div></div>';
  }).join('') +
  (validos.length ? '<div class="card"><div class="card-bd">' +
    '<label class="check"><input type="radio" name="imp-modo" value="atualizar" checked> Incluir novos <b>e atualizar</b> os que já vieram destas planilhas</label>' +
    '<label class="check" style="margin-top:6px"><input type="radio" name="imp-modo" value="novos"> Só incluir novos (não mexe no que já foi importado)</label>' +
    '<div class="dica" style="margin:10px 0">Atualizar sobrescreve, nesses registros, alterações que alguém tenha feito no sistema novo depois da última importação.</div>' +
    '<button class="btn btn-p" id="imp-gravar">Importar ' + totalReg + ' registro(s)</button> <span id="imp-progresso" class="sub"></span>' +
    '</div></div>' : '');
  const b = $('imp-gravar');
  if (b) b.onclick = () => comBotao(b, gravarImportacao);
}

// Cada planilha vira uma tabela do banco.
const TABELA_IMP = { base: 'clientes', financeiro: 'lancamentos', contabilidade: 'lancamentos', processos: 'processos',
  parcelamentos: 'parcelamentos', acordos: 'acordos', tarefas: 'tarefas' };
function registrosImp(r) { return r.clientes || r.lancamentos || r.processos || r.parcelamentos || r.acordos || r.tarefas || []; }

function amostraImportacao(r) {
  const tabelaSimples = (cab, linha) => '<div class="tabela-wrap"><table><thead><tr>' + cab.map((c) => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>' +
    registrosImp(r).slice(0, 8).map((x) => '<tr>' + linha(x).map((v) => '<td>' + esc(v == null ? '' : v) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
  if (r.processos) return tabelaSimples(['Grupo', 'Nº', 'Natureza', 'Autor', 'Réu', 'Status'], (p) => [p._grupo, p.numero, p.natureza, p.autor, p.reu, p.status]);
  if (r.parcelamentos) return tabelaSimples(['Aba', 'Empresa', 'Natureza', 'Local', 'Parcelas', 'Pagas'], (p) => [p._grupo, p.empresa, p.natureza, p.local, p._parcelas.length, p._parcelas.filter((x) => x.pago).length]);
  if (r.acordos) return tabelaSimples(['Grupo', 'Processo', 'Parcela', 'Vencimento', 'Valor', 'Pago'], (a) => [a._grupo, a.processo, a.parcela + '/' + a.total_parcelas, dataBR(a.vencimento), brl(a.valor), a.pago ? 'SIM' : '']);
  if (r.tarefas) return tabelaSimples(['Tarefa', 'Grupo', 'Responsável', 'Prazo', 'Status'], (t) => [t.titulo, t._grupo, t.responsavel, dataBR(t.prazo), t.status]);
  if (r.clientes) {
    return '<div class="tabela-wrap"><table><thead><tr><th>Grupo</th><th>Nome</th><th>CPF/CNPJ</th><th>Tipo</th><th class="num">Passivo</th></tr></thead><tbody>' +
      r.clientes.slice(0, 8).map((c) => '<tr><td>' + esc(c._grupo) + '</td><td>' + esc(c.nome) + '</td><td class="mono">' + esc(mascaraDoc(c.cpf_cnpj)) +
        '</td><td>' + esc(c.tipo) + '</td><td class="num mono">' + brl(passivo(c)) + '</td></tr>').join('') + '</tbody></table></div>';
  }
  return '<div class="tabela-wrap"><table><thead><tr><th>Vencimento</th><th>Grupo / Fornecedor</th><th>Descrição</th><th class="num">Valor</th><th>Situação</th></tr></thead><tbody>' +
    r.lancamentos.slice(0, 8).map((l) => '<tr><td class="mono">' + dataBR(l.vencimento) + '</td><td>' + esc(l._grupo || l.favorecido) + '</td><td>' + esc(l.descricao) +
      '</td><td class="num mono ' + (l.tipo === 'receita' ? 'valor-rec' : 'valor-desp') + '">' + (l.tipo === 'despesa' ? '− ' : '') + brl(l.valor) + '</td><td>' + pillSit(l) + '</td></tr>').join('') +
    '</tbody></table></div>';
}

async function gravarImportacao() {
  const modo = (document.querySelector('input[name=imp-modo]:checked') || {}).value || 'atualizar';
  const prog = $('imp-progresso');
  const validos = _importacoes.filter((r) => r.tipo);
  // 1. grupos que ainda não existem
  prog.textContent = 'Criando grupos…';
  await carregarCadastros();
  const faltam = [...new Set(validos.flatMap((r) => r.grupos))].filter((g) => !E.grupos.some((x) => normalizar(x.nome) === normalizar(g)));
  for (let i = 0; i < faltam.length; i += 200) await q(sb.from('grupos').insert(faltam.slice(i, i + 200).map((nome) => ({ nome }))));
  await carregarCadastros();
  const idGrupo = (n) => { const g = n && E.grupos.find((x) => normalizar(x.nome) === normalizar(n)); return g ? g.id : null; };
  // 2. registros, em lotes
  const resultado = [];
  // parcelamentos: o grupo vem do cliente (mesmo CNPJ ou nome), como no ERP antigo; senão, o nome da aba
  const grupoDoCliente = (x) => {
    const doc = soDigitos(x.cnpj);
    const c = E.clientes.find((k) => (doc && soDigitos(k.cpf_cnpj) === doc) || normalizar(k.nome) === normalizar(x.empresa));
    return c && c.grupo_id;
  };
  const upsert = async (tabela, linhas) => {
    for (let i = 0; i < linhas.length; i += 200) {
      prog.textContent = 'Gravando ' + tabela + ': ' + Math.min(i + 200, linhas.length) + ' de ' + linhas.length + '…';
      await q(sb.from(tabela).upsert(linhas.slice(i, i + 200), { onConflict: 'chave_importacao', ignoreDuplicates: modo === 'novos' }));
    }
  };
  const ROTULO = { clientes: 'cliente(s)', processos: 'processo(s)', parcelamentos: 'parcelamento(s)', acordos: 'parcela(s) de acordo', tarefas: 'tarefa(s)' };
  // clientes primeiro: os parcelamentos usam o grupo deles
  validos.sort((a, b) => (a.tipo === 'base' ? -1 : 0) - (b.tipo === 'base' ? -1 : 0));
  for (const r of validos) {
    const tabela = TABELA_IMP[r.tipo];
    if (r.tipo === 'parcelamentos') await carregarCadastros();
    const filhos = [];
    const linhas = registrosImp(r).map((x) => {
      const y = Object.assign({}, x);
      y.grupo_id = (r.tipo === 'parcelamentos' && grupoDoCliente(x)) || idGrupo(x._grupo);
      delete y._grupo;
      if (y._parcelas) { filhos.push(...y._parcelas.map((p) => Object.assign({ _pai: y.chave_importacao }, p))); delete y._parcelas; }
      return y;
    });
    await upsert(tabela, linhas);
    if (r.tipo === 'parcelamentos' && filhos.length) {
      const ids = {};
      (await buscarTodos(() => sb.from('parcelamentos').select('id,chave_importacao').not('chave_importacao', 'is', null)))
        .forEach((p) => { ids[p.chave_importacao] = p.id; });
      await upsert('parcelas', filhos.filter((p) => ids[p._pai]).map((p) => {
        const y = Object.assign({ parcelamento_id: ids[p._pai] }, p); delete y._pai; return y;
      }));
      resultado.push(filhos.length + ' parcela(s) de parcelamento');
    }
    resultado.push(linhas.length + ' ' + (ROTULO[tabela] || 'lançamento(s) de ' + (r.tipo === 'contabilidade' ? 'Contabilidade' : 'Honorários Jurídico')));
  }
  await carregarCadastros();
  prog.textContent = '';
  aviso('✓ Importação concluída.');
  $('imp-previa').innerHTML = '<div class="card"><div class="card-bd msg-ok">✓ Importado: ' + esc(resultado.join(' · ')) +
    '. Confira os totais no Painel Executivo e em Honorários, e compare com as planilhas.</div></div>';
}

// ─────────────────────────── BACKUP ────────────────────────────────
const TABELAS_BACKUP = ['clientes', 'grupos', 'contratos', 'lancamentos', 'processos', 'parcelamentos', 'parcelas', 'acordos', 'tarefas', 'perfis', 'perfil_grupos', 'historico'];
async function admBackup(corpo) {
  corpo.innerHTML =
    '<div class="card"><div class="card-hd">💾 Backup de todos os dados</div><div class="card-bd">' +
    '<p>Baixa uma cópia completa de tudo que está no sistema: clientes, grupos, lançamentos, processos, parcelamentos, acordos, tarefas, usuários e histórico.</p>' +
    '<div class="acoes" style="margin:14px 0">' +
    '<button class="btn btn-p" id="bk-excel">⬇ Baixar backup em Excel</button>' +
    '<button class="btn btn-o" id="bk-json">⬇ Baixar backup completo (.json, para restaurar)</button>' +
    '</div><span id="bk-prog" class="sub"></span>' +
    '<div class="dica" style="margin-top:12px"><b>Como guardar com segurança</b><br>' +
    '1. Faça o backup toda semana (e antes de qualquer importação grande).<br>' +
    '2. Guarde numa pasta do seu Google Drive que só você acessa — não mande por e-mail nem WhatsApp.<br>' +
    '3. Mantenha a verificação em duas etapas ligada na sua conta Google.<br>' +
    '4. O arquivo tem dados de clientes: trate como documento sigiloso (LGPD).</div></div></div>';
  $('bk-excel').onclick = (ev) => comBotao(ev.currentTarget, () => fazerBackup('xlsx'));
  $('bk-json').onclick = (ev) => comBotao(ev.currentTarget, () => fazerBackup('json'));
}

async function fazerBackup(formato) {
  const prog = $('bk-prog'), dados = {};
  for (const t of TABELAS_BACKUP) {
    prog.textContent = 'Lendo ' + t + '…';
    dados[t] = await buscarTodos(() => sb.from(t).select('*').order(t === 'historico' ? 'id' : t === 'perfil_grupos' ? 'perfil_id' : 'criado_em'));
  }
  const carimbo = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', 'h');
  const nome = 'Backup ERP Araujo e Castro ' + carimbo;
  if (formato === 'json') {
    baixarArquivo(nome + '.json', JSON.stringify({ gerado_em: new Date().toISOString(), versao: 2, dados }, null, 1), 'application/json');
  } else {
    prog.textContent = 'Montando o Excel…';
    await carregarScript('vendor/exceljs.min.js');
    const wb = new window.ExcelJS.Workbook();
    wb.creator = 'ERP Araújo & Castro';
    const leia = wb.addWorksheet('Leia-me');
    leia.addRows([['Backup do ERP Araújo & Castro'], ['Gerado em', new Date().toLocaleString('pt-BR')], ['Por', E.perfil.email], [],
      ...TABELAS_BACKUP.map((t) => [t, dados[t].length + ' registro(s)'])]);
    leia.getColumn(1).width = 26; leia.getColumn(2).width = 30; leia.getRow(1).font = { bold: true, size: 14 };
    TABELAS_BACKUP.forEach((t) => {
      const ws = wb.addWorksheet(t);
      const cols = dados[t].length ? Object.keys(dados[t][0]) : ['(vazio)'];
      ws.addRow(cols).font = { bold: true };
      dados[t].forEach((reg) => ws.addRow(cols.map((c) => {
        const v = reg[c];
        return v != null && typeof v === 'object' ? JSON.stringify(v) : v;
      })));
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      cols.forEach((c, i) => { ws.getColumn(i + 1).width = Math.min(40, Math.max(10, c.length + 2)); });
    });
    const buf = await wb.xlsx.writeBuffer();
    baixarArquivo(nome + '.xlsx', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }
  prog.textContent = '✓ Backup baixado: ' + TABELAS_BACKUP.map((t) => dados[t].length + ' ' + t).join(' · ');
}

// ─────────────────────────── HISTÓRICO ─────────────────────────────
const NOME_TABELA = { clientes: 'Cliente', contratos: 'Contrato', lancamentos: 'Lançamento', processos: 'Processo', parcelamentos: 'Parcelamento',
  parcelas: 'Parcela', acordos: 'Acordo', tarefas: 'Tarefa', perfis: 'Usuário' };
const NOME_ACAO = { INSERT: ['Incluiu', 'pago'], UPDATE: ['Alterou', 'aberto'], DELETE: ['Excluiu', 'vencido'] };
const CAMPOS_IGNORADOS = ['atualizado_em', 'criado_em', 'criado_por', 'id'];
async function admHistorico(corpo) {
  const [perfis, reg] = await Promise.all([
    q(sb.from('perfis').select('id, nome, email')),
    (() => { let c = sb.from('historico').select('*').order('quando', { ascending: false }).limit(300); if (E.adm.tabela) c = c.eq('tabela', E.adm.tabela); return q(c); })()
  ]);
  const quem = {}; perfis.forEach((p) => { quem[p.id] = p.nome || p.email; });
  const rotulo = (d) => d ? (d.nome || d.titulo || (d.numero && d.natureza !== undefined && !d.empresa ? 'Nº ' + d.numero : '') || (d.empresa ? d.empresa + (d.natureza ? ' · ' + d.natureza : '') : '') ||
    (d.processo ? d.processo + (d.parcela ? ' · parc. ' + d.parcela : '') : '') || (d.parcelamento_id ? 'parcela ' + (d.numero || '') + ' · venc. ' + dataBR(d.vencimento) : '') || ((d.descricao || '') + (d.grupo_id ? ' · ' + nomeGrupo(d.grupo_id) : '')) || d.email || '') : '';
  const mudancas = (h) => {
    if (h.acao !== 'UPDATE' || !h.antes || !h.depois) return '';
    return Object.keys(h.depois).filter((k) => !CAMPOS_IGNORADOS.includes(k) && JSON.stringify(h.antes[k]) !== JSON.stringify(h.depois[k]))
      .map((k) => '<div><span class="sub">' + esc(k.replace(/_id$/, '').replace(/_/g, ' ')) + ':</span> ' + esc(fmtHist(h.antes[k], k)) + ' → <b>' + esc(fmtHist(h.depois[k], k)) + '</b></div>').join('');
  };
  corpo.innerHTML =
    '<div class="filtros"><select class="busca sel" id="hist-tabela"><option value="">Tudo</option>' +
    Object.entries(NOME_TABELA).map(([k, v]) => '<option value="' + k + '"' + (E.adm.tabela === k ? ' selected' : '') + '>' + v + 's</option>').join('') +
    '</select><span class="sub">Últimas 300 alterações gravadas no servidor, da mais recente para a mais antiga.</span></div>' +
    '<div class="card">' + (reg.length ? '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th data-tipo="data">Quando</th><th>Quem</th><th>O quê</th><th>Registro</th><th>O que mudou</th></tr></thead><tbody>' +
      reg.map((h) => '<tr><td class="mono" data-ord="' + h.quando + '">' + dataHoraBR(h.quando) + '</td><td>' + esc(quem[h.usuario] || (h.usuario ? '?' : 'sistema')) + '</td>' +
        '<td><span class="pill ' + NOME_ACAO[h.acao][1] + '">' + NOME_ACAO[h.acao][0] + '</span> <span class="sub">' + esc(NOME_TABELA[h.tabela] || h.tabela) + '</span></td>' +
        '<td>' + esc(rotulo(h.depois || h.antes)) + '</td><td class="hist-mud">' + mudancas(h) + '</td></tr>').join('') +
      '</tbody></table></div>' : '<div class="vazio">Nenhuma alteração registrada ainda.</div>') + '</div>';
  $('hist-tabela').onchange = (ev) => { E.adm.tabela = ev.target.value; pintarAdmin(); };
}
function fmtHist(v, campo) {
  if (v == null || v === '') return '(vazio)';
  // ids viram nomes legíveis
  if (campo === 'grupo_id') return nomeGrupo(v) || 'grupo excluído';
  if (campo === 'cliente_id') { const c = E.clientes.find((x) => x.id === v); return c ? c.nome : 'cliente excluído'; }
  if (campo === 'contrato_id') return 'contrato';
  if (v === true) return 'sim'; if (v === false) return 'não';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return dataBR(v);
  if (typeof v === 'number') return v.toLocaleString('pt-BR');
  return String(v).length > 60 ? String(v).slice(0, 57) + '…' : String(v);
}
