// Função "erp-cnpj" do Supabase (Edge Functions): atualiza, pelo cartão CNPJ, os dados das empresas
// cadastradas (razão social, nome fantasia, situação cadastral, endereço, CNAE, porte, abertura) e
// guarda um relatório de cada execução (o que mudou e o que deu erro) — visto em Alertas → Cartão CNPJ.
// Roda todo dia às 6h pelo agendador do banco; o admin também pode rodar pelo botão "Atualizar agora".
// Como publicar: Supabase → Edge Functions → Deploy a new function → Via Editor, nome "erp-cnpj",
// cole este arquivo e clique em Deploy; depois DESLIGUE "Verify JWT".
// APIs aceitas (escolha em Alertas → Cartão CNPJ): BrasilAPI (grátis, sem chave), ReceitaWS (grátis com
// limite de 3 consultas por minuto; com token, sem limite) e CNPJá (open.cnpja.com, grátis com limite).
import { createClient } from 'npm:@supabase/supabase-js@2';

const VERSAO = '2026-09-29';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-erp-segredo',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const resposta = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
const LOTE = 150;            // por execução (as mais antigas primeiro); o resto vai no dia seguinte
const PAUSA = { brasilapi: 350, receitaws: 21000, cnpja: 12500 };   // respeita o limite gratuito de cada API
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
const iso = (s) => { const t = String(s || ''); let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t); if (m) return m[0]; m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(t); return m ? m[3] + '-' + m[2] + '-' + m[1] : null; };
const limpa = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

// resposta de cada API → formato único
export function normalizar(provedor, j) {
  if (provedor === 'receitaws') {
    if (j.status === 'ERROR') throw new Error(j.message || 'CNPJ não encontrado');
    return { razao_social: limpa(j.nome), nome_fantasia: limpa(j.fantasia), situacao_cadastral: limpa(j.situacao).toUpperCase(), data_situacao: iso(j.data_situacao),
      cnae_principal: limpa(j.atividade_principal && j.atividade_principal[0] && j.atividade_principal[0].text), porte: limpa(j.porte), data_abertura: iso(j.abertura),
      endereco: [limpa(j.logradouro) + (j.numero ? ', ' + limpa(j.numero) : ''), limpa(j.complemento), limpa(j.bairro)].filter(Boolean).join(' - '),
      cidade: limpa(j.municipio), estado: limpa(j.uf), cep: String(j.cep || '').replace(/\D/g, '') };
  }
  if (provedor === 'cnpja') {
    const a = j.address || {}, c = j.company || {};
    return { razao_social: limpa(c.name), nome_fantasia: limpa(j.alias), situacao_cadastral: limpa(j.status && j.status.text).toUpperCase(), data_situacao: iso(j.statusDate),
      cnae_principal: limpa(j.mainActivity && j.mainActivity.text), porte: limpa(c.size && c.size.text), data_abertura: iso(j.founded),
      endereco: [limpa(a.street) + (a.number ? ', ' + limpa(a.number) : ''), limpa(a.details), limpa(a.district)].filter(Boolean).join(' - '),
      cidade: limpa(a.city), estado: limpa(a.state), cep: String(a.zip || '').replace(/\D/g, '') };
  }
  // BrasilAPI
  return { razao_social: limpa(j.razao_social), nome_fantasia: limpa(j.nome_fantasia), situacao_cadastral: limpa(j.descricao_situacao_cadastral).toUpperCase(),
    data_situacao: iso(j.data_situacao_cadastral), cnae_principal: limpa(j.cnae_fiscal_descricao), porte: limpa(j.porte || j.descricao_porte), data_abertura: iso(j.data_inicio_atividade),
    endereco: [[limpa(j.descricao_tipo_de_logradouro), limpa(j.logradouro)].filter(Boolean).join(' ') + (j.numero ? ', ' + limpa(j.numero) : ''), limpa(j.complemento), limpa(j.bairro)].filter(Boolean).join(' - '),
    cidade: limpa(j.municipio), estado: limpa(j.uf), cep: String(j.cep || '').replace(/\D/g, '') };
}
function url(provedor, cnpj, token, bases) {
  if (provedor === 'receitaws') return (bases.receitaws || 'https://receitaws.com.br/v1/cnpj/') + cnpj + (token ? '/days/1' : '');
  if (provedor === 'cnpja') return (bases.cnpja || 'https://open.cnpja.com/office/') + cnpj;
  return (bases.brasilapi || 'https://brasilapi.com.br/api/cnpj/v1/') + cnpj;
}
const CAMPOS = { razao_social: 'Razão social', nome_fantasia: 'Nome fantasia', situacao_cadastral: 'Situação cadastral', data_situacao: 'Data da situação',
  cnae_principal: 'Atividade principal', porte: 'Porte', data_abertura: 'Abertura', endereco: 'Endereço', cidade: 'Cidade', estado: 'UF', cep: 'CEP' };

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

