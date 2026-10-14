/* Backup 77 — seletor de DESIGN do ambiente de teste (Atual · A Nítido · B Claro · C Executivo) e o modo ENXUTO.
   Nada aqui muda dados nem telas: troca o atributo html[data-design] (cores e medidas em designs.css) e,
   com "Enxuto" ligado, esconde o que pesa pouco (o detalhe continua ao clicar). */
(function(){
  var DESIGNS = [['', 'Atual'], ['nitido', 'A · Nítido'], ['claro', 'B · Claro'], ['exec', 'C · Executivo']];
  var raiz = document.documentElement;
  function ler(k, padrao){ try { var v = localStorage.getItem(k); return v === null ? padrao : v; } catch (e) { return padrao; } }
  function gravar(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }

  function aplicar(d){
    if (d) raiz.setAttribute('data-design', d); else raiz.removeAttribute('data-design');
    document.querySelectorAll('.ds-seg button').forEach(function(b){ b.setAttribute('aria-pressed', b.dataset.d === d); });
  }
  function enxuto(on){ raiz.classList.toggle('enxuto', on); var c = document.getElementById('ds-enx'); if (c) c.checked = on; if (on) resumir(); }
  window.APP_DESIGN = { aplicar: aplicar, enxuto: enxuto };

  /* ── o que o "Enxuto" resume (sempre pelo texto do rótulo, para valer em toda tela que usa as peças) ── */
  var FORA_CG = { 'Parcela do mês': 1 };   // "A pagar este mês" já diz o que importa no mês
  function resumir(){
    var corpo = document.getElementById('corpo'); if (!corpo) return;
    // 1) cartões de grupo: "Pagas 84 de 204" vira a legenda da barra; "Parcela do mês" sai
    corpo.querySelectorAll('.cg').forEach(function(cg){
      if (cg.dataset.enx) return; cg.dataset.enx = '1';
      cg.querySelectorAll('.cg-lin').forEach(function(l){
        var rot = (l.querySelector('span') || {}).textContent || '', val = (l.querySelector('b') || {}).textContent || '';
        if (rot === 'Pagas' || rot === 'Pagos'){ l.classList.add('enx-fora');
          var barra = cg.querySelector('.barra'); if (barra){ var s = document.createElement('small'); s.className = 'cg-prog enx-so'; s.textContent = val + ' pagas'; barra.after(s); } }
        if (FORA_CG[rot]) l.classList.add('enx-fora');
      });
    });
    // 2) Painel: RFB, PGFN e AGE/MG viram uma linha embaixo do "Passivo total"
    corpo.querySelectorAll('.nums').forEach(function(n){
      if (n.dataset.enx) return; var its = [].slice.call(n.querySelectorAll('.num-it')); if (its.length < 6) return; n.dataset.enx = '1';
      var orgaos = [];
      its.forEach(function(it){ var rot = ((it.querySelector('span') || {}).textContent || '').trim();
        if (/^(RFB|PGFN|AGE\/MG)$/.test(rot)){ orgaos.push(rot + ' ' + ((it.querySelector('b') || {}).textContent || '').replace('R$ ', '')); it.classList.add('enx-fora'); } });
      if (orgaos.length){ var s = document.createElement('small'); s.className = 'num-org enx-so'; s.textContent = orgaos.join(' · '); its[0].appendChild(s); }
    });
    // 3) frases de instrução ("Clique no grupo…", "Clique na empresa…") saem: a mão no mouse já mostra que abre
    corpo.querySelectorAll('.sec-cab p, .quadro-hd small').forEach(function(p){ if (/^\s*Clique /.test(p.textContent)) p.classList.add('enx-fora'); });
  }
  var pend = false;
  function agendar(){ if (pend || !raiz.classList.contains('enxuto')) return; pend = true; requestAnimationFrame(function(){ pend = false; resumir(); }); }

  function montar(){
    var fx = document.querySelector('.faixa-teste'); if (!fx || document.querySelector('.ds')) return;
    var d = document.createElement('div'); d.className = 'ds';
    d.innerHTML = '<span class="ds-rot">Design:</span><span class="ds-seg" role="group" aria-label="Design">' +
      DESIGNS.map(function(x){ return '<button type="button" data-d="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</span>' +
      '<label class="ds-enx" title="Resume o que pesa pouco nas telas (o detalhe continua ao clicar)"><input type="checkbox" id="ds-enx"> Enxuto</label>';
    fx.appendChild(d);
    d.querySelector('.ds-seg').onclick = function(e){ var b = e.target.closest('button'); if (!b) return; aplicar(b.dataset.d); gravar('amb_design', b.dataset.d); };
    document.getElementById('ds-enx').onchange = function(e){ enxuto(e.target.checked); gravar('amb_enxuto', e.target.checked ? '1' : '0'); };
    aplicar(ler('amb_design', 'nitido'));
    enxuto(ler('amb_enxuto', '1') === '1');
    var corpo = document.getElementById('corpo'); if (corpo) new MutationObserver(agendar).observe(corpo, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})();
