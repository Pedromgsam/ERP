# Como atualizar o sistema (passo a passo)

Toda mudança chega como uma **pull request** no GitHub. Siga sempre esta ordem.

## 1. Banco de dados (só quando a mudança pedir)
A descrição da pull request diz se há SQL para rodar. Se houver:

1. Abra o **Supabase** → seu projeto → **SQL Editor** (ícone `>_` no menu da esquerda) → **New query**.
2. No GitHub, abra o arquivo indicado (ex.: `sistema/banco/estrutura.sql`).
   Clique no botão **Copy raw file** (dois quadradinhos, no canto direito acima do código).
3. Volte ao Supabase, clique na área de texto, **Ctrl+A** (apaga o que houver) e **Ctrl+V**.
4. Clique em **Run**. O certo é aparecer **"Success. No rows returned"** embaixo.
5. Se houver um segundo arquivo (ex.: `sistema/banco/dados-recibos.sql`), repita os passos 2 a 4.

Os arquivos podem ser rodados quantas vezes quiser: não apagam nada.
Se aparecer **ERROR** em vermelho: tire um print e mande antes de continuar.

## 2. Publicar as telas
1. No GitHub, abra a pull request → botão verde **Merge pull request** → **Confirm merge**.
2. Espere uns 2 minutos (a Vercel publica sozinha).

## 3. Conferir
1. Abra o ERP e aperte **Ctrl+Shift+R** (recarrega sem cache).
2. Entre com seu e-mail e senha.
3. Se aparecer um aviso amarelo embaixo, ele diz o que falta. Se algo estiver estranho, mande um print.
