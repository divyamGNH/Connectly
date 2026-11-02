import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import { startHarness } from './browser-harness.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const frontend = path.join(root, 'frontend');
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const results = [];
const interactive = process.argv.includes('--open');
const output = path.join(root, 'test-results');
await mkdir(output, { recursive: true });
const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
async function check(label, folder, script) {
  console.log(`\n=== ${label} ===`);
  const started = Date.now(), log = [];
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [npmCli, 'run', script], {
      cwd: path.join(root, folder), env: { ...process.env, SCORING_DEMO_FALLBACK: 'false' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', data => { log.push(data); process.stdout.write(data); });
    child.stderr.on('data', data => { log.push(data); process.stderr.write(data); });
    child.once('error', reject); child.once('exit', resolve);
  });
  await writeFile(path.join(output, `${folder}-${script.replaceAll(':', '-')}.log`), Buffer.concat(log));
  results.push({ check: label, passed: code === 0, durationMs: Date.now() - started });
  if (code !== 0) throw new Error(`${label} failed (exit ${code})`);
}
let harness, vite;
try {
  if (interactive) {
    await check('Backend build for interactive browser tests', 'backend', 'build');
  } else {
  await check('Backend tests and build', 'backend', 'test');
  await check('WebRTC regression tests', 'frontend', 'test:webrtc');
  await check('Frontend production build', 'frontend', 'build');
  await check('Frontend lint', 'frontend', 'lint');
  await check('Browser test TypeScript', 'frontend', 'test:types');
  }
  if (!process.argv.includes('--unit')) {
    console.log('\n=== Browser regression: starting isolated servers ===');
    harness = await startHarness();
    process.env.VITE_BACKEND_URL = harness.url;
    // Vite must not exit the runner when Cypress consumes the noninteractive stdin.
    process.env.CI = 'true';
    const reservation = net.createServer();
    await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const frontendPort = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
    vite = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'),
      server: { host: '127.0.0.1', port: frontendPort, strictPort: true, open: false }, logLevel: 'warn' });
    await vite.listen();
    const baseUrl = `http://127.0.0.1:${vite.httpServer.address().port}`;
    console.log(`Browser app: ${baseUrl}; test backend: ${harness.url}`);
    const cypress = requireFrontend('cypress');
    const options = { project: frontend,
      config: { baseUrl, expose: { backendUrl: harness.url }, videosFolder: path.join(output, 'videos'), screenshotsFolder: path.join(output, 'screenshots') } };
    if (interactive) {
      console.log('Opening Cypress. Choose E2E Testing, Chrome, then a spec. Keep this terminal open.');
      await cypress.open(options);
    } else {
    const run = await cypress.run({ ...options, browser: process.env.FLUELY_TEST_BROWSER || 'chrome', headless: true });
    const passed = run.status !== 'failed' && run.totalFailed === 0 && run.totalTests > 0 && run.totalSkipped === 0 && run.totalPending === 0;
    results.push({ check: 'Browser regression', passed, total: run.totalTests, failures: run.totalFailed, status: passed ? 'passed' : 'failed' });
    await writeFile(path.join(output, 'browser-results.json'), JSON.stringify(run, null, 2));
    if (!passed) throw new Error('Browser regression failed; see test-results for screenshots and logs.');
    }
  }
} catch (error) {
  console.error(error.message); process.exitCode = 1;
} finally {
  await vite?.close(); await harness?.close();
  if (!interactive) await writeFile(path.join(output, 'summary.json'), JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
}
