// Teste da função de e-mails (supabase/functions/erp-emails/index.ts) no Node, contra o banco de teste.
// O "carteiro" é falso: guarda as mensagens em vez de enviar.
const path = require('path');
const { execFileSync } = require('child_process');
const BASE = process.env.BASE || 'http://127.0.0.1:8090';
const sql = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-p', process.env.PGPORT || '54329', '-U', 'postgres', '-d', 'erp', '-v', 'ON_ERROR_STOP=1', '-tAc', q]).toString().trim();
const r = []; const ok = (n, c, extra) => { r.push([n, !!c]); if (!c && extra !== undefined) console.log('   ↳', n, '→', extra); };
const F = require('./funcao-emails.js').carregar(BASE);
const { cartas, estado, ctx, jwt } = F;
const falharEm = (v) => { estado.falhar = v; };
const chamar = (corpo, cab) => F.tratar(new Request('http://x/erp-emails', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, cab || {}), body: JSON.stringify(corpo || {}) })).then(async (res) => ({ status: res.status, json: await res.json() }));
const segredo = () => ({ 'x-erp-segredo': sql("select valor #>> '{}' from config_privada where chave='segredo_funcoes'") });
const tokenDe = (email) => jwt({ sub: sql("select id from perfis where email='" + email + "'"), email, role: 'authenticated', aud: 'authenticated', exp: 9999999999 });

