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
  // PGFN (dívida ativa, API paga do SERPRO): só aparece depois de configurada, ou para o admin configurar
  const pgfnCfg = await q(sb.rpc('status_config_pgfn')).catch(() => null) || {};
  const pgfnEx = pgfnCfg.tem_chave ? await q(sb.from('pgfn_execucoes').select('*').order('inicio', { ascending: false }).limit(10)).catch(nada) : [];
  if (pgfnCfg.tem_chave) {   // sem SERPRO contratado o cartão fica escondido (decisão do escritório)
    const u = pgfnEx[0];
    add('Rotinas', 'PGFN — dívida ativa', !pgfnCfg.tem_chave ? 'não contratada' : !pgfnCfg.ligada ? 'desligada' : u ? quandoCurto(u.inicio) : 'nunca rodou',
      !pgfnCfg.tem_chave ? 'API paga do SERPRO: clique para ver como ligar' : u ? u.mensagem || u.status : 'frequência: ' + (pgfnCfg.frequencia || 'diaria'),
      !pgfnCfg.tem_chave ? 'info' : u && u.status === 'erro' ? 'critico' : u && u.status === 'parcial' ? 'atencao' : 'ok', { pgfn: true });
  }
  if (emails.length || (E.perfil && E.perfil.papel === 'admin')) add('Rotinas', 'E-mails com erro', String(emails.length), 'não saíram depois de 3 tentativas', emails.length ? 'critico' : 'ok',
    { titulo: 'E-mails com erro', colunas: ['Quando', 'Para', 'Assunto', 'Erro'], linhas: emails.map((m) => [quandoRodou(m.criado_em), m.para, m.assunto, m.erro]) });
  if (podeJur) add('Rotinas', 'Busca de publicações', ultPub && ultPub.valor ? quandoCurto(ultPub.valor.quando) : 'nunca rodou',
    ultPub && ultPub.valor ? ultPub.valor.novas + ' nova(s) · ' + ((ultPub.valor.erros || []).length ? '⚠ ' + ultPub.valor.erros[0] : 'sem erro') : 'cadastre as OABs em Publicações',
    !ultPub || !ultPub.valor ? 'atencao' : (ultPub.valor.erros || []).length ? 'critico' : 'ok', { tela: 'publicacoes' });
  // PGFN pelos dados abertos (gratuito, sem SERPRO): o admin importa o arquivo público
  if (E.perfil && E.perfil.papel === 'admin') {
    const ua = await q(sb.from('configuracoes').select('valor').eq('chave', 'pgfn_abertos_ultima').maybeSingle()).catch(() => null);
    add('Rotinas', 'PGFN — dados abertos (grátis)', ua && ua.valor ? quandoCurto(ua.valor.quando) : 'nunca importado', ua && ua.valor ? ua.valor.clientes + ' cliente(s) atualizado(s)' + (ua.valor.referencia ? ' · ' + ua.valor.referencia : '') : 'clique para importar o arquivo público da PGFN',
      ua && ua.valor ? 'ok' : 'info', { pgfnAbertos: true });
  }
  // Central de e-mails: automático por tipo (clicar abre a configuração; admin)
  const cfgEm = await q(sb.rpc('config_emails')).catch(() => null);
  if (cfgEm && E.perfil && E.perfil.papel === 'admin') {
    const ligados = ['honorarios', 'parcelamentos', 'acordos', 'recibos'].filter((k) => cfgEm[k]);
    add('Rotinas', 'E-mails automáticos ao cliente', ligados.length + ' de 4 ligados', (cfgEm.hora ? 'envio às ' + cfgEm.hora : 'envio junto das regras (7h)') + ' · clique para configurar', ligados.length ? 'ok' : 'info', { emailsAuto: true });
  }
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

  // ── desenho: radar no topo, só o que pede ação em destaque; o que está em dia vira selinho verde ──
  const ICONE_SETOR = { Cadastro: '🗂', 'Jurídico': '⚖', Financeiro: '💰', Documentos: '📄', Tarefas: '✅', Rotinas: '⚙' };
  const acao = A.map((a, i) => Object.assign({ i }, a)).filter((a) => a.setor !== 'Rotinas' && (a.nivel === 'critico' || a.nivel === 'atencao'))
    .sort((x, y) => (x.nivel === 'critico' ? 0 : 1) - (y.nivel === 'critico' ? 0 : 1));
  const emDia = A.map((a, i) => Object.assign({ i }, a)).filter((a) => a.setor !== 'Rotinas' && !(a.nivel === 'critico' || a.nivel === 'atencao'));
  const rotinas = A.map((a, i) => Object.assign({ i }, a)).filter((a) => a.setor === 'Rotinas');
  const criticos = A.filter((a) => a.nivel === 'critico').length, atencao = A.filter((a) => a.nivel === 'atencao').length;
  const nota = Math.round(100 * A.filter((a) => a.nivel === 'ok' || a.nivel === 'info').length / (A.length || 1));
  const humor = criticos ? ['critico', criticos + ' ponto(s) pedem ação agora', 'Comece pelos vermelhos: cada um abre a lista pronta para agir.']
    : atencao ? ['atencao', 'Quase tudo em dia', atencao + ' ponto(s) para acompanhar nesta semana.'] : ['ok', 'Tudo em dia! 🎉', 'Nenhum alerta aberto. Bom trabalho.'];
  const setores = [...new Set(acao.map((a) => a.setor))];
  $('al-corpo').innerHTML =
    '<div class="al-radar al-' + humor[0] + '"><div class="al-anel" style="--p:' + nota + '"><div class="al-anel-in"><b>' + nota + '</b><span>em dia</span></div></div>' +
      '<div class="al-radar-txt"><h2>' + esc(humor[1]) + '</h2><p>' + esc(humor[2]) + '</p>' +
      '<div class="al-contas"><span class="al-conta critico">' + criticos + ' crítico(s)</span><span class="al-conta atencao">' + atencao + ' atenção</span><span class="al-conta ok" title="Verificações que o sistema fez e não encontraram nada a fazer (ex.: certidões válidas, nenhum honorário vencido)">' +
        A.filter((a) => a.nivel === 'ok').length + ' verificações sem pendência</span></div>' +
      (setores.length > 1 ? '<div class="al-filtros"><button type="button" class="ativo" data-al-setor="">Todos</button>' + setores.map((st) => '<button type="button" data-al-setor="' + esc(st) + '">' + (ICONE_SETOR[st] || '') + ' ' + esc(st) + '</button>').join('') + '</div>' : '') +
    '</div></div>' +
    (acao.length ? '<div class="al-feed">' + acao.map((a, k) => '<button type="button" class="al-card al-linha al-' + a.nivel + '" data-al="' + a.i + '" data-setor="' + esc(a.setor) + '" style="--k:' + k + '">' +
        '<span class="al-ic" aria-hidden="true">' + (ICONE_SETOR[a.setor] || '•') + '</span><span class="al-meio"><span class="al-rot">' + esc(a.rot) + '</span> <span class="al-det">' + esc(a.setor) + ' · ' + esc(a.det) + '</span></span>' +
        '<span class="al-val">' + esc(a.valor) + '</span><span class="al-ir">Ver →</span></button>').join('') + '</div>' : '') +
    (emDia.length ? '<div class="kpis-titulo">✓ Em dia</div><div class="al-chips">' + emDia.map((a) => '<button type="button" class="al-card al-chip al-' + a.nivel + '" data-al="' + a.i + '" data-setor="' + esc(a.setor) + '" title="' + esc(a.det) + '"><span class="al-rot">' + esc(a.rot) + '</span> <span class="al-val">' + esc(a.valor) + '</span></button>').join('') + '</div>' : '') +
    (rotinas.length ? '<div class="kpis-titulo">⚙ Rotinas automáticas</div><div class="al-rotinas">' + rotinas.map((a) => '<button type="button" class="al-card al-rotina al-' + a.nivel + '" data-al="' + a.i + '"><span class="al-pt" aria-hidden="true"></span><span class="al-rot">' + esc(a.rot) + '</span> <span class="al-val">' + esc(a.valor) + '</span><span class="al-det">' + esc(a.det) + '</span></button>').join('') + '</div>' : '');
  $('al-corpo').querySelectorAll('[data-al-setor]').forEach((b) => b.onclick = () => {
    $('al-corpo').querySelectorAll('[data-al-setor]').forEach((x) => x.classList.toggle('ativo', x === b));
    $('al-corpo').querySelectorAll('.al-linha,.al-chip').forEach((l) => { l.hidden = !!b.dataset.alSetor && l.dataset.setor !== b.dataset.alSetor; });
  });
  $('al-corpo').querySelectorAll('[data-al]').forEach((b) => b.onclick = () => { const a = A[+b.dataset.al]; if (a.rel.cnpj) janelaCnpj(cnpj); else if (a.rel.emailsAuto) janelaAutoEmails(); else if (a.rel.pgfnAbertos) janelaPgfnAbertos(); else if (a.rel.pgfn) janelaPgfn(pgfnEx); else if (a.rel.saude) janelaSaude(a.rel.saude); else if (a.rel.backup) irTelaAlerta('admin', 'backup'); else relatorioAlerta(a); });
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
  const j = relatorioTabela(Object.assign({}, r, r.tela ? { acao: { rotulo: 'Abrir a tela', fn: () => irTelaAlerta(r.tela) } } : {}));
  // transformar o alerta em tarefa (para o administrador ou o estagiário), com subtarefas e prazos
  const ac = j.querySelector('.janela-rp .acoes');
  if (r.linhas.length && ac) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-o'; b.dataset.virarTarefa = '1'; b.textContent = '📋 Virar tarefa';
    b.onclick = () => { fecharJanela(j); janelaVirarTarefa(a.rot || a.titulo || r.titulo, r); };
    ac.prepend(b);
  }
}
async function janelaVirarTarefa(titulo, r) {
  const linhas = r.linhas.slice(0, 60), rot = (l) => l.filter((v) => v != null && v !== '').slice(0, 3).join(' · ');
  const prazo = somarDias(hojeISO(), 7);
  const j = abrirJanela({ titulo: '📋 Virar tarefa', larga: true,
    corpo: '<form id="f-vt" class="grade">' +
      campo('Tarefa <span class="obrig">*</span>', '<input name="titulo" maxlength="300" value="' + esc(titulo) + '">', 'inteiro') +
      campo('Quem faz', selectPessoa('responsavel', '', '— escolha —')) +
      campo('Prazo da tarefa', '<input name="prazo" type="date" value="' + prazo + '">') +
      campo('Prioridade', '<select name="prioridade"><option value="media">Média</option><option value="alta">Alta</option><option value="baixa">Baixa</option></select>') +
      campo('Cada linha do alerta vira', '<select name="modo"><option value="sub">Uma subtarefa (com prazo próprio)</option><option value="check">Um item do checklist</option><option value="nada">Nada (só a tarefa)</option></select>') +
      campo('Prazo de cada subtarefa', '<input name="prazo_sub" type="date" value="' + prazo + '">') +
      '<div class="inteiro"><div class="secao">Linhas (' + linhas.length + (r.linhas.length > linhas.length ? ' de ' + r.linhas.length : '') + ') — desmarque o que não entra</div>' +
      '<div class="lista-ficha" style="max-height:34vh;overflow:auto">' + linhas.map((l, i) => '<label class="check item-ficha"><input type="checkbox" data-vt="' + i + '" checked> ' + esc(rot(l)) + '</label>').join('') + '</div></div>' +
      '</form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" id="vt-cancelar">Cancelar</button><button class="btn btn-p" type="button" id="vt-salvar">Criar tarefa</button></div>' });
  j.querySelector('#vt-cancelar').onclick = () => fecharJanela(j);
  j.querySelector('#vt-salvar').onclick = (ev) => comBotao(ev.target, async () => {
    const f = j.querySelector('#f-vt'), marc = [...j.querySelectorAll('[data-vt]:checked')].map((c) => linhas[+c.dataset.vt]);
    const t = { titulo: f.titulo.value.trim(), responsavel: f.responsavel.value, prazo: f.prazo.value || null, prioridade: f.prioridade.value, status: 'pendente',
      descricao: 'Criada a partir do alerta "' + titulo + '".', checklist: f.modo.value === 'check' ? marc.map((l) => ({ texto: rot(l), feito: false })) : [] };
    if (!t.titulo) throw new Error('Informe o nome da tarefa.');
    if (!t.responsavel) throw new Error('Escolha quem faz.');
    const nova = (await q(sb.from('tarefas').insert(t).select('id')))[0];
    if (f.modo.value === 'sub' && marc.length && nova) await q(sb.from('tarefas').insert(marc.map((l) => ({ titulo: rot(l), responsavel: t.responsavel, prazo: f.prazo_sub.value || t.prazo,
      prioridade: t.prioridade, status: 'pendente', tarefa_pai_id: nova.id }))));
    await notificar(t.responsavel, 'Nova tarefa para você: ' + t.titulo, t.prazo ? 'Prazo ' + dataBR(t.prazo) : '', 'tarefas').catch(() => {});
    aviso('✓ Tarefa criada para ' + t.responsavel + (f.modo.value === 'sub' && marc.length ? ' com ' + marc.length + ' subtarefa(s).' : '.'));
    fecharJanela(j);
  });
}

