# Comparativo do Backup 84 — ambiente de teste (v5) × ERP real

Para você escolher o que levar ao ERP. Responda com os códigos (ex.: "TB3, PA4, DO1"). Página para marcar e copiar: https://claude.ai/artifact/Nd1pQv19qBGnnjfkrmLkqX
Feito por leitura do código das duas versões, depois das mudanças do Backup 84.


Comparei o código das duas versões, sem abrir nenhuma das duas no navegador. Não repeti o que você já decidiu manter diferente: a barra do alto sem campo de busca, o Início sem calendário, os grupos da lateral que abrem e fecham, as escolhas de grupo e empresa no Painel, as vistas Calendário e Fluxos em Tarefas, a coluna "Status" em Processos, e as telas atuais de Clientes, CRM e Rotina. Nessas três últimas, deixei só uma nota curta.

Como ler: **[amb]** = só no ambiente · **[ERP]** = só no ERP · **[dif]** = existe nos dois, mas diferente.

---

## Peças comuns (tabelas, cartões, janelas, filtros)

### Tabela (a do ambiente × a do ERP)
- **TB1** [dif] Número nas abas: no ambiente só aparece quando a tela pede; no ERP aparece sempre, a não ser que a tela desligue. Por isso o ERP mostra números em abas onde o ambiente não mostra (janela do parcelamento e do acordo, Processos, Contratos, Execuções).
- **TB2** [dif] Contador ao lado da busca ("N linhas"): o ambiente mostra sempre; o ERP só nas telas que pedem.
- **TB3** [dif] "Marcar várias": no ambiente as caixinhas só aparecem depois do botão. No ERP isso só vale para Financeiro e Guias; nas outras telas com marcação, as caixinhas ficam sempre à vista.
- **TB4** [dif] Barra das marcadas: o ambiente mostra "Marque as linhas" mesmo sem nada marcado; o ERP só mostra quando há linha marcada.
- **TB5** [dif] Painel "Filtros": no ambiente cada lista tem o nome escrito em cima (ex.: "Grupo", "Plataforma"); no ERP as listas aparecem sem nome visível.
- **TB6** [dif] "Limpar filtros" e "Mostrar mais 150": botões no ambiente, links no ERP.
- **TB7** [amb] Ao ligar a tabela compacta, aparece o aviso "Tabelas compactas: mais linhas na tela."
- **TB8** [amb] Cada linha da faixa do Início abre a tela já filtrada na aba e no prazo certos (para todos os itens). No ERP isso só acontece em parte (Tarefas → Atrasadas, Publicações → Novas).
- **TB9** [ERP] Colunas que mudam com a aba (no Financeiro: "Vencimento" vira "Pago em" e a coluna Prazo some nas abas de pagos).
- **TB10** [ERP] Botão "Atualizar" (só o ícone) no cabeçalho de Parcelamentos, Acordos e Execuções.
- **TB11** [ERP] "Filtro suspenso" no alto (Grupo/Empresa, Grupo/Devedor, Grupo/Competência) em Parcelamentos, Acordos e Processos.
- **TB12** [ERP] "Minimizar / Mostrar" na seção "Situação por cliente" (Parcelamentos e Acordos).

### Cartões por grupo ("Situação por cliente")
- **CG1** [dif] Tabela que abre embaixo do cartão: no ambiente não tem barra (nem busca, nem Filtros); no ERP tem busca, Filtros (valor) e o botão compacto.
- **CG2** [ERP] Coluna "Próxima" (data da próxima parcela) na lista do grupo em Parcelamentos.

