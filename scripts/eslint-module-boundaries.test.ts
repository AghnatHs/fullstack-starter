import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ESLint } from 'eslint';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';
import moduleBoundaries from './eslint-module-boundaries.mjs';

let root: string;
let eslint: ESLint;

beforeAll(() => {
  root = mkdtempSync(resolve(tmpdir(), 'starter-module-lint-'));
  function file(path: string, content: string) {
    const target = resolve(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  function json(path: string, value: unknown) {
    file(path, JSON.stringify(value));
  }

  json('package.json', { private: true, type: 'module', workspaces: ['apps/*', 'packages/*'] });
  json('tsconfig.json', {
    compilerOptions: {
      module: 'ESNext',
      moduleResolution: 'Bundler',
      jsx: 'react-jsx',
      paths: {
        '@api/*': ['./apps/api/src/*'],
        '@web/*': ['./apps/web/src/*'],
        '@db/*': ['./packages/db/src/*'],
        '@contracts': ['./packages/shared/src/index.ts'],
        '@billing': ['./apps/api/src/module/billing/index.ts'],
        '@implementation': ['./apps/api/src/module/billing/service.ts'],
      },
    },
  });
  for (const app of ['api', 'web']) {
    json(`apps/${app}/tsconfig.json`, { extends: '../../tsconfig.json' });
    json(`apps/${app}/package.json`, {
      name: `@fixture/${app}`,
      type: 'module',
      exports: {
        '.': './src/module/billing/index.ts',
        './hidden': './src/module/billing/service.ts',
        './services/*': './src/module/billing/*.ts',
        './conditional': {
          types: './src/module/billing/service.ts',
          default: './src/module/billing/index.ts',
        },
        './mode': {
          import: './src/module/billing/index.ts',
          require: './src/module/billing/service.ts',
        },
      },
      imports: {
        '#mapped-billing': './src/module/billing/index.ts',
        '#mapped-service': './src/module/billing/service.ts',
      },
    });
    for (const business of ['billing', 'checkout']) {
      for (const path of ['index.ts', 'service.ts', 'nested/index.ts', 'middleware/auth.ts']) {
        file(`apps/${app}/src/module/${business}/${path}`, 'export const value = 1;');
      }
    }
    for (const path of [
      'app.ts',
      'lib/utility.ts',
      'middleware/auth.ts',
      'tests/outside.test.ts',
    ]) {
      file(`apps/${app}/src/${path}`, '');
    }
    file(`apps/${app}/tests/consumer.test.ts`, '');
  }
  for (const name of ['db', 'shared']) {
    json(`packages/${name}/package.json`, {
      name: `@starter/${name}`,
      type: 'module',
      exports: { '.': './src/index.ts', './schema': './src/schema.ts' },
    });
    json(`packages/${name}/tsconfig.json`, { extends: '../../tsconfig.json' });
    file(`packages/${name}/src/index.ts`, 'export const value = 1;');
    file(`packages/${name}/src/schema.ts`, 'export type Value = number;');
  }
  file('tests/consumer.test.ts', '');
  eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.{ts,tsx,mts,cts}'],
        languageOptions: { parser: tseslint.parser },
        plugins: { starter: moduleBoundaries(root) },
        rules: { 'starter/module-boundaries': 'error' },
      },
    ],
  });
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

type Case = [name: string, filename: string, code: string, messageId?: string];

