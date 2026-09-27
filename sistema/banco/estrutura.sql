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
