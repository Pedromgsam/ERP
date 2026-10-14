# Sugestões do Backup 76 — para o usuário escolher

Página para marcar e copiar a resposta: https://claude.ai/artifact/SwM61QpB4wFmszCRDfSpQx

Responda com os números que aprova (ex.: "R1, R2, V1, N2"). Nada aqui foi feito ainda.
As letras mudaram para não confundir com as do Backup 75:
- **R** = retirar o ERP antigo;
- **V** = visual;
- **N** = funções novas.

## Onde estamos

Depois do Backup 76, **todas as telas que a equipe e o cliente usam são novas**. O `ERP.html` antigo ainda faz 3 coisas por baixo:

| O que | Onde está hoje |
|---|---|
| Entrada (login), tempo de sessão e "Sair" | `ERP.html` |
| Leitura dos dados do banco (a lista que alimenta Painel, Processos, Parcelamentos, Acordos e Financeiro) | `ERP.html` + `erp-dados.js` |
| Menu, troca de tela e endereço (#painel) | `ERP.html` + `erp-telas.js` |

O resto do `ERP.html` (cerca de 10 mil linhas) já não aparece na tela: são os painéis antigos escondidos, os 6 arquivos de remendo e a maioria dos 195 trechos `trocar()` do `montar-erp.js`.

## Retirar o ERP antigo (R)

- **R1. Tirar o código morto.**
  - O que sai: os painéis antigos escondidos, os 6 remendos (`acordos-b16`, `acordos-b35`, `contab-b27`, `financeiro-b74`, `lista-grupos-b25`, `parcelamentos-b19`) e os trechos do `montar-erp` que só mexiam neles.
  - O que muda na tela: nada.
  - Ganho: a página que o navegador baixa encolhe (`index.html` tem 633 KB hoje). *Recomendo.*
- **R2. Entrada e sessão num arquivo próprio.**
  - A mesma tela de login e o mesmo tempo de 60 minutos, mas fora do `ERP.html`. *Recomendo.*
- **R3. Leitura dos dados e menu só nos arquivos novos.**
  - É o último passo. Depois dele, o `ERP.html` e o `montar-erp.js` podem ser apagados (**A4**). *Recomendo, depois de R1 e R2.*
- **R4. Juntar o `design.css` no `base.css`.**
  - Hoje o `design.css` tem 1542 linhas em 107 blocos "Backup N". Depois de R1, fica só o que as telas novas usam, num arquivo só.
- **R5. Telas carregadas por partes.**
  - Hoje o pacote das telas tem 1 MB e é baixado inteiro na entrada. Cada tela passaria a baixar só quando é aberta.
  - Ganho: a primeira abertura fica mais rápida, principalmente no celular.
- **R6. Banco: a última cópia repetida (`enviar_guias_email`).**
  - Ganho pequeno. *Recomendo não fazer.*

## Visual (V)

- **V1. Modo escuro conferido tela a tela** nas telas novas (Financeiro, Painel, Processos, portal do cliente), com prints antes/depois.
- **V2. Janelas de detalhe no mesmo molde** — processo, lançamento, tarefa e cliente:
  - título com o "tipo" em cima;
  - números em faixa;
  - botões no rodapé.

  Hoje a janela do processo e a do lançamento ainda mostram o conteúdo no desenho antigo.
- **V3. Tablet (768–1024 px).**
  - O menu lateral encolhe sozinho e os filtros quebram em duas linhas sem apertar a tabela.
  - Em 390 px (celular) já está conferido.
- **V4. Mais contagens no menu:**
  - Financeiro: honorários vencidos;
  - Rotina: conferências do Passivo pendentes.
- **V5. Faixa de números igual em todas as telas.**
  - No Painel são 8 números, e no Financeiro e no portal o tamanho muda.
  - Fixar 4 por linha no computador e 2 no celular.

## Funções novas (N)

- **N1. Busca Ctrl+K maior:** passa a achar também contratos, lançamentos (por descrição ou valor) e documentos.
- **N2. Conferências do Início com "Ignorar este".**
  - Para o que é assim mesmo (ex.: processo suspenso, que não vai ter movimentação). Fica guardado e não volta a aparecer.
- **N3. Painel com comparação ao mês anterior:** ▲/▼ ao lado de cada número (passivo, parcelado, em atraso).
- **N4. Despesas fixas do escritório lançadas sozinhas todo mês.**
  - Exemplos: aluguel e sistemas, como já acontece com as mensalidades dos contratos.
  - Você cadastra uma vez com o dia e o valor.
- **N5. Portal do cliente: botão "Baixar guia"** quando a guia da parcela já foi emitida e anexada.
- **N6. Resumo mensal ao cliente por e-mail**, no dia 1º:
  - o que foi pago;
  - o que vence no mês;
  - processos com novidade.

  Fica desligado até você ligar em Administração → E-mail → Automáticos.

## Minha recomendação de ordem

1. **R1** (sem risco, nada muda na tela).
2. **R2 + R3** → apagar o `ERP.html` (**A4**).
3. **R4**.
4. V e N em qualquer rodada, porque não dependem do ERP antigo.
