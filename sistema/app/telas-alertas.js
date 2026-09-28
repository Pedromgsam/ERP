'use strict';
// ═══════════════════════════════════════════════════════════════════
// Alertas — um painel com o que precisa de atenção em cada setor
// (cadastro, jurídico, financeiro, documentos, tarefas e rotinas
// automáticas). Cada cartão abre o relatório com a lista e o CSV.
// Mostra só o que a pessoa tem permissão de ver (as regras do banco valem).
// ═══════════════════════════════════════════════════════════════════
const PROVEDORES_CNPJ = [['brasilapi', 'BrasilAPI (grátis, sem chave — recomendado)'], ['receitaws', 'ReceitaWS (grátis: 3 por minuto; com token, sem limite)'], ['cnpja', 'CNPJá (open.cnpja.com, grátis com limite)']];

TELAS.alertas = async function () {
  await carregarCadastros();
  $('conteudo').innerHTML = '<div class="titulo-pag"><div><h1>Alertas</h1><p>O que precisa de atenção em cada setor · clique num cartão para ver o relatório</p></div>' +
    '<div class="acoes"><button class="btn btn-o" id="al-atualizar">↻ Atualizar</button></div></div><div id="al-corpo"><div class="carregando">Montando os alertas…</div></div>';
  $('al-atualizar').onclick = () => TELAS.alertas();
  const h = hojeISO(), nada = () => [];
  const podeJur = pode('juridico'), podeFin = pode('financeiro_juridico') || pode('financeiro_contab');
  const [pubs, parcelas, acordos, procs, lancs, contratos, certs, docs, tarefas, cnpj, emails, ultPub, ultReg, contatos] = await Promise.all([
    podeJur ? q(sb.from('publicacoes').select('id, tipo, processo, tribunal, data_disponibilizacao, advogado').eq('status', 'nova')).catch(nada) : [],
    podeJur ? buscarTodos(() => sb.from('parcelas').select('id, numero, vencimento, parcelamentos(empresa, natureza, grupo_id)').eq('pago', false).lt('vencimento', h)).catch(nada) : [],
    podeJur ? q(sb.from('acordos').select('id, processo, devedor, credor, parcela, valor, vencimento, grupo_id').eq('pago', false).lt('vencimento', h)).catch(nada) : [],
    podeJur ? buscarTodos(() => sb.from('processos').select('id, numero, natureza, grupo_id, valor')).catch(nada) : [],
    podeFin ? buscarTodos(() => sb.from('lancamentos').select('id, descricao, valor, redutor, vencimento, grupo_id, empresa, obs').eq('tipo', 'receita').eq('pago', false).eq('perda', false)).catch(nada) : [],
    pode('contratos') ? q(sb.from('contratos').select('id, descricao, status, cliente_id, documentos(id)').eq('status', 'Ativo')).catch(nada) : [],
    q(sb.from('certidoes').select('id, orgao, validade, cliente_id').lte('validade', somarDias(h, 15))).catch(nada),
    q(sb.from('documentos').select('id, nome, validade, cliente_id').eq('arquivado', false).lte('validade', somarDias(h, 15))).catch(nada),
    q(sb.from('tarefas').select('id, titulo, prazo, prazo_fatal, responsavel').not('status', 'in', '(concluida,cancelada)')).catch(nada),
    q(sb.from('cnpj_execucoes').select('*').order('inicio', { ascending: false }).limit(10)).catch(nada),
    E.perfil && E.perfil.papel === 'admin' ? q(sb.from('email_fila').select('id, para, assunto, erro, criado_em').eq('status', 'erro').order('criado_em', { ascending: false }).limit(50)).catch(nada) : [],
    q(sb.from('configuracoes').select('valor').eq('chave', 'publicacoes_ultima').maybeSingle()).catch(() => null),
    q(sb.from('configuracoes').select('valor').eq('chave', 'regras_tarefas_ultima').maybeSingle()).catch(() => null),
    pode('clientes') ? q(sb.from('contatos').select('cliente_id')).catch(nada) : []
  ]);
  const cls = E.clientes, ativos = cls.filter((c) => c.tipo !== 'Inativo');
  const pj = (c) => soDigitos(c.cpf_cnpj).length === 14;
  const comContato = new Set(contatos.map((x) => x.cliente_id));
  const linhaCli = (c) => [c.grupos ? c.grupos.nome : '—', c.nome, mascaraDoc(c.cpf_cnpj) || '—', c.responsavel || '—'];
  const colCli = ['Grupo', 'Entidade', 'CPF/CNPJ', 'Responsável'];
  // cada alerta: [setor, rótulo, valor exibido, detalhe, nível (ok|atencao|critico|info), relatório {colunas, linhas, abrir}]
  const A = [];
  const add = (setor, rot, valor, det, nivel, rel) => A.push({ setor, rot, valor, det, nivel, rel });
  // ── Cadastro ──
  const comProc = cls.filter((c) => c.procuracao === true), semProc = cls.filter((c) => c.procuracao !== true);
  add('Cadastro', 'Procurações', comProc.length + ' de ' + cls.length, semProc.length + ' entidade(s) sem procuração', semProc.length ? 'atencao' : 'ok',
    { titulo: 'Entidades sem procuração', colunas: colCli, linhas: semProc.map(linhaCli), ids: semProc.map((c) => c.id) });
  const comCert = cls.filter((c) => c.certificado === true), semCert = cls.filter((c) => c.certificado !== true && pj(c));
  add('Cadastro', 'Certificado digital', comCert.length + ' de ' + cls.filter(pj).length, semCert.length + ' empresa(s) sem certificado', semCert.length ? 'atencao' : 'ok',
    { titulo: 'Empresas sem certificado digital', colunas: colCli, linhas: semCert.map(linhaCli), ids: semCert.map((c) => c.id) });
  const omisso = cls.filter((c) => /omisso/i.test(c.capag || ''));
  add('Cadastro', 'CAPAG omisso', String(omisso.length), 'entidade(s) que não entregaram a declaração', omisso.length ? 'critico' : 'ok',
    { titulo: 'CAPAG omisso', colunas: colCli, linhas: omisso.map(linhaCli), ids: omisso.map((c) => c.id) });
  const capD = cls.filter((c) => /^d$/i.test(String(c.capag || '').trim()));
  add('Cadastro', 'CAPAG D', String(capD.length), 'menor capacidade de pagamento', capD.length ? 'atencao' : 'ok',
    { titulo: 'CAPAG D', colunas: colCli, linhas: capD.map(linhaCli), ids: capD.map((c) => c.id) });
  const irreg = cls.filter((c) => pj(c) && c.situacao_cadastral && !/^ativa$/i.test(c.situacao_cadastral.trim()));
  add('Cadastro', 'Situação cadastral irregular', String(irreg.length), 'inapta, suspensa ou baixada na Receita', irreg.length ? 'critico' : 'ok',
    { titulo: 'Situação cadastral diferente de ATIVA', colunas: colCli.concat(['Situação']), linhas: irreg.map((c) => linhaCli(c).concat([c.situacao_cadastral])), ids: irreg.map((c) => c.id) });
  const semResp = ativos.filter((c) => !c.responsavel);
  add('Cadastro', 'Sem responsável', String(semResp.length), 'entidade(s) ativas sem pessoa responsável', semResp.length ? 'atencao' : 'ok',
    { titulo: 'Entidades sem responsável', colunas: colCli, linhas: semResp.map(linhaCli), ids: semResp.map((c) => c.id) });
  const semCont = ativos.filter((c) => !c.email && !c.telefone && !comContato.has(c.id));
  add('Cadastro', 'Sem contato', String(semCont.length), 'sem e-mail, telefone ou contato cadastrado', semCont.length ? 'atencao' : 'ok',
    { titulo: 'Entidades sem contato', colunas: colCli, linhas: semCont.map(linhaCli), ids: semCont.map((c) => c.id) });
  // ── Jurídico ──
  if (podeJur) {
    add('Jurídico', 'Publicações novas', String(pubs.length), 'no Diário de Justiça, ainda não lidas', pubs.length ? 'atencao' : 'ok',
      { titulo: 'Publicações novas', colunas: ['Data', 'Tribunal', 'Tipo', 'Processo', 'Advogado'], linhas: pubs.map((p) => [dataBR(p.data_disponibilizacao), p.tribunal, p.tipo, p.processo, p.advogado]), tela: 'publicacoes' });
    add('Jurídico', 'Parcelamentos com parcela vencida', String(parcelas.length), 'dívida do cliente (não é financeiro do escritório)', parcelas.length ? 'critico' : 'ok',
      { titulo: 'Parcelas de parcelamento vencidas', colunas: ['Vencimento', 'Empresa', 'Natureza', 'Parcela', 'Grupo'],
        linhas: parcelas.map((x) => [dataBR(x.vencimento), x.parcelamentos ? x.parcelamentos.empresa : '—', x.parcelamentos ? x.parcelamentos.natureza : '', x.numero, x.parcelamentos ? nomeGrupo(x.parcelamentos.grupo_id) : '']), tela: 'parcelamentos' });
    add('Jurídico', 'Acordos vencidos', String(acordos.length), (acordos.length ? brlCurto(soma(acordos, (a) => a.valor)) + ' · ' : '') + 'parcelas de acordos dos clientes com terceiros', acordos.length ? 'critico' : 'ok',
      { titulo: 'Parcelas de acordo vencidas', colunas: ['Vencimento', 'Devedor', 'Credor', 'Parcela', 'Valor'], linhas: acordos.map((a) => [dataBR(a.vencimento), a.devedor, a.credor, a.parcela, brl(a.valor)]), tela: 'acordos' });
    const semValor = procs.filter((p) => !(Number(p.valor) > 0));
    add('Jurídico', 'Processos sem valor da causa', String(semValor.length) + ' de ' + procs.length, 'complete para o Painel somar certo', semValor.length ? 'info' : 'ok',
      { titulo: 'Processos sem valor da causa', colunas: ['Número', 'Natureza', 'Grupo'], linhas: semValor.map((p) => [p.numero, p.natureza, nomeGrupo(p.grupo_id)]), tela: 'processos' });
  }
  // ── Financeiro ──
  if (podeFin) {
    const atr = lancs.filter((l) => l.vencimento < h);
    add('Financeiro', 'Honorários em atraso', atr.length ? brlCurto(soma(atr, vl)) : '0', atr.length + ' lançamento(s) vencido(s), todos os meses', atr.length ? 'critico' : 'ok',
      { titulo: 'Honorários em atraso', colunas: ['Vencimento', 'Descrição', 'Grupo', 'Empresa', 'Valor'], linhas: atr.sort((a, b) => a.vencimento.localeCompare(b.vencimento)).map((l) => [dataBR(l.vencimento), l.descricao, nomeGrupo(l.grupo_id), l.empresa === 'contabilidade' ? 'Contabilidade' : 'Jurídico', brl(vl(l))]), tela: 'financeiro' });
    const prov = lancs.filter((l) => /salário mínimo de \d{4} ainda não cadastrado/i.test(l.obs || ''));
    add('Financeiro', 'Mensalidades com salário mínimo provisório', String(prov.length), 'cadastre o salário mínimo do ano em Contratos', prov.length ? 'atencao' : 'ok',
      { titulo: 'Mensalidades aguardando o salário mínimo do ano', colunas: ['Vencimento', 'Descrição', 'Valor provisório'], linhas: prov.map((l) => [dataBR(l.vencimento), l.descricao, brl(l.valor)]), tela: 'contratos' });
  }
  if (pode('contratos')) {
    const semAnexo = contratos.filter((c) => !(c.documentos || []).length);
    add('Financeiro', 'Contratos sem anexo', String(semAnexo.length) + ' de ' + contratos.length, 'contratos ativos sem o documento assinado', semAnexo.length ? 'atencao' : 'ok',
      { titulo: 'Contratos ativos sem anexo', colunas: ['Contrato', 'Cliente'], linhas: semAnexo.map((c) => [c.descricao, nomeCliente(c.cliente_id)]), tela: 'contratos' });
  }
  // ── Documentos e tarefas ──
  const certV = certs.filter((c) => c.validade);
  add('Documentos', 'Certidões vencendo', String(certV.length), 'vencidas ou nos próximos 15 dias', certV.some((c) => c.validade < h) ? 'critico' : certV.length ? 'atencao' : 'ok',
    { titulo: 'Certidões vencidas ou vencendo', colunas: ['Validade', 'Órgão', 'Cliente'], linhas: certV.map((c) => [dataBR(c.validade), c.orgao, nomeCliente(c.cliente_id)]) });
  const docV = docs.filter((d) => d.validade);
  add('Documentos', 'Documentos vencendo', String(docV.length), 'vencidos ou nos próximos 15 dias', docV.some((d) => d.validade < h) ? 'critico' : docV.length ? 'atencao' : 'ok',
    { titulo: 'Documentos vencidos ou vencendo', colunas: ['Validade', 'Documento', 'Cliente'], linhas: docV.map((d) => [dataBR(d.validade), d.nome, nomeCliente(d.cliente_id)]), tela: 'documentos' });
  const tAtr = tarefas.filter((t) => t.prazo && t.prazo < h), tFat = tarefas.filter((t) => t.prazo_fatal && t.prazo_fatal <= somarDias(h, 7));
  add('Tarefas', 'Tarefas atrasadas', String(tAtr.length), 'todas as pessoas', tAtr.length ? 'critico' : 'ok',
    { titulo: 'Tarefas atrasadas', colunas: ['Prazo', 'Tarefa', 'Pessoa'], linhas: tAtr.sort((a, b) => a.prazo.localeCompare(b.prazo)).map((t) => [dataBR(t.prazo), t.titulo, t.responsavel]), tela: 'tarefas' });
  add('Tarefas', 'Prazos fatais em 7 dias', String(tFat.length), 'inclui os já vencidos', tFat.some((t) => t.prazo_fatal < h) ? 'critico' : tFat.length ? 'atencao' : 'ok',
    { titulo: 'Prazos fatais nos próximos 7 dias', colunas: ['Prazo fatal', 'Tarefa', 'Pessoa'], linhas: tFat.sort((a, b) => a.prazo_fatal.localeCompare(b.prazo_fatal)).map((t) => [dataBR(t.prazo_fatal), t.titulo, t.responsavel]), tela: 'tarefas' });
  // ── Rotinas automáticas ──
  const ult = cnpj[0], hoje6 = new Date(h + 'T06:30:00'), rodouHoje = ult && new Date(ult.inicio) >= new Date(h + 'T00:00:00');
  const cnpjNivel = !ult ? 'atencao' : ult.status === 'erro' ? 'critico' : !rodouHoje && new Date() > hoje6 ? 'critico' : ult.status === 'parcial' ? 'atencao' : 'ok';
  add('Rotinas', 'Cartão CNPJ (6h)', !ult ? 'nunca rodou' : rodouHoje ? '✓ hoje ' + new Date(ult.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '⚠ ' + new Date(ult.inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    ult ? ult.mensagem || ult.status : 'publique a função erp-cnpj e ligue o agendador', cnpjNivel, { cnpj: true });
  if (emails.length || (E.perfil && E.perfil.papel === 'admin')) add('Rotinas', 'E-mails com erro', String(emails.length), 'não saíram depois de 3 tentativas', emails.length ? 'critico' : 'ok',
    { titulo: 'E-mails com erro', colunas: ['Quando', 'Para', 'Assunto', 'Erro'], linhas: emails.map((m) => [quandoRodou(m.criado_em), m.para, m.assunto, m.erro]) });
  if (podeJur) add('Rotinas', 'Busca de publicações', ultPub && ultPub.valor ? quandoCurto(ultPub.valor.quando) : 'nunca rodou',
    ultPub && ultPub.valor ? ultPub.valor.novas + ' nova(s) · ' + ((ultPub.valor.erros || []).length ? '⚠ ' + ultPub.valor.erros[0] : 'sem erro') : 'cadastre as OABs em Publicações',
    !ultPub || !ultPub.valor ? 'atencao' : (ultPub.valor.erros || []).length ? 'critico' : 'ok', { tela: 'publicacoes' });
  add('Rotinas', 'Regras de tarefas', ultReg && ultReg.valor ? quandoCurto(ultReg.valor.quando) : 'nunca rodou', ultReg && ultReg.valor ? ultReg.valor.criadas + ' criada(s) na última execução' : '',
    ultReg && ultReg.valor ? 'ok' : 'info', { tela: 'tarefas' });
  // saúde do sistema e backup semanal (só o administrador)
  if (E.perfil && E.perfil.papel === 'admin') {
    const s = await q(sb.rpc('saude_sistema')).catch(() => null);
    if (s) {
      const pct = (a, b) => Math.round(100 * (a || 0) / b), mb = (x) => (x / 1048576).toFixed(x < 10485760 ? 1 : 0).replace('.', ',') + ' MB';
      const pb = pct(s.banco_bytes, s.banco_limite), pa = pct(s.arquivos_bytes, s.arquivos_limite), maior = Math.max(pb, pa);
      add('Rotinas', 'Saúde do sistema', 'Banco ' + pb + '% · Arquivos ' + pa + '%', mb(s.banco_bytes) + ' de 500 MB · ' + mb(s.arquivos_bytes) + ' de 1 GB (plano grátis)',
        maior >= 90 ? 'critico' : maior >= 70 ? 'atencao' : 'ok', { saude: s });
      const dias = s.ultimo_backup ? Math.floor((Date.now() - new Date(s.ultimo_backup)) / 86400000) : null;
      add('Rotinas', 'Backup semanal', s.ultimo_backup ? quandoCurto(s.ultimo_backup) : 'nunca rodou', s.ultimo_backup ? 'há ' + dias + ' dia(s) · 8 cópias guardadas' : 'publique a função erp-backup',
        dias === null ? 'atencao' : dias > 8 ? 'critico' : 'ok', { backup: true });
    }
  }

  const setores = [...new Set(A.map((a) => a.setor))];
  const criticos = A.filter((a) => a.nivel === 'critico').length, atencao = A.filter((a) => a.nivel === 'atencao').length;
  $('al-corpo').innerHTML = '<div class="kpis">' + kpi('Críticos', String(criticos), criticos ? 'vermelho' : 'verde', 'pedem ação agora') + kpi('Atenção', String(atencao), atencao ? 'ambar' : 'verde', 'acompanhar') +
    kpi('Tudo certo', String(A.filter((a) => a.nivel === 'ok').length), 'verde', 'de ' + A.length + ' verificações') + '</div>' +
    setores.map((st) => '<div class="kpis-titulo">' + esc(st) + '</div><div class="al-grade">' + A.map((a, i) => a.setor !== st ? '' :
      '<button type="button" class="al-card al-' + a.nivel + '" data-al="' + i + '"><div class="al-rot">' + esc(a.rot) + '</div><div class="al-val">' + esc(a.valor) + '</div><div class="al-det">' + esc(a.det) + '</div></button>').join('') + '</div>').join('');
  $('al-corpo').querySelectorAll('[data-al]').forEach((b) => b.onclick = () => { const a = A[+b.dataset.al]; if (a.rel.cnpj) janelaCnpj(cnpj); else if (a.rel.saude) janelaSaude(a.rel.saude); else if (a.rel.backup) irTelaAlerta('admin', 'backup'); else relatorioAlerta(a); });
};

function quandoCurto(v) {
  const d = new Date(v); if (isNaN(d)) return '—';
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return (d.toDateString() === new Date().toDateString() ? 'hoje ' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ') + hora;
}
function janelaSaude(s) {
  const mb = (x) => (x / 1048576).toFixed(1).replace('.', ',') + ' MB';
  const barra = (usado, lim) => { const p = Math.min(100, Math.round(100 * usado / lim)); return '<div style="height:10px;border-radius:6px;background:var(--surface3);overflow:hidden;margin:4px 0 10px"><div style="width:' + p + '%;height:100%;background:' + (p >= 90 ? 'var(--red)' : p >= 70 ? 'var(--amber)' : 'var(--green)') + '"></div></div>'; };
  abrirJanela({ titulo: 'Saúde do sistema', corpo:
    '<p><b>Banco de dados:</b> ' + mb(s.banco_bytes) + ' de 500 MB</p>' + barra(s.banco_bytes, s.banco_limite) +
    '<p><b>Arquivos (documentos e backups):</b> ' + mb(s.arquivos_bytes) + ' de 1 GB · ' + s.arquivos_qtd + ' arquivo(s)</p>' + barra(s.arquivos_bytes, s.arquivos_limite) +
    '<div class="secao">Maiores tabelas</div><div class="tabela-wrap"><table><tbody>' + (s.maiores || []).map((m) => '<tr><td>' + esc(m.tabela) + '</td><td class="num mono">' + mb(m.bytes) + '</td></tr>').join('') + '</tbody></table></div>' +
    '<div class="dica" style="margin-top:10px">Limites do plano grátis do Supabase. Passando de 70%, vale limpar arquivos antigos ou avaliar o plano Pro (US$ 25/mês: 8 GB de banco e 100 GB de arquivos).</div>' });
}
function irTelaAlerta(t, aba) { if (aba && t === 'admin') { E.adm = Object.assign(E.adm || {}, { aba }); } if (typeof window.nav === 'function') window.nav(null, t); else irPara(t); }

function relatorioAlerta(a) {
  const r = a.rel;
  if (!r.colunas) { if (r.tela) irTelaAlerta(r.tela); return; }
  relatorioTabela(Object.assign({}, r, r.tela ? { acao: { rotulo: 'Abrir a tela', fn: () => irTelaAlerta(r.tela) } } : {}));
}

// Cartão CNPJ: última execução, o que mudou, erros, histórico e a API usada
async function janelaCnpj(execs) {
  const cfg = await q(sb.rpc('status_config_cnpj')).catch(() => ({})) || {};
  const admin = E.perfil && E.perfil.papel === 'admin', ult = execs[0];
  const rel = (ult && ult.relatorio) || [];
  const alt = rel.filter((x) => x.mudancas && !x.primeira), err = rel.filter((x) => x.erro);
  const j = abrirJanela({ titulo: 'Cartão CNPJ — atualização diária (6h)', larga: true,
    corpo: (ult ? '<div class="dica" style="margin-bottom:10px"><b>Última execução:</b> ' + quandoRodou(ult.inicio) + ' · ' + ({ ok: '✅ sem erro', parcial: '⚠ com alguns erros', erro: '❌ com erro', rodando: '⏳ rodando' }[ult.status] || ult.status) +
        ' · ' + esc(ult.mensagem) + ' · API: ' + esc(ult.provedor) + '</div>' : '<div class="dica" style="margin-bottom:10px">Ainda não rodou. Publique a função <b>erp-cnpj</b> no Supabase e clique em "Atualizar agora".</div>') +
      '<div class="secao">Alterações encontradas (' + alt.length + ')</div>' +
      (alt.length ? '<div class="tabela-wrap"><table><thead><tr><th>Entidade</th><th>Campo</th><th>Antes</th><th>Agora</th></tr></thead><tbody>' +
        alt.flatMap((x) => x.mudancas.map((m, k) => '<tr>' + (k === 0 ? '<td rowspan="' + x.mudancas.length + '"><b>' + esc(x.nome) + '</b><div class="sub mono">' + esc(mascaraDoc(x.cnpj)) + '</div></td>' : '') +
          '<td>' + esc(m.campo) + '</td><td class="sub">' + esc(m.antes || '—') + '</td><td><b>' + esc(m.depois) + '</b></td></tr>')).join('') + '</tbody></table></div>' : '<div class="sub" style="margin-bottom:8px">Nenhuma alteração.</div>') +
      '<div class="secao">Erros (' + err.length + ')</div>' +
      (err.length ? '<div class="lista-ficha">' + err.map((x) => '<div class="item-ficha"><div><b>' + esc(x.nome) + '</b> <span class="sub mono">' + esc(mascaraDoc(x.cnpj)) + '</span><div class="sub">' + esc(x.erro) + '</div></div></div>').join('') + '</div>' : '<div class="sub" style="margin-bottom:8px">Nenhum erro.</div>') +
      '<div class="secao">Últimas execuções</div><div class="tabela-wrap"><table><thead><tr><th>Quando</th><th>Origem</th><th>Situação</th><th>Resultado</th></tr></thead><tbody>' +
      execs.map((x) => '<tr><td class="mono">' + quandoRodou(x.inicio) + '</td><td>' + (x.origem === 'rotina' ? '6h automática' : 'manual') + '</td><td><span class="pill ' + ({ ok: 'pago', parcial: 'hoje', erro: 'vencido' }[x.status] || 'neutro') + '">' + esc(x.status) + '</span></td><td>' + esc(x.mensagem) + '</td></tr>').join('') + '</tbody></table></div>' +
      (admin ? '<div class="secao">API do cartão CNPJ</div><form class="grade" id="f-cnpj">' + campo('API', selectPares('provedor', PROVEDORES_CNPJ, cfg.provedor || 'brasilapi'), 'inteiro') +
        campo('Token (só ReceitaWS paga)', '<input name="token" type="password" placeholder="' + (cfg.tem_token ? '•••• (deixe vazio para manter)' : 'opcional') + '">', 'inteiro') + '</form>' : ''),
    rodape: '<span></span><div class="acoes">' + (admin ? '<button class="btn btn-o" type="button" id="cnpj-salvar">Salvar API</button><button class="btn btn-p" type="button" id="cnpj-agora">↻ Atualizar agora</button>' : '') + '</div>' });
  const sv = j.querySelector('#cnpj-salvar');
  if (sv) sv.onclick = () => comBotao(sv, async () => {
    const f = j.querySelector('#f-cnpj');
    await q(sb.rpc('salvar_config_cnpj', { p: { provedor: f.provedor.value, token: f.token.value.trim() } }));
    aviso('✓ API do cartão CNPJ salva.');
  });
  const ag = j.querySelector('#cnpj-agora');
  if (ag) ag.onclick = () => comBotao(ag, async () => {
    const r = await chamarFuncao('erp-cnpj', { acao: 'rodar' });
    aviso('✓ Cartão CNPJ: ' + (r.mensagem || 'feito') + '.'); fecharJanela(j); await TELAS.alertas();
  });
}
