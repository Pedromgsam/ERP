// Backup 85 (JN3): as confirmações viraram janelas do próprio sistema (confirmarB). Nos testes, "aceitar o confirm" passa a ser
// clicar em "Confirmar" dessa janela — o equivalente ao p.on('dialog', d => d.accept()) de antes. window.__semAutoConfirmar = true desliga.
module.exports = async function confirmarAuto(p) {
  await p.addInitScript(() => {
    const olhar = () => { if (window.__semAutoConfirmar) return; const b = document.querySelector('.janela-conf [data-cf-sim]'); if (b && !b._auto) { b._auto = true; setTimeout(() => b.click(), 30); } };
    new MutationObserver(olhar).observe(document, { childList: true, subtree: true });
  });
};
