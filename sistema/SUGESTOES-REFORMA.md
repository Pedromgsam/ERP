# Sugestões para a reforma (09/10/2026)

Responda com os números que aprovar (ex.: "aprovo E1, E3, F2, A1"). Nada daqui é feito sem a sua aprovação.
Tudo pode ser testado antes na tela-modelo (https://claude.ai/artifact/T1Mbpimj7Fh5E2ZyviaDmY).
Custos: A5 (com IA) e O2 podem ter custo — está explicado em cada um; o resto é grátis.

## E — Estética (visual)
- **E1. Densidade escolhível**: botão "confortável / compacto" nas tabelas. O compacto mostra ~20 linhas na tela em vez de 12, e o sistema lembra a escolha de cada pessoa.
- **E2. Valores que batem o olho**: no rodapé de toda tabela, o total da coluna Valor (e a média). Hoje o total fica só no alto.
- **E3. Cor do grupo**: um pontinho de cor fixo por grupo (o mesmo em todas as telas), para achar o Grupo Horizonte de relance.
- **E4. Menos ícones e emojis soltos** nas telas antigas (🧾, 🏛, 🕘…): todos viram o mesmo ícone de traço fino da tela-modelo.
- **E5. Linha do tempo do cliente** na ficha, no mesmo desenho dos cartões (pagamentos, guias, e-mails, tarefas), com filtro por tipo.

## F — Funcionalidades
- **F1. Busca geral (Ctrl+K)**: digite o nome, CNPJ ou nº do processo/parcelamento e abra direto a ficha ou a janela. Já está desenhada no topo da tela-modelo.
- **F2. Filtros salvos**: guardar uma combinação de filtros com nome (ex.: "Horizonte · em atraso · acima de R$ 1.000") e usar com um clique.
- **F3. Exportar o que está na tela**: botão "Baixar planilha" em toda tabela, com os filtros aplicados.
- **F4. Ações em lote**: marcar várias linhas e dar baixa, emitir guias ou enviar e-mail de uma vez, sempre com a confirmação.
- **F5. Desfazer em tudo**: o "Desfazer" de 5 segundos que já existe na baixa passa a valer também para editar e excluir.
- **F6. Histórico na janela**: em toda janela de edição, a aba "Alterações" (quem mudou o quê e quando). Hoje só o admin vê, e em outro lugar.
- **F7. App no celular (PWA)**: instalar o ERP na tela inicial do celular, sem loja de aplicativos. Grátis.
- **F8. Atalhos de teclado**: N = novo, / = buscar, Esc = fechar, setas para andar na tabela.

## A — Automação
- **A1. Resumo da manhã por e-mail** para cada pessoa: o que vence hoje, o que atrasou, guias a emitir e tarefas do dia.
- **A2. Lembrete ao cliente antes do vencimento** da parcela (ex.: 3 dias antes), usando o e-mail que já existe, com liga/desliga por cliente.
- **A3. Guia emitida → e-mail sai sozinho**: ao marcar "Emitida" e anexar o PDF, o e-mail para o cliente já fica pronto para revisar e enviar.
- **A4. Parcelamento em risco**: tarefa automática quando um parcelamento chega a 2 parcelas em atraso (risco de rescisão), para o responsável.
- **A5. Leitura do PDF da guia** (valor e vencimento lidos sozinhos do arquivo). Sem IA é grátis, mas só funciona para guias com texto. Com IA lê também guias escaneadas, com custo por uso — eu passo o preço antes, se você quiser.
- **A6. Conferência mensal**: no dia 1º, uma tarefa "conferir os parcelamentos do mês" com a lista pronta (o que pagou, o que não pagou).

## O — Organização do trabalho
- **O1. Protótipo uma etapa à frente**: antes de cada módulo, a tela-modelo dele é feita e aprovada; depois o ERP é mudado. Já fizemos assim com Parcelamentos e Financeiro.
- **O2. Ambiente de testes com cópia dos dados**: um segundo endereço do ERP (outro projeto do Supabase: o plano gratuito permite 2 projetos; se a conta já usar os dois, eu confiro o preço antes) com uma cópia **anonimizada** dos dados, para testar com volume real sem mexer no ERP de verdade.
