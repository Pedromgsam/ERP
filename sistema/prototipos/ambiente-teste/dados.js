/* Dados de exemplo do ambiente de teste — TODOS fictícios (LGPD). Hoje = 12/10/2026 (segunda-feira).
   Versão 4: todos os módulos do ERP (Painel, Processos, Parcelamentos, Acordos, Execuções, Publicações, Financeiro,
   Contratos, Clientes, CRM, Documentos, Rotina, Tarefas, E-mails). O que muda na tela fica só neste navegador. */
(function(){
  var DIA = 864e5, HOJE = new Date(2026, 9, 12);
  function noMes(a, m, d){ var u = new Date(a, m + 1, 0).getDate(); return new Date(a, m, Math.min(d, u)); }
  function dt(a, m, d){ return new Date(a, m - 1, d); }
  var semente = 7; function sorte(){ semente = (semente * 9301 + 49297) % 233280; return semente / 233280; }

  function gerar(){
    semente = 7;
    var D = { versao: 4 };
    D.equipe = [
      { id:'pedro', nome:'Pedro Castro', curto:'Pedro', cargo:'Administrador', email:'pedro@escritorio.teste' },
      { id:'emanuelle', nome:'Emanuelle Araújo', curto:'Emanuelle', cargo:'Sócia', email:'emanuelle@escritorio.teste' },
      { id:'adriana', nome:'Adriana Araújo', curto:'Adriana', cargo:'Sócia', email:'adriana@escritorio.teste' },
      { id:'lucas', nome:'Lucas Moreira', curto:'Lucas', cargo:'Estagiário', email:'lucas@escritorio.teste' }
    ];
    D.grupos = [
      { id:'g1', nome:'Grupo Horizonte', cor:1, resp:'pedro' },
      { id:'g2', nome:'Grupo Serra Azul', cor:2, resp:'pedro' },
      { id:'g3', nome:'Grupo Vale Verde', cor:3, resp:'emanuelle' },
      { id:'g4', nome:'Grupo Ipê Amarelo', cor:4, resp:'adriana' },
      { id:'g5', nome:'Grupo Rio Claro', cor:5, resp:'emanuelle' },
      { id:'g6', nome:'Grupo Lagoa Santa', cor:6, resp:'adriana' }
    ];
    // tipo: Consultoria | Serviço pontual | Inativo · area: juridico | contabilidade | ambos
    D.clientes = [
      { id:'c1', g:'g1', nome:'Comercial Horizonte de Alimentos Ltda', doc:'12.345.678/0001-90', email:'financeiro@horizontealimentos.teste', tel:'(31) 3333-1001', tipo:'Consultoria', area:'ambos', socio:'Marcos Horizonte' },
      { id:'c2', g:'g1', nome:'Horizonte Logística e Transportes Eireli', doc:'23.456.789/0001-01', email:'contato@horizontelog.teste', tel:'(31) 3333-1002', tipo:'Consultoria', area:'juridico', socio:'Marcos Horizonte' },
      { id:'c3', g:'g2', nome:'Serra Azul Comércio de Materiais de Construção Ltda', doc:'45.678.901/0001-23', email:'adm@serraazulmat.teste', tel:'(31) 3333-2001', tipo:'Consultoria', area:'ambos', socio:'Helena Serra' },
      { id:'c4', g:'g2', nome:'Serra Azul Serviços Ltda', doc:'56.789.012/0001-34', email:'servicos@serraazul.teste', tel:'(31) 3333-2002', tipo:'Serviço pontual', area:'juridico', socio:'Helena Serra' },
      { id:'c5', g:'g3', nome:'Vale Verde Indústria de Embalagens S.A.', doc:'34.567.890/0001-12', email:'financeiro@valeverde.teste', tel:'(31) 3333-3001', tipo:'Consultoria', area:'ambos', socio:'Rogério Vale' },
      { id:'c6', g:'g3', nome:'Mariana de Souza Vale', doc:'123.456.789-09', email:'mariana.vale@correio.teste', tel:'(31) 99999-3002', tipo:'Serviço pontual', area:'juridico', socio:'' },
      { id:'c7', g:'g4', nome:'Ipê Amarelo Farmácia de Manipulação Ltda', doc:'67.890.123/0001-45', email:'farmacia@ipeamarelo.teste', tel:'(31) 3333-4001', tipo:'Consultoria', area:'contabilidade', socio:'Joana Ipê' },
      { id:'c8', g:'g5', nome:'Rio Claro Engenharia e Obras Ltda', doc:'78.901.234/0001-56', email:'obras@rioclaro.teste', tel:'(31) 3333-5001', tipo:'Consultoria', area:'ambos', socio:'Fábio Rio' },
      { id:'c9', g:'g5', nome:'Rio Claro Participações Ltda', doc:'89.012.345/0001-67', email:'', tel:'', tipo:'Inativo', area:'juridico', socio:'Fábio Rio' },
      { id:'c10', g:'g6', nome:'Lagoa Santa Hotelaria Ltda', doc:'90.123.456/0001-78', email:'gerencia@lagoasanta.teste', tel:'(31) 3333-6001', tipo:'Consultoria', area:'contabilidade', socio:'Paula Lagoa' },
      { id:'c11', g:'g6', nome:'Lagoa Santa Eventos Eireli', doc:'01.234.567/0001-89', email:'eventos@lagoasanta.teste', tel:'(31) 3333-6002', tipo:'Serviço pontual', area:'juridico', socio:'Paula Lagoa' }
    ];
    // passivo (RFB · PGFN · AGE/MG): em aberto e negociado; CAPAG; procuração; certificado
    var PAS = { c1:[18200,42000,96300,120400,0,0,'B'], c2:[0,0,35800,61000,0,0,'C'], c3:[51200,88000,212000,140500,64000,0,'C'], c4:[0,0,74500,99000,0,0,'D'], c5:[122000,310000,0,85000,0,48000,'B'],
      c6:[0,0,18900,22000,0,0,'A'], c7:[0,46000,0,0,0,0,'A'], c8:[33600,120000,48000,96000,151000,67000,'C'], c9:[0,0,12000,0,0,0,'Omisso'], c10:[0,0,0,0,0,0,'A'], c11:[9100,0,0,0,0,0,'B'] };
    D.clientes.forEach(function(c, i){
      var p = PAS[c.id];
      c.passivo = { rfb:p[0], rfbNeg:p[1], pgfn:p[2], pgfnNeg:p[3], age:p[4], ageNeg:p[5] };
      c.capag = p[6]; c.procuracao = i % 4 !== 3; c.certificado = i % 5 === 4 ? null : dt(2027, 1 + (i * 2) % 12, 10 + i);
      c.conferido = i % 3 === 0 ? dt(2026, 10, 2 + i) : (i % 3 === 1 ? dt(2026, 9, 20) : null);
      c.recebeEmail = c.id !== 'c9'; c.resp = D.grupos.find(function(g){ return g.id === c.g; }).resp;
    });

    // ── parcelamentos: [cliente, plataforma, natureza, nº, total, pagas, vencidas sem pagar (conta hoje), dia, valor, cliente emite?]
    var P = [
      ['c1','e-CAC','Simples Nacional','10120.004512/2024-11',60,13,0,31,1284.90,0],
      ['c1','SIARE','ICMS','0045.778-2',36,4,1,25,1402.55,0],
      ['c2','Regularize','Previdenciário','2.093.551',120,7,0,12,612.35,0],
      ['c2','Regularize','Não previdenciário','2.093.120',60,30,0,1,745.20,0],
      ['c3','e-CAC','Simples Nacional','10120.001133/2023-77',60,30,1,30,2205.10,0],
      ['c3','SIARE','ICMS','0051.204-9',24,9,0,20,980.00,0],
      ['c4','Regularize','Não previdenciário','1.998.320',120,45,2,20,610.75,0],
      ['c5','e-CAC','INSS','10120.009871/2025-40',60,2,1,9,4910.00,0],
      ['c5','e-CAC','Simples Nacional','10120.004410/2024-02',60,19,0,5,1050.00,0],
      ['c6','Regularize','Não previdenciário','2.110.004',60,21,1,9,318.77,0],
      ['c7','e-CAC','Simples Nacional','10120.007733/2024-15',60,24,0,30,772.50,1],
      ['c8','e-CAC','Previdenciário','10120.011208/2025-33',48,11,0,15,1890.00,0],
      ['c8','SIARE','ICMS','0062.517-1',24,6,2,10,2340.00,0],
      ['c10','e-CAC','Simples Nacional','10120.020114/2026-01',60,3,0,28,890.00,0]
    ];
    D.parcelamentos = []; D.parcelas = [];
    P.forEach(function(r, i){
      var p = { id:'p'+(i+1), cli:r[0], plat:r[1], nat:r[2], num:r[3], tot:r[4], v:r[8], dia:r[7], cliEmite:!!r[9], obs:'' };
      D.parcelamentos.push(p);
      var ult = noMes(2026, 9, r[7]); if (ult > HOJE) ult = noMes(2026, 8, r[7]);
      var K = r[5] + r[6];
      for (var n = 1; n <= r[4]; n++){
        var venc = noMes(ult.getFullYear(), ult.getMonth() + (n - K), r[7]), paga = n <= r[5], em = null;
        if (!p.cliEmite){
          if (paga) em = new Date(venc - 6 * DIA);
          else if (venc <= HOJE) em = n % 2 ? new Date(venc - 5 * DIA) : null;
          else if (venc.getMonth() === 9 && venc.getFullYear() === 2026 && i % 2 === 0) em = new Date(2026, 9, 5);
        }
        D.parcelas.push({ id:p.id+'-'+n, pa:p.id, n:n, venc:venc, v:r[8], pago: paga ? new Date(venc - ((n * 7) % 3) * DIA) : null, emitida: em, enviada: em && venc < HOJE ? new Date(+em + DIA) : null });
      }
    });

    // ── acordos (dívida do cliente com terceiros): [cliente, processo, credor, total, pagas, vencidas, dia, valor, forma]
    var A = [
      ['c3','5001234-11.2024.5.03.0012','Reclamante José Lima',10,6,0,15,2200,'pix'],
      ['c4','5004321-22.2025.5.03.0001','Banco Teste S/A',12,3,2,10,3150,'boleto'],
      ['c8','5007788-33.2023.8.13.0024','Fornecedor Aço Forte Ltda',8,8,0,20,1800,'boleto'],
      ['c1','5009911-44.2025.5.03.0105','Reclamante Ana Souza',6,1,1,5,1500,'pix'],
      ['c11','5002266-55.2026.8.13.0702','Locadora Minas Ltda',5,0,0,25,980,'boleto']
    ];
    D.acordos = [];
    A.forEach(function(r, i){
      var ult = noMes(2026, 9, r[6]); if (ult > HOJE) ult = noMes(2026, 8, r[6]); var K = r[4] + r[5];
      for (var n = 1; n <= r[3]; n++){
        var venc = noMes(ult.getFullYear(), ult.getMonth() + (n - K), r[6]);
        D.acordos.push({ id:'a'+(i+1)+'-'+n, ac:'a'+(i+1), cli:r[0], processo:r[1], credor:r[2], n:n, tot:r[3], v:r[7], venc:venc, forma:r[8],
          pago: n <= r[4] ? new Date(+venc - DIA) : null, emitida: n <= r[4] || (venc > HOJE && APPmes(venc)) ? new Date(+venc - 7 * DIA) : null });
      }
    });
    function APPmes(d){ return d.getMonth() === HOJE.getMonth() && d.getFullYear() === HOJE.getFullYear(); }

    // ── processos: [cliente, número, natureza, tribunal, autor, réu, polo (passivo = cliente é réu), valor, status, dias desde a última movimentação]
    var PR = [
      ['c1','5000001-11.2024.8.13.0024','Execução fiscal','TJMG','Estado de Minas Gerais','Comercial Horizonte de Alimentos Ltda','passivo',96300,'Ativo',12],
      ['c1','5009911-44.2025.5.03.0105','Reclamação trabalhista','TRT3','Ana Souza','Comercial Horizonte de Alimentos Ltda','passivo',38000,'Ativo',40],
      ['c2','1004567-08.2025.4.01.3800','Mandado de segurança','TRF1','Horizonte Logística e Transportes Eireli','União Federal','ativo',210000,'Ativo',6],
      ['c3','5001234-11.2024.5.03.0012','Reclamação trabalhista','TRT3','José Lima','Serra Azul Comércio de Materiais','passivo',52000,'Ativo',95],
      ['c3','5022113-02.2023.8.13.0024','Execução fiscal','TJMG','Estado de Minas Gerais','Serra Azul Comércio de Materiais','passivo',212000,'Ativo',22],
      ['c4','5004321-22.2025.5.03.0001','Ação de cobrança','TRT3','Banco Teste S/A','Serra Azul Serviços Ltda','passivo',41000,'Ativo',3],
      ['c5','1011223-55.2024.4.01.3800','Ação anulatória','TRF1','Vale Verde Indústria de Embalagens','União Federal','ativo',530000,'Ativo',18],
      ['c6','5003344-77.2025.8.13.0024','Inventário','TJMG','Mariana de Souza Vale','—','ativo',0,'Ativo',60],
      ['c8','5007788-33.2023.8.13.0024','Ação de cobrança','TJMG','Aço Forte Ltda','Rio Claro Engenharia e Obras','passivo',64000,'Arquivado',210],
      ['c8','5011556-90.2022.8.13.0024','Execução fiscal','TJMG','Estado de Minas Gerais','Rio Claro Engenharia e Obras','passivo',151000,'Ativo',35],
      ['c9','5000777-12.2019.8.13.0024','Execução fiscal','TJMG','Município de Belo Horizonte','Rio Claro Participações','passivo',12000,'Extinto',400],
      ['c11','5002266-55.2026.8.13.0702','Despejo','TJMG','Locadora Minas Ltda','Lagoa Santa Eventos','passivo',23000,'Ativo',9]
    ];
    var MOV = ['Juntada de petição','Conclusos para decisão','Despacho: intime-se','Audiência designada','Sentença publicada','Petição da parte contrária','Expedido mandado','Prazo para manifestação'];
    D.processos = PR.map(function(r, i){
      return { id:'pr'+(i+1), cli:r[0], numero:r[1], natureza:r[2], tribunal:r[3], autor:r[4], reu:r[5], polo:r[6], valor:r[7], valorEm:dt(2026, 1 + (i % 9), 10), status:r[8],
        ultMov:{ data:new Date(+HOJE - r[9] * DIA), txt:MOV[i % MOV.length] }, conferido: r[9] < 30 ? new Date(+HOJE - (r[9] % 12) * DIA) : null, adv:['pedro','emanuelle','adriana'][i % 3], movs:[] };
    });

    // ── execuções (cobranças ajuizadas em nome do cliente; honorário = % do recebido)
    D.execucoes = [
      { id:'x1', cli:'c2', processo:'5003001-20.2025.8.13.0024', executado:'Transportadora Beta Ltda', valor:86000, pct:20, status:'Em andamento', receb:[{ data:dt(2026,7,15), v:12000 }, { data:dt(2026,9,15), v:12000 }] },
      { id:'x2', cli:'c5', processo:'5003002-31.2024.8.13.0024', executado:'Distribuidora Gama S/A', valor:154000, pct:15, status:'Em andamento', receb:[{ data:dt(2026,8,30), v:40000 }] },
      { id:'x3', cli:'c10', processo:'5003003-42.2023.8.13.0702', executado:'Agência Delta Viagens', valor:22000, pct:20, status:'Encerrada', receb:[{ data:dt(2026,3,10), v:22000 }] }
    ];

    // ── publicações (DJEN)
    D.publicacoes = [
      { id:'pb1', data:dt(2026,10,9), tribunal:'TRT3', processo:'5009911-44.2025.5.03.0105', txt:'Intimação: manifestar sobre o laudo pericial no prazo de 5 dias.', adv:'pedro', lida:false },
      { id:'pb2', data:dt(2026,10,8), tribunal:'TJMG', processo:'5000001-11.2024.8.13.0024', txt:'Despacho: vista ao executado sobre a avaliação do bem penhorado.', adv:'pedro', lida:false },
      { id:'pb3', data:dt(2026,10,6), tribunal:'TRF1', processo:'1011223-55.2024.4.01.3800', txt:'Sentença: julgo procedente o pedido para anular o débito fiscal.', adv:'emanuelle', lida:true },
      { id:'pb4', data:dt(2026,10,2), tribunal:'TJMG', processo:'5002266-55.2026.8.13.0702', txt:'Audiência de conciliação designada para 28/10/2026, 14h.', adv:'adriana', lida:false }
    ];

    // ── financeiro: lançamentos do Jurídico e da Contabilidade
    D.lanc = [];
    function lan(o){ o.id = 'l' + (D.lanc.length + 1); D.lanc.push(o); }
    var HON = [ // [cliente, empresa, descrição, serviço, valor, dia, quem, nº parcelas (0 = mensal)]
      ['c1','jur','Consultoria tributária mensal','Tributário',2800,5,'pedro',0],
      ['c2','jur','Defesa em execução fiscal','Tributário',4500,10,'pedro',6],
      ['c3','jur','Consultoria tributária mensal','Tributário',3200,10,'emanuelle',0],
      ['c4','jur','Transação tributária PGFN','Tributário',6000,20,'pedro',5],
      ['c5','jur','Consultoria tributária mensal','Tributário',5400,9,'emanuelle',0],
      ['c6','jur','Inventário extrajudicial','Família',2500,15,'adriana',4],
      ['c8','jur','Consultoria tributária e trabalhista','Trabalhista',4200,8,'adriana',0],
      ['c11','jur','Defesa em ação de despejo','Imobiliário',3000,25,'adriana',3],
      ['c1','contab','Honorário contábil mensal','Contabilidade',1650,10,'emanuelle',0],
      ['c3','contab','Honorário contábil mensal','Contabilidade',1900,10,'emanuelle',0],
      ['c5','contab','Honorário contábil mensal','Contabilidade',3100,10,'adriana',0],
      ['c7','contab','Honorário contábil mensal','Contabilidade',1200,5,'adriana',0],
      ['c10','contab','Honorário contábil mensal','Contabilidade',1400,5,'emanuelle',0]
    ];
    HON.forEach(function(c, ci){
      var tot = c[7], n = 0;
      for (var m = -8; m <= 3; m++){
        if (tot && ++n > tot) break;
        var venc = noMes(2026, 9 + m, c[5]), atrasa = (ci === 1 && m === -1) || (ci === 3 && m === -1) || (ci === 5 && m === -3) || (ci === 4 && m === 0) || (ci === 9 && m === -1) || (ci === 12 && m === 0);
        lan({ empresa:c[1], tipo:'receita', cli:c[0], desc:c[2] + (tot ? ' — parcela ' + n + '/' + tot : ' — ' + String(venc.getMonth() + 1).padStart(2, '0') + '/' + venc.getFullYear()), servico:c[3], v:c[4], venc:venc, quem:c[6],
          pago: venc < HOJE && !atrasa ? new Date(venc - ((ci + m + 12) % 3) * DIA) : null });
      }
    });
    lan({ empresa:'jur', tipo:'receita', cli:'c7', desc:'Êxito — restituição de PIS/COFINS', servico:'Tributário', v:18500, venc:dt(2026,10,25), quem:'pedro', pago:null });
    lan({ empresa:'jur', tipo:'receita', cli:'c4', desc:'Honorário — parecer (cliente sumiu)', servico:'Tributário', v:1800, venc:dt(2026,3,10), quem:'pedro', pago:null, perda:true });
    lan({ empresa:'jur', tipo:'despesa', fav:'Parceiro Oliveira Advocacia', cli:'c5', desc:'Comissão do parceiro — Vale Verde', servico:'Tributário', v:540, venc:dt(2026,10,15), quem:'emanuelle', pago:null, redutor:true });
    var DESP = [['Aluguel da sala','Aluguel',3200,5],['Sistema contábil','Software',616,10],['Internet e telefone','Serviços',289,15],['Contador terceirizado — folha','Serviços',1450,20],['Material de escritório','Material',180,25]];
    DESP.forEach(function(d){ for (var m = -5; m <= 2; m++){ var venc = noMes(2026, 9 + m, d[3]); lan({ empresa:'contab', tipo:'despesa', fav:d[0], desc:d[0], servico:d[1], v:d[2], venc:venc, quem:'adriana', pago: venc < HOJE && !(m === 0 && d[3] === 10) ? venc : null }); } });

    // ── contratos
    D.contratos = [
      { id:'ct1', cli:'c1', tipo:'Consultoria', desc:'Consultoria tributária mensal', valor:2800, modo:'fixo', inicio:dt(2025,1,5), status:'Ativo', reajuste:dt(2027,1,5), area:'Tributário' },
      { id:'ct2', cli:'c2', tipo:'Serviço pontual', desc:'Defesa em execução fiscal', valor:27000, parcelas:6, inicio:dt(2026,5,10), status:'Ativo', area:'Tributário' },
      { id:'ct3', cli:'c3', tipo:'Consultoria', desc:'Consultoria tributária mensal', valor:2, modo:'salarios', inicio:dt(2024,3,10), status:'Ativo', reajuste:dt(2027,3,10), area:'Tributário' },
      { id:'ct4', cli:'c4', tipo:'Serviço pontual', desc:'Transação tributária PGFN', valor:30000, parcelas:5, inicio:dt(2026,6,20), status:'Ativo', area:'Tributário', exito:'20% da redução' },
      { id:'ct5', cli:'c5', tipo:'Consultoria', desc:'Consultoria tributária mensal', valor:5400, modo:'fixo', inicio:dt(2023,8,9), status:'Ativo', reajuste:dt(2026,11,9), area:'Tributário' },
      { id:'ct6', cli:'c11', tipo:'Serviço pontual', desc:'Defesa em ação de despejo', valor:9000, parcelas:3, inicio:dt(2026,9,25), status:'Ativo', area:'Imobiliário' },
      { id:'ct7', cli:'c10', tipo:'Consultoria', desc:'Contabilidade mensal', valor:1400, modo:'fixo', inicio:dt(2026,10,5), status:'Aguardando assinatura', area:'Contabilidade' },
      { id:'ct8', cli:'c9', tipo:'Consultoria', desc:'Consultoria (encerrada)', valor:1500, modo:'fixo', inicio:dt(2022,1,5), status:'Encerrado', area:'Tributário' }
    ];
    D.salarioMinimo = 1518;

    // ── CRM
    D.crm = [
      { id:'o1', nome:'Padaria Pão de Minas Ltda', contato:'Rui (sócio)', etapa:'contato', valor:1800, resp:'pedro', prox:'Ligar para marcar diagnóstico', proxEm:dt(2026,10,13) },
      { id:'o2', nome:'Construtora Pedra Alta', contato:'Silvia (financeiro)', etapa:'diagnostico', valor:4500, resp:'emanuelle', prox:'Reunião de diagnóstico', proxEm:dt(2026,10,15) },
      { id:'o3', nome:'Clínica Bem Viver', contato:'Dr. Paulo', etapa:'proposta', valor:3200, resp:'adriana', prox:'Follow-up da proposta', proxEm:dt(2026,10,12) },
      { id:'o4', nome:'Auto Peças Rota 040', contato:'Marta', etapa:'proposta', valor:2600, resp:'pedro', prox:'Enviar proposta revisada', proxEm:dt(2026,10,10) },
      { id:'o5', nome:'Lagoa Santa Hotelaria Ltda', contato:'Paula Lagoa', etapa:'fechamento', valor:1400, resp:'emanuelle', prox:'Aguardando assinatura do contrato', proxEm:dt(2026,10,14) },
      { id:'o6', nome:'Mercado Bom Preço', contato:'João', etapa:'perdido', valor:2000, resp:'adriana', prox:'—', proxEm:null }
    ];

    // ── documentos (pastas por cliente) e documentos do mês
    D.docs = [
      { id:'d1', cli:'c1', nome:'Contrato social consolidado.pdf', tipo:'Societário', em:dt(2026,2,10), validade:null },
      { id:'d2', cli:'c1', nome:'Certidão negativa federal.pdf', tipo:'Certidão', em:dt(2026,8,20), validade:dt(2026,10,30) },
      { id:'d3', cli:'c3', nome:'Procuração — Serra Azul.pdf', tipo:'Procuração', em:dt(2025,11,3), validade:dt(2026,11,3) },
      { id:'d4', cli:'c5', nome:'Certificado A1 — Vale Verde.pfx', tipo:'Certificado digital', em:dt(2025,10,20), validade:dt(2026,10,20) },
      { id:'d5', cli:'c5', nome:'Balanço 2025.pdf', tipo:'Contábil', em:dt(2026,4,30), validade:null },
      { id:'d6', cli:'c8', nome:'Certidão estadual MG.pdf', tipo:'Certidão', em:dt(2026,9,1), validade:dt(2026,11,30) },
      { id:'d7', cli:'c10', nome:'Contrato de prestação de serviços (minuta).docx', tipo:'Contrato', em:dt(2026,10,5), validade:null }
    ];
    D.tiposDoc = ['Extratos bancários','Notas fiscais de saída','Notas fiscais de entrada','Folha de pagamento'];
    D.docsCliente = { c1:[0,1,2,3], c3:[0,1,2], c5:[0,1,2,3], c7:[0,1], c10:[0,1,3] };
    D.docsRecebidos = { 'c1|2026-09':[0,1,2,3], 'c3|2026-09':[0,1,2], 'c5|2026-09':[0,1,3], 'c7|2026-09':[0,1], 'c10|2026-09':[0,1,3], 'c1|2026-10':[0], 'c5|2026-10':[0,3] };

    // ── tarefas e agenda (tipo: tarefa · reuniao · audiencia · compromisso · rotina)
    D.tarefas = [
      { id:'t1', tit:'Parcelamento em risco: Serra Azul Serviços (2 parcelas em atraso)', resp:'pedro', prazo:dt(2026,10,13), tipo:'tarefa', pri:'alta', origem:'automatica', feita:null, ref:'p7' },
      { id:'t2', tit:'Parcelamento em risco: Rio Claro Engenharia — ICMS (2 parcelas em atraso)', resp:'emanuelle', prazo:dt(2026,10,13), tipo:'tarefa', pri:'alta', origem:'automatica', feita:null, ref:'p13' },
      { id:'t3', tit:'Conferir os parcelamentos de outubro', resp:'lucas', prazo:dt(2026,10,5), tipo:'rotina', pri:'media', origem:'recorrente', feita:null, repete:'todo dia 1' },
      { id:'t4', tit:'Emitir as guias do mês (prazo dia 12)', resp:'lucas', prazo:dt(2026,10,12), tipo:'rotina', pri:'alta', origem:'recorrente', feita:null, repete:'todo dia 10' },
      { id:'t5', tit:'Reunião com o Grupo Vale Verde — revisão do INSS', resp:'emanuelle', prazo:dt(2026,10,12), hora:'15:00', tipo:'reuniao', pri:'media', origem:'manual', feita:null },
      { id:'t6', tit:'Protocolar defesa — Horizonte Logística', resp:'pedro', prazo:dt(2026,10,14), tipo:'tarefa', pri:'alta', origem:'manual', feita:null, fatal:true },
      { id:'t7', tit:'Audiência de conciliação — Lagoa Santa Eventos', resp:'adriana', prazo:dt(2026,10,28), hora:'14:00', tipo:'audiencia', pri:'alta', origem:'manual', feita:null },
      { id:'t8', tit:'Manifestar sobre o laudo — Comercial Horizonte (TRT3)', resp:'pedro', prazo:dt(2026,10,16), tipo:'tarefa', pri:'alta', origem:'manual', feita:null, fatal:true },
      { id:'t9', tit:'Pedir documentos de setembro aos clientes', resp:'lucas', prazo:dt(2026,10,5), tipo:'rotina', pri:'baixa', origem:'recorrente', feita:dt(2026,10,5), repete:'todo dia 5' },
      { id:'t10', tit:'Revisar contrato da Lagoa Santa Hotelaria', resp:'emanuelle', prazo:dt(2026,10,9), tipo:'tarefa', pri:'media', origem:'manual', feita:null, revisor:'pedro' }
    ];
    D.lembretes = [
      { id:'lb1', txt:'Renovar o certificado A1 da Vale Verde (vence 20/10)', dia:dt(2026,10,15), cor:'vermelho' },
      { id:'lb2', txt:'Mandar a proposta da Clínica Bem Viver', dia:dt(2026,10,12), cor:'azul' }
    ];

    // ── e-mails (versão simplificada — ver Administração → E-mails)
    // manuais: você aperta o botão, confere o anexo e escolhe; automáticos: saem sozinhos (ligar/desligar aqui)
    D.emailCfg = {
      guia_parcelamento:{ modo:'rascunho' },   // rascunho no Gmail (para anexar a guia) | enviar direto
      guia_acordo:{ modo:'rascunho' },
      lembrete_honorario:{ ligado:true, dias:3 },
      cobranca:{ ligado:true, dias:3 },
      recibo:{ ligado:true },
      equipe:{ resumo:true, tarefa:true, revisar:true, compromisso:true, publicacao:false, contrato:false, cnpj:false, aparelho:true, atrasada:false, mencao:true }
    };
    D.emails = [
      { id:'e1', cli:'c3', tipo:'guia_parcelamento', assunto:'Guias do mês — Serra Azul Comércio', para:'adm@serraazulmat.teste', status:'rascunho', quando:dt(2026,10,9), anexos:['DAS-SerraAzul-10-2026.pdf'] },
      { id:'e2', cli:'c1', tipo:'recibo', assunto:'Recibo de pagamento — R$ 2.800,00', para:'financeiro@horizontealimentos.teste', status:'enviado', quando:dt(2026,10,5) },
      { id:'e3', cli:'c5', tipo:'lembrete_honorario', assunto:'Lembrete: honorário vence em 09/10', para:'financeiro@valeverde.teste', status:'enviado', quando:dt(2026,10,6) },
      { id:'e4', cli:'c9', tipo:'cobranca', assunto:'Honorário em aberto', para:'', status:'erro', erro:'cliente sem e-mail cadastrado', quando:dt(2026,10,8) },
      { id:'e5', cli:'c2', tipo:'guia_parcelamento', assunto:'Guias do mês — Horizonte Logística', para:'contato@horizontelog.teste', status:'enviado', quando:dt(2026,10,7), anexos:['guia-regularize-2093551.pdf'] }
    ];

    // ── importações (com Reverter) e histórico
    D.importacoes = [
      { id:'i1', quando:new Date(2026,9,8,17,20), quem:'pedro', arquivo:'Parcelamentos Tributários.xlsx', o:'Parcelamentos e parcelas', itens:{ parcelamentos:['p12','p13'] }, revertida:null },
      { id:'i2', quando:new Date(2026,8,30,11,5), quem:'adriana', arquivo:'Base de Dados — clientes.xlsx', o:'Clientes', itens:{ clientes:['c8','c9'] }, revertida:null }
    ];
    // evolução do passivo (últimos 12 meses, total do escritório) — para o gráfico do Painel
    D.evolucao = [1.62, 1.58, 1.55, 1.57, 1.49, 1.46, 1.44, 1.41, 1.39, 1.36, 1.33, 1.31].map(function(v, i){ return { mes:new Date(2025, 10 + i, 1), v:Math.round(v * 1e6) }; });
    return D;
  }

  var CHAVE = 'erp-ambiente-teste';
  function salvar(D){ try { localStorage.setItem(CHAVE, JSON.stringify(D)); } catch (e) {} }
  function carregar(){
    try {
      var s = localStorage.getItem(CHAVE); if (!s) return null;
      var D = JSON.parse(s, function(k, v){ return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v) : v; });
      return D && D.versao === 4 ? D : null;
    } catch (e) { return null; }
  }
  window.DADOS = { gerar:gerar, salvar:salvar, carregar:carregar, DIA:DIA, HOJE:HOJE, noMes:noMes, sorte:sorte,
    limpar:function(){ try { localStorage.removeItem(CHAVE); } catch (e) {} } };
})();
