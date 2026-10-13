# Sugestões do Backup 75 — para o usuário escolher

Página para marcar e copiar a resposta: https://claude.ai/artifact/Ai4fyzesTEb9tSVUtTG8t9

Responda com os números que aprova (ex.: "S1, S2, L3, F1"). Nada aqui foi feito ainda, a não ser o que está marcado **(feito no B75)**.

## O que ainda depende do ERP antigo (por isso o `ERP.html` ainda não pode ser apagado — A4)

| Tela | Equipe vê | Cliente vê |
|---|---|---|
| Painel Executivo | misto: números, tabela de empresas e evolução novos, mas o código antigo ainda roda por baixo para calcular | o painel antigo + o Início de boas-vindas |
| Processos | misto: tabela nova; o "Resumo da carteira" no alto ainda é o antigo | tabela antiga |
| Financeiro → Jurídico e Contabilidade (abas de lançamentos) | antigo, com remendos (a tabela já usa a peça nova; abas, filtros e topo são antigos) | — |
| Notificações / cobranças (botão ✉ e menu ⋯) | antigo | — |
| Parcelamentos e Acordos | novos | antigos (4 remendos só para o cliente) |
| Entrada (login) e sessão | antigos | antigos |
| "Início" e "Relatório" antigos | escondidos, mas o Início antigo ainda é calculado toda vez que o Painel redesenha | — |

Já limpo no B75 **(feito)**:
- 41 cópias antigas de funções no banco;
- 18 funções de tela que nada mais chamava (ex.: o Kanban de Tarefas, que não tinha botão);
- 287 regras de desenho do `design.css` que apontavam para peças que não existem mais (o arquivo foi de 1861 para 1553 linhas);
- no portal do cliente, o menu mostrava "Execuções" e "Publicações", telas da equipe que abriam vazias para ele. Agora só a equipe vê.

## Simplificação (S)

- **S1. Financeiro (Jurídico e Contabilidade) inteiro na peça nova.**
  - O que muda: abas, filtros e topo no padrão de Acordos/Parcelamentos. É a maior parte que ainda resta do ERP antigo.
  - Depois disso, saem cerca de 57 trechos de remendo do Financeiro no montar-erp.
- **S2. Painel Executivo 100% novo.**
  - Os números, a tabela de empresas e a evolução passam a ser calculados direto, sem o código antigo por baixo.
  - Fica mais rápido e sai o "pisca" de quando o antigo redesenha.
- **S3. Processos: "Resumo da carteira" com as peças novas.**
  - Hoje, só esse quadro do alto ainda é o antigo.
- **S4. Notificações/cobranças antigas → "Cobrar" e "Enviar guias".**
  - O botão ✉ e o item do menu ⋯ abririam a Rotina → Enviar guias (que já faz o mesmo) e a tela antiga sairia.
  - *Antes de tirar, eu listaria se sobra alguma função só dela.*
- **S5. Portal do cliente todo refeito.**
  - Telas: Início, Processos, Parcelamentos, Acordos, com as mesmas peças, no modelo do ambiente de teste.
  - Saem os 4 remendos que só o cliente usa (b16, b19, b25, b35).
  - Junto com S1–S4, isso permite **apagar o ERP.html (A4)**.
- **S6. Parar de calcular o Início e o Relatório antigos escondidos.** Ganho de velocidade no Painel, sem mudar nada na tela.
- **S7. Tirar as peças da Etapa 2 que ficaram sem uso.**
  - Quais: `cartoesNumero`, `barraAbas`, `buscaB`, `tabelaLeve`, `vencB`, `cartoesB`.
  - Por quê: foram trocadas por `tabelaB`/`numsFaixa`.
- **S8. Banco: as 19 cópias antigas que sobraram.**
  - Exige reescrever trechos do meio do arquivo (gatilhos e correções de dados que usam a versão antiga).
  - Ganho pequeno; **minha recomendação é não fazer**.

## Layout (L)

- **L1. Financeiro → lançamentos com a barra igual à de Acordos.**
  - Botões "A receber / Recebido / A pagar / Pago", chips de prazo (Vencidas, 5, 10, 15, 30 dias) e Filtros num painel só.
  - Vai junto com S1.
- **L2. Menu lateral com contagem.** Um numerozinho discreto ao lado de Tarefas (atrasadas), Publicações (novas) e Parcelamentos (vencidas), para ver o que pede atenção sem abrir a tela.
- **L3. Celular.** Revisar as telas refeitas em 390 px:
  - os cartões da "Situação por cliente" e a ficha do cliente devem ficar em uma coluna;
  - os botões Emitir/Baixa devem ficar com tamanho de dedo.
- **L4. Cabeçalho único em todas as telas.**
  - Título + subtítulo + botões à direita (`cabecalhoTela`).
  - Hoje só Início, Rotina, Parcelamentos e Acordos usam esse cabeçalho. Ainda falta em: Tarefas, Publicações, Clientes, CRM, Contratos, Documentos, Execuções, Alertas e Administração.

## Funcionalidade (F)

- **F1. Busca geral (Ctrl+K)**, como no ambiente de teste: digitar parte do nome do cliente, nº do processo ou CNPJ e ir direto à ficha, ao processo ou ao parcelamento.
- **F2. "Baixar planilha" em toda tabela nova.** A tabela já filtrada vira CSV/Excel. Hoje só alguns relatórios têm.
- **F3. Conferências automáticas**, como as "checagens" do ambiente. Uma lista curta no Início, por exemplo:
  - parcelamento sem valor da próxima parcela;
  - cliente que recebe e-mail mas não tem e-mail;
  - processo sem movimentação há mais de 90 dias;
  - contrato sem data de reajuste.
- **F4. Desfazer também ao concluir tarefa na Rotina e ao conferir no Passivo.** No Início e nas baixas já existe.
- **F5. Ajuda "?" em cada tela.** Um balão curto com "o que esta tela faz" e "o que fazer primeiro", como no ambiente.
- **F6. Linha do tempo do cliente** na ficha, no modelo do ambiente: e-mails enviados, baixas, tarefas e movimentações num só lugar, em ordem de data.

## Minha recomendação de ordem

1. **S1 + L1** (Financeiro).
2. **S2 + S3 + S6** (Painel e Processos).
3. **S4**.
4. **S5** (portal do cliente).
5. Apagar o ERP.html (A4).

F1–F3 podem entrar em qualquer rodada, porque não dependem do ERP antigo.
