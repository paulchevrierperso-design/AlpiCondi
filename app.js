(() => {
'use strict';
const $ = id => document.getElementById(id);
const STORE = 'veille-goulottes-v3';
const ORIS = ['NW', 'N', 'NE', 'W', '', 'E', 'SW', 'S', 'SE'];
const ORI_FR = { N: 'N', NE: 'NE', E: 'E', SE: 'SE', S: 'S', SW: 'SO', W: 'O', NW: 'NO' };
let routes = [];
let currentId = null;
const cache = {};
const isServed = /^https?:$/.test(location.protocol);

// ---------- utilitaires ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const api = p => new URL(p, location.origin).href;
function status(id, msg, cls = '') { const e = $(id); e.textContent = msg; e.className = 'status ' + cls; }
async function getJSON(url, timeout = 15000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctl.signal });
    let body = null; try { body = await r.json(); } catch {}
    if (!r.ok) { const e = new Error((body && body.error) || 'HTTP ' + r.status); e.body = body; throw e; }
    return body;
  } catch (e) { if (e.name === 'AbortError') throw new Error('délai dépassé'); throw e; }
  finally { clearTimeout(t); }
}
const cur = () => routes.find(r => r.id === currentId) || null;

// ---------- stockage ----------
async function load() {
  try { routes = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { routes = null; }
  if (!Array.isArray(routes)) {
    try { const d = await getJSON('config/routes.json'); routes = Array.isArray(d) ? d : []; } catch { routes = []; }
  }
  routes.forEach(r => { r.id ||= uid(); });
}
let saveTimer;
function persist() {
  localStorage.setItem(STORE, JSON.stringify(routes));
  $('saveState').textContent = 'Enregistré';
  clearTimeout(saveTimer); saveTimer = setTimeout(() => $('saveState').textContent = '', 1500);
}

// ---------- carte ----------
const map = L.map('map', { zoomControl: true }).setView([42.75, 0.3], 9);
const ign = layer => L.tileLayer(`https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=normal&TILEMATRIXSET=PM&FORMAT=${layer.includes('ORTHO') ? 'image/jpeg' : 'image/png'}&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`, { maxZoom: 19, attribution: '© IGN Géoplateforme' });
const bases = {
  'OpenTopoMap': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© OpenTopoMap (CC-BY-SA), © OSM' }),
  'OpenStreetMap': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© contributeurs OpenStreetMap' }),
  'Plan IGN': ign('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2'),
  'Photos aériennes IGN': ign('ORTHOIMAGERY.ORTHOPHOTOS')
};
bases['OpenTopoMap'].addTo(map);
const markers = L.layerGroup().addTo(map);
const c2cLayer = L.layerGroup().addTo(map);
L.control.layers(bases, { 'Mes voies': markers, 'Itinéraires C2C': c2cLayer }).addTo(map);
L.control.scale({ imperial: false }).addTo(map);

function color(r) {
  const c = cache[r.id]; if (!c || c.score == null) return '#8a94a6';
  return c.score >= 65 ? '#12805c' : c.score >= 40 ? '#b86a00' : '#c8332b';
}
function icon(r, active) {
  const s = active ? 22 : 16;
  return L.divIcon({ className: '', iconSize: [s, s], iconAnchor: [s / 2, s / 2],
    html: `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${color(r)};border:3px solid ${active ? '#1f63d6' : '#fff'};box-shadow:0 1px 4px #0006"></div>` });
}
function drawMarkers() {
  markers.clearLayers();
  routes.forEach(r => {
    const lat = num(r.lat), lon = num(r.lon); if (lat == null || lon == null) return;
    const m = L.marker([lat, lon], { icon: icon(r, r.id === currentId), draggable: r.id === currentId, title: r.name || 'Voie' });
    m.bindTooltip(esc(r.name || 'Voie sans nom'));
    m.on('click', () => select(r.id));
    m.on('dragend', e => { const p = e.target.getLatLng(); setPos(r, p.lat, p.lng); });
    markers.addLayer(m);
  });
}
function setPos(r, lat, lon) {
  r.lat = lat.toFixed(5); r.lon = lon.toFixed(5);
  if (r.id === currentId) { $('lat').value = r.lat; $('lon').value = r.lon; }
  delete cache[r.id]; persist(); drawMarkers(); renderList(); updateDaLink();
}
map.on('click', e => {
  const r = cur();
  if (!r) { status('mapHint', 'Créer ou sélectionner une voie avant de cliquer sur la carte.', 'warn'); return; }
  setPos(r, e.latlng.lat, e.latlng.lng);
  status('mapHint', `« ${r.name || 'Voie'} » positionnée. Renseigner altitude et exposition.`, 'ok');
});

// Recherche de lieu (Nominatim)
async function placeSearch() {
  const q = $('place').value.trim(); $('placeResults').innerHTML = '';
  if (q.length < 3) return;
  try {
    const d = await getJSON('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=fr&q=' + encodeURIComponent(q));
    if (!d.length) { $('placeResults').innerHTML = '<div class="muted">Aucun lieu trouvé.</div>'; return; }
    d.forEach(p => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ritem';
      b.innerHTML = `<b>${esc(p.name || p.display_name.split(',')[0])}</b><small>${esc(p.display_name)}</small>`;
      b.addEventListener('click', () => { map.setView([+p.lat, +p.lon], 14); $('placeResults').innerHTML = ''; });
      $('placeResults').appendChild(b);
    });
  } catch (e) { $('placeResults').innerHTML = `<div class="bad">Recherche de lieu indisponible : ${esc(e.message)}</div>`; }
}

