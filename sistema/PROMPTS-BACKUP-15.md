# Prompts para as próximas rodadas (Backup 15)

Cada bloco abaixo é um pedido pronto: copie o bloco inteiro e cole numa conversa nova com o Claude.
Nada disso foi executado ainda — são propostas para você revisar, cortar ou acrescentar.

---

## 1. E-mails de honorários, parcelamentos, acordos e recibos

> Objetivo: trocar a tela "Cobranças, avisos e recibos" por uma central de e-mails mais simples.
> Se tudo der certo, a tela antiga é excluída na rodada seguinte (não antes).

```
Crie a "Central de e-mails ao cliente" no ERP (Backup 16), substituindo a tela
"Cobranças, avisos e recibos". NÃO apague a tela antiga nesta rodada: deixe-a no ⋯ como
"Tela antiga de cobranças" até eu confirmar que a nova funciona.

1. Quatro tipos de e-mail, cada um com modelo próprio e editável em Administração → E-mails:
   a) HONORÁRIOS — lembrete (X dias antes), vence hoje, em atraso (1º, 2º e 3º aviso, com
      intervalos configuráveis). Lista os honorários do cliente em tabela (descrição, vencimento,
      valor, situação) e o total.
   b) PARCELAMENTOS — aviso da guia do mês (órgão, nº do parcelamento, parcela x/y, valor,
      vencimento) e alerta de parcelas em atraso com risco de rescisão (3 parcelas).
   c) ACORDOS — lembrete da parcela do acordo (credor, processo, parcela x/y, valor, vencimento)
      e aviso de atraso com a consequência prevista no acordo.
   d) RECIBOS — enviado automaticamente quando eu marcar "Recebido": recibo em PDF com o
      emitente certo (Pedro, Emanuelle ou Escritório), valor por extenso e data do pagamento.
2. Respeitar o perfil de e-mail de cada cliente (padrao / só vencidos / nunca) e o contato
   financeiro do cliente. Nunca mandar para example.com e nunca repetir o mesmo aviso.
3. Tela única: filtros por tipo, por cliente/grupo e por situação (a enviar hoje, enviados,
   com erro). Cada linha mostra a prévia do e-mail. Botões: "Enviar selecionados",
   "Enviar agora", "Pular este".
4. Modo automático por tipo (ligado/desligado) em Alertas → Rotinas, com o horário do envio.
5. Histórico: na ficha do cliente, aba "E-mails", tudo o que foi enviado (data, tipo, assunto,
   status de entrega).
6. Assinatura com a marca do escritório (mesmo modelo dos e-mails atuais), texto curto,
   linguagem cordial e sem juridiquês.
7. Testes com dados fictícios para os quatro tipos, incluindo "não repete" e "perfil nunca".
Siga o fluxo de entrega do CLAUDE.md.
```

---

## 2. CRM — integração, automação, fluidez e facilidade de uso

```
Melhore o CRM do ERP (Backup 16). Mantenha o funil atual e as abas Em andamento / Ganhos /
Perdidos. Implemente:

INTEGRAÇÃO
1. "Ganhou" gera o contrato já com a Área do serviço e as parcelas/mensalidade da proposta aceita,
   sem digitar de novo; o cliente novo herda os dados do prospecto (CNPJ → consulta automática
   do cartão CNPJ).
2. Proposta aceita → documento na pasta do cliente + tarefa "Enviar contrato para assinatura".
3. Atividades do CRM aparecem na ficha 360° do cliente (aba Histórico).
4. Botão "Novo prospecto a partir de indicação" dentro da ficha de um cliente (origem = indicação
   daquele cliente) e relatório "Quem mais indica".

AUTOMAÇÃO
5. Oportunidade sem próxima ação → alerta no Início ("3 oportunidades sem próximo passo").
6. Parada há mais de N dias na mesma etapa → tarefa para o responsável (N configurável por etapa).
7. Proposta enviada sem resposta em 5 dias → lembrete de follow-up (tarefa + modelo de e-mail
   pronto para enviar com 1 clique).
8. Ao perder, pedir o motivo em lista fixa (preço, prazo, foi para concorrente, desistiu,
   sem retorno) para o relatório de perdas ficar confiável.

FLUIDEZ E FACILIDADE
9. Cadastro rápido: só nome, telefone e interesse; o resto pode ficar para depois.
10. Cartão com os atalhos à vista: WhatsApp, e-mail, "registrar ligação" (1 clique).
11. Busca única que acha por nome, empresa, CNPJ ou telefone.
12. No celular, o funil vira lista por etapa com botão "Avançar etapa".
13. Painel do mês: novas oportunidades, taxa de conversão, tempo médio até fechar,
    valor ganho por Área do serviço.
Testes com dados fictícios e fluxo de entrega do CLAUDE.md.
```

---

## 3. Tarefas — melhorias

```
Melhore o módulo Tarefas do ERP (Backup 16). Mantenha as abas Em aberto / Concluídas /
Excluídas (excluir = vai para Excluídas; só o admin "exclui de vez"). Implemente:

1. Criação rápida: uma linha no topo ("Protocolar defesa amanhã @Emanuelle !alta") que entende
   data, pessoa e prioridade.
2. Modelos de tarefa por tipo de serviço (ex.: "Abertura de empresa", "Inventário", "Defesa
   trabalhista") com subtarefas e prazos em dias úteis já montados.
3. Prazo processual: ao ligar a tarefa a uma publicação, calcular o prazo fatal em dias úteis
   com os feriados cadastrados e mostrar a contagem regressiva.
4. Visão "Minha semana" (segunda a sexta) com arrastar para remarcar.
5. Carga de trabalho por pessoa (horas estimadas × disponíveis) para distribuir melhor entre
   estagiários e colaboradores.
6. Aviso diário por e-mail às 8h com as tarefas do dia de cada pessoa (liga/desliga por pessoa).
7. Comentários com @menção avisam a pessoa citada.
8. Tarefa recorrente com "pular esta vez".
9. Relatório mensal: concluídas no prazo × atrasadas por pessoa e por cliente.
10. Excluídas há mais de 90 dias somem da aba sozinhas (continuam no histórico).
Testes com dados fictícios e fluxo de entrega do CLAUDE.md.
```

---

## 4. (Opcional) Geradores de documentos dentro do ERP

```
Traga para o ERP, como páginas separadas que só carregam quando abertas (sem pesar nas outras
telas), os geradores que já existem em "#Sistemas": Contrato e Procuração, Solicitação de
Documentos, Propostas e Modelos de E-mail. Antes, revise cada arquivo para dados sensíveis.
Cada gerador puxa os dados do cliente escolhido (nome, CNPJ, endereço, sócios) do banco e
guarda o documento gerado em Documentos, na pasta do cliente. Acesso só com login.
Petições: criar um gerador simples por modelos (cabeçalho, qualificação, fatos, pedidos) com
os dados do cliente e do processo preenchidos. Fluxo de entrega do CLAUDE.md.
```
