# Prompt — ERP Jurídico Araújo & Castro (completo, funcional e bonito)

> Como usar: copie este documento inteiro e envie para a IA/desenvolvedor que vai trabalhar no sistema,
> junto com o pedido da vez (ex.: "comece pela Fase 2"). Ele descreve o que já existe, as regras que não
> podem ser quebradas, tudo o que um ERP jurídico completo precisa ter e a ordem de construção.

---

## 1. Papel e objetivo

Você é o time de desenvolvimento do **ERP do escritório Araújo & Castro Advocacia e Consultoria** (direito
tributário, com uma segunda empresa de contabilidade). O dono é advogado, **leigo em tecnologia**: toda
entrega precisa vir com passo a passo simples, em português, dizendo exatamente onde clicar.

Objetivo: um **ERP jurídico completo, confiável e bonito**, usado por administradores, gerentes,
advogados, colaboradores com funções específicas (financeiro, comercial, operacional), estagiários e
**clientes** (portal). Nada de planilha no caminho: todo dado nasce e vive no sistema.

## 2. O que já existe (não refazer do zero)

- **Hospedagem**: telas estáticas na Vercel (`sistema/app`), publicadas a cada Merge no GitHub.
- **Banco**: Supabase (PostgreSQL + Auth + Row Level Security). Estrutura em `sistema/banco/estrutura.sql`
  (idempotente, versões v1…v5). Dados sensíveis dos advogados em `configuracoes` (fora do HTML público).
- **Telas**: `index.html` = ERP (gerado por `sistema/ferramentas/montar-erp.js` a partir do ERP.html original,
  com as telas do Gestão embutidas via `gestao-embutida.js` + `gs.css`). `gestao.html` = versão anterior,
  mantida até o dono mandar excluir.
- **Módulos prontos**: Início, Painel Executivo (passivo tributário; regra PF×PJ), Processos, Acordos,
  Parcelamentos (com parcelas), Honorários Jurídico e Contabilidade (Análise, A Receber, Recebidos,
  Prejuízo, A Pagar, Despesas; comissão = redutor de receita), Contratos (gera parcelas), Clientes,
  Tarefas (básico), Notificações/recibos, Administração (usuários, importar planilhas, backup, histórico),
  Portal do Cliente (somente leitura, por grupos).
- **Testes**: `sistema/testes/rodar-tudo.sh` (permissões no banco, importador, Gestão e ERP no navegador).

## 3. Regras que nunca podem ser quebradas

1. **Segurança**: a regra de acesso fica **no banco** (RLS). A chave `service_role`/secret **nunca** vai para
   o navegador nem para o repositório. Operações privilegiadas (e-mail, WhatsApp, assinatura, integrações)
   rodam em **Supabase Edge Functions** com segredos guardados no Supabase.
2. **LGPD**: repositório privado; nenhum dado real de cliente em código, teste ou print; testes só com dados
   fictícios; documentos em armazenamento privado com link temporário; registrar consentimento e finalidade.
3. **Nada se perde**: toda gravação passa pelo histórico (quem, quando, o quê, antes → depois). Exclusão só
   por quem tem permissão, com confirmação; preferir "arquivar" a apagar.
4. **Regras de negócio do escritório** (manter):
   - dívida de **PF não soma** no total do grupo (só PJ); dívida negociada entra; processos repetidos
     (polo ativo/passivo) contam uma vez;
   - **comissão/desconto é redutor de receita**, nunca despesa;
   - **"Em atraso"** = venceu e não foi pago, de **qualquer mês** (não depende do período filtrado);
   - situação é **calculada pelas datas** (Em atraso, Vence hoje, Em aberto, Recebido); ninguém digita;
   - valores em R$ com vírgula; datas dd/mm/aaaa na tela, ISO no banco; fuso America/Sao_Paulo.
5. **Entrega**: toda mudança vai por pull request com descrição simples; testes passando antes; SQL
   idempotente; informar **número de linhas** do SQL e a ordem: **1º Merge, 2º SQL**; manter como voltar
   (Vercel → Instant Rollback; GitHub → Revert). Nunca apagar o Gestão sem ordem expressa.

## 4. Princípios de tela (o que funcionou melhor)

