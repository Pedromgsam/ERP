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

-- v10: CRM
insert into crm_oportunidades(titulo, prospecto_nome, prospecto_empresa, prospecto_email, valor_estimado, responsavel, etapa_id)
  select 'Holding Família Teste', 'Maria Teste', 'Holding Teste Ltda', 'maria@teste', 30000, 'Pedro', id from crm_etapas where ordem = 1;
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
select pg_temp.ok((select count(*) from crm_oportunidades)=0,'sem a função CRM não vê oportunidades');
commit;
update perfis set funcoes = funcoes || '{"crm":"editar"}' where email='fin@teste';
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
select pg_temp.ok((select count(*) from crm_oportunidades)=1,'com a função CRM vê as oportunidades');
select public.crm_ganhar((select id from crm_oportunidades where titulo='Holding Família Teste'),
  '{"cliente_nome":"Holding Teste Ltda","cpf_cnpj":"11222333000181","grupo":"Grupo Holding","descricao":"Holding familiar","valor_total":30000,"num_parcelas":3,"primeiro_vencimento":"2026-11-10","responsavel":"Pedro","criar_fluxo":true}');
commit;
select pg_temp.ok((select count(*) from clientes where nome='Holding Teste Ltda' and origem='CRM')=1,'Ganhou: cria o cliente (mesmo sem a função Clientes)');
-- Backup 26: o "Fechou" cria o contrato aguardando assinatura; o financeiro e o onboarding entram na assinatura
select pg_temp.ok((select status from contratos where descricao='Holding familiar')='Aguardando assinatura','Ganhou: contrato nasce aguardando assinatura');
select pg_temp.ok((select count(*) from lancamentos l join contratos c on c.id=l.contrato_id where c.descricao='Holding familiar')=0,'Ganhou: sem financeiro antes da assinatura');
select pg_temp.ok((select count(*) from fluxos where nome like 'Onboarding — Holding Teste%')=0,'Ganhou: onboarding espera a assinatura');
select pg_temp.ok((select count(*) from tarefas where chave_regra like 'anexo:%' and titulo like '%Holding familiar%')=1,'Ganhou: tarefa "anexar contrato assinado"');
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select public.contrato_assinar((select id from contratos where descricao='Holding familiar'), null);
commit;
select pg_temp.ok((select count(*) from lancamentos l join contratos c on c.id=l.contrato_id where c.descricao='Holding familiar')=3,'Assinado: contrato com 3 parcelas');
select pg_temp.ok((select count(*) from tarefas t join fluxos f on f.id=t.fluxo_id where f.nome like 'Onboarding — Holding Teste%')=7,'Assinado: fluxo de onboarding com etapas e subtarefas');
select pg_temp.ok((select count(*) from tarefas where titulo like 'Onboarding: Holding Teste%')=0,'Assinado: regra de onboarding não duplica o fluxo');
select pg_temp.ok((select e.final from crm_oportunidades o join crm_etapas e on e.id=o.etapa_id where o.titulo='Holding Família Teste')='ganho','Assinado: oportunidade vai para "Contrato assinado"');
select pg_temp.ok((select count(*) from notificacoes n join perfis p on p.id=n.usuario_id where p.email='admin@teste' and n.titulo like 'Contrato assinado%')=1,'Assinado: equipe é avisada');
select pg_temp.ok((select ganho_em is not null from crm_oportunidades where titulo='Holding Família Teste'),'oportunidade fica marcada como ganha');
insert into crm_oportunidades(titulo, prospecto_nome, etapa_id) select 'Consulta perdida', 'Fulano', id from crm_etapas where ordem = 2;
do $$ begin
  perform public.crm_perder((select id from crm_oportunidades where titulo='Consulta perdida'), '', false);
  raise exception 'FALHOU: perdeu sem motivo';
exception when raise_exception then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'PASSA: perder exige o motivo';
end $$;

