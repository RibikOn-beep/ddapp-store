/* Paginile de rețete NutriRO: calculatorul de porții, protecția textului de preparare,
   iar pe paginile de listă căutarea, filtrele și paginile câte 20 (ideea 5, aleasă de Dorel pe 27 oct 2026). */
(function () {
  function grup(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function cant(q) {
    var r = q >= 100 ? Math.round(q / 10) * 10 : (q >= 20 ? Math.round(q) : Math.round(q * 10) / 10);
    return r >= 1000 ? grup(r) : String(r).replace('.', ',');
  }
  function fara(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  // calculatorul de porții
  var calc = document.querySelector('[data-portii-baza]');
  if (calc) {
    var baza = +calc.getAttribute('data-portii-baza'), p = baza;
    var kcalP = +calc.getAttribute('data-kcal'), gP = +calc.getAttribute('data-g');
    var afis = function () {
      document.querySelectorAll('[data-portii]').forEach(function (el) { el.textContent = p; });
      document.querySelectorAll('[data-portii-et]').forEach(function (el) { el.textContent = p === 1 ? 'porție' : 'porții'; });
      document.querySelectorAll('[data-q]').forEach(function (el) {
        el.textContent = cant(+el.getAttribute('data-q') * p / baza) + ' ' + el.getAttribute('data-u');
      });
      var tk = document.querySelector('[data-total-kcal]');
      if (tk) tk.textContent = grup(Math.round(kcalP * p)) + ' kcal';
      var tg = document.querySelector('[data-total-kg]');
      if (tg && gP) tg.textContent = (Math.round(gP * p / 100) / 10).toString().replace('.', ',') + ' kg';
    };
    // lista de cumpărături (aprobat Dorel, 17 nov 2026): rețeta intră în listă cu porțiile alese mai sus.
    // Lista stă în browser (localStorage „nutriro-lista”); pagina ei e retete/lista-de-cumparaturi.html (assets/lista.js).
    var cos = document.querySelector('[data-lista-cos]'), arataCos = function () {};
    if (cos && cos.getAttribute('data-id')) {
      var CHEIE = 'nutriro-lista', idR = cos.getAttribute('data-id');
      var btnL = cos.querySelector('[data-adauga-lista]'), stareL = cos.querySelector('[data-lista-stare]');
      var citesteL = function () {
        var o = null;
        try { o = JSON.parse(localStorage.getItem(CHEIE) || 'null'); } catch (e) {}
        o = o && typeof o === 'object' ? o : {};
        return { v: 1, r: Array.isArray(o.r) ? o.r : [], x: o.x || [], s: o.s || [], b: o.b || [] };
      };
      var scrieL = function (o) {
        try { localStorage.setItem(CHEIE, JSON.stringify(o)); } catch (e) {}
        try { window.dispatchEvent(new Event('nutriro-lista')); } catch (e) {}
        arataCos();
      };
      var gaseste = function (o) { return o.r.filter(function (e) { return e && e[0] === idR; })[0]; };
      var portii = function (n) { return n === 1 ? '1 porție' : n + (n % 100 >= 20 || n % 100 === 0 ? ' de porții' : ' porții'); };
      arataCos = function () {
        var e = gaseste(citesteL());
        btnL.classList.toggle('in', !!e && e[1] === p);
        btnL.textContent = !e ? 'Adaugă în lista de cumpărături'
          : e[1] === p ? '✓ În lista de cumpărături: ' + portii(p)
          : 'Pune ' + portii(p) + ' în listă (acum: ' + e[1] + ')';
        stareL.hidden = !e;
      };
      btnL.addEventListener('click', function () {
        var o = citesteL(), e = gaseste(o);
        if (e && e[1] === p) { location.href = 'lista-de-cumparaturi.html'; return; }
        if (e) e[1] = p; else o.r.push([idR, p]);
        scrieL(o);
      });
      stareL.querySelector('[data-scoate-lista]').addEventListener('click', function () {
        var o = citesteL();
        o.r = o.r.filter(function (e) { return !e || e[0] !== idR; });
        scrieL(o);
      });
      window.addEventListener('storage', function (ev) { if (ev.key === CHEIE) arataCos(); });
      window.addEventListener('pageshow', arataCos);
      arataCos();
    }
    calc.querySelector('[data-minus]').addEventListener('click', function () { if (p > 1) { p--; afis(); arataCos(); } });
    calc.querySelector('[data-plus]').addEventListener('click', function () { if (p < 60) { p++; afis(); arataCos(); } });
  }

  // tipărire
  var tip = document.querySelector('[data-tipareste]');
  if (tip) tip.addEventListener('click', function () { window.print(); });

  // protecția textului de preparare: fără meniu, fără selecție, fără copiere; restul paginii se copiază cu sursa
  document.querySelectorAll('.protejat').forEach(function (el) {
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    el.addEventListener('selectstart', function (e) { e.preventDefault(); });
    el.addEventListener('dragstart', function (e) { e.preventDefault(); });
  });
  document.addEventListener('copy', function (e) {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    var r = sel.getRangeAt(0), prot = false;
    document.querySelectorAll('.protejat').forEach(function (el) { if (r.intersectsNode(el)) prot = true; });
    e.preventDefault();
    if (prot) return;
    e.clipboardData.setData('text/plain', sel.toString() + '\n\nSursa: ' + location.origin + location.pathname);
  });

  // căutarea din bara de sus (?q=) ajunge în câmpul paginii de listă
  var q = new URLSearchParams(location.search).get('q') || '';
  var campSus = document.querySelector('.cauta input');
  if (campSus && q) campSus.value = q;

  // paginile de listă: căutare, filtre, câte 20 pe pagină; toate rețetele sunt în HTML (le citește Google), scriptul doar ascunde
  var lista = document.querySelector('[data-lista]');
  if (!lista) return;
  var PE_PAGINA = 20, pagina = 1;
  var randuri = Array.prototype.slice.call(lista.children);
  randuri.forEach(function (li) { li._n = fara(li.textContent); });
  // FIX CAUTARE-UNICA-01 (25 nov 2026): aceeași căutare ca în aplicație și în NutriAdmin (assets/cautare.js,
  // generat din CaloriiRO4/services/cautare.js): fiecare cuvânt tastat = începutul unui cuvânt din titlu,
  // rezultatele în ordinea potrivirii, „Poate ai vrut:” la o greșeală. Fără cautare.js (pagină veche din
  // cache), rămâne căutarea simplă de dinainte.
  var CAUT = window.NutriROCautare;
  var ordineInitiala = randuri.slice();
  randuri.forEach(function (li) { var b = li.querySelector('.tx b'); li._titlu = b ? b.textContent : li.textContent; });
  var infoOrdine = document.querySelector('.lp-info > span:last-child');
  var textOrdine = infoOrdine ? infoOrdine.textContent : '';
  var sugestieEl = document.createElement('p');
  sugestieEl.className = 'gol';
  sugestieEl.hidden = true;
  lista.parentNode.insertBefore(sugestieEl, lista);
  var caut = document.querySelector('[data-caut]');
  if (caut && q) caut.value = q;
  var det = document.querySelector('.f-det');
  if (det && window.matchMedia('(max-width: 760px)').matches) det.removeAttribute('open');
  var nr = document.querySelector('[data-nr]'), gol = document.querySelector('[data-gol]'), pag = document.querySelector('[data-pagini]');

  function bifat(nume) { var el = document.querySelector('input[name="' + nume + '"]'); return el && el.checked; }
  var dupaCautare = false;
  function potrivite() {
    var text = caut ? caut.value : '';
    var t = fara(text).trim();
    var treapta = (document.querySelector('input[name="kcal"]:checked') || {}).value || 'toate';
    var feluri = Array.prototype.map.call(document.querySelectorAll('input[name="fel"]:checked'), function (x) { return x.value; });
    var baza = randuri, r = null;
    if (t && CAUT) { r = CAUT.cautaInElemente(randuri, text, { nume: function (li) { return li._titlu; } }); baza = r.elemente; }
    dupaCautare = !!(t && CAUT);
    sugestieEl.hidden = !(r && r.sugestie);
    sugestieEl.textContent = r && r.sugestie ? 'Nu am găsit „' + text.trim() + '”. Poate ai vrut: ' + (r.sugestieAfisata || r.sugestie) : '';
    return baza.filter(function (li) {
      var k = +li.getAttribute('data-kcal'), m = +li.getAttribute('data-min');
      if (t && !CAUT && li._n.indexOf(t) < 0) return false;
      if (treapta === 'sub200' && !(k < 200)) return false;
      if (treapta === 'medii' && !(k >= 200 && k <= 350)) return false;
      if (treapta === 'peste' && !(k > 350)) return false;
      if (feluri.length && feluri.indexOf(li.getAttribute('data-fel')) < 0) return false;
      if (bifat('rapide') && !(m > 0 && m <= 30)) return false;
      if (bifat('post') && li.getAttribute('data-post') !== '1') return false;
      if (bifat('prot') && li.getAttribute('data-prot') !== '1') return false;
      return true;
    });
  }
  function buton(n, eticheta) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = eticheta || n;
    if (n === pagina && !eticheta) b.setAttribute('aria-current', 'page');
    b.addEventListener('click', function () { pagina = n; arata(); lista.scrollIntoView({ block: 'start' }); });
    return b;
  }
  function arata() {
    var ok = potrivite(), total = Math.max(1, Math.ceil(ok.length / PE_PAGINA));
    if (pagina > total) pagina = total;
    var de = (pagina - 1) * PE_PAGINA, pana = de + PE_PAGINA;
    // FIX CAUTARE-UNICA-01: cu text căutat, rândurile se așază în ordinea potrivirii; fără, înapoi pe calorii.
    (dupaCautare ? ok : ordineInitiala).forEach(function (li) { lista.appendChild(li); });
    if (infoOrdine) infoOrdine.textContent = dupaCautare ? 'Ordine: potrivirea cu căutarea' : textOrdine;
    randuri.forEach(function (li) { li.hidden = true; });
    ok.forEach(function (li, i) { li.hidden = i < de || i >= pana; });
    if (nr) nr.textContent = ok.length;
    var et = document.querySelector('[data-nr-et]'), n = ok.length, r100 = n % 100;
    if (et) et.textContent = n === 1 ? 'rețetă' : ((n < 20 || (r100 > 0 && r100 < 20)) ? 'rețete' : 'de rețete');
    if (gol) gol.hidden = ok.length > 0;
    if (!pag) return;
    pag.innerHTML = '';
    if (total < 2) return;
    if (pagina > 1) pag.appendChild(buton(pagina - 1, '← Înapoi'));
    var vazute = {};
    [1, pagina - 1, pagina, pagina + 1, total].forEach(function (n) {
      if (n < 1 || n > total || vazute[n]) return;
      if (Object.keys(vazute).length && !vazute[n - 1]) { var s = document.createElement('span'); s.className = 'pct'; s.textContent = '…'; pag.appendChild(s); }
      vazute[n] = 1;
      pag.appendChild(buton(n));
    });
    if (pagina < total) pag.appendChild(buton(pagina + 1, 'Următoarea →'));
  }
  // căutarea e acum deasupra listei, în afara coloanei de filtre (12 nov 2026)
  document.querySelectorAll('.filtre-col input, [data-caut]').forEach(function (el) {
    el.addEventListener(el.type === 'search' ? 'input' : 'change', function () { pagina = 1; arata(); });
  });
  arata();
})();
