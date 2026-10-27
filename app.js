(() => {
'use strict';
const $ = id => document.getElementById(id);
const STORE = 'alpicondi-v2';
const FIELDS = ['query', 'c2cId', 'lat', 'lon', 'alt', 'ori', 'massif'];
let routes = [], current = 0;
const cache = {};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const status = (id, msg, cls = '') => { const e = $(id); e.textContent = msg; e.className = 'status ' + cls; };
const api = p => new URL(p, location.origin).href;
async function getJSON(url, timeout = 15000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctl.signal });
    let body = null; try { body = await r.json(); } catch {}
    if (!r.ok) { const e = new Error((body && (body.detail ? body.error + ' — ' + body.detail : body.error)) || 'HTTP ' + r.status); e.body = body; throw e; }
    return body;
  } catch (e) { if (e.name === 'AbortError') throw new Error('délai dépassé'); throw e; }
  finally { clearTimeout(t); }
}

// ---------- configuration ----------
async function loadConfig() {
  let defaults = [];
  try { defaults = await getJSON(api('/config/routes.json')); } catch {}
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch {}
  routes = defaults.map(r => ({ ...r, ...(saved[r.key] || {}) }));
}
function persist() { const o = {}; routes.forEach(r => o[r.key] = Object.fromEntries(FIELDS.map(f => [f, r[f] ?? '']))); localStorage.setItem(STORE, JSON.stringify(o)); }
function readForm() { const r = routes[current]; if (r) FIELDS.forEach(f => r[f] = $(f).value.trim()); }
function fillForm() {
  const r = routes[current];
  $('title').textContent = r.name;
  FIELDS.forEach(f => $(f).value = r[f] ?? '');
  $('c2cLink').href = /^\d+$/.test(r.c2cId) ? 'https://www.camptocamp.org/routes/' + r.c2cId : 'https://www.camptocamp.org/routes#q=' + encodeURIComponent(r.query || '');
}

// ---------- onglets / vue d'ensemble ----------
function renderTabs() {
  $('tabs').innerHTML = '';
  routes.forEach((r, i) => {
    const b = document.createElement('button'); b.type = 'button';
    b.className = 'tab' + (i === current ? ' active' : ''); b.textContent = r.name;
    b.addEventListener('click', () => select(i)); $('tabs').appendChild(b);
  });
}
function pill(score) {
  if (score == null) return '<span class="pill">Non analysée</span>';
  if (score >= 65) return `<span class="pill p-green">Favorable · ${score}</span>`;
  if (score >= 40) return `<span class="pill p-amber">Incertaine · ${score}</span>`;
  return `<span class="pill p-red">Défavorable · ${score}</span>`;
}
function renderOverview() {
  $('overview').innerHTML = '';
  routes.forEach((r, i) => {
    const c = cache[r.key], ok = num(r.lat) != null && num(r.lon) != null;
    const d = document.createElement('div'); d.className = 'ov'; d.tabIndex = 0; d.setAttribute('role', 'button');
    d.innerHTML = `<h4>${esc(r.name)}</h4>${pill(c ? c.score : null)}
      <div class="muted" style="font-size:13px;margin-top:6px">${ok ? '' : 'Coordonnées à renseigner'}${c && c.headline ? (ok ? '' : ' · ') + esc(c.headline) : ''}</div>
      ${c && c.lastOuting ? `<div style="font-size:13px;margin-top:4px">Dernière sortie C2C : ${esc(c.lastOuting)}</div>` : ''}
      ${c && c.bera ? `<div style="font-size:13px">BERA : ${esc(c.bera)}</div>` : ''}`;
    d.addEventListener('click', () => select(i));
    d.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i); } });
    $('overview').appendChild(d);
  });
}
function resetPanels() {
  $('formation').innerHTML = '<span class="muted">Renseigner latitude, longitude et altitude puis lancer l\'analyse.</span>';
  $('chart').textContent = '—'; $('outings').innerHTML = ''; status('outStatus', '');
  $('bera').textContent = '—'; $('decision').textContent = 'Analyse non lancée.'; $('decision').style.borderLeftColor = '';
}
function select(i) {
  readForm(); persist(); current = i; renderTabs(); fillForm();
  $('searchResults').innerHTML = ''; status('searchStatus', ''); $('routeInfo').textContent = '';
  const c = cache[routes[i].key]; if (c && c.model) showAnalysis(c); else resetPanels();
}