// PGFN: chave do SERPRO (só admin), frequência, ligar/desligar, consultar agora e o que mudou
async function janelaPgfn(execs) {
  const cfg = await q(sb.rpc('status_config_pgfn')).catch(() => ({})) || {};
  const admin = E.perfil && E.perfil.papel === 'admin', ult = execs[0], mud = ((ult && ult.relatorio) || []).filter((x) => x.antes), err = ((ult && ult.relatorio) || []).filter((x) => x.erro);
  const j = abrirJanela({ titulo: 'PGFN — dívida ativa (API do SERPRO)', larga: true,
    corpo: '<div class="dica" style="margin-bottom:10px">Consulta cada CNPJ na <b>API "Consulta Dívida Ativa" do SERPRO</b> e atualiza sozinho os campos <b>PGFN</b> (em cobrança) e <b>PGFN negociada</b> (parcelada). ' +
        'Na ficha do cliente, a aba <b>PGFN</b> mostra cada inscrição (CDA), a origem (tributária, previdenciária, FGTS, Simples) e se está parcelada. ' +
        '<b>É pago por consulta</b> (tabela na Loja SERPRO): consulta diária de 100 CNPJs são cerca de 2.200 consultas/mês. Semanal ou mensal custa bem menos.</div>' +
      (ult ? '<div class="dica" style="margin-bottom:10px"><b>Última execução:</b> ' + quandoRodou(ult.inicio) + ' · ' + esc(ult.mensagem || ult.status) + '</div>' : '') +
      (mud.length ? '<div class="secao">Mudanças na última consulta (' + mud.length + ')</div><div class="tabela-wrap"><table><thead><tr><th>Empresa</th><th class="num">PGFN antes</th><th class="num">agora</th><th class="num">Negociada antes</th><th class="num">agora</th></tr></thead><tbody>' +
        mud.map((x) => '<tr><td><b>' + esc(x.nome) + '</b></td><td class="num mono">' + brl(x.antes[0]) + '</td><td class="num mono"><b>' + brl(x.depois[0]) + '</b></td><td class="num mono">' + brl(x.antes[1]) + '</td><td class="num mono"><b>' + brl(x.depois[1]) + '</b></td></tr>').join('') + '</tbody></table></div>' : '') +
      (err.length ? '<div class="secao">Erros (' + err.length + ')</div><div class="lista-ficha">' + err.map((x) => '<div class="item-ficha"><div><b>' + esc(x.nome) + '</b><div class="sub">' + esc(x.erro) + '</div></div></div>').join('') + '</div>' : '') +
      (admin ? '<div class="secao">Configuração</div><form class="grade" id="f-pgfn">' +
        campo('Consumer key (área do cliente SERPRO)', '<input name="ck" autocomplete="off" placeholder="' + (cfg.tem_chave ? '•••• (deixe vazio para manter)' : 'cole aqui') + '">') +
        campo('Consumer secret', '<input name="cs" type="password" autocomplete="new-password" placeholder="' + (cfg.tem_chave ? '•••• (deixe vazio para manter)' : 'cole aqui') + '">') +
        campo('Frequência', selectPares('frequencia', [['diaria', 'Todo dia (6h15)'], ['semanal', 'Toda segunda-feira'], ['mensal', 'Todo dia 1º']], cfg.frequencia || 'diaria')) +
        '<label class="check" style="align-self:end"><input type="checkbox" name="ligada"' + (cfg.ligada ? ' checked' : '') + '> Rotina ligada</label></form>' : ''),
    rodape: '<span></span><div class="acoes">' + (admin ? '<button class="btn btn-o" type="button" id="pgfn-salvar">Salvar</button><button class="btn btn-p" type="button" id="pgfn-agora"' + (cfg.tem_chave ? '' : ' disabled') + '>↻ Consultar agora</button>' : '') + '</div>' });
  const sv = j.querySelector('#pgfn-salvar');
  if (sv) sv.onclick = () => comBotao(sv, async () => {
    const f = j.querySelector('#f-pgfn');
    await q(sb.rpc('salvar_config_pgfn', { p: { consumer_key: f.ck.value.trim(), consumer_secret: f.cs.value.trim(), frequencia: f.frequencia.value, ligada: f.ligada.checked } }));
    aviso('✓ PGFN: configuração salva.'); fecharJanela(j); await TELAS.alertas();
  });
  const ag = j.querySelector('#pgfn-agora');
  if (ag) ag.onclick = () => comBotao(ag, async () => {
    const r = await chamarFuncao('erp-pgfn', { acao: 'rodar' });
    if (r && r.erro) throw new Error(r.erro);
    aviso('✓ PGFN: ' + ((r && r.mensagem) || 'feito') + '.'); fecharJanela(j); await carregarCadastros(true); await TELAS.alertas();
  });
}

