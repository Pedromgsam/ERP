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
- Edge Functions (`supabase/functions/`), nomes exatos: **erp-emails**, **erp-publicacoes**, **erp-cnpj**, **erp-agenda**, **erp-backup** (erp-pgfn saiu no Backup 41).
  Todas aceitam `{acao:'ping'}` e têm `const VERSAO`. Autenticação: header `x-erp-segredo`
  (`config_privada.segredo_funcoes`, usado pelo cron) ou JWT de admin.
- Rotinas (pg_cron, UTC): e-mails, publicações, regras de tarefas, `erp_mensalidades` (09:30),
  `erp_cnpj` (09:00 = 6h de Brasília), `erp_avisos_agenda` (5 min).

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
  (permissoes.sql, fluxo.sql [fluxo cliente → financeiro], importador, e-mails, telas.js [Gestão], erp.js [ERP com cliques reais], visual.js, velocidade.js [tempos, Backup 51]).
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
  e-mail ao cliente via `email_ao_cliente` (nunca repete o mesmo `ref`). (A tela Automações saiu no Backup 55; e-mails ao cliente ligam/desligam em Administração → E-mail → Automáticos.)
- **Gravação nova em tabela de cadastro:** `sb.from()` normal (o modo rascunho saiu no Backup 41). Baixa (pago) sempre via `perguntarBaixa`.
- Plano de migração das telas antigas: `sistema/INVENTARIO-SIMPLIFICACAO.md`. Custos das integrações pagas: `sistema/INTEGRACOES-CUSTOS.md`.

## Estado atual (atualizar a cada entrega)
- Última entrega: **Backup 55** (SQL; nenhuma função nova). Régua (erp-telas.js `REGUA`): `col-grupo` (some com `table.tem-faixa`, posto quando há `tr.gx-grp|cli-grp|rt-grp`), `col-doc` (CPF/CNPJ mono 11,5 px),
  `col-texto` (natureza/autor/réu…: nowrap + "…" + `title`), `col-num` (processo/parcela nowrap); bloco "Backup 55" no fim do design.css (td 8 px, th 11,5 px). Início: `fin-pagar` = "A pagar · Contabilidade"
  (só `empresa='contabilidade'`, exige `financeiro_contab`). Tarefas: `.fila-2x2` em `max-content max-content`; sem ⚡ (`interpretarRapida`/`ligarCriacaoRapida` saíram); `.tf-linha2` (progresso + cliente). Acordos:
  `tr.ac-ap-lin[data-ac-id]` → `tr.ac-ed-linha` com `[data-ac-ed=parcela|acordo]` (remendo acordos-b35.js). Rotina: confirm em `[data-conferir]`/`[data-conf-grp]`; colunas `.rt-w-*` novas (Processos `rt-w-ult`);
  Planilha `igualarCabs()` + `.pl-barra-x` sticky. SQL: `alter database … set timezone 'America/Sao_Paulo'` (rodar-tudo exporta `TZ`), `limpar_emails_antigos()` + cron `erp_limpeza_emails` (dia 1º; NÃO apagar automacoes_log = trava
  de repetição). `telas-automacoes.js` apagado (sem `TELAS.automacoes`); e-mail: tipos só em `admEmailAuto` (sem `.em-tipos` em Quem recebe). Limpeza: backups 01–45 fora da pasta (histórico git), prompts em `sistema/arquivo/`.
  Não feito: enxugar funções repetidas do estrutura.sql (regravação bloqueada pela proteção do ambiente) e apagar branches antigos (proxy sem permissão; o usuário apaga em GitHub → Branches).
- Backup 54.1 (só docs): o merge da PR #57 não gerou publicação Production na Vercel (última Production = merge do B53); conferir com
  `gh api repos/Pedromgsam/ERP/deployments?environment=Production` depois de cada merge. Passo a passo para o usuário no COMO-ATUALIZAR.
- Backup 54 (base) (SQL; nenhuma função nova). Visual: tokens `--bg #F0F2F7`, `--primario`/`--lado-bg`/`--th-bg` `#1B2A4A` (th branco), `--titulo`; bloco "Backup 54" no fim do design.css
  (th na cor da lateral, td 13px). Início: `cardResumoEscritorio` em `faixa('Financeiro'|'Escritório')`, `.ini-at-rec` verde/`.ini-at-pag` vermelho. Tarefas: `filtros2x2` (`.fila-filtros.fila-2x2`), `#tf-fluxo` (sem `#tf-delegar`;
  modelo sequencial em `formNovoFluxo` → `janelaDelegar({modelo})`), `formTarefa` com `<details id="tf-mais">`. Ficha: `.dados .dado` em grid 150px. E-mail: aba `auto` = `admEmailAuto` (`EMAILS_EQUIPE`, `[data-eq]` → RPC
  `salvar_email_equipe`; `[data-eq-regra]` = regras cliente_email); SQL `configuracoes.emails_equipe` + `email_equipe_ligado`/`tipo_email_equipe` (fluxo = título "Novo fluxo|Nova sequência|Pode começar"),
  checados em `enfileirar_email` e `email_da_notificacao` (fluxo desligado na 1ª vez). LANCAR (erp-telas.js): índices 0 Receita · 3 Recebimento (`janelaReceber`) · 5 Contrato · 6 Processo · 7 Acordo inteiro
  (`formAcordoNovo`, `#f-acordo-novo`) · 9 Parcelamento · Execução · Recebimento de execução (`escolherExecucaoReceb`) · Tarefa · Fluxo. Execuções: tabela `execucao_contatos`, `pintarContatosExec`/`formContatoExec` (`#ex-contato-novo`, `#f-exc`).
- Backup 53 (base) (SQL; nenhuma função nova). Início: `cardResumoEscritorio` com `fin-jur`/`fin-contab`/`fin-pagar` (hoje · 5 dias · atraso); fila = calendário de Tarefas
  (`VISTAS_FILA` mes/semana/dia/lista, `FILA.pri`/`FILA.atalho` salvos em prefs, `chipsPriPrazo`/`passaPriPrazo` compartilhados com Tarefas). Tarefas: `#tf-kpis` acima de `.filtros`, Semana com
  `minHeight` = `F.altCal`/`FILA.altCal` (`semanaArrastavel` opção `altura`), `TIPOS_REPETE` + `uteis`/`quinzenal`. Alertas = arquivo do B48 (+ `botaoAtualizar`). Painel: `tabelaPadrao` sem `semDivisao`
  (faixa `tr.gx-grp`), bloco "Backup 53" no fim do design.css. Ficha: `PARTES_FICHA.resumo` = resumo+receita (Cadastro|Situação, Tarefas|Débitos via `cardDebitos`), sem certidões; `#fc-lancar` → `#fc-lancar-menu`
  (ids `#fc-tarefa` etc. dentro). Acordos: `.ge-it-ac` (PIX em linha própria), `GS.editarAcordo(ids)` (`#f-acordo-todo`), ✎ `[data-lg-editar]` na `_lgParcTabela`; o e-mail fecha a janela e roda `avisoEnvio` por trás.
  Contratos: `contratos.sem_financeiro` (implantação; `lancar_parcelas_contrato`/`gerar_mensalidades` pulam), `vincularLancamentos(ct, cli, depois)` (`#vl-ok`), `#ctr-vincular`. Rotina: `rotina_parcelas_dados` com CTE `perto`
  (6 antes/3 depois), `[data-pl-np]` → `desmarcarPagoRotina`, uma `.pl-linha` por grupo, sem `.ep-pagos`, `_valor` prioriza `valor_ultima_parcela`, `rotinaTarefas` mostra a recorrente `_feita` (`.rt-ciclo`). Admin: `ABAS_ADMIN`
  com historico/acessos (sem `#adm-mais-bt`), Quem recebe `.cli-tabela.em-quem` + `TIPOS_EMAIL_AUTO` (`[data-em-tipo]` → RPC `salvar_email_tipo`; `emails_matriz`, `pode_email_tipo`), Caixa de saída filtro `rotina`
  (`emails_rotina_acao`), `FUNCOES_DETALHE` + `.gf-mais` (nucleo.js). Execuções: `telas-execucoes.js` (`TELAS.execucoes`, menu Jurídico), tabelas `execucoes`/`execucao_recebimentos`, gatilho `execucao_recebimento_lanca`
  (lançamento "Honorários de êxito"; apagar o recebimento apaga o honorário não pago).
