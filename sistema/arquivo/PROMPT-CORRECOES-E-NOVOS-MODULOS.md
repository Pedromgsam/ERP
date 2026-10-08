# Prompt — ERP Jurídico Araújo & Castro: correção de design, acessos, e-mail, CRM, publicações e tarefas

> Cole este texto inteiro para o assistente executar. Ele complementa o `sistema/PROMPT-ERP-COMPLETO.md`.
> As regras de lá continuam valendo: segurança, LGPD, SQL que pode rodar de novo sem erro, testes e passo a passo.
> Gerado em 27/09/2026. O diagnóstico da seção 2 veio de uma auditoria automática no navegador.
> Ela usou a skill **telas-com-dados-ac** e mediu 13 telas em 3 larguras (1440, 1024 e 390 px), com valores grandes.

---

## 1. Papel, regras e forma de entrega

Você é o desenvolvedor do ERP do escritório Araújo & Castro (advocacia tributária, MG).

**Tecnologia atual:**
- **Supabase:** banco, login e Storage. Projeto `https://kukpiyqwtaeuvkvfrjjm.supabase.co`, com chave publicável.
- **Vercel:** site estático, pasta `sistema/app`.
- **ERP:** `index.html` gerado por `sistema/ferramentas/montar-erp.js` + telas do Gestão embutidas (`gestao-embutida.js`, `gs.css`).
- **SQL:** `sistema/banco/estrutura.sql`, na versão v6.
- **Testes:** `sistema/testes/` (`rodar-tudo.sh`).

**Regras que não podem ser quebradas:**
1. **Chaves secretas:**
   - a chave secreta (service_role) **nunca** vai para o site, o repositório ou o chat;
   - tudo que precisa de privilégio roda em **Supabase Edge Function**;
   - as senhas de serviço ficam em **segredos do Supabase** ou numa tabela que ninguém lê pelo site (ver 5.4).
2. **LGPD:**
   - repositório privado;
   - nos testes, só dados fictícios;
   - não importar a coluna "Senha" das planilhas.
3. **Não mexer** no Google Apps Script. **Não apagar** `gestao.html` até ordem do dono.
4. **SQL:**
   - sempre em bloco novo (v7, v8…) no fim do `estrutura.sql`;
   - pode rodar duas vezes sem erro (`if not exists`, `drop … if exists`);
   - informar a **quantidade de linhas** do arquivo.
5. **Custos:** antes de contratar qualquer serviço pago, informar o custo e esperar o "ok".
6. **Toda entrega:**
   - o assistente testa (`rodar-tudo.sh` verde) e faz o commit;
   - gera o backup nomeado (`sh sistema/ferramentas/novo-backup.sh "Nome"`) e abre o PR;
   - o dono faz o Merge;
   - o assistente explica em português simples, na ordem: **1) Merge → 2) SQL no Supabase (Raw, Ctrl+A, Ctrl+C, conferir linhas) → 3) Ctrl+Shift+R**.
7. **Telas:** seguir as skills `padrao-web-ac` e `telas-com-dados-ac`:
   - barra azul em rampa;
   - rosca com cores contidas;
   - filtro não herdado;
   - ordenação no cabeçalho;
   - selos de situação;
   - nenhum menu morto.

---

## 2. Diagnóstico — o que falta melhorar (auditoria)

