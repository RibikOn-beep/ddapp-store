/* NutriRO — căutarea comună (aceeași ca în aplicație și în NutriAdmin).
   GENERAT din CaloriiRO4/services/cautare.js de scripts/genereazaCautareWeb.js — NU edita aici. */
(function () {
// services/cautare.js — NutriRO
// FIX CAUTARE-UNICA-01 (regulile stabilite cu Dorel pe 22 nov 2026, docs/REPARATII_CAUTARE.md;
// implementare cerută pe 25 nov 2026, „aceeași căutare peste tot: aplicație, NutriAdmin, site”).
//
// Ce era: fiecare loc căuta în felul lui. Aplicația folosea Fuse.js (căutare aproximativă): la
// „lapte” ieșeau 542 de rezultate, inclusiv nume care doar seamănă; ~44 ms pe literă pe PC peste
// 10.905 ingrediente; fiecare ecran își făcea propria copie a fiecărui aliment plus un index Fuse
// (mai mulți MB de memorie, suspect la blocările de pe telefoanele cu ~3 GB RAM).
//
// Regulile (pe scurt; detaliile și exemplele în docs/REPARATII_CAUTARE.md):
//  1. Nu contează literele mari și diacriticele; cratima, virgula, paranteza, slash-ul = spațiu.
//  2. Fiecare cuvânt tastat trebuie să fie ÎNCEPUTUL unui cuvânt din nume, în orice ordine.
//  3. Ordinea, după primul cuvânt tastat, pe 5 trepte: numele exact → numele începe cu cuvântul
//     întreg → numele începe cu literele tastate → un cuvânt din mijloc e exact cel tastat → un
//     cuvânt din mijloc începe cu literele tastate. În fiecare treaptă: întâi produsele generice
//     (fără cod de bare, fără marcă și fără cantitate ambalată în nume — vezi esteGeneric), apoi
//     numele mai scurte, apoi alfabetic.
//  4. Singular/plural: la cuvintele de minimum 4 litere, ultima vocală poate lipsi
//     („portocală” găsește „Portocale”); plus o listă mică de pluraluri neregulate (măr → mere).
//     Potrivirile prin aceste variante vin DUPĂ potrivirile directe din aceeași treaptă.
//  5. Greșelile de tastare: doar dacă nu iese nimic, se caută cel mai apropiat cuvânt din catalog
//     și rezultatele vin separat, sub „Nu am găsit «…». Poate ai vrut: …”.
//
// Memorie și viteză (telefoane slabe):
//  - Un singur index pe listă, ținut într-un WeakMap pe chiar lista din catalog: toate ecranele
//    care folosesc aceeași listă folosesc același index; o listă nouă (catalog actualizat) are
//    index nou, iar cel vechi dispare odată cu lista veche.
//  - Indexul NU copiază alimentele: ține doar numele simplificat și poziția în listă.
//  - Normalizarea e o singură trecere caracter cu caracter, fără expresii regulate.
//  - Indexul se poate construi în bucăți (construiesteIndexTreptat), ca firul JS să nu stea.
//  - La o literă în plus („lap” → „lapt”), căutarea se face doar printre rezultatele de dinainte.
//
// ACEST FIȘIER E JAVASCRIPT CURAT (fără React Native): aceeași copie se folosește în NutriAdmin și
// pe site (scripts/genereazaCautareWeb.js îl transformă pentru browser). Orice schimbare de regulă
// se face AICI și se regenerează copiile web.

// ── 1. Normalizarea ─────────────────────────────────────────────────

const LITERE = {
  "ă": "a", "â": "a", "à": "a", "á": "a", "ä": "a", "ã": "a", "å": "a", "ā": "a", "ą": "a",
  "î": "i", "ì": "i", "í": "i", "ï": "i", "ı": "i", "ī": "i",
  "ș": "s", "ş": "s", "ś": "s", "š": "s",
  "ț": "t", "ţ": "t", "ť": "t",
  "é": "e", "è": "e", "ê": "e", "ë": "e", "ē": "e", "ę": "e", "ě": "e",
  "ó": "o", "ò": "o", "ô": "o", "ö": "o", "õ": "o", "ø": "o", "ő": "o", "ō": "o",
  "ú": "u", "ù": "u", "û": "u", "ü": "u", "ű": "u", "ū": "u", "ů": "u",
  "ç": "c", "č": "c", "ć": "c", "ñ": "n", "ń": "n", "ň": "n", "ý": "y", "ÿ": "y",
  "ž": "z", "ź": "z", "ż": "z", "ł": "l", "ř": "r", "ď": "d", "ğ": "g",
  "ß": "ss", "œ": "oe", "æ": "ae",
};

/**
 * Textul simplificat pentru căutare: litere mici, fără diacritice, iar tot ce nu e literă sau
 * cifră devine un singur spațiu. „Lapte-praf (1,5%)” → „lapte praf 1 5”.
 */
function normalizeaza(text) {
  const s = String(text == null ? "" : text).toLowerCase();
  let out = "";
  let spatiu = true; // nu pune spațiu la început
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const cod = s.charCodeAt(i);
    if ((cod >= 97 && cod <= 122) || (cod >= 48 && cod <= 57)) { out += ch; spatiu = false; continue; }
    if (cod < 128) { if (!spatiu) { out += " "; spatiu = true; } continue; }
    const inlocuire = LITERE[ch];
    if (inlocuire !== undefined) { out += inlocuire; spatiu = false; continue; }
    // Diacritice combinate (după NFD) dispar; alte semne de punctuație Unicode devin spațiu.
    if (cod >= 0x0300 && cod <= 0x036f) continue;
    if (/\s/.test(ch) || "–—„”“’‘«»…·•°×".indexOf(ch) >= 0) { if (!spatiu) { out += " "; spatiu = true; } continue; }
    out += ch; spatiu = false; // alte alfabete (ex. chirilic) rămân cum sunt
  }
  return spatiu && out.length ? out.slice(0, -1) : out;
}

// ── 2. Singular / plural ────────────────────────────────────────────

// Pluralurile care NU încep la fel ca singularul (în ambele sensuri). Restul le prinde regula
// „ultima vocală poate lipsi”. De completat cu Dorel.
// („ou” → „ouă”, „nucă” → „nuci”, „roșie” → „roșii” merg deja prin începutul de cuvânt / vocala lipsă.)
const NEREGULATE = [
  ["mar", "mere"], ["para", "pere"], ["ceapa", "cepe"], ["varza", "verze"],
  ["cireasa", "cirese"], ["dovleac", "dovleci"], ["samanta", "seminte"],
];
const _neregulate = new Map();
NEREGULATE.forEach(([a, b]) => {
  if (!_neregulate.has(a)) _neregulate.set(a, []);
  if (!_neregulate.has(b)) _neregulate.set(b, []);
  _neregulate.get(a).push(b);
  _neregulate.get(b).push(a);
});
const VOCALE = "aeiou";

/** Variantele unui cuvânt tastat: [cuvântul, ...alternative]. Alternativele ies pe locuri mai jos. */
function variante(cuvant) {
  const v = [cuvant];
  if (cuvant.length >= 4 && VOCALE.indexOf(cuvant[cuvant.length - 1]) >= 0) v.push(cuvant.slice(0, -1));
  const ner = _neregulate.get(cuvant);
  if (ner) ner.forEach((x) => { if (v.indexOf(x) < 0) v.push(x); });
  return v;
}

// ── 2b. Cuvinte compuse ─────────────────────────────────────────────
// FIX CAUTARE-GENERICE-01 (cerut de Dorel, 26 nov 2026): „extravirgin” și „extra virgin” sunt
// același cuvânt. Ce observa userul: „ulei de măsline extravirgin” nu găsea genericul
// „Ulei de măsline extra virgin”. În nume și în ce se tastează, perechea se scrie legat.
// La tastare se leagă și când al doilea cuvânt e doar început („extra vi” → „extravi”).
const COMPUSE = [["extra", "virgin"]];

function unesteCompuseInNume(n) {
  let s = " " + n + " ";
  for (let k = 0; k < COMPUSE.length; k++) {
    const a = " " + COMPUSE[k][0] + " " + COMPUSE[k][1] + " ";
    const b = " " + COMPUSE[k][0] + COMPUSE[k][1] + " ";
    while (s.indexOf(a) >= 0) s = s.replace(a, b);
  }
  return s.slice(1, -1);
}

function unesteCompuseInCuvinte(cuvinte) {
  const out = [];
  for (let i = 0; i < cuvinte.length; i++) {
    const w = cuvinte[i], urm = cuvinte[i + 1];
    let unit = false;
    if (urm) {
      for (let k = 0; k < COMPUSE.length; k++) {
        if (w === COMPUSE[k][0] && COMPUSE[k][1].startsWith(urm)) { out.push(w + urm); i++; unit = true; break; }
      }
    }
    if (!unit) out.push(w);
  }
  return out;
}

// ── 2c. Ce e „generic” ──────────────────────────────────────────────
// FIX CAUTARE-GENERICE-01 (cerut de Dorel, 26 nov 2026: „la ingrediente să apară în față prima
// dată alimentele fără cod de bare și fără marcă în denumire, deci și fără cantitate ambalată”).
// Ce observa userul: la „ulei de măsline” veneau în față Monini, MEGA, Ol'eve, iar genericul
// „Ulei de măsline extra virgin” ieșea din listă. Cauza: generic era tot ce n-avea cod de bare,
// iar ~2.900 de produse de magazin din catalog n-au cod (au fost luate de pe site-urile
// magazinelor). Acum un aliment e generic doar dacă: n-are cod de bare, n-are cantitate ambalată
// în nume („500ml”, „1 l”, „3x25G”) și n-are marcă (din lista de mai jos sau „… - Marcă” la final).
// Cantitățile descriptive nu contează: „(50-55g/buc)”, „(o porție=450g)”, „(100g - felie)”.
// Lista de mărci: cele care apar în catalog (26 nov 2026). De completat cu Dorel când apare una nouă.
const MARCI = [
  // magazine și mărcile lor proprii
  "auchan", "kaufland", "lidl", "carrefour", "penny", "profi", "mega", "mega image", "delhaize",
  "world's market", "nature's promise", "pouce", "milbona", "alesto", "freshona", "vemondo",
  "chef select", "crownfield", "snack day", "sondey", "solevita", "k classic", "metro chef", "cora", "selgros",
  // mărci
  "actimel", "activia", "activlab", "activus", "adventure menu", "agricola", "agrino", "aivia", "albalact",
  "aldis", "alfredo seafood", "alimenta", "almette", "alnatura", "alpin", "alpro", "amazing grass", "amix",
  "amylon", "andechser", "antrefrig", "ardealul", "arla", "aron rice", "auga", "balconi", "baltic club",
  "balviten", "baneasa", "barebells", "barilla", "beastpink", "bellarom", "bfree", "bicaz", "bimbo",
  "bio all green", "bod", "body & future", "bonduelle", "boromir", "born winner", "boujee", "bravito",
  "brivais vilnis", "bucegi", "buldak", "buon pane", "bunica", "calvo", "campis", "capricii si delicii",
  "caroli", "carpos", "casa buna", "casa taraneasca", "citterio", "cirio", "cocoa fusion", "cocoxim",
  "colectar", "comtim", "copanex", "corso", "costa d'oro", "covalact", "cremosso", "cris tim", "critida sitia",
  "dacia plant", "danette", "danone", "danonino", "darinne", "dayup", "de coltesti", "de nigris", "defish",
  "delaco", "delicia", "delikat", "deplina", "deroni", "desiam", "dextro energy", "diamant", "diana",
  "dobrogea", "don fabrizio", "dr oetker", "dulano", "edenia", "el tequito", "elion", "eridanous", "excellent",
  "familia toneli", "filgud", "filiera", "fish market", "five continents", "fizico", "floarea de aur",
  "food & glory", "fortzoso", "fox", "fragedo", "frinsa", "frufru", "fuego", "galeo", "gastronatura",
  "gelatelli", "gerble", "golden garden", "golfera", "grania", "grewe", "gullon", "gurmand apetit",
  "gusturi romanesti", "gustona", "gymbeam", "healthyco", "heinz", "hellmann's", "hochland", "home chef",
  "home garden", "hulala", "ile de france", "incola", "inedit", "integra", "italiamo", "kaiser franz josef",
  "kamis", "kania", "katinola", "kb", "kiddylicious", "kikkoman", "kinder", "king oscar", "knoppers", "knorr",
  "kolios", "kravys", "krina", "la colline", "la molisana", "la provincia", "la strada", "laminut",
  "laptaria cu caimac", "licco", "lidas", "lili gri", "lorenz", "lurpak", "madame gateau", "maggi",
  "magnum", "maille", "mandra", "manuka health", "mare aperto", "margaritar", "marina blue", "marysol",
  "martin's", "matache macelaru", "mautner markhof", "maxim's", "mcennedy", "meda", "meggle", "mega grill",
  "michael artisan", "milka", "mirdatod", "mission", "mivolis", "mizo", "monini", "morliny", "mornflake",
  "mowi", "muller", "mutti", "my sushi", "nairn's", "napolact", "naturli", "nestle", "nissin", "nixe",
  "not guilty", "now foods", "nuii", "nutline", "nutramino", "nutrend", "nutrino lab", "nyb", "ol'eve",
  "oliveris", "olmuhle solling", "olympia", "olympus", "optimum nutrition", "oreo", "orlandos", "panzani",
  "pambac", "paula", "perutnina", "pescaria magic", "pescobar", "philadelphia", "pikok", "pilos", "pippo",
  "piramida", "pirifan", "pirulo", "pizza mania", "plaisir", "policalita", "president", "primavika",
  "puiul de craiesti", "puisor", "purasana", "purya", "radicstar", "raftul bunicii", "raraul", "raureni",
  "rawz", "red farm", "reinert", "rigoni di asiago", "rio mare", "riso scotti", "roberto", "sanovita",
  "sano vita", "saturo", "scandia", "schulstad", "sergiana", "shan'shi", "sissi", "siviero", "snack4u",
  "solaris", "solomonescu", "sombazon", "sportness", "stay strong", "starbucks", "stragghisto",
  "surasul soarelui", "szekely falat", "tabasco", "terra creta", "the bridge", "the protein works",
  "topoloveni", "unisol", "vel pitar", "velika", "verdino", "vilgain", "vitasia", "wasa", "weider",
  "wolfberry", "xender", "xucker", "yes plants", "yopro", "yuksel", "zanetti", "zein", "zott", "zuzu", "zwup",
];

let _marciPeCuvant = null; // primul cuvânt al mărcii → mărcile întregi (simplificate)
function marciPeCuvant() {
  if (_marciPeCuvant) return _marciPeCuvant;
  const m = new Map();
  for (let k = 0; k < MARCI.length; k++) {
    const p = normalizeaza(MARCI[k]);
    if (!p) continue;
    const w0 = p.split(" ")[0];
    if (!m.has(w0)) m.set(w0, []);
    m.get(w0).push(" " + p + " ");
  }
  _marciPeCuvant = m;
  return m;
}

const RE_MARCA_LA_FINAL = /\s[-–]\s+[A-ZĂÂÎȘȚ][^()\-–]*$/; // „Unt de nuci - GymBeam”, „Hochland – Cașcaval”
function areMarca(original, n) {
  if (RE_MARCA_LA_FINAL.test(original)) return true;
  const m = marciPeCuvant();
  const s = " " + n + " ";
  const cuv = n.split(" ");
  for (let i = 0; i < cuv.length; i++) {
    const f = m.get(cuv[i]);
    if (!f) continue;
    for (let j = 0; j < f.length; j++) if (s.indexOf(f[j]) >= 0) return true;
  }
  return false;
}

const RE_CANTITATE = /(\d+(?:[.,]\d+)?)\s*(kg|g|gr|grame|ml|l|cl|dl)(?![a-zăâîșț])/gi;
const RE_DESCRIPTIV = /porti|porți|felie|buc|≈|=|aprox|lingur|cana|cană/i;
function areCantitateAmbalata(original) {
  RE_CANTITATE.lastIndex = 0;
  let m;
  while ((m = RE_CANTITATE.exec(original))) {
    const inainte = original.slice(0, m.index).replace(/\s+$/, "");
    if (/[=≈~]$/.test(inainte)) continue;                               // „porție=450g”, „≈ 1g”
    const dupa = original.slice(m.index + m[0].length).replace(/^\s+/, "");
    if (dupa[0] === "/") continue;                                       // „55g/buc”
    const desc = inainte.lastIndexOf("("), inch = inainte.lastIndexOf(")");
    if (desc > inch) {                                                   // în paranteză descriptivă
      const fin = original.indexOf(")", m.index);
      if (RE_DESCRIPTIV.test(original.slice(desc, fin < 0 ? undefined : fin))) continue;
    }
    return true;
  }
  return false;
}

/**
 * Alimentul e generic: fără cod de bare, fără cantitate ambalată și fără marcă în nume.
 * @param {object} el - elementul din catalog (`n` sau `nume`, opțional `barcode`)
 * @param {string} [numeSimplificat] - normalizeaza(nume), dacă e deja calculat
 */
function esteGeneric(el, numeSimplificat) {
  if (!el || el.barcode) return false;
  const original = String(el.n != null ? el.n : el.nume != null ? el.nume : "");
  const n = numeSimplificat != null ? numeSimplificat : normalizeaza(original);
  return !areCantitateAmbalata(original) && !areMarca(original, n);
}

// ── 3. Indexul ──────────────────────────────────────────────────────

const _indexuri = new WeakMap(); // lista din catalog → index

function indexGol(lista) {
  return {
    lista,
    nume: [],        // „ mar verde” (cu un spațiu în față: „ ” + cuvânt = început de cuvânt)
    poz: [],         // poziția în lista originală
    generic: [],     // 1 = fără cod de bare
    gata: false,
    _ultim: null,    // ultima căutare, pentru îngustarea din mers
    _dictionar: null,
  };
}

function adaugaInIndex(idx, start, sfarsit, vazute) {
  const lista = idx.lista;
  for (let i = start; i < sfarsit; i++) {
    const el = lista[i];
    if (!el) continue;
    const simplu = normalizeaza(el.n != null ? el.n : el.nume);
    if (!simplu) continue;
    const n = unesteCompuseInNume(simplu); // FIX CAUTARE-GENERICE-01
    const gen = esteGeneric(el, simplu) ? 1 : 0; // FIX CAUTARE-GENERICE-01 (înainte: doar fără cod de bare)
    // Același nume simplificat de două ori: rămâne primul, cu o excepție — dacă primul e un produs
    // de magazin și al doilea e generic, rămâne cel generic.
    const existent = vazute.get(n);
    if (existent !== undefined) {
      if (!idx.generic[existent] && gen) { idx.poz[existent] = i; idx.generic[existent] = 1; }
      continue;
    }
    vazute.set(n, idx.nume.length);
    idx.nume.push(" " + n);
    idx.poz.push(i);
    idx.generic.push(gen);
  }
}

/** Indexul unei liste, construit acum dacă lipsește (sincron). */
function obtineIndex(lista) {
  if (!Array.isArray(lista)) return null;
  let idx = _indexuri.get(lista);
  if (idx && idx.gata) return idx;
  idx = indexGol(lista);
  adaugaInIndex(idx, 0, lista.length, new Map());
  idx.gata = true;
  _indexuri.set(lista, idx);
  return idx;
}

/** Indexul, doar dacă e deja gata (fără să construiască nimic). */
function indexGata(lista) {
  const idx = Array.isArray(lista) ? _indexuri.get(lista) : null;
  return idx && idx.gata ? idx : null;
}

/**
 * Construiește indexul în bucăți de `bucata` nume, cu pauză între ele (planificator primit de la
 * apelant, ex. setTimeout sau InteractionManager), ca aplicația să rămână fluidă pe telefoanele
 * slabe. Întoarce o promisiune cu indexul. Două cereri pentru aceeași listă împart lucrul.
 */
const _inLucru = new WeakMap();
function construiesteIndexTreptat(lista, { bucata = 1500, pauza } = {}) {
  if (!Array.isArray(lista)) return Promise.resolve(null);
  const gata = indexGata(lista);
  if (gata) return Promise.resolve(gata);
  if (_inLucru.has(lista)) return _inLucru.get(lista);
  const asteapta = pauza || ((fn) => setTimeout(fn, 0));
  const promisiune = new Promise((rezolva) => {
    const idx = indexGol(lista);
    const vazute = new Map();
    let i = 0;
    const pas = () => {
      try {
        const sf = Math.min(lista.length, i + bucata);
        adaugaInIndex(idx, i, sf, vazute);
        i = sf;
        if (i < lista.length) { asteapta(pas); return; }
        idx.gata = true;
        _indexuri.set(lista, idx);
        _inLucru.delete(lista);
        rezolva(idx);
      } catch (e) {
        _inLucru.delete(lista);
        rezolva(obtineIndex(lista)); // plasă: varianta sincronă
      }
    };
    asteapta(pas);
  });
  _inLucru.set(lista, promisiune);
  return promisiune;
}

// ── 4. Căutarea ─────────────────────────────────────────────────────

function pregatesteInterogare(text) {
  const simplu = normalizeaza(text);
  if (!simplu) return null;
  const cuvinte = unesteCompuseInCuvinte(simplu.split(" ")); // FIX CAUTARE-GENERICE-01
  const q = cuvinte.join(" ");
  const var_ = cuvinte.map(variante);
  return {
    q,
    cuvinte,
    // „ lapt” — căutat în „ lapte praf”; cu spațiu în față = început de cuvânt
    cautate: var_.map((vs) => vs.map((v) => " " + v)),
    areNeregulate: var_.some((vs, k) => vs.some((v) => v !== cuvinte[k] && v !== cuvinte[k].slice(0, -1))),
  };
}

function sePotriveste(nume, cautate) {
  for (let k = 0; k < cautate.length; k++) {
    const vs = cautate[k];
    let gasit = false;
    for (let j = 0; j < vs.length; j++) { if (nume.indexOf(vs[j]) >= 0) { gasit = true; break; } }
    if (!gasit) return false;
  }
  return true;
}

// Treapta (1–5) a numelui față de un cuvânt; 0 = nu se potrivește.
function treapta(nume, cuvant, qIntreg) {
  // nume = „ mar verde”
  const n = nume.slice(1);
  if (n === qIntreg) return 1;
  if (n === cuvant || n.startsWith(cuvant + " ")) return 2;
  if (n.startsWith(cuvant)) return 3;
  if (nume.indexOf(" " + cuvant + " ") > 0 || nume.endsWith(" " + cuvant)) return 4;
  if (nume.indexOf(" " + cuvant) > 0) return 5;
  return 0;
}

// Cheia de ordonare: treapta, apoi varianta (directă înaintea pluralului/ vocalei lipsă),
// apoi genericele înaintea produselor de magazin, apoi lungimea. Alfabetic la egalitate.
function cheieOrdine(idx, k, interogare) {
  const nume = idx.nume[k];
  const cuvant = interogare.cuvinte[0];
  let t = treapta(nume, cuvant, interogare.q);
  let alt = 0;
  if (!t) {
    const vs = interogare.cautate[0];
    for (let j = 1; j < vs.length && !t; j++) {
      t = treapta(nume, vs[j].slice(1), "\u0000");
      alt = j;
    }
    if (!t) t = 5;
  }
  // FIX CAUTARE-GENERICE-01: un produs de magazin cu numele exact („Ulei de Masline”, cu cod)
  // nu mai trece înaintea genericelor („Ulei de măsline rafinat”); coboară în treapta 2.
  if (t === 1 && !idx.generic[k]) t = 2;
  return ((t * 2 + (alt ? 1 : 0)) * 2 + (idx.generic[k] ? 0 : 1)) * 1000 + Math.min(nume.length, 999);
}

function cautaInIndex(idx, interogare, filtru) {
  // Îngustarea din mers: dacă noua căutare doar adaugă litere la aceleași cuvinte, rezultatele
  // ei sunt sigur printre cele de dinainte (nu și când intră pluraluri neregulate).
  const u = idx._ultim;
  let candidati = null;
  if (u && !interogare.areNeregulate && !u.areNeregulate && u.filtru === filtru &&
      u.cuvinte.length === interogare.cuvinte.length &&
      u.cuvinte.every((c, k) => interogare.cuvinte[k].startsWith(c))) {
    candidati = u.potriviri;
  }
  const potriviri = [];
  const total = candidati ? candidati.length : idx.nume.length;
  for (let j = 0; j < total; j++) {
    const k = candidati ? candidati[j] : j;
    if (!sePotriveste(idx.nume[k], interogare.cautate)) continue;
    if (filtru && !filtru(idx.lista[idx.poz[k]])) continue;
    potriviri.push(k);
  }
  idx._ultim = { cuvinte: interogare.cuvinte, areNeregulate: interogare.areNeregulate, filtru, potriviri };
  return potriviri;
}

/**
 * Caută în una sau mai multe liste (ex. ingrediente și rețete), după aceleași reguli.
 * @param {Array<{lista: object[], tip?: string, filtru?: Function}>} surse
 * @param {string} text - ce a tastat omul
 * @param {object} [opt]
 * @param {number} [opt.limita=50] - câte rezultate întoarce (Infinity = toate)
 * @param {boolean} [opt.sugestii=true] - „Poate ai vrut:” când nu iese nimic
 * @returns {{ rezultate: Array<{element: object, tip: string, treapta: number}>, total: number, sugestie: string|null,
 *   sugestieAfisata: string|null, gol: boolean }}
 *   `gol` = interogarea e goală (apelantul arată lista lui implicită).
 */
function cauta(surse, text, opt = {}) {
  const limita = opt.limita == null ? 50 : opt.limita;
  const interogare = pregatesteInterogare(text);
  if (!interogare) return { rezultate: [], total: 0, sugestie: null, gol: true };

  const gasite = []; // { cheie, nume, element, tip }
  surse.forEach((s) => {
    const idx = obtineIndex(s.lista);
    if (!idx) return;
    const pot = cautaInIndex(idx, interogare, s.filtru || null);
    for (let j = 0; j < pot.length; j++) {
      const k = pot[j];
      gasite.push({ cheie: cheieOrdine(idx, k, interogare), nume: idx.nume[k], element: idx.lista[idx.poz[k]], tip: s.tip || "" });
    }
  });

  if (gasite.length === 0 && opt.sugestii !== false && interogare.q.length >= 3) {
    const corectat = corecteaza(surse, interogare);
    if (corectat && corectat !== interogare.q) {
      const r = cauta(surse, corectat, { limita, sugestii: false });
      // O sugestie care nu găsește nici ea nimic nu ajută: atunci rămâne „niciun rezultat”.
      if (r.total > 0) return { rezultate: r.rezultate, total: r.total, sugestie: corectat, sugestieAfisata: formaAfisata(corectat, r.rezultate), gol: false };
    }
  }

  gasite.sort((a, b) => (a.cheie - b.cheie) || (a.nume < b.nume ? -1 : a.nume > b.nume ? 1 : 0));
  const bucata = limita === Infinity ? gasite : gasite.slice(0, limita);
  return {
    // treapta: 1–5 (vezi regula 3); ecranele cu ordonare proprie (după profil, după obiectiv)
    // o aplică doar ÎN INTERIORUL aceleiași trepte.
    rezultate: bucata.map((g) => ({ element: g.element, tip: g.tip, treapta: Math.floor(g.cheie / 4000) })),
    total: gasite.length,
    sugestie: null,
    sugestieAfisata: null,
    gol: false,
  };
}

/**
 * Sugestia scrisă cum apare în catalog („mazare” → „mazăre”): fiecare cuvânt corectat se caută
 * în numele primelor rezultate și se ia forma lui originală, cu diacritice, cu literă mică.
 */
function formaAfisata(corectat, rezultate) {
  const cuvinteNume = [];
  rezultate.slice(0, 10).forEach((r) => {
    String(r.element.n != null ? r.element.n : r.element.nume || "").split(/[\s\-,;:/()[\].!?„”“"'«»…]+/).forEach((w) => { if (w) cuvinteNume.push(w); });
  });
  return corectat.split(" ").map((c) => {
    const gasit = cuvinteNume.find((w) => normalizeaza(w) === c);
    return gasit ? gasit.toLowerCase() : c;
  }).join(" ");
}

/**
 * Aceleași reguli peste o listă oarecare (rânduri de tabel, titluri, obiecte cu altă formă), fără
 * index păstrat: pentru NutriAdmin și site, unde listele se schimbă pe loc (editări) și sunt mici
 * sau rulează pe calculator. Întoarce elementele care se potrivesc, în ordinea regulilor.
 * @param {Array} elemente
 * @param {string} text
 * @param {object} [opt]
 * @param {Function} [opt.nume] - numele de căutat al unui element (implicit e.n)
 * @param {Function} [opt.generic] - false dacă elementul are cod de bare (implicit: fără e.barcode);
 *   peste el se aplică și regula numelui din esteGeneric (marcă, cantitate ambalată)
 * @param {number} [opt.limita=Infinity]
 * @param {boolean} [opt.sugestii=true]
 * @returns {{ elemente: Array, total: number, sugestie: string|null, sugestieAfisata: string|null, gol: boolean }}
 */
function cautaInElemente(elemente, text, opt = {}) {
  const numeDe = opt.nume || ((e) => (e && e.n != null ? e.n : ""));
  const genericDe = opt.generic || ((e) => !(e && e.barcode));
  const lista = (elemente || []).map((e) => ({ n: numeDe(e), barcode: genericDe(e) ? undefined : 1, _e: e }));
  const r = cauta([{ lista }], text, { limita: opt.limita == null ? Infinity : opt.limita, sugestii: opt.sugestii });
  return {
    elemente: r.rezultate.map((x) => x.element._e),
    total: r.total,
    sugestie: r.sugestie,
    sugestieAfisata: r.sugestieAfisata || null,
    gol: r.gol,
  };
}

// ── 5. „Poate ai vrut:” ─────────────────────────────────────────────

// Levenshtein cu oprire timpurie când depășește `max`; rânduri refolosite (fără alocări pe cuvânt).
let _r1 = new Int32Array(64), _r2 = new Int32Array(64);
function distanta(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (b.length + 1 > _r1.length) { _r1 = new Int32Array(b.length + 1); _r2 = new Int32Array(b.length + 1); }
  let prev = _r1, cur = _r2;
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let minRand = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const sub = prev[j - 1] + (ca === b.charCodeAt(j - 1) ? 0 : 1);
      const del = prev[j] + 1;
      const ins = cur[j - 1] + 1;
      const c = sub < del ? (sub < ins ? sub : ins) : (del < ins ? del : ins);
      cur[j] = c;
      if (c < minRand) minRand = c;
    }
    if (minRand > max) return max + 1;
    const t = prev; prev = cur; cur = t;
  }
  return prev[b.length];
}

// Cuvintele din nume (minimum 3 litere, fără numere), cu frecvența (generic = 3, magazin = 1),
// grupate după prima literă — „Poate ai vrut:” compară doar cu cuvintele care încep cu una din
// primele două litere tastate (o greșeală rar atinge ambele).
function dictionar(idx) {
  if (idx._dictionar) return idx._dictionar;
  const frecventa = new Map();
  for (let k = 0; k < idx.nume.length; k++) {
    const cuv = idx.nume[k].split(" ");
    for (let j = 1; j < cuv.length; j++) {
      const w = cuv[j];
      const c0 = w.charCodeAt(0);
      if (w.length >= 3 && !(c0 >= 48 && c0 <= 57)) frecventa.set(w, (frecventa.get(w) || 0) + (idx.generic[k] ? 3 : 1));
    }
  }
  const peLitera = new Map();
  frecventa.forEach((f, w) => {
    if (!peLitera.has(w[0])) peLitera.set(w[0], []);
    peLitera.get(w[0]).push([w, f]);
  });
  idx._dictionar = peLitera;
  return peLitera;
}

// Scorul unei corecturi (mai mic = mai bun): distanța; un cuvânt întreg contează mai mult decât un
// început de cuvânt; un cuvânt mai scurt decât ce s-a tastat e mai puțin probabil („mzare” → „mazare”,
// nu „mare”); la egalitate câștigă cuvântul mai des întâlnit în alimentele generice.
function scorCorectura(w, d, max) {
  let best = distanta(w, d, max);
  if (best <= max && d.length < w.length) best += 0.4;
  if (d.length > w.length) {
    const t1 = distanta(w, d.slice(0, w.length), max) + 0.5;
    const t2 = d.length > w.length + 1 ? distanta(w, d.slice(0, w.length + 1), max) + 0.5 : max + 1;
    if (t1 < best) best = t1;
    if (t2 < best) best = t2;
  }
  return best;
}

/** Interogarea corectată (fiecare cuvânt fără potrivire → cel mai apropiat cuvânt din catalog), sau null. */
function corecteaza(surse, interogare) {
  const dicturi = [];
  surse.forEach((s) => { const idx = obtineIndex(s.lista); if (idx) dicturi.push(dictionar(idx)); });
  let schimbat = false;
  const noi = interogare.cuvinte.map((w) => {
    const litere = w.length > 1 && w[1] !== w[0] ? [w[0], w[1]] : [w[0]];
    // cuvântul are deja potriviri ca început de cuvânt → rămâne
    for (const dict of dicturi) {
      const grup = dict.get(w[0]) || [];
      for (let i = 0; i < grup.length; i++) if (grup[i][0].startsWith(w)) return w;
    }
    const max = w.length <= 4 ? 1 : 2;
    let best = null, bestScor = max + 1, bestF = -1;
    for (const dict of dicturi) {
      for (const l of litere) {
        const grup = dict.get(l) || [];
        for (let i = 0; i < grup.length; i++) {
          const d = grup[i][0], f = grup[i][1];
          if (d.length + max < w.length) continue;
          const sc = scorCorectura(w, d, max);
          if (sc < bestScor || (sc === bestScor && f > bestF)) { best = d; bestScor = sc; bestF = f; }
        }
      }
    }
    if (best && bestScor <= max) { schimbat = true; return best; }
    return w;
  });
  return schimbat ? noi.join(" ") : null;
}

// ── 6. Candidați pentru un nume scris liber ─────────────────────────
// FIX CAUTARE-GENERICE-01 (cerut de Dorel, 26 nov 2026: „aceeași căutare peste tot, inclusiv în
// analizarea listei”). Pentru numele care nu sunt tastate în casetă, ci vin dintr-o listă lipită
// („120 g piept de curcan gătit”) sau din rețete (unificarea din NutriAdmin): ACEEAȘI căutare,
// cu două ajutoare, ambele vizibile în `cautat`:
//  1. cuvintele de umplutură („o”, „mică”, „de”, „cu”) se scot înainte;
//  2. dacă nu ies destui candidați pe toate cuvintele, se caută din nou fără ultimul cuvânt
//     („piept curcan gătit” → „piept curcan”), până la primul. Potrivirile pe tot numele rămân
//     primele, în ordinea căutării obișnuite.
// Dacă nu iese nimic nici pe primul cuvânt: „Poate ai vrut:”, ca în casetă.
const UMPLUTURA = new Set([
  "o", "un", "de", "niste", "cateva", "mic", "mica", "mici", "mare", "mari", "mediu", "medie",
  "sau", "si", "cu", "la", "in", "pentru", "din", "fara", "dupa", "peste", "intre", "prin", "pe",
]);

/**
 * @param {object[]} lista - elemente cu `n` (și opțional `barcode`), ca în catalog
 * @param {string} text - numele scris liber (fără cantitate)
 * @param {object} [opt]
 * @param {number} [opt.limita=15]
 * @returns {{ elemente: object[], complet: string, cautat: string[], sugestie: string|null }}
 *   `complet`: numele fără cuvintele de umplutură (ce s-a căutat întâi).
 *   `cautat`: textele căutate care au adus candidați, în ordine (primul = tot numele, dacă a găsit).
 */
function candidatiPentruNume(lista, text, opt = {}) {
  const limita = opt.limita == null ? 15 : opt.limita;
  const cuvinte = normalizeaza(text).split(" ").filter((w) => w && !UMPLUTURA.has(w));
  const elemente = [];
  const vazute = new Set();
  const cautat = [];
  for (let k = cuvinte.length; k >= 1 && elemente.length < limita; k--) {
    const t = cuvinte.slice(0, k).join(" ");
    const r = cauta([{ lista }], t, { limita, sugestii: false });
    let adaugate = 0;
    for (let j = 0; j < r.rezultate.length && elemente.length < limita; j++) {
      const el = r.rezultate[j].element;
      if (vazute.has(el)) continue;
      vazute.add(el); elemente.push(el); adaugate++;
    }
    if (adaugate) cautat.push(t);
  }
  let sugestie = null;
  if (!elemente.length && cuvinte.length) {
    const r = cauta([{ lista }], cuvinte.join(" "), { limita });
    r.rezultate.forEach((x) => elemente.push(x.element));
    sugestie = r.sugestie || null;
    if (sugestie) cautat.push(sugestie);
  }
  return { elemente, complet: cuvinte.join(" "), cautat, sugestie };
}

// Doar pentru teste.
const _intern = { treapta, distanta, pregatesteInterogare };

window.NutriROCautare = { normalizeaza, variante, esteGeneric, obtineIndex, indexGata, construiesteIndexTreptat, cauta, formaAfisata, cautaInElemente, candidatiPentruNume };
})();
