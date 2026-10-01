'use strict';
// ═══════════════════════════════════════════════════════════════════
// Central de Documentos (Backup 32) — os MODELOS. Cada modelo diz:
//   campos  → o formulário (o motor desenha sozinho)
//   montar  → o documento em blocos (o mesmo texto vira a prévia, o PDF e o Word)
// Texto no padrão do escritório (Família A): título em caixa alta, corpo justificado, cláusulas com o texto na
// mesma linha do título, sem fórmula de encerramento, local e data centralizados, assinaturas lado a lado.
// Marcação dentro dos textos: **negrito**, __itálico__. Campo vazio vira um aviso amarelo (V).
// ═══════════════════════════════════════════════════════════════════
(function () {
  const ORD = ['PRIMEIRA', 'SEGUNDA', 'TERCEIRA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÉTIMA', 'OITAVA', 'NONA', 'DÉCIMA', 'DÉCIMA PRIMEIRA', 'DÉCIMA SEGUNDA'];
  const PARAG = ['PRIMEIRO', 'SEGUNDO', 'TERCEIRO', 'QUARTO', 'QUINTO'];
  const parag = (i, n) => n === 1 ? 'PARÁGRAFO ÚNICO' : 'PARÁGRAFO ' + PARAG[i];
  const parIt = (i, n) => n === 1 ? 'Parágrafo único' : 'Parágrafo ' + PARAG[i].toLowerCase();
  const local = { id: 'local', tipo: 'texto', rotulo: 'Local', meia: true, padrao: (c) => c.esc.cidade };
  const data = { id: 'data', tipo: 'data', rotulo: 'Data', meia: true, padrao: 'hoje' };

  // ── 1) PROCURAÇÃO ──
  const FINALIDADES = [
    ['processo', 'Processo judicial determinado'],
    ['fazenda', 'Receita Federal, PGFN, SEFAZ (parcelamento e transação)'],
    ['administrativo', 'Processo administrativo determinado'],
    ['registro', 'Junta Comercial, cartórios e órgãos de registro'],
    ['ampla', 'Ampla — defesa de direitos em geral'],
    ['outra', 'Outra (escrever)']];
  const PODERES_EXTRA = [['renunciar', 'renunciar ao direito sobre o qual se funda a ação'], ['citacao', 'receber citação'],
    ['hipossuficiencia', 'firmar declaração de hipossuficiência econômica'], ['alvara', 'levantar alvarás e receber valores']];
  function finalidade(d, h) {
    const o = h.o(d.outorgante), proc = h.V(d.processo, 'nº do processo');
    return ({
      processo: 'atuar e acompanhar, em todos os seus termos e instâncias, o processo n. ' + proc + ', praticando todos os atos necessários ao fiel cumprimento do presente mandato',
      fazenda: 'representá-l' + o + ' perante a Receita Federal do Brasil, a Procuradoria-Geral da Fazenda Nacional, a Secretaria de Estado de Fazenda e demais repartições fazendárias, inclusive nos sistemas e-CAC, Regularize e SIARE, podendo requerer, aderir a parcelamentos e transações, apresentar impugnações e recursos, obter certidões e praticar todos os atos necessários ao fiel cumprimento do presente mandato',
      administrativo: 'atuar e acompanhar, em todos os seus termos e instâncias, o processo administrativo n. ' + proc + (d.orgao ? ', em trâmite perante ' + d.orgao : '') + ', inclusive para apresentar impugnação, interpor recursos e requerer parcelamento, praticando todos os atos necessários ao fiel cumprimento do presente mandato',
      registro: 'representá-l' + o + ' perante a Junta Comercial, os cartórios de registro de imóveis, de títulos e documentos e de notas e os demais órgãos de registro, podendo requerer, assinar requerimentos, retirar documentos e praticar todos os atos necessários ao fiel cumprimento do presente mandato',
      ampla: 'defender os direitos e interesses d' + o + ' outorgante em geral, em juízo ou fora dele, praticando todos os atos necessários ao fiel cumprimento do presente mandato',
      outra: h.V(d.finalidade_texto, 'finalidade')
    })[d.finalidade] || h.V('', 'finalidade');
  }
  const procuracao = {
    id: 'procuracao', nome: 'Procuração', grupo: 'Procurações', icone: '📜', parte: 'outorgante',
    descricao: 'Ad judicia et extra, com a finalidade em destaque',
    campos: [
      { sec: 'Quem outorga' },
      { id: 'outorgante', tipo: 'parte', rotulo: 'Outorgante (cliente)' },
      { sec: 'Procurador(es)' },
      { id: 'advogados', tipo: 'advogados', rotulo: 'Advogado(s) do escritório', padrao: ['pedro'] },
      { sec: 'Finalidade' },
      { id: 'finalidade', tipo: 'select', rotulo: 'Para quê', opcoes: FINALIDADES, padrao: 'fazenda' },
      { id: 'processo', tipo: 'texto', rotulo: 'Nº do processo', se: (d) => d.finalidade === 'processo' || d.finalidade === 'administrativo' },
      { id: 'orgao', tipo: 'texto', rotulo: 'Órgão (opcional)', se: (d) => d.finalidade === 'administrativo', dica: 'Ex.: Delegacia da Receita Federal em Divinópolis/MG' },
      { id: 'finalidade_texto', tipo: 'area', rotulo: 'Finalidade (texto)', se: (d) => d.finalidade === 'outra', dica: 'Comece com o verbo: "representá-lo perante…", "atuar no…"' },
      { id: 'extras', tipo: 'checks', rotulo: 'Poderes especiais além do padrão', opcoes: PODERES_EXTRA, dica: 'O padrão já inclui receber e dar quitação, transigir, firmar compromissos, desistir, reconhecer a procedência e confessar.' },
      { sec: 'Fecho' }, local, data],
    titulo: (d, h) => 'Procuração — ' + h.nomeParte(d.outorgante),
    montar(d, h, B) {
      const advs = h.advs(d.advogados), plural = advs.length > 1;
      const extras = (d.extras || []).map((k) => (PODERES_EXTRA.find((x) => x[0] === k) || [])[1]).filter(Boolean);
      const poderes = 'conferindo-lhe' + (plural ? 's' : '') + ' os poderes da cláusula ad judicia et extra, para o foro em geral, com os poderes especiais de receber e dar quitação, transigir, firmar compromissos, desistir, reconhecer a procedência de pedidos e confessar' + (extras.length ? ', ' + h.lista(extras) : '');
      return [B.titulo('PROCURAÇÃO'),
        B.p('Pelo presente instrumento particular de mandato, ' + h.qualifica(d.outorgante) + ', nomeia e constitui como seu' + (plural ? 's' : '') + ' bastante' + (plural ? 's' : '') + ' procurador' + (plural ? 'es' : (advs[0] && advs[0].genero === 'f' ? 'a' : '')) + ' ' +
          h.lista(advs.map((a) => h.qualificaAdv(a))) + ', ' + poderes + ', **a fim de ' + finalidade(d, h) + '.**'),
        B.fecho(d.local, d.data),
        B.assinaturas([[h.assinaParte(d.outorgante)]])];
    }
  };

  // ── 2) SUBSTABELECIMENTO ──
  const substabelecimento = {
    id: 'substabelecimento', nome: 'Substabelecimento', grupo: 'Procurações', icone: '🔁', parte: null,
    descricao: 'Com ou sem reserva, para outro advogado ou recebido',
    campos: [
      { sec: 'Tipo' },
      { id: 'direcao', tipo: 'radio', rotulo: 'Quem substabelece', opcoes: [['nos', 'O escritório passa para outro advogado'], ['recebe', 'Outro advogado passa para o escritório']], padrao: 'nos' },
      { id: 'reserva', tipo: 'radio', rotulo: 'Reserva de poderes', opcoes: [['com', 'Com reserva (continua no processo)'], ['sem', 'Sem reserva (sai do processo)']], padrao: 'com' },
      { sec: 'Advogados' },
      { id: 'advogado', tipo: 'advogado', rotulo: 'Advogado do escritório', padrao: 'pedro' },
      { id: 'outro_nome', tipo: 'texto', rotulo: 'Outro advogado — nome' },
      { id: 'outro_oab', tipo: 'texto', rotulo: 'OAB', meia: true, dica: 'Ex.: OAB/MG 123.456' },
      { id: 'outro_genero', tipo: 'select', rotulo: 'Tratamento', meia: true, opcoes: [['m', 'advogado'], ['f', 'advogada']], padrao: 'm' },
      { id: 'outro_endereco', tipo: 'texto', rotulo: 'Endereço profissional do outro advogado' },
      { sec: 'Processo' },
      { id: 'outorgante_nome', tipo: 'cliente-nome', rotulo: 'Outorgante (quem deu a procuração)' },
      { id: 'processo', tipo: 'texto', rotulo: 'Nº dos autos' },
      { id: 'id_procuracao', tipo: 'texto', rotulo: 'ID da procuração nos autos (opcional)', meia: true },
      { sec: 'Fecho' }, local, data],
    titulo: (d, h) => 'Substabelecimento — ' + (d.processo || h.V('', 'processo')),
    montar(d, h, B) {
      const nosso = h.adv(d.advogado), f = d.outro_genero === 'f';
      const outro = '**' + h.up(h.V(d.outro_nome, 'nome do outro advogado')) + '**, ' + (f ? 'advogada, inscrita' : 'advogado, inscrito') + ' na ' + h.V(d.outro_oab, 'OAB').replace(/^OAB\/(\w\w)\s*/i, 'OAB/$1 sob o n. ') +
        ', com escritório profissional na ' + h.V(d.outro_endereco, 'endereço do outro advogado');
      const [de, para] = d.direcao === 'recebe' ? [outro, h.qualificaAdv(nosso)] : [h.qualificaAdv(nosso), outro];
      return [B.titulo('SUBSTABELECIMENTO'),
        B.p('Autos n. **' + h.V(d.processo, 'nº dos autos') + '**'),
        B.p(de + ', substabelece **' + (d.reserva === 'sem' ? 'sem' : 'com') + ' reserva de poderes** a ' + para + ', todos os poderes conferidos por **' + h.up(h.V(d.outorgante_nome, 'outorgante')) + '**, através da procuração anexada aos autos' + (d.id_procuracao ? ' (ID ' + d.id_procuracao + ')' : '') + '.'),
        B.fecho(d.local, d.data),
        B.assinaturas([[d.direcao === 'recebe' ? { nome: h.up(d.outro_nome || ''), doc: d.outro_oab || '' } : { nome: h.up(nosso.nome), doc: nosso.oab }]])];
    }
  };

  // ── 3) CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS ──
  const FORMAS = [['fixo', 'Valor fixo'], ['entrada', 'Entrada + parcelas'], ['sm', 'Em salários mínimos'], ['mensal', 'Consultoria mensal'], ['exito', 'Êxito']];
  const MATERIAS = ['Usucapião', 'Retificação de área (judicial e extrajudicial)', 'Regularização de imóvel (inventário e CRI)', 'Holding LTDA ou S.A. (valor inicial + por imóvel integralizado)',
    'Cobranças e execuções', 'Constituição de empresa', 'Alterações societárias', 'Dívidas tributárias', 'Planejamento tributário', 'Importação e radar no SISCOMEX', 'Consultoria cível, ambiental e empresarial'];
  const contrato = {
    id: 'contrato', nome: 'Contrato de honorários', grupo: 'Contratos', icone: '🤝', parte: 'contratante',
    descricao: 'Prestação de serviços advocatícios: fixo, parcelado, salário mínimo, mensal e êxito',
    campos: [
      { sec: 'Partes' },
      { id: 'contratante', tipo: 'parte', rotulo: 'Contratante (cliente)' },
      { id: 'advogados', tipo: 'advogados', rotulo: 'Contratado(s)', padrao: ['pedro'] },
      { sec: 'Objeto' },
      { id: 'objeto', tipo: 'area', rotulo: 'O que será feito', dica: 'Ex.: a defesa da CONTRATANTE na execução fiscal n. …, em trâmite na Vara … da Comarca de …' },
      { id: 'atividades', tipo: 'area', rotulo: 'Atividades incluídas (uma por linha)', padrao: 'acompanhamento do processo\napresentação de defesas e manifestações\nreuniões de orientação' },
      { id: 'ressalva', tipo: 'area', rotulo: 'Ressalva (opcional)', dica: 'Patrono anterior, risco assumido pelo cliente, a ação não suspender a cobrança (CTN, art. 151)…' },
      { sec: 'Honorários' },
      { id: 'formas', tipo: 'checks', rotulo: 'Formas de remuneração (combine)', opcoes: FORMAS, padrao: ['fixo'] },
      { id: 'fixo_valor', tipo: 'valor', rotulo: 'Valor fixo', meia: true, se: (d) => h0(d, 'fixo') },
      { id: 'fixo_quando', tipo: 'texto', rotulo: 'Quando paga', meia: true, se: (d) => h0(d, 'fixo'), padrao: 'na assinatura deste contrato' },
      { id: 'ent_valor', tipo: 'valor', rotulo: 'Entrada', meia: true, se: (d) => h0(d, 'entrada') },
      { id: 'ent_data', tipo: 'data', rotulo: 'Vencimento da entrada', meia: true, se: (d) => h0(d, 'entrada') },
      { id: 'ent_parcelas', tipo: 'inteiro', rotulo: 'Nº de parcelas', meia: true, se: (d) => h0(d, 'entrada') },
      { id: 'ent_parcela_valor', tipo: 'valor', rotulo: 'Valor de cada parcela', meia: true, se: (d) => h0(d, 'entrada') },
      { id: 'ent_dia', tipo: 'inteiro', rotulo: 'Dia de vencimento', meia: true, se: (d) => h0(d, 'entrada'), padrao: 10 },
      { id: 'ent_inicio', tipo: 'mes', rotulo: 'Primeira parcela (mês)', meia: true, se: (d) => h0(d, 'entrada') },
      { id: 'sm_qtd', tipo: 'decimal', rotulo: 'Quantos salários mínimos', meia: true, se: (d) => h0(d, 'sm') },
      { id: 'sm_quando', tipo: 'texto', rotulo: 'Quando paga', meia: true, se: (d) => h0(d, 'sm'), padrao: 'na assinatura deste contrato' },
      { id: 'mensal_tipo', tipo: 'radio', rotulo: 'Mensalidade em', opcoes: [['rs', 'R$'], ['sm', 'salários mínimos']], padrao: 'rs', se: (d) => h0(d, 'mensal') },
      { id: 'mensal_valor', tipo: 'valor', rotulo: 'Valor mensal', meia: true, se: (d) => h0(d, 'mensal') && d.mensal_tipo !== 'sm' },
      { id: 'mensal_sm', tipo: 'decimal', rotulo: 'Salários mínimos por mês', meia: true, se: (d) => h0(d, 'mensal') && d.mensal_tipo === 'sm' },
      { id: 'mensal_dia', tipo: 'inteiro', rotulo: 'Dia de vencimento', meia: true, se: (d) => h0(d, 'mensal'), padrao: 10 },
      { id: 'mensal_inicio', tipo: 'mes', rotulo: 'Primeira mensalidade (mês)', meia: true, se: (d) => h0(d, 'mensal') },
      { id: 'exito_tipo', tipo: 'radio', rotulo: 'Êxito em', opcoes: [['pct', 'percentual'], ['valor', 'valor fixo']], padrao: 'pct', se: (d) => h0(d, 'exito') },
      { id: 'exito_pct', tipo: 'decimal', rotulo: 'Percentual (%)', meia: true, se: (d) => h0(d, 'exito') && d.exito_tipo !== 'valor' },
      { id: 'exito_valor', tipo: 'valor', rotulo: 'Valor do êxito', meia: true, se: (d) => h0(d, 'exito') && d.exito_tipo === 'valor' },
      { id: 'exito_base', tipo: 'select', rotulo: 'Base do êxito', se: (d) => h0(d, 'exito'), padrao: 'economia',
        opcoes: [['economia', 'Economia gerada (redução da dívida)'], ['proveito', 'Proveito econômico obtido'], ['livre', 'Outra (escrever)']] },
      { id: 'exito_base_texto', tipo: 'area', rotulo: 'Base do êxito (texto)', se: (d) => h0(d, 'exito') && d.exito_base === 'livre' },
      { id: 'banco', tipo: 'area', rotulo: 'Dados para pagamento (opcional)', dica: 'Banco, agência, conta, PIX e titular — ou deixe em branco' },
      { sec: 'Extras' },
      { id: 'anexo', tipo: 'check', rotulo: 'Incluir Anexo I — tabela de honorários por matéria (contratos consultivos)' },
      { id: 'anexo_linhas', tipo: 'tabela', rotulo: 'Tabela do Anexo I', se: (d) => !!d.anexo, colunas: ['Matéria', 'Valor mínimo', 'Valor máximo'], padrao: MATERIAS.map((m) => [m, '', '']) },
      { id: 'test1', tipo: 'texto', rotulo: 'Testemunha 1 (nome — CPF)', dica: 'Em branco = linha para preencher à mão' },
      { id: 'test2', tipo: 'texto', rotulo: 'Testemunha 2 (nome — CPF)' },
      { sec: 'Fecho' }, local, data],
    titulo: (d, h) => 'Contrato de honorários — ' + h.nomeParte(d.contratante),
    montar(d, h, B) {
      const advs = h.advs(d.advogados), pl = advs.length > 1, fem = !pl && advs[0] && advs[0].genero === 'f';
      const ctdo = pl ? 'CONTRATADOS' : fem ? 'CONTRATADA' : 'CONTRATADO', ctte = 'CONTRATANTE';
      const doCtdo = pl ? 'DOS CONTRATADOS' : fem ? 'DA CONTRATADA' : 'DO CONTRATADO';
      const ao = pl ? 'aos CONTRATADOS' : fem ? 'à CONTRATADA' : 'ao CONTRATADO', oCtdo = (pl ? 'os ' : fem ? 'a ' : 'o ') + ctdo;
      const poderao = pl ? 'poderão' : 'poderá';
      const temExito = h0(d, 'exito');
      const blocos = [B.titulo('CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS'),
        B.p('**' + ctte + ':** ' + h.qualifica(d.contratante) + '.'),
        B.p('**' + ctdo + ':** ' + h.lista(advs.map((a) => h.qualificaAdv(a))) + '.'),
        B.p('Pelo presente instrumento, as partes celebram entre si contrato de prestação de serviços advocatícios, mediante as seguintes cláusulas e condições:')];
      // primeira — objeto
      const ativ = String(d.atividades || '').split('\n').map((x) => x.trim()).filter(Boolean);
      blocos.push(B.clausula(ORD[0], 'DO OBJETO', 'O presente contrato tem por objeto ' + h.V(d.objeto, 'objeto do contrato').replace(/\.$/, '') + '.'));
      const pars = [];
      if (ativ.length) pars.push('o objeto engloba ' + h.lista(ativ) + '.');
      pars.push('outros atos não previstos, inclusive recursos, ações autônomas ou procedimentos administrativos distintos, dependerão de ajuste contratual próprio.');
      if (d.ressalva) pars.push(String(d.ressalva).trim().replace(/\.$/, '') + '.');
      pars.forEach((t, i) => blocos.push(B.par(parIt(i, pars.length) + ':', h.cap(t), true)));
      // segunda — honorários
      const itens = [], letra = (i) => String.fromCharCode(97 + i) + ') ';
      if (h0(d, 'fixo')) itens.push('o valor fixo de ' + h.dinheiro(d.fixo_valor) + ', a ser pago ' + h.V(d.fixo_quando, 'quando paga') + ';');
      if (h0(d, 'entrada')) itens.push('a entrada de ' + h.dinheiro(d.ent_valor) + ', com vencimento em ' + h.dataCurta(d.ent_data) + ', e mais ' + h.V(d.ent_parcelas, 'nº de parcelas') + ' (' + h.numExtenso(d.ent_parcelas) + ') parcelas mensais e sucessivas de ' +
        h.dinheiro(d.ent_parcela_valor) + ', com vencimento todo dia ' + h.V(d.ent_dia, 'dia') + ', a primeira em ' + h.mesAno(d.ent_inicio) + ';');
      if (h0(d, 'sm')) itens.push(h.V(h.num(d.sm_qtd), 'quantidade') + ' (' + h.numExtenso(d.sm_qtd) + ') salário' + (Number(d.sm_qtd) === 1 ? '' : 's') + ' mínimo' + (Number(d.sm_qtd) === 1 ? '' : 's') + ' vigente' + (Number(d.sm_qtd) === 1 ? '' : 's') + ', a ser pago ' + h.V(d.sm_quando, 'quando paga') + ';');
      if (h0(d, 'mensal')) itens.push('honorários mensais de ' + (d.mensal_tipo === 'sm' ? h.V(h.num(d.mensal_sm), 'salários mínimos') + ' (' + h.numExtenso(d.mensal_sm) + ') salário' + (Number(d.mensal_sm) === 1 ? '' : 's') + ' mínimo' + (Number(d.mensal_sm) === 1 ? '' : 's') + ' vigente' + (Number(d.mensal_sm) === 1 ? '' : 's') : h.dinheiro(d.mensal_valor)) +
        ', com vencimento todo dia ' + h.V(d.mensal_dia, 'dia') + ', a partir de ' + h.mesAno(d.mensal_inicio) + ', enquanto vigorar este contrato;');
      if (temExito) itens.push('honorários de êxito de ' + (d.exito_tipo === 'valor' ? h.dinheiro(d.exito_valor) : h.V(h.num(d.exito_pct), 'percentual') + '% (' + h.numExtenso(d.exito_pct) + ' por cento) sobre a base de cálculo definida no parágrafo primeiro') + ', devidos em caso de resultado favorável;');
      if (!itens.length) itens.push(h.V('', 'forma de remuneração'));
      blocos.push(B.clausula(ORD[1], 'DOS HONORÁRIOS', 'Pelos serviços objeto deste contrato, a ' + ctte + ' pagará ' + ao + ' os seguintes honorários: ' + (itens.length === 1 ? itens[0].replace(/;$/, '.') : itens.map((t, i) => letra(i) + (i === itens.length - 1 ? t.replace(/;$/, '.') : t)).join(' '))));
      const ph = [];
      if (temExito) {
        ph.push(({ economia: 'considera-se êxito a economia gerada à CONTRATANTE, assim entendida a diferença entre o valor originalmente exigido, atualizado até a data da propositura da medida, e o valor que remanescer devido após decisão definitiva; o cancelamento integral da exigência equivale a 100% (cem por cento) de economia. Em caso de êxito parcial, aplica-se o mesmo critério sobre a economia efetivamente obtida, e nada será devido se não houver redução',
          proveito: 'considera-se êxito todo o proveito econômico obtido pela CONTRATANTE em razão dos serviços prestados, seja por decisão, acordo ou transação. Em caso de êxito parcial, aplica-se o mesmo critério sobre o proveito efetivamente obtido',
          livre: h.V(d.exito_base_texto, 'base do êxito') })[d.exito_base || 'economia'] + '. Os honorários de êxito serão exigíveis com o trânsito em julgado da decisão favorável ou com a formalização do acordo, mediante demonstrativo.');
      }
      if (d.banco) ph.push('o pagamento será feito por meio dos seguintes dados: ' + String(d.banco).trim().replace(/\s*\n\s*/g, '; ').replace(/\.$/, '') + '.');
      ph.push('o atraso no pagamento acarretará multa de 2% (dois por cento), juros de 1% (um por cento) ao mês e correção monetária pelo índice da Corregedoria-Geral de Justiça do TJMG.');
      ph.forEach((t, i) => blocos.push(B.par(parIt(i, ph.length) + ':', h.cap(t), true)));
      // terceira a sexta — fixas
      blocos.push(B.clausula(ORD[2], 'DA RESCISÃO', 'A relação advocatícia baseia-se na confiança. Havendo quebra, qualquer das partes poderá rescindir o presente contrato, mediante comunicação prévia, permanecendo exigíveis as obrigações e os honorários já pactuados.'));
      const pr = ['em caso de inadimplemento, ' + oCtdo + ' ' + poderao + ' rescindir o contrato e cobrar judicialmente o valor devido, com multa e correção. A CONTRATANTE responderá pelas despesas decorrentes, incluindo custas, taxas e honorários advocatícios de 20% (vinte por cento) sobre o débito.',
        'a desistência por parte da CONTRATANTE, ainda que anterior ao ajuizamento da ação, implicará o pagamento integral dos honorários contratados, considerando o trabalho já iniciado e a disponibilidade profissional.'];
      if (temExito) pr.push('o honorário de êxito permanece devido, na proporção do trabalho realizado até a rescisão, se sobrevier resultado favorável mesmo após a saída ' + (pl ? 'dos CONTRATADOS' : fem ? 'da CONTRATADA' : 'do CONTRATADO') + '.');
      pr.forEach((t, i) => blocos.push(B.par(parIt(i, pr.length) + ':', h.cap(t), true)));
      blocos.push(B.clausula(ORD[3], 'DAS OBRIGAÇÕES DA CONTRATANTE', 'Fornecer, de forma completa e tempestiva, os documentos e as informações solicitados; manter atualizados os seus meios de contato; comparecer a audiências, perícias e demais atos quando convocada; e arcar integralmente com as custas, despesas e tributos decorrentes da demanda.'));
      blocos.push(B.clausula(ORD[4], 'DAS OBRIGAÇÕES ' + doCtdo, 'Atuar com zelo, ética e diligência, conforme o Estatuto da Advocacia e o Código de Ética e Disciplina da OAB; manter sigilo profissional sobre todas as informações recebidas; manter a CONTRATANTE informada sobre o andamento relevante dos trabalhos; e enviar recibos das despesas eventualmente adiantadas, a serem ressarcidas.'));
      blocos.push(B.clausula(ORD[5], 'DISPOSIÇÕES GERAIS', 'O presente instrumento constitui título executivo extrajudicial (CPC, art. 784, III e § 4º), inclusive se assinado eletronicamente (MP n. 2.200-2/2001).'));
      [ 'os honorários de sucumbência eventualmente fixados judicialmente pertencem exclusivamente ' + (pl ? 'aos CONTRATADOS' : fem ? 'à CONTRATADA' : 'ao CONTRATADO') + ' (Lei n. 8.906/1994, art. 23) e não se compensam com os honorários de êxito eventualmente pactuados.',
        'elege-se o foro da Comarca de ' + h.esc.foro + ', com renúncia de qualquer outro, para dirimir eventuais controvérsias.' ].forEach((t, i) => blocos.push(B.par(parIt(i, 2) + ':', h.cap(t), true)));
      blocos.push(B.fecho(d.local, d.data));
      const t = (s) => { const [n, c] = String(s || '').split(/\s+[—-]\s+/); return { nome: h.up(n || ''), doc: c ? 'CPF ' + c.replace(/^cpf\s*/i, '') : 'CPF:' }; };
      const lin = [[h.assinaParte(d.contratante)]];
      for (let i = 0; i < advs.length; i += 2) lin.push(advs.slice(i, i + 2).map((a) => ({ nome: h.up(a.nome), doc: a.oab })));
      lin.push([t(d.test1), t(d.test2)].map((x, i) => Object.assign(x, { rotulo: 'Testemunha ' + (i + 1), nome: x.nome || ' ' })));
      blocos.push(B.assinaturas(lin));
      if (d.anexo) {
        const L = (d.anexo_linhas || []).filter((r) => r && r[0]);
        blocos.push(B.quebra(), B.titulo('ANEXO I – TABELA DE HONORÁRIOS POR MATÉRIA'),
          B.tabela(['Matéria', 'Valor mínimo', 'Valor máximo'], L.map((r) => [r[0], r[1] ? h.brl(h.valor(r[1])) : h.V('', 'valor'), r[2] ? h.brl(h.valor(r[2])) : h.V('', 'valor')]), [60, 20, 20]));
      }
      return blocos;
    }
  };
  function h0(d, k) { return (d.formas || []).includes(k); }

  // ── 4) RECIBO ──
  const recibo = {
    id: 'recibo', nome: 'Recibo', grupo: 'Financeiro', icone: '🧾', parte: 'pagador', numerado: 'REC',
    descricao: 'Numerado (2026/0001), com valor por extenso',
    campos: [
      { sec: 'Quem paga' },
      { id: 'pagador', tipo: 'parte', rotulo: 'Pagador (cliente)', simples: true },
      { sec: 'Quem recebe' },
      { id: 'recebedor', tipo: 'recebedor', rotulo: 'Recebedor', padrao: 'escritorio' },
      { sec: 'Pagamento' },
      { id: 'valor', tipo: 'valor', rotulo: 'Valor recebido', meia: true },
      { id: 'pago_em', tipo: 'data', rotulo: 'Pago em', meia: true, padrao: 'hoje' },
      { id: 'referente', tipo: 'area', rotulo: 'Referente a', padrao: 'honorários advocatícios' },
      { id: 'forma', tipo: 'select', rotulo: 'Forma de pagamento', opcoes: [['pix', 'PIX'], ['transferencia', 'transferência bancária'], ['boleto', 'boleto'], ['dinheiro', 'dinheiro'], ['cartao', 'cartão'], ['cheque', 'cheque']], padrao: 'pix' },
      { sec: 'Fecho' }, local, data],
    titulo: (d, h) => 'Recibo — ' + h.nomeParte(d.pagador) + (d.valor ? ' — ' + h.brl(h.valor(d.valor)) : ''),
    montar(d, h, B) {
      const r = h.recebedor(d.recebedor), v = h.valor(d.valor);
      const forma = { pix: 'PIX', transferencia: 'transferência bancária', boleto: 'boleto', dinheiro: 'dinheiro', cartao: 'cartão', cheque: 'cheque' }[d.forma] || d.forma;
      return [B.titulo('RECIBO'),
        B.recibo(d._numero ? 'Nº ' + d._numero : 'Nº — (sai ao salvar)', v ? h.brl(v) : h.V('', 'valor')),
        B.p((r.plural ? 'Recebemos' : 'Recebi') + ' de ' + h.qualifica(d.pagador, { curto: true }) + ', a importância de **' + h.dinheiro(d.valor) + '**, referente a ' + h.V(String(d.referente || '').trim().replace(/\.$/, ''), 'referente a') +
          ', paga por ' + forma + ' em ' + h.dataCurta(d.pago_em) + ', pelo que ' + (r.plural ? 'damos' : 'dou') + ' plena e geral quitação quanto ao valor recebido.'),
        B.fecho(d.local, d.data),
        B.assinaturas([[{ nome: h.up(r.nome), doc: r.doc }]])];
    }
  };

  // ── 5) DECLARAÇÃO ──
  const declaracao = {
    id: 'declaracao', nome: 'Declaração', grupo: 'Outros', icone: '✍️', parte: 'declarante',
    descricao: 'Hipossuficiência, residência ou texto livre',
    campos: [
      { sec: 'Tipo' },
      { id: 'tipo', tipo: 'select', rotulo: 'Declaração de', opcoes: [['hipossuficiencia', 'Hipossuficiência (justiça gratuita)'], ['residencia', 'Residência'], ['livre', 'Outra (escrever)']], padrao: 'hipossuficiencia' },
      { id: 'titulo_livre', tipo: 'texto', rotulo: 'Título', se: (d) => d.tipo === 'livre', padrao: 'DECLARAÇÃO' },
      { id: 'texto_livre', tipo: 'area', rotulo: 'O que declara', se: (d) => d.tipo === 'livre', dica: 'Escreva a partir de "DECLARA, para os devidos fins, que…" — o nome e a qualificação entram sozinhos' },
      { id: 'desde', tipo: 'data', rotulo: 'Reside desde (opcional)', se: (d) => d.tipo === 'residencia' },
      { sec: 'Declarante' },
      { id: 'declarante', tipo: 'parte', rotulo: 'Declarante (cliente)' },
      { sec: 'Fecho' }, local, data],
    titulo: (d, h) => 'Declaração — ' + h.nomeParte(d.declarante),
    montar(d, h, B) {
      const p = d.declarante || {}, pj = p.tipo === 'pj';
      const eu = pj ? h.qualifica(p) + ', DECLARA' : h.qualifica(p) + ', DECLARO';
      let titulo = 'DECLARAÇÃO', corpo;
      if (d.tipo === 'hipossuficiencia') {
        titulo = 'DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA';
        corpo = eu + ', para os fins do art. 99 do Código de Processo Civil, sob as penas da lei, que não ' + (pj ? 'possui' : 'possuo') + ' condições de arcar com as custas processuais e os honorários advocatícios sem prejuízo ' + (pj ? 'da manutenção de suas atividades' : 'do meu próprio sustento e do de minha família') + ', razão pela qual ' + (pj ? 'requer' : 'requeiro') + ' os benefícios da gratuidade da justiça.';
      } else if (d.tipo === 'residencia') {
        titulo = 'DECLARAÇÃO DE RESIDÊNCIA';
        corpo = h.qualifica(Object.assign({}, p, { endereco: '' })) + ', DECLARO, sob as penas da lei (Código Penal, art. 299), que resido no endereço ' + h.V(p.endereco, 'endereço') + (d.desde ? ', desde ' + h.dataCurta(d.desde) : '') + '.';
      } else {
        titulo = h.up(d.titulo_livre || 'DECLARAÇÃO');
        corpo = h.qualifica(p) + ', ' + h.V(String(d.texto_livre || '').trim(), 'o que declara');
      }
      return [B.titulo(titulo), B.p(corpo), B.fecho(d.local, d.data), B.assinaturas([[h.assinaParte(p)]])];
    }
  };

  // ── 6) ACORDO ENTRE PARTES ──
  const ROTULOS = [['credor', 'CREDOR / DEVEDOR'], ['exequente', 'EXEQUENTE / EXECUTADO'], ['autor', 'AUTOR / RÉU'], ['outro', 'Outro (escrever)']];
  const acordo = {
    id: 'acordo', nome: 'Acordo entre partes', grupo: 'Outros', icone: '⚖️', parte: 'parte_a',
    descricao: 'Quitação de dívida, com ou sem processo',
    campos: [
      { sec: 'Partes' },
      { id: 'rotulos', tipo: 'select', rotulo: 'Como as partes se chamam', opcoes: ROTULOS, padrao: 'credor' },
      { id: 'rotulo_a', tipo: 'texto', rotulo: 'Rótulo da 1ª parte', meia: true, se: (d) => d.rotulos === 'outro' },
      { id: 'rotulo_b', tipo: 'texto', rotulo: 'Rótulo da 2ª parte', meia: true, se: (d) => d.rotulos === 'outro' },
      { id: 'parte_a', tipo: 'parte', rotulo: '1ª parte (credor / exequente)' },
      { id: 'parte_b', tipo: 'parte', rotulo: '2ª parte (devedor / executado)' },
      { id: 'adv_a', tipo: 'advogado', rotulo: 'Advogado da 1ª parte', vazio: true, padrao: 'pedro' },
      { id: 'adv_b_nome', tipo: 'texto', rotulo: 'Advogado da 2ª parte (nome)', meia: true },
      { id: 'adv_b_oab', tipo: 'texto', rotulo: 'OAB', meia: true },
      { sec: 'Dívida e acordo' },
      { id: 'processo', tipo: 'texto', rotulo: 'Nº do processo (opcional)' },
      { id: 'objeto', tipo: 'area', rotulo: 'Origem da dívida', dica: 'Ex.: cheques n. 001 a 003, emitidos em 2025, não compensados' },
      { id: 'valor_original', tipo: 'valor', rotulo: 'Valor atualizado da dívida', meia: true },
      { id: 'valor_acordo', tipo: 'valor', rotulo: 'Valor do acordo', meia: true },
      { id: 'forma', tipo: 'radio', rotulo: 'Pagamento', opcoes: [['vista', 'À vista'], ['parcelado', 'Parcelado']], padrao: 'parcelado' },
      { id: 'vista_data', tipo: 'data', rotulo: 'Pagar até', meia: true, se: (d) => d.forma === 'vista' },
      { id: 'parcelas', tipo: 'inteiro', rotulo: 'Nº de parcelas', meia: true, se: (d) => d.forma !== 'vista' },
      { id: 'parcela_valor', tipo: 'valor', rotulo: 'Valor da parcela', meia: true, se: (d) => d.forma !== 'vista' },
      { id: 'primeiro_venc', tipo: 'data', rotulo: '1º vencimento', meia: true, se: (d) => d.forma !== 'vista' },
      { id: 'dados_bancarios', tipo: 'area', rotulo: 'Dados bancários do recebedor', dica: 'Titular, CPF/CNPJ, banco, agência, conta e PIX — um por linha' },
      { id: 'multa', tipo: 'decimal', rotulo: 'Multa se não pagar (%)', meia: true, padrao: 20 },
      { sec: 'Fecho' }, local, data],
    titulo: (d, h) => 'Acordo — ' + h.nomeParte(d.parte_a) + ' × ' + h.nomeParte(d.parte_b),
    montar(d, h, B) {
      const [ra, rb] = d.rotulos === 'outro' ? [h.up(d.rotulo_a || 'PRIMEIRA PARTE'), h.up(d.rotulo_b || 'SEGUNDA PARTE')]
        : ({ credor: ['CREDOR', 'DEVEDOR'], exequente: ['EXEQUENTE', 'EXECUTADO'], autor: ['AUTOR', 'RÉU'] })[d.rotulos || 'credor'];
      const A = d.parte_a || {}, Bp = d.parte_b || {}, adv = h.adv(d.adv_a);
      const vo = h.valor(d.valor_original), va = h.valor(d.valor_acordo);
      const bl = [B.titulo('ACORDO PARA QUITAÇÃO DE DÍVIDA'),
        B.p('**' + ra + ':** ' + h.qualifica(A) + '.'),
        B.p('**' + rb + ':** ' + h.qualifica(Bp) + '.'),
        B.p('As partes acima qualificadas celebram o presente **acordo para quitação de dívida**' + (d.processo ? ', referente ao processo n. **' + d.processo + '**' : '') + ', mediante as cláusulas seguintes:')];
      let n = 0; const cl = (nome, t) => bl.push(B.clausula(ORD[n++], nome, t));
      cl('OBJETO', 'O ' + rb + ' reconhece dever ao ' + ra + ' a quantia de **' + h.dinheiro(d.valor_original) + '**, valor atualizado nesta data, originada de ' + h.V(String(d.objeto || '').trim().replace(/\.$/, ''), 'origem da dívida') + '.');
      cl('VALOR DO ACORDO', 'Para quitação integral da dívida, o ' + ra + ' aceita receber **' + h.dinheiro(d.valor_acordo) + '**' + (vo && va && va < vo ? ', com desconto de ' + h.brl(vo - va) : '') + '.');
      cl('PAGAMENTO', d.forma === 'vista' ? 'O valor do acordo será pago à vista, até ' + h.dataCurta(d.vista_data) + ', por meio dos dados bancários abaixo.'
        : 'O valor do acordo será pago em ' + h.V(d.parcelas, 'nº de parcelas') + ' (' + h.numExtenso(d.parcelas) + ') parcelas mensais e sucessivas de ' + h.dinheiro(d.parcela_valor) + ', a primeira com vencimento em ' + h.dataCurta(d.primeiro_venc) + ' e as demais no mesmo dia dos meses subsequentes, por meio dos dados bancários abaixo.');
      if (d.dados_bancarios) bl.push(B.bloco(String(d.dados_bancarios).split('\n').map((x) => x.trim()).filter(Boolean)));
      else bl.push(B.bloco([h.V('', 'dados bancários')]));
      cl('INADIMPLEMENTO', 'O atraso de qualquer parcela por mais de 10 (dez) dias implicará o vencimento antecipado das demais e a incidência de multa de ' + h.num(d.multa || 20) + '% (' + h.numExtenso(d.multa || 20) + ' por cento) sobre o saldo, com juros de 1% (um por cento) ao mês e correção monetária.');
      bl.push(B.par('PARÁGRAFO ÚNICO:', 'Havendo inadimplemento, o ' + ra + ' poderá executar imediatamente o saldo devedor' + (d.processo ? ' nos próprios autos' : '') + ', abatidos os valores já pagos, valendo este instrumento como título executivo extrajudicial (CPC, art. 784, III).'));
      cl('QUITAÇÃO', 'Com o pagamento integral do valor do acordo, o ' + ra + ' dará ao ' + rb + ' plena, geral e irrevogável quitação da dívida descrita na cláusula primeira, para nada mais reclamar.');
      const pq = [];
      if (d.processo) pq.push('as partes requererão, nos autos do processo n. **' + d.processo + '**, a homologação deste acordo e, após o pagamento integral, a extinção do feito.');
      pq.push('os comprovantes de transferência ou depósito nos dados bancários indicados servirão como prova de pagamento de cada parcela.');
      pq.forEach((t, i) => bl.push(B.par(parag(i, pq.length) + ':', h.cap(t))));
      cl('DISPOSIÇÕES GERAIS', 'As partes declaram que celebram este acordo de forma livre e espontânea, e elegem o foro da Comarca de ' + h.esc.foro + ' para dirimir eventuais controvérsias.');
      bl.push(B.fecho(d.local, d.data));
      bl.push(B.assinaturas([[h.assinaParte(A), h.assinaParte(Bp)],
        [adv ? { nome: h.up(adv.nome), doc: adv.oab } : { nome: ' ', doc: 'Advogado(a)' }, { nome: h.up(d.adv_b_nome || ' '), doc: d.adv_b_oab || 'Advogado(a)' }]]));
      return bl;
    }
  };

  window.MODELOS_DOC = [procuracao, substabelecimento, contrato, recibo, declaracao, acordo];
})();
