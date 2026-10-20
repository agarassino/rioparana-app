// server/src/admin/hashPassword.ts
// Prints the argon2id hash for ADMIN_PASSWORD_HASH. Reads the password from
// stdin so it never lands in shell history or `ps` output.
//   read -rs PW && printf '%s\n' "$PW" | npx tsx src/admin/hashPassword.ts; unset PW
import { createInterface } from 'node:readline';
import { hashPassword } from './password.js';

const rl = createInterface({ input: process.stdin });
rl.once('line', async (line) => {
  rl.close();
  if (line.length < 12) {
    console.error('Use at least 12 characters.');
    process.exit(1);
  }
  console.log(await hashPassword(line));
});
