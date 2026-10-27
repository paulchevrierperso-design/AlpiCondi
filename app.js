(() => {
'use strict';
const $ = id => document.getElementById(id);
const STORE = 'veille-goulottes-v2';
const FIELDS = ['query', 'c2cId', 'lat', 'lon', 'alt', 'ori', 'massif'];
let routes = [], current = 0;
const cache = {};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = v => Math.round(v * 10) / 10;
function status(id, msg, cls = '') { const e = $(id); e.textContent = msg; e.className = 'status ' + cls; }
async function getJSON(url, timeout = 15000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctl.signal });
    let body = null; try { body = await r.json(); } catch {}
    if (!r.ok) { const err = new Error((body && (body.error || body.reason)) || 'HTTP ' + r.status); err.body = body; throw err; }
    return body;
  } catch (e) { if (e.name === 'AbortError') throw new Error('délai dépassé'); throw e; }
  finally { clearTimeout(t); }
}
const api = p => new URL(p, location.origin).href;
const isServed = /^https?:$/.test(location.protocol);

// ---------- vent : utilitaires ----------
const SECT = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const SECT_FR = { N: 'N', NE: 'NE', E: 'E', SE: 'SE', S: 'S', SW: 'SO', W: 'O', NW: 'NO' };
const sector = d => SECT[Math.round(((d % 360) + 360) % 360 / 45) % 8];
const opposite = s => SECT[(SECT.indexOf(s) + 4) % 8];
const WCLS = [
  { max: 20, col: '#7fc97f', lab: '< 20 km/h · faible' },
  { max: 40, col: '#f2c84b', lab: '20–40 · modéré (transport possible)' },
  { max: 60, col: '#f08a3c', lab: '40–60 · fort (transport actif)' },
  { max: 1e9, col: '#d7301f', lab: '> 60 · très fort' }
];
const wcol = v => WCLS.find(c => v < c.max).col;
function meanDir(rows) { // moyenne vectorielle pondérée par la vitesse
  let x = 0, y = 0;
  rows.forEach(r => { if (r.wd == null || r.w == null) return; x += r.w * Math.sin(r.wd * Math.PI / 180); y += r.w * Math.cos(r.wd * Math.PI / 180); });
  if (!x && !y) return null;
  return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
}

// ---------- précipitations : échelle ----------
const PCLS = [
  { max: 1, col: 'transparent', lab: '< 1 mm' },
  { max: 5, col: '#cfe3f7', lab: '1–5 mm/j · faible' },
  { max: 15, col: '#8fbfea', lab: '5–15 · modéré' },
  { max: 30, col: '#3f86cf', lab: '15–30 · fort' },
  { max: 1e9, col: '#1d3f8f', lab: '> 30 · très fort' }
];
const pcls = v => PCLS.find(c => v < c.max);

// ---------- configuration ----------
async function loadConfig() {
  let defaults = []; try { defaults = await getJSON('config/routes.json'); } catch {}
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch {}
  routes = defaults.map(r => ({ ...r, ...(saved[r.key] || {}) }));
}
function persist() { const o = {}; routes.forEach(r => { o[r.key] = Object.fromEntries(FIELDS.map(f => [f, r[f] ?? ''])); }); localStorage.setItem(STORE, JSON.stringify(o)); }
function readForm() { const r = routes[current]; FIELDS.forEach(f => r[f] = $(f).value.trim()); }
function fillForm() {
  const r = routes[current]; $('title').textContent = r.name; FIELDS.forEach(f => $(f).value = r[f] ?? '');
  $('c2cLink').href = r.c2cId ? 'https://www.camptocamp.org/routes/' + encodeURIComponent(r.c2cId) : 'https://www.camptocamp.org/routes#q=' + encodeURIComponent(r.query || '');
}

