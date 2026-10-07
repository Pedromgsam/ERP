# Como atualizar o sistema (passo a passo)

Toda mudança chega como uma **pull request** no GitHub. Siga sempre esta ordem.

## 1. Publicar as telas
1. No GitHub, abra a pull request → botão verde **Merge pull request** → **Confirm merge**.
2. Espere uns 2 minutos (a Vercel publica sozinha).

Faça o Merge **antes** do SQL: só depois do Merge o arquivo do banco fica completo na página principal do GitHub.

## 2. Banco de dados (só quando a pull request pedir)
1. Abra o **Supabase** → seu projeto → **SQL Editor** (ícone `>_` no menu da esquerda) → **New query**.
2. No GitHub, na página principal do repositório, abra o arquivo indicado (ex.: `sistema/banco/estrutura.sql`)
   e clique no botão **Raw** (acima do código, à direita). Abre uma página só com o texto.
3. Nessa página: **Ctrl+A** (seleciona tudo) e **Ctrl+C** (copia).
   Não selecione com o mouse: o GitHub não mostra o arquivo inteiro na tela e o final fica de fora.
4. Volte ao Supabase, clique na área de texto, **Ctrl+A** (apaga o que houver) e **Ctrl+V**.
5. **Confira o fim**: role até o final do editor. O número da última linha tem que ser igual ao que a
   pull request informa. Se for menor, faltou texto: repita o passo 2.
6. Clique em **Run**. Se aparecer um aviso sobre "destructive operations", clique em **Run this query**.
7. O certo é aparecer **"Success. No rows returned"** embaixo.

Os arquivos podem ser rodados quantas vezes quiser: não apagam nada.
Se aparecer **ERROR** em vermelho: tire um print e mande antes de continuar.
Enquanto o SQL não for rodado, o ERP mostra um aviso amarelo dizendo o que falta — o resto funciona.

## 2b. Funções do Supabase — e-mails, publicações, cartão CNPJ, agenda e backup
Os avisos por e-mail, a busca de publicações, o cartão CNPJ, a agenda do Google, o backup semanal
rodam em cinco "funções" dentro do Supabase.

**Atenção ao nome:** tem que ser exatamente `erp-emails`, `erp-publicacoes`, `erp-cnpj`, `erp-agenda` e `erp-backup`,
tudo em minúsculas e com hífen.
Se o nome for outro (ex.: "ERP-email"), o ERP não encontra a função. Para conferir, vá em Administração → ✉ E-mail →
**🩺 Verificar funções**. A tela mostra ✅ ou ❌ para cada uma e diz o que corrigir.
Isso é feito **uma vez**; depois só muda se uma pull request pedir.

**Ligar o agendador (para rodar sozinho de manhã):**
1. Supabase → **Database** → **Extensions**.
2. Procure **pg_cron** e ligue (Enable). Procure **pg_net** e ligue.
3. Rode de novo o `sistema/banco/estrutura.sql` (passo 2). Ele cria os horários automáticos.

**Publicar as cinco funções** (para atualizar uma função que já existe: abra a função → **Code** → cole o texto novo → **Deploy**):
1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nome: **erp-emails**. Apague o exemplo que aparece.
3. No GitHub, abra `supabase/functions/erp-emails/index.ts` → **Raw** → **Ctrl+A**, **Ctrl+C**.
4. Volte ao Supabase, **Ctrl+V** no editor e clique em **Deploy function**.
5. Na página da função, abra **Details** (ou **Settings**) e **desligue "Verify JWT"** (Enforce JWT verification) → salve.
   A função confere sozinha quem chamou.
6. Repita os passos 1 a 5 com o nome **erp-publicacoes** e o arquivo `supabase/functions/erp-publicacoes/index.ts`.
7. Repita os passos 1 a 5 com o nome **erp-cnpj** e o arquivo `supabase/functions/erp-cnpj/index.ts`.
8. Repita os passos 1 a 5 com o nome **erp-agenda** e o arquivo `supabase/functions/erp-agenda/index.ts`.
9. Repita os passos 1 a 5 com o nome **erp-backup** e o arquivo `supabase/functions/erp-backup/index.ts`.
10. (Backup 41) A função **erp-pgfn** saiu: se ela ainda aparece na lista, abra-a e clique em **Delete**.

**Configurar dentro do ERP:**
- **E-mail:** Administração → **✉ E-mail** → escolha "Gmail do escritório", informe o e-mail e a **senha de app**
  (a própria tela mostra onde gerar) → **Salvar** → **Enviar e-mail de teste**.
- **Publicações:** Jurídico → **Publicações** → **OABs monitoradas** → inclua cada OAB (número e UF) e o nome do
  advogado → **Buscar agora**.
- **Cartão CNPJ:** **Alertas** → cartão **Cartão CNPJ (6h)** → escolha a API (a BrasilAPI é grátis e sem chave) →
  **Salvar API** → **↻ Atualizar agora**. Depois disso, ela roda sozinha todo dia às 6h. O resultado fica no mesmo
  cartão, com as alterações, os erros e o histórico.
- **Salário mínimo:** Contratos → **Salário mínimo** → quando sair o valor do ano novo, cadastre. As mensalidades em aberto
  se ajustam sozinhas.
- **Google Agenda (cada pessoa, uma vez):** Tarefas → **📅 Google Agenda** → **Copiar link** → no Google Agenda,
  em **Outras agendas** → **+** → **Do URL** → cole → **Adicionar agenda**. Aparecem os prazos fatais e as audiências.
- **Backup semanal:** Administração → **Backup** → **↻ Fazer backup agora** (confere que funciona). Depois ele roda
  sozinho todo domingo às 3h e guarda as 8 últimas cópias.
- **Automações:** Tarefas → **⚡ Automações** (ou Administração → ⚡ Automações). Cada automação tem uma chave de
  liga/desliga que salva na hora. Os **e-mails ao cliente** começam desligados: ligue os que quiser (usam o Gmail
  configurado em Administração → E-mail e vão para o contato financeiro do cliente).
- **Modo escuro:** botão **◐** na barra de cima (fica lembrado em cada computador).
- **Funções de cada pessoa:** Administração → Usuários → botão **Funções** ao lado de cada pessoa da equipe.
  Ali também se escolhe **"Clientes que vê"** (Só Jurídico / Só Contabilidade / Os dois) e o nível **Rascunho**
  (a pessoa preenche, mas só vale depois de aprovado — modelo pronto "Estagiário (rascunho)").
- **Área de cada cliente:** no cadastro do cliente, campo **Área do cliente** (Jurídico / Contabilidade / os dois).
  Na primeira vez que o SQL do Backup 12 roda, o sistema sugere a área sozinho; confira em Clientes → filtro de áreas.
- **Aprovações (rascunhos):** faixa no Início ou menu **⋯ → 📝 Aprovações**. Mostra *antes → depois*; **✓ Aprovar** ou **Recusar**.
- **Recebimentos:** todo botão de baixa pergunta a **data** (já vem com hoje). Nos acordos, pergunta também se o
  **comprovante foi anexado ao processo** e, se sim, o **ID** do documento.
- **Seu nome na barra:** ⋯ → **👤 Meu nome** (o login continua pelo e-mail). O administrador também muda em Administração → Usuários.
- **Avisos (🔔):** funcionam como caixa de mensagens. **✓ Lido** tira da lista. Se o assunto não for resolvido, ele volta na próxima leva:
  urgentes no dia seguinte, os demais na semana seguinte. Ao abrir o sistema, um cartão no canto mostra os avisos novos.
- **Cobranças, avisos e recibos** (antiga "Notificações"): botão **✉** no alto de Financeiro, Parcelamentos e Acordos, ou ⋯ → Cobranças.
  **✉ Enviar e-mail** pergunta se vai **pelo e-mail do escritório** (com a marca) ou pelo seu programa de e-mail.
- **E-mails automáticos ao cliente:** agora vêm **ligados** e só saem para quem tem e-mail cadastrado. Cobranças vão ao contato
  **financeiro** (quem recebe boletos primeiro); acordos, ao contato **jurídico**. Preencha a chave PIX e a assinatura em
  Administração → E-mail → **Dados para pagamento** e confira os modelos no botão **Ver modelo**.
- **Demonstração:** Administração → Importar → **🧪 Carregar demonstração** cria clientes e lançamentos fictícios ("DEMO ·"),
  ligados entre si, inclusive um rascunho de estagiário para aprovar. **Apagar demonstração** remove tudo, sem tocar no que é seu.
- **Êxito:** no contrato, informe o % e *como foi combinado*. Quando o êxito acontecer, abra o contrato →
  **🏆 Registrar êxito** → informe o valor X (ex.: quanto a dívida reduziu). O sistema lança % × X em Honorários Jurídico.

## 2c. Ler de novo uma planilha (substituir o que foi importado)
Use quando uma planilha foi lida errado (ex.: Contabilidade ou Acordos).
1. Antes, faça um backup: Administração → **Backup** → Excel.
2. Administração → **Importar** → escolha o arquivo (ex.: `12 - Contabilidade.xlsx` ou `4 - Acordos.xlsx`).
3. Marque **Substituir** → confirme. O sistema apaga **só o que veio de importação** daquele tipo (o que você lançou
   à mão fica) e lê a planilha de novo.
4. O nome do arquivo ajuda o sistema a saber o tipo: mantenha "Acordos" ou "Contabilidade" no nome.

## 3. Conferir
1. Abra o ERP e aperte **Ctrl+Shift+R** (recarrega sem cache).
2. Entre com seu e-mail e senha.
3. Se aparecer um aviso amarelo embaixo, ele diz o que falta. Se algo estiver estranho, mande um print.

## Não gostei: como voltar para a versão anterior

Há três "voltas", conforme o que você quer desfazer.

### A. Voltar as TELAS (o mais comum) — pela Vercel, 1 minuto
Cada publicação fica guardada na Vercel. Para voltar:
1. Entre em **vercel.com** → projeto **erp** → aba **Deployments**.
2. Ache a publicação anterior (a lista mostra data e hora; a atual está no topo com a etiqueta **Current**).
3. Clique nos **três pontinhos (⋯)** dessa publicação anterior → **Instant Rollback** (ou **Promote**) → confirme.
4. Em segundos o site volta a ser o anterior. Os **dados não mudam**: tudo o que foi lançado continua no banco.

Enquanto estiver "voltado", novas pull requests que você juntar **não** vão ao ar sozinhas.
Quando quiser seguir em frente, faça o mesmo na publicação mais nova (⋯ → Promote) ou me peça.

### B. Voltar de vez (desfazer a mudança no GitHub)
1. No GitHub, abra a pull request já juntada (aba **Pull requests** → **Closed**).
2. Clique em **Revert** (no fim da página). O GitHub cria uma nova pull request que desfaz a anterior.
3. Clique em **Merge pull request** nela. Em 2 minutos a Vercel publica a versão anterior.

### C. Voltar os DADOS (se algo foi gravado errado)
- Um registro só: abra o registro (✎) → **🕘 Ver alterações** mostra quem mudou o quê e o valor anterior;
  corrija à mão.
- Muitos registros: use o arquivo de **Backup** (Administração → Backup). Faça backup **antes** de
  importações grandes. Para restaurar a partir de um backup, me chame: eu preparo a restauração com você.

### O Gestão antigo saiu do site (Backup 13)
O `gestao.html` foi apagado do site, com sua autorização. Todas as telas dele já estão dentro do ERP.
Se precisar dele de volta, basta voltar a publicação na Vercel (passo A acima) ou pedir.


## Backup 14 — o que mudou e onde clicar
- **Usuários novos:** Administração → **👤 Usuários** → cartão **Acessos combinados** → **Criar conta** em cada pessoa
  (Emanuelle, Adriana, João Vitor, Éder). Escolha uma senha provisória e passe para a pessoa. A função já vem certa
  (Éder = Adm. da Contabilidade, só clientes da contabilidade; João Vitor = estagiário em rascunho, Jurídico e Contabilidade).
- **E-mails por cliente:** Administração → **📨 E-mails aos clientes**. Cada cliente tem um perfil:
  *Padrão* · *Só no vencimento* · *Não enviar financeiro* · *Personalizado*. Muda na própria linha, ou marque vários e use
  "Aplicar aos marcados". Também aparece no cadastro do cliente ("E-mails de cobrança").
- **Conciliar extrato (OFX):** Financeiro → Jurídico (ou Contabilidade) → botão **🏦 Conciliar extrato** no topo → escolha o
  arquivo .ofx exportado do Sicoob → confira os três grupos (identificados, em dúvida, não identificados) → **Registrar pagamentos marcados**.
- **Evolução do cliente:** ficha do cliente → aba **📈 Evolução** (passivo, CAPAG e processos: "devia X, hoje deve Y").
  A primeira foto é tirada ao rodar o SQL; o comparativo aparece a partir do mês seguinte.
- **Editar em tabela:** Clientes → **✎ Editar em tabela** (passivo, CEAT e CAPAG de vários clientes; aceita colar do Excel).
  Estagiário: cada linha vira uma proposta em Aprovações.
- *(Processos em tela nova: desfeito no Backup 15 — voltou a tela do Backup 13.)*

## Backup 15 — o que mudou e onde clicar
- **Início:** a fila mostra 5 tarefas (▾ Ver todas para abrir o resto). Botões **Lista · Mês · Semana · Dia** trocam
  para calendário; a escolha fica guardada e abre igual no próximo acesso. Honorário atrasado saiu da fila.
  **Mural** (logo abaixo): destaques do dia (avisos, prazos fatais, tarefas atrasadas, publicações novas) e recados —
  escreva e clique **Publicar**. Só o administrador marca 📌 fixo. O botão dos atrasados voltou a ser **✓ Recebido**.
- **Pop-up dos honorários** (clicar nos cartões do Início): mais largo, sem Descrição, pílulas do mesmo tamanho,
  sem "Recebido" no "Recebido no mês" e sem "emitir guia" no "A receber".
- **Painel Executivo:** sem a faixa de título; "Atualizado" e **▣ entidades ◉ grupos** ficam na linha do filtro, à esquerda.
  Cartões de grupo do mesmo tamanho e com as letras padronizadas.
