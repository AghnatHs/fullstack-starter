import { readdirSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourceExtensions = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);
const ignoredDirectories = new Set(['.git', 'coverage', 'dist', 'node_modules']);
const migrationsDirectory = join('packages', 'db', 'migrations');

type WorkspaceManifest = {
  workspaces?: string[] | { packages?: string[] };
};

function canonicalPath(path: string): string {
  const absolute = resolve(path);
  try {
    return ts.sys.realpath?.(absolute) ?? absolute;
  } catch {
    return absolute;
  }
}

function createResolver(rootDirectory: string) {
  const manifest = ts.readConfigFile(resolve(rootDirectory, 'package.json'), ts.sys.readFile)
    .config as WorkspaceManifest | undefined;
  const patterns = Array.isArray(manifest?.workspaces)
    ? manifest.workspaces
    : (manifest?.workspaces?.packages ?? []);
  const workspaces = new Map<string, string>();
  for (const file of ts.sys.readDirectory(
    rootDirectory,
    ['.json'],
    ['**/node_modules/**'],
    patterns.map((pattern) => `${pattern}/package.json`),
  )) {
    const workspace = ts.readConfigFile(file, ts.sys.readFile).config as
      | { name?: string }
      | undefined;
    if (workspace?.name) workspaces.set(workspace.name, dirname(file));
  }

  // Let TypeScript interpret workspace exports/imports without depending on installed symlinks.
  function workspacePath(path: string): string {
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
    fileExists: (path: string) => ts.sys.fileExists(workspacePath(path)),
    readFile: (path: string) => ts.sys.readFile(workspacePath(path)),
    realpath: (path: string) => canonicalPath(workspacePath(path)),
    directoryExists(path: string) {
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
  const configurations = new Map<
    string,
    { options: ts.CompilerOptions; cache: ts.ModuleResolutionCache }
  >();
  const directories = new Map<
    string,
    { options: ts.CompilerOptions; cache: ts.ModuleResolutionCache }
  >();

  function configurationFor(filename: string) {
    const directory = dirname(filename);
    const initial = directories.get(directory);
    if (initial) return initial;
    const configFile = ts.findConfigFile(directory, ts.sys.fileExists);
    const key = configFile ?? rootDirectory;
    let configuration = configurations.get(key);
    if (!configuration) {
      const defaults: ts.CompilerOptions = {
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
      configuration = {
        options,
        cache: ts.createModuleResolutionCache(rootDirectory, (path) => path, options),
      };
      configurations.set(key, configuration);
    }
    directories.set(directory, configuration);
    return configuration;
  }

  return (
    specifier: string,
    filename: string,
    resolutionMode: ts.ModuleKind = ts.ModuleKind.ESNext,
  ): string | undefined => {
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

type SourceLocation = {
  application?: string;
  businessModule?: string;
  publicEntry: boolean;
  infrastructure: boolean;
  database: boolean;
  shared: boolean;
};

function location(rootDirectory: string, filename: string): SourceLocation {
  const path = relative(rootDirectory, filename);
  if (isAbsolute(path) || path === '..' || path.startsWith(`..${sep}`)) {
    return { publicEntry: false, infrastructure: false, database: false, shared: false };
  }
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

function literalValue(node: ts.Node | undefined): string | undefined {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isLiteralTypeNode(node)) return literalValue(node.literal);
  return undefined;
}

export type BoundaryRule =
  | 'apiWeb'
  | 'explicitExports'
  | 'infrastructure'
  | 'publicEntry'
  | 'sharedClientSafe'
  | 'webServerOnly';

export type BoundaryViolation = {
  column: number;
  file: string;
  line: number;
  message: string;
  rule: BoundaryRule;
};

const messages: Record<BoundaryRule, (module?: string) => string> = {
  publicEntry: (module) =>
    `Import ${module ?? 'a business module'} through its public index.ts, not an implementation file.`,
  explicitExports: () => 'Module public indexes must use explicit named exports, not export *.',
  infrastructure: () => 'Technical lib/ and middleware/ must not depend on business modules.',
  webServerOnly: () =>
    'Web code must not import API or database code. Database access belongs in apps/api.',
  apiWeb: () => 'API code must not import web code.',
  sharedClientSafe: () => 'Shared contracts must remain client-safe: no app or database imports.',
};

function scriptKind(filename: string): ts.ScriptKind {
  switch (extname(filename).toLowerCase()) {
    case '.cjs':
    case '.js':
    case '.mjs':
      return ts.ScriptKind.JS;
    case '.jsx':
      return ts.ScriptKind.JSX;
    case '.tsx':
      return ts.ScriptKind.TSX;
    default:
      return ts.ScriptKind.TS;
  }
}

function walk(rootDirectory: string): string[] {
  const files: string[] = [];

  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const path = join(directory, entry.name);
        if (ignoredDirectories.has(entry.name)) continue;
        if (relative(rootDirectory, path) === migrationsDirectory) continue;
        visit(path);
      } else if (sourceExtensions.has(extname(entry.name))) {
        files.push(join(directory, entry.name));
      }
    }
  }

  visit(rootDirectory);
  return files;
}

export type ModuleBoundaryChecker = {
  lintFiles(files?: readonly string[]): BoundaryViolation[];
  lintText(filename: string, code: string): BoundaryViolation[];
};

export function createModuleBoundaryChecker(rootDirectory: string): ModuleBoundaryChecker {
  const root = canonicalPath(rootDirectory);
  const resolveImport = createResolver(root);

  function lintText(filename: string, code: string): BoundaryViolation[] {
    const path = canonicalPath(filename);
    const source = location(root, path);
    const sourceFile = ts.createSourceFile(
      path,
      code,
      ts.ScriptTarget.Latest,
      true,
      scriptKind(path),
    );
    const violations: BoundaryViolation[] = [];

    function report(node: ts.Node, rule: BoundaryRule, module?: string) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push({
        column: position.character + 1,
        file: path,
        line: position.line + 1,
        message: messages[rule](module),
        rule,
      });
    }

    function check(
      node: ts.Node,
      specifierNode: ts.Node | undefined,
      resolutionMode?: ts.ModuleKind,
    ) {
      const specifier = literalValue(specifierNode);
      if (specifier === undefined) return;
      const targetFile = resolveImport(specifier, path, resolutionMode);
      if (!targetFile) return;
      const target = location(root, targetFile);
      if (source.application === 'web' && (target.application === 'api' || target.database)) {
        report(node, 'webServerOnly');
      } else if (source.application === 'api' && target.application === 'web') {
        report(node, 'apiWeb');
      } else if (source.shared && (target.application || target.database)) {
        report(node, 'sharedClientSafe');
      } else if (
        source.infrastructure &&
        target.businessModule &&
        source.application === target.application
      ) {
        report(node, 'infrastructure');
      } else if (
        target.businessModule &&
        target.businessModule !== source.businessModule &&
        !target.publicEntry
      ) {
        report(node, 'publicEntry', target.businessModule);
      }
    }

    function visit(node: ts.Node) {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (
          ts.isExportDeclaration(node) &&
          source.publicEntry &&
          (!node.exportClause || ts.isNamespaceExport(node.exportClause))
        ) {
          report(node, 'explicitExports');
        }
        check(node, node.moduleSpecifier);
      } else if (ts.isExternalModuleReference(node)) {
        check(node, node.expression, ts.ModuleKind.CommonJS);
      } else if (ts.isImportTypeNode(node)) {
        check(node, node.argument);
      } else if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          check(node, node.arguments[0]);
        } else if (
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'require' &&
          node.arguments[0]
        ) {
          check(node, node.arguments[0], ts.ModuleKind.CommonJS);
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return violations;
  }

  function lintFiles(files: readonly string[] = walk(root)): BoundaryViolation[] {
    const violations: BoundaryViolation[] = [];
    for (const file of files) {
      if (!sourceExtensions.has(extname(file))) continue;
      const code = ts.sys.readFile(file);
      if (code === undefined) continue;
      violations.push(...lintText(file, code));
    }
    return violations;
  }

  return { lintFiles, lintText };
}

if (import.meta.main) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const violations = createModuleBoundaryChecker(root).lintFiles();
  for (const violation of violations) {
    const file = relative(root, violation.file).split(sep).join('/');
    console.error(`${file}:${violation.line}:${violation.column} ${violation.message}`);
  }
  if (violations.length > 0) {
    console.error(`\n${violations.length} module boundary violation(s).`);
    process.exit(1);
  }
}
