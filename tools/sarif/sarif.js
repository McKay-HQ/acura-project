// Shared helpers for turning tool output into SARIF 2.1.0, which GitHub code scanning reads
// (docs/ci.md#sarif). Paths are relative to the repo root, with forward slashes.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** A repo-relative, forward-slash path for a file. */
export function repoPath(file) {
    return path.relative(ROOT, path.resolve(ROOT, file)).split(path.sep).join('/');
}

/** One SARIF result at a file position. */
export function result({ ruleId, level, message, file, line, column, endLine, endColumn }) {
    const region = { startLine: Math.max(line || 1, 1), startColumn: Math.max(column || 1, 1) };
    if (endLine) region.endLine = endLine;
    if (endColumn) region.endColumn = endColumn;
    return {
        ...(ruleId ? { ruleId } : {}),
        level,
        message: { text: message },
        locations: [
            { physicalLocation: { artifactLocation: { uri: repoPath(file), uriBaseId: '%SRCROOT%' }, region } },
        ],
    };
}

/** A whole SARIF log with one run. */
export function sarifLog({ name, version, informationUri, rules, results }) {
    return {
        $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
        version: '2.1.0',
        runs: [
            {
                tool: { driver: { name, ...(version ? { version } : {}), informationUri, rules } },
                originalUriBaseIds: { '%SRCROOT%': { uri: `file://${ROOT}/` } },
                results,
            },
        ],
    };
}
