// src/utils/env.js
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const cwd = process.cwd();
const candidates = [
  path.resolve(cwd, '.env.local'), // local overrides
  path.resolve(cwd, '.env'),       // base
];

// load first existing file(s) in order (local first, then base)
for (const p of candidates) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p, override: true });
  }
}

export function requireEnv(keys = []) {
  const missing = keys.filter(
    (k) => !process.env[k] || process.env[k] === '__REPLACE_ME__'
  );
  if (missing.length) {
    throw new Error('Missing env: ' + missing.join(', '));
  }
}

// Convenience getters (optional)
export const getEnv = (key, def = undefined) => {
  const v = process.env[key];
  return v === undefined || v === '__REPLACE_ME__' ? def : v;
};
export const getInt = (key, def = undefined) => {
  const v = getEnv(key, def);
  return v === undefined ? undefined : parseInt(v, 10);
};
