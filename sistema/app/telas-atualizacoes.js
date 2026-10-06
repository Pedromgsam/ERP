'use strict';
// ═══════════════════════════════════════════════════════════════════
// Atualizações (Backup 46) — o que mudou em cada versão, da mais nova
// para a mais antiga (padrão ROMPEX). Os dados vêm de backups/LEIA-ME.md,
// copiados pelo montar-erp.js para window.ATUALIZACOES (atualizacoes-dados.js).
// ═══════════════════════════════════════════════════════════════════
let _atuTodas = false, _atuBusca = '';
TELAS.atualizacoes = async function () {
  const lista = (window.ATUALIZACOES || []).slice().sort((a, b) => b.n - a.n);
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Atualizações</h1><div class="sub">O que mudou em cada versão do sistema. A mais nova fica em cima.</div></div>' +
      '<div class="acoes"><input class="busca" id="atu-busca" placeholder="Procurar nas atualizações…" autocomplete="off" value="' + esc(_atuBusca) + '"></div></div>' +
    '<div class="card"><div class="card-bd"><ol class="atu-linha" id="atu-lista"></ol>' +
      '<div class="atu-mais" id="atu-mais-box"><button type="button" class="btn btn-o" id="atu-mais"></button></div></div></div>';
  const pintar = () => {
    const b = normalizar(_atuBusca.trim());
    const achados = b ? lista.filter((v) => normalizar('backup ' + v.n + ' ' + v.itens.join(' ')).includes(b)) : lista;
    const ver = b || _atuTodas ? achados : achados.slice(0, 8);
    $('atu-lista').innerHTML = ver.length ? ver.map((v, i) =>
      '<li class="atu-v' + (v.n === (lista[0] || {}).n ? ' atu-nova' : '') + '" data-atu="' + v.n + '">' +
        '<div class="atu-marca"><span class="atu-num">Backup ' + v.n + '</span>' + (v.data ? '<span class="atu-data">' + dataBR(v.data) + '</span>' : '') +
          (v.n === (lista[0] || {}).n ? '<span class="pill ok">Versão atual</span>' : '') + '</div>' +
        '<ul class="atu-itens">' + v.itens.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul></li>').join('')
      : '<li class="sub">Nada encontrado para "' + esc(_atuBusca) + '".</li>';
    const resto = achados.length - ver.length;
    $('atu-mais-box').hidden = !!b || (!_atuTodas && resto <= 0) || lista.length <= 8;
    $('atu-mais').textContent = _atuTodas ? 'Mostrar só as 8 mais recentes' : 'Ver as ' + resto + ' versões anteriores';
  };
  $('atu-busca').oninput = (ev) => { _atuBusca = ev.target.value; pintar(); };
  $('atu-mais').onclick = () => { _atuTodas = !_atuTodas; pintar(); };
  pintar();
};