-- v11: publicações
insert into processos(numero) values ('5000009-99.2026.8.13.0024');
insert into publicacoes(id_origem, processo, processo_numero, tribunal, advogado, texto) values ('t:1','5000009-99.2026.8.13.0024','50000099920268130024','TJMG','Fabiana','Intimação');
select pg_temp.ok((select processo_id is not null from publicacoes where id_origem='t:1'),'publicação liga ao processo pelo número');
select pg_temp.ok((select count(*) from notificacoes where tipo='publicacao')=1,'publicação nova avisa o advogado');
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
select pg_temp.ok((select count(*) from publicacoes)=0,'sem a função Jurídico não vê publicações');
commit;

-- v12: substituir importação
insert into lancamentos(empresa,tipo,descricao,vencimento,valor,chave_importacao) values ('contabilidade','receita','Importado errado','2026-10-10',100,'fin:contabilidade:teste'),('contabilidade','receita','Lançado à mão','2026-10-10',50,null);
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000b');
do $$ begin
  perform public.limpar_importados('contabilidade');
  raise exception 'FALHOU: equipe substituiu importação';
exception when raise_exception then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'PASSA: só o admin substitui importação';
end $$;
commit;
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select public.limpar_importados('contabilidade');
commit;
select pg_temp.ok((select count(*) from lancamentos where descricao='Importado errado')=0 and (select count(*) from lancamentos where descricao='Lançado à mão')=1,'substituir apaga só o que veio da planilha');

-- v12: consultoria em salários mínimos (exemplo do escritório)
insert into clientes(nome) values ('João Consultoria');
insert into contratos(cliente_id, descricao, modalidade, forma_valor, qtd_salarios, dia_vencimento, inicio_competencia)
  select id, 'Consultoria João', 'consultoria', 'salario_minimo', 1, 10, '2026-11-01' from clientes where nome='João Consultoria';
select public.gerar_mensalidades((select id from contratos where descricao='Consultoria João'), '2027-12-01');
select pg_temp.ok((select valor from lancamentos where descricao like 'Consultoria João — competência 12/2026')=1621.00
  and (select vencimento from lancamentos where descricao like 'Consultoria João — competência 12/2026')='2027-01-10','competência de dez/2026 paga em jan/2027 com o salário mínimo de 2026');
insert into salarios_minimos values (2027, 1700.00) on conflict (ano) do update set valor = excluded.valor;
select pg_temp.ok((select valor from lancamentos where descricao like 'Consultoria João — competência 01/2027')=1700.00,'salário mínimo novo reajusta sozinho a partir da competência de jan/2027');
update lancamentos set pago = true where descricao like 'Consultoria João — competência 11/2026';
update contratos set rescindido_em='2027-09-10' where descricao='Consultoria João';
select pg_temp.ok((select max(competencia) from lancamentos where descricao like 'Consultoria João%')='2027-08-01','rescindido em set/2027: cobra até a competência de ago/2027');
select pg_temp.ok((select count(*) from lancamentos where descricao like 'Consultoria João — competência 11/2026' and pago)=1,'mensalidade já paga não some na rescisão');

-- v13–v16: desempenho, CNPJ, agenda, backup e acessos
select pg_temp.ok((select (public.resumo_financeiro('contabilidade','2026-01-01','2026-12-31') -> 'contabilidade') is not null),'resumo_financeiro devolve os totais por empresa');
insert into clientes(nome, cpf_cnpj, situacao_cadastral, responsavel) values ('Empresa Receita Teste','99888777000166','ATIVA','Ana');
update clientes set situacao_cadastral='BAIXADA' where nome='Empresa Receita Teste';
select pg_temp.ok((select count(*) from tarefas where chave_regra like 'cnpj:%' and titulo like '%Empresa Receita Teste ficou BAIXADA%')=1,'empresa BAIXADA na Receita vira tarefa');
update clientes set situacao_cadastral='ATIVA' where nome='Empresa Receita Teste';
select pg_temp.ok((select count(*) from tarefas where chave_regra like 'cnpj:%' and titulo like '%Empresa Receita Teste%')=1,'voltar a ATIVA não cria tarefa');
insert into backups_auto(caminho) values ('teste.json');
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok((select count(*) from backups_auto)=0,'equipe não vê a lista de backups');
select pg_temp.ok(length(public.meu_link_agenda())>=32,'equipe gera o próprio link de agenda');
select pg_temp.ok(public.registrar_acesso('aparelho-1','Chrome · Windows') = false,'primeiro acesso não é "aparelho novo"');
select pg_temp.ok((select count(*) from acessos)=1,'cada pessoa vê os próprios acessos');
do $$ begin
  perform public.saude_sistema();
  raise exception 'FALHOU: equipe viu a saúde do sistema';
