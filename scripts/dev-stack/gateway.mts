// Supabase API 게이트웨이 흉내 (http://127.0.0.1:54321): Kong 대신 경로별로 나눠 준다.
//   /auth/v1/*       개발용 인증 서버
//   /rest/v1/*       PostgREST (apikey 만 있으면 Authorization 으로 옮긴다 — Kong 과 같은 동작)
//   /realtime/v1/*   Realtime 흉내 (웹소켓)
//   /_dev/mail       개발용 메일함 (매직링크·직원 초대 링크)
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';

import { handleAuth } from './auth.mts';
import type { AuthStore } from './auth-store.mts';
import { PORTS } from './config.mts';
import { renderMailbox } from './mailbox.mts';

interface Realtime {
  upgrade: (req: IncomingMessage, socket: Duplex) => void;
}

const EXPOSED_HEADERS =
  'content-range, content-location, preference-applied, x-supabase-api-version, location';

function cors(req: IncomingMessage, res: ServerResponse): void {
  res.setHeader('access-control-allow-origin', req.headers.origin ?? '*');
  res.setHeader('access-control-allow-credentials', 'true');
  res.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
  res.setHeader(
    'access-control-allow-headers',
    req.headers['access-control-request-headers'] ??
      'authorization, apikey, content-type, x-client-info, prefer',
  );
  res.setHeader('access-control-expose-headers', EXPOSED_HEADERS);
  res.setHeader('access-control-max-age', '86400');
}

/** /rest/v1/* → PostgREST. 본문·응답은 흘려보낸다 */
function proxyRest(req: IncomingMessage, res: ServerResponse, url: URL): void {
  const headers = { ...req.headers };
  delete headers.host;
  if (!headers.authorization && typeof headers.apikey === 'string')
    headers.authorization = `Bearer ${headers.apikey}`;
  const upstream = http.request(
    {
      host: '127.0.0.1',
      port: PORTS.postgrest,
      method: req.method,
      path: `${url.pathname.replace(/^\/rest\/v1/, '') || '/'}${url.search}`,
      headers,
    },
    (response) => {
      const passHeaders = { ...response.headers };
      // CORS 는 게이트웨이가 정한다
      for (const name of Object.keys(passHeaders))
        if (name.startsWith('access-control-')) delete passHeaders[name];
      res.writeHead(response.statusCode ?? 502, passHeaders);
      response.pipe(res);
    },
  );
  upstream.on('error', (error) => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: `PostgREST 에 연결하지 못했습니다: ${error.message}` }));
  });
  req.pipe(upstream);
}

export function startGateway(store: AuthStore, realtime: Realtime): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
    cors(req, res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    const route = url.pathname;
    if (route.startsWith('/rest/v1')) return proxyRest(req, res, url);
    if (route.startsWith('/auth/v1')) {
      handleAuth(req, res, url, store).catch((error: unknown) => {
        console.error('[auth]', error);
        if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ code: 500, error_code: 'unexpected_failure', msg: String(error) }));
      });
      return;
    }
    if (route === '/_dev/mail') {
      renderMailbox(store)
        .then((html) => {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end(html);
        })
        .catch((error: unknown) => {
          res.writeHead(500);
          res.end(String(error));
        });
      return;
    }
    res.writeHead(route === '/' ? 200 : 404, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify(route === '/' ? { name: 'gymjjim dev stack' } : { message: `없는 경로: ${route}` }),
    );
  });

  server.on('upgrade', (req, socket) => {
    if ((req.url ?? '').startsWith('/realtime/v1/websocket')) realtime.upgrade(req, socket);
    else socket.destroy();
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORTS.gateway, '127.0.0.1', () => resolve(server));
  });
}
