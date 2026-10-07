# Sugestões — Backup 51 (foco: simetria, Início, Acordos com PIX e Publicações)

Esta lista junta os pedidos novos com o que ficou das sugestões do Backup 50 (`SUGESTOES-B50.md`).
**Feito no Backup 52:** C1 a C7, P1 a P5 e O1 a O3 (detalhes no `COMO-ATUALIZAR.md`, seção Backup 52). Os demais continuam como sugestão.
Para aprovar, responda com os números. Exemplo: "aprovo C1 a C4, P1, P2 e N1; o resto fica para depois".
O prompt pronto para o próximo chat está em `sistema/PROMPT-BACKUP-52.md`.

**Regra de ouro (pedida por você):** o que muda num lugar vale para o ERP inteiro. Uma tela não pode ter um enfeite que as outras não têm.

Legenda: **Corrigir** = algo não funciona ou está diferente do combinado · **Novo** = função nova · **Melhorar** = o que existe fica mais rápido ou mais claro ·
**Automático** = o sistema faz sozinho · **Tirar** = remover · **Juntar** = unir duas coisas numa

---

## C. Pedidos seus (prioridade máxima)

| # | Como é hoje | Sugestão | Tipo |
|---|---|---|---|
| C1 | O calendário do Início só tem **Lista** e **Mês** (a Semana foi para Tarefas no Backup 49). | No Início, os botões **Lista · Semana · Mês**. A Semana é a mesma de Tarefas → Calendário (arrastar para mudar a data). A escolha fica guardada por pessoa. | Novo |
| C2 | Menu tem **Atualizações** (o que mudou em cada versão). | Tirar do menu e do sistema. O histórico das versões continua no `backups/LEIA-ME.md` e no `COMO-ATUALIZAR.md`. | Tirar |
| C3 | Com filtros ligados, o quadro fica **maior do que o conteúdo** (no Início, a Lista tem sempre a altura do calendário; com 2 itens sobra um espaço vazio grande). | O quadro acompanha o que está na tela: com poucos itens, ele encolhe; com muitos, para numa altura máxima e rola por dentro. Vale para todos os quadros com filtro (Início, Tarefas, Rotina, Acordos). Um teste mede: "nenhum quadro com mais de 40 px vazios embaixo". | Corrigir |
| C4 | **Processos** ainda tem a **borda azul** em volta de cada grupo; o Painel Executivo já não tem. | Tirar a borda azul de Processos e de **toda** tabela que ainda use (`contornarGrupos`). Um só desenho de grupo no ERP inteiro: a faixa cinza com o nome do grupo (igual ao Painel). | Corrigir |
| C5 | **Publicações → "↻ Buscar agora" não funciona.** O servidor (Supabase, fora do Brasil) é recusado pela API do Diário do CNJ; só o "🌐 Buscar pelo navegador" funciona. | Um botão só, **"↻ Buscar agora"**, que busca **pelo navegador** (o que funciona). Se o navegador falhar, tenta o servidor como reserva e explica. A busca automática diária também passa a ser pelo navegador, ao abrir o ERP (já existe `buscaPubAutomatica`). O botão "Buscar pelo navegador" sai (vira o próprio "Buscar agora"). | Corrigir |
| C6 | Acordo pago por **PIX**: a chave PIX só aparece se a "forma de pagamento" do acordo for PIX; não há lugar para o **código PIX (copia e cola)** de cada parcela. | No cartão de envio de cada parcela, campo **"Código PIX (copia e cola)"** (fica gravado na parcela) e, no acordo, a **chave PIX fixa** (já existe). O texto da mensagem sai assim: ver modelo abaixo. | Novo |
| C7 | O texto das guias e acordos diz **"parcelas de acordos da Rogério"** (o nome da pessoa ou empresa entra no meio da frase e fica errado para pessoa física, homem ou mulher). | Texto **genérico**, sem o nome no meio da frase: "Seguem as parcelas de acordo com vencimento neste mês ou em atraso." O nome aparece só no assunto do e-mail e no "Partes:". Vale também para as guias de parcelamento ("Seguem as guias dos parcelamentos com vencimento neste mês…"). | Corrigir |

**Modelo do texto do acordo (C6 + C7):**

```
Boa tarde!

Seguem as parcelas de acordo com vencimento neste mês ou em atraso.

*Acordo para pagamento*
Processo: 0703762-53.2019.8.02.0044 | Parcela: 10ª parcela de 19
Partes: Rogério × Luís Toceira
Vencimento: 07/10/2026
Valor: R$ 1.500,00
PIX: 00020126580014br.gov.bcb.pix0136...   (código copia e cola da parcela; sem ele, a chave PIX do acordo)
```

## P. Simetria — o mesmo desenho em todo o ERP