### Janelas
- **JN1** [dif] Botão de fechar: ícone "X" desenhado no ambiente; caractere "×" no ERP.
- **JN2** [amb] Janela com abas embutidas (usado na ficha do cliente).
- **JN3** [dif] Confirmações: no ambiente todas são janelas dentro da página. No ERP várias ainda usam a caixinha do navegador: apagar lembrete, excluir tarefa de vez, desmarcar pagamento, desmarcar emissão, conferir na Rotina, aplicar reajuste.
- **JN4** [dif] "Desfazer": no ambiente vem em todo salvar, editar e excluir. No ERP só nas baixas, em "Concluir" do Início, nas conferências da Rotina e em "Desmarcar pagamento".
- **JN5** [dif] Janela de baixa: no ambiente tem o título "Lançar o pagamento desta parcela?", um resumo (descrição, nº, vencimento, valor) e o aviso "O recibo em PDF vai sozinho para…". No ERP o título é "Recebido/Pago — confirme a data" e há uma linha só de descrição e valor.
- **JN6** [ERP] Na baixa de acordo, quando o comprovante foi anexado ("Sim"), pede o "ID do documento no processo".
- **JN7** [dif] Emojis: o ambiente não tem nenhum. O ERP ainda tem vários em títulos e botões (🧾 Emitir, 💬 Cobrar, 📌 Lembrete, 🔔, 📇 Contatos, 🏛 Passivo, ⚖ Processos, ✎ Editar, 📋 Copiar, 🔀 Fluxo, ⚙, 📅, 📨, 👁, 🔗).

### Busca geral (Ctrl+K) e ajuda
- **BG1** [dif] Busca: o ambiente abre uma caixa de comandos que já lista telas e ações antes de digitar, com resultados agrupados (Telas, Ações, Clientes…). O ERP abre uma janela que só procura a partir de 2 letras, com uma etiqueta de tipo em cada resultado.
- **BG2** [amb] Atalhos de teclado "/" (busca), "?" (ajuda) e "N" (novo item na tela).
- **BG3** [ERP] A busca também acha grupos (abre o Painel), acordos e tarefas.
- **BG4** [dif] Ajuda "?": no ambiente é uma gaveta lateral com a parte "Atalhos"; no ERP é uma janela no centro, só com a dica do Ctrl+K.

### Barra do alto e lateral
- **BL1** [ERP] "+ Lançar" com 15 opções, "⋯" (Atualizar dados, Meu nome), contador da sessão (⏱N′) e "Sair".
- **BL2** [amb] Botão "Aa" para ver os textos antigos (é do teste).
- **BL3** [dif] Nome da marca na lateral: "ERP · ambiente de teste" no ambiente; "Advocacia e Contabilidade" no ERP.
- **BL4** [ERP] Botão "encolher" a lateral.
- **BL5** [ERP] Menu de baixo no celular (Início · Painel · Financeiro · Lançar · Mais); no ambiente o celular usa um botão que abre a lateral.
- **BL6** [dif] Números no menu: o ambiente conta no Início (pendências) e em Publicações; o ERP conta em Tarefas (minhas atrasadas), Parcelamentos (vencidas) e Publicações, e soma no grupo fechado.

---

## Início
**Visual**
- **IN1** [dif] Faixa Financeiro: no ambiente são 2 itens ("honorários em atraso", "a pagar em 5 dias"). No ERP vem separado por Jurídico e Contabilidade ("de honorários em atraso · Jurídico", "vence hoje · …", "a pagar em atraso", "a pagar em 5 dias"), e mostra "Nada em atraso nem vencendo hoje" quando não há nada.
- **IN2** [dif] Faixa Escritório: no ambiente aparecem guias a emitir, parcelas de parcelamento e de acordo em atraso, publicações, tarefas atrasadas, e-mail com erro e certificado vencendo. No ERP aparecem parcelas e acordos em atraso, publicações, tarefas e "oportunidades em andamento" (CRM), mais os avisos que vinham da tela Alertas e as conferências.
- **IN3** [amb] Frase "Nada pendente aqui. Tudo em dia." quando a faixa está vazia. No ERP a linha Escritório fica vazia.
- **IN4** [ERP] Cartão de validações (tarefas para eu validar) acima da faixa.
- **IN5** [dif] Item do "Meu dia": no ambiente o prazo aparece como "N d atraso" ou "hoje"; no ERP aparece a data (dd/mm) e a hora.
- **IN6** [dif] "Próximos 7 dias": o ambiente lista todos; o ERP mostra 6 e o link "Ver as N em Tarefas".
- **IN7** [dif] Lembrete: no ambiente tem a faixa de cor e o botão "Feito". No ERP tem "📌 Fixar/Fixado", "✓ Feito", "×" para apagar, o link "Todos (N)" e "+ N lembretes mais adiante — ver todos".

