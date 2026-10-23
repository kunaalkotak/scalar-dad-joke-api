'use strict';

const { createServer, API_PREFIX, UPSTREAM_BASE } = require('./src/app');

const PORT = Number(process.env.PORT) || 3000;
// 127.0.0.1 = only this computer can connect (safer on shared campus Wi-Fi).
const HOST = process.env.HOST || '127.0.0.1';

// The Dad Joke API asks every client to send a User-Agent that names the
// project and gives a contact. TODO (group): replace the placeholder below
// with your real repository URL, or set the USER_AGENT environment variable.
const USER_AGENT =
  process.env.USER_AGENT ||
  'scalar-dad-joke-api college project (https://github.com/kunaalkotak/scalar-dad-joke-api.git)';

const server = createServer({ userAgent: USER_AGENT });

server.listen(PORT, HOST, () => {
  console.log(`Scalar docs:      http://localhost:${PORT}/`);
  console.log(`OpenAPI file:     http://localhost:${PORT}/openapi.yaml`);
  console.log(`Proxy base URL:   http://localhost:${PORT}${API_PREFIX}  ->  ${UPSTREAM_BASE}`);
  if (PORT !== 3000) {
    console.log('NOTE: openapi.yaml lists http://localhost:3000/api as its server. Edit it if you change PORT.');
  }
  console.log('Press Ctrl+C to stop.');
});
