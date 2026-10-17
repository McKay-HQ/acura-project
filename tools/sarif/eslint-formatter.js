// ESLint formatter that writes SARIF: eslint . --format ./tools/sarif/eslint-formatter.js
// Used by npm run lint:sarif and the Static Checks workflow.
import { ESLint } from 'eslint';
import { result, sarifLog } from './sarif.js';

export default function formatSarif(results, context) {
    const rules = new Map();
    const found = [];
    for (const file of results) {
        for (const msg of file.messages) {
            const ruleId = msg.ruleId || undefined;
            if (ruleId && !rules.has(ruleId)) {
                const meta = context.rulesMeta?.[ruleId];
                rules.set(ruleId, {
                    id: ruleId,
                    shortDescription: { text: meta?.docs?.description || ruleId },
                    ...(meta?.docs?.url ? { helpUri: meta.docs.url } : {}),
                });
            }
            found.push(
                result({
                    ruleId,
                    level: msg.severity === 2 ? 'error' : 'warning',
                    message: msg.message,
                    file: file.filePath,
                    line: msg.line,
                    column: msg.column,
                    endLine: msg.endLine,
                    endColumn: msg.endColumn,
                }),
            );
        }
    }
    const log = sarifLog({
        name: 'ESLint',
        version: ESLint.version,
        informationUri: 'https://eslint.org',
        rules: [...rules.values()],
        results: found,
    });
    return JSON.stringify(log, null, 2);
}
