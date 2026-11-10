import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

function canonicalPath(path) {
  const absolute = resolve(path);
  return ts.sys.realpath?.(absolute) ?? absolute;
}

function createResolver(rootDirectory) {
  const manifest = ts.readConfigFile(
    resolve(rootDirectory, 'package.json'),
    ts.sys.readFile,
  ).config;
  const patterns = manifest?.workspaces?.packages ?? manifest?.workspaces ?? [];
  const workspaces = new Map();
  for (const file of ts.sys.readDirectory(
    rootDirectory,
    ['.json'],
    ['**/node_modules/**'],
    patterns.map((pattern) => `${pattern}/package.json`),
  )) {
    const workspace = ts.readConfigFile(file, ts.sys.readFile).config;
    if (workspace?.name) workspaces.set(workspace.name, dirname(file));
  }

  // Let TypeScript interpret workspace exports/imports without depending on installed symlinks.
  function workspacePath(path) {
    const normalized = path.split(sep).join('/');
    const marker = '/node_modules/';
    const offset = normalized.lastIndexOf(marker);
    if (offset === -1) return path;
    const suffix = normalized.slice(offset + marker.length);
    for (const [name, directory] of workspaces) {
      if (suffix === name || suffix.startsWith(`${name}/`)) {
        return resolve(directory, suffix.slice(name.length + 1));
      }
    }
    return path;
  }

  const host = {
    fileExists: (path) => ts.sys.fileExists(workspacePath(path)),
    readFile: (path) => ts.sys.readFile(workspacePath(path)),
    realpath: (path) => canonicalPath(workspacePath(path)),
    directoryExists(path) {
      if (ts.sys.directoryExists(workspacePath(path))) return true;
      const normalized = path.split(sep).join('/');
      if (normalized.endsWith('/node_modules')) return workspaces.size > 0;
      const scope = normalized.split('/node_modules/').at(-1);
      return (
        scope !== undefined && [...workspaces.keys()].some((name) => name.startsWith(`${scope}/`))
      );
    },
    getCurrentDirectory: () => rootDirectory,
  };
  const configurations = new Map();
  const directories = new Map();

  function configurationFor(filename) {
    const directory = dirname(filename);
    if (directories.has(directory)) return directories.get(directory);
    const configFile = ts.findConfigFile(directory, ts.sys.fileExists);
    const key = configFile ?? rootDirectory;
    if (!configurations.has(key)) {
      const defaults = {
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        allowJs: true,
      };
      let options = defaults;
      if (configFile) {
        const parsed = ts.getParsedCommandLineOfConfigFile(
          configFile,
          {},
          {
            ...ts.sys,
            onUnRecoverableConfigFileDiagnostic(diagnostic) {
              throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
            },
          },
        );
        if (parsed) options = { ...defaults, ...parsed.options };
      }
      configurations.set(key, {
        options,
        cache: ts.createModuleResolutionCache(rootDirectory, (path) => path, options),
      });
    }
    const configuration = configurations.get(key);
    directories.set(directory, configuration);
    return configuration;
  }

  return (specifier, filename, resolutionMode = ts.ModuleKind.ESNext) => {
    const { options, cache } = configurationFor(filename);
    const result = ts.resolveModuleName(
      specifier,
      filename,
      options,
      host,
      cache,
      undefined,
      resolutionMode,
    ).resolvedModule;
    if (result) return canonicalPath(workspacePath(result.resolvedFileName));

    // Even a non-exported workspace subpath must not bypass server-only boundaries.
    for (const [name, directory] of workspaces) {
      if (!specifier.startsWith(`${name}/`)) continue;
      const target = resolve(directory, specifier.slice(name.length + 1));
      const fallback = ts.resolveModuleName(
        target,
        filename,
        options,
        host,
        undefined,
        undefined,
        resolutionMode,
      ).resolvedModule;
      if (fallback) return canonicalPath(fallback.resolvedFileName);
    }
    return undefined;
  };
}

function location(rootDirectory, filename) {
  const path = relative(rootDirectory, filename);
  if (isAbsolute(path) || path === '..' || path.startsWith(`..${sep}`)) return {};
  const segments = path.split(sep);
  const application = segments[0] === 'apps' ? segments[1] : undefined;
  const businessModule =
    (application === 'api' || application === 'web') &&
    segments[2] === 'src' &&
    segments[3] === 'module' &&
    segments[4]
      ? segments.slice(0, 5).join('/')
      : undefined;
  return {
    application,
    businessModule,
    publicEntry:
      businessModule !== undefined && segments.length === 6 && segments[5] === 'index.ts',
    infrastructure:
      segments[2] === 'src' && (segments[3] === 'lib' || segments[3] === 'middleware'),
    database: segments[0] === 'packages' && segments[1] === 'db',
    shared: segments[0] === 'packages' && segments[1] === 'shared',
  };
}

function literalValue(node) {
  if (typeof node?.value === 'string') return node.value;
  if (node?.type === 'TSLiteralType') return literalValue(node.literal);
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  return undefined;
}

export default function moduleBoundaries(rootDirectory) {
  const root = canonicalPath(rootDirectory);
  const resolveImport = createResolver(root);
  return {
    rules: {
      'module-boundaries': {
        meta: {
          type: 'problem',
          schema: [],
          messages: {
            publicEntry:
              'Import {{module}} through its public index.ts, not an implementation file.',
            explicitExports: 'Module public indexes must use explicit named exports, not export *.',
            infrastructure: 'Technical lib/ and middleware/ must not depend on business modules.',
            webServerOnly:
              'Web code must not import API or database code. Database access belongs in apps/api.',
            apiWeb: 'API code must not import web code.',
            sharedClientSafe:
              'Shared contracts must remain client-safe: no app or database imports.',
          },
        },
        create(context) {
          const filename = canonicalPath(context.physicalFilename ?? context.filename);
          const source = location(root, filename);

          function check(node, sourceNode, resolutionMode) {
            const specifier = literalValue(sourceNode);
            if (specifier === undefined) return;
            const targetFile = resolveImport(specifier, filename, resolutionMode);
            if (!targetFile) return;
            const target = location(root, targetFile);
            let messageId;
            if (source.application === 'web' && (target.application === 'api' || target.database)) {
              messageId = 'webServerOnly';
            } else if (source.application === 'api' && target.application === 'web') {
              messageId = 'apiWeb';
            } else if (source.shared && (target.application || target.database)) {
              messageId = 'sharedClientSafe';
            } else if (
              source.infrastructure &&
              target.businessModule &&
              source.application === target.application
            ) {
              messageId = 'infrastructure';
            } else if (
              target.businessModule &&
              target.businessModule !== source.businessModule &&
              !target.publicEntry
            ) {
              messageId = 'publicEntry';
            }
            if (messageId) {
              context.report({ node, messageId, data: { module: target.businessModule } });
            }
          }

          return {
            ImportDeclaration: (node) => check(node, node.source),
            ExportNamedDeclaration: (node) => check(node, node.source),
            ExportAllDeclaration(node) {
              if (source.publicEntry) context.report({ node, messageId: 'explicitExports' });
              check(node, node.source);
            },
            ImportExpression: (node) => check(node, node.source),
            CallExpression(node) {
              if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
                check(node, node.arguments[0], ts.ModuleKind.CommonJS);
              }
            },
            TSExternalModuleReference: (node) =>
              check(node, node.expression, ts.ModuleKind.CommonJS),
            TSImportType: (node) => check(node, node.source ?? node.argument),
          };
        },
      },
    },
  };
}
