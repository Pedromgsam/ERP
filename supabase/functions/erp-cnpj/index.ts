// Função "erp-cnpj" do Supabase (Edge Functions): atualiza, pelo cartão CNPJ, os dados das empresas
// cadastradas (razão social, nome fantasia, situação cadastral, endereço, CNAE, porte, abertura) e
// guarda um relatório de cada execução (o que mudou e o que deu erro) — visto em Alertas → Cartão CNPJ.
// Roda todo dia às 6h pelo agendador do banco; o admin também pode rodar pelo botão "Atualizar agora".
// Como publicar: Supabase → Edge Functions → Deploy a new function → Via Editor, nome "erp-cnpj",
// cole este arquivo e clique em Deploy; depois DESLIGUE "Verify JWT".
// APIs aceitas (escolha em Alertas → Cartão CNPJ): BrasilAPI (grátis, sem chave), ReceitaWS (grátis com
// limite de 3 consultas por minuto; com token, sem limite) e CNPJá (open.cnpja.com, grátis com limite).
import { createClient } from 'npm:@supabase/supabase-js@2';

const VERSAO = '2026-10-29';
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
      cidade: limpa(j.municipio), estado: limpa(j.uf), cep: String(j.cep || '').replace(/\D/g, ''),
      socios: (j.qsa || []).map((x) => ({ nome: limpa(x.nome), qualificacao: limpa(x.qual), doc: '' })).filter((x) => x.nome),
      email: limpa(j.email).toLowerCase(), telefone: limpa(j.telefone).split('/')[0].trim(), natureza_juridica: limpa(j.natureza_juridica),
      simples: j.simples ? !!j.simples.optante : null, mei: j.simei ? !!j.simei.optante : null };
  }
  if (provedor === 'cnpja') {
    const a = j.address || {}, c = j.company || {};
    return { razao_social: limpa(c.name), nome_fantasia: limpa(j.alias), situacao_cadastral: limpa(j.status && j.status.text).toUpperCase(), data_situacao: iso(j.statusDate),
      cnae_principal: limpa(j.mainActivity && j.mainActivity.text), porte: limpa(c.size && c.size.text), data_abertura: iso(j.founded),
      endereco: [limpa(a.street) + (a.number ? ', ' + limpa(a.number) : ''), limpa(a.details), limpa(a.district)].filter(Boolean).join(' - '),
      cidade: limpa(a.city), estado: limpa(a.state), cep: String(a.zip || '').replace(/\D/g, ''),
      socios: (c.members || []).map((x) => ({ nome: limpa(x.person && x.person.name), qualificacao: limpa(x.role && x.role.text), doc: String((x.person && x.person.taxId) || '').replace(/[^\d*]/g, '') })).filter((x) => x.nome),
      email: limpa(((j.emails || [])[0] || {}).address).toLowerCase(), telefone: (((j.phones || [])[0]) ? limpa(j.phones[0].area) + limpa(j.phones[0].number) : ''),
      natureza_juridica: limpa(c.nature && c.nature.text), simples: c.simples ? !!c.simples.optant : null, mei: c.simei ? !!c.simei.optant : null };
  }
  // BrasilAPI
  return { razao_social: limpa(j.razao_social), nome_fantasia: limpa(j.nome_fantasia), situacao_cadastral: limpa(j.descricao_situacao_cadastral).toUpperCase(),
    data_situacao: iso(j.data_situacao_cadastral), cnae_principal: limpa(j.cnae_fiscal_descricao), porte: limpa(j.porte || j.descricao_porte), data_abertura: iso(j.data_inicio_atividade),
    endereco: [[limpa(j.descricao_tipo_de_logradouro), limpa(j.logradouro)].filter(Boolean).join(' ') + (j.numero ? ', ' + limpa(j.numero) : ''), limpa(j.complemento), limpa(j.bairro)].filter(Boolean).join(' - '),
    cidade: limpa(j.municipio), estado: limpa(j.uf), cep: String(j.cep || '').replace(/\D/g, ''),
    socios: (j.qsa || []).map((x) => ({ nome: limpa(x.nome_socio), qualificacao: limpa(x.qualificacao_socio), doc: String(x.cnpj_cpf_do_socio || '').replace(/[^\d*]/g, '') })).filter((x) => x.nome),
    email: limpa(j.email).toLowerCase(), telefone: limpa(j.ddd_telefone_1), natureza_juridica: limpa(j.natureza_juridica),
    simples: j.opcao_pelo_simples == null ? null : !!j.opcao_pelo_simples, mei: j.opcao_pelo_mei == null ? null : !!j.opcao_pelo_mei };
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
  if (p && p.papel === 'admin') return 'manual';
  if (p && p.papel === 'equipe') return 'equipe';          // equipe: só a consulta de UM cliente (cadastro novo)
  return null;
}
// fontes reserva quando a principal não acha o CNPJ (a BrasilAPI usa a base aberta da Receita, publicada 1x por mês;
// empresa recém-aberta aparece antes na ReceitaWS/CNPJá). Poucas por execução, por causa do limite gratuito delas.
const RESERVAS = ['receitaws', 'cnpja'];
const MAX_RESERVA = 4;

