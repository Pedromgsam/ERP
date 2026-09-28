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
  { id: 'historico', rot: '🕘 Histórico' },
  { id: 'acessos', rot: '🔐 Acessos' },
  { id: 'automacoes', rot: '⚡ Automações' },
  { id: 'clientes_email', rot: '📨 E-mails aos clientes' },
  { id: 'email', rot: '✉ Envio de e-mail' }
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
  try { await ({ usuarios: admUsuarios, importar: admImportar, backup: admBackup, historico: admHistorico, acessos: admAcessos, clientes_email: admClientesEmail, automacoes: () => { E.adm.aba = 'usuarios'; irParaTela('automacoes'); }, email: admEmail })[E.adm.aba](corpo); }
  catch (e) { console.error(e); corpo.innerHTML = '<div class="card"><div class="card-bd msg-erro">' + esc(erroAmigavel(e)) + '</div></div>'; }
}

// ─────────────────────────── USUÁRIOS ──────────────────────────────
const PAPEIS = [['admin', 'Administrador'], ['equipe', 'Equipe'], ['cliente', 'Cliente (Portal)'], ['inativo', 'Inativo (sem acesso)']];
async function admUsuarios(corpo) {
  const [lista, vinculos, previstos] = await Promise.all([
    q(sb.from('perfis').select('*').order('criado_em')),
    q(sb.from('perfil_grupos').select('*')).catch(() => []),
    q(sb.from('usuarios_previstos').select('*').order('criado_em')).catch(() => [])
  ]);
  const gruposDe = (id) => vinculos.filter((v) => v.perfil_id === id).map((v) => nomeGrupo(v.grupo_id)).filter(Boolean);
  corpo.innerHTML =
    '<div class="titulo-pag" style="margin-bottom:10px"><div></div><div class="acoes"><button class="btn btn-p" id="us-novo">+ Novo usuário</button></div></div>' +
    // acessos já combinados (SQL do Backup 14): falta só criar a conta — a pessoa já nasce com a função certa
    (previstos.length ? '<div class="card"><div class="card-hd">👥 Acessos combinados — falta criar a conta <span class="sub">' + previstos.length + '</span></div><div class="card-bd"><div class="lista-ficha">' +
      previstos.map((v) => '<div class="item-ficha"><div><b>' + esc(v.nome) + '</b> <span class="pill neutro">' + esc(v.modelo || (v.papel === 'admin' ? 'Administrador' : 'Equipe')) + '</span>' +
        ' <span class="pill area-' + esc(v.areas) + '">' + esc(rotArea(v.areas)) + '</span><div class="sub">' + esc(v.email) + '</div></div>' +
        '<span><button class="btn btn-p btn-mini" data-prev="' + esc(v.email) + '">Criar conta</button> <button class="btn btn-o btn-mini" data-prev-x="' + esc(v.email) + '" title="Não criar">✕</button></span></div>').join('') +
      '</div><div class="sub" style="margin-top:8px">Clique em <b>Criar conta</b>, escolha uma senha provisória e passe para a pessoa (ou use depois o 🔑 Link de senha).</div></div></div>' : '') +
    '<div class="card"><div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Nome</th><th>E-mail</th><th>Acesso</th><th>Funções / Grupos no Portal</th><th data-tipo="data">Desde</th><th class="sem-ordem"></th></tr></thead><tbody>' +
    lista.map((p) => '<tr><td><input class="busca" style="min-width:160px" data-nome="' + p.id + '" value="' + esc(p.nome) + '"></td>' +
      '<td>' + esc(p.email) + '</td><td><select class="busca" style="min-width:150px" data-papel="' + p.id + '">' +
      PAPEIS.map(([v, r]) => '<option value="' + v + '"' + (p.papel === v ? ' selected' : '') + '>' + r + '</option>').join('') +
      '</select></td><td>' + (p.papel === 'equipe'
        ? '<span class="sub">' + esc(resumoFuncoes(p)) + '</span> <button class="btn btn-o btn-mini" data-funcoes="' + p.id + '">Funções</button>'
        : p.papel === 'cliente'
        ? (gruposDe(p.id).map((g) => '<span class="pill neutro">' + esc(g) + '</span>').join(' ') || '<span class="pill vencido">nenhum</span>') +
          ' <button class="btn btn-o btn-mini" data-grupos="' + p.id + '">Escolher</button>'
        : '<span class="sub">—</span>') + '</td>' +
      '<td class="mono" data-ord="' + p.criado_em + '">' + dataBR(p.criado_em) + '</td>' +
      '<td class="acoes-l"><button class="btn btn-o btn-mini" data-senha="' + esc(p.email) + '" title="Envia por e-mail um link para a pessoa criar uma senha nova">🔑 Link de senha</button></td></tr>').join('') +
    '</tbody></table></div></div>' +
    '<div class="dica"><b>Administrador</b>: tudo, inclusive excluir, importar e liberar usuários. <b>Equipe</b>: só as <b>funções</b> marcadas (Financeiro, Contratos, Jurídico…), em Ver ou Editar; não exclui. ' +
    '<b>Cliente</b>: só consulta, no Portal, os grupos escolhidos. <b>Inativo</b>: não entra.</div>';
  corpo.querySelectorAll('[data-papel]').forEach((s) => s.onchange = () => comBotao(s, async () => {
    try {
      await q(sb.from('perfis').update({ papel: s.value }).eq('id', s.dataset.papel));
      aviso('✓ Acesso atualizado.');
      await pintarAdmin();
    } catch (e) { await pintarAdmin(); throw e; }
  }));
  corpo.querySelectorAll('[data-nome]').forEach((i) => i.onchange = () => comBotao(i, async () => {
    await q(sb.from('perfis').update({ nome: i.value.trim() }).eq('id', i.dataset.nome));
    if (E.perfil && i.dataset.nome === E.perfil.id) { E.perfil.nome = i.value.trim(); if ($('hd-nome')) $('hd-nome').textContent = E.perfil.nome;
      if (window.ERP_EU) { window.ERP_EU.nome = E.perfil.nome; document.dispatchEvent(new CustomEvent('erp:perfil')); } }
    aviso('✓ Nome atualizado.');
  }));
  corpo.querySelectorAll('[data-senha]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    if (!confirm('Enviar para ' + b.dataset.senha + ' um e-mail com link para criar uma senha nova?')) return;
    const { error } = await sb.auth.resetPasswordForEmail(b.dataset.senha, { redirectTo: location.origin + '/' });
    if (error) throw error;
    aviso('✓ Link enviado para ' + b.dataset.senha + '.');
  }));
  corpo.querySelectorAll('[data-grupos]').forEach((b) => b.onclick = () =>
    formGruposPortal(lista.find((p) => p.id === b.dataset.grupos), vinculos.filter((v) => v.perfil_id === b.dataset.grupos).map((v) => v.grupo_id)));
  corpo.querySelectorAll('[data-funcoes]').forEach((b) => b.onclick = () => formFuncoes(lista.find((p) => p.id === b.dataset.funcoes)));
  $('us-novo').onclick = () => formNovoUsuario();
  corpo.querySelectorAll('[data-prev]').forEach((b) => b.onclick = () => formNovoUsuario(previstos.find((v) => v.email === b.dataset.prev)));
  corpo.querySelectorAll('[data-prev-x]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    if (!confirm('Tirar ' + b.dataset.prevX + ' da lista de acessos combinados?')) return;
    await q(sb.from('usuarios_previstos').delete().eq('email', b.dataset.prevX)); await pintarAdmin();
  }));
}
function formFuncoes(p) {
  const j = abrirJanela({ titulo: 'Funções de ' + (p.nome || p.email), larga: true,
    corpo: '<p class="sub" style="margin-bottom:10px">Marque o que esta pessoa pode <b>ver</b> ou <b>editar</b>. Use um modelo pronto e ajuste. As próprias tarefas ela sempre vê. <b>Rascunho</b>: a pessoa preenche, mas só vale depois que alguém que edita aprovar.</p>' + gradeAreas(p.areas) + gradeFuncoes(p.funcoes),
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-salvar-func">Salvar</button></div>' });
  ligarGradeFuncoes(j);
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-salvar-func').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    await q(sb.from('perfis').update({ funcoes: lerGradeFuncoes(j), areas: lerAreas(j) }).eq('id', p.id));
    aviso('✓ Funções de ' + (p.nome || p.email).split(' ')[0] + ' atualizadas.'); fecharJanela(j); await pintarAdmin();
  });
}