| # | Gravidade | Onde | O que acontece | Prova |
|---|---|---|---|---|
| D1 | **Alta** | Processos, Parcelamentos, Honorários (celular), Painel (celular) | "R$" fica numa linha e o número na de baixo ("R$ 1,85 / mi", "R$ 24.691") | medido em 1024 e 390 px |
| D2 | **Alta** | Acordos → Financeiro | Parcelas de **acordos** entram nas listas de **vencimentos** ao lado dos honorários: `_getVencRows()` junta Honorário + Acordo + Parcelamento. Vale para os selos do menu (`_recalcBadgesNow`), a tela Notificações, o Início antigo, as fichas de grupo e empresa e o painel do cliente (`renderDashboardCliente`) | código `index.html` |
| D3 | **Alta** | Administração no celular | Um campo de seleção passa 212 px para fora do card | medido em 390 px |
| D4 | Média | Todo o ERP | Valor abreviado em 4 formatos diferentes: `R$5,2M`, `R$ 3,69 mi`, `R$1,8M`, `R$12k` | fotos do Painel e de Processos |
| D5 | Média | Gráficos do ERP | Eixo em formato americano (`3,000,000`); gráfico vazio mostra eixo 0–1 em vez de "sem dados" | fotos do Painel e de Acordos |
| D6 | Média | Barra superior em 1024–1100 px | A barra fica vazia (só 🔔 e Sair) e o filtro flutuante (`#fb`) cobre o título da tela | foto de Processos em 1024 px |
| D7 | Média | Processos, Acordos | Blocos repetidos: "Análise da carteira" e "Processos — Visão Geral" mostram os mesmos números | foto de Processos |
| D8 | Média | Títulos de seção | Três estilos misturados: serifa dourada, serifa azul e DM Sans | fotos |
| D9 | Média | Tabelas pequenas (Grupo / Tribunal / Natureza) | Nome do grupo quebra em 2 linhas; coluna de valor estreita | foto de Processos |
| D10 | Baixa | Honorários (linhas com redutor) | "− R$ 20.629,50" e o selo "redutor" disputam a mesma célula | medido |
| D11 | Baixa | Histórico (Administração) | Filtro de datas usa `<input type="date">`, que a skill proíbe em filtro (redesenha no meio da digitação) | código `telas-admin.js` |
| D12 | Baixa | `index.html` | Cerca de 60 trechos do **CRM antigo** (`DB.crm`, `reunioesCRM`…) sem tela — código morto | código |
| D13 | Baixa | Clientes | Tabela larga: Tipo e Contato ocupam espaço sem ajudar na decisão | pedido do dono |
| D14 | Média | Permissões | Só existem 4 papéis (admin, equipe, cliente, inativo); não há como dar "só Financeiro" ou "só Contratos" | estrutura do banco |
| D15 | Média | Avisos | O sino só funciona com o sistema aberto; ninguém recebe e-mail | — |

Sem problema, conferido:
- nenhum item do menu leva a tela inexistente;
- nenhuma tela rola para o lado em 1440, 1024 ou 390 px;
- formulários de lançamento sem campo estourado em 1440 e 1024 px.

---

## 3. Projeto de correção — ordem de execução

| Etapa | Entrega | Itens do pedido | Pronto quando |
|---|---|---|---|
| 1 | Acordos fora do Financeiro + Clientes resumido | 6, 7 | Nenhum total, selo ou lista de honorários contém acordo; Clientes em 6 colunas com linha que expande |
| 2 | Design geral | 1 | A auditoria (seção 4.7) volta **zerada** nas 3 larguras |
| 3 | Funções de acesso | 3 | Pessoa com só "Financeiro" não vê nem grava Contratos, tanto na tela quanto no banco (teste SQL) |
| 4 | Lógica interna de tarefas | 8 | As regras automáticas da 7.2 criam tarefas sozinhas, sem duplicar |
| 5 | Avisos por e-mail | 2 | O admin configura o e-mail em 2 minutos pela tela; o resumo diário chega às 7h45 |
| 6 | CRM do zero | 4, 9 | Oportunidade → proposta → "Ganhou" cria cliente, contrato, parcelas e fluxo de onboarding |
| 7 | Buscador de publicações | 5 | Busca por OAB traz publicações do Diário de Justiça e cada uma vira tarefa com prazo sugerido |
| 8 | Nova auditoria e limpeza | 10 | Lista da seção 2 zerada; código morto do CRM antigo removido |

Cada etapa é um PR separado, com backup nomeado ("Backup 08 - …", "Backup 09 - …").

---

## 4. Etapa 2 — Design (item 1)

