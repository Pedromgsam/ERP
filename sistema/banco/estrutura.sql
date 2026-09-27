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

-- ─────────────────────────── v4: contratos no ERP ───────────────────────────
-- Parcelas geradas pelo contrato já nascem com o grupo do cliente e o
-- responsável, para aparecerem certinhas em Honorários Jurídico.
alter table public.contratos add column if not exists responsavel text not null default '';
create or replace function public.gerar_parcelas_contrato() returns trigger
language plpgsql as $$
declare
  i int; base numeric(14,2); v numeric(14,2); g uuid;
begin
  if new.valor_total > 0 and new.primeiro_vencimento is not null then
    select grupo_id into g from public.clientes where id = new.cliente_id;
    base := trunc(new.valor_total / new.num_parcelas, 2);
    for i in 1..new.num_parcelas loop
      v := case when i = new.num_parcelas
                then new.valor_total - base * (new.num_parcelas - 1) else base end;
      insert into public.lancamentos
        (empresa, tipo, descricao, categoria, cliente_id, contrato_id, grupo_id, responsavel, referencia,
         parcela, total_parcelas, vencimento, valor)
      values
        ('escritorio', 'receita', new.descricao || case when new.num_parcelas > 1
                                          then ' — parcela ' || i || '/' || new.num_parcelas else '' end,
         'Honorários', new.cliente_id, new.id, g, new.responsavel,
         case when new.num_parcelas > 1 then i || '/' || new.num_parcelas else '' end,
         i, new.num_parcelas, (new.primeiro_vencimento + make_interval(months => i - 1))::date, v);
    end loop;
  end if;
  return new;
end $$;

-- ─────────────────── v5: comissão é redutor de receita ───────────────────
-- Comissão/desconto não é despesa: é um ajuste que diminui a receita
-- (em vez de receber 5.000, o escritório recebe 3.500). Fica como receita
-- com "redutor" marcado e entra nas somas com sinal negativo.
alter table public.lancamentos add column if not exists redutor boolean not null default false;
-- deduções que vieram das abas de receita (valor negativo na planilha) viraram "despesa com grupo e sem fornecedor"
update public.lancamentos set tipo = 'receita', redutor = true
 where tipo = 'despesa' and redutor = false and grupo_id is not null and favorecido = '';

-- ═══════════════════════════════════════════════════════════════════
-- v6 (2026-09-27) — Fase 1: ficha 360° do cliente · Fase 2: documentos ·
-- Fase 3: tarefas completas (fluxos, subtarefas, prazos, modelos, feriados).
-- ═══════════════════════════════════════════════════════════════════

-- ── Fase 1: ficha 360° ──
create table if not exists public.contatos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nome text not null default '', cargo text not null default '',
  finalidade text not null default 'geral',      -- geral, financeiro, marketing, juridico, socio, contador, cobranca
  email text not null default '', telefone text not null default '', whatsapp boolean not null default false,
  recebe_boletos boolean not null default false, recebe_notificacoes boolean not null default false,
  preferencia text not null default '', obs text not null default '',
  criado_por uuid default auth.uid(), criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create index if not exists contatos_cliente on public.contatos (cliente_id);
create table if not exists public.enderecos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  tipo text not null default 'sede',              -- sede, correspondencia, cobranca, filial, residencial
  logradouro text not null default '', numero text not null default '', complemento text not null default '',
  bairro text not null default '', cidade text not null default '', uf text not null default '', cep text not null default '',
  principal boolean not null default false, obs text not null default '',
  criado_por uuid default auth.uid(), criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create index if not exists enderecos_cliente on public.enderecos (cliente_id);