| # | Como é hoje | Sugestão | Tipo |
|---|---|---|---|
| P1 | Cada tela tem a sua barra de filtros (Painel, Processos, Acordos, Rotina, Tarefas). | Um componente só de filtros (chips + busca), igual ao do Início, em todas as telas. | Juntar |
| P2 | Botões "↻ Atualizar" com estilos diferentes (escuro na Planilha, claro em outras). | Um só botão "↻ Atualizar", no mesmo lugar (canto direito do cabeçalho do quadro). | Melhorar |
| P3 | Tabelas com cabeçalho de grupo de 3 jeitos (faixa cinza, contorno azul, cartão). | Faixa cinza com o nome do grupo e a contagem, em todas (ligado ao C4). | Juntar |
| P4 | Pílulas de situação ("em atraso", "a vencer", "pago") com cores e textos diferentes entre Parcelamentos, Acordos, Financeiro e Rotina. | Uma tabela única de situações e cores (`SITUACOES`), usada em todas as telas. | Juntar |
| P5 | Não há teste que avise quando uma tela fica diferente das outras. | O `padrao.js` passa a conferir também: cabeçalho de grupo, botão Atualizar, filtros e altura dos quadros (C3). | Novo |

## N. Funções novas

| # | Sugestão | Tipo |
|---|---|---|
| N1 | **Busca geral** no topo (Ctrl+K): acha cliente, grupo, processo, tarefa ou contrato e abre na hora. (era G1) | Novo |
| N2 | **"✉ Enviar e-mail"** na ficha do cliente, com o modelo bonito, a prévia e a escolha do contato. (era G2) | Novo |
| N3 | **Pedir documento** ao cliente por e-mail, com a lista do que falta; quando chega, marcar como recebido e ir para a pasta certa. (era G7; grátis) | Novo |
| N4 | **Fechar o mês** na Rotina: resumo do que foi enviado, pago e conferido, e o que ficou pendente; vai para o supervisor e fica no histórico. (era R7) | Novo |
| N5 | **Total do mês por empresa** na Planilha e no cartão de envio: "a pagar este mês: R$ 3.200 em 4 guias". (era R10) | Novo |
| N6 | **Publicação nova** marcada na linha do processo da Rotina; ao conferir, o texto já vem preenchido. (era R5) | Novo |

## O. Otimizar o que já existe

| # | Como é hoje | Sugestão | Tipo |
|---|---|---|---|
| O1 | **Clientes** ainda leva ~0,4 s para abrir (busca a lista inteira a cada 60 s). | Mostra a lista guardada na hora e atualiza por trás (se algo mudou, redesenha). Meta: < 0,2 s no `velocidade.js`. | Melhorar |
| O2 | **Rotina → Processos** baixa todas as movimentações de todos os processos. | Uma consulta só, como a Planilha (última movimentação de cada processo). | Melhorar |
| O3 | Abrir **Parcelamentos** depois de um Pago relê as 15 mil parcelas. | Ler só o parcelamento que mudou. | Melhorar |
| O4 | Financeiro: "A receber" mistura todos os meses. | Chips **Vencidas · Esta semana · Este mês · Próximos** com o total de cada um. (era G5) | Melhorar |
| O5 | Calendário do mês não deixa arrastar (a semana deixa). | Arrastar também no mês. (era G4) | Melhorar |

## A. Automático

| # | Sugestão | Tipo |
|---|---|---|
| A1 | **Aviso no dia 5** (configurável): "faltam 6 guias para enviar" — entra em Alertas e no Início. (era R9) | Automático |
| A2 | **Recibo automático** ao dar baixa: caixinha "mandar recibo ao cliente" na janela de Baixa, já marcada se o cliente recebe e-mails. (era G3) | Automático |
| A3 | **Código PIX lembrado**: se a parcela anterior do mesmo acordo teve código PIX, o campo vem com a chave do acordo e um aviso "cole o código desta parcela". | Automático |
| A4 | **Bolinha de saúde do e-mail** no menu (verde = saindo; vermelha = erro ou falta configurar). (era E8) | Automático |

## S. Simplificar

| # | Como é hoje | Sugestão | Tipo |
|---|---|---|---|
| S1 | "Minhas tarefas" na Rotina mistura a rotina com as outras tarefas. | Fica só o checklist da rotina (as que se repetem). (era R6) | Tirar |
| S2 | Perfis de e-mail antigos (Padrão, Só no vencimento…) ainda existem no cadastro. | Fica só a chave **Recebe Sim/Não**. (era E6) | Tirar |
| S3 | Modelos de e-mail só aparecem pelo "Ver modelo". | Aba **Modelos** com a prévia ao lado e o texto editável. (era E5) | Juntar |
| S4 | Busca da Rotina é por aba. | Uma busca por empresa/grupo no topo da Rotina, válida para todas as abas. (era R8) | Juntar |

---

### Os que eu faria primeiro
1. **C1 a C7** (seus pedidos).
2. **P1 a P5** (simetria: o que muda num lugar muda em todos).
3. **O1 a O3** (velocidade que ainda falta).
4. **N1** (busca geral) e **A1/A2**.
