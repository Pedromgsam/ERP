# Sugestões do Backup 92 (teste do sistema)

Encontradas ao usar o ERP com dados de teste (Início, Tarefas, Painel, Processos, Parcelamentos, Acordos, Financeiro).
Nada disto foi feito. Responda com os códigos que aprova.

## Mais intuitivo
- **U1 — Um só "+ Lançar" por tela.** No Financeiro aparecem dois ("+ Lançar" no alto e "+ Lançar" no título). Ficaria só o do título, já com o tipo da tela.
- **U2 — "Conferido: nunca" clicável.** Em Processos, clicar no "nunca" marcaria como conferido hoje (com Desfazer), sem abrir a Rotina.
- **U3 — ⚙ de Tarefas dentro do ⋯.** O ícone de engrenagem sozinho não diz o que faz (Feriados e Google Agenda). Iria para o menu ⋯, como nas outras telas.
- **U4 — Processo ligado à empresa.** Hoje o processo só guarda Autor e Réu em texto; o filtro "Empresa" de Processos procura o nome nas partes. Guardar a empresa no cadastro do processo deixa o filtro exato (precisa de SQL).
- **U5 — Cabeçalho das tabelas sem quebrar.** "Vencimento ↑" e "Última movimentação" quebram em duas linhas; ficariam numa linha só, com a seta ao lado.

## Mais bonito
- **V1 — Situação por cliente ocupando a largura.** Com 1 ou 2 grupos, os cartões ficam pequenos à esquerda e sobra espaço; eles se esticariam até o fim da linha.
- **V2 — Detalhe do grupo sem repetir o cartão.** Em Parcelamentos/Acordos, a tabela "Grupo Alfa" repete o que o cartão já mostra; ficaria só a lista das empresas.

## Mais eficiente
- **E1 — Atalhos de teclado nas tabelas.** ↑/↓ para andar nas linhas, Enter abre, B dá baixa (com a confirmação de sempre).
- **E2 — Abrir direto no que pede ação.** Parcelamentos e Financeiro abririam já filtrados em "Vencidas" quando houver atraso (hoje abrem em "Todas").

## Mais automatizado
- **A1 — Resumo semanal por e-mail.** Toda segunda às 7h, cada sócio recebe (no modelo bonito) honorários em atraso, parcelas que vencem na semana, tarefas e audiências.
- **A2 — Conferência da Rotina com lembrete.** Se o passivo de um grupo passar 30 dias sem conferência, vira aviso no Início e e-mail ao responsável.
- **A3 — Guia emitida = aviso ao cliente sozinho.** Ao marcar uma guia como emitida, o e-mail ao cliente já sai (hoje é um passo a mais), respeitando "rascunho ou direto" de Administração → E-mail.
