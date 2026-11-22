import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// Docker builds and production installs run prepare without git metadata or dev dependencies.
if (!existsSync('.git') || !existsSync('node_modules/husky')) process.exit(0);

const result = spawnSync(process.execPath, ['x', 'husky'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
