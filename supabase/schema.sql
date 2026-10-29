-- =====================================================================
-- GESTÃO FAMILIAR DE FINANÇAS E PROJETOS — esquema do banco (Supabase)
-- Execute este arquivo inteiro no SQL Editor do Supabase (uma única vez).
-- Ele é idempotente nas partes principais, mas foi pensado para um
-- projeto novo e vazio.
--
-- Princípios:
--  * Valores monetários sempre em CENTAVOS (bigint) — sem ponto flutuante.
--  * Autoria (criado_por / alterado_por) é carimbada pelo SERVIDOR a partir
--    da sessão autenticada (auth.uid()). O que o navegador enviar nesses
--    campos é ignorado.
--  * Somente os e-mails da tabela membros_autorizados conseguem ter conta.
--  * Todas as tabelas têm RLS: só membros autorizados leem/escrevem.
--  * Toda inclusão/alteração/exclusão fica registrada em "historico".
--  * Controle de concorrência otimista pela coluna "versao".
-- =====================================================================

set client_min_messages = warning;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Acesso: membros autorizados e perfis
-- ---------------------------------------------------------------------
create table if not exists public.membros_autorizados (
  email text primary key check (email = lower(email)),
  nome  text not null
);

-- >>> AJUSTE AQUI os dois e-mails antes de executar (ou edite depois na tabela).
insert into public.membros_autorizados (email, nome) values
  ('jesrrael.santos@gmail.com', 'Jesrrael'),
  ('lau.crisspdr@gmail.com', 'Laucielly')
on conflict (email) do nothing;

create table if not exists public.perfis (
  id        uuid primary key references auth.users(id) on delete cascade,
  email     text not null unique,
  nome      text not null,
  criado_em timestamptz not null default now()
);

create or replace function public.eh_membro()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- 2. Funções de carimbo (autoria / versão) e histórico
-- ---------------------------------------------------------------------
create or replace function public.carimbar_autoria()
returns trigger language plpgsql set search_path = public as $$
declare
  restaurando boolean := coalesce(current_setting('app.restaurando', true), '') = 'on';
  tem_lixeira boolean := to_jsonb(new) ? 'excluido_em';
  so_lixeira  boolean;
  ignorar     text[] := array['excluido_em','excluido_por','alterado_por','alterado_em','versao'];
begin
  if tg_op = 'INSERT' then
    if restaurando and new.criado_por is not null then
      -- restauração de backup: preserva os metadados originais
      new.versao := coalesce(new.versao, 1);
      return new;
    end if;
    new.criado_por   := auth.uid();
    new.criado_em    := now();
    new.alterado_por := null;
    new.alterado_em  := null;
    new.versao       := 1;
    if tem_lixeira then
      new.excluido_em  := null;
      new.excluido_por := null;
    end if;
    return new;
  end if;

  -- UPDATE: autor e data de criação são imutáveis
  new.criado_por := old.criado_por;
  new.criado_em  := old.criado_em;
  new.versao     := old.versao + 1;

  if tem_lixeira then
    so_lixeira := (to_jsonb(new) - ignorar) = (to_jsonb(old) - ignorar)
                  and new.excluido_em is distinct from old.excluido_em;
    if new.excluido_em is distinct from old.excluido_em then
      if new.excluido_em is not null then
        new.excluido_em  := now();
        new.excluido_por := auth.uid();
      else
        new.excluido_por := null;
      end if;
    else
      new.excluido_em  := old.excluido_em;
      new.excluido_por := old.excluido_por;
    end if;
    if so_lixeira then
      -- mover para a lixeira / restaurar não conta como "alteração"
      new.alterado_por := old.alterado_por;
      new.alterado_em  := old.alterado_em;
      return new;
    end if;
  end if;

  new.alterado_por := auth.uid();
  new.alterado_em  := now();
  return new;
end $$;