function listaGruposMarcar(marcados) {
  return '<input class="busca" data-filtra-grupos placeholder="Filtrar grupos…" style="max-width:none;width:100%;margin-bottom:8px">' +
    '<div class="lista-grupos" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:4px 12px;max-height:280px;overflow-y:auto;border:1.5px solid var(--border-strong);border-radius:var(--r-sm);padding:10px">' +
    E.grupos.map((g) => '<label class="check" style="font-weight:500"><input type="checkbox" value="' + g.id + '"' + (marcados.includes(g.id) ? ' checked' : '') + '> ' + esc(g.nome) + '</label>').join('') + '</div>';
}
function ligarFiltroGrupos(j) {
  const f = j.querySelector('[data-filtra-grupos]');
  if (f) f.oninput = () => { const b = normalizar(f.value); j.querySelectorAll('.lista-grupos label').forEach((l) => { l.style.display = normalizar(l.textContent).includes(b) ? '' : 'none'; }); };
}
async function salvarGruposPortal(perfilId, ids) {
  await q(sb.from('perfil_grupos').delete().eq('perfil_id', perfilId));
  if (ids.length) await q(sb.from('perfil_grupos').insert(ids.map((g) => ({ perfil_id: perfilId, grupo_id: g }))));
}
function formGruposPortal(p, marcados) {
  const j = abrirJanela({ titulo: 'Grupos que ' + (p.nome || p.email) + ' vê no Portal',
    corpo: listaGruposMarcar(marcados),
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-salvar-gp">Salvar</button></div>' });
  ligarFiltroGrupos(j);
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-salvar-gp').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    await salvarGruposPortal(p.id, [...j.querySelectorAll('.lista-grupos input:checked')].map((i) => i.value));
    aviso('✓ Grupos do Portal atualizados.'); fecharJanela(j); await pintarAdmin();
  });
}
function formNovoUsuario(pre) {
  pre = pre || null;
  const j = abrirJanela({ titulo: pre ? 'Criar conta — ' + pre.nome : 'Novo usuário', larga: true,
    corpo: '<form id="f-us" class="grade">' +
      campo('Nome <span class="obrig">*</span>', '<input name="nome" autocomplete="off" value="' + esc(pre ? pre.nome : '') + '">') +
      campo('E-mail <span class="obrig">*</span>', '<input name="email" type="email" autocomplete="off" value="' + esc(pre ? pre.email : '') + '">') +
      campo('Senha provisória <span class="obrig">*</span>', '<input name="senha" autocomplete="new-password" placeholder="mínimo 8 caracteres">') +
      campo('Acesso', '<select name="papel">' + PAPEIS.filter((x) => x[0] !== 'inativo').map(([v, r]) => '<option value="' + v + '"' + (v === (pre ? pre.papel : 'equipe') ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>') +
      '<div class="inteiro' + (pre && pre.papel !== 'equipe' ? ' escondido' : '') + '" id="us-funcoes"><div class="secao" style="margin-bottom:6px">Funções (o que a pessoa pode usar)</div>' +
        gradeAreas(pre ? pre.areas : 'ambos') + gradeFuncoes(pre && pre.papel === 'equipe' ? pre.funcoes : MODELOS_ACESSO['Sócio (tudo)']) + '</div>' +
      '<div class="inteiro escondido" id="us-grupos"><div class="sub" style="margin-bottom:6px">Grupos que o cliente vê no Portal</div>' + listaGruposMarcar([]) + '</div>' +
      '<div class="dica inteiro">Passe o e-mail e a senha provisória para a pessoa. Se o Supabase estiver com <b>confirmação de e-mail</b> ligada, ela recebe um e-mail e precisa clicar no link antes do primeiro acesso.</div>' +
      '</form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-criar-us">Criar usuário</button></div>' });
  const f = j.querySelector('#f-us');
  ligarFiltroGrupos(j);
  ligarGradeFuncoes(j);
  f.papel.onchange = () => { j.querySelector('#us-grupos').classList.toggle('escondido', f.papel.value !== 'cliente'); j.querySelector('#us-funcoes').classList.toggle('escondido', f.papel.value !== 'equipe'); };
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  f.onsubmit = (ev) => { ev.preventDefault(); j.querySelector('#btn-criar-us').click(); };
  j.querySelector('#btn-criar-us').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const nome = f.nome.value.trim(), email = f.email.value.trim().toLowerCase(), senha = f.senha.value, papel = f.papel.value;
    const ids = [...j.querySelectorAll('.lista-grupos input:checked')].map((i) => i.value);
    if (!nome || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Preencha o nome e um e-mail válido.');
    if (senha.length < 8) throw new Error('A senha provisória precisa ter pelo menos 8 caracteres.');
    if (papel === 'cliente' && !ids.length) throw new Error('Escolha pelo menos um grupo para o cliente.');
    // cliente temporário do Supabase: cria a conta sem trocar a sessão de quem está logado
    const tmp = window.supabase.createClient(CFG.url, CFG.chave, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'erp-novo-usuario' } });
    const { data, error } = await tmp.auth.signUp({ email, password: senha, options: { data: { nome }, emailRedirectTo: location.origin + '/' } });
    if (error) {
      if (/not allowed|disabled|signups/i.test(error.message)) throw new Error('O cadastro de usuários está desligado no Supabase: ligue em Authentication → Sign In / Providers → "Allow new users to sign up".');
      if (/registered|exists/i.test(error.message)) throw new Error('Já existe um usuário com esse e-mail.');
      if (/password/i.test(error.message)) throw new Error('Senha fraca: use pelo menos 8 caracteres, com letras e números.');
      throw error;
    }
    if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length) throw new Error('Já existe um usuário com esse e-mail.');
    let perfil = null;
    for (let i = 0; i < 6 && !perfil; i++) {
      perfil = (await q(sb.from('perfis').select('*').eq('email', email)))[0];
      if (!perfil) await new Promise((ok) => setTimeout(ok, 500));
    }
    if (!perfil) throw new Error('Usuário criado, mas o perfil ainda não apareceu. Abra Usuários de novo em alguns segundos e ajuste o acesso.');
    await q(sb.from('perfis').update({ papel, nome, funcoes: papel === 'equipe' ? lerGradeFuncoes(j) : {}, areas: papel === 'equipe' ? lerAreas(j) : 'ambos' }).eq('id', perfil.id));
    if (papel === 'cliente') await salvarGruposPortal(perfil.id, ids);
    aviso('✓ Usuário criado. Passe o e-mail e a senha provisória para ' + nome.split(' ')[0] + '.');
    fecharJanela(j); await pintarAdmin();
  });
}