**Funcionalidade**
- **IN8** [ERP] Janela "Todos os lembretes" (fixados, mais adiante, concluídos em 90 dias, Reabrir) e janela de detalhe do lembrete.
- **IN9** [dif] Formulário do lembrete: no ambiente é texto, dia e cor. No ERP é texto, com/sem prazo, data, repete, para quem, destaque e fixar.
- **IN10** [dif] "Ver como": no ambiente qualquer pessoa troca; no ERP só o administrador.
- **IN11** [amb] "Concluir" de tarefa com revisor manda para validação, com o aviso "Tarefa enviada para X validar". No ERP a validação acontece no banco, sem esse aviso.

## Tarefas
**Visual**
- **TF1** [amb] Atalhos de prazo (Todas · Vencidas · 5 · 10 · 15 · 30 · até) na aba "Em aberto". O ERP tirou no Backup 84.
- **TF2** [dif] Filtros: no ambiente, Pessoa, Tipo e Prioridade ficam dentro de "Filtros". No ERP ficam acima da tabela, em todas as vistas: chips "Mostrar" (Tudo/tipos) e as listas "De quem" e "Urgência". Dentro de "Filtros" do ERP fica só "Status".
- **TF3** [ERP] Aba "Excluídas", com "↩ Restaurar" e "Excluir de vez".
- **TF4** [ERP] Botões "⚙" (Modelos de fluxo, Feriados, 📅 Google Agenda) e "🔀 Fluxo" no cabeçalho.
- **TF5** [dif] Linha de baixo da tarefa: no ambiente só "repete …" ou "aguardando validação de …". No ERP: grupo, "↳ parte de", cliente, processo, etiquetas, status, repetição e a barra de progresso.

**Funcionalidade**
- **TF6** [amb] "Marcar várias" → "Concluir as marcadas".
- **TF7** [amb] "Desfazer" ao concluir na tabela. No ERP só aparece "✓ Tarefa concluída".
- **TF8** [dif] Clique na tarefa: no ambiente abre direto o formulário curto (O que fazer, Pessoa, Prazo, Tipo, Prioridade, Repetir, Quem valida). No ERP abre a ficha da tarefa (`abrirTarefa`), e o formulário dela é bem mais completo.
- **TF9** [dif] Semana: no ambiente é uma grade simples de 7 dias, com a nota "Atrasadas não aparecem aqui". No ERP dá para arrastar as tarefas entre os dias.

## Painel Executivo
**Visual**
- **PE1** [dif] Duas últimas colunas de "Empresas do grupo": no ambiente são "Negociado" (Sim/—) e "CAPAG" (pílula). No ERP são "Operação" (Sim/Não) e "Situação" (cadastral).
- **PE2** [dif] Filtros da tabela: no ambiente, Grupo e Área. No ERP, Área, Operação e Situação.
- **PE3** [dif] Números do alto: no ERP, Parcelamentos, Acordos e Passivo em disputa têm um texto pequeno embaixo ("N ativos", "N parcelas", "N processos"); no ambiente não.
- **PE4** [amb] "Passivo em disputa" sempre em vermelho e "Ativo em disputa" sempre em verde. No ERP só ficam coloridos quando o valor é maior que zero.

## Processos
**Visual**
- **PR1** [amb] Coluna "Conferido" (data colorida ou "nunca").
- **PR2** [dif] Texto embaixo do nº do processo: tribunal no ambiente; competência no ERP.
- **PR3** [ERP] "em dd/mm/aaaa" embaixo do valor.
- **PR4** [dif] Filtros: no ambiente, Grupo, Tribunal, Natureza e Conferência (sem conferir há 15 dias). No ERP, Grupo, Competência, Natureza e Advogado (não tem Conferência).

