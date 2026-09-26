// Endereço e chave pública do projeto no Supabase.
// A chave "anon/publishable" é feita para ficar no navegador: sem login
// liberado ela não lê nada (as regras de acesso ficam no banco).
// NUNCA coloque aqui a chave "service_role" / "secret".
window.ERP_CONFIG = {
  url:   'COLE_AQUI_A_PROJECT_URL',
  chave: 'COLE_AQUI_A_CHAVE_ANON'
};
