# ERP Araújo & Castro — sistema novo (sem planilha)

Sistema online com login: abre no navegador, no computador ou no celular.
Os dados ficam num banco de dados PostgreSQL no **Supabase** (servidor em São Paulo)
e as telas ficam hospedadas na **Vercel**. Não usa Google Sheets nem Apps Script.

| Pasta | O que é |
|---|---|
| `banco/estrutura.sql` | Tabelas, regras automáticas (parcelas do contrato, histórico) e regras de acesso |
| `app/` | As telas (HTML/CSS/JS). `config.js` guarda o endereço do Supabase |
| `testes/` | Testes automáticos do banco e das telas (rodam sem internet) |

## O que já faz

Menu no mesmo formato do ERP antigo:

- **Início**: resumo do mês das duas empresas (jurídico e contabilidade), atrasados e próximos 15 dias.
- **Painel Executivo**: passivo tributário consolidado (PGFN, AGE/MG, RFB, SEFAZ/MG), passivo por grupo,
  distribuição por órgão e a lista de empresas com CAPAG, situação cadastral e procuração.
- **Honorários Jurídico** e **Honorários Contabilidade**: abas Análise, A Receber, Recebidos, Prejuízo,
  A Pagar e Despesas pagas; baixa com um clique; situação de cobrança ("Cobrado", "Emitir guia"…);
  despesas recorrentes; filtros por mês, grupo e pessoa.
- **Contratos**: ao criar, as parcelas entram sozinhas em Honorários Jurídico.
- **Clientes**: cadastro completo da Base de Dados (débitos, procuração, certificado, CAPAG…).
- **Administração** (admin): Usuários · **Importar planilhas** (Base de Dados, Financeiro e Financeiro -
  Contabilidade, baixadas do Google Sheets em .xlsx) · **Backup** (Excel e .json) · **Histórico**
  (toda gravação, com autor, horário e o que mudou).

A coluna **Senha** da Base de Dados não é importada.

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

## Atualizar o banco depois de uma versão nova
Quando o sistema ganhar campos novos, cole de novo o `banco/estrutura.sql` inteiro no SQL Editor
do Supabase e clique em Run. É seguro: o arquivo só cria o que falta e não apaga dados.

## Testes
`testes/rodar-tudo.sh` recria um banco local que imita o Supabase (PostgreSQL + PostgREST) e roda
os testes de permissão do banco (21), do importador com planilhas fictícias (36) e das telas num
navegador com os mesmos cabeçalhos de segurança da Vercel (40). Precisa de `NODE_PATH` com
`playwright` e `exceljs`.

Bibliotecas incluídas em `app/vendor/` (licença MIT): supabase-js 2.117.2 e ExcelJS 4.4.0
(esta só é carregada nas telas de importação e backup).