// Itinéraires C2C autour du centre de la carte
async function showC2C() {
  if (!isServed) return status('mapHint', 'Fonction disponible une fois l\'application hébergée.', 'warn');
  const c = map.getCenter();
  status('mapHint', 'Recherche des itinéraires Camptocamp…');
  try {
    const d = await getJSON(api(`/api/routes?lat=${c.lat}&lon=${c.lng}&radius=6000`));
    c2cLayer.clearLayers();
    (d.results || []).forEach(it => {
      if (it.lat == null) return;
      const m = L.circleMarker([it.lat, it.lon], { radius: 6, color: '#7a3db8', weight: 2, fillOpacity: .6 });
      const box = document.createElement('div');
      box.innerHTML = `<b>${esc(it.title)}</b><br>${it.elevation_max ? esc(it.elevation_max) + ' m · ' : ''}${esc((it.orientations || []).join('/'))} ${esc([it.global_rating, it.ice_rating, it.mixed_rating].filter(Boolean).join(' '))}<br><a href="https://www.camptocamp.org/routes/${esc(it.id)}" target="_blank" rel="noopener">Fiche C2C</a><br>`;
      const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Créer une voie depuis cet itinéraire';
      b.addEventListener('click', () => { addRoute({ name: it.title, lat: String(it.lat), lon: String(it.lon), alt: it.elevation_max ? String(it.elevation_max) : '', ori: (it.orientations || [])[0] || '', c2cId: String(it.id) }); map.closePopup(); });
      box.appendChild(b); m.bindPopup(box); c2cLayer.addLayer(m);
    });
    status('mapHint', `${(d.results || []).length} itinéraire(s) glace/mixte C2C affiché(s) (violet). Cliquer pour importer.`, 'ok');
  } catch (e) { status('mapHint', 'Camptocamp indisponible : ' + e.message, 'bad'); }
}

