(() => {
'use strict';
const $ = id => document.getElementById(id);
const STORE = 'veille-goulottes-v2';
const FIELDS = ['query', 'c2cId', 'lat', 'lon', 'alt', 'ori', 'massif'];
let routes = [];
let current = 0;
const cache = {}; // résultats d'analyse par clé de voie

// ---------- utilitaires ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function status(id, msg, cls = '') { const e = $(id); e.textContent = msg; e.className = 'status ' + cls; }
async function getJSON(url, timeout = 15000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctl.signal });
    let body = null; try { body = await r.json(); } catch {}
    if (!r.ok) { const err = new Error((body && body.error) || 'HTTP ' + r.status); err.body = body; err.status = r.status; throw err; }
    return body;
  } catch (e) { if (e.name === 'AbortError') throw new Error('délai dépassé'); throw e; }
  finally { clearTimeout(t); }
}
const api = path => new URL(path, location.origin).href;
const isServed = /^https?:$/.test(location.protocol);

// ---------- configuration ----------
async function loadConfig() {
  let defaults = [];
  try { defaults = await getJSON('config/routes.json'); } catch { defaults = []; }
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch {}
  routes = defaults.map(r => ({ ...r, ...(saved[r.key] || {}) }));
}
function persist() {
  const o = {}; routes.forEach(r => { o[r.key] = Object.fromEntries(FIELDS.map(f => [f, r[f] ?? ''])); });
  localStorage.setItem(STORE, JSON.stringify(o));
}
function readForm() { const r = routes[current]; FIELDS.forEach(f => r[f] = $(f).value.trim()); }
function fillForm() {
  const r = routes[current];
  $('title').textContent = r.name;
  FIELDS.forEach(f => $(f).value = r[f] ?? '');
  const link = $('c2cLink');
  if (r.c2cId) { link.href = 'https://www.camptocamp.org/routes/' + encodeURIComponent(r.c2cId); link.style.display = ''; }
  else { link.href = 'https://www.camptocamp.org/routes#q=' + encodeURIComponent(r.query || ''); }
}

// ---------- rendu onglets / vue d'ensemble ----------
function renderTabs() {
  $('tabs').innerHTML = '';
  routes.forEach((r, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tab' + (i === current ? ' active' : ''); b.textContent = r.name;
    b.addEventListener('click', () => select(i));
    $('tabs').appendChild(b);
  });
}
function levelPill(score) {
  if (score == null) return '<span class="pill">Non analysée</span>';
  if (score >= 65) return `<span class="pill p-green">Favorable · ${score}</span>`;
  if (score >= 40) return `<span class="pill p-amber">Incertaine · ${score}</span>`;
  return `<span class="pill p-red">Défavorable · ${score}</span>`;
}
function renderOverview() {
  $('overview').innerHTML = '';
  routes.forEach((r, i) => {
    const c = cache[r.key];
    const d = document.createElement('div'); d.className = 'ov'; d.tabIndex = 0;
    const configured = num(r.lat) != null && num(r.lon) != null;
    d.innerHTML = `<h4>${esc(r.name)}</h4>${levelPill(c ? c.score : null)}
      <div class="muted" style="font-size:13px;margin-top:6px">${configured ? '' : 'Coordonnées à renseigner · '}${c ? esc(c.headline) : ''}</div>
      ${c && c.lastOuting ? `<div style="font-size:13px;margin-top:4px">Dernière sortie C2C : ${esc(c.lastOuting)}</div>` : ''}
      ${c && c.bera ? `<div style="font-size:13px">BERA : ${esc(c.bera)}</div>` : ''}`;
    d.addEventListener('click', () => select(i));
    d.addEventListener('keydown', e => { if (e.key === 'Enter') select(i); });
    $('overview').appendChild(d);
  });
}
function select(i) {
  readForm(); persist(); current = i; renderTabs(); fillForm();
  $('searchResults').innerHTML = ''; status('searchStatus', ''); $('routeInfo').textContent = '';
  const c = cache[routes[i].key];
  if (c) showAnalysis(c); else resetPanels();
}
function resetPanels() {
  $('formation').innerHTML = '<span class="muted">Renseigner latitude, longitude et altitude puis lancer l\'analyse.</span>';
  $('chart').textContent = '—'; $('outings').innerHTML = ''; status('outStatus', '');
  $('bera').textContent = '—'; $('decision').textContent = 'Analyse non lancée.'; $('decision').style.borderLeftColor = '';
}

