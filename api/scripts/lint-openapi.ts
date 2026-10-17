// Checks the OpenAPI document built from the @openapi blocks (npm run lint:openapi):
//   1. it is a valid OpenAPI document (@apidevtools/swagger-parser: schema + $ref resolution);
//   2. dist/ (if built) yields the same document as src/;
//   3. every route registered on the /api router is documented with the same method, and vice versa.
// Runs against src/ with tsx; no database is needed.
import fs from 'node:fs';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { ILayer } from 'express-serve-static-core';

// routes.ts imports config.ts, which insists on a database setting. Nothing connects here (pg pools
// connect lazily), so any placeholder will do.
process.env.PGHOST ??= 'localhost';

const { spec } = await import('../src/openapi.js');
const { api } = await import('../src/routes.js');

let failed = false;
const fail = (msg: string): void => {
    failed = true;
    console.error(`  ✗ ${msg}`);
};

// ---- 1. validity ----
try {
    // validate() dereferences in place, so give it a copy.
    await SwaggerParser.validate(structuredClone(spec) as Parameters<typeof SwaggerParser.validate>[0]);
    console.log('✓ OpenAPI document is valid');
} catch (err) {
    fail(`OpenAPI document is invalid: ${err instanceof Error ? err.message : String(err)}`);
}

// ---- 2. the compiled API sees the same blocks (tsc drops comments it cannot attach to emitted code) ----
const distSpec = new URL('../dist/openapi.js', import.meta.url);
if (fs.existsSync(distSpec)) {
    const dist: { spec: unknown } = await import(distSpec.href);
    if (JSON.stringify(dist.spec) === JSON.stringify(spec)) console.log('✓ dist/ builds the same document as src/');
    else fail('dist/ builds a different document than src/ - rebuild, or an @openapi block lost its comment in tsc');
} else {
    console.log('- dist/ not built; skipped the src/dist comparison');
}

// ---- 3. routes vs. documented operations ----
const HTTP = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']);

/** "METHOD /path" for every route on a router, following routers mounted at its root (the docs router). */
function routesOf(stack: ILayer[]): string[] {
    return stack.flatMap((layer) => {
        if (layer.route) {
            const methods = new Set(
                layer.route.stack.map((handler) => handler.method).filter((method) => HTTP.has(method)),
            );
            // Express ':param' → OpenAPI '{param}'; '/docs' is documented as '/docs/' (it redirects there).
            const path = layer.route.path.replace(/:(\w+)/g, '{$1}').replace(/^\/docs$/, '/docs/');
            return [...methods].map((method) => `${method.toUpperCase()} ${path}`);
        }
        // A mounted express.Router is a function with its own `stack`.
        const nested: unknown = (layer.handle as { stack?: unknown }).stack;
        return layer.name === 'router' && Array.isArray(nested) ? routesOf(nested as ILayer[]) : [];
    });
}

const registered = new Set(routesOf(api.stack));
const paths = (spec as { paths?: Record<string, Record<string, unknown>> }).paths ?? {};
const documented = new Set(
    Object.entries(paths).flatMap(([path, item]) =>
        Object.keys(item)
            .filter((method) => HTTP.has(method))
            .map((method) => `${method.toUpperCase()} ${path}`),
    ),
);

for (const route of registered) if (!documented.has(route)) fail(`route not documented: ${route}`);
for (const operation of documented) if (!registered.has(operation)) fail(`documented but not registered: ${operation}`);
if (!failed) console.log(`✓ all ${registered.size} routes are documented, and nothing else`);

process.exit(failed ? 1 : 0);