- **Processos, Parcelamentos e Acordos:** voltaram à versão do Backup 13.
- **Financeiro → Jurídico:** novo campo **Área do serviço** (Tributário, Imobiliário, Empresarial, Sucessões, Família,
  Criminal, Trabalhista, Contratual, Cobrança, Consultoria) no lançamento e no contrato; o gráfico "por tipo de serviço"
  usa esse campo. A mensalidade de consultoria continua sendo gerada igual. Clicar numa linha abre a **visualização**
  (✎ Editar e ✓ Recebido ficam lá dentro).
- **Contrato:** botão **+ Novo cliente** ao lado do campo Cliente (cadastra sem sair do contrato).
- **Clientes:** "Jur + Cont" virou **Jurídico + Contábil**.
- **CRM:** abas **Em andamento · Ganhos (contrato assinado) · Perdidos (não fechou)** — o funil mostra só as vigentes.
  Cartões maiores e do mesmo tamanho. Clicar abre o **Resumo** (só leitura); para mudar, **Editar**.
  *Ganhou* = o cliente fechou (vira contrato). *Perdeu* = não fechou (registre o motivo).
- **Documentos:** filtro por **grupo** e atalhos por tipo (Procuração, Contrato… com a quantidade).
- **Tarefas:** abas **Em aberto · ✓ Concluídas · 🗑 Excluídas**. "Excluir" manda para Excluídas (dá para **↩ Restaurar**);
  só o administrador usa **Excluir de vez**.
- **Alertas:** dentro do relatório de um alerta, **📋 Virar tarefa** → escolha quem faz (você ou o estagiário), o prazo e se
  cada linha vira subtarefa (com prazo) ou item do checklist. O cartão PGFN fica escondido até o SERPRO ser contratado.
- **Prompts prontos** para as próximas rodadas (e-mails de honorários/parcelamentos/acordos/recibos, CRM, Tarefas):
  `sistema/PROMPTS-BACKUP-15.md`.

## Backup 16 — o que mudou e onde clicar
- **Início (a "home" do escritório):** logo abaixo do mural, o **🏠 Resumo do escritório** (processos, publicações, parcelamentos, acordos,
  CRM, tarefas e documentos — clique no número para abrir). A fila mostra só tarefas; **"Emitir guias de parcelamentos"** virou
  **🔔 Lembrete** (card Lembretes, abaixo da fila): abra a linha e marque **✓ Guia emitida** em cada parcela. Em **+ Lembrete** você cria
  avisos que não são tarefa (ex.: "renovar certificado digital", todo ano).
- **Painel Executivo → Empresas do grupo:** grupo, empresa e sócio em CAIXA ALTA, uma letra só, selo do grupo mais estreito,
  CAPAG em selo quadrado e Situação em pílula do mesmo tamanho.
- **Processos → Análise da carteira:** "Processos" mostra *X em andamento · Y arquivados/extintos*; o card "Arquivados / extintos" saiu;
  o mesmo processo do sócio e da PJ conta uma vez só; "Valor em disputa" mostra *com valor · sem valor informado*.
- **Publicações:** **⚙ Monitoramento (OABs e clientes)** → além das OABs, escolha **clientes** (o Diário busca pelo nome da empresa).
  **🩺 Testar conexão com o CNJ** explica o problema se houver. **🌐 Buscar pelo navegador** busca do seu computador (use se o servidor não conseguir).
- **Acordos:** mostra só os acordos com parcela pendente (caixa **Mostrar concluídos** no topo traz todos). A tabela **Acordos em andamento**
  (devedor, credor, descrição, total, pago, falta, parcela e inadimplência) abre ao clicar, com **✓ Lançar pagamento** em cada parcela.
  Saiu o gráfico "Valor em atraso por devedor". O "Progresso por acordo" continua até você aprovar a tabela nova.
- **Financeiro:** a 2ª linha de cada honorário mostra *Área do serviço — contrato* (sem contrato, só a área). Saíram os gráficos das abas
  A receber / Recebidos / Prejuízo / Despesas (a análise fica na aba Análise) e o "Despesas por categoria" do caixa da Contabilidade.
  **✎ Editar em tabela** (botão no topo do Financeiro): completa vários lançamentos na tela ou por planilha (⬇ Baixar → ajustar no Excel → ⬆ Enviar).
- **CRM:** funil em duas linhas; etapas novas **Contrato fechado** (o cliente disse sim: cria cadastro, contrato e a tarefa "Enviar contrato
  para assinatura") → **Aguardando assinatura** → **Contrato assinado** (vai para a aba). **Lead perdido** pede o motivo numa lista.
  **⚡ Cadastro rápido**, atalhos no cartão (💬 WhatsApp, ✉ e-mail, 📞 registrar ligação), **✉ Follow-up** na ficha, **⚙ Etapas** (prazo de cada
  etapa: passou do prazo, vira tarefa), painel do mês (novas, conversão, valor por área, quem mais indica), modelos de proposta novos e
  proposta com visual da marca (**👁 Ver como fica** em Modelos de proposta). Na ficha do cliente: **🤝 Indicação** cria prospecto indicado por ele.
- **Central de e-mails ao cliente:** **⋯ → ✉ Central de e-mails ao cliente** (ou ✉ Cobrar/Notificar em cada tela). Abas *A enviar hoje*
  (clique na linha = prévia; **Enviar agora**, **Pular este**, **Enviar selecionados**), *Enviados* e *Com erro* (**Tentar de novo**).
  **⚙ Automático e horário**: liga/desliga honorários, parcelamentos, acordos e recibos, horário do envio e os dias do 1º/2º/3º aviso.
  **✎ Modelos**: texto de cada e-mail (também em Administração → E-mails aos clientes). O **recibo** sai sozinho ao marcar **Recebido**, com o PDF anexo.
  A tela antiga continua em **⋯ → Tela antiga de cobranças** até você aprovar a nova. Na ficha do cliente, aba **✉ E-mails** mostra o histórico.
- **Tarefas:** barra de **criação rápida** no topo ("Protocolar defesa amanhã @Emanuelle !alta #trabalhista" + Enter); vista **Minha semana**
  (arraste para remarcar); prazo fatal com **contagem de dias úteis**; **⏭ Pular esta vez** nas recorrentes; **Relatório** com mês,
  por cliente e **Carga da semana** (horas estimadas × disponíveis; o admin ajusta as horas); modelos de fluxo novos (Abertura de empresa,
  Inventário, Defesa trabalhista); resumo do dia por e-mail às **8h** (cada um liga/desliga em ⋯ → Meus avisos por e-mail);
  excluídas há mais de 90 dias somem da aba (ficam no histórico).
- **Geradores de documentos:** **⋯ → 📄 Geradores de documentos** (ou **📄 Gerar** na ficha do cliente / **📄 Gerar documento** em Documentos):
  Contrato e Procuração, **Petição** (nova), Solicitação de Documentos, Proposta e Modelos de E-mail. Cada um abre numa aba, exige login,
  **Preencher com o cliente** puxa nome, CPF/CNPJ, endereço e sócios, e **📁 Guardar em Documentos** salva na pasta do cliente.
  As contas bancárias/PIX dos advogados saíram do arquivo público: rode **uma vez** o `sistema/banco/dados-recibos.sql` (mesmo jeito do estrutura.sql).
- **PGFN grátis (dados abertos):** **Alertas → Rotinas → PGFN — dados abertos (grátis)** → siga os 3 passos da janela (baixar o arquivo
  público da PGFN, descompactar, escolher os .csv). Atualiza PGFN e PGFN negociada de cada cliente e a aba PGFN da ficha. A PGFN publica
  esses dados a cada trimestre.

## PGFN — dívida ativa pela API do SERPRO
Removida no Backup 41 (a pedido). Os valores de PGFN continuam no passivo de cada cliente (Rotina → Passivo e cadastro).

## Backup 17 — o que mudou e onde clicar
- **Início:** o Resumo mostra só o que pede ação (sem Processos): Publicações novas, Parcelamentos e Acordos (em atraso, com
  "vencem hoje" e "nos próximos 5 dias" embaixo, no mesmo cartão), CRM, Tarefas do escritório (em aberto + atrasadas, hoje e
  próximos 5 dias no mesmo cartão) e Documentos que vencem em 15 dias. O Início também busca publicações pelo navegador 1× por dia.
- **Painel Executivo → Empresas do grupo:** mesmo visual da tabela de Processos (letra normal, selo cinza do grupo), empresa e sócio em
  negrito, Situação sem a bolinha.
- **Processos:** legendas em duas linhas (em andamento / arquivados-extintos; com valor / sem valor informado).
- **Acordos → Acordos em andamento:** lista nova (quem deve a quem, barra do que já foi pago, próxima parcela e situação); clique no
  acordo para ver as parcelas em cartões com **✓ Lançar pagamento**.
- **Financeiro → ✎ Editar em tabela:** a janela ocupa a largura toda da tela.
- **CRM:** 8 quadros do mesmo tamanho (4 + 4) com a etapa nova **Follow-up da proposta**; Contrato assinado e Lead perdido saíram do
  "Em andamento" (solte o cartão na faixa verde/cinza embaixo). Quadro vazio desenhado.
- **E-mails:** a Central mostra a coluna **E-mail de destino** (endereço + de qual contato veio). A janela **✉ Enviar e-mail ao cliente**
  e o editor de **✎ Modelos** mostram ao lado **como o cliente recebe** (o mesmo layout com a marca).
- **Publicações:** partes em linhas (**Autor:** / **Réu:**). O "Testar conexão" explica quando a função não responde; a função nova
  (erp-publicacoes) não trava mais quando o CNJ não responde. **Publicar a função erp-publicacoes de novo.**
- **PGFN:** Alertas → Rotinas → PGFN — dados abertos aceita também o CSV exportado do site **Dívida Aberta** (mais atual).
- **Contratos:** a ficha (clique no contrato) mostra tipo, área, vigência, **reajuste** (só consultoria em salários mínimos é reajustada),
  próximo vencimento e atraso, e o card **📝 Aditivos** (**+ Novo aditivo**: valor — consultoria muda a mensalidade a partir de uma
  competência; pontual lança o valor a mais em parcelas —, escopo, prazo ou outro).

## Backup 18 — Design (só visual; sem SQL e sem funções novas)
Depois do Merge, aperte **Ctrl+Shift+R** no ERP para baixar o visual novo.
- **Cores mais sóbrias** em todas as telas: fundo cinza neutro, cartões brancos com borda fina e sombra quase invisível,
  selos (pílulas) menores e em tons suaves. Nenhum botão ou texto mudou de nome.
- **Cartões:** um desenho só (Início, Painel, Processos, Financeiro, Acordos, CRM…): título pequeno em caixa alta cinza com um
  **pontinho de cor** (verde, âmbar, vermelho…), número grande embaixo. A faixa grossa colorida à esquerda saiu; ela só aparece,
  fina, onde quer dizer algo (atraso, crítico, recado fixado).
- **Tabelas:** cabeçalho claro (saiu o azul-marinho pesado), linhas separadas por um fio leve, números alinhados à direita.
- **Barra superior:** lisa, sem brilho; os botões ◐, 🔔, ⋯ e Sair sem contorno. Menus com cantos e sombra iguais aos cartões.
- **Títulos das telas** sem caixa em volta, maiores; janelas com cabeçalho branco e botões no rodapé, à direita.
- **Gráficos:** cores vindas da paleta do sistema (rampa azul nas barras; rosca com cores contidas), grade bem leve, sem animação
  ao redesenhar.
- **Modo escuro (◐):** agora **preto de verdade**, com cinzas neutros (sem azulado) e cartões em cinza bem escuro.

Para quem mexe no código: as cores continuam **só** em `sistema/app/tokens.css` (paleta, `--chart-*` dos gráficos, escala de
espaçamento `--sp-*` e de letras `--fs-*`, raios `--card-r`/`--r-ctl`/`--r-pill`). O desenho único fica em `sistema/app/design.css`
(última camada, só `var(--…)`).

## Backup 19 — mais enxuto (tem SQL novo)
Ordem: **1) Merge  2) SQL no Supabase (`sistema/banco/estrutura.sql`)  3) Ctrl+Shift+R**. Nenhuma função do Supabase mudou.
- **E-mails PAUSADOS:** depois do SQL, **nenhum e-mail sai do sistema** até você liberar. Os e-mails novos ficam em
  **Central de e-mails → Retidos (pausa)** (dá para enviar um a um ou descartar). Para ligar de novo: Central de e-mails →
  botão **▶ Liberar o envio** (só administrador). O e-mail de teste da Configuração sai sempre.
- **Central de e-mails = tudo de e-mail num lugar:** abas **Enviar e acompanhar**, **Quem recebe (por cliente)**, **Configuração do envio**,
  **Meus avisos por e-mail** e **Cobranças (tela antiga)**. Em Administração ficou só o atalho "✉ E-mails → Central".
- **Início:** o **Mural** mostra só o que é **seu** (ex.: "8 tarefas suas atrasadas") e junta os **Lembretes** e as **guias de
  parcelamento a emitir** (clique no destaque para abrir a lista; **+ Lembrete** fica no Mural). O **Resumo do escritório** mostra a
  equipe toda e ocupa a linha inteira. Os **avisos** (sino) não repetem mais o que já está no Início (tarefas atrasadas, honorários e
  acordos em atraso, documentos vencendo): ficam só as novidades (prazo chegando, vence hoje, menções, certidões). Textos sem "(s)".
- **Painel Executivo → Empresas do grupo:** ordenada por grupo, grupo em texto simples, nomes em CAIXA ALTA sem negrito,
  CAPAG A/B/C/D e "Omisso", situação "Ativa/Baixada".
- **Jurídico:** abas **Processos · Parcelamentos · Publicações** no topo das três telas.
- **Parcelamentos:** tabela **por grupo** (clique no grupo para ver por órgão), concluídos ocultos (**Mostrar concluídos** junto da
  tabela), "Risco de rescisão" com a **Natureza**, clique no parcelamento em "Progresso" para ver as parcelas e dar **✓ Baixa**,
  colunas **Atraso** (vencidos) e **Dias** (a vencer) no lugar de "Status".