### 4.1 Valor em dinheiro nunca quebra
- Uma função única `moeda(v, {curto})` para todo o sistema (ERP e Gestão), com espaço **não separável** entre "R$" e o número (`R$ 100.000,00`).
- Em CSS, `.mono, .num, .kv, .kpi-v, td.valor {white-space:nowrap}`.
- Colunas de valor com largura mínima pelo maior valor (`min-width: 11ch`) e alinhadas à direita.
- **Formato curto único:** `R$ 1,85 mi`, `R$ 691 mil`, `R$ 950` (pt-BR, sempre com espaço), com o valor exato no `title`.
  - Proibido: `R$5,2M`, `R$12k`.
- Card de KPI: o valor diminui a fonte (`clamp(15px, 1.6vw, 22px)`) antes de quebrar; se ainda não couber, usa o formato curto e mostra o exato na linha de baixo.
- Célula com redutor: valor numa linha, selo "redutor" pequeno abaixo e alinhado à direita (sem disputar a mesma linha).

### 4.2 Campo nunca sai do card
- Regra global:
  - `input, select, textarea {max-width:100%; min-width:0; box-sizing:border-box}`;
  - `.grade > *, .duas-col > *, .card, .kpi {min-width:0}`.
- Grade de formulário:
  - `grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))`, que vira 1 coluna abaixo de 560 px;
  - nada de largura fixa em px nos campos.
- Selects da Administração (papel, grupos do Portal) em 100% da largura no celular.
- Filtros (`.filtros`) com `flex-wrap: wrap` e `.busca {min-width: 0; flex: 1 1 180px}`.

### 4.3 Barra superior e filtro flutuante
- Entre 1024 e 1100 px, mostrar à esquerda o nome da tela atual (ex.: "Processos") em vez de deixar a barra vazia.
- O filtro flutuante `#fb` passa a ficar **dentro** da página, logo abaixo do título da tela, sem cobrir nada.
  - No celular vira um botão "Filtros (2)" que abre uma folha inferior.
- Mostrar o recorte em vigor numa pílula (regra 5 da skill): "Grupo Alfa · Setembro/2026".

### 4.4 Uma só família visual
- **Fontes:** títulos de tela em Space Grotesk 22 px; títulos de seção em DM Sans 13 px maiúsculo, com espaçamento, em azul-marinho. Sai a serifa dourada e a azul.
- **Espaçamento:** escala 4 / 8 / 12 / 16 / 24 px; raio 12 px em card e 8 px em campo; uma sombra só.
- **Cores:** paleta do escritório (marinho `#1B2A4A`, ouro `#C9A84C`) e cores de alerta só para situação (pago, em atraso, hoje).
- **Blocos repetidos:** remover (Processos e Acordos ficam com um bloco de números + gráficos + tabela). A análise fica recolhível (regra 9 da skill).
- **Tabelas de resumo:** nome sem quebra, cortado com "…" e com `title`; valor com `nowrap`.
- **Gráficos:**
  - eixo em pt-BR (`R$ 3 mi`);
  - sem animação ao filtrar;
  - quando não há dados, mensagem "Nada para mostrar neste recorte" no lugar do eixo vazio;
  - barras em rampa azul;
  - rosca com as cores contidas da skill.
- **Celular:** tabelas viram cartões empilhados abaixo de 600 px (rótulo à esquerda, valor à direita).

### 4.5 Filtro de datas
- Trocar `<input type="date">` de **filtros** (Histórico, Análise) por texto com máscara `dd/mm/aaaa` + botão Aplicar.
- `31/11` vira `30/11`, com aviso (regra 4 da skill).
- Formulários de cadastro podem continuar com o calendário nativo.

### 4.6 Acessibilidade mínima
- Contraste ≥ 4,5:1 no texto.
- Foco visível no teclado.
- Botões de ícone (🔔, ⋯, ✎) com `aria-label`.

