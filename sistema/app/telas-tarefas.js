'use strict';
// ═══════════════════════════════════════════════════════════════════
// Tarefas — mesmo padrão visual das outras telas (filtros, tabela, janela).
// ═══════════════════════════════════════════════════════════════════
const PRIORIDADE = { alta: ['Alta', 'vencido'], media: ['Média', 'hoje'], baixa: ['Baixa', 'pago'] };
const STATUS_TAREFA = { pendente: 'Pendente', andamento: 'Em andamento', aguardando: 'Aguardando', concluida: 'Concluída', cancelada: 'Cancelada' };
const tarefaFechada = (t) => t.status === 'concluida' || t.status === 'cancelada';

TELAS.tarefas = async function () {
  E.tf = E.tf || { situacao: 'abertas', prazo: '', resp: '', pri: '', busca: '' };
  const F = E.tf;
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Tarefas</h1><p>Prazos do escritório · ✓ conclui, Editar abre a tarefa</p></div>' +
    '<div class="acoes"><button class="btn btn-p" id="tf-nova">+ Nova tarefa</button></div></div>' +
    '<div class="filtros">' +
    '<div class="segmento" id="tf-sit">' + [['abertas', 'Abertas'], ['concluidas', 'Concluídas'], ['', 'Todas']].map(([v, r]) =>
      '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<select class="busca sel" id="tf-prazo"><option value="">Qualquer prazo</option><option value="atrasadas">Atrasadas</option><option value="hoje">Até hoje</option>' +
    '<option value="7">Próximos 7 dias</option><option value="30">Próximos 30 dias</option></select>' +
    '<select class="busca sel" id="tf-resp"><option value="">Todas as pessoas</option>' + Object.keys(PESSOA).map((p) => '<option>' + p + '</option>').join('') + '</select>' +
    '<select class="busca sel" id="tf-pri"><option value="">Todas as prioridades</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select>' +
    '<input class="busca" id="tf-busca" placeholder="Buscar tarefa ou processo" autocomplete="off">' +
    '</div><div id="tf-corpo"><div class="carregando">Carregando…</div></div>';
  $('tf-nova').onclick = () => formTarefa({}, () => TELAS.tarefas());
  $('tf-sit').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.situacao = b.dataset.v; pintarTarefas(); } };
  [['tf-prazo', 'prazo'], ['tf-resp', 'resp'], ['tf-pri', 'pri']].forEach(([id, k]) => { $(id).value = F[k]; $(id).onchange = (ev) => { F[k] = ev.target.value; pintarTarefas(); }; });
  $('tf-busca').value = F.busca;
  let t; $('tf-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; pintarTarefas(); }, 250); };
  E._tarefas = await buscarTodos(() => sb.from('tarefas').select('*').order('prazo', { nullsFirst: false }));
  pintarTarefas();
};