**Funcionalidade (janela do processo)**
- **PR5** [dif] Cabeçalho: no ambiente tem "Processo · tribunal" em cima, o nº, o cliente e o grupo, e a pílula Ativo à direita. No ERP é só "Processo nº…", sem pílula de situação.
- **PR6** [amb] Botões "Ficha do cliente" e "Conferido, sem novidade" na janela.
- **PR7** [ERP] Blocos Observação, Distribuição, Procuração e Prescrição; "por <quem>" em cada movimentação.
- **PR8** [dif] Botões: "Registrar movimentação" e "Editar" no ambiente; "+ Registrar movimentação" e "✎ Editar processo" no ERP.

## Parcelamentos
**Visual**
- **PA1** [dif] Janela do parcelamento: no ambiente a ficha tem 4 campos (Empresa, CNPJ, Plataforma, Quem emite). No ERP tem 8 ou 9 (CPF/CNPJ, Plataforma, Natureza, Nº, Total de parcelas, Valor da parcela, Valor residual, Guias, Observação).
- **PA2** [dif] Botões da janela: "Ficha do cliente" + "Emitir (N)" + Fechar no ambiente. "Editar dados do parcelamento" + "Emitir guias (N)" + Fechar no ERP (sem "Ficha do cliente").
- **PA3** [dif] Tabela de parcelas da janela: no ERP tem o título "Parcelas", Filtros (vencimento e valor) e um "*" no valor ainda não lançado. As abas se chamam "A pagar · Pagas · Todas" no ambiente e "A pagar · Pago · Todas" no ERP.

**Funcionalidade**
- **PA4** [dif] Clique numa parcela da tabela: no ambiente abre a janela do parcelamento. No ERP abre uma janela pequena da parcela (Guia, Pagamento, "Desmarcar o pagamento", "Editar", "Ver o parcelamento inteiro").
- **PA5** [dif] "Emitir": no ambiente abre uma janela com TODAS as guias da mesma empresa a emitir. Ela tem os passos 1-2-3, "Anexar" PDF por guia, lê valor e vencimento do PDF (e mostra se mudou), texto editável, "Só marcar como emitida" e "Salvar no rascunho" ou "Enviar agora", conforme a configuração. No ERP a janela é de uma parcela só, com valor digitado, anexo opcional (não lê o PDF), "Enviar ao cliente por e-mail agora" e campo "Para".
- **PA6** [ERP] Parcela vencida → janela "↻ Reenviar guia vencida", com novo vencimento e valor atualizado.

## Acordos
- **AC1** [ERP] Filtro "Credor" dentro de "Filtros" (além de Grupo e Forma de pagamento).
- **AC2** [dif] Janela do acordo: no ambiente a ficha tem 4 campos e os botões "Alterar o acordo inteiro" + Fechar. No ERP tem 8 campos (+ Responsável, Chave PIX, Banco, Grupo) e os botões "✎ Alterar o acordo inteiro" + "Emitir (N)" + Fechar.
- **AC3** [dif] Clique numa parcela: no ambiente abre a janela do acordo. No ERP abre a janela da parcela (Emissão, Pagamento, "Detalhe completo", "✎ Só esta parcela", "✎ O acordo inteiro", Desmarcar).
- **AC4** [dif] "Emitir": no ambiente é a mesma janela de anexar PDF e ler o valor. No ERP é a janela antiga de envio (e-mail, rascunho, WhatsApp, PIX).

## Execuções
- **EX1** [ERP] Botão Atualizar; Filtros Grupo e Situação; situações "Em acordo" e "Suspensa" (o ambiente só tem Em andamento ou Encerrada).
- **EX2** [dif] Janela da execução: no ambiente tem o executado no título, "Cliente: …" embaixo, 3 números (Valor executado, Recebido, Honorários), a lista de recebimentos e o botão "+ Recebimento". No ERP o título é "Execução nº — cliente" (sem o texto pequeno em cima), tem 4 números (+ "Falta receber") e uma tabela de recebimentos com "No Financeiro", "Repassado ao cliente" e ✕.
- **EX3** [ERP] Quadro "📇 Contatos (não clientes)" e "✎ Editar execução".
- **EX4** [dif] Novo recebimento: no ambiente só valor e data. No ERP também "Como foi recebido", "Repassado em", honorário manual, observação e a prévia do honorário.