export async function tratar(req, db, buscar, esperar) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  esperar = esperar || espera;
  let exec = null;
  try {
    const origem = await autorizado(req, db);
    if (!origem) return resposta({ erro: 'Sem permissão.' }, 401);
    const corpo = await req.json().catch(() => ({}));
    if (corpo.acao === 'ping') return resposta({ ok: true, versao: VERSAO });
    if (origem === 'equipe' && !corpo.cliente_id && corpo.acao !== 'previa') return resposta({ erro: 'Sem permissão: a equipe consulta um cliente por vez.' }, 401);
    // disparo automático do cadastro (Central de automações → "Cliente novo com CNPJ")
    if (corpo.auto) {
      const { data: rg } = await db.from('regras_tarefas').select('ligada').eq('chave', 'cliente_novo_cnpj').maybeSingle();
      if (rg && !rg.ligada) return resposta({ ok: true, desligada: true, mensagem: 'Automação desligada.' });
    }
    const { data: cfgRow } = await db.from('config_privada').select('valor').eq('chave', 'api_cnpj').maybeSingle();
    const cfg = (cfgRow && cfgRow.valor) || { provedor: 'brasilapi' };
    const provedor = cfg.provedor || 'brasilapi', bases = cfg.bases || {};
    // Backup 28: {acao:'previa', cnpj} — cadastro novo: consulta na hora, enquanto digita, SEM gravar nada
    if (corpo.acao === 'previa') {
      const cnpj = String(corpo.cnpj || '').replace(/\D/g, '');
      if (cnpj.length !== 14) return resposta({ erro: 'CNPJ incompleto.' }, 400);
      for (const prov of [provedor].concat(RESERVAS.filter((x) => x !== provedor)).slice(0, 2)) {
        const tk = prov === provedor ? cfg.token : '';
        try {
          const r = await buscar(url(prov, cnpj, tk, bases), { headers: Object.assign({ Accept: 'application/json' }, prov === 'receitaws' && tk ? { Authorization: 'Bearer ' + tk } : {}) });
          if (r.status === 404) continue;
          if (!r.ok) return resposta({ ok: false, erro: 'A consulta respondeu ' + r.status + '. Tente de novo em instantes.' });
          const j = await r.json();
          return resposta({ ok: true, fonte: prov, dados: normalizar(prov, j) });
        } catch (e) { if (prov !== provedor) break; }
      }
      return resposta({ ok: false, aguardando: true, erro: 'CNPJ ainda não está na base pública da Receita (empresa recém-aberta). Preencha à mão; o sistema tenta de novo todo dia.' });
    }
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
    const relatorio = []; let consultados = 0, alterados = 0, erros = 0, aguardando = 0, reservasUsadas = 0;
    // consulta numa fonte; devolve { d, fonte } ou lança erro (404 → nao_encontrado)
    const consultar = async (prov, cnpj) => {
      const tk = prov === provedor ? cfg.token : '';
      const r = await buscar(url(prov, cnpj, tk, bases), { headers: Object.assign({ Accept: 'application/json' }, prov === 'receitaws' && tk ? { Authorization: 'Bearer ' + tk } : {}) });
      if (r.status === 429) throw new Error('limite de consultas da API atingido (tenta de novo amanhã)');
      if (r.status === 404) { const e = new Error('CNPJ não encontrado na Receita'); e.nao_encontrado = true; throw e; }
      if (!r.ok) throw new Error('API respondeu ' + r.status);
      const j = await r.json();
      if (prov === 'receitaws' && j && j.status === 'ERROR') { const e = new Error(j.message || 'CNPJ não encontrado'); e.nao_encontrado = /inv[aá]lido|n[aã]o encontrado|rejeitado/i.test(j.message || 'não encontrado'); throw e; }
      return { d: normalizar(prov, j), fonte: prov };
    };
    for (const c of pjs) {
      const cnpj = String(c.cpf_cnpj).replace(/\D/g, '');
      try {
        let achou = null;
        try { achou = await consultar(provedor, cnpj); }
        catch (e1) {
          if (!e1.nao_encontrado) throw e1;
          for (const prov of RESERVAS.filter((x) => x !== provedor)) {
            if (reservasUsadas >= MAX_RESERVA) break;
            reservasUsadas++; await esperar(PAUSA[prov] || 400);
            try { achou = await consultar(prov, cnpj); break; } catch (e2) { if (!e2.nao_encontrado) break; }
          }
          if (!achou) {
            // empresa nova: ainda não está nas bases abertas. Não é erro; tenta de novo amanhã (fica no começo da fila).
            aguardando++;
            relatorio.push({ cliente_id: c.id, nome: c.nome, cnpj, aguardando: true,
              aviso: 'Ainda não está na base pública da Receita (empresa recém-aberta: a base atualiza 1x por mês). O sistema tenta de novo todo dia.' });
            await esperar(pausa); continue;
          }
        }
        const d = achou.d;
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
        const fonte = achou.fonte !== provedor ? { fonte: achou.fonte } : {};
        if (mudancas.length && c.cnpj_atualizado_em) { alterados++; relatorio.push(Object.assign({ cliente_id: c.id, nome: c.nome, cnpj, mudancas }, fonte)); }
        else if (mudancas.length) relatorio.push(Object.assign({ cliente_id: c.id, nome: c.nome, cnpj, mudancas, primeira: true }, fonte));
      } catch (e) {
        erros++;
        relatorio.push({ cliente_id: c.id, nome: c.nome, cnpj, erro: String((e && e.message) || e).slice(0, 200) });
      }
      await esperar(pausa);
    }
    const status = !pjs.length ? 'ok' : erros === 0 ? 'ok' : consultados === 0 ? 'erro' : 'parcial';
    const resumo = { fim: new Date().toISOString(), status, consultados, alterados, erros, relatorio,
      mensagem: pjs.length ? consultados + ' consultado(s), ' + alterados + ' com alteração, ' + erros + ' erro(s)' + (aguardando ? ', ' + aguardando + ' aguardando a Receita' : '') : 'Nenhuma empresa com CNPJ cadastrado.' };
    await db.from('cnpj_execucoes').update(resumo).eq('id', exec.id);
    if (corpo.auto && corpo.cliente_id) {
      const c0 = pjs[0];
      await db.from('automacoes_log').insert({ chave: 'cliente_novo_cnpj', ref: 'cnpj:' + corpo.cliente_id, cliente_id: corpo.cliente_id,
        descricao: 'Cliente novo: cartão CNPJ ' + (aguardando ? 'aguardando a Receita' : consultados ? 'preenchido' : 'com erro') + (c0 ? ' — ' + c0.nome : '') }).then(() => {}, () => {});
    }
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
