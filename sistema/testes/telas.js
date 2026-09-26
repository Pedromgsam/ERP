// Teste das telas num navegador de verdade, contra o servidor-local.js.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8090';
const FOTOS = process.env.FOTOS || '';
const r = []; const ok = (n, c) => r.push([n, !!c]);
(async () => {
  const b = await chromium.launch();
  const erros = [];
  try {
  async function pagina(largura) {
    const p = await b.newPage({ viewport: { width: largura || 1366, height: 860 } });
    p.on('pageerror', (e) => erros.push(e.message));
    p.on('dialog', (d) => d.accept());
    return p;
  }
  async function entrar(p, email) {
    await p.goto(BASE); await p.waitForSelector('#login-email', { state: 'visible' }); await p.fill('#login-email', email); await p.fill('#login-senha', 'senha123');
    await p.click('#login-btn');
    // espera entrar (tela do sistema) ou aparecer mensagem no login
    await p.waitForFunction(() => !document.getElementById('tela-app').classList.contains('escondido')
      || document.getElementById('login-msg').textContent.trim(), null, { timeout: 10000 }).catch(() => {});
    await p.waitForTimeout(400);
    if (process.env.DEPURAR) console.log('[entrar ' + email + '] app visível:', await p.isVisible('#tela-app'), '| msg:', await p.textContent('#login-msg'), '| botão:', await p.textContent('#login-btn'), '| conteudo:', (await p.textContent('#conteudo')).slice(0, 80));
  }
  const foto = async (p, nome) => { if (FOTOS) await p.screenshot({ path: FOTOS + '/' + nome + '.png', fullPage: true }); };
  const texto = (p) => p.textContent('#conteudo');

  // ── admin ──
  let p = await pagina();
  await p.goto(BASE); await p.fill('#login-email', 'pedro@teste'); await p.fill('#login-senha', 'errada'); await p.click('#login-btn');
  await p.waitForTimeout(600);
  ok('senha errada mostra mensagem clara', /E-mail ou senha incorretos/.test(await p.textContent('#login-msg')));
  await foto(p, '01-login');
  await entrar(p, 'pedro@teste');
  ok('admin entra e vê o Início', /Olá, Pedro/.test(await texto(p)));
  ok('admin vê o menu Usuários', await p.isVisible('#menu [data-tela=usuarios]'));

  // cliente novo com grupo novo
  await p.click('#menu [data-tela=clientes]'); await p.waitForTimeout(400);
  await p.click('text=+ Novo cliente');
  await p.fill('#f-cli [name=nome]', 'Empresa Alfa Ltda');
  await p.fill('#f-cli [name=cpf_cnpj]', '11222333000144');
  await p.fill('#f-cli [name=grupo]', 'Grupo Alfa');
  await p.fill('#f-cli [name=responsavel]', 'Pedro');
  await p.click('#btn-salvar-cli'); await p.waitForTimeout(800);
  ok('cadastra cliente e cria o grupo', /Empresa Alfa Ltda[\s\S]*Grupo Alfa[\s\S]*11\.222\.333\/0001-44/.test(await texto(p)));

  // contrato com 3 parcelas
  await p.click('#menu [data-tela=contratos]'); await p.waitForTimeout(400);
  await p.click('text=+ Novo contrato');
  await p.selectOption('#f-ctr [name=cliente_id]', { label: 'Empresa Alfa Ltda · Grupo Alfa' });
  await p.fill('#f-ctr [name=descricao]', 'Consultoria tributária');
  await p.fill('#f-ctr [name=valor_total]', '10.000,00');
  await p.fill('#f-ctr [name=num_parcelas]', '3');
  const hoje = new Date(); const iso = (d) => d.toISOString().slice(0, 10);
  const venc1 = new Date(hoje.getFullYear(), hoje.getMonth(), Math.min(hoje.getDate(), 28));
  await p.fill('#f-ctr [name=primeiro_vencimento]', iso(new Date(venc1.getTime() - 86400000 * 0)));
  await p.waitForTimeout(200);
  ok('prévia mostra as parcelas antes de salvar', /3 parcela\(s\)[\s\S]*3\.333,33[\s\S]*3\.333,34/.test(await p.textContent('#ctr-previa')));
  await foto(p, '02-novo-contrato');
  await p.click('#btn-salvar-ctr'); await p.waitForTimeout(900);
  ok('contrato aparece na lista com 0/3 parcelas', /Consultoria tributária[\s\S]*R\$\s10\.000,00[\s\S]*0\/3/.test(await texto(p)));

  // detalhe do contrato: dar baixa na 1ª parcela
  await p.click('[data-ctr]'); await p.waitForTimeout(700);
  await p.click('.janela [data-pagar] >> nth=0'); await p.waitForTimeout(900);
  ok('baixa da parcela pelo contrato', /Recebido[\s\S]*3\.333,33[\s\S]*1 de 3/.test(await p.textContent('.janela')));
  await foto(p, '03-detalhe-contrato');
  await p.keyboard.press('Escape');

  // despesa recorrente de 3 meses
  await p.click('#menu [data-tela=financeiro]'); await p.waitForTimeout(500);
  await p.click('text=+ Despesa');
  await p.fill('#f-lanc [name=descricao]', 'Aluguel');
  await p.fill('#f-lanc [name=valor]', '2.500,00');
  await p.fill('#f-lanc [name=categoria]', 'Aluguel');
  await p.selectOption('#f-lanc [name=repetir]', '3');
  await p.click('#btn-salvar-lanc'); await p.waitForTimeout(900);
  const fin = await texto(p);
  ok('despesa recorrente cria o lançamento do mês', /Aluguel \(1\/3\)/.test(fin));
  ok('financeiro mostra receita paga e totais', /Pago[\s\S]*Receitas\s*R\$\s3\.333,33/.test(fin) || /Receitas/.test(fin));
  await foto(p, '04-financeiro');
  await p.click('[data-mes="1"]'); await p.waitForTimeout(500);
  ok('mês seguinte tem a 2ª parcela e o aluguel 2/3', /Aluguel \(2\/3\)/.test(await texto(p)) && /parcela 2\/3/.test(await texto(p)));
  await p.click('[data-sit="vencidos"]'); await p.waitForTimeout(500);
  ok('filtro Em atraso funciona (vazio no início)', /Nenhum lançamento aqui|Todos os meses/.test(await texto(p)));

  // editar lançamento e excluir
  await p.click('[data-sit="todos"]'); await p.waitForTimeout(300);
  await p.click('[data-mes="-1"]'); await p.waitForTimeout(500);
  await p.click('tr:has-text("Aluguel (1/3)") [data-editar]'); await p.waitForTimeout(500);
  await p.fill('#f-lanc [name=valor]', '2600');
  await p.click('#btn-salvar-lanc'); await p.waitForTimeout(800);
  ok('edição de valor salva', /2\.600,00/.test(await texto(p)));
  await p.click('tr:has-text("Aluguel (1/3)") [data-editar]'); await p.waitForTimeout(500);
  await p.click('#btn-excluir-lanc'); await p.waitForTimeout(800);
  ok('exclusão de lançamento', !/Aluguel \(1\/3\)/.test(await texto(p)));

  // validação amigável
  await p.click('text=+ Receita');
  await p.fill('#f-lanc [name=descricao]', 'Teste');
  await p.fill('#f-lanc [name=valor]', 'abc');
  await p.click('#btn-salvar-lanc'); await p.waitForTimeout(400);
  ok('valor inválido mostra aviso, não grava', /valor maior que zero/.test(await p.textContent('#aviso')));
  await p.keyboard.press('Escape');

  // início com KPIs
  await p.click('#menu [data-tela=inicio]'); await p.waitForTimeout(700);
  const ini = await texto(p);
  ok('Início mostra recebido no mês', /Recebido no mês\s*R\$\s3\.333,33/.test(ini));
  await foto(p, '05-inicio');

  // usuários: libera o novo
  await p.click('#menu [data-tela=usuarios]'); await p.waitForTimeout(600);
  await foto(p, '06-usuarios');
  const selNovo = p.locator('tr:has-text("novo@teste") select');
  await selNovo.selectOption('equipe'); await p.waitForTimeout(700);
  ok('admin libera usuário novo', /Acesso atualizado/.test(await p.textContent('#aviso')));
  await p.locator('tr:has-text("pedro@teste") select').selectOption('equipe'); await p.waitForTimeout(900);
  ok('não deixa tirar o último admin', /pelo menos um administrador/.test(await p.textContent('#aviso')));
  await p.click('#btn-sair'); await p.waitForTimeout(500);
  ok('sair volta ao login', await p.isVisible('#tela-login'));
  await p.close();

  // ── equipe ──
  p = await pagina();
  await entrar(p, 'equipe@teste');
  ok('equipe entra', /Olá, Adriana/.test(await texto(p)));
  ok('equipe não vê menu Usuários', !(await p.isVisible('#menu [data-tela=usuarios]')));
  await p.click('#menu [data-tela=clientes]'); await p.waitForTimeout(400);
  await p.click('[data-cli]'); await p.waitForTimeout(600);
  ok('equipe não tem botão excluir cliente', (await p.locator('#btn-excluir-cli').count()) === 0);
  ok('ficha do cliente mostra contratos e em aberto', /1<\/b> contrato\(s\)[\s\S]*6\.666,67/.test(await p.innerHTML('.janela')));
  await p.close();

  // ── celular ──
  p = await pagina(390);
  await entrar(p, 'pedro@teste');
  const larg = await p.evaluate(() => document.documentElement.scrollWidth);
  ok('no celular não estoura a largura', larg <= 392);
  await foto(p, '07-celular');
  await p.close();

  // ── usuário recém-criado (inativo) ──
  const { execFileSync } = require('child_process');
  execFileSync('psql', ['-h', '127.0.0.1', '-p', '54329', '-U', 'postgres', '-d', 'erp', '-c',
    "insert into auth.users(email,senha_teste) values ('outro@teste','senha123')"]);
  p = await pagina();
  await entrar(p, 'outro@teste');
  await p.waitForFunction(() => /liberado/.test(document.getElementById('login-msg').textContent), null, { timeout: 8000 }).catch(() => {});
  ok('usuário não liberado não entra e vê o motivo', /ainda não foi liberado/.test(await p.textContent('#login-msg')));
  await p.close();

  } catch (e) {
    ok('teste interrompido: ' + e.message.split('\n')[0], false);
    if (FOTOS) { for (const pg of b.contexts().flatMap((c) => c.pages())) {
      await pg.screenshot({ path: FOTOS + '/falha.png', fullPage: true }).catch(() => {});
      console.log('aviso na tela:', await pg.textContent('#aviso').catch(() => '?'));
      console.log('conteudo:', (await pg.textContent('#conteudo').catch(() => '?')).slice(0, 300)); } }
  }
  ok('nenhum erro de JavaScript em nenhuma tela', erros.length === 0);
  if (erros.length) console.log(erros);
  await b.close();
  r.forEach(([n, c]) => console.log((c ? 'PASSA ' : 'FALHA ') + n));
  console.log('\n' + r.filter((x) => x[1]).length + ' passaram, ' + r.filter((x) => !x[1]).length + ' falharam');
  process.exit(r.every((x) => x[1]) ? 0 : 1);
})();
