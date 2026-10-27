// Proxy minimal optionnel. À adapter à l’API publique Camptocamp effectivement autorisée et documentée.
// Ne déployez pas ce fichier sans vérifier l’endpoint, les conditions d’utilisation et le schéma de réponse.
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/route") return new Response("Not found", {status:404});
    const id = url.searchParams.get("id");
    if (!/^\d+$/.test(id || "")) return Response.json({error:"invalid id"},{status:400});
    return Response.json({
      name: `Voie Camptocamp ${id}`, altitudeMin: null, altitudeMax: null,
      latitude: null, longitude: null, source: "Proxy non configuré",
      warning: "Configurez l’endpoint Camptocamp après vérification de sa documentation et de ses conditions d’utilisation."
    }, {headers:{"Access-Control-Allow-Origin":"*","Cache-Control":"public, max-age=3600"}});
  }
};
