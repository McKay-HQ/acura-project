// Typechecks api/ and web/ (their own npm run typecheck), prints the compiler output, and writes it
// as SARIF: node tools/sarif/typecheck.js [output.sarif]. Exits 1 if either project has errors.
// Used by npm run typecheck:sarif and the Static Checks workflow.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, result, sarifLog } from './sarif.js';

const PROJECTS = ['api', 'web'];
// e.g. src/routes.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.
const LINE = /^(.+?)\((\d+),(\d+)\): (error|warning) (TS\d+): (.*)$/;

const output = process.argv[2] || 'typecheck.sarif';
const rules = new Map();
const found = [];
let failed = false;

for (const project of PROJECTS) {
    const run = spawnSync('npm', ['run', '-s', 'typecheck', '--', '--pretty', 'false'], {
        cwd: path.join(ROOT, project),
        encoding: 'utf8',
    });
    const text = `${run.stdout}${run.stderr}`;
    console.log(`${project}: ${run.status === 0 ? 'no type errors' : 'type errors'}`);
    if (text.trim()) console.log(text.trimEnd());
    if (run.status !== 0) failed = true;
    let last = null;
    for (const line of text.split('\n')) {
        const match = LINE.exec(line);
        if (match) {
            const [, file, row, col, level, code, message] = match;
            rules.set(code, { id: code, shortDescription: { text: `TypeScript ${code}` } });
            last = result({
                ruleId: code,
                level,
                message,
                file: path.join(project, file),
                line: Number(row),
                column: Number(col),
            });
            found.push(last);
        } else if (last && line.startsWith('  ')) {
            // Continuation lines of the previous message (elaborations like "Type X is missing ...").
            last.message.text += `\n${line.trim()}`;
        }
    }
}

const log = sarifLog({
    name: 'TypeScript',
    informationUri: 'https://www.typescriptlang.org',
    rules: [...rules.values()],
    results: found,
});
writeFileSync(path.resolve(output), `${JSON.stringify(log, null, 2)}\n`);
console.log(`Wrote ${found.length} result(s) to ${output}`);
process.exit(failed ? 1 : 0);
