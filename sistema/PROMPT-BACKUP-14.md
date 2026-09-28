# Prompt do Backup 14 — para analisar e autorizar

> Escrito em 28/09/2026. **Nada daqui foi executado.** Na próxima mensagem, o escritório aprova (ou corta) e o Claude executa.
> Regras do `CLAUDE.md` valem para tudo: SQL idempotente, testes com dados fictícios, `montar-erp.js`, backup zip, PR, sem merge.
> Princípio desta rodada: **enxugar**. Cada item deve deixar a tela mais simples; se algo exigir tela nova, prefira botão/aba na tela existente.

---

## Fase 0 — Consertos obrigatórios (achados na revisão do Backup 13)

| # | Onde | Defeito | Correção |
|---|---|---|---|
| 0.1 | `erp-dados.js` (janela de e-mail, `#em-enviar`) | usa `ev.currentTarget` depois de `await` → vira `null`: a janela não fecha e o erro não aparece | guardar o botão numa variável antes do `await` |
| 0.2 | `erp-dados.js` (`criarRascunhoEmail`) | fechar a janela pelo ×, Esc ou fundo não resolve a promessa → botão preso em "Salvando rascunho…" | resolver a promessa em qualquer fechamento (gancho no `fecharJanela`) |
| 0.3 | `estrutura.sql` `rodar_emails_cliente` (lembrete) | inclui linhas de comissão (redutor) como valor negativo | `and not l.redutor` |
| 0.4 | idem (cobrança, itens em aberto) | idem | `and not l.redutor` nos itens |
| 0.5 | `contato_do_cliente` | a finalidade `cobranca` perdeu a prioridade de contato financeiro | tratar `cobranca` igual a `financeiro` na ordem de prioridade |
| 0.6 | lembrete de parcelamento | usa `= current_date + dias`: vencimentos no fim de semana nunca recebem e-mail (a rotina só roda em dia útil) | faixa `between current_date and current_date + dias` + `ref` único (não repete) |
| 0.7 | `carregar_demonstracao` | marcar lançamentos DEMO como pagos dispara `email_pagamento_recebido` para example.com | durante a carga, gravar os `ref` em `automacoes_log` antes (ou desligar o gatilho na sessão); `limpar_demonstracao` apaga também `automacoes_log`/`email_fila` da demonstração |

**Aceite:** teste novo para cada item (permissoes.sql / erp.js).

## Fase 1 — Defeitos que o escritório viu

1. **Alertas — filtros (Todos, Cadastro, Jurídico…) não funcionam.** Causa: o filtro põe `hidden`, mas o CSS `.al-card.al-linha{display:flex}` ganha. Correção: `.al-linha[hidden]{display:none!important}` + teste que conta as linhas **visíveis** depois do clique.
2. **"25 em dia" nos Alertas.** São as verificações sem nada a fazer. Trocar o texto por **"25 verificações sem pendência"** e pôr um `title` explicativo.
3. **Botão "<" (voltar) do navegador.** Hoje não há histórico. Correção: `window.nav` grava `#tela` com `history.pushState`, e o `popstate` reabre a tela; abrir o endereço com `#processos` já cai na tela certa. Janela aberta: o "voltar" fecha a janela antes de trocar de tela.
4. **Contrato de demonstração não abre.** No teste local ele abre (4 contratos). Passos:
   - (a) teste de clique em cada contrato DEMO, com e sem área;
   - (b) mensagem de erro visível se a leitura falhar, em vez de silêncio;
   - (c) pedir ao escritório um print do console se continuar.

   Causa provável: o SQL do Backup 13 ainda não rodou em produção, ou a função do usuário não tem a área certa.
5. **Toast "Última gravação" (canto inferior esquerdo) não some.** Some sozinho em 6 s, e some na hora ao passar o mouse e clicar.

## Fase 2 — Início

1. **Fila de trabalho:**
   - mostra 8 itens + botão **"Ver todos (N)"**, que expande ali mesmo;
   - botão **"▾ Minimizar"** no título (lembra enquanto a página estiver aberta; volta aberto no próximo login — sem localStorage).