create table if not exists public.historico (
  id          bigserial primary key,
  tabela      text not null,
  registro_id text not null,
  acao        text not null,
  antes       jsonb,
  depois      jsonb,
  usuario     uuid,
  em          timestamptz not null default now()
);
create index if not exists historico_registro_idx on public.historico (registro_id, em desc);

create or replace function public.registrar_historico()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  acao text;
  rid  text;
begin
  if tg_op = 'INSERT' then
    acao := case when coalesce(current_setting('app.restaurando', true), '') = 'on' then 'restaurado_backup' else 'criado' end;
    rid := new.id::text;
    insert into historico (tabela, registro_id, acao, antes, depois, usuario)
      values (tg_table_name, rid, acao, null, to_jsonb(new), auth.uid());
    return null;
  elsif tg_op = 'UPDATE' then
    rid := new.id::text;
    acao := 'alterado';
    if (to_jsonb(old) ? 'excluido_em') then
      if old.excluido_em is null and new.excluido_em is not null then acao := 'enviado_lixeira';
      elsif old.excluido_em is not null and new.excluido_em is null then acao := 'restaurado';
      end if;
    end if;
    insert into historico (tabela, registro_id, acao, antes, depois, usuario)
      values (tg_table_name, rid, acao, to_jsonb(old), to_jsonb(new), auth.uid());
    return null;
  else
    rid := old.id::text;
    insert into historico (tabela, registro_id, acao, antes, depois, usuario)
      values (tg_table_name, rid, 'apagado_definitivamente', to_jsonb(old), null, auth.uid());
    return null;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Cadastros
-- ---------------------------------------------------------------------
create table if not exists public.pessoas (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null check (length(trim(nome)) between 1 and 60),
  tipo      text not null default 'outro' check (tipo in ('familia','membro','filho','outro')),
  perfil_id uuid references public.perfis(id) on delete set null,
  cor       text not null default '#64748B',
  ordem     int  not null default 0,
  ativo     boolean not null default true,
  criado_por uuid, criado_em timestamptz, alterado_por uuid, alterado_em timestamptz,
  versao int not null default 1
);

create table if not exists public.categorias (
  id        uuid primary key default gen_random_uuid(),
  tipo      text not null check (tipo in ('despesa','receita')),
  parent_id uuid references public.categorias(id) on delete restrict,
  nome      text not null check (length(trim(nome)) between 1 and 60),
  icone     text not null default 'ellipsis',
  cor       text not null default '#9CA3AF' check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  ordem     int  not null default 0,
  arquivada boolean not null default false,
  criado_por uuid, criado_em timestamptz, alterado_por uuid, alterado_em timestamptz,
  versao int not null default 1
);
create index if not exists categorias_parent_idx on public.categorias(parent_id);

create table if not exists public.contas (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null check (length(trim(nome)) between 1 and 60),
  tipo      text not null default 'corrente' check (tipo in ('corrente','poupanca','dinheiro','reserva','investimento','outro')),
  instituicao text,
  saldo_inicial_centavos bigint not null default 0,
  data_referencia date not null default current_date,
  cor       text not null default '#2563EB',
  icone     text not null default 'landmark',
  ordem     int not null default 0,
  arquivada boolean not null default false,
  criado_por uuid, criado_em timestamptz, alterado_por uuid, alterado_em timestamptz,
  versao int not null default 1
);

create table if not exists public.cartoes (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null check (length(trim(nome)) between 1 and 60),
  titular_id uuid references public.pessoas(id),
  limite_centavos bigint not null default 0 check (limite_centavos >= 0),
  dia_fechamento int not null check (dia_fechamento between 1 and 31),
  dia_vencimento int not null check (dia_vencimento between 1 and 31),
  conta_pagamento_id uuid references public.contas(id),
  cor       text not null default '#7C3AED',
  icone     text not null default 'credit-card',
  ordem     int not null default 0,
  arquivado boolean not null default false,
  criado_por uuid, criado_em timestamptz, alterado_por uuid, alterado_em timestamptz,
  versao int not null default 1
);

