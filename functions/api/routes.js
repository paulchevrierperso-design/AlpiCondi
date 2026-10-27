import { c2cGet, json, toWgs84, locale } from './_c2c.js';
export async function onRequestGet({ request }) {
  const u = new URL(request.url);
  const id = (u.searchParams.get('id') || '').trim();
  const q = (u.searchParams.get('q') || '').trim();
  try {
    if (id) {
      if (!/^\d+$/.test(id)) return json({ error: 'ID invalide' }, 400, 0);
      const d = await c2cGet(`/routes/${id}?cook=fr`);
      const loc = locale(d); const pos = toWgs84(d.geometry && d.geometry.geom);
      return json({ id: d.document_id, title: [loc.title_prefix, loc.title].filter(Boolean).join(' : '),
        lat: pos && pos.lat, lon: pos && pos.lon, elevation_max: d.elevation_max, elevation_min: d.elevation_min,
        height_diff_difficulties: d.height_diff_difficulties, orientations: d.orientations || [],
        ice_rating: d.ice_rating, mixed_rating: d.mixed_rating, global_rating: d.global_rating,
        engagement_rating: d.engagement_rating, url: `https://www.camptocamp.org/routes/${d.document_id}` }, 200, 3600);
    }
    if (q.length < 3) return json({ error: 'Recherche trop courte' }, 400, 0);
    const data = await c2cGet(`/routes?q=${encodeURIComponent(q)}&pl=fr&limit=15`);
    return json({ results: (data.documents || []).map(d => {
      const loc = locale(d); const pos = toWgs84(d.geometry && d.geometry.geom);
      return { id: d.document_id, title: [loc.title_prefix, loc.title].filter(Boolean).join(' : '),
        lat: pos && pos.lat, lon: pos && pos.lon, elevation_max: d.elevation_max, orientations: d.orientations || [] };
    }) }, 200, 900);
  } catch (e) { return json({ error: 'Camptocamp indisponible', detail: String(e.message || e) }, 502, 0); }
}