// ---------- onglets / vue d'ensemble ----------
function renderTabs() {
  $('tabs').innerHTML = '';
  routes.forEach((r, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'tab' + (i === current ? ' active' : ''); b.textContent = r.name; b.addEventListener('click', () => select(i)); $('tabs').appendChild(b); });
}
function levelPill(s) {
  if (s == null) return '<span class="pill">Non analysée</span>';
  if (s >= 65) return `<span class="pill p-green">Favorable · ${s}</span>`;
  if (s >= 40) return `<span class="pill p-amber">Incertaine · ${s}</span>`;
  return `<span class="pill p-red">Défavorable · ${s}</span>`;
}
function renderOverview() {
  $('overview').innerHTML = '';
  routes.forEach((r, i) => {
    const c = cache[r.key]; const d = document.createElement('div'); d.className = 'ov'; d.tabIndex = 0;
    const ok = num(r.lat) != null && num(r.lon) != null;
    d.innerHTML = `<h4>${esc(r.name)}</h4>${levelPill(c ? c.score : null)}
      <div class="muted" style="font-size:13px;margin-top:6px">${ok ? '' : 'Coordonnées à renseigner · '}${c ? esc(c.headline) : ''}</div>
      ${c && c.model ? `<div style="font-size:13px;margin-top:4px">Précip. 7 j : ${c.model.cum.p7} mm · vent max 72 h : ${c.model.windMax} km/h</div>` : ''}
      ${c && c.lastOuting ? `<div style="font-size:13px">Dernière sortie C2C : ${esc(c.lastOuting)}</div>` : ''}
      ${c && c.bera ? `<div style="font-size:13px">BERA : ${esc(c.bera)}</div>` : ''}`;
    d.addEventListener('click', () => select(i)); d.addEventListener('keydown', e => { if (e.key === 'Enter') select(i); });
    $('overview').appendChild(d);
  });
}
function select(i) {
  readForm(); persist(); current = i; renderTabs(); fillForm();
  $('searchResults').innerHTML = ''; status('searchStatus', ''); $('routeInfo').textContent = '';
  const c = cache[routes[i].key]; if (c && c.model) showAnalysis(c); else resetPanels();
}
function resetPanels() {
  $('formation').innerHTML = '<span class="muted">Renseigner latitude, longitude et altitude puis lancer l\'analyse.</span>';
  $('chart').textContent = '—'; $('cumTable').innerHTML = ''; $('roses').innerHTML = '';
  $('outings').innerHTML = ''; status('outStatus', ''); $('bera').textContent = '—';
  $('decision').textContent = 'Analyse non lancée.'; $('decision').style.borderLeftColor = '';
}

// ---------- Camptocamp ----------
async function searchC2C() {
  readForm(); const q = routes[current].query;
  if (!isServed) return status('searchStatus', 'Application à ouvrir depuis son URL web (Cloudflare Pages).', 'bad');
  if (q.length < 3) return status('searchStatus', 'Saisir au moins 3 caractères.', 'warn');
  status('searchStatus', 'Recherche en cours…'); $('searchResults').innerHTML = '';
  try {
    const list = (await getJSON(api('/api/routes?q=' + encodeURIComponent(q)))).results || [];
    if (!list.length) return status('searchStatus', 'Aucun itinéraire trouvé. Reformuler (nom du sommet seul par exemple).', 'warn');
    status('searchStatus', list.length + ' itinéraire(s). Sélectionner la bonne voie.', 'ok');
    list.forEach(it => {
      const row = document.createElement('div'); row.className = 'item';
      row.innerHTML = `<div><strong>${esc(it.title)}</strong><br><small>ID ${esc(it.id)}${it.elevation_max ? ' · ' + esc(it.elevation_max) + ' m' : ''}${it.orientations.length ? ' · ' + esc(it.orientations.join('/')) : ''}</small></div>`;
      const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Utiliser'; b.addEventListener('click', () => applyRoute(it));
      row.appendChild(b); $('searchResults').appendChild(row);
    });
  } catch (e) { status('searchStatus', 'Camptocamp indisponible : ' + e.message + '. Saisie manuelle possible.', 'bad'); }
}
function applyRoute(it) {
  const r = routes[current]; r.c2cId = String(it.id || '');
  if (it.lat != null) r.lat = String(it.lat); if (it.lon != null) r.lon = String(it.lon);
  if (it.elevation_max) r.alt = String(it.elevation_max);
  if (it.orientations && it.orientations.length) r.ori = it.orientations[0];
  fillForm(); persist(); $('searchResults').innerHTML = '';
  status('searchStatus', 'Itinéraire appliqué. Vérifier les coordonnées (point C2C parfois au sommet).', 'ok'); renderOverview();
}
async function loadRouteById() {
  readForm(); const id = routes[current].c2cId;
  if (!/^\d+$/.test(id)) return status('searchStatus', 'ID C2C numérique attendu.', 'warn');
  status('searchStatus', 'Chargement de la fiche…');
  try {
    const d = await getJSON(api('/api/routes?id=' + id)); applyRoute(d);
    $('routeInfo').textContent = [d.title, d.global_rating && 'Cotation ' + d.global_rating, d.ice_rating && 'Glace ' + d.ice_rating, d.mixed_rating && 'Mixte ' + d.mixed_rating, d.height_diff_difficulties && d.height_diff_difficulties + ' m de difficultés'].filter(Boolean).join(' · ');
  } catch (e) { status('searchStatus', 'Fiche indisponible : ' + e.message, 'bad'); }
}

// ---------- Météo Open-Meteo ----------
async function fetchWeather(lat, lon, alt) {
  const p = new URLSearchParams({ latitude: lat, longitude: lon, timezone: 'Europe/Paris', past_days: '14', forecast_days: '4', wind_speed_unit: 'kmh',
    hourly: 'temperature_2m,precipitation,rain,snowfall,freezing_level_height,wind_speed_10m,wind_direction_10m,wind_gusts_10m,wind_speed_700hPa,wind_direction_700hPa' });
  if (alt != null) p.set('elevation', alt);
  const d = await getJSON('https://api.open-meteo.com/v1/forecast?' + p.toString(), 20000);
  const h = d.hourly;
  return h.time.map((t, i) => ({
    t: new Date(t), T: h.temperature_2m[i], P: h.precipitation[i] || 0, R: h.rain[i] || 0, S: h.snowfall[i] || 0,
    w10: h.wind_speed_10m[i], wd10: h.wind_direction_10m[i], g: h.wind_gusts_10m[i],
    w700: h.wind_speed_700hPa ? h.wind_speed_700hPa[i] : null, wd700: h.wind_direction_700hPa ? h.wind_direction_700hPa[i] : null
  })).filter(x => x.T != null);
}
function windRows(rows) {
  const lvl = $('windLevel').value;
  return rows.map(r => {
    const use700 = lvl === '700' && r.w700 != null;
    return { ...r, w: use700 ? r.w700 : r.w10, wd: use700 ? r.wd700 : r.wd10 };
  });
}