### 4.7 Teste que trava a regressão
Transformar a auditoria em teste permanente (`sistema/testes/visual.js`). Nas larguras 1440, 1024 e 390, com valores grandes (R$ 1.845.320,55), ela falha se:
- (a) algum texto com "R$" ocupar 2 linhas, contando pelas linhas do texto (`Range.getClientRects`), não pela altura da célula;
- (b) algum campo passar da borda do card;
- (c) houver rolagem lateral;
- (d) algum menu levar a tela inexistente;
- (e) algum gráfico vazio mostrar eixo.

---

## 5. Etapa 5 — Avisos por e-mail, configurados dentro do sistema (item 2)

### 5.1 O que o usuário vê
**Administração → E-mail** (só o admin):
- Escolha do "Serviço de envio":
  - **Gmail do escritório (recomendado, sem custo):** e-mail + **senha de app** do Google. A tela explica em 3 passos onde gerar: Conta Google → Segurança → Verificação em duas etapas → Senhas de app.
  - **Resend (alternativa):** chave de API. Plano grátis com limite diário; exige confirmar o domínio para enviar como @seudominio. Confirmar os limites e o preço atuais antes de sugerir.
- Nome do remetente (ex.: "ERP Araújo & Castro"), e-mail de resposta e botão **"Enviar e-mail de teste"**.
- **Preferências por pessoa** (cada usuário, no próprio perfil):
  - resumo diário (liga/desliga, horário);
  - aviso imediato de tarefa atribuída;
  - @menção;
  - prazo fatal D-2;
  - documento ou certidão vencendo.

### 5.2 Mensagens
- **Resumo diário, dias úteis às 7h45:**
  - "Seus prazos de hoje" e "atrasadas";
  - "Prazos fatais em 5 dias";
  - "Menções";
  - "Documentos e certidões vencendo";
  - para o admin: "Equipe: atrasos acima de 3 dias".
- **Imediatas:** tarefa atribuída, @menção, fluxo criado, publicação nova (etapa 7).
- Visual: HTML simples com a paleta do escritório, link "Abrir no ERP" e rodapé "Você recebe porque… — mudar preferências".
- Sem dado sensível de cliente no assunto. No corpo, só o necessário (nome da tarefa, prazo, cliente).

### 5.3 Como funciona por dentro
- **Tabela `email_fila`:**
  - campos: id, para, assunto, html, tipo, referencia, status (pendente / enviado / erro), tentativas, erro, criado_em, enviado_em;
  - a tela e os gatilhos só **inserem** na fila.
- **Edge Function `enviar-emails`:**
  - lê a fila com a chave de serviço;
  - envia por SMTP (Gmail) ou pela API (Resend);
  - marca o status e tenta de novo até 3 vezes.
- **Edge Function `resumo-diario`:** monta o resumo de cada pessoa a partir de tarefas, fatais, notificações, documentos e certidões, e põe na fila.
- **Agendamento:** `pg_cron` + `pg_net` chamando as funções. O resumo roda às 7h45 de segunda a sexta (horário de Brasília = 10h45 UTC); o envio da fila, a cada 5 minutos.
- Gatilho em `notificacoes`: se a pessoa quer aviso imediato daquele tipo, insere também em `email_fila`.
- Registro: todo envio fica no histórico e aparece na **Linha do tempo** do cliente quando o e-mail é para ele.

### 5.4 Segurança da senha do serviço
- Tabela `config_privada (chave, valor)`:
  - RLS ligado e **sem nenhuma policy**, então ninguém lê pelo site;
  - só a Edge Function (chave de serviço) lê.
- O admin **grava** pela RPC `salvar_config_email(...)`:
  - é `security definer` e confere `eh_admin()`;
  - nunca devolve a senha; a tela mostra só "••••configurado em 27/09".
- Documentar como apagar e trocar a senha.

### 5.5 Teste
- Servidor de teste com SMTP falso (grava em memória).
- Casos: fila → enviado; erro → tentativa; preferência desligada → não enfileira; cliente nunca recebe e-mail interno.

---

## 6. Etapa 3 — Funções de acesso por pessoa (item 3)

