#!/usr/bin/env node
'use strict';

/**
 * guard-files.js
 * PreToolUse guard for file access (file tools and shell commands).
 *
 * Rules:
 *  A. Legacy code is read-only: deny Edit/Write on files under the configured
 *     legacy path, and shell commands that modify files there.
 *  B. Secrets are never read: deny Read/Edit/Write/Grep on sensitive files
 *     (.env*, keys, certificates, service account credentials, extra patterns),
 *     and shell commands that print their content.
 *
 * Configuration (plugin userConfig, exported as environment variables):
 *  - CLAUDE_PLUGIN_OPTION_LEGACY_PATH            absolute path of the legacy code
 *  - CLAUDE_PLUGIN_OPTION_EXTRA_SENSITIVE_FILES  extra file name patterns (* and ? wildcards)
 *
 * Output: JSON deny decision on stdout, or nothing (no decision).
 * Fail-closed: invalid input exits with code 2 (blocking).
 */

const { readStdin, splitSegments, tokenize, isGitExecutable } = require('./lib/shell');

const FILE_WRITE_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];
const FILE_READ_TOOLS = ['Read', 'Grep'];
const SHELL_TOOLS = ['Bash', 'PowerShell'];

const SAFE_TEMPLATE_SUFFIX = /\.(example|sample|template)$/;

const BUILTIN_SENSITIVE_PATTERNS = [
  /^\.env([._-].*)?$/,
  /\.env$/,
  /\.(pem|key|p12|pfx|jks|keystore)$/,
  /^id_(rsa|dsa|ecdsa|ed25519)$/,
  /^app-billtera-akisi\.json$/,
];

const READ_COMMANDS = new Set([
  'cat', 'type', 'more', 'less', 'head', 'tail', 'bat', 'nl', 'strings', 'od', 'xxd', 'hexdump',
  'base64', 'grep', 'egrep', 'fgrep', 'rg', 'awk', 'sed', 'sort', 'uniq', 'cut', 'diff', 'source', '.',
  'findstr', 'gc', 'get-content', 'select-string', 'sls', 'import-csv', 'cat.exe', 'type.exe',
]);

const WRITE_COMMANDS = new Set([
  'rm', 'rmdir', 'touch', 'mkdir', 'tee', 'truncate', 'chmod', 'chown', 'ln', 'install', 'dd', 'unlink',
  'remove-item', 'ri', 'del', 'erase', 'rd', 'set-content', 'sc', 'add-content', 'ac', 'out-file',
  'new-item', 'ni', 'rename-item', 'ren', 'rni', 'clear-content', 'clc', 'set-itemproperty',
]);

const MOVE_COMMANDS = new Set(['mv', 'move-item', 'mi', 'move']);
const COPY_COMMANDS = new Set(['cp', 'copy-item', 'cpi', 'copy', 'xcopy', 'robocopy']);

const READ_ONLY_GIT = new Set([
  'status', 'log', 'show', 'diff', 'blame', 'grep', 'ls-files', 'ls-tree', 'rev-parse', 'describe',
  'shortlog', 'cat-file', 'fetch', 'remote', 'config', 'branch', 'tag', 'reflog', 'whatchanged',
]);

/** Normalize a path for comparison: forward slashes, drive letter form, lowercase, no dot segments. */
function normalizePath(rawPath, cwd) {
  if (!rawPath) return null;
  let p = String(rawPath).trim().replace(/\\/g, '/');
  const gitBashDrive = /^\/([a-zA-Z])(\/|$)/.exec(p);
  if (gitBashDrive) p = `${gitBashDrive[1]}:/${p.slice(3)}`;
  const isAbsolute = /^[a-zA-Z]:\//.test(p) || p.startsWith('/');
  if (!isAbsolute && cwd) p = `${normalizePath(cwd)}/${p}`;
  const parts = [];
  for (const part of p.split('/')) {
    if (part === '' || part === '.') {
      if (parts.length === 0 && p.startsWith('/')) parts.push('');
      continue;
    }
    if (part === '..') {
      if (parts.length > 1) parts.pop();
      continue;
    }
    parts.push(part);
  }
  let out = parts.join('/');
  if (p.startsWith('/') && !out.startsWith('/')) out = `/${out}`;
  return out.toLowerCase().replace(/\/+$/, '');
}

function isInside(target, root) {
  if (!target || !root) return false;
  return target === root || target.startsWith(`${root}/`);
}

function basenameOf(rawPath) {
  return String(rawPath).replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop().toLowerCase();
}

/**
 * Parse a list option: accepts a JSON array or a delimited string, and splits each
 * entry on commas, semicolons, newlines or whitespace (one field with "a, b" works too).
 */