- Backup 52 (base) (só SQL). C1: `VISTAS_FILA` lista/semana/mes; `semanaArrastavel(alvo, {lista, estado, abrir, repintar, atrasadas, rotulo, cartao})` usada por
  `vistaSemana` (Tarefas) e pelo Início (`#ini-semana`). C2: Atualizações removida (telas-atualizacoes.js, atualizacoes-dados.js e o gerador no montar-erp saíram; histórico = backups/LEIA-ME.md).
  C3: Lista do Início com `maxHeight` (era `height`), `.tf-sem .sm-grade` sem min-height 600; padrao.js mede "≤ 40 px vazios" nos `.card-bd` (Início, Tarefas, Rotina, Acordos).
  C4/P3: `contornarGrupos` saiu (sem `gc-*`); cabeçalho de grupo único `:is(tr.gx-grp,tr.cli-grp,tr.rt-grp) > td` (faixa cinza) e `.lg-g`/`doc-pasta` sem borda azul (bloco B52 do design.css).
  C5: `#pub-buscar` → `buscarPubNoNavegador({detalhe:true})` e, se falhar, `erp-publicacoes`; `#pub-nav` saiu. C6: `acordos.pix_codigo`, `pixDaParcela(x)` (código da parcela ou chave do acordo),
  `.ge-pix` no cartão (grava ao copiar/enviar: `gravarPix`), `pixItem` com `pix_codigo` → `guias_texto_html` mostra o código num quadro. C7: textos sem "da <empresa>" (`textoGuias`, `textoNotifParcelas`).
  P1: pílula única para `.gx-seg-cli > button`, `.filtros .segmento > button`, `.rt-seg > button`, `.fila-chips .fila-chip` (CSS no fim do design.css; ✓ por `::before`). P2: `botaoAtualizar(id)` (nucleo,
  `.bt-atualizar` no `.card-hd`). P4: `SITUACOES`/`situacaoDe`/`pillSituacao` (nucleo) + `data-sit` (atraso|hoje|avencer|pago|cliente) e cores únicas `[data-sit=…]`; `ROTULO_SIT.aberto` = "A vencer".
  O1: `cadastrosEmDia()`; irPara (montar-erp) não espera `carregarCadastros` se já há lista (renova por trás); Clientes desenha 60 linhas e o resto no quadro seguinte (`#cli-tbody`, clique delegado);
  nav do ERP sem `scrollIntoView` (montar-erp); `.gs-area` das telas que ficaram para trás esvaziadas depois de 1,5 s. O2: RPC `rotina_processos_json()` (+ índice `processo_mov_ultima`).
  O3: `marcarSujo('parcelas', parcelamentoId)` → `ERP_SUJO.parcelamentos` = lista de ids → `recarregarParcelamentos(ids)` (RPC `parcelamentos_json(ids)`, `ERP_LER_PARCELAMENTOS`);
  `renderParcelamentos` desenha só a aba aberta (`_parcTab`, montar-erp). velocidade.js mede também Rotina → Processos e Parcelamentos pós-Pago (metas < 1 s) e Clientes (< 0,2 s).
- Backup 51 (base) (SQL + função erp-agenda, VERSAO 2026-10-09). Velocidade: `rotina_parcelas_json()` (security definer, confere `pode('juridico')` uma vez; parcelas em
  listas curtas `ps` [id,numero,venc,pago,data_pag,emitida_em,emissao,valor] na janela −3/+3 meses + atrasadas + a última; `fora` = resumo das antigas/futuras; `grupo_nome`) →
  `dadosRotina(forcar)` (telas-rotina.js, `_rtDados` zerado ao entrar na Rotina; ↻ `#ep-atu`/`#pl-atu`), `esqueletoRotina` (`.rt-esq .esq`), `[data-pl-hist]` = histórico de 1 parcelamento,
  `clienteDoParcelamento` (índice). V4: `pagarParcelaRotina`/`emitirParcelaRotina` (otimista; erro volta + aviso), `baixaRapida(t,id,{semRecarregar,desfazer,prazoDesfazer})` sem `carregarGrupos`,
  `gravou(txt, desfazer, prazo)`. V5: `ERP_EDITOR.marcarSujo('parcelas')` → `window.ERP_SUJO.parcelamentos` → só ao abrir `parcelamentos` `ERP_RECARREGAR_MODULOS('parcelamentos')`
  (erp-telas.js; `window.ERP_LER_MODULOS` no erp-dados). Nav não chama `applyFilters` se não havia filtro; `regDe` com índice; Painel sem o `setTimeout(renderExecRanking)` duplo e `fF` com
  `Intl.NumberFormat` (montar-erp). Índices `parcelas_pa_pago_venc`, `parcelas_abertas_venc`, `parcelamentos_grupo`. Teste `testes/velocidade.js` (no rodar-tudo, mede dentro da página com +100 ms
  por pedido; `SO_MEDIR=1` só mostra). R1: `rotina_placar()` → `#rt-placar` `[data-placar]`. R3: Planilha `tr[data-pl-x]` (nº/venc.) → `E.rt.epAbrir` → cartão; `[data-ep-pago]` no cartão.
  R4: `[data-conf-grp]` (passivo, `conferir_rotina`) e `[data-conf-pgrp]` (RPC `conferir_processos_grupo`). T1–T3: `tarefas.recorrencia_regra` jsonb (tipo semanal|mensal_dias|mensal|anual;
  dias/cada/modo dia|util|semana/n/ordem/dow/mes/dia/inicio/fim/util), `recorrencia='regra'`, série `recorrencia_serie` (índice único serie+prazo), `recorrencia_datas`/`recorrencia_proximas`,
  gatilhos `tarefa_serie_inicio`/`tarefa_serie_depois` → `recorrencia_garantir` (cria até hoje+7 e sempre 1 aberta), cron `erp_recorrencias` (`recorrencias_em_dia`), `regra_da_tarefa` (antigas),
  `recorrencias_projecao(8)` (calendário `.ag-prevista` + erp-agenda `UID:serie-`), `tarefa_serie_editar` ("esta e as próximas"). Front: `campoRepetir`/`lerRepetir`/`ligarRepetir`, `textoRegra`/
  `textoRepete`, `datasRegra` (cópia fiel; erp.js compara com o banco), `perguntarSerie` (`#tf-serie-esta`/`#tf-serie-prox`), `projecoesRecorrentes`. E1–E4: `admEmailConfig` em 3 `.em-passo`
  (`formConta`, Avançado `details.em-avancado`, `⋯ Ferramentas` `#em-ferr-menu`, `#email-testar`), aba `saida` = `admEmailSaida` (`FILTROS_SAIDA`, `[data-saida-f]`, `[data-em-tentar]` → `email_reenviar`);
  `admEmailRevisar` = filtro revisar. Tempos antes/depois no COMO-ATUALIZAR (Backup 51).
  Sugestões: `sistema/arquivo/SUGESTOES-B51.md` (C1–C7, P1–P5 e O1–O3 feitos no Backup 52; N/A/S e O4–O5 continuam como sugestão).