-- migração v1.1: ícone/logo do cartão (para bancos já criados)
alter table public.cartoes add column if not exists icone text not null default 'credit-card';

create table if not exists public.projetos (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null check (length(trim(nome)) between 1 and 80),
  descricao text,
  icone     text not null default 'rocket',
  cor       text not null default '#0EA5E9',
  valor_estimado_centavos bigint not null default 0 check (valor_estimado_centavos >= 0),
  data_alvo date,
  status    text not null default 'planejado' check (status in ('planejado','andamento','pausado','concluido')),
  responsaveis uuid[] not null default '{}',
  observacoes text,
  anexos    jsonb not null default '[]',
  ordem     int not null default 0,
  criado_por uuid, criado_em timestamptz, alterado_por uuid, alterado_em timestamptz,
  versao int not null default 1
);

create table if not exists public.projeto_tarefas (
  id         uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  titulo     text not null check (length(trim(titulo)) between 1 and 200),
  concluida  boolean not null default false,
  responsavel_id uuid references public.pessoas(id),
  prazo      date,
  ordem      int not null default 0,
  criado_por uuid, criado_em timestamptz, alterado_por uuid, alterado_em timestamptz,
  versao int not null default 1
);

create table if not exists public.metas (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null check (length(trim(nome)) between 1 and 80),
  tipo      text not null default 'economia' check (tipo in ('economia','emergencia','provisao')),
  valor_alvo_centavos bigint not null check (valor_alvo_centavos > 0),
  data_alvo date,
  conta_id  uuid references public.contas(id),
  icone     text not null default 'piggy-bank',
  cor       text not null default '#059669',
  observacoes text,
  arquivada boolean not null default false,
  criado_por uuid, criado_em timestamptz, alterado_por uuid, alterado_em timestamptz,
  versao int not null default 1
);

-- Aportes/resgates de reservas (metas e projetos). NÃO são despesas:
-- apenas separam (carimbam) dinheiro para um objetivo.
create table if not exists public.aportes (
  id         uuid primary key default gen_random_uuid(),
  meta_id    uuid references public.metas(id) on delete cascade,
  projeto_id uuid references public.projetos(id) on delete cascade,
  tipo       text not null default 'aporte' check (tipo in ('aporte','resgate')),
  valor_centavos bigint not null check (valor_centavos > 0),
  data       date not null,
  descricao  text,
  conta_id   uuid references public.contas(id),
  criado_por uuid, criado_em timestamptz, alterado_por uuid, alterado_em timestamptz,
  versao int not null default 1,
  check ((meta_id is null) <> (projeto_id is null))
);

create table if not exists public.orcamentos (
  id           uuid primary key default gen_random_uuid(),
  categoria_id uuid references public.categorias(id) on delete cascade,  -- null = orçamento geral da família
  mes          date check (mes is null or extract(day from mes) = 1),    -- null = vale para todos os meses
  valor_centavos bigint not null check (valor_centavos >= 0),
  criado_por uuid, criado_em timestamptz, alterado_por uuid, alterado_em timestamptz,
  versao int not null default 1
);
create unique index if not exists orcamentos_unq on public.orcamentos
  (coalesce(categoria_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(mes, '1900-01-01'::date));

create table if not exists public.recorrencias (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('receita','despesa')),
  descricao   text not null check (length(trim(descricao)) between 1 and 200),
  valor_centavos bigint not null check (valor_centavos > 0),
  categoria_id uuid references public.categorias(id),
  subcategoria_id uuid references public.categorias(id),
  conta_id    uuid references public.contas(id),
  cartao_id   uuid references public.cartoes(id),
  forma_pagamento text,
  pagador_id  uuid references public.pessoas(id),
  beneficiario_id uuid references public.pessoas(id),
  favorecido  text,
  projeto_id  uuid references public.projetos(id),
  observacoes text,
  etiquetas   text[] not null default '{}',
  frequencia  text not null check (frequencia in ('semanal','quinzenal','mensal','anual')),
  inicio      date not null,
  fim         date,
  ativa       boolean not null default true,
  criado_por uuid, criado_em timestamptz, alterado_por uuid, alterado_em timestamptz,
  versao int not null default 1,
  check (fim is null or fim >= inicio),
  check ((conta_id is null) <> (cartao_id is null))
);

