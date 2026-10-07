# Prompt — Backup 51 (Rotina e e-mail mais simples)

Copie tudo a partir da linha abaixo e cole no chat. Troque a lista de números pelos que você aprovar.

---

Leia o CLAUDE.md e o arquivo `sistema/SUGESTOES-B50.md` antes de começar.

Aprovo os itens: **R1, R3, R4, E1, E2, E3, E4, G1** (troque pelos números que quiser).

Para cada item aprovado:
- faça exatamente o que está na coluna "Sugestão";
- mantenha o que já funciona;
- use os componentes que já existem (`chipFiltro`, `exBloco`, `vazio`, `abrirJanela`, `pillRecebeEmail`, `verEmailHtml`).

Regras:
- Siga o "Como entregar" do CLAUDE.md:
  - testes;
  - `montar-erp`;
  - COMO-ATUALIZAR;
  - linha 51 no `backups/LEIA-ME.md` (antes do montar-erp);
  - zip do backup;
  - PR.
- Para cada tela mudada, tire foto e confira. O `caca-bugs.js` tem que dar "nenhuma ocorrência".
- Escreva um teste com clique real (erp.js) para cada item novo.
- Responda em português simples. Diga o número de linhas do `estrutura.sql` e se alguma função do Supabase precisa ser publicada de novo.
