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
 * Codebase Memory tools (mcp__codebase-memory__*) return fragments of source code: a search
 * hit can show base64 lines of a key without its BEGIN/END markers. For those tools, any
 * run of 60 or more base64 characters is also replaced (hex hashes may be hidden too).
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

const LONG_BASE64 = /[A-Za-z0-9+\/]{60,}={0,2}/g;
let graphTool = false;

function redactString(text) {
  let out = text.replace(FULL_BLOCK, PLACEHOLDER);
  if (graphTool) out = out.replace(LONG_BASE64, PLACEHOLDER);
  if (BEGIN.test(out)) out = out.replace(OPEN_BLOCK, PLACEHOLDER);
  if (/-----END [A-Z0-9 ]*PRIVATE KEY-----/.test(out)) out = out.replace(CLOSE_ONLY, PLACEHOLDER);
  return out;
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