// ---------- cumuls ----------
function cumuls(rows) {
  const now = Date.now(), H = 3600e3;
  const win = (a, b) => rows.filter(r => +r.t > now + a * H && +r.t <= now + b * H);
  const sum = (arr, k) => r1(arr.reduce((s, r) => s + (r[k] || 0), 0));
  const mk = (a, b) => { const w = win(a, b); return { p: sum(w, 'P'), rain: sum(w, 'R'), snow: sum(w, 'S') }; };
  return {
    past24: mk(-24, 0), past72: mk(-72, 0), past7: mk(-168, 0), past14: mk(-336, 0),
    next24: mk(0, 24), next72: mk(0, 72), next96: mk(0, 96),
    p7: sum(win(-168, 0), 'P')
  };
}
function daily(rows) {
  const m = new Map();
  rows.forEach(r => {
    const k = r.t.getFullYear() + '-' + (r.t.getMonth() + 1) + '-' + r.t.getDate();
    if (!m.has(k)) m.set(k, { start: new Date(r.t.getFullYear(), r.t.getMonth(), r.t.getDate()), P: 0, S: 0 });
    const d = m.get(k); d.P += r.P; d.S += r.S;
  });
  return [...m.values()];
}

// ---------- modèle formation ----------
function formationModel(rows, ori) {
  const now = Date.now(), H = 3600e3;
  const past = h1 => rows.filter(r => +r.t <= now && +r.t > now - h1 * H);
  const fut = rows.filter(r => +r.t > now && +r.t <= now + 72 * H);
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

  // vent
  const wPast = p72.filter(r => r.w != null), wFut = fut.filter(r => r.w != null);
  const windMax = wFut.length ? Math.max(...wFut.map(r => r.w)) : 0;
  const gustMax = fut.length ? Math.max(...fut.map(r => r.g || 0)) : 0;
  const transportPast = wPast.filter(r => r.w >= 30).length;   // h de transport probable (72 h passées)
  const transportFut = wFut.filter(r => r.w >= 30).length;
  const dirPast = meanDir(wPast), dirFut = meanDir(wFut);
  const leePast = dirPast != null ? opposite(sector(dirPast)) : null; // versant sous le vent
  const leeFut = dirFut != null ? opposite(sector(dirFut)) : null;
  const near = (a, b) => a && b && [0, 1, 7].includes((SECT.indexOf(a) - SECT.indexOf(b) + 8) % 8);
  const loadedPast = ori && near(ori, leePast) && transportPast >= 6 && snow >= 5;
  const loadedFut = ori && near(ori, leeFut) && transportFut >= 6;

  const shady = ['N', 'NE', 'NW'].includes(ori), sunny = ['S', 'SE', 'SW'].includes(ori);
  let s = 0;
  s += clamp(fdh / 1200, 0, 1) * 40; s += clamp(precip / 35, 0, 1) * 20; s += clamp(cycles / 4, 0, 1) * 15;
  s += clamp(futCold / 48, 0, 1) * 15; s -= clamp(warmH / 24, 0, 1) * 30;
  if (futMax != null && futMax > 3) s -= 10; if (snow > 60) s -= 8; s += shady ? 10 : sunny ? -10 : 0;
  const score = Math.round(clamp(s, 0, 100));

  const notes = [];
  if (fdh < 300) notes.push('froid accumulé insuffisant');
  if (precip < 8) notes.push('peu d\'humidité récente : ligne probablement sèche');
  if (warmH > 12) notes.push('redoux récent : glace possiblement pourrie');
  if (cycles >= 2) notes.push('cycles gel/dégel favorables à la transformation');
  if (futMax != null && futMax > 3) notes.push('redoux annoncé dans les 72 h');
  if (snow > 60) notes.push('fort cumul de neige récent');
  if (loadedPast) notes.push(`voie orientée ${SECT_FR[ori]} sous le vent dominant récent (${SECT_FR[sector(dirPast)]}) : accumulations probables`);
  if (loadedFut) notes.push(`vent de ${SECT_FR[sector(dirFut)]} prévu : chargement des pentes ${SECT_FR[leeFut]} (orientation de la voie)`);
  if (windMax >= 60) notes.push(`vent très fort prévu (${Math.round(windMax)} km/h)`);
  else if (windMax >= 40) notes.push(`vent fort prévu (${Math.round(windMax)} km/h)`);
  return { score, fdh: Math.round(fdh), precip: Math.round(precip), snow: Math.round(snow), warmH, cycles, futMin, futMax,
    windMax: Math.round(windMax), gustMax: Math.round(gustMax), transportPast, transportFut, dirPast, dirFut, leePast, leeFut,
    loadedPast, loadedFut, cum: cumuls(rows), notes };
}

