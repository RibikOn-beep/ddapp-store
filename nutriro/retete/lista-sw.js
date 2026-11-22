/* Lista de cumpărături NutriRO: copia de pe telefon (generat de genereaza_retete.py, nu se scrie de mână). */
var CACHE = 'nutriro-lista-4-8533089a2c';
var FISIERE = ["lista-de-cumparaturi.html", "lista-manifest.json", "lista-date.json?v=8533089a2c", "../assets/lista.js?v=4", "../assets/lista.css?v=4", "../assets/bara.css?v=2", "../assets/lista-192.png", "../assets/logo-buton.png", "../../logo.png", "../../favicon.png"];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(FISIERE.map(function (f) { return c.add(f).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (k) {
    return Promise.all(k.filter(function (n) { return n.indexOf('nutriro-lista-') === 0 && n !== CACHE; }).map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin && url.hostname.indexOf('fonts.') !== 0) return;
  e.respondWith(new Promise(function (gata) {
    var terminat = false;
    function dinCopie() {
      return caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then(function (r) {
        return r || caches.match(req, { ignoreSearch: true });
      });
    }
    var ceas = setTimeout(function () {
      dinCopie().then(function (r) { if (r && !terminat) { terminat = true; gata(r); } });
    }, 4000);
    fetch(req).then(function (r) {
      if (r && (r.ok || r.type === 'opaque')) {
        var copie = r.clone();
        // pagina listei se ține o singură dată, fără „?l=…” (altfel fiecare link primit ar lăsa o copie)
        caches.open(CACHE).then(function (c) { c.put(req.mode === 'navigate' ? url.origin + url.pathname : req, copie); });
      }
      clearTimeout(ceas);
      if (!terminat) { terminat = true; gata(r); }
    }).catch(function () {
      clearTimeout(ceas);
      dinCopie().then(function (r) { if (!terminat) { terminat = true; gata(r || Response.error()); } });
    });
  }));
});
