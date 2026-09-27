-- Testes de permissão do banco. Cada bloco falha com erro se a regra não valer.
\set ON_ERROR_STOP 1
insert into auth.users (id,email) values
 ('00000000-0000-0000-0000-00000000000a','admin@teste'),
 ('00000000-0000-0000-0000-00000000000b','equipe@teste'),
 ('00000000-0000-0000-0000-00000000000c','novo@teste');
update public.perfis set papel='equipe', funcoes='{"financeiro_juridico":"editar","financeiro_contab":"editar","contratos":"editar","clientes":"editar","juridico":"editar","tarefas":"editar","documentos":"editar","crm":"editar","relatorios":"editar"}' where email='equipe@teste';

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

-- 6. módulos novos e portal do cliente
insert into auth.users (id,email) values ('00000000-0000-0000-0000-00000000000d','cliente@teste');
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000a');
insert into grupos(nome) values ('Grupo Portal'), ('Grupo Outro');
insert into processos(numero, grupo_id, obs) select '0001', id, 'estratégia interna' from grupos where nome='Grupo Portal';
insert into processos(numero, grupo_id) select '0002', id from grupos where nome='Grupo Outro';
insert into parcelamentos(empresa, grupo_id, obs) select 'Empresa Portal', id, 'nota interna' from grupos where nome='Grupo Portal';
insert into parcelas(parcelamento_id, numero, vencimento) select id, '1', '2026-10-10' from parcelamentos;
insert into acordos(processo, grupo_id, pix, banco) select 'A-1', id, 'chave-secreta', 'Banco X' from grupos where nome='Grupo Portal';
update perfis set papel='cliente' where email='cliente@teste';
insert into perfil_grupos select '00000000-0000-0000-0000-00000000000d', id from grupos where nome='Grupo Portal';
select pg_temp.ok((select count(*) from processos)=2,'admin vê processos de todos os grupos');
commit;

begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select pg_temp.ok((select count(*) from processos)=0 and (select count(*) from lancamentos)=0,'cliente não lê as tabelas diretamente');
select pg_temp.ok(jsonb_array_length(portal_dados()->'processos')=1,'portal: cliente vê só o processo do grupo dele');
select pg_temp.ok(not (portal_dados()->'processos'->0 ? 'obs'),'portal: observação interna do processo não sai');
select pg_temp.ok(not (portal_dados()->'acordos'->0 ? 'pix') and not (portal_dados()->'acordos'->0 ? 'banco'),'portal: PIX e banco dos acordos não saem');
select pg_temp.ok(jsonb_array_length(portal_dados()->'parcelamentos'->0->'parcelas')=1,'portal: parcelamento vem com as parcelas');
select pg_temp.ok((select count(*) from grupos)=1,'cliente só enxerga o nome do próprio grupo');
do $$ begin
  insert into processos(numero) values ('invasao');
  raise exception 'FALHOU: cliente gravou processo';
exception when insufficient_privilege then raise notice 'PASSA: cliente não grava';
end $$;
commit;

begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000b');
do $$ begin
  perform portal_dados();
  raise exception 'FALHOU: equipe usou o portal';
exception when raise_exception then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'PASSA: portal_dados só para cliente';
end $$;
update parcelas set pago=true;
select pg_temp.ok((select count(*) from parcelas where pago)=1,'equipe dá baixa em parcela');
delete from processos;
select pg_temp.ok((select count(*) from processos)=2,'equipe não exclui processo');
commit;

-- configurações (dados dos advogados para recibos): só equipe lê, só admin grava
insert into configuracoes(chave, valor) values ('recibo_emitentes', '{"x":{"nome":"FICTICIO"}}');
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok((select count(*) from configuracoes where chave='recibo_emitentes')=1,'equipe lê as configurações dos recibos');
update configuracoes set valor='{}';
select pg_temp.ok((select valor from configuracoes where chave='recibo_emitentes')<>'{}'::jsonb,'equipe não altera configurações');
commit;
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select pg_temp.ok((select count(*) from configuracoes)=0,'cliente não lê dados dos advogados');
commit;
begin; set local role anon;
do $$ begin
  perform * from configuracoes;
  raise exception 'FALHOU: anônimo leu configurações';
