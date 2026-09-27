'use strict';
// ═══════════════════════════════════════════════════════════════════
// Importador das planilhas do ERP antigo (Google Sheets → .xlsx).
//
// Só funções puras: recebem a planilha já lida ({ abas: { nome: [[célula]] } })
// e devolvem os registros prontos para gravar. Quem lê o arquivo e grava no
// banco é a tela de Administração. Assim dá para testar tudo sem navegador.
//
// Três planilhas reconhecidas, pelo nome das abas:
//   "1 - Base de Dados"               → clientes (abas Consultoria, Demanda, Inativo)
//   "7 - Financeiro"                  → Honorários Jurídico (A Receber, Receita, Prejuízo)
//   "12 - Financeiro - Contabilidade" → Contabilidade (A Receber, Receita, Prejuízo,
//                                        A Pagar, Despesa)
//
// A coluna "Senha" da Base de Dados NÃO é importada, de propósito.
// ═══════════════════════════════════════════════════════════════════
(function (raiz) {

  function norm(s) {
    return String(s == null ? '' : s).trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
  }
  function soDigitos(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }
  function pad(n) { return String(n).padStart(2, '0'); }

  // Valor de célula do ExcelJS → valor simples (texto, número, Date, booleano ou null).
  function valorCelula(v) {
    if (v == null) return null;
    if (v instanceof Date || typeof v !== 'object') return v;
    if ('result' in v) return valorCelula(v.result);          // fórmula
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return v.text;                            // link
    if ('error' in v) return null;
    return String(v);
  }

  function texto(v) {
    v = valorCelula(v);
    if (v == null) return '';
    if (v instanceof Date) return dataISO(v) || '';
    const t = String(v).trim();
    return t === '-' || t === '—' ? '' : t;
  }

  // "R$ 1.234,56", "-R$ 1.500,00", 1234.56, "-" → número (ou null se vazio/traço)
  function numero(v) {
    v = valorCelula(v);
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? Math.round(v * 100) / 100 : null;
    let s = String(v).trim();
    if (!s || s === '-' || s === '—') return null;
    const neg = /^-|\(.*\)$/.test(s.replace(/\s/g, ''));
    s = s.replace(/[^\d,.]/g, '');
    if (!s) return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = Number(s);
    if (!isFinite(n)) return null;
    return Math.round((neg ? -n : n) * 100) / 100;
  }

  // Date do ExcelJS (meia-noite UTC) ou "dd/mm/aaaa" → "aaaa-mm-dd"
  function dataISO(v) {
    v = valorCelula(v);
    if (v instanceof Date) {
      if (isNaN(v)) return null;
      return v.getUTCFullYear() + '-' + pad(v.getUTCMonth() + 1) + '-' + pad(v.getUTCDate());
    }
    if (typeof v === 'number' && v > 20000 && v < 80000) {       // número de série do Excel
      const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
      return dataISO(d);
    }
    const m = String(v == null ? '' : v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const d = +m[1], mes = +m[2], a = +m[3];
    if (mes < 1 || mes > 12 || d < 1) return null;
    const ultimo = new Date(Date.UTC(a, mes, 0)).getUTCDate();
    return a + '-' + pad(mes) + '-' + pad(Math.min(d, ultimo));
  }

  function simNao(v) {
    const t = norm(texto(v));
    if (t === 'sim' || t === 's') return true;
    if (t === 'nao' || t === 'n') return false;
    return null;
  }

  // Localiza colunas pelo cabeçalho. Aceita nome exato ou começo do nome
  // ("Cadastro Regul…" casa com "cadastro regular").
  function mapa(cabecalho) {
    const cab = (cabecalho || []).map((c) => norm(texto(c)));
    return function col(nomes) {
      const lista = Array.isArray(nomes) ? nomes : [nomes];
      for (const n of lista) { const i = cab.indexOf(norm(n)); if (i >= 0) return i; }
      for (const n of lista) { const p = norm(n); const i = cab.findIndex((c) => c && c.startsWith(p)); if (i >= 0) return i; }
      return -1;
    };
  }
  function celula(linha, i) { return i >= 0 && linha ? linha[i] : null; }
  function linhaVazia(linha) { return !linha || linha.every((c) => texto(c) === ''); }

  function acharAba(planilha, nome) {
    const alvo = norm(nome);
    const k = Object.keys(planilha.abas).find((a) => norm(a) === alvo);
    return k ? { nome: k, linhas: planilha.abas[k] } : null;
  }

  function cabecalhoDe(linhas) { return (linhas && linhas[0] || []).map((c) => norm(texto(c))); }
  function ehBlocoParcelamento(linhas) {
    const L = linhas || [];
    if (L.length < 12) return false;
    for (let col = 0; col < (L[0] || []).length; col += 5) {
      if (norm(texto(L[0][col])) === 'nome' && L.slice(1, 11).some((ln) => ln && norm(texto(ln[col])) === 'cpf/cnpj')) return true;
    }
    return false;
  }
  function detectar(planilha) {
    const nomes = Object.keys(planilha.abas).map(norm);
    const tem = (n) => nomes.includes(norm(n));
    const abas = Object.values(planilha.abas);
    if (tem('Consultoria') && (tem('Demanda') || tem('Inativo'))) return 'base';
    if (tem('Ativos') && abas.some((L) => cabecalhoDe(L).some((c) => c.startsWith('n° do processo') || c.startsWith('no do processo') || c.startsWith('nº do processo')))) return 'processos';
    if (tem('Tarefas') && cabecalhoDe(planilha.abas[Object.keys(planilha.abas).find((k) => norm(k) === 'tarefas')]).includes('tarefa')) return 'tarefas';
    if (abas.some((L) => { const c = cabecalhoDe(L); return c.includes('devedor') && c.includes('credor'); })) return 'acordos';
    if (tem('A Pagar') || tem('Despesa')) return 'contabilidade';
    if (tem('A Receber') || tem('Receita')) return 'financeiro';
    if (abas.some(ehBlocoParcelamento)) return 'parcelamentos';
    return null;
  }

  // ─────────────────────────── BASE DE DADOS ───────────────────────────
  function importarBase(planilha) {
    const clientes = [], grupos = new Set(), avisos = [], resumo = {};
    const vistos = {};
    ['Consultoria', 'Demanda', 'Inativo'].forEach((tipo) => {
      const aba = acharAba(planilha, tipo);
      if (!aba) return;
      const r = resumo[aba.nome] = { lidas: 0, importadas: 0, ignoradas: 0 };
      const L = aba.linhas;
      if (!L || L.length < 2) return;
      const col = mapa(L[0]);
      const C = {
        grupo: col('Grupo'), nome: col('Nome'), doc: col('CPF/CNPJ'), socio: col('Sócio-Administrador'),
        resp: col('Responsável'), rfb: col('RFB'), rfbNeg: col('RFB Negociada'), pgfn: col('PGFN'),
        pgfnNeg: col('PGFN Negociada'), sefaz: col('SEFAZ/MG'), age: col('AGE/MG'), ageNeg: col('AGE/MG Negociada'),
        ceat: col('CEAT (TRT-3)'), op: col('Em operação'), proc: col('Procuração'), cert: col('Certificado'),
        cadReg: col('Cadastro Regular'), capag: col('Capag'), regime: col('Regime Tributário'),
        sit: col('Situação Cadastral'), tipoSoc: col('Tipo Societário'), email: col('Email'), tel: col('Telefone'),
        end: col('Endereço'), cidade: col('Cidade'), uf: col('Estado'), obs: col('Observação'),
        hist: col('Histórico de C'), migr: col('Data de Migração'), origem: col('Origem')
      };
      // colunas exatas (sem casar por começo): "RFB" não pode pegar "RFB Negociada"
      const exata = (n) => (L[0] || []).map((c) => norm(texto(c))).indexOf(norm(n));
      C.rfb = exata('RFB'); C.pgfn = exata('PGFN'); C.age = exata('AGE/MG');

      for (let i = 1; i < L.length; i++) {
        const ln = L[i];
        if (linhaVazia(ln)) continue;
        r.lidas++;
        const nome = texto(celula(ln, C.nome));
        const grupo = texto(celula(ln, C.grupo));
        if (!nome) { r.ignoradas++; avisos.push(aba.nome + ', linha ' + (i + 1) + ': sem nome (grupo "' + grupo + '") — ignorada.'); continue; }
        const doc = soDigitos(texto(celula(ln, C.doc)));
        const chave = doc.length >= 11 ? 'cli:doc:' + doc : 'cli:nome:' + norm(nome) + '|' + norm(grupo);
        if (vistos[chave]) {
          r.ignoradas++;
          avisos.push(aba.nome + ', linha ' + (i + 1) + ': "' + nome + '" repetido (já na ' + vistos[chave] + ') — ignorada.');
          continue;
        }
        vistos[chave] = aba.nome + ', linha ' + (i + 1);
        const uf = texto(celula(ln, C.uf)).toUpperCase();
        const ceat = numero(celula(ln, C.ceat));
        if (grupo) grupos.add(grupo);
        clientes.push({
          chave_importacao: chave, _grupo: grupo, tipo: tipo,
          nome: nome, cpf_cnpj: doc, socio_admin: texto(celula(ln, C.socio)),
          responsavel: texto(celula(ln, C.resp)),
          rfb: numero(celula(ln, C.rfb)), rfb_negociada: numero(celula(ln, C.rfbNeg)),
          pgfn: numero(celula(ln, C.pgfn)), pgfn_negociada: numero(celula(ln, C.pgfnNeg)),
          sefaz_mg: numero(celula(ln, C.sefaz)), age_mg: numero(celula(ln, C.age)),
          age_mg_negociada: numero(celula(ln, C.ageNeg)), ceat_trt3: ceat == null ? null : Math.round(ceat),
          em_operacao: simNao(celula(ln, C.op)), procuracao: simNao(celula(ln, C.proc)),
          certificado: simNao(celula(ln, C.cert)), cadastro_regular: simNao(celula(ln, C.cadReg)),
          capag: texto(celula(ln, C.capag)), regime_tributario: texto(celula(ln, C.regime)),
          situacao_cadastral: texto(celula(ln, C.sit)).toUpperCase(), tipo_societario: texto(celula(ln, C.tipoSoc)),
          email: texto(celula(ln, C.email)), telefone: texto(celula(ln, C.tel)),
          endereco: texto(celula(ln, C.end)), cidade: texto(celula(ln, C.cidade)),
          estado: /^[A-Z]{2}$/.test(uf) ? uf : '',
          obs: texto(celula(ln, C.obs)), historico_cadastral: texto(celula(ln, C.hist)),
          data_migracao: dataISO(celula(ln, C.migr)), origem: texto(celula(ln, C.origem))
        });
        r.importadas++;
      }
    });
    return { tipo: 'base', clientes, grupos: [...grupos], avisos, resumo };
  }

  // ─────────────────────────── FINANCEIRO ──────────────────────────────
  // empresa: 'escritorio' (7 - Financeiro) ou 'contabilidade' (12 - …)
  function importarFinanceiro(planilha, empresa) {
    const lancamentos = [], grupos = new Set(), avisos = [], resumo = {};
    const ocorrencias = {};
    const ABAS = [
      { nome: 'A Receber', tipo: 'receita', pago: false },
      { nome: 'Receita',   tipo: 'receita', pago: true },
      { nome: 'Prejuízo',  tipo: 'receita', pago: false, perda: true },
      { nome: 'A Pagar',   tipo: 'despesa', pago: false },
      { nome: 'Despesa',   tipo: 'despesa', pago: true }
    ];
    ABAS.forEach((def) => {
      const aba = acharAba(planilha, def.nome);
      if (!aba) return;
      const r = resumo[aba.nome] = { lidas: 0, importadas: 0, ignoradas: 0, total: 0 };
      const L = aba.linhas;
      if (!L || L.length < 2) return;
      const col = mapa(L[0]);
      const C = {
        grupo: col('Grupo'), fornecedor: col('Fornecedor'), adv: col(['Advogado', 'Responsável']),
        tipo: col('Tipo'), categoria: col('Categoria'), ref: col('Referência'), venc: col('Vencimento'),
        valor: col('Valor'), situacao: col('Situação'), pagamento: col('Pagamento'),
        dataPag: col('Data de Pagamento'), forma: col('Forma de pagamento'), pix: col('PIX'),
        banco: col('Banco'), obs: col('Observação'), descricao: col('Descrição')
      };
      for (let i = 1; i < L.length; i++) {
        const ln = L[i];
        if (linhaVazia(ln)) continue;
        const onde = aba.nome + ', linha ' + (i + 1);
        r.lidas++;
        const venc = dataISO(celula(ln, C.venc));
        const valorBruto = numero(celula(ln, C.valor));
        if (!venc) { r.ignoradas++; avisos.push(onde + ': sem vencimento válido — ignorada.'); continue; }
        if (!valorBruto) { r.ignoradas++; avisos.push(onde + ': sem valor — ignorada.'); continue; }

        const grupo = texto(celula(ln, C.grupo));
        const fornecedor = texto(celula(ln, C.fornecedor));
        const tipoCol = texto(celula(ln, C.tipo));
        const categoria = texto(celula(ln, C.categoria)) || tipoCol;
        const ref = texto(celula(ln, C.ref));
        const obs = texto(celula(ln, C.obs));
        // valor negativo numa aba de receita = dedução (ex.: comissão) → despesa
        let tipo = def.tipo;
        if (valorBruto < 0) tipo = tipo === 'receita' ? 'despesa' : 'receita';
        const valor = Math.abs(valorBruto);

        const marcaPag = norm(texto(celula(ln, C.pagamento)));
        const pago = def.pago || marcaPag === 'sim';
        const celPag = celula(ln, C.dataPag);
        const dataPag = dataISO(celPag);
        let cobranca = '';
        if (!pago) {
          if (dataPag) cobranca = 'Previsão: ' + dataPag.split('-').reverse().join('/');
          else if (texto(celPag)) cobranca = texto(celPag).charAt(0).toUpperCase() + texto(celPag).slice(1).toLowerCase();
          const sit = norm(texto(celula(ln, C.situacao)));
          if (!cobranca && sit === 'emitir guia') cobranca = 'Emitir guia';
        }
        const pix = texto(celula(ln, C.pix));
        let forma = texto(celula(ln, C.forma));
        let chavePix = '';
        if (/cheque/i.test(pix)) forma = forma || 'Cheque'; else chavePix = pix;

        let descricao = texto(celula(ln, C.descricao));
        if (!descricao) {
          if (tipo === 'despesa' && def.tipo === 'despesa') descricao = [categoria, fornecedor].filter(Boolean).join(' — ') || 'Despesa';
          else if (valorBruto < 0) descricao = obs || ('Dedução — ' + (tipoCol || 'honorários'));
          else descricao = (tipoCol || 'Honorários') + (ref ? ' (' + ref + ')' : '');
        }

        const quem = grupo || fornecedor;
        const base = ['fin', empresa, tipo, norm(quem), venc, valor.toFixed(2), norm(categoria)].join(':');
        ocorrencias[base] = (ocorrencias[base] || 0) + 1;
        if (grupo) grupos.add(grupo);

        lancamentos.push({
          chave_importacao: base + '#' + ocorrencias[base], _grupo: grupo,
          empresa, tipo, descricao, categoria, favorecido: fornecedor,
          responsavel: texto(celula(ln, C.adv)), referencia: ref,
          vencimento: venc, valor, pago,
          data_pagamento: pago ? (dataPag || venc) : null,
          forma_pagamento: forma, conta: texto(celula(ln, C.banco)), chave_pix: chavePix,
          cobranca, perda: !!def.perda, obs
        });
        r.importadas++;
        r.total = Math.round((r.total + valorBruto) * 100) / 100;
      }
    });
    return { tipo: empresa === 'contabilidade' ? 'contabilidade' : 'financeiro', lancamentos, grupos: [...grupos], avisos, resumo };
  }

  function ocorrencia(mapa, base) { mapa[base] = (mapa[base] || 0) + 1; return base + '#' + mapa[base]; }

  // ─────────────────────────── PROCESSOS ───────────────────────────────
  function importarProcessos(planilha) {
    const processos = [], grupos = new Set(), avisos = [], resumo = {}, occ = {};
    [['Ativos', 'Ativo'], ['Prospecção', 'Prospecção']].forEach(([nomeAba, carteira]) => {
      const aba = acharAba(planilha, nomeAba);
      if (!aba) return;
      const r = resumo[aba.nome] = { lidas: 0, importadas: 0, ignoradas: 0, total: 0 };
      const L = aba.linhas; if (!L || L.length < 2) return;
      const col = mapa(L[0]);
      const C = { grupo: col('Grupo'), adv: col('Advogado'), num: col(['N° do Processo', 'Nº do Processo', 'No do Processo']),
        comp: col('Competência'), nat: col('Natureza'), autor: col('Autor'), reu: col(['Réus', 'Réu']),
        dist: col('Data de Distribuição'), valor: col('Valor'), atu: col('Atualização'), proc: col('Procuração'),
        outro: col('Outro Advogado'), status: col('Status'), arq: col('Data Arquivamento Provisório'),
        presc: col('Prescrição'), obs: col('Observação') };
      for (let i = 1; i < L.length; i++) {
        const ln = L[i]; if (linhaVazia(ln)) continue;
        r.lidas++;
        const numero = texto(celula(ln, C.num)).replace(/\s+/g, ' ');
        if (!numero) { r.ignoradas++; avisos.push(aba.nome + ', linha ' + (i + 1) + ': sem número do processo — ignorada.'); continue; }
        const grupo = texto(celula(ln, C.grupo)); if (grupo) grupos.add(grupo);
        const valor = numero_(celula(ln, C.valor));
        processos.push({
          chave_importacao: ocorrencia(occ, 'proc:' + norm(numero) + '|' + norm(grupo)), _grupo: grupo, carteira,
          advogado: texto(celula(ln, C.adv)), numero, competencia: texto(celula(ln, C.comp)), natureza: texto(celula(ln, C.nat)),
          autor: texto(celula(ln, C.autor)), reu: texto(celula(ln, C.reu)),
          data_distribuicao: dataISO(celula(ln, C.dist)), valor, atualizacao: dataISO(celula(ln, C.atu)),
          procuracao: simNao(celula(ln, C.proc)), outro_advogado: simNao(celula(ln, C.outro)),
          status: texto(celula(ln, C.status)), data_arq_provisorio: dataISO(celula(ln, C.arq)),
          prescricao: texto(celula(ln, C.presc)), obs: texto(celula(ln, C.obs))
        });
        r.importadas++; r.total = Math.round((r.total + (valor || 0)) * 100) / 100;
      }
    });
    return { tipo: 'processos', processos, grupos: [...grupos], avisos, resumo };
  }
  const numero_ = numero;

  // ─────────────────────────── PARCELAMENTOS ───────────────────────────
  // Mesmo layout lido pelo script antigo: cada empresa é um bloco de 5
  // colunas; linha 1 "Nome", linhas 2-11 os dados, parcelas da linha 13 em diante.
  const ABAS_IGNORAR_PARC = ['auxiliar', 'config', 'menu', 'legenda', 'aux'];
  function importarParcelamentos(planilha) {
    const parcelamentos = [], grupos = new Set(), avisos = [], resumo = {}, occ = {};
    Object.keys(planilha.abas).forEach((nomeAba) => {
      if (ABAS_IGNORAR_PARC.some((x) => norm(nomeAba).startsWith(x))) return;
      const d = planilha.abas[nomeAba];
      if (!d || d.length < 12) return;
      const r = resumo[nomeAba] = { lidas: 0, importadas: 0, ignoradas: 0, total: 0 };
      const largura = Math.max(...d.map((ln) => (ln || []).length));
      for (let col = 0; col < largura - 2; col += 5) {
        if (texto(celula(d[0], col)) !== 'Nome') continue;
        const empresa = texto(celula(d[0], col + 2));
        if (!empresa || norm(empresa) === 'nome' || empresa === '?') continue;
        r.lidas++;
        const dados = {};
        for (let rl = 1; rl <= 10; rl++) {
          const rot = norm(texto(celula(d[rl], col)));
          const val = celula(d[rl], col + 2);
          if (rot === 'cpf/cnpj') dados.cnpj = soDigitos(texto(val));
          if (rot === 'local') dados.local = texto(val);
          if (rot === 'natureza') dados.natureza = texto(val);
          if (rot === 'nº' || rot === 'no' || rot === 'n°' || rot === 'numero do parcelamento') dados.numero = texto(val);
          if (rot === 'total de parcelas') dados.total_parcelas = Math.round(numero(val) || 0) || null;
          if (rot === 'valor ultima parcela') dados.valor_ultima_parcela = numero(val);
          if (rot === 'valor residual') dados.valor_residual = numero(val);
        }
        const chave = ocorrencia(occ, 'parc:' + norm(nomeAba) + '|' + norm(empresa) + '|' + norm(dados.numero) + '|' + norm(dados.natureza));
        const parcelas = [], occP = {};
        for (let row = 12; row < d.length; row++) {
          const ln = d[row]; if (!ln) break;
          const num = texto(celula(ln, col));
          if (!num) break;
          parcelas.push({ chave_importacao: ocorrencia(occP, chave + ':' + num), numero: num,
            vencimento: dataISO(celula(ln, col + 1)), emissao: texto(celula(ln, col + 2)),
            pago: norm(texto(celula(ln, col + 3))) === 'sim' });
        }
        grupos.add(nomeAba);
        parcelamentos.push(Object.assign({ chave_importacao: chave, _grupo: nomeAba, aba: nomeAba, empresa,
          cnpj: '', local: '', natureza: '', numero: '', total_parcelas: null, valor_ultima_parcela: null, valor_residual: null }, dados, { _parcelas: parcelas }));
        r.importadas++; r.total = Math.round((r.total + (dados.valor_residual || 0)) * 100) / 100;
      }
    });
    return { tipo: 'parcelamentos', parcelamentos, grupos: [...grupos], avisos, resumo };
  }

  // ─────────────────────────── ACORDOS ─────────────────────────────────
  function importarAcordos(planilha) {
    const acordos = [], grupos = new Set(), avisos = [], resumo = {}, occ = {};
    Object.keys(planilha.abas).forEach((nomeAba) => {
      if (/^(aux|config|menu|legen)/i.test(norm(nomeAba))) return;
      const L = planilha.abas[nomeAba];
      if (!L || L.length < 2) return;
      const cab = cabecalhoDe(L);
      if (!cab.includes('processo')) return;
      const r = resumo[nomeAba] = { lidas: 0, importadas: 0, ignoradas: 0, total: 0 };
      const col = mapa(L[0]);
      const C = { grupo: col('Grupo'), resp: col('Responsável'), processo: col('Processo'), devedor: col('Devedor'),
        credor: col('Credor'), parcela: col('Nº de Parcela'), total: col('Total de Parcelas'), valor: col('Valor'),
        venc: col('Vencimento'), sit: col(['Status', 'Situação']), emissao: col('Emissão'), pag: col('Pagamento'),
        dataPag: col('Data de Pagamento'), pix: col('PIX'), banco: col('Banco'), obs: col('Observação') };
      const abaPago = norm(nomeAba) === 'pago';
      for (let i = 1; i < L.length; i++) {
        const ln = L[i]; if (linhaVazia(ln)) continue;
        r.lidas++;
        const processo = texto(celula(ln, C.processo));
        if (!processo) { r.ignoradas++; continue; }
        const grupo = texto(celula(ln, C.grupo)); if (grupo) grupos.add(grupo);
        const venc = dataISO(celula(ln, C.venc)), valor = numero(celula(ln, C.valor));
        const parcela = texto(celula(ln, C.parcela));
        const pago = abaPago || norm(texto(celula(ln, C.pag))) === 'sim';
        acordos.push({
          chave_importacao: ocorrencia(occ, 'acd:' + norm(processo) + '|' + norm(parcela) + '|' + (venc || '') + '|' + (valor == null ? '' : valor.toFixed(2))),
          _grupo: grupo, aba: nomeAba, responsavel: texto(celula(ln, C.resp)), processo,
          devedor: texto(celula(ln, C.devedor)), credor: texto(celula(ln, C.credor)), parcela,
          total_parcelas: texto(celula(ln, C.total)), valor, vencimento: venc,
          situacao: abaPago ? 'Pago' : texto(celula(ln, C.sit)), emissao: texto(celula(ln, C.emissao)),
          pago, data_pagamento: pago ? (dataISO(celula(ln, C.dataPag)) || venc) : null,
          pix: texto(celula(ln, C.pix)), banco: texto(celula(ln, C.banco)), obs: texto(celula(ln, C.obs))
        });
        r.importadas++; r.total = Math.round((r.total + (valor || 0)) * 100) / 100;
      }
    });
    return { tipo: 'acordos', acordos, grupos: [...grupos], avisos, resumo };
  }

  // ─────────────────────────── TAREFAS ─────────────────────────────────
  function importarTarefas(planilha) {
    const tarefas = [], grupos = new Set(), avisos = [], resumo = {}, occ = {};
    [['Tarefas', 'pendente'], ['Concluídas', 'concluida']].forEach(([nomeAba, padrao]) => {
      const aba = acharAba(planilha, nomeAba);
      if (!aba || !aba.linhas || aba.linhas.length < 2) return;
      const r = resumo[aba.nome] = { lidas: 0, importadas: 0, ignoradas: 0, total: 0 };
      const L = aba.linhas, col = mapa(L[0]);
      const C = { grupo: col('Grupo'), titulo: col('Tarefa'), proc: col('Processos Vinculados'), pri: col('Prioridade'),
        resp: col('Responsável'), status: col('Status'), ini: col('Data de Início'), prazo: col('Fim do Prazo'), obs: col('Observação') };
      for (let i = 1; i < L.length; i++) {
        const ln = L[i]; if (linhaVazia(ln)) continue;
        r.lidas++;
        const titulo = texto(celula(ln, C.titulo)), grupo = texto(celula(ln, C.grupo));
        if (!titulo) { r.ignoradas++; continue; }
        if (grupo) grupos.add(grupo);
        tarefas.push({ chave_importacao: ocorrencia(occ, 'trf:' + norm(titulo) + '|' + norm(grupo)), _grupo: grupo, titulo,
          processos_vinculados: texto(celula(ln, C.proc)), prioridade: texto(celula(ln, C.pri)) || 'media',
          responsavel: texto(celula(ln, C.resp)), status: texto(celula(ln, C.status)) || padrao,
          inicio: dataISO(celula(ln, C.ini)), prazo: dataISO(celula(ln, C.prazo)), obs: texto(celula(ln, C.obs)) });
        r.importadas++;
      }
    });
    return { tipo: 'tarefas', tarefas, grupos: [...grupos], avisos, resumo };
  }

  function importar(planilha) {
    const t = detectar(planilha);
    if (t === 'base') return importarBase(planilha);
    if (t === 'financeiro') return importarFinanceiro(planilha, 'escritorio');
    if (t === 'contabilidade') return importarFinanceiro(planilha, 'contabilidade');
    if (t === 'processos') return importarProcessos(planilha);
    if (t === 'parcelamentos') return importarParcelamentos(planilha);
    if (t === 'acordos') return importarAcordos(planilha);
    if (t === 'tarefas') return importarTarefas(planilha);
    return { tipo: null, avisos: ['Não reconheci esta planilha. Envie uma destas: 1 - Base de Dados, 2 - Processos, 3 - Parcelamentos Tributários, 4 - Acordos, 7 - Financeiro, 12 - Financeiro - Contabilidade ou 15 - Tarefas.'], resumo: {} };
  }

  // Workbook do ExcelJS → { abas: { nome: [[valor]] } }
  function lerWorkbook(wb) {
    const abas = {};
    wb.eachSheet((ws) => {
      const linhas = [];
      ws.eachRow({ includeEmpty: true }, (row, n) => {
        const vals = [];
        row.eachCell({ includeEmpty: true }, (cell, c) => { vals[c - 1] = valorCelula(cell.value); });
        linhas[n - 1] = vals;
      });
      for (let i = 0; i < linhas.length; i++) if (!linhas[i]) linhas[i] = [];
      abas[ws.name] = linhas;
    });
    return { abas };
  }

  const API = { importar, importarBase, importarFinanceiro, importarProcessos, importarParcelamentos, importarAcordos, importarTarefas, detectar, lerWorkbook, numero, dataISO, simNao, texto };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.IMPORTADOR = API;
})(typeof window !== 'undefined' ? window : globalThis);
