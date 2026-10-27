import { json } from './_c2c.js';

// /api/bera?massif=ID  -> nécessite le secret METEOFRANCE_API_KEY
export async function onRequestGet({ request, env }) {
  const massif = (new URL(request.url).searchParams.get('massif') || '').trim();
  if (!/^\d{1,3}$/.test(massif)) return json({ error: 'Identifiant de massif invalide' }, 400);
  if (!env || !env.METEOFRANCE_API_KEY) return json({ error: 'Clé API Météo-France non configurée', configured: false }, 503);
  try {
    const r = await fetch(`https://public-api.meteofrance.fr/public/DPBRA/v1/massif/BRA?id-massif=${massif}&format=xml`, {
      headers: { apikey: env.METEOFRANCE_API_KEY, Accept: '*/*' }
    });
    if (!r.ok) return json({ error: 'Météo-France HTTP ' + r.status }, 502);
    const xml = await r.text();
    const attr = (tag, name) => { const m = xml.match(new RegExp(`<${tag}\\b[^>]*\\b${name}="([^"]*)"`, 'i')); return m ? m[1] : null; };
    const text = tag => { const m = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i')); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null; };
    return json({
      configured: true,
      massif: attr('BULLETINS_NEIGE_AVALANCHE', 'MASSIF'),
      emission: attr('BULLETINS_NEIGE_AVALANCHE', 'DATEBULLETIN'),
      validite: attr('BULLETINS_NEIGE_AVALANCHE', 'DATEVALIDITE'),
      risque_max: attr('RISQUE', 'RISQUEMAXI'),
      risque1: attr('RISQUE', 'RISQUE1'), alti1: attr('RISQUE', 'LOC1'),
      risque2: attr('RISQUE', 'RISQUE2'), alti2: attr('RISQUE', 'LOC2'),
      commentaire: text('RISQUE') || attr('RISQUE', 'COMMENTAIRE'),
      stabilite: text('STABILITE')
    }, 200, 1800);
  } catch (e) {
    return json({ error: 'BERA indisponible', detail: String(e.message || e) }, 502);
  }
}
