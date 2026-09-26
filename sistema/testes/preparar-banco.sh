#!/bin/sh
# Recria o banco de teste "erp" e sobe o PostgREST apontando para ele.
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
P="psql -h 127.0.0.1 -p ${PGPORT:-54329} -U postgres -q -v ON_ERROR_STOP=1"
$P -c "drop database if exists erp with (force)" -c "create database erp" >/dev/null
$P -d erp -f "$DIR/supabase-local.sql" >/dev/null 2>&1
$P -d erp -f "$DIR/../banco/estrutura.sql" >/dev/null 2>&1
$P -d erp -c "insert into auth.users(email,senha_teste,raw_user_meta_data) values
  ('pedro@teste','senha123','{\"nome\":\"Pedro Castro\"}'),
  ('equipe@teste','senha123','{\"nome\":\"Adriana\"}'),
  ('novo@teste','senha123','{\"nome\":\"Novo\"}');
  update perfis set papel='equipe' where email='equipe@teste';" >/dev/null
pkill -USR1 -x postgrest 2>/dev/null || true   # PostgREST relê a estrutura
