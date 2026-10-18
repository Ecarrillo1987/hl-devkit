#!/usr/bin/env node
'use strict';

/**
 * guard-bash.js
 * PreToolUse guard for shell commands (Bash and PowerShell).
 *
 * Rules:
 *  1. Deny force push (--force, --force-with-lease, --force-if-includes, -f, +refspec).
 *  2. Deny --no-verify on any git command, and `git commit -n`.
 *  3. Ask for confirmation on any other git push.
 *  4. Deny git commit on protected branches (main, master, develop).
 *  5. Deny git commit without an inline message (-m / --message),
 *     or with a message containing forbidden attribution terms.
 *  6. Deny `git -c core.hooksPath=...` (equivalent to skipping hooks).
 *
 * Output: JSON decision on stdout (deny / ask) or nothing (no decision).
 * Fail-closed: invalid input exits with code 2 (blocking).
 */

const { execFileSync } = require('child_process');
const { readStdin, splitSegments, tokenize, isShortFlagCluster, isGitExecutable } = require('./lib/shell');

const PROTECTED_BRANCHES = ['main', 'master', 'develop'];

const FORBIDDEN_MESSAGE_TERMS =
  /claude|anthropic|co-authored-by|generated with|chatgpt|copilot|openai|\bllm\b|\bia\b|\bai\b|inteligencia artificial|artificial intelligence/i;

const MAX_DEPTH = 3;

/** Parse "git [global opts] <sub> [args]". Returns { cwdOverride, sub, args } or null. */
function parseGit(tokens) {
  const gitIndex = tokens.findIndex(isGitExecutable);
  if (gitIndex === -1) return null;
  let i = gitIndex + 1;
  let cwdOverride = null;
  let hooksPathOverride = false;
  while (i < tokens.length && tokens[i].startsWith('-')) {
    const opt = tokens[i];
    if (opt === '-C') {
      cwdOverride = tokens[i + 1] || null;
      i += 2;
    } else if (opt === '-c') {
      hooksPathOverride = hooksPathOverride || /^core\.hookspath=/i.test(tokens[i + 1] || '');
      i += 2;
    } else {
      i += 1;
    }
  }
  if (i >= tokens.length) return null;
  return { cwdOverride, hooksPathOverride, sub: tokens[i], args: tokens.slice(i + 1) };
}

function currentBranch(dir) {
  try {
    return execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function checkPush(args, decisions) {
  const forced = args.some(
    (a) =>
      a.startsWith('--force') ||
      (isShortFlagCluster(a) && a.includes('f')) ||
      (a.startsWith('+') && a.length > 1),
  );
  if (forced) {
    decisions.deny.push('Force push no permitido (--force, --force-with-lease, -f o +refspec).');
  } else {
    decisions.ask.push('git push requiere confirmación explícita del responsable.');
  }
}

/** Collect commit message values passed with -m / --message (including clusters like -am). */
function extractMessages(args) {
  const messages = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--message') {
      messages.push(args[i + 1] || '');
      i++;
    } else if (a.startsWith('--message=')) {
      messages.push(a.slice('--message='.length));
    } else if (isShortFlagCluster(a) && a.endsWith('m')) {
      messages.push(args[i + 1] || '');
      i++;
    } else if (a.startsWith('-m') && !a.startsWith('--') && a.length > 2) {
      messages.push(a.slice(2));
    }
  }
  return messages;
}

function checkCommit(args, cwd, git, decisions) {
  if (args.some((a) => isShortFlagCluster(a) && a.includes('n'))) {
    decisions.deny.push('git commit -n (saltear hooks) no permitido.');
  }

  const dir = git.cwdOverride || cwd;
  const branch = currentBranch(dir);
  if (branch === null) {
    decisions.ask.push('No se pudo determinar la rama actual (HEAD detached o fuera de un repo). Confirmar antes de commitear.');
  } else if (PROTECTED_BRANCHES.includes(branch)) {
    decisions.deny.push(`Commit directo en la rama protegida "${branch}" no permitido. Usar una rama de feature.`);
  }

  const messages = extractMessages(args);
  if (messages.length === 0) {
    decisions.deny.push('El commit debe usar -m "mensaje" para que el mensaje sea visible y revisable.');
  } else if (FORBIDDEN_MESSAGE_TERMS.test(messages.join('\n'))) {
    decisions.deny.push('El mensaje del commit contiene términos de atribución no permitidos.');
  }
}

function analyze(command, cwd, decisions, depth) {
  if (depth > MAX_DEPTH) return;

  if (/--no-verify\b/.test(command) && /\bgit(\.exe)?\b/i.test(command)) {
    decisions.deny.push('--no-verify no permitido (no se saltean hooks).');
  }

  for (const segment of splitSegments(command)) {
    const tokens = tokenize(segment);

    // Nested commands, e.g. sh -c "git push -f" or pwsh -Command "..."
    for (const token of tokens) {
      if (/\s/.test(token) && /\bgit(\.exe)?\b/i.test(token)) {
        analyze(token, cwd, decisions, depth + 1);
      }
    }

    const git = parseGit(tokens);
    if (!git) continue;

    if (git.hooksPathOverride) {
      decisions.deny.push('Redefinir core.hooksPath en la línea de comando no permitido (equivale a saltear hooks).');
    }

    if (git.sub === 'push') checkPush(git.args, decisions);
    if (git.sub === 'commit') checkCommit(git.args, cwd, git, decisions);
  }
}

function output(decision, reasons) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: decision,
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
    process.stderr.write('guard-bash: entrada inválida, se bloquea por seguridad.');
    process.exit(2);
  }

  const command = (input.tool_input && input.tool_input.command) || '';
  const cwd = input.cwd || process.cwd();
  const decisions = { deny: [], ask: [] };

  analyze(command, cwd, decisions, 0);

  if (decisions.deny.length) return output('deny', decisions.deny);
  if (decisions.ask.length) return output('ask', decisions.ask);
  process.exit(0);
}

main();
