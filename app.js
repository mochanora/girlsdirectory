/* =========================================================
   The Girls' Directory
   ---------------------------------------------------------
   SETUP: paste your Apps Script Web app URL between the quotes.
   Leave it empty to preview the site with made-up demo data.
   ========================================================= */
const API_URL = 'https://script.google.com/macros/s/AKfycbxtFOWBnIdd1WvmyShImJrQVA0_awMFBaSkRSqWqdH4yWFgfbFfy4huE8j-Z9iB7NRUHw/exec';

/* ---------- State ---------- */
const state = {
  categories: [],   // category names, in sheet tab order
  entries: [],      // { id, category, name, brief, classification, tags, website, phone, email }
  search: '',
  category: 'all',
  type: 'all',
  passcode: '',
  demo: !API_URL,
};

const $ = (sel, root = document) => root.querySelector(sel);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : String(c));
  }
  return node;
}

function svg(path) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = path; // static icon paths only, never user data
  return s;
}
const ICONS = {
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
  insta: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".6" fill="currentColor"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  wa: '<path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6 8.5 7 8.5-7"/>',
  warn: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.2" r=".4" fill="currentColor"/>',
};

/* ---------- Storage (per-browser conveniences only) ---------- */
const store = {
  get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

/* ---------- API ---------- */
async function api(body) {
  if (state.demo) return demoApi(body);
  const res = await fetch(API_URL, {
    method: 'POST',
    // text/plain avoids a CORS preflight, which Apps Script doesn't support
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...body, passcode: state.passcode }),
  });
  if (!res.ok) throw new Error('The directory could not be reached (' + res.status + ').');
  return res.json();
}

/* ---------- Load ---------- */
async function load({ quiet = false } = {}) {
  if (!quiet) showSkeleton();
  try {
    const data = await api({ action: 'list' });
    if (data.error === 'passcode') return showGate(data.message);
    if (data.error) throw new Error(data.message || data.error);
    $('#gate').hidden = true;
    state.categories = data.categories.map(c => c.name);
    state.entries = data.categories.flatMap(c => c.entries.map(e => ({ ...e, category: c.name })));
    if (state.category !== 'all' && !state.categories.includes(state.category)) state.category = 'all';
    if (data.updated) $('#updated').textContent = 'Updated ' + new Date(data.updated).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    render();
  } catch (err) {
    $('#grid').replaceChildren();
    showBanner('Couldn’t load the directory. ' + (err.message || '') + ' Please refresh to try again.');
  }
}

function showSkeleton() {
  $('#grid').replaceChildren(...Array.from({ length: 6 }, () => el('div', { class: 'skeleton' })));
  $('#resultCount').textContent = '';
  $('#empty').hidden = true;
}

function showBanner(text) {
  const b = $('#banner');
  b.textContent = text;
  b.hidden = false;
}

/* ---------- Filtering ---------- */
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Any tab with "blacklist" in its name is treated as the blacklist
const isBlacklist = category => /black\s*list/i.test(String(category || ''));

function matches(e) {
  if (state.category !== 'all' && e.category !== state.category) return false;
  if (isBlacklist(e.category)) {
    // Never mixed into "All" or the Girl Business / Recommendation filters.
    // Only shown in the Blacklist tab, or as a warning when someone searches for that name.
    if (state.type !== 'all') return false;
    if (state.category === 'all' && !state.search.trim()) return false;
  } else if (state.type !== 'all' && fold(e.classification) !== fold(state.type)) {
    return false;
  }
  const words = fold(state.search).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold([e.name, e.brief, e.tags, e.category, e.website].join(' '));
  return words.every(w => hay.includes(w));
}

/* ---------- Render ---------- */
function render() {
  renderCategories();
  const list = state.entries.filter(matches)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const inBlacklist = isBlacklist(state.category);
  const where = state.category === 'all' ? '' : ' in ' + state.category;
  $('#resultCount').textContent = inBlacklist
    ? list.length + (list.length === 1 ? ' business' : ' businesses') + ' on the blacklist'
    : (list.length === 1 ? '1 listing' : list.length + ' listings') + where;
  $('#blNote').hidden = !inBlacklist;
  $('#grid').replaceChildren(...list.map(card));
  $('#empty').hidden = list.length > 0;
}