export async function tratar(req, db, buscar, esperar) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  esperar = esperar || espera;
  let exec = null;
  try {
    const origem = await autorizado(req, db);
    if (!origem) return resposta({ erro: 'Sem permissão.' }, 401);
    const corpo = await req.json().catch(() => ({}));
    if (corpo.acao === 'ping') return resposta({ ok: true, versao: VERSAO });
    const { data: cfgRow } = await db.from('config_privada').select('valor').eq('chave', 'api_cnpj').maybeSingle();
    const cfg = (cfgRow && cfgRow.valor) || { provedor: 'brasilapi' };
    const provedor = cfg.provedor || 'brasilapi', bases = cfg.bases || {};
    // {cliente_id}: consulta só aquela empresa (botão "Consultar agora" da ficha do cliente)
    let consulta = db.from('clientes')
      .select('id, nome, cpf_cnpj, razao_social, nome_fantasia, situacao_cadastral, data_situacao, cnae_principal, porte, data_abertura, endereco, cidade, estado, cep, cnpj_atualizado_em');
    if (corpo.cliente_id) consulta = consulta.eq('id', corpo.cliente_id);
    const { data: clientes, error } = await consulta.order('cnpj_atualizado_em', { ascending: true, nullsFirst: true });
    if (error) throw error;
    // quantas por execução: a função tem ~150 s para rodar; APIs com limite por minuto fazem poucas por dia
    const semLimite = provedor === 'brasilapi' || (provedor === 'receitaws' && cfg.token);
    const lote = corpo.limite || (semLimite ? LOTE : provedor === 'receitaws' ? 6 : 10);
    const pausa = semLimite ? 350 : (PAUSA[provedor] || 400);
    const pjs = (clientes || []).filter((c) => String(c.cpf_cnpj || '').replace(/\D/g, '').length === 14).slice(0, lote);
    const { data: ex } = await db.from('cnpj_execucoes').insert({ origem, provedor, total: pjs.length }).select().single();
    exec = ex;
    const relatorio = []; let consultados = 0, alterados = 0, erros = 0;
    for (const c of pjs) {
      const cnpj = String(c.cpf_cnpj).replace(/\D/g, '');
      try {
        const r = await buscar(url(provedor, cnpj, cfg.token, bases), { headers: Object.assign({ Accept: 'application/json' }, provedor === 'receitaws' && cfg.token ? { Authorization: 'Bearer ' + cfg.token } : {}) });
        if (r.status === 429) throw new Error('limite de consultas da API atingido (tenta de novo amanhã)');
        if (r.status === 404) throw new Error('CNPJ não encontrado na Receita');
        if (!r.ok) throw new Error('API respondeu ' + r.status);
        const d = normalizar(provedor, await r.json());
        const mudancas = [];
        Object.keys(CAMPOS).forEach((k) => {
          const antes = c[k] == null ? '' : String(c[k]), depois = d[k] == null ? '' : String(d[k]);
          if (depois && antes !== depois) mudancas.push({ campo: CAMPOS[k], antes, depois });
        });
        const upd = { cnpj_atualizado_em: new Date().toISOString(), cnpj_dados: d };
        Object.keys(CAMPOS).forEach((k) => { if (d[k]) upd[k] = d[k]; });
        const { error: e2 } = await db.from('clientes').update(upd).eq('id', c.id);
        if (e2) throw e2;
        consultados++;
        if (mudancas.length && c.cnpj_atualizado_em) { alterados++; relatorio.push({ cliente_id: c.id, nome: c.nome, cnpj, mudancas }); }
        else if (mudancas.length) relatorio.push({ cliente_id: c.id, nome: c.nome, cnpj, mudancas, primeira: true });
      } catch (e) {
        erros++;
        relatorio.push({ cliente_id: c.id, nome: c.nome, cnpj, erro: String((e && e.message) || e).slice(0, 200) });
      }
      await esperar(pausa);
    }
    const status = !pjs.length ? 'ok' : erros === 0 ? 'ok' : consultados === 0 ? 'erro' : 'parcial';
    const resumo = { fim: new Date().toISOString(), status, consultados, alterados, erros, relatorio,
      mensagem: pjs.length ? consultados + ' consultado(s), ' + alterados + ' com alteração, ' + erros + ' erro(s)' : 'Nenhuma empresa com CNPJ cadastrado.' };
    await db.from('cnpj_execucoes').update(resumo).eq('id', exec.id);
    return resposta(Object.assign({ total: pjs.length }, resumo, { relatorio: undefined }));
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (exec) await db.from('cnpj_execucoes').update({ fim: new Date().toISOString(), status: 'erro', mensagem: msg }).eq('id', exec.id);
    return resposta({ erro: msg }, 500);
  }
}

Deno.serve((req) => tratar(req,
  createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } }),
  fetch));