// ---------- Camptocamp ----------
async function searchC2C() {
  readForm();
  const q = routes[current].query;
  if (!isServed) return status('searchStatus', 'Application à ouvrir depuis son URL web (Cloudflare Pages).', 'bad');
  if (q.length < 3) return status('searchStatus', 'Saisir au moins 3 caractères.', 'warn');
  status('searchStatus', 'Recherche en cours…'); $('searchResults').innerHTML = '';
  try {
    const d = await getJSON(api('/api/routes?q=' + encodeURIComponent(q)));
    const list = d.results || [];
    if (!list.length) return status('searchStatus', 'Aucun itinéraire trouvé. Reformuler (nom du sommet seul par exemple).', 'warn');
    status('searchStatus', list.length + ' itinéraire(s). Sélectionner la bonne voie.', 'ok');
    list.forEach(it => {
      const row = document.createElement('div'); row.className = 'item';
      row.innerHTML = `<div><strong>${esc(it.title)}</strong><br><small>ID ${esc(it.id)}${it.elevation_max ? ' · ' + esc(it.elevation_max) + ' m' : ''}${it.orientations.length ? ' · ' + esc(it.orientations.join('/')) : ''}</small></div>`;
      const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Utiliser';
      b.addEventListener('click', () => applyRoute(it));
      row.appendChild(b); $('searchResults').appendChild(row);
    });
  } catch (e) { status('searchStatus', 'Camptocamp indisponible : ' + e.message + '. Saisie manuelle possible.', 'bad'); }
}
function applyRoute(it) {
  const r = routes[current];
  r.c2cId = String(it.id || '');
  if (it.lat != null) r.lat = String(it.lat);
  if (it.lon != null) r.lon = String(it.lon);
  if (it.elevation_max) r.alt = String(it.elevation_max);
  if (it.orientations && it.orientations.length) r.ori = it.orientations[0];
  fillForm(); persist(); $('searchResults').innerHTML = '';
  status('searchStatus', 'Itinéraire appliqué. Vérifier les coordonnées (point C2C parfois au sommet).', 'ok');
  renderOverview();
}
async function loadRouteById() {
  readForm(); const id = routes[current].c2cId;
  if (!/^\d+$/.test(id)) return status('searchStatus', 'ID C2C numérique attendu.', 'warn');
  status('searchStatus', 'Chargement de la fiche…');
  try {
    const d = await getJSON(api('/api/routes?id=' + id));
    applyRoute(d);
    $('routeInfo').textContent = [d.title, d.global_rating && 'Cotation ' + d.global_rating, d.ice_rating && 'Glace ' + d.ice_rating, d.mixed_rating && 'Mixte ' + d.mixed_rating, d.height_diff_difficulties && d.height_diff_difficulties + ' m de difficultés'].filter(Boolean).join(' · ');
  } catch (e) { status('searchStatus', 'Fiche indisponible : ' + e.message, 'bad'); }
}

// ---------- Météo (Open-Meteo, appel direct autorisé CORS) ----------
async function fetchWeather(lat, lon, alt) {
  const p = new URLSearchParams({
    latitude: lat, longitude: lon, timezone: 'Europe/Paris', past_days: '14', forecast_days: '4',
    hourly: 'temperature_2m,precipitation,snowfall,freezing_level_height,wind_speed_10m,cloud_cover'
  });
  if (alt != null) p.set('elevation', alt);
  const d = await getJSON('https://api.open-meteo.com/v1/forecast?' + p.toString(), 20000);
  const h = d.hourly;
  return h.time.map((t, i) => ({
    t: new Date(t), T: h.temperature_2m[i], P: h.precipitation[i] || 0, S: h.snowfall[i] || 0,
    fl: h.freezing_level_height[i], w: h.wind_speed_10m[i], cc: h.cloud_cover[i]
  })).filter(x => x.T != null);
}