## Publicações
- **PU1** [ERP] Situações "Tratadas" e "Descartadas", com os botões "Tratada" e "Descartar".
- **PU2** [ERP] Escolha de período (7, 15, 30, 90 dias ou tudo).
- **PU3** [ERP] Botões "⚙ Monitoramento (OABs e clientes)" e "↻ Buscar agora".
- **PU4** [ERP] "Última busca: …" no lugar da frase do cabeçalho.
- **PU5** [ERP] No cartão: órgão e classe, pílula "no ERP", "OAB nº", "📋 Copiar", palavras destacadas, "ver tudo" e "Abrir no Diário".
- **PU6** [dif] "Criar tarefa": no ambiente sempre "(5 dias úteis)". No ERP o prazo é sugerido pelo texto ("+ Criar tarefa (N dias úteis)") e a publicação vira "tratada".
- **PU7** [dif] Filtros: no ambiente, Advogado e Tribunal ficam na mesma linha. No ERP, cada um tem a sua linha.

## Financeiro (Jurídico e Contabilidade)
**Visual**
- **FI1** [ERP] Abas "Caixa" e "Distribuição de lucros" na Contabilidade.
- **FI2** [ERP] Avisos acima do conteúdo ("N honorários vencidos · R$", "Prejuízo: R$").
- **FI3** [dif] "Lançar": no ambiente é um botão que abre o formulário com a escolha Receita/Despesa. No ERP é um menu (Receita / Despesa).
- **FI4** [dif] Abas dos Lançamentos: no ambiente o Jurídico tem A receber · Recebidos · Prejuízo · Comissões, e a Contabilidade tem A receber · Recebidos · A pagar · Pagos. No ERP: A receber · Recebido · (A pagar · Pago) · Perdas. O ERP não tem a aba "Comissões"; o redutor aparece só com a palavra "redutor" embaixo do valor.
- **FI5** [dif] Filtros dos Lançamentos: no ambiente, Quem, Grupo e Tipo de serviço. No ERP, Quem, Grupo, Tipo, Área, Referência e Favorecido.
- **FI6** [dif] Coluna de data nas abas de pagos: no ambiente continua "Vencimento" (com a data paga) e a coluna Prazo mostra "✓ Pago em". No ERP vira "Pago em" e a coluna Prazo some.
- **FI7** [dif] Análise: o ERP tem o título "Análise do período" com explicação e, na linha de filtros, as listas Tipo e Grupo. Também tem o período "Ano passado".
- **FI8** [dif] Números da Análise: no ambiente, a Contabilidade tem Ticket médio e não tem Prejuízo. No ERP, a Contabilidade tem Prejuízo e não tem Ticket médio.
- **FI9** [dif] Gráfico da Contabilidade: no ambiente é "Recebido mês a mês" por pessoa, sempre 7 meses. No ERP é "Recebido × pago mês a mês" e segue o período escolhido.
- **FI10** [amb] "Comparativo por pessoa" também na Contabilidade.
- **FI11** [ERP] "Resultado do mês" também no Jurídico, quando há despesas pagas.

**Funcionalidade**
- **FI12** [dif] Clique no lançamento: no ambiente abre direto o formulário de edição (com "Virou prejuízo" e "Excluir"). No ERP abre o detalhe do lançamento ("Abrir contrato", "Ficha do cliente", "🧾 Recibo", "✎ Editar", "✓ Recebido").
- **FI13** [dif] "Recibo": no ambiente você escolhe um recebimento recente, vê uma prévia e tem "Mandar por e-mail". No ERP abre a Central de Documentos (modelo recibo).
- **FI14** [ERP] "Cobrar as marcadas" (vários clientes, um texto por cliente) e a "👁 Prévia" do e-mail de cobrança.