// ---------- graphique 3 panneaux ----------
function drawChart(rowsIn) {
  const rows = windRows(rowsIn);
  if (!rows.length) { $('chart').textContent = 'Pas de données.'; return; }
  const W = 1000, pl = 46, pr = 56;
  const A = { y0: 22, y1: 180 }, B = { y0: 212, y1: 372 }, C = { y0: 404, y1: 560 }, Hh = 590;
  const t0 = +rows[0].t, t1 = +rows[rows.length - 1].t;
  const X = t => pl + (t - t0) / (t1 - t0) * (W - pl - pr);
  const lin = (v, a, b, p) => p.y1 - (v - a) / (b - a) * (p.y1 - p.y0);
  const now = Date.now();
  let s = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Température, précipitations et vent">`;

  // séparateurs jours
  const days = daily(rows);
  days.forEach(d => { const x = X(+d.start); if (x > pl) s += `<line x1="${x}" x2="${x}" y1="${A.y0}" y2="${C.y1}" class="gridl"/>`; });

  // --- A : température
  const Ts = rows.map(r => r.T); const tmin = Math.floor(Math.min(...Ts, -10) / 5) * 5, tmax = Math.ceil(Math.max(...Ts, 5) / 5) * 5;
  s += `<text class="ttl" x="${pl}" y="${A.y0 - 8}">Température (°C)</text>`;
  for (let v = tmin; v <= tmax; v += 5) s += `<line x1="${pl}" x2="${W - pr}" y1="${lin(v, tmin, tmax, A)}" y2="${lin(v, tmin, tmax, A)}" class="gridl"/><text x="${pl - 6}" y="${lin(v, tmin, tmax, A) + 4}" text-anchor="end">${v}</text>`;
  s += `<line x1="${pl}" x2="${W - pr}" y1="${lin(0, tmin, tmax, A)}" y2="${lin(0, tmin, tmax, A)}" stroke="#c8332b" stroke-dasharray="4 4"/>`;
  s += `<polyline fill="none" stroke="#1f63d6" stroke-width="2" points="${rows.map(r => X(+r.t).toFixed(1) + ',' + lin(r.T, tmin, tmax, A).toFixed(1)).join(' ')}"/>`;

  // --- B : précipitations
  const dmax = Math.max(...days.map(d => d.P), 1);
  let cum = 0; const cumPts = rows.map(r => { cum += r.P; return [+r.t, cum]; });
  const cmax = niceMax(Math.max(cum, 10));
  const hmax = niceMax(Math.max(...rows.map(r => r.P), 2));
  s += `<text class="ttl" x="${pl}" y="${B.y0 - 8}">Précipitations — bandeau : cumul journalier · barres : mm/h (axe gauche) · courbe : cumul depuis J-14 (axe droit, mm)</text>`;
  // bandeau des cumuls journaliers (échelle colorée)
  const SB = { y0: B.y0, y1: B.y0 + 30 }; const Bb = { y0: B.y0 + 38, y1: B.y1 };
  days.forEach((d, i) => {
    const xa = Math.max(pl, X(+d.start)), xb = i < days.length - 1 ? X(+days[i + 1].start) : W - pr;
    if (xb - xa < 2) return;
    const c = pcls(d.P);
    s += `<rect x="${xa + 1}" y="${SB.y0}" width="${xb - xa - 2}" height="${SB.y1 - SB.y0}" rx="3" fill="${d.P < 1 ? 'none' : c.col}" stroke="currentColor" stroke-opacity=".15"/>`;
    const dark = d.P >= 15;
    if (d.P >= 0.5) s += `<text x="${(xa + xb) / 2}" y="${SB.y0 + 13}" text-anchor="middle" style="font-weight:700;${dark ? 'fill:#fff' : 'fill:#14213a'}">${Math.round(d.P)} mm</text>`;
    if (d.S >= 1) s += `<text x="${(xa + xb) / 2}" y="${SB.y0 + 25}" text-anchor="middle" style="font-size:10px;${dark ? 'fill:#fff' : 'fill:#14213a'}">❄ ${Math.round(d.S)} cm</text>`;
  });
  for (let k = 0; k <= 4; k++) {
    const v = hmax * k / 4, y = lin(v, 0, hmax, Bb);
    s += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" class="gridl"/><text x="${pl - 6}" y="${y + 4}" text-anchor="end">${r1(v)}</text>`;
    s += `<text x="${W - pr + 6}" y="${y + 4}" style="fill:#2a6a3a">${Math.round(cmax * k / 4)}</text>`;
  }
  const bw = Math.max(1, (W - pl - pr) / rows.length);
  rows.forEach(r => { if (r.P > 0) { const y = lin(r.P, 0, hmax, Bb); s += `<rect x="${X(+r.t)}" y="${y}" width="${bw}" height="${Bb.y1 - y}" fill="${r.S > 0 ? '#9ec9ff' : '#1d5fb8'}"/>`; } });
  s += `<polyline fill="none" stroke="#2a8a4a" stroke-width="2.2" points="${cumPts.map(([t, v]) => X(t).toFixed(1) + ',' + lin(v, 0, cmax, Bb).toFixed(1)).join(' ')}"/>`;
  s += `<text x="${W - pr + 6}" y="${Bb.y0 - 12}" style="fill:#2a6a3a">mm</text>`;

  // --- C : vent
  const ws = rows.map(r => r.w || 0), gs = rows.map(r => r.g || 0);
  const wmax = niceMax(Math.max(...ws, ...gs, 70));
  s += `<text class="ttl" x="${pl}" y="${C.y0 - 8}">Vent (km/h) — ${$('windLevel').value === '700' ? 'altitude ≈ 3000 m' : '10 m'} · flèches : sens du vent (vers où il souffle)</text>`;
  [[0, 20], [20, 40], [40, 60], [60, wmax]].forEach(([a, b], i) => {
    s += `<rect x="${pl}" y="${lin(b, 0, wmax, C)}" width="${W - pl - pr}" height="${lin(a, 0, wmax, C) - lin(b, 0, wmax, C)}" fill="${WCLS[i].col}" opacity=".13"/>`;
  });
  for (let v = 0; v <= wmax; v += 20) s += `<line x1="${pl}" x2="${W - pr}" y1="${lin(v, 0, wmax, C)}" y2="${lin(v, 0, wmax, C)}" class="gridl"/><text x="${pl - 6}" y="${lin(v, 0, wmax, C) + 4}" text-anchor="end">${v}</text>`;
  if (gs.some(v => v > 0)) s += `<polyline fill="none" stroke="#8a94a6" stroke-width="1.2" stroke-dasharray="3 3" points="${rows.map(r => X(+r.t).toFixed(1) + ',' + lin(r.g || 0, 0, wmax, C).toFixed(1)).join(' ')}"/>`;
  s += `<polyline fill="none" stroke="#6b3fa0" stroke-width="2" points="${rows.map(r => X(+r.t).toFixed(1) + ',' + lin(r.w || 0, 0, wmax, C).toFixed(1)).join(' ')}"/>`;
  // flèches toutes les 6 h
  rows.forEach(r => {
    if (r.t.getHours() % 6 !== 0 || r.wd == null) return;
    const x = X(+r.t), y = C.y0 + 14, rot = (r.wd + 180) % 360, c = wcol(r.w || 0);
    s += `<g transform="translate(${x.toFixed(1)},${y}) rotate(${rot})"><line x1="0" y1="7" x2="0" y2="-6" stroke="${c}" stroke-width="2.4"/><path d="M0,-9 L-4,-3 L4,-3 Z" fill="${c}"/></g>`;
    if (r.t.getHours() === 12) s += `<text x="${x}" y="${C.y0 + 34}" text-anchor="middle" style="font-size:9px">${SECT_FR[sector(r.wd)]}</text>`;
  });

  // repère maintenant + dates
  if (now > t0 && now < t1) s += `<line x1="${X(now)}" x2="${X(now)}" y1="${A.y0}" y2="${C.y1}" stroke="#b86a00" stroke-width="2"/><text x="${X(now) + 4}" y="${A.y0 + 10}">maintenant</text>`;
  days.forEach((d, i) => { if (i % 2 === 0) { const x = X(+d.start + 43200e3); if (x > pl && x < W - pr) s += `<text x="${x}" y="${Hh - 10}" text-anchor="middle">${d.start.getDate()}/${d.start.getMonth() + 1}</text>`; } });
  s += '</svg>';

  s += `<div class="legend">
    <span><i style="background:#1f63d6"></i>Température</span><span><i style="background:#c8332b"></i>0 °C</span>
    <span><i style="background:#1d5fb8"></i>Pluie (mm/h)</span><span><i style="background:#9ec9ff"></i>Neige (eq. eau mm/h)</span>
    <span><i style="background:#2a8a4a"></i>Cumul depuis J-14</span>
    <span><i style="background:#6b3fa0"></i>Vent moyen</span><span><i style="background:#8a94a6"></i>Rafales 10 m (pointillé)</span></div>
    <div class="legend"><b>Échelle cumul journalier :</b>${PCLS.slice(1).map(c => `<span><i style="background:${c.col}"></i>${c.lab}</span>`).join('')}</div>
    <div class="legend"><b>Échelle vent :</b>${WCLS.map(c => `<span><i style="background:${c.col}"></i>${c.lab}</span>`).join('')}</div>
    <div class="muted" style="font-size:12px;margin-top:4px">Source : Open-Meteo (modèles, valeurs horaires). Bandeau : cumul journalier en mm, couleur selon l'échelle ; ❄ = neige fraîche modélisée.</div>`;
  $('chart').innerHTML = s;
}
function niceMax(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p; return 10 * p; }