### 6.1 O que o usuário vê
Em **Administração → Usuários**, ao cadastrar ou editar uma pessoa:
- **Papel:** Administrador, Equipe, Cliente (Portal) ou Inativo, como hoje.
- **Funções** (caixas de marcar, só para "Equipe"), cada uma com **Ver** e **Editar**:

| Função | Dá acesso a |
|---|---|
| Financeiro — Jurídico | Honorários do escritório, lançamentos, recibos |
| Financeiro — Contabilidade | Honorários da contabilidade |
| Contratos | Contratos e parcelas geradas por eles |
| Clientes | Cadastro, ficha 360°, contatos, contas |
| Jurídico | Processos, acordos, parcelamentos, publicações |
| Tarefas | Tarefas, fluxos, modelos (todas as pessoas vêem as **próprias** tarefas mesmo sem esta função) |
| Documentos | Enviar e abrir documentos |
| CRM | Oportunidades, propostas, funil |
| Relatórios | Painel Executivo e PDFs |
| Administração | Usuários, importação, backup, histórico |

- **Modelos prontos** para marcar de uma vez: "Sócio" (tudo), "Financeiro", "Jurídico", "Atendimento/Comercial", "Estagiário" (Ver em Jurídico e Tarefas).
- Menu, "+ Lançar" e botões escondem o que a pessoa não pode usar. Se ela abrir a tela pelo endereço, aparece "Sem acesso a esta área".

### 6.2 No banco (a proteção de verdade)
- Coluna `perfis.funcoes jsonb` (ex.: `{"financeiro":"editar","contratos":"ver"}`). O admin tem tudo implicitamente.
- Função `pode(funcao text, nivel text default 'ver') returns boolean`, com `security definer`, `stable`, e cache por requisição.
- Reescrever as policies de cada tabela:
  - `lancamentos` → `pode('financeiro_juridico')` ou `pode('financeiro_contab')`, conforme a empresa;
  - `contratos` → `pode('contratos')`;
  - `processos`/`acordos`/`parcelamentos`/`parcelas` → `pode('juridico')`;
  - `tarefas` → `pode('tarefas')` **ou** a tarefa é da pessoa;
  - `documentos` → `pode('documentos')` **e** acesso ao módulo do vínculo (documento de lançamento exige financeiro);
  - `crm_*` → `pode('crm')`;
  - `historico` → `pode('administracao')`.
- Storage `documentos`: a mesma regra, via função que confere o registro dono do arquivo.
- Migração: toda "equipe" atual recebe todas as funções em "editar", para ninguém perder acesso no dia da troca.
- Teste SQL: uma pessoa por modelo tenta ler e gravar cada tabela; o resultado tem que bater com a matriz acima.

---

## 7. Etapa 4 — Lógica interna para controlar as tarefas (item 8)

### 7.1 Situação calculada (não digitada)
- Cada tarefa ganha um **semáforo**:
  - 🟢 no prazo;
  - 🟡 vence em até 2 dias úteis;
  - 🔴 atrasada;
  - ⚫ prazo fatal em risco: prazo interno vencido e fatal em até 3 dias úteis.
- A **fila de trabalho** de cada pessoa na tela Início é ordenada por:
  1. prazo fatal em risco;
  2. atrasadas;
  3. fatal mais próximo;
  4. prioridade;
  5. prazo interno.

### 7.2 Regras automáticas
As tarefas nascem sozinhas: gatilhos no banco + a rotina diária (a mesma do e-mail). Cada regra tem uma **chave** para nunca duplicar.

| Quando | Cria | Para |
|---|---|---|
| Contrato criado (ou CRM "Ganhou") | Fluxo "Onboarding de cliente" | responsável do cliente |
| Parcela de honorário vence e não foi paga (D+3) | "Cobrar honorário — {cliente} {mês}" | Financeiro |
| Certidão ou documento com validade em 15 dias | "Renovar {certidão} — {cliente}" | responsável do cliente |
| Processo novo cadastrado | "Conferir processo {número} e prazos" | advogado do processo |
| Parcela de **parcelamento do cliente** vencendo em 5 dias | "Emitir guia e enviar ao cliente" | responsável |
| Parcela de **acordo do cliente** vencendo em 5 dias | "Lembrar cliente do acordo com {credor}" | responsável (tarefa de acompanhamento; **nada** no financeiro) |
| Publicação nova (etapa 7) | "Analisar publicação {processo}", com prazo sugerido | advogado da OAB |
| Tarefa atrasada há mais de 3 dias úteis | Aviso ao admin; após 5 dias, sobe a prioridade | admin |

