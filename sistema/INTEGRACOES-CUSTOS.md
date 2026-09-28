# Integrações pagas: custos para decidir (pesquisa de 28/09/2026)

**Nada disso foi contratado nem programado.** Pelas regras do projeto, cada item só é feito depois que você escolher.

Os preços são os publicados pelos fornecedores e podem mudar. Confira no site antes de contratar.

## 1. Boleto e PIX dos honorários, com baixa automática

| Opção | Custo | Observação |
|---|---|---|
| **Asaas** | Sem mensalidade. **R$ 1,99 por boleto ou PIX pago** (R$ 0,99 nos 3 primeiros meses). As 100 primeiras transações PIX por chave/QR estático no mês são isentas | API simples; avisa o sistema quando o cliente paga (webhook) |
| **Banco Inter (API Cobrança)** | Integração grátis. PIX cobrança **0,9% a 0,99% do valor**, mínimo R$ 0,10, acima da cota gratuita da conta | Precisa de conta PJ Inter e certificado da API |
| Sicoob | Depende da cooperativa (negociado) | Só vale se o escritório já tem conta lá |

**Recomendação:** Asaas, pela simplicidade.
- Num honorário de R$ 1.621, o Inter cobraria cerca de R$ 16 por PIX, contra R$ 1,99 no Asaas.
- Com 150 cobranças por mês: cerca de **R$ 300 por mês** no Asaas.

## 2. Certidões automáticas (CND federal, estadual MG e FGTS)

| Opção | Custo | Observação |
|---|---|---|
| **Infosimples** | Por consulta, **sob consulta** (o site não mostra o preço aberto) | Cobre CND Federal/PGFN, SEFAZ de todos os estados e FGTS numa API só |
| API CND do gov.br (Conecta) | Grátis | **Só para órgãos públicos**; um escritório não consegue usar |

**Recomendação:** pedir orçamento à Infosimples informando o volume, por exemplo 189 empresas × 3 certidões por mês.

## 3. Lembretes por WhatsApp (API oficial da Meta)

| Tipo de mensagem | Custo por mensagem |
|---|---|
| Utilidade (lembrete de vencimento) | **cerca de R$ 0,034** (US$ 0,0068) |

- Desde julho de 2026, a Meta cobra em reais no Brasil.
- Também é preciso um provedor (BSP) ou o próprio app da Meta: de grátis a cerca de R$ 100 por mês, conforme o fornecedor.
- **Com 300 lembretes por mês:** cerca de R$ 10 em mensagens + o provedor.

## 4. Assinatura eletrônica de contratos

| Opção | Custo | Observação |
|---|---|---|
| **ZapSign** | Grátis até 5 documentos/mês. **Profissional R$ 29,90/mês**, Completo R$ 79,90/mês. Com certificado digital: + R$ 0,50 por assinatura | Tem API; o PDF assinado volta para o sistema |
| Clicksign | A partir de **R$ 39/mês** | Tem API |
| D4Sign | Plano mensal (consultar) | Tem API |

Todas têm validade jurídica: assinatura avançada, conforme a MP 2.200-2/01 e a Lei 14.063/20.

**Recomendação:** ZapSign Profissional, se forem até ~30 contratos por mês.

## 5. Google Agenda (prazos fatais e audiências)

**Sem custo.** A API do Google Agenda é gratuita nesse volume. Falta só decidir como cada pessoa autoriza:
- **(a)** cada pessoa entra uma vez com a conta Google e autoriza; ou
- **(b)** uma agenda do escritório, compartilhada com todos.

A opção (b) é mais simples.

---

### Fontes
- [Asaas — preços e taxas](https://www.asaas.com/precos-e-taxas) · [Asaas — boleto](https://www.asaas.com/boleto-bancario)
- [Inter — API Pix](https://inter.co/empresas/api-pix/) · [Inter — API Cobrança](https://developers.inter.co/references/cobranca-bolepix) · [Wise — Inter cobra Pix PJ?](https://wise.com/br/blog/banco-inter-cobra-pix-pj)
- [Infosimples — CND Federal](https://infosimples.com/consultas/receita-federal-pgfn/) · [gov.br Conecta — API CND](https://www.gov.br/conecta/catalogo/apis/consultar-certidao-negativa-de-debito)
- [WizeBot — tabela WhatsApp API 2026](https://wizebot.com.br/blog/tabela-precos-whatsapp-business-api-2026) · [NimoChat — preço API oficial 2026](https://www.nimochat.com.br/blog/geral/quanto-custa-api-oficial-whatsapp-waba-2026/)
- [ZapSign — planos](https://blog.zapsign.com.br/zapsign-planos/) · [Clicksign — preços](https://www.clicksign.com/en/preco) · [Comparativo 2026](https://www.signdocs.com.br/assinatura-digital-mais-barata-brasil.html)
