#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const LABEL = 'local.claude-model-proxy';
const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const userId = typeof process.getuid === 'function' ? process.getuid() : null;

if (userId === null) {
  throw new Error('launchctl uninstall is only supported on macOS-like user sessions');
}

spawnSync('launchctl', ['bootout', `gui/${userId}`, plistPath], { stdio: 'ignore' });
await fs.rm(plistPath, { force: true });

console.log(`Uninstalled ${LABEL}`);
console.log('The environment file was left in place: ~/.claude-model-proxy.env');