- Tela **Tarefas → Regras**: liga e desliga cada regra, define dias e responsável padrão. Por padrão todas vêm ligadas, exceto "Cobrar honorário".

### 7.3 Controles
- **Carga por pessoa:** horas estimadas das abertas na semana. Aviso ao atribuir se passar de 40 h.
- **Não concluir sem:** checklist completo (já existe) e, quando a tarefa pedir, **documento anexado** ("exige anexo" — ex.: protocolo).
- **Tempo:** botão ▶/■ para registrar horas gastas (`tarefa_tempos`). O relatório compara estimado × gasto por pessoa e por cliente.
- **Revisão:** tarefa marcada "exige revisão" vai para "Aguardando revisão" do revisor antes de concluir.
- **Métricas no Relatório:**
  - % no prazo por pessoa e mês;
  - tempo médio de conclusão;
  - fatais cumpridos (a meta é 100%).

---

## 8. Etapas 6 — CRM do zero, dentro do sistema e sem serviço extra (itens 4 e 9)

**Antes de começar:** remover do `index.html` o código do **CRM antigo** (`DB.crm`, `crmAtivos`, `reunioesCRM`, `interacoesCRM`), que não tem tela.

### 8.1 Cadastros (SQL v8)
- `crm_oportunidades`:
  - id, titulo, **prospecto** (nome, cpf_cnpj, e-mail, telefone, empresa) ou `cliente_id` quando já é cliente;
  - origem (indicação, site, evento, contador parceiro, cliente atual), indicado_por;
  - etapa, valor_estimado, honorario_tipo (fixo, mensal, êxito, misto), probabilidade;
  - responsavel, proxima_acao, proxima_acao_em, motivo_perda, ganho_em, perdido_em, obs.
- `crm_etapas`: nome, ordem, probabilidade padrão, cor. Editáveis. Padrão:
  1. Novo contato;
  2. Diagnóstico agendado;
  3. Diagnóstico feito;
  4. Proposta enviada;
  5. Negociação;
  6. Ganhou;
  7. Perdeu.
- `crm_atividades`: oportunidade, tipo (ligação, reunião, WhatsApp, e-mail, anotação), quando, resumo, feita. Vira tarefa se tiver data futura.
- `crm_propostas`: oportunidade, versão, itens (serviço, valor, forma de pagamento), validade, status (rascunho, enviada, aceita, recusada), `documento_id` (o PDF gerado).
- `crm_modelos_proposta`: textos-padrão por serviço (holding, defesa em execução fiscal, parcelamento, consultoria mensal) com campos `{cliente}`, `{valor}`, `{parcelas}`.

### 8.2 Telas
- **CRM → Funil (kanban):**
  - uma coluna por etapa; arrastar muda a etapa;
  - cartão com valor, dias parado e próxima ação;
  - vermelho quando a próxima ação está atrasada.
- **CRM → Lista:** filtros por responsável, origem e período, com total ponderado (valor × probabilidade).
- **Ficha da oportunidade**, em abas:
  - Resumo;
  - Atividades (linha do tempo);
  - Propostas (gerar, versionar, marcar enviada);
  - Documentos;
  - "Converter".
- **Proposta:**
  - gerada **dentro do sistema** a partir do modelo;
  - tela de prévia editável → "Salvar PDF" (impressão do navegador, regra 10 da skill) → guardada em Documentos;
  - "Enviar por e-mail" usa a etapa 5 (sem serviço extra) ou link wa.me.
