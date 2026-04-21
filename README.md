# pnpm-catalog-manager

A Visual Studio Code extension for managing dependencies in pnpm workspace catalogs. It provides inline version information, update notifications, and quick actions for packages defined in your `pnpm-workspace.yaml` file.

## Features

![PNPM Catalog Manager in action](screenshot.png)

## Commands

Open the Command Palette (`Cmd+Shift+P` on macOS, `Ctrl+Shift+P` on Windows/Linux) and search for:

| Command                                   | Description                                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `PNPM Catalog: Refresh Outdated Packages` | Manually refresh the outdated packages cache. Use this after making changes outside of VS Code or to force a fresh check. |
| `PNPM Catalog: Update Package to Latest`  | Update a specific package to its latest version. This command is typically invoked via the hover tooltip.                 |

## Requirements

- **pnpm** must be installed and available in your PATH
- A valid `pnpm-workspace.yaml` file in your workspace

## How It Works

1. When you open a `pnpm-workspace.yaml` file, the extension runs `pnpm outdated -r --json` to fetch outdated package information
2. Results are cached per workspace to avoid repeated calls
3. Hover information is fetched on-demand from the npm registry and cached for performance
4. The cache is automatically refreshed when you switch workspaces

## Known Issues

- The extension relies on `pnpm outdated` which requires packages to be installed. If you have a fresh workspace without `node_modules`, run `pnpm install` first.
- Version decorations may take a moment to appear on first load while the outdated check runs.
