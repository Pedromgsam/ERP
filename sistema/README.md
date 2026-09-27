# ERP Araújo & Castro — sistema novo (sem planilha)

Sistema online com login: abre no navegador, no computador ou no celular.
Os dados ficam num banco de dados PostgreSQL no **Supabase** (servidor em São Paulo)
e as telas ficam hospedadas na **Vercel**. Não usa Google Sheets nem Apps Script.

| Pasta | O que é |
|---|---|
| `banco/estrutura.sql` | Tabelas, regras automáticas (histórico, baixa) e regras de acesso |
| `app/index.html` | **O ERP** — o mesmo HTML do ERP antigo, gerado por `ferramentas/montar-erp.js` |
| `app/erp-dados.js` | Ponte ERP ↔ Supabase: entrega os dados no formato que o ERP sempre usou |
| `app/editor.js` | Formulários: lançar, editar, dar baixa (✎ e ✓ em cada linha, botão **+ Lançar**) |
| `app/erp-telas.js` | Barra superior e as telas Início, Clientes, Contratos, Tarefas e Administração |
| `app/gestao.html` | Gestão antigo (mantido por segurança; usa os mesmos dados) |
| `testes/` | Testes automáticos do banco e das telas (rodam sem internet) |

## Como funciona

**O ERP é o mesmo.** Telas, filtros, gráficos, PDF, Portal do Cliente e todas as regras de cálculo
continuam as do `ERP.html` — por exemplo, a dívida de pessoa física (CPF sem sócio) **não** é somada
no total do grupo, a dívida negociada entra no total, e processos repetidos (polo ativo/passivo) são
contados uma vez. Só a origem dos dados mudou: em vez do Apps Script, o `erp-dados.js` lê do Supabase.

**Menu** (barra superior): Início · Painel Executivo · Jurídico (Processos, Acordos, Parcelamentos) ·
Financeiro (Honorários Jurídico, Honorários Contabilidade, Contratos, Notificações e recibos) · Clientes ·
Tarefas · Administração (só admin). No celular: menu inferior (Início, Painel, Honorários, Lançar, Mais).

**Lançar e editar** (tudo grava direto no banco e o ERP se atualiza sozinho):

- Botão **+ Lançar** (canto superior direito): honorário, despesa, cliente, processo, acordo,
  parcelamento, contrato, tarefa.
- Em cada linha das tabelas: **✎** edita e **✓ Baixa** marca como pago hoje (nas contas em aberto).
- Depois de gravar, o rodapé mostra "✓ Última gravação: hora — o quê" (na baixa, com **Desfazer**).
- No formulário, o admin vê **🕘 Ver alterações**: quem mudou o quê naquele registro.
- Contratos: ao cadastrar, as parcelas entram sozinhas em Honorários Jurídico, com grupo e responsável.
- Administração: **Usuários** (criar, trocar papel, grupos do Portal, link de nova senha),
  **Importar planilhas**, **Backup** e **Histórico**.
- Excluir: só o administrador.
- "Salvar rascunho no Gmail" virou **Abrir e-mail** já preenchido no seu programa de e-mail.

Passo a passo para atualizar e para voltar a uma versão anterior: `COMO-ATUALIZAR.md`.

**Módulos**: Base de Dados (clientes), Processos, Parcelamentos (com parcelas), Acordos,
Honorários Jurídico, Honorários Contabilidade e Tarefas.

**Importar** (Gestão → Administração → Importar): aceita as planilhas baixadas em .xlsx —
1 Base de Dados, 2 Processos, 3 Parcelamentos Tributários, 4 Acordos, 7 Financeiro,
12 Financeiro - Contabilidade e 15 Tarefas. Pode importar de novo: o que já veio é atualizado,
não duplicado. A coluna **Senha** da Base de Dados não é importada.

**Portal do Cliente**: usuário com papel `cliente` vê só os grupos liberados para ele
(tabela `perfil_grupos`), sem financeiro, observações internas nem dados bancários.

## Quem pode o quê

| Papel | Pode |
|---|---|
| Administrador | Tudo, inclusive excluir clientes/contratos e liberar usuários |
| Equipe | Cadastra, edita e dá baixa; não exclui cliente, processo, acordo nem parcelamento |
| Cliente | Só consulta os próprios grupos no Portal do Cliente |
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
Passo a passo detalhado: `sistema/COMO-ATUALIZAR.md`.

Quando o sistema ganhar campos novos, cole de novo o `banco/estrutura.sql` inteiro no SQL Editor
do Supabase e clique em Run. É seguro: o arquivo só cria o que falta e não apaga dados.

Depois, cole também o `banco/dados-recibos.sql` (dados dos advogados usados nos recibos: nome,
OAB, CPF, endereço). Eles ficam no banco, e não no HTML do site, porque o HTML é público; no banco
só a equipe logada consegue ler.

## Testes
`testes/rodar-tudo.sh` recria um banco local que imita o Supabase (PostgreSQL + PostgREST) e roda
os testes de permissão do banco (36), do importador com planilhas fictícias (51), da Gestão (44) e do
ERP (63, inclusive a regra PF × PJ) num navegador com os mesmos cabeçalhos de segurança da Vercel. Precisa de `NODE_PATH` com
`playwright` e `exceljs`.

Bibliotecas incluídas em `app/vendor/` (licença MIT): supabase-js 2.117.2, Chart.js 4.4.1 e ExcelJS 4.4.0
(esta só é carregada nas telas de importação e backup).

## Mudar o visual do ERP
Edite `#Sistemas/2 - ERP/ERP.html` e rode `node sistema/ferramentas/montar-erp.js` para gerar de novo o
`app/index.html`. Se um trecho que o montador procura mudou, ele avisa e não gera nada pela metade.
