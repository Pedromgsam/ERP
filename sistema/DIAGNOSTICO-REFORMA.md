# Diagnóstico da reforma (Etapa 1) — 09/10/2026

Leia junto com `sistema/PLANO-REFORMA.md`. Aqui está, por módulo, **o que fica**, **o que é refeito** e **em que ordem**.
O banco (`estrutura.sql`) e o funcionamento não mudam; só a forma de desenhar as telas.

## 1. Onde está o problema hoje
| Peça | Tamanho | Por que pesa |
|---|---|---|
| `#Sistemas/2 - ERP/ERP.html` (ERP antigo) | 10.145 linhas | Painel Executivo, Processos, Parcelamentos, Acordos e Financeiro ainda são desenhados por ele |
| `ferramentas/montar-erp.js` | 813 linhas, **190 remendos** (`trocar(`) | cada ajuste dessas telas é uma troca de texto no HTML antigo; ~73 tocam Parcelamentos, ~107 Financeiro, ~49 Acordos, ~43 Processos, ~21 Painel |
| `ferramentas/remendos/*.js` | 5 arquivos, 566 linhas | `parcelamentos-b19`, `lista-grupos-b25`, `acordos-b16`, `acordos-b35`, `contab-b27` — funções do ERP antigo reescritas por cima |
| `app/design.css` | 1.858 linhas, **118 blocos "Backup N"**, 450 `!important` | camadas que desfazem camadas; mudar uma tabela exige vencer regras antigas com `:not(#_)` |
| `app/erp-telas.css` / `estilo.css` / `gs.css` | 428 / 1.269 / 1.238 linhas | três origens de estilo (ERP antigo, Gestão, escopo do Gestão) |
| `tema-escuro.js` | gerado | cores fixas do HTML antigo trocadas por regra; some quando o HTML antigo sair |

As telas do "Gestão" (`telas-*.js`) já são limpas: o problema delas é só visual (herdam o `design.css`).

## 2. Por módulo
Legenda: **Fica** = o código continua, só herda a base nova da Etapa 2 · **Visual** = fica, mas usa a janela central nova e
ajusta cartões/tabelas ao guia · **Refaz** = sai do ERP antigo e vira `telas-x.js` limpa, com os mesmos dados e as mesmas ações.

| Módulo | Hoje | Decisão | Risco | O que muda para você |
|---|---|---|---|---|
| Início | `telas-painel.js` | Fica | baixo | só o visual novo |
| Tarefas | `telas-tarefas.js` (1.510) | Visual | baixo | criar/editar tarefa na janela central nova |
| Alertas | `telas-alertas.js` | Fica | baixo | só o visual |
| **Parcelamentos** | ERP antigo + 73 remendos + `parcelamentos-b19` + `lista-grupos-b25` + `editor.js` (PARC_TABS) | **Refaz** (`telas-parcelamentos.js`) | alto | exatamente a tela-modelo v2: 3 cartões, abas Em atraso/A vencer/Pagas, filtros ao lado, colunas pedidas, Baixa, clique na linha edita, "Situação dos parcelamentos" por grupo |
| **Acordos** | ERP antigo + 49 remendos + `acordos-b16`/`acordos-b35` + `telas-acordos.js` | **Refaz** | alto | mesmo desenho de Parcelamentos (aba A pagar, Emitir, Baixa, cartões por devedor) |
| **Financeiro** (Jurídico e Contabilidade) | ERP antigo + ~107 remendos + `contab-b27` + `telas-financeiro.js` | **Refaz** | alto | mesmos cartões e abas; lançar/editar na janela central nova; gráficos com a paleta única |
| **Painel Executivo** | ERP antigo + 21 remendos + `tabelaPadrao`/evolução no `erp-telas.js` | **Refaz** | médio | mesma tabela de empresas e evolução, sem as larguras forçadas |
| **Processos** | ERP antigo + 43 remendos + `padraoProcessos` | **Refaz** | médio | tabela leve; movimentações na janela central |
| Execuções | `telas-execucoes.js` | Visual | baixo | janela central nova |
| Publicações | `telas-publicacoes.js` | Fica | baixo | só o visual |
| Contratos / Clientes / Ficha 360° | `telas-cadastros.js`, `telas-cliente360.js` | Visual | médio | cadastro do cliente e do contrato na janela central nova (hoje são janelas grandes com abas) |
| CRM | `telas-crm.js` | Visual | baixo | só o visual |
| Documentos + Central | `telas-documentos.js`, `app/documentos/` | Fica | baixo | a Central só troca as cores pelos tokens |
| Rotina | `telas-rotina.js` (824) + muito CSS próprio (`.rt-*`, `.pl-*`, `.ep-*`) | Visual (grande) | médio | mesmas abas; tabelas e planilha no desenho novo |
| Administração | `telas-admin.js` | Fica | baixo | só o visual |
| Guias (janela de envio) | `telas-guias.js` | Visual | médio | composer de guias na janela central nova |

