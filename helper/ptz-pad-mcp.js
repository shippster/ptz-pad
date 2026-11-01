#!/usr/bin/env node
/*
 * PTZ Pad helper: a local MCP server for the Claude desktop app.
 *
 * The private PTZ Pad page on claude.ai can't reach cameras on your network
 * by itself, so it asks this helper (through the Claude desktop app) to send
 * each command. Speaks MCP over stdio; stdout carries protocol messages only.
 */
const path = require('path');
const readline = require('readline');
const bridge = require(path.join(__dirname, '..', 'bridge-core'));
const ndi = require(path.join(__dirname, '..', 'ndi-core'));

const VERSION = '1.2.0';
const MAX_COMMANDS = 16;

const TOOLS = [
  {
    name: 'ptz_status',
    title: 'PTZ Pad helper status',
    description: 'Reports that the PTZ Pad helper is running, its version, and whether the NDI Runtime is available.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'ptz_send',
    title: 'Send PTZ camera commands',
    description: 'Sends pan, tilt, zoom, focus and preset commands to PTZ cameras on the local network over VISCA (UDP/TCP), HTTP or NDI. Also lists NDI sources.',
    inputSchema: {
      type: 'object',
      properties: {
        commands: {
          type: 'array',
          maxItems: MAX_COMMANDS,
          items: {
            type: 'object',
            properties: {
              type: { enum: ['visca', 'http', 'ndi'] },
              host: { type: 'string' }, port: { type: 'number' }, mode: { enum: ['sony', 'raw', 'tcp'] }, hex: { type: 'string' },
              url: { type: 'string' }, user: { type: 'string' }, pass: { type: 'string' },
              action: { enum: ['status', 'sources', 'ptz'] }, source: { type: 'string' }, extraIps: { type: 'string' }, libPath: { type: 'string' },
              op: { type: 'string' }, pan: { type: 'number' }, tilt: { type: 'number' }, v: { type: 'number' }, n: { type: 'number' },
            },
            required: ['type'],
          },
        },
      },
      required: ['commands'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
];

async function runCommand(c) {
  if (!c || typeof c !== 'object') return { ok: false, error: 'bad command' };
  if (c.type === 'visca') return bridge.visca(c);
  if (c.type === 'http') return bridge.http(c);
  if (c.type === 'ndi') return ndi.handle(c);
  return { ok: false, error: `unknown command type ${c.type}` };
}

async function callTool(name, args = {}) {
  if (name === 'ptz_status') {
    const n = await ndi.handle({ action: 'status', libPath: args.libPath || '' });
    return { ok: true, helper: 'ptz-pad', version: VERSION, platform: process.platform, ndi: n.ok ? { ok: true, version: n.version } : { ok: false, error: n.error } };
  }
  if (name === 'ptz_send') {
    const list = Array.isArray(args.commands) ? args.commands.slice(0, MAX_COMMANDS) : [];
    const results = [];
    for (const c of list) results.push(await runCommand(c)); // in order: e.g. manual focus before a focus move
    return { ok: results.every((r) => r.ok), results };
  }
  throw Object.assign(new Error(`Unknown tool ${name}`), { rpc: -32602 });
}

/* ---------- MCP over stdio ---------- */
const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

async function onMessage(msg) {
  const { id, method, params = {} } = msg;
  const isRequest = id !== undefined && id !== null;
  try {
    switch (method) {
      case 'initialize':
        return reply(id, {
          protocolVersion: params.protocolVersion || '2025-06-18',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'ptz-pad', title: 'PTZ Pad', version: VERSION },
          instructions: 'Sends camera control commands for the PTZ Pad page. Use ptz_status to check the helper.',
        });
      case 'ping':
        return reply(id, {});
      case 'tools/list':
        return reply(id, { tools: TOOLS });
      case 'tools/call': {
        try {
          const result = await callTool(params.name, params.arguments || {});
          return reply(id, { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result, isError: false });
        } catch (e) {
          if (e.rpc) return fail(id, e.rpc, e.message);
          return reply(id, { content: [{ type: 'text', text: e.message }], isError: true });
        }
      }
      default:
        if (method && method.startsWith('notifications/')) return; // initialized, cancelled, …
        if (isRequest) return fail(id, -32601, `Method not found: ${method}`);
    }
  } catch (e) {
    if (isRequest) fail(id, -32603, e.message);
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch (e) { return fail(null, -32700, 'Parse error'); }
  if (Array.isArray(msg)) msg.forEach(onMessage); else onMessage(msg);
});
rl.on('close', () => { bridge.close(); ndi.close(); process.exit(0); });
process.on('uncaughtException', (e) => console.error('[ptz-pad helper]', e));
console.error(`[ptz-pad helper] ${VERSION} ready`);