function renderCumTable(m) {
  const c = m.cum;
  const cell = o => { const k = pcls(o.p / 1); return `<td><b>${o.p}</b> mm<br><small class="muted">pluie ${o.rain} · neige ${o.snow} cm</small></td>`; };
  $('cumTable').innerHTML = `<table class="cum"><thead><tr><th></th><th>24 h</th><th>72 h</th><th>7 jours</th><th>14 jours</th></tr></thead><tbody>
    <tr><th>Passé</th>${cell(c.past24)}${cell(c.past72)}${cell(c.past7)}${cell(c.past14)}</tr>
    <tr><th>Prévu</th>${cell(c.next24)}${cell(c.next72)}${cell(c.next96).replace('<td>', '<td title="96 h">')}<td class="muted">—</td></tr>
    </tbody></table><div class="muted" style="font-size:12px">Ligne « Prévu » : 24 h, 72 h et 96 h (fin de prévision).</div>`;
}

function roseSVG(rows, title) {
  const bins = SECT.map(() => [0, 0, 0, 0]); let n = 0;
  rows.forEach(r => { if (r.wd == null || r.w == null) return; n++; bins[SECT.indexOf(sector(r.wd))][WCLS.findIndex(c => r.w < c.max)]++; });
  if (!n) return `<div class="rose"><b>${title}</b><p class="muted">Pas de données</p></div>`;
  const tot = bins.map(b => b.reduce((a, c) => a + c, 0)); const mx = Math.max(...tot);
  const R = 80, cx = 110, cy = 110; let s = `<svg viewBox="0 0 220 220">`;
  [0.33, 0.66, 1].forEach(k => s += `<circle cx="${cx}" cy="${cy}" r="${R * k}" fill="none" class="gridl"/>`);
  SECT.forEach((d, i) => {
    let acc = 0; const a = i * 45, half = 18;
    bins[i].forEach((v, j) => {
      if (!v) return; const r0 = R * acc / mx, r1_ = R * (acc + v) / mx; acc += v;
      const p = (rr, ang) => [cx + rr * Math.sin(ang * Math.PI / 180), cy - rr * Math.cos(ang * Math.PI / 180)];
      const [x1, y1] = p(r0, a - half), [x2, y2] = p(r1_, a - half), [x3, y3] = p(r1_, a + half), [x4, y4] = p(r0, a + half);
      s += `<path d="M${x1},${y1} L${x2},${y2} A${r1_},${r1_} 0 0 1 ${x3},${y3} L${x4},${y4} A${r0},${r0} 0 0 0 ${x1},${y1} Z" fill="${WCLS[j].col}" stroke="var(--card)" stroke-width=".5"/>`;
    });
    const [lx, ly] = [cx + (R + 14) * Math.sin(a * Math.PI / 180), cy - (R + 14) * Math.cos(a * Math.PI / 180) + 4];
    s += `<text x="${lx}" y="${ly}" text-anchor="middle" style="font-weight:600">${SECT_FR[d]}</text>`;
  });
  s += '</svg>';
  const dom = SECT[tot.indexOf(mx)];
  return `<div class="rose"><b>${title}</b>${s}<div style="font-size:12px">Provenance dominante : <b>${SECT_FR[dom]}</b> · versant chargé : <b>${SECT_FR[opposite(dom)]}</b></div></div>`;
}
function renderRoses(rowsIn, m, ori) {
  const rows = windRows(rowsIn), now = Date.now(), H = 3600e3;
  const past = rows.filter(r => +r.t <= now && +r.t > now - 72 * H), fut = rows.filter(r => +r.t > now && +r.t <= now + 72 * H);
  const msg = [];
  if (m.loadedPast) msg.push('<span class="pill p-red">Chargement probable de la voie (72 h passées)</span>');
  if (m.loadedFut) msg.push('<span class="pill p-amber">Chargement possible de la voie (72 h à venir)</span>');
  $('roses').innerHTML = roseSVG(past, 'Rose des vents — 72 h passées') + roseSVG(fut, 'Rose des vents — 72 h à venir') +
    `<div class="rose" style="text-align:left"><b>Analyse vent</b>
      <div style="font-size:13px;margin-top:6px">Heures ≥ 30 km/h (transport) : <b>${m.transportPast} h</b> passées · <b>${m.transportFut} h</b> à venir</div>
      <div style="font-size:13px">Vent max prévu : <b>${m.windMax} km/h</b> · rafales 10 m : <b>${m.gustMax} km/h</b></div>
      <div style="font-size:13px">Orientation de la voie : <b>${ori ? SECT_FR[ori] : 'non renseignée'}</b></div>
      <div style="margin-top:6px">${msg.join(' ') || '<span class="muted" style="font-size:13px">Pas de chargement éolien spécifique détecté sur l\'orientation de la voie.</span>'}</div>
      <div class="muted" style="font-size:11px;margin-top:6px">Versant chargé = opposé à la provenance dominante (pondérée par la vitesse). Transport considéré à partir de 30 km/h.</div></div>`;
}