function renderCategories() {
  const regular = state.categories.filter(c => !isBlacklist(c));
  const black = state.categories.filter(isBlacklist);
  const byType = state.entries.filter(e => !isBlacklist(e.category)
    && (state.type === 'all' || fold(e.classification) === fold(state.type)));
  const counts = {};
  byType.forEach(e => { counts[e.category] = (counts[e.category] || 0) + 1; });
  const chip = (value, label, count, extraClass = '') => el('button', {
    class: 'cat' + extraClass, type: 'button', 'aria-pressed': String(state.category === value),
    onclick: () => {
      state.category = value;
      if (isBlacklist(value)) setType('all'); // the blacklist has no Girl Business / Recommendation split
      syncHash();
      render();
    },
  }, label, el('span', { class: 'count' }, count));
  $('#categories').replaceChildren(
    chip('all', 'All', byType.length),
    ...regular.map(c => chip(c, c, counts[c] || 0)),
    ...black.map(c => chip(c, '⚠ ' + c, state.entries.filter(e => e.category === c).length, ' cat-black')),
  );
}

function setType(type) {
  state.type = type;
  for (const x of $('#typeToggle').querySelectorAll('button')) x.setAttribute('aria-pressed', String(x.dataset.type === type));
}

function extras(e) {
  const list = (e.extra || []).filter(x => x && x.label && x.value);
  if (!list.length) return null;
  return el('dl', { class: 'extras' }, list.flatMap(x => [el('dt', {}, x.label), el('dd', {}, x.value)]));
}

function blacklistCard(e) {
  // Contact details are shown as plain text so people can recognise the business,
  // never as call / WhatsApp buttons.
  const details = [
    e.website && ['Website / social', e.website],
    e.phone && ['Phone', e.phone],
    e.email && ['Email', e.email],
    e.tags && ['Tags', e.tags],
  ].filter(Boolean);
  return el('article', { class: 'card card-black' },
    el('div', { class: 'card-top' },
      el('span', { class: 'badge badge-warn' }, svg(ICONS.warn), 'Blacklisted'),
      state.category === 'all' ? el('span', { class: 'bl-hint' }, 'Avoid') : null),
    el('h3', {}, e.name),
    e.brief ? el('p', { class: 'brief' }, e.brief) : null,
    extras(e),
    details.length ? el('dl', { class: 'extras bl-details' }, details.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])) : null,
  );
}

function card(e) {
  if (isBlacklist(e.category)) return blacklistCard(e);
  const isGirl = fold(e.classification) === 'girl business';
  const isRec = fold(e.classification) === 'recommendation';
  const badge = isGirl || isRec
    ? el('span', { class: 'badge ' + (isGirl ? 'badge-girl' : 'badge-rec') },
        el('span', { class: 'dot ' + (isGirl ? 'dot-girl' : 'dot-rec') }), isGirl ? 'Girl Business' : 'Recommendation')
    : null;

  const brief = el('p', { class: 'brief' }, e.brief);
  let more = null;
  if (e.brief && e.brief.length > 200) {
    brief.classList.add('clamped');
    more = el('button', {
      class: 'link-btn more', type: 'button',
      onclick: () => { const open = brief.classList.toggle('clamped'); more.textContent = open ? 'Read more' : 'Show less'; },
    }, 'Read more');
  }

  const tags = splitTags(e.tags);
  return el('article', { class: 'card' },
    el('div', { class: 'card-top' },
      el('span', { class: 'cat-label' }, e.category),
      badge),
    el('h3', {}, e.name),
    e.brief ? brief : null,
    more,
    tags.length ? el('div', { class: 'tags' }, tags.map(t => el('button', {
      class: 'tag', type: 'button', title: 'Search for ' + t,
      onclick: () => { state.search = t; $('#search').value = t; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    }, t))) : null,
    extras(e),
    contacts(e),
  );
}

function splitTags(s) {
  return String(s || '').split(/[,;\n]/).map(t => t.trim()).filter(Boolean);
}

function contacts(e) {
  const items = [];

  for (const link of parseLinks(e.website)) {
    if (link.href) {
      items.push(el('a', { class: 'contact', href: link.href, target: '_blank', rel: 'noopener noreferrer' },
        svg(link.icon === 'insta' ? ICONS.insta : ICONS.globe), el('span', {}, link.text)));
    } else {
      items.push(el('span', { class: 'contact-text' }, link.text));
    }
  }

  const phones = parsePhones(e.phone);
  for (const p of phones) {
    const who = p.label && !/whats\s*app/i.test(p.label) ? ' ' + p.label : '';
    if (!p.waOnly) {
      items.push(el('a', { class: 'contact', href: 'tel:+' + p.digits, title: p.display },
        svg(ICONS.phone), el('span', {}, phones.length > 1 && who ? 'Call' + who : p.display)));
    }
    items.push(el('a', { class: 'contact wa', href: 'https://wa.me/' + p.digits, target: '_blank', rel: 'noopener noreferrer', title: 'WhatsApp ' + p.display },
      svg(ICONS.wa), el('span', {}, 'WhatsApp' + who)));
  }
  if (!phones.length && e.phone) items.push(el('span', { class: 'contact-text' }, e.phone));

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e.email || '').trim())) {
    items.push(el('a', { class: 'contact', href: 'mailto:' + e.email.trim() }, svg(ICONS.mail), el('span', {}, e.email.trim())));
  } else if (e.email) {
    items.push(el('span', { class: 'contact-text' }, e.email));
  }

  return items.length ? el('div', { class: 'contacts' }, items) : null;
}

