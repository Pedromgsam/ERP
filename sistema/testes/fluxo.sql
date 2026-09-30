-- Teste do fluxo completo (Backup 26): Cadastro → Lead → Reunião → Contrato → Assinatura → Financeiro → E-mails → Delegar/validar.
-- Dados fictícios. Roda num banco novo (rodar-tudo.sh cria erp_fluxo). Mostra PASSA/FALHA de cada item e dá erro se algum falhar.
create temp table r (n serial, ok boolean, nome text, obs text);
create or replace function pg_temp.como(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;
create or replace function pg_temp.ok(cond boolean, nome text, obs text default '') returns void language plpgsql as $$
begin insert into pg_temp.r(ok, nome, obs) values (coalesce(cond, false), nome, obs); end $$;
grant all on pg_temp.r to authenticated; grant usage on sequence pg_temp.r_n_seq to authenticated;

insert into auth.users (id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','pedro@teste','{"nome":"Pedro Castro"}'),
 ('00000000-0000-0000-0000-00000000000b','estagiario@teste','{"nome":"Bruno Estagiário"}');
update perfis set papel='equipe', funcoes='{"clientes":"editar","contratos":"editar","crm":"editar","tarefas":"editar","documentos":"editar","financeiro_juridico":"editar"}' where email='estagiario@teste';
update configuracoes set valor='false'::jsonb where chave='emails_pausados';
update regras_tarefas set ligada = true where grupo = 'cliente_email';

-- ═══ 1. CADASTRO ═══
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
set role authenticated;
insert into clientes (id, nome, cpf_cnpj, responsavel, area, origem, email) values
 ('10000000-0000-0000-0000-000000000001', 'Padaria Fictícia Ltda', '11.111.111/0001-11', 'Pedro', 'juridico', 'Indicação', 'geral@padaria.teste');
insert into contatos (cliente_id, nome, finalidade, email, recebe_boletos, recebe_notificacoes) values
 ('10000000-0000-0000-0000-000000000001', 'Ana Financeiro', 'financeiro', 'ana@padaria.teste', true, false),
 ('10000000-0000-0000-0000-000000000001', 'Caio Contador', 'contador', 'caio@padaria.teste', false, false),
 ('10000000-0000-0000-0000-000000000001', 'Fábio Fiscal', 'fiscal', 'fabio@padaria.teste', false, false),
 ('10000000-0000-0000-0000-000000000001', 'Sônia Sócia', 'socio', 'sonia@padaria.teste', false, false);
select pg_temp.ok(true, '1.1 estagiário cadastra cliente + 4 contatos (inclui Fiscal)');
select pg_temp.ok((select count(*) from clientes_mesmo_documento('11111111000111', null)) = 1, '1.2 CPF/CNPJ repetido é encontrado (aviso ao cadastrar)');
select pg_temp.ok((select count(*) from contatos where email = 'geral@padaria.teste' and finalidade = 'geral') = 1, '1.2b e-mail do cadastro vira contato Geral');
reset role;
select pg_temp.ok((select email from contato_do_cliente('10000000-0000-0000-0000-000000000001', null, 'financeiro') limit 1) = 'ana@padaria.teste',
  '1.3 cobrança vai ao contato do financeiro', (select email from contato_do_cliente('10000000-0000-0000-0000-000000000001', null, 'financeiro') limit 1));
select pg_temp.ok((select email from contato_do_cliente('10000000-0000-0000-0000-000000000001', null, 'guia') limit 1) = 'fabio@padaria.teste',
  '1.4 guia vai ao contato do setor Fiscal', 'a lista de finalidades não tem Fiscal nem RH (tela aceita só geral/financeiro/jurídico/sócio/contador/cobrança/marketing)');

-- ═══ 2. LEAD NO CRM (prospecto sem cadastro) ═══
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
set role authenticated;
insert into crm_oportunidades (id, titulo, prospecto_nome, prospecto_doc, prospecto_email, responsavel, etapa_id, valor_estimado)
 select '20000000-0000-0000-0000-000000000001', 'Holding familiar', 'Mercado Fictício Ltda', '22.222.222/0001-22', 'dono@mercado.teste', 'Pedro', id, 6000
 from crm_etapas where ordem = 1 order by ordem limit 1;
select pg_temp.ok((select count(*) from crm_oportunidades) = 1, '2.1 estagiário cria lead no CRM');
insert into reunioes (oportunidade_id, titulo, inicio, local, participantes, convite)
 values ('20000000-0000-0000-0000-000000000001', 'Reunião de diagnóstico', now() + interval '3 days', 'https://meet.teste/abc', 'Pedro, Bruno', true);
reset role;
select pg_temp.ok((select count(*) from tarefas where chave_regra like 'reuniao:%') = 2, '2.2 reunião vira tarefa de cada participante', (select string_agg(titulo || '/' || responsavel, ', ') from tarefas where chave_regra like 'reuniao:%'));
select pg_temp.ok(exists (select 1 from crm_atividades where tipo = 'reuniao'), '2.3 reunião entra nas atividades do CRM');
select pg_temp.ok((select e.nome from crm_oportunidades o join crm_etapas e on e.id = o.etapa_id) = 'Diagnóstico agendado', '2.4 lead vai para "Diagnóstico agendado"');
select pg_temp.ok(exists (select 1 from email_fila where para = 'dono@mercado.teste' and anexo->>'tipo' = 'ics'), '2.5 convite (marcado) vai ao e-mail do lead com o .ics');
update reunioes set participantes = 'Pedro';
select pg_temp.ok((select count(*) from tarefas where chave_regra like 'reuniao:%' and status = 'cancelada') = 1, '2.6 participante retirado: a tarefa dele é cancelada');

-- ═══ 3. FECHOU (crm_ganhar) — serviço pontual 6.000 em 3x ═══
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select crm_ganhar('20000000-0000-0000-0000-000000000001', jsonb_build_object('cliente_nome', 'Mercado Fictício Ltda', 'valor_total', 6000, 'num_parcelas', 3,
  'primeiro_vencimento', (current_date + 20)::text, 'descricao', 'Holding familiar', 'modalidade', 'pontual', 'responsavel', 'Pedro'));
reset role;
select pg_temp.ok((select count(*) from clientes where nome = 'Mercado Fictício Ltda') = 1, '3.1 "Fechou" cria o cliente');
select pg_temp.ok((select cpf_cnpj from clientes where nome = 'Mercado Fictício Ltda') <> '', '3.2 CNPJ do lead passa ao cliente');
select pg_temp.ok((select count(*) from contatos c join clientes k on k.id = c.cliente_id where k.nome = 'Mercado Fictício Ltda') > 0,
  '3.3 e-mail do lead vira contato do cliente', 'fica só em clientes.email');
select pg_temp.ok((select count(*) from reunioes r join clientes k on k.id = r.cliente_id where k.nome = 'Mercado Fictício Ltda') = 1, '3.3b reunião do lead passa para a ficha do cliente');
select pg_temp.ok((select count(*) from contratos) = 1, '3.4 contrato criado');
select pg_temp.ok((select count(*) from lancamentos l join contratos c on c.id = l.contrato_id) = 0,
  '3.5 financeiro espera a assinatura', (select count(*) from lancamentos)::text || ' parcelas já lançadas no "Fechou", antes da assinatura');
select pg_temp.ok((select count(*) from tarefas where chave_regra like 'crm-contrato:%') = 1, '3.6 tarefa "Enviar contrato para assinatura"');
select pg_temp.ok((select count(*) from fluxos) = 0, '3.7 onboarding espera a assinatura', (select count(*) from fluxos)::text || ' fluxos');
select pg_temp.ok((select status from contratos limit 1) = 'Aguardando assinatura', '3.7b contrato do CRM nasce aguardando assinatura', (select status from contratos limit 1));
select pg_temp.ok((select count(*) from tarefas where titulo ilike '%boas-vindas%') <= 1, '3.8 onboarding não duplica tarefa de boas-vindas',
  (select count(*) from tarefas where titulo ilike '%boas-vindas%')::text || ' tarefas de boas-vindas');
select pg_temp.ok((select e.nome from crm_oportunidades o join crm_etapas e on e.id = o.etapa_id) = 'Contrato fechado', '3.9 lead vai para "Contrato fechado"',
  (select e.nome from crm_oportunidades o join crm_etapas e on e.id = o.etapa_id));
select pg_temp.ok((select count(*) from tarefas where chave_regra like 'anexo:%') = 1, '3.10 tarefa "anexar contrato assinado" também pelo CRM',
  (select count(*) from tarefas where chave_regra like 'anexo:%')::text);
select pg_temp.ok(exists (select 1 from interacoes i join clientes k on k.id = i.cliente_id where k.nome = 'Mercado Fictício Ltda'), '3.11 linha do tempo registra o fechamento');

-- ═══ 4. ASSINATURA ═══
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
set role authenticated;
update crm_oportunidades set etapa_id = (select id from crm_etapas where final = 'ganho' limit 1) where id = '20000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.ok((select assinado_em from crm_oportunidades) is not null, '4.1 "Contrato assinado" marca a data no CRM');
select pg_temp.ok((select status from contratos where descricao = 'Holding familiar') = 'Ativo', '4.1b mover o lead para "Contrato assinado" assina o contrato');
select pg_temp.ok((select count(*) from lancamentos where descricao like 'Holding%') = 3, '4.1c financeiro lançado na assinatura (3 parcelas)', (select count(*) from lancamentos where descricao like 'Holding%')::text);
select pg_temp.ok((select count(*) from fluxos) = 1, '4.1d onboarding criado na assinatura');
select pg_temp.ok(exists (select 1 from notificacoes where titulo ilike '%assinad%'), '4.2 equipe é avisada da assinatura', 'nenhuma notificação');
select pg_temp.ok(exists (select 1 from email_fila where assunto ilike '%bem-vind%'), '4.3 e-mail de boas-vindas (regra ligada no teste)', 'não saiu');
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
set role authenticated;
insert into documentos (cliente_id, contrato_id, tipo, nome, caminho)
 select cliente_id, id, 'contrato', 'contrato-assinado.pdf', 'x/contrato.pdf' from contratos limit 1;
reset role;
select pg_temp.ok(pg_get_constraintdef((select oid from pg_constraint where conname = 'contratos_status_check')) ilike '%assinatura%', '4.4 contrato tem situação "aguardando assinatura"',
  'situações possíveis: Ativo/Encerrado/Cancelado');

-- ═══ 5. CONSULTORIA (mensalidade) ═══
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
set role authenticated;
insert into crm_oportunidades (id, titulo, cliente_id, responsavel) values ('20000000-0000-0000-0000-000000000002', 'Consultoria mensal', '10000000-0000-0000-0000-000000000001', 'Pedro');
select crm_ganhar('20000000-0000-0000-0000-000000000002', jsonb_build_object('modalidade', 'consultoria', 'valor_mensal', 1500, 'dia_vencimento', 10,
  'inicio_competencia', current_date::text, 'responsavel', 'Pedro', 'criar_fluxo', false));
reset role;
select pg_temp.ok((select count(*) from lancamentos where cliente_id = '10000000-0000-0000-0000-000000000001') = 0, '5.0 consultoria aguardando assinatura não gera mensalidade');
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select contrato_assinar((select id from contratos where modalidade = 'consultoria'), null);
reset role;
select pg_temp.ok((select count(*) from lancamentos where cliente_id = '10000000-0000-0000-0000-000000000001') >= 1, '5.1 consultoria assinada gera mensalidades',
  (select count(*) from lancamentos where cliente_id = '10000000-0000-0000-0000-000000000001')::text || ' mensalidades');

-- ═══ 6. E-MAILS ═══
insert into lancamentos (tipo, descricao, cliente_id, vencimento, valor, empresa)
 values ('receita', 'Honorários teste lembrete', '10000000-0000-0000-0000-000000000001', current_date + 2, 900, 'escritorio'),
        ('receita', 'Honorários teste atraso', '10000000-0000-0000-0000-000000000001', current_date - 12, 700, 'escritorio');
select pg_temp.ok((select count(*) from emails_pendentes() where cliente_id = '10000000-0000-0000-0000-000000000001') >= 2, '6.1 Central lista lembrete e cobrança',
  (select string_agg(regra, ',') from emails_pendentes() where cliente_id = '10000000-0000-0000-0000-000000000001'));
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
set role authenticated; select pausar_emails(true); reset role;
select rodar_emails_cliente();
select pg_temp.ok((select count(*) from email_fila where para like '%padaria%' and status = 'pendente') = 0 and (select count(*) from email_fila where para like '%padaria%' and status = 'retido') > 0, '6.2 com a pausa ligada nada sai (fica retido)',
  (select string_agg(status || '→' || para, ', ') from email_fila where para like '%padaria%'));
select pg_temp.ok((select count(*) from email_fila where para like '%padaria%' and referencia like 'email_%h%' and para <> 'ana@padaria.teste') = 0, '6.3 cobrança vai ao financeiro (Ana)',
  (select string_agg(para || ' ' || referencia, ', ') from email_fila where para like '%padaria%'));
select pg_temp.ok((select rodar_emails_cliente()) = 0, '6.4 rodar de novo não repete e-mail');
update clientes set perfil_email = 'nunca' where id = '10000000-0000-0000-0000-000000000001';
insert into lancamentos (tipo, descricao, cliente_id, vencimento, valor, empresa)
 values ('receita', 'Honorários perfil nunca', '10000000-0000-0000-0000-000000000001', current_date + 3, 100, 'escritorio');
select rodar_emails_cliente();
select pg_temp.ok((select count(*) from email_fila where assunto ilike '%lembrete%' and criado_em > now() - interval '1 second' and para like '%padaria%') <= 1,
  '6.5 perfil "nunca" não recebe');
update clientes set perfil_email = 'padrao' where id = '10000000-0000-0000-0000-000000000001';
-- recibo ao dar baixa
update lancamentos set pago = true where descricao = 'Honorários teste atraso';
select pg_temp.ok(exists (select 1 from email_fila where assunto ilike '%recibo%'), '6.6 baixa gera recibo', 'nenhum recibo na fila');
select pg_temp.ok(exists (select 1 from email_fila where assunto = 'Recibo de pagamento — R$ 700,00'), '6.6b recibo com valor em formato brasileiro', (select string_agg(assunto, ', ') from email_fila where assunto ilike '%recibo%'));
-- guia de parcelamento → a quem vai?
insert into parcelamentos (id, empresa, cnpj, natureza, grupo_id) values ('30000000-0000-0000-0000-000000000001', 'Padaria Fictícia Ltda', '11.111.111/0001-11', 'PGFN', null);
insert into parcelas (parcelamento_id, numero, vencimento, pago) values ('30000000-0000-0000-0000-000000000001', '5', current_date + 2, false);
select pg_temp.ok((select c.email from emails_pendentes() x, contato_do_cliente(x.cliente_id, x.grupo_id, x.finalidade) c where x.regra = 'email_lp' limit 1) = 'fabio@padaria.teste', '6.7 guia de parcelamento vai ao Fiscal',
  'vai para: ' || coalesce((select c.email from emails_pendentes() x, contato_do_cliente(x.cliente_id, x.grupo_id, x.finalidade) c where x.regra = 'email_lp' limit 1), 'nenhum'));
update contatos set recebe = array['guia'] where nome = 'Caio Contador';
select pg_temp.ok((select c.email from contato_do_cliente('10000000-0000-0000-0000-000000000001', null, 'guia') c) = 'caio@padaria.teste', '6.8 contato marcado "recebe guias" tem prioridade sobre o setor');
update contatos set recebe = array['guia'] where nome = 'Fábio Fiscal';
select pg_temp.ok((select c.email from contato_do_cliente('10000000-0000-0000-0000-000000000001', null, 'guia') c) = 'caio@padaria.teste, fabio@padaria.teste', '6.9 vários marcados: vai para todos');
select pg_temp.ok((select count(*) from jsonb_array_elements(emails_controle()) x where x->>'nome' = 'Padaria Fictícia Ltda' and x->'tipos'->'guia'->>'origem' = 'marcado') = 1, '6.10 controle por cliente mostra destino e origem');
update clientes set perfil_email = 'nada' where id = '10000000-0000-0000-0000-000000000001';
select pg_temp.ok(not pode_email('10000000-0000-0000-0000-000000000001', null, 'parcelamento') and not pode_email('10000000-0000-0000-0000-000000000001', null, 'boas_vindas'), '6.11 perfil "Não enviar nenhum e-mail"');
update clientes set perfil_email = 'padrao' where id = '10000000-0000-0000-0000-000000000001';

-- ═══ 7. DELEGAR E VALIDAR (tarefas com revisão) ═══
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
set role authenticated;
insert into tarefas (id, titulo, responsavel, prazo, exige_revisao, revisor) values ('40000000-0000-0000-0000-000000000001', 'Preparar contrato — Mercado', 'Bruno', current_date + 3, true, 'Pedro');
insert into tarefas (id, titulo, responsavel, prazo, depende_de) values ('40000000-0000-0000-0000-000000000002', 'Enviar contrato ao cliente', 'Bruno', current_date + 4, '40000000-0000-0000-0000-000000000001');
update tarefas set status = 'concluida' where id = '40000000-0000-0000-0000-000000000001';
select pg_temp.ok((select status from tarefas where id = '40000000-0000-0000-0000-000000000001') = 'revisao', '7.1 concluir tarefa com revisão → "aguardando revisão"',
  (select status from tarefas where id = '40000000-0000-0000-0000-000000000001'));
do $$ begin
  update tarefas set status = 'concluida' where id = '40000000-0000-0000-0000-000000000001';
  perform pg_temp.ok((select status from tarefas where id = '40000000-0000-0000-0000-000000000001') <> 'concluida', '7.2 estagiário não se autoaprova');
exception when others then perform pg_temp.ok(true, '7.2 estagiário não se autoaprova'); end $$;
do $$ begin
  update tarefas set status = 'concluida' where id = '40000000-0000-0000-0000-000000000002';
  perform pg_temp.ok(false, '7.3 passo seguinte travado até aprovar o anterior', 'concluiu a tarefa dependente antes da aprovação');
exception when others then perform pg_temp.ok(true, '7.3 passo seguinte travado até aprovar o anterior'); end $$;
reset role;
select pg_temp.ok(exists (select 1 from notificacoes n join perfis p on p.id = n.usuario_id where p.email = 'pedro@teste' and n.tipo = 'revisao'), '7.4 revisor recebe notificação');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select pg_temp.ok((select count(*) from jsonb_array_elements(minhas_validacoes())) = 1, '7.5 aparece em "Aguardando minha validação" do revisor');
select tarefa_validar('40000000-0000-0000-0000-000000000001', false, 'Faltou a cláusula de êxito');
reset role;
select pg_temp.ok((select status from tarefas where id = '40000000-0000-0000-0000-000000000001') = 'andamento'
  and exists (select 1 from comentarios where texto like '↩ Devolvido: Faltou%')
  and exists (select 1 from notificacoes n join perfis p on p.id = n.usuario_id where p.email = 'estagiario@teste' and n.titulo like 'Devolvido%'), '7.6 devolver com comentário (volta para a pessoa, com aviso)');
-- delegar a sequência "Lead completo"
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select delegar_sequencia('Lead completo', 'Bruno', 'Pedro', '10000000-0000-0000-0000-000000000001', null, null, '');
reset role;
select pg_temp.ok((select count(*) from tarefas t join fluxos f on f.id = t.fluxo_id where f.nome like 'Lead completo%') = 4
  and (select count(*) from tarefas t join fluxos f on f.id = t.fluxo_id where f.nome like 'Lead completo%' and t.status = 'aguardando') = 3, '7.7 delegar cria 4 passos; só o 1º começa');
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
set role authenticated;
update tarefas set status = 'concluida' where titulo like 'Cadastrar o cliente%';
update tarefas set status = 'concluida' where titulo like 'Agendar a reunião%';
update tarefas set status = 'concluida' where titulo like 'Preparar o contrato%';
reset role;
select pg_temp.ok((select status from tarefas where titulo like 'Preparar o contrato%') = 'revisao' and (select status from tarefas where titulo like 'Enviar o contrato ao cliente%') = 'aguardando',
  '7.8 contrato preparado vai para validação; o envio ao cliente continua travado');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select tarefa_validar((select id from tarefas where titulo like 'Preparar o contrato%'), true, '');
reset role;
select pg_temp.ok((select status from tarefas where titulo like 'Enviar o contrato ao cliente%') = 'pendente'
  and exists (select 1 from notificacoes n join perfis p on p.id = n.usuario_id where p.email = 'estagiario@teste' and n.titulo like 'Pode começar: Enviar o contrato%'), '7.9 aprovado: libera o envio e avisa o estagiário');

-- ═══ 8. ROTINAS DIÁRIAS (sem duplicar) ═══
select rodar_regras_tarefas();
create temp table t1 as select count(*) n from tarefas;
select rodar_regras_tarefas();
select pg_temp.ok((select count(*) from tarefas) = (select n from t1), '8.1 rodar as regras 2× não duplica tarefas');
select pg_temp.ok((select gerar_mensalidades()) = 0, '8.2 gerar mensalidades 2× não duplica');

-- ═══ 9. SÓCIOS DO CARTÃO CNPJ ═══
update clientes set cnpj_dados = '{"socios":[{"nome":"MARIA FICTICIA","qualificacao":"Sócio-Administrador","doc":"***123**"}]}' where id = '10000000-0000-0000-0000-000000000001';
select pg_temp.ok((select count(*) from vinculos_societarios where nome = 'MARIA FICTICIA') = 1, '9.1 sócio do cartão CNPJ entra em "Sócios e vínculos"');
update clientes set cnpj_dados = '{"socios":[{"nome":"MARIA FICTICIA","qualificacao":"Sócio-Administrador"}],"x":1}' where id = '10000000-0000-0000-0000-000000000001';
select pg_temp.ok((select count(*) from vinculos_societarios where nome = 'MARIA FICTICIA') = 1, '9.2 não duplica o sócio');
select pg_temp.ok((select socio_admin from clientes where id = '10000000-0000-0000-0000-000000000001') = 'MARIA FICTICIA', '9.3 sócio-administrador preenchido');
-- 2º aviso nunca é o primeiro
insert into lancamentos (tipo, descricao, cliente_id, vencimento, valor, empresa) values ('receita', 'Atraso antigo sem aviso', '10000000-0000-0000-0000-000000000001', current_date - 15, 50, 'escritorio');
select pg_temp.ok((select count(*) from emails_pendentes() where regra = 'email_ch' and texto like '%Não identificamos%' and itens::text like '%Atraso antigo sem aviso%') = 1, '9.4 atraso sem aviso anterior recebe o 1º aviso (não pula para o 2º)',
  (select string_agg(assunto, ' | ') from emails_pendentes() where regra = 'email_ch'));

-- ═══ 10. Backup 27: EMISSÃO DA GUIA (estagiário) ═══
insert into parcelamentos (id, empresa, cnpj, natureza, total_parcelas, valor_ultima_parcela) values ('50000000-0000-0000-0000-000000000001', 'Padaria Fictícia Ltda', '11.111.111/0001-11', 'Simples Nacional', 60, 800);
insert into parcelas (id, parcelamento_id, numero, vencimento) values ('50000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', '5', current_date + 3);
insert into documentos (id, cliente_id, tipo, nome, caminho, mime) values ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'guia', 'Guia 5.pdf', 'x/guia5.pdf', 'application/pdf');
update perfis set funcoes = funcoes || '{"juridico":"editar"}' where email = 'estagiario@teste';
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select pg_temp.ok((select registrar_emissao('parcelas', '50000000-0000-0000-0000-000000000002', true, '50000000-0000-0000-0000-000000000003', true)->>'email') = 'enviado', '10.1 estagiário marca a guia como emitida e envia ao cliente');
reset role;
select pg_temp.ok((select emitida_em = current_date and emitida_por like 'Bruno%' and emissao = 'SIM' and guia_doc is not null from parcelas where id = '50000000-0000-0000-0000-000000000002'), '10.2 grava data, quem emitiu e o PDF');
select pg_temp.ok((select count(*) from email_fila where referencia = 'email_lp:50000000-0000-0000-0000-000000000002' and para like '%fabio@padaria.teste%' and anexo->>'caminho' = 'x/guia5.pdf') = 1,
  '10.3 e-mail da guia vai ao Fiscal com o PDF anexo', (select string_agg(para || ' ' || coalesce(anexo::text, ''), ' | ') from email_fila where referencia like 'email_lp:%'));
select pg_temp.ok((select count(*) from emails_pendentes() where ref = 'email_lp:50000000-0000-0000-0000-000000000002') = 0, '10.4 o lembrete automático da guia não repete');
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select pg_temp.ok((select registrar_emissao('parcelas', '50000000-0000-0000-0000-000000000002', true, null, true)->>'email') = 'já enviado', '10.5 enviar de novo avisa que já foi enviado');
select pg_temp.ok((select emissao_emails('parcelas', array['50000000-0000-0000-0000-000000000002'::uuid]) ? '50000000-0000-0000-0000-000000000002'), '10.6 a tela sabe quando o e-mail saiu');
reset role;

-- ═══ RESUMO ═══
select case when ok then 'PASSA ' else 'FALHA ' end || nome || case when not ok and obs <> '' then '  → ' || obs else '' end from r order by n;
do $$ declare n int; begin
  select count(*) into n from pg_temp.r where not ok;
  if n > 0 then raise exception 'FALHOU: % verificação(ões) do fluxo', n; end if;
end $$;
