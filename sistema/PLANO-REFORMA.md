# Plano da reforma por partes (opção C)

Aprovado pelo usuário em 08/10/2026. Leia isto antes de qualquer rodada da reforma.

## Decisões já tomadas
- **Opção C**: manter o banco (`estrutura.sql`) e os testes; refazer as telas um módulo por vez, com o mesmo funcionamento.
  Nada de recomeçar do zero.
- **Visual de referência = ROMPEX**, os 8 itens aprovados (todos):
  1. uma letra só (DM Sans); letra de máquina só em CPF/CNPJ e nº de processo/parcelamento, pequena e cinza;
  2. toda tela começa igual: ícone + título + frase do que a tela faz + (à direita) Atualizar e o botão principal;
  3. filtros dentro de um cartão, com o nome em cima de cada campo;
  4. tabela leve: cabeçalho claro (11 px, caixa alta, cinza), linhas altas, dinheiro à direita em negrito, ações em ícones, clique na linha abre o detalhe;
  5. uma cor de destaque (o azul do escritório, NÃO o amarelo do ROMPEX); verde só "pago", laranja atenção, vermelho atraso;
  6. tela vazia que explica o motivo e oferece o próximo passo;
  7. criar/editar em painel lateral (entra pela direita);
  8. modo escuro com o mesmo desenho.
- Modelo aprovável: `sistema/prototipos/guia-visual.html` (publicado como artifact "Guia Visual do ERP").
  Duas mudanças pedem o OK explícito do usuário antes de aplicar: tabelas sem Playfair/JetBrains e cabeçalho da tabela claro (deixa de ser azul cheio).
- Funções novas do ROMPEX (A–K da conversa: NFS-e Nacional pelo A1, envio de documentos por competência, link de cadastro do cliente,
  conferir anexo antes de enviar, busca Ctrl+K, "?" de ajuda, envio seguro de e-mail, registro de importações com reverter,
  página Atualizações, apuração pelos XMLs, leitura por foto com IA [paga]) → **perguntar ao usuário depois da reforma**, não antes.

## Etapas (uma por Backup/PR)
| Etapa | O que fazer | Situação |
|---|---|---|
| 0 | Guia visual (página-modelo) para aprovação | **feita (Backup 59.1)** — aguardando o OK do usuário |
| 1 | Diagnóstico por escrito: por módulo, o que fica / o que é refeito / ordem | a fazer |
| 2 | Base nova do visual: as 118 camadas "Backup N" do `design.css` (+ erp-telas.css/estilo.css) viram um arquivo limpo seguindo o guia; testes `padrao.js`/`caca-bugs.js` ajustados ao novo padrão | a fazer |
| 3–8 | Um módulo por rodada, saindo dos remendos do ERP antigo (`#Sistemas/2 - ERP/ERP.html` + `montar-erp.js`) para telas `telas-*.js` limpas: Clientes → Financeiro → Parcelamentos → Acordos → Painel/Processos → Rotina | a fazer |
| 9 | Faxina do banco: 39 funções escritas mais de uma vez no `estrutura.sql` (manter só a última, idempotente) | a fazer |
| 10+ | Funções novas (lista A–K), na ordem que o usuário escolher | depois |

## Como conduzir cada rodada
1. Uma etapa por vez; não misturar com pedidos grandes de função nova (correções urgentes podem entrar).
2. Mesmo funcionamento: os testes do `rodar-tudo.sh` precisam continuar passando; teste que media o visual antigo é atualizado para o padrão novo (nunca apagado sem substituto).
3. Prints antes/depois em 1366 px, celular (390 px) e escuro, com as fontes reais (ver CLAUDE.md, Backup 56).
4. Entrega no fluxo de sempre (CLAUDE.md "Como entregar"): docs, backup zip, PR, resposta em português simples com o passo a passo.
5. Atualizar a tabela de etapas acima ao terminar cada uma.

## Números de partida (08/10/2026)
- `design.css` 1.858 linhas com 118 blocos "Backup N" e ~450 linhas com `!important`; `montar-erp.js` com 190 remendos (`trocar(`)
  sobre o `ERP.html` antigo (10.145 linhas); `estrutura.sql` 7.922 linhas, 276 funções, 39 repetidas.