// ---------- liste & éditeur ----------
function pill(r) {
  const c = cache[r.id];
  if (!c || c.score == null) return '<span class="pill">—</span>';
  const cls = c.score >= 65 ? 'p-green' : c.score >= 40 ? 'p-amber' : 'p-red';
  return `<span class="pill ${cls}">${c.score}</span>`;
}
function renderList() {
  const box = $('routeList'); box.innerHTML = '';
  $('noRoute').classList.toggle('hidden', routes.length > 0);
  routes.forEach(r => {
    const b = document.createElement('button'); b.type = 'button';
    b.className = 'ritem' + (r.id === currentId ? ' active' : '');
    const pos = num(r.lat) != null ? '' : ' · <span class="bad">non positionnée</span>';
    b.innerHTML = `<div style="display:flex;justify-content:space-between;gap:6px"><b>${esc(r.name || 'Voie sans nom')}</b>${pill(r)}</div>
      <small>${r.alt ? esc(r.alt) + ' m' : 'alt. ?'} · ${r.ori ? ORI_FR[r.ori] : 'expo ?'}${pos}</small>
      ${cache[r.id] && cache[r.id].headline ? `<small style="display:block">${esc(cache[r.id].headline)}</small>` : ''}`;
    b.addEventListener('click', () => select(r.id));
    box.appendChild(b);
  });
}
function renderOri(val) {
  const box = $('oriBtns'); box.innerHTML = '';
  ORIS.forEach(o => {
    if (!o) { box.appendChild(document.createElement('span')); return; }
    const b = document.createElement('button'); b.type = 'button'; b.textContent = ORI_FR[o];
    b.className = o === val ? 'on' : ''; b.setAttribute('aria-pressed', o === val);
    b.addEventListener('click', () => { const r = cur(); r.ori = r.ori === o ? '' : o; renderOri(r.ori); delete cache[r.id]; persist(); renderList(); });
    box.appendChild(b);
  });
}
const EDIT = ['name', 'lat', 'lon', 'alt', 'massif', 'c2cId', 'notes'];
function fillEditor() {
  const r = cur();
  ['editor', 'wxCard', 'bottom', 'decCard'].forEach(id => $(id).classList.toggle('hidden', !r));
  if (!r) return;
  EDIT.forEach(f => $(f).value = r[f] ?? '');
  renderOri(r.ori || ''); updateDaLink();
}
function updateDaLink() {
  const r = cur(); const lat = r && num(r.lat), lon = r && num(r.lon);
  $('daLink').href = lat != null ? `https://www.data-avalanche.org/?lat=${lat}&lng=${lon}&zoom=13` : 'https://www.data-avalanche.org/';
}
EDIT.forEach(f => $(f).addEventListener('input', () => {
  const r = cur(); if (!r) return;
  r[f] = $(f).value.trim();
  if (f !== 'name' && f !== 'notes') delete cache[r.id];
  persist(); renderList();
  if (f === 'lat' || f === 'lon') { drawMarkers(); updateDaLink(); }
}));
function select(id) {
  currentId = id; renderList(); fillEditor(); drawMarkers();
  const r = cur();
  if (r && num(r.lat) != null) map.setView([num(r.lat), num(r.lon)], Math.max(map.getZoom(), 13));
  status('mapHint', r && num(r.lat) == null ? 'Cliquer sur la carte pour positionner cette voie.' : 'Marqueur déplaçable pour ajuster la position.', r && num(r.lat) == null ? 'warn' : 'muted');
  const c = r && cache[r.id];
  if (c) showAnalysis(c); else resetPanels();
}
function addRoute(init = {}) {
  const r = { id: uid(), name: init.name || 'Nouvelle voie ' + (routes.length + 1), lat: init.lat || '', lon: init.lon || '', alt: init.alt || '', ori: init.ori || '', massif: '', c2cId: init.c2cId || '', notes: '' };
  routes.push(r); persist(); select(r.id);
  if (!init.name) { $('name').focus(); $('name').select(); }
}
function deleteRoute() {
  const r = cur(); if (!r) return;
  if (!confirm(`Supprimer « ${r.name || 'cette voie'} » ?`)) return;
  routes = routes.filter(x => x.id !== r.id); delete cache[r.id]; currentId = null;
  persist(); renderList(); fillEditor(); drawMarkers();
}
function resetPanels() {
  $('formation').innerHTML = '<span class="muted">Positionner la voie, renseigner altitude et exposition, puis analyser.</span>';
  $('chart').textContent = '—'; $('outings').innerHTML = ''; status('outStatus', '');
  $('bera').textContent = '—'; $('decision').textContent = 'Analyse non lancée.'; $('decision').style.borderLeftColor = '';
}

