'use strict';

/**
 * Shared helpers for hook scripts: stdin reading and a minimal shell parser
 * (segments and quoted tokens) that works for Bash and PowerShell command lines.
 */

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

/** Split a command line into segments on &&, ||, ;, |, and newlines (outside quotes). */
function splitSegments(command) {
  const segments = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ';' || ch === '\n' || ch === '|' || ch === '&') {
      if (current.trim()) segments.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) segments.push(current.trim());
  return segments;
}

/** Tokenize a segment, honoring single and double quotes. Returns tokens without quotes. */
function tokenize(segment) {
  const tokens = [];
  let current = '';
  let quote = null;
  let hasToken = false;
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      hasToken = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (hasToken) tokens.push(current);
      current = '';
      hasToken = false;
      continue;
    }
    current += ch;
    hasToken = true;
  }
  if (hasToken) tokens.push(current);
  return tokens;
}

function isShortFlagCluster(token) {
  return /^-[a-zA-Z]+$/.test(token);
}

function isGitExecutable(token) {
  const base = token.replace(/\\/g, '/').split('/').pop().toLowerCase();
  return base === 'git' || base === 'git.exe';
}

module.exports = { readStdin, splitSegments, tokenize, isShortFlagCluster, isGitExecutable };
