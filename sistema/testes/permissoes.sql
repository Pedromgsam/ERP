-- Testes de permissão do banco. Cada bloco falha com erro se a regra não valer.
\set ON_ERROR_STOP 1
insert into auth.users (id,email) values
 ('00000000-0000-0000-0000-00000000000a','admin@teste'),
 ('00000000-0000-0000-0000-00000000000b','equipe@teste'),
 ('00000000-0000-0000-0000-00000000000c','novo@teste');
update public.perfis set papel='equipe' where email='equipe@teste';

create or replace function pg_temp.como(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, true); end $$;
create or replace function pg_temp.ok(cond boolean, nome text) returns void language plpgsql as $$
begin if not cond then raise exception 'FALHOU: %', nome; end if; raise notice 'PASSA: %', nome; end $$;

-- 1. primeiro usuário vira admin, os outros entram inativos
select pg_temp.ok((select papel from perfis where email='admin@teste')='admin','primeiro usuário vira admin');
select pg_temp.ok((select papel from perfis where email='novo@teste')='inativo','usuário novo entra inativo');

-- 2. equipe cadastra cliente, contrato gera parcelas
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000b');
insert into grupos(nome) values ('Grupo Alfa');
insert into clientes(nome,grupo_id,cpf_cnpj) select 'Empresa Alfa Ltda', id, '11.222.333/0001-44' from grupos;
insert into contratos(cliente_id,descricao,valor_total,num_parcelas,primeiro_vencimento)
  select id,'Consultoria tributária',1000,3,'2026-10-10' from clientes;
select pg_temp.ok((select count(*) from lancamentos)=3,'contrato de 3 parcelas gera 3 lançamentos');
select pg_temp.ok((select sum(valor) from lancamentos)=1000,'parcelas somam o valor do contrato (centavos na última)');
select pg_temp.ok((select valor from lancamentos where parcela=3)=333.34,'última parcela leva o centavo que sobra');
select pg_temp.ok((select vencimento from lancamentos where parcela=3)='2026-12-10','vencimentos mês a mês');
update lancamentos set pago=true where parcela=1;
select pg_temp.ok((select data_pagamento from lancamentos where parcela=1)=current_date,'marcar pago preenche a data');
update lancamentos set pago=false where parcela=1;
select pg_temp.ok((select data_pagamento from lancamentos where parcela=1) is null,'desmarcar pago limpa a data');
insert into lancamentos(tipo,descricao,vencimento,valor,categoria) values ('despesa','Aluguel','2026-10-05',2500,'Escritório');
delete from clientes;  -- equipe não exclui cliente: RLS ignora a linha
select pg_temp.ok((select count(*) from clientes)=1,'equipe não consegue excluir cliente');
select pg_temp.ok((select count(*) from perfis)=1,'equipe só vê o próprio perfil');
update perfis set papel='admin' where email='equipe@teste';
select pg_temp.ok((select papel from perfis where email='equipe@teste')='equipe','equipe não se promove a admin');
select pg_temp.ok((select count(*) from historico)=0,'equipe não lê o histórico');
commit;

-- 3. usuário inativo não vê nem grava nada
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.ok((select count(*) from clientes)=0 and (select count(*) from lancamentos)=0,'inativo não vê dados');
do $$ begin
  insert into clientes(nome) values ('Invasor');
  raise exception 'FALHOU: inativo gravou';
exception when insufficient_privilege then raise notice 'PASSA: inativo não grava';
end $$;
commit;

-- 4. sem login (chave pública apenas) não vê nada
begin; set local role anon;
do $$ begin
  perform count(*) from clientes;
  raise exception 'FALHOU: anon leu clientes';
exception when insufficient_privilege then raise notice 'PASSA: sem login não lê nada';
end $$;
commit;

-- 5. admin: libera usuário, vê histórico, exclui, não se rebaixa sendo o único
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000a');
update perfis set papel='equipe' where email='novo@teste';
select pg_temp.ok((select papel from perfis where email='novo@teste')='equipe','admin libera usuário novo');
select pg_temp.ok((select count(*) from historico where tabela='lancamentos')>=5,'histórico registra as alterações com autor');
select pg_temp.ok((select count(distinct usuario) from historico where tabela='clientes')=1,'histórico guarda quem fez');
do $$ begin
  update perfis set papel='equipe' where email='admin@teste';
  raise exception 'FALHOU: removeu o último admin';
exception when raise_exception then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'PASSA: não dá para remover o último admin';
end $$;
delete from contratos;
select pg_temp.ok((select count(*) from lancamentos where contrato_id is not null)=0,'excluir contrato apaga as parcelas dele');
delete from clientes;
select pg_temp.ok((select count(*) from clientes)=0,'admin exclui cliente');
commit;