// Modèle empirique de formation de glace / mixte
function formationModel(rows, ori) {
  const now = Date.now(), H = 3600e3;
  const past = (h1, h0 = 0) => rows.filter(r => r.t <= now - h0 * H && r.t > now - h1 * H);
  const fut = rows.filter(r => r.t > now && r.t <= now + 72 * H);
  const p10 = past(240), p14 = past(336), p72 = past(72);

  const fdh = p10.reduce((s, r) => s + Math.max(0, -r.T), 0);          // degrés-heures de gel sur 10 j
  const precip = p14.reduce((s, r) => s + r.P, 0);                      // mm sur 14 j
  const snow = p14.reduce((s, r) => s + r.S, 0);                        // cm sur 14 j
  const warmH = p72.filter(r => r.T > 1).length;                        // heures de dégel sur 72 h
  const days = {};
  p10.forEach(r => { const k = r.t.toISOString().slice(0, 10); (days[k] ||= []).push(r.T); });
  const cycles = Object.values(days).filter(v => Math.min(...v) <= -2 && Math.max(...v) >= 1).length;
  const futMin = fut.length ? Math.min(...fut.map(r => r.T)) : null;
  const futMax = fut.length ? Math.max(...fut.map(r => r.T)) : null;
  const futCold = fut.filter(r => r.T < -2).length;
  const windMax = fut.length ? Math.max(...fut.map(r => r.w || 0)) : 0;

  const shady = ['N', 'NE', 'NW'].includes(ori);
  const sunny = ['S', 'SE', 'SW'].includes(ori);
  let s = 0;
  s += clamp(fdh / 1200, 0, 1) * 40;              // froid accumulé
  s += clamp(precip / 35, 0, 1) * 20;             // apport d'humidité
  s += clamp(cycles / 4, 0, 1) * 15;              // cycles gel/dégel (transformation)
  s += clamp(futCold / 48, 0, 1) * 15;            // froid à venir
  s -= clamp(warmH / 24, 0, 1) * 30;              // redoux récent
  if (futMax != null && futMax > 3) s -= 10;      // redoux annoncé
  if (snow > 60) s -= 8;                          // très chargé : glace masquée / instabilité
  s += shady ? 10 : sunny ? -10 : 0;
  const score = Math.round(clamp(s, 0, 100));

  const notes = [];
  if (fdh < 300) notes.push('froid accumulé insuffisant');
  if (precip < 8) notes.push('peu d\'humidité récente : ligne probablement sèche');
  if (warmH > 12) notes.push('redoux récent : glace possiblement pourrie');
  if (cycles >= 2) notes.push('cycles gel/dégel favorables à la transformation');
  if (futMax != null && futMax > 3) notes.push('redoux annoncé dans les 72 h');
  if (snow > 60) notes.push('fort cumul de neige récent');
  if (windMax > 50) notes.push(`vent fort prévu (${Math.round(windMax)} km/h) : transport de neige`);
  return { score, fdh: Math.round(fdh), precip: Math.round(precip), snow: Math.round(snow), warmH, cycles, futMin, futMax, windMax: Math.round(windMax), notes };
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
  svg += '</svg><div class="muted" style="font-size:12px">Courbe : température horaire à l\'altitude saisie · barres : précipitations (bleu clair = neige) · pointillé rouge : 0 °C. Source : Open-Meteo.</div>';
  $('chart').innerHTML = svg;
}

