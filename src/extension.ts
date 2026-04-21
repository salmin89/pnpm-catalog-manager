// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

interface NpmPackageInfo {
  description?: string;
  version: string;
  homepage?: string;
  time?: string;
}

// Cache for npm package info
const packageInfoCache: Map<string, NpmPackageInfo> = new Map();

async function fetchPackageInfo(packageName: string): Promise<NpmPackageInfo | null> {
  if (packageInfoCache.has(packageName)) {
    return packageInfoCache.get(packageName)!;
  }

  try {
    const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`);
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as {
      description?: string;
      version: string;
      homepage?: string;
      time?: string;
    };

    const info: NpmPackageInfo = {
      description: data.description,
      version: data.version,
      homepage: data.homepage,
      time: data.time,
    };

    packageInfoCache.set(packageName, info);
    return info;
  } catch {
    return null;
  }
}

// Decoration type for outdated packages (has update available)
const outdatedDecorationType = vscode.window.createTextEditorDecorationType({
  after: {
    color: '#f59e0b',
    fontStyle: 'italic',
  },
});

// Decoration type for up-to-date packages
const upToDateDecorationType = vscode.window.createTextEditorDecorationType({
  after: {
    color: '#22c55e',
    fontStyle: 'italic',
  },
});

// Cache for outdated packages: packageName -> latest version
let outdatedCache: Map<string, string> = new Map();
let cacheWorkspaceRoot: string | null = null;
let isFetching = false;

async function fetchOutdatedPackages(workspaceRoot: string): Promise<Map<string, string>> {
  if (isFetching) {
    return outdatedCache;
  }

  isFetching = true;
  const result = new Map<string, string>();

  try {
    const { stdout } = await execAsync('pnpm outdated -r --json', {
      cwd: workspaceRoot,
      timeout: 30000,
    });

    const data = JSON.parse(stdout);

    // pnpm outdated --json returns an object with package names as keys
    for (const [packageName, info] of Object.entries(data)) {
      const pkgInfo = info as { current: string; latest: string };
      if (pkgInfo.latest) {
        result.set(packageName, pkgInfo.latest);
      }
    }
  } catch (error: unknown) {
    // pnpm outdated exits with code 1 when there are outdated packages
    // so we need to parse stdout from the error
    const execError = error as { stdout?: string; code?: number };
    if (execError.stdout) {
      try {
        const data = JSON.parse(execError.stdout);
        for (const [packageName, info] of Object.entries(data)) {
          const pkgInfo = info as { current: string; latest: string };
          if (pkgInfo.latest) {
            result.set(packageName, pkgInfo.latest);
          }
        }
      } catch {
        console.error('Failed to parse pnpm outdated output');
      }
    }
  } finally {
    isFetching = false;
  }

  return result;
}

async function updateDecorations(editor: vscode.TextEditor) {
  if (!editor.document.fileName.endsWith('pnpm-workspace.yaml')) {
    editor.setDecorations(outdatedDecorationType, []);
    editor.setDecorations(upToDateDecorationType, []);
    return;
  }

  const workspaceRoot = path.dirname(editor.document.fileName);

  // Refresh cache if workspace changed or cache is empty
  if (cacheWorkspaceRoot !== workspaceRoot || outdatedCache.size === 0) {
    cacheWorkspaceRoot = workspaceRoot;
    outdatedCache = await fetchOutdatedPackages(workspaceRoot);
  }

  const outdatedDecorations: vscode.DecorationOptions[] = [];
  const upToDateDecorations: vscode.DecorationOptions[] = [];
  const text = editor.document.getText();
  const lines = text.split('\n');

  let inCatalogSection = false;
  let inNamedCatalog = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Check if we're entering a catalog section
    if (trimmedLine === 'catalog:' || trimmedLine === 'catalogs:') {
      inCatalogSection = true;
      inNamedCatalog = trimmedLine === 'catalogs:';
      continue;
    }

    // Check if we're leaving the catalog section (new top-level key)
    if (inCatalogSection && /^[a-zA-Z]/.test(line) && line.includes(':')) {
      inCatalogSection = false;
      inNamedCatalog = false;
      continue;
    }

    // If in catalog section and line starts with package name (indented with spaces)
    if (inCatalogSection) {
      // Match package lines like "  '@babel/core': 7.25.2" or "    vitest: 4.1.3"
      const packageMatch = line.match(/^(\s+)(['"]?)(@?[\w\-/.]+)\2:\s*(.+)$/);
      if (packageMatch) {
        const indent = packageMatch[1].length;
        const packageName = packageMatch[3];
        const currentVersion = packageMatch[4].trim();
        // In 'catalog:' section, packages are at indent 2
        // In 'catalogs:' section, packages are at indent 4 (under named catalog)
        const expectedIndent = inNamedCatalog ? 4 : 2;

        if (indent === expectedIndent) {
          const range = new vscode.Range(i, line.length, i, line.length);
          const latestVersion = outdatedCache.get(packageName);

          // Compare current version against cached latest version
          const isOutdated = latestVersion && latestVersion !== currentVersion && latestVersion !== currentVersion.replace(/^\^|~/, '');

          if (isOutdated) {
            outdatedDecorations.push({
              range,
              renderOptions: {
                after: {
                  contentText: ` → ${latestVersion}`,
                },
              },
            });
          } else {
            upToDateDecorations.push({
              range,
              renderOptions: {
                after: {
                  contentText: ' latest',
                },
              },
            });
          }
        }
      }
    }
  }

  editor.setDecorations(outdatedDecorationType, outdatedDecorations);
  editor.setDecorations(upToDateDecorationType, upToDateDecorations);
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "pnpm-catalog-manager" is now active!');

  // Update decorations when active editor changes
  vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      if (editor) {
        updateDecorations(editor);
      }
    },
    null,
    context.subscriptions,
  );

  // Update decorations when document changes
  vscode.workspace.onDidChangeTextDocument(
    (event) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && event.document === editor.document) {
        updateDecorations(editor);
      }
    },
    null,
    context.subscriptions,
  );

  // Re-draw decorations when pnpm-workspace.yaml is saved (uses cached data)
  vscode.workspace.onDidSaveTextDocument(
    (document) => {
      if (document.fileName.endsWith('pnpm-workspace.yaml')) {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document === document) {
          updateDecorations(editor);
        }
      }
    },
    null,
    context.subscriptions,
  );

  // Update decorations for current editor on activation
  if (vscode.window.activeTextEditor) {
    updateDecorations(vscode.window.activeTextEditor);
  }

  // Register hover provider for pnpm-workspace.yaml
  const hoverProvider = vscode.languages.registerHoverProvider(
    { pattern: '**/pnpm-workspace.yaml' },
    {
      async provideHover(document, position) {
        const line = document.lineAt(position.line).text;

        // Match package lines like "  '@babel/core': 7.25.2"
        const packageMatch = line.match(/^\s+(['"]?)(@?[\w\-/.]+)\1:\s*(.+)$/);
        if (!packageMatch) {
          return null;
        }

        const packageName = packageMatch[2];
        const version = packageMatch[3].trim();

        // Fetch package info from npm registry
        const packageInfo = await fetchPackageInfo(packageName);
        const latestVersion = packageInfo?.version || outdatedCache.get(packageName);

        // Create markdown with clickable links
        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;
        markdown.supportHtml = true;

        // Package description
        if (packageInfo?.description) {
          markdown.appendMarkdown(`${packageInfo.description}\n\n`);
        }

        // Latest version info
        if (latestVersion) {
          markdown.appendMarkdown(`**Latest version:** \`${latestVersion}\`\n\n`);
        }

        // Homepage link
        if (packageInfo?.homepage) {
          markdown.appendMarkdown(`${packageInfo.homepage}\n\n`);
        }

        markdown.appendMarkdown(`---\n\n`);

        // Show update link if there's a newer version
        if (latestVersion && latestVersion !== version && latestVersion !== version.replace(/^\^|~/, '')) {
          const updateArgs = encodeURIComponent(
            JSON.stringify({
              packageName,
              latestVersion,
              line: position.line,
              documentUri: document.uri.toString(),
            }),
          );
          markdown.appendMarkdown(`<u>[Update to ${latestVersion}](command:pnpm-catalog-manager.updateToLatest?${updateArgs})</u>\n\n`);
        }

        markdown.appendMarkdown(`[View on npm](https://www.npmjs.com/package/${packageName})\n\n`);
        markdown.appendMarkdown(`[Bundlephobia](https://bundlephobia.com/package/${packageName}@${version})`);

        return new vscode.Hover(markdown);
      },
    },
  );
  context.subscriptions.push(hoverProvider);

  // Command to refresh outdated packages cache
  const refreshCommand = vscode.commands.registerCommand('pnpm-catalog-manager.refresh', async () => {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.fileName.endsWith('pnpm-workspace.yaml')) {
      const workspaceRoot = path.dirname(editor.document.fileName);
      vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Checking for package updates...' }, async () => {
        outdatedCache = await fetchOutdatedPackages(workspaceRoot);
        cacheWorkspaceRoot = workspaceRoot;
        await updateDecorations(editor);
        vscode.window.showInformationMessage(`Found ${outdatedCache.size} outdated packages`);
      });
    }
  });
  context.subscriptions.push(refreshCommand);

  // Command to update a package to latest version
  const updateToLatestCommand = vscode.commands.registerCommand(
    'pnpm-catalog-manager.updateToLatest',
    async (args: { packageName: string; latestVersion: string; line: number; documentUri: string }) => {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(args.documentUri));
      const editor = await vscode.window.showTextDocument(document);

      const line = document.lineAt(args.line);
      const lineText = line.text;

      // Replace the version in the line
      const newLineText = lineText.replace(/^(\s+['"]?@?[\w\-/.]+['"]?:\s*).+$/, `$1${args.latestVersion}`);

      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, line.range, newLineText);
      await vscode.workspace.applyEdit(edit);
      await document.save();

      // Run pnpm install
      const workspaceRoot = path.dirname(document.fileName);
      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Installing ${args.packageName}@${args.latestVersion}...` },
        async () => {
          try {
            await execAsync('pnpm install', { cwd: workspaceRoot, timeout: 120000 });
            vscode.window.showInformationMessage(`Updated ${args.packageName} to ${args.latestVersion}`);

            // Remove from outdated cache since it's now up to date
            outdatedCache.delete(args.packageName);
            await updateDecorations(editor);
          } catch (error) {
            vscode.window.showErrorMessage(`Failed to install: ${error}`);
          }
        },
      );
    },
  );
  context.subscriptions.push(updateToLatestCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}