- **Painel do CRM:**
  - funil com conversão entre etapas;
  - ganhos e perdas no mês;
  - motivos de perda;
  - origem que mais converte;
  - tempo médio até fechar;
  - previsão ponderada dos próximos 3 meses.

### 8.3 "Ganhou" (automação interna)
Ao mover para **Ganhou**, uma janela confere e cria, **numa transação só** (RPC `crm_ganhar(oportunidade, dados)`):
1. o cliente, se ainda não existe, e o grupo;
2. o contrato com as parcelas (usa o gatilho que já existe);
3. o fluxo "Onboarding de cliente" (etapa 4);
4. a interação "Contrato fechado" na Linha do tempo;
5. o vínculo da proposta aceita aos documentos do contrato.

Ao mover para **Perdeu**, o motivo é obrigatório e uma tarefa de "reativar em 6 meses" é opcional.

### 8.4 Integração futura
Assinatura eletrônica (ZapSign, Clicksign) fica fora desta etapa. Quando o dono decidir, só troca o passo "Salvar PDF" por "Enviar para assinatura".

---

## 9. Etapa 7 — Buscador de publicações via API (item 5)

### 9.1 Fonte gratuita
- **API pública do CNJ para comunicações processuais** (Diário de Justiça Eletrônico Nacional / "Comunica PJe"). Busca publicações por **número da OAB + UF**, por nome da parte ou por número do processo.
  - Antes de programar, **confirmar o endereço atual e os parâmetros** na documentação oficial do CNJ.
  - Referência esperada: `comunicaapi.pje.jus.br`, com filtros como `numeroOab`, `ufOab`, `nomeParte`, `numeroProcesso`, `dataDisponibilizacaoInicio/Fim`.
- **Complemento opcional:** API pública **DataJud** (CNJ) para andamentos processuais pelo número do processo. Usa a chave pública informada pelo CNJ.
- **Sem custo.** Se a cobertura de algum tribunal (ex.: TJMG) for insuficiente, **informar antes** e oferecer serviço pago (Escavador, Jusbrasil, Digesto) com preço.

### 9.2 Como funciona
- Edge Function `buscar-publicacoes`:
  - a chamada sai do servidor, sem expor nada e sem liberar outro domínio no site;
  - consulta a API por cada OAB cadastrada;
  - guarda em `publicacoes` (id_origem único, data, tribunal, órgão, tipo, processo, partes, texto, link, oab, status: nova, lida, tratada, descartada).
- **Agendamento:** todo dia útil às 7h e 13h, mais o botão "Buscar agora".
- **Cadastro:** Administração → Publicações, com OABs a monitorar (número, UF, advogado) e nomes de partes (opcional).
- **Tela Jurídico → Publicações:**
  - lista com filtros (nova, lida, tratada; advogado; tribunal; período) e busca no texto;
  - destaque das palavras "intimação", "prazo", "sentença", "audiência";
  - vínculo automático ao processo quando o número bate com `processos.numero`;
  - botão **"Criar tarefa"**, com prazo sugerido pelo tipo (ex.: intimação = 15 dias úteis) editável e contado em dias úteis com feriados;
  - botão "Marcar tratada".
- **Avisos:** publicação nova gera notificação no sino e e-mail imediato ao advogado da OAB.
- **LGPD:** publicações são públicas, mas ficam só para a equipe com a função "Jurídico".

---

## 10. Etapa 1 — Acordos fora do Financeiro (item 6) e Clientes resumido (item 7)

### 10.1 Acordos não são financeiro do escritório
- **Regra:**
  - **Financeiro = lançamentos do escritório** (honorários, despesas, redutores);
  - **Acordos e parcelamentos = dívidas do cliente com terceiros.**
  - Nunca somam juntos, nunca aparecem no mesmo total ou selo, nunca na mesma lista.
