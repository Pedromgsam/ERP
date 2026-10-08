# Prompt — Backup 51 (velocidade, recorrentes, Rotina e e-mail)

Copie tudo a partir da linha abaixo e cole no chat.
Se não quiser algum item, apague a linha dele na lista "Escopo".

---

Leia o `CLAUDE.md` e o arquivo `sistema/SUGESTOES-B50.md` antes de começar.

## Objetivo
O ERP precisa ficar **rápido** e **sem atrasos** no trabalho do dia a dia, sem perder nenhuma função.
Hoje são lentos:
- abrir **Rotina → Guias do mês**;
- abrir **Rotina → Planilha**;
- clicar em **Pago** (e em Emitida).

As tarefas recorrentes também precisam cair **sempre nas datas certas** (ex.: toda segunda; 2× ao mês nos dias 5 e 20).

## Escopo (nesta ordem; entregue tudo numa PR só, o Backup 51)

### Parte 1 — Velocidade (itens V1 a V7)
1. **Medir antes de mexer.**
   - Crie dados fictícios grandes: 300 parcelamentos, 15 mil parcelas, 2 mil lançamentos e 500 clientes.
   - Crie um teste de tempo (`sistema/testes/velocidade.js`, dentro do `rodar-tudo.sh`). Ele mede:
     - abrir "Guias do mês";
     - abrir "Planilha";
     - trocar de grupo na Planilha;
     - clicar "Pago";
     - abrir Financeiro, Painel e Clientes.
   - Anote os tempos de antes no `COMO-ATUALIZAR.md`.
2. **V1 — Uma consulta só, enxuta.**
   - Crie uma função no banco (RPC `rotina_parcelas_json`) que devolve só o que as duas telas usam:
     - os parcelamentos;
     - as parcelas em aberto, as do mês e as dos últimos 3 meses;
     - por parcelamento, quantas foram pagas antes e o total.
   - Não baixe mais o histórico inteiro com `buscarTodos`.
3. **V2 — Guardar na memória.**
   - Os dados ficam guardados enquanto a Rotina está aberta. Trocar de aba não busca de novo.
   - Depois de gravar, atualize só a parcela que mudou.
   - O botão "↻ Atualizar" busca tudo de novo.
4. **V3 — Desenhar só o necessário.**
   - Na Planilha, desenhe só o grupo aberto.
   - A tela aparece na hora, com um esqueleto cinza no lugar dos números até os dados chegarem.
5. **V4 — "Pago" e "Emitida" na hora.**
   - A tela muda no clique e o banco grava por trás.
   - Se der erro, a tela volta ao estado anterior e mostra o motivo.
   - Troque a pergunta de confirmação por "Desfazer" (5 s).
   - Tire o `carregarGrupos()` que roda antes de responder (`baixaRapida`, editor.js).
6. **V5 — Sem recarregar o ERP inteiro.**
   - Depois de uma baixa, marque como "a atualizar" só a tela de Parcelamentos.
   - Ela atualiza quando for aberta (no lugar do `ERP_RECARREGAR` completo).
7. **V7 — Índices.** Crie, no `estrutura.sql` (idempotente), os índices que as consultas novas usam.
8. **Meta, conferida pelo teste:**
   - "Guias do mês" e "Planilha" abrem em **< 1 s**;
   - "Pago" responde em **< 0,2 s**;
   - as outras telas, em menos tempo do que antes.
   - Mostre os tempos de antes e depois na resposta.

### Parte 2 — Tarefas recorrentes (itens T1 a T3)
9. **T1 — Regra de repetição** no formulário da tarefa:
   - toda semana nos dias escolhidos;
   - a cada N semanas;
   - 2× ao mês nos dias escolhidos;
   - todo mês no dia N, ou no N.º dia útil, ou na última sexta (ou outro dia da semana);
   - todo ano;
   - data de início e data de fim opcional;
   - opção "se cair em feriado ou fim de semana, passa para o dia útil seguinte" (use os feriados já cadastrados).
   - Guarde a regra numa coluna nova, `tarefas.recorrencia_regra` (jsonb).
   - As tarefas antigas (semanal, mensal, anual) continuam funcionando.
10. **T2 — Próximas datas já na agenda.**
    - As próximas ocorrências (até 8) já aparecem no calendário e no Google Agenda (`erp-agenda`).
    - Elas não duplicam e não dependem de concluir a anterior.
11. **T3 — Editar recorrente.**
    - Ao editar, pergunte "só esta" ou "esta e as próximas".
    - Mostre a regra por extenso, por exemplo: "↻ toda segunda, a partir de 13/10".

### Parte 3 — Rotina e e-mail (itens R1, R3, R4, E1 a E4)
12. Faça o que está na coluna "Sugestão" de cada um. Use os componentes que já existem:
    - `chipFiltro`, `exBloco`, `vazio`, `abrirJanela`;
    - `pillRecebeEmail`, `verEmailHtml`.

## Regras
- Não remova nenhuma função existente. Se algo mudar de lugar, diga onde ficou.
- O SQL tem de ser idempotente. A última linha do `estrutura.sql` é `-- ═══ fim do Backup 51 ═══`.
- Siga o "Como entregar" do CLAUDE.md:
  - testes, incluindo o `velocidade.js` novo;
  - `montar-erp`;
  - `COMO-ATUALIZAR.md`;
  - linha 51 no `backups/LEIA-ME.md` (antes do montar-erp);
  - zip do backup;
  - PR.
- Escreva um teste com clique real (`erp.js`) para cada item. O `caca-bugs.js` tem de dar "nenhuma ocorrência".
- Para cada tela mudada, tire foto e confira.

## Resposta esperada (em português simples)
1. Link da PR.
2. Número de linhas do `estrutura.sql`.
3. Tabela de tempos, antes e depois (Guias do mês, Planilha, Pago, Financeiro, Painel, Clientes).
4. Se alguma função do Supabase precisa ser publicada de novo (a `erp-agenda` vai mudar por causa do T2).
5. A ordem: **1) Merge  2) SQL no Supabase  3) publicar a função  4) Ctrl+Shift+R**.
