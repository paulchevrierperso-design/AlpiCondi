export const C2C = 'https://api.camptocamp.org';
export function json(data, status = 200, maxAge = 600) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${maxAge}` } });
}
export async function c2cGet(path) {
  const r = await fetch(C2C + path, { headers: { Accept: 'application/json', 'User-Agent': 'veille-goulottes/3.0' }, cf: { cacheTtl: 600, cacheEverything: true } });
  if (!r.ok) throw new Error('Camptocamp HTTP ' + r.status);
  return r.json();
}
// Camptocamp stocke les géométries en EPSG:3857
export function toWgs84(geom) {
  try {
    const g = typeof geom === 'string' ? JSON.parse(geom) : geom;
    if (!g || !g.coordinates) return null;
    const [x, y] = g.type === 'Point' ? g.coordinates : g.coordinates[0];
    if (Math.abs(x) <= 180 && Math.abs(y) <= 90) return { lat: y, lon: x };
    const lon = (x / 6378137) * (180 / Math.PI);
    const lat = (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * (180 / Math.PI);
    return { lat: +lat.toFixed(5), lon: +lon.toFixed(5) };
  } catch { return null; }
}
export function toMercator(lat, lon) {
  return { x: lon * Math.PI / 180 * 6378137, y: Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 6378137 };
}
export function locale(doc) { const l = doc.locales || []; return l.find(x => x.lang === 'fr') || l[0] || {}; }
