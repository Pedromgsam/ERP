/* F7: service worker mínimo — guarda a "casca" do sistema para abrir rápido e funcionar como aplicativo instalado.
   Os dados sempre vêm da rede (nunca do cache), para ninguém ver informação velha. */
var CASCA = 'erp-casca-v1';
var ARQUIVOS = ['./', 'index.html', 'app.css', 'dados.js', 'pecas.js', 'negocio.js', 'telas-1.js', 'telas-2.js', 'icone.svg', 'manifest.webmanifest'];
self.addEventListener('install', function(e){ e.waitUntil(caches.open(CASCA).then(function(c){ return c.addAll(ARQUIVOS); }).then(function(){ return self.skipWaiting(); })); });
self.addEventListener('activate', function(e){ e.waitUntil(caches.keys().then(function(l){ return Promise.all(l.filter(function(k){ return k !== CASCA; }).map(function(k){ return caches.delete(k); })); }).then(function(){ return self.clients.claim(); })); });
self.addEventListener('fetch', function(e){
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // Supabase e outros: direto na rede
  // rede primeiro; sem internet, usa a cópia guardada
  e.respondWith(fetch(e.request).then(function(r){ var c = r.clone(); caches.open(CASCA).then(function(k){ k.put(e.request, c); }); return r; }).catch(function(){ return caches.match(e.request); }));
});
