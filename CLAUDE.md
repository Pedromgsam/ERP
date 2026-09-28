# ERP Araújo & Castro — contexto para o Claude

Lido automaticamente no início de cada conversa. Mantenha atualizado a cada entrega (seção "Estado atual").

## Quem é o usuário e como falar com ele
- Dono do escritório Araújo & Castro (advocacia e contabilidade). **Não é programador.**
- Responder sempre em **português simples**, com passo a passo numerado e onde clicar.
- Ele faz o Merge das PRs. Nunca fazer merge por ele.

## Regras que valem sempre
- **Segurança:** a chave secreta (service_role/secret) nunca vai para o site, o repositório ou o chat.
  O site usa só a publishable key (`sistema/app/config.js`). Operações privilegiadas ficam em Edge Functions
  ou RPC `security definer`; segredos ficam em `config_privada` (RLS sem policy) ou nos secrets do Supabase.
- **LGPD:** repositório privado; testes só com dados fictícios; nunca importar a coluna "Senha" da planilha.
- Não mexer no Google Apps Script. Manter `sistema/app/gestao.html` até ele mandar apagar.
- **SQL idempotente** (`sistema/banco/estrutura.sql`, arquivo único, pode rodar várias vezes).
- Custos: avisar o preço antes de sugerir qualquer serviço pago.
- Não incluir identificação de modelo em commits/PRs/código.

## Como entregar (toda mudança)
1. Trabalhar no branch indicado pela sessão; rodar todos os testes (abaixo) até passar.
2. `node sistema/ferramentas/montar-erp.js` depois de mexer em qualquer `sistema/app/*.js|css` (gera `index.html`,
   `gestao-embutida.js`, `gs.css`).
3. Atualizar `sistema/COMO-ATUALIZAR.md` e `backups/LEIA-ME.md` (nova linha na tabela).
4. Commit → `sh sistema/ferramentas/novo-backup.sh "Nome da alteração"` → commit do zip → push → PR.
5. Resposta ao usuário: link da PR, **nº de linhas do estrutura.sql** (`wc -l`), e a ordem:
   **1) Merge  2) SQL no Supabase (Raw → Ctrl+A/Ctrl+C → conferir a última linha → Run)  3) Ctrl+Shift+R**,
   mais "publicar/atualizar a função X" quando uma Edge Function mudar (Verify JWT desligado).

## Infraestrutura
- Supabase: `https://kukpiyqwtaeuvkvfrjjm.supabase.co` (Postgres, Auth, Storage privado "documentos", pg_cron, pg_net).
- Vercel publica `sistema/app/` (headers em `sistema/app/vercel.json`).
- Edge Functions (`supabase/functions/`), nomes exatos: **erp-emails**, **erp-publicacoes**, **erp-cnpj**.
  Todas aceitam `{acao:'ping'}` e têm `const VERSAO`. Autenticação: header `x-erp-segredo`
  (`config_privada.segredo_funcoes`, usado pelo cron) ou JWT de admin.
- Rotinas (pg_cron, UTC): e-mails, publicações, regras de tarefas, `erp_mensalidades` (09:30),
  `erp_cnpj` (09:00 = 6h de Brasília).

## Arquitetura do front (`sistema/app/`)
- `index.html` = ERP. **Gerado** a partir de `#Sistemas/2 - ERP/ERP.html` + remendos em
  `sistema/ferramentas/montar-erp.js` (`trocar(de, para, vezes)`, `depoisDe`, `removerBloco`). Não editar à mão.
- `erp-dados.js`: ponte ERP ↔ Supabase. `editor.js`: formulários/ações das linhas. `erp-telas.js`: barra superior,
  MENU, `TELAS_GS` (painéis do ERP que são desenhados pelas telas do Gestão), `+ Lançar`.
- Telas "do Gestão" (`nucleo.js`, `graficos.js`, `telas-*.js`) viram o pacote `gestao-embutida.js` (lista de
  arquivos em `montar-erp.js`) e expõem `window.GS`. Tela nova: criar `telas-x.js` com `TELAS.x`, incluir na lista
  do bundle, no `gestao.html` (script + botão) e em `MENU`/`TELAS_GS` do `erp-telas.js`.
- Permissões: `pode(função, nível)` no front; no banco `pode()`, `eh_equipe()`, `eh_admin()` + RLS.
- CSS: `estilo.css` (Gestão, escopado para `gs.css`), `erp-telas.css`, `editor.css`.

## Módulos existentes
Início · Painel Executivo · Jurídico (Processos, Parcelamentos, Publicações) · **Acordos** (dívida do cliente com
terceiros, fora do financeiro) · Financeiro (Jurídico, Contabilidade; comissão = redutor de receita) ·
**Contratos** (Serviço pontual com parcelas; Consultoria com mensalidade fixa ou em salários mínimos, gerada por
`gerar_mensalidades` até a rescisão; tabela `salarios_minimos`) · Clientes (ficha 360°) · CRM · Documentos ·
Tarefas · **Alertas** (cartões por setor + rotina do cartão CNPJ) · Notificações · Administração
(usuários/funções, importação com "Substituir" via `limpar_importados`, backup, e-mail, histórico).

## Testes (`sistema/testes/`, sem internet)
- Precisam de: PostgreSQL 16 na porta **54329**, PostgREST na **3001** (`testes/postgrest.conf`) e
  `node servidor-local.js` (porta **8090**; simula Supabase, Edge Functions, DJEN e BrasilAPI).
- `NODE_PATH` com `playwright` e `exceljs`. Rodar tudo: `sh sistema/testes/rodar-tudo.sh`
  (permissoes.sql, importador, e-mails, telas.js [Gestão], erp.js [ERP com cliques reais], visual.js).
- O `servidor-local.js` guarda as funções carregadas em memória: reinicie-o depois de mudar uma Edge Function.
- `FOTOS=/pasta node erp.js` salva prints das telas para conferência visual.

## Estado atual (atualizar a cada entrega)
- Última entrega: **Backup 09** — PR https://github.com/Pedromgsam/ERP/pull/11 (Alertas, Acordos autônomo,
  contratos de consultoria, cartão CNPJ diário, ajustes do Painel/Financeiro/barra). `estrutura.sql` = 2039 linhas.
- Aguardando o usuário: dizer **qual API de CNPJ** usa no Google Sheets (hoje: BrasilAPI por padrão; ReceitaWS e
  CNPJá suportadas, token em Alertas → Cartão CNPJ).
- Próxima rodada: `sistema/PROMPT-MELHORIAS.md` — prompt único, numa conversa só, fases A→E
  (A design = foco principal, B desempenho, C simplificação, D integrações, E segurança).
