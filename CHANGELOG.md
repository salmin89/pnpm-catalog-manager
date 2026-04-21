# Change Log

All notable changes to the "pnpm-catalog-manager" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.0.1] - 2025-04-21

### Changed

- Lowered minimum VS Code version requirement for broader compatibility

## [1.0.0] - 2025-04-21

### Added

- Initial release
- Version checking for pnpm catalog dependencies in `pnpm-workspace.yaml`
- Inline decorations showing outdated packages (orange) and up-to-date packages (green)
- Hover information with package description, latest version, and links to npm/Bundlephobia
- **Refresh Outdated Packages** command to manually refresh the outdated packages cache
- **Update Package to Latest** command with one-click update from hover tooltip
- Support for both `catalog:` and `catalogs:` (named catalogs) sections
- Automatic `pnpm install` after updating a package version