function pintarTarefas() {
  const F = E.tf, h = hojeISO();
  document.querySelectorAll('#tf-sit button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === F.situacao));
  const b = normalizar(F.busca);
  const lista = (E._tarefas || []).filter((t) => (!F.situacao || (F.situacao === 'abertas' ? !tarefaFechada(t) : tarefaFechada(t)))
    && (!F.resp || t.responsavel === F.resp) && (!F.pri || t.prioridade === F.pri)
    && (!F.prazo || (t.prazo && (F.prazo === 'atrasadas' ? t.prazo < h : F.prazo === 'hoje' ? t.prazo <= h : t.prazo >= h && t.prazo <= somarDias(h, Number(F.prazo)))))
    && (!b || normalizar(t.titulo + ' ' + t.processos_vinculados + ' ' + nomeGrupo(t.grupo_id)).includes(b)));
  const atrasadas = (E._tarefas || []).filter((t) => !tarefaFechada(t) && t.prazo && t.prazo < h).length;
  $('tf-corpo').innerHTML =
    '<div class="kpis">' + kpi('Tarefas listadas', String(lista.length), '', 'com os filtros acima') +
    kpi('Atrasadas', String(atrasadas), 'vermelho', 'em aberto, todas as pessoas') + '</div>' +
    '<div class="card">' + (lista.length ? '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th data-tipo="data">Prazo</th><th>Tarefa</th><th>Grupo</th><th>Pessoa</th><th>Prioridade</th><th>Status</th><th class="sem-ordem"></th></tr></thead><tbody>' +
      lista.map((t) => {
        const atr = t.prazo && t.prazo < h && !tarefaFechada(t);
        const pr = PRIORIDADE[t.prioridade] || [t.prioridade || '—', 'neutro'];
        return '<tr><td class="mono" data-ord="' + esc(t.prazo || '') + '">' + dataBR(t.prazo) + (atr ? ' <span class="pill vencido">atrasada</span>' : '') + '</td>' +
          '<td><b>' + esc(t.titulo) + '</b>' + (t.processos_vinculados ? '<div class="sub">' + esc(t.processos_vinculados) + '</div>' : '') + '</td>' +
          '<td>' + esc(nomeGrupo(t.grupo_id) || '—') + '</td><td>' + pillPessoa(t.responsavel) + '</td>' +
          '<td><span class="pill ' + pr[1] + '">' + esc(pr[0]) + '</span></td><td>' + esc(STATUS_TAREFA[t.status] || t.status) + '</td>' +
          '<td class="acoes-l">' + (tarefaFechada(t) ? '' : '<button class="btn btn-v btn-mini" data-concluir="' + t.id + '">✓ Concluir</button> ') +
          '<button class="btn btn-o btn-mini" data-editar-t="' + t.id + '">Editar</button></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="vazio">Nenhuma tarefa com esses filtros.</div>') + '</div>';
  $('tf-corpo').querySelectorAll('[data-concluir]').forEach((bt) => bt.onclick = () => comBotao(bt, async () => {
    await q(sb.from('tarefas').update({ status: 'concluida' }).eq('id', bt.dataset.concluir));
    aviso('✓ Tarefa concluída.'); await TELAS.tarefas();
  }));
  $('tf-corpo').querySelectorAll('[data-editar-t]').forEach((bt) => bt.onclick = () =>
    formTarefa(E._tarefas.find((t) => t.id === bt.dataset.editarT), () => TELAS.tarefas()));
}

function selectPares(nome, pares, v) {
  return '<select name="' + nome + '">' + pares.map(([val, rot]) => '<option value="' + val + '"' + (val === v ? ' selected' : '') + '>' + esc(rot) + '</option>').join('') + '</select>';
}
function formTarefa(t, depois) {
  const novo = !t.id;
  const j = abrirJanela({ titulo: novo ? 'Nova tarefa' : 'Editar tarefa', larga: true,
    corpo: '<form id="f-tf" class="grade">' +
      campo('Tarefa <span class="obrig">*</span>', '<input name="titulo" maxlength="300" value="' + esc(t.titulo || '') + '">', 'inteiro') +
      campo('Grupo', '<input name="grupo" list="tf-grupos" value="' + esc(nomeGrupo(t.grupo_id)) + '">' + datalistGrupos('tf-grupos')) +
      campo('Pessoa responsável', '<input name="responsavel" list="tf-pessoas" value="' + esc(t.responsavel || '') + '">' + datalistPessoas('tf-pessoas')) +
      campo('Prazo', '<input name="prazo" type="date" value="' + esc(t.prazo || '') + '">') +
      campo('Início', '<input name="inicio" type="date" value="' + esc(t.inicio || (novo ? hojeISO() : '')) + '">') +
      campo('Prioridade', selectPares('prioridade', [['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']], t.prioridade || 'media')) +
      campo('Status', selectPares('status', Object.entries(STATUS_TAREFA), t.status || 'pendente')) +
      campo('Processos vinculados', '<input name="processos_vinculados" value="' + esc(t.processos_vinculados || '') + '">', 'inteiro') +
      campo('Observação', '<textarea name="obs" maxlength="2000">' + esc(t.obs || '') + '</textarea>', 'inteiro') +
      '</form>',
    rodape: (novo ? '<span></span>' : '<button class="btn btn-x" type="button" id="btn-excluir-tf">Excluir</button>') +
      '<div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-salvar-tf">Salvar</button></div>' });
  const f = j.querySelector('#f-tf');
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  f.onsubmit = (ev) => { ev.preventDefault(); j.querySelector('#btn-salvar-tf').click(); };
  j.querySelector('#btn-salvar-tf').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.titulo.value.trim()) throw new Error('Escreva a tarefa.');
    const dados = { titulo: f.titulo.value.trim(), grupo_id: await grupoPorNome(f.grupo.value), responsavel: f.responsavel.value.trim(),
      prazo: f.prazo.value || null, inicio: f.inicio.value || null, prioridade: f.prioridade.value, status: f.status.value,
      processos_vinculados: f.processos_vinculados.value.trim(), obs: f.obs.value.trim() };
    if (novo) await q(sb.from('tarefas').insert(dados)); else await q(sb.from('tarefas').update(dados).eq('id', t.id));
    aviso(novo ? '✓ Tarefa criada.' : '✓ Tarefa atualizada.'); fecharJanela(j); await (depois || recarregar)();
  });
  const bx = j.querySelector('#btn-excluir-tf');
  if (bx) bx.onclick = () => comBotao(bx, async () => {
    if (!confirm('Excluir esta tarefa?')) return;
    await excluir('tarefas', t.id);
    aviso('Tarefa excluída.'); fecharJanela(j); await (depois || recarregar)();
  });
}
