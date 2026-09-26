/* ============================================================
   MANUAL DO ESCRITÓRIO — ARAUJO & CASTRO
   script.js — Navegação, relógio, busca
   ============================================================ */

/* Relógio */
function tick() {
  var el = document.getElementById('data-hora') || document.querySelector('#header-info');
  if (!el) return;
  var agora = new Date();
  var d = agora.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
  var h = agora.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
  el.textContent = d + ' · ' + h;
}
tick();
setInterval(tick, 30000);

/* Acordeão do menu */
document.querySelectorAll('.menu-item[data-toggle]').forEach(function(item) {
  item.addEventListener('click', function() {
    var alvo = document.getElementById(this.dataset.toggle);
    if (!alvo) return;
    var aberto = alvo.classList.contains('aberto');
    document.querySelectorAll('.submenu.aberto').forEach(function(s) { s.classList.remove('aberto'); });
    document.querySelectorAll('.menu-item.aberto').forEach(function(m) { m.classList.remove('aberto'); });
    if (!aberto) { alvo.classList.add('aberto'); this.classList.add('aberto'); }
  });
});

/* Marca item ativo */
(function() {
  var pg = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.menu-item[href], .submenu-item[href]').forEach(function(el) {
    var href = el.getAttribute('href') || '';
    if (href.split('/').pop() === pg) {
      el.classList.add('ativo');
      var sub = el.closest('.submenu');
      if (sub) {
        sub.classList.add('aberto');
        var pai = document.querySelector('[data-toggle="' + sub.id + '"]');
        if (pai) pai.classList.add('aberto');
      }
    }
  });
})();

/* Busca rápida */
var busca = document.getElementById('campo-busca');
if (busca) {
  busca.addEventListener('input', function() {
    var t = this.value.toLowerCase().trim();
    document.querySelectorAll('.card, .lista-item').forEach(function(el) {
      el.style.display = (!t || el.textContent.toLowerCase().includes(t)) ? '' : 'none';
    });
    if (!t) return;
    document.querySelectorAll('.submenu-item').forEach(function(el) {
      if (el.textContent.toLowerCase().includes(t)) {
        var sub = el.closest('.submenu');
        if (sub) { sub.classList.add('aberto'); }
      }
    });
  });
}

/* Fade ao carregar */
document.addEventListener('DOMContentLoaded', function() {
  var p = document.getElementById('pagina');
  if (!p) return;
  p.style.opacity = '0';
  p.style.transition = 'opacity 0.25s ease';
  setTimeout(function() { p.style.opacity = '1'; }, 40);
});
