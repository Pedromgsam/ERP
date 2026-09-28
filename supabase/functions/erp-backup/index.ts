// erp-backup — cópia de segurança semanal dos DADOS, no Storage privado "backups".
// Rotina: domingo 3h (pg_cron 'erp_backup', header x-erp-segredo). Manual: admin em Administração → Backup.
// Guarda as 8 cópias mais recentes; o arquivo é o mesmo .json do backup manual (versao 2), pode ser baixado.
import { createClient } from 'npm:@supabase/supabase-js@2';

const VERSAO = '2026-09-29';
const MANTER = 8;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-erp-segredo',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const resposta = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
const ORDEM = { historico: 'id', perfil_grupos: 'perfil_id', configuracoes: 'chave', cliente_etiquetas: 'cliente_id', salarios_minimos: 'ano', acessos: 'id' };

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

async function lerTudo(db, t) {
  const out = [];
  let ordem = t in ORDEM ? ORDEM[t] : 'id';          // ordem fixa para paginar sem perder nem repetir linhas
  for (let de = 0; ; de += 1000) {
    let q = db.from(t).select('*').range(de, de + 999);
    if (ordem) q = q.order(ordem);
    const { data, error } = await q;
    if (error) {
      if (ordem && /column|does not exist|42703/i.test(error.message + ' ' + (error.code || ''))) { ordem = null; de -= 1000; continue; }
      throw new Error(t + ': ' + error.message);
    }
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function tratar(req, db) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const origem = await autorizado(req, db);
    if (!origem) return resposta({ erro: 'Sem permissão.' }, 401);
    const corpo = await req.json().catch(() => ({}));
    if (corpo.acao === 'ping') return resposta({ ok: true, versao: VERSAO });
    const { data: tabelas, error: e0 } = await db.rpc('listar_tabelas_backup');
    if (e0) throw e0;
    const dados = {}, resumo = {};
    for (const t of tabelas || []) { dados[t] = await lerTudo(db, t); resumo[t] = dados[t].length; }
    const agora = new Date();
    const texto = JSON.stringify({ gerado_em: agora.toISOString(), versao: 2, origem, dados });
    const caminho = 'backup-' + agora.toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json';
    const bytes = new TextEncoder().encode(texto), tamanho = bytes.length;
    const { error: e1 } = await db.storage.from('backups').upload(caminho, bytes, { contentType: 'application/json', upsert: true });
    if (e1) throw new Error('Não consegui gravar no Storage (bucket "backups"): ' + e1.message);
    const { error: e2 } = await db.from('backups_auto').insert({ origem, caminho, tamanho, resumo });
    if (e2) throw e2;
    // guarda só as 8 mais recentes
    const { data: antigos } = await db.from('backups_auto').select('id, caminho').order('criado_em', { ascending: false }).range(MANTER, 1000);
    if (antigos && antigos.length) {
      await db.storage.from('backups').remove(antigos.map((a) => a.caminho));
      await db.from('backups_auto').delete().in('id', antigos.map((a) => a.id));
    }
    return resposta({ ok: true, caminho, tamanho, tabelas: Object.keys(resumo).length, registros: Object.values(resumo).reduce((a, b) => a + b, 0), apagados: (antigos || []).length,
      mensagem: 'Backup feito: ' + Object.values(resumo).reduce((a, b) => a + b, 0) + ' registros de ' + Object.keys(resumo).length + ' tabelas (' + Math.round(tamanho / 1024) + ' KB)' });
  } catch (e) {
    return resposta({ erro: String((e && e.message) || e) }, 500);
  }
}

Deno.serve((req) => tratar(req,
  createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })));
