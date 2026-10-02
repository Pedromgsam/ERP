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
