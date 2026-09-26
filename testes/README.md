# Testes

Rodam sem acessar o Google: simulam o Apps Script com uma planilha falsa.

| Arquivo | O que verifica | Como rodar |
|---|---|---|
| `seguranca-script-erp.js` | Regras de acesso do `SCRIPT - MENU - ERP.gs` (login, token, cliente x admin, bloqueio por tentativas) | `node testes/seguranca-script-erp.js` |
| `login-navegador.js` | Login do `ERP.html` e do `Tarefas.html` num navegador de verdade (Chromium/Playwright) | `node testes/login-navegador.js` |

Passar o caminho de outro script como argumento testa aquela versão.
