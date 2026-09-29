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
  ('parcela_parcelamento', 'Parcela de parcelamento do cliente → lembrete "Emitir guias"', 'N dias antes do vencimento aparece no card Lembretes do Início (não vira tarefa)', true, 5),
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
    begin   -- registro da automação (Central de automações; tabela da v17)
      insert into public.automacoes_log (chave, ref, descricao, cliente_id) values (split_part(p_chave, ':', 1), p_chave, p_titulo, p_cliente);
    exception when undefined_table then null;
    end;
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
  -- parcelas de parcelamentos: desde o Backup 16 viram LEMBRETE no Início ("Emitir guias de parcelamentos"),
  -- não tarefa. A regra continua guardando quantos dias antes o lembrete aparece.
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
  -- e-mails automáticos ao cliente (v17; cada tipo começa desligado)
  begin n := n + public.rodar_emails_cliente_se_sem_hora(); exception when undefined_function then n := n + public.rodar_emails_cliente(); end;
  -- regras novas (v22+: CRM parado, follow-up de proposta, tarefas…) ficam em rodar_regras_extras
  begin n := n + public.rodar_regras_extras(); exception when undefined_function then null; end;
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

-- ─────────── contratos: consultoria recorrente (valor fixo ou em salários mínimos) ───────────
-- Consultoria: 1 lançamento por mês de COMPETÊNCIA, pago no mês seguinte (dia escolhido), até a
-- rescisão. Em salários mínimos, cada competência usa o salário mínimo do ANO da competência;
-- ao cadastrar o salário mínimo novo, as mensalidades em aberto daquele ano são reajustadas sozinhas.
-- Serviço pontual: como antes (valor total dividido em parcelas).
alter table public.contratos add column if not exists modalidade text not null default 'pontual';
alter table public.contratos add column if not exists forma_valor text not null default 'fixo';
alter table public.contratos add column if not exists valor_mensal numeric(14,2);
alter table public.contratos add column if not exists qtd_salarios numeric(7,3);
alter table public.contratos add column if not exists dia_vencimento int not null default 10;
alter table public.contratos add column if not exists inicio_competencia date;
alter table public.contratos add column if not exists rescindido_em date;
alter table public.contratos drop constraint if exists contratos_modalidade_check;
alter table public.contratos add constraint contratos_modalidade_check check (modalidade in ('pontual','consultoria'));
alter table public.contratos drop constraint if exists contratos_forma_valor_check;
alter table public.contratos add constraint contratos_forma_valor_check check (forma_valor in ('fixo','salario_minimo'));
alter table public.contratos drop constraint if exists contratos_dia_vencimento_check;
alter table public.contratos add constraint contratos_dia_vencimento_check check (dia_vencimento between 1 and 28);
alter table public.lancamentos add column if not exists competencia date;
alter table public.lancamentos add column if not exists chave_recorrencia text;
create unique index if not exists lancamentos_chave_recorrencia on public.lancamentos (chave_recorrencia) where chave_recorrencia is not null;

create table if not exists public.salarios_minimos (
  ano int primary key check (ano between 2000 and 2100), valor numeric(10,2) not null check (valor > 0),
  atualizado_em timestamptz not null default now()
);
insert into public.salarios_minimos (ano, valor) values (2025, 1518.00), (2026, 1621.00) on conflict (ano) do nothing;
alter table public.salarios_minimos enable row level security;
revoke all on public.salarios_minimos from anon;
grant select, insert, update, delete on public.salarios_minimos to authenticated;
drop policy if exists salarios_minimos_ver on public.salarios_minimos;
create policy salarios_minimos_ver on public.salarios_minimos for select to authenticated using (public.eh_equipe());
drop policy if exists salarios_minimos_admin on public.salarios_minimos;
create policy salarios_minimos_admin on public.salarios_minimos for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- salário mínimo do ano (se o ano ainda não foi cadastrado, o último conhecido)
create or replace function public.salario_minimo(p_ano int) returns numeric
language sql stable set search_path = public as $$
  select valor from public.salarios_minimos where ano <= p_ano order by ano desc limit 1;
$$;
create or replace function public.valor_competencia(c public.contratos, comp date) returns numeric
language sql stable set search_path = public as $$
  select case when c.forma_valor = 'salario_minimo'
              then round(coalesce(c.qtd_salarios, 0) * coalesce(public.salario_minimo(extract(year from comp)::int), 0), 2)
              else coalesce(c.valor_mensal, 0) end;
$$;

-- gera as mensalidades que faltam (até 2 meses à frente), reajusta as em aberto e aplica a rescisão
drop function if exists public.gerar_mensalidades(uuid);
create or replace function public.gerar_mensalidades(p_contrato uuid default null, p_ate date default null) returns int
language plpgsql security definer set search_path = public as $$
declare c public.contratos; comp date; fim date; venc date; g uuid; resp text; n int := 0; k int; sm_falta boolean;
begin
  for c in select * from public.contratos where modalidade = 'consultoria' and (p_contrato is null or id = p_contrato) loop
    select grupo_id, responsavel into g, resp from public.clientes where id = c.cliente_id;
    -- rescisão: nada a partir da competência do mês da rescisão (rescindido em set → cobra até a competência de ago)
    if c.rescindido_em is not null then
      delete from public.lancamentos where contrato_id = c.id and chave_recorrencia is not null and not pago
         and competencia >= date_trunc('month', c.rescindido_em)::date;
    end if;
    if c.status in ('Cancelado') then continue; end if;
    comp := date_trunc('month', coalesce(c.inicio_competencia, c.data_contrato))::date;
    fim := date_trunc('month', coalesce(p_ate, (current_date + interval '2 months')::date))::date;
    if c.rescindido_em is not null then fim := least(fim, (date_trunc('month', c.rescindido_em) - interval '1 month')::date); end if;
    while comp <= fim loop
      venc := make_date(extract(year from comp + interval '1 month')::int, extract(month from comp + interval '1 month')::int, c.dia_vencimento);
      sm_falta := c.forma_valor = 'salario_minimo' and not exists (select 1 from public.salarios_minimos where ano = extract(year from comp)::int);
      insert into public.lancamentos (empresa, tipo, descricao, categoria, cliente_id, contrato_id, grupo_id, responsavel, referencia,
                                      competencia, vencimento, valor, chave_recorrencia, obs)
      values ('escritorio', 'receita', c.descricao || ' — competência ' || to_char(comp, 'MM/YYYY'), 'Consultoria mensal', c.cliente_id, c.id, g,
              coalesce(nullif(c.responsavel, ''), resp, ''), to_char(comp, 'MM/YYYY'), comp, venc, greatest(public.valor_competencia(c, comp), 0.01),
              'rec:' || c.id || ':' || to_char(comp, 'YYYY-MM'),
              case when sm_falta then 'Salário mínimo de ' || extract(year from comp)::int || ' ainda não cadastrado: valor provisório, reajusta sozinho.' else '' end)
      on conflict (chave_recorrencia) where chave_recorrencia is not null do nothing;
      get diagnostics k = row_count; n := n + k;
      comp := (comp + interval '1 month')::date;
    end loop;
    -- reajuste das mensalidades em aberto (valor do contrato mudou ou saiu o salário mínimo do ano)
    update public.lancamentos l set valor = greatest(public.valor_competencia(c, l.competencia), 0.01),
           obs = case when c.forma_valor = 'salario_minimo' and not exists (select 1 from public.salarios_minimos where ano = extract(year from l.competencia)::int)
                      then l.obs else regexp_replace(l.obs, 'Salário mínimo de \d{4} ainda não cadastrado: valor provisório, reajusta sozinho\.', '') end
     where l.contrato_id = c.id and l.chave_recorrencia is not null and not l.pago
       and l.valor is distinct from greatest(public.valor_competencia(c, l.competencia), 0.01);
  end loop;
  return n;
end $$;
revoke all on function public.gerar_mensalidades(uuid, date) from anon;
grant execute on function public.gerar_mensalidades(uuid, date) to authenticated;

create or replace function public.contrato_recorrente() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.modalidade = 'consultoria' then perform public.gerar_mensalidades(new.id); end if;
  return null;
end $$;
drop trigger if exists contrato_recorrente on public.contratos;
create trigger contrato_recorrente after insert or update on public.contratos for each row execute function public.contrato_recorrente();

create or replace function public.salario_minimo_mudou() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.gerar_mensalidades(id) from public.contratos where modalidade = 'consultoria' and forma_valor = 'salario_minimo';
  return null;
end $$;
drop trigger if exists salario_minimo_mudou on public.salarios_minimos;
create trigger salario_minimo_mudou after insert or update or delete on public.salarios_minimos for each statement execute function public.salario_minimo_mudou();

-- contrato de consultoria não usa a divisão em parcelas do serviço pontual
create or replace function public.gerar_parcelas_contrato() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  i int; base numeric(14,2); v numeric(14,2); g uuid;
begin
  if new.modalidade = 'consultoria' then return new; end if;
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

-- rotina diária: cria a mensalidade do próximo mês de cada consultoria ativa
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'erp_mensalidades';
  perform cron.schedule('erp_mensalidades', '30 9 * * *', 'select public.gerar_mensalidades()');
exception when others then
  raise notice 'Agendador indisponível: as mensalidades são geradas ao salvar o contrato e ao abrir Contratos.';
end $$;

-- ─────────── cartão CNPJ: atualização diária (6h) com relatório ───────────
alter table public.clientes add column if not exists razao_social text not null default '';
alter table public.clientes add column if not exists nome_fantasia text not null default '';
alter table public.clientes add column if not exists cnae_principal text not null default '';
alter table public.clientes add column if not exists porte text not null default '';
alter table public.clientes add column if not exists data_abertura date;
alter table public.clientes add column if not exists data_situacao date;
alter table public.clientes add column if not exists cep text not null default '';
alter table public.clientes add column if not exists cnpj_atualizado_em timestamptz;
alter table public.clientes add column if not exists cnpj_dados jsonb;

create table if not exists public.cnpj_execucoes (
  id uuid primary key default gen_random_uuid(),
  inicio timestamptz not null default now(), fim timestamptz,
  status text not null default 'rodando' check (status in ('rodando','ok','parcial','erro')),
  origem text not null default 'rotina', provedor text not null default '',
  total int not null default 0, consultados int not null default 0, alterados int not null default 0, erros int not null default 0,
  relatorio jsonb not null default '[]',        -- [{cliente_id, nome, cnpj, mudancas:[{campo, antes, depois}], erro}]
  mensagem text not null default ''
);
alter table public.cnpj_execucoes enable row level security;
revoke all on public.cnpj_execucoes from anon;
grant select on public.cnpj_execucoes to authenticated;
drop policy if exists cnpj_execucoes_ver on public.cnpj_execucoes;
create policy cnpj_execucoes_ver on public.cnpj_execucoes for select to authenticated using (public.eh_equipe());
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update on public.cnpj_execucoes, public.clientes to service_role';
  end if;
end $$;
insert into public.config_privada (chave, valor) values ('api_cnpj', '{"provedor":"brasilapi","token":""}') on conflict (chave) do nothing;

