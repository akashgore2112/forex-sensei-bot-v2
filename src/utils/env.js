import fs from 'fs';
import path from 'path';

import dotenv from 'dotenv';
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
export function requireEnv(keys = []) {
  const missing = keys.filter((k) => !process.env[k] || process.env[k] === '__REPLACE_ME__');
  if (missing.length) throw new Error('Missing env: ' + missing.join(', '));
}
