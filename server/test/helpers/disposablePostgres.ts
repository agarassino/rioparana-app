import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import pg from 'pg';

export function postgresUnavailable(): string | null {
  if (process.getuid?.() === 0) return 'initdb cannot run as root';
  for (const executable of ['initdb', 'pg_ctl']) {
    const result = spawnSync(executable, ['--version'], { encoding: 'utf8' });
    if (result.error || result.status !== 0) return `${executable} unavailable`;
  }
  return null;
}

export async function disposablePostgres() {
  const port = await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('No local port'));
      server.close(() => resolve(address.port));
    });
  });
  const root = mkdtempSync(join(tmpdir(), 'rioparana-feedback-pg-'));
  const data = join(root, 'data');
  const run = (command: string, args: string[]) => {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 30_000 });
    if (result.error || result.status !== 0) throw new Error(`${command}: ${result.error ?? result.stderr}`);
  };
  const stop = () => {
    // Check only this owned cluster, including partially successful starts.
    if (existsSync(join(data, 'postmaster.pid')) && spawnSync('pg_ctl', ['-D', data, 'status']).status === 0) {
      run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    }
    rmSync(root, { recursive: true, force: true });
  };
  try {
    run('initdb', ['-D', data, '-U', 'feedback_test', '--auth=trust', '--no-locale']);
    run('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${root}`, '-w', 'start']);
    const pool = new pg.Pool({ connectionString: `postgresql://feedback_test@127.0.0.1:${port}/postgres`, max: 20 });
    return { pool, stop: async () => { await pool.end(); stop(); } };
  } catch (error) {
    stop();
    throw error;
  }
}
