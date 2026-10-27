import { c2cGet, json, toMercator, locale } from './_c2c.js';
export async function onRequestGet({ request }) {
  const u = new URL(request.url);
  const route = (u.searchParams.get('route') || '').trim();
  const lat = parseFloat(u.searchParams.get('lat')), lon = parseFloat(u.searchParams.get('lon'));
  const radius = Math.min(Math.max(parseInt(u.searchParams.get('radius') || '5000', 10), 500), 30000);
  try {
    let path;
    if (/^\d+$/.test(route)) path = `/outings?r=${route}&limit=20`;
    else if (isFinite(lat) && isFinite(lon)) {
      const { x, y } = toMercator(lat, lon);
      path = `/outings?bbox=${[x - radius, y - radius, x + radius, y + radius].map(Math.round).join(',')}&act=snow_ice_mixed,ice_climbing,mountain_climbing&limit=20`;
    } else return json({ error: 'Paramètre route ou lat/lon requis' }, 400, 0);
    const data = await c2cGet(path + '&pl=fr');
    const docs = (data.documents || []).map(d => { const loc = locale(d); return {
      id: d.document_id, title: loc.title || 'Sortie', date_start: d.date_start, date_end: d.date_end,
      condition_rating: d.condition_rating || null, summary: (loc.summary || '').slice(0, 400),
      url: `https://www.camptocamp.org/outings/${d.document_id}` }; })
      .sort((a, b) => String(b.date_start).localeCompare(String(a.date_start)));
    return json({ results: docs }, 200, 600);
  } catch (e) { return json({ error: 'Camptocamp indisponible', detail: String(e.message || e) }, 502, 0); }
}