- **Acordos:** "Mostrar concluídos" junto da tabela; sai a coluna "Situação/Vencido" dos vencidos.
- **Financeiro:** "Recebido mês a mês" com as cores de antes; "Comparativo por pessoa" com Total; "Em atraso" com vencimento e atraso em dias.
- **Clientes:** nomes em CAIXA ALTA, sem negrito. **Alertas:** mais limpo (o que está em dia fica recolhido).
- **Tabelas:** cabeçalho azul-marinho de novo; sem a bolinha antes do título dos cartões.
- **Usuários:** a conta nova já nasce liberada (não precisa clicar no link de confirmação). Para quem já foi criado: Administração →
  Usuários → **✓ Liberar entrada**.

## Backup 20 — tudo no mesmo padrão (tem SQL novo)
Ordem: **1) Merge  2) SQL no Supabase (`sistema/banco/estrutura.sql`)  3) Ctrl+Shift+R**. Nenhuma função do Supabase mudou.
- **Início:** saíram "+ Receita / + Despesa / + Contrato" (use **+ Lançar**). O **Recado** acabou: virou **📌 Lembretes**, sempre à vista
  no topo. Lembrete pode ser **sem prazo** (fica até "Feito"), **📌 fixo no topo** e ter **cor de destaque**. Os recados que estavam no
  mural foram copiados para os lembretes pelo SQL. Honorários **Jurídico** e **Contabilidade** com o mês no título, na ordem
  recebido (verde) · a receber · a pagar · em atraso (vermelho). "Atrasados" com um alerta vermelho discreto e baixa em lote.
- **ⓘ ao lado de Avisos, Tarefas, Minha fila e Lembretes:** pare o mouse em cima para ver a diferença entre eles.
- **Tabelas de pagamento (Início, Financeiro):** Quem · Grupo · Descrição · Valor · Vencimento · Atraso (em vermelho) · ações.
  **Baixa em lote:** marque as caixinhas → "✓ Dar baixa nos marcados". **PIX copia e cola:** botão **PIX** na linha (valor já
  preenchido); o e-mail de cobrança também leva o código. Para funcionar, preencha a **chave PIX, o titular e a cidade** em
  Central de e-mails → Configuração do envio → Dados para pagamento.
- **Painel → Empresas do grupo e Processos:** iguais a Clientes — agrupados por grupo (com a contagem), **▸** abre o detalhe,
  filtros no mesmo desenho (fundo azul no escolhido). Negociado aparece como "18k neg.". Os filtros antigos saíram.
- **Processos, Acordos, Parcelamentos e Financeiro:** sem o cartão de título. Os alertas (vencidos) e os botões (Cobrar/Notificar,
  Recibo, Conciliar, Editar em tabela) foram para a direita das abas ou do quadro "Situação".
- **Acordos:** já pago em verde, em atraso em vermelho; coluna do acordo mais larga; o acordo aberto vira um cartão; o gráfico
  gigante "Saldo por devedor" virou uma lista com barrinhas e total.
- **Financeiro:** sem "Ano passado", sem o campo mm/aaaa e sem CSV nos filtros; Recebidos e Prejuízo sem os cartões repetidos;
  "Em atraso" com ▲ vermelho e no padrão novo.
- **Clientes/Contratos:** tabelas com cantos arredondados; pílulas no desenho do Painel; "Sim" neutro (nem verde nem vermelho).
- **Saiu:** a tela antiga de Cobranças (o 🧾 Recibo continua funcionando).

## Backup 21 — ajustes finos (sem SQL novo)
Ordem: **1) Merge  2) Ctrl+Shift+R**. O banco não mudou (se quiser rodar o SQL mesmo assim, não faz mal). Nenhuma função do Supabase mudou.
- **Início:** os lembretes viraram uma lista de "a fazer": clique na **bolinha ○** para concluir (ao passar o mouse aparece "Concluir");
  ✎ editar, 📌 fixar e × apagar aparecem ao passar o mouse. O **?** ao lado dos títulos mostra a explicação num balão.
  **Atrasados:** clicar na dívida abre o **detalhamento**; o pagamento é só no botão **✓ Recebido**. Caixinhas maiores e as tabelas
  Jurídico/Contabilidade uma embaixo da outra (largura inteira).
- **Painel:** "entidades · grupos · Atualizado" ficam no topo e somem ao rolar. **Empresas do grupo** separada por grupo igual a
  Clientes ("BTCG 8 cadastros"); busca mais larga; **"Abrir ficha" voltou a funcionar** (dava erro de uuid).
- **Processos:** separado por grupo igual a Clientes, grupo em texto simples, filtros sem ícones e sem "Limpar", busca mais larga;
  clicar no processo abre uma **janela** com o detalhe (e o botão Editar).
- **Publicações:** filtro por **tribunal** em botões — só aparecem os tribunais com publicação pendente (nova ou lida) no período;
  quando todas forem tratadas/descartadas, o botão some.
- **Acordos:** sai o "Progresso por acordo"; colunas Situação e Próxima parcela mais estreitas; letras iguais às outras telas;
  **Saldo por devedor** em ranking (posição, nº de acordos, parcelas em atraso, barra e %); **A Pagar** sem "Situação".
- **Dias até o vencimento (todo o ERP):** vencido em vermelho (o próprio dia do vencimento já conta como vencido), menos de 3 dias
  amarelo, menos de 10 azul, 10 ou mais verde.
- **Financeiro:** selo do "Quem" no pastel da pessoa (verde do Pedro), sem contorno; filtros de período sem as bolinhas coloridas e
  selects no desenho de Clientes.

## Backup 22 — padronização (tem SQL)
Ordem: **1) Merge  2) SQL no Supabase (`sistema/banco/estrutura.sql`)  3) Ctrl+Shift+R**. Nenhuma função do Supabase mudou.
O SQL tira o PIX copia e cola do e-mail de cobrança e apaga as funções do PIX.
- **Régua única nas tabelas (todas as telas):** texto 13; linha de baixo (sócio, descrição) cinza 12; **vencimento em negrito**
  (vermelho quando vencido, o próprio dia conta); **valor em negrito, preto, à direita e completo** ("R$ 12.000,00", também no Painel);
  nomes de cliente/empresa em CAIXA ALTA sem negrito; cabeçalho azul-marinho; botões da linha sempre **"✓ Baixa"** e **"✎"**.
- **Selo da pessoa** (Pedro, Escritório, Emanuelle…): retângulo, negrito e **a mesma largura** em todo lugar.
- **Triângulo de atraso:** um só, vermelho com "!", nos títulos (Início › Atrasados, Financeiro › Em atraso, abas "Vencidos").
- **Início:** lembretes e fila como no Backup 20 (fundo pela cor, "✓ Feito" à vista, ⓘ com balão). Atrasados Jurídico e Contabilidade
  lado a lado, com a tabela de bordas e cantos arredondados como em Clientes.
- **Parcelamentos:** "Situação" virou **Parcelamentos em andamento** (igual Acordos): uma linha por parcelamento, separada por grupo
  (ou "Lista"), atrasados primeiro, barra do que já foi pago, próxima parcela e situação ("N em atraso", "risco de rescisão" com 3 ou mais).
  Clique abre as parcelas com **Lançar pagamento**. Saíram "Saldo residual por empresa" e o "Progresso por parcelamento" separado.
- **Acordos:** letras maiores e Situação centralizada; **Saldo por devedor** na metade esquerda e **Vencimentos dos próximos 30 dias**
  na direita; Vencidos / A pagar / Pago com altura mínima de 10 linhas.
- **Financeiro:** botão **PIX** removido (e o código PIX saiu do e-mail).
- **Contratos:** coluna Valor só do tamanho do número; "1,5 salários/mês".
- Teste novo `testes/padrao.js`: abre as telas e falha se o mesmo tipo de informação tiver tamanho/negrito/cor diferente entre elas.

## Backup 23 — ajustes (tem SQL)
Ordem: **1) Merge  2) SQL no Supabase (`sistema/banco/estrutura.sql`)  3) Ctrl+Shift+R**. Nenhuma função do Supabase mudou.
O SQL cria o "Excluir usuário".
- **Início:** os **Lembretes** voltaram a ter cartão próprio (com as guias de parcelamento), separados dos avisos/tarefas. Clicar no
  lembrete abre o **detalhamento** (o Editar fica lá dentro). **📌 Fixar / 📌 Fixado**: o fixado fica marcado (cheio). Lembrete com data
  distante não some: aparece em **Mais adiante**. Saíram o ⓘ e o contador do título; a fila também ficou sem o ⓘ.
- **Selo "Quem"** (Pedro, Escritório, Emanuelle): mais sutil, no mesmo desenho da pílula de prioridade das Tarefas, em todo o sistema.
  Nome de cliente/grupo nunca fica mais dentro do selo (era isso que cortava os nomes no Comparativo da Contabilidade).
- **Sem o triângulo vermelho** nos títulos. Atrasados com a tabela de bordas arredondadas.
- **Painel:** a rosca "Distribuição por órgão" passou a somar também o valor **negociado** (antes só o em aberto) — agora bate com o
  "Passivo tributário total" e com o gráfico por grupo. Nomes compridos no gráfico quebram em linhas (não são mais cortados).
- **Parcelamentos:** só os **grupos** de início; clique no grupo para ver os parcelamentos (ordem alfabética). **Filtros** de grupo,
  pagamento, próxima parcela e situação. Clicar no parcelamento abre o **detalhamento numa janela** (resumo, parcelas e Lançar pagamento).
- **Acordos:** saíram "Saldo por devedor" e "Vencimentos dos próximos 30 dias".
- **Clientes:** Sim verde / Não vermelho; situação Ativa verde, Baixada/Inapta/Suspensa/Nula vermelho.
- **Tarefas:** colunas Grupo · Tarefa · Pessoa · Prioridade · Status · Prazo.
- **Administração → Usuários:** botão **🗑 Excluir** (só administrador; não exclui a si mesmo nem o último administrador; o que a pessoa
  lançou continua gravado).
- **Modo escuro:** grafite em vez de preto puro, com separação entre fundo, cartão e cabeçalho das tabelas.

## Backup 24 — Início e Painel (sem SQL novo)
Ordem: **1) Merge  2) Ctrl+Shift+R**. O banco não mudou.
- **Início:** "guias de parcelamento a emitir" saiu do cartão de Lembretes e virou um destaque ao lado de **avisos não lidos** e **tarefas
  suas atrasadas**. Clique nele para ver a lista e marcar "Guia emitida".
- **Painel Executivo:** saíram os gráficos "Passivo total por grupo" e "Distribuição por órgão".
- Prompt para o novo chat "ERP Automação": `sistema/PROMPT-AUTOMACAO.md`.

## Backup 25 — Parcelamentos e Acordos por grupo, guias por parcelamento (tem SQL)
Ordem: **1) Merge  2) SQL no Supabase (`sistema/banco/estrutura.sql`)  3) Ctrl+Shift+R**. Nenhuma função do Supabase mudou.
O SQL cria o campo "quem emite as guias" em cada parcelamento.
- **Parcelamentos e Acordos — mesma lista, por grupo:** de início só os grupos; clique no grupo para ver os parcelamentos/acordos dele
  (recuados, cada um num cartão, com um fio à esquerda). Sem barra de progresso: **"147 de 410 parcelas pagas"** e, embaixo,
  **"Quitado R$ 149 mil · falta R$ 103 mil"**.
  - **Próxima parcela do grupo** = soma de todas as parcelas que vencem no mês da próxima (ex.: "R$ 1.840 · 2 parcelas em out/2026").
  - **Situação** = nº de parcelas em atraso (o dia do vencimento já conta).
  - **Risco de rescisão** só quando **um mesmo** parcelamento/acordo tem **2 ou mais** parcelas em atraso (20 atrasadas, uma em cada, não é risco).
  - Clicar no parcelamento ou no acordo abre o **detalhamento numa janela** (resumo, parcelas, "Lançar pagamento").
- **Guias:** em Parcelamentos → abrir o parcelamento → **"Guias deste parcelamento: Nós emitimos / O cliente emite"**. Só os "nós emitimos"
  entram no aviso "guias a emitir" do Início. Filtro **"Guias"** na lista e a etiqueta "guia: cliente" na linha.
- Saíram o selo vermelho do topo (Parcelamentos e Acordos) e as notas em itálico ao lado dos títulos.
- Acordos: tabelas Vencidos / A pagar / Pago com altura mínima de 5 linhas (antes 10).
- Início: só 5 tamanhos de letra (11 · 12 · 13 · 14 · 20) — conferido pelo teste de padronização.
## Backup 26 — do primeiro contato ao financeiro (tem SQL e 3 funções novas)
Ordem: **1) Merge  2) SQL no Supabase (`sistema/banco/estrutura.sql`)  3) publicar as funções `erp-emails`, `erp-cnpj` e `erp-agenda`
(Verify JWT desligado)  4) Ctrl+Shift+R**.

**Contrato e assinatura**
- O **"Fechou"** do CRM cria o cliente e o contrato **aguardando assinatura**. Nessa hora **não** entra parcela no Financeiro e **não**
  sai e-mail de cobrança.
- Na ficha da oportunidade: **📄 Gerar contrato**. O gerador abre já com o cliente, os sócios e os **valores** combinados. A minuta fica
  guardada no contrato.
- Quando o cliente assinar: **Contratos → abrir o contrato → ✓ Marcar como assinado** e anexe o PDF. Mover o lead para "Contrato
  assinado" no CRM faz a mesma coisa. Nesse momento o sistema:
  1. lança as parcelas ou mensalidades;
  2. cria o onboarding;
  3. avisa a equipe;
  4. registra na linha do tempo;
  5. manda o e-mail de boas-vindas, se estiver ligado em ⚡ Automações. Ele vem **desligado**.
- Contrato novo pela tela Contratos: escolha "Já está assinado" (lança agora, como antes) ou "Aguardando assinatura".

**Contatos por setor e e-mails**
- Na ficha do cliente → **Contatos**: cada contato tem **Setor** (Financeiro, Fiscal, RH, Sócio, Jurídico, Contador externo, Geral) e
  **Recebe por e-mail** (Cobranças, Recibos, Guias, Acordos, Contratos, Convites).