- Backup 50 (base) (SQL + função erp-agenda). Início: atalho `financeiro` em `cardResumoEscritorio` (lancamentos ≤ hoje+5); chips `.fila-chip.ativo` de uma cor
  (`--selecao`, sem as cores por tipo). erp-agenda (VERSAO 2026-10-08): todas as tarefas abertas com prazo/prazo_fatal do responsável OU participante, `TZID=America/Sao_Paulo` com hora.
  Tarefas: `pillStatusTarefa` (`.tf-st-<status>`), colunas Prazo + Dias (`celulaAtraso`), `.cal-pri-<prioridade>` no calendário. Cadastro de cliente sem `.cli-rapido`; `formCliente(cl, depois, abaInicial)`.
  Financeiro: `td.acoes-l` nowrap, `td.col-valor.valor-rec/.valor-desp` verde/vermelho (padrao.js não mede mais a cor do valor), abas com `--tc` por `data-tab`. E-mail → Quem recebe:
  `[data-em-cli]` → `formCliente(…, 'contato')`, `[data-em-dest]` → RPC `definir_email_destino(cliente, email)` (troca no contato de onde o destino vem). Sugestões: `sistema/arquivo/SUGESTOES-B50.md`
  (V1–V7 velocidade, T1–T3 recorrentes, R1–R10 Rotina, E1–E8 e-mail, G1–G8), prompt `sistema/arquivo/PROMPT-BACKUP-51.md`.
  Diagnóstico de lentidão da Rotina: `rotinaEnviarGuias`/`rotinaPlanilha` baixam TODAS as parcelas (buscarTodos, páginas de 1000 em série) a cada aba;
  "Pago" = confirm + update + `carregarGrupos()` + `ERP_RECARREGAR` completo ao sair do GS.
- Backup 49 (base) (SQL; nenhuma função nova) — as 36 sugestões do `SUGESTOES-B48.md`. E-mails: `clientes.recebe_email` (chave única; `pillRecebeEmail`/`trocarRecebeEmail`/
  `janelaRecebeEmailLote`, `#cli-email-lote`), `email_fila.cliente_id` + gatilho `email_fila_a_recebe` (`email_fila_recebe`: manual → exceção "NÃO receber e-mails", automático → cancelado),
  `pode_email` olha a chave, `quem_recebe_emails()`, `emails_revisar` (+ `email_fila_reter` segura automáticos; `salvar_emails_revisar`), `modo_teste_email`/`salvar_modo_teste_email`
  (faixa `#gx-modo-teste`, `ERP_FAIXA_TESTE`), `texto_guias_rotina_html` no `rascunho_email_texto` + `previa_rascunho_texto` (`[data-ep-a=prev]`, `verEmailHtml`), `#ep-pend`,
  `cobranca_email_html`/`cobrar_por_email` (Cobrar → chips `.cb-canal` WhatsApp/E-mail). Admin: `ABAS_ADMIN` (usuarios/importar/email/backup) + `ABAS_ADMIN_MAIS` (`#adm-mais-bt`), E-mail com `#em-abas`
  (quem/revisar/config). Início `.ini-atalhos`; fila só lista/mês. Tarefas: `#tf-config` ⚙ (`#tf-cfg-menu`), `#tf-rapida-bt` ⚡, vistas lista/calendario/fluxos, `#tf-cal-vista [data-cal-v]`.
  Painel: evolução `evo-fechado`/`#evo-abrir`. Processos: `#mov-buscar`. Parcelamentos sem ações (lista-grupos-b25). Rotina `ABAS_ROTINA` sem acordos. Acordos `exAcSit` fechado.
  Financeiro: abas sem ícone (montar-erp), aba prejuizo escondida → `_finSegPerdas` (`#fin-perdas-seg`), Contab `fc-kpis5` (sem "Pago"). Contratos: `reajustesProximos`/`cardReajustes` (`#ctr-reaj`,
  `[data-reaj-aplicar]` → `registrar_aditivo`). Ficha: `ABAS_FICHA` 7 + `PARTES_FICHA`/`ABA_NOVA` (partes `.ficha-parte`). Cadastro: `.cli-rapido` (`.cli-r`, `#cli-mais-dados`).
  CRM: `GRUPOS_CRM`/`grupoEtapa` (4 colunas `[data-grupo]` + faixa final; etapas do banco intactas). Documentos: `seloPasta`, "Vencendo em 30 dias". Alertas sem publicações/parcelas/acordos/
  honorários/tarefas, com "Certidões vencendo". Automações: bloco `.au-emails` + `#au-revisar`. Publicações: abre em `nova`, `#pub-todas-lidas`. Régua: `col-data`/`col-sit` (REGUA) centralizados
  (menos `#tblExecRanking`); `.filtros .segmento` em pílulas.
- Backup 48 (base) (sem SQL): Tarefas com `#tf-chips` (Mostrar `[data-tf-tipo]` + De quem `[data-tf-pes]`; `E.tf.tipos`/`E.tf.pessoas`, vazio = todos) usando
  `chipFiltro(attr, v, rot, on, comCor)` e `alternarFiltro` (telas-tarefas.js, também no Início); `#tf-resp` saiu (Minha semana usa `F.pessoas`). Painel: td 2 e 4 do `#tblExecRanking` à esquerda.
  Sugestões numeradas em `sistema/arquivo/SUGESTOES-B48.md`; próximo prompt `sistema/arquivo/PROMPT-BACKUP-49.md` (e-mails: chave única por cliente + modelo bonito nas guias).
- Backup 47 (base) (sem SQL): importação — `IMPORTADOR.gruposFaltando(nomes, existentes)` (importador.js) tira repetidos pelo `norm` (caixa, espaços,
  acentos) antes do insert em `grupos` (índice `grupos_nome_unico` = lower(btrim)); `idGrupo` em `gravarImportacao` compara com espaços colapsados.
- Backup 46 (base) (só SQL; erp-emails = B44). Agenda: `FILTRO_TIPOS_AG` na ordem reunião/audiência/compromisso/tarefa/rotina, chips `.fila-chip-<tipo>` (cores no
  bloco "Backup 46" do design.css; `--orange` nos tokens), `ag-rotina`, concluídas dos últimos 60 dias (`ag-feita`), "De quem" = Todos + eu + outros, Lista 10 itens com `minHeight` = `FILA.altCal`.
  Documentos: `grupos/clientes.drive_url` + RPC `salvar_link_drive(tipo,id,url)`, `linkDrive()` (`a.doc-drive`, `[data-drive-ed]`); `drive_url` em `ERP_COLS_CLIENTE`. Rotina: Processos `F.proc`/`F.conf`
  arrays (vários filtros), `faixa(p)`, `select#rt-trib`; Planilha com todas as pagas, `.pl-linha` por empresa em `#pl-rolo` + `#pl-barra-x` (sticky, `ligarRolo`), pagamento via
  `ERP_EDITOR.baixaRapida(t,id,{semRecarregar:true})` → `ERP_DADOS_SUJOS` (nav recarrega ao sair do GS); Enviar guias: `E.rt.epTodos`/`#ep-todos` (cliente emite, `.ep-tc`), `salvarCard`
  (rascunho salvo → `registrar_emissao` + `lancar_valor_parcela`), `#ep-todos-rasc`. Automações: `regras_tarefas.oculta` (flag `b46_automacoes` esconde/desliga as nunca usadas; tela filtra).
  Usuários: tabela `.us-tab` só leitura, `[data-us-ed]` → `formEditarUsuario` (`#us-nome`, `#us-papel`, `#us-cargo-sel`, `#us-rev-sel`, funções/grupos, `#us-salvar`); ✓/🔑/🗑 viraram ícones.
  Atualizações (saiu no Backup 52). Reset: `banco/reset-para-uso-real.sql` (só o admin "Pedro%"; testado no rodar-tudo em erp_fluxo).
