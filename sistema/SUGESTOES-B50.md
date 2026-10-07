# Sugestões — Backup 50 (foco: Rotina, velocidade e e-mail)

Esta análise passou de novo por todos os módulos, com mais atenção à **Rotina**, à **velocidade** (demora para abrir "Guias do mês" e "Planilha" e para marcar "Pago"), às **tarefas recorrentes** e à **configuração de e-mail**.
A pergunta foi sempre a mesma: o que deixa o sistema **mais funcional e integrado**, sem ficar complicado?

**Feito no Backup 51:** V1 a V7, T1 a T3, R1, R3, R4 e E1 a E4 (detalhes em `COMO-ATUALIZAR.md`, seção Backup 51). Os demais continuam como sugestão.
Para aprovar, responda com os números. Exemplo: "aprovo V1 a V6, T1, R1 e E1; o G4 fica para depois".
O prompt pronto para o próximo chat está em `sistema/PROMPT-BACKUP-51.md`.

Legenda: **Novo** = função nova · **Juntar** = unir duas coisas numa · **Tirar** = remover · **Arrumar** = visual ou ordem

---

## V. Velocidade — tirar a demora (prioridade máxima)

**Onde está a demora hoje** (conferido no código):

- **Ao abrir "Guias do mês" ou "Planilha"**
  - O sistema baixa **todas as parcelas de todos os parcelamentos**, inclusive as pagas há anos.
  - O banco entrega no máximo 1.000 linhas por vez, então os pedidos vão em fila, um depois do outro.
  - Esse download inteiro acontece de novo cada vez que se troca de aba.
  - Depois, todos os blocos são desenhados de uma só vez, até os de grupos que não estão na tela.
- **Ao clicar "Pago"**
  - Aparece uma pergunta de confirmação.
  - O sistema grava a baixa e, antes de responder, faz uma consulta a mais (a lista de grupos), que não é necessária.
  - Ao sair da Rotina, ele **recarrega o ERP inteiro**, só para atualizar as outras telas.

| # | Como é hoje | Sugestão | Tipo |
|---|---|---|---|
| V1 | Baixa o histórico inteiro de parcelas a cada clique na aba. | O banco devolve **pronto e enxuto** (uma consulta só) apenas o que a tela usa: as parcelas em aberto, as do mês, as dos últimos 3 meses e um resumo das antigas (quantas foram pagas e o total). | Arrumar |
| V2 | Trocar entre "Guias do mês", "Planilha" e voltar busca tudo de novo. | Os dados ficam **guardados na memória** enquanto a Rotina está aberta. Ao gravar, só a parcela mudada é atualizada. O botão "↻ Atualizar" busca de novo quando se quiser. | Novo |
| V3 | Todos os grupos e blocos são desenhados de uma vez. | Desenhar **só o grupo aberto** (os outros, quando forem clicados) e mostrar a tela na hora, com um esqueleto cinza no lugar dos números até os dados chegarem. | Arrumar |
| V4 | "Pago" espera o banco responder para mudar a tela. | **Marca na hora** (a tela muda no clique) e grava por trás. Se der erro, volta ao estado anterior e avisa. A confirmação vira um "Desfazer" de 5 segundos. | Arrumar |
| V5 | Depois de uma baixa, sair da Rotina recarrega o ERP inteiro. | Atualizar **só a tela que mostra aquele dado** (Parcelamentos), e só quando ela for aberta. | Arrumar |
| V6 | Não se mede a velocidade. | Um **teste de tempo** com dados fictícios grandes (300 parcelamentos, 15 mil parcelas). Meta: "Guias do mês" e "Planilha" abrem em **menos de 1 segundo**, e "Pago" responde em **menos de 0,2 segundo**. O mesmo teste vale para Financeiro, Painel e Clientes. | Novo |
| V7 | Faltam índices no banco para as consultas da Rotina. | Índices em `parcelas (parcelamento_id, pago, vencimento)` e nos campos usados pelo resumo (V1). Não custa nada e o banco responde mais rápido. | Arrumar |

## T. Tarefas recorrentes com datas certas

