// Função "erp-publicacoes" do Supabase (Edge Functions): busca publicações no Diário de Justiça
// Eletrônico Nacional (API pública e gratuita do CNJ — Comunica PJe) pelas OABs cadastradas
// em Jurídico → Publicações e pelo NOME dos clientes monitorados (o Diário não busca por CNPJ),
// e guarda no banco sem duplicar. {"acao":"diagnostico"} testa a conexão com o CNJ.
// Como publicar: Supabase → Edge Functions → Deploy a new function → Via Editor, nome
// "erp-publicacoes", cole este arquivo e clique em Deploy; depois DESLIGUE "Verify JWT".
// Quem pode chamar: a rotina do banco (cabeçalho x-erp-segredo) ou alguém com a função Jurídico.
// Corpo opcional: {"de":"2026-09-01","ate":"2026-09-27"} (padrão: desde a última busca, no máximo 30 dias).
import { createClient } from 'npm:@supabase/supabase-js@2';

const VERSAO = '2026-10-01';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-erp-segredo',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const resposta = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
const iso = (d) => d.toISOString().slice(0, 10);
const primeiro = (o, nomes) => { for (const n of nomes) { if (o && o[n] != null && o[n] !== '') return o[n]; } return ''; };

// A API devolve campos com nomes em formatos variados: lê o primeiro que existir.
function dataISO(v) {
  const s = String(v || '');
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s); if (m) return m[3] + '-' + m[2] + '-' + m[1];
  return null;
}
export function normalizar(it, oab, parte) {
  const numero = String(primeiro(it, ['numero_processo', 'numeroProcesso', 'numeroprocesso'])).replace(/\D/g, '');
  const cnj = numero.length === 20 ? numero.replace(/^(\d{7})(\d{2})(\d{4})(\d)(\d{2})(\d{4})$/, '$1-$2.$3.$4.$5.$6') : numero;   // padrão CNJ
  const mascara = String(primeiro(it, ['numeroprocessocommascara', 'numeroProcessoComMascara', 'numero_processo_com_mascara']) || cnj);
  const dest = (primeiro(it, ['destinatarios']) || []);
  const advs = (primeiro(it, ['destinatarioadvogados', 'destinatarioAdvogados', 'advogados']) || []);
  const texto = String(primeiro(it, ['texto', 'conteudo', 'teor']));
  const idOrigem = String(primeiro(it, ['id', 'hash', 'numeroComunicacao']) || (numero + '|' + primeiro(it, ['data_disponibilizacao', 'dataDisponibilizacao']) + '|' + texto.slice(0, 40)));
  return {
    id_origem: 'djen:' + idOrigem,
    data_disponibilizacao: dataISO(primeiro(it, ['data_disponibilizacao', 'dataDisponibilizacao', 'datadisponibilizacao'])),
    tribunal: String(primeiro(it, ['siglaTribunal', 'sigla_tribunal', 'tribunal'])),
    orgao: String(primeiro(it, ['nomeOrgao', 'nome_orgao', 'orgao'])),
    tipo: String(primeiro(it, ['tipoComunicacao', 'tipo_comunicacao', 'tipoDocumento', 'tipo'])),
    processo: mascara, processo_numero: numero,
    classe: String(primeiro(it, ['nomeClasse', 'nome_classe', 'classe'])),
    texto: texto.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20000),
    link: String(primeiro(it, ['link', 'url'])),
    destinatarios: Array.isArray(dest) ? dest.map((d) => (d && (d.nome || d.name)) || '').filter(Boolean).join('; ') : String(dest),
    advogados: Array.isArray(advs) ? advs.map((a) => { const x = (a && (a.advogado || a)) || {}; return [x.nome, x.numero_oab ? 'OAB ' + x.numero_oab + '/' + (x.uf_oab || '') : ''].filter(Boolean).join(' '); }).filter(Boolean).join('; ') : String(advs),
    oab_numero: oab.numero || '', oab_uf: oab.uf || '', advogado: oab.advogado || '', parte_monitorada: parte || '',
    bruto: it
  };
}

const semAcento = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
// explica em português o que fazer quando o CNJ não responde
export function dicaErro(status) {
  if (status === 403 || status === 401) return 'O CNJ recusou o servidor do Supabase (a API costuma aceitar só conexões do Brasil). Use "Buscar pelo navegador" em Publicações.';
  if (status === 429) return 'Muitas consultas seguidas: o CNJ pediu para esperar. Tente de novo mais tarde.';
  if (status >= 500) return 'O Diário do CNJ está fora do ar agora. A próxima busca automática tenta de novo.';
  return 'Confira a internet do servidor ou use "Buscar pelo navegador" em Publicações.';
}
async function autorizado(req, db) {
  const seg = req.headers.get('x-erp-segredo');
  if (seg) {
    const { data } = await db.from('config_privada').select('valor').eq('chave', 'segredo_funcoes').maybeSingle();
    if (data && seg === data.valor) return true;
  }
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return false;
  const { data } = await db.auth.getUser(token);
  if (!data || !data.user) return false;
  const { data: p } = await db.from('perfis').select('papel, funcoes').eq('id', data.user.id).maybeSingle();
  return !!p && (p.papel === 'admin' || (p.papel === 'equipe' && !!(p.funcoes || {}).juridico));
}

