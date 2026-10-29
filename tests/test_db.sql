\set ON_ERROR_STOP 1
\set QUIET 1
-- usuários
insert into auth.users(id,email) values ('11111111-1111-1111-1111-111111111111','Jesrrael.Santos@gmail.com'),('22222222-2222-2222-2222-222222222222','laucielly@teste.com');
select 'perfis criados', count(*) from perfis;
select 'pessoas vinculadas', count(*) from pessoas where perfil_id is not null;
-- intruso
do $$ begin insert into auth.users(email) values ('intruso@x.com'); raise exception 'FALHA: intruso entrou'; exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; raise notice 'OK intruso bloqueado: %', sqlerrm; end $$;

-- Jesrrael cria conta e despesa, tentando forjar autoria
set role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111"}',false);
insert into contas(id,nome,saldo_inicial_centavos,data_referencia) values ('aaaaaaaa-0000-0000-0000-000000000001','Nubank',100000,'2026-10-01');
insert into lancamentos(id,tipo,descricao,valor_centavos,data_ocorrencia,competencia,data_efetiva,conta_id,status,criado_por,criado_em,pagador_id)
values ('bbbbbbbb-0000-0000-0000-000000000001','despesa','Mercado',12590,'2026-10-28','2026-10-01','2026-10-28','aaaaaaaa-0000-0000-0000-000000000001','efetivado','22222222-2222-2222-2222-222222222222','2000-01-01',(select id from pessoas where nome='Laucielly'));
select 'autor (esperado 1111…)', criado_por, versao, criado_em > now() - interval '1 min' as recente from lancamentos where id='bbbbbbbb-0000-0000-0000-000000000001';
-- clique repetido: mesmo id -> conflito de PK (cliente trata como sucesso)
do $$ begin insert into lancamentos(id,tipo,descricao,valor_centavos,data_ocorrencia,competencia,data_efetiva,conta_id) values ('bbbbbbbb-0000-0000-0000-000000000001','despesa','Mercado',12590,'2026-10-28','2026-10-01','2026-10-28','aaaaaaaa-0000-0000-0000-000000000001'); exception when unique_violation then raise notice 'OK duplicidade bloqueada'; end $$;

-- Laucielly vê e altera
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222"}',false);
select 'Laucielly enxerga', count(*) from lancamentos;
update lancamentos set valor_centavos=13000, criado_por='22222222-2222-2222-2222-222222222222' where id='bbbbbbbb-0000-0000-0000-000000000001' and versao=1;
select 'após edição', criado_por = '11111111-1111-1111-1111-111111111111' autor_preservado, alterado_por, versao from lancamentos where id='bbbbbbbb-0000-0000-0000-000000000001';
-- edição concorrente com versão velha não afeta nada
with u as (update lancamentos set valor_centavos=99 where id='bbbbbbbb-0000-0000-0000-000000000001' and versao=1 returning 1) select 'linhas afetadas c/ versão velha (esperado 0)', count(*) from u;
-- lixeira não conta como alteração
update lancamentos set excluido_em = now() where id='bbbbbbbb-0000-0000-0000-000000000001';
select 'lixeira', excluido_por, alterado_por from lancamentos where id='bbbbbbbb-0000-0000-0000-000000000001';
update lancamentos set excluido_em = null where id='bbbbbbbb-0000-0000-0000-000000000001';
-- histórico
select 'historico', acao, usuario from historico where registro_id='bbbbbbbb-0000-0000-0000-000000000001' order by id;
-- validações
do $$ begin insert into lancamentos(tipo,descricao,valor_centavos,data_ocorrencia,competencia,conta_id,conta_destino_id,data_efetiva) values ('transferencia','x',100,'2026-10-01','2026-10-01','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','2026-10-01'); raise exception 'FALHA'; exception when check_violation then raise notice 'OK transferência para mesma conta bloqueada'; end $$;
do $$ begin insert into lancamentos(tipo,descricao,valor_centavos,data_ocorrencia,competencia,conta_id,data_efetiva) values ('despesa','x',-5,'2026-10-01','2026-10-01','aaaaaaaa-0000-0000-0000-000000000001','2026-10-01'); raise exception 'FALHA'; exception when check_violation then raise notice 'OK valor negativo bloqueado'; end $$;
do $$ begin insert into lancamentos(tipo,descricao,valor_centavos,data_ocorrencia,competencia,conta_id,status) values ('despesa','x',5,'2026-10-01','2026-10-01','aaaaaaaa-0000-0000-0000-000000000001','efetivado'); raise exception 'FALHA'; exception when check_violation then raise notice 'OK pago sem data bloqueado'; end $$;
do $$ begin insert into historico(tabela,registro_id,acao) values ('x','1','fake'); raise exception 'FALHA'; exception when insufficient_privilege then raise notice 'OK histórico não pode ser forjado'; end $$;

-- usuário autenticado mas não membro (ex.: alguém criado antes da lista) não vê nada
select set_config('request.jwt.claims','{"sub":"99999999-9999-9999-9999-999999999999"}',false);
select 'não-membro enxerga', count(*) from lancamentos;
do $$ begin insert into contas(nome) values ('hack'); raise exception 'FALHA'; exception when insufficient_privilege then raise notice 'OK não-membro não grava'; end $$;
reset role;
set role anon;
do $$ begin perform count(*) from lancamentos; raise exception 'FALHA'; exception when insufficient_privilege then raise notice 'OK anônimo sem acesso'; end $$;
reset role;

-- backup/restore preserva autoria
set role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222"}',false);
select 'restore', restaurar_backup(jsonb_build_object('lancamentos', jsonb_build_array(jsonb_build_object('id','cccccccc-0000-0000-0000-000000000001','tipo','receita','descricao','Salário','valor_centavos',500000,'data_ocorrencia','2026-10-05','competencia','2026-10-01','data_efetiva','2026-10-05','conta_id','aaaaaaaa-0000-0000-0000-000000000001','status','efetivado','criado_por','11111111-1111-1111-1111-111111111111','criado_em','2026-10-05T10:00:00Z','versao',1,'etiquetas','{}','anexos','[]'))));
select 'restaurado autor', criado_por, criado_em from lancamentos where id='cccccccc-0000-0000-0000-000000000001';
select 'restaurando ainda on? (esperado off)', current_setting('app.restaurando', true);