- **Uma linha, uma informação**: vencimento, quem, o quê, pessoa, valor, situação. O resto fica no detalhe.
- **Ação na própria linha** (✓ Recebido, ↺ desfazer, Editar) e **rodapé "Última gravação"** com Desfazer.
- **Formulários curtos** (campos condicionais; "repetir todo mês").
- **Selos** para situação e cobrança, em vez de colunas extras.
- **Cada tela abre sem filtro herdado**; filtros visíveis e estáveis; ordenar clicando no título da coluna.
- **Sem blocos repetidos**: cada número aparece em um só lugar.
- **Visual**: barra superior (padrão Gestão), tamanhos do Gestão, cores do ERP (marinho #1B2A4A, dourado
  #C9A84C), fontes DM Sans / JetBrains Mono nos números; gráficos em rampa azul; cor fixa por pessoa
  (Pedro verde, Emanuelle vermelho-claro, Adriana azul, Escritório dourado). Tudo funciona no celular.
- **Menus suspensos testados com clique real** (o item precisa aparecer na tela, não só existir).

## 5. Perfis de usuário e permissões (granulares)

Substituir os papéis fixos por **perfis + permissões por módulo e ação** (ver, criar, editar, dar baixa,
excluir, exportar, ver valores, administrar). Perfis sugeridos:

| Perfil | Acesso |
|---|---|
| Administrador | Tudo, inclusive usuários, permissões, integrações, exclusões e backups |
| Gerente | Tudo do operacional e financeiro da sua área; aprova descontos, exclusões e prazos |
| Advogado | Seus clientes, processos, tarefas, prazos, documentos; financeiro só dos seus contratos (sem valores de terceiros, se configurado) |
| Financeiro | Contas a receber/pagar, cobrança, conciliação, relatórios financeiros; sem editar processos |
| Comercial | CRM, propostas, contratos em negociação; vê o financeiro só do que vendeu |
| Operacional / estagiário | Tarefas atribuídas, documentos, cadastro básico; sem valores |
| Cliente (portal) | Só os próprios grupos: processos, parcelamentos, acordos, documentos liberados, boletos/recibos |

Requisitos: permissões aplicadas **no banco** (RLS por perfil e por carteira/grupo), tela de perfis com
matriz módulo × ação, "entrar como" para o admin conferir o que cada perfil vê, 2FA opcional, expiração de
sessão, log de acesso (entrada, saída, IP aproximado, aparelho).

## 6. Módulos do ERP completo

### 6.1 Clientes — ficha 360° (ao clicar no cliente abre a ficha completa)
- Cabeçalho: nome, CPF/CNPJ, grupo, tipo (PF/PJ), responsável, situação, etiquetas, botões rápidos
  (nova tarefa, novo lançamento, novo documento, WhatsApp, e-mail).
- Abas: **Resumo** (números do cliente), **Contatos**, **Endereços**, **Contas bancárias**, **Sócios e
  vínculos**, **Processos**, **Contratos**, **Financeiro**, **Tarefas**, **Documentos**, **Linha do tempo**
  (tudo que aconteceu: ligações, e-mails, reuniões, gravações), **Dados fiscais** (débitos por órgão, CAPAG,
  regime, certidões com validade).
- **Vários contatos por cliente**, cada um com **tipo/finalidade** (financeiro, marketing, jurídico, sócio,
  contador, cobrança), nome, cargo, e-mail, telefone/WhatsApp, preferências de contato, "recebe boletos",
  "recebe notificações". Idem para **várias contas bancárias** (banco, agência, conta, PIX, titular, uso).
- Modelo: `contatos`, `enderecos`, `contas_bancarias`, `vinculos_societarios`, `etiquetas` ligados a `clientes`.

### 6.2 CRM — da chegada do cliente à assinatura e ao financeiro
Funil configurável (arrastar cartões entre colunas):
**Lead → Primeiro contato → Diagnóstico/Reunião → Proposta enviada → Negociação → Contrato enviado →
Assinado → Onboarding → Cliente ativo** (+ Perdido, com motivo).
- Oportunidade: origem (indicação, site, Instagram, evento…), quem indicou, serviço, valor estimado,
  probabilidade, responsável, próxima ação com data, histórico de interações, anexos.
- Atividades e follow-ups com lembrete; tarefas automáticas por etapa (ex.: "enviar proposta em 2 dias").
- **Proposta** gerada a partir de modelos (escopo, valores, condições) em PDF, com versão e aceite.
- **Contrato**: gerado pelo **gerador de contratos** do escritório (integração, 6.4), enviado para
  **assinatura eletrônica** (ZapSign, Clicksign, D4Sign ou Autentique) via Edge Function; o retorno
  (webhook) muda a etapa para **Assinado** sozinho.
- **Ao assinar, automaticamente**: cria/atualiza o **cliente** (com contatos), cria o **contrato** com o PDF
  assinado em Documentos, gera as **parcelas** em Honorários (com redutores/comissões previstos), cria o
  **fluxo de onboarding** (Tarefas, 6.3), envia boas-vindas por e-mail/WhatsApp e avisa o financeiro.
- Relatórios: funil com conversão por etapa, tempo médio por etapa, origem que mais converte, previsão de
  receita (valor × probabilidade), perdas por motivo, ranking por responsável.

### 6.3 Tarefas, prazos e fluxos (controle eficiente)
- Estrutura: **Projeto/Fluxo** (ex.: "Defesa em execução fiscal – Cliente X") → **Tarefas** → **Subtarefas**
  (até 3 níveis) → **Checklist**. Progresso do pai calculado pelas filhas.
- Campos: título, descrição, cliente/grupo, processo, contrato, responsável, participantes, prioridade,
  etiquetas, **prazo interno** e **prazo fatal** (legal), início, estimativa, status, anexos, comentários
  com @menção, dependências ("só começa quando X terminar").
- **Modelos de fluxo** por tipo de serviço (onboarding, defesa administrativa, execução fiscal, parcelamento,
  holding…) que criam a árvore de tarefas com prazos relativos (ex.: fatal −5 dias úteis).
- **Contagem de prazos em dias úteis** (feriados nacionais, estaduais MG, municipais e suspensões de
  tribunal configuráveis); prazos gerados a partir de publicações/intimações (6.5).
- Visões: **Lista**, **Kanban** por status, **Calendário**, **Minhas tarefas / Hoje / Atrasadas**, **Gantt**
  simples para fluxos; filtros por pessoa, cliente, prioridade, prazo.
- Recorrência (mensal, anual, "todo dia 10"), SLA por tipo, bloqueio de conclusão sem checklist completo.
- **Alertas escalonados**: D-5, D-2, D-1, D-0 e atraso; atrasado há X dias → avisa o gerente.
- **Notificações** (6.8) por **e-mail** e **WhatsApp**, com resumo diário às 8h ("seus prazos de hoje") e
  semanal para gerentes.
- **Relatórios**: produtividade por pessoa, no prazo × atrasadas, tempo médio por tipo, carga da equipe,
  prazos fatais dos próximos 30 dias (exportar PDF/Excel).

### 6.4 Documentos e integrações de documentos
- **Repositório de documentos** (Supabase Storage, bucket **privado**, link temporário para abrir):
  upload arrastando, pastas por cliente/contrato/processo, tipos (contrato, procuração, documentos pessoais,
  certidões, guias, comprovantes, petições), **versões**, validade com alerta (ex.: certidão vence em 10 dias),
  pré-visualização de PDF/imagem, busca por nome e etiqueta, quem enviou e quando.
- No **contrato** e no **lançamento financeiro**: campo "documento" com upload direto (o contrato assinado
  fica a um clique da parcela). Comprovante de pagamento anexado à baixa.
- **Gerador de contratos** existente: integrar por (a) API/webhook — o gerador envia o PDF + dados
  (cliente, valores, parcelas) e o ERP cria contrato, documento e parcelas; ou (b) botão "Gerar contrato"
  no ERP que abre o gerador já preenchido e recebe o arquivo de volta. Definir o formato (JSON) na Fase 4.
- Portal: cliente pode **enviar documentos** solicitados (checklist de onboarding) e baixar os liberados.

### 6.5 Jurídico
- **Processos**: capa (número CNJ, tribunal, vara, partes, polos, valor, fase, status, advogados), andamentos
  com data, audiências, prazos vinculados, documentos, tarefas, honorários do processo, custas.
- **Monitoramento**: integração com captura de andamentos e publicações (DataJud/CNJ gratuito para
  andamentos; Escavador, Jusbrasil, Codilo ou similar para publicações do DJe) → cria **prazo sugerido**
  para o advogado confirmar.
- **Acordos** e **Parcelamentos tributários** (já existem): alerta de parcela vencendo, emissão de guia,
  risco de exclusão por inadimplência, consolidação por grupo.
- Painel Executivo (já existe): passivo por órgão, CAPAG, situação cadastral, com regras PF×PJ.

### 6.6 Financeiro (Jurídico e Contabilidade)
- Contas a receber e a pagar, **redutores** (comissão, desconto), prejuízo, recorrência, parcelamento,
  **centros de custo** e **plano de contas** simples, rateio por sócio/pessoa.
- **Cobrança**: boleto e PIX automáticos (Asaas, Banco Inter ou Cora), **régua de cobrança** (lembrete
  D-3, no dia, D+1, D+7 por e-mail/WhatsApp), baixa automática pelo retorno do banco (webhook).
- **Conciliação bancária** por arquivo OFX/extrato; **fluxo de caixa** previsto × realizado; **DRE gerencial**;
  distribuição de lucros; comissões a pagar; **NFS-e** (emissão via integração da prefeitura/Asaas).
- Relatórios: recebido por mês, inadimplência, previsão, por cliente, por pessoa, por tipo de serviço,
  por centro de custo; exportação PDF/Excel.

### 6.7 Portal do Cliente
Acesso por e-mail e senha (link para criar senha), somente os grupos liberados: resumo, processos e
andamentos, parcelamentos e acordos, documentos liberados e envio de documentos solicitados, boletos,
recibos e 2ª via, tarefas que dependem do cliente ("enviar certidão"), mensagens com o escritório.

### 6.8 Notificações (central única)
- Canais: **no sistema** (sino com contador), **e-mail** (Resend ou SendGrid via Edge Function) e
  **WhatsApp** (API oficial do WhatsApp Business/Meta, Z-API ou Twilio via Edge Function).
- Eventos: prazo vencendo/vencido, tarefa atribuída, menção, parcela a vencer/vencida, pagamento recebido,
  contrato assinado, documento enviado pelo cliente, certidão vencendo, lead sem contato há X dias.
- Preferências por usuário (canal, horário, resumo diário) e por cliente (quem recebe o quê).
- Modelos de mensagem editáveis; registro de envio (entregue, lido, falhou) na linha do tempo do cliente.
- Agendamento por **cron** no Supabase (pg_cron) chamando Edge Functions.

### 6.9 Relatórios e painéis
Painel por perfil (sócio, gerente, advogado, financeiro, comercial) com os números do dia; relatórios
padronizados com filtros e exportação PDF/Excel; relatório mensal automático para os sócios.

### 6.10 Histórico e auditoria (detalhado)
Toda inclusão/alteração/exclusão com: quem, quando, tela, registro (nome legível), campos alterados com
antes → depois em rótulos legíveis, dados do registro excluído, origem (tela, importação, integração,
automação). Filtros por pessoa, tela, ação, período e busca; exportar CSV; histórico dentro de cada registro;
log de acessos e de envios (e-mail/WhatsApp); retenção configurável.

### 6.11 Administração e configurações
Usuários e perfis/permissões; dados do escritório e das duas empresas; pessoas (cores); feriados;
modelos (fluxos, mensagens, propostas, contratos); categorias, centros de custo, etiquetas; integrações
(chaves guardadas no Supabase, nunca na tela); importação/exportação; **backup automático diário** (além do
manual) e teste de restauração; ambiente de **homologação** separado da produção.

### 6.12 Integrações (ecossistema)
- Padrão: cada sistema externo fala com o ERP por **Edge Function + webhook**, com chave própria e log.
- Previstos: gerador de contratos, assinatura eletrônica, e-mail, WhatsApp, banco/boletos/PIX, NFS-e,
  captura de andamentos/publicações, Google Agenda (audiências e prazos), Google Drive (opcional, espelho
  de documentos), Zapier/Make/n8n para automações futuras.
- API interna documentada para os HTMLs próprios do escritório (ex.: Planejamento Tributário, Holding).

## 7. Correções imediatas (já tratadas nesta versão — conferir)

1. Menus **Jurídico** e **Financeiro** não abriam: o menu era cortado pela barra (corrigido; teste agora
   clica como uma pessoa e confere o item na tela).
2. Idem para Financeiro › Jurídico e Contabilidade.
3. Acesso ao **Gestão**: botão ⋯ → "Abrir o Gestão (versão anterior)" e endereço `/gestao.html`.
4. Barra superior sem o texto "ERP / Araujo & Castro — Advocacia e Consultoria".
5. Histórico com filtros (tela, ação, pessoa, período, busca), rótulos legíveis, dados de inclusões e
   exclusões, contadores e exportação CSV.
6. Telas mais enxutas: cada tela abre sem filtro herdado; sem os blocos "Visão Geral" e "Análise visual"
   repetidos nas abas de Honorários; Processos sem as colunas "Atualização" e "Procuração" (ficam no Editar).

## 8. Modelo de dados (acréscimos principais)

`perfis_acesso`, `permissoes` (perfil × módulo × ação), `usuarios_perfis`; `contatos`, `enderecos`,
`contas_bancarias`, `vinculos_societarios`, `etiquetas`, `cliente_etiquetas`; `oportunidades`,
`etapas_funil`, `interacoes`, `propostas`; `documentos` (arquivo no Storage, tipo, versão, validade,
vínculos), `assinaturas` (provedor, status, webhook); `fluxos`, `modelos_fluxo`, `tarefas` (com
`tarefa_pai_id`, prazo_interno, prazo_fatal, dependências, checklist), `comentarios`, `feriados`;
`andamentos`, `publicacoes`, `audiencias`; `cobrancas` (boleto/PIX), `conciliacoes`, `centros_custo`,
`plano_contas`, `notas_fiscais`; `notificacoes`, `preferencias_notificacao`, `envios` (e-mail/WhatsApp);
`integracoes`, `webhooks_log`; `acessos_log`. Todas com RLS, histórico e `criado_por/atualizado_em`.

## 9. Ordem de construção (fases com critério de pronto)

| Fase | Entrega | Pronto quando |
|---|---|---|
| 1 | Correções da seção 7 + ficha 360° do cliente (contatos, contas, endereços, abas) | Clicar no cliente abre a ficha com todas as abas e dados editáveis |
| 2 | Documentos (Storage privado) + upload no contrato e no lançamento | Contrato assinado abre a um clique da parcela; link expira |
| 3 | Tarefas completas (fluxos, subtarefas, prazos úteis, kanban/calendário, alertas no sistema) + modelos | Um modelo de fluxo cria a árvore com prazos certos; atrasos aparecem para o gerente |
| 4 | Notificações por e-mail e WhatsApp (Edge Functions + cron) | Resumo diário chega às 8h; registro de envio no cliente |
| 5 | CRM (funil, propostas) + integração gerador de contratos + assinatura eletrônica + automação pós-assinatura | Assinar gera cliente, contrato, parcelas e onboarding sozinho |
| 6 | Perfis e permissões granulares + portal ampliado | Cada perfil vê só o que deve (testado no banco) |
| 7 | Financeiro avançado: boletos/PIX, régua, conciliação, DRE, NFS-e | Pagamento do boleto dá baixa sozinho |
| 8 | Jurídico avançado: andamentos/publicações → prazos; audiências na agenda | Publicação vira prazo sugerido |
| 9 | Relatórios por perfil, backups automáticos, homologação, limpeza (excluir Gestão com ordem do dono) | Relatório mensal automático; restauração testada |

### Andamento
- **Fases 1, 2 e 3: entregues** (Backup 07). Ficha 360° com 12 abas; Documentos em Storage privado (link de 5 min) no cliente, contrato, lançamento e tarefa; Tarefas com lista em árvore, quadro, calendário, fluxos (dias úteis e feriados), relatório, checklist, recorrência, dependência, comentários com @menção e sino de avisos.
- Pendente nessas fases: liberar documentos no Portal do cliente (vai na fase 6).
- **Fases 4, 5, 7 e 8** usam serviços pagos de terceiros: aguardam a escolha do escritório (custos informados na entrega).

## 10. Como entregar cada fase

1. Explicar em 5 linhas o que muda para o usuário (sem termos técnicos).
2. Informar custos novos (ex.: WhatsApp, e-mail, assinatura, boletos) **antes** de contratar qualquer serviço.
3. Testes automáticos com dados fictícios, incluindo **cliques reais** nas telas novas e verificação de
   permissões no banco; prints das telas.
4. Pull request com descrição simples; SQL idempotente com número de linhas; passo a passo:
   **1) Merge → 2) SQL no Supabase → 3) Ctrl+Shift+R e conferir**; como voltar se não gostar.
5. Nunca pedir ou expor chaves secretas no chat; configurar segredos direto no painel do Supabase/Vercel,
   com instruções de onde clicar.
