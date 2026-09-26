# ERP — Escritório de Advocacia

ERP interno do escritório, composto por três partes:

| Camada | Tecnologia | Onde fica neste repositório |
|---|---|---|
| Interface | HTML / CSS / JavaScript | `apps-script/*.html` |
| Integração (back-end) | Google Apps Script (`.gs`) | `apps-script/*.gs` |
| Base de dados | Google Sheets | **fora do repositório** (só o código é versionado) |

> ⚠️ **Este repositório deve ser PRIVADO.** Nunca faça commit de dados de clientes,
> exportações da planilha (CSV/XLSX), senhas, tokens ou chaves de API (LGPD / sigilo profissional).

## Estrutura

```
ERP/
├── apps-script/            # código do projeto Apps Script (sincronizado via clasp)
│   ├── appsscript.json     # manifesto do projeto
│   ├── *.gs                # funções de servidor (leitura/gravação na planilha)
│   └── *.html              # telas do ERP
├── docs/
│   └── estrutura-planilha.md   # abas e colunas da base de dados
├── .clasp.json.example     # modelo de configuração do clasp
└── .gitignore
```

## Como sincronizar o Apps Script com o GitHub (clasp)

O [clasp](https://github.com/google/clasp) é a ferramenta oficial do Google para baixar
e enviar o código do Apps Script pela linha de comando.

1. Instale o Node.js e depois o clasp:
   ```bash
   npm install -g @google/clasp
   ```
2. Ative a API do Apps Script em <https://script.google.com/home/usersettings>.
3. Faça login:
   ```bash
   clasp login
   ```
4. Copie o modelo de configuração e preencha o **Script ID**
   (no editor do Apps Script: *Configurações do projeto → ID do script*):
   ```bash
   cp .clasp.json.example .clasp.json
   ```
5. Baixe o código atual do Google para a pasta `apps-script/`:
   ```bash
   clasp pull
   ```
6. Faça o commit:
   ```bash
   git add apps-script
   git commit -m "Importa código atual do Apps Script"
   git push
   ```

### Fluxo do dia a dia

- **Editou no navegador (editor do Apps Script)?** → `clasp pull`, depois `git commit` e `git push`.
- **Editou no computador / pelo GitHub?** → `git pull`, depois `clasp push` para publicar no Google.
- Para atualizar o app web publicado: `clasp deploy` (ou *Implantar → Gerenciar implantações* no editor).

## Sem usar a linha de comando

Também é possível copiar e colar cada arquivo do editor do Apps Script para a pasta
`apps-script/` direto pelo site do GitHub (*Add file → Create new file*). Use a extensão
`.gs` para scripts e `.html` para telas.
