#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LABEL = 'local.claude-model-proxy';
const homeDir = os.homedir();
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plistPath = path.join(homeDir, 'Library', 'LaunchAgents', `${LABEL}.plist`);
const logDir = path.join(homeDir, 'Library', 'Logs', 'ClaudeModelProxy');
const envFile = path.join(homeDir, '.claude-model-proxy.env');
const runScript = path.join(rootDir, 'scripts', 'run-launch-agent.sh');
const userId = typeof process.getuid === 'function' ? process.getuid() : null;

await fs.mkdir(path.dirname(plistPath), { recursive: true });
await fs.mkdir(logDir, { recursive: true });
await ensureEnvFile();
await fs.chmod(envFile, 0o600);
await fs.chmod(runScript, 0o755);
await fs.chmod(path.join(rootDir, 'start.sh'), 0o755);

await fs.writeFile(plistPath, buildPlist(), 'utf8');

runLaunchctl(['bootout', `gui/${userId}`, plistPath], { allowFailure: true });
runLaunchctl(['bootstrap', `gui/${userId}`, plistPath]);
runLaunchctl(['kickstart', '-k', `gui/${userId}/${LABEL}`]);

console.log(`Installed ${LABEL}`);
console.log(`LaunchAgent: ${plistPath}`);
console.log(`Environment file: ${envFile}`);
console.log('Update the environment file with provider API keys, then run:');
console.log('  launchctl kickstart -k gui/$(id -u)/local.claude-model-proxy');

async function ensureEnvFile() {
  try {
    await fs.access(envFile);
    return;
  } catch {
    // Create a starter file below.
  }

  const lines = [
    '# Claude Model Proxy launchd environment.',
    '# Keep this file chmod 600 because it may contain API keys.',
    'BASE_URL=http://127.0.0.1:8787',
    'PORT=8787',
    'DEEPSEEK_BASE_URL=https://api.deepseek.com/anthropic',
    `DEEPSEEK_API_KEY=${process.env.DEEPSEEK_API_KEY || ''}`,
    'MOONSHOT_BASE_URL=https://api.moonshot.cn/anthropic',
    `MOONSHOT_API_KEY=${process.env.MOONSHOT_API_KEY || process.env.KIMI_API_KEY || ''}`,
    '# Optional providers:',
    `GLM_API_KEY=${process.env.GLM_API_KEY || process.env.ZAI_API_KEY || process.env.ZHIPU_API_KEY || ''}`,
    `XIAOMI_API_KEY=${process.env.XIAOMI_API_KEY || process.env.MIMO_API_KEY || ''}`,
    `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY || ''}`,
    `OPENAI_API_KEY=${process.env.OPENAI_API_KEY || ''}`,
    `GEMINI_API_KEY=${process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''}`,
    '',
  ];

  await fs.writeFile(envFile, lines.join('\n'), { mode: 0o600 });
}

function buildPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>${escapeXml(runScript)}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>${escapeXml(path.join(logDir, 'proxy.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(path.join(logDir, 'proxy.err.log'))}</string>
  <key>WorkingDirectory</key>
  <string>${escapeXml(rootDir)}</string>
</dict>
</plist>
`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function runLaunchctl(args, { allowFailure = false } = {}) {
  if (userId === null) {
    throw new Error('launchctl install is only supported on macOS-like user sessions');
  }

  const result = spawnSync('launchctl', args, {
    stdio: allowFailure ? 'ignore' : 'inherit',
  });

  if (!allowFailure && result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