create table if not exists public.contas_bancarias (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  banco text not null default '', agencia text not null default '', conta text not null default '', tipo_conta text not null default '',
  pix text not null default '', titular text not null default '', documento_titular text not null default '',
  uso text not null default '',                   -- recebimento, pagamento, restituicao
  principal boolean not null default false, obs text not null default '',
  criado_por uuid default auth.uid(), criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create index if not exists contas_bancarias_cliente on public.contas_bancarias (cliente_id);
create table if not exists public.vinculos_societarios (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nome text not null default '', cpf_cnpj text not null default '', qualificacao text not null default '',
  participacao numeric(7,4), email text not null default '', telefone text not null default '', obs text not null default '',
  criado_por uuid default auth.uid(), criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create index if not exists vinculos_cliente on public.vinculos_societarios (cliente_id);
create table if not exists public.etiquetas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (btrim(nome) <> ''), cor text not null default '#2E5EAA',
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create unique index if not exists etiquetas_nome on public.etiquetas (lower(btrim(nome)));
create table if not exists public.cliente_etiquetas (
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  etiqueta_id uuid not null references public.etiquetas(id) on delete cascade,
  primary key (cliente_id, etiqueta_id)
);
-- linha do tempo: ligações, e-mails, reuniões, WhatsApp, anotações (também usada pelo CRM)
create table if not exists public.interacoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete cascade,
  tipo text not null default 'anotacao',          -- ligacao, email, reuniao, whatsapp, anotacao
  quando timestamptz not null default now(), resumo text not null check (btrim(resumo) <> ''),
  criado_por uuid default auth.uid(), criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create index if not exists interacoes_cliente on public.interacoes (cliente_id, quando desc);
create table if not exists public.certidoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  orgao text not null default '',                 -- RFB/PGFN, Estadual MG, Municipal, Trabalhista, FGTS
  situacao text not null default '',              -- negativa, positiva com efeito de negativa, positiva
  emissao date, validade date, obs text not null default '',
  criado_por uuid default auth.uid(), criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create index if not exists certidoes_cliente on public.certidoes (cliente_id, validade);

-- ── Fase 2: documentos (arquivo no Storage privado "documentos") ──
create table if not exists public.documentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete set null,
  grupo_id uuid references public.grupos(id) on delete set null,
  contrato_id uuid references public.contratos(id) on delete set null,
  lancamento_id uuid references public.lancamentos(id) on delete set null,
  processo_id uuid references public.processos(id) on delete set null,
  tarefa_id uuid references public.tarefas(id) on delete set null,
  tipo text not null default 'outro',             -- contrato, procuracao, pessoal, certidao, guia, comprovante, peticao, proposta, outro
  nome text not null check (btrim(nome) <> ''),
  caminho text not null,                          -- caminho do arquivo no bucket
  tamanho bigint, mime text not null default '',
  versao int not null default 1, documento_pai_id uuid references public.documentos(id) on delete set null,
  validade date, etiquetas text not null default '', obs text not null default '',
  liberado_cliente boolean not null default false, arquivado boolean not null default false,
  criado_por uuid default auth.uid(), criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create index if not exists documentos_cliente on public.documentos (cliente_id);
create index if not exists documentos_contrato on public.documentos (contrato_id);
create index if not exists documentos_lancamento on public.documentos (lancamento_id);

-- ── Fase 3: tarefas completas ──
create table if not exists public.modelos_fluxo (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (btrim(nome) <> ''), descricao text not null default '',
  itens jsonb not null default '[]',              -- [{titulo, dias (antes do fatal, úteis), responsavel, checklist:[...], subtarefas:[...]}]
  criado_por uuid default auth.uid(), criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create table if not exists public.fluxos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (btrim(nome) <> ''),
  cliente_id uuid references public.clientes(id) on delete set null,
  grupo_id uuid references public.grupos(id) on delete set null,
  modelo_id uuid references public.modelos_fluxo(id) on delete set null,
  responsavel text not null default '', status text not null default 'ativo',   -- ativo, concluido, cancelado
  inicio date, prazo_fatal date, obs text not null default '',
  criado_por uuid default auth.uid(), criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
alter table public.tarefas add column if not exists tarefa_pai_id uuid references public.tarefas(id) on delete cascade;
alter table public.tarefas add column if not exists fluxo_id uuid references public.fluxos(id) on delete cascade;
alter table public.tarefas add column if not exists cliente_id uuid references public.clientes(id) on delete set null;
alter table public.tarefas add column if not exists contrato_id uuid references public.contratos(id) on delete set null;
alter table public.tarefas add column if not exists descricao text not null default '';
alter table public.tarefas add column if not exists participantes text not null default '';
alter table public.tarefas add column if not exists etiquetas text not null default '';
alter table public.tarefas add column if not exists prazo_fatal date;
alter table public.tarefas add column if not exists estimativa_horas numeric(6,1);
alter table public.tarefas add column if not exists checklist jsonb not null default '[]';
alter table public.tarefas add column if not exists depende_de uuid references public.tarefas(id) on delete set null;
alter table public.tarefas add column if not exists recorrencia text not null default '';   -- '', semanal, mensal, anual
alter table public.tarefas add column if not exists ordem int not null default 0;
alter table public.tarefas add column if not exists concluida_em timestamptz;
alter table public.tarefas add column if not exists concluida_por uuid;
create index if not exists tarefas_pai on public.tarefas (tarefa_pai_id);
create index if not exists tarefas_fluxo on public.tarefas (fluxo_id);
create index if not exists tarefas_prazo on public.tarefas (prazo);
create table if not exists public.comentarios (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  texto text not null check (btrim(texto) <> ''),
  criado_por uuid default auth.uid(), criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create index if not exists comentarios_tarefa on public.comentarios (tarefa_id, criado_em);
create table if not exists public.feriados (
  data date not null, nome text not null default '', abrangencia text not null default 'nacional',   -- nacional, estadual, municipal, tribunal
  local text not null default '', primary key (data, abrangencia, local)
);
-- notificações dentro do sistema (sino): tarefa atribuída, menção etc.
create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfis(id) on delete cascade,
  tipo text not null default '', titulo text not null default '', detalhe text not null default '',
  link text not null default '', lida boolean not null default false, criado_em timestamptz not null default now()
);
create index if not exists notificacoes_usuario on public.notificacoes (usuario_id, lida, criado_em desc);

-- conclusão: carimba quem/quando; não conclui com checklist pendente; recria tarefas recorrentes
create or replace function public.tarefa_ao_concluir() returns trigger
language plpgsql as $$
begin
  if new.status = 'concluida' and (tg_op = 'INSERT' or old.status is distinct from 'concluida') then
    if exists (select 1 from jsonb_array_elements(coalesce(new.checklist, '[]')) e where coalesce((e->>'feito')::boolean, false) = false) then
      raise exception 'Conclua todos os itens do checklist antes de concluir a tarefa.';
    end if;
    new.concluida_em := now(); new.concluida_por := auth.uid();
    if tg_op = 'UPDATE' and new.recorrencia in ('semanal','mensal','anual') and new.prazo is not null then
      insert into public.tarefas (titulo, grupo_id, cliente_id, contrato_id, processos_vinculados, prioridade, responsavel, status,
        inicio, prazo, prazo_fatal, descricao, participantes, etiquetas, checklist, recorrencia, fluxo_id, tarefa_pai_id)
      values (new.titulo, new.grupo_id, new.cliente_id, new.contrato_id, new.processos_vinculados, new.prioridade, new.responsavel, 'pendente',
        new.prazo, (new.prazo + case new.recorrencia when 'semanal' then interval '7 days' when 'mensal' then interval '1 month' else interval '1 year' end)::date,
        case when new.prazo_fatal is null then null else (new.prazo_fatal + case new.recorrencia when 'semanal' then interval '7 days' when 'mensal' then interval '1 month' else interval '1 year' end)::date end,
        new.descricao, new.participantes, new.etiquetas,
        (select coalesce(jsonb_agg(jsonb_set(e, '{feito}', 'false')), '[]') from jsonb_array_elements(coalesce(new.checklist, '[]')) e),
        new.recorrencia, new.fluxo_id, new.tarefa_pai_id);
    end if;
  elsif new.status <> 'concluida' then
    new.concluida_em := null; new.concluida_por := null;
  end if;
  return new;
end $$;
drop trigger if exists tarefa_ao_concluir on public.tarefas;
create trigger tarefa_ao_concluir before insert or update on public.tarefas
  for each row execute function public.tarefa_ao_concluir();

-- datas de alteração, histórico e regras de acesso das tabelas novas
do $$
declare t text;
begin
  foreach t in array array['contatos','enderecos','contas_bancarias','vinculos_societarios','etiquetas','interacoes','certidoes',
                           'documentos','modelos_fluxo','fluxos','comentarios'] loop
    execute format('drop trigger if exists atualizado_%1$s on public.%1$s', t);
    execute format('create trigger atualizado_%1$s before update on public.%1$s for each row execute function public.marcar_atualizacao()', t);
    execute format('drop trigger if exists hist_%1$s on public.%1$s', t);
    execute format('create trigger hist_%1$s after insert or update or delete on public.%1$s for each row execute function public.registrar_historico()', t);
  end loop;
  foreach t in array array['contatos','enderecos','contas_bancarias','vinculos_societarios','etiquetas','cliente_etiquetas','interacoes',
                           'certidoes','documentos','modelos_fluxo','fluxos','comentarios','feriados','notificacoes'] loop
    execute format('alter table public.%1$s enable row level security', t);
    execute format('revoke all on public.%1$s from anon', t);
    execute format('grant select, insert, update, delete on public.%1$s to authenticated', t);
  end loop;
  -- equipe lê e grava; exclusão: equipe nos detalhes do cliente e nas tarefas; admin em documentos e fluxos
  foreach t in array array['contatos','enderecos','contas_bancarias','vinculos_societarios','etiquetas','cliente_etiquetas','interacoes',
                           'certidoes','documentos','modelos_fluxo','fluxos','comentarios','feriados'] loop
    execute format('drop policy if exists %1$s_ver on public.%1$s', t);
    execute format('create policy %1$s_ver on public.%1$s for select to authenticated using (public.eh_equipe())', t);
    execute format('drop policy if exists %1$s_incluir on public.%1$s', t);
    execute format('create policy %1$s_incluir on public.%1$s for insert to authenticated with check (public.eh_equipe())', t);
    execute format('drop policy if exists %1$s_alterar on public.%1$s', t);
    execute format('create policy %1$s_alterar on public.%1$s for update to authenticated using (public.eh_equipe()) with check (public.eh_equipe())', t);
    execute format('drop policy if exists %1$s_excluir on public.%1$s', t);
    execute format('create policy %1$s_excluir on public.%1$s for delete to authenticated using (%2$s)', t,
                   case when t in ('documentos','fluxos','modelos_fluxo','feriados') then 'public.eh_admin()' else 'public.eh_equipe()' end);
  end loop;
end $$;
-- notificações: cada um vê e marca as suas; a equipe pode criar para colegas (ex.: tarefa atribuída, menção)
drop policy if exists notificacoes_ver on public.notificacoes;
create policy notificacoes_ver on public.notificacoes for select to authenticated using (usuario_id = auth.uid());
drop policy if exists notificacoes_incluir on public.notificacoes;
create policy notificacoes_incluir on public.notificacoes for insert to authenticated with check (public.eh_equipe());
drop policy if exists notificacoes_alterar on public.notificacoes;
create policy notificacoes_alterar on public.notificacoes for update to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
drop policy if exists notificacoes_excluir on public.notificacoes;
create policy notificacoes_excluir on public.notificacoes for delete to authenticated using (usuario_id = auth.uid());
-- a equipe precisa ver os nomes dos colegas para atribuir tarefas e mencionar
create or replace function public.equipe_nomes() returns table (id uuid, nome text, email text)
language sql stable security definer set search_path = public as $$
  select p.id, p.nome, p.email from public.perfis p where public.eh_equipe() and p.papel in ('admin','equipe') order by p.nome;
$$;
revoke all on function public.equipe_nomes() from anon;
grant execute on function public.equipe_nomes() to authenticated;

-- feriados nacionais fixos (anos 2026 e 2027) e móveis principais; o admin pode acrescentar os de MG, municipais e de tribunal
insert into public.feriados (data, nome, abrangencia) values
  ('2026-01-01','Confraternização Universal','nacional'),('2026-02-16','Carnaval','nacional'),('2026-02-17','Carnaval','nacional'),
  ('2026-04-03','Sexta-feira Santa','nacional'),('2026-04-21','Tiradentes','nacional'),('2026-05-01','Dia do Trabalho','nacional'),
  ('2026-06-04','Corpus Christi','nacional'),('2026-09-07','Independência','nacional'),('2026-10-12','Nossa Senhora Aparecida','nacional'),
  ('2026-11-02','Finados','nacional'),('2026-11-15','Proclamação da República','nacional'),('2026-11-20','Consciência Negra','nacional'),
  ('2026-12-25','Natal','nacional'),
  ('2027-01-01','Confraternização Universal','nacional'),('2027-02-08','Carnaval','nacional'),('2027-02-09','Carnaval','nacional'),
  ('2027-03-26','Sexta-feira Santa','nacional'),('2027-04-21','Tiradentes','nacional'),('2027-05-01','Dia do Trabalho','nacional'),
  ('2027-05-27','Corpus Christi','nacional'),('2027-09-07','Independência','nacional'),('2027-10-12','Nossa Senhora Aparecida','nacional'),
  ('2027-11-02','Finados','nacional'),('2027-11-15','Proclamação da República','nacional'),('2027-11-20','Consciência Negra','nacional'),
  ('2027-12-25','Natal','nacional')
on conflict do nothing;

-- modelos de fluxo iniciais (o escritório pode editar na tela Tarefas → Modelos)
insert into public.modelos_fluxo (nome, descricao, itens)
select 'Onboarding de cliente', 'Do contrato assinado ao cliente com tudo em dia',
  '[{"titulo":"Boas-vindas e alinhamento","dias":10,"checklist":["Enviar mensagem de boas-vindas","Agendar reunião de alinhamento"]},
    {"titulo":"Solicitar documentos","dias":8,"subtarefas":[{"titulo":"Contrato social e alterações","dias":8},{"titulo":"Procuração assinada","dias":8},{"titulo":"Certificado digital / acesso e-CAC","dias":6}]},
    {"titulo":"Diagnóstico fiscal (e-CAC, PGFN, SEFAZ)","dias":4},
    {"titulo":"Relatório inicial ao cliente","dias":0}]'::jsonb
where not exists (select 1 from public.modelos_fluxo where nome = 'Onboarding de cliente');
insert into public.modelos_fluxo (nome, descricao, itens)
select 'Defesa em execução fiscal', 'Prazos contados para trás a partir do prazo fatal',
  '[{"titulo":"Analisar CDA e processo","dias":10,"checklist":["Baixar autos","Conferir prescrição e decadência","Levantar garantias"]},
    {"titulo":"Reunião de estratégia com o cliente","dias":7},
    {"titulo":"Minuta da defesa","dias":4,"subtarefas":[{"titulo":"Pesquisa de jurisprudência","dias":5},{"titulo":"Cálculos","dias":5}]},
    {"titulo":"Revisão do sócio","dias":2},
    {"titulo":"Protocolo","dias":0}]'::jsonb
where not exists (select 1 from public.modelos_fluxo where nome = 'Defesa em execução fiscal');
insert into public.modelos_fluxo (nome, descricao, itens)
select 'Parcelamento tributário', 'Adesão e acompanhamento',
  '[{"titulo":"Levantar débitos e modalidades","dias":6},{"titulo":"Simulação e aprovação do cliente","dias":4},
    {"titulo":"Adesão no portal","dias":1,"checklist":["Emitir 1ª guia","Enviar guia ao cliente"]},{"titulo":"Confirmar pagamento da 1ª parcela","dias":0}]'::jsonb
where not exists (select 1 from public.modelos_fluxo where nome = 'Parcelamento tributário');

-- Storage: bucket privado "documentos" (só existe no Supabase; o teste local ignora)
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('documentos', 'documentos', false, 52428800) on conflict (id) do nothing;
    execute 'drop policy if exists documentos_ver on storage.objects';
    execute 'create policy documentos_ver on storage.objects for select to authenticated using (bucket_id = ''documentos'' and public.eh_equipe())';
    execute 'drop policy if exists documentos_enviar on storage.objects';
    execute 'create policy documentos_enviar on storage.objects for insert to authenticated with check (bucket_id = ''documentos'' and public.eh_equipe())';
    execute 'drop policy if exists documentos_alterar on storage.objects';
    execute 'create policy documentos_alterar on storage.objects for update to authenticated using (bucket_id = ''documentos'' and public.eh_equipe())';
    execute 'drop policy if exists documentos_apagar on storage.objects';
    execute 'create policy documentos_apagar on storage.objects for delete to authenticated using (bucket_id = ''documentos'' and public.eh_admin())';
  end if;
exception when insufficient_privilege then
  raise notice 'Sem permissão para criar a pasta de arquivos: crie o bucket privado "documentos" em Storage.';
end $$;

-- ═══════════════════════════════════════════════════════════════════
-- v7 (2026-09-27) — FUNÇÕES DE ACESSO POR PESSOA
-- Além do papel (admin, equipe, cliente, inativo), cada pessoa da equipe
-- tem funções: {"financeiro_juridico":"editar","contratos":"ver",...}.
-- O admin tem tudo. A proteção vale no banco (RLS), não só na tela.
-- ═══════════════════════════════════════════════════════════════════
alter table public.perfis add column if not exists funcoes jsonb not null default '{}'::jsonb;

-- migração (uma vez só): quem já é equipe recebe todas as funções, para ninguém perder acesso
do $$
begin
  if not exists (select 1 from public.configuracoes where chave = 'migracao_v7_funcoes') then
    update public.perfis set funcoes = '{"financeiro_juridico":"editar","financeiro_contab":"editar","contratos":"editar","clientes":"editar",
      "juridico":"editar","tarefas":"editar","documentos":"editar","crm":"editar","relatorios":"editar"}'::jsonb
     where papel = 'equipe' and funcoes = '{}'::jsonb;
    insert into public.configuracoes (chave, valor) values ('migracao_v7_funcoes', '{"feito":true}');
  end if;
