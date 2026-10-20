#!/usr/bin/env node
'use strict';

/**
 * configure-dev.js
 * One-time setup of the kit on a developer workstation. Writes ONLY to the user's
 * personal settings (~/.claude/settings.json) and to the local, never-committed
 * .git/info/exclude of the work repository. Never touches tracked repository files.
 *
 * Usage:
 *   node configure-dev.js --name "Juan" --legacy "D:\HomeLand\PHP Migration" --repo "D:\HomeLand\Repo_Huawei" --specs "D:\HomeLand\specs"
 *   Optional: --plugin-key hl-devkit@inline   (default; use the marketplace key once installed from it)
 *
 * What it sets:
 *  - pluginConfigs[<key>].options: dev_name, legacy_path, repo_path, specs_path, extra_sensitive_files (defaults kept/merged)
 *  - permissions.allow += Read(<legacy>/**)   read legacy without prompts
 *  - permissions.deny  += Edit(<legacy>/**)   legacy is never edited (enforced by the agent runtime)
 *  - attribution.commit = "", attribution.pr = ""   no commit trailer or PR attribution from the agent
 *  - permissions.allow += Read(<specs>/**) and Edit(<specs>/**)   specs written without prompts (outside client repos)
 *  - <repo>/.git/info/exclude += .claude/     agent settings never reach the client repository
 *
 * Creates a timestamped backup of settings.json first. Safe to run more than once.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_SENSITIVE = ['_settings.php', 'database.php', 'config.php', 'secrets.yml'];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

/** D:\HomeLand\PHP Migration -> //d/HomeLand/PHP Migration/** (permission rule form). */
function toRulePath(winPath) {
  const p = winPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const drive = /^([a-zA-Z]):\/(.*)$/.exec(p);
  if (drive) return `//${drive[1].toLowerCase()}/${drive[2]}/**`;
  if (p.startsWith('/')) return `/${p}/**`;
  throw new Error(`Ruta no absoluta: ${winPath}`);
}

function fail(message) {
  console.error(`ERROR: ${message}\nNo se cambió nada.`);
  process.exit(1);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const name = (args.name || '').trim();
  const legacy = (args.legacy || '').trim();
  const repo = (args.repo || '').trim();
  const specs = (args.specs || '').trim();
  const pluginKey = (args['plugin-key'] || 'hl-devkit@inline').trim();

  if (!name || !legacy || !repo || !specs) {
    fail('Faltan parámetros. Uso: node configure-dev.js --name "Nombre" --legacy "<ruta legacy>" --repo "<ruta repo>" --specs "<ruta specs>"');
  }
  if (!fs.existsSync(legacy)) fail(`No existe la carpeta legacy: ${legacy}`);
  if (!fs.existsSync(path.join(repo, '.git'))) fail(`No es un repositorio git: ${repo}`);

  const isInside = (child, parent) => {
    const rel = path.relative(path.resolve(parent), path.resolve(child));
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  };
  if (isInside(specs, repo)) fail(`La carpeta de specs no puede estar dentro del repositorio de trabajo: ${specs}`);
  if (isInside(specs, legacy)) fail(`La carpeta de specs no puede estar dentro del legacy: ${specs}`);
  if (fs.existsSync(specs) && fs.existsSync(path.join(specs, '.git'))) {
    fail(`La carpeta de specs no puede ser un repositorio git (las specs no se versionan en repos compartidos por ahora): ${specs}`);
  }

  let legacyRule;
  let specsRule;
  try {
    legacyRule = toRulePath(legacy);
    specsRule = toRulePath(specs);
  } catch (err) {
    fail(err.message);
  }

  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    try {
      settings = JSON.parse(raw);
    } catch (err) {
      fail(`settings.json no es JSON válido (${err.message})`);
    }
    const backup = `${settingsPath}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.writeFileSync(backup, raw);
    console.log(`Backup: ${backup}`);
  }

  settings.permissions = settings.permissions || {};
  const addUnique = (key, rule) => {
    const list = Array.isArray(settings.permissions[key]) ? settings.permissions[key] : [];
    if (!list.includes(rule)) list.push(rule);
    settings.permissions[key] = list;
  };
  addUnique('allow', `Read(${legacyRule})`);
  addUnique('deny', `Edit(${legacyRule})`);
  addUnique('allow', `Read(${specsRule})`);
  addUnique('allow', `Edit(${specsRule})`);

  // No commit trailer or PR attribution from the agent (project rule: no AI attribution).
  settings.attribution = { ...(settings.attribution || {}), commit: '', pr: '' };

  settings.pluginConfigs = settings.pluginConfigs || {};
  const entry = (settings.pluginConfigs[pluginKey] = settings.pluginConfigs[pluginKey] || {});
  const options = (entry.options = entry.options || {});
  options.dev_name = name;
  options.legacy_path = legacy;
  options.repo_path = repo;
  options.specs_path = specs;
  const current = Array.isArray(options.extra_sensitive_files) ? options.extra_sensitive_files : [];
  options.extra_sensitive_files = [...new Set([...current, ...DEFAULT_SENSITIVE])];

  fs.mkdirSync(specs, { recursive: true });
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);

  const excludePath = path.join(repo, '.git', 'info', 'exclude');
  fs.mkdirSync(path.dirname(excludePath), { recursive: true });
  const exclude = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, 'utf8') : '';
  if (!exclude.split(/\r?\n/).includes('.claude/')) {
    fs.appendFileSync(excludePath, `${exclude && !exclude.endsWith('\n') ? '\n' : ''}.claude/\n`);
  }

  console.log('Configuración aplicada:');
  console.log(
    JSON.stringify(
      {
        dev: name,
        pluginKey,
        options,
        permissions: { allow: settings.permissions.allow, deny: settings.permissions.deny },
        attribution: settings.attribution,
        excludeFile: excludePath,
      },
      null,
      2,
    ),
  );
}

main();
