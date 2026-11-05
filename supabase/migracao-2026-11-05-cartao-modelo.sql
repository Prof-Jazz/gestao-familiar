-- Migração 05/11/2026: modelo visual do cartão + limite só do principal
alter table public.cartoes add column if not exists modelo text;
alter table public.cartoes add column if not exists limite_so_principal boolean not null default false;
alter table public.lancamentos add column if not exists juros_centavos bigint not null default 0;
do $$ begin
  alter table public.lancamentos add constraint juros_ok check (juros_centavos >= 0 and juros_centavos <= valor_centavos);
exception when duplicate_object then null; end $$;
notify pgrst, 'reload schema';