## 3. O que vira peça única (Etapa 2, usada por todas as telas)
Funções no `nucleo.js` (o desenho fica num `base.css` novo, que substitui `design.css` + `erp-telas.css` aos poucos):
1. `cabecalhoTela({icone, titulo, frase, botao})` — o cabeçalho aprovado (ícone + título + frase + Atualizar + botão principal).
2. `cartoesNumero([...])` — os cartões de número (ícone colorido, número, legenda; variante "dupla" para Quitado/falta).
3. `barraAbas({abas, filtros})` — abas sublinhadas com contador e os filtros à direita, **sem cartão** (orientação 3).
4. `tabelaLeve({colunas, linhas, aoClicar})` — cabeçalho claro, linhas altas, dinheiro à direita em negrito, CNPJ/nº em letra de máquina
   pequena e cinza, **sem ✎** (clique na linha abre o editar), coluna Baixa via `perguntarBaixa`. Continua paginando (100) e virando cartões no celular.
5. `janelaCentral({titulo, ficha, blocos, rodape, larga})` — criar, editar e ver detalhes numa janela no CENTRO (decisão de 09/10: o usuário
   prefere ao painel à direita); a larga (1000 px) mostra ficha + resumo + lista (ex.: parcelamento com todas as parcelas); no celular ocupa a tela.
6. `pillSituacao` — já existe (`SITUACOES`); muda só a cor de "vence hoje" para vermelho (orientação 4.1.9).
7. `vazio(...)` — já existe; passa a ter ícone e botão do próximo passo.

Tokens (`tokens.css`): `--font-ui` (letra escolhida; sugestão Inter), lateral `--sw` 204 → **188 px**, margens `--gut` → **20 px** sem limite de largura
(`--conteudo` sai), escuro **preto** (`--bg #000`, cartões `#0B0B0D`) com a lateral em azul-marinho escuro `#0F1B30` e borda.

Testes que mudam junto (nunca apagados sem substituto): `erp.js` (confere o cabeçalho da tabela azul `rgb(31,77,128)` e a letra DM Sans),
`padrao.js` (mede um estilo único por tipo de coluna — passa a medir o padrão novo), `caca-bugs.js` e `visual.js` (prints novos). `telas.js`, `fluxo.sql`, `permissoes.sql`, `velocidade.js` não mudam.

## 4. Ordem proposta
| Rodada | O que | Por quê nessa ordem |
|---|---|---|
| Etapa 2 | Base nova (tokens, peças da seção 3, `base.css`) + testes de padrão | tudo depende dela; as telas do Gestão já melhoram aqui |
| 3 | **Parcelamentos** | é a tela-modelo, já detalhada por você; tira 73 remendos e 2 arquivos de remendo |
| 4 | **Acordos** | mesma lógica de parcelas/guias/baixa; reaproveita a tela 3 |
| 5 | **Financeiro** (Jurídico + Contabilidade) | o maior bloco de remendos (~107) |
| 6 | **Painel Executivo + Processos** | depois disso o `ERP.html` antigo e o `montar-erp.js` deixam de desenhar telas |
| 7 | **Rotina** | usa peças de Parcelamentos e Processos |
| 8 | Contratos/Clientes/Tarefas/Guias na janela central nova | só troca o desenho da janela |
| 9 | Faxina do banco (39 funções repetidas) | sem mudança visível |

Mudança em relação ao plano de 08/10: Parcelamentos passa a ser a primeira tela (antes era Clientes), porque é a tela-modelo e Clientes
já é do Gestão (só muda o visual, o que a Etapa 2 resolve). Se preferir outra ordem, é só dizer.

## 5. O que fica pendente com você
- **Letra** (orientação 7): escolher no seletor do guia v2 — Inter, IBM Plex, Source Sans, Roboto, DM Sans ou "Como hoje" (Playfair no
  cabeçalho das tabelas e JetBrains nos números). Sem essa escolha a Etapa 2 não começa.
- OK no guia v3 (4 cartões, abas com todas as parcelas, janela no centro, janela do parcelamento).
- OK na ordem da seção 4.
