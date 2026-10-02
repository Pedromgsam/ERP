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
  update perfis set papel='equipe', funcoes='{\"financeiro_juridico\":\"editar\",\"financeiro_contab\":\"editar\",\"contratos\":\"editar\",\"clientes\":\"editar\",\"juridico\":\"editar\",\"tarefas\":\"editar\",\"documentos\":\"editar\",\"crm\":\"editar\",\"relatorios\":\"editar\"}' where email='equipe@teste';" >/dev/null
# os testes enviam e-mails de mentira: a pausa do Backup 19 fica desligada aqui (tem teste próprio em emails.test.js)
$P -d erp -c "update configuracoes set valor='false'::jsonb where chave='emails_pausados'" >/dev/null
# o modo teste do Backup 33 desliga as rotinas de e-mail ao cliente: nos testes elas voltam como estavam
$P -d erp -c "update regras_tarefas set ligada=true where chave in (select jsonb_array_elements_text(valor) from configuracoes where chave='b33_modo_teste_emails')" >/dev/null
# Backup 38: no sistema as tarefas automáticas e o e-mail para os clientes estão desligados (tudo vai para um endereço só);
# aqui voltam a funcionar para os testes antigos continuarem valendo (o desligado tem teste próprio no fluxo.sql)
$P -d erp -c "update configuracoes set valor='true'::jsonb where chave='tarefas_automaticas'; update configuracoes set valor='\"\"'::jsonb where chave='email_redirecionar'" >/dev/null
pkill -USR1 -x postgrest 2>/dev/null || true   # PostgREST relê a estrutura
