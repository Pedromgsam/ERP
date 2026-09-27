# Como atualizar o sistema (passo a passo)

Toda mudança chega como uma **pull request** no GitHub. Siga sempre esta ordem.

## 1. Banco de dados (só quando a mudança pedir)
A descrição da pull request diz se há SQL para rodar. Se houver:

1. Abra o **Supabase** → seu projeto → **SQL Editor** (ícone `>_` no menu da esquerda) → **New query**.
2. No GitHub, abra o arquivo indicado (ex.: `sistema/banco/estrutura.sql`) e clique no botão **Raw**
   (acima do código, à direita). Abre uma página só com o texto.
3. Nessa página: **Ctrl+A** (seleciona tudo) e **Ctrl+C** (copia).
   Não selecione com o mouse: o GitHub não mostra o arquivo inteiro na tela e o final fica de fora.
4. Volte ao Supabase, clique na área de texto, **Ctrl+A** (apaga o que houver) e **Ctrl+V**.
5. **Confira o fim**: role até o final do editor do Supabase. O número da última linha tem que ser
   igual ao que a pull request informa (ex.: "o arquivo tem 571 linhas"). Se for menor, faltou texto: repita o passo 2.
6. Clique em **Run**. Se aparecer um aviso sobre "destructive operations", clique em **Run this query**
   (o arquivo só recria regras de acesso; não apaga dados).
7. O certo é aparecer **"Success. No rows returned"** embaixo.
8. Se houver um segundo arquivo (ex.: `sistema/banco/dados-recibos.sql`), repita os passos 2 a 7.

Os arquivos podem ser rodados quantas vezes quiser: não apagam nada.
Se aparecer **ERROR** em vermelho: tire um print e mande antes de continuar.

## 2. Publicar as telas
1. No GitHub, abra a pull request → botão verde **Merge pull request** → **Confirm merge**.
2. Espere uns 2 minutos (a Vercel publica sozinha).

## 3. Conferir
1. Abra o ERP e aperte **Ctrl+Shift+R** (recarrega sem cache).
2. Entre com seu e-mail e senha.
3. Se aparecer um aviso amarelo embaixo, ele diz o que falta. Se algo estiver estranho, mande um print.

## Não gostei: como voltar para a versão anterior

Há três "voltas", conforme o que você quer desfazer.

### A. Voltar as TELAS (o mais comum) — pela Vercel, 1 minuto
Cada publicação fica guardada na Vercel. Para voltar:
1. Entre em **vercel.com** → projeto **erp** → aba **Deployments**.
2. Ache a publicação anterior (a lista mostra data e hora; a atual está no topo com a etiqueta **Current**).
3. Clique nos **três pontinhos (⋯)** dessa publicação anterior → **Instant Rollback** (ou **Promote**) → confirme.
4. Em segundos o site volta a ser o anterior. Os **dados não mudam**: tudo o que foi lançado continua no banco.

Enquanto estiver "voltado", novas pull requests que você juntar **não** vão ao ar sozinhas.
Quando quiser seguir em frente, faça o mesmo na publicação mais nova (⋯ → Promote) ou me peça.

### B. Voltar de vez (desfazer a mudança no GitHub)
1. No GitHub, abra a pull request já juntada (aba **Pull requests** → **Closed**).
2. Clique em **Revert** (no fim da página). O GitHub cria uma nova pull request que desfaz a anterior.
3. Clique em **Merge pull request** nela. Em 2 minutos a Vercel publica a versão anterior.

### C. Voltar os DADOS (se algo foi gravado errado)
- Um registro só: abra o registro (✎) → **🕘 Ver alterações** mostra quem mudou o quê e o valor anterior;
  corrija à mão.
- Muitos registros: use o arquivo de **Backup** (Administração → Backup). Faça backup **antes** de
  importações grandes. Para restaurar a partir de um backup, me chame: eu preparo a restauração com você.

### O Gestão antigo continua lá
Em **Administração → "Abrir o Gestão (versão anterior)"**, ou no endereço do site com `/gestao.html` no fim.
Ele usa os mesmos dados; nada se perde usando um ou outro.