export async function tratar(req, db, buscar) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    if (!(await autorizado(req, db))) return resposta({ erro: 'Sem permissão.' }, 401);
    const corpo = await req.json().catch(() => ({}));
    if (corpo.acao === 'ping') return resposta({ ok: true, versao: VERSAO });
    const { data: cfgApi } = await db.from('config_privada').select('valor').eq('chave', 'api_publicacoes').maybeSingle();
    const API = (cfgApi && cfgApi.valor) || 'https://comunicaapi.pje.jus.br/api/v1';
    if (corpo.acao === 'diagnostico') {
      const hj = iso(new Date());
      try {
        const r = await buscar(API + '/comunicacao?numeroOab=1&ufOab=MG&dataDisponibilizacaoInicio=' + hj + '&dataDisponibilizacaoFim=' + hj + '&pagina=1&itensPorPagina=5', { headers: { Accept: 'application/json' } });
        return resposta({ ok: r.ok, status: r.status, versao: VERSAO, dica: r.ok ? 'A API do CNJ respondeu normalmente.' : dicaErro(r.status) });
      } catch (e) { return resposta({ ok: false, status: 0, versao: VERSAO, dica: 'Sem conexão com a API do CNJ: ' + String((e && e.message) || e) + '. ' + dicaErro(0) }); }
    }
    const { data: ult } = await db.from('configuracoes').select('valor').eq('chave', 'publicacoes_ultima').maybeSingle();
    const hoje = new Date(), limite = new Date(Date.now() - 30 * 86400000);
    let de = corpo.de ? new Date(corpo.de + 'T12:00:00Z') : (ult && ult.valor && ult.valor.ate ? new Date(ult.valor.ate + 'T12:00:00Z') : new Date(Date.now() - 7 * 86400000));
    if (de < limite) de = limite;
    de = new Date(de.getTime() - 86400000);            // um dia de folga: publicação do fim do dia anterior
    const ate = corpo.ate ? new Date(corpo.ate + 'T12:00:00Z') : hoje;
    const { data: oabs, error } = await db.from('oabs_monitoradas').select('*').eq('ativo', true);
    if (error) throw error;
    let lidas = 0, novas = 0; const erros = [];
    for (const oab of oabs || []) {
      for (let pagina = 1; pagina <= 10; pagina++) {
        const url = API + '/comunicacao?numeroOab=' + encodeURIComponent(String(oab.numero).replace(/\D/g, '')) + '&ufOab=' + encodeURIComponent(oab.uf) +
          '&dataDisponibilizacaoInicio=' + iso(de) + '&dataDisponibilizacaoFim=' + iso(ate) + '&pagina=' + pagina + '&itensPorPagina=100';
        let json;
        try {
          const r = await buscar(url, { headers: { Accept: 'application/json' } });
          if (!r.ok) throw new Error('CNJ respondeu ' + r.status);
          json = await r.json();
        } catch (e) { erros.push('OAB ' + oab.numero + '/' + oab.uf + ': ' + String((e && e.message) || e) + ' — ' + dicaErro(Number(String(e && e.message).replace(/\D/g, '')) || 0)); break; }
        const itens = Array.isArray(json) ? json : (json.items || json.itens || json.content || json.data || []);
        lidas += itens.length;
        if (itens.length) {
          const linhas = itens.map((it) => normalizar(it, oab));
          const { data: ins, error: e2 } = await db.from('publicacoes').upsert(linhas, { onConflict: 'id_origem', ignoreDuplicates: true }).select('id');
          if (e2) { erros.push(String(e2.message || e2)); break; }
          novas += (ins || []).length;
        }
        if (itens.length < 100) break;
      }
    }
    // clientes monitorados pelo nome da parte (razão social)
    const { data: partes } = await db.from('partes_monitoradas').select('*').eq('ativo', true);
    for (const pt of partes || []) {
      for (let pagina = 1; pagina <= 5; pagina++) {
        const url = API + '/comunicacao?nomeParte=' + encodeURIComponent(pt.nome) +
          '&dataDisponibilizacaoInicio=' + iso(de) + '&dataDisponibilizacaoFim=' + iso(ate) + '&pagina=' + pagina + '&itensPorPagina=100';
        let json;
        try {
          const r = await buscar(url, { headers: { Accept: 'application/json' } });
          if (!r.ok) throw new Error('CNJ respondeu ' + r.status);
          json = await r.json();
        } catch (e) { erros.push('Parte ' + pt.nome + ': ' + String((e && e.message) || e)); break; }
        const itens = Array.isArray(json) ? json : (json.items || json.itens || json.content || json.data || []);
        // confere o nome entre os destinatários (a busca do Diário é aproximada)
        const alvo = semAcento(pt.nome);
        const certos = itens.filter((it) => { const d = primeiro(it, ['destinatarios']); return !Array.isArray(d) || !d.length || d.some((x) => semAcento((x && (x.nome || x.name)) || '').includes(alvo)); });
        lidas += certos.length;
        if (certos.length) {
          const linhas = certos.map((it) => normalizar(it, {}, pt.nome));
          const { data: ins, error: e2 } = await db.from('publicacoes').upsert(linhas, { onConflict: 'id_origem', ignoreDuplicates: true }).select('id');
          if (e2) { erros.push(String(e2.message || e2)); break; }
          novas += (ins || []).length;
        }
        if (itens.length < 100) break;
      }
    }
    const resumo = { quando: new Date().toISOString(), de: iso(de), ate: iso(ate), lidas, novas, erros: erros.slice(0, 5), oabs: (oabs || []).length, partes: (partes || []).length };
    await db.from('configuracoes').upsert({ chave: 'publicacoes_ultima', valor: resumo }, { onConflict: 'chave' });
    return resposta(resumo);
  } catch (e) {
    return resposta({ erro: String((e && e.message) || e) }, 500);
  }
}

Deno.serve((req) => tratar(req,
  createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } }),
  fetch));