-- ---------------------------------------------------------------------
-- 4. Lançamentos
-- ---------------------------------------------------------------------
create table if not exists public.lancamentos (
  id             uuid primary key default gen_random_uuid(),   -- gerado no navegador: evita duplicidade em cliques repetidos
  tipo           text not null check (tipo in ('receita','despesa','transferencia','pagamento_fatura','reembolso')),
  descricao      text not null check (length(trim(descricao)) between 1 and 200),
  valor_centavos bigint not null check (valor_centavos > 0 and valor_centavos < 10000000000000),
  categoria_id   uuid references public.categorias(id),
  subcategoria_id uuid references public.categorias(id),
  data_ocorrencia date not null,
  competencia    date not null check (extract(day from competencia) = 1),
  vencimento     date,
  data_efetiva   date,
  conta_id       uuid references public.contas(id),
  conta_destino_id uuid references public.contas(id),
  cartao_id      uuid references public.cartoes(id),
  fatura         date check (fatura is null or extract(day from fatura) = 1),
  forma_pagamento text check (forma_pagamento is null or forma_pagamento in
                   ('pix','debito','credito','dinheiro','boleto','transferencia','debito_automatico','outro')),
  status         text not null default 'efetivado' check (status in ('previsto','efetivado','cancelado')),
  pagador_id     uuid references public.pessoas(id),
  beneficiario_id uuid references public.pessoas(id),
  favorecido     text,
  projeto_id     uuid references public.projetos(id) on delete set null,
  observacoes    text,
  etiquetas      text[] not null default '{}',
  anexos         jsonb not null default '[]',
  recorrencia_id uuid references public.recorrencias(id) on delete set null,
  recorrencia_seq int,
  compra_id      uuid,
  parcela_num    int,
  parcelas_total int,
  origem_id      uuid references public.lancamentos(id) on delete set null,
  criado_por uuid, criado_em timestamptz, alterado_por uuid, alterado_em timestamptz,
  versao int not null default 1,
  excluido_em timestamptz, excluido_por uuid,

  constraint parcela_ok check (
    (parcela_num is null and parcelas_total is null)
    or (parcela_num between 1 and parcelas_total and parcelas_total between 1 and 120)),
  constraint receita_ok check (tipo <> 'receita' or
    (conta_id is not null and cartao_id is null and conta_destino_id is null)),
  constraint despesa_ok check (tipo <> 'despesa' or
    ((conta_id is null) <> (cartao_id is null) and conta_destino_id is null
     and (cartao_id is null or fatura is not null))),
  constraint transferencia_ok check (tipo <> 'transferencia' or
    (conta_id is not null and conta_destino_id is not null and conta_id <> conta_destino_id and cartao_id is null)),
  constraint pagamento_fatura_ok check (tipo <> 'pagamento_fatura' or
    (conta_id is not null and cartao_id is not null and fatura is not null and conta_destino_id is null)),
  constraint reembolso_ok check (tipo <> 'reembolso' or
    ((conta_id is null) <> (cartao_id is null) and conta_destino_id is null
     and (cartao_id is null or fatura is not null))),
  constraint efetivado_tem_data check (status <> 'efetivado' or cartao_id is not null and tipo <> 'pagamento_fatura'
     or data_efetiva is not null)
);
-- índice único completo (não parcial) para permitir "upsert ignorando duplicados" pela API
drop index if exists public.lancamentos_recorrencia_unq;
create unique index lancamentos_recorrencia_unq on public.lancamentos (recorrencia_id, recorrencia_seq);
create index if not exists lancamentos_competencia_idx on public.lancamentos (competencia);
create index if not exists lancamentos_efetiva_idx on public.lancamentos (data_efetiva);
create index if not exists lancamentos_cartao_idx on public.lancamentos (cartao_id, fatura);
create index if not exists lancamentos_compra_idx on public.lancamentos (compra_id);