exception when raise_exception then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'PASSA: só o admin vê a saúde do sistema';
end $$;
commit;
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000b');
do $$ begin
  perform count(*) from public.agenda_links;
  raise exception 'FALHOU: site leu os links de agenda';
exception when insufficient_privilege then raise notice 'PASSA: links de agenda ficam fora do alcance do site';
end $$;
commit;
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((select count(*) from backups_auto)=1 and (public.saude_sistema() ->> 'banco_bytes')::bigint > 0,'admin vê backups e a saúde do sistema');
commit;

-- v17: automações encadeadas e e-mails ao cliente
insert into grupos(nome) values ('Grupo Perm Aut');
insert into clientes(grupo_id,nome,email) select id,'Perm Aut Ltda','perm@aut.teste' from grupos where nome='Grupo Perm Aut';
insert into contratos(cliente_id,descricao,valor_total,num_parcelas,data_contrato,modalidade) select id,'Contrato Perm Aut',100,1,current_date,'pontual' from clientes where nome='Perm Aut Ltda';
select pg_temp.ok((select count(*) from tarefas where chave_regra like 'anexo:%' and titulo like '%Contrato Perm Aut%')=1,'contrato novo cria tarefa de anexar o contrato');
select pg_temp.ok((select count(*) from automacoes_log where chave='anexo')>=1,'automação fica registrada');
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000b');
do $$ begin
  perform public.email_ao_cliente('x','x:1',null,null,'a','b');
  raise exception 'FALHOU: site mandou e-mail direto ao cliente';
exception when insufficient_privilege then raise notice 'PASSA: e-mail ao cliente só sai pelas regras (não pelo site)';
end $$;
select pg_temp.ok((public.resumo_automacoes() ? 'anexo'),'equipe vê o resumo das automações');
select pg_temp.ok((select count(*) from automacoes_log)>=1,'equipe vê o registro das automações');
commit;

-- v18: área do cliente, rascunho de estagiário, êxito
insert into auth.users (id,email) values
 ('00000000-0000-0000-0000-0000000000d1','contab@teste'),
 ('00000000-0000-0000-0000-0000000000d2','estagiario@teste');
update public.perfis set papel='equipe', areas='contabil', funcoes='{"clientes":"editar","contratos":"ver"}' where email='contab@teste';
update public.perfis set papel='equipe', areas='juridico', funcoes='{"clientes":"propor","juridico":"propor"}' where email='estagiario@teste';
insert into clientes(nome,area) values ('Só Jurídico Ltda','juridico'),('Só Contábil Ltda','contabil'),('Das Duas Ltda','ambos');
insert into contatos(cliente_id,nome) select id,'Contato Jur' from clientes where nome='Só Jurídico Ltda';
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-0000000000d1');
select pg_temp.ok((select count(*) from clientes where nome='Só Jurídico Ltda')=0,'quem só vê Contabilidade não vê cliente do Jurídico');
select pg_temp.ok((select count(*) from clientes where nome in ('Só Contábil Ltda','Das Duas Ltda'))=2,'vê clientes da Contabilidade e de ambas');
select pg_temp.ok((select count(*) from contatos where nome='Contato Jur')=0,'nem os contatos do cliente do Jurídico');
do $$ begin
  insert into clientes(nome,area) values ('Invasão Jur','juridico');
  raise exception 'FALHOU: cadastrou cliente de outra área';
exception when insufficient_privilege then raise notice 'PASSA: não cadastra cliente de outra área';
end $$;
do $$ begin
  update clientes set area='juridico' where nome='Das Duas Ltda';
  raise exception 'FALHOU: empurrou cliente para outra área';
