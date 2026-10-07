# Prompt — Backup 49 (simplificar e controlar os e-mails)

Copie tudo a partir da linha abaixo e cole no chat.

---

Leia o CLAUDE.md e o arquivo `sistema/SUGESTOES-B48.md` antes de começar.

O objetivo desta rodada é deixar o ERP **funcional e simples de usar**: menos botões, menos telas repetidas e o mesmo desenho em todo lugar. Siga a ordem abaixo e entregue tudo numa PR só (Backup 49), com os testes passando.

## Parte 1 — E-mails (prioridade)

1. **Controle de quem recebe** (itens 1 e 2 das sugestões)
   - Crie uma chave única por cliente: "✉ Recebe e-mails do escritório: Sim / Não".
     - Ela aparece na lista de Clientes (coluna com selo verde/cinza), na ficha do cliente e no cadastro.
     - Dá para marcar vários clientes e mudar todos de uma vez.
   - "Não" significa que nenhum e-mail automático ou manual sai para o cliente: lembretes, cobranças, guias, recibo e boas-vindas.
     - Os rascunhos do Gmail também não saem.
     - O sistema avisa na hora de tentar enviar: "Este cliente está marcado para não receber e-mails".
   - Aproveite o que já existe (`clientes.perfil_email`, `perfil_email_de`, `pode_email`). Não crie uma sétima regra.
     - Os detalhes atuais (contato que recebe, setor, perfil "só vencimento") ficam num bloco "Avançado", fechado.
   - Crie a tela "Quem recebe" em Administração → E-mail, com uma linha por cliente:
     - grupo, cliente e e-mail de destino;
     - a chave Sim/Não;
     - último e-mail enviado (data e assunto);
     - selo "sem e-mail" quando faltar o endereço.
   - Na tela "Quem recebe", coloque os filtros: Todos · Recebem · Não recebem · Sem e-mail.

2. **Mesma estética nos e-mails das guias** (itens 4 e 5)
   - O e-mail do Rotina → "Enviar guias do mês" (função `rascunho_email_texto`) hoje sai como texto simples.
     - Faça ele sair no mesmo modelo dos e-mails bonitos que o sistema já manda (`email_cliente_html`): logo, saudação, quadro com as parcelas, caixa "Como pagar" (`guias_texto_html`) e rodapé.
   - Faça o mesmo no rascunho dos Acordos (Emitir → Rascunho no Gmail).
   - O texto que a pessoa edita no cartão continua igual. Só a aparência do e-mail muda.
   - Se der, monte o quadro a partir das parcelas selecionadas: Parcelamento · Parcela x/y · Vencimento · Valor.
   - Mostre uma prévia do e-mail final (botão "👁 Prévia") antes de salvar o rascunho.
   - Teste: salve um rascunho e confira no `/__teste/rascunhos` que o HTML tem o cabeçalho com a logo e a tabela das parcelas.

3. **Faixa do modo teste** (item 6)
   - Para o administrador, mostre uma faixa amarela fixa enquanto os e-mails estiverem desviados para pedromgsam@gmail.com.
   - A faixa tem o botão "Desligar modo teste", que pede confirmação.

## Parte 2 — Simplificar telas

4. **Tarefas** (itens 9 a 12)
   - Botões do topo: só "+ Nova tarefa" e "👥 Delegar". Modelos de fluxo, Feriados, Google Agenda e Novo fluxo vão para um botão ⚙.
   - Filtros em no máximo 2 linhas de chips, iguais aos do Início:
     - Mostrar (tipos + Prioridade);
     - De quem.
   - "Minhas" sai, porque já existe em De quem. Em aberto / Concluídas / Excluídas viram abas junto do título.
   - Modos de ver: Lista, Calendário e Fluxos ("Minha semana" vira a vista Semana do Calendário).
   - A criação rápida vira um ícone ⚡ ao lado de "+ Nova tarefa".

5. **Rotina** (itens 16 a 19)
   - Abas curtas, nesta ordem: Passivo · Processos · Guias do mês · Planilha · Minhas tarefas. A aba Acordos sai.
   - Em "Guias do mês", mostre um quadro "Pendências do envio" antes de "Salvar todos os rascunhos": cliente sem e-mail, guia sem anexo e cliente marcado para não receber.
   - Parcelamentos (menu Jurídico) fica só para consulta, sem botões de ação. Emitir, enviar e pagar ficam na Rotina.

6. **Ficha do cliente** (item 25)
   - Junte as 13 abas em 7: Resumo · Contatos e endereços · Sócios · Processos · Financeiro e contratos · Documentos · Histórico.
   - Cartão CNPJ e dados fiscais vão para o Resumo.

7. **Simetria** (itens 33 a 36)
   - Ação principal sempre no alto à direita, em azul.
   - Ações da linha sempre na última coluna.
   - Filtros sempre em chips (o mesmo componente `chipFiltro` do Início e de Tarefas).
   - Todas as telas com título + subtítulo curto.
   - Abas sem ícone.
   - Na tabela: texto à esquerda, valor à direita, data e situação centralizadas. A exceção é o Painel Executivo, que já está como eu pedi.

## Parte 3 — Só se sobrar tempo (me pergunte antes)
Itens 7, 8, 13, 20, 21, 22, 27, 29 e 32 das sugestões. **Não faça sem eu aprovar.**

## Regras
- Siga o "Como entregar" do CLAUDE.md:
  - testes;
  - `montar-erp`;
  - COMO-ATUALIZAR;
  - linha 49 no `backups/LEIA-ME.md` (é ela que alimenta a aba Atualizações);
  - zip do backup;
  - PR.
- Para cada mudança visual, tire foto antes e depois e confira.
- Rode o `caca-bugs.js`: tem que dar "nenhuma ocorrência".
- Responda em português simples. Diga o número de linhas do `estrutura.sql` e se alguma função do Supabase precisa ser publicada de novo.
