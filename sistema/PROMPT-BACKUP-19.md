# Prompt — Backup 19 (enxugar e simplificar)

> Elaborado a partir do pedido do usuário (29/09/2026) e executado na mesma sessão.
> Leia o `CLAUDE.md` antes. Trabalhe no branch da sessão, a partir do Backup 18 mergeado.

## Objetivo
Deixar o ERP **mais enxuto, menos repetido e mais fácil**: cada informação aparece num lugar só (ou, quando aparece em dois,
fica claro por quê), tabelas parecidas funcionam do mesmo jeito (Acordos ↔ Parcelamentos), e nada de e-mail sai do sistema
até o usuário liberar.

## 1. Início
1. **Mural = uma linha de destaques** com os **Lembretes** juntos (o cartão "Lembretes" separado sai; a lista abre ao clicar no
   destaque "N lembretes" e o botão **+ Lembrete** fica no mural).
2. **Avisos sem repetição:** o sino e o destaque "avisos" deixam de contar o que já tem lugar próprio no Início:
   tarefas **atrasadas** (estão em "tarefas atrasadas" e na fila), tarefas atrasadas da equipe (estão em "Tarefas do escritório"),
   honorários em atraso (cartões "Atrasados"), parcelas de acordo vencidas (cartão "Acordos") e documentos vencendo (cartão
   "Documentos"). Continuam nos avisos: prazo chegando (5/2/1 dia/hoje), o que vence **hoje**, certidões e as notificações
   (menção, tarefa atribuída, rascunho, publicação…).
3. **Textos sem "(s)"**: plural certo ("1 aviso não lido", "78 avisos não lidos").
4. **Mural × Resumo:** o mural mostra o que é **seu** ("8 tarefas suas atrasadas"); o Resumo mostra o **escritório todo**
   ("Tarefas do escritório"). Duplicado só quando faz sentido, e o texto deixa claro de quem é.
5. **Resumo do escritório:** cartões um pouco mais largos.

## 2. Painel Executivo — tabela "Empresas do grupo"
Grupo em texto simples (sem caixa em volta); lista **ordenada por grupo**; nome da entidade/sócio em **CAIXA ALTA sem negrito**;
CAPAG **A, B, C, D e Omisso** ("Omisso" sem caixa alta); Situação sem caixa alta (Ativa, Baixada…).

## 3. Jurídico → Parcelamentos (no mesmo modelo de Acordos)
1. Tabela por órgão vira **por grupo**: clicar no grupo expande os parcelamentos por órgão daquele grupo.
2. **Finalizados ocultos** por padrão; caixa **Mostrar concluídos** logo acima da tabela.
3. Clicar no parcelamento expande as parcelas (igual Acordos).
4. Coluna "Status" vira **Atraso** (dias em atraso / dias que faltam), inclusive para as parcelas a vencer.
5. "Risco de rescisão": nova coluna **Natureza**; empresa sem negrito.
6. O gráfico "Saldo residual por empresa" continua (sai depois, se o usuário aprovar a tabela por grupo).

## 4. Acordos
"Mostrar concluídos" junto da tabela; sai a situação "Vencido" (o "Atraso" em dias já diz isso).

## 5. Financeiro
"Recebido mês a mês" volta às cores anteriores; "Comparativo por pessoa" com **Total**; "Em atraso" como os vencidos de Acordos
(vencimento e depois atraso em dias).

## 6. Clientes
Nome sem negrito; nomes em CAIXA ALTA.

## 7. Alertas
Menos poluído: resumo em uma linha, lista só do que pede ação, o que está em dia recolhido.

## 8. Geral
1. Cabeçalho das tabelas volta ao **azul-marinho** (texto branco), em todas as telas.
2. Sai a bolinha antes do título dos cartões.
3. Jurídico com abas **Processos · Parcelamentos · Publicações** no topo das três telas.
4. **Nenhum e-mail sai** enquanto o usuário não liberar: chave "Envio de e-mails pausado" (ligada), e-mails novos ficam
   **retidos** na fila (dá para ver, enviar um a um ou descartar depois).
5. **Tudo de e-mail num lugar só:** Central de e-mails com abas (Pendentes, Enviados/fila, Modelos, Automáticos, Configuração);
   os outros atalhos levam para lá.
6. Listas (na resposta): funções para remover, funções que ajudam, ideias para ficar mais simples.

## Regras
Sem mudar nome de botão que os testes usam; cores só em `tokens.css`; SQL idempotente; testes (`rodar-tudo.sh`) passando,
inclusive `caca-bugs.js`; entregar como sempre (montar-erp, COMO-ATUALIZAR, LEIA-ME, backup "Backup 19", PR).