exception when insufficient_privilege then raise notice 'PASSA: não empurra cliente para uma área que não vê';
end $$;
commit;

-- estagiário: não grava direto; propõe; outro aprova; o autor não aprova a própria
select set_config('teste.contabil', id::text, false) from clientes where nome='Só Contábil Ltda';
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-0000000000d2');
update clientes set obs='direto' where nome='Das Duas Ltda';
select pg_temp.ok((select obs from clientes where nome='Das Duas Ltda')<>'direto','estagiário não grava direto');
select public.propor_alteracao('clientes','alterar',jsonb_build_object('id',(select id from clientes where nome='Das Duas Ltda')),'{"obs":"proposta","telefone":"31 9999"}','Obs do cliente');
select public.propor_alteracao('clientes','incluir','{}','{"nome":"Cliente Proposto","area":"ambos"}','Novo cliente');
select pg_temp.ok((select count(*) from rascunhos where status='pendente')=2,'estagiário vê as próprias propostas');
do $$ begin
  perform public.propor_alteracao('clientes','alterar',jsonb_build_object('id',current_setting('teste.contabil')),'{"obs":"x"}','');
  raise exception 'FALHOU: propôs em cliente de outra área';
exception when raise_exception then
  if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'PASSA: não propõe (nem espia) cliente de outra área';
end $$;
do $$ begin
  perform public.aprovar_rascunho((select id from rascunhos limit 1));
  raise exception 'FALHOU: estagiário aprovou';
exception when raise_exception then
  if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'PASSA: estagiário não aprova';
end $$;
do $$ begin
  perform public.propor_alteracao('lancamentos','incluir','{}','{"tipo":"receita","descricao":"x","vencimento":"2026-10-10","valor":1}','');
  raise exception 'FALHOU: propôs sem função';
exception when raise_exception then
  if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'PASSA: só propõe onde tem o nível Propor';
end $$;
commit;
select pg_temp.ok((select count(*) from clientes where nome='Cliente Proposto')=0,'proposta não vale antes de aprovar');
select pg_temp.ok((select count(*) from notificacoes n join perfis p on p.id=n.usuario_id where p.email='equipe@teste' and n.tipo='rascunho')=2,'quem edita recebe aviso da proposta');
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select public.aprovar_rascunho(id) from rascunhos where resumo='Obs do cliente';
select public.aprovar_rascunho(id) from rascunhos where resumo='Novo cliente';
commit;
select pg_temp.ok((select obs||'|'||telefone from clientes where nome='Das Duas Ltda')='proposta|31 9999','aprovado: alteração aplicada');
select pg_temp.ok((select count(*) from clientes where nome='Cliente Proposto')=1,'aprovado: cliente novo criado');
select pg_temp.ok((select count(*) from notificacoes n join perfis p on p.id=n.usuario_id where p.email='estagiario@teste' and n.titulo like '%aprovada%')=2,'autor é avisado da aprovação');

-- êxito: só vira lançamento quando registrado; valor = % × X
insert into contratos(cliente_id,descricao,valor_total,num_parcelas,percentual_exito,exito_base,exito_regra,modalidade)
  select id,'Redução PGFN',0,1,20,'economia','20% da redução','pontual' from clientes where nome='Das Duas Ltda';
select pg_temp.ok((select count(*) from lancamentos l join contratos k on k.id=l.contrato_id where k.descricao='Redução PGFN')=0,'êxito futuro não entra no financeiro');
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select public.registrar_exito((select id from contratos where descricao='Redução PGFN'),150000,current_date,current_date+10,'Dívida reduziu 150 mil');
commit;
select pg_temp.ok((select valor from lancamentos l join contratos k on k.id=l.contrato_id where k.descricao='Redução PGFN')=30000,'êxito registrado: 20% de 150 mil = 30 mil no financeiro');
select pg_temp.ok((select count(*) from exitos)=1,'êxito fica registrado no contrato');
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-0000000000d1');
do $$ begin
  perform public.registrar_exito((select id from contratos where descricao='Redução PGFN'),1000,current_date,current_date,'');
  raise exception 'FALHOU: sem editar Contratos registrou êxito';
