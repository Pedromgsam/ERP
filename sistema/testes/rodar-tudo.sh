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
psql -h 127.0.0.1 -p ${PGPORT:-54329} -U postgres -q -d erp_perm -f "$DIR/permissoes.sql" 2>&1 | grep -oE "(PASSA|FALHOU).*" 
# espera o PostgREST reler a estrutura (responde "permission denied" = pronto)
for i in 1 2 3 4 5 6 7 8 9 10; do
  curl -s http://127.0.0.1:3001/perfis | grep -q 42501 && break; sleep 1
done
node "$DIR/importador.test.js"
node "$DIR/emails.test.js"
node "$DIR/telas.js"
node "$DIR/erp.js"
node "$DIR/visual.js"