// ---------- météo & modèle ----------
async function fetchWeather(lat, lon, alt) {
  const p = new URLSearchParams({ latitude: lat, longitude: lon, timezone: 'Europe/Paris', past_days: '14', forecast_days: '4',
    hourly: 'temperature_2m,precipitation,snowfall,wind_speed_10m' });
  if (alt != null) p.set('elevation', alt);
  const d = await getJSON('https://api.open-meteo.com/v1/forecast?' + p, 20000);
  const h = d.hourly;
  return h.time.map((t, i) => ({ t: new Date(t), T: h.temperature_2m[i], P: h.precipitation[i] || 0, S: h.snowfall[i] || 0, w: h.wind_speed_10m[i] || 0 })).filter(x => x.T != null);
}
function formationModel(rows, ori) {
  const now = Date.now(), H = 3600e3;
  const past = h => rows.filter(r => r.t <= now && r.t > now - h * H);
  const fut = rows.filter(r => r.t > now && r.t <= now + 72 * H);
  const p10 = past(240), p14 = past(336), p72 = past(72);
  const fdh = p10.reduce((s, r) => s + Math.max(0, -r.T), 0);
  const precip = p14.reduce((s, r) => s + r.P, 0);
  const snow = p14.reduce((s, r) => s + r.S, 0);
  const warmH = p72.filter(r => r.T > 1).length;
  const days = {}; p10.forEach(r => { const k = r.t.toDateString(); (days[k] ||= []).push(r.T); });
  const cycles = Object.values(days).filter(v => Math.min(...v) <= -2 && Math.max(...v) >= 1).length;
  const futMin = fut.length ? Math.min(...fut.map(r => r.T)) : null;
  const futMax = fut.length ? Math.max(...fut.map(r => r.T)) : null;
  const futCold = fut.filter(r => r.T < -2).length;
  const windMax = fut.length ? Math.max(...fut.map(r => r.w)) : 0;
  const shady = ['N', 'NE', 'NW'].includes(ori), sunny = ['S', 'SE', 'SW'].includes(ori);
  let s = clamp(fdh / 1200, 0, 1) * 40 + clamp(precip / 35, 0, 1) * 20 + clamp(cycles / 4, 0, 1) * 15 + clamp(futCold / 48, 0, 1) * 15
        - clamp(warmH / 24, 0, 1) * 30 - (futMax != null && futMax > 3 ? 10 : 0) - (snow > 60 ? 8 : 0) + (shady ? 10 : sunny ? -10 : 0);
  const score = Math.round(clamp(s, 0, 100));
  const notes = [];
  if (!ori) notes.push('exposition non renseignée : non prise en compte');
  if (fdh < 300) notes.push('froid accumulé insuffisant');
  if (precip < 8) notes.push('peu d\'humidité récente : ligne probablement sèche');
  if (warmH > 12) notes.push('redoux récent : glace possiblement dégradée');
  if (cycles >= 2) notes.push('cycles gel/dégel favorables à la transformation');
  if (futMax != null && futMax > 3) notes.push('redoux annoncé dans les 72 h');
  if (snow > 60) notes.push('fort cumul de neige récent');
  if (windMax > 50) notes.push(`vent fort prévu (${Math.round(windMax)} km/h) : transport de neige`);
  return { score, fdh: Math.round(fdh), precip: Math.round(precip), snow: Math.round(snow), warmH, cycles, futMin, futMax, notes };
}
function drawChart(rows) {
  if (!rows.length) { $('chart').textContent = 'Pas de données.'; return; }
  const W = 1000, Hh = 260, pl = 40, pr = 10, pt = 14, pb = 26;
  const t0 = +rows[0].t, t1 = +rows[rows.length - 1].t;
  const Ts = rows.map(r => r.T); const tmin = Math.floor(Math.min(...Ts, -10)), tmax = Math.ceil(Math.max(...Ts, 5));
  const pmax = Math.max(2, ...rows.map(r => r.P));
  const X = t => pl + (t - t0) / (t1 - t0) * (W - pl - pr);
  const Y = v => pt + (tmax - v) / (tmax - tmin) * (Hh - pt - pb);
  const YP = v => Hh - pb - v / pmax * (Hh - pt - pb) * 0.5;
  let svg = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Température et précipitations">`;
  for (let v = Math.ceil(tmin / 5) * 5; v <= tmax; v += 5) svg += `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="currentColor" opacity=".12"/><text x="4" y="${Y(v) + 4}">${v}°</text>`;
  svg += `<line x1="${pl}" x2="${W - pr}" y1="${Y(0)}" y2="${Y(0)}" stroke="#c8332b" stroke-dasharray="4 4"/>`;
  const bw = Math.max(1, (W - pl - pr) / rows.length);
  rows.forEach(r => { if (r.P > 0) svg += `<rect x="${X(+r.t)}" y="${YP(r.P)}" width="${bw}" height="${Hh - pb - YP(r.P)}" fill="${r.S > 0 ? '#7fb3ff' : '#3a8fd9'}" opacity=".75"/>`; });
  svg += `<polyline fill="none" stroke="#1f63d6" stroke-width="2" points="${rows.map(r => X(+r.t).toFixed(1) + ',' + Y(r.T).toFixed(1)).join(' ')}"/>`;
  const now = Date.now();
  if (now > t0 && now < t1) svg += `<line x1="${X(now)}" x2="${X(now)}" y1="${pt}" y2="${Hh - pb}" stroke="#b86a00" stroke-width="2"/><text x="${X(now) + 4}" y="${pt + 10}">maintenant</text>`;
  for (let t = t0; t <= t1; t += 2 * 86400e3) { const d = new Date(t); svg += `<text x="${X(t)}" y="${Hh - 8}">${d.getDate()}/${d.getMonth() + 1}</text>`; }
  $('chart').innerHTML = svg + '</svg><div class="muted" style="font-size:12px">Courbe : température horaire à l\'altitude saisie · barres : précipitations (bleu clair = neige) · pointillé : 0 °C. Source : Open-Meteo.</div>';
}

