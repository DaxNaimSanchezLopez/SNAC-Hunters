// Servidor local: ejecuta exactamente el mismo router que la Lambda, con almacenamiento en memoria.
// Uso: pnpm --filter @snac-hunters/api dev  ->  http://localhost:3001
import { createServer } from 'node:http';
import { handleRequest } from './app.js';
import { MemoryStore } from './store.js';

const PORT = Number(process.env.PORT ?? 3001);
const store = new MemoryStore();

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS).end();
    return;
  }
  let body = '';
  req.on('data', (chunk: Buffer) => (body += chunk.toString()));
  req.on('end', () => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    handleRequest({ method: req.method ?? 'GET', path, body: body || null, userId: 'guest' }, store)
      .then((r) => {
        console.log(`${req.method} ${path} -> ${r.statusCode}`);
        res
          .writeHead(r.statusCode, { ...CORS, 'Content-Type': 'application/json' })
          .end(JSON.stringify(r.body));
      })
      .catch((e: unknown) => {
        console.error(e);
        res.writeHead(500, CORS).end(JSON.stringify({ error: 'Error interno' }));
      });
  });
}).listen(PORT, () =>
  console.log(`API local (mismo handler que Lambda) en http://localhost:${PORT}`),
);
