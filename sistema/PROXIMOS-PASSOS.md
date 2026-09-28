# Análise completa e próximos passos (Backup 12)

> Escrita em 28/09/2026, a pedido do escritório: o sistema cresceu e precisa continuar **simples de usar**.
> Pedido autorizado para execução imediata. O que já foi feito nesta entrega está marcado com ✅.
> O que fica para as próximas rodadas está em ordem de prioridade.

---

## 1. Diagnóstico em uma frase por área

| Área | Como está | O que falta |
|---|---|---|
| **Visual** | Profissional, mas com cara de "planilha arrumada": 3 fontes diferentes, números em fonte de máquina de escrever, cartões com borda grossa colorida. | Uma fonte só, números modernos, sombras suaves e botões com a cor da marca. ✅ |
| **Menu** | 13 itens na barra. No limite: mais um item já aperta a tela de 1366 px. | **Não criar item novo no menu.** Coisas novas entram no Início, no ⋯ ou dentro das telas (foi o que fizemos com Aprovações). |
| **Acesso** | Por função (Ver / Editar), mas todo mundo via todos os clientes. | Área do cliente (Jurídico / Contabilidade / os dois) e modo rascunho para estagiário. ✅ |
| **Financeiro** | Completo. A baixa sempre gravava a data de hoje. | Perguntar a data (vem com hoje, dá para trocar). ✅ |
| **Acordos** | Sem registro de que o comprovante foi juntado ao processo. | Sim/Não + ID do documento. ✅ |
| **Contratos** | O êxito era só um "%" solto, sem regra e sem forma de lançar. | Regra do êxito + botão "Registrar êxito" que lança % × X. ✅ |
| **Automações** | Central pronta (Backup 11), com e-mails ao cliente desligados. | Ligar os e-mails escolhidos pelo escritório; sugestões na seção 4. |
| **Integrações** | CNPJ gratuito com reservas. As pagas (processos, certidões, WhatsApp) têm os preços em `INTEGRACOES-CUSTOS.md`. | Decisão do escritório sobre o que contratar. |
| **Código antigo** | O `gestao.html` e o ERP antigo convivem com as telas novas. | Migração em ordem (`INVENTARIO-SIMPLIFICACAO.md`) e apagar o `gestao.html` quando o escritório autorizar. |

---

## 2. Feito nesta entrega (Backup 12)

1. ✅ **Área do cliente.**
   - Cada cliente passa a ser *Jurídico*, *Contabilidade* ou *Jurídico + Contabilidade*.
   - Na primeira vez que o SQL rodar, o sistema sugere a área sozinho: só lançamentos da contabilidade = Contabilidade; só processos, contratos ou honorários do jurídico = Jurídico; os dois (ou nenhum) = os dois.
   - Em **Administração → Usuários → Funções**, cada pessoa ganha "Clientes que vê": *Só Jurídico*, *Só Contabilidade* ou *Os dois*.
   - A regra fica **no banco**: quem só vê a Contabilidade não recebe, nem pela internet, os clientes só do Jurídico, nem os contatos, contratos e documentos deles.
2. ✅ **Rascunho de estagiário.**
   - Nas Funções há um nível novo, **Rascunho** (entre Ver e Editar), e o modelo pronto "Estagiário (rascunho)".
   - A pessoa usa as telas normalmente. Ao salvar, a alteração vai para **Aprovações**.
   - Quem edita aquela área recebe um aviso no sino e uma faixa no Início. Vê *antes → depois*, aprova ou recusa (com motivo), e o autor é avisado.
   - Ninguém aprova a própria alteração. Exclusões importantes só o administrador aprova.
   - O banco garante isso: sem "Editar", a gravação direta é recusada.
3. ✅ **Data do recebimento.** Todo botão de baixa (Início, Financeiro, ✓ Baixa das tabelas do ERP, formulário do ERP, detalhe do acordo) abre uma janela com a data já preenchida com **hoje**. Se o dinheiro entrou em outro dia, basta trocar.
4. ✅ **Comprovante do acordo.** Na baixa da parcela aparece a pergunta "O comprovante foi anexado ao processo?" (Sim/Não). Se Sim, o sistema pede o **ID** do documento no processo. A informação aparece no detalhe do acordo e no formulário.
5. ✅ **Financeiro Jurídico → Análise.** "Comparativo por pessoa" agora vem **antes** de "Recebido por tipo de serviço / Maiores grupos".
6. ✅ **Êxito nos contratos.**
   - No contrato: o **%**, *sobre o quê* (economia obtida, valor recebido pelo cliente, valor da causa ou outro) e *como foi combinado*.
   - Enquanto não acontece, **nada entra no financeiro**, e a lista mostra "aguardando o êxito".
   - Quando acontece: no contrato, clique em **🏆 Registrar êxito** e informe **X** (ex.: quanto a dívida reduziu). O sistema calcula % × X e lança em Honorários Jurídico, na categoria *Êxito*, com o vencimento escolhido.
   - Pode haver vários êxitos no mesmo contrato (reduções parciais), todos listados no contrato.
