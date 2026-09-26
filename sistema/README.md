# ERP Araújo & Castro — sistema novo (sem planilha)

Sistema online com login: abre no navegador, no computador ou no celular.
Os dados ficam num banco de dados PostgreSQL no **Supabase** (servidor em São Paulo)
e as telas ficam hospedadas na **Vercel**. Não usa Google Sheets nem Apps Script.

| Pasta | O que é |
|---|---|
| `banco/estrutura.sql` | Tabelas, regras automáticas (parcelas do contrato, histórico) e regras de acesso |
| `app/` | As telas (HTML/CSS/JS). `config.js` guarda o endereço do Supabase |
| `testes/` | Testes automáticos do banco e das telas (rodam sem internet) |

## O que já faz (fase 1)

- **Login** com e-mail e senha; usuário novo só entra depois que o administrador libera.
- **Clientes**: cadastro com grupo, CPF/CNPJ, tipo, responsável e contato.
- **Contratos**: ao criar, as parcelas entram sozinhas no Financeiro; lançamento de êxito avulso.
- **Financeiro**: receitas e despesas por mês, baixa com um clique, despesas recorrentes,
  filtros (em aberto, pagos, em atraso) e busca.
- **Início**: recebido, a receber, a pagar, em atraso e saldo do mês; lista do que está atrasado
  e do que vence nos próximos 15 dias.
- **Usuários** (admin): libera, bloqueia e define quem é administrador.
- **Histórico**: toda inclusão, alteração e exclusão fica registrada (quem, quando, o quê).

## Quem pode o quê

| Papel | Pode |
|---|---|
| Administrador | Tudo, inclusive excluir clientes/contratos e liberar usuários |
| Equipe | Cadastra, edita e dá baixa; não exclui cliente nem contrato |
| Inativo | Não entra (todo usuário novo começa assim) |

A regra fica **no banco** (Row Level Security): mesmo quem descobrir a chave pública do
projeto não lê nada sem um login liberado.

## Instalação (uma vez só)

### 1. Supabase — o banco de dados
1. Acesse <https://supabase.com> → **Start your project** → entre com a conta do GitHub.
2. **New project**: nome `erp-araujo-castro`; em **Database Password** clique em *Generate*
   e guarde a senha num lugar seguro; em **Region** escolha **South America (São Paulo)**.
3. Aguarde uns 2 minutos até o projeto ficar pronto.
4. Menu da esquerda → **SQL Editor** → cole todo o conteúdo de `banco/estrutura.sql` → **Run**.
   Deve aparecer "Success".
5. Menu **Authentication** → **Sign In / Providers** → desligue **Allow new users to sign up**
   → **Save**. (Assim ninguém cria conta sozinho.)
6. **Authentication** → **Users** → **Add user** → **Create new user**: seu e-mail e uma senha
   forte, marque **Auto Confirm User** → **Create user**. O primeiro usuário vira administrador.
7. **Project Settings** (engrenagem) → **API Keys** (ou **Data API**): copie a **Project URL** e a
   chave **publishable** / **anon public**. Nunca use a chave *secret* / *service_role* nas telas.

### 2. Configurar as telas
Coloque a URL e a chave em `app/config.js`.

### 3. Vercel — as telas no ar
1. Acesse <https://vercel.com> → **Sign Up** → **Continue with GitHub**.
2. **Add New… → Project** → escolha o repositório **ERP** → **Import**.
3. Em **Root Directory** clique em *Edit* e escolha `sistema/app`. Framework: **Other**.
4. **Deploy**. Ao terminar, a Vercel mostra o endereço do sistema (ex.: `erp-xxxx.vercel.app`).

Cada alteração aprovada no GitHub (botão **Merge**) é publicada sozinha em cerca de 1 minuto.

## Cadastrar outra pessoa
No Supabase: **Authentication → Users → Add user** (marque *Auto Confirm User*).
Depois, no sistema, menu **Usuários**, troque de *Inativo* para *Equipe*.

## Custos
Supabase e Vercel têm plano gratuito suficiente para começar. Para dados de clientes em uso
diário, recomenda-se o plano **Pro do Supabase** (backup diário automático; projetos gratuitos
pausam após 7 dias sem uso). Confira os preços atuais nos sites antes de assinar.

## Testes
`testes/rodar-tudo.sh` recria um banco local que imita o Supabase e roda os testes de
permissão (21) e das telas num navegador (25).
