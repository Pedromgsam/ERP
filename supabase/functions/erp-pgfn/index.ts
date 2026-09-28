// Função "erp-pgfn" do Supabase (Edge Functions): consulta, pela API "Consulta Dívida Ativa" do SERPRO,
// as inscrições em dívida ativa da União (PGFN) de cada CNPJ cadastrado e grava em pgfn_inscricoes
// (uma linha por CDA: origem, situação, se está parcelada e valor). O total atualiza o campo PGFN do
// cliente: o que está em cobrança vai para "PGFN" e o parcelado/negociado para "PGFN negociada".
// Roda todo dia às 6h15 pelo agendador do banco e pula quando a frequência escolhida não é hoje
// (diária, semanal às segundas ou mensal no dia 1º). O admin também pode rodar por "Consultar agora".
// PAGO: cada CNPJ consultado é uma consulta cobrada pelo SERPRO (tabela na Loja SERPRO). Nada roda
// enquanto a chave não for salva em Alertas → PGFN e a rotina não estiver ligada.
// Como publicar: Supabase → Edge Functions → Deploy a new function → Via Editor, nome "erp-pgfn",
// cole este arquivo e clique em Deploy; depois DESLIGUE "Verify JWT".
import { createClient } from 'npm:@supabase/supabase-js@2';

const VERSAO = '2026-09-28';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-erp-segredo',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const resposta = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
const TOKEN_URL = 'https://gateway.apiserpro.serpro.gov.br/token';
const BASE_URL = 'https://gateway.apiserpro.serpro.gov.br/consulta-divida-ativa-df/api/v1';
const LOTE = 200;            // por execução (os consultados há mais tempo primeiro)
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

// "4.457,56" | 4457.56 → 4457.56
export function numero(v) {
  if (typeof v === 'number') return v;
  const t = String(v == null ? '' : v).replace(/[^\d,.-]/g, '');
  if (!t) return 0;
  return t.indexOf(',') >= 0 ? Number(t.replace(/\./g, '').replace(',', '.')) || 0 : Number(t) || 0;
}
const iso = (s) => { const t = String(s || ''); let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t); if (m) return m[0]; m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(t); return m ? m[3] + '-' + m[2] + '-' + m[1] : null; };
// origem da dívida pelo texto que a API devolver (receita, natureza ou tipo)
export function natureza(i) {
  const t = [i.naturezaDivida, i.tipoDevedor === 'FGTS' ? 'FGTS' : '', i.receitaPrincipal, i.nomeReceita, i.receita, i.tipoCredito, i.natureza].filter(Boolean).join(' ').toUpperCase();
  if (/FGTS/.test(t)) return 'FGTS';
  if (/SIMPLES/.test(t)) return 'Simples Nacional';
  if (/PREVID|INSS|CONTRIB.*SOCIAL.*SEGUR/.test(t)) return 'Previdenciária';
  if (/MULTA.*(TRABALH|ELEITORAL|CRIMINAL)/.test(t)) return 'Multa (não tributária)';
  if (/N[ÃA]O TRIBUT/.test(t)) return 'Não tributária';
  return 'Tributária';
}
export function parcelada(sit) { return /PARCEL|NEGOCIA|TRANSA[CÇ]|SUSPENS|GARANT|ACORDO/i.test(String(sit || '')); }
// a API devolve uma lista de inscrições (ou um objeto com a lista dentro)
export function lerInscricoes(j) {
  const lista = Array.isArray(j) ? j : Array.isArray(j && j.inscricoes) ? j.inscricoes : Array.isArray(j && j.dividas) ? j.dividas : j && j.numeroInscricao ? [j] : [];
  return lista.map((i) => {
    const sit = i.situacaoDescricao || i.descricaoSituacao || i.situacaoInscricao || i.situacao || '';
    return { inscricao: String(i.numeroInscricao || i.inscricao || '').trim(), natureza: natureza(i), receita: String(i.receitaPrincipal || i.nomeReceita || i.receita || '').slice(0, 200),
      situacao: String(sit).slice(0, 200), parcelada: parcelada(sit), valor: numero(i.valorTotalConsolidadoMoeda ?? i.valorConsolidado ?? i.valor ?? 0),
      data_inscricao: iso(i.dataInscricao) };
  }).filter((i) => i.inscricao);
}

async function autorizado(req, db) {
  const seg = req.headers.get('x-erp-segredo');
  if (seg) {
    const { data } = await db.from('config_privada').select('valor').eq('chave', 'segredo_funcoes').maybeSingle();
    if (data && seg === data.valor) return 'rotina';
  }
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await db.auth.getUser(token);
  if (!data || !data.user) return null;
  const { data: p } = await db.from('perfis').select('papel').eq('id', data.user.id).maybeSingle();
  return p && p.papel === 'admin' ? 'manual' : null;
}
// frequência escolhida: diária | semanal (segunda) | mensal (dia 1º); o botão "Consultar agora" ignora
export function ehDia(freq, hoje) {
  const d = hoje || new Date();
  if (freq === 'semanal') return d.getUTCDay() === 1;
  if (freq === 'mensal') return d.getUTCDate() === 1;
  return true;
}

