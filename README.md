# GESTÃO FAMILIAR DE FINANÇAS E PROJETOS
*As finanças e os planos do nosso lar, em um só lugar*

Plataforma web de uso exclusivo de **Jesrrael** e **Laucielly**: receitas, despesas, contas, cartões, parcelamentos, recorrências, calendário, gráficos, orçamento, metas, projetos familiares, relatórios, importação/exportação e backup.

- **Endereço:** https://prof-jazz.github.io/gestao-familiar/
- **Demonstração (dados fictícios, separada do real):** https://prof-jazz.github.io/gestao-familiar/?demo
- **Banco e login:** Supabase, projeto `gestao-familiar` (região São Paulo, ref `zuhcxnywzfyhkkszkcfa`)

---

## 1. Como funciona a segurança

| Item | Como está feito |
|---|---|
| Login | E-mail e senha individuais (Supabase Auth). Recuperação de senha por e-mail. |
| Quem pode entrar | Apenas os e-mails da tabela `membros_autorizados` (jesrrael.santos@gmail.com e lau.crisspdr@gmail.com). Cadastro público **desativado**. Qualquer outra conta é recusada pelo banco. |
| Proteção dos dados | Row Level Security em todas as tabelas: sem login de membro, a API responde 401. Esconder botões não é usado como proteção. |
| Autoria | `criado_por`, `criado_em`, `alterado_por`, `alterado_em` são gravados **pelo servidor** (trigger) a partir da sessão. O que o navegador enviar nesses campos é ignorado. |
| Histórico | Toda inclusão, alteração, exclusão e restauração fica na tabela `historico` (não editável pela API). |
| Edição simultânea | Cada registro tem `versao`. Se a outra pessoa salvou antes, a gravação é recusada com aviso — nada é sobrescrito em silêncio. |
| Clique duplo / rede instável | O identificador de cada lançamento é gerado no navegador; reenviar não duplica. |
| Dinheiro | Sempre em centavos (inteiros). Parcelas somam exatamente o total. |
| Anexos | Bucket privado `anexos`, só membros leem/enviam; links temporários de 5 minutos. |
| Chaves | O `config.js` contém apenas a chave **publicável** (feita para o navegador). Nenhuma chave secreta está no código. |

## 2. Criar os acessos de Jesrrael e Laucielly (passo obrigatório)

1. Abra o Supabase → projeto **gestao-familiar** → **Authentication → Users**.
2. Clique em **Add user → Create new user**.
3. E-mail: `jesrrael.santos@gmail.com`, escolha uma senha (mín. 8 caracteres) e marque **Auto Confirm User**. Clique em **Create user**.
4. Repita para `lau.crisspdr@gmail.com`.
5. Cada um entra no site com seu e-mail e senha. A senha pode ser trocada em **Configurações → Minha conta**.

> Se tentar criar um usuário com outro e-mail, o banco recusa (“E-mail não autorizado”). Para autorizar um novo e-mail no futuro: SQL Editor →
> `insert into membros_autorizados (email, nome) values ('novo@email.com', 'Nome');`

## 3. Recuperação de senha (“Esqueci minha senha”) — dependência externa

O envio de e-mail usa o servidor de e-mail padrão do Supabase, que **só entrega para membros da organização do Supabase** e tem limite de poucos e-mails por hora.

- Para o Jesrrael (dono da organização) funciona como está.
- Para a Laucielly receber o e-mail de recuperação, faça **uma** das opções:
  - **Opção A (mais simples):** Supabase → *Organization settings → Team* → convide `lau.crisspdr@gmail.com` como membro (papel *Read-only* basta).
  - **Opção B (recomendada a longo prazo):** configurar um SMTP próprio em *Authentication → Emails → SMTP Settings* (ex.: Gmail com senha de app, ou Resend gratuito).
- Enquanto isso, quem esquecer a senha pode tê-la redefinida pelo outro em *Authentication → Users → (usuário) → Reset password / Send password recovery*.