// ---------- sorties & BERA ----------
const COND = { excellent: ['Excellentes', 'p-green'], good: ['Bonnes', 'p-green'], average: ['Moyennes', 'p-amber'], poor: ['Mauvaises', 'p-red'], awful: ['Exécrables', 'p-red'] };
async function fetchOutings(r) {
  if (!isServed) throw new Error('disponible une fois l\'application hébergée');
  const mode = $('outMode').value;
  let url;
  if (mode === 'route' && /^\d+$/.test(r.c2cId || '')) url = '/api/outings?route=' + r.c2cId;
  else if (num(r.lat) != null) url = `/api/outings?lat=${num(r.lat)}&lon=${num(r.lon)}&radius=5000`;
  else throw new Error('voie non positionnée');
  return (await getJSON(api(url))).results || [];
}
function renderOutings(list) {
  $('outings').innerHTML = '';
  if (!list.length) { status('outStatus', 'Aucune sortie trouvée.', 'warn'); return; }
  status('outStatus', list.length + ' sortie(s), de la plus récente à la plus ancienne.', 'ok');
  list.slice(0, 12).forEach(o => {
    const age = o.date_start ? Math.round((Date.now() - new Date(o.date_start)) / 86400e3) : null;
    const c = COND[o.condition_rating];
    const el = document.createElement('div'); el.className = 'item';
    el.innerHTML = `<div><strong>${esc(o.title)}</strong><br><small>${esc(o.date_start || '?')}${age != null ? ' · il y a ' + age + ' j' : ''}</small>${o.summary ? `<div style="font-size:13px;margin-top:4px">${esc(o.summary)}</div>` : ''}</div>
      <div style="text-align:right;white-space:nowrap"><span class="pill ${age != null && age <= 7 ? 'p-green' : age != null && age <= 21 ? 'p-amber' : ''}">${age != null && age <= 7 ? 'Récente' : age != null && age <= 21 ? '< 3 sem.' : 'Ancienne'}</span><br>${c ? `<span class="pill ${c[1]}">${c[0]}</span><br>` : ''}<a href="${esc(o.url)}" target="_blank" rel="noopener" style="font-size:13px">Voir</a></div>`;
    $('outings').appendChild(el);
  });
}
async function fetchBera(massif) {
  if (!isServed) return { info: 'Disponible une fois l\'application hébergée.' };
  if (!/^\d+$/.test(massif || '')) return { info: 'ID de massif BERA non renseigné.' };
  try { return await getJSON(api('/api/bera?massif=' + massif)); }
  catch (e) { return { info: e.body && e.body.configured === false ? 'Clé API Météo-France non configurée (voir README).' : 'BERA indisponible : ' + e.message }; }
}
function renderBera(b) {
  if (!b || b.info) { $('bera').innerHTML = `<span class="muted">${esc(b ? b.info : '—')}</span>`; return; }
  const r = parseInt(b.risque_max, 10); const cls = r >= 4 ? 'p-red' : r === 3 ? 'p-amber' : r >= 1 ? 'p-green' : '';
  $('bera').innerHTML = `<div><span class="pill ${cls}" style="font-size:16px">Risque ${esc(b.risque_max || '?')}/5</span> <b>${esc(b.massif || '')}</b></div>
    <div class="muted" style="font-size:13px;margin:6px 0">Émis ${esc(b.emission || '?')} · valide jusqu'au ${esc(b.validite || '?')}</div>
    ${b.risque2 ? `<div>Risque ${esc(b.risque1)} ${esc(b.alti1 || '')} · risque ${esc(b.risque2)} ${esc(b.alti2 || '')}</div>` : ''}
    ${b.commentaire ? `<p>${esc(b.commentaire)}</p>` : ''}${b.stabilite ? `<p style="font-size:13px">${esc(b.stabilite.slice(0, 700))}</p>` : ''}`;
}

