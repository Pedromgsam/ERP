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

## Como baixar um backup
No GitHub, abra a pasta `backups`, clique no arquivo e depois em **Download** (ícone de seta, à direita).

## Como voltar a uma versão (o jeito mais rápido)
Os backups são uma cópia de segurança guardada. Para **voltar o site** a uma versão anterior, use a Vercel:
**vercel.com → projeto erp → Deployments → ⋯ na versão desejada → Instant Rollback** (1 minuto).
Os dados (clientes, lançamentos etc.) ficam no banco e **não** mudam ao voltar as telas.

## E os dados?
Estes arquivos guardam o **sistema**, não os dados dos clientes (LGPD). A cópia dos dados é feita
no próprio ERP: **Administração → Backup** (Excel ou .json). Guarde esse arquivo no seu Google Drive.