(async () => {
  try {
    execFileSync('sh', [path.join(__dirname, 'preparar-banco.sh')]);
    await new Promise((ok) => setTimeout(ok, 1200));
    let x = await chamar({}, {});
    ok('sem segredo nem login: recusa', x.status === 401);
    x = await chamar({}, { Authorization: 'Bearer ' + tokenDe('equipe@teste') });
    ok('Backup 42: equipe pode mandar a fila na hora (só "enviar")', x.status === 200);
    x = await chamar({ acao: 'teste' }, { Authorization: 'Bearer ' + tokenDe('equipe@teste') });
    ok('equipe (não admin) não manda e-mail de teste nem resumo', x.status === 403);
    x = await chamar({}, segredo());
    ok('sem configuração: avisa para configurar', /não configurado/.test(x.json.aviso || ''), JSON.stringify(x.json));
    sql(`insert into config_privada(chave,valor) values ('email','{"provedor":"gmail","usuario":"escritorio@gmail.com","senha":"abcd efgh ijkl mnop","remetente":"ERP Araújo & Castro"}')
         on conflict (chave) do update set valor=excluded.valor`);
    sql("insert into notificacoes(usuario_id,tipo,titulo,detalhe) select id,'mencao','Pedro Castro mencionou você em: Minuta','revisar' from perfis where email='equipe@teste'");
    ok('menção vira e-mail na fila', sql("select count(*) from email_fila where status='pendente' and para='equipe@teste'") === '1');
    x = await chamar({}, segredo());
    ok('rotina envia pelo Gmail (smtp.gmail.com:465) com remetente do escritório', x.json.enviados === 1 && cartas[0]._host === 'smtp.gmail.com' && cartas[0]._porta === 465 &&
      /ERP Araújo & Castro/.test(cartas[0].from) && cartas[0].to === 'equipe@teste' && /mencionou/.test(cartas[0].subject), JSON.stringify(x.json));
    ok('e-mail marcado como enviado', sql("select status from email_fila where para='equipe@teste'") === 'enviado');
    // Backup 28: cliente da Contabilidade sai pela conta da Contabilidade
    sql(`insert into config_privada(chave,valor) values ('email_contab','{"provedor":"gmail","usuario":"contabilidade@gmail.com","senha":"zzzz","remetente":"Contabilidade A&C"}') on conflict (chave) do update set valor=excluded.valor`);
    sql("insert into email_fila(para,assunto,html,tipo,conta) values ('cli@contab.teste','Cobrança contábil B28','<p>x</p>','cliente','contabilidade'),('cli@escr.teste','Cobrança escritório B28','<p>x</p>','cliente','escritorio')");
    x = await chamar({}, segredo());
    const cc = cartas.find((c) => c.subject === 'Cobrança contábil B28'), ce = cartas.find((c) => c.subject === 'Cobrança escritório B28');
    ok('conta "contabilidade" sai pelo e-mail da Contabilidade; o resto pelo do escritório', !!cc && /contabilidade@gmail\.com/.test(cc.from) && /Contabilidade A&C/.test(cc.from) && !!ce && /escritorio@gmail\.com/.test(ce.from),
      JSON.stringify([cc && cc.from, ce && ce.from]));
    sql("delete from config_privada where chave='email_contab'");
    sql("update perfis set pref_email = pref_email || '{\"mencao\":false}' where email='equipe@teste'");
    sql("insert into notificacoes(usuario_id,tipo,titulo) select id,'mencao','Outra menção' from perfis where email='equipe@teste'");
    ok('preferência desligada: não enfileira', sql("select count(*) from email_fila where assunto='Outra menção'") === '0');
    x = await chamar({ acao: 'teste' }, { Authorization: 'Bearer ' + tokenDe('pedro@teste') });
    ok('admin envia e-mail de teste para si', x.json.enviados === 1 && cartas[cartas.length - 1].to === 'pedro@teste', JSON.stringify(x.json));
    // Backup 19: com o envio pausado, nada sai; o admin libera um a um
    sql("update configuracoes set valor='true'::jsonb where chave='emails_pausados'");
    sql("insert into notificacoes(usuario_id,tipo,titulo) select id,'mencao','Menção na pausa' from perfis where email='pedro@teste'");
    x = await chamar({}, segredo());
    ok('envio pausado: o e-mail fica retido e não sai', sql("select status from email_fila where assunto='Menção na pausa'") === 'retido' && !cartas.some((c) => c.subject === 'Menção na pausa'));
    const idRet = sql("select id from email_fila where assunto='Menção na pausa'");
    sql("select set_config('request.jwt.claims', json_build_object('sub', (select id::text from perfis where email='pedro@teste'))::text, false); select public.emails_retidos_acao(array['" + idRet + "']::uuid[], 'liberar')");
    x = await chamar({}, segredo());
    ok('retido liberado pelo admin sai mesmo com a pausa', sql("select status from email_fila where id='" + idRet + "'") === 'enviado' && cartas.some((c) => c.subject === 'Menção na pausa'));
    sql("update configuracoes set valor='false'::jsonb where chave='emails_pausados'");
    falharEm(true);
    sql("insert into notificacoes(usuario_id,tipo,titulo) select id,'tarefa','Tarefa nova X' from perfis where email='pedro@teste'");
    for (let i = 0; i < 3; i++) await chamar({}, segredo());
    ok('falha no envio: tenta 3 vezes e marca erro com o motivo', sql("select status||'|'||tentativas||'|'||erro from email_fila where assunto='Tarefa nova X'") === 'erro|3|SMTP recusou a senha');
    falharEm(false);
    sql("insert into tarefas(titulo,responsavel,prazo) values ('Prazo vencido teste','Pedro',current_date - 2)");
    x = await chamar({ acao: 'resumo' }, { Authorization: 'Bearer ' + tokenDe('pedro@teste') });
    const resumo = cartas.find((c) => /Resumo do dia/.test(c.subject));
    ok('resumo do dia com os prazos atrasados da pessoa', !!resumo && /Prazo vencido teste/.test(resumo.html) && /atrasada/.test(resumo.html));
    await chamar({ acao: 'resumo' }, { Authorization: 'Bearer ' + tokenDe('pedro@teste') });
    ok('resumo não duplica no mesmo dia', cartas.filter((c) => /Resumo do dia/.test(c.subject) && c.to === 'pedro@teste').length === 1);
    // Backup 44: rascunho no Gmail (IMAP) — não envia, grava na pasta Rascunhos
    const { rascunhos } = F;
    sql("insert into email_fila(para,assunto,html,tipo,referencia,status) values ('cli@rasc.teste','Guias B44 rascunho','<p>Segue a guia</p>','cliente','guias:b44','rascunho')");
    const nCartas = cartas.length;
    x = await chamar({ acao: 'rascunho', ref: 'guias:b44' }, { Authorization: 'Bearer ' + tokenDe('equipe@teste') });
    ok('Backup 44: rascunho vai para a pasta Rascunhos do Gmail (imap.gmail.com:993), sem enviar', x.status === 200 && x.json.rascunhos === 1 && rascunhos.length === 1 &&
      rascunhos[0].host === 'imap.gmail.com' && rascunhos[0].porta === 993 && rascunhos[0].pasta === '[Gmail]/Rascunhos' && /Subject: Guias B44 rascunho/.test(rascunhos[0].raw) &&
      /To: cli@rasc\.teste/.test(rascunhos[0].raw) && cartas.length === nCartas, JSON.stringify([x.json, rascunhos.length && rascunhos[0].pasta]));
    ok('Backup 44: rascunho salvo fica marcado (e a rotina não o envia)', sql("select status from email_fila where referencia='guias:b44'") === 'rascunho_salvo' && x.json.item.status === 'rascunho_salvo');
    await chamar({}, segredo());
    ok('Backup 44: e-mail "rascunho" nunca sai pela rotina', !cartas.some((c) => c.subject === 'Guias B44 rascunho'));
    estado.senhaImap = 'outra-senha';
    sql("insert into email_fila(para,assunto,html,tipo,referencia,status) values ('cli@rasc.teste','Guias B44 senha','<p>x</p>','cliente','guias:b44b','rascunho')");
    x = await chamar({ acao: 'rascunho', ref: 'guias:b44b' }, segredo());
    ok('Backup 44: senha recusada pelo Gmail → explica e o rascunho fica pendente', x.json.erros === 1 && /recusou o login/.test(x.json.ultimoErro) && sql("select status from email_fila where referencia='guias:b44b'") === 'rascunho', JSON.stringify(x.json));
    estado.senhaImap = null;
    // Resend
    sql(`update config_privada set valor='{"provedor":"resend","usuario":"avisos@escritorio.com.br","senha":"re_teste","remetente":"ERP"}' where chave='email'`);
    let pedido = null; ctx._fetch = async (url, o) => { pedido = { url, o }; return new Response('{"id":"1"}', { status: 200 }); };
    sql("insert into notificacoes(usuario_id,tipo,titulo) select id,'tarefa','Via Resend' from perfis where email='pedro@teste'");
    x = await chamar({}, segredo());
    ok('Resend: chama a API com a chave no cabeçalho', pedido && /api\.resend\.com/.test(pedido.url) && pedido.o.headers.Authorization === 'Bearer re_teste' && JSON.parse(pedido.o.body).to[0] === 'pedro@teste');
    // recibo: "Recebido" gera o e-mail com o PDF anexo (valor por extenso, emitente)
    sql("update regras_tarefas set ligada=true where chave='email_pagamento_recebido'");
    sql("insert into clientes(nome,email,cpf_cnpj) values ('Recibo Teste Ltda','recibo@cliente.test','11222333000181')");
    sql("insert into lancamentos(empresa,tipo,descricao,cliente_id,vencimento,valor,responsavel) select 'escritorio','receita','Honorários recibo',id,current_date,1500,'Pedro' from clientes where nome='Recibo Teste Ltda'");
    sql("update lancamentos set pago=true, data_pagamento=current_date where descricao='Honorários recibo'");
    ok('recibo: entra na fila com o anexo e o valor por extenso', sql("select (anexo->>'tipo')||'|'||(anexo->'dados'->>'extenso') from email_fila where para='recibo@cliente.test'") === 'recibo|mil e quinhentos reais');
    x = await chamar({}, segredo());
    const corpoR = pedido && JSON.parse(pedido.o.body), anx = corpoR && corpoR.attachments && corpoR.attachments[0];
    const pdf = anx ? Buffer.from(anx.content, 'base64').toString('latin1') : '';
    ok('recibo: vai com o PDF anexo (Resend)', corpoR && corpoR.to[0] === 'recibo@cliente.test' && /\.pdf$/.test(anx.filename) && /^%PDF-1\.4/.test(pdf) && /RECIBO/.test(pdf) && /quinhentos/.test(pdf) && /%%EOF$/.test(pdf), anx && anx.filename);
    ok('senha nunca sai pelo site', sql("select count(*) from information_schema.role_table_grants where table_name='config_privada' and grantee in ('anon','authenticated')") === '0');
  } catch (e) { console.error(e); ok('sem exceção', false); }
  execFileSync('sh', [path.join(__dirname, 'preparar-banco.sh')]);   // devolve o banco limpo para os próximos testes
  r.forEach(([n, c]) => console.log((c ? 'PASSA  ' : 'FALHOU ') + n));
  const f = r.filter((y) => !y[1]).length;
  console.log('\n' + (r.length - f) + ' passaram, ' + f + ' falharam');
  process.exit(f ? 1 : 0);
})();