// ---------- sorties ----------
async function fetchOutings(r) {
  let url;
  if ($('outMode').value === 'route' && /^\d+$/.test(r.c2cId)) url = '/api/outings?route=' + r.c2cId;
  else if (num(r.lat) != null && num(r.lon) != null) url = `/api/outings?lat=${num(r.lat)}&lon=${num(r.lon)}&radius=5000`;
  else throw new Error('ID C2C ou coordonnées requis');
  return (await getJSON(api(url))).results || [];
}
const COND = { excellent: ['Excellentes', 'p-green'], good: ['Bonnes', 'p-green'], average: ['Moyennes', 'p-amber'], poor: ['Mauvaises', 'p-red'], awful: ['Exécrables', 'p-red'] };
function renderOutings(list) {
  $('outings').innerHTML = '';
  if (!list.length) { status('outStatus', 'Aucune sortie trouvée.', 'warn'); return; }
  status('outStatus', list.length + ' sortie(s), de la plus récente à la plus ancienne.', 'ok');
  list.slice(0, 12).forEach(o => {
    const age = o.date_start ? Math.round((Date.now() - new Date(o.date_start)) / 86400e3) : null;
    const fresh = age != null && age <= 7 ? 'p-green' : age != null && age <= 21 ? 'p-amber' : '';
    const c = COND[o.condition_rating]; const el = document.createElement('div'); el.className = 'item';
    el.innerHTML = `<div><strong>${esc(o.title)}</strong><br><small>${esc(o.date_start || '?')} ${age != null ? '· il y a ' + age + ' j' : ''}</small>
      ${o.summary ? `<div style="font-size:13px;margin-top:4px">${esc(o.summary)}</div>` : ''}</div>
      <div style="text-align:right"><span class="pill ${fresh}">${age != null && age <= 7 ? 'Récente' : age != null && age <= 21 ? '< 3 sem.' : 'Ancienne'}</span><br>
      ${c ? `<span class="pill ${c[1]}" style="margin-top:4px">${c[0]}</span><br>` : ''}<a href="${esc(o.url)}" target="_blank" rel="noopener" style="font-size:13px">Voir</a></div>`;
    $('outings').appendChild(el);
  });
}