| # | Como é hoje | Sugestão | Tipo |
|---|---|---|---|
| T1 | "Repetir" só tem: toda semana, todo mês e todo ano, contando a partir do prazo da tarefa. Não dá para dizer "toda segunda" nem "dias 5 e 20". | Regra de repetição completa, com a data de início e a data de fim (opcional):<br>• **Toda semana** nos dias escolhidos (ex.: segunda; ou segunda e quinta)<br>• **A cada N semanas** (ex.: quinzenal, toda 2ª segunda)<br>• **2× ao mês** nos dias escolhidos (ex.: dias 5 e 20)<br>• **Todo mês** no dia N, ou no N.º dia útil (ex.: 5º dia útil), ou na última sexta<br>• **Todo ano** numa data<br>Feriado ou fim de semana: escolher se a tarefa passa para o dia útil seguinte (usa os feriados já cadastrados). | Novo |
| T2 | A próxima tarefa só nasce quando a anterior é concluída. Se ninguém concluir, a agenda do mês seguinte fica vazia. | As próximas ocorrências já aparecem **na agenda e no Google Agenda** (as próximas 4 a 8), mesmo que a anterior esteja aberta. Concluir uma não mexe nas outras. | Novo |
| T3 | Para mudar a regra, é preciso editar uma tarefa por vez. | Ao editar uma tarefa recorrente, perguntar: **"só esta"** ou **"esta e as próximas"**. Na tela, a regra aparece escrita por extenso (ex.: "↻ toda segunda, a partir de 13/10"). | Novo |

## R. Rotina (o trabalho do mês) — prioridade

| # | Como é hoje | Sugestão | Tipo |
|---|---|---|---|
| R1 | Cada aba (Passivo, Processos, Guias do mês, Planilha, Minhas tarefas) mostra só o que é dela. Não existe um lugar que diga **o quanto do mês já foi feito**. | No alto da Rotina, um **placar do mês** com quatro números clicáveis: guias enviadas (12 de 18), pagamentos conferidos, passivo conferido e processos conferidos nos últimos 15 dias. Cada número leva direto ao que falta. | Novo |
| R2 | A ordem do trabalho fica na cabeça de quem faz. | Os passos do mês aparecem em sequência: **1 Emitir → 2 Enviar → 3 Conferir pagamento → 4 Conferir passivo e processos**, cada um com ✓ quando termina. Quem está começando segue a ordem sem precisar perguntar. | Arrumar |
| R3 | "Guias do mês" e "Planilha" mostram as mesmas parcelas de jeitos diferentes. | Juntar: a Planilha vira a **visão mensal** da mesma lista. Ao clicar numa parcela da Planilha abre o mesmo cartão de envio, e depois do vencimento o botão "Pago" fica no próprio cartão. | Juntar |
| R4 | No Passivo e nos Processos, a conferência é feita linha por linha. | Botão **"✓ Conferir o grupo todo (sem alteração)"** em cada grupo, para o mês em que nada mudou. | Novo |
| R5 | Processos: a publicação nova aparece só no módulo Publicações. | Na linha do processo, um selo **"📰 publicação nova"**. Ao conferir, o texto da publicação já vem preenchido (o "Buscar movimentação" do Backup 49 passa a ser automático). | Novo |
| R6 | "Minhas tarefas" mistura as tarefas da rotina com as outras. | Essa aba fica só com o **checklist da rotina** (as recorrentes). As outras tarefas continuam em Tarefas. | Arrumar |
| R7 | Não há um "fechamento" do mês. | Botão **"Fechar o mês"**: gera um resumo (o que foi enviado, pago e conferido, e o que ficou pendente com o motivo) e manda para o supervisor. Ele fica no histórico. | Novo |
| R8 | Cada aba tem filtros próprios (grupo, tribunal, situação). | Uma **busca única por empresa ou grupo** no topo da Rotina, que vale para todas as abas. Os outros filtros viram chips iguais aos do Início. | Juntar |
| R9 | Se ninguém abrir a Rotina, nada avisa que as guias não saíram. | Aviso automático no **dia 5** (configurável): "faltam 6 guias para enviar". Entra em Alertas e na faixa do Início. | Novo |
| R10 | A Planilha mostra as parcelas, mas não o **total do mês por cliente**. | Uma linha de total por empresa: "a pagar este mês: R$ 3.200 em 4 guias". Com um clique, esse resumo vai no e-mail das guias. | Novo |

## E. E-mail — a configuração está confusa