- Para quem vai cada e-mail:
  1. vai para quem está marcado para aquele tipo (se forem vários, vai para todos);
  2. se ninguém estiver marcado, vai para o setor padrão: cobrança e recibo → Financeiro, guia → Fiscal, contrato e convite → Sócio;
  3. se não houver contato do setor, vai para o contato Geral;
  4. por último, vai para o e-mail do cadastro.
- **Central de e-mails → 📨 Quem recebe o quê:** uma linha por cliente, com o responsável, o perfil e o destino de cada tipo de e-mail.
  - Clique no cliente para marcar os contatos de cada tipo, ver o modelo (como o e-mail sai) e o histórico do que já foi enviado.
  - O filtro **"Só com e-mail faltando"** mostra quem está sem destino.
  - Em cima da tabela você escolhe o setor padrão de cada tipo.
- Perfil novo: **"Não enviar nenhum e-mail"**.
- A fila "A enviar hoje" mostra **Quem** (o responsável) e de onde veio o destinatário.
- Cobrança de atraso: um aviso por vez (1º → 2º → 3º). Quem nunca foi avisado recebe o 1º, e não pula direto para o 2º.
- O recibo mostra o valor no formato brasileiro (R$ 1.500,00).

**Cadastro**
- O formulário do cliente agora é dividido em seções: Identificação, Classificação, Contato principal, Endereço, Situação, Passivo e Observações.
- **Origem** é uma lista (Indicação, Site, Instagram…) e há o campo **"Indicado por"**.
- CPF/CNPJ repetido: o sistema avisa na hora e pergunta se quer cadastrar mesmo assim.
- O e-mail do cadastro vira o contato **Geral** sozinho. Os clientes que já existem também ganharam esse contato.
- Os **sócios** do cartão CNPJ entram sozinhos em "Sócios e vínculos". Para isso, a função `erp-cnpj` precisa estar publicada.

**Reunião**
- No CRM (ficha do lead) ou na ficha do cliente: **📅 Reunião**. Informe a data, a hora, o local ou link e os participantes, e escolha
  "Enviar convite ao cliente: Não/Sim".
- A reunião vira tarefa de cada participante e aparece no Google Agenda de quem assinou a agenda (função `erp-agenda`).
- O lead vai para "Diagnóstico agendado".
- O convite leva um arquivo que o cliente clica para salvar na agenda dele. **Com a pausa de e-mails ligada, o convite fica retido.**
- Ficha do cliente: botão **🎯 Virar lead**, para abrir uma oportunidade nova de um cliente que já existe.

**Linha do tempo**
- A ficha do cliente → **Linha do tempo** junta, numa lista só: contatos, reuniões, CRM, contratos (criado e assinado), pagamentos,
  e-mails enviados, tarefas, documentos e mudanças no cadastro.
- Há um filtro por tipo acima da lista.

**Delegar e validar**
- **Tarefas → 👥 Delegar** ou, no CRM, **👥 Delegar**: escolha a sequência "Lead completo" e a pessoa. Os passos são:
  1. cadastrar;
  2. agendar a reunião;
  3. preparar o contrato (este passo passa pela sua validação);
  4. enviar ao cliente.
- Cada passo só começa quando o anterior termina. A pessoa recebe o aviso "Pode começar".
- **Início → ✅ Aguardando minha validação:** **✓ Aprovar** libera o próximo passo. **↩ Devolver** volta para a pessoa com o seu comentário.
- Na ficha da tarefa em revisão aparecem os mesmos dois botões.
- "Depende de" agora trava de verdade: não dá para concluir antes do passo anterior.

**Simplificar**
- A lista com a sugestão manter / simplificar / remover está em `sistema/SIMPLIFICACAO-SUGESTOES.md`. Nada foi removido: responda
  com os números que aprovar.

## Backup 27 — Início enxuto, guias para o estagiário, Contabilidade unificada (tem SQL e 1 função)
Ordem: **1) Merge  2) SQL no Supabase (`sistema/banco/estrutura.sql`)  3) publicar a função `erp-emails` (Verify JWT desligado)
4) Ctrl+Shift+R**.

**Início**
- Sem o subtítulo "Resumo de…". Os **Honorários** (Jurídico e Contabilidade) vêm antes da **Minha fila**; as tabelas "Atrasados"
  saíram (estão iguais no Financeiro).
- Destaques: "tarefas atrasadas" e "prazo fatal" viraram um só — **⏰ N tarefas suas pedem atenção** (atrasadas ou com prazo fatal em
  7 dias). Novo destaque **🤝 boletos de acordo a emitir**.
- **Lembretes:** sem a legenda; aparecem os fixados (sempre), os sem prazo e os com data em até 7 dias. **📋 Todos** abre a lista
  completa (fixados, próximos, mais adiante e concluídos nos últimos 90 dias, com "↺ Reabrir").
- **Minha fila:** no mês, os dias depois do último dia ficam iguais aos de antes do dia 1; em Dia/Semana/Mês as **atrasadas** ficam
  numa coluna à esquerda; a Lista ficou mais compacta.
- **🔔 Avisos:** só o que não aparece no Início nem em Tarefas — saíram publicações novas, tarefas e vencimentos do dia. Entrou o
  **CRM com o próximo passo chegando** (2 dias antes, no dia e atrasado).

**Painel Executivo:** sem a seta de expandir; clicar na linha, no nome ou no grupo abre a **ficha completa**. O filtro de grupo fica só
no filtro de cima.

**Processos:** sem "com/sem valor informado", sem "Ticket médio" e "Sem valor", sem o título em cima das tabelas Grupo/Tribunal/
Natureza, sem a seta "›"; a lista abre ordenada por **Competência**.

**Parcelamentos e Acordos**
- Sem "Por grupo / Lista" (sempre por grupo). O grupo aberto fica com contorno e faixa azul; os itens aparecem dentro dele.
- "**2 de 6** parcelas pagas" com o número em verde. Atraso numa pílula só: "2 em atraso" (rosa) ou "2 em atraso — risco de
  rescisão" (vermelha).
- Quadro novo **🧾 Guias para emitir** (em Acordos, **Boletos / PIX para emitir**), com 3 abas:
  1. **A emitir** (vence em até 15 dias): **🧾 Emitir** → anexe o PDF (fica em Documentos do cliente) → marque "enviar ao cliente" → **✓ Marcar
     como emitida**. Grava a data e quem emitiu; o e-mail sai com a guia **anexa** e o lembrete automático daquela parcela não repete.
  2. **Emitidas — aguardando pagamento:** mostra "✓ emitida 12/10" e "✉ enviada 12/10"; **✓ Pago** dá a baixa.
  3. **Vencidas sem pagamento.**
- No detalhe do parcelamento/acordo, os cartões das parcelas estão maiores e mostram a guia (emitida/a emitir) com **🧾 Emitir guia**
  e **✓ Lançar pagamento**.

**Financeiro → Contabilidade (Análise):** Recebimentos e Pagamentos juntos (saíram os dois cartões). Números: Recebido, A receber, Pago,
A pagar e Em atraso. Gráfico **Recebido × pago mês a mês** (verde e vermelho, como no Jurídico), **Comparativo por cliente** e
**Comparativo por fornecedor**, e "Em atraso" com a coluna **Receita / Despesa**.

## Backup 28 — Rotina do estagiário, e-mail por empresa, várias guias num e-mail, cadastro em abas (tem SQL e 2 funções)
Ordem: **1) Merge  2) SQL no Supabase (`sistema/banco/estrutura.sql`)  3) publicar as funções `erp-emails` e `erp-cnpj`
(Verify JWT desligado)  4) Ctrl+Shift+R**. Para testar os e-mails, rode também `sistema/banco/cliente-teste-email.sql`
(cria o cliente "TESTE E-MAIL (PEDRO)" com pedromgsam@gmail.com; para apagar, veja a 1ª linha do arquivo).

**Menu de cima:** entraram **Rotina** (o ambiente do estagiário) e **E-mails** (saiu de dentro da Administração).

**Rotina** (substitui as planilhas) — 5 abas:
1. **Passivo e cadastro:** tabela editável com RFB, RFB negociada, PGFN, PGFN negociada, AGE/MG, AGE/MG negociada, CEAT, em operação,
   procuração, **certificado (validade + senha)** e CAPAG. As linhas alteradas ficam amarelas até clicar **Salvar alterações**.
   A senha do certificado fica numa tabela à parte: só quem pode **editar clientes** vê.
2. **Processos:** o que está há mais tempo sem conferir vem primeiro. **+ Registrar**: movimentação, decisão relevante, mudança de valor
   (atualiza o valor da causa), procuração juntada ou "conferido — sem novidade". Vira a "Última movimentação" do processo.
3. **Guias e boletos** (os dois quadros de Parcelamentos e Acordos). 4. **Financeiro** (atrasados e próximos 7 dias, + Receita/+ Despesa).
5. **Minhas tarefas.**

**Publicações:** cada publicação começa com "Processo: …", "Autor: …", "Réu: … — Advogado: …" e o botão **📋 Copiar**.

**Painel Executivo e Processos:** sem "Por grupo / Lista" (sempre por grupo), mostram **todas** as linhas (sem "Mostrar mais") e têm um
separador mais forte entre grupos. Processos: tabelas Tribunal/Natureza sem negrito; ao clicar no processo aparecem **Última
movimentação** e **Observação**, e o botão **+ Registrar movimentação**.

**Contratos:** campos **Data em que fechou**, **Início da vigência** (ex.: fechou 28/07, começa 01/08 → 1º pagamento 10/09, a tela mostra)
e **Quem fechou**. A ficha mostra quem fechou e **quem cuida do cliente**; "Documentos do contrato" vem antes de "Aditivos"; consultoria sem
"% do previsto já recebido". Situação (Ativo, Aguardando assinatura, Encerrado, Cancelado, Rescindido) separada do **Financeiro**
(coluna própria: "Parcela em atraso" / "Em dia"). Pílulas centralizadas.
*Mensalidades:* o sistema gera sempre até 2 meses à frente, todo dia às 6h30 (rotina `erp_mensalidades`), e segue sozinho no ano seguinte até
a rescisão — não precisa gerar o ano novo.

**Clientes:** coluna **Área** (Jurídico / Contábil / Jurídico e contábil); sem a seta e sem abrir para baixo — clicar abre a
**ficha completa**. **Novo cliente em abas** (Empresa, Classificação, Contatos, Endereço, Situação e passivo, Observações): digitando o CNPJ o
sistema consulta a Receita na hora e preenche o que estiver vazio; **vários e-mails e telefones** (cada um com o setor — viram contatos);
grupo **existente na lista** ou **"É um grupo novo"**; opção "Depois de salvar, criar o contrato".

**Em todo o sistema:** valor em R$ e telefone com máscara **enquanto digita** ("10,20" → "R$ 10,20"; "10" → "R$ 10,00" ao sair do campo;
"37998684323" → "(37) 9 9868-4323"). Listas de escolha (selects) com visual novo.

**Parcelamentos e Acordos:** o quadro de guias tem **▾ Minimizar** e **✉ Enviar por empresa**: escolha a empresa, marque as parcelas, confira/
edite **os valores** (mudam todo mês) e o texto, anexe **vários PDFs** e clique **✉ Enviar e-mail** (um e-mail só com todas as guias e o
total) ou **📲 WhatsApp** (no celular vai com os PDFs; no computador abre a conversa com o texto e você arrasta os PDFs). Na lista: "🧾 há guias
para emitir" no grupo e "falta emitir a guia" no parcelamento/acordo.

**E-mails por empresa:** Central de e-mails → **⚙ Configuração do envio** → quadro **🧮 Contabilidade**: e-mail que envia (senha de app)
e dados de pagamento (PIX, banco, assinatura) da Contabilidade. Clientes com área **Contabilidade** e lançamentos da Contabilidade saem por
essa conta e com esses dados; os demais, pelo e-mail e dados do escritório (advocaciapedrocastro@gmail.com).

**Documentos:** separados por grupo em pastas (clique para abrir/fechar). **Alertas:** blocos por setor, dois lado a lado; Rotinas
automáticas em tabela. **CRM:** na ficha do lead, **💼 Proposta**, **📜 Contrato**, **🎥 Meet** (cria sala) e **🗓 Agenda** (evento pronto no
Google Agenda); na reunião, "Criar sala no Meet" e "Google Agenda". **Financeiro → Contabilidade:** comparativos por cliente e por fornecedor
com as mesmas colunas e **linha de Total**.

## Backup 29 — cartões iguais, guias por empresa sem guardar anexo, e-mails de teste, Rotina e relatório novo (tem SQL e 2 funções)
Ordem: **1) Merge  2) SQL no Supabase (`sistema/banco/estrutura.sql`)  3) publicar as funções `erp-emails` e `erp-cnpj`
(Verify JWT desligado)  4) Ctrl+Shift+R**.

**Início e Financeiro → Jurídico:** os mesmos cartões (Recebido · A receber · A pagar · Em atraso · Prejuízo), com valores inteiros;
no Financeiro fica também o Ticket médio. No Início o "Recebido" é sempre o mês corrente; no Financeiro segue o filtro.

**Parcelamentos e Acordos:**
- Quadros "**Parcelamentos para emitir**" e "**Acordos para emitir**". O que já foi **enviado ao cliente sai do quadro**.
- **✉ Enviar por empresa** com visual novo: empresas à esquerda; à direita o e-mail/WhatsApp, o assunto, o texto no modelo das antigas
  "Notificações" ("Prezados, seguem as guias…") e um cartão por parcela com o **valor editável**; **📎 Anexar os PDFs**; embaixo, lado a lado,
  **💬 WhatsApp** e **✉ Enviar e-mail**. Os PDFs **vão só no e-mail**: não ficam guardados no Supabase (depois que o e-mail sai, fica só o nome do arquivo).
- Na emissão: "Guia emitida em 27/08/2029". Na lista por grupo, coluna **Guias** ("Há guias a emitir" / "Falta emitir a guia").
- Saiu o botão "Notificar clientes".