// "254 713 163 893 (Mumi) / 254 77 08 13 111 (Nelly)" → two numbers with labels
function parsePhones(s) {
  return String(s || '').split(/\s*[\/;,\n]\s*/).map(part => {
    const label = (part.match(/\(([^)]+)\)/) || [])[1] || '';
    const display = part.replace(/\([^)]*\)/g, '').trim();
    let digits = display.replace(/\D/g, '');
    if (digits.length < 7) return null;
    if (digits.startsWith('0') && digits.length === 10) digits = '254' + digits.slice(1); // local Kenyan format
    return { display, label: label.trim(), digits, waOnly: /whats\s*app/i.test(label) };
  }).filter(Boolean);
}

// "https://…", "@handle (Instagram)", "@handle (TikTok)", "site.co.ke"
function parseLinks(s) {
  return String(s || '').split(/\s*[\n,]\s*|\s+\/\s+/).map(raw => {
    raw = raw.trim();
    if (!raw) return null;
    const note = ((raw.match(/\(([^)]+)\)/) || [])[1] || '').toLowerCase();
    const v = raw.replace(/\([^)]*\)/g, '').trim();
    if (/^https?:\/\/\S+$/i.test(v)) {
      const isInsta = /instagram\.com/i.test(v);
      return { href: v, text: prettyUrl(v), icon: isInsta ? 'insta' : 'web' };
    }
    const handle = v.match(/^@([\w.]+)$/);
    if (handle) {
      if (note.includes('tiktok')) return { href: 'https://www.tiktok.com/@' + handle[1], text: v + ' · TikTok', icon: 'web' };
      if (note.includes('facebook')) return { href: 'https://www.facebook.com/' + handle[1], text: v + ' · Facebook', icon: 'web' };
      return { href: 'https://www.instagram.com/' + handle[1] + '/', text: v, icon: 'insta' };
    }
    if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v)) return { href: 'https://' + v, text: v, icon: 'web' };
    return { href: null, text: raw };
  }).filter(Boolean);
}

function prettyUrl(u) {
  return u.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
}

/* ---------- Add form ---------- */
const dialog = $('#addDialog');
const form = $('#addForm');

function openAdd() {
  form.reset();
  $('#formError').hidden = true;
  $('#dupWarning').hidden = true;
  const sel = $('#categorySelect');
  sel.replaceChildren(
    el('option', { value: '' }, 'Choose a category…'),
    ...state.categories.map(c => el('option', { value: c }, c)),
  );
  if (state.category !== 'all') sel.value = state.category;
  updateFormForCategory();
  dialog.showModal();
}

