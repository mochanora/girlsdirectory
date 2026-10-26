/**
 * Girls' Directory — Google Sheets backend
 * ------------------------------------------
 * Paste this into the sheet's Apps Script editor (Extensions → Apps Script),
 * then deploy it as a Web app (see README.md).
 *
 * How it reads the sheet:
 *  - Every visible tab is a category (the tab name is the category name),
 *    except tabs whose name contains "read me".
 *  - In each tab, the header row is the row containing "Business name".
 *  - Columns are matched by their header text, so column order doesn't matter.
 *
 * Adding a new category = add a new tab with the same headers. It shows up
 * on the website automatically.
 *
 * Optional passcode: in Project Settings → Script properties, add a property
 * called PASSCODE. The website will then ask for it before showing anything.
 */

const SETTINGS = {
  SKIP_TABS_CONTAINING: ['read me'],
  CLASSIFICATIONS: ['Girl Business', 'Recommendation'],
  CACHE_SECONDS: 120,
  MAX_LEN: { name: 120, brief: 1200, tags: 300, website: 300, phone: 200, email: 200 },
};

// Header text that maps to each field (lowercase).
const FIELD_HEADERS = {
  name: ['business name', 'business', 'name'],
  brief: ['brief', 'description', 'about'],
  classification: ['classification', 'type'],
  tags: ['tags', 'keywords'],
  website: ['website', 'instagram', 'social', 'link', 'links'],
  phone: ['phone', 'phone number', 'contact', 'whatsapp', 'number', 'tel', 'mobile'],
  email: ['email', 'e-mail', 'mail'],
};

const CACHE_KEY = 'directory_v1';

function doGet() {
  return json_({ ok: true, message: "Girls' Directory API is running." });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!checkPasscode_(body.passcode)) {
      return json_({ error: 'passcode', message: body.passcode ? 'That passcode is not right.' : 'Please enter the group passcode.' });
    }
    if (body.action === 'list') return json_(listAll_());
    if (body.action === 'add') return json_(addEntry_(body.entry || {}));
    return json_({ error: 'bad_request', message: 'Unknown action.' });
  } catch (err) {
    return json_({ error: 'server', message: String((err && err.message) || err) });
  }
}

/* ---------- Reading ---------- */

function listAll_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(CACHE_KEY);
  if (hit) return JSON.parse(hit);

  const categories = categorySheets_().map(function (sh) {
    const t = readSheet_(sh);
    if (!t) return null;
    const entries = [];
    t.rows.forEach(function (row, i) {
      const get = function (f) { return t.cols[f] == null ? '' : String(row[t.cols[f]]).trim(); };
      const name = get('name');
      if (!name) return;
      entries.push({
        id: sh.getSheetId() + '-' + (t.headerRow + 1 + i),
        name: name,
        brief: get('brief'),
        classification: get('classification'),
        tags: get('tags'),
        website: get('website'),
        phone: get('phone'),
        email: get('email'),
      });
    });
    return { name: sh.getName(), entries: entries };
  }).filter(Boolean);

  const out = { ok: true, categories: categories, updated: new Date().toISOString() };
  try { cache.put(CACHE_KEY, JSON.stringify(out), SETTINGS.CACHE_SECONDS); } catch (e) { /* too big to cache — fine */ }
  return out;
}

function categorySheets_() {
  return SpreadsheetApp.getActive().getSheets().filter(function (sh) {
    if (sh.isSheetHidden()) return false;
    const n = sh.getName().toLowerCase();
    return !SETTINGS.SKIP_TABS_CONTAINING.some(function (s) { return n.indexOf(s) !== -1; });
  });
}

function readSheet_(sh) {
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return null;
  const values = sh.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  let headerIdx = -1;
  for (let i = 0; i < Math.min(values.length, 20); i++) {
    if (values[i].some(function (c) { return norm_(c) === 'business name'; })) { headerIdx = i; break; }
  }
  if (headerIdx < 0) return null;
  const cols = mapColumns_(values[headerIdx]);
  if (cols.name == null) return null;
  return { sheet: sh, headerRow: headerIdx + 1, cols: cols, rows: values.slice(headerIdx + 1) };
}

