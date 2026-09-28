# Próximas melhorias — um prompt por conversa

Cada bloco abaixo é **uma conversa nova**. Copie o texto que está dentro da caixa cinza e cole como primeira mensagem.

**Regras para não dar conflito:**
1. **Uma conversa por vez.** Só abra a próxima depois de fazer o Merge da PR da anterior.
2. Siga a ordem numérica. As conversas 1 a 3 mexem em muitos arquivos. As de integração (4 a 10) são independentes
   e podem ir em qualquer ordem, depois da 3.
3. Ao final de cada conversa, confira se ela atualizou o `CLAUDE.md` (o prompt já pede).

Todos os prompts começam com "Leia o CLAUDE.md". É ali que estão as suas regras e o funcionamento do sistema.

---

## 1. Desempenho (o sistema abrir mais rápido)

```
Leia o CLAUDE.md e siga as regras e o jeito de entregar que estão lá.
Antes de mudar qualquer coisa, prepare o ambiente de testes descrito no CLAUDE.md e rode todos os testes para ver que passam.

Tarefa: deixar o ERP mais rápido sem perder nenhuma função.
1. Cache: no sistema/app/vercel.json, cache longo (public, max-age=31536000, immutable) para /vendor/* e no-cache só nos .html.
   Para os .js/.css próprios, gere nomes com versão no montar-erp.js (ex.: gestao-embutida.3f9a.js).
2. Carregar vendor/exceljs.min.js só quando for importar ou exportar Excel (não no login).
3. Tirar as imagens em base64 de dentro do index.html e passar para arquivos em sistema/app/img/.
4. Trocar select('*') por colunas explícitas onde a tela não usa tudo (principalmente clientes, que tem cnpj_dados).
5. carregarCadastros(): guardar em memória por 60 s e invalidar depois de gravar.
6. Índices no banco: lancamentos(empresa, pago, vencimento), acordos(pago, vencimento), tarefas(status, prazo), publicacoes(status).
Meça antes e depois (tamanho baixado e tempo até o Painel aparecer) e me mostre a comparação em linguagem simples.
```

## 2. Simplificação do código

```
Leia o CLAUDE.md e siga as regras e o jeito de entregar que estão lá.
Antes de mudar qualquer coisa, prepare o ambiente de testes descrito no CLAUDE.md e rode todos os testes para ver que passam.

Tarefa: simplificar o código sem mudar o que eu vejo nem perder função.
Hoje as telas existem duas vezes: no ERP antigo (#Sistemas/2 - ERP/ERP.html, ~10 mil linhas, remendado por dezenas de
trocar() no sistema/ferramentas/montar-erp.js) e nas telas novas (sistema/app/telas-*.js).
1. Faça um inventário: quais telas do ERP.html ainda são usadas, quais remendos existem e o que pode ser apagado já.
   Me mostre a lista antes de começar.
2. Migre UMA tela por vez do ERP.html para um arquivo telas-*.js, apagando os remendos correspondentes.
   Comece pela mais simples. Uma PR por tela (ou por grupo pequeno), com todos os testes passando em cada uma.
3. Unifique janela, tabela e relatório (abrirJanela, campo(), relatorioAlerta de telas-alertas.js) e remova as versões paralelas.
Não apague o gestao.html sem eu mandar.
```

## 3. Design

```
Leia o CLAUDE.md e siga as regras e o jeito de entregar que estão lá.
Use as skills telas-com-dados-ac e padrao-web-ac como referência visual.
Antes de mudar qualquer coisa, prepare o ambiente de testes descrito no CLAUDE.md e rode todos os testes para ver que passam.

Tarefa: revisão de design do ERP inteiro.
1. Um só conjunto de cores e tamanhos (variáveis em :root) para estilo.css, erp-telas.css e editor.css.
   Os tons de vermelho, âmbar e verde devem ser iguais em todas as telas.
2. Estados vazios com uma frase e um botão (ex.: "Nenhum contrato — + Novo contrato").
3. Tabelas longas: cabeçalho fixo ao rolar e paginação de 100 em 100.
4. Celular (390 px): Painel Executivo e Financeiro legíveis (tabelas viram cartões).
5. Acessibilidade: foco visível no teclado e aria-label nos botões que só têm ícone (✎, ⋯, 🔔).
Tire prints antes e depois (FOTOS=... node erp.js) e me mostre as principais diferenças.
```