- Backup 45 (base) (só SQL; erp-emails = B44). Rotina: `rotinaEnviarGuias` = Notificações antigas (`.ep-*`, `_epSel`, `textoNotifParcelas` com `[VALOR:x]`, `epHtml`,
  `epTextoAtual`, `epParaEdicao`; "Enviar e-mail" → RPC `rascunho_email_texto(cli, para, assunto, texto, arquivos)` + `salvarRascunhoAgora`; "Marcar enviado" → `registrar_emissao` +
  `lancar_valor_parcela`); `email_rascunho_destino_real(ref)` desfaz o desvio do modo teste nos rascunhos (também em `salvar_guias_rascunho`); constraint de `email_fila.status`
  (linha ~4192 e B44) inclui rascunho/rascunho_salvo. `rotinaPlanilha` sem envio, `bloco(p)`/`redesenharBloco`, `.pl-mais` (pagas antigas/previstas resumidas). Passivo: colgroup
  `.rt-w-*`, Enter/setas, `dCurta`. Processos: `tribunalProcesso` (CNJ J.TR), `E.rt.fp` (`.rt-segs`), `celulaConfProc` com ✓ → `janelaMovimentacao(id, depois, {conferir:true})`
  (tipo em `.mov-tipos`, hidden `name=tipo`). Sem `rotinaFinanceiro`. Início: `FILA.pessoas`/`FILA.tipos` (prefs), `FILTRO_TIPOS_AG`, `tipoItemAgenda`, `pessoasVisiveis` (nível do cargo),
  chips `[data-fila-tipo]`/`[data-fila-pes]` (sem `[data-fila-quem]`); `janelaAgendar` com tipo `tarefa`, `[name=resp]`, `[name=aviso2]`; SQL `tarefas.aviso2_min/aviso2_em`, `avisos_agenda` com 2 avisos.
  Usuários: `perfis.cargo`, `perfis.revisor_id`, `nivel_cargo`, `equipe_hierarquia()`, gatilho `tarefa_revisor_padrao`; front `CARGOS`/`nivelCargo` (nucleo), botão `[data-cargo-ed]` → janela `#us-cargo-sel`/`#us-rev-sel` (na coluna Acesso, para a tabela caber). `_fK` (montar-erp) = R$ 80k / R$ 1,3M.
  Painel: `.er-v` (fS resumido + title fF, no montar-erp). Acordos: `_lgGuias` some para `o.tabela==='acordos'`; `janelaGuiasEmpresa` com `soRascunho` (acordos). Contab: `cFcCaixaFluxo` com
  `_faCorBarra` e fora do pluginTema. Clientes: `contornarGrupos` só `tr.gx-grp`.
- Backup 44 (base) (SQL + função erp-emails). Lateral `--sw:204px` (design.css, linha do `body.gx-barra-topo`). Painel: bloco "Backup 44" no fim do design.css
  (larguras em % por `th:nth-child`, Grupo 9%, Operação/Situação centralizadas). E-mail: o slug da função do usuário era `super-worker` (renomear não muda o endereço) —
  `chamarFuncao` explica. Rascunho no Gmail: `salvar_guias_rascunho` (SQL, status `rascunho` → `rascunho_salvo`), `erp-emails {acao:'rascunho', ref}` → `imapRascunho(cfg, raw,
  conectar)` (IMAP APPEND na pasta \Drafts; raw pelo nodemailer `streamTransport`), `tratar(req, db, mailer, gaveta)`; front `salvarRascunhoAgora` (nucleo), `#ge-rascunho`,
  `[data-nt-rasc]`, `avisoEnvio` decide pelo `r.status`. Testes: IMAP falso em `funcao-emails.js`, `/__teste/rascunhos`.
- Backup 43 (base) (só SQL). Desfez o menu no topo: `erp-telas.js` = o do Backup 41 (lateral com ícones, `#gs-encolher`); margens `--conteudo:1440px`,
  `--gut:max(20px,…)` (eram 1360/32). "Cobrar" (`cobrarWhatsApp`) sem `ERP_RECARREGAR` (troca o botão para "✓ Cobrado"). Guias/acordos sem `#ge-para-sel`/`emailsDaEmpresa`
  (campo `#ge-para` pré-preenchido). `enviarEmailAgora`: se o fetch à função falha, chama RPC `disparar_envio_emails()` (pg_net + segredo) e explica (função não publicada /
  Verify JWT ligado). Rotina: `rotinaPlanilha` do B35-41 voltou (aba `planilha`, `.pl-*`); a tela estilo Notificações virou `rotinaEnviarGuias` (aba `guias`).
- Backup 42 (base) (SQL + função erp-emails). E-mails: `enviarEmailAgora(ref, para)` (nucleo.js) chama `erp-emails {acao:'enviar', ref}` logo depois de enfileirar
  (equipe pode chamar só 'enviar'; com `ref` a função devolve `item {status, erro, para}`), `explicarErroEmail`; `avisoEnvio` (telas-guias); `enviar_guias_email` devolve `ref`;
  `diagnostico_email()` + `checarEmail()` (Administração → E-mail, `#email-check`); B42 desliga `emails_pausados` e cancela retidos (flag `b42_emails`), redirect = pedromgsam.
  Menu no topo: `body.gx-menu-topo`, `#tn` movido para `#gs-hd`, lateral 68px com `#gl-sub` (seções do módulo, `SUB_CURTO`), `MENU[].curto`. Guias: `emailsDaEmpresa`, `#ge-para-sel`,
  `#ge-copiar`, `copiarTexto`, `emailDeTeste`; acordo sem fecho de comprovante, sem novo venc./valor atualizado. Rotina: passivo `.rt-grp` (sem gx-grp/contorno), Conferência no fim
  (`.rt-c-conf`, ✓ = `gravar` da linha), sem 🕘; `rotinaControle` apagado; aba `acs` → `nav('acordos')`; `rotinaPlanilha` nova (`.nt-*`, `_plSel`, `textoNotifParcelas` =
  texto das antigas Notificações, também em `textoGuias` parcelas). Financeiro: `cobrarWhatsApp(id)` (GS; botão `[data-cobrar]` no A Receber e `data-la=cobrar` no _gx `:r`).
  CRM: `.pr-janela` + `#pr-previa` (prévia ao vivo, debounce 450 ms); `.mp-a .sub` quebra linha.
- Backup 41 (base) (só SQL; apagar a função erp-pgfn no painel). Removidos: telas-emails.js, telas-aprovacoes.js (rascunho/`propor`; SQL converte
  propor → editar/ver e dropa `rascunhos`), telas-relatorio.js, vista relatório de Tarefas, PGFN/SERPRO (`supabase/functions/erp-pgfn`, tabelas pgfn_*), `app/geradores/` +
  `montar-geradores.js`, fotos mensais (`fotos_mensais`), Clientes/Financeiro "Editar em tabela". Lentidão da Rotina: `contornarGrupos` com assinatura por tbody (`tb._gcSig`)
  — não mede `getComputedStyle` se as linhas não mudaram. Painel: `table-layout:auto`, "Operação" (trocar no montar-erp), padding 4px, `td:has(.er-nome)` min 104px!important
  (o inline 170px vencia) — cabe em 1366 px. Acordos A pagar sem `.ac-ck` (9 colunas, `.ac-c-proc`). PIX: `textoGuias` "Acordo para pagamento", `.ge-anexos` hidden só PIX.
  Documentos: `<select name="tipo">` + `porTipo()` (testes usam `selectOption('#f-doc [name=tipo]')`). CRM: `texto_completo` dos 8 modelos (SQL no fim), `.mp-lista/.mp-linha` (grid A·B·C·D).