## Contratos
- **CT1** [ERP] Quadro "Reajuste anual nos próximos 60 dias" no alto, com % editável e "Aplicar".
- **CT2** [ERP] Aba "Cancelados"; colunas "Recebido" e "Financeiro"; Filtros Tipo e Financeiro.
- **CT3** [dif] Janela: no ambiente tem 4 campos, a tabela "Lançamentos deste contrato", "Marcar como assinado" e "Aplicar reajuste" (4,83%). No ERP é a "📄 Ficha do contrato" completa (aditivos, êxito, documentos, "+ Lançar valor avulso", "🔗 Ligar lançamentos", Rescindir, Excluir, Editar).

## Clientes e ficha do cliente
- Tela Clientes: mantida a do ERP, por sua escolha. Referência: o ambiente usa a tabela nova (Grupo, Cliente, Área, Responsável, E-mail, Recebe e-mails); o ERP tem "Por grupo/Lista", CPF/CNPJ, Procuração, Certificado e Situação.
- **CL1** [dif] Abas da ficha: no ambiente, Resumo · Parcelamentos · Acordos · Processos · Financeiro · Documentos · E-mails · Linha do tempo. No ERP, Resumo · Contatos e endereços · Sócios · Processos · Financeiro e contratos · Documentos · Histórico.
- **CL2** [amb] Na ficha: abas Parcelamentos e Acordos (com Emitir e Baixa) e aba E-mails (enviados, rascunho, erro); "Documentos do mês: recebido/falta".
- **CL3** [ERP] Na ficha: Contatos, Sócios, etiquetas, "+ Lançar ▾" (tarefa, lançamento, documento, interação, reunião, indicação, CRM), WhatsApp e E-mail.
- **CL4** [dif] Botões: no ambiente ficam no rodapé ("Ver como o cliente vê", "Editar cadastro", Fechar), com a pílula "Recebe e-mails" no alto à direita. No ERP ficam no topo ("✎ Editar cadastro" e a fila de botões).

## CRM
- Mantida a do ERP, por sua escolha. Diferenças que sobram: o ERP tem as abas Em andamento / Contratos assinados / Leads perdidos, Funil/Lista, filtros de responsável, origem e busca, e o menu ⋯. O ambiente tem só as 4 colunas e a faixa Ganhos/Perdidos.

## Documentos
- **DO1** [dif] Formato da tela: o ambiente tem a faixa "Vencendo em 30 dias" e UMA tabela (Cliente, Arquivo, Tipo, Enviado em, Validade com prazo colorido), com Filtros Tipo e Grupo. O ERP ainda está no formato antigo: botões Ativos / Vencendo / Versões anteriores, listas de tipo, grupo e cliente, chips por tipo e pastas por grupo que abrem e fecham.
- **DO2** [dif] Clique no arquivo: no ambiente abre a ficha do cliente na aba Documentos. No ERP abre a pasta e o arquivo.
- **DO3** [ERP] "Versões anteriores" (arquivados).

## Rotina (mantida a do ERP, por sua escolha — só o que mais se nota)
- **RO1** Passivo [dif]: no ambiente Procuração, Certificado e CAPAG são só leitura. No ERP são editáveis, com "CEAT", "🔑 senha GOV", o filtro "Sem certificado / Sem procuração / Sem CAPAG" e o título "🏛 Passivo e cadastro das empresas".
- **RO2** Processos [dif]: o ambiente usa a tabela nova (abas Para conferir / Conferidos 15 dias / Todos, botões "Movimentação" e "Sem novidade" na linha, Grupo na tabela). O ERP usa quadro com botões Com/Sem procuração e conferidos ≤7/8–15/16–30/+30/Nunca, colunas Tribunal, Procuração e Valor, e "✓ Conferir o grupo todo".
- **RO3** Guias do mês [dif]: no ambiente "Emitir e mandar" abre a janela de anexar e ler o PDF. No ERP abre cartões na própria tela (texto editável, WhatsApp, "✉ Salvar todos os rascunhos", "← Voltar à seleção"). O ERP também tem busca e grupo acima da tabela.
- **RO4** Planilha e Minhas tarefas: parecidas; no ambiente, os chips dos grupos mostram o número de guias a emitir.

