#!/usr/bin/env node
'use strict';

/**
 * dev-context.js
 * SessionStart hook: loads the team context (context/team-context.md) plus the
 * developer's own data (name and paths from the plugin configuration) into the
 * agent's context, so every session starts with the project rules and method.
 *
 * The combined text must stay under the 10,000 character hook limit.
 */

const fs = require('fs');
const path = require('path');

const MAX_CHARS = 9500;

function devBlock() {
  const name = process.env.CLAUDE_PLUGIN_OPTION_DEV_NAME || '';
  const repo = process.env.CLAUDE_PLUGIN_OPTION_REPO_PATH || '';
  const legacy = process.env.CLAUDE_PLUGIN_OPTION_LEGACY_PATH || '';
  const lines = ['## Esta estación de trabajo'];
  lines.push(`- Dev: ${name || 'sin configurar'}`);
  if (repo) lines.push(`- Repositorio de trabajo: ${repo}`);
  if (legacy) lines.push(`- Código legacy (solo lectura): ${legacy}`);
  if (!name) lines.push('- La configuración del kit está incompleta: falta el nombre del dev (ver README del kit).');
  return lines.join('\n');
}

function main() {
  const root = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
  let team = '';
  try {
    team = fs.readFileSync(path.join(root, 'context', 'team-context.md'), 'utf8').trim();
  } catch {
    team = '# Proyecto Akisi\nNo se encontró context/team-context.md en el kit. Reinstalar el kit.';
  }

  let text = `${team}\n\n${devBlock()}\n`;
  if (text.length > MAX_CHARS) text = `${text.slice(0, MAX_CHARS)}\n[contexto recortado: revisar el tamaño de team-context.md]\n`;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: text,
      },
    }),
  );
}

main();
