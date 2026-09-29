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
- Não mexer no Google Apps Script. O `gestao.html` saiu do site (Backup 13); cópia só para testes em `sistema/testes/gestao-teste.html`.
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
- Edge Functions (`supabase/functions/`), nomes exatos: **erp-emails**, **erp-publicacoes**, **erp-cnpj**, **erp-agenda**, **erp-backup**, **erp-pgfn**.
  Todas aceitam `{acao:'ping'}` e têm `const VERSAO`. Autenticação: header `x-erp-segredo`
  (`config_privada.segredo_funcoes`, usado pelo cron) ou JWT de admin.
- Rotinas (pg_cron, UTC): e-mails, publicações, regras de tarefas, `erp_mensalidades` (09:30),
  `erp_cnpj` (09:00 = 6h de Brasília), `erp_pgfn` (09:15), `erp_fotos_mensais` (dia 1, 10:00).

## Arquitetura do front (`sistema/app/`)
- `index.html` = ERP. **Gerado** a partir de `#Sistemas/2 - ERP/ERP.html` + remendos em
  `sistema/ferramentas/montar-erp.js` (`trocar(de, para, vezes)`, `depoisDe`, `removerBloco`). Não editar à mão.
- `erp-dados.js`: ponte ERP ↔ Supabase. `editor.js`: formulários/ações das linhas. `erp-telas.js`: barra superior,
  MENU, `TELAS_GS` (painéis do ERP que são desenhados pelas telas do Gestão), `+ Lançar`.
- Telas "do Gestão" (`nucleo.js`, `graficos.js`, `telas-*.js`) viram o pacote `gestao-embutida.js` (lista de
  arquivos em `montar-erp.js`) e expõem `window.GS`. Tela nova: criar `telas-x.js` com `TELAS.x`, incluir na lista
  do bundle, no `testes/gestao-teste.html` (script) e em `TELAS_GS` do `erp-telas.js` (menu de cima está no limite: prefira ⋯ ou botão na tela).
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

## Padrões de tela (desde o Backup 10)
- Cores: só em `tokens.css` (fonte única; inclui `--chart-*` dos gráficos, `--sp-*`, `--fs-*`, `--on-cor`, `--primario`, `--bar-bg`).
  O modo escuro (`html[data-tema=escuro]`, preto desde o Backup 18) troca os tokens; o que sobra de cor fixa no HTML antigo é gerado por
  `ferramentas/tema-escuro.js` — não escreva regras escuras à mão, salvo exceções pontuais.
- Desenho único (Backup 18): `design.css` é a ÚLTIMA camada (cartão, KPI com pontinho de cor, tabela de cabeçalho claro, botões,
  pílulas, janelas). Só `var(--…)` lá. Gráficos Chart.js: `pluginTema` (erp-telas.js) troca a cor fixa pelo token do mesmo matiz.
- Lista vazia: `vazio(frase, rótulo, seletorDoBotão)`. Relatório com CSV: `relatorioTabela({titulo, colunas, linhas, ids})`.
- Tabelas longas paginam sozinhas (100) — `paginarTabelas` no `nucleo.js`. No celular (≤600px) viram cartões (`rotularTabelas`).
- Clientes nas listas usam `window.ERP_COLS_CLIENTE` (sem `cnpj_dados`); coluna nova em `clientes` → incluir lá (o teste avisa).
- `carregarCadastros()` guarda 60 s; depois de gravar use `carregarCadastros(true)`.
- Arquivos em `vendor/`, `.js` e `.css` recebem `?v=hash` no build e ficam em cache por 1 ano (`vercel.json`, os dois).
- **Defeito visual:** rode `node sistema/testes/caca-bugs.js` (entra no `rodar-tudo.sh`; tem que dar "nenhuma ocorrência").
- **Automação nova:** linha em `regras_tarefas` (chave, nome, descrição, `grupo` tarefas|cliente_email|integracao, `ligada`, `dias`) +
  gatilho/trecho em `rodar_regras_tarefas`; tarefas via `tarefa_da_regra` (registra em `automacoes_log` pelo prefixo da chave),
  e-mail ao cliente via `email_ao_cliente` (nunca repete o mesmo `ref`). Mapear o prefixo em `PREFIXO_AUTOMACAO` (telas-automacoes.js).
- **Gravação nova em tabela de cadastro:** passa pelo `sb.from()` normal — o modo rascunho intercepta sozinho (tabelas em
  `TABELAS_RASCUNHO` no nucleo.js e `funcao_da_tabela` no SQL). Baixa (pago) sempre via `perguntarBaixa`.
- Plano de migração das telas antigas: `sistema/INVENTARIO-SIMPLIFICACAO.md`. Custos das integrações pagas: `sistema/INTEGRACOES-CUSTOS.md`.

## Estado atual (atualizar a cada entrega)
- Última entrega: **Backup 18 — Design** (só visual): tokens sóbrios + escuro preto, `design.css`, cores soltas dos CSS viraram tokens,
  gráficos com `--chart-*` e sem animação, `tema-escuro.js` sem tons azulados. Diagnóstico em `sistema/DIAGNOSTICO-DESIGN-B18.md`.
  `estrutura.sql` sem mudança (4556 linhas).