const cases: Case[] = [
  ['composition uses module root', 'apps/api/src/app.ts', "import './module/billing';"],
  ['explicit public index', 'apps/api/src/app.ts', "import './module/billing/index.ts';"],
  [
    'JavaScript extension resolves TypeScript index',
    'apps/api/src/app.ts',
    "import './module/billing/index.js';",
  ],
  ['cross-module public call', 'apps/api/src/module/checkout/service.ts', "import '../billing';"],
  [
    'cross-module explicit public call',
    'apps/web/src/module/checkout/service.ts',
    "import '../billing/index';",
  ],
  ['own implementation', 'apps/api/src/module/billing/index.ts', "import './service';"],
  ['own implementation alias', 'apps/api/src/module/billing/index.ts', "import '@implementation';"],
  [
    'feature-specific middleware',
    'apps/api/src/module/billing/middleware/auth.ts',
    "import '../service';",
  ],
  [
    'named public exports',
    'apps/api/src/module/billing/index.ts',
    "export { value } from './service';",
  ],
  [
    'named type exports',
    'apps/api/src/module/billing/index.ts',
    "export type { Value } from '@starter/shared/schema';",
  ],
  ['public tsconfig alias', 'apps/api/src/app.ts', "import '@billing';"],
  ['public package mapping', 'apps/api/src/app.ts', "import '#mapped-billing';"],
  ['public workspace export', 'apps/api/src/app.ts', "import '@fixture/api';"],
  ['API may access database', 'apps/api/src/module/billing/service.ts', "import '@starter/db';"],
  ['API may access shared contracts', 'apps/api/src/app.ts', "import '@starter/shared';"],
  ['web may access shared contracts', 'apps/web/src/app.ts', "import '@contracts';"],
  [
    'shared may use its own files',
    'packages/shared/src/index.ts',
    "export type { Value } from './schema';",
  ],
  [
    'infrastructure may use infrastructure',
    'apps/web/src/lib/utility.ts',
    "import '../middleware/auth';",
  ],
  [
    'unresolved external package',
    'apps/api/src/app.ts',
    "import 'uninstalled-external-package/module/private';",
  ],
  [
    'nonliteral dynamic import',
    'apps/api/src/app.ts',
    'const target = getTarget(); import(target);',
  ],
  [
    'deep composition import',
    'apps/api/src/app.ts',
    "import './module/billing/service';",
    'publicEntry',
  ],
  [
    'normalized traversal',
    'apps/api/src/app.ts',
    "import './module/checkout/../billing/service.ts';",
    'publicEntry',
  ],
  [
    'deep cross-module import',
    'apps/api/src/module/checkout/service.ts',
    "import '../billing/service';",
    'publicEntry',
  ],
  ['deep web import', 'apps/web/src/app.ts', "import './module/billing/service';", 'publicEntry'],
  [
    'nested index is not public',
    'apps/api/src/app.ts',
    "import './module/billing/nested';",
    'publicEntry',
  ],
  [
    'explicit nested index is not public',
    'apps/api/src/app.ts',
    "import './module/billing/nested/index.ts';",
    'publicEntry',
  ],
  [
    'type import',
    'apps/api/src/app.ts',
    "import type { Value } from './module/billing/service';",
    'publicEntry',
  ],
  [
    'named re-export',
    'apps/api/src/app.ts',
    "export { value } from './module/billing/service';",
    'publicEntry',
  ],
  [
    'star re-export',
    'apps/api/src/app.ts',
    "export * from './module/billing/service';",
    'publicEntry',
  ],
  ['dynamic import', 'apps/api/src/app.ts', "import('./module/billing/service');", 'publicEntry'],
  [
    'template literal import',
    'apps/api/src/app.ts',
    'import(`./module/billing/service`);',
    'publicEntry',
  ],
  ['require', 'apps/api/src/app.ts', "require('./module/billing/service');", 'publicEntry'],
  [
    'TypeScript import equals',
    'apps/api/src/app.ts',
    "import service = require('./module/billing/service');",
    'publicEntry',
  ],
  [
    'TypeScript type import',
    'apps/api/src/app.ts',
    "type Value = import('./module/billing/service').Value;",
    'publicEntry',
  ],
  [
    'implementation tsconfig alias',
    'apps/api/src/app.ts',
    "import '@implementation';",
    'publicEntry',
  ],
  [
    'wildcard tsconfig alias',
    'apps/api/src/app.ts',
    "import '@api/module/billing/service';",
    'publicEntry',
  ],
  ['package imports mapping', 'apps/api/src/app.ts', "import '#mapped-service';", 'publicEntry'],
  [
    'workspace exports mapping',
    'apps/api/src/app.ts',
    "import '@fixture/api/hidden';",
    'publicEntry',
  ],
  [
    'workspace wildcard exports',
    'apps/api/src/app.ts',
    "import '@fixture/api/services/service';",
    'publicEntry',
  ],
  [
    'workspace conditional types export',
    'apps/api/src/app.ts',
    "import type { Value } from '@fixture/api/conditional';",
    'publicEntry',
  ],
  ['workspace import condition', 'apps/api/src/app.ts', "import '@fixture/api/mode';"],
  [
    'workspace require condition',
    'apps/api/src/app.ts',
    "require('@fixture/api/mode');",
    'publicEntry',
  ],
  [
    'workspace import equals condition',
    'apps/api/src/app.ts',
    "import service = require('@fixture/api/mode');",
    'publicEntry',
  ],
  [
    'app test is an outside consumer',
    'apps/api/tests/consumer.test.ts',
    "import '../src/module/billing/service';",
    'publicEntry',
  ],
  [
    'root test is an outside consumer',
    'tests/consumer.test.ts',
    "import '../apps/api/src/module/billing/service';",
    'publicEntry',
  ],
  [
    'API index cannot export star',
    'apps/api/src/module/billing/index.ts',
    "export * from './service';",
    'explicitExports',
  ],
  [
    'web index cannot export star',
    'apps/web/src/module/billing/index.ts',
    "export * from './service';",
    'explicitExports',
  ],
  [
    'type star export',
    'apps/api/src/module/billing/index.ts',
    "export type * from './service';",
    'explicitExports',
  ],
  [
    'namespace star export',
    'apps/api/src/module/billing/index.ts',
    "export * as service from './service';",
    'explicitExports',
  ],
  [
    'API technical lib',
    'apps/api/src/lib/utility.ts',
    "import '../module/billing';",
    'infrastructure',
  ],
  [
    'API HTTP middleware',
    'apps/api/src/middleware/auth.ts',
    "import '@billing';",
    'infrastructure',
  ],
  [
    'web technical lib',
    'apps/web/src/lib/utility.ts',
    "import '../module/billing';",
    'infrastructure',
  ],
  [
    'web HTTP middleware',
    'apps/web/src/middleware/auth.ts',
    "import '../module/billing/service';",
    'infrastructure',
  ],
  [
    'infrastructure type import',
    'apps/api/src/lib/utility.ts',
    "type Value = import('@billing').Value;",
    'infrastructure',
  ],
  ['web database workspace alias', 'apps/web/src/app.ts', "import '@starter/db';", 'webServerOnly'],
  [
    'web database exported subpath',
    'apps/web/src/app.ts',
    "import type { Value } from '@starter/db/schema';",
    'webServerOnly',
  ],
  [
    'web database non-exported subpath',
    'apps/web/src/app.ts',
    "import '@starter/db/src/index.ts';",
    'webServerOnly',
  ],
  [
    'web database relative path',
    'apps/web/src/app.ts',
    "import '../../../packages/db/src';",
    'webServerOnly',
  ],
  ['web database tsconfig alias', 'apps/web/src/app.ts', "import '@db/schema';", 'webServerOnly'],
  ['web database require', 'apps/web/src/app.ts', "require('@starter/db');", 'webServerOnly'],
  [
    'web database dynamic type import',
    'apps/web/src/app.ts',
    "type Value = import('@starter/db').Value;",
    'webServerOnly',
  ],
  [
    'web API relative type import',
    'apps/web/src/app.ts',
    "import type { Value } from '../../api/src/module/billing';",
    'webServerOnly',
  ],
  [
    'web API tsconfig alias',
    'apps/web/src/app.ts',
    "import('@api/module/billing');",
    'webServerOnly',
  ],
  ['web API workspace export', 'apps/web/src/app.ts', "import '@fixture/api';", 'webServerOnly'],
  [
    'API web relative import',
    'apps/api/src/app.ts',
    "import '../../web/src/module/billing';",
    'apiWeb',
  ],
  [
    'API web type alias',
    'apps/api/src/app.ts',
    "type Value = import('@web/module/billing').Value;",
    'apiWeb',
  ],
  [
    'API web workspace export',
    'apps/api/src/app.ts',
    "export { value } from '@fixture/web';",
    'apiWeb',
  ],
  [
    'shared API relative import',
    'packages/shared/src/index.ts',
    "import '../../../apps/api/src/module/billing';",
    'sharedClientSafe',
  ],
  [
    'shared web relative import',
    'packages/shared/src/index.ts',
    "export { value } from '../../../apps/web/src/module/billing';",
    'sharedClientSafe',
  ],
  [
    'shared database relative import',
    'packages/shared/src/index.ts',
    "import '../../db/src';",
    'sharedClientSafe',
  ],
  [
    'shared database workspace type import',
    'packages/shared/src/index.ts',
    "import type { Value } from '@starter/db/schema';",
    'sharedClientSafe',
  ],
  [
    'shared API alias',
    'packages/shared/src/index.ts',
    "require('@api/module/billing');",
    'sharedClientSafe',
  ],
  [
    'shared web alias',
    'packages/shared/src/index.ts',
    "import('@web/module/billing');",
    'sharedClientSafe',
  ],
];

describe('resolved module boundaries', () => {
  for (const [name, filename, code, messageId] of cases) {
    test(name, async () => {
      const [result] = await eslint.lintText(code, { filePath: resolve(root, filename) });
      if (messageId) {
        expect(result.messages).toHaveLength(1);
        expect(result.messages[0]).toMatchObject({
          ruleId: 'starter/module-boundaries',
          severity: 2,
          messageId,
        });
      } else {
        expect(result.messages).toEqual([]);
      }
    });
  }
});

test('normal ESLint configuration enforces server-only boundaries without duplicate errors', async () => {
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const configured = new ESLint({ cwd: repository });
  const [invalid] = await configured.lintText("import '@starter/db';", {
    filePath: resolve(repository, 'apps/web/src/module-boundary-probe.ts'),
  });
  expect(invalid.messages).toHaveLength(1);
  expect(invalid.messages[0]).toMatchObject({
    ruleId: 'starter/module-boundaries',
    messageId: 'webServerOnly',
    severity: 2,
  });
  const [valid] = await configured.lintText("import '@starter/shared';", {
    filePath: resolve(repository, 'apps/web/src/module-boundary-probe.ts'),
  });
  expect(valid.messages).toEqual([]);
});
