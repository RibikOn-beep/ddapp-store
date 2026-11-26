/* NutriRO — „Ce gătesc cu ce am?” (cerere Dorel, 26 nov 2026; planul în Pagina web/CE_GATESC_CU_CE_AM.md).
   Omul alege din alimentele NutriRO ce are în frigider; rețetele de pe site apar în ordinea ingredientelor care îi
   mai lipsesc: întâi cele la care nu-i lipsește nimic, apoi cele cu 1, 2, 3… În fiecare grupă, întâi rețetele din
   care ai deja partea cea mai mare, la gramaj. O rețetă apare doar dacă ai măcar unul dintre ingredientele ei
   principale (cele mai grele) și măcar un aliment din frigider. Ingredientele sub 3% din greutatea rețetei (condimente,
   ulei, usturoi), afară de cele din numele ei, nu se numără ca lipsă: apar la „Mai trebuie puțin” (Dorel, 26 nov 2026).
   Datele (retete/frigider-date.json) se refac la fiecare „Pregătește site-ul” (_unelte/frigider.py).
   Frigiderul și cămara se țin doar în browser (localStorage „nutriro-frigider”): nimic nu pleacă nicăieri. */
(function () {
  'use strict';
  var rad = document.querySelector('[data-fr]');
  if (!rad) return;
  var CAUT = window.NutriROCautare;
  var CHEIE = 'nutriro-frigider';
  var PE_GRUPA = 10;
  var $ = function (sel) { return rad.querySelector(sel); };

  var D, FAM, MEREU, ACOPERA, lista, dupaNume;
  var st = { f: [], c: null, vazute: [] };
  var filtre = {}, ordine = 'potrivire', arata = {}, revenire = false, surpriza = null;

  function citeste() {
    try {
      var o = JSON.parse(localStorage.getItem(CHEIE) || 'null');
      if (o && o.v === 1) { st.f = o.f || []; st.c = o.c || null; st.vazute = o.vazute || []; }
    } catch (e) { /* fără localStorage: merge, dar nu ține minte */ }
  }
  function salveaza() {
    try { localStorage.setItem(CHEIE, JSON.stringify({ v: 1, f: st.f, c: st.c, vazute: st.vazute.slice(-20) })); } catch (e) {}
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mic(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
  function nr(n, unu, multe) { return n === 1 ? '1 ' + unu : n + (n % 100 >= 20 || n % 100 === 0 && n ? ' de ' : ' ') + multe; }
  function zec(x) { return String(Math.round(x * 10) / 10).replace('.', ','); }

  fetch(rad.getAttribute('data-date')).then(function (r) { return r.json(); }).then(function (d) {
    D = d;
    FAM = D.f;
    MEREU = {};
    D.mereu.forEach(function (f) { MEREU[f] = 1; });
    ACOPERA = D.acopera;
    lista = D.c.map(function (c) { return { n: c[0], f: c[1], barcode: c[2] ? 1 : undefined }; });
    dupaNume = {};
    lista.forEach(function (x) { dupaNume[x.n] = x; });
    citeste();
    st.f = st.f.filter(function (n) { return dupaNume[n]; });  // alimentele scoase între timp din catalog
    revenire = st.f.length > 0;
    porneste();
  }).catch(function () {
    $('[data-fr-asteapta]').textContent = 'Nu am putut încărca rețetele. Reîncarcă pagina.';
  });

  // ── familiile disponibile ────────────────────────────────────
  function cheieFam(i) { return FAM[i][0]; }
  function camaraBifata() {
    var b = {};
    if (st.c) {
      var k = {};
      st.c.forEach(function (x) { k[x] = 1; });
      D.camara.forEach(function (i) { if (k[cheieFam(i)]) b[i] = 1; });
    } else D.bifat.forEach(function (i) { b[i] = 1; });
    return b;
  }
  function familiiFrigider() {
    var o = {};
    st.f.forEach(function (n) { o[dupaNume[n].f] = n; });
    return o;
  }
  function areFam(set, f) {
    if (set[f]) return true;
    var a = ACOPERA[f];
    if (a) for (var i = 0; i < a.length; i++) if (set[a[i]]) return true;
    return false;
  }

  // ── potrivirea unei rețete ───────────────────────────────────
  function evalueaza(r, fr, cam) {
    var total = 0, am = 0, ai = [], lipsa = [], din = [], putin = [], princ = false, folosesteFrigider = false;
    r[6].forEach(function (x) {
      var f = x[0], g = x[1];
      if (MEREU[f]) return;
      total += g;
      if (areFam(fr, f)) { am += g; ai.push(x); folosesteFrigider = true; if (x[2] === 1) princ = true; }
      else if (areFam(cam, f)) { am += g; din.push(x); if (x[2] === 1) princ = true; }
      else if (x[2] === 2) putin.push(x);  // sub 3% din rețetă și nu e în numele ei: nu se numără ca lipsă
      else lipsa.push(x);
    });
    if (!folosesteFrigider || !princ) return null;
    return { r: r, proc: total ? am / total : 0, ai: ai, lipsa: lipsa, din: din, putin: putin };
  }
  function trecFiltrele(r) {
    if (filtre.post && r[5].indexOf('s') < 0) return false;
    if (filtre.prot && r[5].indexOf('p') < 0) return false;
    if (filtre.calorii && r[5].indexOf('c') < 0) return false;
    if (filtre.rapid && !(r[4] > 0 && r[4] <= 30)) return false;
    return true;
  }
  function potrivite(cuFiltre) {
    var fr = familiiFrigider(), cam = camaraBifata(), out = [];
    if (!st.f.length) return out;
    D.r.forEach(function (r) {
      if (cuFiltre && !trecFiltrele(r)) return;
      var e = evalueaza(r, fr, cam);
      if (e) out.push(e);
    });
    return out;
  }
  function compara(a, b) {
    if (ordine === 'kcal') return a.r[2] - b.r[2];
    if (ordine === 'prot') return b.r[3] - a.r[3];
    return (b.proc - a.proc) || (b.ai.length - a.ai.length) || (a.r[2] - b.r[2]);
  }

  // ── desenarea ────────────────────────────────────────────────
  function porneste() {
    $('[data-fr-asteapta]').hidden = true;
    $('[data-fr-plin]').hidden = false;
    deseneazaCamara();
    leagaCautarea();
    rad.addEventListener('click', laClic);
    rad.addEventListener('change', function (e) {
      if (e.target.matches('[data-fr-cam]')) {
        st.c = Array.prototype.map.call(rad.querySelectorAll('[data-fr-cam]:checked'), function (x) { return x.value; });
        salveaza();
        surpriza = null;
        tot();
      } else if (e.target.matches('[data-fr-ordine]')) { ordine = e.target.value; deseneazaRezultate(); }
    });
    tot();
  }
  function tot() { deseneazaFrigider(); deseneazaRezultate(); }

  function deseneazaFrigider() {
    var ul = $('[data-fr-chips]');
    ul.innerHTML = st.f.map(function (n) {
      return '<li class="fr-chip" title="' + esc(n) + '"><span>' + esc(n) + '</span><button type="button" data-fr-scoate="' + esc(n) +
        '" aria-label="Scoate ' + esc(n) + '">×</button></li>';
    }).join('');
    $('[data-fr-gol]').hidden = st.f.length > 0;
    $('[data-fr-golire]').hidden = st.f.length === 0;
    var fr = familiiFrigider();
    var scurt = D.scurt.filter(function (f) { return !areFam(fr, f); });
    $('[data-fr-scurt-t]').hidden = !scurt.length;
    $('[data-fr-scurt]').innerHTML = scurt.map(function (f) {
      return '<li><button type="button" class="fr-scurt" data-fr-adauga="' + esc(D.implicit[f]) + '">+ ' + esc(FAM[f][1]) + '</button></li>';
    }).join('');
    $('[data-fr-surprinde]').disabled = st.f.length === 0;
  }

  function deseneazaCamara() {
    var cam = camaraBifata();
    var mereu = D.mereu.map(function (f) {
      return '<label class="fr-mereu"><input type="checkbox" checked disabled/> ' + esc(FAM[f][1]) + '</label>';
    }).join('');
    var bife = D.camara.map(function (f) {
      return '<label><input type="checkbox" data-fr-cam value="' + esc(cheieFam(f)) + '"' + (cam[f] ? ' checked' : '') + '/> ' + esc(FAM[f][1]) + '</label>';
    }).join('');
    $('[data-fr-bife]').innerHTML = mereu + bife;
    numaraCamara();
  }
  function numaraCamara() {
    var k = Object.keys(camaraBifata()).length + D.mereu.length;
    $('[data-fr-cam-nr]').textContent = '(' + k + ' bifate)';
  }

  function nume(x) { return FAM[x[0]][1]; }
  function card(e, fr) {
    var r = e.r;
    var meta = [zec(r[3]) + ' g proteine'];
    if (r[4]) meta.push(r[4] + ' min');
    var ai = e.ai.map(function (x) {
      var al = fr[x[0]], ret = D.n[x[3]];
      var t = al && al !== ret ? ' title="În rețetă: ' + esc(ret) + '"' : '';
      return '<span' + t + '>✓ ' + esc(nume(x)) + '</span>';
    }).join(' · ');
    var lipsa = e.lipsa.map(function (x) { return esc(mic(nume(x))); }).join(', ');
    var din = e.din.map(function (x) { return esc(mic(nume(x))); }).join(', ');
    var putin = e.putin.map(function (x) { return esc(mic(nume(x))); }).join(', ');
    var p = Math.round(e.proc * 100);
    return '<li class="fr-card"><div class="fr-kc"><b>' + r[2] + '</b><span>kcal/porție</span></div><div class="fr-tx">' +
      '<h3><a href="' + esc(r[0]) + '.html">' + esc(r[1]) + '</a></h3>' +
      '<p class="fr-meta">' + esc(meta.join(' · ')) + '</p>' +
      '<p class="fr-ai"><b>Ai deja:</b> ' + ai + '</p>' +
      (lipsa ? '<p class="fr-lipsa"><b>Îți mai trebuie:</b> ' + lipsa + '</p>' : '') +
      (putin ? '<p class="fr-din">Mai trebuie puțin: ' + putin + '</p>' : '') +
      (din ? '<p class="fr-din">Din cămară: ' + din + '</p>' : '') +
      '<div class="fr-bara" aria-hidden="true"><i style="width:' + p + '%"></i></div>' +
      '<span class="fr-proc">Ai ' + p + '% din rețetă, la gramaj</span></div></li>';
  }

  var GRUPE = [
    { k: 0, t: 'Gătești acum', s: 'ai tot ce trebuie' },
    { k: 1, t: 'Îți lipsește un singur ingredient', s: '' },
    { k: 2, t: 'Îți mai trebuie 2 ingrediente', s: '' },
    { k: 3, t: 'Îți mai trebuie 3 ingrediente', s: '' },
    { k: 4, t: 'Îți mai trebuie 4 sau mai multe', s: 'o bază de pornire' }
  ];

  function deseneazaRezultate() {
    var zona = $('[data-fr-rez]'), rez = $('[data-fr-rezumat]');
    numaraCamara();
    if (!st.f.length) {
      rez.innerHTML = '<p>Alege ce ai în frigider și îți arătăm rețetele pe care le poți găti.</p>' +
        '<p>Poți începe cu butoanele rapide: ouă, cartofi, brânză de vaci…</p>';
      zona.innerHTML = '';
      $('[data-fr-cta]').hidden = true;
      $('[data-fr-salt]').hidden = true;
      return;
    }
    var toate = potrivite(false), cuFiltre = potrivite(true), fr = familiiFrigider();
    var acum = toate.filter(function (e) { return !e.lipsa.length; }).length;
    var unul = toate.filter(function (e) { return e.lipsa.length === 1; }).length;
    rez.innerHTML = '<p>' + (revenire ? 'Bine ai revenit. ' : '') + (acum ? 'Cu ce ai, poți găti acum <b>' + nr(acum, 'rețetă', 'rețete') + '</b>.' : 'Încă nu ai tot ce trebuie pentru o rețetă întreagă.') + '</p>' +
      '<p>' + (unul ? 'La încă ' + nr(unul, 'rețetă', 'rețete') + ' îți lipsește un singur ingredient. ' : '') +
      'Rețetele sunt în ordinea ingredientelor care îți lipsesc, de la cele mai puține.</p>';
    var html = '';
    if (surpriza) html += '<section class="fr-box fr-surpriza"><h2>Surpriza ta</h2><ul class="fr-rez">' + card(surpriza, fr) +
      '</ul><p class="fr-mai"><button type="button" class="fr-btn fr-btn-alb" data-fr-surprinde>Altă surpriză</button></p></section>';
    if (!cuFiltre.length) {
      html += '<section class="fr-box"><p class="fr-gol-rez">' + (toate.length
        ? 'Nicio rețetă nu trece de filtrele alese. Scoate un filtru ca să vezi ' + nr(toate.length, 'rețetă potrivită', 'rețete potrivite') + '.'
        : 'Încă nu am rețete pentru ce ai ales. Mai adaugă un aliment sau bifează ce ai în cămară.') + '</p></section>';
    }
    GRUPE.forEach(function (g) {
      var din = cuFiltre.filter(function (e) { return g.k === 4 ? e.lipsa.length >= 4 : e.lipsa.length === g.k; }).sort(compara);
      if (!din.length) return;
      if (g.k === 4 && !arata.multe) {
        html += '<p class="fr-mai"><button type="button" class="fr-btn fr-btn-alb" data-fr-multe>' + (din.length === 1
          ? 'Arată și rețeta la care îți lipsesc 4 sau mai multe ingrediente'
          : 'Arată și cele ' + nr(din.length, 'rețetă', 'rețete') + ' la care îți lipsesc 4 sau mai multe ingrediente') + '</button></p>';
        return;
      }
      var cate = arata[g.k] || PE_GRUPA;
      html += '<section class="fr-box fr-grup"><h2>' + g.t + ' <small>' + nr(din.length, 'rețetă', 'rețete') + (g.s ? ', ' + g.s : '') + '</small></h2>' +
        '<ul class="fr-rez">' + din.slice(0, cate).map(function (e) { return card(e, fr); }).join('') + '</ul>' +
        (din.length > cate ? '<p class="fr-mai"><button type="button" class="fr-btn fr-btn-alb" data-fr-inca="' + g.k + '">Arată încă ' +
          Math.min(PE_GRUPA, din.length - cate) + '</button></p>' : '') + '</section>';
    });
    zona.innerHTML = html;
    $('[data-fr-cta]').hidden = false;
    // pe telefon rezultatele sunt sub frigider: un buton duce direct la ele
    var salt = $('[data-fr-salt]'), vizibile = cuFiltre.filter(function (e) { return e.lipsa.length <= 3; }).length;
    salt.hidden = !cuFiltre.length;
    salt.textContent = 'Vezi rețetele ↓ (' + (vizibile || cuFiltre.length) + ')';
  }

  // ── acțiuni ──────────────────────────────────────────────────
  function adauga(n) {
    if (!dupaNume[n] || st.f.indexOf(n) >= 0) return;
    st.f.push(n);
    revenire = false;
    surpriza = null;
    arata = {};
    salveaza();
    tot();
  }
  function surprinde() {
    var vaz = {};
    st.vazute.forEach(function (s) { vaz[s] = 1; });
    var bazin = potrivite(true).filter(function (e) { return e.lipsa.length <= 1 && (!surpriza || e.r[0] !== surpriza.r[0]); });
    if (!bazin.length) bazin = potrivite(true).filter(function (e) { return e.lipsa.length <= 3; });
    if (!bazin.length) { surpriza = null; deseneazaRezultate(); return; }
    // nu la întâmplare de-a binelea: potrivirea mai bună are șanse mai mari, rețetele arătate recent mai mici
    var ponderi = bazin.map(function (e) { return (0.1 + e.proc * e.proc) * (e.lipsa.length ? 0.5 : 1) * (vaz[e.r[0]] ? 0.15 : 1); });
    var sum = ponderi.reduce(function (a, b) { return a + b; }, 0), x = Math.random() * sum, i = 0;
    while (i < bazin.length - 1 && (x -= ponderi[i]) > 0) i++;
    surpriza = bazin[i];
    st.vazute.push(surpriza.r[0]);
    salveaza();
    deseneazaRezultate();
    var s = rad.querySelector('.fr-surpriza');
    if (s && s.scrollIntoView) s.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function laClic(e) {
    var t = e.target.closest('button, [data-fr-alege]');
    if (!t) return;
    if (t.hasAttribute('data-fr-scoate')) {
      var n = t.getAttribute('data-fr-scoate');
      st.f = st.f.filter(function (x) { return x !== n; });
      surpriza = null; arata = {}; salveaza(); tot();
    } else if (t.hasAttribute('data-fr-adauga')) adauga(t.getAttribute('data-fr-adauga'));
    else if (t.hasAttribute('data-fr-golire')) { st.f = []; surpriza = null; arata = {}; salveaza(); tot(); }
    else if (t.hasAttribute('data-fr-filtru')) {
      var k = t.getAttribute('data-fr-filtru');
      filtre[k] = !filtre[k];
      t.setAttribute('aria-pressed', filtre[k] ? 'true' : 'false');
      arata = {}; surpriza = null; deseneazaRezultate();
    } else if (t.hasAttribute('data-fr-surprinde')) surprinde();
    else if (t.hasAttribute('data-fr-inca')) { var g = t.getAttribute('data-fr-inca'); arata[g] = (arata[g] || PE_GRUPA) + PE_GRUPA; deseneazaRezultate(); }
    else if (t.hasAttribute('data-fr-multe')) { arata.multe = true; deseneazaRezultate(); }
  }

  // ── căutarea de alimente (căutarea comună NutriRO: genericele întâi) ──
  function leagaCautarea() {
    var inp = $('[data-fr-caut]'), sug = $('[data-fr-sug]'), activ = -1, gasite = [];
    function inchide() { sug.hidden = true; inp.setAttribute('aria-expanded', 'false'); activ = -1; }
    function deseneaza() {
      var text = inp.value;
      if (text.trim().length < 2 || !CAUT) { inchide(); return; }
      var r = CAUT.cauta([{ lista: lista }], text, { limita: 12 });
      gasite = r.rezultate.map(function (x) { return x.element; });
      var fr = familiiFrigider();
      if (!gasite.length) {
        sug.innerHTML = r.sugestie
          ? '<li data-fr-alege="" data-sugestie="' + esc(r.sugestie) + '">Poate ai vrut: <b>' + esc(r.sugestieAfisata || r.sugestie) + '</b></li>'
          : '<li class="fr-sug-gol">Nu găsesc „' + esc(text.trim()) + '” în rețetele de pe site.</li>';
      } else {
        sug.innerHTML = gasite.map(function (x, i) {
          var deja = st.f.indexOf(x.n) >= 0 ? 'e în frigider' : fr[x.f] ? 'ai deja ' + mic(FAM[x.f][1]) : '';
          return '<li role="option" id="fr-o' + i + '" data-fr-alege="' + esc(x.n) + '" aria-selected="false">' + esc(x.n) +
            (deja ? '<small>' + esc(deja) + '</small>' : '') + '</li>';
        }).join('');
      }
      sug.hidden = false;
      inp.setAttribute('aria-expanded', 'true');
      activ = -1;
    }
    function marcheaza(i) {
      var li = sug.querySelectorAll('[role="option"]');
      if (!li.length) return;
      activ = (i + li.length) % li.length;
      Array.prototype.forEach.call(li, function (x, j) { x.setAttribute('aria-selected', j === activ ? 'true' : 'false'); });
      inp.setAttribute('aria-activedescendant', 'fr-o' + activ);
      li[activ].scrollIntoView({ block: 'nearest' });
    }
    function alege(li) {
      if (li.hasAttribute('data-sugestie')) { inp.value = li.getAttribute('data-sugestie'); deseneaza(); inp.focus(); return; }
      var n = li.getAttribute('data-fr-alege');
      if (!n) return;
      adauga(n);
      inp.value = '';
      inchide();
      inp.focus();
    }
    inp.addEventListener('input', deseneaza);
    inp.addEventListener('focus', deseneaza);
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); marcheaza(activ + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); marcheaza(activ - 1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        var li = sug.querySelectorAll('[data-fr-alege]');
        if (li.length) alege(li[activ >= 0 ? activ : 0]);
      } else if (e.key === 'Escape') inchide();
    });
    sug.addEventListener('mousedown', function (e) {
      var li = e.target.closest('[data-fr-alege]');
      if (li) { e.preventDefault(); alege(li); }
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('.fr-caut')) inchide(); });
  }
})();
