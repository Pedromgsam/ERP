-- ═══════════════════════════════════════════════════════════════════
-- ERP Araújo & Castro — estrutura do banco de dados (Supabase / PostgreSQL)
-- ═══════════════════════════════════════════════════════════════════
--
-- Como usar: no painel do Supabase, abra "SQL Editor", cole este arquivo
-- inteiro e clique em "Run". Pode rodar de novo sem perder dados: tudo
-- aqui é "crie se não existir" ou "substitua a regra".
--
-- Quem pode o quê (fase 1 — uso interno do escritório):
--   admin   → tudo, inclusive liberar usuários e excluir clientes/contratos
--   equipe  → cadastra, edita e dá baixa; não exclui cliente nem contrato
--   inativo → não vê nada (é o estado de todo usuário novo, até o admin liberar)
-- O primeiro usuário criado no projeto vira admin automaticamente.
--
-- A regra de acesso fica NO BANCO (Row Level Security), não na tela: mesmo
-- quem tiver a chave pública do projeto não lê nada sem login liberado.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────── USUÁRIOS ───────────────────────────────
create table if not exists public.perfis (
  id        uuid primary key references auth.users(id) on delete cascade,
  nome      text not null default '',
  email     text not null default '',
  papel     text not null default 'inativo' check (papel in ('admin','equipe','inativo')),
  criado_em timestamptz not null default now()
);

-- Papel de quem está logado. security definer: lê perfis sem passar pela
-- própria regra de perfis (senão a regra chamaria a si mesma).
create or replace function public.papel_atual() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select papel from public.perfis where id = auth.uid()), 'inativo');
$$;
create or replace function public.eh_equipe() returns boolean
language sql stable as $$ select public.papel_atual() in ('admin','equipe'); $$;
create or replace function public.eh_admin() returns boolean
language sql stable as $$ select public.papel_atual() = 'admin'; $$;

-- Todo usuário criado em Authentication ganha um perfil. O primeiro vira
-- admin; os demais entram inativos até o admin liberar na tela Usuários.
create or replace function public.criar_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, email, nome, papel)
  values (new.id, coalesce(new.email,''),
          coalesce(new.raw_user_meta_data->>'nome', split_part(coalesce(new.email,''),'@',1)),
          case when exists (select 1 from public.perfis) then 'inativo' else 'admin' end)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.criar_perfil();

-- Ninguém tira o último admin (evita o escritório ficar trancado para fora).
create or replace function public.proteger_ultimo_admin() returns trigger
language plpgsql as $$
begin
  if old.papel = 'admin' and new.papel <> 'admin'
     and (select count(*) from public.perfis where papel = 'admin') <= 1 then
    raise exception 'É preciso manter pelo menos um administrador.';
  end if;
  return new;
end $$;
drop trigger if exists proteger_admin on public.perfis;
create trigger proteger_admin before update on public.perfis
  for each row execute function public.proteger_ultimo_admin();

-- ─────────────────────────── CADASTROS ──────────────────────────────
-- Grupo = carteira do cliente (ex.: um grupo econômico com várias empresas).
create table if not exists public.grupos (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null check (btrim(nome) <> ''),
  criado_em timestamptz not null default now()
);
create unique index if not exists grupos_nome_unico on public.grupos (lower(btrim(nome)));

