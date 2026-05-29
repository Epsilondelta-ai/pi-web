package backend

const oauthHelperScript = `
import { createInterface } from 'node:readline';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const oauthModule = await import(pathToFileURL(process.env.PI_AI_OAUTH_INDEX).href);
const { getOAuthProvider, getOAuthProviders } = oauthModule;
const authPath = process.env.PI_AUTH_PATH;
const providerId = process.argv[process.argv.length - 1];
const provider = getOAuthProvider(providerId);

function emit(event) {
  process.stdout.write(JSON.stringify(event) + '\n');
}

if (!provider) {
  emit({ type: 'error', message: 'Unknown OAuth provider: ' + providerId });
  process.exit(2);
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
const pending = [];
rl.on('line', (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.type !== 'input') return;
  const next = pending.shift();
  if (next) next(String(message.value ?? ''));
});

function requestInput(kind, prompt) {
  emit({ type: kind, prompt });
  return new Promise((resolve) => pending.push(resolve));
}

function loadAuth() {
  if (!existsSync(authPath)) return {};
  try { return JSON.parse(readFileSync(authPath, 'utf-8')); } catch { return {}; }
}

function saveAuth(credentials) {
  mkdirSync(dirname(authPath), { recursive: true, mode: 0o700 });
  const auth = loadAuth();
  auth[providerId] = { type: 'oauth', ...credentials };
  writeFileSync(authPath, JSON.stringify(auth, null, 2), 'utf-8');
  chmodSync(authPath, 0o600);
}

try {
  emit({ type: 'started', provider: { id: provider.id, name: provider.name } });
  const credentials = await provider.login({
    onAuth: (info) => emit({ type: 'auth', url: info.url, instructions: info.instructions || '' }),
    onPrompt: async (prompt) => requestInput('prompt', prompt),
    onManualCodeInput: async () => requestInput('manualCode', { message: 'Paste authorization code or final redirect URL' }),
    onProgress: (message) => emit({ type: 'progress', message }),
  });
  saveAuth(credentials);
  emit({ type: 'success', provider: { id: provider.id, name: provider.name } });
  process.exit(0);
} catch (error) {
  emit({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  process.exit(1);
} finally {
  rl.close();
}
`