## 4. Publicação no GitHub Pages

O site é estático (sem etapa de build). Para publicar ou atualizar:

1. Repositório `Prof-Jazz/gestao-familiar` com o conteúdo da pasta `web/` na raiz (já contém `index.html`, `config.js`, `.nojekyll`).
2. *Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`*.
3. Em 1–2 minutos o site fica em https://prof-jazz.github.io/gestao-familiar/.

O repositório é **público** (exigência do Pages gratuito). Isso é seguro: não há segredos no código, e os dados só saem do banco para as duas contas autorizadas.

## 5. Recriar o banco do zero (se precisar)

Supabase → SQL Editor → cole todo o arquivo `supabase/schema.sql` → *Run*. Ele cria tabelas, regras de segurança, triggers, histórico, bucket de anexos, tempo real e as categorias iniciais. O ambiente real começa **sem nenhuma movimentação**.

## 6. Conceitos que a plataforma respeita

- **Consumo por competência** (gráficos de categoria, orçamento): compras e parcelas no mês a que pertencem — inclui cartão, **não** inclui pagamento de fatura.
- **Fluxo de caixa** (receitas recebidas, despesas pagas, resultado do mês): dinheiro que entrou/saiu das contas — inclui pagamento de fatura, **não** inclui a compra no cartão.
- Cada indicador mostra o selo da base usada; as bases nunca são misturadas.
- **Transferências** entre contas não são receita nem despesa.
- **Reservas** (aportes em metas/projetos) não são despesa. O gasto do projeto entra uma única vez nos totais.
- **Previstos** (contas a pagar, recorrências) só afetam o saldo realizado quando marcados como pagos; aparecem na **projeção**.
- **Reembolso/estorno** reduz a despesa da categoria original, sem inflar receitas.

## 7. O que NÃO está ativo (dependências externas)

- Notificações fora da plataforma (e-mail/WhatsApp/push): não implementadas. Os alertas aparecem dentro do painel.
- Integração bancária automática: não implementada (extensão futura). Use lançamentos manuais ou **Importar CSV**.
- E-mail de recuperação para a Laucielly: depende do item 3.
- O plano gratuito do Supabase **pausa o projeto após 7 dias sem uso**; basta reativar no painel. Backups diários automáticos existem só no plano Pro — use *Configurações → Backup* periodicamente.

## 8. Logos de bancos

Ao cadastrar ou editar uma **conta** ou um **cartão**, o campo *Ícone* oferece os logos de Nubank, Inter, Itaú, Banco do Brasil, Caixa, Santander, PicPay, Mercado Pago e Hotmart (arquivos em `img/bancos/`). Ao digitar o nome (ex.: “Conta Itaú”), o logo e a cor são sugeridos automaticamente — dá para trocar à vontade. Para incluir outro banco: salve um PNG quadrado em `img/bancos/<id>.png` e acrescente uma linha na lista `LOGOS` em `js/ui/comp.js`.

## 9. Estrutura do código

```
supabase/schema.sql        banco: tabelas, RLS, triggers de autoria/histórico, categorias iniciais
web/index.html             entrada do site (Preact + htm, sem build)
web/config.js              URL e chave publicável do Supabase
web/js/lib/calc.js         motor de cálculo (saldos, bases, faturas, parcelas, recorrências, projeção)
web/js/lib/fmt.js          moeda R$, datas DD/MM/AAAA, fuso America/Sao_Paulo
web/js/data/               backend Supabase, backend de demonstração, estado e ações
web/js/ui/                 telas
tests/                     testes do cálculo, do banco e ponta a ponta (dois usuários)
```

### Testes executados
- `tests/calc.test.mjs` — 11 testes do motor de cálculo.
- `tests/test_db.sql` — autoria pelo servidor, bloqueio de intrusos, histórico, validações, concorrência.
- `tests/e2e.mjs` — 31 verificações com o app real em dois navegadores (desktop e celular), cobrindo os 11 cenários do enunciado.
