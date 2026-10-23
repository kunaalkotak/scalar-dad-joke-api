'use strict';

// Usage: npm run validate
// Parses public/openapi.yaml, checks it against the OpenAPI 3.1 rules and
// confirms that every $ref points at something that exists.
const path = require('node:path');
const SwaggerParser = require('@apidevtools/swagger-parser');

const specPath = path.join(__dirname, '..', 'public', 'openapi.yaml');

SwaggerParser.validate(specPath)
  .then((api) => {
    const operations = Object.entries(api.paths).flatMap(([p, item]) =>
      Object.keys(item)
        .filter((m) => ['get', 'post', 'put', 'patch', 'delete'].includes(m))
        .map((m) => `${m.toUpperCase()} ${p}  (${item[m].operationId})`),
    );
    console.log(`OpenAPI ${api.openapi} - "${api.info.title}" v${api.info.version}: VALID`);
    operations.forEach((o) => console.log('  ' + o));
  })
  .catch((error) => {
    console.error('Specification is NOT valid:\n' + error.message);
    process.exit(1);
  });
