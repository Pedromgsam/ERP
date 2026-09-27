-- Dados dos advogados usados nos recibos (gerado por ferramentas/montar-erp.js).
-- Cole no SQL Editor do Supabase e clique em Run. Pode rodar de novo sem problema.
-- Cria a tabela (se ainda não existir) com as regras de acesso: só a equipe lê, só o admin altera.
create table if not exists public.configuracoes (
  chave text primary key,
  valor jsonb not null,
  atualizado_em timestamptz not null default now()
);
alter table public.configuracoes enable row level security;
revoke all on public.configuracoes from anon;
grant select, insert, update, delete on public.configuracoes to authenticated;
drop policy if exists configuracoes_ver on public.configuracoes;
create policy configuracoes_ver on public.configuracoes for select to authenticated using (public.eh_equipe());
drop policy if exists configuracoes_admin on public.configuracoes;
create policy configuracoes_admin on public.configuracoes for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

insert into public.configuracoes (chave, valor) values ('recibo_emitentes', '{"pedro":{"label":"Pedro","nome":"PEDRO HENRIQUE DE OLIVEIRA CASTRO","oab":"OAB/MG 228.471","local":"Lagoa da Prata/MG","qualif":"advogado inscrito na OAB/MG sob o n. 228.471, inscrito no CPF sob o n. 115.547.646-88, com escritório profissional na Rua das Araucárias, n. 231, bairro Coronel Luciano, Lagoa da Prata/MG, CEP 35.591-218, titular do endereço eletrônico advocaciapedrocastro@gmail.com","email":"advocaciapedrocastro@gmail.com"},"adriana":{"label":"Adriana","nome":"ADRIANA FATIMA ARAUJO BORGES","oab":"OAB/MG 123.438","local":"Santo Antônio do Monte/MG","qualif":"advogada inscrita na OAB/MG sob o n. 123.438, inscrita no CPF sob o n. 009.248.026-85, com escritório profissional na Rua Sebastião Gontijo, n. 66, Centro, Santo Antônio do Monte/MG, CEP 35.560-000, titular do endereço eletrônico emanuellearaujoadvocacia@gmail.com","email":"emanuellearaujoadvocacia@gmail.com"},"emanuelle":{"label":"Emanuelle","nome":"EMANUELLE OLIVEIRA ARAUJO","oab":"OAB/MG 240.369","local":"Santo Antônio do Monte/MG","qualif":"advogada inscrita na OAB/MG sob o n. 240.369, inscrita no CPF sob o n. 152.071.946-90, com escritório profissional na Rua Sebastião Gontijo, n. 66, Centro, Santo Antônio do Monte/MG, CEP 35.560-000, titular do endereço eletrônico emanuellearaujoadvocacia@gmail.com","email":"emanuellearaujoadvocacia@gmail.com"}}'::jsonb)
on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
