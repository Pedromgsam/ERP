# Diagnóstico visual — Backup 18 (antes da rodada de design)

Levantado nas fotos de todas as telas (1440 px e 390 px, modos claro e escuro), versão do Backup 17.

## O que estava "grosseiro"
1. **Faixa grossa colorida à esquerda** em quase todo cartão (KPIs do Painel, Processos, Financeiro, Acordos; cartões do Início;
   CRM; mural; alertas) — na maioria dos casos a cor não significava nada (ex.: azul, roxo e cinza lado a lado).
2. **Cabeçalho de tabela azul-marinho** nas telas antigas (Processos, Painel, Parcelamentos, Financeiro, resumos por
   Grupo/Tribunal/Natureza), diferente do cabeçalho claro das telas do Gestão.
3. **Títulos das telas dentro de uma caixa** com filete navy→ouro e borda de 1,5px — pesada e repetida em toda tela.
4. **Barra superior** com degradê, "vidro", filete ouro→azul embaixo, botão ouro com brilho e botões ◐/🔔/⋯/Sair com contorno.
5. **Sombras duras** em duas camadas e cartões que "pulam" ao passar o mouse (translateY) — inclusive cartões que não são clicáveis.
6. **Cores de situação saturadas** (vermelho, verde, laranja fortes) em textos, faixas e selos.
7. **Pílulas grandes e pesadas** (negrito 700, caixa alta, sombra), CAPAG num desenho quadrado diferente das outras.
8. **Botões com degradê** e sombra colorida; três desenhos diferentes de botão secundário (1px, 1,5px, contorno azul).
9. **Muitas cores soltas** nos CSS (≈480 hex/rgba em `estilo.css`, `erp-telas.css`, `editor.css`), fora do `tokens.css`.
10. **Modo escuro azul-acinzentado** (`#0E1420`/`#161D2B`); os tons gerados pelo `tema-escuro.js` puxavam para o azul.
11. **Gráficos** com cores fixas no código (azul forte, verde-limão, laranja) e grade marcada; animação a cada redesenho.
12. **Aviso "N avisos novos"** e rodapé "Última gravação" em navy pesado sobre o conteúdo.
13. **Espaçamentos e raios irregulares** (7, 8, 9, 10, 12, 14, 16, 18 px misturados).

## O que foi feito (Backup 18)
- `tokens.css`: paleta sóbria (AA medido), cinzas neutros, bordas 1px leves, sombra de uma camada, raios 12/8/999,
  escalas `--sp-*` (4/8/12/16/24/32) e `--fs-*` (12/13/14/16/20/24), cores dos gráficos `--chart-*`, modo escuro preto.
- Cores soltas de `estilo.css`, `erp-telas.css` e `editor.css` trocadas por `var(--…)`.
- `design.css` (nova, última camada): um desenho de cartão, KPI, tabela, botão, pílula/selo, aba, campo e janela para o ERP
  antigo e para as telas do Gestão; barra superior lisa; títulos sem caixa.
- `tema-escuro.js`: cinzas e tons gerados sem puxar para o azul, mais próximos do preto.
- Gráficos: Chart.js lê as cores dos tokens na hora de desenhar (rampa azul nas barras, categóricas contidas nas roscas),
  grade leve, sem animação; gráficos SVG do Gestão usam `var(--chart-*)`; legenda das roscas com a mesma cor.