- **Corrigir no `index.html`** (pelo `montar-erp.js`, sem editar o gerado):
  - `_getVencRows()` ganha o parâmetro `escopo`: `'financeiro'` traz só honorários; `'cliente'` traz acordos e parcelamentos;
  - os selos do menu Financeiro e os totais de Honorários usam só `'financeiro'`;
  - a tela Notificações separa em duas abas: **"Honorários a receber"** e **"Dívidas dos clientes (acordos e parcelamentos)"**;
  - fichas de grupo e empresa: blocos separados, com títulos "Honorários" e "Dívidas com terceiros";
  - Painel do cliente (Portal): o cliente vê as dívidas dele; honorários do escritório só se um dia for liberado.
- Conferir também:
  - Análise, "Em atraso" e o PDF de relatório;
  - `erp-dados.js`: acordos nunca viram `financeiro`;
  - o Início novo;
  - o sino.
- **Teste:** com 1 acordo vencido de R$ 128.450,90 e 1 honorário vencido de R$ 900, o Financeiro e seus selos mostram **só R$ 900**, e a aba "Dívidas dos clientes" mostra o acordo.

### 10.2 Clientes: tela resumida com expansão
- Colunas: **Grupo, Nome (sócio-administrador abaixo), CPF/CNPJ, Responsável, Procuração, Certificado, Situação**.
  - Saem **Tipo** e **Contato**. O filtro de tipo no topo continua.
- Clicar na linha **expande logo abaixo** um painel com:
  - contatos principais (financeiro e jurídico), telefone, e-mail, endereço;
  - regime, CAPAG, débitos por órgão;
  - contratos ativos, a receber, tarefas abertas, últimos documentos;
  - botões "Abrir ficha completa", "Editar", "WhatsApp", "E-mail".
- Clicar de novo recolhe. Só uma linha aberta por vez. Setas ▸/▾ e teclado (Enter) funcionam.
- No celular, cada cliente é um cartão; tocar expande.

---

## 11. Conferência final (antes de cada PR)
- `rodar-tudo.sh` verde + o novo `visual.js` verde.
- Checklist da skill `telas-com-dados-ac`:
  - filtro sem piscar;
  - cores de gráfico;
  - ordenação;
  - selos completos;
  - nenhum menu morto;
  - nenhum filtro herdado.
- SQL: rodado 2 vezes seguidas sem erro; linhas informadas.
- Fotos das telas alteradas (1440 e 390 px) conferidas.
- Backup nomeado criado e PR aberto.
- Na resposta ao dono:
  - o que mudou, em 5 linhas;
  - o passo a passo (Merge → SQL → Ctrl+Shift+R);
  - custos, se houver.

## 12. Decisões que o dono precisa tomar (perguntar só quando chegar a etapa)
1. **E-mail:** Gmail do escritório com senha de app (sem custo) ou Resend (tem plano grátis; confirmar limites e preço atuais)? Qual endereço envia?
2. **Publicações:** quais OABs e UFs monitorar? A fonte gratuita do CNJ atende, ou vale testar um serviço pago?
3. **Funções:** confirmar os modelos de acesso ("Sócio", "Financeiro", "Jurídico", "Atendimento", "Estagiário") e quem fica em cada um.
4. **CRM:** as etapas do funil e os modelos de proposta (serviços e valores de referência).
5. **Planilha "11 - Financeiro - Adriana":** importar ou não.

---

## Andamento (27/09/2026) — executado (Backup 08)
- Etapas 1 a 8 entregues: acordos fora do Financeiro; Clientes resumido com detalhe; design unificado com teste visual;
  funções de acesso (banco + tela); lógica das tarefas (regras automáticas, semáforo, fila, revisão, anexo, horas);
  e-mail (Gmail/SMTP/Resend) com resumo diário; CRM do zero; buscador de publicações (API pública do CNJ).
- SQL: v7 a v11 no `estrutura.sql`. Funções: `supabase/functions/erp-emails` e `supabase/functions/erp-publicacoes`.
- A busca de publicações foi testada contra uma imitação da API; a primeira busca real deve ser conferida
  (a resposta bruta de cada publicação fica guardada no campo `bruto` para ajuste, se o CNJ mudar algum nome de campo).
