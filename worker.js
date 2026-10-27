import { onRequestGet as routes } from './api/routes.js';
import { onRequestGet as outings } from './api/outings.js';
import { onRequestGet as bera } from './api/bera.js';

const API = { '/api/routes': routes, '/api/outings': outings, '/api/bera': bera };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      const handler = API[url.pathname];
      if (!handler) return new Response(JSON.stringify({ error: 'Route API inconnue' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      if (request.method !== 'GET') return new Response('Méthode non autorisée', { status: 405 });
      return handler({ request, env, ctx });
    }
    return env.ASSETS.fetch(request);
  }
};
