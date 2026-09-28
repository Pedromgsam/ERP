# Viabilidade: Receita Federal, SIARE/MG e Sicoob (Backup 13)

> Análise de 28/09/2026. Nada aqui foi contratado nem ligado.
> Quando um item tem custo, o preço precisa ser **confirmado no site oficial antes de contratar**.
> Não inventamos valores.

## Resumo em uma linha

| Integração | Dá para fazer? | Custo | Recomendação |
|---|---|---|---|
| **Receita Federal (e-CAC)** — situação fiscal, DCTFWeb, parcelamentos, caixa postal | **Sim, pelo caminho oficial**: API *Integra Contador* do SERPRO, com procuração eletrônica dos clientes | Pago **por consulta** (tabela na loja do SERPRO) + certificado digital A1 do escritório | Vale a pena quando a carteira crescer. Comece por "situação fiscal" 1 vez por mês por cliente |
| **PGFN — dívida ativa** | Dados abertos são **trimestrais** (descartado). **Feito no Backup 14:** API *Consulta Dívida Ativa* do SERPRO (função `erp-pgfn`) | Pago por consulta (tabela da Loja SERPRO; fontes citam de R$ 0,13 a R$ 0,63 por consulta, conforme o volume) | Pronto; liga quando o escritório contratar e salvar a chave em Alertas → PGFN |
| **SIARE / SEF-MG** | **Não há API.** Só com "robô" que entra no site com o certificado e resolve captcha | Robô: servidor ligado + manutenção a cada mudança do site | **Não recomendado**: frágil, pode bloquear o acesso e expõe o certificado. Manter a consulta manual |
| **CND federal/estadual (certidões)** | Os sites usam captcha. Existem serviços pagos que emitem por API | Pago por certidão (conferir o fornecedor) | Só se o volume justificar. Hoje: o sistema já avisa a validade (Alertas) |
| **Sicoob — conciliação bancária** | **Sim.** Caminho 1: arquivo **OFX** do extrato (grátis, já). Caminho 2: **API oficial do Sicoob** (extrato, PIX, boletos) | OFX: grátis. API: contrato com a cooperativa + certificado A1; tarifas de PIX/boleto negociadas com o Sicoob | **Começar pelo OFX** (próxima rodada). Depois, se quiser automático, a API |

## 1. Receita Federal (e-CAC)

- **Como funciona o oficial.** O SERPRO vende a API *Integra Contador*. O escritório entra com o **certificado digital A1** dele, e cada cliente dá **procuração eletrônica** no e-CAC para o escritório.
- **O que a API entrega:** consultas como situação fiscal, pendências, DCTFWeb, PGDAS-D, parcelamentos e mensagens da caixa postal.
- **No sistema** entraria uma função do Supabase (`erp-receita`), igual à do cartão CNPJ. Ela rodaria de madrugada e preencheria a ficha 360° e os Alertas ("pendência nova na Receita").
- **Custo:**
  - cobrança **por consulta**, com faixas de preço, conforme a tabela da loja do SERPRO;
  - certificado A1, cujo preço varia por certificadora.
  - **Antes de decidir**, conte quantos clientes × quantas consultas por mês. Ex.: 100 clientes × 1 consulta de situação fiscal por mês.
- **O que não fazer:** entrar no e-CAC com robô, raspando a tela. Isso é contra as regras do portal e quebra a cada mudança do site.

## 2. PGFN

**Backup 14:** implementado pela API paga *Consulta Dívida Ativa* do SERPRO (a lista grátis é trimestral). Frequência escolhida na tela (diária, semanal ou mensal).
A API cobre as dívidas **não previdenciárias**; FGTS e previdenciárias aparecem só se a API devolver.

Texto original (Backup 13):

- A PGFN publica a relação de inscritos em dívida ativa, com CNPJ e valores, no portal de dados abertos. A lista é atualizada a cada trimestre.
- O sistema pode baixar o arquivo, cruzar pelo CNPJ dos clientes e atualizar sozinho o campo **PGFN** do Painel Executivo. Quem mudou de valor viraria alerta.
- **Custo zero.** Limite: não é em tempo real (trimestral).

## 3. SIARE / SEF-MG

- Não existe API pública. O acesso exige login ou certificado, e as telas têm captcha.
- Um robô até funcionaria, mas precisaria de um computador ligado com o certificado instalado, e quebraria a cada mudança do site. Isso é risco para o certificado do escritório.
- **Recomendação:** manter a consulta manual. O sistema lembra quando consultar (tarefa recorrente por cliente, em Tarefas → recorrência mensal).

## 4. Sicoob — conciliação bancária

**Caminho 1 — OFX (grátis, dá para fazer já)**

1. No app ou internet banking do Sicoob: Extrato → período → **Exportar OFX**.
2. No ERP: Financeiro → **Conciliar extrato** → escolher o arquivo.
3. O sistema lê as entradas e procura os honorários em aberto com o mesmo valor e data próxima. A chave PIX ajuda quando existe.
4. Mostra a lista para você confirmar: ✓ baixa com a data do extrato, ou ✗ ignora.

Assim a data do recebimento sai certa (a do banco), sem digitar.

**Caminho 2 — API oficial do Sicoob (automático)**

- O Sicoob tem portal de desenvolvedores com APIs de conta corrente (extrato), PIX e cobrança (boletos).
- Exige cooperado PJ, cadastro do aplicativo, contrato com a cooperativa e certificado A1 (conexão mTLS).
- Uma função do Supabase leria o extrato todo dia e faria o mesmo casamento do OFX, deixando as sugestões prontas.
- **Custo:** o acesso costuma ser liberado ao cooperado. Tarifas de PIX e boleto dependem da cooperativa, então é preciso **perguntar ao gerente**. Soma-se o certificado A1.

---

# Enxugar sem perder funções — sugestões

1. **Menu com 12 itens → 9 grupos.** Juntar "Painel Executivo" + "Alertas" em **Visão geral**, e "Documentos" dentro de **Clientes**. As telas continuam iguais; só o caminho fica menor.
2. **Uma tela de lista por assunto.** Acordos e Parcelamentos são "dívidas do cliente": podem virar abas de uma tela **Dívidas do cliente**.
3. **Gráficos só onde decidem algo.** Já saíram os gráficos repetidos (Processos, Parcelamentos, Maiores clientes). Próximos candidatos:
   - "Passivo total por grupo", que repete a tabela "Empresas do Grupo";
   - "Valor por devedor" dos Acordos.

   Você decide depois de ver a tela nova.
4. **Números em um lugar só.** Cada número aparece uma vez por tela (ex.: "A receber" não soma o atraso).
5. **Ações no próprio item.** Dar baixa, cobrar, avisar e gerar recibo ficam na linha ou no cabeçalho da tela, sem precisar ir a outro módulo (foi o que fizemos com "Cobranças").
6. **Mesmo desenho em todos os selos** (situação, CAPAG, grupo): pílula clara com texto escuro. O vermelho forte fica só para o que pede ação hoje.
7. **Migrar as telas antigas** (Processos, Parcelamentos, Acordos, Financeiro) para o padrão das telas novas, na ordem do `INVENTARIO-SIMPLIFICACAO.md`. É o passo que mais simplifica o código e a manutenção.