2. **Abrir tarefa = ficha de leitura primeiro.**
   - A ficha mostra o que é, prazo, cliente, responsável, revisor, participantes, origem (automação) e histórico.
   - Rodapé com **Concluir**, **Encaminhar para…**, **+ Subtarefa** e **Editar** (o formulário atual).
   - Ações rápidas sem precisar entrar no editar.
3. **Participantes:** lista de marcar (caixinhas) com as pessoas do escritório vindas de `perfis`: Pedro, Emanuelle, Adriana, João Vitor, Éder. Não usar mais texto livre.
4. **Cartões Honorários Jurídico / Contabilidade:** clicar abre o **relatório expandido** (`relatorioTabela` com CSV). Colunas: cliente, descrição, vencimento, valor e situação, filtradas pelo mesmo período do cartão.
5. **Em atraso — Jurídico / Contabilidade:**
   - títulos mais limpos: "Atrasados · Jurídico";
   - trocar a pílula "15 · 1 hoje" por duas: **"15 vencidos"** (vermelho) e **"1 vence hoje"** (âmbar).
6. **Botão "Recebido"** → proposta: **"✓ Registrar pagamento"** (curto: "✓ Pago"). *(decisão do escritório — ver Q3)*
7. **Clicar num honorário abre o detalhe?** Proposta: **sim**, abrindo a ficha de leitura igual à da tarefa. Ela mostra contrato de origem, parcelas irmãs, e-mails enviados (`automacoes_log`) e botões Pagamento / Cobrar / Recibo.

## Fase 3 — Painel Executivo

1. **Valores por extenso** (R$ 1.234.567,89, sem "1,2 mi" + legenda) em Passivo consolidado, Parcelamentos e Negociações e Processos e Indicadores. Onde não couber, a fonte diminui 1 px de cada vez (regra da skill); nunca abreviar.
2. **Processos e Indicadores:** números em **preto** (`--texto`), não coloridos.
3. **Empresas do Grupo:**
   - a pílula do grupo passa a ter largura **pelo conteúdo**, com teto (`max-width`), em vez de 150 px fixos;
   - quebra só entre palavras (`word-break:normal; overflow-wrap:normal; hyphens:none`);
   - a palavra nunca parte ao meio;
   - conferir "DEMO · Família Moreira".

## Fase 4 — Processos

1. Números dos cartões em preto.
2. Cartão **Processos** com subtítulo "(222 em andamento · 47 arquivados/extintos)". **Remover** o cartão "Arquivados/extintos".
3. **Remover** "Ticket médio".
4. **Valor em disputa** com subtítulo "(x sem valor)". **Remover** o cartão "Sem valor".
5. Pílula do Grupo na tabela um pouco menor (padding e fonte −1 px), mesma regra de quebra por palavra.

## Fase 5 — Parcelamentos

1. "Avisar clientes" → **"Notificar clientes"**.
2. **Remover o gráfico** "Saldo residual por empresa". A **tabela** fica, com ordenação pelo cabeçalho e o mesmo visual da "Análise da carteira judicial".
3. **Defeito:** escolher grupo + empresa faz sumir "Situação dos parcelamentos". Corrigir o filtro para o bloco sempre aparecer (com "nenhum parcelamento neste recorte" quando vazio) + teste.
4. Cartões **Progresso por parcelamento**: mostrar o **valor da parcela** ("R$ 1.250,00/mês").

## Fase 6 — Acordos (e regra geral de tabelas)

1. **Regra geral:** tabelas de "por credor/por devedor" **escondem os 100% pagos** e têm o chip "Mostrar quitados (N)". Vale para Acordos → por credor e para as tabelas análogas de Parcelamentos.
2. **Remover** o gráfico "Valor em atraso por devedor".
3. "Valor por devedor" vira **tabela** ordenável (devedor, nº acordos, total, pago, em aberto, em atraso).
4. Cartões **Progresso por acordo**: valor da parcela.

## Fase 7 — Financeiro Contabilidade