// ─────────────────────────── IMPORTAR ──────────────────────────────
let _importacoes = [];
async function admImportar(corpo) {
  corpo.innerHTML =
    '<div class="card"><div class="card-hd">📥 Importar as planilhas do sistema atual</div><div class="card-bd">' +
    '<ol class="passos"><li>No Google Sheets, abra a planilha e clique em <b>Arquivo → Fazer download → Microsoft Excel (.xlsx)</b>.</li>' +
    '<li>Pode enviar: <b>1 - Base de Dados</b>, <b>2 - Processos</b>, <b>3 - Parcelamentos Tributários</b>, <b>4 - Acordos</b>, <b>7 - Financeiro</b>, <b>12 - Financeiro - Contabilidade</b> e <b>15 - Tarefas</b>.</li>' +
    '<li>Escolha os arquivos abaixo (pode escolher vários de uma vez). Nada é gravado antes de você conferir e clicar em <b>Importar</b>.</li></ol>' +
    '<div class="dica" style="margin:10px 0">A coluna <b>Senha</b> da Base de Dados <b>não é importada</b>. As planilhas não são alteradas. ' +
    'Importar de novo a mesma planilha <b>atualiza</b> os registros que vieram dela, sem duplicar.</div>' +
    '<div class="dica" style="margin:0 0 10px">Dados errados (ex.: acordos que apareceram na Contabilidade)? Faça um <b>Backup</b>, envie de novo <b>12 - Financeiro - Contabilidade</b> e <b>4 - Acordos</b> ' +
    'e escolha <b>Substituir</b> antes de importar.</div>' +
    '<label class="btn btn-p" style="cursor:pointer">Escolher arquivos .xlsx<input type="file" id="imp-arquivos" accept=".xlsx" multiple hidden></label>' +
    '</div></div><div id="imp-previa"></div>' +
    // demonstração: dados fictícios ligados entre si (clientes, contratos, CRM, documentos, tarefas, acordos…)
    '<div class="card"><div class="card-hd">🧪 Dados de demonstração<span class="sub" style="margin-left:auto;font-weight:400">para testar antes de importar as planilhas de verdade</span></div><div class="card-bd">' +
    '<p style="margin-bottom:10px">Cria 3 grupos e 6 clientes <b>fictícios</b> (nomes começam com <b>DEMO ·</b>), com contatos, contratos (mensal, salário mínimo, pontual e êxito), honorários pagos e em atraso, ' +
    'processos, parcelamento com parcelas, acordo, tarefas, oportunidades no CRM, documentos, certidões e um <b>rascunho de estagiário</b> esperando aprovação. E-mails dos exemplos usam o domínio <b>example.com</b> (não chegam a ninguém).</p>' +
    '<div class="acoes"><button class="btn btn-p" id="demo-carregar">Carregar demonstração</button><button class="btn btn-x" id="demo-apagar">Apagar demonstração</button></div>' +
    '<p class="sub" style="margin-top:8px">Carregar de novo apaga a demonstração anterior e cria outra (datas sempre a partir de hoje). Nada que você cadastrou é tocado.</p></div></div>';
  $('imp-arquivos').onchange = (ev) => lerArquivosImportacao(Array.from(ev.target.files));
  $('demo-carregar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const n = await q(sb.rpc('carregar_demonstracao'));
    await carregarCadastros(true); aviso('✓ Demonstração carregada: ' + n + ' clientes fictícios (DEMO ·). Abra Início, Clientes, Contratos, CRM e Aprovações.');
    if (window.ERP_RECARREGAR) window.ERP_RECARREGAR();
  });
  $('demo-apagar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!confirm('Apagar todos os dados de demonstração (DEMO ·)? O que você cadastrou não é tocado.')) return;
    const n = await q(sb.rpc('limpar_demonstracao'));
    await carregarCadastros(true); aviso('Demonstração apagada (' + n + ' clientes fictícios).');
    if (window.ERP_RECARREGAR) window.ERP_RECARREGAR();
  });
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
      const res = window.IMPORTADOR.importar(window.IMPORTADOR.lerWorkbook(wb), arq.name);
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
    '<label class="check" style="margin-top:6px"><input type="radio" name="imp-modo" value="substituir"> <b>Substituir</b>: apagar tudo o que veio antes <b>deste tipo de planilha</b> e gravar de novo (corrige importações erradas)</label>' +
    '<div class="dica" style="margin:10px 0">Atualizar sobrescreve, nesses registros, alterações que alguém tenha feito no sistema novo depois da última importação. ' +
    '<b>Substituir</b> apaga só o que veio de planilha (lançamentos criados à mão e parcelas de contratos ficam); faça um <b>Backup</b> antes.</div>' +
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
      '</td><td class="num mono ' + (l.tipo === 'receita' ? 'valor-rec' : 'valor-desp') + '">' + (l.tipo === 'despesa' ? '−\u00A0' : '') + brl(l.valor) + '</td><td>' + pillSit(l) + '</td></tr>').join('') +
    '</tbody></table></div>';
}

async function gravarImportacao() {
  const modo = (document.querySelector('input[name=imp-modo]:checked') || {}).value || 'atualizar';
  const prog = $('imp-progresso');
  const validos = _importacoes.filter((r) => r.tipo);
  if (modo === 'substituir') {
    const tipos = [...new Set(validos.map((r) => r.tipo))];
    if (!confirm('Substituir: vou apagar o que foi importado antes de ' + tipos.map((t) => ({ base: 'Base de Dados', financeiro: 'Honorários Jurídico', contabilidade: 'Contabilidade',
      processos: 'Processos', parcelamentos: 'Parcelamentos', acordos: 'Acordos', tarefas: 'Tarefas' }[t])).join(', ') + ' e gravar de novo a partir destas planilhas. Continuar?')) return;
    for (const t of tipos.filter((x) => x !== 'base')) {   // clientes não são apagados: a Base de Dados sempre atualiza
      prog.textContent = 'Apagando o que foi importado antes…';
      const n = await q(sb.rpc('limpar_importados', { p_tipo: t }));
      console.info('[importação] apagados de ' + t + ':', n);
    }
  }
  // 1. grupos que ainda não existem
  prog.textContent = 'Criando grupos…';
  await carregarCadastros(true);
  const faltam = [...new Set(validos.flatMap((r) => r.grupos))].filter((g) => !E.grupos.some((x) => normalizar(x.nome) === normalizar(g)));
  for (let i = 0; i < faltam.length; i += 200) await q(sb.from('grupos').insert(faltam.slice(i, i + 200).map((nome) => ({ nome }))));
  await carregarCadastros(true);
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
    if (r.tipo === 'parcelamentos') await carregarCadastros(true);
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
  await carregarCadastros(true);
  prog.textContent = '';
  aviso('✓ Importação concluída.');
  $('imp-previa').innerHTML = '<div class="card"><div class="card-bd msg-ok">✓ Importado: ' + esc(resultado.join(' · ')) +
    '. Confira os totais no Painel Executivo e em Honorários, e compare com as planilhas.</div></div>';
}

// ─────────────────────────── BACKUP ────────────────────────────────
const TABELAS_BACKUP = ['clientes', 'grupos', 'contratos', 'lancamentos', 'processos', 'parcelamentos', 'parcelas', 'acordos', 'tarefas', 'perfis', 'perfil_grupos', 'configuracoes', 'historico'];
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
    '4. O arquivo tem dados de clientes: trate como documento sigiloso (LGPD).</div></div></div>' +
    '<div class="card"><div class="card-hd">🗓 Backups automáticos (todo domingo, 3h) <span class="sub" style="margin-left:auto">ficam as 8 últimas cópias, no armazenamento privado do sistema</span></div><div class="card-bd" id="bk-auto"><div class="carregando">Carregando…</div></div></div>';
  $('bk-excel').onclick = (ev) => comBotao(ev.currentTarget, () => fazerBackup('xlsx'));
  $('bk-json').onclick = (ev) => comBotao(ev.currentTarget, () => fazerBackup('json'));
  await pintarBackupsAuto();
}

