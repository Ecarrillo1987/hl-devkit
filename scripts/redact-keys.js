#!/usr/bin/env node
'use strict';

/**
 * redact-keys.js
 * PostToolUse hook: replaces private key blocks (PEM "-----BEGIN ... PRIVATE KEY-----")
 * in what the agent reads, before the result reaches the model. Only private keys are
 * covered: public keys, certificates and the rest of the file are left untouched.
 *
 * The replacement keeps the exact shape of the original tool result (string or object),
 * walking every string field, so it is accepted whatever the tool's native output is.
 * Partial reads are covered: a BEGIN marker without its END is redacted to the end of
 * the text, and an END marker without its BEGIN is redacted from the start of the text.
 *
 * Credentials written in code are also covered, for every tool: a quoted value assigned to a
 * name that looks like a credential (api_key, secret, password, pwd, token, private_key,
 * access_key, auth_key, *_key, clave, contrasena) is replaced by [CREDENCIAL OCULTA].
 * Example: const API_PASSWORD = "x" -> const API_PASSWORD = "[CREDENCIAL OCULTA]".
 * It may hide some harmless values (for example 'password' => 'required'); that is accepted.
 *
 * Codebase Memory tools (mcp__codebase-memory__*) return fragments of source code: a search
 * hit can show base64 lines of a key without its BEGIN/END markers. For those tools, a run
 * of 60 or more base64 characters that looks random (upper case, lower case and digits,
 * at most 3 slashes, so file paths are left alone) is also replaced.
 *
 * Output: JSON with hookSpecificOutput.updatedToolOutput when something was redacted
 * (MCP tools also get updatedMCPToolOutput); nothing otherwise. Never blocks.
 */

const { readStdin } = require('./lib/shell');

const PLACEHOLDER = '[LLAVE PRIVADA OCULTA]';
const BEGIN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;
const FULL_BLOCK = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g;
const OPEN_BLOCK = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*$/;
const CLOSE_ONLY = /^[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/;

const CRED_PLACEHOLDER = '[CREDENCIAL OCULTA]';
const CRED_WORDS = '(?:api_?key|secret|password|passwd|pwd|token|private_?key|access_?key|auth_?key|clave|contrase)';
const NAME = `(?<![\\w$])(?:[\\w$-]*?${CRED_WORDS}[\\w$-]*|[A-Za-z_$][\\w$-]*_key(?![\\w$-]))`;
const ASSIGNMENT = new RegExp(`(${NAME})(\\\\*['"]?)(\\s*(?:=>|=|:)\\s*)(\\\\*["'])([^\\r\\n]*?)\\4`, 'gi');
const LONG_BASE64 = /[A-Za-z0-9+\/]{60,}={0,2}/g;
let graphTool = false;

function looksLikeBase64(run) {
  const slashes = (run.match(/\//g) || []).length;
  return slashes <= 3 && /[A-Z]/.test(run) && /[a-z]/.test(run) && /[0-9]/.test(run);
}

function redactCredentials(text) {
  return text.replace(ASSIGNMENT, (all, name, q1, op, q2, value) => {
    if (value.length < 4 || value.startsWith('[')) return all;
    return `${name}${q1}${op}${q2}${CRED_PLACEHOLDER}${q2}`;
  });
}

function redactString(text) {
  let out = text.replace(FULL_BLOCK, PLACEHOLDER);
  if (graphTool) out = out.replace(LONG_BASE64, (run) => (looksLikeBase64(run) ? PLACEHOLDER : run));
  if (BEGIN.test(out)) out = out.replace(OPEN_BLOCK, PLACEHOLDER);
  if (/-----END [A-Z0-9 ]*PRIVATE KEY-----/.test(out)) out = out.replace(CLOSE_ONLY, PLACEHOLDER);
  return redactCredentials(out);
}

/** Returns { value, count } with every string inside value redacted. */
function redact(value) {
  if (typeof value === 'string') {
    const redacted = redactString(value);
    return { value: redacted, count: redacted === value ? 0 : 1 };
  }
  if (Array.isArray(value)) {
    let count = 0;
    const out = value.map((item) => {
      const r = redact(item);
      count += r.count;
      return r.value;
    });
    return { value: out, count };
  }
  if (value && typeof value === 'object') {
    let count = 0;
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      const r = redact(item);
      count += r.count;
      out[key] = r.value;
    }
    return { value: out, count };
  }
  return { value, count: 0 };
}

async function main() {
  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    process.exit(0);
  }

  graphTool = /^mcp__codebase-memory__/.test(String(input.tool_name || ''));
  const original = input.tool_response !== undefined ? input.tool_response : input.tool_output;
  if (original === undefined) process.exit(0);

  const { value, count } = redact(original);
  if (count === 0) process.exit(0);

  const hookSpecificOutput = { hookEventName: 'PostToolUse', updatedToolOutput: value };
  if (/^mcp__/.test(String(input.tool_name || ''))) hookSpecificOutput.updatedMCPToolOutput = value;
  process.stdout.write(JSON.stringify({ hookSpecificOutput }));
}

main();
