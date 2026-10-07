# Sugestões práticas — Backup 48

Este documento analisa **todos os módulos** do ERP como estão hoje. A pergunta é sempre a mesma: o que deixa o uso **mais simples**, sem perder função.

**Nada foi alterado ainda.** Para aprovar, responda com os números: "aprovo 1, 4, 7; o 12 fica como está".
O prompt pronto para o próximo chat está em `sistema/PROMPT-BACKUP-49.md`.

Legenda: **Tirar** = remover · **Juntar** = unir duas coisas numa · **Completar** = falta algo · **Arrumar** = visual/simetria

---

## A. E-mails — os dois pedidos que você já fez

| # | O que é hoje | Sugestão | Tipo |
|---|---|---|---|
| 1 | Quem recebe e-mail é decidido em **6 lugares diferentes**: o "perfil de e-mail" do cliente (padrão / nunca / só vencimento / personalizado), o "recebe" de cada contato, a regra por setor (Administração), as automações ligadas, a lista de e-mails de teste e o desvio "modo teste". É difícil saber, olhando um cliente, se ele vai receber ou não. | Uma **chave única por cliente**: "✉ Recebe e-mails do escritório: Sim / Não", visível na lista de Clientes e na ficha (e em lote: marcar vários → Sim/Não). Por baixo, o "Não" vira o perfil "nunca". Os detalhes (qual contato, qual setor) ficam escondidos num "Avançado". | Juntar |
| 2 | Não existe uma tela que responda "para quem o sistema vai mandar e-mail este mês?". | Tela **"Quem recebe"** (em Administração → E-mail) com uma linha por cliente: e-mail de destino · ✉ Sim/Não · último e-mail enviado · próximo previsto. Filtro "sem e-mail cadastrado" (para corrigir antes do envio). | Completar |
| 3 | Antes de sair qualquer e-mail para cliente, não há uma conferência final em lote. | Fila **"Para revisar"**: os e-mails automáticos ficam aguardando um clique "Enviar todos" (ou um por um), com a prévia. Pode ser ligado/desligado. | Completar |
| 4 | O e-mail do **"Enviar guias do mês"** (Rotina) sai como **texto simples** (fonte Arial, sem a marca). Os outros e-mails (honorários, lembretes, recibo) usam o modelo bonito, com logo, faixa azul, quadro de valores e rodapé. | O rascunho das guias usa o **mesmo modelo dos e-mails bonitos**: logo, saudação, **quadro com as parcelas** (Parcelamento · Parcela x/y · Vencimento · Valor), caixa "Como pagar", rodapé com contato. O texto editável continua igual no cartão; só a aparência muda. | Arrumar |
| 5 | O mesmo vale para o rascunho dos **Acordos** (Emitir → Rascunho no Gmail). | Mesmo modelo do item 4. | Arrumar |
| 6 | Modo teste: hoje todo e-mail é desviado para pedromgsam@gmail.com, mas a tela não deixa isso evidente em todo lugar. | Faixa amarela fixa no alto, só para o administrador: "Modo teste: e-mails vão para pedromgsam@gmail.com — [Desligar]". Desligar pede confirmação. | Completar |

## B. Início

| # | O que é hoje | Sugestão | Tipo |
|---|---|---|---|
| 7 | Cinco blocos (validações, lembretes, resumo, aprovações, fila). Os números do "Resumo do escritório" repetem o que já existe em cada módulo. | Manter só **Lembretes** e **Minha fila**. O resumo vira uma linha fina de atalhos ("4 parcelas em atraso · 3 publicações novas"), clicáveis. | Juntar |
| 8 | A fila tem 4 modos (Lista, Mês, Semana, Dia). | Manter **Lista** e **Mês** (os dois que você usa). Semana e Dia continuam em Tarefas → Calendário. | Tirar |

## C. Tarefas

| # | O que é hoje | Sugestão | Tipo |
|---|---|---|---|
| 9 | Seis botões no topo (Modelos de fluxo, Feriados, Google Agenda, Delegar, + Novo fluxo, + Nova tarefa). | Ficar só **+ Nova tarefa** e **👥 Delegar**. Os outros quatro vão para um botão **⚙** ("Configurar"). | Juntar |
| 10 | Agora há **4 fileiras de filtros** (Em aberto/Concluídas · Lista/Semana… · Todas/Minhas/Hoje… · Prioridade) **mais** Mostrar/De quem. É filtro demais. | Unificar: "Minhas" sai (já existe em **De quem**); "Prioridade" vira um chip na mesma linha de **Mostrar**; "Em aberto / Concluídas / Excluídas" sobe para o título como abas. Ficam **2 linhas de chips**, como no Início. | Juntar |
| 11 | Cinco modos de ver (Lista, Minha semana, Quadro, Calendário, Fluxos). | Manter Lista, Calendário e Fluxos. "Minha semana" já existe no Calendário (vista semana) e o "Quadro" repete a Lista em colunas. | Tirar |
| 12 | Criação rápida ("Protocolar defesa amanhã @Emanuelle !alta"). | Manter, mas como ícone ⚡ ao lado de "+ Nova tarefa" (hoje ocupa uma faixa inteira). | Arrumar |

## D. Painel Executivo e Processos

| # | O que é hoje | Sugestão | Tipo |
|---|---|---|---|
| 13 | Gráfico "Evolução do passivo" + tabela "Empresas do grupo" na mesma tela, longa. | Gráfico recolhível (fechado por padrão, abre com um clique). | Arrumar |
| 14 | Os valores vêm resumidos (R$ 80k), o completo aparece só passando o mouse. | Manter; no celular mostrar o completo (lá não há "passar o mouse"). | Completar |
| 15 | Processos: a "última movimentação" é digitada à mão. | Botão **"Buscar movimentação"** que puxa da publicação mais recente do mesmo número (DJEN já é lido). | Completar |

