# Backups do sistema (uma cópia por versão publicada)

Cada arquivo `Backup NN - nome da alteração.zip` é a cópia completa da pasta `sistema/`
(telas, banco de dados em SQL, ferramentas e testes) **exatamente como estava quando aquela
versão foi ao ar**. O número cresce a cada entrega.

| Nº | Alteração |
|---|---|
| 01 | ERP online v2 — painel, honorários, importação, backup e histórico |
| 02 | ERP original ligado ao Supabase — lançamentos e demais módulos |
| 03 | Módulo com problema não derruba a tela |
| 04 | ERP unificado — barra superior e telas novas |
| 05 | Visual do Gestão — comissão como redutor |
| 06 | Correção dos menus — histórico detalhado — prompt do ERP |
| 07 | Ficha 360° do cliente, Documentos e Tarefas completas |
| 08 | Design, acessos por função, e-mail, CRM, publicações e lógica das tarefas |
| 09 | Alertas, Acordos autônomo, contratos de consultoria (salário mínimo), cartão CNPJ diário |
| 10 | Design (cores únicas, modo escuro, celular), desempenho, Google Agenda, backup semanal, acessos |
| 11 | Central de automações (cadeias e e-mails ao cliente), CNPJ novo com fontes reserva, caça-bugs visual |
| 12 | Área do cliente e acesso por área, rascunho com aprovação, data do recebimento, comprovante do acordo, êxito nos contratos, visual moderno |
| 13 | Início e avisos novos, telas do ERP ajustadas, Alertas dinâmico, Cobranças e e-mails com a marca, recibo por extenso, demonstração, Gestão fora do site |
| 14 | Consertos, Início (fila, ficha da tarefa, relatórios), telas antigas enxutas, Processos em tela nova, e-mails por cliente, OFX, PGFN (API SERPRO), evolução do cliente, edição em tabela, usuários novos |
| 15 | Início (fila de 5 com calendário salvo, mural), Painel sem faixa, Processos/Parcelamentos/Acordos de volta ao 13, área do serviço e detalhe no Financeiro, novo cliente no contrato, CRM em abas, filtros em Documentos, Tarefas em abas, alerta vira tarefa, prompts |
| 16 | Início home (resumo + lembretes), Painel/Processos/Acordos/Financeiro ajustados, publicações por cliente, CRM completo, Central de e-mails (recibo em PDF), Tarefas (criação rápida, minha semana, carga), geradores de documentos + petição, PGFN grátis (dados abertos) |
| 17 | Início só com o que pede ação, Painel igual a Processos, Acordos em cartões, CRM 8 quadros (Follow-up), e-mail de destino e prévia com a marca, partes Autor/Réu, PGFN Dívida Aberta (CSV), ficha do contrato com aditivos |
| 18 | Design: cores sóbrias, cartão e tabela únicos, barra lisa, gráficos com a paleta do sistema, modo escuro preto |
| 19 | Enxuto: e-mails pausados e tudo na Central, Início sem repetição (mural + lembretes), Parcelamentos por grupo e no modelo de Acordos, Painel/Clientes em caixa alta, Alertas limpo, cabeçalho azul |
| 20 | Padrão único: lembretes no lugar do recado (sem prazo, fixo, destaque), tabelas de pagamento iguais com baixa em lote e PIX copia e cola, Painel/Processos como Clientes (grupo + ▸ detalhe), filtros e bordas iguais, telas sem cartão de título |
| 21 | Ajustes finos: lembretes como lista de "a fazer", Atrasados abre o detalhe, Painel/Processos por grupo como Clientes (ficha volta a abrir), processo em janela, Publicações por tribunal, Acordos (saldo por devedor em ranking, sem "Progresso"), régua de dias verde/azul/amarelo/vermelho |
| 22 | Padronização: régua única nas tabelas (vencimento e valor em negrito, selo da pessoa igual, "✓ Baixa"/"✎", triângulo de atraso), Parcelamentos no modelo de Acordos, Acordos com próximos 30 dias, sem PIX, teste de padronização |
| 23 | Lembretes em cartão próprio com detalhe e "Fixado", selo "Quem" sutil, sem triângulo, Painel com negociado na rosca, Parcelamentos por grupo com filtros e janela de detalhe, excluir usuário, modo escuro grafite |
| 24 | Guias de parcelamento junto de avisos e tarefas no Início; Painel sem os gráficos por grupo e por órgão; prompt do chat "ERP Automação" |
| 25 | Parcelamentos e Acordos na mesma lista por grupo (sem barra, "N de M parcelas pagas", próxima parcela somada no mês, risco com 2+ no mesmo), guias por parcelamento, Início com 5 tamanhos de letra |
| 26 | Do primeiro contato ao financeiro: contrato aguardando assinatura (financeiro e onboarding só na assinatura), gerador preenchido pelo CRM, contatos por setor e Central "Quem recebe o quê", reunião com convite, linha do tempo única, delegar e validar, lista de simplificação |
| 27 | Início enxuto (sem Atrasados, lembretes "Todos", fila com atrasadas ao lado, avisos só do que importa), Painel abre a ficha, Processos sem legendas extras, Parcelamentos/Acordos com emissão de guias/boletos (PDF, e-mail com anexo, controle), Contabilidade com análise única |
| 28 | Rotina do estagiário (passivo, certificado, acompanhamento de processos, guias), e-mail e dados de pagamento por empresa, várias guias num e-mail (valores editáveis, PDFs, WhatsApp), cadastro de cliente em abas com CNPJ na hora, máscaras R$/telefone, contratos com vigência, Alertas em blocos, Documentos por grupo, CRM com Meet/agenda |
| 29 | Início e Financeiro com os mesmos cartões (Prejuízo), envio de guias por empresa com visual novo e anexo só no e-mail, e-mails de teste com a pausa ligada, cadastro com "Buscar dados", Rotina (cores, senha GOV, histórico do passivo, tarefas recorrentes), tabelas sem páginas e com títulos fixos, relatório em PDF novo |
| 30 | Guias: e-mail do cliente já preenchido na emissão e no envio por empresa, empresas por grupo, caixa de valor nova, texto neutro (PF/PJ), situação real do e-mail (fila, retido, enviado, falhou); Contabilidade com os cartões do Jurídico |
| 31 | Contorno azul nos grupos, Processos com entidades do grupo filtrado, Rotina com "✓ Conferido" e última alteração, controle dos parcelamentos (nós emitimos? + planilha por mês), guias para emitir em blocos por grupo › empresa |
| 32 | Central de Documentos feita do zero (procuração, substabelecimento, contrato de honorários, recibo numerado, declaração, acordo): cliente puxado do cadastro, folha A4 ao vivo, histórico, PDF e Word com logo e rodapé |
| 33 | Guias em tabela alinhada + reenvio da guia vencida com valor atualizado, situação em 2 colunas, Rotina enxuta (8 meses, acordos, sem senha na tabela), alertas de conferência, e-mails em modo teste, gráfico de evolução do passivo |
| 34 | Guias emitidas pela Rotina (Emissão e Pagamento por mês, marcar meses → Enviar por empresa, valor editável, reemissão da vencida), Situação dos parcelamentos/acordos enxuta com ficha da planilha e parcelas em lista, Central de Documentos dentro do ERP (Ctrl+clique = aba nova) |
| 35 | Mais simples: Situação em cartões por grupo, Acordos com uma aba "A pagar" (grupo, responsável, boleto, enviar por empresa), planilha de parcelamentos (teste), evolução do passivo por grupo, processos com 3 movimentações e data do valor, filtro de advogados, e-mails simplificados |
| 36 | Agenda no Início (+ Agendar, legenda), evolução "Tudo junto" sem o zero, cartões de Situação mais claros (Emissão/Pagamento, confirmação), Acordos com Emitir + WhatsApp + prévia, Rotina com um quadrinho por parcela, planilha até a última parcela, contadores das Publicações, Documentos e "Quem recebe" no visual do ERP |
| 37 | Gerar guias com expansão (geral, grupo, linha), Acordos com filtros de prazo e forma de pagamento (PIX/boleto) no e-mail, certificado digital com senha e validade lida do arquivo, sessão sai só após 60 min sem uso (contador), Controle dos parcelamentos corrigido (limite de 1000 linhas), planilha em lista, agenda escolhe o que mostra, CRM/Alertas/Financeiro enxutos, visual inspirado nos prints |
| 38 | Barra lateral e cores no padrão dos prints (em azul), Início enxuto (sem Honorários e sem avisos), agenda só com Tarefas e filtro de pessoa para o admin, tarefas só manuais, Prejuízo/Em atraso de todos os meses, módulo E-mails fora e todo e-mail para pedromgsam@gmail.com |

## Como baixar um backup
No GitHub, abra a pasta `backups`, clique no arquivo e depois em **Download** (ícone de seta, à direita).

## Como voltar a uma versão (o jeito mais rápido)
Os backups são uma cópia de segurança guardada. Para **voltar o site** a uma versão anterior, use a Vercel:
**vercel.com → projeto erp → Deployments → ⋯ na versão desejada → Instant Rollback** (1 minuto).
Os dados (clientes, lançamentos etc.) ficam no banco e **não** mudam ao voltar as telas.

## E os dados?
Estes arquivos guardam o **sistema**, não os dados dos clientes (LGPD). A cópia dos dados é feita
no próprio ERP: **Administração → Backup** (Excel ou .json). Guarde esse arquivo no seu Google Drive.
