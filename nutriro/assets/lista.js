/* Lista de cumpărături NutriRO (aprobat Dorel, 17 nov 2026).
   Ce rețete a ales vizitatorul stă în browserul lui (localStorage, cheia „nutriro-lista”), fără cont și fără server:
     { v: 1, r: [[id rețetă, porții], …], x: [produse adăugate de mână], s: [produse scoase], b: [produse bifate] }
   Ingredientele vin din retete/lista-date.json (generat de _unelte/genereaza_retete.py, cu numele generice) și se adună
   după numele de pe listă. Lista se ia cu tine: scurtătură pe ecranul telefonului (manifest + service worker),
   text pentru WhatsApp / Keep, link care deschide aceeași listă (și cod QR pe calculator). */
(function () {
  var rad = document.querySelector('[data-lc]');
  if (!rad) return;
  var CHEIE = 'nutriro-lista';
  var $ = function (s) { return document.querySelector(s); };
  var D = null, st = citeste(), primita = null;
  var ADAUGATE = 'Adăugate de tine';

  // ── starea din browser ───────────────────────────────────────────────────────────────────
  function lista(x) { return Array.isArray(x) ? x.filter(function (s) { return typeof s === 'string'; }) : []; }
  function curata(o) {
    o = o || {};
    var r = Array.isArray(o.r) ? o.r.filter(function (e) {
      return Array.isArray(e) && typeof e[0] === 'string' && e[0].length < 60 && e[1] >= 1;
    }).map(function (e) { return [e[0], Math.min(60, Math.max(1, Math.round(+e[1])))]; }) : [];
    return { v: 1, r: r, x: lista(o.x), s: lista(o.s), b: lista(o.b) };
  }
  function citeste() {
    try { return curata(JSON.parse(localStorage.getItem(CHEIE) || 'null')); } catch (e) { return curata(null); }
  }
  function salveaza() {
    try { localStorage.setItem(CHEIE, JSON.stringify(st)); } catch (e) { /* fără spațiu sau mod privat: lista rămâne doar pe pagină */ }
    try { window.dispatchEvent(new Event('nutriro-lista')); } catch (e) {}
    arata();
  }
  window.addEventListener('storage', function (e) { if (e.key === CHEIE) { st = citeste(); arata(); } });

  // ── calculul listei ──────────────────────────────────────────────────────────────────────
  function sus(q, pas) { return Math.ceil(q / pas - 1e-9) * pas; }
  function virgula(n) { return String(Math.round(n * 100) / 100).replace('.', ','); }
  function cantitate(q, u) {
    if (u === 'buc') return Math.max(1, Math.ceil(q - 0.1)) + ' buc';
    var r = q < 10 ? sus(q, 1) : q < 100 ? sus(q, 5) : q < 250 ? sus(q, 10) : q < 1000 ? sus(q, 50) : sus(q, 100);
    if (r >= 1000) return virgula(r / 1000) + (u === 'ml' ? ' l' : ' kg');
    return r + ' ' + u;
  }
  function produse() {
    var rows = {}, ordine = [];
    st.r.forEach(function (e) {
      var rec = D.r[e[0]];
      if (!rec) return;
      var f = e[1] / (rec.p || 1);
      rec.i.forEach(function (it) {
        var g = D.g[it[0]];
        if (!g) return;
        var row = rows[g[0]];
        if (!row) { row = rows[g[0]] = { n: g[0], ra: D.raioane[g[1]], q: {}, din: [] }; ordine.push(row); }
        row.q[it[2]] = (row.q[it[2]] || 0) + it[1] * f;
        if (row.din.indexOf(rec.t) < 0) row.din.push(rec.t);
      });
    });
    st.x.forEach(function (n) {
      if (!rows[n]) { rows[n] = { n: n, ra: ADAUGATE, q: {}, din: [], mana: true }; ordine.push(rows[n]); }
    });
    return ordine.filter(function (r) { return st.s.indexOf(r.n) < 0; });
  }
  function grupe(toate) {
    var raioane = [ADAUGATE].concat(D.raioane), g = {};
    toate.forEach(function (r) { (g[r.ra] = g[r.ra] || []).push(r); });
    return raioane.filter(function (ra) { return g[ra]; }).map(function (ra) {
      return { ra: ra, p: g[ra].sort(function (a, b) { return a.n.localeCompare(b.n, 'ro'); }) };
    });
  }
  function textCantitate(r) {
    return Object.keys(r.q).map(function (u) { return cantitate(r.q[u], u); }).join(' + ');
  }

  // ── afișarea ─────────────────────────────────────────────────────────────────────────────
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function porti(n) { return n === 1 ? '1 porție' : n + (n % 100 >= 20 || n % 100 === 0 ? ' de porții' : ' porții'); }

  function randProdus(r, acasa) {
    var li = el('li'), lab = el('label'), cb = el('input');
    cb.type = 'checkbox';
    cb.checked = st.b.indexOf(r.n) >= 0;
    cb.addEventListener('change', function () {
      st.b = st.b.filter(function (n) { return n !== r.n; });
      if (cb.checked) st.b.push(r.n);
      salveaza();
    });
    var n = el('span', 'n', r.n);
    if (r.din.length && !acasa && st.r.length > 1) n.appendChild(el('small', null, r.din.join(', ')));
    lab.appendChild(cb);
    lab.appendChild(n);
    if (!acasa && !r.mana) lab.appendChild(el('span', 'q', textCantitate(r)));
    li.appendChild(lab);
    var x = el('button', 'lc-x', '×');
    x.type = 'button';
    x.setAttribute('aria-label', 'Scoate ' + r.n + ' de pe listă');
    x.addEventListener('click', function () {
      if (r.mana) st.x = st.x.filter(function (k) { return k !== r.n; });
      else st.s.push(r.n);
      st.b = st.b.filter(function (k) { return k !== r.n; });
      salveaza();
    });
    li.appendChild(x);
    return li;
  }

  function arataRetete() {
    var ul = $('[data-lc-retete]');
    ul.innerHTML = '';
    st.r.forEach(function (e, i) {
      var rec = D.r[e[0]], li = el('li');
      var t = el(rec ? 'a' : 'span', 't', rec ? rec.t : 'O rețetă care nu mai e pe site');
      if (rec) t.href = rec.s + '.html';
      else t.appendChild(el('small', null, 'Scoate-o din listă.'));
      li.appendChild(t);
      if (rec) {
        var pas = el('div', 'lc-pas'), minus = el('button', null, '−'), plus = el('button', null, '+');
        minus.type = plus.type = 'button';
        minus.setAttribute('aria-label', 'O porție mai puțin');
        plus.setAttribute('aria-label', 'O porție în plus');
        minus.addEventListener('click', function () { if (e[1] > 1) { e[1]--; salveaza(); } });
        plus.addEventListener('click', function () { if (e[1] < 60) { e[1]++; salveaza(); } });
        pas.appendChild(minus);
        pas.appendChild(el('b', null, porti(e[1])));
        pas.appendChild(plus);
        li.appendChild(pas);
      }
      var x = el('button', 'lc-x', '×');
      x.type = 'button';
      x.setAttribute('aria-label', 'Scoate rețeta din listă');
      x.addEventListener('click', function () { st.r.splice(i, 1); salveaza(); });
      li.appendChild(x);
      ul.appendChild(li);
    });
  }

  function arata() {
    if (!D) return;
    $('[data-lc-asteapta]').hidden = true;
    var gol = !st.r.length && !st.x.length;
    $('[data-lc-gol]').hidden = !gol;
    $('[data-lc-plin]').hidden = gol;
    $('[data-lc-sub]').textContent = gol ? 'Ingredientele rețetelor alese, adunate pe raioane.'
      : (st.r.length === 1 ? 'Ingredientele unei rețete' : 'Ingredientele a ' + st.r.length + ' rețete') + ', adunate pe raioane.';
    if (gol) { qr(); return; }
    arataRetete();

    var toate = produse(), acasa = [], deCump = [];
    toate.forEach(function (r) { (r.ra === D.acasa ? acasa : deCump).push(r); });
    var box = $('[data-lc-lista]');
    box.innerHTML = '';
    grupe(deCump).forEach(function (g) {
      box.appendChild(el('h3', 'lc-raion', g.ra));
      var ul = el('ul', 'lc-prod');
      g.p.forEach(function (r) { ul.appendChild(randProdus(r, false)); });
      box.appendChild(ul);
    });
    var bifate = deCump.filter(function (r) { return st.b.indexOf(r.n) >= 0; }).length;
    $('[data-lc-progres]').textContent = deCump.length ? bifate + ' din ' + deCump.length + ' bifate' : '';

    $('[data-lc-acasa-box]').hidden = !acasa.length;
    var ac = $('[data-lc-acasa]');
    ac.innerHTML = '';
    if (acasa.length) {
      var ul = el('ul', 'lc-prod lc-acasa-l');
      acasa.sort(function (a, b) { return a.n.localeCompare(b.n, 'ro'); }).forEach(function (r) { ul.appendChild(randProdus(r, true)); });
      ac.appendChild(ul);
    }

    var sterse = $('[data-lc-sterse]');
    var nrS = st.s.length;
    sterse.hidden = !nrS;
    sterse.innerHTML = '';
    if (nrS) {
      sterse.appendChild(document.createTextNode(nrS === 1 ? 'Ai scos un produs de pe listă. ' : 'Ai scos ' + nrS + ' produse de pe listă. '));
      var inapoi = el('button', null, nrS === 1 ? 'Pune-l înapoi' : 'Pune-le înapoi');
      inapoi.type = 'button';
      inapoi.addEventListener('click', function () { st.s = []; salveaza(); });
      sterse.appendChild(inapoi);
    }
    qr();
  }

  // ── textul și linkul ─────────────────────────────────────────────────────────────────────
  function linkLista() {
    var o = { r: st.r };
    if (st.x.length) o.x = st.x;
    if (st.s.length) o.s = st.s;
    var b = btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return location.origin + location.pathname + '#l=' + b;
  }
  function citesteLink() {
    var m = /[#&]l=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (!m) return null;
    try {
      var b = m[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      var o = curata(JSON.parse(decodeURIComponent(escape(atob(b)))));
      o.b = [];
      return o.r.length || o.x.length ? o : null;
    } catch (e) { return null; }
  }
  function text(cuLink) {
    var toate = produse(), linii = ['Lista de cumpărături'];
    var ret = st.r.filter(function (e) { return D.r[e[0]]; }).map(function (e) { return D.r[e[0]].t + ' (' + porti(e[1]) + ')'; });
    if (ret.length) linii.push('Pentru: ' + ret.join('; '));
    var deCump = toate.filter(function (r) { return r.ra !== D.acasa && st.b.indexOf(r.n) < 0; });
    grupe(deCump).forEach(function (g) {
      linii.push('', g.ra + ':');
      g.p.forEach(function (r) { var q = r.mana ? '' : textCantitate(r); linii.push('☐ ' + r.n + (q ? ' – ' + q : '')); });
    });
    var acasa = toate.filter(function (r) { return r.ra === D.acasa && st.b.indexOf(r.n) < 0; })
      .map(function (r) { return r.n.charAt(0).toLowerCase() + r.n.slice(1); }).sort(function (a, b) { return a.localeCompare(b, 'ro'); });
    if (acasa.length) linii.push('', 'Verifică acasă: ' + acasa.join(', ') + '.');
    if (cuLink !== false) linii.push('', 'Lista cu bife: ' + linkLista());
    return linii.join('\n');
  }
  function mesaj(t) {
    var m = $('[data-lc-mesaj]');
    m.textContent = t;
    clearTimeout(mesaj.ceas);
    mesaj.ceas = setTimeout(function () { m.textContent = ''; }, 6000);
  }
  function copiaza(t, gata) {
    function vechi() {
      var ta = el('textarea');
      ta.value = t;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      mesaj(ok ? gata : 'Nu am putut copia. Ține apăsat pe text și alege „Copiază”.');
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(function () { mesaj(gata); }, vechi);
    else vechi();
  }
  function trimite(date, rezerva) {
    if (navigator.share) {
      navigator.share(date).catch(function (e) { if (e && e.name !== 'AbortError') rezerva(); });
    } else rezerva();
  }
  // Pe calculator (cerere Dorel, 17 nov 2026): în locul meniului de partajare al Windows (care arată doar aplicațiile
  // instalate: Outlook, OneNote…), un rând de butoane proprii. Messenger și Instagram nu primesc text de la un site,
  // deci lista se copiază și se deschide pagina lor, unde omul alege persoana și lipește (Ctrl+V).
  var peCalculator = window.matchMedia('(pointer: fine) and (min-width: 760px)').matches;
  var canale = null, deTrimis = null;
  function copiazaAcum(t) {
    var ta = el('textarea');
    ta.value = t;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    if (!ok && navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(t).catch(function () {}); ok = true; }
    return ok;
  }
  function deschide(u) { window.open(u, '_blank', 'noopener'); }
  function arataCanale(cum) {
    deTrimis = cum;
    if (!canale) {
      canale = el('div', 'lc-canale');
      canale.appendChild(el('p', 'lc-canale-t'));
      var rand = el('div', 'lc-canale-b');
      [['WhatsApp', function (d) { deschide('https://wa.me/?text=' + encodeURIComponent(d.tot)); }],
       ['Telegram', function (d) { deschide('https://t.me/share/url?url=' + encodeURIComponent(d.link) + '&text=' + encodeURIComponent(d.fara)); }],
       ['E-mail', function (d) { location.href = 'mailto:?subject=' + encodeURIComponent('Lista de cumpărături') + '&body=' + encodeURIComponent(d.tot); }],
       ['Messenger', function (d) {
         var ok = copiazaAcum(d.tot);
         deschide('https://www.messenger.com/');
         mesaj(ok ? 'Am copiat lista. În Messenger alege persoana și lipește cu Ctrl+V.' : 'Nu am putut copia. Folosește „Copiază textul”.');
       }],
       ['Instagram', function (d) {
         var ok = copiazaAcum(d.tot);
         deschide('https://www.instagram.com/direct/inbox/');
         mesaj(ok ? 'Am copiat lista. În Instagram alege persoana și lipește cu Ctrl+V.' : 'Nu am putut copia. Folosește „Copiază textul”.');
       }]].forEach(function (c) {
        var b = el('button', 'lc-canal', c[0]);
        b.type = 'button';
        b.addEventListener('click', function () { c[1](deTrimis()); });
        rand.appendChild(b);
      });
      canale.appendChild(rand);
      $('.lc-actiuni').appendChild(canale);
    }
    canale.firstChild.textContent = cum.eticheta;
    canale.hidden = false;
  }
  function continutText() {
    var d = function () { return { tot: text(true), fara: text(false), link: linkLista() }; };
    d.eticheta = 'Trimite lista prin:';
    return d;
  }
  function continutLink() {
    var d = function () {
      var u = linkLista();
      return { tot: 'Lista mea de cumpărături, cu bife: ' + u, fara: 'Lista mea de cumpărături, cu bife:', link: u };
    };
    d.eticheta = 'Trimite linkul listei prin:';
    return d;
  }
  $('[data-lc-text]').addEventListener('click', function () {
    if (peCalculator) { arataCanale(continutText()); return; }
    var t = text(true);
    trimite({ title: 'Lista de cumpărături', text: t }, function () { deschide('https://wa.me/?text=' + encodeURIComponent(t)); });
  });
  $('[data-lc-copiaza]').addEventListener('click', function () { copiaza(text(true), 'Am copiat lista. O lipești în WhatsApp, Keep sau Notițe.'); });
  $('[data-lc-link]').addEventListener('click', function () {
    if (peCalculator) { arataCanale(continutLink()); return; }
    var u = linkLista();
    trimite({ title: 'Lista de cumpărături', text: 'Lista mea de cumpărături, cu bife:', url: u }, function () {
      copiaza(u, 'Am copiat linkul listei. Îl lipești unde vrei să-l trimiți.');
    });
  });
  $('[data-lc-goleste]').addEventListener('click', function () {
    if (!window.confirm('Golești lista? Se scot toate rețetele și bifele.')) return;
    st = curata(null);
    salveaza();
  });
  $('[data-lc-adauga]').addEventListener('submit', function (e) {
    e.preventDefault();
    var inp = $('#lc-produs'), n = inp.value.replace(/\s+/g, ' ').trim();
    if (!n) return;
    n = n.charAt(0).toUpperCase() + n.slice(1);
    if (st.x.indexOf(n) < 0) st.x.push(n);
    st.s = st.s.filter(function (k) { return k !== n; });
    inp.value = '';
    salveaza();
  });

  // ── codul QR, doar pe calculator: telefonul îl scanează și deschide aceeași listă ─────────────────────
  var calculator = window.matchMedia('(pointer: fine) and (min-width: 760px)').matches;
  var qrLib = null, qrUltim = '';
  function qr() {
    var box = $('[data-lc-qr]');
    if (!calculator || (!st.r.length && !st.x.length)) { box.hidden = true; return; }
    var u = linkLista();
    if (u === qrUltim) return;
    qrUltim = u;
    function deseneaza() {
      try {
        var q = window.qrcode(0, 'L');
        q.addData(u);
        q.make();
        $('[data-lc-qr-img]').innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
        box.hidden = false;
      } catch (e) { box.hidden = true; }
    }
    if (window.qrcode) return deseneaza();
    if (qrLib) return;
    qrLib = document.createElement('script');
    qrLib.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
    qrLib.onload = deseneaza;
    qrLib.onerror = function () { box.hidden = true; };
    document.head.appendChild(qrLib);
  }

  // ── scurtătura de pe ecranul telefonului ─────────────────────────────────────────────────
  var peEcran = document.documentElement.classList.contains('ecran');
  var telefon = window.matchMedia('(pointer: coarse)').matches;
  var cerere = null;
  var ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!peEcran && telefon) $('[data-lc-ecran]').hidden = false;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    cerere = e;
    if (!peEcran) $('[data-lc-ecran]').hidden = false;
  });
  window.addEventListener('appinstalled', function () {
    cerere = null;
    $('[data-lc-instaleaza-nota]').textContent = 'Gata. Iconița „Lista NutriRO” e pe ecranul telefonului.';
  });
  $('[data-lc-instaleaza]').addEventListener('click', function () {
    var nota = $('[data-lc-instaleaza-nota]');
    if (cerere) {
      cerere.prompt();
      cerere.userChoice.then(function (r) {
        if (r && r.outcome === 'accepted') nota.textContent = 'Gata. Iconița „Lista NutriRO” e pe ecranul telefonului.';
      });
      cerere = null;
      return;
    }
    nota.innerHTML = '';
    var pasi = ios
      ? ['Apasă butonul Distribuie din Safari (pătratul cu săgeată în sus).', 'Alege „Adaugă pe ecranul principal”.', 'Apasă „Adaugă”.']
      : ['Deschide meniul browserului (cele trei puncte ⋮, sus sau jos în dreapta).', 'Alege „Adaugă pe ecranul de pornire” sau „Instalează aplicația”.', 'Confirmă cu „Adaugă” sau „Instalează”.'];
    var ol = el('ol', 'lc-pasi');
    pasi.forEach(function (p) { ol.appendChild(el('li', null, p)); });
    nota.appendChild(ol);
  });
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('lista-sw.js', { scope: './lista-de-cumparaturi.html' }).catch(function () {});
    });
  }

  // ── lista primită printr-un link ─────────────────────────────────────────────────────────
  function stergeLink() {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  }
  function aceeasi(a, b) { return JSON.stringify([a.r, a.x, a.s]) === JSON.stringify([b.r, b.x, b.s]); }
  function primeste() {
    primita = citesteLink();
    if (!primita) return;
    if ((!st.r.length && !st.x.length) || aceeasi(primita, st)) {
      if (!aceeasi(primita, st)) { st = primita; salveaza(); }
      stergeLink();
      return;
    }
    var box = $('[data-lc-primita]');
    box.innerHTML = '';
    var n = primita.r.length;
    box.appendChild(el('p', null, 'Ai deschis o listă primită' + (n ? ' (' + (n === 1 ? 'o rețetă' : n + ' rețete') + ')' : '') + '. Ai deja o listă pe acest telefon. Ce faci cu ea?'));
    var b = el('div');
    [['Înlocuiește lista mea', function () { st = primita; }],
     ['Adaug-o la lista mea', function () {
       primita.r.forEach(function (e) {
         var al = st.r.filter(function (f) { return f[0] === e[0]; })[0];
         if (al) al[1] = Math.min(60, al[1] + e[1]); else st.r.push(e);
       });
       primita.x.forEach(function (x) { if (st.x.indexOf(x) < 0) st.x.push(x); });
     }],
     ['Păstrez lista mea', function () {}]].forEach(function (a, i) {
      var btn = el('button', 'lc-btn' + (i ? ' lc-btn-alb lc-btn-mic' : ' lc-btn-mic'), a[0]);
      btn.type = 'button';
      btn.addEventListener('click', function () { a[1](); box.hidden = true; stergeLink(); salveaza(); });
      b.appendChild(btn);
    });
    box.appendChild(b);
    box.hidden = false;
  }
  window.addEventListener('hashchange', function () { if (D) { primeste(); arata(); } });

  // ── pornirea ─────────────────────────────────────────────────────────────────────────────
  fetch('lista-date.json?v=' + encodeURIComponent(rad.getAttribute('data-v') || ''))
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) { D = d; primeste(); arata(); })
    .catch(function () {
      $('[data-lc-asteapta]').textContent = 'Nu am putut încărca lista. Verifică legătura la internet și reîncarcă pagina.';
    });
})();