- Backup 40 (base) (só SQL). Agenda: `janelaAgendar` (async; pessoas = `equipe()` ativas; tipos reuniao/audiencia/compromisso, `.ag-form[data-tipo]`, `TIPOS_AUDIENCIA`,
  `processos_vinculados` = nº do processo; `hora_fim`, `conflitosAgenda`, `horaFaixa`, `AVISOS_AGENDA` → `tarefas.aviso_min`; `vigiarAgenda()` (aviso na tela, localStorage `erp_avisos_ag`)
  + SQL `avisos_agenda()` (cron `erp_avisos_agenda`, notificação → e-mail) e gatilho `tarefa_aviso_reset`). Tarefas: `#tf-resp`/`#tf-pri` em `.segmento` (`pessoasFiltro`; pessoa = resp. ou
  participante), `.tf-sem` (Minha semana em cartão 600px), `ag-feita` (riscada). Painel: `tabelaPadrao({semDivisao})`, larguras `table:has(> #tblExecRanking)` (bloco B40 do design.css).
  Acordos: `.ac-bt-emitir`/`.ac-emitido` + `.ac-bt-baixa` (editor.js pula `#tblAcordosVencBody`). OFX removido (`telas-ofx.js` apagado, `drop table extrato_itens`). Financeiro: `IC40`
  (ícones no montar-erp), sem "Editar em tabela". `corPessoa` e `_faCor` por primeiro nome sem acento. Janelas `.gs .janela` em flex (rodapé fixo no pé). Documentos: `janelaEnviarDocumento`
  com `#doc-tipos` e certificado (lerCertificado), `excluirDocumento` (política `documentos_excluir`/`documentos_apagar` = pode documentos editar), subpastas `.doc-sub` (`F.subAbertas`),
  `janelaCertificado` = atalho. Geração de documentos fora do ERP: `abrirCentral` = aba nova, menu Documentos item único, `#doc-ger` link; sem atalhos no CRM/contrato/ficha/recibo.
  CRM: `crm_propostas.formato` (simplificada|completa) + `texto_completo` (também em `crm_modelos_proposta`); `htmlProposta` junta o detalhamento. Escuro = paleta GitHub (tokens.css + tema-escuro.js).
