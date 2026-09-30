# PROMPT — novo chat "ERP Automação"

> Cole este texto inteiro na primeira mensagem do novo chat.

Leia o `CLAUDE.md` e este prompt. Antes de mudar qualquer coisa, **mostre o plano** e as **perguntas**. Eu respondo e só depois você executa,
em etapas pequenas (uma PR por etapa, seguindo o "Como entregar" do CLAUDE.md).

## Objetivo
O ERP deve acompanhar **um cliente do primeiro contato até o financeiro, sem retrabalho**. Cada passo alimenta o seguinte, e o que for
repetitivo acontece sozinho:

**Cadastro → Lead (CRM) → Reunião → Proposta/Contrato (gerador) → Assinatura → Financeiro → E-mails (parcelas, cobranças, avisos)**

Tudo isso aparece na **ficha 360° do cliente**, numa linha do tempo única.

## Etapa 1 — Cadastro de clientes robusto (base de tudo)
- Um cadastro completo e bem organizado: dados da empresa ou pessoa, sócios, endereço, regime, área (Jurídico/Contabilidade), grupo,
  responsável, origem (indicação, site…) e observações.
- **Vários contatos por cliente**, cada um com nome, **setor** (financeiro, fiscal, RH, sócio, jurídico…), e-mail, telefone/WhatsApp e
  "recebe o quê" (cobranças, guias, avisos, contratos).
- Os e-mails automáticos usam o contato do setor certo (cobrança → financeiro; guia → fiscal…).
- Revisar o que já existe (`clientes`, `perfil_email`, `emails_tipos`, busca de CNPJ) e **aproveitar**, sem duplicar.

## Etapa 2 — Fluxo automático entre os setores
1. **Lead:** de um cliente cadastrado (ou cadastro rápido), vira oportunidade no CRM.
2. **Reunião:** agendar direto do lead (data, hora, local/link, participantes).
   - Botão **"enviar convite por e-mail ao cliente: sim/não"**.
   - A reunião cai na agenda e vira tarefa de quem participa.
3. **Contrato:** "Fechou" no CRM abre o **gerador de contrato** já preenchido com o cliente e os valores.
   - O contrato fica como **"aguardando assinatura"**.
4. **Assinatura:** ao marcar como assinado (e anexar o PDF), o sistema **lança o financeiro sozinho** (parcelas ou mensalidades), avisa a
   equipe e manda o e-mail de boas-vindas (se ligado).
5. **Financeiro e e-mails:** cobranças, lembretes de vencimento, guias de parcelamento e recibos saem pela Central de e-mails, com as
   regras já existentes (sem repetir e-mail).

## Etapa 3 — Delegar e validar (colaboradores)
- Eu (advogado) delego a um colaborador (ex.: estagiário) uma **sequência de passos**. Exemplo: "Empresa X é lead: cadastre, agende a
  reunião, prepare o contrato".
- Cada passo vira **tarefa para a pessoa**, com prazo. Quando ela termina, o passo vai para **"aguardando minha validação"**.
- Eu **aprovo ou devolvo** com comentário. Só depois de aprovado o próximo passo é liberado (ex.: o contrato só vai ao cliente depois de
  eu validar).
- Aproveitar o que já existe: tarefas, modo rascunho/aprovações e funções de acesso.
- Uma tela simples **"Aguardando minha validação"** no Início.

## Etapa 4 — Simplificar
- Levantar as funções **pouco usadas ou complexas demais** (telas, botões, abas, automações) e me mandar uma lista com a sugestão:
  **manter / simplificar / remover**. Nada é removido sem a minha aprovação.
- Meta: o dia a dia com o **menor número de cliques e de telas**.

## Regras
- As do `CLAUDE.md` valem sempre:
  - segurança e LGPD;
  - SQL idempotente;
  - rodar todos os testes (inclusive o caça-bugs e o de padronização);
  - avisar o custo antes de qualquer serviço pago;
  - não mexer no Google Apps Script.
- Visual no padrão atual: régua única das tabelas, filtros no desenho de Clientes, selo "Quem".
- E-mails: nada sai para cliente sem eu ligar (respeitar a pausa de e-mails).
- Linguagem simples nas telas e nas respostas; passo a passo numerado.

## Primeira resposta que espero
1. Um **diagnóstico curto** do que já existe para cada etapa (o que aproveitar, o que falta).
2. O **desenho do fluxo** (quem faz o quê, o que acontece sozinho, onde aparece).
3. **Perguntas** objetivas, com sugestão marcada. Por exemplo:
   - quais setores de contato;
   - o que precisa de validação;
   - o que o e-mail de boas-vindas diz.
4. A **ordem das PRs** (começando pelo cadastro).
