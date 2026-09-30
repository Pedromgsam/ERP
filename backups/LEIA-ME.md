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
| 23 | Ajustes e modo escuro: excluir usuário, cartão de Lembretes próprio, selo da pessoa menor, Parcelamentos por grupo recolhido, modo escuro grafite |
| 24 | Início e Painel: guias de volta na faixa de destaques, Lembretes só com lembretes, Painel sem os gráficos de grupo e órgão |
| 25 | Do primeiro contato ao financeiro: contrato aguardando assinatura (financeiro e onboarding só na assinatura), gerador preenchido pelo CRM, contatos por setor e Central "Quem recebe o quê", reunião com convite, linha do tempo única, delegar e validar, lista de simplificação |
| 23 | Lembretes em cartão próprio com detalhe e "Fixado", selo "Quem" sutil, sem triângulo, Painel com negociado na rosca, Parcelamentos por grupo com filtros e janela de detalhe, excluir usuário, modo escuro grafite |
| 24 | Guias de parcelamento junto de avisos e tarefas no Início; Painel sem os gráficos por grupo e por órgão; prompt do chat "ERP Automação" |

## Como baixar um backup
No GitHub, abra a pasta `backups`, clique no arquivo e depois em **Download** (ícone de seta, à direita).

## Como voltar a uma versão (o jeito mais rápido)
Os backups são uma cópia de segurança guardada. Para **voltar o site** a uma versão anterior, use a Vercel:
**vercel.com → projeto erp → Deployments → ⋯ na versão desejada → Instant Rollback** (1 minuto).
Os dados (clientes, lançamentos etc.) ficam no banco e **não** mudam ao voltar as telas.

## E os dados?
Estes arquivos guardam o **sistema**, não os dados dos clientes (LGPD). A cópia dos dados é feita
no próprio ERP: **Administração → Backup** (Excel ou .json). Guarde esse arquivo no seu Google Drive.