| # | Como é hoje | Sugestão | Tipo |
|---|---|---|---|
| E1 | A aba "Configuração" tem num bloco só: serviço, senha, remetente, dados de pagamento do escritório, conta da Contabilidade, dados de pagamento da Contabilidade, botões técnicos e a lista dos últimos e-mails. | Três passos, um embaixo do outro: **1. Contas que enviam** (Escritório e Contabilidade lado a lado, com o mesmo formulário) · **2. Dados para pagamento** (lado a lado) · **3. Testar** (um botão só, que confere tudo e manda um e-mail de teste). | Arrumar |
| E2 | Gmail, SMTP e Resend aparecem para todo mundo. | O **Gmail** fica como padrão. "Outro serviço (SMTP/Resend)" vai para um "Avançado", fechado. | Tirar |
| E3 | Botões técnicos à vista: "Verificar funções", "Enviar fila agora" e "Mandar resumo do dia agora". | Esses botões vão para um **⋯ Ferramentas**. O botão "Testar" do E1 já faz a verificação. | Tirar |
| E4 | "Últimos e-mails" fica dentro da Configuração, e "Para revisar" fica em outra aba. | Uma **Caixa de saída** com filtros: Para revisar · Na fila · Enviados · Com erro. Cada linha tem 👁 prévia e "tentar de novo". | Juntar |
| E5 | Os modelos de e-mail (lembrete, cobrança, guias, acordo, recibo) só se veem pelos botões "Ver modelo". | Aba **Modelos**: a lista dos tipos com a prévia ao lado, e o texto de cada um editável. | Juntar |
| E6 | Ainda existem a tela antiga de "perfis de e-mail" (Padrão, Só no vencimento…) e o "Avançado" no cadastro. | Fica só a chave **Recebe Sim/Não** + "Avançado" na ficha. A tela antiga de perfis sai. | Tirar |
| E7 | Em "Quem recebe" não se via o histórico de cada cliente. | Ao lado do último e-mail, o link **"ver todos"** abre os e-mails daquele cliente (o que saiu, quando, se deu erro). | Novo |
| E8 | O problema no e-mail só aparece quando se abre a aba. | Na aba **E-mail** do menu, uma bolinha verde (está saindo) ou vermelha (tem erro ou falta configurar). | Novo |

**Feito agora (Backup 50):** em **Quem recebe**, o nome do cliente abre o cadastro na aba Contatos, e o **✎** troca o e-mail de destino ali mesmo.

## G. Outros módulos — novas funções e integração

| # | Como é hoje | Sugestão | Tipo |
|---|---|---|---|
| G1 | Para procurar um cliente, processo ou tarefa, é preciso ir ao módulo certo. | **Busca geral** no topo (atalho Ctrl+K) que acha cliente, grupo, processo, tarefa ou contrato e abre na hora. | Novo |
| G2 | A ficha do cliente tem atalhos para tarefa, lançamento e documento, mas não para e-mail com a marca. | **"✉ Enviar e-mail"** na ficha, com o modelo bonito, a prévia e a escolha do contato. | Novo |
| G3 | O recibo de pagamento depende de uma automação ligada. | Na janela de **Baixa**, uma caixinha "mandar recibo ao cliente" (já vem marcada se o cliente recebe e-mails). | Juntar |
| G4 | No calendário do mês, a data da tarefa não muda arrastando (na semana muda). | **Arrastar no mês** também. | Novo |
| G5 | Financeiro: "A receber" mostra todos os meses misturados. | Chips **Vencidas · Esta semana · Este mês · Próximos** em cima da tabela, com o total de cada um. | Arrumar |
| G6 | Clientes: na lista não dá para ver quem está com pendência. | Coluna **Pendências** na lista de clientes: selos de honorário atrasado, guia não enviada e documento vencendo. | Novo |
| G7 | O pedido de documentos ao cliente é feito por WhatsApp, fora do sistema. | **Pedir documento**: um e-mail com a lista do que falta. Quando o documento chega, alguém marca como recebido e ele vai para a pasta certa. É grátis, usa o e-mail que já existe. | Novo |
| G8 | Painel Executivo: o gráfico de evolução e a tabela não conversam. | Clicar num grupo no gráfico **filtra a tabela**. | Arrumar |

---

### Os que eu faria primeiro (mais ganho, menos risco)
1. **V1 a V7** (velocidade: é o que mais atrasa o dia a dia).
2. **T1 e T2** (recorrentes com datas certas).
3. **R1, R3, R4** (Rotina).
4. **E1 a E4** (configuração de e-mail).
5. **G1** (busca geral).