1. **Resumo mensal:** o total mostra o valor inteiro.
2. **Fonte da tabela "Resumo mensal"** (o escritório gostou): transformar em classe única (`.tab-num`) e aplicar nas outras tabelas de números (Financeiro Jurídico, Parcelamentos, Acordos, Painel).
3. **Gráficos horizontais:** o total aparece à direita de cada barra (`_barrasComValor` em todos os horizontais).

## Fase 8 — Clientes, Tarefas, Usuários

1. **Clientes:** o filtro padrão passa a ser **Grupo** (agrupado por grupo).
2. **Tarefas — listas do cartão** (Revisor, Responsável…):
   - novo estilo de select: altura 36 px, texto 14 px escuro, seta visível e rótulo acima;
   - o valor escolhido aparece inteiro, sem cortar;
   - vale para todos os `select` dos formulários (`editor.css` / `estilo.css`, via tokens).
3. **Usuários novos** (criar pela Administração → Usuários, com convite por e-mail):

   | Nome | Função | Clientes que vê |
   |---|---|---|
   | Emanuelle | Administrador | Os dois |
   | Adriana | Administrador | Os dois |
   | João Vitor | Estagiário (rascunho) — Jurídico e Contabilidade | Os dois |
   | Éder | "Administrador da Contabilidade" (função nova: Editar/Aprovar em todas as funções da contabilidade; Ver no resto) | Só Contabilidade |

   **Faltam os e-mails** (Q1). Sem eles, o Claude deixa a função "Adm. Contabilidade" pronta e o escritório convida em 1 clique.

## Fase 9 — E-mails ao cliente por cliente (substitui a confusão atual)

**Ideia:** cada cliente tem um **perfil de cobrança**, escolhido na ficha e numa tabela única.

| Perfil | Lembrete antes | Aviso no vencimento | Cobrança após atraso | Recibo/confirmação |
|---|---|---|---|---|
| **Não enviar financeiro** (clientes importantes) | ✗ | ✗ | ✗ | ✗ |
| **Só no vencimento** | ✗ | ✓ | ✗ | ✓ |
| **Padrão** (hoje) | ✓ | ✗ | ✓ | ✓ |
| **Personalizado** | caixinhas por tipo | | | |

- **Banco:**
  - coluna `clientes.perfil_email` (`padrao`/`nunca`/`vencimento`/`personalizado`) + `clientes.emails_tipos jsonb`;
  - a função `pode_email(cliente, tipo)` é consultada por `rodar_emails_cliente` e `pagamento_automacoes`;
  - vale para o grupo inteiro quando marcado no grupo.
- **Tela:**
  - Administração → E-mail vira **"E-mails aos clientes"**: tabela com cliente, grupo, contato financeiro, perfil (select na linha) e último e-mail enviado;
  - edição em massa: marcar vários → "Aplicar perfil";
  - a Central de automações fica só com as regras gerais (liga/desliga e prazos).
- **Aceite:** teste — cliente "nunca" não recebe nada; cliente "vencimento" recebe só no dia; o log mostra "pulado: perfil do cliente".

## Fase 10 — Histórico comparativo (análise)

- **Foto mensal automática:**
  - tabela `fotos_mensais(grupo_id, cliente_id, mes, passivo jsonb por órgão, capag, processos_ativos, processos_extintos, parcelamentos, acordos_abertos)`;
  - gravada pelo pg_cron no dia 1 (e um botão "tirar foto agora");
  - idempotente por (cliente, mês).
- **Comparativo:**
  - na ficha 360° do cliente/grupo e no Painel Executivo, bloco recolhível "Evolução";
  - frase pronta: *"Em 01/2026 devia R$ X; hoje deve R$ Y (+Z%). CAPAG B → C. Tinha 10 processos: 5 extintos, 2 novos."*;
  - tabela mês a mês e seletor "comparar com: mês passado / 3 meses / 12 meses / data".