**E-mails:**
- **🧪 E-mails de teste** (Central de e-mails, logo abaixo da pausa): os endereços dessa lista **saem mesmo com o envio pausado**. Para
  testar: deixe a pausa ligada, use o cliente "TESTE E-MAIL" (pedromgsam@gmail.com) e mande o que quiser — nada vai para os clientes.
- Configuração: **Escritório** e **Contabilidade** com os mesmos campos; **Banco, Agência e Conta** separados.
- "Quem recebe o quê": **Honorários**, **Parcelamentos**, Acordos, **Recibo de honorário**, Contratos, **Reuniões**.
- A Central saiu do "⋯" (fica no menu **E-mails**).

**Clientes:** botão **🔎 Buscar dados** ao lado do CNPJ (não busca sozinho). Ele troca tudo pelo que está na Receita (nome, endereço, situação,
sócio-administrador, tipo societário, regime Simples, e-mail e telefone quando houver) — trocar o CNPJ e buscar de novo **apaga o sócio antigo**.
E-mails e telefones em blocos mais claros.

**Rotina:** Sim verde / Não vermelho; CAPAG nas cores (A/B verde, C amarelo, D/Omisso vermelho); "Certificado" Sim/Não e **Senha GOV**
(sem a validade); **🕘 Histórico do passivo** (geral e por empresa: quem mudou, quando, de quanto para quanto); Processos separados por grupo e
com **+ Processo**; aba "Parcelamentos e acordos para emitir"; **Minhas tarefas** em Recorrentes (voltam sozinhas), Com validação, Únicas e
"Para eu validar", com **+ Tarefa recorrente**.

**Tabelas:** em todas, a linha de títulos fica **fixa no topo** e aparecem **todas as linhas** (sem "Pág. 1 de 5").

**Contratos:** mensalidades geradas **6 meses à frente**. **Contabilidade → despesa:** lista de tipos; **Distribuição de lucros** pede só o sócio.

**Relatório em PDF** (⋯ → Relatório em PDF): refeito — escolha o grupo (ou a carteira toda) e as seções; abre a prévia com **Salvar em PDF**.

## Backup 30 — guias: destinatário único, situação real do e-mail, empresas por grupo (tem SQL, nenhuma função nova)
Ordem: **1) Merge  2) SQL no Supabase (`sistema/banco/estrutura.sql`)  3) Ctrl+Shift+R**. Nenhuma Edge Function mudou
(mas a `erp-emails` precisa estar **publicada** para qualquer e-mail sair — veja abaixo).

**Financeiro → Contabilidade:** os 5 cartões no mesmo desenho dos do Jurídico (uma linha de subtítulo, mesma altura).

**Parcelamentos e Acordos:**
- **✉ Enviar por empresa:** empresas organizadas por **grupo** (BETA › empresas da BETA; CARIRI › empresas da CARIRI); o campo **Para** já vem
  com o e-mail cadastrado (contato marcado "Parcelamentos"/"Acordos", senão o do setor, o geral ou o do cadastro) — se não houver, fica amarelo
  para digitar; **valor da guia** numa caixa "R$ | 1.840,22" alinhada; texto neutro para PF e PJ: "Seguem as guias do parcelamento **em nome de** …".
- **Janela da guia (🧾 Emitir / ✎):** o mesmo campo **Para** e o mesmo envio do "Enviar por empresa" (com ou sem PDF). O botão diz
  "Marcar emitida e enviar e-mail" quando a caixa de envio está marcada. Não aparece mais "o cliente não tem e-mail cadastrado" se o e-mail foi digitado.
- **Situação real do e-mail:** a parcela guarda qual e-mail levou a guia. No quadro: "✉ na fila", "⏸ retido (pausa)", "✉ enviado",
  "⚠ e-mail falhou". Na fila/retido/enviado → sai do quadro; **falhou ou descartado → volta para "Emitidas — falta enviar"**. Quando há e-mails
  de guias retidos pela pausa, aparece uma faixa amarela com o botão **Abrir E-mails → Fila**.
- Exemplo visual (ainda não feito) das guias em blocos grupo › empresa: `sistema/prototipos/guias-em-blocos-b30.png`.

**Para os e-mails saírem de verdade:** (1) a função `erp-emails` publicada (Supabase → Edge Functions; Verify JWT desligado);
(2) a conta de e-mail configurada (E-mails → Configuração); (3) a **pausa** desligada — ou o destinatário na lista de **🧪 e-mails de teste**;
retidos saem em **E-mails → Fila → Liberar**.

## Backup 31 — contorno azul nos grupos, conferência na Rotina, controle dos parcelamentos e guias em blocos (tem SQL, nenhuma função)
Ordem: **1) Merge  2) SQL no Supabase (`sistema/banco/estrutura.sql`)  3) Ctrl+Shift+R**.

**Geral:** cada grupo das tabelas agrupadas (Painel Executivo, Processos, Rotina, Clientes por grupo, Parcelamentos/Acordos) fica dentro de
um **contorno azul**.

**Jurídico → Processos:** escolhendo **um grupo** no filtro de cima, a tabela "Grupo" da análise vira **"Entidade / sócio"**: cada empresa ou sócio
do grupo com o número de processos e o valor (a entidade é a parte — réu ou autor — que é cliente do grupo).

**Rotina:**
- **Passivo e cadastro:** coluna **Conferência** logo depois da empresa: "✓ conferido dd/mm · quem" ou "✎ alterado dd/mm", e a data da última
  alteração ("alt."). O botão **✓** registra que a pessoa foi até a linha e o dado continua certo (sem mudar nada). Salvar alterações registra
  "alterado". Mais de 30 dias sem conferir fica amarelo; nunca conferido, vermelho.
- **Processos:** botão **✓ Sem novidade** (um clique) e a coluna "Conferido em" mostra quem conferiu e se foi "sem novidade" ou "com alteração".
- Aba nova **📋 Controle dos parcelamentos:** grupo › parcelamento com a chave **"Nós emitimos?"** (por parcelamento) e, na linha do grupo,
  **"Nós emitimos: todas do grupo / nenhuma"**. Ao lado, a **planilha por mês** (6 meses, ‹ › para andar): ✓ paga · E guia emitida · • a emitir ·
  ! vencida sem pagamento — clique na parcela para emitir, desmarcar a emissão ou dar baixa. Também tem a conferência (✓) por parcelamento.

**Parcelamentos/Acordos para emitir:** em **blocos por grupo** (clique no grupo para abrir; se houver um só, já abre), dentro de cada grupo as
empresas com o botão **🧾 Emitir** (abre o e-mail com as guias daquela empresa) e as parcelas com a legenda de sempre ("Parcela 2/85 · FGTS ·
Caixa · nº …"). Atraso por parcelamento, discreto: "1 em atraso" (rosa) ou "2 em atraso · risco de rescisão" (vermelho). "✉ Enviar por empresa"
continua no alto, à direita. Linhas mais baixas (quadro menor).

**Versão anterior guardada:** `backups/Backup 30 - Guias com destinatario unico, situacao do e-mail e empresas por grupo.zip` (antes destas mudanças).

## Backup 32 — Central de Documentos (feita do zero): procuração, substabelecimento, contrato, recibo, declaração e acordo (tem SQL)
Ordem: **1) Merge  2) SQL no Supabase (`sistema/banco/estrutura.sql`)  3) Ctrl+Shift+R**. Nenhuma Edge Function mudou.

**Onde fica:** ERP → **⋯ → 📄 Documentos** (ou a ficha do cliente → Documentos; contrato e CRM → "Gerar contrato"; Financeiro → recebimento →
**📄 Recibo**). Abre numa aba à parte: `.../documentos/` — mesmo login do ERP.

**Como usa:**
1. À esquerda, escolha o modelo: **Procuração, Substabelecimento, Contrato de honorários, Recibo, Declaração, Acordo entre partes**.
2. No formulário, **🔎 Buscar cliente cadastrado**: puxa razão social/nome, CPF/CNPJ, endereço e sócio-administrador. Confira e complete.
3. À direita, a **folha A4 ao vivo** (logo no alto, banda institucional no rodapé, Times New Roman, cláusulas no padrão do escritório).
   O que falta preencher aparece em **amarelo** e o contador "N campos a preencher" fica no alto.
4. **✎ Ajustar texto** para escrever direto na folha (Ctrl+B = negrito). **💾 Salvar** guarda no **Histórico** (recibo ganha número:
   REC 2026/0001, 0002…). **⎙ PDF** abre a página para "Salvar em PDF"; **⬇ Word** baixa o .docx com a logo e o rodapé.
5. **🗂 Histórico**: buscar, **Abrir**, **Duplicar** (faz outro igual; recibo ganha número novo) e apagar.
6. **🏛 Escritório** (só administrador): nome/OAB/endereço profissional dos advogados, CNPJ e razão social (recibos), cidade e foro padrão.

**Modelos:**
- **Procuração:** ad judicia et extra com os poderes especiais padrão; finalidade em negrito no fim (processo, Receita/PGFN/SEFAZ, processo
  administrativo, Junta/cartórios, ampla ou texto livre); poderes extras opcionais; um ou mais advogados.
- **Substabelecimento:** com ou sem reserva; do escritório para outro advogado ou recebido.
- **Contrato de honorários:** objeto + atividades + exclusão padrão + ressalva; honorários combináveis (fixo, entrada + parcelas, salários mínimos,
  mensalidade, êxito com a base definida); rescisão, obrigações e disposições gerais fixas; Anexo I (tabela por matéria) opcional; testemunhas.
  Vindo de um contrato do ERP, já traz valor, parcelas, mensalidade e % de êxito.
- **Recibo:** numerado, valor por extenso, quem paga, quem recebe (escritório ou advogado), forma e data. Vindo do Financeiro, já preenchido.
- **Declaração:** hipossuficiência (justiça gratuita), residência ou texto livre.
- **Acordo entre partes:** credor/devedor (ou outro par), dívida, valor do acordo (mostra o desconto), à vista ou parcelado, dados bancários,
  inadimplemento com multa e execução, quitação (e homologação nos autos quando houver processo), assinaturas lado a lado.

O gerador antigo de **contrato e procuração** saiu dos menus (o arquivo continua no site só como consulta). Petição, solicitação de documentos,
proposta e modelos de e-mail continuam em ⋯ → Documentos → "Outros geradores".

## Backup 33 — guias em tabela, reenvio da guia vencida, Rotina enxuta, alertas de conferência, e-mails em modo teste e evolução do passivo (tem SQL)
Ordem: **1) Merge  2) SQL no Supabase (`sistema/banco/estrutura.sql`)  3) Ctrl+Shift+R**. Nenhuma Edge Function mudou.

**Parcelamentos e Acordos — quadro de guias:**
- "A emitir", "Emitidas" e "Vencidas" viraram uma tabela alinhada: Vencimento · Grupo/empresa/parcela · Atraso · Valor · Situação.
- **Vencidas** mostra as parcelas vencidas e não pagas **mesmo depois de enviadas**, até alguém marcar **✓ Pago**.
  O botão **↻ Reenviar** pede o novo vencimento e o valor atualizado (com SELIC/multa, tirado do portal), anexa a guia nova e manda o e-mail
  "Guia atualizada". A parcela guarda o reenvio ("↻ reenviada dd/mm · vence dd/mm" e "→ novo valor").
- Situação: indicador **✓ Nós emitimos / 👤 Cliente emite** em cada item e no grupo; botão **◫ Em 2 colunas** (esquerda: grupo, emitimos,
  pagas, quitado, falta; direita: só o que está em atraso).

**Rotina:**
- Datas no horário de Brasília. Conferência: até 15 dias verde, 16–30 amarelo, mais de 30 vermelho.
- Passivo: tabela mais estreita (RFB/PGFN/AGE com o negociado na mesma célula); Senha GOV saiu da tabela (botão 🔑 abre a janela).
- Processos: "Conferido em" logo depois do número.
- Controle dos parcelamentos: "Nós emitimos?" na 1ª coluna; 8 meses (5 para trás, o atual, 2 à frente); clique no nome abre as parcelas;
  a tabela vai até o fim sem barra de rolagem por dentro. Nova aba **Controle dos acordos** (mesma planilha).
- **Alertas de conferência** (Automações → grupo Tarefas): "Rotina: lembrar de conferir" (toda semana, tarefa para quem faz a Rotina com o que
  passou de 15 dias sem conferir) e "Rotina: responsável confere o estagiário" (toda semana, resumo de quantas conferências e por quem).
  **Escolha a pessoa de cada um em "Responsável"** (Automações).

**E-mails em modo teste:** o SQL (uma vez só) liga a pausa, deixa passar só **pedromgsam@gmail.com** e desliga as rotinas de e-mail ao cliente.
Para voltar ao normal: Automações → ligar as rotinas de e-mail; E-mails → desligar a pausa e apagar a lista de teste.

**Painel Executivo:** cartão **Evolução do passivo** (linhas, mês a mês): escolha o grupo, "Total" ou "Por empresa", 6/12/24 meses.
O valor de cada mês vem do histórico de alterações do cadastro.

## Backup 34 — guias emitidas pela Rotina (Emissão e Pagamento por mês), Situação dos parcelamentos enxuta e Central de Documentos dentro do ERP (tem SQL)
Ordem: **1) Merge  2) SQL no Supabase (`sistema/banco/estrutura.sql`)  3) Ctrl+Shift+R**. Nenhuma Edge Function mudou.

**Parcelamentos e Acordos (só para enxergar):**
- Saíram os quadros "Parcelamentos para emitir" e "Acordos para emitir" (e a aba "para emitir" da Rotina).
- "Situação": Grupo › parcelamentos (com um grupo filtrado: Empresa › parcelamentos), linhas da mesma largura, sem "quem emite".
  Um aviso discreto "· 🧾 N guias a emitir" aparece embaixo do nome quando há guia vencendo em até 15 dias sem emissão.
- Clique no parcelamento: a ficha com os dados da planilha (devedor, CPF/CNPJ, órgão, natureza, nº, total de parcelas, valor da parcela,
  valor residual, guias) e as parcelas em lista: Parcela · Vencimento · Valor · Situação (paga/vencida/a vencer + emitida/não emitida/"não emitimos").