exception when raise_exception then
  if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'PASSA: só quem edita Contratos registra êxito';
end $$;
commit;

-- v19: demonstração só admin; avisos lidos de cada um; e-mail manual precisa editar; nome próprio
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000b');
do $$ begin
  perform public.carregar_demonstracao();
  raise exception 'FALHOU: equipe carregou demonstração';
exception when raise_exception then
  if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'PASSA: só o admin carrega a demonstração';
end $$;
insert into avisos_lidos(chave) values ('teste@hoje');
select public.salvar_meu_nome('Equipe Teste');
commit;
select pg_temp.ok((select nome from perfis where email='equipe@teste')='Equipe Teste','cada pessoa escolhe o próprio nome');
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-0000000000d2');
select pg_temp.ok((select count(*) from avisos_lidos)=0,'cada pessoa só vê os próprios avisos lidos');
do $$ begin
  perform public.enviar_email_manual('x@exemplo.test','a','b');
  raise exception 'FALHOU: estagiário mandou e-mail';
exception when raise_exception then
  if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'PASSA: e-mail ao cliente pela tela só com permissão de editar';
end $$;
commit;
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok(public.carregar_demonstracao()=6,'admin carrega a demonstração (6 clientes fictícios)');
select pg_temp.ok((select count(*) from lancamentos l join clientes c on c.id=l.cliente_id where c.chave_importacao like 'demo:%')>0,'demonstração vem com honorários ligados aos clientes');
select pg_temp.ok(public.limpar_demonstracao()=6,'apagar a demonstração remove os 6 clientes fictícios');
select pg_temp.ok((select count(*) from grupos where nome like 'DEMO%')=0,'apagar a demonstração não deixa rastro');
commit;
select pg_temp.ok((select email from public.contato_do_cliente((select id from clientes where nome='Só Jurídico Ltda'),null,'financeiro')) is null,'sem e-mail cadastrado, nenhum e-mail ao cliente');

-- v20 (Backup 14): perfil de e-mail por cliente, consertos dos e-mails, usuários previstos, extrato, fotos, PGFN
insert into clientes(nome,email,perfil_email) values ('Perfil Nunca Ltda','nunca@cliente.test','nunca'),('Perfil Venc Ltda','venc@cliente.test','vencimento'),('Perfil Padrao Ltda','padrao@cliente.test','padrao');
select pg_temp.ok(not public.pode_email((select id from clientes where nome='Perfil Nunca Ltda'),null,'lembrete') and not public.pode_email((select id from clientes where nome='Perfil Nunca Ltda'),null,'recibo')
  and public.pode_email((select id from clientes where nome='Perfil Nunca Ltda'),null,'parcelamento'),'perfil "Não enviar financeiro": sem lembrete/recibo; guia de parcelamento continua');
select pg_temp.ok(public.pode_email((select id from clientes where nome='Perfil Venc Ltda'),null,'vencimento') and not public.pode_email((select id from clientes where nome='Perfil Venc Ltda'),null,'cobranca')
  and not public.pode_email((select id from clientes where nome='Perfil Venc Ltda'),null,'lembrete'),'perfil "Só no vencimento": aviso no dia, sem lembrete antes nem cobrança');