function updateFormForCategory() {
  const bl = isBlacklist($('#categorySelect').value);
  $('#classField').hidden = bl;
  $('#briefLabel').textContent = bl ? 'What happened?' : 'Brief';
  $('#briefInput').placeholder = bl
    ? 'Briefly and factually: what went wrong, and roughly when.'
    : 'What they do, where they are, price range, why you’d recommend them…';
  $('#formFine').textContent = bl
    ? 'Stick to what you experienced. Admins may remove entries.'
    : 'Add at least one way to contact them.';
  $('#submitBtn').textContent = bl ? 'Add to blacklist' : 'Add to directory';
  form.classList.toggle('is-blacklist', bl);
}

function closeAdd() { dialog.close(); }

const nameKey = s => fold(s).replace(/[^a-z0-9]/g, '');

function checkDuplicate() {
  const key = nameKey($('#nameInput').value);
  const warn = $('#dupWarning');
  if (key.length < 3) { warn.hidden = true; return; }
  const hit = state.entries.find(e => {
    const k = nameKey(e.name);
    return k === key || (key.length >= 5 && (k.includes(key) || key.includes(k)) && k.length >= 5);
  });
  if (hit) {
    warn.textContent = isBlacklist(hit.category)
      ? '⚠ "' + hit.name + '" is on the blacklist.'
      : 'Already listed? "' + hit.name + '" is in ' + hit.category + '.';
    warn.hidden = false;
  } else {
    warn.hidden = true;
  }
}

async function submitAdd(ev) {
  ev.preventDefault();
  const fd = new FormData(form);
  const entry = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v).trim()]));
  const err = $('#formError');

  const bl = isBlacklist(entry.category);
  if (bl) delete entry.classification;

  const missing = [];
  if (!bl && !entry.classification) missing.push('whether it’s a Girl Business or a Recommendation');
  if (!entry.category) missing.push('a category');
  if (!entry.name) missing.push('the business name');
  if (!entry.brief) missing.push(bl ? 'what happened' : 'a short brief');
  if (!bl && !entry.phone && !entry.email && !entry.website) missing.push('at least one way to contact them');
  if (missing.length) {
    err.textContent = 'Please add ' + missing.join(', ') + '.';
    err.hidden = false;
    return;
  }
  if (entry.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.email)) {
    err.textContent = 'That email address doesn’t look right.';
    err.hidden = false;
    return;
  }

  err.hidden = true;
  const btn = $('#submitBtn');
  btn.disabled = true;
  btn.textContent = 'Adding…';
  try {
    const res = await api({ action: 'add', entry });
    if (res.error === 'passcode') { closeAdd(); return showGate(res.message); }
    if (res.error) throw new Error(res.message || 'Something went wrong.');
    closeAdd();
    toast(bl ? 'Added "' + entry.name + '" to the blacklist' : 'Added "' + entry.name + '" to ' + entry.category + ' 💕');
    state.category = entry.category;
    state.search = '';
    $('#search').value = '';
    syncHash();
    await load({ quiet: true });
  } catch (e) {
    err.textContent = e.message || 'Something went wrong. Please try again.';
    err.hidden = false;
  } finally {
    btn.disabled = false;
    updateFormForCategory();
  }
}

/* ---------- Passcode gate ---------- */
function showGate(message) {
  $('#gate').hidden = false;
  $('#gateMsg').textContent = message || '';
  $('#gateInput').value = '';
  $('#gateInput').focus();
}

$('#gateForm').addEventListener('submit', ev => {
  ev.preventDefault();
  state.passcode = $('#gateInput').value.trim();
  store.set('gd_passcode', state.passcode);
  $('#gateMsg').textContent = 'Checking…';
  load();
});

/* ---------- Toast ---------- */
let toastTimer;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ---------- URL hash: share a link to a category, e.g. #Beauty%20and%20Wellness ---------- */
function syncHash() {
  const h = state.category === 'all' ? '' : '#' + encodeURIComponent(state.category);
  history.replaceState(null, '', location.pathname + location.search + h);
}
function readHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h) state.category = h;
}

/* ---------- Wire up ---------- */
let searchTimer;
$('#search').addEventListener('input', ev => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.search = ev.target.value; render(); }, 120);
});