**Rotina → Controle dos parcelamentos (e dos acordos) — a emissão é feita aqui:**
1. Cada mês tem duas casinhas: **Emis.** (○ a emitir · ✓ emitida) e **Pag.** (✓ paga · ! vencida · ○ a vencer).
2. Clique na casinha **Emis.** dos meses que vai emitir (fica azul). Embaixo aparece a barra **✉ Enviar por empresa**.
3. A janela de envio é a mesma de antes (mesmo e-mail, mesmas cores). Confira/edite o **valor** de cada parcela, anexe os PDFs e envie.
   Ao enviar, a parcela fica marcada como **emitida** sozinha, e o valor digitado vira o "valor lançado" daquele mês.
4. Parcela vencida sem pagamento: marque de novo no mês seguinte → a janela pede o **novo vencimento** e o **valor atualizado** (reemissão).
5. Clique em **Pag.** para dar baixa. Clique no nome do parcelamento para ver todas as parcelas e **editar o valor** de qualquer mês
   (mês sem valor = vale o último valor lançado antes dele).
6. O cabeçalho dos meses fica parado no alto quando você rola a página. "Emit.?" (1ª coluna) = o escritório emite a guia.

**Central de Documentos dentro do ERP:** menu **Documentos → Gerar documento** (ou ⋯ → Documentos, contrato, recibo do Financeiro).
**Ctrl + clique** (ou botão do meio do mouse) em qualquer item do menu ou link de documento abre numa aba nova.

## Backup 49 — simplificação geral: as 36 sugestões aprovadas (tem SQL; nenhuma função nova)
Ordem: **1) Merge  2) SQL no Supabase (`sistema/banco/estrutura.sql`)  3) Ctrl+Shift+R**. Nenhuma função do Supabase precisa ser publicada de novo.
Para voltar à versão anterior: o zip do **Backup 48** (pasta `backups/`).

**E-mails**
- **✉ Recebe e-mails: Sim / Não**: uma chave por cliente. Ela aparece na lista de Clientes (coluna E-mails), na ficha e no cadastro.
  Para mudar vários de uma vez: Clientes → **✉ Recebe e-mails…**.
  - "Não" = nada sai para o cliente: lembretes, cobranças, guias, recibo, boas-vindas e rascunhos do Gmail.
  - Quem tenta enviar vê o aviso na hora.
  - O perfil detalhado ficou em "Avançado", fechado.
- **Administração → E-mail** tem três abas:
  - **Quem recebe**: uma linha por cliente, com destino, chave Sim/Não, último e-mail e o selo "sem e-mail". Filtros: Todos · Recebem · Não recebem · Sem e-mail.
  - **Para revisar**: os e-mails automáticos esperam um clique ("Enviar todos" ou um por um, com 👁 prévia). Liga e desliga na chave do topo.
  - **Configuração**: a tela antiga.
- **Guias do mês** (Rotina) e **rascunho dos Acordos** saem no modelo bonito: logo, quadro de cada guia, "Como pagar" e rodapé. O texto do cartão continua igual.
  - Use **👁 Prévia** para ver antes de enviar.
  - O quadro **Pendências do envio** mostra: cliente sem e-mail, guia sem anexo e quem está marcado "não recebe".
- **Faixa amarela do modo teste** (só para o administrador), com o botão **Desligar modo teste**.

**Telas**
- **Início**: o resumo virou uma linha de atalhos clicáveis. A agenda tem só **Lista** e **Mês** (Semana e Dia ficam em Tarefas → Calendário).
- **Tarefas**:
  - Botões: **+ Nova tarefa**, **⚡** (criação rápida), **👥 Delegar** e **⚙** (modelos, feriados, Google Agenda, novo fluxo).
  - Duas linhas de filtro: **Mostrar** (tipos, prioridade e prazo) e **De quem**.
  - Vistas: **Lista · Calendário (Mês/Semana/Dia) · Fluxos**.
- **Painel**:
  - O gráfico de evolução começa fechado (abre com um clique).
  - No celular, os valores aparecem completos.
- **Processos**: "🔎 Buscar movimentação" preenche com a publicação mais recente do mesmo processo.
- **Parcelamentos**: fica só para consulta. Emitir, enviar e pagar são feitos na **Rotina**.
- **Rotina**: abas Passivo · Processos · Guias do mês · Planilha · Minhas tarefas (a aba Acordos saiu).
- **Acordos**: a "Situação dos acordos" virou um resumo fechado; a lista principal é a "A pagar".
- **Financeiro**:
  - Jurídico e Contabilidade com os mesmos 5 cartões e abas com os mesmos nomes, sem ícones.
  - **Prejuízo** virou o filtro **Perdas** dentro de Recebidos.
  - **💬 Cobrar** agora tem as opções WhatsApp e **E-mail**. O e-mail sai no modelo bonito e respeita a chave do cliente.
- **Contratos**: o quadro **Reajuste anual nos próximos 30 dias** aparece para consultorias com valor fixo.
  - O % sugerido é a variação do salário mínimo; troque se o índice for outro.
  - **Aplicar** registra o aditivo e corrige as mensalidades em aberto.
- **Ficha do cliente**: 7 abas: Resumo (com cartão CNPJ e dados fiscais) · Contatos e endereços · Sócios · Processos · Financeiro e contratos · Documentos · Histórico.
- **Cliente novo**: abre no cadastro rápido (CPF/CNPJ, nome, grupo, e-mail, telefone). **Mais dados ▾** mostra o resto.
- **CRM**: 4 colunas (Contato · Diagnóstico · Proposta · Negociação) + a faixa **Fechado / Perdido**. As etapas de dentro aparecem como selo no cartão.
- **Documentos**: selo de vencimento na pasta e na subpasta, e filtro **Vencendo em 30 dias**.
- **Alertas**: ficaram só cadastro incompleto, certidão e certificado vencendo, CNPJ irregular e as rotinas.
- **Automações**: bloco **E-mails automáticos** com a chave geral "Conferir antes de enviar".
- **Publicações**: abre sempre em **Novas**; há o botão **✓ Marcar todas como lidas**.
- **Administração**: abas Usuários · Importar · E-mail · Backup. Histórico e Acessos ficam em **⋯ Mais**.
- **Em todas as telas**:
  - Filtros em chips e abas sem ícone.
  - Datas, atraso e situação centralizados; valores à direita (o Painel continua como está).

## Backup 48 — Tarefas com os filtros do Início e Painel alinhado (sem SQL)
Ordem: **1) Merge  2) Ctrl+Shift+R**. Não tem SQL novo nem função nova.
Para voltar à versão anterior: o zip do **Backup 47** (pasta `backups/`).

- **Tarefas**: as linhas **Mostrar** (Tudo · Reuniões · Audiências · Compromissos · Tarefas · Rotinas, com as mesmas cores) e **De quem** (Todos, você, os outros)
  iguais às da agenda do Início. Saiu a fileira "Todas as pessoas / Pedro / …".
- **Painel Executivo** → Empresas do grupo: Grupo e CPF/CNPJ alinhados à esquerda; os títulos continuam centralizados.
- **Sugestões**: `sistema/SUGESTOES-B48.md` (36 itens numerados para aprovar) e o prompt pronto `sistema/PROMPT-BACKUP-49.md`.

## Backup 47 — correção da importação (sem SQL)
Ordem: **1) Merge  2) Ctrl+Shift+R**. Não tem SQL novo nem função nova.
Para voltar à versão anterior: o zip do **Backup 46** (pasta `backups/`).

- **Importar planilhas**: quando a planilha tinha o mesmo grupo escrito de dois jeitos (ex.: "Grupo Silva" e "GRUPO SILVA "), a importação parava em
  "Criando grupos…" com o aviso "Já existe um grupo com esse nome". Agora o sistema junta os dois num grupo só e continua.
  Se você usou **Substituir** e a importação parou, é só importar de novo (nada fica pela metade: o que faltou é gravado agora).

## Backup 46 — agenda colorida, Rotina (planilha lado a lado, rascunho = emitida), Usuários com "Editar", Atualizações e reset para uso real (tem SQL; nenhuma função nova)
Ordem: **1) Merge  2) SQL no Supabase (`sistema/banco/estrutura.sql`)  3) Ctrl+Shift+R**. A função `erp-emails` continua a do Backup 44.
Para voltar à versão anterior: o zip do **Backup 45** (pasta `backups/`).

- **Início (agenda)**: "Mostrar" na ordem Tudo · Reuniões (azul) · Audiências (roxo) · Compromissos (verde) · Tarefas · Rotina (laranja, também na legenda), cada botão com a cor do tipo;
  o que foi concluído aparece riscado; "De quem" = Todos, você, depois os outros (sem "Minhas"); a Lista tem a mesma altura do calendário (10 itens).
- **Painel Executivo**: "Empresas do grupo" com tudo centralizado, menos Entidade/sócio.
- **Documentos**: "+ link do Drive" na pasta do grupo e da empresa — o link 🔗 Drive aparece na frente do nome e abre numa aba nova (✎ troca ou tira).
- **Rotina → Passivo**: empresa maior, CAPAG e Conferência menores. **Processos**: legenda curta (≤ 7 dias · 8–15 · 16–30 · +30 · Nunca), Tribunal em lista, vários filtros ao mesmo tempo.
- **Rotina → Planilha**: "Pagamento" marca na hora; todas as parcelas pagas aparecem; parcelamentos da mesma empresa lado a lado, com a barra de rolagem fixa no pé.
- **Rotina → Enviar guias do mês**: exceção "Incluir clientes que emitem as próprias guias"; quando o rascunho é salvo no Gmail a guia fica **emitida** (com a data) sozinha;
  "✉ Salvar todos os rascunhos" faz isso para todos os cartões de uma vez.
- **Automações**: as que nunca foram usadas saíram da tela (e ficam desligadas).
- **Usuários**: a tabela só mostra; tudo (nome, acesso, cargo, revisor, funções, grupos do Portal) muda em **✎ Editar**. ✓ = liberar entrada, 🔑 = link de senha, 🗑 = excluir.
- **Atualizações** (menu Principal, depois de Alertas): o que mudou em cada versão, a mais nova em cima, com busca.

### Zerar o sistema para começar a usar de verdade (uma vez só)
Arquivo `sistema/banco/reset-para-uso-real.sql`. Apaga todos os dados (clientes, grupos, processos, parcelamentos, acordos, lançamentos, contratos,
tarefas, CRM, documentos, e-mails, histórico) e todos os usuários **menos o Pedro**. Mantém configurações, modelos, automações e senhas das integrações.
1. **Antes**: Administração → 💾 Backup → baixe um backup (não dá para desfazer).
2. Faça primeiro o Merge e rode o `estrutura.sql` (passo 2 acima).
3. No GitHub abra `sistema/banco/reset-para-uso-real.sql` → **Raw** → Ctrl+A / Ctrl+C → Supabase → SQL Editor → New query → Ctrl+V → **Run** → "Run this query".
   O certo é aparecer "Success". Se aparecer "PARADO", nada foi apagado (leia a mensagem).
4. Os arquivos enviados ficam no Storage: Supabase → **Storage** → `documentos` → selecione tudo → **Delete** (se o SQL não conseguiu apagar).
5. Ctrl+Shift+R no ERP → Administração → 📥 Importar planilhas → escolha cada planilha atualizada → **Substituir** → Importar.
6. Recrie os usuários da equipe em Administração → Usuários → + Novo usuário.

## Backup 45 — Rotina (envio de guias igual ao antigo + rascunho no Gmail), agenda com filtros, cargos e revisor (tem SQL; função erp-emails igual à do Backup 44)
Ordem: **1) Merge  2) SQL no Supabase (`sistema/banco/estrutura.sql`)  3) Ctrl+Shift+R**. A função `erp-emails` é a do Backup 44 (precisa estar publicada com o nome `erp-emails`).
Para voltar à versão anterior: o zip do **Backup 44** (pasta `backups/`).

- **Rotina → Enviar guias do mês** (o meio oficial de envio): igual às antigas Notificações → Parcelamento (seleção por empresa, "📨 Gerar Notificação",
  cartão E-mail × WhatsApp, ✏️ Editar · 📋 Copiar · ✉ Enviar e-mail · 💬 Enviar WhatsApp · ✉ Marcar enviado). **"✉ Enviar e-mail" salva um rascunho no Gmail**
  (o configurado em Administração → E-mail) com o texto, o e-mail do cliente e as guias anexadas no próprio cartão (📎 Anexar guias). SQL: `rascunho_email_texto`.
  O rascunho vai com o e-mail verdadeiro do cliente mesmo no modo teste (`email_rascunho_destino_real`). "Marcar enviado" registra a guia e o valor.
- **Planilha de parcelamentos**: só conferência (sem botões de envio); pagas antigas e previstas resumidas numa linha ("ver"); só o bloco que muda é redesenhado (bem mais rápida).
- **Passivo**: colunas mais equilibradas, Enter/↓/↑ descem e sobem na mesma coluna, conferência sem repetir "alterado".
- **Processos**: Tribunal (lido do número CNJ), filtros em azul (procuração, tempo sem conferir, tribunal), conferência na última coluna; "Sem novidade" é a 1ª opção da janela do ✓.
- **Sem a aba Financeiro na Rotina.**
- **Início (agenda)**: filtros que se marcam/desmarcam — Mostrar (Reuniões, Audiências, Compromissos, Tarefas, Rotinas) e De quem (Minhas, cada pessoa, Todos), respeitando o cargo;
  "+ Agendar" com tipo **Tarefa**, **Responsável** (lança para outra pessoa) e **dois avisos** (ex.: 1 dia + 30 min). A tarefa aparece também para quem valida (revisor).
- **Usuários**: **Cargo** (Sócio › Coordenador › Advogado/Contador › Assistente › Estagiário — ninguém vê a agenda de quem está acima) e **Revisor** padrão; mais modelos de acesso.
- **Painel Executivo**: valores resumidos (R$ 3k, R$ 20,0M), o completo ao passar o mouse. **Acordos**: sem emissão pela "Situação dos acordos"; o Emitir tem só "📝 Rascunho no Gmail".
- **Contabilidade**: Composição de Caixa com o verde/vermelho da Análise. **Clientes**: faixa do grupo sem a borda azul.
- **Correção**: rodar o SQL de novo com rascunhos na fila dava erro (regra antiga da situação do e-mail) — corrigido.