// ---------- analyse ----------
async function analyze(r, render) {
  const lat = num(r.lat), lon = num(r.lon), alt = num(r.alt);
  if (lat == null || lon == null) throw new Error('voie non positionnée');
  const [wx, outs, bera] = await Promise.all([
    fetchWeather(lat, lon, alt),
    fetchOutings(r).catch(e => ({ error: e.message })),
    fetchBera(r.massif)
  ]);
  const m = formationModel(wx, r.ori);
  const res = { score: m.score, model: m, wx, outings: outs, beraData: bera, headline: m.notes.find(n => !n.startsWith('exposition')) || 'pas de signal particulier' };
  cache[r.id] = res;
  if (render) showAnalysis(res);
  renderList(); drawMarkers();
  return res;
}
function showAnalysis(res) {
  const m = res.model;
  const col = m.score >= 65 ? 'var(--green)' : m.score >= 40 ? 'var(--amber)' : 'var(--red)';
  $('formation').innerHTML = `<div class="score" style="color:${col}">${m.score}<span style="font-size:18px">/100</span></div>
    <div class="gauge"><div style="width:${m.score}%;background:${col}"></div></div>
    <div class="kpis">
      <div class="kpi"><b>${m.fdh}</b><span>degrés-heures de gel (10 j)</span></div>
      <div class="kpi"><b>${m.precip} mm</b><span>précipitations (14 j)</span></div>
      <div class="kpi"><b>${m.snow} cm</b><span>neige fraîche (14 j)</span></div>
      <div class="kpi"><b>${m.cycles}</b><span>cycles gel/dégel (10 j)</span></div>
      <div class="kpi"><b>${m.warmH} h</b><span>au-dessus de 1 °C (72 h)</span></div>
      <div class="kpi"><b>${m.futMin != null ? Math.round(m.futMin) : '?'} / ${m.futMax != null ? Math.round(m.futMax) : '?'} °C</b><span>min / max prévus (72 h)</span></div>
    </div>
    <ul style="margin:10px 0 0;padding-left:18px">${m.notes.map(n => `<li>${esc(n)}</li>`).join('') || '<li>Pas de signal particulier.</li>'}</ul>`;
  drawChart(res.wx);
  if (Array.isArray(res.outings)) renderOutings(res.outings);
  else { $('outings').innerHTML = ''; status('outStatus', 'Sorties indisponibles : ' + res.outings.error, 'warn'); }
  renderBera(res.beraData);
  const lvl = res.beraData && parseInt(res.beraData.risque_max, 10);
  const recent = Array.isArray(res.outings) ? res.outings.filter(o => o.date_start && (Date.now() - new Date(o.date_start)) / 86400e3 <= 10).length : 0;
  let txt, c;
  if (lvl >= 4) { txt = 'Risque avalanche fort : course déconseillée quelles que soient les conditions de glace.'; c = 'var(--red)'; }
  else if (m.score >= 65 && lvl === 3) { txt = 'Formation probablement favorable, mais BERA 3 : uniquement si approche, voie et descente évitent les pentes et orientations signalées.'; c = 'var(--amber)'; }
  else if (m.score >= 65) { txt = 'Fenêtre potentiellement intéressante, à confirmer par un retour terrain récent et Data-Avalanche.'; c = 'var(--green)'; }
  else if (m.score >= 40) { txt = 'Formation incertaine : attendre un retour terrain ou une nouvelle période froide.'; c = 'var(--amber)'; }
  else { txt = 'Conditions de formation peu probables actuellement.'; c = 'var(--red)'; }
  if (recent) txt += ` ${recent} sortie(s) C2C de moins de 10 jours à consulter.`;
  if (!lvl) txt += ' BERA non intégré : vérifier le bulletin du massif.';
  $('decision').textContent = txt; $('decision').style.borderLeftColor = c;
}

