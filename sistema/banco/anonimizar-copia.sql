-- ════════════════════════════════════════════════════════════════════════════
-- O2 — CÓPIA ANONIMIZADA DO BANCO (só para o projeto de TESTE no Supabase)
-- Troca nomes, CPF/CNPJ, e-mails, telefones e endereços por dados fictícios,
-- apaga senhas, chaves e textos com dados de cliente, e desliga as rotinas
-- automáticas (nada sai por e-mail a partir da cópia).
--
-- SEGURANÇA: só roda num banco marcado como teste. Antes, no projeto de TESTE:
--   insert into public.configuracoes (chave, valor) values ('ambiente', '"teste"')
--   on conflict (chave) do update set valor = excluded.valor;
-- No banco de verdade essa linha não existe, então o script para logo no começo.
-- Pode rodar várias vezes (idempotente). Passo a passo: sistema/COMO-ATUALIZAR.md (Backup 66).
-- ════════════════════════════════════════════════════════════════════════════

do $$
begin
  if coalesce((select valor #>> '{}' from public.configuracoes where chave = 'ambiente'), '') <> 'teste' then
    raise exception 'PAROU: este banco não está marcado como TESTE (configuracoes.ambiente). Nada foi alterado.';
  end if;
end $$;

-- muda uma coluna só se a tabela e a coluna existirem (o banco muda com o tempo)
create or replace function pg_temp.anon(p_tab text, p_col text, p_expr text) returns void language plpgsql as $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = p_tab and column_name = p_col) then
    execute format('update public.%I set %I = %s', p_tab, p_col, p_expr);
  end if;
end $$;
create or replace function pg_temp.limpar(p_tab text) returns void language plpgsql as $$
begin
  if to_regclass('public.' || p_tab) is not null then execute format('delete from public.%I', p_tab); end if;
end $$;
-- número fictício estável a partir do id (o mesmo cliente recebe sempre o mesmo número)
create or replace function pg_temp.dig(p_id text, p_n int) returns text language sql immutable as $$
  select lpad((abs(hashtext(p_id)) % (10 ^ least(p_n, 9))::bigint)::text, p_n, '0')
$$;

-- ── grupos e clientes ──
select pg_temp.anon('grupos', 'nome', $x$'Grupo ' || upper(substr(md5(id::text), 1, 4))$x$);
select pg_temp.anon('grupos', 'drive_url', $x$''$x$);
select pg_temp.anon('clientes', 'nome', $x$case when length(regexp_replace(cpf_cnpj, '\D', '', 'g')) = 11 then 'Pessoa ' else 'Empresa ' end || upper(substr(md5(id::text), 1, 6)) || case when length(regexp_replace(cpf_cnpj, '\D', '', 'g')) = 11 then '' else ' Ltda' end$x$);
select pg_temp.anon('clientes', 'razao_social', $x$nome$x$);
select pg_temp.anon('clientes', 'nome_fantasia', $x$''$x$);
select pg_temp.anon('clientes', 'cpf_cnpj', $x$case when cpf_cnpj = '' then '' when length(regexp_replace(cpf_cnpj, '\D', '', 'g')) = 11
  then regexp_replace(pg_temp.dig(id::text, 9) || '00', '(\d{3})(\d{3})(\d{3})(\d{2})', '\1.\2.\3-\4')
  else regexp_replace(pg_temp.dig(id::text, 8) || '000100', '(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})', '\1.\2.\3/\4-\5') end$x$);
select pg_temp.anon('clientes', 'email', $x$case when email = '' then '' else 'cliente-' || substr(md5(id::text), 1, 8) || '@exemplo.teste' end$x$);
select pg_temp.anon('clientes', 'telefone', $x$case when telefone = '' then '' else '(31) 90000-' || pg_temp.dig(id::text, 4) end$x$);
select pg_temp.anon('clientes', 'endereco', $x$case when endereco = '' then '' else 'Rua Fictícia, ' || (abs(hashtext(id::text)) % 900 + 100) end$x$);
select pg_temp.anon('clientes', 'cep', $x$case when cep = '' then '' else '30000-000' end$x$);
select pg_temp.anon('clientes', 'socio_admin', $x$case when socio_admin = '' then '' else 'Sócio ' || upper(substr(md5(id::text || 's'), 1, 4)) end$x$);
select pg_temp.anon('clientes', 'indicado_por', $x$''$x$);
select pg_temp.anon('clientes', 'obs', $x$''$x$);
select pg_temp.anon('clientes', 'historico_cadastral', $x$''$x$);
select pg_temp.anon('clientes', 'cnpj_dados', $x$null$x$);
select pg_temp.anon('clientes', 'drive_url', $x$''$x$);

-- ── contatos, sócios, endereços ──
select pg_temp.anon('contatos', 'nome', $x$case when nome = '' then '' else 'Contato ' || upper(substr(md5(id::text), 1, 4)) end$x$);
select pg_temp.anon('contatos', 'email', $x$case when email = '' then '' else 'contato-' || substr(md5(id::text), 1, 8) || '@exemplo.teste' end$x$);
select pg_temp.anon('contatos', 'telefone', $x$case when telefone = '' then '' else '(31) 90000-' || pg_temp.dig(id::text, 4) end$x$);
select pg_temp.anon('contatos', 'obs', $x$''$x$);
select pg_temp.anon('vinculos_societarios', 'nome', $x$'Sócio ' || upper(substr(md5(id::text), 1, 4))$x$);
select pg_temp.anon('vinculos_societarios', 'cpf_cnpj', $x$case when cpf_cnpj = '' then '' else regexp_replace(pg_temp.dig(id::text, 9) || '00', '(\d{3})(\d{3})(\d{3})(\d{2})', '\1.\2.\3-\4') end$x$);
select pg_temp.anon('vinculos_societarios', 'email', $x$''$x$);
select pg_temp.anon('vinculos_societarios', 'telefone', $x$''$x$);
select pg_temp.anon('enderecos', 'logradouro', $x$'Rua Fictícia'$x$);
select pg_temp.anon('enderecos', 'numero', $x$(abs(hashtext(id::text)) % 900 + 100)::text$x$);
select pg_temp.anon('enderecos', 'complemento', $x$''$x$);
select pg_temp.anon('enderecos', 'cep', $x$'30000-000'$x$);
select pg_temp.anon('execucao_contatos', 'nome', $x$'Contato ' || upper(substr(md5(id::text), 1, 4))$x$);
select pg_temp.anon('execucao_contatos', 'telefone', $x$''$x$);
select pg_temp.anon('execucao_contatos', 'email', $x$''$x$);
select pg_temp.anon('execucao_contatos', 'endereco', $x$''$x$);

-- ── processos e CRM ──
select pg_temp.anon('processos', 'autor', $x$case when autor = '' then '' else 'Parte A ' || upper(substr(md5(id::text), 1, 4)) end$x$);
select pg_temp.anon('processos', 'reu', $x$case when reu = '' then '' else 'Parte B ' || upper(substr(md5(id::text), 1, 4)) end$x$);
select pg_temp.anon('crm_oportunidades', 'prospecto_nome', $x$case when prospecto_nome = '' then '' else 'Prospecto ' || upper(substr(md5(id::text), 1, 4)) end$x$);
select pg_temp.anon('crm_oportunidades', 'prospecto_doc', $x$''$x$);
select pg_temp.anon('crm_oportunidades', 'prospecto_email', $x$''$x$);
select pg_temp.anon('crm_oportunidades', 'prospecto_telefone', $x$''$x$);
select pg_temp.anon('crm_oportunidades', 'prospecto_empresa', $x$''$x$);
select pg_temp.anon('crm_oportunidades', 'indicado_por', $x$''$x$);

-- ── senhas e certificados ──
select pg_temp.anon('cliente_certificado', 'senha', $x$''$x$);
select pg_temp.anon('cliente_certificado', 'titular', $x$''$x$);
select pg_temp.anon('cliente_certificado', 'emissor', $x$''$x$);

-- ── o que tem texto livre com dados de cliente: sai da cópia ──
select pg_temp.limpar('email_fila');
select pg_temp.limpar('publicacoes');
select pg_temp.limpar('partes_monitoradas');
select pg_temp.limpar('documentos_gerados');
select pg_temp.limpar('historico');
select pg_temp.limpar('notificacoes');
select pg_temp.limpar('crm_propostas');
select pg_temp.limpar('documentos');           -- os arquivos ficam no Storage do projeto de verdade; a cópia não tem

-- ── chaves e senhas do sistema: a cópia não leva nenhuma ──
delete from public.config_privada;
insert into public.config_privada (chave, valor) values ('segredo_funcoes', to_jsonb(gen_random_uuid()::text)) on conflict (chave) do update set valor = excluded.valor;
insert into public.config_privada (chave, valor) values ('url_projeto', to_jsonb(''::text)) on conflict (chave) do update set valor = excluded.valor;   -- não aponta para o projeto de verdade

-- ── nada sai da cópia: e-mails em modo teste e rotinas automáticas desligadas ──
insert into public.configuracoes (chave, valor) values ('emails_pausados', 'true') on conflict (chave) do update set valor = 'true';
do $$
declare j record;
begin
  if to_regclass('cron.job') is not null then
    for j in select jobid from cron.job loop perform cron.unschedule(j.jobid); end loop;
  end if;
end $$;

select 'Cópia anonimizada: ' || (select count(*) from public.clientes) || ' clientes, nenhuma senha, nenhuma rotina automática.' as resultado;