- Backup 39 (base) (só SQL). `tarefas.com_quem` (Agendar com texto livre, `quemTarefa(t)`, `nomeCurto`); `quadroAtrasadas` compartilhado (Início e Minha semana);
  `vistaCalendario` reusa `calendarioFila` (`.tf-cal`); abas `#tf-abas` em `.segmento`; detalhe com `#tf-f-editar` (lista sem ✎). Painel: `_evo` 6 meses, `pe-area` em seg,
  Empresas sem CEAT/CAPAG/✎ (`marcarLinhas` pula `#tblExecRanking`/`#tblProcBody`), ficha com `.ficha-bt-editar` (#fc-editar). Processos: `chipProcTodos`. Margens
  constantes (`--gut` no design.css, bloco B39). Contab: `.fc-quem-contab`, `_fcTabelaComp` sem colgroup. Contratos sem Parcelas/Anexo. Selo da pessoa = pílula original.
- Backup 38 (base) (só SQL). Menu = barra LATERAL `#gs-lado` (erp-telas.js: `MENU` com `{sec}` e `ic`, `ICONES`/`icone()`, `#tn` dentro da lateral,
  `.tn-grupo.on` = submenu aberto, `destacar` abre o grupo da tela; `#gs-encolher` → `body.gx-lado-min`, localStorage `erp_lado_min`); `#gs-hd` = barra branca
  (`#gs-tela-nome`, + Lançar, tema, ⋯, sessão, nome, Sair). CSS no bloco "Backup 38" do design.css (`--sw`, `--conteudo` 1360, `--gut`); tokens `--lado-*`, `--topo-*`,
  `--primario` azul. Sino/avisos saíram (sem `atualizarSino`/`gx-pop-avisos`). Início = `ini-valid/ini-lembretes/ini-resumo/ini-aprov/ini-fila` (sem honorários, sem
  `cardMural`). Agenda: só tarefas, `FILA.quem` (admin; `[data-fila-quem]`, salvo em `preferencias.fila.quem`), `.fila-atrasadas` com a altura do calendário.
  SQL: gatilho `tarefa_so_manual` (tarefa com `chave_regra` ≠ `reuniao:` não grava se `configuracoes.tarefas_automaticas` ≠ true; as abertas canceladas 1× —
  `b38_tarefas_auto`), `email_fila_redirecionar` (gatilho `email_fila_desviar`, roda antes do `email_fila_reter`; `configuracoes.email_redirecionar`,
  `email_fila.para_original`). Testes religam as duas coisas (`preparar-banco.sh`, `rodar-tudo.sh`; fluxo.sql 38.x testa o desligado). Módulo E-mails sem
  menu/painel (telas-emails.js continua no bundle, sem entrada). Financeiro: Prejuízo/Em atraso de todos os meses; Contabilidade com `fc-kpis6` e sem tabela Em atraso.
- Backup 37 (base) (só SQL). **Supabase devolve no máx. 1000 linhas**: listas grandes usam `buscarTodos` (nucleo.js; `order('id')` + range,
  cai sem desempate se a tabela não tem `id`) e `todos()` do erp-dados ordena por id; o PostgREST de teste tem `db-max-rows = 1000`. Guias: `GS.gerarGuias(tabela,
  {grupo_id, empresa, itens, ids, proximas})` (telas-guias.js) → `janelaGuiasEmpresa`; botões `.lg-bt-guias-geral`/`.lg-bt-guias`/`.lg-bt-gu` → `_lgGuias` (lista-grupos-b25.js,
  `o.tabela`). `acordos.forma_pagamento` boleto|pix (gatilhos `acordo_forma_propaga*`), `textoGuias`/`parcOrd`/`fechoGuias`, `guias_texto_html` (caixa "Como pagar") usada
  por `enviar_guias_email`/`previa_guias_email`. Acordos: `_acPrazo` (`#acPrazoBar`, `#acPrazoAte`), `.ac-emit-par`; selects grupo/devedor escondidos (design.css).
  Certificado: `vendor/forge.min.js` (node-forge, sob demanda) → `lerCertificado`/`janelaCertificado` (telas-documentos.js), `cliente_certificado.documento_id/titular/emissor`,
  pasta com `[data-pasta-enviar]`/`[data-pasta-cert]`; alerta "Certificado digital vencendo" (telas-alertas.js). Sessão: `AC_SESSION_TTL` 60 min deslizante (`_acResetTimer`),
  `#gs-sessao` (⏱N′). Agenda: `FONTES_AGENDA`/`fontesAgenda`/`extrasAgenda` (`preferencias.fila.fontes`). `parcelas.data_pagamento` (gatilho). `registrar_busca_publicacoes`.
  Painel `.er-op`/`.er-sit`; Financeiro sem "Em atraso" (`false&&` no montar-erp); CRM sem painel, `#cr-resp-seg`. Planilha da Rotina: `[data-pl-gx]`, `[data-pl-gpa]`,
  `[data-pl-gemp]`. Tokens: `--th-bg` claro; títulos 24 px; `.kc` com número em cima (bloco B37 no fim do design.css).
- Backup 36 (base) (só SQL). Início: `janelaAgendar` (telas-tarefas.js; `tarefas.tipo_agenda/hora/local`, `TIPOS_AGENDA`, `classeAgenda`, `legendaAgenda`,
  `[data-agendar]`, `[data-ag-dia]`, `.cal-tf.ag-*`). Painel: `_evo.visao='total'` padrão; `evolucao_passivo` devolve null antes do 1º passivo (CTE `primeiro`) e o JS corta
  os meses iniciais sem dado; contorno com `td.gc-l::before/gc-r::after`. Processos: `.gx-movs`/`.gx-mov` (cartões). `_lgRender`: cartões maiores, `.lg-card-ab`
  "aberto", painel `.lg-painel-tit` + tabela `.lg-t`/`.lg-t-lin` (Pagas·Falta·A pagar este mês·Situação), `_lgEsteMes` = vencidas + do mês; um cartão só abre sozinho;
  `_lgParcTabela` com Emissão/Pagamento separados; `_lgConfirmaPag` (confirm) antes de "Lançar pagamento". Acordos: sem Responsável, `.ac-c-grp` estreito,
  "🧾 Emitir" → `GS.enviarAcordosSelecionados`; composer com `#ge-previa` → RPC `previa_guias_email`. Rotina: `rotinaControle` = um `.rt-ch` por parcela/mês
  (`[data-cel]`, estados rt-ch-emitir/sel/emit/atr/ok/cli) + menu `#rt-pop` (`[data-sel]`, `[data-pag]` com confirm, `[data-abre]`); `rotinaPlanilha` em grade
  `.pl-blocos`, cabeçalho `.pl-cab` + `.pl-kpis`, lista inteira (sem `.pl-lista`) + linhas `pl-prev` (previstas até o total), `#pl-emitir` sempre ativo.
  Publicações: contadores por recorte (`semSt/semTrib/semAdv`, `.seg-n` em todos os botões). Documentos (Central): `.dc-topo-vis` (Histórico/⚙ Configurações;
  embutido → vai para `.dc-lado`), seções em cartões, select ≤6 opções/advogado/recebedor/tratamento → `.dc-seg` (radio), `[data-hoje]`, `desenharEscritorio` =
  Configurações (`.dc-conf`, `.dc-advs`). E-mails → Quem recebe: `controleEmails` com `.emc-tab2` (sinais `.emc-s-*`), `#emc-prob`, `#emc-perfis`, regra em `details.emc-regra`.
- Backup 35 (base) (só SQL). `_lgRender` = cartões `.lg-cards`/`.lg-card` (grid dense; aberto → `.lg-painel` full-width com `.lg-hd` + `.lg-filho`),
  `o.porEmpresa` (FILTROS.grupo ou `_parcF.grupo`) → cartões por empresa; KPIs viraram `.lg-resumo`; popups com `_lgFicha` + `.pcd-kpis5`; `_lgParcTabela` com colgroup e
  `.lg-bt-pagar` ("＋ Lançar pagamento", `[data-lg-pagar]`). Acordos: `remendos/acordos-b35.js` (injetado antes de `sortAcordosVenc`) redefine `setAcordTab` e
  `renderAcordosVencTbl` = aba única "A pagar" (`.ac-ap`, `[data-ac-sel]`/`_acSel`/`#acSelBarra`, `[data-ac-guia]` → `GS.emitirParcela`, `GS.enviarAcordosSelecionados`
  em telas-guias.js); botão `data-atab=pagar` escondido. Evolução: sempre por grupo, `FILTROS.grupo` → por empresa, `#evo-visao` linhas|total. `contornarGrupos` marca
  `td.gc-l/gc-r` (1ª/última célula visível). Processos: `processos.valor_em` (gatilho `processo_valor_em` + mov tipo valor), popup carrega 3 de `processo_movimentacoes`
  (`.gx-mov`). Rotina: `rotinaPlanilha` (aba `planilha`, `.pl-*`, `E.rt.plGrupo`), controle com `.rt-passos` e `.rt-resid`. Publicações: `#pub-advs` (primeiro nome,
  `_pubAdvs` de `oabs_monitoradas`). E-mails: `.em-faixa` + áreas fila/clientes/config, `#em-meus` no topo. Central: modelos em barra no alto (central.css ≥761px).
  Densidade menor no fim do design.css.
- Backup 34 (base) (só SQL). Parcelamentos/Acordos sem emissão: `_guiasNoTopo` só remove `#parcGuias/#acGuias`; `_lgRender` (lista-grupos-b25.js)
  = `.lg-min` (Grupo › itens; um grupo só → Empresa › itens via `item.empresa/tituloEmp/subEmp`), `_lgGuiaDiscreta`, `_lgParcTabela(l, tabela)` (lista de parcelas
  do detalhamento: Parcela·Vencimento·Valor·Situação + `.lg-em` emitida/não/cliente) e `_lgFicha` (dados da planilha); `_lgDuas`/`_lgTagGuia` saíram.
  `parcelas.valor` = valor lançado (erp-dados: `valor` efetivo herda o último lançado, `valorLancado`; `grupoNome` do grupo_id); `lancar_valor_parcela(id, valor)`;
  `enviar_guias_email` grava `parcelas.valor` (não no reenvio) e atualiza `valor_ultima_parcela`. Rotina: aba `guias` saiu; `rotinaControle` = `.rt-ctl` (thead sticky
  `top:var(--hh)`, `.rt-ep` Emis./Pag., `[data-sel]` → `_rtSel` → `#rt-selbar` → `janelaGuiasEmpresa`; `[data-pag]` baixa; `[data-valor]` no detalhe).
  Composer: parcela vencida ganha `.ge-novo-venc` e vai com `reenvio:true`. Central no ERP: painel `gerador` (`TELAS.gerador`, iframe `?embutido=1`,
  `.dc-embutido` esconde a barra), `abrirCentral(url, ev)`, links `a[href^="documentos/index.html"]` interceptados; Ctrl/⌘/meio = aba nova (menu: `#painel`);
  vercel.json com `SAMEORIGIN`/`frame-ancestors 'self'`.
- Backup 33 (base) (só SQL). Guias (`telas-guias.js`): `htmlGuiasPorGrupo` = grade `.gd-tab` (`--gd-cols`; cab, `.gd-g-hd`, `.gd-emp-hd`,
  `.gd-it`); aba Vencidas inclui enviadas até o pago; `janelaReenvio` (`#rv-*`, item `reenvio:true` em `enviar_guias_email` → `parcelas/acordos.reenvio_em,
  reenvio_venc, reenvio_valor, reenvios`); `dataLocal`, `fimDoMesGuia` (`fimDoMes` já existe no nucleo). Lista por grupo: `_lgTagGuia` (Nós/Cliente),
  `_lgDuas`/`_lgRenderDuas` (`.lg2-*`, localStorage `erp_lg_duas`). Rotina: `PARES_PASSIVO` (`.rt-par`/`.rt-neg`), `janelaSenhaGov`, faixas 15/30 dias,
  `rotinaControle(el, 'parcelas'|'acordos')` (8 meses, `E.rt.mesIni_*`, `.rt-abre`/`.rt-det`, `.rt-sem-altura`), aba `acs`. SQL: `rodar_regras_rotina()`
  (regras `rotina_conferir` / `rotina_supervisao`, chaves `rot-conf:`/`rot-sup:` + semana ISO; chamada em `rodar_regras_extras`), modo teste de e-mails
  uma vez (`configuracoes.b33_modo_teste_emails` guarda as regras desligadas; `preparar-banco.sh`/`rodar-tudo.sh` religam nos testes),
  `passivo_json`, `evolucao_passivo(p_grupo, p_meses)` (reconstrói pelo `historico`) → `evolucaoPassivo`/`evoDesenhar` (erp-telas.js, `#execEvolWrap`,
  `#cEvoPassivo`, no gancho do `renderExecRanking`).
- Backup 32 (base) (só SQL). **Central de Documentos** em `sistema/app/documentos/` (página à parte, mesmo login): `modelos.js`
  (`window.MODELOS_DOC`: campos + `montar(d, h, B)` → blocos; marcação `**negrito**`, `__itálico__`, faltando = `h.V()` → ⟦⟧ amarelo),
  `motor.js` (formulário, prévia A4, busca de cliente → `dadosCliente`, `salvar` em `documentos_gerados`, número `proximo_numero_documento`
  (REC aaaa/nnnn), histórico, "Ajustar texto" → `lerEditados`, PDF = janela de impressão com thead/tfoot e logo/banda fixas, Word = `vendor/docx.js`
  sob demanda, nome de arquivo sem acento), `central.css` (tela) e `documento.css` (folha/impressão). Entradas: `?modelo=&cliente=`, `&contrato=`,
  `?lancamento=` (recibo), `?doc=`. Dados do escritório/advogados: `configuracoes.documentos_escritorio` (`salvar_documentos_escritorio`, admin).
  ERP: `janelaGeradores` (telas-documentos.js) lista os modelos da Central + "Outros geradores"; `abrirGeradorContrato` → Central; recibo no
  `detalheLancamento`. Carimbo ?v= da página no montar-erp (15b). Teste `testes/documentos.js` (no rodar-tudo). Imagens: `img/recibo-cabecalho.png`
  (logo) e `img/rodape-documento.png` (banda).
- Backup 31 (base) (só SQL). `contornarGrupos()` (erp-telas.js, no observer) marca `gc-ini/gc-in/gc-fim` nas linhas de `tr.gx-grp`/
  `tr.cli-grp` → contorno azul (design.css); `.lg-g` e `details.doc-pasta` com borda azul. Processos: `_procEntidades(lista, g, val)` (montar-erp) troca a
  tabela Grupo por "Entidade / sócio" com grupo filtrado. Rotina: `rotina_conferencias` + `conferir_rotina(area, ids, alterou)` + `rotina_situacao(area)`
  (área passivo|parcelamentos; alteração = `historico`), `celulaConferencia`/`situacaoRotina`; Processos `[data-sem-nov]` (mov `sem_novidade`) e
  `celulaConfProc`; aba `parcs` = `rotinaParcelamentos` (chave `.rt-chave` → `parcelamentos_emitimos(ids, bool)`, grupo `[data-g-emit]`, planilha 6 meses
  `.rt-pc-*`, `E.rt.mesIni`, `janelaParcelaPlanilha`). Guias: `htmlGuiasPorGrupo` (`.gd-g`, `_guiaGrpAberto`, `[data-gd-grp]`, `[data-gd-emp]` → composer
  da empresa, atraso por parcelamento uma vez, `chaveParcGuia`). Versão anterior: zip do Backup 30.
- Backup 30 (base) (só SQL). Guias (`telas-guias.js`): `parcelas/acordos.email_ref` (ref do e-mail em `email_fila`), `emissao_emails`
  devolve `{id:{em,status,para,erro}}` (status da fila; sem linha → automacoes_log), `guiaEnviada` (pendente/retido/enviado saem do quadro;
  erro/cancelado voltam a "falta enviar"), `ST_EMAIL`, faixa `.gd-fila` (retidos → `nav(null,'emails')`). `guia_destino(cli, grp, tabela)` →
  `preencherDestino` preenche `#ge-para`/`#gd-para` (amarelo `.ge-sem-email` se vazio). `janelaEmissao` envia sempre por `enviar_guias_email`
  (devolve `status`; `msgEnvio`), valor em `.ge-vbox`/`.ge-rs` (`data-mascara="nenhuma"`, formata no blur). Composer: empresas por grupo
  (`.ge-grp`), texto "em nome de" (neutro PF/PJ). Contabilidade: `.kpi-grid.fc-kpis5` (5 colunas, subtítulo em 1 linha). Maquete aguardando
  aprovação: `sistema/prototipos/guias-em-blocos-b30.png` (blocos grupo › empresa, passos Emitir › Enviar › Pago).
- Backup 29 (base) (SQL + funções erp-emails e erp-cnpj). Início (`telas-painel.js`, `.kpi-grid.ini-fin` com `.kc`) e Financeiro→Jurídico
  (trocar em montar-erp) com os mesmos 5 cartões (Recebido·A receber·A pagar·Em atraso·Prejuízo; `resumo_financeiro` devolve `prejuizo`). Guias
  (`telas-guias.js`): quadros "Parcelamentos/Acordos para emitir", enviados (`email_em`) saem do quadro, `janelaGuiasEmpresa` novo (`.ge-*`, `textoGuias`,
  `descricaoGuia`), anexos inline `p_arquivos [{arquivo,mime,b64}]` em `enviar_guias_email` (8 parâmetros) → `anexo {tipo:'lista', itens}`; erp-emails
  troca o anexo por `{tipo:'enviado', arquivos}` depois de enviar. `janelaEmissao` sem upload ao Storage. Lista por grupo com coluna `.lg-cg` (Guias).
  E-mails de teste: `configuracoes.emails_teste`, `eh_email_teste`, `email_fila_reter` deixa passar, `salvar_emails_teste`, faixa `.em-teste`.
  Pagamento: `formPagamento`/`CAMPOS_PAG` (banco, agencia, conta) em telas-admin; `email_cliente_html` monta "Banco · Agência · Conta".
  Colunas "Quem recebe": Honorários/Parcelamentos/Recibo de honorário/Reuniões (`TIPOS_CONTROLE`, `RECEBE_*`). Clientes: `#cli-buscar` (erp-cnpj
  `previa` devolve email/telefone/natureza_juridica/simples/mei; a busca sobrescreve). Rotina: `corSel` (.rt-verde/.rt-vermelho/.rt-amarelo), Senha GOV,
  `historico_passivo()` + `janelaHistoricoPassivo`, processos por grupo + `#rt-novo-proc`, tarefas em seções (recorrentes/validação/únicas/para validar).
  Tabelas: `PAGINA_TABELA`/`PG` = 1e9 (sem páginas) e thead sticky em `.tw/.tabela-wrap` (max-height). `gerar_mensalidades` 6 meses. Despesa com lista e
  "Distribuição de lucros" (campo `socio` → favorecido). Relatório em PDF: `telas-relatorio.js` (`janelaRelatorioPDF`, ⋯ → Relatório em PDF).
  `estrutura.sql` = 6046 linhas (B29).
- Backup 28 (base) (SQL + funções erp-emails e erp-cnpj). Menu: **Rotina** (`telas-rotina.js`, `TELAS.rotina`: passivo editável
  com `cliente_certificado` [validade/senha, RLS editar clientes], processos com `processo_movimentacoes` + gatilho `processo_mov_aplica` →
  `processos.ultima_movimentacao/_em`, guias, financeiro, minhas tarefas; `janelaMovimentacao` no GS e no popup de Processos) e **E-mails**
  (saiu da Administração). Máscaras ao digitar no nucleo.js (`tipoMascara`: `data-mascara="brl|tel"`, inputmode decimal + name `valor*`,
  name telefone; `formatarBRL`, `formatarTel`, `mascararCampos` no observer); `lerValor` entende "1.234". Selects com seta própria (design.css).
  `paginarTabelas` pula `[data-sem-pagina]` (Painel/Processos/Rotina). Painel/Processos sem `pe-visao`/`pr-visao` (`#pr-visao` oculto).
  Publicações: `partesPub` = bloco `.pub-id` (Processo/Autor/Réu — Advogado, `data-copiar-id`). Contratos: `inicio_vigencia`, `fechado_por`,
  `SITUACOES_CTR`/`pillSituacaoCtr` (Rescindido derivado), coluna Financeiro, docs antes de aditivos. Clientes: lista sem ▸ (clique → `abrirFicha`),
  `pillAreaCli`; `formCliente` em abas (`ABAS_CLI`, `[data-cli-aba]`), `grupo_sel` + `grupo_novo`, e-mails/telefones extras → `contatos`,
  CNPJ ao vivo `erp-cnpj {acao:'previa', cnpj}` (sem gravar). E-mail por empresa: `email_fila.conta`, `conta_email(cliente, ref)`,
  GUC `erp.conta_email` lida por `email_cliente_html` (`dados_pagamento_contab`), `config_privada.email_contab` (`salvar_config_email_conta`,
  `status_config_email_conta`), erp-emails escolhe a conta e aceita anexo `{tipo:'arquivos', lista}`. Guias: `cardGuias` minimizável
  (`_guiaMin`, localStorage), `janelaGuiasEmpresa` → `enviar_guias_email(cli, grp, itens, assunto, texto, docs, para)` (+ WhatsApp via
  `navigator.share`/wa.me); `_lgFaltaEmitir`/`_lgTagGuia` (item `guias`). Alertas: `.al-blocos` por setor, rotinas em `.al-rot-tab`. Documentos:
  pastas por grupo (`details.doc-pasta`). CRM: `.op-integra` (proposta, contrato, Meet, agenda), `linkAgendaGoogle`. Contabilidade:
  `_fcTabelaComp` (colgroup fixo + Total). Cliente de teste: `banco/cliente-teste-email.sql`. Tabelas de lançamentos do Financeiro: iguais
  ao B26 (conferido) — perguntar ao usuário qual versão ele quer.
- Backup 27 (base) (SQL + função erp-emails). Início: sem subtítulo e sem as tabelas "Atrasados" (`cardAtraso` saiu),
  Honorários antes de `#ini-fila`; destaque único `tarefas` (atrasadas ou fatal ≤7 d; atalho `atencao` em Tarefas) e `aguias` (boletos de
  acordo a emitir); `janelaTodosLembretes` (fixados/próximos/mais adiante/concluídos 90 d); fila: `.fila-com-atr` (atrasadas à esquerda em
  dia/semana/mês), dias vazios no fim do mês, `.fila-compacta`; `coletarAlertas` sem publicacao/tarefa/atraso/prazo nem vencimentos do dia,
  com `crm` (próximo passo ≤2 d). Painel: `tabelaPadrao` aceita `semSeta` (coluna fica, escondida — nth-child não muda) e `clique`
  (Empresas → ficha); `#pe-grupo` saiu. Processos: sem Ticket médio/Sem valor, sem `pa-sub` nas tabelas, `_procSort` = Competência.
  Guias (`telas-guias.js`, no bundle): `cardGuias(tabela, el)` (abas a emitir/emitidas/vencidas, 15 d) e `emitirParcela`/`janelaEmissao`;
  SQL `parcelas`/`acordos` + `emitida_em`, `emitida_por`, `guia_doc`; `registrar_emissao(tabela, id, emitida, doc, enviar)` (e-mail com a
  mesma ref do lembrete, `email_lp:`/`email_la:`, anexo `{tipo:'arquivo', caminho}` baixado do Storage na erp-emails → `tipo:'bin'`),
  `emissao_emails`. Lista por grupo: `_lgSit` = pílula única (risco = vermelha), `.lg-verde`, grupo aberto com contorno; sem "Por grupo/Lista"
  (`_parcVisao`/`_acVisao` ficaram, sem botão); `_guiasNoTopo` (#parcGuias/#acGuias). Contabilidade: `remendos/contab-b27.js`
  (`_fcPintarCorpo` novo, o antigo virou `_fcPintarCorpoAntigo`; sem `#fcLadoBar`; `_fcGraficosB27` verde/vermelho; comparativo por
  cliente e por fornecedor; `_fcTabelaAtraso` com Receita/Despesa, `data-sem-gs` para o `converterTabelas` não trocar).
- Backup 26 (base) (SQL + funções erp-emails, erp-cnpj, erp-agenda). Fluxo cliente → financeiro:
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
  (O prompt `sistema/arquivo/PROMPT-AUTOMACAO.md` foi executado no Backup 26.)
- Backup 23 (base). SQL: `excluir_usuario(p_perfil)` (admin; não a si mesmo nem o último admin; apaga auth.users → perfis em
  cascata). Início: `cardMural` = só a faixa de destaques; `cardLembretes` (cartão próprio, `#ini-lembretes`: guias, lembretes ≤7 dias/sem prazo/
  fixos e "Mais adiante"), `detalheLembrete`, `botoesLembrete` (`.lemb-fixo.on`); `dadosLembretes` devolve vis/futuros/todos. Selo da pessoa:
  pílula 11 px, 88 px, contorno `color-mix` (design.css); `_faSelo` não é usado para grupo/cliente (montar-erp). Sem `.alerta-tri`. Painel:
  `_orgV(r,k)` = em aberto + negociado (rosca e órgão da empresa), `_quebraRotulo` nos rótulos do gráfico. Parcelamentos: grupos recolhidos
  (`_parcGrpAbertos`), `_parcF` (filtros grupo/pag/prox/sit), `_parcAbrir(k)` = janela `.pcd`. Acordos: `.ac-saldo-linha` escondida.
  Tarefas: Grupo·Tarefa·Pessoa·Prioridade·Status·Prazo (régua: "Prazo" = `col-venc`). Clientes: `pillSimNao` verde/vermelho, `SITCAD_COR`.
  Escuro: tokens grafite (bg #15171C, surface #1C1F26) + `tema-escuro.js` com tons de grafite. Imagem do Parcelamentos do Backup 17:
  `sistema/prototipos/parcelamentos-backup17.png`.
- Backup 22 (base): padronização (prompt em `sistema/arquivo/PROMPT-BACKUP-22.md`). **Régua única:** `marcarColunas()` (erp-telas.js, no
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
- Backup 19 (base): enxuto (prompt em `sistema/arquivo/PROMPT-BACKUP-19.md`). SQL: pausa de e-mails (`configuracoes.emails_pausados`,
  trigger `email_fila_reter` → status `retido`; `pausar_emails`, `emails_retidos_acao(ids,'liberar'|'descartar')`, flag de sessão
  `erp.liberar_email`), `confirmar_email_usuario(perfil)` (admin libera a entrada sem o e-mail de confirmação). Testes rodam com a pausa
  desligada (`preparar-banco.sh`). Central de e-mails com abas (`AREAS_EMAIL`: fila/clientes/config/avisos/antiga; `pintarAreaEmail`,
  `pintarAdmin` redesenha a aba da Central quando está lá). Início: `cardMural` junta lembretes/guias (`dadosLembretes`, `htmlLembretes`),
  `coletarAlertas` sem o que o Início já mostra, `plural(n, um, varios)` no nucleo.js. Parcelamentos: remendo `remendos/parcelamentos-b19.js`
  (`_parcTodos`, `filtrarParc` = `_filtrarParcBase` sem concluídos, `renderParcAnalise` por grupo → órgão, `_parcDias`, `_parcDetalhe`).
  Acordos: `_acTodos`/`_acCaixaTodos` no remendo. Financeiro: `_faTabelaAtraso`, total no comparativo por pessoa, `cFaMes`/`cFcMes` com as
  cores próprias (pluginTema pula). Jurídico: `subnavJuridico` (erp-telas.js). Tabelas: `--th-bg/--th-fg` (navy). `estrutura.sql` = 4626 linhas.
- Backup 18 (base): design — tokens sóbrios + escuro preto, `design.css`, cores soltas dos CSS viraram tokens,
  gráficos com `--chart-*` e sem animação, `tema-escuro.js` sem tons azulados. Diagnóstico em `sistema/arquivo/DIAGNOSTICO-DESIGN-B18.md`.
- Backup 17 (base): Início: `cardResumoEscritorio` sem Processos (atraso/hoje/5 dias no mesmo cartão), `buscaPubAutomatica`
  (DJEN pelo navegador 1×/dia, localStorage `erp_pub_auto`). Painel "Empresas do grupo" = visual de Processos (#tblExecRanking em erp-telas.css).
  Acordos: lista `.acx-*` no remendo `acordos-b16.js`. CRM: 8 etapas abertas (nova "Follow-up da proposta", ordem 5), finais viram faixa
  `.cr-solte` (4+4 por linha em `crmFunil`). E-mails: `emails_central` devolve `contato`/`finalidade` (coluna "E-mail de destino"),
  `previa_email_manual` e `previa_email_modelo` (prévia com a marca). Publicações: destinatários com "Autor:/Réu:" (polo A/P), `partesPub`,
  função com timeout (`AbortSignal.timeout`, VERSAO 2026-10-02). PGFN: `cabecalhoPgfn` lê o CSV do site Dívida Aberta. Contratos: ficha
  (`.ctr-ficha`), tabela `contratos_aditivos` + `registrar_aditivo(p_contrato, p jsonb)`; `valor_competencia` usa o valor anterior ao aditivo.
  Prompt da rodada de design: `sistema/arquivo/PROMPT-DESIGN-BACKUP-18.md`. `estrutura.sql` = 4556 linhas.
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