async function pintarBackupsAuto() {
  const alvo = $('bk-auto'); if (!alvo) return;
  const lista = await q(sb.from('backups_auto').select('*').order('criado_em', { ascending: false })).catch(() => null);
  if (lista === null) { alvo.innerHTML = '<div class="dica">Rode o <b>estrutura.sql</b> novo e publique a função <b>erp-backup</b> para ligar o backup semanal.</div>'; return; }
  alvo.innerHTML = '<div class="acoes" style="margin-bottom:10px"><button class="btn btn-o" id="bk-agora">↻ Fazer backup agora</button></div>' +
    (lista.length ? '<div class="tabela-wrap"><table><thead><tr><th>Quando</th><th>Origem</th><th class="num">Tamanho</th><th>Registros</th><th></th></tr></thead><tbody>' +
      lista.map((b) => '<tr><td class="mono">' + quandoRodou(b.criado_em) + '</td><td>' + (b.origem === 'rotina' ? 'semanal' : 'manual') + '</td>' +
        '<td class="num mono">' + (b.tamanho > 1048576 ? (b.tamanho / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b.tamanho / 1024)) + ' KB') + '</td>' +
        '<td class="sub">' + Object.values(b.resumo || {}).reduce((a, n) => a + n, 0) + ' em ' + Object.keys(b.resumo || {}).length + ' tabelas</td>' +
        '<td class="acoes-l"><button class="btn btn-o btn-mini" data-bk="' + esc(b.caminho) + '">⬇ Baixar</button></td></tr>').join('') + '</tbody></table></div>'
      : vazio('Nenhum backup automático ainda. O primeiro sai no próximo domingo, ou clique em "Fazer backup agora".'));
  $('bk-agora').onclick = (ev) => comBotao(ev.currentTarget, async () => { const r = await chamarFuncao('erp-backup', { acao: 'rodar' }); aviso('✓ ' + (r.mensagem || 'Backup feito.')); await pintarBackupsAuto(); });
  alvo.querySelectorAll('[data-bk]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const { data, error } = await sb.storage.from('backups').createSignedUrl(b.dataset.bk, 60, { download: true });
    if (error) throw error;
    const a = document.createElement('a'); a.href = /^https?:/.test(data.signedUrl) ? data.signedUrl : String(CFG.url || location.origin).replace(/\/$/, '') + '/storage/v1' + data.signedUrl; a.download = b.dataset.bk; a.rel = 'noopener'; a.click();
  }));
}

// ─────────────────────────── ACESSOS ───────────────────────────────
async function admAcessos(corpo) {
  const [lista, pessoas] = await Promise.all([
    q(sb.from('acessos').select('*').order('quando', { ascending: false }).limit(300)).catch(() => null),
    q(sb.from('perfis').select('id, nome, email'))
  ]);
  if (lista === null) { corpo.innerHTML = '<div class="card"><div class="card-bd dica">Rode o <b>estrutura.sql</b> novo para ligar o registro de acessos.</div></div>'; return; }
  const nome = (id) => { const p = pessoas.find((x) => x.id === id); return p ? (p.nome || p.email) : '—'; };
  corpo.innerHTML = '<div class="card"><div class="card-hd">🔐 Últimos acessos <span class="sub" style="margin-left:auto">guardados por 180 dias · aparelho novo avisa a própria pessoa por e-mail</span></div>' +
    (lista.length ? '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th data-tipo="data">Quando</th><th>Pessoa</th><th>Aparelho / navegador</th><th></th></tr></thead><tbody>' +
      lista.map((a) => '<tr><td class="mono" data-ord="' + a.quando + '">' + quandoRodou(a.quando) + '</td><td>' + esc(nome(a.usuario_id)) + '</td><td class="sub">' + esc(a.navegador || '—') + '</td>' +
        '<td>' + (a.novo ? '<span class="pill hoje">aparelho novo</span>' : '') + '</td></tr>').join('') + '</tbody></table></div>' : vazio('Nenhum acesso registrado ainda.')) + '</div>';
}