create table if not exists public.clientes (
  id            uuid primary key default gen_random_uuid(),
  grupo_id      uuid references public.grupos(id) on delete set null,
  nome          text not null check (btrim(nome) <> ''),
  cpf_cnpj      text not null default '',
  tipo          text not null default 'Consultoria' check (tipo in ('Consultoria','Demanda','Inativo')),
  responsavel   text not null default '',
  email         text not null default '',
  telefone      text not null default '',
  endereco      text not null default '',
  cidade        text not null default '',
  estado        text not null default '',
  obs           text not null default '',
  criado_por    uuid default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists clientes_grupo on public.clientes (grupo_id);

create table if not exists public.contratos (
  id                  uuid primary key default gen_random_uuid(),
  cliente_id          uuid not null references public.clientes(id) on delete restrict,
  descricao           text not null check (btrim(descricao) <> ''),
  data_contrato       date not null default current_date,
  valor_total         numeric(14,2) not null default 0 check (valor_total >= 0),
  num_parcelas        int not null default 1 check (num_parcelas between 1 and 120),
  primeiro_vencimento date,
  percentual_exito    numeric(5,2) check (percentual_exito between 0 and 100),
  status              text not null default 'Ativo' check (status in ('Ativo','Encerrado','Cancelado')),
  obs                 text not null default '',
  criado_por          uuid default auth.uid(),
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);
create index if not exists contratos_cliente on public.contratos (cliente_id);

-- ─────────────────────────── FINANCEIRO ─────────────────────────────
create table if not exists public.lancamentos (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null check (tipo in ('receita','despesa')),
  descricao       text not null check (btrim(descricao) <> ''),
  categoria       text not null default '',
  cliente_id      uuid references public.clientes(id) on delete set null,
  contrato_id     uuid references public.contratos(id) on delete cascade,
  parcela         int,
  total_parcelas  int,
  vencimento      date not null,
  valor           numeric(14,2) not null check (valor > 0),
  pago            boolean not null default false,
  data_pagamento  date,
  forma_pagamento text not null default '',
  obs             text not null default '',
  criado_por      uuid default auth.uid(),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index if not exists lanc_venc     on public.lancamentos (vencimento);
create index if not exists lanc_cliente  on public.lancamentos (cliente_id);
create index if not exists lanc_contrato on public.lancamentos (contrato_id);

-- Pago sem data → hoje. Desmarcou pago → apaga a data. Sempre coerente.
create or replace function public.ajustar_pagamento() returns trigger
language plpgsql as $$
begin
  if new.pago and new.data_pagamento is null then new.data_pagamento := current_date; end if;
  if not new.pago then new.data_pagamento := null; end if;
  return new;
end $$;
drop trigger if exists ajustar_pagamento on public.lancamentos;
create trigger ajustar_pagamento before insert or update on public.lancamentos
  for each row execute function public.ajustar_pagamento();

-- Contrato novo com valor e 1º vencimento → cria as parcelas a receber.
-- Centavos que sobram da divisão vão para a última parcela.
create or replace function public.gerar_parcelas_contrato() returns trigger
language plpgsql as $$
declare
  i int; base numeric(14,2); v numeric(14,2);
begin
  if new.valor_total > 0 and new.primeiro_vencimento is not null then
    base := trunc(new.valor_total / new.num_parcelas, 2);
    for i in 1..new.num_parcelas loop
      v := case when i = new.num_parcelas
                then new.valor_total - base * (new.num_parcelas - 1) else base end;
      insert into public.lancamentos
        (tipo, descricao, categoria, cliente_id, contrato_id, parcela, total_parcelas, vencimento, valor)
      values
        ('receita', new.descricao || case when new.num_parcelas > 1
                                          then ' — parcela ' || i || '/' || new.num_parcelas else '' end,
         'Honorários', new.cliente_id, new.id, i, new.num_parcelas,
         (new.primeiro_vencimento + make_interval(months => i - 1))::date, v);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists gerar_parcelas on public.contratos;
create trigger gerar_parcelas after insert on public.contratos
  for each row execute function public.gerar_parcelas_contrato();

-- ─────────────────────── DATA DE ALTERAÇÃO ──────────────────────────
create or replace function public.marcar_atualizacao() returns trigger
language plpgsql as $$ begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists atualizado_clientes on public.clientes;
create trigger atualizado_clientes before update on public.clientes
  for each row execute function public.marcar_atualizacao();
drop trigger if exists atualizado_contratos on public.contratos;
create trigger atualizado_contratos before update on public.contratos
  for each row execute function public.marcar_atualizacao();
drop trigger if exists atualizado_lancamentos on public.lancamentos;
create trigger atualizado_lancamentos before update on public.lancamentos
  for each row execute function public.marcar_atualizacao();

-- ─────────────────────────── HISTÓRICO ──────────────────────────────
-- Toda inclusão, alteração e exclusão fica registrada: quem, quando e o
-- quê. Só o admin consulta; ninguém edita.
create table if not exists public.historico (
  id          bigserial primary key,
  tabela      text not null,
  registro_id uuid,
  acao        text not null,
  usuario     uuid,
  quando      timestamptz not null default now(),
  antes       jsonb,
  depois      jsonb
);
create or replace function public.registrar_historico() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- alteração que não muda nada (ex.: reimportar a mesma planilha) não polui o histórico
  if tg_op = 'UPDATE' and (to_jsonb(old) - 'atualizado_em') = (to_jsonb(new) - 'atualizado_em') then
    return null;
  end if;
  insert into public.historico (tabela, registro_id, acao, usuario, antes, depois)
  values (tg_table_name,
          coalesce((case when tg_op = 'DELETE' then old.id else new.id end), null),
          tg_op, auth.uid(),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;
drop trigger if exists hist_clientes on public.clientes;
create trigger hist_clientes after insert or update or delete on public.clientes
  for each row execute function public.registrar_historico();
drop trigger if exists hist_contratos on public.contratos;
create trigger hist_contratos after insert or update or delete on public.contratos
  for each row execute function public.registrar_historico();
drop trigger if exists hist_lancamentos on public.lancamentos;
create trigger hist_lancamentos after insert or update or delete on public.lancamentos
  for each row execute function public.registrar_historico();
drop trigger if exists hist_perfis on public.perfis;
create trigger hist_perfis after update or delete on public.perfis
  for each row execute function public.registrar_historico();

-- ──────────────────────── REGRAS DE ACESSO ──────────────────────────
alter table public.perfis      enable row level security;
alter table public.grupos      enable row level security;
alter table public.clientes    enable row level security;
alter table public.contratos   enable row level security;
alter table public.lancamentos enable row level security;
alter table public.historico   enable row level security;

-- Sem login: nada.
revoke all on public.perfis, public.grupos, public.clientes, public.contratos,
              public.lancamentos, public.historico from anon;
grant select, insert, update, delete on public.grupos, public.clientes,
              public.contratos, public.lancamentos to authenticated;
grant select, update on public.perfis to authenticated;
grant select on public.historico to authenticated;
revoke insert, delete on public.perfis from authenticated;
revoke insert, update, delete on public.historico from authenticated;

-- perfis: cada um vê o próprio; admin vê e altera todos.
drop policy if exists perfis_ver on public.perfis;
create policy perfis_ver on public.perfis for select to authenticated
  using (id = auth.uid() or public.eh_admin());
drop policy if exists perfis_alterar on public.perfis;
create policy perfis_alterar on public.perfis for update to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- grupos, clientes, contratos, lançamentos: equipe lê e grava.
do $$
declare t text;
begin
  foreach t in array array['grupos','clientes','contratos','lancamentos'] loop
    execute format('drop policy if exists %1$s_ver on public.%1$s', t);
    execute format('create policy %1$s_ver on public.%1$s for select to authenticated using (public.eh_equipe())', t);
    execute format('drop policy if exists %1$s_incluir on public.%1$s', t);
    execute format('create policy %1$s_incluir on public.%1$s for insert to authenticated with check (public.eh_equipe())', t);
    execute format('drop policy if exists %1$s_alterar on public.%1$s', t);
    execute format('create policy %1$s_alterar on public.%1$s for update to authenticated using (public.eh_equipe()) with check (public.eh_equipe())', t);
  end loop;
end $$;

-- Excluir: lançamento e grupo → equipe; cliente e contrato → só admin.
drop policy if exists lancamentos_excluir on public.lancamentos;
create policy lancamentos_excluir on public.lancamentos for delete to authenticated using (public.eh_equipe());
drop policy if exists grupos_excluir on public.grupos;
create policy grupos_excluir on public.grupos for delete to authenticated using (public.eh_equipe());
drop policy if exists clientes_excluir on public.clientes;
create policy clientes_excluir on public.clientes for delete to authenticated using (public.eh_admin());
drop policy if exists contratos_excluir on public.contratos;
create policy contratos_excluir on public.contratos for delete to authenticated using (public.eh_admin());

-- histórico: só admin lê.
drop policy if exists historico_ver on public.historico;
create policy historico_ver on public.historico for select to authenticated using (public.eh_admin());

-- ═══════════════════════════════════════════════════════════════════
-- v2 (2026-09-26) — campos do ERP antigo: cadastro completo dos clientes,
-- financeiro do escritório e da contabilidade, e chave de importação
-- (reimportar a mesma planilha atualiza em vez de duplicar).
-- ═══════════════════════════════════════════════════════════════════
alter table public.clientes add column if not exists socio_admin        text not null default '';
alter table public.clientes add column if not exists rfb                numeric(16,2);
alter table public.clientes add column if not exists rfb_negociada      numeric(16,2);
alter table public.clientes add column if not exists pgfn               numeric(16,2);
alter table public.clientes add column if not exists pgfn_negociada     numeric(16,2);
alter table public.clientes add column if not exists sefaz_mg           numeric(16,2);
alter table public.clientes add column if not exists age_mg             numeric(16,2);
alter table public.clientes add column if not exists age_mg_negociada   numeric(16,2);
alter table public.clientes add column if not exists ceat_trt3          int;
alter table public.clientes add column if not exists em_operacao        boolean;
alter table public.clientes add column if not exists procuracao         boolean;
alter table public.clientes add column if not exists certificado        boolean;
alter table public.clientes add column if not exists cadastro_regular   boolean;
alter table public.clientes add column if not exists capag              text not null default '';
alter table public.clientes add column if not exists regime_tributario  text not null default '';
alter table public.clientes add column if not exists situacao_cadastral text not null default '';
alter table public.clientes add column if not exists tipo_societario    text not null default '';
alter table public.clientes add column if not exists historico_cadastral text not null default '';
alter table public.clientes add column if not exists origem             text not null default '';
alter table public.clientes add column if not exists data_migracao      date;
alter table public.clientes add column if not exists chave_importacao   text;
create unique index if not exists clientes_chave_importacao on public.clientes (chave_importacao);

-- empresa: 'escritorio' (Honorários Jurídico) ou 'contabilidade'
alter table public.lancamentos add column if not exists empresa      text not null default 'escritorio';
alter table public.lancamentos drop constraint if exists lancamentos_empresa_check;
alter table public.lancamentos add constraint lancamentos_empresa_check check (empresa in ('escritorio','contabilidade'));
alter table public.lancamentos add column if not exists grupo_id     uuid references public.grupos(id) on delete set null;
alter table public.lancamentos add column if not exists favorecido   text not null default '';  -- fornecedor, em despesas
alter table public.lancamentos add column if not exists responsavel  text not null default '';  -- advogado/pessoa
alter table public.lancamentos add column if not exists referencia   text not null default '';  -- ex.: 0,7 salário
alter table public.lancamentos add column if not exists cobranca     text not null default '';  -- ex.: Cobrado, Emitir guia
alter table public.lancamentos add column if not exists conta        text not null default '';  -- banco
alter table public.lancamentos add column if not exists chave_pix    text not null default '';
alter table public.lancamentos add column if not exists perda        boolean not null default false; -- prejuízo
alter table public.lancamentos add column if not exists chave_importacao text;
create unique index if not exists lancamentos_chave_importacao on public.lancamentos (chave_importacao);
create index if not exists lanc_empresa on public.lancamentos (empresa, vencimento);
create index if not exists lanc_pagamento on public.lancamentos (data_pagamento);
create index if not exists lanc_grupo on public.lancamentos (grupo_id);

-- ═══════════════════════════════════════════════════════════════════
-- v3 (2026-09-27) — demais módulos do ERP: processos, parcelamentos
-- (com as parcelas), acordos e tarefas; e o acesso de CLIENTE (portal).
-- ═══════════════════════════════════════════════════════════════════
create table if not exists public.processos (
  id                   uuid primary key default gen_random_uuid(),
  grupo_id             uuid references public.grupos(id) on delete set null,
  carteira             text not null default 'Ativo' check (carteira in ('Ativo','Prospecção')),
  advogado             text not null default '',
  numero               text not null check (btrim(numero) <> ''),
  competencia          text not null default '',
  natureza             text not null default '',
  autor                text not null default '',
  reu                  text not null default '',
  data_distribuicao    date,
  valor                numeric(16,2),
  atualizacao          date,
  procuracao           boolean,
  outro_advogado       boolean,
  status               text not null default '',
  data_arq_provisorio  date,
  prescricao           text not null default '',
  obs                  text not null default '',
  chave_importacao     text unique,
  criado_por           uuid default auth.uid(),
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now()
);
create index if not exists processos_grupo on public.processos (grupo_id);

create table if not exists public.parcelamentos (
  id                   uuid primary key default gen_random_uuid(),
  grupo_id             uuid references public.grupos(id) on delete set null,
  aba                  text not null default '',          -- nome da aba na planilha (ex.: grupo)
  empresa              text not null check (btrim(empresa) <> ''),
  cnpj                 text not null default '',
  local                text not null default '',          -- eCAC, Regularize, Siare…
  natureza             text not null default '',          -- Simples Nacional, INSS, ICMS…
  numero               text not null default '',
  total_parcelas       int,
  valor_ultima_parcela numeric(16,2),
  valor_residual       numeric(16,2),
  obs                  text not null default '',
  chave_importacao     text unique,
  criado_por           uuid default auth.uid(),
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now()
);
create index if not exists parcelamentos_grupo on public.parcelamentos (grupo_id);

create table if not exists public.parcelas (
  id               uuid primary key default gen_random_uuid(),
  parcelamento_id  uuid not null references public.parcelamentos(id) on delete cascade,
  numero           text not null default '',
  vencimento       date,
  emissao          text not null default '',             -- ex.: SIM / guia emitida
  pago             boolean not null default false,
  chave_importacao text unique,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);
create index if not exists parcelas_parc on public.parcelas (parcelamento_id, vencimento);

create table if not exists public.acordos (
  id               uuid primary key default gen_random_uuid(),
  grupo_id         uuid references public.grupos(id) on delete set null,
  aba              text not null default '',
  responsavel      text not null default '',
  processo         text not null check (btrim(processo) <> ''),
  devedor          text not null default '',
  credor           text not null default '',
  parcela          text not null default '',
  total_parcelas   text not null default '',
  valor            numeric(16,2),
  vencimento       date,
  situacao         text not null default '',
  emissao          text not null default '',
  pago             boolean not null default false,
  data_pagamento   date,
  pix              text not null default '',
  banco            text not null default '',
  obs              text not null default '',
  chave_importacao text unique,
  criado_por       uuid default auth.uid(),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);
create index if not exists acordos_grupo on public.acordos (grupo_id, vencimento);

create table if not exists public.tarefas (
  id                    uuid primary key default gen_random_uuid(),
  grupo_id              uuid references public.grupos(id) on delete set null,
  titulo                text not null check (btrim(titulo) <> ''),
  processos_vinculados  text not null default '',
  prioridade            text not null default 'media',
  responsavel           text not null default '',
  status                text not null default 'pendente',
  inicio                date,
  prazo                 date,
  obs                   text not null default '',
  chave_importacao      text unique,
  criado_por            uuid default auth.uid(),
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

-- datas de alteração e histórico dos módulos novos
do $$
declare t text;
begin
  foreach t in array array['processos','parcelamentos','parcelas','acordos','tarefas'] loop
    execute format('drop trigger if exists atualizado_%1$s on public.%1$s', t);
    execute format('create trigger atualizado_%1$s before update on public.%1$s for each row execute function public.marcar_atualizacao()', t);
    execute format('drop trigger if exists hist_%1$s on public.%1$s', t);
    execute format('create trigger hist_%1$s after insert or update or delete on public.%1$s for each row execute function public.registrar_historico()', t);
  end loop;
end $$;

-- ─────────────────────── acesso de CLIENTE (portal) ─────────────────
-- Cliente vê só os grupos liberados para ele, e só pelo portal_dados()
-- (que tira observações internas e dados bancários). Nada de financeiro.
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check check (papel in ('admin','equipe','cliente','inativo'));
create table if not exists public.perfil_grupos (
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  grupo_id  uuid not null references public.grupos(id) on delete cascade,
  primary key (perfil_id, grupo_id)
);

-- regras de acesso dos módulos novos: equipe lê e grava; admin exclui
alter table public.processos     enable row level security;
alter table public.parcelamentos enable row level security;
alter table public.parcelas      enable row level security;
alter table public.acordos       enable row level security;
alter table public.tarefas       enable row level security;
alter table public.perfil_grupos enable row level security;
revoke all on public.processos, public.parcelamentos, public.parcelas, public.acordos,
              public.tarefas, public.perfil_grupos from anon;
grant select, insert, update, delete on public.processos, public.parcelamentos, public.parcelas,
              public.acordos, public.tarefas, public.perfil_grupos to authenticated;
do $$
declare t text;
begin
  foreach t in array array['processos','parcelamentos','parcelas','acordos','tarefas'] loop
    execute format('drop policy if exists %1$s_ver on public.%1$s', t);
    execute format('create policy %1$s_ver on public.%1$s for select to authenticated using (public.eh_equipe())', t);
    execute format('drop policy if exists %1$s_incluir on public.%1$s', t);
    execute format('create policy %1$s_incluir on public.%1$s for insert to authenticated with check (public.eh_equipe())', t);
    execute format('drop policy if exists %1$s_alterar on public.%1$s', t);
    execute format('create policy %1$s_alterar on public.%1$s for update to authenticated using (public.eh_equipe()) with check (public.eh_equipe())', t);
    execute format('drop policy if exists %1$s_excluir on public.%1$s', t);
    execute format('create policy %1$s_excluir on public.%1$s for delete to authenticated using (%2$s)', t,
                   case when t in ('parcelas','tarefas') then 'public.eh_equipe()' else 'public.eh_admin()' end);
  end loop;
end $$;
drop policy if exists perfil_grupos_ver on public.perfil_grupos;
create policy perfil_grupos_ver on public.perfil_grupos for select to authenticated
  using (perfil_id = auth.uid() or public.eh_admin());
drop policy if exists perfil_grupos_admin on public.perfil_grupos;
create policy perfil_grupos_admin on public.perfil_grupos for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());
-- grupos: o cliente enxerga o nome dos grupos dele
drop policy if exists grupos_ver_cliente on public.grupos;
create policy grupos_ver_cliente on public.grupos for select to authenticated
  using (id in (select grupo_id from public.perfil_grupos where perfil_id = auth.uid()));

-- Dados do portal: só para papel 'cliente', só dos grupos dele, sem campos internos.
create or replace function public.portal_dados() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare meus uuid[];
begin
  if public.papel_atual() <> 'cliente' then
    raise exception 'Acesso restrito ao portal do cliente.';
  end if;
  select coalesce(array_agg(grupo_id), '{}') into meus from public.perfil_grupos where perfil_id = auth.uid();
  return jsonb_build_object(
    'grupos', (select coalesce(jsonb_agg(nome order by nome), '[]') from public.grupos where id = any(meus)),
    'clientes', (select coalesce(jsonb_agg(to_jsonb(c) - 'obs' - 'historico_cadastral' - 'criado_por' - 'chave_importacao'
                  || jsonb_build_object('grupo_nome', g.nome)), '[]')
                 from public.clientes c join public.grupos g on g.id = c.grupo_id where c.grupo_id = any(meus)),
    'processos', (select coalesce(jsonb_agg(to_jsonb(p) - 'obs' - 'criado_por' - 'chave_importacao'
                  || jsonb_build_object('grupo_nome', g.nome)), '[]')
                  from public.processos p join public.grupos g on g.id = p.grupo_id where p.grupo_id = any(meus)),
    'parcelamentos', (select coalesce(jsonb_agg(to_jsonb(pa) - 'obs' - 'criado_por' - 'chave_importacao'
                  || jsonb_build_object('grupo_nome', g.nome, 'parcelas',
                       (select coalesce(jsonb_agg(to_jsonb(x) - 'chave_importacao' order by x.vencimento), '[]')
                        from public.parcelas x where x.parcelamento_id = pa.id))), '[]')
                  from public.parcelamentos pa join public.grupos g on g.id = pa.grupo_id where pa.grupo_id = any(meus)),
    'acordos', (select coalesce(jsonb_agg(to_jsonb(a) - 'obs' - 'pix' - 'banco' - 'criado_por' - 'chave_importacao'
                  || jsonb_build_object('grupo_nome', g.nome)), '[]')
                from public.acordos a join public.grupos g on g.id = a.grupo_id where a.grupo_id = any(meus))
  );
end $$;
revoke all on function public.portal_dados() from anon;
grant execute on function public.portal_dados() to authenticated;

-- ─────────────────────────── v3: configurações ───────────────────────────
-- Dados que o ERP usa mas que não podem ficar no HTML público (ex.: CPF e
-- endereço dos advogados nos recibos). Só a equipe lê; só o admin altera.
create table if not exists public.configuracoes (
  chave         text primary key,
  valor         jsonb not null,
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
