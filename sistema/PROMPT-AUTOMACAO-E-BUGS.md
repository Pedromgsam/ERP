# Prompt — automações, integrações e defeitos visuais

> Escrito em 28/09/2026, depois do Backup 10. Autorizado para execução imediata, sem nova consulta.
> Liberdade total para achar o que está ruim e melhorar, dentro das regras do `CLAUDE.md`.

---

Leia o `CLAUDE.md` e siga as regras e o jeito de entregar que estão lá.
Antes de mudar qualquer coisa, prepare o ambiente de testes e rode todos os testes.

**Objetivo:** com poucos lançamentos, o sistema faz sozinho várias coisas encadeadas, sem perder o capricho visual.
Você tem **liberdade** para achar o que está ruim e melhorar. Registre na resposta final o que decidiu e por quê.
Nada que custe dinheiro sem aprovação: os e-mails para clientes usam o Gmail que o escritório já tem.
Todo e-mail para cliente começa **desligado** e é ligado pelo escritório.

## Parte 1 — Automações e integrações

1. **Central de automações.** Uma tela só (em Administração e no botão das Tarefas) que mostra **todas** as automações, agrupadas:
   - tarefas automáticas;
   - e-mails ao cliente;
   - integrações;
   - rotinas agendadas.

   Cada automação mostra o que faz em uma frase, liga/desliga, o prazo em dias, o responsável e **quantas vezes agiu nos últimos 30 dias** (registro `automacoes_log`). As rotinas mostram a última execução e dão para rodar agora.
2. **Cadeias novas** (um lançamento dispara várias ações):
   - **Contrato novo** → tarefa "anexar contrato assinado". Ela se conclui sozinha quando o contrato ganha o anexo.
   - **Processo novo** de cliente sem procuração → tarefa "providenciar procuração". Ela se conclui sozinha quando a procuração é marcada no cadastro.
   - **Honorário recebido** (marcado como pago) → conclui sozinha a tarefa "cobrar honorário" daquele lançamento. Opcional: e-mail de confirmação ao cliente.
   - **Publicação nova** ligada a processo cadastrado → tarefa "analisar publicação" para o advogado, com prazo sugerido em dias úteis (que a pessoa confere).
   - **Cliente novo com CNPJ** (cadastro manual, não importação) → consulta o cartão CNPJ na hora e preenche os dados da Receita.
3. **E-mails ao cliente** (desligados por padrão), para o contato financeiro ou, na falta dele, o e-mail do cadastro:
   - lembrete de honorário N dias antes do vencimento;
   - cobrança educada N dias depois do vencimento;
   - lembrete de parcela de acordo;
   - confirmação de pagamento recebido.

   Um modelo de texto simples, com a marca do escritório, e nunca dois e-mails iguais para a mesma cobrança.
4. **Cartão CNPJ para empresa recém-aberta.** A BrasilAPI usa a base aberta da Receita, publicada uma vez por mês. Quando ela não achar o CNPJ, tente outras fontes (ReceitaWS e CNPJá, poucas por dia, respeitando o limite gratuito). Se nenhuma achar, marque "aguardando a Receita" (não "erro") e tente de novo no dia seguinte.
5. **Otimizar o que já existe:** as regras rodam num lugar só, não duplicam tarefa, e cada ação fica registrada.

## Parte 2 — Defeitos visuais (encontrar com ferramenta, não no olho)

1. Criar `sistema/testes/caca-bugs.js`. Ele passa por **todas as telas**, em **1440, 1024 e 390 px**, nos modos **claro e escuro**, e aponta:
   - cartões lado a lado com **tamanhos diferentes** (ex.: "Em atraso" menor que os vizinhos no Início);
   - texto que **transborda** ou é cortado sem reticências;
   - elementos **sobrepostos**;
   - coisa **fora da tela**;
   - **contraste** de texto abaixo de 4,5:1 (AA);
   - **gráfico vazio** desenhado;
   - botão sem nome;
   - rolagem lateral.
2. Rodar, **corrigir tudo o que aparecer** e rodar de novo até zerar (ou até só restar o que for justificado). Guardar o relatório antes e depois.
3. Colocar essa caça na bateria `rodar-tudo.sh`, para que nenhum defeito volte sem aviso.

## Entrega
- Todos os testes passando, prints antes e depois das telas mexidas.
- Documentação (`COMO-ATUALIZAR.md`, `CLAUDE.md`, `backups/LEIA-ME.md`), backup nomeado e PR.
- Resposta em português simples, com o passo a passo e o que foi decidido com a liberdade dada.