## 4. Cartão CNPJ na ficha do cliente

```
Leia o CLAUDE.md e siga as regras e o jeito de entregar que estão lá.
A API de CNPJ que eu uso no Google Sheets é: [ESCREVA AQUI O NOME, ex.: ReceitaWS, CNPJá, BrasilAPI].
Tarefa:
1. Na ficha 360° do cliente, mostrar os dados da Receita (razão social, nome fantasia, CNAE, porte, abertura, situação,
   endereço) e o histórico de alterações vindo de cnpj_execucoes.
2. Quando alguma empresa ficar INAPTA, SUSPENSA ou BAIXADA, mandar um e-mail para o responsável e criar uma tarefa.
3. Se a API que eu uso ainda não for suportada pela função erp-cnpj, adicionar.
```

## 5. Certidões automáticas

```
Leia o CLAUDE.md e siga as regras e o jeito de entregar que estão lá.
Tarefa: emitir/consultar certidões (CND federal/PGFN, estadual MG, FGTS, trabalhista) dos clientes de forma automática,
guardando o PDF em Documentos e a validade em certidoes, com aviso em Alertas antes de vencer.
ANTES de programar: pesquise as opções (gratuitas e pagas), me mostre uma tabela com custo por consulta, limites e o que
cada uma cobre, e espere eu escolher.
```

## 6. Boletos e PIX dos honorários

```
Leia o CLAUDE.md e siga as regras e o jeito de entregar que estão lá.
Tarefa: gerar boleto/PIX para os honorários (lançamentos de receita) e dar baixa automática quando o cliente pagar.
ANTES de programar: compare Asaas, Banco Inter, Sicoob e outras opções (custo por boleto/PIX, mensalidade, facilidade de
integração) numa tabela e espere eu escolher. A chave da API fica só nos secrets do Supabase, nunca no site.
```

## 7. Google Agenda

```
Leia o CLAUDE.md e siga as regras e o jeito de entregar que estão lá.
Tarefa: prazos fatais, audiências e tarefas com prazo viram eventos no Google Agenda da pessoa responsável, e mudam
ou somem quando a tarefa muda ou é concluída. Explique antes como cada pessoa vai autorizar o acesso e se há custo.
```

## 8. WhatsApp

```
Leia o CLAUDE.md e siga as regras e o jeito de entregar que estão lá.
Tarefa: lembretes automáticos por WhatsApp (parcelas de acordo e honorários perto do vencimento), com modelo de
mensagem editável e registro do que foi enviado.
ANTES de programar: compare a API oficial do WhatsApp (Meta) e provedores (Z-API, Twilio etc.) com custo por mensagem
e riscos de bloqueio, e espere eu escolher.
```

## 9. Assinatura eletrônica de contratos

```
Leia o CLAUDE.md e siga as regras e o jeito de entregar que estão lá.
Tarefa: enviar o contrato para assinatura eletrônica a partir da tela de Contratos e, quando todos assinarem, guardar o PDF
assinado como anexo do contrato automaticamente.
ANTES de programar: compare ZapSign, Clicksign, D4Sign e outras (custo por documento, plano mensal, validade jurídica)
e espere eu escolher.
```

## 10. Segurança e rotina

```
Leia o CLAUDE.md e siga as regras e o jeito de entregar que estão lá.
Tarefa:
1. Em Alertas, cartão "Saúde do sistema": tamanho do banco e do Storage comparado com os limites do plano do Supabase.
2. Backup semanal automático dos dados no Storage privado, guardando as últimas 8 cópias, com botão para baixar.
3. Registro de acessos (quem entrou e quando) em Administração, e aviso quando alguém entrar de um aparelho novo.
Faça também uma revisão de segurança (skill security-review) e me explique em linguagem simples o que encontrou.
```