// ---------- sorties ----------
async function fetchOutings(r) {
  const mode = $('outMode').value;
  let url;
  if (mode === 'route' && /^\d+$/.test(r.c2cId)) url = '/api/outings?route=' + r.c2cId;
  else if (num(r.lat) != null && num(r.lon) != null) url = `/api/outings?lat=${num(r.lat)}&lon=${num(r.lon)}&radius=5000`;
  else throw new Error('ID C2C ou coordonnées requis');
  const d = await getJSON(api(url));
  return d.results || [];
}
const COND = { excellent: ['Excellentes', 'p-green'], good: ['Bonnes', 'p-green'], average: ['Moyennes', 'p-amber'], poor: ['Mauvaises', 'p-red'], awful: ['Exécrables', 'p-red'] };
function renderOutings(list) {
  $('outings').innerHTML = '';
  if (!list.length) { status('outStatus', 'Aucune sortie trouvée.', 'warn'); return; }
  status('outStatus', list.length + ' sortie(s), de la plus récente à la plus ancienne.', 'ok');
  const now = Date.now();
  list.slice(0, 12).forEach(o => {
    const age = o.date_start ? Math.round((now - new Date(o.date_start)) / 86400e3) : null;
    const fresh = age != null && age <= 7 ? 'p-green' : age != null && age <= 21 ? 'p-amber' : '';
    const c = COND[o.condition_rating];
    const el = document.createElement('div'); el.className = 'item';
    el.innerHTML = `<div><strong>${esc(o.title)}</strong><br><small>${esc(o.date_start || '?')} ${age != null ? '· il y a ' + age + ' j' : ''}</small>
      ${o.summary ? `<div style="font-size:13px;margin-top:4px">${esc(o.summary)}</div>` : ''}</div>
      <div style="text-align:right"><span class="pill ${fresh}">${age != null && age <= 7 ? 'Récente' : age != null && age <= 21 ? '< 3 sem.' : 'Ancienne'}</span><br>
      ${c ? `<span class="pill ${c[1]}" style="margin-top:4px">${c[0]}</span><br>` : ''}
      <a href="${esc(o.url)}" target="_blank" rel="noopener" style="font-size:13px">Voir</a></div>`;
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
  const r = parseInt(b.risque_max, 10);
  const cls = r >= 4 ? 'p-red' : r === 3 ? 'p-amber' : r >= 1 ? 'p-green' : '';
  $('bera').innerHTML = `<div><span class="pill ${cls}" style="font-size:16px">Risque ${esc(b.risque_max || '?')}/5</span> <b>${esc(b.massif || '')}</b></div>
    <div class="muted" style="font-size:13px;margin:6px 0">Émis ${esc(b.emission || '?')} · valide jusqu'au ${esc(b.validite || '?')}</div>
    ${b.risque2 ? `<div>Risque ${esc(b.risque1)} ${esc(b.alti1 || '')} · risque ${esc(b.risque2)} ${esc(b.alti2 || '')}</div>` : ''}
    ${b.commentaire ? `<p>${esc(b.commentaire)}</p>` : ''}${b.stabilite ? `<p style="font-size:13px">${esc(b.stabilite.slice(0, 700))}</p>` : ''}`;
}

// ---------- analyse ----------
async function analyze(idx, render) {
  const r = routes[idx];
  const lat = num(r.lat), lon = num(r.lon), alt = num(r.alt);
  if (lat == null || lon == null) throw new Error('Latitude et longitude requises');
  const [wx, outs, bera] = await Promise.all([
    fetchWeather(lat, lon, alt),
    isServed ? fetchOutings(r).catch(e => ({ error: e.message })) : Promise.resolve({ error: 'non disponible hors hébergement' }),
    isServed ? fetchBera(r.massif) : Promise.resolve({ info: 'non disponible hors hébergement' })
  ]);
  const m = formationModel(wx, r.ori);
  const outList = Array.isArray(outs) ? outs : [];
  const last = outList[0];
  const res = {
    score: m.score, model: m, wx, outings: outs, beraData: bera,
    headline: m.notes[0] || 'pas de signal particulier',
    lastOuting: last ? `${last.date_start}${last.condition_rating && COND[last.condition_rating] ? ' (' + COND[last.condition_rating][0].toLowerCase() + ')' : ''}` : null,
    bera: bera && bera.risque_max ? bera.risque_max + '/5' : null
  };
  cache[r.key] = res;
  if (render) showAnalysis(res);
  renderOverview();
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
  if (Array.isArray(res.outings)) renderOutings(res.outings); else { $('outings').innerHTML = ''; status('outStatus', 'Sorties indisponibles : ' + res.outings.error, 'warn'); }
  renderBera(res.beraData);

  const beraLvl = res.beraData && parseInt(res.beraData.risque_max, 10);
  const recent = Array.isArray(res.outings) ? res.outings.filter(o => o.date_start && (Date.now() - new Date(o.date_start)) / 86400e3 <= 10) : [];
  let txt, c;
  if (beraLvl >= 4) { txt = 'Risque avalanche fort : course déconseillée quelles que soient les conditions de glace.'; c = 'var(--red)'; }
  else if (m.score >= 65 && beraLvl === 3) { txt = 'Formation probablement favorable, mais BERA 3 : n\'y aller que si approche, voie et descente évitent les pentes et orientations signalées.'; c = 'var(--amber)'; }
  else if (m.score >= 65) { txt = 'Fenêtre potentiellement intéressante. À confirmer par un retour terrain récent et Data-Avalanche.'; c = 'var(--green)'; }
  else if (m.score >= 40) { txt = 'Formation incertaine : attendre un retour terrain ou une nouvelle période froide.'; c = 'var(--amber)'; }
  else { txt = 'Conditions de formation peu probables actuellement.'; c = 'var(--red)'; }
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
  readForm(); persist();
  $('decision').textContent = 'Analyse en cours…';
  try { await analyze(current, true); } catch (e) { $('decision').textContent = 'Analyse impossible : ' + e.message; }
});
$('loadOutings').addEventListener('click', async () => {
  readForm(); status('outStatus', 'Chargement…');
  try { renderOutings(await fetchOutings(routes[current])); } catch (e) { status('outStatus', 'Sorties indisponibles : ' + e.message, 'bad'); }
});
$('analyzeAll').addEventListener('click', async () => {
  readForm(); persist();
  const b = $('analyzeAll'); b.disabled = true; b.textContent = 'Analyse…';
  for (let i = 0; i < routes.length; i++) {
    try { await analyze(i, i === current); } catch (e) { cache[routes[i].key] = { score: null, headline: e.message }; renderOverview(); }
  }
  b.disabled = false; b.textContent = 'Analyser les 5 voies';
});
$('exportCfg').addEventListener('click', () => {
  readForm(); persist();
  const blob = new Blob([JSON.stringify(routes, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'routes.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('importCfg').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!Array.isArray(data)) throw new Error('format');
    data.forEach(d => { const r = routes.find(x => x.key === d.key); if (r) FIELDS.forEach(k => { if (d[k] != null) r[k] = String(d[k]); }); });
    persist(); fillForm(); renderOverview(); status('searchStatus', 'Configuration importée.', 'ok');
  } catch { status('searchStatus', 'Fichier de configuration invalide.', 'bad'); }
  e.target.value = '';
});

// ---------- démarrage ----------
loadConfig().then(() => {
  if (!routes.length) { $('title').textContent = 'config/routes.json introuvable'; return; }
  renderTabs(); fillForm(); renderOverview();
});
})();
