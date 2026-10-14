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

- **Respostas à tela nova de Parcelamentos (Backup 69):** a TABELA de toda tela refeita segue a de **Acordos** (o usuário preferiu): "A pagar / Pago" (botões, não abas sublinhadas),
  atalhos Todas · Vencidas · 5 · 10 · 15 · 30 dias · até, busca + contador, coluna **Prazo** colorida (com "✓ emitido"), botões **Emitir** + **Baixa** verde na linha, linha vencida rosada,
  SEM caixinha de marcar várias; listas e vencimento/valor dentro de "Filtros". Letra Inter mantida. Cartões de grupo com **"Parcela do mês"**.

## Etapas (uma por Backup/PR)
| Etapa | O que fazer | Situação |
|---|---|---|
| 0 | Guia visual (página-modelo) para aprovação | **feita** (v1 B60 · v2 B61 · v3 B62 · v4 B63) — aprovada, letra Inter |
| 1 | Diagnóstico por escrito: por módulo, o que fica / o que é refeito / ordem | **feita (Backup 61)** — `sistema/DIAGNOSTICO-REFORMA.md` |
| 2 | Base nova do visual | **feita (Backup 63)**: `app/base.css` (última camada, peças `b-*`), peças no `nucleo.js` (`cabecalhoTela`, `cartoesNumero`, `barraAbas`, `buscaB`, `tabelaLeve`, `vazioB`, `abrirJanela` com `kick/sub/dir`), tokens (Inter, cabeçalho claro, escuro preto, lateral 188 px, margens 20 px), confirmação em toda baixa de parcela, testes ajustados. **Decisão:** os 118 blocos "Backup N" do `design.css` NÃO foram reescritos de uma vez (as telas antigas ainda dependem deles); cada bloco sai na rodada da tela dele (3–8), e o `design.css` encolhe até sumir |
| 3 | Parcelamentos | **feita (Backup 68)**: `telas-parcelamentos.js` (TELAS.parcelamentos, `semCadastros`), peças `cartoesB`/`tabelaB`/`vencB` no nucleo.js + CSS no fim do base.css; o painel antigo fica para o portal do cliente (erp-telas `ehGS`) |
| 4 | Acordos | **feita (Backup 70)**: `telas-acordos-nova.js` (TELAS.acordos, `semCadastros`; dados = `DB.acordos` → `acDoERP`); painel antigo fica para o portal do cliente |
| 5 | Financeiro | **feita (Backup 70), híbrida**: listas de lançamentos = `tabelaLancB` (telas-financeiro.js, peça tabelaB, `loteBotao` = "Marcar várias"); análise/gráficos/caixa continuam do ERP antigo |
| 6 | Painel/Processos | **feita (Backup 70), híbrida**: Processos = lista nova `#pr-nova` (erp-telas `processosNovos`, janela `abrirProcesso`); Painel e análises: cartões `.kc` e números no visual novo (base.css). A tabela "Empresas do grupo" segue a do ERP antigo (muitos ajustes aprovados nela) |
| 7 | Rotina | **feita (Backup 70)**: cabeçalho/placar/abas com as peças novas; Minhas tarefas = tabelaB com abas; Passivo/Processos/Guias/Planilha por dentro iguais |
| 8 | Tirar o ERP antigo de vez (ERP.html + 190 remendos + blocos do design.css), depois de levar para o ERP as telas aprovadas no ambiente v2 e o portal do cliente novo | ambiente v2 aprovado (A1–A5, 12/10/2026). **Backup 72 = 1ª rodada** (Tarefas, Publicações, Processos, Parcelamentos, Contabilidade); **Backup 73 = 2ª** (Painel, Rotina; Usuários/Importações já estavam certos); **Backup 74 = 3ª** (Financeiro Análise, Início, ficha do cliente, CRM, seções que abrem, Início do portal); **Backup 75** = faxina do banco (A5, 41 de 60 cópias) + limpeza de código/CSS morto; **Backup 76** = S1–S8 (Financeiro, Painel, Resumo da carteira, Notificações, portal do cliente, sem cálculo do Início antigo, faxina de 18 das 19 cópias); falta A4 = tirar entrada/sessão/carga de dados/nav do `ERP.html` (ver `SUGESTOES-B76.md`) |
| 9 | Faxina do banco: 39 funções escritas mais de uma vez no `estrutura.sql` (manter só a última, idempotente) | a fazer |
| 10+ | Funções novas (lista A–K): o usuário escolheu só **Ctrl+K e a ajuda "?"** (12/10/2026) — já estão no ambiente; vão para o ERP junto com a etapa 8 | escolhido |

## Como conduzir cada rodada
1. Uma etapa por vez; não misturar com pedidos grandes de função nova (correções urgentes podem entrar).
2. Mesmo funcionamento: os testes do `rodar-tudo.sh` precisam continuar passando; teste que media o visual antigo é atualizado para o padrão novo (nunca apagado sem substituto).
3. Prints antes/depois em 1366 px, celular (390 px) e escuro, com as fontes reais (ver CLAUDE.md, Backup 56).
4. Entrega no fluxo de sempre (CLAUDE.md "Como entregar"): docs, backup zip, PR, resposta em português simples com o passo a passo.
5. Atualizar a tabela de etapas acima ao terminar cada uma.

## Números de partida (08/10/2026)
- `design.css` 1.858 linhas com 118 blocos "Backup N" e ~450 linhas com `!important`; `montar-erp.js` com 190 remendos (`trocar(`)
  sobre o `ERP.html` antigo (10.145 linhas); `estrutura.sql` 7.922 linhas, 276 funções, 39 repetidas.