select pg_temp.ok(not public.pode_email((select id from clientes where nome='Perfil Padrao Ltda'),null,'vencimento') and public.pode_email((select id from clientes where nome='Perfil Padrao Ltda'),null,'cobranca'),'perfil Padrão: lembrete e cobrança, sem aviso no dia');
update regras_tarefas set ligada=true, dias=3 where chave in ('email_lembrete_honorario','email_lembrete_parcelamento');
insert into lancamentos(empresa,tipo,descricao,cliente_id,vencimento,valor) select 'escritorio','receita','Honorário perfil',id,current_date+2,1000 from clientes where nome in ('Perfil Nunca Ltda','Perfil Padrao Ltda','Perfil Venc Ltda');
insert into lancamentos(empresa,tipo,descricao,cliente_id,vencimento,valor,redutor) select 'escritorio','receita','Comissão do indicador',id,current_date+2,100,true from clientes where nome='Perfil Padrao Ltda';
insert into lancamentos(empresa,tipo,descricao,cliente_id,vencimento,valor) select 'escritorio','receita','Vence hoje perfil',id,current_date,500 from clientes where nome='Perfil Venc Ltda';
select public.rodar_emails_cliente();
select pg_temp.ok((select count(*) from email_fila where para='padrao@cliente.test')=1 and (select html from email_fila where para='padrao@cliente.test') not like '%Comissão do indicador%','lembrete vai ao perfil Padrão e não inclui a comissão (redutor)');
select pg_temp.ok((select count(*) from email_fila where para='nunca@cliente.test')=0 and exists (select 1 from automacoes_log where descricao like 'Não enviado (perfil%'),'perfil "Não enviar financeiro": nenhum e-mail, fica registrado que foi pulado');
select pg_temp.ok((select count(*) from email_fila where para='venc@cliente.test')=1 and (select assunto from email_fila where para='venc@cliente.test') like '%vencimento hoje%','perfil "Só no vencimento": só o aviso do dia');
select public.rodar_emails_cliente();
select pg_temp.ok((select count(*) from email_fila where para in ('padrao@cliente.test','venc@cliente.test'))=2,'rodar de novo no mesmo dia não repete o e-mail');
select pg_temp.ok((select count(*) from automacoes_log where chave='_item')>0 and not ((select public.resumo_automacoes()) ? '_item'),'marcadores por lançamento não entram na contagem das automações');
-- contato com finalidade "cobrança" vale como financeiro
insert into contatos(cliente_id,nome,finalidade,email) select id,'Geral','geral','geral@cliente.test' from clientes where nome='Perfil Padrao Ltda';
insert into contatos(cliente_id,nome,finalidade,email) select id,'Cobrança','cobranca','cobra@cliente.test' from clientes where nome='Perfil Padrao Ltda';
select pg_temp.ok((select email from public.contato_do_cliente((select id from clientes where nome='Perfil Padrao Ltda'),null,'financeiro'))='cobra@cliente.test','contato com finalidade Cobrança recebe os e-mails financeiros');
-- parcelamento: vencimento dentro da faixa (fim de semana não escapa)
insert into parcelamentos(empresa,cnpj,natureza,numero,total_parcelas,valor_ultima_parcela) values ('Perfil Padrao Ltda','','Simples','PP-1','10',300);
update clientes set cpf_cnpj='' where nome='Perfil Padrao Ltda';
insert into parcelas(parcelamento_id,numero,vencimento) select id,'1',current_date+1 from parcelamentos where numero='PP-1';
select public.rodar_emails_cliente();
select pg_temp.ok(exists (select 1 from automacoes_log where chave='email_lp'),'guia de parcelamento: vencimento antes do dia N também recebe o lembrete');
-- demonstração não manda e-mail (example.com)
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select public.carregar_demonstracao();
commit;
select pg_temp.ok((select count(*) from email_fila where para like '%example.com')=0,'dados de demonstração nunca geram e-mail');
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select public.limpar_demonstracao();
commit;
-- perfil em lote: só quem edita Clientes
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-0000000000d2');
do $$ begin
  perform public.salvar_perfil_email(array[(select id from clientes where nome='Só Jurídico Ltda')],'nunca',null);
  raise exception 'FALHOU: estagiário mudou o perfil de e-mail';
exception when raise_exception then
  if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'PASSA: perfil de e-mail só quem edita Clientes';
end $$;
commit;
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok(public.salvar_perfil_email(array[(select id from clientes where nome='Perfil Venc Ltda')],'padrao',null)=1,'equipe muda o perfil de e-mail');
select pg_temp.ok((select count(*) from usuarios_previstos)=0,'equipe não vê os acessos combinados');
do $$ begin
  perform public.tirar_fotos_mensais();
  raise exception 'FALHOU: equipe tirou foto mensal';
exception when raise_exception then
  if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'PASSA: foto mensal manual só o administrador';