## Backup 44 — lateral mais estreita, Painel ocupando a largura toda e "Rascunho no Gmail" (tem SQL e função)
Ordem: **1) Merge  2) SQL no Supabase (`sistema/banco/estrutura.sql`)  3) publicar a função erp-emails  4) Ctrl+Shift+R**.
Para voltar à versão anterior: o zip do **Backup 43** (pasta `backups/`).

- **Barra lateral:** 204 px (era 240 px) — o conteúdo ganha espaço.
- **Painel Executivo:** coluna Grupo mais estreita; as colunas repartem a largura inteira (Situação vai até a borda; Operação e Situação centralizadas).
- **E-mail não saía:** a função no Supabase tinha o endereço **/functions/v1/super-worker** (criada com outro nome e depois renomeada — renomear
  NÃO muda o endereço). O ERP chama **/functions/v1/erp-emails**. Solução: criar uma função NOVA chamada `erp-emails`
  (Edge Functions → Deploy a new function → Via Editor → nome `erp-emails` → colar `supabase/functions/erp-emails/index.ts` → Deploy →
  Settings → Verify JWT desligado) e apagar a `super-worker`. A mensagem de erro do ERP agora explica isso.
- **📝 Rascunho no Gmail** (Enviar guias por empresa / Acordos → Emitir e Rotina → Enviar guias do mês): monta o mesmo e-mail (com os anexos)
  e grava na pasta **Rascunhos** do Gmail, pela mesma senha de app (IMAP, `imap.gmail.com:993`), sem enviar. SQL: status `rascunho`/`rascunho_salvo`
  em `email_fila` e `salvar_guias_rascunho(...)` (mesmos 8 parâmetros de `enviar_guias_email`); função: `{acao:'rascunho', ref}` (`imapRascunho`).

## Backup 43 — menu de volta na lateral, "Cobrar" rápido, Planilha de parcelamentos de volta e e-mail com segunda via (tem SQL)
Ordem: **1) Merge  2) SQL no Supabase (`sistema/banco/estrutura.sql`)  3) Ctrl+Shift+R**. Nenhuma função mudou nesta versão
(mas a `erp-emails` do Backup 42 precisa estar publicada — veja abaixo).
Para voltar à versão anterior: o zip do **Backup 42** (pasta `backups/`).

- **Menu:** voltou a ser a barra **lateral** com ícones (igual ao Backup 41). Única diferença: as margens dos lados ficaram um pouco menores
  (o conteúdo ganha largura nos módulos mais cheios).
- **Lentidão:** medimos as duas versões — as telas abrem no mesmo tempo e com o mesmo número de chamadas ao servidor. O que demorava era o
  **"💬 Cobrar"**: depois de copiar/abrir o WhatsApp ele recarregava todos os dados do sistema. Agora só troca o botão para "✓ Cobrado".
- **Acordos → Emitir:** saiu a lista para escolher o e-mail; o campo vem preenchido (como antes) e pode ser alterado.
- **E-mail "Não consegui falar com a função erp-emails":** o navegador não alcançou a função. As causas mais comuns:
  1. a função **erp-emails** não foi publicada/atualizada (Supabase → Edge Functions → precisa existir com esse nome exato, versão do Backup 42);
  2. **Verify JWT** ligado na função (tem que ficar **desligado**: abra a função → Details).
  Agora, quando isso acontece, o sistema pede ao **servidor** (banco) para chamar a função por dentro (segunda via) e explica o motivo.
  Confira tudo em **Administração → E-mail → "O e-mail está saindo?"**.
- **Rotina:** a **Planilha de parcelamentos** (preencher emissão, pagamento, valor da última parcela, observação, "Nós emitimos") **voltou**.
  A tela no formato das antigas Notificações ficou numa aba própria: **📨 Enviar guias do mês**.
- **SQL:** função `disparar_envio_emails()` (a segunda via do e-mail, pelo pg_net).

## Backup 42 — e-mails funcionando, menu em cima, Rotina mais simples, cobrança por WhatsApp e propostas com prévia (tem SQL e 1 função)
Ordem: **1) Merge  2) SQL no Supabase (`sistema/banco/estrutura.sql`)  3) Atualizar a função `erp-emails`  4) Ctrl+Shift+R**.
Para voltar ao visual anterior: o zip do **Backup 41** (pasta `backups/`) é a versão completa de antes.

**Atualizar a função erp-emails (obrigatório nesta versão):** Supabase → **Edge Functions** → `erp-emails` → **Code** (ou "Deploy a new version")
→ apague tudo e cole o arquivo `supabase/functions/erp-emails/index.ts` do GitHub (botão **Raw** → Ctrl+A → Ctrl+C) → **Deploy**.
Confira em Details que **Verify JWT** está **desligado**.

**Depois, uma vez:** ERP → **Administração → E-mail**. No topo aparece "✉ O e-mail está saindo?" com 6 linhas. Tudo tem que ficar ✅ (o item 3 pode ficar ⚠️).
Se o item 1 estiver ❌: preencha "Serviço de envio" (Gmail do escritório + **senha de app** de 16 letras) → Salvar → **Enviar e-mail de teste**.

- **E-mails:** agora saem **na hora** em que você clica em Enviar (antes dependiam da rotina de 5 minutos, que podia não estar ligada) e a tela mostra o resultado real
  ("✓ e-mail enviado" ou o motivo, em português: senha recusada pelo Gmail, função não publicada…). Por enquanto **todo e-mail chega só em pedromgsam@gmail.com**
  (o destinatário original aparece no assunto). A pausa antiga saiu e os e-mails velhos que estavam retidos foram descartados (não saem de uma vez).
- **Menu:** foi para a **barra de cima** (ganha espaço na largura). A lateral ficou estreita, sem ícones, mostrando as seções da tela aberta (ex.: Jurídico → Processos · Parcelamentos · Publicações).
- **Acordos → Emitir:** a janela tem **📋 Copiar texto**, **💬 WhatsApp** e **✉ Enviar e-mail**; o campo "Para" tem a **lista dos e-mails da empresa** (Financeiro, RH…) e aceita digitar.
  Texto do acordo sem "Depois de pagar, por favor nos envie o comprovante", sem novo vencimento e sem valor atualizado.
- **Rotina:**
  - **Passivo e cadastro:** sem o contorno/sublinhado azul dos grupos, sem o relógio; a **Conferência (✓) fica no fim da linha** — clicar no ✓ **salva aquela linha**
    (com alteração = "alterado"; sem alteração = "conferido"). "Salvar alterações" continua para salvar várias de uma vez.
  - **Processos:** sem o contorno azul.
  - **Controle dos parcelamentos** saiu. **Acordos** abre a própria tela de Acordos (a mesma, sem duplicar).
  - **Planilha de parcelamentos** (não é mais teste): igual à antiga **Notificações → Parcelamento** — empresas com as guias vencidas ou do mês; marque, clique em
    **Gerar mensagem**, confira o valor e envie (Copiar, WhatsApp, E-mail ou "Marcar como enviada"). O texto é o mesmo das Notificações.
- **Financeiro → A Receber:** botão **💬 Cobrar** em cada honorário: texto simples ("Bom dia! Passando para lembrar dos honorários do mês de …, referente a …") para o WhatsApp;
  ao copiar ou abrir o WhatsApp o lançamento fica **COBRADO**.
- **CRM:** a legenda do modelo aparece inteira; a proposta mostra uma **prévia ao vivo** ao lado enquanto você preenche.
- **Painel:** coluna Entidade / sócio um pouco menor.
- **SQL:** `diagnostico_email()`, pausa desligada (uma vez), `guias_texto_html` sem o pedido de comprovante, `enviar_guias_email` devolve a referência do e-mail.

## Backup 41 — mais leve: módulos sem uso removidos, Rotina rápida de novo, Painel e Acordos sem aperto, propostas completas para todos os modelos (tem SQL)
Ordem: **1) Merge  2) SQL no Supabase (`sistema/banco/estrutura.sql`)  3) Ctrl+Shift+R**.
Depois, uma vez: Supabase → **Edge Functions** → `erp-pgfn` → **Delete** (a função não é mais usada).
Para voltar ao visual anterior: o zip do **Backup 40** (pasta `backups/`) é a versão completa de antes.

- **Rotina lenta (passivo e cadastro):** o contorno azul dos grupos media cada célula de todas as tabelas a cada tecla. Agora só refaz quando as linhas mudam
  — digitar e salvar voltou a ser instantâneo (testado com 400 empresas). Salvar o passivo grava 6 linhas por vez.
- **Removidos por completo:** módulo de E-mails (tela), Aprovação de rascunho (quem tinha "Rascunho" passou a "Editar"; no Financeiro, "Ver"),
  Relatório de tarefas, PGFN pela API do SERPRO (e a função `erp-pgfn`), geradores antigos de documentos (petição, solicitação, proposta etc. — fica só a
  Central de Documentos), Relatório em PDF do menu ⋯, Fotos mensais do passivo (a evolução usa o histórico de alterações) e "Editar em tabela" de Clientes.
- **Painel:** "Em operação" virou **Operação**; tabela sem sobreposição (CNPJ, RFB, AGE e Total separados), Entidade / sócio um pouco mais estreita.
- **Acordos → A pagar:** sem a caixinha de marcar à esquerda; processo, devedor e credor podem ocupar 2 linhas.
- **Acordo por PIX:** o texto é "Acordo para pagamento" com processo, parcela, partes, vencimento, valor e a chave PIX — sem falar em guia/boleto, e sem o campo de anexar.
- **Documentos → + Enviar:** o tipo de documento voltou a ser uma lista suspensa.
- **CRM → Modelos de proposta:** todos os 8 modelos têm a versão **Completa**; cada modelo fica em uma linha (nome · Simplificada · Completa · Editar).
- **SQL:** remove as tabelas/funções de rascunho, PGFN e fotos mensais e preenche o detalhamento dos modelos de proposta (só onde estiver vazio).

## Backup 40 — agenda com horário e aviso, Documentos com subpastas, propostas completas, conciliação fora e modo noturno estilo GitHub (tem SQL)
Ordem: **1) Merge  2) SQL no Supabase (`sistema/banco/estrutura.sql`)  3) Ctrl+Shift+R**. Nenhuma Edge Function mudou.
Para voltar ao visual anterior: o zip do **Backup 39** (pasta `backups/`) é a versão completa de antes.

- **Agendar (Início e Tarefas):** quem participa = só as pessoas cadastradas e ativas (Administração → Usuários); "Ligação" saiu. Cada tipo pede o que precisa:
  **Audiência** exige o nº do processo (lista dos processos cadastrados), tipo de audiência e formato; **Reunião** pede assunto, local/link e com quem;
  **Compromisso** pede o quê e o local. Horário com **início e fim** (o fim acompanha o início + 1 h) e aviso se o horário **choca** com outro compromisso
  das mesmas pessoas. **Avisar antes** (15 min, 30 min, 1 h, 2 h, 1 dia, 2 dias): aparece na tela de quem está com o ERP aberto (e no aviso do navegador,
  se liberado) e vira notificação + e-mail pela rotina `erp_avisos_agenda` (a cada 5 minutos).
- **Tarefas:** abas Em aberto/Concluídas/Excluídas num botão compacto; Pessoa (responsável ou participante) e Prioridade em botões; Minha semana na altura do
  calendário; no calendário as concluídas aparecem riscadas.
- **Painel:** Empresas do grupo sem as faixas/contornos de grupo, coluna Grupo estreita (quebra só entre palavras) e mais espaço para Entidade / sócio.
- **Publicações:** opção "Últimos 15 dias".
- **Acordos → A pagar:** sem a caneta; botões simples **Emitir** (vira "✓ Emitido") e **Baixa** (pede confirmação); colunas redistribuídas.
- **Conciliação de extrato (OFX):** removida por completo (botão, tela e tabela `extrato_itens`). **Financeiro:** sem "Editar em tabela"; emojis trocados por ícones de traço.
- **Clientes:** área em botões; sem "Relatório"; coluna Grupo menor; cores de Pedro/Emanuelle/Escritório reconhecidas mesmo com sobrenome ou em maiúsculas (vale para o sistema todo).
- **Contratos:** os botões "Excluir · Editar" ficam presos ao pé da janela (vale para todas as janelas).
- **Documentos:** "+ Enviar" com o tipo em botões; **Certificado digital** entra por ele (pede a senha, lê a validade do arquivo); o botão "Certificado" separado saiu;
  "+ Enviar" encostado à direita; **subpastas por empresa** dentro de cada grupo; **Excluir** (com confirmação) no lugar de "Arquivar"; "Arquivados" virou "Versões anteriores".
- **Gerar documentos:** saiu de dentro do ERP — um botão só, **"Gerar documentos ↗"** em Documentos, que abre o sistema numa aba nova. Saíram os atalhos de geração no CRM,
  no contrato, na ficha do cliente e no recibo do lançamento.
- **CRM → Propostas:** escolha **Simplificada** (como sempre) ou **Completa** (com o detalhamento do serviço). O modelo **Holding e planejamento patrimonial** ganhou a versão completa
  (finalidades, cinco fases, o que não está incluído, prazo, documentos e "com franqueza").
- **Modo noturno:** fundo quase preto e cartões um tom acima, no estilo GitHub/Supabase.
- **Confirmação** antes de excluir feriado (as demais exclusões e baixas já pediam).
- **SQL:** `tarefas.hora_fim`, `aviso_min`, `aviso_em`, função `avisos_agenda()` + gatilho `tarefa_aviso_reset` + cron `erp_avisos_agenda`; `crm_modelos_proposta.texto_completo`,
  `crm_propostas.texto_completo/formato`; política de exclusão de documentos; `drop table extrato_itens`.

## Backup 39 — ajustes de visual: lateral, Início, Tarefas, Painel, Processos, Acordos, Contabilidade e Contratos (tem SQL)
Ordem: **1) Merge  2) SQL no Supabase (`sistema/banco/estrutura.sql`)  3) Ctrl+Shift+R**. Nenhuma Edge Function mudou.
Para voltar ao visual anterior: o zip do **Backup 38** (pasta `backups/`) é a versão completa de antes.

