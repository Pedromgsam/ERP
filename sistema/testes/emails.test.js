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
    ok('equipe (não admin) não dispara envio', x.status === 401);
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
    sql("update perfis set pref_email = pref_email || '{\"mencao\":false}' where email='equipe@teste'");
    sql("insert into notificacoes(usuario_id,tipo,titulo) select id,'mencao','Outra menção' from perfis where email='equipe@teste'");
    ok('preferência desligada: não enfileira', sql("select count(*) from email_fila where assunto='Outra menção'") === '0');
    x = await chamar({ acao: 'teste' }, { Authorization: 'Bearer ' + tokenDe('pedro@teste') });
    ok('admin envia e-mail de teste para si', x.json.enviados === 1 && cartas[cartas.length - 1].to === 'pedro@teste', JSON.stringify(x.json));
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
    // Resend
    sql(`update config_privada set valor='{"provedor":"resend","usuario":"avisos@escritorio.com.br","senha":"re_teste","remetente":"ERP"}' where chave='email'`);
    let pedido = null; ctx._fetch = async (url, o) => { pedido = { url, o }; return new Response('{"id":"1"}', { status: 200 }); };
    sql("insert into notificacoes(usuario_id,tipo,titulo) select id,'tarefa','Via Resend' from perfis where email='pedro@teste'");
    x = await chamar({}, segredo());
    ok('Resend: chama a API com a chave no cabeçalho', pedido && /api\.resend\.com/.test(pedido.url) && pedido.o.headers.Authorization === 'Bearer re_teste' && JSON.parse(pedido.o.body).to[0] === 'pedro@teste');
    ok('senha nunca sai pelo site', sql("select count(*) from information_schema.role_table_grants where table_name='config_privada' and grantee in ('anon','authenticated')") === '0');
  } catch (e) { console.error(e); ok('sem exceção', false); }
  execFileSync('sh', [path.join(__dirname, 'preparar-banco.sh')]);   // devolve o banco limpo para os próximos testes
  r.forEach(([n, c]) => console.log((c ? 'PASSA  ' : 'FALHOU ') + n));
  const f = r.filter((y) => !y[1]).length;
  console.log('\n' + (r.length - f) + ' passaram, ' + f + ' falharam');
  process.exit(f ? 1 : 0);
})();