-- ---------------------------------------------------------------------
-- 5. Configurações (linha única)
-- ---------------------------------------------------------------------
create table if not exists public.configuracoes (
  id int primary key default 1 check (id = 1),
  alerta_atencao_pct int not null default 80 check (alerta_atencao_pct between 1 and 200),
  alerta_limite_pct  int not null default 100 check (alerta_limite_pct between 1 and 300),
  horizonte_recorrencia_meses int not null default 12 check (horizonte_recorrencia_meses between 1 and 36),
  dias_aviso_vencimento int not null default 5 check (dias_aviso_vencimento between 0 and 60),
  criado_por uuid, criado_em timestamptz, alterado_por uuid, alterado_em timestamptz,
  versao int not null default 1
);

-- ---------------------------------------------------------------------
-- 6. Triggers
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['pessoas','categorias','contas','cartoes','projetos','projeto_tarefas','metas',
                           'aportes','orcamentos','recorrencias','lancamentos','configuracoes']
  loop
    execute format('drop trigger if exists t_autoria on public.%I', t);
    execute format('create trigger t_autoria before insert or update on public.%I
                    for each row execute function public.carimbar_autoria()', t);
    execute format('drop trigger if exists t_historico on public.%I', t);
    execute format('create trigger t_historico after insert or update or delete on public.%I
                    for each row execute function public.registrar_historico()', t);
  end loop;
end $$;

-- Novo usuário no Auth: só entra se o e-mail estiver autorizado.
create or replace function public.ao_criar_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare m public.membros_autorizados;
begin
  select * into m from public.membros_autorizados where email = lower(new.email);
  if not found then
    raise exception 'E-mail não autorizado para esta plataforma familiar.';
  end if;
  insert into public.perfis (id, email, nome) values (new.id, lower(new.email), m.nome)
    on conflict (id) do nothing;
  update public.pessoas set perfil_id = new.id
    where tipo = 'membro' and lower(nome) = lower(m.nome) and perfil_id is null;
  return new;
end $$;

drop trigger if exists t_ao_criar_usuario on auth.users;
create trigger t_ao_criar_usuario after insert on auth.users
  for each row execute function public.ao_criar_usuario();

-- Se o e-mail de alguém autorizado mudar no Auth, acompanha no perfil.
create or replace function public.ao_alterar_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    if not exists (select 1 from public.membros_autorizados where email = lower(new.email)) then
      raise exception 'Novo e-mail não autorizado. Cadastre-o antes em membros_autorizados.';
    end if;
    update public.perfis set email = lower(new.email) where id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists t_ao_alterar_email on auth.users;
create trigger t_ao_alterar_email after update of email on auth.users
  for each row execute function public.ao_alterar_email();

-- ---------------------------------------------------------------------
-- 7. Segurança (RLS)
-- ---------------------------------------------------------------------
alter table public.membros_autorizados enable row level security;  -- sem políticas: invisível pela API
alter table public.perfis    enable row level security;
alter table public.historico enable row level security;

drop policy if exists perfis_leitura on public.perfis;
create policy perfis_leitura on public.perfis for select to authenticated using (public.eh_membro());

drop policy if exists historico_leitura on public.historico;
create policy historico_leitura on public.historico for select to authenticated using (public.eh_membro());

do $$
declare t text;
begin
  foreach t in array array['pessoas','categorias','contas','cartoes','projetos','projeto_tarefas','metas',
                           'aportes','orcamentos','recorrencias','lancamentos','configuracoes']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists membros_tudo on public.%I', t);
    execute format('create policy membros_tudo on public.%I for all to authenticated
                    using (public.eh_membro()) with check (public.eh_membro())', t);
  end loop;
end $$;

-- permissões explícitas (o acesso real é decidido pelas políticas RLS acima)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.eh_membro() to authenticated;
revoke all on public.membros_autorizados from anon, authenticated;
revoke all on all tables in schema public from anon;
revoke insert, update, delete on public.historico, public.perfis from authenticated;
-- Configurações: linha única, não pode ser apagada pela API
revoke delete on public.configuracoes from authenticated;

-- ---------------------------------------------------------------------
-- 8. Restauração de backup (preserva autoria original, registra quem restaurou)
-- ---------------------------------------------------------------------
create or replace function public.restaurar_backup(dados jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  resultado jsonb := '{}'::jsonb;
  t text;
  n int;
begin
  if not public.eh_membro() then
    raise exception 'Acesso negado';
  end if;
  perform set_config('app.restaurando', 'on', true);
  foreach t in array array['pessoas','categorias','contas','cartoes','projetos','projeto_tarefas','metas',
                           'aportes','orcamentos','recorrencias','lancamentos']
  loop
    if dados ? t then
      if t = 'categorias' then
        -- categorias-mãe antes das subcategorias
        execute format($q$insert into public.%1$I select * from jsonb_populate_recordset(null::public.%1$I, $1)
                 order by parent_id nulls first on conflict (id) do nothing$q$, t) using dados->t;
      else
        execute format($q$insert into public.%1$I select * from jsonb_populate_recordset(null::public.%1$I, $1)
                 on conflict do nothing$q$, t) using dados->t;
      end if;
      get diagnostics n = row_count;
      resultado := resultado || jsonb_build_object(t, n);
    end if;
  end loop;
  perform set_config('app.restaurando', 'off', true);
  return resultado;
end $$;
revoke execute on function public.restaurar_backup(jsonb) from anon, public;
grant execute on function public.restaurar_backup(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 9. Anexos (Storage privado)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit)
      values ('anexos', 'anexos', false, 10485760)
      on conflict (id) do nothing;

    execute 'drop policy if exists anexos_membros_ler on storage.objects';
    execute 'create policy anexos_membros_ler on storage.objects for select to authenticated
             using (bucket_id = ''anexos'' and public.eh_membro())';
    execute 'drop policy if exists anexos_membros_enviar on storage.objects';
    execute 'create policy anexos_membros_enviar on storage.objects for insert to authenticated
             with check (bucket_id = ''anexos'' and public.eh_membro())';
    execute 'drop policy if exists anexos_membros_apagar on storage.objects';
    execute 'create policy anexos_membros_apagar on storage.objects for delete to authenticated
             using (bucket_id = ''anexos'' and public.eh_membro())';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 10. Sincronização em tempo real
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['pessoas','categorias','contas','cartoes','projetos','projeto_tarefas','metas',
                             'aportes','orcamentos','recorrencias','lancamentos','configuracoes']
    loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 11. Dados iniciais (cadastros — o ambiente real começa SEM movimentações)
-- ---------------------------------------------------------------------
insert into public.configuracoes (id) values (1) on conflict (id) do nothing;

insert into public.pessoas (nome, tipo, cor, ordem)
select * from (values ('Família','familia','#0F766E',0), ('Jesrrael','membro','#2563EB',1), ('Laucielly','membro','#DB2777',2)) v(nome,tipo,cor,ordem)
where not exists (select 1 from public.pessoas);

-- vincula pessoas aos perfis já existentes (caso os usuários tenham sido criados antes)
insert into public.perfis (id, email, nome)
select u.id, lower(u.email), m.nome from auth.users u
join public.membros_autorizados m on m.email = lower(u.email)
on conflict (id) do nothing;
update public.pessoas p set perfil_id = pf.id from public.perfis pf
where p.tipo = 'membro' and lower(p.nome) = lower(pf.nome) and p.perfil_id is null;

do $$
declare
  cat record;
  pid uuid;
  sub text;
  i int := 0;
  j int;
begin
  if exists (select 1 from public.categorias) then return; end if;
  for cat in select * from (values
    ('despesa','Moradia','house','#2563EB','Aluguel|Financiamento|Condomínio|Água|Energia|Gás|Internet|Manutenção|Móveis'),
    ('despesa','Supermercado','shopping-cart','#16A34A','Compras do mês|Feira|Açougue|Padaria|Produtos de limpeza'),
    ('despesa','Alimentação fora e delivery','utensils','#F97316','iFood|Restaurantes|Lanches|Cafés'),
    ('despesa','Veículos e transporte','car','#0F766E','Combustível|Seguro|IPVA|Licenciamento|Manutenção|Estacionamento|Aplicativos'),
    ('despesa','Educação','book-open','#7C3AED','Colégio|Curso de inglês|Material escolar|Livros|Outros cursos'),
    ('despesa','Saúde','heart-pulse','#EC4899','Plano de saúde|Consultas|Exames|Medicamentos|Dentista|Terapia'),
    ('despesa','Esportes e atividade física','dumbbell','#65A30D','Academia|Escolinhas esportivas|Mensalidades|Equipamentos'),
    ('despesa','Vestuário','shirt','#C026D3','Roupas|Calçados|Acessórios'),
    ('despesa','Lazer e passeios','ticket','#EAB308','Cinema|Eventos|Passeios|Atividades em família'),
    ('despesa','Serviços domésticos','brush-cleaning','#14B8A6','Diarista|Lavanderia|Jardinagem|Outros serviços'),
    ('despesa','Cuidados pessoais','scissors','#A78BFA','Cabeleireiro|Barbearia|Cosméticos|Higiene pessoal'),
    ('despesa','Assinaturas e tecnologia','tablet-smartphone','#4F46E5','Streaming|Aplicativos|Softwares|Armazenamento digital'),
    ('despesa','Viagens','plane','#0EA5E9','Passagens|Hospedagem|Alimentação em viagem|Passeios em viagem'),
    ('despesa','Presentes e comemorações','gift','#FB7185','Aniversários|Presentes|Festas'),
    ('despesa','Contribuições e doações','hand-heart','#CA8A04','Dízimos|Ofertas|Doações|Ações solidárias'),
    ('despesa','Pets','paw-print','#92400E','Alimentação|Veterinário|Cuidados'),
    ('despesa','Tributos e serviços financeiros','file-text','#64748B','Impostos|Tarifas|Juros|Encargos de cartão'),
    ('despesa','Outros','ellipsis','#9CA3AF',''),
    ('receita','Salários','briefcase','#059669',''),
    ('receita','Aulas particulares','presentation','#0891B2',''),
    ('receita','Cursos e mentorias','graduation-cap','#6366F1',''),
    ('receita','Prestação de serviços','wrench','#D97706',''),
    ('receita','Rendimentos','trending-up','#65A30D',''),
    ('receita','Outras receitas','circle-plus','#6B7280','')
  ) v(tipo, nome, icone, cor, subs)
  loop
    i := i + 1;
    insert into public.categorias (tipo, nome, icone, cor, ordem) values (cat.tipo, cat.nome, cat.icone, cat.cor, i)
      returning id into pid;
    j := 0;
    if cat.subs <> '' then
      foreach sub in array string_to_array(cat.subs, '|') loop
        j := j + 1;
        insert into public.categorias (tipo, parent_id, nome, icone, cor, ordem) values (cat.tipo, pid, sub, cat.icone, cat.cor, j);
      end loop;
    end if;
  end loop;
end $$;
