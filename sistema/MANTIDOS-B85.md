# Mantidos do ERP no Backup 85 (para você decidir)

Pedido de 15/10: levar o visual do ambiente e **não apagar nada que o ERP já faz**; no fim, listar o que foi mantido.
Responda com os códigos: "Tirar: M03, M10…" (o que não for citado fica como está). A página com os botões Manter/Tirar está no link da resposta.

| Código | Onde | O que ficou (o ambiente não tem) |
|---|---|---|
| M01 | Parcelamentos, Acordos, Execuções | Botão "Atualizar" (só o ícone) no cabeçalho (TB10) |
| M02 | Busca (Ctrl+K) | Também acha grupos, acordos e tarefas (BG3) |
| M03 | Tarefas | Aba "Excluídas", com "Restaurar" e "Excluir de vez" (TF3) |
| M04 | Processos | "em dd/mm/aaaa" embaixo do valor (PR3) |
| M05 | Processos → janela | Blocos Observação, Distribuição, Procuração, Prescrição; "por <quem>" em cada movimentação (PR7) |
| M06 | Processos | Filtros Competência e Advogado (além de Grupo, Tribunal, Natureza, Conferido) |
| M07 | Parcelamentos | Parcela vencida/emitida → janela antiga "Reenviar guia vencida" / desmarcar emissão (PA6) |
| M08 | Parcelamentos → janela | "Mais dados" (os outros campos do parcelamento) e o botão "Editar dados" |
| M09 | Acordos | Filtro "Credor" (AC1) |
| M10 | Acordos → janela | "Mais dados" (Responsável, PIX, Banco, Grupo), botão "Emitir (N)" e a janelinha da parcela ("Só esta parcela", "Detalhe completo") |
| M11 | Acordos → Emitir | Link "Outras formas de envio" (a janela antiga: WhatsApp, PIX, copiar) |
| M12 | Rotina → Guias do mês | Botão "Cartão" (os cartões antigos da empresa) |
| M13 | Rotina → Processos | Colunas Procuração e Valor; filtros Procuração e "Conferido há"; botão "+ Processo" |
| M14 | Rotina → Processos | "Conferir o grupo todo" virou: Filtros → Grupo + "Marcar várias" → "Conferidos, sem novidade" |
| M15 | Execuções | Botão Atualizar; Filtros Grupo e Situação; situações "Em acordo" e "Suspensa" (EX1) |
| M16 | Execuções → janela | Quadro "Contatos (não clientes)" e "Editar execução" (EX3); número "Falta receber"; tabela de recebimentos com "No Financeiro", "Repassado" e apagar |
| M17 | Execuções → + Recebimento | "Mais dados": forma, repassado em, honorário manual, observação |
| M18 | Financeiro | Avisos acima do conteúdo ("N honorários vencidos", "Prejuízo") (FI2) |
| M19 | Financeiro | "Cobrar as marcadas" e a prévia do e-mail de cobrança (FI14) |
| M20 | Financeiro | Abas "A pagar/Pagos" no Jurídico quando há despesa; aba "Prejuízo" na Contabilidade; abas Caixa e Distribuição de lucros |
| M21 | Financeiro → Filtros | Listas Área, Referência e Favorecido (além de Quem, Grupo, Tipo) |
| M22 | Financeiro → lançamento | Botão "Detalhe" (contrato, ficha, recibo, cobrar) |
| M23 | Financeiro → Recibo | "Abrir na Central de Documentos" (ajustar texto, imprimir) |
| M24 | Contratos | Quadro "Reajuste anual nos próximos 60 dias" com % editável (CT1) |
| M25 | Contratos | Aba "Cancelados"; colunas "Recebido" e "Financeiro"; Filtros Tipo e Financeiro (CT2) |
| M26 | Contratos → janela | "Mais dados do contrato" (ficha completa), números Recebido/Falta/Em atraso, êxito, documentos, aditivos, "Lançar valor avulso", "Ligar lançamentos", Rescindir, Excluir, Editar |
| M27 | Ficha do cliente | Abas "Contatos e endereços" e "Sócios" |
| M28 | Ficha do cliente | "+ Lançar ▾", WhatsApp, E-mail, etiquetas e selos no alto |
| M29 | Documentos | "Ver em pastas" (pastas por grupo, link do Drive, "+ Enviar" por pasta) e filtro Cliente |
| M30 | Documentos | Aba "Versões anteriores" (DO3); botões Abrir / Nova versão / Excluir na linha |
| M31 | Início | Pílula do CRM e as linhas Avisos/Conferências da faixa |
| M32 | Início | Honorários em atraso: separação Jurídico/Contabilidade no balão |
| M33 | Tarefas | "Ficha da tarefa" no formulário; arrastar tarefa na Semana |
| M34 | Administração | Abas Histórico e Acessos |
| M35 | Administração → E-mails | "Outros automáticos do ERP" (boas-vindas, lembrete/atraso de parcelamento e de acordo) e o aviso da equipe "Fluxo / sequência" (o ambiente tem 10) |
| M36 | Portal | Na lista de contratos: valor e empresa na linha de baixo |

Não ficou igual ao ambiente (por limite técnico):
- **JN4 Desfazer:** entrou em lançamentos (salvar, alterar, excluir, "Virou prejuízo"), tarefas (salvar, excluir, concluir), formulários do ERP (processos, parcelamentos, acordos…), recebimento de execução e chaves de e-mail. A conferência de processo ("Sem novidade") não tem Desfazer (vira uma movimentação).
- **CL2 Documentos do mês:** o ERP não tem a lista de "o que o cliente manda todo mês"; a ficha mostra o que chegou desde o dia 1º do mês passado, por tipo (sem o "falta").
- **PT3 Baixar recibo:** abre o recibo pronto para imprimir/salvar em PDF (o modelo com número e extenso continua saindo por e-mail).
