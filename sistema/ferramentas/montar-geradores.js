// Monta sistema/app/geradores/ a partir dos HTML de "#Sistemas" (Backup 16).
// Cada gerador vira uma página própria (só carrega quando aberta, sem pesar no ERP), ganha a
// "ponte" com o banco (login, dados do cliente, guardar em Documentos) e perde os dados sensíveis:
// as contas bancárias/PIX dos advogados saem do arquivo público e vão para a tabela configuracoes
// (SQL gerado em sistema/banco/dados-recibos.sql, junto dos dados dos recibos).
// Uso: node sistema/ferramentas/montar-geradores.js (o montar-erp.js já chama no fim).
const fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..', '..');
const SIS = path.join(raiz, '#Sistemas'), DEST = path.join(raiz, 'sistema', 'app', 'geradores');

const ponte = (cfg) => '\n<script>\n// ligação com o ERP (ponte.js) — gerado por ferramentas/montar-geradores.js\nwindow.GERADOR = ' + cfg + ';\n</script>\n' +
  '<script src="../vendor/supabase.js"></script>\n<script src="../config.js"></script>\n<script src="ponte.js"></script>\n';

// preenchimento de pessoa física/jurídica nos dois blocos do gerador de contrato (contratante e outorgante)
const preencherPessoa = (px, telPF) => "if (c.pj) { f.marcar('" + px + "Tipo','pj'); f.por('" + px + "Razao', c.nome); f.por('" + px + "EnderecoPJ', c.endereco); f.por('" + px + "RepNome', c.rep); f.por('" + px + "RepCpf', c.repDoc);" +
  " f.por('" + px + "EmailPJ', c.email); f.por('" + px + "WppPJ', c.telefone); var cn = document.getElementById('" + px + "Cnpj'); if (cn) { cn.value = c.doc; } }" +
  " else { f.marcar('" + px + "Tipo','pf'); f.por('" + px + "Nome', c.nome); f.por('" + px + "Cpf', c.doc); f.por('" + px + "Endereco', c.endereco); f.por('" + px + "Email', c.email); f.por('" + px + "" + telPF + "', c.telefone); }";