end $$;

-- pode('financeiro_juridico') = pode ver; pode('contratos','editar') = pode gravar
create or replace function public.pode(f text, nivel text default 'ver') returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when p.papel = 'admin' then true
                when p.papel <> 'equipe' then false
                when coalesce(p.funcoes->>f, '') = 'editar' then true
                when coalesce(p.funcoes->>f, '') = 'ver' then nivel = 'ver'
                else false end
      from public.perfis p where p.id = auth.uid()), false);
$$;
revoke all on function public.pode(text, text) from anon;
grant execute on function public.pode(text, text) to authenticated;

-- a tarefa é minha? (responsável ou participante, pelo primeiro nome do perfil)
create or replace function public.primeiro_nome(t text) returns text
language sql immutable as $$
  select lower(translate(split_part(btrim(coalesce(t, '')), ' ', 1), 'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç', 'AAAAEEIOOOUCaaaaeeiooouc'));
$$;
create or replace function public.tarefa_minha(resp text, part text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis p
    where p.id = auth.uid() and p.papel in ('admin','equipe') and public.primeiro_nome(p.nome) <> ''
      and (public.primeiro_nome(p.nome) = public.primeiro_nome(resp)
           or public.primeiro_nome(p.nome) in (select public.primeiro_nome(x) from unnest(string_to_array(coalesce(part, ''), ',')) x)));
$$;
revoke all on function public.tarefa_minha(text, text) from anon;
grant execute on function public.tarefa_minha(text, text) to authenticated;

-- contrato gera as parcelas mesmo para quem não tem a função Financeiro
alter function public.gerar_parcelas_contrato() security definer;
alter function public.gerar_parcelas_contrato() set search_path = public;

-- regras por tabela: ver / gravar (incluir e alterar) / excluir
do $$
declare
  r record;
begin
  for r in select * from (values
    -- tabela,               ver,                                  gravar,                                   excluir
    ('grupos',               'public.eh_equipe()',                 'public.eh_equipe()',                     'public.pode(''clientes'',''editar'')'),
    ('clientes',             'public.eh_equipe()',                 'public.pode(''clientes'',''editar'')',   'public.eh_admin()'),
    ('contratos',            'public.pode(''contratos'')',         'public.pode(''contratos'',''editar'')',  'public.eh_admin()'),
    ('lancamentos',          'public.pode(case when empresa = ''contabilidade'' then ''financeiro_contab'' else ''financeiro_juridico'' end)',
                             'public.pode(case when empresa = ''contabilidade'' then ''financeiro_contab'' else ''financeiro_juridico'' end, ''editar'')',
                             'public.pode(case when empresa = ''contabilidade'' then ''financeiro_contab'' else ''financeiro_juridico'' end, ''editar'')'),
    ('processos',            'public.pode(''juridico'')',          'public.pode(''juridico'',''editar'')',   'public.eh_admin()'),
    ('parcelamentos',        'public.pode(''juridico'')',          'public.pode(''juridico'',''editar'')',   'public.eh_admin()'),
    ('parcelas',             'public.pode(''juridico'')',          'public.pode(''juridico'',''editar'')',   'public.pode(''juridico'',''editar'')'),
    ('acordos',              'public.pode(''juridico'')',          'public.pode(''juridico'',''editar'')',   'public.eh_admin()'),
    ('tarefas',              'public.pode(''tarefas'') or public.tarefa_minha(responsavel, participantes)',
                             'public.pode(''tarefas'',''editar'') or public.tarefa_minha(responsavel, participantes)',
                             'public.pode(''tarefas'',''editar'')'),
    ('contatos',             'public.pode(''clientes'')',          'public.pode(''clientes'',''editar'')',   'public.pode(''clientes'',''editar'')'),
    ('enderecos',            'public.pode(''clientes'')',          'public.pode(''clientes'',''editar'')',   'public.pode(''clientes'',''editar'')'),
    ('contas_bancarias',     'public.pode(''clientes'')',          'public.pode(''clientes'',''editar'')',   'public.pode(''clientes'',''editar'')'),
    ('vinculos_societarios', 'public.pode(''clientes'')',          'public.pode(''clientes'',''editar'')',   'public.pode(''clientes'',''editar'')'),
    ('interacoes',           'public.pode(''clientes'')',          'public.pode(''clientes'',''editar'')',   'public.pode(''clientes'',''editar'')'),
    ('certidoes',            'public.pode(''clientes'')',          'public.pode(''clientes'',''editar'')',   'public.pode(''clientes'',''editar'')'),
    ('cliente_etiquetas',    'public.eh_equipe()',                 'public.pode(''clientes'',''editar'')',   'public.pode(''clientes'',''editar'')'),
    ('documentos',           'public.pode(''documentos'') and (lancamento_id is null or public.pode(''financeiro_juridico'') or public.pode(''financeiro_contab''))',
                             'public.pode(''documentos'',''editar'')', 'public.eh_admin()'),
    ('fluxos',               'public.eh_equipe()',                 'public.pode(''tarefas'',''editar'')',    'public.eh_admin()'),
    ('modelos_fluxo',        'public.eh_equipe()',                 'public.pode(''tarefas'',''editar'')',    'public.eh_admin()'),
    ('feriados',             'public.eh_equipe()',                 'public.pode(''tarefas'',''editar'')',    'public.eh_admin()')
  ) as t(tabela, ver, gravar, excluir) loop
    execute format('drop policy if exists %1$s_ver on public.%1$s', r.tabela);
    execute format('create policy %1$s_ver on public.%1$s for select to authenticated using (%2$s)', r.tabela, r.ver);
    execute format('drop policy if exists %1$s_incluir on public.%1$s', r.tabela);
    execute format('create policy %1$s_incluir on public.%1$s for insert to authenticated with check (%2$s)', r.tabela, r.gravar);
    execute format('drop policy if exists %1$s_alterar on public.%1$s', r.tabela);
    execute format('create policy %1$s_alterar on public.%1$s for update to authenticated using (%2$s) with check (%2$s)', r.tabela, r.gravar);
    execute format('drop policy if exists %1$s_excluir on public.%1$s', r.tabela);
    execute format('create policy %1$s_excluir on public.%1$s for delete to authenticated using (%2$s)', r.tabela, r.excluir);
  end loop;
end $$;

-- arquivos: mesma regra da função Documentos
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    execute 'drop policy if exists documentos_ver on storage.objects';
    execute 'create policy documentos_ver on storage.objects for select to authenticated using (bucket_id = ''documentos'' and public.pode(''documentos''))';
    execute 'drop policy if exists documentos_enviar on storage.objects';
    execute 'create policy documentos_enviar on storage.objects for insert to authenticated with check (bucket_id = ''documentos'' and public.pode(''documentos'',''editar''))';
    execute 'drop policy if exists documentos_alterar on storage.objects';
    execute 'create policy documentos_alterar on storage.objects for update to authenticated using (bucket_id = ''documentos'' and public.pode(''documentos'',''editar''))';
  end if;
exception when insufficient_privilege then
  raise notice 'Sem permissão em storage.objects: as regras dos arquivos continuam as da v6.';
end $$;

-- ═══════════════════════════════════════════════════════════════════
-- v8 (2026-09-27) — LÓGICA INTERNA DAS TAREFAS
-- Regras automáticas (sem duplicar), revisão antes de concluir, anexo
-- obrigatório, controle de horas, dias úteis e escalonamento de atrasos.
-- ═══════════════════════════════════════════════════════════════════
alter table public.tarefas add column if not exists chave_regra text;
alter table public.tarefas add column if not exists exige_anexo boolean not null default false;
alter table public.tarefas add column if not exists exige_revisao boolean not null default false;
alter table public.tarefas add column if not exists revisor text not null default '';
alter table public.tarefas add column if not exists escalada_em date;
create unique index if not exists tarefas_chave_regra on public.tarefas (chave_regra) where chave_regra is not null;

-- dias úteis (sábado, domingo e feriados cadastrados não contam)
create or replace function public.dia_util(d date) returns boolean
language sql stable set search_path = public as $$
  select extract(isodow from d) < 6 and not exists (select 1 from public.feriados f where f.data = d);
$$;
create or replace function public.somar_uteis(d date, n int) returns date
language plpgsql stable set search_path = public as $$
declare r date := d; passo int := case when n < 0 then -1 else 1 end; k int := abs(n);
begin
  while k > 0 loop
    r := r + passo;
    if public.dia_util(r) then k := k - 1; end if;
  end loop;
  return r;
end $$;
create or replace function public.uteis_entre(a date, b date) returns int
language sql stable set search_path = public as $$
  select count(*)::int from generate_series(least(a, b) + 1, greatest(a, b), interval '1 day') g where public.dia_util(g::date);
$$;

-- id do usuário pelo primeiro nome (responsável é texto: "Pedro", "Adriana")
create or replace function public.usuario_por_nome(nome text) returns uuid
language sql stable security definer set search_path = public as $$
  select p.id from public.perfis p
   where p.papel in ('admin','equipe') and public.primeiro_nome($1) <> ''   -- $1: o nome procurado (não a coluna perfis.nome)
     and (public.primeiro_nome(p.nome) = public.primeiro_nome($1) or public.primeiro_nome(split_part(p.email, '@', 1)) = public.primeiro_nome($1))
   order by p.criado_em limit 1;
$$;

-- concluir: checklist completo, anexo quando exigido, revisão quando exigida
create or replace function public.tarefa_ao_concluir() returns trigger
language plpgsql as $$
declare quem uuid;
begin
  if new.status = 'concluida' and (tg_op = 'INSERT' or old.status is distinct from 'concluida') then
    if exists (select 1 from jsonb_array_elements(coalesce(new.checklist, '[]')) e where coalesce((e->>'feito')::boolean, false) = false) then
      raise exception 'Conclua todos os itens do checklist antes de concluir a tarefa.';
    end if;
    if new.exige_anexo and tg_op = 'UPDATE' and not exists (select 1 from public.documentos d where d.tarefa_id = new.id and not d.arquivado) then
      raise exception 'Esta tarefa exige um documento anexado (ex.: protocolo) antes de ser concluída.';
    end if;
    -- em revisão: só o revisor (ou o administrador) conclui
    if new.exige_revisao and tg_op = 'UPDATE' and old.status = 'revisao' and auth.uid() is not null
       and not public.eh_admin() and public.usuario_por_nome(new.revisor) is distinct from auth.uid() then
      raise exception 'Esta tarefa está em revisão: só o revisor (%) pode concluir.', new.revisor;
    end if;
    -- com revisão: quem fez manda para o revisor; só sai de "revisão" para "concluída"
    if new.exige_revisao and tg_op = 'UPDATE' and old.status is distinct from 'revisao' then
      new.status := 'revisao';
      quem := public.usuario_por_nome(new.revisor);
      if quem is not null and quem is distinct from auth.uid() then
        insert into public.notificacoes (usuario_id, tipo, titulo, detalhe, link)
        values (quem, 'revisao', 'Revisar: ' || new.titulo, 'Enviada para sua revisão', 'tarefas');
      end if;
      return new;
    end if;
    new.concluida_em := now(); new.concluida_por := auth.uid();
    if tg_op = 'UPDATE' and new.recorrencia in ('semanal','mensal','anual') and new.prazo is not null then
      insert into public.tarefas (titulo, grupo_id, cliente_id, contrato_id, processos_vinculados, prioridade, responsavel, status,
        inicio, prazo, prazo_fatal, descricao, participantes, etiquetas, checklist, recorrencia, fluxo_id, tarefa_pai_id,
        exige_anexo, exige_revisao, revisor, estimativa_horas)
      values (new.titulo, new.grupo_id, new.cliente_id, new.contrato_id, new.processos_vinculados, new.prioridade, new.responsavel, 'pendente',
        new.prazo, (new.prazo + case new.recorrencia when 'semanal' then interval '7 days' when 'mensal' then interval '1 month' else interval '1 year' end)::date,
        case when new.prazo_fatal is null then null else (new.prazo_fatal + case new.recorrencia when 'semanal' then interval '7 days' when 'mensal' then interval '1 month' else interval '1 year' end)::date end,
        new.descricao, new.participantes, new.etiquetas,
        (select coalesce(jsonb_agg(jsonb_set(e, '{feito}', 'false')), '[]') from jsonb_array_elements(coalesce(new.checklist, '[]')) e),
        new.recorrencia, new.fluxo_id, new.tarefa_pai_id, new.exige_anexo, new.exige_revisao, new.revisor, new.estimativa_horas);
    end if;
  elsif new.status <> 'concluida' then
    new.concluida_em := null; new.concluida_por := null;
  end if;
  return new;