exception when insufficient_privilege then raise notice 'PASSA: anônimo não lê configurações';
end $$;
commit;

-- v6: ficha do cliente, documentos, tarefas completas
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000b');
insert into clientes(nome) values ('Cliente Ficha Teste');
insert into contatos(cliente_id,nome,finalidade,email) select id,'Contato Financeiro','financeiro','fin@teste' from clientes where nome='Cliente Ficha Teste';
select pg_temp.ok((select count(*) from contatos)=1,'equipe cadastra contato do cliente');
insert into documentos(cliente_id,nome,caminho) select id,'Contrato social.pdf','x/1.pdf' from clientes where nome='Cliente Ficha Teste';
delete from documentos;
select pg_temp.ok((select count(*) from documentos)=1,'equipe não exclui documento (só arquiva)');
insert into tarefas(titulo,prazo,recorrencia,checklist) values ('Apurar tributos','2026-10-20','mensal','[{"texto":"Conferir notas","feito":false}]');
do $$ begin
  update tarefas set status='concluida' where titulo='Apurar tributos';
  raise exception 'FALHOU: concluiu com checklist pendente';
exception when raise_exception then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'PASSA: checklist pendente impede concluir';
end $$;
update tarefas set checklist='[{"texto":"Conferir notas","feito":true}]', status='concluida' where titulo='Apurar tributos';
select pg_temp.ok((select concluida_por from tarefas where titulo='Apurar tributos' and status='concluida')='00000000-0000-0000-0000-00000000000b','registra quem concluiu');
select pg_temp.ok((select prazo from tarefas where titulo='Apurar tributos' and status='pendente')='2026-11-20','tarefa mensal recria a próxima com checklist zerado');
select pg_temp.ok((select checklist->0->>'feito' from tarefas where titulo='Apurar tributos' and status='pendente')='false','checklist da próxima volta desmarcado');
insert into notificacoes(usuario_id,titulo) values ('00000000-0000-0000-0000-00000000000a','Menção');
select pg_temp.ok((select count(*) from notificacoes)=0,'cada um só vê as próprias notificações');
select pg_temp.ok((select count(*) from equipe_nomes() where id in ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b'))=2 and not exists (select 1 from equipe_nomes() where email='cliente@teste'),'equipe vê os nomes dos colegas para atribuir tarefas');
commit;
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select pg_temp.ok((select count(*) from contatos)+(select count(*) from documentos)+(select count(*) from equipe_nomes())=0,'cliente não vê contatos, documentos nem a equipe');
commit;
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((select count(*) from notificacoes where titulo='Menção')=1,'admin vê a notificação dele');
delete from documentos;
select pg_temp.ok((select count(*) from documentos)=0,'admin exclui documento');
commit;

-- v7: funções de acesso — pessoa só com Financeiro (Jurídico) e uma tarefa própria
insert into auth.users (id,email,raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000f1','fin@teste','{"nome":"Fabiana Financeiro"}');
update perfis set papel='equipe', funcoes='{"financeiro_juridico":"editar"}' where email='fin@teste';
insert into lancamentos(empresa,tipo,descricao,vencimento,valor) values ('contabilidade','receita','Honorário contábil teste','2026-10-10',100),('escritorio','receita','Honorário jurídico teste','2026-10-10',200);
insert into tarefas(titulo,responsavel) values ('Tarefa da Fabiana','Fabiana'),('Tarefa de outra pessoa','Pedro');
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
select pg_temp.ok((select count(*) from lancamentos where empresa='escritorio')>0 and (select count(*) from lancamentos where empresa='contabilidade')=0,'função Financeiro Jurídico vê só os lançamentos do escritório');
select pg_temp.ok((select count(*) from contratos)=0 and (select count(*) from processos)=0 and (select count(*) from contatos)=0,'sem função: não vê contratos, processos nem contatos');
select pg_temp.ok((select count(*) from clientes)>0,'nomes de clientes continuam visíveis para os formulários');
do $$ begin
  insert into contratos(cliente_id,descricao,valor_total) select id,'Contrato proibido',10 from clientes limit 1;
  raise exception 'FALHOU: gravou contrato sem a função';
exception when insufficient_privilege then raise notice 'PASSA: sem a função Contratos não grava contrato';
end $$;
update clientes set nome='Alterado' where true;
select pg_temp.ok((select count(*) from clientes where nome='Alterado')=0,'sem a função Clientes não altera cliente');
select pg_temp.ok((select string_agg(titulo, ',') from tarefas)='Tarefa da Fabiana','sem a função Tarefas vê só as próprias tarefas');
update tarefas set status='andamento' where titulo='Tarefa da Fabiana';
select pg_temp.ok((select status from tarefas where titulo='Tarefa da Fabiana')='andamento','altera a própria tarefa');
commit;
update perfis set funcoes='{"financeiro_juridico":"ver"}' where email='fin@teste';
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
update lancamentos set valor=1 where empresa='escritorio';
select pg_temp.ok((select count(*) from lancamentos where valor=1)=0,'nível Ver não grava');
commit;
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
do $$ begin
  update perfis set funcoes='{"contratos":"editar"}' where id=auth.uid();
  if (select funcoes->>'contratos' from perfis where id=auth.uid()) is not null then raise exception 'FALHOU: pessoa deu função a si mesma'; end if;
  raise notice 'PASSA: ninguém dá função a si mesmo (só o admin)';
end $$;
commit;

-- v8: lógica interna das tarefas
select pg_temp.ok(public.somar_uteis('2026-10-09', 1) = '2026-10-13','dias úteis pulam fim de semana e feriado (12/10)');
select pg_temp.ok(public.usuario_por_nome('Fabiana') = '00000000-0000-0000-0000-0000000000f1' and public.usuario_por_nome('Ninguém') is null,'acha a pessoa pelo primeiro nome');
insert into processos(numero, advogado) values ('9999999-99.2026.8.13.0001','Pedro');
select pg_temp.ok((select count(*) from tarefas where chave_regra like 'proc:%' and titulo like '%9999999%')=1,'processo novo gera tarefa de conferência');
insert into acordos(processo, devedor, credor, parcela, valor, vencimento, responsavel) values ('1','Cliente X','Credor Y','1',100,current_date+3,'Pedro');
select public.rodar_regras_tarefas(); select public.rodar_regras_tarefas();
select pg_temp.ok((select count(*) from tarefas where chave_regra like 'aco:%')=1,'regra roda duas vezes e não duplica');
select pg_temp.ok((select count(*) from lancamentos where descricao ilike '%acordo%')=0,'acordo não gera lançamento financeiro');
insert into tarefas(titulo,responsavel,exige_anexo) values ('Protocolar com anexo','Pedro',true);
do $$ begin
  update tarefas set status='concluida' where titulo='Protocolar com anexo';
  raise exception 'FALHOU: concluiu sem anexo';
exception when raise_exception then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'PASSA: tarefa que exige anexo não conclui sem documento';
end $$;
insert into documentos(tarefa_id,nome,caminho) select id,'protocolo.pdf','x/p.pdf' from tarefas where titulo='Protocolar com anexo';
update tarefas set status='concluida' where titulo='Protocolar com anexo';
select pg_temp.ok((select status from tarefas where titulo='Protocolar com anexo')='concluida','com o documento anexado, conclui');
insert into tarefas(titulo,responsavel,exige_revisao,revisor) values ('Minuta revisada','Fabiana',true,'Pedro');
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
update tarefas set status='concluida' where titulo='Minuta revisada';
select pg_temp.ok((select status from tarefas where titulo='Minuta revisada')='revisao','com revisão: vai para "Aguardando revisão"');
do $$ begin
  update tarefas set status='concluida' where titulo='Minuta revisada';
  raise exception 'FALHOU: quem fez aprovou a própria revisão';
exception when raise_exception then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'PASSA: só o revisor conclui a tarefa em revisão';
end $$;
commit;
