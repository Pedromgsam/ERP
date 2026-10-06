#!/bin/sh
# Roda todos os testes do sistema novo. Precisa de NODE_PATH com playwright e exceljs.
# Precisa: PostgreSQL 16 na porta 54329,
# PostgREST na 3001 (config em testes/postgrest.conf) e node servidor-local.js.
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
"$DIR/preparar-banco.sh"
psql -h 127.0.0.1 -p ${PGPORT:-54329} -U postgres -q -c "drop database if exists erp_perm with (force)" -c "create database erp_perm"
psql -h 127.0.0.1 -p ${PGPORT:-54329} -U postgres -q -d erp_perm -f "$DIR/supabase-local.sql" >/dev/null 2>&1
psql -h 127.0.0.1 -p ${PGPORT:-54329} -U postgres -q -d erp_perm -f "$DIR/../banco/estrutura.sql" >/dev/null 2>&1
psql -h 127.0.0.1 -p ${PGPORT:-54329} -U postgres -q -d erp_perm -c "update configuracoes set valor='true'::jsonb where chave='tarefas_automaticas'; update configuracoes set valor='\"\"'::jsonb where chave='email_redirecionar'" >/dev/null   # Backup 38: desligadas no sistema; os testes antigos de regras continuam valendo
psql -h 127.0.0.1 -p ${PGPORT:-54329} -U postgres -q -d erp_perm -f "$DIR/permissoes.sql" 2>&1 | grep -oE "(PASSA|FALHOU).*" 
# Backup 26: fluxo cliente → financeiro (cadastro, CRM, reunião, assinatura, e-mails, delegar/validar)
psql -h 127.0.0.1 -p ${PGPORT:-54329} -U postgres -q -c "drop database if exists erp_fluxo with (force)" -c "create database erp_fluxo"
psql -h 127.0.0.1 -p ${PGPORT:-54329} -U postgres -q -d erp_fluxo -f "$DIR/supabase-local.sql" >/dev/null 2>&1
psql -h 127.0.0.1 -p ${PGPORT:-54329} -U postgres -q -d erp_fluxo -f "$DIR/../banco/estrutura.sql" >/dev/null 2>&1
# o modo teste de e-mails (Backup 33) desliga as rotinas de e-mail ao cliente: aqui elas voltam como estavam
psql -h 127.0.0.1 -p ${PGPORT:-54329} -U postgres -q -d erp_fluxo -c "update regras_tarefas set ligada=true where chave in (select jsonb_array_elements_text(valor) from configuracoes where chave='b33_modo_teste_emails')" >/dev/null
if ! psql -h 127.0.0.1 -p ${PGPORT:-54329} -U postgres -q -At -v ON_ERROR_STOP=1 -d erp_fluxo -f "$DIR/fluxo.sql" > /tmp/erp-fluxo.out 2>&1; then
  grep -E "FALHA|ERROR|FALHOU" /tmp/erp-fluxo.out; exit 1
fi
echo "fluxo: $(grep -c '^PASSA' /tmp/erp-fluxo.out) passaram, 0 falharam"
# Backup 46: automações nunca usadas somem (com histórico) e o reset para uso real deixa só o Pedro e as configurações
Q="psql -h 127.0.0.1 -p ${PGPORT:-54329} -U postgres -q -At -d erp_fluxo"
$Q -c "delete from configuracoes where chave='b46_automacoes'; insert into automacoes_log (chave) values ('cob:teste-b46')" >/dev/null
$Q -f "$DIR/../banco/estrutura.sql" >/dev/null 2>&1
R=$($Q -c "select (select not oculta from regras_tarefas where chave='cobrar_honorario') and (select count(*) from regras_tarefas where oculta and not ligada) > 0 and not exists (select 1 from regras_tarefas where oculta and ligada)")
[ "$R" = "t" ] && echo "PASSA automações: as nunca usadas saem da tela e ficam desligadas" || { echo "FALHOU automações nunca usadas ($R)"; exit 1; }
$Q -c "insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'pedro.reset@teste') on conflict do nothing; insert into perfis (id, nome, email, papel) values ('00000000-0000-0000-0000-0000000000a1', 'Pedro Reset', 'pedro.reset@teste', 'admin') on conflict (id) do update set nome='Pedro Reset', papel='admin'; update perfis set nome='Outra Pessoa' where nome ilike 'pedro%' and id <> '00000000-0000-0000-0000-0000000000a1'" >/dev/null
$Q -v ON_ERROR_STOP=1 -f "$DIR/../banco/reset-para-uso-real.sql" >/dev/null 2>&1 || { echo "FALHOU reset-para-uso-real.sql"; exit 1; }
R=$($Q -c "select (select count(*) from clientes) + (select count(*) from tarefas) + (select count(*) from lancamentos) + (select count(*) from grupos) = 0 and (select string_agg(nome, ',') from perfis) = 'Pedro Reset' and (select count(*) from auth.users) = 1 and (select count(*) from regras_tarefas) > 0 and (select count(*) from emails_modelos) > 0")
[ "$R" = "t" ] && echo "PASSA reset para uso real: só o Pedro, dados zerados, configurações mantidas" || { echo "FALHOU reset para uso real ($R)"; exit 1; }
# espera o PostgREST reler a estrutura (responde "permission denied" = pronto)
for i in 1 2 3 4 5 6 7 8 9 10; do
  curl -s http://127.0.0.1:3001/perfis | grep -q 42501 && break; sleep 1
done
node "$DIR/importador.test.js"
node "$DIR/emails.test.js"
node "$DIR/telas.js"
node "$DIR/erp.js"
node "$DIR/documentos.js"
node "$DIR/visual.js"
node "$DIR/padrao.js"
node "$DIR/caca-bugs.js"