const GERADORES = [
  { src: '8 - Gerador de Contrato e Procuração/Gerador de Contrato e Procuração.html', dst: 'contrato-procuracao.html',
    cfg: "{ titulo: 'Contrato e Procuração', tipoDocumento: function () { var p = document.querySelector('.panel.active'); return p && p.id === 'panel-procuracao' ? 'procuracao' : 'contrato'; },\n" +
      "  nomeArquivo: function () { var p = document.querySelector('.panel.active'); return p && p.id === 'panel-procuracao' ? 'Procuração' : 'Contrato de honorários'; },\n" +
      "  aoEntrar: async function (sb) { var r = await sb.from('configuracoes').select('valor').eq('chave', 'geradores_bancos').maybeSingle(); if (r.data && r.data.valor) Object.assign(BANCOS, r.data.valor);\n" +
      "    try { if (typeof renderContrato === 'function') renderContrato(); } catch (e) {} },\n" +
      "  preencher: function (c, f) { " + preencherPessoa('ctte', 'Wpp') + " " + preencherPessoa('out', 'Telefone') + "\n" +
      "    try { renderContrato(); } catch (e) {} try { renderProcuracao(); } catch (e) {} },\n" +
      // Backup 26: valores do contrato do ERP (serviço pontual → Valor Fixo à vista/parcelado; consultoria → mensalidade)
      "  preencherContrato: function (ct, f) { var md = function (v) { return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); };\n" +
      "    var MES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];\n" +
      "    if (ct.modalidade === 'consultoria') { f.marcar('tipoServico', 'consultoria');\n" +
      "      if (ct.forma_valor === 'salario_minimo') { f.por('honC_recForma', 'sm'); f.por('honC_recQtdSm', String(ct.qtd_salarios || '').replace('.', ',')); } else { f.por('honC_recForma', 'rs'); f.por('honC_recValor', md(ct.valor_mensal)); }\n" +
      "      f.por('honC_recDia', String(ct.dia_vencimento || 10)); if (ct.inicio_competencia) { var d = new Date(ct.inicio_competencia + 'T12:00:00'); f.por('honC_recInicio', MES[d.getMonth()] + ' de ' + d.getFullYear()); }\n" +
      "    } else { f.marcar('tipoServico', 'demanda'); var card = document.getElementById('honD-fixo'); if (card && !card.classList.contains('is-active')) card.classList.add('is-active');\n" +
      "      f.por('honD_fixoForma', 'rs'); f.por('honD_fixoValor', md(ct.valor_total));\n" +
      "      if (Number(ct.num_parcelas) > 1) { f.por('honD_fixoFormaPg', 'parcelado'); f.por('honD_fixoParcNum', String(ct.num_parcelas)); if (ct.primeiro_vencimento) f.por('honD_fixoParcInicio', ct.primeiro_vencimento); try { gerarParcelasFixo('honD_fixo'); } catch (e) {} }\n" +
      "      else if (ct.primeiro_vencimento) { f.por('honD_fixoFormaPg', 'vista'); f.por('honD_fixoDataEspecifica', ct.primeiro_vencimento); } }\n" +
      "    try { renderContrato(); } catch (e) {} },\n" +
      "  guardar: function () { var p = document.querySelector('.panel.active'); if (!p) return ''; var partes = []; p.querySelectorAll('[data-pdf]').forEach(function (s) { if (s.offsetParent !== null) partes.push(s.outerHTML); });\n" +
      "    return partes.join('<div style=\"page-break-after:always\"></div>'); } }",
    limpar: (s, extra) => {
      const m = s.match(/var BANCOS=(\{[\s\S]*?\n\});/);
      if (!m) throw new Error('BANCOS não encontrado no gerador de contrato');
      extra.bancos = require('vm').runInNewContext('(' + m[1] + ')');
      return s.replace(m[0], 'var BANCOS={}; // contas e PIX vêm do banco depois do login (configuracoes.geradores_bancos)');
    } },
  { src: '7 - Documentos/Solicitação de Documentos.html', dst: 'solicitacao-documentos.html',
    cfg: "{ titulo: 'Solicitação de Documentos', tipoDocumento: 'outro', nomeArquivo: function () { return 'Solicitação de documentos'; },\n" +
      "  preencher: function (c, f) { f.por('inNomeCliente', c.nome); f.por('inEmailCliente', c.email); f.por('inTelCliente', c.telefone); },\n" +
      "  guardar: function () { var p = document.getElementById('papelPreview'); return p ? p.outerHTML : ''; } }" },
  { src: '15 - Propostas/Gerador de Propostas.html', dst: 'propostas.html',
    cfg: "{ titulo: 'Gerador de Propostas', tipoDocumento: 'proposta', nomeArquivo: function () { return 'Proposta'; },\n" +
      "  preencher: function (c, f) { f.por('inCliente', c.nome); },\n" +
      "  guardar: function () { var p = document.getElementById('apresPrev'); return p ? p.outerHTML : ''; } }" },
  { src: '10 - Emails/Modelos de E-mail - Implantação.html', dst: 'modelos-email.html',
    cfg: "{ titulo: 'Modelos de E-mail', preencher: function (c, f) { f.por('inGrupo', c.nome); },\n" +
      "  enviarEmail: function () { var a = document.getElementById('previewAssunto'), b = document.getElementById('previewCorpo'); return { assunto: a ? a.innerText.trim() : '', texto: b ? b.innerText.trim() : '' }; } }" }
];

function montar() {
  fs.mkdirSync(DEST, { recursive: true });
  const extra = {};
  for (const g of GERADORES) {
    let s = fs.readFileSync(path.join(SIS, g.src), 'utf8');
    if (g.limpar) s = g.limpar(s, extra);
    if (/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/.test(s.replace(/placeholder="[^"]*"/g, ''))) throw new Error('CPF no gerador ' + g.dst + ' — revise antes de publicar');
    const i = s.lastIndexOf('</body>'); if (i < 0) throw new Error('</body> não encontrado em ' + g.dst);
    s = s.slice(0, i) + ponte(g.cfg) + s.slice(i);
    if (!/name="robots"/.test(s)) s = s.replace(/<head>/i, '<head>\n<meta name="robots" content="noindex, nofollow">');
    fs.writeFileSync(path.join(DEST, g.dst), s);
  }
  // contas dos advogados → SQL (arquivo privado do repositório; rodar uma vez no Supabase)
  if (extra.bancos) {
    const arq = path.join(raiz, 'sistema', 'banco', 'dados-recibos.sql');
    let sql = fs.existsSync(arq) ? fs.readFileSync(arq, 'utf8').replace(/\n-- Contas para recebimento[\s\S]*$/, '') : '';
    sql += "\n-- Contas para recebimento dos honorários (gerador de contrato). Gerado por ferramentas/montar-geradores.js.\n" +
      "insert into public.configuracoes (chave, valor) values ('geradores_bancos', '" + JSON.stringify(extra.bancos).replace(/'/g, "''") + "'::jsonb)\n" +
      'on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();\n';
    fs.writeFileSync(arq, sql);
  }
  console.log('geradores: ' + GERADORES.length + ' páginas + petição em sistema/app/geradores/');
}
module.exports = { montar };
if (require.main === module) montar();
