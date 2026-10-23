'use strict';
// Checks openapi.yaml: structure, $refs, examples vs. schemas, and consistency
// with what server.js actually implements.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SwaggerParser = require('@apidevtools/swagger-parser');
const Ajv2020 = require('ajv/dist/2020');
const { ROUTES, API_PREFIX, DEFAULTS } = require('../src/app');

const specPath = path.join(__dirname, '..', 'public', 'openapi.yaml');

test('openapi.yaml is a valid OpenAPI 3.1 document with all $refs resolving', async () => {
  const api = await SwaggerParser.validate(specPath);
  assert.equal(api.openapi, '3.1.0');
  assert.ok(api.info.title && api.info.version);
  assert.ok(api.tags.length >= 1);
});

test('the YAML documents exactly the routes the server implements', async () => {
  const api = await SwaggerParser.parse(specPath);
  assert.deepEqual(Object.keys(api.paths).sort(), [...ROUTES].sort());
  for (const item of Object.values(api.paths)) {
    assert.deepEqual(Object.keys(item), ['get'], 'only GET is implemented');
  }
});

test('every operation has operationId, summary, description and a 200 JSON response', async () => {
  const api = await SwaggerParser.validate(specPath);
  const ids = new Set();
  for (const [route, item] of Object.entries(api.paths)) {
    const op = item.get;
    for (const field of ['operationId', 'summary', 'description']) {
      assert.ok(op[field], `${route} is missing ${field}`);
    }
    assert.ok(!ids.has(op.operationId), 'operationId must be unique');
    ids.add(op.operationId);
    assert.ok(op.responses['200'].content['application/json'].schema, `${route} 200 needs a schema`);
  }
});

test('default server is the local proxy and the official API is listed as the alternative', async () => {
  const api = await SwaggerParser.parse(specPath);
  assert.equal(api.servers[0].url, `http://localhost:3000${API_PREFIX}`);
  assert.equal(api.servers[1].url, 'https://icanhazdadjoke.com');
});

test('search parameters match the verified API facts and the proxy validation', async () => {
  const api = await SwaggerParser.validate(specPath);
  const params = Object.fromEntries(api.paths['/search'].get.parameters.map((p) => [p.name, p]));
  assert.deepEqual(Object.keys(params).sort(), ['limit', 'page', 'term']);
  assert.equal(params.limit.schema.maximum, 30); // official docs: max 30
  assert.equal(params.limit.schema.default, 20); // official docs: default 20
  assert.equal(params.page.schema.default, 1); //   official docs: default 1
  assert.equal(params.term.schema.maxLength, 100); // enforced by our proxy
  assert.equal(api.paths['/j/{joke_id}'].get.parameters[0].required, true);
});

test('the documented cache TTLs in the YAML match the TTLs in the code', () => {
  const text = fs.readFileSync(specPath, 'utf8');
  assert.equal(DEFAULTS.ttlMs.random, 10_000);
  assert.match(text, /up to\s+\*\*10 seconds\*\*/);
  assert.equal(DEFAULTS.ttlMs.joke, 3_600_000);
  assert.match(text, /\*\*1 hour\*\*/);
  assert.equal(DEFAULTS.ttlMs.search, 300_000);
  assert.match(text, /\*\*5 minutes\*\*/);
  assert.equal(DEFAULTS.upstreamLimit.max, 30);
  assert.match(text, /30 requests per minute/);
  assert.equal(DEFAULTS.upstreamTimeoutMs, 8_000);
  assert.match(text, /within 8 seconds/);
});

test('every example in the YAML validates against its own schema', async () => {
  const api = await SwaggerParser.validate(specPath); // $refs are replaced by the real schemas
  const ajv = new Ajv2020({ strict: false });
  let checked = 0;

  const visit = (responses) => {
    for (const response of Object.values(responses)) {
      for (const media of Object.values(response.content || {})) {
        for (const example of Object.values(media.examples || {})) {
          const validate = ajv.compile(media.schema);
          assert.ok(validate(example.value), JSON.stringify(validate.errors));
          checked += 1;
        }
      }
    }
  };

  for (const item of Object.values(api.paths)) visit(item.get.responses);
  assert.ok(checked >= 7, `expected at least 7 examples, checked ${checked}`);
});

test('a deliberately broken document is rejected (proves the validator really validates)', async () => {
  const broken = {
    openapi: '3.1.0',
    info: { title: 'broken', version: '1' },
    paths: { '/x': { get: { responses: { 200: { $ref: '#/components/responses/DoesNotExist' } } } } },
  };
  await assert.rejects(() => SwaggerParser.validate(broken));
});