## E. Parcelamentos, Acordos e Rotina

| # | O que é hoje | Sugestão | Tipo |
|---|---|---|---|
| 16 | O mesmo dado aparece em 3 lugares: Parcelamentos (cartões por grupo), Rotina → Planilha e Rotina → Enviar guias. | **Parcelamentos** = consulta (só ler). **Rotina** = trabalho (emitir, enviar, pagar). Tirar os botões de ação dos cartões de Parcelamentos. | Juntar |
| 17 | A aba **Acordos** da Rotina só leva para o módulo Acordos. | Tirar a aba da Rotina (o menu já tem Acordos). | Tirar |
| 18 | Rotina tem 6 abas com ícones e nomes longos ("📋 Planilha de parcelamentos"). | Nomes curtos e na ordem do mês: **Passivo · Processos · Guias do mês · Planilha · Minhas tarefas**. | Arrumar |
| 19 | Enviar guias do mês: falta ver, no fim, **quem ficou sem guia** (cliente sem e-mail, guia sem anexo). | Quadro final "Pendências do envio" com esses casos, antes de "Salvar todos os rascunhos". | Completar |
| 20 | Acordos: a "Situação dos acordos" e a tabela "A pagar" mostram quase o mesmo. | Uma lista só (por grupo), com as parcelas a pagar dentro de cada acordo. | Juntar |

## F. Financeiro e Contratos

| # | O que é hoje | Sugestão | Tipo |
|---|---|---|---|
| 21 | Financeiro Jurídico e Contabilidade têm desenhos diferentes (cartões, abas e cores). | Mesmo desenho nas duas: 5 cartões em cima, as mesmas abas, a mesma tabela. | Arrumar |
| 22 | Aba **Prejuízo** separada. | Virar filtro "perdas" dentro de Recebidos. | Juntar |
| 23 | Contratos: o reajuste anual da mensalidade é manual. | Aviso 30 dias antes do aniversário do contrato com o valor reajustado (salário mínimo ou índice) e botão "Aplicar". | Completar |
| 24 | Cobrança: "💬 Cobrar" só por WhatsApp. | Mesmo botão com a opção **E-mail** (modelo bonito do item 4), respeitando a chave do item 1. | Completar |

## G. Clientes, CRM e Documentos

| # | O que é hoje | Sugestão | Tipo |
|---|---|---|---|
| 25 | A ficha do cliente tem **13 abas**. | Juntar em 7: Resumo · Contatos e endereços · Sócios · Processos · Financeiro e contratos · Documentos · Histórico (linha do tempo + tarefas). Cartão CNPJ e dados fiscais entram no Resumo. | Juntar |
| 26 | O cadastro do cliente tem 6 abas e campos que quase ninguém preenche. | Cadastro rápido com 5 campos (nome, CPF/CNPJ, grupo, e-mail, telefone) + "Mais dados" para o resto. O CNPJ já preenche o resto sozinho. | Arrumar |
| 27 | CRM com 8 etapas abertas + 4 finais. | 5 etapas: Contato · Diagnóstico · Proposta · Negociação · Fechado/Perdido. | Juntar |
| 28 | Documentos: pasta por grupo e subpasta por empresa, mais o link do Drive. | Mostrar o **vencimento** (certidão, certificado) como selo colorido direto na pasta; filtro "vencendo em 30 dias" no topo. | Completar |

## H. Alertas, Automações, Publicações e Administração

| # | O que é hoje | Sugestão | Tipo |
|---|---|---|---|
| 29 | **Alertas** repete coisas que já aparecem no Início, na Rotina e nos módulos. | Alertas fica só com o que não tem outro lugar (cadastro incompleto, certidão/certificado vencendo, CNPJ irregular). | Tirar |
| 30 | **Automações** ainda mostra regras ligadas que dependem de e-mail ao cliente. | Agrupar as que mandam e-mail ao cliente num bloco "E-mails automáticos" com a chave geral do item 3. | Juntar |
| 31 | Publicações: lidas e novas na mesma lista. | Abrir sempre em "Novas"; "Marcar todas como lidas" no topo. | Arrumar |
| 32 | Administração tem 7 abas; "Automações" só leva para outra tela e Acessos/Histórico são de uso raro. | Abas: Usuários · Importar · E-mail · Backup. Automações sai daqui (já tem menu próprio); Histórico e Acessos vão para um "⋯ Mais". | Juntar |

## I. Visual e simetria (todas as telas)

| # | O que é hoje | Sugestão | Tipo |
|---|---|---|---|
| 33 | Cada tela coloca os botões de ação num lugar (alto à direita, dentro do cartão, embaixo). | Regra única: **ação principal** sempre no alto à direita (azul); ações da linha sempre na última coluna. | Arrumar |
| 34 | Filtros com desenhos diferentes (segmento cinza, chips coloridos, selects, botões). | Um único tipo de filtro em todo o sistema: **chips** como os de "Mostrar / De quem". | Arrumar |
| 35 | Títulos das telas: algumas têm subtítulo, outras não; ícones em algumas abas (Rotina, Administração) e em outras não. | Todas com título + subtítulo curto; abas sem ícone (ou todas com). | Arrumar |
| 36 | Tabelas com alinhamentos diferentes (valor à direita em umas, centralizado em outras). | Régua única: texto à esquerda, valores à direita, datas e situação centralizadas — com exceções só onde você pediu (Painel). | Arrumar |

---

### Os que eu faria primeiro (mais ganho, menos risco)
**1, 2, 4, 5** (e-mails — os seus pedidos), **10** (filtros de Tarefas), **16–18** (Rotina), **25** (ficha do cliente) e **33–34** (simetria).