// ---------- BERA ----------
async function fetchBera(massif) {
  if (!/^\d+$/.test(massif || '')) return { info: 'ID de massif non renseigné.' };
  try { return await getJSON(api('/api/bera?massif=' + massif)); }
  catch (e) { return { info: e.body && e.body.configured === false ? 'Clé API Météo-France non configurée sur l\'hébergement (voir README).' : 'BERA indisponible : ' + e.message }; }
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
async function analyze(idx, render) {
  const r = routes[idx]; const lat = num(r.lat), lon = num(r.lon), alt = num(r.alt);
  if (lat == null || lon == null) throw new Error('Latitude et longitude requises');
  const [wx, outs, bera] = await Promise.all([
    fetchWeather(lat, lon, alt),
    isServed ? fetchOutings(r).catch(e => ({ error: e.message })) : Promise.resolve({ error: 'non disponible hors hébergement' }),
    isServed ? fetchBera(r.massif) : Promise.resolve({ info: 'non disponible hors hébergement' })
  ]);
  const model = formationModel(windRows(wx), r.ori);
  const outList = Array.isArray(outs) ? outs : []; const last = outList[0];
  const res = { score: model.score, model, wx, ori: r.ori, outings: outs, beraData: bera,
    headline: model.notes[0] || 'pas de signal particulier',
    lastOuting: last ? `${last.date_start}${last.condition_rating && COND[last.condition_rating] ? ' (' + COND[last.condition_rating][0].toLowerCase() + ')' : ''}` : null,
    bera: bera && bera.risque_max ? bera.risque_max + '/5' : null };
  cache[r.key] = res; if (render) showAnalysis(res); renderOverview(); return res;
}
function showAnalysis(res) {
  const m = res.model; const col = m.score >= 65 ? 'var(--green)' : m.score >= 40 ? 'var(--amber)' : 'var(--red)';
  $('formation').innerHTML = `<div class="score" style="color:${col}">${m.score}<span style="font-size:18px">/100</span></div>
    <div class="gauge"><div style="width:${m.score}%;background:${col}"></div></div>
    <div class="kpis">
      <div class="kpi"><b>${m.fdh}</b><span>degrés-heures de gel (10 j)</span></div>
      <div class="kpi"><b>${m.precip} mm</b><span>précipitations (14 j)</span></div>
      <div class="kpi"><b>${m.snow} cm</b><span>neige fraîche (14 j)</span></div>
      <div class="kpi"><b>${m.cycles}</b><span>cycles gel/dégel (10 j)</span></div>
      <div class="kpi"><b>${m.warmH} h</b><span>au-dessus de 1 °C (72 h)</span></div>
      <div class="kpi"><b>${m.futMin != null ? Math.round(m.futMin) : '?'} / ${m.futMax != null ? Math.round(m.futMax) : '?'} °C</b><span>min / max prévus (72 h)</span></div>
      <div class="kpi"><b>${m.windMax} km/h</b><span>vent max prévu (72 h)</span></div>
      <div class="kpi"><b>${m.dirFut != null ? SECT_FR[sector(m.dirFut)] : '?'}</b><span>provenance dominante prévue</span></div>
    </div>
    <ul style="margin:10px 0 0;padding-left:18px">${m.notes.map(n => `<li>${esc(n)}</li>`).join('') || '<li>Pas de signal particulier.</li>'}</ul>`;
  drawChart(res.wx); renderCumTable(m); renderRoses(res.wx, m, res.ori);
  if (Array.isArray(res.outings)) renderOutings(res.outings); else { $('outings').innerHTML = ''; status('outStatus', 'Sorties indisponibles : ' + res.outings.error, 'warn'); }
  renderBera(res.beraData);

  const beraLvl = res.beraData && parseInt(res.beraData.risque_max, 10);
  const recent = Array.isArray(res.outings) ? res.outings.filter(o => o.date_start && (Date.now() - new Date(o.date_start)) / 86400e3 <= 10) : [];
  let txt, c;
  if (beraLvl >= 4) { txt = 'Risque avalanche fort : course déconseillée quelles que soient les conditions de glace.'; c = 'var(--red)'; }
  else if (m.score >= 65 && (beraLvl === 3 || m.loadedPast || m.loadedFut)) { txt = 'Formation probablement favorable, mais contexte nivologique défavorable (BERA 3 et/ou chargement éolien de l\'orientation de la voie) : éviter les pentes chargées à l\'approche, dans la ligne et à la descente.'; c = 'var(--amber)'; }
  else if (m.score >= 65) { txt = 'Fenêtre potentiellement intéressante. À confirmer par un retour terrain récent et Data-Avalanche.'; c = 'var(--green)'; }
  else if (m.score >= 40) { txt = 'Formation incertaine : attendre un retour terrain ou une nouvelle période froide.'; c = 'var(--amber)'; }
  else { txt = 'Conditions de formation peu probables actuellement.'; c = 'var(--red)'; }
  if (m.windMax >= 60) txt += ' Vent très fort prévu : exposition en crête et dans les sorties de goulotte.';
  if (recent.length) txt += ` ${recent.length} sortie(s) C2C de moins de 10 jours à consulter en priorité.`;
  if (!beraLvl) txt += ' BERA non intégré : vérifier le bulletin du massif.';
  $('decision').textContent = txt; $('decision').style.borderLeftColor = c;
}

// ---------- événements ----------
$('search').addEventListener('click', searchC2C);
$('query').addEventListener('keydown', e => { if (e.key === 'Enter') searchC2C(); });
$('loadRoute').addEventListener('click', loadRouteById);
$('save').addEventListener('click', () => { readForm(); persist(); fillForm(); renderOverview(); status('searchStatus', 'Paramètres enregistrés.', 'ok'); });
$('analyze').addEventListener('click', async () => {
  readForm(); persist(); $('decision').textContent = 'Analyse en cours…';
  try { await analyze(current, true); } catch (e) { $('decision').textContent = 'Analyse impossible : ' + e.message; }
});
$('windLevel').addEventListener('change', () => {
  const c = cache[routes[current].key];
  if (c && c.wx) { c.model = formationModel(windRows(c.wx), c.ori); c.score = c.model.score; showAnalysis(c); renderOverview(); }
});
$('loadOutings').addEventListener('click', async () => {
  readForm(); status('outStatus', 'Chargement…');
  try { renderOutings(await fetchOutings(routes[current])); } catch (e) { status('outStatus', 'Sorties indisponibles : ' + e.message, 'bad'); }
});
$('analyzeAll').addEventListener('click', async () => {
  readForm(); persist(); const b = $('analyzeAll'); b.disabled = true; b.textContent = 'Analyse…';
  for (let i = 0; i < routes.length; i++) { try { await analyze(i, i === current); } catch (e) { cache[routes[i].key] = { score: null, headline: e.message }; renderOverview(); } }
  b.disabled = false; b.textContent = 'Analyser les 5 voies';
});
$('exportCfg').addEventListener('click', () => {
  readForm(); persist();
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(routes, null, 2)], { type: 'application/json' }));
  a.download = 'routes.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('importCfg').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text()); if (!Array.isArray(data)) throw 0;
    data.forEach(d => { const r = routes.find(x => x.key === d.key); if (r) FIELDS.forEach(k => { if (d[k] != null) r[k] = String(d[k]); }); });
    persist(); fillForm(); renderOverview(); status('searchStatus', 'Configuration importée.', 'ok');
  } catch { status('searchStatus', 'Fichier de configuration invalide.', 'bad'); }
  e.target.value = '';
});

loadConfig().then(() => { if (!routes.length) { $('title').textContent = 'config/routes.json introuvable'; return; } renderTabs(); fillForm(); renderOverview(); });

// exposé pour tests

})();
