#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf8'));
const distDir = path.join(rootDir, 'dist');
const stagingDir = path.join(distDir, packageJson.name);
const outputFile = path.join(distDir, `${packageJson.name}-${packageJson.version}.mcpb`);

await fs.rm(stagingDir, { recursive: true, force: true });
await fs.rm(path.join(distDir, 'claude-deepseek-model-proxy'), { recursive: true, force: true });
await fs.rm(path.join(distDir, 'claude-deepseek-model-proxy-0.1.0.mcpb'), { force: true });
await fs.mkdir(path.join(stagingDir, 'server'), { recursive: true });
await fs.mkdir(path.join(stagingDir, 'scripts'), { recursive: true });
await fs.mkdir(path.join(stagingDir, 'srcs'), { recursive: true });

await copyFile('manifest.json', 'manifest.json');
await copyFile('proxy.mjs', 'proxy.mjs');
await copyFile('README.md', 'README.md');
await copyFile('README.zh-CN.md', 'README.zh-CN.md');
await copyFile('package.json', 'package.json');
await copyFile('start.sh', 'start.sh');
await copyFile('server/index.mjs', 'server/index.mjs');
await copyFile('scripts/ensure-node.sh', 'scripts/ensure-node.sh');
await copyFile('scripts/install-launch-agent.mjs', 'scripts/install-launch-agent.mjs');
await copyFile('scripts/run-launch-agent.sh', 'scripts/run-launch-agent.sh');
await copyFile('scripts/uninstall-launch-agent.mjs', 'scripts/uninstall-launch-agent.mjs');
await copyFile('srcs/claude-developer-mode.png', 'srcs/claude-developer-mode.png');

await fs.rm(outputFile, { force: true });

const result = spawnSync('zip', ['-qr', outputFile, '.'], {
  cwd: stagingDir,
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(outputFile);

async function copyFile(from, to) {
  await fs.copyFile(path.join(rootDir, from), path.join(stagingDir, to));
}
