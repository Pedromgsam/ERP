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
  (permissoes.sql, fluxo.sql [fluxo cliente → financeiro], importador, e-mails, telas.js [Gestão], erp.js [ERP com cliques reais], visual.js).
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
- Última entrega: **Backup 26** (SQL + funções erp-emails, erp-cnpj, erp-agenda). Fluxo cliente → financeiro:
  contrato `status='Aguardando assinatura'` (não lança nada; `lancar_parcelas_contrato`, `gerar_mensalidades` pula) → `contrato_assinar(id)` ou lead em
  etapa final 'ganho' (`crm_assina_contrato`) → gatilho `contrato_assinado` (parcelas/mensalidades, onboarding via `onboarding_pendente`, notificação,
  CRM, interação, boas-vindas `email_bv` se a regra `email_boas_vindas` — desligada — estiver ligada). `crm_ganhar` cria o contrato aguardando.
  Gerador: `abrirGeradorContrato(cli, ctr)` → `ponte.js` lê `?contrato=` e chama `G.preencherContrato` (montar-geradores.js); minuta HTML não conclui
  a tarefa `anexo:`. Contatos: setores geral|financeiro|fiscal|rh|socio|juridico|contador, `contatos.recebe text[]` (cobranca|recibo|guia|acordo|contrato|convite,
  sincroniza `recebe_boletos/notificacoes`), `configuracoes.emails_destino` (tipo→setor), `contato_do_cliente(cli,grp,tipo)` devolve email (vários = vírgula),
  nome, setor, origem (marcado|setor|geral|cadastro); `emails_pendentes` usa finalidade = tipo (cobranca/guia/acordo); perfil `nada`; `emails_controle()` +
  `contato_recebe()` (Central → "Quem recebe o quê", `controleEmails`/`janelaControleCliente` em telas-emails.js). Avisos de atraso em sequência.
  Cadastro: seções, `ORIGENS_CLIENTE`, `clientes.indicado_por`, `clientes_mesmo_documento()`, e-mail do cadastro → contato Geral (`origem_cadastro`),
  sócios do cartão CNPJ (`cnpj_dados.socios` → `vinculos_societarios`). Reunião: tabela `reunioes` (tarefa `reuniao:<id>:<nome>` por participante,
  `crm_atividades`, etapa "Diagnóstico agendado", convite `email_cv` com anexo `{tipo:'ics'}` só se `convite`), `formReuniao`/`htmlReunioes` (telas-crm.js),
  erp-agenda inclui reuniões. Linha do tempo com categorias (telas-cliente360.js). Delegar: `modelos_fluxo.sequencial` ("Lead completo"),
  `delegar_sequencia`, status `aguardando` → `tarefa_libera_proxima`, `tarefa_validar(id, aprovar, comentário)`, `minhas_validacoes()` → `cardValidacoes`
  (#ini-valid no Início), `janelaDelegar`/`janelaDevolver` (telas-tarefas.js); `depende_de` trava no banco. Teste novo `testes/fluxo.sql` (no rodar-tudo).
  Lista para aprovar: `sistema/SIMPLIFICACAO-SUGESTOES.md` (nada removido).
- Backup 25 (base). SQL: `parcelamentos.emitimos_guia` (padrão true; false = o cliente emite; o aviso de guias do Início só
  conta os true). **Lista por grupo única** para Parcelamentos e Acordos: `remendos/lista-grupos-b25.js` (`_lgRender`, `_lgProx` = soma das
  parcelas do mês da próxima, `_lgSit` = "N em atraso" + risco quando o item tem ≥2), injetado antes do remendo de acordos. Parcelamentos:
  itens montados em `renderParcAnalise`, filtro `_parcF.guia`, janela `_parcAbrir` com "Guias deste parcelamento" (`window.SB` update).
  Acordos: `_acVisao`, `_acGrpAbertos`, `_acAbrir(k)` (janela `.pcd`), atraso inclui o dia. CSS `.lg-*` no fim do design.css; `#alertParc`,
  `#alertAcordos` e `.pa-nota` escondidos; Início com 5 tamanhos (teste em padrao.js).
- Backup 24 (base, sem SQL). Início: o destaque `guias` voltou para a faixa de `cardMural` (lista `.ini-guias` com `data-guia-ok`),
  o cartão de Lembretes ficou só com lembretes. Painel: `.res-graficos` (cResGrupos/cResDonut) escondido (ids mantidos para o JS do ERP).
  (O prompt `sistema/PROMPT-AUTOMACAO.md` foi executado no Backup 26.)
- Backup 23 (base). SQL: `excluir_usuario(p_perfil)` (admin; não a si mesmo nem o último admin; apaga auth.users → perfis em
  cascata). Início: `cardMural` = só a faixa de destaques; `cardLembretes` (cartão próprio, `#ini-lembretes`: guias, lembretes ≤7 dias/sem prazo/
  fixos e "Mais adiante"), `detalheLembrete`, `botoesLembrete` (`.lemb-fixo.on`); `dadosLembretes` devolve vis/futuros/todos. Selo da pessoa:
  pílula 11 px, 88 px, contorno `color-mix` (design.css); `_faSelo` não é usado para grupo/cliente (montar-erp). Sem `.alerta-tri`. Painel:
  `_orgV(r,k)` = em aberto + negociado (rosca e órgão da empresa), `_quebraRotulo` nos rótulos do gráfico. Parcelamentos: grupos recolhidos
  (`_parcGrpAbertos`), `_parcF` (filtros grupo/pag/prox/sit), `_parcAbrir(k)` = janela `.pcd`. Acordos: `.ac-saldo-linha` escondida.
  Tarefas: Grupo·Tarefa·Pessoa·Prioridade·Status·Prazo (régua: "Prazo" = `col-venc`). Clientes: `pillSimNao` verde/vermelho, `SITCAD_COR`.
  Escuro: tokens grafite (bg #15171C, surface #1C1F26) + `tema-escuro.js` com tons de grafite. Imagem do Parcelamentos do Backup 17:
  `sistema/prototipos/parcelamentos-backup17.png`.
- Backup 22 (base): padronização (prompt em `sistema/PROMPT-BACKUP-22.md`). **Régua única:** `marcarColunas()` (erp-telas.js, no
  MutationObserver) reconhece a coluna pelo título (`REGUA`: Vencimento/Pago em → `col-venc`, Valor/Total/Saldo → `col-valor`, Atraso/Dias →
  `col-dias`, Grupo/Devedor/Credor/Empresa/Cliente/Nome → `col-nome`) em toda `.tw/.tabela-wrap/.gx-tab-gs table`; o estilo fica no bloco "RÉGUA
  ÚNICA" do design.css (13 px, sub 12 px, venc/valor negrito, nomes CAIXA ALTA, selo da pessoa 92 px, `.alerta-tri`). Coluna nova com esses
  títulos já sai no padrão; **não** escreva font-size/cor inline em célula. Teste `testes/padrao.js` (no rodar-tudo) mede as telas e exige
  um estilo único por tipo. Botões da linha: "✓ Baixa" + "✎" (`.btn-ed`). PIX removido (SQL dropa `pix_copia_cola`/`crc16_ccitt`).
  Parcelamentos: `renderParcAnalise` = lista `.pcx` (modelo acordos, `_parcVisao` grupo/lista, `_parcAtraso`, `_parcProxima`); saíram
  Saldo residual e "Progresso por parcelamento" (escondido). Acordos: `_acProx30` (#acProx30), `.ac-saldo-linha`. Início: lembretes/fila do B20.
- Backup 21 (base): ajustes finos (sem SQL). `dbERP()` no erp-telas.js (o `DB` do ERP é const global, NÃO `window.DB` — por isso
  grupos/filtros/ficha do Painel falhavam). `tabelaPadrao` aceita `popup` (Processos abre `GS().abrirJanela`). Lembretes: `.lemb-ok` (○ conclui),
  ações ao passar o mouse; `infoI` = "?" com balão CSS (`data-dica`). Início: Atrasados empilhados (`.ini-atraso-pilha`), linha `data-linha-det` →
  `detalheLancamento`. Régua de dias: `_diasCls` (remendo acordos) e `celulaAtraso` — vencido (inclui hoje) `dias-r`, <3 `dias-a`, <10 `dias-b`,
  ≥10 `dias-g`. Acordos: `_acSaldoDevedor` (`.acs-*`), "Progresso por acordo" escondido, A Pagar sem Situação. Publicações: `#pub-trib` (segmento só
  com tribunais de publicações nova/lida). Filtros de período sem emoji (montar-erp). `#gx-linha-painel` em `position:absolute`.
- Backup 20 (base): padrão único. SQL: `lembretes` com `dia` opcional, `fixo`, `destaque` (''|vermelho|amarelo|verde|azul|roxo),
  `origem` (mural copiado como `mural:<id>`); `crc16_ccitt`, `pix_copia_cola(chave,nome,cidade,valor,txid)` (igual ao `pixCopiaECola` do nucleo.js;
  `dados_pagamento.cidade`), bloco PIX no `email_cliente_html`. Início: sem +Receita/+Despesa/+Contrato, `cardMural` = Lembretes (`formLembrete`,
  `htmlLembretes`, `DESTAQUES_LEMB`), recados fora, `infoI(chave)`/`EXPLICA` (tooltips ⓘ). Pagamentos: `tabelaLancamentos` (Quem·Grupo·Descrição·
  Valor·Vencimento·Atraso, `celulaAtraso`, lote `.lote-barra`/`data-lote`, botão `data-pix` → `janelaPix`). erp-telas.js: `tabelaPadrao(tbody,o)`
  (coluna ▸ `gx-seta`, `tr.gx-grp` por grupo, `tr.gx-det`), `padraoEmpresas`/`padraoProcessos` (filtros `#pe-filtros`, `#pr-visao`, `kNeg`),
  `acoesNoLugar` (alertas/botões à direita das abas do Financeiro), `acoesNaSituacao`/`devolverAoBanner` (Acordos/Parcelamentos); `subnavJuridico`
  e a área "antiga" da Central saíram. CSS do bloco "Backup 20" no fim do design.css (mod-banner escondido nessas telas, `.gx-seg-cli`, `.gx-rank`).
  Colunas com ▸ deslocam o nth-child (+1). `estrutura.sql` = 4681 linhas. Protótipo "Progresso por acordo" só em imagem (aguardando aprovação).
- Backup 19 (base): enxuto (prompt em `sistema/PROMPT-BACKUP-19.md`). SQL: pausa de e-mails (`configuracoes.emails_pausados`,
  trigger `email_fila_reter` → status `retido`; `pausar_emails`, `emails_retidos_acao(ids,'liberar'|'descartar')`, flag de sessão
  `erp.liberar_email`), `confirmar_email_usuario(perfil)` (admin libera a entrada sem o e-mail de confirmação). Testes rodam com a pausa
  desligada (`preparar-banco.sh`). Central de e-mails com abas (`AREAS_EMAIL`: fila/clientes/config/avisos/antiga; `pintarAreaEmail`,
  `pintarAdmin` redesenha a aba da Central quando está lá). Início: `cardMural` junta lembretes/guias (`dadosLembretes`, `htmlLembretes`),
  `coletarAlertas` sem o que o Início já mostra, `plural(n, um, varios)` no nucleo.js. Parcelamentos: remendo `remendos/parcelamentos-b19.js`
  (`_parcTodos`, `filtrarParc` = `_filtrarParcBase` sem concluídos, `renderParcAnalise` por grupo → órgão, `_parcDias`, `_parcDetalhe`).
  Acordos: `_acTodos`/`_acCaixaTodos` no remendo. Financeiro: `_faTabelaAtraso`, total no comparativo por pessoa, `cFaMes`/`cFcMes` com as
  cores próprias (pluginTema pula). Jurídico: `subnavJuridico` (erp-telas.js). Tabelas: `--th-bg/--th-fg` (navy). `estrutura.sql` = 4626 linhas.
- Backup 18 (base): design — tokens sóbrios + escuro preto, `design.css`, cores soltas dos CSS viraram tokens,
  gráficos com `--chart-*` e sem animação, `tema-escuro.js` sem tons azulados. Diagnóstico em `sistema/DIAGNOSTICO-DESIGN-B18.md`.
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
- Próxima rodada sugerida: o usuário responder a `SIMPLIFICACAO-SUGESTOES.md` (números aprovados) e executar; tirar "Progresso por acordo" após aprovação.
