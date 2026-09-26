# Sistemas do Escritório — Araújo & Castro

> **Sistema novo (sem planilha):** ver [`sistema/README.md`](sistema/README.md) — ERP online com
> banco de dados (Supabase) e login. As pastas `#Sistemas/` abaixo são os HTMLs atuais, que
> continuam funcionando durante a migração.

Sistemas internos do escritório, compostos por três partes:

| Camada | O que é | Onde fica |
|---|---|---|
| Telas | Arquivos `.html` abertos no computador (ERP, CRM, Tarefas, Portal, geradores de documentos etc.) | `#Sistemas/` |
| Ponte | Scripts do Google Apps Script, publicados como app da web (`script.google.com/.../exec`) | Rodam no Google; cópia do código em `#Sistemas/**/SCRIPT - *.txt` |
| Dados | Planilhas Google Sheets | No Google Drive — **fora do repositório** (os `.gsheet` aqui são só atalhos) |

> ⚠️ **Este repositório deve continuar PRIVADO.** Os HTMLs contêm o endereço dos scripts,
> que dão acesso às planilhas. Nunca faça commit de exportações das planilhas (CSV/XLSX),
> senhas, tokens ou documentos com dados de clientes (LGPD / sigilo profissional).

## Pastas

| Pasta | Conteúdo |
|---|---|
| `#Sistemas/##Planilhas` | Atalhos das planilhas e o script da Base de Dados |
| `#Sistemas/1 - Portal do Escritório` | Portal de entrada |
| `#Sistemas/2 - ERP` | `ERP.html` + script `SCRIPT - MENU - ERP` |
| `#Sistemas/3 - CRM` / `4 - Tarefas` | CRM e Tarefas |
| `#Sistemas/5` a `#Sistemas/15` | Planejamento tributário, holding, documentos, contratos, e-mails, societário, apresentações, manual, contabilidade, propostas |

## Como usar no dia a dia (GitHub Desktop)

**Receber alterações feitas pelo Claude:**
1. Abra o GitHub Desktop.
2. Clique em **Fetch origin** e depois em **Pull origin**.
3. Os arquivos da pasta são atualizados; abra os HTMLs normalmente.

**Enviar alterações feitas por você:**
1. No GitHub Desktop, confira a lista em **Changes** (desmarque o que não deve subir).
2. Escreva um resumo em **Summary** e clique em **Commit**.
3. Clique em **Push origin**.

**Voltar uma versão:** aba **History** → clique com o botão direito no commit → *Revert changes in commit*.

## Scripts do Google (Apps Script)

O código que roda de verdade fica no editor do Apps Script. Quando uma alteração
envolver o script, o Claude entrega o código pronto; basta colar no editor e
**Implantar → Gerenciar implantações → editar → Nova versão** (assim o endereço `/exec`
continua o mesmo e os HTMLs não precisam mudar).

Depois de colar, atualize a cópia `.txt` correspondente neste repositório e faça commit,
para o histórico continuar fiel ao que está no ar.

## Backups

O histórico do Git substitui os arquivos "backup 2026-…". Não é mais necessário salvar
cópias com data no nome: toda versão enviada fica guardada e pode ser recuperada.