async function fazerBackup(formato) {
  const prog = $('bk-prog'), dados = {};
  // todas as tabelas do sistema (mesma lista do backup automático); banco antigo: a lista fixa
  const tabelas = await q(sb.rpc('listar_tabelas_backup')).catch(() => null) || TABELAS_BACKUP;
  TABELAS_BACKUP.length = 0; tabelas.forEach((t) => TABELAS_BACKUP.push(t));
  const ORD = { historico: 'id', perfil_grupos: 'perfil_id', configuracoes: 'chave', cliente_etiquetas: 'cliente_id', salarios_minimos: 'ano' };
  for (const t of TABELAS_BACKUP) {
    prog.textContent = 'Lendo ' + t + '…';
    dados[t] = await buscarTodos(() => sb.from(t).select('*').order(ORD[t] || 'id'))
      .catch(() => buscarTodos(() => sb.from(t).select('*')));
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
// Toda gravação fica aqui: quem, quando, em qual tela, em qual registro e o que mudou
// (campo a campo). Inclusões e exclusões mostram os dados principais do registro.
const NOME_TABELA = { clientes: 'Cliente', contratos: 'Contrato', lancamentos: 'Lançamento', processos: 'Processo', parcelamentos: 'Parcelamento',
  parcelas: 'Parcela', acordos: 'Acordo', tarefas: 'Tarefa', perfis: 'Usuário' };
const NOME_ACAO = { INSERT: ['Incluiu', 'pago'], UPDATE: ['Alterou', 'aberto'], DELETE: ['Excluiu', 'vencido'] };
const CAMPOS_IGNORADOS = ['atualizado_em', 'criado_em', 'criado_por', 'id', 'chave_importacao'];
const ROTULO_CAMPO = {
  grupo_id: 'Grupo', cliente_id: 'Cliente', contrato_id: 'Contrato', parcelamento_id: 'Parcelamento', descricao: 'Descrição', categoria: 'Categoria',
  valor: 'Valor', vencimento: 'Vencimento', pago: 'Pago', data_pagamento: 'Data do pagamento', forma_pagamento: 'Forma de pagamento',
  responsavel: 'Responsável', referencia: 'Referência', cobranca: 'Cobrança', perda: 'Prejuízo', redutor: 'Redutor de receita', empresa: 'Empresa',
  favorecido: 'Fornecedor', conta: 'Banco/conta', chave_pix: 'Chave PIX', obs: 'Observação', nome: 'Nome', cpf_cnpj: 'CPF/CNPJ', papel: 'Acesso',
  numero: 'Número', status: 'Status', titulo: 'Tarefa', prazo: 'Prazo', prioridade: 'Prioridade', processo: 'Processo', parcela: 'Parcela',
  total_parcelas: 'Total de parcelas', valor_total: 'Valor total', num_parcelas: 'Nº de parcelas', primeiro_vencimento: '1º vencimento',
  socio_admin: 'Sócio-administrador', pgfn: 'PGFN', rfb: 'RFB', age_mg: 'AGE/MG', sefaz_mg: 'SEFAZ/MG', capag: 'CAPAG', tipo: 'Tipo'
};
// campos que resumem um registro quando ele é incluído ou excluído
const RESUMO = {
  lancamentos: ['empresa', 'tipo', 'redutor', 'grupo_id', 'descricao', 'valor', 'vencimento', 'pago', 'responsavel'],
  clientes: ['grupo_id', 'nome', 'cpf_cnpj', 'tipo', 'responsavel'], contratos: ['cliente_id', 'descricao', 'valor_total', 'num_parcelas', 'primeiro_vencimento'],
  processos: ['grupo_id', 'numero', 'natureza', 'status'], parcelamentos: ['grupo_id', 'empresa', 'natureza', 'numero'], parcelas: ['numero', 'vencimento', 'pago'],
  acordos: ['grupo_id', 'processo', 'parcela', 'valor', 'vencimento', 'pago'], tarefas: ['titulo', 'grupo_id', 'responsavel', 'prazo', 'status'], perfis: ['nome', 'email', 'papel']
};
const rotCampo = (k) => ROTULO_CAMPO[k] || k.replace(/_id$/, '').replace(/_/g, ' ');
async function admHistorico(corpo) {
  const F = E.adm.hist = E.adm.hist || { tabela: E.adm.tabela || '', acao: '', quem: '', de: '', ate: '', busca: '' };
  const perfis = await q(sb.from('perfis').select('id, nome, email'));
  let c = sb.from('historico').select('*').order('quando', { ascending: false }).limit(500);
  if (F.tabela) c = c.eq('tabela', F.tabela);
  if (F.acao) c = c.eq('acao', F.acao);
  if (F.quem === 'sistema') c = c.is('usuario', null); else if (F.quem) c = c.eq('usuario', F.quem);
  if (F.de) c = c.gte('quando', F.de + 'T00:00:00');
  if (F.ate) c = c.lte('quando', F.ate + 'T23:59:59');
  const reg = await q(c);
  const quem = {}; perfis.forEach((p) => { quem[p.id] = p.nome || p.email; });
  const autor = (h) => quem[h.usuario] || (h.usuario ? 'usuário removido' : 'sistema / importação');
  const rotulo = (d, t) => {
    if (!d) return '';
    const g = d.grupo_id ? ' · ' + nomeGrupo(d.grupo_id) : '';
    if (t === 'parcelamentos') return d.empresa + (d.natureza ? ' · ' + d.natureza : '');
    if (t === 'parcelas') return 'parcela ' + (d.numero || '') + ' · venc. ' + dataBR(d.vencimento);
    if (t === 'processos') return 'Nº ' + d.numero + g;
    if (t === 'acordos') return d.processo + (d.parcela ? ' · parc. ' + d.parcela : '') + g;
    if (t === 'tarefas') return d.titulo + g;
    return d.nome || ((d.descricao || '') + g) || d.email || '';
  };
  const detalhe = (h) => {
    if (h.acao === 'UPDATE' && h.antes && h.depois) {
      const campos = Object.keys(h.depois).filter((k) => !CAMPOS_IGNORADOS.includes(k) && JSON.stringify(h.antes[k]) !== JSON.stringify(h.depois[k]));
      return campos.map((k) => '<div><span class="sub">' + esc(rotCampo(k)) + ':</span> ' + esc(fmtHist(h.antes[k], k)) + ' → <b>' + esc(fmtHist(h.depois[k], k)) + '</b></div>').join('')
        || '<span class="sub">sem mudança de conteúdo</span>';
    }
    const d = h.depois || h.antes || {};
    const campos = (RESUMO[h.tabela] || Object.keys(d)).filter((k) => d[k] != null && d[k] !== '' && !CAMPOS_IGNORADOS.includes(k));
    return (h.acao === 'DELETE' ? '<div class="sub" style="color:var(--red);font-weight:700">registro apagado — dados que ele tinha:</div>' : '') +
      campos.map((k) => '<div><span class="sub">' + esc(rotCampo(k)) + ':</span> ' + esc(fmtHist(d[k], k)) + '</div>').join('');
  };
  const b = normalizar(F.busca);
  const lista = !b ? reg : reg.filter((h) => normalizar(autor(h) + ' ' + rotulo(h.depois || h.antes, h.tabela) + ' ' + JSON.stringify(h.depois || h.antes || {})).includes(b));
  const conta = (a) => lista.filter((h) => h.acao === a).length;
  corpo.innerHTML =
    '<div class="filtros">' +
    '<select class="busca sel" id="hist-tabela"><option value="">Todas as telas</option>' + Object.entries(NOME_TABELA).map(([k, v]) => '<option value="' + k + '"' + (F.tabela === k ? ' selected' : '') + '>' + v + 's</option>').join('') + '</select>' +
    '<select class="busca sel" id="hist-acao"><option value="">Todas as ações</option>' + Object.entries(NOME_ACAO).map(([k, v]) => '<option value="' + k + '"' + (F.acao === k ? ' selected' : '') + '>' + v[0] + '</option>').join('') + '</select>' +
    '<select class="busca sel" id="hist-quem"><option value="">Todas as pessoas</option>' + perfis.map((p) => '<option value="' + p.id + '"' + (F.quem === p.id ? ' selected' : '') + '>' + esc(p.nome || p.email) + '</option>').join('') +
    '<option value="sistema"' + (F.quem === 'sistema' ? ' selected' : '') + '>Sistema / importação</option></select>' +
    '<input class="busca data-texto" id="hist-de" inputmode="numeric" placeholder="de dd/mm/aaaa" value="' + esc(F.de ? dataBR(F.de) : '') + '" autocomplete="off">' +
    '<input class="busca data-texto" id="hist-ate" inputmode="numeric" placeholder="até dd/mm/aaaa" value="' + esc(F.ate ? dataBR(F.ate) : '') + '" autocomplete="off">' +
    '<button class="btn btn-o btn-mini" id="hist-aplicar">Aplicar</button>' +
    '<input class="busca" id="hist-busca" placeholder="Buscar registro, grupo, pessoa, valor…" value="' + esc(F.busca) + '">' +
    '<button class="btn btn-o btn-mini" id="hist-csv">⬇ CSV</button></div>' +
    '<div class="kpis">' + kpi('Alterações no recorte', String(lista.length), '', reg.length >= 500 ? 'mostrando as 500 mais recentes' : 'mais recente primeiro') +
    kpi('Inclusões', String(conta('INSERT')), 'verde', '') + kpi('Alterações', String(conta('UPDATE')), '', '') + kpi('Exclusões', String(conta('DELETE')), 'vermelho', '') + '</div>' +
    '<div class="card">' + (lista.length ? '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th data-tipo="data">Quando</th><th>Quem</th><th>O quê</th><th>Registro</th><th class="sem-ordem">Detalhes</th></tr></thead><tbody>' +
      lista.map((h) => '<tr><td class="mono" data-ord="' + h.quando + '">' + dataHoraBR(h.quando) + '</td><td>' + esc(autor(h)) + '</td>' +
        '<td><span class="pill ' + NOME_ACAO[h.acao][1] + '">' + NOME_ACAO[h.acao][0] + '</span> <span class="sub">' + esc(NOME_TABELA[h.tabela] || h.tabela) + '</span></td>' +
        '<td><b>' + esc(rotulo(h.depois || h.antes, h.tabela)) + '</b></td><td class="hist-mud">' + detalhe(h) + '</td></tr>').join('') +
      '</tbody></table></div>' : '<div class="vazio">Nenhuma alteração com esses filtros.</div>') + '</div>';
  const muda = (k) => (ev) => { F[k] = ev.target.value; if (k === 'tabela') E.adm.tabela = F.tabela; pintarAdmin(); };
  $('hist-tabela').onchange = muda('tabela'); $('hist-acao').onchange = muda('acao'); $('hist-quem').onchange = muda('quem');
  mascaraData($('hist-de')); mascaraData($('hist-ate'));
  const aplicarDatas = () => {
    const de = lerDataBR($('hist-de').value), ate = lerDataBR($('hist-ate').value);
    if (($('hist-de').value && !de) || ($('hist-ate').value && !ate)) return aviso('Data incompleta: use dd/mm/aaaa.', true);
    let a = de ? de.iso : '', b = ate ? ate.iso : '';
    if (a && b && a > b) [a, b] = [b, a];               // datas invertidas: troca em silêncio
    F.de = a; F.ate = b;
    if ((de && de.corrigida) || (ate && ate.corrigida)) aviso('Dia ajustado para o último dia do mês.');
    pintarAdmin();
  };
  $('hist-aplicar').onclick = aplicarDatas;
  ['hist-de', 'hist-ate'].forEach((id) => { $(id).onkeydown = (ev) => { if (ev.key === 'Enter') aplicarDatas(); }; });
  let t; $('hist-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; pintarAdmin().then(() => { const i = $('hist-busca'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); }, 400); };
  $('hist-csv').onclick = () => {
    const linhas = [['Quando', 'Quem', 'Ação', 'Tela', 'Registro', 'Detalhes']].concat(lista.map((h) => {
      const tmp = document.createElement('div'); tmp.innerHTML = detalhe(h).replace(/<\/div>/g, ' | ');
      return [dataHoraBR(h.quando), autor(h), NOME_ACAO[h.acao][0], NOME_TABELA[h.tabela] || h.tabela, rotulo(h.depois || h.antes, h.tabela), tmp.textContent.trim()];
    }));
    baixarArquivo('Historico ERP ' + hojeISO() + '.csv', '﻿' + linhas.map((l) => l.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\n'), 'text/csv');
  };
}
function fmtHist(v, campo) {
  if (v == null || v === '') return '(vazio)';
  // ids viram nomes legíveis
  if (campo === 'grupo_id') return nomeGrupo(v) || 'grupo excluído';
  if (campo === 'cliente_id') { const c = E.clientes.find((x) => x.id === v); return c ? c.nome : 'cliente excluído'; }
  if (campo === 'contrato_id') return 'contrato';
  if (campo === 'empresa') return v === 'contabilidade' ? 'Contabilidade' : v === 'escritorio' ? 'Jurídico' : v;
  if (campo === 'valor' || campo === 'valor_total') return brl(v);
  if (v === true) return 'sim'; if (v === false) return 'não';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return dataBR(v);
  if (typeof v === 'number') return v.toLocaleString('pt-BR');
  return String(v).length > 60 ? String(v).slice(0, 57) + '…' : String(v);
}

// ─────────────────────────── E-MAIL ──────────────────────────────
// Configuração dos avisos por e-mail: o serviço (Gmail do escritório, outro SMTP ou Resend),
// o teste e a fila. A senha vai direto para o banco (config_privada) e nunca volta para a tela.
async function admEmail(corpo) {
  const [st, fila] = await Promise.all([
    q(sb.rpc('status_config_email')).catch(() => ({})),
    q(sb.from('email_fila').select('para, assunto, status, erro, criado_em, enviado_em, tipo').order('criado_em', { ascending: false }).limit(30)).catch(() => [])
  ]);
  const prov = st.provedor || 'gmail';
  corpo.innerHTML =
    '<div class="duas-col"><div class="card"><div class="card-hd">Serviço de envio ' + (st.tem_senha ? '<span class="pill pago">configurado</span>' : '<span class="pill hoje">não configurado</span>') + '</div><div class="card-bd">' +
    '<form id="f-email" class="grade">' +
    campo('Serviço', '<select name="provedor"><option value="gmail">Gmail do escritório (sem custo)</option><option value="smtp">Outro e-mail (SMTP: Hostinger, Locaweb, Outlook…)</option><option value="resend">Resend (plano grátis com limite)</option></select>', 'inteiro') +
    campo('E-mail que envia', '<input name="usuario" type="email" value="' + esc(st.usuario || '') + '" placeholder="escritorio@gmail.com">') +
    campo('<span id="rot-senha">Senha de app do Google</span>', '<input name="senha" type="password" autocomplete="new-password" placeholder="' + (st.tem_senha ? '•••••••• (deixe vazio para manter)' : '16 letras, sem espaços') + '">') +
    '<div class="grade inteiro" id="email-smtp">' + campo('Servidor SMTP', '<input name="host" value="' + esc(st.host || '') + '" placeholder="smtp.hostinger.com">') +
    campo('Porta', '<input name="porta" inputmode="numeric" value="' + esc(String(st.porta || 465)) + '">') + '</div>' +
    campo('Nome do remetente', '<input name="remetente" value="' + esc(st.remetente || 'ERP Araújo & Castro') + '">') +
    campo('Responder para (opcional)', '<input name="responder" type="email" value="' + esc(st.responder || '') + '">') +
    campo('Endereço do sistema (botão "Abrir no ERP")', '<input name="url" value="' + esc(location.origin) + '">', 'inteiro') +
    '</form>' +
    '<div class="acoes" style="margin-top:12px"><button class="btn btn-p" id="email-salvar">Salvar</button><button class="btn btn-o" id="email-teste">Enviar e-mail de teste</button>' +
    '<button class="btn btn-o" id="email-diag">🩺 Verificar funções</button><button class="btn btn-o" id="email-agora">Enviar fila agora</button><button class="btn btn-o" id="email-resumo">Mandar resumo do dia agora</button></div>' +
    (st.configurado_em ? '<p class="sub" style="margin-top:8px">Configurado em ' + dataHoraBR(st.configurado_em) + '.</p>' : '') +
    '</div></div>' +
    '<div class="card"><div class="card-hd">Como configurar (uma vez)</div><div class="card-bd" id="email-ajuda"></div></div></div>' +
    // e-mails ao cliente: dados do quadro "Como pagar" e prévia de cada modelo
    '<div class="card"><div class="card-hd">✉ E-mails ao cliente — dados para pagamento e modelos<span class="sub" style="margin-left:auto;font-weight:400">aparecem nas cobranças e lembretes</span></div><div class="card-bd">' +
      '<form id="f-pag" class="grade">' + campo('Chave PIX do escritório', '<input name="pix" placeholder="CNPJ, e-mail ou telefone">') + campo('Titular da conta', '<input name="titular">') +
      campo('Banco / agência / conta (opcional)', '<input name="banco" placeholder="Ex.: Sicoob · ag 0000 · cc 00000-0">') + campo('WhatsApp para dúvidas (opcional)', '<input name="whatsapp" placeholder="(31) 90000-0000">') +
      campo('Assinatura dos e-mails', '<input name="assinatura" placeholder="Equipe Araújo & Castro">', 'inteiro') + '</form>' +
      '<div class="acoes" style="margin-top:10px;flex-wrap:wrap"><button class="btn btn-p" id="pag-salvar">Salvar</button><span class="sub" style="align-self:center">Ver modelo:</span>' +
      [['lembrete', 'Lembrete'], ['cobranca', 'Cobrança'], ['acordo', 'Acordo'], ['parcelamento', 'Parcelamento'], ['recebido', 'Pagamento recebido']].map(([k, r]) => '<button class="btn btn-o btn-mini" data-previa="' + k + '">' + r + '</button>').join('') +
      '</div><p class="sub" style="margin-top:8px">Os e-mails ao cliente vão para o contato com a finalidade certa (financeiro nas cobranças; jurídico nos acordos) — cadastre em Clientes → ficha → Contatos. Sem e-mail cadastrado, nada é enviado. Liga/desliga cada um em Automações.</p></div></div>' +
    '<div class="kpis">' + kpi('Na fila', String(st.pendentes || 0), '', 'saem a cada 5 minutos') + kpi('Enviados em 7 dias', String(st.enviados_7d || 0), 'verde', '') +
    kpi('Com erro', String(st.erros || 0), st.erros ? 'vermelho' : '', 'veja o motivo abaixo') + '</div>' +
    '<div class="card"><div class="card-hd">Últimos e-mails</div>' + (fila.length ? '<div class="tabela-wrap"><table><thead><tr><th>Quando</th><th>Para</th><th>Assunto</th><th>Situação</th></tr></thead><tbody>' +
      fila.map((m) => '<tr><td class="mono">' + dataHoraBR(m.criado_em) + '</td><td>' + esc(m.para) + '</td><td>' + esc(m.assunto) + '</td><td>' +
        '<span class="pill ' + ({ enviado: 'pago', pendente: 'aberto', erro: 'vencido', cancelado: 'neutro' }[m.status] || 'neutro') + '">' + esc(m.status) + '</span>' +
        (m.erro ? '<div class="sub">' + esc(m.erro) + '</div>' : '') + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="vazio">Nenhum e-mail ainda.</div>') + '</div>';
  const f = $('f-email');
  f.provedor.value = prov;
  const fp = $('f-pag');
  q(sb.from('configuracoes').select('valor').eq('chave', 'dados_pagamento').maybeSingle()).then((r) => { const v = (r && r.valor) || {}; ['pix', 'titular', 'banco', 'whatsapp', 'assinatura'].forEach((k) => { fp[k].value = v[k] || ''; }); }).catch(() => {});
  $('pag-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const v = {}; ['pix', 'titular', 'banco', 'whatsapp', 'assinatura'].forEach((k) => { v[k] = fp[k].value.trim(); });
    await q(sb.from('configuracoes').upsert({ chave: 'dados_pagamento', valor: v }, { onConflict: 'chave' }));
    aviso('✓ Dados para pagamento salvos: já valem nos próximos e-mails.');
  });
  corpo.querySelectorAll('[data-previa]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const html = await q(sb.rpc('previa_email_cliente', { p_tipo: b.dataset.previa }));
    const j = abrirJanela({ titulo: 'Modelo: ' + b.textContent + ' (exemplo fictício)', larga: true, corpo: '<iframe class="previa-email" sandbox="" title="Prévia do e-mail"></iframe>' });
    j.querySelector('iframe').srcdoc = html;
  }));
  const AJUDA = {
    gmail: '<ol class="passos"><li>No Gmail do escritório: <b>Conta Google → Segurança → Verificação em duas etapas</b> (ligar, se estiver desligada).</li>' +
      '<li>Ainda em Segurança, abra <b>Senhas de app</b>, crie uma com o nome "ERP" e copie as 16 letras.</li>' +
      '<li>Aqui: escolha <b>Gmail</b>, informe o e-mail e cole a senha de app. Clique em <b>Salvar</b> e depois em <b>Enviar e-mail de teste</b>.</li></ol>',
    smtp: '<ol class="passos"><li>No painel do seu provedor de e-mail, pegue o <b>servidor SMTP</b> e a <b>porta SSL (465)</b>.</li><li>Informe o e-mail, a senha da caixa, o servidor e a porta.</li><li>Salve e envie o teste.</li></ol>',
    resend: '<ol class="passos"><li>Crie a conta em resend.com e confirme o domínio do escritório (ex.: araujoecastro.adv.br).</li><li>Crie uma <b>API key</b> e cole no campo de senha; em "E-mail que envia", use um endereço do domínio confirmado.</li><li>Salve e envie o teste. O plano grátis tem limite diário de envios; acima disso é pago.</li></ol>'
  };
  const trocar = () => {
    $('email-smtp').classList.toggle('escondido', f.provedor.value !== 'smtp');
    $('rot-senha').textContent = { gmail: 'Senha de app do Google', smtp: 'Senha do e-mail', resend: 'Chave da API (Resend)' }[f.provedor.value];
    $('email-ajuda').innerHTML = AJUDA[f.provedor.value] + '<p class="sub"><b>Uma vez só, no Supabase:</b> Edge Functions → Deploy a new function → Via Editor → nome <b>erp-emails</b> → cole o arquivo ' +
      '<code>supabase/functions/erp-emails/index.ts</code> do GitHub → Deploy → desligue <b>Verify JWT</b>. O passo a passo completo está no COMO-ATUALIZAR.</p>';
  };
  f.provedor.onchange = trocar; trocar();
  $('email-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.usuario.value.trim())) throw new Error('Informe o e-mail que envia.');
    if (f.provedor.value === 'smtp' && !f.host.value.trim()) throw new Error('Informe o servidor SMTP.');
    await q(sb.rpc('salvar_config_email', { p: { provedor: f.provedor.value, usuario: f.usuario.value.trim(), senha: f.senha.value.replace(/\s+/g, f.provedor.value === 'gmail' ? '' : ' ').trim(),
      host: f.host.value.trim(), porta: Number(f.porta.value) || 465, remetente: f.remetente.value.trim(), responder: f.responder.value.trim() } }));
    await q(sb.rpc('salvar_url_sistema', { p: f.url.value.trim() }));
    aviso('✓ Configuração de e-mail salva.'); await pintarAdmin();
  });
  const chamar = async (acao, msgOk) => {
    const data = await chamarFuncao('erp-emails', { acao });
    if (data && data.aviso) throw new Error(data.aviso);
    aviso('✓ ' + msgOk + ' — enviados: ' + ((data && data.enviados) || 0) + (data && data.erros ? ', com erro: ' + data.erros + ' (' + data.ultimoErro + ')' : '') + '.');
    await pintarAdmin();
  };
  $('email-diag').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const r = await verificarFuncoes();
    const j = abrirJanela({ titulo: 'Funções do Supabase', corpo: '<div class="lista-ficha">' + r.map(([n, ok, m]) => '<div class="item-ficha"><div><b>' + (ok ? '✅ ' : '❌ ') + n + '</b><div class="sub">' + esc(m) + '</div></div></div>').join('') + '</div>' +
      '<p class="sub" style="margin-top:10px">Para publicar: Supabase → Edge Functions → Deploy a new function → Via Editor → nome exatamente como acima → cole o arquivo de <code>supabase/functions/NOME/index.ts</code> (botão Raw no GitHub) → Deploy → desligue "Verify JWT".</p>' });
    return j;
  });
  $('email-teste').onclick = (ev) => comBotao(ev.currentTarget, () => chamar('teste', 'Teste enviado para o seu e-mail'));
  $('email-agora').onclick = (ev) => comBotao(ev.currentTarget, () => chamar('enviar', 'Fila enviada'));
  $('email-resumo').onclick = (ev) => comBotao(ev.currentTarget, () => chamar('resumo', 'Resumo do dia montado'));
}

// Cada pessoa escolhe o que quer receber por e-mail (⋯ → Meus avisos por e-mail)
const PREFS_EMAIL = [['resumo', 'Resumo do dia (dias úteis, 7h45)'], ['tarefa', 'Tarefa atribuída a mim, revisão e aviso de atraso'], ['mencao', 'Quando alguém me menciona (@Nome)'],
  ['fatal', 'Prazos fatais nos próximos dias (no resumo)'], ['vencimentos', 'Documentos e certidões vencendo (no resumo)'], ['publicacao', 'Publicação nova no Diário de Justiça']];
async function janelaMeusAvisos() {
  const eu = await q(sb.from('perfis').select('pref_email, email').eq('id', (E.perfil || window.ERP_EU).id).single());
  const pf = eu.pref_email || {};
  const j = abrirJanela({ titulo: 'Meus avisos por e-mail',
    corpo: '<p class="sub" style="margin-bottom:10px">Os e-mails vão para <b>' + esc(eu.email) + '</b>.</p>' +
      PREFS_EMAIL.map(([k, r]) => '<label class="check" style="margin-bottom:8px"><input type="checkbox" data-pref="' + k + '"' + (pf[k] !== false ? ' checked' : '') + '> ' + r + '</label>').join(''),
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-salvar-pref">Salvar</button></div>' });
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-salvar-pref').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const p = {}; j.querySelectorAll('[data-pref]').forEach((c) => { p[c.dataset.pref] = c.checked; });
    await q(sb.rpc('salvar_minhas_preferencias', { p }));
    aviso('✓ Preferências salvas.'); fecharJanela(j);
  });
}

// ─────────────────────── E-MAILS AOS CLIENTES (perfil por cliente) ───────────────────────
// Um lugar só para decidir quem recebe o quê: cada cliente tem um perfil; dá para mudar vários de uma vez.
async function admClientesEmail(corpo) {
  await carregarCadastros(true);
  const ult = await q(sb.rpc('ultimos_emails_clientes')).catch(() => []);
  const ultimo = {}; ult.forEach((u) => { ultimo[u.cliente_id] = u; });
  const F = E.adm.cem = E.adm.cem || { busca: '', perfil: '' };
  const rot = (v) => (PERFIS_EMAIL.find((p) => p[0] === (v || 'padrao')) || PERFIS_EMAIL[0])[1];
  corpo.innerHTML =
    '<div class="card"><div class="card-hd">📨 Quem recebe e-mail automático de honorários</div><div class="card-bd">' +
      '<div class="cem-perfis">' + PERFIS_EMAIL.map(([v, r, d]) => '<div class="cem-perfil"><b>' + r + '</b><span>' + d + '</span></div>').join('') + '</div>' +
      '<p class="sub" style="margin-top:10px">Cliente novo entra como <b>Padrão</b>. Os e-mails vão para o contato financeiro do cliente (ficha → Contatos) e só saem se a automação estiver ligada em ⚡ Automações. ' +
      'Nome, chave PIX e modelos ficam em <b>✉ Envio de e-mail</b>.</p></div></div>' +
    '<div class="filtros"><input class="busca" id="cem-busca" placeholder="Buscar cliente ou grupo" autocomplete="off" value="' + esc(F.busca) + '">' +
      '<select class="busca sel" id="cem-filtro"><option value="">Todos os perfis</option>' + PERFIS_EMAIL.map(([v, r]) => '<option value="' + v + '"' + (F.perfil === v ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>' +
      '<span class="sub" id="cem-sel" style="align-self:center"></span>' +
      '<select class="busca sel" id="cem-lote"><option value="">Aplicar aos marcados…</option>' + PERFIS_EMAIL.filter((p) => p[0] !== 'personalizado').map(([v, r]) => '<option value="' + v + '">' + r + '</option>').join('') + '</select></div>' +
    '<div class="card"><div id="cem-tab"></div></div>';
  const pintar = () => {
    const b = normalizar(F.busca);
    const lista = E.clientes.filter((c) => c.tipo !== 'Inativo' && (!F.perfil || (c.perfil_email || 'padrao') === F.perfil) &&
      (!b || normalizar(c.nome + ' ' + (c.grupos ? c.grupos.nome : '')).includes(b)))
      .sort((a, x) => String(a.grupos ? a.grupos.nome : '').localeCompare(String(x.grupos ? x.grupos.nome : ''), 'pt-BR') || String(a.nome).localeCompare(String(x.nome), 'pt-BR'));
    $('cem-tab').innerHTML = lista.length ? '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th class="sem-ordem"><input type="checkbox" id="cem-todos" aria-label="Marcar todos"></th><th>Grupo</th><th>Cliente</th><th>E-mails de cobrança</th><th>Último e-mail enviado</th></tr></thead><tbody>' +
      lista.map((c) => { const u = ultimo[c.id]; return '<tr><td><input type="checkbox" data-cem-x="' + c.id + '" aria-label="Marcar ' + esc(c.nome) + '"></td><td>' + esc(c.grupos ? c.grupos.nome : '—') + '</td><td><b>' + esc(c.nome) + '</b></td>' +
        '<td><select class="busca sel cem-perfil-sel" data-cem="' + c.id + '" aria-label="Perfil de ' + esc(c.nome) + '">' + PERFIS_EMAIL.map(([v, r]) => '<option value="' + v + '"' + ((c.perfil_email || 'padrao') === v ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>' +
        ((c.perfil_email || 'padrao') === 'personalizado' ? ' <button type="button" class="btn btn-o btn-mini" data-cem-tipos="' + c.id + '">Tipos</button>' : '') + '</td>' +
        '<td data-ord="' + (u ? u.quando : '') + '">' + (u ? '<span class="sub">' + dataHoraBR(u.quando) + '</span><div class="sub" title="' + esc(u.descricao) + '">' + esc(String(u.descricao).slice(0, 70)) + '</div>' : '<span class="sub">—</span>') + '</td></tr>'; }).join('') +
      '</tbody></table></div>' : vazio('Nenhum cliente neste filtro.');
    const marcados = () => [...document.querySelectorAll('[data-cem-x]:checked')].map((x) => x.dataset.cemX);
    const conta = () => { const n = marcados().length; $('cem-sel').textContent = n ? n + ' marcado(s)' : ''; };
    const todos = $('cem-todos'); if (todos) todos.onchange = () => { document.querySelectorAll('[data-cem-x]').forEach((x) => { x.checked = todos.checked; }); conta(); };
    document.querySelectorAll('[data-cem-x]').forEach((x) => x.onchange = conta);
    document.querySelectorAll('[data-cem]').forEach((sel) => sel.onchange = () => comBotao(sel, async () => {
      if (sel.value === 'personalizado') { await janelaTiposEmail([sel.dataset.cem]); return; }
      await q(sb.rpc('salvar_perfil_email', { p_ids: [sel.dataset.cem], p_perfil: sel.value, p_tipos: null }));
      aviso('✓ ' + rot(sel.value) + ' — ' + (E.clientes.find((c) => c.id === sel.dataset.cem) || {}).nome); await carregarCadastros(true); pintar();
    }));
    document.querySelectorAll('[data-cem-tipos]').forEach((b) => b.onclick = () => janelaTiposEmail([b.dataset.cemTipos]));
    $('cem-lote').onchange = (ev) => comBotao(ev.target, async () => {
      const v = ev.target.value, ids = marcados(); ev.target.value = '';
      if (!v) return; if (!ids.length) throw new Error('Marque os clientes na primeira coluna.');
      const n = await q(sb.rpc('salvar_perfil_email', { p_ids: ids, p_perfil: v, p_tipos: null }));
      aviso('✓ ' + n + ' cliente(s) agora em "' + rot(v) + '".'); await carregarCadastros(true); pintar();
    });
  };
  // Personalizado: caixinhas por tipo de e-mail
  const janelaTiposEmail = (ids) => new Promise((ok) => {
    const c = E.clientes.find((x) => x.id === ids[0]) || {}, t = c.emails_tipos || {};
    const padrao = (k) => k !== 'vencimento';
    const j = abrirJanela({ titulo: 'E-mails de ' + (c.nome || 'cliente'), corpo: '<div class="lista-ficha">' + TIPOS_EMAIL.map(([k, r]) =>
        '<label class="check"><input type="checkbox" data-tipo="' + k + '"' + ((t[k] != null ? t[k] : padrao(k)) ? ' checked' : '') + '> ' + r + '</label>').join('') + '</div>',
      rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="cem-tipos-ok">Salvar</button></div>' });
    j._aoFechar = () => { ok(); pintar(); };
    j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
    j.querySelector('#cem-tipos-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
      const tipos = {}; j.querySelectorAll('[data-tipo]').forEach((x) => { tipos[x.dataset.tipo] = x.checked; });
      await q(sb.rpc('salvar_perfil_email', { p_ids: ids, p_perfil: 'personalizado', p_tipos: tipos }));
      await carregarCadastros(true); aviso('✓ E-mails de ' + (c.nome || 'cliente') + ' atualizados.'); fecharJanela(j);
    });
  });
  let tb; $('cem-busca').oninput = (ev) => { clearTimeout(tb); tb = setTimeout(() => { F.busca = ev.target.value; pintar(); }, 250); };
  $('cem-filtro').onchange = (ev) => { F.perfil = ev.target.value; pintar(); };
  pintar();
}
