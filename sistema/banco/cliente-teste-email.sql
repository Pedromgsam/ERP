-- ═══════════════════════════════════════════════════════════════════
-- Cliente de TESTE para conferir os e-mails (Backup 28)
-- Cria (ou atualiza) o cliente "TESTE E-MAIL (PEDRO)" com o e-mail pedromgsam@gmail.com,
-- marcado para receber TODOS os tipos (cobrança, recibo, guia, acordo, contrato, convite).
-- Rode no Supabase → SQL Editor quando quiser testar. Pode rodar várias vezes.
-- Para apagar depois: delete from public.clientes where chave_importacao = 'teste:email-pedro';
-- ═══════════════════════════════════════════════════════════════════
insert into public.clientes (nome, tipo, area, responsavel, email, perfil_email, chave_importacao, obs)
values ('TESTE E-MAIL (PEDRO)', 'Consultoria', 'juridico', 'Pedro', 'pedromgsam@gmail.com', 'padrao', 'teste:email-pedro',
        'Cliente de teste dos e-mails do sistema. Pode apagar quando terminar os testes.')
on conflict (chave_importacao) do update set email = excluded.email, area = excluded.area, perfil_email = excluded.perfil_email;

insert into public.contatos (cliente_id, nome, finalidade, email, recebe, recebe_boletos, recebe_notificacoes)
select c.id, 'Pedro (teste)', 'geral', 'pedromgsam@gmail.com', array['cobranca','recibo','guia','acordo','contrato','convite'], true, true
  from public.clientes c
 where c.chave_importacao = 'teste:email-pedro'
   and not exists (select 1 from public.contatos k where k.cliente_id = c.id and k.email = 'pedromgsam@gmail.com');

select id, nome, email from public.clientes where chave_importacao = 'teste:email-pedro';
