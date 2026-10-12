/* Dados de exemplo do ambiente de teste — TODOS fictícios (LGPD). Hoje = 09/10/2026.
   As mudanças feitas na tela ficam guardadas só neste navegador (Administração → Ambiente de teste → "Voltar aos dados de exemplo"). */
(function(){
  var DIA = 864e5, HOJE = new Date(2026, 9, 9);
  function noMes(a, m, d){ var u = new Date(a, m + 1, 0).getDate(); return new Date(a, m, Math.min(d, u)); }

  function gerar(){
    var D = { versao: 3, hoje: HOJE };
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
      { id:'g5', nome:'Grupo Rio Claro', cor:5, resp:'emanuelle' }
    ];
    D.clientes = [
      { id:'c1', g:'g1', nome:'Comercial Horizonte de Alimentos Ltda', doc:'12.345.678/0001-90', email:'financeiro@horizontealimentos.teste', fiscal:'fiscal@horizontealimentos.teste', tel:'(31) 3333-1001', tipo:'PJ' },
      { id:'c2', g:'g1', nome:'Horizonte Logística e Transportes Eireli', doc:'23.456.789/0001-01', email:'contato@horizontelog.teste', fiscal:'', tel:'(31) 3333-1002', tipo:'PJ' },
      { id:'c3', g:'g2', nome:'Serra Azul Comércio de Materiais de Construção Ltda', doc:'45.678.901/0001-23', email:'adm@serraazulmat.teste', fiscal:'fiscal@serraazulmat.teste', tel:'(31) 3333-2001', tipo:'PJ' },
      { id:'c4', g:'g2', nome:'Serra Azul Serviços Ltda', doc:'56.789.012/0001-34', email:'servicos@serraazul.teste', fiscal:'', tel:'(31) 3333-2002', tipo:'PJ' },
      { id:'c5', g:'g3', nome:'Vale Verde Indústria de Embalagens S.A.', doc:'34.567.890/0001-12', email:'financeiro@valeverde.teste', fiscal:'contabil@valeverde.teste', tel:'(31) 3333-3001', tipo:'PJ' },
      { id:'c6', g:'g3', nome:'Mariana de Souza Vale', doc:'123.456.789-09', email:'mariana.vale@correio.teste', fiscal:'', tel:'(31) 99999-3002', tipo:'PF' },
      { id:'c7', g:'g4', nome:'Ipê Amarelo Farmácia de Manipulação Ltda', doc:'67.890.123/0001-45', email:'farmacia@ipeamarelo.teste', fiscal:'', tel:'(31) 3333-4001', tipo:'PJ' },
      { id:'c8', g:'g5', nome:'Rio Claro Engenharia e Obras Ltda', doc:'78.901.234/0001-56', email:'obras@rioclaro.teste', fiscal:'fiscal@rioclaro.teste', tel:'(31) 3333-5001', tipo:'PJ' },
      { id:'c9', g:'g5', nome:'Rio Claro Participações Ltda', doc:'89.012.345/0001-67', email:'', fiscal:'', tel:'', tipo:'PJ' }
    ];
    D.clientes.forEach(function(c){ c.recebeEmail = c.id !== 'c9'; });

    // parcelamentos: [cliente, plataforma, natureza, nº, total, pagas, vencidas sem pagar (conta hoje), dia do vencimento, valor, cliente emite?]
    var P = [
      ['c1','eCAC','Simples Nacional','10120.004512/2024-11',60,13,0,31,1284.90,0],
      ['c1','SIARE','ICMS','0045.778-2',36,4,1,25,1402.55,0],
      ['c2','Regularize','Previdenciário','2.093.551',120,7,0,12,612.35,0],
      ['c2','Regularize','Não previdenciário','2.093.120',60,30,0,1,745.20,0],
      ['c3','eCAC','Simples Nacional','10120.001133/2023-77',60,30,1,30,2205.10,0],
      ['c3','SIARE','ICMS','0051.204-9',24,9,0,20,980.00,0],
      ['c4','Regularize','Não previdenciário','1.998.320',120,45,2,20,610.75,0],
      ['c5','eCAC','INSS','10120.009871/2025-40',60,2,1,9,4910.00,0],
      ['c5','eCAC','Simples Nacional','10120.004410/2024-02',60,19,0,5,1050.00,0],
      ['c6','Regularize','Não previdenciário','2.110.004',60,21,1,9,318.77,0],
      ['c7','eCAC','Simples Nacional','10120.007733/2024-15',60,24,0,30,772.50,1],
      ['c8','eCAC','Previdenciário','10120.011208/2025-33',48,11,0,15,1890.00,0],
      ['c8','SIARE','ICMS','0062.517-1',24,6,2,10,2340.00,0]
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
        D.parcelas.push({ id:p.id+'-'+n, pa:p.id, n:n, venc:venc, v:r[8], pago: paga ? new Date(venc - ((n * 7) % 3) * DIA) : null, emitida: em, enviada: em && venc < HOJE ? new Date(+em + DIA) : null, conferida: paga && venc.getMonth() === 8 ? new Date(2026, 9, 2) : null });
      }
    });

    // honorários (Financeiro · Jurídico): [cliente, tipo, descrição, valor, dia, total de parcelas (0 = mensalidade)]
    var H = [
      ['c1','Mensalidade','Consultoria tributária mensal',2800,5,0],
      ['c2','Parcela de contrato','Defesa em execução fiscal',4500,10,6],
      ['c3','Mensalidade','Consultoria tributária mensal',3200,10,0],
      ['c4','Parcela de contrato','Transação tributária PGFN',6000,20,5],
      ['c5','Mensalidade','Consultoria tributária mensal',5400,9,0],
      ['c6','Parcela de contrato','Inventário extrajudicial',2500,15,4],
      ['c7','Mensalidade','Consultoria tributária mensal',1900,5,0],
      ['c7','Êxito','Êxito — restituição de PIS/COFINS',18500,25,1],
      ['c8','Mensalidade','Consultoria tributária e trabalhista',4200,8,0]
    ];
    D.honorarios = [];
    H.forEach(function(c, ci){
      var tot = c[5], n = 0;
      for (var m = -6; m <= 5; m++){
        if (c[1] === 'Êxito' && m !== 0) continue;
        if (tot && ++n > tot) break;
        var venc = noMes(2026, 9 + m, c[4]);
        var atrasa = (ci === 1 && m === -1) || (ci === 3 && m === -1) || (ci === 5 && m === -3) || (ci === 4 && m === 0) || (ci === 8 && m === 0);
        D.honorarios.push({ id:'h'+D.honorarios.length, cli:c[0], tipo:c[1], desc:c[2], v:c[3], venc:venc, n: tot ? n : 0, tot: tot,
          rec: venc < HOJE && !atrasa ? new Date(venc - ((ci + m + 12) % 3) * DIA) : null });
      }
    });

    // automações: o que roda sozinho, quando e para quem. "porCliente" guarda as exceções de cada cliente.
    D.automacoes = [
      { id:'resumo_manha', grupo:'equipe', nome:'Resumo da manhã', o:'E-mail para cada pessoa da equipe com o que vence hoje, o que atrasou, guias a emitir e tarefas do dia.', ligada:true, hora:'07:30', dias:null, quem:['pedro','emanuelle','adriana','lucas'], uteis:true, ref:'A1' },
      { id:'lembrete_parcela', grupo:'cliente', nome:'Lembrete da parcela ao cliente', o:'E-mail ao cliente N dias antes do vencimento da parcela do parcelamento (PGFN, Receita, SEFAZ).', ligada:true, hora:'08:00', dias:3, ref:'A2' },
      { id:'guia_emitida', grupo:'cliente', nome:'Guia emitida → e-mail pronto', o:'Ao marcar a guia como emitida e anexar o PDF, o e-mail ao cliente fica pronto na Caixa de saída para revisar e enviar.', ligada:true, modo:'revisar', ref:'A3' },
      { id:'risco_rescisao', grupo:'equipe', nome:'Parcelamento em risco', o:'Cria tarefa para o responsável do grupo quando um parcelamento chega a N parcelas em atraso (risco de rescisão).', ligada:true, limite:2, ref:'A4' },
      { id:'leitura_pdf', grupo:'equipe', nome:'Leitura do PDF da guia', o:'Ao anexar a guia, o sistema lê o valor e o vencimento do próprio PDF e confere com a parcela.', ligada:true, ref:'A5' },
      { id:'conferencia_mes', grupo:'equipe', nome:'Conferência mensal', o:'No dia 1º, tarefa "Conferir os parcelamentos do mês" com a lista pronta (o que pagou e o que não pagou).', ligada:true, diaMes:1, hora:'08:00', resp:'lucas', ref:'A6' },
      { id:'docs_mes', grupo:'cliente', nome:'Pedido de documentos do mês', o:'No dia escolhido, e-mail ao cliente pedindo os documentos da competência que ainda não chegaram.', ligada:true, diaMes:5, hora:'09:00', ref:'ROMPEX' },
      { id:'cobranca_honorario', grupo:'cliente', nome:'Cobrança educada de honorário', o:'E-mail ao cliente N dias depois do vencimento do honorário sem pagamento.', ligada:false, hora:'10:00', dias:3, ref:'já existe' },
      { id:'recibo', grupo:'cliente', nome:'Recibo de pagamento', o:'E-mail com o recibo em PDF assim que o honorário é marcado como recebido.', ligada:true, ref:'já existe' }
    ];
    D.porCliente = { c6:{ lembrete_parcela:{ modo:'personalizado', dias:5, hora:'09:00' } }, c9:{ lembrete_parcela:{ modo:'desligado' }, docs_mes:{ modo:'desligado' } }, c7:{ lembrete_parcela:{ modo:'desligado' } } };

    // documentos por competência (ROMPEX): o que cada cliente manda todo mês
    D.tiposDoc = ['Extratos bancários','Notas fiscais de saída','Notas fiscais de entrada','Folha de pagamento'];
    D.docsCliente = { c1:[0,1,2,3], c3:[0,1,2], c5:[0,1,2,3], c7:[0,1], c8:[0,1,3] };
    D.docsRecebidos = { 'c1|2026-09':[0,1,2,3], 'c3|2026-09':[0,1,2], 'c5|2026-09':[0,1,3], 'c7|2026-09':[0,1], 'c8|2026-09':[0,1,3], 'c1|2026-10':[0], 'c5|2026-10':[0,3] };

    // e-mails: caixa de saída (para revisar) e enviados
    D.emails = [
      { id:'e1', cli:'c3', assunto:'Guia do parcelamento — vence em 20/10/2026', para:'fiscal@serraazulmat.teste', status:'revisar', origem:'guia_emitida', anexo:{ nome:'DAS-SerraAzul-10-2026.pdf', valor:980.00, venc:new Date(2026,9,20) }, parcela:'p6-10', criado:new Date(2026,9,8,10,12) },
      { id:'e2', cli:'c6', assunto:'Lembrete: parcela do parcelamento vence em 14/10', para:'mariana.vale@correio.teste', status:'agendado', origem:'lembrete_parcela', quando:new Date(2026,9,9,9,0), criado:new Date(2026,9,8,7,0) },
      { id:'e3', cli:'c1', assunto:'Recibo de pagamento — R$ 2.800,00', para:'financeiro@horizontealimentos.teste', status:'enviado', origem:'recibo', quando:new Date(2026,9,5,14,2), criado:new Date(2026,9,5,14,2) },
      { id:'e4', cli:'c5', assunto:'Documentos de outubro — o que ainda falta', para:'contabil@valeverde.teste', status:'enviado', origem:'docs_mes', quando:new Date(2026,9,5,9,0), criado:new Date(2026,9,5,9,0) },
      { id:'e5', cli:'c2', assunto:'Guia do parcelamento — vence em 12/10/2026', para:'contato@horizontelog.teste', status:'revisar', origem:'guia_emitida', anexo:{ nome:'guia-regularize-2093551.pdf', valor:621.80, venc:new Date(2026,9,12) }, parcela:'p3-8', criado:new Date(2026,9,8,16,40) }
    ];

    // tarefas (algumas criadas pelas automações)
    D.tarefas = [
      { id:'t1', tit:'Parcelamento em risco: Serra Azul Serviços (2 parcelas em atraso)', resp:'pedro', prazo:new Date(2026,9,10), origem:'risco_rescisao', feita:null, ref:'p7' },
      { id:'t2', tit:'Parcelamento em risco: Rio Claro Engenharia — ICMS (2 parcelas em atraso)', resp:'emanuelle', prazo:new Date(2026,9,10), origem:'risco_rescisao', feita:null, ref:'p13' },
      { id:'t3', tit:'Conferir os parcelamentos de outubro', resp:'lucas', prazo:new Date(2026,9,5), origem:'conferencia_mes', feita:null },
      { id:'t4', tit:'Emitir as guias do mês (prazo dia 12)', resp:'lucas', prazo:new Date(2026,9,12), origem:'manual', feita:null },
      { id:'t5', tit:'Reunião com o Grupo Vale Verde — revisão do INSS', resp:'emanuelle', prazo:new Date(2026,9,9), origem:'manual', feita:null },
      { id:'t6', tit:'Protocolar defesa — Horizonte Logística', resp:'pedro', prazo:new Date(2026,9,14), origem:'manual', feita:null }
    ];

    // importações (ROMPEX H): o que entrou por planilha, com "Reverter"
    D.importacoes = [
      { id:'i1', quando:new Date(2026,9,8,17,20), quem:'pedro', arquivo:'Parcelamentos Tributários.xlsx', o:'Parcelamentos e parcelas', itens:{ parcelamentos:['p12','p13'] }, revertida:null },
      { id:'i2', quando:new Date(2026,8,30,11,5), quem:'adriana', arquivo:'Base de Dados — clientes.xlsx', o:'Clientes', itens:{ clientes:['c8','c9'] }, revertida:null }
    ];
    return D;
  }

  // guarda/recupera com as datas
  var CHAVE = 'erp-ambiente-teste';
  function salvar(D){ try { localStorage.setItem(CHAVE, JSON.stringify(D)); } catch (e) {} }
  function carregar(){
    try {
      var s = localStorage.getItem(CHAVE); if (!s) return null;
      var D = JSON.parse(s, function(k, v){ return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v) : v; });
      return D && D.versao === 3 ? D : null;
    } catch (e) { return null; }
  }
  window.DADOS = { gerar:gerar, salvar:salvar, carregar:carregar, DIA:DIA, HOJE:HOJE, noMes:noMes,
    limpar:function(){ try { localStorage.removeItem(CHAVE); } catch (e) {} } };
})();