export async function tratar(req, db, buscar, esperar) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  esperar = esperar || espera;
  let exec = null;
  try {
    const origem = await autorizado(req, db);
    if (!origem) return resposta({ erro: 'Sem permissão.' }, 401);
    const corpo = await req.json().catch(() => ({}));
    if (corpo.acao === 'ping') return resposta({ ok: true, versao: VERSAO });
    const { data: cfgRow } = await db.from('config_privada').select('valor').eq('chave', 'api_pgfn').maybeSingle();
    const cfg = (cfgRow && cfgRow.valor) || {};
    if (!cfg.consumer_key || !cfg.consumer_secret) return resposta({ ok: false, erro: 'Chave do SERPRO não salva (Alertas → PGFN).' });
    if (origem === 'rotina' && (!cfg.ligada || !ehDia(cfg.frequencia))) return resposta({ ok: true, pulado: true, mensagem: cfg.ligada ? 'Hoje não é dia de consulta (frequência ' + cfg.frequencia + ').' : 'Rotina desligada.' });
    // token OAuth2 (client credentials)
    const tk = await buscar(cfg.token_url || TOKEN_URL, { method: 'POST',
      headers: { Authorization: 'Basic ' + btoa(cfg.consumer_key + ':' + cfg.consumer_secret), 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
    if (!tk.ok) throw new Error('SERPRO recusou a chave (token ' + tk.status + '). Confira consumer key/secret na área do cliente SERPRO.');
    const acesso = (await tk.json()).access_token;
    let consulta = db.from('clientes').select('id, nome, cpf_cnpj, pgfn, pgfn_negociada, tipo').neq('tipo', 'Inativo');
    if (corpo.cliente_id) consulta = consulta.eq('id', corpo.cliente_id);
    const { data: clientes, error } = await consulta;
    if (error) throw error;
    const pjs = (clientes || []).filter((c) => String(c.cpf_cnpj || '').replace(/\D/g, '').length === 14).slice(0, corpo.limite || LOTE);
    const { data: ex } = await db.from('pgfn_execucoes').insert({ origem, total: pjs.length }).select().single();
    exec = ex;
    const relatorio = []; let consultados = 0, alterados = 0, erros = 0;
    for (const c of pjs) {
      const cnpj = String(c.cpf_cnpj).replace(/\D/g, '');
      try {
        const r = await buscar((cfg.base_url || BASE_URL) + '/devedor/' + cnpj, { headers: { Accept: 'application/json', Authorization: 'Bearer ' + acesso } });
        if (r.status === 429) throw new Error('limite de consultas do SERPRO atingido');
        const ins = r.status === 404 || r.status === 204 ? [] : r.ok ? lerInscricoes(await r.json()) : null;
        if (ins === null) throw new Error('SERPRO respondeu ' + r.status);
        consultados++;
        const emCobranca = ins.filter((i) => !i.parcelada).reduce((s, i) => s + i.valor, 0), negociada = ins.filter((i) => i.parcelada).reduce((s, i) => s + i.valor, 0);
        await db.from('pgfn_inscricoes').delete().eq('cliente_id', c.id);
        if (ins.length) {
          const { error: e1 } = await db.from('pgfn_inscricoes').insert(ins.map((i) => Object.assign({ cliente_id: c.id, atualizado_em: new Date().toISOString() }, i)));
          if (e1) throw e1;
        }
        const antes = [Number(c.pgfn) || 0, Number(c.pgfn_negociada) || 0], depois = [Math.round(emCobranca * 100) / 100, Math.round(negociada * 100) / 100];
        if (antes[0] !== depois[0] || antes[1] !== depois[1]) {
          const { error: e2 } = await db.from('clientes').update({ pgfn: depois[0] || null, pgfn_negociada: depois[1] || null }).eq('id', c.id);
          if (e2) throw e2;
          alterados++;
          relatorio.push({ cliente_id: c.id, nome: c.nome, cnpj, antes, depois, inscricoes: ins.length });
        }
      } catch (e) {
        erros++;
        relatorio.push({ cliente_id: c.id, nome: c.nome, cnpj, erro: String((e && e.message) || e).slice(0, 200) });
      }
      await esperar(250);
    }
    const status = !pjs.length ? 'ok' : erros === 0 ? 'ok' : consultados === 0 ? 'erro' : 'parcial';
    const resumo = { fim: new Date().toISOString(), status, consultados, alterados, erros, relatorio,
      mensagem: pjs.length ? consultados + ' CNPJ(s) consultado(s), ' + alterados + ' com mudança, ' + erros + ' erro(s)' : 'Nenhuma empresa com CNPJ cadastrado.' };
    await db.from('pgfn_execucoes').update(resumo).eq('id', exec.id);
    return resposta(Object.assign({ total: pjs.length }, resumo, { relatorio: undefined }));
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (exec) await db.from('pgfn_execucoes').update({ fim: new Date().toISOString(), status: 'erro', mensagem: msg }).eq('id', exec.id);
    return resposta({ erro: msg }, 500);
  }
}

Deno.serve((req) => tratar(req,
  createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } }),
  fetch));