- **Processos novos/extintos:** o comparativo usa `criado_em` e a data de mudança de situação (gravar `status_em` quando mudar para arquivado/extinto).
- A primeira foto é tirada ao rodar o SQL; o comparativo fica útil a partir do 2º mês. Não há como reconstruir o passado.

## Fase 11 — Edição em massa (estagiário)

- Botão **"Editar em tabela"** no Painel Executivo → Empresas do Grupo e em Clientes:
  - grade com nome, CNPJ, RFB, PGFN, SEFAZ/MG, AGE/MG, CEAT, CAPAG e observação;
  - Tab/Enter anda entre células;
  - colar várias linhas vindas do Excel;
  - células alteradas ficam destacadas.
- **Salvar tudo** grava em lote pelo `sb.from()`. Quem está em rascunho gera **uma proposta por linha** em Aprovações; o aprovador tem "Aprovar todas".
- Validação na célula: número em R$, CNPJ com dígito.

## Fase 12 — Integrações

1. **OFX do Sicoob (grátis) — executar.**
   - Financeiro Jurídico e Contabilidade → botão **"Conciliar extrato (OFX)"**.
   - Leitura do arquivo no navegador (sem servidor), só os créditos.
   - Casamento: valor igual (±R$0,01) + vencimento até 10 dias antes/depois + nome do pagador parecido com o cliente/CPF-CNPJ do memo. Pontuação: alta, média ou nenhuma.
   - Tela de conferência com 3 grupos:
     - **✓ Identificados:** marcar e "Dar baixa" com a data do extrato;
     - **? Dúvida:** escolher entre 2–3 candidatos;
     - **✗ Não identificados:** o escritório escolhe o cliente/lançamento à mão ou marca "ignorar". Fica guardado (`extrato_itens`) para não reaparecer no próximo arquivo.
   - O `FITID` do OFX evita importar o mesmo crédito duas vezes.
   - É viável. O limite é o nome do pagador no PIX/TED, que às vezes vem abreviado, e por isso existe a fila manual.
2. **SERPRO Integra Contador** — só orçamento (ver custos abaixo). Não implementar sem autorização.
3. **PGFN:**
   - Os dados abertos são **trimestrais**, então ficam descartados conforme o escritório pediu.
   - Alternativa mensal: **API SERPRO "Consulta Dívida Ativa"** (paga por consulta). Ela devolve as inscrições por CNPJ: número da inscrição (CDA), situação, valor consolidado e natureza (previdenciária, não previdenciária, FGTS).
   - Se autorizado:
     - função `erp-pgfn` mensal;
     - tabela `pgfn_inscricoes(cnpj, inscricao, natureza, situacao, valor, atualizado_em)`;
     - o ERP mostra só o total (campo PGFN);
     - a ficha do cliente expande por origem (tributária, previdenciária, FGTS, Simples) e lista as CDAs.
   - "Dá para ver dívidas parceladas?" Sim: a situação da inscrição indica "em parcelamento/negociação" (ex.: "ATIVA EM COBRANÇA" × "PARCELADA/NEGOCIADA"). O valor das parcelas vem do Integra Contador (parcelamentos), não da dívida ativa.
4. **Boletos (opinião, não executar):**
   - Sicoob cobra por boleto registrado (tabela 2022: **R$ 3,80**; varia por cooperativa, confirmar com o gerente).
   - Sugestão: **não** emitir para todos. Usar PIX (grátis para PJ receber em muitos planos; confirmar) com a chave nos e-mails (já existe em "Dados para pagamento").
   - Boleto só para quem atrasa com frequência ou exige.

### Custos estimados (confirmar em loja.serpro.gov.br antes de contratar)

- **Integra Contador:** cobrança por requisição, em faixas, sem mensalidade fixa. Na faixa inicial: consulta ≈ R$ 0,24, emissão ≈ R$ 0,32, declaração ≈ R$ 0,40.
- **Exemplo: 100 CNPJs × 3 consultas por mês** (situação fiscal, parcelamentos, caixa postal) = 300 requisições ≈ **R$ 72 a R$ 100/mês**.
- **Mais:** certificado digital A1 do escritório (≈ R$ 150–300/ano conforme a certificadora) e procuração eletrônica de cada cliente no e-CAC (grátis).
- **Consulta Dívida Ativa (PGFN):** também por consulta, com a tabela na loja SERPRO. 100 CNPJs/mês fica na mesma ordem de grandeza.

