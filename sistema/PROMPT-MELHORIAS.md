# Prompt de melhorias — design, integração e desempenho

> Cole este texto numa conversa nova com o Claude quando quiser fazer a próxima rodada.
> Foi montado depois de uma revisão do código em 27/09/2026 (Backup 09).

---

Trabalhe no repositório `pedromgsam/erp` (ERP do escritório Araújo & Castro, Supabase + Vercel).
Mantenha as regras de sempre: a chave secreta nunca vai para o site nem para o repositório; os testes usam só
dados fictícios; o SQL é idempotente; cada entrega traz um backup nomeado, um PR e instruções simples.
Execute por fases. Cada fase termina com todos os testes passando (`sistema/testes/rodar-tudo.sh`).

## Fase A — Desempenho (maior ganho, sem perder nada)

1. **Cache dos arquivos fixos.** Hoje o `vercel.json` manda `Cache-Control: no-cache` para tudo. Assim, a cada acesso
   o navegador pergunta de novo pelos ~2,5 MB do sistema (supabase.js 218 KB, chart.js 205 KB, exceljs 948 KB).
   Troque para `public, max-age=31536000, immutable` em `/vendor/*` e mantenha `no-cache` só nos `.html`.
   Para os `.js`/`.css` próprios, gere um nome com versão (`gestao-embutida.3f9a.js`) no `montar-erp.js`.
2. **ExcelJS só quando for importar ou exportar.** Carregue `vendor/exceljs.min.js` sob demanda (`import()`
   ou `<script>` criado na hora). O login e o Painel ficam ~1 MB mais leves.
3. **Imagens embutidas no `index.html`.** Há 3 imagens em base64 no HTML (o arquivo tem 632 KB). Passe-as para
   arquivos `.png/.webp` em `app/img/` com cache longo.
4. **Buscar só as colunas usadas.** `erp-dados.js` e as telas usam `select('*')` em clientes, processos,
   lançamentos e tarefas (mais de 60 ocorrências). Liste as colunas: isso evita trazer `cnpj_dados`
   (JSON do cartão CNPJ) e textos longos em toda tela.
5. **Carregar uma vez só.** Hoje `carregarCadastros()` (clientes + grupos) roda a cada troca de tela.
   Guarde o resultado em memória por 60 s e invalide depois de gravar.
6. **Índices no banco** para os filtros mais usados: `lancamentos(empresa, pago, vencimento)`,
   `acordos(pago, vencimento)`, `tarefas(status, prazo)`, `publicacoes(status)`.
7. **Somas no banco.** Os KPIs do Painel e do Financeiro somam milhares de linhas no navegador. Crie views/RPCs
   (`resumo_financeiro(p_empresa, p_de, p_ate)`) que devolvem os totais prontos.

## Fase B — Simplificação do código

1. **Uma tela, um código.** Hoje as telas existem duas vezes: `app/telas-*.js` (Gestão) e o pacote gerado
   `gestao-embutida.js` (360 KB), além do `ERP.html` antigo (10 mil linhas) remendado por 63 `trocar()` no
   `montar-erp.js`. Migre cada tela do ERP.html para um arquivo `telas-*.js`, uma por vez, apagando os
   remendos correspondentes. Meta: `montar-erp.js` sem remendos e o ERP.html só como casca.
2. **Um único jeito de abrir janela, tabela e formulário** (`abrirJanela`, `tabela()`, `campo()`), apagando as
   versões paralelas do editor.js e do ERP.html.
3. **Uma função genérica de relatório** (colunas + linhas + CSV + clique na ficha), usada por Alertas,
   Painel, Financeiro e Clientes. Ela já existe em `telas-alertas.js` (`relatorioAlerta`).
4. **Apagar o `gestao.html`** quando você confirmar que não usa mais. Isso só será feito com a sua ordem.

## Fase C — Design

1. Um só conjunto de cores/tamanhos (tokens em `:root`) para `estilo.css`, `erp-telas.css` e `editor.css`,
   com os tons de vermelho, âmbar e verde dos cartões iguais em todas as telas.
2. Modo escuro opcional (os tokens tornam isso fácil).
3. Estados vazios com uma frase e um botão ("Nenhum contrato — + Novo contrato").
4. Tabelas longas: cabeçalho fixo ao rolar e paginação de 100 em 100.
5. Celular: revisar Painel Executivo e Financeiro a 390 px (tabelas viram cartões).
6. Acessibilidade: foco visível no teclado, `aria-label` nos botões só com ícone (✎, ⋯, 🔔).

## Fase D — Integrações

1. **Cartão CNPJ**: mostrar na ficha do cliente os dados da Receita (razão social, CNAE, porte, abertura) e o
   histórico das alterações; alerta por e-mail quando alguma empresa ficar INAPTA/BAIXADA.
2. **Certidões automáticas** (CND federal/estadual/FGTS) com validade → Alertas. Antes, informe os custos das APIs.
3. **Boletos/PIX** para honorários (Asaas, Inter ou Sicoob) com baixa automática. Informe o custo por boleto antes.
4. **Google Agenda**: prazos fatais e audiências viram eventos na agenda de quem é responsável.
5. **WhatsApp** (API oficial): lembrete de parcelas de acordo e de honorários. Informe o custo por mensagem antes.
6. **Assinatura eletrônica** de contratos (ZapSign/Clicksign), com o PDF assinado anexado ao contrato.

## Fase E — Segurança e rotina

1. Painel "Saúde do sistema" em Alertas, com a última execução de cada rotina (já existe) e o tamanho do banco e do Storage
   (limites do plano grátis).
2. Backup semanal automático do banco (export) no Storage privado, guardando as últimas 8 cópias.
3. Registro de acesso (quem entrou, quando) e aviso de login de um aparelho novo.
