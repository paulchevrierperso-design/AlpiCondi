import { c2cGet, json, toWgs84, locale } from './_c2c.js';
// GET /api/routes?q=texte | ?id=123 | ?lat=..&lon=..&radius=3000 (itinéraires proches)
import { toMercator } from './_c2c.js';
function map(d) {
  const loc = locale(d); const pos = toWgs84(d.geometry && d.geometry.geom);
  return { id: d.document_id, title: [loc.title_prefix, loc.title].filter(Boolean).join(' : '), lat: pos && pos.lat, lon: pos && pos.lon,
    elevation_max: d.elevation_max, orientations: d.orientations || [], ice_rating: d.ice_rating, mixed_rating: d.mixed_rating, global_rating: d.global_rating };
}
export async function onRequestGet({ request }) {
  const u = new URL(request.url);
  const id = (u.searchParams.get('id') || '').trim();
  const q = (u.searchParams.get('q') || '').trim();
  const lat = parseFloat(u.searchParams.get('lat')), lon = parseFloat(u.searchParams.get('lon'));
  try {
    if (id) {
      if (!/^\d+$/.test(id)) return json({ error: 'ID invalide' }, 400, 0);
      return json(map(await c2cGet(`/routes/${id}`)), 200, 3600);
    }
    if (isFinite(lat) && isFinite(lon)) {
      const r = Math.min(Math.max(parseInt(u.searchParams.get('radius') || '3000', 10), 300), 20000);
      const { x, y } = toMercator(lat, lon);
      const bbox = [x - r, y - r, x + r, y + r].map(Math.round).join(',');
      const data = await c2cGet(`/routes?bbox=${bbox}&act=snow_ice_mixed,ice_climbing&pl=fr&limit=30`);
      return json({ results: (data.documents || []).map(map) }, 200, 900);
    }
    if (q.length < 3) return json({ error: 'Recherche trop courte' }, 400, 0);
    const data = await c2cGet(`/routes?q=${encodeURIComponent(q)}&pl=fr&limit=15`);
    return json({ results: (data.documents || []).map(map) }, 200, 900);
  } catch (e) { return json({ error: 'Camptocamp indisponible', detail: String(e.message || e) }, 502, 0); }
}