// ---------- événements ----------
$('addRoute').addEventListener('click', () => addRoute());
$('delete').addEventListener('click', deleteRoute);
$('placeGo').addEventListener('click', placeSearch);
$('place').addEventListener('keydown', e => { if (e.key === 'Enter') placeSearch(); });
$('showC2C').addEventListener('click', showC2C);
$('fitAll').addEventListener('click', () => {
  const pts = routes.filter(r => num(r.lat) != null).map(r => [num(r.lat), num(r.lon)]);
  if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 13 });
});
$('analyze').addEventListener('click', async () => {
  const r = cur(); if (!r) return;
  $('decision').textContent = 'Analyse en cours…';
  try { await analyze(r, true); } catch (e) { $('decision').textContent = 'Analyse impossible : ' + e.message; }
});
$('loadOutings').addEventListener('click', async () => {
  const r = cur(); if (!r) return; status('outStatus', 'Chargement…');
  try { renderOutings(await fetchOutings(r)); } catch (e) { status('outStatus', 'Sorties indisponibles : ' + e.message, 'bad'); }
});
$('analyzeAll').addEventListener('click', async () => {
  const b = $('analyzeAll'); b.disabled = true;
  for (const r of routes) {
    b.textContent = 'Analyse : ' + (r.name || '…');
    try { await analyze(r, r.id === currentId); } catch (e) { cache[r.id] = { score: null, headline: e.message }; renderList(); }
  }
  b.disabled = false; b.textContent = 'Analyser toutes les voies';
});
$('exportCfg').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(routes, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'routes.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('importCfg').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text()); if (!Array.isArray(data)) throw 0;
    let n = 0;
    data.forEach(d => {
      if (!d || typeof d !== 'object') return;
      const r = { id: d.id || uid(), name: String(d.name || 'Voie importée'), lat: String(d.lat ?? ''), lon: String(d.lon ?? ''), alt: String(d.alt ?? ''), ori: ORI_FR[d.ori] ? d.ori : '', massif: String(d.massif ?? ''), c2cId: String(d.c2cId ?? ''), notes: String(d.notes ?? '') };
      const i = routes.findIndex(x => x.id === r.id); if (i >= 0) routes[i] = r; else routes.push(r); n++;
    });
    persist(); renderList(); drawMarkers(); $('fitAll').click();
    alert(n + ' voie(s) importée(s).');
  } catch { alert('Fichier invalide.'); }
  e.target.value = '';
});

// ---------- démarrage ----------
load().then(() => {
  renderList(); drawMarkers(); fillEditor();
  if (routes.some(r => num(r.lat) != null)) $('fitAll').click();
});
})();
