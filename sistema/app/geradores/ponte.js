'use strict';
// ═══════════════════════════════════════════════════════════════════
// Ponte dos geradores com o ERP (Backup 16). Entra em cada gerador
// (Contrato e Procuração, Solicitação de Documentos, Propostas, E-mails,
// Petição): exige login, puxa os dados do cliente do banco (nome, CPF/CNPJ,
// endereço, sócios, contato) e guarda o documento em Documentos, na pasta
// do cliente. Cada página diz o que preencher em window.GERADOR.
// ═══════════════════════════════════════════════════════════════════
(function () {
  const CFG = window.ERP_CONFIG || {};
  const G = window.GERADOR || {};
  const sb = window.supabase && CFG.url ? window.supabase.createClient(CFG.url, CFG.chave) : null;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dig = (s) => String(s || '').replace(/\D/g, '');
  const mascara = (d) => { d = dig(d); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : d; };
  const q = async (p) => { const { data, error } = await p; if (error) throw error; return data; };
  let clientes = [], atual = null;

  const css = document.createElement('style');
  css.textContent = '#ponte{position:sticky;top:0;z-index:9999;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 14px;background:#1B2A4A;color:#fff;font:600 13px Arial,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.2)}' +
    '#ponte a,#ponte button{font:inherit;border-radius:8px;padding:6px 12px;border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;cursor:pointer;text-decoration:none}' +
    '#ponte button.ponte-p{background:#C9A84C;color:#1B2A4A;border-color:#C9A84C}#ponte button:disabled{opacity:.6;cursor:wait}' +
    '#ponte input{font:inherit;font-weight:500;border-radius:8px;border:0;padding:7px 10px;min-width:260px;color:#1B2A4A}#ponte .ponte-msg{font-weight:500;opacity:.9}' +
    '#ponte-bloqueio{position:fixed;inset:0;z-index:10000;background:#EEF1F6;display:flex;align-items:center;justify-content:center;font:16px Arial,sans-serif;color:#1B2A4A;text-align:center}' +
    '@media print{#ponte{display:none!important}}';
  document.head.appendChild(css);

  function bloquear(msg) {
    const b = document.createElement('div'); b.id = 'ponte-bloqueio';
    b.innerHTML = '<div><p><b>' + esc(msg) + '</b></p><p><a href="../index.html">Entrar no ERP</a></p></div>';
    document.body.appendChild(b);
  }
  function msg(t, erro) { const m = document.getElementById('ponte-msg'); if (m) { m.textContent = t; m.style.color = erro ? '#FCA5A5' : '#fff'; } }

  // escreve no campo e avisa a página (as páginas redesenham no input/change)
  function por(id, v) {
    const el = document.getElementById(id); if (!el || v == null) return;
    if (el.isContentEditable) el.textContent = v; else el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function marcar(nome, valor) { const r = document.querySelector('input[name="' + nome + '"][value="' + valor + '"]'); if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); if (typeof r.onchange === 'function') r.onchange(); } }

  async function dadosDoCliente(c) {
    const [ends, socios, contatos] = await Promise.all([
      q(sb.from('enderecos').select('*').eq('cliente_id', c.id)).catch(() => []),
      q(sb.from('vinculos_societarios').select('*').eq('cliente_id', c.id)).catch(() => []),
      q(sb.from('contatos').select('*').eq('cliente_id', c.id)).catch(() => [])
    ]);
    const e = ends.find((x) => x.principal) || ends[0];
    const endereco = e ? [e.logradouro + (e.numero ? ', n. ' + e.numero : ''), e.complemento, e.bairro, (e.cidade || '') + (e.uf ? '/' + e.uf : ''), e.cep ? 'CEP ' + e.cep : ''].filter(Boolean).join(', ')
      : [c.endereco, (c.cidade || '') + (c.estado ? '/' + c.estado : ''), c.cep ? 'CEP ' + c.cep : ''].filter((x) => x && x !== '/').join(', ');
    const rep = socios.find((s) => /administr|represent/i.test(s.qualificacao || '')) || socios[0] || (c.socio_admin ? { nome: c.socio_admin } : null);
    const contatoFin = contatos.find((x) => x.recebe_boletos || x.finalidade === 'financeiro') || contatos[0] || {};
    const doc = dig(c.cpf_cnpj);
    return { id: c.id, grupo_id: c.grupo_id, nome: c.razao_social || c.nome, pj: doc.length === 14 || (!doc && /ltda|s\/a|eireli|me\b|epp/i.test(c.nome)), doc: mascara(doc), endereco,
      email: c.email || contatoFin.email || '', telefone: c.telefone || contatoFin.telefone || '', rep: rep ? rep.nome : '', repDoc: rep ? mascara(rep.cpf_cnpj) : '', socios };
  }

  async function iniciar() {
    if (!sb) return bloquear('ERP não configurado.');
    const { data } = await sb.auth.getSession();
    if (!data || !data.session) return bloquear('Entre no ERP para usar os geradores.');
    const perfil = (await q(sb.from('perfis').select('nome, papel').eq('id', data.session.user.id)).catch(() => []))[0];
    if (!perfil || !['admin', 'equipe'].includes(perfil.papel)) return bloquear('Sem acesso aos geradores.');
    // dados que não ficam no arquivo público (ex.: contas bancárias dos advogados)
    if (G.aoEntrar) { try { await G.aoEntrar(sb); } catch (e) { console.warn('[ponte]', e); } }
    clientes = await q(sb.from('clientes').select('id, nome, razao_social, cpf_cnpj, email, telefone, endereco, cidade, estado, cep, grupo_id, socio_admin').order('nome')).catch(() => []);
    const bar = document.createElement('div'); bar.id = 'ponte';
    bar.innerHTML = '<a href="../index.html" title="Voltar ao ERP">← ERP</a><span>' + esc(G.titulo || 'Gerador') + '</span>' +
      '<input id="ponte-cli" list="ponte-lista" placeholder="Cliente: digite para buscar…" autocomplete="off"><datalist id="ponte-lista">' + clientes.map((c) => '<option value="' + esc(c.nome) + '">').join('') + '</datalist>' +
      '<button type="button" id="ponte-preencher">Preencher com o cliente</button>' +
      (G.guardar ? '<button type="button" class="ponte-p" id="ponte-guardar">📁 Guardar em Documentos</button>' : '') +
      (G.enviarEmail ? '<button type="button" class="ponte-p" id="ponte-email">✉ Enviar pelo ERP</button>' : '') + '<span class="ponte-msg" id="ponte-msg"></span>';
    document.body.insertBefore(bar, document.body.firstChild);
    const cliUrl = new URLSearchParams(location.search).get('cliente');
    const escolher = async (c) => { atual = c ? await dadosDoCliente(c) : null; if (atual && G.preencher) { G.preencher(atual, { por, marcar }); msg('✓ Dados de ' + atual.nome + ' preenchidos.'); } };
    document.getElementById('ponte-preencher').onclick = async (ev) => {
      const nome = document.getElementById('ponte-cli').value.trim(), c = clientes.find((x) => x.nome === nome);
      if (!c) return msg('Escolha um cliente da lista.', true);
      ev.target.disabled = true; try { await escolher(c); } catch (e) { msg('Não consegui ler os dados: ' + (e.message || e), true); } ev.target.disabled = false;
    };
    if (cliUrl) { const c = clientes.find((x) => x.id === cliUrl); if (c) { document.getElementById('ponte-cli').value = c.nome; await escolher(c); } }
    const bg = document.getElementById('ponte-guardar');
    if (bg) bg.onclick = async () => {
      const nome = document.getElementById('ponte-cli').value.trim(), c = atual || (clientes.find((x) => x.nome === nome) ? await dadosDoCliente(clientes.find((x) => x.nome === nome)) : null);
      if (!c) return msg('Escolha o cliente antes de guardar.', true);
      const corpo = G.guardar(); if (!corpo) return msg('Nada para guardar ainda.', true);
      bg.disabled = true;
      try {
        const estilos = [...document.querySelectorAll('style')].filter((s) => s !== css).map((s) => s.outerHTML).join('');
        const titulo = (G.nomeArquivo ? G.nomeArquivo() : G.titulo) + ' — ' + c.nome;
        const html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + esc(titulo) + '</title>' + estilos + '</head><body>' + corpo + '</body></html>';
        const nomeArq = titulo.replace(/[\\/:*?"<>|]/g, '-').slice(0, 120) + '.html';
        const caminho = c.id + '/' + new Date().toISOString().slice(0, 7) + '/' + Date.now() + '-' + nomeArq.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
        const up = await sb.storage.from('documentos').upload(caminho, new Blob([html], { type: 'text/html' }), { contentType: 'text/html', upsert: false });
        if (up.error) throw up.error;
        await q(sb.from('documentos').insert({ nome: nomeArq, caminho, tamanho: html.length, mime: 'text/html', tipo: (typeof G.tipoDocumento === 'function' ? G.tipoDocumento() : G.tipoDocumento) || 'outro', cliente_id: c.id, grupo_id: c.grupo_id || null }));
        msg('✓ Guardado em Documentos de ' + c.nome + '.');
      } catch (e) { msg('Não consegui guardar: ' + (e.message || e), true); }
      bg.disabled = false;
    };
    const be = document.getElementById('ponte-email');
    if (be) be.onclick = async () => {
      const m = G.enviarEmail(), para = (atual && atual.email) || '';
      const dest = prompt('Enviar para qual e-mail?', para); if (!dest) return;
      be.disabled = true;
      try { await q(sb.rpc('enviar_email_manual', { p_para: dest.trim(), p_assunto: m.assunto, p_texto: m.texto })); msg('✓ E-mail na fila (sai em até 5 minutos).'); }
      catch (e) { msg('Não consegui enviar: ' + (e.message || e), true); }
      be.disabled = false;
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
