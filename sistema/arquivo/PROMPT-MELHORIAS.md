# Prompt de melhorias — design, integração e desempenho

> **Executado no Backup 10 (28/09/2026).** O que ficou para depois está em `INVENTARIO-SIMPLIFICACAO.md` e `INTEGRACOES-CUSTOS.md`.

> Cole **todo** o texto abaixo da linha numa conversa nova com o Claude (uma conversa só).
> Foi montado depois de uma revisão do código em 27/09/2026 (Backup 09). **Foco principal: design.**

---

Leia o `CLAUDE.md` e siga as regras e o jeito de entregar que estão lá.

Trabalhe no repositório `pedromgsam/erp` (ERP do escritório Araújo & Castro, Supabase + Vercel).
Mantenha as regras de sempre: a chave secreta nunca vai para o site nem para o repositório; os testes usam só
dados fictícios; o SQL é idempotente; cada entrega traz um backup nomeado, um PR e instruções simples.

**Como executar nesta conversa:**
- Antes de mudar qualquer coisa, prepare o ambiente de testes descrito no `CLAUDE.md` e rode todos os testes.
- Execute as fases **na ordem abaixo (A → E)**. O foco principal é o **design (Fase A)**: capriche nela.
- Cada fase termina com todos os testes passando (`sistema/testes/rodar-tudo.sh`), prints antes/depois quando
  mudar a tela (`FOTOS=... node erp.js`), commit e push. Uma PR para tudo, com um resumo por fase.
- Quando um item depender de uma escolha minha (serviço pago, custo, preferência), **pergunte, mas não pare**:
  siga com os outros itens e fases enquanto espera a resposta.
- No final: atualize o `CLAUDE.md` (seção "Estado atual"), o `COMO-ATUALIZAR.md` e o `backups/LEIA-ME.md`,
  e me responda em português simples com o passo a passo.

## Fase A — Design (foco principal)

Use as skills **telas-com-dados-ac** e **padrao-web-ac** como referência visual.

1. **Um só conjunto de cores e tamanhos** (tokens em `:root`) para `estilo.css`, `erp-telas.css` e `editor.css`.
   Os tons de vermelho, âmbar e verde dos cartões devem ser iguais em todas as telas.
2. **Modo escuro opcional** (os tokens tornam isso fácil), com um botão para ligar e desligar.
3. **Estados vazios** com uma frase e um botão ("Nenhum contrato — + Novo contrato").
4. **Tabelas longas:** cabeçalho fixo ao rolar e paginação de 100 em 100.
5. **Celular:** revisar Painel Executivo e Financeiro a 390 px (tabelas viram cartões).
6. **Acessibilidade:** foco visível no teclado e `aria-label` nos botões que só têm ícone (✎, ⋯, 🔔).
7. **Revisão geral de consistência** tela a tela (Início, Painel Executivo, Jurídico, Acordos, Financeiro,
   Contratos, Clientes, CRM, Documentos, Tarefas, Alertas, Administração): espaçamentos, títulos, botões, cartões,
   tabelas e gráficos no mesmo padrão. Me mostre os prints das principais diferenças.

## Fase B — Desempenho (maior ganho, sem perder nada)

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
5. **Carregar uma vez só.** `carregarCadastros()` (clientes + grupos) roda a cada troca de tela.
   Guarde em memória por 60 s e invalide depois de gravar.
6. **Índices no banco** para os filtros mais usados: `lancamentos(empresa, pago, vencimento)`,
   `acordos(pago, vencimento)`, `tarefas(status, prazo)`, `publicacoes(status)`.
7. **Somas no banco.** Os KPIs do Painel e do Financeiro somam milhares de linhas no navegador. Crie views/RPCs
   (`resumo_financeiro(p_empresa, p_de, p_ate)`) que devolvem os totais prontos.

Meça antes e depois (tamanho baixado e tempo até o Painel aparecer) e me mostre a comparação.

## Fase C — Simplificação do código

1. **Uma tela, um código.** Hoje as telas existem duas vezes: `app/telas-*.js` (Gestão) e o pacote gerado
   `gestao-embutida.js` (360 KB), além do `ERP.html` antigo (10 mil linhas) remendado por 63 `trocar()` no
   `montar-erp.js`. Migre cada tela do ERP.html para um arquivo `telas-*.js`, uma por vez, apagando os
   remendos correspondentes. Meta: `montar-erp.js` sem remendos e o ERP.html só como casca.
   Se não der para migrar tudo nesta conversa, migre o que for seguro e deixe no `CLAUDE.md` a lista do que falta.
2. **Um único jeito de abrir janela, tabela e formulário** (`abrirJanela`, `tabela()`, `campo()`), apagando as
   versões paralelas do editor.js e do ERP.html.
3. **Uma função genérica de relatório** (colunas + linhas + CSV + clique na ficha), usada por Alertas,
   Painel, Financeiro e Clientes. Ela já existe em `telas-alertas.js` (`relatorioAlerta`).
4. **Apagar o `gestao.html`** só com a minha ordem: pergunte antes.

## Fase D — Integrações

1. **Cartão CNPJ:** mostrar na ficha do cliente os dados da Receita (razão social, CNAE, porte, abertura) e o
   histórico das alterações; alerta por e-mail quando alguma empresa ficar INAPTA/BAIXADA.
   A API que eu uso no Google Sheets é: [ESCREVA AQUI, ex.: ReceitaWS, CNPJá, BrasilAPI].
2. **Certidões automáticas** (CND federal/estadual/FGTS) com validade → Alertas. Antes, informe os custos das APIs.
3. **Boletos/PIX para honorários** (Asaas, Inter ou Sicoob) com baixa automática. Informe o custo por boleto antes.
4. **Google Agenda:** prazos fatais e audiências viram eventos na agenda de quem é responsável.
5. **WhatsApp** (API oficial): lembrete de parcelas de acordo e de honorários. Informe o custo por mensagem antes.
6. **Assinatura eletrônica de contratos** (ZapSign/Clicksign), com o PDF assinado anexado ao contrato.
   Informe o custo por documento antes.

Nos itens pagos: pesquise, me mostre uma tabela comparando custo e limites, e só programe depois que eu escolher.

## Fase E — Segurança e rotina

1. Painel **"Saúde do sistema"** em Alertas, com a última execução de cada rotina (já existe) e o tamanho do banco
   e do Storage (limites do plano grátis).
2. **Backup semanal automático** do banco (export) no Storage privado, guardando as últimas 8 cópias.
3. **Registro de acesso** (quem entrou, quando) e aviso de login de um aparelho novo.
4. Revisão de segurança (skill `security-review`), explicada em linguagem simples.