-- escolher a API do cartão CNPJ (só admin; o token, se houver, não volta para a tela)
create or replace function public.salvar_config_cnpj(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare atual jsonb;
begin
  if not public.eh_admin() then raise exception 'Só o administrador.'; end if;
  select valor into atual from public.config_privada where chave = 'api_cnpj';
  if coalesce(p->>'token', '') = '' then p := p || jsonb_build_object('token', coalesce(atual->>'token', '')); end if;
  insert into public.config_privada (chave, valor) values ('api_cnpj', p) on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
end $$;
create or replace function public.status_config_cnpj() returns jsonb
language sql security definer set search_path = public as $$
  select case when public.eh_equipe() then coalesce((select (valor - 'token') || jsonb_build_object('tem_token', coalesce(valor->>'token', '') <> '') from public.config_privada where chave = 'api_cnpj'), '{}') end;
$$;
revoke all on function public.salvar_config_cnpj(jsonb) from anon;
revoke all on function public.status_config_cnpj() from anon;
grant execute on function public.salvar_config_cnpj(jsonb), public.status_config_cnpj() to authenticated;

-- todo dia às 6h (Brasília = 9h UTC)
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'erp_cnpj';
  perform cron.schedule('erp_cnpj', '0 9 * * *', $cron$
    select net.http_post(
      url := (select valor #>> '{}' from public.config_privada where chave = 'url_projeto') || '/functions/v1/erp-cnpj',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-erp-segredo', (select valor #>> '{}' from public.config_privada where chave = 'segredo_funcoes')),
      body := '{"acao":"rodar"}'::jsonb)
  $cron$);
exception when others then
  raise notice 'Agendador indisponível: use o botão "Atualizar agora" em Alertas → Cartão CNPJ.';
end $$;

-- ═══════════════════════════════════════════════════════════════════
-- v13 — Desempenho: índices dos filtros mais usados e totais prontos no banco
-- ═══════════════════════════════════════════════════════════════════
create index if not exists lanc_emp_pago_venc on public.lancamentos (empresa, pago, vencimento);
create index if not exists acordos_pago_venc on public.acordos (pago, vencimento);
create index if not exists tarefas_status_prazo on public.tarefas (status, prazo);
create index if not exists publicacoes_status on public.publicacoes (status);

-- Totais do mês por empresa (escritorio / contabilidade), já com a comissão como redutor.
-- Roda com as permissões de quem chama (RLS): cada pessoa soma só o que pode ver.
-- Resultado: {"escritorio": {"recebido":…, "n_recebido":…, "a_receber":…, "n_a_receber":…,
--             "em_atraso":…, "n_em_atraso":…, "a_pagar":…, "n_a_pagar":…}, "contabilidade": {…}}
create or replace function public.resumo_financeiro(p_empresa text default null, p_de date default null, p_ate date default null)
returns jsonb language sql stable security invoker set search_path = public as $$
  with per as (
    select coalesce(p_de, date_trunc('month', current_date)::date) as de,
           coalesce(p_ate, (date_trunc('month', current_date) + interval '1 month - 1 day')::date) as ate
  ), l as (
    select l.empresa, l.tipo, l.pago, l.perda, l.vencimento, l.data_pagamento,
           case when l.redutor then -l.valor else l.valor end as v
      from public.lancamentos l
     where p_empresa is null or l.empresa = p_empresa
  ), t as (
    select e.empresa,
      coalesce(sum(l.v) filter (where l.tipo = 'receita' and l.pago and l.data_pagamento between per.de and per.ate), 0) as recebido,
      count(*)          filter (where l.tipo = 'receita' and l.pago and l.data_pagamento between per.de and per.ate) as n_recebido,
      coalesce(sum(l.v) filter (where l.tipo = 'receita' and not l.pago and not l.perda and l.vencimento between per.de and per.ate), 0) as a_receber,
      count(*)          filter (where l.tipo = 'receita' and not l.pago and not l.perda and l.vencimento between per.de and per.ate) as n_a_receber,
      coalesce(sum(l.v) filter (where l.tipo = 'receita' and not l.pago and not l.perda and l.vencimento < current_date), 0) as em_atraso,
      count(*)          filter (where l.tipo = 'receita' and not l.pago and not l.perda and l.vencimento < current_date) as n_em_atraso,
      coalesce(sum(l.v) filter (where l.tipo = 'despesa' and not l.pago and not l.perda and l.vencimento between per.de and per.ate), 0) as a_pagar,
      count(*)          filter (where l.tipo = 'despesa' and not l.pago and not l.perda and l.vencimento between per.de and per.ate) as n_a_pagar
    from (select unnest(array['escritorio','contabilidade']) as empresa) e
    cross join per
    left join l on l.empresa = e.empresa
    where p_empresa is null or e.empresa = p_empresa
    group by e.empresa
  )
  select coalesce(jsonb_object_agg(empresa, to_jsonb(t) - 'empresa'), '{}'::jsonb) from t;
$$;
revoke all on function public.resumo_financeiro(text, date, date) from public, anon;
grant execute on function public.resumo_financeiro(text, date, date) to authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- v14 — Cartão CNPJ: empresa que fica INAPTA/SUSPENSA/BAIXADA/NULA vira tarefa + aviso (e-mail)
-- Vale para a atualização diária (erp-cnpj) e para edição manual. Não dispara no primeiro
-- preenchimento (situação anterior vazia) nem quando volta a ATIVA.
-- ═══════════════════════════════════════════════════════════════════
create or replace function public.cnpj_situacao_mudou() returns trigger
language plpgsql security definer set search_path = public as $$
declare quem uuid; titulo text; det text;
begin
  if coalesce(old.situacao_cadastral, '') = '' or upper(new.situacao_cadastral) = upper(old.situacao_cadastral)
     or upper(coalesce(new.situacao_cadastral, '')) not in ('INAPTA','SUSPENSA','BAIXADA','NULA') then
    return null;
  end if;
  titulo := new.nome || ' ficou ' || upper(new.situacao_cadastral) || ' na Receita Federal';
  det := 'Antes: ' || old.situacao_cadastral || coalesce(' · desde ' || to_char(new.data_situacao, 'DD/MM/YYYY'), '') || ' · CNPJ ' || new.cpf_cnpj;
  insert into public.tarefas (chave_regra, titulo, responsavel, prazo, inicio, cliente_id, grupo_id, prioridade, descricao)
  values ('cnpj:' || new.id || ':' || upper(new.situacao_cadastral) || ':' || current_date, 'Verificar: ' || titulo,
          coalesce(nullif(new.responsavel, ''), ''), current_date + 2, current_date, new.id, new.grupo_id, 'alta',
          det || '. Confira no cartão CNPJ (Alertas → Cartão CNPJ) e fale com o cliente.')
  on conflict do nothing;
  for quem in
    select distinct u from (
      select public.usuario_por_nome(new.responsavel) as u
      union all select id from public.perfis where papel = 'admin'
    ) x where u is not null
  loop
    insert into public.notificacoes (usuario_id, tipo, titulo, detalhe, link) values (quem, 'cnpj', titulo, det, 'alertas');
  end loop;
  return null;
end $$;
drop trigger if exists cnpj_situacao_mudou on public.clientes;
create trigger cnpj_situacao_mudou after update of situacao_cadastral on public.clientes
  for each row execute function public.cnpj_situacao_mudou();

-- ═══════════════════════════════════════════════════════════════════
-- v15 — Google Agenda: um link secreto por pessoa (função erp-agenda devolve os prazos em .ics)
-- ═══════════════════════════════════════════════════════════════════
create table if not exists public.agenda_links (
  token text primary key,
  usuario_id uuid not null unique references public.perfis(id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table public.agenda_links enable row level security;   -- sem policy: só a função (service role) lê
revoke all on public.agenda_links from anon, authenticated;

create or replace function public.meu_link_agenda(p_novo boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if not public.eh_equipe() then raise exception 'Só a equipe do escritório tem agenda.'; end if;
  if p_novo then delete from public.agenda_links where usuario_id = auth.uid(); end if;
  select token into t from public.agenda_links where usuario_id = auth.uid();
  if t is null then
    t := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    insert into public.agenda_links (token, usuario_id) values (t, auth.uid());
  end if;
  return t;
end $$;
revoke all on function public.meu_link_agenda(boolean) from public, anon;
grant execute on function public.meu_link_agenda(boolean) to authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- v16 — Segurança e rotina: backup semanal automático, saúde do sistema e registro de acessos
-- ═══════════════════════════════════════════════════════════════════
-- tabelas que entram no backup (manual e automático): todas do sistema, menos segredos e filas técnicas
create or replace function public.listar_tabelas_backup() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(table_name::text order by table_name), '{}')
    from information_schema.tables
   where table_schema = 'public' and table_type = 'BASE TABLE'
     and table_name not in ('config_privada', 'agenda_links', 'email_fila', 'acessos', 'backups_auto');
$$;
revoke all on function public.listar_tabelas_backup() from public, anon;
grant execute on function public.listar_tabelas_backup() to authenticated;

create table if not exists public.backups_auto (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  origem text not null default 'rotina',          -- rotina (semanal) | manual
  caminho text not null,                          -- arquivo no bucket privado "backups"
  tamanho bigint not null default 0,
  resumo jsonb not null default '{}'::jsonb       -- registros por tabela
);
alter table public.backups_auto enable row level security;
revoke all on public.backups_auto from anon;
grant select on public.backups_auto to authenticated;
drop policy if exists backups_auto_ver on public.backups_auto;
create policy backups_auto_ver on public.backups_auto for select to authenticated using (public.eh_admin());

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('backups', 'backups', false, 209715200) on conflict (id) do nothing;
    execute 'drop policy if exists backups_ver on storage.objects';
    execute 'create policy backups_ver on storage.objects for select to authenticated using (bucket_id = ''backups'' and public.eh_admin())';
  end if;
exception when others then raise notice 'Storage indisponível aqui (normal no teste local).';
end $$;

-- toda semana, domingo às 3h de Brasília (6h UTC)
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'erp_backup';
  perform cron.schedule('erp_backup', '0 6 * * 0', $cron$
    select net.http_post(
      url := (select valor #>> '{}' from public.config_privada where chave = 'url_projeto') || '/functions/v1/erp-backup',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-erp-segredo', (select valor #>> '{}' from public.config_privada where chave = 'segredo_funcoes')),
      body := '{"acao":"rodar"}'::jsonb)
  $cron$);
exception when others then
  raise notice 'Agendador indisponível: use "Fazer backup agora" em Administração → Backup.';
end $$;

-- saúde do sistema (admin): tamanho do banco e dos arquivos x limites do plano grátis do Supabase
create or replace function public.saude_sistema() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare arq bigint := 0; nobj int := 0;
begin
  if not public.eh_admin() then raise exception 'Só o administrador vê a saúde do sistema.'; end if;
  begin
    execute 'select coalesce(sum((metadata->>''size'')::bigint), 0), count(*) from storage.objects' into arq, nobj;
  exception when others then arq := 0; nobj := 0;
  end;
  return jsonb_build_object(
    'banco_bytes', pg_database_size(current_database()), 'banco_limite', 500 * 1024 * 1024,
    'arquivos_bytes', arq, 'arquivos_qtd', nobj, 'arquivos_limite', 1024 * 1024 * 1024,
    'ultimo_backup', (select max(criado_em) from public.backups_auto),
    'maiores', (select coalesce(jsonb_agg(x), '[]') from (
        select relname as tabela, pg_total_relation_size(c.oid) as bytes
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r' order by 2 desc limit 6) x));
end $$;
revoke all on function public.saude_sistema() from public, anon;
grant execute on function public.saude_sistema() to authenticated;

-- registro de acessos: quem entrou, quando e de qual aparelho; aparelho novo avisa a própria pessoa
create table if not exists public.acessos (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.perfis(id) on delete cascade,
  quando timestamptz not null default now(),
  dispositivo text not null default '',          -- identificador aleatório guardado no navegador
  navegador text not null default '',
  novo boolean not null default false
);
create index if not exists acessos_usuario on public.acessos (usuario_id, quando desc);
alter table public.acessos enable row level security;
revoke all on public.acessos from anon;
grant select on public.acessos to authenticated;
drop policy if exists acessos_ver on public.acessos;
create policy acessos_ver on public.acessos for select to authenticated using (public.eh_admin() or usuario_id = auth.uid());

create or replace function public.registrar_acesso(p_dispositivo text, p_navegador text) returns boolean
language plpgsql security definer set search_path = public as $$
declare ja_viu boolean; tem_antes boolean; nav text := left(coalesce(p_navegador, ''), 120);
begin
  if auth.uid() is null then return false; end if;
  perform pg_advisory_xact_lock(hashtext('acesso:' || auth.uid()::text));   -- duas abas ao mesmo tempo: uma espera a outra
  -- no máximo um registro por pessoa/aparelho a cada 30 min (recarregar a página não conta)
  if exists (select 1 from public.acessos where usuario_id = auth.uid() and dispositivo = coalesce(p_dispositivo, '') and quando > now() - interval '30 minutes') then
    return false;
  end if;
  select exists (select 1 from public.acessos where usuario_id = auth.uid() and dispositivo = coalesce(p_dispositivo, '')) into ja_viu;
  select exists (select 1 from public.acessos where usuario_id = auth.uid()) into tem_antes;
  insert into public.acessos (usuario_id, dispositivo, navegador, novo) values (auth.uid(), coalesce(p_dispositivo, ''), nav, tem_antes and not ja_viu);
  if tem_antes and not ja_viu then
    insert into public.notificacoes (usuario_id, tipo, titulo, detalhe, link)
    values (auth.uid(), 'acesso', 'Novo acesso ao ERP de um aparelho novo', nav || ' · ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') ||
            '. Se não foi você, troque sua senha e avise o administrador.', 'hoje');
  end if;
  delete from public.acessos where quando < now() - interval '180 days';
  return tem_antes and not ja_viu;
end $$;
revoke all on function public.registrar_acesso(text, text) from public, anon;
grant execute on function public.registrar_acesso(text, text) to authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- v17 — Automações encadeadas: um lançamento dispara várias ações, tudo registrado
-- ═══════════════════════════════════════════════════════════════════
create table if not exists public.automacoes_log (
  id bigint generated always as identity primary key,
  quando timestamptz not null default now(),
  chave text not null,                 -- prefixo da regra (onb, anexo, procur, cob, email_lh…)
  ref text not null default '',        -- o que foi tratado (evita repetir e-mail/tarefa)
  descricao text not null default '',
  cliente_id uuid references public.clientes(id) on delete set null
);
create index if not exists automacoes_log_quando on public.automacoes_log (chave, quando desc);
create index if not exists automacoes_log_ref on public.automacoes_log (ref);
alter table public.automacoes_log enable row level security;
revoke all on public.automacoes_log from anon;
grant select on public.automacoes_log to authenticated;
drop policy if exists automacoes_log_ver on public.automacoes_log;
create policy automacoes_log_ver on public.automacoes_log for select to authenticated using (public.eh_equipe());

-- grupo de cada automação na Central (tarefas | cliente_email | integracao)
alter table public.regras_tarefas add column if not exists grupo text not null default 'tarefas';
insert into public.regras_tarefas (chave, nome, descricao, ligada, dias, grupo) values
  ('contrato_anexo', 'Contrato novo → anexar o contrato assinado', 'Tarefa em N dias úteis; conclui sozinha quando o contrato ganha o anexo em Documentos', true, 5, 'tarefas'),
  ('processo_procuracao', 'Processo novo sem procuração → providenciar procuração', 'Quando nenhuma empresa do grupo tem procuração; conclui sozinha ao marcar "Procuração: Sim" no cadastro', true, 5, 'tarefas'),
  ('pagamento_conclui', 'Honorário recebido → conclui a tarefa de cobrança', 'Ao marcar o lançamento como pago, a tarefa "Cobrar honorário" dele é concluída sozinha', true, 0, 'tarefas'),
  ('publicacao_tarefa', 'Publicação nova ligada a processo → tarefa para analisar', 'Para o advogado da OAB, prazo em N dias úteis (confira o prazo legal na publicação)', false, 5, 'tarefas'),
  ('cliente_novo_cnpj', 'Cliente novo com CNPJ → busca os dados na Receita', 'Ao cadastrar (não na importação): razão social, endereço, situação… Empresa recém-aberta fica "aguardando" e é tentada todo dia', true, 0, 'integracao'),
  ('email_lembrete_honorario', 'E-mail ao cliente: lembrete de honorário', 'N dias antes do vencimento, para o contato financeiro (ou o e-mail do cadastro)', false, 3, 'cliente_email'),
  ('email_cobranca_honorario', 'E-mail ao cliente: cobrança educada', 'N dias depois do vencimento sem pagamento (uma vez por lançamento)', false, 3, 'cliente_email'),
  ('email_lembrete_acordo', 'E-mail ao cliente: lembrete de parcela de acordo', 'N dias antes do vencimento da parcela (dívida do cliente com terceiros)', false, 3, 'cliente_email'),
  ('email_pagamento_recebido', 'E-mail ao cliente: pagamento recebido', 'Assim que o honorário é marcado como pago', false, 0, 'cliente_email')
on conflict (chave) do nothing;
update public.regras_tarefas set grupo = 'tarefas' where grupo is null;

-- quem recebe e-mail do cliente: contato financeiro/cobrança/boletos; senão o e-mail do cadastro; senão outra empresa do grupo
create or replace function public.email_do_cliente(p_cliente uuid, p_grupo uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select c.email from public.contatos c where c.cliente_id = p_cliente and c.email <> '' and (c.recebe_boletos or c.finalidade in ('financeiro','cobranca')) order by c.recebe_boletos desc limit 1),
    (select nullif(cl.email, '') from public.clientes cl where cl.id = p_cliente),
    (select c.email from public.contatos c join public.clientes cl on cl.id = c.cliente_id where p_cliente is null and cl.grupo_id = p_grupo and c.email <> ''
       and (c.recebe_boletos or c.finalidade in ('financeiro','cobranca')) order by c.recebe_boletos desc limit 1),
    (select cl.email from public.clientes cl where p_cliente is null and cl.grupo_id = p_grupo and cl.email <> '' and cl.tipo <> 'Inativo' order by cl.nome limit 1));
$$;
revoke all on function public.email_do_cliente(uuid, uuid) from public, anon, authenticated;

create or replace function public.brl_texto(v numeric) returns text language sql immutable as $$
  select 'R$ ' || replace(replace(replace(to_char(coalesce(v, 0), 'FM999G999G990D00'), ',', '#'), '.', ','), '#', '.');
$$;

-- manda um e-mail ao cliente uma vez só por "ref" (não repete a mesma cobrança)
create or replace function public.email_ao_cliente(p_regra text, p_ref text, p_cliente uuid, p_grupo uuid, p_assunto text, p_corpo text) returns boolean
language plpgsql security definer set search_path = public as $$
declare para text;
begin
  if exists (select 1 from public.automacoes_log where ref = p_ref) then return false; end if;
  para := public.email_do_cliente(p_cliente, p_grupo);
  if para is null or para = '' then return false; end if;
  insert into public.email_fila (usuario_id, para, assunto, html, tipo, referencia)
  values (null, para, p_assunto, public.email_modelo(p_assunto, p_corpo), 'cliente', p_ref);
  insert into public.automacoes_log (chave, ref, descricao, cliente_id) values (p_regra, p_ref, p_assunto || ' → ' || para, p_cliente);
  return true;
end $$;
revoke all on function public.email_ao_cliente(text, text, uuid, uuid, text, text) from public, anon, authenticated;

-- e-mails do passo diário (rodar_regras_tarefas chama)
create or replace function public.rodar_emails_cliente() returns int
language plpgsql security definer set search_path = public as $$
declare rg record; x record; n int := 0; esc text;
begin
  select * into rg from public.regras_tarefas where chave = 'email_lembrete_honorario' and ligada;
  if found then
    for x in select l.id, l.valor, l.vencimento, l.descricao, l.referencia, l.cliente_id, l.grupo_id from public.lancamentos l
              where l.tipo = 'receita' and not l.redutor and not l.pago and not coalesce(l.perda, false) and l.vencimento = current_date + rg.dias loop
      if public.email_ao_cliente('email_lh', 'email_lh:' || x.id, x.cliente_id, x.grupo_id,
           'Lembrete: honorários com vencimento em ' || to_char(x.vencimento, 'DD/MM/YYYY'),
           '<p>Olá!</p><p>Lembramos que os honorários <b>' || public.esc_html(x.descricao || coalesce(' ' || nullif(x.referencia, ''), '')) || '</b>, no valor de <b>' ||
           public.brl_texto(x.valor) || '</b>, vencem em <b>' || to_char(x.vencimento, 'DD/MM/YYYY') || '</b>.</p><p>Se já pagou, desconsidere esta mensagem.</p><p>Araújo &amp; Castro Advocacia</p>') then n := n + 1; end if;
    end loop;
  end if;
  select * into rg from public.regras_tarefas where chave = 'email_cobranca_honorario' and ligada;
  if found then
    for x in select l.id, l.valor, l.vencimento, l.descricao, l.referencia, l.cliente_id, l.grupo_id from public.lancamentos l
              where l.tipo = 'receita' and not l.redutor and not l.pago and not coalesce(l.perda, false) and l.vencimento = current_date - rg.dias loop
      if public.email_ao_cliente('email_ch', 'email_ch:' || x.id, x.cliente_id, x.grupo_id,
           'Honorários em aberto desde ' || to_char(x.vencimento, 'DD/MM/YYYY'),
           '<p>Olá!</p><p>Não identificamos o pagamento dos honorários <b>' || public.esc_html(x.descricao || coalesce(' ' || nullif(x.referencia, ''), '')) || '</b>, de <b>' ||
           public.brl_texto(x.valor) || '</b>, com vencimento em ' || to_char(x.vencimento, 'DD/MM/YYYY') || '.</p><p>Se já pagou, por favor nos envie o comprovante respondendo este e-mail. Qualquer dúvida, estamos à disposição.</p><p>Araújo &amp; Castro Advocacia</p>') then n := n + 1; end if;
    end loop;
  end if;
  select * into rg from public.regras_tarefas where chave = 'email_lembrete_acordo' and ligada;
  if found then
    for x in select a.id, a.valor, a.vencimento, a.credor, a.parcela, a.total_parcelas, a.processo, a.grupo_id,
                    (select cl.id from public.clientes cl where cl.grupo_id = a.grupo_id and public.primeiro_nome(cl.nome) = public.primeiro_nome(a.devedor) limit 1) cli
               from public.acordos a where not a.pago and a.vencimento = current_date + rg.dias loop
      if public.email_ao_cliente('email_la', 'email_la:' || x.id, x.cli, x.grupo_id,
           'Lembrete: parcela do acordo vence em ' || to_char(x.vencimento, 'DD/MM/YYYY'),
           '<p>Olá!</p><p>A parcela <b>' || coalesce(x.parcela, '') || coalesce('/' || x.total_parcelas, '') || '</b> do acordo com <b>' || public.esc_html(coalesce(x.credor, '')) ||
           '</b> (processo ' || public.esc_html(coalesce(x.processo, '')) || '), de <b>' || public.brl_texto(x.valor) || '</b>, vence em <b>' || to_char(x.vencimento, 'DD/MM/YYYY') ||
           '</b>.</p><p>Depois de pagar, nos envie o comprovante respondendo este e-mail.</p><p>Araújo &amp; Castro Advocacia</p>') then n := n + 1; end if;
    end loop;
  end if;
  return n;
end $$;
revoke all on function public.rodar_emails_cliente() from public, anon, authenticated;

-- contrato novo → tarefa "anexar contrato assinado"
create or replace function public.regra_contrato_anexo() returns trigger
language plpgsql security definer set search_path = public as $$
declare rg record; cl record;
begin
  select * into rg from public.regras_tarefas where chave = 'contrato_anexo' and ligada;
  if not found or current_setting('erp.sem_regra_onboarding', true) = '1' then return null; end if;
  if exists (select 1 from public.documentos d where d.contrato_id = new.id) then return null; end if;
  select * into cl from public.clientes where id = new.cliente_id;
  perform public.tarefa_da_regra('anexo:' || new.id, 'Anexar o contrato assinado — ' || new.descricao || coalesce(' (' || cl.nome || ')', ''),
    coalesce(nullif(rg.responsavel, ''), nullif(new.responsavel, ''), cl.responsavel), public.somar_uteis(coalesce(new.data_contrato, current_date), rg.dias),
    new.cliente_id, cl.grupo_id, new.id, '[]', 'Envie o PDF assinado em Contratos → abrir o contrato → Documentos. A tarefa se conclui sozinha.');
  return null;
end $$;
drop trigger if exists regra_contrato_anexo on public.contratos;
create trigger regra_contrato_anexo after insert on public.contratos for each row execute function public.regra_contrato_anexo();

-- documento ligado ao contrato → conclui "anexar contrato"
create or replace function public.anexo_conclui_tarefa() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.contrato_id is null then return null; end if;
  update public.tarefas set status = 'concluida', checklist = (select coalesce(jsonb_agg(i || '{"feito":true}'::jsonb), '[]'::jsonb) from jsonb_array_elements(checklist) i)
   where chave_regra = 'anexo:' || new.contrato_id and status not in ('concluida','cancelada');
  get diagnostics n = row_count;
  if n > 0 then insert into public.automacoes_log (chave, ref, descricao, cliente_id) values ('anexo', 'anexo-ok:' || new.contrato_id, 'Contrato anexado: tarefa concluída sozinha', new.cliente_id); end if;
  return null;
end $$;
drop trigger if exists anexo_conclui_tarefa on public.documentos;
create trigger anexo_conclui_tarefa after insert or update of contrato_id on public.documentos for each row execute function public.anexo_conclui_tarefa();

-- processo novo de grupo sem nenhuma procuração → tarefa "providenciar procuração"
create or replace function public.regra_processo_procuracao() returns trigger
language plpgsql security definer set search_path = public as $$
declare rg record; g record;
begin
  select * into rg from public.regras_tarefas where chave = 'processo_procuracao' and ligada;
  if not found or new.chave_importacao is not null or new.grupo_id is null or new.procuracao is true then return null; end if;
  if exists (select 1 from public.clientes where grupo_id = new.grupo_id and procuracao is true) then return null; end if;
  select * into g from public.grupos where id = new.grupo_id;
  perform public.tarefa_da_regra('procur:' || new.grupo_id, 'Providenciar procuração — ' || coalesce(g.nome, 'grupo'),
    coalesce(nullif(rg.responsavel, ''), new.advogado), public.somar_uteis(current_date, rg.dias), null, new.grupo_id, null,
    '[{"texto":"Gerar a procuração","feito":false},{"texto":"Colher assinatura","feito":false},{"texto":"Marcar Procuração: Sim no cadastro","feito":false}]',
    'Processo ' || new.numero || ' cadastrado e nenhuma empresa do grupo tem procuração.', new.numero);
  return null;
end $$;
drop trigger if exists regra_processo_procuracao on public.processos;
create trigger regra_processo_procuracao after insert on public.processos for each row execute function public.regra_processo_procuracao();

-- procuração marcada no cadastro → conclui a tarefa do grupo
create or replace function public.procuracao_conclui_tarefa() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.procuracao is not true or old.procuracao is true or new.grupo_id is null then return null; end if;
  update public.tarefas set status = 'concluida', checklist = (select coalesce(jsonb_agg(i || '{"feito":true}'::jsonb), '[]'::jsonb) from jsonb_array_elements(checklist) i)
   where chave_regra = 'procur:' || new.grupo_id and status not in ('concluida','cancelada');
  get diagnostics n = row_count;
  if n > 0 then insert into public.automacoes_log (chave, ref, descricao, cliente_id) values ('procur', 'procur-ok:' || new.id, 'Procuração marcada: tarefa concluída sozinha', new.id); end if;
  return null;
end $$;
drop trigger if exists procuracao_conclui_tarefa on public.clientes;
create trigger procuracao_conclui_tarefa after update of procuracao on public.clientes for each row execute function public.procuracao_conclui_tarefa();

-- honorário pago → conclui "cobrar honorário" + (opcional) e-mail de confirmação ao cliente
create or replace function public.pagamento_automacoes() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not new.pago or old.pago or new.tipo <> 'receita' or new.redutor then return null; end if;
  if exists (select 1 from public.regras_tarefas where chave = 'pagamento_conclui' and ligada) then
    update public.tarefas set status = 'concluida', checklist = (select coalesce(jsonb_agg(i || '{"feito":true}'::jsonb), '[]'::jsonb) from jsonb_array_elements(checklist) i) where chave_regra = 'cob:' || new.id and status not in ('concluida','cancelada');
    get diagnostics n = row_count;
    if n > 0 then insert into public.automacoes_log (chave, ref, descricao, cliente_id) values ('pagamento_conclui', 'pago:' || new.id, 'Honorário recebido: cobrança concluída sozinha — ' || new.descricao, new.cliente_id); end if;
  end if;
  if exists (select 1 from public.regras_tarefas where chave = 'email_pagamento_recebido' and ligada) then
    perform public.email_ao_cliente('email_pr', 'email_pr:' || new.id, new.cliente_id, new.grupo_id, 'Recebemos o seu pagamento',
      '<p>Olá!</p><p>Confirmamos o recebimento de <b>' || public.brl_texto(new.valor) || '</b> referente a <b>' || public.esc_html(new.descricao || coalesce(' ' || nullif(new.referencia, ''), '')) ||
      '</b>' || coalesce(', em ' || to_char(new.data_pagamento, 'DD/MM/YYYY'), '') || '. Obrigado!</p><p>Araújo &amp; Castro Advocacia</p>');
  end if;
  return null;
end $$;
drop trigger if exists pagamento_automacoes on public.lancamentos;
create trigger pagamento_automacoes after update of pago on public.lancamentos for each row execute function public.pagamento_automacoes();

-- publicação nova ligada a processo → tarefa (começa desligada: prazo legal precisa de conferência)
create or replace function public.publicacao_tarefa() returns trigger
language plpgsql security definer set search_path = public as $$
declare rg record; pr record;
begin
  select * into rg from public.regras_tarefas where chave = 'publicacao_tarefa' and ligada;
  if not found or new.processo_id is null or new.tarefa_id is not null then return null; end if;
  select * into pr from public.processos where id = new.processo_id;
  perform public.tarefa_da_regra('pub:' || new.id, 'Analisar publicação — ' || coalesce(nullif(new.tipo, ''), 'comunicação') || ' · ' || coalesce(pr.numero, new.processo),
    coalesce(nullif(rg.responsavel, ''), nullif(new.advogado, ''), pr.advogado), public.somar_uteis(coalesce(new.data_disponibilizacao, current_date), rg.dias),
    null, pr.grupo_id, null, '[]', 'Prazo sugerido: confira o prazo legal no texto da publicação (Jurídico → Publicações).', coalesce(pr.numero, new.processo));
  update public.publicacoes set tarefa_id = (select id from public.tarefas where chave_regra = 'pub:' || new.id) where id = new.id and tarefa_id is null;
  return null;
end $$;
drop trigger if exists publicacao_tarefa on public.publicacoes;
create trigger publicacao_tarefa after update of processo_id on public.publicacoes for each row execute function public.publicacao_tarefa();

-- Central de automações: quantas vezes cada uma agiu nos últimos 30 dias
create or replace function public.resumo_automacoes() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(chave, n), '{}') from (
    select chave, count(*) n from public.automacoes_log where quando > now() - interval '30 days' and chave <> '_item' group by chave) x
  where public.eh_equipe();
$$;
revoke all on function public.resumo_automacoes() from public, anon;
grant execute on function public.resumo_automacoes() to authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- v18 — Área do cliente (Jurídico / Contabilidade / Ambos) e quem vê cada área;
--       rascunho de estagiário (nível "Propor": só vale depois de aprovado);
--       êxito dos contratos (lança % × X quando acontece); comprovante do acordo.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────── acordos: comprovante juntado ao processo ───────────
alter table public.acordos add column if not exists comprovante_processo boolean;
alter table public.acordos add column if not exists comprovante_id text not null default '';

-- ─────────── área do cliente e áreas que cada usuário vê ───────────
alter table public.clientes add column if not exists area text not null default 'ambos';
alter table public.perfis add column if not exists areas text not null default 'ambos';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clientes_area_check') then
    alter table public.clientes add constraint clientes_area_check check (area in ('juridico','contabil','ambos'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'perfis_areas_check') then
    alter table public.perfis add constraint perfis_areas_check check (areas in ('juridico','contabil','ambos'));
  end if;
end $$;
create index if not exists clientes_area on public.clientes (area);

-- migração (uma vez só): sugere a área pelo que o cliente já tem no sistema
--   só lançamentos da contabilidade → Contabilidade; só coisas do jurídico → Jurídico; os dois ou nada → Ambos
do $$
begin
  if not exists (select 1 from public.configuracoes where chave = 'migracao_v18_area') then
    update public.clientes c set area = case
        when x.contab and not x.jur then 'contabil'
        when x.jur and not x.contab then 'juridico'
        else 'ambos' end
      from (select c2.id,
              exists (select 1 from public.lancamentos l where l.empresa = 'contabilidade' and (l.cliente_id = c2.id or (c2.grupo_id is not null and l.grupo_id = c2.grupo_id))) contab,
              exists (select 1 from public.lancamentos l where l.empresa = 'escritorio' and (l.cliente_id = c2.id or (c2.grupo_id is not null and l.grupo_id = c2.grupo_id)))
                or exists (select 1 from public.processos p where c2.grupo_id is not null and p.grupo_id = c2.grupo_id)
                or exists (select 1 from public.contratos k where k.cliente_id = c2.id) jur
            from public.clientes c2) x
     where x.id = c.id;
    insert into public.configuracoes (chave, valor) values ('migracao_v18_area', '{"feito":true}');
  end if;
end $$;

-- a pessoa logada vê clientes desta área? (admin e "ambas" veem tudo; cliente "ambos" todos veem)
create or replace function public.ve_area(a text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.papel = 'admin' or p.areas = 'ambos' or coalesce(a, 'ambos') = 'ambos' or a = p.areas
                     from public.perfis p where p.id = auth.uid()), false);
$$;
create or replace function public.ve_cliente(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select c is null or coalesce((select public.ve_area(area) from public.clientes where id = c), true);
$$;
revoke all on function public.ve_area(text) from anon;
revoke all on function public.ve_cliente(uuid) from anon;
grant execute on function public.ve_area(text) to authenticated;
grant execute on function public.ve_cliente(uuid) to authenticated;

-- regra RESTRITIVA: soma-se às regras de função (não substitui). Quem só vê Jurídico não lê,
-- nem grava, cliente só da Contabilidade — nem os contatos, contratos e documentos dele.
drop policy if exists clientes_area on public.clientes;
create policy clientes_area on public.clientes as restrictive for all to authenticated
  using (public.ve_area(area)) with check (public.ve_area(area));
do $$
declare t text;
begin
  foreach t in array array['contatos','enderecos','contas_bancarias','vinculos_societarios','cliente_etiquetas','interacoes','certidoes','documentos','contratos'] loop
    execute format('drop policy if exists %1$s_area on public.%1$s', t);
    execute format('create policy %1$s_area on public.%1$s as restrictive for all to authenticated using (public.ve_cliente(cliente_id)) with check (public.ve_cliente(cliente_id))', t);
  end loop;
end $$;

-- ─────────── nível "Propor" (estagiário): altera como rascunho, alguém valida ───────────
-- pode(f,'propor') = pode sugerir; pode(f,'editar') = grava direto e aprova rascunhos.
create or replace function public.pode(f text, nivel text default 'ver') returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when p.papel = 'admin' then true
                when p.papel <> 'equipe' then false
                when coalesce(p.funcoes->>f, '') = 'editar' then true
                when coalesce(p.funcoes->>f, '') = 'propor' then nivel in ('ver','propor')
                when coalesce(p.funcoes->>f, '') = 'ver' then nivel = 'ver'
                else false end
      from public.perfis p where p.id = auth.uid()), false);
$$;

create table if not exists public.rascunhos (
  id           uuid primary key default gen_random_uuid(),
  tabela       text not null,
  operacao     text not null check (operacao in ('incluir','alterar','excluir')),
  filtros      jsonb not null default '{}'::jsonb,     -- quais linhas (ex.: {"id": "..."})
  dados        jsonb not null default '{}'::jsonb,     -- o que muda / o registro novo
  antes        jsonb,                                  -- como estava (para mostrar a diferença)
  resumo       text not null default '',
  funcao       text not null,
  autor        uuid default auth.uid() references public.perfis(id) on delete set null,
  autor_nome   text not null default '',
  criado_em    timestamptz not null default now(),
  status       text not null default 'pendente' check (status in ('pendente','aprovado','recusado','cancelado')),
  revisor      uuid references public.perfis(id) on delete set null,
  revisor_nome text not null default '',
  decidido_em  timestamptz,
  motivo       text not null default ''
);
create index if not exists rascunhos_status on public.rascunhos (status, criado_em desc);
alter table public.rascunhos enable row level security;
revoke all on public.rascunhos from anon;
grant select on public.rascunhos to authenticated;
drop policy if exists rascunhos_ver on public.rascunhos;
create policy rascunhos_ver on public.rascunhos for select to authenticated
  using (autor = auth.uid() or public.pode(funcao, 'editar'));

-- tabelas que aceitam rascunho → função de acesso que decide
create or replace function public.funcao_da_tabela(p_tabela text, p_empresa text) returns text
language sql immutable as $$
  select case
    when p_tabela in ('clientes','contatos','enderecos','contas_bancarias','vinculos_societarios','interacoes','certidoes','cliente_etiquetas') then 'clientes'
    when p_tabela = 'contratos' then 'contratos'
    when p_tabela in ('processos','parcelamentos','parcelas','acordos') then 'juridico'
    when p_tabela = 'lancamentos' then case when p_empresa = 'contabilidade' then 'financeiro_contab' else 'financeiro_juridico' end
    else null end;
$$;

-- "where" seguro a partir dos filtros {coluna: valor | [valores]}
create or replace function public.rascunho_where(p_tabela text, p_filtros jsonb) returns text
language plpgsql stable set search_path = public as $$
declare k text; v jsonb; w text := '';
begin
  for k, v in select * from jsonb_each(coalesce(p_filtros, '{}')) loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = p_tabela and column_name = k) then
      raise exception 'Campo desconhecido: %', k;
    end if;
    w := w || case when w = '' then '' else ' and ' end ||
      case when jsonb_typeof(v) = 'array' then format('%I::text = any (%L::text[])', k, array(select jsonb_array_elements_text(v)))
           else format('%I::text = %L', k, v #>> '{}') end;
  end loop;
  if w = '' then raise exception 'Rascunho sem indicação de qual registro alterar.'; end if;
  return w;
end $$;

create or replace function public.avisar_aprovadores(p_funcao text, p_titulo text, p_detalhe text) returns void
language sql security definer set search_path = public as $$
  insert into public.notificacoes (usuario_id, tipo, titulo, detalhe, link)
  select p.id, 'rascunho', p_titulo, p_detalhe, 'aprovacoes' from public.perfis p
   where p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
     and (p.papel = 'admin' or (p.papel = 'equipe' and p.funcoes->>p_funcao = 'editar'));
$$;
revoke all on function public.avisar_aprovadores(text, text, text) from public, anon, authenticated;

-- o rascunho mexe só em clientes da área de quem está logado?
create or replace function public.rascunho_na_area(p_tabela text, p_antes jsonb, p_dados jsonb) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare x jsonb;
begin
  foreach x in array array[coalesce(p_antes, '{}'::jsonb)] || array(select case when jsonb_typeof(p_dados) = 'array' then e else p_dados end
      from jsonb_array_elements(case when jsonb_typeof(p_dados) = 'array' then p_dados else '[null]'::jsonb end) e) loop
    if x is null then continue; end if;
    if p_tabela = 'clientes' and x ? 'area' and not public.ve_area(x->>'area') then return false; end if;
    if x ? 'cliente_id' and nullif(x->>'cliente_id', '') is not null and not public.ve_cliente((x->>'cliente_id')::uuid) then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function public.rascunho_na_area(text, jsonb, jsonb) from public, anon;

-- estagiário (nível Propor) envia a alteração; nada muda até alguém aprovar
create or replace function public.propor_alteracao(p_tabela text, p_operacao text, p_filtros jsonb, p_dados jsonb, p_resumo text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare f text; emp text; ant jsonb; novo uuid; nome text;
begin
  emp := coalesce(p_dados->>'empresa', case when p_tabela = 'lancamentos' and p_filtros ? 'id'
           then (select empresa from public.lancamentos where id::text = p_filtros->>'id') end);
  f := public.funcao_da_tabela(p_tabela, emp);
  if f is null then raise exception 'Este tipo de registro não aceita rascunho.'; end if;
  if not public.pode(f, 'propor') then raise exception 'permission denied: sem acesso para propor alterações aqui.'; end if;
  if p_operacao not in ('incluir','alterar','excluir') then raise exception 'Operação inválida.'; end if;
  if p_operacao <> 'incluir' then
    perform public.rascunho_where(p_tabela, p_filtros);          -- valida os filtros
    if p_filtros ? 'id' then
      execute format('select to_jsonb(t) from public.%I t where id::text = $1', p_tabela) into ant using p_filtros->>'id';
    end if;
  end if;
  -- nada de outra área (nem o "antes" de um cliente que a pessoa não vê)
  if not public.rascunho_na_area(p_tabela, ant, p_dados) then raise exception 'permission denied: cliente de outra área.'; end if;
  select nullif(p.nome, '') into nome from public.perfis p where p.id = auth.uid();
  insert into public.rascunhos (tabela, operacao, filtros, dados, antes, resumo, funcao, autor_nome)
  values (p_tabela, p_operacao, coalesce(p_filtros, '{}'), coalesce(p_dados, '{}'), ant, left(coalesce(p_resumo, ''), 300), f, coalesce(nome, ''))
  returning id into novo;
  perform public.avisar_aprovadores(f, 'Alteração aguardando aprovação',
    coalesce(nome, 'Alguém') || ' propôs: ' || coalesce(nullif(p_resumo, ''), p_operacao || ' em ' || p_tabela));
  return novo;
end $$;
revoke all on function public.propor_alteracao(text, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.propor_alteracao(text, text, jsonb, jsonb, text) to authenticated;

-- quem pode editar aquela função aprova: a alteração é aplicada exatamente como proposta
create or replace function public.aprovar_rascunho(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.rascunhos; cols text; w text; n int := 0; linha jsonb; k int;
begin
  select * into r from public.rascunhos where id = p_id for update;
  if r.id is null or r.status <> 'pendente' then raise exception 'Este rascunho não está mais pendente.'; end if;
  if not public.pode(r.funcao, 'editar') then raise exception 'permission denied: só quem edita esta área aprova.'; end if;
  if r.autor = auth.uid() and not public.eh_admin() then raise exception 'Outra pessoa precisa aprovar a sua própria alteração.'; end if;
  if r.operacao = 'excluir' and r.tabela in ('clientes','contratos','processos','parcelamentos','acordos') and not public.eh_admin() then
    raise exception 'permission denied: só o administrador aprova exclusões deste tipo.';
  end if;
  if not public.rascunho_na_area(r.tabela, r.antes, r.dados) then
    raise exception 'permission denied: cliente de outra área.';
  end if;
  -- lançamento que muda de empresa: quem aprova precisa editar as duas
  if r.tabela = 'lancamentos' and jsonb_typeof(r.dados) = 'object' and r.dados ? 'empresa'
     and not public.pode(public.funcao_da_tabela('lancamentos', r.dados->>'empresa'), 'editar') then
    raise exception 'permission denied: sem acesso ao financeiro de destino.';
  end if;
  if r.operacao = 'incluir' then
    for linha in select case when jsonb_typeof(r.dados) = 'array' then e else r.dados end
                   from jsonb_array_elements(case when jsonb_typeof(r.dados) = 'array' then r.dados else '[null]'::jsonb end) e loop
      select string_agg(quote_ident(c.column_name), ',') into cols from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = r.tabela and linha ? c.column_name and c.column_name not in ('criado_por','criado_em','atualizado_em');
      if cols is null then raise exception 'Rascunho vazio.'; end if;
      execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)', r.tabela, cols, cols, r.tabela) using linha;
      n := n + 1;
    end loop;
  else
    w := public.rascunho_where(r.tabela, r.filtros);
    if r.operacao = 'alterar' then
      select string_agg(quote_ident(c.column_name), ',') into cols from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = r.tabela and r.dados ? c.column_name and c.column_name not in ('id','criado_por','criado_em','atualizado_em');
      if cols is null then raise exception 'Rascunho vazio.'; end if;
      execute format('update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where %s', r.tabela, cols, cols, r.tabela, w) using r.dados;
    else
      execute format('delete from public.%I where %s', r.tabela, w);
    end if;
    get diagnostics n = row_count;
    if n = 0 then raise exception 'O registro não existe mais (foi apagado ou alterado por outra pessoa).'; end if;
  end if;
  update public.rascunhos set status = 'aprovado', revisor = auth.uid(), decidido_em = now(),
         revisor_nome = coalesce((select nome from public.perfis where id = auth.uid()), '') where id = p_id;
  if r.autor is not null then
    insert into public.notificacoes (usuario_id, tipo, titulo, detalhe, link)
    values (r.autor, 'rascunho', 'Sua alteração foi aprovada', coalesce(nullif(r.resumo, ''), r.tabela), 'aprovacoes');
  end if;
end $$;
revoke all on function public.aprovar_rascunho(uuid) from public, anon;
grant execute on function public.aprovar_rascunho(uuid) to authenticated;

create or replace function public.recusar_rascunho(p_id uuid, p_motivo text default '') returns void
language plpgsql security definer set search_path = public as $$
declare r public.rascunhos;
begin
  select * into r from public.rascunhos where id = p_id for update;
  if r.id is null or r.status <> 'pendente' then raise exception 'Este rascunho não está mais pendente.'; end if;
  if r.autor = auth.uid() then   -- o próprio autor desiste
    update public.rascunhos set status = 'cancelado', decidido_em = now() where id = p_id;
    return;
  end if;
  if not public.pode(r.funcao, 'editar') then raise exception 'permission denied: só quem edita esta área recusa.'; end if;
  update public.rascunhos set status = 'recusado', revisor = auth.uid(), decidido_em = now(), motivo = left(coalesce(p_motivo, ''), 500),
         revisor_nome = coalesce((select nome from public.perfis where id = auth.uid()), '') where id = p_id;
  if r.autor is not null then
    insert into public.notificacoes (usuario_id, tipo, titulo, detalhe, link)
    values (r.autor, 'rascunho', 'Sua alteração foi recusada', coalesce(nullif(r.resumo, ''), r.tabela) || case when coalesce(p_motivo, '') <> '' then ' — motivo: ' || p_motivo else '' end, 'aprovacoes');
  end if;
end $$;
revoke all on function public.recusar_rascunho(uuid, text) from public, anon;
grant execute on function public.recusar_rascunho(uuid, text) to authenticated;

-- ─────────── êxito: como foi combinado + registros (vira lançamento só quando acontece) ───────────
alter table public.contratos add column if not exists exito_base text;
alter table public.contratos add column if not exists exito_regra text not null default '';
create table if not exists public.exitos (
  id            uuid primary key default gen_random_uuid(),
  contrato_id   uuid not null references public.contratos(id) on delete cascade,
  cliente_id    uuid references public.clientes(id) on delete set null,
  data          date not null default current_date,
  base_valor    numeric(16,2) not null check (base_valor > 0),     -- o X (ex.: a economia obtida)
  percentual    numeric(5,2) not null,
  valor         numeric(14,2) not null,                             -- percentual × X
  descricao     text not null default '',
  lancamento_id uuid references public.lancamentos(id) on delete set null,
  criado_por    uuid default auth.uid(),
  criado_em     timestamptz not null default now()
);
create index if not exists exitos_contrato on public.exitos (contrato_id, data);
alter table public.exitos enable row level security;
revoke all on public.exitos from anon;
grant select on public.exitos to authenticated;
drop policy if exists exitos_ver on public.exitos;
create policy exitos_ver on public.exitos for select to authenticated using (public.pode('contratos') and public.ve_cliente(cliente_id));

create or replace function public.registrar_exito(p_contrato uuid, p_base numeric, p_data date, p_vencimento date, p_descricao text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare c record; v numeric(14,2); lanc uuid;
begin
  if not public.pode('contratos', 'editar') then raise exception 'permission denied: só quem edita Contratos registra êxito.'; end if;
  select k.*, cl.grupo_id, cl.responsavel resp_cliente into c from public.contratos k join public.clientes cl on cl.id = k.cliente_id where k.id = p_contrato;
  if c.id is null or not public.ve_cliente(c.cliente_id) then raise exception 'Contrato não encontrado.'; end if;
  if coalesce(c.percentual_exito, 0) <= 0 then raise exception 'Este contrato não tem %% de êxito.'; end if;
  if coalesce(p_base, 0) <= 0 then raise exception 'Informe o valor-base (X) maior que zero.'; end if;
  v := round(p_base * c.percentual_exito / 100, 2);
  insert into public.lancamentos (empresa, tipo, descricao, categoria, cliente_id, contrato_id, grupo_id, responsavel, referencia, vencimento, valor, obs)
  values ('escritorio', 'receita', c.descricao || ' — êxito', 'Êxito', c.cliente_id, c.id, c.grupo_id, coalesce(nullif(c.responsavel, ''), c.resp_cliente, ''),
          replace(c.percentual_exito::text, '.', ',') || '% de ' || public.brl_texto(p_base), coalesce(p_vencimento, p_data, current_date), v,
          coalesce(nullif(p_descricao, ''), 'Êxito registrado em ' || to_char(coalesce(p_data, current_date), 'DD/MM/YYYY')))
  returning id into lanc;
  insert into public.exitos (contrato_id, cliente_id, data, base_valor, percentual, valor, descricao, lancamento_id)
  values (c.id, c.cliente_id, coalesce(p_data, current_date), p_base, c.percentual_exito, v, coalesce(p_descricao, ''), lanc);
  return lanc;
end $$;
revoke all on function public.registrar_exito(uuid, numeric, date, date, text) from public, anon;
grant execute on function public.registrar_exito(uuid, numeric, date, date, text) to authenticated;
-- fim da v18


-- ═══════════════════════════════════════════════════════════════════
-- v19 — Início sem números sobrepostos, caixa de avisos, e-mails por finalidade
-- ═══════════════════════════════════════════════════════════════════

-- "A receber" e "A pagar" do mês = de hoje até o fim do período (o que já venceu fica só em "Em atraso")
create or replace function public.resumo_financeiro(p_empresa text default null, p_de date default null, p_ate date default null)
returns jsonb language sql stable security invoker set search_path = public as $$
  with per as (
    select coalesce(p_de, date_trunc('month', current_date)::date) as de,
           coalesce(p_ate, (date_trunc('month', current_date) + interval '1 month - 1 day')::date) as ate
  ), l as (
    select l.empresa, l.tipo, l.pago, l.perda, l.vencimento, l.data_pagamento,
           case when l.redutor then -l.valor else l.valor end as v
      from public.lancamentos l
     where p_empresa is null or l.empresa = p_empresa
  ), t as (
    select e.empresa,
      coalesce(sum(l.v) filter (where l.tipo = 'receita' and l.pago and l.data_pagamento between per.de and per.ate), 0) as recebido,
      count(*)          filter (where l.tipo = 'receita' and l.pago and l.data_pagamento between per.de and per.ate) as n_recebido,
      coalesce(sum(l.v) filter (where l.tipo = 'receita' and not l.pago and not l.perda and l.vencimento between greatest(per.de, current_date) and per.ate), 0) as a_receber,
      count(*)          filter (where l.tipo = 'receita' and not l.pago and not l.perda and l.vencimento between greatest(per.de, current_date) and per.ate) as n_a_receber,
      coalesce(sum(l.v) filter (where l.tipo = 'receita' and not l.pago and not l.perda and l.vencimento < current_date), 0) as em_atraso,
      count(*)          filter (where l.tipo = 'receita' and not l.pago and not l.perda and l.vencimento < current_date) as n_em_atraso,
      coalesce(sum(l.v) filter (where l.tipo = 'despesa' and not l.pago and not l.perda and l.vencimento between greatest(per.de, current_date) and per.ate), 0) as a_pagar,
      count(*)          filter (where l.tipo = 'despesa' and not l.pago and not l.perda and l.vencimento between greatest(per.de, current_date) and per.ate) as n_a_pagar
    from (select unnest(array['escritorio','contabilidade']) as empresa) e
    cross join per
    left join l on l.empresa = e.empresa
    where p_empresa is null or e.empresa = p_empresa
    group by e.empresa
  )
  select coalesce(jsonb_object_agg(empresa, to_jsonb(t) - 'empresa'), '{}'::jsonb) from t;
$$;

-- cada pessoa escolhe como quer ser chamada (barra superior e "Olá, …")
create or replace function public.salvar_meu_nome(p text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or btrim(coalesce(p, '')) = '' then raise exception 'Informe o nome.'; end if;
  update public.perfis set nome = left(btrim(p), 80) where id = auth.uid();
end $$;
revoke all on function public.salvar_meu_nome(text) from public, anon;
grant execute on function public.salvar_meu_nome(text) to authenticated;

-- caixa de avisos: o que cada pessoa já leu (por assunto + leva). Se o assunto continuar sem solução,
-- a próxima leva (amanhã para os urgentes, semana que vem para os demais) aparece de novo como não lida.
create table if not exists public.avisos_lidos (
  usuario_id uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  chave      text not null,
  lido_em    timestamptz not null default now(),
  primary key (usuario_id, chave)
);
alter table public.avisos_lidos enable row level security;
revoke all on public.avisos_lidos from anon;
grant select, insert, delete on public.avisos_lidos to authenticated;
drop policy if exists avisos_lidos_meus on public.avisos_lidos;
create policy avisos_lidos_meus on public.avisos_lidos for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
-- limpeza: leituras com mais de 60 dias e notificações lidas com mais de 90 dias
delete from public.avisos_lidos where lido_em < now() - interval '60 days';
delete from public.notificacoes where lida and criado_em < now() - interval '90 days';

-- ─────────── dados de DEMONSTRAÇÃO (fictícios, marcados "DEMO ·") ───────────
-- Administração → Importar → "🧪 Demonstração": carregar (apaga a anterior e cria de novo) ou apagar.
-- E-mails usam domínios example.com (reservados: não chegam a ninguém). CNPJs começam com 99 (fictícios).
create or replace function public.limpar_demonstracao() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; k int; gs uuid[]; cs uuid[];
begin
  if not public.eh_admin() then raise exception 'permission denied: só o administrador.'; end if;
  select coalesce(array_agg(id), '{}') into gs from public.grupos where nome like 'DEMO · %';
  select coalesce(array_agg(id), '{}') into cs from public.clientes where grupo_id = any(gs) or chave_importacao like 'demo:%';
  delete from public.rascunhos where resumo like '%(demonstração)%';
  -- e-mails e registros de automação dos exemplos (example.com nunca recebe nada)
  delete from public.automacoes_log where cliente_id = any(cs) or descricao like '%example.com%';
  delete from public.email_fila where para like '%example.com';
  delete from public.crm_oportunidades where cliente_id = any(cs) or prospecto_empresa like 'DEMO · %';
  delete from public.tarefas where cliente_id = any(cs) or grupo_id = any(gs) or chave_importacao like 'demo:%';
  delete from public.documentos where cliente_id = any(cs) or grupo_id = any(gs);
  delete from public.exitos where cliente_id = any(cs);
  delete from public.lancamentos where cliente_id = any(cs) or grupo_id = any(gs) or chave_importacao like 'demo:%';
  delete from public.contratos where cliente_id = any(cs);
  delete from public.acordos where grupo_id = any(gs) or chave_importacao like 'demo:%';
  delete from public.parcelamentos where grupo_id = any(gs) or chave_importacao like 'demo:%';
  delete from public.processos where grupo_id = any(gs) or chave_importacao like 'demo:%';
  delete from public.clientes where id = any(cs);
  get diagnostics k = row_count; n := n + k;
  delete from public.grupos where id = any(gs);
  return n;
end $$;
revoke all on function public.limpar_demonstracao() from public, anon;
grant execute on function public.limpar_demonstracao() to authenticated;

create or replace function public.carregar_demonstracao() returns int
language plpgsql security definer set search_path = public as $$
declare
  h date := current_date; m0 date := date_trunc('month', current_date)::date;
  gh uuid; gs uuid; gm uuid; ct uuid; cl uuid; sa uuid; sc uuid; cm uuid; mp uuid;
  k1 uuid; k2 uuid; k3 uuid; k4 uuid; pa uuid; e1 uuid; e2 uuid; e4 uuid; i int;
begin
  if not public.eh_admin() then raise exception 'permission denied: só o administrador.'; end if;
  perform public.limpar_demonstracao();
  insert into public.grupos (nome) values ('DEMO · Grupo Horizonte') returning id into gh;
  insert into public.grupos (nome) values ('DEMO · Grupo Serra Verde') returning id into gs;
  insert into public.grupos (nome) values ('DEMO · Família Moreira') returning id into gm;
  -- clientes (áreas diferentes para testar as permissões)
  insert into public.clientes (grupo_id, nome, cpf_cnpj, tipo, area, responsavel, email, telefone, cidade, estado, socio_admin, rfb, pgfn, pgfn_negociada, age_mg, age_mg_negociada,
      em_operacao, procuracao, certificado, cadastro_regular, capag, regime_tributario, situacao_cadastral, tipo_societario, chave_importacao)
    values (gh, 'Horizonte Transportes Ltda', '99111222000133', 'Consultoria', 'ambos', 'Pedro', 'contato@horizonte.example.com', '(31) 99999-0001', 'Belo Horizonte', 'MG', 'Ricardo Horizonte',
      180000, 420000, 150000, 90000, 30000, true, true, true, true, 'B', 'LP', 'ATIVA', 'LTDA', 'demo:c1') returning id into ct;
  insert into public.clientes (grupo_id, nome, cpf_cnpj, tipo, area, responsavel, email, pgfn, capag, regime_tributario, situacao_cadastral, tipo_societario, em_operacao, procuracao, chave_importacao)
    values (gh, 'Horizonte Logística Eireli', '99111222000214', 'Demanda', 'juridico', 'Emanuelle', 'adm@horizontelog.example.com', 60000, 'C', 'SN', 'INAPTA', 'EI', false, false, 'demo:c2') returning id into cl;
  insert into public.clientes (grupo_id, nome, cpf_cnpj, tipo, area, responsavel, email, telefone, cidade, estado, sefaz_mg, capag, regime_tributario, situacao_cadastral, tipo_societario, em_operacao, procuracao, certificado, chave_importacao)
    values (gs, 'Serra Verde Alimentos S.A.', '99333444000155', 'Consultoria', 'contabil', 'Adriana', 'financeiro@serraverde.example.com', '(31) 98888-0002', 'Contagem', 'MG', 35000, 'A', 'LR', 'ATIVA', 'S.A', true, true, true, 'demo:c3') returning id into sa;
  insert into public.clientes (grupo_id, nome, cpf_cnpj, tipo, area, responsavel, rfb, capag, regime_tributario, situacao_cadastral, tipo_societario, chave_importacao)
    values (gs, 'Serra Verde Comércio Ltda', '99333444000236', 'Consultoria', 'ambos', 'Adriana', 25000, 'Omisso', 'SN', 'ATIVA', 'LTDA', 'demo:c4') returning id into sc;
  insert into public.clientes (grupo_id, nome, cpf_cnpj, tipo, area, responsavel, email, pgfn, tipo_societario, procuracao, chave_importacao)
    values (gm, 'Carlos Moreira (DEMO)', '99988877766', 'Demanda', 'juridico', 'Pedro', 'carlos@moreira.example.com', 80000, 'PF', true, 'demo:c5') returning id into cm;
  insert into public.clientes (grupo_id, nome, cpf_cnpj, tipo, area, responsavel, regime_tributario, situacao_cadastral, tipo_societario, chave_importacao)
    values (gm, 'Moreira Participações Ltda', '99555666000177', 'Consultoria', 'ambos', 'Pedro', 'LP', 'ATIVA', 'LTDA', 'demo:c6') returning id into mp;
  -- contatos por finalidade (e-mail do financeiro diferente do contato geral)
  insert into public.contatos (cliente_id, nome, cargo, finalidade, email, telefone, whatsapp, recebe_boletos, recebe_notificacoes) values
    (ct, 'Marta (financeiro)', 'Gerente financeira', 'financeiro', 'financeiro@horizonte.example.com', '(31) 99999-1001', true, true, false),
    (ct, 'Ricardo Horizonte', 'Sócio', 'juridico', 'ricardo@horizonte.example.com', '(31) 99999-1002', true, false, true),
    (sa, 'Paula (contas a pagar)', 'Analista', 'financeiro', 'pagar@serraverde.example.com', '(31) 98888-1003', false, true, false),
    (mp, 'Carlos Moreira', 'Sócio', 'geral', 'carlos@moreira.example.com', '(31) 97777-1004', true, true, true);
  insert into public.interacoes (cliente_id, tipo, quando, resumo) values
    (ct, 'reuniao', now() - interval '6 days', 'Reunião mensal: revisão do parcelamento da PGFN e plano para a AGE/MG.'),
    (sa, 'email', now() - interval '2 days', 'Enviado o fechamento contábil do mês e a guia do DAS.');
  insert into public.certidoes (cliente_id, orgao, situacao, emissao, validade) values
    (ct, 'CND Federal', 'Positiva com efeitos de negativa', h - 170, h + 10),
    (sa, 'CND Estadual (MG)', 'Negativa', h - 200, h - 3);
  -- contratos (as mensalidades e parcelas saem sozinhas)
  insert into public.contratos (cliente_id, descricao, modalidade, forma_valor, valor_mensal, dia_vencimento, inicio_competencia, data_contrato, responsavel, valor_total, num_parcelas)
    values (ct, 'DEMO · Consultoria tributária mensal', 'consultoria', 'fixo', 4500, 10, (m0 - interval '3 months')::date, (m0 - interval '3 months')::date, 'Pedro', 0, 1) returning id into k1;
  insert into public.contratos (cliente_id, descricao, modalidade, forma_valor, qtd_salarios, dia_vencimento, inicio_competencia, data_contrato, responsavel, valor_total, num_parcelas)
    values (sc, 'DEMO · Assessoria em salários mínimos', 'consultoria', 'salario_minimo', 1.5, 5, (m0 - interval '2 months')::date, (m0 - interval '2 months')::date, 'Adriana', 0, 1) returning id into k2;
  insert into public.contratos (cliente_id, descricao, modalidade, valor_total, num_parcelas, primeiro_vencimento, data_contrato, responsavel)
    values (cl, 'DEMO · Defesa em execução fiscal', 'pontual', 12000, 4, (m0 - interval '1 month' + interval '14 days')::date, (m0 - interval '1 month')::date, 'Emanuelle') returning id into k3;
  insert into public.contratos (cliente_id, descricao, modalidade, valor_total, num_parcelas, percentual_exito, exito_base, exito_regra, data_contrato, responsavel)
    values (mp, 'DEMO · Transação tributária PGFN (êxito)', 'pontual', 0, 1, 20, 'economia', '20% do valor que a dívida reduzir, pago em até 10 dias', (m0 - interval '2 months')::date, 'Pedro') returning id into k4;
  perform public.gerar_mensalidades(k1); perform public.gerar_mensalidades(k2);
  update public.lancamentos set grupo_id = (select grupo_id from public.clientes where id = cliente_id) where contrato_id in (k1, k2, k3, k4) and grupo_id is null;
  -- o que já passou foi pago, menos uma mensalidade (fica em atraso) e a parcela de hoje
  update public.lancamentos set pago = true, data_pagamento = vencimento + 1, forma_pagamento = 'PIX'
   where contrato_id in (k1, k2, k3) and vencimento < h - 20;
  update public.lancamentos set vencimento = h where id = (select id from public.lancamentos where contrato_id = k3 and not pago order by vencimento limit 1);
  -- contabilidade: honorários mensais da Serra Verde (um em atraso, um vence hoje) e uma despesa
  for i in 0..3 loop
    insert into public.lancamentos (empresa, tipo, descricao, categoria, cliente_id, grupo_id, responsavel, referencia, vencimento, valor, pago, data_pagamento, chave_importacao)
    values ('contabilidade', 'receita', 'Honorários contábeis ' || to_char(m0 - (i || ' months')::interval, 'MM/YYYY'), 'Honorários contábeis', sa, gs, 'Adriana',
            to_char(m0 - (i || ' months')::interval, 'MM/YYYY'), case when i = 0 then h else (m0 - (i || ' months')::interval + interval '9 days')::date end, 1800,
            i >= 2, case when i >= 2 then (m0 - (i || ' months')::interval + interval '10 days')::date end, 'demo:lc' || i);
  end loop;
  insert into public.lancamentos (empresa, tipo, descricao, categoria, favorecido, vencimento, valor, chave_importacao)
    values ('contabilidade', 'despesa', 'DEMO · Sistema contábil (licença)', 'Software', 'Fornecedor Exemplo', h + 5, 390, 'demo:ld1');
  insert into public.lancamentos (empresa, tipo, descricao, categoria, cliente_id, grupo_id, responsavel, vencimento, valor, redutor, pago, data_pagamento, chave_importacao)
    values ('escritorio', 'receita', 'DEMO · Comissão de indicação', 'Comissão', ct, gh, 'Pedro', h - 15, 450, true, true, h - 15, 'demo:lr1');
  -- jurídico: processos, parcelamento com parcelas e acordo
  insert into public.processos (grupo_id, carteira, advogado, numero, competencia, natureza, autor, reu, data_distribuicao, valor, procuracao, status, chave_importacao) values
    (gh, 'Ativo', 'Pedro', '9000001-11.2025.4.01.3800', 'JF - BH', 'Execução fiscal', 'União (PGFN)', 'Horizonte Transportes Ltda', h - 400, 420000, true, 'Em andamento', 'demo:p1'),
    (gh, 'Ativo', 'Emanuelle', '9000002-22.2025.8.13.0024', 'TJMG - BH', 'Anulatória de débito', 'Horizonte Logística Eireli', 'Estado de Minas Gerais', h - 120, 60000, false, 'Aguardando Decisão', 'demo:p2'),
    (gm, 'Ativo', 'Pedro', '9000003-33.2024.5.03.0001', 'TRT3', 'Trabalhista', 'Ex-empregado (fictício)', 'Moreira Participações Ltda', h - 700, 35000, true, 'Arq. Provisoriamente', 'demo:p3'),
    (gs, 'Prospecção', 'Adriana', '9000004-44.2026.4.01.3800', 'JF - BH', 'Mandado de segurança', 'Serra Verde Alimentos S.A.', 'Delegado da Receita Federal', null, 150000, false, 'Em prospecção', 'demo:p4');
  insert into public.parcelamentos (grupo_id, aba, empresa, cnpj, local, natureza, numero, total_parcelas, valor_ultima_parcela, valor_residual, chave_importacao)
    values (gh, 'PGFN', 'Horizonte Transportes Ltda', '99111222000133', 'PGFN', 'Transação tributária', 'DEMO-2025-001', 60, 2500, 135000, 'demo:pa1') returning id into pa;
  for i in 1..12 loop
    insert into public.parcelas (parcelamento_id, numero, vencimento, pago, chave_importacao)
    values (pa, i::text, (m0 - interval '8 months' + (i || ' months')::interval + interval '19 days')::date, (m0 - interval '8 months' + (i || ' months')::interval + interval '19 days')::date < h - 35, 'demo:pp' || i);
  end loop;
  insert into public.parcelamentos (grupo_id, aba, empresa, cnpj, local, natureza, numero, total_parcelas, valor_ultima_parcela, valor_residual, chave_importacao)
    values (gs, 'SEFAZ', 'Serra Verde Alimentos S.A.', '99333444000155', 'SEFAZ/MG', 'ICMS', 'DEMO-MG-77', 24, 1450, 18000, 'demo:pa2');
  for i in 1..6 loop
    insert into public.acordos (grupo_id, responsavel, processo, devedor, credor, parcela, total_parcelas, valor, vencimento, pago, data_pagamento, comprovante_processo, comprovante_id, chave_importacao)
    values (gs, 'Adriana', '9000005-55.2025.8.13.0079', 'Serra Verde Comércio Ltda', 'Fornecedor Exemplo S.A.', i::text, '6', 3200,
            case i when 3 then h - 6 when 4 then h else (m0 + ((i - 3) || ' months')::interval + interval '14 days')::date end,
            i <= 2, case when i <= 2 then (m0 + ((i - 3) || ' months')::interval + interval '14 days')::date end,
            case when i = 1 then true when i = 2 then false end, case when i = 1 then '123456789' else '' end, 'demo:ac' || i);
  end loop;
  -- tarefas ligadas (cliente, contrato, processo)
  insert into public.tarefas (titulo, cliente_id, grupo_id, contrato_id, processos_vinculados, responsavel, prioridade, status, inicio, prazo, prazo_fatal, descricao, checklist, chave_importacao) values
    ('DEMO · Protocolar embargos à execução', cl, gh, k3, '9000001-11.2025.4.01.3800', 'Emanuelle', 'Alta', 'andamento', h - 5, h + 2, h + 4, 'Prazo de 30 dias da intimação.',
      '[{"texto":"Reunir documentos","feito":true},{"texto":"Minutar peça","feito":false},{"texto":"Revisão do Pedro","feito":false}]', 'demo:t1'),
    ('DEMO · Conferir parcela da transação PGFN', ct, gh, k1, '', 'Pedro', 'Média', 'pendente', h - 2, h, null, 'Confirmar o pagamento da parcela do mês no Regularize.', '[]', 'demo:t2'),
    ('DEMO · Cobrar mensalidade em atraso', ct, gh, k1, '', 'Adriana', 'Alta', 'pendente', h - 10, h - 3, null, 'Mandar lembrete ao financeiro (Marta).', '[]', 'demo:t3'),
    ('DEMO · Fechamento contábil do mês', sa, gs, null, '', 'Adriana', 'Média', 'pendente', h, (m0 + interval '1 month + 4 days')::date, null, '', '[{"texto":"Conciliação bancária","feito":false},{"texto":"Folha","feito":false}]', 'demo:t4'),
    ('DEMO · Levantar redução da dívida (êxito)', mp, gm, k4, '', 'Pedro', 'Média', 'pendente', h, h + 12, null, 'Quando a transação for homologada, registrar o êxito no contrato.', '[]', 'demo:t5');
  -- CRM
  select id into e1 from public.crm_etapas order by ordem limit 1;
  select id into e2 from public.crm_etapas where ordem = 4 limit 1;
  select id into e4 from public.crm_etapas where ordem = 5 limit 1;
  insert into public.crm_oportunidades (titulo, cliente_id, prospecto_empresa, prospecto_nome, prospecto_email, origem, etapa_id, valor_estimado, honorario_tipo, probabilidade, previsao_fechamento, responsavel, proxima_acao, proxima_acao_em) values
    ('DEMO · Holding familiar Moreira', mp, '', '', '', 'Cliente atual', e2, 25000, 'fixo', 60, h + 20, 'Pedro', 'Ligar para fechar a proposta', h + 2),
    ('DEMO · Recuperação de créditos de PIS/COFINS', null, 'DEMO · Mercado Bom Preço', 'João Exemplo', 'joao@bompreco.example.com', 'Indicação', e1, 40000, 'exito', 20, h + 45, 'Emanuelle', 'Agendar diagnóstico', h + 1),
    ('DEMO · Contabilidade completa', null, 'DEMO · Clínica Vida', 'Ana Exemplo', 'ana@clinicavida.example.com', 'Site', e4, 2200, 'mensal', 70, h + 10, 'Adriana', 'Enviar contrato', h);
  -- documentos (só o registro, sem arquivo: servem para ver os vencimentos)
  insert into public.documentos (cliente_id, grupo_id, contrato_id, tipo, nome, caminho, validade, obs) values
    (ct, gh, k1, 'contrato', 'DEMO · Contrato de consultoria (exemplo).pdf', 'demo/contrato-horizonte.pdf', null, 'Exemplo sem arquivo'),
    (sa, gs, null, 'certidao', 'DEMO · Alvará de funcionamento (exemplo).pdf', 'demo/alvara-serraverde.pdf', h + 7, 'Exemplo sem arquivo');
  -- rascunho de estagiário esperando aprovação (para ver a tela Aprovações)
  insert into public.rascunhos (tabela, operacao, filtros, dados, antes, resumo, funcao, autor_nome)
    values ('clientes', 'alterar', jsonb_build_object('id', ct), '{"telefone":"(31) 3333-0000","email":"novo@horizonte.example.com"}',
            (select to_jsonb(c) from public.clientes c where id = ct), 'Alterar cliente: Horizonte Transportes Ltda (demonstração)', 'clientes', 'Estagiário (demonstração)');
  -- tarefas automáticas antigas dos contratos de exemplo ficam concluídas (senão a demonstração nasce "atrasada")
  update public.tarefas set status = 'concluida', checklist = (select coalesce(jsonb_agg(it || '{"feito":true}'::jsonb), '[]'::jsonb) from jsonb_array_elements(checklist) it)
   where chave_regra is not null and prazo < h - 7 and status not in ('concluida','cancelada') and (cliente_id in (ct, cl, sa, sc, cm, mp) or contrato_id in (k1, k2, k3, k4));
  return (select count(*) from public.clientes where grupo_id in (gh, gs, gm));
end $$;
revoke all on function public.carregar_demonstracao() from public, anon;
grant execute on function public.carregar_demonstracao() to authenticated;

-- ─────────── e-mails ao cliente: modelo novo (marca, itens, total, como pagar) ───────────
-- dados que aparecem no quadro "Como pagar" (Administração → E-mail → Dados para pagamento)
insert into public.configuracoes (chave, valor) values ('dados_pagamento', '{"pix":"","banco":"","titular":"Araújo & Castro","whatsapp":"","assinatura":"Equipe Araújo & Castro"}')
on conflict (chave) do nothing;

-- e-mail certo para cada assunto: contato com a FINALIDADE pedida (financeiro, juridico…), depois quem recebe boletos/avisos, depois o do cadastro
create or replace function public.contato_do_cliente(p_cliente uuid, p_grupo uuid, p_finalidade text default 'financeiro')
returns table (email text, nome text)
language sql stable security definer set search_path = public as $$
  -- 1) finalidade certa + marcado para receber (boletos no financeiro; avisos nos demais)  2) marcado para receber
  -- 3) finalidade certa  4) contato "geral"  5) e-mail do cadastro  6/7) o mesmo no grupo, quando não há cliente
  select x.email, x.nome from (
    select c.email, nullif(split_part(btrim(c.nome), ' ', 1), '') nome,
           case when f.certa and marca then 1 when marca then 2 when f.certa then 3 else 4 end ord
      from public.contatos c
      cross join lateral (select case when p_finalidade in ('financeiro','cobranca') then c.recebe_boletos else c.recebe_notificacoes end marca,
                                 -- "cobrança" e "financeiro" valem como a mesma finalidade
                                 (c.finalidade = p_finalidade or (p_finalidade in ('financeiro','cobranca') and c.finalidade in ('financeiro','cobranca'))) certa) f
     where c.cliente_id = p_cliente and c.email <> '' and (f.certa or c.finalidade = 'geral' or f.marca)
    union all
    select cl.email, null, 5 from public.clientes cl where cl.id = p_cliente and cl.email <> ''
    union all
    select c.email, nullif(split_part(btrim(c.nome), ' ', 1), ''), 6 from public.contatos c join public.clientes cl on cl.id = c.cliente_id
     where p_cliente is null and cl.grupo_id = p_grupo and c.email <> '' and (c.finalidade = p_finalidade or c.recebe_boletos
           or (p_finalidade in ('financeiro','cobranca') and c.finalidade in ('financeiro','cobranca')))
    union all
    select cl.email, null, 7 from public.clientes cl where p_cliente is null and cl.grupo_id = p_grupo and cl.email <> '' and cl.tipo <> 'Inativo'
  ) x order by x.ord limit 1;
$$;
revoke all on function public.contato_do_cliente(uuid, uuid, text) from public, anon, authenticated;
create or replace function public.email_do_cliente(p_cliente uuid, p_grupo uuid) returns text
language sql stable security definer set search_path = public as $$
  select email from public.contato_do_cliente(p_cliente, p_grupo, 'financeiro');
$$;
revoke all on function public.email_do_cliente(uuid, uuid) from public, anon, authenticated;

-- modelo do e-mail ao cliente: cabeçalho da marca, saudação, texto, tabela de itens com total, "como pagar" e assinatura
create or replace function public.email_cliente_html(p_titulo text, p_nome text, p_texto text, p_itens jsonb default '[]', p_pagar boolean default false, p_fecho text default '')
returns text language plpgsql stable security definer set search_path = public as $$
declare d jsonb; itens text := ''; tot numeric := 0; i jsonb; pag text := '';
begin
  select valor into d from public.configuracoes where chave = 'dados_pagamento';
  d := coalesce(d, '{}');
  for i in select * from jsonb_array_elements(coalesce(p_itens, '[]')) loop
    itens := itens || '<tr><td style="padding:10px 12px;border-bottom:1px solid #EEF0F5">' || public.esc_html(i->>'descricao') || '</td>'
      || '<td style="padding:10px 12px;border-bottom:1px solid #EEF0F5;white-space:nowrap">' || coalesce(to_char((i->>'vencimento')::date, 'DD/MM/YYYY'), '') || '</td>'
      || '<td style="padding:10px 12px;border-bottom:1px solid #EEF0F5;text-align:right;white-space:nowrap;font-weight:bold">' || public.brl_texto((i->>'valor')::numeric) || '</td></tr>';
    tot := tot + coalesce((i->>'valor')::numeric, 0);
  end loop;
  if itens <> '' then
    itens := '<table role="presentation" style="width:100%;border-collapse:collapse;margin:14px 0;font-size:14px;border:1px solid #E5E7EB;border-radius:10px">'
      || '<tr style="background:#F7F8FB;color:#5B6472;font-size:11px;text-transform:uppercase;letter-spacing:.06em"><td style="padding:9px 12px">Descrição</td><td style="padding:9px 12px">Vencimento</td><td style="padding:9px 12px;text-align:right">Valor</td></tr>'
      || itens || case when jsonb_array_length(p_itens) > 1 then '<tr><td colspan="2" style="padding:10px 12px;font-weight:bold">Total</td><td style="padding:10px 12px;text-align:right;font-weight:bold;color:#1B2A4A">' || public.brl_texto(tot) || '</td></tr>' else '' end
      || '</table>';
  end if;
  if p_pagar and (coalesce(d->>'pix', '') <> '' or coalesce(d->>'banco', '') <> '') then
    pag := '<div style="background:#F5EDD6;border-left:4px solid #C9A84C;border-radius:10px;padding:12px 14px;margin:14px 0;font-size:13.5px"><b style="color:#1B2A4A">Como pagar</b><br>'
      || case when coalesce(d->>'pix', '') <> '' then 'PIX: <b>' || public.esc_html(d->>'pix') || '</b>' || coalesce(' · ' || nullif(public.esc_html(d->>'titular'), ''), '') || '<br>' else '' end
      || case when coalesce(d->>'banco', '') <> '' then public.esc_html(d->>'banco') || '<br>' else '' end
      || 'Depois de pagar, responda este e-mail com o comprovante.</div>';
  end if;
  return '<div style="font-family:Arial,Helvetica,sans-serif;background:#F0F2F7;padding:24px 12px">'
    || '<div style="max-width:620px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E5E7EB">'
    || '<div style="background:#1B2A4A;padding:20px 24px;border-bottom:3px solid #C9A84C">'
    ||   '<div style="color:#C9A84C;font-family:Georgia,serif;font-size:20px;font-weight:bold">Araújo &amp; Castro</div>'
    ||   '<div style="color:#CBD5E1;font-size:11px;letter-spacing:.14em;text-transform:uppercase;margin-top:2px">Advocacia · Contabilidade · Consultoria</div></div>'
    || '<div style="padding:22px 24px;color:#1F2937;font-size:14.5px;line-height:1.6">'
    ||   '<div style="font-size:18px;font-weight:bold;color:#1B2A4A;margin-bottom:10px">' || public.esc_html(p_titulo) || '</div>'
    ||   case when p_nome = '-' then '' else '<p style="margin:0 0 10px">Olá' || coalesce(', ' || public.esc_html(nullif(p_nome, '')), '') || '!</p>' end
    ||   p_texto || itens || pag
    ||   case when p_fecho = '-' then '' else
           coalesce(nullif(p_fecho, ''), '<p style="margin:14px 0 0">Qualquer dúvida, é só responder este e-mail' || case when coalesce(d->>'whatsapp', '') <> '' then ' ou chamar no WhatsApp ' || public.esc_html(d->>'whatsapp') else '' end || '.</p>')
           || '<p style="margin:16px 0 0">Atenciosamente,<br><b>' || public.esc_html(coalesce(nullif(d->>'assinatura', ''), 'Equipe Araújo & Castro')) || '</b></p>' end || '</div>'
    || '<div style="padding:12px 24px;background:#F7F8FB;border-top:1px solid #E5E7EB;color:#6B7280;font-size:11.5px">Mensagem automática do sistema do escritório. Se já resolveu, por favor desconsidere.</div>'
    || '</div></div>';
end $$;
revoke all on function public.email_cliente_html(text, text, text, jsonb, boolean, text) from public, anon, authenticated;

-- manda ao contato da finalidade certa, com o modelo novo, uma vez só por "ref"
-- (v22) o envio ganhou o parâmetro do anexo: a versão antiga sai antes de recriar
drop function if exists public.email_cliente_enviar(text, text, uuid, uuid, text, text, text, jsonb, boolean);
create or replace function public.email_cliente_enviar(p_regra text, p_ref text, p_cliente uuid, p_grupo uuid, p_finalidade text,
  p_assunto text, p_texto text, p_itens jsonb default '[]', p_pagar boolean default false, p_anexo jsonb default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if exists (select 1 from public.automacoes_log where ref = p_ref) then return false; end if;
  select * into c from public.contato_do_cliente(p_cliente, p_grupo, p_finalidade);
  if c.email is null or c.email = '' then return false; end if;
  insert into public.email_fila (usuario_id, para, assunto, html, tipo, referencia)
  values (null, c.email, p_assunto, public.email_cliente_html(p_assunto, c.nome, p_texto, p_itens, p_pagar), 'cliente', p_ref);
  insert into public.automacoes_log (chave, ref, descricao, cliente_id) values (p_regra, p_ref, p_assunto || ' → ' || c.email, p_cliente);
  return true;
end $$;
revoke all on function public.email_cliente_enviar(text, text, uuid, uuid, text, text, text, jsonb, boolean, jsonb) from public, anon, authenticated;
-- compatibilidade: chamadas antigas usam o modelo novo
create or replace function public.email_ao_cliente(p_regra text, p_ref text, p_cliente uuid, p_grupo uuid, p_assunto text, p_corpo text) returns boolean
language sql security definer set search_path = public as $$
  select public.email_cliente_enviar(p_regra, p_ref, p_cliente, p_grupo, 'financeiro', p_assunto, regexp_replace(p_corpo, '<p>Olá!</p>|<p>Araújo &amp; Castro Advocacia</p>', '', 'g'));
$$;
revoke all on function public.email_ao_cliente(text, text, uuid, uuid, text, text) from public, anon, authenticated;

-- nova automação: lembrete da parcela de parcelamento (guia) ao contato financeiro
insert into public.regras_tarefas (chave, nome, descricao, ligada, dias, grupo) values
  ('email_lembrete_parcelamento', 'E-mail ao cliente: lembrete da parcela do parcelamento', 'N dias antes do vencimento da guia (PGFN, Receita, SEFAZ…), para o contato financeiro', true, 3, 'cliente_email')
on conflict (chave) do nothing;
-- migração (uma vez só): e-mails ao cliente LIGADOS — só saem para quem tem e-mail cadastrado
do $$
begin
  if not exists (select 1 from public.configuracoes where chave = 'migracao_v19_emails') then
    update public.regras_tarefas set ligada = true where grupo = 'cliente_email';
    insert into public.configuracoes (chave, valor) values ('migracao_v19_emails', '{"feito":true}');
  end if;
end $$;

create or replace function public.rodar_emails_cliente() returns int
language plpgsql security definer set search_path = public as $$
declare rg record; x record; n int := 0;
begin
  -- honorários: um e-mail por cliente com TODOS os que vencem até N dias (faixa: a rotina só roda em dia útil,
  -- então o vencimento de sábado/domingo entra no lembrete de sexta). Cada lançamento só é lembrado uma vez.
  select * into rg from public.regras_tarefas where chave = 'email_lembrete_honorario' and ligada;
  if found then
    for x in select l.cliente_id, l.grupo_id, min(l.vencimento) venc, string_agg(l.id::text, ',' order by l.id) ids,
                    jsonb_agg(jsonb_build_object('descricao', l.descricao || coalesce(' (' || nullif(l.referencia, '') || ')', ''), 'vencimento', l.vencimento, 'valor', l.valor) order by l.vencimento) itens
               from public.lancamentos l where l.tipo = 'receita' and not l.redutor and not l.pago and not coalesce(l.perda, false)
                and l.vencimento > current_date and l.vencimento <= current_date + rg.dias
                and not exists (select 1 from public.automacoes_log g where g.ref = 'email_lhi:' || l.id)
              group by l.cliente_id, l.grupo_id loop
      if public.email_cliente_enviar('email_lh', 'email_lh:' || md5(x.ids), x.cliente_id, x.grupo_id, 'financeiro',
           'Lembrete de honorários — vencimento em ' || to_char(x.venc, 'DD/MM/YYYY'),
           '<p style="margin:0">Passando para lembrar dos honorários abaixo, com vencimento a partir de <b>' || to_char(x.venc, 'DD/MM/YYYY') || '</b>.</p>', x.itens, true) then n := n + 1; end if;
      -- marca cada lançamento como lembrado (mesmo quando o perfil do cliente pulou o envio)
      insert into public.automacoes_log (chave, ref, descricao, cliente_id)
        select '_item', 'email_lhi:' || v, 'lembrete (item)', x.cliente_id from unnest(string_to_array(x.ids, ',')) v;
    end loop;
  end if;
  -- "vence hoje": só para clientes com o perfil "Só no vencimento" (ou personalizado com esse tipo)
  for x in select l.cliente_id, l.grupo_id, string_agg(l.id::text, ',' order by l.id) ids,
                  jsonb_agg(jsonb_build_object('descricao', l.descricao || coalesce(' (' || nullif(l.referencia, '') || ')', ''), 'vencimento', l.vencimento, 'valor', l.valor)) itens
             from public.lancamentos l where l.tipo = 'receita' and not l.redutor and not l.pago and not coalesce(l.perda, false)
              and l.vencimento between current_date - 2 and current_date   -- segunda-feira alcança o fim de semana
              and not exists (select 1 from public.automacoes_log g where g.ref = 'email_vhi:' || l.id)
              and public.pode_email(l.cliente_id, l.grupo_id, 'vencimento') and public.perfil_email_de(l.cliente_id, l.grupo_id) <> 'padrao'
            group by l.cliente_id, l.grupo_id loop
    if public.email_cliente_enviar('email_vh', 'email_vh:' || md5(x.ids), x.cliente_id, x.grupo_id, 'financeiro',
         'Honorários com vencimento hoje',
         '<p style="margin:0">Os honorários abaixo vencem hoje.</p>', x.itens, true) then n := n + 1; end if;
    insert into public.automacoes_log (chave, ref, descricao, cliente_id)
      select '_item', 'email_vhi:' || v, 'vencimento (item)', x.cliente_id from unnest(string_to_array(x.ids, ',')) v;
  end loop;
  -- cobrança: todos os honorários em aberto do cliente, uma vez por lançamento que completou N dias de atraso
  select * into rg from public.regras_tarefas where chave = 'email_cobranca_honorario' and ligada;
  if found then
    for x in select l.id, l.cliente_id, l.grupo_id, l.vencimento,
                    (select jsonb_agg(jsonb_build_object('descricao', o.descricao || coalesce(' (' || nullif(o.referencia, '') || ')', ''), 'vencimento', o.vencimento, 'valor', o.valor) order by o.vencimento)
                       from public.lancamentos o where o.tipo = 'receita' and not o.redutor and not o.pago and not coalesce(o.perda, false) and o.vencimento < current_date
                        and ((l.cliente_id is not null and o.cliente_id = l.cliente_id) or (l.cliente_id is null and o.grupo_id = l.grupo_id))) itens
               from public.lancamentos l where l.tipo = 'receita' and not l.redutor and not l.pago and not coalesce(l.perda, false) and l.vencimento = current_date - rg.dias loop
      if public.email_cliente_enviar('email_ch', 'email_ch:' || x.id, x.cliente_id, x.grupo_id, 'financeiro',
           'Honorários em aberto',
           '<p style="margin:0">Não identificamos o pagamento dos honorários abaixo. Se já pagou, por favor responda com o comprovante para darmos baixa — obrigado!</p>', x.itens, true) then n := n + 1; end if;
    end loop;
  end if;
  -- acordo (dívida do cliente com terceiros): ao contato jurídico
  select * into rg from public.regras_tarefas where chave = 'email_lembrete_acordo' and ligada;
  if found then
    for x in select a.id, a.valor, a.vencimento, a.credor, a.parcela, a.total_parcelas, a.processo, a.grupo_id, a.pix, a.banco,
                    (select cl.id from public.clientes cl where cl.grupo_id = a.grupo_id and public.primeiro_nome(cl.nome) = public.primeiro_nome(a.devedor) limit 1) cli
               from public.acordos a where not a.pago and a.vencimento = current_date + rg.dias loop
      if public.email_cliente_enviar('email_la', 'email_la:' || x.id, x.cli, x.grupo_id, 'juridico',
           'Lembrete: parcela do acordo vence em ' || to_char(x.vencimento, 'DD/MM/YYYY'),
           '<p style="margin:0">A parcela do acordo com <b>' || public.esc_html(coalesce(x.credor, '')) || '</b> (processo ' || public.esc_html(coalesce(x.processo, '')) || ') vence em <b>' ||
           to_char(x.vencimento, 'DD/MM/YYYY') || '</b>. O pagamento é feito direto ao credor' ||
           case when coalesce(x.pix, '') <> '' then ' — PIX do credor: <b>' || public.esc_html(x.pix) || '</b>' else '' end ||
           case when coalesce(x.banco, '') <> '' then ' — ' || public.esc_html(x.banco) else '' end ||
           '.</p><p style="margin:10px 0 0">Depois de pagar, <b>responda este e-mail com o comprovante</b>: nós juntamos ao processo.</p>',
           jsonb_build_array(jsonb_build_object('descricao', 'Parcela ' || coalesce(x.parcela, '') || coalesce('/' || nullif(x.total_parcelas, ''), ''), 'vencimento', x.vencimento, 'valor', x.valor))) then n := n + 1; end if;
    end loop;
  end if;
  -- parcelamento (PGFN, Receita, SEFAZ…): guia do mês
  select * into rg from public.regras_tarefas where chave = 'email_lembrete_parcelamento' and ligada;
  if found then
    for x in select pa.id, pa.numero, pa.vencimento, p.empresa, p.natureza, p.local, p.numero parc_num, p.valor_ultima_parcela, p.grupo_id, p.total_parcelas,
                    (select cl.id from public.clientes cl where (soDig.d <> '' and regexp_replace(cl.cpf_cnpj, '\D', '', 'g') = soDig.d) or cl.nome = p.empresa limit 1) cli
               from public.parcelas pa join public.parcelamentos p on p.id = pa.parcelamento_id
               cross join lateral (select regexp_replace(coalesce(p.cnpj, ''), '\D', '', 'g') d) soDig
              where not pa.pago and pa.vencimento between current_date and current_date + rg.dias loop
      if public.email_cliente_enviar('email_lp', 'email_lp:' || x.id, x.cli, x.grupo_id, 'financeiro',
           'Lembrete: parcela do parcelamento vence em ' || to_char(x.vencimento, 'DD/MM/YYYY'),
           '<p style="margin:0">A parcela <b>' || coalesce(x.numero, '') || coalesce('/' || x.total_parcelas, '') || '</b> do parcelamento <b>' || public.esc_html(coalesce(x.natureza, '')) ||
           coalesce(' · ' || nullif(public.esc_html(x.local), ''), '') || '</b>' || coalesce(' (nº ' || nullif(public.esc_html(x.parc_num), '') || ')', '') || ' de <b>' || public.esc_html(coalesce(x.empresa, '')) ||
           '</b> vence em <b>' || to_char(x.vencimento, 'DD/MM/YYYY') || '</b>. Se ainda não recebeu a guia, responda este e-mail que enviamos.</p>' ||
           '<p style="margin:10px 0 0">Atenção: três parcelas em atraso podem cancelar o parcelamento.</p>',
           case when coalesce(x.valor_ultima_parcela, 0) > 0 then jsonb_build_array(jsonb_build_object('descricao', 'Parcela ' || coalesce(x.numero, ''), 'vencimento', x.vencimento, 'valor', x.valor_ultima_parcela)) else '[]'::jsonb end) then n := n + 1; end if;
    end loop;
  end if;
  return n;
end $$;
revoke all on function public.rodar_emails_cliente() from public, anon, authenticated;

create or replace function public.pagamento_automacoes() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not new.pago or old.pago or new.tipo <> 'receita' or new.redutor then return null; end if;
  if exists (select 1 from public.regras_tarefas where chave = 'pagamento_conclui' and ligada) then
    update public.tarefas set status = 'concluida', checklist = (select coalesce(jsonb_agg(i || '{"feito":true}'::jsonb), '[]'::jsonb) from jsonb_array_elements(checklist) i) where chave_regra = 'cob:' || new.id and status not in ('concluida','cancelada');
    get diagnostics n = row_count;
    if n > 0 then insert into public.automacoes_log (chave, ref, descricao, cliente_id) values ('pagamento_conclui', 'pago:' || new.id, 'Honorário recebido: cobrança concluída sozinha — ' || new.descricao, new.cliente_id); end if;
  end if;
  if exists (select 1 from public.regras_tarefas where chave = 'email_pagamento_recebido' and ligada) then
    perform public.email_cliente_enviar('email_pr', 'email_pr:' || new.id, new.cliente_id, new.grupo_id, 'financeiro', 'Recebemos o seu pagamento — obrigado!',
      '<p style="margin:0">Confirmamos o recebimento abaixo' || coalesce(', em <b>' || to_char(new.data_pagamento, 'DD/MM/YYYY') || '</b>', '') || '. Se precisar do recibo, é só responder este e-mail.</p>',
      jsonb_build_array(jsonb_build_object('descricao', new.descricao || coalesce(' (' || nullif(new.referencia, '') || ')', ''), 'vencimento', new.vencimento, 'valor', new.valor)));
  end if;
  return null;
end $$;

-- envio manual (Cobranças, avisos e recibos): o texto montado na tela sai pelo e-mail do escritório, no modelo da marca
create or replace function public.enviar_email_manual(p_para text, p_assunto text, p_texto text) returns void
language plpgsql security definer set search_path = public as $$
declare corpo text;
begin
  if not (public.pode('clientes', 'editar') or public.pode('financeiro_juridico', 'editar') or public.pode('financeiro_contab', 'editar') or public.pode('juridico', 'editar')) then
    raise exception 'permission denied: sem acesso para enviar e-mail a clientes.';
  end if;
  if coalesce(p_para, '') !~ '^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$' then raise exception 'Informe um e-mail válido (um só).'; end if;
  if btrim(coalesce(p_texto, '')) = '' then raise exception 'A mensagem está vazia.'; end if;
  corpo := '<p style="margin:0 0 10px">' || replace(replace(public.esc_html(btrim(p_texto)), E'\n\n', '</p><p style="margin:0 0 10px">'), E'\n', '<br>') || '</p>';
  insert into public.email_fila (usuario_id, para, assunto, html, tipo, referencia)
  values (null, p_para, left(coalesce(nullif(btrim(p_assunto), ''), 'Mensagem do escritório'), 200), public.email_cliente_html(coalesce(nullif(btrim(p_assunto), ''), 'Mensagem do escritório'), '-', corpo, '[]', false, '-'), 'cliente', '');
  insert into public.automacoes_log (chave, ref, descricao) values ('email_manual', 'manual:' || gen_random_uuid(), 'E-mail enviado pela tela: ' || left(p_assunto, 120) || ' → ' || p_para);
end $$;
revoke all on function public.enviar_email_manual(text, text, text) from public, anon;
grant execute on function public.enviar_email_manual(text, text, text) to authenticated;

-- prévia dos modelos (Administração → E-mail): exemplo fictício de cada e-mail ao cliente
create or replace function public.previa_email_cliente(p_tipo text) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'permission denied'; end if;
  return case p_tipo
    when 'lembrete' then public.email_cliente_html('Lembrete de honorários — vencimento em 10/10/2026', 'Marta', '<p style="margin:0">Passando para lembrar dos honorários abaixo, com vencimento em <b>10/10/2026</b>.</p>',
      '[{"descricao":"Consultoria tributária mensal (09/2026)","vencimento":"2026-10-10","valor":4500}]', true)
    when 'cobranca' then public.email_cliente_html('Honorários em aberto', 'Marta', '<p style="margin:0">Não identificamos o pagamento dos honorários abaixo. Se já pagou, por favor responda com o comprovante para darmos baixa — obrigado!</p>',
      '[{"descricao":"Consultoria tributária mensal (08/2026)","vencimento":"2026-09-10","valor":4500},{"descricao":"Defesa em execução fiscal — parcela 2/4","vencimento":"2026-09-20","valor":3000}]', true)
    when 'acordo' then public.email_cliente_html('Lembrete: parcela do acordo vence em 12/10/2026', 'Ricardo', '<p style="margin:0">A parcela do acordo com <b>Fornecedor Exemplo S.A.</b> (processo 0000000-00.2025.8.13.0000) vence em <b>12/10/2026</b>. O pagamento é feito direto ao credor.</p><p style="margin:10px 0 0">Depois de pagar, <b>responda este e-mail com o comprovante</b>: nós juntamos ao processo.</p>',
      '[{"descricao":"Parcela 4/6","vencimento":"2026-10-12","valor":3200}]')
    when 'parcelamento' then public.email_cliente_html('Lembrete: parcela do parcelamento vence em 20/10/2026', 'Marta', '<p style="margin:0">A parcela <b>9/60</b> do parcelamento <b>Transação tributária · PGFN</b> vence em <b>20/10/2026</b>. Se ainda não recebeu a guia, responda este e-mail que enviamos.</p><p style="margin:10px 0 0">Atenção: três parcelas em atraso podem cancelar o parcelamento.</p>',
      '[{"descricao":"Parcela 9","vencimento":"2026-10-20","valor":2500}]')
    else public.email_cliente_html('Recebemos o seu pagamento — obrigado!', 'Marta', '<p style="margin:0">Confirmamos o recebimento abaixo, em <b>28/09/2026</b>. Se precisar do recibo, é só responder este e-mail.</p>',
      '[{"descricao":"Consultoria tributária mensal (08/2026)","vencimento":"2026-09-10","valor":4500}]')
  end;
end $$;
revoke all on function public.previa_email_cliente(text) from public, anon;
grant execute on function public.previa_email_cliente(text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- v20 (Backup 14) — perfil de e-mail por cliente, usuários previstos, histórico mensal,
-- extrato OFX, PGFN (API SERPRO), processos com data da mudança de situação
-- ═══════════════════════════════════════════════════════════════════

-- ─────────── e-mails ao cliente: perfil por cliente ───────────
-- padrao: lembrete antes + cobrança depois do atraso + recibo · nunca: nada financeiro (clientes importantes)
-- vencimento: só "vence hoje" + recibo · personalizado: caixinhas por tipo (emails_tipos)
-- parcelamento e acordo (guias e parcelas do próprio cliente) não são cobrança do escritório: seguem ligados, salvo no personalizado
alter table public.clientes add column if not exists perfil_email text not null default 'padrao';
alter table public.clientes add column if not exists emails_tipos jsonb not null default '{}';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clientes_perfil_email_ck') then
    alter table public.clientes add constraint clientes_perfil_email_ck check (perfil_email in ('padrao','nunca','vencimento','personalizado'));
  end if;
end $$;

create or replace function public.perfil_email_de(p_cliente uuid, p_grupo uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select perfil_email from public.clientes where id = p_cliente),
                  -- sem cliente (lançamento só do grupo): vale o perfil mais restritivo do grupo
                  (select perfil_email from public.clientes where grupo_id = p_grupo and perfil_email <> 'padrao'
                    order by case perfil_email when 'nunca' then 1 when 'vencimento' then 2 else 3 end limit 1), 'padrao');
$$;
revoke all on function public.perfil_email_de(uuid, uuid) from public, anon, authenticated;

create or replace function public.pode_email(p_cliente uuid, p_grupo uuid, p_tipo text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare pf text := public.perfil_email_de(p_cliente, p_grupo); t jsonb;
begin
  if pf = 'nunca' then return p_tipo not in ('lembrete','vencimento','cobranca','recibo'); end if;
  if pf = 'vencimento' then return p_tipo not in ('lembrete','cobranca'); end if;
  if pf = 'personalizado' then
    select emails_tipos into t from public.clientes where id = p_cliente;
    if t is null then
      select emails_tipos into t from public.clientes where grupo_id = p_grupo and perfil_email = 'personalizado' limit 1;
    end if;
    return coalesce((t->>p_tipo)::boolean, p_tipo <> 'vencimento');
  end if;
  return p_tipo <> 'vencimento';
end $$;
revoke all on function public.pode_email(uuid, uuid, text) from public, anon, authenticated;

-- envio (redefinido): respeita o perfil do cliente e nunca manda para example.com (demonstração)
create or replace function public.email_cliente_enviar(p_regra text, p_ref text, p_cliente uuid, p_grupo uuid, p_finalidade text,
  p_assunto text, p_texto text, p_itens jsonb default '[]', p_pagar boolean default false, p_anexo jsonb default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare c record; tipo text;
begin
  if exists (select 1 from public.automacoes_log where ref = p_ref) then return false; end if;
  tipo := case p_regra when 'email_lh' then 'lembrete' when 'email_vh' then 'vencimento' when 'email_ch' then 'cobranca'
                       when 'email_pr' then 'recibo' when 'email_lp' then 'parcelamento' when 'email_la' then 'acordo' end;
  if tipo is not null and not public.pode_email(p_cliente, p_grupo, tipo) then
    insert into public.automacoes_log (chave, ref, descricao, cliente_id)
    values (p_regra, p_ref, 'Não enviado (perfil de e-mail do cliente): ' || p_assunto, p_cliente);
    return false;
  end if;
  select * into c from public.contato_do_cliente(p_cliente, p_grupo, p_finalidade);
  if c.email is null or c.email = '' then return false; end if;
  if c.email ~* '(@|\.)example\.com$' then
    insert into public.automacoes_log (chave, ref, descricao, cliente_id) values (p_regra, p_ref, 'Demonstração (não enviado): ' || p_assunto, p_cliente);
    return false;
  end if;
  insert into public.email_fila (usuario_id, para, assunto, html, tipo, referencia)
  values (null, c.email, p_assunto, public.email_cliente_html(p_assunto, c.nome, p_texto, p_itens, p_pagar), 'cliente', p_ref);
  insert into public.automacoes_log (chave, ref, descricao, cliente_id) values (p_regra, p_ref, p_assunto || ' → ' || c.email, p_cliente);
  return true;
end $$;
revoke all on function public.email_cliente_enviar(text, text, uuid, uuid, text, text, text, jsonb, boolean, jsonb) from public, anon, authenticated;

-- tela "E-mails aos clientes": perfil em lote (quem edita Clientes)
create or replace function public.salvar_perfil_email(p_ids uuid[], p_perfil text, p_tipos jsonb default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.pode('clientes', 'editar') then raise exception 'permission denied: só quem edita Clientes muda o perfil de e-mail.'; end if;
  if p_perfil not in ('padrao','nunca','vencimento','personalizado') then raise exception 'Perfil inválido.'; end if;
  update public.clientes set perfil_email = p_perfil, emails_tipos = coalesce(p_tipos, emails_tipos)
   where id = any(p_ids) and public.ve_cliente(id);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.salvar_perfil_email(uuid[], text, jsonb) from public, anon;
grant execute on function public.salvar_perfil_email(uuid[], text, jsonb) to authenticated;

-- último e-mail enviado a cada cliente (para a tabela da tela)
create or replace function public.ultimos_emails_clientes() returns table (cliente_id uuid, quando timestamptz, descricao text)
language sql stable security definer set search_path = public as $$
  select distinct on (l.cliente_id) l.cliente_id, l.quando, l.descricao
    from public.automacoes_log l
   where l.cliente_id is not null and l.chave like 'email%' and public.eh_equipe() and public.ve_cliente(l.cliente_id)
   order by l.cliente_id, l.quando desc;
$$;
revoke all on function public.ultimos_emails_clientes() from public, anon;
grant execute on function public.ultimos_emails_clientes() to authenticated;

-- ─────────── usuários previstos: quem o escritório já decidiu cadastrar ───────────
-- Ao criar a conta com esse e-mail (Administração → Usuários), a pessoa já nasce com o acesso certo.
create table if not exists public.usuarios_previstos (
  email   text primary key,
  nome    text not null default '',
  papel   text not null default 'equipe' check (papel in ('admin','equipe')),
  funcoes jsonb not null default '{}',
  areas   text not null default 'ambos',
  modelo  text not null default '',
  criado_em timestamptz not null default now()
);
alter table public.usuarios_previstos enable row level security;
revoke all on public.usuarios_previstos from anon;
grant select, delete on public.usuarios_previstos to authenticated;
drop policy if exists usuarios_previstos_admin on public.usuarios_previstos;
create policy usuarios_previstos_admin on public.usuarios_previstos for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
insert into public.usuarios_previstos (email, nome, papel, funcoes, areas, modelo) values
  ('emanuellearaujoadvocacia@gmail.com', 'Emanuelle', 'admin', '{}', 'ambos', 'Administrador'),
  ('adriana_f_araujo@hotmail.com', 'Adriana', 'admin', '{}', 'ambos', 'Administrador'),
  ('joaovitordeoliveiramarques2007@gmail.com', 'João Vitor', 'equipe',
   '{"juridico":"propor","clientes":"propor","financeiro_contab":"propor","tarefas":"ver","documentos":"ver","contratos":"ver"}', 'ambos', 'Estagiário (rascunho)'),
  ('ederpsique@gmail.com', 'Éder', 'equipe',
   '{"financeiro_contab":"editar","clientes":"editar","contratos":"editar","documentos":"editar","tarefas":"editar","relatorios":"ver"}', 'contabil', 'Administrador da Contabilidade')
on conflict (email) do nothing;
-- quem já tem conta: se ainda está inativo, recebe o acesso previsto; e não fica como "previsto"
-- (rodar o SQL de novo não recria o convite)
update public.perfis p set papel = v.papel, funcoes = v.funcoes, areas = v.areas, nome = coalesce(nullif(p.nome, ''), v.nome)
  from public.usuarios_previstos v where lower(p.email) = lower(v.email) and p.papel = 'inativo';
delete from public.usuarios_previstos v where exists (select 1 from public.perfis p where lower(p.email) = lower(v.email));

create or replace function public.criar_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
declare pv record;
begin
  select * into pv from public.usuarios_previstos where lower(email) = lower(coalesce(new.email, ''));
  insert into public.perfis (id, email, nome, papel)
  values (new.id, coalesce(new.email,''),
          coalesce(nullif(new.raw_user_meta_data->>'nome', ''), pv.nome, split_part(coalesce(new.email,''),'@',1)),
          case when not exists (select 1 from public.perfis) then 'admin' when pv.email is not null then pv.papel else 'inativo' end)
  on conflict (id) do nothing;
  if pv.email is not null then
    update public.perfis set funcoes = pv.funcoes, areas = pv.areas where id = new.id;
    delete from public.usuarios_previstos where email = pv.email;
  end if;
  return new;
end $$;

-- ─────────── processos: data em que mudou de situação (para "extintos no período") ───────────
alter table public.processos add column if not exists status_em date;
create or replace function public.processo_status_em() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then new.status_em := current_date; end if;
  return new;
end $$;
drop trigger if exists processo_status_em on public.processos;
create trigger processo_status_em before insert or update of status on public.processos for each row execute function public.processo_status_em();

-- ─────────── histórico: uma "foto" por grupo e por mês ───────────
-- passivo (RFB, PGFN, SEFAZ, AGE), CAPAG de cada empresa, processos ativos/encerrados, parcelamentos e acordos.
-- Tirada no dia 1 pela rotina e ao rodar este SQL (mês corrente). O comparativo aparece a partir da 2ª foto.
create table if not exists public.fotos_mensais (
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  mes      date not null,                      -- 1º dia do mês
  dados    jsonb not null default '{}',
  tirada_em timestamptz not null default now(),
  primary key (grupo_id, mes)
);
alter table public.fotos_mensais enable row level security;
revoke all on public.fotos_mensais from anon;
grant select on public.fotos_mensais to authenticated;
drop policy if exists fotos_mensais_ver on public.fotos_mensais;
create policy fotos_mensais_ver on public.fotos_mensais for select to authenticated using (public.pode('relatorios') or public.pode('juridico') or public.pode('clientes'));

create or replace function public.processo_encerrado(st text) returns boolean
language sql immutable as $$ select coalesce(st, '') ~* '(arquiv|extint|baixad|encerrad|transitad)'; $$;

-- a "foto" de um grupo (a mesma usada no comparativo "agora × mês X"). security invoker: cada pessoa vê o que pode ver
create or replace function public.passivo_do_cliente(c public.clientes) returns numeric
language sql immutable as $$
  select coalesce(c.rfb,0) + coalesce(c.rfb_negociada,0) + coalesce(c.pgfn,0) + coalesce(c.pgfn_negociada,0) + coalesce(c.sefaz_mg,0) + coalesce(c.age_mg,0) + coalesce(c.age_mg_negociada,0);
$$;
create or replace function public.foto_do_grupo(p_grupo uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
      'passivo', jsonb_build_object(
         -- dívida inteira do órgão (em aberto + negociada)
         'rfb', coalesce(sum(coalesce(c.rfb,0) + coalesce(c.rfb_negociada,0)), 0), 'pgfn', coalesce(sum(coalesce(c.pgfn,0) + coalesce(c.pgfn_negociada,0)), 0),
         'sefaz_mg', coalesce(sum(c.sefaz_mg), 0), 'age_mg', coalesce(sum(coalesce(c.age_mg,0) + coalesce(c.age_mg_negociada,0)), 0),
         'total', coalesce(sum(public.passivo_do_cliente(c)), 0)),
      'empresas', coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'capag', c.capag,
         'total', public.passivo_do_cliente(c)) order by c.nome) filter (where c.id is not null), '[]'),
      'processos_ativos', (select coalesce(jsonb_agg(p.numero order by p.numero), '[]') from public.processos p where p.grupo_id = p_grupo and not public.processo_encerrado(p.status)),
      'processos_encerrados', (select coalesce(jsonb_agg(p.numero order by p.numero), '[]') from public.processos p where p.grupo_id = p_grupo and public.processo_encerrado(p.status)),
      'parcelamentos', (select count(*) from public.parcelamentos p where p.grupo_id = p_grupo),
      'acordos_abertos', (select count(*) from public.acordos a where a.grupo_id = p_grupo and not a.pago),
      'acordos_saldo', (select coalesce(sum(a.valor), 0) from public.acordos a where a.grupo_id = p_grupo and not a.pago))
    from public.grupos g left join public.clientes c on c.grupo_id = g.id and c.tipo <> 'Inativo'
   where g.id = p_grupo;
$$;
revoke all on function public.foto_do_grupo(uuid) from public, anon;
grant execute on function public.foto_do_grupo(uuid) to authenticated;

create or replace function public.tirar_fotos_mensais(p_mes date default null) returns int
language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', coalesce(p_mes, current_date))::date; n int;
begin
  if auth.uid() is not null and not public.eh_admin() then raise exception 'permission denied: só o administrador.'; end if;
  insert into public.fotos_mensais (grupo_id, mes, dados, tirada_em)
  select g.id, m, public.foto_do_grupo(g.id), now() from public.grupos g
  on conflict (grupo_id, mes) do update set dados = excluded.dados, tirada_em = now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.tirar_fotos_mensais(date) from public, anon;
grant execute on function public.tirar_fotos_mensais(date) to authenticated;
-- a primeira foto (mês corrente) sai agora; depois, dia 1 às 7h (Brasília)
do $$
begin
  if not exists (select 1 from public.fotos_mensais where mes = date_trunc('month', current_date)::date) then
    perform public.tirar_fotos_mensais();
  end if;
end $$;
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'erp_fotos_mensais';
  perform cron.schedule('erp_fotos_mensais', '0 10 1 * *', $cron$ select public.tirar_fotos_mensais() $cron$);
exception when others then
  raise notice 'Agendador indisponível: a foto mensal pode ser tirada pelo botão na ficha do cliente.';
end $$;

-- ─────────── extrato bancário (OFX do Sicoob): créditos já tratados ───────────
create table if not exists public.extrato_itens (
  fitid        text primary key,                -- identificador do banco (não importa duas vezes)
  empresa      text not null default 'escritorio' check (empresa in ('escritorio','contabilidade')),
  data         date not null,
  valor        numeric(14,2) not null,
  nome         text not null default '',
  memo         text not null default '',
  situacao     text not null default 'baixado' check (situacao in ('baixado','ignorado')),
  lancamento_id uuid references public.lancamentos(id) on delete set null,
  tratado_por  uuid default auth.uid(),
  tratado_em   timestamptz not null default now()
);
alter table public.extrato_itens enable row level security;
revoke all on public.extrato_itens from anon;
grant select, insert, update on public.extrato_itens to authenticated;
drop policy if exists extrato_ver on public.extrato_itens;
create policy extrato_ver on public.extrato_itens for select to authenticated
  using (public.pode(case when empresa = 'contabilidade' then 'financeiro_contab' else 'financeiro_juridico' end));
drop policy if exists extrato_gravar on public.extrato_itens;
create policy extrato_gravar on public.extrato_itens for insert to authenticated
  with check (public.pode(case when empresa = 'contabilidade' then 'financeiro_contab' else 'financeiro_juridico' end, 'editar'));
drop policy if exists extrato_mudar on public.extrato_itens;
create policy extrato_mudar on public.extrato_itens for update to authenticated
  using (public.pode(case when empresa = 'contabilidade' then 'financeiro_contab' else 'financeiro_juridico' end, 'editar'));

-- ─────────── PGFN: inscrições em dívida ativa (API "Consulta Dívida Ativa" do SERPRO) ───────────
-- Função "erp-pgfn" consulta cada CNPJ e grava aqui; o ERP mostra o total (campo PGFN / PGFN negociada)
-- e a ficha do cliente abre por origem e por CDA. Só roda depois que o escritório contratar e salvar a chave.
create table if not exists public.pgfn_inscricoes (
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  inscricao   text not null,
  natureza    text not null default '',          -- Tributária, Previdenciária, FGTS, Simples Nacional, Multa…
  receita     text not null default '',
  situacao    text not null default '',
  parcelada   boolean not null default false,
  valor       numeric(16,2) not null default 0,
  data_inscricao date,
  atualizado_em timestamptz not null default now(),
  primary key (cliente_id, inscricao)
);
alter table public.pgfn_inscricoes enable row level security;
revoke all on public.pgfn_inscricoes from anon;
grant select on public.pgfn_inscricoes to authenticated;
drop policy if exists pgfn_ver on public.pgfn_inscricoes;
create policy pgfn_ver on public.pgfn_inscricoes for select to authenticated using (public.pode('clientes') and public.ve_cliente(cliente_id));
create table if not exists public.pgfn_execucoes (
  id uuid primary key default gen_random_uuid(),
  inicio timestamptz not null default now(), fim timestamptz,
  status text not null default 'rodando' check (status in ('rodando','ok','parcial','erro','pulado')),
  origem text not null default 'rotina',
  total int not null default 0, consultados int not null default 0, alterados int not null default 0, erros int not null default 0,
  relatorio jsonb not null default '[]', mensagem text not null default ''
);
alter table public.pgfn_execucoes enable row level security;
revoke all on public.pgfn_execucoes from anon;
grant select on public.pgfn_execucoes to authenticated;
drop policy if exists pgfn_exec_ver on public.pgfn_execucoes;
create policy pgfn_exec_ver on public.pgfn_execucoes for select to authenticated using (public.eh_equipe());
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on public.pgfn_inscricoes, public.pgfn_execucoes to service_role';
  end if;
end $$;
-- chave do SERPRO (consumer key/secret): só no banco privado; frequência: diaria | semanal | mensal
insert into public.config_privada (chave, valor) values ('api_pgfn', '{"ligada":false,"frequencia":"diaria","consumer_key":"","consumer_secret":""}') on conflict (chave) do nothing;
create or replace function public.salvar_config_pgfn(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare atual jsonb;
begin
  if not public.eh_admin() then raise exception 'Só o administrador.'; end if;
  select valor into atual from public.config_privada where chave = 'api_pgfn';
  atual := coalesce(atual, '{}');
  if coalesce(p->>'consumer_key', '') = '' then p := p || jsonb_build_object('consumer_key', coalesce(atual->>'consumer_key', '')); end if;
  if coalesce(p->>'consumer_secret', '') = '' then p := p || jsonb_build_object('consumer_secret', coalesce(atual->>'consumer_secret', '')); end if;
  if coalesce(p->>'frequencia', '') not in ('diaria','semanal','mensal') then p := p || '{"frequencia":"diaria"}'; end if;
  insert into public.config_privada (chave, valor) values ('api_pgfn', atual || p) on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
end $$;
create or replace function public.status_config_pgfn() returns jsonb
language sql security definer set search_path = public as $$
  select case when public.eh_equipe() then coalesce((select (valor - 'consumer_key' - 'consumer_secret')
     || jsonb_build_object('tem_chave', coalesce(valor->>'consumer_key', '') <> '' and coalesce(valor->>'consumer_secret', '') <> '')
     from public.config_privada where chave = 'api_pgfn'), '{}') end;
$$;
revoke all on function public.salvar_config_pgfn(jsonb) from public, anon;
revoke all on function public.status_config_pgfn() from public, anon;
grant execute on function public.salvar_config_pgfn(jsonb), public.status_config_pgfn() to authenticated;
-- todo dia às 6h15 (Brasília); a própria função pula quando a frequência escolhida não é hoje
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'erp_pgfn';
  perform cron.schedule('erp_pgfn', '15 9 * * *', $cron$
    select net.http_post(
      url := (select valor #>> '{}' from public.config_privada where chave = 'url_projeto') || '/functions/v1/erp-pgfn',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-erp-segredo', (select valor #>> '{}' from public.config_privada where chave = 'segredo_funcoes')),
      body := '{"acao":"rodar"}'::jsonb)
  $cron$);
exception when others then
  raise notice 'Agendador indisponível: use o botão "Consultar agora" em Alertas → PGFN.';
end $$;

-- ═══════════════════════════════════════════════════════════════════
-- v21 (Backup 15) — preferências de tela por usuário, mural do Início,
-- área do serviço nos honorários e contratos
-- ═══════════════════════════════════════════════════════════════════

-- preferências de tela (ex.: fila do Início em lista ou calendário) — valem em qualquer computador
alter table public.perfis add column if not exists preferencias jsonb not null default '{}';
create or replace function public.salvar_preferencia(p_chave text, p_valor jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'permission denied'; end if;
  if coalesce(p_chave, '') !~ '^[a-z_]{1,40}$' then raise exception 'Preferência inválida.'; end if;
  update public.perfis set preferencias = coalesce(preferencias, '{}') || jsonb_build_object(p_chave, p_valor) where id = auth.uid();
end $$;
revoke all on function public.salvar_preferencia(text, jsonb) from public, anon;
grant execute on function public.salvar_preferencia(text, jsonb) to authenticated;

-- mural do Início: recados do escritório (qualquer pessoa da equipe publica; apaga quem publicou ou o admin)
create table if not exists public.mural (
  id         uuid primary key default gen_random_uuid(),
  texto      text not null check (btrim(texto) <> '' and length(texto) <= 1000),
  fixo       boolean not null default false,
  expira_em  date,
  autor      uuid default auth.uid() references public.perfis(id) on delete set null,
  autor_nome text not null default '',
  criado_em  timestamptz not null default now()
);
create index if not exists mural_criado on public.mural (criado_em desc);
alter table public.mural enable row level security;
revoke all on public.mural from anon;
grant select, insert, delete on public.mural to authenticated;
drop policy if exists mural_ver on public.mural;
create policy mural_ver on public.mural for select to authenticated using (public.eh_equipe());
drop policy if exists mural_publicar on public.mural;
create policy mural_publicar on public.mural for insert to authenticated with check (public.eh_equipe() and autor = auth.uid());
drop policy if exists mural_apagar on public.mural;
create policy mural_apagar on public.mural for delete to authenticated using (autor = auth.uid() or public.eh_admin());
create or replace function public.mural_autor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.autor := auth.uid();
  new.autor_nome := coalesce((select nullif(split_part(btrim(nome), ' ', 1), '') from public.perfis where id = auth.uid()), '');
  if new.fixo and not public.eh_admin() then new.fixo := false; end if;   -- só o administrador fixa recado
  return new;
end $$;
drop trigger if exists mural_autor on public.mural;
create trigger mural_autor before insert on public.mural for each row execute function public.mural_autor();

-- área do serviço (gráfico "Recebido por tipo de serviço"): tributário, imobiliário, empresarial, sucessões, família,
-- criminal, trabalhista, contratual, cobrança, consultoria. A regra de consultoria mensal (recorrência) não muda.
alter table public.lancamentos add column if not exists servico text not null default '';
alter table public.contratos add column if not exists servico text not null default '';
create or replace function public.lancamento_servico() returns trigger
language plpgsql as $$
begin
  if coalesce(new.servico, '') = '' and new.contrato_id is not null then
    select servico into new.servico from public.contratos where id = new.contrato_id;
    new.servico := coalesce(new.servico, '');
  end if;
  return new;
end $$;
drop trigger if exists lancamento_servico on public.lancamentos;
create trigger lancamento_servico before insert on public.lancamentos for each row execute function public.lancamento_servico();
-- contrato ganhou/trocou a área: os honorários dele sem área passam a ter a mesma
create or replace function public.contrato_servico_propaga() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.servico, '') <> '' and new.servico is distinct from old.servico then
    update public.lancamentos set servico = new.servico where contrato_id = new.id and (servico = '' or servico = coalesce(old.servico, ''));
  end if;
  return null;
end $$;
drop trigger if exists contrato_servico_propaga on public.contratos;
create trigger contrato_servico_propaga after update of servico on public.contratos for each row execute function public.contrato_servico_propaga();

-- ═══════════════════════════════════════════════════════════════════════
-- v22 (Backup 16) — Lembretes (não são tarefas), guias de parcelamento como lembrete
-- ═══════════════════════════════════════════════════════════════════════
update public.regras_tarefas set nome = 'Parcela de parcelamento do cliente → lembrete "Emitir guias"',
  descricao = 'N dias antes do vencimento aparece no card Lembretes do Início (não vira tarefa)' where chave = 'parcela_parcelamento';
-- tarefas antigas "Emitir guia…" saem da fila (vão para Excluídas; dá para restaurar)
update public.tarefas set status = 'cancelada' where chave_regra like 'parc:%' and status not in ('concluida', 'cancelada');

create table if not exists public.lembretes (
  id uuid primary key default gen_random_uuid(),
  texto text not null check (btrim(texto) <> '' and length(texto) <= 300),
  dia date not null default current_date,
  repete text not null default '' check (repete in ('', 'semanal', 'mensal', 'anual')),
  pessoa text not null default '',              -- vazio = todo o escritório
  feito_em date,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
alter table public.lembretes enable row level security;
revoke all on public.lembretes from anon;
grant select, insert, update, delete on public.lembretes to authenticated;
drop policy if exists lembretes_equipe on public.lembretes;
create policy lembretes_equipe on public.lembretes for all to authenticated using (public.eh_equipe()) with check (public.eh_equipe());
create index if not exists lembretes_dia on public.lembretes (dia) where feito_em is null;

-- Publicações por PARTE (cliente): o Diário (DJEN) não busca por CNPJ, mas busca pelo nome da parte.
-- O cliente escolhido entra com a razão social; o CNPJ fica guardado para conferência.
create table if not exists public.partes_monitoradas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (btrim(nome) <> ''),
  documento text not null default '',
  cliente_id uuid references public.clientes(id) on delete cascade,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  unique (nome)
);
alter table public.publicacoes add column if not exists parte_monitorada text not null default '';
do $$
begin
  alter table public.partes_monitoradas enable row level security;
  revoke all on public.partes_monitoradas from anon;
  grant select, insert, update, delete on public.partes_monitoradas to authenticated;
  drop trigger if exists atualizado_partes_monitoradas on public.partes_monitoradas;
  create trigger atualizado_partes_monitoradas before update on public.partes_monitoradas for each row execute function public.marcar_atualizacao();
  drop policy if exists partes_monitoradas_ver on public.partes_monitoradas;
  create policy partes_monitoradas_ver on public.partes_monitoradas for select to authenticated using (public.pode('juridico'));
  drop policy if exists partes_monitoradas_gravar on public.partes_monitoradas;
  create policy partes_monitoradas_gravar on public.partes_monitoradas for all to authenticated using (public.pode('juridico','editar')) with check (public.pode('juridico','editar'));
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on public.partes_monitoradas to service_role;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════
-- v22 (Backup 16) — CRM: etapas novas, contrato fechado × assinado, área do serviço,
-- alerta de oportunidade parada, follow-up de proposta, motivo de perda em lista fixa
-- ═══════════════════════════════════════════════════════════════════════
update public.crm_etapas set nome = 'Contrato assinado', ordem = 9 where final = 'ganho' and nome in ('Ganhou', 'Contrato assinado');
update public.crm_etapas set nome = 'Lead perdido', ordem = 10 where final = 'perdido' and nome in ('Perdeu', 'Lead perdido');
insert into public.crm_etapas (nome, ordem, probabilidade, final)
select 'Contrato fechado', 6, 90, '' where not exists (select 1 from public.crm_etapas where nome = 'Contrato fechado');
insert into public.crm_etapas (nome, ordem, probabilidade, final)
select 'Aguardando assinatura', 7, 95, '' where not exists (select 1 from public.crm_etapas where nome = 'Aguardando assinatura');
alter table public.crm_etapas add column if not exists dias_alerta int;
alter table public.crm_etapas add column if not exists descricao text not null default '';
update public.crm_etapas e set dias_alerta = v.d, descricao = v.t from (values
  ('Novo contato', 3, 'Primeiro contato registrado; falta qualificar e marcar o diagnóstico.'),
  ('Diagnóstico agendado', 7, 'Reunião de diagnóstico marcada com o cliente.'),
  ('Diagnóstico feito', 5, 'Diagnóstico realizado; falta montar e enviar a proposta.'),
  ('Proposta enviada', 5, 'Proposta com o cliente, aguardando resposta.'),
  ('Negociação', 7, 'Cliente negociando valor, forma de pagamento ou escopo.'),
  ('Contrato fechado', 3, 'Cliente disse SIM: cadastro, contrato e onboarding criados; falta enviar o contrato.'),
  ('Aguardando assinatura', 5, 'Contrato enviado; aguardando a assinatura do cliente.'),
  ('Contrato assinado', null, 'Contrato assinado: sai do painel e vai para a aba "Contratos assinados".'),
  ('Lead perdido', null, 'Não fechou: sai do painel e vai para a aba "Leads perdidos".')) v(n, d, t)
where e.nome = v.n and e.descricao = '';
alter table public.crm_oportunidades add column if not exists servico text not null default '';
alter table public.crm_oportunidades add column if not exists assinado_em timestamptz;

-- "Contrato fechado" (cliente aceitou): cria cliente (herda os dados do prospecto), contrato com a área do serviço
-- e a forma da proposta (parcelas ou mensalidade), onboarding e a tarefa "Enviar contrato para assinatura".
create or replace function public.crm_ganhar(p_op uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o record; cli uuid; grp uuid; ctr uuid; flx uuid; resp text; etp uuid; consult boolean;
begin
  if not public.pode('crm', 'editar') then raise exception 'Sem a função CRM (editar).'; end if;
  select * into o from public.crm_oportunidades where id = p_op;
  if not found then raise exception 'Oportunidade não encontrada.'; end if;
  resp := coalesce(nullif(p->>'responsavel', ''), o.responsavel);
  cli := coalesce(nullif(p->>'cliente_id', '')::uuid, o.cliente_id);
  consult := coalesce(p->>'modalidade', '') = 'consultoria';
  if cli is null then
    if coalesce(p->>'cliente_nome', '') = '' then raise exception 'Informe o nome do cliente.'; end if;
    if coalesce(p->>'grupo', '') <> '' then
      select id into grp from public.grupos where lower(nome) = lower(p->>'grupo') limit 1;
      if grp is null then insert into public.grupos (nome) values (p->>'grupo') returning id into grp; end if;
    end if;
    insert into public.clientes (nome, cpf_cnpj, email, telefone, grupo_id, responsavel, tipo, origem)
    values (p->>'cliente_nome', coalesce(nullif(p->>'cpf_cnpj', ''), o.prospecto_doc, ''), coalesce(nullif(p->>'email', ''), o.prospecto_email, ''),
            coalesce(nullif(p->>'telefone', ''), o.prospecto_telefone, ''), grp, coalesce(resp, ''), case when consult then 'Consultoria' else 'Pontual' end, 'CRM')
    returning id into cli;
  else
    select grupo_id into grp from public.clientes where id = cli;
  end if;
  if consult or coalesce((p->>'valor_total')::numeric, 0) > 0 or coalesce(p->>'descricao', '') <> '' then
    perform set_config('erp.sem_regra_onboarding', case when coalesce((p->>'criar_fluxo')::boolean, true) then '1' else '' end, true);
    insert into public.contratos (cliente_id, descricao, valor_total, num_parcelas, primeiro_vencimento, percentual_exito, responsavel, servico,
                                  modalidade, valor_mensal, dia_vencimento, inicio_competencia)
    values (cli, coalesce(nullif(p->>'descricao', ''), o.titulo), case when consult then 0 else coalesce((p->>'valor_total')::numeric, 0) end,
            case when consult then 1 else greatest(1, coalesce((p->>'num_parcelas')::int, 1)) end,
            case when consult then null else nullif(p->>'primeiro_vencimento', '')::date end, nullif(p->>'percentual_exito', '')::numeric, coalesce(resp, ''),
            coalesce(nullif(p->>'servico', ''), o.servico, ''), case when consult then 'consultoria' else 'pontual' end,
            case when consult then nullif(p->>'valor_mensal', '')::numeric end, coalesce(nullif(p->>'dia_vencimento', '')::int, 10),
            case when consult then date_trunc('month', coalesce(nullif(p->>'inicio_competencia', '')::date, current_date))::date end)
    returning id into ctr;
    perform set_config('erp.sem_regra_onboarding', '', true);
    if consult then begin perform public.gerar_mensalidades(); exception when undefined_function then null; end; end if;
  end if;
  if coalesce((p->>'criar_fluxo')::boolean, true) then
    flx := public.criar_fluxo_modelo('Onboarding de cliente', public.somar_uteis(current_date, 15), cli, grp, resp,
                                     'Onboarding — ' || coalesce(p->>'cliente_nome', (select nome from public.clientes where id = cli)));
  end if;
  perform public.tarefa_da_regra('crm-contrato:' || p_op, 'Enviar contrato para assinatura — ' || coalesce(nullif(p->>'cliente_nome', ''), (select nome from public.clientes where id = cli)),
    resp, public.somar_uteis(current_date, 2), cli, grp, ctr, '[]'::jsonb, 'Oportunidade do CRM: ' || o.titulo, '', 'alta');
  insert into public.interacoes (cliente_id, tipo, resumo) values (cli, 'anotacao', 'Contrato fechado pelo CRM: ' || o.titulo);
  update public.crm_propostas set status = 'aceita' where id = (select id from public.crm_propostas where oportunidade_id = p_op order by versao desc limit 1);
  update public.documentos set cliente_id = cli, grupo_id = grp, contrato_id = coalesce(ctr, contrato_id) where oportunidade_id = p_op;
  select id into etp from public.crm_etapas where nome = 'Contrato fechado' limit 1;
  if etp is null then select id into etp from public.crm_etapas where final = 'ganho' order by ordem limit 1; end if;
  update public.crm_oportunidades set etapa_id = etp, probabilidade = 90, ganho_em = now(), perdido_em = null, cliente_id = cli, contrato_id = ctr,
         servico = coalesce(nullif(p->>'servico', ''), servico) where id = p_op;
  return jsonb_build_object('cliente_id', cli, 'contrato_id', ctr, 'fluxo_id', flx);
end $$;
revoke all on function public.crm_ganhar(uuid, jsonb) from anon;
grant execute on function public.crm_ganhar(uuid, jsonb) to authenticated;

-- entrar em "Contrato assinado" marca a data (e o contrato); sair limpa
create or replace function public.crm_ao_mudar_etapa() returns trigger
language plpgsql as $$
declare fim text;
begin
  if tg_op = 'UPDATE' and new.etapa_id is distinct from old.etapa_id then
    new.etapa_desde := now();
    select final into fim from public.crm_etapas where id = new.etapa_id;
    if fim = 'ganho' then new.assinado_em := coalesce(new.assinado_em, now()); new.probabilidade := 100; new.ganho_em := coalesce(new.ganho_em, now());
    elsif fim is distinct from 'ganho' then new.assinado_em := null; end if;
  end if;
  return new;
end $$;

-- regras automáticas do CRM (rodam com as demais, todo dia útil)
insert into public.regras_tarefas (chave, nome, descricao, ligada, dias, grupo) values
  ('crm_parada', 'CRM: oportunidade parada na etapa → tarefa', 'Quando passa do prazo de cada etapa (CRM → ⚙ Etapas), cria tarefa para o responsável', true, 0, 'tarefas'),
  ('crm_followup', 'CRM: proposta sem resposta → follow-up', 'N dias depois do envio da proposta sem resposta, cria tarefa de follow-up (com e-mail pronto na ficha)', true, 5, 'tarefas')
on conflict (chave) do nothing;
create or replace function public.rodar_regras_extras() returns int
language plpgsql security definer set search_path = public as $$
declare rg record; x record; n int := 0;
begin
  select * into rg from public.regras_tarefas where chave = 'crm_parada' and ligada;
  if found then
    for x in select o.id, o.titulo, o.responsavel, o.cliente_id, o.etapa_id, e.nome etapa, e.dias_alerta
               from public.crm_oportunidades o join public.crm_etapas e on e.id = o.etapa_id
              where e.final = '' and e.dias_alerta is not null and o.etapa_desde < now() - make_interval(days => e.dias_alerta) loop
      if public.tarefa_da_regra('crm-parada:' || x.id || ':' || x.etapa_id, 'CRM parado há mais de ' || x.dias_alerta || ' dia(s) em "' || x.etapa || '" — ' || x.titulo,
           x.responsavel, public.somar_uteis(current_date, 1), x.cliente_id, null, null, '[]'::jsonb, 'Avance a oportunidade no CRM ou registre o próximo passo.') then n := n + 1; end if;
    end loop;
  end if;
  select * into rg from public.regras_tarefas where chave = 'crm_followup' and ligada;
  if found then
    for x in select pr.id, pr.titulo, pr.versao, o.titulo op, o.responsavel, o.cliente_id from public.crm_propostas pr join public.crm_oportunidades o on o.id = pr.oportunidade_id
               join public.crm_etapas e on e.id = o.etapa_id
              where pr.status = 'enviada' and pr.enviada_em < now() - make_interval(days => rg.dias) and e.final = '' loop
      if public.tarefa_da_regra('crm-follow:' || x.id, 'Follow-up da proposta — ' || x.op, x.responsavel, current_date, x.cliente_id, null, null, '[]'::jsonb,
           'Proposta v' || x.versao || ' enviada há mais de ' || rg.dias || ' dias sem resposta. Na ficha da oportunidade: "✉ Follow-up" envia o e-mail pronto.') then n := n + 1; end if;
    end loop;
  end if;
  return n;
end $$;
revoke all on function public.rodar_regras_extras() from public, anon, authenticated;
-- follow-up da proposta por e-mail (1 clique na ficha da oportunidade): modelo da marca + registro na linha do tempo
create or replace function public.crm_followup_email(p_op uuid, p_para text, p_assunto text, p_texto text) returns void
language plpgsql security definer set search_path = public as $$
declare corpo text;
begin
  if not public.pode('crm', 'editar') then raise exception 'Sem a função CRM (editar).'; end if;
  if coalesce(p_para, '') !~ '^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$' then raise exception 'Informe um e-mail válido (um só).'; end if;
  if p_para ilike '%@example.%' then raise exception 'E-mail de exemplo não recebe mensagens.'; end if;
  if btrim(coalesce(p_texto, '')) = '' then raise exception 'A mensagem está vazia.'; end if;
  corpo := '<p style="margin:0 0 10px">' || replace(replace(public.esc_html(btrim(p_texto)), E'\n\n', '</p><p style="margin:0 0 10px">'), E'\n', '<br>') || '</p>';
  insert into public.email_fila (usuario_id, para, assunto, html, tipo, referencia)
  values (null, p_para, left(coalesce(nullif(btrim(p_assunto), ''), 'Nossa proposta'), 200),
          public.email_cliente_html(coalesce(nullif(btrim(p_assunto), ''), 'Nossa proposta'), '-', corpo, '[]', false, '-'), 'proposta', '');
  insert into public.crm_atividades (oportunidade_id, tipo, resumo) values (p_op, 'email', 'Follow-up enviado para ' || p_para || ': ' || left(p_texto, 300));
  update public.tarefas set status = 'concluida' where chave_regra like 'crm-follow:%' and status not in ('concluida', 'cancelada')
     and chave_regra in (select 'crm-follow:' || id from public.crm_propostas where oportunidade_id = p_op);
end $$;
revoke all on function public.crm_followup_email(uuid, text, text, text) from public, anon;
grant execute on function public.crm_followup_email(uuid, text, text, text) to authenticated;

-- modelos de proposta novos (o visual da proposta é o mesmo para todos: capa, apresentação, escopo, valores, aceite)
insert into public.crm_modelos_proposta (nome, texto, itens)
select v.n, v.t, v.i::jsonb from (values
  ('Planejamento tributário',
   '<p>Prezado(a) {cliente},</p><p>Agradecemos a confiança. Esta proposta trata do <b>planejamento tributário</b> da empresa: diagnóstico do regime atual, simulação dos cenários (Simples Nacional, Lucro Presumido e Lucro Real), indicação do caminho mais econômico e seguro e acompanhamento da implantação.</p><h3>O que está incluído</h3><ul><li>Levantamento de faturamento, folha e despesas dos últimos 12 meses</li><li>Comparativo dos regimes com a economia estimada</li><li>Relatório final com a recomendação e o passo a passo</li><li>Reunião de apresentação dos resultados</li></ul><p>Esta proposta vale até {validade}.</p>',
   '[{"servico":"Diagnóstico e planejamento tributário","valor":0,"forma":"50% na assinatura e 50% na entrega"}]'),
  ('Inventário e planejamento sucessório',
   '<p>Prezado(a) {cliente},</p><p>Apresentamos proposta para a condução do <b>inventário</b> (judicial ou extrajudicial) e a orientação sucessória da família, com levantamento de bens, cálculo do ITCD, partilha e registro.</p><h3>O que está incluído</h3><ul><li>Levantamento de bens, dívidas e documentos</li><li>Cálculo e emissão das guias do ITCD</li><li>Minuta da partilha e acompanhamento no cartório ou no processo</li></ul><p>Esta proposta vale até {validade}.</p>',
   '[{"servico":"Inventário e partilha","valor":0,"forma":"em até 3 parcelas"}]'),
  ('Defesa trabalhista',
   '<p>Prezado(a) {cliente},</p><p>Apresentamos proposta para a <b>defesa na reclamação trabalhista</b>: análise da inicial e dos documentos, contestação, audiências e recursos até a decisão de primeira instância.</p><p>Esta proposta vale até {validade}.</p>',
   '[{"servico":"Honorários iniciais","valor":0,"forma":"à vista ou em até 3 parcelas"},{"servico":"Honorários por audiência","valor":0,"forma":"por ato"}]'),
  ('Abertura e regularização de empresa',
   '<p>Prezado(a) {cliente},</p><p>Apresentamos proposta para a <b>abertura (ou regularização) da empresa</b>: escolha do tipo societário e do regime tributário, contrato social, registros na Junta, Receita, Estado e Prefeitura e licenças.</p><p>Esta proposta vale até {validade}.</p>',
   '[{"servico":"Abertura / regularização","valor":0,"forma":"à vista"}]')
) v(n, t, i)
where not exists (select 1 from public.crm_modelos_proposta m where m.nome = v.n);

-- ═══════════════════════════════════════════════════════════════════════
-- v22 (Backup 16) — Central de e-mails ao cliente: honorários (lembrete, vence hoje, 1º/2º/3º aviso),
-- parcelamentos (guia do mês e atraso), acordos (lembrete e atraso) e recibo (PDF com valor por extenso).
-- Os modelos são editáveis (Administração → E-mails). A tela lista o que sai hoje, com prévia,
-- e permite "Enviar agora", "Pular este" e "Enviar selecionados".
-- ═══════════════════════════════════════════════════════════════════════
alter table public.email_fila add column if not exists anexo jsonb;

create table if not exists public.emails_modelos (
  chave text primary key, tipo text not null default '', nome text not null, assunto text not null, texto text not null,
  ordem int not null default 0, atualizado_em timestamptz not null default now()
);
alter table public.emails_modelos enable row level security;
revoke all on public.emails_modelos from anon;
grant select, insert, update on public.emails_modelos to authenticated;
drop policy if exists emails_modelos_ver on public.emails_modelos;
create policy emails_modelos_ver on public.emails_modelos for select to authenticated using (public.eh_equipe());
drop policy if exists emails_modelos_admin on public.emails_modelos;
create policy emails_modelos_admin on public.emails_modelos for update to authenticated using (public.eh_admin()) with check (public.eh_admin());
insert into public.emails_modelos (chave, tipo, nome, assunto, texto, ordem) values
  ('hon_lembrete', 'honorarios', 'Honorários — lembrete antes do vencimento', 'Lembrete de honorários — vencimento em {vencimento}',
   '<p style="margin:0">Passando para lembrar dos honorários abaixo, com vencimento a partir de <b>{vencimento}</b>.</p>', 1),
  ('hon_hoje', 'honorarios', 'Honorários — vence hoje', 'Honorários com vencimento hoje',
   '<p style="margin:0">Os honorários abaixo vencem hoje.</p>', 2),
  ('hon_atraso1', 'honorarios', 'Honorários em atraso — 1º aviso', 'Honorários em aberto',
   '<p style="margin:0">Não identificamos o pagamento dos honorários abaixo. Se já pagou, por favor responda com o comprovante para darmos baixa — obrigado!</p>', 3),
  ('hon_atraso2', 'honorarios', 'Honorários em atraso — 2º aviso', 'Honorários em aberto — 2º aviso',
   '<p style="margin:0">Ainda não identificamos o pagamento dos honorários abaixo. Se houver alguma dificuldade, responda este e-mail que combinamos a melhor forma de regularizar.</p>', 4),
  ('hon_atraso3', 'honorarios', 'Honorários em atraso — 3º aviso', 'Honorários em aberto — último aviso',
   '<p style="margin:0">Este é o nosso último aviso sobre os honorários abaixo, ainda em aberto. Pedimos que regularize ou entre em contato para combinarmos um acordo.</p>', 5),
  ('parc_guia', 'parcelamentos', 'Parcelamento — guia do mês', 'Guia do parcelamento — vence em {vencimento}',
   '<p style="margin:0">A parcela <b>{parcela}</b> do parcelamento <b>{natureza}</b>{numero} de <b>{empresa}</b> vence em <b>{vencimento}</b>. Se ainda não recebeu a guia, responda este e-mail que enviamos.</p><p style="margin:10px 0 0">Atenção: três parcelas em atraso podem cancelar o parcelamento.</p>', 6),
  ('parc_atraso', 'parcelamentos', 'Parcelamento — parcelas em atraso (risco de rescisão)', 'Atenção: {atrasadas} parcela(s) do parcelamento em atraso',
   '<p style="margin:0">O parcelamento <b>{natureza}</b>{numero} de <b>{empresa}</b> está com <b>{atrasadas} parcela(s) em atraso</b>. Com <b>3 parcelas em atraso</b> o parcelamento pode ser <b>cancelado (rescindido)</b> e a dívida volta a ser cobrada inteira.</p><p style="margin:10px 0 0">Responda este e-mail que enviamos as guias para regularizar.</p>', 7),
  ('aco_lembrete', 'acordos', 'Acordo — lembrete da parcela', 'Lembrete: parcela do acordo vence em {vencimento}',
   '<p style="margin:0">A parcela <b>{parcela}</b> do acordo com <b>{credor}</b> (processo {processo}) vence em <b>{vencimento}</b>. O pagamento é feito direto ao credor{pix}.</p><p style="margin:10px 0 0">Depois de pagar, <b>responda este e-mail com o comprovante</b>: nós juntamos ao processo.</p>', 8),
  ('aco_atraso', 'acordos', 'Acordo — parcela em atraso', 'Parcela do acordo em atraso',
   '<p style="margin:0">Não recebemos o comprovante da parcela <b>{parcela}</b> do acordo com <b>{credor}</b> (processo {processo}), vencida em <b>{vencimento}</b>.</p><p style="margin:10px 0 0">Pelo acordo, o atraso permite que o credor peça a <b>execução do saldo</b>, com multa. Se já pagou, responda com o comprovante; se não, pague o quanto antes e nos avise.</p>', 9),
  ('recibo', 'recibos', 'Recibo de pagamento', 'Recibo de pagamento — {valor}',
   '<p style="margin:0">Confirmamos o recebimento de <b>{valor}</b> ({extenso}) em <b>{data_pagamento}</b>. O recibo segue em anexo (PDF). Obrigado!</p>', 10)
on conflict (chave) do nothing;

-- troca {chave} pelos valores (os valores são escapados; o texto do modelo pode ter HTML simples)
create or replace function public.modelo_email(p_chave text, p_vars jsonb, out assunto text, out texto text)
language plpgsql stable security definer set search_path = public as $$
declare k text; v text;
begin
  select m.assunto, m.texto into assunto, texto from public.emails_modelos m where m.chave = p_chave;
  for k, v in select * from jsonb_each_text(coalesce(p_vars, '{}')) loop
    assunto := replace(assunto, '{' || k || '}', coalesce(v, ''));
    texto := replace(texto, '{' || k || '}', public.esc_html(coalesce(v, '')));
  end loop;
end $$;
revoke all on function public.modelo_email(text, jsonb) from public, anon, authenticated;

-- valor por extenso (reais e centavos), para o recibo
create or replace function public.valor_extenso(p numeric) returns text
language plpgsql immutable as $$
declare
  un text[] := array['um','dois','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
  dz text[] := array['','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
  ct text[] := array['cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
  reais bigint := floor(abs(coalesce(p, 0))); cent int := round((abs(coalesce(p, 0)) - floor(abs(coalesce(p, 0)))) * 100);
  r text := ''; partes text[] := '{}'; grupos int[] := '{}'; g int; n bigint; i int; esc text[] := array['', 'mil', 'milhão', 'bilhão']; escp text[] := array['', 'mil', 'milhões', 'bilhões'];
  function_txt text;
begin
  if reais = 0 and cent = 0 then return 'zero real'; end if;
  n := reais;
  while n > 0 loop grupos := grupos || (n % 1000)::int; n := n / 1000; end loop;
  for i in reverse coalesce(array_length(grupos, 1), 0)..1 loop
    g := grupos[i];
    if g = 0 then continue; end if;
    function_txt := case
      when g = 100 then 'cem'
      else trim(both ' ' from concat_ws(' e ',
        case when g >= 100 then ct[g / 100] end,
        case when g % 100 between 1 and 19 then un[g % 100] when g % 100 >= 20 then concat_ws(' e ', dz[(g % 100) / 10], case when g % 10 > 0 then un[g % 10] end) end))
    end;
    if i = 2 and g = 1 then function_txt := 'mil';
    elsif i > 1 then function_txt := function_txt || ' ' || case when g = 1 then esc[i] else escp[i] end; end if;
    partes := partes || function_txt;
  end loop;
  -- junta os grupos ("e" antes do último quando ele for menor que 100 ou redondo em centenas)
  for i in 1..coalesce(array_length(partes, 1), 0) loop
    if i = 1 then r := partes[i];
    elsif i = array_length(partes, 1) and (grupos[1] < 100 or grupos[1] % 100 = 0) then r := r || ' e ' || partes[i];
    else r := r || ' ' || partes[i]; end if;
  end loop;
  if reais > 0 then r := r || case when reais = 1 then ' real' when reais % 1000000 = 0 then ' de reais' else ' reais' end; end if;
  if cent > 0 then
    r := r || case when reais > 0 then ' e ' else '' end ||
         case when cent between 1 and 19 then un[cent] else concat_ws(' e ', dz[cent / 10], case when cent % 10 > 0 then un[cent % 10] end) end ||
         case when cent = 1 then ' centavo' else ' centavos' end;
  end if;
  return r;
end $$;

-- configuração da Central (automático por tipo, horário, intervalos dos avisos de atraso)
create or replace function public.config_emails() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'honorarios', coalesce((select ligada from public.regras_tarefas where chave = 'email_lembrete_honorario'), false) or coalesce((select ligada from public.regras_tarefas where chave = 'email_cobranca_honorario'), false),
    'parcelamentos', coalesce((select ligada from public.regras_tarefas where chave = 'email_lembrete_parcelamento'), false),
    'acordos', coalesce((select ligada from public.regras_tarefas where chave = 'email_lembrete_acordo'), false),
    'recibos', coalesce((select ligada from public.regras_tarefas where chave = 'email_pagamento_recebido'), false),
    'lembrete_dias', coalesce((select dias from public.regras_tarefas where chave = 'email_lembrete_honorario'), 5),
    'parc_dias', coalesce((select dias from public.regras_tarefas where chave = 'email_lembrete_parcelamento'), 3),
    'aco_dias', coalesce((select dias from public.regras_tarefas where chave = 'email_lembrete_acordo'), 3),
    'atraso', jsonb_build_array(coalesce((select dias from public.regras_tarefas where chave = 'email_cobranca_honorario'), 3),
                                coalesce(((select valor from public.configuracoes where chave = 'emails_central')->'atraso'->>1)::int, 10),
                                coalesce(((select valor from public.configuracoes where chave = 'emails_central')->'atraso'->>2)::int, 20)),
    'aco_atraso_dias', coalesce(((select valor from public.configuracoes where chave = 'emails_central')->>'aco_atraso_dias')::int, 2),
    'hora', (select valor->>'hora' from public.configuracoes where chave = 'emails_central'));
$$;
revoke all on function public.config_emails() from public, anon;
grant execute on function public.config_emails() to authenticated;

-- tudo o que a rotina mandaria hoje (sem enviar): a tela mostra e a rotina usa a mesma lista
create or replace function public.emails_pendentes()
returns table (tipo text, regra text, ref text, cliente_id uuid, grupo_id uuid, finalidade text, assunto text, texto text, itens jsonb, pagar boolean, marcas text[], vence date)
language plpgsql stable security definer set search_path = public as $$
declare cfg jsonb := public.config_emails(); t1 int; t2 int; t3 int; x record; m record; k int;
begin
  t1 := (cfg->'atraso'->>0)::int; t2 := (cfg->'atraso'->>1)::int; t3 := (cfg->'atraso'->>2)::int;
  -- honorários: lembrete (todos os que vencem até N dias; cada lançamento uma vez)
  for x in select l.cliente_id cli, l.grupo_id grp, min(l.vencimento) venc, array_agg('email_lhi:' || l.id order by l.id) mk, string_agg(l.id::text, ',' order by l.id) ids,
                  jsonb_agg(jsonb_build_object('descricao', l.descricao || coalesce(' (' || nullif(l.referencia, '') || ')', ''), 'vencimento', l.vencimento, 'valor', l.valor) order by l.vencimento) its
             from public.lancamentos l where l.tipo = 'receita' and not l.redutor and not l.pago and not coalesce(l.perda, false)
              and l.vencimento > current_date and l.vencimento <= current_date + (cfg->>'lembrete_dias')::int
              and not exists (select 1 from public.automacoes_log g where g.ref = 'email_lhi:' || l.id)
            group by l.cliente_id, l.grupo_id loop
    select * into m from public.modelo_email('hon_lembrete', jsonb_build_object('vencimento', to_char(x.venc, 'DD/MM/YYYY')));
    return query select 'honorarios'::text, 'email_lh'::text, 'email_lh:' || md5(x.ids), x.cli, x.grp, 'financeiro'::text, m.assunto, m.texto, x.its, true, x.mk, x.venc;
  end loop;
  -- honorários: vence hoje (perfil "Só no vencimento")
  for x in select l.cliente_id cli, l.grupo_id grp, min(l.vencimento) venc, array_agg('email_vhi:' || l.id order by l.id) mk, string_agg(l.id::text, ',' order by l.id) ids,
                  jsonb_agg(jsonb_build_object('descricao', l.descricao || coalesce(' (' || nullif(l.referencia, '') || ')', ''), 'vencimento', l.vencimento, 'valor', l.valor)) its
             from public.lancamentos l where l.tipo = 'receita' and not l.redutor and not l.pago and not coalesce(l.perda, false)
              and l.vencimento between current_date - 2 and current_date
              and not exists (select 1 from public.automacoes_log g where g.ref = 'email_vhi:' || l.id)
              and public.pode_email(l.cliente_id, l.grupo_id, 'vencimento') and public.perfil_email_de(l.cliente_id, l.grupo_id) <> 'padrao'
            group by l.cliente_id, l.grupo_id loop
    select * into m from public.modelo_email('hon_hoje', '{}');
    return query select 'honorarios'::text, 'email_vh'::text, 'email_vh:' || md5(x.ids), x.cli, x.grp, 'financeiro'::text, m.assunto, m.texto, x.its, true, x.mk, x.venc;
  end loop;
  -- honorários em atraso: 1º, 2º e 3º aviso (um e-mail por cliente e nível, com todos os que estão em aberto)
  for k in 1..3 loop
    for x in select l.cliente_id cli, l.grupo_id grp, min(l.vencimento) venc,
                    array_agg(case when k = 1 then 'email_ch:' else 'email_ch' || k || ':' end || l.id order by l.id) mk, string_agg(l.id::text, ',' order by l.id) ids
               from public.lancamentos l where l.tipo = 'receita' and not l.redutor and not l.pago and not coalesce(l.perda, false)
                and current_date - l.vencimento >= case k when 1 then t1 when 2 then t2 else t3 end
                and (k = 3 or current_date - l.vencimento < case k when 1 then t2 else t3 end)
                and not exists (select 1 from public.automacoes_log g where g.ref = case when k = 1 then 'email_ch:' else 'email_ch' || k || ':' end || l.id)
              group by l.cliente_id, l.grupo_id loop
      select * into m from public.modelo_email('hon_atraso' || k, '{}');
      return query select 'honorarios'::text, 'email_ch'::text, 'email_ch' || k || 'c:' || md5(x.ids), x.cli, x.grp, 'financeiro'::text, m.assunto, m.texto,
        (select jsonb_agg(jsonb_build_object('descricao', o.descricao || coalesce(' (' || nullif(o.referencia, '') || ')', ''), 'vencimento', o.vencimento, 'valor', o.valor) order by o.vencimento)
           from public.lancamentos o where o.tipo = 'receita' and not o.redutor and not o.pago and not coalesce(o.perda, false) and o.vencimento < current_date
            and ((x.cli is not null and o.cliente_id = x.cli) or (x.cli is null and o.grupo_id = x.grp))), true, x.mk, x.venc;
    end loop;
  end loop;
  -- parcelamentos: guia do mês (N dias antes)
  for x in select pa.id, pa.numero, pa.vencimento, p.empresa, p.natureza, p.local, p.numero parc_num, p.valor_ultima_parcela, p.grupo_id, p.total_parcelas,
                  (select cl.id from public.clientes cl where (d.d <> '' and regexp_replace(cl.cpf_cnpj, '\D', '', 'g') = d.d) or cl.nome = p.empresa limit 1) cli
             from public.parcelas pa join public.parcelamentos p on p.id = pa.parcelamento_id
             cross join lateral (select regexp_replace(coalesce(p.cnpj, ''), '\D', '', 'g') d) d
            where not pa.pago and pa.vencimento between current_date and current_date + (cfg->>'parc_dias')::int
              and not exists (select 1 from public.automacoes_log g where g.ref = 'email_lp:' || pa.id) loop
    select * into m from public.modelo_email('parc_guia', jsonb_build_object('parcela', coalesce(x.numero, '') || coalesce('/' || x.total_parcelas, ''), 'natureza', trim(both ' ·' from coalesce(x.natureza, '') || coalesce(' · ' || nullif(x.local, ''), '')),
      'numero', coalesce(' (nº ' || nullif(x.parc_num, '') || ')', ''), 'empresa', coalesce(x.empresa, ''), 'vencimento', to_char(x.vencimento, 'DD/MM/YYYY')));
    return query select 'parcelamentos'::text, 'email_lp'::text, 'email_lp:' || x.id, x.cli, x.grupo_id, 'financeiro'::text, m.assunto, m.texto,
      case when coalesce(x.valor_ultima_parcela, 0) > 0 then jsonb_build_array(jsonb_build_object('descricao', 'Parcela ' || coalesce(x.numero, ''), 'vencimento', x.vencimento, 'valor', x.valor_ultima_parcela)) else '[]'::jsonb end,
      false, '{}'::text[], x.vencimento;
  end loop;
  -- parcelamentos em atraso (1 ou 2 parcelas: avisa antes da rescisão; muda o número, avisa de novo)
  if coalesce((select ligada from public.regras_tarefas where chave = 'email_atraso_parcelamento'), true) then
    for x in select * from (select p.id, p.empresa, p.natureza, p.local, p.numero parc_num, p.grupo_id, count(*) n, min(pa.vencimento) venc,
                    (select cl.id from public.clientes cl where (d.d <> '' and regexp_replace(cl.cpf_cnpj, '\D', '', 'g') = d.d) or cl.nome = p.empresa limit 1) cli
               from public.parcelas pa join public.parcelamentos p on p.id = pa.parcelamento_id
               cross join lateral (select regexp_replace(coalesce(p.cnpj, ''), '\D', '', 'g') d) d
              where not pa.pago and pa.vencimento < current_date
              group by p.id, p.empresa, p.natureza, p.local, p.numero, p.grupo_id, d.d) z
             where not exists (select 1 from public.automacoes_log g where g.ref = 'email_pa:' || z.id || ':' || z.n) loop
      select * into m from public.modelo_email('parc_atraso', jsonb_build_object('atrasadas', x.n, 'natureza', trim(both ' ·' from coalesce(x.natureza, '') || coalesce(' · ' || nullif(x.local, ''), '')),
        'numero', coalesce(' (nº ' || nullif(x.parc_num, '') || ')', ''), 'empresa', coalesce(x.empresa, '')));
      return query select 'parcelamentos'::text, 'email_lp'::text, 'email_pa:' || x.id || ':' || x.n, x.cli, x.grupo_id, 'financeiro'::text, m.assunto, m.texto, '[]'::jsonb, false, '{}'::text[], x.venc;
    end loop;
  end if;
  -- acordos: lembrete (até N dias antes; cada parcela uma vez) e atraso (N dias depois do vencimento)
  for x in select a.id, a.valor, a.vencimento, a.credor, a.parcela, a.total_parcelas, a.processo, a.grupo_id, a.pix, a.banco, a.vencimento < current_date atrasada,
                  (select cl.id from public.clientes cl where cl.grupo_id = a.grupo_id and public.primeiro_nome(cl.nome) = public.primeiro_nome(a.devedor) limit 1) cli
             from public.acordos a
            where not a.pago and ((a.vencimento between current_date and current_date + (cfg->>'aco_dias')::int and not exists (select 1 from public.automacoes_log g where g.ref = 'email_la:' || a.id))
               or (a.vencimento <= current_date - (cfg->>'aco_atraso_dias')::int and coalesce((select ligada from public.regras_tarefas where chave = 'email_atraso_acordo'), true)
                   and not exists (select 1 from public.automacoes_log g where g.ref = 'email_aa:' || a.id))) loop
    select * into m from public.modelo_email(case when x.atrasada then 'aco_atraso' else 'aco_lembrete' end, jsonb_build_object('parcela', coalesce(x.parcela, '') || coalesce('/' || nullif(x.total_parcelas, ''), ''),
      'credor', coalesce(x.credor, ''), 'processo', coalesce(x.processo, ''), 'vencimento', to_char(x.vencimento, 'DD/MM/YYYY'),
      'pix', case when coalesce(x.pix, '') <> '' then ' — PIX do credor: ' || x.pix else '' end || case when coalesce(x.banco, '') <> '' then ' — ' || x.banco else '' end));
    return query select 'acordos'::text, 'email_la'::text, case when x.atrasada then 'email_aa:' else 'email_la:' end || x.id, x.cli, x.grupo_id, 'juridico'::text, m.assunto, m.texto,
      jsonb_build_array(jsonb_build_object('descricao', 'Parcela ' || coalesce(x.parcela, '') || coalesce('/' || nullif(x.total_parcelas, ''), ''), 'vencimento', x.vencimento, 'valor', x.valor)), false, '{}'::text[], x.vencimento;
  end loop;
end $$;
revoke all on function public.emails_pendentes() from public, anon, authenticated;

-- regras novas (entram na Central de automações e no "automático" da Central de e-mails)
insert into public.regras_tarefas (chave, nome, descricao, ligada, dias, grupo) values
  ('email_atraso_parcelamento', 'E-mail ao cliente: parcelamento com parcela em atraso', 'Avisa o risco de rescisão (3 parcelas em atraso) quando o número de parcelas atrasadas muda', true, 0, 'cliente_email'),
  ('email_atraso_acordo', 'E-mail ao cliente: parcela do acordo em atraso', 'N dias depois do vencimento sem baixa, avisa o cliente (o credor pode executar)', true, 2, 'cliente_email')
on conflict (chave) do nothing;

-- envio (redefinido): aceita anexo (recibo em PDF); respeita perfil, contato certo e nunca example.com
drop function if exists public.email_cliente_enviar(text, text, uuid, uuid, text, text, text, jsonb, boolean);
create or replace function public.email_cliente_enviar(p_regra text, p_ref text, p_cliente uuid, p_grupo uuid, p_finalidade text,
  p_assunto text, p_texto text, p_itens jsonb default '[]', p_pagar boolean default false, p_anexo jsonb default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare c record; tipo text;
begin
  if exists (select 1 from public.automacoes_log where ref = p_ref) then return false; end if;
  tipo := case p_regra when 'email_lh' then 'lembrete' when 'email_vh' then 'vencimento' when 'email_ch' then 'cobranca'
                       when 'email_pr' then 'recibo' when 'email_lp' then 'parcelamento' when 'email_la' then 'acordo' end;
  if tipo is not null and not public.pode_email(p_cliente, p_grupo, tipo) then
    insert into public.automacoes_log (chave, ref, descricao, cliente_id)
    values (p_regra, p_ref, 'Não enviado (perfil de e-mail do cliente): ' || p_assunto, p_cliente);
    return false;
  end if;
  select * into c from public.contato_do_cliente(p_cliente, p_grupo, p_finalidade);
  if c.email is null or c.email = '' then return false; end if;
  if c.email ~* '(@|\.)example\.com$' then
    insert into public.automacoes_log (chave, ref, descricao, cliente_id) values (p_regra, p_ref, 'Demonstração (não enviado): ' || p_assunto, p_cliente);
    return false;
  end if;
  insert into public.email_fila (usuario_id, para, assunto, html, tipo, referencia, anexo)
  values (null, c.email, p_assunto, public.email_cliente_html(p_assunto, c.nome, p_texto, p_itens, p_pagar), 'cliente', p_ref, p_anexo);
  insert into public.automacoes_log (chave, ref, descricao, cliente_id) values (p_regra, p_ref, p_assunto || ' → ' || c.email, p_cliente);
  return true;
end $$;
revoke all on function public.email_cliente_enviar(text, text, uuid, uuid, text, text, text, jsonb, boolean, jsonb) from public, anon, authenticated;

-- tipo da Central ligado no automático?
create or replace function public.email_tipo_auto(p_tipo text) returns boolean
language sql stable security definer set search_path = public as $$ select coalesce((public.config_emails()->>p_tipo)::boolean, false) $$;
revoke all on function public.email_tipo_auto(text) from public, anon, authenticated;

-- a rotina: envia o que está na lista de hoje, só dos tipos ligados no automático
create or replace function public.rodar_emails_cliente() returns int
language plpgsql security definer set search_path = public as $$
declare x record; n int := 0;
begin
  for x in select * from public.emails_pendentes() loop
    if not public.email_tipo_auto(x.tipo) then continue; end if;
    if x.ref like 'email_ch%' and not coalesce((select ligada from public.regras_tarefas where chave = 'email_cobranca_honorario'), false) then continue; end if;
    if x.ref like 'email_lh:%' and not coalesce((select ligada from public.regras_tarefas where chave = 'email_lembrete_honorario'), false) then continue; end if;
    if public.email_cliente_enviar(x.regra, x.ref, x.cliente_id, x.grupo_id, x.finalidade, x.assunto, x.texto, x.itens, x.pagar) then n := n + 1; end if;
    insert into public.automacoes_log (chave, ref, descricao, cliente_id) select '_item', mk, 'marcador', x.cliente_id from unnest(x.marcas) mk
      where not exists (select 1 from public.automacoes_log g where g.ref = mk);
  end loop;
  return n;
end $$;
revoke all on function public.rodar_emails_cliente() from public, anon, authenticated;

-- dados do recibo: emitente (pela pessoa do lançamento), quem pagou, valor por extenso, data e local
create or replace function public.recibo_dados(p_lanc uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare l record; em jsonb; k_em text; quem text; doc text; cfg jsonb;
begin
  select * into l from public.lancamentos where id = p_lanc;
  if not found then return null; end if;
  cfg := coalesce((select valor from public.configuracoes where chave = 'recibo_emitentes'), '{}');
  k_em := lower(public.primeiro_nome(coalesce(l.responsavel, '')));
  k_em := translate(k_em, 'áàâãéêíóôõúç', 'aaaaeeiooouc');
  em := coalesce(cfg->k_em, cfg->'escritorio', jsonb_build_object('nome', 'ARAÚJO & CASTRO ADVOCACIA E CONSULTORIA', 'qualif', '', 'local', coalesce((select value->>'local' from jsonb_each(cfg) limit 1), '')));
  select coalesce(cl.nome, g.nome, l.favorecido, 'cliente'), coalesce(nullif(cl.cpf_cnpj, ''), '') into quem, doc
    from (select 1) z left join public.clientes cl on cl.id = l.cliente_id left join public.grupos g on g.id = l.grupo_id;
  return jsonb_build_object('emitente', em->>'nome', 'qualif', coalesce(em->>'qualif', ''), 'oab', coalesce(em->>'oab', ''), 'local', coalesce(em->>'local', ''),
    'pagador', quem, 'doc', doc, 'valor', l.valor, 'valor_txt', 'R$ ' || to_char(l.valor, 'FM999G999G990D00'), 'extenso', public.valor_extenso(l.valor),
    'referente', l.descricao || coalesce(' (' || nullif(l.referencia, '') || ')', ''), 'data', to_char(coalesce(l.data_pagamento, current_date), 'DD/MM/YYYY'),
    'data_extenso', extract(day from coalesce(l.data_pagamento, current_date))::int || ' de ' ||
      (array['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'])[extract(month from coalesce(l.data_pagamento, current_date))::int] ||
      ' de ' || extract(year from coalesce(l.data_pagamento, current_date))::int, 'numero', upper(left(replace(l.id::text, '-', ''), 8)));
end $$;
revoke all on function public.recibo_dados(uuid) from public, anon;
grant execute on function public.recibo_dados(uuid) to authenticated;

-- "Recebido": recibo por e-mail com o PDF anexo (o PDF é montado pela função erp-emails na hora do envio)
create or replace function public.pagamento_automacoes() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; r jsonb; m record;
begin
  if not new.pago or old.pago or new.tipo <> 'receita' or new.redutor then return null; end if;
  if exists (select 1 from public.regras_tarefas where chave = 'pagamento_conclui' and ligada) then
    update public.tarefas set status = 'concluida', checklist = (select coalesce(jsonb_agg(i || '{"feito":true}'::jsonb), '[]'::jsonb) from jsonb_array_elements(checklist) i) where chave_regra = 'cob:' || new.id and status not in ('concluida','cancelada');
    get diagnostics n = row_count;
    if n > 0 then insert into public.automacoes_log (chave, ref, descricao, cliente_id) values ('pagamento_conclui', 'pago:' || new.id, 'Honorário recebido: cobrança concluída sozinha — ' || new.descricao, new.cliente_id); end if;
  end if;
  if exists (select 1 from public.regras_tarefas where chave = 'email_pagamento_recebido' and ligada) then
    r := public.recibo_dados(new.id);
    select * into m from public.modelo_email('recibo', jsonb_build_object('valor', r->>'valor_txt', 'extenso', r->>'extenso', 'data_pagamento', r->>'data'));
    perform public.email_cliente_enviar('email_pr', 'email_pr:' || new.id, new.cliente_id, new.grupo_id, 'financeiro', m.assunto, m.texto,
      jsonb_build_array(jsonb_build_object('descricao', new.descricao || coalesce(' (' || nullif(new.referencia, '') || ')', ''), 'vencimento', new.vencimento, 'valor', new.valor)), false,
      jsonb_build_object('tipo', 'recibo', 'arquivo', 'Recibo ' || (r->>'numero') || '.pdf', 'dados', r));
  end if;
  return null;
end $$;

-- ─────────── Central de e-mails (tela) ───────────
create or replace function public.pode_central_emails() returns boolean
language sql stable security definer set search_path = public as $$
  select public.eh_admin() or public.pode('financeiro_juridico', 'editar') or public.pode('financeiro_contab', 'editar') or public.pode('juridico', 'editar');
$$;
revoke all on function public.pode_central_emails() from public, anon;
grant execute on function public.pode_central_emails() to authenticated;

create or replace function public.emails_central(p_situacao text default 'hoje') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.pode_central_emails() then raise exception 'permission denied: sem acesso à Central de e-mails.'; end if;
  if p_situacao = 'hoje' then
    select coalesce(jsonb_agg(jsonb_build_object('ref', x.ref, 'tipo', x.tipo, 'assunto', x.assunto, 'vence', x.vence, 'cliente', coalesce(cl.nome, g.nome, '—'), 'grupo', g.nome,
             'para', ct.email, 'auto', public.email_tipo_auto(x.tipo),
             'bloqueio', case when x.tipo <> 'honorarios' and x.tipo <> 'recibos' and not public.pode_email(x.cliente_id, x.grupo_id, case x.regra when 'email_lp' then 'parcelamento' else 'acordo' end) then 'perfil do cliente'
                              when x.tipo = 'honorarios' and not public.pode_email(x.cliente_id, x.grupo_id, case x.regra when 'email_lh' then 'lembrete' when 'email_vh' then 'vencimento' else 'cobranca' end) then 'perfil do cliente'
                              when coalesce(ct.email, '') = '' then 'sem e-mail cadastrado'
                              when ct.email ~* '(@|\.)example\.com$' then 'demonstração' else '' end,
             'total', (select coalesce(sum((i->>'valor')::numeric), 0) from jsonb_array_elements(x.itens) i)) order by x.tipo, coalesce(cl.nome, g.nome)), '[]')
      into r
      from public.emails_pendentes() x left join public.clientes cl on cl.id = x.cliente_id left join public.grupos g on g.id = coalesce(x.grupo_id, cl.grupo_id)
      left join lateral (select email from public.contato_do_cliente(x.cliente_id, x.grupo_id, x.finalidade) limit 1) ct on true;
  else
    select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'para', f.para, 'assunto', f.assunto, 'status', f.status, 'erro', f.erro, 'quando', coalesce(f.enviado_em, f.criado_em),
             'ref', f.referencia, 'anexo', f.anexo is not null, 'tipo', case when f.referencia like 'email_pr:%' then 'recibos' when f.referencia ~ '^email_(lp|pa)' then 'parcelamentos'
             when f.referencia ~ '^email_(la|aa)' then 'acordos' when f.tipo = 'proposta' then 'propostas' else 'honorarios' end,
             'cliente', (select coalesce(cl.nome, '') from public.automacoes_log a left join public.clientes cl on cl.id = a.cliente_id where a.ref = f.referencia and f.referencia <> '' limit 1))
             order by coalesce(f.enviado_em, f.criado_em) desc), '[]') into r
      from (select * from public.email_fila where tipo in ('cliente', 'proposta') and criado_em > now() - interval '120 days'
               and (case when p_situacao = 'erro' then status = 'erro' else status in ('enviado', 'pendente') end) order by criado_em desc limit 300) f;
  end if;
  return r;
end $$;
revoke all on function public.emails_central(text) from public, anon;
grant execute on function public.emails_central(text) to authenticated;

create or replace function public.emails_central_previa(p_ref text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare x record; c record; f record;
begin
  if not public.pode_central_emails() then raise exception 'permission denied'; end if;
  select * into x from public.emails_pendentes() e where e.ref = p_ref;
  if found then
    select * into c from public.contato_do_cliente(x.cliente_id, x.grupo_id, x.finalidade);
    return jsonb_build_object('assunto', x.assunto, 'para', c.email, 'html', public.email_cliente_html(x.assunto, c.nome, x.texto, x.itens, x.pagar));
  end if;
  select * into f from public.email_fila where referencia = p_ref or id::text = p_ref order by criado_em desc limit 1;
  if found then return jsonb_build_object('assunto', f.assunto, 'para', f.para, 'html', f.html); end if;
  return null;
end $$;
revoke all on function public.emails_central_previa(text) from public, anon;
grant execute on function public.emails_central_previa(text) to authenticated;

create or replace function public.emails_central_enviar(p_refs text[]) returns int
language plpgsql security definer set search_path = public as $$
declare x record; n int := 0;
begin
  if not public.pode_central_emails() then raise exception 'permission denied'; end if;
  for x in select * from public.emails_pendentes() e where e.ref = any(p_refs) loop
    if public.email_cliente_enviar(x.regra, x.ref, x.cliente_id, x.grupo_id, x.finalidade, x.assunto, x.texto, x.itens, x.pagar) then n := n + 1; end if;
    insert into public.automacoes_log (chave, ref, descricao, cliente_id) select '_item', mk, 'marcador', x.cliente_id from unnest(x.marcas) mk
      where not exists (select 1 from public.automacoes_log g where g.ref = mk);
  end loop;
  return n;
end $$;
revoke all on function public.emails_central_enviar(text[]) from public, anon;
grant execute on function public.emails_central_enviar(text[]) to authenticated;

create or replace function public.emails_central_pular(p_refs text[]) returns int
language plpgsql security definer set search_path = public as $$
declare x record; n int := 0;
begin
  if not public.pode_central_emails() then raise exception 'permission denied'; end if;
  for x in select * from public.emails_pendentes() e where e.ref = any(p_refs) loop
    insert into public.automacoes_log (chave, ref, descricao, cliente_id) values (x.regra, x.ref, 'Pulado na Central de e-mails: ' || x.assunto, x.cliente_id);
    insert into public.automacoes_log (chave, ref, descricao, cliente_id) select '_item', mk, 'marcador (pulado)', x.cliente_id from unnest(x.marcas) mk
      where not exists (select 1 from public.automacoes_log g where g.ref = mk);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.emails_central_pular(text[]) from public, anon;
grant execute on function public.emails_central_pular(text[]) to authenticated;

create or replace function public.email_reenviar(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.pode_central_emails() then raise exception 'permission denied'; end if;
  update public.email_fila set status = 'pendente', tentativas = 0, erro = '' where id = p_id and status = 'erro';
end $$;
revoke all on function public.email_reenviar(uuid) from public, anon;
grant execute on function public.email_reenviar(uuid) to authenticated;

-- automático por tipo + horário + intervalos (só o administrador)
create or replace function public.salvar_config_emails(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare hora text := nullif(p->>'hora', ''); h int; mi int;
begin
  if not public.eh_admin() then raise exception 'permission denied: só o administrador altera.'; end if;
  if p ? 'honorarios' then update public.regras_tarefas set ligada = (p->>'honorarios')::boolean where chave in ('email_lembrete_honorario', 'email_cobranca_honorario'); end if;
  if p ? 'parcelamentos' then update public.regras_tarefas set ligada = (p->>'parcelamentos')::boolean where chave in ('email_lembrete_parcelamento', 'email_atraso_parcelamento'); end if;
  if p ? 'acordos' then update public.regras_tarefas set ligada = (p->>'acordos')::boolean where chave in ('email_lembrete_acordo', 'email_atraso_acordo'); end if;
  if p ? 'recibos' then update public.regras_tarefas set ligada = (p->>'recibos')::boolean where chave = 'email_pagamento_recebido'; end if;
  if p ? 'lembrete_dias' then update public.regras_tarefas set dias = greatest(1, (p->>'lembrete_dias')::int) where chave = 'email_lembrete_honorario'; end if;
  if p ? 'parc_dias' then update public.regras_tarefas set dias = greatest(0, (p->>'parc_dias')::int) where chave = 'email_lembrete_parcelamento'; end if;
  if p ? 'aco_dias' then update public.regras_tarefas set dias = greatest(0, (p->>'aco_dias')::int) where chave = 'email_lembrete_acordo'; end if;
  if p ? 'atraso' then
    update public.regras_tarefas set dias = greatest(1, (p->'atraso'->>0)::int) where chave = 'email_cobranca_honorario';
    if (p->'atraso'->>1)::int <= (p->'atraso'->>0)::int or (p->'atraso'->>2)::int <= (p->'atraso'->>1)::int then raise exception 'Os avisos precisam estar em ordem (1º < 2º < 3º).'; end if;
  end if;
  if hora is not null and hora !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'Horário inválido (use HH:MM).'; end if;
  insert into public.configuracoes (chave, valor) values ('emails_central', jsonb_build_object('hora', hora,
      'atraso', coalesce(p->'atraso', (public.config_emails())->'atraso'), 'aco_atraso_dias', coalesce((p->>'aco_atraso_dias')::int, ((public.config_emails())->>'aco_atraso_dias')::int)))
  on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
  -- horário próprio (Brasília): rotina separada; sem horário, os e-mails saem junto das regras (7h)
  begin
    perform cron.unschedule(jobid) from cron.job where jobname = 'erp_emails_cliente';
    if hora is not null then
      h := (split_part(hora, ':', 1)::int + 3) % 24; mi := split_part(hora, ':', 2)::int;
      perform cron.schedule('erp_emails_cliente', mi || ' ' || h || ' * * 1-5', 'select public.rodar_emails_cliente()');
    end if;
  exception when others then null;
  end;
  return public.config_emails();
end $$;
revoke all on function public.salvar_config_emails(jsonb) from public, anon;
grant execute on function public.salvar_config_emails(jsonb) to authenticated;

-- com horário próprio, a rotina das 7h não manda os e-mails ao cliente (evita mandar duas vezes)
create or replace function public.rodar_emails_cliente_se_sem_hora() returns int
language plpgsql security definer set search_path = public as $$
begin
  if (select valor->>'hora' from public.configuracoes where chave = 'emails_central') is not null then return 0; end if;
  return public.rodar_emails_cliente();
end $$;
revoke all on function public.rodar_emails_cliente_se_sem_hora() from public, anon, authenticated;

-- histórico de e-mails na ficha do cliente
create or replace function public.emails_do_cliente(p_cliente uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare mails text[];
begin
  if not (public.eh_equipe() and public.pode('clientes')) then raise exception 'permission denied'; end if;
  select array_agg(distinct lower(e)) into mails from (select email e from public.clientes where id = p_cliente and email <> ''
    union select email from public.contatos where cliente_id = p_cliente and email <> '') z;
  return coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'quando', coalesce(f.enviado_em, f.criado_em), 'assunto', f.assunto, 'para', f.para, 'status', f.status, 'erro', f.erro,
      'anexo', f.anexo is not null, 'tipo', case when f.referencia like 'email_pr:%' then 'Recibo' when f.referencia ~ '^email_(lp|pa)' then 'Parcelamento' when f.referencia ~ '^email_(la|aa)' then 'Acordo'
      when f.tipo = 'proposta' then 'Proposta' when f.referencia like 'email_%' then 'Honorários' else 'Mensagem' end) order by f.criado_em desc)
    from public.email_fila f where f.tipo in ('cliente', 'proposta')
     and (f.referencia in (select ref from public.automacoes_log where cliente_id = p_cliente) or lower(f.para) = any(coalesce(mails, '{}')))), '[]');
end $$;
revoke all on function public.emails_do_cliente(uuid) from public, anon;
grant execute on function public.emails_do_cliente(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- v22 (Backup 16) — Tarefas: modelos por tipo de serviço, resumo diário às 8h, carga de trabalho
-- ═══════════════════════════════════════════════════════════════════════
alter table public.modelos_fluxo add column if not exists servico text not null default '';
insert into public.modelos_fluxo (nome, descricao, itens, servico)
select v.n, v.d, v.i::jsonb, v.s from (values
  ('Abertura de empresa', 'Da escolha do tipo societário às licenças (prazos em dias úteis antes da data final)',
   '[{"titulo":"Reunião inicial e lista de documentos","dias":15,"checklist":["Documentos dos sócios","Endereço e atividade (CNAE)","Capital social"]},{"titulo":"Contrato social e viabilidade","dias":10},{"titulo":"Registro na Junta e CNPJ","dias":6},{"titulo":"Inscrições estadual e municipal","dias":3},{"titulo":"Alvará e licenças; entrega ao cliente","dias":0}]', 'Empresarial'),
  ('Inventário', 'Inventário judicial ou extrajudicial com partilha',
   '[{"titulo":"Levantar bens, dívidas e herdeiros","dias":40,"checklist":["Certidão de óbito","Documentos dos herdeiros","Matrículas e extratos"]},{"titulo":"Cálculo e guias do ITCD","dias":25},{"titulo":"Minuta da partilha","dias":15},{"titulo":"Protocolo (cartório ou processo)","dias":8},{"titulo":"Registro e entrega aos herdeiros","dias":0}]', 'Sucessões'),
  ('Defesa trabalhista', 'Da citação à audiência',
   '[{"titulo":"Analisar a inicial e pedir documentos ao cliente","dias":10,"checklist":["Contrato de trabalho","Holerites e ponto","TRCT e guias"]},{"titulo":"Reunião de preparação com o cliente e testemunhas","dias":5},{"titulo":"Contestação e documentos","dias":2},{"titulo":"Audiência","dias":0}]', 'Trabalhista')
) v(n, d, i, s)
where not exists (select 1 from public.modelos_fluxo m where m.nome = v.n);

-- resumo do dia de cada pessoa às 8h de Brasília (11h UTC); cada um liga/desliga em "Meus avisos por e-mail"
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'erp_resumo_diario';
  perform cron.schedule('erp_resumo_diario', '0 11 * * 1-5', 'select public.montar_resumos_diarios()');
exception when others then null;
end $$;
