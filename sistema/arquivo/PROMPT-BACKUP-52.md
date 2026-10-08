# Prompt — Backup 52 (simetria, Início, Acordos com PIX, Publicações)

Copie tudo a partir da linha abaixo e cole no chat.
Se não quiser algum item, apague a linha dele na lista "Escopo".

---

Leia o `CLAUDE.md` e o arquivo `sistema/SUGESTOES-B51.md` antes de começar.

## Objetivo
O ERP tem de ser **simétrico**: o que muda num lugar vale para todas as telas. E os pedidos abaixo têm de funcionar no dia a dia.

## Escopo (entregue tudo numa PR só, o Backup 52)

### Parte 1 — Pedidos (C1 a C7)
1. **C1 — Início com Lista · Semana · Mês.**
   - A Semana é a mesma de Tarefas → Calendário (dá para arrastar a tarefa para outro dia).
   - A escolha fica guardada por pessoa (`preferencias.fila.vista`).
2. **C2 — Tirar "Atualizações".**
   - Sai do menu, de `TELAS_GS` e do pacote (`telas-atualizacoes.js`, `atualizacoes-dados.js` e o trecho do `montar-erp.js` que gera esse arquivo).
   - Diga onde fica o histórico das versões (`backups/LEIA-ME.md`).
3. **C3 — Quadros do tamanho do conteúdo.**
   - Com filtro ligado e poucos itens, o quadro encolhe (hoje a Lista do Início fica com a altura do calendário e sobra espaço vazio).
   - Com muitos itens, para numa altura máxima e rola por dentro.
   - Vale para Início, Tarefas, Rotina e Acordos.
   - Teste no `padrao.js`: nenhum quadro com mais de 40 px vazios embaixo do último item.
4. **C4 — Sem borda azul nos grupos, em todo o ERP.**
   - Tire o contorno azul de Processos e de qualquer tabela que ainda use `contornarGrupos` (o Painel Executivo já não tem).
   - Um desenho só para o cabeçalho de grupo: a faixa cinza com o nome e a contagem, igual ao Painel.
5. **C5 — Publicações: "↻ Buscar agora" funcionando.**
   - O servidor do Supabase é recusado pela API do CNJ; a busca pelo navegador funciona.
   - "↻ Buscar agora" passa a buscar **pelo navegador** (`buscarPubNoNavegador`). Se falhar, tenta a função `erp-publicacoes` como reserva e explica o motivo.
   - O botão separado "🌐 Buscar pelo navegador" sai (vira o próprio "Buscar agora").
   - A busca automática diária continua pelo navegador (`buscaPubAutomatica`).
   - Teste em `erp.js` com o DJEN falso do `servidor-local.js`: clicar em "Buscar agora" traz as publicações novas.
6. **C6 — Código PIX nas parcelas de acordo.**
   - Coluna nova `acordos.pix_codigo` (texto; o código copia e cola daquela parcela). SQL idempotente.
   - No cartão de envio de cada parcela de acordo: campo **"Código PIX (copia e cola)"**, gravado na parcela.
   - Sem código na parcela, vale a chave PIX do acordo (`acordos.pix`, que já existe), seja qual for a forma de pagamento.
   - O texto da mensagem (WhatsApp e e-mail) fica assim:
     ```
     Boa tarde!

     Seguem as parcelas de acordo com vencimento neste mês ou em atraso.

     *Acordo para pagamento*
     Processo: 0703762-53.2019.8.02.0044 | Parcela: 10ª parcela de 19
     Partes: Rogério × Luís Toceira
     Vencimento: 07/10/2026
     Valor: R$ 1.500,00
     PIX: <código copia e cola da parcela, ou a chave do acordo>
     ```
   - O e-mail (`guias_texto_html` / `enviar_guias_email`) mostra o mesmo PIX na caixa "Como pagar", com botão de copiar no HTML quando possível.
7. **C7 — Texto genérico, sem o nome no meio da frase.**
   - Nada de "parcelas de acordos **da Rogério**" ou "guias dos parcelamentos **da** Fulano".
   - Acordos: "Seguem as parcelas de acordo com vencimento neste mês ou em atraso."
   - Parcelamentos: "Seguem as guias dos parcelamentos com vencimento neste mês. Antes de pagar, confirme se a guia já não foi paga, para evitar duplicidade."
   - O nome do cliente fica só no assunto do e-mail ("Guias de Parcelamento — Empresa X") e no "Partes:".
   - Mude em todos os lugares que montam esses textos: `textoGuias` (telas-guias.js), `textoNotifParcelas` (telas-rotina.js) e o SQL que monta o HTML.
   - Teste: nenhum texto gerado contém " da " seguido do nome do cliente.

### Parte 2 — Simetria (P1 a P5)
8. **P1** Um componente só de filtros (chips + busca, o `chipFiltro` do Início) em Painel, Processos, Acordos, Rotina e Tarefas.
9. **P2** Um só botão "↻ Atualizar", com o mesmo estilo e no mesmo lugar (direita do cabeçalho do quadro).
10. **P3** Cabeçalho de grupo único (ligado ao C4).
11. **P4** Situações e cores únicas (`SITUACOES`: em atraso, vence hoje, a vencer, pago, cliente emite) usadas em Parcelamentos, Acordos, Financeiro e Rotina.
12. **P5** O `padrao.js` confere também: cabeçalho de grupo, botão Atualizar, filtros e altura dos quadros.

### Parte 3 — Velocidade que falta (O1 a O3)
13. **O1** Clientes: mostra a lista guardada na hora e atualiza por trás. Meta no `velocidade.js`: < 0,2 s.
14. **O2** Rotina → Processos: uma consulta só (última movimentação de cada processo), sem baixar todas as movimentações.
15. **O3** Parcelamentos depois de um Pago: relê só o parcelamento que mudou.

## Regras
- Não remova nenhuma função existente, exceto "Atualizações" (C2) e o botão duplicado de Publicações (C5). Se algo mudar de lugar, diga onde ficou.
- O SQL tem de ser idempotente. A última linha do `estrutura.sql` é `-- ═══ fim do Backup 52 ═══`.
- Siga o "Como entregar" do CLAUDE.md: testes (incluindo `velocidade.js`), `montar-erp`, `COMO-ATUALIZAR.md`, linha 52 no `backups/LEIA-ME.md` (antes do montar-erp), zip do backup e PR.
- Um teste com clique real (`erp.js`) para cada item. O `caca-bugs.js` tem de dar "nenhuma ocorrência".
- Para cada tela mudada, tire foto e confira, inclusive no modo escuro e no celular (390 px).

## Resposta esperada (em português simples)
1. Link da PR.
2. Número de linhas do `estrutura.sql`.
3. Tabela de tempos antes e depois (Clientes, Rotina → Processos, Parcelamentos depois de um Pago).
4. Se alguma função do Supabase precisa ser publicada de novo.
5. A ordem: **1) Merge  2) SQL no Supabase  3) publicar a função (se houver)  4) Ctrl+Shift+R**.
