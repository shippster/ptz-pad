// Adds the PTZ Pad helper to the Claude desktop app's MCP settings.
// Run by the "Set up Claude helper" launchers; safe to run again.
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.resolve(__dirname, '..');
const helper = path.join(root, 'helper', 'ptz-pad-mcp.js');
const node = process.execPath; // the Node.js running this script (PTZ Pad's own copy)
const NAME = 'ptz-pad';

function configFiles() {
  const files = [];
  if (process.platform === 'win32') {
    if (process.env.APPDATA) files.push(path.join(process.env.APPDATA, 'Claude', 'claude_desktop_config.json'));
    // Microsoft Store installs keep their settings in a separate folder.
    const pkgs = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Packages');
    if (pkgs && fs.existsSync(pkgs)) {
      for (const d of fs.readdirSync(pkgs)) {
        if (/^Claude_/i.test(d)) files.push(path.join(pkgs, d, 'LocalCache', 'Roaming', 'Claude', 'claude_desktop_config.json'));
      }
    }
  } else if (process.platform === 'darwin') {
    files.push(path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'));
  } else {
    files.push(path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json'));
  }
  return files;
}

let wrote = 0;
for (const file of configFiles()) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir) && wrote) continue; // only create the main location
  fs.mkdirSync(dir, { recursive: true });
  let cfg = {};
  if (fs.existsSync(file)) {
    const text = fs.readFileSync(file, 'utf8');
    try { cfg = text.trim() ? JSON.parse(text) : {}; } catch (e) {
      console.error(` ${file} isn't valid JSON, so it was left alone. Fix or delete it, then run this again.`);
      process.exitCode = 1;
      continue;
    }
    fs.writeFileSync(file + '.ptzpad-backup', text);
  }
  cfg.mcpServers = cfg.mcpServers || {};
  cfg.mcpServers[NAME] = { command: node, args: [helper] };
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
  console.log(` Added the PTZ Pad helper to ${file}`);
  wrote++;
}
if (wrote) {
  console.log('\n Done. Quit the Claude desktop app completely and open it again, then open your PTZ Pad page in it.');
} else if (!process.exitCode) {
  console.error(' Could not find where the Claude desktop app keeps its settings. Is it installed?');
  process.exitCode = 1;
}
