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

  function detectar(planilha) {
    const nomes = Object.keys(planilha.abas).map(norm);
    const tem = (n) => nomes.includes(norm(n));
    if (tem('Consultoria') && (tem('Demanda') || tem('Inativo'))) return 'base';
    if (tem('A Pagar') || tem('Despesa')) return 'contabilidade';
    if (tem('A Receber') || tem('Receita')) return 'financeiro';
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

  function importar(planilha) {
    const t = detectar(planilha);
    if (t === 'base') return importarBase(planilha);
    if (t === 'financeiro') return importarFinanceiro(planilha, 'escritorio');
    if (t === 'contabilidade') return importarFinanceiro(planilha, 'contabilidade');
    return { tipo: null, avisos: ['Não reconheci esta planilha. Envie a "1 - Base de Dados", a "7 - Financeiro" ou a "12 - Financeiro - Contabilidade".'], resumo: {} };
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

  const API = { importar, importarBase, importarFinanceiro, detectar, lerWorkbook, numero, dataISO, simNao, texto };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.IMPORTADOR = API;
})(typeof window !== 'undefined' ? window : globalThis);