// Cartão CNPJ: última execução, o que mudou, erros, histórico e a API usada
async function janelaCnpj(execs) {
  const cfg = await q(sb.rpc('status_config_cnpj')).catch(() => ({})) || {};
  const admin = E.perfil && E.perfil.papel === 'admin', ult = execs[0];
  const rel = (ult && ult.relatorio) || [];
  const alt = rel.filter((x) => x.mudancas && !x.primeira), err = rel.filter((x) => x.erro), agu = rel.filter((x) => x.aguardando);
  const j = abrirJanela({ titulo: 'Cartão CNPJ — atualização diária (6h)', larga: true,
    corpo: (ult ? '<div class="dica" style="margin-bottom:10px"><b>Última execução:</b> ' + quandoRodou(ult.inicio) + ' · ' + ({ ok: '✅ sem erro', parcial: '⚠ com alguns erros', erro: '❌ com erro', rodando: '⏳ rodando' }[ult.status] || ult.status) +
        ' · ' + esc(ult.mensagem) + ' · API: ' + esc(ult.provedor) + '</div>' : '<div class="dica" style="margin-bottom:10px">Ainda não rodou. Publique a função <b>erp-cnpj</b> no Supabase e clique em "Atualizar agora".</div>') +
      '<div class="secao">Alterações encontradas (' + alt.length + ')</div>' +
      (alt.length ? '<div class="tabela-wrap"><table><thead><tr><th>Entidade</th><th>Campo</th><th>Antes</th><th>Agora</th></tr></thead><tbody>' +
        alt.flatMap((x) => x.mudancas.map((m, k) => '<tr>' + (k === 0 ? '<td rowspan="' + x.mudancas.length + '"><b>' + esc(x.nome) + '</b><div class="sub mono">' + esc(mascaraDoc(x.cnpj)) + '</div></td>' : '') +
          '<td>' + esc(m.campo) + '</td><td class="sub">' + esc(m.antes || '—') + '</td><td><b>' + esc(m.depois) + '</b></td></tr>')).join('') + '</tbody></table></div>' : '<div class="sub" style="margin-bottom:8px">Nenhuma alteração.</div>') +
      (agu.length ? '<div class="secao">Aguardando a Receita (' + agu.length + ')</div><div class="dica" style="margin-bottom:8px">Empresa recém-aberta ainda não aparece na base pública da Receita (ela é publicada uma vez por mês). ' +
        'O sistema já tentou as fontes reserva e tenta de novo todo dia; enquanto isso, preencha o cadastro à mão se precisar.</div><div class="lista-ficha">' +
        agu.map((x) => '<div class="item-ficha"><div><b>' + esc(x.nome) + '</b> <span class="sub mono">' + esc(mascaraDoc(x.cnpj)) + '</span></div></div>').join('') + '</div>' : '') +
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


// ─────────── PGFN pelos dados abertos (Backup 16) ───────────
// A PGFN publica, de graça, a lista de todos os devedores inscritos em dívida ativa (atualizada a cada trimestre).
// Não existe consulta gratuita "por CNPJ" em tempo real (essa é a API paga do SERPRO): aqui o arquivo é lido
// no próprio navegador, linha a linha, e só os CPFs/CNPJs dos clientes são aproveitados.
async function janelaPgfnAbertos() {
  await carregarCadastros();
  const j = abrirJanela({ titulo: 'PGFN — dados abertos (gratuito)', larga: true,
    corpo: '<ol class="passos"><li>Abra <a href="https://www.gov.br/pgfn/pt-br/assuntos/divida-ativa-da-uniao/transparencia-fiscal-1/dados-abertos" target="_blank" rel="noopener">gov.br/pgfn → Dados abertos</a> e baixe os arquivos da <b>Dívida Ativa</b> (Não previdenciário, Previdenciário e FGTS) do trimestre mais recente.</li>' +
      '<li><b>Mais atual (atualiza com frequência):</b> no site <a href="https://www.dividaaberta.pgfn.gov.br/consultar-devedores" target="_blank" rel="noopener">Dívida Aberta</a>, pesquise (por nome, CNPJ ou por estado/município), clique em <b>Exportar (CSV)</b> e escolha esse arquivo abaixo — o ERP entende os dois formatos. Nesse caso <b>não</b> marque "Zerar".</li>' +
      '<li>Descompacte (botão direito → Extrair tudo). Dentro há arquivos <b>.csv</b> (às vezes um por estado).</li><li>Escolha abaixo os .csv (pode marcar vários) e clique em <b>Ler e atualizar</b>. Arquivos grandes levam alguns minutos; a tela mostra o andamento.</li></ol>' +
      '<div class="grade"><div class="campo inteiro"><span>Arquivos .csv da PGFN</span><input type="file" id="pa-arq" accept=".csv,.txt" multiple></div>' +
      '<label class="check inteiro"><input type="checkbox" id="pa-zerar"> Zerar a PGFN dos clientes com CPF/CNPJ que <b>não</b> aparecem nos arquivos (use só se importou todos os arquivos do trimestre)</label></div>' +
      '<div id="pa-prog" class="dica" style="margin-top:10px">Nada lido ainda.</div>',
    rodape: '<span class="sub">Custo: zero. Dados abertos: trimestral · Dívida Aberta (CSV do site): atualização frequente.</span><button class="btn btn-p" type="button" id="pa-ler">Ler e atualizar</button>' });
  j.querySelector('#pa-ler').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const arqs = [...j.querySelector('#pa-arq').files]; if (!arqs.length) throw new Error('Escolha pelo menos um arquivo .csv.');
    const porDoc = {}; E.clientes.forEach((c) => { const d = soDigitos(c.cpf_cnpj); if (d.length === 11 || d.length === 14) porDoc[d] = c; });
    const achados = {}; const prog = j.querySelector('#pa-prog');
    let linhas = 0;
    for (const arq of arqs) {
      const natArq = /previd/i.test(arq.name) ? 'Previdenciária' : /fgts/i.test(arq.name) ? 'FGTS' : 'Tributária';
      const r = await lerCsvPgfn(arq, (lin) => {
        const d = soDigitos(lin.CPF_CNPJ); const c = porDoc[d]; if (!c) return;
        const sit = [lin.TIPO_SITUACAO_INSCRICAO, lin.SITUACAO_INSCRICAO].filter(Boolean).join(' — ');
        const v = String(lin.VALOR_CONSOLIDADO || '0'); const valor = /,/.test(v) ? lerValor(v) : parseFloat(v) || 0;
        const dt = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(lin.DATA_INSCRICAO || '');
        (achados[c.id] = achados[c.id] || []).push({ inscricao: lin.NUMERO_INSCRICAO, natureza: /simples/i.test(lin.RECEITA_PRINCIPAL || '') ? 'Simples Nacional' : natArq,
          receita: lin.RECEITA_PRINCIPAL || '', situacao: sit, parcelada: /benef|parcel|negoci|transa/i.test(sit), valor, data: dt ? dt[3] + '-' + dt[2] + '-' + dt[1] : (lin.DATA_INSCRICAO || '').slice(0, 10) });
      }, (n) => { prog.textContent = arq.name + ': ' + (linhas + n).toLocaleString('pt-BR') + ' linhas lidas · ' + Object.keys(achados).length + ' cliente(s) encontrado(s)…'; });
      linhas += r;
    }
    const lote = Object.entries(achados).map(([cliente_id, inscricoes]) => ({ cliente_id, inscricoes }));
    if (j.querySelector('#pa-zerar').checked) Object.values(porDoc).forEach((c) => { if (!achados[c.id]) lote.push({ cliente_id: c.id, inscricoes: [] }); });
    if (!lote.length) { prog.textContent = linhas.toLocaleString('pt-BR') + ' linhas lidas. Nenhum cliente encontrado nos arquivos.'; return; }
    for (let i = 0; i < lote.length; i += 50) await q(sb.rpc('pgfn_importar_abertos', { p: lote.slice(i, i + 50), p_referencia: arqs.map((a) => a.name).join(', ').slice(0, 120) }));
    await carregarCadastros(true);
    prog.innerHTML = '✓ ' + linhas.toLocaleString('pt-BR') + ' linhas lidas · <b>' + Object.keys(achados).length + '</b> cliente(s) com inscrição · PGFN e PGFN negociada atualizados. A ficha do cliente → aba PGFN mostra cada inscrição.';
    aviso('✓ PGFN atualizada pelos dados abertos.');
  });
}
// lê o CSV em partes (arquivos de centenas de MB) e chama "cada" para cada linha como objeto {COLUNA: valor}
// aceita o arquivo dos dados abertos (CPF_CNPJ, VALOR_CONSOLIDADO…) e o CSV exportado no site "Dívida Aberta"
// (colunas com nomes por extenso, ex.: "CPF/CNPJ", "Nº Inscrição", "Valor Consolidado", "Situação")
function cabecalhoPgfn(c) {
  const t = c.replace(/^"|"$/g, '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (/^(CPF|CNPJ)/.test(t) || t === 'DOCUMENTO') return 'CPF_CNPJ';
  if (/DATA.*INSCRI/.test(t)) return 'DATA_INSCRICAO';
  if (/^(N|NUM|NUMERO|NO)_?INSCRI/.test(t) || t === 'INSCRICAO') return 'NUMERO_INSCRICAO';
  if (/^VALOR/.test(t)) return 'VALOR_CONSOLIDADO';
  if (/^TIPO_SITUA/.test(t)) return 'TIPO_SITUACAO_INSCRICAO';
  if (/SITUA/.test(t)) return 'SITUACAO_INSCRICAO';
  if (/RECEITA/.test(t)) return 'RECEITA_PRINCIPAL';
  return t;
}
async function lerCsvPgfn(arq, cada, andamento) {
  const leitor = arq.stream().getReader();
  let dec = new TextDecoder('utf-8'), resto = '', cab = null, sep = ';', n = 0, primeiro = true;
  for (;;) {
    const { value, done } = await leitor.read();
    if (value && primeiro) { primeiro = false; const t = new TextDecoder('utf-8').decode(value.slice(0, 4096)); if (t.includes('�')) dec = new TextDecoder('iso-8859-1'); }
    const txt = resto + (value ? dec.decode(value, { stream: true }) : dec.decode());
    const partes = txt.split(/\r?\n/); resto = done ? '' : partes.pop();
    for (const l of partes) {
      if (!l.trim()) continue;
      if (!cab) { sep = (l.match(/;/g) || []).length >= (l.match(/,/g) || []).length ? ';' : ','; cab = l.split(sep).map((c) => cabecalhoPgfn(c)); continue; }
      const cols = l.split(sep).map((c) => c.replace(/^"|"$/g, '').trim()), o = {};
      cab.forEach((c, i) => { o[c] = cols[i]; }); cada(o); n++;
    }
    if (andamento && n % 50000 < 5000) andamento(n);
    if (done) break;
  }
  if (!cab || !cab.includes('CPF_CNPJ')) throw new Error('"' + arq.name + '" não parece o arquivo da PGFN (falta a coluna CPF_CNPJ).');
  andamento && andamento(n);
  return n;
}