## Administração (inclui E-mails)
- **AD1** [dif] Abas: no ambiente, E-mails · Usuários · Importações · Saúde do sistema · Backup (+ Ambiente de teste), abrindo em E-mails. No ERP, Usuários · Importar · E-mail · Saúde do sistema · Backup · Histórico · Acessos, abrindo em Usuários.
- **AD2** [amb] Importações com "Reverter" uma importação inteira. O ERP tem "Substituir" na hora de importar.
- **AD3** [dif] E-mail → Como funciona: no ambiente as 3 chaves (Lembrete de honorário, Cobrança educada, Recibo) ficam ali, além da tabela "O que muda em relação a hoje". No ERP aparece a lista com pílulas ligado/desligado e o botão "Ligar ou desligar em 'O que sai e quando'".
- **AD4** [dif] O que sai e quando: no ambiente são 2 colunas; a de clientes inclui os 2 manuais com Rascunho/Direto e um campo de **dias** para o lembrete e para a cobrança, e a equipe tem 10 chaves. No ERP a equipe vem primeiro (11 caixas com descrição), clientes = regras automáticas, **sem campo de dias**, e os manuais não aparecem.
- **AD5** [dif] Quem recebe: no ambiente é a tabela nova (abas Todos/Recebem/Não recebem/Sem e-mail) com o e-mail digitado direto na linha e **uma chave por cliente**. No ERP ainda está a grade com 6 colunas ✓/✕ por tipo de e-mail, ✎ numa janela, "Último e-mail" e a faixa do grupo.
- **AD6** [dif] Caixa de saída: no ambiente, abas na tabela e o botão "Tentar de novo" (ou "abra o Gmail → Rascunhos"). No ERP há chips com números, a chave "Revisar antes de sair", "Descartar todos / Enviar todos", "Autorizar e enviar os da Rotina" e 👁 prévia.
- **AD7** [dif] Usuários: no ambiente é uma tabela simples (Nome+e-mail, Cargo, Acesso). No ERP é a tela completa (funções, revisor, cargos, acessos).

## Portal do cliente
- **PT1** [ERP] Aba "Processos" no portal (no ambiente não há).
- **PT2** [amb] Botão "Falar com o escritório" (WhatsApp) no topo do portal. O ERP tem só o texto "Alguma dúvida? Fale com o escritório…".
- **PT3** [amb] "Baixar" recibo nos honorários pagos e "Baixar" contrato. O ERP não tem esses dois botões.
- **PT4** [dif] Contratos: lista simples no ambiente; tabela no ERP (Contrato, Tipo, Desde, Valor, Situação).

## Textos que mudam
- **TX1** [dif] Título do Financeiro: "Financeiro · Jurídico" nos dois; a frase da Contabilidade no ERP é "A receber, a pagar, caixa e distribuição de lucros da contabilidade." (no ambiente, "Honorários a receber, recebidos e contas a pagar").
- **TX2** [dif] "E-mails" (ambiente) × "E-mail" (ERP); "Importações" × "Importar"; "Prejuízo" × "Perdas"; "Recebidos/Pagos" × "Recebido/Pago"; "Pagas" × "Pago" nas janelas.
- **TX3** [dif] Janela de baixa: "Confirmar pagamento / Lançar o pagamento desta parcela?" (ambiente) × "Pagamento da parcela — confirme" e "Recebido — confirme a data" (ERP).
- **TX4** [dif] Botão do Início: "Lembrete" nos dois; dentro da janela, "Novo · Lembrete" no ambiente × "📌 Novo lembrete" no ERP.

---

**Resumo:** o que mais pesa em funções é a janela de **Emitir** do ambiente (várias guias da mesma empresa, lê o PDF e respeita rascunho ou direto), que no ERP só existe na Rotina → Guias do mês. Em seguida vêm o **Desfazer em tudo** e as **confirmações dentro da página**. No visual, o que mais destoa é **Documentos** (ainda no formato antigo) e as abas **Quem recebe / O que sai e quando** de E-mails.
