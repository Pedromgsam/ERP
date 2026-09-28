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
Os avisos por e-mail, a busca de publicações, o cartão CNPJ, a agenda do Google e o backup semanal rodam em cinco
"funções" dentro do Supabase.

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
