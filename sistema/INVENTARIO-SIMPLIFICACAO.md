# Inventário para simplificar o código (medido em 28/09/2026)

Este inventário serve para a próxima rodada de simplificação. Ele diz o que existe hoje, o que já foi feito e em que ordem migrar sem quebrar nada.

## Como o sistema está montado

| Parte | Tamanho | Origem |
|---|---|---|
| `index.html` (ERP) | 544 KB | Gerado a partir de `#Sistemas/2 - ERP/ERP.html` (10.145 linhas) + 40 remendos em `ferramentas/montar-erp.js` |
| `gestao-embutida.js` | ~350 KB | Gerado a partir das telas novas (`app/telas-*.js`, `nucleo.js`, `graficos.js`) |
| `editor.js` / `erp-telas.js` / `erp-dados.js` | 40 / 28 / 22 KB | Ponte entre o ERP antigo e as telas novas |

### Telas e quem as desenha

| Tela | Desenhada por |
|---|---|
| Início, Contratos, Clientes, CRM, Documentos, Tarefas, Alertas, Publicações, Administração | Telas novas (`telas-*.js`) |
| Painel Executivo, Processos, Parcelamentos, Acordos, Financeiro Jurídico, Financeiro Contabilidade, Notificações/Recibos, Relatório PDF | ERP antigo (`ERP.html` + remendos) |

## O que a medição mostrou

A medição foi feita com a cobertura de código do Chrome durante os 152 testes do `erp.js`.

- **ERP antigo:** 356 funções. **Só 4 não são chamadas por ninguém**, e juntas somam 0,7 KB: `_fixarUrlDoArquivo`, `acAuthHash`, `mClose`, `_acLogAcesso`. O código morto já foi removido nas rodadas anteriores (o CRM antigo, por exemplo).
- **212 KB das funções do ERP antigo não rodam nos testes.** Não é código morto: são recursos que os testes ainda não acionam. Os maiores:
  - PDF por grupo e por empresa (`gerarPDFGrupo`, `gerarPDFEmpresa`);
  - abas do Financeiro Contabilidade (caixa, fechados, sócios);
  - Prejuízo, Recebidos e Recibo;
  - envio de e-mail (`ep*`).
- **Telas do Gestão que o ERP nunca mostra** (~20 KB): `TELAS.painel`, `TELAS.juridico`, `TELAS.contabilidade`, `telaHonorarios`, `pintarPainel`, `pintarAnalise` e os gráficos próprios delas. Só o `gestao.html` antigo usa essas telas. Elas podem sair do pacote quando o `gestao.html` for apagado, o que **só acontece com a sua ordem**.

## O que já foi simplificado nesta rodada

- **Cores:** um arquivo só (`tokens.css`) no lugar de três paletas diferentes. O modo escuro é gerado automaticamente a partir do CSS existente, então não existe uma segunda folha de estilo para manter à mão.
- **Relatório padrão:** a função `relatorioTabela` (tabela ordenável, CSV e clique na ficha) passa a servir Alertas e Clientes. Nas próximas telas, use essa função, não uma cópia.
- **Estado vazio padrão:** a função `vazio(frase, botão, seletor)` é usada em todas as listas principais.
- **Tabelas longas:** um único mecanismo (`paginarTabelas`) vale para o ERP antigo e para as telas novas.
- **Janelas:** as de edição do ERP (`editor.js`, classes `gx-*`) já têm o mesmo visual das janelas das telas novas, porque o `editor.css` iguala os estilos. **Unificar o código ficou para a migração** (abaixo): hoje são 3 janelas no `editor.js`, cobertas por testes, e trocar o mecanismo só traria risco, sem mudança visível.

## Plano de migração, uma tela por vez

Para cada tela, na ordem abaixo:

1. **Primeiro, testes.** Escrever no `erp.js` os testes que faltam (PDF, abas, filtros) enquanto a tela ainda é a antiga.
2. Reescrever a tela como `telas-x.js`, com `relatorioTabela`, `vazio`, `kpi` e as cores do `tokens.css`.
3. Pôr em `TELAS_GS` (`erp-telas.js`) e apagar do `montar-erp.js` os remendos que só serviam àquela tela.
4. Rodar todos os testes. Conferir os prints antes e depois.

| Ordem | Tela | Remendos que saem | Esforço | Por quê nesta ordem |
|---|---|---|---|---|
| 1 | Notificações / Recibos | 4b, 5 | médio | Pouca conta; tira o recibo do HTML |
| 2 | Parcelamentos | parte do 4 e do 7 | médio | Tabela e gráficos simples |
| 3 | Acordos | parte do 4 e do 7 | pequeno | Já tem o detalhe novo (`telas-acordos.js`) |
| 4 | Processos | parte do 4 | médio | Análise + tabela |
| 5 | Financeiro Jurídico e Contabilidade | 6, parte do 8 | grande | Muitas abas; depende dos testes das abas |
| 6 | Painel Executivo + PDF | 10, 11, parte do 8 | grande | É o coração do ERP; por último, com tudo testado |

Ao final, o `ERP.html` vira só a casca (login + barra), o `montar-erp.js` fica sem remendos e o `index.html` deve cair para menos de 150 KB.

### Remendos do `montar-erp.js` hoje

| Nº | O que faz |
|---|---|
| 1 | Scripts locais e ponte com o Supabase |
| 2 | Desliga as chamadas ao Google |
| 3 | Login por e-mail |
| 4 | Linhas editáveis (`data-gx`) |
| 4b | E-mail |
| 5 | Dados dos advogados vindos do banco |
| 6 | Em atraso (regra do Gestão) |
| 7 | Acordos e parcelamentos fora dos honorários |
| 8 | Formato de dinheiro |
| 9 | Retirada do CRM antigo |
| 10 | CAPAG omisso |
| 11 | Barras do Painel |
| 12 | "Serviço pontual" |
| 13 | Tokens e modo escuro |
| 14 | Imagens em arquivo |
| 15 | Carimbo de versão |

Os remendos 1, 2, 3, 13, 14 e 15 são da casca e **ficam**. Os demais saem junto com a tela que atendem.
