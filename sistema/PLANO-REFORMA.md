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
- **Respostas do usuário ao guia v1 (09/10/2026)** — valem para todas as telas:
  1. cabeçalho aprovado;
  2. cartões de Parcelamentos = 3: Parcelas em atraso · Vencem este mês (valor "no mês" + "emitir as guias até dia 12") · Quitado / falta;
  3. filtros **sem** cartão (ficam na linha das abas, à direita) — substitui o item 3 do ROMPEX;
  4. tabela leve aprovada (cabeçalho claro incluído); "Em atraso" antes de "A vencer"; colunas de Parcelamentos: Grupo (só texto, sem pílula) ·
     Empresa + CNPJ · Plataforma (`parcelamentos.local`) · Natureza · Nº · Parcela "14 de 60" · Valor · Vencimento · Situação · Baixa;
     situação: atraso **ou vence hoje = vermelho**, a vencer = azul, pago = verde; **sem botão de editar** (clique na linha edita);
  5. tela vazia = de verdade (aparece quando a lista está vazia); "botões e situações" era só mostruário;
  7. **não gostou da letra** — escolher no seletor do guia v2 (Inter, IBM Plex, Source Sans, Roboto, DM Sans ou "Como hoje" = Playfair/JetBrains nas tabelas);
  8. painel lateral sim, mas mais leve (refeito no v2: resumo em cima, blocos, rótulos normais, rodapé fixo);
  9. lateral mais estreita (188 px); 10. margens menores (20 px, sem largura máxima);
  11. escuro **preto** (`#000`), com a lateral em azul-marinho escuro e borda para não sumir;
  12. **obrigatório** um lugar para controlar os parcelamentos dos clientes ("Situação dos parcelamentos": cartão por grupo → lista dos parcelamentos).
- **Respostas ao guia v2 (09/10/2026):** 4º cartão (escolhido: "Guias a emitir", vencidas + do mês sem guia, prazo dia 12);
  "A vencer" = TODAS as futuras; "Pagas" = TODAS até hoje; **0 = vencido** (vence hoje vai para "Em atraso" e conta nos cartões);
  cartões por grupo aprovados + coluna "Em atraso" (nº de parcelas vencidas) na lista do grupo; ao clicar no parcelamento, janela com os dados do
  sistema atual (`_parcAbrir`: ficha, 5 números e todas as parcelas com Emissão/Pagamento/Baixa); **criar/editar/detalhe em JANELA NO CENTRO**
  (substitui o painel à direita do item 7 do ROMPEX); escuro preto aprovado; letra ainda em aberto (sugestão: Inter).
- **Respostas ao guia v3 (09/10/2026):** em Parcelamentos a "Situação dos parcelamentos por cliente" vem ANTES das abas; sem as setinhas ↑↓
  ao lado das abas (era o `overflow` da barra de abas no Windows); tabela com ~12 linhas à vista e o resto rolando (sem "Mostrar mais");
  lista do grupo: coluna "Situação" = "N parcela(s) em atraso" em vermelho ou "Em dia" em verde (a pílula "Situação" antiga saiu);
  janela do parcelamento com "Emitir" (por guia e "Emitir guias (n)"); **regra geral: todo clique que lança pagamento pede confirmação**
  (janela com a data, `perguntarBaixa`); **letra = Inter** (escolhida). Etapa 2 liberada.
- **Respostas ao guia v4 (09/10/2026, depois do Backup 63)** — valem para TODO o sistema:
  texto menor (corpo 13 px; títulos/cartões/abas 1–4 px menores); **testar a letra da tabela de parcelamentos do ERP.html** (DM Sans no texto,
  Playfair Display 11 px no cabeçalho, JetBrains Mono 12 px em valores/datas/nº) — o sistema está em Inter (B63) até o usuário decidir;
  **nome da empresa sem negrito**; **sem coluna "Situação" nas listas de parcelas/lançamentos**: o VENCIMENTO inteiro (data + "N dias de atraso")
  fica vermelho em atraso (inclui hoje) e azul a vencer (data + "em N dias"); paga = data normal e a coluna Baixa mostra "✓ Pago em dd/mm"
  ("Recebido em" no Financeiro). A coluna "Situação" da lista do grupo (nº de parcelas em atraso / Em dia) continua.
  Guia v5 ganhou um seletor "Tela" com um 2º exemplo: Financeiro · Honorários (mesmas peças).
