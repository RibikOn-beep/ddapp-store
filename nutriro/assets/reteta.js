/* Pagina de rețetă NutriRO: calculatorul de porții, filtrele din listă, căutarea și protecția textului de preparare. */
(function () {
  function grup(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function cant(q) {
    var r = q >= 100 ? Math.round(q / 10) * 10 : (q >= 20 ? Math.round(q) : Math.round(q * 10) / 10);
    return r >= 1000 ? grup(r) : String(r).replace('.', ',');
  }

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
    calc.querySelector('[data-minus]').addEventListener('click', function () { if (p > 1) { p--; afis(); } });
    calc.querySelector('[data-plus]').addEventListener('click', function () { if (p < 60) { p++; afis(); } });
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

  // filtrele din lista de rețete
  var filtre = document.querySelectorAll('[data-filtru]');
  var aplica = function (f) {
    filtre.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-filtru') === f ? 'true' : 'false'); });
    document.querySelectorAll('.masa').forEach(function (m) {
      var vizibile = 0;
      m.querySelectorAll('li[data-kcal]').forEach(function (li) {
        var ok = f === 'toate'
          || (f === 'sub300' && +li.getAttribute('data-kcal') < 300)
          || (f === 'rapide' && +li.getAttribute('data-min') > 0 && +li.getAttribute('data-min') <= 30)
          || (f === 'lowcarb' && li.getAttribute('data-lowcarb') === '1');
        li.hidden = !ok;
        if (ok) vizibile++;
      });
      var gol = m.querySelector('.gol');
      if (gol) gol.hidden = vizibile > 0;
    });
  };
  filtre.forEach(function (b) { b.addEventListener('click', function () { aplica(b.getAttribute('data-filtru')); }); });

  // căutarea pe pagina cu toate rețetele (?q=)
  var grile = document.querySelectorAll('.grila a');
  var q = new URLSearchParams(location.search).get('q');
  var camp = document.querySelector('.cauta input');
  if (camp && q) camp.value = q;
  if (grile.length && q) {
    var t = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    grile.forEach(function (a) {
      var n = a.textContent.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      a.hidden = n.indexOf(t) < 0;
    });
  }
})();