function parseList(value) {
  if (!value) return [];
  let entries = [String(value)];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) entries = parsed.map(String);
  } catch {
    // not JSON, keep the raw string
  }
  return entries
    .flatMap((entry) => entry.split(/[,;\s]+/))
    .map((v) => v.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

function globToRegex(glob) {
  const escaped = glob.toLowerCase().replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
}

function loadConfig(cwd) {
  const legacyRaw = process.env.CLAUDE_PLUGIN_OPTION_LEGACY_PATH || '';
  const extra = parseList(process.env.CLAUDE_PLUGIN_OPTION_EXTRA_SENSITIVE_FILES).map(globToRegex);
  return {
    legacyRoot: legacyRaw ? normalizePath(legacyRaw, cwd) : null,
    sensitivePatterns: [...BUILTIN_SENSITIVE_PATTERNS, ...extra],
  };
}

function isSensitiveFile(rawPath, config) {
  if (!rawPath) return false;
  const name = basenameOf(rawPath);
  if (SAFE_TEMPLATE_SUFFIX.test(name)) return false;
  return config.sensitivePatterns.some((re) => re.test(name));
}

/** Strip redirection prefixes so ">out.txt" or "2>err.log" yield the target path. */
function redirectTarget(token) {
  const m = /^\d*>>?(.+)$/.exec(token);
  return m ? m[1] : null;
}

function commandName(tokens) {
  const first = tokens.find((t) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(t));
  return first ? basenameOf(first) : null;
}

function checkShellSegment(tokens, cwd, config, decisions) {
  const cmd = commandName(tokens);
  if (!cmd) return;
  const cmdIndex = tokens.findIndex((t) => basenameOf(t) === cmd);
  const args = tokens.slice(cmdIndex + 1);
  const pathArgs = args.filter((a) => !a.startsWith('-') && !/^\d*[<>]/.test(a));

  // Rule B: printing secrets.
  const readsSecret =
    (READ_COMMANDS.has(cmd) && pathArgs.some((a) => isSensitiveFile(a, config))) ||
    args.some((a, i) => (a === '<' && isSensitiveFile(args[i + 1], config)) || (a.startsWith('<') && isSensitiveFile(a.slice(1), config)));
  if (readsSecret) {
    decisions.deny.push('Leer archivos de secretos (.env, claves, credenciales) no está permitido.');
  }

  // Rule A: modifying legacy code.
  if (!config.legacyRoot) return;
  const inLegacy = (p) => isInside(normalizePath(p, cwd), config.legacyRoot);

  const redirectTargets = [];
  args.forEach((a, i) => {
    if (a === '>' || a === '>>' || /^\d>>?$/.test(a)) redirectTargets.push(args[i + 1]);
    const t = redirectTarget(a);
    if (t && t !== '&1' && t !== '&2') redirectTargets.push(t);
  });

  const sedInPlace = (cmd === 'sed' || cmd === 'perl') && args.some((a) => /^-[a-zA-Z]*i/.test(a) || a === '--in-place');

  let modifiesLegacy = redirectTargets.some((t) => t && inLegacy(t));
  if (WRITE_COMMANDS.has(cmd) || sedInPlace) modifiesLegacy ||= pathArgs.some(inLegacy);
  if (MOVE_COMMANDS.has(cmd)) modifiesLegacy ||= pathArgs.some(inLegacy);
  if (COPY_COMMANDS.has(cmd) && pathArgs.length) modifiesLegacy ||= inLegacy(pathArgs[pathArgs.length - 1]);

  if (isGitExecutable(tokens[cmdIndex] || '')) {
    let i = 0;
    let repoDir = cwd;
    while (i < args.length && args[i].startsWith('-')) {
      if (args[i] === '-C') {
        repoDir = normalizePath(args[i + 1], cwd);
        i += 2;
      } else if (args[i] === '-c') {
        i += 2;
      } else {
        i += 1;
      }
    }
    const sub = args[i];
    if (sub && !READ_ONLY_GIT.has(sub) && inLegacy(repoDir)) modifiesLegacy = true;
  }

  if (modifiesLegacy) {
    decisions.deny.push('El código legacy es de solo lectura. No se permite modificarlo.');
  }
}

function checkShell(command, cwd, config, decisions) {
  for (const segment of splitSegments(command)) {
    const tokens = tokenize(segment);
    for (const token of tokens) {
      if (/\s/.test(token)) checkShell(token, cwd, config, decisions);
    }
    checkShellSegment(tokens, cwd, config, decisions);
  }
}

function checkFileTool(toolName, toolInput, cwd, config, decisions) {
  const target = toolInput.file_path || toolInput.notebook_path || toolInput.path || '';

  if (isSensitiveFile(target, config) || (toolName === 'Grep' && toolInput.glob && isSensitiveFile(toolInput.glob, config))) {
    decisions.deny.push('Acceder a archivos de secretos (.env, claves, credenciales) no está permitido.');
  }

  if (FILE_WRITE_TOOLS.includes(toolName) && config.legacyRoot && isInside(normalizePath(target, cwd), config.legacyRoot)) {
    decisions.deny.push('El código legacy es de solo lectura. No se permite modificarlo.');
  }
}

function output(reasons) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: [...new Set(reasons)].join(' '),
      },
    }),
  );
}

async function main() {
  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    process.stderr.write('guard-files: entrada inválida, se bloquea por seguridad.');
    process.exit(2);
  }

  const toolName = input.tool_name || '';
  const toolInput = input.tool_input || {};
  const cwd = input.cwd || process.cwd();
  const config = loadConfig(cwd);
  const decisions = { deny: [] };

  if (SHELL_TOOLS.includes(toolName)) {
    checkShell(toolInput.command || '', cwd, config, decisions);
  } else if (FILE_WRITE_TOOLS.includes(toolName) || FILE_READ_TOOLS.includes(toolName)) {
    checkFileTool(toolName, toolInput, cwd, config, decisions);
  }

  if (decisions.deny.length) return output(decisions.deny);
  process.exit(0);
}

main();