- **Barra lateral:** saiu o "A&C" (fica "Araújo & Castro / Advocacia e Contabilidade"). Ao encolher, o conteúdo cresce e as margens dos dois lados
  continuam iguais. **Rotina** foi para Módulos, logo abaixo de Documentos.
- **Início:** calendário com a altura fixa do mês também em Semana/Dia (os dias da semana esticam); sem "minimizar"; "Agendar" com nomes com inicial
  maiúscula e campo "Com quem" de texto livre (se o texto for um cliente, liga ao cliente; senão fica gravado em `tarefas.com_quem`).
  "Publicações para ler" conta só as do advogado que está logado.
- **Tarefas:** abas Em aberto / Concluídas / Excluídas no mesmo estilo de Lista / Minha semana / Quadro; Minha semana respeita a aba e tem o
  quadro "⏰ Atrasadas" igual ao do Início; calendário igual ao do Início (sem cinza depois do último dia); clicar abre o detalhe (botão Editar
  dentro dele); sem a caneta na lista.
- **Painel executivo:** Evolução abre em 6 meses; filtro de área em botões; Empresas do grupo sem CEAT, CAPAG e coluna de edição, coluna Grupo
  menor, sem sublinhado; clicar na linha abre a ficha, com "✎ Editar cadastro" em destaque no canto superior direito.
- **Processos:** chip "Todos"; sem botão de edição; cabeçalho não fica embaixo do filtro flutuante; colunas Grupo e Competência mais estreitas.
- **Acordos:** "A pagar / Pago" no estilo dos filtros de prazo.
- **Contabilidade:** linha "QUEM FEZ" (Contabilidade); comparativos com as colunas distribuídas como no Jurídico e cores corrigidas
  (a pagar em vermelho, sem faixas coloridas nas linhas).
- **Contratos:** saíram as colunas Parcelas e Anexo; Financeiro vem antes de Situação.
- **Selo da pessoa** voltou ao formato do ERP original (pílula do tamanho do nome).
- **SQL:** `tarefas.com_quem` (texto livre do Agendar).

## Backup 38 — barra lateral no padrão dos prints, Início enxuto, sem avisos, sem módulo E-mails, tarefas só manuais (tem SQL)
Ordem: **1) Merge  2) SQL no Supabase (`sistema/banco/estrutura.sql`)  3) Ctrl+Shift+R**. Nenhuma Edge Function mudou.
Para voltar ao visual anterior: o zip do **Backup 37** (pasta `backups/`) é a versão completa de antes.

- **Barra lateral** (como nos prints): Principal (Início, Tarefas, Rotina, Alertas) · Módulos (Painel, Jurídico ▾, Acordos, Financeiro ▾, Contratos,
  Clientes, CRM, Documentos ▾) · Sistema (Administração). O grupo da tela aberta fica aberto; "‹ encolher" deixa só os ícones (fica salvo).
  Barra de cima branca com o nome da tela, + Lançar, tema, ⋯, tempo da sessão, seu nome e Sair. Conteúdo centralizado, com margem dos dois lados.
- **Cores dos prints** (fundo cinza-claro, cartões brancos com borda fina, títulos quase pretos), com o **azul** no lugar do verde e sem o azul-marinho
  nos botões. O tom da lateral está num lugar só (`--lado-bg` em tokens.css).
- **Início:** só Olá, Lembretes, Resumo do escritório (ícones de traço fino) e a agenda/fila. Saíram os cartões de Honorários e a faixa
  "avisos / tarefas pedem atenção / guias / boletos".
- **Agenda:** mostra só o que está em **Tarefas**; legenda curta (Reunião · Audiência · Compromisso · Tarefa · Atrasada · ⚑ Prazo fatal); "Atrasadas"
  com a mesma altura do calendário; o **administrador** escolhe "Só as minhas / Todos / uma pessoa" (estagiário vê só as suas).
- **Tarefas:** só as que vocês lançam. Tarefa automática (documento vencendo, publicação, CRM parado, conferência…) não é mais criada e as abertas
  foram canceladas uma vez (continuam no histórico). Para religar: `update configuracoes set valor='true' where chave='tarefas_automaticas';`
- **Avisos:** o sino, o cartão que aparecia no canto e a caixa de avisos saíram.
- **Financeiro:** "Prejuízo" e "Em atraso" somam **todos os meses** (Jurídico e Contabilidade). Contabilidade ganhou o cartão Prejuízo e perdeu a
  tabela "Em atraso" que ainda aparecia.
- **E-mails:** o módulo saiu do menu (e o botão "✉ Cobrar clientes", a aba E-mails da ficha e o cartão de e-mails automáticos dos Alertas).
  **Todo e-mail vai para pedromgsam@gmail.com**, com o destinatário original no assunto: "[para fulano@cliente.com] …".
  Para voltar ao normal: `update configuracoes set valor='""' where chave='email_redirecionar';`

## Backup 37 — gerar guias com expansão, forma de pagamento dos acordos, certificado digital, sessão por inatividade, visual novo (tem SQL)
Ordem: **1) Merge  2) SQL no Supabase (`sistema/banco/estrutura.sql`)  3) Ctrl+Shift+R**. Nenhuma Edge Function mudou.

- **Início — agenda:** embaixo do calendário, marque o que aparece nele: **Tarefas, Compromissos, Lembretes, Vencimentos** (honorários, guias e acordos).
  A escolha fica salva para você.
- **Painel Executivo:** coluna **Em operação** antes da CAPAG; situação (Ativa, Baixada…) sem caixa alta. Clientes e Painel usam o mesmo tamanho de letra (13 px).
- **Parcelamentos e Acordos:** botão **🧾 Gerar guias** em três lugares: geral (todos os grupos do filtro), dentro do grupo aberto (só aquela empresa/grupo) e em
  cada linha. Abre a janela de envio por empresa com vencimento e valor atualizado. Se não houver nada vencido nem do mês, pergunta se quer emitir as próximas.
  O seletor "Todos os grupos" saiu (use o filtro do alto, à direita).
- **Acordos:** filtros **Vencidas · 5 · 10 · 15 · 30 dias · até [data]** na tabela de baixo; sem "Situação"; o "✓ emitido" fica ao lado do Emitir.
  No cadastro do acordo: **Forma de pagamento — Boleto ou PIX** (vale para todas as parcelas daquele acordo). O e-mail sai no formato pedido
  (PIX: "Processo | Parcela 8ª de 40 / Partes / Vencimento / Valor / PIX"; boleto: "Seguem as parcelas de acordos da X…" com o boleto anexo).
- **Financeiro:** sem a tabela "Em atraso" (o cartão continua); linhas de A receber/Recebidos mais baixas.
- **CRM:** sem "Painel"; abas (Em andamento, Ganhos…) no mesmo estilo escuro dos outros filtros; **Responsáveis** como filtro.
- **Documentos:** cada grupo tem **+ Enviar** e **🔐 Certificado** na própria barra. O certificado (.pfx/.p12) é lido no seu navegador com a senha:
  o sistema mostra **titular e validade** e guarda a senha (só a equipe vê). Alerta "Certificado digital vencendo" 30 dias antes.
- **Sessão:** só sai depois de **60 minutos sem uso** (cada clique/tecla recomeça). Contador discreto na barra de cima (⏱58′).
- **Central de Documentos:** sem o título "📜 Procuração…" na coluna da esquerda, que ficou mais larga.
- **Alertas:** saíram Sem contato, CAPAG D, Documentos vencendo e a leitura de arquivo da PGFN; situação irregular não conta Baixada;
  "Busca de publicações (web)" mostra a última busca feita pelo navegador.
- **Rotina:** Passivo sem "Em operação" e CAPAG sem cortar "OMISSO"; Processos mostra o **valor atual** ao lado do novo; **Controle dos parcelamentos voltou a
  funcionar** (o Supabase entrega no máximo 1000 linhas por vez — agora o sistema busca em páginas); "Ver todas as parcelas" do acordo abre a mesma ficha
  de Acordos; **Planilha** = lista Nº · Vencimento · Emissão · Pagamento com as datas, alinhada, com **🧾 Emitir** também nas futuras (da parcela, do parcelamento
  ou da empresa).
- **E-mails de guias:** no mesmo padrão visual de "Honorários em aberto" (parágrafos + caixa "Como pagar" com o PIX).
- **Visual:** cabeçalho das tabelas claro, títulos maiores, cartões com o número em cima e linha de cor no alto (inspirado nos prints, em azul).

## Backup 36 — agenda no Início, cartões mais claros, Rotina refeita, Documentos e E-mails no visual do ERP (tem SQL)
Ordem: **1) Merge  2) SQL no Supabase (`sistema/banco/estrutura.sql`)  3) Ctrl+Shift+R**. Nenhuma Edge Function mudou.

- **Início — agenda:** botão **+ Agendar** (ou clique num dia vazio do calendário) para marcar reunião, audiência, compromisso ou ligação, com hora, local e
  quem participa. Legenda de cores embaixo do calendário (tarefa, atrasada, prazo fatal, reunião, audiência, compromisso, ligação).
- **Painel Executivo:** a evolução do passivo abre em **Tudo junto**; os meses antes do primeiro lançamento não aparecem mais (era isso que fazia a linha
  "cair para zero" perto de outubro). Contorno do grupo nas tabelas contínuo, sem falhas.
- **Processos:** as últimas movimentações aparecem em cartõezinhos separados (data, tipo, texto e quem lançou).
- **Parcelamentos e Acordos — Situação:** cartões maiores e mais arejados; o cartão aberto fica com borda azul e "aberto ▲"; ao abrir aparece uma
  tabela limpa (Empresa · Pagas · Falta · A pagar este mês · Situação). "A pagar este mês" = **vencidas + as do mês**. Com grupo e empresa no filtro,
  já aparecem os cartões da empresa. No detalhamento, colunas separadas **Emissão** e **Pagamento**; "Lançar pagamento" pede confirmação.
- **Acordos:** sem a coluna Responsável, Grupo mais estreito, botão **🧾 Emitir** (abre o envio com e-mail e WhatsApp: "Acordo · parcela · valor · PIX")
  e **👁 Prévia do e-mail** (igual ao módulo E-mails).
- **Rotina → Controle dos parcelamentos:** um quadrinho por parcela em cada mês (**Emitir · Emitida · Vencida · ✓ Paga · A vencer · Cliente emite**).
  Clique no quadrinho → menu: **Marcar para enviar**, **Lançar pagamento** (com confirmação) e **Ver parcelas / editar valor**.
- **Rotina → Planilha (teste):** blocos lado a lado que descem até a última parcela (as que ainda não estão lançadas aparecem como "prevista"), cabeçalho
  em cartão e o botão **Emitir guias — em atraso + vencem neste mês** sempre clicável (avisa quando não há nada a emitir).
- **Publicações:** os números dos filtros batem (ex.: 61 no total, 5 tratadas → Novas 56 · Tratadas 5 · Todas 61), também nos advogados e tribunais.
- **Documentos:** visual do ERP (seções em cartões, botões no lugar de listas curtas, "Hoje" nas datas), barra de modelos sem rolar para o lado,
  **Histórico** e **⚙ Configurações** (antigo "Escritório", agora em cartões: escritório + um cartão por advogado) no alto.
- **E-mails → Quem recebe:** uma linha por cliente com um sinal por tipo (✓ recebe · ! sem e-mail · – não recebe), o e-mail principal e o perfil;
  contador "com e-mail faltando"; a regra geral por setor fica recolhida embaixo. Clique no cliente para escolher os contatos de cada tipo.

## Backup 35 — mais simples: cartões por grupo, Acordos em uma aba, planilha de parcelamentos (teste), evolução por grupo, processos com movimentações (tem SQL)
Ordem: **1) Merge  2) SQL no Supabase (`sistema/banco/estrutura.sql`)  3) Ctrl+Shift+R**. Nenhuma Edge Function mudou.

- **Painel Executivo:** "Evolução do passivo" com uma linha por grupo; com um grupo no filtro do topo, uma linha por empresa; "Tudo junto" soma numa linha.
  As tabelas agrupadas (Painel, Clientes, Processos…) ganham o contorno completo do grupo (dos dois lados).
- **Processos:** a janela do processo mostra as 3 últimas movimentações e "Valor da causa … · atualizado em dd/mm/aaaa" (data própria do valor).
- **Parcelamentos e Acordos — Situação:** os números viram uma faixa só e a lista vira **cartões por grupo** (com grupo filtrado: por empresa).
  Clique no cartão → os itens abrem logo abaixo; clique no item → a ficha (dados alinhados) e as parcelas com **＋ Lançar pagamento**.
- **Acordos:** uma aba só **A pagar** (vencidas + a vencer, até alguém dar o pagamento) com Grupo e Responsável, botão **🧾 Boleto** em cada parcela e
  caixinhas para marcar várias e **✉ Enviar por empresa**. A aba "Pago" continua.
- **Rotina → Controle dos parcelamentos:** os quadradinhos agora dizem **Emitiu / Pagou**, há um passo a passo no alto e o **valor residual** de cada parcelamento.
- **Rotina → 🧪 Planilha de parcelamentos (teste):** igual à planilha do escritório (uma aba por grupo, um bloco por parcelamento com Nome, CPF/CNPJ,
  Local, Natureza, Nº, Total, Pagas, Valor da última parcela, Valor residual, Emitimos, Obs. e a lista Parcela · Vencimento · Emissão · Pagamento).
  Botão **🧾 Emitir guias — em atraso + vencem neste mês** abre o envio por empresa. Se não gostar, é só pedir para apagar.
- **Publicações:** filtro por advogado em botões (nomes das OABs cadastradas em Monitoramento); número do tribunal legível no botão escuro.
- **Gerar documento:** os modelos ficam numa barra no alto (o formulário ganha espaço). O PDF já sai com logo e rodapé em todas as páginas.
- **E-mails:** tela mais simples — uma faixa com a pausa e os e-mails de teste, 3 abas (E-mails · Quem recebe · Ajustes) e "Meus avisos" no alto.
- **Geral:** cartões, títulos e números um pouco menores.