- Backup 17 (base): Início: `cardResumoEscritorio` sem Processos (atraso/hoje/5 dias no mesmo cartão), `buscaPubAutomatica`
  (DJEN pelo navegador 1×/dia, localStorage `erp_pub_auto`). Painel "Empresas do grupo" = visual de Processos (#tblExecRanking em erp-telas.css).
  Acordos: lista `.acx-*` no remendo `acordos-b16.js`. CRM: 8 etapas abertas (nova "Follow-up da proposta", ordem 5), finais viram faixa
  `.cr-solte` (4+4 por linha em `crmFunil`). E-mails: `emails_central` devolve `contato`/`finalidade` (coluna "E-mail de destino"),
  `previa_email_manual` e `previa_email_modelo` (prévia com a marca). Publicações: destinatários com "Autor:/Réu:" (polo A/P), `partesPub`,
  função com timeout (`AbortSignal.timeout`, VERSAO 2026-10-02). PGFN: `cabecalhoPgfn` lê o CSV do site Dívida Aberta. Contratos: ficha
  (`.ctr-ficha`), tabela `contratos_aditivos` + `registrar_aditivo(p_contrato, p jsonb)`; `valor_competencia` usa o valor anterior ao aditivo.
  Prompt da rodada de design: `sistema/PROMPT-DESIGN-BACKUP-18.md`. `estrutura.sql` = 4556 linhas.
- Backup 16 (base): Início home (`cardResumoEscritorio`, `cardLembretes` + tabela `lembretes`; guias de parcelamento viraram
  lembrete: regra `parcela_parcelamento` não cria tarefa, marca `parcelas.emissao='SIM'`; fila exclui `cob:|parc:|aco:`). Painel: selos
  (CAPAG/situação/grupo 124px, caixa alta) em erp-telas.css. Processos: análise sem duplicar número (sócio+PJ). Publicações: `partes_monitoradas`
  (busca `nomeParte` no DJEN), `acao:'diagnostico'`, busca pelo navegador (`buscarPubNoNavegador`, CSP libera comunicaapi). Acordos: remendo
  `ferramentas/remendos/acordos-b16.js` (`_acordosPendentes`, tabela "Acordos em andamento"). Financeiro: `legendaLanc`/`_legLanc` (área — contrato),
  gráficos das abas fora (`mCh` ignora `cFin*/cRec*/cPrej*/cFcFech*/cFcCaixaCat` + CSS :has), `edicaoLancamentos` (tabela + planilha por id).
  CRM: etapas Contrato fechado/Aguardando assinatura/Contrato assinado/Lead perdido (`crm_etapas.dias_alerta`, `descricao`), `crm_ganhar` novo
  (modalidade, área, tarefa `crm-contrato:`), `crm_followup_email`, regras `crm_parada`/`crm_followup` em `rodar_regras_extras()` (gancho no
  fim de `rodar_regras_tarefas`), `htmlProposta` com a marca. Central de e-mails (`telas-emails.js`, painel `emails`): `emails_pendentes()` é a
  fonte única (rotina e tela), `emails_modelos` editáveis, 3 avisos de atraso, `emails_central*`, `salvar_config_emails` (cron `erp_emails_cliente`),
  recibo com `recibo_dados`/`valor_extenso` e PDF montado na erp-emails (`pdfRecibo`, `email_fila.anexo`). `email_cliente_enviar` tem 10 parâmetros
  (p_anexo). Tarefas: `interpretarRapida`, vista `semana`, carga (`configuracoes.carga_horas`), pular recorrência, relatório por cliente,
  resumo diário 8h. Geradores: `ferramentas/montar-geradores.js` copia os HTML de #Sistemas para `app/geradores/` + `ponte.js` (login,
  cliente, guardar em Documentos); `peticao.html` novo; contas dos advogados em `configuracoes.geradores_bancos` (dados-recibos.sql).
  PGFN grátis: `pgfn_importar_abertos` + leitura de CSV no navegador (Alertas → Rotinas).
- Backup 15 (base): fila/calendário/mural, `servico` (Área do serviço), CRM em abas, Tarefas em abas, alerta vira tarefa.
- Backup 14 (base): perfil de e-mail por cliente, `usuarios_previstos`, fotos mensais/Evolução, OFX (`telas-ofx.js`), PGFN (`erp-pgfn`),
  ficha da tarefa `abrirTarefa`, `pessoasEscritorio`/`selectPessoa`, Clientes "Por grupo" e "Editar em tabela".
- Documentos: `sistema/PROXIMOS-PASSOS.md`, `sistema/VIABILIDADE-INTEGRACOES.md` (RFB/SERPRO, PGFN pela API, SIARE, Sicoob OFX/API).
- Funções do Supabase: erp-emails (recibo em PDF no Backup 16), erp-publicacoes (partes/diagnóstico no Backup 16; timeout e polo no Backup 17), erp-cnpj, erp-agenda, erp-backup, erp-pgfn.
- Aguardando o usuário: criar as 4 contas (Administração → Usuários → Acessos combinados); contratar a API "Consulta Dívida Ativa"
  do SERPRO e salvar a chave em Alertas → PGFN; Integra Contador depois; boletos: não por enquanto; Financeiro: 9 sugestões aguardando
  escolha (não executar sem autorização).
- Próxima rodada sugerida: aprovar a Central de e-mails (depois apagar a tela antiga), tirar "Progresso por acordo" após aprovação.
