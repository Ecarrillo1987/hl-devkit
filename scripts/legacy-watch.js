#!/usr/bin/env node
'use strict';

/**
 * legacy-watch.js
 * Detective control for the read-only legacy code.
 *
 *   node legacy-watch.js snapshot   (SessionStart) records the git status of every
 *                                   legacy repository as the session baseline.
 *   node legacy-watch.js check      (Stop) compares the current git status against the
 *                                   baseline and warns the user if anything changed,
 *                                   no matter which command or tool made the change.
 *
 * Only repository names are reported, never file contents.
 * Configuration: CLAUDE_PLUGIN_OPTION_LEGACY_PATH. Baselines live in CLAUDE_PLUGIN_DATA.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { readStdin } = require('./lib/shell');

const MAX_DEPTH = 2;
const BASELINE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function findRepos(root) {
  const repos = [];
  const walk = (dir, depth) => {
    if (fs.existsSync(path.join(dir, '.git'))) {
      repos.push(dir);
      return;
    }
    if (depth >= MAX_DEPTH) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'vendor') {
        walk(path.join(dir, entry.name), depth + 1);
      }
    }
  };
  walk(root, 0);
  return repos;
}

function repoFingerprint(repo) {
  try {
    const status = execFileSync('git', ['status', '--porcelain=v1'], {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const head = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return crypto.createHash('sha256').update(`${head}\n${status}`).digest('hex');
  } catch {
    return 'unreadable';
  }
}

function takeSnapshot(root) {
  const snapshot = {};
  for (const repo of findRepos(root)) snapshot[repo] = repoFingerprint(repo);
  return snapshot;
}

function baselineFile(sessionId) {
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;
  if (!dataDir || !sessionId) return null;
  const dir = path.join(dataDir, 'legacy-watch');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
}

function cleanOldBaselines(file) {
  const dir = path.dirname(file);
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    try {
      if (Date.now() - fs.statSync(full).mtimeMs > BASELINE_TTL_MS) fs.unlinkSync(full);
    } catch {
      // ignore files removed concurrently
    }
  }
}

async function main() {
  const mode = process.argv[2];
  let input = {};
  try {
    input = JSON.parse((await readStdin()) || '{}');
  } catch {
    process.exit(0);
  }

  const legacyRoot = process.env.CLAUDE_PLUGIN_OPTION_LEGACY_PATH;
  if (!legacyRoot || !fs.existsSync(legacyRoot)) process.exit(0);

  const file = baselineFile(input.session_id);
  if (!file) process.exit(0);

  if (mode === 'snapshot') {
    cleanOldBaselines(file);
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(takeSnapshot(legacyRoot)));
    process.exit(0);
  }

  if (mode === 'check') {
    const current = takeSnapshot(legacyRoot);
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(current));
      process.exit(0);
    }
    const baseline = JSON.parse(fs.readFileSync(file, 'utf8'));
    const changed = Object.keys(current).filter((repo) => baseline[repo] !== undefined && baseline[repo] !== current[repo]);
    if (changed.length) {
      const names = changed.map((repo) => path.relative(legacyRoot, repo) || path.basename(repo)).join(', ');
      process.stdout.write(
        JSON.stringify({
          systemMessage: `ALERTA: hubo cambios en el código legacy durante esta sesión (${names}). Revisá con "git status" en esa carpeta y revertí lo que no corresponda.`,
        }),
      );
    }
    process.exit(0);
  }

  process.exit(0);
}

main();
