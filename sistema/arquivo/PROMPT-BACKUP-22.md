# PROMPT — Backup 22: Padronização

Aprovado pelo usuário sem respostas às perguntas → valem todas as **sugestões**:
1a (13 px nas tabelas) · 2a (nomes em CAIXA ALTA sem negrito) · 3a (linha de baixo cinza, 12 px) · 4a (vencido em negrito vermelho) ·
5a (valor em negrito preto, à direita) · 6a (valor completo "R$ 1.500,00") · 7a ("12 d atraso" / "em 5 d") · 8a (17/09/2026) ·
9a (selo da pessoa retangular, negrito, largura fixa) · 10a (cabeçalho azul-marinho) · 11a (botões da linha "✓ Baixa" e "✎") ·
12a (Acordos: "Vencimentos dos próximos 30 dias" ao lado do saldo por devedor) · 13a (PIX sai das tabelas e do e-mail) ·
14a (Parcelamentos: uma linha por parcelamento) · 15a (concluídos escondidos com "Mostrar concluídos") · 16a (triângulo só no título).

## Objetivo
O ERP inteiro segue uma única régua visual: o mesmo tipo de informação aparece igual em qualquer tela (tamanho, negrito, cor, alinhamento,
formato de número e data, selo da pessoa, cabeçalho e borda de tabela, filtros, botões da linha, triângulo de atraso).

## Como fazer
1. Levantamento de todas as telas. 2. Régua única (tokens.css + classes em design.css: `.col-venc`, `.col-valor`, `.col-dias`, `.col-nome`,
`.selo-pessoa`, `.alerta-tri`). 3. Aplicar em todas as tabelas (ERP antigo e Gestão). 4. Teste `testes/padrao.js` no `rodar-tudo.sh`.
5. Prints, documentação e PR.

## Itens
- Início: lembretes e fila como no Backup 20 (ⓘ com balão); Atrasados lado a lado com cabeçalho igual a Clientes; selo da pessoa com a
  mesma largura; vencimento em negrito.
- Parcelamentos: "Por grupo" no modelo de "Acordos em andamento" (uma linha por parcelamento, atrasados primeiro, parcelas com
  "Lançar pagamento"); sai "Saldo residual por empresa".
- Acordos: textos maiores e Situação centralizada; saldo por devedor na metade esquerda + "Vencimentos dos próximos 30 dias" à direita;
  Vencidos/A pagar/Pago com altura mínima de 10 linhas.
- Financeiro: vencimento em negrito em todas as tabelas e planilhas; sem botão PIX; triângulo de atraso único.
- Contratos: coluna Valor mais estreita; "1,5 salários/mês".

## Regras
Cores só em tokens.css; design.css só var(--…); só visual (exceto Parcelamentos, PIX e altura mínima); rodar-tudo.sh + caça-bugs + padrao.js.