end $$;

-- horas gastas (botão ▶/■ na tarefa)
create table if not exists public.tarefa_tempos (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  usuario uuid default auth.uid(),
  inicio timestamptz not null default now(), fim timestamptz,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
-- regras automáticas (Tarefas → Regras)
create table if not exists public.regras_tarefas (
  chave text primary key, nome text not null, descricao text not null default '',
  ligada boolean not null default true, dias int not null default 5, responsavel text not null default '',
  atualizado_em timestamptz not null default now()
);
insert into public.regras_tarefas (chave, nome, descricao, ligada, dias) values
  ('contrato_onboarding', 'Contrato novo → onboarding do cliente', 'Cria a tarefa de boas-vindas com o checklist do modelo "Onboarding de cliente"; prazo em N dias úteis', true, 10),
  ('processo_novo', 'Processo cadastrado → conferir processo e prazos', 'Para o advogado do processo; prazo em N dias úteis', true, 2),
  ('certidao_vencendo', 'Certidão ou documento vencendo → renovar', 'N dias antes da validade, para o responsável do cliente', true, 15),
  ('parcela_parcelamento', 'Parcela de parcelamento do cliente → emitir guia', 'N dias antes do vencimento, para o responsável do cliente', true, 5),
  ('parcela_acordo', 'Parcela de acordo do cliente → lembrar o cliente', 'N dias antes do vencimento (acompanhamento; não entra no financeiro)', true, 5),
  ('cobrar_honorario', 'Honorário vencido → cobrar', 'N dias depois do vencimento sem pagamento', false, 3),
  ('escalar_atraso', 'Tarefa atrasada → avisar o administrador', 'Depois de N dias úteis de atraso; com mais 2 dias a prioridade vira Alta', true, 3)
on conflict (chave) do nothing;

do $$
declare t text;
begin
  foreach t in array array['tarefa_tempos','regras_tarefas'] loop
    execute format('alter table public.%1$s enable row level security', t);
    execute format('revoke all on public.%1$s from anon', t);
    execute format('grant select, insert, update, delete on public.%1$s to authenticated', t);
    execute format('drop trigger if exists atualizado_%1$s on public.%1$s', t);
    execute format('create trigger atualizado_%1$s before update on public.%1$s for each row execute function public.marcar_atualizacao()', t);
  end loop;
end $$;
drop policy if exists tarefa_tempos_ver on public.tarefa_tempos;
create policy tarefa_tempos_ver on public.tarefa_tempos for select to authenticated using (public.eh_equipe());
drop policy if exists tarefa_tempos_gravar on public.tarefa_tempos;
create policy tarefa_tempos_gravar on public.tarefa_tempos for insert to authenticated with check (public.eh_equipe() and usuario = auth.uid());
drop policy if exists tarefa_tempos_alterar on public.tarefa_tempos;
create policy tarefa_tempos_alterar on public.tarefa_tempos for update to authenticated using (usuario = auth.uid()) with check (usuario = auth.uid());
drop policy if exists tarefa_tempos_excluir on public.tarefa_tempos;
create policy tarefa_tempos_excluir on public.tarefa_tempos for delete to authenticated using (usuario = auth.uid() or public.eh_admin());
drop policy if exists regras_tarefas_ver on public.regras_tarefas;
create policy regras_tarefas_ver on public.regras_tarefas for select to authenticated using (public.eh_equipe());
drop policy if exists regras_tarefas_admin on public.regras_tarefas;
create policy regras_tarefas_admin on public.regras_tarefas for update to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- cria uma tarefa da regra (a chave impede duplicar)
create or replace function public.tarefa_da_regra(p_chave text, p_titulo text, p_resp text, p_prazo date,
  p_cliente uuid default null, p_grupo uuid default null, p_contrato uuid default null, p_checklist jsonb default '[]',
  p_descricao text default '', p_processo text default '', p_prioridade text default 'media') returns boolean
language plpgsql security definer set search_path = public as $$
declare n int; quem uuid;
begin
  insert into public.tarefas (chave_regra, titulo, responsavel, prazo, inicio, cliente_id, grupo_id, contrato_id, checklist, descricao,
                              processos_vinculados, prioridade, status)
  values (p_chave, p_titulo, coalesce(p_resp, ''), p_prazo, current_date, p_cliente, p_grupo, p_contrato, coalesce(p_checklist, '[]'),
          coalesce(p_descricao, ''), coalesce(p_processo, ''), p_prioridade, 'pendente')
  on conflict (chave_regra) where chave_regra is not null do nothing;
  get diagnostics n = row_count;
  if n > 0 then
    quem := public.usuario_por_nome(p_resp);
    if quem is not null then
      insert into public.notificacoes (usuario_id, tipo, titulo, detalhe, link)
      values (quem, 'tarefa', 'Nova tarefa automática: ' || p_titulo, coalesce('Prazo ' || to_char(p_prazo, 'DD/MM/YYYY'), ''), 'tarefas');
    end if;
  end if;
  return n > 0;
end $$;
revoke all on function public.tarefa_da_regra(text, text, text, date, uuid, uuid, uuid, jsonb, text, text, text) from anon, authenticated;

-- gatilhos na hora: contrato novo e processo novo
create or replace function public.regra_contrato_novo() returns trigger
language plpgsql security definer set search_path = public as $$
declare rg record; cl record; ck jsonb;
begin
  select * into rg from public.regras_tarefas where chave = 'contrato_onboarding' and ligada;
  if not found then return null; end if;
  select * into cl from public.clientes where id = new.cliente_id;
  select coalesce(jsonb_agg(jsonb_build_object('texto', i->>'titulo', 'feito', false)), '[]') into ck
    from public.modelos_fluxo m, jsonb_array_elements(m.itens) i where m.nome = 'Onboarding de cliente';
  perform public.tarefa_da_regra('onb:' || new.id, 'Onboarding: ' || coalesce(cl.nome, new.descricao),
    coalesce(nullif(rg.responsavel, ''), nullif(new.responsavel, ''), cl.responsavel),
    public.somar_uteis(coalesce(new.data_contrato, current_date), rg.dias), new.cliente_id, cl.grupo_id, new.id, ck,
    'Contrato: ' || new.descricao);
  return null;
end $$;
drop trigger if exists regra_contrato_novo on public.contratos;
create trigger regra_contrato_novo after insert on public.contratos for each row execute function public.regra_contrato_novo();

create or replace function public.regra_processo_novo() returns trigger
language plpgsql security definer set search_path = public as $$
declare rg record;
begin
  select * into rg from public.regras_tarefas where chave = 'processo_novo' and ligada;
  if not found or new.chave_importacao is not null then return null; end if;   -- importação em massa não gera tarefa
  perform public.tarefa_da_regra('proc:' || new.id, 'Conferir processo ' || new.numero || ' e prazos',
    coalesce(nullif(rg.responsavel, ''), new.advogado), public.somar_uteis(current_date, rg.dias),
    null, new.grupo_id, null, '[{"texto":"Conferir partes e valor da causa","feito":false},{"texto":"Lançar prazos em aberto","feito":false}]',
    '', new.numero);
  return null;
end $$;
drop trigger if exists regra_processo_novo on public.processos;
create trigger regra_processo_novo after insert on public.processos for each row execute function public.regra_processo_novo();

-- rotina diária (e botão "Rodar agora"): vencimentos, cobranças e atrasos
create or replace function public.rodar_regras_tarefas() returns int
language plpgsql security definer set search_path = public as $$
declare rg record; x record; n int := 0; adm record;
begin
  if auth.uid() is not null and not public.eh_equipe() then raise exception 'Só a equipe roda as regras.'; end if;
  -- certidões e documentos com validade chegando
  select * into rg from public.regras_tarefas where chave = 'certidao_vencendo' and ligada;
  if found then
    for x in select c.id, c.orgao, c.validade, cl.id cli, cl.nome, cl.grupo_id, cl.responsavel from public.certidoes c join public.clientes cl on cl.id = c.cliente_id
              where c.validade is not null and c.validade <= current_date + rg.dias loop
      if public.tarefa_da_regra('cert:' || x.id || ':' || x.validade, 'Renovar certidão ' || x.orgao || ' — ' || x.nome,
           coalesce(nullif(rg.responsavel, ''), x.responsavel), least(x.validade, public.somar_uteis(current_date, 2)), x.cli, x.grupo_id) then n := n + 1; end if;
    end loop;
    for x in select d.id, d.nome doc, d.validade, cl.id cli, cl.nome, cl.grupo_id, cl.responsavel from public.documentos d left join public.clientes cl on cl.id = d.cliente_id
              where not d.arquivado and d.validade is not null and d.validade <= current_date + rg.dias loop
      if public.tarefa_da_regra('doc:' || x.id || ':' || x.validade, 'Renovar documento ' || x.doc || coalesce(' — ' || x.nome, ''),
           coalesce(nullif(rg.responsavel, ''), x.responsavel), least(x.validade, public.somar_uteis(current_date, 2)), x.cli, x.grupo_id) then n := n + 1; end if;
    end loop;
  end if;
  -- parcelas de parcelamentos do cliente
  select * into rg from public.regras_tarefas where chave = 'parcela_parcelamento' and ligada;
  if found then
    for x in select pa.id, pa.numero, pa.vencimento, p.empresa, p.natureza, p.grupo_id,
                    (select cl.responsavel from public.clientes cl where cl.grupo_id = p.grupo_id and cl.responsavel <> '' limit 1) resp
               from public.parcelas pa join public.parcelamentos p on p.id = pa.parcelamento_id
              where not pa.pago and pa.vencimento between current_date and current_date + rg.dias loop
      if public.tarefa_da_regra('parc:' || x.id, 'Emitir guia e enviar ao cliente — ' || x.empresa || ' (' || coalesce(nullif(x.natureza, ''), 'parcelamento') || ', parc. ' || coalesce(x.numero, '') || ')',
           coalesce(nullif(rg.responsavel, ''), x.resp), public.somar_uteis(x.vencimento, -1), null, x.grupo_id) then n := n + 1; end if;
    end loop;
  end if;
  -- parcelas de acordos do cliente (acompanhamento; nada no financeiro)
  select * into rg from public.regras_tarefas where chave = 'parcela_acordo' and ligada;
  if found then
    for x in select a.id, a.credor, a.devedor, a.parcela, a.vencimento, a.grupo_id, a.responsavel from public.acordos a
              where not a.pago and a.vencimento between current_date and current_date + rg.dias loop
      if public.tarefa_da_regra('aco:' || x.id, 'Lembrar ' || coalesce(nullif(x.devedor, ''), 'o cliente') || ' do acordo com ' || coalesce(nullif(x.credor, ''), 'o credor') || ' (parc. ' || coalesce(x.parcela, '') || ')',
           coalesce(nullif(rg.responsavel, ''), x.responsavel), public.somar_uteis(x.vencimento, -1), null, x.grupo_id) then n := n + 1; end if;
    end loop;
  end if;
  -- honorários vencidos sem pagamento
  select * into rg from public.regras_tarefas where chave = 'cobrar_honorario' and ligada;
  if found then
    for x in select l.id, l.descricao, l.referencia, l.vencimento, l.cliente_id, l.grupo_id, l.responsavel, g.nome gnome from public.lancamentos l
              left join public.grupos g on g.id = l.grupo_id
              where l.tipo = 'receita' and not l.redutor and not l.pago and not coalesce(l.perda, false) and l.vencimento <= current_date - rg.dias loop
      if public.tarefa_da_regra('cob:' || x.id, 'Cobrar honorário — ' || coalesce(x.gnome, x.descricao) || coalesce(' ' || nullif(x.referencia, ''), ''),
           coalesce(nullif(rg.responsavel, ''), x.responsavel), public.somar_uteis(current_date, 1), x.cliente_id, x.grupo_id) then n := n + 1; end if;
    end loop;
  end if;
  -- atrasos: avisa os administradores; mais 2 dias úteis, prioridade Alta
  select * into rg from public.regras_tarefas where chave = 'escalar_atraso' and ligada;
  if found then
    for x in select t.id, t.titulo, t.responsavel, t.prazo from public.tarefas t
              where t.status not in ('concluida','cancelada') and t.prazo is not null and t.prazo < current_date
                and public.uteis_entre(t.prazo, current_date) > rg.dias and t.escalada_em is null loop
      for adm in select id from public.perfis where papel = 'admin' loop
        insert into public.notificacoes (usuario_id, tipo, titulo, detalhe, link)
        values (adm.id, 'atraso', 'Atrasada: ' || x.titulo, coalesce(nullif(x.responsavel, ''), 'sem responsável') || ' · prazo ' || to_char(x.prazo, 'DD/MM/YYYY'), 'tarefas');
      end loop;
      update public.tarefas set escalada_em = current_date where id = x.id;
      n := n + 1;
    end loop;
    update public.tarefas set prioridade = 'alta'
     where status not in ('concluida','cancelada') and prazo is not null and prazo < current_date
       and public.uteis_entre(prazo, current_date) > rg.dias + 2 and prioridade <> 'alta';
  end if;
  insert into public.configuracoes (chave, valor) values ('regras_tarefas_ultima', jsonb_build_object('quando', now(), 'criadas', n))
  on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
  return n;
end $$;
revoke all on function public.rodar_regras_tarefas() from anon;
grant execute on function public.rodar_regras_tarefas() to authenticated;

-- rotina automática todo dia útil às 7h (Brasília = 10h UTC), se o agendador existir no Supabase
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'erp_regras_tarefas';
  perform cron.schedule('erp_regras_tarefas', '0 10 * * 1-5', 'select public.rodar_regras_tarefas()');
exception when others then
  raise notice 'Agendador (pg_cron) indisponível: as regras rodam ao abrir o sistema e pelo botão "Rodar agora".';
end $$;

-- o revisor também enxerga e grava a tarefa que está com ele
drop policy if exists tarefas_ver on public.tarefas;
create policy tarefas_ver on public.tarefas for select to authenticated
  using (public.pode('tarefas') or public.tarefa_minha(responsavel, participantes) or public.tarefa_minha(revisor, ''));
drop policy if exists tarefas_alterar on public.tarefas;
create policy tarefas_alterar on public.tarefas for update to authenticated
  using (public.pode('tarefas','editar') or public.tarefa_minha(responsavel, participantes) or public.tarefa_minha(revisor, ''))
  with check (public.pode('tarefas','editar') or public.tarefa_minha(responsavel, participantes) or public.tarefa_minha(revisor, ''));

-- ═══════════════════════════════════════════════════════════════════
-- v9 (2026-09-27) — AVISOS POR E-MAIL (configurados na tela Administração → E-mail)
-- A tela e os gatilhos só põem e-mails na FILA; a função "erp-emails"
-- (Supabase → Edge Functions) envia pelo Gmail do escritório, outro SMTP ou Resend.
-- A senha do serviço fica em config_privada, que o site não consegue ler.
-- ═══════════════════════════════════════════════════════════════════
create table if not exists public.config_privada (
  chave text primary key, valor jsonb not null, atualizado_em timestamptz not null default now()
);
alter table public.config_privada enable row level security;       -- sem nenhuma regra: ninguém lê pelo site
revoke all on public.config_privada from anon, authenticated;
insert into public.config_privada (chave, valor) values ('segredo_funcoes', to_jsonb(gen_random_uuid()::text)) on conflict (chave) do nothing;
insert into public.config_privada (chave, valor) values ('url_projeto', to_jsonb('https://kukpiyqwtaeuvkvfrjjm.supabase.co'::text)) on conflict (chave) do nothing;

create table if not exists public.email_fila (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.perfis(id) on delete set null,
  para text not null, assunto text not null, html text not null,
  tipo text not null default '', referencia text not null default '',
  status text not null default 'pendente' check (status in ('pendente','enviado','erro','cancelado')),
  tentativas int not null default 0, erro text not null default '',
  criado_em timestamptz not null default now(), enviado_em timestamptz
);
create unique index if not exists email_fila_ref on public.email_fila (usuario_id, referencia) where referencia <> '';
alter table public.email_fila enable row level security;
revoke all on public.email_fila from anon;
revoke insert, update, delete on public.email_fila from authenticated;
grant select on public.email_fila to authenticated;
drop policy if exists email_fila_ver on public.email_fila;
create policy email_fila_ver on public.email_fila for select to authenticated using (public.eh_admin() or usuario_id = auth.uid());

-- a função de envio (chave de serviço) precisa ler a configuração e a fila
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update on public.config_privada, public.email_fila to service_role';
  end if;
end $$;

-- o que cada pessoa quer receber
alter table public.perfis add column if not exists pref_email jsonb not null
  default '{"resumo":true,"tarefa":true,"mencao":true,"fatal":true,"vencimentos":true,"publicacao":true}'::jsonb;
create or replace function public.salvar_minhas_preferencias(p jsonb) returns void
language sql security definer set search_path = public as $$
  update public.perfis set pref_email = coalesce(p, '{}'::jsonb) where id = auth.uid();
$$;
revoke all on function public.salvar_minhas_preferencias(jsonb) from anon;
grant execute on function public.salvar_minhas_preferencias(jsonb) to authenticated;

-- configurar (só admin) e consultar sem expor a senha
create or replace function public.salvar_config_email(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare atual jsonb;
begin
  if not public.eh_admin() then raise exception 'Só o administrador configura o e-mail.'; end if;
  select valor into atual from public.config_privada where chave = 'email';
  if coalesce(p->>'senha', '') = '' then p := p || jsonb_build_object('senha', coalesce(atual->>'senha', '')); end if;
  insert into public.config_privada (chave, valor)
  values ('email', p || jsonb_build_object('configurado_em', now(), 'configurado_por', auth.uid()))
  on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
end $$;
create or replace function public.status_config_email() returns jsonb
language plpgsql security definer set search_path = public as $$
declare c jsonb;
begin
  if not public.eh_admin() then raise exception 'Só o administrador vê a configuração do e-mail.'; end if;
  select valor into c from public.config_privada where chave = 'email';
  return coalesce(c - 'senha', '{}'::jsonb) || jsonb_build_object('tem_senha', coalesce(c->>'senha', '') <> '',
    'pendentes', (select count(*) from public.email_fila where status = 'pendente'),
    'erros', (select count(*) from public.email_fila where status = 'erro'),
    'enviados_7d', (select count(*) from public.email_fila where status = 'enviado' and enviado_em > now() - interval '7 days'));
end $$;
revoke all on function public.salvar_config_email(jsonb) from anon;
revoke all on function public.status_config_email() from anon;
grant execute on function public.salvar_config_email(jsonb), public.status_config_email() to authenticated;

-- modelo visual do e-mail (paleta do escritório)
create or replace function public.email_modelo(titulo text, corpo text) returns text
language sql immutable as $$
  select '<div style="font-family:Arial,Helvetica,sans-serif;background:#F0F2F7;padding:24px">'
    || '<div style="max-width:620px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E5E7EB">'
    || '<div style="background:#1B2A4A;color:#fff;padding:16px 22px"><div style="color:#C9A84C;font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:bold">Araújo &amp; Castro · ERP</div>'
    || '<div style="font-size:18px;font-weight:bold;margin-top:4px">' || replace(replace(titulo, '<', '&lt;'), '>', '&gt;') || '</div></div>'
    || '<div style="padding:18px 22px;color:#1F2937;font-size:14px;line-height:1.55">' || corpo || '</div>'
    || '<div style="padding:12px 22px;border-top:1px solid #E5E7EB;color:#6B7280;font-size:11.5px">Você recebe este aviso pelo ERP do escritório. '
    || 'Para mudar, abra o ERP → ⋯ → Meus avisos por e-mail.</div></div></div>';
$$;
create or replace function public.esc_html(t text) returns text language sql immutable as $$
  select replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
$$;

-- põe na fila um e-mail para uma pessoa da equipe, respeitando a preferência
create or replace function public.enfileirar_email(p_usuario uuid, p_pref text, p_assunto text, p_corpo text, p_tipo text, p_ref text default '')
returns boolean language plpgsql security definer set search_path = public as $$
declare pf record; n int;
begin
  select * into pf from public.perfis where id = p_usuario and papel in ('admin','equipe');
  if not found or coalesce(pf.email, '') = '' then return false; end if;
  if p_pref <> '' and coalesce((pf.pref_email->>p_pref)::boolean, true) = false then return false; end if;
  insert into public.email_fila (usuario_id, para, assunto, html, tipo, referencia)
  values (p_usuario, pf.email, p_assunto, public.email_modelo(p_assunto, p_corpo), p_tipo, coalesce(p_ref, ''))
  on conflict (usuario_id, referencia) where referencia <> '' do nothing;
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.enfileirar_email(uuid, text, text, text, text, text) from anon, authenticated;

-- toda notificação (tarefa atribuída, menção, revisão, atraso, publicação) pode virar e-mail na hora
create or replace function public.email_da_notificacao() returns trigger
language plpgsql security definer set search_path = public as $$
declare pref text;
begin
  pref := case new.tipo when 'mencao' then 'mencao' when 'publicacao' then 'publicacao' when 'atraso' then 'fatal' else 'tarefa' end;
  perform public.enfileirar_email(new.usuario_id, pref, new.titulo,
    '<p>' || public.esc_html(new.titulo) || '</p>' || case when new.detalhe <> '' then '<p style="color:#4B5563">' || public.esc_html(new.detalhe) || '</p>' else '' end
    || coalesce('<p><a href="' || (select valor #>> '{}' from public.config_privada where chave = 'url_sistema') || '" style="background:#1B2A4A;color:#fff;padding:9px 16px;border-radius:8px;text-decoration:none;display:inline-block">Abrir no ERP</a></p>', ''),
    new.tipo, 'notif:' || new.id);
  return null;
end $$;
drop trigger if exists email_da_notificacao on public.notificacoes;
create trigger email_da_notificacao after insert on public.notificacoes for each row execute function public.email_da_notificacao();

-- resumo diário de cada pessoa (dias úteis, de manhã)
create or replace function public.montar_resumos_diarios() returns int
language plpgsql security definer set search_path = public as $$
declare pf record; x record; corpo text; bloco text; n int := 0; hoje date := current_date;
begin
  if auth.uid() is not null and not public.eh_admin() then raise exception 'Só o administrador dispara o resumo.'; end if;
  for pf in select * from public.perfis where papel in ('admin','equipe') and coalesce(email, '') <> ''
                and coalesce((pref_email->>'resumo')::boolean, true) loop
    corpo := '';
    -- minhas tarefas de hoje e atrasadas
    bloco := '';
    for x in select titulo, prazo, prazo_fatal from public.tarefas
              where status not in ('concluida','cancelada') and prazo is not null and prazo <= hoje
                and (public.primeiro_nome(responsavel) = public.primeiro_nome(pf.nome)) order by prazo limit 20 loop
      bloco := bloco || '<li>' || public.esc_html(x.titulo) || ' — ' || case when x.prazo < hoje then '<b style="color:#B91C1C">atrasada desde ' || to_char(x.prazo, 'DD/MM') || '</b>' else 'hoje' end || '</li>';
    end loop;
    if bloco <> '' then corpo := corpo || '<h3 style="font-size:14px;color:#1B2A4A">Seus prazos de hoje e atrasados</h3><ul>' || bloco || '</ul>'; end if;
    -- prazos fatais nos próximos 5 dias
    bloco := '';
    for x in select titulo, prazo_fatal from public.tarefas
              where status not in ('concluida','cancelada') and prazo_fatal between hoje and hoje + 5
                and public.primeiro_nome(responsavel) = public.primeiro_nome(pf.nome) and coalesce((pf.pref_email->>'fatal')::boolean, true)
              order by prazo_fatal limit 20 loop
      bloco := bloco || '<li><b>⚑ ' || to_char(x.prazo_fatal, 'DD/MM') || '</b> — ' || public.esc_html(x.titulo) || '</li>';
    end loop;
    if bloco <> '' then corpo := corpo || '<h3 style="font-size:14px;color:#1B2A4A">Prazos fatais em 5 dias</h3><ul>' || bloco || '</ul>'; end if;
    -- menções e revisões não lidas
    bloco := '';
    for x in select titulo from public.notificacoes where usuario_id = pf.id and not lida and tipo in ('mencao','revisao') order by criado_em desc limit 10 loop
      bloco := bloco || '<li>' || public.esc_html(x.titulo) || '</li>';
    end loop;
    if bloco <> '' then corpo := corpo || '<h3 style="font-size:14px;color:#1B2A4A">Menções e revisões</h3><ul>' || bloco || '</ul>'; end if;
    -- documentos e certidões vencendo (15 dias)
    if coalesce((pf.pref_email->>'vencimentos')::boolean, true) then
      bloco := '';
      for x in select 'Certidão ' || c.orgao || ' — ' || cl.nome t, c.validade v from public.certidoes c join public.clientes cl on cl.id = c.cliente_id
                where c.validade <= hoje + 15 and (pf.papel = 'admin' or public.primeiro_nome(cl.responsavel) = public.primeiro_nome(pf.nome))
               union all
               select 'Documento ' || d.nome, d.validade from public.documentos d left join public.clientes cl on cl.id = d.cliente_id
                where not d.arquivado and d.validade <= hoje + 15 and (pf.papel = 'admin' or public.primeiro_nome(cl.responsavel) = public.primeiro_nome(pf.nome))
               order by 2 limit 15 loop
        bloco := bloco || '<li>' || public.esc_html(x.t) || ' — ' || case when x.v < hoje then '<b style="color:#B91C1C">vencido em ' else 'vence em ' end || to_char(x.v, 'DD/MM/YYYY') || case when x.v < hoje then '</b>' else '' end || '</li>';
      end loop;
      if bloco <> '' then corpo := corpo || '<h3 style="font-size:14px;color:#1B2A4A">Documentos e certidões vencendo</h3><ul>' || bloco || '</ul>'; end if;
    end if;
    -- administrador: atrasos da equipe acima de 3 dias úteis
    if pf.papel = 'admin' then
      bloco := '';
      for x in select titulo, responsavel, prazo from public.tarefas
                where status not in ('concluida','cancelada') and prazo < hoje and public.uteis_entre(prazo, hoje) > 3 order by prazo limit 15 loop
        bloco := bloco || '<li>' || public.esc_html(x.titulo) || ' — ' || public.esc_html(coalesce(nullif(x.responsavel, ''), 'sem responsável')) || ', desde ' || to_char(x.prazo, 'DD/MM') || '</li>';
      end loop;
      if bloco <> '' then corpo := corpo || '<h3 style="font-size:14px;color:#1B2A4A">Equipe: atrasos acima de 3 dias úteis</h3><ul>' || bloco || '</ul>'; end if;
    end if;
    if corpo <> '' then
      if public.enfileirar_email(pf.id, 'resumo', 'Resumo do dia — ' || to_char(hoje, 'DD/MM/YYYY'),
           '<p>Bom dia, ' || public.esc_html(split_part(pf.nome, ' ', 1)) || '. Este é o seu resumo de hoje.</p>' || corpo, 'resumo', 'resumo:' || hoje) then
        n := n + 1;
      end if;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.montar_resumos_diarios() from anon;
grant execute on function public.montar_resumos_diarios() to authenticated;

-- endereço do sistema (para o botão "Abrir no ERP" dos e-mails); o admin grava pela tela
create or replace function public.salvar_url_sistema(p text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Só o administrador.'; end if;
  insert into public.config_privada (chave, valor) values ('url_sistema', to_jsonb(p)) on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
end $$;
revoke all on function public.salvar_url_sistema(text) from anon;
grant execute on function public.salvar_url_sistema(text) to authenticated;

-- agendamentos: resumo às 7h45 (dias úteis) e envio da fila a cada 5 minutos
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname in ('erp_resumo_diario', 'erp_enviar_emails');
  perform cron.schedule('erp_resumo_diario', '45 10 * * 1-5', 'select public.montar_resumos_diarios()');
  create extension if not exists pg_net;
  perform cron.schedule('erp_enviar_emails', '*/5 * * * *', $cron$
    select net.http_post(
      url := (select valor #>> '{}' from public.config_privada where chave = 'url_projeto') || '/functions/v1/erp-emails',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-erp-segredo', (select valor #>> '{}' from public.config_privada where chave = 'segredo_funcoes')),
      body := '{"acao":"enviar"}'::jsonb)
    where exists (select 1 from public.email_fila where status = 'pendente')
  $cron$);
exception when others then
  raise notice 'Agendador indisponível: use o botão "Enviar agora" em Administração → E-mail.';
end $$;

-- ═══════════════════════════════════════════════════════════════════
-- v10 (2026-09-27) — CRM DO ZERO (dentro do sistema, sem serviço pago)
-- Oportunidade → atividades → proposta (modelo do escritório) → "Ganhou"
-- cria cliente, contrato, parcelas e o fluxo de onboarding numa vez só.
-- ═══════════════════════════════════════════════════════════════════
create table if not exists public.crm_etapas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (btrim(nome) <> ''), ordem int not null default 0,
  probabilidade int not null default 0 check (probabilidade between 0 and 100),
  cor text not null default '#2E5EAA', final text not null default '' check (final in ('', 'ganho', 'perdido')),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
insert into public.crm_etapas (nome, ordem, probabilidade, final)
select * from (values ('Novo contato', 1, 10, ''), ('Diagnóstico agendado', 2, 25, ''), ('Diagnóstico feito', 3, 40, ''),
                      ('Proposta enviada', 4, 60, ''), ('Negociação', 5, 80, ''), ('Ganhou', 6, 100, 'ganho'), ('Perdeu', 7, 0, 'perdido')) v(n, o, p, f)
where not exists (select 1 from public.crm_etapas);

create table if not exists public.crm_oportunidades (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (btrim(titulo) <> ''),
  cliente_id uuid references public.clientes(id) on delete set null,
  prospecto_nome text not null default '', prospecto_doc text not null default '', prospecto_email text not null default '',
  prospecto_telefone text not null default '', prospecto_empresa text not null default '',
  origem text not null default '', indicado_por text not null default '',
  etapa_id uuid references public.crm_etapas(id) on delete set null, etapa_desde timestamptz not null default now(),
  valor_estimado numeric(14,2) not null default 0, honorario_tipo text not null default '',
  probabilidade int not null default 10 check (probabilidade between 0 and 100),
  previsao_fechamento date, responsavel text not null default '',
  proxima_acao text not null default '', proxima_acao_em date,
  motivo_perda text not null default '', ganho_em timestamptz, perdido_em timestamptz, contrato_id uuid references public.contratos(id) on delete set null,
  obs text not null default '',
  criado_por uuid default auth.uid(), criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create table if not exists public.crm_atividades (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references public.crm_oportunidades(id) on delete cascade,
  tipo text not null default 'anotacao', quando timestamptz not null default now(),
  resumo text not null check (btrim(resumo) <> ''), feita boolean not null default true,
  criado_por uuid default auth.uid(), criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create table if not exists public.crm_modelos_proposta (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (btrim(nome) <> ''), texto text not null default '', itens jsonb not null default '[]',
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create table if not exists public.crm_propostas (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references public.crm_oportunidades(id) on delete cascade,
  versao int not null default 1, titulo text not null default '', texto text not null default '',
  itens jsonb not null default '[]',       -- [{servico, valor, forma}]
  validade date, status text not null default 'rascunho' check (status in ('rascunho','enviada','aceita','recusada')),
  enviada_em timestamptz, documento_id uuid references public.documentos(id) on delete set null,
  criado_por uuid default auth.uid(), criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
alter table public.documentos add column if not exists oportunidade_id uuid references public.crm_oportunidades(id) on delete set null;

insert into public.crm_modelos_proposta (nome, texto, itens)
select n, t, i::jsonb from (values
  ('Consultoria tributária mensal',
   '<p>Prezado(a) {cliente},</p><p>Conforme conversamos, apresentamos proposta de <b>consultoria tributária mensal</b>, com acompanhamento das obrigações e do passivo fiscal, atendimento às dúvidas da empresa e relatório periódico da situação fiscal.</p><p>Os valores e a forma de pagamento estão na tabela abaixo. Esta proposta vale até {validade}.</p>',
   '[{"servico":"Consultoria tributária mensal","valor":0,"forma":"mensal, por boleto ou PIX"}]'),
  ('Defesa em execução fiscal',
   '<p>Prezado(a) {cliente},</p><p>Apresentamos proposta para a <b>defesa na execução fiscal</b>: análise da CDA e do processo, estratégia com o cliente, elaboração e protocolo da defesa e acompanhamento até a decisão de primeira instância.</p><p>Esta proposta vale até {validade}.</p>',
   '[{"servico":"Honorários iniciais","valor":0,"forma":"à vista ou em até 3 parcelas"},{"servico":"Êxito sobre o valor reduzido","valor":0,"forma":"percentual no êxito"}]'),
  ('Parcelamento / transação tributária',
   '<p>Prezado(a) {cliente},</p><p>Apresentamos proposta para o <b>levantamento dos débitos, simulação das modalidades e adesão ao parcelamento/transação</b> mais vantajoso, com emissão das primeiras guias.</p><p>Esta proposta vale até {validade}.</p>',
   '[{"servico":"Levantamento, simulação e adesão","valor":0,"forma":"à vista"}]'),
  ('Holding e planejamento patrimonial',
   '<p>Prezado(a) {cliente},</p><p>Apresentamos proposta para o <b>estudo, constituição e integralização da holding</b>, com o planejamento tributário e sucessório da estrutura.</p><p>Esta proposta vale até {validade}.</p>',
   '[{"servico":"Estudo e planejamento","valor":0,"forma":"na assinatura"},{"servico":"Constituição e integralização","valor":0,"forma":"na conclusão"}]')
) v(n, t, i)
where not exists (select 1 from public.crm_modelos_proposta);

-- muda de etapa → reinicia o relógio "dias parado"
create or replace function public.crm_ao_mudar_etapa() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.etapa_id is distinct from old.etapa_id then new.etapa_desde := now(); end if;
  return new;
end $$;
drop trigger if exists crm_ao_mudar_etapa on public.crm_oportunidades;
create trigger crm_ao_mudar_etapa before update on public.crm_oportunidades for each row execute function public.crm_ao_mudar_etapa();

do $$
declare t text;
begin
  foreach t in array array['crm_etapas','crm_oportunidades','crm_atividades','crm_modelos_proposta','crm_propostas'] loop
    execute format('alter table public.%1$s enable row level security', t);
    execute format('revoke all on public.%1$s from anon', t);
    execute format('grant select, insert, update, delete on public.%1$s to authenticated', t);
    execute format('drop trigger if exists atualizado_%1$s on public.%1$s', t);
    execute format('create trigger atualizado_%1$s before update on public.%1$s for each row execute function public.marcar_atualizacao()', t);
    execute format('drop trigger if exists hist_%1$s on public.%1$s', t);
    execute format('create trigger hist_%1$s after insert or update or delete on public.%1$s for each row execute function public.registrar_historico()', t);
    execute format('drop policy if exists %1$s_ver on public.%1$s', t);
    execute format('create policy %1$s_ver on public.%1$s for select to authenticated using (public.pode(''crm''))', t);
    execute format('drop policy if exists %1$s_incluir on public.%1$s', t);
    execute format('create policy %1$s_incluir on public.%1$s for insert to authenticated with check (public.pode(''crm'',''editar''))', t);
    execute format('drop policy if exists %1$s_alterar on public.%1$s', t);
    execute format('create policy %1$s_alterar on public.%1$s for update to authenticated using (public.pode(''crm'',''editar'')) with check (public.pode(''crm'',''editar''))', t);
    execute format('drop policy if exists %1$s_excluir on public.%1$s', t);
    execute format('create policy %1$s_excluir on public.%1$s for delete to authenticated using (%2$s)', t,
                   case when t in ('crm_atividades') then 'public.pode(''crm'',''editar'')' else 'public.eh_admin()' end);
  end loop;
end $$;
-- documentos da oportunidade: também quem tem a função CRM
drop policy if exists documentos_ver on public.documentos;
create policy documentos_ver on public.documentos for select to authenticated using (
  (public.pode('documentos') or (oportunidade_id is not null and public.pode('crm')))
  and (lancamento_id is null or public.pode('financeiro_juridico') or public.pode('financeiro_contab')));
drop policy if exists documentos_incluir on public.documentos;
create policy documentos_incluir on public.documentos for insert to authenticated with check (public.pode('documentos','editar') or (oportunidade_id is not null and public.pode('crm','editar')));
drop policy if exists documentos_alterar on public.documentos;
create policy documentos_alterar on public.documentos for update to authenticated using (public.pode('documentos','editar') or (oportunidade_id is not null and public.pode('crm','editar')))
  with check (public.pode('documentos','editar') or (oportunidade_id is not null and public.pode('crm','editar')));
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    execute 'drop policy if exists documentos_ver on storage.objects';
    execute 'create policy documentos_ver on storage.objects for select to authenticated using (bucket_id = ''documentos'' and (public.pode(''documentos'') or public.pode(''crm'')))';
    execute 'drop policy if exists documentos_enviar on storage.objects';
    execute 'create policy documentos_enviar on storage.objects for insert to authenticated with check (bucket_id = ''documentos'' and (public.pode(''documentos'',''editar'') or public.pode(''crm'',''editar'')))';
  end if;
exception when insufficient_privilege then null;
end $$;

-- fluxo a partir de um modelo (prazos em dias úteis antes do prazo final), usado pelo "Ganhou"
create or replace function public.criar_fluxo_modelo(p_modelo text, p_fatal date, p_cliente uuid, p_grupo uuid, p_resp text, p_nome text)
returns uuid language plpgsql security definer set search_path = public as $$
declare m record; it jsonb; st jsonb; f uuid; pai uuid;
begin
  select * into m from public.modelos_fluxo where nome = p_modelo limit 1;
  if not found then return null; end if;
  insert into public.fluxos (nome, cliente_id, grupo_id, modelo_id, responsavel, inicio, prazo_fatal)
  values (coalesce(p_nome, m.nome), p_cliente, p_grupo, m.id, coalesce(p_resp, ''), current_date, p_fatal) returning id into f;
  for it in select * from jsonb_array_elements(m.itens) loop
    insert into public.tarefas (fluxo_id, cliente_id, grupo_id, titulo, responsavel, status, prioridade, inicio, prazo, prazo_fatal, checklist)
    values (f, p_cliente, p_grupo, it->>'titulo', coalesce(nullif(it->>'responsavel', ''), p_resp, ''), 'pendente', 'media', current_date,
            public.somar_uteis(p_fatal, -coalesce((it->>'dias')::int, 0)),
            case when coalesce((it->>'dias')::int, 0) = 0 then p_fatal end,
            coalesce((select jsonb_agg(jsonb_build_object('texto', c, 'feito', false)) from jsonb_array_elements_text(coalesce(it->'checklist', '[]')) c), '[]'))
    returning id into pai;
    for st in select * from jsonb_array_elements(coalesce(it->'subtarefas', '[]')) loop
      insert into public.tarefas (fluxo_id, tarefa_pai_id, cliente_id, grupo_id, titulo, responsavel, status, prioridade, inicio, prazo)
      values (f, pai, p_cliente, p_grupo, st->>'titulo', coalesce(p_resp, ''), 'pendente', 'media', current_date, public.somar_uteis(p_fatal, -coalesce((st->>'dias')::int, 0)));
    end loop;
  end loop;
  return f;
end $$;
revoke all on function public.criar_fluxo_modelo(text, date, uuid, uuid, text, text) from anon, authenticated;

-- "Ganhou": cliente (se novo), contrato + parcelas, fluxo de onboarding, linha do tempo, proposta aceita
create or replace function public.crm_ganhar(p_op uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o record; cli uuid; grp uuid; ctr uuid; flx uuid; resp text; etp uuid;
begin
  if not public.pode('crm', 'editar') then raise exception 'Sem a função CRM (editar).'; end if;
  select * into o from public.crm_oportunidades where id = p_op;
  if not found then raise exception 'Oportunidade não encontrada.'; end if;
  resp := coalesce(nullif(p->>'responsavel', ''), o.responsavel);
  cli := coalesce(nullif(p->>'cliente_id', '')::uuid, o.cliente_id);
  if cli is null then
    if coalesce(p->>'cliente_nome', '') = '' then raise exception 'Informe o nome do cliente.'; end if;
    if coalesce(p->>'grupo', '') <> '' then
      select id into grp from public.grupos where lower(nome) = lower(p->>'grupo') limit 1;
      if grp is null then insert into public.grupos (nome) values (p->>'grupo') returning id into grp; end if;
    end if;
    insert into public.clientes (nome, cpf_cnpj, email, telefone, grupo_id, responsavel, tipo, origem)
    values (p->>'cliente_nome', coalesce(p->>'cpf_cnpj', ''), coalesce(p->>'email', ''), coalesce(p->>'telefone', ''), grp, coalesce(resp, ''), 'Consultoria', 'CRM')
    returning id into cli;
  else
    select grupo_id into grp from public.clientes where id = cli;
  end if;
  if coalesce((p->>'valor_total')::numeric, 0) > 0 or coalesce(p->>'descricao', '') <> '' then
    perform set_config('erp.sem_regra_onboarding', case when coalesce((p->>'criar_fluxo')::boolean, true) then '1' else '' end, true);
    insert into public.contratos (cliente_id, descricao, valor_total, num_parcelas, primeiro_vencimento, percentual_exito, responsavel)
    values (cli, coalesce(nullif(p->>'descricao', ''), o.titulo), coalesce((p->>'valor_total')::numeric, 0), greatest(1, coalesce((p->>'num_parcelas')::int, 1)),
            nullif(p->>'primeiro_vencimento', '')::date, nullif(p->>'percentual_exito', '')::numeric, coalesce(resp, ''))
    returning id into ctr;
    perform set_config('erp.sem_regra_onboarding', '', true);
  end if;
  if coalesce((p->>'criar_fluxo')::boolean, true) then
    flx := public.criar_fluxo_modelo('Onboarding de cliente', public.somar_uteis(current_date, 15), cli, grp, resp,
                                     'Onboarding — ' || coalesce(p->>'cliente_nome', (select nome from public.clientes where id = cli)));
  end if;
  insert into public.interacoes (cliente_id, tipo, resumo) values (cli, 'anotacao', 'Contrato fechado pelo CRM: ' || o.titulo);
  update public.crm_propostas set status = 'aceita' where id = (select id from public.crm_propostas where oportunidade_id = p_op order by versao desc limit 1);
  update public.documentos set cliente_id = cli, grupo_id = grp, contrato_id = coalesce(ctr, contrato_id) where oportunidade_id = p_op;
  select id into etp from public.crm_etapas where final = 'ganho' order by ordem limit 1;
  update public.crm_oportunidades set etapa_id = etp, probabilidade = 100, ganho_em = now(), perdido_em = null, cliente_id = cli, contrato_id = ctr where id = p_op;
  return jsonb_build_object('cliente_id', cli, 'contrato_id', ctr, 'fluxo_id', flx);
end $$;
revoke all on function public.crm_ganhar(uuid, jsonb) from anon;
grant execute on function public.crm_ganhar(uuid, jsonb) to authenticated;

create or replace function public.crm_perder(p_op uuid, p_motivo text, p_reativar boolean) returns void
language plpgsql security definer set search_path = public as $$
declare o record; etp uuid;
begin
  if not public.pode('crm', 'editar') then raise exception 'Sem a função CRM (editar).'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo da perda.'; end if;
  select * into o from public.crm_oportunidades where id = p_op;
  select id into etp from public.crm_etapas where final = 'perdido' order by ordem limit 1;
  update public.crm_oportunidades set etapa_id = etp, probabilidade = 0, perdido_em = now(), ganho_em = null, motivo_perda = p_motivo where id = p_op;
  if p_reativar then
    perform public.tarefa_da_regra('crm-reativar:' || p_op, 'Reativar contato: ' || o.titulo, o.responsavel, current_date + 180, o.cliente_id);
  end if;
end $$;
revoke all on function public.crm_perder(uuid, text, boolean) from anon;
grant execute on function public.crm_perder(uuid, text, boolean) to authenticated;

-- proposta por e-mail (vai pela mesma fila dos avisos)
create or replace function public.crm_enviar_proposta(p_proposta uuid, p_para text, p_html text) returns void
language plpgsql security definer set search_path = public as $$
declare pr record;
begin
  if not public.pode('crm', 'editar') then raise exception 'Sem a função CRM (editar).'; end if;
  if p_para !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail do destinatário inválido.'; end if;
  select * into pr from public.crm_propostas where id = p_proposta;
  insert into public.email_fila (usuario_id, para, assunto, html, tipo, referencia)
  values (auth.uid(), p_para, coalesce(nullif(pr.titulo, ''), 'Proposta de honorários'), p_html, 'proposta', 'proposta:' || p_proposta || ':' || pr.versao || ':' || md5(p_para))
  on conflict (usuario_id, referencia) where referencia <> '' do nothing;
  update public.crm_propostas set status = case when status = 'rascunho' then 'enviada' else status end, enviada_em = now() where id = p_proposta;
end $$;
revoke all on function public.crm_enviar_proposta(uuid, text, text) from anon;
grant execute on function public.crm_enviar_proposta(uuid, text, text) to authenticated;

-- o "Ganhou" já cria o fluxo completo: a regra de onboarding não duplica
create or replace function public.regra_contrato_novo() returns trigger
language plpgsql security definer set search_path = public as $$
declare rg record; cl record; ck jsonb;
begin
  if current_setting('erp.sem_regra_onboarding', true) = '1' then return null; end if;
  select * into rg from public.regras_tarefas where chave = 'contrato_onboarding' and ligada;
  if not found then return null; end if;
  select * into cl from public.clientes where id = new.cliente_id;
  select coalesce(jsonb_agg(jsonb_build_object('texto', i->>'titulo', 'feito', false)), '[]') into ck
    from public.modelos_fluxo m, jsonb_array_elements(m.itens) i where m.nome = 'Onboarding de cliente';
  perform public.tarefa_da_regra('onb:' || new.id, 'Onboarding: ' || coalesce(cl.nome, new.descricao),
    coalesce(nullif(rg.responsavel, ''), nullif(new.responsavel, ''), cl.responsavel),
    public.somar_uteis(coalesce(new.data_contrato, current_date), rg.dias), new.cliente_id, cl.grupo_id, new.id, ck,
    'Contrato: ' || new.descricao);
  return null;
end $$;

-- ═══════════════════════════════════════════════════════════════════
-- v11 (2026-09-27) — BUSCADOR DE PUBLICAÇÕES (Diário de Justiça Eletrônico Nacional)
-- A função "erp-publicacoes" consulta a API pública e gratuita do CNJ
-- (Comunica PJe) pelas OABs cadastradas e guarda aqui, sem duplicar.
-- ═══════════════════════════════════════════════════════════════════
create table if not exists public.oabs_monitoradas (
  id uuid primary key default gen_random_uuid(),
  numero text not null check (btrim(numero) <> ''), uf text not null default 'MG', advogado text not null default '',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  unique (numero, uf)
);
create table if not exists public.publicacoes (
  id uuid primary key default gen_random_uuid(),
  id_origem text not null unique,
  data_disponibilizacao date, tribunal text not null default '', orgao text not null default '', tipo text not null default '',
  processo text not null default '', processo_numero text not null default '', classe text not null default '',
  texto text not null default '', link text not null default '', destinatarios text not null default '', advogados text not null default '',
  oab_numero text not null default '', oab_uf text not null default '', advogado text not null default '',
  processo_id uuid references public.processos(id) on delete set null,
  status text not null default 'nova' check (status in ('nova','lida','tratada','descartada')),
  tarefa_id uuid references public.tarefas(id) on delete set null,
  bruto jsonb,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create index if not exists publicacoes_data on public.publicacoes (data_disponibilizacao desc);

-- nova publicação: liga ao processo cadastrado e avisa o advogado (sino e e-mail)
create or replace function public.publicacao_nova() returns trigger
language plpgsql security definer set search_path = public as $$
declare quem uuid;
begin
  if new.processo_id is null and new.processo_numero <> '' then
    update public.publicacoes set processo_id = (select id from public.processos where regexp_replace(numero, '\D', '', 'g') = new.processo_numero limit 1)
     where id = new.id;
  end if;
  quem := public.usuario_por_nome(new.advogado);
  if quem is not null then
    insert into public.notificacoes (usuario_id, tipo, titulo, detalhe, link)
    values (quem, 'publicacao', 'Publicação nova: ' || coalesce(nullif(new.tipo, ''), 'comunicação') || ' — ' || coalesce(nullif(new.processo, ''), new.tribunal),
            new.tribunal || coalesce(' · ' || to_char(new.data_disponibilizacao, 'DD/MM/YYYY'), ''), 'publicacoes');
  end if;
  return null;
end $$;
drop trigger if exists publicacao_nova on public.publicacoes;
create trigger publicacao_nova after insert on public.publicacoes for each row execute function public.publicacao_nova();

do $$
declare t text;
begin
  foreach t in array array['oabs_monitoradas','publicacoes'] loop
    execute format('alter table public.%1$s enable row level security', t);
    execute format('revoke all on public.%1$s from anon', t);
    execute format('grant select, insert, update, delete on public.%1$s to authenticated', t);
    execute format('drop trigger if exists atualizado_%1$s on public.%1$s', t);
    execute format('create trigger atualizado_%1$s before update on public.%1$s for each row execute function public.marcar_atualizacao()', t);
    execute format('drop policy if exists %1$s_ver on public.%1$s', t);
    execute format('create policy %1$s_ver on public.%1$s for select to authenticated using (public.pode(''juridico''))', t);
    execute format('drop policy if exists %1$s_incluir on public.%1$s', t);
    execute format('create policy %1$s_incluir on public.%1$s for insert to authenticated with check (public.pode(''juridico'',''editar''))', t);
    execute format('drop policy if exists %1$s_alterar on public.%1$s', t);
    execute format('create policy %1$s_alterar on public.%1$s for update to authenticated using (public.pode(''juridico'',''editar'')) with check (public.pode(''juridico'',''editar''))', t);
    execute format('drop policy if exists %1$s_excluir on public.%1$s', t);
    execute format('create policy %1$s_excluir on public.%1$s for delete to authenticated using (public.eh_admin())', t);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update on public.oabs_monitoradas, public.publicacoes, public.configuracoes to service_role';
  end if;
end $$;
insert into public.config_privada (chave, valor) values ('api_publicacoes', to_jsonb('https://comunicaapi.pje.jus.br/api/v1'::text)) on conflict (chave) do nothing;

-- busca automática: dias úteis às 7h e às 13h (Brasília)
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'erp_publicacoes';
  perform cron.schedule('erp_publicacoes', '0 10,16 * * 1-5', $cron$
    select net.http_post(
      url := (select valor #>> '{}' from public.config_privada where chave = 'url_projeto') || '/functions/v1/erp-publicacoes',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-erp-segredo', (select valor #>> '{}' from public.config_privada where chave = 'segredo_funcoes')),
      body := '{}'::jsonb)
    where exists (select 1 from public.oabs_monitoradas where ativo)
  $cron$);
exception when others then
  raise notice 'Agendador indisponível: use o botão "Buscar agora" em Jurídico → Publicações.';
end $$;

-- ═══════════════════════════════════════════════════════════════════
-- v12 (2026-09-28) — reimportar substituindo, contratos recorrentes,
-- alertas, atualização diária do CNPJ
-- ═══════════════════════════════════════════════════════════════════
-- apaga o que veio de planilha (chave_importacao) de um tipo, para importar de novo do zero
create or replace function public.limpar_importados(p_tipo text) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  if not public.eh_admin() then raise exception 'Só o administrador substitui importações.'; end if;
  if p_tipo = 'financeiro' then delete from public.lancamentos where empresa = 'escritorio' and chave_importacao is not null;
  elsif p_tipo = 'contabilidade' then delete from public.lancamentos where empresa = 'contabilidade' and chave_importacao is not null;
  elsif p_tipo = 'acordos' then delete from public.acordos where chave_importacao is not null;
  elsif p_tipo = 'processos' then delete from public.processos where chave_importacao is not null;
  elsif p_tipo = 'parcelamentos' then delete from public.parcelamentos where chave_importacao is not null;   -- as parcelas vão junto
  elsif p_tipo = 'tarefas' then delete from public.tarefas where chave_importacao is not null;
  elsif p_tipo = 'base' then raise exception 'Clientes não são apagados na substituição (têm contratos e documentos ligados): use Atualizar.';
  else raise exception 'Tipo de planilha desconhecido: %', p_tipo;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.limpar_importados(text) from anon;
grant execute on function public.limpar_importados(text) to authenticated;