function mapColumns_(headers) {
  const cols = {};
  const used = {};
  const h = headers.map(norm_);
  // Pass 1: exact header match
  Object.keys(FIELD_HEADERS).forEach(function (f) {
    for (let i = 0; i < h.length; i++) {
      if (!used[i] && FIELD_HEADERS[f].indexOf(h[i]) !== -1) { cols[f] = i; used[i] = true; return; }
    }
  });
  // Pass 2: header contains an alias
  Object.keys(FIELD_HEADERS).forEach(function (f) {
    if (cols[f] != null) return;
    for (let i = 0; i < h.length; i++) {
      if (used[i] || !h[i]) continue;
      if (FIELD_HEADERS[f].some(function (a) { return a.length > 3 && h[i].indexOf(a) !== -1; })) { cols[f] = i; used[i] = true; return; }
    }
  });
  // Pass 3: a header that is just a phone number (happens when a number is typed into the header cell)
  if (cols.phone == null) {
    for (let i = 0; i < h.length; i++) {
      if (!used[i] && /^[+\d][\d\s()+-]{6,}$/.test(h[i])) { cols.phone = i; used[i] = true; break; }
    }
  }
  return cols;
}

/* ---------- Adding ---------- */

function addEntry_(input) {
  if (input.company_url) return { ok: true }; // honeypot field: bots fill it, people don't

  const entry = {};
  Object.keys(SETTINGS.MAX_LEN).forEach(function (f) {
    entry[f] = clean_(input[f]).slice(0, SETTINGS.MAX_LEN[f]);
  });
  const wanted = String(input.classification || '').toLowerCase();
  entry.classification = SETTINGS.CLASSIFICATIONS.filter(function (c) { return c.toLowerCase() === wanted; })[0] || '';

  const missing = [];
  if (!entry.name) missing.push('the business name');
  if (!entry.brief) missing.push('a short description');
  if (!entry.classification) missing.push('whether it is a Girl Business or a Recommendation');
  if (!entry.phone && !entry.email && !entry.website) missing.push('at least one way to contact them');
  if (missing.length) return { error: 'invalid', message: 'Please add ' + missing.join(', ') + '.' };

  const sh = categorySheets_().filter(function (s) { return s.getName() === String(input.category || ''); })[0];
  if (!sh) return { error: 'invalid', message: 'Please choose a category.' };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const t = readSheet_(sh);
    if (!t) return { error: 'server', message: 'The "' + sh.getName() + '" tab is missing its "Business name" header.' };

    const key = nameKey_(entry.name);
    const dup = t.rows.filter(function (r) { return nameKey_(r[t.cols.name]) === key; })[0];
    if (dup) return { error: 'duplicate', message: '"' + String(dup[t.cols.name]).trim() + '" is already listed under ' + sh.getName() + '.' };

    // Find the last row that has anything in the directory's columns
    const colIdx = Object.keys(t.cols).map(function (f) { return t.cols[f]; });
    let last = -1;
    t.rows.forEach(function (r, i) {
      if (colIdx.some(function (c) { return String(r[c]).trim() !== ''; })) last = i;
    });
    const lastDataRow = t.headerRow + 1 + last; // sheet row number (header row if no entries yet)
    let target = lastDataRow + 1;
    if (target > sh.getMaxRows()) {
      sh.insertRowAfter(lastDataRow);
    }

    Object.keys(t.cols).forEach(function (f) {
      if (entry[f] === undefined) return;
      sh.getRange(target, t.cols[f] + 1).setValue(safe_(entry[f]));
    });
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  CacheService.getScriptCache().remove(CACHE_KEY);
  return { ok: true };
}

/* ---------- Helpers ---------- */

function checkPasscode_(given) {
  const expected = PropertiesService.getScriptProperties().getProperty('PASSCODE');
  if (!expected) return true;
  return String(given || '').trim() === String(expected).trim();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function norm_(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function nameKey_(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function clean_(v) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
}

// Stop text like "=IMPORTXML(...)" from being treated as a formula. "+254..." stays readable.
function safe_(v) {
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}