// ---------- Camptocamp ----------
async function searchC2C() {
  readForm(); const q = routes[current].query || '';
  if (q.length < 3) return status('searchStatus', 'Saisir au moins 3 caractères.', 'warn');
  status('searchStatus', 'Recherche en cours…'); $('searchResults').innerHTML = '';
  try {
    const list = (await getJSON(api('/api/routes?q=' + encodeURIComponent(q)))).results || [];
    if (!list.length) return status('searchStatus', 'Aucun itinéraire trouvé. Essayer le nom du sommet seul.', 'warn');
    status('searchStatus', list.length + ' itinéraire(s). Sélectionner la bonne voie.', 'ok');
    list.forEach(it => {
      const row = document.createElement('div'); row.className = 'item';
      row.innerHTML = `<div><strong>${esc(it.title)}</strong><br><small>ID ${esc(it.id)}${it.elevation_max ? ' · ' + esc(it.elevation_max) + ' m' : ''}${it.orientations.length ? ' · ' + esc(it.orientations.join('/')) : ''}</small></div>`;
      const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Utiliser';
      b.addEventListener('click', () => applyRoute(it)); row.appendChild(b); $('searchResults').appendChild(row);
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
  fillForm(); persist(); $('searchResults').innerHTML = ''; renderOverview();
  status('searchStatus', 'Itinéraire appliqué. Vérifier les coordonnées (le point C2C est parfois au sommet).', 'ok');
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

// ---------- météo (Open-Meteo, appel direct) ----------
async function fetchWeather(lat, lon, alt) {
  const p = new URLSearchParams({ latitude: lat, longitude: lon, timezone: 'Europe/Paris', past_days: '14', forecast_days: '4',
    hourly: 'temperature_2m,precipitation,snowfall,freezing_level_height,wind_speed_10m' });
  if (alt != null) p.set('elevation', alt);
  const h = (await getJSON('https://api.open-meteo.com/v1/forecast?' + p, 20000)).hourly;
  return h.time.map((t, i) => ({ t: new Date(t), T: h.temperature_2m[i], P: h.precipitation[i] || 0, S: h.snowfall[i] || 0, w: h.wind_speed_10m[i] || 0 })).filter(x => x.T != null);
}
function formationModel(rows, ori) {
  const now = Date.now(), H = 3600e3;
  const past = hrs => rows.filter(r => +r.t <= now && +r.t > now - hrs * H);
  const fut = rows.filter(r => +r.t > now && +r.t <= now + 72 * H);
  const p10 = past(240), p14 = past(336), p72 = past(72);
  const fdh = p10.reduce((s, r) => s + Math.max(0, -r.T), 0);
  const precip = p14.reduce((s, r) => s + r.P, 0);
  const snow = p14.reduce((s, r) => s + r.S, 0);
  const warmH = p72.filter(r => r.T > 1).length;
  const days = {}; p10.forEach(r => { const k = r.t.toISOString().slice(0, 10); (days[k] = days[k] || []).push(r.T); });
  const cycles = Object.values(days).filter(v => Math.min(...v) <= -2 && Math.max(...v) >= 1).length;
  const futMin = fut.length ? Math.min(...fut.map(r => r.T)) : null;
  const futMax = fut.length ? Math.max(...fut.map(r => r.T)) : null;
  const futCold = fut.filter(r => r.T < -2).length;
  const windMax = fut.length ? Math.max(...fut.map(r => r.w)) : 0;
  const shady = ['N', 'NE', 'NW'].includes(ori), sunny = ['S', 'SE', 'SW'].includes(ori);
  let s = clamp(fdh / 1200, 0, 1) * 40 + clamp(precip / 35, 0, 1) * 20 + clamp(cycles / 4, 0, 1) * 15 + clamp(futCold / 48, 0, 1) * 15 - clamp(warmH / 24, 0, 1) * 30;
  if (futMax != null && futMax > 3) s -= 10;
  if (snow > 60) s -= 8;
  s += shady ? 10 : sunny ? -10 : 0;
  const notes = [];
  if (fdh < 300) notes.push('froid accumulé insuffisant');
  if (precip < 8) notes.push('peu d\'humidité récente : ligne probablement sèche');
  if (warmH > 12) notes.push('redoux récent : glace possiblement dégradée');
  if (cycles >= 2) notes.push('cycles gel/dégel favorables à la transformation');
  if (futMax != null && futMax > 3) notes.push('redoux annoncé dans les 72 h');
  if (snow > 60) notes.push('fort cumul de neige récent');
  if (windMax > 50) notes.push(`vent fort prévu (${Math.round(windMax)} km/h) : transport de neige`);
  return { score: Math.round(clamp(s, 0, 100)), fdh: Math.round(fdh), precip: Math.round(precip), snow: Math.round(snow), warmH, cycles, futMin, futMax, notes };
}
function drawChart(rows) {
  if (!rows || rows.length < 2) { $('chart').textContent = 'Pas de données.'; return; }
  const W = 1000, Hh = 260, pl = 40, pr = 10, pt = 14, pb = 26;
  const t0 = +rows[0].t, t1 = +rows[rows.length - 1].t;
  const Ts = rows.map(r => r.T), tmin = Math.floor(Math.min(...Ts, -10)), tmax = Math.ceil(Math.max(...Ts, 5));
  const pmax = Math.max(2, ...rows.map(r => r.P));
  const X = t => pl + (t - t0) / (t1 - t0) * (W - pl - pr);
  const Y = v => pt + (tmax - v) / (tmax - tmin) * (Hh - pt - pb);
  const YP = v => Hh - pb - v / pmax * (Hh - pt - pb) * 0.5;
  let s = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Température et précipitations">`;
  for (let v = Math.ceil(tmin / 5) * 5; v <= tmax; v += 5) s += `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="currentColor" opacity=".12"/><text x="4" y="${Y(v) + 4}">${v}°</text>`;
  s += `<line x1="${pl}" x2="${W - pr}" y1="${Y(0)}" y2="${Y(0)}" stroke="#c8332b" stroke-dasharray="4 4"/>`;
  const bw = Math.max(1, (W - pl - pr) / rows.length);
  rows.forEach(r => { if (r.P > 0) s += `<rect x="${X(+r.t)}" y="${YP(r.P)}" width="${bw}" height="${Hh - pb - YP(r.P)}" fill="${r.S > 0 ? '#7fb3ff' : '#3a8fd9'}" opacity=".75"/>`; });
  s += `<polyline fill="none" stroke="#1f63d6" stroke-width="2" points="${rows.map(r => X(+r.t).toFixed(1) + ',' + Y(r.T).toFixed(1)).join(' ')}"/>`;
  const now = Date.now();
  if (now > t0 && now < t1) s += `<line x1="${X(now)}" x2="${X(now)}" y1="${pt}" y2="${Hh - pb}" stroke="#b86a00" stroke-width="2"/><text x="${X(now) + 4}" y="${pt + 10}">maintenant</text>`;
  for (let t = t0; t <= t1; t += 2 * 86400e3) { const d = new Date(t); s += `<text x="${X(t)}" y="${Hh - 8}">${d.getDate()}/${d.getMonth() + 1}</text>`; }
  $('chart').innerHTML = s + '</svg><div class="muted" style="font-size:12px">Courbe : température horaire à l\'altitude saisie · barres : précipitations (bleu clair = neige) · pointillé rouge : 0 °C · source Open-Meteo.</div>';
}

// ---------- sorties ----------
const COND = { excellent: ['Excellentes', 'p-green'], good: ['Bonnes', 'p-green'], average: ['Moyennes', 'p-amber'], poor: ['Mauvaises', 'p-red'], awful: ['Exécrables', 'p-red'] };
async function fetchOutings(r) {
  let url;
  if ($('outMode').value === 'route' && /^\d+$/.test(r.c2cId)) url = '/api/outings?route=' + r.c2cId;
  else if (num(r.lat) != null && num(r.lon) != null) url = `/api/outings?lat=${num(r.lat)}&lon=${num(r.lon)}&radius=5000`;
  else throw new Error('ID C2C ou coordonnées requis');
  return (await getJSON(api(url))).results || [];
}
function renderOutings(list) {
  $('outings').innerHTML = '';
  if (!list.length) return status('outStatus', 'Aucune sortie trouvée.', 'warn');
  status('outStatus', list.length + ' sortie(s), de la plus récente à la plus ancienne.', 'ok');
  const now = Date.now();
  list.slice(0, 12).forEach(o => {
    const age = o.date_start ? Math.round((now - new Date(o.date_start)) / 86400e3) : null;
    const tag = age == null ? ['?', ''] : age <= 7 ? ['Récente', 'p-green'] : age <= 21 ? ['< 3 sem.', 'p-amber'] : ['Ancienne', ''];
    const c = COND[o.condition_rating];
    const el = document.createElement('div'); el.className = 'item';
    el.innerHTML = `<div><strong>${esc(o.title)}</strong><br><small>${esc(o.date_start || '?')}${age != null ? ' · il y a ' + age + ' j' : ''}</small>
      ${o.summary ? `<div style="font-size:13px;margin-top:4px">${esc(o.summary)}</div>` : ''}</div>
      <div style="text-align:right;white-space:nowrap"><span class="pill ${tag[1]}">${tag[0]}</span><br>
      ${c ? `<span class="pill ${c[1]}" style="margin-top:4px">${c[0]}</span><br>` : ''}
      <a href="${esc(o.url)}" target="_blank" rel="noopener" style="font-size:13px">Voir</a></div>`;
    $('outings').appendChild(el);
  });
}

// ---------- BERA ----------
async function fetchBera(m) {
  if (!/^\d+$/.test(m || '')) return { info: 'ID de massif non renseigné.' };
  try { return await getJSON(api('/api/bera?massif=' + m)); }
  catch (e) { return { info: e.body && e.body.configured === false ? 'Clé API Météo-France non configurée (voir README).' : 'BERA indisponible : ' + e.message }; }
}
function renderBera(b) {
  if (!b || b.info) { $('bera').innerHTML = `<span class="muted">${esc(b ? b.info : '—')}</span>`; return; }
  const r = parseInt(b.risque_max, 10), cls = r >= 4 ? 'p-red' : r === 3 ? 'p-amber' : r >= 1 ? 'p-green' : '';
  $('bera').innerHTML = `<div><span class="pill ${cls}" style="font-size:16px">Risque ${esc(b.risque_max || '?')}/5</span> <b>${esc(b.massif || '')}</b></div>
    <div class="muted" style="font-size:13px;margin:6px 0">Émis ${esc(b.emission || '?')} · valide jusqu'au ${esc(b.validite || '?')}</div>
    ${b.risque2 ? `<div>Risque ${esc(b.risque1)} ${esc(b.alti1 || '')} · risque ${esc(b.risque2)} ${esc(b.alti2 || '')}</div>` : ''}
    ${b.commentaire ? `<p>${esc(b.commentaire)}</p>` : ''}${b.stabilite ? `<p style="font-size:13px">${esc(b.stabilite.slice(0, 700))}</p>` : ''}`;
}

// ---------- analyse ----------
async function analyze(idx, render) {
  const r = routes[idx], lat = num(r.lat), lon = num(r.lon), alt = num(r.alt);
  if (lat == null || lon == null) throw new Error('latitude et longitude requises');
  const [wx, outs, bera] = await Promise.all([
    fetchWeather(lat, lon, alt),
    fetchOutings(r).catch(e => ({ error: e.message })),
    fetchBera(r.massif)
  ]);
  const m = formationModel(wx, r.ori), list = Array.isArray(outs) ? outs : [], last = list[0];
  const res = { score: m.score, model: m, wx, outings: outs, beraData: bera, headline: m.notes[0] || 'pas de signal particulier',
    lastOuting: last ? last.date_start + (COND[last.condition_rating] ? ' (' + COND[last.condition_rating][0].toLowerCase() + ')' : '') : null,
    bera: bera && bera.risque_max ? bera.risque_max + '/5' : null };
  cache[r.key] = res; if (render) showAnalysis(res); renderOverview(); return res;
}
function showAnalysis(res) {
  const m = res.model, col = m.score >= 65 ? 'var(--green)' : m.score >= 40 ? 'var(--amber)' : 'var(--red)';
  const f = v => v != null ? Math.round(v) : '?';
  $('formation').innerHTML = `<div class="score" style="color:${col}">${m.score}<span style="font-size:18px">/100</span></div>
    <div class="gauge"><div style="width:${m.score}%;background:${col}"></div></div>
    <div class="kpis">
      <div class="kpi"><b>${m.fdh}</b><span>degrés-heures de gel (10 j)</span></div>
      <div class="kpi"><b>${m.precip} mm</b><span>précipitations (14 j)</span></div>
      <div class="kpi"><b>${m.snow} cm</b><span>neige fraîche (14 j)</span></div>
      <div class="kpi"><b>${m.cycles}</b><span>cycles gel/dégel (10 j)</span></div>
      <div class="kpi"><b>${m.warmH} h</b><span>au-dessus de 1 °C (72 h)</span></div>
      <div class="kpi"><b>${f(m.futMin)} / ${f(m.futMax)} °C</b><span>min / max prévus (72 h)</span></div>
    </div>
    <ul style="margin:10px 0 0;padding-left:18px">${m.notes.map(n => `<li>${esc(n)}</li>`).join('') || '<li>Pas de signal particulier.</li>'}</ul>`;
  drawChart(res.wx);
  if (Array.isArray(res.outings)) renderOutings(res.outings); else { $('outings').innerHTML = ''; status('outStatus', 'Sorties indisponibles : ' + res.outings.error, 'warn'); }
  renderBera(res.beraData);
  const lvl = res.beraData && parseInt(res.beraData.risque_max, 10);
  const recent = Array.isArray(res.outings) ? res.outings.filter(o => o.date_start && (Date.now() - new Date(o.date_start)) / 86400e3 <= 10) : [];
  let txt, c;
  if (lvl >= 4) { txt = 'Risque avalanche fort : course déconseillée quelles que soient les conditions de glace.'; c = 'var(--red)'; }
  else if (m.score >= 65 && lvl === 3) { txt = 'Formation probablement favorable, mais BERA 3 : uniquement si approche, voie et descente évitent les pentes et orientations signalées.'; c = 'var(--amber)'; }
  else if (m.score >= 65) { txt = 'Fenêtre potentiellement intéressante, à confirmer par un retour terrain récent et Data-Avalanche.'; c = 'var(--green)'; }
  else if (m.score >= 40) { txt = 'Formation incertaine : attendre un retour terrain ou une nouvelle période froide.'; c = 'var(--amber)'; }
  else { txt = 'Conditions de formation peu probables actuellement.'; c = 'var(--red)'; }
  if (recent.length) txt += ` ${recent.length} sortie(s) C2C de moins de 10 jours à consulter en priorité.`;
  if (!lvl) txt += ' BERA non intégré : vérifier le bulletin du massif.';
  $('decision').textContent = txt; $('decision').style.borderLeftColor = c;
}

// ---------- événements ----------
$('search').addEventListener('click', searchC2C);
$('query').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); searchC2C(); } });
$('loadRoute').addEventListener('click', loadRouteById);
$('save').addEventListener('click', () => { readForm(); persist(); fillForm(); renderOverview(); status('searchStatus', 'Paramètres enregistrés.', 'ok'); });
$('analyze').addEventListener('click', async () => {
  readForm(); persist(); $('decision').textContent = 'Analyse en cours…';
  try { await analyze(current, true); } catch (e) { $('decision').textContent = 'Analyse impossible : ' + e.message; }
});
$('loadOutings').addEventListener('click', async () => {
  readForm(); status('outStatus', 'Chargement…');
  try { renderOutings(await fetchOutings(routes[current])); } catch (e) { status('outStatus', 'Sorties indisponibles : ' + e.message, 'bad'); }
});
$('analyzeAll').addEventListener('click', async () => {
  readForm(); persist(); const b = $('analyzeAll'); b.disabled = true; b.textContent = 'Analyse…';
  for (let i = 0; i < routes.length; i++) {
    try { await analyze(i, i === current); } catch (e) { cache[routes[i].key] = { score: null, headline: e.message }; renderOverview(); }
  }
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

loadConfig().then(() => {
  if (!routes.length) { $('title').textContent = 'config/routes.json introuvable'; return; }
  renderTabs(); fillForm(); renderOverview(); resetPanels();
});
})();