end $$;
select pg_temp.ok((select count(*) from public.pgfn_execucoes) >= 0 and (public.status_config_pgfn() ? 'consumer_key') = false,'a chave do SERPRO nunca volta para a tela');
commit;
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((select count(*) from usuarios_previstos)=4,'admin vê os 4 acessos combinados (Emanuelle, Adriana, João Vitor, Éder)');
commit;
-- criar a conta com o e-mail combinado já dá o acesso certo
insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000e1','ederpsique@gmail.com');
select pg_temp.ok((select papel||'|'||areas||'|'||(funcoes->>'financeiro_contab') from perfis where email='ederpsique@gmail.com')='equipe|contabil|editar' and not exists (select 1 from usuarios_previstos where email='ederpsique@gmail.com'),
  'Éder nasce como Adm. da Contabilidade (só clientes da contabilidade)');
delete from auth.users where email='ederpsique@gmail.com';
-- extrato (OFX): só quem edita o financeiro daquela empresa
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-0000000000d1');
do $$ begin
  insert into extrato_itens(fitid,empresa,data,valor) values ('X1','escritorio',current_date,10);
  raise exception 'FALHOU: sem financeiro gravou extrato';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'PASSA: extrato só quem edita o financeiro';
end $$;
commit;
insert into grupos(nome) values ('Grupo Foto Teste') on conflict do nothing;
select public.tirar_fotos_mensais();
select pg_temp.ok((select count(*) from fotos_mensais where mes=date_trunc('month',current_date)::date) >= 1,'foto mensal do passivo por grupo');
-- Backup 15: preferência da tela (fila do Início) e mural de recados
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select public.salvar_preferencia('fila', '{"vista":"mes"}');
select pg_temp.ok((select preferencias->'fila'->>'vista' from perfis where id=auth.uid())='mes','preferência da fila guardada no próprio perfil');
insert into mural(texto, fixo) values ('Recado da equipe', true);
select pg_temp.ok((select not fixo and autor=auth.uid() from mural where texto='Recado da equipe'),'equipe publica no mural (só o admin fixa recado)');
commit;
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select pg_temp.ok((select count(*) from mural)=0,'cliente não vê o mural do escritório');
commit;
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000a');
insert into mural(texto, fixo) values ('Recado fixo do admin', true);
select pg_temp.ok((select fixo from mural where texto='Recado fixo do admin'),'admin fixa recado no mural');
commit;
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000b');
delete from mural where texto='Recado fixo do admin';
select pg_temp.ok((select count(*) from mural where texto='Recado fixo do admin')=1,'equipe não apaga recado de outra pessoa');
commit;
delete from mural;
-- Backup 16: Central de e-mails e lembretes
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000d');
do $$ begin
  perform public.emails_central('hoje');
  raise exception 'FALHOU: cliente abriu a Central de e-mails';
exception when raise_exception then
  if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'PASSA: cliente não abre a Central de e-mails';
end $$;
select pg_temp.ok((select count(*) from lembretes)=0,'cliente não vê os lembretes do escritório');
commit;
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000b');
insert into lembretes(texto, dia) values ('Renovar certificado digital', current_date);
select pg_temp.ok((select count(*) from lembretes where texto='Renovar certificado digital')=1,'equipe cria lembrete');
do $$ begin
  perform public.salvar_config_emails('{"hora":"08:00"}');
  raise exception 'FALHOU: equipe mudou o automático dos e-mails';
exception when raise_exception then
  if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'PASSA: só o admin muda o automático dos e-mails';
end $$;
commit;
delete from lembretes;
select pg_temp.ok(public.valor_extenso(1234.56)='mil duzentos e trinta e quatro reais e cinquenta e seis centavos' and public.valor_extenso(2000000)='dois milhões de reais' and public.valor_extenso(1001)='mil e um reais','valor por extenso do recibo');
-- Backup 23: só o administrador exclui usuário (e nunca a si mesmo)
begin; set local role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000b');
do $$ begin
  perform public.excluir_usuario((select id from perfis where email='novo@teste'));
  raise exception 'FALHOU: equipe excluiu usuário';
exception when raise_exception then
  if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'PASSA: equipe não exclui usuário';
end $$;
commit;
