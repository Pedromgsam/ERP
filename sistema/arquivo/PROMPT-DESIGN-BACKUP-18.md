# Prompt para o próximo chat — Design (Backup 18)

> Copie tudo a partir de "INÍCIO DO PROMPT" e cole no chat novo. O chat novo lê o `CLAUDE.md` sozinho; este texto
> diz o que fazer e onde está cada coisa do visual.

---

INÍCIO DO PROMPT

Leia o `CLAUDE.md` (regras, como entregar, testes) e este arquivo (`sistema/PROMPT-DESIGN-BACKUP-18.md`) antes de mexer em qualquer coisa.
Trabalhe no branch indicado pela sessão, partindo da última versão mergeada (Backup 17).

## Objetivo
Rodada **só de design**, sem mudar regra de negócio, banco ou Edge Functions. Quero o ERP com cara **moderna, minimalista e bonita**,
menos "grosseiro": menos bordas pesadas, menos cor forte, mais respiro, hierarquia clara. Cores **mais sutis**. **Modo escuro com
fundo preto de verdade** (eu gosto de preto) e bem acabado. Melhorar os **cards**.

## Como o visual funciona hoje (onde mexer)
- **Cores e tamanhos: só em `sistema/app/tokens.css`** (fonte única, `:root` = claro; `html[data-tema="escuro"]` = escuro).
  Paleta da marca: navy `#1B2A4A`, azul `#2E5EAA`, ouro `#C9A84C`. Status: `--green/--amber/--red/--blue/--violet` com `-d` (texto) e `-lt` (fundo do selo).
  Fonte única `--font-ui` (Inter). Sombras `--shadow-sm/md/lg/card/hover`, raios `--card-r`, `--card-r-sm`.
- **CSS das telas**:
  - `estilo.css` = telas "do Gestão": Início, Clientes, Contratos, CRM, Tarefas, Documentos, Alertas, Central de e-mails etc. Vira `gs.css` escopado no build.
  - `erp-telas.css` = barra superior, telas antigas do ERP (Painel Executivo, Processos, Parcelamentos, Acordos, Financeiro) e ajustes por cima delas.
  - `editor.css` = formulários/janelas do editor.
  - O HTML/CSS antigo do ERP vem de `#Sistemas/2 - ERP/ERP.html` + remendos em `sistema/ferramentas/montar-erp.js`. Não edite `index.html` à mão.
- **Modo escuro**:
  - `ferramentas/tema-escuro.js` gera `tema-escuro.css` convertendo as cores fixas do CSS antigo. Os tokens escuros ficam em `tokens.css`.
  - Hoje o fundo escuro é azul-acinzentado (`--bg:#0E1420`, `--surface:#161D2B`). Quero **preto**, por exemplo `--bg:#000` / `#0A0A0A`, `--surface:#111`/`#141414`, `--surface2:#1A1A1A`, bordas `rgba(255,255,255,.08)`.
  - Cuide para os cinzas não ficarem azulados. Confira os tons que o `tema-escuro.js` gera (matiz/saturação) para combinarem com o preto.
  - Não escreva regras escuras à mão, salvo exceções pontuais.
- **Build**: depois de mexer em `sistema/app/*.js|css` rode `node sistema/ferramentas/montar-erp.js`.

## O que fazer (sugestão de ordem)
1. **Diagnóstico visual primeiro:**
   - Rode `FOTOS=/pasta node sistema/testes/erp.js` e olhe os prints de todas as telas, nos modos claro e escuro e no celular (390px).
   - Liste o que está "grosseiro": bordas grossas, sombras duras, cores saturadas, fundos iguais ao fundo da página, títulos pesados, pílulas grandes demais, tabelas com cabeçalho escuro, espaçamentos irregulares.
   - Mostre a lista antes de mudar tudo.
2. **Tokens:**
   - Suavizar a paleta: fundos de selo mais claros, textos de status menos saturados (mantendo contraste AA — o `caca-bugs.js` mede).
   - Bordas 1px bem leves, sombra de uma camada só e bem difusa, raio consistente (ex.: 12px cards, 8px botões/inputs, 999px pílulas).
   - Escala de espaçamento (4/8/12/16/24/32) e tipográfica (12/13/14/16/20/24) como tokens.
3. **Cards:**
   - Um único desenho de card no sistema: KPI (`.kpi`, `.kc` do ERP antigo, `.ini-res` do Início), card com título (`.card`, `.card-hd`), cartão do CRM (`.cr-card`), acordos (`.acx-*`), parcelas.
   - Título pequeno em caixa alta cinza, número grande, legenda discreta. A cor de status só na faixa/ícone, nunca no card inteiro.
   - Remover a faixa grossa colorida à esquerda onde ela não significa nada.
4. **Tabelas:**
   - Cabeçalho claro (sem o navy pesado), linhas com separador sutil, hover leve, números alinhados à direita (tabular-nums).
   - Mesmo visual nas tabelas do ERP antigo (Processos, Painel, Parcelamentos, Financeiro) e nas do Gestão.
5. **Barra superior e menus:** mais limpa (ícones finos, menos contornos), menu ⋯ e dropdowns com sombra suave e raio igual aos cards.
6. **Botões, pílulas e selos:**
   - Hierarquia primário (navy), secundário (contorno leve), terciário (texto). Pílulas menores e com cor suave.
   - Selos CAPAG/Situação no mesmo desenho das outras pílulas.
7. **Janelas (modais):** cabeçalho limpo, rodapé fixo com ações à direita, largura coerente (a de "Editar em tabela" é a tela toda).
8. **Gráficos:**
   - Cores do Chart.js vindas dos tokens (resolver o hex em JS no momento de montar; o canvas não entende `var()`).
   - Grade bem leve, sem animação ao repintar. Barras seguem a rampa azul; roscas com saturação contida.
9. **Modo escuro preto:**
   - Revisar tela por tela: nenhum bloco claro "esquecido", nenhum texto sem contraste.
   - Gráficos legíveis, sombras que funcionem no preto (use borda leve + brilho sutil em vez de sombra escura).
10. **Celular:** conferir que nada estoura a largura (o teste já mede) e que os cards ficam bonitos empilhados.

## Regras
- Não mudar comportamento, SQL, Edge Functions, textos de negócio nem nomes de botões que os testes usam.
- Cores só em `tokens.css`, sem cor solta nos outros arquivos (use `var(--...)`).
- Rodar `sh sistema/testes/rodar-tudo.sh` até tudo passar, inclusive `caca-bugs.js` ("nenhuma ocorrência") e `visual.js`.
- Entregar como sempre: montar-erp, `COMO-ATUALIZAR.md` + `backups/LEIA-ME.md`, commit, `novo-backup.sh "Backup 18 - Design"`, push, PR.
- Na resposta: prints de antes/depois das telas principais (Início, Painel, Financeiro, CRM, Acordos) nos modos claro e escuro,
  link da PR e a ordem de sempre (Merge → Ctrl+Shift+R; esta rodada **não** tem SQL novo, a não ser que algo mude).

FIM DO PROMPT