- **Respostas ao guia v5 (09/10/2026)** — valem para TODO o sistema: **letra Inter** (definitiva; a do ERP.html fica só para comparar);
  **toda tabela tem filtros**: busca + listas na linha das abas e o botão "Filtros" (vencimento de/até, valor de/até + o que for da tela), com o número de filtros ligados;
  **toda tabela ordena** clicando no título da coluna (↑/↓); **todo cartão abre o detalhamento** (clicou → lista abaixo dos cartões; clicou de novo → fecha);
  **toda informação clicável abre o detalhe**. Sugestões numeradas em `sistema/SUGESTOES-REFORMA.md` (aguardando o usuário escolher).
- Guia v2 (Backup 61), v3 (Backup 62), v4 (Backup 63), v5 (Backup 64) e v6 (Backup 65) com essas respostas; diagnóstico da Etapa 1 em `sistema/DIAGNOSTICO-REFORMA.md`.
- Funções novas do ROMPEX (A–K da conversa: NFS-e Nacional pelo A1, envio de documentos por competência, link de cadastro do cliente,
  conferir anexo antes de enviar, busca Ctrl+K, "?" de ajuda, envio seguro de e-mail, registro de importações com reverter,
  página Atualizações, apuração pelos XMLs, leitura por foto com IA [paga]) → **perguntar ao usuário depois da reforma**, não antes.

- **Ambiente de teste (Backup 66)** — pedido do usuário antes da Etapa 3: `sistema/prototipos/ambiente-teste/` (index.html + app.css + dados.js + pecas.js + negocio.js + telas-1.js + telas-2.js;
  artifact https://claude.ai/artifact/UGretADTq3ZNXoLnQjqopB). **Só vai para o ERP de verdade quando o usuário der o ambiente por terminado.** Feito ali: E1–E5, F1, F2, F4, F5, F7 (arquivos;
  instalar só no ERP), A1–A6 (cada automação com hora/dias e exceção POR CLIENTE: Padrão/Desligado/Personalizado — `N.regra(auto, cliente)`; calendário `N.proximas`), O1 (processo na tela
  Administração → Ambiente de teste), O2 (`sistema/banco/anonimizar-copia.sql`, trava `configuracoes.ambiente = "teste"`), e do ROMPEX: documentos por competência, link de cadastro, conferir anexo
  antes de enviar, "?" de ajuda, importações com Reverter, Novidades. Fora: NFS-e Nacional, apuração pelos XMLs, leitura por foto com IA (paga).
  Regra: o que muda num módulo do ambiente vale para o sistema todo (peças únicas em `pecas.js`).

- **Respostas ao ambiente de teste (Backup 67):** SEM filtros salvos (F2) e SEM link de cadastro do cliente — removidos. Os e-mails ao cliente continuam com o
  modelo bonito do ERP (`email_cliente_html`/`guias_texto_html`); Honorários continua com a aba Análise (tabelas e gráficos); nenhuma função do ERP sai na reforma
  sem aprovação. Toda mudança pedida num módulo vale para o sistema todo (regra no CLAUDE.md).

## Etapas (uma por Backup/PR)
| Etapa | O que fazer | Situação |
|---|---|---|
| 0 | Guia visual (página-modelo) para aprovação | **feita** (v1 B60 · v2 B61 · v3 B62 · v4 B63) — aprovada, letra Inter |
| 1 | Diagnóstico por escrito: por módulo, o que fica / o que é refeito / ordem | **feita (Backup 61)** — `sistema/DIAGNOSTICO-REFORMA.md` |
| 2 | Base nova do visual | **feita (Backup 63)**: `app/base.css` (última camada, peças `b-*`), peças no `nucleo.js` (`cabecalhoTela`, `cartoesNumero`, `barraAbas`, `buscaB`, `tabelaLeve`, `vazioB`, `abrirJanela` com `kick/sub/dir`), tokens (Inter, cabeçalho claro, escuro preto, lateral 188 px, margens 20 px), confirmação em toda baixa de parcela, testes ajustados. **Decisão:** os 118 blocos "Backup N" do `design.css` NÃO foram reescritos de uma vez (as telas antigas ainda dependem deles); cada bloco sai na rodada da tela dele (3–8), e o `design.css` encolhe até sumir |
| 3–8 | Um módulo por rodada, saindo dos remendos do ERP antigo (`#Sistemas/2 - ERP/ERP.html` + `montar-erp.js`) para telas `telas-*.js` limpas. Ordem proposta no diagnóstico: Parcelamentos → Acordos → Financeiro → Painel/Processos → Rotina → painel lateral nas telas do Gestão | a fazer |
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