$('#typeToggle').addEventListener('click', ev => {
  const b = ev.target.closest('button[data-type]');
  if (!b) return;
  setType(b.dataset.type);
  // Filtering by type only makes sense outside the blacklist
  if (b.dataset.type !== 'all' && isBlacklist(state.category)) { state.category = 'all'; syncHash(); }
  render();
});

$('#addBtn').addEventListener('click', openAdd);
$('#emptyAdd').addEventListener('click', openAdd);
$('#closeDialog').addEventListener('click', closeAdd);
dialog.addEventListener('click', ev => { if (ev.target === dialog) closeAdd(); });
$('#nameInput').addEventListener('input', checkDuplicate);
$('#categorySelect').addEventListener('change', updateFormForCategory);
form.addEventListener('submit', submitAdd);

document.body.append(el('button', { class: 'btn btn-primary fab', type: 'button', onclick: openAdd, 'aria-label': 'Add a business' }, '+ Add'));

if (state.demo) {
  showBanner('Preview mode: showing made-up sample listings. Paste your Apps Script URL into app.js to connect your Google Sheet.');
}
state.passcode = store.get('gd_passcode');
readHash();
load();

/* ---------- Demo data (only used when API_URL is empty) ---------- */
function demoApi(body) {
  const db = demoApi.db || (demoApi.db = [
    { name: 'Beauty and Wellness', entries: [
      { id: 'd1', name: 'Petal Nail Bar', brief: 'Gel manicures, pedicures and nail art in a calm studio. Around 2,500–4,000 KSh. Book on WhatsApp.', classification: 'Girl Business', tags: 'Nails, Pedicure, Kilimani', website: '@petalnails.example (Instagram)', phone: '254 700 000 001', email: '' },
      { id: 'd2', name: 'Sunrise Yoga Studio', brief: 'Small-group and private yoga, including prenatal classes on weekends.', classification: 'Recommendation', tags: 'Yoga, Fitness, Prenatal', website: 'https://example.com', phone: '254 700 000 002 (Studio) / 254 700 000 003 (Whatsapp)', email: 'hello@example.com' },
    ] },
    { name: 'Food and Catering', entries: [
      { id: 'd3', name: 'Mama Pili Kitchen', brief: 'Home-style catering for birthdays and office lunches, from 20 to 150 guests. Swahili and continental menus.', classification: 'Girl Business', tags: 'Catering, Events, Swahili food', website: '@mamapili.example (Instagram)', phone: '254 700 000 004', email: 'orders@example.com' },
    ] },
    { name: 'Legal and Finance', entries: [
      { id: 'd4', name: 'Example & Co Advocates', brief: 'Conveyancing, company registration and employment contracts. Very responsive and clear on fees.', classification: 'Recommendation', tags: 'Lawyer, Property, Company registration', website: '', phone: '254 700 000 005', email: 'info@example.com' },
    ] },
    { name: 'Transport', entries: [
      { id: 'd5', name: 'Grace — Driver', brief: 'Reliable driver for airport runs and school pickups. Clean car, always on time.', classification: 'Recommendation', tags: 'Driver, Airport, School runs', website: '', phone: '254 700 000 006', email: '' },
    ] },
    { name: 'Home and Property', entries: [] },
    { name: 'Blacklist', entries: [
      { id: 'd6', name: 'Quickfix Example Repairs', brief: 'Took a deposit for sofa repairs, never delivered and stopped answering calls.', classification: '', tags: '', website: '', phone: '254 700 000 099', email: '', extra: [{ label: 'Reported by', value: 'A member, Sept 2026' }] },
    ] },
  ]);
  return new Promise(resolve => setTimeout(() => {
    if (body.action === 'list') return resolve({ ok: true, categories: db, updated: new Date().toISOString() });
    if (body.action === 'add') {
      const cat = db.find(c => c.name === body.entry.category);
      if (!cat) return resolve({ error: 'invalid', message: 'Please choose a category.' });
      if (cat.entries.some(e => nameKey(e.name) === nameKey(body.entry.name))) {
        return resolve({ error: 'duplicate', message: '"' + body.entry.name + '" is already listed under ' + cat.name + '.' });
      }
      cat.entries.push({ ...body.entry, id: 'd' + Date.now() });
      return resolve({ ok: true });
    }
    resolve({ error: 'bad_request' });
  }, 350));
}