- **Respostas de 12/10/2026 (Backup 71):** os 4 cartões do topo (com "ver") saem de vez — vale para o sistema todo (tirados de Parcelamentos e Acordos no ERP; no ambiente v2 nenhuma tela tem cartões
  de número no topo). Funções novas: só Ctrl+K e "?". Portal do cliente: novo e simples, o cliente vê só o dele (parcelas, acordos, execuções, documentos, contratos e financeiro). E-mails de parcelamento (e acordo)
  são sempre manuais; a opção é **rascunho no Gmail** ou **enviar direto** (precisa anexar a guia). Tudo primeiro no ambiente de teste; o ERP antigo sai depois da aprovação (ver "Para aprovar → Tirar o ERP antigo", A1–A5).
- **Ambiente v2** (`sistema/prototipos/ambiente-teste/`, dados versão 4, hoje fixo 12/10/2026): `pecas.js` (APP.tabela no desenho de Acordos com `prazos`/`prazosAbas`/`contagem`/`lote` + "Marcar várias", `APP.faixa`/`ligarFaixa`,
  `APP.nums`, `APP.cartoesGrupo`, `APP.colunas`/`APP.linha`/`APP.barrasH` em HTML, `APP.T(chave)` + `textos.js` = textos antes/depois, `APP.preparar(id, {prazo, aba, q})` = abrir lista já filtrada), `negocio.js` (`N.janelaEmitir(itens, tipo)`
  lê o PDF e salva rascunho/envia conforme `D.emailCfg`, `N.pendencias()` = faixa do Início, `N.baixa*`), telas em `telas-inicio/juridico/financeiro/cadastros/rotina/admin.js`, `portal.js`, `telas-aprovar.js` (respostas em
  localStorage `aprov`, "Copiar minhas respostas"). Teste: servir a pasta + playwright (scratchpad `amb2.js` e `amb2-cliques.js`, 31 cliques).

- **Respostas de 12/10/2026 ("Para aprovar" + pedidos por tela; levar ao ERP, Backup 72 em diante):** textos todos aprovados MENOS "O que pede ação hoje" (Início). Enxugar: aprovados E1, E2, E5, E6, E7, E9–E12;
  NÃO E3 (Início mantém os cartões Financeiro e Escritório), NÃO E4 (placar da Rotina continua em cartões), NÃO E8 (CRM mantém as etapas atuais). Melhorias M1–M16 aprovadas; NÃO M17 (Asaas) e M18 (WhatsApp pago).
  Tirar o ERP antigo: A1–A5 aprovados. Por tela: **Contabilidade** = gráficos "Recebido por tipo de serviço" e "Maiores grupos", sem comparativos por cliente/fornecedor (B72 ✓). **Início** = o do ambiente, funcional.
  **Tarefas** = a versão atual com 15 ajustes (B72 ✓). **Painel** = números do topo e linha da evolução do ambiente, mas com escala 0/10 mi/20 mi… à esquerda e "jun/26 1,5 mi" ao passar o mouse; Empresas do grupo no desenho
  do ambiente com as colunas ATUAIS; sem bolinha no grupo. **Processos** = ambiente sem bolinha, sem "Conferido" (usar Status), filtros afastados da tabela como hoje (B72 ✓). **Parcelamentos** = ambiente + nº do parcelamento
  na situação por cliente (B72 ✓); sem bolinha de grupo no ERP todo (B72 ✓). **Publicações** = ambiente + filtros de tratadas e prazos/período (B72 ✓). **Clientes** = o atual (ficha atual, mais completa) com o desenho do
  ambiente. **CRM** = o atual com o desenho do ambiente. **Rotina** = a atual inteira; Passivo atual mas colunas Certificado e Conferência do ambiente; Planilha do ambiente + última parcela, valor residual e "emitimos as guias";
  Minhas tarefas do ambiente. **Geral** = cartões expansíveis como no ambiente. **Importações** sem histórico/reverter. **Usuários** com editar/excluir. **Portal do cliente**: a aba "Início" precisa ser uma página de boas-vindas.
- **Backup 77 (14/10/2026) — design moderno:** pedido "clean, elegante e moderno", parâmetro ROMPEX, pode reestruturar. Feito só no ambiente de teste (v3, https://claude.ai/artifact/GMgLFUpDhAoBs1LMrh6QiP): 3 designs para comparar (A Nítido = ROMPEX fiel; B Claro = Linear/Vercel/Notion; C Executivo = marinho e dourado do ERP antigo, títulos Playfair) + modo Enxuto (X1–X4). Publicações voltaram ao desenho de antes do B72 (ERP e ambiente). **Próximo:** o usuário escolhe A, B ou C (Para aprovar → Design) e o escolhido vai para o ERP inteiro (tokens + base.css) numa rodada.
- **Respostas de 14/10/2026 (Backup 78):** NÃO aos designs A/B/C (fica o atual); SIM ao Enxuto X1–X4 e a P1 (Publicações como antes); textos e itens E/M/A iguais às respostas de 12/10 (NÃO: E3, M17, M18, "O que pede ação hoje"). Pedidos novos: portal do cliente com Início só de introdução; Parcelamentos/Acordos/Execuções do cliente parecidos com a tela da equipe (cartões que abrem); Financeiro do cliente separado em Jurídico e Contábil; coluna "Parcelamento" com natureza, plataforma e nº. Feito no ERP: enxuto, coluna Parcelamento, Início do portal. Feito só no ambiente (v4): portal com cartões e Financeiro separado. **Próximo:** OK do usuário no portal do ambiente → SQL para o cliente ver Execuções e Financeiro do próprio grupo + telas do portal no ERP.