## Fase 13 — Enxugar

1. **Ações no próprio item:**
   - toda linha de honorário, parcela e tarefa tem ⋯ com Pagamento / Cobrar / Recibo / Editar;
   - sumir com os botões soltos repetidos no topo das telas.
2. **Um só desenho de pílula**, `.pill` com fundo claro e texto escuro, para situação, CAPAG, grupo e área:
   - o vermelho forte só em "ação hoje" (vencido/vence hoje);
   - `caca-bugs.js` ganha uma checagem de pílulas fora do padrão.
3. **Migrar as telas antigas** (Processos → Parcelamentos → Acordos → Financeiro), na ordem do `INVENTARIO-SIMPLIFICACAO.md`, uma por backup:
   - **Antes de cada uma:** tag git `antes-migracao-<tela>` + zip de backup. Para voltar: *"restaurar backup N"* (passo a passo no LEIA-ME).
   - **Aceite de cada tela:** mesmas informações, mesmos filtros, os testes de clique atuais passam, sem mudar o SQL de dados.
   - **Nesta rodada:** migrar **Processos** (a mais simples depois das mudanças acima). As outras ficam para os backups seguintes.

## Fase 14 — Financeiro: sugestões (⚠ NÃO EXECUTAR sem autorização)

1. **Uma tela, duas abas fixas** (Jurídico | Contabilidade). Filtro de período e grupo **no topo, uma vez só**, valendo para as duas.
2. **Topo com 4 números:** Recebido no período · A receber · Em atraso · Comissões. Clicar filtra a tabela abaixo.
3. **Tabela única de lançamentos:**
   - linha com ⋯ (Pagamento, Cobrar, Recibo, Editar, Excluir);
   - seleção múltipla para **baixa em lote** com a mesma data.
4. **"Análise" recolhida por padrão.** Gráficos só quando abertos (economiza tempo de carga).
5. **Lançar mais rápido:** "+ Lançar" com os campos mínimos (cliente, valor, vencimento). "Repetir por N meses" no mesmo formulário.
6. **Conciliação OFX** no mesmo lugar (Fase 12.1).
7. **Fechamento do mês:** botão que gera o PDF "Resumo mensal" (a tabela que o escritório gostou) por área.
8. **Previsão de caixa:** próximos 90 dias (a receber por semana), numa linha simples.
9. **Inadimplência por cliente:** ranking com dias médios de atraso, que alimenta o perfil de e-mail da Fase 9.

---

## Perguntas para o escritório (responder junto com a autorização)

- **Q1.** E-mails de Emanuelle, Adriana, João Vitor e Éder.
- **Q2.** Éder: "Administrador da Contabilidade" (edita e aprova tudo da contabilidade, só vê clientes da contabilidade). Está certo?
- **Q3.** Botão "Recebido" → **"✓ Registrar pagamento"** (ou "✓ Pago")?
- **Q4.** Honorário abre a ficha de detalhe ao clicar? (sugestão: sim)
- **Q5.** Perfis de e-mail da Fase 9: os 4 perfis bastam? Qual é o perfil padrão para clientes novos?
- **Q6.** PGFN: contratar a API SERPRO "Consulta Dívida Ativa" (mensal, paga) ou ficar no manual?
- **Q7.** Integra Contador (situação fiscal, parcelamentos, caixa postal): orçar e contratar agora ou depois?
- **Q8.** Boletos: seguir a sugestão (só PIX; boleto por exceção)?
- **Q9.** Financeiro (Fase 14): quais itens autorizar?
- **Q10.** Migração: começar por Processos nesta rodada?

## Ordem de execução sugerida (um PR)

Fase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12.1 (OFX) → 13.1/13.2 → 13.3 (Processos).
Fases 12.2/12.3 e 14: só com autorização explícita.
