// Runs shellcheck on the scripts in bin/ and lib/ (settings in .shellcheckrc), prints what it finds, and writes it as
// SARIF: node tools/sarif/shellcheck.js [output.sarif]. Exits 1 if shellcheck finds anything. Used by the Static
// Checks workflow; needs shellcheck installed (it is on GitHub's Ubuntu runners).
import { spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, repoPath, result, sarifLog } from './sarif.js';

const DIRS = ['bin', 'lib'];
// Shellcheck's severities, as SARIF levels.
const LEVELS = { error: 'error', warning: 'warning', info: 'note', style: 'note' };

const output = process.argv[2] || 'shellcheck.sarif';
// Every file in bin/ and lib/ is a script, except the YAML template in bin/deploy.d/.
const files = DIRS.flatMap((dir) =>
    readdirSync(path.join(ROOT, dir), { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && !entry.name.endsWith('.yaml'))
        .map((entry) => repoPath(path.join(entry.parentPath, entry.name))),
).sort();

const run = spawnSync('shellcheck', ['-f', 'json1', ...files], { cwd: ROOT, encoding: 'utf8' });
if (run.error) {
    console.error(`shellcheck: ${run.error.message}`);
    process.exit(2);
}
// Exit 1 means it found something; anything else above 0 is shellcheck itself failing (bad options, unreadable file).
if (run.status > 1) {
    console.error(run.stderr.trimEnd());
    process.exit(run.status);
}

const rules = new Map();
const found = [];
for (const comment of JSON.parse(run.stdout).comments) {
    const code = `SC${comment.code}`;
    console.log(`${comment.file}:${comment.line}:${comment.column}: ${comment.level} ${code}: ${comment.message}`);
    rules.set(code, {
        id: code,
        shortDescription: { text: `ShellCheck ${code}` },
        helpUri: `https://www.shellcheck.net/wiki/${code}`,
    });
    found.push(
        result({
            ruleId: code,
            level: LEVELS[comment.level] || 'warning',
            message: comment.message,
            file: comment.file,
            line: comment.line,
            column: comment.column,
            endLine: comment.endLine,
            endColumn: comment.endColumn,
        }),
    );
}
console.log(`shellcheck: ${files.length} scripts, ${found.length ? `${found.length} problem(s)` : 'no problems'}`);

const log = sarifLog({
    name: 'ShellCheck',
    informationUri: 'https://www.shellcheck.net',
    rules: [...rules.values()],
    results: found,
});
writeFileSync(path.resolve(output), `${JSON.stringify(log, null, 2)}\n`);
console.log(`Wrote ${found.length} result(s) to ${output}`);
process.exit(found.length ? 1 : 0);
