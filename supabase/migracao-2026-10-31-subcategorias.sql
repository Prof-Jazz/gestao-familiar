-- Migração 2026-10-31: ícones próprios nas subcategorias + novas subcategorias com logos de serviços.
-- Idempotente: só troca o ícone de subcategorias que ainda usam o ícone da categoria-mãe (não mexe no que você personalizou)
-- e só cria subcategorias que ainda não existem (pelo nome).
with m(mae, sub, icone, ordem) as (values
  ('Moradia', 'Aluguel', 'key', 1),
  ('Moradia', 'Financiamento', 'landmark', 2),
  ('Moradia', 'Condomínio', 'building-2', 3),
  ('Moradia', 'Água', 'droplet', 4),
  ('Moradia', 'Energia', 'marca:cemig', 5),
  ('Moradia', 'Gás', 'flame', 6),
  ('Moradia', 'Internet', 'marca:algar', 7),
  ('Moradia', 'Manutenção', 'hammer', 8),
  ('Moradia', 'Móveis', 'sofa', 9),
  ('Supermercado', 'Compras do mês', 'shopping-basket', 1),
  ('Supermercado', 'Feira', 'apple', 2),
  ('Supermercado', 'Açougue', 'beef', 3),
  ('Supermercado', 'Padaria', 'croissant', 4),
  ('Supermercado', 'Produtos de limpeza', 'spray-can', 5),
  ('Alimentação fora e delivery', 'iFood', 'marca:ifood', 1),
  ('Alimentação fora e delivery', 'Restaurantes', 'chef-hat', 2),
  ('Alimentação fora e delivery', 'Lanches', 'sandwich', 3),
  ('Alimentação fora e delivery', 'Cafés', 'coffee', 4),
  ('Veículos e transporte', 'Combustível', 'fuel', 1),
  ('Veículos e transporte', 'Seguro', 'shield-check', 2),
  ('Veículos e transporte', 'IPVA', 'receipt', 3),
  ('Veículos e transporte', 'Licenciamento', 'badge-check', 4),
  ('Veículos e transporte', 'Manutenção', 'wrench', 5),
  ('Veículos e transporte', 'Estacionamento', 'square-parking', 6),
  ('Veículos e transporte', 'Aplicativos', 'car-taxi-front', 7),
  ('Veículos e transporte', 'Uber', 'marca:uber', 8),
  ('Veículos e transporte', 'Sem Parar', 'marca:sem-parar', 9),
  ('Educação', 'Colégio', 'school', 1),
  ('Educação', 'Curso de inglês', 'languages', 2),
  ('Educação', 'Material escolar', 'pencil', 3),
  ('Educação', 'Livros', 'book', 4),
  ('Educação', 'Outros cursos', 'graduation-cap', 5),
  ('Saúde', 'Plano de saúde', 'shield-plus', 1),
  ('Saúde', 'Consultas', 'stethoscope', 2),
  ('Saúde', 'Exames', 'microscope', 3),
  ('Saúde', 'Medicamentos', 'pill', 4),
  ('Saúde', 'Dentista', 'smile', 5),
  ('Saúde', 'Terapia', 'brain', 6),
  ('Esportes e atividade física', 'Academia', 'dumbbell', 1),
  ('Esportes e atividade física', 'Escolinhas esportivas', 'trophy', 2),
  ('Esportes e atividade física', 'Mensalidades', 'calendar-check', 3),
  ('Esportes e atividade física', 'Equipamentos', 'bike', 4),
  ('Vestuário', 'Roupas', 'shirt', 1),
  ('Vestuário', 'Calçados', 'footprints', 2),
  ('Vestuário', 'Acessórios', 'watch', 3),
  ('Lazer e passeios', 'Cinema', 'clapperboard', 1),
  ('Lazer e passeios', 'Eventos', 'party-popper', 2),
  ('Lazer e passeios', 'Passeios', 'trees', 3),
  ('Lazer e passeios', 'Atividades em família', 'users', 4),
  ('Serviços domésticos', 'Diarista', 'sparkles', 1),
  ('Serviços domésticos', 'Lavanderia', 'washing-machine', 2),
  ('Serviços domésticos', 'Jardinagem', 'flower-2', 3),
  ('Serviços domésticos', 'Outros serviços', 'wrench', 4),
  ('Cuidados pessoais', 'Cabeleireiro', 'scissors', 1),
  ('Cuidados pessoais', 'Barbearia', 'user-round', 2),
  ('Cuidados pessoais', 'Cosméticos', 'gem', 3),
  ('Cuidados pessoais', 'Higiene pessoal', 'bath', 4),
  ('Assinaturas e tecnologia', 'Streaming', 'tv', 1),
  ('Assinaturas e tecnologia', 'Aplicativos', 'smartphone', 2),
  ('Assinaturas e tecnologia', 'Softwares', 'laptop', 3),
  ('Assinaturas e tecnologia', 'Armazenamento digital', 'cloud', 4),
  ('Assinaturas e tecnologia', 'Netflix', 'marca:netflix', 5),
  ('Assinaturas e tecnologia', 'Spotify', 'marca:spotify', 6),
  ('Assinaturas e tecnologia', 'Prime Video', 'marca:prime-video', 7),
  ('Assinaturas e tecnologia', 'Disney+', 'marca:disney-plus', 8),
  ('Assinaturas e tecnologia', 'HBO Max', 'marca:hbo-max', 9),
  ('Assinaturas e tecnologia', 'YouTube Premium', 'marca:youtube', 10),
  ('Assinaturas e tecnologia', 'ChatGPT', 'marca:chatgpt', 11),
  ('Assinaturas e tecnologia', 'Claude', 'marca:claude', 12),
  ('Assinaturas e tecnologia', 'Adobe', 'marca:adobe', 13),
  ('Assinaturas e tecnologia', 'Foxit', 'marca:foxit', 14),
  ('Viagens', 'Passagens', 'plane-takeoff', 1),
  ('Viagens', 'Hospedagem', 'hotel', 2),
  ('Viagens', 'Alimentação em viagem', 'utensils', 3),
  ('Viagens', 'Passeios em viagem', 'map', 4),
  ('Presentes e comemorações', 'Aniversários', 'cake', 1),
  ('Presentes e comemorações', 'Presentes', 'gift', 2),
  ('Presentes e comemorações', 'Festas', 'party-popper', 3),
  ('Contribuições e doações', 'Dízimos', 'church', 1),
  ('Contribuições e doações', 'Ofertas', 'hand-coins', 2),
  ('Contribuições e doações', 'Doações', 'heart-handshake', 3),
  ('Contribuições e doações', 'Ações solidárias', 'hand-heart', 4),
  ('Pets', 'Alimentação', 'bone', 1),
  ('Pets', 'Veterinário', 'stethoscope', 2),
  ('Pets', 'Cuidados', 'paw-print', 3),
  ('Tributos e serviços financeiros', 'Impostos', 'landmark', 1),
  ('Tributos e serviços financeiros', 'Tarifas', 'receipt', 2),
  ('Tributos e serviços financeiros', 'Juros', 'percent', 3),
  ('Tributos e serviços financeiros', 'Encargos de cartão', 'credit-card', 4)
)
, atualizadas as (
  update public.categorias s set icone = m.icone
  from m, public.categorias p
  where s.parent_id = p.id and p.parent_id is null and p.tipo = 'despesa' and p.nome = m.mae
    and lower(s.nome) = lower(m.sub) and s.icone = p.icone and s.icone <> m.icone
  returning s.id
)
, novas as (
  insert into public.categorias (tipo, parent_id, nome, icone, cor, ordem)
  select p.tipo, p.id, m.sub, m.icone, p.cor, 100 + m.ordem
  from m join public.categorias p on p.nome = m.mae and p.parent_id is null and p.tipo = 'despesa'
  where not exists (select 1 from public.categorias s where s.parent_id = p.id and lower(s.nome) = lower(m.sub))
  returning id
)
select (select count(*) from atualizadas) as icones_atualizados, (select count(*) from novas) as subcategorias_criadas;