7. ✅ **Visual moderno e tecnológico.**
   - Fonte **Inter** em tudo, com números alinhados.
   - Títulos mais firmes.
   - Barra superior em "vidro" escuro com filete ouro→azul.
   - Cartões com sombra suave e faixa de cor fina, e botões principais com degradê da marca.
   - Foco dos campos com anel azul, linhas de tabela realçadas ao passar o mouse e janelas com cantos maiores.
   - O caça-bugs visual continua zerado (claro e escuro, 1440/1024/390 px).

---

## 3. Próximos passos de visual (sem complicar)

1. **Tamanho de letra:** manter 13,5–14 px nas tabelas e 24 px nos números dos cartões. Evitar mais de 3 tamanhos por tela.
2. **Espaçamento:** passo de 4 px (8, 12, 16, 24). Os cartões usam 16–18 px por dentro e 16 px entre si.
3. **Cores:** continuar só com `tokens.css`. Verde = recebido/ok, vermelho = atraso, âmbar = atenção, azul = informação, violeta = contabilidade.
4. **Ícones:** trocar os emojis dos títulos por um conjunto de ícones de traço fino, gratuito, que dá cara mais "software". Só depois de migrar as telas antigas, para não ter dois estilos.
5. **Telas do ERP antigo** (Processos, Parcelamentos, Honorários): migrar para as telas novas na ordem do `INVENTARIO-SIMPLIFICACAO.md`. É o que mais aumenta a sensação de sistema único.

## 4. Funções: aumentar, reduzir, ajustar

**Reduzir / simplificar**

1. Apagar o `gestao.html` (aguarda autorização) → menos código e um só jeito de fazer cada coisa.
2. Tela **Notificações** do menu: juntar com o sino 🔔 (o sino já mostra tudo) → um item a menos no menu.
3. "Painel Executivo" e "Alertas" têm informações parecidas (passivo, CAPAG, certidões): manter o Painel para números e os Alertas para ação.

**Ajustar**

4. **Baixa em lote:** marcar várias parcelas recebidas de uma vez, com a mesma data.
5. **Recibo automático** ao dar baixa (já existe o recibo): perguntar "gerar recibo?" na mesma janela da data.
6. **Êxito com alerta:** tarefa mensal "verificar se o êxito aconteceu" para contratos aguardando há mais de 90 dias.

**Aumentar (quando o escritório quiser)**

7. **Área também nas tarefas e no financeiro:** hoje a área vale para clientes, contatos, contratos e documentos; o financeiro já é separado por função (Jurídico/Contabilidade).
8. **Rascunho em mais lugares:** tarefas e documentos (hoje: clientes, contratos, jurídico e financeiro).
9. **Portal do cliente com comprovantes:** o cliente envia o comprovante pelo portal e ele cai no acordo certo.

## 5. Automações sugeridas (todas gratuitas)

| Automação | O que faz |
|---|---|
| Êxito parado | Contrato de êxito sem registro há 90 dias → tarefa "verificar andamento" para o responsável. |
| Comprovante pendente | Parcela de acordo paga com "comprovante no processo = Não" → tarefa "juntar comprovante" em 2 dias úteis. |
| Rascunho parado | Proposta pendente há mais de 2 dias úteis → lembrete para quem aprova. |
| Recebimento lançado com data antiga | Data do recebimento com mais de 30 dias → aviso ao administrador (conferência de caixa). |

## 6. Aguardando o escritório

1. Qual **API de CNPJ** é usada no Google Sheets.
2. Quais **integrações pagas** contratar (preços em `INTEGRACOES-CUSTOS.md`).
3. Se pode **apagar o gestao.html**.
4. Quais **e-mails ao cliente** ligar (Central de automações).
5. Conferir a **área sugerida** dos clientes (Clientes → filtro "Todas as áreas") e ajustar a de quem ficou diferente.
