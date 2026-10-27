// GET /api/bera?massif=ID — nécessite METEOFRANCE_API_KEY (variable secrète Cloudflare Pages)
export async function onRequestGet({ request, env }) {
  const massif = (new URL(request.url).searchParams.get('massif') || '').trim();
  const out = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': s === 200 ? 'public, max-age=1800' : 'no-store' } });
  if (!/^\d{1,3}$/.test(massif)) return out({ error: 'Identifiant de massif invalide' }, 400);
  if (!env.METEOFRANCE_API_KEY) return out({ error: 'Clé API Météo-France non configurée', configured: false }, 503);
  try {
    const r = await fetch(`https://public-api.meteofrance.fr/public/DPBRA/v1/massif/BRA?id-massif=${massif}&format=xml`, { headers: { apikey: env.METEOFRANCE_API_KEY, Accept: '*/*' } });
    if (!r.ok) return out({ error: 'Météo-France HTTP ' + r.status }, 502);
    const xml = await r.text();
    const attr = (t, n) => { const m = xml.match(new RegExp(`<${t}\\b[^>]*\\b${n}="([^"]*)"`, 'i')); return m ? m[1] : null; };
    const text = t => { const m = xml.match(new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)</${t}>`, 'i')); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null; };
    return out({ configured: true, massif: attr('BULLETINS_NEIGE_AVALANCHE', 'MASSIF'), emission: attr('BULLETINS_NEIGE_AVALANCHE', 'DATEBULLETIN'),
      validite: attr('BULLETINS_NEIGE_AVALANCHE', 'DATEVALIDITE'), risque_max: attr('RISQUE', 'RISQUEMAXI'),
      risque1: attr('RISQUE', 'RISQUE1'), alti1: attr('RISQUE', 'LOC1'), risque2: attr('RISQUE', 'RISQUE2'), alti2: attr('RISQUE', 'LOC2'),
      commentaire: text('RISQUE') || attr('RISQUE', 'COMMENTAIRE'), stabilite: text('STABILITE') });
  } catch (e) { return out({ error: 'BERA indisponible', detail: String(e.message || e) }, 502); }
}
